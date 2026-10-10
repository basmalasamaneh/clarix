# Phase 10 — MVP polish and publish readiness

**Later pre-publish update:** See `PRE_PUBLISH_CONFIRMATION.md` and the corrected
`PHASE10_PUBLISH.md`. The parser advisory below has since been fixed with a
typography-scoped override, identical generated CSS, and a fresh 87/87 isolated
suite plus 52/52 verifier checks. Only the sandbox braces advisory remains.
All five seeded email identities were subsequently tested for production-mode
rejection. The managed production role/provisioning path remains a release gate;
the earlier isolated empty-DB test was not a verified Replit Publish rehearsal.

## Outcome

Implemented the approved scope, but **not an unconditional release approval**.
No deployment was performed. Actual published HTTPS/proxy behavior, production
recovery operations and remaining browser coverage still need verification.
See `PHASE10_PUBLISH.md` for the exact setup and publishing sequence.

## Built

* Preference requests survive page unload using keepalive. Pending choices
  overlay older responses; serialized writes use mutation-level callbacks.
  Logout retains the currently selected local language/theme, rather than an
  old initial local state. Account preferences remain server-persisted.
* English/Arabic Help page, reachable from Support → Help for signed-in roles.
* Four-step non-modal onboarding with close, skip, completion and Escape.
  Dismissal uses the existing per-user persistent preference.
* Helpful empty states, translated crash/403/404 states and plainer messages.
  `PHASE10_MESSAGES.md` inventories changed keys/messages.
* A build-failing translation-key parity and static-key check (1,055 keys).
  Dynamic keys and all possible hardcoded strings are not fully statically
  verified; see the inventory's audit limitations.
* Privileged production schema setup and first-manager invitation CLI:
  expiring hashed one-use tokens, existing-manager guard, no runtime route,
  no role bypass, no usable bootstrap admin, no test seeding.
* Startup checks for ENABLE/FORCE RLS on tenant tables; safe double-response
  error handling; authentication logs no longer include user identifiers.
* Upload-creation rate limit and a 100,000-row/file limit with EN/AR guidance.
* Dedicated production frontend server with direct-link fallback and security
  headers. API security/session/CSRF checks remain enforced.
* Non-major dependency security patches; explicit operations/backup guidance.

## Language diagnosis: evidence versus inference

The Phase 9b driver waited for an optimistic `html.lang` update but did **not**
wait for the preference PATCH before navigating. The old app also replaced
whole cached sessions with save responses and kept a stale in-memory anonymous
language. Those are concrete race/lifecycle defects addressed here.

However, the earlier English screenshot alone does not prove which request
was aborted or overwritten. No historical network evidence survives that
establishes a unique root cause. Do not describe the old screenshot as a proven
cookie/default-language defect. Fresh browser observations are recorded below.

## Automated acceptance

| Check | Result |
|---|---|
| Existing isolated suite, including role/scoping, accounts, golden imports, pagination and worker parity | PASS: 86/86 |
| Python fixture verifier | PASS: 52/52; all 26 golden scenarios retained |
| New row-limit boundary/error-code test | PASS: 1/1 |
| Preference response ordering, including A→B→A and mixed fields | PASS: 2/2 targeted unit tests |
| API/frontend TypeScript and production builds | PASS |
| Translation parity/static keys | PASS |
| Empty disposable production database migration/reapply | PASS |
| Production-mode first-manager invite acceptance, password login, single-use token and existing-manager refusal | PASS |
| Production + `SEED_TEST_USERS=false` rejects marked test identity and invalidates its session | PASS |
| Production session cookie flags, CSRF, safe health and API headers | PASS in isolated production-mode HTTP tests |
| Runtime direct login, restricted role, tenant ENABLE/FORCE RLS | PASS |
| Production frontend `/help` direct link and CSP/frame/no-sniff/referrer headers | PASS locally against built server |
| Published HTTPS operation, backup/restore rehearsal | NOT RUN: no deployment |

Production proof: `generated-artifacts/phase10/production-proof.json`.
It created and removed a fresh database, never bootstrapped the real factories.
It tested a disposable marked test identity, not every original seeded email
under production. Existing role identities were exercised by the regression
suite; browser role coverage is not inferred from those API tests.

### Fresh performance sample

20 synthetic factories; 200,000 production rows, 100,000 events; largest input
50,000 production rows. Results from
`generated-artifacts/phase9/scale-2026-10-10T17-25-34.556Z/measurements.json`:

| Operation | Samples | p50 | p95 |
|---|---:|---:|---:|
| Import | 3 | 21.015 s | 24.718 s |
| Runs | 30 | 50 ms | 70 ms |
| Comparison | 30 | 19 ms | 24 ms |
| Data Quality | 30 | 498 ms | 540 ms |
| Source drawer | 30 | 71 ms | 87 ms |
| Login | 20 | 57 ms | 168 ms |

All configured scale assertions passed. These are local synthetic measurements,
not a promise of identical production latency. The storage SDK still emits
PassThrough MaxListenersExceeded warnings under repeated uploads; not suppressed
or claimed resolved.

## Data preservation

The suite, browser attempt and scale harness each recorded before/after table
counts, per-factory fingerprints and role/grant fingerprints; each completed
with `unchanged: true` and disposable schema/storage cleanup.
Evidence: `generated-artifacts/phase10/{suite,browser,scale}-isolation.json`.
Protected calculation code, `test-data/`, `expected/`, and `tools/` have no diffs.

## Security readiness

| Area | Status and qualification |
|---|---|
| Secret/PII handling | PASS inspected paths: no new hardcoded passwords; generic errors; invitation query/path redaction; no raw CSV/password/token request logging. Not an exhaustive proof over all repository history. |
| SAST / privacy scans | PASS: no findings |
| Dependency scan | FAIL for a completely clean audit: 0 critical, 1 high, 1 moderate remain |
| Cookies/CSRF/lifetime | PASS: Secure in production, HttpOnly, SameSite=Lax, CSRF, eight-hour lifetime |
| CSP/frame/no-sniff/referrer | PASS locally; published proxy path must still be checked |
| Migrations/runtime/RLS | PASS fresh-database and runtime proof; actual production setup not executed |
| Friendly errors / health | PASS implementation and health check; full visual error matrix not reached |
| Limits | PASS implementation; process-local rate limits are not a global multi-instance limit |
| Backups/rollback | Documentation complete; real recovery rehearsal NOT RUN |

Remaining dependency findings:
* **High:** `braces@3.0.3`, only under the mockup sandbox's fast-glob/micromatch;
  scanner offered no fixed release. The sandbox is not Clarix's production app.
* **Moderate:** `postcss-selector-parser@6.0.10` under Tailwind typography;
  fixed version requires a major-version change. This is a trusted-source
  build-time parser, not a user-supplied production request parser.

Six initial findings were removed with patch overrides, including the critical
proxy-addr finding. No broad dependency replacement was attempted. Evidence:
`security-initial.json` and `security-after.json` in the Phase 10 evidence folder.

## Browser evidence and remaining checks

The first isolated pass logged in successfully. It observed four non-modal
steps and a click dismissal returning PATCH 200 with `tourCompleted=true`.
The driver then incorrectly waited for another PATCH on replay dismissal,
although the preference was already true. It also expected an incorrect step
label. Those are driver failures, not evidence of broken tour behavior.

Its 80-cell page matrix was not reached. The missing set was Overview, Imports,
Runs, Comparison, Quality, Settings, Sources-in-Settings, Members, Help and
not-found, each at 360/1280 × EN/AR × light/dark. Screenshot and checkpoint:
`generated-artifacts/phase10/phase10-browser-2026-10-10T17-24-55-651Z-67d2c9e1/`.

Two focused continuation attempts were made after the scale run, preserving
separate manifests. Both logged into isolated sessions, but neither reached
reload/logout/direct-link checks or Help screenshots. The second observed
successful language AR/EN and light-theme PATCHes, then matched an earlier
response to a later rapid-toggle expectation and timed out locating a theme
option. Because request bodies were not correlated, this is **not proof of an
application save failure**. Both attempts and all missing 80 combinations
remain explicitly unverified. The original Arabic screenshot's exact cause
remains unproven.

The follow-up code inspection identified an A→B→A acknowledgement hazard:
matching values alone could clear newer intent. A request-revision check now
prevents it; two targeted unit tests pass. This final adjustment was typechecked
and built, **not browser-retested**.

Continuation manifests:
* `phase10-continuation-2026-10-10T17-29-47-173Z-d787a278/evidence.json`
* `phase10-continuation-2026-10-10T17-32-50-531Z-8e6ddfb5/evidence.json`

Both are under `generated-artifacts/phase10/`. Cleanup and unchanged development
fingerprints were confirmed. Visual quality cannot be judged from this
incomplete evidence; no visual-quality approval is claimed.

## Deliberately not built

No charts, reports/PDF/export, AI, saved snapshots, reconciliation, issue
resolution, calculation changes, fixture changes, optional demo-data installer,
production test users, auth bypass or automatic publishing.
