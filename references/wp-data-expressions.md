# Workflow patterns: data, setup and expressions

Entries headed `WP-0xx` use the format and statuses explained at the top of `workflow-patterns.md`; `wp-index.md` lists every entry.

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

### WP-041 A create on a unique field is skipped without a message when the value exists
**Rule:** Before relying on a `CREATE_RECORD` in a re-run, check whether the form marks a field it writes as unique (`UniqueField` in `GET API v3/forms`). To rebuild the rows on a re-run, delete them in one bulk step first (WP-006, WP-008); don't count on the create to replace them.
**Why:** A create whose unique value already exists adds no row, and the step logs no message. The rest of the run goes on, so rows that should be gone (for example a span that no longer qualifies) stay and are counted.
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: a re-run on the same parent left the same three child rows, and the create step's log entry had no message; the field's `UniqueField` is true.

### WP-051 Read a referenced record's fields straight from the trigger; don't fetch it again
**Rule:** When the trigger form has a reference field (ControlType 12) to another form, read that record's fields in expressions and filters with the nested path `__TRIGGERRECORD.<ReferencedFormId>.<referenceField>.<field>`. Don't add a `LOOKUP_RECORD` for a record the trigger already references.
**Why:** The trigger record exposes the referenced record's fields, so a lookup repeats work and adds nodes, run time and a filter that can be wrong.
**Example:** argument `{Field: "<field>", FieldNodeId: "__TRIGGERRECORD.<RefFormId>.<referenceField>.<field>", NodeId: "<referenceField>", TypeId: "<RefFormId>", Label: "<field label>"}`.
**Caveats:** Applies to references on the trigger record itself. A record reached through another lookup, and the child records of a referenced record (filter on their parent), still need a lookup. To use the referenced record itself as a filter value (e.g. a `ParentId` filter), don't end the path in `.id`: that form does not resolve in the editor; pass the reference field itself, see WP-033.
**Status:** Hypothesis · checked 2026-11 · Studio 8.2.0.25 · Evidence: existing workflows read referenced fields this way; four redundant lookups in a new workflow were flagged in review and replaced; the `.id` form tried for a parent filter showed an empty value in the editor; run result not yet recorded.
