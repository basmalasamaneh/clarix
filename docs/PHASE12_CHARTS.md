# Phase 12 — implementation and verification

## Delivery status

Implemented, but **browser acceptance is incomplete**. Do not treat this report
as confirmation of the full responsive, accessibility, or theme/language matrix.
I cannot judge visual quality. Screenshots and measured checks are evidence of
specific rendered states, not a visual-quality approval.

## Built

- Server-provided `chart_spec` and four indicator specifications. Exact decimal
  strings, displayed values, hours, differences and source references reuse the
  existing comparison metrics. Numeric chart coordinates and cosmetic count-up
  frames are prepared on the server; the browser does not calculate metrics.
- Comparison: exactly two Recharts bar charts (scrap rate and changeover minutes
  with hours labels). Downtime remains a separate panel and indicator, not a third
  chart or an explanation of scrap.
- Four reusable KPI cards on Comparison and Overview, with neutral change
  wording and calculation/source links. Overview's KPIs describe its suggested
  pair, **not factory-wide averages or totals**.
- Overview: one current-order status stack. Its count links open the existing
  Runs status filter. Narrow stack segments themselves are not small touch targets.
- Bilingual fixed captions, how-to-read popovers, equivalent accessible tables,
  status words/icons, patterned Run B bars, glossary controls and Help glossary.
- 500ms bar motion and 450ms cosmetic count-up, with the exact final value
  immediately readable. Reduced-motion branches disable these effects.
- Archived-source exclusion and factory permissions reuse existing server paths.

### Approved blocked-value rule

A stored table value is not automatically eligible for plotting. Scenario 05
retains the original **10% table value**, while its blocked chart point has no bar
and says Not available. The chart contract preserves the raw value separately
from plotting availability. Scenario 07's unaffected table values remain intact.
No engine formulas, fixtures, golden expectations or tools were changed.

## Automated evidence

| Check | Result |
|---|---|
| Isolated import/API suite | **14 passed, 0 failed** |
| Golden-folder coverage | All 25 Ethmar folders plus Najm; forward and reversed comparisons |
| Added assertions | Chart/indicator values, display strings, hours, differences and refs equal existing tables/golden results; Overview counts/pair parity; blocked/missing versus real zero; signed geometry |
| Critical cases | API checks for 05, 07, 10 and 23; baseline 5/10/+5pp, 240/360 minutes and separate 45-minute downtime |
| Python reference check | **52 checks passed** |
| API/frontend TypeScript | Passed, including after the final wrapping fixes |
| Translations | 1,167 keys; EN/AR parity and static keys passed |
| Frontend production build | Passed before the final wrapping-only fix; warning for a 1,526.57kB main JS chunk (438.85kB gzip) |

The existing isolated suite exercises Viewer access and tenant denial. Browser
login in this attempt was **Factory Manager only**; no claim of browser login
verification for another role is made.

Evidence directory:
`generated-artifacts/phase12/2026-10-10T19-11-39-951Z-18b265a5/`

Includes `evidence.json`, `isolation-proof.json`, and 12 screenshots. These are
ignored generated artifacts, not permanent repository assets. The executable
driver is `scripts/phase12-browser.cjs`.

### Development data before and after

| Factory | Imports | Orders | Production records | Events | Raw rows | Issues | Total scoped rows* |
|---|---:|---:|---:|---:|---:|---:|---:|
| Ethmar before / after | 4 / 4 | 6 / 6 | 16 / 16 | 9 / 9 | 41 / 41 | 2 / 2 | 90 / 90 |
| Najm before / after | 1 / 1 | 2 / 2 | 3 / 3 | 3 / 3 | 8 / 8 | 2 / 2 | 24 / 24 |

*Totals include the other factory-scoped tables captured by the harness.
Full development and per-factory fingerprints were unchanged. The harness used
an isolated temporary schema, role, local API and frontend and removed them.

## Browser verification — exact limits

Observed passing interactions: real baseline chart API, KPI values, accessible
table presence/toggle, scrap bar opening the correct Source Drawer and source
API, drawer closing back to its trigger, changeover KPI calculation link,
scenario 07 unavailable scrap, and scenario 23 unavailable changeover with
downtime still present.

The driver stopped on a preference-response timeout after the first
**360px / English / light** group. Its Recharts readiness selector incorrectly
looked for rectangles instead of rendered paths. Other false negatives queried
downtime as a third chart, expected +2h in the chart's +120-minute chip, expected
scenario 05's raw value in the chart table rather than the original metric table,
or checked Escape focus before focus restoration settled.

Those driver assertions were corrected but **not rerun**. Overview and Data
Quality measured 363px and 369px document widths at 360px. Wrapping/padding
fixes were made afterward and typechecked, but **not browser-confirmed**.

| Screen | Confirmed matrix cells | Unconfirmed cells |
|---|---|---|
| Comparison | None | All 12 |
| Overview | None | All 12 |
| Runs | 360 / EN / light | Other 11 |
| Data Quality | None | All 12 |
| Help | 360 / EN / light | Other 11 |
| Source Drawer | None as a full matrix cell; opening/closing was checked separately | All 12 |

Each screen's complete matrix is widths **360, 768, 1280** × languages **EN, AR**
× themes **light, dark**. Of 72 cells, 2 passed, 4 were attempted but remain
unconfirmed, and 66 were not reached:

- All six screens at 360/EN/dark, 360/AR/light, 360/AR/dark.
- All six screens at 768/EN/light, 768/EN/dark, 768/AR/light, 768/AR/dark.
- All six screens at 1280/EN/light, 1280/EN/dark, 1280/AR/light, 1280/AR/dark.

Also not completed in the browser: reduced-motion confirmation, loading/error/
empty-state checks, scenario 10, corrected scenario 05 table assertion,
tooltip/glossary focus-return confirmation, and Overview count-link filtering.
Do not count code inspection as a passing browser test for these.

## Manual walkthrough

1. Sign in to a factory with approved data. Open **Overview**.
2. Inspect the status stack. Click an OK, Check or Blocked count to open the
   matching **Production Runs** filter.
3. Read the suggested-pair KPI labels; these identify Run A and Run B and their
   sources where needed.
4. Open **Production Runs**, select two runs, then choose **Compare**.
5. For the baseline pair E-01/E-02 from the same baseline source, check scrap
   5% and 10%, +5 percentage points, changeover 240 and 360 minutes (4 and 6h),
   and downtime 45 minutes in its separate panel/indicator.
6. Click a chart bar or its value to open **Source Drawer**. Use **How was this
   calculated?** on a KPI to inspect the difference calculation and source rows.
7. Open **How to read this**, **Show data table**, and a glossary question mark.
   The complete glossary is also on **Help**.
8. For an already-imported blocked/missing case, inspect Not available, its
   reason and Data Quality link; scenario 05's original metric table retains 10%.
9. Switch language/theme and try 360/768/1280 widths. These manual checks are a
   walkthrough, not a replacement for the missing automated acceptance above.

## Deliberately not built

No new metrics or engine calculations, extra charts, targets, trends, exports,
PDFs, AI, snapshots, reconciliation, production migration or publishing.
