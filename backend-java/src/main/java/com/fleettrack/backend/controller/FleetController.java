package com.fleettrack.backend.controller;

import com.fleettrack.backend.service.VehicleSimulationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/fleet")
@org.springframework.web.bind.annotation.CrossOrigin(origins = "*")
public class FleetController {

    @Autowired
    private VehicleSimulationService simulationService;

    @PostMapping("/start")
    public String startFleetSimulation() {
        simulationService.startFleetSimulation();
        return "Fleet simulation started";
    }

    @PostMapping("/stop")
    public String stopFleetSimulation() {
        simulationService.stopFleetSimulation();
        return "Fleet simulation stopped";
    }

    @PostMapping("/reset")
    public String resetFleetSimulation() {
        simulationService.resetFleetSimulation();
        return "Fleet simulation reset";
    }

    @PostMapping("/dispatch")
    public String dispatchVehicle(
            @org.springframework.web.bind.annotation.RequestBody java.util.Map<String, Object> payload) {
        String vehicleId = (String) payload.get("vehicleId");
        Double lat = Double.valueOf(payload.get("lat").toString());
        Double lon = Double.valueOf(payload.get("lon").toString());

        simulationService.dispatchVehicle(vehicleId, lat, lon);
        return "Vehicle dispatched";
    }

    @org.springframework.web.bind.annotation.GetMapping("/vehicles")
    public java.util.List<java.util.Map<String, Object>> getFleetVehicles() {
        return simulationService.getAllVehicles();
    }
}
