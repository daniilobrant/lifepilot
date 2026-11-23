ALTER TABLE wardrobe_items ADD COLUMN photo_origin TEXT NOT NULL DEFAULT 'unknown'
  CHECK(photo_origin IN ('own','web','unknown'));

CREATE TABLE wardrobe_sales (
  wardrobe_id TEXT PRIMARY KEY REFERENCES wardrobe_items(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK(state IN ('selling','sold','sorted')),
  condition TEXT NOT NULL DEFAULT '',
  flaws TEXT NOT NULL DEFAULT '',
  original_price INTEGER,
  created TEXT NOT NULL,
  sold TEXT
);

CREATE TABLE wardrobe_travel (
  trip_id TEXT NOT NULL REFERENCES trips(id),
  wardrobe_id TEXT NOT NULL REFERENCES wardrobe_items(id) ON DELETE CASCADE,
  PRIMARY KEY(trip_id,wardrobe_id)
);

CREATE TABLE wardrobe_fragrances (
  id TEXT PRIMARY KEY,
  details TEXT NOT NULL,
  photo BLOB NOT NULL,
  mime TEXT NOT NULL
);
