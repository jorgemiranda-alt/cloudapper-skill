// Read-only: record count per form. Sends GETs plus Records/fetch with TotalRows 1 (a read).
//
// Run in a signed-in page of the app (URL with /<clientId>/app/<appId>), with the Playwright loader
// in references/playwright-efficiency.md. Options in globalThis.CAE_OPTIONS:
//   forms: ['<title>', ..]  only these forms (default: all)
//   apiBase: '<cluster API base ending in /api/>'  when it can't be read from the page
// Returns [{ form, count }] sorted by count, largest first.

async function recordCount(opts = {}) {
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
  const H = { authorization: 'Bearer ' + token, accept: 'application/json', 'content-type': 'application/json',
    'x-ca-client-id': clientId, 'x-ca-app-id': appId, 'x-ca-client-platform': '3', 'x-ca-client-version': '8.2.0.25' };
  const r = await fetch(apiBase + `v3/Apps/${appId}/details`, { headers: H });
  if (!r.ok) throw new Error('GET details -> ' + r.status);
  let schemas = JSON.parse(await r.text()).Result.Schemas || [];
  if (o.forms) schemas = schemas.filter(f => o.forms.includes(f.Title));

  const out = [];
  for (const f of schemas) {
    const res = await fetch(apiBase + 'v3/Records/fetch', { method: 'POST', headers: H, body: JSON.stringify(
      { StartRow: 0, TotalRows: 1, SearchType: 0, TypeId: f.Id, FilterConfigurations: [], SortConfigurations: [] }) });
    out.push({ form: f.Title, count: res.ok ? (await res.json()).Result.Count : 'error ' + res.status });
  }
  return out.sort((a, b) => (b.count || 0) - (a.count || 0));
}

await recordCount(globalThis.CAE_OPTIONS || {});
