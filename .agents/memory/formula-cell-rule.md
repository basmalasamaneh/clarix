---
name: Approved formula-cell rule
description: User-authorized resolution of the spec/reference discrepancy for formula-like cells.
---
Follow the spec rather than the Python reference's narrower formula-cell scan:
inspect raw text cells before trimming, including TAB/CR. Exclude mapped numeric
and date fields. Use the mapped source column in `file:line:column`; emit the
file-level info issue once. Keep expected results unchanged and place synthetic
edge cases in tests, never in test-data.

**Why:** The user explicitly resolved the discrepancy and emphasized that a
legitimate negative number such as -5 must never be flagged as a formula.

**How to apply:** Preserve this decision when adding readers or changing
normalization; do not “restore parity” by narrowing detection back to the Python
reference. Keep the decision in a code comment and include it in phase reports
when this behavior is changed.
