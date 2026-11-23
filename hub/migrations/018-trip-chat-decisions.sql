CREATE TABLE trip_chat_decisions (
  run_id TEXT NOT NULL REFERENCES runs(id), turn INTEGER NOT NULL, approved INTEGER NOT NULL CHECK(approved IN (0,1)),
  PRIMARY KEY(run_id, turn)
);
