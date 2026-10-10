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

For automatic Overview suggestions, retain the existing Data Quality designation
of comparable (overall OK/Check), without banning manual partial comparisons of
Blocked runs. Exclude undated runs from “most recently produced” suggestions.
**Why:** The small Overview was scoped to reuse existing server results, not
introduce a second metric eligibility definition or infer dates from uploads.
**How to apply:** Keep automatic-shortcut eligibility separate from what the
Comparison page permits; explain the narrower suggestion scope in both languages.

Chart availability is stricter than raw table visibility: preserve non-null
table values but omit blocked chart bars, with their reason and Quality link.
**Why:** The user explicitly approved this distinction for scenario 05: the
stored 10% must remain unchanged even though it must not be plotted.
**How to apply:** Keep original exact values in chart contracts for parity
checks and represent plotting availability separately. Never replace them with
zero or change the engine/table rule to make the chart simpler.
