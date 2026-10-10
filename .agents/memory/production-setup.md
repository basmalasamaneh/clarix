---
name: Production setup boundary
description: Separate privileged setup from startup; preserve immutable migration baselines
---
Production bootstrap/migrations are explicitly invoked privileged operations,
never HTTP routes or application startup actions. Reject unmanaged existing
schemas instead of trying to reconcile them automatically.

**Why:** The user requires invite-only production onboarding with test seeding
disabled; accidental editor-to-production data copying must not become setup.

**How to apply:** Use a fresh disposable database to prove empty-production
setup. Do not edit an applied initial migration; add a reviewed migration for
future structural changes. Verify live deployment separately from local
production-mode tests.
