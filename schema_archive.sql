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
--     (the trigger in 4c keeps it current automatically; the script is just
--      a dry-run auditor / fallback for setups without the trigger).
alter table events add column if not exists on_view_end date;

-- 4c) Keep on_view_end in sync automatically. parse_on_view_end resolves the
--     free-text on-view line to an ISO date, mirroring components.js onViewEnd
--     exactly: the year rolls over for a plausible span (a winter opening
--     closing in spring); a close 7+ months "later" is a scrape artifact, not
--     a real run; and a run can't close before it opens. A BEFORE trigger
--     recomputes it on every insert/update (admin edits + scraper imports), so
--     the value is always right in the DB and the frontend never has to parse.
create or replace function parse_on_view_end(txt text, base date)
  returns date
  language plpgsql
  immutable
as $$
declare
  m text[];
  mon int;
  base_month int;
  rolled boolean;
  yr int;
  result date;
begin
  if txt is null or base is null then
    return null;
  end if;
  m := regexp_match(txt, 'through\s+(?:[A-Za-z]+,\s*)?([A-Za-z]+)\s+(\d{1,2})', 'i');
  if m is null then
    return null;
  end if;
  mon := case lower(m[1])
    when 'january' then 1 when 'february' then 2 when 'march' then 3
    when 'april' then 4 when 'may' then 5 when 'june' then 6
    when 'july' then 7 when 'august' then 8 when 'september' then 9
    when 'october' then 10 when 'november' then 11 when 'december' then 12
    else null end;
  if mon is null then
    return null;
  end if;
  base_month := extract(month from base)::int;
  rolled := mon < base_month;
  if rolled and (12 - base_month + mon) > 6 then
    return null;  -- a close that "rolls" more than ~half a year is an artifact
  end if;
  yr := extract(year from base)::int + (case when rolled then 1 else 0 end);
  begin
    result := make_date(yr, mon, m[2]::int);
  exception when others then
    return null;  -- malformed day (e.g. "February 30th")
  end;
  if result < base then
    return null;  -- a run can't close before it opens
  end if;
  return result;
end;
$$;

create or replace function events_set_on_view_end()
  returns trigger
  language plpgsql
as $$
begin
  new.on_view_end := parse_on_view_end(new.on_view_through, new.event_date);
  return new;
end;
$$;

drop trigger if exists trg_events_on_view_end on events;
create trigger trg_events_on_view_end
  before insert or update of on_view_through, event_date on events
  for each row
  execute function events_set_on_view_end();

-- one-time backfill for rows that predate the trigger (idempotent; the
-- trigger maintains every write from here on)
update events
  set on_view_end = parse_on_view_end(on_view_through, event_date)
  where on_view_end is distinct from parse_on_view_end(on_view_through, event_date);

-- 4d) Categories metadata: Elevate visual art category tags into a dedicated column
alter table events add column if not exists categories text[];

update events
  set categories = array(
    select t from unnest(tags) as t 
    where lower(t) in ('photography', 'painting', 'performance', 'sculpture', 'installation', 'video', 'film', 'printmaking', 'drawing', 'architecture', 'collage', 'ceramics', 'design', 'new media', 'sound art', 'mixed media', 'animation', 'digital art', 'fiber art', 'illustration', 'jewelry', 'glass', 'watercolor', 'pottery', 'print', 'video art', 'performance art', 'graphic design')
  )
  where categories is null;

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
    event_date, image_url, tags, categories, time_window, on_view_through, on_view_end, top_pick,
    series_first, series_last,
    left(regexp_replace(
      regexp_replace(coalesce(description, ''), '<[^>]+>', ' ', 'g'),
      '\s*(Official Website|Original Listing)\s*', ' ', 'g'
    ), 300) as excerpt
  from events;

alter view events_list set (security_invoker = true);

grant select on events_list to anon;

-- 6) Notification config: who receives the "new submission" alert and the
--    editable subject/body copy for each notification email, edited in the
--    admin Settings tab and read by the Cloudflare Pages email functions.
--    Deliberately NOT on the public-readable settings table — recipient
--    addresses are admin-only, so this lives behind RLS: anon gets nothing,
--    signed-in admins read/write, and the email functions read it with the
--    service-role key (which bypasses RLS). Templates default to '{}'; the
--    functions fall back to built-in copy for any key not overridden.
create table if not exists email_settings (
  id                integer primary key default 1,
  notify_recipients jsonb default '["Visualistchicago@gmail.com"]'::jsonb,
  email_templates   jsonb default '{}'::jsonb
);
insert into email_settings (id) values (1) on conflict (id) do nothing;

-- if an earlier draft added these to the public settings table, remove them
alter table settings drop column if exists notify_recipients;
alter table settings drop column if exists email_templates;

alter table email_settings enable row level security;
drop policy if exists "Admins read email settings"   on email_settings;
drop policy if exists "Admins insert email settings" on email_settings;
drop policy if exists "Admins update email settings" on email_settings;
create policy "Admins read email settings"   on email_settings for select using (auth.role() = 'authenticated');
create policy "Admins insert email settings" on email_settings for insert with check (auth.role() = 'authenticated');
create policy "Admins update email settings" on email_settings for update using (auth.role() = 'authenticated');
