# Workflow patterns: routers, performance, errors, logging and validation

Entries headed `WP-0xx` use the format and statuses explained at the top of `workflow-patterns.md`; `wp-index.md` lists every entry.

## 3. Routers

### WP-009 A Router runs every route whose condition is true
**Rule:** Make route conditions mutually exclusive and add an explicit "else" route when only one outcome is wanted.
**Why:** A Router is not first-match; every true route runs.
**Status:** Observed · baseline · Evidence: seen on a live app.

## 4. Performance

### WP-010 Reuse a recent sync instead of pulling the same data again
**Rule:** When several calculations need the same freshly pulled external data (same scope, e.g. location + date):
- The parent workflow creates **job records** (Type, Status, scope fields) that trigger the sync workflows; stamp the scope on them.
- At the start of each sync: LOOKUP_RECORD on the job form with Type = this type, Status = Completed, same scope, CreateDate > `AddMinutes(UtcNow( ), -N)`; then a ROUTER: **Needs fresh sync** (none found or scope empty) → sync steps → mark job Completed (sibling after the loop); **Recently synced (skip)** (found) → mark job Completed.
- A failed sync never marks Completed, so the next run syncs again.
**Caveats:** Window N: just long enough to cover consecutive runs of the same scope in one batch (minutes).
**Status:** Observed · baseline · Evidence: measured once, fresh external sync 25–75 s, reused ≈ 1 s.

## 5. Errors, logging and validation

### WP-011 Every external call needs a real failure route
**Rule:** Add a route that writes an error status + reason, keep a failed-payload record with a Resend button, and make retries idempotent. Steps that only run "on create" need a scheduled retry for records left "Not Synced".
**Why:** A `!= 200` route misses timeouts and empty responses.
**Status:** Observed · baseline

### WP-012 "Could not prepare values for the fields: X" in the log
**Rule:** Fix the expression assigned to X; it failed (often report syntax used in a workflow, e.g. `IsNull(x, 0)`, see WP-026).
**Why:** The failing field is skipped; the step's other fields still save.
**Status:** Observed · baseline

### WP-013 A DEBUG_LOG inside a FOREACH keeps one pass only
**Rule:** In each pass append a line to a text workflow variable (`var + <line> + "<br/>"`) or add 1 to a counter; reset those variables at the start of the run; print them in one summary log right after the loop.
**Status:** Observed · baseline

### WP-014 Workflow Description is limited to 1,000 characters
**Rule:** Keep the run-order summary in the Description under 1,000 characters.
**Why:** Longer saves fail with `value too long for type character varying(1000)`.
**Status:** Observed · baseline

### WP-015 Before-save validation with Halt Operation
**Rule:** Use a Before-create/edit workflow + Halt Operation with a message to block bad data.
**Caveats:** Side effects done before the halt stay: avoid them or document a manual reset.
**Status:** Observed · baseline

### WP-049 A route condition on a field that comes back empty fails with "Expression expected"
**Rule:** Don't compare a connector or iterator field with `=` / `!=` in a route when the field may be empty. Use `isEmpty` / `isNotEmpty` first, or store the value on a record and filter later.
**Why:** The condition is evaluated as an expression with the value pasted in; an empty value leaves `<x> ==` or `&& ==`, and the route fails with a parser error ("Expression expected (at index N)"), which stops the run at that route.
**Caveats:** A route with a single, always-present field (such as a response code) is fine. The cause of the empty values (unregistered response fields, a path that yields nothing) is a separate problem: see WP-046 and WP-048.
**Status:** Hypothesis · checked 2026-11 · Studio 8.2.0.25 · Evidence: one run failed at a route holding two boolean comparisons on iterator fields; removing them let the run finish.
