CREATE TABLE wardrobe_items (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, color TEXT NOT NULL,
  material TEXT NOT NULL, fit TEXT NOT NULL, season TEXT NOT NULL, tags TEXT NOT NULL, source TEXT NOT NULL,
  photo BLOB, mime TEXT
);
CREATE TABLE outfit_profile (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1), details TEXT NOT NULL, photo BLOB, mime TEXT
);
CREATE TABLE outfit_looks (
  id TEXT PRIMARY KEY, result TEXT NOT NULL, saved_at TEXT NOT NULL
);
CREATE TABLE outfit_demo_seed (singleton INTEGER PRIMARY KEY CHECK(singleton=1));
