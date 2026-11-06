// Installs window.ca: short API helpers so later calls are one line and return only what you ask for.
//
// Load once per page with the loader in references/playwright-efficiency.md §3 (`run('ca.js', {})`),
// then call e.g. `await ca.find('Discipline Tickets', r => r.stringField3 === 'New', ['integerField1'])`
// from browser_evaluate. Lost on page reload: reload it then. Returns the helper names.
// Options: apiBase / designBase when they can't be read from the page.
// Helpers read freely; the write helpers (save, wfPut) refuse to run when the page client differs
// from opts.client (set it with ca.setClient('<clientId>') before writing).

async function installCa(opts = {}) {
  const m = location.pathname.match(/\/(\d{6,})\/app\/([0-9a-fA-F-]{36})/);
  if (!m) throw new Error('Open a page of the app first (URL with /<clientId>/app/<appId>).');
  const [, clientId, appId] = m;
  const hosts = performance.getEntriesByType('resource').map(e => e.name);
  const apiBase = opts.apiBase || (hosts.find(u => /^https:\/\/[^/]*api[^/]*\.cloudapper\.com\/api\/v3\//i.test(u) && !/marketplace|design|report/.test(u)) || '').replace(/(\/api\/).*/, '$1');
  if (!apiBase) throw new Error('Could not find the API host in the page; pass apiBase.');
  const designBase = opts.designBase || apiBase.replace(/-api\./, '-designapi.');
  const H = () => ({ authorization: 'Bearer ' + (localStorage.getItem('accessToken') || '').replace(/"/g, ''),
    accept: 'application/json', 'content-type': 'application/json', 'x-ca-client-id': clientId, 'x-ca-app-id': appId,
    'x-ca-client-platform': '3', 'x-ca-client-version': '8.2.0.25' });
  // 19-digit Version/_version_ values lose precision in JSON.parse: keep them as strings.
  const parse = t => JSON.parse(t.replace(/("(?:Version|_version_)"\s*:\s*)(\d{15,})/g, '$1"$2"'));
  const unquote = s => s.replace(/("(?:Version|_version_)"\s*:\s*)"(\d{15,})"/g, '$1$2');
  const call = async (method, url, body) => {
    const r = await fetch(url, { method, headers: H(), body: body === undefined ? undefined : unquote(JSON.stringify(body)) });
    const t = await r.text();
    if (!r.ok) throw new Error(`${method} ${url.replace(/^https:\/\/[^/]+/, '')} -> ${r.status} ${t.slice(0, 200)}`);
    return t ? parse(t) : null;
  };
  let allowedClient = null;
  const guard = () => { if (allowedClient !== clientId) throw new Error(`Write refused: page client ${clientId}; call ca.setClient('${clientId}') if this is the right one.`); };
  let details = null;
  const formId = async name => {
    if (/^[0-9a-f-]{36}$/i.test(name)) return name;
    details = details || (await call('GET', apiBase + `v3/Apps/${appId}/details`)).Result;
    const f = details.Schemas.find(s => s.Title === name);
    if (!f) throw new Error('No form ' + name);
    return f.Id;
  };
  const pick = (r, fields) => fields ? Object.fromEntries(['id', ...fields].map(k => [k, r[k]])) : r;

  const ca = {
    clientId, appId, apiBase, designBase, call, parse,
    setClient: c => { allowedClient = String(c); return 'writes allowed for ' + c; },
    // All records of a form (paged, up to max), optionally filtered by a predicate, trimmed to fields.
    async find(form, where, fields, max = 5000) {
      const TypeId = await formId(form); const out = [];
      for (let s = 0; s < max; s += 1000) {
        const res = (await call('POST', apiBase + 'v3/Records/fetch', { StartRow: s, TotalRows: 1000, SearchType: 0, TypeId, FilterConfigurations: [], SortConfigurations: [] })).Result;
        for (const r of res.Items) if (!where || where(r)) out.push(pick(r, fields));
        if (s + 1000 >= res.Count) break;
      }
      return out;
    },
    async count(form, where) { return where ? (await ca.find(form, where, [])).length
      : (await call('POST', apiBase + 'v3/Records/fetch', { StartRow: 0, TotalRows: 1, SearchType: 0, TypeId: await formId(form), FilterConfigurations: [], SortConfigurations: [] })).Result.Count; },
    // Update or create records: items [{id?, _version_?, field: value}]; batches of 20. Returns per-item status (2 = rejected, WP-070).
    async save(form, items) {
      guard(); const TypeId = await formId(form); const out = [];
      for (let i = 0; i < items.length; i += 20) {
        const res = await call('POST', apiBase + 'v3/Records?records-required=true', { Items: items.slice(i, i + 20).map(x => ({ TypeId, ...x })) });
        for (const it of (res.Result || res.Items || [])) out.push({ id: it.id ?? it.Id, status: it.Status });
      }
      return out;
    },
    forms: async () => { details = details || (await call('GET', apiBase + `v3/Apps/${appId}/details`)).Result; return details.Schemas.map(s => ({ id: s.Id, title: s.Title })); },
    fields: async form => { await formId(form); return details.Schemas.find(s => s.Id === (form.length === 36 ? form : details.Schemas.find(x => x.Title === form).Id)).Fields.map(f => ({ name: f.Name, label: f.Title || f.Label, type: f.Type })); },
    // Workflows: list (summary), get one (full object, keep it in a variable, don't return it), put back.
    wfList: async () => (await call('GET', apiBase + 'v3/Workflows')).Result.map(w => ({ id: w.AutomationId, name: w.Name, seq: w.Sequence, on: w.IsActive })),
    wfGet: async name => (await call('GET', apiBase + 'v3/Workflows')).Result.find(w => w.Name === name || w.AutomationId === name),
    async wfPut(wf) { guard(); return (await call('PUT', apiBase + 'v3/Workflows/' + wf.AutomationId, wf)) ? 'saved' : 'empty response'; },
    // Step outline of a workflow: [{path, id, name, type}] without configs.
    wfSteps(wf) {
      const out = []; const walk = (n, p) => { if (!n || typeof n !== 'object') return;
        if (n.NodeId || n.Id) out.push({ path: p, id: n.NodeId || n.Id, name: n.Name || n.Title, type: n.Type || n.NodeType });
        for (const [k, v] of Object.entries(n)) if (v && typeof v === 'object' && !/Config|Request|Response/i.test(k)) walk(v, p + '.' + k); };
      walk(typeof wf.AutomationConfiguration === 'string' ? JSON.parse(wf.AutomationConfiguration) : wf.AutomationConfiguration, '$');
      return out;
    },
    validate: async (expression, extra = {}) => (await call('POST', apiBase + 'v3/Workflows/validate-expression', { Expression: expression, ...extra })),
    // Last run of a workflow: times, status (1 ok, 2 failed, 3 running) and failed steps only.
    async lastRun(name) {
      const id = /^[0-9a-f-]{36}$/i.test(name) ? name : (await ca.wfGet(name)).AutomationId;
      const r = (await call('POST', apiBase + 'v3/auditlogs/workflows/fetch-execution-log', { AutomationId: id, StartRow: 0, TotalRows: 1 })).Result;
      const x = (r.Items || r)[0]; if (!x) return null;
      return { start: x.StartTime, end: x.EndTime, status: x.Status, failed: (x.Nodes || []).filter(n => n.Status === 2).map(n => ({ name: n.Name, msg: String(n.Message || n.Error || '').slice(0, 200) })) };
    },
  };
  window.ca = ca;
  return Object.keys(ca);
}

await installCa(globalThis.CAE_OPTIONS || {});
