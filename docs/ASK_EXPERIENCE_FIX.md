# Ask experience correction

## Scope

No new intents, calculations, provider, validator, consent changes or fixture edits.
Input matching now folds Arabic diacritics/tatweel, alef forms and Arabic/Persian
digits. Common EN/AR synonyms map to existing vocabulary. Known IDs support
E-02, e02 and E 02; an unknown spelling is not turned into a guessed ID.
The original refusal checks remain and also inspect normalized input.

111 documented phrasing cases: 55 English and 56 Arabic, including 10 negative
cases in each language. See generated-artifacts/ask-fix/phrasing-table.md
and phrasing-table.json for the complete question → expected-intent table.

Unsupported answers render one message followed by up to three code-authored
buttons. Metric/status questions without a run ask which run and use actual
active runs, labelled with source names. Comparison suggestions likewise bind
real run pairs. Buttons invoke existing read-only code intents and revalidate
IDs on the server; no new model authority or provider calls are added.
Answer paragraphs and suggestion buttons wrap, preserve whitespace, and have
no line-clamp/ellipsis. Overlong question input is no longer silently sliced;
the existing 500-character submission limit still applies.

## Terminology and exact string inventory

Chosen output terms: **الهدر** and **تشغيلة** (plural **تشغيلات**).
The main metric dictionary, PDF-facing comparison values and most UI already
used them; scattered older glossary/quality/chip strings used الهالك instead.
Accepted synonyms remain in matcher/tests only, never as the output label.
Generic HTTP “request” messages and the locked consent disclosure are unchanged.

Every changed localization/catalogue/chart string, with its old and new text,
is listed in **generated-artifacts/ask-fix/string-changes.txt**. This includes
the new EN/AR “Did you mean…?” label. No PDF layout/calculation changes were
needed: its metric labels already use the chosen terminology.

## Deliberate refusals and limits

- Other factories/users, SQL, rule-changing instructions and emails remain refused.
- Unknown order IDs, unknown words and ambiguous same-ID sources do not execute.
  Code-generated alternatives are suggestions, not an inferred answer.
- Multiple-run metric questions still require a comparison or a selected run.
- Snapshot questions still need a valid owned snapshot ID.
- Minutes/hours are understood as question vocabulary; the answer retains the
  existing metric's unit. This work adds no hour conversion or new calculation.
- This is not unrestricted Arabic dialect recognition or a general chatbot.
  Phrasings outside tested/recognized vocabulary can still be refused safely.

## Verification locations

Final complete invocation: **GREEN** — API/AI 126/126, engine 55/55,
formatting 11/11, PDF 10/10, translation parity 1,585 keys, TypeScript
libraries/API/frontend, Python 52/52. No live provider calls.

Browser PASS: 36 combinations, Ask on Overview/Comparison/Data Quality ×
360/768/1280 × EN/AR × light/dark. Assertions cover one message, no overflow,
unclipped message height and clicking a real-run suggestion to a code answer.
Screenshots show unsupported/missing-run states, not every answer/state.
Other pages with wording-only substitutions were not independently recaptured
in every combination; PDF rendering and translation checks passed.

Development data remained identical before and after both isolated passes:

| Factory | Imports | Orders | Raw rows | Snapshots | AI state | AI usage |
|---|---:|---:|---:|---:|---:|---:|
| Ethmar | 4 → 4 | 6 → 6 | 41 → 41 | 1 → 1 | 1 → 1 | 6 → 6 |
| Najm | 1 → 1 | 2 → 2 | 8 → 8 | 0 → 0 | 0 → 0 | 0 → 0 |

All 25 table fingerprints and role fingerprints matched. Combined SHA-256
of sorted compact JSON table/count/hash maps (before = after):
- Ethmar: `b092b31406ee2d93d85de3491175e12cdf215b72329e03fd5dbca8d47009b361`
- Najm: `e80aefbec940e007d0d48d0bc65d36d6dc211ab458254cc81b7b5b592503694d`

- Full suite: generated-artifacts/ask-fix/full-suite.log
- Suite dev-data proof: generated-artifacts/ask-fix/suite-isolation.json
- Browser: generated-artifacts/ask-fix/browser.log and browser/evidence.json
- Browser dev-data proof: generated-artifacts/ask-fix/browser-isolation.json

## Manual check

1. With existing v2 consent enabled, open Overview, Comparison or Data Quality.
2. Try “waste rate e02” or “شو نسبة الهدر E-٠٢”. If the ID occurs in multiple
   sources, use a labelled suggestion rather than letting Clarix guess.
3. Ask “شو نسبة الهدر” without a run. One message asks which run; choose a button.
4. Ask an unsupported question. One refusal appears with suggested questions.
5. At 360px in Arabic, read the entire response and long source-labelled buttons.
6. Turn AI OFF: free text stays disabled; existing code chips still work.
