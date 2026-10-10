DO $$
DECLARE tbl text;
BEGIN
 FOREACH tbl IN ARRAY ARRAY['analysis_snapshots','reconciliations','source_row_links','snapshot_audit']
 LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tbl);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tbl);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,clarix_runtime,clarix_identity,clarix_accounts,clarix_platform',tbl);
  EXECUTE format('GRANT SELECT,INSERT ON %I TO clarix_runtime',tbl);
  EXECUTE format('DROP POLICY IF EXISTS snapshot_read ON %I',tbl);
  EXECUTE format('DROP POLICY IF EXISTS snapshot_insert ON %I',tbl);
  EXECUTE format($p$ CREATE POLICY snapshot_read ON %I FOR SELECT TO clarix_runtime USING(
   factory_id=nullif(current_setting('app.factory_id',true),'') AND EXISTS(
    SELECT 1 FROM memberships m JOIN factories f ON f.id=m.factory_id JOIN users u ON u.id=m.user_id
    WHERE m.factory_id=nullif(current_setting('app.factory_id',true),'')
    AND m.user_id=nullif(current_setting('app.user_id',true),'') AND m.active AND NOT m.recovery_required
    AND NOT u.platform_admin AND f.status='active')) $p$,tbl);
  EXECUTE format($p$ CREATE POLICY snapshot_insert ON %I FOR INSERT TO clarix_runtime WITH CHECK(
   factory_id=nullif(current_setting('app.factory_id',true),'') AND EXISTS(
    SELECT 1 FROM memberships m JOIN factories f ON f.id=m.factory_id JOIN users u ON u.id=m.user_id
    WHERE m.factory_id=nullif(current_setting('app.factory_id',true),'')
    AND m.user_id=nullif(current_setting('app.user_id',true),'') AND m.active AND NOT m.recovery_required
    AND NOT u.platform_admin AND m.role IN('factory_manager','analyst') AND f.status='active')) $p$,tbl);
  EXECUTE format('DROP TRIGGER IF EXISTS snapshot_immutable ON %I',tbl);
  EXECUTE format('CREATE TRIGGER snapshot_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_history_mutation()',tbl);
  EXECUTE format('DROP TRIGGER IF EXISTS snapshot_no_truncate ON %I',tbl);
  EXECUTE format('CREATE TRIGGER snapshot_no_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION reject_history_mutation()',tbl);
 END LOOP;
END $$;
