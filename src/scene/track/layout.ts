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
  
  // 3. Tempatkan panel boost pads secara dinamis (misal di 15%, 45%, dan 70% lintasan)
  const boostPads: { position: THREE.Vector3; rotationY: number }[] = [];
  const padTValues = [0.15, 0.45, 0.7];
  
  const padGeo = new THREE.PlaneGeometry(3.2, 2.2);
  padGeo.rotateX(-Math.PI / 2);
  const boostMaterial = new THREE.MeshLambertMaterial({
    color: 0x00C2FF,
    emissive: 0x00C2FF,
    emissiveIntensity: 1.0,
    side: THREE.DoubleSide
  });
  
  padTValues.forEach(t => {
    const pos = centerLineCurve.getPointAt(t);
    // Letakkan sedikit di atas jalan agar terlihat (Y bounds jalan datar sekitar 0)
    pos.y = 0.05;
    
    const tangent = centerLineCurve.getTangentAt(t);
    const rotY = Math.atan2(tangent.x, tangent.z);
    
    boostPads.push({
      position: pos.clone(),
      rotationY: rotY
    });
    
    // Buat visual boost pad (panah neon)
    const mesh = new THREE.Mesh(padGeo, boostMaterial);
    mesh.position.copy(pos);
    mesh.rotation.y = rotY;
    mesh.name = `boostpad_t_${Math.floor(t * 100)}`;
    trackGroup.add(mesh);
  });
  
  return {
    group: trackGroup,
    centerLineCurve,
    checkpoints,
    boostPads,
    waypoints: points
  };
}

