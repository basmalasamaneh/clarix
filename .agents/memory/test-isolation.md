---
name: Development data protection
description: Automated tests must not write to the user's development factories; resets are privileged dev-only maintenance.
---
Automated tests, API verification and fixture-loading tests must never write to
the Ethmar or Najm dev factories. After a test run, those factories must be
exactly as they were before. Use an isolated database/schema or fully cleaned-up
temporary test factories, not archival cleanup in the user's dev factories.

**Why:** The user reported that automated API verification polluted their import
history with immutable approved imports and explicitly prohibited further writes.

**How to apply:** Apply to all automated writers, including browser verification.
Do not add an app delete button or API or weaken immutability. Any reset is
privileged, development-only, explicitly factory-scoped and confirmed.
