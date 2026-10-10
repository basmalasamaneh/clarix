# Phase 17 — constrained assistance and explanation UX

## Built

- Richer code-authored comparison relations and exact-decimal display templates.
- One compact Sources menu per statement, with separately labelled original
  metric links. AI output no longer repeats the downtime disclaimer.
- Guidance for all 23 locked issue codes, in Arabic and English: meaning,
  importance and concrete checks. Filenames/line references are added locally.
  Guidance works in Data Quality, issue details and import review without AI.
  List guidance follows the page's source/order/severity/group/archive filters.
- Ask boxes on Overview, Comparison and Data Quality. Code chips work while
  AI is OFF. Typed questions require current version-2 manager consent.
- At most three Overview next actions, computed by existing server data paths;
  optional AI ranking cannot add an action.
- Versioned, audited consent, including explicit typed-question disclosure.
  Old consent still permits the Phase 16 explanation but not new provider calls.
- Bilingual Help, consistent panels and explicit loading/error/quota/off/
  reconfirmation/unsupported states. Comparison details and reconciliation are
  collapsed by default.

## Fixed read-only intent catalogue

| Intent | Answer and validation |
|---|---|
| compare | Two current, active-source runs; existing comparison facts |
| metric | Scrap mass/rate, changeover or downtime for one owned run |
| extreme | Highest/lowest available non-red current metric, numeric server ordering |
| runs | Paginated current Blocked or Check runs, with catalogue reasons |
| issues | Paginated catalogue guidance for the owned run/current issue selection |
| status | Recorded run status and reasons |
| counts | Existing Overview approved-import/current-run/status counts |
| snapshot_changes | Existing snapshot-to-current changes; never edits the snapshot |
| causal | Standing non-causal answer, available figures and labelled checks |

All supplied run/snapshot IDs are scoped server-side. Unknown and foreign IDs
return the same 404. Archived sources are excluded. Lists have 20-item pages.
Natural-language entity context is bounded to 2,000 current runs; larger contexts
return unsupported rather than truncate and guess. Tied extrema return one
deterministically selected run; red/null metrics are not candidates.

## Validator and privacy boundary

Questions are capped at 500 characters. A conservative preflight rejects
instructions, SQL, emails/URLs, unsupported words, unknown entities and ambiguous
same-ID sources. Markup is stripped; known source names/order references become
aliases before provider input. Supported EN/AR vocabulary includes common
documented typos; arbitrary natural language is deliberately not supported.
Rejected questions get three example questions; chips remain usable.

The model selects an indexed candidate containing a fixed intent and already
validated parameters. It cannot emit executable tools, SQL or arbitrary parameter
values. Intent output must contain only a valid integer choice. Ranking must be
an exact permutation of the supplied IDs, without duplicates or extra fields.
Statements retain the Phase 16 whole-answer closed-language/reference validator.
Only canonical server text is rendered. One corrective retry is allowed.

Quality ranking receives IDs, catalogue codes, severity and groups, not local
guidance text, filenames, source cells or source labels. Questions are never
stored/logged; cache keys hash question/context and store only validated selection
metadata or canonical statements. Consent, limits, circuit breaker, cancellation
and factory cache boundaries are shared with Phase 16. No automatic AI requests
on page load; automatic guidance/next steps use code only.

## Added statement rules

- Ratio: B / A, displayed to two decimals, ROUND_HALF_UP.
- “About twice”: exact B lies within [1.95 × A, 2.05 × A], inclusive.
- “About half”: exact B lies within [0.475 × A, 0.525 × A], inclusive.
- Relative difference: (B − A) / A × 100, displayed to one decimal,
  ROUND_HALF_UP. Wording explicitly says relative to A, not percentage points.
- Missing/red values, non-positive A and negative B produce no ratio.
- Tolerance tests use multiplication before division; no floating-point
  quantities. These are explanatory relations, not new engine metric definitions.
- Minutes use AR/EN grammatical categories with Latin digits; tested at
  0, 1, 2, 3, 10, 11, 100, 0.75 and negative values.
- Every relation cites both underlying metric facts/source links.

## Verification

The complete suite was run with one isolated invocation:

```
pnpm --filter @workspace/api-server exec tsx src/scripts/test-isolated.ts --complete
```

Evidence: `generated-artifacts/phase17/complete-suite.log` and
`generated-artifacts/phase17/suite-isolation.json`. The golden import test now
also checks AI code answers through the real API for each Ethmar/Najm scenario,
including blocked answers, counts, run lists, issues, comparison and extrema.
Dedicated tests cover exact wording thresholds, catalogue completeness,
question preflight, malicious choices/ranks, consent upgrade, roles, cache,
retry/429, snapshot isolation and absence of stored question text.

| Complete-run check | Result |
|---|---|
| API + AI | 124/124 PASS |
| Calculation engine | 55/55 PASS |
| Formatting | 11/11 PASS |
| PDF rendering | 10/10 PASS |
| Translation parity | 1,584 EN/AR keys PASS |
| TypeScript | Libraries, API, frontend PASS |
| Python verifier | 52/52 PASS |
| Cleanup and development protection | PASS |

The run ends with `COMPLETE SUITE: GREEN (all checks and isolation cleanup passed)`.
The final complete run includes the quality-filter correction and assertions
that guidance totals/IDs match the filtered Data Quality API. That correction
was covered by the complete API/TypeScript suite, not a second browser pass.
Existing non-failing listener warnings and seven informational translation-audit
findings remain; no calculation or fixture changes were needed.

### Browser evidence and limits

One isolated pass: foundation preparation 9/9, manager UI sign-in, baseline
approval, missing-scrap import review guidance and UI approval passed. Version-1
consent was reconfirmed through the actual UI to version 2 (200 + audited change).
Comparison explanation, unique source-menu links and Source Drawer, collapsed
details/reconciliation, quality issue explanation/ranking, EN highest-scrap and
AR import-count questions, non-causal response, unsupported instruction refusal,
and clearing the question on scope/language changes were observed.

**Partial, not a complete browser pass:** the driver selected a nonexistent
Counts chip on Comparison (that page has a Compare chip), interrupting the OFF
autoload/usage-count check and later the Analyst journey. The selector is fixed
in the retained driver but was not rerun. Viewer browser verification was not
reached. Server-side OFF zero-call and Manager/Analyst/Viewer access checks passed.

Thirteen captures: 8 consent reconfirmation cells (360/1280 × EN/AR × light/dark),
3 Comparison cells (360 EN light/dark; 360 AR light), 1280 EN light OFF Comparison,
and 1280 AR light unsupported Ask. Their recorded DOM widths matched the viewport.
Missing: remaining Comparison cells, Quality/Overview/verified-Ask matrices,
Help, 768px and import-review screenshots, and complete loading/error/quota
presentation coverage. **I cannot certify visual quality.**
Evidence: `generated-artifacts/phase17/browser/evidence.json`, `harness.log`,
`images/` and `generated-artifacts/phase17/browser-isolation.json`.

### Ordinary development data before and after

Both full-suite and browser proofs have `unchanged: true` and an unfiltered
observer. All 25 table fingerprints and role fingerprints matched.

| Factory | Imports | Orders | Raw rows | Snapshots | AI state | AI usage |
|---|---:|---:|---:|---:|---:|---:|
| Ethmar | 4 → 4 | 6 → 6 | 41 → 41 | 1 → 1 | 1 → 1 | 2 → 2 |
| Najm | 1 → 1 | 2 → 2 | 8 → 8 | 0 → 0 | 0 → 0 | 0 → 0 |

Combined SHA-256 of sorted compact JSON factory table-count/hash maps,
identical before and after each run:
- Ethmar: `88290865da56267d9a2928d3536b4fa2ec61e5c63f38087e13092a3960c1a475`
- Najm: `492ec2aca1e564c5c5a9ce5f5794d127b1a72f681701ca6a1633c00924652efe`

Three synthetic Gemini 3.8 Flash calls, no ordinary factory data:

| Task | Result | Tokens | Latency |
|---|---|---:|---:|
| Explanation | PASS | 1844 | 2120 ms |
| Issue ranking | PASS | 222 | 2019 ms |
| Arabic question routing | PASS | 136 | 2381 ms |

Evidence: `generated-artifacts/phase17/live-smoke.json`. No extra live calls.
These prove the constrained provider protocol on synthetic input, not arbitrary
natural-language understanding.

## Manual steps

1. As Factory Manager, open Settings → Use AI assistant. If already enabled,
   choose Review and confirm again. Read the version-2 disclosure and confirm.
   Do not enable the unpaid service for confidential/sensitive/personal data.
2. Open Overview. Code-defined next actions appear automatically. Try the
   approved-import/run count chip with AI OFF; it still works.
3. With current consent, ask “Which run has the highest scrap rate?” or
   “كم عدد الاستيرادات المعتمدة”. Submit one question at a time.
4. Open Comparison and choose two runs. Try the comparison chips and Explain in
   simple words. Open Sources (n), select a labelled metric, and inspect its rows.
5. Ask “Did the stop cause the scrap?” on Comparison. The answer refuses a causal
   conclusion and shows the recorded figures.
6. Expand detail tables or reconciliation only when needed.
7. Open Data Quality. Read code-ranked guidance, open an issue, and choose
   Explain this issue / What should I check first? for optional AI ranking.
8. In Data Imports → Check & approve, read the same catalogue-based guidance.
9. To ask about a snapshot, use “what changed since snapshot <snapshot UUID>”.
   Unknown/foreign snapshots cannot be accessed. No AI text is saved in it.
10. Switch language/theme. Disable AI in Settings to stop provider requests;
    chips, guidance, existing numbers and next actions continue to work.

## Deliberately not built

Free chat/history; unrestricted AI prose; column mapping suggestions; saved AI
text in snapshots/PDFs; trends; additional real providers; voice/images; new
engine formulas. No changes to test-data/, expected/, tools/ or calculation code.
Nothing was published.
