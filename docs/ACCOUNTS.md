# Accounts and invitations — Phase 8

## Platform factory management

Platform Admins manage metadata through `/platform`: factory creation, first-manager
invitation recovery while no active manager exists, suspension/reactivation and
limits. They have no tenant production-data access or delegation. Suspension
invalidates users' session versions; reactivation requires a fresh login.
Member, file-size and import-row limits are enforced by the server.
First-manager invitations require a new email: existing accounts cannot join
another factory through this flow. Links appear once and must be shared privately.

Managers edit only their own factory's name, language, balance thresholds and
extra units under Settings. Audited changes affect future imports/checks, never
approved mappings, results or past comparisons. Built-in conversions remain fixed.
Platform and settings audits cannot be updated, deleted or truncated.

Production can optionally bootstrap a Platform Admin using `CLARIX_INITIAL_ROLE`,
`CLARIX_INITIAL_ADMIN_EMAIL` and `CLARIX_INITIAL_INVITE_TOKEN`. Omitting the role
selector preserves initial Factory Manager mode. Both require zero users and
retain the initial invitation as a durable, expiring, single-use latch.
No bootstrap password is configured: the recipient chooses it on the invitation
page. Follow the 15-step `PHASE10_PUBLISH.md` checklist.

This approved phase replaces the original roadmap's reconciliation/snapshots
scope. Authentication remains email/password with Argon2id; there is no public
signup, email delivery, SSO or password-reset email.

## Manager steps
1. Sign in as a Factory Manager and open **Members** in the sidebar.
2. Choose **Invite member**, enter the person's email and choose their role.
3. Copy the link shown once and share it privately. It expires after seven days.
   Closing the box removes the displayed link. Use **New link** on a pending
   invitation if another copy is needed; this invalidates its previous link.
4. The recipient opens the link, checks the factory/role/email, enters their name
   and a password, and joins that factory. Email cannot be changed on acceptance.
5. Change roles or deactivate/reactivate members on Members. Changes require
   confirmation. The last active Factory Manager cannot be demoted/deactivated.
6. **Revoke** stops a pending invitation. Expired invitations can be re-issued.
   Read the latest 50 account audit entries below the lists.

## Account steps
Open the user menu and choose **Account**. Password change requires the current
password and ends other sessions. **Sign out everywhere** ends all sessions,
including the current one. New passwords must be 12–256 characters; spaces and
Arabic text are supported. No composition rule requires Latin letters.

## Recovery without email
A manager can deactivate a member, then invite the same email again. The
recipient uses the new link to set a password; the same user/membership is
reactivated, preserving history. While recovery is pending, direct reactivation
is blocked so the old password cannot become usable again.

Re-inviting an active account or an account belonging to another factory returns
a generic failure. This phase never changes another factory's account or creates
a second-factory membership. A sole manager who loses access cannot self-recover
with this flow; public password reset and Platform Admin delegation remain out
of scope. Keep a second trusted manager if recovery is needed.

## Security and lifecycle decisions
- Invitation tokens use 32 cryptographically random bytes. Only SHA-256 hashes
  are persisted. The manual-link response contains the secret once; it is never
  logged or included in audit entries.
- All writes require the session's CSRF token. Invitation lookup/acceptance,
  login and password changes are rate-limited. Unusable links return a neutral
  message without account-existence information.
- Session versions are checked on authenticated requests. Deactivation and
  password changes invalidate prior versions, including concurrently saved old
  sessions; ordinary role changes take effect through fresh server authorization.
- A restricted accounts-only database role has no production-table grants.
  Factory-scoped accounts tables use ENABLE/FORCE RLS. The public token lookup
  sees only the invitation matching its server-computed hash.
- Factory-row transaction locks serialize membership changes and last-manager
  checks. Invitation acceptance is atomic and single-use.
- Audits contain closed, typed fields rather than request metadata. They are
  append-only, including database blocks on update/delete/truncate. Login counters
  are per membership; unknown-email failures have no user record to attribute.
- Expired pending invitations remain visible until revoked or re-issued. Reissue
  creates a new invitation and preserves the revoked one, rather than deleting it.
- Invitation/account secrets use no-referrer pages and nonpersistent client state.

## Development identities and publishing
See `FOUNDATION.md` for the five seeded test emails. Their password comes only
from the user-set `SEED_TEST_PASSWORD` secret. Seeding requires
`SEED_TEST_USERS=true` and a non-production environment. Set
`SEED_TEST_USERS=false` before publishing. Production rejects test-account login
regardless of this switch. No passwords or invitation secrets belong in reports,
screenshots, logs, files or the repository.
