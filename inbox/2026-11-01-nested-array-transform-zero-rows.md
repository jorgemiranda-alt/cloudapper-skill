### WP-??? Transform or Create over nested arrays can produce zero rows without an error
**Rule:** After a first test of a Transform (or an Iterator + Create) that reads a nested array (`$.[*].a[*].b[*].field`), check the saved record count, not only the run status. If nothing was written, try a flat path (`$..b[*].field`) for every field of the mapping.
**Why:** The run finished with status OK, the Transform and Save steps took about 0 ms, and no records appeared. The same mapping over a single array level works.
**Caveats:** Unconfirmed: whether the flat path fixes it. Also unconfirmed: whether the cause was the nested path or an empty response; read the response first when the connector allows it (see the entry on connector fields).
**Status:** Hypothesis · checked 2026-11 · Studio 8.2.0.25 · Evidence: one UAT run with a nested path wrote nothing; the flat-path rerun is not yet recorded.

<!-- Review notes, not copied into the skill -->
- How to reproduce: call an endpoint whose response has two array levels, Transform fields from the inner level with the nested path, Save Records, count records; repeat with the flat path. Wrong if the nested path writes the expected rows.
- Conflicts checked: WP-016, WP-017: consistent.
- Captured by: JM, from a session on 2026-11-01
