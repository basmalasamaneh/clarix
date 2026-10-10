# Production gate implementation

## Decision and options

Chosen: a separate security-only production launcher plus a deployment-token
invitation using the existing acceptance page. Replit Publish owns table schema
migrations. This is not a schema-push build hook or an owner-powered HTTP server.

Alternative: a new public token-gated setup page. Rejected because it adds an
unauthenticated endpoint and duplicates invitation acceptance.

Alternative: manual privileged provisioning and bootstrap. Rejected because it
does not meet the requested Replit-UI-only operation.

No manager password is ever supplied as a secret. The user supplies a random
invitation token; SHA-256 of that exact token is stored, enabling the requested
`/invite/<token>` path. The nullable invitation creator is the minimum schema
change needed to leave the user table genuinely empty before acceptance.

## Repeat, failure and attacker behavior

Role/policy setup is transactional and repeatable; failures roll back before
HTTP starts. A global advisory lock serializes setup and initial acceptance.
An existing initial-invitation row is the durable once-only marker. Repeat starts
do not change its hash or expiration; any existing user disables initialization.
Acceptance atomically creates the manager/membership and consumes the invitation.
Concurrent/replayed acceptance cannot create another manager.

The isolated tests use a real separate PostgreSQL cluster: the configured owner
has table ownership and CREATEROLE, not SUPERUSER or BYPASSRLS. Runtime is a direct
SCRAM-authenticated login with no role/database creation, ownership or RLS bypass.
Unexpected role memberships or missing tenant/immutability protections fail closed.

An attacker holding the initial token before acceptance can claim the initial
manager account: protect it like a password until consumed. The token does not
grant database owner privileges. After acceptance or expiry it cannot be used.
Ordinary unauthenticated requests cannot invoke provisioning. A deployment-secret
or host administrator remains trusted; SQL RLS cannot protect against that owner.
Rerunning with a different token does not silently rotate the original invitation.

## Evidence

Verification completed: full isolated suite **87/87**, Python verifier **52/52**,
preference unit tests **2/2**, both TypeScript checks, API production build and
the **8-check** fresh-cluster production proof. Existing storage-SDK listener
warnings remain in full-suite output; they were not suppressed.

Development factory data (excluding global users/sessions in these aggregates,
which are checked separately in the JSON evidence):

| Factory | Rows before → after | Aggregate SHA-256 before = after |
|---|---|---|
| Ethmar | 90 → 90 | `7339fa7762814ee812a49634a7665f15137bf9465950292d6f5ad05447e8a366` |
| Najm | 24 → 24 | `1702ddcaef55972f88a635a9e290a16e9493ba3a5fe6942049e23034253ad50f` |

Aggregate hashes use sorted, compact JSON of each factory's per-table count/hash
entries. The evidence includes each table's full before/after fingerprints.

* `generated-artifacts/phase10/deployment-gate.json`: isolated production entrypoint
  and HTTP acceptance proof, role/RLS/immutability checks, rollback/retry,
  repeat setup, five seeded-email rejections, before/after factory fingerprints.
* `generated-artifacts/phase10/gate-suite-isolation.json`: full suite isolation.
* No calculation, fixture or tools changes.
* No new frontend screen or new public route. The existing invitation UI is reused.

## Sandbox boundary

The mockup-sandbox artifact declares only a development service, no production
service. Clarix's frontend and API production entrypoints do not import the sandbox
plugin or fast-glob. Thus no sandbox server is configured for publishing. This
does not prove that every development dependency byte is absent from the platform
build snapshot; the residual braces advisory remains a development-tool finding.
Actual published routing/image contents were not inspected because publishing
was explicitly prohibited.

## Not verified on a real deployment

The managed production owner's exact role-management privileges; Publish's real
schema synchronization; platform proxy access-log handling of invitation URLs;
actual HTTPS cookies/headers and storage access; restore rehearsal; the previously
outstanding browser matrix. App-controlled logs are sanitized and tested, but the
platform's proxy logging cannot be certified from a local test.

No publishing occurred. No token or password was requested, read back or printed.
Development schema changed only to allow an absent creator on the first
invitation; tenant data is verified separately by before/after fingerprints.
