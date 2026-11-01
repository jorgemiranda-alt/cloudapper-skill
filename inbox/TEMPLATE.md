# Pattern draft template

Copy the block below into `inbox/<yyyy-mm-dd>-<short-name>.md`, one pattern per file. Delete the hints in parentheses. Keep it generic: no customer, app, form, workflow or person names, no IDs, URLs with real hosts, emails or credentials. Use placeholders such as `<SourceForm>`, `<StatusField>`, `<sync workflow>`, `<parent record>`.

```markdown
### WP-??? <The situation or symptom, in a few words>
**Rule:** <What to do, as an instruction, with the condition it applies under.>
**Why:** <What the engine does that makes the rule necessary. Leave out if it's a design choice, not engine behaviour.>
**Example:** <Optional. A generic node chain or expression, only if the rule is unclear without it.>
**Caveats:** <Optional. When the rule does not apply, related entries (WP-0xx).>
**Status:** Hypothesis · checked <yyyy-mm> · Studio <version> · Evidence: <what was done and what was seen>

<!-- Review notes, not copied into the skill -->
- How to reproduce: <the smallest test: workflow, trigger, input, expected result, what would prove the rule wrong>
- Conflicts checked: <entries searched for contradictions, e.g. "WP-001, WP-005: consistent">
- Captured by: <initials>, from a session on <yyyy-mm-dd>
```

Status values:

- `Hypothesis`: the draft's starting status. Seen once, cause not confirmed, or reasoned out without a test.
- `Observed`: the contributor saw it on a live app and wrote down how to reproduce it. A reviewer can promote low-risk entries to `Observed`.
- `Verified`: a second person reproduced it in a test app by following "How to reproduce". Required for entries about writing or deleting data, integrations and error handling.

The maintainer assigns the `WP-` number when promoting the entry.
