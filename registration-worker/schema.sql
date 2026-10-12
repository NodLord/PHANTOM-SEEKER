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
