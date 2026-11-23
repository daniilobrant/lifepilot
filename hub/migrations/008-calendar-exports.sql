CREATE TABLE calendar_exports (
  slot_id TEXT PRIMARY KEY REFERENCES schedule(id),
  calendar_name TEXT NOT NULL,
  account TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending','saved','uncertain')),
  event_id TEXT,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE calendar_target (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  account TEXT NOT NULL
) STRICT;
