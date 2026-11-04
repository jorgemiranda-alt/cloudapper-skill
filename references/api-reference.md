# CloudApper API reference (verified 2026-10-31)

Hosts depend on the cluster (see platform-model.md §1). Below, `API` = `https://<cluster>-api.cloudapper.com/api/`, `DAPI` = `https://<cluster>-designapi.cloudapper.com/api/` (or `api-design-cl2...`), `RAPI` = `https://<cluster>-reportapi.cloudapper.com/api/v3/`.

Entries headed `WP-0xx` use the format and statuses explained at the top of `workflow-patterns.md`.

## Contents
1. Auth headers and big-int versions (below)
2. App details and records: `api-records.md` (WP-027, WP-037)
3. Workflows: `api-workflows.md` (WP-030 to WP-036, WP-038 to WP-040, WP-046, WP-053)
4. Forms (design API), 5. Relations, privileges, menus, 6. UI workflows: `api-forms-menus.md` (WP-028, WP-043, WP-055)
7. Reports: `api-reports.md`

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
