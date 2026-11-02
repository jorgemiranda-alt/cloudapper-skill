### WP-??? Declare arguments from lookup-display and time-choice fields as text in expressions
**Rule:** When an expression argument comes from a field of control type 38 (lookup-display) or 33/34 (time choice), write the argument with `ControlType: 4, DataType: 1` (text) instead of copying the field's own control type. Check every argument's control type when building nodes through the API: standard text/number/date types (4, 11, 3, 1) work; others may not.
**Why:** The Expression Editor reported "Value cannot be null. (Parameter 'type')" for arguments with those control types; it has no value type for them.
**Example:** `{Field: "<field>", FieldNodeId: "<nodeId>.<field>", NodeId: "<nodeId>", TypeId: "<FormId>", ControlType: 4, DataType: 1, Label: "<label>"}`.
**Caveats:** Applies to using the field's value as text in an expression. A reference field (ControlType 12) passed as a filter value is a different case and is kept as is.
**Status:** Hypothesis · checked 2026-11 · Studio 8.2.0.25 · Evidence: the editor error appeared on arguments of control type 38 and 33; the same expression with them declared as text was saved, and the editor result after the change is not yet recorded.

<!-- Review notes, not copied into the skill -->
- How to reproduce: build an assignment `"/" + <field38> + "/" + <field38>` through the API with the field's own control type and open the editor (type error); change the arguments to 4/1, reload, reopen. Wrong if the error persists, or if the run fails on text arguments for those fields.
- Conflicts checked: the entry on `ExpressionText` for API-built nodes (this is the next error after that one): consistent.
- Captured by: JM, from a session on 2026-11-02
