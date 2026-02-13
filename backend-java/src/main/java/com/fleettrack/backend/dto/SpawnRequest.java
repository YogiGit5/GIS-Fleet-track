package com.fleettrack.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.Map;

public record SpawnRequest(
                @JsonProperty("vehicle_type") String vehicleType,
                @JsonProperty("route_geometry") Map<String, Object> route) {
}
