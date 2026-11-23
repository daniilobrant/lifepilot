CREATE TABLE grocery_recipes (
  id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK(json_valid(data)), created_at TEXT NOT NULL
);
