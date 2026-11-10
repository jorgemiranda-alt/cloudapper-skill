// Read-only snapshot of an app's design state, for checks before and after a change (counts and names only).
// Run after ca.js (cloudapper_run or the loader). Options: { names:true } also lists form titles; { prefix:'ZZ' }
// lists forms, menus and views whose title starts with it (find leftovers of a test).
// Returns { forms, childForms, relations, menus, views, records?, titles?, matches? }.

async function appState(o = {}) {
  const ca = window.ca;
  if (!ca) throw new Error("Load ca.js first: run('ca.js', {}).");
  const [d, menus, views] = await Promise.all([ca.design(), ca.menus(), ca.views()]);
  const out = { forms: d.EntityTypes.length, childForms: (d.EventTypes || []).length, relations: d.ParentChildRelations.length, menus: menus.length, hiddenMenus: menus.filter(m => m.Ishidden).length, views: views.length };
  if (o.names) out.titles = [...d.EntityTypes, ...(d.EventTypes || [])].map(e => e.Tittle);
  if (o.prefix) { const p = t => (t || '').startsWith(o.prefix); out.matches = { forms: [...d.EntityTypes, ...(d.EventTypes || [])].filter(e => p(e.Tittle)).map(e => e.Tittle), menus: menus.filter(m => p(m.Title)).map(m => m.Title), views: views.filter(v => p(v.Title)).map(v => v.Title) }; }
  return out;
}

await appState(globalThis.CAE_OPTIONS || {});
