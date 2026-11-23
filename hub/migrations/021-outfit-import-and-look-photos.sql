ALTER TABLE wardrobe_items ADD COLUMN brand TEXT NOT NULL DEFAULT '';
ALTER TABLE wardrobe_items ADD COLUMN model TEXT NOT NULL DEFAULT '';

CREATE TABLE outfit_look_photos (
  id TEXT PRIMARY KEY,
  look_id TEXT NOT NULL REFERENCES outfit_looks(id) ON DELETE CASCADE,
  photo BLOB NOT NULL,
  added_at TEXT NOT NULL
);
CREATE INDEX outfit_look_photos_by_look ON outfit_look_photos(look_id);
