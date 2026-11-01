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
