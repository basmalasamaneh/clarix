BEGIN;
ALTER TABLE imports ADD COLUMN IF NOT EXISTS files jsonb NOT NULL DEFAULT '[]';
ALTER TABLE imports ADD COLUMN IF NOT EXISTS mapping jsonb;
ALTER TABLE imports ADD COLUMN IF NOT EXISTS result jsonb;
ALTER TABLE imports ADD COLUMN IF NOT EXISTS counts jsonb;
ALTER TABLE imports ADD COLUMN IF NOT EXISTS progress integer NOT NULL DEFAULT 0;
ALTER TABLE imports ADD COLUMN IF NOT EXISTS finalized boolean NOT NULL DEFAULT false;
ALTER TABLE imports ADD COLUMN IF NOT EXISTS approved_at timestamp;
ALTER TABLE imports ALTER COLUMN status SET DEFAULT 'draft';
ALTER TABLE imports DROP CONSTRAINT IF EXISTS imports_factory_id_content_hash_unique;
CREATE UNIQUE INDEX IF NOT EXISTS imports_approved_hash_unique ON imports(factory_id,content_hash) WHERE status='approved';
ALTER TABLE column_mappings ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT 'Default';
ALTER TABLE raw_rows ADD COLUMN IF NOT EXISTS record_end_line integer;
ALTER TABLE raw_rows ADD COLUMN IF NOT EXISTS start_line integer GENERATED ALWAYS AS (line_number) STORED;
ALTER TABLE raw_rows ADD COLUMN IF NOT EXISTS end_line integer GENERATED ALWAYS AS (coalesce(record_end_line,line_number)) STORED;
CREATE UNIQUE INDEX IF NOT EXISTS raw_rows_factory_import_id_unique ON raw_rows(factory_id,import_id,id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS current_import_id uuid;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS metrics jsonb;
ALTER TABLE data_issues ADD COLUMN IF NOT EXISTS source_order_id text;
DO $$
DECLARE tbl text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='orders_current_import_fk') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_current_import_fk FOREIGN KEY(factory_id,source_name,current_import_id) REFERENCES imports(factory_id,source_name,id);
  END IF;
  FOREACH tbl IN ARRAY ARRAY['orders_history','production_records_history','events_history'] LOOP
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),factory_id text NOT NULL,source_name text NOT NULL,
      source_id text NOT NULL,order_id uuid NOT NULL,original_import_id uuid NOT NULL,raw_row_id uuid,
      superseded_by_import_id uuid NOT NULL,superseded_at timestamp NOT NULL DEFAULT now(),
      status text NOT NULL DEFAULT ''superseded'',payload jsonb NOT NULL)',tbl);
    IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname=tbl||'_order_fk') THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY(factory_id,source_name,order_id) REFERENCES orders(factory_id,source_name,id)',tbl,tbl||'_order_fk');
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY(factory_id,source_name,original_import_id) REFERENCES imports(factory_id,source_name,id)',tbl,tbl||'_original_fk');
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY(factory_id,source_name,superseded_by_import_id) REFERENCES imports(factory_id,source_name,id)',tbl,tbl||'_superseding_fk');
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY(factory_id,original_import_id,raw_row_id) REFERENCES raw_rows(factory_id,import_id,id)',tbl,tbl||'_raw_fk');
    END IF;
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(factory_id,source_name,source_id)',tbl||'_source_idx',tbl);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(factory_id,order_id,superseded_at)',tbl||'_order_idx',tbl);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(factory_id,superseded_by_import_id)',tbl||'_superseding_idx',tbl);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(factory_id,original_import_id)',tbl||'_original_idx',tbl);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tbl);
  END LOOP;
END $$;
COMMIT;
