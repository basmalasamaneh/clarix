# Phase 19b — page and state review

Every row is **SOURCE-REVIEWED ONLY**. No browser, DB or test harness was run, so the browser column reads **not run** throughout. The parent tester owns that pass. Typecheck (`tsc --noEmit`, artifacts/clarix) passes.

This page-review work changed no engine, test-data or expected-output files.
The separate string-audit tooling changes and completed browser matrix are
recorded in PHASE19_REPORT.md. Nothing was published.

## State definitions used

- **Not available (N/A-metric)**: a null or unavailable metric renders an explicit "not available" marker, never `0`. A missing route/record (404) is reported separately under the same column.
- **Blocked**: a red metric group is shown as blocked with its reasons, not as numbers. A 403 or role restriction is reported separately.
- **Demo**: the shared DEMO banner. `app-shell.tsx:318` renders `<DemoBanner/>` above **every** authenticated route child when the active membership is a demo factory, so every authenticated page inherits it.
- **PASS** = code evidence was found. **NO-EVIDENCE** = I found no code path proving it. That is not a pass and needs browser or follow-up. **N/A** = the state cannot occur (reason given).

## Fixes made (UI only)

| File | Change |
|---|---|
| components/error-boundary.tsx | The hardcoded English default fallback ("Something went wrong", multiline body, "Try again", gray-* classes) now renders `CrashScreen`. It uses the existing localized `states.crash*` keys and themed tokens, has role=alert, and does not show the raw error. |
| components/crash-screen.tsx | The retry button now has min-h-11. |
| pages/invite.tsx:135 | Its only action (unavailable state) is now primary. |
| pages/tenant-page.tsx | The Forbidden action is primary with min-h-11. Retry is min-h-11 and disabled while fetching. |
| pages/not-found.tsx | The home action is min-h-11. |
| components/snapshots/reconcile.tsx:385 | "Add reconciliation" is now outline (parent-approved). |

**String inventory:** no keys were added or changed. Three English literals were removed. They now use the existing keys `states.crashTitle`, `crashBody`, `crashCode` and `crashAction`.

## Main table

| Page / surface | Primary action (specific) | Empty | Loading | Error + retry | Blocked: red group | Blocked: 403/role | N/A metric (null ≠ 0) | Not found / unavailable | Demo | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| Login | "Sign in" (`button-login`, l.183) | N/A: form only | PASS: button disabled while pending | PASS: inline error l.116 | N/A: no metrics | N/A: public | N/A: no metrics | N/A | N/A: there is no tenant before sign-in | login.tsx |
| Second factor | "Verify" (`button-second-factor-submit`) | N/A | PASS: pending disabled | PASS: ErrorLine l.47 | N/A | N/A | N/A | N/A | N/A: before tenant | security/second-factor.tsx:47-68 |
| Reset / recovery | "Reset" (`button-reset-submit`); success state shows "Sign in" | N/A | PASS: pending | PASS: ErrorLine l.114 | N/A | N/A: public | N/A | N/A | N/A: before tenant | reset.tsx:70-120 |
| Invite accept | "Accept invitation" (`button-accept-invite`) | N/A | PASS: details skeleton l.108 | PASS: retry l.153; accept error l.243 | N/A | N/A | N/A | PASS: unavailable/expired/used link (400/404/410) l.123-140, now primary | N/A: before tenant | invite.tsx |
| Overview | "Compare runs" (`link-overview-compare`, PRIMARY when a pair exists); with no data, "Go to imports" (`link-overview-guide-imports`) | PASS: guide block l.238 | PASS: skeleton l.255-287 | PASS: retry l.288-294 | PASS for server-supplied indicators: each KpiCard shows the server's group status badge (chart-card.tsx:163). An unavailable point shows `ch.na` with the reason and a Data Quality link, never a zero (chart-card.tsx:69-79, 133-135, 262, 337-339). The empty stack chart shows `ch.chartEmpty` (l.315-316). N/A for the status/issue count cards (overview.tsx:56-76): they count runs and issues, they are not metric groups, so red-group blocking does not apply. | PASS: TenantRoute ForbiddenState (App.tsx:91) | PASS: Num null → `ov.na` (overview.tsx:32-33); indicators and charts as noted (overview.tsx:96,103) | N/A: fixed route | PASS: shared banner | overview.tsx, charts/chart-card.tsx |
| Runs | "Compare" (`button-compare`, disabled until exactly 2 runs are picked) | PASS: no-match / empty l.240-241 | PASS: skeleton l.175-227 | PASS: retry l.228-234 | N/A in list: rows show status badges. Group blocking appears in Comparison. | PASS: TenantRoute | PASS: `MetricValue` renders `rc.na` when `!available` or display == null (runs/shared.tsx:24-31) | N/A | PASS: banner | runs.tsx |
| Comparison (normal) | Live: "Save snapshot" (`button-open-save-snapshot`, reconcile.tsx:291), the only filled button in the loaded view. Guard states: "Choose runs" (`link-choose-runs`). | PASS: no-pair l.425 | PASS: skeleton l.429 | PASS: retry l.438-441 | PASS: `banner-blocked` l.338 and `BlockedGroup` with reasons and alternatives replace the group's metrics (l.188-202, 273, 345, 368) | PASS: TenantRoute | PASS: `MetricValue` + `rc.na` (l.81, 243) | PASS: invalid/same pair l.428; not found l.435 | PASS: banner | comparison.tsx |
| Quality (+ focused issue) | "Apply filters" (`button-apply-filters`) | PASS: list empty | PASS: ListSkeleton | PASS: retry l.414 | N/A: issues list, not metric groups | PASS: TenantRoute | N/A: no metric values displayed | PASS: `state-focused-not-found` l.405 | PASS: banner | quality.tsx |
| Snapshots | "Search" (`button-search-snapshots`) | PASS: empty and no-match l.56-58 | PASS: l.43 | PASS: retry l.53 | N/A: list | PASS: ForbiddenState l.40 | N/A: list | N/A | PASS: banner | snapshots.tsx |
| Snapshot detail (normal, frozen) | "Download PDF" (`button-download-pdf`, report-export.tsx:133), the only filled button. "Add reconciliation" was demoted to outline in 19b (reconcile.tsx:385). Save snapshot is **not rendered** here: `ComparisonSnapshotPanel` is mounted only on live Comparison (comparison.tsx:466). The detail page renders `Result` with no snapshot slot (snapshot-detail.tsx:128). | PASS: reconciliation history inline | PASS: l.92 | PASS: retry + back l.100-103 | PASS: reuses comparison `Result` (snapshot-detail.tsx:19,128), so it inherits BlockedGroup | PASS: ForbiddenState l.86; read-only note l.133 | PASS: `Result`/MetricValue; reconcile `Num` null → muted text, not 0 (reconcile.tsx:146,174); blank figures omitted, never zero (l.69) | PASS: `state-snapshot-not-found` l.89-91 | PASS: banner | snapshot-detail.tsx |
| Source drawer | "Close" (`size-11` close button l.605); retry in error | N/A: always opened from a record | PASS: Skeleton l.436 | PASS: retry-source l.437-445 | N/A: shows one value's provenance, not groups | PASS: API error StateBox l.404-407 | PASS: `NA` → `src.na` (l.77, 82); main value null → `src.na` + `src.naWhy` (l.463-466); aria-label uses `src.na` (l.249) | PASS: StateBox amber | PASS: inherits banner (provider inside the app-shell wrapper l.318) | source/source-drawer.tsx |
| Imports: history and detail | "New import". Hidden in demo: `canCreate = canEdit && !demo` (imports.tsx:203-204). | PASS | PASS: l.33, 118 | PASS: retry l.43, 135 | N/A | PASS: canEdit by role | N/A | PASS: detail 404 → `imp.errors.notFound` l.134 | PASS: banner, plus upload hidden (server also refuses) | pages/imports.tsx |
| Import step 1: Upload | "Start upload" (`button-start-upload`), then "Continue to mapping" (`button-continue-map`) | PASS: picker | PASS: spinner in button while busy | PASS: per-file UploadError l.257-263; button relabels to retry l.279; finalize error l.297 | N/A | N/A: page-gated | N/A | N/A | PASS: step unreachable in demo | imports/upload-step.tsx |
| Import step 2: Map | "Save and check" (`button-save-and-check`) | PASS: `imp.map.samplesEmpty` l.509 | PASS: codes loading | PASS: templates and codes retry (event-codes.tsx:66,140) | PASS (blocked): `codesBlocking` disables the primary (l.256,540); missing codes get role=alert + `imp.map.codes.blocked` (event-codes.tsx:100-118) | N/A | N/A | N/A | PASS: unreachable in demo | imports/map-step.tsx |
| Import step 3: Check | "Approve" (`button-approve`) | PASS: `imp.check.issuesEmpty` l.269 | PASS: l.245, 288 | PASS: retry l.258, 302 | PASS (blocked): approve disabled when duplicate or archived source, with reason title (l.342, 493-494) | N/A | N/A | N/A | PASS: unreachable in demo | imports/check-step.tsx. Confirmation: approve requires the errors checkbox (l.531) and replacement checkbox (l.538). Reject is a separate destructive outline action (l.486). |
| Members | "Invite member" (`button-invite-member`) | PASS: InlineEmpty | PASS: RowsSkeleton | PASS: InlineError | N/A | PASS: manager-only route (App.tsx:154) | N/A | N/A | PASS: banner | members.tsx |
| Account: Profile / Password | "Change password" (`button-change-password`) | N/A | PASS: pending | PASS: l.169 (401 → inline re-auth l.183) | N/A | N/A: own account | N/A | N/A | PASS: banner | account.tsx:96-191 |
| Account: Security status | Read-only | N/A | PASS: skeleton (account-security.tsx:41) | PASS: InlineError retry l.42-47 | N/A | N/A | N/A | N/A | PASS: banner | account-security.tsx |
| Account: Two-step (MFA) | "Set up" (`button-mfa-start`) or, when enrolled, Replace/Disable outline | N/A | PASS: pending disabled | PASS: `error-mfa-confirm` l.202; re-auth inline l.172 | N/A | N/A | N/A | N/A | PASS: banner | account-security.tsx:109-205. Disable uses a confirmation AlertDialog. |
| Account: Recovery key / Sessions | Generate key; "Sign out everywhere" (destructive outline) | PASS: InlineEmpty (sessions) | PASS: RowsSkeleton | PASS: InlineError | N/A | N/A | N/A | N/A | PASS: banner | account-security.tsx:258-331; account.tsx:210-218 (confirm dialog) |
| Settings (actual screen) | "Save settings" (`button-save-settings`, disabled until changed) | N/A: settings always have defaults | PASS: RowsSkeleton (factory-settings.tsx:92-95) | PASS: InlineError retry l.99-103; save error l.211 | N/A | PASS: non-manager or platform admin → ForbiddenState (tenant-page.tsx:46) | N/A | N/A | PASS: banner | tenant-page.tsx:76-95 renders FactorySettings, MfaPolicyPanel (confirm dialog, security-admin.tsx:71-108) and AiConsentSection. |
| Data sources (in Settings, manager only) | Archive/Restore per row (outline); confirmation primary "Archive" (`button-confirm-archive`) | PASS: `state-admin-sources-empty` / no-match (source-admin.tsx:46-49) | PASS: pulse rows l.42-43 | PASS: retry l.44-45; mutation error l.41 | N/A | PASS: manager-only render (tenant-page.tsx:95) | N/A: shows counts and dates; a missing last-approved date shows `src.pick.never`, not a fake date | N/A | PASS: banner | sources/source-admin.tsx. There is no standalone Data sources route: NAV_PAGES (session.tsx:212) has no `sources`. |
| Platform (+ demo create) | "Create factory" / "Create demo factory" | PASS: InlineEmpty | PASS: RowsSkeleton | PASS: InlineError | N/A | PASS: admin-only route | N/A | N/A | N/A: Platform is outside any tenant; demo creation is its own dialog | platform.tsx |
| Help | None (informational) | N/A: static | N/A: static | N/A: static | N/A | N/A: available to all | N/A | N/A | PASS: shared banner when the active factory is demo (help is inside the app shell, App.tsx:163) | help.tsx |
| Not found | "Go home" (`link-home`) | — | — | — | — | — | — | PASS | PASS: banner | not-found.tsx |
| Crash / error boundary | "Try again" (`button-crash-retry`) | — | — | PASS: localized and themed (fixed) | — | — | — | — | Depends on where it fails | error-boundary.tsx, crash-screen.tsx |

## 19b action change (tester: please note)

- `components/snapshots/reconcile.tsx:385`: "Add reconciliation" (`button-open-add-reconciliation`) is now `variant="outline"`. Behaviour and test IDs are unchanged. Snapshot detail now has one primary action, Download PDF. Typecheck passes after the change.

## Open items for the parent

1. Browser checks still needed: RTL, dark mode, mobile and zoom on every row, including the Phase 19 final fixes that were never browser-retested.
2. No NO-EVIDENCE rows remain. Overview has been resolved as described in its row.
