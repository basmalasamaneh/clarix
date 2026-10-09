---
name: Clarix authentication requirements
description: User-approved authentication fallback and test-account safety constraints.
---
Use managed authentication only if genuinely usable test identities can be provisioned for Platform Admin, Factory Manager, Analyst, Viewer and a Najm-only user. Otherwise the user authorizes email/password with Argon2 or bcrypt hashing and secure server sessions.

**Why:** The user requires being able to log in as every role, not merely testing permission guards.

**How to apply:** Explain the chosen option and why. Create seeded test accounts only when SEED_TEST_USERS=true, never in production. No role-switch or authentication bypass. Never claim a role login was tested unless it was actually performed.
