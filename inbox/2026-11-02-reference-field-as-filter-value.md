### WP-??? Pass a trigger's reference field into a filter as the field itself, not as a nested path ending in `.id`
**Rule:** To filter on the record a trigger's reference field points at (e.g. `ParentId = <the trigger's Pool>`), use the reference field itself as the argument: `{Field: "<referenceField>", FieldNodeId: "__TRIGGERRECORD.<ReferencedFormId>.<referenceField>", NodeId: "__TRIGGERRECORD", TypeId: "<TriggerFormId>", ControlType: 12, DataType: 0, Label: "<label>"}`. Don't write it as a nested path ending in `.id` (`...<referenceField>.id`).
**Why:** The designer can't resolve the `.id` path, so the filter's value box is empty and the lookup would filter on nothing.
**Caveats:** Reading a value inside the referenced record (`__TRIGGERRECORD.<RefFormId>.<referenceField>.<field>`, with `NodeId` = the reference field and `TypeId` = the referenced form) is a different case and does work; see the entry on reading referenced fields from the trigger.
**Status:** Hypothesis · checked 2026-11 · Studio 8.2.0.25 · Evidence: the `.id` form showed an empty filter value in the designer; the field-itself shape is copied from an existing workflow's filter; a run with the corrected shape is not yet recorded.

<!-- Review notes, not copied into the skill -->
- How to reproduce: on a form with a reference field, add a lookup of a child form whose parent filter takes the trigger's reference. Build the argument once as `...<referenceField>.id` and once as the field itself; open the node in the designer. Expected: the first shows an empty value, the second shows the field. Then run it and check the lookup returns the child records. Wrong if the `.id` form resolves, or the field-itself form returns nothing at run time.
- Conflicts checked: the inbox entry on reading referenced fields from the trigger (its `.id` caveat is resolved by this entry), WP-021, WP-023: consistent.
- Captured by: JM, from a session on 2026-11-02
