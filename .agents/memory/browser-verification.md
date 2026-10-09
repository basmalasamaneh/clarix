---
name: Secret-safe browser verification
description: Testing environment boundary for password-based browser checks.
---
Remote browser automation and workspace shell processes are separate environments; a secret available in the workspace may not be inherited by remote automation.

**Why:** Treating these environments as identical can cause incorrect reports of missing credentials or pressure to disclose secrets.

**How to apply:** Check presence only in the environment that runs the test. Keep credential consumption inside that environment; never copy values into prompts or logs. Distinguish API login evidence from UI verification.
