# CloudApper API: records

Hosts depend on the cluster (see platform-model.md §1). Below, `API` = `https://<cluster>-api.cloudapper.com/api/`, `DAPI` = `https://<cluster>-designapi.cloudapper.com/api/` (or `api-design-cl2...`), `RAPI` = `https://<cluster>-reportapi.cloudapper.com/api/v3/`.

Auth headers and big-int `Version` handling: `api-reference.md` §1.
Entries headed `WP-0xx` use the format and statuses explained at the top of `workflow-patterns.md`; `wp-index.md` lists every entry.

## 2. App details and records

- `GET API v3/Apps/{appId}/details` → `Result.Schemas` (forms with runtime `Fields`, `CustomActionsConfiguration`, `Version`), `ParentChildRelations`, `Menus` (role-filtered), `AllMenus`, `Roles`, `RecordRolePrivileges`, `WorkflowDefinition` (UI workflows).
- `POST API v3/Records/fetch` body `{StartRow, TotalRows (≤1000), SearchType:0, TypeId:<formId>, FilterConfigurations:[], SortConfigurations:[]}` → `Result.{Count, Items}`. Page through with StartRow. Items carry `id`, `DisplayName`, field values and `<field>ReferenceId` for references.

### WP-027 Update many records in one API call
**Rule:** `POST API v3/Records?records-required=true` with `{"Items":[{"TypeId":<formId>,"id":<record id>,"_version_":<version>,"<field>":<value>}]}`, in batches (20 per call worked). Read the records first with `Records/fetch`, quote the 19-digit `_version_` before parsing (§1), and write it back as a raw number.
**Why:** It's the call the runtime UI makes when it saves records.
**Caveats:** Check the client ID in the page URL before writing.
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: 106 records updated in 6 calls and read back.

### WP-037 Set a reference field through the records API
**Rule:** In a `Records` update item, set a reference field with three keys: `"<field>": <display text of the target>`, `"<field>ReferenceId": <target record id>`, `"<field>ReferenceTypeId": <target form id>`. Read one record back to confirm before updating the rest. Use a filtered `Records/fetch` for the target (e.g. by a unique field) instead of fetching a whole large form.
**Why:** Records store a reference as these three keys. Setting only the text does not link the record.
**Caveats:** An update may fire workflows triggered on edit of that form; check before a bulk change. A 45-second page limit can cut a long call: do it in batches (WP-027) and check what changed before repeating.
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: 135 records relinked to the correct employee in 7 calls and read back; a one-record test first.

### WP-070 A duplicate in a unique field is rejected silently
**Rule:** When you write records through `POST API v3/Records`, check each returned item's `Status` and the record count afterwards, not only the HTTP status. When a workflow assigns values to a unique field (a ticket or invoice number), make the workflow guarantee the value is free before the create (for example, a WHILE loop that looks up the candidate value and steps past used ones), and keep the unique field only as a backstop.
**Why:** A create whose unique field repeats an existing value returns HTTP 200 with the item marked `Status: 2`, and no record is saved. Nothing reports an error, so a workflow or script that trusts the response loses the record.
**Caveats:** Workflow CREATE_RECORD steps are likely to fail the same way; read the record count after a test run.
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: a second record with the same unique Counter Name returned HTTP 200, item Status 2, and the form still held one record.

### WP-074 Link a child record to its parent through the records API
**Rule:** When you create or update a record of a child form with `POST API v3/Records`, set the three system fields `ParentId` (parent record id), `ParentTypeId` (parent form id) and `ParentDisplayName` (the parent's `DisplayName`). Find child forms in `v3/Apps/{appId}/details` → `ParentChildRelations`; the parent link is not in the form's `Fields`, so a field listing misses it.
**Why:** The list's parent column (marked SYS) shows `ParentDisplayName`. Rows with only `ParentId` are linked but look unlinked in the grid; rows without `ParentId` are not linked at all, and a report over the child form mixes every parent's rows.
**Caveats:** Read one record back after the first write before updating the rest.
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: 604 child rows linked and 742 dummy rows given their display name; read back with no blanks.

### WP-077 Reference fields keep a copy of the target's title
**Rule:** A reference field stores the target record's title as text at the moment the link is made (`<field>`), next to `<field>ReferenceId`. After changing a form's title (WP-076), rewrite that text on every referencing record: find reference fields to the form in `v3/Apps/{appId}/details` (ControlType 12 with the form's id), and send `<field>` = the target's current `DisplayName` together with the unchanged `<field>ReferenceId` and `<field>ReferenceTypeId` (WP-037), in batches of 20. Try two records first and read them back.
**Why:** The list and forms show the stored text, so references made under the old title keep showing it (here, just the employee number) until rewritten. Workflow steps that link a record (`Field: "id"` of a fetched record) or copy another reference take the target's title at run time, so they need no change.
**Caveats:** Before a bulk update of a form with an "updated" trigger, check what the trigger would do. In this test, 255 updates through `POST API v3/Records` started no run of the update-triggered workflow; confirm that again before relying on it.
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: 444 references on 8 forms rewritten and read back with links intact; the Exception update-triggered workflow logged no run.
