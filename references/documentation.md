# Documenting a CloudApper app

Goal: a reader who has never seen the app can (1) understand how it works and (2) start troubleshooting quickly; solution engineers can adjust the core workflows.

## User rules

- Deliver **one Markdown file** with screenshots and mermaid diagrams. Build a **PDF only when asked**.
- **Internal audience only** (Solution Delivery Engineering). No customer emails or extra deliverables. Put open questions inside the doc, each with why we ask and what the answer is needed for.
- Diagrams show only the running app, its business users and external systems. Leave out engineers, App Studio, Claude, Playwright/MCP and scripts.
- Walk the app **read-only**: never create, edit, delete, run or activate anything.
- Blur personal data in screenshots; never write credentials (record only that they exist and where).

## Output layout

```
docs/<app-slug>/<App-Name>-Documentation.md
docs/<app-slug>/screenshots/NN-<what>.png
```

## Process

1. Ask for access (user signs in) and the environment (Production read-only is fine for documentation).
2. Walk every menu, one record per main form (details, child tables, audit log), buttons per status. Screenshots at 1920×1080 after loading overlays are gone (see playwright-efficiency.md), then blur.
3. Read the design from the APIs: forms, relations, menus, workflows (triggers, nodes, connector method + URL, record writes, hard-coded values), reports.
4. Write the doc in this order:
   1. What the app is for (problem, what it automates, users).
   2. How it works on one page: "flow in N steps" table (step, what happens, started by, workflow, status after), end-to-end flowchart, status lifecycle (`stateDiagram-v2`) with what a stuck status means.
   3. Troubleshooting quick start: first five minutes checklist, triage flowchart, symptoms/causes/fixes table, known behaviours that look like bugs (with finding IDs), what to send when escalating.
   4. Architecture: components diagram, external endpoints table, ER diagram, forms table (with record counts and date).
   5. User guide: navigation, menus, step-by-step procedure table, screens.
   6. Internal processing per workflow stage, scheduled syncs with cron.
   7. Core workflow reference for solution engineers: node-by-node tables with exact designer names, routing conditions, fields written, things to know, common adjustments, safe-change rules (order, status triggers, UAT first, backups).
   8. Findings and recommendations (F-01…, severity, evidence, recommendation).
   9. Appendix: workflow inventory (active/inactive, test workflows flagged).
5. Style: short sentences, tables over paragraphs, bold UI labels and status values, dated counts, verified facts (mark inferences).

For section 8, go through `app-review-checklist.md`. For "who changed this record", use the record's **Audit Log** tab (workflow changes show `WorkflowService`, user edits show `Web`). Read record counts from the API: list views apply filters.

If the project has the `cloudapper-app-docs` skill (with a PDF script), follow it; it is the detailed version of this page.

## PM handover guide (companion doc)

Written for the PM or account person taking over a customer: non-technical, plain words. It sits next to the technical doc (a PM guide per app, kept beside its technical doc). Header: audience, solution and tenant, as-of date, sources (Jira read-only, the app, public info), link to the technical doc, and the **[confirm]** marker for anything unverified.

1. **At a glance**: one-sentence summary; table of customer, systems, platform, users, environments, scope, start date, phase, Jira counts, volumes, RAG health.
2. **The customer**: public facts with sources and why they matter [confirm].
3. **Problem and value**: the manual process vs what the app does (table), value messages, what it does NOT do.
4. **How it works in plain words**: big-picture flowchart, life of one record with statuses in plain words, forms/record types, a worked example.
5. **Features and components**: features with status (working / off / no effect), components in plain words, menus per audience, environments.
6. **Domain basics** (e.g. UKG, payroll, HR): concept, meaning, why it matters.
7. **CloudApper basics**: tenant, app, form, workflow, connector, audit log, App Studio.
8. **Glossary**.
9. **People and roles**: role, side, responsibilities, name [confirm]; "who to go to for what".
10. **Current state, risks, open items**: Jira buckets and themes, risk register R-xx (impact, severity, action, link to technical F-xx), suggested order (now / next / then).
11. **Customer communication**: key messages, what not to share, issue-handling flowchart, what to ask for every time, message templates (acknowledge, data-caused issue, rule rejection, close approved items, weekly status), meeting cadence.
12. **Questions for the first weeks**: with our team, with the customer.
13. **Sources**.

Templates are for the PM to adapt; they are not emails we send (internal-only rule still applies).
