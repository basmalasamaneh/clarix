# Phase 19 — implementation and readiness evidence

Nothing published. This is **not an unconditional publish approval**.
The browser/accessibility acceptance remains incomplete.

## Changes

- Production startup now retains GEMINI_API_KEY, GEMINI_MODEL and the six
  AI limit settings. Previously its explicit runtime environment filter dropped
  them, so a configured deployment still presented AI as unavailable. No key or
  invalid/missing model means configured=false; the provider refuses before
  fetch. A syntactically valid but unavailable model or invalid key produces a
  safe provider error, not a working configuration. Manager consent is also
  required. Offline chips and comparisons are unaffected.
- Server-authored failure messages now distinguish daily factory quota (midnight
  UTC), per-minute user limit, provider limit, circuit-breaker pause, unverified
  response and service failure. Provider quota reset is explicitly unknown;
  a Retry-After interval is not falsely presented as a known quota reset.
- Existing 40+ phrasings per language retained, with “شو اكبر تالف؟” added as
  an explicit highest-scrap intent regression. Synonyms remain accepted input,
  never competing display terminology. Every entity stays factory-validated.
- Arabic display terms remain الهدر and تشغيلة, consistent with spec §12.
  Count-unit forms were corrected from طلب to تشغيلة, تشغيلتان, تشغيلتين,
  تشغيلات; the UI formatting snapshot was updated, not any locked metric fixture.
  See PHASE19_STRINGS.md for changed keys grouped by rule. Existing signed,
  plural-aware helpers are shared byte-for-byte between API and frontend.
- One status message per Ask response; wrapped text. Existing suggestions use
  real factory entities. New page-reading help on Overview, Comparison, Quality.
  Removed the duplicated downtime-section note; summary and downtime each retain
  one. Existing collapsed detail layout retained.
- Static i18n audit now checks Arabic hardcoded text as well as English,
  flags inconsistent terminology and reports suspicious mixed-language/count
  strings. Heuristic findings require review; dynamic keys/rendered mixtures
  are not exhaustively proven by this script.
- Browser zoom restriction removed. Text entrance animation retains full
  opacity to avoid lowering contrast during motion. These final fixes were not
  browser-retested.

## Demo exception

Platform → Create demo factory provisions two bundled synthetic baseline sources
through the unchanged create/finalize/map/check/approve pipeline. It never reads
ordinary tenant data and creates no accounts. Optional invitation uses existing
onboarding. A transaction-only RLS provisioning marker is removed before commit;
Platform Admin retains no tenant access or membership afterward. Failure rolls
back database state. Synthetic orphaned storage objects after a failed transaction
may require storage lifecycle cleanup; no user data is involved.

All tenant pages share a persistent DEMO banner. New uploads are refused on the
server and hidden in the UI so real production files cannot be labelled synthetic.
User-entered notes are explicitly distinguished from the synthetic records.
Suspension is the reversible removal-from-use operation: it revokes access while
preserving data. No hard-delete endpoint or weakened immutability was added.

Manual steps:
1. Sign in as Platform Admin and open Platform.
2. Choose Create demo factory. Enter its name and language.
3. Optionally enter the intended manager's email; no account is auto-created.
4. Confirm synthetic-only data and create. If an invitation was requested,
   copy the once-shown link privately and accept it in another browser session.
5. Sign in as that manager. Verify the DEMO banner, two imports and four runs.
6. Choose two runs from DEMO baseline for the familiar E-01/E-02 comparison.
7. As Admin, Suspend the demo row. Other factories remain unaffected. Reactivate
   restores access without reimporting. Admin cannot browse the demo's data.

## Browser/accessibility — FAIL (incomplete gate)

24 critical demo checks passed: creation, invitation acceptance, 2 imports/4
runs, banner across ten tenant pages, Admin tenant denial, suspension/session
revocation, other-factory access, reactivation, Analyst/Viewer create denial.

The final manifest contains 8 screenshots/audits: Overview at 360/1280 × EN/AR ×
light/dark. 8 of 88 planned axe cells completed. No 768px screenshot belongs to
this manifest. Imports, Runs, Comparison, Quality, Snapshots, Settings, Account,
Members, Help and Platform have no completed audit cells in the final manifest.
Snapshot detail was unavailable because the demo had no saved snapshot.
Older unreferenced PNGs in the directory must not be counted as final-run proof.

Axe 4.10.3 found disabled zoom (fixed) and serious contrast findings in 7/8 cells.
Contrast captures appear affected by opacity animation; full-opacity entrance
was fixed, but remaining contrast cannot be declared resolved without a new
audit. Comprehensive focus, 44px touch targets, headings, unique accessible
names, reduced motion and RTL icon/chart checks remain incomplete.
The browser closed; AI missing-key browser/network check was not reached.
**I cannot certify visual quality; the user must review the screenshots.**

Evidence: generated-artifacts/phase19/browser/evidence.json and
browser-isolation.json. Three sequential driver attempts occurred; only the
final manifest defines coverage. No concurrent browser/database harnesses.

## Historical question diagnosis

The current recognizer accepts “شو اكبر تالف؟”. No historical request identifier,
timestamp or retained question text links that phrase to one metadata record.
It would be false to assert a unique historical cause. No prompts/questions
were retrieved or logged. Quota/provider/circuit failures remain possible, not
proven causes; the new messages distinguish them for future requests.

## Publication

| Check | Result and evidence |
|---|---|
| Secret names and production filter | PASS: server-only Gemini configuration retained; startup still strips owner/bootstrap/seed credentials |
| Cookies/headers, CSRF, roles, limits | PASS automated API regression; actual published proxy behavior NOT VERIFIED |
| Startup privileges and FORCE RLS | PASS fresh production proofs after removing unnecessary demo UPDATE grants on immutable tables |
| First manager and first Platform Admin bootstrap | PASS: 9 checks each in disposable production-mode clusters |
| Seeded identities denied in production | PASS: all five identities rejected in both production-mode proofs |
| Captured bootstrap/server logs | PASS scoped proof: no token, link or password; not an exhaustive repository-history audit |
| Safe errors and AI data protection | PASS API/AI regression; current code messages reveal no provider response body/key |
| Tooling excluded from deployment | Existing app-specific build/launcher retained; no demo dependency on fixtures or shell |
| Backups/restore documentation | PASS documentation; FAIL actual platform rehearsal (not performed) |
| Full UI/accessibility gate | FAIL: partial matrix and no post-fix axe pass |
| Unconditional publish readiness | FAIL: do not publish on this evidence alone |

Use the corrected 15-step docs/PHASE10_PUBLISH.md. Optional AI credentials are
not a prerequisite for core functionality. NODE_ENV=production and
SEED_TEST_USERS=false are deployment overrides, not changes to development.
Replit production database is separate; do not copy development test identities.
Published HTTPS/proxy behavior and an actual platform backup/restore rehearsal
are not verified here. Rehearse restores only in a disposable project, never by
overwriting this project's live factory data. Database backups alone do not
restore object-storage files or authenticator encryption keys.

Official platform references checked:
- https://docs.replit.com/features/data-and-storage/development-and-production
- https://docs.replit.com/core-concepts/project-editor/app-setup/secrets
- https://docs.replit.com/features/data-and-storage/data-recovery

## Deliberately not built

No engine/calculation changes, extra product features beyond demo creation,
hard delete, admin tenant takeover, external messaging or publishing.
test-data/, expected/ and tools/ remain unchanged.

## Test failures fixed during this phase

- Embedded demo fixture comparison normalized BOM and CRLF, without changing
  fixture bytes or numeric expectations.
- Existing factory memberships returned null for the newly added demo flag;
  discovery now returns false. This fixed a login-response schema failure.
- Arabic count formatting expected the old term in the UI-only snapshot;
  updated that snapshot to the approved terminology.
- Adding production builds to the complete harness exposed its missing Vite
  PORT/BASE_PATH configuration; the build check now supplies those explicitly.
- Production security proof rejected unnecessary demo UPDATE privileges on raw
  and history tables. Removed them; retained strict startup privilege checks.

## Final regression results

**PASS: one complete invocation after all executable changes.**
`pnpm --filter @workspace/api-server exec tsx src/scripts/test-isolated.ts --complete`
finished with PHASE19 COMPLETE GREEN:

- 136 API/AI tests; 55 engine tests; 11 formatting tests; 10 PDF tests.
- 55 English and 57 Arabic phrasing rows, including ten negative/refusal
  examples per language.
- 1771 EN/AR keys checked for parity and static references.
- TypeScript libraries, API and frontend; both production builds.
- Python verifier: all 52 checks.
- No changed files in test-data/, expected/ or tools/.

Log: generated-artifacts/phase19/full-suite.log.
Earlier failure logs are retained separately; the final log is not assembled
from fragments. MaxListenersExceeded warnings and a pg future-deprecation
warning were emitted; they did not fail tests and are not claimed resolved.

**PASS: fresh scale measurement**, 20 synthetic factories, 200,000 production
records, 100,000 events, largest file 50,000 rows. Three import attempts:
p50 24.65s, p95 37.93s. API p95: Runs 143ms, Comparison 77ms, Quality 540ms,
Source Drawer 106ms, Login 106ms. These are measured latencies, not a claim that
every performance target passed. Other-user probe requests returned 200.
Log: generated-artifacts/phase19/scale.log; full measurements:
generated-artifacts/phase9/scale-2026-10-11T00-33-09.781Z/measurements.json.

### Development preservation

| Table | Ethmar before → after | Najm before → after |
|---|---|---|
| Imports | 4 → 4 | 1 → 1 |
| Orders | 6 → 6 | 2 → 2 |
| Production records | 16 → 16 | 3 → 3 |
| Events | 9 → 9 | 3 → 3 |
| Quality issues | 2 → 2 | 2 → 2 |

SHA-256 of each factory's complete table-count/hash map, before = after:
- Ethmar: `a7b6aa699d56169e827cb7b45ab2da3a1658e32e2f1cf1a9262a84ea6c885564`
- Najm: `e577e146cc2b0a4e294b63c10748a8f268d778feccc16bf00eb980e69a24e7d1`

Browser, suite, scale and both production proofs each record unchanged=true.
See generated-artifacts/phase19/{browser,suite,scale}-isolation.json and
production-{manager,admin}.json. All isolated targets were cleaned up.

### Overall item status

1. AI configuration/failure handling: PASS automated evidence; real provider and
   missing-key browser proof not performed.
2. Language: FAIL full acceptance — terminology/parity work passes but heuristic
   mixed-language findings and comprehensive rendered grammar review remain.
3. Ask matching: PASS 112 phrasing rows and refusal/isolation tests. Historical
   phrase-specific failure cause is not recoverable from available evidence.
4. UX polish: FAIL full acceptance — help/disclaimer fixes done, but every
   page/state and Runs/Snapshots primary-action review was not completed.
5. Accessibility/responsiveness: FAIL partial matrix, as detailed above.
6. Demo factory exception: PASS API and 24 real-browser critical checks.
7. Publish readiness: FAIL final approval — production bootstrap proofs pass,
   but accessibility and actual backup/restore rehearsal remain open.
8. Regression/isolation/scale: PASS final complete run and fresh scale check.
