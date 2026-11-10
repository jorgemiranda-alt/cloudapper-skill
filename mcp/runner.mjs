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
  if (file === 'create-form.js') {
    const dir = path.join(SCRIPTS, 'field-templates');
    opts.templates = Object.fromEntries(fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => [f.slice(0, -5), JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))]));
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
