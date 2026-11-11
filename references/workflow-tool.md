# Backend workflows with `scripts/workflow.js`

Use `cloudapper_run({script:'workflow', spec})` to read, create and edit backend workflows instead of one-off `ca-eval` expressions. It builds nodes from `node-templates/*.json` (`node-templates.md`) and follows the safety rules in `SKILL.md`: it never runs or triggers a workflow, never returns connector `Request` text, saves new workflows off, and reads back after every write. Full spec: `cloudapper_run({script:'help', spec:{script:'workflow'}})`.

## Actions

| Action | Spec | Returns |
|---|---|---|
| `list` | `{}` | `[{ id, name, seq, on, trigger, form }]` |
| `outline` | `{ workflow }` (AutomationId or exact name) | step tree lines `name [actionType] form`; no connector settings |
| `backup` | `{ workflow }` | the runner saves the full object to `CLOUDAPPER_BACKUP_DIR` and returns its path (the file holds connector credentials: delete it when done) |
| `create` | `{ appId, name, trigger, variables, nodes }` | new id, outline, `problems`; saved with Status 2 (off) |
| `set-assignment` | `{ appId, workflow, node, field, value }` | new ExpressionText, read-back result, backup path |
| `set-expression` | `{ appId, workflow, node, field, value, op? }` (`field` = a filter or route rule's field, or `while` / `max` of a WHILE loop) | same |
| `validate` | `{ workflows:[ids or names] }` (one kind per call) | `validate-workflows.js` findings, with the API expression check |
| `toggle` | `{ appId, workflow, on }` | Status after read-back. Changes live behaviour: only when the user asks |
| `check-run` | `{ workflow, runs? }`; add `since` and `checks:'<source>'` for record checks | last runs (status, times, failed or warned steps), or `verify-workflow-run.js` results (WP-039) |

Every write needs `appId` equal to the app open in the window (`ca.appId`) and passes the client guard, so check the environment first (`SKILL.md`).

## Expressions and refs

- Ref: `var:<name>` (workflow variable), `trigger:<field>`, `<node name>:<field>`; field = label or internal name, `Count`, or `id` (the whole record, WP-033). Node names must be unique in the workflow.
- Expression: `{ expr: '$0 + 1', args: ['var:i'] }` or `{ ref: 'Iterator:id' }`. `$n` placeholders are replaced highest index first, so `$1` never matches inside `$10`. `ExpressionText` is built from the argument labels (WP-030).
- A plain value on a record node is stored as a literal, as the designer does. A boolean target needs a boolean expression (`{ expr: '$0 == "true"', args: [..] }` or `true`), not the string `"true"`.
- Edits check the new expression with `validate-expression` before saving.
- Field types (WP-031 to WP-034, WP-061, WP-085), refused rather than guessed: a dropdown takes a plain choice key; a yes/no or switch field takes `true`/`false` or a boolean expression; a reference field is set only from a whole record (`{ ref:'<node>:id' }`, written as `<node>.<RefFormId>.<field>`), is never read as a value and never filtered on (filter a text field instead). Lookup-display and time arguments are typed text. A record node on a child form needs `parent:{ form, field }` (WP-032).
- Node names: refs and edits accept a node id as well (`outline` with `ids:true`); a name used twice must be given by id.

## Limits

- No connector nodes, and no refs to connector outputs (`<node>.<schemaId>.<field>`): edits in a sync workflow that use them fail. Edit those nodes with `node-templates.md` §3.
- `$n` is replaced everywhere in `expr`, string literals included (`Regex.Replace(.., "$1")`): such an expression is changed or refused. Build it another way.
- Tested live (2026-11, Studio 8.2.0.25): manual-trigger `create`, `set-assignment`, `backup`, `validate`, `check-run` with and without checks, read actions. Not yet live: scheduled and record triggers, `set-expression`, `toggle`; check those on the first use.
- No delete action, no workflow-level variable or trigger edits after `create`, and no true/false variable type (its codes are not known).
- The builder can still show a rule blank when the validator passes (WP-085): open new or edited nodes once in the builder.

## Create example

```js
{ action:'create', appId:'<app id>', name:'ZZ Recalc', trigger:{ type:'manual' },   // or scheduled {schedule}, created/updated {form, updatedField?}
  variables:[{ name:'i', type:'number' }],                                          // text, number, decimal, date, datetime
  nodes:[{ type:'LOOKUP_RECORDS', name:'All', form:'<Form>', limit:500, where:[{ field:'<Field>', value:'A' }], children:[
    { type:'FOREACH', name:'Each', source:'All', children:[
      { type:'ASSIGN_VARIABLES', name:'Count Up', set:{ i:{ expr:'$0 + 1', args:['var:i'] } } },
      { type:'UPDATE_RECORD', name:'Mark', form:'<Form>', id:{ ref:'Each:id' }, set:{ '<Field>':'Done' } } ] } ] }] }
```

Other node types: `LOOKUP_RECORD`, `FOREACH` `{ while, max }`, `ROUTER` with `ROUTE` children `{ rules:[{ left, op, value }] }` (every true route runs, WP-009), `CREATE_RECORD`, `TRANSFORM_RECORDS` `{ source, form, set }`, `SAVE_RECORDS` `{ source }`, `DEBUG_LOG` `{ log:[expr] }`. Connector nodes are not built here (`node-templates.md` §3). After `create`: `validate`, then open it once in the builder; the user starts any run.

Node ids are `s` + a past 13-digit epoch time with no run of five zeros (`node-templates.md` §1). Self-check of the id generator and placeholder substitution: `node scripts/workflow.selftest.mjs`.
