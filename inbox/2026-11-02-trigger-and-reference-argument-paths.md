### WP-??? Write trigger and reference arguments in the designer's own path formats
**Rule:** Use these `FieldNodeId` shapes for arguments:
- Plain trigger field: `__TRIGGERRECORD.<field>` (no form id), `NodeId: "__TRIGGERRECORD"`.
- The trigger record itself (its id): `FieldNodeId` and `NodeId` both `__TRIGGERRECORD`, `Field: "id"`.
- A field inside a record the trigger references: `__TRIGGERRECORD.<ReferencedFormId>.<referenceField>.<field>`, `NodeId` = the reference field, `TypeId` = the referenced form.
- The reference field itself as a value (filter or assignment): `<nodeId>.<ReferencedFormId>.<referenceField>`, ControlType 12.
- A whole fetched or iterated record: `FieldNodeId` and `NodeId` = that node's id, `Field: "id"`.
**Why:** A path in the wrong shape still saves and runs, but the editor can't resolve the argument and shows a raw `__argN__` name or an empty value.
**Caveats:** Copy from a node the designer saved when unsure (see the procedure on building node JSON). Related entries: reading referenced fields from the trigger; passing a reference field into a filter.
**Status:** Hypothesis · checked 2026-11 · Studio 8.2.0.25 · Evidence: shapes read from nodes the designer saved in the same app; an expression using the form-id version for a plain trigger field showed an unresolved name; the editor result after the correction is not yet recorded.

<!-- Review notes, not copied into the skill -->
- How to reproduce: build one expression per shape above through the API, open each in the editor, and compare with a node saved by the designer. Wrong if any shape the entry rejects resolves, or one it recommends does not.
- Conflicts checked: the inbox entries on referenced fields and reference-field filters: consistent (this one lists all shapes together).
- Captured by: JM, from a session on 2026-11-02
