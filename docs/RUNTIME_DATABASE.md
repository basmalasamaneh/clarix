# Runtime database identity

The application authenticates directly as `clarix_runtime`, using
`CLARIX_RUNTIME_PASSWORD`. The managed `DATABASE_URL` supplies the database
location/TLS options only; its owner identity/password are replaced before
opening an application connection.

Startup checks `session_user` and `current_user` and rejects a superuser,
RLS-bypass role, database creator or role creator. The runtime login owns no
application tables. Authentication/session storage have explicit grants.
Identity discovery and account management select restricted subordinate
NOLOGIN roles, not an owner/superuser. Every such connection still authenticates
as `clarix_runtime`. This is not privileged authentication followed by SET ROLE.

Only development/setup/test-fixture scripts import `@workspace/db/admin`.
That module refuses production. Normal API modules must never import it.
All tenant context is transaction-local and comes from the authenticated
membership, never a request's factory_id.

## Development provisioning and rotation
1. Set a unique random `CLARIX_RUNTIME_PASSWORD` of at least 32 characters using
   the project's secure secret editor. Do not reuse an account password.
2. Run the development schema/grant setup:
   `pnpm --filter @workspace/api-server run setup:rls`.
3. Run
   `pnpm --filter @workspace/api-server exec tsx src/scripts/configure-runtime.ts`.
   It reads the secret internally, generates a SCRAM verifier and sets the role
   password without printing it or writing it to a file.
4. Restart the API so old pooled connections are replaced. Check the
   “Runtime database identity verified” startup message.
5. Run the isolated runtime-login tests before considering rotation complete.

Rotation repeats steps 1, 3–5 during a maintenance window. Existing pooled
connections may survive PostgreSQL password changes until restarted. Do not
leave the database password and configured secret out of sync.

Development provisioning also removes PUBLIC schema-creation and database
temporary-table privileges; owners retain setup access. Runtime cannot create
persistent or temporary tables, alter/drop application tables, disable RLS,
or update/delete/truncate raw rows. Raw-row immutability triggers still protect
owners in addition to revoked application grants.

## Before publishing
- Set `SEED_TEST_USERS=false`; never provision test users in production.
- Provision and verify a production runtime login, its secret, restricted-role
  grants and ENABLE/FORCE RLS in the target environment through its supported
  administration process. Do not assume development role passwords transfer.
- These development scripts intentionally refuse production. Do not put them
  in application startup or deployment hooks.
- Replit-managed publishing owns production schema changes. Production
  custom-role/password provisioning must be confirmed with the platform;
  this phase's development proof is not a production-login proof.
- Validate the production startup identity and session/tenant paths before
  allowing traffic. No privileged-credential fallback exists.

## Tests
`runtime-login.test.ts` verifies direct authentication, role flags, dynamic
coverage of every factory_id table, context-free denial, DDL/RLS-bypass denial
and raw-row write denial. `canonical-tenancy.test.ts` retains cross-factory
read/write/reference checks. Test fixtures use separate non-bypass owners,
while the tested application uses the actual runtime login.
