/**
 * src/scene/track/layout.ts
 *
 * Mengatur lintasan sirkuit menggunakan data waypoint yang diekstrak dari map.glb.
 * Menghasilkan centerline curve (CatmullRomCurve3) untuk navigasi kart,
 * serta menempatkan checkpoints dan boost pads secara dinamis di sepanjang sirkuit.
 */

import * as THREE from 'three';
import waypointsData from './track_waypoints.json';

export interface AssembledTrack {
  group: THREE.Group;
  centerLineCurve: THREE.CatmullRomCurve3;
  checkpoints: THREE.Vector3[];
  boostPads: { position: THREE.Vector3; rotationY: number }[];
  waypoints: THREE.Vector3[];
}

/**
 * Merakit data sirkuit dari waypoint dan mengembalikan objek AssembledTrack.
 */
export function buildTrack(shift = new THREE.Vector3(0, 0, 0)): AssembledTrack {
  const trackGroup = new THREE.Group();
  trackGroup.name = 'track_circuit';
  
  // 1. Bangun CatmullRomCurve3 dari waypoints JSON
  const points = waypointsData.map(w => new THREE.Vector3(w.x + shift.x, w.y + shift.y, w.z + shift.z));
  const centerLineCurve = new THREE.CatmullRomCurve3(points, true, 'centripetal');
  
  // 2. Tempatkan checkpoints secara merata (0%, 25%, 50%, 75% dari lintasan)
  const checkpoints = [
    centerLineCurve.getPointAt(0.0),
    centerLineCurve.getPointAt(0.25),
    centerLineCurve.getPointAt(0.5),
    centerLineCurve.getPointAt(0.75)
  ];
  
  // 3. Tempatkan panel boost pads secara dinamis (Hapus semua boost pad awal sirkuit)
  const boostPads: { position: THREE.Vector3; rotationY: number }[] = [];
  
  return {
    group: trackGroup,
    centerLineCurve,
    checkpoints,
    boostPads,
    waypoints: points
  };
}

