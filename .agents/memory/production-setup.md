---
name: Production setup boundary
description: Separate privileged setup from startup; preserve immutable migration baselines
---
The user approved automatic security-only pre-API provisioning and a first-manager
invitation from a user-generated deployment token, not a manager password secret.
For Replit-managed databases, table migrations still belong to Publish.

**Why:** The user cannot operate a production Shell and requires UI-only deployment,
zero users until invitation acceptance, and no logged credentials or invitation links.

**How to apply:** Separate privileged provisioning from the HTTP process and
discard owner/token credentials before API startup. Test fresh role creation in
a separate PostgreSQL cluster (roles are cluster-wide, not database-local).
Use a non-superuser table owner with CREATEROLE for realistic local proof.
PostgreSQL protects initdb's bootstrap superuser from demotion and wholesale
ownership reassignment: create a separate owning role before creating test tables.
Keep the first invitation as a durable latch; never extend expiry on restarts.
Require a production runtime password different from development and removal of
the bootstrap token after first sign-in. Actual managed-platform privileges still
need live verification; never represent a disposable test as a successful publish.

Backup/restore rehearsal belongs after publishing, not as a pre-publish blocker.
**Why:** The user explicitly clarified this readiness boundary.
**How to apply:** Keep safe disposable-project rehearsal instructions in the
post-publish checklist; never imply the rehearsal ran without evidence.

The first Publish must not copy development data. Custom-role policies in
development (including retained isolated-test schemas) can make the platform's
database restore fail before application startup can provision security roles.
**Why:** A real first-publish attempt failed restoring a test-schema policy
whose target role did not exist in production.
**How to apply:** Verify the copy-development-data option is off. Do not weaken
RLS or claim startup provisioning fixes a pre-startup restore. An unchanged
factory fingerprint does not prove the database has no leftover test schemas;
inspect namespaces separately and obtain approval before destructive cleanup.
