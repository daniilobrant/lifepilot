CREATE TABLE google_calendar_test (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  calendar_id TEXT NOT NULL
);
