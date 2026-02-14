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

const MapComponent = ({ start, end, routeGeometry, vehiclePosition, vehicleBearing, vehicleType, searchLocation, onMapClick, onMarkerDragEnd }) => {
    const mapRef = useRef(null);
    const mapInstance = useRef(null);
    const vectorSource = useRef(new VectorSource());
    const onMapClickRef = useRef({ onMapClick, onMarkerDragEnd });
    const translateInteraction = useRef(null);

    const [userLocation, setUserLocation] = useState(null);
    const [isFollowing, setIsFollowing] = useState(false);
    const [rotation, setRotation] = useState(0);

    // Keep callback ref updated
    useEffect(() => {
        onMapClickRef.current = { onMapClick, onMarkerDragEnd };
    }, [onMapClick, onMarkerDragEnd]);

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

                    if (type === 'end') {
                        // Red Pin. Using a Data URI for a standard red pin shape.
                        const pinSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#EA4335"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>';
                        const pinUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(pinSvg);
                        return new Style({
                            image: new Icon({
                                anchor: [0.5, 1], // Bottom center
                                src: pinUrl,
                                scale: 1.5
                            })
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
                view: new View({ center: fromLonLat([77.5819,12.9792]), zoom: 12 })
            });

            // Geolocation: Get User Position
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const { latitude, longitude } = position.coords;
                        const coords = fromLonLat([longitude, latitude]);
                        setUserLocation(coords); // Save for marker

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

                    if (type === 'route-alt') {
                        const index = feature.get('altIndex');
                        if (onMapClickRef.current.onAlternativeSelect) {
                            onMapClickRef.current.onAlternativeSelect(index);
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

    // 2. Update Features (React to props)
    useEffect(() => {
        const source = vectorSource.current;
        if (!source) return;

        source.clear(); // Simple approach: clear and redraw. adequate for <10 features.

        // Draw User Location Marker first (if exists)
        if (userLocation) {
            source.addFeature(new Feature({
                geometry: new Point(userLocation),
                type: 'user-location'
            }));
        }

        if (start) source.addFeature(new Feature({ geometry: new Point(fromLonLat(start)), type: 'start' }));
        if (end) source.addFeature(new Feature({ geometry: new Point(fromLonLat(end)), type: 'end' }));

        if (routeGeometry) {
            const coords = routeGeometry.coordinates.map(c => fromLonLat(c));

            // 2. Draw Main Route (Split if moving)
            if (vehiclePosition) {
                // Split route into Traveled vs Remaining
                // Find closest point index
                let minDist = Infinity;
                let closestIndex = 0;
                const vPos = fromLonLat(vehiclePosition);

                // Optimization: Search only near expected progress if possible, but linear scan is fine for < 1000 points
                coords.forEach((c, i) => {
                    const dx = c[0] - vPos[0];
                    const dy = c[1] - vPos[1];
                    const dist = dx * dx + dy * dy;
                    if (dist < minDist) {
                        minDist = dist;
                        closestIndex = i;
                    }
                });

                // Traveled Path (Start -> Vehicle)
                const traveledCoords = coords.slice(0, closestIndex + 1);
                // Add vehicle pos to traveled path to make it connect perfectly?
                // actually better to just snap to closest index for now to avoid jitter.
                if (traveledCoords.length > 1) {
                    source.addFeature(new Feature({ geometry: new LineString(traveledCoords), type: 'route-traveled' }));
                }

                // Remaining Path (Vehicle -> End)
                const remainingCoords = coords.slice(closestIndex);
                if (remainingCoords.length > 1) {
                    source.addFeature(new Feature({ geometry: new LineString(remainingCoords), type: 'route' }));
                }

            } else {
                // No vehicle, show full route
                source.addFeature(new Feature({ geometry: new LineString(coords), type: 'route' }));
            }

            // Auto-zoom when route appears (only if no vehicle yet, or on first load)
            // If vehicle exists, we might want to follow it? For now keep existing behavior.
            if (mapInstance.current && !vehiclePosition) {
                mapInstance.current.getView().fit(source.getExtent(), { padding: [50, 50, 50, 50], maxZoom: 16, duration: 200 });
            }
        }

        if (vehiclePosition) {
            source.addFeature(new Feature({
                geometry: new Point(fromLonLat(vehiclePosition)),
                type: 'vehicle',
                vehicleType: vehicleType,
                bearing: vehicleBearing || 0
            }));
        }

    }, [start, end, routeGeometry, vehiclePosition, vehicleBearing, vehicleType, userLocation]);

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
        if (isFollowing && vehiclePosition && mapInstance.current) {
            const view = mapInstance.current.getView();

            // 1. Center map on vehicle
            view.animate({
                center: fromLonLat(vehiclePosition),
                duration: 100,
                // 2. Rotate map so vehicle points UP (-bearing)
                // Convert bearing (degrees clockwise from North) to View Rotation (radians counter-clockwise from North)
                rotation: -1 * (vehicleBearing || 0) * (Math.PI / 180)
            });
        }
    }, [vehiclePosition, isFollowing, vehicleBearing]);

    // Disable following on user interaction
    useEffect(() => {
        if (!mapInstance.current) return;
        const map = mapInstance.current;

        const dragHandler = () => {
            // Only disable if user is actually interacting heavily
            if (isFollowing) {
                setIsFollowing(false);
            }
        }

        map.on('pointerdrag', dragHandler);

        return () => {
            map.un('pointerdrag', dragHandler);
        };

    }, [isFollowing]);

    // Re-center handler
    const handleRecenter = () => {
        setIsFollowing(true);
        if (vehiclePosition && mapInstance.current) {
            const view = mapInstance.current.getView();
            view.animate({
                center: fromLonLat(vehiclePosition),
                rotation: -1 * (vehicleBearing || 0) * (Math.PI / 180), // Reset to Head-Up
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
                        color: isFollowing ? '#4285F4' : '#5F6368', // Blue text if following
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

export default MapComponent;
