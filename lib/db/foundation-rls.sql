-- Development schema setup. Never executed at application startup.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='clarix_runtime') THEN
    CREATE ROLE clarix_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='clarix_identity') THEN
    CREATE ROLE clarix_identity NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END $$;
GRANT clarix_runtime TO CURRENT_USER;
GRANT clarix_identity TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO clarix_runtime, clarix_identity;
GRANT SELECT ON factories, memberships TO clarix_runtime, clarix_identity;
ALTER TABLE factories ENABLE ROW LEVEL SECURITY;
ALTER TABLE factories FORCE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS membership_isolation ON memberships;
CREATE POLICY membership_isolation ON memberships FOR SELECT TO clarix_runtime
USING (
  user_id = nullif(current_setting('app.user_id', true), '')
  AND factory_id = nullif(current_setting('app.factory_id', true), '')
);
DROP POLICY IF EXISTS factory_isolation ON factories;
CREATE POLICY factory_isolation ON factories FOR SELECT TO clarix_runtime
USING (
  EXISTS (SELECT 1 FROM memberships m WHERE m.factory_id=factories.id
    AND m.user_id=nullif(current_setting('app.user_id', true), ''))
  AND id = nullif(current_setting('app.factory_id', true), '')
);
-- The discovery role can only list the authenticated user's own memberships.
-- It is separate from the tenant runtime role and has no production-table grants.
DROP POLICY IF EXISTS membership_discovery ON memberships;
CREATE POLICY membership_discovery ON memberships FOR SELECT TO clarix_identity
USING (user_id = nullif(current_setting('app.user_id', true), ''));
DROP POLICY IF EXISTS factory_discovery ON factories;
CREATE POLICY factory_discovery ON factories FOR SELECT TO clarix_identity
USING (EXISTS (SELECT 1 FROM memberships m WHERE m.factory_id=factories.id
  AND m.user_id=nullif(current_setting('app.user_id', true), '')));
