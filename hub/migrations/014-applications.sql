CREATE TABLE applications (
  id TEXT PRIMARY KEY,
  company TEXT NOT NULL, role TEXT NOT NULL, location TEXT NOT NULL,
  salary TEXT NOT NULL, description TEXT NOT NULL, notes TEXT NOT NULL, link TEXT NOT NULL,
  applied_on TEXT, follow_up TEXT,
  status TEXT NOT NULL CHECK(status IN ('applied','reply','interview','offer','rejected','withdrawn')),
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
CREATE TABLE application_sources (
  id TEXT PRIMARY KEY, source_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL, company TEXT NOT NULL, role TEXT NOT NULL, location TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('applied','reply','interview','offer','rejected','withdrawn')),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','accepted','denied')),
  application_id TEXT REFERENCES applications(id),
  created_at TEXT NOT NULL
);
CREATE TABLE application_history (
  id INTEGER PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id),
  status TEXT NOT NULL,
  changed_at TEXT NOT NULL
);
