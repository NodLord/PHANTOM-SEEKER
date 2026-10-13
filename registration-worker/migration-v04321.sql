-- PHANTOM SEEKER V0.4.32.1 migration
-- Safe for the existing V0.4.32 D1 database. It does not delete or rewrite commanders.

CREATE TABLE IF NOT EXISTS commander_roles (
  commander_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (commander_id, role)
);

CREATE INDEX IF NOT EXISTS idx_commander_roles_order
ON commander_roles(commander_id, position);

CREATE TABLE IF NOT EXISTS registration_secrets (
  commander_id INTEGER PRIMARY KEY,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO commander_roles (commander_id, role, position)
SELECT id, preferred_role, 0 FROM commanders
WHERE preferred_role IS NOT NULL AND trim(preferred_role) <> '';
