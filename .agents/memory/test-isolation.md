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

The user approved one narrow reset exception: clear only `sourceArchives` and
`sourceArchiveEvents` in the selected factory's settings. Preserve all other
factory fields and settings.
**Why:** Retaining archive flags after deleting imports would block reusing old
source names, despite an otherwise empty factory.

Forced RLS also applies to the disposable schema's non-bypass owner. For synthetic
invitation expiry changes, use the scoped accounts transaction and check affected
rows; for tenant assertions, use the authenticated API instead of owner queries.
**Why:** An owner UPDATE silently matched zero rows in a test, leaving the token
valid and producing a misleading expiry failure.
**How to apply:** Do not relax RLS or modify ordinary data to prepare fixtures.
