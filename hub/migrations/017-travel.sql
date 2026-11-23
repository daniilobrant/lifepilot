CREATE TABLE trips (
  id TEXT PRIMARY KEY, revision INTEGER NOT NULL CHECK(revision>0), plan TEXT NOT NULL, updated TEXT NOT NULL
);
CREATE TABLE trip_revisions (
  trip_id TEXT NOT NULL REFERENCES trips(id), revision INTEGER NOT NULL, plan TEXT NOT NULL, updated TEXT NOT NULL,
  PRIMARY KEY(trip_id, revision)
);
