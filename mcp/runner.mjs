// Hot-reloaded part of the cloudapper MCP server: server.mjs re-imports this file when it changes, so
// edits here (and to scripts/*.js and scripts/field-templates/) apply on the next call without a reconnect.
// Gets a signed-in page that already has ca.js and the write guard set by server.mjs; keep safety checks there.
import fs from 'node:fs';
import path from 'node:path';

// Same transformation as the Playwright loader: make the script's last `await fn(opts)` a return.
const wrap = src => '(async () => {' + src.replace(/await (\w+)\(globalThis\.\w+( \|\| \{\})?\);\s*$/, 'return await $1(globalThis.CAE_OPTIONS);') + '})()';
export const runIn = (p, file, opts, SCRIPTS) => p.evaluate(([s, o]) => { if (typeof o.checks === 'string') o.checks = (0, eval)(o.checks); globalThis.CAE_OPTIONS = o; return (0, eval)(s); },
  [wrap(fs.readFileSync(path.join(SCRIPTS, file), 'utf8')), opts]);

export async function runScript({ page: p, file, spec, SCRIPTS, OUT, writable }) {
  // spec.outDir (a folder path) sends export files there instead of OUT; outDir:false keeps them in the page.
  const save = (name, data, dir = OUT) => { fs.mkdirSync(dir, { recursive: true }); const f = path.join(dir, path.basename(name)); fs.writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data, null, 1)); return f; };
  // help: the header comment of each script (Node side, no page call). spec.script = one script in full.
  const NL = String.fromCharCode(10);
  if (file === 'help.js') {
    const head = f => fs.readFileSync(path.join(SCRIPTS, f), 'utf8').replaceAll(String.fromCharCode(13), '').split(NL).filter((l, i, a) => l.startsWith('//') && a.slice(0, i).every(x => x.startsWith('//'))).map(l => l.slice(3)).join(NL);
    if (spec.script) return head(path.basename(spec.script.endsWith('.js') ? spec.script : spec.script + '.js'));
    return Object.fromEntries(fs.readdirSync(SCRIPTS).filter(f => f.endsWith('.js') && f !== 'help.js').map(f => [f.slice(0, -3), head(f).split(NL)[0]]));
  }
  // Older scripts find the API host from the page's requests, which a fresh page may not have made yet.
  const opts = { ...(await p.evaluate(() => ({ apiBase: window.ca.apiBase, designBase: window.ca.designBase }))), ...spec };
  // checksFile: a saved checks file in the project (absolute path), read here so its source never enters the conversation.
  if (spec.checksFile) {
    if (!path.isAbsolute(spec.checksFile) || !fs.existsSync(spec.checksFile)) return { error: `checksFile must be an absolute path to an existing file: ${spec.checksFile}` };
    opts.checks = fs.readFileSync(spec.checksFile, 'utf8'); delete opts.checksFile;
  }
  if (file === 'create-form.js') {
    const dir = path.join(SCRIPTS, 'field-templates');
    opts.templates = Object.fromEntries(fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => [f.slice(0, -5), JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))]));
  }
  if (file === 'integration.js') return integration(p, spec, SCRIPTS).catch(e => ({ error: String(e.message).split('\n')[0].slice(0, 300) }));
  if (file === 'workflow.js') {
    const dir = path.join(SCRIPTS, '..', 'references', 'node-templates');
    if (spec.action === 'create') opts.templates = Object.fromEntries(fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => [f.slice(0, -5), JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))]));
    // validate and check-run with record checks reuse the existing read-only scripts.
    if (spec.action === 'validate') {
      const ws = spec.workflows || [], guid = /^[0-9a-f-]{36}$/i;
      if (!ws.length) return { error: "validate needs workflows:[id or name]" };
      // Exact names -> ids here (the validator's own `names` is a contains-match); its `workflows` means objects.
      const list = await p.evaluate(() => window.ca.wfList());
      const ids = [];
      for (const w of ws) { const hits = guid.test(w) ? [w] : list.filter(x => x.name === w).map(x => x.id);
        if (hits.length !== 1) return { error: `Workflow ${w}: ${hits.length} matches; pass its AutomationId` }; ids.push(hits[0]); }
      delete opts.workflows;
      file = 'validate-workflows.js';
      Object.assign(opts, { apiCheck: true, automationIds: ids });
    } else if (spec.action === 'check-run' && opts.checks) {
      file = 'verify-workflow-run.js';
      opts.chain = spec.chain || [{ name: spec.workflow, automationId: spec.workflow }];
    }
  }
  let res;
  try { res = await runIn(p, file, opts, SCRIPTS); }
  catch (e) { return { error: String(e.message).replace(/^page\.evaluate: (Error: )?/, '').split('\n')[0].slice(0, 400), writable }; }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  if (res && res.backup) res.backup = save(`backup-${res.backupName || res.form || "form"}-${stamp}.json`, res.backup);
  const files = await p.evaluate(() => { const f = globalThis.__caeFiles; delete globalThis.__caeFiles; return f; });
  if (files && spec.outDir !== false) res = { ...res, savedTo: path.dirname(Object.entries(files).map(([n, d]) => save(n, d, typeof spec.outDir === 'string' ? spec.outDir : OUT)).pop() || OUT), files: Object.keys(files).length };
  // A careless call must not flood the conversation: big results go to a file, with a short preview.
  const text = JSON.stringify(res);
  if (text && text.length > (spec.maxChars || 6000)) return { truncated: true, chars: text.length, savedTo: save(`result-${file.replace(/\.js$/, '')}-${stamp}.json`, res), preview: text.slice(0, 500) };
  return res;
}

// integration.js: config record read in the page, HTTP calls on the Node side; credentials never enter the result.
async function integration(p, spec, SCRIPTS) {
  const src = fs.readFileSync(path.join(SCRIPTS, 'integration.js'), 'utf8');
  const H = new Function(src.slice(src.indexOf('// pure:start'), src.indexOf('// pure:end')) + '; return { fillTemplate, pickPath, shapeOf, scrub, usedConfigKeys, hostAllowed };')();
  const secrets = [];
  // Errors are scrubbed too: a thrown message may quote a filled URL or body.
  try { return await integrationCall(p, spec, H, secrets); }
  catch (e) { throw new Error(H.scrub(String(e.message), secrets.flatMap(s => [String(s), JSON.stringify(String(s)).slice(1, -1), encodeURIComponent(String(s))]))); }
}
async function integrationCall(p, spec, { fillTemplate, pickPath, shapeOf, scrub, usedConfigKeys, hostAllowed }, secrets) {
  if (!spec.config || !spec.config.form || !spec.request || !spec.request.url) throw new Error('integration needs config:{form} and request:{url}');
  const method = (spec.request.method || 'GET').toUpperCase();
  if (method !== 'GET' && !spec.effect) throw new Error(`${method} needs effect:'read' (a POST that only reads) or effect:'write' (only when the user asked to change the external system)`);
  if (['PUT', 'PATCH', 'DELETE'].includes(method) && spec.effect !== 'write') throw new Error(`${method} changes the external system: needs effect:'write'`);
  const rec = await p.evaluate(async c => {
    const fs = await window.ca.fields(c.form);
    const rows = await window.ca.find(c.form, r => Object.entries(c.where || {}).every(([l, v]) => { const f = fs.find(x => x.label === l || x.name === l); return f && String(r[f.name]) === String(v); }));
    if (rows.length !== 1) return { error: `config: ${rows.length} records of ${c.form} match; pass where:{ '<label>': value }` };
    return { values: Object.fromEntries(fs.map(f => [f.label, rows[0][f.name]])) };
  }, spec.config);
  if (rec.error) throw new Error(rec.error);
  const vars = Object.fromEntries(Object.entries(rec.values).map(([k, v]) => ['c.' + k, v]));
  // Scrub only the config values this spec uses (a scrub of every config value would also hide ordinary data).
  for (const k of usedConfigKeys(JSON.stringify(spec))) if (vars[k] !== null && vars[k] !== undefined) secrets.push(vars[k]);
  vars.token = undefined; vars.basic = undefined;
  if (spec.basic) { vars.basic = Buffer.from(fillTemplate(spec.basic[0], vars) + ':' + fillTemplate(spec.basic[1], vars)).toString('base64'); secrets.push(vars.basic); }
  // The URL host must come from the config record (no sending credentials to a host typed in the spec), or allowHost.
  const hostOk = u => { if (hostAllowed(u, Object.values(rec.values), spec.allowHost)) return true; const h = new URL(u).host; throw new Error(`Host ${h} is not an https host of the config record; pass allowHost:'${h}' if the user confirmed it`); };
  const sc = t => scrub(t, secrets.flatMap(s => [String(s), JSON.stringify(String(s)).slice(1, -1), encodeURIComponent(String(s))]));
  const call = async r => {
    const url = fillTemplate(r.url, vars); hostOk(url);
    const q = r.query ? '?' + new URLSearchParams(fillTemplate(r.query, vars)) : '';
    const o = { method: (r.method || 'GET').toUpperCase(), headers: fillTemplate(r.headers || {}, vars), timeout: 45000, failOnStatusCode: false };
    if (r.json) o.data = fillTemplate(r.json, vars); if (r.form) o.form = fillTemplate(r.form, vars);
    const t0 = Date.now(); const res = await p.request.fetch(url + q, o);
    return { res, ms: Date.now() - t0, text: await res.text() };
  };
  if (spec.token) {
    const t = await call({ method: 'POST', ...spec.token });
    if (!t.res.ok()) return { step: 'token', status: t.res.status(), body: sc(t.text).slice(0, 300) };
    vars.token = pickPath(JSON.parse(t.text), spec.token.path || 'access_token');
    if (!vars.token) return { step: 'token', status: t.res.status(), error: `no ${spec.token.path || 'access_token'} in the token response` };
    secrets.push(vars.token);
  }
  const r = await call(spec.request);
  const out = { status: r.res.status(), ms: r.ms };
  if (!r.res.ok()) return { ...out, body: sc(r.text).slice(0, 300) };
  let body; try { body = JSON.parse(r.text); } catch (e) { return { ...out, contentType: r.res.headers()['content-type'], length: r.text.length }; }
  if (spec.rows) {
    const rows = [].concat(pickPath(body, spec.rows) || []);
    out.count = rows.length;
    out.rows = rows.slice(0, spec.max || 20).map(x => spec.fields ? Object.fromEntries(spec.fields.map(f => [f, pickPath(x, f)])) : x);
  }
  if (spec.pick) out.picked = Object.fromEntries(Object.entries(spec.pick).map(([k, pth]) => [k, pickPath(body, pth)]));
  if (!spec.rows && !spec.pick) out.shape = shapeOf(body);
  return JSON.parse(sc(JSON.stringify(out)));
}
