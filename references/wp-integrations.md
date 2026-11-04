# Workflow patterns: integrations and sync

Entries headed `WP-0xx` use the format and statuses explained at the top of `workflow-patterns.md`; `wp-index.md` lists every entry.

## 6. Integrations and sync

### WP-016 Batched external sync with one token
**Rule:** One token per run or batch. Counter vars → Iterator appends IDs → route "batch full OR last item" → build the batch payload (e.g. `multi_read`) → POST → `200` route → Transform → Save Records → reset vars.
**Why:** A token per item wastes calls; one token for a very long run can expire → late 401s.
**Caveats:** Node shapes for every step: `node-templates.md`; the last-item test and the list format: WP-056; variables in the request: WP-057.
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

### WP-042 Remove records a sync no longer returns: stamp each sync, then delete what the stamp missed
**Rule:** In a sync that saves records from an external source on a unique key (an upsert), add a date-time field (the sync stamp). Set a variable to the current time before fetching, and write it to every saved record. After the last batch, if no batch failed, delete the synced scope's records whose stamp is empty or older than that variable; if any batch failed, mark the job Failed and skip the delete.
**Why:** The source returns only what exists now, so a record it dropped or replaced stays in the app. An upsert refreshes the stamp on every record it saves, so a stale record is one this run did not touch. Deleting by stamp, not purge-and-reload, means a failed call never empties the range.
**Example:** After the batches, loop over the synced owners (one delete each) with `DELETE_RECORDS`: owner key `=` the loop's owner, date `>=` range start, date `<` range end + 1 day, and an OR group of `<stamp> isEmpty` and `<stamp> < <start variable>` (`isEmpty` works inside a delete filter).
**Caveats:** Scope the delete per synced owner (an employee) when the source returns that owner's records from every location, so a transfer record is not removed by another location's run. This costs one delete call per owner. For a text prefix in a lookup filter, `startswith` works through `Records/fetch` (`contains` matches words, WP-036); confirm the editor shows it. Related: WP-005, WP-029, WP-040, WP-041.
**Status:** Hypothesis · checked 2026-11 · Studio 8.2.0.25 · Evidence: built as saved nodes and every expression passed the editor's check; the delete and the stamp have not been run yet. The shape follows an exported sync workflow that deletes by a sync date-time.

### WP-047 A list inserted into a REST connector's JSON body needs escaped quotes
**Rule:** When a workflow variable is placed inside the `raw` body of a REST connector (Postman-style spec), build string items with escaped quotes (`\"A\",\"B\"`), not plain ones. In an expression, one escaped quote is written `"\\\""`.
**Why:** The placeholder is replaced as text inside a JSON string. Plain quotes end that string early and the connector fails with "After parsing a value an unexpected character was encountered ... Path 'request.body.raw'".
**Example:** `<list> + (<count> == 0 ? "" : ",") + "\\\"" + <item> + "\\\""`
**Caveats:** Applies to values inserted inside `raw`. Query-string and header placeholders are inserted as plain values (not tested with quotes).
**Status:** Hypothesis · checked 2026-11 · Studio 8.2.0.25 · Evidence: batched read failed with the error above using plain quotes; the escaped form was saved but its run result is not yet recorded.

### WP-048 Transform or Create over nested arrays can produce zero rows without an error
**Rule:** After a first test of a Transform (or an Iterator + Create) that reads a nested array (`$.[*].a[*].b[*].field`), check the saved record count, not only the run status. If nothing was written, try a flat path (`$..b[*].field`) for every field of the mapping.
**Why:** The run finished with status OK, the Transform and Save steps took about 0 ms, and no records appeared. The same mapping over a single array level works.
**Caveats:** Unconfirmed: whether the flat path fixes it. Also unconfirmed: whether the cause was the nested path or an empty response; read the response first when the connector allows it (see WP-046).
**Status:** Hypothesis · checked 2026-11 · Studio 8.2.0.25 · Evidence: one UAT run with a nested path wrote nothing; the flat-path rerun is not yet recorded.

### WP-050 Read many employees' timecards in one call with employee_timecard/multi_read
**Rule:** For a batched timecard read, POST `/v1/timekeeping/employee_timecard/multi_read` instead of one GET per employee. Body: `select` (e.g. `["WORKED_SHIFTS"]`), `where.dateRange {startDate, endDate}` (end date exclusive), `where.employees.qualifiers [<person numbers>]` (or `ids`), `multiReadOptions` (e.g. `includePhantomPunches`, `breakSpanAtMidnight`). The response is a list, one timecard per employee.
**Why:** The per-employee GET costs one call per person; the list form fits the batching in WP-016.
**Example:** worked time is at `workedShifts[*].workedSpans[*]`, each span with `startPunch` / `endPunch` (each has `isPhantom`), `primaryOrgJob` (path in `qualifier`) and `transferOrgJob`.
**Caveats:** `isPhantom = true` marks a punch UKG created (a missing punch, or a midnight split); with `breakSpanAtMidnight` off, it should mean a missing punch only (untested). The `select` list is also optional on the per-employee GET.
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: body and response shape from the vendor's API spec; a UAT workflow posting batches of 50 person numbers logged five successful runs with every step OK (written values not re-checked).

### WP-056 Detect "batch full or last item" with counters, and build the list in a text variable
**Rule:** Keep three variables: `batchList` (text), `batchCount` and `index` (numbers). Inside the FOREACH: set `batchList = batchList + (batchCount == 0 ? "" : ",") + "\\\"" + <item field> + "\\\""`, then `batchCount + 1` and `index + 1`; then a ROUTE with `Condition: "OR"`: `batchCount >= <size>` OR `index >= <lookup>.Count`. Inside the route: call, log, then reset `batchList = ""` and `batchCount = 0`.
**Why:** A FOREACH exposes only the current item: there is no index or last-item flag, so the last partial batch is caught by comparing the counter with the lookup's `Count` output.
**Caveats:** Use `>=`, not `=`. Reset `index` before the loop. The escaped quotes make each item a JSON string, so `[__expN__]` in the request body becomes `["a","b"]`. Shapes: `node-templates/assign-append-text.json`, `route-batch-full-or-last.json`.
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: two UAT workflows with this loop logged successful runs (all steps OK); a copy rebuilt from templates passed `validate-workflows.js` with 0 errors, opened in the editor without errors, and ran 1,000 records in batches of 50 in 23 s with every step OK.

### WP-057 Put a variable in a REST connector by an `__expN__` placeholder plus a `Variables` entry
**Rule:** In the REST connector's `Properties[0].Value.Request` (a Postman request as a JSON string), write `__expN__` where the value goes (URL, query, raw body, or the bearer token value), and add `{Name: "__expN__", Expression, Arguments, ExpressionText, NodeDisplayText: ""}` to `Properties[0].Variables`. Use the token generator's output `<tokenNode>.<schemaId>.$.access_token` for the bearer value.
**Why:** The connector substitutes each placeholder from `Variables` at run time; a placeholder without an entry is sent as literal text.
**Caveats:** Format dates in the variable expression (`[...].ToString( "yyyy-MM-dd" )`). Response fields must come from the designer (WP-046). Template: `node-templates/connector-rest-post-variable-body.json`.
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: read from designer-saved REST nodes (GET with query placeholders) and a POST body edited through the API that logged successful runs.
