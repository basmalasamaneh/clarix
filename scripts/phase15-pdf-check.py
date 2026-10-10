"""Inspect generated report PDFs: text, embedded fonts and an Arabic page image."""
import json
import re
import sys
import subprocess
from pathlib import Path
import pymupdf as fitz

root = Path(sys.argv[1])
results = []
for path in sorted(root.glob("*.pdf")):
    doc = fitz.open(path)
    text = "\n".join(page.get_text() for page in doc)
    clean = re.sub("[\u200e\u200f\u202a-\u202e\u2066-\u2069]", "", text)
    (path.with_suffix(".txt")).write_text(text)
    # Chromium emits Inter variable glyphs as embedded Type 3 CharProcs.
    # extract_font() has no standalone font file for Type 3; that is not a
    # missing font. Poppler's embedding flag covers both CharProcs and TTF.
    font_rows = [line.split() for line in subprocess.check_output(
        ["pdffonts", str(path)], text=True).splitlines()[2:] if line.strip()]
    fonts = {row[0] for row in font_rows}
    embedded = bool(font_rows) and all(row[-5] == "yes" for row in font_rows)
    expected_path = path.with_suffix(".expected.json")
    expected = json.loads(expected_path.read_text()) if expected_path.exists() else []
    missing = [v for v in expected if v not in clean]
    if "-ar" in path.stem:
        doc[0].get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(str(path.with_suffix(".png")))
    results.append({"file": path.name, "pages": len(doc), "fonts": sorted(fonts),
                    "all_fonts_embedded": embedded, "missing_numeric_strings": missing,
                    "a4": all(abs(p.rect.width - 595.28) < 2 and abs(p.rect.height - 841.89) < 2 for p in doc)})
    doc.close()
(root / "pdf-checks.json").write_text(json.dumps(results, indent=2, ensure_ascii=False))
print(json.dumps(results, indent=2, ensure_ascii=False))
if not results or any(r["missing_numeric_strings"] or not r["all_fonts_embedded"] or not r["a4"] for r in results):
    sys.exit(1)
