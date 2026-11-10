// List and change menu items through the design API (api-forms-menus.md §5). Run after ca.js (cloudapper_run
// or the loader); writes need ca.setClient. Every write first returns `backup` (all menu items) for the runner
// to save, then reads the list back and reports differences.
// Specs (opts):
//   { action:'list' }  -> [{ id, title, type, mode, level, seq, hidden, landing, parent, form }]
//   { action:'update', items:[{ menu, title?, parent?, seq?, hidden?, icon?, landing? }] }
//       menu = id, or { title, mode } (mode 0 group, 1 "Add", 2 list); parent = group id or title, '' = top level
//   { action:'group', title, parent?, seq? }  -> creates a menu group (Type 0)
//   { action:'delete', menus:[..], confirm:true }  (prefer hidden:true: it is reversible)
// Users see menu changes after Reload App.

async function menuTool(o = {}) {
  const ca = window.ca;
  if (!ca) throw new Error("Load ca.js first: run('ca.js', {}).");
  const D = ca.designBase;
  const all = async () => { const r = await ca.call('POST', D + 'Settings/GetAllDynamicMenuItems', { ClientID: ca.clientId, AppId: ca.appId }); return r.Result || r; };
  const forms = Object.fromEntries((await ca.forms()).map(f => [f.id, f.title]));
  let items = await all();
  const byId = id => items.find(m => m.MenuID === id);
  const row = m => ({ id: m.MenuID, title: m.Title, type: m.Type, mode: m.Mode, level: m.Level, seq: m.SequenceNo, hidden: m.Ishidden, landing: !!m.IsLandingPageMenu, parent: (byId(m.ParentID) || {}).Title || '', form: forms[m.TypeID] || '' });
  if (!o.action || o.action === 'list') return items.map(row);

  await ca.save('__none__', []).catch(e => { if (/Write refused/.test(e.message)) throw e; }); // client guard
  const find = k => {
    const hits = typeof k === 'string' ? items.filter(m => m.MenuID === k || (m.Title === k && m.Type === 0)) : items.filter(m => m.Title === k.title && m.Mode === k.mode);
    if (hits.length !== 1) throw new Error(`Menu ${JSON.stringify(k)}: ${hits.length} matches; use its id or { title, mode }`);
    return hits[0];
  };
  const withClient = m => ({ ...m, Client: { ...(m.Client || {}), ClientID: Number(ca.clientId), ClientIDString: ca.clientId, AppId: ca.appId }, CloudApperAppId: ca.appId });
  const saveItem = m => ca.call('POST', D + 'Settings/SaveDynamicMenuItem', withClient(m));
  const backup = JSON.parse(JSON.stringify(items));
  const problems = [];
  const done = async (extra = {}) => { const before = items.length; items = await all(); return { ok: !problems.length, action: o.action, backupName: 'menus', menus: { before, after: items.length }, problems, ...extra, backup }; };

  if (o.action === 'update') {
    const want = [];
    for (const u of o.items || []) {
      const m = { ...find(u.menu), IsEdit: true };
      if (u.title !== undefined) m.Title = u.title;
      if (u.parent !== undefined) { const p = u.parent ? find(u.parent) : null; m.ParentID = p ? p.MenuID : ''; m.Level = p ? p.Level + 1 : 1; }
      if (u.seq !== undefined) m.SequenceNo = u.seq;
      if (u.hidden !== undefined) m.Ishidden = !!u.hidden;
      if (u.icon !== undefined) m.IconURL = u.icon;
      if (u.landing) for (const x of items.filter(x => x.IsLandingPageMenu && x.MenuID !== m.MenuID)) { await saveItem({ ...x, IsEdit: true, IsLandingPageMenu: false }); }
      if (u.landing !== undefined) m.IsLandingPageMenu = !!u.landing;
      await saveItem(m); want.push(m);
    }
    const r = await done();
    for (const w of want) {
      const b = items.find(m => m.MenuID === w.MenuID);
      if (!b) { problems.push(`${w.Title}: gone`); continue; }
      for (const k of ['Title', 'ParentID', 'Level', 'SequenceNo', 'Ishidden', 'IconURL', 'IsLandingPageMenu']) if ((b[k] ?? '') !== (w[k] ?? '')) problems.push(`${w.Title}: ${k} ${b[k]} != ${w[k]}`);
    }
    return { ...r, ok: !problems.length, updated: want.map(m => m.Title) };
  }

  if (o.action === 'group') {
    if (!o.title) throw new Error('group needs title');
    const tpl = items.find(m => m.Type === 0);
    if (!tpl) throw new Error('No existing group to copy');
    const p = o.parent ? find(o.parent) : null;
    const g = { ...tpl, MenuID: crypto.randomUUID(), IsEdit: false, Title: o.title, TypeID: '0', Mode: 0, ParentID: p ? p.MenuID : '', Level: p ? p.Level + 1 : 1,
      SequenceNo: o.seq ?? Math.max(0, ...items.filter(m => m.ParentID === (p ? p.MenuID : '')).map(m => m.SequenceNo)) + 1,
      Ishidden: false, IsLandingPageMenu: false, FilterConfiguration: '', SortConfiguration: '', Permissions: [], PermissionType: 0 };
    await saveItem(g);
    const r = await done();
    if (!items.some(m => m.MenuID === g.MenuID && m.Title === o.title)) problems.push('group not found on read-back');
    return { ...r, ok: !problems.length, id: g.MenuID };
  }

  if (o.action === 'delete') {
    if (o.confirm !== true) throw new Error('delete needs confirm:true (or save the item with hidden:true instead)');
    const del = (o.menus || []).map(find);
    for (const m of del) if (items.some(x => x.ParentID === m.MenuID)) throw new Error(`${m.Title} has child items; move or delete them first`);
    for (const m of del) await ca.call('POST', D + 'Settings/DeleteMenuItem', withClient(m));
    const r = await done();
    for (const m of del) if (items.some(x => x.MenuID === m.MenuID)) problems.push(`${m.Title}: still present`);
    return { ...r, ok: !problems.length, deleted: del.map(m => m.Title) };
  }
  throw new Error("action must be 'list', 'update', 'group' or 'delete'");
}

await menuTool(globalThis.CAE_OPTIONS || {});
