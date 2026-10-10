-- No table ownership, schema creation, superuser or RLS bypass privileges.
GRANT clarix_identity,clarix_accounts TO clarix_runtime;
GRANT SELECT ON users TO clarix_runtime;
GRANT UPDATE(language,theme,tour_completed) ON users TO clarix_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON sessions TO clarix_runtime;
REVOKE UPDATE,DELETE,TRUNCATE ON raw_rows FROM clarix_runtime;
