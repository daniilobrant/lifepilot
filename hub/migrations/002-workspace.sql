ALTER TABLE runs ADD COLUMN context_snapshot TEXT NOT NULL DEFAULT '[]';
ALTER TABLE runs ADD COLUMN synthetic INTEGER NOT NULL DEFAULT 0 CHECK(synthetic IN (0, 1));
ALTER TABLE runs ADD COLUMN reference_day TEXT;
ALTER TABLE memory ADD COLUMN synthetic INTEGER NOT NULL DEFAULT 0 CHECK(synthetic IN (0, 1));

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES runs(id),
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  due_date TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('task','appointment')),
  priority TEXT NOT NULL CHECK (priority IN ('low','normal','high')),
  status TEXT NOT NULL CHECK (status IN ('open','done','archived')),
  steps TEXT NOT NULL,
  related_id TEXT REFERENCES tasks(id),
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX tasks_due ON tasks(status, due_date);

CREATE TABLE task_events (
  id INTEGER PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  actor TEXT NOT NULL,
  event TEXT NOT NULL,
  at TEXT NOT NULL
) STRICT;

CREATE TABLE schedule (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  kind TEXT NOT NULL CHECK(kind IN ('slot','reminder')),
  at TEXT NOT NULL,
  ends_at TEXT,
  state TEXT NOT NULL CHECK(state IN ('pending','ready','dismissed')),
  UNIQUE (task_id, kind, at)
) STRICT;
CREATE INDEX schedule_pending ON schedule(kind, state, at);
