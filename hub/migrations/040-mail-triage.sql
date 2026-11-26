CREATE TABLE mail_triage (
  source_key TEXT PRIMARY KEY,
  account TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('meeting','deadline','important','irrelevant')),
  summary TEXT NOT NULL DEFAULT '',
  checked_at TEXT NOT NULL
) STRICT;
