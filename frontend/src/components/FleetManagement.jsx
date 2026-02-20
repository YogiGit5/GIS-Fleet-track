import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Client } from '@stomp/stompjs';
import VehicleInfoCard from './VehicleInfoCard';

const FleetManagement = ({ isActive, onUpdateMap }) => {
    const [fleet, setFleet] = useState([]);
    const [selectedVehicle, setSelectedVehicle] = useState(null);
    const [followedVehicleId, setFollowedVehicleId] = useState(null);
    const clientRef = useRef(null);

    // Initialize WebSocket Connection
    useEffect(() => {
        const client = new Client({
            brokerURL: 'ws://127.0.0.1:8081/ws-fleet',
            reconnectDelay: 2000,
            heartbeatIncoming: 4000,
            heartbeatOutgoing: 4000,
            onConnect: () => {
                console.log('Connected to Fleet WebSocket');
                client.subscribe('/topic/fleet', (message) => {
                    const data = JSON.parse(message.body);
                    setFleet(data);
                });

                // 1. Initial Fetch to Sync State
                fetch('http://127.0.0.1:8081/api/fleet/vehicles')
                    .then(res => res.json())
                    .then(data => {
                        console.log("Initial Fleet Load:", data.length);
                        if (data.length > 0) {
                            setFleet(data);
                        } else {
                            // If empty, trigger start
                            console.log("Fleet empty, triggering start...");
                            fetch('http://127.0.0.1:8081/api/fleet/start', { method: 'POST' });
                        }
                    })
                    .catch(e => console.error("Failed to load fleet:", e));
            },
            onStompError: (frame) => {
                console.error('Broker reported error: ' + frame.headers['message']);
                console.error('Additional details: ' + frame.body);
            },
            onWebSocketError: (error) => {
                console.error('WebSocket connection error:', error);
            },
            onDisconnect: () => console.log('Disconnected from Fleet WebSocket'),
        });
        client.activate();
        clientRef.current = client;
        return () => {
            if (clientRef.current) clientRef.current.deactivate();
        };
    }, []);

    const handleStop = () => {
        fetch('http://127.0.0.1:8081/api/fleet/stop', { method: 'POST' })
            .catch(err => console.error("Failed to stop", err));
    };

    const handleReset = () => {
        fetch('http://127.0.0.1:8081/api/fleet/reset', { method: 'POST' })
            .catch(err => console.error("Failed to reset", err));
    };

    const handleVehicleSelect = useCallback((vehicle) => {
        if (!vehicle) {
            setSelectedVehicle(null);
            return;
        }
        // If passed just an ID (from map), find the object
        const vehicleObj = typeof vehicle === 'string' ? fleet.find(v => v.id === vehicle) : vehicle;
        if (vehicleObj) {
            console.log("Selected Vehicle:", vehicleObj.id);
            setSelectedVehicle(vehicleObj);
        }
    }, [fleet]);

    const handleStopFollow = useCallback(() => {
        console.log("Stopped Following");
        setFollowedVehicleId(null);
    }, []);

    // Sync with Map
    useEffect(() => {
        if (isActive && onUpdateMap) {
            onUpdateMap({
                fleet: fleet,
                vehiclePosition: null,
                vehicleBearing: 0,
                start: null,
                end: null,
                routeGeometry: null,
                searchLocation: null,
                onMapClickHandler: null,
                onMarkerDragEndHandler: null,
                // New Props
                selectedVehicle: selectedVehicle,
                onVehicleSelectHandler: handleVehicleSelect,
                followVehicleId: followedVehicleId,
                onStopFollowHandler: handleStopFollow
            });
        }
    }, [isActive, fleet, onUpdateMap, selectedVehicle, followedVehicleId, handleVehicleSelect, handleStopFollow]);

    const handleDispatch = useCallback((vehicleId, lat, lon) => {
        console.log(`Dispatching ${vehicleId} to ${lat}, ${lon}`);
        fetch('http://localhost:8081/api/fleet/dispatch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vehicleId, lat, lon })
        })
            .then(res => res.text())
            .then(msg => console.log(msg))
            .catch(err => console.error("Dispatch Failed", err));
    }, []);

    const handleFollow = useCallback((id) => {
        console.log("Following:", id);
        setFollowedVehicleId(id);

        // User Requirement: "after clicking follow vehicle has to be moved"
        // So we trigger dispatch here if it's selected
        const v = fleet.find(v => v.id === id);
        if (v) {
            // Defined coords here to avoid issues with impure calls during handler definition?
            // Actually Math.random is fine in handlers, but let's be safe.
            const lat = 12.90 + Math.random() * (13.05 - 12.90);
            const lon = 77.50 + Math.random() * (77.70 - 77.50);
            handleDispatch(id, lat, lon);
        }
    }, [fleet, handleDispatch]);

    const handleVehicleClick = (vehicle) => {
        handleVehicleSelect(vehicle);
    };

    if (!isActive) return null;

    return (
        <div style={{ position: 'absolute', top: '20px', left: '20px', width: '320px', zIndex: 1000, background: 'white', borderRadius: '8px', boxShadow: '0 2px 6px rgba(0,0,0,0.2)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 100px)' }}>

            {/* Header with Controls */}
            <div style={{ padding: '15px', background: '#1a73e8', color: 'white' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ fontWeight: 'bold' }}>Fleet Status ({fleet.length})</span>
                    <span style={{ fontSize: '10px', opacity: 0.8, background: 'rgba(255,255,255,0.2)', padding: '2px 6px', borderRadius: '4px' }}>LIVE</span>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={handleReset} style={{ flex: 1, background: 'white', color: '#1a73e8', border: 'none', padding: '6px', borderRadius: '4px', cursor: 'pointer', fontWeight: '500', fontSize: '12px' }}>
                        Reset
                    </button>
                    <button onClick={handleStop} style={{ flex: 1, background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.5)', padding: '6px', borderRadius: '4px', cursor: 'pointer', fontWeight: '500', fontSize: '12px' }}>
                        Stop
                    </button>
                </div>
            </div>

            {/* List */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
                {fleet.length === 0 && (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#666', fontSize: '13px' }}>
                        Connecting to fleet...
                    </div>
                )}
                {fleet.map(v => {
                    // Calculate progress
                    const progress = v.total_distance > 0 ? ((v.total_distance - v.remaining_distance) / v.total_distance) * 100 : 0;
                    const isSelected = selectedVehicle?.id === v.id;
                    // console.log("Render Item:", v.id, "Selected:", selectedVehicle?.id, "Match:", isSelected); // Comment out to avoid spam, or keep for one run

                    return (
                        <div key={v.id} onClick={() => handleVehicleClick(v)}
                            style={{
                                padding: '12px',
                                borderBottom: '1px solid #eee',
                                cursor: 'pointer',
                                background: isSelected ? '#e8f0fe' : 'white',
                                borderLeft: isSelected ? '4px solid #1a73e8' : '4px solid transparent'
                            }}
                            className="fleet-item">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                {/* Icon */}
                                <div style={{
                                    width: '32px', height: '32px',
                                    borderRadius: '50%',
                                    background: v.status === 'ONGOING' ? '#e8f0fe' : '#f1f3f4',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: v.status === 'ONGOING' ? '#1a73e8' : '#5f6368'
                                }}>
                                    {v.type === 'truck' ? '🚛' : v.type === 'car' ? '🚗' : v.type === 'bike' ? '🏍️' : '📦'}
                                </div>

                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: '500', fontSize: '14px', color: '#202124' }}>{v.name}</div>
                                    <div style={{ fontSize: '11px', color: '#5f6368', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        {v.status} • {v.speed ? `${Math.round(v.speed)} km/h` : '0 km/h'}
                                    </div>
                                </div>

                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '14px', fontWeight: '500', color: '#1a73e8' }}>
                                        {v.eta ? `${(v.eta / 60).toFixed(0)} min` : '--'}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#5f6368' }}>ETA</div>
                                </div>
                            </div>

                            {/* Progress Bar */}
                            <div style={{ height: '4px', background: '#f1f3f4', borderRadius: '2px', overflow: 'hidden' }}>
                                <div style={{ width: `${progress}%`, background: v.status === 'ONGOING' ? '#34a853' : '#9aa0a6', height: '100%', transition: 'width 1s linear' }} />
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Info Card - Rendered outside the list container but inside the main div (or outside if positioned absolutely) */}
            {/* Logic: If we want it on the RIGHT side of the SCREEN, we should probably Portal it or just position fixed */}
            {/* But since FleetManagement is just a component, let's put it here and use fixed positioning in the Card itself */}
            <VehicleInfoCard
                vehicle={selectedVehicle}
                onClose={() => setSelectedVehicle(null)}
                onFollow={(id) => followedVehicleId === id ? handleStopFollow() : handleFollow(id)}
                isFollowing={followedVehicleId === selectedVehicle?.id}
            />
        </div>
    );
};

export default FleetManagement;
