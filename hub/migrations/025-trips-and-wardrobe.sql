CREATE TABLE trip_google_events (
  trip_id TEXT PRIMARY KEY REFERENCES trips(id),
  event_id TEXT
);

CREATE TABLE trip_previews (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  expires TEXT NOT NULL
);

ALTER TABLE wardrobe_items ADD COLUMN size TEXT NOT NULL DEFAULT '';
ALTER TABLE wardrobe_items ADD COLUMN garment_type TEXT NOT NULL DEFAULT '';
