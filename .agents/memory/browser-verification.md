---
name: Secret-safe browser verification
description: Testing environment boundary for password-based browser checks.
---
Remote browser automation and workspace shell processes are separate environments; a secret available in the workspace may not be inherited by remote automation.

**Why:** Treating these environments as identical can cause incorrect reports of missing credentials or pressure to disclose secrets.

**How to apply:** Check presence only in the environment that runs the test. Keep credential consumption inside that environment; never copy values into prompts or logs. Distinguish API login evidence from UI verification.

Keep successful browser evidence separate from optional probes or retries.
**Why:** An optional focus probe overwrote a completed responsive matrix's raw
measurement file before failing at login, leaving screenshots and a summary but
not the full original DOM measurements.
**How to apply:** Use per-attempt output directories and promote a successful
manifest atomically. Do not rerun completed journeys to check a small unrelated
detail, and never silently replace original measurements with a reconstructed summary.
