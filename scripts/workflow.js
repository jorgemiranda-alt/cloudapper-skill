// List, outline, back up, create and edit backend workflows through `API v3/Workflows` (references/workflow-tool.md).
// Run after ca.js (cloudapper_run passes the node templates and runs `validate` / `check-run` with records checks
// through validate-workflows.js / verify-workflow-run.js). Never runs or triggers a workflow. Never returns
// connector `Request` text. Writes need appId (= ca.appId) and the client guard, return `backup`, then read back.
// workflow = AutomationId or exact name. Refs in expressions: 'var:<name>', 'trigger:<field>', '<node name>:<field>'
// (field = label or internal name; 'Count'; 'id' = the whole record). Expression = { expr:'$0 + 1', args:[ref..] },
// { ref } for one ref, or a literal (record nodes store it plain; variable assignments get it as an expression).
// Specs (opts):
//   { action:'list' }  -> [{ id, name, seq, on, trigger, form }]
//   { action:'outline', workflow, ids? }  -> step tree lines (name [actionType] form [node id]); node = name or id in edits
//   { action:'backup', workflow }  -> the full object, saved by the runner to CLOUDAPPER_BACKUP_DIR
//   { action:'create', appId, name, trigger:{ type:'manual'|'scheduled'|'created'|'updated', form?, schedule?,
//       updatedField? }, variables:[{ name, type:'text'|'number'|'decimal'|'date'|'datetime' }], nodes:[node] }
//     node = { type, name, children?:[node], ... }: ASSIGN_VARIABLES { set:{ var: expr } };
//       LOOKUP_RECORD / LOOKUP_RECORDS { form, where:[{ field, op?:'=', value }], limit (RECORDS) };
//       FOREACH { source:<node name> } or { while: expr, max: expr }; ROUTER { children: ROUTE nodes };
//       ROUTE { condition?:'AND', rules:[{ left: expr, op?:'=', value }] }; CREATE_RECORD { form, set:{ field: expr } };
//       UPDATE_RECORD { form, id: expr | where, set }; TRANSFORM_RECORDS { source, form, set }; SAVE_RECORDS { source };
//       DEBUG_LOG { log:[expr] }. Record nodes on a child form add parent:{ form, field } (WP-032). Always saved off.
//     Refused (WP-031..085): reading a reference field, filtering on one, a string for a yes/no field, an expression
//     for a dropdown; a reference field is set only from { ref:'<node>:id' }.
//   { action:'set-assignment', appId, workflow, node, field, value }  field = record field or variable name
//   { action:'set-expression', appId, workflow, node, field, value }  field = filter/route rule field, or 'while'/'max'
//       Both check the new expression with validate-expression before saving.
//   { action:'validate', workflows:[id or name] }  -> validate-workflows.js findings (apiCheck on)
//   { action:'toggle', appId, workflow, on:true|false }  changes live behaviour: only when the user asks
//   { action:'check-run', workflow, runs?:3 }  last runs: status, times, failed/warned steps;
//       add since + checks:'<source>' for record checks (verify-workflow-run.js).

// pure:start (offline self-check: scripts/workflow.selftest.mjs)
// $n -> argument names, highest index first so $1 never eats the start of $10.
function substArgs(expr, names) {
  let out = String(expr);
  for (let i = names.length - 1; i >= 0; i--) out = out.split('$' + i).join(names[i]);
  const left = out.match(/\$\d+/);
  if (left) throw new Error(`Expression uses ${left[0]} but has ${names.length} args: ${expr}`);
  return out;
}
// Node ids: 's' + 13-digit epoch ms in the recent past, no run of five zeros (node-templates.md §1).
function nodeIds(n, now = Date.now(), taken = new Set()) {
  const out = []; let t = now - 600000 - (n + 1) * 7919; // all ids stay in the past, whatever n is
  for (let i = 0; i < n; i++) {
    t += 7919;
    while (/00000/.test(String(t)) || taken.has('s' + t)) t++;
    out.push('s' + t); taken.add('s' + t);
  }
  return out;
}
// pure:end

async function workflowTool(o = {}) {
  const ca = window.ca;
  if (!ca) throw new Error("Load ca.js first: run('ca.js', {}).");
  const A = ca.apiBase;
  const TRIG = '__TRIGGERRECORD', GLOB = '__GLOBALVARIABLES';
  const TRIGGERS = { manual: [4, 0, 'trigger-manual'], scheduled: [3, 0, 'trigger-scheduled'], created: [2, 1, 'trigger-record-created'], updated: [8, 4, 'trigger-record-updated'] };
  const TRIGGER_NAMES = Object.fromEntries(Object.entries(TRIGGERS).map(([k, v]) => [v[0], k]));
  const VAR_TYPES = { text: [4, 1], number: [4, 6], decimal: [4, 3], date: [11, 0], datetime: [3, 0] };
  const all = async () => (await ca.call('GET', A + 'v3/Workflows')).Result;
  const getWf = async k => {
    const l = await all(); const hits = l.filter(w => w.AutomationId === k || w.Name === k);
    if (hits.length !== 1) throw new Error(`Workflow ${k}: ${hits.length} matches; pass its AutomationId`);
    return (await ca.call('GET', A + 'v3/Workflows/' + hits[0].AutomationId)).Result;
  };
  const formList = (await ca.call('GET', A + 'v3/forms')).Result || [];
  const formOf = k => { const f = formList.find(x => x.Id === k || x.Title === k); if (!f) throw new Error('No form ' + k); return f; };
  const title = id => (formList.find(f => f.Id === id) || {}).Title || '';
  const fieldOf = (f, k) => { const x = (f.Fields || []).find(x => x.Name === k || x.Label === k); if (!x) throw new Error(`No field ${k} in ${f.Title}`); return x; };
  const walk = (n, fn, depth = 0, parent = null) => { fn(n, depth, parent); (n.children || []).forEach(c => walk(c, fn, depth + 1, n)); };
  const writeCheck = async () => {
    if (o.appId !== ca.appId) throw new Error(`Write refused: pass appId '${ca.appId}' (the app open in the window) after checking it is the intended (UAT) app.`);
    await ca.save('__none__', []).catch(e => { if (/Write refused/.test(e.message)) throw e; }); // client guard
  };
  const outline = wf => { const out = []; walk(wf.AutomationConfiguration.root, (n, d) => { const x = n.data || {};
    out.push('  '.repeat(d) + `${x.name || n.id} [${x.actionType || n.type}]` + (x.typeId && title(x.typeId) ? ' ' + title(x.typeId) : '') + (o.ids ? ' ' + n.id : '')); }); return out; };
  const summary = w => ({ id: w.AutomationId, name: w.Name, seq: w.Sequence, on: w.Status === 1, trigger: TRIGGER_NAMES[w.TriggerType] || w.TriggerType, form: title(w.TypeId) });

  if (!o.action || o.action === 'list') return (await all()).sort((a, b) => a.Sequence - b.Sequence).map(summary);
  if (o.action === 'outline') { const w = await getWf(o.workflow); return { ...summary(w), steps: outline(w) }; }
  if (o.action === 'backup') { const w = await getWf(o.workflow); return { ...summary(w), backupName: 'workflow-' + w.Name.replace(/[^\w-]+/g, '_'), backup: w }; }

  // ---- expression building, shared by create and edits. ctx: nodes by name -> { id, typeId, name }, gv, trigger form.
  const used = new Set(); // edits add the workflow's existing __argN__/__expN__ names
  const uniq = p => { let s; do s = `__${p}${100000 + Math.floor(Math.random() * 900000)}__`; while (used.has(s)); used.add(s); return s; };
  const arg = (ctx, ref) => {
    const i = ref.indexOf(':'); if (i < 1) throw new Error(`Bad ref ${ref}: use var:<name>, trigger:<field> or <node name>:<field>`);
    const src = ref.slice(0, i), key = ref.slice(i + 1);
    if (src === 'var') {
      const v = (ctx.gv.Fields || []).find(f => f.Name === key); if (!v) throw new Error('No workflow variable ' + key);
      return { a: { Field: key, FieldNodeId: GLOB + '.' + key, NodeId: GLOB, TypeId: ctx.gv.Id, ControlType: v.ControlType, DataType: v.DataType, Label: key }, chip: `Workflow Variables (Trigger) . ${key}` };
    }
    const node = src === 'trigger' ? { id: TRIG, typeId: ctx.triggerForm, name: 'Trigger' } : ctx.nodes[src];
    if (!node) throw new Error('No node named ' + src);
    if (node.dup) throw new Error(`Node name ${src} is used twice; refer to it by its node id`);
    const ft = title(node.typeId) || node.typeTitle || '';
    if (key === 'id') return { a: { Field: 'id', FieldNodeId: node.id, NodeId: node.id, TypeId: node.typeId, ControlType: 4, DataType: 1, Label: ft }, chip: `${ft} (${node.name}) . ${ft}` };
    if (key === 'Count') return { a: { Field: 'Count', FieldNodeId: node.id + '.Count', NodeId: node.id, TypeId: node.typeId, ControlType: 4, DataType: 6, Label: 'Count' }, chip: `${ft} (${node.name}) . Count` };
    const f = fieldOf(formOf(node.typeId), key);
    // A reference field read as a value resolves empty or shows blank (WP-033, WP-085): use a text copy or '<node>:id'.
    if (f.ControlType === 12) throw new Error(`${f.Label} is a reference field: compare a text field of the record, or use '<node>:id' (WP-085)`);
    const [ct, dt] = [33, 34, 38].includes(f.ControlType) ? [4, 1] : [f.ControlType, f.DataType]; // WP-031
    return { a: { Field: f.Name, FieldNodeId: node.id + '.' + f.Name, NodeId: node.id, TypeId: node.typeId, ControlType: ct, DataType: dt, Label: f.Label }, chip: `${ft} (${node.name}) . ${f.Label}` };
  };
  const isExpr = v => v && typeof v === 'object' && (v.expr !== undefined || v.ref);
  const lit = v => typeof v === 'string' ? JSON.stringify(v) : String(v);
  const expr = (ctx, v, named = true) => {
    if (!isExpr(v)) v = { expr: lit(v), args: [] };
    if (v.ref) v = { expr: '$0', args: [v.ref] };
    const parts = (v.args || []).map(r => arg(ctx, r));
    const names = parts.map(() => uniq('arg'));
    const e = { Expression: substArgs(v.expr, names), Arguments: parts.map((p, i) => ({ Name: names[i], ...p.a })), ExpressionText: substArgs(v.expr, parts.map(p => `[${p.chip}]`)), NodeDisplayText: '' };
    return named ? { Name: uniq('exp'), ...e } : e;
  };
  // Record nodes keep literals plain (designer does); booleans become an expression (a "true" string fails, WP note).
  const value = (ctx, v) => isExpr(v) || typeof v === 'boolean' ? expr(ctx, v) : v;
  // Value for a record field, shaped by the field's type (WP-034, WP-061, WP-085).
  const typed = (ctx, f, v, isRule) => {
    if ([1, 36].includes(f.ControlType) && typeof v === 'string') throw new Error(`${f.Label} is yes/no: pass true/false or a boolean expression ($0 == "true"), not the string "${v}"`);
    if (f.ControlType === 2 && (isExpr(v) || typeof v !== 'string')) throw new Error(`${f.Label} is a dropdown: pass the choice key as a plain string (WP-061, WP-085)`);
    if (f.ControlType === 12) {
      if (isRule) throw new Error(`${f.Label} is a reference field: filter on a text field of the record instead (WP-085)`);
      if (!(isExpr(v) && v.ref && /:id$/.test(v.ref))) throw new Error(`${f.Label} is a reference field: set it to a whole record, { ref:'<node>:id' } (WP-034)`);
    }
    return value(ctx, v);
  };
  const fieldEntry = (ctx, nodeId, form, k, v, isRule) => { const f = fieldOf(form, k);
    const ref = f.ControlType === 12 && !isRule ? (f.ReferenceTypeId || f.ReferenceTypeID) + '.' : '';
    return { Field: f.Name, FieldNodeId: nodeId + '.' + ref + f.Name, FieldAliasName: '', Label: f.Label, Permission: 0, Operator: '=', Value: typed(ctx, f, v, isRule), TypeId: form.Id, ControlType: f.ControlType, DataType: f.DataType }; };
  const rule = (ctx, nodeId, form, r) => ({ ...fieldEntry(ctx, nodeId, form, r.field, r.value, true), Operator: r.op || '=' });
  const idRule = (ctx, nodeId, form, v) => ({ Field: 'id', FieldNodeId: nodeId, FieldAliasName: '', Label: form.Title, Permission: 0, Operator: '=', Value: expr(ctx, v), TypeId: form.Id, ControlType: 4, DataType: 1 });
  const routeRule = (ctx, r) => { const left = expr(ctx, isExpr(r.left) ? r.left : { ref: r.left }, false);
    return { Field: { Expression: left.Expression, Arguments: left.Arguments }, FieldNodeId: (left.Arguments[0] || {}).FieldNodeId || '', FieldAliasName: '', Permission: 0, Operator: r.op || '=', Value: value(ctx, r.value) }; };
  const assign = (ctx, nodeId, k, v) => { const g = (ctx.gv.Fields || []).find(f => f.Name === k); if (!g) throw new Error('No workflow variable ' + k);
    const an = uniq('arg');
    return { Field: { Expression: an, Arguments: [{ Name: an, Field: k, FieldNodeId: nodeId + '.' + k, NodeId: nodeId, TypeId: ctx.gv.Id, ControlType: g.ControlType, DataType: g.DataType, Label: k }] },
      FieldNodeId: nodeId + '.' + k, FieldAliasName: '', Permission: 0, Operator: '=', Value: expr(ctx, v) }; };
  const checkExpr = async e => { const r = await ca.call('POST', A + 'v3/Workflows/validate-expression', { Value: e }); if (!r || !r.Success) throw new Error('validate-expression: ' + (r && r.Message) + ' :: ' + e.ExpressionText); };
  const ctxOf = wf => { const nodes = {};
    walk(wf.AutomationConfiguration.root, n => { const d = n.data || {}; if (n.id === TRIG) return;
      const me = { id: n.id, typeId: d.typeId, name: d.name || n.id, n }; nodes[n.id] = me; // by id always, by name when unique
      if (d.name && nodes[d.name]) nodes[d.name] = { ...nodes[d.name], dup: true }; else if (d.name) nodes[d.name] = me; });
    return { nodes, gv: wf.GlobalVariables || { Fields: [] }, triggerForm: wf.TypeId }; };

  // ---- edits of one node's assignment or rule
  if (o.action === 'set-assignment' || o.action === 'set-expression') {
    await writeCheck();
    const wf = await getWf(o.workflow); const backup = JSON.parse(JSON.stringify(wf));
    JSON.stringify(wf).replace(/__(arg|exp)\d+__/g, m => used.add(m));
    const ctx = ctxOf(wf); const t = ctx.nodes[o.node];
    if (!t || t.dup) throw new Error(`Node ${o.node}: ${t ? 'name used twice; pass its node id (action outline shows ids with ids:true)' : 'not found'}`);
    const tForm = formList.find(f => f.Id === t.typeId);
    const d = t.n.data; let e, target;
    const sameField = (x, f) => { const a0 = (x && x.Arguments && x.Arguments[0]) || {}; const name = typeof x === 'string' ? x : a0.Field;
      if (name === f || (typeof x !== 'string' && a0.Label === f)) return true; try { return t.typeId && formList.some(fm => fm.Id === t.typeId) && fieldOf(formOf(t.typeId), f).Name === name; } catch (_) { return false; } };
    if (o.action === 'set-assignment') {
      const list = d.entityFieldAssignment || []; const i = list.findIndex(a => sameField(a.Field, o.field));
      if (i < 0) throw new Error(`${o.node} has no assignment to ${o.field}`);
      if (d.actionType === 'ASSIGN_VARIABLES') { e = expr(ctx, o.value); list[i] = { ...list[i], Value: e }; }
      else { if (!tForm) throw new Error(`${o.node}: form not found`); list[i] = { ...list[i], ...fieldEntry(ctx, t.id, tForm, o.field, o.value) }; e = list[i].Value; }
      target = () => list[i];
    } else if (o.field === 'while' || o.field === 'max') {
      if (d.iterationMode !== 'WHILE') throw new Error(`${o.node} is not a WHILE loop`);
      const k = o.field === 'while' ? 'loopCondition' : 'maxIteration';
      e = expr(ctx, o.value); d[k] = e.Name; d[k + 'Variables'] = [e]; target = () => ({ Value: d[k + 'Variables'][0] });
    } else {
      const rules = (d.ruleSet && d.ruleSet.Rules) || []; const i = rules.findIndex(r => sameField(r.Field, o.field));
      if (i < 0) throw new Error(`${o.node} has no rule on ${o.field}`);
      e = rules[i].Field === 'id' ? expr(ctx, o.value) : typeof rules[i].Field === 'string' && tForm ? typed(ctx, fieldOf(tForm, rules[i].Field), o.value, true) : value(ctx, o.value); rules[i] ={ ...rules[i], Value: e, ...(o.op ? { Operator: o.op } : {}) }; target = () => rules[i];
    }
    if (e && typeof e === 'object') await checkExpr(e);
    await ca.wfPut(wf);
    const back = await getWf(wf.AutomationId); const bt = ctxOf(back).nodes[o.node];
    const got = bt && JSON.stringify(o.action === 'set-assignment' ? (bt.n.data.entityFieldAssignment || []).map(a => a.Value)
      : o.field === 'while' || o.field === 'max' ? bt.n.data[(o.field === 'while' ? 'loopCondition' : 'maxIteration') + 'Variables'] : ((bt.n.data.ruleSet || {}).Rules || []).map(r => r.Value));
    const ok = !!got && got.includes(JSON.stringify(target().Value));
    return { ok, action: o.action, workflow: wf.Name, node: o.node, field: o.field, expression: e && e.ExpressionText !== undefined ? e.ExpressionText : e,
      problems: ok ? [] : ['new value not found on read-back'], backupName: 'workflow-' + wf.Name.replace(/[^\w-]+/g, '_'), backup };
  }

  if (o.action === 'toggle') {
    if (typeof o.on !== 'boolean') throw new Error('toggle needs on:true or on:false');
    await writeCheck();
    const wf = await getWf(o.workflow); const backup = JSON.parse(JSON.stringify(wf));
    wf.Status = o.on ? 1 : 2; await ca.wfPut(wf);
    const back = await getWf(wf.AutomationId);
    return { ok: back.Status === wf.Status, workflow: wf.Name, on: back.Status === 1, note: 'This changes live behaviour.', backupName: 'workflow-' + wf.Name.replace(/[^\w-]+/g, '_'), backup };
  }

  if (o.action === 'check-run') {
    const wf = await getWf(o.workflow); const names = {};
    walk(wf.AutomationConfiguration.root, n => { names[n.id] = (n.data && n.data.name) || n.id; });
    const r = (await ca.call('POST', A + 'v3/auditlogs/workflows/fetch-execution-log', { AutomationId: wf.AutomationId, StartRow: 0, TotalRows: o.runs || 3 })).Result;
    const status = { 1: 'ok', 2: 'failed', 3: 'running' };
    return { workflow: wf.Name, on: wf.Status === 1, runs: (r.Items || r || []).map(x => { const nodes = typeof x.Nodes === 'string' ? JSON.parse(x.Nodes) : (x.Nodes || []);
      return { start: x.StartTime, end: x.EndTime, status: status[x.Status] || x.Status, ms: x.ElapsedTime,
        steps: nodes.filter(n => n.Status !== 1 || n.MessageLevel > 1).map(n => ({ step: names[n.NodeId] || n.NodeId, status: status[n.Status] || n.Status, msg: String(n.Message || '').slice(0, 160) })) }; }) };
  }

  if (o.action === 'create') {
    if (!o.name || !o.trigger || !Array.isArray(o.nodes)) throw new Error('create needs name, trigger and nodes');
    await writeCheck();
    const list = await all();
    if (list.some(w => w.Name === o.name)) throw new Error('A workflow named ' + o.name + ' exists');
    const T = TRIGGERS[o.trigger.type]; if (!T) throw new Error('trigger.type must be ' + Object.keys(TRIGGERS).join(', '));
    const tpl = k => { const t = (o.templates || {})[k]; if (!t) throw new Error('Missing node template ' + k + ' (run through cloudapper_run)'); return JSON.parse(JSON.stringify(t.node)); };
    const trigForm = o.trigger.form ? formOf(o.trigger.form) : null;
    if ((T[0] === 2 || T[0] === 8) && !trigForm) throw new Error('A record trigger needs trigger.form');
    const relations = (await ca.call('GET', A + 'v3/forms/forms-relation/apps/' + ca.appId)).Result || [];
    const gvId = crypto.randomUUID();
    const gv = { Id: gvId, AppId: ca.appId, ClientId: ca.clientId, Title: 'Workflow Variables', Fields: (o.variables || []).map(v => {
      const ty = VAR_TYPES[v.type || 'text']; if (!ty) throw new Error(`Variable ${v.name}: type must be ${Object.keys(VAR_TYPES).join(', ')}`);
      return { Name: v.name, Label: v.name, ControlType: ty[0], DataType: ty[1], SchemaId: gvId }; }) };
    // Pass 1: ids, names and forms in run order (refs may point only to earlier nodes; the validator checks that).
    const flat = []; const pre = (ns, parent) => ns.forEach(n => { flat.push({ n, parent }); pre(n.children || [], n); }); pre(o.nodes, null);
    const ids = nodeIds(flat.length);
    const ctx = { nodes: {}, gv, triggerForm: trigForm && trigForm.Id };
    flat.forEach(({ n }, i) => { if (!n.name || ctx.nodes[n.name]) throw new Error(`Every node needs a unique name (${n.name})`);
      ctx.nodes[n.name] = { id: ids[i], name: n.name, typeId: n.type === 'ASSIGN_VARIABLES' ? gvId : n.form ? formOf(n.form).Id : '' }; });
    flat.forEach(({ n }) => { if (n.type === 'FOREACH' && n.source) { const s = ctx.nodes[n.source]; if (!s) throw new Error('No source node ' + n.source); ctx.nodes[n.name].typeId = s.typeId; } });
    const TPL = { ASSIGN_VARIABLES: 'assign-set-field', LOOKUP_RECORD: 'lookup-record', LOOKUP_RECORDS: 'lookup-records-limit-filter', ROUTER: 'router', ROUTE: 'route-field-equals-field',
      CREATE_RECORD: 'create-record', UPDATE_RECORD: 'update-record', TRANSFORM_RECORDS: 'transform-records', SAVE_RECORDS: 'save-records', DEBUG_LOG: 'debug-log' };
    const CONTENT = ['ruleSet', 'entityFieldAssignment', 'variables', 'value', 'loopCondition', 'maxIteration', 'loopConditionVariables', 'maxIterationVariables', 'sourceNodeId', 'sourceNodeTypeId', 'typeId', 'filterMaxRowCount', 'parentTypeId', 'parentReferenceField'];
    const build = n => {
      const me = ctx.nodes[n.name]; const id = me.id;
      const k = n.type === 'FOREACH' ? (n.source ? 'foreach-data-source' : 'foreach-while-condition') : TPL[n.type];
      if (!k) throw new Error(`Node ${n.name}: type ${n.type} not supported`);
      const t = tpl(k); const d = t.data; CONTENT.forEach(x => delete d[x]); d.name = n.name;
      const form = me.typeId && n.type !== 'ASSIGN_VARIABLES' && n.type !== 'FOREACH' ? formOf(me.typeId) : null;
      // A node on a child form needs its parent settings, or the editor shows a blank Type of Record (WP-032).
      if (form && /RECORD/.test(n.type) && relations.some(r => r.ChildId === form.Id)) {
        if (!n.parent || !n.parent.form || !n.parent.field) throw new Error(`${n.name}: ${form.Title} is a child form; pass parent:{ form, field:<subform field> } (WP-032)`);
        const pf = formOf(n.parent.form); if (!relations.some(r => r.ParentId === pf.Id && r.ChildId === form.Id)) throw new Error(`${n.name}: ${pf.Title} is not the parent of ${form.Title}`);
        d.parentTypeId = pf.Id; d.parentReferenceField = fieldOf(pf, n.parent.field).Name;
      }
      const sets = () =>Object.entries(n.set || {}).map(([f, v]) => fieldEntry(ctx, id, form, f, v));
      switch (n.type) {
        case 'ASSIGN_VARIABLES': d.typeId = gvId; d.entityFieldAssignment = Object.entries(n.set || {}).map(([k2, v]) => assign(ctx, id, k2, v)); break;
        case 'LOOKUP_RECORDS': if (typeof n.limit !== 'number') throw new Error(`${n.name}: LOOKUP_RECORDS needs limit`); d.filterMaxRowCount = n.limit; // falls through
        case 'LOOKUP_RECORD': d.typeId = form.Id; d.fetchRecordOutput = 0; d.filterSorting = []; d.ruleSet = { Condition: n.condition || 'AND', Rules: (n.where || []).map(r => rule(ctx, id, form, r)) }; break;
        case 'FOREACH':
          if (n.source) Object.assign(d, { iterationMode: 'FOREACH', typeId: me.typeId, sourceNodeId: ctx.nodes[n.source].id, loopCondition: '', maxIteration: '' });
          else { if (n.while === undefined || n.max === undefined) throw new Error(`${n.name}: FOREACH needs source, or while and max`);
            const c = expr(ctx, n.while), m = expr(ctx, n.max);
            Object.assign(d, { iterationMode: 'WHILE', typeId: '', sourceNodeId: '', loopCondition: c.Name, maxIteration: m.Name, maxIterationVariables: [m], loopConditionVariables: [c] }); }
          break;
        case 'ROUTER': if ((n.children || []).some(c => c.type !== 'ROUTE')) throw new Error(`${n.name}: ROUTER children must be ROUTE nodes`); break;
        case 'ROUTE': d.ruleSet = { Condition: n.condition || 'AND', Rules: (n.rules || []).map(r => routeRule(ctx, r)) }; break;
        case 'CREATE_RECORD': d.typeId = form.Id; d.entityFieldAssignment = sets(); d.createUser = false; break;
        case 'UPDATE_RECORD': d.typeId = form.Id; d.entityFieldAssignment = sets(); d.createUser = false;
          d.ruleSet = { Condition: 'AND', Rules: n.id !== undefined ? [idRule(ctx, id, form, n.id)] : (n.where || []).map(r => rule(ctx, id, form, r)) };
          if (!d.ruleSet.Rules.length) throw new Error(`${n.name}: UPDATE_RECORD needs id or where`); break;
        case 'TRANSFORM_RECORDS': { const s = ctx.nodes[n.source]; if (!s) throw new Error(`${n.name}: no source ${n.source}`);
          Object.assign(d, { sourceNodeId: s.id, sourceNodeTypeId: s.typeId, typeId: form.Id, entityFieldAssignment: sets() }); break; }
        case 'SAVE_RECORDS': { const s = ctx.nodes[n.source]; if (!s) throw new Error(`${n.name}: no source ${n.source}`); d.sourceNodeId = s.id; d.createUser = false; break; }
        case 'DEBUG_LOG': d.variables = (n.log || []).map(v => { const e = expr(ctx, v); e.Arguments.forEach((a, i) => { a.ReplaceExpString = (e.ExpressionText.match(/\[([^\]]*)\]/g) || [])[i]?.slice(1, -1) || a.Label; }); return e; });
          d.value = d.variables.map(e => `<p>﻿${e.Name}﻿</p>`).join(''); d.editorType = 1; break;
      }
      return { id, type: t.type, data: d, children: (n.children || []).map(build) };
    };
    const trig = tpl(T[2]); delete trig.data.triggerRuleset; delete trig.data.scheduleExpression;
    Object.assign(trig.data, { triggerType: T[0], globalVariables: gv }, trigForm ? { typeId: trigForm.Id, triggeredOn: T[1] } : {});
    let ruleset = null;
    if (o.trigger.updatedField) { const f = fieldOf(trigForm, o.trigger.updatedField);
      ruleset = { Condition: 'AND', Rules: [{ Field: f.Name, FieldNodeId: TRIG + '.' + f.Name, FieldAliasName: '', Label: f.Label, Permission: 0, Operator: '=', Value: '_IsUpdated', TypeId: trigForm.Id, ControlType: f.ControlType, DataType: f.DataType }] };
      trig.data.triggerRuleset = ruleset; }
    if (T[0] === 3) { if (!o.trigger.schedule) throw new Error('scheduled trigger needs schedule (Quartz)'); trig.data.scheduleExpression = o.trigger.schedule; }
    const root = { ...trig, children: o.nodes.map(build) };
    // Workflow object: an existing one minus its identity (node-templates.md §2), with our values.
    const base = { ...(list.find(w => w.TriggerType === T[0]) || list[0] || {}) };
    for (const k of ['Id', 'AutomationId', 'Version', 'Sequence', 'CreatedAt', 'ModifiedAt', 'ModifiedBy', 'WebHookIdentifier', 'AccessIdentifier']) delete base[k];
    const body = { ...base, AppId: ca.appId, Name: o.name, Description: o.description || '', Instructions: '', Status: 2, TriggerType: T[0], TriggeredOn: T[1],
      TypeId: trigForm ? trigForm.Id : '', TriggerRuleset: ruleset, IsScheduleExpression: T[0] === 3, ScheduleExpression: T[0] === 3 ? o.trigger.schedule : '',
      ParentTypeId: '', ParentReferenceField: '', GlobalVariables: gv, AutomationConfiguration: { root } };
    if (JSON.stringify(body).includes('<NODE_') || JSON.stringify(body).includes('<ID_')) throw new Error('Template placeholder left in the body');
    const res = await ca.call('POST', A + 'v3/Workflows', body);
    const newId = (res && (res.Result && (res.Result.AutomationId || res.Result))) || '';
    const back = (await all()).find(w => w.Name === o.name);
    const problems = [];
    if (!back) problems.push('workflow not found on read-back');
    else { if (back.Status !== 2) problems.push('Status is ' + back.Status + ', expected 2 (off)');
      let c = 0; walk(back.AutomationConfiguration.root, () => c++); if (c !== flat.length + 1) problems.push(`read back ${c} nodes, sent ${flat.length + 1}`); }
    return { ok: !problems.length, id: back ? back.AutomationId : newId, name: o.name, on: false, problems, steps: back ? outline(back) : [],
      next: "Run action:'validate' on it, then open it once in the builder; the user starts any run." };
  }
  throw new Error("action must be list, outline, backup, create, set-assignment, set-expression, toggle or check-run (validate and check-run with checks run through cloudapper_run)");
}

await workflowTool(globalThis.CAE_OPTIONS || {});
