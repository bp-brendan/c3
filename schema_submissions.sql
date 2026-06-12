-- Submissions queue for the public Add Event form (submit.html).
-- Run this once in the Supabase SQL editor (DDL needs more than the
-- publishable key the site ships with). Safe to re-run: idempotent.
--
-- Columns are snake_case to match the events table and the mappers in
-- components.js (submissionToRow / submissionFromRow). The id is the client
-- generated "sub-..." string, so it is TEXT, not UUID. Date columns are
-- nullable because a submission may give an opening date but no run, or a run
-- but no opening (see thevisualist.org/info for the event-vs-exhibition rules).

CREATE TABLE IF NOT EXISTS submissions (
  id               TEXT PRIMARY KEY,
  status           TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | passed | draft | scheduled
  source_url       TEXT,
  title            TEXT,
  artists          TEXT,                             -- comma-joined
  venue            TEXT,
  venue_url        TEXT,
  address          TEXT,
  map_url          TEXT,
  neighborhood     TEXT,
  listing_type     TEXT,                             -- event | exhibition
  event_date       DATE,                             -- the event / opening reception day
  event_start      TEXT,                             -- free text, e.g. "5PM"
  event_end        TEXT,
  exhibition_start DATE,                             -- run start (exhibitions)
  exhibition_end   DATE,                             -- run end -> "On view through ..."
  on_view_text     TEXT,
  image_url        TEXT,                             -- detected URL or base64 data URL
  image_name       TEXT,
  detail_url       TEXT,
  description      TEXT,
  contact_email    TEXT,
  tags             TEXT,                             -- comma-joined
  submitted_at     TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ,
  approved_at      TIMESTAMPTZ,
  passed_at        TIMESTAMPTZ,
  publish_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Catch up tables created from an earlier draft of this file.
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS neighborhood TEXT;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS map_url      TEXT;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS on_view_text TEXT;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS approved_at  TIMESTAMPTZ;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS passed_at    TIMESTAMPTZ;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS publish_at   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS submissions_status_idx
  ON submissions (status, created_at DESC);

-- Row-Level Security: the public may submit; only signed-in admins may read,
-- edit (approve/pass), or delete.
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can submit an event"  ON submissions;
DROP POLICY IF EXISTS "Admins can view submissions"  ON submissions;
DROP POLICY IF EXISTS "Admins can update submissions" ON submissions;
DROP POLICY IF EXISTS "Admins can delete submissions" ON submissions;

CREATE POLICY "Anyone can submit an event"
  ON submissions FOR INSERT WITH CHECK ( true );

CREATE POLICY "Admins can view submissions"
  ON submissions FOR SELECT USING ( auth.role() = 'authenticated' );

CREATE POLICY "Admins can update submissions"
  ON submissions FOR UPDATE USING ( auth.role() = 'authenticated' );

CREATE POLICY "Admins can delete submissions"
  ON submissions FOR DELETE USING ( auth.role() = 'authenticated' );
