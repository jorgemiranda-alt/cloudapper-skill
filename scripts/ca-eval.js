// Runs one expression against window.ca (installed by ca.js) and returns its value, so one-line API calls
// go through the same runner as the scripts. Options: { expr: "ca.count('Employee')" }. Return small values
// (counts, names, ids); keep big objects in the page (window.x = ...) and return a summary of them.

async function caEval(o = {}) {
  if (!window.ca) throw new Error("Load ca.js first: run('ca.js', {}).");
  if (!o.expr) throw new Error('Pass expr');
  return await (0, eval)('(async () => (' + o.expr + '))()');
}

await caEval(globalThis.CAE_OPTIONS || {});
