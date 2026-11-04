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
