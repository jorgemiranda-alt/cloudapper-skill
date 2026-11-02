### WP-??? A list inserted into a REST connector's JSON body needs escaped quotes
**Rule:** When a workflow variable is placed inside the `raw` body of a REST connector (Postman-style spec), build string items with escaped quotes (`\"A\",\"B\"`), not plain ones. In an expression, one escaped quote is written `"\\\""`.
**Why:** The placeholder is replaced as text inside a JSON string. Plain quotes end that string early and the connector fails with "After parsing a value an unexpected character was encountered ... Path 'request.body.raw'".
**Example:** `<list> + (<count> == 0 ? "" : ",") + "\\\"" + <item> + "\\\""`
**Caveats:** Applies to values inserted inside `raw`. Query-string and header placeholders are inserted as plain values (not tested with quotes).
**Status:** Hypothesis · checked 2026-11 · Studio 8.2.0.25 · Evidence: batched read failed with the error above using plain quotes; the escaped form was saved but its run result is not yet recorded.

<!-- Review notes, not copied into the skill -->
- How to reproduce: batch two string items into a variable, POST them in a body array through a REST node, once with plain quotes and once escaped. Wrong if the plain-quote version succeeds, or the escaped version fails with a parse error.
- Conflicts checked: WP-016 (batched sync with one token): consistent, this is the batch payload step.
- Captured by: JM, from a session on 2026-11-01
