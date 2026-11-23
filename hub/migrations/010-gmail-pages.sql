CREATE TABLE gmail_pages (
  account_key TEXT PRIMARY KEY,
  page_token TEXT NOT NULL,
  after_epoch INTEGER NOT NULL,
  saved_at INTEGER NOT NULL
);
