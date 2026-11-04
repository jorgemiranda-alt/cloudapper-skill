# Building apps and forms

## Defaults

- Build **manually** (Build Manually / Start from Scratch). Don't use the AI app builders unless the user asks.
- Start from a short design: forms and fields (with types and which are references), parent/child forms, statuses and who changes them, menus per role, workflows (trigger, steps, external calls), reports. Agree on it before building.
- Build order: forms → child forms and relations → menus → roles/privileges → UI workflows → backend workflows (off) → reports → buttons → test data → turn workflows on in UAT → test.

## Designer tips (Playwright)

- Field drag-and-drop: smooth-dnd needs mouse down + ~30 small moves + up; drops fail about half the time, retry until the field count (`app-web-column .smooth-dnd-draggable-wrapper`) rises. Scroll the control into view first.
- Field properties: find inputs by xpath from the label text ("Field Title", "Placeholder Text"); toggles via `.toggle-handle`. Save = disk icon in the designer header.
- Each new form gets "Add X" and list menus. After design changes, click **Reload App** (↻ next to the app name).
- Getting IDs: field names from the create form (`data-testid="field-stringFieldN"`), menu IDs from `/list/{formId}/{menuId}`.

## Workflows in the builder

- AI Agent & Automation → Create New → Workflow. Common nodes: Fetch Records, Iterator, Router/Logic Path, Create/Update Record, Connector (e.g. "Email Notification (Extended v3.5)", To = data-source field), UI Action "Show Message" (Toast works in After triggers; leave its Text empty or it renders raw).
- Expression editor: expand groups with the arrow; clicking a group name inserts the whole record.
- Place new workflows in the list **before** the workflows they need to trigger (see workflow-patterns.md).

## UI workflows (client side)

- Settings → UI Workflow Configuration (`/design/workflow-json-editor`), JSON per workflow; set the editor with `ace.edit(el).setValue(json)` then Submit, or use the configuration API. Official reference: docs.cloudapper.com/en/technical-doc/ui-workflow.
- PIN lookup that works: trigger `ON_LOAD_SEARCH` + `TriggerMenuId` (Search-type menu); action `VIEW_RECORDS` with `ActionDataSource` `__fetchData(<field>:__PIN_NUM_0__, <formId>)` and `ActionListAttributes.AdditionalFilterQuery` `<field>:"#Name.<field>"`. One match opens the record; no match shows a toast. `VIEW_RECORD` on `ON_LOAD_SEARCH` does nothing.
- Confirmation child record from a button: `ADD_NEW_RECORD` with `ActionFormAttributes [{Field:"Parent", FieldValue:"_triggerForm"}]`, button ActivityType 4.

## Reports

- Prefer cloning an existing report (export package → import) and adjusting, over building from scratch. Never modify a report the user marked as sensitive: create a new one from it.
- **Fixed day columns (period grids: one column per day of a period):** don't use Vertical bands that print one column per record (a missing day shifts every later day). Group by person (or item) and put one cell per day in the group footer: `sumSum(Iif(DateDiffDay(GetDate([Period Start]), GetDate([Record Date])) = k, <value>, 0))` with Summary Running = Group; the same cells with Running = Report in the detail report's ReportFooter give a **Day Totals** row. Zero as "-": `TextFormatString="{0:#,##0.00;-#,##0.00;-}"`. Give every table (date row, column titles, rows, totals) identical cell widths, so they line up.
- **Any period length in one report:** lay out the maximum number of day columns and grey out days after the period end with BackColor/ForeColor expression bindings (`Iif(DateDiffDay(GetDate([Period Start]), GetDate([Period End])) < k, '#D9D9D9', ...)`; the header uses the parent's end date). Several values per day (e.g. per shift): one cell each, a per-column totals row, then a per-day totals row whose cells span the day's columns. One dynamic report replaces one report per period length; point every button at it.
- **Saving a layout:** open the report in the designer, click Save Report and swap your bands into the `ReportDesigner/Invoke` `actionKey=setData` request (designer JSON = repx XML with `@` attributes; replace the data source ref with the designer's `@DataSource`). Block any save whose `reportUrl` is not the target.
- **Changing form buttons:** open that form's designer, click Save and edit the intercepted `SaveEntityType` body (`CustomActionsConfiguration`: `ButtonText`, `Activity` ReportId, `VisibilityRuleset`); abort any save for another form. Show a button only where it applies with visibility rules on the record's fields (e.g. a site reference: compare both its display name and its id).
- **Previewing:** `POST RAPI ReportExport/stream/1` with `{ReportId, FilterConfiguration, Variables:{_RecordId}}` returns the PDF (the button downloads it). Render it with pdf.js from cdnjs in a localhost page to look at it.
- Expressions in DevExpress: e.g. show "-" instead of 0: `Iif(Round(IsNull([A],0)+IsNull([B],0),2) = 0, '-', Round(IsNull([A],0)+IsNull([B],0),2))`.

### WP-044 Dragging controls with real mouse events (browser extension, not Playwright)
**Rule:** After typing in the control search, make one throwaway drag to a spot outside the column (the first drag after typing is ignored), then drag for real. Drop about 25 px below the last field's input and inside the column; an empty column takes a drop anywhere. Check that the field count rose before editing properties, because a missed drop sends your edits to the previously selected field. Save every three or four fields. A Lookup control needs a Form control on the form first; references to other forms are Form controls. Before creating anything, check the app name or logo in the header: a new browser tab can open the designer in the last app used, and the design `initialize` link for the right app switches it back.
**Why:** The designer ignores a drop that misses the column and keeps the old selection, and its session state follows the browser profile, not the URL.
**Caveats:** If screenshots time out, the page renderer is stuck: open a new tab, and expect unsaved fields to be lost. Faster alternative for many fields: WP-043.
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: about 40 fields added across four forms; missed drops, a stuck renderer and a designer opened in a different app each happened and these steps avoided repeats.

### WP-045 Export the app to local files and a graph, and query the graph before opening the designer
**Rule:** At the start of a build session, and again after each saved change, export the app with `scripts/export-app.js` (read-only). Start `python -I scripts/save_server.py <project>/app-export/<app> 8766` in the background, set `globalThis.CAE_OPTIONS = { saveUrl: 'http://127.0.0.1:8766/' }`, and run the script in a signed-in page of the app. It writes `app.json`, one `form__*.json` per form, one `wf__<seq>__*.json` per workflow (node id, name, action type and form only, no connector settings or expressions) and `graph.json` in graphify's node-link format. Then answer structural questions from the files or the graph instead of the designer: `graphify query "what runs when <form> changes" --budget 1500`, `graphify path "<form>" "<form>"`, or grep the small files. Check the returned `orderWarnings` (pairs that break WP-001) before adding or reordering workflows, and list the workflows that write a form before changing it, so you back up the right ones. Stop the save server when done.
**Why:** Snapshots of the designer and full workflow JSON cost tens of thousands of tokens each time and are thrown away at the end of the session. The export is a few KB per form or workflow, persists between sessions, and the graph shows the links text search can't (form → workflow → node → form, menu → form, role → form). Building `graph.json` from the API is exact and free; running graphify's own extraction over the JSON runs the model over every file.
**Caveats:** Menus and role privileges are linked to forms by any form id found in them, so check a few edges against the designer the first time. `may_trigger` edges ignore trigger conditions (WP-002) and a `blocked_by_order` edge is a candidate, not proof. The export folder holds app structure, not secrets, but treat it as customer data: keep it in the project, not in this skill. Run graphify's clustering on it (`graphify cluster-only <folder>`) only if you want communities and a report; querying works on the plain file.
**Status:** Hypothesis · checked 2026-11 · Evidence: script written from the API shapes used by `validate-workflows.js`; not yet run on a live app.

