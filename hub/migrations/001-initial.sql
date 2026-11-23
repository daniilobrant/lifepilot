CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  agent TEXT NOT NULL,
  version TEXT NOT NULL,
  input TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('ui','cli')),
  state TEXT NOT NULL CHECK (state IN ('permission','queued','running','review','accepted','denied','cancelled','failed')),
  memory_snapshot TEXT NOT NULL,
  result TEXT,
  error TEXT,
  metrics TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  action TEXT NOT NULL CHECK (action IN ('model','adopt')),
  digest TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending','approved','denied','revoked','expired')),
  expires_at TEXT NOT NULL,
  decided_at TEXT,
  decided_via TEXT,
  UNIQUE (run_id, action)
) STRICT;

CREATE TABLE memory (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  source TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('lifepilot','owner')),
  reader TEXT NOT NULL,
  writer TEXT NOT NULL CHECK (writer = 'owner'),
  status TEXT NOT NULL CHECK (status IN ('verified','revoked','superseded')),
  created_at TEXT NOT NULL,
  expires_at TEXT,
  replaces TEXT REFERENCES memory(id)
) STRICT;
CREATE INDEX memory_scope ON memory(scope, status, created_at);
CREATE INDEX runs_state ON runs(state, created_at);

CREATE TABLE improvements (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('ui','cli')),
  created_at TEXT NOT NULL
) STRICT;
