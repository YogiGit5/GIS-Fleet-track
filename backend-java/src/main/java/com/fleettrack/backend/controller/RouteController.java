package com.fleettrack.backend.controller;

import com.fleettrack.backend.dto.RouteRequest;
import com.fleettrack.backend.dto.RouteResponse;
import com.fleettrack.backend.infra.OsrmService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class RouteController {

    private final OsrmService osrmService;

    public RouteController(OsrmService osrmService) {
        this.osrmService = osrmService;
    }

    @PostMapping("/route")
    public RouteResponse calculateRoute(@RequestBody RouteRequest request) {
        return osrmService.getRoute(request.start(), request.end(), request.vehicleType());
    }
}
