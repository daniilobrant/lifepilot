ALTER TABLE runs ADD COLUMN source_note TEXT CHECK(source_note IS NULL OR (json_valid(source_note) AND json_type(source_note)='object'));
