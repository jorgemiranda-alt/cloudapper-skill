// Read-only: which forms have field X and which backend workflow nodes use it.
// Only sends GET requests. Returns names only, never node settings or expressions.
//
// Run in a signed-in page of the app (URL with /<clientId>/app/<appId>), with the Playwright loader
// in references/playwright-efficiency.md. Options in globalThis.CAE_OPTIONS:
//   field: '<label or internal name>'  required, case-insensitive exact match
//   apiBase: '<cluster API base ending in /api/>'  when it can't be read from the page
// Returns { matches: [{ form, name, label, type }], uses: [{ seq, workflow, node, actionType }] }.
// A node counts as a use when its settings mention the internal name and it (or its workflow's
// trigger) is on that form.
// ponytail: text match on settings, so a field read through a reference path from another form is
// missed; walk expressions per node if that matters.

async function findField(opts = {}) {
  const o = { ...opts };
  if (!o.field) throw new Error('Pass CAE_OPTIONS.field');
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

  const want = o.field.toLowerCase();
  const schemas = (await getJson(`v3/Apps/${appId}/details`)).Schemas || [];
  const matches = [];
  for (const f of schemas) for (const x of f.Fields || []) {
    if ([x.Name, x.Label].some(v => String(v || '').toLowerCase() === want))
      matches.push({ form: f.Title, formId: f.Id, name: x.Name, label: x.Label, type: x.ControlType });
  }

  const uses = [];
  const workflows = (await getJson('v3/Workflows')) || [];
  for (const w of workflows) {
    const walk = n => {
      const d = n.data || {};
      const text = JSON.stringify(d);
      for (const mt of matches) {
        const onForm = d.typeId === mt.formId || w.TypeId === mt.formId;
        if (onForm && new RegExp('\\b' + mt.name + '\\b').test(text)) {
          uses.push({ seq: w.Sequence, workflow: w.Name, node: d.name || n.id, actionType: d.actionType, field: `${mt.form}.${mt.label}` });
          break;
        }
      }
      (n.children || []).forEach(walk);
    };
    const root = w.AutomationConfiguration && w.AutomationConfiguration.root;
    if (root) walk(root);
  }
  uses.sort((a, b) => (a.seq || 0) - (b.seq || 0));
  return { matches: matches.map(({ formId, ...rest }) => rest), uses };
}

await findField(globalThis.CAE_OPTIONS || {});
