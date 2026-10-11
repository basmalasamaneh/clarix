# Phase 19 — implementation and readiness evidence

Nothing published. This is **not an unconditional publish approval**.
The original Phase 19 results below are historical. **Phase 19b completion and
remaining verification limits are recorded at the end of this report.**

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
| Backups/restore documentation | PASS documentation; actual rehearsal is a post-publish step, not a pre-publish blocker |
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

## Phase 19b — string audit disposition

Every finding emitted at the start of Phase 19b is listed below. Intentional
entries are exact-key/path exceptions with reasons, not globally ignored rules.
New unreviewed audit findings now fail the build. The audit remains heuristic:
zero unresolved findings is not a claim to detect every possible dynamic string.

| Finding | Disposition | Reason/fix |
|---|---|---|
| accounts/shared.tsx: `v.length` | Intentional false positive | TypeScript comparison syntax, not rendered text |
| brand.tsx: `Clarix` | Intentional | Product name remains Latin in both languages |
| error-boundary.tsx: `Something went wrong` | Fixed | Uses translated error heading |
| error-boundary.tsx: `Try again` | Fixed | Uses translated retry action |
| error-boundary.tsx: multiline fallback body (manual review) | Fixed | Uses translated fallback description |
| report/render.tsx: `Clarix` | Intentional | Same Latin product name in printed report |
| session.tsx: `readLocal`, occurrence 1 | Intentional false positive | TypeScript generic/function expression |
| session.tsx: `readLocal`, occurrence 2 | Intentional false positive | TypeScript generic/function expression |
| prefs.english | Intentional | English endonym helps English readers select their language |
| help.reportBody | Intentional | Chrome/Edge are official browser names, PDF the file format |
| rpt.browserNote | Intentional | Official supported-browser names Chrome/Edge |
| sec.strength.common | Intentional | Literal weak-password example, not untranslated prose |
| sec.mfa.leadOff | Intentional | Google Authenticator/Microsoft Authenticator are app names users locate |

Audit command: `pnpm --filter @workspace/clarix run check:i18n`.
After fixes: **0 unresolved findings; 10 intentional occurrences**, 1771 keys
with EN/AR parity. Re-run with the final complete regression below.

The backup/restore rehearsal is explicitly a **post-publish** operational step
in PHASE10_PUBLISH.md step 15. It does not block pre-publish readiness.

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
   but accessibility remains open. Backup/restore rehearsal is a post-publish
   operational step, not a pre-publish gate (Phase 19b clarification).
8. Regression/isolation/scale: PASS final complete run and fresh scale check.

## Phase 19b — page polish and batched browser results

Source-level review of **every requested state** is in
[PHASE19B_PAGE_REVIEW.md](PHASE19B_PAGE_REVIEW.md): empty, loading, error,
red-group blocked, role-denied, missing metric (never substituted with zero),
missing record and demo. N/A states have reasons. This is a code review, not a
claim that every state was independently triggered in the browser.

Fixed the translated/theme-aware crash fallback, unavailable-invitation primary
action, blocked-screen primary action, retry/home tap targets and pending retry
disablement. Snapshot detail now has Download PDF as its one primary action;
Add reconciliation is secondary. Live Comparison retains Save snapshot.
No metric values, API permissions or calculations were changed.

| Page | State/primary-action source review | Browser matrix | Primary action |
|---|---|---|---|
| Overview | PASS | PASS | Suggested Compare; empty state Import |
| Data Imports/history | PASS | PASS | New import; demo read-only |
| Upload / Map / Check import steps | PASS | Not separately exercised this phase | Upload / Save and check / Approve, respectively |
| Production Runs | PASS | PASS | Compare selected runs |
| Comparison | PASS | PASS | Save snapshot; empty state Choose runs |
| Data Quality | PASS | PASS | Apply filters |
| Saved snapshots | PASS | PASS | Search |
| Snapshot detail | PASS | PASS | Download PDF |
| Factory Settings | PASS | PASS | Save within the active form |
| Data sources section | PASS | PASS | Selected source Archive/Restore confirmation |
| Members | PASS | PASS | Invite member |
| Account + security sections | PASS | PASS | Submit the active form; destructive actions secondary |
| Platform | PASS | PASS | Add factory; Create demo secondary |
| Help | PASS | PASS | Informational; no artificial action added |
| Login | PASS | PASS | Sign in |
| Reset/recovery | PASS | Limited real-route check PASS | Submit; success Sign in |
| Invitation | PASS | Unavailable-state check PASS | Accept; unavailable Go to login |
| Source drawer | PASS | FAIL to verify (driver timeout) | Close |
| Not found | PASS | No standalone browser batch | Home |
| Crash fallback | PASS | No standalone browser batch | Retry |

Browser matrix PASS means EN/AR × light/dark × 360/768/1280 screenshots and
layout measurements, with axe at 360/1280. It does not imply all interaction
states passed. Account and Settings forms remain separate tasks; modal/form
confirmation has its own primary submit action.

### Accessibility coverage

- **56/56 page × language × theme batches**, a fresh Chromium process per
  attempted batch, up to two retries allowed for failed batches.
- **112/112 axe combinations completed** (original 88 plus 24 for added page
  groups), **168 viewport cells**, **zero axe violations**, including zero
  serious/critical violations; zero document horizontal-overflow findings.
- All 14 page groups in the table with Browser matrix PASS completed.
  **No matrix combination remains unrun.**
- Phase 19's two reported rule categories—disabled zoom (`meta-viewport`) and
  text contrast (`color-contrast`)—now report zero violations on all 112 cells.
  This confirms the previous code fixes under axe, not an exhaustive WCAG
  certification or a manual pinch-zoom test.
- Additional real-route reset and unavailable-invitation checks: 16 viewport
  states (360/1280 × EN/AR × light/dark), no overflow. These are not extra axe
  cells. The unavailable-invitation retry corrected a short invalid test token
  to a syntactically valid nonexistent token.
- Diagnostic injected states: source loading/error/empty, four combinations
  each; snapshot loading/error, four each, all PASS. Snapshot unknown-ID route:
  four real-route checks PASS. Injection tests prove the UI branch renders,
  not that a real server naturally produced those conditions.

Remaining browser limits, listed exactly:
1. Source drawer interaction and genuine CDP page-scale zoom probe: **unverified**.
   First optional probe rejected its response waiter on browser teardown; after
   fixing that driver handling, a narrow retry timed out on its assumed metric
   selector. No actual zoom gesture/page-scale change was accepted as evidence.
2. Real empty-tenant browser flow: not run; the audited demo has two imports and
   four runs. Empty-source response injection is reported separately above.
3. Import wizard editing states, standalone crash and not-found pages: reviewed
   in source, not separate browser batches. Public reset/invite have no 768px
   check or axe pass in this phase.

The initial oversized invocation was interrupted; completed coverage was retained
with provenance and remaining work resumed in sequential small groups. Failed
attempts are never counted as passes. A source-code readiness regex also mistook
an arrow function's `>` for the end of a JSX tag; this driver-only assertion was
corrected without changing application behavior. All primary accepted matrix
batches passed their first completed attempt.

Evidence: `generated-artifacts/phase19b/browser-evidence.json` contains every
accepted cell's run, attempt, screenshot and proof path plus retained failures;
`browser-isolation.json` aggregates eight unchanged before/after proofs.
Screenshots are in the same directory. Do not count screenshots from the
interrupted invocation as additional completed cells.

The full state table retains its **source-reviewed** label deliberately.
The completed matrix replaces Phase 19's 8/88 coverage gap; the additional
interaction gaps above are not hidden. Nothing was published.

### Phase 19b final regression and data preservation — PASS

Ran the full regression **once**, after all application and audit-script changes:
`pnpm --filter @workspace/api-server exec tsx src/scripts/test-isolated.ts --complete`.
Exit code 0; log ends **PHASE19B COMPLETE GREEN**.

| Check | Result |
|---|---|
| API + AI | 136 passed |
| Engine | 55 passed |
| Formatting | 11 passed |
| PDF | 10 passed |
| String audit / EN-AR parity | 1771 keys; 0 unresolved, 10 intentional occurrences |
| TypeScript | Libraries, API and frontend passed |
| Production builds | API and frontend passed |
| Python verifier | All 52 checks passed |

Evidence: `generated-artifacts/phase19b/full-regression.log` and
`regression-isolation.json` (`unchanged: true`). Existing listener-limit and pg
deprecation warnings remain non-failing; this phase did not change that code.

| Records | Ethmar before → after | Najm before → after |
|---|---|---|
| Imports | 4 → 4 | 1 → 1 |
| Current orders | 6 → 6 | 2 → 2 |
| Production records | 16 → 16 | 3 → 3 |
| Events | 9 → 9 | 3 → 3 |
| Data quality issues | 2 → 2 | 2 → 2 |

SHA-256 of the complete per-factory table-count/hash map, **before = after**:
- Ethmar: `451309d435267fe1c846bad57de139c4535c59320aed6c0b5a4924bf1beaa464`
- Najm: `1d2e320074c7c47591b6ff61b9b2e1f91acec2ae2ec7c0aa416c772f4ab7b6f6`

Fingerprints are from this Phase 19b run, not copied from Phase 19. All accepted
browser-group proofs also preserve their own before/after observations.
No test wrote to the ordinary Ethmar/Najm data. No engine, calculation rules,
test-data/, expected/ or tools/ edits. No new product features; no publishing.

**Phase 19b outcome:** string-audit acceptance PASS; complete source-level
page/state/primary-action review PASS; all planned batched axe combinations
PASS; checklist update PASS; one complete regression PASS. The extra drawer/
actual-zoom probe and unexercised state paths listed above remain unverified,
not passed. This report does not claim exhaustive interactive accessibility.
