---
name: cloudapper
description: CloudApper no-code platform (web.cloudapper.com, m2sys.cloudapper.com, other tenants), including App Studio, Solution Builder and AI Agents & Automation - forms, menus, roles and privileges, UI and backend workflows, DevExpress reports, records, UKG connectors and integrations. Use whenever the user builds, changes, debugs, speeds up, reviews, copies (UAT/Production), designs or documents a CloudApper app or anything in it, or edits this skill, even if they only name the app.
---

# CloudApper

CloudApper is a no-code platform: apps are made of **forms** (data model), **menus** (navigation), **roles**, **UI workflows** (client-side), **backend workflows** (automation) and **DevExpress reports**, all edited in **App Studio** (`/design/...` for forms and menus, `/studio/...` for workflows) and used in the **runtime app** (`/<clientId>/app/<appId>/...`).

This file holds the rules that apply to every task. Read the reference that matches the task before acting:

| Task | Read |
|---|---|
| How the platform works: tenants, IDs, caching `references/platform-model.md`; forms, fields, menus, roles, reports `references/platform-data.md`; workflows `references/platform-workflows.md` | one file |
| Find a WP-0xx rule by ID or keyword: grep, then read only that entry | `references/wp-index.md` |
| APIs: auth `references/api-reference.md`, records `references/api-records.md`, workflow JSON `references/api-workflows.md`, forms/menus/roles/UI workflows `references/api-forms-menus.md`, reports `references/api-reports.md` | one file |
| Workflows: triggers/loops `references/wp-triggers-loops.md`, routers/errors `references/wp-routers-errors.md`, sync `references/wp-integrations.md`, data/expressions `references/wp-data-expressions.md`, debugging/safe change `references/wp-procedures.md`, entry format `references/workflow-patterns.md` | one file |
| Build or change workflow nodes through the API (JSON shape per actionType, trigger codes, id rewriting) | `references/node-templates.md` |
| Drive the browser with the Playwright MCP | `references/playwright-efficiency.md` |
| Copy features or a whole app from one app/account to another | `references/copy-between-apps.md` |
| Build a new app or form (through the API) | `references/building-apps.md` |
| Design, name or review anything (SOLID on CloudApper, naming, workflow/config/report conventions) | `references/conventions.md` |
| Design a solution or integration architecture (UKG, REST, webhooks, SFTP, middleware; scaling and efficiency) | `references/architecture.md` |
| Document an app (technical / troubleshooting guide, or a PM handover guide) | `references/documentation.md` |
| Review an app or write its findings / recommendations | `references/app-review-checklist.md` |
| Project requirements (SRS/BRD), keeping the requirements graph and the app graph current, folder structure | `references/project-knowledge.md` |
| Work with UKG (Pro, WFM, Recruiting, HRSD) connectors | `references/integrations-ukg.md` |
| The user asks how to work with you on CloudApper, or what belongs in this skill | `references/learning-and-prompting.md` |

## Environments: ask before you change anything

Most CloudApper customers have a **Production** app and a **UAT** (test) app, often under different accounts. Before any change (saving a form, editing or toggling a workflow, editing records, importing a report, changing menus), confirm **which environment** the change is for, unless the user already said it in this conversation:

- Ask: "Is this for Production or UAT?" and name the account/app you are signed in to, so the user can catch a mismatch.
- Default to **UAT**. Treat **Production as read-only**: no changes, no workflow runs, and no logins or reads unless the user explicitly asks for that specific action. Copying *from* Production is a read; copying *to* it is a change.
- Check the URL's client ID before every write (`/<clientId>/app/<appId>`). A script that writes should refuse to run when the page is on the wrong client.
- Project facts (accounts, client/app IDs, which app is Production) are not stored in this skill. Look for them in the project's own notes or docs and in memory; if missing, ask the user.

## Safety rules that apply to every task

- **Change apps only through the API.** Make every change (forms, fields, dropdown choices, relations, privileges, menus, buttons, UI workflows, backend workflows, records) with the APIs: design API (`get-app-data-for-design` + `EntityType/SaveEntityType`, WP-071), workflow API, UI-workflow configuration API (WP-072), records API. Never drive the designer or App Studio to change something (no clicking Save, dragging controls, typing into the JSON editors, capturing and replaying designer saves), and never ask the user to make the change in the designer. If you know no API way for a change, say so and ask; do not fall back to the UI. Opening a page to look (a half-scale screenshot to confirm a visual) is allowed.
- **Never run, activate or trigger a workflow on your own.** The user starts runs. You may save definitions and toggle on/off only when asked; say clearly when a toggle changes live behaviour.
- **Back up before you edit.** Save the current definition of every workflow/form you will change to a local, dated folder first, and keep it until the user confirms the result. (A backup deleted too early once made a rollback impossible.)
- **Secrets.** Workflow connectors contain credentials (UKG, other vendor APIs, keys). Never print, log or put them in docs. When inspecting workflow JSON, print only structure: for a connector print the method, the URL host and the names of its headers and body keys, **never its `Request` text** (a masking pattern on the text misses values inside `urlencoded` arrays and escaped JSON; a username, password and client id once appeared in output this way). Before saving a workflow cloned from another one, check by code that none of the source's literal values (other than known constants such as `grant_type` `password`) appear in the new JSON, and read credentials from the project's config record. Delete raw dumps with secrets when done, and tell the user which local folders still contain them.
- **The user signs in.** Never type passwords. Ask the user to sign in in the Playwright browser and tell you when done.
- **Personal data.** Blur names, emails and IDs in screenshots you keep or share.
- **Report faithfully.** If a test shows something did not work, say so with the evidence (timestamps, statuses, log lines) before proposing the next fix.

## The six platform facts that cause most surprises

Learned the hard way; details and evidence via `references/wp-index.md`.

1. **Workflow order matters (WP-001).** A record created/updated by a workflow only triggers workflows that sit **later in the workflow list** (higher Sequence). A workflow placed after its target fires nothing. Keep the list order identical between environments.
2. **The designer does hidden side work that the API does not.** Creating a form in the designer also grants the admin role access (privilege 32655). Saving a form body through the API creates the form and its default menus but **not** the privilege, so the menus stay hidden in the runtime. Child forms also need their own parent-child relation call.
3. **A status trigger needs an actual change (WP-002).** Workflows triggered on `Status _IsUpdated` don't start if the new value equals the old one (records stuck at "Running" can't be rerun by setting "Running" again).
4. **Triggered runs of one workflow go one at a time (async triggers can overlap), and a loop does not always wait for them (WP-005).** A loop that updated 24 records finished in seconds while the 24 workflow runs it triggered executed over the next hour; a second batch started meanwhile lost its triggered runs. Run one batch at a time.
5. **The runtime caches the app.** After design changes, click the refresh icon next to the app name (or sign in again); menus for forms the role cannot access are hidden, so new forms need role privileges (see copy checklist).
6. **A Router runs every route whose condition is true (WP-009)**, not just the first. Make route conditions exclusive when only one outcome is wanted.

## How to work efficiently

- **Start from `app-export/<app>/SUMMARY.md`** in the project. If missing, export the app (WP-045) and write it; if present, run the export's freshness check (`since`) when you first open the app. Answer "what uses/triggers/writes X" and read node trees from the export or `graphify query --graph`, not the designer. Re-export after each saved change.
- **Requirements too:** if the project has `requirements/` (SRS, BRD or similar), check `requirements/SOURCES.md` for staleness and use the requirements graph with the app graph, per `references/project-knowledge.md`. Requirements change; refresh before relying on them.
- **Hard rule: no `browser_snapshot` in App Studio; screenshots only to confirm visuals, at half scale.** Prefer the APIs; return counts, names and statuses, never whole JSON. Run skill scripts with the loader in `references/playwright-efficiency.md` §3 (`find-field.js`, `record-count.js`).
- **Every API request goes through Playwright and returns only what is needed.** This covers CloudApper and integration systems without a project toolkit. Exception: when the project has its own UKG toolkit (for example `wfm-toolkit/wfm-tests`), call UKG through it (`node scripts/call.js ... --find <keys>`), which keeps the login in `.env` and prints only the matched fields. Load `scripts/ca.js` once per page with the loader (`run('ca.js', {})`), then make one-line calls from `browser_evaluate` (`ca.find`, `ca.count`, `ca.save`, `ca.wfList`, `ca.wfSteps`, `ca.lastRun`; see `references/playwright-efficiency.md` §3). For integration systems use `page.request` in `browser_run_code` (Node side, so no CORS): read the credentials from the app's config record inside the same code, and filter the response before returning it. Return counts, IDs and the fields asked for, never raw responses, whole workflow JSON or credentials. Do not call these APIs with curl or Node scripts from the shell, and do not paste long helper code into each call.
- **Large reads go to a subagent** (execution logs, validator output, many records): it returns a short summary, and the raw output never enters the main conversation.
- After every change, **read it back** (API); for workflows, open the builder once to check it renders.
- Large or repeated changes: a Python builder that fills templates from existing nodes, then a guarded apply script, both kept in the project.
- API-built nodes run but may not open in the editor (WP-030 to WP-038): copy a designer-saved node, fix what `scripts/validate-workflows.js` reports, open each new node and clear its errors before the user runs it.
- **Testing means a real run (no dry-run).** The user runs it on a marked UAT record; then check the written values with `scripts/verify-workflow-run.js` (WP-039), since a successful log can still hide wrong values.

## Documentation and skill updates

- Writing docs: follow `references/documentation.md` (Markdown, internal audience). Read an app's existing docs or notes before exploring it again.
- "Add this to the cloudapper skill", or reusable knowledge the user agrees to keep: apply it in this folder in the same session, generically (no customer names, IDs or hosts), following `CONTRIBUTING.md`.
