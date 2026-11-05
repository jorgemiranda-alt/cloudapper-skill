# Workflow patterns: procedures

Entries headed `WP-0xx` use the format and statuses explained at the top of `workflow-patterns.md`; `wp-index.md` lists every entry.

## 8. Procedures

### Debugging

**"It doesn't fire"**
1. Is the target workflow on (`Status 1`)? Is `TriggeredOn` right (1 create / 2 update / 4 both)?
2. Is the source workflow **before** the target in the list (WP-001)?
3. Does the trigger rule match? For `_IsUpdated`, did the value really change (WP-002)?
4. Read both workflows' execution logs (API) around that time; no entry = never triggered.

**Reading an execution log**
- The `Nodes` list shows every route of a router, taken or not, and in no run order: judge which branch ran by whether the route's children appear. A LOOKUP_RECORD that finds nothing still reports `Count 1`; check that the nodes that need its result (an update, a create) are absent. A per-node value in a loop is the last pass, so an empty last pass can hide earlier ones. "No records found to iterate." is a warning, not a failure.

**"It runs but the numbers are wrong"**
1. Run `scripts/verify-workflow-run.js` on the run with business checks (WP-039): it shows which record and which value are off.
2. Check lookups for a filter that doesn't filter: a space operator (WP-040), `contains` (WP-036), an empty value (WP-033). Compare a lookup's count through `Records/fetch` with the count you expect.
3. On a re-run, look for rows from earlier runs that were never deleted (WP-041).

**"It's stuck at Running / In Progress"**
1. Find the chain: who sets the status, who should pick it up next (job records, trigger rules).
2. Check each step's execution log: running for a long time = often a per-item API loop; missing = not triggered (order, rule, off).
3. Check the current pipeline's companion workflows are on and replaced ones are off (WP-022).

**"It's slow"**
1. Time each workflow in the chain from its execution log (StartTime/EndTime; `Nodes` gives per-step times).
2. Look for per-item external calls inside FOREACH, unfiltered lookups, repeated syncs of the same data, per-item deletes/updates that one bulk step could do.
3. Fix with filters, bulk/batch endpoints, one bulk step, or WP-010.

### Readable workflows and useful logs

- Name every node after what it does, numbered in run order ("05 Load the Rule for this Date"); routes state their condition ("Yes - Rule Found", "Else - No Rule"). Put a run-order summary in the workflow Description (WP-014).
- DEBUG_LOG node = `value` (editor HTML with `﻿__expN__﻿` placeholders) + `variables` (expression objects: global variable → `NodeId __GLOBALVARIABLES`, `FieldNodeId __GLOBALVARIABLES.<name>`; lookup count → `Field Count`, `FieldNodeId <nodeId>.Count`).
- Log record counts before and after every bulk DELETE (LOOKUP_RECORDS with the same filter; after should be 0).
- Remove per-item DELETE/UPDATE calls a single bulk step covers; check nothing references removed node ids before saving.

### Building node JSON from templates

- Before adding a lookup, list the trigger form's fields: if the trigger already holds the value or a reference to the record, use it and skip the lookup. Filter and assign by reference fields rather than their plain-text copies (WP-067).
- Never hand-invent node shapes: copy a working node of the same type (lookup with rules, router/route, create with `ParentId`, update by id, foreach, debug log) and change IDs, forms and fields.
- Node IDs `s` + 13 digits, unique per workflow; `__argN__` / `__expN__` names unique per workflow.
- Generate the JSON with a small builder script from a backup file; apply with a guarded script; read back and open the builder once to confirm it renders.
- Prefer a node the **designer itself saved** for the same action and field type (ask the user to build one by hand if none exists) over a node you built, and copy its exact shape: rule `Label`, `Operator`, `FieldNodeId` and `ControlType`/`DataType`. The API accepts shapes the editor then can't read.
- A template node carries settings from where it was copied. Reset or re-point them for the new form, for example a lookup's `parentTypeId` / `parentReferenceField` (WP-032) and any leftover form ids; write update and create nodes as the designer saves them (WP-034).
- Give each expression an `ExpressionText` (WP-030); declare arguments as text/number/date rather than copying a lookup-display or time-choice type (WP-031); write trigger and reference paths in the designer's formats (WP-033).
- Take each node's `type` from existing nodes of the same action (iterators are `FOREACH`, WP-035), and test a lookup's filter through `Records/fetch` before relying on it; use `=`, not `contains` (WP-036).
- Before saving, run `scripts/validate-workflows.js` with `workflows: [<built JSON>]`; after saving, run it on the workflow again (WP-038).
- After saving, open **every** new node in the editor and clear its errors before asking the user to run anything: a clean run log does not show that the editor can read the node. Then check the first run's records, not only its status: a filter that resolves to empty can run cleanly and link every row to the same record (WP-033).

### Build a workflow from scratch

1. Confirm UAT and the client id in the URL. Create the empty workflow **off**: `POST v3/Workflows` with `Status: 2`, the trigger node from `node-templates/trigger-*.json` and the global variables it needs (`node-templates.md` §2).
2. Build each node from `node-templates/` (or a designer node in the same app, WP-053): new ids, real form/field ids from `GET v3/forms`, ids rewritten across the subtree (`node-templates.md` §1). Batch loops: WP-016, WP-056; REST variables: WP-057; a REST response that is a list: WP-058. Use the template of each node's own type; a node copied from another workflow brings that workflow's settings (for example a one-record response schema).
3. Run `scripts/validate-workflows.js` on the built JSON, save with `PUT`, run it again; fix every error.
4. Read the workflow back and compare each node with its template (type, keys, operators, `ExpressionText`).
5. Open every new node in the builder once and clear its errors; close with Close, not Done. Connector response fields need a designer Validate (WP-046).
5a. In a builder script, pass real node ids (never your local keys) to every helper that writes an argument or a `NodeId`; `validate-workflows.js` reports a key as `BAD_NODEID`. Keep a workflow `Description` under 1,000 characters (WP-065).
5b. Before writing values: read each dropdown's choice keys and the stored values of existing rows and use the keys (WP-061); build any day or batch counter in the first node of the loop body and never after an iterator that may find no rows (WP-062); build each expression argument once and reuse the object (WP-060 caveat).
5c. When a step reverses an earlier one (reopen, supersede, reset, undo), first list every field the forward step wrote and reverse each one (status, reference, date, counters, flags); filter the rows to reverse by the status the forward step set, so rows that are already reversed or superseded are not touched; clear fields as in WP-066.
6. Limit the source for the first run (a low fetch limit). The user runs it on test records; check the execution log `Message` ("One or more fields could not be populated" means a schema or path problem, WP-058), then the written records for empty key fields and duplicates, with `scripts/verify-workflow-run.js` (WP-039). The validator does not catch run-time behavior.
6b. Test the forward path and then the reverse path on marked test records, and compare the records field by field after each (a reverse that leaves a stale reference or date shows only in the read-back, not in the run status).
7. Only then, and only when the user asks, turn it on.

### Safe-change checklist

1. Environment confirmed (UAT unless told otherwise). 2. Backup of every workflow touched. 3. Change through a template-based builder. 4. Verify: read-back, builder renders, order and on/off unchanged unless intended. 5. The user runs the test on a test record. Read the execution logs and records with `scripts/verify-workflow-run.js` and business checks (WP-039), and report timings and results.

### Review scan

- Routes that can both be true; no "else" route (WP-009).
- Records deleted inside the loop that iterates them (WP-006); logs inside loops (WP-013).
- `1 = 0` / `AND 1 = 0` / `1 contains 0` routes = switched-off code.
- `X != A OR X != B` is always true; use AND.
- Stale field references after a form rebuild (WP-023).
- Hard-coded URLs, thresholds, dates or lists repeated across nodes or workflows → a variable or config record.
- Business rules keyed on a person's name → a flag, role or config record.
- Active test or one-off workflows (especially recurring or "Delete All") → deactivate. Keep an inactive copy of a core workflow as rollback before editing it.

Full review list for a whole app: `app-review-checklist.md`.
