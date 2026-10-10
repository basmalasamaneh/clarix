# Clarix production operations

## Do not publish until readiness exceptions are reviewed

No production deployment exists at the time of this work. Production-mode
verification used a separate disposable database, not the actual live service.
Never run test seeding, development schema push, reset, or fixture import on production.

### Required configuration (names only)

* `DATABASE_URL`: managed database location and privileged setup connection.
  Application code replaces its credentials with the restricted runtime login.
* `CLARIX_RUNTIME_PASSWORD`: runtime database login password, at least 32 characters.
* `SESSION_SECRET`: session-cookie signing secret; keep stable across instances.
* `SEED_TEST_USERS=false`: required for production setup. Production rejects test
  accounts regardless of this flag.
* `NODE_ENV=production`: production cookies and authentication guard.
* `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PRIVATE_OBJECT_DIR`,
  `PUBLIC_OBJECT_SEARCH_PATHS`: managed object-storage configuration.
* `PORT`: injected service port. Frontend `BASE_PATH=/`.
* `SEED_TEST_PASSWORD` is development/test-only; production does not require it.

Never print environment values, redirect invitation output, copy development
secrets into production, or put credentials in command arguments or source files.

## Exact first-publish order

1. Open Publishing; provision/select the production database and configure the
   production-scoped secrets above. Do not copy development data into production.
2. In a private privileged setup environment, explicitly connect `DATABASE_URL`
   to that **empty production database**, not the editor's default development
   database. Confirm the selected database before executing setup. These are
   operator-run commands, not application startup commands:

   ```
   NODE_ENV=production SEED_TEST_USERS=false pnpm --filter @workspace/api-server exec tsx src/scripts/prepare-production.ts
   NODE_ENV=production SEED_TEST_USERS=false pnpm --filter @workspace/api-server exec tsx src/scripts/configure-runtime.ts --production-setup
   ```

   The first command applies the checked-in initial schema and all tenant
   policies atomically, with a checksum and migration lock. It refuses an
   unmanaged existing schema rather than attempting destructive reconciliation.
   Reapplying the managed initial schema is supported. Future structural schema
   changes require a new reviewed migration, not editing the initial SQL.
3. Build commands are configured in each artifact: frontend production build
   (includes translation validation), API build (includes calculation worker).
   Frontend runs `node artifacts/clarix/serve.mjs`; API runs its bundled server.
   Both receive `PORT`. The frontend serves direct links and security headers;
   `/api` routes to the API service.
4. Publish through Replit's Publish action. Confirm `/api/healthz` returns only
   `{"status":"ok"}` and the startup log confirms the restricted runtime identity.
   Startup refuses unsafe tenant RLS or elevated runtime roles.
5. Obtain the **actual published HTTPS origin** from Publishing. No origin is
   assumed or constructed from the development domain.
6. In the same private privileged production setup terminal, run:

   ```
   NODE_ENV=production SEED_TEST_USERS=false pnpm --filter @workspace/api-server exec tsx src/scripts/bootstrap-production.ts --name "Your factory" --slug your-factory --email manager@example.com --origin https://YOUR-ACTUAL-PUBLISHED-HOST
   ```

   Substitute real values. This creates a factory and a hashed seven-day,
   single-use manager invitation. The URL appears once in the interactive
   terminal only; redirected output is refused. Share it privately. The script
   creates a non-login audit actor, not a hidden admin or usable account.
   Existing active managers cause refusal unless `--allow-existing-manager` is
   explicitly supplied; even that flag never resets an existing account.
   A live pending invitation cannot be silently overwritten.
7. Accept the invitation, choose a password, sign out and sign in. Check Arabic,
   English, both themes, Help, factory scoping and one small real import.
   Confirm frontend and API CSP/frame/no-sniff/referrer headers over published
   HTTPS and verify Secure/HttpOnly/SameSite=Lax cookies.

## Backup, restore and rollback

Consulted official Replit documentation:
* https://docs.replit.com/features/data-and-storage/data-recovery
* https://docs.replit.com/features/data-and-storage/development-and-production
* https://docs.replit.com/features/version-control/checkpoints-and-rollbacks
* https://docs.replit.com/build/troubleshooting

Production database point-in-time recovery retention is plan-dependent (Core
7 days; Pro/Enterprise up to 28 days per current documentation). Before a
schema/data operation, confirm the available recovery point and record the
matching code checkpoint. Restoring the database does not restore code:
select the matching checkpoint and republish compatible code. Keep privileged
setup separate from the runtime account. Test restoration away from live data
before relying on it. Object storage originals are separate from PostgreSQL;
do not assume a database restore restores or deletes uploaded files. Retain
originals and verify storage retention/recovery separately.

## Operational limits and exceptions

Sessions expire after eight hours. API mutations require CSRF tokens. Login
allows 30 failed attempts/15 minutes/IP; invite acceptance 20/15 minutes/IP;
upload creation 60/15 minutes/user. Limits are process-local; multiple instances
need a shared limiter or an edge limit before promising a global limit.

Imports: four files maximum; default 5 MiB/file, configurable up to 20 MiB/file;
total at most four times the per-file limit; 100,000 parsed rows/file. Splitting
files must preserve the source/order replacement semantics explained in Help.

Review `PHASE10_REPORT.md` for remaining release gates. Passing local checks is
not evidence that publishing, live proxy headers, backups or restores have been
performed.
