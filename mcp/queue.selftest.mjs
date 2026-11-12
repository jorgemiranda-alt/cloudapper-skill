// Self-check of the per-app call queue in server.mjs (run with a fake run(); no Chrome): node mcp/queue.selftest.mjs
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert';
const src = fs.readFileSync(new URL('server.mjs', import.meta.url), 'utf8'); const body = src.slice(src.indexOf('const lanes'), src.indexOf('\nconst server'));
const log = []; const sleep = ms => new Promise(r => setTimeout(r, ms));
const run = async a => { log.push('start ' + a.id); if (a.fail) { await sleep(20); log.push('end ' + a.id); throw new Error('x'); } await sleep(a.ms || 30); log.push('end ' + a.id); return a.id; };
const appOf = u => (String(u || '').match(/app\/([0-9a-f-]{36})/i) || [])[1];
const queued = new Function('run', 'appOf', 'page', 'path', body + '; return queued;')(run, appOf, null, path);
const A = 'x/app/' + 'a'.repeat(36), B = 'x/app/' + 'b'.repeat(36), A2 = 'x/app/' + 'A'.repeat(36);
// same app (case-insensitive) runs in order; failure doesn't block; other app overlaps
const ac = new AbortController();
const ps = [queued({ id: 1, url: A, fail: true }), queued({ id: 2, url: A2, ms: 30 }), queued({ id: 3, url: B, ms: 10 }), queued({ id: 4, url: A }, ac.signal)];
ac.abort();
const r = await Promise.allSettled(ps);
assert.equal(r[0].status, 'rejected'); assert.equal(r[1].value, 2); assert.equal(r[2].value, 3);
assert.match(r[3].reason.message, /Cancelled/); assert(!log.includes('start 4'), 'cancelled ran');
assert(log.indexOf('start 2') > log.indexOf('end 1'), 'same app overlapped');
assert(log.indexOf('start 3') < log.indexOf('end 1'), 'other app was blocked');
console.log('queue ok', log.join(', '));
