# Phase 14 — snapshots and reconciliation

## Delivery status

Implemented. API verification passed; browser acceptance is **not complete**.
Nothing was published. No PDF/export, AI, targets, trends, email, report upload,
editing or deletion was added. The engine and all files in `test-data/`,
`expected/` and `tools/` are unchanged.

## Built

- Managers and Analysts can save a titled comparison with an optional note.
  Viewers can read snapshots and their reconciliation history. Platform Admins
  cannot access factory analysis.
- Snapshots freeze the server comparison, metric values and differences, group
  statuses, issues, chart specifications/captions, original import/run/source
  identities, file hashes, mapping content/version, definition version and
  complete original metric source-row references.
- Snapshots are searchable by title/order and paginated, 20 per page. Details
  reuse Comparison, charts, KPI cards, StatusBadge and Source Drawer.
- A separate “What changed since this snapshot” panel reports newer imports,
  changed values/statuses and unavailable/archived current sources. It does not
  modify the saved comparison. A stale open comparison cannot silently save a
  replacement import: the UI sends expected import identities and gets a
  reload-and-review message if they changed.
- Original Source Drawer links include the snapshot identity. They resolve the
  original retained import/raw rows, not replacement canonical rows. Approval
  retains canonical history; snapshots do not copy or rewrite those rows.
- Optional reported figures: Input, Good output and Scrap in kg; Changeover and
  Downtime in minutes, separately for A/B, plus an optional origin note.
- Exact server-side decimal subtraction is **report minus Clarix**. Empty is
  “Not provided”, not zero. Matches means exact equality. No browser arithmetic
  or inferred causes. English/Arabic fact sentences come from the server.
- **Approved rule:** every figure in a red group is refused for reconciliation,
  even a non-null Input/Good-output value still visible in the comparison table.
  Missing values are also refused. Neither receives a numerical difference.
- Figures entered before saving are stored as the initial immutable
  reconciliation record. Later entries append new records with author/date.
- Four tenant-scoped tables: `analysis_snapshots`, `reconciliations`,
  `source_row_links`, `snapshot_audit`. All use enabled/forced RLS, scoped
  references/indexes and immutable UPDATE/DELETE/TRUNCATE protection.
  Audit events contain actor/action/identity, not cell contents.
- English/Arabic help and glossary: Snapshot, Reconciliation, Frozen.

## Verification

| Check | Evidence / result |
|---|---|
| Full isolated API regression | 106 passed; `/tmp/phase14-full.log` |
| Focused snapshot tests after stale-import guard | 8 passed; `/tmp/phase14-focused-final.log` |
| Locked TypeScript engine | 55 passed; `/tmp/phase14-engine.log` |
| Python golden verifier | All 52 checks passed; `/tmp/phase14-python.log` |
| Production-startup isolation check | 8 passed; `/tmp/phase14-deployment-gate.log` |
| Types | Frontend and API type checks passed |
| Translations | 1,424 keys; EN/AR parity/static-key check passed |
| Frontend production build | Passed; `/tmp/phase14-build-final.log`; existing large-bundle warning remains |
| Authentication/permissions | Actual password API logins for all five seeded identities; tenant denial, Viewer read-only, Platform Admin denial |
| Snapshot invariance | Comparison/chart JSON unchanged after scenario-07 replacement; original Source Drawer response identical; archive does not destroy snapshot access |
| Reconciliation | Exact match/difference, 30 fractional digits, negative differences, empty values, invalid inputs, blocked groups, Najm tonne conversion, append-only history |
| Database safety | Runtime mutation/truncate denial, forced-RLS coverage, cross-factory denial, list/history pagination |
| Browser | Actual Analyst login, empty list, real import/approval, figure preview and snapshot-save request confirmed. Full save/reload/append/replacement/role journey remains incompletely verified |
| Responsive matrix | Best effort only: first substantive matrix recorded 57 cells, 21 passing. Later attempt timed out. A table-width constraint was subsequently fixed and type/build checked, not browser reverified |

Browser runs exposed a real missing-CSRF-options bug in the three new mutation
hooks. Fixed; the next run confirmed preview and save requests. That run then
stopped on an incorrect assertion expecting empty reconciliation history after
saving figures (an initial record should exist). Later browser attempts hit
timeouts. These are **not** a passing browser acceptance gate.

Screenshots and raw attempts are retained in `generated-artifacts/phase14/`.
They are best-effort evidence. **I cannot judge visual quality.**
The running app's public sign-in screen also rendered successfully.

## Development data safety

All fixture imports and authenticated tests used disposable isolated schemas and
isolated storage. Final interrupted-target cleanup was followed by a fresh
unfiltered fingerprint check:
`generated-artifacts/phase14/isolation-final.json` reports
`unchanged: true`, `factoriesUnchanged: true`, `testSchemaRemoved: true`.

| Factory / table | Before | After |
|---|---:|---:|
| Ethmar imports | 4 | 4 |
| Ethmar orders | 6 | 6 |
| Ethmar raw rows | 41 | 41 |
| Ethmar production records | 16 | 16 |
| Ethmar events | 9 | 9 |
| Ethmar issues | 2 | 2 |
| Najm imports | 1 | 1 |
| Najm orders | 2 | 2 |
| Najm raw rows | 8 | 8 |
| Najm production records | 3 | 3 |
| Najm events | 3 | 3 |
| Najm issues | 2 | 2 |
| New snapshot/reconciliation/reference/audit rows in ordinary dev data | 0 | 0 |

## Exact manual steps

1. Sign in as a Factory Manager or Analyst and select your factory.
2. Open **Comparison**, select two runs, and click **Compare**.
3. Below the comparison, optionally enter report figures and their origin.
   Leave unknown figures blank. Click **Compare with Clarix** for an unsaved preview.
4. Click **Save snapshot**, enter a title and optional note, then confirm.
   The warning explains that the saved snapshot cannot be edited or deleted.
5. The snapshot opens with a **Frozen** banner. Use **Snapshots** in the navigation
   to search by title/order and reopen it.
6. Open a figure, difference or chart source link. The drawer shows the original
   source rows belonging to the saved import.
7. On the snapshot, enter another set of report figures and click **Save
   reconciliation**. Confirm permanence. The earlier record remains in the history.
8. After approving a newer import through the normal source/replacement flow,
   reopen the snapshot: saved figures stay fixed, while the changes panel shows
   differences from current data. Do not replace real production data merely to
   test this; use an isolated target.
9. A Viewer can open **Snapshots** and records but has no save/add form.

The ordinary application startup/migration path includes the additive snapshot
migration and security SQL. This work did not publish or alter production data.
