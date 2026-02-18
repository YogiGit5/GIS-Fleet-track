import React, { useState, useEffect, useCallback } from 'react';
import { getRoute, spawnVehicle, getVehicleStatus, reverseGeocode } from '../services/api';
import LocationSearch from './LocationSearch';

// Helper Function (Moved outside to be pure and avoid Hook dependency issues)
const calculateBearingOutside = (start, end) => {
    if (!start || !end) return null;
    const startLat = start[1] * Math.PI / 180;
    const startLon = start[0] * Math.PI / 180;
    const endLat = end[1] * Math.PI / 180;
    const endLon = end[0] * Math.PI / 180;

    const y = Math.sin(endLon - startLon) * Math.cos(endLat);
    const x = Math.cos(startLat) * Math.sin(endLat) -
        Math.sin(startLat) * Math.cos(endLat) * Math.cos(endLon - startLon);
    const θ = Math.atan2(y, x);
    return (θ * 180 / Math.PI + 360) % 360;
};

const RouteNavigation = ({ isActive, onUpdateMap, userLocation }) => {
    // 1. Move all App.jsx state here
    const [points, setPoints] = useState([]); // [start, end]
    const [route, setRoute] = useState(null);
    const [routeInfo, setRouteInfo] = useState(null); // { distance, duration }
    const [vehicle, setVehicle] = useState(null); // { id, position, eta, bearing }
    // const [vehicleType, setVehicleType] = useState('car'); // Unused
    const vehicleType = 'car';

    // Search State
    const [searchLocation, setSearchLocation] = useState(null);
    const [directionsMode, setDirectionsMode] = useState(false);
    const [fromLocation, setFromLocation] = useState(null);
    const [toLocation, setToLocation] = useState(null);

    // 4. API Calls (Memoized)
    const fetchRoute = useCallback(async (start, end, type) => {
        try {
            const data = await getRoute(start, end, type);
            setRoute(data.geometry);
            setRouteInfo({
                distance: (data.distance / 1000).toFixed(1) + ' km',
                duration: Math.ceil(data.duration / 60) + ' min'
            });
        } catch (err) {
            console.error("Route Error:", err);
        }
    }, []);

    // 3. Handlers
    const handleLocationSelect = (location) => {
        setSearchLocation(location);
        if (directionsMode) {
            setToLocation(location);
        }
    };

    const toggleDirectionsMode = () => {
        if (!directionsMode) {
            if (searchLocation) setToLocation(searchLocation);
            // Default From to User Location
            if (userLocation) setFromLocation(userLocation);
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

    const handleDirectionsClick = () => {
        if (searchLocation) {
            setToLocation(searchLocation);
            // Default From to User Location
            if (userLocation) setFromLocation(userLocation);
            setDirectionsMode(true);
        }
    };

    const startSimulation = async () => {
        if (!route) return;
        try {
            const data = await spawnVehicle(vehicleType, route); // Always 'car' for now if hidden
            setVehicle({ id: data.vehicle_id, position: null, eta: null, type: vehicleType });
        } catch (err) {
            console.error("Simulation Start Error:", err);
            alert("Failed to start simulation");
        }
    };

    // 5. Effects
    // Vehicle Status Polling
    useEffect(() => {
        let interval;
        if (vehicle?.id && !vehicle?.finished) {
            interval = setInterval(async () => {
                try {
                    const status = await getVehicleStatus(vehicle.id);
                    setVehicle(prev => ({
                        ...prev,
                        position: status.position,
                        bearing: calculateBearingOutside(prev?.position, status.position) || prev?.bearing || 0,
                        eta: status.eta ? (status.eta / 60).toFixed(1) + ' min' : '0 min',
                        distance: status.remaining_distance ? (status.remaining_distance / 1000).toFixed(1) + ' km' : prev?.distance,
                        finished: status.finished
                    }));

                    if (status.finished) {
                        clearInterval(interval);
                    }
                } catch (err) {
                    console.error(err);
                }
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [vehicle?.id, vehicle?.finished]);

    // Directions Mode Trigger — fetch route whenever from/to are both set
    useEffect(() => {
        if (directionsMode && fromLocation && toLocation) {
            const startCoords = [parseFloat(fromLocation.lon), parseFloat(fromLocation.lat)];
            const endCoords = [parseFloat(toLocation.lon), parseFloat(toLocation.lat)];
            setPoints([startCoords, endCoords]);
            fetchRoute(startCoords, endCoords, vehicleType);
        }
    }, [directionsMode, fromLocation, toLocation, vehicleType, fetchRoute]);


    // 6. Map Interaction Handlers (Exposed via onUpdateMap)
    const handleMapClick = useCallback(async (coords) => {
        try {
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
    }, []);

    const handleMarkerDragEnd = useCallback(async (type, coords) => {
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
        }
    }, [directionsMode, points, vehicleType, fetchRoute]);

    // 7. Sync State with Parent (App.jsx -> MapComponent)
    useEffect(() => {
        if (onUpdateMap && isActive) {
            onUpdateMap({
                start: points[0],
                end: points[1],
                routeGeometry: route,
                vehiclePosition: vehicle?.position,
                vehicleBearing: vehicle?.bearing,
                vehicleType: vehicle?.type,
                searchLocation: searchLocation,
                // Pass handlers to Parent so MapComponent can call them
                onMapClickHandler: handleMapClick,
                onMarkerDragEndHandler: handleMarkerDragEnd,
                fleet: null // Ensure fleet is cleared in nav mode
            });
        }
    }, [isActive, points, route, vehicle, searchLocation, onUpdateMap, handleMapClick, handleMarkerDragEnd]);

    // 8. Render UI
    return (
        <>
            {/* Top Left: Search & Directions Panel */}
            <div style={{ position: 'absolute', top: '20px', left: '20px', width: '350px', zIndex: 1000 }}>
                <LocationSearch
                    onLocationSelect={handleLocationSelect}
                    selectedLocation={searchLocation}
                    directionsMode={directionsMode}
                    fromLocation={fromLocation}
                    toLocation={toLocation}
                    onSetFrom={setFromLocation}
                    onSetTo={setToLocation}
                    onSwap={handleSwap}
                />
            </div>

            {/* Google Maps Style Bottom Card - Unified */}
            {(routeInfo || vehicle) && (
                <div className="info-card"
                    style={{
                        position: 'fixed',
                        bottom: '30px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 1000,
                        backgroundColor: 'white',
                        borderRadius: '16px',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '16px 24px',
                        minWidth: '340px',
                        maxWidth: '90vw',
                        gap: '20px'
                    }}>

                    {/* Left Side: Info / Status */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {vehicle?.finished ? (
                            // ARRIVED STATE
                            <>
                                <div style={{ fontSize: '1.4rem', fontWeight: '700', color: '#137333' }}>
                                    Arrived!
                                </div>
                                <div style={{ fontSize: '0.9rem', color: '#5f6368', fontWeight: '500' }}>
                                    Destination reached
                                </div>
                            </>
                        ) : vehicle?.id ? (
                            // EN ROUTE STATE
                            <>
                                <div style={{ fontSize: '1.4rem', fontWeight: '700', color: '#1a73e8' }}>
                                    {vehicle.eta || routeInfo?.duration}
                                </div>
                                <div style={{ fontSize: '0.9rem', color: '#5f6368', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#1a73e8', display: 'inline-block' }}></span>
                                    En Route {vehicle.distance ? `• (${vehicle.distance})` : ''}
                                </div>
                            </>
                        ) : (
                            // PRE-TRIP STATE
                            <>
                                <div style={{ fontSize: '1.4rem', fontWeight: '700', color: '#188038' }}>
                                    {routeInfo?.duration}
                                </div>
                                <div style={{ fontSize: '0.9rem', color: '#5f6368', fontWeight: '500' }}>
                                    {routeInfo?.distance}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Right Side: Action Button */}
                    <div>
                        {!vehicle?.finished && (
                            <button
                                onClick={startSimulation}
                                disabled={!!vehicle?.id}
                                style={{
                                    margin: 0,
                                    padding: '12px 24px',
                                    borderRadius: '24px',
                                    background: vehicle?.id ? '#f1f3f4' : '#1a73e8',
                                    color: vehicle?.id ? '#3c4043' : 'white',
                                    fontSize: '1rem',
                                    fontWeight: '500',
                                    border: 'none',
                                    cursor: vehicle?.id ? 'default' : 'pointer',
                                    boxShadow: vehicle?.id ? 'none' : '0 2px 6px rgba(0,0,0,0.3)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}
                            >
                                {vehicle?.id ? (
                                    <>
                                        <span>Navigating</span>
                                    </>
                                ) : (
                                    <>
                                        <span style={{ fontSize: '1.2rem' }}>➜</span> Start
                                    </>
                                )}
                            </button>
                        )}
                        {vehicle?.finished && (
                            <button
                                onClick={() => { setVehicle(null); setRoute(null); setRouteInfo(null); setPoints([]); }}
                                style={{
                                    margin: 0,
                                    padding: '12px 24px',
                                    borderRadius: '24px',
                                    background: '#f1f3f4',
                                    color: '#3c4043',
                                    fontSize: '1rem',
                                    fontWeight: '500',
                                    border: 'none',
                                    cursor: 'pointer'
                                }}
                            >
                                Done
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Bottom Right: Directions Toggle Button */}
            {!directionsMode && (
                <button
                    onClick={toggleDirectionsMode}
                    style={{
                        position: 'absolute',
                        bottom: '30px',
                        right: '20px',
                        zIndex: 1000,
                        width: '56px',
                        height: '56px',
                        borderRadius: '50%',
                        backgroundColor: '#1a73e8',
                        color: 'white',
                        border: 'none',
                        boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '24px',
                        transition: 'transform 0.2s'
                    }}
                    title="Directions"
                >
                    ↱
                </button>
            )}

            {/* Bottom Center: Selected Location details */}
            {searchLocation && !directionsMode && (
                <div style={{
                    position: 'absolute',
                    bottom: '30px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 1000,
                    backgroundColor: 'white',
                    padding: '15px',
                    borderRadius: '12px',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    width: '320px'
                }}>
                    <div style={{ fontWeight: 600, fontSize: '15px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {searchLocation.display_name}
                    </div>
                    <div style={{ fontSize: '13px', color: '#5f6368' }}>
                        {parseFloat(searchLocation.lat).toFixed(4)}, {parseFloat(searchLocation.lon).toFixed(4)}
                    </div>
                    <button
                        onClick={handleDirectionsClick}
                        style={{
                            backgroundColor: '#1a73e8',
                            color: 'white',
                            border: 'none',
                            padding: '10px 20px',
                            borderRadius: '24px',
                            cursor: 'pointer',
                            fontWeight: 500,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            marginTop: '5px'
                        }}
                    >
                        <span style={{ fontSize: '18px' }}>↱</span> Directions
                    </button>
                </div>
            )}
        </>
    );
};

export default RouteNavigation;
