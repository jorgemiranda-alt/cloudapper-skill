# CloudApper platform model

## Contents
1. Tenants, clusters and IDs
2. Forms (entity types) and child forms (event types)
3. Fields
4. Menus and roles
5. UI workflows vs backend workflows
6. Backend workflows: triggers, nodes, expressions
7. Reports
8. Runtime caching and publishing
9. More platform details (triggers, nodes, fields, audit log, designer, dashboards)

## 1. Tenants, clusters and IDs

- One web front end (`https://web.cloudapper.com`, or a tenant host such as `m2sys.cloudapper.com`) serves accounts that live on different **clusters**. Each cluster has its own API hosts, e.g.:
  - cluster 2: `api-cl2.cloudapper.com`, `api-design-cl2.cloudapper.com`, `reportapi-cl2.cloudapper.com`
  - m2sys: `m2sys-api.cloudapper.com`, `m2sys-designapi.cloudapper.com`, `m2sys-reportapi.cloudapper.com`
  Find the right hosts by watching the network tab of the signed-in app (or `clientWiseRoutingDetails` in localStorage).
- **Client ID**: a 16-digit number (e.g. `1234567000000001`) in every runtime URL: `/<clientId>/app/<appId>/...`. It fits in a JS number, but version numbers do not (see API). <!-- leak-check: allow (made-up example ID) -->
- **App ID**: a GUID. One account can hold several apps.
- **Form IDs, menu IDs, workflow IDs, record IDs are different in every app**, even when titles match. The **GlobalTypeID** of a form can match across copies of the same app. Field **names** (`stringField3`) match for forms that were copied.
- URLs: runtime list `/<client>/app/<app>/list/<formId>/<menuId>`, record `/details/<formId>/<recordId>`; designer `/design/<client>/app/<app>/form-designer/<formId>`; menus `/design/<client>/app/<app>/menu`; workflows `/studio/<client>/app/<app>/workflow` and `/workflow/details/<automationId>`; UI workflows `/design/ui-workflow-configs`; reports `/<client>/app/<app>/report`.
- Opening a designer URL directly can redirect to the root in some accounts; enter App Studio first through the app's **edit design** button (`data-testid="edit-design-button"`), then navigate.

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

## 5. UI workflows vs backend workflows

- **UI workflows** run in the browser (open a form to add a child record, search by PIN, show a message). They live in **Settings → UI Workflow Configuration** as one JSON list per app (IDs are free text, e.g. `9e5abdf8-...-4521u`). Example: `{Id, Title, Action:{ActionType:"ADD_NEW_RECORD", ActionFormTypeIds:[childFormId], ActionFormAttributes:[{Field:"Parent", FieldValue:"_triggerForm"}]}, Trigger:{TriggerOn:"ON_DEMAND", TriggerFrequency:"EVERY_TIME", TriggerFormTypeId:parentFormId}}`. A form button with ActivityType 4 points to it.
- **Backend workflows** ("AI Agents & Automation" in App Studio) run on the server.

## 6. Backend workflows: triggers, nodes, expressions

- Top-level fields: `Name`, `Status` (**1 = on, 2 = off**), `TriggerType` (2 = record event, 3 = schedule with Quartz cron in `ScheduleExpression`, 4 = on demand, 8 = webhook), `TriggeredOn` (1 = created, 2 = updated, 4 = created or updated), `TypeId` (form), `TriggerRuleset` (also copied in `root.data.triggerRuleset`), `Sequence` (order), `Version` (big int).
- `AutomationConfiguration.root` is a tree of nodes `{id, type, data, children}`. Children of a node run in order; a sibling placed after a FOREACH runs after the loop.
- Node `actionType`s seen: TRIGGER, ASSIGN_VARIABLES, LOOKUP_RECORD (one), LOOKUP_RECORDS (many, `filterMaxRowCount`, `filterSorting`), FOREACH (`sourceNodeId`), ROUTER + ROUTE (conditions), CREATE_RECORD, UPDATE_RECORD (`ruleSet` selects the record), DELETE_RECORDS, SAVE_RECORDS, TRANSFORM_RECORDS, CONNECTOR (REST, email, UKG, Toast; holds credentials), DEBUG_LOG.
- Field references in values use `{Expression:"__argN__", Arguments:[{Name, Field, FieldNodeId, NodeId, TypeId, ControlType, DataType, Label}]}`. `FieldNodeId` is `<nodeId>.<field>`, or `<nodeId>.<referencedFormId>.<field>` for reference fields; `id` uses just the node ID; the trigger record is `__TRIGGERRECORD`.
- Operators: `=`, `<`, `>`, `contains`, `isEmpty`, `isNotEmpty`, `in range` (`Value:{Start, Stop}`), `_IsUpdated` (trigger rule: field changed).
- Expressions are C#-like: `UtcNow( )`, `Now( )`, `AddMinutes(d, n)`, `AddDays(d, n)`, `AddHours`, `DateDiffMinute`, `IsNull(x) ? a : b`, `x.ToString("yyyy-MM-dd")`, `DateTime.Parse`, `Guid.NewGuid()`, `Split`, `Math.Round`, `ConvertFromUTCDateTime(d, tz)`.
- Global variables: `GlobalVariables.Fields` with a schema ID referenced as `TypeId` in ASSIGN_VARIABLES.
- Execution log per workflow: status 1 = success, 2 = failed/partial, 3 = still running ("Your task is now underway").

## 7. Reports

- DevExpress reports; `LayoutContent` is base64 `.repx` XML. Data sources point at form IDs.
- Export a report as a signed **`.carpkg`** package (zip with `metadata.json` listing `SchemasIdMap` title → form ID). **Import Report** (Report page) asks you to map each package schema to a target form: the clean way to copy reports between apps.
- Report buttons on forms reference the report ID, so copying reports means remapping buttons and any workflow that emails a report.

## 8. Runtime caching and publishing

- The runtime caches app details in the browser (IndexedDB). After design changes, users must click the **refresh icon** next to the app name or sign in again.
- The details API (`/Apps/{app}/details`) returns `Menus` (already filtered by the user's role) and `AllMenus` (everything).

## 9. More platform details (learned from several production apps)

V = verified in those apps, I = inferred. Check I items in the JSON before relying on them.

**Triggers and timing**
- Trigger names in the designer: "Before <form> On Create/Edit" (runs before the save; a **Halt Operation with a Message** / Validator connector blocks the save and shows the message), "After <form> On ...", "After Async <form> On Create Or Update / On Edit", "On Delete", Incoming Webhook, schedule, and on demand (the list shows trigger "Demand"). V
- In a **Before-edit** trigger the trigger record holds the **new** values; a Lookup of the same record returns the stored **old** values. That is the way to compare old vs new. V
- Before-save side effects are **not transactional**: if the workflow updates other records and the trigger record then fails to save, those updates stay. I
- No record locking: read-then-update in a workflow can race when two users submit at once. I
- The designer shows schedules in local time but cron runs in **UTC**. Examples: `0 0 0/4 1/1 * ?` (every 4 h), `0 0 0/12 1/1 * ?` (every 12 h). V

**Nodes and connectors**
- Designer name → actionType: Set Variables / Update Variable → ASSIGN_VARIABLES; Logic Path → ROUTER; Iterator → FOREACH (also a WHILE mode with a max-iteration cap); Transform → TRANSFORM_RECORDS; Save Records → SAVE_RECORDS (upsert of transformed rows); Fetch Records → LOOKUP_RECORDS. Names V, mapping I.
- Also seen: Extract (parse JSON from a response or webhook body), Return JSON (webhook response), Delay, DEBUG_LOG. V
- Connectors seen: REST API Connector v2.0, Get Authorization / Token Generator (each node stores its own credentials), Generate Report, Upload File (S3), Halt Operation, Delay, Email Notification (Extended v3.5), UKG "Workforce Dimension" (WFD Employee Details Sync). V
- **A Router runs every route whose condition is true**, not only the first. For one outcome, make conditions exclusive (or order widest-first and guard later routes with `isEmpty` on what an earlier route created). V
- **Workflow expressions are not report expressions:** in workflows `IsNull(x)` takes ONE argument and returns true/false (`IsNull(x) ? 0 : x`); the report form `IsNull(x, 0)` fails with "Could not prepare values for the fields: <var>" (the step's other fields still save). Initialise workflow variables at the start instead. V
- Expressions: `DateDiffHour(a,b)` returns whole hours (truncates), `DateDiffMinute`, `Math.Floor`, `Math.Ceiling`, regex extraction inside Transform mappings. V
- A credentials store exists and is recommended over literal secrets in connector nodes. I
- Webhook triggers get a unique access URL; a static page (e.g. hosted under `www.cloudapper.ai/app_files/<client>/`) can post to it. V/I

**Fields, buttons, records**
- Field options: auto-sequence ID (`0XXXXX`, leading zeros matter when matching), random-value generator, datetime "autofill now", read-only parent lookup on child forms. Computed fields stay editable on create unless set read-only. V
- A choice field's **stored value can differ from its label** (stores `Fail`, shows "Failed"). Button visibility rules and workflow conditions compare the stored value. V
- A form button can pass the record's Unique ID to an on-demand workflow. V
- Form **auto-save** + datetime "autofill now" = one-tap kiosk entry. V
- **Audit Log tab** on a record: workflow changes show the workflow name and `WorkflowService v1.1.0`; user edits show `Web v8.2.0.x`. Fastest way to tell "a workflow did it" from "someone edited it". V
- List views apply filters (a Default view showed 65 of 489). Read counts from the API. V

**UI workflows (more triggers)**
- ON_LOAD on a create screen: ask for a PIN, fetch the master record, set it as parent and pre-fill fields. ON_LOAD on a list menu: ask for a PIN, filter the list to `ParentId = <fetched>.id`. AFTER_CREATE "skip view" skips the details page after save (kiosks). V

**Designer, roles, sign-in, dashboards**
- Designer tabs: Solution Builder (forms), User Experience (menus, dashboards, roles, users), AI Agents & Automation, Settings. Open it with ⋮ → Edit Design on the client tile or ✎ in the app header. V
- Roles have **Design app** and **Publish** flags. The Reports module can be switched off per app. V
- Runtime create URL: `/<client>/app/<app>/create/<formId>/<menuId>`. V
- Sign-in: account.cloudapper.com (OpenID Connect, code + PKCE): email/password, one-time code, Apple, Google, Microsoft, Enterprise SSO. Assets on AWS S3. If sign-in loops on "clearing previous session data", clear the cloudapper.com cookies. V
- Dashboard widgets query a search index with Solr-style filters and have their own ↻ refresh. A widget without a date filter shows all-time totals. There is a custom HTML widget type. V
- The footer shows a trial-expiry countdown (can go negative); an expired trial may restrict features. V
