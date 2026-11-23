ALTER TABLE tasks ADD COLUMN completed_at TEXT;
UPDATE tasks SET completed_at=updated_at WHERE status='done';

CREATE TABLE personal_profile (
  singleton INTEGER PRIMARY KEY CHECK (singleton=1),
  details TEXT NOT NULL,
  revision INTEGER NOT NULL
);
