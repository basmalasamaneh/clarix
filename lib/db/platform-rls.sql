-- No production-table grants: this role is only used by platform management.
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
