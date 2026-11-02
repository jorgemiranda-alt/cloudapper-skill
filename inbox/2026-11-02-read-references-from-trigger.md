### WP-??? Read a referenced record's fields straight from the trigger; don't fetch it again
**Rule:** When the trigger form has a reference field (ControlType 12) to another form, read that record's fields in expressions and filters with the nested path `__TRIGGERRECORD.<ReferencedFormId>.<referenceField>.<field>`. Don't add a `LOOKUP_RECORD` for a record the trigger already references.
**Why:** The trigger record exposes the referenced record's fields, so a lookup repeats work and adds nodes, run time and a filter that can be wrong.
**Example:** argument `{Field: "<field>", FieldNodeId: "__TRIGGERRECORD.<RefFormId>.<referenceField>.<field>", NodeId: "<referenceField>", TypeId: "<RefFormId>", Label: "<field label>"}`.
**Caveats:** Applies to references on the trigger record itself. A record reached through another lookup, and the child records of a referenced record (filter on their parent), still need a lookup. To use the referenced record itself as a filter value (e.g. a `ParentId` filter), don't end the path in `.id`: that form does not resolve in the editor; pass the reference field itself, see WP-033.
**Status:** Hypothesis · checked 2026-11 · Studio 8.2.0.25 · Evidence: existing workflows read referenced fields this way; four redundant lookups in a new workflow were flagged in review and replaced; the `.id` form tried for a parent filter showed an empty value in the editor; run result not yet recorded.

<!-- Review notes, not copied into the skill -->
- How to reproduce: on a form with a reference field, trigger a workflow that assigns a field of the referenced record (via the nested path) to a variable and logs it, with no lookup node. Expected: the referenced record's value. Wrong if the value is empty, or only works after a lookup of the same record.
- Conflicts checked: WP-021 (check references before removing nodes), WP-023 (stale field references): consistent.
- Captured by: JM, from a session on 2026-11-02
