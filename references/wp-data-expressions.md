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

### WP-052 Use the Expression Editor's built-in time zone functions, and skip conversion when both sides are already local
**Rule:** Before writing a time zone expression, open the Expression Editor, Tools → Function → Date-Time (search "Timezone"), and use the built-ins with IANA names as strings: `ConvertDateTime(input, sourceTimezone, targetTimezone)`, `ConvertDateTimeToUTC(input, sourceTimezone)`, `ConvertFromUTCDateTime(input, targetTimezone)`, each with a DateTime and a string overload (e.g. `ConvertFromUTCDateTime( UtcNow(), "America/Los_Angeles" )`). Don't write .NET calls such as `TimeZoneInfo...` in a workflow expression.
**Why:** The engine exposes its own function set (the editor lists it and validates what you type); .NET types are not known to be available.
**Caveats:** Don't convert when both values are already local to the same place: e.g. a timecard feed that returns local times compared with setup records (service windows, cut-offs) entered in local time. Convert only when one side is UTC. Check what the source labels its times with (some test tenants label everything UTC).
**Status:** Hypothesis · checked 2026-11 · Studio 8.2.0.25 · Evidence: the function list and a validated `ConvertFromUTCDateTime` / `ConvertDateTime` expression seen in the Expression Editor; not yet run in a workflow.

### WP-054 Before adding an update path after a lookup, make sure the lookup can only match the right record
**Rule:** A "create if missing" route after a lookup is safe even if the lookup is loose: a false match only skips a create. An "update if found" route is not: a false match overwrites an unrelated record. Before adding an update route to that lookup:
- Read the lookup's full filter list (print every rule, not the first few) and check it includes everything that makes the record unique: the owner or parent (location, parent record id), the date, and each key field.
- Check that no filter value can be empty. An empty filter value makes the lookup return the first record silently (WP-033).
- Make the two routes exclusive: `isEmpty` on the lookup's id for create, `isNotEmpty` for update.
- Check what the update triggers downstream. A workflow that starts on `Status _IsUpdated` does not fire when an update changes only amounts, so the dependent records (rates, child rows) stay stale unless the update also changes the status.
To add a missing reference filter, build it from two nodes the designer saved: an existing reference filter on the same lookup (shape: `FieldNodeId` `<lookupNodeId>.<ReferencedFormId>.<field>`, `ControlType` 12) and the node that already assigns that reference (its value argument).
**Why:** Master-data keys (service period, pool, type) repeat for every owner and day, so a filter that omits the owner matches another owner's record.
**Caveats:** Related: WP-009 (a router runs every true route), WP-002 (status trigger needs a change).
**Status:** Hypothesis · checked 2026-11 · Studio 8.2.0.25 · Evidence: a lookup filtered on period, pool and date but not location was found before the update route was run; the location filter was added from two designer-saved nodes and opened in the editor without errors; the update path itself has not been run yet.

### WP-061 A dropdown is written and filtered by its choice key, not its label
**Rule:** In a CREATE, UPDATE or TRANSFORM node, and in a lookup, route or delete filter, give a dropdown field its **choice key** (`dro_choice_1`, `dro_choice_2`, ...), not the label shown in the form. Read the keys from the form's `DefaultItems` (design API) and read the stored values of existing rows (`Records/fetch`) before you write the first node; copy the value of a row the designer saved.
**Why:** A label written by a node saves without an error and displays, but a filter that uses the key never matches it, so rows written by two workflows (or by a node and a person) end up with two spellings. Seen in one app: 75 rows hold `dro_choice_1` in a status field and the owner's filter uses it; a status written as the label "Open" by an API-built node was stored as "Open"; a type field written as a label ("Unexcused Absence") was stored as the label.
**Caveats:** Write the value the way the designer saves it: a plain string `Value: "<key>"` with `ControlType 2`, `DataType 0`, not an expression object (the owner replaced an expression-object value with this form after the editor accepted both). The keys of a dropdown created in the designer follow the order of the choices (`dro_choice_1`, ...); a field built from your own definition may use other keys (check `DefaultItems`). **When you add a dropdown or a choice, make the key equal to the display text** (`DefaultItems: {"Open": "Open"}`, colour option `choiceId` the same text, `DefaultValue` the keys joined by commas) so a literal, a filter and a stored value read the same everywhere; in the designer's choice dialog type the same text in Key as in Display Text. Do not change the key of an existing choice on your own: rows and filters that hold the old key stop matching (the designer warns about this). When the owner asks to convert `dro_choice_N` keys to labels, do it as one change: (1) list every use first: every workflow node whose rule, route or assignment has `Field` = that field on that form, plus the distinct stored values (`Records/fetch`); (2) the owner changes the keys in the designer (`DefaultItems` then reads `{"Open":"Open",...}`); (3) rewrite the stored values; (4) map every workflow use old key → new key in one pass per workflow, then remove duplicate rules left in OR groups; (5) read back and check that no old key remains on that field. Run no workflow in between. Never "fix" a mismatch by adding the label to the filter as a second OR rule (`= dro_choice_1 OR = Open`): it hides the mixed data instead of fixing it, and the extra rule outlives the fix. The first record check after a run should list the distinct stored values of every dropdown the workflow wrote.
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: owner replaced a status literal "Active" with `dro_choice_1` in a saved workflow and wrote the same key in a lookup filter; the same mistake was then repeated in a new workflow and showed in the saved rows.


### WP-069 Assignments in one Set Variables node all read the values from before the node
**Rule:** In an `ASSIGN_VARIABLES` node, every assignment is evaluated with the variable values as they were when the node started, not after the assignments above it. When one variable depends on another computed in the same step (a rank, then a "this row is later" flag, then the values that use the flag), put each dependency level in its own node, chained parent to child. An increment written in the same node as a use of the old value (`scanDate = f(passIndex)`, `passIndex = passIndex + 1`) relies on this.
**Why:** A fold over ledger rows computed a rank, a flag from the rank and a level from the flag in one node. The level used the previous row's flag, so a replay with history before its start date wrote level 1 instead of 3, with no error. A test that replayed from before any history passed, because every flag was 0.
**Caveats:** Test a fold or running total with at least two prior rows, not only from an empty start. Review every multi-assignment node for a variable that is assigned and read in the same node.
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: the same fold split into three chained nodes; the existing "08 Set Scan Date" node computes the scan date from the old pass index in the node that increments it.
