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

On an existing Phase 2 schema, Drizzle push attempted to drop referenced composite
uniques. Use additive migrations rather than cascading those constraints.
**Why:** Dropping dependent keys would weaken tenant-safe foreign references.
**How to apply:** Extend the explicit migration path for future schema changes.
