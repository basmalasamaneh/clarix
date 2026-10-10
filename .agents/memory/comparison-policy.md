---
name: Comparison policy
description: User clarification on partial comparisons and the meaning of a run date
---
Refuse red time groups, not the whole comparison. Volume is per metric: display
non-null approved engine values even if Volume is red; show unavailable values
with reasons and Data Quality links. Preserve golden rate-difference refusal.
**Why:** The user replaced whole-comparison refusal with per-group refusal, then
explicitly refined Volume to per-metric availability (scenario 07 retains Input
and Good output). Do not reintroduce either superseded blanket refusal.
**How to apply:** Preserve locked engine/fixture behavior; never turn a group's
unavailable result into zero or hide unaffected groups because overall is red.

The displayed run date means the earliest included production-record date, not
the import/approval date. If none exists, show Not available.
**Why:** A run can span multiple records and dates; upload time is not production
time, and the specification supplied no separate canonical run-date field.
**How to apply:** Keep this meaning explicit in UI copy and reports; use the
original production dates for lineage, without inferring dates from events.
