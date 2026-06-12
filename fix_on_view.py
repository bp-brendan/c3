import urllib.request
import json
import re
from datetime import datetime

URL = "https://avxlexkqcxamixyhyxcd.supabase.co/rest/v1/events?select=*"
HEADERS = {
    "apikey": "sb_publishable_Yw8mgIkUSBBhu4tk1YR8CA_SVm5Tcwz",
    "Authorization": "Bearer sb_publishable_Yw8mgIkUSBBhu4tk1YR8CA_SVm5Tcwz"
}

def fetch_events():
    req = urllib.request.Request(URL, headers=HEADERS)
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode())

def get_event_by_url(events, url):
    for e in events:
        if e.get("permalink") == url or e.get("path") == url:
            return e
    return None

def build_card(e, through_date):
    if not e: return ""
    image_url = e.get("image_url") or ""
    title = e.get("title") or ""
    venue = e.get("venue") or ""
    address = e.get("address") or ""
    map_link = e.get("map_url") or ""
    url = e.get("permalink") or ""
    top_pick = e.get("top_pick")
    
    html = []
    html.append('      <article class="event-card">')
    if image_url:
        html.append(f'        <a class="event-thumb" href="{url}"><img src="{image_url}" alt="" loading="lazy"></a>')
    
    html.append('        <div class="event-info">')
    
    pick_html = ' <a class="top-pick" href="tag.html?tag=top-pick" target="_blank" rel="noopener">Top Pick</a>' if top_pick else ''
    html.append(f'          <h3 class="event-title"><a href="{url}">{title}</a>{pick_html}</h3>')
    
    if venue:
        html.append(f'          <p class="event-venue"><a href="{url}" target="_blank" rel="noopener">{venue}</a></p>')
    
    html.append(f'          <p class="event-when">{through_date}</p>')
    
    if address:
        if map_link:
            html.append(f'          <p class="event-address"><a href="{map_link}" target="_blank" rel="noopener">{address}</a></p>')
        else:
            html.append(f'          <p class="event-address">{address}</p>')
            
    html.append('          <div class="event-liner"></div>')
    html.append('        </div>')
    html.append('      </article>')
    
    return "\n".join(html)

def parse_date(date_str):
    # e.g. "Through Wednesday, June 10" or "Through Thursday, December 31"
    # We want to format it to "Wednesday, June 10th"
    m = re.search(r'Through (\w+), ([a-zA-Z]+) (\d+)', date_str)
    if not m:
        return date_str
    
    day_name, month_name, day_num = m.groups()
    day_num = int(day_num)
    
    def ordinal(n):
        if 11 <= (n % 100) <= 13: return f"{n}th"
        return f"{n}{['th','st','nd','rd','th','th','th','th','th','th'][n%10]}"
    
    # "Wednesday, June 10th"
    return f"{day_name}, {month_name} {ordinal(day_num)}"

def run():
    events = fetch_events()
    
    with open("index.html", "r", encoding="utf-8") as f:
        html = f.read()
        
    def process_on_view(match):
        list_html = match.group(1)
        item_pattern = r'<li class="listing-item">\s*<span><a class="listing-title" href="([^"]+)">([^<]+)</a></span>\s*<span class="listing-venue">[^<]+</span><span class="listing-meta">([^<]+)</span>\s*</li>'
        items = re.finditer(item_pattern, list_html)
        
        # Group by closing date
        groups = {}
        
        for it in items:
            url = it.group(1)
            title = it.group(2)
            through = it.group(3)
            
            # get "Wednesday, June 10th" from "Through Wednesday, June 10"
            date_heading = parse_date(through)
            
            e = get_event_by_url(events, url)
            card = build_card(e, through) if e else f"<!-- Missing event: {url} -->"
            
            if date_heading not in groups:
                groups[date_heading] = []
            groups[date_heading].append(card)
            
        result = []
        for date_heading, cards in groups.items():
            # Check if this is just "Through ..." or a proper date
            if "," in date_heading:
                day_name, rest = date_heading.split(",", 1)
                result.append(f'      <div class="event-date">\n        <span class="event-date-day">{day_name.strip()}</span>\n        <span class="event-date-month">{rest.strip()}</span>\n      </div>')
            else:
                result.append(f'      <div class="event-date">\n        <span class="event-date-day">{date_heading}</span>\n      </div>')
            result.extend(cards)
            
        return "\n" + "\n".join(result) + "\n"

    pattern = r'<h2 class="view-heading">On View</h2>\s*<ul class="listing">(.*?)</ul>'
    new_html = re.sub(pattern, process_on_view, html, flags=re.DOTALL)
    
    with open("index.html", "w", encoding="utf-8") as f:
        f.write(new_html)
        
    print("Done!")

run()
