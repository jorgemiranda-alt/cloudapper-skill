# External-system calls with `scripts/integration.js`

Use `cloudapper_run({script:'integration', spec})` to call UKG, Odoo or another REST API with the settings stored in the app's config record, instead of writing `page.request` code inline. The runner reads the config record in the page and makes the HTTP calls on the Node side (no CORS). The token and the credentials never enter the result, and every config value the spec uses plus the token are scrubbed from the output. Full spec: `cloudapper_run({script:'help', spec:{script:'integration'}})`.

## Rules it enforces

- Credentials come only from the config record (`{{c.<field label>}}`); never type them into the spec.
- The URL host must appear in a config value (the base URL field). Another host is refused unless the user confirmed it (`allowHost`).
- GET is a read. A POST needs `effect:'read'` (multi_read, search) or `effect:'write'`; PUT, PATCH and DELETE need `effect:'write'`. Use `write` only when the user asked to change the external system, and say which environment it is (a UAT app may call a UAT tenant, or not: `integrations-ukg.md`).
- Without `rows` or `pick` it returns only the response's shape (keys, types, array lengths): look at the shape first, then ask for the fields you need.

## Example (UKG Pro WFM, OAuth client credentials)

```js
{ config:{ form:'<Config form>' },
  token:{ url:'{{c.Auth URL}}/oauth/token', form:{ grant_type:'client_credentials', client_id:'{{c.Client ID}}',
          client_secret:'{{c.Client Secret}}', audience:'https://wfm.ukg.net/api', organization:'{{c.Organization ID}}' } },
  request:{ url:'{{c.Host URL}}/api/v1/commons/symbolicperiod', headers:{ Authorization:'Bearer {{token}}' } },
  rows:'[*]', fields:['symbolicId', 'name'], max:3 }
// POST reads (multi_read, hyperfind/execute) add method:'POST', json:{..}, effect:'read'.
```

Field labels, the grant (client credentials or password, with `appkey` on older tenants) and the token path differ per tenant: read the config form's labels first (`ca.fields('<Config form>')`, labels only), and take the token call's shape from the app's own token connector (method, path and body key names only, never its `Request` text). An empty config field used in the spec is refused by name. Basic auth (UKG Pro HR core): `basic:['{{c.User}}', '{{c.Password}}']` and header `Authorization:'Basic {{basic}}'`.

## Limits

- One token call and one request per call; no paging loop (call again with the next page).
- JSON responses only; other content returns its type and length.
- Self-check of the template filler, path picker, shape and scrubber: `node scripts/integration.selftest.mjs`.
