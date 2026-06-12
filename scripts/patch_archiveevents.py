#!/usr/bin/env python3
import json
import re

def main():
    events_ndjson_path = "recovery/data/processed/events.ndjson"
    archive_js_path = "archiveevents2026.js"

    # 1. Load full descriptions from events.ndjson
    url_to_desc = {}
    with open(events_ndjson_path, 'r', encoding='utf-8') as f:
        for line in f:
            if not line.strip():
                continue
            data = json.loads(line)
            desc = data.get("description_text", "").strip()
            
            # Use both legacy_url and source_url as keys
            legacy = data.get("legacy_url")
            source = data.get("source_url")
            if legacy:
                url_to_desc[legacy] = desc
            if source:
                url_to_desc[source] = desc

    # 2. Parse archiveevents2026.js
    with open(archive_js_path, 'r', encoding='utf-8') as f:
        js_content = f.read()

    # The file has format: window.ARCHIVE_EVENTS_2026 = [...];
    match = re.search(r'window\.ARCHIVE_EVENTS_2026\s*=\s*(\[.*\]);', js_content, re.S)
    if not match:
        print("Could not find window.ARCHIVE_EVENTS_2026 array in JS file.")
        return

    json_str = match.group(1)
    archive_events = json.loads(json_str)

    # 3. Patch the events
    patched_count = 0
    for event in archive_events:
        u = event.get("u")
        if u and u in url_to_desc:
            full_text = url_to_desc[u]
            if full_text:
                event["x"] = full_text
                patched_count += 1
        elif "x" in event:
            # Maybe remove the trailing "..." if it was already truncated and we don't have full text
            event["x"] = re.sub(r'(\.{3}|…)\s*$', '', event["x"])

    # 4. Write back
    new_json_str = json.dumps(archive_events, ensure_ascii=False)
    # Put it back into the JS string
    new_js_content = js_content[:match.start(1)] + new_json_str + js_content[match.end(1):]

    with open(archive_js_path, 'w', encoding='utf-8') as f:
        f.write(new_js_content)

    print(f"Patched {patched_count} events with full descriptions.")

if __name__ == "__main__":
    main()
