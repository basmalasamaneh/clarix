#!/usr/bin/env python3
"""
Clarix test-data generator.

Builds the Ethmar Plastics baseline (the case from the brief) plus 24 defect
scenarios, and a second factory (Najm Packaging) with a different CSV dialect.

Run:  python3 tools/generate_test_data.py
Then: python3 tools/verify.py

The generator only writes INPUT files (CSV + mapping.json) and MANIFEST.sha256.
Expected results live in expected/expected_results.json and are written by hand,
so the reference calculator is checked against an independent source of truth.
"""
import copy
import csv
import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "test-data"

# --------------------------------------------------------------------------
# Ethmar Plastics baseline (Level 3 data: records + timed events)
# --------------------------------------------------------------------------
ORDER_COLS = ["order_id", "product_code", "line_id", "machine_id", "mold_id"]
REC_COLS = ["record_id", "order_id", "machine_id", "mold_id", "shift",
            "record_date", "material_input", "good_output", "scrap", "unit"]
EV_COLS = ["event_id", "order_id", "machine_id", "mold_id", "shift",
           "event_code", "start_time", "end_time", "duration_min", "recorded_reason"]

BASE_ORDERS = [
    dict(order_id="E-01", product_code="CAP-38-HDPE", line_id="LINE-1", machine_id="INJ-03", mold_id="MLD-114"),
    dict(order_id="E-02", product_code="CAP-38-HDPE", line_id="LINE-1", machine_id="INJ-03", mold_id="MLD-207"),
]


def rec(rid, order, mold, shift, date, inp, good, scrap, unit="kg"):
    return dict(record_id=rid, order_id=order, machine_id="INJ-03", mold_id=mold, shift=shift,
                record_date=date, material_input=inp, good_output=good, scrap=scrap, unit=unit)


def ev(eid, order, mold, shift, code, start, end, dur, reason):
    return dict(event_id=eid, order_id=order, machine_id="INJ-03", mold_id=mold, shift=shift,
                event_code=code, start_time=start, end_time=end, duration_min=dur, recorded_reason=reason)


BASE_RECORDS = [
    rec("PR-5001", "E-01", "MLD-114", "A", "2026-09-01", "600", "570", "30"),
    rec("PR-5002", "E-01", "MLD-114", "B", "2026-09-01", "400", "380", "20"),
    rec("PR-5003", "E-02", "MLD-207", "A", "2026-09-02", "400", "360", "40"),
    rec("PR-5004", "E-02", "MLD-207", "B", "2026-09-02", "350", "315", "35"),
    rec("PR-5005", "E-02", "MLD-207", "C", "2026-09-02", "250", "225", "25"),
]
BASE_EVENTS = [
    ev("EV-1001", "E-01", "MLD-114", "A", "CHG", "2026-09-01 06:00", "2026-09-01 10:00", "240", "Mold change to MLD-114"),
    ev("EV-2001", "E-02", "MLD-207", "A", "CHG", "2026-09-02 06:00", "2026-09-02 12:00", "360", "Mold change to MLD-207"),
    ev("EV-2002", "E-02", "MLD-207", "B", "UDT", "2026-09-02 15:10", "2026-09-02 15:55", "45", "Unplanned stop - feed interruption"),
]

MAPPING_A = {
    "schema_version": 1,
    "capability_level": 3,
    "source_name": "Ethmar ERP export",
    "format": {"encoding": "auto", "delimiter": "auto", "decimal_separator": ".",
               "date_format": "%Y-%m-%d", "datetime_format": "%Y-%m-%d %H:%M"},
    "files": {
        "orders": {"file": "orders.csv", "columns": {
            "order_id": "order_id", "product_code": "product_code", "line_id": "line_id",
            "machine_id": "machine_id", "mold_id": "mold_id"}},
        "records": {"file": "production_records.csv", "columns": {
            "record_id": "record_id", "order_id": "order_id", "machine_id": "machine_id",
            "mold_id": "mold_id", "shift": "shift", "record_date": "record_date",
            "input": "material_input", "good": "good_output", "scrap": "scrap", "unit": "unit"}},
        "events": {"file": "events.csv", "columns": {
            "event_id": "event_id", "order_id": "order_id", "machine_id": "machine_id",
            "mold_id": "mold_id", "shift": "shift", "event_code": "event_code",
            "start": "start_time", "end": "end_time", "duration_min": "duration_min",
            "reason": "recorded_reason"}},
    },
    "event_code_map": {"CHG": "CHANGEOVER", "UDT": "UNPLANNED_DOWNTIME", "PMT": "PLANNED_STOP"},
    "unit_factors_to_kg": {"kg": "1", "kgs": "1", "t": "1000", "tonne": "1000",
                           "lb": "0.45359237", "g": "0.001"},
    "tolerances": {"imbalance_warn_pct": "1", "imbalance_error_pct": "5"},
}

MAPPING_LEVEL1 = copy.deepcopy(MAPPING_A)
MAPPING_LEVEL1["capability_level"] = 1
MAPPING_LEVEL1["source_name"] = "Ethmar totals-only export"
MAPPING_LEVEL1["files"] = {
    "orders": MAPPING_A["files"]["orders"],
    "totals": {"file": "run_totals.csv", "columns": {
        "order_id": "order_id", "input": "material_input_kg", "good": "good_output_kg",
        "scrap": "scrap_kg", "changeover_hours": "changeover_hours",
        "downtime_min": "unplanned_downtime_min"}},
}

# --------------------------------------------------------------------------
# Writers
# --------------------------------------------------------------------------

def write_csv(path, cols, rows, encoding="utf-8-sig", delimiter=","):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding=encoding, newline="") as f:
        w = csv.writer(f, delimiter=delimiter, lineterminator="\r\n")
        w.writerow(cols)
        for r in rows:
            w.writerow([r[c] for c in cols])


def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


class DS:
    """A mutable copy of the baseline used by scenario mutators."""

    def __init__(self):
        self.orders = copy.deepcopy(BASE_ORDERS)
        self.records = copy.deepcopy(BASE_RECORDS)
        self.events = copy.deepcopy(BASE_EVENTS)
        self.mapping = copy.deepcopy(MAPPING_A)
        self.events_encoding = "utf-8-sig"
        self.level1_totals = None


def write_ds(folder, ds):
    write_csv(folder / "orders.csv", ORDER_COLS, ds.orders)
    if ds.level1_totals is not None:
        cols = ["order_id", "material_input_kg", "good_output_kg", "scrap_kg",
                "changeover_hours", "unplanned_downtime_min"]
        write_csv(folder / "run_totals.csv", cols, ds.level1_totals)
    else:
        write_csv(folder / "production_records.csv", REC_COLS, ds.records)
        write_csv(folder / "events.csv", EV_COLS, ds.events, encoding=ds.events_encoding)
    write_json(folder / "mapping.json", ds.mapping)


# --------------------------------------------------------------------------
# Scenarios.  Each mutator edits a DS in place.
# Index guide  records: 0=PR-5001 1=PR-5002 2=PR-5003 3=PR-5004 4=PR-5005
#              events : 0=EV-1001 1=EV-2001 2=EV-2002
# --------------------------------------------------------------------------

def s01(d):
    d.events.append(dict(d.events[2]))


def s02(d):
    e = dict(d.events[2])
    e["event_id"] = "EV-2003"
    e["recorded_reason"] = "Unplanned stop - feed interruption (re-entered)"
    d.events.append(e)


def s03(d):
    e = dict(d.events[2])
    e["end_time"] = "2026-09-02 15:50"
    e["duration_min"] = "40"
    d.events.append(e)


def s04(d):
    d.records.append(dict(d.records[3]))


def s05(d):
    r = dict(d.records[3])
    r["record_id"] = "PR-5009"
    d.records.append(r)


def s06(d):
    r = dict(d.records[3])
    r["good_output"] = "305"
    r["scrap"] = "45"
    d.records.append(r)


def s07(d):
    d.records[3]["scrap"] = ""


def s08(d):
    for i in (2, 3, 4):
        d.records[i]["material_input"] = "0"
        d.records[i]["good_output"] = "0"
        d.records[i]["scrap"] = "0"


def s09(d):
    d.records[4]["good_output"] = "200"


def s10(d):
    d.records[4]["unit"] = "pcs"


def s11(d):
    d.records[4].update(material_input="0.25", good_output="0.225", scrap="0.025", unit="t")


def s12(d):
    d.events[2]["start_time"] = "2026-09-02 08:15"
    d.events[2]["end_time"] = "2026-09-02 09:00"


def s13(d):
    d.events[1]["duration_min"] = "300"


def s14(d):
    d.events[1]["event_id"] = ""


def s15(d):
    d.events[1]["end_time"] = "2026-09-02 05:00"


def s16(d):
    d.records[3]["record_id"] = ""


def s17(d):
    d.events[1]["end_time"] = "2026-09-02 08:00"
    d.events[1]["duration_min"] = "120"
    e = dict(d.events[1])
    e.update(event_id="EV-2004", start_time="2026-09-02 08:00", end_time="2026-09-02 12:00",
             duration_min="240", recorded_reason="Mold change to MLD-207 (part 2)")
    d.events.append(e)


def s18(d):
    d.events.append(ev("EV-1002", "E-01", "MLD-114", "B", "PMT", "2026-09-01 18:00",
                       "2026-09-01 18:30", "30", "Scheduled lubrication"))
    d.events.append(ev("EV-1003", "E-01", "MLD-114", "B", "XYZ", "2026-09-01 19:00",
                       "2026-09-01 19:20", "20", "Unclassified stop"))


def s19(d):
    d.mapping = copy.deepcopy(MAPPING_LEVEL1)
    d.level1_totals = [
        dict(order_id="E-01", material_input_kg="1000", good_output_kg="950", scrap_kg="50",
             changeover_hours="4", unplanned_downtime_min="0"),
        dict(order_id="E-02", material_input_kg="1000", good_output_kg="900", scrap_kg="100",
             changeover_hours="6", unplanned_downtime_min="45"),
    ]


def s20(d):
    pass  # identical to baseline: used to test the duplicate-file (same hash) rule


def s21(d):
    d.events_encoding = "cp1256"
    d.events[0]["recorded_reason"] = "تغيير قالب إلى MLD-114"
    d.events[1]["recorded_reason"] = "تغيير قالب إلى MLD-207"
    d.events[2]["recorded_reason"] = "توقف غير مخطط - انقطاع التغذية"


def s22(d):
    d.events[0]["recorded_reason"] = "@SUM(1+1)"
    d.events[2]["recorded_reason"] = '=HYPERLINK("http://example.invalid","open")'


def s23(d):
    d.events.pop(1)


def s24(d):
    d.records = [r for r in d.records if r["order_id"] != "E-02"]


SCENARIOS = [
    ("01_duplicate_event_same_id", s01, "Same event row appears twice with the same event_id and identical content.",
     "E-02 downtime YELLOW; duplicate excluded; still 45 min."),
    ("02_suspected_duplicate_event", s02, "A second stop with a different event_id but identical order/type/start/end.",
     "E-02 downtime YELLOW; shows 90 min with alternative 45 min; not auto-excluded."),
    ("03_conflicting_duplicate_event_id", s03, "Same event_id twice with different content (end time differs).",
     "E-02 downtime RED; both rows quarantined; value N/A."),
    ("04_duplicate_record_identical", s04, "Production record PR-5004 repeated identically.",
     "E-02 volume YELLOW; copy excluded; totals unchanged (1000/900/100)."),
    ("05_suspected_duplicate_record", s05, "New record id PR-5009 with the same content as PR-5004.",
     "E-02 volume RED (comparison blocked); totals 1350/1215/135 with alternative 1000/900/100."),
    ("06_conflicting_duplicate_record_id", s06, "PR-5004 appears twice with different good/scrap values.",
     "E-02 volume RED; both rows quarantined; all sums N/A."),
    ("07_missing_scrap_value", s07, "Scrap cell empty on PR-5004.",
     "E-02 volume RED; scrap, scrap rate and balance N/A (never 0, never back-calculated)."),
    ("08_zero_input", s08, "All E-02 records have input 0 (and 0 good, 0 scrap).",
     "E-02 volume RED; rates 'not computable'."),
    ("09_material_imbalance", s09, "PR-5005 good output lowered to 200 so input - good - scrap = 25 kg.",
     "E-02 volume YELLOW; balance 25 kg (2.5% of input); numbers are NOT adjusted."),
    ("10_incompatible_unit", s10, "PR-5005 unit is 'pcs' (not convertible to kg).",
     "E-02 volume RED; sums N/A; comparison refused."),
    ("11_unit_converted_tonnes", s11, "PR-5005 recorded in tonnes (0.25 / 0.225 / 0.025).",
     "E-02 volume GREEN with an info note; totals still 1000/900/100 kg."),
    ("12_possible_overlap", s12, "Unplanned stop 08:15-09:00 falls inside changeover 06:00-12:00.",
     "E-02 changeover + downtime YELLOW; 45 min overlap reported; no causal claim."),
    ("13_duration_mismatch", s13, "EV-2001 duration_min says 300 but start/end give 360.",
     "E-02 changeover YELLOW; value taken from timestamps = 360."),
    ("14_missing_event_id", s14, "EV-2001 has an empty event_id.",
     "E-02 changeover RED; row quarantined; value N/A."),
    ("15_invalid_time_range", s15, "EV-2001 ends before it starts.",
     "E-02 changeover RED; row quarantined; value N/A."),
    ("16_missing_record_id", s16, "PR-5004 has an empty record_id.",
     "E-02 volume RED; row quarantined; sums N/A."),
    ("17_multiple_changeover_events", s17, "E-02 changeover split into two consecutive events (2h + 4h).",
     "E-02 changeover GREEN with info note; total 360 min."),
    ("18_unmapped_and_planned_events", s18, "E-01 gets a planned-maintenance event (PMT) and an event with unknown code XYZ.",
     "E-01 downtime YELLOW (unmapped code); planned event ignored (info)."),
    ("19_totals_only_level1", s19, "Export contains totals only (no records, no timed events).",
     "All groups YELLOW with LEVEL1_TOTALS_ONLY; numbers still 5% / 10% / 240 / 360 / 45."),
    ("20_duplicate_file_upload", s20, "Exact same files uploaded a second time.",
     "Second import detected by content hash (DUPLICATE_FILE); nothing is counted twice."),
    ("21_arabic_cp1256", s21, "events.csv saved as Windows-1256 with Arabic reasons.",
     "Decoded correctly; all metrics identical to baseline; GREEN."),
    ("22_csv_injection_cells", s22, "Reason cells start with '@' and '='.",
     "Metrics unchanged GREEN; FORMULA_LIKE_CELL info; exports must neutralise these cells."),
    ("23_no_changeover_event", s23, "EV-2001 (E-02 changeover) removed from the file.",
     "E-02 changeover YELLOW (NO_CHANGEOVER_EVENT); value N/A; changeover comparison refused."),
    ("24_no_production_records", s24, "All E-02 production records removed.",
     "E-02 volume RED (NO_PRODUCTION_RECORDS); all volume values N/A."),
]

# --------------------------------------------------------------------------
# Najm Packaging: second factory, different dialect (semicolon, decimal comma,
# dd/mm/yyyy, tonnes) and an order id ("E-01") that collides with Ethmar's.
# --------------------------------------------------------------------------

def build_factory_b(folder):
    folder.mkdir(parents=True, exist_ok=True)
    write_csv(folder / "jobs.csv", ["JobNo", "Product", "Press", "Die"], [
        dict(JobNo="E-01", Product="BOTTLE-1L-PET", Press="PRESS-7", Die="DIE-31"),
        dict(JobNo="B-102", Product="BOTTLE-1L-PET", Press="PRESS-7", Die="DIE-44"),
    ], delimiter=";")
    write_csv(folder / "output.csv", ["RowNo", "JobNo", "Crew", "Date", "RawMaterial_t", "Good_t", "Reject_t"], [
        dict(RowNo="1", JobNo="E-01", Crew="1", Date="03/09/2026", RawMaterial_t="1,500", Good_t="1,380", Reject_t="0,120"),
        dict(RowNo="2", JobNo="E-01", Crew="2", Date="03/09/2026", RawMaterial_t="1,000", Good_t="0,920", Reject_t="0,080"),
        dict(RowNo="3", JobNo="B-102", Crew="1", Date="04/09/2026", RawMaterial_t="2,000", Good_t="1,880", Reject_t="0,120"),
    ], delimiter=";")
    write_csv(folder / "stops.csv", ["StopId", "JobNo", "Kind", "From", "To", "Minutes"], [
        dict(StopId="S-01", JobNo="E-01", Kind="MOLD", From="03/09/2026 07:00", To="03/09/2026 10:00", Minutes="180"),
        dict(StopId="S-02", JobNo="B-102", Kind="MOLD", From="04/09/2026 07:00", To="04/09/2026 09:30", Minutes="150"),
        dict(StopId="S-03", JobNo="B-102", Kind="BREAKDOWN", From="04/09/2026 13:00", To="04/09/2026 13:20", Minutes="20"),
    ], delimiter=";")
    write_json(folder / "mapping.json", {
        "schema_version": 1,
        "capability_level": 3,
        "source_name": "Najm Packaging production export",
        "format": {"encoding": "auto", "delimiter": "auto", "decimal_separator": ",",
                   "date_format": "%d/%m/%Y", "datetime_format": "%d/%m/%Y %H:%M"},
        "files": {
            "orders": {"file": "jobs.csv", "columns": {
                "order_id": "JobNo", "product_code": "Product", "machine_id": "Press", "mold_id": "Die"}},
            "records": {"file": "output.csv", "fixed_unit": "t", "columns": {
                "record_id": "RowNo", "order_id": "JobNo", "shift": "Crew", "record_date": "Date",
                "input": "RawMaterial_t", "good": "Good_t", "scrap": "Reject_t"}},
            "events": {"file": "stops.csv", "columns": {
                "event_id": "StopId", "order_id": "JobNo", "event_code": "Kind",
                "start": "From", "end": "To", "duration_min": "Minutes"}},
        },
        "event_code_map": {"MOLD": "CHANGEOVER", "BREAKDOWN": "UNPLANNED_DOWNTIME"},
        "unit_factors_to_kg": MAPPING_A["unit_factors_to_kg"],
        "tolerances": MAPPING_A["tolerances"],
    })


# --------------------------------------------------------------------------

def write_manifest():
    lines = []
    for p in sorted(OUT.rglob("*")):
        if p.is_file():
            h = hashlib.sha256(p.read_bytes()).hexdigest()
            lines.append(f"{h}  {p.relative_to(ROOT).as_posix()}")
    (ROOT / "MANIFEST.sha256").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_catalog():
    md = ["# Scenario catalogue", "",
          "Folder `test-data/ethmar-plastics/<name>/` — upload the whole folder (CSV files + mapping.json).",
          "Expected numbers for every scenario are in `expected/expected_results.json`.", "",
          "| Scenario | What is wrong with the data | What the app must do |", "|---|---|---|",
          "| `00_baseline` | Nothing. This is the clean case from the brief. | E-01: 5% scrap, 240 min changeover. E-02: 10% scrap, 360 min changeover, 45 min stop shown separately. Both GREEN. |"]
    for name, _, what, expect in SCENARIOS:
        md.append(f"| `{name}` | {what} | {expect} |")
    md += ["", "Second factory: `test-data/najm-packaging/00_baseline/` (semicolon CSV, decimal comma, dd/mm/yyyy dates, tonnes, "
           "and a job id `E-01` that collides with Ethmar's `E-01`).", ""]
    (ROOT / "docs" / "SCENARIO_CATALOG.md").write_text("\n".join(md), encoding="utf-8")


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    eth = OUT / "ethmar-plastics"
    write_ds(eth / "00_baseline", DS())
    for name, fn, _, _ in SCENARIOS:
        d = DS()
        fn(d)
        write_ds(eth / name, d)
    build_factory_b(OUT / "najm-packaging" / "00_baseline")
    # sanity: the cp1256 file must NOT be valid UTF-8, otherwise the encoding test is meaningless
    raw = (eth / "21_arabic_cp1256" / "events.csv").read_bytes()
    try:
        raw.decode("utf-8")
        raise SystemExit("cp1256 scenario unexpectedly decodes as UTF-8")
    except UnicodeDecodeError:
        pass
    write_manifest()
    write_catalog()
    print(f"Wrote {len(SCENARIOS) + 1} Ethmar datasets + 1 Najm dataset under {OUT}")


if __name__ == "__main__":
    main()
