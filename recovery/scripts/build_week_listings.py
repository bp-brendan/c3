#!/usr/bin/env python3
"""Generate This Week / Next Week listing sections for the c3 site.

Reads data/processed/events.ndjson and rewrites the block between
`<!-- listings:start -->` and `<!-- listings:end -->` in the target
index.html. Run after refreshing the extract:

    python3 scripts/build_week_listings.py [--today YYYY-MM-DD] [--site PATH]
"""

from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import re
from pathlib import Path

EVENTS_NDJSON = Path("data/processed/events.ndjson")
HOME_HTML = Path("data/raw/pages/home.html")  # refresh with curl before regenerating
TOP_PICKS = Path("data/processed/top_picks_2026.json")  # from badatsports TOP V. columns
DEFAULT_SITE = Path("/Users/brendan/Documents/c3/index.html")
MARKER_RE = re.compile(r"(<!-- listings:start[^>]*-->).*?(<!-- listings:end -->)", re.S)

MONTH_NUM = {m: i for i, m in enumerate(
    ["January", "February", "March", "April", "May", "June",
     "July", "August", "September", "October", "November", "December"], start=1)}


def week_bounds(today: dt.date) -> tuple[dt.date, dt.date, dt.date, dt.date]:
    monday = today - dt.timedelta(days=today.weekday())
    return monday, monday + dt.timedelta(days=6), monday + dt.timedelta(days=7), monday + dt.timedelta(days=13)


def ordinal(n: int) -> str:
    if 11 <= n % 100 <= 13:
        return f"{n}th"
    return f"{n}{ {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th') }"


def fmt(date_str: str) -> str:
    d = dt.date.fromisoformat(date_str)
    return d.strftime("%A, %B %-d")


def fmt_day_parts(date_str: str) -> tuple[str, str]:
    d = dt.date.fromisoformat(date_str)
    return d.strftime("%A"), f"{d.strftime('%B')} {ordinal(d.day)}"


def load_events() -> list[dict]:
    with EVENTS_NDJSON.open(encoding="utf-8") as f:
        return [json.loads(line) for line in f]


def parse_home_events(today: dt.date) -> list[dict]:
    """Future-dated posts aren't in sitemaps or REST yet; the old homepage's
    This Week section is the only public source for them."""
    if not HOME_HTML.exists():
        return []
    text = HOME_HTML.read_text(encoding="utf-8", errors="replace")
    events = []
    day = ""
    for chunk in re.split(r"<div id=['\"]event-index-date['\"]>", text)[1:]:
        m = re.search(r"<h2>([A-Za-z]+) (\d+)\w*</h2>", chunk)
        if m and m.group(1) in MONTH_NUM:
            month, dom = MONTH_NUM[m.group(1)], int(m.group(2))
            year = today.year + 1 if month < today.month - 6 else today.year
            day = f"{year}-{month:02d}-{dom:02d}"
        for block in re.split(r"<div id=['\"]event-index['\"]>", chunk)[1:]:
            title = re.search(r'<a class="title" href="([^"]+)"[^>]*>(.*?)</a>', block, re.S)
            if not title or not day:
                continue
            venue = re.search(r'<a class="venuelink" href="([^"]*)">(.*?)</a>', block, re.S)
            addr = re.search(r'<a href="http://maps\.google\.com/maps\?q=[^"]*"[^>]*>(.*?)</a>', block, re.S)
            thumb = re.search(r'<img[^>]+src="([^"]+)"', block)
            h2s = [re.sub(r"<[^>]+>", "", h).strip() for h in re.findall(r"<h2>(.*?)</h2>", block, re.S)]
            events.append({
                "title": html.unescape(re.sub(r"<[^>]+>", "", title.group(2)).strip()),
                "legacy_url": html.unescape(title.group(1)),
                "event_date": day,
                "venue_name": html.unescape(venue.group(2).strip()) if venue else "",
                "venue_url": html.unescape(venue.group(1)) if venue else "",
                "address": html.unescape(addr.group(1).strip()) if addr else "",
                "map_url": f"http://maps.google.com/maps?q={addr.group(1).strip()}" if addr else "",
                "opening_text": next((h for h in h2s if h.startswith("Opening")), ""),
                "on_view_text": next((h for h in h2s if h.startswith("On view")), ""),
                "images": [{"url": html.unescape(thumb.group(1))}] if thumb else [],
            })
    return events


def load_pick_ids() -> set[str]:
    if not TOP_PICKS.exists():
        return set()
    return {p["legacy_id"] for p in json.loads(TOP_PICKS.read_text(encoding="utf-8"))}


def event_legacy_id(event: dict) -> str:
    if event.get("legacy_id"):
        return event["legacy_id"]
    m = re.search(r"[?&]p=(\d+)", event.get("legacy_url", ""))
    return m.group(1) if m else ""


def pick_badge(event: dict, pick_ids: set[str]) -> str:
    if event_legacy_id(event) not in pick_ids:
        return ""
    return (' <a class="top-pick" href="tag.html?tag=top-pick"'
            ' target="_blank" rel="noopener">Top Pick</a>')


def listing_item(event: dict, meta: str, pick_ids: set[str] = frozenset()) -> str:
    title = html.escape(event.get("title") or "Untitled")
    url = html.escape(event.get("legacy_url") or event.get("source_url") or "#")
    venue = html.escape(event.get("venue_name", ""))
    meta = html.escape(meta)
    venue_part = f'<span class="listing-venue">{venue}</span>' if venue else ""
    return (
        f'        <li class="listing-item">\n'
        f'          <span><a class="listing-title" href="{url}">{title}</a>{pick_badge(event, pick_ids)}</span>\n'
        f'          {venue_part}<span class="listing-meta">{meta}</span>\n'
        f"        </li>"
    )


def event_card(event: dict, pick_ids: set[str] = frozenset()) -> str:
    url = html.escape(event.get("legacy_url") or event.get("source_url") or "#")
    title = html.escape(event.get("title") or "Untitled")
    images = event.get("images", [])
    thumb = html.escape(images[0]["url"]) if images else ""
    venue = html.escape(event.get("venue_name", ""))
    venue_url = html.escape(event.get("venue_url", ""))
    address = html.escape(event.get("address", ""))
    map_url = html.escape(event.get("map_url", ""))
    opening = html.escape(event.get("opening_text", ""))
    on_view = html.escape(event.get("on_view_text", ""))

    parts = ['      <article class="event-card">']
    if thumb:
        parts.append(f'        <a class="event-thumb" href="{url}"><img src="{thumb}" alt="" loading="lazy"></a>')
    else:
        parts.append('        <span class="event-thumb event-thumb-empty"></span>')
    parts.append('        <div class="event-info">')
    parts.append(f'          <h3 class="event-title"><a href="{url}">{title}</a>{pick_badge(event, pick_ids)}</h3>')
    if opening:
        parts.append(f'          <p class="event-when">{opening}</p>')
    if on_view:
        parts.append(f'          <p class="event-when">{on_view}</p>')
    if venue:
        venue_inner = f'<a href="{venue_url}">{venue}</a>' if venue_url else venue
        parts.append(f'          <p class="event-venue">@ {venue_inner}</p>')
    if address:
        address_inner = f'<a href="{map_url}">{address}</a>' if map_url else address
        parts.append(f'          <p class="event-address">{address_inner}</p>')
    parts.append('          <div class="event-liner"></div>')
    parts.append("        </div>")
    parts.append("      </article>")
    return "\n".join(parts)


def section_html(section_id: str, hidden: bool, openings: list[dict], on_view: list[dict],
                 pick_ids: set[str] = frozenset()) -> str:
    parts = [f'    <section class="view" id="{section_id}"{" hidden" if hidden else ""}>']
    if openings:
        by_day: dict[str, list[dict]] = {}
        for e in openings:
            by_day.setdefault(e["event_date"], []).append(e)
        for day in sorted(by_day):
            day_name, day_date = fmt_day_parts(day)
            parts.append('      <div class="event-date">')
            parts.append(f'        <span class="event-date-day">{day_name}</span>')
            parts.append(f'        <em class="event-date-num">{day_date}</em>')
            parts.append("      </div>")
            for e in by_day[day]:
                parts.append(event_card(e, pick_ids))
    else:
        parts.append('      <p class="view-empty">No openings posted yet — check back soon.</p>')
    if on_view:
        parts.append('      <h2 class="view-heading">On View</h2>')
        parts.append('      <ul class="listing">')
        for e in sorted(on_view, key=lambda e: e.get("on_view_until", "")):
            parts.append(listing_item(e, f'Through {fmt(e["on_view_until"])}', pick_ids))
        parts.append("      </ul>")
    parts.append("    </section>")
    return "\n".join(parts)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--today", type=dt.date.fromisoformat, default=dt.date.today())
    parser.add_argument("--site", type=Path, default=DEFAULT_SITE)
    args = parser.parse_args()

    this_lo, this_hi, next_lo, next_hi = week_bounds(args.today)
    events = load_events()

    # merge future-dated posts from the homepage, skipping ones the crawl has
    seen = {(e.get("title", "").strip().lower(), e.get("event_date", "")) for e in events}
    home_events = [e for e in parse_home_events(args.today)
                   if (e["title"].strip().lower(), e["event_date"]) not in seen]
    events += home_events
    print(f"merged {len(home_events)} future-dated events from the homepage")

    def openings(lo: dt.date, hi: dt.date) -> list[dict]:
        return [e for e in events if str(lo) <= e.get("event_date", "") <= str(hi)]

    def on_view(lo: dt.date, hi: dt.date) -> list[dict]:
        return [
            e for e in events
            if e.get("event_date", "") < str(lo)
            and str(lo) <= e.get("on_view_until", "") <= str(lo.replace(year=lo.year + 2))
        ]

    pick_ids = load_pick_ids()
    marked = sum(1 for e in events if event_legacy_id(e) in pick_ids)
    print(f"loaded {len(pick_ids)} top-pick ids; {marked} events carry the badge")

    block = "\n\n".join([
        # the as-is site lists only today onward; past days live in its archive
        section_html("view-this-week", False, openings(max(this_lo, args.today), this_hi), on_view(this_lo, this_hi), pick_ids),
        section_html("view-next-week", True, openings(next_lo, next_hi), on_view(next_lo, next_hi), pick_ids),
    ])

    page = args.site.read_text(encoding="utf-8")
    if not MARKER_RE.search(page):
        raise SystemExit(f"listings markers not found in {args.site}")
    page = MARKER_RE.sub(lambda m: f"{m.group(1)}\n{block}\n    {m.group(2)}", page)
    args.site.write_text(page, encoding="utf-8")
    print(
        f"this week ({this_lo}–{this_hi}): {len(openings(this_lo, this_hi))} openings, "
        f"{len(on_view(this_lo, this_hi))} on view | "
        f"next week ({next_lo}–{next_hi}): {len(openings(next_lo, next_hi))} openings, "
        f"{len(on_view(next_lo, next_hi))} on view"
    )


if __name__ == "__main__":
    main()
