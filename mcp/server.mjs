// cloudapper MCP server: one tool, cloudapper_run, that runs a skill script (scripts/*.js) in its own
// signed-in Chrome window and returns only the script's summary. The scripts, their options and the rules
// are documented in the skill (references/playwright-efficiency.md §3), not here, to keep the tool small.
//
// Env (set in the MCP registration, never in this repo):
//   CLOUDAPPER_PROFILE        Chrome profile dir (default %LOCALAPPDATA%/cloudapper-mcp/profile): keeps the sign-in.
//   CLOUDAPPER_BACKUP_DIR     where backups and export files go (default ~/cloudapper-backups).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { chromium } from 'playwright-core';
import { z } from 'zod';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SCRIPTS = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..', 'scripts');
const PROFILE = process.env.CLOUDAPPER_PROFILE || path.join(process.env.LOCALAPPDATA || os.homedir(), 'cloudapper-mcp', 'profile');
const OUT = process.env.CLOUDAPPER_BACKUP_DIR || path.join(os.homedir(), 'cloudapper-backups');

let ctx, page;
async function getPage(url) {
  if (!ctx || !ctx.pages().length) {
    try { ctx = await chromium.launchPersistentContext(PROFILE, { channel: 'chrome', headless: false, viewport: null }); }
    catch (e) { throw new Error('Could not start the cloudapper Chrome window (profile in use by another session? close that session or its cloudapper window): ' + String(e.message).split(String.fromCharCode(10))[0].slice(0, 160)); }
    page = ctx.pages()[0] || await ctx.newPage();
  }
  if (page.isClosed()) page = ctx.pages()[0] || await ctx.newPage();
  if (url && !page.url().startsWith(url)) { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); await page.waitForTimeout(8000); }
  return page;
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
  if (!(await ready())) return { signIn: true, message: 'Sign in in the cloudapper Chrome window and open the app, then call again (pass url to open it).', at: (() => { try { const u = new URL(p.url()); return u.host + u.pathname.replace(/[0-9a-f-]{36}/gi, '<id>').replace(/\d{6,}/g, '<client>'); } catch (e) { return p.url().slice(0, 40) || 'blank page'; } })() };
  if (url && !p.url().startsWith(url)) { await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); await p.waitForTimeout(8000); }
  const m = p.url().match(/\/(\d{6,})\/(?:app|design|studio)\/([0-9a-f-]{36})/i);
  const { runner: r, error } = await loadRunner();
  if (error) return { error, keptPreviousRunner: !!r };
  // Fresh ca.js, writes allowed on the page's client (no allowlist, owner's choice 2026-11-10). Which app to
  // change is Claude's job under the skill's environment rules (UAT by default, Production read-only).
  await p.evaluate(s => { globalThis.CAE_OPTIONS = {}; return (0, eval)('(async () => {' + s + '})()'); }, fs.readFileSync(path.join(SCRIPTS, 'ca.js'), 'utf8'));
  const writable = true;
  await p.evaluate(c => window.ca.setClient(c), m[1]);
  return r.runScript({ page: p, file, spec, SCRIPTS, OUT, writable });
}

const server = new McpServer({ name: 'cloudapper', version: '1.0.0' });
server.registerTool('cloudapper_run', {
  description: 'Run a cloudapper skill script (scripts/<name>.js) in the signed-in CloudApper window; returns its short summary. Scripts and spec options: cloudapper skill, playwright-efficiency.md §3. Writes go to the app open in the window: check it is the intended (UAT) app first.',
  inputSchema: { script: z.string(), spec: z.record(z.string(), z.any()).optional(), url: z.string().optional() },
}, async args => ({ content: [{ type: 'text', text: JSON.stringify(await run(args).catch(e => ({ error: String(e.message).split(String.fromCharCode(10))[0].slice(0, 300) }))) }] }));
await server.connect(new StdioServerTransport());
