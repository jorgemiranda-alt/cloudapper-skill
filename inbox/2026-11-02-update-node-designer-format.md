### WP-??? Write update/create filters and reference assignments the way the designer saves them
**Rule:** In an `UPDATE_RECORD` or `CREATE_RECORD` node:
- A filter on the record id uses `Field: "id"`, `Label: "<form title>"`, `Operator: "="`, and `FieldNodeId` = the node's own id (no `.id`).
- A reference-field assignment uses `FieldNodeId: "<nodeId>.<ReferencedFormId>.<field>"`, `ControlType: 12`, `Operator: "="`, and a value argument that is the other record's reference field or whole record (`Field: "id"`, node id).
- Assign a reference field from a reference, not from text: a name string leaves the reference empty.
**Why:** Written another way (label "Id", blank operator, `<nodeId>.id`), the node saves and runs, but the editor shows the field unlabeled and the operator or value blank.
**Caveats:** The `=` operator is stored as `=`; some older nodes store a single space for equals and display the same. Use `=` for new nodes.
**Status:** Hypothesis · checked 2026-11 · Studio 8.2.0.25 · Evidence: format read from an update node the designer saved; two update nodes and a create node built differently showed blank labels in the editor; the corrected nodes are saved, with the editor result not yet recorded.

<!-- Review notes, not copied into the skill -->
- How to reproduce: build an update node both ways through the API and open each. Expected: the designer-format node shows a labeled filter and "Is Equal To"; the other shows an unlabeled `id` and a blank operator. Wrong if both display the same.
- Conflicts checked: WP-024 (update the trigger record by its id): consistent, this adds the node format.
- Captured by: JM, from a session on 2026-11-02
