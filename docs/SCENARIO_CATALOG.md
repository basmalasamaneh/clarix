# Scenario catalogue

Folder `test-data/ethmar-plastics/<name>/` — upload the whole folder (CSV files + mapping.json).
Expected numbers for every scenario are in `expected/expected_results.json`.

| Scenario | What is wrong with the data | What the app must do |
|---|---|---|
| `00_baseline` | Nothing. This is the clean case from the brief. | E-01: 5% scrap, 240 min changeover. E-02: 10% scrap, 360 min changeover, 45 min stop shown separately. Both GREEN. |
| `01_duplicate_event_same_id` | Same event row appears twice with the same event_id and identical content. | E-02 downtime YELLOW; duplicate excluded; still 45 min. |
| `02_suspected_duplicate_event` | A second stop with a different event_id but identical order/type/start/end. | E-02 downtime YELLOW; shows 90 min with alternative 45 min; not auto-excluded. |
| `03_conflicting_duplicate_event_id` | Same event_id twice with different content (end time differs). | E-02 downtime RED; both rows quarantined; value N/A. |
| `04_duplicate_record_identical` | Production record PR-5004 repeated identically. | E-02 volume YELLOW; copy excluded; totals unchanged (1000/900/100). |
| `05_suspected_duplicate_record` | New record id PR-5009 with the same content as PR-5004. | E-02 volume RED (comparison blocked); totals 1350/1215/135 with alternative 1000/900/100. |
| `06_conflicting_duplicate_record_id` | PR-5004 appears twice with different good/scrap values. | E-02 volume RED; both rows quarantined; all sums N/A. |
| `07_missing_scrap_value` | Scrap cell empty on PR-5004. | E-02 volume RED; scrap, scrap rate and balance N/A (never 0, never back-calculated). |
| `08_zero_input` | All E-02 records have input 0 (and 0 good, 0 scrap). | E-02 volume RED; rates 'not computable'. |
| `09_material_imbalance` | PR-5005 good output lowered to 200 so input - good - scrap = 25 kg. | E-02 volume YELLOW; balance 25 kg (2.5% of input); numbers are NOT adjusted. |
| `10_incompatible_unit` | PR-5005 unit is 'pcs' (not convertible to kg). | E-02 volume RED; sums N/A; comparison refused. |
| `11_unit_converted_tonnes` | PR-5005 recorded in tonnes (0.25 / 0.225 / 0.025). | E-02 volume GREEN with an info note; totals still 1000/900/100 kg. |
| `12_possible_overlap` | Unplanned stop 08:15-09:00 falls inside changeover 06:00-12:00. | E-02 changeover + downtime YELLOW; 45 min overlap reported; no causal claim. |
| `13_duration_mismatch` | EV-2001 duration_min says 300 but start/end give 360. | E-02 changeover YELLOW; value taken from timestamps = 360. |
| `14_missing_event_id` | EV-2001 has an empty event_id. | E-02 changeover RED; row quarantined; value N/A. |
| `15_invalid_time_range` | EV-2001 ends before it starts. | E-02 changeover RED; row quarantined; value N/A. |
| `16_missing_record_id` | PR-5004 has an empty record_id. | E-02 volume RED; row quarantined; sums N/A. |
| `17_multiple_changeover_events` | E-02 changeover split into two consecutive events (2h + 4h). | E-02 changeover GREEN with info note; total 360 min. |
| `18_unmapped_and_planned_events` | E-01 gets a planned-maintenance event (PMT) and an event with unknown code XYZ. | E-01 downtime YELLOW (unmapped code); planned event ignored (info). |
| `19_totals_only_level1` | Export contains totals only (no records, no timed events). | All groups YELLOW with LEVEL1_TOTALS_ONLY; numbers still 5% / 10% / 240 / 360 / 45. |
| `20_duplicate_file_upload` | Exact same files uploaded a second time. | Second import detected by content hash (DUPLICATE_FILE); nothing is counted twice. |
| `21_arabic_cp1256` | events.csv saved as Windows-1256 with Arabic reasons. | Decoded correctly; all metrics identical to baseline; GREEN. |
| `22_csv_injection_cells` | Reason cells start with '@' and '='. | Metrics unchanged GREEN; FORMULA_LIKE_CELL info; exports must neutralise these cells. |
| `23_no_changeover_event` | EV-2001 (E-02 changeover) removed from the file. | E-02 changeover YELLOW (NO_CHANGEOVER_EVENT); value N/A; changeover comparison refused. |
| `24_no_production_records` | All E-02 production records removed. | E-02 volume RED (NO_PRODUCTION_RECORDS); all volume values N/A. |

Second factory: `test-data/najm-packaging/00_baseline/` (semicolon CSV, decimal comma, dd/mm/yyyy dates, tonnes, and a job id `E-01` that collides with Ethmar's `E-01`).
