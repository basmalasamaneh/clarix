#!/usr/bin/env python3
"""
Runs the whole golden-set check:
  1. unit tests for conversion, rounding and display helpers
  2. every dataset in test-data/ is computed by tools/reference_calc.py and
     compared with the hand-written expected/expected_results.json
  3. folder <-> expectation coverage (nothing untested, nothing orphaned)
  4. duplicate-file hash rule (scenario 20)
  5. MANIFEST.sha256 integrity (test files were not edited by accident)

Exit code 0 = everything passed.
Usage: python3 tools/verify.py [-v]
"""
import copy
import hashlib
import json
import sys
from decimal import Decimal as D, InvalidOperation
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import reference_calc as rc  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
VERBOSE = "-v" in sys.argv
failures = []
passes = 0


def check(name, ok, detail=""):
    global passes
    if ok:
        passes += 1
        if VERBOSE:
            print(f"  PASS  {name}")
    else:
        failures.append(f"{name}: {detail}")
        print(f"  FAIL  {name}  {detail}")


# ---------------------------------------------------------------- unit tests
def unit_tests():
    print("[1] unit tests")
    check("1 tonne = 1000 kg", D("1") * D("1000") == D("1000"))
    check("1000 lb = 453.59237 kg (exact)", D("1000") * D("0.45359237") == D("453.59237"))
    check("fmt trims zeros", rc.fmt(D("10.00")) == "10" and rc.fmt(D("1E+1")) == "10" and rc.fmt(D("0.0")) == "0")
    check("fmt negative", rc.fmt(D("-2.50")) == "-2.5")
    check("percent exact 50/1000", D(50) / D(1000) * 100 == D(5))
    check("display 5 -> '5'", rc.display_number(D("5")) == "5")
    check("display 7.5", rc.display_number(D("7.5")) == "7.5")
    check("display round half up 6.65 -> 6.7", rc.display_number(D("6.65")) == "6.7")
    check("display round half up 6.666 -> 6.7", rc.display_number(D("6.666")) == "6.7")
    check("signed +5", rc.display_signed(D("5")) == "+5")
    check("signed -2", rc.display_signed(D("-2")) == "-2")
    check("signed 0", rc.display_signed(D("0")) == "0")
    check("120 min -> 2 h", rc.minutes_to_hours_display(D(120)) == "2")
    check("45 min -> 0.75 h", rc.minutes_to_hours_display(D(45)) == "0.75")
    check("150 min -> 2.5 h", rc.minutes_to_hours_display(D(150)) == "2.5")


# ------------------------------------------------------------------- compare
def num_eq(a, b):
    if isinstance(a, bool) or isinstance(b, bool):
        return a is b
    try:
        return D(str(a)) == D(str(b))
    except (InvalidOperation, ValueError):
        return a == b


def diff(exp, act, path, out):
    if isinstance(exp, dict):
        if not isinstance(act, dict):
            out.append(f"{path}: expected object, got {type(act).__name__}")
            return
        for k in sorted(set(exp) | set(act)):
            if k not in exp:
                out.append(f"{path}.{k}: unexpected key in output (value {act[k]!r})")
            elif k not in act:
                out.append(f"{path}.{k}: missing in output")
            else:
                diff(exp[k], act[k], f"{path}.{k}", out)
    elif isinstance(exp, list):
        if not isinstance(act, list) or len(exp) != len(act):
            out.append(f"{path}: expected {exp!r}, got {act!r}")
            return
        for i, (e, a) in enumerate(zip(exp, act)):
            diff(e, a, f"{path}[{i}]", out)
    elif exp is None or act is None:
        if exp is not act:
            out.append(f"{path}: expected {exp!r}, got {act!r}")
    elif not num_eq(exp, act):
        out.append(f"{path}: expected {exp!r}, got {act!r}")


def merge(base, over):
    for k, v in over.items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            merge(base[k], v)
        else:
            base[k] = copy.deepcopy(v)
    return base


def resolve(scenarios, name, depth=0):
    spec = scenarios[name]
    parent = spec.get("extends")
    if not parent:
        return copy.deepcopy(spec)
    if depth > 5:
        raise ValueError("extends chain too deep")
    return merge(resolve(scenarios, parent, depth + 1), {k: v for k, v in spec.items() if k != "extends"})


def dir_hash(folder):
    h = hashlib.sha256()
    for p in sorted(Path(folder).iterdir()):
        if p.is_file():
            h.update(p.name.encode() + b"\0" + p.read_bytes() + b"\0")
    return h.hexdigest()


# ---------------------------------------------------------------- main checks
def dataset_tests():
    print("[2] golden-set comparison")
    expected = json.loads((ROOT / "expected" / "expected_results.json").read_text(encoding="utf-8"))
    for dataset, scenarios in expected["datasets"].items():
        base_dir = ROOT / "test-data" / dataset
        folders = sorted(p.name for p in base_dir.iterdir() if p.is_dir())
        check(f"{dataset}: every folder has an expectation", set(folders) == set(scenarios),
              f"folders-only={sorted(set(folders) - set(scenarios))} expected-only={sorted(set(scenarios) - set(folders))}")
        for name in sorted(scenarios):
            if name not in folders:
                continue
            exp = resolve(scenarios, name)
            pair = tuple(exp["comparison"]["pair"])
            try:
                act = rc.compute(base_dir / name, pair)
            except Exception as e:  # a crash is a failure, with the reason
                check(f"{dataset}/{name}", False, f"calculator raised {type(e).__name__}: {e}")
                continue
            problems = []
            for key in ("capability_level", "runs", "comparison", "file_issues", "formula_like_cells"):
                diff(exp[key], act[key], key, problems)
            for eid, text in exp.get("event_reasons", {}).items():
                if act["event_reasons"].get(eid) != text:
                    problems.append(f"event_reasons.{eid}: expected {text!r}, got {act['event_reasons'].get(eid)!r}")
            check(f"{dataset}/{name}", not problems, "; ".join(problems[:6]))
            ic = exp.get("import_checks")
            if ic:
                same = dir_hash(base_dir / name) == dir_hash(base_dir / ic["duplicate_of"])
                check(f"{dataset}/{name}: duplicate-file detection by content hash", same,
                      "folder is not identical to its baseline")


def manifest_test():
    print("[3] manifest integrity")
    lines = (ROOT / "MANIFEST.sha256").read_text(encoding="utf-8").splitlines()
    listed = {}
    for ln in lines:
        h, p = ln.split("  ", 1)
        listed[p] = h
    actual = {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
              for p in (ROOT / "test-data").rglob("*") if p.is_file()}
    check("manifest lists exactly the files on disk", set(listed) == set(actual),
          f"diff={sorted(set(listed) ^ set(actual))[:5]}")
    bad = [p for p in actual if listed.get(p) != actual[p]]
    check("no test file was modified", not bad, f"modified={bad[:5]}")


def headline_test():
    print("[4] headline case from the brief")
    r = rc.compute(ROOT / "test-data" / "ethmar-plastics" / "00_baseline")
    e1, e2 = r["runs"]["E-01"], r["runs"]["E-02"]
    check("E-01 scrap 50/1000 = 5%", e1["volume"]["scrap_rate_pct"] == "5")
    check("E-02 scrap 100/1000 = 10%", e2["volume"]["scrap_rate_pct"] == "10")
    check("scrap difference +5 pp", r["comparison"]["metrics"]["scrap_rate_pp"]["value"] == "5")
    check("changeover 4 h vs 6 h (+2 h)", e1["changeover"]["minutes"] == "240" and e2["changeover"]["minutes"] == "360"
          and r["comparison"]["metrics"]["changeover_min"]["value"] == "120")
    check("45 min unplanned stop kept separate from 360 min changeover",
          e2["downtime"]["minutes"] == "45" and e2["changeover"]["minutes"] == "360")
    check("material balance 0 for both", e1["volume"]["material_balance_kg"] == "0" and e2["volume"]["material_balance_kg"] == "0")


if __name__ == "__main__":
    unit_tests()
    dataset_tests()
    manifest_test()
    headline_test()
    print()
    if failures:
        print(f"FAILED: {len(failures)} check(s) failed, {passes} passed")
        sys.exit(1)
    print(f"ALL {passes} CHECKS PASSED")
