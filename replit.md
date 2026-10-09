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

## STANDING RULES (apply to every phase)

1. UI/UX verification (mandatory before reporting any phase that touches the UI): open the app in the browser and check every screen you changed at 360px, 768px and 1280px wide, in light and dark theme, in Arabic (RTL) and English (LTR). Fix before reporting: overflow, truncated text, wrong mirroring of icons/layout, low contrast, missing focus ring, touch targets under 44px, dead buttons. State in the final report exactly which screens and combinations you checked.
2. User-friendly by default: plain wording (no jargon; formulas go in a "?" tooltip), one primary action per screen, designed empty/loading/error/success states, inline form validation with helpful messages, confirmation for destructive actions, no feature visible that does not work yet.
3. All visible text lives in i18n files with both Arabic and English. No hard-coded strings. Latin digits with tabular numbers in both languages.
4. Scalability and flexibility: configuration over code (mappings, event-code maps, units, thresholds are per-factory settings; never per-factory code branches). Put replaceable parts behind interfaces: source adapters, auth provider, notifier (email/manual link), file storage, background jobs, AI provider. Paginate every list. Index factory_id plus common filters. Heavy work goes through a job interface with progress.
5. Security: authorisation on the server for every request, tenant scope derived from the authenticated membership, no secrets in code, logs or the repo.
6. Exact decimals for all quantities. Missing is "Not available", never 0. Metric formulas and issue rules are locked in the spec.
7. Never change test-data/, expected/ or tools/. python3 tools/verify.py must keep passing.
8. Final report format: What I built / What I deliberately did not build / Checks that actually ran (and which ones I could not run) / Decisions I made that are not in the spec.
