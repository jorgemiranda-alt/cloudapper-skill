### WP-??? Records saved in bulk (Transform + Save Records) have no references; link them in an After Create workflow
**Rule:** When rows are written by `TRANSFORM_RECORDS` → `SAVE_RECORDS` (or any bulk write), add an After Create workflow on `<LoadedForm>` that fills its reference fields from values the new record already carries:
1. One `LOOKUP_RECORD` per target, filtered on a field of the trigger record (e.g. `<TargetA>.<KeyField> = trigger.<KeyCopy>`), not on a person, a loop item or the parent's primary value. Use the value from the record's own source row (e.g. a transfer's own org path), so each row links to the node it actually belongs to.
2. A ROUTER with one route "Found" = `id isNotEmpty` on every lookup (AND). No halt: an unmatched row is still saved and stays unlinked.
3. `UPDATE_RECORD` on `<LoadedForm>`, matched with `id = trigger record id`, assigning each reference field (ControlType 12) from its lookup node (`Field "id"`, `NodeId` = the lookup node).
**Why:** A bulk save has no loop record to take a parent from, so nothing sets the relation. `ParentId` is only set by a `CREATE_RECORD` inside a loop over the parent.
**Caveats:** `<LoadedForm>` does not need to be a child form; plain reference fields are enough, and `ParentId` should not be used for this. The workflow must have a higher Sequence than the workflow that saves the rows (WP-001), or it never fires. Add the reference fields to the form and reload the app before building the workflow. Keep it off until the loading workflow has been tested.
**Status:** Hypothesis · checked 2026-11 · Studio 8.2.0.25 · Evidence: structure of a corrected workflow read back from a UAT app, route and update shapes copied from it; run results not yet recorded.

<!-- Review notes, not copied into the skill -->
- How to reproduce: in a test app, load 5 rows into `<LoadedForm>` with a Transform + Save Records workflow (one row whose key matches no `<TargetA>` record). Turn on the After Create workflow placed after it. Expected: matched rows get both reference fields filled; the unmatched row is saved with them blank; rerunning the load does not fail. Wrong if the workflow never fires (check Sequence), or if the reference fields can only be set at create time.
- Conflicts checked: WP-001 (order), WP-016 (batched sync ends in Transform → Save Records), WP-017 (upsert), WP-024 (update the trigger record by its id): consistent.
- Open question for reviewers: does Save Records fire After Create once per saved row? The pattern assumes it does.
- Captured by: JM, from a session on 2026-11-01
