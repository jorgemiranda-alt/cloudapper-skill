# CloudApper API: workflows

Hosts depend on the cluster (see platform-model.md §1). Below, `API` = `https://<cluster>-api.cloudapper.com/api/`, `DAPI` = `https://<cluster>-designapi.cloudapper.com/api/` (or `api-design-cl2...`), `RAPI` = `https://<cluster>-reportapi.cloudapper.com/api/v3/`.

Auth headers and big-int `Version` handling: `api-reference.md` §1.
Entries headed `WP-0xx` use the format and statuses explained at the top of `workflow-patterns.md`; `wp-index.md` lists every entry.

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
**Caveats:** Some older nodes store a single space for equals, and the editor displays it as equals, but in a lookup filter a space is ignored (WP-040): always write `=`. When unsure, copy a node the designer saved (see the procedure on building node JSON in `wp-procedures.md`).
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: format read from an update node the designer saved; two update nodes and a create node built differently showed blank labels in the editor; the corrected nodes are saved, with the editor result not yet recorded.

### WP-035 An iterator node needs node type `FOREACH`
**Rule:** Set the node's `type` to match its action: `TRIGGER`, `ACTION` (lookups, assigns, creates, updates, deletes, debug logs, connectors, transform, save), `FOREACH` (iterators), `ROUTER`, `ROUTE`. When you build nodes, take `type` from existing nodes of the same `actionType`, not a default of `ACTION`.
**Why:** The engine dispatches on the node's `type`. A `FOREACH` iterator typed `ACTION` runs as an ordinary action and fails with "Requested value 'FOREACH' was not found" (parsing the action type), stopping at the first iterator.
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: three iterators typed `ACTION` failed the run at the first loop; after setting `FOREACH` the same workflow ran through all nodes.

### WP-083 Every workflow node needs a `children` array, leaves included
**Rule:** Give every node you build through the API a `children` key; a node with nothing after it gets `children: []`. Check the whole tree before `POST`/`PUT API v3/Workflows`.
**Why:** The designer saves every node with `children`. The engine runs a tree whose leaves lack it, but the builder can't lay it out: it shows the Trigger alone with the other nodes stacked unconnected in the top-left corner.
**Caveats:** The tree in the API is unchanged, so `wfSteps` and `validate-workflows.js` look fine; the validator now reports `CHILDREN_MISSING`. If the owner saves in the builder while it shows the broken layout, read the tree back before relying on it.
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: an API-built 11-node workflow whose two leaf nodes lacked `children` rendered unconnected; adding `children: []` to those two nodes made the builder show every node connected.

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
5. Save the checks so the test can be rerun after every later change: one file per workflow or chain in the project, `tests/<workflow>.checks.js`, and pass it as `checksFile` (absolute path) to `cloudapper_run` `workflow` `check-run`; the runner reads it, so the source never enters the conversation. The file is one `async ({ records, eq, near, check }) => { ... }` expression, headed by comments: the chain, how the test record is marked (for example a `ZZ` title prefix, found later with `state.js` `prefix`), the cases it covers and where the expected values come from.

**Cases to cover** (each one the user runs on a marked UAT record; check what applies):
- **Happy path** with known inputs and expected values worked out by hand or from the requirement.
- **Rerun:** run it again on the same scope; the result is the same, with no duplicate or stale rows (run stamp + cleanup, WP-008; status-triggered steps need a real status change, WP-002).
- **Failure route:** a record or config that makes a step fail (missing setup row, bad external response) ends at Failed with a reason, and nothing stays at an in-between status.
- **Empty input:** nothing to process ends cleanly (Completed, counts 0), not Failed or stuck.
- **Scope:** records outside the test scope (other site, period or parent) keep their `LastModifyDate`.
- **Chain:** every workflow of the chain fired, in order; for a split workflow, the later step saw the earlier one's result (WP-005).
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

### WP-046 Response fields written into a REST connector through the API are not registered
**Rule:** Don't build a connector's expected response fields by editing its JSON through the API and then mapping them. Open the node in the designer, click Validate, then Done, and Save the workflow, and check that the expression editor lists the response fields before wiring mappings, routes or debug logs to them.
**Why:** With API-written fields, the expression editor listed only the system fields (Count, Request, Response Code), and anything pointing at the others failed with "Unknown identifier" or "Unable to extract value".
**Caveats:** Validate calls the external service with the node's credentials: let the owner run it, with test values and a non-production tenant. Unconfirmed: after one Validate the saved field list had not changed, so check whether Validate really generates the list from a response or only checks the request.
**Status:** Hypothesis · checked 2026-11 · Studio 8.2.0.25 · Evidence: one UAT workflow; editor showed system fields only; effect of Validate on the saved list not confirmed.

### WP-053 Copy a designer-saved node whole and change only the values; don't rewrite ids or paths
**Rule:** Prefer a node the designer created. Have the designer add an empty node of the right type (set the type of record, one filter, one assignment), read it back through the API, and edit only its values. If that isn't practical, clone the closest node the designer saved (for example an update node next to an existing create node) and change only the values you mean to change (name, filter value, expressions). Either way, don't retype or "tidy" ids and paths. In particular:
- Use the full form GUID everywhere (`typeId`, `TypeId`, paths). Short forms of an id that tools print for readability are not valid.
- A plain (non-reference) field assignment keeps `FieldNodeId: "<nodeId>.<field>"` with no form id. Only a reference field uses `"<nodeId>.<ReferencedFormId>.<field>"`.
- When the new node gets a new id, rewrite only the node-id prefix of each `FieldNodeId` (same shape), and re-point the id filter's `FieldNodeId` to the new node.
After saving, reload the builder page and open the node: a blank "Type of Record", "No Filter Source Available", or assignment targets shown as raw names (`numericField1`) mean an id or path was changed.
**Why:** The editor resolves labels and sources from these ids and paths. A wrong shape still runs or saves, but the node opens blank or with raw field names, and a later "Done" in the editor can save that broken state.
**Caveats:** Related: WP-030 to WP-037. If the editor has the workflow open, it may save in between and your next API save gets a 409 "updated version already exists": reload the workflow, reapply the change on the latest version, and ask the user to close the panel with Close, not Done.
Before saving, ask whether the tab's cached copy is current; a stale copy gives a 409. Scan every workflow for the shapes you rebuilt (short ids, plain fields with three-part paths) after fixing one node, and report that the scan does not prove the editor opens them.
**Status:** Hypothesis · checked 2026-11 · Studio 8.2.0.25 · Evidence: an update node built from a create node's assignments opened with a blank record type (shortened form id), then with raw field names (form id inserted into plain-field paths); both fixed by using the full id and `<nodeId>.<field>`, then reopened in the editor.

### WP-075 Email a record with a report attached (Email Notification connector)
**Rule:** Use the Email Notification connector (`Connector.Notification.dll`, shown as "Email Notification (Extended v3.5)") after a step that fetches the record the report is built on. Its properties (`connectorSpec.Properties`, by `Name`):

| Property | ControlType | Use |
|---|---|---|
| `connectorDataSource1` | 107 DataSourceSelector | data source for field values in the message (optional) |
| `emailTo`, `emailCc`, `emailBcc`, `emailReplyTo` | 104 | `Value` = `{Contacts:[], Users:[], Roles:[], ContactFields:[<expression>]}`; a `ContactFields` entry is an expression whose argument is an email-type field (DataType 7), e.g. `__TRIGGERRECORD.<field>` |
| `emailSubject` | 4 text | text with `__expNNN__` placeholders; each placeholder is defined in the property's `Variables` array (same shape as REST connector variables: `{Name, Expression, Arguments:[{Field, FieldNodeId:"<nodeId>.<field>", NodeId, TypeId, ControlType, DataType, Label}], ExpressionText}`) |
| `emailBody` | 20 HTML | HTML with the same placeholders and `Variables`; use inline styles, email clients drop `<style>` blocks |
| `emailAttachment1` | 108 AttachmentChooser | attach files from attachment fields |
| `FileUrl` | 4 | attach a file by URL |
| `connectorDataSource2` | 107 | **data source for the report**: `{TypeId:<form the report is built on>, SourceNodeId:<id of the step that fetched that record>}` |
| `reportChooser1` | 109 ReportChooser | **the report to attach**; its editor (AdvancedReportChooser) picks a report of that form and builds filter rules over the data source, so the attached report is limited to the fetched record |

Steps: (1) build the report on the parent form (DevExpress report; list with `GET RAPI Reports/app-reports`); (2) in the workflow, fetch the parent record (LOOKUP_RECORD) from the trigger, e.g. by ticket number; (3) set `connectorDataSource2` to that step and form; (4) choose the report in `reportChooser1` and filter it to the fetched record; (5) recipients from email-type fields (see `conventions.md`: email addresses use the Email field type).
**Why:** The report attachment is driven by its own data source, separate from the message's data source; without `connectorDataSource2` the chooser has no form to list reports for.
**Value of `reportChooser1`** (from the builder code, `workflow-controls` chunk), set by the property's flags:
- no `SingleSelect` (the default on this connector): an array of report ids, e.g. `["<reportId>"]`; the report is limited by the `connectorDataSource2` step;
- `SingleSelect` without `EnableFilterBuilder`: the report id as a string;
- `SingleSelect` + `EnableFilterBuilder`: `{ReportId, FilterConfiguration:{Condition, Rules:[...]}}` (`FilterConfiguration` left out when there are no rules).
Report ids come from `GET RAPI Reports/app-reports`. Keep `Variables` as `[]`.
**Caveats:** Confirmed by a real run: subject and body showed the field values, and the report arrived as `<Report Name>.pdf` (about 115 KB). Open the PDF once to check it holds only the fetched record; if other records appear, use the `SingleSelect` + `EnableFilterBuilder` form with a rule on the record key. The workflow builder is at `https://<host>/studio/<clientId>/app/<appId>/workflow` (open it only to read code or check rendering).
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: report chooser and placeholders set through the API; a real send delivered the filled subject/body and the PDF attachment; property list and control types read from a designer-built email node and the web app's control-type enum (ReportChooser = 109, AttachmentChooser = 108, DataSourceSelector = 107).

### WP-085 A filter value must be a field of the same type as the filtered field, and the validator does not prove the designer can show it
**Rule:** Before writing a lookup, route or delete rule through the API, read both forms' fields (label, `ControlType`) and build each rule the way the designer would save it for that type: (1) a dropdown target gets a plain string choice key (WP-061); (2) a text target gets an argument pointing at a **text** field of the source node, never at a reference field (a reference to a record is a different type; the designer shows the value blank and offers only fields of the matching type); when the source has a plain text copy of the value (for example a mapping's "Pay Rule" text next to its "Pay Rule Ref" reference) use that; (3) never use a nested reference argument (`Field: {Expression, Arguments:[...]}` reaching through a reference to the target's field): it validates but resolves empty at runtime; (4) take labels from the form, never from memory. After `wfPut`, ask the owner to open the edited nodes in the builder once, or open them yourself; `validate-workflows` reporting 0 errors only checks expressions, not that the builder can display the rule.
**Why:** In one session, three API-built rules passed the validator but showed blank or broken in the builder: a dropdown compared to an expression literal, a text field compared to a reference field picked by a guessed label, and a cloned `isNotEmpty` rule whose field showed as its raw name (`stringField2`). A fourth, a nested reference argument, validated and ran, but sent an empty id to the external API (HTTP 400 on every call) because the argument evaluated to nothing.
**Caveats:** When a rule must compare a reference, compare the target's readable title field (what the reference displays, WP-084) against a text field, or filter by `<field>ReferenceId`. Copy a rule the designer saved in the same workflow where one exists (WP-053).
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: owner fixed the three rules in the builder; the saved versions used `ControlType 2` + plain string for dropdowns and a text-field argument (`ControlType 4`, `DataType 1`) in place of the reference.
