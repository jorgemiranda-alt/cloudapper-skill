# Workflow patterns and gotchas

Each entry's heading names the situation. **Rule** says what to do, **Why** says what the engine does, and **Status** says how sure we are:

- `Verified`: reproduced by a second person in a test app; the evidence names the test.
- `Observed`: seen on a live app by one person. Fine to follow; for a risky change, say you're relying on an Observed entry and test in UAT first.
- `baseline` instead of a date: imported when the skill moved to its repo (2026-11) and not re-checked since.

IDs (`WP-001`) are stable and shared across reference files (WP-027 and WP-028 are API techniques in `api-reference.md`; WP-029 sits in section 6); cite them in reviews and docs. Drafts in `inbox/` and anything in `retired.md` are not guidance; don't read them as rules.

## Contents
1. Triggers and order: WP-001 to WP-004
2. Loops and batching: WP-005 to WP-008
3. Routers: WP-009
4. Performance: WP-010
5. Errors, logging and validation: WP-011 to WP-015
6. Integrations and sync: WP-016 to WP-019, WP-029
7. Data, setup and expressions: WP-020 to WP-026
8. Procedures: debugging, readable workflows, node JSON, safe-change checklist, review scan

## 1. Triggers and order

### WP-001 A workflow's record change only triggers workflows later in the list
**Rule:** Place a workflow that creates or updates records **before** every workflow it should trigger (lower Sequence). Keep the list order identical between environments.
**Why:** A change made by a workflow only triggers workflows with a higher Sequence. A workflow cannot retrigger itself.
**Status:** Observed · baseline · Evidence: a batch workflow placed after the workflow it should trigger fired nothing; moved before it, everything fired.

### WP-002 Setting a status to its current value triggers nothing
**Rule:** To rerun a record that already has the trigger value, set an intermediate value first ("Pending"), or route: "Pending" if currently "Running", else "Running".
**Why:** `Status _IsUpdated` only fires when the value actually changes.
**Status:** Observed · baseline · Evidence: a record at "Running" set to "Running" again did not start its workflow.

### WP-003 Status-driven pipeline
**Rule:** Buttons set Status (ActivityType 1); After-edit workflows trigger on `Status _IsUpdated AND Status = X`. Never let a workflow write the status that triggers itself.
**Caveats:** Before changing a status by hand, list every workflow triggered on that field.
**Status:** Observed · baseline

### WP-004 Re-creating a record re-runs its On Create chain
**Rule:** Before re-creating a record (to fix or rerun it), list the On Create workflows of its form and expect all of them to run again.
**Status:** Observed · baseline

## 2. Loops and batching

### WP-005 Triggered runs of one workflow are serial, and the caller doesn't always wait
**Rule:** Run one batch at a time; check the triggered records' statuses before starting another batch.
**Why:** Triggered runs of one workflow execute one at a time. Some CREATE/UPDATE steps wait for the workflows they trigger (the parent lasts exactly as long as its child); others only queue them.
**Status:** Observed · baseline · Evidence: a loop that updated 24 records finished in seconds while the 24 triggered runs executed one by one over the next hour; a second batch started meanwhile lost its triggered runs.

### WP-006 A FOREACH iterates its list as fetched
**Rule:** Delete in one bulk step first, then fetch and loop. Never delete records inside the loop that iterates them.
**Why:** Records deleted inside a FOREACH are still iterated and counted, then fail to update ("No record found to update").
**Status:** Observed · baseline · Evidence: seen on a live app.

### WP-007 Batch rerun from a parent record
**Rule:** To rerun every child process of a period or group from one click:
- Child form under the parent (Confirm, Reason, read-only Batch Status) + parent button (UI workflow `ADD_NEW_RECORD`, Parent = `_triggerForm`); grant the role privilege and save the relation.
- Workflow on the batch form (create): mark In Progress → load the parent → LOOKUP_RECORDS the children (scope filters, sorted so related items run together) → FOREACH → ROUTER on current status → UPDATE status (WP-002) → after the loop mark Completed.
**Caveats:** Place it before the workflow it triggers (WP-001). Sort so items sharing data run consecutively, so WP-010 kicks in. Mind WP-005.
**Status:** Observed · baseline

### WP-008 Run stamp + bulk cleanup for safe reruns
**Rule:** Set `Date&Time = UtcNow()` at the start, stamp every record the run writes with it, and delete records of the same scope with an older stamp in one step before reading them back.
**Status:** Observed · baseline

## 3. Routers

### WP-009 A Router runs every route whose condition is true
**Rule:** Make route conditions mutually exclusive and add an explicit "else" route when only one outcome is wanted.
**Why:** A Router is not first-match; every true route runs.
**Status:** Observed · baseline · Evidence: seen on a live app.

## 4. Performance

### WP-010 Reuse a recent sync instead of pulling the same data again
**Rule:** When several calculations need the same freshly pulled external data (same scope, e.g. location + date):
- The parent workflow creates **job records** (Type, Status, scope fields) that trigger the sync workflows; stamp the scope on them.
- At the start of each sync: LOOKUP_RECORD on the job form with Type = this type, Status = Completed, same scope, CreateDate > `AddMinutes(UtcNow( ), -N)`; then a ROUTER: **Needs fresh sync** (none found or scope empty) → sync steps → mark job Completed (sibling after the loop); **Recently synced (skip)** (found) → mark job Completed.
- A failed sync never marks Completed, so the next run syncs again.
**Caveats:** Window N: just long enough to cover consecutive runs of the same scope in one batch (minutes).
**Status:** Observed · baseline · Evidence: measured once, fresh external sync 25–75 s, reused ≈ 1 s.

## 5. Errors, logging and validation

### WP-011 Every external call needs a real failure route
**Rule:** Add a route that writes an error status + reason, keep a failed-payload record with a Resend button, and make retries idempotent. Steps that only run "on create" need a scheduled retry for records left "Not Synced".
**Why:** A `!= 200` route misses timeouts and empty responses.
**Status:** Observed · baseline

### WP-012 "Could not prepare values for the fields: X" in the log
**Rule:** Fix the expression assigned to X; it failed (often report syntax used in a workflow, e.g. `IsNull(x, 0)`, see WP-026).
**Why:** The failing field is skipped; the step's other fields still save.
**Status:** Observed · baseline

### WP-013 A DEBUG_LOG inside a FOREACH keeps one pass only
**Rule:** In each pass append a line to a text workflow variable (`var + <line> + "<br/>"`) or add 1 to a counter; reset those variables at the start of the run; print them in one summary log right after the loop.
**Status:** Observed · baseline

### WP-014 Workflow Description is limited to 1,000 characters
**Rule:** Keep the run-order summary in the Description under 1,000 characters.
**Why:** Longer saves fail with `value too long for type character varying(1000)`.
**Status:** Observed · baseline

### WP-015 Before-save validation with Halt Operation
**Rule:** Use a Before-create/edit workflow + Halt Operation with a message to block bad data.
**Caveats:** Side effects done before the halt stay: avoid them or document a manual reset.
**Status:** Observed · baseline

## 6. Integrations and sync

### WP-016 Batched external sync with one token
**Rule:** One token per run or batch. Counter vars → Iterator appends IDs → route "batch full OR last item" → build the batch payload (e.g. `multi_read`) → POST → `200` route → Transform → Save Records → reset vars.
**Why:** A token per item wastes calls; one token for a very long run can expire → late 401s.
**Status:** Observed · baseline

### WP-017 Scheduled syncs must upsert
**Rule:** Use SAVE_RECORDS keyed on the external ID (or delete-then-rebuild), not CREATE_RECORD. Add a sync-log record per run (start, end, counts, errors).
**Why:** CREATE_RECORD in a scheduled sync duplicates rows every run; re-running a "create child rows" step duplicates children too.
**Status:** Observed · baseline

### WP-018 Approval chain
**Rule:** On create, build one approver row per step (first **Pending**, the rest blank, final approver last), each with a GUID carried in the email link. The approval page posts to an Incoming Webhook that acts **only if the row is Pending** (a second click does nothing) and writes Approved/Rejected; an After-edit workflow on that status makes the next row Pending. Find the next row by sequence, not by name.
**Why:** Reference data changing between runs stalls a name-based chain silently.
**Caveats:** A GUID-only public link is a risk: accept it explicitly or add expiry / sign-in.
**Status:** Observed · baseline

### WP-019 Notification queue
**Rule:** Workflows create Notification records; one "Send Notification" workflow (After Create) sends them using the record's To field, with one test-redirect switch for non-production instead of duplicate test rows.
**Status:** Observed · baseline

### WP-029 Bulk-saved records have no references; link them in an After Create workflow
**Rule:** When rows are written by `TRANSFORM_RECORDS` → `SAVE_RECORDS` (or any bulk write), add an After Create workflow on the loaded form that fills its reference fields from values the new record already carries:
1. One `LOOKUP_RECORD` per target, filtered on a field of the trigger record (e.g. `<Target>.<Key> = trigger.<KeyCopy>`), not on a loop item or the parent's primary value. Use the record's own source value (e.g. a transfer's own org path), so each row links to the node it belongs to.
2. A ROUTER with one route "Found" = `id isNotEmpty` on every lookup (AND). No halt: an unmatched row is still saved and stays unlinked.
3. `UPDATE_RECORD` on the same form, matched with `id = trigger record id` (WP-024), assigning each reference field (ControlType 12) from its lookup node (`Field "id"`, `NodeId` = the lookup node).
**Why:** A bulk save has no loop record to take a parent from. `ParentId` is only set by a `CREATE_RECORD` inside a loop over the parent.
**Caveats:** The form does not need to be a child form; plain reference fields are enough, so don't use `ParentId` here. The workflow needs a higher Sequence than the one that saves the rows (WP-001). Add the reference fields to the form and reload the app first. Keep it off until the loading workflow (WP-016) is tested.
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: structure of a corrected workflow read back from a test app; no run result recorded yet, so whether Save Records fires After Create once per saved row is unconfirmed.

## 7. Data, setup and expressions

### WP-020 Workflows depend on setup records
**Rule:** When copying or creating an app, copy or create the setup/config records (rules, cut-offs, flags, mappings) its workflows read.
**Why:** Without them those workflows produce wrong or no results.
**Status:** Observed · baseline · Evidence: seen on a live app.

### WP-021 Node names lie
**Rule:** Check references (`FieldNodeId`, variables) before removing any node, whatever its name.
**Why:** Nodes named "(DO NOT USE)" can be essential (e.g. computing an ID a later lookup uses).
**Status:** Observed · baseline · Evidence: seen on a live app.

### WP-022 Copying workflow definitions copies the pipeline split
**Rule:** Keep on/off states and order consistent with the source when copying workflows.
**Why:** Updating old workflows with newer versions while their new companion workflows stay off breaks the pipeline (jobs stuck "In Progress").
**Status:** Observed · baseline · Evidence: seen on a live app.

### WP-023 Workflows keep stale field references after a form rebuild
**Rule:** After re-adding fields to a form, re-point every workflow filter and assignment that used the old fields.
**Why:** Workflows keep internal names (`stringField0`); re-added fields get new names and filters silently run on empty values.
**Status:** Observed · baseline

### WP-024 Pair records by an ID, not by "newest"
**Rule:** Don't pair start and end records by "newest by CreateDate": write a correlation/session ID on the first and look it up, or keep start and end on one record. To update the trigger record in an after-save workflow, match a value set when the form opened (e.g. a generated ID field) or the record id.
**Status:** Observed · baseline

### WP-025 Durations
**Rule:** Use `DateDiffMinute/60` and round explicitly. For HH:MM, round total minutes first, then split (avoids ":60").
**Why:** `DateDiffHour` truncates.
**Status:** Observed · baseline

### WP-026 Workflow expressions are not report expressions
**Rule:** Initialise variables instead of wrapping them in `IsNull`.
**Why:** In workflows `IsNull(x)` takes one argument and returns true/false.
**Status:** Observed · baseline

## 8. Procedures

### Debugging

**"It doesn't fire"**
1. Is the target workflow on (`Status 1`)? Is `TriggeredOn` right (1 create / 2 update / 4 both)?
2. Is the source workflow **before** the target in the list (WP-001)?
3. Does the trigger rule match? For `_IsUpdated`, did the value really change (WP-002)?
4. Read both workflows' execution logs (API) around that time; no entry = never triggered.

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

- Never hand-invent node shapes: copy a working node of the same type (lookup with rules, router/route, create with `ParentId`, update by id, foreach, debug log) and change IDs, forms and fields.
- Node IDs `s` + 13 digits, unique per workflow; `__argN__` / `__expN__` names unique per workflow.
- Generate the JSON with a small builder script from a backup file; apply with a guarded script; read back and open the builder once to confirm it renders.
- Prefer a node the **designer itself saved** for the same action and field type (ask the user to build one by hand if none exists) over a node you built, and copy its exact shape: rule `Label`, `Operator`, `FieldNodeId` and `ControlType`/`DataType`. The API accepts shapes the editor then can't read.
- A template node carries settings from where it was copied. Reset or re-point them for the new form, for example a lookup's `parentTypeId` / `parentReferenceField` (a wrong value blanks "Type of Record") and any leftover form ids.
- Give each expression an `ExpressionText`; declare arguments as text/number/date (`ControlType` 4, 3 or 11) rather than copying a lookup-display or time-choice type; write a plain trigger field as `__TRIGGERRECORD.<field>` and a reference field with the referenced form id in the path.
- After saving, open **every** new node in the editor and clear its errors before asking the user to run anything: a clean run log does not show that the editor can read the node.

### Safe-change checklist

1. Environment confirmed (UAT unless told otherwise). 2. Backup of every workflow touched. 3. Change through a template-based builder. 4. Verify: read-back, builder renders, order and on/off unchanged unless intended. 5. The user runs the test; read the execution logs and records and report timings and results.

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
