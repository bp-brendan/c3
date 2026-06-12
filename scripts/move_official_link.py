#!/usr/bin/env python3
import glob
import re

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        html = f.read()

    # Find "Official website" link
    # e.g. <a class="event-source-link" href="..." target="_blank" rel="noopener">Official website</a>
    match = re.search(r'(\s*<a[^>]*>Official website</a>)', html)
    if not match:
        return

    official_link = match.group(1).strip()
    
    # Remove it from its current location
    html = html.replace(match.group(1), '')
    
    # Also clean up empty <p class="event-source-links"></p> if needed, 
    # but there are usually other links like "More events on this date" and "Original listing".

    # We need to insert it at the bottom of the metadata block, which is <p class="event-detail-meta"> ... </p>
    # Wait, the meta block has span tags inside. Should the link be a span? Or just placed as the last child of <p>?
    # If placed inside <p class="event-detail-meta">, it can just be a <span> with the link inside, or just the link.
    # The current meta block looks like:
    # <p class="event-detail-meta">
    #   <span>...</span>...
    # </p>
    # <div class="event-detail-description">
    
    # Let's insert it inside the <p class="event-detail-meta"> at the end.
    meta_end = html.find('</p>', html.find('<p class="event-detail-meta">'))
    if meta_end != -1:
        # insert span wrapper
        wrapped_link = f'\n          <span>{official_link}</span>\n        '
        html = html[:meta_end] + wrapped_link + html[meta_end:]
        
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f"Updated {filepath}")

for f in glob.glob('events/*.html'):
    process_file(f)

