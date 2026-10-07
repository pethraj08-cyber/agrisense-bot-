import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, onValue, set } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// --- PASTE YOUR FIREBASE CREDENTIALS HERE ---
const firebaseConfig = {
  apiKey: "AIzaSyD99ZUf3tSBvAewwYAMWFUBzf5PakIu-rE", // <--- Paste your Web API Key here
  databaseURL: "https://agribot-a6135-default-rtdb.firebaseio.com",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// DOM Elements
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const moistureVal = document.getElementById("moisture-val");
const distanceVal = document.getElementById("distance-val");

// Chart.js Setup
const ctx = document.getElementById('sensorChart').getContext('2d');
const sensorChart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      {
        label: 'Moisture (%)',
        data: [],
        borderColor: '#10b981',
        tension: 0.4,
        borderWidth: 2,
        pointRadius: 0
      },
      {
        label: 'Distance (cm)',
        data: [],
        borderColor: '#3b82f6',
        tension: 0.4,
        borderWidth: 2,
        pointRadius: 0
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { display: false },
      y: { 
        beginAtZero: true,
        grid: { color: '#334155' }
      }
    },
    plugins: {
      legend: { labels: { color: '#cbd5e1' } }
    },
    animation: false
  }
});

// Update Chart Data
function updateChart(moisture, distance) {
  const time = new Date().toLocaleTimeString();
  
  sensorChart.data.labels.push(time);
  sensorChart.data.datasets[0].data.push(moisture);
  sensorChart.data.datasets[1].data.push(distance);

  if (sensorChart.data.labels.length > 20) {
    sensorChart.data.labels.shift();
    sensorChart.data.datasets[0].data.shift();
    sensorChart.data.datasets[1].data.shift();
  }
  sensorChart.update();
}

// ----------------------------------------------------
// READ SENSOR DATA FROM FIREBASE
// ----------------------------------------------------
const sensorsRef = ref(db, 'bot/sensors');
onValue(sensorsRef, (snapshot) => {
  const data = snapshot.val();
  if (data) {
    statusDot.classList.add("online");
    statusText.innerText = "Connected & Active";
    statusText.style.color = "#10b981";

    const m = data.moisture || 0;
    const d = parseFloat(data.distance || 0).toFixed(1);

    moistureVal.innerText = `${m}%`;
    distanceVal.innerText = `${d} cm`;

    updateChart(m, d);
  }
}, (error) => {
  statusDot.classList.remove("online");
  statusText.innerText = "Connection Lost";
  statusText.style.color = "#ef4444";
});


// ----------------------------------------------------
// SEND CONTROL COMMANDS TO FIREBASE
// ----------------------------------------------------

// 1. RC Drive Control
const driveRef = ref(db, 'bot/control/drive');
function setDrive(cmd) { set(driveRef, cmd); }

document.getElementById('btn-forward').addEventListener('pointerdown', () => setDrive('FORWARD'));
document.getElementById('btn-backward').addEventListener('pointerdown', () => setDrive('BACKWARD'));
document.getElementById('btn-left').addEventListener('pointerdown', () => setDrive('LEFT'));
document.getElementById('btn-right').addEventListener('pointerdown', () => setDrive('RIGHT'));
document.getElementById('btn-stop').addEventListener('pointerdown', () => setDrive('STOP'));

// Stop when releasing button
['btn-forward', 'btn-backward', 'btn-left', 'btn-right'].forEach(id => {
  document.getElementById(id).addEventListener('pointerup', () => setDrive('STOP'));
  document.getElementById(id).addEventListener('pointerleave', () => setDrive('STOP')); // Fallback
});


// 2. Pulley Control
const pulleyRef = ref(db, 'bot/control/pulley');
document.getElementById('btn-pulley-up').addEventListener('click', () => set(pulleyRef, 'UP'));
document.getElementById('btn-pulley-down').addEventListener('click', () => set(pulleyRef, 'DOWN'));
document.getElementById('btn-pulley-stop').addEventListener('click', () => set(pulleyRef, 'STOP'));


// 3. Water Pump Toggle
const pumpRef = ref(db, 'bot/control/pump');
document.getElementById('toggle-pump').addEventListener('change', (e) => {
  set(pumpRef, e.target.checked);
});

// 4. Buzzer Toggle
const buzzerRef = ref(db, 'bot/control/buzzer');
document.getElementById('toggle-buzzer').addEventListener('change', (e) => {
  set(buzzerRef, e.target.checked);
});
