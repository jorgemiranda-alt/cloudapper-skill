### WP-??? Copy a designer-saved node whole and change only the values; don't rewrite ids or paths
**Rule:** Prefer a node the designer created. Have the designer add an empty node of the right type (set the type of record, one filter, one assignment), read it back through the API, and edit only its values. If that isn't practical, clone the closest node the designer saved (for example an update node next to an existing create node) and change only the values you mean to change (name, filter value, expressions). Either way, don't retype or "tidy" ids and paths. In particular:
- Use the full form GUID everywhere (`typeId`, `TypeId`, paths). Short forms of an id that tools print for readability are not valid.
- A plain (non-reference) field assignment keeps `FieldNodeId: "<nodeId>.<field>"` with no form id. Only a reference field uses `"<nodeId>.<ReferencedFormId>.<field>"`.
- When the new node gets a new id, rewrite only the node-id prefix of each `FieldNodeId` (same shape), and re-point the id filter's `FieldNodeId` to the new node.
After saving, reload the builder page and open the node: a blank "Type of Record", "No Filter Source Available", or assignment targets shown as raw names (`numericField1`) mean an id or path was changed.
**Why:** The editor resolves labels and sources from these ids and paths. A wrong shape still runs or saves, but the node opens blank or with raw field names, and a later "Done" in the editor can save that broken state.
**Caveats:** Related: WP-030 to WP-037. If the editor has the workflow open, it may save in between and your next API save gets a 409 "updated version already exists": reload the workflow, reapply the change on the latest version, and ask the user to close the panel with Close, not Done.
Before saving, ask whether the tab's cached copy is current; a stale copy gives a 409. Scan every workflow for the shapes you rebuilt (short ids, plain fields with three-part paths) after fixing one node, and report that the scan does not prove the editor opens them.
**Status:** Hypothesis · checked 2026-11 · Studio 8.2.0.25 · Evidence: an update node built from a create node's assignments opened with a blank record type (shortened form id), then with raw field names (form id inserted into plain-field paths); both fixed by using the full id and `<nodeId>.<field>`, then reopened in the editor.

<!-- Review notes, not copied into the skill -->
- How to reproduce: clone a designer-saved create node into an update node via the API; set a short form id or add a form id to a plain-field `FieldNodeId`; open it in the builder. Expected wrong: blank type / raw field names. With the full id and `<nodeId>.<field>` the labels resolve.
- Conflicts checked: WP-030 to WP-037 (api-built node formats): consistent, this adds the plain-field path shape and the "clone whole" rule; check WP-032 (reference-field paths) is not read as applying to plain fields.
- Captured by: JM, from a session on 2026-11-02
