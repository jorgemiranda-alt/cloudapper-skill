### WP-??? Update many records in one API call, and add a form field by replaying the designer's own save
**Rule:** (1) To set a field on many records, `POST /api/v3/Records?records-required=true` with `{"Items":[{"TypeId":<form>,"id":<record id>,"_version_":<version>,"<field>":<value>}]}`, in batches (20 worked). Read the records first with `Records/fetch` and quote the 19-digit `_version_` before parsing, then write it back as a number. (2) To add a field to a form without dragging controls, intercept the designer's own save request, add a copy of an existing field of the same control type (new internal name, label, sequence, `StringFieldLastIndex`), then send it yourself with the raw `Version`.
**Why:** (1) The UI's own save uses this call. (2) The designer's drag and drop is unreliable from automation; a saved form body is the reliable source of a valid field definition.
**Caveats:** After (2) the runtime may not show the field until the app is reloaded with the Reload App icon (see platform notes on caching). Send the replayed save through a frame without your interceptor, or the interceptor swallows it. Check the client ID in the page URL before writing.
**Status:** Hypothesis · checked 2026-11 · Studio 8.2.0.25 · Evidence: 106 records updated in 6 calls and read back; a choice field added to a form and shown after an app reload.

<!-- Review notes, not copied into the skill -->
- How to reproduce: (1) update one text field on 3 records and read them back. (2) Add a text field with the captured save and look for it in the app details and, after Reload App, on the record form. Wrong if a rounded `_version_` is accepted, or the field never shows after reload.
- Conflicts checked: none found. (Belongs in `api-reference.md` once verified.)
- Captured by: JM, from a session on 2026-11-01
