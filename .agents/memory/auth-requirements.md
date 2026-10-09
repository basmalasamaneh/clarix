---
name: Clarix authentication requirements
description: User-approved authentication fallback and test-account safety constraints.
---
Use managed authentication only if genuinely usable test identities can be provisioned for Platform Admin, Factory Manager, Analyst, Viewer and a Najm-only user. Otherwise the user authorizes email/password with Argon2 or bcrypt hashing and secure server sessions.

**Why:** The user requires being able to log in as every role, not merely testing permission guards.

**How to apply:** Explain the chosen option and why. Create seeded test accounts only when SEED_TEST_USERS=true, never in production. No role-switch or authentication bypass. Never claim a role login was tested unless it was actually performed.

Never hard-code test passwords in code or the repository. Use a user-supplied environment secret such as SEED_TEST_PASSWORD for the password fallback; do not output its value. List the exact created test emails, roles and factory memberships, and explain where their password comes from.

**Why:** The user explicitly requires passwords to stay out of the repository and wants usable login details for each role.

**How to apply:** Require the secret when test seeding is enabled, store only password hashes, and identify the user-set secret as the password source without revealing it. Prefer this over terminal-generated passwords because terminal output may be retained.
