# Pre-publish confirmation

**Superseded production-setup section:** The later approved deployment-token
implementation is documented in `PRODUCTION_GATE_REPORT.md` and the revised
`PHASE10_PUBLISH.md`. It replaces the manual first-manager commands below.
The local owner-role proof passes; actual platform publishing remains unperformed.

No feature or deployment change was made. Only dependency remediation, rejection
verification and documentation were updated.

## Security

* `braces@3.0.3`: GHSA-vfj7-8cjw-p6xm / CVE-2026-93687, high.
  Only mockup-sandbox → fast-glob → micromatch build/development tooling.
  Registry latest remains 3.0.3; no patched release reported. Not a Clarix
  production request dependency. Residual risk remains for untrusted glob
  patterns in that tooling; this is not an unconditional security clearance.
* `postcss-selector-parser@6.0.10`: GHSA-rj75-hqrm-r3gf /
  CVE-2026-104844, moderate. Typography build tooling only.
  Fixed with a typography-only override to 7.1.6. Before/after production CSS
  SHA-256 is identical:
  `24051eb132ad2da8e8b8c03324a44da18fff9edc71cfcde787267b2a3896641d`.
  Both production builds and TypeScript checks passed; two preference unit tests
  passed. The fresh full isolated suite passed **87/87** and the Python verifier
  passed **52/52**. Development fingerprints stayed unchanged; disposable
  resources were removed. Isolation evidence:
  `generated-artifacts/phase10/prepublish-suite-isolation.json`.
* Fresh dependency audit: zero critical, one high, zero moderate.
  Evidence: `generated-artifacts/phase10/prepublish-security.json`.

## Configuration facts

Shared-scope metadata reports these secret names (never their values):
`CLARIX_RUNTIME_PASSWORD`, `SESSION_SECRET`, `SEED_TEST_PASSWORD`,
`DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PRIVATE_OBJECT_DIR`,
`PUBLIC_OBJECT_SEARCH_PATHS`. The production-scope lookup exposes the same names.
No published app exists yet, so deployed runtime contents have not been observed.

`SEED_TEST_USERS` is development-scoped, not production-scoped. Set it separately
for the published app. `NODE_ENV` is already production-scoped in the API
artifact's build/run configuration; the development command sets development
mode. Replit supports separate testing/published configurations:
Secrets → More beside New configuration → New published app configuration.
Publishing → Adjust settings → Production app secrets is the production review
location. Do not change shared/development entries to configure only production.

Replit supplies the environment-specific `DATABASE_URL`; do not copy the
development connection into production. Verify production values for runtime
password, session signing and storage configuration privately. The test password
is unnecessary in production, even though shared metadata currently exposes it.

## Managed production setup: unresolved boundary

Publish creates the separate production database and applies schema changes.
Do not use prepare-production.ts against Replit-managed production. The local
empty-database test is not proof of the managed Publish path.

The documentation's automatic custom-role migration statement describes the
Neon-to-Helium infrastructure upgrade, not guaranteed Publish behavior. Before
providing a non-technical operator a complete execution sequence, verify the
production role/grant/policy provisioning and a privileged production connection.
Ordinary editor Shell is a development environment. This gap blocks release.

Only after that target is verified, the existing runtime command is:

```
NODE_ENV=production SEED_TEST_USERS=false pnpm --filter @workspace/api-server exec tsx src/scripts/configure-runtime.ts --production-setup
```

Expected success: `Runtime login configured; no credential values printed.`
It configures an existing role; it is not a substitute for missing role creation.
Its environment must supply the production runtime password privately.

Only after runtime setup and a verified published origin:

```
NODE_ENV=production SEED_TEST_USERS=false pnpm --filter @workspace/api-server exec tsx src/scripts/bootstrap-production.ts --name "Your factory" --slug your-factory --email manager@example.com --origin https://YOUR-ACTUAL-PUBLISHED-HOST
```

Expected success: a `One-time invitation (expires …)` line and private URL.
Requires an interactive terminal; no redirected output. Existing active manager
refuses by default, with a generic refusal message and nonzero exit. There is an
explicit `--allow-existing-manager` override; do not claim refusal is unconditional.

## Backups and safe rehearsal

Official steps: Database → production database → Settings → Advanced →
Scheduled backups → Keep backups for. This enables a daily full restore point
near midnight in the browser's time zone; it is not a documented instant
“Back up now” operation.

Restore: Scheduled backups → View all backups → Restore on the chosen point →
type `restore` → Continue. This switches live data to that restore point.
Connections may reconnect; code is not restored. Restore matching code separately.
Core retention up to seven days; Pro/Enterprise up to 28, initially seven.

Safe UI rehearsal: use a separate disposable project with its own production
database, synthetic records and no production integrations. Enable its schedule,
wait for a listed backup, note row counts, modify only a synthetic record, restore
that backup, and compare counts/content. This tests the restore procedure without
touching Clarix. It does not prove recovery of Clarix-specific roles or real data.
Do not use a legacy remix that shares a database. Production PITR recovery in
Clarix itself is not a harmless rehearsal.

## Authentication evidence

The refreshed disposable production-mode proof tested all five seeded email
identities with valid credentials; every login returned 401. Password hashes and
identities were disposable copies, not writes to real development factories.
First manager invite acceptance succeeded; a second bootstrap with an active
manager and no override was rejected. Eight checks passed; database removed and
development fingerprints unchanged. Evidence:
`generated-artifacts/phase10/production-proof.json`.

## Official sources

* https://docs.replit.com/core-concepts/project-editor/app-setup/secrets
* https://docs.replit.com/features/data-and-storage/development-and-production
* https://docs.replit.com/features/data-and-storage/connection-details
* https://docs.replit.com/features/data-and-storage/data-recovery
