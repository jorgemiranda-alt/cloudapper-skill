# CloudApper API reference (verified 2026-10-31)

Hosts depend on the cluster (see platform-model.md §1). Below, `API` = `https://<cluster>-api.cloudapper.com/api/`, `DAPI` = `https://<cluster>-designapi.cloudapper.com/api/` (or `api-design-cl2...`), `RAPI` = `https://<cluster>-reportapi.cloudapper.com/api/v3/`.

Entries headed `WP-0xx` use the format and statuses explained at the top of `workflow-patterns.md`.

## Contents
1. Auth headers and big-int versions
2. App details and records
3. Workflows
4. Forms (design API)
5. Relations, privileges, menus
6. UI workflows
7. Reports

## 1. Auth headers and big-int versions

Call from inside the signed-in page (`page.evaluate`) so the token is at hand:

```js
const tok = localStorage.getItem('accessToken').replace(/"/g, '');
const h = { authorization: 'Bearer ' + tok, 'content-type': 'application/json', accept: 'application/json',
  'x-ca-client-id': '<clientId>', 'x-ca-app-id': '<appId>', 'x-ca-client-platform': '3', 'x-ca-client-version': '8.2.0.25' };
```

The design API only needs `authorization` + `content-type`.

**Versions are 18-digit integers** that JS rounds, which makes updates fail with 409 or silently mismatch. Read the raw text, quote them before parsing, and write them back as raw text:

```js
const live = JSON.parse(raw.replace(/"Version":(\d{15,})/g, '"Version":"$1"')).Result;
const body = JSON.stringify({ ...w, Version: '__VER__' }).replace('"Version":"__VER__"', '"Version":' + w.Version);
```

## 2. App details and records

- `GET API v3/Apps/{appId}/details` → `Result.Schemas` (forms with runtime `Fields`, `CustomActionsConfiguration`, `Version`), `ParentChildRelations`, `Menus` (role-filtered), `AllMenus`, `Roles`, `RecordRolePrivileges`, `WorkflowDefinition` (UI workflows).
- `POST API v3/Records/fetch` body `{StartRow, TotalRows (≤1000), SearchType:0, TypeId:<formId>, FilterConfigurations:[], SortConfigurations:[]}` → `Result.{Count, Items}`. Page through with StartRow. Items carry `id`, `DisplayName`, field values and `<field>ReferenceId` for references.

### WP-027 Update many records in one API call
**Rule:** `POST API v3/Records?records-required=true` with `{"Items":[{"TypeId":<formId>,"id":<record id>,"_version_":<version>,"<field>":<value>}]}`, in batches (20 per call worked). Read the records first with `Records/fetch`, quote the 19-digit `_version_` before parsing (§1), and write it back as a raw number.
**Why:** It's the call the runtime UI makes when it saves records.
**Caveats:** Check the client ID in the page URL before writing.
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: 106 records updated in 6 calls and read back.

### WP-037 Set a reference field through the records API
**Rule:** In a `Records` update item, set a reference field with three keys: `"<field>": <display text of the target>`, `"<field>ReferenceId": <target record id>`, `"<field>ReferenceTypeId": <target form id>`. Read one record back to confirm before updating the rest. Use a filtered `Records/fetch` for the target (e.g. by a unique field) instead of fetching a whole large form.
**Why:** Records store a reference as these three keys. Setting only the text does not link the record.
**Caveats:** An update may fire workflows triggered on edit of that form; check before a bulk change. A 45-second page limit can cut a long call: do it in batches (WP-027) and check what changed before repeating.
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: 135 records relinked to the correct employee in 7 calls and read back; a one-record test first.

## 3. Workflows

- `GET API v3/Workflows` → all workflows with full definitions (large: return summaries only).
- `PUT API v3/Workflows/{AutomationId}` → update. Send the full live object with your changes and the raw live Version. `Sequence` in this body is **ignored**.
- `POST API v3/Workflows` → create; body = workflow object without `Id`, `AutomationId`, `Version`; returns the new AutomationId. Set `Status: 2` to create it off.
- `PUT API v3/Workflows/sequence` body `{NewSequneceNo, OldSequneceNo}` (platform spelling) → moves one workflow to a position and shifts the rest, like dragging in the list. Reorder by walking the target order and moving each workflow into its slot, re-reading after each move.
- `POST API v3/auditlogs/workflows/fetch-execution-log` body `{AutomationId, StartRow, TotalRows}` (optional `FilterConfigurations`, `SortConfigurations`; newest first) → `Items[{ExecutionId, StartTime, EndTime, Status, Message, MessageLevel, Nodes}]` (Status 1 ok, 2 failed, 3 running). `Nodes` (JSON string or array) = per step `{NodeId, StartTime, EndTime, ElapsedTime, MessageLevel, Status, Message, ResponseCode}`, one entry per step (a loop shows one pass): map NodeId to step names to find which step warned (MessageLevel 2 = warning). Debug-log text, the trigger record id and the values written are not in it.
- `POST API v3/Workflows/run` body `{AutomationId, TriggerRecordIds:[<record id>], VariableArguments:[<global variable assignments>]}` → a **real run** (writes data). Builder **Run Now** sends AutomationId + VariableArguments; an on-demand custom action sends `TriggerRecordIds` with headers `X-CA-Source-Id`, `X-CA-Source-Form-Id`, `X-CA-Source-Type`. There is no dry-run or test flag (WP-039).
- `POST API v3/Workflows/launch-connector?actionId=<ActionId>` body = the node + `automationId` → runs **one connector node** for real (the connector panel's test).

### WP-030 Give every API-built expression an `ExpressionText`
**Rule:** For each `{Expression, Arguments}` you write, add `ExpressionText`: the expression with each `__argN__` replaced by `[<FormTitle> (<NodeName>) . <FieldLabel>]` (e.g. `[Workflow Variables (Trigger) . dateIndex] + 1`), and `NodeDisplayText: ""`.
**Why:** The run uses `Expression` and `Arguments`, so the node works. The Expression Editor builds its field chips from `ExpressionText`; without it the editor shows raw `__argN__` names and "Unknown identifier".
**Caveats:** Required for an expression with operators or functions. The designer itself saves a single picked field (`Expression` = one `__argN__`) and the left-hand `Field` side without `ExpressionText`, so those are not errors.
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: unknown-identifier errors on API-built expressions; after adding the text the same expression showed field chips. Designer-built workflows had text on every expression with operators and none on many single-field ones.

### WP-031 Declare expression arguments as text, number or date
**Rule:** For an argument from a lookup-display (ControlType 38) or time-choice (33/34) field, write `ControlType: 4, DataType: 1` (text). Use standard types (4, 3, 11, 1) for arguments; don't copy the field's own control type blindly.
**Why:** The editor reported "Value cannot be null. (Parameter 'type')" for those control types: it has no value type for them.
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: error seen on type 38 and 33 arguments; the text-typed nodes were saved, with the editor result after the change not yet recorded.

### WP-032 A node on a child record needs its parent settings (and a cloned lookup keeps the old ones)
**Rule:** When a create, update, delete or lookup node works on records of a **child form** (the dropdown lists it under its parent, e.g. "Tip Distribution (Tip Distribution)" under Pool Allocation), set `parentTypeId` to the parent form and `parentReferenceField` to the subform field on the parent that holds the children (e.g. `subformList0`), in addition to `typeId`. Don't pick the standalone form for line items: the standalone entry does not link them to the parent. When you clone a lookup for another form, reset both to the real values, or to empty strings when the records have no parent.
**Why:** The dropdown stores a child choice as parent form + subform field. A node without them uses the standalone form, and a node copied from another lookup keeps the old parent ("children of `<OtherParent>` through subform N"): it saves and runs, but the editor shows a blank "Type of Record".
**Caveats:** Keep the `<Child> (Parent)` assignment on create nodes, set to the parent record that triggered the run. Find the subform field with the parent form's fields (ControlType 41 whose `ReferenceTypeId` is the child form).
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: three cloned lookups showed a blank type; create and update nodes built with the standalone child form were corrected to the parent + subform values; after a reload the dropdown showed the child entry under its parent (confirmed by the app owner).

### WP-033 Write argument paths in the designer's formats
**Rule:** `FieldNodeId` shapes: a plain trigger field is `__TRIGGERRECORD.<field>` (no form id); the trigger's id is `__TRIGGERRECORD` with `Field: "id"`; a field inside a record the trigger references is a **two-layer argument**: an outer argument for the reference field (`Field` is an expression object, `FieldNodeId: __TRIGGERRECORD.<ReferencedFormId>.<referenceField>`, `NodeId: "__TRIGGERRECORD"`, `TypeId` = the trigger form, ControlType 12) whose `Field.Arguments` holds the inner argument (`Field: "<field>"`, `FieldNodeId: __TRIGGERRECORD.<ReferencedFormId>.<referenceField>.<field>`, `NodeId` = the reference field, `TypeId` = the referenced form); a reference field used as a value is `<nodeId>.<ReferencedFormId>.<referenceField>` with ControlType 12; a whole fetched or iterated record is its node id with `Field: "id"`. Don't end a path in `.id` to get a referenced record's id.
**Why:** A path in the wrong shape saves and runs, but it resolves to nothing: a raw `__argN__` name or an empty value in the editor, and an empty value at run time. An empty filter value makes a lookup ignore the filter and return the first record, which links every row to the same record without any error.
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: shapes read from designer-saved nodes in the same app; a single-layer nested argument gave empty strings at run time; a plain trigger field written with the form id left a lookup unfiltered, so 136 records linked to one wrong employee (found by reading the data); both were fixed and the run then produced correct values.

### WP-034 Write update and create nodes the way the designer saves them
**Rule:** In `UPDATE_RECORD` / `CREATE_RECORD`, an id filter uses `Field: "id"`, `Label: "<form title>"`, `Operator: "="`, and `FieldNodeId` = the node's own id. A reference-field assignment uses `FieldNodeId: "<nodeId>.<ReferencedFormId>.<field>"`, `ControlType: 12`, `Operator: "="`, and a value that is another reference or a whole record, not a text name.
**Why:** Written another way (label "Id", blank operator, `<nodeId>.id`), the node saves and runs, but the editor shows the field unlabeled and the operator or value blank.
**Caveats:** Some older nodes store a single space for equals, and the editor displays it as equals, but in a lookup filter a space is ignored (WP-040): always write `=`. When unsure, copy a node the designer saved (see the procedure on building node JSON in `workflow-patterns.md`).
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: format read from an update node the designer saved; two update nodes and a create node built differently showed blank labels in the editor; the corrected nodes are saved, with the editor result not yet recorded.

### WP-035 An iterator node needs node type `FOREACH`
**Rule:** Set the node's `type` to match its action: `TRIGGER`, `ACTION` (lookups, assigns, creates, updates, deletes, debug logs, connectors, transform, save), `FOREACH` (iterators), `ROUTER`, `ROUTE`. When you build nodes, take `type` from existing nodes of the same `actionType`, not a default of `ACTION`.
**Why:** The engine dispatches on the node's `type`. A `FOREACH` iterator typed `ACTION` runs as an ordinary action and fails with "Requested value 'FOREACH' was not found" (parsing the action type), stopping at the first iterator.
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: three iterators typed `ACTION` failed the run at the first loop; after setting `FOREACH` the same workflow ran through all nodes.

### WP-036 Filter with `=`, not `contains`, and test a filter through the records API first
**Rule:** For an exact text match use the `=` operator on the full value; don't use `contains` to match part of a path or phrase. Store literal filter values as plain strings (e.g. `"False"`), as existing nodes do, not as an expression of a quoted string. Before building a lookup, try its filter with `POST API v3/Records/fetch` (`FilterConfigurations:[{Condition:"AND",Rules:[{Field,Operator,Value}]}]`, read-only) and compare the count with what you expect.
**Why:** `contains` behaved as a word match: "Back of House" matched every record, and values containing `/` matched all of them, while `=` returned exactly the expected set. A node with a `contains` filter on such text failed at run time with "Query syntax error".
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: records-API tests of single filters (contains returned all 136; `=` returned exactly 119; the full set of `=`, date and flag filters returned the expected 3 rows); the lookup rebuilt with `=` then ran.

### WP-038 Validate workflow nodes without opening the builder
**Rule:** Before asking anyone to open or run a workflow you built or changed through the API, run `scripts/validate-workflows.js` in a signed-in App Studio page of the app (read-only; pass `workflows: [obj]` to check a builder's output before the PUT). Fix every `error` finding, then open the changed nodes once in the editor.
**Why:** The builder has no Validate button. Its only server check, `POST API v3/Workflows/validate-expression` with `{"Value": <expression>}` (one per call, sent by the Expression Editor on every edit), catches syntax, undeclared arguments, functions (method style, `x.Trim()`) and types. It passes a missing `ExpressionText`, unknown nodes, fields or TypeIds. The editor resolves those in the browser from `GET API v3/forms` and `forms/forms-relation/apps/{appId}`, and the script checks them the same way (WP-030 to WP-036).
**Caveats:** Send only top-level expressions: an argument whose `Field` is `{Expression, Arguments}` is a reference or aggregate descriptor and fails alone. Connector outputs (`connectorSpec.CustomSchema[].Id`) are valid types. A node's children run in order; only a Router's children are alternatives. Findings are not yet confirmed in the editor one by one.
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: endpoint found in the Studio bundle and probed with good and broken copies of expressions (nothing saved). The script ran on 31 workflows (205 nodes, 331 expressions, about 25 s with the API check) with no false positives on designer-built workflows. It found deleted forms and fields in older nodes, missing text in API-built ones and an unknown identifier, and caught each of nine breakages seeded into an in-memory copy.

### WP-039 Test a workflow by a real run on a test record, then verify its output with a script
**Rule:** To test a workflow or a chain (on demand, record-triggered or scheduled):
1. Run `scripts/validate-workflows.js` (WP-038).
2. The user runs it on a clearly marked test record in UAT.
3. Run `scripts/verify-workflow-run.js` (read-only) with `chain` (the workflows in run order), `since` (just before the run) and `checks`. It waits until every workflow of the chain has finished (`ready: false` until then, WP-005), and reports failed runs, run order, step warnings and a workflow that did not fire.
4. Its `checks` then compare the written records with values calculated from the business rule. Examples: totals and shares reconcile, percentages sum to 100, no duplicate or stale rows, no record outside the test scope changed.
**Why:** There is no dry-run, debug or rollback mode: Run Now and on-demand actions are real runs (§3). A run can log success on every step and still write wrong values, so the log alone does not prove the result.
**Caveats:**
- The log has no trigger record id: tie runs to the test by time window and the records' `CreateDate` / `LastModifyDate`.
- Calculate the expected values independently, not by copying the nodes' formulas, or the check repeats their bugs.
- A local simulator of the nodes would miss .NET rounding and dates and the engine's filter quirks (WP-040), so prefer this method.
- To re-run a status-triggered step, change the status away and back first (WP-002).
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: the run endpoint was found in the Studio bundle, and the bundle has no test flag. The verifier ran on a three-workflow chain in a test app: it listed 35 runs in order and flagged 4 failed runs. Its checks caught a total of 106.72 against an expected 65.135, a percentage total that held an amount, and two rows of another parent rewritten, all in runs logged as successful.

### WP-040 A filter rule whose operator is a space is ignored
**Rule:** Give every lookup or delete filter rule a real operator (`=` for an id or parent match), never `" "` or an empty one. `validate-workflows.js` reports a space operator on these nodes as an error.
**Why:** Through `Records/fetch`, a `ParentId` rule with operator `" "` returned every record of the form, while `=` returned only the parent's children. A lookup built with `" "` fetched other parents' rows at run time, and the run then rewrote them, with no error in the log.
**Caveats:** The editor shows a space as equals, so the node looks right. Designer-saved `ParentId` filters use `=`. Whether update and create id filters ignore a space is untested (WP-034).
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: `Records/fetch` counts were 5 vs 3 rows and 2 vs 1 records for `" "` vs `=`. After a run, another parent's rows had the triggering parent's rate and percentages, modified in the same minute as the run.

## 4. Forms (design API)

- `POST DAPI EntityType/SaveEntityType` → create/update a form (top-level or child). Body = the designer's full form definition (`AllFields` in design format, `EntityTypeID`, `GlobalTypeID`, `Tittle` [sic], `IsEdit`, `Version` (string), `Client`, `ParentSchemas`, `ChildSchemas`, `CustomActionsConfiguration`, settings). New form: `IsEdit:false`, `Version:"0"`, your own GUID as EntityTypeID. Update: `IsEdit:true` + live Version.
  - Easiest reliable way to get a valid body: open the form in the designer, click Save with the request **blocked** (`route.abort`), keep `postData()`. See playwright-efficiency.md "capture" and "save-swap".

### WP-028 Add a field to a form by replaying the designer's save
**Rule:** Capture the designer's own save body (above), add a copy of an existing field of the same control type with a new internal name, label and sequence, raise `StringFieldLastIndex` (or the matching counter), and send it with the raw live `Version`. Don't drag controls from automation.
**Why:** Drag and drop in the designer is unreliable from automation; a saved form body is a reliable source of a valid field definition.
**Caveats:** Send the replayed save through a frame without your interceptor, or the interceptor swallows it. The runtime may not show the field until **Reload App** (platform-model.md, caching). Check the client ID before writing. A whole new form: WP-043.
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: a choice field added to a form, present in the app details and shown on the form after Reload App.

### WP-043 Build a whole form through the API from templates captured in the designer
**Rule:** Create the shell in the designer and save it with one field (the designer won't save an empty form). Capture each needed save body without sending it: hook XHR/fetch `send`, keep the body, abort. Capture one form per control type you need (Form reference 12, Date 11, Date & Time 3, Text 4, Text area 5, Dropdown 2, Yes/No 1, Attachment 37). Build `AllFields` = Section, column, your cloned fields, then the system fields (ControlType 99). Per clone: replace the template's old `Name` everywhere in it with `<type>FieldN`, set `Label`, `Hint`, `Mandatory`, `SequenceNumber`/`TabIndex`/`DisplayNumber`, and the platform-0 `SequenceNumber` inside `StyleSettings`/`StyleConfiguration`. Form fields also need `ReferenceTypeID`, `EntityTypeID` and `ReferenceTypeId` set to the target form. Dropdowns need `DefaultValue` (`dro_choice_n` ids), `DefaultItems` and `colorOptions`. Set each `*FieldLastIndex` to the number of fields of that category (Date and Date & Time share the date counter). Check `ClientId`, `AppId`, `EntityTypeID` and `Tittle` against the target, POST with the captured live `Version`, then reload the designer and read the fields back.
**Why:** Two forms of one app differ only in title, description, ids, version, create date and the counters; the designer's own body is a valid template for every field.
**Caveats:** Send from a page without your hook (WP-028). The captured headers hold the bearer token: keep them in memory or session storage only, never print them, delete them afterwards. A capture that is aborted leaves the live `Version` unchanged, a sent one raises it.
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: two forms (9 and 6 fields, with two dropdowns, form references and date-times) saved with `IsSaved: true`, reopened in the designer with every field, required flag and dropdown choice intact.

  - Design-format fields for child forms are also in `GET DAPI user-management/get-app-data-for-design/{client}/{app}/{userId}` → `Result.EventTypes[].AllFields` (top-level in `EntityTypes`).
- `POST DAPI EntityType/DeleteEntityType` body `{entityType:<full design object>, LiAnalyticsSetting:null}`; simplest is the designer's **Delete This Form** menu, guarded by a route that checks the form ID.

## 5. Relations, privileges, menus

- `POST DAPI EntityType/SaveParentChildRelations` body `{parentId, childIds:[...], appId, ClientId:<number>, SchemaMode:0}` → **adds** the listed children (existing ones stay).
- `POST DAPI EntityType/SaveRolePrivilegeForEntityTypes` body `{EntityTypeID, PrivilegeCodes:32655, RoleID}` → what the designer does for the admin role when a form is created.
- `POST DAPI Settings/GetAllDynamicMenuItems` body `{ClientID, AppId}` → design menu list.
- `POST DAPI Settings/SaveDynamicMenuItem` body = a menu item. **Set `Client.ClientID`, `Client.ClientIDString`, `Client.AppId`, `CloudApperAppId`** (the list returns ClientID 0). Update: existing `MenuID` + `IsEdit:true`. Create: generate a new GUID `MenuID` with `IsEdit:false` (an empty MenuID returns 204 and creates nothing).
- `POST DAPI Settings/DeleteMenuItem` body = the menu item (with real client) → `true`.
- Regroup / rename / reorder / re-icon menus: save each existing item with changed `Title`, `ParentID` + `Level` (1 top, 2 child), `SequenceNo`, `IconURL` (reuse an URL from another menu; uploading new icons is a designer action), `Ishidden`, and `PermissionType` + `Permissions` (copy from a restricted group to restrict a group). Read back with GetAllDynamicMenuItems; runtime `Apps/{app}/details` `Menus` updates at once, but open browsers show the cached menu until **Reload App** (↻ next to the app name, about x=222, y=22 at 1920×1080) is clicked. Start page = the menu item with `IsLandingPageMenu: true` (set it on the new one, false on the old). Back up all menu items (GetAllDynamicMenuItems) before changing any, so the menu can be restored exactly.

## 6. UI workflows

- `GET API v2/Apps/ui-workflow-definition/{clientId}/{appId}` → `Result` = JSON string of the list.
- `PUT API v2/Configurations/update-app-configuration?config-to-update=Workflow` body `{AppId, ClientId, Configuration:[...full list...]}` → replaces the whole list (read, modify, write back).

## 7. Reports

- `GET RAPI Reports/app-reports`, `GET RAPI Reports/report-details/{reportId}` (LayoutContent base64), `POST RAPI Reports/save-report/{id}` = Edit Report Information > Update: body = the report-details Result plus `EntityTypeId:''`, `ServiceUrl:null`, `Variables:null`; change `Name`/`Title`/`Description` to rename (layout kept, its root Name follows). Typing into that page with Playwright `fill` does not register (DevExtreme boxes update on change), so rename through this call. `ReportPermissions [{PermissionType:1, PermittedId:<creator>}]` is what **Public** looks like; `[]` in the body does not clear it.
- `GET RAPI reportpackaging/{reportId}/export` → `.carpkg` (zip). Read-only on the source app.
- `POST RAPI reportpackaging/import` multipart: `file` (.carpkg) + `metaData` = JSON `{<packageSchemaId>: <targetFormId>, ...}` → `Result` = new report ID.
- `POST RAPI ReportDesigner/Invoke` (actionKey setData) and `ReportExport/stream/1` exist for designer saves and previews.
