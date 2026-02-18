package com.fleettrack.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public record VehicleStatusResponse(
                @JsonProperty("vehicle_id") String vehicleId,
                List<Double> position,
                Double eta,
                @JsonProperty("remaining_distance") Double remainingDistance,
                @JsonProperty("vehicle_type") String vehicleType,
                boolean finished) {
}
