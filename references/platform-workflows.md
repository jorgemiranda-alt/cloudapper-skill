# CloudApper platform: UI and backend workflows

Tenants, clusters, IDs and caching: `platform-model.md`. Forms, menus, roles, reports: `platform-data.md`. Patterns and gotchas: `wp-index.md`.

## 5. UI workflows vs backend workflows

- **UI workflows** run in the browser (open a form to add a child record, search by PIN, show a message). They live in **Settings → UI Workflow Configuration** as one JSON list per app (IDs are free text, e.g. `9e5abdf8-...-4521u`). Example: `{Id, Title, Action:{ActionType:"ADD_NEW_RECORD", ActionFormTypeIds:[childFormId], ActionFormAttributes:[{Field:"Parent", FieldValue:"_triggerForm"}]}, Trigger:{TriggerOn:"ON_DEMAND", TriggerFrequency:"EVERY_TIME", TriggerFormTypeId:parentFormId}}`. A form button with ActivityType 4 points to it.
- **Backend workflows** ("AI Agents & Automation" in App Studio) run on the server.

## 6. Backend workflows: triggers, nodes, expressions

- Top-level fields: `Name`, `Status` (**1 = on, 2 = off**), `TriggerType` (2 = record event, 3 = schedule with Quartz cron in `ScheduleExpression`, 4 = on demand, 8 = webhook), `TriggeredOn` (1 = created, 2 = updated, 4 = created or updated), `TypeId` (form), `TriggerRuleset` (also copied in `root.data.triggerRuleset`), `Sequence` (order), `Version` (big int).
- `AutomationConfiguration.root` is a tree of nodes `{id, type, data, children}`. Children of a node run in order; a sibling placed after a FOREACH runs after the loop.
- Node `actionType`s seen: TRIGGER, ASSIGN_VARIABLES, LOOKUP_RECORD (one), LOOKUP_RECORDS (many, `filterMaxRowCount`, `filterSorting`), FOREACH (`sourceNodeId`), ROUTER + ROUTE (conditions), CREATE_RECORD, UPDATE_RECORD (`ruleSet` selects the record), DELETE_RECORDS, SAVE_RECORDS, TRANSFORM_RECORDS, CONNECTOR (REST, email, UKG, Toast; holds credentials), DEBUG_LOG.
- Field references in values use `{Expression:"__argN__", Arguments:[{Name, Field, FieldNodeId, NodeId, TypeId, ControlType, DataType, Label}]}`. `FieldNodeId` is `<nodeId>.<field>`, or `<nodeId>.<referencedFormId>.<field>` for reference fields; `id` uses just the node ID; the trigger record is `__TRIGGERRECORD`.
- Operators: `=`, `<`, `>`, `contains`, `isEmpty`, `isNotEmpty`, `in range` (`Value:{Start, Stop}`), `_IsUpdated` (trigger rule: field changed).
- Expressions are C#-like: `UtcNow( )`, `Now( )`, `AddMinutes(d, n)`, `AddDays(d, n)`, `AddHours`, `DateDiffMinute`, `IsNull(x) ? a : b`, `x.ToString("yyyy-MM-dd")`, `DateTime.Parse`, `Guid.NewGuid()`, `Split`, `Math.Round`, `ConvertFromUTCDateTime(d, tz)`.
- Global variables: `GlobalVariables.Fields` with a schema ID referenced as `TypeId` in ASSIGN_VARIABLES.
- Execution log per workflow: status 1 = success, 2 = failed/partial, 3 = still running ("Your task is now underway").

## More details (learned from several production apps)

V = verified in those apps, I = inferred. Check I items in the JSON before relying on them.

**Triggers and timing**
- Trigger names in the designer: "Before <form> On Create/Edit" (runs before the save; a **Halt Operation with a Message** / Validator connector blocks the save and shows the message), "After <form> On ...", "After Async <form> On Create Or Update / On Edit", "On Delete", Incoming Webhook, schedule, and on demand (the list shows trigger "Demand"). V
- In a **Before-edit** trigger the trigger record holds the **new** values; a Lookup of the same record returns the stored **old** values. That is the way to compare old vs new. V
- Before-save side effects are **not transactional**: if the workflow updates other records and the trigger record then fails to save, those updates stay. I
- No record locking: read-then-update in a workflow can race when two users submit at once. I
- The designer shows schedules in local time but cron runs in **UTC**. Examples: `0 0 0/4 1/1 * ?` (every 4 h), `0 0 0/12 1/1 * ?` (every 12 h). V

**Nodes and connectors**
- Designer name → actionType: Set Variables / Update Variable → ASSIGN_VARIABLES; Logic Path → ROUTER; Iterator → FOREACH (also a WHILE mode with a max-iteration cap); Transform → TRANSFORM_RECORDS; Save Records → SAVE_RECORDS (upsert of transformed rows); Fetch Records → LOOKUP_RECORDS. Names V, mapping I.
- Also seen: Extract (parse JSON from a response or webhook body), Return JSON (webhook response), Delay, DEBUG_LOG. V
- Connectors seen: REST API Connector v2.0, Get Authorization / Token Generator (each node stores its own credentials), Generate Report, Upload File (S3), Halt Operation, Delay, Email Notification (Extended v3.5), UKG "Workforce Dimension" (WFD Employee Details Sync). V
- **A Router runs every route whose condition is true**, not only the first. For one outcome, make conditions exclusive (or order widest-first and guard later routes with `isEmpty` on what an earlier route created). V
- **Workflow expressions are not report expressions:** in workflows `IsNull(x)` takes ONE argument and returns true/false (`IsNull(x) ? 0 : x`); the report form `IsNull(x, 0)` fails with "Could not prepare values for the fields: <var>" (the step's other fields still save). Initialise workflow variables at the start instead. V
- Expressions: `DateDiffHour(a,b)` returns whole hours (truncates), `DateDiffMinute`, `Math.Floor`, `Math.Ceiling`, regex extraction inside Transform mappings. V
- A credentials store exists and is recommended over literal secrets in connector nodes. I
- Webhook triggers get a unique access URL; a static page (e.g. hosted under `www.cloudapper.ai/app_files/<client>/`) can post to it. V/I

**UI workflows (more triggers)**
- ON_LOAD on a create screen: ask for a PIN, fetch the master record, set it as parent and pre-fill fields. ON_LOAD on a list menu: ask for a PIN, filter the list to `ParentId = <fetched>.id`. AFTER_CREATE "skip view" skips the details page after save (kiosks). V
