CREATE TABLE proposal_history (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  approval_id TEXT NOT NULL,
  digest TEXT NOT NULL,
  result TEXT NOT NULL,
  actor TEXT NOT NULL,
  changed_at TEXT NOT NULL
) STRICT;
