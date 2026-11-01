# UKG integrations from CloudApper

UKG endpoint families used from CloudApper REST connector nodes. Credentials live in each Get Authorization / REST node: never print them; mask them in any dump.

Hosts and tenants differ per customer and per environment (check whether a UAT app calls a UAT tenant). Never assume the host from another project; read it from the connector or ask.

## UKG Pro WFM (Workforce Management / Dimensions)

- Token: `POST /oauth/token`, audience `https://wfm.ukg.net/api`. One token per run or batch.
- `POST commons/persons/extensions/multi_read` (batch employee reads)
- `GET commons/pay_period`
- `GET` / `POST timekeeping/timecard` (read timecard, post paycode edits)
- `GET setup/paycodes`, `GET` (v2) `setup/accrual_profiles`, `POST setup/accrual_policies/multi_read`
- CloudApper also offers a UKG "Workforce Dimension" connector (employee details sync).

## UKG Pro (HR core)

- Auth: basic auth + customer API key (host per data centre, e.g. a `service<N>.ultipro.<tld>` host).
- `personnel/v1/employment-details` (filter `dateTimeChanged` for incremental), `employee-demographic-details`
- `companies/{co}/employees/{ee}/user-defined-fields`
- `platform-configuration-fields/class-name/Employment`
- `configuration/v2/jobs`, `configuration/v1/locations | org-levels | company-details`

## UKG Pro Recruiting

- Token: `<signin host>/signin/oauth2/t/<tenant>/access_token`
- Base `/talent/recruiting/v2/<tenant>/api/`: `opportunities`, `candidates`, `applications`, `applications/{id}/documents[/{doc}/download]`, `recruiting-processes`, `physical-locations/{id}`
- Paging `page` + `per_page`; incremental pulls with `updated_after`.

## UKG HRSD (document upload)

- `POST /api/v2/client/tokens` → `POST /document` → on 201 `POST /company_documents`
- Lookups: `GET company_folders`, `GET company_document_types`

## Advice

- Avoid one API call per employee: batch (`multi_read`) and pull incrementally (`dateTimeChanged`, `updated_after`).
- Every call needs a failure route that writes status and reason; keep failed payloads for resend (workflow-patterns.md §5).
- Put the tenant/base URL in one setting so promotion between UAT and Production is one change (architecture.md §5).
- For other vendors, follow the same shape: token per run, batch, incremental, upsert, failure route.
