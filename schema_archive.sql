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
create or replace view archive_months as
  select
    to_char(event_date, 'YYYY-MM') as month,
    count(*)::int as event_count
  from events
  group by 1;

grant select on archive_months to anon;

-- 4) Light list rows for the public pages: everything an event card shows,
--    with the (often multi-KB, often raw-HTML) description reduced to a
--    500-character plain-text excerpt. Cuts the homepage data payload by
--    roughly 10x; admin keeps reading the full events table.
create or replace view events_list as
  select
    id, title, permalink, path, venue, venue_url, address, map_url,
    event_date, image_url, tags, time_window, on_view_through, top_pick,
    left(regexp_replace(coalesce(description, ''), '<[^>]+>', ' ', 'g'), 500) as excerpt
  from events;

grant select on events_list to anon;
