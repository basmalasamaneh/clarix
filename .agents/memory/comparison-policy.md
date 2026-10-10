---
name: Comparison policy
description: User clarification on partial comparisons and the meaning of a run date
---
Refuse only red metric groups, not the whole comparison. Keep unaffected groups
visible and show the overall status and blocking reasons.
**Why:** The user explicitly chose this over the whole-comparison blocking rule
in the original Phase 6 attachment. Do not reintroduce that superseded instruction.
**How to apply:** Preserve locked engine/fixture behavior; never turn a group's
unavailable result into zero or hide unaffected groups because overall is red.

The displayed run date means the earliest included production-record date, not
the import/approval date. If none exists, show Not available.
**Why:** A run can span multiple records and dates; upload time is not production
time, and the specification supplied no separate canonical run-date field.
**How to apply:** Keep this meaning explicit in UI copy and reports; use the
original production dates for lineage, without inferring dates from events.
