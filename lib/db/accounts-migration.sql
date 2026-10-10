ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 0;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS recovery_required boolean NOT NULL DEFAULT false;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS last_login timestamptz;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS login_success_count integer NOT NULL DEFAULT 0;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS login_failure_count integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS invitations (
 id uuid PRIMARY KEY,
 factory_id text NOT NULL REFERENCES factories(id),
 email text NOT NULL,
 role text NOT NULL CHECK(role IN ('factory_manager','analyst','viewer')),
 token_hash text UNIQUE NOT NULL CHECK(length(token_hash)=64),
 created_by text NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 accepted_at timestamptz
);
CREATE INDEX IF NOT EXISTS invitations_factory_pending ON invitations(factory_id,created_at DESC) WHERE revoked_at IS NULL AND accepted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS invitations_pending_email ON invitations(factory_id,email) WHERE revoked_at IS NULL AND accepted_at IS NULL;
CREATE TABLE IF NOT EXISTS account_audit (
 id uuid PRIMARY KEY,
 factory_id text NOT NULL REFERENCES factories(id),
 actor_id text REFERENCES users(id),
 subject_id text REFERENCES users(id),
 action text NOT NULL,
 role text CHECK(role IN ('factory_manager','analyst','viewer')),
 event_count integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_audit_factory_date ON account_audit(factory_id,created_at DESC);
