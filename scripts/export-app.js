// Read-only export of one app's structure into small local files plus a graphify graph (WP-045).
// Only sends GET requests. Never exports connector settings, expressions or credentials: a node
// keeps only id, name, action type and the form it works on.
//
// Run inside a signed-in App Studio or runtime page of the app (URL with /<clientId>/app/<appId>),
// the same way as validate-workflows.js. Start scripts/save_server.py first and pass its URL:
//   globalThis.CAE_OPTIONS = { saveUrl: 'http://127.0.0.1:8766/' };
// Playwright: the page's own PUT to localhost fails ("Failed to fetch"), and pasting this file into
// browser_run_code echoes all of it back. Use the loader in references/playwright-efficiency.md §3,
// which loads it from save_server.py and saves globalThis.__caeFiles from Node.
// Options:
//   saveUrl: '<save_server URL>'  write files there (default: none, only return the summary)
//   apiBase: '<cluster API base ending in /api/>'  when it can't be read from the page
//   since: <fingerprint from a previous app.json>  only export when something changed: returns
//          { fresh: true } and writes nothing if all form/workflow versions and menus/roles match
// Files written (flat names, the save server keeps basenames only):
//   app.json            forms, relations, menus, roles, workflow list in Sequence order
//   form__<title>.json  fields (name, label, type, reference target)
//   wf__<seq>__<name>.json  trigger form, status and node tree (id, name, actionType, typeId)
//   graph.json          graphify node-link graph: form, workflow, node, menu, role nodes
// Returns { summary, orderWarnings } where orderWarnings lists workflow pairs that look linked but
// sit in the wrong list order (WP-001).

async function exportApp(opts = {}) {
  const o = { ...opts };
  const m = location.pathname.match(/\/(\d{6,})\/app\/([0-9a-fA-F-]{36})/);
  if (!m) throw new Error('Open a page of the app first (URL with /<clientId>/app/<appId>).');
  const [, clientId, appId] = m;
  const apiBase = o.apiBase || (() => {
    const hit = performance.getEntriesByType('resource').map(e => e.name)
      .find(u => /^https:\/\/[^/]*api[^/]*\.cloudapper\.com\/api\/v3\/(Records|Apps|Workflows|forms)\b/i.test(u) && !/marketplace|design|report/.test(u));
    return hit ? hit.replace(/(\/api\/).*/, '$1') : null;
  })();
  if (!apiBase) throw new Error('Could not find the API host in the page; pass apiBase.');
  const token = (localStorage.getItem('accessToken') || '').replace(/"/g, '');
  const H = { authorization: 'Bearer ' + token, accept: 'application/json',
    'x-ca-client-id': clientId, 'x-ca-app-id': appId, 'x-ca-client-platform': '3', 'x-ca-client-version': '8.2.0.25' };
  const getJson = async path => {
    const r = await fetch(apiBase + path, { headers: H });
    if (!r.ok) throw new Error('GET ' + path + ' -> ' + r.status);
    return JSON.parse((await r.text()).replace(/"(Version|_version_)":(\d{15,})/g, '"$1":"$2"')).Result;
  };
  const slug = s => String(s || 'unnamed').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60);
  const files = {};

  // ---- read
  const details = await getJson(`v3/Apps/${appId}/details`);
  const workflows = (await getJson('v3/Workflows')) || [];
  workflows.sort((a, b) => (a.Sequence || 0) - (b.Sequence || 0));
  const schemas = details.Schemas || [];
  const formIds = new Set(schemas.map(f => f.Id));
  const formTitle = id => (schemas.find(f => f.Id === id) || {}).Title || id;
  // Menus and role privileges are matched to forms by any value that is a known form id,
  // so the export does not depend on their exact property names.
  const formRefs = obj => {
    const out = new Set();
    const walk = v => {
      if (typeof v === 'string') { if (formIds.has(v)) out.add(v); }
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(obj);
    return [...out];
  };

  // ---- freshness: forms and workflows carry a Version that changes on every save; menus, roles,
  // privileges and relations have none, so they share one hash.
  const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };
  const fingerprint = {
    forms: Object.fromEntries(schemas.map(f => [f.Title, String(f.Version)])),
    workflows: Object.fromEntries(workflows.map(w => [`#${w.Sequence} ${w.Name}`, String(w.Version)])),
    // The API returns menus in a different order on each call, so sort each list before hashing.
    other: hash(JSON.stringify([details.AllMenus || details.Menus, details.Roles, details.RecordRolePrivileges, details.ParentChildRelations]
      .map(l => (l || []).map(e => JSON.stringify(e)).sort()))),
  };
  let changed = null;
  if (o.since) {
    const diff = (a = {}, b = {}) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => a[k] !== b[k]);
    changed = [...diff(o.since.forms, fingerprint.forms).map(k => 'form ' + k),
      ...diff(o.since.workflows, fingerprint.workflows).map(k => 'workflow ' + k),
      ...(o.since.other !== fingerprint.other ? ['menus, roles or relations'] : [])];
    if (!changed.length) { globalThis.__caeFiles = {}; return { fresh: true }; }
  }

  // ---- graph
  const nodes = [], edges = [];
  const addNode = (id, label, kind, source_file) =>
    nodes.push({ id, label, file_type: 'code', kind, source_file, source_location: null });
  const addEdge = (source, target, relation, source_file) =>
    edges.push({ source, target, relation, confidence: 'EXTRACTED', confidence_score: 1.0, weight: 1.0, source_file, source_location: null });

  const forms = schemas.map(f => {
    const file = `form__${slug(f.Title)}.json`;
    const fields = (f.Fields || []).map(x => ({ name: x.Name, label: x.Label, type: x.ControlType,
      ref: x.ReferenceTypeId || x.ReferenceTypeID || null }));
    files[file] = { id: f.Id, title: f.Title, fields };
    addNode('form:' + f.Id, f.Title, 'form', file);
    return { f, file, fields };
  });
  for (const { f, file, fields } of forms) {
    for (const x of fields) if (x.ref && formIds.has(x.ref)) addEdge('form:' + f.Id, 'form:' + x.ref, 'references', file);
  }
  for (const r of details.ParentChildRelations || []) {
    const p = r.ParentId || r.parentId, c = r.ChildId || r.childId;
    if (formIds.has(p) && formIds.has(c)) addEdge('form:' + p, 'form:' + c, 'parent_of', 'app.json');
  }
  const menus = (details.AllMenus || details.Menus || []).map(mn => {
    const id = 'menu:' + (mn.MenuID || mn.Id || mn.Name);
    const label = mn.Name || mn.Title || mn.DisplayName || id;
    // Prefixed so a menu named like its form doesn't make graphify lookups ambiguous.
    addNode(id, 'menu: ' + label, 'menu', 'app.json');
    const targets = formRefs(mn);
    targets.forEach(t => addEdge(id, 'form:' + t, 'opens', 'app.json'));
    return { label, forms: targets.map(formTitle) };
  });
  const roles = (details.Roles || []).map(rl => {
    const rid = rl.Id || rl.RoleID || rl.RoleId;
    addNode('role:' + rid, 'role: ' + (rl.Name || rl.Title || rid), 'role', 'app.json');
    return { id: rid, name: rl.Name || rl.Title };
  });
  for (const p of details.RecordRolePrivileges || []) {
    const rid = p.RoleId || p.RoleID;
    formRefs(p).forEach(t => rid && addEdge('role:' + rid, 'form:' + t, 'can_access', 'app.json'));
  }

  const WRITES = new Set(['CREATE_RECORD', 'UPDATE_RECORD', 'DELETE_RECORDS']);
  const READS = new Set(['LOOKUP_RECORD', 'LOOKUP_RECORDS', 'TRANSFORM_RECORD', 'TRANSFORM_RECORDS']);
  const wfInfo = [];
  let nodeCount = 0;
  for (const w of workflows) {
    const file = `wf__${String(w.Sequence ?? 0).padStart(3, '0')}__${slug(w.Name)}.json`;
    const wid = 'wf:' + w.AutomationId;
    // Keep only scalar trigger settings (trigger type, event, schedule), never nested config.
    const trigger = Object.fromEntries(Object.entries(w).filter(([k, v]) => /trigger|event|schedule/i.test(k) && (v === null || typeof v !== 'object')));
    const writes = new Set();
    // SAVE_RECORDS has no form of its own: it saves what a Transform node built.
    const transforms = [];
    let saves = false;
    const tree = n => {
      nodeCount++;
      const d = n.data || {};
      const out = { id: n.id, name: d.name, type: d.actionType, form: d.typeId ? formTitle(d.typeId) : undefined };
      const nid = 'node:' + w.AutomationId + ':' + n.id;
      if (d.actionType === 'SAVE_RECORDS') saves = true;
      if (/^TRANSFORM_RECORDS?$/.test(d.actionType) && formIds.has(d.typeId)) transforms.push([nid, d.typeId]);
      addNode(nid, `${w.Name} / ${d.name || n.id}`, 'node:' + (d.actionType || 'UNKNOWN'), file);
      if (d.typeId && formIds.has(d.typeId)) {
        if (WRITES.has(d.actionType)) { addEdge(nid, 'form:' + d.typeId, 'writes', file); writes.add(d.typeId); }
        else if (READS.has(d.actionType)) addEdge(nid, 'form:' + d.typeId, 'reads', file);
      }
      const kids = (n.children || []).map(c => { addEdge(nid, 'node:' + w.AutomationId + ':' + c.id, 'next', file); return tree(c); });
      if (kids.length) out.children = kids;
      return out;
    };
    const root = w.AutomationConfiguration && w.AutomationConfiguration.root;
    addNode(wid, `#${w.Sequence} ${w.Name}`, 'workflow', file);
    if (w.TypeId && formIds.has(w.TypeId)) addEdge('form:' + w.TypeId, wid, 'triggers', file);
    if (root) addEdge(wid, 'node:' + w.AutomationId + ':' + root.id, 'starts', file);
    files[file] = { id: w.AutomationId, name: w.Name, sequence: w.Sequence, status: w.Status,
      triggerForm: w.TypeId ? formTitle(w.TypeId) : null, trigger, tree: root ? tree(root) : null };
    // ponytail: every Transform form in a workflow that saves counts as written; trace the saved
    // variable back to its Transform if a workflow transforms one form and saves another.
    if (saves) for (const [nid, fid] of transforms) { addEdge(nid, 'form:' + fid, 'writes', file); writes.add(fid); }
    wfInfo.push({ id: w.AutomationId, name: w.Name, seq: w.Sequence ?? 0, triggerForm: w.TypeId, writes, file });
  }

  // A workflow that writes form X can start a workflow triggered on X only if that one sits later
  // in the list (WP-001). Earlier ones are flagged; trigger conditions are not checked here.
  const orderWarnings = [];
  for (const a of wfInfo) for (const b of wfInfo) {
    if (a === b || !b.triggerForm || !a.writes.has(b.triggerForm)) continue;
    const ok = b.seq > a.seq;
    addEdge('wf:' + a.id, 'wf:' + b.id, ok ? 'may_trigger' : 'blocked_by_order', a.file);
    if (!ok) orderWarnings.push(`#${a.seq} ${a.name} writes ${formTitle(b.triggerForm)} but #${b.seq} ${b.name} sits earlier`);
  }

  files['app.json'] = { clientId, appId, exportedAt: new Date().toISOString(), fingerprint,
    forms: schemas.map(f => f.Title), menus, roles,
    workflows: wfInfo.map(w => ({ seq: w.seq, name: w.name, triggerForm: w.triggerForm ? formTitle(w.triggerForm) : null, file: w.file })) };
  files['graph.json'] = { directed: true, multigraph: false, graph: {}, nodes, links: edges, hyperedges: [] };

  // ---- write
  let written = 0;
  globalThis.__caeFiles = files; // read by the Playwright wrapper
  if (o.saveUrl) {
    for (const [name, data] of Object.entries(files)) {
      const r = await fetch(o.saveUrl.replace(/\/?$/, '/') + encodeURIComponent(name), { method: 'PUT', body: JSON.stringify(data, null, 1) });
      if (!r.ok) throw new Error('save ' + name + ' -> ' + r.status);
      written++;
    }
  }
  return { summary: { clientId, appId, forms: schemas.length, workflows: workflows.length, workflowNodes: nodeCount,
    menus: menus.length, roles: roles.length, graphNodes: nodes.length, graphEdges: edges.length, filesWritten: written },
    orderWarnings, ...(changed ? { changed } : {}) };
}

await exportApp(globalThis.CAE_OPTIONS || {});
