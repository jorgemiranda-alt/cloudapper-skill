### WP-??? A lookup node copied from another form keeps its parent settings and shows a blank "Type of Record"
**Rule:** When you clone a `LOOKUP_RECORDS` node for a different form, reset its `parentTypeId` and `parentReferenceField`: set them to the real parent form and the subform field that holds the child records (e.g. `Pool Configuration` + its jobs subform), or to empty strings when the records have no parent.
**Why:** The template's parent settings stay in the node (for example "children of `<OtherParent>` through subform N"). The editor then can't match the node's form to that parent's children and "Type of Record" is blank, though the node still saves.
**Caveats:** Applies to lookups copied from a child-form lookup. Create, update and iterate nodes showed their type correctly in the same workflow.
**Status:** Hypothesis · checked 2026-11 · Studio 8.2.0.25 · Evidence: three cloned lookups showed a blank type; after resetting their parent settings the saved nodes carry the right values; the editor result is not yet recorded.

<!-- Review notes, not copied into the skill -->
- How to reproduce: clone a child-form lookup through the API for a form that is not that parent's child, change only `typeId`, and open the node (blank type); then set `parentTypeId` / `parentReferenceField` to the right values or empty and reopen. Wrong if the type is still blank.
- Conflicts checked: WP-021 (node names lie), WP-023: consistent.
- Captured by: JM, from a session on 2026-11-02
