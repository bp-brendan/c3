# The Visualist public migration toolkit

This repository contains a dependency-free extractor for migrating public content
from https://thevisualist.org/ when a WordPress export is not available.

The tool uses public, crawlable sources:

- `robots.txt`
- Yoast sitemap index and `post-sitemap*.xml`
- Individual public event pages
- Event page JSON-LD, meta tags, and the `#event-index` markup

## Quick start

Discover public post URLs:

```sh
python3 scripts/visualist_extract.py discover
```

Fetch and parse the newest 250 discovered URLs:

```sh
python3 scripts/visualist_extract.py extract --limit 250
```

Fetch public WordPress categories and tags:

```sh
python3 scripts/visualist_extract.py taxonomies
```

Download media referenced by the parsed event manifest:

```sh
python3 scripts/visualist_extract.py download-media --limit 50
```

Run a smaller smoke test without fetching the whole archive:

```sh
python3 scripts/visualist_extract.py discover --limit-sitemaps 2
python3 scripts/visualist_extract.py extract --limit 25
```

## Outputs

The extractor writes files under `data/`:

- `data/discovered_urls.csv`: URLs found in sitemaps, sorted newest first.
- `data/raw/html/`: cached source HTML for fetched event pages.
- `data/processed/events.ndjson`: one structured event per line.
- `data/processed/events.csv`: spreadsheet-friendly event review file.
- `data/processed/media_manifest.csv`: image URLs referenced by parsed events.
- `data/processed/venues.csv`: venue names/URLs/addresses inferred from events.
- `data/processed/tags.csv`: tag usage counts.
- `data/processed/wp_categories.csv`: public WordPress categories from REST.
- `data/processed/wp_tags.csv`: public WordPress tags from REST.
- `data/processed/redirects.csv`: legacy URL to likely future slug path.
- `data/processed/extraction_report.json`: counts and parser diagnostics.
- `data/raw/media/`: downloaded image/media files when `download-media` is run.

## Notes

This does not require WordPress admin access. It is intentionally conservative:
it preserves raw source pages, records legacy IDs and URLs, and leaves ambiguous
date/time text intact while also attempting simple normalized fields.

For the complete archive, run `discover` once, then run `extract` in batches by
increasing `--limit` or omitting it. The cache makes reruns resumable. A full
public crawl is about 36k event pages, so expect it to take hours at a polite
request rate.
