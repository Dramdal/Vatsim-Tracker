// Initialize the map with restrictions
const map = L.map('map', {
    minZoom: 3,
    maxZoom: 13,
    maxBounds: [[-85, -180], [85, 180]],
    maxBoundsViscosity: 1.0
}).setView([45, 10], 4);

// Add dark map style
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap contributors, © CARTO',
    subdomains: 'abcd',
    maxZoom: 19
}).addTo(map);

// Store aircraft markers and data
let aircraftMarkers = {};
let aircraftData = {};
let atcZones = {};

// Store flight routes
let flightRoutes = {};

// Aircraft icons by size
function createAircraftIcon() {
    return L.divIcon({
        className: 'aircraft-marker',
        html: `<svg width="32" height="32" viewBox="0 0 24 24" class="aircraft-icon">
            <path d="M12,2 C12,2 9,6 9,14 L4,19 L4,20 L12,17 L20,20 L20,19 L15,14 C15,6 12,2 12,2" 
                  fill="#66a0ff" 
                  stroke="#ffffff" 
                  stroke-width="0.5"/>
        </svg>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16]
    });
}

// Add styles for aircraft icons
const style = document.createElement('style');
style.textContent = `
    .aircraft-marker {
        background: none !important;
        border: none !important;
        cursor: pointer !important;
        z-index: 1000 !important;
    }
    
    .aircraft-icon {
        transform-origin: center center;
        transition: transform 0.3s ease;
        pointer-events: auto;
        filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.5));
    }
    
    .aircraft-marker:hover .aircraft-icon {
        transform: scale(1.2);
        filter: drop-shadow(0 0 4px rgba(102, 160, 255, 0.8));
    }
    
    .leaflet-marker-icon {
        pointer-events: auto !important;
    }
    .flight-route {
        stroke: #ff8c00;
        stroke-width: 2;
        stroke-dasharray: 5, 5;
        opacity: 0.8;
    }
    .flight-route.planned {
        stroke: #ff8c00;
        stroke-dasharray: 5, 5;
    }
    .flight-route.actual {
        stroke: #ff0000;
        stroke-dasharray: none;
    }
    .aircraft-popup {
        min-width: 300px;
        background: rgba(0, 0, 0, 0.8);
        border: 1px solid #444;
        padding: 15px;
    }
    .aircraft-popup h3 {
        color: #fff;
        margin-bottom: 10px;
        font-size: 16px;
    }
    .aircraft-popup .info-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
    }
    .aircraft-popup .info-item {
        color: #fff;
    }
    .aircraft-popup .info-label {
        color: #888;
        font-size: 12px;
        display: block;
    }
    .aircraft-popup .info-value {
        color: #fff;
        font-size: 14px;
        font-weight: bold;
    }
    .aircraft-popup .route {
        margin-top: 10px;
        padding-top: 10px;
        border-top: 1px solid #444;
    }
    .aircraft-popup .route-info {
        display: flex;
        justify-content: space-between;
        align-items: center;
        color: #fff;
    }
    .atc-zone {
        pointer-events: all;
    }
    .atc-zone:hover {
        cursor: pointer;
    }
`;
document.head.appendChild(style);

// Determine aircraft size based on type
function getAircraftSize(aircraftType) {
    if (!aircraftType) return 'medium';
    
    const type = aircraftType.toUpperCase();
    // Wide-body aircraft
    if (type.match(/^(B7[4-8]|A3[3-8]|B77|A35)/)) {
        return 'large';
    }
    // Narrow-body and regional jets
    if (type.match(/^(B7[3]|A32|A31|A22|E1[7-9]|E29|CRJ|E1[7-9])/)) {
        return 'medium';
    }
    // Small aircraft and props
    return 'small';
}

// Global variables for performance
const UPDATE_INTERVAL = 3000; // 3 seconds
const MAX_RETRIES = 3; // Maximum number of retries
const RETRY_DELAY = 1000; // Delay between retries in milliseconds
let updateIntervalId = null;
let isUpdating = false;
let retryCount = 0;

// Fetch VATSIM data with better error handling and retry mechanism
async function fetchVatsimData() {
    try {
        const response = await fetch('https://data.vatsim.net/v3/vatsim-data.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        // Reset retry count on successful fetch
        retryCount = 0;
        
        // Return all pilots and controllers without limiting
        const pilots = data.pilots || [];
        const controllers = data.controllers || [];
        
        return { pilots, controllers };
    } catch (error) {
        console.error('Error fetching VATSIM data:', error);
        
        if (retryCount < MAX_RETRIES) {
            retryCount++;
            showError(`Connection error. Retry ${retryCount}/${MAX_RETRIES}...`);
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            return fetchVatsimData(); // Retry
        } else {
            showError('Connection failed. Using cached data.');
            return { pilots: [], controllers: [] };
        }
    }
}

// Error display function with improved styling
function showError(message) {
    // Remove any existing error messages
    const existingErrors = document.querySelectorAll('.error-message');
    existingErrors.forEach(error => error.remove());
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
        errorDiv.classList.add('fade-out');
        setTimeout(() => errorDiv.remove(), 500);
    }, 4500);
}

// Helper function to extract basic aircraft type
function getBasicAircraftType(aircraftString) {
    if (!aircraftString) return 'N/A';
    
    // Extract the first aircraft type before any slashes or dashes
    const match = aircraftString.match(/^([A-Z]\d{3}|[A-Z]\d{2}|[A-Z]{2}\d{2})/);
    return match ? match[0] : aircraftString.split('/')[0].split('-')[0].trim();
}

// Update popup content in both places where it's created
function createPopupContent(pilot) {
    return `
        <div class="aircraft-popup">
            <h3>${pilot.callsign}</h3>
            <div class="info-grid">
                <div class="info-item">
                    <span class="info-label">Aircraft</span>
                    <span class="info-value">${getBasicAircraftType(pilot.flight_plan?.aircraft)}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Altitude</span>
                    <span class="info-value">${formatAltitude(pilot.altitude)}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Ground Speed</span>
                    <span class="info-value">${pilot.groundspeed} kts</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Heading</span>
                    <span class="info-value">${pilot.heading}°</span>
                </div>
            </div>
            ${pilot.flight_plan ? `
                <div class="route">
                    <div class="route-info">
                        <span>${pilot.flight_plan.departure || 'N/A'}</span>
                        <span>✈</span>
                        <span>${pilot.flight_plan.arrival || 'N/A'}</span>
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

// Update aircraft markers on the map
function updateAircraftMarkers(pilots) {
    const currentCallsigns = new Set();
    
    pilots.forEach(pilot => {
        currentCallsigns.add(pilot.callsign);
        
        const marker = aircraftMarkers[pilot.callsign];
        if (!marker) {
            // Create new marker
            const newMarker = L.marker([pilot.latitude, pilot.longitude], {
                icon: createAircraftIcon(),
                rotationAngle: pilot.heading || 0,
                rotationOrigin: 'center center',
                riseOnHover: true,
                interactive: true
            });
            
            // Bind popup with new content
            newMarker.bindPopup(createPopupContent(pilot), {
                className: 'aircraft-popup-wrapper',
                maxWidth: 300
            });
            
            newMarker.on('click', () => {
                showFlightRoute(pilot);
            });
            
            newMarker.addTo(map);
            aircraftMarkers[pilot.callsign] = newMarker;
            aircraftData[pilot.callsign] = pilot;
        } else {
            // Update existing marker
            marker.setLatLng([pilot.latitude, pilot.longitude]);
            marker.setRotationAngle(pilot.heading || 0);
            marker.setPopupContent(createPopupContent(pilot));
            aircraftData[pilot.callsign] = pilot;
        }
    });
    
    // Remove markers for pilots no longer present
    Object.keys(aircraftMarkers).forEach(callsign => {
        if (!currentCallsigns.has(callsign)) {
            map.removeLayer(aircraftMarkers[callsign]);
            delete aircraftMarkers[callsign];
            delete aircraftData[callsign];
        }
    });
}

// Show flight route on the map
function showFlightRoute(pilot) {
    // Remove any existing route for this pilot
    if (flightRoutes[pilot.callsign]) {
        Object.values(flightRoutes[pilot.callsign]).forEach(layer => layer.remove());
        delete flightRoutes[pilot.callsign];
    }

    if (pilot.flight_plan?.departure && pilot.flight_plan?.arrival) {
        // Create planned route line
        const plannedRoute = L.polyline([], {
            color: '#66a0ff',
            weight: 2,
            opacity: 0.8,
            dashArray: '5, 5',
            className: 'flight-route planned'
        }).addTo(map);

        // Create actual route line (from departure to current position)
        const actualRoute = L.polyline([], {
            color: '#ff3366',
            weight: 2,
            opacity: 0.8,
            className: 'flight-route actual'
        }).addTo(map);

        // Add route to storage
        flightRoutes[pilot.callsign] = {
            planned: plannedRoute,
            actual: actualRoute
        };

        // Fetch airport coordinates and update route
        Promise.all([
            fetch(`https://api.vatsim.net/api/airports/${pilot.flight_plan.departure}`),
            fetch(`https://api.vatsim.net/api/airports/${pilot.flight_plan.arrival}`)
        ]).then(responses => Promise.all(responses.map(r => r.json())))
          .then(([dep, arr]) => {
              const depCoords = [dep.latitude, dep.longitude];
              const currentCoords = [pilot.latitude, pilot.longitude];
              const arrCoords = [arr.latitude, arr.longitude];

              // Set actual route (departure to current position)
              actualRoute.setLatLngs([depCoords, currentCoords]);

              // Set planned route (current position to arrival)
              plannedRoute.setLatLngs([currentCoords, arrCoords]);

              // Calculate progress
              const totalDistance = calculateDistance(depCoords, arrCoords);
              const coveredDistance = calculateDistance(depCoords, currentCoords);
              const progress = Math.round((coveredDistance / totalDistance) * 100);

              // Update popup with detailed information
              const popup = L.popup({
                  className: 'aircraft-popup',
                  maxWidth: 400
              })
              .setLatLng([pilot.latitude, pilot.longitude])
              .setContent(`
                  <div class="aircraft-popup">
                      <h3>${pilot.callsign}</h3>
                      <div class="info-grid">
                          <div class="info-item">
                              <span class="info-label">Aircraft</span>
                              <span class="info-value">${getBasicAircraftType(pilot.flight_plan?.aircraft)}</span>
                          </div>
                          <div class="info-item">
                              <span class="info-label">Altitude</span>
                              <span class="info-value">${formatAltitude(pilot.altitude)}</span>
                          </div>
                          <div class="info-item">
                              <span class="info-label">Ground Speed</span>
                              <span class="info-value">${pilot.groundspeed} kts</span>
                          </div>
                          <div class="info-item">
                              <span class="info-label">Heading</span>
                              <span class="info-value">${pilot.heading}°</span>
                          </div>
                      </div>
                      <div class="route">
                          <div class="route-info">
                              <span>${pilot.flight_plan.departure}</span>
                              <span>✈</span>
                              <span>${pilot.flight_plan.arrival}</span>
                          </div>
                          <div class="info-item" style="margin-top: 10px;">
                              <span class="info-label">Flight Progress</span>
                              <div style="background: rgba(102, 160, 255, 0.1); height: 4px; border-radius: 2px; margin-top: 5px;">
                                  <div style="background: #66a0ff; width: ${progress}%; height: 100%; border-radius: 2px;"></div>
                              </div>
                          </div>
                      </div>
                      <div class="pilot-info">
                          <span class="info-label">Filed Route</span>
                          <span class="info-value" style="font-size: 0.9em; word-break: break-word;">
                              ${pilot.flight_plan?.route || 'No route filed'}
                          </span>
                      </div>
                  </div>
              `)
              .openOn(map);

              // Fit map to show the entire route with padding
              const bounds = L.latLngBounds([depCoords, currentCoords, arrCoords]);
              map.fitBounds(bounds, { padding: [50, 50] });
          })
          .catch(error => console.error('Error fetching airport coordinates:', error));
    }
}

// Helper function to format altitude
function formatAltitude(altitude) {
    if (altitude >= 10000) {
        return `FL${Math.round(altitude/100)}`;
    }
    return `${altitude} ft`;
}

// Helper function to calculate distance between two points
function calculateDistance(point1, point2) {
    const lat1 = point1[0];
    const lon1 = point1[1];
    const lat2 = point2[0];
    const lon2 = point2[1];
    
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance in meters
}

// Update ATC zones with better visibility
function updateATCZones(controllers) {
    // Remove old zones
    Object.values(atcZones).forEach(zone => zone.remove());
    atcZones = {};

    // First, create center/control zones
    controllers.forEach(controller => {
        if (controller.visual_range && controller.frequency) {
            try {
                const callsign = controller.callsign.toUpperCase();
                if (callsign.endsWith('_CTR')) {
                    createATCZone(controller, {
                        color: '#1a472a',
                        fillColor: '#2d5a3c',
                        fillOpacity: 0.35,
                        weight: 2,
                        dashArray: null
                    });
                }
            } catch (error) {
                console.error(`Error adding CTR zone for ${controller.callsign}:`, error);
            }
        }
    });

    // Then add approach/departure zones
    controllers.forEach(controller => {
        if (controller.visual_range && controller.frequency) {
            try {
                const callsign = controller.callsign.toUpperCase();
                if (callsign.endsWith('_APP') || callsign.endsWith('_DEP')) {
                    createATCZone(controller, {
                        color: '#1a472a',
                        fillColor: '#2d5a3c',
                        fillOpacity: 0.4,
                        weight: 2,
                        dashArray: null
                    });
                }
            } catch (error) {
                console.error(`Error adding APP/DEP zone for ${controller.callsign}:`, error);
            }
        }
    });

    // Finally add tower/ground zones
    controllers.forEach(controller => {
        if (controller.visual_range && controller.frequency) {
            try {
                const callsign = controller.callsign.toUpperCase();
                if (callsign.endsWith('_TWR') || callsign.endsWith('_GND')) {
                    createATCZone(controller, {
                        color: '#1a472a',
                        fillColor: '#2d5a3c',
                        fillOpacity: 0.45,
                        weight: 2,
                        dashArray: null
                    });
                }
            } catch (error) {
                console.error(`Error adding TWR/GND zone for ${controller.callsign}:`, error);
            }
        }
    });
}

function createATCZone(controller, style) {
    const range = controller.visual_range * 1852; // Convert nautical miles to meters
    if (range > 0) {
        const zone = L.circle([controller.latitude, controller.longitude], {
            radius: range,
            ...style,
            interactive: true
        }).bindPopup(`
            <div class="atc-popup">
                <h3>${controller.callsign}</h3>
                <div class="info-grid">
                    <div class="info-item">
                        <span class="info-label">Frequency</span>
                        <span class="info-value">${controller.frequency}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Controller</span>
                        <span class="info-value">${controller.name}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Rating</span>
                        <span class="info-value">${controller.rating}</span>
                    </div>
                </div>
                ${controller.text_atis ? `
                    <div class="atis">
                        <span class="info-label">ATIS</span>
                        <span class="info-value">${controller.text_atis}</span>
                    </div>
                ` : ''}
            </div>
        `, {
            className: 'atc-popup'
        });
        
        zone.addTo(map);
        atcZones[controller.callsign] = zone;
    }
}

// Update statistics
function updateStats(pilots, controllers) {
    document.getElementById('pilotCount').textContent = pilots?.length || 0;
    document.getElementById('atcCount').textContent = controllers?.length || 0;
}

// Search functionality
function searchAircraft(callsign) {
    const aircraftInfo = aircraftData[callsign.toUpperCase()];
    if (aircraftInfo) {
        const marker = aircraftMarkers[callsign.toUpperCase()];
        if (marker) {
            showFlightRoute(aircraftInfo);
            map.setView([aircraftInfo.latitude, aircraftInfo.longitude], 7);
        }
    } else {
        alert('Aircraft not found!');
    }
}

// Event handler functions
function handleSearch() {
    const searchInput = document.getElementById('searchInput');
    searchAircraft(searchInput.value);
}

function handleSearchKeypress(e) {
    if (e.key === 'Enter') {
        searchAircraft(e.target.value);
    }
}

// Update data with better error handling and loading state
async function updateData() {
    if (isUpdating) return; // Prevent multiple simultaneous updates
    
    isUpdating = true;
    try {
        const { pilots, controllers } = await fetchVatsimData();
        if (pilots.length > 0 || controllers.length > 0) {
            updateAircraftMarkers(pilots);
            updateATCZones(controllers);
            updateStats(pilots, controllers);
        }
    } catch (error) {
        console.error('Error updating data:', error);
    } finally {
        isUpdating = false;
    }
}

// Cleanup function for proper resource management
function cleanup() {
    // Clear update interval
    if (updateIntervalId) {
        clearInterval(updateIntervalId);
    }
    
    // Remove all markers and routes
    Object.values(aircraftMarkers).forEach(marker => marker.remove());
    Object.values(flightRoutes).forEach(routes => {
        Object.values(routes).forEach(route => route.remove());
    });
    Object.values(atcZones).forEach(zone => zone.remove());
    
    // Clear data
    aircraftMarkers = {};
    aircraftData = {};
    flightRoutes = {};
    atcZones = {};
    
    // Remove event listeners
    document.getElementById('searchButton').removeEventListener('click', handleSearch);
    document.getElementById('searchInput').removeEventListener('keypress', handleSearchKeypress);
}

// Initialize the application
function init() {
    // Add event listeners
    document.getElementById('searchButton').addEventListener('click', handleSearch);
    document.getElementById('searchInput').addEventListener('keypress', handleSearchKeypress);
    
    // Initial data load
    updateData();
    
    // Start update interval
    updateIntervalId = setInterval(updateData, UPDATE_INTERVAL);
    
    // Add cleanup on page unload
    window.addEventListener('unload', cleanup);
}

// Start the application
init();

// Update error message styling
const errorStyle = document.createElement('style');
errorStyle.textContent = `
    .error-message {
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(0, 0, 0, 0.8);
        color: #ff3366;
        padding: 12px 20px;
        border-radius: 8px;
        z-index: 9999;
        font-size: 14px;
        border: 1px solid rgba(255, 51, 102, 0.3);
        backdrop-filter: blur(8px);
        animation: slideIn 0.3s ease-out;
        transition: opacity 0.5s ease-out, transform 0.5s ease-out;
    }
    
    .error-message.fade-out {
        opacity: 0;
        transform: translateY(-20px);
    }
    
    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateY(-20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }
`;
document.head.appendChild(errorStyle);

// Airport search functionality
async function searchAirport(icao) {
    const airportInfo = {
        metar: null,
        controllers: [],
        inboundTraffic: [],
        outboundTraffic: []
    };

    try {
        // Fetch METAR data
        const metarResponse = await fetch(`https://metar.vatsim.net/${icao}`);
        if (metarResponse.ok) {
            airportInfo.metar = await metarResponse.text();
        }

        // Get controllers and traffic from VATSIM data
        const { controllers, pilots } = await fetchVatsimData();
        
        // Find controllers for this airport
        airportInfo.controllers = controllers.filter(controller => {
            const callsign = controller.callsign.toUpperCase();
            return callsign.startsWith(icao) && 
                   (callsign.endsWith('TWR') || 
                    callsign.endsWith('GND') || 
                    callsign.endsWith('DEL') || 
                    callsign.endsWith('APP') ||
                    callsign.endsWith('DEP'));
        });

        // Find traffic
        pilots.forEach(pilot => {
            const flightPlan = pilot.flight_plan;
            if (flightPlan) {
                if (flightPlan.arrival === icao) {
                    airportInfo.inboundTraffic.push(pilot);
                } else if (flightPlan.departure === icao) {
                    airportInfo.outboundTraffic.push(pilot);
                }
            }
        });

        updateAirportInfo(icao, airportInfo);
        
        // Center map on airport if we have a controller position
        const airportController = airportInfo.controllers[0];
        if (airportController) {
            map.setView([airportController.latitude, airportController.longitude], 11);
        }

    } catch (error) {
        console.error('Error fetching airport data:', error);
        // Only show alert if we couldn't get any data at all
        if (!airportInfo.metar && airportInfo.controllers.length === 0 && 
            airportInfo.inboundTraffic.length === 0 && airportInfo.outboundTraffic.length === 0) {
            showError('Error fetching airport information');
        }
    }
}

function updateAirportInfo(icao, info) {
    const detailsDiv = document.getElementById('airport-details');
    const metarDiv = document.getElementById('airport-metar');
    const controllersDiv = document.getElementById('airport-controllers');
    const trafficDiv = document.getElementById('airport-traffic');

    // Update METAR with proper formatting
    metarDiv.innerHTML = info.metar ? 
        `<pre>${info.metar.trim()}</pre>` : 
        '<p>No METAR available</p>';

    // Update Controllers
    if (info.controllers.length > 0) {
        controllersDiv.innerHTML = info.controllers.map(controller => `
            <div class="controller-item">
                <strong>${controller.callsign}</strong>
                <div>Frequency: ${controller.frequency}</div>
                <div>Name: ${controller.name}</div>
            </div>
        `).join('');
    } else {
        controllersDiv.innerHTML = '<p>No active controllers</p>';
    }

    // Update Traffic
    function createTrafficHTML(traffic) {
        return traffic.map(pilot => `
            <div class="traffic-item">
                <strong>${pilot.callsign}</strong>
                <span class="pilot-name">${pilot.name || 'Unknown Pilot'}</span>
                <div class="flight-info">
                    <div>
                        <span class="info-label">Aircraft</span>
                        <span class="info-value">${getBasicAircraftType(pilot.flight_plan?.aircraft)}</span>
                    </div>
                    <div>
                        <span class="info-label">Altitude</span>
                        <span class="info-value">${formatAltitude(pilot.altitude)}</span>
                    </div>
                    <div>
                        <span class="info-label">Speed</span>
                        <span class="info-value">${pilot.groundspeed} kts</span>
                    </div>
                </div>
            </div>
        `).join('') || '<p>No traffic</p>';
    }

    // Update tab buttons with traffic counts
    const inboundCount = info.inboundTraffic.length;
    const outboundCount = info.outboundTraffic.length;
    
    document.querySelector('[data-tab="inbound"]').innerHTML = `Inbound (${inboundCount})`;
    document.querySelector('[data-tab="outbound"]').innerHTML = `Outbound (${outboundCount})`;

    // Initial traffic display (inbound)
    trafficDiv.innerHTML = createTrafficHTML(info.inboundTraffic);

    // Add click handlers for traffic tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active tab
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update content
            const trafficType = btn.dataset.tab;
            trafficDiv.innerHTML = createTrafficHTML(
                trafficType === 'inbound' ? info.inboundTraffic : info.outboundTraffic
            );
        });
    });

    detailsDiv.classList.remove('hidden');
}

// Add event listener for airport search
document.getElementById('airportButton').addEventListener('click', () => {
    const airportInput = document.getElementById('airportInput');
    const icao = airportInput.value.trim().toUpperCase();
    if (icao) {
        searchAirport(icao);
    }
});

document.getElementById('airportInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const icao = e.target.value.trim().toUpperCase();
        if (icao) {
            searchAirport(icao);
        }
    }
});

// Add close button handler
document.querySelector('#airport-details .close-btn').addEventListener('click', () => {
    document.getElementById('airport-details').classList.add('hidden');
    document.querySelector('.modal-backdrop').classList.remove('show');
});

// Add styles for ATC zones
const atcStyles = document.createElement('style');
atcStyles.textContent = `
    .atc-zone {
        pointer-events: all !important;
    }
    .atc-zone:hover {
        filter: brightness(1.3) !important;
    }
    .leaflet-interactive {
        pointer-events: all !important;
    }
`;
document.head.appendChild(atcStyles); 