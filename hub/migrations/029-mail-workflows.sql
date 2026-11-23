CREATE TABLE gmail_categorization (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  account TEXT NOT NULL,
  after_epoch INTEGER NOT NULL,
  before_epoch INTEGER,
  page_token TEXT
);

CREATE TABLE gmail_finance_suggestions (
  id TEXT PRIMARY KEY,
  account TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  draft TEXT NOT NULL CHECK(json_valid(draft)),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','accepted','denied')),
  entry_id TEXT REFERENCES finance_entries(id) ON DELETE SET NULL,
  UNIQUE(account,fingerprint)
);
