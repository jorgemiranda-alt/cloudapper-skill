### WP-??? A route condition on a field that comes back empty fails with "Expression expected"
**Rule:** Don't compare a connector or iterator field with `=` / `!=` in a route when the field may be empty. Use `isEmpty` / `isNotEmpty` first, or store the value on a record and filter later.
**Why:** The condition is evaluated as an expression with the value pasted in; an empty value leaves `<x> ==` or `&& ==`, and the route fails with a parser error ("Expression expected (at index N)"), which stops the run at that route.
**Caveats:** A route with a single, always-present field (such as a response code) is fine. The cause of the empty values (unregistered response fields, a path that yields nothing) is a separate problem: see the entries on connector fields and nested arrays.
**Status:** Hypothesis · checked 2026-11 · Studio 8.2.0.25 · Evidence: one run failed at a route holding two boolean comparisons on iterator fields; removing them let the run finish.

<!-- Review notes, not copied into the skill -->
- How to reproduce: add a route with `<IteratorField> = false` where the field has no value; run on one record. Expected: parser error in the route's log entry. Wrong if the engine treats empty as false.
- Conflicts checked: WP-009 (routers), WP-026 (expressions): consistent.
- Captured by: JM, from a session on 2026-11-01
