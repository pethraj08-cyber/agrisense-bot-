import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, onValue, set, get } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyD99ZUf3tSBvAewwYAMWFUBzf5PakIu-rE", 
  databaseURL: "https://agribot-a6135-default-rtdb.firebaseio.com",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// DOM Elements
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const moistureVal = document.getElementById("moisture-val");
const distanceVal = document.getElementById("distance-val");
const distanceStatus = document.getElementById("distance-status");
const phVal = document.getElementById("ph-val");
const logList = document.getElementById("log-list");

// LOGGING
function addLog(msg) {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const li = document.createElement("li");
  li.innerHTML = `<span class="time">${time}</span> ${msg}`;
  logList.prepend(li);
}

// CHART
const ctx = document.getElementById('sensorChart').getContext('2d');
const sensorChart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      { label: 'Moisture (%)', data: [], borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.4 },
      { label: 'Distance (cm)', data: [], borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: true, tension: 0.4 }
    ]
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    scales: { x: { display: false }, y: { beginAtZero: true, grid: { color: '#e2e8f0' } } }
  }
});

let storedData = []; 
function updateChart(moisture, distance) {
  const time = new Date().toLocaleTimeString();
  storedData.push({ time, moisture, distance });
  sensorChart.data.labels.push(time);
  sensorChart.data.datasets[0].data.push(moisture);
  sensorChart.data.datasets[1].data.push(distance);
  if (sensorChart.data.labels.length > 20) {
    sensorChart.data.labels.shift(); sensorChart.data.datasets[0].data.shift(); sensorChart.data.datasets[1].data.shift();
  }
  sensorChart.update();
}

document.getElementById('btn-download').addEventListener('click', () => {
  if (storedData.length === 0) return alert("No data yet!");
  let csvContent = "data:text/csv;charset=utf-8,Time,Moisture(%),Distance(cm)\n";
  storedData.forEach(row => { csvContent += `${row.time},${row.moisture},${row.distance}\n`; });
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a"); link.setAttribute("href", encodedUri); link.setAttribute("download", "agribot_analysis.csv");
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
});

// FEATURE FLAGS
let autoWateringEnabled = false;
let pumpCurrentlyAutoOn = false;
let autoObstacleAlarmEnabled = false;
let alarmCurrentlyAutoOn = false;

document.getElementById('toggle-auto').addEventListener('change', (e) => {
  autoWateringEnabled = e.target.checked;
  document.getElementById('toggle-pump').disabled = autoWateringEnabled;
  if (!autoWateringEnabled && pumpCurrentlyAutoOn) { set(pumpRef, false); pumpCurrentlyAutoOn = false; }
});
document.getElementById('toggle-obstacle-alarm').addEventListener('change', (e) => {
  autoObstacleAlarmEnabled = e.target.checked;
  document.getElementById('toggle-buzzer').disabled = autoObstacleAlarmEnabled;
  if (!autoObstacleAlarmEnabled && alarmCurrentlyAutoOn) { set(buzzerRef, false); alarmCurrentlyAutoOn = false; }
});

// FIREBASE REFS
const pumpRef = ref(db, 'bot/control/pump');
const buzzerRef = ref(db, 'bot/control/buzzer');
const sensorsRef = ref(db, 'bot/sensors');

onValue(sensorsRef, (snapshot) => {
  const data = snapshot.val();
  if (data) {
    statusDot.classList.add("online"); statusText.classList.add("online"); statusText.innerText = "System Online";
    const m = data.moisture || 0;
    const d = parseFloat(data.distance || 0).toFixed(1);
    const p = parseFloat(data.ph || 0).toFixed(1);
    moistureVal.innerText = `${m}%`; 
    distanceVal.innerText = `${d} cm`;
    
    if (d > 25) {
      distanceStatus.innerText = "🟢 SAFE";
      distanceStatus.style.color = "#10b981";
    } else {
      distanceStatus.innerText = "🔴 ALERT!";
      distanceStatus.style.color = "#ef4444";
    }

    phVal.innerText = `${p}`;
    updateChart(m, d);

    // Auto-Watering Logic
    if (autoWateringEnabled) {
      if (m < 30 && !pumpCurrentlyAutoOn) { set(pumpRef, true); pumpCurrentlyAutoOn = true; addLog(`Moisture critical (${m}%). Pump AUTO ON.`); }
      else if (m >= 50 && pumpCurrentlyAutoOn) { set(pumpRef, false); pumpCurrentlyAutoOn = false; addLog(`Moisture optimal (${m}%). Pump AUTO OFF.`); }
    }

    // Auto-Obstacle Logic
    if (autoObstacleAlarmEnabled) {
      if (d < 20 && !alarmCurrentlyAutoOn) { set(buzzerRef, true); alarmCurrentlyAutoOn = true; addLog(`Obstacle detected (${d}cm). Buzzer AUTO ON.`); }
      else if (d >= 25 && alarmCurrentlyAutoOn) { set(buzzerRef, false); alarmCurrentlyAutoOn = false; addLog(`Path clear (${d}cm). Buzzer AUTO OFF.`); }
    }
  }
}, (error) => {
  statusDot.classList.remove("online"); statusText.classList.remove("online"); statusText.innerText = "Connection Lost";
});

// SPEED CONTROL
const speedRef = ref(db, 'bot/control/speed');
const speedSlider = document.getElementById('speed-slider');
const speedValDisplay = document.getElementById('speed-val-display');

speedSlider.addEventListener('input', (e) => {
  const val = e.target.value;
  const percentage = Math.round((val / 255) * 100);
  speedValDisplay.innerText = `${percentage}%`;
});
speedSlider.addEventListener('change', (e) => {
  set(speedRef, parseInt(e.target.value));
  addLog(`Motor Speed set to ${Math.round((e.target.value / 255) * 100)}%`);
});

// DRIVE CONTROLS
const driveRef = ref(db, 'bot/control/drive');
let currentDriveCmd = 'STOP';

function setDrive(cmd) {
  if (cmd === currentDriveCmd) return;
  currentDriveCmd = cmd;
  set(driveRef, cmd);
  if (cmd !== 'STOP') addLog(`Driving ${cmd}`);
  else addLog("Car Stopped");
}

document.getElementById('btn-forward').addEventListener('pointerdown', () => setDrive('FORWARD'));
document.getElementById('btn-backward').addEventListener('pointerdown', () => setDrive('BACKWARD'));
document.getElementById('btn-left').addEventListener('pointerdown', () => setDrive('LEFT'));
document.getElementById('btn-right').addEventListener('pointerdown', () => setDrive('RIGHT'));
document.getElementById('btn-stop').addEventListener('click', () => setDrive('STOP'));

['btn-forward', 'btn-backward', 'btn-left', 'btn-right'].forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener('pointerup', () => setDrive('STOP'));
  el.addEventListener('pointercancel', () => setDrive('STOP'));
  el.addEventListener('pointerleave', (e) => {
    // Only stop if pointer was pressed down when leaving
    if (e.buttons !== 0) setDrive('STOP');
  });
});

// Keyboard Navigation (WASD & Arrow Keys)
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const key = e.key.toLowerCase();
  if (key === 'w' || key === 'arrowup') setDrive('FORWARD');
  else if (key === 's' || key === 'arrowdown') setDrive('BACKWARD');
  else if (key === 'a' || key === 'arrowleft') setDrive('LEFT');
  else if (key === 'd' || key === 'arrowright') setDrive('RIGHT');
  else if (key === ' ' || key === 'escape') setDrive('STOP');
});

window.addEventListener('keyup', (e) => {
  const key = e.key.toLowerCase();
  if ((key === 'w' || key === 'arrowup') && currentDriveCmd === 'FORWARD') setDrive('STOP');
  else if ((key === 's' || key === 'arrowdown') && currentDriveCmd === 'BACKWARD') setDrive('STOP');
  else if ((key === 'a' || key === 'arrowleft') && currentDriveCmd === 'LEFT') setDrive('STOP');
  else if ((key === 'd' || key === 'arrowright') && currentDriveCmd === 'RIGHT') setDrive('STOP');
});

// PULLEY & SERVO
const pulleyRef = ref(db, 'bot/control/pulley');
document.getElementById('btn-pulley-up').addEventListener('click', () => { set(pulleyRef, 'UP'); addLog("Pulley UP"); });
document.getElementById('btn-pulley-down').addEventListener('click', () => { set(pulleyRef, 'DOWN'); addLog("Pulley DOWN"); });
document.getElementById('btn-pulley-stop').addEventListener('click', () => { set(pulleyRef, 'STOP'); addLog("Pulley STOP"); });

const servoRef = ref(db, 'bot/control/servo');
document.getElementById('btn-servo-open').addEventListener('click', () => { set(servoRef, 90); addLog("Servo OPEN (90°)"); });
document.getElementById('btn-servo-close').addEventListener('click', () => { set(servoRef, 0); addLog("Servo CLOSED (0°)"); });

// MANUAL TOGGLES
document.getElementById('toggle-pump').addEventListener('change', (e) => { set(pumpRef, e.target.checked); addLog(`Manual Pump ${e.target.checked ? 'ON' : 'OFF'}`); });
document.getElementById('toggle-buzzer').addEventListener('change', (e) => { set(buzzerRef, e.target.checked); addLog(`Manual Buzzer ${e.target.checked ? 'ON' : 'OFF'}`); });
