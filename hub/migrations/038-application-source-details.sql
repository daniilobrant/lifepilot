ALTER TABLE application_sources ADD COLUMN salary TEXT NOT NULL DEFAULT '';
ALTER TABLE application_sources ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE application_sources ADD COLUMN notes TEXT NOT NULL DEFAULT '';
ALTER TABLE application_sources ADD COLUMN link TEXT NOT NULL DEFAULT '';
ALTER TABLE application_sources ADD COLUMN applied_on TEXT;
ALTER TABLE application_sources ADD COLUMN follow_up TEXT;
