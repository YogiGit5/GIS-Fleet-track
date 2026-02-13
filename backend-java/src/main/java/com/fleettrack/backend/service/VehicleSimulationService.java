package com.fleettrack.backend.service;

import com.fleettrack.backend.dto.VehicleStatusResponse;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class VehicleSimulationService {

    private final Map<String, VehicleState> vehicles = new ConcurrentHashMap<>();

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
                state.type,
                state.finished);
    }

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
        } else {
            state.currentPosition = interpolatePosition(state.path, distanceCovered);
            double remainingDistance = state.totalDistance - distanceCovered;
            state.etaMinutes = remainingDistance / state.speed; // Sending seconds now, despite variable name.
                                                                // Refactoring variable name would be cleaner but this
                                                                // minimizes diff. Let's rename the field in validation
                                                                // step if needed, but for now just fix logic.
            // Actually, let's rename the DTO field or variable to avoid confusion?
            // The DTO `VehicleStatusResponse` has `Double eta`.
            // The state class has `Double etaMinutes`.
            // I will change the calculation to not divide by 60.
            state.etaMinutes = remainingDistance / state.speed;
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
            System.err.println("DEBUG: geometry is null");
            return Collections.emptyList();
        }
        System.out.println("DEBUG: geometry keys: " + geometry.keySet());

        Object coordinatesObj = geometry.get("coordinates");
        if (coordinatesObj == null) {
            System.err.println("DEBUG: coordinates field is null");
            return Collections.emptyList();
        }

        System.out.println("DEBUG: coordinates type: " + coordinatesObj.getClass().getName());
        System.out.println("DEBUG: coordinates value: " + coordinatesObj);

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
                } else {
                    System.err.println("DEBUG: pointObj is not a List: "
                            + (pointObj == null ? "null" : pointObj.getClass().getName()));
                }
            }
            if (result.isEmpty()) {
                System.err.println("DEBUG: Parsed result is empty");
            }
            return result;
        } else {
            System.err.println("DEBUG: coordinatesObj is not a List");
        }
        return Collections.emptyList();
    }

    private static class VehicleState {
        String id;
        String type;
        List<List<Double>> path;
        double speed;
        double totalDistance;
        long startTime;
        List<Double> currentPosition;
        Double etaMinutes;
        boolean finished = false;

        public VehicleState(String id, String type, List<List<Double>> path, double speed, double totalDistance,
                long startTime) {
            this.id = id;
            this.type = type;
            this.path = path;
            this.speed = speed;
            this.totalDistance = totalDistance;
            this.startTime = startTime;
            this.currentPosition = path.get(0);
        }
    }
}
