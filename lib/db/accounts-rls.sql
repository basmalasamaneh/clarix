-- Accounts role is isolated from production-data roles and tables.
GRANT SELECT,INSERT,UPDATE ON users TO clarix_accounts;
GRANT SELECT,INSERT,UPDATE ON memberships TO clarix_accounts;
GRANT SELECT ON factories TO clarix_accounts;
GRANT UPDATE(settings) ON factories TO clarix_accounts;
GRANT SELECT,INSERT,UPDATE ON invitations TO clarix_accounts;
GRANT SELECT,INSERT ON account_audit TO clarix_accounts;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE account_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_audit FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS accounts_factory_read ON factories;
CREATE POLICY accounts_factory_read ON factories FOR SELECT TO clarix_accounts
 USING(id=nullif(current_setting('app.factory_id',true),''));
DROP POLICY IF EXISTS accounts_factory_lock ON factories;
CREATE POLICY accounts_factory_lock ON factories FOR UPDATE TO clarix_accounts
 USING(id=nullif(current_setting('app.factory_id',true),''))
 WITH CHECK(id=nullif(current_setting('app.factory_id',true),''));
DROP POLICY IF EXISTS accounts_member_read ON memberships;
CREATE POLICY accounts_member_read ON memberships FOR SELECT TO clarix_accounts
 USING(factory_id=nullif(current_setting('app.factory_id',true),'')
 OR user_id=nullif(current_setting('app.user_id',true),''));
DROP POLICY IF EXISTS accounts_member_insert ON memberships;
CREATE POLICY accounts_member_insert ON memberships FOR INSERT TO clarix_accounts
 WITH CHECK(factory_id=nullif(current_setting('app.factory_id',true),''));
DROP POLICY IF EXISTS accounts_member_update ON memberships;
CREATE POLICY accounts_member_update ON memberships FOR UPDATE TO clarix_accounts
 USING(factory_id=nullif(current_setting('app.factory_id',true),''))
 WITH CHECK(factory_id=nullif(current_setting('app.factory_id',true),''));
DROP POLICY IF EXISTS accounts_invitation_read ON invitations;
CREATE POLICY accounts_invitation_read ON invitations FOR SELECT TO clarix_accounts
 USING(factory_id=nullif(current_setting('app.factory_id',true),'')
 OR token_hash=nullif(current_setting('app.invite_hash',true),''));
DROP POLICY IF EXISTS accounts_invitation_insert ON invitations;
CREATE POLICY accounts_invitation_insert ON invitations FOR INSERT TO clarix_accounts
 WITH CHECK(factory_id=nullif(current_setting('app.factory_id',true),''));
DROP POLICY IF EXISTS accounts_invitation_update ON invitations;
CREATE POLICY accounts_invitation_update ON invitations FOR UPDATE TO clarix_accounts
 USING(factory_id=nullif(current_setting('app.factory_id',true),'')
 OR token_hash=nullif(current_setting('app.invite_hash',true),''))
 WITH CHECK(factory_id=nullif(current_setting('app.factory_id',true),'')
 OR token_hash=nullif(current_setting('app.invite_hash',true),''));
DROP POLICY IF EXISTS accounts_audit ON account_audit;
CREATE POLICY accounts_audit ON account_audit TO clarix_accounts
 USING(factory_id=nullif(current_setting('app.factory_id',true),''))
 WITH CHECK(factory_id=nullif(current_setting('app.factory_id',true),''));
CREATE OR REPLACE FUNCTION reject_account_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'account audit is append-only' USING ERRCODE='55000';
END $$;
DROP TRIGGER IF EXISTS account_audit_immutable ON account_audit;
CREATE TRIGGER account_audit_immutable BEFORE UPDATE OR DELETE ON account_audit
 FOR EACH ROW EXECUTE FUNCTION reject_account_audit_mutation();
DROP TRIGGER IF EXISTS account_audit_no_truncate ON account_audit;
CREATE TRIGGER account_audit_no_truncate BEFORE TRUNCATE ON account_audit
 FOR EACH STATEMENT EXECUTE FUNCTION reject_account_audit_mutation();
