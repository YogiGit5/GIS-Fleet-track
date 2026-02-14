import { useState, useEffect } from 'react'
import './App.css'
import MapComponent from './components/MapComponent'
import LocationSearch from './components/LocationSearch'
import { getRoute, spawnVehicle, getVehicleStatus, reverseGeocode } from './services/api' // Import reverseGeocode

function App() {
  const [points, setPoints] = useState([]); // [start, end]
  const [route, setRoute] = useState(null);

  const [routeInfo, setRouteInfo] = useState(null); // { distance, duration }
  const [vehicle, setVehicle] = useState(null); // { id, position, eta, bearing }
  const [vehicleType, setVehicleType] = useState('car'); // car, truck, bike
  const [searchLocation, setSearchLocation] = useState(null); // { lat, lon, display_name }

  // Calculate bearing between two coordinates [lon, lat]
  const calculateBearing = (start, end) => {
    if (!start || !end) return null;
    const startLat = start[1] * Math.PI / 180;
    const startLon = start[0] * Math.PI / 180;
    const endLat = end[1] * Math.PI / 180;
    const endLon = end[0] * Math.PI / 180;

    const y = Math.sin(endLon - startLon) * Math.cos(endLat);
    const x = Math.cos(startLat) * Math.sin(endLat) -
      Math.sin(startLat) * Math.cos(endLat) * Math.cos(endLon - startLon);
    const θ = Math.atan2(y, x);
    return (θ * 180 / Math.PI + 360) % 360; // Degrees 0-360
  };



  const [directionsMode, setDirectionsMode] = useState(false);
  const [fromLocation, setFromLocation] = useState(null);
  const [toLocation, setToLocation] = useState(null);

  const handleLocationSelect = (location) => {
    setSearchLocation(location);
    if (directionsMode) {
      setToLocation(location);
    }
  };

  const toggleDirectionsMode = () => {
    if (!directionsMode) {
      if (searchLocation) setToLocation(searchLocation);
    } else {
      setFromLocation(null);
      setToLocation(null);
    }
    setDirectionsMode(!directionsMode);
  };

  const handleSwap = () => {
    const temp = fromLocation;
    setFromLocation(toLocation);
    setToLocation(temp);
  };

  const handleSetStart = () => {
    if (searchLocation) {
      const coords = [parseFloat(searchLocation.lon), parseFloat(searchLocation.lat)];
      setPoints(prev => [coords, ...(prev[1] ? [prev[1]] : [])]); // Replace start
      setRoute(null);
    }
  };

  const handleSetEnd = () => {
    if (searchLocation) {
      const coords = [parseFloat(searchLocation.lon), parseFloat(searchLocation.lat)];
      setPoints(prev => [prev[0] || null, coords].filter(Boolean)); // Replace end or add if missing
      if (points[0]) {
        fetchRoute(points[0], coords, vehicleType);
      }
    }
  };

  // Modified: Map click now selects location instead of setting route points directly
  const handleMapClick = async (coords) => {
    try {
      // coords are [lon, lat]
      const data = await reverseGeocode(coords[1], coords[0]);

      const newLocation = {
        lat: coords[1],
        lon: coords[0],
        display_name: data.display_name || `${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}`
      };

      setSearchLocation(newLocation);
    } catch (err) {
      console.error("Failed to select location", err);
    }
  };

  const handleDirectionsClick = () => {
    if (searchLocation) {
      setToLocation(searchLocation);
      setDirectionsMode(true);
    }
  };

  const fetchRoute = async (start, end, type) => {
    try {
      const data = await getRoute(start, end, type);
      setRoute(data.geometry);


      setRouteInfo({
        distance: (data.distance / 1000).toFixed(2) + ' km',
        duration: (data.duration / 60).toFixed(0) + ' min'
      });
    } catch (err) {
      console.error("Route Error:", err);
      // alert("Failed to create route");
    }
  };



  const handleMarkerDragEnd = async (type, coords) => {
    // Coords come as [lon, lat] from OL
    try {
      const data = await reverseGeocode(coords[1], coords[0]);
      const displayName = data.display_name || `Dropped Pin (${type})`;

      if (type === 'start') {
        const newLoc = { lat: coords[1], lon: coords[0], display_name: displayName };
        setFromLocation(newLoc);

        if (!directionsMode) {
          setPoints(prev => [coords, prev[1]].filter(Boolean));
          if (points[1]) fetchRoute(coords, points[1], vehicleType);
        }

      } else if (type === 'end') {
        const newLoc = { lat: coords[1], lon: coords[0], display_name: displayName };
        setToLocation(newLoc);

        if (!directionsMode) {
          setPoints(prev => [prev[0], coords].filter(Boolean));
          if (points[0]) fetchRoute(points[0], coords, vehicleType);
        }
      }
    } catch (e) {
      console.error("Failed to reverse geocode drag end", e);
      // Fallback
      if (type === 'start') {
        setFromLocation({ lat: coords[1], lon: coords[0], display_name: "Dropped Pin (Start)" });
      } else {
        setToLocation({ lat: coords[1], lon: coords[0], display_name: "Dropped Pin (End)" });
      }
    }
  };

  const handleTypeChange = (e) => {
    const newType = e.target.value;
    setVehicleType(newType);
    if (points.length === 2) {
      fetchRoute(points[0], points[1], newType);
    }
  };

  const startSimulation = async () => {
    if (!route) return;
    try {
      // Pass selected vehicle type
      const data = await spawnVehicle(vehicleType, route);
      setVehicle({ id: data.vehicle_id, position: null, eta: null, type: vehicleType });
    } catch (err) {
      alert("Failed to start simulation");
    }
  };

  useEffect(() => {
    let interval;
    if (vehicle?.id && !vehicle?.finished) {
      interval = setInterval(async () => {
        try {
          const status = await getVehicleStatus(vehicle.id);
          setVehicle(prev => ({
            ...prev,
            position: status.position,
            bearing: calculateBearing(prev?.position, status.position) || prev?.bearing || 0,
            eta: status.eta ? (status.eta / 60).toFixed(1) + ' min' : '0 min',
            finished: status.finished
          }));

          if (status.finished) {
            clearInterval(interval);
            alert("Vehicle arrived!");
          }
        } catch (err) {
          console.error(err);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [vehicle?.id, vehicle?.finished]);

  // Directions Mode Routing Trigger
  useEffect(() => {
    if (directionsMode && fromLocation && toLocation) {
      const startCoords = [parseFloat(fromLocation.lon), parseFloat(fromLocation.lat)];
      const endCoords = [parseFloat(toLocation.lon), parseFloat(toLocation.lat)];

      // Update points so map shows markers
      setPoints([startCoords, endCoords]);

      // Fetch route
      fetchRoute(startCoords, endCoords, vehicleType);
    }
  }, [directionsMode, fromLocation, toLocation, vehicleType]);

  return (
    <div className="app-container">
      <div className="sidebar">
        <h1>Fleet Track MVP</h1>
        <div className="instructions">
          <p>1. <b>Click map</b> to select location</p>
          <p>2. Click <b>Directions</b></p>
          <p>3. Select Vehicle & Start</p>
        </div>

        {routeInfo && (
          <div className="info-card">
            <h3>Route Info</h3>
            <p><strong>Distance:</strong> {routeInfo.distance}</p>
            <p><strong>Est. Time:</strong> {routeInfo.duration}</p>

            <div style={{ marginTop: '10px', marginBottom: '10px' }}>
              <label style={{ display: 'block', marginBottom: '5px' }}>Vehicle Type:</label>
              <select
                value={vehicleType}
                onChange={handleTypeChange}
                style={{ width: '100%', padding: '8px' }}
                disabled={!!vehicle?.id}
              >
                <option value="car">Car (100km/h)</option>
                <option value="truck">Truck (60km/h)</option>
                <option value="container">Long Container (40km/h)</option>
                <option value="bike">Bike (30km/h)</option>
              </select>
            </div>

            <button onClick={startSimulation} disabled={!!vehicle?.id}>
              {vehicle?.id ? 'Simulation Running...' : 'Start Simulation'}
            </button>
          </div>
        )}

        {vehicle && (
          <div className="info-card vehicle-card">
            <h3>Vehicle Status</h3>
            <p><strong>Type:</strong> {vehicle.type?.toUpperCase()}</p>
            <p><strong>ETA:</strong> {vehicle.eta || '--'}</p>
            {vehicle.finished && <p className="success">Arrived!</p>}
          </div>
        )}
      </div>

      <div className="map-container" style={{ position: 'relative' }}>
        <LocationSearch
          onLocationSelect={handleLocationSelect}
          selectedLocation={searchLocation}
          onSetStart={handleSetStart}
          onSetEnd={handleSetEnd}
          directionsMode={directionsMode}
          fromLocation={fromLocation}
          toLocation={toLocation}
          onSetFrom={setFromLocation}
          onSetTo={setToLocation}
          onSwap={handleSwap}
        />

        {!directionsMode && (
          <button
            onClick={toggleDirectionsMode}
            style={{
              position: 'absolute',
              bottom: '30px',
              right: '20px',
              zIndex: 1000,
              width: '50px',
              height: '50px',
              borderRadius: '50%',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px'
            }}
            title="Directions"
          >
            ↱
          </button>
        )}

        {/* Selected Location Details Card */}
        {searchLocation && !directionsMode && (
          <div style={{
            position: 'absolute',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            backgroundColor: 'white',
            padding: '15px',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            width: '300px'
          }}>
            <div style={{ fontWeight: 'bold', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {searchLocation.display_name}
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>
              {parseFloat(searchLocation.lat).toFixed(4)}, {parseFloat(searchLocation.lon).toFixed(4)}
            </div>
            <button
              onClick={handleDirectionsClick}
              style={{
                backgroundColor: '#4285F4',
                color: 'white',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '20px',
                cursor: 'pointer',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px'
              }}
            >
              <span style={{ fontSize: '18px' }}>↱</span> Directions
            </button>
          </div>
        )}

        <MapComponent
          start={points[0]}
          end={points[1]}
          routeGeometry={route}
          vehiclePosition={vehicle?.position}
          vehicleBearing={vehicle?.bearing}
          vehicleType={vehicle?.type}
          searchLocation={searchLocation} // Use same prop to show yellow marker
          onMapClick={handleMapClick}
          onMarkerDragEnd={handleMarkerDragEnd}
        />
      </div>
    </div>
  )
}

export default App
