### WP-??? Before adding an update path after a lookup, make sure the lookup can only match the right record
**Rule:** A "create if missing" route after a lookup is safe even if the lookup is loose: a false match only skips a create. An "update if found" route is not: a false match overwrites an unrelated record. Before adding an update route to that lookup:
- Read the lookup's full filter list (print every rule, not the first few) and check it includes everything that makes the record unique: the owner or parent (location, parent record id), the date, and each key field.
- Check that no filter value can be empty. An empty filter value makes the lookup return the first record silently.
- Make the two routes exclusive: `isEmpty` on the lookup's id for create, `isNotEmpty` for update.
- Check what the update triggers downstream. A workflow that starts on `Status _IsUpdated` does not fire when an update changes only amounts, so the dependent records (rates, child rows) stay stale unless the update also changes the status.
To add a missing reference filter, build it from two nodes the designer saved: an existing reference filter on the same lookup (shape: `FieldNodeId` `<lookupNodeId>.<ReferencedFormId>.<field>`, `ControlType` 12) and the node that already assigns that reference (its value argument).
**Why:** Master-data keys (service period, pool, type) repeat for every owner and day, so a filter that omits the owner matches another owner's record.
**Caveats:** Related: WP-009 (a router runs every true route), WP-002 (status trigger needs a change).
**Status:** Hypothesis · checked 2026-11 · Studio 8.2.0.25 · Evidence: a lookup filtered on period, pool and date but not location was found before the update route was run; the location filter was added from two designer-saved nodes and opened in the editor without errors; the update path itself has not been run yet.

<!-- Review notes, not copied into the skill -->
- How to reproduce: two owners with the same key values on the same day; run the workflow for both with an update route on a lookup that lacks the owner filter. Expected wrong: the second run updates the first owner's record. With the owner filter each run finds only its own record.
- Conflicts checked: WP-009, WP-002: consistent. Overlaps the "empty filter returns first record" note; link rather than duplicate when promoting.
- Captured by: JM, from a session on 2026-11-02
