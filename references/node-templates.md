# Workflow node templates

Read this before building any workflow node through the API. The JSON files in `node-templates/` are real nodes read back from `GET API v3/Workflows`. Ids, hosts and secrets are replaced with placeholders. Each file has `origin`: `designer` (the designer saved it) or `api-built, validated` (built through the API, 0 errors in `validate-workflows.js`; the same nodes logged successful runs in another workflow, on 2026-11-04 a workflow built from these ran with every step OK, and every node of a workflow built from these opened in the editor with no errors and readable field chips; Debug Log chips show `ExpressionNNN`, as designer-built ones do). Prefer a designer node of the same type in the target app when one exists (WP-053); use these when the app has none.

## Contents
1. Placeholders and how to rewrite ids
2. Workflow object and trigger codes
3. One entry per actionType
4. Expression rules seen in saved nodes
5. Not captured (needs the designer)

## 1. Placeholders and how to rewrite ids

- `<NODE_n>`: a node id, `s` + 13-digit epoch milliseconds. Generate past timestamps with no run of five zeros (`'s' + (Date.now() - 600000 + i * 7919)`); ids that decode to a future date or look typed (`s1793600000001`) mark API-built nodes.
- `<ID_n>`: a GUID (form, global-variable schema, connector schema, connector id). Within one file the same number is the same GUID. A node's own `typeId` is the form it works on; the GUID in `TypeId` of `__GLOBALVARIABLES` arguments is the workflow's `GlobalVariables.Id`.
- `<HOST>`, `<CLIENT_ID>` (the tenant's client id), `<CLIENT_SECRET>` and similar upper-case names in a token request: fill from the target app's own existing connector, or have the owner enter them in the designer.
- To clone a node into a new tree: copy it whole, give it a new id, then replace the old id string everywhere in the copied subtree (`FieldNodeId`, `NodeId`, `sourceNodeId`, route rules that read `<fetchNode>.Count`). Replace only whole ids; never shorten or retype GUIDs (WP-053).
- Use the template of the node's own type. Take another workflow's node only for what no template covers (a lookup of a settings record, a login call that reads credentials from it), and compare every key of the copy (`CustomSchema` metadata, not just its fields) with the template.
- Tree: every node, leaves included, carries `children` (`[]` for a leaf), or the builder shows the nodes unconnected (WP-083). `children` run in order. A loop body written as one chain (assign, assign, router, each the child of the one before) ran; the owner's edit saved the router as a second child of the iterator instead (unconfirmed whether that was needed). A node's first child runs after it; several children of one node run one after another (an iterator's body is its children). Only a ROUTER's children (ROUTE nodes) are alternatives, and every true route runs (WP-009).

## 2. Workflow object and trigger codes

`POST API v3/Workflows` body = an existing workflow without `Id`, `AutomationId`, `Version`, `Sequence`, `CreatedAt`, `ModifiedAt`, `ModifiedBy`, `WebHookIdentifier`, `AccessIdentifier`, with `Status: 2` (off), a new `Name`, and `AutomationConfiguration.root` = the trigger node (`api-workflows.md`).

| Trigger (meaning as seen, not documented) | `TriggerType` | `TriggeredOn` | Other fields | File |
|---|---|---|---|---|
| Manual (Run Now / on demand) | 4 | 0 | `TypeId: ""` | `trigger-manual.json` |
| Scheduled | 3 | 0 | `IsScheduleExpression`, `ScheduleExpression` Quartz, e.g. `0 0/6 1/1 * ?` | `trigger-scheduled.json` |
| Record created | 2 | 1 | `TypeId` = form, optional `triggerRuleset` | `trigger-record-created.json` |
| Record created or updated | 8 | 4 | `TypeId` = form, `triggerRuleset` rules (e.g. `_IsUpdated`) | `trigger-record-updated.json` |

The trigger node's `data.globalVariables` repeats the workflow's `GlobalVariables` (`Id`, `AppId`, `Title: "Workflow Variables"`, `Fields[{Name, Label, ControlType, DataType, SchemaId = Id}]`). Variable types seen: text `4/1`, number `4/6`, date-time `3/0`, date `11/0`.

## 3. One entry per actionType

Node `type` is `TRIGGER`, `ACTION`, `FOREACH`, `ROUTER` or `ROUTE` (WP-035).

| actionType | `type` | File(s) | Notes |
|---|---|---|---|
| TRIGGER | TRIGGER | `trigger-*.json` | id is always `__TRIGGERRECORD` |
| ASSIGN_VARIABLES | ACTION | `assign-set-field.json`, `assign-increment-and-date.json`, `assign-append-text.json`, `assign-reset.json` | `typeId` = GlobalVariables.Id; each assignment: `Field` = single-arg expression on `<thisNode>.<var>`, `FieldNodeId: "<thisNode>.<var>"`, `Operator: "="`, `Value` = expression with `ExpressionText` |
| LOOKUP_RECORD | ACTION | `lookup-record.json` | one record; `ruleSet` filter, `fetchRecordOutput: 0` |
| LOOKUP_RECORDS | ACTION | `lookup-records-limit-filter.json` | `filterMaxRowCount` = limit, `filterSorting: []`, `ruleSet`; output fields `<node>.Count` and the records |
| FOREACH (data source) | FOREACH | `foreach-data-source.json` | `iterationMode: "FOREACH"`, `sourceNodeId` = lookup or connector node, `typeId` = its form or schema; current item = `<iteratorId>.<field>` with `TypeId` = that form |
| FOREACH (condition) | FOREACH | `foreach-while-condition.json` | `iterationMode: "WHILE"`, `typeId: ""`, `sourceNodeId: ""`, `loopCondition: "__expN__"` + `loopConditionVariables`, `maxIteration: "__expM__"` + `maxIterationVariables` |
| ROUTER | ROUTER | `router.json` | name and icon only; children are ROUTE nodes |
| ROUTE | ROUTE | `route-field-equals-field.json`, `route-response-ok.json`, `route-batch-full-or-last.json` | `ruleSet {Condition: "AND"|"OR", Rules}`; a rule's `Value` is a literal (`200`) or an expression |
| CREATE_RECORD | ACTION | `create-record.json` | `typeId`, `entityFieldAssignment`, `createUser`, `parentTypeId` / `parentReferenceField` for child forms (WP-032) |
| UPDATE_RECORD | ACTION | `update-record.json` | id filter in `ruleSet` (WP-034) |
| TRANSFORM_RECORDS | ACTION | `transform-records.json` | maps a source node's rows (`sourceNodeId`, `sourceNodeTypeId`) to form fields; no write |
| SAVE_RECORDS | ACTION | `save-records.json` | writes the transform's output (`sourceNodeId` = transform). Upsert uses the target form's unique field, not a node setting; a create on an existing unique value is skipped (WP-041) |
| DELETE_RECORDS | ACTION | `delete-records.json` | `ruleSet` + `filterMaxRowCount`; real operator in every rule (WP-040) |
| CONNECTOR (token generator) | ACTION | `connector-token-generator.json` | `connectorType: 16`, token-generator dll; output `<node>.<schemaId>.$.access_token`; `expiresIn`, `expiresInUnit` properties |
| CONNECTOR (REST) | ACTION | `connector-rest-post-variable-body.json` | Postman request in `Properties[0].Value.Request`; variables (WP-057). Response schema for a list: `WorkflowActionType: "LOOKUP_RECORDS"` + `WorkflowJsonPath` = the array (WP-058); a one-object response is `LOOKUP_RECORD` with an empty path. Build from this file, not from another workflow's connector |
| DEBUG_LOG | ACTION | `debug-log.json` | `value` HTML with `﻿__expN__﻿`, `variables[]` (each argument also has `ReplaceExpString`), `editorType: 1` |

## 4. Expression rules seen in saved nodes

- Argument: `{Name: "__argN__", Field, FieldNodeId, NodeId, TypeId, ControlType, DataType, Label}`. Paths: global `__GLOBALVARIABLES.<var>`; trigger field `__TRIGGERRECORD.<field>`; iterator item `<iteratorId>.<field>`; lookup count `<lookupId>.Count`; connector output `<connectorId>.<schemaId>.<field>` (WP-033).
- `ExpressionText` replaces each argument with `[<Form or "Workflow Variables"> (<node name or "Trigger">) . <Label>]` (WP-030).
- Functions seen: `AddDays(date, n)`, `.ToString( "yyyy-MM-dd" )`, ternary `a == 0 ? "" : ","`, `+` on text and numbers.
- Index and "last item": there is no built-in index or last-item flag in a FOREACH. Count with a number variable and compare it to the lookup's `Count` (WP-056).
- A Debug Log can print a connector's system outputs `Response Code`, `Request` (the request sent) and `Count` (rows parsed): add all three after a new REST call, so the first run shows what was sent and how many rows came back.
- A quote inside a REST raw body built from a variable: the variable text carries escaped quotes (`"\\\""` in the expression), so `[__expN__]` in the body becomes `["a","b"]` (WP-056).

## 5. Not captured (needs the designer)

No saved example in the source app for these, or not yet tested; ask the user to add one in the designer, then read it back before cloning:
- A workflow-level template, and whether a brand-new workflow may use a fresh GUID as `GlobalVariables.Id` (the copies seen reuse another workflow's Id).
- Webhook trigger, Return node, a current-date function for "last N days" (check WP-052), a ROUTE with no rules (else route), LOOKUP_RECORDS with sorting (`filterSorting` was always empty), a connector response schema created through the API (WP-046).
