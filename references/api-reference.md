# CloudApper API reference (verified 2026-10-31)

Hosts depend on the cluster (see platform-model.md §1). Below, `API` = `https://<cluster>-api.cloudapper.com/api/`, `DAPI` = `https://<cluster>-designapi.cloudapper.com/api/` (or `api-design-cl2...`), `RAPI` = `https://<cluster>-reportapi.cloudapper.com/api/v3/`.

Entries headed `WP-0xx` use the format and statuses explained at the top of `workflow-patterns.md`.

## Contents
1. Auth headers and big-int versions
2. App details and records
3. Workflows
4. Forms (design API)
5. Relations, privileges, menus
6. UI workflows
7. Reports

## 1. Auth headers and big-int versions

Call from inside the signed-in page (`page.evaluate`) so the token is at hand:

```js
const tok = localStorage.getItem('accessToken').replace(/"/g, '');
const h = { authorization: 'Bearer ' + tok, 'content-type': 'application/json', accept: 'application/json',
  'x-ca-client-id': '<clientId>', 'x-ca-app-id': '<appId>', 'x-ca-client-platform': '3', 'x-ca-client-version': '8.2.0.25' };
```

The design API only needs `authorization` + `content-type`.

**Versions are 18-digit integers** that JS rounds, which makes updates fail with 409 or silently mismatch. Read the raw text, quote them before parsing, and write them back as raw text:

```js
const live = JSON.parse(raw.replace(/"Version":(\d{15,})/g, '"Version":"$1"')).Result;
const body = JSON.stringify({ ...w, Version: '__VER__' }).replace('"Version":"__VER__"', '"Version":' + w.Version);
```

## 2. App details and records

- `GET API v3/Apps/{appId}/details` → `Result.Schemas` (forms with runtime `Fields`, `CustomActionsConfiguration`, `Version`), `ParentChildRelations`, `Menus` (role-filtered), `AllMenus`, `Roles`, `RecordRolePrivileges`, `WorkflowDefinition` (UI workflows).
- `POST API v3/Records/fetch` body `{StartRow, TotalRows (≤1000), SearchType:0, TypeId:<formId>, FilterConfigurations:[], SortConfigurations:[]}` → `Result.{Count, Items}`. Page through with StartRow. Items carry `id`, `DisplayName`, field values and `<field>ReferenceId` for references.

### WP-027 Update many records in one API call
**Rule:** `POST API v3/Records?records-required=true` with `{"Items":[{"TypeId":<formId>,"id":<record id>,"_version_":<version>,"<field>":<value>}]}`, in batches (20 per call worked). Read the records first with `Records/fetch`, quote the 19-digit `_version_` before parsing (§1), and write it back as a raw number.
**Why:** It's the call the runtime UI makes when it saves records.
**Caveats:** Check the client ID in the page URL before writing.
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: 106 records updated in 6 calls and read back.

## 3. Workflows

- `GET API v3/Workflows` → all workflows with full definitions (large: return summaries only).
- `PUT API v3/Workflows/{AutomationId}` → update. Send the full live object with your changes and the raw live Version. `Sequence` in this body is **ignored**.
- `POST API v3/Workflows` → create; body = workflow object without `Id`, `AutomationId`, `Version`; returns the new AutomationId. Set `Status: 2` to create it off.
- `PUT API v3/Workflows/sequence` body `{NewSequneceNo, OldSequneceNo}` (platform spelling) → moves one workflow to a position and shifts the rest, like dragging in the list. Reorder by walking the target order and moving each workflow into its slot, re-reading after each move.
- `POST API v3/auditlogs/workflows/fetch-execution-log` body `{AutomationId, StartRow, TotalRows}` → `Items[{ExecutionId, StartTime, EndTime, Status, Message, MessageLevel, Nodes}]` (Status 1 ok, 2 failed, 3 running). `Nodes` (JSON string or array) = per step `{NodeId, StartTime, EndTime, ElapsedTime, MessageLevel, Status, Message}`: map NodeId to step names to find which step warned (MessageLevel 2 = warning). Debug-log text is not in it (view it in the designer).

## 4. Forms (design API)

- `POST DAPI EntityType/SaveEntityType` → create/update a form (top-level or child). Body = the designer's full form definition (`AllFields` in design format, `EntityTypeID`, `GlobalTypeID`, `Tittle` [sic], `IsEdit`, `Version` (string), `Client`, `ParentSchemas`, `ChildSchemas`, `CustomActionsConfiguration`, settings). New form: `IsEdit:false`, `Version:"0"`, your own GUID as EntityTypeID. Update: `IsEdit:true` + live Version.
  - Easiest reliable way to get a valid body: open the form in the designer, click Save with the request **blocked** (`route.abort`), keep `postData()`. See playwright-efficiency.md "capture" and "save-swap".

### WP-028 Add a field to a form by replaying the designer's save
**Rule:** Capture the designer's own save body (above), add a copy of an existing field of the same control type with a new internal name, label and sequence, raise `StringFieldLastIndex` (or the matching counter), and send it with the raw live `Version`. Don't drag controls from automation.
**Why:** Drag and drop in the designer is unreliable from automation; a saved form body is a reliable source of a valid field definition.
**Caveats:** Send the replayed save through a frame without your interceptor, or the interceptor swallows it. The runtime may not show the field until **Reload App** (platform-model.md, caching). Check the client ID before writing.
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: a choice field added to a form, present in the app details and shown on the form after Reload App.

  - Design-format fields for child forms are also in `GET DAPI user-management/get-app-data-for-design/{client}/{app}/{userId}` → `Result.EventTypes[].AllFields` (top-level in `EntityTypes`).
- `POST DAPI EntityType/DeleteEntityType` body `{entityType:<full design object>, LiAnalyticsSetting:null}`; simplest is the designer's **Delete This Form** menu, guarded by a route that checks the form ID.

## 5. Relations, privileges, menus

- `POST DAPI EntityType/SaveParentChildRelations` body `{parentId, childIds:[...], appId, ClientId:<number>, SchemaMode:0}` → **adds** the listed children (existing ones stay).
- `POST DAPI EntityType/SaveRolePrivilegeForEntityTypes` body `{EntityTypeID, PrivilegeCodes:32655, RoleID}` → what the designer does for the admin role when a form is created.
- `POST DAPI Settings/GetAllDynamicMenuItems` body `{ClientID, AppId}` → design menu list.
- `POST DAPI Settings/SaveDynamicMenuItem` body = a menu item. **Set `Client.ClientID`, `Client.ClientIDString`, `Client.AppId`, `CloudApperAppId`** (the list returns ClientID 0). Update: existing `MenuID` + `IsEdit:true`. Create: generate a new GUID `MenuID` with `IsEdit:false` (an empty MenuID returns 204 and creates nothing).
- `POST DAPI Settings/DeleteMenuItem` body = the menu item (with real client) → `true`.
- Regroup / rename / reorder / re-icon menus: save each existing item with changed `Title`, `ParentID` + `Level` (1 top, 2 child), `SequenceNo`, `IconURL` (reuse an URL from another menu; uploading new icons is a designer action), `Ishidden`, and `PermissionType` + `Permissions` (copy from a restricted group to restrict a group). Read back with GetAllDynamicMenuItems; runtime `Apps/{app}/details` `Menus` updates at once, but open browsers show the cached menu until **Reload App** (↻ next to the app name, about x=222, y=22 at 1920×1080) is clicked. Start page = the menu item with `IsLandingPageMenu: true` (set it on the new one, false on the old). Back up all menu items (GetAllDynamicMenuItems) before changing any, so the menu can be restored exactly.

## 6. UI workflows

- `GET API v2/Apps/ui-workflow-definition/{clientId}/{appId}` → `Result` = JSON string of the list.
- `PUT API v2/Configurations/update-app-configuration?config-to-update=Workflow` body `{AppId, ClientId, Configuration:[...full list...]}` → replaces the whole list (read, modify, write back).

## 7. Reports

- `GET RAPI Reports/app-reports`, `GET RAPI Reports/report-details/{reportId}` (LayoutContent base64), `POST RAPI Reports/save-report/{id}` = Edit Report Information > Update: body = the report-details Result plus `EntityTypeId:''`, `ServiceUrl:null`, `Variables:null`; change `Name`/`Title`/`Description` to rename (layout kept, its root Name follows). Typing into that page with Playwright `fill` does not register (DevExtreme boxes update on change), so rename through this call. `ReportPermissions [{PermissionType:1, PermittedId:<creator>}]` is what **Public** looks like; `[]` in the body does not clear it.
- `GET RAPI reportpackaging/{reportId}/export` → `.carpkg` (zip). Read-only on the source app.
- `POST RAPI reportpackaging/import` multipart: `file` (.carpkg) + `metaData` = JSON `{<packageSchemaId>: <targetFormId>, ...}` → `Result` = new report ID.
- `POST RAPI ReportDesigner/Invoke` (actionKey setData) and `ReportExport/stream/1` exist for designer saves and previews.
