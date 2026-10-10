# Phase 8 delivery status

Implemented, but browser acceptance verification is incomplete.

## Built
- Manager-only Members page with paginated members and pending invitations,
  role changes, reversible deactivation and latest-50 read-only audit.
- Seven-day, hashed, single-use invitations with revoke/reissue and one-time
  copyable links; public invitation acceptance with fixed factory/email/role.
- Same-factory recovery by deactivation and re-invitation.
- Account password change, ordinary logout and logout everywhere.
- Argon2id, CSRF, rate limits, factory authorization, FORCE RLS, append-only
  audit and concurrent-safe last-manager/acceptance checks.
- English/Arabic strings and themed states using existing design tokens.

## Deliberately excluded
Email delivery, password-reset email, SSO, Platform Admin factory access or
delegation, second-factory membership features, charts, export, AI and
reconciliation/snapshots.

## Verification
| Check | Result |
|---|---|
| Full isolated regression suite | 50/50 passed |
| Expanded accounts suite after concurrency/security additions | 13/13 passed |
| Workspace TypeScript | Passed |
| Python fixture verifier | 52/52 passed |
| Protected fixture directories | No edits |
| Workflow restart | Frontend and API running |
| Browser manager login/Members API | Reached in isolated attempts |
| Full invitation/account UI journeys | Not verified |
| New-page responsive screenshot matrix | Not captured |
| Phase 7's 24 flagged drawer bounds cases | Not run; result remains unverified |

The browser driver failed on setup assumptions, then on a click probably blocked
by the first-run tour. Repeated costly attempts were stopped. This is not evidence
of an invitation-page defect. No complete UI test pass or visual-quality claim
is made. I cannot judge visual quality.

## Development data before / after isolated tests
| Table | Before | After |
|---|---:|---:|
| users | 5 | 5 |
| factories | 2 | 2 |
| memberships | 4 | 4 |
| sessions | 59 | 59 |
| invitations | 0 | 0 |
| account_audit | 0 | 0 |
| imports | 4 | 4 |
| raw_rows | 41 | 41 |
| orders | 6 | 6 |
| production_records | 16 | 16 |
| events | 9 | 9 |
| data_issues | 2 | 2 |
| column_mappings | 0 | 0 |
| orders_history | 0 | 0 |
| production_records_history | 0 | 0 |
| events_history | 0 | 0 |

Row fingerprints also match. Isolated targets were removed. Evidence is under
`generated-artifacts/test-isolation/latest.json` and
`generated-artifacts/phase8/`; failed browser manifests are retained honestly.

## Manual steps
1. Log in as `ethmar.manager@clarix.test` with the existing password from
   `SEED_TEST_PASSWORD`. Dismiss the introductory tour if it appears.
2. Open **Members** → **Invite member**, choose an email/role, submit and copy
   the one-time link.
3. Open that link in a private window. Confirm the fixed factory/email/role,
   enter a name and password, and accept.
4. Back on **Members**, use the member's role selector or
   **Deactivate / Reactivate**, then confirm. Use **New link / Revoke** on
   pending invitations. The final active manager is protected.
5. Open the user menu → **Account** for password change or
   **Sign out everywhere**.

These manual actions intentionally change your chosen factory; automated tests
did not perform them against development factories. See `ACCOUNTS.md` for
recovery behavior and publishing safeguards. Set `SEED_TEST_USERS=false`
before publishing; production continues to reject test identities.
