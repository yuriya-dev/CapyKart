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
import { MenuCinematic } from './core/MenuCinematic.ts';
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
const menuCinematic = new MenuCinematic();

// Logika Lap & Checkpoints
let currentLap = 1;
const TOTAL_LAPS = 3;
let lapTimer = 0;
let totalRaceTime = 0; // Waktu total balapan
let startLinePos = new THREE.Vector3(); // Posisi fisik garis start/finish dari start_line.glb
let bestLapTime = Infinity;
let coinsCollected = 0;
let boosterCharge = 0;
const MAX_BOOSTER_CHARGE = 3;
let score = 0;

// Fungsi beeper untuk countdown
function playCountdownBeep(isGo: boolean) {
  const ctx = (THREE.AudioContext.getContext() as AudioContext);
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  if (isGo) {
    // Green light beep: tuuuut (tinggi, durasi 0.5s)
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1046.50, ctx.currentTime); // C6
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.connect(gain);
  } else {
    // Red light beep: tut (sedang, durasi 0.12s)
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
    gain.gain.setValueAtTime(0.14, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
    osc.connect(gain);
  }

  // Hubungkan ke audioListener.gain agar mematuhi volume master
  if (audioListener && audioListener.gain) {
    gain.connect(audioListener.gain);
  } else {
    gain.connect(ctx.destination);
  }

  osc.start();
  osc.stop(ctx.currentTime + 0.55);
}

// Sistem Audio & Volume Master
let audioListener: THREE.AudioListener;
let engineSound: THREE.Audio;
let lastCountdownBeepSec = -1;
let coinSound: THREE.Audio;
let boostSound: THREE.Audio;
let skidSound: THREE.Audio;

let masterVolume = 80; // default 80%
const savedVolume = localStorage.getItem('capy_kart_volume');
if (savedVolume !== null) {
  masterVolume = parseInt(savedVolume);
}

// Timer & Clock
const clock = new THREE.Clock();

function updateCoinsUI() {
  const coinsVal = document.getElementById('hud-coins-val');
  if (coinsVal) {
    coinsVal.textContent = coinsCollected.toString();
  }
}

function updateBoosterUI() {
  const statusEl = document.getElementById('hud-booster-status');
  const seg1 = document.getElementById('booster-seg-1');
  const seg2 = document.getElementById('booster-seg-2');
  const seg3 = document.getElementById('booster-seg-3');

  if (!statusEl) return;

  // Reset class semua segmen booster
  [seg1, seg2, seg3].forEach(seg => {
    if (seg) {
      seg.className = "flex-1 h-8 bg-surface border-2 border-on-surface rounded-lg flex items-center justify-center transition-all duration-300 opacity-30 scale-95";
    }
  });

  if (boosterCharge === 0) {
    statusEl.textContent = "EMPTY";
    statusEl.className = "text-on-surface-variant opacity-60";
  } else if (boosterCharge === 1) {
    statusEl.textContent = "READY (1/3)";
    statusEl.className = "text-[#9945FF] font-bold";
    if (seg1) seg1.className = "flex-1 h-8 bg-[#9945FF]/20 border-[#9945FF] border-2 rounded-lg flex items-center justify-center transition-all duration-300 opacity-100 scale-100 shadow-[0_0_8px_rgba(153,69,255,0.4)]";
  } else if (boosterCharge === 2) {
    statusEl.textContent = "READY (2/3)";
    statusEl.className = "text-[#14F195] font-bold";
    if (seg1) seg1.className = "flex-1 h-8 bg-[#14F195]/20 border-[#14F195] border-2 rounded-lg flex items-center justify-center transition-all duration-300 opacity-100 scale-100 shadow-[0_0_8px_rgba(20,241,149,0.4)]";
    if (seg2) seg2.className = "flex-1 h-8 bg-[#14F195]/20 border-[#14F195] border-2 rounded-lg flex items-center justify-center transition-all duration-300 opacity-100 scale-100 shadow-[0_0_8px_rgba(20,241,149,0.4)]";
  } else if (boosterCharge === 3) {
    statusEl.textContent = "FULL!";
    statusEl.className = "text-secondary font-black animate-pulse";
    [seg1, seg2, seg3].forEach(seg => {
      if (seg) {
        seg.className = "flex-1 h-8 bg-gradient-to-br from-[#9945FF]/20 to-[#14F195]/20 border-[#14F195] border-2 rounded-lg flex items-center justify-center transition-all duration-300 opacity-100 scale-100 shadow-[0_0_12px_rgba(20,241,149,0.6)]";
      }
    });
  }
}

function triggerPlayerBoost() {
  if (currentState !== 'RACING') return;
  if (boosterCharge > 0) {
    // 1.5 detik durasi per koin
    const duration = boosterCharge * 1.5;
    vehicle.triggerBoost(duration);
    playBoostWhoosh();

    // Reset isi booster
    boosterCharge = 0;
    updateBoosterUI();
  }
}

function showLandingPage() {
  const landing = document.getElementById('landing-page') as HTMLDivElement;
  if (landing) landing.style.display = 'block';
  document.body.style.overflow = 'auto';
}

function hideLandingPage() {
  const landing = document.getElementById('landing-page') as HTMLDivElement;
  if (landing) landing.style.display = 'none';
  document.body.style.overflow = 'hidden';
}

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
    cdText.style.color = '#ffe16e';
    cdText.style.textShadow = '0 0 30px rgba(255, 225, 110, 0.8)';
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
  audioListener.setMasterVolume(masterVolume / 100);

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
    
    // Hubungkan ke audioListener.gain agar mematuhi volume master
    if (audioListener && audioListener.gain) {
      gain.connect(audioListener.gain);
    } else {
      gain.connect(ctx.destination);
    }
    
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

  loadingStatus.textContent = 'Loading Solana City circuit...';
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
          // Sembunyikan objek booster/pad bawaan model agar tidak kasat mata
          if (gltf === trackGltf && (child.name.toLowerCase().includes('boost') || child.name.toLowerCase().includes('pad'))) {
            child.visible = false;
            child.position.y = -9999; // Pindahkan jauh agar tidak bisa memicu collider apa pun
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

    menuCinematic.build(trackData.waypoints, startLinePos);
    sceneryData = setupScenery(scene, trackData.centerLineCurve);

    progressFill.style.width = '60%';
    loadingStatus.textContent = 'Loading Capybara racers...';

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

    // Muat 3 bot lawan dengan model yang sama dan berikan tekstur kustom yang unik (suit 2-4, kart 2-4)
    bots = [];
    for (let i = 0; i < 3; i++) {
      const bot = new Vehicle();
      const botGroup = bot.init(capyGltf);
      
      const suitIdx = i + 2;
      const kartIdx = i + 2;
      bot.setCustomTextures(`/capy_suit_${suitIdx}.png`, `/kart${kartIdx}.png`);
      
      scene.add(botGroup);
      bots.push(bot);
    }

    driftMarks = new DriftMarks(scene);
    vehicle.onReset = () => {
      driftMarks.reset();
      boosterCharge = 0;
      updateBoosterUI();
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

      // Tampilkan Landing Page
      currentState = 'MENU';
      showLandingPage();
    }, 400);

  } catch (error) {
    console.error('Failed to load assets:', error);
    loadingStatus.textContent = 'Failed to load assets. Contact hackathon admin!';
  }
}

function findClosestWaypointIdxGlobal(pos: THREE.Vector3, waypoints: THREE.Vector3[]): number {
  let minD2 = Infinity;
  let closestIdx = 0;
  for (let i = 0; i < waypoints.length; i++) {
    const d2 = pos.distanceToSquared(waypoints[i]);
    if (d2 < minD2) {
      minD2 = d2;
      closestIdx = i;
    }
  }
  return closestIdx;
}

function getRacerProgress(racer: Vehicle, waypoints: THREE.Vector3[]): number {
  const wpLength = waypoints.length;
  const idx = racer.closestWaypointIdx;
  const nextIdx = (idx + 1) % wpLength;
  
  const currentWp = waypoints[idx];
  const nextWp = waypoints[nextIdx];
  const pos = racer.spherePos;
  
  const segment = new THREE.Vector3().subVectors(nextWp, currentWp);
  const segmentLength = segment.length();
  if (segmentLength < 0.001) {
    return racer.currentLap * wpLength + idx;
  }
  
  const toRacer = new THREE.Vector3().subVectors(pos, currentWp);
  const segmentDir = segment.clone().normalize();
  const projection = toRacer.dot(segmentDir) / segmentLength;
  const clampedProj = THREE.MathUtils.clamp(projection, 0, 1);
  
  return racer.currentLap * wpLength + idx + clampedProj;
}

function compareRacers(a: Vehicle, b: Vehicle, waypoints: THREE.Vector3[]): number {
  if (a.isFinished && b.isFinished) {
    return a.finishTime - b.finishTime; // Lower finishTime (faster) comes first
  }
  if (a.isFinished) return -1;
  if (b.isFinished) return 1;
  
  const progA = getRacerProgress(a, waypoints);
  const progB = getRacerProgress(b, waypoints);
  return progB - progA; // Higher progress comes first
}

/**
 * Memulai balapan
 */
function startRace() {
  hideLandingPage();
  (document.getElementById('hud') as HTMLDivElement).style.display = 'block';

  currentState = 'COUNTDOWN';
  countdownTimer = 10.0;
  lastCountdownBeepSec = 6; // Setel ke 6 agar pemicu beep bisa jalan di detik 5, 4, 3, 2, 1, 0
  cameraSystem.startIntro(5.0); // Memulai intro putaran kamera 5 detik selama countdown

  const cdScreen = document.getElementById('countdown-screen') as HTMLDivElement;
  if (cdScreen) {
    cdScreen.style.display = 'flex';
    cdScreen.style.opacity = '1';
  }
  updateCountdownUI(countdownTimer);

  coinsCollected = 0;
  boosterCharge = 0;
  score = 0;
  currentLap = 1;
  lapTimer = 0;
  totalRaceTime = 0;
  bestLapTime = Infinity;

  // Reset posisi kart & kembalikan koin terlihat
  vehicle.resetPosition();
  bots.forEach(bot => {
    bot.resetPosition();
  });

  // Tentukan waypoint terdekat secara global saat balapan dimulai
  const waypoints = trackData.waypoints;
  const initPlayerIdx = findClosestWaypointIdxGlobal(vehicle.spherePos, waypoints);
  vehicle.closestWaypointIdx = initPlayerIdx;
  vehicle.prevWaypointIdx = initPlayerIdx;
  vehicle.currentLap = 1;
  vehicle.isFinished = false;
  vehicle.finishTime = 0;

  bots.forEach(bot => {
    const initBotIdx = findClosestWaypointIdxGlobal(bot.spherePos, waypoints);
    bot.closestWaypointIdx = initBotIdx;
    bot.prevWaypointIdx = initBotIdx;
    bot.currentLap = 1;
    bot.isFinished = false;
    bot.finishTime = 0;
  });

  sceneryData.coins.forEach(c => {
    c.visible = true;
  });

  // Update Tampilan HUD Awal
  (document.getElementById('hud-lap') as HTMLDivElement).textContent = `LAP: 1 / ${TOTAL_LAPS}`;
  (document.getElementById('hud-position') as HTMLDivElement).textContent = `POS: 1 / 4`;
  updateCoinsUI();
  updateBoosterUI();

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
  const totalScore = (coinsCollected * 100) + Math.max(0, Math.floor(10000 - totalRaceTime * 10));

  // Hitung peringkat akhir pemain
  const racers = [vehicle, ...bots];
  racers.sort((a, b) => compareRacers(a, b, trackData.waypoints));
  const playerRank = racers.indexOf(vehicle) + 1;
  let rankText = `${playerRank}th Place`;
  if (playerRank === 1) rankText = '1st Place';
  else if (playerRank === 2) rankText = '2nd Place';
  else if (playerRank === 3) rankText = '3rd Place';

  (document.getElementById('results-title') as HTMLHeadingElement).textContent = `You Finished ${playerRank === 1 ? '1st' : playerRank === 2 ? '2nd' : playerRank === 3 ? '3rd' : '4th'}!`;

  // Tampilkan data hasil
  (document.getElementById('res-rank') as HTMLSpanElement).textContent = rankText;
  (document.getElementById('res-total-time') as HTMLSpanElement).textContent = formatTime(totalRaceTime * 1000);
  (document.getElementById('res-best-time') as HTMLSpanElement).textContent = formatTime(bestLapTime * 1000);
  (document.getElementById('res-coins') as HTMLSpanElement).textContent = `${coinsCollected} / 5`;
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
  // Update koin SOL (efek melayang naik turun dan logo Solana yang selalu menghadap kamera / billboarding)
  sceneryData.coins.forEach(coin => {
    if (coin.visible) {
      const coinIdx = coin.name.split('_')[1];
      // Melayang naik-turun secara halus
      coin.position.y = 0.8 + Math.sin(time * 2.5 + parseInt(coinIdx) * 0.5) * 0.12;
      
      // Putar bubble secara visual
      const bubble = coin.getObjectByName(`bubble_${coinIdx}`);
      if (bubble) {
        bubble.rotation.y += dt * 0.8;
        bubble.rotation.x += dt * 0.3;
      }
      
      // Hadapkan logo Solana (billboard) selalu ke kamera
      const logo = coin.getObjectByName(`logo_${coinIdx}`);
      if (logo) {
        logo.quaternion.copy(coin.quaternion).invert().multiply(cameraSystem.camera.quaternion);
      }
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

    // Bunyikan beep countdown sesuai transisi lampu
    const currentSec = Math.ceil(countdownTimer);
    if (countdownTimer > 0) {
      if (currentSec <= 5 && currentSec !== lastCountdownBeepSec) {
        lastCountdownBeepSec = currentSec;
        playCountdownBeep(false); // tut
      }
    } else {
      if (lastCountdownBeepSec !== 0) {
        lastCountdownBeepSec = 0;
        playCountdownBeep(true); // tuuuut
      }
    }

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
    totalRaceTime += dt;
    (document.getElementById('hud-time') as HTMLDivElement).innerHTML = `
      TIME: ${formatTime(lapTimer * 1000)}<br>
      <span style="font-size: 0.8rem; opacity: 0.6;">BEST: ${formatTime(bestLapTime * 1000)}</span>
    `;

    // Ambil input dan update fisika Crashcat
    const inputState = controls.update();
    updateWorld(physicsSystem.world, {}, dt);

    // Perbarui logika pergerakan kart
    vehicle.update(dt, inputState);

    const waypoints = trackData.waypoints;
    const totalWps = waypoints.length;

    // Update closestWaypointIdx player dan lap wrap-around
    {
      const prevIdx = vehicle.closestWaypointIdx;
      const botPos = vehicle.spherePos;
      let minD2 = Infinity;
      let closestIdx = prevIdx;
      for (let offset = -5; offset <= 15; offset++) {
        const idx = (prevIdx + offset + waypoints.length) % waypoints.length;
        const d2 = botPos.distanceToSquared(waypoints[idx]);
        if (d2 < minD2) { minD2 = d2; closestIdx = idx; }
      }
      vehicle.closestWaypointIdx = closestIdx;

      // Cek Lap wrap-around
      if (prevIdx !== closestIdx) {
        if (prevIdx > totalWps * 0.75 && closestIdx < totalWps * 0.25) {
          if (!vehicle.isFinished) {
            if (lapTimer < bestLapTime) {
              bestLapTime = lapTimer;
            }
            vehicle.currentLap++;
            currentLap = vehicle.currentLap;
            lapTimer = 0;

            // Munculkan lagi koin bubble Solana di lintasan saat lap baru
            sceneryData.coins.forEach(c => {
              c.visible = true;
            });

            if (currentLap > TOTAL_LAPS) {
              vehicle.isFinished = true;
              vehicle.finishTime = totalRaceTime;
              finishRace();
            } else {
              (document.getElementById('hud-lap') as HTMLDivElement).textContent = `LAP: ${currentLap} / ${TOTAL_LAPS}`;
            }
          }
        } else if (prevIdx < totalWps * 0.25 && closestIdx > totalWps * 0.75) {
          if (!vehicle.isFinished && vehicle.currentLap > 1) {
            vehicle.currentLap--;
            currentLap = vehicle.currentLap;
            (document.getElementById('hud-lap') as HTMLDivElement).textContent = `LAP: ${currentLap} / ${TOTAL_LAPS}`;
          }
        }
        vehicle.prevWaypointIdx = closestIdx;
      }
    }

    // Perbarui logika pergerakan kart bot dan lap wrap-around
    bots.forEach((bot) => {
      const prevIdx = bot.closestWaypointIdx;
      const botInput = calculateBotInput(bot, waypoints);
      bot.update(dt, botInput);

      const closestIdx = bot.closestWaypointIdx;
      if (prevIdx !== closestIdx) {
        if (prevIdx > totalWps * 0.75 && closestIdx < totalWps * 0.25) {
          if (!bot.isFinished) {
            bot.currentLap++;
            if (bot.currentLap > TOTAL_LAPS) {
              bot.isFinished = true;
              bot.finishTime = totalRaceTime;
            }
          }
        } else if (prevIdx < totalWps * 0.25 && closestIdx > totalWps * 0.75) {
          if (!bot.isFinished && bot.currentLap > 1) {
            bot.currentLap--;
          }
        }
        bot.prevWaypointIdx = closestIdx;
      }
    });

    // Hitung posisi/rank real-time (1/4)
    const racers = [vehicle, ...bots];
    racers.sort((a, b) => compareRacers(a, b, waypoints));
    const playerRank = racers.indexOf(vehicle) + 1;
    (document.getElementById('hud-position') as HTMLDivElement).textContent = `POS: ${playerRank} / 4`;

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

          if (boosterCharge < MAX_BOOSTER_CHARGE) {
            boosterCharge++;
            updateBoosterUI();
          }

          updateCoinsUI();
          playCoinChime();
        }
      }
    });

    // Deteksi Tabrak Boost Pad (Dihapus sepenuhnya sesuai permintaan agar tidak ada booster pad yang ter-trigger)

    // Cek Lap menggunakan logika waypoint yang diproses di atas

    // Tombol R reset keyboard
    if ((controls as any).keys) {
      if ((controls as any).keys['KeyR']) {
        startRace();
        (controls as any).keys['KeyR'] = false; // Mencegah trigger berulang kali
      }
      // Tombol Space booster keyboard
      if ((controls as any).keys['Space']) {
        triggerPlayerBoost();
        (controls as any).keys['Space'] = false; // Mencegah trigger berulang kali
      }
    }

    // Update Angka Spidometer
    const speedKmh = Math.floor(Math.abs(vehicle.linearSpeed) * 85);
    (document.getElementById('hud-speed') as HTMLDivElement).textContent = `${speedKmh} km/h`;

  } else if (currentState === 'MENU' || currentState === 'FINISHED') {
    menuCinematic.update(dt, time, cameraSystem.camera);
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

// Listener booster container click (untuk desktop click & mobile tap)
document.getElementById('hud-booster-container')?.addEventListener('click', () => {
  triggerPlayerBoost();
});

document.getElementById('btn-reset')?.addEventListener('click', () => {
  startRace();
});

// Modal Settings Handlers
const settingsModal = document.getElementById('settings-modal') as HTMLDivElement;
const btnSettings = document.getElementById('btn-settings');
const btnSettingsHud = document.getElementById('btn-settings-hud');
const btnSettingsClose = document.getElementById('btn-settings-close');
const btnSettingsSave = document.getElementById('btn-settings-save');
const volumeSlider = document.getElementById('volume-slider') as HTMLInputElement;
const volumePctText = document.getElementById('volume-pct-text') as HTMLSpanElement;
const volumeIcon = document.getElementById('volume-icon') as HTMLSpanElement;

function openSettings() {
  if (!settingsModal || !volumeSlider || !volumePctText) return;
  volumeSlider.value = masterVolume.toString();
  volumePctText.textContent = `${masterVolume}%`;
  updateVolumeIcon(masterVolume);
  
  settingsModal.style.display = 'flex';
  setTimeout(() => {
    settingsModal.style.opacity = '1';
  }, 10);
}

function closeSettings() {
  if (!settingsModal) return;
  settingsModal.style.opacity = '0';
  setTimeout(() => {
    settingsModal.style.display = 'none';
  }, 300);
}

function updateVolumeIcon(vol: number) {
  if (!volumeIcon) return;
  if (vol === 0) {
    volumeIcon.textContent = 'volume_off';
  } else if (vol < 40) {
    volumeIcon.textContent = 'volume_down';
  } else {
    volumeIcon.textContent = 'volume_up';
  }
}

btnSettings?.addEventListener('click', openSettings);
btnSettingsHud?.addEventListener('click', openSettings);
btnSettingsClose?.addEventListener('click', closeSettings);
btnSettingsSave?.addEventListener('click', () => {
  if (volumeSlider) {
    masterVolume = parseInt(volumeSlider.value);
    localStorage.setItem('capy_kart_volume', masterVolume.toString());
    if (audioListener) {
      audioListener.setMasterVolume(masterVolume / 100);
    }
  }
  closeSettings();
});

volumeSlider?.addEventListener('input', () => {
  const val = parseInt(volumeSlider.value);
  volumePctText.textContent = `${val}%`;
  updateVolumeIcon(val);
  if (audioListener) {
    audioListener.setMasterVolume(val / 100);
  }
});

// Jalankan Persiapan Game
initRenderer();
setupAudio();
loadAssets();
animate();
