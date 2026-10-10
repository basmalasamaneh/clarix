# Arabic wording and formatting verification

## Scope
Presentation only: terminology, grammatical number, spacing, minus signs and
screen-reader text. No calculation, metric value, status rule, fixture, raw cell,
stored snapshot, or visible layout/control logic was changed. Nothing published.
The hidden chart table's accessibility wrapper was corrected after it caused
horizontal overflow.

The before → after wording ledger is in `ARABIC_LANGUAGE_CHANGES.md`.

## Final checks
| Check | Result |
|---|---|
| Full isolated API suite (including tenancy, accounts, platform and snapshots) | 106/106 |
| Engine/golden fixtures | 55/55 |
| Python reference checks | 52/52 |
| Formatting snapshots and preferences | 11/11 |
| EN/AR key parity | 1,425 keys; passed |
| Frontend typecheck and production build | Passed |
| Backend typecheck (implementation check) and restarted build | Passed |
| Protected fixture paths | No changes to test-data/, expected/ or tools/ |

Formatting covers 0, 1, 2, 3, 10, 11, 100, 0.75 and negative values in both
languages. It preserves decimal strings, uses U+2212 and exactly one NBSP,
and checks legacy saved sentences without rewriting their stored payloads.

The initial full run failed two caption assertions expecting ordinary spaces;
only those text expectations were updated to NBSP. The final full run passed.
Early concurrent screenshot/test harnesses also produced role-fingerprint
failures because each observes cluster-wide temporary roles. Final runs were
serialized, cleaned up their isolated targets and passed all fingerprints.

## Development data — before → after
These are stored row counts, not filtered UI counts.

| Factory | Imports | Orders | Raw rows | Production records | Events | Issues | Snapshots | Reconciliations |
|---|---|---|---|---|---|---|---|---|
| Ethmar | 4 → 4 | 6 → 6 | 41 → 41 | 16 → 16 | 9 → 9 | 2 → 2 | 1 → 1 | 0 → 0 |
| Najm | 1 → 1 | 2 → 2 | 8 → 8 | 3 → 3 | 3 → 3 | 2 → 2 | 0 → 0 | 0 → 0 |

All observed ordinary-table, factory and role fingerprints matched after cleanup,
not just the counts. Proof: `generated-artifacts/test-isolation/latest.json`.

## Screenshots
Final directory:
`generated-artifacts/arabic-language/2026-10-10T20-51-13-669Z/`.

Captured Comparison, Overview, snapshot detail and reconciliation history table,
each at 360px and 1280px, in Arabic, light and dark: **16/16, none missing**.
All had `lang=ar`, `dir=rtl`, the requested theme, and document width equal to
viewport width. The earlier overflow was resolved in this final matrix.

These are viewport captures, not full-page coverage or interactive accessibility
certification. I cannot judge overall visual quality; the captures and measured
checks are evidence, not a visual-quality approval.

## Remaining terminology questions
No further terminology was guessed: alternatives for run totals, directional
left/right run labels in RTL, and “تبديل” versus “تغيير القالب” are listed in
the wording ledger. Zero uses the singular unit; duals retain the numeric digit;
percent also receives an NBSP, following the brief.

Non-blocking warnings remain: the existing large frontend bundle warning, and
listener-count warnings during fixture upload tests. Neither caused final failure.
