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

Use FakeProvider in isolated verification; the approved live proof is at most
one synthetic-baseline request, never ordinary development factory data.
**Why:** The user explicitly limits real calls and prohibits test writes to the
ordinary Ethmar/Najm factories.
