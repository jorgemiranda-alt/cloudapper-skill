# Conventions and best practice for CloudApper apps

Use when designing, building, reviewing or changing any CloudApper app. Every rule here was learned on real apps; examples are generic.

## Contents
1. SOLID mapped to CloudApper
2. Naming
3. Workflow design
4. Configuration and data
5. Environments and change management
6. Reports
7. Testing and documentation
8. Where the platform limits these ideas

## 1. SOLID mapped to CloudApper

| Principle | On CloudApper | Example |
|---|---|---|
| Single responsibility | One workflow = one job; one form = one kind of data; one report = one audience. | A calculation workflow calculates; the external syncs and the summary run in their own workflows, started by job records. One report trying to serve two differently shaped audiences is the anti-pattern. |
| Open/closed | Change behaviour by adding setup records (rules, flags, settings), not by editing workflow logic. | Rule and cut-off records change times and thresholds without touching the workflow; a hard-coded time or recipient list does not. |
| Liskov substitution | Records playing the same role keep the same contract (field names, statuses, meaning), so workflows and reports work with any of them. | Rows from every site share fields, so one report fits all; a site whose data has a different shape gets its own report instead of special cases inside one layout. |
| Interface segregation | Each role sees only the menus, buttons and forms it needs; split big forms into child forms. | Buttons shown only for the records and roles they apply to (visibility rules). |
| Dependency inversion | Depend on configuration and contracts, not hard-coded IDs, names or URLs; workflows talk through records (job records, statuses), not each other's internals. | A workflow starts syncs by creating a job record. Weak spots: behaviour tied to an unfilled flag, credentials typed into nodes, record names hard-coded in rules. |

## 2. Naming

- **Forms:** singular business noun ("Invoice", "Time Entry"). No "Copy", "Test" or "(DO NOT USE)" in live forms.
- **Fields:** clear label with units where useful ("Eligible Minutes", "Amount ($)"). Never reuse one label for two meanings; avoid typos (they end up in expressions).
- **Workflows:** `<Area> - <What it does>` ("Invoice - Calculate Totals and Taxes"). Version numbers only when versions really coexist.
- **Workflow steps:** numbered in run order, verb first ("05 Load the Rule for this Date"); routes state their condition ("Yes - Rule Found", "Else - No Rule").
- **Menus:** group by the user's task and order by daily use (e.g. Daily Work · Periods · Synced Data · Setup · Admin); plural nouns users recognise, naming the source when data is synced ("UKG Time Entries"); setup and admin data in restricted groups; one distinct icon per item; hide auto-created "Add X" entries users don't need.
- **Reports and buttons:** say who and what ("Daily Report - Weekend (one shift)", "View Daily Report (Weekend)").
- **Descriptions everywhere:** every workflow and report says what it does, what triggers it and what it must come after in the workflow order.

## 3. Workflow design

- **Statuses as a state machine:** document the lifecycle (Pending → Running → Completed / Failed). Buttons and workflows change status; users don't edit it. A workflow never writes the status that triggers itself.
- **Order is part of the design:** a workflow only triggers workflows after it. Note the required order in the Description; keep order identical across environments (see workflow-patterns.md).
- **Idempotent reruns:** stamp each run (`Date&Time`), write records with the stamp, clean up older records in one bulk step. Scheduled syncs upsert (Save Records), never plain create.
- **Exclusive routes:** every true route runs; write conditions that cannot overlap and add an "else" route that at least logs.
- **Fail loudly:** every external call has a failure route that sets Failed + a reason. Nothing stays at an in-between status.
- **No logs inside loops:** loops collect their details into workflow variables (one line per pass, or counters) and one summary log after the loop shows every iteration. Log record counts before and after every bulk delete.
- **Keep it small:** a workflow doing two jobs is split and connected by a job record or a status change.

## 4. Configuration and data

- Rules, times, thresholds, recipients and per-location behaviour live in setup records or flags, never inside workflow steps. Make sure those fields are **visible on the form** (a flag defined on a form but left off its layout is never filled, and everything that depends on it silently misbehaves).
- Decide per-site behaviour from one source (a flag or type on the site record) and use it the same way in buttons, workflows and reports.
- Credentials in the credentials store, not typed into connector nodes.

## 5. Environments and change management

- UAT first, then Production. Back up before every change and keep the backup until the change is tested.
- Copying between apps includes configuration: setup records and flags, workflow order and on/off, role access, buttons (see copy-between-apps.md).
- Keep a change log per app (date, what, why, rollback). Build scripts + backup folders per change make changes repeatable; record them in the app's documentation.
- Before editing a core workflow, keep a disabled copy as rollback; delete it once proven.

## 6. Reports

- One layout per audience or data shape; don't hide columns per site inside one layout.
- Place values by data (date, shift), never by record position, so missing records can't shift columns.
- Totals are summed from the rows the report shows.
- Same visual system across reports: title with context (site, dates, "in progress"), one-line key, dark headers, highlighted totals, "-" for zero, right-aligned numbers, repeated headers, page footer (see building-apps.md for the techniques).

## 7. Testing and documentation

- After every change: one end-to-end test with a known date, checked against expected numbers (e.g. totals equal their source, shares add up to 100%). The user runs workflows; read the logs afterwards.
- Keep the app documentation current: flow, status lifecycle, workflows in order, setup records and what each controls (documentation.md).

## 8. Where the platform limits these ideas

- No real reuse: a workflow can't be called like a function with parameters; the closest is a job record or an on-demand workflow taking a record ID. Keep copied logic in as few workflows as possible and note the copies in each Description.
- No version control or automated tests: substitute backups, build scripts, a change log and a repeatable test checklist.
- Engine behaviour shapes structure: workflow order, non-exclusive routes, status-change triggers, the runtime cache. Record them where the team will see them.
