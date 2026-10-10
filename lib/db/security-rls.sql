GRANT SELECT,INSERT,UPDATE ON account_security,password_resets,security_limits TO clarix_accounts;
GRANT SELECT,INSERT ON security_audit,revoked_sessions TO clarix_accounts;
ALTER TABLE account_security ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_security FORCE ROW LEVEL SECURITY;
ALTER TABLE password_resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_resets FORCE ROW LEVEL SECURITY;
ALTER TABLE security_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_audit FORCE ROW LEVEL SECURITY;
ALTER TABLE security_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_limits FORCE ROW LEVEL SECURITY;
ALTER TABLE revoked_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE revoked_sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS security_owner ON account_security;
CREATE POLICY security_owner ON account_security TO clarix_accounts
 USING(user_id=nullif(current_setting('app.user_id',true),'')
 OR recovery_key_hash=nullif(current_setting('app.recovery_hash',true),''))
 WITH CHECK(user_id=nullif(current_setting('app.user_id',true),''));
DROP POLICY IF EXISTS reset_scope ON password_resets;
CREATE POLICY reset_scope ON password_resets TO clarix_accounts
 USING(factory_id=nullif(current_setting('app.factory_id',true),'')
 OR token_hash=nullif(current_setting('app.reset_hash',true),''))
 WITH CHECK(factory_id=nullif(current_setting('app.factory_id',true),''));
DROP POLICY IF EXISTS security_audit_owner ON security_audit;
CREATE POLICY security_audit_owner ON security_audit TO clarix_accounts
 USING(user_id=nullif(current_setting('app.user_id',true),''))
 WITH CHECK(user_id=nullif(current_setting('app.user_id',true),''));
DROP POLICY IF EXISTS security_limits_key ON security_limits;
CREATE POLICY security_limits_key ON security_limits TO clarix_accounts
 USING(key=nullif(current_setting('app.rate_key',true),''))
 WITH CHECK(key=nullif(current_setting('app.rate_key',true),''));
DROP POLICY IF EXISTS revoked_session_owner ON revoked_sessions;
CREATE POLICY revoked_session_owner ON revoked_sessions TO clarix_accounts
 USING(user_id=nullif(current_setting('app.user_id',true),''))
 WITH CHECK(user_id=nullif(current_setting('app.user_id',true),''));
DROP TRIGGER IF EXISTS security_audit_immutable ON security_audit;
CREATE TRIGGER security_audit_immutable BEFORE UPDATE OR DELETE ON security_audit
 FOR EACH ROW EXECUTE FUNCTION reject_account_audit_mutation();
DROP TRIGGER IF EXISTS security_audit_no_truncate ON security_audit;
CREATE TRIGGER security_audit_no_truncate BEFORE TRUNCATE ON security_audit
 FOR EACH STATEMENT EXECUTE FUNCTION reject_account_audit_mutation();
