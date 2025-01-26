// Admin password hash (you should change this to a secure password and use proper hashing)
const ADMIN_PASSWORD = '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8'; // This is 'password' hashed with SHA-256

// Initialize dashboard state
let visitorData = {
    current: 0,
    total48h: 0,
    peakToday: 0,
    history: []
};

let chart = null;

// Authentication functions
function sha256(message) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(message))
        .then(hash => Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, '0'))
            .join(''));
}

function login(password) {
    return sha256(password).then(hash => {
        if (hash === ADMIN_PASSWORD) {
            localStorage.setItem('adminAuthenticated', 'true');
            document.getElementById('loginForm').classList.add('hidden');
            document.getElementById('dashboard').classList.remove('hidden');
            initDashboard();
            return true;
        }
        return false;
    });
}

function logout() {
    localStorage.removeItem('adminAuthenticated');
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('loginForm').classList.remove('hidden');
}

function checkAuth() {
    if (localStorage.getItem('adminAuthenticated') === 'true') {
        document.getElementById('loginForm').classList.add('hidden');
        document.getElementById('dashboard').classList.remove('hidden');
        initDashboard();
    }
}

// Dashboard initialization
function initDashboard() {
    initChart();
    startDataCollection();
    updateStats();
}

function initChart() {
    const ctx = document.getElementById('visitorChart').getContext('2d');
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Active Visitors',
                data: [],
                borderColor: '#3498db',
                tension: 0.4,
                fill: true,
                backgroundColor: 'rgba(52, 152, 219, 0.1)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

// Data collection and updates
function startDataCollection() {
    // Simulate data collection (replace with real analytics data)
    setInterval(() => {
        const newVisitors = Math.floor(Math.random() * 5);
        updateVisitorData(newVisitors);
    }, 60000); // Update every minute
}

function updateVisitorData(currentVisitors) {
    const now = new Date();
    
    // Update current visitors
    visitorData.current = currentVisitors;
    
    // Update peak
    if (currentVisitors > visitorData.peakToday) {
        visitorData.peakToday = currentVisitors;
    }
    
    // Add to history
    visitorData.history.push({
        timestamp: now,
        visitors: currentVisitors
    });
    
    // Keep only last 48 hours
    const cutoff = new Date(now - 48 * 60 * 60 * 1000);
    visitorData.history = visitorData.history.filter(entry => entry.timestamp > cutoff);
    
    // Calculate total unique visitors in last 48h (simplified)
    visitorData.total48h = new Set(visitorData.history.map(entry => entry.visitors)).size;
    
    updateStats();
    updateChart();
    logActivity('Visitor Update', `${currentVisitors} active visitors`);
}

function updateStats() {
    document.getElementById('activeUsers').textContent = visitorData.current;
    document.getElementById('totalVisitors').textContent = visitorData.total48h;
    document.getElementById('peakUsers').textContent = visitorData.peakToday;
}

function updateChart() {
    if (!chart) return;
    
    const labels = visitorData.history.map(entry => 
        entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
    
    const data = visitorData.history.map(entry => entry.visitors);
    
    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    chart.update();
}

function logActivity(event, details) {
    const tbody = document.querySelector('#activityLog tbody');
    const row = document.createElement('tr');
    row.innerHTML = `
        <td>${new Date().toLocaleTimeString()}</td>
        <td>${event}</td>
        <td>${details}</td>
    `;
    tbody.insertBefore(row, tbody.firstChild);
    
    // Keep only last 50 entries
    while (tbody.children.length > 50) {
        tbody.removeChild(tbody.lastChild);
    }
}

// Event listeners
document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('adminPassword').value;
    const success = await login(password);
    if (!success) {
        alert('Invalid password');
    }
    document.getElementById('adminPassword').value = '';
});

document.getElementById('logoutBtn').addEventListener('click', logout);

// Initialize on load
document.addEventListener('DOMContentLoaded', checkAuth); 