import time
import math

class VehicleSimulator:
    def __init__(self, route_geometry, speed_mps):
        self.coordinates = route_geometry["coordinates"] # List of [lon, lat]
        self.total_distance_deg = 0
        self.segments = []
        
        # Pre-calculate segment lengths in degrees
        for i in range(len(self.coordinates) - 1):
            p1 = self.coordinates[i]
            p2 = self.coordinates[i+1]
            dist = math.sqrt((p2[0] - p1[0])**2 + (p2[1] - p1[1])**2)
            self.total_distance_deg += dist
            self.segments.append({
                "start": p1,
                "end": p2,
                "length": dist
            })
            
        self.start_time = time.time()
        # Approximation: 1 degree ~ 111km = 111,000 meters
        # speed_deg_per_sec = speed_mps / 111,000
        self.speed_dps = speed_mps / 111000.0 
        if self.speed_dps == 0: self.speed_dps = 0.0001
        
    def get_position(self):
        elapsed = time.time() - self.start_time
        distance_traveled_deg = elapsed * self.speed_dps
        
        if distance_traveled_deg >= self.total_distance_deg:
            return {
                "position": self.coordinates[-1],
                "bearing": 0,
                "progress": 1.0,
                "finished": True,
                "eta": 0
            }
            
        # Find current segment
        current_dist = 0
        for segment in self.segments:
            if current_dist + segment["length"] >= distance_traveled_deg:
                # We are in this segment
                local_dist = distance_traveled_deg - current_dist
                ratio = local_dist / segment["length"] if segment["length"] > 0 else 0
                
                # Interpolate
                lon = segment["start"][0] + (segment["end"][0] - segment["start"][0]) * ratio
                lat = segment["start"][1] + (segment["end"][1] - segment["start"][1]) * ratio
                
                remaining = (self.total_distance_deg - distance_traveled_deg) * 111000.0 # approx meters
                
                return {
                    "position": [lon, lat],
                    "progress": distance_traveled_deg / self.total_distance_deg,
                    "finished": False,
                    "eta": remaining / (self.speed_dps * 111000.0) # seconds
                }
            current_dist += segment["length"]
            
        return {
            "position": self.coordinates[-1],
            "progress": 1.0,
            "finished": True,
            "eta": 0
        }
