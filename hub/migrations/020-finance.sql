CREATE TABLE finance_entries (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('income','fixed','subscription','expense')),
  month TEXT NOT NULL,
  until_month TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL CHECK (json_valid(data))
);
CREATE INDEX finance_month_idx ON finance_entries (month, until_month);
CREATE TABLE finance_settings (
  singleton INTEGER PRIMARY KEY CHECK (singleton=1),
  revision INTEGER NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data))
);
CREATE TABLE finance_chat_changes (
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  turn INTEGER NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data)),
  PRIMARY KEY (run_id, turn)
);
