// Offline regression check for validate-workflows.js: `node scripts/validate-workflows.selftest.mjs`.
// One valid synthetic workflow must give zero errors; each seeded breakage must raise its code.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('./validate-workflows.js', import.meta.url), 'utf8')
  .replace(/^await validateWorkflows\(.*$/m, ''); // drop the top-level page call
const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222';
const API = 'https://test-api.cloudapper.com/api/';
const data = {
  'v3/forms': { Result: [{ Id: A, Title: 'Order', Fields: [{ Name: 'Code' }] }, { Id: B, Title: 'Stock', Fields: [{ Name: 'Code' }, { Name: 'Total' }] }] },
  ['v3/forms/forms-relation/apps/' + 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']: { Result: [] },
};
const fetch = async url => {
  const j = data[url.slice(API.length)];
  if (!j) throw new Error('unexpected fetch ' + url);
  return { ok: true, status: 200, text: async () => JSON.stringify(j), json: async () => j };
};
const validateWorkflows = new Function('location', 'localStorage', 'fetch', 'performance', src + '; return validateWorkflows;')(
  { pathname: '/studio/1234567/app/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/workflows' },
  { getItem: () => 'tok' }, fetch, { getEntriesByType: () => [] });

const arg = (NodeId, Field) => ({ Name: '__arg1__', NodeId, FieldNodeId: NodeId + '.' + Field, Field, ControlType: 4, DataType: 1 });
const valid = () => ({
  Name: 'wf', Sequence: 1, TypeId: A,
  AutomationConfiguration: { root: {
    id: 's1000000000001', type: 'TRIGGER', data: { actionType: 'TRIGGER', name: 'Trigger', typeId: A }, children: [{
      id: 's1000000000002', type: 'ACTION', data: { actionType: 'LOOKUP_RECORD', name: 'Find stock', typeId: B,
        ruleSet: { Rules: [{ Field: 'Code', Operator: '=', Value: { Expression: '__arg1__', Arguments: [arg('__TRIGGERRECORD', 'Code')] } }] } },
      children: [{
        id: 's1000000000003', type: 'ACTION', data: { actionType: 'UPDATE_RECORD', name: 'Bump', typeId: B,
          entityFieldAssignment: [{ Field: 'Total', Value: { Expression: '__arg1__ + 1', ExpressionText: '[Total] + 1', Arguments: [arg('s1000000000002', 'Total')] } }] },
        children: [{
          id: 's1000000000004', type: 'ROUTER', data: { actionType: 'ROUTER', name: 'Router' }, children: [
            { id: 's1000000000005', type: 'ROUTE', data: { actionType: 'ROUTE', name: 'Route 1' }, children: [] }] }] }] }] } },
});
const run = async w => (await validateWorkflows({ workflows: [w], apiCheck: false, apiBase: API })).findings;
const nodes = w => { const out = []; const go = n => { out.push(n); (n.children || []).forEach(go); }; go(w.AutomationConfiguration.root); return out; };

const base = await run(valid());
assert.deepEqual(base.filter(f => f.level === 'error'), [], 'valid workflow has errors');

const lookup = w => nodes(w)[1], update = w => nodes(w)[2], expr = w => update(w).data.entityFieldAssignment[0].Value;
const cases = {
  UNKNOWN_TYPEID: w => { lookup(w).data.typeId = '99999999-9999-9999-9999-999999999999'; },
  UNKNOWN_FIELD: w => { update(w).data.entityFieldAssignment[0].Field = 'Nope'; },
  CHILDREN_MISSING: w => { delete nodes(w)[4].children; },
  DUP_NODE_ID: w => { nodes(w)[4].id = 's1000000000003'; },
  BAD_REF: w => { lookup(w).data.ruleSet.Rules[0].Value.Arguments = [arg('s1000000000003', 'Total')]; }, // runs later
  EMPTY_EXPRESSION: w => { expr(w).Expression = ' '; },
  NO_EXPRESSION_TEXT: w => { delete expr(w).ExpressionText; },
  UNDECLARED_ARG: w => { expr(w).Expression = '__arg1__ + __arg2__'; expr(w).ExpressionText = '[Total] + [X]'; },
  NODE_TYPE: w => { nodes(w)[3].type = 'ACTION'; },
  ROUTE_PARENT: w => { update(w).children = [nodes(w)[4]]; },
};
// Nodes without `data` once threw instead of giving a finding.
const noData = { ROUTE_PARENT: w => { delete nodes(w)[3].data; }, ROUTER_CHILD: w => { delete nodes(w)[4].data; } };
for (const [code, breakIt] of Object.entries(noData)) {
  const w = valid(); breakIt(w);
  const f = await run(w);
  assert.ok(f.some(x => x.code === code), 'no data: ' + code + ' not raised: ' + JSON.stringify(f.map(x => x.code)));
}
for (const [code, breakIt] of Object.entries(cases)) {
  const w = valid(); breakIt(w);
  const f = await run(w);
  assert.ok(f.some(x => x.code === code && x.level === 'error'), code + ' not raised: ' + JSON.stringify(f.map(x => x.code)));
}
console.log('validate-workflows.js self-check ok (' + Object.keys(cases).length + ' breakages)');
