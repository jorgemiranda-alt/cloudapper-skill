// Call an external system (UKG, Odoo, any REST API) with the connection settings of the app's config record, and
// return only what you ask for (references/integration-tool.md). Runs only through cloudapper_run: the runner reads
// the config record in the page and makes the calls on the Node side (no CORS), so credentials and tokens never
// reach the result; every config value and the token are also scrubbed from the output. Never changes the app.
// Spec (opts). Strings may use {{c.<config field label>}}, {{token}} and {{basic}} (base64 of basic[0]:basic[1]):
//   config:  { form:'<config form>', where?:{ '<label>': value } }   exactly one record must match
//   token?:  { url, method?:'POST', form?:{..} | json?:{..}, headers?, path?:'access_token' }
//   basic?:  ['{{c.User}}', '{{c.Password}}']
//   request: { url, method?:'GET', query?, headers?, json? | form? }
//   effect:  'read' (default for GET) | 'read' for a POST that only reads (multi_read, search) | 'write' (only
//            when the user asked to change the external system). PUT/PATCH/DELETE need 'write'.
//   rows?:   path to the array to return ('data.children', '[*]' allowed), with fields?:[paths in each row], max?:20
//   pick?:   { name: path }   single values
//   Neither rows nor pick: returns the response's shape (keys, types, array lengths), no values.
//   allowHost?: '<host>'   when the URL host is not written in any config value (default: refused)
// Returns { status, ms, count?, rows? | picked? | shape }. Error bodies: first 300 characters, scrubbed.

// pure:start (used by mcp/runner.mjs and scripts/integration.selftest.mjs)
function fillTemplate(v, vars) {
  if (typeof v === 'string') return v.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, k) => {
    if (!(k in vars)) throw new Error(`Unknown placeholder {{${k}}}`);
    if (vars[k] === undefined || vars[k] === null || vars[k] === '') throw new Error(`{{${k}}} is empty in the config record`);
    return String(vars[k]);
  });
  if (Array.isArray(v)) return v.map(x => fillTemplate(x, vars));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fillTemplate(x, vars)]));
  return v;
}
// 'a.b[*].c', 'a[0]': [*] maps over an array (results flattened one level).
function pickPath(obj, path) {
  if (!path) return obj;
  const parts = String(path).match(/[^.[\]]+|\[\*\]|\[\d+\]/g) || [];
  let cur = [obj], many = false;
  for (const p of parts) {
    if (p === '[*]') { many = true; cur = cur.flatMap(x => Array.isArray(x) ? x : []); continue; }
    const k = /^\[\d+\]$/.test(p) ? +p.slice(1, -1) : p;
    cur = cur.map(x => (x === null || x === undefined ? undefined : x[k]));
  }
  return many ? cur : cur[0];
}
function shapeOf(v, depth = 0) {
  if (Array.isArray(v)) return depth > 8 ? `array(${v.length})` : [`array(${v.length})`, v.length ? shapeOf(v[0], depth + 1) : null];
  if (v && typeof v === 'object') return depth > 8 ? 'object' : Object.fromEntries(Object.entries(v).slice(0, 40).map(([k, x]) => [k, shapeOf(x, depth + 1)]));
  return v === null ? 'null' : typeof v;
}
// Replace every secret (config values, token) in the text; longest first so a value inside another is not left half.
function scrub(text, secrets) {
  let out = String(text);
  for (const s of [...new Set(secrets.map(String).filter(s => s.length >= 4))].sort((a, b) => b.length - a.length)) out = out.split(s).join('***');
  return out;
}
// Config keys a spec uses ('c.Client Secret'), spaces kept: these values are scrubbed from every result and error.
function usedConfigKeys(specText) { return [...new Set([...String(specText).matchAll(/\{\{\s*(c\.[^}]+?)\s*\}\}/g)].map(m => m[1]))]; }
// The URL host must equal the host of a config value (a URL or a bare host), or allowHost.
function hostAllowed(url, values, allowHost) {
  const u = new URL(url); if (u.protocol !== 'https:') return false;
  if (allowHost && u.host === allowHost) return true;
  return values.some(v => { if (typeof v !== 'string' || !v.trim()) return false;
    try { return new URL(/^[a-z]+:\/\//i.test(v.trim()) ? v.trim() : 'https://' + v.trim()).host === u.host; } catch (e) { return false; } });
}
// pure:end

async function integration() { throw new Error('Run integration through cloudapper_run: credentials must stay on the Node side.'); }

await integration(globalThis.CAE_OPTIONS || {});
