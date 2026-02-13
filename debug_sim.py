import requests
import json

url = "http://localhost:8000/api/simulate/spawn"
payload = {
    "vehicle_type": "car",
    "route": {
        "type": "LineString",
        "coordinates": [[-0.1278, 51.5074], [-0.12, 51.51]]
    }
}
try:
    print(f"Sending POST to {url}")
    print(f"Payload: {json.dumps(payload)}")
    resp = requests.post(url, json=payload)
    print(f"Status: {resp.status_code}")
    print(f"Response: {resp.text}")
except Exception as e:
    print(f"Error: {e}")
