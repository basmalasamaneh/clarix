---
name: Import replacement history
description: User-chosen separate append-only history, tenant safety and source-line rules.
---
Use separate history tables, not versioned rows in current canonical tables.
Retain unique source IDs in current data; history must carry factory scope,
FORCE RLS, tenant-safe references, lookup indexes, superseding import and time,
and database-enforced append-only behavior.

**Why:** The user explicitly chose this policy to retain replacement history
without weakening the Phase 2 uniqueness constraints.

**How to apply:** Archive and replace atomically, test cross-factory denial and
immutability. Raw source references use FIRST physical line; retain both ends.

Duplicate detection requires the same files AND mapping, and a prior import
still current for at least one order in the SAME source. Different mapping or fully superseded
imports must remain approvable through replacement confirmation.
**Why:** The user corrected the earlier hash-only policy to support reprocessing.

Keep sources separate. Explicitly choose an existing source or create a named
source; never merge equal order IDs across sources. Archive reversibly rather
than deleting source data, using existing factory settings rather than changing
the data model. Source-qualified identities must be visible in runs/comparison.
**Why:** The user chose source isolation and requested archive/restore without
data-model or fixture changes.

Explicitly ignored event codes retain the engine's exclusion warning. Display
the code, count, excluded rows, acting user and time. Do not change the engine
or fixtures to turn this into an informational note; that is a post-MVP idea.
**Why:** The user explicitly chose preserving the warning.

On an existing Phase 2 schema, Drizzle push attempted to drop referenced composite
uniques. Use additive migrations rather than cascading those constraints.
**Why:** Dropping dependent keys would weaken tenant-safe foreign references.
**How to apply:** Extend the explicit migration path for future schema changes.
