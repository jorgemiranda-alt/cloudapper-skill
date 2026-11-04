# Updating the cloudapper skill

The skill holds reusable CloudApper knowledge that Claude loads on every CloudApper task. Feedback is applied **directly and at once**: Claude edits the local skill in the session where the knowledge came up. There is no inbox, pull request, review or approval step, and nothing is pushed unless the user asks.

## Adding or changing knowledge

1. In a Claude session, say "add this to the cloudapper skill" (or agree when Claude proposes it).
2. Claude searches `references/` for entries the new knowledge confirms or contradicts, then:
   - **Changes** an existing entry when it covers the same situation. It updates the date and evidence on the `Status` line and never reuses or renumbers IDs.
   - **Adds** a new entry in the right `references/wp-*.md` group file, or in the matching `api-*.md` or other reference file for an API or designer technique. It uses the next free `WP-` number (see `references/wp-index.md`), adds a line to `wp-index.md`, and updates the ID range in the Contents of `workflow-patterns.md` or `api-reference.md`.
   - **Retires** a wrong entry: it moves the entry to `retired.md` with a `**Retired:**` line (reason, replacement ID) and removes every mention of its ID from `SKILL.md` and `references/`. Don't keep wrong patterns in `references/` with a "deprecated" note, because Claude may still follow them.
3. If the entry is one of the platform facts listed in `SKILL.md`, Claude updates that list too. Scripts go in `scripts/`, with a line in `README.md`.
4. Claude adds a `CHANGELOG.md` line, runs `python scripts/check_skill.py`, fixes what it reports and commits on the local `main` branch.

The files in `inbox/` are older drafts from the former review flow. Apply one the same way when it becomes relevant, and delete it once applied.

## Entry format

```markdown
### WP-0xx <The situation or symptom, in a few words>
**Rule:** <What to do, as an instruction, with the condition it applies under.>
**Why:** <What the engine does that makes the rule necessary.>
**Caveats:** <Optional. When the rule does not apply, related entries (WP-0xx).>
**Status:** <Hypothesis | Observed | Verified> · checked <yyyy-mm> · Studio <version> · Evidence: <what was done and what was seen>
```

`Status` says how sure the entry is. It is information for the reader, not a gate:

- `Hypothesis`: seen once, cause not confirmed, or reasoned out without a test.
- `Observed`: seen on a live app.
- `Verified`: reproduced a second time in a test app.

## Writing rules

- **Rule** is an instruction with its condition ("Place X before Y when ..."), not a story.
- Aim for at most six lines per entry, and keep the `Status` line to one sentence.
- Use one term per concept, matching the rest of the skill (Sequence, Router, FOREACH, setup record).
- No time-relative wording ("currently", "recently", "new"). Put dates and Studio versions on the `Status` line.
- Cite other entries by ID (`WP-001`), not by heading.

## Size limits

Only the skill's name and description are always in context. `SKILL.md` loads when the skill triggers, and a reference file loads only when Claude reads it.

- `SKILL.md` body: under 500 lines. Keep critical rules near the top.
- Description: under 1,024 characters.
- Any reference file over 100 lines starts with a Contents list.
- Split a reference file by topic when it passes 300 lines, and link each new file directly from the table in `SKILL.md`.

## Keeping customer data out

- `scripts/check_skill.py` (also the pre-commit hook: `git config core.hooksPath .githooks`) reports GUIDs, email addresses, tokens, key-like values, real runtime URLs (`/<number>/app/<id>`) and `*.cloudapper.com` hosts not on its allowlist.
- It also reports the terms in an optional local denylist, `.leak-denylist` in the repo root: one customer, app or person name per line (git-ignored).
- If a line must contain a match (for example a public documentation host), add `leak-check: allow` to it.

## Re-checking entries

`python scripts/check_skill.py` warns about entries whose check date is over 12 months old; entries marked `baseline` come first. After a new Studio version, re-check the entries its release notes touch.
