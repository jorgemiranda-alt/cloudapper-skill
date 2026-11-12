// List and add parent/child links between forms (api-forms-menus.md §5) with
// POST DAPI EntityType/SaveParentChildRelations, which only adds (existing links stay). Run after ca.js;
// writes need ca.setClient. Specs (opts):
//   { action:'list' }  -> [{ parent, child, childKind: 'form'|'child form' }]
//   { action:'link', parent:<title|id>, children:[<title|id>, ..], confirm:true }  -> reads the links back
//   { action:'unlink', parent:<title|id>, child:<title|id>, confirm:true, confirmWithRecords?:<count> }  -> returns the removed relation(s) as `backup`
// Linking turns each child form into a child form of the parent (an EventType: it leaves the design object's
// EntityTypes and appears in EventTypes, fields kept). Create a child form with create-form.js, then link it.
// Unlink: POST DAPI EntityType/UnlinkChildFromParent/{parentId}/{childId}/{appId}/{clientId} (the designer warns
// it affects the child's records). Delete a child form with create-form.js remove (EventType/DeleteEventType).

async function relationTool(o = {}) {
  const ca = window.ca;
  if (!ca) throw new Error("Load ca.js first: run('ca.js', {}).");
  const D = ca.designBase;
  const tok = (localStorage.getItem('accessToken') || '').replace(/"/g, '');
  const sub = JSON.parse(atob(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub;
  const design = async () => (await ca.call('GET', D + `user-management/get-app-data-for-design/${ca.clientId}/${ca.appId}/${sub}`)).Result;
  let d = await design();
  const name = id => (d.EntityTypes.find(e => e.EntityTypeID === id) || {}).Tittle || ((d.EventTypes || []).find(e => e.EventTypeID === id) || {}).Tittle || id;
  const list = () => d.ParentChildRelations.map(r => ({ parent: name(r.ParentId), child: name(r.ChildId), childKind: d.EntityTypes.some(e => e.EntityTypeID === r.ChildId) ? 'form' : 'child form' }));
  if (!o.action || o.action === 'list') return list();
  if (o.action !== 'link' && o.action !== 'unlink') throw new Error("action must be 'list', 'link' or 'unlink'");
  if (o.confirm !== true) throw new Error(o.action + ' needs confirm:true (link converts the child into a child form)');

  await ca.save('__none__', []).catch(e => { if (/Write refused/.test(e.message)) throw e; }); // client guard
  const idOf = k => { const e = d.EntityTypes.find(x => x.EntityTypeID === k || x.Tittle === k) || (d.EventTypes || []).find(x => x.EventTypeID === k || x.Tittle === k); if (!e) throw new Error('No form ' + k); return e.EntityTypeID || e.EventTypeID; };
  const parentId = idOf(o.parent);
  if (o.action === 'unlink') {
    const childId = idOf(o.child);
    if (!d.ParentChildRelations.some(r => r.ParentId === parentId && r.ChildId === childId)) throw new Error(`${o.child} is not a child of ${o.parent}`);
    const n = await ca.count(childId);
    if (n !== 0 && o.confirmWithRecords !== n) throw new Error(`${o.child} has ${n} records; pass confirmWithRecords:${n} to unlink anyway.`);
    // The child's own design object too: unlinking can change it or remove it ('gone'), and the link alone can't restore that.
    const before = d.ParentChildRelations.length, backup = JSON.parse(JSON.stringify({ relations: d.ParentChildRelations.filter(r => r.ParentId === parentId && r.ChildId === childId),
      child: d.EntityTypes.find(e => e.EntityTypeID === childId) || (d.EventTypes || []).find(e => e.EventTypeID === childId) }));
    await ca.call('POST', D + `EntityType/UnlinkChildFromParent/${parentId}/${childId}/${ca.appId}/${ca.clientId}`, null);
    d = await design();
    const problems = d.ParentChildRelations.some(r => r.ParentId === parentId && r.ChildId === childId) ? ['link still listed'] : [];
    const kind = d.EntityTypes.some(e => e.EntityTypeID === childId) ? 'form' : (d.EventTypes || []).some(e => e.EventTypeID === childId) ? 'child form' : 'gone';
    return { ok: !problems.length, action: 'unlink', backupName: 'relation-' + String(o.parent).replace(/[^\w-]+/g, '_'), backup, relations: { before, after: d.ParentChildRelations.length }, childNow: kind, records: { before: n, after: kind === 'gone' ? null : await ca.count(childId).catch(() => null) }, problems };
  }
  const childIds = (o.children || []).map(idOf);
  if (!childIds.length) throw new Error('link needs children');
  const before = d.ParentChildRelations.length;
  await ca.call('POST', D + 'EntityType/SaveParentChildRelations', { parentId, childIds, appId: ca.appId, ClientId: Number(ca.clientId), SchemaMode: 0 });
  d = await design();
  const problems = childIds.filter(c => !d.ParentChildRelations.some(r => r.ParentId === parentId && r.ChildId === c)).map(c => `link to ${name(c)} not found`);
  return { ok: !problems.length, action: 'link', relations: { before, after: d.ParentChildRelations.length }, links: list().filter(r => r.parent === name(parentId)), problems };
}

await relationTool(globalThis.CAE_OPTIONS || {});
