# Clarix — Product & Engineering Specification

> **Read this first (instruction to the coding agent).**
> This file is the single source of truth for the project. Build **only the phase named in the current prompt**.
> Do not start features from later waves. Do not invent business rules: every metric, issue code and status rule
> below is locked and is covered by the golden test set in `test-data/` + `expected/expected_results.json`.
> If a requirement here conflicts with a prompt, stop and ask.
> Success is not the number of features. Success is: **a manager gets a correct comparison, understands where every
> number comes from, and can verify it alone.**

---

## 1. Product

**Clarix** is a multi-factory web platform that turns approved CSV exports from a factory's existing ERP/production
system into simple, checkable comparisons of **waste (scrap)**, **mold-change (changeover) time** and **machine stops**.

- It is **not** an ERP. It never writes to, or connects to, the factory system. Read-only by design: input is uploaded files only.
- First customer / demo factory: **Ethmar Plastics** (plastic packaging). Target market: plastic-packaging factories that already
  keep data in an ERP but cannot use it for day-to-day decisions.
- The brief's case: two runs on one line, same 1,000 kg input.
  E-01: 950 good + 50 scrap, changeover 4 h. E-02: 900 good + 100 scrap, changeover 6 h, plus a separately logged 45 min unplanned stop.
  Expected display: 5% vs 10% (+5 percentage points), 4 h vs 6 h (+2 h), the 45 min shown **separately**, no causal claim.

### Six principles (never violate)
1. **Code calculates, AI only explains.** No number on screen comes from a language model.
2. **Every number has a source:** file + physical line number, one click away.
3. **Problems are shown, never hidden.** Warnings travel with the number and into exports.
4. **Missing means "Not available", never zero.** Never back-calculate a missing field from others.
5. **No causality claims.** Recorded facts are separated from hypotheses (wave 3).
6. **Saved analyses never change silently** (immutable snapshots, wave 2).

---

## 2. Delivery waves and gates

| Wave | Scope | Gate to leave the wave |
|---|---|---|
| **1 — Proven core** | Auth + factories + roles, import + column mapping, raw-row storage, data-quality checks + status badge, calculation engine, runs list, comparison page, source drill-down | `python3 tools/verify.py` equivalent in the app's own test suite passes **all** golden-set scenarios; E-01/E-02 numbers exact |
| **2 — Trust** | Reconciliation against factory reports, immutable analysis snapshots, 2 charts (comparison bars + timeline), template-built explanations, simple PDF export, second factory + isolation tests | Isolation tests pass; a saved comparison is unchanged after a new upload |
| **3 — Expansion** | AI assistant, remaining charts, advanced settings, comments, demo mode polish, scheduled/advanced extras | AI test suite (section 14) passes |

**Do not start AI, advanced charts or reports before wave 1 passes its gate.**

---

## 3. Users and roles

| Role | Can do |
|---|---|
| Platform Admin | Create/suspend factories, invite factory managers. **No access to production data** unless a factory manager grants a time-boxed, logged permission. |
| Factory Manager | Everything inside their factory: team, settings, mappings, approve analyses. |
| Analyst | Upload files, map columns, review data issues, approve imports, build comparisons. |
| Viewer | Read production runs, comparisons, reports, and the Data Quality Center including its issue source-row details. No writes. |

A user belongs to one or more factories through `memberships(user, factory, role)`. Authorisation is enforced **on the server for every read and write**; hiding buttons is not security.

---

## 4. Architecture

- **Modular monolith** (no microservices): modules `tenancy`, `import`, `quality`, `metrics`, `compare`, `charts`, `reports`, `ai`, `audit`.
- **Source adapters:** every source format (CSV today; Excel / API later) is converted to the canonical model below. A new ERP = a new mapping/adapter, never a change in `metrics`.
- **Pipeline:** `raw file → raw rows (immutable) → canonical rows → quality checks → metrics → comparison view`. Raw rows are never edited or replaced by processed data.
- **Stack:** React + TypeScript + Tailwind + shadcn/ui, Node.js + TypeScript API, PostgreSQL, Recharts + Framer Motion (wave 2+), TanStack Table, i18next, Lucide icons.
- Exact arithmetic: use **decimal** types (e.g. `decimal.js` / Postgres `numeric`), never floating point, for all quantities, rates and durations.
- Large files: process in a background job with progress; store uploaded files outside the web process.

### Capability levels (what the uploaded data allows)
| Level | File contains | Allowed analysis |
|---|---|---|
| 1 | Totals per run only | Basic comparison. Warn `LEVEL1_TOTALS_ONLY`: duplicates and overlaps cannot be detected. |
| 2 | Records with ids, no timed events | + duplicate and missing-field detection |
| 3 | Records + events with start/end times | Full checks incl. overlap detection |

The system detects the level from the mapping and says so on the comparison page.

---

## 5. Canonical data model (PostgreSQL)

All tables carry `factory_id`. Uniqueness is scoped to **(factory, source)**: order ids are **not** globally unique (Ethmar's `E-01` and Najm's `E-01` are different runs).

| Table | Key columns |
|---|---|
| `factories` | name, default_language, settings JSON (units, thresholds, event-code map), status |
| `users`, `memberships` | role per factory |
| `imports` | factory_id, source_name, file names, **content hash**, status, uploaded_by, mapping_id |
| `raw_rows` | import_id, file, **line_number**, cells JSON — **immutable** |
| `column_mappings` | factory_id, source_name, version, mapping JSON (see `test-data/**/mapping.json`) |
| `orders` (runs) | factory_id, source_order_id, product, line, machine, mold |
| `production_records` | factory_id, record_id, order_id, shift, date, input, good, scrap, unit, raw_row_id |
| `events` | factory_id, event_id, order_id, event_code, type, start, end, duration_min, reason, raw_row_id |
| `data_issues` | factory_id, import_id, code, severity, order_id, group, raw_row_ids, status (new/reviewed/accepted-with-note), note |
| `analysis_snapshots` | factory_id, created_by, pair/selection, definitions version, file hashes, results JSON (immutable) — wave 2 |
| `source_row_links` | snapshot/metric reference → raw_row_ids (this is the drill-down) |
| `reconciliations` | snapshot_id, entered factory-report figures, differences — wave 2 |
| `ai_interactions`, `audit_logs` | wave 3 / all sensitive actions; never store secrets or passwords |

Timestamps are plant-local and naive in v1 (no time-zone conversion); store the factory's time zone in settings for display.

### Approved Phase 4 replacement and history policy

Current data is keyed by `(factory_id, source_name, source_order_id)`. Approval
atomically replaces only the orders present in the new import, after confirming
the replacement count. Other orders remain unchanged. Only engine-included
records/events enter current canonical tables. Excluded and quarantined rows
remain in immutable raw rows, linked from data issues.

Before replacement, old canonical values are copied to separate `orders_history`,
`production_records_history`, and `events_history` tables with status `superseded`,
the original import, superseding import, and superseded timestamp. Current tables
retain their unique source IDs. History has factory-scoped references/indexes,
ENABLE and FORCE RLS using the same tenant context, and append-only database
triggers blocking UPDATE, DELETE and TRUNCATE. No user deletion operation exists.

Import states are `draft`, `checked`, `approved`, `rejected`. Rechecking an editable
draft replaces its derived validation report, never its raw rows or original
files. Duplicate detection within the same source requires identical file-set contents AND effective mapping
settings, and the earlier import must still be current for at least one order
in the same factory. Different mappings or fully superseded imports can be
approved through normal replacement confirmation listing the affected orders.
Source selection is explicit: existing source or a new source name. A matching
approved mapping recommends its most recently approved active source. Source
names are namespaces, not upload labels. Order IDs across sources remain separate;
run and comparison identities include source and internal run ID.
Factory Managers can reversibly archive sources using existing factory settings.
Archived sources retain every stored row but are excluded from current run lists,
comparison selection/pairs and active counts. They cannot receive new imports or
approvals until restored. Import history remains accessible.
File-set hashes use sorted SHA-256 file hashes, independent of filename/order.
Raw rows store both `start_line` and `end_line`; all displayed references use
the first physical line. Existing `line_number` is the first-line alias.

---

## 6. Metrics — locked definitions

The formulas are fixed in code and covered by tests. **Factories can not edit them.** A factory may configure only: units, alert thresholds, tolerances, the event-code → type map, and which column holds which field. Any alternative definition (e.g. "scrap as % of total output") is added as a **new metric with a different visible name and formula label**, never as a replacement.

| Metric | Formula | Notes |
|---|---|---|
| Scrap rate (%) | scrap ÷ input × 100 | N/A if input is 0 / missing / scrap missing |
| Good output rate (%) | good ÷ input × 100 | same |
| Material balance (kg) | input − good − scrap | shown as an issue when beyond tolerance; **never auto-corrected** |
| Changeover time (min) | Σ (end − start) of included `CHANGEOVER` events of the run | timestamps are authoritative over `duration_min` |
| Unplanned downtime (min) | Σ (end − start) of included `UNPLANNED_DOWNTIME` events of the run | **never added to changeover time**; no events = "No events recorded" (0), distinct from N/A |
| Difference | run B − run A | percentages differ in **percentage points (pp)**, times in minutes/hours |

- **Units:** convert to kg with exact factors (`kg 1`, `t`/`tonne 1000`, `lb 0.45359237`, `g 0.001`). An unknown unit (including ambiguous `ton`, `pcs`) is `INCOMPATIBLE_UNIT` → values N/A, comparison refused. Factories may extend the unit table in settings.
- **Sums:** a sum is N/A if any contributing value is missing, any contributing row is quarantined, or any unit is incompatible.
- **Material balance tolerance:** default warn above 1% of input, error above 5% (configurable per factory). If input is 0 and balance ≠ 0 → error.
- **Display rounding:** `ROUND_HALF_UP`, percentages and pp to 1 decimal with trailing `.0` hidden (`5`, `7.5`); minutes exact; hours = minutes ÷ 60 to 2 decimals (`2`, `0.75`). Calculation always uses exact decimals; rounding is display-only.
- **Overlap:** an unplanned stop overlapping a changeover of the same run by more than 0 minutes → `POSSIBLE_OVERLAP` (warning). Report minutes of overlap. State facts only. Requires Level 3 data.

---

## 7. Data-quality rules and issue catalogue (locked)

Severity: `info` (shown, no effect on status), `warning` (→ yellow), `error` (→ red). Each issue belongs to a metric group: **volume** (input/good/scrap/rates/balance), **changeover**, **downtime**.

| Code | Sev. | Group | Trigger → effect |
|---|---|---|---|
| `MISSING_REQUIRED_FIELD` | error | by row type | Record without record id/order id, or event without event id/order id/start/end → row **quarantined**; group value N/A. (No order id at all → file-level issue.) |
| `DUPLICATE_RECORD_ID_IDENTICAL` | warning | volume | Same record id, identical content → later copies **excluded**, shown in excluded list |
| `DUPLICATE_RECORD_ID_CONFLICT` | error | volume | Same record id, different content → **all copies quarantined**; sums N/A |
| `SUSPECTED_DUPLICATE_RECORD` | error | volume | Different id but same order+shift+date+input+good+scrap+unit → rows **counted but flagged**; alternative totals without the suspected row shown; comparison **blocked** until a reviewer resolves (confirm duplicate → exclude, or confirm legitimate with note) |
| `MISSING_VALUE` | error | volume | An input/good/scrap cell empty → that field's sum N/A (never 0, never derived) |
| `ZERO_INPUT` | error | volume | Total input = 0 → rates "not computable" |
| `INCOMPATIBLE_UNIT` | error | volume | Unit not convertible → all sums N/A |
| `UNIT_CONVERTED` | info | volume | Non-kg unit converted exactly |
| `MATERIAL_IMBALANCE` | warning / error | volume | Beyond tolerance (see §6); numbers untouched |
| `NO_PRODUCTION_RECORDS` | error | volume | Run has no records |
| `DUPLICATE_EVENT_ID_IDENTICAL` | warning | event type | Identical repeat → excluded |
| `DUPLICATE_EVENT_ID_CONFLICT` | error | event type | Same id, different content → all copies quarantined; group N/A |
| `SUSPECTED_DUPLICATE_EVENT` | warning | event type | Different id, same order+type+start+end → both counted; alternative total shown (e.g. 90 min, or 45 if excluded) |
| `INVALID_TIME_RANGE` | error | event type | end ≤ start → quarantined |
| `DURATION_MISMATCH` | warning | event type | `duration_min` ≠ end − start → timestamps win |
| `POSSIBLE_OVERLAP` | warning | changeover + downtime | See §6 |
| `UNMAPPED_EVENT_CODE` | warning | downtime | Code not in the event-code map → excluded and listed, because it might be a stop |
| `PLANNED_EVENT_IGNORED` | info | downtime | Code mapped to `PLANNED_STOP` → not counted |
| `MULTIPLE_CHANGEOVER_EVENTS` | info | changeover | More than one included changeover → summed, noted |
| `NO_CHANGEOVER_EVENT` | warning | changeover | No changeover event → N/A |
| `LEVEL1_TOTALS_ONLY` | warning | all | Totals-only source |
| `FORMULA_LIKE_CELL` | info | file | Text cell starts with `= + - @ TAB CR` → stored as plain text; exports must neutralise (prefix `'`) |
| `DUPLICATE_FILE` | warning | import | Same contents and mapping as an import still current for at least one order in the factory → flagged, not counted twice |

Order of checks (events): required fields → time range → duplicate ids → code mapping → duration → suspected duplicates → overlap. Records: required fields → duplicate ids → suspected duplicates → units → missing values → balance.

### Data-quality status badge (no percentages, always with a reason)
Derived per metric group, then overall = worst group. Only issues attached to the numbers shown count.

| Status | English | Arabic | Rule |
|---|---|---|---|
| 🟢 green | Complete | مكتملة | no warning/error |
| 🟡 yellow | Complete with warnings | مكتملة مع تحذيرات | at least one warning, no error |
| 🔴 red | Not sufficient to compare | غير كافية للمقارنة | at least one error → comparison for that metric is refused (shown as "Not available"/"Not computable") |

Always show **why**, e.g. "One duplicate stop event was excluded (events.csv:5)". Badge is icon + text + colour (never colour alone).

### Phase 5 quality-history scope
The Data Quality Center is read-only and includes issues from all approved
imports, with superseded order versions clearly labelled. Its current-order
green/yellow/red counts use only current approved orders, not old versions.
Severity/group filters apply to issue counts; source/order/archive filters also
apply to current-order counts. Archived sources are excluded unless explicitly
shown. Viewers may read this page and the issue's exact source cells, but gain
no import, mapping, approval, settings, resolve or ignore write permissions.

---

## 8. Comparison page (the heart of the product)

Phase 6 clarification: hide only blocked metric groups, not the entire comparison
when one run is red. Unaffected groups remain visible with the overall red badge
and reasons linked to Data Quality. This preserves the locked engine rules.
Viewer access includes the read-only runs list for selecting the comparison.
Source Drawer is deferred to Phase 7; Phase 6 supplies physical file/line/column
references and working in-page source-reference anchors.

Phase 7: those anchors are replaced by a shared, read-only Source Drawer on
Runs, Comparison and Data Quality. It shows original cells with first physical
line numbers, server-calculated row contributions, formulas, related issues and
clearly labelled alternatives. Drawer state is shareable in URL parameters.
Metric URLs refer to the current approved run; issue URLs retain their original
approved import, including superseded versions. These are not saved snapshots.
Pagination does not change the complete server-calculated metric or breakdown.
Copy/export, resolution and ignore actions are not part of this phase.

- Two columns (run A / run B) with: input, good output, scrap, **scrap rate**, **changeover time**; a centre strip with differences (`+5 pp`, `+2 h`).
- A **separate, clearly titled section** "Unplanned stops (recorded separately)" with the fixed note:
  EN: *"Recorded separately. Not included in changeover time and not assumed to be a cause of scrap."*
  AR: *«مسجّلة بشكل منفصل. لا تُحتسب ضمن زمن تغيير القالب ولا يُفترض أنها سبب الهدر.»*
- Quick questions at the top, answered by code: "Which run had more waste?", "Was its mold change also longer?", "Is the separate stop counted correctly?"
- Every number is a button that opens the **Source Drawer**: formula, input values, original rows (file, line number, all columns), excluded/quarantined rows related to that number, and the issues that affect it. Copy and export buttons.
- Red metric → value replaced by "Not available" / "Not computable" with the reason and a link to the Data Quality Center. Yellow → value shown with a warning chip. Alternatives (e.g. totals without a suspected duplicate) shown beside, never silently chosen.
- Showing the capability level ("Totals-only data: duplicates and overlaps can't be checked").

Wording rules for all generated text: state recorded facts; never "because", "caused by", "due to" for operational causes. Hypotheses only in wave 3, labelled **Hypothesis / فرضية**.

---

## 9. Import wizard (3 steps, back-navigation keeps settings)

1. **Upload** — drag & drop; type/size/content checks; detect encoding (UTF-8 with/without BOM, else Windows-1256), delimiter (`, ; TAB |`), compute SHA-256; duplicate-file warning. Show first 20 rows.
2. **Map** — map each file column to a canonical field; set decimal separator, date/time formats, fixed unit if the file has no unit column; map event codes → `CHANGEOVER | UNPLANNED_DOWNTIME | PLANNED_STOP`. Save as a named template per factory/source. (AI-assisted suggestions only in wave 3, always confirmed by the user.)
3. **Check & approve** — quality report (counts + issue list with line numbers); nothing is used in analysis until approved. Raw rows are saved exactly as uploaded.

Mapping JSON format: see `test-data/ethmar-plastics/00_baseline/mapping.json` (comma, `.` decimals, ISO dates) and `test-data/najm-packaging/00_baseline/mapping.json` (semicolon, decimal comma, `dd/mm/yyyy`, tonnes).

---

### Phase 6 per-metric Volume clarification

Even when Volume is red, show each non-null approved engine value normally.
Only null metrics show “Not available”, with the applicable run's Volume issue
reasons and links to Data Quality. Scenario 07 retains Input and Good output;
Scrap, Scrap rate, Good rate and Material balance remain null. Preserve the
golden comparison's rate-comparability decisions. Do not alter the engine or
fixtures. Summary sentences (including quick answers) use `[source name]`
only when the compared sources differ; otherwise show order IDs alone.

### Phase 4 wizard clarification

Every distinct value in the selected event-code column requires an explicit
choice before checking. “Ignore, do not count” is recorded with the acting user
and timestamp, but remains unmapped for the unchanged engine: its events are
excluded and its warning remains. Show the concrete code, count and excluded
rows. Imports with errors can be approved only after an explicit acknowledgement
of the listed errors; this does not change red metric or comparison rules.
Approved imports display their historical replacement count, not a live estimate.

### Post-MVP ideas

Explicitly ignored event codes could become an info-level note instead of a warning.

## 10. Pages

### Approved Phase 10b: small Overview

Overview presents server-computed approved-import counts, current-order statuses,
existing Data Quality error/warning totals, the five latest imports, and a
shortcut to the two most recently produced comparable runs. It excludes archived
sources, supports read-only Viewer access, and provides a three-step empty guide.
It adds no charts, metric definitions, browser calculations, export, AI,
snapshots or reconciliation. Existing page permissions remain unchanged except
that Viewers may also read Overview; Data Imports remains restricted.

Wave 1: Login · Overview · Data Imports (wizard) · Production Runs (search/filter, pick 2 runs) · **Comparison** · Source Drawer · Data Quality Center · Factory Settings (basic) .
Wave 2: Reconciliation (enter figures from the factory's own report → "Matches ✓" or difference) · Saved analyses (snapshots) · Reports (PDF with source files, hashes, definitions, warnings — warnings are never stripped).
Wave 3: AI Analyst panel · remaining charts · audit log view · comments · advanced settings.

---

## 11. Multi-factory (multi-tenant) and security

### Approved Phase 18 — account recovery and stronger sign-in

This scope supersedes earlier exclusions of password recovery. It is approved
for implementation; this section is not a claim that implementation has passed.
Keep email/password, Argon2id, invite-only onboarding and all tenant boundaries.
No external email service, public signup, social sign-in, magic links, passkeys,
SMS or remembered-device bypass is included.

- Managers may issue/revoke hashed, single-use, 24-hour reset links for active
  members of their own factory, never themselves. New issuance invalidates the
  old link. Completion changes the password, ends all sessions, preserves MFA,
  and audits actors/actions without secrets. Platform Admin cannot use this flow.
- Approved sole-manager recovery: a separate high-entropy, single-use private
  account recovery key, shown once and stored hashed, may reset the password.
  It does not disable MFA: an enrolled account still needs its authenticator or
  an unused MFA recovery code. Recommend adding a second manager. Losing all
  credentials and recovery material has no in-app administrator override.
  Delayed recovery was rejected because in-app notices without email may go unseen.
- TOTP enrollment shows a QR/manual key once, confirms a valid code, and supplies
  ten hashed, single-use recovery codes. Encrypt TOTP secrets at rest using
  `CLARIX_TOTP_ENCRYPTION_KEY`; document backup and safe key rotation. Disabling
  or re-enrolling requires the current password and a valid second factor.
  Add persistent rate limits, replay protection, generic failures and audited
  factory-wide MFA requirements with a visible grace period.
- Platform Admin MFA requirement is a deployment setting, default ON in
  production and OFF in development. Per the final clarification, guide setup
  at sign-in but enforce only AFTER completed enrollment and acknowledgement
  that recovery codes were saved. Before that, password-only access remains a
  disclosed risk. Turning the deployment requirement OFF temporarily bypasses
  the Platform Admin second-factor challenge without deleting enrollment or
  granting tenant membership. Deployment configuration is a privileged boundary.
  Seeded development accounts receive no MFA prompt unless explicitly enrolled;
  the existing seed guard and production rejection remain unchanged.
- Add active-session listing/revocation, last-sign-in information, configurable
  idle/absolute expiry and recent sign-in confirmation for sensitive actions.
  Preserve production Secure/HttpOnly/SameSite cookies. Retain 12–256-character
  passwords, provide bilingual strength guidance and reject a small common list.
  Enforce per-account and per-IP limits without exposing account existence.
- NotificationProvider is an interface with a non-sensitive no-op implementation,
  not email delivery. Document later email requirements.
- Build bilingual responsive enrollment/reset/recovery/session UI and Help.
  Verify lifecycle, concurrency, tenant denial, production bootstrap, seeded
  sign-in and secret handling in isolated targets only. Run the complete suite
  in one green invocation; report actual browser coverage and dev before/after
  counts/fingerprints, remaining risks, secret names and manual steps honestly.

### Approved Phase 13: factory management

Platform Admin has a metadata-only `/platform` console to create factories,
invite their first manager, recover/revoke that invitation while no active
manager exists, suspend/reactivate factories and set member/upload/row limits.
It never grants production-data access or delegation. Lists and append-only
platform audits are paginated. Suspensions revoke sessions and retain all data.
Factory Managers alone edit their own factory's display name, language, exact
unit factors and material-balance warning/error thresholds (1%/5% defaults,
0–100 with warning strictly below error). Settings changes are audited with
old/new values and affect future checks only, never approved results.
Deployment-secret onboarding may optionally create the first Platform Admin
invitation instead of the first-manager invitation. The legacy manager mode
remains supported. Both modes require zero users, a hashed seven-day token,
an immutable initialization latch, transactional fail-closed setup and no
credential/link logging. No public signup, delegation, billing, email,
password reset, SSO, AI, export, snapshots or reconciliation is added.

### Approved Phase 10: MVP polish and publish readiness

Production-gate clarification: replace manual first-manager bootstrap with a
production-only, pre-API security provisioning process. Replit Publish continues
to own table migrations. The separate process configures the runtime role and
tenant/immutability protections transactionally, verifies them, then replaces
itself with the restricted API process without owner/bootstrap credentials.
While there are zero users, create only the first factory and a seven-day
manager invitation from a user-supplied 32-byte base64url deployment token.
Store its SHA-256 hash, no fake audit user and no logged token/link/password.
Existing invitation state is a permanent once-only latch: repeated starts never
renew its expiry or recreate it. Any existing user disables this initializer.
The existing invitation page handles password choice; no new setup page exists.
Remove the deployment token after first-manager sign-in. Runtime password must
differ from development; the deployment must not include SEED_TEST_PASSWORD.

The approved Phase 10 brief replaces the second-factory roadmap entry.
Scope: reliable persisted language/theme, bilingual copy and missing-key checks,
non-blocking dismissible onboarding, helpful empty/error states and a short
bilingual Help page. Add a privileged, explicitly invoked production bootstrap
command for a factory and its first manager's hashed, expiring invitation.
Production must reject seeded identities even when test seeding is disabled.
Verify security headers, sessions/CSRF, rate/upload limits, logging, empty-database
setup, runtime privileges and RLS; document publishing, backup and rollback.
Run isolated acceptance tests without modifying development Ethmar/Najm data.
Report missing browser combinations honestly. No charts, exports, AI, snapshots,
reconciliation, resolve workflow, calculation changes or fixture changes.
Publishing itself requires a separate user action.

### Approved Phase 9: isolation, runtime login and scale proof

The approved Phase 9 brief replaces the charts/explanations/PDF roadmap entry.
Use Najm's baseline through the real UI/API import pipeline, prove applicable
T1–T12 tenancy checks, audit ENABLE/FORCE RLS on every factory_id table, and
connect the application directly as clarix_runtime using its own secret.
Privileged credentials are restricted to setup/migration/development scripts.
Measure an isolated 20-factory dataset with approximately 200,000 production
records and 100,000 events (largest factory approximately 50,000 records).
Report p50/p95 honestly: Runs/Comparison/Source Drawer under 1 second p95,
Data Quality under 1.5 seconds p95, and a 50,000-row import under 60 seconds
without blocking other users. Add indexes only on measurement evidence.
Najm's baseline import is the only authorized development-data addition;
all adversarial and scale tests remain isolated and are cleaned up.
Charts, exports, AI, snapshots, reconciliation, resolution workflows and
Platform Admin delegation are not included.

### Approved Phase 8: accounts and invite-only onboarding

The accounts-and-invitations brief replaces the original Phase 8 roadmap scope.
Only Factory Managers manage their factory's members and single-use invitations.
Invitation secrets are stored only as hashes and expire after seven days; links
are shown once for manual sharing. No public signup or email sending.
New passwords require at least 12 characters, accept spaces and Arabic text,
and are hashed with Argon2id. Existing passwords are required for password changes.
Role changes, deactivation, invitation actions and password changes are audited.
The last active Factory Manager cannot be demoted or deactivated.
Password reset by email, Platform Admin delegation, second-factory features,
reconciliation and snapshots are outside this phase.

- One platform, logical isolation: every row has `factory_id`; every query is scoped server-side from the authenticated membership, never from a client-supplied id alone. Add PostgreSQL Row-Level Security as a **second** layer, with tests.
- Adding a factory: create → invite manager → set units/time zone → upload sample → review mapping → approve. No code change per factory.
- Cross-factory comparison is a future feature requiring explicit consent from both sides and aligned definitions.
- Required isolation tests: see `docs/TENANCY_TESTS.md`.
- File safety: validate type, size, content; CSV-injection neutralisation on export; secrets only in server environment (Replit Secrets); retention policy for raw files; backups with a tested restore; audit log without secrets.
- Platform Admin does not see production data by default.

---

## 12. Design system

### Approved Phase 12 — charts, indicators and fixed explanations

The new Phase 12 brief replaces the roadmap's demo/deploy scope. Add only two
Comparison charts (scrap rate and changeover), a separate downtime panel, four
reusable metric indicators, and one Overview current-order status stacked bar.
Overview's metric indicators refer explicitly to its suggested comparison pair,
not to inferred factory-wide rates. Add bilingual glossary tooltips and Help
definitions. No export, AI, snapshots, reconciliation, targets, trends or extra
charts. Chart export and timelines described below remain deferred.

The server supplies chart_spec values, captions, differences, availability,
source references, display formatting and cosmetic animation frames. Renderers
only display them. Exact decimal strings remain authoritative; numeric plotting
coordinates and percentage widths are geometry only, not calculation inputs.
Preserve every existing table/engine value. Specifically, scenario 05 retains
its stored 10% table value but omits the blocked chart bar. Missing and blocked
bars are omitted (overriding the older hatched-bar rule), with Not available,
the reason and Data Quality link. Never substitute zero. Unaffected bars and
metric groups remain visible. Display differences only when comparable.
Animations run 300–600ms without hiding the final readable value; reduced motion
disables them entirely. All new claims use neutral, fixed bilingual templates.

**Languages:** Arabic (RTL) and English (LTR), switch in the top bar, remembered per user. **Themes:** light, dark, system; remembered per user. Mirror layout, chart axes and icons for RTL. Use logical CSS properties (`margin-inline-start`, etc.).

**Fonts:** Arabic — *IBM Plex Sans Arabic*; English — *Inter*. Formal, clear. Numbers use Latin digits (0-9) in both languages, with `font-variant-numeric: tabular-nums`. Body 16 px; headline comparison numbers 32–40 px.

**Colour tokens** (all pairs below were checked for WCAG AA ≥ 4.5:1 on the stated surface; keep that if you adjust):

| Token | Light | Dark |
|---|---|---|
| background | `#F6FAF8` | `#0B1210` |
| surface | `#FFFFFF` | `#121C18` |
| text | `#10201A` | `#E7F0EC` |
| text-muted | `#4B5F57` | `#9DB3AA` |
| primary (brand green) | `#0F766E` (accent gradient to `#16A34A`) | `#2DD4BF` |
| on-primary | `#FFFFFF` | `#052E2B` |
| status green | `#166534` | `#4ADE80` |
| status amber | `#92400E` | `#FBBF24` |
| status red | `#B91C1C` | `#F87171` |
| series: good output | `#0E7490` | `#22D3EE` |
| series: scrap | `#C2410C` | `#FB923C` |
| series: changeover | `#2563EB` | `#60A5FA` |
| series: unplanned stop | `#7C3AED` | `#A78BFA` |

- Brand green is **identity only**. It never means "good": a higher scrap rate must not look green. Series colours are fixed per meaning in both themes. Never rely on colour alone: icon + text, patterns/direct labels on charts.
- **UX rules:** one question per screen; any task in ≤ 3 clicks; plain words with a "?" tooltip showing the formula; designed empty/loading/error states; first-run 3-step tour; responsive phone/tablet/desktop; keyboard navigable; focus rings; AA contrast.
- **Charts (wave 2+):** one reusable `ChartCard` (title, chart, "What does this show?" text, "Show as table" toggle, PNG export, warning badge). Charts only render a ready `chart_spec` from the calculation engine — the UI never calculates. Animations 300–600 ms, count-up numbers, hover tooltips with the formula, subtle pulse on warnings only, **honour `prefers-reduced-motion`**. Missing value = hatched bar labelled "Not available", never a zero bar. Timeline (custom SVG) draws changeover and unplanned stops as separate bars and shows overlap visibly.
- **Explanations under charts:** sentence from fixed templates filled with computed values (e.g. "E-02 scrap rate is 5 percentage points higher than E-01.") — correct by construction. An optional "Explain more" button uses AI in wave 3.

Bilingual key strings:

| Key | English | Arabic |
|---|---|---|
| scrap_rate | Scrap rate | نسبة الهدر |
| good_rate | Good output rate | نسبة الإنتاج الجيد |
| material_balance | Material balance | ميزان المواد |
| changeover | Changeover time | زمن تغيير القالب |
| unplanned_stop | Unplanned downtime | التوقف غير المخطط |
| pp | percentage points | نقاط مئوية |
| na | Not available | غير متوفر |
| not_computable | Not computable | غير قابل للحساب |
| no_events | No events recorded | لا أحداث مسجلة |
| open_source | Open source rows | افتح الصفوف المصدر |
| hypothesis | Hypothesis | فرضية |

---

## 13. Reconciliation and snapshots (wave 2)

### Approved Phase 15 — printable frozen-snapshot reports

Factory Managers, Analysts and Viewers may prepare a bilingual A4 report from
a stored snapshot and its saved reconciliation records. Platform Admins are
denied and foreign-factory IDs return the same 404 as unknown IDs. No engine or
live comparison is invoked. Include frozen values/charts/statuses/explanations,
issues and original references, provenance hashes and definition version.
The user approved import IDs alongside the snapshot ID as a narrow exception;
exclude other internal database IDs from the document.

Use a dedicated print document and the browser's Save as PDF fallback because
the current production build does not provision a verified headless browser.
Bundle/embed IBM Plex Sans Arabic and Inter; verify actual generated PDFs.
The suggested filename is predictable, but the user controls the save dialog.
Preparation audit records actor, snapshot and language, not content; it does
not assert that the user completed saving. Server-side size, time and persistent
per-user export limits apply. Oversize reports fail explicitly, never truncate.
Escape user text and prefix formula-like text with an apostrophe, without
changing trusted numeric signs. No public links, emails, schedules, AI, live
comparison exports or metric changes.

### Approved Phase 14

Factory Managers and Analysts can save immutable comparisons and append factory
report reconciliation records; Viewers can read only, and Platform Admins have
no access. Snapshots retain original imports, hashes, mappings, definition
version, exact results, statuses, issues, chart specifications and source links.
Later imports never modify a snapshot. Current-data differences are separate.
Reconciliation uses reported minus Clarix, with exact equality and decimal
arithmetic. Empty inputs are Not provided. The user explicitly chose to refuse
reconciliation for **every figure in a red group**, including non-null Input and
Good output in scenario 07. This does not change table or chart availability.
Lists and reconciliation history are paginated. No editing, deletion, exports,
AI, report uploads, targets, trends or email is included.

- **Snapshot:** every saved comparison stores the file hashes, mapping version, metric-definition version, results and warnings. Uploading new files creates new data; old snapshots never change. Reports print the snapshot id and date.
- **Reconciliation:** the user types the totals from the factory's own report; the app shows per figure "Matches ✓" or the difference.

---

## 14. AI (wave 3 only)

### Approved Phase 17 — constrained AI features and explanation UX

The approved Phase 17 brief extends Phase 16: typed AR/EN questions route only
to a fixed read-only intent catalogue; code validates factory-owned parameters,
executes existing data paths and authors every answer. No model-authored facts,
SQL, calculations, chat history or saved AI text. Add exact-decimal explanatory
ratios/shares without changing engine definitions; compact labelled sources;
catalogue-based quality assistance in issue details/import review; and at most
three code-prioritised Overview next actions. Model output only selects,
orders or ranks allowed items. Chips and quality guidance work without AI.

Consent version 2 explicitly discloses sending typed questions and repeats the
free-tier warning. Prior consent does not authorize these new provider calls;
the old explanation may continue under version 1. Manager reconfirmation is
audited. No raw rows, files, filenames, cell text, personal names/emails, notes
or snapshot titles may be sent. Source identities may be represented by opaque
aliases; local display/source links retain their real labels. Questions are
untrusted, bounded and never persisted or logged; only intent/status/hashes/
metadata may be recorded. Unknown, ambiguous, cross-factory and rule-changing
requests fail closed. Causal questions receive non-causal code explanations.

Replace separate Quick questions with chips. Comparison order is summary,
key figures, charts, AI explanation, collapsed detail tables/reconciliation.
Downtime disclaimer appears only in page summary and downtime section, not AI.
Preserve factory-scoped caps/cache/breaker, role checks and source traceability.
Use isolated tests and a single complete-suite run. At most three optional
synthetic live calls; report skipped/failed checks and partial browser coverage.
No mapping suggestions, trends, other providers, voice/images or fixture edits.

### Approved Phase 16 — Gemini foundation

The Phase 16 brief supersedes the older logging and statement-schema rules
below. Code calculates; AI explains and suggests only. AI is OFF by default
per factory. Only a Factory Manager may change consent, after confirming a
bilingual data-disclosure notice; changes record actor/time/old/new values.
Platform Admin has no tenant AI access. Manager, Analyst and Viewer may request
an explanation only while their factory has consent enabled.

Use a swappable AIProvider, a server-side GeminiProvider using GEMINI_API_KEY
and configurable GEMINI_MODEL, and a deterministic FakeProvider for tests.
Only allowlisted, server-computed facts are sent: exact decimal strings, units,
fixed labels, statuses, issue codes and order identifiers. Never send raw rows,
file contents, filenames, cell text, names, emails, notes or snapshot titles.
Source links resolve inside Clarix; source cells are not prompt material.
Questions are untrusted data and are not exposed as a UI feature this phase.

Output uses FACT / HYPOTHESIS / SUGGESTION statements with cited fact IDs.
Reject the whole answer for uncited facts, unsupported numbers or relations,
status mismatches, invented entities, factual causation, unlabeled hypotheses,
links, markup or execution instructions. Hypotheses must be labelled possible
explanations to check and include a way to check them. Retry invalid output once,
then use the existing code-template explanation with an AI-unavailable notice.
Never display unvalidated model output.

Store/log interaction metadata only (factory/user/task/status/latency/model
and token counts when available), never questions, prompts or responses.
Validated-response caching is a separate, bounded, factory-scoped facility,
not an interaction log or snapshot record. Its key includes facts, task,
language and model. Configure quotas, timeouts and circuit-breaker limits;
do not hard-code Google's model-specific limits. Missing credentials or
disabled consent must leave the core app fully usable.

Add only Explain in simple words on Comparison and snapshot detail, a shared
AIPanel with source links and visible facts, consent controls and Help.
No chat, free-form question UI, quality assistant, mapping suggestions,
saved AI text, PDF AI content, extra providers, trends, images or voice.
Use isolated tests and FakeProvider, with at most one optional live baseline
smoke call if a key is supplied. Google free-tier disclosure must be grounded
in current official terms, including product-improvement/human-review use and
the prohibition on submitting sensitive, confidential or personal information.

Role: explain, never calculate.
Features: performance summary (cites rows) · "Ask your data" · data-quality explainer and mapping suggestions (user confirms) · hypotheses for investigation.

Flow: user asks → server checks permission and factory → **fixed tools only** (`get_run_metrics`, `list_runs_above_threshold`, `get_issues`, …; no free SQL) → bounded summary sent to the model → model returns **structured output**:
`{ "statements": [ { "type": "FACT" | "HYPOTHESIS" | "SUGGESTION", "text": "...", "refs": [ "<fact id>" ] } ] }`
→ automatic validation → render with links to source rows.

Validation rules (reject and regenerate or show "insufficient information" if any fails):
1. A **fact** must match a computed metric or a source row exactly (numbers equal, refs exist and belong to this factory).
2. A **fact** may not contain causal wording ("because", "due to", "caused by", "as a result of", «بسبب»، «نتيجة»…). Causal language is allowed **only** in a statement typed `hypothesis`, phrased "may be…/قد يكون…", always displayed with the **Hypothesis / فرضية** badge in a separate section.
3. A hypothesis must reference real recorded differences that motivate the question (e.g. different mold ids), never invented data.
4. Numbers verified ≠ explanation verified: also check that each fact's stated relation (higher/lower/longer/separate) agrees with the computed comparison.
5. No cross-factory data in a prompt; no free SQL; the API key stays server-side; configurable per-user and per-factory limits; metadata-only interaction auditing, never question/answer content.
6. If data is insufficient → say so. If the AI service fails → all calculations and comparisons keep working.

AI test suite before release: valid questions; questions without data; leading questions that push for causes ("prove the stop caused the scrap" → must refuse the causal claim); prompt-injection text inside a CSV cell; cross-factory questions.

---

## 15. Test data and acceptance

`test-data/` contains Ethmar's clean case + 24 defect scenarios and a second factory (Najm Packaging, different CSV dialect and an id that collides with Ethmar's). `expected/expected_results.json` holds hand-written expected outputs. `tools/reference_calc.py` is a small reference implementation of the rules; `tools/verify.py` checks it against the golden set (`python3 tools/verify.py`).

**The app's own engine must reproduce every expected value.** Port the golden set into the app's automated tests (Vitest/Jest): load each folder through the real import pipeline and assert the same results. See `docs/SCENARIO_CATALOG.md`.

Acceptance (wave 1): E-01 5% / 240 min · E-02 10% / 360 min · +5 pp · +120 min · 45 min separate with the non-causal note · every number opens its source rows · duplicates, missing values, zero input, unit problems and unmapped codes are surfaced as specified (never zero, never silent).

**Not covered by the golden set (specify and test separately):** unreadable numbers (fail loudly with a clear error, never guess), rows without an order id, runs referenced but absent from the orders file, Excel files, very large files, time zones, the UI itself, isolation (see tenancy tests), AI behaviour.

---

## 16. Build roadmap (one prompt per step; each ends with its gate)

| # | Phase | Wave | Gate |
|---|---|---|---|
| 0 | Put this spec, `replit.md` and `test-data/` in the project | 1 | files present, `python3 tools/verify.py` passes |
| 1 | Foundation: design system (tokens, fonts, themes, RTL/LTR, i18n), layout shell, auth, factories, roles | 1 | login works; theme/language switch persists; empty screens look finished |
| 2 | Database schema + tenancy middleware (+ RLS) | 1 | a factory-A user cannot read factory-B rows |
| 3 | **Calculation & quality engine (no UI)** + golden-set tests | 1 | all golden scenarios pass |
| 4 | Import wizard: upload, encoding/delimiter detection, mapping templates, raw-row storage, hash | 1 | both factories import with their own mapping; duplicate file flagged |
| 5 | Data Quality Center + status badge | 1 | each scenario shows the right colour and reason |
| 6 | Runs list + Comparison page | 1 | baseline shows 5% / 10% / +5 pp / +2 h / 45 min separate |
| 7 | Source Drawer (drill-down) | 1 | any number opens its file/line rows, excluded and quarantined rows included |
| 8 | Accounts, roles and invite-only onboarding | 1 | secure invitation lifecycle, member management and session revocation; isolated tests |
| 9 | Second factory, isolation proof, runtime database login and scale check | 2 | applicable tenancy tests and forced-RLS coverage pass; direct least-privilege login proven; measured latency reported |
| 10 | MVP polish and publish readiness | 1 | isolated acceptance, production bootstrap, bilingual reliability and explicit readiness report |
| 11 | AI assistant (tools, structured output, validator) | 3 | AI test suite passes |
| 12 | Charts, indicators and plain-language explanations | 2 | server chart/table/golden parity, omitted blocked values, isolated browser and reduced-motion checks |

Rules for each prompt: state the goal, what **not** to build yet, the acceptance check, and the tests to add. Create a checkpoint before each phase. If the agent drifts, roll back rather than patch on top.

### Demo script (5 min)
1. Load Ethmar baseline → clean quality badge. 2. Compare E-01 vs E-02: 5% vs 10%, 4 h vs 6 h. 3. Click "100 kg" → original rows with file and line. 4. 45 min stop shown separately with the non-causal note. 5. Upload `05_suspected_duplicate_record` → red badge, comparison blocked, alternatives shown. 6. Reconcile against a factory report. 7. Switch language and theme; export PDF. 8. Log in to Najm Packaging → fully separate data (and its own `E-01`). 9. (Wave 3) Ask the AI; show facts with source links and a labelled hypothesis.
