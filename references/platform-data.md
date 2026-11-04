# CloudApper platform: forms, fields, menus, roles, reports

Tenants, clusters, IDs and caching: `platform-model.md`. Workflows: `platform-workflows.md`.

## 2. Forms (entity types) and child forms (event types)

- Top-level forms are **entity types**; child forms (tables under a parent record, e.g. order lines under an order) are **event types**. The runtime API calls both "Schemas".
- A child form is saved on its own with `ParentSchemas: [<parent runtime schema>]` and a `ParentFilterConfiguration`; the link itself is a **parent-child relation** saved separately (`SaveParentChildRelations`). Saving a parent with `ChildSchemas` does not create the relation.
- A child can appear inside the parent form as a **subform control** (ControlType 41, field `subformListN`); workflows creating such children use `parentReferenceField: "subformListN"`. Children without a subform control (e.g. a confirmation form opened by a button) use `parentReferenceField: ""` plus a `ParentId` assignment.
- Records have system fields: `id`, `ParentId`, `ParentTypeId`, `ParentDisplayName`, `DisplayName` (the record title), `CreateDate`, `LastModifyDate`, `CreatedBy`, `Status`.
- Buttons on a form are `CustomActionsConfiguration` entries: `ActivityType` 1 = set a field value, 2 = open a report (`ReportId`), 3 = trigger workflow, 4 = trigger UI workflow (`UIWorkflowId`), 5 = trigger backend workflow, 6 = HTML report. `VisibilityRuleset` shows a button only when rules match (e.g. Location = X; match both the display text and the record ID to be safe).

## 3. Fields

- Internal names by type: `stringFieldN`, `numericFieldN`, `dateFieldN`, `booleanFieldN`, `integerFieldN`; group boxes/sections have GUID names. Read them from the create form (`data-testid="field-stringFieldN"`) or the details API.
- Common ControlTypes: 2 choice (dropdown), 3 date-time, 4 text/number, 5 text area, 8 column break, 9 section, 11 date, 12 reference (lookup of another form, value = display text + `<field>ReferenceId`), 33/34 radio/time choices, 38 lookup-display, 41 subform, 99 system field.
- Choice fields keep `DefaultItems` (value → label), `RadioButtonChoices`/`ComboBoxChoices` and colour options in `StyleConfiguration`/`StyleSettings` (string copy). Change all of them together.
- `PublishStatus` on a field: group boxes are often unpublished; that is normal.

## 4. Menus and roles

- Saving a form creates default menus: a group item (Type 0), "Add X" (Mode 1) and a list (Mode 2), often hidden. Visible structure = items with `Ishidden: false` and their `ParentID`/`SequenceNo`.
- Menus are edited through the design API (`SaveDynamicMenuItem`, `DeleteMenuItem`). The list endpoint returns `Client.ClientID = 0`; set the real client/app on every save, or the call silently does nothing.
- **Role privileges** (`RecordRolePrivileges`: RoleId, TypeId, PrivilegeCodes) decide which forms a role can use. `32655` = full access, `8` = custom-type default. The runtime hides menus of forms the user's role has no privilege for.

## 7. Reports

- DevExpress reports; `LayoutContent` is base64 `.repx` XML. Data sources point at form IDs.
- Export a report as a signed **`.carpkg`** package (zip with `metadata.json` listing `SchemasIdMap` title → form ID). **Import Report** (Report page) asks you to map each package schema to a target form: the clean way to copy reports between apps.
- Report buttons on forms reference the report ID, so copying reports means remapping buttons and any workflow that emails a report.

## More details (learned from several production apps)

V = verified in those apps, I = inferred. Check I items in the JSON before relying on them.

**Fields, buttons, records**
- Field options: auto-sequence ID (`0XXXXX`, leading zeros matter when matching), random-value generator, datetime "autofill now", read-only parent lookup on child forms. Computed fields stay editable on create unless set read-only. V
- A choice field's **stored value can differ from its label** (stores `Fail`, shows "Failed"). Button visibility rules and workflow conditions compare the stored value. V
- A form button can pass the record's Unique ID to an on-demand workflow. V
- Form **auto-save** + datetime "autofill now" = one-tap kiosk entry. V
- **Audit Log tab** on a record: workflow changes show the workflow name and `WorkflowService v1.1.0`; user edits show `Web v8.2.0.x`. Fastest way to tell "a workflow did it" from "someone edited it". V
- List views apply filters (a Default view showed 65 of 489). Read counts from the API. V

**Designer, roles, sign-in, dashboards**
- Designer tabs: Solution Builder (forms), User Experience (menus, dashboards, roles, users), AI Agents & Automation, Settings. Open it with ⋮ → Edit Design on the client tile or ✎ in the app header. V
- Roles have **Design app** and **Publish** flags. The Reports module can be switched off per app. V
- Runtime create URL: `/<client>/app/<app>/create/<formId>/<menuId>`. V
- Sign-in: account.cloudapper.com (OpenID Connect, code + PKCE): email/password, one-time code, Apple, Google, Microsoft, Enterprise SSO. Assets on AWS S3. If sign-in loops on "clearing previous session data", clear the cloudapper.com cookies. V
- Dashboard widgets query a search index with Solr-style filters and have their own ↻ refresh. A widget without a date filter shows all-time totals. There is a custom HTML widget type. V
- The footer shows a trial-expiry countdown (can go negative); an expired trial may restrict features. V
