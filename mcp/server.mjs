// cloudapper MCP server: one tool, cloudapper_run, that runs a skill script (scripts/*.js) in its own
// signed-in Chrome window and returns only the script's summary. The scripts, their options and the rules
// are documented in the skill (references/playwright-efficiency.md §3), not here, to keep the tool small.
//
// Env (set in the MCP registration, never in this repo):
//   CLOUDAPPER_PROFILE        Chrome profile dir (default %LOCALAPPDATA%/cloudapper-mcp/profile): keeps the sign-in;
//                             when another session holds it, the server uses <dir>-2 .. <dir>-5 (sign in once each).
//   CLOUDAPPER_BACKUP_DIR     where backups and export files go (default ~/cloudapper-backups).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { chromium } from 'playwright-core';
import { z } from 'zod';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const SCRIPTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts');
const PROFILE = process.env.CLOUDAPPER_PROFILE || path.join(process.env.LOCALAPPDATA || os.homedir(), 'cloudapper-mcp', 'profile');
const OUT = process.env.CLOUDAPPER_BACKUP_DIR || path.join(os.homedir(), 'cloudapper-backups');

// Several Claude sessions and several apps at once:
// - each server takes the first free profile (PROFILE, PROFILE-2 .. PROFILE-5); every profile keeps its own sign-in,
//   so a new slot asks the user to sign in once;
// - inside one window every app has its own tab, chosen by the app id in `url`, so a call for app B never
//   navigates app A's tab away. Without `url` the call uses the tab of the last call, and is refused when
//   tabs of more than one app are open. Calls run in parallel, so each call keeps its own tab (never a shared one).
let ctx, launching, page, profileUsed;
const tabs = new Map(); // app id -> Promise<tab>
const appOf = u => (String(u || '').match(/\/\d{6,}\/(?:app|design|studio)\/([0-9a-f-]{36})/i) || [])[1];
async function launch() {
    let err;
    for (const dir of [PROFILE, ...[2, 3, 4, 5].map(n => `${PROFILE}-${n}`)]) {
      try { ctx = await chromium.launchPersistentContext(dir, { channel: 'chrome', headless: false, viewport: null }); err = null; profileUsed = path.basename(dir); break; }
      catch (e) { err = e; if (!/existing browser session|in use|lock/i.test(e.message)) break; }
    }
    if (err) throw new Error('Could not start a cloudapper Chrome window (all profiles in use by other sessions?): ' + String(err.message).split(String.fromCharCode(10))[0].slice(0, 160));
}
async function getPage(url) {
  if (!ctx || !ctx.pages().length) { launching = launching || launch().finally(() => { launching = null; }); await launching; }
  const app = appOf(url);
  const open = ctx.pages().filter(t => !t.isClosed());
  let tab;
  if (app) {
    // Each app claims its tab synchronously (before any await), so parallel calls never share one.
    // A new app takes a blank or sign-in tab no other app has claimed, else a new tab.
    const claimed = tabs.get(app);
    if (!claimed || (await claimed).isClosed()) {
      const mine = [...tabs.values()];
      tabs.set(app, (async () => open.find(t => appOf(t.url()) === app)
        || (await (async () => { for (const t of open) if (!appOf(t.url()) && !(await Promise.all(mine)).includes(t)) return t; })())
        || ctx.newPage())());
    }
    tab = await tabs.get(app);
  } else {
    const apps = new Set(open.map(t => appOf(t.url())).filter(Boolean));
    if (apps.size > 1) throw new Error(`Tabs of ${apps.size} apps are open: pass url (the app URL) so the call runs in the right one`);
    tab = page && !page.isClosed() ? page : open[0] || await ctx.newPage();
  }
  page = tab;
  if (url && !tab.url().startsWith(url)) { await tab.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); await tab.waitForTimeout(8000); }
  return tab;
}

// runner.mjs is re-imported when its file changes (one module copy per edit). A broken edit returns an
// error and keeps the last good version, so the server, its window and the sign-in survive.
const RUNNER = path.join(path.dirname(SCRIPTS), 'mcp', 'runner.mjs');
let runner = null, runnerMtime = 0;
async function loadRunner() {
  const mt = fs.statSync(RUNNER).mtimeMs;
  if (runner && mt === runnerMtime) return { runner };
  try { runner = await import(pathToFileURL(RUNNER).href + '?v=' + mt); runnerMtime = mt; return { runner }; }
  catch (e) { return { runner, error: 'runner.mjs: ' + String(e.message).split(String.fromCharCode(10))[0].slice(0, 300) }; }
}

async function run({ script, spec = {}, url }) {
  const file = path.basename(script.endsWith('.js') ? script : script + '.js');
  if (!fs.existsSync(path.join(SCRIPTS, file))) return { error: `No script ${file}`, scripts: fs.readdirSync(SCRIPTS).filter(f => f.endsWith('.js')) };
  if (file === 'help.js') { const { runner: r, error } = await loadRunner(); return error ? { error } : r.runScript({ page: null, file, spec, SCRIPTS, OUT }); }
  const p = await getPage(url);
  // Signed in = an access token and the app URL. Wait up to 50 s (MCP clients time out at 60 s) for the user to sign in in the window.
  const ready = async () => /\/(\d{6,})\/(?:app|design|studio)\/[0-9a-f-]{36}/i.test(p.url()) && await p.evaluate(() => !!localStorage.getItem('accessToken') && performance.getEntriesByType('resource').some(e => e.name.includes('.cloudapper.com/api/'))).catch(() => false);
  for (let i = 0; i < 10 && !(await ready()); i++) await p.waitForTimeout(5000);
  if (!(await ready())) return { signIn: true, message: `Sign in in the cloudapper Chrome window (profile ${profileUsed}) and open the app, then call again (pass url to open it).`, at: (() => { try { const u = new URL(p.url()); return u.host + u.pathname.replace(/[0-9a-f-]{36}/gi, '<id>').replace(/\d{6,}/g, '<client>'); } catch (e) { return p.url().slice(0, 40) || 'blank page'; } })() };
  if (url && !p.url().startsWith(url)) { await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); await p.waitForTimeout(8000); }
  const m = p.url().match(/\/(\d{6,})\/(?:app|design|studio)\/([0-9a-f-]{36})/i);
  // The tab must be on the app the call asked for, before ca.js and the write guard are set up.
  if (appOf(url) && (!m || m[2].toLowerCase() !== appOf(url).toLowerCase())) return { error: `Tab is on app ${m ? m[2] : 'none'}, not the app in url; nothing ran` };
  const { runner: r, error } = await loadRunner();
  if (error) return { error, keptPreviousRunner: !!r };
  // Fresh ca.js, writes allowed on the page's client (no allowlist, owner's choice 2026-11-10). Which app to
  // change is Claude's job under the skill's environment rules (UAT by default, Production read-only).
  await p.evaluate(s => { globalThis.CAE_OPTIONS = {}; return (0, eval)('(async () => {' + s + '})()'); }, fs.readFileSync(path.join(SCRIPTS, 'ca.js'), 'utf8'));
  const writable = true;
  await p.evaluate(c => window.ca.setClient(c), m[1]);
  return r.runScript({ page: p, file, spec, SCRIPTS, OUT, writable });
}

// Calls for the same app run one after another: they share a tab, and each reloads ca.js and reads __caeFiles.
// Calls for different apps still run in parallel. A call the client gave up on (60 s) keeps running in the page,
// so the next one waits for it, at most 5 min. A call cancelled while waiting never runs (no late writes).
// ponytail: a hung script only delays its app's queue by the cap; it keeps running in the page.
const lanes = new Map();
function queued(args, signal) {
  if (path.basename(String(args.script)).replace(/\.js$/, '') === 'help') return run(args);
  const key = (appOf(args.url) || appOf(page && !page.isClosed() && page.url()) || '-').toLowerCase();
  const call = Promise.race([lanes.get(key), new Promise(r => setTimeout(r, 300000).unref())]).then(() => {
    if (signal && signal.aborted) throw new Error('Cancelled by the client while waiting for an earlier call on this app; nothing ran');
    return run(args);
  });
  const tail = call.catch(() => {});
  lanes.set(key, tail);
  tail.then(() => { if (lanes.get(key) === tail) lanes.delete(key); });
  return call;
}

const server = new McpServer({ name: 'cloudapper', version: '1.0.0' });
server.registerTool('cloudapper_run', {
  description: 'Run a cloudapper skill script (scripts/<name>.js) in the signed-in CloudApper window; returns its short summary. Scripts and spec options: cloudapper skill, playwright-efficiency.md §3. Pass url (the app URL) on every call when working on several apps: each app has its own tab. Writes go to the app of that tab: check it is the intended (UAT) app first.',
  inputSchema: { script: z.string(), spec: z.record(z.string(), z.any()).optional(), url: z.string().optional() },
}, async (args, extra) => ({ content: [{ type: 'text', text: JSON.stringify(await queued(args, extra && extra.signal).catch(e => ({ error: String(e.message).split(String.fromCharCode(10))[0].slice(0, 300) }))) }] }));
await server.connect(new StdioServerTransport());
