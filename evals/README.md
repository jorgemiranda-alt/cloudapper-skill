# Evals

Two test sets show whether a change to the skill helps or hurts:

- `evals.json` holds 10 task prompts with checkable expectations, in the format the `skill-creator` skill uses. Each one comes from a pattern in `references/workflow-patterns.md` or a rule in `SKILL.md`. Eval 10 tests the contribution flow itself.
- `trigger-queries.json` holds 20 queries, half that should load the skill and half that shouldn't. Use it whenever you change the description.

## When to run them

- Before merging a change to `SKILL.md` or to the description, or a change to several entries.
- Not needed for a single new entry. Do add an eval for it if the entry fixes a mistake Claude kept making.

## How to run

1. Check out the version to compare against into a separate folder, for example `git worktree add ../cloudapper-skill-main main`.
2. In a Claude Code session with the `skill-creator` skill, ask it to run `evals/evals.json` for this skill against the old version in `../cloudapper-skill-main` (old skill vs new skill), with 3 runs per prompt.
3. Paste the pass rate per eval for old and new into the pull request. Look at failing expectations, not just the total.
4. For description changes, ask `skill-creator` to check triggering with `trigger-queries.json`.

Run evals 9 and 10 in a scratch copy of the skill, not your linked clone: eval 10 writes a draft into `inbox/`.

Results go to `evals/results/` or a `*-workspace/` folder. Both are git-ignored, because outputs can contain session details. Don't commit them.

## Adding an eval

- Base it on a real mistake or a pattern entry, but write it generically: no customer, app or person names (the leak checks also scan this folder).
- Make each expectation checkable from the answer text alone ("recommends X", "doesn't do Y").
- Keep the set small (10–20 task prompts). Replace evals that always pass with ones that test something new.

## Later: `claude plugin eval`

If the skill is ever packaged as a plugin, `claude plugin eval` can run suites in CI. Its format is different (`evals/<case>/prompt.md` + `graders/`), so these files would need converting. Suites that use Bash need WSL2 on Windows.
