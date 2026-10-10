# Phase 18 — account recovery and stronger sign-in

## Built
- Manager-issued, hashed, 24-hour password-reset links. Reissue/revoke and single-use completion; no self-reset, admin-issued reset or cross-factory credential takeover.
- Reset completion invalidates existing sessions and retains MFA.
- Separate one-use manager recovery key. It resets the password, not the authenticator. A lost phone requires a saved MFA recovery code.
- Authenticator enrollment, locally drawn QR/manual key, confirmation, then ten single-use recovery codes. Enrollment becomes active only after saved-code acknowledgement.
- AES-256-GCM encryption with account-bound associated data; replay-protected TOTP and hashed recovery codes.
- Platform Admin MFA policy defaults on in production, off in development. Unenrolled administrators get guidance, not enforced challenges, as approved. Temporarily turning policy off preserves enrollment.
- Factory-wide MFA policy with seven-day grace and server-side data-access enforcement after grace.
- Sessions, last sign-in, individual/other-device revocation, recent confirmation, idle/absolute expiration.
- Persistent account/IP attempt limits; generic failures; common-password rejection; no-op notification interface.
- English/Arabic screens and Help; no external messaging.

## Manual checks
1. Sign in as Factory manager. Open **Members**, find another active member, choose **Reset link**, confirm, and copy the link once.
2. Open the link in a private browser. Choose a new password. Sign in again; enrolled accounts still need their authenticator or an unused recovery code.
3. **Cancel reset link** on the member row also works after reloading Members. Reissuing invalidates the previous link.
4. Open **My account → Two-factor sign-in → Set up**. Confirm your password, scan the QR locally with an authenticator, then enter its code.
5. Save the ten recovery codes privately and tick the saved confirmation before activating. Neither the setup key nor codes can be retrieved later.
6. Sign out and in. Enter a fresh authenticator code or one unused recovery code. A code already accepted in its time window is rejected.
7. In **My account**, inspect sessions and sign out another device. Sensitive operations may request your password and an authenticator/recovery code again.
8. As manager, create and privately save your separate **Recovery key**. The public **Forgot your password?** page accepts your email and that key.
9. Invite a second manager. Losing the password, account recovery key, authenticator and every MFA recovery code has no administrator override.
10. In Factory Settings, enable **Two-factor for everyone** only after enrolling yourself and informing members about the seven-day grace.

## Configuration — names, not values
Required secret: `CLARIX_TOTP_ENCRYPTION_KEY` (64 hexadecimal characters from a cryptographically secure generator). Never reuse `SESSION_SECRET`.

Optional rotation secret: `CLARIX_TOTP_PREVIOUS_ENCRYPTION_KEY`.
Configuration: `CLARIX_REQUIRE_ADMIN_MFA`, `CLARIX_SESSION_IDLE_SECONDS`, `CLARIX_SESSION_ABSOLUTE_SECONDS`.
Defaults: idle 1,800 seconds; absolute 28,800 seconds. Accepted timeout range is 60–2,592,000 seconds.

Rotation: retain the old key privately as the previous-key secret; install a fresh primary key; restart. Successful authenticator verification re-encrypts that account with the primary key. Recovery-code sign-in does not migrate its authenticator secret. Keep the previous key until all enrolled secrets have migrated or been re-enrolled and pending enrollments have expired. Do not delete it merely because deployment succeeds; doing so can strand accounts.

Production admin policy off is an emergency reduction in sign-in protection, not MFA removal or a tenant-access grant. Re-enable it promptly. Disabling or replacing enrollment still requires the existing factor.

## Intentionally absent
Email/SMS delivery, magic links, external identity providers, passkeys, trusted devices, admin takeover, calculation/data-engine changes, and publishing.

## Evidence
See `generated-artifacts/phase18/full-suite.log`, `suite-isolation.json`, and the browser evidence in the same directory. These are generated verification artifacts, not application data. The delivery report distinguishes completed verification from remaining checks.

### Verified result
One complete isolated run passed: 135 API/AI tests, 55 engine tests, 11
formatting tests, 10 PDF tests, 1,750-key translation parity, all three
TypeScript checks and all 52 Python verifier checks.

The first full attempt exposed a reset-test observer mismatch: the new global
security tables were filtered by FORCE RLS on one side of its comparison. That
early reset-test failure also left synthetic imports for a later pagination
assertion. The observer setup was corrected; the subsequent complete run passed.

The browser pass completed manager-issued reset, sign-in with the changed
password, authenticator enrollment, saved-code acknowledgement, recovery-code
sign-in and session revocation. It stopped because the driver then reused the
analyst's old password. That driver mistake is corrected but not rerun.

**Important evidence correction:** the image named `sessions-360-en-light.png`
was actually captured at 1280px, as recorded in its JSON metadata. It is not
mobile evidence. The missing viewport change was added to the driver but not
rerun. Only English/light desktop browser coverage is established. The
360/768px, Arabic/dark matrix and browser Analyst/Viewer denial checks remain
unverified. Backend role denials and TOTP replay denial passed in the API suite.
Screenshots and mechanical checks do not establish visual quality.

Separate fresh-production-mode proofs also passed: nine checks for manager
bootstrap and nine for optional Platform Admin bootstrap. They used disposable
PostgreSQL clusters and the real production launcher, not a published site.
Both rejected all five seeded email identities with otherwise valid credentials,
proved bootstrap idempotence and rollback, checked runtime privilege separation,
and found no token/link/password in captured logs. Evidence:
`production-manager.json` and `production-admin.json` in the phase evidence
directory. Development fingerprints were unchanged in both.
The production launcher also passed the new encryption-key and security-setting
presence checks; these names are explicitly allowed through its runtime filter.

### Development-data preservation
Both suite and browser isolation records report `unchanged: true`, using an
unfiltered observer. No fixtures, expected results, tools or calculation rules
were changed.

| Factory | Imports before → after | Orders | Raw rows | Snapshots | AI usage |
|---|---:|---:|---:|---:|---:|
| Ethmar | 4 → 4 | 6 → 6 | 41 → 41 | 1 → 1 | 9 → 9 |
| Najm | 1 → 1 | 2 → 2 | 8 → 8 | 0 → 0 | 0 → 0 |

SHA-256 of the suite's complete per-factory fingerprint record, identical
before/after (includes global auth tables as documented by the observer):
- Ethmar: `196c65b2f7fafbb3f5672cbb504790eecc1ca861179310ff2dff11ef46643bbb`
- Najm: `3e839de21e84a7798370dfed490bcc7ebe8db77458627e9fd327ff11da53ac8f`

### Recovery trade-offs and residual risks
An administrator override was rejected because it could enable silent tenant
takeover. A delayed notification-based recovery was not selected because no
delivery service exists and it would add another recovery mechanism. The
approved separate recovery key plus a second-manager recommendation avoids
both. A stolen recovery key can reset the password; retaining MFA limits that
risk for enrolled accounts. Losing every secret can permanently prevent access.
An enrolled administrator who temporarily disables the deployment MFA policy
has password-only sign-in protection until it is re-enabled.
