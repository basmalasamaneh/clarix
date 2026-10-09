# Phase 2 — canonical schema and tenancy

## Scope

Seven canonical tables only: imports, raw_rows, column_mappings, orders,
production_records, events, data_issues. No upload/parser, quality engine,
calculation engine, UI, snapshots or invitation features.

## Mandatory data-access boundary

Request handlers must use `withRequestTenant(req, callback)` from the API's
tenancy module for canonical reads and writes. It takes identity and selected
factory only from the server session and revalidates the current membership
and active factory in PostgreSQL. Never pass a body, header or route factory ID
as the scope of a query. Such IDs may only be checked against the session scope.

`withTenant(userId, factoryId, callback)` is its shared implementation for trusted
server-side callers. Empty context is rejected before the callback runs.
Transaction-local settings are cleared on commit or rollback. Do not return a
connection from the callback, run detached promises or manually change its role
or tenant settings. Background jobs must revalidate the initiating identity's
membership through this same boundary.

Canonical code must not import the privileged `db`/`pool` exports. Those remain
for global authentication/session storage and explicit schema/seed operations.
The identity-discovery pool can read only the signed-in user's memberships and
factory names; it has no grants on canonical tables.

## Connection and RLS model

The existing DATABASE_URL login credential establishes connections. The tenant
pool sets `role=clarix_runtime` as a PostgreSQL connection startup option, so
its **effective query role** is non-owner, non-superuser and NOBYPASSRLS before
any query. The separate discovery pool starts as `clarix_identity`.

The connection's `session_user` is still the database login identity; this is
not a claim that the authentication/migration credential itself is unprivileged.
Trusted application code must not reset the role. The boundary protects tenant
queries and accidental missing filters, not malicious arbitrary SQL execution
using the administrative credential.

All seven canonical tables have ENABLE and FORCE RLS. Read policies require
both factory context and matching current-user membership in an active factory.
Write policies additionally require Factory Manager or Analyst. Platform Admin
has no seeded membership and no default production access. Viewer cannot write.
Future operation-specific authorization still belongs on the server.

Composite foreign keys include factory IDs (and source where applicable),
preventing a row in one factory from referencing another's import, mapping,
order or raw row. An integrity trigger checks every data-issue raw-row reference
against its factory and import. These are structural integrity checks, not
the later-phase data-quality rules.

## Storage decisions

- Internal UUIDs are separate from source IDs. Orders, records and events use
  unique `(factory_id, source_name, external_id)` keys.
- Content hashes are unique per factory, even across source names. A future
  uploader must report DUPLICATE_FILE rather than silently discard the attempt.
- Raw rows preserve JSON cells, file name and physical line number; database
  triggers reject UPDATE/DELETE even by the owner, and reject TRUNCATE. Runtime
  roles receive no TRUNCATE privilege. No cascading raw-row deletion is allowed.
- Canonical source IDs are unique; all original duplicate/conflicting input rows
  remain representable in immutable raw_rows. Later quality processing must
  inspect those raw copies before canonical insertion; it must never overwrite
  a conflicting canonical record.
- Unconstrained PostgreSQL numeric preserves exact decimal values without a
  hard-coded precision/scale or zero defaults. pg/Drizzle return decimal strings.
  Missing quantity, duration and optional metadata remain NULL.
- Event start/end timestamps are plant-local and naive. Missing/invalid business
  values can be represented for future quality handling; no metric rules run.
- Filter indexes start with factory_id. Import filtering for records/events
  follows their indexed raw_row_id to raw_rows' factory/import index, avoiding
  redundant import ownership columns.
- Mapping JSON is versioned per factory/source; no per-factory code branches.

## Setup and reproducible checks

Development schema: `pnpm --filter @workspace/db run push`

Policies/triggers: `pnpm --filter @workspace/api-server run setup:rls`

Apply both through `scripts/post-merge.sh`; never run DDL on app startup.
Production schema/role/policy installation must be verified through the
publishing flow before deployment; this phase did not publish the project.

Tests: `pnpm --filter @workspace/api-server test`

Non-bypass owner seed regression: `pnpm --filter @workspace/api-server run test:clean-seed`

Role/ownership evidence: `pnpm --filter @workspace/api-server run inspect:tenancy`

Canonical tests insert synthetic identities/factories/rows into a single
transaction, switch to clarix_runtime for checks, and roll everything back.
They do not import or modify any golden-set file. T8 checks populated tables,
not just empty tables. Tests also cover both directions of cross-factory
read/update/delete, forged inserts, foreign references, viewer writes,
immutability and exact decimals.

No UI changes were made, so the screen/viewport/theme/language matrix does not
apply to this phase.
