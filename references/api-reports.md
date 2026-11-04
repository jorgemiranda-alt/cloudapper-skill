# CloudApper API: reports

Hosts depend on the cluster (see platform-model.md §1). Below, `API` = `https://<cluster>-api.cloudapper.com/api/`, `DAPI` = `https://<cluster>-designapi.cloudapper.com/api/` (or `api-design-cl2...`), `RAPI` = `https://<cluster>-reportapi.cloudapper.com/api/v3/`.

Auth headers and big-int `Version` handling: `api-reference.md` §1.
Entries headed `WP-0xx` use the format and statuses explained at the top of `workflow-patterns.md`; `wp-index.md` lists every entry.

## 7. Reports

- `GET RAPI Reports/app-reports`, `GET RAPI Reports/report-details/{reportId}` (LayoutContent base64), `POST RAPI Reports/save-report/{id}` = Edit Report Information > Update: body = the report-details Result plus `EntityTypeId:''`, `ServiceUrl:null`, `Variables:null`; change `Name`/`Title`/`Description` to rename (layout kept, its root Name follows). Typing into that page with Playwright `fill` does not register (DevExtreme boxes update on change), so rename through this call. `ReportPermissions [{PermissionType:1, PermittedId:<creator>}]` is what **Public** looks like; `[]` in the body does not clear it.
- `GET RAPI reportpackaging/{reportId}/export` → `.carpkg` (zip). Read-only on the source app.
- `POST RAPI reportpackaging/import` multipart: `file` (.carpkg) + `metaData` = JSON `{<packageSchemaId>: <targetFormId>, ...}` → `Result` = new report ID.
- `POST RAPI ReportDesigner/Invoke` (actionKey setData) and `ReportExport/stream/1` exist for designer saves and previews.
