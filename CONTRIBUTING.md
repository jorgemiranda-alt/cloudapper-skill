# Contributing to the cloudapper skill

The skill holds reusable CloudApper knowledge that Claude loads on every CloudApper task. A wrong rule here misleads every session for everyone, so changes go through review.

## Roles

- **Contributors** (everyone): capture patterns and open pull requests.
- **Maintainers** (two people, see `.github/CODEOWNERS`): review, promote entries into `references/` and merge. Either maintainer can merge, so nobody is a bottleneck.

## Adding a workflow pattern

1. **Capture.** In a Claude session, say "add this to the cloudapper skill". Claude drafts the pattern into `inbox/<yyyy-mm-dd>-<short-name>.md` from `inbox/TEMPLATE.md` with status `Hypothesis`. You can also write the draft by hand.
2. **Fill the review notes.** The draft must say how to reproduce the pattern, including what result would prove it wrong. "We saw it once" is fine for a `Hypothesis`, but not enough to promote it.
3. **Open a pull request** from a branch (`pattern/<short-name>`) with the draft. The checks run on the PR.
4. **Review.** The reviewer checks:
   - It's generic: no customer, app, form, workflow or person names, IDs, real hosts or credentials.
   - It's reusable platform knowledge, not one app's business rule.
   - It doesn't contradict an existing entry (search for the trigger, node or field it talks about).
   - The evidence supports the status asked for:
     - `Observed` is enough for low-risk entries (naming, logging, performance, UI behaviour).
     - `Verified` is required for entries about writing or deleting data, integrations and error handling. A second person follows "How to reproduce" in a test app and records the result in the PR.
5. **Promote.** The maintainer moves the entry into the right section of `references/workflow-patterns.md`, gives it the next free `WP-` number, updates the section range in Contents, deletes the inbox file, and adds a line to `CHANGELOG.md`. If the entry is one of the platform facts listed in `SKILL.md`, update that list too.

A draft that needs a test nobody can run yet can be merged into `inbox/` so it isn't lost. Inbox drafts are reviewed at every re-check (below): promote, keep for one more round, or delete.

## Changing or retiring an entry

- **Change:** edit the entry and update the date and evidence on its `Status` line. Never reuse or renumber IDs.
- **Retire** (wrong, or the platform changed): move the entry to `retired.md` with a `**Retired:**` line giving the reason, the replacement ID if there is one, and the PR. Remove every mention of its ID from `SKILL.md` and `references/`. Add a `CHANGELOG.md` line.

Don't keep wrong patterns in `references/` with a "deprecated" note: Claude may still follow them.

## Re-checking entries

There's no calendar review. Entries are re-checked when:

- **CloudApper releases a new Studio version.** Re-run the reproduction steps of the `Verified` entries and of the entries the release notes touch.
- **An entry's check date is over 12 months old.** `python scripts/check_skill.py` warns about these. Entries marked `baseline` (imported in 2026-11 without a date) come first.

## Writing rules

- **Rule** is an instruction with its condition ("Place X before Y when ..."), not a story.
- Aim for at most six lines per entry. Put long evidence in the PR, and keep the `Status` line to one sentence.
- Use one term per concept, matching the rest of the skill (Sequence, Router, FOREACH, setup record).
- No time-relative wording ("currently", "recently", "new"). Put dates and Studio versions on the `Status` line.
- Cite other entries by ID (`WP-001`), not by heading.

## Size limits

Only the skill's name and description are always in context. `SKILL.md` loads when the skill triggers, and a reference file loads only when Claude reads it.

- `SKILL.md` body: under 500 lines. Keep critical rules near the top.
- Description: under 1,024 characters. Don't grow it without running the trigger evals.
- Any reference file over 100 lines starts with a Contents list.
- Split a reference file by topic when it passes 300 lines. Link each new file directly from the table in `SKILL.md`; references must not link to further references for routing.

## Keeping customer data out

- `scripts/check_skill.py` blocks GUIDs, email addresses, tokens, key-like values, real runtime URLs (`/<number>/app/<id>`) and `*.cloudapper.com` hosts not on its allowlist.
- It also blocks the terms in your **local denylist**, `.leak-denylist` in the repo root: one customer, app or person name per line. The file is git-ignored, because the list is itself customer data. In CI, the same list comes from the `LEAK_DENYLIST` repository secret.
- If a line must contain a match (for example a public documentation host), add `leak-check: allow` to it and explain why in the PR.
- If something sensitive was pushed, **don't** just delete it in a new commit, because it stays in git history. Tell a maintainer: rotate any credential first, then rewrite the history.

## Checks and evals

- One-time setup after cloning: `git config core.hooksPath .githooks`. The pre-commit hook runs `scripts/check_skill.py`.
- Before merging a change to `SKILL.md`, the description, or more than a few entries, run the evals in `evals/` against the old and new skill (see `evals/README.md`). Paste the pass rates in the PR.

## Other reference files

The other files in `references/` follow the same flow: pull request, review and changelog line. They don't use the entry format.
