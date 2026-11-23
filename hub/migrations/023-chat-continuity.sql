ALTER TABLE runs ADD COLUMN previous_run TEXT REFERENCES runs(id);
ALTER TABLE runs ADD COLUMN conversation_context TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(conversation_context));
ALTER TABLE runs ADD COLUMN parent_run TEXT REFERENCES runs(id);
CREATE INDEX runs_by_parent ON runs(parent_run);
