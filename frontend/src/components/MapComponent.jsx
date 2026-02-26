import React, { useEffect, useRef, useState } from 'react';
import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import { OSM, Vector as VectorSource, XYZ } from 'ol/source';
import Feature from 'ol/Feature';
import { Point, LineString } from 'ol/geom';
import { fromLonLat, toLonLat } from 'ol/proj';
import { Circle as CircleStyle, Fill, Stroke, Style, Icon } from 'ol/style';
import { Translate, DragRotate } from 'ol/interaction';
import { unByKey } from 'ol/Observable';
import { shiftKeyOnly } from 'ol/events/condition';
import { reverseGeocode } from '../services/api';

const MapComponent = ({ activeTab, fleet, start, end, routeGeometry, vehiclePosition, vehicleBearing, vehicleType, searchLocation, onMapClick, onMarkerDragEnd, onVehicleSelect, followVehicleId, onStopFollow, onUserLocationUpdate }) => {
    const mapRef = useRef(null);
    const mapInstance = useRef(null);
    const vectorSource = useRef(new VectorSource());
    const onMapClickRef = useRef({ onMapClick, onMarkerDragEnd, onVehicleSelect });
    const translateInteraction = useRef(null);
    const isFollowingRef = useRef(false); // Use ref for event handlers to avoid stale closures
    const followVehicleIdRef = useRef(null); // Tracks followed vehicle ID inside rAF loop

    // Interpolation State
    const vehicleStates = useRef({});
    const animationFrameId = useRef(null);

    const [userLocation, setUserLocation] = useState(null);
    const [rotation, setRotation] = useState(0);

    // Keep callback ref updated
    useEffect(() => {
        onMapClickRef.current = { onMapClick, onMarkerDragEnd, onVehicleSelect };
    }, [onMapClick, onMarkerDragEnd, onVehicleSelect]);

    // Keep followVehicleIdRef in sync with prop
    useEffect(() => {
        followVehicleIdRef.current = followVehicleId;
    }, [followVehicleId]);

    // 1. Initialize Map (Run Once)
    useEffect(() => {
        if (!mapInstance.current) {

            // Vector Layer for Markers/Route
            const vectorLayer = new VectorLayer({
                source: vectorSource.current,
                style: (feature) => {
                    const type = feature.get('type');
                    // Get bearing (rotation) in radians. Default 0.
                    const bearing = feature.get('bearing') || 0;
                    const rotation = bearing * Math.PI / 180;

                    if (type === 'route') return new Style({ stroke: new Stroke({ color: '#4285F4', width: 5 }) }); // Google Blue

                    if (type === 'route-traveled') return new Style({ stroke: new Stroke({ color: '#FF9800', width: 4 }) }); // Orange for traveled

                    if (type === 'route-fleet') return new Style({ stroke: new Stroke({ color: '#9C27B0', width: 4, lineDash: [10, 10] }), zIndex: 1 }); // Purple dashed line for POI routes

                    if (type === 'start') {
                        // Blue Circle with white border (Google Maps "My Location" style)
                        return new Style({
                            image: new CircleStyle({
                                radius: 7,
                                fill: new Fill({ color: '#4285F4' }),
                                stroke: new Stroke({ color: 'white', width: 2 }),
                            })
                        });
                    }

                    if (type === 'user-location') {
                        // Current User Location (Blue Pulse or Dot)
                        return new Style({
                            image: new CircleStyle({
                                radius: 6,
                                fill: new Fill({ color: '#4285F4' }),
                                stroke: new Stroke({ color: 'white', width: 2 }),
                            }) // Simplified blue dot for now
                        });
                    }

                    if (type === 'end' || type === 'dest-flag') {
                        // Red Pin/Flag. Using a Data URI for a standard red pin shape.
                        const pinSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#EA4335"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>';
                        const pinUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(pinSvg);
                        return new Style({
                            image: new Icon({
                                anchor: [0.5, 1], // Bottom center
                                src: pinUrl,
                                scale: 1.5
                            }),
                            zIndex: 10
                        });
                    }

                    if (type === 'vehicle') {
                        // Navigation Arrow (Triangle)
                        const arrowSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#4285F4" stroke="white" stroke-width="2"><path d="M12 2L2 22l10-4 10 4L12 2z"/></svg>';
                        const arrowUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(arrowSvg);
                        return new Style({
                            image: new Icon({
                                anchor: [0.5, 0.5],
                                src: arrowUrl,
                                scale: 1.2,
                                rotation: rotation,
                                rotateWithView: true
                            })
                        });
                    }
                }
            });

            // Map Layers
            const osmLayer = new TileLayer({ source: new OSM(), visible: true });
            const satelliteLayer = new TileLayer({
                source: new XYZ({ url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', maxZoom: 19 }),
                visible: false
            });

            mapInstance.current = new Map({
                target: mapRef.current,
                layers: [satelliteLayer, osmLayer, vectorLayer],
                // Default to Mysore/Bangalore area
                view: new View({ center: fromLonLat([77.5819, 12.9792]), zoom: 12 })
            });

            // Geolocation: Get User Position
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    async (position) => {
                        const { latitude, longitude } = position.coords;
                        const coords = fromLonLat([longitude, latitude]);
                        setUserLocation(coords); // Save for marker

                        // Reverse geocode to get real address
                        let displayName = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
                        try {
                            const geo = await reverseGeocode(latitude, longitude);
                            if (geo && geo.display_name) {
                                displayName = geo.display_name;
                            }
                        } catch (e) {
                            console.warn('Reverse geocode failed, using coordinates:', e);
                        }

                        // Notify Parent (App.jsx) with real address
                        if (onUserLocationUpdate) {
                            onUserLocationUpdate({
                                lat: latitude,
                                lon: longitude,
                                display_name: displayName
                            });
                        }

                        // Center view on user
                        mapInstance.current.getView().animate({
                            center: coords,
                            zoom: 15,
                            duration: 1000
                        });
                        console.log("Zoomed to user location:", [longitude, latitude]);
                    },
                    (error) => {
                        console.warn('Geolocation failed or denied:', error);
                    },
                    { enableHighAccuracy: true }
                );
            }

            // Layer Toggle
            window.toggleLayer = (layerName) => {
                const isSat = layerName === 'satellite';
                satelliteLayer.setVisible(isSat);
                osmLayer.setVisible(!isSat);
            };

            // Click Handler
            mapInstance.current.on('click', (event) => {
                // Check if clicked heavily on a feature (marker or route)
                const feature = mapInstance.current.forEachFeatureAtPixel(event.pixel, (feature) => feature, {
                    hitTolerance: 5 // pixels
                });

                if (feature) {
                    const type = feature.get('type');
                    console.log("Map Clicked Feature:", type, feature.get('id'));

                    if (type === 'route-alt') {
                        const index = feature.get('altIndex');
                        if (onMapClickRef.current.onAlternativeSelect) {
                            onMapClickRef.current.onAlternativeSelect(index);
                            return; // Stop propagation
                        }
                    } else if (type === 'vehicle-fleet') {
                        const vehicleId = feature.getId(); // Use getId() for internal feature ID
                        if (onMapClickRef.current.onVehicleSelect) {
                            onMapClickRef.current.onVehicleSelect(vehicleId);
                            return; // Stop propagation
                        }
                    }
                }

                // Default map click (e.g. set point)
                const coords = toLonLat(event.coordinate);
                if (onMapClickRef.current.onMapClick) onMapClickRef.current.onMapClick(coords);
            });

            // Add Translate Interaction (Draggable Markers)
            const translate = new Translate({
                source: vectorSource.current,
                filter: (feature) => {
                    const type = feature.get('type');
                    // Only allow dragging start and end markers
                    return type === 'start' || type === 'end';
                }
            });

            translate.on('translateend', (evt) => {
                const feature = evt.features.getArray()[0];
                const type = feature.get('type');
                const coords = toLonLat(feature.getGeometry().getCoordinates());

                if (onMapClickRef.current.onMarkerDragEnd) {
                    onMapClickRef.current.onMarkerDragEnd(type, coords);
                }
            });

            mapInstance.current.addInteraction(translate);

            // Add DragRotate interaction (Shift + Drag)
            const dragRotate = new DragRotate({
                condition: shiftKeyOnly
            });
            mapInstance.current.addInteraction(dragRotate);

            translateInteraction.current = translate;
        }
    }, []);

    // 2. Update Features (React to props - Fleet & Nav)
    useEffect(() => {
        const source = vectorSource.current;
        if (!source) return;

        // --- FLEET MODE (With Interpolation) ---
        if (activeTab === 'fleet') {
            if (!fleet) return;

            const now = Date.now();
            const activeIds = new Set();

            fleet.forEach(vehicle => {
                activeIds.add(vehicle.id);
                if (!vehicle.position) return;

                const targetCoords = fromLonLat(vehicle.position);
                let feature = source.getFeatureById(vehicle.id);
                let isNew = false;

                if (!feature) {
                    isNew = true;
                    feature = new Feature({
                        geometry: new Point(targetCoords),
                        type: 'vehicle-fleet',
                    });
                    feature.setId(vehicle.id);
                    source.addFeature(feature);
                }

                // Update vehicle state for interpolation
                const currentState = vehicleStates.current[vehicle.id];
                let startPos = targetCoords;

                if (!isNew && currentState) {
                    // Use current visual position as start to avoid jumping
                    const currentGeom = feature.getGeometry().getCoordinates();
                    startPos = currentGeom;
                }

                vehicleStates.current[vehicle.id] = {
                    startPos: startPos,
                    targetPos: targetCoords,
                    startTime: now,
                    duration: 1000 // Assume 1s updates
                };

                // Update static properties immediately
                feature.set('status', vehicle.status);
                feature.set('heading', vehicle.heading);
                feature.setStyle(createVehicleStyle(vehicle));

                // Handle Halo Creation (Position updated in anim loop)
                const haloId = `halo-${vehicle.id}`;
                let haloFeature = source.getFeatureById(haloId);

                // Handle POI Route and Destination Flag
                const routeId = `route-fleet-${vehicle.id}`;
                const destFlagId = `dest-flag-${vehicle.id}`;
                let routeFeature = source.getFeatureById(routeId);
                let destFlagFeature = source.getFeatureById(destFlagId);

                if (vehicle.id === followVehicleId) {
                    if (!haloFeature) {
                        haloFeature = new Feature({
                            geometry: new Point(targetCoords),
                            type: 'halo'
                        });
                        haloFeature.setId(haloId);
                        haloFeature.setStyle(new Style({
                            image: new CircleStyle({
                                radius: 30,
                                stroke: new Stroke({ color: 'rgba(26, 115, 232, 0.6)', width: 2, lineDash: [5, 5] }),
                                fill: new Fill({ color: 'rgba(26, 115, 232, 0.1)' })
                            }),
                            zIndex: 9
                        }));
                        source.addFeature(haloFeature);
                    }

                    // Render POI Destination Flag and Route Line
                    if (vehicle.destination && vehicle.route && vehicle.route.length > 0) {
                        const routeCoords = vehicle.route.map(p => fromLonLat(p));
                        if (!routeFeature) {
                            routeFeature = new Feature({
                                geometry: new LineString(routeCoords),
                                type: 'route-fleet'
                            });
                            routeFeature.setId(routeId);
                            source.addFeature(routeFeature);
                        } else {
                            routeFeature.getGeometry().setCoordinates(routeCoords);
                        }

                        const destCoords = fromLonLat(vehicle.destination.position);
                        if (!destFlagFeature) {
                            destFlagFeature = new Feature({
                                geometry: new Point(destCoords),
                                type: 'dest-flag'
                            });
                            destFlagFeature.setId(destFlagId);
                            source.addFeature(destFlagFeature);
                        } else {
                            destFlagFeature.getGeometry().setCoordinates(destCoords);
                        }
                    } else {
                        if (routeFeature) source.removeFeature(routeFeature);
                        if (destFlagFeature) source.removeFeature(destFlagFeature);
                    }

                } else {
                    if (haloFeature) source.removeFeature(haloFeature);
                    if (routeFeature) source.removeFeature(routeFeature);
                    if (destFlagFeature) source.removeFeature(destFlagFeature);
                }
            });

            // Cleanup Stale
            Object.keys(vehicleStates.current).forEach(id => {
                if (!activeIds.has(id)) {
                    delete vehicleStates.current[id];
                    const f = source.getFeatureById(id);
                    if (f) source.removeFeature(f);
                    const h = source.getFeatureById(`halo-${id}`);
                    if (h) source.removeFeature(h);
                    const r = source.getFeatureById(`route-fleet-${id}`);
                    if (r) source.removeFeature(r);
                    const d = source.getFeatureById(`dest-flag-${id}`);
                    if (d) source.removeFeature(d);
                }
            });

        } else {
            // Not Fleet Mode: Clear fleet features
            source.getFeatures().forEach(f => {
                const t = f.get('type');
                if (t === 'vehicle-fleet' || t === 'halo' || t === 'route-fleet' || t === 'dest-flag') {
                    source.removeFeature(f);
                }
            });
        }

        // --- NAVIGATION MODE ---
        if (activeTab === 'route') {
            // Always clear old start/end/vehicle/route/search features before re-drawing
            source.getFeatures().forEach(f => {
                const t = f.get('type');
                if (t === 'start' || t === 'end' || t === 'search') {
                    source.removeFeature(f);
                }
            });

            // Draw start marker
            if (start) {
                source.addFeature(new Feature({ geometry: new Point(fromLonLat(start)), type: 'start' }));
            }
            // Draw end marker
            if (end) {
                source.addFeature(new Feature({ geometry: new Point(fromLonLat(end)), type: 'end' }));
            }

            if (routeGeometry) {
                const coords = routeGeometry.coordinates.map(c => fromLonLat(c));

                // Remove old route features
                const oldRoutes = source.getFeatures().filter(f => f.get('type') && f.get('type').startsWith('route'));
                oldRoutes.forEach(f => source.removeFeature(f));

                // Draw Main Route (Split if moving)
                if (vehiclePosition) {
                    // Split route into Traveled vs Remaining
                    let minDist = Infinity;
                    let closestIndex = 0;
                    const vPos = fromLonLat(vehiclePosition);

                    coords.forEach((c, i) => {
                        const dx = c[0] - vPos[0];
                        const dy = c[1] - vPos[1];
                        const dist = dx * dx + dy * dy;
                        if (dist < minDist) {
                            minDist = dist;
                            closestIndex = i;
                        }
                    });

                    const traveledCoords = coords.slice(0, closestIndex + 1);
                    if (traveledCoords.length > 1) {
                        source.addFeature(new Feature({ geometry: new LineString(traveledCoords), type: 'route-traveled' }));
                    }

                    const remainingCoords = coords.slice(closestIndex);
                    if (remainingCoords.length > 1) {
                        source.addFeature(new Feature({ geometry: new LineString(remainingCoords), type: 'route' }));
                    }
                } else {
                    source.addFeature(new Feature({ geometry: new LineString(coords), type: 'route' }));
                }

                if (mapInstance.current && !vehiclePosition) {
                    mapInstance.current.getView().fit(source.getExtent(), { padding: [50, 50, 50, 50], maxZoom: 16, duration: 500 });
                }
            } else {
                // No route yet — clear any stale route lines
                source.getFeatures().forEach(f => {
                    if (f.get('type') && f.get('type').startsWith('route')) source.removeFeature(f);
                });
            }

            if (vehiclePosition) {
                let vFeat = source.getFeatures().find(f => f.get('type') === 'vehicle');
                if (vFeat) {
                    vFeat.setGeometry(new Point(fromLonLat(vehiclePosition)));
                    vFeat.set('bearing', vehicleBearing || 0);
                } else {
                    source.addFeature(new Feature({
                        geometry: new Point(fromLonLat(vehiclePosition)),
                        type: 'vehicle',
                        vehicleType: vehicleType,
                        bearing: vehicleBearing || 0
                    }));
                }
            } else {
                // No vehicle — clear stale vehicle feature
                const vFeat = source.getFeatures().find(f => f.get('type') === 'vehicle');
                if (vFeat) source.removeFeature(vFeat);
            }
        }

        // User Location (Always)
        if (userLocation) {
            let uF = source.getFeatures().find(f => f.get('type') === 'user-location');
            if (uF) uF.setGeometry(new Point(userLocation));
            else source.addFeature(new Feature({ geometry: new Point(userLocation), type: 'user-location' }));
        }

    }, [activeTab, fleet, start, end, routeGeometry, vehiclePosition, vehicleBearing, vehicleType, userLocation, followVehicleId]);

    // 3. Animation Loop
    useEffect(() => {
        if (activeTab !== 'fleet') {
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
            return;
        }

        const animate = () => {
            const now = Date.now();
            const source = vectorSource.current;
            if (!source) return;

            Object.entries(vehicleStates.current).forEach(([id, state]) => {
                const feature = source.getFeatureById(id);
                if (!feature) return;

                const elapsed = now - state.startTime;
                // Clamp t to 1.0 to avoid overshooting
                const t = Math.min(elapsed / state.duration, 1.0);

                // Lerp: a + (b - a) * t
                const currentPos = [
                    state.startPos[0] + (state.targetPos[0] - state.startPos[0]) * t,
                    state.startPos[1] + (state.targetPos[1] - state.startPos[1]) * t
                ];

                feature.setGeometry(new Point(currentPos));

                // Update Halo if exists
                const halo = source.getFeatureById(`halo-${id}`);
                if (halo) halo.setGeometry(new Point(currentPos));

                // Recenter map if this is the followed vehicle
                if (id === followVehicleIdRef.current && mapInstance.current) {
                    mapInstance.current.getView().setCenter(currentPos);
                }
            });

            animationFrameId.current = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
        };
    }, [activeTab]);

    // 4. Immediate fly-to when follow starts
    useEffect(() => {
        if (!followVehicleId || !mapInstance.current) return;
        // Find the vehicle's current feature position
        const source = vectorSource.current;
        const feature = source.getFeatureById(followVehicleId);
        if (feature) {
            const coords = feature.getGeometry().getCoordinates();
            mapInstance.current.getView().animate({
                center: coords,
                zoom: 17,
                duration: 600,
            });
        }
    }, [followVehicleId]);

    // 3. Handle Search Location (FlyTo + Marker)
    useEffect(() => {
        if (!searchLocation || !mapInstance.current) return;

        const source = vectorSource.current;
        const coords = fromLonLat([parseFloat(searchLocation.lon), parseFloat(searchLocation.lat)]);

        // Remove existing search marker if any
        const existing = source.getFeatures().find(f => f.get('type') === 'search');
        if (existing) source.removeFeature(existing);

        const feature = new Feature({
            geometry: new Point(coords),
            type: 'search'
        });

        // Search Pin (Dark Orange/Brown)
        const pinSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#FF9800"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>';
        const pinUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(pinSvg);
        feature.setStyle(new Style({
            image: new Icon({
                anchor: [0.5, 1], // Bottom center
                src: pinUrl,
                scale: 1.5
            })
        }));

        source.addFeature(feature);

        // Fly animation
        mapInstance.current.getView().animate({
            center: coords,
            zoom: 14,
            duration: 1500
        });

    }, [searchLocation]);

    // Watch for view rotation changes
    useEffect(() => {
        if (!mapInstance.current) return;
        const view = mapInstance.current.getView();
        const listener = view.on('change:rotation', () => {
            setRotation(view.getRotation());
        });
        return () => unByKey(listener);
    }, []);

    // Auto-center AND Rotate if following (Head-Up Mode)
    useEffect(() => {
        if (!mapInstance.current) return;
        const view = mapInstance.current.getView();

        // Case 1: Navigation Mode (vehiclePosition prop)
        if (vehiclePosition && isFollowingRef.current) {
            view.animate({
                center: fromLonLat(vehiclePosition),
                duration: 100,
                rotation: -1 * (vehicleBearing || 0) * (Math.PI / 180)
            });
        }

        // Case 2: Fleet Mode (followVehicleId prop) - WITH INTERPOLATION, this might jitter if we use static fleet prop
        // Ideally we should follow interpolated position. But simple animate to latest server pos is "okay" for camera.
        if (activeTab === 'fleet' && followVehicleId && fleet) {
            const vehicle = fleet.find(v => v.id === followVehicleId);
            if (vehicle && vehicle.position) {
                view.animate({
                    center: fromLonLat(vehicle.position),
                    duration: 100,
                    rotation: -1 * (vehicle.heading || 0) * (Math.PI / 180)
                });
            }
        }

    }, [vehiclePosition, vehicleBearing, activeTab, fleet, followVehicleId]);

    // Disable following on user interaction
    useEffect(() => {
        if (!mapInstance.current) return;
        const map = mapInstance.current;

        const dragHandler = () => {
            // If following navigation vehicle
            if (isFollowingRef.current) {
                isFollowingRef.current = false;
            }

            // If following fleet vehicle
            if (followVehicleId && onStopFollow) {
                onStopFollow(); // Tell parent to stop following
            }
        };

        map.on('pointerdrag', dragHandler);

        return () => {
            map.un('pointerdrag', dragHandler);
        };

    }, [followVehicleId, onStopFollow]);

    // Re-center handler (Navigation Mode only mostly)
    const handleRecenter = () => {
        isFollowingRef.current = true;

        // Logic for Nav Recenter
        if (vehiclePosition && mapInstance.current) {
            const view = mapInstance.current.getView();
            view.animate({
                center: fromLonLat(vehiclePosition),
                rotation: -1 * (vehicleBearing || 0) * (Math.PI / 180),
                duration: 500,
                zoom: 17
            });
        }
    };

    // Reset North handler
    const handleResetNorth = () => {
        if (mapInstance.current) {
            mapInstance.current.getView().animate({
                rotation: 0,
                duration: 500
            });
        }
    };

    // Rotate Left handler
    const handleRotateLeft = (e) => {
        e.stopPropagation();
        if (mapInstance.current) {
            const view = mapInstance.current.getView();
            view.animate({
                rotation: view.getRotation() + Math.PI / 2, // +90 deg
                duration: 250
            });
        }
    };

    // Rotate Right handler
    const handleRotateRight = (e) => {
        e.stopPropagation();
        if (mapInstance.current) {
            const view = mapInstance.current.getView();
            view.animate({
                rotation: view.getRotation() - Math.PI / 2, // -90 deg
                duration: 250
            });
        }
    };

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

            {/* Re-center Button (Only if vehicle actsve) */}
            {vehiclePosition && (
                <button
                    onClick={handleRecenter}
                    style={{
                        position: 'absolute',
                        bottom: '25px',
                        left: '25px',
                        zIndex: 1000,
                        backgroundColor: 'white', // Always white
                        color: '#5F6368', // Default grey, dynamic color removed to fix lint
                        border: 'none',
                        borderRadius: '24px',
                        padding: '0 20px',
                        height: '40px',
                        width: 'fit-content', // Critical Fix
                        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: 'Roboto, Arial, sans-serif',
                        fontSize: '14px',
                        fontWeight: '500',
                        gap: '8px',
                        transition: 'color 0.2s',
                        whiteSpace: 'nowrap'
                    }}
                    title="Re-Center"
                >
                    <span style={{ fontSize: '20px', display: 'flex', alignItems: 'center' }}>⌖</span>
                    <span>Re-Center</span>
                </button>
            )}

            {/* Compass Control Container */}
            <div
                style={{
                    position: 'absolute',
                    top: '80px',
                    right: '10px', // Moved closer to edge like GMap controls
                    zIndex: 1000,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '5px'
                }}
            >
                {/* Compass & Rotation Wrapper */}
                <div style={{ position: 'relative', width: '60px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

                    {/* Left Rotate Arrow */}
                    <div
                        onClick={handleRotateLeft}
                        title="Rotate Left"
                        style={{
                            position: 'absolute',
                            left: '-5px', // More spacing
                            top: '50%',
                            transform: 'translateY(-50%)',
                            cursor: 'pointer',
                            color: '#555',
                            fontSize: '24px', // Larger
                            fontWeight: 'bold',
                            userSelect: 'none',
                            background: 'rgba(255,255,255,0.9)',
                            borderRadius: '50%',
                            width: '24px',
                            height: '24px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 1,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                        }}
                    >
                        ↶
                    </div>

                    {/* Right Rotate Arrow */}
                    <div
                        onClick={handleRotateRight}
                        title="Rotate Right"
                        style={{
                            position: 'absolute',
                            right: '-5px', // More spacing
                            top: '50%',
                            transform: 'translateY(-50%)',
                            cursor: 'pointer',
                            color: '#555',
                            fontSize: '24px', // Larger
                            fontWeight: 'bold',
                            userSelect: 'none',
                            background: 'rgba(255,255,255,0.9)',
                            borderRadius: '50%',
                            width: '24px',
                            height: '24px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 1,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                        }}
                    >
                        ↷
                    </div>

                    {/* Actual Compass (Click to Reset) */}
                    <div
                        onClick={handleResetNorth}
                        style={{
                            width: '36px',
                            height: '36px',
                            cursor: 'pointer',
                            transform: `rotate(${-rotation}rad)`,
                            transition: 'transform 0.1s linear',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'white',
                            borderRadius: '50%',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                            zIndex: 2
                        }}
                        title="Reset North"
                    >
                        <svg width="36" height="36" viewBox="0 0 40 40">
                            <circle cx="20" cy="20" r="18" fill="white" stroke="#ccc" strokeWidth="1" />
                            {/* Red North Arrow */}
                            <path d="M20 6 L26 20 L20 16 L14 20 Z" fill="#EA4335" />
                            {/* Grey South Arrow */}
                            <path d="M20 34 L26 20 L20 24 L14 20 Z" fill="#999" />
                        </svg>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Helper for Style (can be moved outside or useCallback)
const createVehicleStyle = (vehicle) => {
    const status = vehicle.status || 'IDLE';
    const heading = vehicle.heading || 0;
    const rotation = heading * Math.PI / 180;

    // Blue for moving, Orange for idle
    const color = status === 'ONGOING' ? '#1a73e8' : '#FF9800';
    const outline = status === 'ONGOING' ? '#0d47a1' : '#E65100';

    // Truck SVG (side-view, pointing right = 0°)
    const truckSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="24" viewBox="0 0 36 24">
      <!-- Trailer body -->
      <rect x="0" y="4" width="22" height="14" rx="2" fill="${color}" stroke="${outline}" stroke-width="1.5"/>
      <!-- Cab -->
      <rect x="22" y="6" width="10" height="12" rx="2" fill="${color}" stroke="${outline}" stroke-width="1.5"/>
      <!-- Windshield -->
      <rect x="28" y="7.5" width="3.5" height="5" rx="1" fill="rgba(255,255,255,0.7)"/>
      <!-- Wheels -->
      <circle cx="6"  cy="19" r="3" fill="${outline}"/>
      <circle cx="16" cy="19" r="3" fill="${outline}"/>
      <circle cx="28" cy="19" r="3" fill="${outline}"/>
      <!-- Wheel hubs -->
      <circle cx="6"  cy="19" r="1.2" fill="white"/>
      <circle cx="16" cy="19" r="1.2" fill="white"/>
      <circle cx="28" cy="19" r="1.2" fill="white"/>
    </svg>`;

    const truckUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(truckSvg);

    return new Style({
        image: new Icon({
            anchor: [0.5, 0.5],
            anchorXUnits: 'fraction',
            anchorYUnits: 'fraction',
            src: truckUrl,
            scale: 1.1,
            rotation: rotation,
            rotateWithView: true,
        }),
        zIndex: 10
    });
};


export default MapComponent;
