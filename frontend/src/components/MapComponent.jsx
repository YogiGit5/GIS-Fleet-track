import React, { useEffect, useRef } from 'react';
import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import { OSM, Vector as VectorSource, XYZ } from 'ol/source';
import Feature from 'ol/Feature'; // Fixed: Import Feature
import { Point, LineString } from 'ol/geom';
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

    // 1. Initialize Map (Run Once)
    useEffect(() => {
        if (!mapInstance.current) {

            // Vector Layer for Markers/Route
            const vectorLayer = new VectorLayer({
                source: vectorSource.current,
                style: (feature) => {
                    const type = feature.get('type');
                    const vType = feature.get('vehicleType') || 'car';

                    if (type === 'route') return new Style({ stroke: new Stroke({ color: '#3388ff', width: 4 }) });
                    if (type === 'start') return new Style({ image: new CircleStyle({ radius: 6, fill: new Fill({ color: 'green' }), stroke: new Stroke({ color: 'white', width: 2 }) }) });
                    if (type === 'end') return new Style({ image: new CircleStyle({ radius: 6, fill: new Fill({ color: 'red' }), stroke: new Stroke({ color: 'white', width: 2 }) }) });

                    if (type === 'vehicle') {
                        let src = '/icons/car.svg';
                        let scale = 0.8;
                        if (vType === 'truck') { src = '/icons/truck.svg'; scale = 1.0; }
                        if (vType === 'container') { src = '/icons/container.svg'; scale = 1.2; }
                        if (vType === 'bike') { src = '/icons/bike.svg'; scale = 1.3; }
                        return new Style({ image: new Icon({ anchor: [0.5, 0.5], src: src, scale: scale }) });
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
                view: new View({ center: fromLonLat([0, 0]), zoom: 2 })
            });

            // Layer Toggle
            window.toggleLayer = (layerName) => {
                const isSat = layerName === 'satellite';
                satelliteLayer.setVisible(isSat);
                osmLayer.setVisible(!isSat);
            };

            // Click Handler
            mapInstance.current.on('click', (event) => {
                const coords = toLonLat(event.coordinate);
                if (onMapClickRef.current) onMapClickRef.current(coords);
            });
        }
    }, []);

    // 2. Update Features (React to props)
    useEffect(() => {
        const source = vectorSource.current;
        if (!source) return;

        source.clear(); // Simple approach: clear and redraw. adequate for <10 features.

        if (start) source.addFeature(new Feature({ geometry: new Point(fromLonLat(start)), type: 'start' }));
        if (end) source.addFeature(new Feature({ geometry: new Point(fromLonLat(end)), type: 'end' }));

        if (routeGeometry) {
            const coords = routeGeometry.coordinates.map(c => fromLonLat(c));
            source.addFeature(new Feature({ geometry: new LineString(coords), type: 'route' }));

            // Auto-zoom when route appears
            if (mapInstance.current) {
                mapInstance.current.getView().fit(source.getExtent(), { padding: [50, 50, 50, 50], maxZoom: 26, duration: 100 });
            }
        }

        if (vehiclePosition) {
            source.addFeature(new Feature({
                geometry: new Point(fromLonLat(vehiclePosition)),
                type: 'vehicle',
                vehicleType: vehicleType
            }));
        }

    }, [start, end, routeGeometry, vehiclePosition, vehicleType]);

    return <div ref={mapRef} style={{ width: '100%', height: '100%' }} />;
};

export default MapComponent;
