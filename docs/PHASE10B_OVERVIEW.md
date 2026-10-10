# Phase 10b — Overview

## What was built

Only Overview and its authenticated, read-only API were added. The page shows:

- Approved import count, current order count, and existing OK/Check/Blocked badges.
- Errors and warnings using the **same approved-import scope as Data Quality**,
  including superseded versions, with a link to that page. No issue-resolution
  workflow or new definition of a resolved issue was introduced.
- The five latest imports, with source, upload date and lifecycle status, and
  an All imports link to the existing paginated list.
- A comparison shortcut using existing run identities and server results.
- A three-step Import, Check, Compare guide when approved-import count is zero.
- Designed loading/error/retry states, and “Not available” for missing values.

Archived sources are excluded from every section. Counts are computed on the
server; no production values are calculated in the browser. Overview refreshes
when reopened. All displayed numbers come from the authenticated active factory.
Viewer page permissions now include Overview, but not Data Imports.

## Decisions

The shortcut reuses Data Quality's existing “comparable” designation: overall
OK or Check. It takes the two latest **dated** current runs, ordered by their
existing earliest included production date, not upload/approval time. Ties use
internal run ID. Undated or Blocked runs remain accessible through Production
Runs; partial comparisons of Blocked runs have not been disabled or changed.
Both source names remain visible beside the suggested runs.

Latest imports includes draft/checked/approved/rejected entries, not just approved
imports. Approved import count includes approved import history, not only imports
still supplying current orders. Both exclude archived sources.

Viewers see the read-only summaries and latest-import metadata, but no forbidden
Data Imports link. The empty-state guide tells them to ask a manager or analyst.

## Verification that actually ran

- Isolated real API/import suite: **14/14**, including empty Overview, approved
  counts/latest-five consistency, quality/run totals, Viewer reads, anonymous and
  Platform Admin denial, forged factory selection, cross-factory denial,
  archive/restore, no dates and only one dated run.
- Isolated foundation/permission suite after the Viewer page-access fix: **9/9**.
- Python fixture verifier: **52/52**.
- API and frontend TypeScript checks passed.
- API and frontend production builds passed. The frontend build used its
  declared PORT/BASE_PATH settings. Its existing large-bundle warning remains.
- i18n parity/static-key check passed.
- Authenticated manager Overview: all **12** combinations of 360/768/1280 px,
  English/Arabic and light/dark. The browser driver checked overflow, clipping,
  RTL/LTR, target sizes and visible keyboard focus. Existing theme tokens reused.
- Visible manager counts matched server results; Compare opened the exact pair;
  Data Quality, Data Imports and Production Runs links worked.
- Browser response simulations (not production/server evidence): empty guide
  (English), null values/dates (Arabic), insufficient pair (English), loading
  (Arabic), and server error → Retry recovery (English).
- A focused real-login check confirmed Viewer Overview access, no Imports links,
  and Imports API denial. Viewer empty state checked at 360px Arabic/dark and
  1280px English/light. Najm manager Overview and factory header also verified.

The initial browser pass caught the omitted Viewer page permission. That was
fixed and checked separately; the successful 12-cell matrix was not repeated or
overwritten. An earlier test-driver setup attempt failed before browser testing
because its output parent directory was absent; it was corrected.

### Development data protection

All writers ran under the existing disposable-schema/storage isolation harness.
Development tables were protected during testing. Final snapshots show:

| Table | Ethmar before → after | Najm before → after |
|---|---:|---:|
| Imports | 4 → 4 | 1 → 1 |
| Current orders | 6 → 6 | 2 → 2 |
| Production records | 16 → 16 | 3 → 3 |
| Events | 9 → 9 | 3 → 3 |
| Raw rows | 41 → 41 | 8 → 8 |
| Data issues | 2 → 2 | 2 → 2 |
| All factory-scoped rows | 90 → 90 | 24 → 24 |

All before/after fingerprints, global user/session data and role fingerprints
matched. These are database row counts, not Overview's active-source counts.

Evidence:
- `generated-artifacts/phase10b/latest.json`
- `generated-artifacts/phase10b/roles-isolation.json`
- `generated-artifacts/phase10b/overview-2026-10-10T18-47-15-204Z-98236a05/`
- `generated-artifacts/phase10b/roles-2026-10-10T18-51-01-909Z-e477820c/`

## Exact manual steps

1. Sign in as a Factory Manager or Analyst and select the factory in the top bar.
2. Choose **Overview** in the side navigation. On a phone, open the navigation
   menu first.
3. Read approved imports, current orders and OK/Check/Blocked counts. Click
   **Open Data Quality** and compare its default, unfiltered totals.
4. Return to Overview. Click **Choose runs yourself** to open Production Runs;
   its unfiltered total should match Current orders.
5. Return and click **All imports** under Latest imports. This opens the full
   history. Remember: Overview excludes archived sources; history retains them.
6. Return and click **Compare these runs**. The two order IDs and source names
   should match the shortcut. With fewer than two eligible dated runs, follow
   its guidance instead; with no approved data, use **Go to Data Imports**.
7. Change language and theme in the top bar. Check the page on a phone, tablet
   and desktop. Arabic should mirror the layout and still use Latin digits.
8. Sign out and sign in as the Viewer: Overview is readable, with no Data Imports
   link. Sign in as the Najm-only account separately: only Najm's data is shown.

## Deliberately not built

No charts, new production metrics, browser calculations, export, AI, snapshots,
reconciliation, issue resolution, schema changes or publishing. No modifications
to `test-data/`, `expected/` or `tools/`.
