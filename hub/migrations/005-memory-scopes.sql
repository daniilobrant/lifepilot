CREATE TABLE memory_v5 (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  source TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('lifepilot','owner','trinity-probe')),
  reader TEXT NOT NULL,
  writer TEXT NOT NULL CHECK (writer = 'owner'),
  status TEXT NOT NULL CHECK (status IN ('verified','revoked','superseded')),
  created_at TEXT NOT NULL,
  expires_at TEXT,
  replaces TEXT REFERENCES memory_v5(id),
  synthetic INTEGER NOT NULL DEFAULT 0 CHECK (synthetic IN (0,1))
) STRICT;

INSERT INTO memory_v5 SELECT * FROM memory ORDER BY rowid;
DROP TABLE memory;
ALTER TABLE memory_v5 RENAME TO memory;
CREATE INDEX memory_scope ON memory(scope, status, created_at);
