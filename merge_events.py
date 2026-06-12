import json
import requests
import os

SUPABASE_URL = "https://avxlexkqcxamixyhyxcd.supabase.co/rest/v1/events"
HEADERS = {
    "apikey": "sb_publishable_Yw8mgIkUSBBhu4tk1YR8CA_SVm5Tcwz",
    "Authorization": "Bearer sb_publishable_Yw8mgIkUSBBhu4tk1YR8CA_SVm5Tcwz",
    "Content-Type": "application/json"
}

with open("summer_suite_filter.json", "r") as f:
    summer_events = json.load(f)

with open("carol_schrader_filter.json", "r") as f:
    carol_events = json.load(f)

# SUMMER SUITE
if len(summer_events) >= 2:
    keep_summer = summer_events[0]
    delete_summer = summer_events[1]
    
    # Merge logic: Use image from keep, put image from delete in description
    new_desc = keep_summer['description']
    if delete_summer['image_url']:
        new_desc += f"<br><br><img src='{delete_summer['image_url']}' alt='Summer Suite'>"
    
    # Update keep
    requests.patch(f"{SUPABASE_URL}?id=eq.{keep_summer['id']}", headers=HEADERS, json={
        "description": new_desc
    })
    
    # Delete the other
    requests.delete(f"{SUPABASE_URL}?id=eq.{delete_summer['id']}", headers=HEADERS)
    
    # Remove old HTML file
    if os.path.exists(delete_summer['path']):
        os.remove(delete_summer['path'])

# CAROL SCHRADER
if len(carol_events) >= 2:
    keep_carol = carol_events[0]
    delete_carol = carol_events[1]
    
    new_desc = keep_carol['description']
    if delete_carol['image_url']:
        new_desc += f"<br><br><img src='{delete_carol['image_url']}' alt='Carol Schrader'>"
        
    requests.patch(f"{SUPABASE_URL}?id=eq.{keep_carol['id']}", headers=HEADERS, json={
        "description": new_desc
    })
    
    requests.delete(f"{SUPABASE_URL}?id=eq.{delete_carol['id']}", headers=HEADERS)
    
    if os.path.exists(delete_carol['path']):
        os.remove(delete_carol['path'])

print("Merged successfully.")
