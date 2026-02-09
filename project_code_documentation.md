
# Detailed Code Documentation

This document provides a deep dive into the code with specific line number references to help you understand exactly how the logic is implemented.

---

## 1. Backend (`backend/main.py`)

The entry point for the FastAPI server.

### **Imports & Setup (Lines 1-18)**
- **Lines 1-7**: Standard imports. `FastAPI` for the web framework, `pydantic` for data validation, and `simulation` for our custom vehicle logic.
- **Lines 12-18**: **CORS Middleware**. This is critical. It allows the React frontend (running on a different port) to make requests to this backend. Without `allow_origins=["*"]`, the browser would block the API calls.

### **Data Models (Lines 23-30)**
We use Pydantic models to define what JSON data we expect from the frontend.
- **Lines 23-26 (`RouteRequest`)**: Expects `start` and `end` coordinates for route calculation.
- **Lines 27-30 (`VehicleConfig`)**: Expects `vehicle_type` (e.g., "car") and the `route_geometry` (the path to follow).

### **Route Calculation Endpoint (Lines 35-54)**
`POST /api/route`
- **Lines 39-41**: Constructs a URL for the **OSRM (Open Source Routing Machine)** public demo API.
- **Line 43**: Sends the HTTP request to OSRM.
- **Lines 47-52**: Extracts the geometry (shape of the road), distance, and duration from the OSRM response and sends it back to the frontend.

### **Spawn Simulation Endpoint (Lines 56-73)**
`POST /api/simulate/spawn`
- **Line 58**: Generates a unique `vehicle_id` using the current timestamp.
- **Lines 61-66**: **Speed Logic**. Converts simple string types "truck/car/bike" into meters per second.
  - *Example*: Car = 100 km/h / 3.6 = ~27.7 m/s.
- **Lines 68-71**: Creates a generic `VehicleSimulator` instance (from `simulation.py`) and stores it in the global `vehicles` dictionary (Line 21).

### **Status Endpoint (Lines 75-87)**
`GET /api/simulate/{vehicle_id}`
- **Line 81**: Calls `sim.get_position()` to calculate where the car is *right now*.
- **Line 87**: Returns the coordinates and ETA to the frontend.

---

## 2. Simulation Logic (`backend/simulation.py`)

Handles the math of moving a dot along a line over time.

### **Initialization (Lines 5-27)**
- **Lines 11-20**: **Pre-calculation**. The route is a list of points. We loop through them and calculate the distance of every small segment. We store these as a list of segments.
- **Line 25**: Converts speed from meters/second to **degrees/second**. Since coordinates are in degrees (Lat/Lon), we need to move in "degree units". (Approx 1 degree = 111,000 meters).

### **Position Calculation (Lines 28-60)**
`get_position()`
- **Line 29**: Calculates `elapsed` time since the simulation started.
- **Line 30**: `distance_traveled` = `elapsed` * `speed`.
- **Lines 43-61**: **Segment Lookup Loop**.
  - We weave through the list of segments to find which one the car is currently on.
  - **Lines 50-51**: **Interpolation**. Once we find the current segment, we calculate exactly where between the `start` and `end` of that tiny line the car is.
  - **Line 59**: Calculates ETA based on remaining distance.

---

## 3. Frontend Map (`frontend/src/components/MapComponent.jsx`)

Wraps OpenLayers to display the map.

### **Initialization (Lines 27-94)**
- **Lines 31-72**: **Style Function**. Defines how things look.
  - **Lines 35-39**: Route is a blue line.
  - **Lines 58-71**: Vehicle is a colored circle based on `vType`.
- **Lines 75-85**: Creates the actual `new Map(...)`.
  - `target: mapRef.current` attaches it to the HTML div.
  - `layers`: Adds OSM tiles (streets) and our Vector layer (shapes).
- **Line 87**: **Click Event**. Detects clicks on the map, converts pixels to Longitude/Latitude, and calls the parent's `onMapClick`.

### **Updating Extensions (Lines 97-144)**
This `useEffect` runs whenever props change (like when the vehicle moves).
- **Line 98**: `vectorSource.current.clear()` wipes the board clean.
- **Lines 100-114**: Re-draws the Start (Green) and End (Red) dots.
- **Lines 116-123**: Re-draws the Route line.
- **Lines 125-132**: Re-draws the Vehicle.
- **Lines 135-142**: **Auto Zoom**. 
  - `mapInstance.current.getView().fit(...)`: Pans and zooms the camera so everything fits on the screen.

---

## 4. Frontend Logic (`frontend/src/App.jsx`)

The brain of the frontend.

### **State (Lines 6-12)**
- `points`: Array of 2 coordinates `[start, end]`.
- `route`: The shape of the road returned by backend.
- `vehicle`: Tracks `{ id, position, eta }`.

### **User Interaction (Lines 13-41)**
`handleMapClick`
- **Lines 16-23**: Logic to handle clicks. If 2 points already exist, it clears them and starts over. Ideally, it waits for 2 clicks.
- **Lines 27-40**: **API Call**. Once 2 points are selected (`newPoints.length === 2`), it immediately calls `getRoute` to draw the blue line.

### **Simulation Loop (Lines 54-77)**
This is the heartbeat of the app.
- **Line 55**: `setInterval` creates a loop.
- **Line 57**: Every **1000ms (1 second)**...
- **Line 59**: Call `getVehicleStatus(vehicle.id)`.
- **Lines 60-65**: Update the `vehicle` state with the new position. This triggers `MapComponent` to re-render, moving the car.
- **Lines 67-70**: If `status.finished` is true, stop the loop and alert the user.

### **UI Rendering (Lines 79-136)**
- **Lines 81-123**: **Sidebar**.
  - Shows "Start Simulation" button (Line 109).
  - Shows "Vehicle Status" card (Lines 115-121).
- **Lines 125-134**: **Map**. Renders key props to `MapComponent`.
