# Working with Claude on CloudApper: how to ask, and where project facts live

Share this page with the user when they ask how to work with you, or how to get Claude to learn CloudApper, document it, or build with it.

## How to ask (templates)

**Start every task with four facts:** the app, the environment (Production or UAT), what you want, and what must not be touched.

> "In the **<app> UAT** app, change *<workflow>* so ... . Don't touch Production or the existing reports. I'll run the tests."

**Learn / explore an app (read-only)**
> "Learn how the *<app>* app works: forms, menus, workflows and reports. Read-only. Summarise the main flow and save the project facts in the project's notes."

**Document**
> "Document the *<app>* app with the cloudapper skill: Markdown only, internal team audience, focus on troubleshooting and the core workflows. Questions go inside the doc."

**Design a new solution**
> "Design a CloudApper solution for *<business process>*: users, data, external systems (<UKG / REST / SFTP>), volumes. Use the architecture and conventions guides; propose forms, workflows, menus and reports before building."

**Build a feature**
> "In UAT, add *<feature>*: <business rule>. Users: <roles>. Trigger: <button / schedule / record change>. Data: <forms and fields>. Propose the design first, then build it; leave new workflows off until I test."

**Change or speed up a workflow**
> "In UAT, *<workflow>* takes <time> when <action>. Find where the time goes, propose a fix, back up before changing, and tell me how to test it."

**Copy between apps**
> "Copy <features / whole app> from <source app/account> to <target app/account>. Source is read-only. Include configuration: relations, role access, menus, UI workflows, buttons, reports, setup records, workflow on/off and order."

**Debug**
> "In UAT, <record> is stuck at <status> since <time>. Find which workflow should have picked it up and why it didn't."

## Habits that make results better

- Say the environment every time, and sign in to the right account yourself when asked.
- Tell Claude what is sensitive ("don't modify existing reports", "don't run workflows").
- Let Claude propose a design or plan before big changes; reply with corrections early.
- After a test, say what you did and when ("reran <scope> at 06:45"), so Claude can match the logs.
- When something reusable is learned (an engine rule, an API shape, a pattern), ask: "add this to the cloudapper skill".
- Give official docs or PDFs (e.g. docs.cloudapper.com pages) as sources to fold into the skill.

## What goes in the skill and what doesn't

The skill holds **only reusable knowledge**: how the platform behaves, API shapes, design patterns, conventions, architecture, checklists, working methods. Write examples generically ("a parent record", "a sync workflow", "a setup record").

**Project facts stay out of the skill**: account emails, client and app IDs, form/workflow/report names of a customer app, business rules of one customer, change history. Keep them in the project's own notes or documentation (for example `docs/project-notes/` in the working folder) and in Claude's per-project memory. At the start of work on an existing app, look for those notes first instead of re-exploring the app.

## Keeping this skill current

When a session teaches something reusable, ask "add this to the cloudapper skill". Claude drafts it into the skill's `inbox/` in generic terms, with how it was seen and how to reproduce it. A teammate reviews it in a pull request before it reaches everyone; wrong entries are retired, not left in place. The full flow is in the skill's `CONTRIBUTING.md`.
