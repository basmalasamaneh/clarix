# Explicit source handling

## What I built

- Upload now offers an existing factory source or a new named source, with the
  requested plain-language explanation. Uploaded headers are compared with
  validated approved mappings; the latest matching active source is selected
  by default only while there is no choice. Existing choices are preserved.
- Step 3 shows the selected source, its replacement order list, and paginated
  notices for equal order IDs in other sources. Settings differences identify
  actual fields and both values.
- Effective mapping comparison ignores key ordering, empty optional values,
  unused event-code/unit entries, numeric spelling and equivalent detected
  encoding/delimiter settings. Meaningful mapped-field changes remain visible.
- Duplicate detection is source-scoped. Identical effective duplicates in the
  same source remain blocked; different effective mappings can replace its
  orders after confirmation. The same files in a different source create
  separate orders.
- Runs list and comparison selection use internal run UUIDs and display the
  source alongside the order ID. A pair always identifies both sources.
- Factory Managers can archive/restore a source. Existing factory settings store
  archive state and actor/time audit events: no new tables or columns. Server
  authorization and a manager-only database update policy protect the action.
  Archived sources disappear from active run lists, pair lookup and counts;
  stored imports, current rows and history remain intact. New uploads and
  approvals into archived sources are rejected.

### The earlier baseline incident

The tested import used source `1`, whereas the existing E-01/E-02 were in
`API verification 87ae3e4a-b5e2-4aeb-8503-d0f342b06973`.
The zero replacement count came from correctly source-scoped lookup, but the
old free-text source input did not explain that it created a separate namespace.

The stored mappings had identical columns, formats, units and tolerances.
The earlier import additionally mapped `PMT` to `PLANNED_STOP`; the new one
mapped only CHG and UDT. Baseline contains no PMT event, so this unused setting
should not have classified it as a different effective mapping.

The requested earlier API verification source above is now **archived** using
the normal manager endpoint. It was not deleted or merged.

### Exact source inventory

See `generated-artifacts/sources/source-inventory.csv`, also supplied as a
download. Snapshot: **263 sources**, **261 active**, **2 archived**.
**168 active sources have current orders**; other active sources have no current
approved orders. Many are generated verification sources.

There is no global “current source.” Every active source can have its own current
orders. The inventory lists each exact name, status, current visible order count,
stored order count and last approval time. No other pre-existing sources were
bulk-archived. Source `1` is a rejected import namespace with no current orders.

## What I deliberately did not build

No factory-wide order merging, data-model/table changes, fixture edits,
calculation-rule changes, full metric comparison, charts, AI or publication.
The comparison addition identifies a pair; it does not pretend to be the future
metric-comparison feature.

## Checks that actually ran (and which ones I could not run)

- **13 import API/unit tests passed**, including different-source isolation,
  same-source replacement preview and approval after a meaningful mapping change,
  effective duplicate detection, exact settings differences, cross-source notes,
  manager-only archive/restore, archived counts/pair exclusion, run-ID
  disambiguation and cross-factory denial.
- **11 canonical database/RLS tests**, **55 engine tests**, **52 Python checks**
  passed. Workspace TypeScript checks passed. Protected fixtures and engine
  files have no diff.
- Real manager browser login using the environment secret without printing it:
  existing/new-source choice preservation, recommended default, archive/restore
  of a synthetic source, source-qualified runs and distinct UUID comparison pair.
- Upload, mapping, source settings, runs and comparison were captured at
  **360 / 768 / 1280 px × English / Arabic × light / dark**: 60 captures.
  The initial matrix’s files named `step3-*` actually show mapping; they are NOT
  counted as check-page verification.
- A separate focused check verified the actual **Check & approve page and
  replacement dialog in all 12 combinations**: 24 additional captures.
  It asserted E-01/E-02 replacement, the exact Machine-column difference, visible
  enabled Approve, required replacement consent, and bounded dialog/page layout.
  This draft was rejected after testing; no existing orders were overwritten
  by that focused browser check.
- Screenshots: `generated-artifacts/source-matrix/` and
  `generated-artifacts/source-check/`. Representative captures visually reviewed;
  automated page-overflow and focus checks also ran.
- No production test, load test or formal screen-reader audit was performed.

## Decisions I made that are not in the spec

- An approved, persisted mapping can serve as the source-recommendation template
  even when the user has not saved a separately named template.
- Archive metadata lives in existing factory settings to honor the instruction
  not to change the data model. Archive/restore is serialized with approval.
- Display source names on every run, not only ambiguous IDs. This also prevents
  ambiguity when another source is added later.
