#!/usr/bin/env python3
"""Extract public The Visualist content into migration-friendly files."""

from __future__ import annotations

import argparse
import csv
import hashlib
import html
from html.parser import HTMLParser
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path


BASE_URL = "https://thevisualist.org"
SITEMAP_INDEX = f"{BASE_URL}/sitemap_index.xml"
DATA_DIR = Path("data")
RAW_HTML_DIR = DATA_DIR / "raw" / "html"
RAW_MEDIA_DIR = DATA_DIR / "raw" / "media"
PROCESSED_DIR = DATA_DIR / "processed"
DISCOVERED_CSV = DATA_DIR / "discovered_urls.csv"
USER_AGENT = "VisualistMigrationToolkit/0.1 (+https://thevisualist.org/)"


MONTHS = {
    "january": "01",
    "february": "02",
    "march": "03",
    "april": "04",
    "may": "05",
    "june": "06",
    "july": "07",
    "august": "08",
    "september": "09",
    "october": "10",
    "november": "11",
    "december": "12",
}


@dataclass
class FetchResult:
    url: str
    body: str
    final_url: str
    status: int | None


class TextLinksParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.text_parts: list[str] = []
        self.links: list[dict[str, str]] = []
        self.images: list[dict[str, str]] = []
        self.meta: dict[str, str] = {}
        self.current_link: dict[str, str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_dict = {k.lower(): v or "" for k, v in attrs}
        if tag in {"p", "div", "h1", "h2", "h3", "h4", "h5", "li", "br"}:
            self.text_parts.append("\n")
        if tag == "a":
            self.current_link = {
                "href": attrs_dict.get("href", ""),
                "rel": attrs_dict.get("rel", ""),
                "class": attrs_dict.get("class", ""),
                "text": "",
            }
        elif tag == "img":
            self.images.append({
                "src": attrs_dict.get("src", ""),
                "srcset": attrs_dict.get("srcset", ""),
                "alt": attrs_dict.get("alt", ""),
                "width": attrs_dict.get("width", ""),
                "height": attrs_dict.get("height", ""),
                "class": attrs_dict.get("class", ""),
            })
        elif tag == "meta":
            key = attrs_dict.get("property") or attrs_dict.get("name")
            if key and "content" in attrs_dict:
                self.meta[key] = attrs_dict["content"]

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self.current_link:
            self.current_link["text"] = squash_ws(self.current_link["text"])
            self.links.append(self.current_link)
            self.current_link = None
        if tag in {"p", "div", "h1", "h2", "h3", "h4", "h5", "li"}:
            self.text_parts.append("\n")

    def handle_data(self, data: str) -> None:
        self.text_parts.append(data)
        if self.current_link is not None:
            self.current_link["text"] += data

    @property
    def text(self) -> str:
        return squash_lines("".join(self.text_parts))


def ensure_dirs() -> None:
    RAW_HTML_DIR.mkdir(parents=True, exist_ok=True)
    RAW_MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)


def fetch_url(url: str, timeout: int = 30) -> FetchResult:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
        charset = resp.headers.get_content_charset() or "utf-8"
        return FetchResult(
            url=url,
            body=raw.decode(charset, errors="replace"),
            final_url=resp.geturl(),
            status=getattr(resp, "status", None),
        )


def fetch_bytes(url: str, timeout: int = 45) -> tuple[bytes, str]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read(), resp.headers.get("content-type", "")


def safe_fetch(url: str, attempts: int = 3, sleep_seconds: float = 0.75) -> FetchResult:
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            return fetch_url(url)
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_error = exc
            if attempt < attempts:
                time.sleep(sleep_seconds * attempt)
    raise RuntimeError(f"failed to fetch {url}: {last_error}") from last_error


def parse_xml_locs(xml_text: str) -> list[str]:
    root = ET.fromstring(xml_text)
    locs: list[str] = []
    for elem in root.iter():
        if elem.tag.endswith("loc") and elem.text:
            locs.append(elem.text.strip())
    return locs


def parse_sitemap_urls(xml_text: str, sitemap_url: str) -> list[dict[str, str]]:
    root = ET.fromstring(xml_text)
    urls: list[dict[str, str]] = []
    for url_elem in [e for e in root.iter() if e.tag.endswith("url")]:
        loc = ""
        lastmod = ""
        images: list[str] = []
        for child in url_elem:
            if child.tag.endswith("loc") and child.text:
                loc = child.text.strip()
            elif child.tag.endswith("lastmod") and child.text:
                lastmod = child.text.strip()
            elif child.tag.endswith("image"):
                for image_child in child:
                    if image_child.tag.endswith("loc") and image_child.text:
                        images.append(image_child.text.strip())
        if loc and loc != BASE_URL + "/":
            urls.append({
                "url": loc,
                "lastmod": lastmod,
                "sitemap": sitemap_url,
                "sitemap_images": "|".join(images),
            })
    return urls


def discover(limit_sitemaps: int | None = None) -> None:
    ensure_dirs()
    index = safe_fetch(SITEMAP_INDEX).body
    sitemap_urls = [u for u in parse_xml_locs(index) if "/post-sitemap" in u]
    if limit_sitemaps:
        sitemap_urls = sitemap_urls[:limit_sitemaps]

    rows: list[dict[str, str]] = []
    for idx, sitemap_url in enumerate(sitemap_urls, start=1):
        print(f"[discover] {idx}/{len(sitemap_urls)} {sitemap_url}", file=sys.stderr)
        xml_text = safe_fetch(sitemap_url).body
        rows.extend(parse_sitemap_urls(xml_text, sitemap_url))
        time.sleep(0.1)

    deduped = {row["url"]: row for row in rows}
    sorted_rows = sorted(deduped.values(), key=lambda r: r.get("lastmod", ""), reverse=True)
    with DISCOVERED_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["url", "lastmod", "sitemap", "sitemap_images"])
        writer.writeheader()
        writer.writerows(sorted_rows)
    print(f"[discover] wrote {len(sorted_rows)} URLs to {DISCOVERED_CSV}")


def cache_path_for_url(url: str) -> Path:
    parsed = urllib.parse.urlparse(url)
    slug = parsed.path.strip("/").replace("/", "__") or "home"
    digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:10]
    return RAW_HTML_DIR / f"{slug}__{digest}.html"


def read_discovered_urls() -> list[dict[str, str]]:
    if not DISCOVERED_CSV.exists():
        raise SystemExit(f"{DISCOVERED_CSV} missing. Run discover first.")
    with DISCOVERED_CSV.open("r", newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def extract_json_ld(page_html: str) -> dict:
    scripts = re.findall(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        page_html,
        flags=re.I | re.S,
    )
    for script in scripts:
        try:
            data = json.loads(html.unescape(script.strip()))
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict) and "@graph" in data:
            return data
    return {}


def graph_items(json_ld: dict) -> list[dict]:
    graph = json_ld.get("@graph", [])
    return [item for item in graph if isinstance(item, dict)]


def first_graph_item(json_ld: dict, item_type: str) -> dict:
    for item in graph_items(json_ld):
        typ = item.get("@type")
        if typ == item_type or (isinstance(typ, list) and item_type in typ):
            return item
    return {}


def get_meta(page_html: str) -> dict[str, str]:
    parser = TextLinksParser()
    parser.feed(page_html)
    return parser.meta


def find_block(page_html: str, start_pattern: str, end_pattern: str) -> str:
    start = re.search(start_pattern, page_html, flags=re.I | re.S)
    if not start:
        return ""
    end = re.search(end_pattern, page_html[start.start():], flags=re.I | re.S)
    if not end:
        return page_html[start.start():]
    return page_html[start.start(): start.start() + end.start()]


def strip_tags(fragment: str) -> str:
    parser = TextLinksParser()
    parser.feed(fragment)
    return parser.text


def squash_ws(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(value or "")).strip()


def squash_lines(value: str) -> str:
    lines = [squash_ws(line) for line in html.unescape(value or "").splitlines()]
    return "\n".join(line for line in lines if line)


def clean_html(fragment: str) -> str:
    fragment = re.sub(r'<div class="nav-top">.*?</div>', "", fragment, flags=re.I | re.S)
    fragment = re.sub(r'<h3><a href="/?\?m=.*?</h3>', "", fragment, flags=re.I | re.S)
    fragment = re.sub(r'<h3>\s*Tags:.*?</h3>', "", fragment, flags=re.I | re.S)
    fragment = re.sub(r'<div class="fb">.*?</div>\s*</div>', "", fragment, flags=re.I | re.S)
    return fragment.strip()


def extract_links(fragment: str) -> list[dict[str, str]]:
    parser = TextLinksParser()
    parser.feed(fragment)
    return parser.links


def extract_images(fragment: str) -> list[dict[str, str]]:
    parser = TextLinksParser()
    parser.feed(fragment)
    return parser.images


def absolute_url(url: str) -> str:
    return urllib.parse.urljoin(BASE_URL, html.unescape(url or ""))


def parse_post_id(canonical: str, page_html: str) -> str:
    match = re.search(r"[?&]p=(\d+)", canonical or "")
    if match:
        return match.group(1)
    match = re.search(r"postid-(\d+)", page_html)
    if match:
        return match.group(1)
    match = re.search(r"/wp/v2/posts/(\d+)", page_html)
    return match.group(1) if match else ""


def parse_opening_date(opening_text: str, published: str) -> str:
    match = re.search(r"Opening\s+\w+,\s+([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?", opening_text)
    year = published[:4] if published else ""
    if match and year:
        month = MONTHS.get(match.group(1).lower())
        if month:
            return f"{year}-{month}-{int(match.group(2)):02d}"
    if published:
        return published[:10]
    return ""


def parse_on_view_until(on_view_text: str, published: str) -> str:
    match = re.search(r"through\s+\w+,\s+([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?", on_view_text)
    if not match or not published:
        return ""
    start_year = int(published[:4])
    start_month = int(published[5:7]) if len(published) >= 7 else 1
    month = MONTHS.get(match.group(1).lower())
    if not month:
        return ""
    month_int = int(month)
    year = start_year + 1 if month_int < start_month - 6 else start_year
    return f"{year}-{month}-{int(match.group(2)):02d}"


def parse_time_range(opening_text: str) -> dict[str, str]:
    text = opening_text.replace(".", "").replace("p m", "PM").replace("a m", "AM")
    text = re.sub(r"\s+", " ", text)
    match = re.search(
        r"(?:from|at)\s+([0-9]{1,2}(?::[0-9]{2})?\s*(?:AM|PM|am|pm)?)"
        r"(?:\s*[-–]\s*([0-9]{1,2}(?::[0-9]{2})?\s*(?:AM|PM|am|pm)?))?",
        text,
    )
    if not match:
        return {"opening_start_time_raw": "", "opening_end_time_raw": ""}
    return {
        "opening_start_time_raw": squash_ws(match.group(1)),
        "opening_end_time_raw": squash_ws(match.group(2) or ""),
    }


def parse_event(page_html: str, source_url: str, sitemap_lastmod: str = "") -> dict:
    meta = get_meta(page_html)
    json_ld = extract_json_ld(page_html)
    article = first_graph_item(json_ld, "Article")
    webpage = first_graph_item(json_ld, "WebPage")
    canonical = meta.get("og:url") or webpage.get("url") or ""
    post_id = parse_post_id(canonical, page_html)

    event_block = find_block(page_html, r'<div\s+id=["\']event-index["\']', r'<div\s+class=["\']event-single-comments["\']')
    info_block = find_block(event_block, r'<div\s+class=["\']event-single-info["\']', r'<div\s+class=["\']fb["\']')
    body_block = find_block(event_block, r'<div\s+class=["\']event-single-body["\']', r'<div\s+class=["\']event-single-image["\']')
    image_block = find_block(event_block, r'<div\s+class=["\']event-single-image["\']', r'<div\s+class=["\']event-single-comments["\']')

    info_text = strip_tags(info_block)
    body_html = clean_html(body_block)
    body_text = strip_tags(body_html)
    info_links = extract_links(info_block)
    body_links = extract_links(body_html)
    image_tags = extract_images(image_block)

    title_match = re.search(r'<a[^>]+class=["\']title["\'][^>]*>(.*?)</a>', info_block, flags=re.I | re.S)
    title = strip_tags(title_match.group(1)) if title_match else article.get("headline", "")

    venue_link = next((l for l in info_links if "venuelink" in l.get("class", "")), {})
    map_link = next((l for l in info_links if "maps.google" in l.get("href", "")), {})
    h2_texts = [strip_tags(x) for x in re.findall(r"<h2[^>]*>(.*?)</h2>", info_block, flags=re.I | re.S)]
    opening_text = next((t for t in h2_texts if t.lower().startswith("opening ")), "")
    on_view_text = next((t for t in h2_texts if t.lower().startswith("on view through")), "")
    time_bits = parse_time_range(opening_text)

    tag_links = [l for l in extract_links(body_block) if l.get("rel") == "tag"]
    official = next((l for l in body_links if l.get("text") == "Official Website"), {})
    body_external_links = [
        {"text": l["text"], "href": absolute_url(l["href"])}
        for l in body_links
        if l.get("href") and not l.get("href", "").startswith("/?m=") and l.get("text") != "Official Website"
    ]

    bg_images = re.findall(r"background-image:\s*url\(['\"]?([^'\")]+)", event_block, flags=re.I)
    images = []
    for src in [meta.get("og:image", ""), article.get("thumbnailUrl", ""), *bg_images]:
        if src:
            images.append({"url": absolute_url(src), "role": "featured", "alt": "", "width": "", "height": ""})
    for img in image_tags:
        if img.get("src"):
            images.append({
                "url": absolute_url(img["src"]),
                "role": "body",
                "alt": img.get("alt", ""),
                "width": img.get("width", ""),
                "height": img.get("height", ""),
                "srcset": img.get("srcset", ""),
            })
    seen_images = set()
    deduped_images = []
    for image in images:
        if image["url"] not in seen_images:
            seen_images.add(image["url"])
            deduped_images.append(image)

    published = article.get("datePublished") or meta.get("article:published_time", "")
    opening_date = parse_opening_date(opening_text, published)
    on_view_until = parse_on_view_until(on_view_text, published)
    legacy_urls = sorted(set(filter(None, [source_url, canonical, webpage.get("url", "")])))

    slug = urllib.parse.urlparse(source_url).path.strip("/").split("/")[-1]
    return {
        "legacy_id": post_id,
        "legacy_url": canonical or source_url,
        "source_url": source_url,
        "legacy_urls": legacy_urls,
        "slug": slug,
        "title": squash_ws(title),
        "published_at": published,
        "modified_at": sitemap_lastmod,
        "event_date": opening_date,
        "opening_text": opening_text,
        "opening_start_time_raw": time_bits["opening_start_time_raw"],
        "opening_end_time_raw": time_bits["opening_end_time_raw"],
        "on_view_text": on_view_text,
        "on_view_until": on_view_until,
        "venue_name": venue_link.get("text", ""),
        "venue_url": absolute_url(venue_link.get("href", "")) if venue_link.get("href") else "",
        "address": map_link.get("text", ""),
        "map_url": absolute_url(map_link.get("href", "")) if map_link.get("href") else "",
        "description_html": body_html,
        "description_text": body_text,
        "official_url": absolute_url(official.get("href", "")) if official.get("href") else "",
        "body_links": body_external_links,
        "categories": article.get("articleSection", []) if isinstance(article.get("articleSection"), list) else [],
        "tags": [l["text"] for l in tag_links] or article.get("keywords", []),
        "images": deduped_images,
        "author": (article.get("author") or {}).get("name", "") if isinstance(article.get("author"), dict) else meta.get("author", ""),
        "yoast_description": meta.get("og:description", ""),
        "parse_warnings": parse_warnings(event_block, title, body_text),
    }


def parse_warnings(event_block: str, title: str, body_text: str) -> list[str]:
    warnings = []
    if not event_block:
        warnings.append("missing_event_index")
    if not squash_ws(title):
        warnings.append("missing_title")
    if not squash_ws(body_text):
        warnings.append("missing_body")
    return warnings


def likely_new_path(event: dict) -> str:
    if event.get("event_date") and event.get("slug"):
        year, month, _day = event["event_date"].split("-")
        return f"/events/{year}/{month}/{event['slug']}/"
    if event.get("slug"):
        return f"/events/{event['slug']}/"
    return ""


def write_outputs(events: list[dict], errors: list[dict]) -> None:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    with (PROCESSED_DIR / "events.ndjson").open("w", encoding="utf-8") as f:
        for event in events:
            f.write(json.dumps(event, ensure_ascii=False, sort_keys=True) + "\n")

    csv_fields = [
        "legacy_id", "legacy_url", "source_url", "slug", "title", "published_at", "modified_at",
        "event_date", "opening_text", "opening_start_time_raw", "opening_end_time_raw",
        "on_view_text", "on_view_until", "venue_name", "venue_url", "address", "map_url",
        "official_url", "categories", "tags", "image_urls", "description_text", "parse_warnings",
    ]
    with (PROCESSED_DIR / "events.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=csv_fields)
        writer.writeheader()
        for event in events:
            row = {field: event.get(field, "") for field in csv_fields}
            row["categories"] = "|".join(event.get("categories", []))
            row["tags"] = "|".join(event.get("tags", []))
            row["image_urls"] = "|".join(image["url"] for image in event.get("images", []))
            row["parse_warnings"] = "|".join(event.get("parse_warnings", []))
            writer.writerow(row)

    with (PROCESSED_DIR / "media_manifest.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["legacy_id", "title", "image_url", "role", "alt", "width", "height"])
        writer.writeheader()
        for event in events:
            for image in event.get("images", []):
                writer.writerow({
                    "legacy_id": event.get("legacy_id", ""),
                    "title": event.get("title", ""),
                    "image_url": image.get("url", ""),
                    "role": image.get("role", ""),
                    "alt": image.get("alt", ""),
                    "width": image.get("width", ""),
                    "height": image.get("height", ""),
                })

    venues = {}
    for event in events:
        key = (event.get("venue_name", ""), event.get("address", ""))
        if key[0] or key[1]:
            venues.setdefault(key, {
                "venue_name": key[0],
                "address": key[1],
                "venue_url": event.get("venue_url", ""),
                "map_url": event.get("map_url", ""),
                "event_count": 0,
            })
            venues[key]["event_count"] += 1
    with (PROCESSED_DIR / "venues.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["venue_name", "address", "venue_url", "map_url", "event_count"])
        writer.writeheader()
        writer.writerows(sorted(venues.values(), key=lambda v: (-v["event_count"], v["venue_name"])))

    tag_counts = Counter(tag for event in events for tag in event.get("tags", []))
    with (PROCESSED_DIR / "tags.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["tag", "count"])
        writer.writeheader()
        for tag, count in tag_counts.most_common():
            writer.writerow({"tag": tag, "count": count})

    category_counts = Counter(category for event in events for category in event.get("categories", []))
    with (PROCESSED_DIR / "categories.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["category", "count"])
        writer.writeheader()
        for category, count in category_counts.most_common():
            writer.writerow({"category": category, "count": count})

    with (PROCESSED_DIR / "redirects.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["old_url", "new_path", "legacy_id", "title"])
        writer.writeheader()
        for event in events:
            new_path = likely_new_path(event)
            for old_url in event.get("legacy_urls", []):
                writer.writerow({
                    "old_url": old_url,
                    "new_path": new_path,
                    "legacy_id": event.get("legacy_id", ""),
                    "title": event.get("title", ""),
                })

    warning_counts = Counter(w for event in events for w in event.get("parse_warnings", []))
    report = {
        "event_count": len(events),
        "error_count": len(errors),
        "warning_counts": dict(warning_counts),
        "events_with_images": sum(1 for event in events if event.get("images")),
        "venue_count": len(venues),
        "tag_count": len(tag_counts),
        "category_count": len(category_counts),
        "errors": errors[:100],
    }
    (PROCESSED_DIR / "extraction_report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")


def extract(limit: int | None = None, refetch: bool = False, sleep_seconds: float = 0.2) -> None:
    ensure_dirs()
    rows = read_discovered_urls()
    if limit:
        rows = rows[:limit]

    events: list[dict] = []
    errors: list[dict] = []
    for idx, row in enumerate(rows, start=1):
        url = row["url"]
        cache_path = cache_path_for_url(url)
        try:
            if cache_path.exists() and not refetch:
                page_html = cache_path.read_text(encoding="utf-8", errors="replace")
            else:
                print(f"[extract] fetch {idx}/{len(rows)} {url}", file=sys.stderr)
                result = safe_fetch(url)
                page_html = result.body
                cache_path.write_text(page_html, encoding="utf-8")
                time.sleep(sleep_seconds)
            event = parse_event(page_html, url, row.get("lastmod", ""))
            if event.get("legacy_id") or event.get("title"):
                events.append(event)
            else:
                errors.append({"url": url, "error": "parsed empty event"})
        except Exception as exc:
            errors.append({"url": url, "error": str(exc)})
            print(f"[extract] error {url}: {exc}", file=sys.stderr)

    write_outputs(events, errors)
    print(f"[extract] wrote {len(events)} events with {len(errors)} errors to {PROCESSED_DIR}")


def fetch_rest_collection(
    endpoint: str,
    output_name: str,
    sleep_seconds: float = 0.1,
    max_pages: int | None = None,
) -> None:
    ensure_dirs()
    output_path = PROCESSED_DIR / output_name
    fields = ["id", "name", "slug", "count", "link", "description", "taxonomy"]
    page = 1
    total = 0
    with output_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        while True:
            if max_pages and page > max_pages:
                print(f"[taxonomies] reached max page cap for {endpoint}: {max_pages}", file=sys.stderr)
                break
            url = f"{BASE_URL}/wp-json/wp/v2/{endpoint}?per_page=100&page={page}"
            print(f"[taxonomies] {endpoint} page {page}", file=sys.stderr)
            body = safe_fetch(url).body
            data = json.loads(body)
            if not data:
                break
            for item in data:
                writer.writerow({
                    "id": item.get("id", ""),
                    "name": item.get("name", ""),
                    "slug": item.get("slug", ""),
                    "count": item.get("count", ""),
                    "link": item.get("link", ""),
                    "description": item.get("description", ""),
                    "taxonomy": item.get("taxonomy", endpoint),
                })
                total += 1
            f.flush()
            page += 1
            time.sleep(sleep_seconds)
    print(f"[taxonomies] wrote {total} rows to {output_path}")


def taxonomies(max_tag_pages: int | None = 25) -> None:
    fetch_rest_collection("categories", "wp_categories.csv")
    fetch_rest_collection("tags", "wp_tags.csv", max_pages=max_tag_pages)


def media_cache_path(url: str, content_type: str = "") -> Path:
    parsed = urllib.parse.urlparse(url)
    parts = [p for p in parsed.path.split("/") if p]
    filename = parts[-1] if parts else hashlib.sha1(url.encode("utf-8")).hexdigest()
    if "." not in filename:
        ext = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/gif": ".gif",
            "image/webp": ".webp",
        }.get(content_type.split(";")[0].strip(), "")
        filename += ext
    if len(parts) >= 4 and parts[0] == "wp-content" and parts[1] == "uploads":
        directory = RAW_MEDIA_DIR / parts[2] / parts[3]
    else:
        directory = RAW_MEDIA_DIR / "_other"
    directory.mkdir(parents=True, exist_ok=True)
    return directory / filename


def download_media(limit: int | None = None, sleep_seconds: float = 0.15) -> None:
    manifest = PROCESSED_DIR / "media_manifest.csv"
    if not manifest.exists():
        raise SystemExit(f"{manifest} missing. Run extract first.")
    with manifest.open("r", newline="", encoding="utf-8") as f:
        urls = []
        seen = set()
        for row in csv.DictReader(f):
            url = row.get("image_url", "")
            if url and url not in seen:
                urls.append(url)
                seen.add(url)
    if limit:
        urls = urls[:limit]

    rows = []
    for idx, url in enumerate(urls, start=1):
        try:
            print(f"[media] fetch {idx}/{len(urls)} {url}", file=sys.stderr)
            body, content_type = fetch_bytes(url)
            path = media_cache_path(url, content_type)
            if not path.exists():
                path.write_bytes(body)
            rows.append({
                "source_url": url,
                "local_path": str(path),
                "content_type": content_type,
                "bytes": len(body),
                "sha256": hashlib.sha256(body).hexdigest(),
            })
            time.sleep(sleep_seconds)
        except Exception as exc:
            rows.append({
                "source_url": url,
                "local_path": "",
                "content_type": "",
                "bytes": "",
                "sha256": "",
                "error": str(exc),
            })

    fields = ["source_url", "local_path", "content_type", "bytes", "sha256", "error"]
    with (PROCESSED_DIR / "downloaded_media.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in fields})
    print(f"[media] wrote {len(rows)} rows to {PROCESSED_DIR / 'downloaded_media.csv'}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    discover_parser = subparsers.add_parser("discover", help="Discover event URLs from Yoast sitemaps.")
    discover_parser.add_argument("--limit-sitemaps", type=int, default=None)

    extract_parser = subparsers.add_parser("extract", help="Fetch, cache, parse, and export event records.")
    extract_parser.add_argument("--limit", type=int, default=None)
    extract_parser.add_argument("--refetch", action="store_true")
    extract_parser.add_argument("--sleep", type=float, default=0.2)

    taxonomy_parser = subparsers.add_parser("taxonomies", help="Export public WordPress categories and tags via REST.")
    taxonomy_parser.add_argument(
        "--max-tag-pages",
        type=int,
        default=25,
        help="Cap tag REST pages. Use 0 for no cap. Default: 25 pages / up to 2500 tags.",
    )

    media_parser = subparsers.add_parser("download-media", help="Download images from media_manifest.csv.")
    media_parser.add_argument("--limit", type=int, default=None)
    media_parser.add_argument("--sleep", type=float, default=0.15)

    args = parser.parse_args()
    if args.command == "discover":
        discover(args.limit_sitemaps)
    elif args.command == "extract":
        extract(args.limit, args.refetch, args.sleep)
    elif args.command == "taxonomies":
        taxonomies(None if args.max_tag_pages == 0 else args.max_tag_pages)
    elif args.command == "download-media":
        download_media(args.limit, args.sleep)


if __name__ == "__main__":
    main()
