import { useState, useCallback } from 'react'
import './App.css'
import MapComponent from './components/MapComponent'
import FleetManagement from './components/FleetManagement'
import RouteNavigation from './components/RouteNavigation'

function App() {
  const [activeTab, setActiveTab] = useState('route'); // route | fleet
  const [mapProps, setMapProps] = useState({});
  const [userLocation, setUserLocation] = useState(null);

  const handleMapUpdate = useCallback((props) => {
    setMapProps(props);
  }, []);

  const handleUserLocationUpdate = useCallback((location) => {
    setUserLocation(location);
  }, []);

  return (
    <div className="app-container">
      {/* Header Tabs */}
      <div className="header">
        <div className="header-title">
          <span>Fleet Track</span>
        </div>
        <div className="tabs">
          <div
            className={`tab ${activeTab === 'route' ? 'active' : ''} `}
            onClick={() => setActiveTab('route')}
          >
            Route Navigation
          </div>
          <div
            className={`tab ${activeTab === 'fleet' ? 'active' : ''} `}
            onClick={() => setActiveTab('fleet')}
          >
            Fleet Management
          </div>
        </div>
        <div style={{ width: '100px' }}></div> {/* Spacer for center alignment */}
      </div>

      <div className="map-container">

        {/* Navigation Mode UI Overlay - Keep mounted to preserve state */}
        <div style={{ display: activeTab === 'route' ? 'block' : 'none' }}>
          <RouteNavigation
            isActive={activeTab === 'route'}
            onUpdateMap={handleMapUpdate}
            userLocation={userLocation}
          />
        </div>

        {/* Fleet Management Mode - Render when active */}
        {activeTab === 'fleet' && (
          <FleetManagement
            isActive={true}
            onUpdateMap={handleMapUpdate}
          />
        )}

        {/* Shared Map Component */}
        <MapComponent
          activeTab={activeTab} // Pass active tab
          fleet={mapProps.fleet}
          start={mapProps.start}
          end={mapProps.end}
          routeGeometry={mapProps.routeGeometry}
          vehiclePosition={mapProps.vehiclePosition}
          vehicleBearing={mapProps.vehicleBearing}
          vehicleType={mapProps.vehicleType}
          searchLocation={mapProps.searchLocation}
          onMapClick={mapProps.onMapClickHandler}
          onMarkerDragEnd={mapProps.onMarkerDragEndHandler}
          onVehicleSelect={mapProps.onVehicleSelectHandler}
          followVehicleId={mapProps.followVehicleId}
          onStopFollow={mapProps.onStopFollowHandler}
          onUserLocationUpdate={handleUserLocationUpdate}
        />
      </div>
    </div>
  )
}

export default App

