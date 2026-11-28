CREATE TABLE depot_news (
  id INTEGER PRIMARY KEY CHECK (id=1),
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
