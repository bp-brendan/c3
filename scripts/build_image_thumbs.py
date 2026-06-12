#!/usr/bin/env python3
"""Generate thumbnail tiers for every image under media/.

Two tiers, mirroring the media/ layout as JPEGs:
  media/thumbs/     200px long side, q65 (~10KB)  — image rivers
  media/thumbs480/  480px long side, q72 (~25KB)  — event-card thumbs
                     (cardthumbs.js swaps card images to these at runtime,
                     falling back to the original if a thumb is missing)

Walks media/ itself rather than any data file, so coverage includes images
that postdate archiveevents2026.js. Requires macOS `sips`.

Usage: python3 scripts/build_image_thumbs.py
"""
import os
import re
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MEDIA = os.path.join(ROOT, 'media')
TIERS = [
    ('thumbs', 200, 65),
    ('thumbs480', 480, 72),
]
IMAGE_RE = re.compile(r'\.(png|jpe?g|gif|webp)$', re.I)

paths = []
for dirpath, dirnames, filenames in os.walk(MEDIA):
    rel_dir = os.path.relpath(dirpath, MEDIA)
    if rel_dir.split(os.sep)[0] in {t[0] for t in TIERS}:
        dirnames[:] = []
        continue
    for name in filenames:
        if IMAGE_RE.search(name):
            paths.append(os.path.relpath(os.path.join(dirpath, name), MEDIA))

for tier, size, quality in TIERS:
    made = current = failed = 0
    for rel in sorted(paths):
        src_path = os.path.join(MEDIA, rel)
        out_path = os.path.join(MEDIA, tier, IMAGE_RE.sub('.jpg', rel))
        if os.path.exists(out_path) and os.path.getmtime(out_path) >= os.path.getmtime(src_path):
            current += 1
            continue
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        result = subprocess.run(
            ['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', str(quality),
             '-Z', str(size), src_path, '--out', out_path],
            capture_output=True)
        if result.returncode:
            failed += 1
            print('FAIL', tier, rel, result.stderr.decode()[:120])
            continue
        made += 1
    print(f'{tier}: {made} written, {current} already current, {failed} failed '
          f'of {len(paths)} sources')
