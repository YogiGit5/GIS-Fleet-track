package com.fleettrack.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public record RouteRequest(
        List<Double> start,
        List<Double> end,
        @JsonProperty("vehicle_type") String vehicleType) {
}
