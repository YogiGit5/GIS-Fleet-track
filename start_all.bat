@echo off
echo Starting Fleet Track MVP...

echo Starting GeoServer (Docker)...
docker start fleet_geoserver || docker run -d -p 8080:8080 --name fleet_geoserver docker.osgeo.org/geoserver:2.28.2

echo Starting Java Backend...
start "FleetBackend" cmd /k "cd backend-java && java -jar target\backend-0.0.1-SNAPSHOT.jar --server.port=8081 --osrm.url=http://router.project-osrm.org"

echo Starting Frontend...
start "FleetFrontend" cmd /k "cd frontend && npm run dev"

echo All services started!
echo Frontend: http://localhost:5173
echo Backend: http://localhost:8081
echo GeoServer: http://localhost:8080/geoserver
