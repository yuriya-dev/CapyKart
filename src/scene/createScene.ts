/**
 * src/scene/createScene.ts
 *
 * Menginisialisasi scene Three.js, pencahayaan, langit berbintang, tanah bermotif grid,
 * serta elemen-elemen sirkuit (koin, menara validator, billboard NFT, rintangan).
 */

import * as THREE from 'three';

export interface Scenery {
  dirLight: THREE.DirectionalLight;
  towers: { group: THREE.Group; light: THREE.PointLight }[];
  billboards: THREE.Mesh[];
  coins: THREE.Object3D[];
  obstacles: THREE.Mesh[];
}

export function setupScenery(scene: THREE.Scene, centerLineCurve: THREE.CatmullRomCurve3): Scenery {
  // 1. Atur Warna Langit dan Fog
  scene.background = new THREE.Color(0x0d0d1a); // Deep night cyberpunk
  scene.fog = new THREE.FogExp2(0x0d0d1a, 0.003); // Efek kabut cyberpunk
  
  // 2. Pencahayaan
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambientLight);
  
  const dirLight = new THREE.DirectionalLight(0xfffbe6, 1.2);
  dirLight.position.set(100, 200, 100);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 500;
  
  const d = 150;
  dirLight.shadow.camera.left = -d;
  dirLight.shadow.camera.right = d;
  dirLight.shadow.camera.top = d;
  dirLight.shadow.camera.bottom = -d;
  dirLight.shadow.bias = -0.0005;
  scene.add(dirLight);
  
  const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0xa0522d, 0.3);
  scene.add(hemiLight);
  
  // 3. Tanah (Ground Plane & Grid Helper dinonaktifkan agar tidak tumpang tindih dengan map.glb)
  /*
  const groundGeo = new THREE.PlaneGeometry(600, 600);
  const groundMat = new THREE.MeshLambertMaterial({ color: 0x121224 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.2;
  ground.receiveShadow = true;
  scene.add(ground);
  
  // Grid tipis retro warna cyan/teal
  const gridHelper = new THREE.GridHelper(600, 60, COLORS.teal, 0x22223a);
  gridHelper.position.y = -0.15;
  scene.add(gridHelper);
  */
  
  // 4. Langit Berbintang (Star Clusters)
  const starsCount = 800;
  const starsGeo = new THREE.BufferGeometry();
  const starsPositions = new Float32Array(starsCount * 3);
  
  for (let i = 0; i < starsCount; i++) {
    // Sebarkan bintang di kubah langit atas
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random()); // Hanya Y positif
    const radius = 300 + Math.random() * 100;
    
    starsPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    starsPositions[i * 3 + 1] = radius * Math.cos(phi) + 50; // Jaga tinggi di atas tanah
    starsPositions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }
  
  starsGeo.setAttribute('position', new THREE.BufferAttribute(starsPositions, 3));
  const starsMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.5,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.8
  });
  const starClusters = new THREE.Points(starsGeo, starsMat);
  scene.add(starClusters);
  
  // 5. Tempatkan Properti: ValidatorTower (Dinonaktifkan, memakai objek map.glb)
  const towers: { group: THREE.Group; light: THREE.PointLight }[] = [];
  /*
  const towerPositions = [
    new THREE.Vector3(-18, 0, 30),
    new THREE.Vector3(18, 0, 60),
    new THREE.Vector3(-20, 0, 75)
  ];
  
  towerPositions.forEach((pos, idx) => {
    const towerGroup = new THREE.Group();
    towerGroup.position.copy(pos);
    
    const height = 60 + idx * 10;
    // Bodi Menara
    const bodyGeo = new THREE.BoxGeometry(8, height, 8);
    const bodyMat = new THREE.MeshLambertMaterial({ color: COLORS.purple });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = height / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    towerGroup.add(body);
    
    // Aksen Garis Teal
    const accentGeo = new THREE.BoxGeometry(8.2, 1, 8.2);
    const accentMat = new THREE.MeshLambertMaterial({ color: COLORS.teal, emissive: COLORS.teal, emissiveIntensity: 0.5 });
    for (let h = 10; h < height; h += 15) {
      const accent = new THREE.Mesh(accentGeo, accentMat);
      accent.position.y = h;
      towerGroup.add(accent);
    }
    
    // Antena di atas
    const antennaGeo = new THREE.CylinderGeometry(0.1, 0.1, 8, 4);
    const antenna = new THREE.Mesh(antennaGeo, new THREE.MeshLambertMaterial({ color: 0x888888 }));
    antenna.position.y = height + 4;
    towerGroup.add(antenna);
    
    // Blinking point light di ujung antena
    const blinkLight = new THREE.PointLight(COLORS.green, 2, 40);
    blinkLight.position.set(0, height + 8, 0);
    blinkLight.castShadow = false;
    towerGroup.add(blinkLight);
    
    // Tambahkan bola kecil bercahaya di ujung antena
    const bulbGeo = new THREE.SphereGeometry(0.4, 8, 8);
    const bulbMat = new THREE.MeshBasicMaterial({ color: COLORS.green });
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(0, height + 8, 0);
    towerGroup.add(bulb);
    
    scene.add(towerGroup);
    towers.push({ group: towerGroup, light: blinkLight });
  });
  */
  
  // 6. Tempatkan Properti: NFTBillboard (Dinonaktifkan, memakai objek map.glb)
  const billboards: THREE.Mesh[] = [];
  /*
  const billboardPositions = [
    { pos: new THREE.Vector3(-20, 0, 110), rotY: Math.PI / 4 },
    { pos: new THREE.Vector3(25, 0, 100), rotY: -Math.PI / 4 },
    { pos: new THREE.Vector3(35, 0, 65), rotY: -Math.PI / 2 },
    { pos: new THREE.Vector3(0, 0, 145), rotY: 0 }
  ];
  
  billboardPositions.forEach((bbDef, idx) => {
    const bbGroup = new THREE.Group();
    bbGroup.position.copy(bbDef.pos);
    bbGroup.rotation.y = bbDef.rotY;
    
    // Tiang penyangga
    const poleGeo = new THREE.CylinderGeometry(0.4, 0.4, 8, 8);
    const pole = new THREE.Mesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x444444 }));
    pole.position.y = 4;
    pole.castShadow = true;
    bbGroup.add(pole);
    
    // Frame Papan (20 x 12)
    const frameGeo = new THREE.BoxGeometry(20, 12, 0.8);
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x222233 });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.y = 14;
    frame.castShadow = true;
    bbGroup.add(frame);
    
    // Layar NFT Emissive yang berubah warna
    const screenGeo = new THREE.PlaneGeometry(19.2, 11.2);
    const screenMat = new THREE.MeshLambertMaterial({
      color: COLORS.purple,
      emissive: COLORS.purple,
      emissiveIntensity: 0.6,
      side: THREE.DoubleSide
    });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(0, 14, 0.41); // Sedikit menjorok ke depan frame
    bbGroup.add(screen);
    
    // Tambahkan kanvas teks untuk tulisan "CAPY NFT"
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0)';
      ctx.fillRect(0, 0, 256, 128);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('CAPY NFT', 128, 50);
      ctx.fillStyle = COLORS.green.toString();
      ctx.font = 'bold 28px Arial';
      ctx.fillText(`#00${idx + 1}`, 128, 90);
    }
    const txtTex = new THREE.CanvasTexture(canvas);
    const txtMat = new THREE.MeshBasicMaterial({ map: txtTex, transparent: true, side: THREE.DoubleSide });
    const txtMesh = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), txtMat);
    txtMesh.position.set(0, 14, 0.43);
    bbGroup.add(txtMesh);
    
    scene.add(bbGroup);
    billboards.push(screen); // Kita simpan mesh layar untuk dianimasikan warnanya
  });
  */
  
  // 7. Tempatkan Koin SOL (x5 tersebar acak di sirkuit, koin berlogo Solana dibungkus bubble)
  const coins: THREE.Object3D[] = [];
  const coinCount = 5;

  // Persiapkan loader tekstur untuk logo Solana SVG
  const textureLoader = new THREE.TextureLoader();
  const solanaTexture = textureLoader.load('/solana.svg');
  const solanaMat = new THREE.MeshBasicMaterial({
    map: solanaTexture,
    transparent: true,
    side: THREE.DoubleSide
  });

  // Geometri Logo Solana (Plane datar diperkecil agar pas di dalam bubble)
  const logoGeo = new THREE.PlaneGeometry(0.7, 0.7);

  // Geometri dan Material Bubble pembungkus (Sphere semi-transparan berkilau, depthWrite: false agar logo di dalam terrender)
  const bubbleGeo = new THREE.SphereGeometry(0.7, 16, 16);
  const bubbleMat = new THREE.MeshPhongMaterial({
    color: 0x99e6ff,
    transparent: true,
    opacity: 0.45,
    shininess: 120,
    specular: 0xffffff,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  
  for (let i = 0; i < coinCount; i++) {
    // Membagi lintasan t [0.15, 0.85] menjadi 5 bagian non-overlapping untuk merandomisasi posisi koin tanpa clumping
    const segmentWidth = 0.70 / coinCount;
    const startT = 0.15 + i * segmentWidth;
    const t = startT + Math.random() * segmentWidth;
    
    const curvePoint = centerLineCurve.getPointAt(t);
    
    // Group pembungkus logo + bubble
    const coinGroup = new THREE.Group();
    coinGroup.position.copy(curvePoint);
    coinGroup.position.y = 0.8; // Naikkan 0.8 unit dari jalan datar
    
    // 1. Logo Solana (renderOrder: 1 agar digambar terlebih dahulu)
    const logoMesh = new THREE.Mesh(logoGeo, solanaMat);
    logoMesh.castShadow = true;
    logoMesh.name = `logo_${i}`;
    logoMesh.renderOrder = 1;
    coinGroup.add(logoMesh);
    
    // 2. Bubble pembungkus (renderOrder: 2 agar digambar belakangan dengan blending transparan)
    const bubbleMesh = new THREE.Mesh(bubbleGeo, bubbleMat);
    bubbleMesh.name = `bubble_${i}`;
    bubbleMesh.renderOrder = 2;
    coinGroup.add(bubbleMesh);

    coinGroup.name = `coin_${i}`;
    scene.add(coinGroup);
    coins.push(coinGroup);
  }
  
  // 8. Rintangan dinonaktifkan (dihapus kotak obstakel sesuai permintaan)
  
  return {
    dirLight,
    towers,
    billboards,
    coins,
    obstacles: []
  };
}
