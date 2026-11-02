---
name: cloudapper
description: Working knowledge for the CloudApper no-code platform (web.cloudapper.com, m2sys.cloudapper.com and other tenants) - forms and child forms, menus, roles, UI workflows, backend workflows (triggers, nodes, order, expressions), reports, the app/design/report APIs, building, reviewing and documenting apps (technical and PM handover guides), UKG connector integrations, copying features between apps, and driving the app designer with the Playwright MCP without wasting tokens. Use this skill whenever the user mentions CloudApper, App Studio, Solution Builder, AI Agents & Automation, a CloudApper app or tenant, workflows/forms/menus/reports in such an app, Production vs UAT CloudApper environments, or wants to build, change, copy, debug, speed up or document anything on CloudApper - even if they only name a CloudApper app and not the platform. Also use it to design new CloudApper solutions of any kind (architecture, conventions, integrations with UKG, REST APIs, webhooks or SFTP).
---

# CloudApper

CloudApper is a no-code platform: apps are made of **forms** (data model), **menus** (navigation), **roles**, **UI workflows** (client-side), **backend workflows** (automation) and **DevExpress reports**, all edited in **App Studio** (`/design/...` for forms and menus, `/studio/...` for workflows) and used in the **runtime app** (`/<clientId>/app/<appId>/...`).

This file holds the rules that apply to every task. Read the reference that matches the task before acting:

| Task | Read |
|---|---|
| Understand how the platform works (forms, fields, workflows, reports, caching) | `references/platform-model.md` |
| Call the APIs (records, workflows, forms, menus, roles, UI workflows, reports) | `references/api-reference.md` |
| Build or change a workflow; debug one that "doesn't fire" or is slow | `references/workflow-patterns.md` |
| Drive the browser with the Playwright MCP | `references/playwright-efficiency.md` |
| Copy features or a whole app from one app/account to another | `references/copy-between-apps.md` |
| Build a new app or form in the designer | `references/building-apps.md` |
| Design, name or review anything (SOLID on CloudApper, naming, workflow/config/report conventions) | `references/conventions.md` |
| Design a solution or integration architecture (UKG, REST, webhooks, SFTP, middleware; scaling and efficiency) | `references/architecture.md` |
| Document an app (technical / troubleshooting guide, or a PM handover guide) | `references/documentation.md` |
| Review an app or write its findings / recommendations | `references/app-review-checklist.md` |
| Work with UKG (Pro, WFM, Recruiting, HRSD) connectors | `references/integrations-ukg.md` |
| The user asks how to work with you on CloudApper, or what belongs in this skill | `references/learning-and-prompting.md` |

## Environments: ask before you change anything

Most CloudApper customers have a **Production** app and a **UAT** (test) app, often under different accounts. Before any change (saving a form, editing or toggling a workflow, editing records, importing a report, changing menus), confirm **which environment** the change is for, unless the user already said it in this conversation:

- Ask: "Is this for Production or UAT?" and name the account/app you are signed in to, so the user can catch a mismatch.
- Default to **UAT**. Treat **Production as read-only**: no changes, no workflow runs, and no logins or reads unless the user explicitly asks for that specific action. Copying *from* Production is a read; copying *to* it is a change.
- Check the URL's client ID before every write (`/<clientId>/app/<appId>`). A script that writes should refuse to run when the page is on the wrong client.
- Project facts (accounts, client/app IDs, which app is Production) are not stored in this skill. Look for them in the project's own notes or docs and in memory; if missing, ask the user.

## Safety rules that apply to every task

- **Never run, activate or trigger a workflow on your own.** The user starts runs. You may save definitions and toggle on/off only when asked; say clearly when a toggle changes live behaviour.
- **Back up before you edit.** Save the current definition of every workflow/form you will change to a local, dated folder first, and keep it until the user confirms the result. (A backup deleted too early once made a rollback impossible.)
- **Secrets.** Workflow connectors contain credentials (UKG, other vendor APIs, keys). Never print, log or put them in docs. When inspecting workflow JSON, mask keys like password/secret/apikey/token/clientId, and print only structure. Delete raw dumps with secrets when done, and tell the user which local folders still contain them.
- **The user signs in.** Never type passwords. Ask the user to sign in in the Playwright browser and tell you when done.
- **Personal data.** Blur names, emails and IDs in screenshots you keep or share.
- **Report faithfully.** If a test shows something did not work, say so with the evidence (timestamps, statuses, log lines) before proposing the next fix.

## The six platform facts that cause most surprises

Learned the hard way; details and evidence in `references/workflow-patterns.md`.

1. **Workflow order matters (WP-001).** A record created/updated by a workflow only triggers workflows that sit **later in the workflow list** (higher Sequence). A workflow placed after its target fires nothing. Keep the list order identical between environments.
2. **The designer does hidden side work that the API does not.** Creating a form in the designer also grants the admin role access (privilege 32655). Saving a form body through the API creates the form and its default menus but **not** the privilege, so the menus stay hidden in the runtime. Child forms also need their own parent-child relation call.
3. **A status trigger needs an actual change (WP-002).** Workflows triggered on `Status _IsUpdated` don't start if the new value equals the old one (records stuck at "Running" can't be rerun by setting "Running" again).
4. **Triggered runs of one workflow go one at a time, and a loop does not always wait for them (WP-005).** A loop that updated 24 records finished in seconds while the 24 workflow runs it triggered executed over the next hour; a second batch started meanwhile lost its triggered runs. Run one batch at a time.
5. **The runtime caches the app.** After design changes, click the refresh icon next to the app name (or sign in again); menus for forms the role cannot access are hidden, so new forms need role privileges (see copy checklist).
6. **A Router runs every route whose condition is true (WP-009)**, not just the first. Make route conditions exclusive when only one outcome is wanted.

## How to work efficiently

- Prefer the **APIs** over clicking: they are faster, exact and cheap. Use the UI only for what has no API you know, and to confirm what the user will see.
- In Playwright, run code from **files** (`browser_run_code_unsafe` with `filename`), serve big payloads from a **localhost** helper, and return **compact summaries** (counts, names, statuses), never whole JSON. See `references/playwright-efficiency.md`.
- Before editing a workflow, **read its node tree** (names, action types, forms) from the API instead of opening the designer.
- After every change, **verify by reading back** (API) and, for workflows, open the builder once to check it renders.
- Large or repeated tasks: write a small builder script (Python) that produces the JSON from templates taken from existing nodes, then a guarded apply script. Keep both in the project so the change is repeatable and reviewable.
- Nodes built through the API run but may not open in the editor (WP-030 to WP-037 in `references/api-reference.md`). Copy a node the designer itself saved, and open every new node in the editor and clear its errors before asking the user to run the workflow, then check the first run's records (a filter that resolves to empty runs cleanly and links every row to the same record).

## Documentation defaults

Markdown only (PDF only on request), internal audience only (no customer emails), open questions inside the doc with why/what-for, diagrams show only the running app and its users/external systems. Full method: `references/documentation.md`. When an app already has documentation or project notes, read them before exploring the app again.

## Adding knowledge to this skill

When the user asks to add something to this skill ("add this to the cloudapper skill"):

1. Read `inbox/TEMPLATE.md` in this skill's folder and write the draft to `inbox/<yyyy-mm-dd>-<short-name>.md` with status `Hypothesis`. Write it generically: no customer, app, form, workflow or person names, IDs, real hosts or credentials.
2. Search `references/` for entries the draft confirms or contradicts, and list them in the draft's review notes.
3. Don't edit `SKILL.md` or `references/` yourself unless the user says they are a maintainer applying a reviewed change. Tell the user to open a pull request with the draft (`CONTRIBUTING.md` has the flow).
