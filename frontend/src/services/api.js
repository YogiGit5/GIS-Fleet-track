import axios from 'axios';

const API_URL = 'http://localhost:8000/api';

export const getRoute = async (start, end, type = 'car') => {
    // start, end are [lon, lat]
    try {
        const response = await axios.post(`${API_URL}/route`, {
            start,
            end,
            vehicle_type: type
        });
        return response.data;
    } catch (error) {
        console.error("Error fetching route:", error);
        throw error;
    }
};

export const spawnVehicle = async (type, routeGeometry) => {
    try {
        const response = await axios.post(`${API_URL}/simulate/spawn`, {
            vehicle_type: type,
            route_geometry: routeGeometry
        });
        return response.data;
    } catch (error) {
        console.error("Error spawning vehicle:", error);
        throw error;
    }
};

export const getVehicleStatus = async (vehicleId) => {
    try {
        const response = await axios.get(`${API_URL}/simulate/${vehicleId}`);
        return response.data;
    } catch (error) {
        console.error("Error fetching vehicle status:", error);
        throw error;
    }
};

export const reverseGeocode = async (lat, lon) => {
    try {
        const response = await axios.get(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
        return response.data;
    } catch (error) {
        console.error("Error reverse geocoding:", error);
        throw error;
    }
};
