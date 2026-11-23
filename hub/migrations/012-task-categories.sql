ALTER TABLE tasks ADD COLUMN category TEXT CHECK(category IN ('work','university','leisure'));
