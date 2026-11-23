CREATE TABLE board_source_state (
  source_ref TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL CHECK(json_valid(data))
);

UPDATE projects SET data=json_set(data,'$.status','archived','$.archived_at',updated_at)
  WHERE json_extract(data,'$.status')='completed';
