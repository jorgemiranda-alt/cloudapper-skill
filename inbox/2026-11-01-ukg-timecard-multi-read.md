### WP-??? Read many employees' timecards in one call with employee_timecard/multi_read
**Rule:** For a batched timecard read, POST `/v1/timekeeping/employee_timecard/multi_read` instead of one GET per employee. Body: `select` (e.g. `["WORKED_SHIFTS"]`), `where.dateRange {startDate, endDate}` (end date exclusive), `where.employees.qualifiers [<person numbers>]` (or `ids`), `multiReadOptions` (e.g. `includePhantomPunches`, `breakSpanAtMidnight`). The response is a list, one timecard per employee.
**Why:** The per-employee GET costs one call per person; the list form fits the batching in WP-016.
**Example:** worked time is at `workedShifts[*].workedSpans[*]`, each span with `startPunch` / `endPunch` (each has `isPhantom`), `primaryOrgJob` (path in `qualifier`) and `transferOrgJob`.
**Caveats:** `isPhantom = true` marks a punch UKG created (a missing punch, or a midnight split); with `breakSpanAtMidnight` off, it should mean a missing punch only (untested). The `select` list is also optional on the per-employee GET.
**Status:** Hypothesis · checked 2026-11 · Studio 8.2.0.25 · Evidence: body and response shape read from the vendor's published API spec and a sample response; the batched call was not yet confirmed end to end.

<!-- Review notes, not copied into the skill -->
- How to reproduce: send the body above for two person numbers and a date range with known punches. Expected: two timecards, each with `workedShifts`. Wrong if `qualifiers` is not accepted or spans carry no `primaryOrgJob`.
- Conflicts checked: WP-016: consistent. (Also belongs in `integrations-ukg.md` once verified.)
- Captured by: JM, from a session on 2026-11-01
