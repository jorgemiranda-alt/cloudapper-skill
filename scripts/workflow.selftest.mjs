// Offline self-check for workflow.js pure helpers: `node scripts/workflow.selftest.mjs`.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('./workflow.js', import.meta.url), 'utf8');
const pure = src.slice(src.indexOf('// pure:start'), src.indexOf('// pure:end'));
const { substArgs, nodeIds } = new Function(pure + '; return { substArgs, nodeIds };')();

const names = Array.from({ length: 11 }, (_, i) => `__arg${i}x__`);
assert.equal(substArgs('$1 + $10', names), '__arg1x__ + __arg10x__'); // the $1-inside-$10 bug
assert.equal(substArgs('$0 == "true"', ['A']), 'A == "true"');
assert.equal(substArgs('$0 + $0', ['A']), 'A + A');
assert.throws(() => substArgs('$0 + $1', ['A']), /\$1/);

const now = 1762000000000;
const ids = nodeIds(500, now);
assert.equal(new Set(ids).size, 500);
for (const id of ids) {
  assert.match(id, /^s\d{13}$/);
  assert.ok(!/00000/.test(id), id);
  assert.ok(+id.slice(1) < now, 'id in the past: ' + id);
}
assert.ok(!nodeIds(3, now, new Set(ids)).some(i => ids.includes(i)), 'skips taken ids');
console.log('workflow.js self-check ok');
