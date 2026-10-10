-- Same tenant context/read/write membership rules installed by canonical-rls.
-- A separate trigger applies to owners as well as runtime users.
CREATE OR REPLACE FUNCTION reject_history_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'history is append-only' USING ERRCODE='55000';
END $$;
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['orders_history','production_records_history','events_history']
  LOOP
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %I FROM clarix_runtime',tbl);
    EXECUTE format('DROP TRIGGER IF EXISTS history_immutable ON %I',tbl);
    EXECUTE format('CREATE TRIGGER history_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION reject_history_mutation()',tbl);
    EXECUTE format('DROP TRIGGER IF EXISTS history_no_truncate ON %I',tbl);
    EXECUTE format('CREATE TRIGGER history_no_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION reject_history_mutation()',tbl);
  END LOOP;
END $$;
