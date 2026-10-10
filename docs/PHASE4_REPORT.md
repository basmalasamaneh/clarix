# Phase 4 — Data Imports

## What I built

- Analyst/Factory Manager import wizard: upload, map, check and approve.
- Direct private object-storage uploads with server-side content/size validation,
  encoding/delimiter detection, per-file SHA-256 and first-20-row previews.
- Unmodified private originals; immutable raw cells with both physical line
  bounds. User-facing references use the first physical line.
- Editable column/unit/date/decimal/event-code mapping, deterministic suggestions,
  server-calculated samples, named versioned factory/source templates.
- Bounded synchronous job interface, progress metadata, paginated history/issues.
- Draft/checked/approved/rejected lifecycle, duplicate approved-content links,
  transactional confirmation of replacements and canonical insertion only for
  included rows. Quarantined/excluded rows remain available as raw evidence.
- Separate order/record/event history with factory context, FORCE RLS,
  tenant-safe foreign keys, lookup indexes, superseding import/time and
  database-enforced immutability, including owner-side triggers.
- Arabic/English and light/dark import screens, designed empty/error/loading
  states and a responsive approval dialog. Back navigation retains mapping edits.

## What I deliberately did not build

Comparison UI, the Data Quality centre, charts, reports, AI, reconciliation,
background queue infrastructure, user deletion or a history-browser feature.
Existing calculation code is reused; no duplicate browser calculations.

## Checks that actually ran (and which ones I could not run)

- Import API tests: 8 passing tests/subtests, including all 26 fixture folders
  through actual storage, mapping and calculation endpoints and comparison with
  inherited golden expectations. Approved results are checked against checked
  results and current canonical order counts.
- Explicit baseline numbers, Arabic cp1256, totals-only, duplicate uploads,
  identical bytes across factories, wrong extension, false CSV content,
  oversized metadata and unreadable number references.
- Replacement confirmation, history metadata, FORCE RLS, cross-factory reads
  and forged writes, foreign-key rejection, runtime UPDATE/DELETE denial and
  owner-side mutation trigger rejection.
- Canonical database suite: 11 passed after updating its old unconditional
  hash-uniqueness assertion to the approved-only policy.
- Foundation: 8 passed, including actual normal password login for all five
  seeded accounts. The separately gated fresh-database/non-bypass-owner check
  was skipped, not claimed as tested for this phase.
- TypeScript engine: 55 passed. Python verifier: all 52 passed.
- Workspace TypeScript checks passed. Protected test-data/, expected/ and
  tools/ have no changes.
- Real local Chromium login as Ethmar Analyst, file upload, mapping edits,
  template saving, back navigation, checking, reload and successful approval.
  The remote tester could not securely access the password and stopped without
  testing; it did not receive any password.
- Layout capture matrix: history, new upload, upload preview, mapping,
  validation, approval dialog, each at **360, 768, 1280** pixels, each in
  **English/LTR and Arabic/RTL**, each in **light and dark**. All 12 combinations
  per screen ran. No page overflow; dialog bounds explicitly verified.
  Representative images were visually reviewed. Mobile dialog gutters were
  corrected and dialog captures wait for opening animation to settle.
- This was not a comprehensive assistive-technology/WCAG audit, production
  deployment test or new-database provisioning test.

Verification creates labelled API verification/browser imports in development
history; these are retained rather than deleting evidence. Screenshots and the
layout result JSON are under generated-artifacts/import-verification/ and are
excluded from Git and publishing.

## Decisions I made that are not in the spec

- Separate history follows the user's explicit approval and is now documented
  in spec section 5. Archive old canonical rows and replace current rows in one
  transaction; no historical evidence or original upload is deleted.
- File-set hashes sort file hashes and ignore filenames/order, so renaming the
  same export does not bypass approved-content detection.
- Default file limit is 5 MB, factory-configurable up to a bounded 20 MB/file;
  total bytes are capped at four times the file limit.
- Use additive SQL migration for existing Phase 2 databases: Drizzle attempted
  to drop referenced composite uniqueness constraints. Never CASCADE those
  constraints. Fresh installations still use the schema definitions.
- Retain the earlier approved formula-cell rule: examine raw text cells before
  trimming; exclude numeric/date mappings; column-qualified references and one
  file-level informational issue. Golden fixtures remain unchanged.
