// Read-only verifier for a real workflow run (or a chain of workflows) on test records (WP-039).
// There is no dry-run mode, so a test is a real run started by the user; this script only reads the
// execution logs (POST v3/auditlogs/workflows/fetch-execution-log) and records (POST v3/Records/fetch).
// It never runs, triggers or writes anything.
//
// Run inside a signed-in runtime or App Studio page of the app (URL with /<clientId>/app/<appId>), as
// one script. Playwright: use the loader in references/playwright-efficiency.md §3 with the options
// below as its second argument and `checks` as a source string; never paste this file into a tool call.
// Claude in Chrome javascript_tool or the DevTools console: set globalThis.CAV_VERIFY, then paste the
// file. One javascript_tool call times out after 45 s.
// Options in globalThis.CAV_VERIFY:
//   chain:  [{ name, automationId }]  workflows in the order they should run
//   since:  ISO time just before the user started the run
//   expectRuns: { <name>: n }        optional exact run count per workflow (default: at least 1)
//   maxWaitMinutes: 30               after this long since `since`, a workflow with no run fails as "did not fire"
//   checks: async ctx => void         business checks; call ctx.check(name, pass, detail)
//   apiBase: '<cluster API base ending in /api/>'  when it can't be read from the page
// ctx gives: records(formTitle, rules?) -> rows whose keys are field LABELS (plus id, ParentId,
// CreateDate, LastModifyDate, and '<label> id' for references); eq({label: value}) builds an "=" filter;
// near(a, b, tol); check; runs; workflows (definitions by chain name).
// Write the expected values from the business rule, not from the nodes' formulas (WP-039).
// Example check: rows of a parent reconcile with its total.
//   checks: async ({ records, eq, near, check }) => {
//     for (const p of await records('<Parent form>', eq({ '<Batch field>': '<test value>' }))) {
//       const rows = await records('<Child form>', eq({ ParentId: p.id }));
//       const sum = rows.reduce((a, r) => a + (+r['<Amount>'] || 0), 0);
//       check('rows sum to the total', near(sum, p['<Total>'], 0.01), sum + ' vs ' + p['<Total>']);
//     }
//   }
// Returns { ready, runs, checks:[{name, pass, detail}], failed }. ready=false means a workflow of the
// chain is still running or has not run yet (runs of a triggered chain are queued, WP-005): wait and run it again.
// Never prints the token. Keep detail text free of personal data (use counts and amounts).

async function verifyWorkflowRun(o) {
  const m = location.pathname.match(/\/(\d{6,})\/app\/([0-9a-fA-F-]{36})/);
  if (!m) throw new Error('Open a page of the app first (URL with /<clientId>/app/<appId>).');
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
  const call = async (method, path, body) => {
    const r = await fetch(apiBase + 'v3/' + path, { method, headers: H, body: body && JSON.stringify(body) });
    if (!r.ok) throw new Error(method + ' ' + path + ' -> ' + r.status);
    return JSON.parse((await r.text()).replace(/"(Version|_version_)":(\d{15,})/g, '"$1":"$2"')).Result;
  };

  // ---- 1. runs of each workflow since the start, in order
  const since = new Date(o.since).getTime();
  const workflows = new Map();
  const runs = [];
  for (const step of o.chain) {
    // automationId may be the workflow's exact name (workflow.js check-run passes what the user gave).
    if (!/^[0-9a-f-]{36}$/i.test(step.automationId)) step.automationId = ((await call('GET', 'Workflows')).find(x => x.Name === step.automationId) || {}).AutomationId;
    if (!step.automationId) throw new Error('No workflow named ' + step.name);
    const w = await call('GET', 'Workflows/' + step.automationId);
    const names = new Map();
    const walk = n => { names.set(n.id, (n.data && n.data.name || '').trim()); (n.children || []).forEach(walk); };
    walk(w.AutomationConfiguration.root);
    workflows.set(step.name, w);
    // The log comes newest first; page until the entries are older than `since`.
    let items = [];
    for (let start = 0; ; start += 100) {
      const log = await call('POST', 'auditlogs/workflows/fetch-execution-log', { AutomationId: step.automationId, StartRow: start, TotalRows: 100 });
      const page = log.Items || [];
      items = items.concat(page.filter(i => new Date(i.StartTime).getTime() >= since));
      if (page.length < 100 || page.some(i => new Date(i.StartTime).getTime() < since)) break;
    }
    items.sort((a, b) => new Date(a.StartTime) - new Date(b.StartTime));
    for (const i of items) {
      const nodes = typeof i.Nodes === 'string' ? JSON.parse(i.Nodes) : (i.Nodes || []);
      runs.push({ workflow: step.name, start: i.StartTime, end: i.EndTime, status: +i.Status, ms: +i.ElapsedTime,
        // Status 1 ok, 2 failed, 3 running; MessageLevel 2 = warning
        notes: nodes.filter(x => x.Message || x.MessageLevel > 1 || x.Status !== 1)
          .map(x => (names.get(x.NodeId) || x.NodeId) + ': ' + String(x.Message || 'status ' + x.Status).slice(0, 120)) });
    }
  }

  const results = [];
  const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail === undefined ? '' : detail });
  const running = runs.filter(r => r.status === 3 || !r.end);
  const missing = o.chain.filter(s => !runs.some(r => r.workflow === s.name));
  // After maxWaitMinutes a workflow with no run did not fire: check its order, trigger rule and on/off (WP-001, WP-002).
  const timedOut = Date.now() - since > (o.maxWaitMinutes || 30) * 60000;
  const ready = !running.length && (!missing.length || timedOut);
  for (const s of o.chain) {
    const mine = runs.filter(r => r.workflow === s.name);
    const want = o.expectRuns && o.expectRuns[s.name];
    check('runs: ' + s.name, want === undefined ? mine.length >= 1 : mine.length === want,
      mine.length ? mine.length + ' run(s)' + (want !== undefined ? ', expected ' + want : '')
        : 'did not fire (check Sequence order, trigger rule, on/off: WP-001, WP-002)');
    check('no failed run: ' + s.name, mine.every(r => r.status !== 2), mine.filter(r => r.status === 2).length + ' failed');
  }
  // Each workflow's first run starts after the previous workflow's first run started (WP-001 order).
  for (let k = 1; k < o.chain.length; k++) {
    const a = runs.find(r => r.workflow === o.chain[k - 1].name), b = runs.find(r => r.workflow === o.chain[k].name);
    if (a && b) check('order: ' + o.chain[k - 1].name + ' -> ' + o.chain[k].name, new Date(b.start) >= new Date(a.start), '');
  }
  if (!ready) return { ready, runs, checks: results, failed: results.filter(r => !r.pass).length,
    waiting: running.map(r => r.workflow).concat(missing.map(s => s.name + ' (no run yet)')) };

  // ---- 2. business checks on the records
  const forms = new Map();
  for (const f of await call('GET', 'forms')) forms.set(f.Title, f);
  const records = async (title, rules) => {
    const f = forms.get(title);
    if (!f) throw new Error('No form titled ' + title);
    const byLabel = new Map((f.Fields || []).map(x => [x.Label, x.Name]));
    const toName = l => byLabel.get(l) || l;
    const filters = rules && rules.length ? [{ Condition: 'AND', Rules: rules.map(r => ({ ...r, Field: toName(r.Field) })) }] : [];
    let all = [], start = 0;
    for (;;) {
      const res = await call('POST', 'Records/fetch', { StartRow: start, TotalRows: 1000, SearchType: 0, TypeId: f.Id,
        FilterConfigurations: filters, SortConfigurations: [] });
      const items = res.Items || [];
      all = all.concat(items);
      if (items.length < 1000 || all.length >= res.Count) break;
      start += 1000;
    }
    return all.map(r => {
      const o2 = { id: r.id, ParentId: r.ParentId, CreateDate: r.CreateDate, LastModifyDate: r.LastModifyDate };
      for (const x of f.Fields || []) o2[x.Label] = r[x.Name];
      for (const x of f.Fields || []) if (r[x.Name + 'ReferenceId']) o2[x.Label + ' id'] = r[x.Name + 'ReferenceId'];
      return o2;
    });
  };
  const eq = obj => Object.entries(obj).map(([Field, Value]) => ({ Field, Operator: '=', Value }));
  const near = (a, b, tol = 0.01) => Math.abs(Number(a || 0) - Number(b || 0)) <= tol;
  try {
    await o.checks({ records, eq, near, check, runs, workflows });
  } catch (e) {
    check('checks script', false, String(e.message || e));
  }
  return { ready, runs, checks: results, failed: results.filter(r => !r.pass).length };
}

await verifyWorkflowRun(globalThis.CAV_VERIFY);
