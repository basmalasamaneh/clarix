# Publish validation: raw-row reference key

## Cause

The failed statement added the source-row-links foreign key to
`raw_rows(factory_id, import_id, id)`. Development had a standalone unique
index for those columns, not a `pg_constraint` UNIQUE entry. The generated
Publish diff omitted that index entirely, although it included four foreign
keys referencing the key. This was verified in the supplied diagnostic file,
the current catalog, and a newly computed schema diff.

This is distinct from the earlier development-data-copy failure.

## Development-only fix

- Named the existing Drizzle unique declaration to match the historical index.
- Added `lib/db/publish-constraints-migration.sql` to the guarded development/
  post-merge setup, after the historical import migration.
- Applied that additive migration to development: attach the existing index as
  a UNIQUE constraint, without dropping/rebuilding it or changing rows.
- Preserved the historical migration and all foreign keys and RLS policies.
- No production writes, deployment DDL, runtime hooks or bypasses were added.

## Verification

- Migration executed twice successfully (idempotent).
- Catalog now shows the explicit UNIQUE constraint; all six foreign keys
  referencing raw_rows remain validated.
- Fresh Publish diff includes the unique key in CREATE TABLE raw_rows, before
  the dependent foreign keys. 228 statements; no structural data loss reported.
- Original generated diff reproduced the exact failure in a disposable
  development schema.
- Corrected diff executed all 228 statements in a disposable development schema.
  Both transactions were rolled back; neither changed production.
- Database-package TypeScript check passed.

| Table | Rows before / after | Fingerprint before = after |
|---|---|---|
| raw_rows | 67 / 67 | `452ba3627f56a2ed8c09e1fdbe290a5b` |
| source_row_links | 8 / 8 | `53ac9aa22d20499bccd649e209963823` |

Fingerprints are MD5 of ordered row JSON, used for change detection.

The disposable replay uses development's existing database roles. It proves
the generated SQL's constraint ordering is fixed, not that all production
permissions or initialization steps have passed. Read-only production inspection
found no public application tables. The next Publish fork validation remains
authoritative. Retry Publish with development-data copying still disabled.
