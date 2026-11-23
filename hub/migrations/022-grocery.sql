CREATE TABLE grocery_stock (
  id TEXT PRIMARY KEY, key TEXT UNIQUE NOT NULL, data TEXT NOT NULL CHECK(json_valid(data))
);
CREATE TABLE grocery_shopping (
  id TEXT PRIMARY KEY, key TEXT UNIQUE NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)),
  checked INTEGER NOT NULL DEFAULT 0 CHECK(checked IN (0,1))
);
CREATE TABLE grocery_recent (
  key TEXT PRIMARY KEY, data TEXT NOT NULL CHECK(json_valid(data)), purchased_at TEXT NOT NULL
);
CREATE TABLE grocery_chat (
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  turn INTEGER NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)), PRIMARY KEY(run_id,turn)
);
CREATE TABLE grocery_receipts (
  operation TEXT PRIMARY KEY, digest TEXT NOT NULL
);
