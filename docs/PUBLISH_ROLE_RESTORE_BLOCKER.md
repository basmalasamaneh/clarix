# Publish blocked: custom roles missing during database restore

## Evidence

- User confirmed development-data copying is disabled/unchecked.
- Latest inspected attempt: `31c92a40-f5f5-4d0a-8bc4-4d6f7353f75e`.
- Created 2026-10-11 01:47:12 UTC; failed 01:49:47 UTC.
- Log reports `Preparing development database`, then
  `Copying development database to production database`.
- `pg_restore` fails with `role "clarix_accounts" does not exist` while
  restoring `accounts_audit` on
  `clarix_test_1262fd3d72e6e7a94cf5922d.account_audit`.
- The platform failure message explicitly says production was not changed.
- Read-only production inspection finds none of `clarix_accounts`,
  `clarix_runtime`, `clarix_platform`, or `clarix_identity`.
- Development has 17 policies in public application tables referencing
  `clarix_accounts`, including account security, invitations and memberships.
  Therefore removing leftover test schemas alone would not resolve the missing
  role dependency.

## Diagnosis and boundary

The target needs the relevant PostgreSQL roles before restoring policies that
reference them. Application pre-HTTP provisioning occurs too late for this
platform restore stage. This is separate from the UNIQUE-constraint validation
error already fixed and verified in development.

The logs do not prove that development rows were copied despite the unchecked
setting; schema restoration alone can produce this error.

Do not remove RLS, broaden policies to PUBLIC, reset databases, add deployment
DDL, or directly mutate production to work around it. No such changes were made.

## Required next step

Replit Support needs to investigate the supported Publish restore handling of
custom role dependencies for this project, with the build identifier and error
above. Official documentation on role/policy migration errors directs users to
Support. No new retry is recommended until the restore prerequisite is addressed.

Reference:
https://docs.replit.com/features/data-and-storage/shared-database-migration

All database queries in this investigation were read-only. No secrets are
included in this report.
