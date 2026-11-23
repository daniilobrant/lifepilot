ALTER TABLE google_appointment_sync ADD COLUMN pending_op TEXT CHECK(pending_op IN ('update','remove'));
ALTER TABLE google_appointment_sync ADD COLUMN old_title TEXT;
ALTER TABLE google_appointment_sync ADD COLUMN old_start TEXT;
ALTER TABLE google_appointment_sync ADD COLUMN old_end TEXT;
ALTER TABLE google_appointment_sync ADD COLUMN removed INTEGER NOT NULL DEFAULT 0 CHECK(removed IN (0,1));
