package com.fleettrack.backend.infra;

import com.fleettrack.backend.dto.RouteResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

@Service
public class OsrmService {

    private final RestClient restClient;
    private final String osrmBaseUrl;
    private final ObjectMapper objectMapper;

    public OsrmService(@Value("${osrm.url}") String osrmBaseUrl, ObjectMapper objectMapper) {
        this.restClient = RestClient.create();
        this.osrmBaseUrl = osrmBaseUrl;
        this.objectMapper = objectMapper;
    }

    public RouteResponse getRoute(List<Double> start, List<Double> end, String vehicleType) {
        String profile = "driving";
        double speedFactor = 1.0;

        if ("bike".equals(vehicleType)) {
            profile = "bike";
        } else if ("truck".equals(vehicleType)) {
            speedFactor = 0.7;
        } else if ("container".equals(vehicleType)) {
            speedFactor = 0.5;
        }

        String coords = String.format("%f,%f;%f,%f", start.get(0), start.get(1), end.get(0), end.get(1));
        String url = String.format("%s/route/v1/%s/%s?overview=full&geometries=geojson", osrmBaseUrl, profile, coords);

        try {
            JsonNode root = restClient.get().uri(url).retrieve().body(JsonNode.class);

            if (root == null || !"Ok".equals(root.get("code").asText())) {
                throw new RuntimeException("Route not found");
            }

            JsonNode route = root.get("routes").get(0);
            Map<String, Object> geometry = objectMapper.convertValue(route.get("geometry"), Map.class);
            double distance = route.get("distance").asDouble();
            double originalDuration = route.get("duration").asDouble();

            return new RouteResponse(geometry, distance, originalDuration / speedFactor);

        } catch (Exception e) {
            throw new RuntimeException("OSRM Error: " + e.getMessage());
        }
    }
}
