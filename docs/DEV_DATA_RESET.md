# Isolated tests and development resets

## Run tests without changing manual-test data

Run `pnpm test` at the project root. API/auth/tenancy tests run in a unique,
disposable `clarix_test_*` PostgreSQL schema with a non-superuser, non-BYPASSRLS
owner and their own seeded accounts, sessions and preferences. All tables,
foreign keys, policies and triggers are reproduced there; the test search path
contains no public fallback. Direct database-test execution refuses without
the isolated harness. Engine/Python fixture checks remain read-only.

Uploads use a unique `__tests/<schema>/` storage prefix. The harness removes
only that run's objects and database schema/role on success or failure.
SIGINT/SIGTERM terminate owned child processes and enter cleanup. A hard OS kill,
machine failure or storage outage can interrupt cleanup; never bulk-delete
unknown prefixes/schemas to recover.

During database verification, a shared lock temporarily blocks writes to the
development tables. This prevents normal browser session updates from invalidating
the before/after proof. Close manual testing while the suite runs; the app can
wait until the run ends. Test connections have a finite lock timeout.
Counts and whole-row fingerprints are recorded in
`generated-artifacts/test-isolation/latest.json`, without row contents or secrets.
Database roles/grants are fingerprinted too.
The observer explicitly requires superuser/BYPASSRLS privilege and uses
`row_security=off` so a filtered query fails rather than returning misleading
empty fingerprints. Regression checks prove observation of nonempty FORCE-RLS
test tables and rejection of an unprivileged observer.

Optional browser checks use separate API/Vite ports, not the running dev app:

```sh
pnpm --filter @workspace/api-server exec tsx src/scripts/test-isolated.ts --browser scripts/source-check-browser.cjs
```

The browser harness seeds its own API fixtures before the check. Legacy scripts
cannot default to localhost:80. The obsolete dev-user inventory/archiving script
is disabled. No manual dev accounts are used by automated verification.

## Permanently reset ONE development factory

**This deletes imported data permanently. It is not reversible source archiving.**
From the project root:

```sh
pnpm dev:reset-factory -- --factory ethmar --confirm ethmar
pnpm dev:reset-factory -- --factory najm --confirm najm
```

Every invocation requires:

- Nonproduction `NODE_ENV`, and no published-deployment flag.
- `SEED_TEST_USERS=true`, already configured for development.
- An explicit existing factory identifier and matching explicit confirmation.
- The privileged table-owner setup connection; runtime/identity roles refuse.

The command never changes users, memberships, sessions, database roles or fixture
files. It preserves factory records and all their fields **except the two settings
keys the user explicitly approved clearing: `sourceArchives` and
`sourceArchiveEvents`**. This lets previously archived source names be reused.

It deletes the selected factory's imports, raw rows, current orders/records/events,
issues, mappings and three superseded-history tables. Sources have no separate
table: their names are derived from imports/mappings; resetting those and archive
metadata empties the source list. No uploaded objects belonging to real dev users
are deleted by this database reset; original files may remain in App Storage.

Cleanup is one transaction with table locks, scoped deletes, temporary owner-only
immutable-trigger suspension and restoration before commit. Failure rolls back
data and protection changes. Normal app connections cannot see weakened guards.
There is no delete endpoint, UI button, persistent bypass setting or new app grant.
Each run prints before/after table counts and fingerprints, confirms the other
factories stayed unchanged, and checks protected data.
