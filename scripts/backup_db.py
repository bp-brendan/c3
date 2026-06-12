#!/usr/bin/env python3
"""Export every Supabase table to gzipped NDJSON, one dated folder per run.

Pages through PostgREST with the site's publishable key (the server caps
responses at 1000 rows), so it needs no extra secrets and captures exactly
what the site can see. For full-fidelity dumps (indexes, views, RLS
policies), prefer pg_dump with the connection string from the Supabase
dashboard; this script is the application-level safety net.

Usage: python3 scripts/backup_db.py [output-dir]   (default: backups/)
"""
import gzip
import json
import os
import sys
import urllib.request
from datetime import date

SUPABASE_URL = 'https://avxlexkqcxamixyhyxcd.supabase.co'
SUPABASE_KEY = 'sb_publishable_Yw8mgIkUSBBhu4tk1YR8CA_SVm5Tcwz'
TABLES = ['events', 'taglines', 'settings', 'submissions']
PAGE = 1000

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out_root = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'backups')
out_dir = os.path.join(out_root, date.today().isoformat())
os.makedirs(out_dir, exist_ok=True)


def fetch(table, start):
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/{table}?select=*&order=id.asc',
        headers={
            'apikey': SUPABASE_KEY,
            'Authorization': f'Bearer {SUPABASE_KEY}',
            'Range': f'{start}-{start + PAGE - 1}',
        })
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)


for table in TABLES:
    path = os.path.join(out_dir, f'{table}.ndjson.gz')
    total = 0
    try:
        with gzip.open(path, 'wt') as out:
            start = 0
            while True:
                rows = fetch(table, start)
                for row in rows:
                    out.write(json.dumps(row, ensure_ascii=False) + '\n')
                total += len(rows)
                if len(rows) < PAGE:
                    break
                start += PAGE
    except Exception as err:  # a missing table must not sink the others
        os.path.exists(path) and os.unlink(path)
        print(f'{table}: SKIPPED ({err})')
        continue
    print(f'{table}: {total} rows -> {os.path.relpath(path, ROOT)}')
