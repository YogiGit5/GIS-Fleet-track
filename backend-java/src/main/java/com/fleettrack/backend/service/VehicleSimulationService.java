package com.fleettrack.backend.service;

import com.fleettrack.backend.dto.VehicleStatusResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class VehicleSimulationService {

    private final Map<String, VehicleState> vehicles = new ConcurrentHashMap<>();
    private final Map<String, VehicleState> fleetVehicles = new ConcurrentHashMap<>();

    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    @Autowired
    private com.fleettrack.backend.infra.OsrmService osrmService;

    public VehicleSimulationService() {
    }

    public String spawnVehicle(String vehicleType, Map<String, Object> routeGeometry) {
        String vehicleId = UUID.randomUUID().toString();
        List<List<Double>> coordinates = extractCoordinates(routeGeometry);

        if (coordinates.isEmpty()) {
            throw new IllegalArgumentException("Invalid route geometry");
        }

        double speed = getSpeed(vehicleType); // m/s
        double totalDistance = calculateTotalDistance(coordinates);

        VehicleState state = new VehicleState(
                vehicleId,
                vehicleType,
                coordinates,
                speed,
                totalDistance,
                System.currentTimeMillis());

        vehicles.put(vehicleId, state);
        return vehicleId;
    }

    public void dispatchVehicle(String vehicleId, double destLat, double destLon) {
        VehicleState state = fleetVehicles.get(vehicleId);
        if (state == null)
            return;

        // Current Pos
        List<Double> currentPos = state.currentPosition; // [lon, lat]

        // Call OSRM
        // Note: OSRM expects [lon, lat]
        List<Double> start = currentPos;
        List<Double> end = Arrays.asList(destLon, destLat);

        try {
            var routeResponse = osrmService.getRoute(start, end, state.type);

            // Update State
            state.path = extractCoordinates(routeResponse.geometry());
            state.totalDistance = routeResponse.distance();
            state.startTime = System.currentTimeMillis();
            state.remainingDistance = state.totalDistance;
            state.currentPosition = state.path.get(0);
            state.status = "ONGOING";
            state.finished = false;

            // Broadcast update immediately?
            // The scheduled task will pick it up next second.

        } catch (Exception e) {
            System.err.println("Failed to dispatch vehicle: " + e.getMessage());
        }
    }

    public VehicleStatusResponse getVehicleStatus(String vehicleId) {
        VehicleState state = vehicles.get(vehicleId);
        if (state == null) {
            return null;
        }

        updatePosition(state);

        return new VehicleStatusResponse(
                state.id,
                state.currentPosition,
                state.etaMinutes,
                state.remainingDistance,
                state.type,
                state.finished);
    }

    public List<Map<String, Object>> getAllVehicles() {
        if (fleetVehicles.isEmpty()) {
            return Collections.emptyList();
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (VehicleState state : fleetVehicles.values()) {
            // Don't update position here to avoid side effects on read,
            // but we might want latest? Let's just return current state.
            // Actually, let's trigger an update to be safe so it matches next broadcast.
            updatePosition(state);

            Map<String, Object> vehicleData = new HashMap<>();
            vehicleData.put("id", state.id);
            vehicleData.put("name", state.name);
            vehicleData.put("type", state.type);
            vehicleData.put("status", state.status);
            vehicleData.put("position", state.currentPosition);
            vehicleData.put("remaining_distance", state.remainingDistance);
            vehicleData.put("total_distance", state.totalDistance);
            vehicleData.put("speed", state.speed * 3.6);
            vehicleData.put("eta", state.etaMinutes);
            vehicleData.put("route", state.path);

            double currentHeading = state.status.equals("ONGOING") ? calculateHeading(state.currentPosition, state.path)
                    : state.heading;
            vehicleData.put("heading", currentHeading);

            result.add(vehicleData);
        }
        return result;
    }

    // --- FLEET SIMULATION ---

    public void startFleetSimulation() {
        if (!fleetVehicles.isEmpty())
            return;

        fleetVehicles.clear();
        // Generate mock fleet
        generateRandomFleet(7); // Reduced to 7 as requested

        // Broadcast initial state immediately
        broadcastFleetUpdates();
    }

    // Realistic Bangalore road waypoints for initial routes
    private static final double[][] BANGALORE_WAYPOINTS = {
            { 12.9716, 77.5946 }, // MG Road
            { 12.9352, 77.6245 }, // Koramangala
            { 12.9698, 77.7499 }, // Whitefield
            { 13.0358, 77.5970 }, // Hebbal
            { 12.9141, 77.6101 }, // BTM Layout
            { 12.9784, 77.6408 }, // Indiranagar
            { 13.0012, 77.5757 }, // Yeshwanthpur
            { 12.9279, 77.5539 }, // Jayanagar
            { 13.0297, 77.6848 }, // KR Puram
            { 12.9542, 77.4908 }, // Kengeri
    };

    private static final String[][] DRIVER_DATA = {
            { "Rajesh Kumar", "+91 98765 43210", "4.8", "👨" },
            { "Priya Sharma", "+91 87654 32109", "4.9", "👩" },
            { "Suresh Babu", "+91 76543 21098", "4.6", "👨" },
            { "Anitha Reddy", "+91 65432 10987", "4.7", "👩" },
            { "Mohammed Farhan", "+91 54321 09876", "4.5", "👨" },
            { "Kavitha Nair", "+91 43210 98765", "4.9", "👩" },
            { "Vikram Singh", "+91 32109 87654", "4.4", "👨" },
    };

    private void generateRandomFleet(int count) {
        Random random = new Random();
        // Fixed vehicle types for a realistic Rapido-style fleet
        String[][] vehicleTypes = {
                { "bike", "RR-01" }, { "bike", "RR-02" }, { "bike", "RR-03" },
                { "car", "RC-01" }, { "car", "RC-02" },
                { "truck", "RT-01" }, { "bike", "RR-04" }
        };

        for (int i = 0; i < count; i++) {
            String type = vehicleTypes[i][0];
            String name = vehicleTypes[i][1];
            String[] driver = DRIVER_DATA[i];

            // Pick a random starting waypoint
            double[] startWp = BANGALORE_WAYPOINTS[random.nextInt(BANGALORE_WAYPOINTS.length)];
            double lat1 = startWp[0];
            double lon1 = startWp[1];

            double heading = random.nextDouble() * 360.0;
            String id = UUID.randomUUID().toString();

            List<List<Double>> path = new ArrayList<>();
            path.add(Arrays.asList(lon1, lat1));
            path.add(Arrays.asList(lon1, lat1)); // duplicate for valid path

            double speed = getSpeed(type);
            VehicleState state = new VehicleState(id, type, path, speed, 0, System.currentTimeMillis());
            state.name = name;
            state.status = "IDLE";
            state.heading = heading;
            state.driverName = driver[0];
            state.driverPhone = driver[1];
            state.driverRating = driver[2];
            state.driverAvatar = driver[3];

            fleetVehicles.put(id, state);
        }

        // Auto-dispatch ~half the fleet on real OSRM routes
        List<VehicleState> vehicleList = new ArrayList<>(fleetVehicles.values());
        int toDispatch = Math.max(1, count / 2);
        for (int i = 0; i < toDispatch; i++) {
            VehicleState v = vehicleList.get(i);
            // Pick a different random destination waypoint
            double[] dest = BANGALORE_WAYPOINTS[random.nextInt(BANGALORE_WAYPOINTS.length)];
            try {
                dispatchVehicle(v.id, dest[0], dest[1]);
            } catch (Exception e) {
                System.err.println("Auto-dispatch failed for " + v.name + ": " + e.getMessage());
            }
        }
    }

    public void stopFleetSimulation() {
        fleetVehicles.clear();
        broadcastFleetUpdates();
    }

    public void resetFleetSimulation() {
        stopFleetSimulation();
        startFleetSimulation();
    }

    @Scheduled(fixedRate = 1000)
    public void broadcastFleetUpdates() {
        if (fleetVehicles.isEmpty())
            return;

        List<Map<String, Object>> updates = new ArrayList<>();

        for (VehicleState state : fleetVehicles.values()) {
            updatePosition(state);

            // If finished, auto-redispatch to keep fleet realistic
            if (state.finished) {
                state.status = "IDLE";
                autoRedispatch(state);
            }

            Map<String, Object> vehicleData = new HashMap<>();
            vehicleData.put("id", state.id);
            vehicleData.put("name", state.name);
            vehicleData.put("type", state.type);
            vehicleData.put("status", state.status);
            vehicleData.put("position", state.currentPosition); // [lon, lat]
            vehicleData.put("remaining_distance", state.remainingDistance);
            vehicleData.put("total_distance", state.totalDistance);
            vehicleData.put("speed", state.speed * 3.6); // m/s to km/h
            vehicleData.put("eta", state.etaMinutes);
            vehicleData.put("route", state.path);

            // Calculate heading?
            // If IDLE, use stored random heading. If moving, calculate from path.
            double currentHeading = state.status.equals("ONGOING") ? calculateHeading(state.currentPosition, state.path)
                    : state.heading;
            vehicleData.put("heading", currentHeading);

            // Driver info
            Map<String, String> driverInfo = new HashMap<>();
            driverInfo.put("name", state.driverName != null ? state.driverName : "Unknown");
            driverInfo.put("phone", state.driverPhone != null ? state.driverPhone : "--");
            driverInfo.put("rating", state.driverRating != null ? state.driverRating : "5.0");
            driverInfo.put("avatar", state.driverAvatar != null ? state.driverAvatar : "👤");
            vehicleData.put("driver", driverInfo);

            updates.add(vehicleData);
        }

        messagingTemplate.convertAndSend("/topic/fleet", updates);
    }

    // Auto-redispatch finished vehicles to keep fleet moving
    private void autoRedispatch(VehicleState state) {
        Random random = new Random();
        double[] dest = BANGALORE_WAYPOINTS[random.nextInt(BANGALORE_WAYPOINTS.length)];
        try {
            dispatchVehicle(state.id, dest[0], dest[1]);
        } catch (Exception e) {
            // Stay IDLE if dispatch fails
            state.status = "IDLE";
        }
    }

    // --- HELPER FIXES ---

    private void updatePosition(VehicleState state) {
        if (state.finished)
            return;

        long currentTime = System.currentTimeMillis();
        double elapsedTimeSeconds = (currentTime - state.startTime) / 1000.0;
        double distanceCovered = elapsedTimeSeconds * state.speed;

        if (distanceCovered >= state.totalDistance) {
            state.currentPosition = state.path.get(state.path.size() - 1);
            state.finished = true;
            state.etaMinutes = 0.0;
            state.remainingDistance = 0.0;
        } else {
            state.currentPosition = interpolatePosition(state.path, distanceCovered);
            state.remainingDistance = state.totalDistance - distanceCovered;
            state.etaMinutes = state.remainingDistance / state.speed; // Seconds actually
        }
    }

    private List<Double> interpolatePosition(List<List<Double>> path, double coveredDist) {
        double currentDist = 0.0;
        for (int i = 0; i < path.size() - 1; i++) {
            List<Double> p1 = path.get(i);
            List<Double> p2 = path.get(i + 1);
            double segmentDist = distance(p1, p2);

            if (currentDist + segmentDist >= coveredDist) {
                double remaining = coveredDist - currentDist;
                double ratio = remaining / segmentDist;
                return Arrays.asList(
                        p1.get(0) + (p2.get(0) - p1.get(0)) * ratio,
                        p1.get(1) + (p2.get(1) - p1.get(1)) * ratio);
            }
            currentDist += segmentDist;
        }
        return path.get(path.size() - 1);
    }

    private double distance(List<Double> p1, List<Double> p2) {
        return haversine(p1.get(1), p1.get(0), p2.get(1), p2.get(0));
    }

    private double calculateTotalDistance(List<List<Double>> path) {
        double dist = 0.0;
        for (int i = 0; i < path.size() - 1; i++) {
            dist += distance(path.get(i), path.get(i + 1));
        }
        return dist;
    }

    // Haversine formula for distance in meters
    private double haversine(double lat1, double lon1, double lat2, double lon2) {
        double R = 6371000; // Radius of Earth in meters
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
                        Math.sin(dLon / 2) * Math.sin(dLon / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    private double getSpeed(String type) {
        return switch (type) {
            case "car" -> 100.0 * 1000 / 3600;
            case "truck" -> 60.0 * 1000 / 3600;
            case "container" -> 40.0 * 1000 / 3600;
            case "bike" -> 30.0 * 1000 / 3600;
            default -> 100.0 * 1000 / 3600;
        };
    }

    @SuppressWarnings("unchecked")
    private List<List<Double>> extractCoordinates(Map<String, Object> geometry) {
        if (geometry == null) {
            return Collections.emptyList();
        }

        Object coordinatesObj = geometry.get("coordinates");
        if (coordinatesObj == null) {
            return Collections.emptyList();
        }

        if (coordinatesObj instanceof List<?> list) {
            List<List<Double>> result = new ArrayList<>();
            for (Object pointObj : list) {
                if (pointObj instanceof List<?> pointList) {
                    List<Double> point = new ArrayList<>();
                    for (Object coord : pointList) {
                        if (coord instanceof Number n) {
                            point.add(n.doubleValue());
                        }
                    }
                    result.add(point);
                }
            }
            return result;
        }
        return Collections.emptyList();
    }

    // Calculate bearing from currentPos toward next point in path
    private double calculateHeading(List<Double> currentPos, List<List<Double>> path) {
        if (path == null || path.size() < 2 || currentPos == null)
            return 0.0;
        // Find closest segment and return bearing to next point
        double minDist = Double.MAX_VALUE;
        int closestIdx = 0;
        for (int i = 0; i < path.size(); i++) {
            List<Double> p = path.get(i);
            double dx = p.get(0) - currentPos.get(0);
            double dy = p.get(1) - currentPos.get(1);
            double d = dx * dx + dy * dy;
            if (d < minDist) {
                minDist = d;
                closestIdx = i;
            }
        }
        int nextIdx = Math.min(closestIdx + 1, path.size() - 1);
        if (nextIdx == closestIdx)
            return 0.0;
        List<Double> p1 = path.get(closestIdx);
        List<Double> p2 = path.get(nextIdx);
        double lat1r = Math.toRadians(p1.get(1));
        double lat2r = Math.toRadians(p2.get(1));
        double dLon = Math.toRadians(p2.get(0) - p1.get(0));
        double y = Math.sin(dLon) * Math.cos(lat2r);
        double x = Math.cos(lat1r) * Math.sin(lat2r) - Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(dLon);
        return (Math.toDegrees(Math.atan2(y, x)) + 360) % 360;
    }

    private static class VehicleState {
        String id;
        String name;
        String status = "IDLE";
        String type;
        List<List<Double>> path;
        double speed;
        double totalDistance;
        long startTime;
        List<Double> currentPosition;
        Double etaMinutes;
        Double remainingDistance;
        boolean finished = false;
        double heading = 0.0;
        // Driver info
        String driverName;
        String driverPhone;
        String driverRating;
        String driverAvatar;

        public VehicleState(String id, String type, List<List<Double>> path, double speed, double totalDistance,
                long startTime) {
            this.id = id;
            this.type = type;
            this.path = path;
            this.speed = speed;
            this.totalDistance = totalDistance;
            this.startTime = startTime;
            this.currentPosition = path.get(0);
            this.remainingDistance = totalDistance;
        }
    }
}
