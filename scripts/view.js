// List, create, update and delete saved list views (WP-073, WP-080) through `API v3/formviews/`. Run after ca.js
// (cloudapper_run or the loader); writes need ca.setClient. Fields and filter fields may be labels or internal names.
// Specs (opts):
//   { action:'list', form? }  -> [{ id, title, form, menu, default, public, fields }]
//   { action:'create', form, title, fields:[..], filter?:{Condition, Rules:[{Field, Operator, Value}|{Condition, Rules}]},
//     default?:false, public?:true, menu?:<menu id> }   (menu default: the form's list menu, Mode 2)
//   { action:'update', view:<id>, title?, fields?, filter?, default?, public? }
//   { action:'delete', view:<id>, confirm:true }
// Filter values are stored values (dropdown keys, WP-061). Sort is not supported (format unknown, WP-073).
// Writes return `backup` (the full view list) for the runner to save, then read the list back.

async function viewTool(o = {}) {
  const ca = window.ca;
  if (!ca) throw new Error("Load ca.js first: run('ca.js', {}).");
  const A = ca.apiBase, D = ca.designBase;
  const views = async () => (await ca.call('GET', A + 'v3/formviews/')).Result || [];
  const forms = await ca.forms();
  const formOf = k => { const f = forms.find(x => x.id === k || x.title === k); if (!f) throw new Error('No form ' + k); return f; };
  const menus = async () => { const r = await ca.call('POST', D + 'Settings/GetAllDynamicMenuItems', { ClientID: ca.clientId, AppId: ca.appId }); return r.Result || r; };
  const def = v => typeof v.ViewDefinition === 'string' ? JSON.parse(v.ViewDefinition) : (v.ViewDefinition || {});
  let list = await views();
  if (!o.action || o.action === 'list') {
    const m = await menus();
    return list.filter(v => !o.form || v.TypeId === formOf(o.form).id).map(v => ({ id: v.Id, title: v.Title, form: (forms.find(f => f.id === v.TypeId) || {}).title,
      menu: (m.find(x => x.MenuID === v.MenuId) || {}).Title || '', default: v.DefaultView, public: v.PermissionType === 2, fields: (def(v).Fields || []).length }));
  }

  await ca.save('__none__', []).catch(e => { if (/Write refused/.test(e.message)) throw e; }); // client guard
  const tok = (localStorage.getItem('accessToken') || '').replace(/"/g, '');
  const sub = JSON.parse(atob(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub;
  const backup = JSON.parse(JSON.stringify(list));
  const problems = [];
  const names = async form => { const fs = await ca.fields(form); return k => { const f = fs.find(x => x.name === k || x.label === k); if (!f) throw new Error(`No field ${k} in ${form}`); return f.name; }; };
  const mapFilter = (flt, nm, typeId) => flt && { Condition: flt.Condition || 'AND', Rules: (flt.Rules || []).map(r => r.Rules ? mapFilter(r, nm, typeId) : { ...r, Field: nm(r.Field), TypeId: typeId }) };
  const perms = pub => pub === false ? [{ PermissionType: 1, PermittedId: sub }] : [{ PermissionType: 2, PermittedId: '' }, { PermissionType: 1, PermittedId: sub }];
  const check = (b, want) => {
    if (!b) return problems.push('view not found on read-back');
    const d = def(b);
    if (want.Title !== undefined && b.Title !== want.Title) problems.push(`Title ${b.Title}`);
    if (want.DefaultView !== undefined && b.DefaultView !== want.DefaultView) problems.push(`DefaultView ${b.DefaultView}`);
    if (want.PermissionType !== undefined && b.PermissionType !== want.PermissionType) problems.push(`PermissionType ${b.PermissionType}`);
    if (want.Fields && JSON.stringify(d.Fields) !== JSON.stringify(want.Fields)) problems.push(`Fields ${JSON.stringify(d.Fields)}`);
    if (want.Filter && JSON.stringify(d.FilterConfiguration) !== JSON.stringify(want.Filter)) problems.push('FilterConfiguration differs');
  };
  const out = extra => ({ ok: !problems.length, action: o.action, backupName: 'views', views: { before: backup.length, after: list.length }, problems, ...extra, backup });

  if (o.action === 'create') {
    const f = formOf(o.form); const nm = await names(f.id);
    if (!o.title || !(o.fields || []).length) throw new Error('create needs title and fields');
    if (list.some(v => v.TypeId === f.id && v.Title === o.title)) throw new Error(`${f.title} already has a view ${o.title}`);
    const menuId = o.menu || ((await menus()).find(m => m.TypeID === f.id && m.Mode === 2) || {}).MenuID;
    if (!menuId) throw new Error(`No list menu (Mode 2) for ${f.title}; pass menu`);
    const Fields = o.fields.map(nm), Filter = mapFilter(o.filter, nm, f.id) || { Condition: 'AND', Rules: [] };
    const want = { Title: o.title, DefaultView: !!o.default, PermissionType: o.public === false ? 1 : 2, Fields, Filter };
    if (o.default) for (const v of list.filter(v => v.MenuId === menuId && v.DefaultView)) await ca.call('PUT', A + 'v3/formviews/' + v.Id, { ...v, DefaultView: false });
    await ca.call('POST', A + 'v3/formviews/', { Title: o.title, Description: o.description || '', TypeId: f.id, MenuId: menuId, DefaultView: want.DefaultView,
      PermissionType: want.PermissionType, FormViewPermissions: perms(o.public), ViewType: 1,
      ViewDefinition: { ViewType: 1, ItemLayout: { LayoutType: 0 }, Fields, FilterConfiguration: Filter, SortConfigurations: [] } });
    list = await views();
    const b = list.find(v => v.TypeId === f.id && v.Title === o.title); check(b, want);
    return out({ id: b && b.Id, form: f.title });
  }

  const v = list.find(x => x.Id === o.view);
  if (!v) throw new Error('No view ' + o.view + ' (pass its id; action list shows them)');

  if (o.action === 'update') {
    const nm = await names(v.TypeId); const d = def(v);
    const body = { ...v, ViewDefinition: { ...d } };
    if (o.title !== undefined) body.Title = o.title;
    if (o.default !== undefined) body.DefaultView = !!o.default;
    if (o.public !== undefined) { body.PermissionType = o.public ? 2 : 1; body.FormViewPermissions = perms(o.public); }
    if (o.fields) body.ViewDefinition.Fields = o.fields.map(nm);
    if (o.filter) body.ViewDefinition.FilterConfiguration = mapFilter(o.filter, nm, v.TypeId);
    if (typeof v.ViewDefinition === 'string') body.ViewDefinition = JSON.stringify(body.ViewDefinition);
    await ca.call('PUT', A + 'v3/formviews/' + v.Id, body); // POST with an existing Id fails (duplicate key)
    list = await views();
    check(list.find(x => x.Id === v.Id), { Title: body.Title, DefaultView: body.DefaultView, PermissionType: body.PermissionType, Fields: o.fields && o.fields.map(nm) });
    if (list.length !== backup.length) problems.push(`view count ${backup.length} -> ${list.length} (update created a copy?)`);
    return out({ id: v.Id });
  }

  if (o.action === 'delete') {
    if (o.confirm !== true) throw new Error('delete needs confirm:true');
    await ca.call('DELETE', A + 'v3/formviews/' + v.Id);
    list = await views();
    if (list.some(x => x.Id === v.Id)) problems.push('view still present');
    return out({ deleted: v.Title });
  }
  throw new Error("action must be 'list', 'create', 'update' or 'delete'");
}

await viewTool(globalThis.CAE_OPTIONS || {});
