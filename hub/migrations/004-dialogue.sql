CREATE TABLE followups (
  idempotency_key TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  turn INTEGER NOT NULL CHECK (turn > 0),
  input TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('ui', 'cli')),
  reference_day TEXT NOT NULL,
  previous_result TEXT,
  share_previous INTEGER NOT NULL CHECK (share_previous IN (0, 1)),
  previous_approvals TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(run_id, turn)
) STRICT;
