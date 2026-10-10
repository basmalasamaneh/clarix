# Phase 9 — verification report

## Status
**Phase 9b update:** see [PHASE9B_REPORT.md](PHASE9B_REPORT.md) for the final-code
measurements and collision proof, which now pass. The browser matrix remains
unverified, so overall acceptance is still partial. The numbers below are
the original Phase 9 measurements, retained rather than overwritten.

Runtime separation and the Najm import path are implemented. **This phase is
not fully accepted:** two measured performance targets were missed, the full
responsive/language/theme matrix is incomplete, and the HTTP record-ID collision
test did not establish a collision. See the precise limitations below.

## Built
- Direct password authentication to PostgreSQL as `clarix_runtime`, with
  startup identity/privilege checks. No owner-login-then-SET-ROLE fallback.
- Separate development-only administrative entry point for setup and fixtures.
- Secret-driven SCRAM credential provisioning, restricted subordinate roles,
  explicit raw-row write revocation, and persistent/temporary DDL restrictions.
- Automatic ENABLE/FORCE RLS coverage tests for every `factory_id` table.
- Editable CSV separator alongside decimal/date/datetime/unit settings.
- Bounded run-reference and Data Quality reference/row previews. The Source
  Drawer retains complete paginated traceability. Quality's reference count
  remains the full count, not the preview length.
- Server-paginated approval error lists, rather than loading all issues first.
- Isolated, repeatable synthetic scale generator and HTTP measurements.
- Credential rotation and pre-publication checklist in `RUNTIME_DATABASE.md`.

## Actual browser/API evidence
The isolated Najm manager signed in, uploaded the three baseline CSVs, explicitly
selected semicolon, saved comma decimal, day/month/year date, date/time and
tonne settings, saved a mapping template, checked and approved. Check returned
2 info issues, 0 warnings and 0 errors. Approval returned HTTP 200/approved.
Najm E-01's API metrics and Source Drawer values were 8% scrap and 180 minutes.
Switching to Ethmar returned its own E-01, 5% scrap and 240 minutes.

Evidence:
`generated-artifacts/phase9/browser-phase9-retry-20261010T155312Z-37092/`.
Its copied fingerprint report says development table and role/grant
fingerprints were unchanged. No browser test wrote to development factories.

## Final automated checks and intentional development import
- Workspace type checks passed.
- Final isolated API/security suite: **56 passed, 0 failed**.
- Python fixture verifier: **ALL 52 CHECKS PASSED**.
- Final test isolation proof:
  `generated-artifacts/phase9/final-suite-isolation.json`.
- Restarted API and frontend successfully; checked the signed-out login page
  at 1280px. This is not evidence for protected responsive pages.

After automated verification ended, the explicitly authorised development
baseline was imported through the normal authenticated HTTP/upload/check/
approval API and a mapping template was saved. The active source is
**Najm Packaging production export**. All measured Ethmar import-data counts
and fingerprints stayed identical.

| Najm development table | Before | After |
|---|---:|---:|
| imports | 0 | 1 |
| raw_rows | 0 | 8 |
| orders | 0 | 2 |
| production_records | 0 | 3 |
| events | 0 | 3 |
| data_issues | 0 | 2 |
| column_mappings | 0 | 1 |
| all three history tables | 0 | 0 |

Evidence:
`generated-artifacts/phase9/intentional-najm-baseline/evidence.json`.
Normal login/logout and audit/session side effects accompany this operation;
the unchanged claim applies to Ethmar's import-data tables, not every global
authentication table. Automated test targets were already removed before this
intentional operation began.

### T1–T12
| Check | Observed result |
|---|---|
| T1 factory-filtered lists | Pass, HTTP 200; Najm-only source excluded from Ethmar |
| T2 each factory's E-01 metrics | Pass; Ethmar 5%/240 min, Najm 8%/180 min |
| T3 foreign run ID | Pass, foreign and nonexistent IDs both 404, same error shape |
| T4 other resource isolation | Foreign import, mapping write, issue and Source Drawer targets: same 404 parity. Member mutation and invitation revoke parity passed. Import/quality/template/member collections were filtered |
| T5 foreign factory_id supplied on upload | Rejected with HTTP 400 |
| T6 colliding IDs | Same order ID across factories passed. **HTTP record-ID collision unproven:** chosen Ethmar rows had PR-5001/PR-5002, Najm rows had 1/2. This was a test-fixture selection failure, not an observed collision bug |
| T7 identical bytes across factories | Pass, not treated as another factory's duplicate |
| T8 direct SQL without context | Pass across all 13 factory_id tables |
| T9 Viewer writes | Upload, approve and source/settings writes all 403 |
| T10 Platform Admin | Default tenant access denied 403; delegated/time-boxed access N/A, not built |
| T11 AI isolation | N/A, AI not built |
| T12 export isolation/neutralization | N/A, export not built |

Snapshot access is also N/A. Audit and raw-row standalone item-ID HTTP
coverage was not established by this browser pass; do not infer it from
collection filtering or Source Drawer coverage.

### Responsive evidence and driver failures
Only the **360px English/light upload and mapping** screenshots were captured.
Do not treat the 768/1280px, Arabic, dark-theme, Runs/Comparison/Quality/Drawer,
keyboard or touch-target matrix as verified.

The first driver accidentally confirmed approval only when an error checkbox
existed. The retry fixed that and proved approval, then stopped waiting for an
editable approval button on an already-approved read-only page. That ready
marker is now corrected to the approved banner, but the remaining matrix was
not rerun. No subjective visual-quality claim is made.

## Runtime and RLS
Verified tables:
`account_audit`, `column_mappings`, `data_issues`, `events`, `events_history`,
`imports`, `invitations`, `memberships`, `orders`, `orders_history`,
`production_records`, `production_records_history`, `raw_rows`.

Each has both RLS flags enabled. Context-free runtime SELECT returns zero rows
or permission denial. Direct runtime identity is not superuser, bypass-RLS,
database creator or role creator. Tests cover blocked table creation, alteration,
drop, RLS disable/bypass and raw-row update/delete/truncate. Canonical tests
cover cross-factory reads, writes and references.

All five seeded role identities actually passed password-login HTTP tests.
This does not mean all five were verified through every browser screen.
The running API logged “Runtime database identity verified” with
`databaseRole: clarix_runtime`.

## Scale measurements
Twenty synthetic factories; exactly **200,000 current production records**,
**100,000 current events**, **50,000 production records in the largest factory**.
The largest factory's data entered through the actual HTTP/object-storage/
mapping/check/approval pipeline. Three import versions created history; all
synthetic current/history data was removed by the isolated harness.

| Operation | Samples | p50 | p95 | Target / result |
|---|---:|---:|---:|---|
| 50,000 production + 5,000 event row import, upload through approval | 3 | 116.86 s | 117.90 s | <60 s — **missed** |
| Runs | 30 | 787 ms | 1,096 ms | <1,000 ms — **missed** |
| Comparison | 30 | 150 ms | 443 ms | <1,000 ms — passed |
| Data Quality | 30 | 524 ms | 654 ms | <1,500 ms — passed |
| Source Drawer | 30 | 73 ms | 103 ms | <1,000 ms — passed |
| Login, including CSRF/session fetch | 20 | 48 ms | 99 ms | Measured, no brief threshold |

These are nearest-rank percentiles on one development environment, not a
production SLA. Three import samples are a small sample. The measurements
precede the final bounded-reference preview changes; their performance was
not separately re-benchmarked.

A separate process continuously requested another synthetic factory's Runs
during imports. Requests returned 200; the first two attempts had p95 around
221/180 ms, with maxima around 1.43/1.41 s. Event-loop stalls exceeded one
second. Thus “without blocking other users” is not an unconditional pass.
The full three-attempt samples are in the evidence JSON.

Representative EXPLAIN ANALYZE queries: run-date aggregation 29.611 ms;
source-row page 0.230 ms; quality page 0.141 ms. These are sampled queries,
**not a complete ranking of every executed SQL statement**. No speculative
indexes were added. Approval still makes many sequential row insert calls and
repeated reference lookups; import optimisation and detailed stage profiling
remain necessary. Node emitted MaxListenersExceededWarning under load; it
was not suppressed or presented as a clean warning-free run.

Scale evidence and unchanged-development proof:
`generated-artifacts/phase9/scale-2026-10-10T15-44-48.185Z/`.

## Remaining scope
- Complete the responsive/theme/language/keyboard verification matrix.
- Establish the same-record-ID HTTP collision scenario with genuinely matching
  synthetic IDs; complete outstanding audit/raw-row item coverage as applicable.
- Meet import and Runs latency targets and investigate event-loop stalls.
- Finish a comprehensive nested-payload audit. Top-level lists are paginated,
  but import-review nested raw-row/reference collections and import detail
  metadata are not all server-paginated. Do not claim every endpoint is bounded.
- Production role/password provisioning and production runtime login remain
  unverified; development proof is not production readiness.

## Deliberately not built
No charts, export/PDF, AI, snapshots, reconciliation, issue resolution, or
Platform Admin delegation UI. No calculation-engine, test-data, expected-result
or tools changes.

## Manual check
Sign in as `najm.manager@clarix.test` using the existing `SEED_TEST_PASSWORD`.
Open Production Runs, choose the Najm baseline source, compare E-01 with B-102,
and open a metric's Source Drawer. E-01 should show 8% scrap and 180 minutes.
Sign out before signing in as an Ethmar role; its E-01 should show 5% and
240 minutes. Do not reuse this manual workflow as an automated development
test: automated verification belongs in disposable targets.
