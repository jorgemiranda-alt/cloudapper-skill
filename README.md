# cloudapper-skill

The team's Claude Code skill for the CloudApper no-code platform: platform behaviour, APIs, workflow patterns, conventions, architecture and working methods. Customer facts (accounts, IDs, app names) never go in here; they belong in each project's own notes.

## Install

Clone the repo **outside OneDrive** (sync and `.git` folders don't mix), then link it in as the `cloudapper` skill.

Windows (a directory junction needs no admin rights). If you already have a `cloudapper` folder in `%USERPROFILE%\.claude\skills`, rename it first:

```bat
git clone https://github.com/jorgemiranda-alt/cloudapper-skill.git "%USERPROFILE%\repos\cloudapper-skill"
mklink /J "%USERPROFILE%\.claude\skills\cloudapper" "%USERPROFILE%\repos\cloudapper-skill"
```

macOS / Linux:

```bash
git clone https://github.com/jorgemiranda-alt/cloudapper-skill.git ~/repos/cloudapper-skill
ln -s ~/repos/cloudapper-skill ~/.claude/skills/cloudapper
```

Then, once per clone, turn on the pre-commit checks:

```bash
git -C ~/repos/cloudapper-skill config core.hooksPath .githooks
```

Optionally, create `.leak-denylist` in the repo root with the customer, app and person names you work with, one per line. It's git-ignored.

**Updating:** `git pull` in the clone. Claude Code picks up changes to an installed skill without a restart. Stay on `main` for daily work: whatever branch your clone is on is the skill Claude loads.

## Layout

| Path | What it is | Loaded by Claude? |
|---|---|---|
| `SKILL.md` | Rules for every task + routing table | When the skill triggers |
| `references/` | Topic guides; `workflow-patterns.md` holds the numbered patterns (WP-001 …) | When a task needs that topic |
| `inbox/` | Pattern drafts awaiting review; `TEMPLATE.md` | Only `TEMPLATE.md`, when drafting |
| `retired.md` | Patterns removed as wrong or outdated | No |
| `CHANGELOG.md` | One line per merged change | No |
| `CONTRIBUTING.md` | How to add, review, verify and retire patterns | No |
| `evals/` | Test prompts to compare skill versions | No |
| `scripts/check_skill.py` | Leak and structure checks (pre-commit hook and CI) | No |
| `scripts/validate-workflows.js` | Read-only workflow node validator, run in a signed-in App Studio page (WP-038) | When a task runs it |

## Contributing

In a session, say "add this to the cloudapper skill". Claude writes a draft to `inbox/`; open a pull request with it. See [CONTRIBUTING.md](CONTRIBUTING.md) for review, statuses (Hypothesis → Observed → Verified) and retiring entries.
