# Copying features or a whole app between CloudApper apps

Typical case: copy Production → UAT (or an older app) so the target behaves exactly like the source. The source is read-only. The target is changed only after the user confirms the environment.

**A feature is not only its form and workflow.** It also needs its relations, role access, menus, UI workflows, buttons, reports, workflow order and on/off state, and the **setup records** its workflows read. Missing any of these is what makes a copied workflow freeze or produce wrong numbers.

## Contents
1. Before you start
2. Order of work
3. ID remapping
4. Checklist per part
5. Verification
6. Lessons learned

## 1. Before you start

- Confirm source and target apps/accounts and which one is Production. Only one account can be signed in at a time in the Playwright browser; plan the sign-in switches with the user.
- Snapshot **both** apps to local files: details (forms, relations, menus, roles, UI workflows), all workflows, report list and report packages. Keep the target's snapshot as the rollback backup until the user confirms the result. Mark folders that contain connector credentials.
- Diff by **name** (form titles, field names, menu titles, workflow names, report names): new / changed / target-only.
- Ask what to do with target-only items (keep, remove) and with new workflows (copy off, copy on). Recommend: copy off, then match the source's on/off and order once everything is in place.

## 2. Order of work

1. Forms: new top-level forms → new child forms → update existing forms.
2. Parent-child relations, then **role privileges** for every new form.
3. Menus (structure, titles, hidden flags, permissions).
4. UI workflows (one JSON list).
5. Workflows (create/update, remapped), then **match on/off state and order** to the source.
6. Reports (export packages from source, import into target with schema mapping), then buttons that reference reports or UI workflows, and workflows that send reports.
7. **Setup / configuration records** the workflows read.
8. Removals the user approved, last.
9. Verify, refresh the runtime, hand over test steps.

## 3. ID remapping

Build maps and apply them to every JSON body you write:

| Kind | How to map |
|---|---|
| App ID, client ID | fixed replacement |
| Form IDs | by form title; new forms get your own GUID, stored in a map file reused by every later step |
| Record references in workflows (`{DisplayName, id, TypeId}`, `ParentId`, `<field>ReferenceId`) | look up the target record with the same `DisplayName` in the same form; some copied records keep the same ID |
| Credential-store IDs (`CredentialGroup` + Value) | per group, map to the target's credential of the same group; never print values |
| Report IDs (buttons, email workflows) | from the import results (source report ID → new ID) |
| UI workflow IDs | keep the same IDs (free text) |
| Workflow AutomationIds | target's own; update by name |
| Menu IDs | target's own; match by form + type + mode (child menus may be Type 2 in one app and 1 in the other) |

## 4. Checklist per part

**Forms**
- [ ] Top-level bodies captured from the source designer (blocked save), remapped, saved in the target (save-swap).
- [ ] Child forms saved separately with `ParentSchemas` (design fields from `EventTypes`), then `SaveParentChildRelations` (adds children).
- [ ] Buttons (`CustomActionsConfiguration`) remapped; buttons whose targets don't exist yet are added later.
- [ ] `SaveRolePrivilegeForEntityTypes` (32655) for each new form and the admin role, otherwise menus stay hidden.

**Menus**
- [ ] Titles, parents, sequence, hidden flags, permissions match; new items created with a generated MenuID; real client set on every save.

**UI workflows**
- [ ] Full list written back with the new entries, form IDs remapped.

**Workflows**
- [ ] Definitions created/updated with all IDs remapped; none still contain the source app/client ID.
- [ ] **On/off state identical to the source**, switching off before on so two versions of the same step (e.g. an old and a new version of a calculation workflow) never run together.
- [ ] **Order identical to the source** (relative order; exact numbers may differ by gaps). Order decides which workflows a workflow can trigger.
- [ ] Target-only workflows that duplicate a source workflow turned off (or removed if approved).

**Reports**
- [ ] Packages exported from the source (read-only), imported with the schema map, layouts checked for leftover source form IDs.
- [ ] Report buttons and report-sending workflows remapped to the new report IDs.

**Setup / configuration data** (forms whose *records* drive logic)
- [ ] Identify every lookup in the copied workflows (rules, cut-offs, settings, mappings, derived fields such as full paths, emails, flags) and confirm the target has equivalent records/values. Ask the user for values rather than reading Production when Production is off-limits.
- [ ] Run (or ask the user to run) helper workflows that populate derived fields (e.g. "Populate Full Path to Locations").

## 5. Verification

- Field-by-field compare of every form (name, label, type, reference form by title, choices, mandatory, unique).
- Relations, privileges, menus (runtime `Menus` count = expected), UI workflows, buttons point to existing reports, no source IDs left in workflows, on/off and order equal to the source.
- Ask the user to click the runtime refresh icon, then run one end-to-end test in the target; read execution logs and timings.

## 6. Lessons learned

- Copying newer definitions onto active old workflows while the newer companion workflows stay off **breaks live pipelines**. Make on/off and order match in the same session.
- Don't delete the target backup at cleanup until the user has tested.
- Reports: package import beats rebuilding layouts by hand.
- Flags on setup records drive which report/route is used (e.g. a flag on a site record deciding which report or email route applies). Copy those values too, and check hidden fields that the form layout does not show.
- API-created forms need the privilege call; designer-created ones get it automatically.
