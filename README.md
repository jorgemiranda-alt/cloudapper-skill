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

## MCP server (optional, saves tokens)

`mcp/server.mjs` exposes one tool, `cloudapper_run({script, spec, url?})`, which runs a skill script in its own Chrome window (installed Chrome, persistent profile: sign in once) and returns only the script's summary. Install and register once:

```bash
npm --prefix ~/repos/cloudapper-skill/mcp install
claude mcp add cloudapper --scope user -- node ~/repos/cloudapper-skill/mcp/server.mjs
```

**Updating without reconnecting:** `scripts/*.js`, `scripts/field-templates/` and `mcp/runner.mjs` are read again on the next call (the runner when its file changes; a broken runner edit returns an error and the last good one stays in use). Only a change to `mcp/server.mjs` (window, sign-in, tool definition) needs a new session or MCP reconnect.

The server does not restrict writes: they go to whatever app is open in its window, so confirm the environment first (SKILL.md, UAT by default). Backups go to `~/cloudapper-backups` (`CLOUDAPPER_BACKUP_DIR`). Check it with `node mcp/test-client.mjs '{"script":"ca-eval","url":"<app url>","spec":{"expr":"ca.forms().then(f=>f.length)"}}'`.

## Layout

| Path | What it is | Loaded by Claude? |
|---|---|---|
| `SKILL.md` | Rules for every task + routing table | When the skill triggers |
| `references/` | Topic guides; `wp-index.md` lists every numbered pattern (WP-001 …) with its file | When a task needs that topic |
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
| `scripts/create-form.js` | Create, edit or remove a form through the design API from `scripts/field-templates/` (WP-081); writes, guarded by `ca.setClient` | When a task runs it |
| `scripts/field-templates/` | One stored field template per type plus the form shell (`_form.json`), served by `save_server.py` as `ft-<type>.json` | By `create-form.js` |
| `scripts/ca-eval.js` | Runs one `ca.*` expression and returns its value (for `cloudapper_run`) | When a task runs it |
| `mcp/` | `cloudapper` MCP server: one tool, `cloudapper_run`, that runs these scripts in its own signed-in Chrome and returns only their result. `server.mjs` = window, sign-in, tool definition (fixed); `runner.mjs` = per-script handling (hot-reloaded) | When registered |
| `scripts/menu.js` | List, update (title, parent, order, hidden, icon, landing), create groups and delete menu items, with backup and read-back | When a task runs it |
| `scripts/workflow.js` | List, outline, back up, create (from node templates, saved off), edit one assignment or rule, validate, toggle and check runs of backend workflows; self-check `scripts/workflow.selftest.mjs` | When a task runs it |
| `scripts/integration.js` | Call UKG, Odoo or another REST API with the app's config record; credentials stay on the Node side and are scrubbed from the result; self-check `scripts/integration.selftest.mjs` | When a task runs it |
| `scripts/view.js` | List, create, update and delete saved list views (fields and filters by label) (WP-073) | When a task runs it |
| `scripts/relation.js` | List, link and unlink parent/child forms (WP-082) | When a task runs it |
| `scripts/state.js` | Read-only: counts of forms, child forms, relations, menus, views; finds test leftovers by prefix | When a task runs it |
| `scripts/record-count.js` | Read-only: record count per form | When a task runs it |
| `scripts/verify-workflow-run.js` | Read-only verifier of a real run or chain: execution logs + business checks on the written records (WP-039) | When a task runs it |

## Contributing

In a session, say "add this to the cloudapper skill". Claude applies it directly to the local skill (references, scripts, CHANGELOG) and commits on `main`, with no inbox, pull request or review step. See [CONTRIBUTING.md](CONTRIBUTING.md) for the entry format, statuses and retiring entries.
