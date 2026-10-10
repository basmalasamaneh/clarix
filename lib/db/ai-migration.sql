CREATE TABLE IF NOT EXISTS ai_state (
 factory_id text PRIMARY KEY REFERENCES factories(id), state jsonb NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS ai_usage (
 id uuid PRIMARY KEY, factory_id text NOT NULL REFERENCES factories(id),
 actor_id text NOT NULL REFERENCES users(id), task text NOT NULL,
 status text NOT NULL, model text NOT NULL, latency integer NOT NULL, tokens integer,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_usage_factory_id_created_at_index ON ai_usage(factory_id,created_at);
CREATE INDEX IF NOT EXISTS ai_usage_factory_id_actor_id_created_at_index ON ai_usage(factory_id,actor_id,created_at);
