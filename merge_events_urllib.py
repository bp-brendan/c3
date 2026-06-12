import json
import urllib.request
import urllib.error
import os

SUPABASE_URL = "https://avxlexkqcxamixyhyxcd.supabase.co/rest/v1/events"
HEADERS = {
    "apikey": "sb_publishable_Yw8mgIkUSBBhu4tk1YR8CA_SVm5Tcwz",
    "Authorization": "Bearer sb_publishable_Yw8mgIkUSBBhu4tk1YR8CA_SVm5Tcwz",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

def request(method, url, data=None):
    req = urllib.request.Request(url, headers=HEADERS, method=method)
    if data:
        req.data = json.dumps(data).encode('utf-8')
    try:
        with urllib.request.urlopen(req) as response:
            return response.read()
    except urllib.error.HTTPError as e:
        print(f"Error {e.code}: {e.read()}")
        return None

with open("summer_suite_filter.json", "r") as f:
    summer_events = json.load(f)

with open("carol_schrader_filter.json", "r") as f:
    carol_events = json.load(f)

# SUMMER SUITE
if len(summer_events) >= 2:
    keep = summer_events[0]
    delete = summer_events[1]
    
    new_desc = keep['description']
    if delete['image_url']:
        new_desc += f"<br><br><img src='{delete['image_url']}' alt='Summer Suite'>"
    
    request("PATCH", f"{SUPABASE_URL}?id=eq.{keep['id']}", {"description": new_desc})
    request("DELETE", f"{SUPABASE_URL}?id=eq.{delete['id']}")
    
    if os.path.exists(delete['path']):
        os.remove(delete['path'])

# CAROL SCHRADER
if len(carol_events) >= 2:
    keep = carol_events[0]
    delete = carol_events[1]
    
    new_desc = keep['description']
    if delete['image_url']:
        new_desc += f"<br><br><img src='{delete['image_url']}' alt='Carol Schrader'>"
        
    request("PATCH", f"{SUPABASE_URL}?id=eq.{keep['id']}", {"description": new_desc})
    request("DELETE", f"{SUPABASE_URL}?id=eq.{delete['id']}")
    
    if os.path.exists(delete['path']):
        os.remove(delete['path'])

print("Merged successfully.")
