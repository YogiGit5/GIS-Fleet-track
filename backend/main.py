from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import requests
import time
from simulation import VehicleSimulator

app = FastAPI()

# CORS for React
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage for MVP
vehicles = {}

class VehicleConfig(BaseModel):
    route_geometry: dict
    vehicle_type: str = "car"

class RouteRequest(BaseModel):
    start: List[float] # [lon, lat]
    end: List[float]   # [lon, lat]
    vehicle_type: str = "car" # Default to car if not provided

@app.post("/api/route")
def get_route(req: RouteRequest):
    # Determine OSRM profile
    profile = "driving"
    speed_factor = 1.0
    
    if req.vehicle_type == "bike":
        profile = "bike"
        speed_factor = 1.0 # Bike profile already accounts for speed
    elif req.vehicle_type == "truck":
        profile = "driving"
        speed_factor = 0.7 # Trucks are ~30% slower
    elif req.vehicle_type == "container":
        profile = "driving"
        speed_factor = 0.5 # Heavy containers are ~50% slower
    
    base_url = f"http://router.project-osrm.org/route/v1/{profile}"
    coords = f"{req.start[0]},{req.start[1]};{req.end[0]},{req.end[1]}"
    url = f"{base_url}/{coords}?overview=full&geometries=geojson"
    try:
        resp = requests.get(url)
        data = resp.json()
        if data["code"] != "Ok":
            raise HTTPException(status_code=400, detail="Route not found")
        
        route = data["routes"][0]
        
        # Adjust duration based on vehicle speed factor
        # OSRM duration is in seconds
        route["duration"] = route["duration"] / speed_factor
        
        return {
            "geometry": route["geometry"],
            "distance": route["distance"],
            "duration": route["duration"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/simulate/spawn")
def spawn_vehicle(config: VehicleConfig):
    vehicle_id = f"v_{int(time.time())}"
    
    # Speed adjustment (km/h -> m/s)
    speed_map = {
        "truck": 60 / 3.6,
        "car": 100 / 3.6,
        "bike": 30 / 3.6
    }
    speed = speed_map.get(config.vehicle_type, 15)
    
    vehicles[vehicle_id] = VehicleSimulator(
        route_geometry=config.route_geometry,
        speed_mps=speed
    )
    
    return {"vehicle_id": vehicle_id, "start_time": time.time()}

@app.get("/api/simulate/{vehicle_id}")
def get_vehicle_status(vehicle_id: str):
    if vehicle_id not in vehicles:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    
    sim = vehicles[vehicle_id]
    status = sim.get_position()
    
    if status["finished"]:
        # Optional: cleanup
        pass
        
    return status

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
