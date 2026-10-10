# Clarix calculation and quality engine — Phase 3

Pure, server-side TypeScript. No database, filesystem, network, upload, UI or
Python execution inside `src/`. Tests alone load fixture files from disk.

## Pipeline

`SourceFile[] + Mapping → csvAdapter.read → CanonicalDataset → calculate → EngineResult`

`SourceAdapter<T>` is the replaceable reader interface. A future source adapter
must produce the same canonical dataset; it does not change metric formulas.

```ts
import { calculateFiles, type Mapping } from "@workspace/calculation";

// Files and configuration are supplied by the caller, not read by the engine.
const result = calculateFiles(files, mapping as Mapping, ["E-01", "E-02"]);
```

For another adapter, call `calculate(adapter.read(input, mapping), pair)`.
Calculating does not mutate its inputs. Each invocation has its own quality
state; the decimal constructor has an isolated precision-28 context.

## Numbers and output

- Decimal arithmetic uses `decimal.js`, precision 28, half-even arithmetic,
  matching Python's arithmetic context. Never convert quantities to JS numbers.
- `fmt` emits plain exact-decimal strings, with `null` preserved.
- Only display helpers use ROUND_HALF_UP: `displayNumber`, `displaySigned`,
  `minutesToHoursDisplay`. Rounding does not alter stored calculation results.
- Plant-local timestamps use integer calendar arithmetic without host timezone
  conversion. Durations are calculated using decimals.
- Output includes `capability_level`, `runs`, `comparison`, `file_issues`,
  `formula_like_cells`, and `event_reasons`. Descriptions, `extends`,
  `import_checks`, and export instructions in the golden file are test metadata,
  not calculation output fields.
- `contentHash` is a pure helper over named file bytes, sorted by name with NUL
  separators, matching the reference's directory hash. Scenario 20 proves
  identity with baseline bytes. Stateful duplicate-upload prevention belongs to
  the later import phase, not this engine.

## Source handling

UTF-8/BOM decoding falls back to Windows-1256 only for invalid UTF-8. Delimiter
detection considers comma, semicolon, TAB and pipe outside quoted header cells.
Quoted delimiters, doubled quotes, CRLF, embedded newlines and final records
without a newline are supported. Malformed CSV and duplicate headers fail
explicitly instead of silently losing data.

Every row carries a file and physical line reference. For multiline CSV records,
the reference uses the **first physical line**, per the Phase 4 clarification.
Both `start_line` and `end_line` are retained; the header starts at line 1.

Date mapping supports `%Y`, `%m`, `%d`, `%H`, `%M`, `%S`, `%f`, with literal
separators. Invalid calendar dates, unsupported formats, malformed numbers,
missing mapped headers/files and unknown referenced orders fail explicitly.
Unknown units remain engine quality issues, not parse guesses.

## Approved formula-cell decision

The creator explicitly chose the written spec over the Python reference's
reason-only scan:

1. Check mapped **text** cells, including IDs, product codes, shifts and reasons.
   Exclude number and date/time fields, so legitimate negative numbers are not
   flagged.
2. Inspect the raw cell **before trimming**, including leading TAB and CR.
3. Report `file:line:column` with the source column name from the mapping.
4. Add `FORMULA_LIKE_CELL:info` to file issues once, regardless of cell count.
5. Keep all golden fixtures and expectations unchanged. Synthetic tests cover
   TAB, CR, a middle hyphen, and a negative numeric cell.

This decision is also documented next to `isFormulaLikeText`. Ordinary canonical
text normalization still occurs after detection; no formula is evaluated.

## Verification

From the project root:

```sh
pnpm test:engine
pnpm --filter @workspace/calculation run typecheck
pnpm run typecheck:libs
python3 tools/verify.py
```

The golden harness resolves `extends` by recursively merging objects and
replacing arrays/scalars. It uses each expectation's `comparison.pair`, compares
numeric values as exact decimals and distinguishes `null` from zero. It checks
folder/expectation coverage, the full metric output, scenario 21 event reasons,
scenario 20 content hashes, and the file-integrity manifest. All 15 reference
unit checks are independently implemented in TypeScript.

No UI, database/storage, upload, pages, charts, AI, snapshots, or reconciliation
were added. No production deployment is involved.
