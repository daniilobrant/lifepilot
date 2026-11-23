CREATE TABLE google_lifepilot_calendar (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  calendar_id TEXT NOT NULL
);
CREATE TABLE google_appointment_sync (
  run_id TEXT PRIMARY KEY REFERENCES runs(id),
  slot_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  event_id TEXT
);
