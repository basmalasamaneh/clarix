# Clarix: pre-publish checklist

**Publishing is paused.** This checklist replaces the earlier custom production
migration instructions. The local empty-database rehearsal did not verify
Replit's managed Publish path. Full evidence: `PRE_PUBLISH_CONFIRMATION.md`.

1. Keep development and production separate. Do not copy development records or
   seeded accounts into production.
2. In Secrets, choose **More → New published app configuration** to set
   `SEED_TEST_USERS` for production only. Disable seeding there; leave development
   unchanged. The API artifact already enables production `NODE_ENV` when published.
3. Review **Publishing → Adjust settings → Production app secrets**.
   Required names: `CLARIX_RUNTIME_PASSWORD`, `SESSION_SECRET`,
   `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PRIVATE_OBJECT_DIR`,
   `PUBLIC_OBJECT_SEARCH_PATHS`. `SEED_TEST_PASSWORD` is not needed in production.
   Do not display values. Replit supplies the environment-specific `DATABASE_URL`.
4. When publishing is separately authorized, let Replit create the production
   database. For legacy setup, enable **Create production database**; leave
   **Set up your production database with your current development data** off.
5. Review the Publish schema diff. Publish applies managed production schema
   changes. **Do not run `prepare-production.ts` against managed production.**
6. **Stop at this unresolved gate:** verify the production custom roles,
   grants, ENABLE/FORCE RLS and immutable-row protections. Published role creation
   has not been rehearsed. Documentation about automatically migrating roles
   during a Neon-to-Helium upgrade is not proof of Publish behavior.
7. Establish a private privileged setup environment with a verified production
   connection. The ordinary editor Shell normally targets development; do not
   paste these setup commands there without verifying the target. Supply the
   production `CLARIX_RUNTIME_PASSWORD` privately (at least 32 characters).
8. **Only after the role exists and the target is verified**, configure its
   password and privileges:
   ```
   NODE_ENV=production SEED_TEST_USERS=false pnpm --filter @workspace/api-server exec tsx src/scripts/configure-runtime.ts --production-setup
   ```
   Expected: `Runtime login configured; no credential values printed.`
   This configures an existing role; it does not create a missing role.
9. Confirm the app connects as the restricted runtime login. Expected startup
   log: `Runtime database identity verified`. Verify `/api/healthz` returns only
   `{"status":"ok"}`. Startup refuses elevated roles or unsafe tenant RLS.
10. Obtain the actual HTTPS origin from Publishing. In the verified private
    production setup terminal, create the factory and initial manager invitation:
    ```
    NODE_ENV=production SEED_TEST_USERS=false pnpm --filter @workspace/api-server exec tsx src/scripts/bootstrap-production.ts --name "Your factory" --slug your-factory --email manager@example.com --origin https://YOUR-ACTUAL-PUBLISHED-HOST
    ```
    Substitute real factory details and the real origin. Expected:
    `One-time invitation (expires …)` followed by a private URL. The command
    requires an interactive terminal and refuses redirected output. Share the
    seven-day, single-use link privately. Existing active managers cause refusal
    unless the explicit `--allow-existing-manager` override is supplied.
11. Accept the invitation, choose a password and sign in. Verify factory access,
    language/theme persistence and actual HTTPS cookie/security headers. The
    requested browser matrix is still incomplete; do not treat it as passed.
12. Enable daily backups: **Database → production database → Settings →
    Advanced → Scheduled backups → Keep backups for**. The first daily backup
    is scheduled near midnight in the browser's time zone, not immediately.
13. Rehearse safely in a separate disposable project with its own production
    database and synthetic data. Enable backups, wait for a listed restore
    point, change a synthetic record, restore it and compare records. Do not
    use a legacy remix that shares a database. This rehearses the platform UI,
    not Clarix's full real-data recovery.
14. For a real restore, choose **Scheduled backups → View all backups →
    Restore**, type `restore`, then choose **Continue**. This switches live
    data to the selected restore point; services may reconnect. Restore matching
    code separately and republish if needed. PostgreSQL recovery does not by
    itself establish recovery of uploaded object-storage files.
15. Resolve the production setup gate, remaining build-tool advisory and browser
    verification gaps before giving release approval. Publishing remains a
    separate user action. No actual publish or restore was performed.

## Retention

Core: up to seven days. Pro/Enterprise: up to 28 days, initially seven.
There is no verified instant “Back up now” button in the consulted documentation.
Point-in-time recovery is also available; it is not a harmless rehearsal against
the live database.

## Official sources

* https://docs.replit.com/core-concepts/project-editor/app-setup/secrets
* https://docs.replit.com/features/data-and-storage/development-and-production
* https://docs.replit.com/features/data-and-storage/connection-details
* https://docs.replit.com/features/data-and-storage/data-recovery
