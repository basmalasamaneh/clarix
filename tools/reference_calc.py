#!/usr/bin/env python3
"""
Clarix reference calculator.

A small, dependency-free implementation of the locked metric rules and the data
quality rules in docs/CLARIX_SPEC.md. It exists for two reasons:
  1. to prove the golden set (expected/expected_results.json) is internally
     consistent with the written rules, and
  2. to give the app's own calculation engine something to be compared against.

Usage:  python3 tools/reference_calc.py <dataset_folder> [--pair E-01 E-02]
"""
import csv
import io
import json
import sys
from collections import defaultdict
from datetime import datetime
from decimal import Decimal as D, InvalidOperation, ROUND_HALF_UP, getcontext
from pathlib import Path

getcontext().prec = 28
GROUPS = ("volume", "changeover", "downtime")
FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


# ----------------------------------------------------------------- formatting
def fmt(d):
    """Exact decimal -> plain string ('10', '7.5', '-2'). None stays None."""
    if d is None:
        return None
    s = format(D(d).normalize(), "f")
    return "0" if s in ("-0", "") else s


def display_number(d, places=1):
    """Display rounding: ROUND_HALF_UP, trailing zeros hidden."""
    q = D(1).scaleb(-places)
    return fmt(D(d).quantize(q, rounding=ROUND_HALF_UP))


def display_signed(d, places=1):
    s = display_number(d, places)
    return s if s.startswith("-") or s == "0" else "+" + s


def minutes_to_hours_display(minutes):
    return display_number(D(minutes) / D(60), 2)


# -------------------------------------------------------------------- reading
def read_text(path, encoding="auto"):
    raw = Path(path).read_bytes()
    if encoding != "auto":
        return raw.decode(encoding)
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("cp1256")


def read_table(path, fmt_cfg):
    text = read_text(path, fmt_cfg.get("encoding", "auto"))
    delim = fmt_cfg.get("delimiter", "auto")
    if delim == "auto":
        first = text.splitlines()[0] if text else ""
        delim = max([",", ";", "\t", "|"], key=lambda c: first.count(c))
    reader = csv.reader(io.StringIO(text, newline=""), delimiter=delim)
    header = None
    rows = []
    for row in reader:
        if header is None:
            header = [h.strip() for h in row]
            continue
        if not any(c.strip() for c in row):
            continue
        rows.append((reader.line_num, {h: (row[i].strip() if i < len(row) else "") for i, h in enumerate(header)}))
    return header, rows


def num(s, dec_sep):
    if s is None or s == "":
        return None
    t = s.replace(",", ".") if dec_sep == "," else s
    try:
        return D(t)
    except InvalidOperation:
        raise ValueError(f"Invalid number {s!r} (decimal separator {dec_sep!r})")


def when(s, f):
    if s == "":
        return None
    return datetime.strptime(s, f)


def canon(row, colmap, header, fname):
    out = {}
    for field, col in colmap.items():
        if col not in header:
            raise ValueError(f"{fname}: mapped column {col!r} not found in file header {header}")
        out[field] = row[col]
    return out


# ------------------------------------------------------------------ core logic
class Issues:
    def __init__(self):
        self.items = []          # (order|None, code, severity, groups)
        self.file_items = set()  # "CODE:severity"

    def add(self, order, code, sev, groups):
        self.items.append((order, code, sev, tuple(groups)))

    def for_run(self, order):
        return sorted({f"{c}:{s}" for o, c, s, _ in self.items if o == order})

    def status(self, order, group):
        sevs = {s for o, _, s, g in self.items if o == order and group in g}
        if "error" in sevs:
            return "red"
        if "warning" in sevs:
            return "yellow"
        return "green"


def load_cfg(folder):
    cfg = json.loads((Path(folder) / "mapping.json").read_text(encoding="utf-8"))
    cfg["_factors"] = {k.lower(): D(v) for k, v in cfg["unit_factors_to_kg"].items()}
    cfg["_warn"] = D(cfg["tolerances"]["imbalance_warn_pct"])
    cfg["_err"] = D(cfg["tolerances"]["imbalance_error_pct"])
    return cfg


def parse_records(folder, cfg):
    spec = cfg["files"]["records"]
    f = cfg["format"]
    header, rows = read_table(Path(folder) / spec["file"], f)
    out = []
    for line, row in rows:
        c = canon(row, spec["columns"], header, spec["file"])
        unit = spec.get("fixed_unit") or c.get("unit", "")
        out.append(dict(
            line=line, file=spec["file"], rid=c["record_id"], order=c["order_id"],
            shift=c.get("shift", ""), date=c.get("record_date", ""), machine=c.get("machine_id", ""),
            mold=c.get("mold_id", ""), input=num(c["input"], f["decimal_separator"]),
            good=num(c["good"], f["decimal_separator"]), scrap=num(c["scrap"], f["decimal_separator"]),
            unit=unit.strip().lower(), state="ok", suspected=False))
    return out


def parse_events(folder, cfg):
    spec = cfg["files"]["events"]
    f = cfg["format"]
    header, rows = read_table(Path(folder) / spec["file"], f)
    out = []
    for line, row in rows:
        c = canon(row, spec["columns"], header, spec["file"])
        out.append(dict(
            line=line, file=spec["file"], eid=c["event_id"], order=c["order_id"], code=c["event_code"],
            start=when(c["start"], f["datetime_format"]), end=when(c["end"], f["datetime_format"]),
            dur=num(c.get("duration_min", ""), f["decimal_separator"]), reason=c.get("reason", ""),
            machine=c.get("machine_id", ""), mold=c.get("mold_id", ""), shift=c.get("shift", ""),
            reason_col=spec["columns"].get("reason"), state="ok", suspected=False, type=None))
    return out


def ref(file, line):
    return f"{file}:{line}"


# ----- volume ---------------------------------------------------------------
def process_records(rows, cfg, issues, file_issues):
    # 1. required fields
    for r in rows:
        if not r["rid"] or not r["order"]:
            r["state"] = "quarantined"
            if r["order"]:
                issues.add(r["order"], "MISSING_REQUIRED_FIELD", "error", ["volume"])
            else:
                file_issues.add("MISSING_REQUIRED_FIELD:error")
    # 2. duplicate record ids
    by_id = defaultdict(list)
    for r in rows:
        if r["state"] == "ok":
            by_id[r["rid"]].append(r)
    content = lambda r: (r["order"], r["shift"], r["date"], r["machine"], r["mold"],
                         r["input"], r["good"], r["scrap"], r["unit"])
    for rid, grp in by_id.items():
        if len(grp) < 2:
            continue
        if all(content(g) == content(grp[0]) for g in grp):
            for g in grp[1:]:
                g["state"] = "excluded"
                issues.add(g["order"], "DUPLICATE_RECORD_ID_IDENTICAL", "warning", ["volume"])
        else:
            for g in grp:
                g["state"] = "quarantined"
                issues.add(g["order"], "DUPLICATE_RECORD_ID_CONFLICT", "error", ["volume"])
    # 3. suspected duplicates (different id, same content)
    seen = {}
    for r in sorted((r for r in rows if r["state"] == "ok"), key=lambda r: r["line"]):
        key = (r["order"], r["shift"], r["date"], r["input"], r["good"], r["scrap"], r["unit"])
        if key in seen:
            r["suspected"] = True
            issues.add(r["order"], "SUSPECTED_DUPLICATE_RECORD", "error", ["volume"])
        else:
            seen[key] = r


def volume_values(rows, cfg, blocked_by_quarantine):
    """Pure computation over the given included rows. Returns (values, flags)."""
    flags = {"incompatible": False, "converted": False, "missing": False}
    if not rows or blocked_by_quarantine:
        return dict(input=None, good=None, scrap=None), flags
    factors = cfg["_factors"]
    for r in rows:
        if r["unit"] not in factors:
            flags["incompatible"] = True
        elif factors[r["unit"]] != 1:
            flags["converted"] = True
    sums = {}
    for fld in ("input", "good", "scrap"):
        vals = [r[fld] for r in rows]
        if any(v is None for v in vals):
            flags["missing"] = True
            sums[fld] = None
        elif flags["incompatible"]:
            sums[fld] = None
        else:
            sums[fld] = sum((v * factors[r["unit"]] for v, r in zip(vals, rows)), D(0))
    return sums, flags


def analyze_volume(order, rows, cfg, issues):
    mine = [r for r in rows if r["order"] == order]
    included = sorted((r for r in mine if r["state"] == "ok"), key=lambda r: r["line"])
    quarantined = [r for r in mine if r["state"] == "quarantined"]
    excluded = [r for r in mine if r["state"] == "excluded"]
    sums, flags = volume_values(included, cfg, bool(quarantined))
    if not mine:
        issues.add(order, "NO_PRODUCTION_RECORDS", "error", ["volume"])
    if flags["incompatible"]:
        issues.add(order, "INCOMPATIBLE_UNIT", "error", ["volume"])
    if flags["missing"]:
        issues.add(order, "MISSING_VALUE", "error", ["volume"])
    if flags["converted"] and not flags["incompatible"]:
        issues.add(order, "UNIT_CONVERTED", "info", ["volume"])
    inp, good, scrap = sums["input"], sums["good"], sums["scrap"]
    if inp is not None and inp == 0:
        issues.add(order, "ZERO_INPUT", "error", ["volume"])
    scrap_rate = scrap / inp * 100 if (inp is not None and inp > 0 and scrap is not None) else None
    good_rate = good / inp * 100 if (inp is not None and inp > 0 and good is not None) else None
    balance = inp - good - scrap if None not in (inp, good, scrap) else None
    if balance is not None:
        if inp > 0:
            pct = abs(balance) / inp * 100
            if pct > cfg["_err"]:
                issues.add(order, "MATERIAL_IMBALANCE", "error", ["volume"])
            elif pct > cfg["_warn"]:
                issues.add(order, "MATERIAL_IMBALANCE", "warning", ["volume"])
        elif balance != 0:
            issues.add(order, "MATERIAL_IMBALANCE", "error", ["volume"])
    alternatives = {}
    suspected = [r for r in included if r["suspected"]]
    if suspected:
        alt, _ = volume_values([r for r in included if not r["suspected"]], cfg, False)
        alternatives["exclude_suspected"] = {
            "input_kg": fmt(alt["input"]), "good_kg": fmt(alt["good"]), "scrap_kg": fmt(alt["scrap"]),
            "scrap_rate_pct": fmt(alt["scrap"] / alt["input"] * 100) if alt["input"] else None}
    return dict(
        input_kg=fmt(inp), good_kg=fmt(good), scrap_kg=fmt(scrap),
        scrap_rate_pct=fmt(scrap_rate), good_rate_pct=fmt(good_rate), material_balance_kg=fmt(balance),
        record_ids=[r["rid"] for r in included],
        source_lines=[ref(r["file"], r["line"]) for r in included],
        excluded_source_lines=[ref(r["file"], r["line"]) for r in sorted(excluded, key=lambda r: r["line"])],
        quarantined_source_lines=[ref(r["file"], r["line"]) for r in sorted(quarantined, key=lambda r: r["line"])],
        alternatives=alternatives)


# ----- events ---------------------------------------------------------------
def minutes_between(a, b):
    return D(int((b - a).total_seconds())) / D(60)


def process_events(rows, cfg, issues, file_issues):
    cmap = cfg["event_code_map"]
    typ = lambda r: cmap.get(r["code"])
    grp_of = lambda t: "changeover" if t == "CHANGEOVER" else "downtime"
    for r in rows:
        r["type"] = typ(r)
    # 1. required fields
    for r in rows:
        if not r["eid"] or not r["order"] or r["start"] is None or r["end"] is None:
            r["state"] = "quarantined"
            if r["order"]:
                issues.add(r["order"], "MISSING_REQUIRED_FIELD", "error", [grp_of(r["type"])])
            else:
                file_issues.add("MISSING_REQUIRED_FIELD:error")
    # 2. time range
    for r in rows:
        if r["state"] == "ok" and r["end"] <= r["start"]:
            r["state"] = "quarantined"
            issues.add(r["order"], "INVALID_TIME_RANGE", "error", [grp_of(r["type"])])
    # 3. duplicate event ids
    by_id = defaultdict(list)
    for r in rows:
        if r["state"] == "ok":
            by_id[r["eid"]].append(r)
    content = lambda r: (r["order"], r["code"], r["start"], r["end"], r["dur"], r["reason"],
                         r["machine"], r["mold"], r["shift"])
    for eid, grp in by_id.items():
        if len(grp) < 2:
            continue
        if all(content(g) == content(grp[0]) for g in grp):
            for g in grp[1:]:
                g["state"] = "excluded"
                issues.add(g["order"], "DUPLICATE_EVENT_ID_IDENTICAL", "warning", [grp_of(g["type"])])
        else:
            for g in grp:
                g["state"] = "quarantined"
                issues.add(g["order"], "DUPLICATE_EVENT_ID_CONFLICT", "error", [grp_of(g["type"])])
    # 4. code mapping
    for r in rows:
        if r["state"] != "ok":
            continue
        if r["type"] is None:
            r["state"] = "unmapped"
            issues.add(r["order"], "UNMAPPED_EVENT_CODE", "warning", ["downtime"])
        elif r["type"] == "PLANNED_STOP":
            r["state"] = "planned"
            issues.add(r["order"], "PLANNED_EVENT_IGNORED", "info", ["downtime"])
    live = [r for r in rows if r["state"] == "ok"]
    # 5. duration mismatch
    for r in live:
        if r["dur"] is not None and r["dur"] != minutes_between(r["start"], r["end"]):
            issues.add(r["order"], "DURATION_MISMATCH", "warning", [grp_of(r["type"])])
    # 6. suspected duplicates (different id, same order/type/start/end)
    seen = {}
    for r in sorted(live, key=lambda r: r["line"]):
        key = (r["order"], r["type"], r["start"], r["end"])
        if key in seen:
            r["suspected"] = True
            issues.add(r["order"], "SUSPECTED_DUPLICATE_EVENT", "warning", [grp_of(r["type"])])
        else:
            seen[key] = r


def analyze_events(order, rows, issues):
    mine = [r for r in rows if r["order"] == order]
    live = [r for r in mine if r["state"] == "ok"]
    chg = sorted((r for r in live if r["type"] == "CHANGEOVER"), key=lambda r: r["line"])
    udt = sorted((r for r in live if r["type"] == "UNPLANNED_DOWNTIME"), key=lambda r: r["line"])
    q_chg = [r for r in mine if r["state"] == "quarantined" and r["type"] == "CHANGEOVER"]
    q_udt = [r for r in mine if r["state"] == "quarantined" and r["type"] != "CHANGEOVER"]
    ex_chg = [r for r in mine if r["state"] == "excluded" and r["type"] == "CHANGEOVER"]
    ex_udt = [r for r in mine if r["state"] in ("excluded", "unmapped") and r["type"] != "CHANGEOVER"]
    dmin = lambda r: minutes_between(r["start"], r["end"])
    lines = lambda rs: [ref(r["file"], r["line"]) for r in sorted(rs, key=lambda r: r["line"])]

    # overlap between unplanned stops and changeovers of the same order
    overlaps = []
    for u in udt:
        for c in chg:
            ov = minutes_between(max(u["start"], c["start"]), min(u["end"], c["end"])) \
                if min(u["end"], c["end"]) > max(u["start"], c["start"]) else D(0)
            if ov > 0:
                overlaps.append(dict(stop_event_id=u["eid"], changeover_event_id=c["eid"], overlap_min=fmt(ov)))
                issues.add(order, "POSSIBLE_OVERLAP", "warning", ["changeover", "downtime"])

    # changeover group
    if q_chg:
        co_min = None
    elif chg:
        co_min = sum((dmin(r) for r in chg), D(0))
    else:
        co_min = None
        issues.add(order, "NO_CHANGEOVER_EVENT", "warning", ["changeover"])
    if len(chg) > 1:
        issues.add(order, "MULTIPLE_CHANGEOVER_EVENTS", "info", ["changeover"])
    co_alt = {}
    if any(r["suspected"] for r in chg) and co_min is not None:
        co_alt["minutes_if_suspected_excluded"] = fmt(sum((dmin(r) for r in chg if not r["suspected"]), D(0)))

    # downtime group
    dt_min = None if q_udt else sum((dmin(r) for r in udt), D(0))
    dt_alt = {}
    if any(r["suspected"] for r in udt) and dt_min is not None:
        dt_alt["minutes_if_suspected_excluded"] = fmt(sum((dmin(r) for r in udt if not r["suspected"]), D(0)))

    changeover = dict(minutes=fmt(co_min), event_ids=[r["eid"] for r in chg], source_lines=lines(chg),
                      excluded_source_lines=lines(ex_chg), quarantined_source_lines=lines(q_chg),
                      alternatives=co_alt)
    downtime = dict(minutes=fmt(dt_min), event_count=len(udt), event_ids=[r["eid"] for r in udt],
                    source_lines=lines(udt), excluded_source_lines=lines(ex_udt),
                    quarantined_source_lines=lines(q_udt), alternatives=dt_alt)
    return changeover, downtime, overlaps


# ----- level 1 (totals only) ------------------------------------------------
def analyze_level1(folder, cfg, orders, issues):
    spec = cfg["files"]["totals"]
    f = cfg["format"]
    header, rows = read_table(Path(folder) / spec["file"], f)
    runs = {}
    for line, row in rows:
        c = canon(row, spec["columns"], header, spec["file"])
        o = c["order_id"]
        r = dict(line=line, file=spec["file"], rid="", order=o, shift="", date="", machine="", mold="",
                 input=num(c["input"], f["decimal_separator"]), good=num(c["good"], f["decimal_separator"]),
                 scrap=num(c["scrap"], f["decimal_separator"]), unit="kg", state="ok", suspected=False)
        hours = num(c["changeover_hours"], f["decimal_separator"])
        dmin = num(c["downtime_min"], f["decimal_separator"])
        runs[o] = (r, hours, dmin, line)
    return runs


# ------------------------------------------------------------------- top level
def compute(folder, pair=None):
    folder = Path(folder)
    cfg = load_cfg(folder)
    level = cfg["capability_level"]
    f = cfg["format"]
    _, order_rows = read_table(folder / cfg["files"]["orders"]["file"], f)
    ocol = cfg["files"]["orders"]["columns"]["order_id"]
    orders = [r[ocol] for _, r in order_rows]
    issues = Issues()
    file_issues = issues.file_items
    runs = {}
    formula_cells = []
    reasons = {}

    if level == 1:
        l1 = analyze_level1(folder, cfg, orders, issues)
        for o in orders:
            r, hours, dmin, line = l1[o]
            sums, flags = volume_values([r], cfg, False)
            inp, good, scrap = sums["input"], sums["good"], sums["scrap"]
            balance = inp - good - scrap if None not in (inp, good, scrap) else None
            src = [ref(r["file"], line)]
            blank = dict(excluded_source_lines=[], quarantined_source_lines=[], alternatives={})
            issues.add(o, "LEVEL1_TOTALS_ONLY", "warning", GROUPS)
            runs[o] = dict(
                volume=dict(input_kg=fmt(inp), good_kg=fmt(good), scrap_kg=fmt(scrap),
                            scrap_rate_pct=fmt(scrap / inp * 100) if inp else None,
                            good_rate_pct=fmt(good / inp * 100) if inp else None,
                            material_balance_kg=fmt(balance), record_ids=[], source_lines=src, **blank),
                changeover=dict(minutes=fmt(hours * 60), event_ids=[], source_lines=src, **blank),
                downtime=dict(minutes=fmt(dmin), event_count=None, event_ids=[], source_lines=src, **blank),
                overlaps=[])
    else:
        recs = parse_records(folder, cfg)
        evs = parse_events(folder, cfg)
        process_records(recs, cfg, issues, file_issues)
        process_events(evs, cfg, issues, file_issues)
        for e in evs:
            if e["eid"]:
                reasons[e["eid"]] = e["reason"]
            if e["reason"].startswith(FORMULA_PREFIXES):
                formula_cells.append(ref(e["file"], e["line"]) + f":{e['reason_col']}")
        if formula_cells:
            file_issues.add("FORMULA_LIKE_CELL:info")
        for o in orders:
            vol = analyze_volume(o, recs, cfg, issues)
            co, dt, ov = analyze_events(o, evs, issues)
            runs[o] = dict(volume=vol, changeover=co, downtime=dt, overlaps=ov)

    for o in orders:
        for g in GROUPS:
            runs[o][g]["status"] = issues.status(o, g)
        runs[o]["issues"] = issues.for_run(o)
        order_rank = {"green": 0, "yellow": 1, "red": 2}
        runs[o]["overall"] = max((runs[o][g]["status"] for g in GROUPS), key=lambda s: order_rank[s])

    a, b = pair if pair else (orders[0], orders[1])
    metrics = {}
    for name, grp, key in (("scrap_rate_pp", "volume", "scrap_rate_pct"), ("good_rate_pp", "volume", "good_rate_pct"),
                           ("changeover_min", "changeover", "minutes"), ("downtime_min", "downtime", "minutes")):
        va, vb = runs[a][grp][key], runs[b][grp][key]
        blocked = "red" in (runs[a][grp]["status"], runs[b][grp]["status"])
        if va is None or vb is None or blocked:
            metrics[name] = dict(value=None, comparable=False)
        else:
            metrics[name] = dict(value=fmt(D(vb) - D(va)), comparable=True)
    return dict(
        capability_level=level,
        runs=runs,
        comparison=dict(pair=[a, b], metrics=metrics),
        file_issues=sorted(file_issues),
        formula_like_cells=sorted(formula_cells),
        event_reasons=reasons)


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        raise SystemExit(__doc__)
    pair = None
    if "--pair" in args:
        i = args.index("--pair")
        pair = (args[i + 1], args[i + 2])
    print(json.dumps(compute(args[0], pair), indent=2, ensure_ascii=False))
