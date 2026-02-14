package com.fleettrack.backend.dto;

import java.util.List;
import java.util.Map;

public record RouteResponse(
                Map<String, Object> geometry,
                double distance,
                double duration,
                List<Map<String, Object>> alternatives) {
}
