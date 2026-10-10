CREATE TABLE IF NOT EXISTS analysis_snapshots(
 id uuid PRIMARY KEY, factory_id text NOT NULL REFERENCES factories(id),
 created_by text NOT NULL REFERENCES users(id), author text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),title text NOT NULL,note text NOT NULL,
 order_search text NOT NULL,payload jsonb NOT NULL,provenance jsonb NOT NULL,
 definitions_version text NOT NULL,UNIQUE(factory_id,id));
CREATE INDEX IF NOT EXISTS snapshots_factory_date ON analysis_snapshots(factory_id,created_at);
CREATE INDEX IF NOT EXISTS snapshots_factory_orders ON analysis_snapshots(factory_id,order_search);
CREATE TABLE IF NOT EXISTS reconciliations(
 id uuid PRIMARY KEY,factory_id text NOT NULL,snapshot_id uuid NOT NULL,
 created_by text NOT NULL REFERENCES users(id),author text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),payload jsonb NOT NULL,
 FOREIGN KEY(factory_id,snapshot_id) REFERENCES analysis_snapshots(factory_id,id));
CREATE INDEX IF NOT EXISTS reconciliations_factory_snapshot ON reconciliations(factory_id,snapshot_id,created_at);
CREATE TABLE IF NOT EXISTS source_row_links(
 id uuid PRIMARY KEY,factory_id text NOT NULL,snapshot_id uuid NOT NULL,import_id uuid NOT NULL,
 raw_row_id uuid NOT NULL,refs jsonb NOT NULL,
 FOREIGN KEY(factory_id,snapshot_id) REFERENCES analysis_snapshots(factory_id,id),
 FOREIGN KEY(factory_id,import_id,raw_row_id) REFERENCES raw_rows(factory_id,import_id,id));
CREATE INDEX IF NOT EXISTS snapshot_links_factory_snapshot ON source_row_links(factory_id,snapshot_id);
CREATE INDEX IF NOT EXISTS snapshot_links_factory_raw ON source_row_links(factory_id,import_id,raw_row_id);
CREATE TABLE IF NOT EXISTS snapshot_audit(
 id uuid PRIMARY KEY,factory_id text NOT NULL,snapshot_id uuid NOT NULL,
 actor_id text NOT NULL REFERENCES users(id),action text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(factory_id,snapshot_id) REFERENCES analysis_snapshots(factory_id,id));
CREATE INDEX IF NOT EXISTS snapshot_audit_factory_snapshot ON snapshot_audit(factory_id,snapshot_id,created_at);
