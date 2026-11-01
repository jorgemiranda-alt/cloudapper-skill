### WP-??? Response fields written into a REST connector through the API are not registered
**Rule:** Don't build a connector's expected response fields by editing its JSON through the API and then mapping them. Open the node in the designer, click Validate, then Done, and Save the workflow, and check that the expression editor lists the response fields before wiring mappings, routes or debug logs to them.
**Why:** With API-written fields, the expression editor listed only the system fields (Count, Request, Response Code), and anything pointing at the others failed with "Unknown identifier" or "Unable to extract value".
**Caveats:** Validate calls the external service with the node's credentials: let the owner run it, with test values and a non-production tenant. Unconfirmed: after one Validate the saved field list had not changed, so check whether Validate really generates the list from a response or only checks the request.
**Status:** Hypothesis · checked 2026-11 · Studio 8.2.0.25 · Evidence: one UAT workflow; editor showed system fields only; effect of Validate on the saved list not confirmed.

<!-- Review notes, not copied into the skill -->
- How to reproduce: add a REST node, write 3 response field paths into its saved spec through the workflow API, open the expression editor on a later node and look for them. Then click Validate with a real response and compare the saved field list. Wrong if the API-written fields do show up and resolve at run time.
- Conflicts checked: WP-021, WP-023: consistent.
- Captured by: JM, from a session on 2026-11-01
