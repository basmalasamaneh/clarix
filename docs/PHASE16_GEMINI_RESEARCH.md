# Gemini official-document research — Phase 16

Checked 2026-10-11. These are documentation findings, not a live API test.

- Pricing: https://ai.google.dev/gemini-api/docs/pricing
  The fetched page lists free input/output access for Gemini 3.8 Flash
  (`gemini-3.8-flash`), among other models. Model selection must remain
  configurable through GEMINI_MODEL; access and quotas depend on the project.
- Limits: https://ai.google.dev/gemini-api/docs/rate-limits
  Requests/minute, input tokens/minute and requests/day apply per project,
  not per API key. Daily request quotas reset at midnight Pacific time.
  Actual model/project limits are shown in Google AI Studio and are not
  guaranteed: https://aistudio.google.com/rate-limit
  Clarix's own configurable safety caps are not Google's quota values.
- Terms: https://ai.google.dev/gemini-api/terms
  The fetched terms are effective March 23, 2026. Under unpaid-service terms,
  Google uses submitted content and generated responses to improve products
  and machine-learning technologies; human reviewers may process both.
  Google explicitly says not to submit sensitive, confidential or personal
  information to unpaid services. Minimising a factory summary does not
  automatically make confidential business data safe for the free tier.
  Paid-service terms say prompts/responses are not used for product
  improvement, while allowing limited safety/abuse-related retention.
  Regional exceptions apply to EEA/Switzerland/UK users; the terms also
  require paid services for API clients made available to users there.

Use the direct Gemini API requested by the user, not an implicitly substituted
billing proxy. Integration search returned no matching Gemini connection.
GEMINI_API_KEY and GEMINI_MODEL were absent when checked. No inference request
has been made and no factory data was submitted during this research.
