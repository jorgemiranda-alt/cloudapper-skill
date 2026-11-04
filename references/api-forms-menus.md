# CloudApper API: forms, relations, privileges, menus, UI workflows

Hosts depend on the cluster (see platform-model.md §1). Below, `API` = `https://<cluster>-api.cloudapper.com/api/`, `DAPI` = `https://<cluster>-designapi.cloudapper.com/api/` (or `api-design-cl2...`), `RAPI` = `https://<cluster>-reportapi.cloudapper.com/api/v3/`.

Auth headers and big-int `Version` handling: `api-reference.md` §1.
Entries headed `WP-0xx` use the format and statuses explained at the top of `workflow-patterns.md`; `wp-index.md` lists every entry.

## 4. Forms (design API)

- `POST DAPI EntityType/SaveEntityType` → create/update a form (top-level or child). Body = the designer's full form definition (`AllFields` in design format, `EntityTypeID`, `GlobalTypeID`, `Tittle` [sic], `IsEdit`, `Version` (string), `Client`, `ParentSchemas`, `ChildSchemas`, `CustomActionsConfiguration`, settings). New form: `IsEdit:false`, `Version:"0"`, your own GUID as EntityTypeID. Update: `IsEdit:true` + live Version.
  - Easiest reliable way to get a valid body: open the form in the designer, click Save with the request **blocked** (`route.abort`), keep `postData()`. See playwright-efficiency.md "capture" and "save-swap".

### WP-028 Add a field to a form by replaying the designer's save
**Rule:** Capture the designer's own save body (above), add a copy of an existing field of the same control type with a new internal name, label and sequence, raise `StringFieldLastIndex` (or the matching counter), and send it with the raw live `Version`. Don't drag controls from automation.
**Why:** Drag and drop in the designer is unreliable from automation; a saved form body is a reliable source of a valid field definition.
**Caveats:** Send the replayed save through a frame without your interceptor, or the interceptor swallows it. The runtime may not show the field until **Reload App** (platform-model.md, caching). Check the client ID before writing. A whole new form: WP-043.
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: a choice field added to a form, present in the app details and shown on the form after Reload App.

### WP-043 Build a whole form through the API from templates captured in the designer
**Rule:** Create the shell in the designer and save it with one field (the designer won't save an empty form). Capture each needed save body without sending it: hook XHR/fetch `send`, keep the body, abort. Capture one form per control type you need (Form reference 12, Date 11, Date & Time 3, Text 4, Text area 5, Dropdown 2, Yes/No 1, Attachment 37). Build `AllFields` = Section, column, your cloned fields, then the system fields (ControlType 99). Per clone: replace the template's old `Name` everywhere in it with `<type>FieldN`, set `Label`, `Hint`, `Mandatory`, `SequenceNumber`/`TabIndex`/`DisplayNumber`, and the platform-0 `SequenceNumber` inside `StyleSettings`/`StyleConfiguration`. Form fields also need `ReferenceTypeID`, `EntityTypeID` and `ReferenceTypeId` set to the target form. Dropdowns need `DefaultValue` (`dro_choice_n` ids), `DefaultItems` and `colorOptions`. Set each `*FieldLastIndex` to the number of fields of that category (Date and Date & Time share the date counter). Check `ClientId`, `AppId`, `EntityTypeID` and `Tittle` against the target, POST with the captured live `Version`, then reload the designer and read the fields back.
**Why:** Two forms of one app differ only in title, description, ids, version, create date and the counters; the designer's own body is a valid template for every field.
**Caveats:** Send from a page without your hook (WP-028). The captured headers hold the bearer token: keep them in memory or session storage only, never print them, delete them afterwards. A capture that is aborted leaves the live `Version` unchanged, a sent one raises it.
**Status:** Observed · checked 2026-11 · Studio 8.2.0.25 · Evidence: two forms (9 and 6 fields, with two dropdowns, form references and date-times) saved with `IsSaved: true`, reopened in the designer with every field, required flag and dropdown choice intact.

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
