CREATE TABLE inbox_proposals (
  id TEXT PRIMARY KEY,
  source_key TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('deadlines','returns','orders','appointments')),
  evidence TEXT NOT NULL,
  due_date TEXT,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','accepted','denied')),
  task_id TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT,
  decided_via TEXT
);
