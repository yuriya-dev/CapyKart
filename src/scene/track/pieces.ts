/**
 * src/scene/track/pieces.ts
 *
 * Sedia fungsi-fungsi modular untuk membuat potongan trek menggunakan geometri Three.js.
 * Setiap fungsi menerima (position, rotationY) dan mengembalikan THREE.Group.
 * Pivot (0, 0, 0) berada di titik masuk (entry point) potongan jalan.
 */

import * as THREE from 'three';

// Warna palet Solana
export const COLORS = {
  road: 0x1a1a2e,        // Navy gelap / Cyberpunk
  purple: 0x9945FF,      // Solana Purple
  green: 0x14F195,       // Solana Green
  teal: 0x00C2FF,        // Solana Teal
  gold: 0xF0C040,        // Gold untuk koin SOL
  orange: 0xFF6B35,      // Orange untuk Meme Barricade
  finishWhite: 0xffffff,
  finishBlack: 0x111111,
  tunnel: 0x252538,
};

// Buat material global untuk efisiensi render
const materials = {
  road: new THREE.MeshLambertMaterial({ color: COLORS.road }),
  curbPurple: new THREE.MeshLambertMaterial({ color: COLORS.purple }),
  curbGreen: new THREE.MeshLambertMaterial({ color: COLORS.green }),
  boost: new THREE.MeshLambertMaterial({ color: COLORS.teal, emissive: COLORS.teal, emissiveIntensity: 0.8 }),
  finishWhite: new THREE.MeshLambertMaterial({ color: COLORS.finishWhite }),
  finishBlack: new THREE.MeshLambertMaterial({ color: COLORS.finishBlack }),
  tunnel: new THREE.MeshLambertMaterial({ color: COLORS.tunnel, side: THREE.DoubleSide }),
  neonLine: new THREE.MeshBasicMaterial({ color: COLORS.teal }),
};

// Dimensi standar jalan
const ROAD_WIDTH = 12;
const CURB_WIDTH = 0.5;
const CURB_HEIGHT = 0.4;

/**
 * Membuat curbs (pembatas jalan) bercorak garis ungu-hijau Solana untuk track lurus.
 */
function addStraightCurbs(group: THREE.Group, length: number) {
  const segmentLength = 3; // panjang satu segmen warna
  const count = Math.ceil(length / segmentLength);
  
  const curbGeo = new THREE.BoxGeometry(CURB_WIDTH, CURB_HEIGHT, segmentLength);
  
  for (let i = 0; i < count; i++) {
    const zPos = i * segmentLength + segmentLength / 2;
    const material = i % 2 === 0 ? materials.curbPurple : materials.curbGreen;
    
    // Curb Kiri (x = -5.75)
    const leftCurb = new THREE.Mesh(curbGeo, material);
    leftCurb.position.set(-ROAD_WIDTH / 2 - CURB_WIDTH / 2, CURB_HEIGHT / 2, zPos);
    leftCurb.castShadow = true;
    leftCurb.receiveShadow = true;
    group.add(leftCurb);
    
    // Curb Kanan (x = 5.75)
    const rightCurb = new THREE.Mesh(curbGeo, material);
    rightCurb.position.set(ROAD_WIDTH / 2 + CURB_WIDTH / 2, CURB_HEIGHT / 2, zPos);
    rightCurb.castShadow = true;
    rightCurb.receiveShadow = true;
    group.add(rightCurb);
  }
}

/**
 * 1. POTONGAN LURUS (Straight)
 * Panjang: 30 unit, Lebar: 12 unit
 */
export function createStraight(position: THREE.Vector3, rotationY: number): THREE.Group {
  const group = new THREE.Group();
  
  // Jalan
  const roadGeo = new THREE.BoxGeometry(ROAD_WIDTH, 0.2, 30);
  const roadMesh = new THREE.Mesh(roadGeo, materials.road);
  roadMesh.position.set(0, -0.1, 15);
  roadMesh.receiveShadow = true;
  group.add(roadMesh);
  
  // Curbs
  addStraightCurbs(group, 30);
  
  // Posisikan group
  group.position.copy(position);
  group.rotation.y = rotationY;
  
  // Metadata untuk collision dinding
  group.userData = { type: 'straight', length: 30 };
  
  return group;
}

/**
 * 2. POTONGAN BELOK KIRI (Curve Left)
 * Putaran 90 derajat ke kiri dengan radius 15
 */
export function createCurveLeft(position: THREE.Vector3, rotationY: number): THREE.Group {
  const group = new THREE.Group();
  const radius = 15;
  
  // Jalan menggunakan RingGeometry
  const roadGeo = new THREE.RingGeometry(radius - ROAD_WIDTH / 2, radius + ROAD_WIDTH / 2, 32, 1, 0, Math.PI / 2);
  roadGeo.rotateX(-Math.PI / 2);
  
  const roadMesh = new THREE.Mesh(roadGeo, materials.road);
  roadMesh.position.set(-radius, 0, 0); // pusat lingkaran berada di x = -15
  roadMesh.receiveShadow = true;
  group.add(roadMesh);
  
  // Membuat curbs melingkar secara segmentasi
  const segments = 16;
  const angleStep = (Math.PI / 2) / segments;
  
  for (let i = 0; i < segments; i++) {
    const startAngle = i * angleStep;
    const midAngle = startAngle + angleStep / 2;
    const material = i % 2 === 0 ? materials.curbPurple : materials.curbGreen;
    
    // Curb luar (Kanan saat belok kiri, radius = 15 + 6 = 21)
    const outerRadius = radius + ROAD_WIDTH / 2 + CURB_WIDTH / 2;
    const outerCurb = new THREE.Mesh(
      new THREE.BoxGeometry(CURB_WIDTH, CURB_HEIGHT, outerRadius * angleStep + 0.1),
      material
    );
    outerCurb.position.set(
      -radius + outerRadius * Math.cos(midAngle),
      CURB_HEIGHT / 2,
      outerRadius * Math.sin(midAngle)
    );
    outerCurb.rotation.y = -midAngle;
    outerCurb.castShadow = true;
    outerCurb.receiveShadow = true;
    group.add(outerCurb);
    
    // Curb dalam (Kiri saat belok kiri, radius = 15 - 6 = 9)
    const innerRadius = radius - ROAD_WIDTH / 2 - CURB_WIDTH / 2;
    const innerCurb = new THREE.Mesh(
      new THREE.BoxGeometry(CURB_WIDTH, CURB_HEIGHT, innerRadius * angleStep + 0.1),
      material
    );
    innerCurb.position.set(
      -radius + innerRadius * Math.cos(midAngle),
      CURB_HEIGHT / 2,
      innerRadius * Math.sin(midAngle)
    );
    innerCurb.rotation.y = -midAngle;
    innerCurb.castShadow = true;
    innerCurb.receiveShadow = true;
    group.add(innerCurb);
  }
  
  group.position.copy(position);
  group.rotation.y = rotationY;
  
  group.userData = { type: 'curve-left', radius: 15 };
  
  return group;
}

/**
 * 3. POTONGAN BELOK KANAN (Curve Right)
 * Putaran 90 derajat ke kanan dengan radius 15
 */
export function createCurveRight(position: THREE.Vector3, rotationY: number): THREE.Group {
  const group = new THREE.Group();
  const radius = 15;
  
  // Jalan menggunakan RingGeometry (dari angle PI/2 ke PI)
  const roadGeo = new THREE.RingGeometry(radius - ROAD_WIDTH / 2, radius + ROAD_WIDTH / 2, 32, 1, Math.PI / 2, Math.PI / 2);
  roadGeo.rotateX(-Math.PI / 2);
  
  const roadMesh = new THREE.Mesh(roadGeo, materials.road);
  roadMesh.position.set(radius, 0, 0); // pusat lingkaran berada di x = 15
  roadMesh.receiveShadow = true;
  group.add(roadMesh);
  
  // Curbs melingkar segmentasi
  const segments = 16;
  const angleStep = (Math.PI / 2) / segments;
  
  for (let i = 0; i < segments; i++) {
    const startAngle = Math.PI / 2 + i * angleStep;
    const midAngle = startAngle + angleStep / 2;
    const material = i % 2 === 0 ? materials.curbPurple : materials.curbGreen;
    
    // Curb luar (Kiri saat belok kanan, radius = 15 + 6 = 21)
    const outerRadius = radius + ROAD_WIDTH / 2 + CURB_WIDTH / 2;
    const outerCurb = new THREE.Mesh(
      new THREE.BoxGeometry(CURB_WIDTH, CURB_HEIGHT, outerRadius * angleStep + 0.1),
      material
    );
    outerCurb.position.set(
      radius + outerRadius * Math.cos(midAngle),
      CURB_HEIGHT / 2,
      outerRadius * Math.sin(midAngle)
    );
    outerCurb.rotation.y = -midAngle;
    outerCurb.castShadow = true;
    outerCurb.receiveShadow = true;
    group.add(outerCurb);
    
    // Curb dalam (Kanan saat belok kanan, radius = 15 - 6 = 9)
    const innerRadius = radius - ROAD_WIDTH / 2 - CURB_WIDTH / 2;
    const innerCurb = new THREE.Mesh(
      new THREE.BoxGeometry(CURB_WIDTH, CURB_HEIGHT, innerRadius * angleStep + 0.1),
      material
    );
    innerCurb.position.set(
      radius + innerRadius * Math.cos(midAngle),
      CURB_HEIGHT / 2,
      innerRadius * Math.sin(midAngle)
    );
    innerCurb.rotation.y = -midAngle;
    innerCurb.castShadow = true;
    innerCurb.receiveShadow = true;
    group.add(innerCurb);
  }
  
  group.position.copy(position);
  group.rotation.y = rotationY;
  
  group.userData = { type: 'curve-right', radius: 15 };
  
  return group;
}

/**
 * 4. POTONGAN S-CURVE (S-Curve)
 * Belok kanan 90 derajat lalu belok kiri 90 derajat.
 * Menghasilkan pergeseran X = 30 dan Z = 30.
 */
export function createSCurve(position: THREE.Vector3, rotationY: number): THREE.Group {
  const group = new THREE.Group();
  
  // Kami rakit S-Curve dari 2 Curve lokal
  // Curve 1: Curve Right pada (0, 0, 0)
  const c1 = createCurveRight(new THREE.Vector3(0, 0, 0), 0);
  group.add(c1);
  
  // Curve 2: Curve Left pada (15, 0, 15) dengan rotasi -Math.PI / 2
  const c2 = createCurveLeft(new THREE.Vector3(15, 0, 15), -Math.PI / 2);
  group.add(c2);
  
  group.position.copy(position);
  group.rotation.y = rotationY;
  
  group.userData = { type: 'scurve', length: 30 };
  
  return group;
}

/**
 * 5. POTONGAN TEROWONGAN (Tunnel)
 * Trek lurus dengan kubah melengkung di atasnya.
 */
export function createTunnel(position: THREE.Vector3, rotationY: number): THREE.Group {
  const group = new THREE.Group();
  
  // Jalan & Curbs
  const roadGeo = new THREE.BoxGeometry(ROAD_WIDTH, 0.2, 30);
  const roadMesh = new THREE.Mesh(roadGeo, materials.road);
  roadMesh.position.set(0, -0.1, 15);
  roadMesh.receiveShadow = true;
  group.add(roadMesh);
  
  addStraightCurbs(group, 30);
  
  // Kubah Terowongan (Cylinder dipotong setengah)
  // Radius = 6.2, Tinggi/Panjang = 30
  const tunnelGeo = new THREE.CylinderGeometry(6.2, 6.2, 30, 16, 1, true, 0, Math.PI);
  // Putar silinder agar menutupi jalan
  tunnelGeo.rotateX(Math.PI / 2);
  tunnelGeo.rotateZ(Math.PI / 2);
  
  const tunnelMesh = new THREE.Mesh(tunnelGeo, materials.tunnel);
  tunnelMesh.position.set(0, 3, 15); // Naikkan 3 unit dari jalan
  tunnelMesh.castShadow = true;
  tunnelMesh.receiveShadow = true;
  group.add(tunnelMesh);
  
  // Garis neon di dalam terowongan
  const neonGeo = new THREE.BoxGeometry(0.1, 0.1, 30);
  const leftNeon = new THREE.Mesh(neonGeo, materials.neonLine);
  leftNeon.position.set(-6, 3, 15);
  group.add(leftNeon);
  
  const rightNeon = new THREE.Mesh(neonGeo, materials.neonLine);
  rightNeon.position.set(6, 3, 15);
  group.add(rightNeon);
  
  group.position.copy(position);
  group.rotation.y = rotationY;
  
  group.userData = { type: 'tunnel', length: 30 };
  
  return group;
}

/**
 * 6. POTONGAN BOOST LANE (Boost Lane)
 * Trek lurus dengan panah neon hijau Solana yang menyala di jalan.
 */
export function createBoostLane(position: THREE.Vector3, rotationY: number): THREE.Group {
  const group = new THREE.Group();
  
  // Jalan & Curbs
  const roadGeo = new THREE.BoxGeometry(ROAD_WIDTH, 0.2, 30);
  const roadMesh = new THREE.Mesh(roadGeo, materials.road);
  roadMesh.position.set(0, -0.1, 15);
  roadMesh.receiveShadow = true;
  group.add(roadMesh);
  
  addStraightCurbs(group, 30);
  
  // Panel Boost Pad (4 buah di sepanjang jalan lurus ini)
  const padGeo = new THREE.PlaneGeometry(3, 2);
  padGeo.rotateX(-Math.PI / 2);
  
  for (let i = 0; i < 4; i++) {
    const boostPad = new THREE.Mesh(padGeo, materials.boost);
    // Tempatkan di tengah jalan, tersebar di z = 6, 12, 18, 24
    const zPos = 6 + i * 6;
    boostPad.position.set(0, 0.02, zPos);
    boostPad.name = `boostpad_${i}`;
    group.add(boostPad);
    
    // TODO: Pasang trigger area Crashcat untuk mendeteksi mobil menabrak boost pad ini
  }
  
  group.position.copy(position);
  group.rotation.y = rotationY;
  
  group.userData = { type: 'boost', length: 30 };
  
  return group;
}

/**
 * 7. POTONGAN GARIS FINISH (Finish Line)
 * Trek lurus dengan gerbang banner garis finish dan marka kotak catur di jalan.
 */
export function createFinishLine(position: THREE.Vector3, rotationY: number): THREE.Group {
  const group = new THREE.Group();
  
  // Jalan & Curbs
  const roadGeo = new THREE.BoxGeometry(ROAD_WIDTH, 0.2, 30);
  const roadMesh = new THREE.Mesh(roadGeo, materials.road);
  roadMesh.position.set(0, -0.1, 15);
  roadMesh.receiveShadow = true;
  group.add(roadMesh);
  
  addStraightCurbs(group, 30);
  
  // Pola Kotak Catur Finish (di z = 15)
  const squareSize = 1.0;
  const rows = 2;
  const cols = Math.floor(ROAD_WIDTH / squareSize);
  const checkerboardGroup = new THREE.Group();
  checkerboardGroup.position.set(0, 0.01, 15);
  
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isWhite = (r + c) % 2 === 0;
      const mat = isWhite ? materials.finishWhite : materials.finishBlack;
      const square = new THREE.Mesh(new THREE.PlaneGeometry(squareSize, squareSize), mat);
      square.rotateX(-Math.PI / 2);
      square.position.set(
        -ROAD_WIDTH / 2 + c * squareSize + squareSize / 2,
        0,
        -rows / 2 * squareSize + r * squareSize + squareSize / 2
      );
      checkerboardGroup.add(square);
    }
  }
  group.add(checkerboardGroup);
  
  // Tiang Gawang Finish (Arch)
  const postGeo = new THREE.CylinderGeometry(0.2, 0.2, 6, 8);
  const beamGeo = new THREE.BoxGeometry(ROAD_WIDTH + 1, 0.4, 0.4);
  const signGeo = new THREE.BoxGeometry(4, 1.5, 0.1);
  
  const archGroup = new THREE.Group();
  archGroup.position.set(0, 0, 15);
  
  // Tiang Kiri
  const leftPost = new THREE.Mesh(postGeo, materials.curbPurple);
  leftPost.position.set(-ROAD_WIDTH / 2 - 0.5, 3, 0);
  leftPost.castShadow = true;
  archGroup.add(leftPost);
  
  // Tiang Kanan
  const rightPost = new THREE.Mesh(postGeo, materials.curbPurple);
  rightPost.position.set(ROAD_WIDTH / 2 + 0.5, 3, 0);
  rightPost.castShadow = true;
  archGroup.add(rightPost);
  
  // Balok Melintang
  const crossBeam = new THREE.Mesh(beamGeo, materials.curbGreen);
  crossBeam.position.set(0, 6, 0);
  crossBeam.castShadow = true;
  archGroup.add(crossBeam);
  
  // Papan Teks "FINISH"
  const signMesh = new THREE.Mesh(signGeo, materials.curbPurple);
  signMesh.position.set(0, 6, 0);
  signMesh.castShadow = true;
  archGroup.add(signMesh);
  
  // Buat tulisan FINISH sederhana dengan canvas texture
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#9945FF';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#14F195';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FINISH', 128, 64);
  }
  const textTex = new THREE.CanvasTexture(canvas);
  const textMat = new THREE.MeshBasicMaterial({ map: textTex });
  const textSign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.2), textMat);
  textSign.position.set(0, 6, 0.06); // Taruh agak di depan papan
  archGroup.add(textSign);
  
  const textSignBack = textSign.clone();
  textSignBack.position.set(0, 6, -0.06);
  textSignBack.rotation.y = Math.PI;
  archGroup.add(textSignBack);
  
  group.add(archGroup);
  
  group.position.copy(position);
  group.rotation.y = rotationY;
  
  group.userData = { type: 'finish', length: 30 };
  
  return group;
}
