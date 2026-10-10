CREATE TABLE IF NOT EXISTS account_security (
 user_id text PRIMARY KEY REFERENCES users(id),
 secret text, pending_secret text, pending_until timestamptz,
 pending_confirmed boolean NOT NULL DEFAULT false,
 enabled boolean NOT NULL DEFAULT false,
 recovery_hashes jsonb NOT NULL DEFAULT '[]',
 pending_hashes jsonb NOT NULL DEFAULT '[]',
 recovery_key_hash text UNIQUE,
 last_step bigint NOT NULL DEFAULT -1,
 last_sign_in timestamptz
);
CREATE TABLE IF NOT EXISTS password_resets (
 id uuid PRIMARY KEY, factory_id text NOT NULL REFERENCES factories(id),
 user_id text NOT NULL REFERENCES users(id), issued_by text NOT NULL REFERENCES users(id),
 token_hash text UNIQUE NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL, revoked_at timestamptz, completed_at timestamptz,
 FOREIGN KEY(factory_id,user_id) REFERENCES memberships(factory_id,user_id)
);
ALTER TABLE account_security ADD COLUMN IF NOT EXISTS pending_step bigint;
CREATE INDEX IF NOT EXISTS reset_factory_user ON password_resets(factory_id,user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS security_audit (
 id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES users(id),
 action text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_audit_user_date ON security_audit(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS security_limits (
 key text PRIMARY KEY, hits integer NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS revoked_sessions (
 id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS revoked_sessions_user ON revoked_sessions(user_id);
