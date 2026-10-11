# Clarix — UI-only production checklist

No publishing was performed. **You** means a Replit-interface action;
**Automatic** means application/platform behavior. See
`PRODUCTION_GATE_REPORT.md` for proof and remaining real-platform checks.

1. **You:** Open Publishing's production configuration. Leave development
   settings unchanged. Set `NODE_ENV=production` and `SEED_TEST_USERS=false`.
2. **You:** Review **Publishing → Adjust settings → Production app secrets**.
   Required secret names: `CLARIX_RUNTIME_PASSWORD`, `SESSION_SECRET`, `CLARIX_TOTP_ENCRYPTION_KEY`,
   `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PRIVATE_OBJECT_DIR`,
   `PUBLIC_OBJECT_SEARCH_PATHS`, `CLARIX_INITIAL_FACTORY_NAME`,
   `CLARIX_INITIAL_FACTORY_SLUG`, `CLARIX_INITIAL_MANAGER_EMAIL`,
   `CLARIX_INITIAL_INVITE_TOKEN`. For optional Platform Admin onboarding, also
   set `CLARIX_INITIAL_ROLE` to `platform_admin` and
   `CLARIX_INITIAL_ADMIN_EMAIL`, instead of the three factory/manager names.
   Omit the role selector for the backwards-compatible first-manager mode.
   The factory slug must start with a lowercase
   letter and contain only lowercase letters, digits and hyphens.
3. **You:** Set a production `CLARIX_RUNTIME_PASSWORD` of at least 32 characters,
   **different from development**, and a strong production `SESSION_SECRET`.
   Verify storage settings privately. **Do not set `SEED_TEST_PASSWORD` for the
   deployment.** Remove its inherited production entry without deleting the
   development secret. Never copy the development `DATABASE_URL`.
   Optional AI: configure the deployment secret `GEMINI_API_KEY` and setting
   `GEMINI_MODEL` only if AI is wanted. Without both, AI is unavailable and
   core comparisons still work. Factory-manager consent is also required.
   Optional limit settings: `AI_DAILY_CAP`, `AI_USER_PER_MINUTE`, `AI_TIMEOUT_MS`,
   `AI_CACHE_SECONDS`, `AI_BREAKER_FAILURES`, `AI_BREAKER_SECONDS`.
   Optional sign-in settings: `CLARIX_REQUIRE_ADMIN_MFA`,
   `CLARIX_SESSION_IDLE_SECONDS`, `CLARIX_SESSION_ABSOLUTE_SECONDS`.
   Keep authenticator encryption keys backed up separately and privately.
   Also set a separate production `CLARIX_TOTP_ENCRYPTION_KEY` (64 random
   hexadecimal characters). Review `CLARIX_REQUIRE_ADMIN_MFA` (defaults on in
   production), `CLARIX_SESSION_IDLE_SECONDS` and
   `CLARIX_SESSION_ABSOLUTE_SECONDS`. See `PHASE18_SECURITY.md` before rotating
   encryption keys. No enrollment is enforced before saved-code acknowledgement.
4. **You:** Generate a cryptographically random **43-character token** in a
   trusted local password manager, using only letters, digits, hyphens and
   underscores. This is at least 256 bits when selected uniformly. Save it
   privately and paste it into `CLARIX_INITIAL_INVITE_TOKEN`. Do not use an
   online token generator or send it in chat. No manager password is supplied.
5. **You:** Confirm that deployment contains only Clarix and its API, not a
   running mockup sandbox. The sandbox artifact has development service
   configuration only; neither production build imports its preview plugin.
6. **You:** Only when separately ready and authorized, use **Publish**. Leave
   development-data copying disabled. Review schema-change confirmation.
7. **Automatic:** Replit provides a separate production database and applies
   schema changes, including allowing the deployment invitation to have no
   creating user. The application never runs table migrations at startup.
8. **Automatic:** Before HTTP starts, a separate privileged process creates
   missing security roles, applies grants/RLS/immutable protections, configures
   the runtime password, verifies protections and creates the initial invitation
   in one transaction. Any failure rolls back and prevents API startup.
9. **Automatic:** With zero users and no previous initial invitation, the
   initializer creates the first factory and a seven-day manager invitation,
   or just a Platform Admin invitation in the optional admin mode. It stores
   only the token hash, creates no dummy user, and logs no token or link.
   Repeat starts do not replace invitations or extend expiry.
10. **Automatic:** The setup process closes its privileged connection and
    replaces itself with the API process. The API receives only the restricted
    database connection, never the owner connection or invitation secret.
11. **You:** In your browser, open the actual published site's
    `/invite/<your-token>` address, inserting your saved token privately.
    Choose your name and password on the existing invitation page. Finish
    within seven days; restarting does not renew an expired invitation.
12. **You:** Sign out and sign in as the first manager or Platform Admin. Then delete only the
    deployment `CLARIX_INITIAL_INVITE_TOKEN` secret and discard the saved token.
    Apply the deployment configuration update through Replit if required.
    Platform Admins can then use **Platform → Add factory** to invite each
    factory's first manager; they cannot open factory production data.
13. **Automatic:** The accepted token stops working. Once any user exists,
    initialization does nothing, including when the token secret is absent.
    The retained invitation prevents accidental recreation if users are removed.
14. **You:** Verify live HTTPS cookies/headers, factory access and uploaded-file
    storage; complete outstanding browser checks. The owner must have table
    ownership and role-management permission. These actual platform permissions
    still need verification on the first authorized deployment.
15. **You:** Enable backups in **Database → production → Settings → Advanced →
    Scheduled backups → Keep backups for**. Rehearse only on a separate disposable
    project. Restore via **View all backups → Restore → type `restore` → Continue**.
    A database restore does not restore code or establish object-file recovery.

No Shell commands, manual manager passwords or invitation-link logging are part
of this procedure. A failed initial setup leaves the API unavailable rather than
running with owner privileges. Expired initial invitations require an explicit
reviewed recovery procedure; automatic reissue is deliberately not implemented.
