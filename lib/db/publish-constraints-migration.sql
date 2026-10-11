-- Development/post-merge only. Publish owns production schema changes.
-- Keep the historical migration immutable. Attaching its existing unique index
-- preserves the index OID and all dependent tenant-safe foreign keys.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'raw_rows'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (factory_id, import_id, id)'
  ) THEN
    ALTER TABLE raw_rows ADD CONSTRAINT raw_rows_factory_import_id_unique
      UNIQUE USING INDEX raw_rows_factory_import_id_unique;
  END IF;
END $$;
COMMIT;
