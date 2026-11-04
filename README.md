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
| `references/` | Topic guides; `wp-index.md` lists every numbered pattern (WP-001 …) with its file | When a task needs that topic |
| `inbox/` | Older drafts from the former review flow; apply and delete when relevant | No |
| `retired.md` | Patterns removed as wrong or outdated | No |
| `CHANGELOG.md` | One line per change | No |
| `CONTRIBUTING.md` | How Claude adds, changes and retires entries (direct local edits) | When updating the skill |
| `evals/` | Test prompts to compare skill versions | No |
| `scripts/check_skill.py` | Leak and structure checks (pre-commit hook and CI) | No |
| `scripts/validate-workflows.js` | Read-only workflow node validator, run in a signed-in App Studio page (WP-038) | When a task runs it |
| `scripts/export-app.js` | Read-only export of an app to small files plus a graphify `graph.json`, with WP-001 order warnings (WP-045) | When a task runs it |
| `scripts/save_server.py` | Localhost server: saves PUT files for `export-app.js` and serves the skill's `scripts/*.js` to the Playwright loader | When a task runs it |
| `scripts/app_change_hook.py` | PostToolUse hook for the Playwright code tools: reminds Claude to refresh the export after a design write (WP-045). Register it in `~/.claude/settings.json` | On every matching tool call, once registered |
| `scripts/find-field.js` | Read-only: forms with field X and the workflow nodes that use it | When a task runs it |
| `scripts/record-count.js` | Read-only: record count per form | When a task runs it |
| `scripts/verify-workflow-run.js` | Read-only verifier of a real run or chain: execution logs + business checks on the written records (WP-039) | When a task runs it |

## Contributing

In a session, say "add this to the cloudapper skill". Claude applies it directly to the local skill (references, scripts, CHANGELOG) and commits on `main`, with no inbox, pull request or review step. See [CONTRIBUTING.md](CONTRIBUTING.md) for the entry format, statuses and retiring entries.
