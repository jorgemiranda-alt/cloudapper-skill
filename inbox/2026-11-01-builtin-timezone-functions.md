### WP-??? Use the Expression Editor's built-in time zone functions, and skip conversion when both sides are already local
**Rule:** Before writing a time zone expression, open the Expression Editor, Tools → Function → Date-Time (search "Timezone"), and use the built-ins with IANA names as strings: `ConvertDateTime(input, sourceTimezone, targetTimezone)`, `ConvertDateTimeToUTC(input, sourceTimezone)`, `ConvertFromUTCDateTime(input, targetTimezone)`, each with a DateTime and a string overload (e.g. `ConvertFromUTCDateTime( UtcNow(), "America/Los_Angeles" )`). Don't write .NET calls such as `TimeZoneInfo...` in a workflow expression.
**Why:** The engine exposes its own function set (the editor lists it and validates what you type); .NET types are not known to be available.
**Caveats:** Don't convert when both values are already local to the same place: e.g. a timecard feed that returns local times compared with setup records (service windows, cut-offs) entered in local time. Convert only when one side is UTC. Check what the source labels its times with (some test tenants label everything UTC).
**Status:** Hypothesis · checked 2026-11 · Studio 8.2.0.25 · Evidence: the function list and a validated `ConvertFromUTCDateTime` / `ConvertDateTime` expression seen in the Expression Editor; not yet run in a workflow.

<!-- Review notes, not copied into the skill -->
- How to reproduce: in a test workflow, assign a variable `ConvertFromUTCDateTime( <a UTC value>, "<IANA name>" )` and `ConvertDateTimeToUTC( <local value>, "<IANA name>" )` across a daylight-saving change; read the values in a debug log. Wrong if the results ignore daylight saving or the string overload rejects IANA names.
- Conflicts checked: WP-026 (workflow expressions are not report expressions): consistent, same idea of using the editor's own function list.
- Captured by: JM, from a session on 2026-11-01
