CREATE TABLE mail_label_overrides (
  account TEXT NOT NULL,
  message_id TEXT NOT NULL,
  label TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  PRIMARY KEY (account, message_id)
) STRICT;
