CREATE TABLE news_briefing (
  id INTEGER PRIMARY KEY CHECK (id=1),
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE news_preferences (
  id INTEGER PRIMARY KEY CHECK (id=1),
  data TEXT NOT NULL
) STRICT;
