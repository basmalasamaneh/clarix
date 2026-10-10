# Phase 15 — frozen snapshot PDF reports

## Choice and scope

| Option | Trade-off |
|---|---|
| Server PDF library | Direct download, but no proven Arabic shaping/font stack in the existing production build. |
| Server headless Chromium | Good HTML/Arabic support, but the deployment does not provision a verified browser binary. A development binary is not production proof. |
| **Browser print document — chosen** | Uses the user's browser and embedded fonts, with no server browser dependency. Opens a print dialog; the user selects Save as PDF. |

Verified against Chromium 152 and the **production-built frontend**, using an
isolated test API. This is not a claim that a published deployment was tested.
Chrome/Edge 131+ is recommended for CSS page headers/footers. Other browsers
and native phone print dialogs have not been certified. Nothing was published.

## Built

- Snapshot detail: Download PDF, independent EN/AR choice, frozen-data note,
  loading, recoverable error, print-again and close controls. Help entry.
- A4, light-only print document: page headers/footers and counters, embedded
  Inter and IBM Plex Sans Arabic, Latin digits, RTL/LTR and vector charts.
- Frozen metadata, run/source/import identities, statuses using words/icons,
  stored figure tables/charts/sentences, separate downtime section,
  original issue references, reconciliation history, method and provenance.
- Import IDs and snapshot ID are the approved ID exception. Other internal
  database IDs are excluded. Original issue references include file/physical
  line; columns appear where stored in the snapshot's metric references.
  A column absent from historical issue metadata is not invented.
- Values remain strings. Valid table values survive blocked groups; blocked
  bars stay omitted. Reconciliation still refuses every blocked-group figure.
- Server factory/role checks, identical foreign/unknown 404s, CSRF and no-store.
  Viewer may append only their own export audit, not edit snapshots.
- Limits: 10 preparations per user/factory per 10 minutes; transaction-scoped
  concurrency lock; 5-second query budget; 2 MB payload; 100 reconciliation
  records and 5,000 issue references. Oversize reports are refused, not cut off.
  Browser: 12 MB HTML limit and 15-second layout/font wait.
- Audit says **prepared**, not downloaded: the server cannot observe whether
  the user saved or cancelled the print dialog. No report content is logged.
- User text is escaped and formula-prefixed text neutralised. Numeric signs
  are preserved. The script-free sandboxed document uses no remote resources.

Not built: public shares, email, schedules, AI summaries, live-comparison
exports, new metrics or changed calculations. Fixtures, expected results and
tools were not changed.

## Verification

| Check | Result |
|---|---|
| Existing full suite | 110 API tests, 55 engine tests, all 52 Python checks passed |
| Report renderer | 10 tests passed: injection, IDs, exact signs, missing/blocked values, RTL, embedded-font-only enforcement |
| Existing formatting/preferences | 11 tests passed |
| Translation parity | 1,452 EN/AR keys; static-key check passed |
| Compile/build | TypeScript checks and production frontend/API builds passed |
| Export permissions | Manager, Analyst, Viewer allowed; Platform Admin denied; foreign and unknown snapshots identical 404 |
| Frozen/history | Replacement imports do not alter exported comparison; all saved reconciliation records included, including exact negative differences |
| Limits/audit | Persistent quota, audit actor/language, filename, size/history caps and timeout handling passed |
| Actual print flow | Export button prepared a sandboxed print document in the production-built frontend |
| PDFs | 7 PDFs: baseline EN/AR, blocked 07 EN/AR, blocked 05 EN, superseded EN, injection EN |
| Extracted figures | Every non-null stored metric/difference display string found; includes 5, 10, +5, 240, 360, +120, 45 |
| Fonts/pages | All PDFs A4; Poppler confirms every font embedded. Arabic pages rasterised |
| App layouts | 24 captures: snapshot export and Help × 360/768/1280 × EN/AR × light/dark; no horizontal document overflow |
| Error/loading | Simulated timeout, Arabic/dark/360px, both states captured |

PDF extraction verifies the stored numeric strings are present; it does not
claim a formal proof that every digit in metadata, page counters and references
is a metric. Renderer tests separately verify missing values and signed numbers.
The Arabic raster is supplied for your visual review; automated font/text checks
do not certify visual quality. Dates in the report are UTC.

Non-failing warnings: existing worker listener warnings in the full suite,
large frontend bundle warning and a tooltip sourcemap warning during build.

## Development data untouched

| Factory / table | Before | After |
|---|---:|---:|
| Ethmar imports | 4 | 4 |
| Ethmar orders | 6 | 6 |
| Ethmar raw rows | 41 | 41 |
| Ethmar snapshots / reconciliations / snapshot audit | 1 / 0 / 1 | 1 / 0 / 1 |
| Najm imports | 1 | 1 |
| Najm orders | 2 | 2 |
| Najm raw rows | 8 | 8 |
| Najm snapshots / reconciliations / snapshot audit | 0 / 0 / 0 | 0 / 0 / 0 |

The unfiltered observer checked all development table counts and content
fingerprints, factory scopes and roles: `unchanged: true`. Full before/after
hashes are in `generated-artifacts/phase15/browser-isolation.json`.

| Factory / table | Fingerprint before **and** after |
|---|---|
| Ethmar imports | `eadd04fb1281a44b06510508a519c529` |
| Ethmar orders | `a1a53478a23205c57e01a3e5e97462e5` |
| Ethmar raw rows | `c7b57e4efde355225dcb0b0532bda377` |
| Najm imports | `908616913fc73719d0d7f0e24fcf993c` |
| Najm orders | `8faf467db5915c93cff82a90e68d0c42` |
| Najm raw rows | `894e5c5ae9cdb4d1854cd13c767dbd0f` |

Browser results, PDFs, extracted text and font checks are in
`generated-artifacts/phase15/2026-10-10T21-09-28-566Z/`.
Samples use disposable test data, not the user's development snapshots.

## Exact manual steps

1. Sign in as a Factory Manager, Analyst or Viewer.
2. Open **Snapshots**, then open a saved snapshot.
3. In **PDF report**, choose **English** or **العربية**.
4. Click **Download PDF** and wait for the browser print dialog.
5. Select **Save as PDF**, A4, all pages. Disable the browser's own headers
   and footers; the report supplies its own. Review the preview.
6. Save using the suggested `clarix-<factory>-<snapshot>-<language>.pdf` name.
7. To use the other language, close the prepared report, select it and click
   Download PDF again. **Print again** reopens the already prepared document.
8. If preparation fails, use **Try again**. For a rate limit, wait ten minutes.
   A size-limit error means the complete report cannot fit the current cap.

For the newest reconciliation records, prepare the report again rather than
using Print again. A cancelled print dialog does not erase its preparation audit.
