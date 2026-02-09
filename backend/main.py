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

class RouteRequest(BaseModel):
    start: List[float] # [lon, lat]
    end: List[float]   # [lon, lat]

class VehicleConfig(BaseModel):
    vehicle_type: str  # "truck", "car", "bike"
    route_geometry: dict  # GeoJSON LineString
    
@app.get("/")
def read_root():
    return {"status": "Fleet Track Backend Running"}

@app.post("/api/route")
def get_route(req: RouteRequest):
    # Using OSRM public demo API for MVP
    # In production, this would point to local OSRM or GraphHopper
    base_url = "http://router.project-osrm.org/route/v1/driving"
    coords = f"{req.start[0]},{req.start[1]};{req.end[0]},{req.end[1]}"
    url = f"{base_url}/{coords}?overview=full&geometries=geojson"
    try:
        resp = requests.get(url)
        data = resp.json()
        if data["code"] != "Ok":
            raise HTTPException(status_code=400, detail="Route not found")
        route = data["routes"][0]
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
