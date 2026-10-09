# Clarix — project rules for the agent

Clarix is a read-only, multi-factory web app that turns approved ERP CSV exports into checkable comparisons of
scrap, changeover time and machine stops. **Full specification: `docs/CLARIX_SPEC.md` — read it before every phase.**

## Working rules
1. Build **only** the phase requested in the current prompt. Do not start later waves (AI, advanced charts, reports) early.
2. Metric formulas, issue codes and status rules are **locked** in the spec. Do not change or "improve" them.
3. Code calculates; AI only explains (and only in wave 3). Never compute numbers in the browser or with a language model.
4. Use exact decimal arithmetic for quantities, rates and durations. Never floats.
5. Missing data is "Not available", never 0. Never derive a missing field from other fields.
6. Every number must link to its source rows (file + physical line number).
7. Every query is scoped to the authenticated user's factory on the server.
8. Treat `test-data/` and `expected/expected_results.json` as read-only fixtures. The app's tests must load each
   `test-data/**` folder through the real import pipeline and match the expected values exactly.
9. UI: Arabic (RTL) + English (LTR), light + dark theme, green brand, tokens in spec §12. Not colour alone for meaning.
10. Before finishing a phase: run the tests, list what you built and what you deliberately did not build.
    If anything in the prompt conflicts with the spec, stop and ask.

## Quick check of the fixtures
`python3 tools/verify.py` must print `ALL ... CHECKS PASSED`.
