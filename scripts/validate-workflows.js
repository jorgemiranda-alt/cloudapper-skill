// Read-only validator for backend workflow node JSON: finds what makes a node open in the
// builder with errors (blank Type of Record, raw __argN__ names, unknown identifier, unresolved
// paths) without opening each node. It only sends GET requests and the editor's own
// side-effect-free expression check (POST v3/Workflows/validate-expression).
//
// Run inside a signed-in App Studio page of the target app (any /studio/<clientId>/app/<appId>/...
// page), as one script: Claude in Chrome javascript_tool (paste the whole file) or the DevTools
// console (both allow the top-level await on the last line). For Playwright browser_evaluate,
// wrap the body in `async () => { ... }` and change the last line to `return await ...`.
// One javascript_tool call times out after 45 s: on a large app, filter with sequences or
// automationIds, or run once with apiCheck: false. Options go in globalThis.CAV_OPTIONS before it:
//   workflows: [..]      workflow objects to check instead of fetching (e.g. a builder's output before PUT)
//   automationIds: [..]  only these workflows (default: all)
//   sequences: [..]      only these list positions
//   names: [..]          only workflows whose name contains one of these (case-insensitive)
//   apiCheck: true       also send each expression to validate-expression (4 in parallel; ~330 took 25 s)
//   maxFindings: 200     cap the findings returned
//   includeInfo: false   also return info-level notes
//   apiBase: '<cluster API base ending in /api/>'  when it can't be read from the page
// Returns { summary, findings: [{ seq, workflow, node, nodeId, actionType, level, code, msg, path }] }.
// Never prints the token or connector settings; connector specs are skipped except their variables.

async function validateWorkflows(opts = {}) {
  const o = { apiCheck: true, maxFindings: 200, includeInfo: false, ...opts };
  const m = location.pathname.match(/\/(\d{6,})\/app\/([0-9a-fA-F-]{36})/);
  if (!m) throw new Error('Open an App Studio page of the app first (URL with /<clientId>/app/<appId>).');
  const [, clientId, appId] = m;
  // The page also calls other API hosts (e.g. an AI service), so take the host that served the app's
  // records, app details or workflows.
  const apiBase = o.apiBase || (() => {
    const hit = performance.getEntriesByType('resource').map(e => e.name)
      .find(u => /^https:\/\/[^/]*api[^/]*\.cloudapper\.com\/api\/v3\/(Records|Apps|Workflows|forms)\b/i.test(u) && !/marketplace|design|report/.test(u));
    return hit ? hit.replace(/(\/api\/).*/, '$1') : null;
  })();
  if (!apiBase) throw new Error('Could not find the API host in the page; pass apiBase.');
  const token = (localStorage.getItem('accessToken') || '').replace(/"/g, '');
  const H = { authorization: 'Bearer ' + token, 'content-type': 'application/json', accept: 'application/json',
    'x-ca-client-id': clientId, 'x-ca-app-id': appId, 'x-ca-client-platform': '3', 'x-ca-client-version': '8.2.0.25' };
  const getJson = async path => {
    const r = await fetch(apiBase + 'v3/' + path, { headers: H });
    if (!r.ok) throw new Error('GET ' + path + ' -> ' + r.status);
    return JSON.parse((await r.text()).replace(/"(Version|_version_)":(\d{15,})/g, '"$1":"$2"'));
  };

  // ---- reference data
  let workflows;
  if (o.workflows) {
    workflows = o.workflows.map(w => (typeof w === 'string' ? JSON.parse(w) : w));
  } else if (o.automationIds && o.automationIds.length) {
    workflows = [];
    for (const id of o.automationIds) workflows.push((await getJson('Workflows/' + id)).Result);
  } else {
    workflows = (await getJson('Workflows')).Result;
  }
  if (o.sequences) workflows = workflows.filter(w => o.sequences.includes(w.Sequence));
  if (o.names) workflows = workflows.filter(w => o.names.some(n => (w.Name || '').toLowerCase().includes(n.toLowerCase())));
  workflows.sort((a, b) => (a.Sequence || 0) - (b.Sequence || 0));
  const forms = new Map();
  for (const f of (await getJson('forms')).Result || []) {
    forms.set(f.Id, { title: f.Title, fields: new Map((f.Fields || []).map(x => [x.Name, x])) });
  }
  const relations = (await getJson('forms/forms-relation/apps/' + appId)).Result || [];
  const isRelation = (parent, child) => relations.some(r => r.ParentId === parent && r.ChildId === child);

  const GUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  const NODE_ID = /^s\d{13}$/;
  const TRIGGER = '__TRIGGERRECORD', GLOBALS = '__GLOBALVARIABLES';
  // Fields every record has, which are not in the form's Fields list.
  const SYSTEM_FIELDS = new Set(['id', 'Count', 'DisplayName', 'Status', 'CreatedBy', 'CreatedByName', 'CreatedDate',
    'ModifiedBy', 'ModifiedByName', 'ModifiedDate', 'DateCreated', 'DateModified', 'ParentId', 'Sum', 'Min', 'Max', 'Avg', 'CreateDate', 'LastModifyBy', 'LastModifyDate']);
  const isSystemField = f => SYSTEM_FIELDS.has(f) || /^subformList\d+Count$/.test(f); // child-record count of a subform field
  const KNOWN_TYPES = new Set(['1/0', '1/2', '2/0', '3/0', '4/1', '4/3', '4/6', '11/0', '12/0', '33/0', '34/0']);
  const RECORD_NODES = new Set(['LOOKUP_RECORD', 'LOOKUP_RECORDS', 'CREATE_RECORD', 'UPDATE_RECORD', 'DELETE_RECORDS',
    'TRANSFORM_RECORD', 'TRANSFORM_RECORDS']);

  const findings = [];
  const counts = { workflows: workflows.length, nodes: 0, expressions: 0, apiChecked: 0, error: 0, warn: 0, info: 0 };
  const apiQueue = [];

  for (const w of workflows) {
    const root = w.AutomationConfiguration && w.AutomationConfiguration.root;
    const add = (level, code, msg, node, path) => {
      counts[level]++;
      if (level === 'info' && !o.includeInfo) return;
      findings.push({ seq: w.Sequence, workflow: w.Name, node: node && node.data && node.data.name,
        nodeId: node && node.id, actionType: node && node.data && node.data.actionType, level, code, msg, path: path || '' });
    };
    if (!root) { add('error', 'NO_TREE', 'Workflow has no AutomationConfiguration.root'); continue; }
    const triggerForm = w.TypeId;
    const globalFields = new Set(((w.GlobalVariables && w.GlobalVariables.Fields) || []).map(f => f.Name));
    const globalFormId = w.GlobalVariables && w.GlobalVariables.Id;
    // Record types a node may use besides forms: the global variables and connector output schemas.
    const types = new Set([globalFormId]);

    // ---- index the tree: pre-order position, parent, ancestors
    const info = new Map(); let order = 0;
    const index = (n, parent, anc) => {
      if (info.has(n.id)) add('error', 'DUP_NODE_ID', 'Node id used twice', n);
      info.set(n.id, { n, parent, anc, order: order++, type: n.data && n.data.actionType });
      const spec = n.data && n.data.connectorSpec;
      for (const s of (spec && spec.CustomSchema) || []) if (s && s.Id) types.add(s.Id);
      (n.children || []).forEach(c => index(c, n, [...anc, n.id]));
    };
    index(root, null, []);
    counts.nodes += info.size;

    // A node may use another node that ran before it on the same path: earlier in pre-order and
    // not in a different route of a Router (siblings under any other node run one after another).
    const refProblem = (fromId, toId) => {
      const from = info.get(fromId), to = info.get(toId);
      if (!to) return 'refers to a node that does not exist';
      if (toId === fromId || from.anc.includes(toId)) return null;
      if (to.order > from.order) return 'refers to a node that runs later (' + (to.n.data && to.n.data.name) + ')';
      const lca = [...from.anc].reverse().find(a => to.anc.includes(a));
      if (lca && info.get(lca).type === 'ROUTER') return 'refers to a node in another route (' + (to.n.data && to.n.data.name) + ')';
      const loop = to.anc.find(a => info.get(a).type === 'FOREACH' && !from.anc.includes(a));
      if (loop) return 'loop:refers to a node inside a loop it is not part of (' + (to.n.data && to.n.data.name) + ')';
      return null;
    };
    const sourceForm = nodeId => {
      if (nodeId === TRIGGER) return triggerForm;
      const t = info.get(nodeId);
      return t && t.n.data && t.n.data.typeId;
    };
    const checkRef = (node, toId, path, what) => {
      const p = refProblem(node.id, toId);
      if (p) add(p.startsWith('loop:') ? 'warn' : 'error', 'BAD_REF', what + ' ' + p.replace(/^loop:/, ''), node, path);
    };

    const checkArg = (node, a, path, nested) => {
      const nid = String(a.NodeId || ''), fnid = String(a.FieldNodeId || '');
      if (!nested) {
        if (nid === GLOBALS) {
          const name = fnid.slice(GLOBALS.length + 1);
          if (globalFields.size && !globalFields.has(name)) add('error', 'UNKNOWN_GLOBAL', 'Global variable "' + name + '" does not exist', node, path);
        } else if (nid !== TRIGGER) {
          if (!NODE_ID.test(nid)) { add('error', 'BAD_NODEID', 'Argument NodeId "' + nid + '" is not a node id', node, path); return; }
          checkRef(node, nid, path, 'Argument');
        }
        if (fnid !== nid && !fnid.startsWith(nid + '.')) add('error', 'FIELDNODEID_MISMATCH', 'FieldNodeId does not start with its NodeId', node, path);
      }
      if (/\.id$/.test(fnid) && !fnid.includes('$')) add('error', 'TRAILING_ID', 'FieldNodeId ends in ".id"; use the node id with Field "id" (WP-033)', node, path);
      if (a.TypeId && /[0-9a-fA-F]{8}-/.test(a.TypeId) && !GUID.test(a.TypeId)) add('error', 'SHORT_TYPEID', 'Argument TypeId is not a full GUID', node, path);
      const ct = a.ControlType + '/' + a.DataType;
      if (a.ControlType === 38) add('error', 'ARG_TYPE', 'Argument ControlType 38 has no value type; use 4/1 text (WP-031)', node, path);
      else if (!KNOWN_TYPES.has(ct)) add('warn', 'ARG_TYPE', 'Unusual argument ControlType/DataType ' + ct, node, path);

      if (a.Field && typeof a.Field === 'object') {
        // Reference or aggregate: { Expression, Arguments: [inner] } on a reference field.
        const parts = fnid.split('.').slice(nid === GLOBALS || nid === TRIGGER || NODE_ID.test(nid) ? 1 : 0);
        const g = parts.find(x => GUID.test(x));
        if (g && !forms.has(g) && !types.has(g)) add('error', 'UNKNOWN_FORM', 'Reference path names a form that does not exist', node, path);
        for (const [i, inner] of (a.Field.Arguments || []).entries()) {
          if (!String(inner.FieldNodeId || '').startsWith(fnid + '.')) add('warn', 'NESTED_PATH', 'Inner FieldNodeId does not extend the outer one', node, path + '.Field.Arguments[' + i + ']');
          checkArg(node, inner, path + '.Field.Arguments[' + i + ']', true);
        }
        return;
      }
      if (nested || fnid.includes('$')) return; // connector JSON paths and inner args: shape only
      const rest = fnid === nid ? [] : fnid.slice(nid.length + 1).split('.');
      if (rest.length === 0) {
        if (a.Field !== 'id') add('warn', 'WHOLE_RECORD', 'FieldNodeId is the bare node id but Field is "' + a.Field + '" (expected "id")', node, path);
        return;
      }
      const last = rest[rest.length - 1];
      if (a.Field !== last && !(rest.length > 1 && GUID.test(rest[0]))) add('error', 'FIELD_MISMATCH', 'Field "' + a.Field + '" does not match the end of FieldNodeId', node, path);
      if (nid === GLOBALS) return;
      const formId = sourceForm(nid);
      const form = formId && forms.get(formId);
      if (rest.length === 1 && form && !isSystemField(last) && !form.fields.has(last)) {
        add('error', 'UNKNOWN_FIELD', 'Field "' + last + '" is not on form "' + form.title + '"', node, path);
      }
      if (rest.length > 1 && GUID.test(rest[0])) {
        if (rest.length === 2 && rest[0] === formId && forms.has(formId)) add('error', 'OWN_FORM_ID', 'Plain field written with its own form id; write <node>.<field> (WP-033)', node, path);
        if (rest.length > 2) add('error', 'SINGLE_LAYER_REF', 'Field inside a referenced record written as one argument; it resolves to empty. Use the two-layer argument (WP-033)', node, path);
        if (!forms.has(rest[0]) && !types.has(rest[0])) add('error', 'UNKNOWN_FORM', 'Reference path names a form that does not exist', node, path);
        else if (form && rest[1] && !form.fields.has(rest[1]) && !isSystemField(rest[1])) add('error', 'UNKNOWN_FIELD', 'Reference field "' + rest[1] + '" is not on form "' + form.title + '"', node, path);
      } else if (rest.length > 1 && form && GUID.test(String(formId))) {
        add('warn', 'PATH_SHAPE', 'Multi-part FieldNodeId without a form id after the node (designer writes <node>.<field> or <node>.<RefFormId>.<field>)', node, path);
      }
    };

    const checkExpression = (node, e, path) => {
      counts.expressions++;
      const args = e.Arguments || [];
      const used = e.Expression.match(/__arg\w+?__/g) || [];
      const declared = new Set(args.map(a => a.Name));
      for (const u of new Set(used)) if (!declared.has(u)) add('error', 'UNDECLARED_ARG', u + ' is used but not in Arguments', node, path);
      for (const a of args) if (!used.includes(a.Name)) add('warn', 'UNUSED_ARG', a.Name + ' is declared but not used', node, path);
      if (args.length && !e.Expression.trim()) add('error', 'EMPTY_EXPRESSION', 'Expression is empty but has arguments', node, path);
      const single = /^__arg\w+?__$/.test(e.Expression.trim());
      const isLeftSide = /\.Field$/.test(path);
      if (args.length && !single && !isLeftSide && !e.ExpressionText) {
        add('error', 'NO_EXPRESSION_TEXT', 'Expression with operators has no ExpressionText; the editor shows raw __argN__ names (WP-030)', node, path);
      } else if (e.ExpressionText) {
        const chips = (e.ExpressionText.match(/\[[^\]]*\]/g) || []).length;
        if (chips < used.length) add('warn', 'EXPRESSION_TEXT_CHIPS', 'ExpressionText has ' + chips + ' field chips for ' + used.length + ' arguments', node, path);
      }
      args.forEach((a, i) => checkArg(node, a, path + '.Arguments[' + i + ']', false));
      if (o.apiCheck && e.Expression.trim()) apiQueue.push({ node, e, path, add });
    };

    const walk = (node, v, path) => {
      if (!v || typeof v !== 'object') return;
      if (typeof v.Expression === 'string' && Array.isArray(v.Arguments)) { checkExpression(node, v, path); return; }
      for (const k of Object.keys(v)) {
        if (k === 'children' || k === 'connectors') continue;
        if (k === 'connectorSpec') { // only the variables; the rest can hold credentials
          (v[k].Properties || []).forEach((p, i) => walk(node, p.Variables, path + '.connectorSpec.Properties[' + i + '].Variables'));
          continue;
        }
        walk(node, v[k], path + (Array.isArray(v) ? '[' + k + ']' : (path ? '.' : '') + k));
      }
    };

    for (const { n, parent, type } of info.values()) {
      const d = n.data || {};
      if (n.id !== TRIGGER && !NODE_ID.test(n.id)) add('warn', 'NODE_ID_FORMAT', 'Node id is not "s" + 13 digits', n);
      if (type === 'ROUTE' && (!parent || parent.data.actionType !== 'ROUTER')) add('error', 'ROUTE_PARENT', 'ROUTE is not directly under a ROUTER', n);
      if (type === 'ROUTER') for (const c of n.children || []) if (c.data.actionType !== 'ROUTE') add('error', 'ROUTER_CHILD', 'ROUTER child "' + c.data.name + '" is not a ROUTE', n);
      if (type === 'ROUTER' && !(n.children || []).length) add('warn', 'ROUTER_EMPTY', 'ROUTER has no routes', n);
      const nodeType = ['TRIGGER', 'FOREACH', 'ROUTER', 'ROUTE'].includes(type) ? type : 'ACTION';
      if (n.type !== nodeType) add('error', 'NODE_TYPE', 'Node type "' + n.type + '" should be "' + nodeType + '" for ' + type + ' (WP-035)', n, 'type');

      // Type of Record
      if (d.typeId) {
        if (!GUID.test(d.typeId)) add('error', 'SHORT_TYPEID', 'typeId is not a full GUID; the editor shows a blank Type of Record', n, 'typeId');
        else if (!forms.has(d.typeId) && !types.has(d.typeId) && type !== 'TRIGGER') add('error', 'UNKNOWN_TYPEID', 'typeId is not a form or connector output of this app (deleted form?); the editor shows a blank Type of Record', n, 'typeId');
      } else if (RECORD_NODES.has(type)) add('error', 'NO_TYPEID', 'Record node has no typeId', n, 'typeId');

      // Child-form lookups: parent settings must describe a real parent-child relation (WP-032)
      if ('parentTypeId' in d || 'parentReferenceField' in d) {
        if (d.parentTypeId) {
          if (!isRelation(d.parentTypeId, d.typeId)) add('error', 'PARENT_RELATION', 'parentTypeId is not the parent of this typeId; the editor shows a blank Type of Record (WP-032)', n, 'parentTypeId');
          const pf = forms.get(d.parentTypeId);
          if (pf && d.parentReferenceField && !pf.fields.has(d.parentReferenceField)) add('error', 'PARENT_FIELD', 'parentReferenceField is not a field of the parent form', n, 'parentReferenceField');
          if (!d.parentReferenceField) add('warn', 'PARENT_FIELD', 'parentTypeId set without parentReferenceField', n, 'parentReferenceField');
        } else if (d.parentReferenceField) add('error', 'PARENT_FIELD', 'parentReferenceField set without parentTypeId', n, 'parentReferenceField');
      }

      // Nodes that read another node's output
      for (const k of ['sourceNodeId']) if (d[k]) {
        if (!NODE_ID.test(d[k]) && d[k] !== TRIGGER) add('error', 'BAD_REF', k + ' is not a node id', n, k);
        else if (d[k] !== TRIGGER) checkRef(n, d[k], k, k);
      }
      if (type === 'FOREACH' && d.iterationMode === undefined) add('warn', 'FOREACH_MODE', 'FOREACH has no iterationMode', n);

      // Filters
      const rules = (d.ruleSet && d.ruleSet.Rules) || [];
      rules.forEach((r, i) => {
        const p = 'ruleSet.Rules[' + i + ']';
        if (r.Rules) return; // nested group: checked by walk for expressions only
        const op = r.Operator;
        if (op === undefined || op === null || op === '') add('error', 'RULE_OPERATOR', 'Filter rule has no Operator', n, p);
        else if (/contains/i.test(op)) add('warn', 'CONTAINS_FILTER', 'Filter uses "' + op + '"; it matches words, not text. Use "=" for an exact match (WP-036)', n, p);
        else if (String(op).trim() === '') {
          // A space in a lookup or delete filter is ignored: the node reads every record (WP-040).
          if (/^(LOOKUP_RECORDS?|DELETE_RECORDS)$/.test(type)) add('error', 'RULE_OPERATOR', 'Operator is a space, so this filter is ignored and the node reads every record; write "=" (WP-040)', n, p);
          else add('info', 'RULE_OPERATOR', 'Operator is a single space (older equals); write "=" in new nodes (WP-034, WP-040)', n, p);
        }
        const noValueOps = /empty|null|blank/i;
        const v = r.Value;
        const emptyValue = v === undefined || v === null || v === '' || (typeof v === 'object' && typeof v.Expression === 'string' && !v.Expression.trim());
        if (emptyValue && !noValueOps.test(String(op))) add('error', 'EMPTY_FILTER_VALUE', 'Filter rule has an empty value', n, p);
        if (typeof r.Field === 'string' && RECORD_NODES.has(type)) {
          const form = forms.get(d.typeId);
          if (r.Field === 'id') {
            if (r.FieldNodeId !== n.id) add('warn', 'ID_FILTER', 'id filter FieldNodeId is not the node\'s own id (WP-034)', n, p);
            if (form && r.Label && r.Label !== form.title) add('warn', 'ID_FILTER', 'id filter Label "' + r.Label + '" is not the form title "' + form.title + '" (WP-034)', n, p);
          } else if (form && !isSystemField(r.Field) && !form.fields.has(r.Field)) {
            add('error', 'UNKNOWN_FIELD', 'Filter field "' + r.Field + '" is not on form "' + form.title + '"', n, p);
          }
        }
      });

      // Assignments on record nodes: the target field must exist on the node's form
      if (Array.isArray(d.entityFieldAssignment) && RECORD_NODES.has(type)) {
        const form = forms.get(d.typeId);
        d.entityFieldAssignment.forEach((fa, i) => {
          const tgt = typeof fa.Field === 'string' ? fa.Field : null;
          if (form && tgt && !isSystemField(tgt) && !form.fields.has(tgt)) add('error', 'UNKNOWN_FIELD', 'Assigned field "' + tgt + '" is not on form "' + form.title + '"', n, 'entityFieldAssignment[' + i + ']');
          if (fa.Value === undefined || fa.Value === null) add('warn', 'EMPTY_ASSIGNMENT', 'Assignment has no Value', n, 'entityFieldAssignment[' + i + ']');
        });
      }

      walk(n, d, '');
    }
  }

  // ---- the editor's own expression check
  const ENDPOINT = apiBase + 'v3/Workflows/validate-expression';
  const worker = async () => {
    for (let job; (job = apiQueue.shift());) {
      try {
        const r = await fetch(ENDPOINT, { method: 'POST', headers: H, body: JSON.stringify({ Value: job.e }) });
        const j = await r.json();
        counts.apiChecked++;
        if (!j.Success) job.add('error', 'API_EXPRESSION', 'validate-expression: ' + j.Message, job.node, job.path);
      } catch (err) { job.add('warn', 'API_UNREACHABLE', 'validate-expression call failed: ' + err.message, job.node, job.path); }
    }
  };
  await Promise.all([1, 2, 3, 4].map(worker));

  const levelRank = { error: 0, warn: 1, info: 2 };
  findings.sort((a, b) => a.seq - b.seq || levelRank[a.level] - levelRank[b.level]);
  const byCode = {};
  for (const f of findings) byCode[f.level + ' ' + f.code] = (byCode[f.level + ' ' + f.code] || 0) + 1;
  return { summary: { ...counts, byCode, truncated: findings.length > o.maxFindings }, findings: findings.slice(0, o.maxFindings) };
}

await validateWorkflows(globalThis.CAV_OPTIONS || {});
