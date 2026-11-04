# Workflow patterns: triggers, order, loops and batching

Entries headed `WP-0xx` use the format and statuses explained at the top of `workflow-patterns.md`; `wp-index.md` lists every entry.

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
