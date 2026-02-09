import React, { useEffect, useRef } from 'react';
import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import { fromLonLat, toLonLat } from 'ol/proj';
import { Circle as CircleStyle, Fill, Stroke, Style, Icon } from 'ol/style';

const MapComponent = ({ start, end, routeGeometry, vehiclePosition, vehicleType, onMapClick }) => {
    const mapRef = useRef(null);
    const mapInstance = useRef(null);
    const vectorSource = useRef(new VectorSource());
    const onMapClickRef = useRef(onMapClick);

    // Keep callback ref updated
    useEffect(() => {
        onMapClickRef.current = onMapClick;
    }, [onMapClick]);

    // Initialize Map
    useEffect(() => {
        if (!mapInstance.current) {
            const vectorLayer = new VectorLayer({
                source: vectorSource.current,
                style: (feature) => {
                    const type = feature.get('type');
                    const vType = feature.get('vehicleType') || 'car';

                    if (type === 'route') {
                        return new Style({
                            stroke: new Stroke({ color: '#3388ff', width: 4 }),
                        });
                    }
                    if (type === 'start') {
                        return new Style({
                            image: new CircleStyle({
                                radius: 6,
                                fill: new Fill({ color: 'green' }),
                                stroke: new Stroke({ color: 'white', width: 2 })
                            })
                        });
                    }
                    if (type === 'end') {
                        return new Style({
                            image: new CircleStyle({
                                radius: 6,
                                fill: new Fill({ color: 'red' }),
                                stroke: new Stroke({ color: 'white', width: 2 })
                            })
                        });
                    }
                    if (type === 'vehicle') {
                        // Color code based on type
                        let color = 'blue';
                        if (vType === 'truck') color = 'darkorange';
                        if (vType === 'bike') color = 'purple';

                        return new Style({
                            image: new CircleStyle({
                                radius: 8,
                                fill: new Fill({ color: color }),
                                stroke: new Stroke({ color: 'white', width: 2 })
                            })
                        });
                    }
                }
            });

            mapInstance.current = new Map({
                target: mapRef.current,
                layers: [
                    new TileLayer({ source: new OSM() }),
                    vectorLayer
                ],
                view: new View({
                    center: fromLonLat([0, 0]),
                    zoom: 2
                })
            });

            mapInstance.current.on('click', (event) => {
                const coords = toLonLat(event.coordinate);
                if (onMapClickRef.current) {
                    onMapClickRef.current(coords);
                }
            });
        }
    }, []);

    // Update Features
    useEffect(() => {
        vectorSource.current.clear();

        if (start) {
            const f = new Feature({
                geometry: new Point(fromLonLat(start)),
                type: 'start'
            });
            vectorSource.current.addFeature(f);
        }

        if (end) {
            const f = new Feature({
                geometry: new Point(fromLonLat(end)),
                type: 'end'
            });
            vectorSource.current.addFeature(f);
        }

        if (routeGeometry) {
            const coords = routeGeometry.coordinates.map(c => fromLonLat(c));
            const f = new Feature({
                geometry: new LineString(coords),
                type: 'route'
            });
            vectorSource.current.addFeature(f);
        }

        if (vehiclePosition) {
            const f = new Feature({
                geometry: new Point(fromLonLat(vehiclePosition)),
                type: 'vehicle',
                vehicleType: vehicleType // Store type in feature for styling
            });
            vectorSource.current.addFeature(f);
        }

        // Auto-zoom to fit features
        if (mapInstance.current && vectorSource.current.getFeatures().length > 0) {
            const extent = vectorSource.current.getExtent();
            mapInstance.current.getView().fit(extent, {
                padding: [50, 50, 50, 50],
                maxZoom: 13,
                duration: 1000
            });
        }

    }, [start, end, routeGeometry, vehiclePosition, vehicleType]);

    return <div ref={mapRef} style={{ width: '100%', height: '100%' }} />;
};

export default MapComponent;
