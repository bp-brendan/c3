-- Run-once housekeeping + views for the archive and fast list loading.
-- Paste the whole file into the Supabase dashboard SQL editor and run it:
--   https://supabase.com/dashboard/project/avxlexkqcxamixyhyxcd/sql/new
-- Everything here is idempotent; running it twice is safe.

-- 1) Dedupe events: a double-run migration inserted every 2026 event twice.
--    The earlier pass is the good one (local events/... detail paths, clean
--    text); the later pass has raw-HTML descriptions and broken paths.
--    Delete the bad-pass row wherever a good twin (same title + date) exists.
delete from events bad
using events keep
where bad.id <> keep.id
  and bad.title = keep.title
  and bad.event_date = keep.event_date
  and keep.path like 'events/%'
  and (bad.path is null or bad.path not like 'events/%');

-- 2) Dedupe taglines (also doubled): keep the earliest row per content.
delete from taglines t
using taglines k
where t.content = k.content
  and t.created_at > k.created_at;

-- 3) Month index for the archive landing: one row per calendar month with
--    its event count, so the frontend can list every month back to the
--    calendar's beginnings without paging full event rows through the
--    1000-row response cap.
create or replace view archive_months with (security_invoker = true) as
  select
    to_char(event_date, 'YYYY-MM') as month,
    count(*)::int as event_count
  from events
  group by 1;

alter view archive_months set (security_invoker = true);

grant select on archive_months to anon;

-- 4) Series flags: an event posted once per session (opening, talk, closing)
--    shares a title, venue, and overlapping on-view run across dates. The
--    on_view_through text needs app-level date parsing/rollover logic, so
--    refresh these booleans after imports with:
--      cd scripts && npm run refresh-series-flags -- --write
alter table events add column if not exists series_first boolean;
alter table events add column if not exists series_last boolean;

-- 4b) On-view end date: the human "On view through Saturday, March 21st" text
--     needs the same app-level parse + year-rollover logic as the series
--     flags. Storing the resolved ISO date once lets the frontend filter and
--     cluster runs without re-parsing free text on every load. Backfill after
--     imports (rows left null fall back to the client parser) with:
--       cd scripts && npm run refresh-on-view-end -- --write
alter table events add column if not exists on_view_end date;

-- 5) Light list rows for the public pages: everything an event card shows,
--    with the (often multi-KB, often raw-HTML) description reduced to a
--    300-character plain-text excerpt (cards clamp to ~3 lines anyway), the
--    auxiliary link labels ("Official Website", "Original Listing") dropped.
--    Cuts the homepage data payload dramatically; admin keeps reading the
--    full events table. Dropped first: replace-view cannot add columns
--    anywhere but the end, and series_* sit before excerpt.
drop view if exists events_list;
create view events_list with (security_invoker = true) as
  select
    id, title, permalink, path, venue, venue_url, address, map_url,
    event_date, image_url, tags, time_window, on_view_through, on_view_end, top_pick,
    series_first, series_last,
    left(regexp_replace(
      regexp_replace(coalesce(description, ''), '<[^>]+>', ' ', 'g'),
      '\s*(Official Website|Original Listing)\s*', ' ', 'g'
    ), 300) as excerpt
  from events;

alter view events_list set (security_invoker = true);

grant select on events_list to anon;
