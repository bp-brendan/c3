import json
import re
import sys

archive_js_path = "/Users/brendan/Documents/GitHub/c3/archiveevents2026.js"

ART_CATEGORIES = {
    "photography", "painting", "performance", "sculpture", "installation", 
    "video", "film", "printmaking", "drawing", "architecture", "collage", 
    "ceramics", "design", "new-media", "sound-art", "mixed-media", 
    "animation", "digital-art", "fiber-art", "illustration", "jewelry", 
    "glass", "watercolor", "pottery", "print", "video-art", "performance-art", 
    "graphic-design"
}

import unicodedata

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
    cats = []
    for tag in tags:
        slug = slugify(tag)
        if slug in ART_CATEGORIES:
            cats.append(tag)
    if cats:
        event["c"] = sorted(set(cats))
        patched_count += 1

new_json_str = json.dumps(archive_events, ensure_ascii=False)
new_js_content = js_content[:match.start(1)] + new_json_str + js_content[match.end(1):]

with open(archive_js_path, 'w', encoding='utf-8') as f:
    f.write(new_js_content)

print(f"Patched {patched_count} events with categories in archiveevents2026.js.")
