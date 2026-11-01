# Reviewing a CloudApper app (findings checklist)

Use this when documenting or auditing an app, to write the "Findings and recommendations" section (F-01…, severity, evidence, recommendation). Each item came up in at least one real production app. Review read-only; propose fixes, don't apply them.

## Security and secrets
- Credentials typed into REST / Get Authorization nodes, including inactive and test copies → move to the credentials store, rotate, purge old copies. Check wikis/Confluence for credential pages too.
- Public links authenticated only by a GUID (approval pages, webhooks) → accept the risk explicitly, or add expiry / sign-in.
- Visible sequential IDs used as PINs → separate, masked, admin-set PIN field.

## Environments
- UAT calling Production external tenants (or the reverse); hard-coded tenant/base URLs in N nodes → one variable per environment.
- "Prod" names in UAT, Test and Prod duplicate rows, hard-coded recipients → one test-redirect switch; agree a refresh routine and a parity checklist.

## Workflow logic
- Router routes assumed exclusive; always-true `!= A OR != B`; dead `1 = 0` branches; DEBUG_LOG nodes left in.
- Stale field references after form changes.
- Logic or lists copied into N workflows; thresholds and dates that disagree between copies.
- Business rules keyed on a person's name.
- Workflow writes the status that triggers itself; order wrong for the chain it needs (see workflow-patterns.md §1).
- Pairing records by "newest by CreateDate"; durations truncated by `DateDiffHour`.
- Before-save workflows with side effects on other records.

## Integrations and syncs
- Scheduled syncs that only CREATE (duplicates) → upsert on external ID; check record counts.
- No failure route for timeouts / empty responses; no retry; non-idempotent retry; no failed-payload store.
- Token per item or one token for a very long run.
- One API call per employee; polling more often than needed.
- No sync log (one record per run with counts and errors).
- Change detection that depends on someone running an on-demand sync → schedule it or name an owner.

## Data and UI
- Status fields users can edit by hand → read-only; change status only through buttons and workflows.
- Computed fields and back-datable timestamps editable by non-admins.
- Stored choice value ≠ label; one canonical value.
- Admin/config forms that no workflow reads → wire them up or remove them.
- Status fields never updated by any workflow.
- "Today" dashboard widgets without a date filter (all-time totals).
- Typos in halt messages and names; the same label meaning different things on different forms; "Copy" menus bound to the wrong form.

## Housekeeping
- Active test or one-off workflows (especially recurring or "Delete All") → deactivate.
- Workflows without descriptions; workflow sprawl.
- Before editing a core workflow, copy it and keep the copy inactive as a rollback; delete it later.
