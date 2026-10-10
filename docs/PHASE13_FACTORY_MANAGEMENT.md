# Phase 13 — factory management

## Built

- Platform-only `/platform`: server-paginated factory metadata and audit, create
  factory, one-time manager invitation, reissue/revoke before an active manager,
  suspend/reactivate with session invalidation, member/file/import-row limits.
- Separate restricted platform database role. It receives no SELECT grants on
  imports, orders, records, events, issues or raw/history tables. Latest approval
  and largest historical file/import usage are metadata, maintained by imports.
- Own-factory manager Settings: name, default language, exact decimal balance
  thresholds and extra unit factors. Audited before/after values; future imports
  and checks only. Existing approved data and comparison results stay unchanged.
- Optional first Platform Admin deployment invitation, with no password secret,
  zero-user guard, transactional rollback, seven-day expiry and durable latch.
  Existing manager bootstrap remains supported.
- EN/AR, RTL/LTR, light/dark/system, designed empty/loading/error states,
  keyboard access and responsive layouts. Existing Data sources controls remain.

Limits default to 50 active members, 5 MiB per file and 100,000 rows per import.
Configured maximums: 10,000 members, 20,000,000 bytes per file, 100,000 rows.
File/row usage means largest historical file/import, not cumulative storage.
Legacy factories show “Before records began” for their unknown creation dates.
An additive migration backfills approval/usage metadata from existing imports;
it does not modify production records, metrics or approved import results.

## Verification

| Check | Result | Evidence |
|---|---|---|
| Full API regression suite | 98 passed, 0 failed | `/tmp/phase13-full-tests.log` |
| Expanded focused Phase 13 assertions | 7 passed, 0 failed | `/tmp/phase13-final-focused.log`, `src/tests/platform.test.ts` |
| Engine / golden fixtures | 55 passed including 26 fixture cases | `/tmp/phase13-engine.log` |
| Python verifier | All 52 checks passed | `/tmp/phase13-python.log` |
| Production Platform Admin bootstrap | 8 check groups passed in disposable PostgreSQL cluster | `generated-artifacts/phase13/deployment-gate.json` |
| Backwards-compatible manager bootstrap | 8 check groups passed | `generated-artifacts/phase10/deployment-gate.json` |
| Authenticated browser journey | 8 checks passed: create, private invitation, new manager acceptance, own empty factory, no reissue after acceptance, suspend, reactivate/login, admin tenant denial | `generated-artifacts/phase13/2026-10-10T19-46-16-454Z-71861724/evidence.json` |
| Responsive matrix | 24/24: Platform + Settings × AR/EN × light/dark × 360/768/1280 | `generated-artifacts/phase13/2026-10-10T19-40-47-185Z-339ad3c1/evidence.json`, 24 PNGs |
| System, keyboard and authorization UI | System follows both OS schemes; visible buttons measured >=44px; focus outline; Viewer Settings denied; admin tenant page denied | Same browser evidence |
| Static checks | API/frontend TypeScript and EN/AR key parity passed | Command output |

The API tests cover first-manager invite revoke/reissue/expiry/replay, all three
factory roles denied platform writes, admin production-data denial, own-factory
Najm baseline import (including E-01) and comparison, cross-factory ID oracle
parity, suspension and preserved orders, limits, thresholds, extra units, new
import configuration, unchanged old comparison, audit immutability and dynamically
discovered `factory_id` tables with forced RLS.

Browser correction: an initial driver incorrectly invited an already-existing
seeded manager; server rejection was correct. The focused retry used a new email
and passed. A duplicate language-control locator was corrected before the completed
matrix. No invitation token/link/password was retained in browser evidence.
The journey manifest's screenshot summary says zero, but its listed reactivation
confirmation PNG exists. Final audit-label/error-message wording and Latin-digit
format fixes were checked statically; the 24 screenshots precede those text-only
finishing edits. No matrix cells are missing.

## Development data protection

All verification writes used disposable schemas or a separate disposable
PostgreSQL cluster. No test wrote to ordinary Ethmar/Najm data.
`generated-artifacts/test-isolation/latest.json` records full per-table counts,
hashes and role fingerprints before and after; `unchanged` is true.

| Factory | Scoped rows before / after | Imports | Orders | Raw rows | Issues |
|---|---|---|---|---|---|
| Ethmar | 90 / 90 | 4 / 4 | 6 / 6 | 41 / 41 | 2 / 2 |
| Najm | 24 / 24 | 1 / 1 | 2 / 2 | 8 / 8 | 2 / 2 |

Scoped totals exclude global users, sessions and platform bootstrap invitations.
Per-table hashes are identical within each verification run. Full baseline
fingerprints are in the evidence JSON rather than assuming independent runs
must have the same session-expiry hash.

## Manual steps

1. In development, sign in as `platform.admin@clarix.test`, using the existing
   `SEED_TEST_PASSWORD` secret's value. Open **Platform** (`/platform`).
2. Select **Add factory**. Enter name, a unique lowercase address/slug, language,
   and a **new** manager email. Submit. Copy the invitation link immediately;
   it is not shown again after closing.
3. Open that link in a private browser window. Choose a name and password.
   The new manager sees only the new, empty factory.
4. Before acceptance, use **Issue new link** or **Revoke link** to recover or
   revoke an invitation. The old link stops working. These controls disappear
   when an active manager exists.
5. In Platform, choose **Edit limits**, set limits and save. Usage is next to
   each limit. Limits apply on the server, not just in the form.
6. Select **Suspend**, confirm, then observe the manager loses access. Select
   **Reactivate**, confirm and sign in again. Stored data remains.
7. As the manager, open **Factory settings**. Change thresholds or add an extra
   unit, then **Save**. Review **Settings history** below the form. Earlier
   approved comparisons do not change.
8. To exercise imports on your own new factory, use **Data imports**, upload
   `test-data/najm-packaging/00_baseline` CSVs and use its mapping. Check and
   approve, then open Production runs and compare the two runs. Do not use
   Ethmar or Najm development factories for automated verification.

## Publishing checklist

The authoritative, updated checklist is `docs/PHASE10_PUBLISH.md` (15 steps).
In short: configure production settings; choose initial-manager or optional
Platform Admin secret names; use a separate runtime password and strong session
secret; generate/save the one-time invitation token privately; review the separate
production database; review schema changes; let privileged security setup run;
accept the invitation; log in; delete the deployment token secret; verify live
HTTPS/storage/isolation and backups. No publish action was performed.

Optional admin names: `CLARIX_INITIAL_ROLE`, `CLARIX_INITIAL_ADMIN_EMAIL`,
`CLARIX_INITIAL_INVITE_TOKEN`. Manager mode retains
`CLARIX_INITIAL_FACTORY_NAME`, `CLARIX_INITIAL_FACTORY_SLUG`,
`CLARIX_INITIAL_MANAGER_EMAIL`, `CLARIX_INITIAL_INVITE_TOKEN`.
No manager/admin password secret is required.

## Deliberately not built

No delegation, billing, email sending, password reset, Google login, targets,
benchmarks, calculation changes, snapshots, reconciliation, export or AI.
No fixtures, expected outputs or tools were changed. Nothing was published.
