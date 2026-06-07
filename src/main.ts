/**
 * src/main.ts
 *
 * Titik masuk utama aplikasi (Entry Point).
 * Memuat sirkuit, menyiapkan renderer Three.js, composer bloom, mengelola dunia fisika Crashcat,
 * mengintegrasikan audio, mengontrol siklus game (MENU -> PLAY -> FINISH), dan memperbarui UI.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { updateWorld } from 'crashcat';

import { buildTrack } from './scene/track/layout.ts';
import { setupScenery } from './scene/createScene.ts';
import { initPhysics, createVehicleBody, buildTrackColliders, buildModelColliders } from './physics/world.ts';
import { Vehicle } from './core/Vehicle.ts';
import { Controls } from './core/Controls.ts';
import { FollowCamera } from './core/Camera.ts';
import { DriftMarks } from './core/DriftMarks.ts';

// State Game
type GameState = 'LOADING' | 'MENU' | 'COUNTDOWN' | 'RACING' | 'FINISHED';
let currentState: GameState = 'LOADING';
let countdownTimer = 0;

// Variabel Utama
let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let cameraSystem: FollowCamera;
let composer: EffectComposer;
let physicsSystem: ReturnType<typeof initPhysics>;

let vehicle: Vehicle;
let bots: Vehicle[] = [];
let controls: Controls;
let trackData: ReturnType<typeof buildTrack>;
let sceneryData: ReturnType<typeof setupScenery>;
let driftMarks: DriftMarks;

// Logika Lap & Checkpoints
let currentLap = 1;
const TOTAL_LAPS = 3;
let lapTimer = 0;
let playerLeftStartZone = false; // True setelah player meninggalkan zona start (> 20m dari garis start)
let startLinePos = new THREE.Vector3(); // Posisi fisik garis start/finish dari start_line.glb
let bestLapTime = Infinity;
let coinsCollected = 0;
let score = 0;

// Sistem Audio
let audioListener: THREE.AudioListener;
let engineSound: THREE.Audio;
let coinSound: THREE.Audio;
let boostSound: THREE.Audio;
let skidSound: THREE.Audio;

// Timer & Clock
const clock = new THREE.Clock();

// Inisialisasi UI Kontainer
const uiContainer = document.createElement('div');
uiContainer.id = 'ui-container';
document.body.appendChild(uiContainer);

// Style UI Glassmorphism
const uiStyle = document.createElement('style');
uiStyle.textContent = `
  #ui-container {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 50;
    font-family: 'Outfit', 'Inter', sans-serif;
  }
  .clickable {
    pointer-events: auto;
    cursor: pointer;
  }
  /* Loading Screen */
  #loading-screen {
    position: fixed;
    inset: 0;
    background: radial-gradient(circle at center, #0f0d25 0%, #050510 100%);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    color: #ffffff;
    z-index: 1000;
    transition: opacity 0.5s ease;
  }
  .logo-text {
    font-size: 3rem;
    font-weight: 900;
    background: linear-gradient(45deg, #9945FF, #00C2FF, #14F195);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin-bottom: 20px;
    letter-spacing: 2px;
    text-shadow: 0 0 20px rgba(0, 194, 255, 0.4);
  }
  .progress-bar {
    width: 250px;
    height: 6px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    overflow: hidden;
  }
  .progress-fill {
    width: 0%;
    height: 100%;
    background: linear-gradient(90deg, #9945FF, #14F195);
    transition: width 0.1s ease;
  }
  .loading-status {
    margin-top: 12px;
    font-size: 0.9rem;
    color: #a0a0c0;
  }
  /* Glassmorphic Panel */
  .glass-panel {
    background: rgba(13, 13, 26, 0.65);
    border: 1px solid rgba(0, 194, 255, 0.25);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-radius: 16px;
    color: #ffffff;
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
  }
  /* Main Menu Overlay */
  #main-menu {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 380px;
    padding: 30px;
    text-align: center;
    display: none;
  }
  .menu-btn {
    width: 100%;
    padding: 14px;
    background: linear-gradient(90deg, #9945FF, #14F195);
    border: none;
    border-radius: 10px;
    color: #ffffff;
    font-size: 1.1rem;
    font-weight: 700;
    box-shadow: 0 0 15px rgba(20, 241, 149, 0.4);
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .menu-btn:hover {
    transform: scale(1.03);
    box-shadow: 0 0 25px rgba(20, 241, 149, 0.7);
  }
  .controls-info {
    margin-top: 20px;
    font-size: 0.85rem;
    color: #a0a0c0;
    line-height: 1.5;
  }
  /* HUD (In-game) */
  #hud {
    position: absolute;
    inset: 0;
    display: none;
  }
  .hud-item {
    position: absolute;
    padding: 10px 18px;
    font-weight: 700;
    font-size: 1.1rem;
  }
  #hud-speed {
    bottom: 24px;
    right: 24px;
    font-size: 1.8rem;
    border: 1px solid rgba(20, 241, 149, 0.3);
  }
  #hud-lap {
    top: 24px;
    left: 24px;
  }
  #hud-time {
    top: 24px;
    right: 24px;
    text-align: right;
  }
  #hud-coins {
    bottom: 24px;
    left: 24px;
    color: #F0C040;
  }
  .reset-btn {
    position: absolute;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    padding: 8px 16px;
    background: rgba(255, 60, 60, 0.2);
    border: 1px solid rgba(255, 60, 60, 0.4);
    border-radius: 8px;
    font-size: 0.85rem;
    font-weight: 600;
    color: #ff9999;
  }
  .reset-btn:hover {
    background: rgba(255, 60, 60, 0.4);
  }
  /* Results Overlay */
  #results-screen {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 400px;
    padding: 40px 30px;
    text-align: center;
    display: none;
  }
  .results-title {
    font-size: 2.2rem;
    font-weight: 900;
    color: #14F195;
    margin-bottom: 20px;
    text-shadow: 0 0 10px rgba(20, 241, 149, 0.5);
  }
  .stats-row {
    display: flex;
    justify-content: space-between;
    margin: 14px 0;
    font-size: 1.1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding-bottom: 6px;
  }
  /* Countdown Screen */
  #countdown-screen {
    position: absolute;
    inset: 0;
    display: none;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    pointer-events: none;
    z-index: 200;
    background: rgba(13, 13, 26, 0.45);
    transition: opacity 0.5s ease;
  }
  #countdown-lights {
    display: flex;
    gap: 16px;
    margin-bottom: 24px;
    background: rgba(0, 0, 0, 0.6);
    padding: 14px 28px;
    border-radius: 40px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.5);
  }
  .light-circle {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: #1a1a24;
    border: 2px solid #2d2d3a;
    box-shadow: inset 0 0 10px rgba(0,0,0,0.8);
    transition: background 0.2s, box-shadow 0.2s, border-color 0.2s;
  }
  .light-red {
    background: radial-gradient(circle, #ff3b30 0%, #a7140d 100%) !important;
    border-color: #ff6b62 !important;
    box-shadow: 0 0 25px #ff3b30, inset 0 0 8px rgba(255,255,255,0.6) !important;
  }
  .light-green {
    background: radial-gradient(circle, #4cd964 0%, #147a24 100%) !important;
    border-color: #72f287 !important;
    box-shadow: 0 0 30px #4cd964, inset 0 0 8px rgba(255,255,255,0.6) !important;
  }
  #countdown-text {
    font-size: 8rem;
    font-weight: 900;
    color: #ffffff;
    text-shadow: 0 0 40px rgba(255, 255, 255, 0.7);
    animation: countdown-pulse 1s infinite;
  }
  @keyframes countdown-pulse {
    0% { transform: scale(1.0); }
    50% { transform: scale(1.15); }
    100% { transform: scale(1.0); }
  }
`;
document.head.appendChild(uiStyle);

// Render Elemen-Elemen HTML
uiContainer.innerHTML = `
  <!-- Loading Screen -->
  <div id="loading-screen">
    <div class="logo-text">CAPY KART ARENA</div>
    <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
    <div class="loading-status" id="loading-status">Mengunduh aset 3D sirkuit...</div>
  </div>

  <!-- Main Menu -->
  <div id="main-menu" class="glass-panel">
    <div class="logo-text" style="font-size: 2.4rem;">CAPY KART</div>
    <p style="color: #a0a0c0; margin-bottom: 30px;">Race Through The Solana Metaverse</p>
    <button class="menu-btn clickable" id="btn-play">MULAI BALAPAN</button>
    <div class="controls-info">
      <strong>KONTROL KART:</strong><br>
      WASD / Tombol Panah : Setir & Gas<br>
      Tombol R : Reset Posisi<br>
      Mobile: Sentuh layar untuk Joystick Virtual
    </div>
  </div>

  <!-- HUD In-game -->
  <div id="hud">
    <div class="hud-item glass-panel" id="hud-lap">LAP: 1 / 3</div>
    <div class="hud-item glass-panel" id="hud-time">
      TIME: 00:00.00<br>
      <span style="font-size: 0.8rem; opacity: 0.6;" id="hud-best-time">BEST: --:--.--</span>
    </div>
    <div class="hud-item glass-panel" id="hud-coins">SOL COINS: 0</div>
    <button class="reset-btn clickable" id="btn-reset">RESET POSISI (R)</button>
    <div class="hud-item glass-panel" id="hud-speed">0 km/h</div>
  </div>

  <!-- Results Screen -->
  <div id="results-screen" class="glass-panel">
    <div class="results-title">FINISH!</div>
    <div style="margin-bottom: 30px;">
      <div class="stats-row"><span>Total Waktu:</span><span id="res-total-time">--:--.--</span></div>
      <div class="stats-row"><span>Best Lap:</span><span id="res-best-time">--:--.--</span></div>
      <div class="stats-row"><span>Koin SOL Terkumpul:</span><span id="res-coins">0 / 20</span></div>
      <div class="stats-row"><span>Total Skor:</span><span id="res-score">0</span></div>
    </div>
    <button class="menu-btn clickable" id="btn-replay">MAIN LAGI</button>
  </div>

  <!-- Countdown Overlay -->
  <div id="countdown-screen">
    <div id="countdown-lights">
      <div class="light-circle" id="light-1"></div>
      <div class="light-circle" id="light-2"></div>
      <div class="light-circle" id="light-3"></div>
      <div class="light-circle" id="light-4"></div>
      <div class="light-circle" id="light-5"></div>
    </div>
    <div id="countdown-text">10</div>
  </div>
`;

// Fungsi Format Waktu
function formatTime(ms: number): string {
  if (ms === Infinity || isNaN(ms)) return '--:--.--';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}

/**
 * Memperbarui tampilan UI Lampu Countdown
 */
function updateCountdownUI(timeLeft: number) {
  const cdText = document.getElementById('countdown-text') as HTMLDivElement;
  const lights = [
    document.getElementById('light-1') as HTMLDivElement,
    document.getElementById('light-2') as HTMLDivElement,
    document.getElementById('light-3') as HTMLDivElement,
    document.getElementById('light-4') as HTMLDivElement,
    document.getElementById('light-5') as HTMLDivElement
  ];

  if (!cdText) return;

  if (timeLeft <= 0) {
    cdText.textContent = 'GO!';
    cdText.style.color = '#14F195';
    cdText.style.textShadow = '0 0 30px rgba(20, 241, 149, 0.8)';
    lights.forEach(l => {
      if (l) {
        l.className = 'light-circle light-green';
      }
    });
  } else {
    const seconds = Math.ceil(timeLeft);
    cdText.textContent = seconds.toString();
    cdText.style.color = '#ffffff';
    cdText.style.textShadow = '0 0 30px rgba(255, 255, 255, 0.6)';

    if (seconds > 5) {
      lights.forEach(l => {
        if (l) l.className = 'light-circle';
      });
    } else {
      const redCount = 6 - seconds;
      lights.forEach((l, idx) => {
        if (l) {
          if (idx < redCount) {
            l.className = 'light-circle light-red';
          } else {
            l.className = 'light-circle';
          }
        }
      });
    }
  }
}

/**
 * Menghitung input kemudi dan gas untuk bot AI agar mengikuti waypoint sirkuit
 */
function calculateBotInput(bot: Vehicle, waypoints: THREE.Vector3[]) {
  const botPos = bot.spherePos;

  // Gunakan pencarian lokal di sekitar waypoint sebelumnya untuk mencegah bot berbalik arah
  const scanRangeStart = -5;
  const scanRangeEnd = 15;
  const prevIdx = bot.closestWaypointIdx;

  let minD2 = Infinity;
  let closestIdx = prevIdx;

  for (let offset = scanRangeStart; offset <= scanRangeEnd; offset++) {
    const idx = (prevIdx + offset + waypoints.length) % waypoints.length;
    const wp = waypoints[idx];
    const d2 = botPos.distanceToSquared(wp);
    if (d2 < minD2) {
      minD2 = d2;
      closestIdx = idx;
    }
  }

  bot.closestWaypointIdx = closestIdx;

  // --- Hitung curvature (kelengkungan) jalur di depan bot ---
  // Bandingkan arah vektor segmen [closest → +5] vs [+5 → +12]
  // Semakin besar sudutnya, semakin tajam tikungannya
  const cA = waypoints[closestIdx];
  const cB = waypoints[(closestIdx + 5) % waypoints.length];
  const cC = waypoints[(closestIdx + 12) % waypoints.length];
  const seg1 = cB.clone().sub(cA).normalize();
  const seg2 = cC.clone().sub(cB).normalize();
  const curvatureDot = THREE.MathUtils.clamp(seg1.dot(seg2), -1, 1);
  // curvatureAngle: 0 = lurus, PI = balik arah, ~0.4-0.8 = tikungan tajam
  const curvatureAngle = Math.acos(curvatureDot);

  // --- Dynamic lookahead: dekatkan target di tikungan tajam agar bot belok lebih awal ---
  // Trek lurus → lookahead 10, tikungan tajam → lookahead 4
  const curveFactor = THREE.MathUtils.clamp(curvatureAngle / 0.7, 0, 1);
  const lookAheadCount = Math.round(THREE.MathUtils.lerp(10, 4, curveFactor));

  const targetIdx = (closestIdx + lookAheadCount) % waypoints.length;
  const targetWp = waypoints[targetIdx];

  // Ubah posisi target ke local space bot
  const targetLocal = targetWp.clone().sub(botPos);
  const invQuat = bot.container.quaternion.clone().invert();
  targetLocal.applyQuaternion(invQuat);

  // Hitung sudut deviasi target terhadap arah hadap bot
  const angle = Math.atan2(targetLocal.x, targetLocal.z);

  // Kemudi: skala gain setir sedikit lebih besar di tikungan agar bot belok lebih mulus
  const steerGain = THREE.MathUtils.lerp(1.8, 2.4, curveFactor);
  let steer = -angle * steerGain;
  steer = THREE.MathUtils.clamp(steer, -1.0, 1.0);

  // Gas: kombinasikan curvature trek + sudut setir saat ini untuk deselerasi proaktif.
  // Gas SELALU >= 0.2 (tidak pernah berhenti penuh) agar bot tidak mogok di tikungan.
  const turnLoad = Math.max(curvatureAngle * 1.2, Math.abs(angle));
  let gas: number;
  if (turnLoad > 1.2) {
    // Tikungan sangat tajam: melambat signifikan tapi tetap bergerak
    gas = 0.5;
  } else if (turnLoad > 0.7) {
    // Tikungan tajam
    gas = 0.7;
  } else if (turnLoad > 0.4) {
    // Tikungan sedang
    gas = 0.85;
  } else {
    // Trek lurus: kecepatan penuh
    gas = 1.0;
  }

  return {
    x: steer,
    z: gas,
    touchActive: false
  };
}

/**
 * Persiapan Tampilan 3D Engine & Kamera
 */
function initRenderer() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  document.body.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  cameraSystem = new FollowCamera();

  // Effect Composer untuk Bloom Neon Glow
  composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, cameraSystem.camera);
  composer.addPass(renderPass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.35, // Intensitas glow neon
    0.05, // Radius
    0.75  // Threshold
  );
  composer.addPass(bloomPass);

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  });
}

/**
 * Inisialisasi Sistem Suara
 */
function setupAudio() {
  audioListener = new THREE.AudioListener();
  cameraSystem.camera.add(audioListener);

  engineSound = new THREE.Audio(audioListener);
  coinSound = new THREE.Audio(audioListener);
  boostSound = new THREE.Audio(audioListener);
  skidSound = new THREE.Audio(audioListener);

  const audioLoader = new THREE.AudioLoader();

  // Load suara engine kart
  audioLoader.load('audio/engine.ogg', (buffer) => {
    engineSound.setBuffer(buffer);
    engineSound.setLoop(true);
    engineSound.setVolume(0.18);
  });

  // Load suara benturan/tabrakan
  audioLoader.load('audio/skid.ogg', (buffer) => {
    // Kita gunakan buffer ini untuk boost/skid
    boostSound.setBuffer(buffer);
    boostSound.setVolume(0.4);
  });

  // Load suara rem/skid/drift
  audioLoader.load('audio/skid.ogg', (buffer) => {
    skidSound.setBuffer(buffer);
    skidSound.setLoop(true);
    skidSound.setVolume(0.0);
  });

  // Load chimes ambil koin (jika gagal, kita sintesis chimes sederhana)
  audioLoader.load('audio/impact.ogg', (buffer) => {
    coinSound.setBuffer(buffer);
    coinSound.setVolume(0.35);
  });
}

/**
 * Putar suara chimes koin (dengan sintesis cadangan jika file suara lambat dimuat)
 */
function playCoinChime() {
  if (coinSound.buffer) {
    if (coinSound.isPlaying) coinSound.stop();
    coinSound.play();
  } else {
    // Sintesis Web Audio API (Chime Koin Emas Retro)
    const ctx = (THREE.AudioContext.getContext() as AudioContext);
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(987.77, ctx.currentTime); // B5
    osc.frequency.setValueAtTime(1318.51, ctx.currentTime + 0.08); // E6
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  }
}

/**
 * Putar suara boost pad (Sintesis gemuruh angin kencang)
 */
function playBoostWhoosh() {
  if (boostSound.buffer) {
    if (boostSound.isPlaying) boostSound.stop();
    boostSound.play();
  } else {
    const ctx = (THREE.AudioContext.getContext() as AudioContext);
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(450, ctx.currentTime + 0.5);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.65);
  }
}

/**
 * Jalankan Loader Model dan Mulai Game
 */
async function loadAssets() {
  const loader = new GLTFLoader();
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('draco/');
  loader.setDRACOLoader(dracoLoader);
  const progressFill = document.getElementById('progress-fill') as HTMLDivElement;
  const loadingStatus = document.getElementById('loading-status') as HTMLDivElement;

  loadingStatus.textContent = 'Memuat sirkuit Solana City...';
  progressFill.style.width = '10%';

  try {
    // 1. Muat Model Map GLB secara Paralel (3 Berkas)
    const loadedSizes = { track: 0, terrain: 0, start_line: 0 };
    const totalSizes = { track: 25680520, terrain: 4942704, start_line: 294620 };
    const totalBytes = totalSizes.track + totalSizes.terrain + totalSizes.start_line;

    const updateProgress = () => {
      const currentLoaded = loadedSizes.track + loadedSizes.terrain + loadedSizes.start_line;
      const pct = Math.min(50, Math.floor((currentLoaded / totalBytes) * 50));
      progressFill.style.width = `${10 + pct}%`;
    };

    const [trackGltf, terrainGltf, startLineGltf] = await Promise.all([
      new Promise<any>((resolve, reject) => {
        loader.load('models/track.glb', resolve, (xhr) => {
          loadedSizes.track = xhr.loaded;
          updateProgress();
        }, reject);
      }),
      new Promise<any>((resolve, reject) => {
        loader.load('models/terrain.glb', resolve, (xhr) => {
          loadedSizes.terrain = xhr.loaded;
          updateProgress();
        }, reject);
      }),
      new Promise<any>((resolve, reject) => {
        loader.load('models/start_line.glb', resolve, (xhr) => {
          loadedSizes.start_line = xhr.loaded;
          updateProgress();
        }, reject);
      })
    ]);

    scene.add(trackGltf.scene);
    scene.add(terrainGltf.scene);
    scene.add(startLineGltf.scene);

    const wallMeshes: THREE.Mesh[] = [];

    // Aktifkan shadow, atur roughness, pastikan DoubleSide, dan matikan frustum culling agar terrender dari semua sudut
    [trackGltf, terrainGltf, startLineGltf].forEach((gltf) => {
      gltf.scene.traverse((child: any) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          child.frustumCulled = false; // Matikan culling agar tidak menghilang saat kamera berada di sudut tertentu
          if (child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((mat: any) => {
              mat.roughness = 0.8;
              mat.side = THREE.DoubleSide;
            });
          }
          // Cari mesh dinding (wall) di track.glb
          if (gltf === trackGltf && child.name.toLowerCase().includes('wall')) {
            wallMeshes.push(child);
          }
        }
      });
    });

    // Tentukan posisi start dari startLineGltf
    const getStartPos = (meshName: string, fallback: THREE.Vector3): THREE.Vector3 => {
      const obj = startLineGltf.scene.getObjectByName(meshName);
      if (obj) {
        const pos = new THREE.Vector3();
        obj.getWorldPosition(pos);
        pos.y += 1.0; // Naikkan sedikit agar tidak tembus tanah saat spawn
        return pos;
      }
      return fallback;
    };

    const spawnPositions = {
      start_1: getStartPos('start_1', new THREE.Vector3(-2.0, 1.2, -48.0)),
      start_2: getStartPos('start_2', new THREE.Vector3(2.0, 1.2, -48.0)),
      start_3: getStartPos('start_3', new THREE.Vector3(-2.0, 1.2, -45.0)),
      start_4: getStartPos('start_4', new THREE.Vector3(2.0, 1.2, -45.0))
    };

    // Simpan posisi garis start/finish sebagai rata-rata ke-4 slot start
    startLinePos.set(
      (spawnPositions.start_1.x + spawnPositions.start_2.x + spawnPositions.start_3.x + spawnPositions.start_4.x) / 4,
      (spawnPositions.start_1.y + spawnPositions.start_2.y + spawnPositions.start_3.y + spawnPositions.start_4.y) / 4,
      (spawnPositions.start_1.z + spawnPositions.start_2.z + spawnPositions.start_3.z + spawnPositions.start_4.z) / 4
    );
    console.log('START LINE POS:', startLinePos);

    // Hitung pergeseran sirkuit (shift) secara dinamis agar pas dengan jalan baru
    const new_x_center = (spawnPositions.start_1.x + spawnPositions.start_3.x) / 2;
    const new_z_center = (spawnPositions.start_1.z + spawnPositions.start_2.z) / 2;
    const shift = new THREE.Vector3(
      new_x_center - 0.15 - 25.0, // Geser mundur 25 meter di sumbu X agar sinkron dengan jalan
      0,
      new_z_center - (-48.15)
    );
    console.log("DYNAMIC SHIFT APPLIED TO WAYPOINTS:", shift);

    // 2. Bangun Trek dan Scenery secara Prosedural (koin, rintangan, dsb)
    trackData = buildTrack(shift);
    scene.add(trackData.group);

    // Visualisasi waypoints
    const pointsGeo = new THREE.BufferGeometry().setFromPoints(trackData.waypoints);
    const pointsMat = new THREE.PointsMaterial({ color: 0xff0000, size: 0.8 });
    const pointsObj = new THREE.Points(pointsGeo, pointsMat);
    // scene.add(pointsObj);
    sceneryData = setupScenery(scene, trackData.centerLineCurve);

    progressFill.style.width = '60%';
    loadingStatus.textContent = 'Memuat pembalap Capybara...';

    // 3. Muat Model Capybara Kart
    const capyGltf = await new Promise<any>((resolve, reject) => {
      loader.load('models/capy_kart.glb', resolve, (xhr) => {
        const pct = Math.floor((xhr.loaded / (xhr.total || 8976432)) * 40);
        progressFill.style.width = `${60 + pct}%`;
      }, reject);
    });

    vehicle = new Vehicle();
    const vehicleGroup = vehicle.init(capyGltf);
    scene.add(vehicleGroup);

    // Muat 3 bot lawan dengan model yang sama
    bots = [];
    for (let i = 0; i < 3; i++) {
      const bot = new Vehicle();
      const botGroup = bot.init(capyGltf);
      scene.add(botGroup);
      bots.push(bot);
    }

    driftMarks = new DriftMarks(scene);
    vehicle.onReset = () => {
      driftMarks.reset();
    };

    // 4. Setup Fisika (Crashcat)
    physicsSystem = initPhysics();
    buildTrackColliders(physicsSystem, trackData.centerLineCurve);
    wallMeshes.forEach(wallMesh => {
      // Scale wall 2× di sumbu Y agar kart tidak bisa lompat pagar
      wallMesh.scale.y *= 2.0;
      wallMesh.updateMatrixWorld(true);
      buildModelColliders(physicsSystem, wallMesh);
    });



    // Pasang rigid body dynamic ke kart player di start_3
    vehicle.startPosition.copy(spawnPositions.start_3);
    const body = createVehicleBody(physicsSystem, vehicle.startPosition);
    vehicle.rigidBody = body;
    vehicle.physicsWorld = physicsSystem.world;
    vehicle.resetPosition();

    // Pasang rigid body dynamic ke kart bots di start_1, start_2, start_4
    const botStarts = [spawnPositions.start_1, spawnPositions.start_2, spawnPositions.start_4];
    bots.forEach((bot, idx) => {
      bot.startPosition.copy(botStarts[idx]);
      const botBody = createVehicleBody(physicsSystem, bot.startPosition);
      bot.rigidBody = botBody;
      bot.physicsWorld = physicsSystem.world;
      bot.resetPosition();
    });

    // 5. Siapkan Kontrol
    controls = new Controls();

    progressFill.style.width = '100%';
    setTimeout(() => {
      const loadScreen = document.getElementById('loading-screen') as HTMLDivElement;
      loadScreen.style.opacity = '0';
      setTimeout(() => loadScreen.style.display = 'none', 500);

      // Tampilkan Menu Utama
      currentState = 'MENU';
      (document.getElementById('main-menu') as HTMLDivElement).style.display = 'block';
    }, 400);

  } catch (error) {
    console.error('Gagal memuat aset:', error);
    loadingStatus.textContent = 'Gagal memuat aset. Hubungi admin hackathon!';
  }
}

/**
 * Memulai balapan
 */
function startRace() {
  (document.getElementById('main-menu') as HTMLDivElement).style.display = 'none';
  (document.getElementById('hud') as HTMLDivElement).style.display = 'block';

  currentState = 'COUNTDOWN';
  countdownTimer = 10.0;

  const cdScreen = document.getElementById('countdown-screen') as HTMLDivElement;
  if (cdScreen) {
    cdScreen.style.display = 'flex';
    cdScreen.style.opacity = '1';
  }
  updateCountdownUI(countdownTimer);

  coinsCollected = 0;
  score = 0;
  currentLap = 1;
  lapTimer = 0;
  playerLeftStartZone = false;
  bestLapTime = Infinity;

  // Reset posisi kart & kembalikan koin terlihat
  vehicle.resetPosition();
  bots.forEach(bot => {
    bot.resetPosition();
  });
  sceneryData.coins.forEach(c => {
    c.visible = true;
  });

  // Update Tampilan HUD Awal
  (document.getElementById('hud-lap') as HTMLDivElement).textContent = `LAP: 1 / ${TOTAL_LAPS}`;
  (document.getElementById('hud-coins') as HTMLDivElement).textContent = `SOL COINS: 0`;

  // Mainkan suara mesin
  if (engineSound.buffer && !engineSound.isPlaying) {
    engineSound.play();
  }
}

/**
 * Menyelesaikan balapan
 */
function finishRace() {
  currentState = 'FINISHED';
  (document.getElementById('hud') as HTMLDivElement).style.display = 'none';

  const resultsScreen = document.getElementById('results-screen') as HTMLDivElement;
  resultsScreen.style.display = 'block';

  // Matikan suara mesin & rem
  if (engineSound.isPlaying) engineSound.stop();
  if (skidSound && skidSound.isPlaying) skidSound.stop();

  // Hitung total waktu lap
  const totalScore = (coinsCollected * 100) + Math.max(0, Math.floor(10000 - lapTimer * 10));

  // Tampilkan data hasil
  (document.getElementById('res-total-time') as HTMLSpanElement).textContent = formatTime(lapTimer * 1000);
  (document.getElementById('res-best-time') as HTMLSpanElement).textContent = formatTime(bestLapTime * 1000);
  (document.getElementById('res-coins') as HTMLSpanElement).textContent = `${coinsCollected} / 20`;
  (document.getElementById('res-score') as HTMLSpanElement).textContent = totalScore.toString();

  // Play jingle kemenangan
  playVictoryJingle();
}

function playVictoryJingle() {
  const ctx = (THREE.AudioContext.getContext() as AudioContext);
  if (!ctx) return;

  const melody = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
  melody.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.15);
    gain.gain.setValueAtTime(0.12, ctx.currentTime + idx * 0.15);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + idx * 0.15 + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + idx * 0.15);
    osc.stop(ctx.currentTime + idx * 0.15 + 0.45);
  });
}

/**
 * Loop Animasi Frame (Game Loop)
 */
function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05); // Batasi delta time maks 20fps jika lag
  const time = clock.getElapsedTime();

  // DIAGNOSTIC LOG (print every 2 seconds roughly)
  if (Math.floor(time * 10) % 20 === 0 && Math.random() < 0.05) {
    console.log(`DIAGNOSTIC: state=${currentState}, camPos=[${cameraSystem.camera.position.x.toFixed(2)}, ${cameraSystem.camera.position.y.toFixed(2)}, ${cameraSystem.camera.position.z.toFixed(2)}], spherePos=[${vehicle ? vehicle.spherePos.x.toFixed(2) : 'undefined'}, ${vehicle ? vehicle.spherePos.y.toFixed(2) : 'undefined'}, ${vehicle ? vehicle.spherePos.z.toFixed(2) : 'undefined'}], speed=${vehicle ? vehicle.linearSpeed.toFixed(2) : 'undefined'}`);
  }

  // Guard: wait until assets are loaded and initialized
  if (currentState === 'LOADING' || !sceneryData || !vehicle) {
    composer.render();
    return;
  }

  // 1. Update elemen visual dekorasi
  // Putar koin SOL
  sceneryData.coins.forEach(coin => {
    if (coin.visible) {
      coin.rotation.y += dt * 1.5;
    }
  });

  // Animasi berkedip lampu menara validator
  sceneryData.towers.forEach(tower => {
    const intensity = (Math.sin(time * 6) + 1) * 1.2; // Blinking
    tower.light.intensity = intensity;
  });

  // Warna-warni silih berganti pada emissive Billboard NFT
  sceneryData.billboards.forEach((screen, idx) => {
    // Geser phase agar warna tidak barengan
    const hue = (time * 0.05 + idx * 0.25) % 1.0;
    (screen.material as THREE.MeshLambertMaterial).emissive.setHSL(hue, 1.0, 0.5);
  });

  if (currentState === 'COUNTDOWN') {
    countdownTimer -= dt;
    updateCountdownUI(countdownTimer);

    // Karts tidak bergerak, beri input kosong
    const emptyInput = { x: 0, z: 0, touchActive: false };
    updateWorld(physicsSystem.world, {}, dt);

    vehicle.update(dt, emptyInput);
    bots.forEach(bot => {
      bot.update(dt, emptyInput);
    });

    // Perbarui kamera pengikut (pemain bisa orbit sebelum mulai)
    const inputState = controls.update();
    const isAccelerating = inputState.z > 0 || (inputState.touchActive && (inputState.x !== 0 || inputState.z !== 0));
    cameraSystem.update(dt, vehicle.spherePos, vehicle.container.quaternion, vehicle.linearSpeed, isAccelerating);

    // Mesin idling
    if (engineSound.isPlaying) {
      engineSound.setPlaybackRate(0.85);
    }

    // Update speedometer ke 0
    (document.getElementById('hud-speed') as HTMLDivElement).textContent = `0 km/h`;

    if (countdownTimer <= 0) {
      currentState = 'RACING';
      // Fade out countdown screen setelah 1.5 detik
      setTimeout(() => {
        const cdScreen = document.getElementById('countdown-screen') as HTMLDivElement;
        if (cdScreen) {
          cdScreen.style.opacity = '0';
          setTimeout(() => {
            cdScreen.style.display = 'none';
          }, 500);
        }
      }, 1500);
    }
  } else if (currentState === 'RACING') {
    lapTimer += dt;
    (document.getElementById('hud-time') as HTMLDivElement).innerHTML = `
      TIME: ${formatTime(lapTimer * 1000)}<br>
      <span style="font-size: 0.8rem; opacity: 0.6;">BEST: ${formatTime(bestLapTime * 1000)}</span>
    `;

    // Ambil input dan update fisika Crashcat
    const inputState = controls.update();
    updateWorld(physicsSystem.world, {}, dt);

    // Perbarui logika pergerakan kart
    vehicle.update(dt, inputState);

    // Update closestWaypointIdx player untuk lap detection
    // (sama dengan logika bot, tapi tanpa steering output)
    {
      const waypoints = trackData.waypoints;
      const botPos = vehicle.spherePos;
      const prevIdx = vehicle.closestWaypointIdx;
      let minD2 = Infinity;
      let closestIdx = prevIdx;
      for (let offset = -5; offset <= 15; offset++) {
        const idx = (prevIdx + offset + waypoints.length) % waypoints.length;
        const d2 = botPos.distanceToSquared(waypoints[idx]);
        if (d2 < minD2) { minD2 = d2; closestIdx = idx; }
      }
      vehicle.closestWaypointIdx = closestIdx;
    }

    // Perbarui logika pergerakan kart bot
    bots.forEach((bot) => {
      const botInput = calculateBotInput(bot, trackData.waypoints);
      bot.update(dt, botInput);
    });

    // Update drift tire tracks
    driftMarks.update(vehicle);

    // Sinkronisasi suara mesin (Pitch menyesuaikan kecepatan kart)
    if (engineSound.isPlaying) {
      const speedPct = Math.abs(vehicle.linearSpeed) / 2.5;
      engineSound.setPlaybackRate(0.8 + speedPct * 1.2);
    }

    // Sinkronisasi suara rem/drift (skid)
    if (skidSound && skidSound.buffer) {
      const isSkidding = (vehicle.driftIntensity > 0.42 && Math.abs(vehicle.linearSpeed) > 0.2) ||
        (inputState.z < 0 && vehicle.linearSpeed > 0.2);

      if (isSkidding) {
        if (!skidSound.isPlaying) {
          skidSound.play();
        }
        // Sesuaikan volume & pitch berdasarkan intensitas drift
        const targetVol = THREE.MathUtils.clamp(vehicle.driftIntensity * 0.45, 0.15, 0.65);
        skidSound.setVolume(targetVol);
        skidSound.setPlaybackRate(0.85 + Math.min(1.0, vehicle.driftIntensity) * 0.3);
      } else {
        if (skidSound.isPlaying) {
          skidSound.stop();
        }
      }
    }

    // Perbarui kamera pengikut
    const isAccelerating = inputState.z > 0 || (inputState.touchActive && (inputState.x !== 0 || inputState.z !== 0));
    cameraSystem.update(dt, vehicle.spherePos, vehicle.container.quaternion, vehicle.linearSpeed, isAccelerating);

    // Deteksi Ambil Koin SOL
    sceneryData.coins.forEach((coin) => {
      if (coin.visible) {
        const dist = vehicle.spherePos.distanceTo(coin.position);
        if (dist < 1.8) {
          coin.visible = false;
          coinsCollected++;
          score += 100;

          (document.getElementById('hud-coins') as HTMLDivElement).textContent = `SOL COINS: ${coinsCollected}`;
          playCoinChime();
        }
      }
    });

    // Deteksi Tabrak Boost Pad
    trackData.boostPads.forEach(pad => {
      const dist = vehicle.spherePos.distanceTo(pad.position);
      if (dist < 2.5) {
        // Cek apakah tidak sedang dalam boost aktif
        if (!vehicle.driftIntensity || Math.random() < 0.15) {
          // Cegah trigger berulang dalam satu frame
          vehicle.triggerBoost(1.8);
          playBoostWhoosh();
        }
      }
    });

    // Cek Lap menggunakan logika "keluar dan kembali ke zona start"
    // Player harus pergi > 20m dari garis start sebelum lap bisa dihitung
    const distToStartLine = vehicle.spherePos.distanceTo(startLinePos);

    if (!playerLeftStartZone && distToStartLine > 20.0) {
      // Player sudah meninggalkan area start
      playerLeftStartZone = true;
    }

    // Lap selesai: player kembali ke dalam radius 6m garis start, setelah meninggalkannya
    if (playerLeftStartZone && distToStartLine < 6.0 && lapTimer > 10) {
      playerLeftStartZone = false; // Reset: player harus keluar lagi sebelum lap berikutnya

      if (lapTimer < bestLapTime) {
        bestLapTime = lapTimer;
      }

      currentLap++;
      lapTimer = 0;

      if (currentLap > TOTAL_LAPS) {
        finishRace();
      } else {
        (document.getElementById('hud-lap') as HTMLDivElement).textContent = `LAP: ${currentLap} / ${TOTAL_LAPS}`;
      }
    }

    // Tombol R reset keyboard
    if ((controls as any).keys) {
      if ((controls as any).keys['KeyR']) {
        vehicle.resetPosition();
      }
    }

    // Update Angka Spidometer
    const speedKmh = Math.floor(Math.abs(vehicle.linearSpeed) * 85);
    (document.getElementById('hud-speed') as HTMLDivElement).textContent = `${speedKmh} km/h`;

  } else {
    // Mode Menu Utama / Finish: Putar kamera keliling sirkuit secara sinematik
    const rotSpeed = time * 0.05;
    const radius = 110;
    cameraSystem.camera.position.set(
      radius * Math.cos(rotSpeed),
      70,
      radius * Math.sin(rotSpeed) + 60
    );
    cameraSystem.camera.lookAt(0, 5, 60);
  }

  // Render Scene dengan bloom neon
  composer.render();
}

// Handler Tombol Aksi UI
document.getElementById('btn-play')?.addEventListener('click', () => {
  startRace();
});

document.getElementById('btn-replay')?.addEventListener('click', () => {
  (document.getElementById('results-screen') as HTMLDivElement).style.display = 'none';
  startRace();
});

document.getElementById('btn-reset')?.addEventListener('click', () => {
  vehicle.resetPosition();
});

// Jalankan Persiapan Game
initRenderer();
setupAudio();
loadAssets();
animate();
