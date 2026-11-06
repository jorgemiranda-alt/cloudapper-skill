# Driving CloudApper with the Playwright MCP without wasting tokens

## Contents
1. Principles
2. Run code from files, return summaries
3. Localhost helpers for big payloads and saving files
4. Capture a designer save (read-only) and save-swap (write)
5. Waiting, screenshots, drag-and-drop
6. Things that waste tokens

## 1. Principles

- The browser is only a **logged-in context**. Do the work with `fetch` inside `page.evaluate` against the APIs; click only when no API is known or to show the user something.
- Every tool result is paid for twice (it lands in context and stays there). Return **counts, names, statuses and timestamps**, never full JSON, HTML or snapshots. **No `browser_snapshot` in App Studio**; read with `page.evaluate` that returns a few fields. Screenshots only to confirm visuals, at half scale (`browser_take_screenshot` of an element or clip, or `page.screenshot({ scale: 'css' })` after `setViewportSize` at half size).
- Turn off the automatic snapshot after each action: set `PLAYWRIGHT_MCP_SNAPSHOT_MODE=none` in the `env` block of the user's `~/.claude/settings.json` (Playwright MCP 0.0.84+ reads it; `--snapshot-mode none` is the flag form). Takes effect when the MCP server restarts.
- Check the client ID in `page.url()` at the top of every write script and refuse to run on the wrong environment.

## 2. Run code from files, return summaries

- Write scripts to the project (e.g. `.playwright-mcp/<task>.js`) and run them with `browser_run_code_unsafe` + `filename`. The code is not echoed back as a big parameter, the script is reusable, and the user can review it.
- The tool *does* echo the executed code in its result, so keep large data out of the script body: load it at run time (section 3) instead of embedding it.
- Shape: `async (page) => { ...; return { ok, counts, problems } }`. There is no `require`/`fs` inside run_code.
- Poll long processes inside one call (`for (...) { check(); await page.waitForTimeout(45000) }`, break on done) instead of many small calls.

## 3. Localhost helpers for big payloads and saving files

- **Serve** payload files to the browser: `python -I -m http.server 8765 --bind 127.0.0.1` in the folder, then `await (await page.request.get('http://127.0.0.1:8765/body.json')).json()` (Node side, so no CORS).
- **Save** from the browser to disk: a tiny Python `do_PUT` server bound to 127.0.0.1 that writes `<dir>/<basename>`; `await page.request.put('http://127.0.0.1:8766/name.json', { data: buffer })`. Use it for backups and report packages.
- Bind to 127.0.0.1 only, run in the background, stop both when done, and delete folders holding secrets at the end (tell the user what remains).
- **Run the skill's page scripts without echoing them.** `scripts/save_server.py` also serves the skill's `scripts/*.js` by GET. Start it (`python -I scripts/save_server.py <project>/app-export/<app> 8766`, Windows path) and use this loader as `browser_run_code` code; the chrome page's own fetch to localhost fails, so everything local goes through `page.request`:
  ```js
  async (page) => { const S = 'http://127.0.0.1:8766/';
    const run = async (file, opts) => { const src = await (await page.request.get(S + file)).text();
      return page.evaluate(([s, o]) => { if (typeof o.checks === 'string') o.checks = (0, eval)(o.checks);
        globalThis.CAE_OPTIONS = o; return (0, eval)('(async () => {' + s.replace(/await (\w+)\(globalThis\.\w+( \|\| \{\})?\);\s*$/, 'return await $1(globalThis.CAE_OPTIONS);') + '})()'); }, [src, opts]); };
    return await run('record-count.js', {}); }
  ```
  Options travel as JSON, so pass a function option (the verifier's `checks`) as a source string: `checks: 'async ({ records, eq, check }) => { ... }'`.
  Freshness check first: `run('export-app.js', { since: (await (await page.request.get(S + 'app.json')).json()).fingerprint })` (the save server serves the export's `app.json`). For `export-app.js`, after `run` add `for (const [n, d] of Object.entries(await page.evaluate(() => globalThis.__caeFiles))) await page.request.put(S + encodeURIComponent(n), { data: JSON.stringify(d, null, 1) });`.
- **Read-only question scripts** (run with the loader, return names and counts only):

  | Question | Script / file |
  |---|---|
  | One-line API calls (records, workflows, runs) | `ca.js` with `{}` once per page, then `ca.<helper>` from `browser_evaluate` (below) |
| Which forms and workflow nodes use field X | `find-field.js` with `{ field: '<label or internal name>' }` |
  | One workflow's steps | the export's `wf__<seq>__<name>.json` (WP-045); no browser call |
  | Records per form | `record-count.js` with `{}` or `{ forms: ['<title>'] }` |
  | What triggers or writes form X | `graphify query` on the export's `graph.json` |
  | Broken nodes in the builder | `validate-workflows.js` (WP-038) with `{ sequences: [..] }` or `{ names: [..] }` |
  | Did a run do the right thing | `verify-workflow-run.js` (WP-039) with `{ chain, since, checks: '<source>' }` |

- **`ca.js` helpers** (installed on `window.ca`, lost on reload; the helper returns its names):

  | Call | Returns |
  |---|---|
  | `ca.find(form, r => cond, ['field', ..], max)` | matching records, only `id` + the fields named (form = title or id) |
  | `ca.count(form, r => cond?)` | a number |
  | `ca.setClient(id)` then `ca.save(form, [{id, _version_, field: v}])` | `[{id, status}]`; status 2 = rejected (WP-070) |
  | `ca.forms()`, `ca.fields(form)` | ids and titles, field names and types |
  | `ca.wfList()`, `w = await ca.wfGet(name)`, `ca.wfSteps(w)`, `ca.wfPut(w)` | summary, full object (keep in a variable), step outline, save |
  | `ca.validate(expr)`, `ca.lastRun(name)` | validator result; last run status and failed steps only |

  Keep big objects inside the page (`window.w = await ca.wfGet(..)`) and return only the part you need.
- **Integration systems (UKG and others):** call them in `browser_run_code` with `page.request` (Node side, no CORS). Read connection settings from the app's config record with `page.evaluate(() => ca.find(..))` inside the same code, get a token, call the endpoint and return only filtered fields. Never return the token, the password or the client secret.

## 4. Capture a designer save (read-only) and save-swap (write)

- **Capture** the exact body the designer would send: route `**/<designapi-host>/**`, keep `postData()` of `SaveEntityType`, `route.abort()` everything non-GET, open the form designer, click the Save icon (top right, ~`(1360, 27)` at 1920×1080). Nothing is saved.
- **Save-swap** to write a form body you built: open a harmless host form's designer (e.g. Location), route `**/EntityType/SaveEntityType`, and in the handler **check that the original body's `EntityTypeID` is the host form** (otherwise abort), then `route.fetch({ postData: JSON.stringify(newBody) })` and `route.fulfill`. Uses the designer's own auth and headers. After saving, the designer navigates to the forms list: reopen the host before the next save.
- For updates fetch the live `Version` first (details API) and set it on the body.

## 5. Waiting, screenshots, drag-and-drop

- Wait for data, not time: e.g. text `record(s)` on lists, then confirm no visible loading overlay (`[role=status][aria-label=Loading]`, `.dx-loadpanel-content`, skeletons, "preparing your app environment") before screenshots. Test only visible elements; a hidden loader stays in the DOM.
- Set the viewport to 1920×1080 before screenshot batches; `page.goto` resets injected helpers.
- Form designer uses smooth-dnd: Playwright `dragTo` fails; use mouse down + ~30 small moves + up, retry until the field count rises.
- Text that appears in many hidden dropdowns (e.g. "Delete This Form") makes locators ambiguous; `:visible` does not help with those menus. Screenshot a clipped area and click by coordinates, guarded by a route check.
- DevExtreme context menus: read `.dx-submenu` / `.dx-context-menu` text to list menu items.

## 6. Things that waste tokens

- Dumping workflow JSON or full records into the conversation (also leaks secrets): print node names/types/forms instead.
- Re-exploring the app each session: use the references in this skill and the project's docs.
- Screenshots to read data: read via API; screenshot only to show the user or verify layout.
- Retrying a failing approach blindly: read the execution log/network response first.
