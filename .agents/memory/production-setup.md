---
name: Production setup boundary
description: Separate privileged setup from startup; preserve immutable migration baselines
---
Production onboarding is an explicitly invoked privileged operation, never an
HTTP route or application startup action. For Replit-managed databases, schema
migrations belong to Publish, not the custom empty-database rehearsal script.

**Why:** The user requires invite-only production onboarding with test seeding
disabled; accidental editor-to-production data copying must not become setup.

**How to apply:** Use a fresh disposable database for local production-mode
proof only. The previous operations guide incorrectly treated that as a verified
managed-platform setup procedure; its correction takes precedence. Verify
migrated roles/policies and production password reset separately. Never assume
the ordinary editor Shell targets production.
