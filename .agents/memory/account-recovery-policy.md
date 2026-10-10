---
name: Account recovery policy
description: Approved no-override recovery boundary and deferred admin enforcement.
---
The separate manager recovery key resets only the password; it never removes MFA. A saved authenticator recovery code is still required if the phone is lost. There is no Platform Admin takeover when all recovery material is lost.

**Why:** The user approved a recovery design without external delivery or an administrator bypass.

**How to apply:** Preserve this boundary in later recovery changes and recommend a second factory manager.

Platform Admin enforcement starts only after successful enrollment and explicit acknowledgement that recovery codes were saved, even when production policy is on.

**Why:** This was an explicit user exception to the initial default-enforcement proposal.

**How to apply:** Guide unenrolled admins without locking them out. Temporarily disabling admin policy retains enrollment and cannot grant factory-data access.
