/**
 * src/physics/world.ts
 *
 * Menginisialisasi dunia fisika Crashcat, membuat pembatas dinding statis untuk trek
 * agar kart tidak keluar dari jalan, dan membuat bodi dinamis (bola) untuk kart.
 */

import {
  registerAll,
  createWorldSettings,
  createWorld,
  addBroadphaseLayer,
  addObjectLayer,
  enableCollision,
  rigidBody,
  box,
  sphere,
  triangleMesh,
  MotionType,
  MotionQuality
} from 'crashcat';
import * as THREE from 'three';

export interface PhysicsSystem {
  world: any;
  OL_MOVING: number;
  OL_STATIC: number;
}

// Inisialisasi Register
registerAll();

/**
 * Inisialisasi dunia fisika Crashcat
 */
export function initPhysics(): PhysicsSystem {
  const worldSettings = createWorldSettings();
  worldSettings.gravity = [0, -25.0, 0]; // Naikkan gravitasi agar kart tidak melayang saat kencang

  const BPL_MOVING = addBroadphaseLayer(worldSettings);
  const BPL_STATIC = addBroadphaseLayer(worldSettings);
  const OL_MOVING = addObjectLayer(worldSettings, BPL_MOVING);
  const OL_STATIC = addObjectLayer(worldSettings, BPL_STATIC);

  // Aktifkan tabrakan antara dinamis vs statis, dan dinamis vs dinamis
  enableCollision(worldSettings, OL_MOVING, OL_STATIC);
  enableCollision(worldSettings, OL_MOVING, OL_MOVING);

  const world = createWorld(worldSettings);

  return {
    world,
    OL_MOVING,
    OL_STATIC
  };
}

/**
 * Membuat bodi bola dinamis untuk pergerakan kart
 */
export function createVehicleBody(physics: PhysicsSystem, spawnPos: THREE.Vector3): any {
  return rigidBody.create(physics.world, {
    shape: sphere.create({ radius: 0.8 }), // Radius bola 0.8
    motionType: MotionType.DYNAMIC,
    objectLayer: physics.OL_MOVING,
    position: [spawnPos.x, spawnPos.y, spawnPos.z],
    mass: 800.0,
    friction: 0.5,
    restitution: 0.1,
    linearDamping: 0.05,
    angularDamping: 3.5, // Damping angular tinggi agar tidak berputar liar
    gravityFactor: 1.5,
    motionQuality: MotionQuality.LINEAR_CAST
  });
}

/**
 * Membangun pembatas dinding statis untuk sirkuit dengan melakukan sampling kurva centerline.
 */
export function buildTrackColliders(physics: PhysicsSystem, centerLineCurve: THREE.CatmullRomCurve3) {
  void centerLineCurve;
  const world = physics.world;
  const OL_STATIC = physics.OL_STATIC;

  // Catatan: Dinding prosedural dinonaktifkan karena kita memakai model dinding dari map_v3.glb
  /*
  const ROAD_WIDTH = 4.4; // Lebar jalan di map.glb
  const WALL_THICK = 0.5;
  const WALL_HEIGHT = 1.8;
  const wallY = WALL_HEIGHT / 2 - 0.1;

  const hThick = WALL_THICK / 2;
  const hHeight = WALL_HEIGHT / 2;

  // Fungsi helper membuat dinding box statis
  function addBoxWall(pos: THREE.Vector3, rotY: number, hExt: number[]) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
    rigidBody.create(world, {
      shape: box.create({ halfExtents: hExt }),
      motionType: MotionType.STATIC,
      objectLayer: OL_STATIC,
      position: [pos.x, pos.y, pos.z],
      quaternion: [q.x, q.y, q.z, q.w],
      friction: 0.0, // Tanpa gesekan dinding agar mobil tidak tersangkut
      restitution: 0.2
    });
  }

  // Lakukan sampling kurva centerline
  const segmentCount = 200; // Jumlah segment dinding
  const points = centerLineCurve.getPoints(segmentCount);

  for (let i = 0; i < points.length; i++) {
    const pA = points[i];
    const pB = points[(i + 1) % points.length];

    // Titik tengah segment
    const center = new THREE.Vector3().addVectors(pA, pB).multiplyScalar(0.5);

    // Arah segment
    const tangent = new THREE.Vector3().subVectors(pB, pA).normalize();

    // Arah normal (tegak lurus dengan tangent di bidang XZ)
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

    // Panjang segment
    const length = pA.distanceTo(pB);
    const hLen = length / 2;

    // Sudut rotasi Y
    const rotY = Math.atan2(tangent.x, tangent.z);

    // Dinding Kiri: center + normal * (ROAD_WIDTH / 2 + WALL_THICK / 2)
    const leftWallPos = center.clone().add(normal.clone().multiplyScalar(ROAD_WIDTH / 2 + WALL_THICK / 2));
    leftWallPos.y = wallY;
    addBoxWall(leftWallPos, rotY, [hThick, hHeight, hLen]);

    // Dinding Kanan: center - normal * (ROAD_WIDTH / 2 + WALL_THICK / 2)
    const rightWallPos = center.clone().sub(normal.clone().multiplyScalar(ROAD_WIDTH / 2 + WALL_THICK / 2));
    rightWallPos.y = wallY;
    addBoxWall(rightWallPos, rotY, [hThick, hHeight, hLen]);
  }
  */

  // Tambahkan pembatas lantai sirkuit global agar kart tidak jatuh selamanya
  rigidBody.create(world, {
    shape: box.create({ halfExtents: [350, 0.05, 350] }),
    motionType: MotionType.STATIC,
    objectLayer: OL_STATIC,
    position: [0, -0.1325, 0],
    friction: 1.0,
    restitution: 0.1
  });
}

/**
 * Membangun collider statis dari mesh model GLTF (seperti wall2) menggunakan triangleMesh Crashcat
 */
export function buildModelColliders(physics: PhysicsSystem, wallMesh: THREE.Mesh) {
  const world = physics.world;
  const OL_STATIC = physics.OL_STATIC;

  const geom = wallMesh.geometry;
  const posAttr = geom.attributes.position;
  const indexAttr = geom.index;

  if (!posAttr) {
    console.error("buildModelColliders: Mesh geometry has no position attribute.");
    return;
  }

  // Transform vertices ke world space menggunakan world matrix mesh
  const positions = new Float32Array(posAttr.count * 3);
  const tempV = new THREE.Vector3();
  wallMesh.updateMatrixWorld(true);

  for (let i = 0; i < posAttr.count; i++) {
    tempV.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
    tempV.applyMatrix4(wallMesh.matrixWorld);
    positions[i * 3] = tempV.x;
    positions[i * 3 + 1] = tempV.y;
    positions[i * 3 + 2] = tempV.z;
  }

  let indices: Uint32Array | number[];
  if (indexAttr) {
    indices = new Uint32Array(indexAttr.array);
  } else {
    indices = new Uint32Array(posAttr.count);
    for (let i = 0; i < posAttr.count; i++) {
      indices[i] = i;
    }
  }

  console.log(`[Physics] Creating triangleMesh shape for "${wallMesh.name}" with ${posAttr.count} vertices...`);
  const wallShape = triangleMesh.create({ positions, indices });
  
  rigidBody.create(world, {
    shape: wallShape,
    motionType: MotionType.STATIC,
    objectLayer: OL_STATIC,
    position: [0, 0, 0],
    quaternion: [0, 0, 0, 1],
    friction: 0.0, // Tanpa gesekan agar kart tidak tersangkut
    restitution: 0.2
  });
  console.log(`[Physics] Static body for "${wallMesh.name}" registered successfully!`);
}

