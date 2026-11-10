// Create, edit or remove a form through the design API (WP-071, WP-080, WP-081), from the stored field
// templates in scripts/field-templates/ only: never copies a field from another form.
//
// Run in a signed-in page of the app with the loader in references/playwright-efficiency.md §3, after
// `run('ca.js', {})` and `ca.setClient('<clientId>')` (writes are refused otherwise). The loader must pass
// the templates: `templates: { _form, text, number, ... }` fetched from save_server.py as `ft-<type>.json`.
// Specs (opts):
//   { action:'create', title, description?, fields:[{label, type, unique?, mandatory?, hint?, choices?, visible?}] }
//   { action:'edit', form:<title|id>, add:[fields], update:[{label, newLabel?, mandatory?, unique?, hint?}], remove:[labels] }
//   { action:'remove', form:<title|id>, confirm:true, confirmWithRecords?:<count>, confirmRelations?:true }
// Types: text, number, decimal, email, date, datetime, yesno, switch, dropdown (choices), textarea,
// formref (target:<form title|id>), attachment. A template with verified:false is used but reported in `unverified`.
// Returns { ok, action, form, id, fields:[names], records:{before, after}, problems:[..], unverified:[..] };
// remove also returns `backup` (the full design object): the loader saves it to a file and drops it.

async function createForm(o = {}) {
  const ca = window.ca;
  if (!ca) throw new Error("Load ca.js first: run('ca.js', {}).");
  const T = o.templates || {};
  if (!T._form) throw new Error('Pass templates (ft-_form.json and ft-<type>.json) from the loader.');
  const D = ca.designBase, A = ca.apiBase, client = ca.clientId, app = ca.appId;
  const tok = (localStorage.getItem('accessToken') || '').replace(/"/g, '');
  const sub = JSON.parse(atob(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub;
  const design = async () => (await ca.call('GET', D + `user-management/get-app-data-for-design/${client}/${app}/${sub}`)).Result;
  const clone = x => JSON.parse(JSON.stringify(x));
  const problems = [], unverified = new Set();
  const isUser = f => /Field\d+$/.test(f.Name || '');
  // Every write goes through ca.save's guard: probe it with an empty save so the client check runs first.
  const guard = () => ca.save('__none__', []).catch(e => { if (/Write refused/.test(e.message)) throw e; });
  await guard();

  let d = await design();
  // Child forms are EventTypes (EventTypeID), made by linking a form to a parent (relation.js).
  const find = key => d.EntityTypes.find(e => e.EntityTypeID === key || e.Tittle === key) || (d.EventTypes || []).find(e => e.EventTypeID === key || e.Tittle === key);
  const hasRelations = id => d.ParentChildRelations.some(r => JSON.stringify(r).includes(id));

  const nextIndex = (fields, prefix) => Math.max(-1, ...fields.map(f => (f.Name.match(new RegExp('^' + prefix + '(\\d+)$')) || [])[1]).filter(Boolean).map(Number)) + 1;
  const setCounters = (form) => {
    for (const t of Object.values(T)) if (t.counter) form[t.counter] = nextIndex(form.AllFields, t.prefix);
  };
  const place = (f, i) => { // i = 0-based position among user fields: alternate columns, row = SequenceNumber
    const col = (i % 2) + 1, row = Math.floor(i / 2) + 1;
    Object.assign(f, { ColumnNumber: col, GroupNumber: 1, SequenceNumber: row, TabIndex: i + 1 });
    const s = JSON.parse(f.StyleSettings || '{}');
    s.layoutConfigurations = (s.layoutConfigurations || []).map(l => l.platform === 0 ? { ...l, ColumnNumber: col, GroupNumber: 1, SequenceNumber: row - 1 } : l);
    f.StyleSettings = JSON.stringify(s);
  };
  const colors = ['#0cad7d', '#fd397a', '#337ab7', '#ffb822', '#5d78ff', '#a0a0a0'];
  const makeField = (spec, fields) => {
    const t = T[spec.type];
    if (!t || !t.field) throw new Error(`No template for type ${spec.type}`);
    if (!t.verified) unverified.add(spec.type);
    const f = clone(t.field);
    const name = t.prefix + nextIndex(fields, t.prefix);
    Object.assign(f, { Name: name, Label: spec.label, Hint: spec.hint ?? `Enter ${spec.label}`, Mandatory: !!spec.mandatory, UniqueField: !!spec.unique });
    if (spec.type === 'formref') { // EntityTypeID = the form it points to
      const target = d.EntityTypes.find(x => x.EntityTypeID === spec.target || x.Tittle === spec.target);
      if (!target) throw new Error(`Form reference ${spec.label}: no target form ${spec.target}`);
      f.EntityTypeID = target.EntityTypeID;
    }
    if (spec.type === 'dropdown') { // key = label (WP-043, WP-061)
      const c = spec.choices || [];
      if (!c.length) throw new Error(`Dropdown ${spec.label} needs choices`);
      f.DefaultItems = JSON.stringify(Object.fromEntries(c.map(x => [x, x])));
      f.DefaultValue = c.join(',');
      const s = JSON.parse(f.StyleSettings); s.colorOptions = c.map((x, i) => ({ choiceId: x, colorCode: colors[i % colors.length] })); f.StyleSettings = JSON.stringify(s);
    }
    return f;
  };
  const save = async form => {
    const r = await ca.call('POST', D + 'EntityType/SaveEntityType', { ...form, ParentSchemas: [], ChildSchemas: [] });
    if (r && (r.IsSaved === false || r.Success === false)) throw new Error('SaveEntityType: ' + String(r.Message || JSON.stringify(r)).slice(0, 200));
  };
  const count = id => ca.count(id);
  // Read back: every spec field matches by label on type, DataType, unique flag, mandatory flag and column.
  const verify = async (id, want) => {
    d = await design(); const e = find(id);
    if (!e) { problems.push('form not found on read-back'); return null; }
    for (const w of want) {
      const f = e.AllFields.find(x => x.Label === w.Label && isUser(x));
      if (!f) { problems.push(`missing ${w.Label}`); continue; }
      for (const k of ['Name', 'ControlType', 'DataType', 'UniqueField', 'Mandatory', 'ColumnNumber', 'EntityTypeID']) if ((f[k] ?? '') !== (w[k] ?? '')) problems.push(`${w.Label}: ${k} ${f[k]} != ${w[k]}`);
    }
    return e;
  };

  if (o.action === 'create') {
    if (!o.title || !(o.fields || []).length) throw new Error('create needs title and fields');
    if (find(o.title)) throw new Error(`A form named ${o.title} exists already`);
    const id = crypto.randomUUID();
    const form = Object.assign(clone(T._form.form), { EntityTypeID: id, GlobalTypeID: crypto.randomUUID(), Tittle: o.title, Description: o.description || '', IsEdit: false, Version: '0', EntitityXML: '', Client: clone(d.EntityTypes[0].Client) });
    const sec = Object.assign(clone(T._form.section), { Name: crypto.randomUUID() });
    const cols = [1, 2].map(c => Object.assign(clone(T._form.column), { GroupNumber: 1, ColumnNumber: c }));
    const user = [];
    o.fields.forEach((s, i) => { const f = makeField(s, user); place(f, i); user.push(f); });
    form.AllFields = [sec, ...cols, ...user, ...clone(T._form.systemFields).map(f => ({ ...f, ColumnNumber: 1, GroupNumber: 1 }))];
    setCounters(form);
    await save(form);
    const e = await verify(id, user);
    if (!e) return { ok: false, action: 'create', problems };
    await ca.call('POST', D + 'EntityType/SaveRolePrivilegeForEntityTypes', { EntityTypeID: id, PrivilegeCodes: 32655, RoleID: d.Role.RoleID });
    // Primary View (WP-080): public, default, on the form's list menu (Mode 2).
    let menu = null;
    for (let i = 0; i < 5 && !menu; i++) {
      const items = await ca.call('POST', D + 'Settings/GetAllDynamicMenuItems', { ClientID: client, AppId: app });
      menu = (items.Result || items || []).find(m => m.TypeID === id && m.Mode === 2);
      if (!menu) await new Promise(r => setTimeout(r, 2000));
    }
    let view = 'none';
    if (!menu) problems.push('no list menu (Mode 2) for the form; Primary View not created');
    else {
      const views = (await ca.call('GET', A + 'v3/formviews/')).Result || [];
      if (views.some(v => v.TypeId === id && v.Title === 'Primary View')) view = 'kept existing';
      else {
        const vis = o.fields.some(f => f.visible) ? user.filter((f, i) => o.fields[i].visible) : user.slice(0, 5);
        await ca.call('POST', A + 'v3/formviews/', { Title: 'Primary View', Description: '', ViewType: 1, ItemLayout: { LayoutType: 0 }, TypeId: id, MenuId: menu.MenuID, DefaultView: true, PermissionType: 2,
          FormViewPermissions: [{ PermissionType: 2, PermittedId: '' }, { PermissionType: 1, PermittedId: sub }],
          ViewDefinition: { ViewType: 1, ItemLayout: { LayoutType: 0 }, Fields: vis.map(f => f.Name), FilterConfiguration: { Condition: 'AND', Rules: [] }, SortConfigurations: [] } });
        const back = ((await ca.call('GET', A + 'v3/formviews/')).Result || []).find(v => v.TypeId === id && v.Title === 'Primary View');
        view = back ? `created (${(back.ViewDefinition?.Fields || []).length} columns, default ${back.DefaultView})` : 'POST sent but not found on read-back';
        if (!back) problems.push(view);
      }
    }
    return { ok: !problems.length, action: 'create', form: o.title, id, fields: user.map(f => `${f.Name}:${f.Label}`), menu: menu ? menu.Title : null, view, records: { after: await count(id) }, problems, unverified: [...unverified] };
  }

  const e = find(o.form);
  if (!e) throw new Error('No form ' + o.form);
  const id = e.EntityTypeID || e.EventTypeID;

  if (o.action === 'edit') {
    if (hasRelations(id)) throw new Error('Form has parent/child relations: edit it per WP-078 caveats, not with this script (WP-071).');
    const before = await count(id);
    const form = clone(e); form.IsEdit = true;
    const labels = new Set(form.AllFields.filter(isUser).map(f => f.Label));
    for (const l of o.remove || []) { if (!labels.has(l)) problems.push(`remove: no field ${l}`); }
    form.AllFields = form.AllFields.filter(f => !(isUser(f) && (o.remove || []).includes(f.Label)));
    for (const u of o.update || []) {
      const f = form.AllFields.find(x => isUser(x) && x.Label === u.label);
      if (!f) { problems.push(`update: no field ${u.label}`); continue; }
      if (u.newLabel) f.Label = u.newLabel;
      if (u.hint !== undefined) f.Hint = u.hint;
      if (u.mandatory !== undefined) f.Mandatory = !!u.mandatory;
      if (u.unique !== undefined) f.UniqueField = !!u.unique;
    }
    if (problems.length) return { ok: false, action: 'edit', form: e.Tittle, problems };
    const users = form.AllFields.filter(isUser);
    const added = [];
    // Next free name per counter, counting the fields before removal so a removed field's name is not reused.
    const named = [...e.AllFields.filter(isUser)];
    (o.add || []).forEach((s, i) => { const f = makeField(s, named); place(f, users.length + i); named.push(f); added.push(f); });
    const sys = form.AllFields.findIndex(f => f.ControlType === 99);
    form.AllFields.splice(sys < 0 ? form.AllFields.length : sys, 0, ...added);
    // Second column for forms made before WP-080 that have only one.
    if (added.length && !form.AllFields.some(f => f.ControlType === 8 && f.ColumnNumber === 2)) form.AllFields.splice(form.AllFields.findIndex(f => f.ControlType === 8) + 1, 0, Object.assign(clone(T._form.column), { GroupNumber: 1, ColumnNumber: 2 }));
    for (const t of Object.values(T)) if (t.counter) form[t.counter] = Math.max(form[t.counter] || 0, nextIndex(named, t.prefix));
    await save(form);
    const want = form.AllFields.filter(isUser);
    const back = await verify(id, want);
    if (back) for (const l of o.remove || []) if (back.AllFields.some(f => isUser(f) && f.Label === l)) problems.push(`still present: ${l}`);
    const after = await count(id);
    if (after !== before) problems.push(`record count changed ${before} -> ${after}`);
    return { ok: !problems.length, action: 'edit', form: e.Tittle, id, fields: back ? back.AllFields.filter(isUser).map(f => `${f.Name}:${f.Label}`) : [], records: { before, after }, problems, unverified: [...unverified] };
  }

  if (o.action === 'remove') {
    if (o.confirm !== true) throw new Error('remove needs confirm:true');
    const n = await count(id);
    if (n !== 0 && o.confirmWithRecords !== n) throw new Error(`Form has ${n} records; pass confirmWithRecords:${n} to remove it anyway.`);
    if (hasRelations(id) && o.confirmRelations !== true) throw new Error('Form has parent/child relations; pass confirmRelations:true to remove it with them.');
    const wfs = ((await ca.call('GET', A + 'v3/Workflows')).Result || []).filter(w => JSON.stringify(w).includes(id)).map(w => w.Name);
    if (wfs.length) throw new Error('Workflows reference this form: ' + wfs.join(', '));
    const backup = clone(e);
    // A child form (EventType) has its own delete call; DeleteEntityType on one returns without error and does nothing.
    const body = clone(e); body.Client = { ...(body.Client || {}), ClientName: (d.Client || {}).ClientName, AppName: (d.App || {}).AppName };
    const r = e.EventTypeID
      ? await ca.call('POST', D + 'EventType/DeleteEventType/abc', { eventType: body, LiAnalyticsSetting: null })
      : await ca.call('POST', D + 'EntityType/DeleteEntityType', { entityType: body, LiAnalyticsSetting: null });
    if (r && r.IsSaved === false) problems.push('delete answered IsSaved:false');
    d = await design();
    const gone = !find(id);
    const forms = (await ca.call('GET', A + `v3/Apps/${app}/details`)).Result.Schemas.some(s => s.Id === id);
    if (!gone) problems.push('form still in the design object');
    if (forms) problems.push('form still in app details');
    if (hasRelations(id)) problems.push('relation still listed');
    return { ok: !problems.length, action: 'remove', form: e.Tittle, id, records: { before: n }, problems, backup };
  }
  throw new Error("action must be 'create', 'edit' or 'remove'");
}

await createForm(globalThis.CAE_OPTIONS || {});
