import json
import re
import sys

archive_js_path = "/Users/brendan/Documents/GitHub/c3/archiveevents2026.js"

import unicodedata

ART_CATEGORIES = {
    "photography": r"\bphotography\b",
    "painting": r"\bpaintings?\b",
    "performance": r"\bperformances?\b",
    "sculpture": r"\bsculptures?\b",
    "installation": r"\binstallations?\b",
    "video": r"\bvideos?\b",
    "film": r"\bfilms?\b",
    "printmaking": r"\bprintmaking\b",
    "drawing": r"\bdrawings?\b",
    "architecture": r"\barchitecture\b",
    "collage": r"\bcollages?\b",
    "ceramics": r"\bceramics?\b",
    "design": r"\bdesign(s|ers?)?\b",
    "new-media": r"\bnew media\b",
    "sound-art": r"\bsound art\b",
    "mixed-media": r"\bmixed media\b",
    "animation": r"\banimations?\b",
    "digital-art": r"\bdigital art\b",
    "fiber-art": r"\bfiber art\b",
    "illustration": r"\billustrations?\b",
    "jewelry": r"\bjewelry\b",
    "glass": r"\bglass\b",
    "watercolor": r"\bwatercolors?\b",
    "pottery": r"\bpottery\b",
    "print": r"\bprints?\b",
    "video-art": r"\bvideo art\b",
    "performance-art": r"\bperformance art\b",
    "graphic-design": r"\bgraphic design\b"
}
COMPILED_CATS = {k: re.compile(v, re.IGNORECASE) for k, v in ART_CATEGORIES.items()}

def slugify(name):
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"-{2,}", "-", re.sub(r"[^a-z0-9]+", "-", name.lower())).strip("-")

with open(archive_js_path, 'r', encoding='utf-8') as f:
    js_content = f.read()

match = re.search(r'window\.ARCHIVE_EVENTS_2026\s*=\s*(\[.*\]);', js_content, re.S)
if not match:
    print("Could not find window.ARCHIVE_EVENTS_2026 array in JS file.")
    sys.exit(1)

json_str = match.group(1)
archive_events = json.loads(json_str)

patched_count = 0
for event in archive_events:
    tags = event.get("g", [])
    title = event.get("t", "")
    desc = event.get("x", "")
    text_to_search = title + " " + " ".join(tags) + " " + desc
    cats = []
    for slug, pattern in COMPILED_CATS.items():
        if pattern.search(text_to_search):
            cats.append(slug)
    if cats:
        event["c"] = sorted(set(cats))
        patched_count += 1

new_json_str = json.dumps(archive_events, ensure_ascii=False)
new_js_content = js_content[:match.start(1)] + new_json_str + js_content[match.end(1):]

with open(archive_js_path, 'w', encoding='utf-8') as f:
    f.write(new_js_content)

print(f"Patched {patched_count} events with categories in archiveevents2026.js.")
