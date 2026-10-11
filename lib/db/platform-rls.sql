-- Platform management cannot access ordinary factory production data.
-- Narrow exception: transaction-local provisioning of a NEW synthetic demo.
-- The server clears demoProvisioning before commit, so this policy never
-- permits platform reads of existing factory production data.
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['imports','raw_rows','column_mappings','orders','production_records','events','data_issues','orders_history','production_records_history','events_history']
  LOOP
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %I FROM clarix_platform',tbl);
    EXECUTE format('GRANT SELECT, INSERT ON %I TO clarix_platform',tbl);
    IF tbl NOT IN ('raw_rows','orders_history','production_records_history','events_history') THEN
      EXECUTE format('GRANT UPDATE ON %I TO clarix_platform',tbl);
    END IF;
    IF tbl='data_issues' THEN EXECUTE 'GRANT DELETE ON data_issues TO clarix_platform'; END IF;
    EXECUTE format('DROP POLICY IF EXISTS demo_provision ON %I',tbl);
    EXECUTE format($p$CREATE POLICY demo_provision ON %I TO clarix_platform
      USING (factory_id=nullif(current_setting('app.factory_id',true),'') AND EXISTS (
        SELECT 1 FROM factories f JOIN users u ON u.id=nullif(current_setting('app.user_id',true),'')
        WHERE f.id=factory_id AND u.platform_admin AND f.settings->>'demoProvisioning'=u.id AND f.settings->>'demo'='true'))
      WITH CHECK (factory_id=nullif(current_setting('app.factory_id',true),'') AND EXISTS (
        SELECT 1 FROM factories f JOIN users u ON u.id=nullif(current_setting('app.user_id',true),'')
        WHERE f.id=factory_id AND u.platform_admin AND f.settings->>'demoProvisioning'=u.id AND f.settings->>'demo'='true'))$p$,tbl);
  END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE ON factories TO clarix_platform;
GRANT SELECT ON users,memberships TO clarix_platform;
GRANT UPDATE(session_version) ON users TO clarix_platform;
GRANT SELECT,INSERT,UPDATE ON invitations TO clarix_platform;
GRANT SELECT,INSERT ON platform_audit TO clarix_platform;
GRANT UPDATE(name,default_language,settings) ON factories TO clarix_accounts;
GRANT UPDATE(last_approved_at) ON factories TO clarix_runtime;
GRANT SELECT,INSERT ON factory_settings_audit TO clarix_accounts;
GRANT INSERT ON platform_audit TO clarix_accounts;
GRANT SELECT,UPDATE ON platform_invitations TO clarix_accounts;
GRANT clarix_platform TO clarix_runtime;
ALTER TABLE platform_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_audit FORCE ROW LEVEL SECURITY;
ALTER TABLE factory_settings_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE factory_settings_audit FORCE ROW LEVEL SECURITY;
ALTER TABLE platform_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_invitations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_factories ON factories;
CREATE POLICY platform_factories ON factories TO clarix_platform
 USING(EXISTS(SELECT 1 FROM users WHERE id=nullif(current_setting('app.user_id',true),'') AND platform_admin))
 WITH CHECK(EXISTS(SELECT 1 FROM users WHERE id=nullif(current_setting('app.user_id',true),'') AND platform_admin));
DROP POLICY IF EXISTS platform_members ON memberships;
CREATE POLICY platform_members ON memberships FOR SELECT TO clarix_platform
 USING(EXISTS(SELECT 1 FROM users WHERE id=nullif(current_setting('app.user_id',true),'') AND platform_admin));
DROP POLICY IF EXISTS platform_invites ON invitations;
CREATE POLICY platform_invites ON invitations TO clarix_platform
 USING(EXISTS(SELECT 1 FROM users WHERE id=nullif(current_setting('app.user_id',true),'') AND platform_admin))
 WITH CHECK(EXISTS(SELECT 1 FROM users WHERE id=nullif(current_setting('app.user_id',true),'') AND platform_admin));
DROP POLICY IF EXISTS platform_audit_admin ON platform_audit;
CREATE POLICY platform_audit_admin ON platform_audit TO clarix_platform
 USING(EXISTS(SELECT 1 FROM users WHERE id=nullif(current_setting('app.user_id',true),'') AND platform_admin))
 WITH CHECK(EXISTS(SELECT 1 FROM users WHERE id=nullif(current_setting('app.user_id',true),'') AND platform_admin));
DROP POLICY IF EXISTS platform_audit_accept ON platform_audit;
CREATE POLICY platform_audit_accept ON platform_audit FOR INSERT TO clarix_accounts
 WITH CHECK(factory_id=nullif(current_setting('app.factory_id',true),'') OR
 (factory_id IS NULL AND EXISTS(SELECT 1 FROM platform_invitations WHERE token_hash=nullif(current_setting('app.invite_hash',true),''))));
DROP POLICY IF EXISTS settings_audit_scope ON factory_settings_audit;
CREATE POLICY settings_audit_scope ON factory_settings_audit TO clarix_accounts
 USING(factory_id=nullif(current_setting('app.factory_id',true),''))
 WITH CHECK(factory_id=nullif(current_setting('app.factory_id',true),''));
DROP POLICY IF EXISTS platform_token ON platform_invitations;
CREATE POLICY platform_token ON platform_invitations TO clarix_accounts
 USING(token_hash=nullif(current_setting('app.invite_hash',true),''))
 WITH CHECK(token_hash=nullif(current_setting('app.invite_hash',true),''));
DROP TRIGGER IF EXISTS platform_audit_immutable ON platform_audit;
DROP TRIGGER IF EXISTS platform_audit_no_truncate ON platform_audit;
DROP TRIGGER IF EXISTS settings_audit_immutable ON factory_settings_audit;
DROP TRIGGER IF EXISTS settings_audit_no_truncate ON factory_settings_audit;
CREATE TRIGGER platform_audit_immutable BEFORE UPDATE OR DELETE ON platform_audit FOR EACH ROW EXECUTE FUNCTION reject_account_audit_mutation();
CREATE TRIGGER platform_audit_no_truncate BEFORE TRUNCATE ON platform_audit FOR EACH STATEMENT EXECUTE FUNCTION reject_account_audit_mutation();
CREATE TRIGGER settings_audit_immutable BEFORE UPDATE OR DELETE ON factory_settings_audit FOR EACH ROW EXECUTE FUNCTION reject_account_audit_mutation();
CREATE TRIGGER settings_audit_no_truncate BEFORE TRUNCATE ON factory_settings_audit FOR EACH STATEMENT EXECUTE FUNCTION reject_account_audit_mutation();
DROP POLICY IF EXISTS factory_import_metadata ON factories;
CREATE POLICY factory_import_metadata ON factories FOR UPDATE TO clarix_runtime
 USING(id=nullif(current_setting('app.factory_id',true),'') AND EXISTS(
 SELECT 1 FROM memberships WHERE factory_id=factories.id AND user_id=nullif(current_setting('app.user_id',true),'') AND role IN('factory_manager','analyst')))
 WITH CHECK(id=nullif(current_setting('app.factory_id',true),''));
