#!/usr/bin/env python3
"""Generate small JPEG thumbnails for the event-image strips.

Reads image paths from archiveevents2026.js (the `i` fields) and writes
200px-long-side JPEGs to media/thumbs/, mirroring the media/ layout. The
image strips on the archive default view and the This Week footer load
these (~8KB) instead of the full-size uploads (~260KB), falling back to
the original at runtime if a thumb is missing. Requires macOS `sips`.

Usage: python3 scripts/build_image_thumbs.py
"""
import json
import os
import re
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, 'archiveevents2026.js')).read()
events = json.loads(src[src.index('['):src.rindex(']') + 1])
paths = sorted({e['i'] for e in events if e.get('i', '').startswith('media/')})

made = current = missing = failed = 0
for rel in paths:
    src_path = os.path.join(ROOT, rel)
    if not os.path.exists(src_path):
        missing += 1
        continue
    out_rel = re.sub(r'^media/', 'media/thumbs/', rel)
    out_rel = re.sub(r'\.(png|jpe?g|gif|webp)$', '.jpg', out_rel, flags=re.I)
    out_path = os.path.join(ROOT, out_rel)
    if os.path.exists(out_path) and os.path.getmtime(out_path) >= os.path.getmtime(src_path):
        current += 1
        continue
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    result = subprocess.run(
        ['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '65',
         '-Z', '200', src_path, '--out', out_path],
        capture_output=True)
    if result.returncode:
        failed += 1
        print('FAIL', rel, result.stderr.decode()[:120])
        continue
    made += 1

print(f'thumbs: {made} written, {current} already current, '
      f'{missing} sources missing, {failed} failed')
