@echo off
echo Starting Fleet Track MVP...

echo Starting GeoServer (Docker)...
docker start fleet_geoserver || docker run -d -p 8080:8080 --name fleet_geoserver docker.osgeo.org/geoserver:2.28.2

echo Starting Java Backend...
start "FleetBackend" cmd /k "cd backend-java && mvn spring-boot:run"

echo Starting Frontend...
start "FleetFrontend" cmd /k "cd frontend && npm run dev"

echo All services started!
echo Frontend: http://localhost:5173
echo Backend: http://localhost:8000
echo GeoServer: http://localhost:8080/geoserver
