CREATE TABLE depot_holdings (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE depot_snapshots (
  id TEXT PRIMARY KEY,
  taken_on TEXT NOT NULL UNIQUE,
  total_cents INTEGER NOT NULL CHECK (total_cents>=0),
  invested_cents INTEGER NOT NULL CHECK (invested_cents>=0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;
