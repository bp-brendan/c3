#!/usr/bin/env python3
import os
import re
import urllib.request
import glob
from bs4 import BeautifulSoup

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        html = f.read()

    # Find the original URL
    match = re.search(r'<a class="event-source-link" href="(https://thevisualist\.org/\?p=\d+)"', html)
    if not match:
        return False
    original_url = match.group(1)

    print(f"Processing {filepath} -> {original_url}")
    
    # Fetch original URL
    try:
        req = urllib.request.Request(original_url, headers={'User-Agent': 'Mozilla/5.0'})
        response = urllib.request.urlopen(req)
        source_html = response.read().decode('utf-8', errors='ignore')
    except Exception as e:
        print(f"Failed to fetch {original_url}: {e}")
        return False

    # Extract the full description
    soup = BeautifulSoup(source_html, 'html.parser')
    body = soup.find('div', class_='event-single-body')
    if not body:
        print("  Could not find event-single-body")
        return False

    # Remove the .nav-top
    nav_top = body.find('div', class_='nav-top')
    if nav_top:
        nav_top.decompose()

    # Remove the post tags div if present
    post_tags = body.find('div', class_='post-tags')
    if post_tags:
        post_tags.decompose()

    # The rest is the description
    new_desc_inner = "".join(str(c) for c in body.contents).strip()
    
    if not new_desc_inner:
        print("  Description is empty!")
        return False

    # Replace the local description
    # Find the <div class="event-detail-description">
    desc_start = html.find('<div class="event-detail-description">')
    desc_end = html.find('</div>', desc_start)
    if desc_start != -1 and desc_end != -1:
        html = html[:desc_start] + '<div class="event-detail-description">\n          ' + new_desc_inner + '\n        </div>' + html[desc_end+6:]

    # Change image wrapper to button
    html = re.sub(
        r'<a class="event-detail-image" href="[^"]*">\s*<img src="([^"]+)" alt="([^"]*)" loading="lazy">\s*</a>',
        r'<button type="button" class="event-detail-image" aria-label="View larger image"><img src="\1" alt="\2" loading="lazy"></button>',
        html
    )

    # Fix non-recurring dates
    meta_start = html.find('<p class="event-detail-meta">')
    meta_end = html.find('</p>', meta_start)
    if meta_start != -1 and meta_end != -1:
        meta_html = html[meta_start:meta_end+4]
        spans = re.findall(r'<span>(.*?)</span>', meta_html)
        
        opening_idx = -1
        onview_idx = -1
        
        opening_date = None
        onview_date = None
        
        for i, text in enumerate(spans):
            if text.startswith('Opening '):
                opening_idx = i
                m = re.search(r'Opening ([^,]+, [^,]+)', text)
                if m: opening_date = m.group(1).strip()
            elif text.startswith('On view through '):
                onview_idx = i
                m = re.search(r'On view through (.+)', text)
                if m: onview_date = m.group(1).strip()
                
        # To determine if it's recurring: if onview_date is different from opening_date
        # Or if there is only Opening (which is non-recurring but scraped as just opening)
        if opening_idx != -1:
            if not onview_date or opening_date == onview_date:
                # Non-recurring!
                time_match = re.search(r'from (.+)', spans[opening_idx])
                time_str = time_match.group(1) if time_match else ""
                
                new_spans = []
                for i, text in enumerate(spans):
                    if i == 0 and time_str and time_str not in text:
                        new_spans.append(f"<span>{text}, {time_str}</span>")
                    elif i != opening_idx and i != onview_idx:
                        new_spans.append(f"<span>{text}</span>")
                
                new_meta_html = '<p class="event-detail-meta">\n          ' + '\n          '.join(new_spans) + '\n        </p>'
                html = html[:meta_start] + new_meta_html + html[meta_end+4:]

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(html)
        
    return True

def main():
    files = glob.glob('events/*.html')
    for f in files:
        process_file(f)

if __name__ == '__main__':
    main()
