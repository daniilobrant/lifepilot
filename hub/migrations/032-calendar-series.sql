CREATE TABLE calendar_series (
  task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  definition TEXT NOT NULL CHECK(json_valid(definition))
);
CREATE TABLE calendar_series_changes (
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  turn INTEGER NOT NULL,
  data TEXT NOT NULL CHECK(json_valid(data)),
  PRIMARY KEY(run_id, turn)
);
