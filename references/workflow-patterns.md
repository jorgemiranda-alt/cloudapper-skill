# Workflow patterns and gotchas

Each entry's heading names the situation. **Rule** says what to do, **Why** says what the engine does, and **Status** says how sure we are:

- `Verified`: reproduced by a second person in a test app; the evidence names the test.
- `Observed`: seen on a live app by one person. Fine to follow; for a risky change, say you're relying on an Observed entry and test in UAT first.
- `baseline` instead of a date: imported when the skill moved to its repo (2026-11) and not re-checked since.

IDs (`WP-001`) are stable and shared across reference files; `wp-index.md` gives each one's file and title, so grep it instead of reading files; cite them in reviews and docs. Anything in `retired.md` is not guidance; don't read them as rules.

## Contents (one file per group)
1. Triggers and order: WP-001 to WP-004; 2. Loops and batching: WP-005 to WP-008: `wp-triggers-loops.md`
3. Routers: WP-009; 4. Performance: WP-010; 5. Errors, logging and validation: WP-011 to WP-015, WP-049: `wp-routers-errors.md`
6. Integrations and sync: WP-016 to WP-019, WP-029, WP-042, WP-047, WP-048, WP-050, WP-056, WP-057: `wp-integrations.md`
7. Data, setup and expressions: WP-020 to WP-026, WP-041, WP-051, WP-052, WP-054: `wp-data-expressions.md`
8. Procedures: debugging, readable workflows, node JSON, safe-change checklist, review scan: `wp-procedures.md`
