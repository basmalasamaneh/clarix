GRANT SELECT,INSERT,UPDATE ON ai_state TO clarix_runtime;
GRANT SELECT,INSERT ON ai_usage TO clarix_runtime;
DO $$ DECLARE tbl text; BEGIN
 FOREACH tbl IN ARRAY ARRAY['ai_state','ai_usage'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tbl);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tbl);
  EXECUTE format('DROP POLICY IF EXISTS ai_tenant ON %I',tbl);
  EXECUTE format($p$ CREATE POLICY ai_tenant ON %I FOR ALL TO clarix_runtime
   USING (factory_id=nullif(current_setting('app.factory_id',true),'') AND EXISTS(
    SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id JOIN factories f ON f.id=m.factory_id
    WHERE m.factory_id=nullif(current_setting('app.factory_id',true),'') AND m.user_id=nullif(current_setting('app.user_id',true),'')
     AND m.active AND NOT m.recovery_required AND NOT u.platform_admin AND f.status='active'))
   WITH CHECK(factory_id=nullif(current_setting('app.factory_id',true),'') AND EXISTS(
    SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id JOIN factories f ON f.id=m.factory_id
    WHERE m.factory_id=nullif(current_setting('app.factory_id',true),'') AND m.user_id=nullif(current_setting('app.user_id',true),'')
     AND m.active AND NOT m.recovery_required AND NOT u.platform_admin AND f.status='active')) $p$,tbl);
 END LOOP;
END $$;
-- The actor must be the signed-in actor, even when a caller has SQL access.
DROP POLICY IF EXISTS ai_actor ON ai_usage;
CREATE POLICY ai_actor ON ai_usage AS RESTRICTIVE FOR INSERT TO clarix_runtime
 WITH CHECK(actor_id=nullif(current_setting('app.user_id',true),''));
DROP TRIGGER IF EXISTS ai_usage_immutable ON ai_usage;
CREATE TRIGGER ai_usage_immutable BEFORE UPDATE OR DELETE ON ai_usage FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
DROP TRIGGER IF EXISTS ai_usage_no_truncate ON ai_usage;
CREATE TRIGGER ai_usage_no_truncate BEFORE TRUNCATE ON ai_usage FOR EACH STATEMENT EXECUTE FUNCTION reject_history_mutation();
