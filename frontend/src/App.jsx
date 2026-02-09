import { useState, useEffect } from 'react'
import './App.css'
import MapComponent from './components/MapComponent'
import { getRoute, spawnVehicle, getVehicleStatus } from './services/api'

function App() {
  const [points, setPoints] = useState([]); // [start, end]
  const [route, setRoute] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null); // { distance, duration }
  const [vehicle, setVehicle] = useState(null); // { id, position, eta }
  const [vehicleType, setVehicleType] = useState('car'); // car, truck, bike

  const handleMapClick = async (coords) => {
    let newPoints = [...points];

    if (newPoints.length >= 2) {
      newPoints = [coords];
      setRoute(null);
      setRouteInfo(null);
      setVehicle(null);
    } else {
      newPoints.push(coords);
    }

    setPoints(newPoints);

    if (newPoints.length === 2) {
      try {
        const data = await getRoute(newPoints[0], newPoints[1]);
        setRoute(data.geometry);
        setRouteInfo({
          distance: (data.distance / 1000).toFixed(2) + ' km',
          duration: (data.duration / 60).toFixed(0) + ' min'
        });
        console.log("Route info set:", data);
      } catch (err) {
        console.error("Route Error:", err);
        alert("Failed to create route");
      }
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

  return (
    <div className="app-container">
      <div className="sidebar">
        <h1>Fleet Track MVP</h1>
        <div className="instructions">
          <p>1. Click map to set START</p>
          <p>2. Click map to set END</p>
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
                onChange={(e) => setVehicleType(e.target.value)}
                style={{ width: '100%', padding: '8px' }}
                disabled={!!vehicle?.id}
              >
                <option value="car">Car (100km/h)</option>
                <option value="truck">Truck (60km/h)</option>
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

      <div className="map-container">
        <MapComponent
          start={points[0]}
          end={points[1]}
          routeGeometry={route}
          vehiclePosition={vehicle?.position}
          vehicleType={vehicle?.type}
          onMapClick={handleMapClick}
        />
      </div>
    </div>
  )
}

export default App
