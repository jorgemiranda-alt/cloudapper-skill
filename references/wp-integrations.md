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
**Status:** Hypothesis · checked 2026-11 · Studio 8.2.0.25 · Evidence: built as saved nodes and every expression passed the editor's check (twice, in two workflows, the second from an exported reference: stamp = a `syncStart` variable set once, a `failed` counter raised by an "If Not OK" route, cleanup only when `failed = 0`, the batch reset outside the OK route so a failed batch is not re-sent); the delete has not been run yet. Save Records refreshes the stamp of rows that already exist: a second run moved the stamp of all 575 saved rows with no duplicates, so rows still returned by the source are never stale.

### WP-047 A list inserted into a REST connector's JSON body needs escaped quotes
**Rule:** When a workflow variable is placed inside the `raw` body of a REST connector (Postman-style spec), build string items with escaped quotes (`\"A\",\"B\"`), not plain ones. In an expression, one escaped quote is written `"\\\""`.
**Why:** The placeholder is replaced as text inside a JSON string. Plain quotes end that string early and the connector fails with "After parsing a value an unexpected character was encountered ... Path 'request.body.raw'".
**Example:** `<list> + (<count> == 0 ? "" : ",") + "\\\"" + <item> + "\\\""`
**Caveats:** Applies to values inserted inside `raw`. Query-string and header placeholders are inserted as plain values (not tested with quotes).
**Status:** Hypothesis · checked 2026-11 · Studio 8.2.0.25 · Evidence: batched read failed with the error above using plain quotes; the escaped form was saved but its run result is not yet recorded.

### WP-048 Transform or Create over nested arrays can produce zero rows without an error
**Rule:** After a first test of a Transform (or an Iterator + Create) that reads a nested array (`$.[*].a[*].b[*].field`), check the saved record count, not only the run status. If nothing was written, try a flat path (`$..b[*].field`) for every field of the mapping.
**Why:** The run finished with status OK, the Transform and Save steps took about 0 ms, and no records appeared. The same mapping over a single array level works.
**Caveats:** A flat path (`$..exceptions[*].field`) works once the connector's response schema declares the repeating array (WP-058). Check that first; read the response when the connector allows it (see WP-046).
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: a first nested-path run wrote nothing (earlier); a later workflow with flat paths saved 575 distinct records over four runs after its schema was set to a list (WP-058), and none before.

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

### WP-058 A REST response that returns a list needs its schema declared as a list
**Rule:** In the connector's `CustomSchema[0]` set `WorkflowActionType: "LOOKUP_RECORDS"` and `WorkflowJsonPath` to the repeating array (for example `$..exceptions[*]`), with `CustomSchemaSource: "Body"`; field names stay `$..exceptions[*].<field>`. A schema copied from a connector that returns one object has `WorkflowActionType: "LOOKUP_RECORD"` and an empty `WorkflowJsonPath`: change those two keys as well as `Fields`. Build the node from `node-templates/connector-rest-post-variable-body.json`, not from another workflow's connector.
**Why:** With the single-record metadata the Transform builds one row from the whole response. The run ends OK with the message "One or more fields could not be populated", and Save Records writes rows that hold only the constants (a status, a timestamp) and no key.
**Caveats:** `validate-workflows.js` does not flag it. After the first run read the execution log `Message` and look for saved records with an empty key field (they cannot be upserted, so they pile up); stop on either. A small first run (a low fetch limit) keeps the cleanup small. Related: WP-048, WP-046.
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: three runs of an API-built workflow logged the message above and saved three key-less records; after the owner set the two schema keys in the builder the next run logged no message, and 575 distinct records were saved with no duplicate keys across four runs.

### WP-057 Put a variable in a REST connector by an `__expN__` placeholder plus a `Variables` entry
**Rule:** In the REST connector's `Properties[0].Value.Request` (a Postman request as a JSON string), write `__expN__` where the value goes (URL, query, raw body, or the bearer token value), and add `{Name: "__expN__", Expression, Arguments, ExpressionText, NodeDisplayText: ""}` to `Properties[0].Variables`. Use the token generator's output `<tokenNode>.<schemaId>.$.access_token` for the bearer value.
**Why:** The connector substitutes each placeholder from `Variables` at run time; a placeholder without an entry is sent as literal text.
**Caveats:** Format dates in the variable expression (`[...].ToString( "yyyy-MM-dd" )`). Response fields must come from the designer (WP-046). Template: `node-templates/connector-rest-post-variable-body.json`.
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: read from designer-saved REST nodes (GET with query placeholders) and a POST body edited through the API that logged successful runs.

### WP-059 Read a schedule or any data element set with commons/data/multi_read
**Rule:** POST `/v1/commons/data/multi_read` with `select: [{key}]` (data-dictionary keys from `GET /v1/commons/data_dictionary/data_elements`), `from: {view: "EMP", employeeSet: {employees: {qualifiers: [<person numbers>]}, dateRange}}`, `where` and `count`. A filtered column must also be in `select`. To keep only one row kind, filter on the type column: `{key: "SCH_SCHEDULE_EVENT_TYPE_NAME", operator: "EQUAL_TO", values: ["Shift"]}` (`IN` also works; `EQUALS` is refused). The response is a flat list at `$.data.children[*]`: the employee number is at `coreEntityKey.EMP.qualifier`, the day at `coreEntityKey.DAY.id`, and the values at `customProperties.*` (for a shift: `EVENT_ID`, `EVENT_START_DATE`, `EVENT_END_DATE`, `EVENT_SHIFT_LABEL`).
**Why:** Without the type filter the list mixes shifts, shift segments and pay code edits, so a flat path pairs values from different rows. Declare the schema as a list (WP-058) with `WorkflowJsonPath: $.data.children[*]`.
**Caveats:** Unknown or deactivated keys return `WCO-106166` (the message names the key). The service limit on employees times days is documented but was tested only with 2 employees; check the first 50-employee run. `EVENT_ID` arrives as text: confirm it saves into an integer key.
**Status:** Hypothesis · checked 2026-11 · Studio 8.2.0.25 · Evidence: read-only calls for two employees over 24 days returned 35 shifts with the type filter (71 rows without it); the workflow built from it passed the validator and has not been run yet.
