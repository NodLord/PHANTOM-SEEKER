CREATE TABLE IF NOT EXISTS commanders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cmdr_key TEXT NOT NULL UNIQUE,
  cmdr_name TEXT NOT NULL,
  edsm_name TEXT,
  edsm_status TEXT NOT NULL DEFAULT 'not_provided'
    CHECK (edsm_status IN ('confirmed','private_or_no_ranks','not_found','not_provided','unavailable')),
  primary_ship TEXT NOT NULL,
  preferred_role TEXT NOT NULL,
  registered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_commanders_registered_at
ON commanders(registered_at, id);

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

-- Backfill pre-0.4.32.1 registrations with their former single role.
INSERT OR IGNORE INTO commander_roles (commander_id, role, position)
SELECT id, preferred_role, 0 FROM commanders
WHERE preferred_role IS NOT NULL AND trim(preferred_role) <> '';
