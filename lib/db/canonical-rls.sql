-- Apply after the Drizzle schema and foundation-rls.sql. No startup DDL.
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['imports','raw_rows','column_mappings','orders','production_records','events','data_issues']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC, clarix_identity', tbl);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO clarix_runtime', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_read ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_write ON %I', tbl);
    EXECUTE format($policy$
      CREATE POLICY tenant_read ON %I FOR SELECT TO clarix_runtime USING (
        factory_id = nullif(current_setting('app.factory_id', true), '')
        AND EXISTS (SELECT 1 FROM memberships m JOIN factories f ON f.id=m.factory_id
          WHERE m.factory_id = nullif(current_setting('app.factory_id',true),'')
          AND m.user_id = nullif(current_setting('app.user_id',true),'') AND f.status='active')
      )$policy$, tbl);
    -- The write policy applies to ALL operations; SELECT is also allowed for
    -- viewers by its read policy, writes require a manager or analyst.
    EXECUTE format($policy$
      CREATE POLICY tenant_write ON %I FOR ALL TO clarix_runtime USING (
        factory_id = nullif(current_setting('app.factory_id', true), '')
        AND EXISTS (SELECT 1 FROM memberships m JOIN factories f ON f.id=m.factory_id
          WHERE m.factory_id = nullif(current_setting('app.factory_id',true),'')
          AND m.user_id = nullif(current_setting('app.user_id',true),'')
          AND m.role IN ('factory_manager','analyst') AND f.status='active')
      ) WITH CHECK (
        factory_id = nullif(current_setting('app.factory_id', true), '')
        AND EXISTS (SELECT 1 FROM memberships m JOIN factories f ON f.id=m.factory_id
          WHERE m.factory_id = nullif(current_setting('app.factory_id',true),'')
          AND m.user_id = nullif(current_setting('app.user_id',true),'')
          AND m.role IN ('factory_manager','analyst') AND f.status='active')
      )$policy$, tbl);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION reject_raw_row_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'raw_rows is immutable' USING ERRCODE='55000';
END $$;
DROP TRIGGER IF EXISTS raw_rows_immutable ON raw_rows;
CREATE TRIGGER raw_rows_immutable BEFORE UPDATE OR DELETE ON raw_rows
FOR EACH ROW EXECUTE FUNCTION reject_raw_row_mutation();
DROP TRIGGER IF EXISTS raw_rows_no_truncate ON raw_rows;
CREATE TRIGGER raw_rows_no_truncate BEFORE TRUNCATE ON raw_rows
FOR EACH STATEMENT EXECUTE FUNCTION reject_raw_row_mutation();

CREATE OR REPLACE FUNCTION validate_issue_raw_rows() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM unnest(NEW.raw_row_ids) r(id)
    WHERE NOT EXISTS (SELECT 1 FROM raw_rows rr
      WHERE rr.id=r.id AND rr.factory_id=NEW.factory_id AND rr.import_id=NEW.import_id)
  ) THEN
    RAISE EXCEPTION 'Invalid issue source reference' USING ERRCODE='23503';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS issue_raw_rows_same_tenant ON data_issues;
CREATE TRIGGER issue_raw_rows_same_tenant BEFORE INSERT OR UPDATE ON data_issues
FOR EACH ROW EXECUTE FUNCTION validate_issue_raw_rows();
