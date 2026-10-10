ALTER TABLE factories ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE factories ADD COLUMN IF NOT EXISTS last_approved_at timestamptz;
CREATE TABLE IF NOT EXISTS platform_audit (
 id uuid PRIMARY KEY, factory_id text REFERENCES factories(id),actor_id text REFERENCES users(id),
 action text NOT NULL,old_value jsonb,new_value jsonb,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_audit_factory_created ON platform_audit(factory_id,created_at);
CREATE TABLE IF NOT EXISTS factory_settings_audit (
 id uuid PRIMARY KEY,factory_id text NOT NULL REFERENCES factories(id),actor_id text NOT NULL REFERENCES users(id),
 action text NOT NULL,old_value jsonb,new_value jsonb,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS factory_settings_audit_factory_created ON factory_settings_audit(factory_id,created_at);
CREATE TABLE IF NOT EXISTS platform_invitations (
 id uuid PRIMARY KEY,email text NOT NULL,token_hash text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,accepted_at timestamptz
);
-- Metadata-only backfill, once; never changes approved imports or results.
UPDATE factories f SET last_approved_at=(SELECT max(approved_at) FROM imports WHERE factory_id=f.id)
 WHERE last_approved_at IS NULL;
UPDATE factories f SET settings=settings||jsonb_build_object('platformUsage',jsonb_build_object(
 'uploadBytes',coalesce((SELECT max((file->>'size')::bigint) FROM imports i CROSS JOIN LATERAL jsonb_array_elements(i.files) file WHERE i.factory_id=f.id),0),
 'rows',coalesce((SELECT max(n) FROM (SELECT sum((file->>'rowCount')::bigint) n FROM imports i CROSS JOIN LATERAL jsonb_array_elements(i.files) file WHERE i.factory_id=f.id GROUP BY i.id) q),0)))
 WHERE NOT settings ? 'platformUsage';
