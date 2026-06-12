import json
import urllib.request
import urllib.error

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

with open("carol_schrader_filter.json", "r") as f:
    events = json.load(f)

event1 = events[0]
event2 = events[1]

# Event 1: Opening Reception
e1_update = {
    "title": "Carol Schrader: Rising Waters, Mythical Ships - Opening Reception",
    "description": "Join us for the opening reception of Carol Schrader: Rising Waters, Mythical Ships on June 12, 2026 at 5-9pm.",
    "time_window": "5PM - 9PM",
    "on_view_through": ""
}
request("PATCH", f"{SUPABASE_URL}?id=eq.{event1['id']}", e1_update)

# Event 2: The Show (we need to INSERT it since it was deleted)
e2_insert = event2.copy()
e2_insert["title"] = "Carol Schrader: Rising Waters, Mythical Ships"
e2_insert["description"] = "Carol Schrader’s ‘Rising Waters, Mythical Ships’ invites viewers into a lush, layered world where mythology, memory, and contemporary life drift together on vibrant seas. Whimsical ships sail through colorful waves alongside chimera, creating a dreamlike menagerie that feels both playful and deeply symbolic."
e2_insert["time_window"] = "By appointment"
e2_insert["on_view_through"] = "On view through Saturday, July 4th"

# Remove read-only or empty fields that might cause insert issues
if 'parent_event_id' in e2_insert and e2_insert['parent_event_id'] is None:
    del e2_insert['parent_event_id']
if 'series_first' in e2_insert and e2_insert['series_first'] is None:
    del e2_insert['series_first']
if 'series_last' in e2_insert and e2_insert['series_last'] is None:
    del e2_insert['series_last']

request("POST", SUPABASE_URL, e2_insert)
print("Carol Schrader events restored and updated.")
