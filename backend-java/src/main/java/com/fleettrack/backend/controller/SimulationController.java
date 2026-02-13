package com.fleettrack.backend.controller;

import com.fleettrack.backend.dto.SpawnRequest;
import com.fleettrack.backend.dto.VehicleStatusResponse;
import com.fleettrack.backend.service.VehicleSimulationService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/simulate")
@CrossOrigin(origins = "*")
public class SimulationController {

    private final VehicleSimulationService simulationService;

    public SimulationController(VehicleSimulationService simulationService) {
        this.simulationService = simulationService;
    }

    @PostMapping("/spawn")
    public Map<String, String> spawnVehicle(@RequestBody SpawnRequest request) {
        try {
            System.out.println("Received spawn request: " + request);
            String vehicleId = simulationService.spawnVehicle(request.vehicleType(), request.route());
            return Map.of("vehicle_id", vehicleId, "status", "spawned");
        } catch (Exception e) {
            System.err.println("Error spawning vehicle: " + e.getMessage());
            e.printStackTrace(System.err);
            throw new RuntimeException("Simulation failed: " + e.getMessage(), e);
        }
    }

    @GetMapping("/{vehicleId}")
    public VehicleStatusResponse getVehicleStatus(@PathVariable String vehicleId) {
        return simulationService.getVehicleStatus(vehicleId);
    }
}
