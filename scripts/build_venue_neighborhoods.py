#!/usr/bin/env python3
"""Build a venue -> neighborhood lookup from the events archive.

The submit form auto-fills a Chicago neighborhood once the user picks a known
venue, so admins get the neighborhood tag they ask for (see thevisualist.org/info)
without the submitter having to know it. The events table has no neighborhood
column, but most rows carry the neighborhood as a tag (usually the first one,
e.g. ["Hyde Park", "University of Chicago"]). This pages the table with the
site's publishable key, counts how often each known Chicago neighborhood is
tagged on each venue's events, and writes the winner per venue.

Output: venueNeighborhoods.js at the repo root, defining
  window.CHICAGO_NEIGHBORHOODS  -- sorted list for the field's type-ahead
  window.VENUE_NEIGHBORHOODS    -- { "venue (lowercased)": "Neighborhood" }

Usage: python3 scripts/build_venue_neighborhoods.py
"""
import json
import os
import urllib.request
from collections import defaultdict

SUPABASE_URL = 'https://avxlexkqcxamixyhyxcd.supabase.co'
SUPABASE_KEY = 'sb_publishable_Yw8mgIkUSBBhu4tk1YR8CA_SVm5Tcwz'
PAGE = 1000

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'venueNeighborhoods.js')

# Chicago's 77 community areas plus the named neighborhoods and inner-ring
# suburbs that actually show up as location tags on art listings. Matching only
# keeps names that appear in the data, so over-inclusion here is harmless.
NEIGHBORHOODS = [
    # community areas
    "Rogers Park", "West Ridge", "Uptown", "Lincoln Square", "North Center",
    "Lake View", "Lakeview", "Lincoln Park", "Near North Side", "Edison Park",
    "Norwood Park", "Jefferson Park", "Forest Glen", "North Park", "Albany Park",
    "Portage Park", "Irving Park", "Dunning", "Montclare", "Belmont Cragin",
    "Hermosa", "Avondale", "Logan Square", "Humboldt Park", "West Town",
    "Austin", "West Garfield Park", "East Garfield Park", "Near West Side",
    "North Lawndale", "South Lawndale", "Lower West Side", "Loop", "The Loop",
    "Near South Side", "Armour Square", "Douglas", "Oakland", "Fuller Park",
    "Grand Boulevard", "Kenwood", "Washington Park", "Hyde Park", "Woodlawn",
    "South Shore", "Chatham", "Avalon Park", "South Chicago", "Burnside",
    "Calumet Heights", "Roseland", "Pullman", "South Deering", "East Side",
    "West Pullman", "Riverdale", "Hegewisch", "Garfield Ridge", "Archer Heights",
    "Brighton Park", "McKinley Park", "Bridgeport", "New City", "West Elsdon",
    "Gage Park", "Clearing", "West Lawn", "Chicago Lawn", "West Englewood",
    "Englewood", "Greater Grand Crossing", "Ashburn", "Auburn Gresham",
    "Beverly", "Washington Heights", "Mount Greenwood", "Morgan Park",
    "O'Hare", "Edgewater",
    # named neighborhoods commonly used as location tags
    "Wicker Park", "Bucktown", "Pilsen", "Ukrainian Village", "River North",
    "River West", "West Loop", "South Loop", "Old Town", "Streeterville",
    "Gold Coast", "Andersonville", "Ravenswood", "Roscoe Village",
    "Wrigleyville", "Boystown", "Northalsted", "Lakeview East", "Noble Square",
    "East Village", "Little Village", "Chinatown", "Printers Row", "Goose Island",
    "Fulton Market", "Bronzeville", "Tri-Taylor", "Galewood", "Sauganash",
    "Magnificent Mile", "West Ridge", "Edgebrook", "Old Irving Park",
    "Sheffield Neighbors", "Margate Park",
    # inner-ring suburbs that host listed venues
    "Evanston", "Oak Park", "Berwyn", "Cicero", "Skokie", "Forest Park",
    "Hyde Park", "Garfield Park",
]
# longest first so "East Garfield Park" wins over "Garfield Park"
NEIGHBORHOOD_BY_LOWER = {}
for n in NEIGHBORHOODS:
    NEIGHBORHOOD_BY_LOWER.setdefault(n.lower(), n)
KNOWN = set(NEIGHBORHOOD_BY_LOWER)


def fetch(start):
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/events?select=venue,tags&order=id.asc',
        headers={
            'apikey': SUPABASE_KEY,
            'Authorization': f'Bearer {SUPABASE_KEY}',
            'Range': f'{start}-{start + PAGE - 1}',
        })
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)


def main():
    # venue -> Counter-ish of neighborhood -> weight
    counts = defaultdict(lambda: defaultdict(int))
    rows = 0
    start = 0
    while True:
        batch = fetch(start)
        if not batch:
            break
        for row in batch:
            venue = (row.get('venue') or '').strip()
            tags = row.get('tags') or []
            if not venue or not isinstance(tags, list):
                continue
            rows += 1
            for i, tag in enumerate(tags):
                key = str(tag).strip().lower()
                if key in KNOWN:
                    # neighborhoods sit first in the tag list far more often than
                    # an artist name would, so weight earlier positions higher
                    counts[venue.lower()][NEIGHBORHOOD_BY_LOWER[key]] += 3 if i == 0 else 1
        if len(batch) < PAGE:
            break
        start += PAGE

    venue_map = {}
    for venue, hoods in counts.items():
        best = max(hoods.items(), key=lambda kv: (kv[1], -len(kv[0])))
        # require a little support so a single stray artist-name collision
        # ("Austin", "Beverly") doesn't define a venue's neighborhood
        if best[1] >= 2:
            venue_map[venue] = best[0]

    found = sorted({h for hoods in counts.values() for h in hoods})
    venue_map = dict(sorted(venue_map.items()))

    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('// Generated by scripts/build_venue_neighborhoods.py — do not edit by hand.\n')
        f.write('// venue (lowercased) -> Chicago neighborhood, mined from event tags,\n')
        f.write('// so the submit form can auto-fill the neighborhood once a venue is picked.\n')
        f.write('window.CHICAGO_NEIGHBORHOODS = ')
        f.write(json.dumps(found, ensure_ascii=False))
        f.write(';\n')
        f.write('window.VENUE_NEIGHBORHOODS = ')
        f.write(json.dumps(venue_map, ensure_ascii=False, indent=0).replace('\n', ''))
        f.write(';\n')

    print(f'events scanned: {rows}')
    print(f'neighborhoods found in data: {len(found)}')
    print(f'venues mapped: {len(venue_map)}')
    print(f'wrote {OUT} ({os.path.getsize(OUT)} bytes)')
    print('sample:', dict(list(venue_map.items())[:8]))


if __name__ == '__main__':
    main()
