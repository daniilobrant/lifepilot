CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL CHECK(json_valid(data)),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE project_email_suggestions (
  id TEXT PRIMARY KEY,
  account TEXT NOT NULL,
  message_key TEXT NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  data TEXT NOT NULL CHECK(json_valid(data)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','denied')),
  UNIQUE(account,message_key)
);
CREATE INDEX project_email_suggestions_status ON project_email_suggestions(status,project_id);
CREATE TABLE project_chat_changes (
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  turn INTEGER NOT NULL,
  data TEXT NOT NULL CHECK(json_valid(data)),
  PRIMARY KEY (run_id,turn)
);
