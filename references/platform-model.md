# CloudApper platform model

## Contents
1. Tenants, clusters and IDs (below)
2. Forms and child forms, 3. Fields, 4. Menus and roles, 7. Reports, and details on fields, buttons, records, designer, roles, sign-in, dashboards: `platform-data.md`
5. UI vs backend workflows, 6. Backend workflows (triggers, nodes, expressions), and details on triggers, timing, nodes, connectors, UI workflow triggers: `platform-workflows.md`
8. Runtime caching and publishing (below)

## 1. Tenants, clusters and IDs

- One web front end (`https://web.cloudapper.com`, or a tenant host such as `m2sys.cloudapper.com`) serves accounts that live on different **clusters**. Each cluster has its own API hosts, e.g.:
  - cluster 2: `api-cl2.cloudapper.com`, `api-design-cl2.cloudapper.com`, `reportapi-cl2.cloudapper.com`
  - m2sys: `m2sys-api.cloudapper.com`, `m2sys-designapi.cloudapper.com`, `m2sys-reportapi.cloudapper.com`
  Find the right hosts by watching the network tab of the signed-in app (or `clientWiseRoutingDetails` in localStorage).
- **Client ID**: a 16-digit number (e.g. `1234567000000001`) in every runtime URL: `/<clientId>/app/<appId>/...`. It fits in a JS number, but version numbers do not (see API). <!-- leak-check: allow (made-up example ID) -->
- **App ID**: a GUID. One account can hold several apps.
- **Form IDs, menu IDs, workflow IDs, record IDs are different in every app**, even when titles match. The **GlobalTypeID** of a form can match across copies of the same app. Field **names** (`stringField3`) match for forms that were copied.
- URLs: runtime list `/<client>/app/<app>/list/<formId>/<menuId>`, record `/details/<formId>/<recordId>`; designer `/design/<client>/app/<app>/form-designer/<formId>`; menus `/design/<client>/app/<app>/menu`; workflows `/studio/<client>/app/<app>/workflow` and `/workflow/details/<automationId>`; UI workflows `/design/ui-workflow-configs`; reports `/<client>/app/<app>/report`.
- Opening a designer URL directly can redirect to the root in some accounts; enter App Studio first through the app's **edit design** button (`data-testid="edit-design-button"`), then navigate.

## 8. Runtime caching and publishing

- The runtime caches app details in the browser (IndexedDB). After design changes, users must click the **refresh icon** next to the app name or sign in again.
- The details API (`/Apps/{app}/details`) returns `Menus` (already filtered by the user's role) and `AllMenus` (everything).
