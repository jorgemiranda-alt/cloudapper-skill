// Offline self-check for integration.js pure helpers: `node scripts/integration.selftest.mjs`.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('./integration.js', import.meta.url), 'utf8');
const { fillTemplate, pickPath, shapeOf, scrub } = new Function(src.slice(src.indexOf('// pure:start'), src.indexOf('// pure:end')) + '; return { fillTemplate, pickPath, shapeOf, scrub };')();

const vars = { 'c.Host': 'https://api.example.test', 'c.Key': 'k-123456', token: 'tok-abcdef', 'c.Empty': '' };
assert.equal(fillTemplate('{{c.Host}}/x?k={{ c.Key }}', vars), 'https://api.example.test/x?k=k-123456');
assert.deepEqual(fillTemplate({ h: ['Bearer {{token}}'] }, vars), { h: ['Bearer tok-abcdef'] });
assert.throws(() => fillTemplate('{{c.Nope}}', vars), /Unknown placeholder/);
assert.throws(() => fillTemplate('{{c.Empty}}', vars), /empty/);

const body = { data: { children: [{ id: 1, attributes: [{ key: 'A', value: 'x' }] }, { id: 2, attributes: [] }] } };
assert.deepEqual(pickPath(body, 'data.children[*].id'), [1, 2]);
assert.equal(pickPath(body, 'data.children[0].attributes[0].value'), 'x');
assert.equal(pickPath(body, 'data.missing.deep'), undefined);
assert.deepEqual(shapeOf(body).data.children, ['array(2)', { id: 'number', attributes: ['array(1)', { key: 'string', value: 'string' }] }]);

assert.equal(scrub('a k-123456 b k-1234567 tok-abcdef', ['k-123456', 'k-1234567', 'tok-abcdef', 'ab']), 'a *** b *** ***');
console.log('integration.js self-check ok');

// Spaced labels must be found (a bug once stripped the space, so the value was never scrubbed).
const { usedConfigKeys, hostAllowed } = new Function(src.slice(src.indexOf('// pure:start'), src.indexOf('// pure:end')) + '; return { usedConfigKeys, hostAllowed };')();
assert.deepEqual(usedConfigKeys(JSON.stringify({ a: '{{c.Client Secret}}', b: '{{ c.Host URL }}/x', t: '{{token}}' })), ['c.Client Secret', 'c.Host URL']);
const vals = ['https://api.example.test/base', 'tenant.example.org', 'not a host', 'secret'];
assert.ok(hostAllowed('https://api.example.test/v1/x', vals));
assert.ok(hostAllowed('https://tenant.example.org/a', vals));
assert.ok(!hostAllowed('https://example.test/x', vals), 'substring of a config host is not enough');
assert.ok(!hostAllowed('http://api.example.test/x', vals), 'https only');
assert.ok(hostAllowed('https://other.test/x', vals, 'other.test'));
console.log('integration.js host and key checks ok');
