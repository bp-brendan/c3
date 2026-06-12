-- Month index for the archive landing: one row per calendar month with its
-- event count, so the frontend can list every month back to the calendar's
-- beginnings without paging full event rows through the 1000-row cap.
-- Run this in the Supabase SQL editor (same as schema_settings.sql).
create or replace view archive_months as
  select
    to_char(event_date, 'YYYY-MM') as month,
    count(*)::int as event_count
  from events
  group by 1;

grant select on archive_months to anon;
