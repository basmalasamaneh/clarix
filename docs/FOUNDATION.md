# Clarix foundation

Only Phase 1 is implemented. The operational pages are deliberately empty.

## Development test identities

These accounts are created by `pnpm --filter @workspace/api-server run seed:test`:

| Email | Role | Factory |
|---|---|---|
| platform.admin@clarix.test | Platform Admin | No production memberships |
| ethmar.manager@clarix.test | Factory Manager | Ethmar Plastics |
| ethmar.analyst@clarix.test | Analyst | Ethmar Plastics |
| ethmar.viewer@clarix.test | Viewer | Ethmar Plastics |
| najm.manager@clarix.test | Factory Manager | Najm Packaging only |

The password is the value **you set in Replit Secrets as `SEED_TEST_PASSWORD`**.
It is never printed, hard-coded or written to a file; the database holds Argon2id
hashes only. The seed command requires `SEED_TEST_USERS=true`, a non-production
environment, and a password of at least 12 characters. Existing accounts are
not silently reset when re-seeding. Changing the secret alone does not change
an already-created account's password.

Both `NODE_ENV=production` and `REPLIT_DEPLOYMENT=1` prohibit test seeding.
Production authentication also rejects any user marked as a test account,
even if development data has been copied into production.

Managed authentication was not selected because a supported way of provisioning
all five independent usable identities was not verified. The creator explicitly
approved email/password as the fallback.

## Security boundaries

- PostgreSQL-backed opaque sessions, eight-hour absolute expiration, rotation on
  login, server-side invalidation on logout, HttpOnly/SameSite cookies and Secure
  cookies in production.
- CSRF synchronizer tokens are required for all API mutations, including login.
- Password login is rate limited. Request bodies, cookies and passwords are not
  logged. Authentication events log only an internal user identifier.
- Factory and membership reads always use parameterized queries and transaction-
  local database roles and context. The tenant runtime role has no owner or
  RLS-bypass privileges; missing factory context denies all tenant rows.
- A separate, read-only identity-discovery role can list only the signed-in
  user's memberships and corresponding factory names. It has no access to
  production tables. This is necessary to offer a permitted factory selector.
- Global users and sessions are not tenant-owned: a person may hold memberships
  in multiple factories. Only the authentication boundary uses the privileged
  connection for those records; personal preference writes use the session's
  user identifier, never a submitted user identifier.
- Platform admins receive no production permissions by default. The future
  time-limited permission-grant workflow is not implemented.

## Development setup and verification

Schema: `pnpm --filter @workspace/db run push`

RLS setup: `pnpm --filter @workspace/api-server run setup:rls`

Tests: `pnpm --filter @workspace/api-server test`

Clean restricted-owner seed and login verification:
`pnpm --filter @workspace/api-server run test:clean-seed`

This creates and removes an isolated verification schema and non-bypass owner,
leaves existing accounts untouched, and checks all five logins with RLS active.

Types: `pnpm run typecheck`

Fixture integrity/reference checks: `python3 tools/verify.py`

The post-merge script performs development schema/RLS setup and conditionally
seeds only when the explicit seed flag is enabled. None of these operations
grant writes to the tenant runtime roles. The guarded seed transaction temporarily
removes FORCE RLS for the table owner only, while RLS remains enabled for tenant
roles, then restores FORCE before committing. Transactional DDL locks prevent
other sessions from observing the temporary owner exemption. None of these operations
run on application startup. Production schema changes use Replit's publishing
flow; production role/policy availability must be verified before real users
are onboarded. There is no public registration or production account
provisioning interface in this phase.

The foundation integration tests perform actual email/password API logins for
all five identities, exercise permissions and factory isolation, and check
session invalidation, preferences and RLS. Tests for raw rows, imports, runs,
snapshots and exports remain deferred until those features exist.
