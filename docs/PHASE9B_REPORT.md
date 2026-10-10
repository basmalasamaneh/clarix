# Phase 9b — work and verification record

## Final status
The measured import/Runs targets and HTTP record-ID collision proof now pass.
Review collections have bounded server pages. **Phase 9b is not fully accepted:**
the full browser matrix and the 24 Source Drawer bounds checks are unverified.
See the exact gaps below. All automated data writes used disposable targets.
The engine, test-data/, expected/ and tools/ were not changed.

## Baseline profiling, before application changes
Evidence: `generated-artifacts/phase9/scale-2026-10-10T16-17-24.371Z/`.

| Pipeline stage | Measured elapsed |
|---|---:|
| Create draft | 0.174 s |
| Finalise files (download/parse/hash/preserve/raw inserts) | 4.919 s |
| Save and validate mapping | 1.241 s |
| Check (parse/calculation/issue detection/storage) | 2.198 s |
| Approve | 72.391 s |
| Total upload-to-approval, including uploads/client processing | 81.577 s |

The new run is faster than the previous 117.9-second p95, but is only one
instrumented sample, not a replacement three-sample p95.

Approval issued 50,000 production INSERT calls (43.049 s accumulated elapsed)
and 5,000 event INSERT calls (3.733 s). Finalisation's three existing bulk
raw-row INSERTs took 3.507 s. SQL elapsed includes constraints, indexes,
triggers and round trips, not just server execution.
CPU sampling attributed approximately 18.289 s to approval callbacks and
3.569 s to the approval function. The implementation repeatedly searched all
raw rows for each canonical row. CPU samples and SQL elapsed overlap and
must not be added as independent wall-clock stages. Concurrent other-user
read queries are present in the SQL profile; their durations are not import
write costs. Parsing/calculation/issue detection are measured together above,
not claimed as individually exact stopwatch timings.

## Measured fixes
Approval now uses a raw-reference lookup map, included-line sets, and
ordinary INSERT batches of at most 1,000 rows. Exact decimal strings go
directly to PostgreSQL numeric fields. The original approval transaction,
RLS, foreign keys, triggers, history creation and engine recheck remain.

## Runs baseline on the final Phase 9 reference-preview code
30 requests: p50 45.66 ms, p95 61.84 ms (target <1,000 ms).
This is the first measurement after Phase 9's bounded reference previews,
compared with the earlier 1,095.93 ms p95 on the uncapped representation.
An index change is not justified by this measurement; no speculative index
or migration was added. Final-code measurements follow.

## CPU work and preservation of semantics
Files totalling at least 1 MB use a worker thread for inspection, mapping samples
and calculation. The engine itself is unchanged. Decimal instances and the
engine's null-prototype dictionaries are restored at the worker boundary.
The main thread yields while hydrating large canonical collections. At most two
workers run per process; further concurrent CPU requests fail explicitly with
503 IMPORT_BUSY rather than growing an unbounded queue. Workers have a 60-second
timeout. This is not a durable background import queue.

Before workers, the batched version measured 19.91 s p50 / 26.80 s p95 but had
1.1–1.3 s event-loop stalls. Final worker measurements below trade some startup
cost for materially lower stalls. Other-user responsiveness is measured, not
claimed as literally zero blocking under every possible workload.

## Final-code measurements
Evidence: `generated-artifacts/phase9/scale-2026-10-10T16-52-37.391Z/measurements.json`.
20 synthetic factories, 200,000 current production records, 100,000 events;
largest import: 50,000 production records plus 5,000 events. HTTP timings include
the real pipeline and object-storage uploads. Import p95 uses three attempts
(nearest-rank p95 is their maximum), not a production traffic distribution.

| Operation | n | p50 | p95 | Target | Result |
|---|---:|---:|---:|---:|---|
| Upload through approval | 3 | 25.552 s | 25.616 s | <60 s | PASS |
| Runs | 30 | 51.69 ms | 61.08 ms | <1,000 ms | PASS |
| Comparison | 30 | 20.93 ms | 28.43 ms | <1,000 ms | PASS |
| Data Quality | 30 | 517.84 ms | 773.39 ms | <1,500 ms | PASS |
| Source Drawer API | 30 | 68.25 ms | 88.21 ms | <1,000 ms | PASS |
| Login | 20 | 51.83 ms | 95.16 ms | No numeric target | Measured |

Concurrent other-factory reads: all HTTP 200, attempt p95 205/209/292 ms;
worst response 433.50 ms. Maximum event-loop delays 263/197/188 ms.
This passes the measured responsiveness check; it is not an unlimited-load SLA.

Final EXPLAIN ANALYZE probes preserved RLS, indexes and constraints:
run-date query 24.111 ms, source rows 0.171 ms, quality 0.090 ms.
Rolled-back 1,000-row inserts: raw 247.471 ms (FK trigger 3.988 ms),
production 210.091 ms (FK triggers 5.750 + 177.848 ms),
events 36.664 ms (FK triggers 5.245 + 8.080 ms).
Index/write/RLS overhead is included in execution time, not separately
attributed to individual indexes. No index removal, added index or migration.
Storage SDK PassThrough MaxListenersExceededWarning messages still occurred;
they were not suppressed and are not claimed fixed.

## Server pagination and UI
All sizes below are fixed at 20; caller-supplied larger sizes cannot enlarge them.

| Endpoint / collection | Bound and order |
|---|---|
| GET /api/imports/:id/issues/:page and /errors?page=N | 20 issues; code then ID |
| POST /api/imports/:id/event-codes?page=N | 20 codes, lexical code order |
| POST /api/imports/:id/review-page — replacementOrders/replacedOrders | 20 order IDs, sorted |
| review-page — otherSourceOrders | 20 source/order entries, deterministic source query order |
| review-page — settingsDifferences | 20 effective-setting differences, deterministic normalized-key order |
| review-page — issueRows | SQL LIMIT 20/OFFSET; file (C), physical line, ID |
| review-page — issueCodes/issueCodeRefs | 20 codes/references in stable derived order |
| review-page — eventCodes/eventCodeRefs | 20 codes/references; current file/column/mapping selection |
| review-page — resultRuns/resultRefs | 20 sorted run entries or ordered reference-array entries |

Review requests use page 1–1,000,000 and return total/page/pageSize.
Result-reference paths are bounded to ten components and own-properties only.
Import detail and nested error/issue responses carry first-20 previews; stored
engine results remain complete. Configuration mappings are not truncated.
Some review computations still read complete stored results internally: bounded
responses do not imply every internal computation is a SQL-paged query.

The existing wizard has on-demand pagers for codes/references, issue rows,
replacement lists, cross-source matches and settings differences. Loading,
retry/error and bilingual pager states are included. Event choices survive
page changes; unvisited codes are explicitly counted as needing review.
Cache identities include import, event file, mapped column and code.

## Regression evidence
- All 26 golden folders passed through real upload/finalise/map/check/approve
  in imports.test.ts: 10/10 tests. Fixtures and expected values unchanged.
- Worker/direct equivalence across all 26 folders, plus decimal/sample/raw-cell
  preservation and typed validation errors: 28/28 tests.
- Review pagination/collision suite: 2/2 tests. Traverses beyond 20 codes,
  references, issue rows, replacement/replaced orders, result runs/references,
  cross-source orders and settings differences; rejects invalid page bounds
  and cross-factory access.
- Real HTTP password logins as both factory managers imported identical
  COLLISION-1..25 record IDs and E-01..E-25 order IDs into both factories.
  Both approvals succeeded. Runtime SQL verified identical record-ID sets.
  Ethmar's counts and comparison response stayed unchanged after Najm's import;
  distinct metrics stayed factory-specific; foreign comparison/import/issue
  requests were denied.
- Workspace typecheck, API build, compiled worker smoke and actual 360px login
  preview checked. A real Vite metadata transform failure on explicit generic
  JSX tags was fixed using type inference; tsc alone had not caught it.

## Browser results — deliberately not an all-pass claim
Evidence directories under `generated-artifacts/phase9b/` are separate attempts:
- `browser-2026-10-10T16-42-35-518Z-489303ea`: actual UI manager logins for
  Ethmar/Najm; expected baseline metrics observed; onboarding dismissed by normal
  click, Escape and keyboard Enter. A subsequent Najm overlay was a driver
  sequencing failure, not proof that users could not close onboarding.
- `browser-2026-10-10T16-45-58-788Z-56985f05`: Najm UI upload/map/check/approve
  returned HTTP 200 / approved. On-demand event-code page 2, retained choice
  across page changes, and correct event-file/column reference paging passed.
  Further synthetic review checks failed because the driver derived all ignored
  codes from a bounded 20-code preview. Those checks are NOT passes.
- `browser-2026-10-10T16-49-17-076Z-54aa9996`: launcher hit its 300-second
  timeout before the driver serialized assertions. The partial manifest lists
  every required combination. Ethmar has 42 ordinary screenshots without retained
  assertion results and 42 failure screenshots. All 84 Najm matrix cells were
  not reached. No matrix cell is counted verified. One requested Arabic capture
  visibly remained English; missing preference response evidence means a
  save/navigation race cannot be distinguished from an application defect.
  Three drawer failure screenshots show no open drawer; remaining 21 not reached.

**Exact unverified matrix:** both factories × widths 360/768/1280 × EN/AR ×
light/dark × Runs, Comparison, Data Quality, Members, Upload, Map, Check =
168 cells. All 24 Phase 7 metric/issue Drawer combinations (3 widths × 2 languages
× 2 themes × 2 drawer types) remain unverified. UI geometry, locale persistence
and keyboard assertions are not inferred from an API pass or a screenshot.
No further browser rerun was made after these repeated verification failures.

## Development data and cleanup
`generated-artifacts/phase9b/final-isolation.json` records final-scale before/
after counts and full fingerprints, including per-factory snapshots:

| Table | Ethmar before → after | Najm before → after |
|---|---:|---:|
| Imports | 4 → 4 | 1 → 1 |
| Raw rows | 41 → 41 | 8 → 8 |
| Orders | 6 → 6 | 2 → 2 |
| Production records | 16 → 16 | 3 → 3 |
| Events | 9 → 9 | 3 → 3 |
| Quality issues | 2 → 2 | 2 → 2 |
| Mapping templates | 0 → 0 | 1 → 1 |
| All three history tables | 0 → 0 each | 0 → 0 each |

Every listed fingerprint matched exactly, as did global protected tables and
roles during the final scale harness. Final pagination proof is separately saved
as final-pagination-isolation.json.
The browser timeout left its own disposable schema/storage behind. It was
identified by that attempt's unique source names and explicitly removed, along
with its disposable role. interrupted-browser-cleanup.json confirms public
counts/fingerprints unchanged across cleanup. An unrelated pre-existing test
namespace was left untouched. No real factory imports or sources were deleted.
The isolation harness deliberately holds SHARE locks on public development
tables to prevent contamination. While it ran, main-preview session touches
waited about 10 seconds and logged session errors followed by
ERR_HTTP_HEADERS_SENT in the existing error handler. This is separate from
the concurrent-import benchmark inside the disposable target. After cleanup,
the main session endpoint returned 200 in 251 ms. The error-handler behavior
was not changed or claimed fixed.

## Manual verification steps
Use a disposable target, not development Ethmar/Najm, for synthetic imports:
1. Sign in as each factory manager; confirm factory identity and only its runs.
2. Upload a fixture, map it, choose event meanings, review and approve normally.
3. For >20 entries, use Next/Previous in event codes, references, issue rows,
   replacement confirmation and source/settings lists; revisit a code choice.
4. Switch language/theme, wait for preference save, then reload. Verify all
   seven listed screens at the three widths for each factory.
5. Open both metric and issue Source Drawers; check viewport bounds, scrolling,
   Escape, focus containment and focus restoration.

## Built / deliberately not built
Built: measured approval batching/lookup improvements, large-file CPU offloading,
bounded review APIs and existing-wizard pagers, collision/pagination/worker tests,
profiling and honest evidence reports.
Not built: new product features, charts, AI, reports UI, reconciliation, a durable
background-job system, speculative indexes, or changes to calculation rules,
golden fixtures, test-data, expected results or tools.
Outstanding: complete the failed/unverified browser matrix with a corrected,
incrementally checkpointed driver; establish preference persistence root cause
if it still fails after waiting for actual saves. Phase 9b remains partial.
