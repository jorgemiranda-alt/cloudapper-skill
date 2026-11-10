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
  const save = (name, data) => { fs.mkdirSync(OUT, { recursive: true }); const f = path.join(OUT, path.basename(name)); fs.writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data, null, 1)); return f; };
  const opts = { ...spec };
  if (file === 'create-form.js') {
    const dir = path.join(SCRIPTS, 'field-templates');
    opts.templates = Object.fromEntries(fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => [f.slice(0, -5), JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))]));
  }
  let res;
  try { res = await runIn(p, file, opts, SCRIPTS); }
  catch (e) { return { error: String(e.message).replace(/^page\.evaluate: (Error: )?/, '').split('\n')[0].slice(0, 400), writable }; }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  if (res && res.backup) res.backup = save(`backup-${res.form || 'form'}-${stamp}.json`, res.backup);
  const files = await p.evaluate(() => { const f = globalThis.__caeFiles; delete globalThis.__caeFiles; return f; });
  if (files && spec.outDir !== false) res = { ...res, savedTo: path.dirname(Object.entries(files).map(([n, d]) => save(n, d)).pop() || OUT), files: Object.keys(files).length };
  return res;
}
