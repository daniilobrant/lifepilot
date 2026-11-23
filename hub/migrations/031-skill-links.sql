CREATE TABLE skill_approvals (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  actions TEXT NOT NULL CHECK(json_valid(actions)),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','applied','discarded')),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  decided_at TEXT,
  applied_actions TEXT CHECK(applied_actions IS NULL OR json_valid(applied_actions)),
  UNIQUE(source,source_ref)
);
CREATE INDEX skill_approvals_state ON skill_approvals(state,created_at);
CREATE TABLE skill_permission_rules (
  target TEXT PRIMARY KEY,
  rule TEXT NOT NULL CHECK(rule IN ('auto','confirm','locked'))
);
CREATE TABLE processed_message_ids (
  account TEXT NOT NULL,
  message_id TEXT NOT NULL,
  intent TEXT NOT NULL,
  approval_id TEXT REFERENCES skill_approvals(id),
  status TEXT NOT NULL CHECK(status IN ('pending','applied','discarded','ignored')),
  PRIMARY KEY(account,message_id)
);
CREATE TABLE skill_wardrobe_availability (
  item_id TEXT PRIMARY KEY REFERENCES wardrobe_items(id) ON DELETE CASCADE
);

CREATE TABLE skill_calendar_candidates (
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  PRIMARY KEY(title,date)
);

ALTER TABLE clothing_orders ADD COLUMN return_window_days INTEGER CHECK(return_window_days BETWEEN 1 AND 365);
ALTER TABLE clothing_order_items ADD COLUMN product_photo BLOB;
