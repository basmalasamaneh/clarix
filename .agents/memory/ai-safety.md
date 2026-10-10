---
name: AI safety boundary
description: Phase16 consent, closed-language verification and isolated live-proof constraints
---
AI explanations use a closed set of server-authored factual phrasings. The
provider selects/orders statements; arbitrary paraphrases fail validation.
**Why:** Exact numeric matching alone cannot prove relationships, entities or
non-causality. The user requires whole-answer rejection, one corrective retry,
then the existing code explanation, never unverified model output.
**How to apply:** Extend the independently verified language when adding tasks,
not the validator's tolerance for unsupported prose. No AI text in snapshots/PDF.

Consent is factory-specific, OFF by default, manager-confirmed and audited.
Free-tier summaries can still be confidential; minimisation is not permission
to send confidential factory information under Google's unpaid-service terms.
**Why:** The approved brief requires explicit disclosure and zero calls when off.
**How to apply:** Keep provider calls and consent changes serialized; do not use
SELECT FOR SHARE on factories for Viewer/Analyst requests, because PostgreSQL
also applies that table's manager-only UPDATE policy to locking reads.

Use FakeProvider in isolated verification. Phase 17 permits at most three
synthetic live calls (explanation, issue ranking, Arabic question), never
ordinary development factory data.
**Why:** The user explicitly limits real calls and prohibits test writes to the
ordinary Ethmar/Najm factories.

Typed questions need version-2 consent; old consent authorizes only the old
explanation. Natural-language preflight is deliberately conservative rather
than promising arbitrary conversational understanding.
**Why:** The user requires both useful intent routing and no personal/file
content sent or unvalidated model facts. Unrecognised/ambiguous questions must
fail closed; code chips still work without disclosure of question text.
**How to apply:** Expand verified vocabulary/candidates with tests, not the
model's authority to invent parameters or text.

Use الهدر for scrap and تشغيلة for run in product-facing Arabic. Other scrap
terms and order/batch spellings are accepted input synonyms, not display labels.
**Why:** The user explicitly requires one term across UI, explanations, Help
and PDFs, while broadening question understanding without changing AI safety.
**How to apply:** Preserve consent wording and HTTP “request” terminology; do
not confuse those with production-run labels. Report phrasing limitations honestly.
