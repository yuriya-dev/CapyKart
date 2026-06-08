# 🐾 CapyKart Arena
### Race Through The Solana Metaverse

---

## 🎮 Overview

*Capy Kart Arena* is a fast-paced, fun kart racing game featuring adorable capybara racers, customizable characters, and exciting arcade-style tracks. Choose your favorite capybara skin and kart, and compete against other players in thrilling races.

No download. No wallet. No login. Just **play**.

---

## ✨ Features

- 🏎️ **Arcade Kart Physics** — responsive steering, drifting, and fast acceleration
- 🌆 **Solana City Circuit** — a fully 3D track set in a solana metaverse circuit
- 💰 **Coin Collection** — pick up SOL Coins along the track for score
- ⚡ **Boost Pads** — hit neon speed pads for a burst of velocity
- 🏁 **Lap Counter & Timer** — race against your best time
- 🎭 **Character & Kart Selection** — choose your capybara suit and kart skin
- 🖥️ **HUD** — live display of speed, lap, position, and coin count
- 📱 **Mobile-Friendly** — targets 30–60 FPS on mobile, 60 FPS on desktop

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Rendering | [Three.js](https://threejs.org/) v0.184 |
| Language | TypeScript 5 |
| Build Tool | [Vite](https://vitejs.dev/) 5 |
| Physics | [Crashcat](https://github.com/isaac-mason/crashcat) |
| Deployment | Vercel |

---

## 📁 Project Structure

```
capy-racing-3d/
├── public/
│   ├── models/          # 3D assets (capy_kart.glb, track.glb, terrain.glb, gate.glb, ...)
│   ├── audio/           # Sound effects and music
│   ├── capy_suit_*.png  # Character skin previews
│   ├── kart*.png        # Kart skin previews
│   └── solana.svg       # Branding assets
├── src/
│   ├── core/
│   │   ├── Vehicle.ts       # Kart physics, handling, boost, drift
│   │   ├── Camera.ts        # Chase camera system
│   │   ├── Controls.ts      # Keyboard & touch input
│   │   ├── DriftMarks.ts    # Skid mark rendering
│   │   └── MenuCinematic.ts # Animated main menu camera
│   ├── scene/
│   │   ├── createScene.ts   # Scene bootstrap & asset loading
│   │   └── track/
│   │       ├── layout.ts    # Track assembly & checkpoint placement
│   │       ├── pieces.ts    # Modular track piece definitions
│   │       └── track_waypoints.json  # Centerline waypoint data
│   └── main.ts              # Game entry point & main loop
├── index.html               # Single-page app shell
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- npm

### Installation

```bash
# Clone the repository
git clone https://github.com/yuriya-dev/CapyKart.git
cd capy-racing-3d

# Install dependencies
npm install
```

### Development

```bash
npm run dev
```

The game will open at [http://localhost:3000](http://localhost:3000) automatically.

### Production Build

```bash
npm run build
```

Output is placed in the `dist/` folder, ready to deploy on Vercel or any static host.

### Preview Production Build

```bash
npm run preview
```

---

## 🎮 Controls

| Action | Keyboard | Mobile |
|---|---|---|
| Accelerate | `W` / `↑` | Gas pedal button |
| Brake / Reverse | `S` / `↓` | Brake button |
| Steer Left | `A` / `←` | Tilt / D-pad |
| Steer Right | `D` / `→` | Tilt / D-pad |
| Drift / Handbrake | `Space` / `Shift` | Drift button |

**Estimated race time:** ~2–3 minutes per lap.

---

## 🏗️ Architecture Highlights

### Vehicle Physics (`src/core/Vehicle.ts`)
Custom arcade physics with configurable handling feel: steering response, drift coefficient, top speed, and boost multiplier — all tunable without a heavy physics engine.

### Track System (`src/scene/track/`)
Tracks are driven by a **CatmullRomCurve3** centerline built from JSON waypoint data extracted from the GLB map. Checkpoints are distributed evenly at 0%, 25%, 50%, and 75% of the curve for lap validation.

### Physics & Collision (Crashcat)
[Crashcat](https://github.com/isaac-mason/crashcat) handles:
- Kart vs. wall collision
- Checkpoint trigger volumes
- Coin pickup detection
- Boost pad activation

---

## 🎨 Art Direction

| Goal | Detail |
|---|---|
| Style | Low Poly |
| Palette | Solana purple, green, teal |
| Readability | Clean silhouettes at mobile resolution |

**Triangle budget targets:**

| Asset | Budget |
|---|---|
| Capybara + Kart | < 6,500 tris |
| Buildings | < 1,000 tris each |
| Collectibles | < 100 tris |

---

## 🔊 Audio

| Type | Style |
|---|---|
| BGM | Synthwave / Electronic |
| Coin Pickup | Short positive chime |
| Boost | Whoosh / acceleration |
| Countdown | 3-2-1-Go beeps |
| Finish | Victory jingle |

Audio sourced from royalty-free libraries (Kenney Audio, Freesound CC0).

---

## 🗂️ Asset Credits

| Asset | Source |
|---|---|
| Road, buildings & props | [Kenney.nl](https://kenney.nl/) (CC0) |
| Capybara character model | Existing repository asset |
| Audio | Kenney Audio / Freesound CC0 |
| Racing starter reference | [mrdoob/Starter-Kit-Racing](https://github.com/mrdoob/Starter-Kit-Racing) |

---