# Phase 16 — Gemini foundation

## Closure verification — 2026-10-11

The two requested closure items now **PASS**. This supersedes the earlier
single-run and disable-confirmation limitations below; it does not claim the
unrequested full responsive AI state screenshot matrix was completed.

One invocation, one isolated target, sequential checks:

```
pnpm --filter @workspace/api-server exec tsx src/scripts/test-isolated.ts --complete
```

API + AI 120/120; engine 55/55; formatting 11/11; PDF 10/10;
translation parity 1,506 EN/AR keys; TypeScript libraries/API/frontend;
Python verifier 52/52. All passed in this run, including cleanup and unchanged
development fingerprints. No application fix was needed. The only changes
were a complete-suite runner option, the focused browser driver and this report.

Log: `generated-artifacts/phase16-close/complete-suite.log`, ending
`COMPLETE SUITE: GREEN (all checks and isolation cleanup passed)`.

Real browser UI proof, in a subsequent isolated run:
- Manager signed in through the UI; enabled AI through disclosure confirmation;
  comparison Explain button was present.
- Manager opened OFF confirmation. Consent remained ON until confirmation.
  Confirming produced HTTP 200, enabled:false and visible Off status.
  Reloading Comparison showed AI-off state and no Explain button.
- Analyst and Viewer each signed in through the UI. Settings denied access,
  consent controls were absent, both attempted enable and disable returned 403,
  consent stayed OFF and the comparison Explain button was absent.
- No AI explanation was generated; no live provider calls. No response mocks.
  Six screenshots plus live DOM assertions are recorded in
  `generated-artifacts/phase16-close/browser/evidence.json`.

Both `suite-isolation.json` and `browser-isolation.json` under the same evidence
directory report unchanged counts/content fingerprints for all 25 protected/
import table entries, both ordinary factories, and database role fingerprints.
Before and after counts in both runs:

| Factory | Imports | Orders | Raw rows | Snapshots | AI state | AI usage |
|---|---:|---:|---:|---:|---:|---:|
| Ethmar | 4 → 4 | 6 → 6 | 41 → 41 | 1 → 1 | 1 → 1 | 2 → 2 |
| Najm | 1 → 1 | 2 → 2 | 8 → 8 | 0 → 0 | 0 → 0 | 0 → 0 |

Combined SHA-256 of each factory's sorted, compact JSON table-count/hash map,
identical before and after:
- Ethmar: `83182d4a41a572fc396430fa34dc89f2f3ab392d894641ea4680ee0791704c6c`
- Najm: `a926bd9b7fe55c14e1e6166b719a3d6b88dd293bdb318d522408458a980c31fc`

The pre-existing Ethmar AI rows above were preserved, not created by this
verification. Calculation code, test-data/, expected/ and tools/ are unchanged.

## Provider and current Google documentation

Official research and links: [PHASE16_GEMINI_RESEARCH.md](PHASE16_GEMINI_RESEARCH.md).
Gemini 3.8 Flash has free input/output access in the pricing documentation.
Google's unpaid-service terms allow inputs and outputs to improve products
and permit human review. They prohibit confidential, sensitive or personal
information. A minimised business summary is not automatically non-confidential.
Regional paid-service requirements apply; read the linked terms before enabling.
Project-specific RPM/TPM/RPD quotas are visible in AI Studio, not fixed in Clarix.

Direct server-only Gemini API; no new SDK, billing proxy or browser credential.
GEMINI_MODEL selects the model. GeminiProvider and deterministic FakeProvider
implement the same cancellable interface. Adding a provider is confined to the
provider module. Fake injection is restricted to the disposable test environment.

One live synthetic-baseline call: **PASS**, Gemini 3.8 Flash, **4,658 ms**,
**1,565 total tokens**. Structured output passed the production validator.
Evidence: `generated-artifacts/phase16/live-smoke.json`. No development factory
data was sent; no key, full prompt or answer was printed.

## Built

- Factory Manager consent, default off, explicit bilingual disclosure and
  confirmation; append-only actor/time/old/new audit. Other roles cannot change it.
- Viewer/Analyst/Manager explanations; Platform Admin denied. Factory context
  comes only from the authenticated session, not a question or request factory ID.
- Comparison and frozen-snapshot facts from stored engine values. Snapshot
  context also includes the latest saved reconciliation's allowlisted figures.
  A standalone quality-summary facts builder is available for future tasks;
  there is deliberately no quality-assistant UI.
- Provider package excludes raw rows, source cells, files/filenames, free text,
  author names, emails, notes and titles. Safe order IDs and fixed issue codes
  are allowed. Local source targets stay in Clarix rather than being sent out.
- Explain in simple words, reusable AIPanel, visible facts, Source Drawer,
  consent controls and Help, English/Arabic, light/dark and responsive layout.
- Persistent tenant-scoped usage metadata, caps, circuit state and bounded cache.
  One corrective retry for invalid structured output, then the existing
  code-template explanation. Timeouts/network/quota failures use safe messages.
  No model text is saved into snapshots or PDFs.

## Important validation limitation

This is **constrained selection, not unrestricted AI prose generation**.
The model chooses and orders 3–5 server-authored statements. Validation requires
matching type, wording and the exact reference set, allowing limited digit,
sign, percent spacing, grouping and trailing-zero normalisation. Display
rounding comes from existing server metric displays, never the model.

This rejects wrong figures, wrong references, higher/lower reversals, invented
entities, status changes, causal assertions, unlabelled hypotheses, markup,
links and execution commands. Optional hypotheses are explicitly possibilities
to check, with a check method; they are never conclusions. Only canonical
server wording is returned, not the raw validated response.

Blocked groups produce unavailable AI facts, including scenario 05's retained
table value. The existing table, engine and reconciliation rules are unchanged.
Downtime remains separately recorded, with no assumed causal explanation.

## Configuration

Secret: `GEMINI_API_KEY`.
Non-secret: `GEMINI_MODEL`, `AI_DAILY_CAP`, `AI_USER_PER_MINUTE`,
`AI_TIMEOUT_MS`, `AI_CACHE_SECONDS`, `AI_BREAKER_FAILURES`, `AI_BREAKER_SECONDS`.

Development model is `gemini-3.8-flash`; local limits are 50 explanation requests
per factory/UTC day, 3 per user/minute, 12-second total provider deadline,
300-second cache reuse, and a breaker after 3 failed requests for 60 seconds.
These are Clarix safety caps, **not Google limits**. A corrective retry can
make two provider calls within one explanation request and one total deadline.
Cache hits avoid provider calls but still count toward request caps.

Set the model and desired limits in deployment configuration separately before
using AI in a published app; this phase does not publish. Missing configuration
leaves the normal app usable and AI unavailable. Every factory remains off
until its manager explicitly enables it.

Each factory stores at most one cached answer; reuse expires after the configured
TTL. Expiry prevents reuse, not immediate physical deletion of the last stored
cache entry. Interaction auditing stores metadata only, not prompts/responses.
Consent-off changes wait for a bounded in-flight explanation before committing;
no subsequent call may begin after OFF commits.

## Manual steps

1. Sign in as a Factory Manager and open **Settings**.
2. Find **Use AI assistant**. It starts off.
3. Read the disclosure. Do not enable the unpaid service for confidential data.
4. Choose enable, tick the confirmation checkbox and confirm.
5. Open **Comparison**, select two runs and click **Explain in simple words**.
6. Expand **Show used facts**; use **Show source** to open original rows.
7. Open a saved snapshot and use its separate explanation button. Its figures
   come from the frozen snapshot, not the current replacement import.
8. A Viewer or Analyst can use the same explanation controls but cannot enable AI.
9. Return to Settings and disable AI. Comparison/snapshot panels show the off
   explanation after refresh and the server makes no provider call.
10. A failed or limited request shows a safe code explanation and retry guidance,
    never unvalidated model prose. Nothing is added to the snapshot or PDF.

Not built: chat/free-form question UI, quality assistant, mapping suggestions,
trends, saving AI output, other real providers, images or voice. Fixtures,
expected results, calculation engine and tools are not edited.

## Verification

| Verification | Result |
|---|---|
| Existing API tests | All 110 existing tests passed in the full run |
| New AI tests | 10/10 passed after correcting the permission/locking issue |
| Engine / Python | 55/55 engine tests; all 52 verifier checks passed |
| Frontend | TypeScript, production build, 1,506-key EN/AR parity, 11 formatting and 10 PDF renderer tests passed |
| Consent | OFF zero calls; manager-only change and audit; authenticated Manager/Analyst/Viewer explanations; Platform Admin denied |
| Tenancy | Foreign/unknown snapshot identical 404; cross-factory AI state/usage denial; immutable usage metadata |
| Minimisation | All fixture families checked; injected titles, notes, reasons, filenames and raw fields absent from provider package |
| Validation | Exact baseline, Arabic digits, blocked 05/07; rejects unsupported numbers, missing/wrong refs, causality EN/AR, wrong relations/status/entities, links/markup/commands |
| Reliability | Corrective retry, safe fallback, cache, language separation, T11 question, daily/minute caps, upstream quota, breaker, timeout/cancellation and missing configuration passed |
| Live Gemini | One synthetic call PASS; 1,565 tokens; 4,658 ms |
| Browser | Actual manager sign-in, baseline upload, snapshot creation, default OFF, explicit UI enable persisted; comparison and snapshot verified answers; snapshot source drawer opened |
| Captures | 12 consent-dialog captures: 360/768/1280 × EN/AR × light/dark; one off panel, one loading panel and one snapshot/source drawer |

The first combined full run exposed failures in the new AI tests (117 passed,
3 failed counting their parent test). The existing tests passed. After fixing
the AI permission issue, the focused AI suite passed 10/10; the engine/Python
suites were then run successfully. This is not a claim of one final green
combined `pnpm test` invocation.

**Browser limitations:** The first driver stopped on an immediate stale status
read after enablement. A narrow resumed pass waited for the real consent PUT
and verified the persisted On state. The resumed run later stopped expecting
another verified answer after three actual requests; the default per-minute
cap likely applied, but the failed response was not retained, so its precise
status is unverified. No third browser pass or extra live Gemini call was made.
The complete answer/error/quota/unavailable screenshot matrix and the UI
disable-confirmation flow remain unverified. Server-side disable/zero-call
behaviour passed. Screenshots are best-effort evidence, not visual-quality
certification; I cannot certify visual quality.

## Development data protection

Both browser runs and the final API harness report `unchanged: true`, with
unfiltered observer verification, matching counts/content hashes and roles.
The added AI tables have zero ordinary-factory rows; no factory was enabled.

| Factory / table | Before → after | Matching content fingerprint |
|---|---:|---|
| Ethmar imports | 4 → 4 | `eadd04fb1281a44b06510508a519c529` |
| Ethmar orders | 6 → 6 | `a1a53478a23205c57e01a3e5e97462e5` |
| Ethmar raw rows | 41 → 41 | `c7b57e4efde355225dcb0b0532bda377` |
| Ethmar snapshots | 1 → 1 | `bb2ace61e2553343b5bacfed223d59ed` |
| Najm imports | 1 → 1 | `908616913fc73719d0d7f0e24fcf993c` |
| Najm orders | 2 → 2 | `8faf467db5915c93cff82a90e68d0c42` |
| Najm raw rows | 8 → 8 | `894e5c5ae9cdb4d1854cd13c767dbd0f` |
| Najm snapshots | 0 → 0 | `d41d8cd98f00b204e9800998ecf8427e` |

Reconciliation, AI state and AI usage counts remained 0 for both factories.
Complete before/after fingerprints: `generated-artifacts/phase16/api-isolation.json`,
`browser-isolation.json` and `browser-resume-isolation.json`. Test output:
`generated-artifacts/phase16/test-results.txt`. Screenshot/evidence directories:
`generated-artifacts/phase16/browser/` and `browser-resume/`.

Non-failing existing warnings: worker listener warnings in the full suite,
large frontend bundle warning and seven informational hardcoded-string findings.
