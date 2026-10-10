# Phase 4 import-wizard fixes

## What I built

- Complete distinct-code inventory from all raw event rows, with counts, samples,
  paginated display and a required choice for every code. Only clear words in the
  code or mapped reason supply suggestions. Both the button and server check gate
  prevent continuing with unassigned codes.
- Explicit Ignore retains the existing engine warning and exclusion behavior.
  Friendly bilingual text shows code, count, excluded source rows, actor and
  timestamp. Decision history is server-authored and retained across remapping.
- Concrete issue values/rows, targeted mapping links, the unmapped-changeover
  hint, and refreshed issues/counts after changing settings and checking again.
- Approval with errors requires acknowledging a displayed error list. Replacement
  confirmation lists affected orders. Approved imports use recorded historical
  replacement counts and have no approval controls.
- Duplicate detection requires matching contents and mapping, plus a prior import
  still current for at least one order. Mapping changes and fully superseded
  imports have different, nonblocking messages. Factory-scoped approval locking
  protects the decision and replacement transaction.
- Added the requested post-MVP idea to docs/CLARIX_SPEC.md.

## What I deliberately did not build

No Phase 5 features, engine-rule changes, fixture edits, ignored-code severity
change, charts, comparisons, AI, reports or production deployment.

## Checks that actually ran (and which ones I could not run)

- 9 import API tests/subtests passed, including the five requested acceptance
  scenarios, audited ignored choices, all 26 golden fixture folders, tenant
  isolation and replacement history.
- 11 canonical database/RLS tests passed; 55 engine tests and all 52 Python
  verification checks passed. Workspace TypeScript checks passed.
- Additional focused tests cover codes beyond the first-20 preview, counts,
  suggestions and mapping-identity normalization: 2 passed.
- Actual browser password login as Ethmar Analyst; upload, required choices,
  ignore details, actor/time, source rows, changeover hint, field-focus jump,
  template save, recheck refresh, scenario-07 error acknowledgement and approval.
- The browser found and we fixed an enabled-looking missing-choice button and a
  hidden nonblocking changed-mapping banner. Focused follow-up browser checks
  completed changed mapping approval, original A again after B, and A again after
  a different file version fully superseded it. Consecutive identical approval
  was blocked.
- Checked mapping, issue/check, approval dialog, approved state and duplicate
  banners at **360 / 768 / 1280 px**, each in **English/LTR and Arabic/RTL**,
  each in **light and dark**: all 12 combinations per screen/state.
  Duplicate-current, mapping-differs and fully-superseded messages were covered.
  Page overflow and dialog bounds were checked; representative captures were
  visually inspected. Captures are in generated-artifacts/import-verification/.
- Engine and protected fixture directories have no diff.
- No production or fresh-database provisioning test, load test or formal
  assistive-technology audit was run.
- Storage operations emitted Node stream listener warnings during repeated
  browser approvals. Approvals succeeded; the underlying SDK warning remains
  an investigation item, not a demonstrated approval failure.

## Decisions I made that are not in the spec

- Ignore is wizard/audit metadata, not a fourth engine event type.
- Equality excludes source display name and audit metadata; it includes columns,
  file assignments, formats, unit settings, tolerances, code meanings and ignored
  choices. Ignored-code sets are normalized before equality checks.
- Removed the obsolete hash-only unique index; the current-aware duplicate rule
  is enforced under the existing per-factory transaction lock.
- Historical replacement counts for older imports are recovered from immutable
  order-history rows where available.
