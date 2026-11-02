### WP-??? Expressions written through the API need `ExpressionText`, or the editor can't map their fields
**Rule:** When you build or patch a node through the workflow API, give every `{Expression, Arguments}` object an `ExpressionText`: the expression with each `__argN__` replaced by `[<FormTitle> (<NodeName>) . <FieldLabel>]`, e.g. `[Workflow Variables (Trigger) . dateIndex] + 1`, `[Job (09 Iterate Pool Jobs) . Department]`. Add `NodeDisplayText: ""` as existing nodes have.
**Why:** The run uses `Expression` and `Arguments`, so the node works. The Expression Editor builds its field chips from `ExpressionText`; without it the editor shows raw `__argN__` names and reports "Unknown identifier".
**Caveats:** For a trigger (`<Form> (Trigger)`) and workflow variables (`Workflow Variables (Trigger)`) the node name is fixed text; for lookups and iterators it is the node's name. The format for nested reference arguments is a guess. Related: the entry on argument control types (an editor error that remains after `ExpressionText` is fixed).
**Status:** Hypothesis · checked 2026-11 · Studio 8.2.0.25 · Evidence: editor reported unknown identifiers on API-built expressions; after adding `ExpressionText` the same expression showed field chips; a full run of the corrected nodes is not yet recorded.

<!-- Review notes, not copied into the skill -->
- How to reproduce: build one assignment node through the API without `ExpressionText`, open its expression in the editor (error, raw names), add `ExpressionText` in the format above, reload and reopen (chips shown). Wrong if the editor already maps the fields without it.
- Conflicts checked: WP-021, WP-023, WP-026: consistent.
- Captured by: JM, from a session on 2026-11-02
