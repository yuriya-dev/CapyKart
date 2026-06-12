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
import { Vehicle, MAX_SPEED } from './core/Vehicle.ts';
import { Controls } from './core/Controls.ts';
import { FollowCamera } from './core/Camera.ts';
import { MenuCinematic } from './core/MenuCinematic.ts';
import { DriftMarks } from './core/DriftMarks.ts';
import { Minimap } from './core/Minimap.ts';

// State Game
type GameState = 'LOADING' | 'MENU' | 'COUNTDOWN' | 'RACING' | 'PAUSED' | 'FINISHED';
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
let minimap: Minimap;
const menuCinematic = new MenuCinematic();

// Logika Lap & Checkpoints
let currentLap = 1;
const TOTAL_LAPS = 3;
let lapTimer = 0;
let totalRaceTime = 0; // Waktu total balapan
let startLinePos = new THREE.Vector3(); // Posisi fisik garis start/finish dari start_line.glb
const FINISH_LINE_RADIUS = 6.0; // Radius zona finish line dalam meter (3D)
let bestLapTime = Infinity;
let coinsCollected = 0;
const MAX_BOOSTER_CHARGE = 3;
let score = 0;

// Play.fun SDK State
let sdk: any = null;
let sdkReady = false;

function initPlayFunSDK() {
  if (typeof (window as any).OpenGameSDK !== 'undefined') {
    sdk = new (window as any).OpenGameSDK({
      ui: { usePointsWidget: true, theme: 'dark' },
      logLevel: 'info',
    });

    sdk.on('OnReady', () => {
      sdkReady = true;
      console.log('Play.fun SDK Ready!');
    });

    sdk.on('SavePointsSuccess', () => console.log('Points saved to Play.fun!'));
    sdk.on('SavePointsFailed', (err: any) => console.error('Play.fun save failed:', err));

    // Pasang pause/resume saat modal/widget SDK aktif
    sdk.on('GamePause', () => {
      pauseGame();
    });
    sdk.on('GameResume', () => {
      resumeGame();
    });

    // Inisialisasi dengan Game ID Anda dari Dashboard Play.fun
    sdk.init({ gameId: '71fc21cd-0568-45b3-b8e5-ceea6887145b' }); 
  } else {
    console.warn('OpenGameSDK is not defined. Make sure the script is loaded.');
  }
}

// Flag midpoint untuk mencegah trigger lap terlalu dini (sebelum melewati setengah sirkuit)
let playerHasPassedMidpoint = false;
const botHasPassedMidpoint: boolean[] = [];

// =============================================
// CHARACTER SELECT — Data & State
// =============================================
const CHARACTERS = [
  { name: 'CAPY SPEED', label: 'RACER #1 \u2022 AGGRESSIVE STYLE', emoji: '\uD83D\uDD34', suit: '/capy_suit_1.png', kart: '/kart1.png', preview: '/char1.png', color: '#ff4040', colorHex: 0xff4040, stats: [4, 3, 2] },
  { name: 'CAPY WAVE',  label: 'RACER #2 \u2022 SMOOTH STYLE',    emoji: '\uD83D\uDD35', suit: '/capy_suit_2.png', kart: '/kart2.png', preview: '/char2.png', color: '#00aaff', colorHex: 0x00aaff, stats: [3, 4, 3] },
  { name: 'CAPY ZAP',   label: 'RACER #3 \u2022 ELECTRIC STYLE',  emoji: '\u26A1',        suit: '/capy_suit_3.png', kart: '/kart3.png', preview: '/char3.png', color: '#ffe016', colorHex: 0xffe016, stats: [5, 2, 4] },
  { name: 'CAPY MOON',  label: 'RACER #4 \u2022 DRIFT MASTER',    emoji: '\uD83C\uDF19', suit: '/capy_suit_4.png', kart: '/kart4.png', preview: '/char4.png', color: '#9945FF', colorHex: 0x9945FF, stats: [3, 5, 5] },
];
let selectedCharacterIdx = 0;

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

  const charge = vehicle ? vehicle.boosterCharge : 0;

  if (charge === 0) {
    statusEl.textContent = "EMPTY";
    statusEl.className = "text-on-surface-variant opacity-60";
  } else if (charge === 1) {
    statusEl.textContent = "READY (1/3)";
    statusEl.className = "text-[#9945FF] font-bold";
    if (seg1) seg1.className = "flex-1 h-8 bg-[#9945FF]/20 border-[#9945FF] border-2 rounded-lg flex items-center justify-center transition-all duration-300 opacity-100 scale-100 shadow-[0_0_8px_rgba(153,69,255,0.4)]";
  } else if (charge === 2) {
    statusEl.textContent = "READY (2/3)";
    statusEl.className = "text-[#14F195] font-bold";
    if (seg1) seg1.className = "flex-1 h-8 bg-[#14F195]/20 border-[#14F195] border-2 rounded-lg flex items-center justify-center transition-all duration-300 opacity-100 scale-100 shadow-[0_0_8px_rgba(20,241,149,0.4)]";
    if (seg2) seg2.className = "flex-1 h-8 bg-[#14F195]/20 border-[#14F195] border-2 rounded-lg flex items-center justify-center transition-all duration-300 opacity-100 scale-100 shadow-[0_0_8px_rgba(20,241,149,0.4)]";
  } else if (charge === 3) {
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
  if (currentState !== 'RACING' || !vehicle) return;
  const charge = vehicle.boosterCharge;
  if (charge > 0) {
    // 1.5 detik durasi per koin
    const duration = charge * 1.5;
    vehicle.triggerBoost(duration);
    playBoostWhoosh();

    // Reset isi booster
    vehicle.boosterCharge = 0;
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

// =============================================
// CHARACTER SELECT — Functions
// =============================================

function buildCharCards() {
  const holder = document.getElementById('cs-char-card-holder');
  if (!holder) return;
  holder.innerHTML = '';
  const idx = selectedCharacterIdx;
  const char = CHARACTERS[idx];
  const statLabels = ['SPEED', 'HANDLE', 'DRIFT'];
  const statBars = char.stats.map((val, si) => `
    <div style="margin-bottom:6px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
        <span style="font-size:0.6rem;color:rgba(255,255,255,0.45);font-weight:700;letter-spacing:0.1em;">${statLabels[si]}</span>
        <span style="font-size:0.6rem;color:${char.color};font-weight:700;">${'\u2605'.repeat(val)}${'\u2606'.repeat(5-val)}</span>
      </div>
      <div style="height:4px;background:rgba(255,255,255,0.1);border-radius:99px;overflow:hidden;">
        <div class="cs-stat-bar-fill" style="height:100%;width:${val*20}%;background:${char.color};border-radius:99px;"></div>
      </div>
    </div>
  `).join('');

  const card = document.createElement('div');
  card.id = `cs-card-${idx}`;
  card.className = 'cs-char-card';
  card.innerHTML = `
    <div style="font-size:2.4rem;margin-bottom:6px;line-height:1;">${char.emoji}</div>
    <div style="font-family:'Rubik',sans-serif;font-weight:900;font-size:0.88rem;color:${char.color};letter-spacing:0.08em;text-transform:uppercase;margin-bottom:2px;">${char.name}</div>
    <div style="color:rgba(255,255,255,0.32);font-size:0.6rem;font-weight:700;letter-spacing:0.14em;margin-bottom:12px;">RACER #${idx+1}</div>
    <div style="width:100%;margin-bottom:10px;">${statBars}</div>
    <div class="cs-selected-badge" style="background:#fff;color:#000;font-size:0.58rem;font-weight:900;padding:3px 14px;border-radius:999px;letter-spacing:0.12em;margin-top:2px;">✓ SELECTED</div>
  `;
  const base = `border-radius:18px;padding:18px 14px;display:flex;flex-direction:column;align-items:center;text-align:center;transition:all 0.22s cubic-bezier(0.22,1,0.36,1);border:2px solid;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);width:100%;box-sizing:border-box;`;
  card.style.cssText = base + `border-color:${char.color};background:${char.color}18;box-shadow:0 0 28px ${char.color}50,inset 0 0 18px ${char.color}10;transform:scale(1.02);`;
  holder.appendChild(card);
}

function selectCharacter(idx: number) {
  selectedCharacterIdx = idx;
  const char = CHARACTERS[idx];
  
  // Rebuild the card for the newly selected character
  buildCharCards();

  // Update preview info text
  const nameEl = document.getElementById('cs-char-name');
  const labelEl = document.getElementById('cs-char-label');
  const glowEl = document.getElementById('cs-glow-ring');
  const bgGlow = document.getElementById('cs-bg-glow');
  if (nameEl) { nameEl.textContent = char.name; (nameEl as HTMLElement).style.color = char.color; }
  if (labelEl) { labelEl.textContent = char.label; }
  if (glowEl)  { (glowEl as HTMLElement).style.background = char.color; }
  if (bgGlow)  { (bgGlow as HTMLElement).style.background = `radial-gradient(ellipse,${char.color}12 0%,transparent 68%)`; }
  
  // Update preview image
  const imgEl = document.getElementById('char-preview-img') as HTMLImageElement | null;
  if (imgEl) {
    imgEl.src = char.preview;
  }
}

function showCharacterSelect() {
  hideLandingPage();
  const charSelectScreen = document.getElementById('character-select-screen') as HTMLDivElement;
  if (charSelectScreen) charSelectScreen.style.display = 'flex';
  document.body.classList.add('game-started');

  // Attempt to enter fullscreen and lock orientation to landscape on mobile devices
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 0);
  if (isMobile) {
    const docEl = document.documentElement;
    const requestFS = docEl.requestFullscreen || (docEl as any).webkitRequestFullscreen || (docEl as any).mozRequestFullScreen || (docEl as any).msRequestFullscreen;
    if (requestFS) {
      requestFS.call(docEl).then(() => {
        if (window.screen.orientation && (window.screen.orientation as any).lock) {
          (window.screen.orientation as any).lock('landscape').catch((err: any) => {
            console.warn('Screen orientation lock failed:', err);
          });
        }
      }).catch((err: any) => {
        console.warn('Fullscreen request failed:', err);
      });
    }
  }

  buildCharCards();
  selectCharacter(selectedCharacterIdx);
}

function hideCharacterSelect() {
  const charSelectScreen = document.getElementById('character-select-screen') as HTMLDivElement;
  if (charSelectScreen) charSelectScreen.style.display = 'none';
  document.body.classList.remove('game-started');

  // Exit fullscreen if active when returning to main home page
  if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
    const exitFS = document.exitFullscreen || (document as any).webkitExitFullscreen || (document as any).mozCancelFullScreen || (document as any).msExitFullscreen;
    if (exitFS) {
      exitFS.call(document).catch((err: any) => console.warn(err));
    }
  }
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
    gas = 0.7;
  } else if (turnLoad > 0.7) {
    // Tikungan tajam
    gas = 0.9;
  } else if (turnLoad > 0.4) {
    // Tikungan sedang
    gas = 0.95;
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

  const handleResize = () => {
    setTimeout(() => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      renderer.setSize(width, height);
      composer.setSize(width, height);
      if (cameraSystem && cameraSystem.camera) {
        cameraSystem.camera.aspect = width / height;
        cameraSystem.camera.updateProjectionMatrix();
      }
    }, 100);
  };
  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', handleResize);
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
  const ctx = (THREE.AudioContext.getContext() as AudioContext);
  if (!ctx) return;

  // Synthesize a high-quality wind "whoosh" sound using white noise and a sweep bandpass filter
  const duration = 1.5;
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  
  // Generate white noise
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const noiseNode = ctx.createBufferSource();
  noiseNode.buffer = buffer;

  const filterNode = ctx.createBiquadFilter();
  filterNode.type = 'bandpass';
  filterNode.Q.setValueAtTime(2.5, ctx.currentTime);

  // Sweep the bandpass filter frequency to simulate a zooming whoosh
  filterNode.frequency.setValueAtTime(180, ctx.currentTime);
  filterNode.frequency.exponentialRampToValueAtTime(1500, ctx.currentTime + 0.35);
  filterNode.frequency.exponentialRampToValueAtTime(280, ctx.currentTime + duration);

  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(0.01, ctx.currentTime);
  gainNode.gain.linearRampToValueAtTime(0.48, ctx.currentTime + 0.25); // Quick fade-in
  gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration); // Smooth fade-out

  noiseNode.connect(filterNode);
  filterNode.connect(gainNode);

  if (audioListener && audioListener.gain) {
    gainNode.connect(audioListener.gain);
  } else {
    gainNode.connect(ctx.destination);
  }

  noiseNode.start();
  noiseNode.stop(ctx.currentTime + duration);
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
    // 1. Muat Model Map GLB secara Paralel (4 Berkas)
    const loadedSizes = { track: 0, terrain: 0, start_line: 0, gate: 0 };
    const totalSizes = { track: 25680520, terrain: 4942704, start_line: 294620, gate: 121660 };
    const totalBytes = totalSizes.track + totalSizes.terrain + totalSizes.start_line + totalSizes.gate;

    const updateProgress = () => {
      const currentLoaded = loadedSizes.track + loadedSizes.terrain + loadedSizes.start_line + loadedSizes.gate;
      const pct = Math.min(50, Math.floor((currentLoaded / totalBytes) * 50));
      progressFill.style.width = `${10 + pct}%`;
    };

    const [trackGltf, terrainGltf, startLineGltf, gateGltf] = await Promise.all([
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
      }),
      new Promise<any>((resolve, reject) => {
        loader.load('models/gate.glb', resolve, (xhr) => {
          loadedSizes.gate = xhr.loaded;
          updateProgress();
        }, reject);
      })
    ]);

    scene.add(trackGltf.scene);
    scene.add(terrainGltf.scene);
    scene.add(startLineGltf.scene);
    scene.add(gateGltf.scene);

    const wallMeshes: THREE.Mesh[] = [];

    // Aktifkan shadow, atur roughness, pastikan DoubleSide, dan matikan frustum culling agar terrender dari semua sudut
    [trackGltf, terrainGltf, startLineGltf, gateGltf].forEach((gltf) => {
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

    // Debug: print semua nama node di startLineGltf untuk konfirmasi nama mesh
    console.log('=== START LINE GLB NODES ===');
    startLineGltf.scene.traverse((child: any) => {
      if (child.name) console.log(' -', child.name, '| type:', child.type);
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

    // Ambil posisi garis finish dari mesh start_finish_line di GLB
    const finishLineObj = startLineGltf.scene.getObjectByName('start_finish_line');
    if (finishLineObj) {
      finishLineObj.getWorldPosition(startLinePos);
      // Geser zona deteksi 8 unit ke depan (+X, arah hadap kart dari start)
      // agar trigger tepat di atas garis kotak catur, bukan sebelumnya
      startLinePos.x += 6.0;
      console.log('START FINISH LINE POS (dari mesh, +offset):', startLinePos);
    } else {
      // Fallback: rata-rata 4 slot start jika mesh tidak ditemukan
      startLinePos.set(
        (spawnPositions.start_1.x + spawnPositions.start_2.x + spawnPositions.start_3.x + spawnPositions.start_4.x) / 4,
        (spawnPositions.start_1.y + spawnPositions.start_2.y + spawnPositions.start_3.y + spawnPositions.start_4.y) / 4,
        (spawnPositions.start_1.z + spawnPositions.start_2.z + spawnPositions.start_3.z + spawnPositions.start_4.z) / 4
      );
      console.warn('start_finish_line mesh tidak ditemukan di GLB, fallback ke rata-rata spawn.');
      console.log('START LINE POS (fallback):', startLinePos);
    }

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
    // Apply karakter default (akan di-override saat startRace sesuai pilihan)
    vehicle.setCustomTextures('/capy_suit_1.png', '/kart1.png');
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
      vehicle.boosterCharge = 0;
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
    controls.onBoosterPressed = () => {
      triggerPlayerBoost();
    };

    // Initialize Minimap
    const minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    if (minimapCanvas) {
      minimap = new Minimap(minimapCanvas, trackData.waypoints, startLinePos);
    }

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

  // Gunakan (currentLap - 1) agar lap 1 dimulai dari progress 0
  // sehingga ranking tidak terbalik di dekat garis finish
  const lapOffset = (racer.currentLap - 1) * wpLength;

  if (segmentLength < 0.001) {
    return lapOffset + idx;
  }

  const toRacer = new THREE.Vector3().subVectors(pos, currentWp);
  const segmentDir = segment.clone().normalize();
  const projection = toRacer.dot(segmentDir) / segmentLength;
  const clampedProj = THREE.MathUtils.clamp(projection, 0, 1);

  return lapOffset + idx + clampedProj;
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
  // Clear focus from active button to prevent Spacebar triggering it again
  (document.activeElement as HTMLElement)?.blur();

  hideLandingPage();
  (document.getElementById('hud') as HTMLDivElement).style.display = 'block';
  controls.setVisible(true);

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
  if (vehicle) vehicle.boosterCharge = 0;
  bots.forEach(bot => {
    bot.boosterCharge = 0;
  });
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

  // Apply tekstur karakter yang dipilih ke player
  const playerChar = CHARACTERS[selectedCharacterIdx];
  vehicle.setCustomTextures(playerChar.suit, playerChar.kart);

  // Assign 3 karakter lain ke bot (tidak boleh sama dengan player)
  const botChars = CHARACTERS.filter((_, i) => i !== selectedCharacterIdx);
  bots.forEach((bot, i) => {
    bot.setCustomTextures(botChars[i].suit, botChars[i].kart);
  });

  // Tentukan waypoint terdekat secara global saat balapan dimulai
  const waypoints = trackData.waypoints;
  const initPlayerIdx = findClosestWaypointIdxGlobal(vehicle.spherePos, waypoints);
  vehicle.closestWaypointIdx = initPlayerIdx;
  vehicle.prevWaypointIdx = initPlayerIdx;
  vehicle.currentLap = 1;
  vehicle.isFinished = false;
  vehicle.finishTime = 0;
  playerHasPassedMidpoint = false; // Reset flag midpoint player

  bots.forEach((bot, i) => {
    const initBotIdx = findClosestWaypointIdxGlobal(bot.spherePos, waypoints);
    bot.closestWaypointIdx = initBotIdx;
    bot.prevWaypointIdx = initBotIdx;
    bot.currentLap = 1;
    bot.isFinished = false;
    bot.finishTime = 0;
    botHasPassedMidpoint[i] = false; // Reset flag midpoint bot
  });

  sceneryData.coins.forEach(c => {
    c.visible = true;
    c.userData.respawnTimer = undefined;
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
async function finishRace() {
  currentState = 'FINISHED';
  (document.getElementById('hud') as HTMLDivElement).style.display = 'none';
  controls.setVisible(false);

  const resultsScreen = document.getElementById('results-screen') as HTMLDivElement;
  resultsScreen.style.display = 'block';

  // Reset semua input kontrol agar tidak ada stuck input setelah balapan selesai
  controls.reset();

  // Matikan suara mesin & rem
  if (engineSound.isPlaying) engineSound.stop();
  if (skidSound && skidSound.isPlaying) skidSound.stop();

  // Hitung total waktu lap
  const timeBonus = Math.max(0, Math.floor(10000 - totalRaceTime * 10));
  const totalScore = (coinsCollected * 100) + timeBonus;

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

  // Kirim skor ke Play.fun
  if (sdk && sdkReady) {
    try {
      if (timeBonus > 0) {
        sdk.addPoints(timeBonus); // Tambahkan sisa bonus waktu ke poin Play.fun
      }
      await sdk.endGame();
    } catch (e) {
      console.error('Play.fun endGame error:', e);
    }
  }
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
    cameraSystem.update(dt, vehicle.spherePos, vehicle.container.quaternion, vehicle.linearSpeed, isAccelerating, vehicle.isBoosting);

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

    // Update closestWaypointIdx player
    {
      const prevIdx = vehicle.closestWaypointIdx;
      const playerPos = vehicle.spherePos;
      let minD2 = Infinity;
      let closestIdx = prevIdx;
      for (let offset = -5; offset <= 15; offset++) {
        const idx = (prevIdx + offset + waypoints.length) % waypoints.length;
        const d2 = playerPos.distanceToSquared(waypoints[idx]);
        if (d2 < minD2) { minD2 = d2; closestIdx = idx; }
      }
      vehicle.closestWaypointIdx = closestIdx;
      vehicle.prevWaypointIdx = closestIdx;

      // Tandai sudah melewati titik tengah sirkuit (waypoint 40-60%)
      if (!playerHasPassedMidpoint &&
          closestIdx >= totalWps * 0.4 && closestIdx <= totalWps * 0.6) {
        playerHasPassedMidpoint = true;
      }

      // Deteksi garis finish berdasarkan jarak fisik ke startLinePos
      if (!vehicle.isFinished && playerHasPassedMidpoint) {
        const distToFinish = playerPos.distanceTo(startLinePos);
        if (distToFinish <= FINISH_LINE_RADIUS) {
          // Pemain menyentuh zona garis finish setelah melewati setengah sirkuit
          playerHasPassedMidpoint = false; // Reset untuk putaran berikutnya

          if (lapTimer < bestLapTime) {
            bestLapTime = lapTimer;
          }
          vehicle.currentLap++;
          currentLap = vehicle.currentLap;
          lapTimer = 0;

          // Munculkan lagi koin bubble Solana di lintasan saat lap baru
          sceneryData.coins.forEach(c => {
            c.visible = true;
            c.userData.respawnTimer = undefined;
          });

          if (currentLap > TOTAL_LAPS) {
            vehicle.isFinished = true;
            vehicle.finishTime = totalRaceTime;
            finishRace();
          } else {
            (document.getElementById('hud-lap') as HTMLDivElement).textContent = `LAP: ${currentLap} / ${TOTAL_LAPS}`;
          }
        }
      }
    }

    // Perbarui logika pergerakan kart bot dan lap wrap-around (tetap waypoint-based)
    bots.forEach((bot, botIdx) => {
      const prevIdx = bot.closestWaypointIdx;
      const botInput = calculateBotInput(bot, waypoints);

      // Logika AI Booster: bot memicu booster saat di jalur lurus dengan muatan tersedia
      if (bot.boosterCharge > 0 && !bot.isBoosting) {
        const isOnStraight = Math.abs(botInput.x) < 0.25 && botInput.z >= 0.95;
        if (isOnStraight) {
          const boostDuration = bot.boosterCharge * 1.5;
          bot.triggerBoost(boostDuration);
          bot.boosterCharge = 0;
          // Mainkan suara boost jika bot cukup dekat dengan player
          if (vehicle.spherePos.distanceTo(bot.spherePos) < 25) {
            playBoostWhoosh();
          }
        }
      }

      bot.update(dt, botInput);

      const closestIdx = bot.closestWaypointIdx;

      // Tandai midpoint bot
      if (!botHasPassedMidpoint[botIdx] &&
          closestIdx >= totalWps * 0.4 && closestIdx <= totalWps * 0.6) {
        botHasPassedMidpoint[botIdx] = true;
      }

      if (prevIdx !== closestIdx) {
        if (prevIdx > totalWps * 0.75 && closestIdx < totalWps * 0.25 && botHasPassedMidpoint[botIdx]) {
          botHasPassedMidpoint[botIdx] = false;
          if (!bot.isFinished) {
            bot.currentLap++;
            if (bot.currentLap > TOTAL_LAPS) {
              bot.isFinished = true;
              bot.finishTime = totalRaceTime;
            }
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
      const speedPct = Math.abs(vehicle.linearSpeed) / MAX_SPEED;
      const soundPct = Math.min(1.4, speedPct);
      engineSound.setPlaybackRate(0.8 + soundPct * 1.0);
    }

    // Sinkronisasi suara rem/drift (skid)
    // Guard currentState: finishRace() bisa mengubah state di tengah frame ini
    if (currentState === 'RACING' && skidSound && skidSound.buffer) {
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
    cameraSystem.update(dt, vehicle.spherePos, vehicle.container.quaternion, vehicle.linearSpeed, isAccelerating, vehicle.isBoosting);

    // Sync wind blur overlay with boosting state
    const windBlurEl = document.getElementById('boost-wind-blur');
    if (windBlurEl) {
      if (vehicle.isBoosting) {
        windBlurEl.classList.add('active');
      } else {
        windBlurEl.classList.remove('active');
      }
    }

    // Deteksi Ambil Koin SOL — player & bots berkompetisi merebut koin
    sceneryData.coins.forEach((coin) => {
      if (!coin.visible) {
        // Hitung timer respawn koin: munculkan kembali setelah 10 detik
        if (coin.userData.respawnTimer !== undefined) {
          coin.userData.respawnTimer -= dt;
          if (coin.userData.respawnTimer <= 0) {
            coin.visible = true;
            coin.userData.respawnTimer = undefined;
          }
        }
        return;
      }

      // Cek apakah player mengambil koin
      const playerDist = vehicle.spherePos.distanceTo(coin.position);
      if (playerDist < 1.8) {
        coin.visible = false;
        coin.userData.respawnTimer = 10.0; // Respawn setelah 10 detik
        coinsCollected++;
        score += 100;
        if (sdk && sdkReady) {
          sdk.addPoints(100);
        }
        if (vehicle.boosterCharge < MAX_BOOSTER_CHARGE) {
          vehicle.boosterCharge++;
          updateBoosterUI();
        }
        updateCoinsUI();
        playCoinChime();
        return; // Koin sudah diambil player, skip cek bot
      }

      // Cek apakah salah satu bot mengambil koin
      for (const bot of bots) {
        if (bot.isFinished) continue;
        const botDist = bot.spherePos.distanceTo(coin.position);
        if (botDist < 1.8) {
          coin.visible = false;
          coin.userData.respawnTimer = 10.0; // Respawn setelah 10 detik
          if (bot.boosterCharge < MAX_BOOSTER_CHARGE) {
            bot.boosterCharge++;
          }
          // Mainkan suara whoosh jika bot dekat dengan player
          if (vehicle.spherePos.distanceTo(bot.spherePos) < 25) {
            playCoinChime();
          }
          break; // Hanya 1 bot yang bisa ambil koin ini per frame
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

  } else if (currentState === 'MENU' || currentState === 'FINISHED' || currentState === 'PAUSED') {
    menuCinematic.update(dt, time, cameraSystem.camera);
  }

  // Update Minimap
  if (minimap && currentState !== 'MENU') {
    const playerColor = CHARACTERS[selectedCharacterIdx].color;
    const botChars = CHARACTERS.filter((_, i) => i !== selectedCharacterIdx);
    const botsInfo = bots.map((bot, i) => ({
      position: bot.spherePos,
      color: botChars[i].color
    }));
    minimap.update(
      vehicle.spherePos,
      vehicle.container.quaternion,
      playerColor,
      botsInfo
    );
  }

  // Render Scene dengan bloom neon
  composer.render();
}

// Handler Tombol Aksi UI
document.getElementById('btn-play')?.addEventListener('click', () => {
  showCharacterSelect(); // Tampilkan layar pemilihan karakter dulu
});

document.getElementById('btn-char-back')?.addEventListener('click', () => {
  hideCharacterSelect();
  showLandingPage();
});

document.getElementById('btn-char-prev')?.addEventListener('click', () => {
  let newIdx = selectedCharacterIdx - 1;
  if (newIdx < 0) newIdx = CHARACTERS.length - 1;
  selectCharacter(newIdx);
});

document.getElementById('btn-char-next')?.addEventListener('click', () => {
  let newIdx = selectedCharacterIdx + 1;
  if (newIdx >= CHARACTERS.length) newIdx = 0;
  selectCharacter(newIdx);
});

document.getElementById('btn-char-race')?.addEventListener('click', () => {
  hideCharacterSelect();
  startRace();
});

document.getElementById('btn-replay')?.addEventListener('click', () => {
  (document.getElementById('results-screen') as HTMLDivElement).style.display = 'none';
  showCharacterSelect(); // Pilih karakter lagi sebelum replay
});

// Listener booster container click (untuk desktop click & mobile tap)
document.getElementById('hud-booster-container')?.addEventListener('click', () => {
  triggerPlayerBoost();
});

document.getElementById('btn-reset')?.addEventListener('click', (e) => {
  (e.currentTarget as HTMLElement)?.blur();
  startRace();
});

// Pause / Resume
const pauseScreen = document.getElementById('pause-screen') as HTMLDivElement;

function pauseGame() {
  if (currentState !== 'RACING') return;
  currentState = 'PAUSED';
  pauseScreen.style.display = 'flex';
  controls.reset();       // Bersihkan stuck input saat pause
  controls.setVisible(false);
  if (skidSound && skidSound.isPlaying) skidSound.stop(); // Hentikan suara rem saat pause
  if (engineSound && engineSound.isPlaying) engineSound.setPlaybackRate(0.3);
}

function resumeGame() {
  if (currentState !== 'PAUSED') return;
  currentState = 'RACING';
  pauseScreen.style.display = 'none';
  controls.setVisible(true);

  // Clear focus from active button to prevent Spacebar triggering it again
  (document.activeElement as HTMLElement)?.blur();

  if (engineSound && engineSound.isPlaying) engineSound.setPlaybackRate(0.85);
}

document.getElementById('btn-pause')?.addEventListener('click', pauseGame);
document.getElementById('btn-resume')?.addEventListener('click', resumeGame);
document.getElementById('btn-restart')?.addEventListener('click', () => {
  pauseScreen.style.display = 'none';
  startRace();
});

// ESC key: pause when racing, resume when paused
document.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (currentState === 'RACING') {
      pauseGame();
    } else if (currentState === 'PAUSED') {
      resumeGame();
    }
  }
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

function returnToHome() {
  closeSettings();
  
  // Hide HUD, results, pause screens
  const hud = document.getElementById('hud');
  if (hud) hud.style.display = 'none';
  
  const results = document.getElementById('results-screen');
  if (results) results.style.display = 'none';
  
  const pause = document.getElementById('pause-screen');
  if (pause) pause.style.display = 'none';
  
  // Hide character select if open
  hideCharacterSelect();
  
  // Reset game state
  currentState = 'MENU';
  showLandingPage();
  
  // Disable vehicle controls
  controls.setVisible(false);
  
  // Stop sounds
  if (engineSound && engineSound.isPlaying) engineSound.stop();
  if (skidSound && skidSound.isPlaying) skidSound.stop();
}

btnSettings?.addEventListener('click', () => {
  const btnHome = document.getElementById('btn-settings-home');
  if (btnHome) btnHome.style.display = 'none';
  openSettings();
});

btnSettingsHud?.addEventListener('click', () => {
  const btnHome = document.getElementById('btn-settings-home');
  if (btnHome) btnHome.style.display = 'flex';
  openSettings();
});

document.getElementById('btn-settings-home')?.addEventListener('click', returnToHome);
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
initPlayFunSDK();
loadAssets();
animate();
