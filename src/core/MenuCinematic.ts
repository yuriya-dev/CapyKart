/**
 * Kamera sinematik beranda: loop sorot garis start (ikut jalan) & tikungan tajam.
 */

import * as THREE from 'three';

type StaticShot = {
  kind: 'static';
  camPos: THREE.Vector3;
  lookAt: THREE.Vector3;
  holdDuration: number;
};

type PathShot = {
  kind: 'path';
  fromIdx: number;
  pathLength: number;
  duration: number;
};

type CinematicShot = StaticShot | PathShot;

function findClosestWaypointIndex(waypoints: THREE.Vector3[], pos: THREE.Vector3): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < waypoints.length; i++) {
    const d = waypoints[i].distanceToSquared(pos);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function getWaypointTangent(waypoints: THREE.Vector3[], idx: number): THREE.Vector3 {
  const n = waypoints.length;
  const prev = waypoints[(idx - 4 + n) % n];
  const next = waypoints[(idx + 4) % n];
  return next.clone().sub(prev).normalize();
}

function samplePathPosition(waypoints: THREE.Vector3[], fromIdx: number, pathLength: number, t: number): THREE.Vector3 {
  const n = waypoints.length;
  const floatIdx = t * pathLength;
  const i0 = Math.min(Math.floor(floatIdx), pathLength);
  const i1 = Math.min(i0 + 1, pathLength);
  const frac = floatIdx - i0;

  const wp0 = waypoints[(fromIdx + i0) % n];
  const wp1 = waypoints[(fromIdx + i1) % n];
  return wp0.clone().lerp(wp1, frac);
}

function findSharpTurnIndices(waypoints: THREE.Vector3[], count: number, minGap = 22): number[] {
  const n = waypoints.length;
  const scores: { idx: number; angle: number }[] = [];

  for (let i = 0; i < n; i++) {
    const a = waypoints[(i - 10 + n) % n];
    const b = waypoints[i];
    const c = waypoints[(i + 10) % n];
    const v1 = b.clone().sub(a);
    const v2 = c.clone().sub(b);
    if (v1.lengthSq() < 0.01 || v2.lengthSq() < 0.01) continue;
    v1.normalize();
    v2.normalize();
    const angle = Math.acos(THREE.MathUtils.clamp(v1.dot(v2), -1, 1));
    scores.push({ idx: i, angle });
  }

  scores.sort((a, b) => b.angle - a.angle);
  const picked: number[] = [];

  for (const s of scores) {
    if (picked.length >= count) break;
    const tooClose = picked.some((idx) => {
      const diff = Math.abs(idx - s.idx);
      return Math.min(diff, n - diff) < minGap;
    });
    if (!tooClose) picked.push(s.idx);
  }

  return picked;
}

function buildStartLinePathShot(waypoints: THREE.Vector3[], startPos: THREE.Vector3): PathShot {
  const n = waypoints.length;
  const startIdx = findClosestWaypointIndex(waypoints, startPos);
  const approach = 20;
  const exit = 30;

  return {
    kind: 'path',
    fromIdx: (startIdx - approach + n) % n,
    pathLength: approach + exit,
    duration: 9.0,
  };
}

function buildTurnShot(waypoints: THREE.Vector3[], idx: number): StaticShot {
  const n = waypoints.length;
  const a = waypoints[(idx - 10 + n) % n];
  const b = waypoints[idx];

  const v1 = b.clone().sub(a).normalize();
  const target = b.clone();
  target.y += 1.2;

  // Tempatkan kamera di atas aspal track (centerline) setinggi 5.5m
  // dan berjarak 18m di belakang tikungan agar tidak terhalang atau menembus dinding/objek sirkuit
  const camPos = target.clone()
    .add(v1.clone().negate().multiplyScalar(18))
    .add(new THREE.Vector3(0, 5.5, 0));

  return { kind: 'static', camPos, lookAt: target, holdDuration: 4.0 };
}

function shotDuration(shot: CinematicShot): number {
  return shot.kind === 'path' ? shot.duration : shot.holdDuration;
}

export class MenuCinematic {
  private waypoints: THREE.Vector3[] = [];
  private shots: CinematicShot[] = [];
  private time = 0;
  private shotIndex = 0;
  private readonly transitionDuration = 2.5;
  private readonly tempPos = new THREE.Vector3();
  private readonly tempLook = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  build(waypoints: THREE.Vector3[], startPos: THREE.Vector3) {
    this.waypoints = waypoints;
    this.shots = [buildStartLinePathShot(waypoints, startPos)];
    const sharpTurns = findSharpTurnIndices(waypoints, 4);
    for (const idx of sharpTurns) {
      this.shots.push(buildTurnShot(waypoints, idx));
    }
    this.time = 0;
    this.shotIndex = 0;
  }

  private updatePathShot(shot: PathShot, t: number) {
    const n = this.waypoints.length;
    const smooth = t * t * (3 - 2 * t);
    const trackPos = samplePathPosition(this.waypoints, shot.fromIdx, shot.pathLength, smooth);
    
    // Hitung index mengapung (floating index) untuk interpolasi tangent yang kontinyu
    const floatIdx = smooth * shot.pathLength;
    const i0 = Math.floor(floatIdx);
    const i1 = i0 + 1;
    const frac = floatIdx - i0;

    const wpIdx0 = (shot.fromIdx + i0) % n;
    const wpIdx1 = (shot.fromIdx + i1) % n;

    const tangent0 = getWaypointTangent(this.waypoints, wpIdx0);
    const tangent1 = getWaypointTangent(this.waypoints, wpIdx1);
    const tangent = tangent0.clone().lerp(tangent1, frac).normalize();
    const right = new THREE.Vector3().crossVectors(tangent, this.up).normalize();

    trackPos.y += 2.0;

    // Kamera di belakang & sedikit ke samping, mengikuti arah jalan
    this.tempPos.copy(trackPos)
      .add(tangent.clone().multiplyScalar(-14))
      .add(right.clone().multiplyScalar(6))
      .add(new THREE.Vector3(0, 9, 0));

    // Tatapan ke depan sepanjang jalan
    this.tempLook.copy(trackPos)
      .add(tangent.clone().multiplyScalar(22))
      .add(new THREE.Vector3(0, 1.2, 0));
  }

  update(dt: number, elapsed: number, camera: THREE.PerspectiveCamera) {
    if (this.shots.length === 0 || this.waypoints.length === 0) return;

    this.time += dt;
    let current = this.shots[this.shotIndex];
    const cycleDuration = shotDuration(current) + this.transitionDuration;

    if (this.time >= cycleDuration) {
      this.time -= cycleDuration;
      this.shotIndex = (this.shotIndex + 1) % this.shots.length;
      current = this.shots[this.shotIndex];
    }

    const next = this.shots[(this.shotIndex + 1) % this.shots.length];
    const holdEnd = shotDuration(current);

    if (this.time < holdEnd) {
      if (current.kind === 'path') {
        this.updatePathShot(current, this.time / current.duration);
      } else {
        this.tempPos.copy(current.camPos);
        this.tempLook.copy(current.lookAt);
      }
    } else {
      const t = (this.time - holdEnd) / this.transitionDuration;
      const smooth = t * t * (3 - 2 * t);

      if (current.kind === 'path') {
        this.updatePathShot(current, 1);
      } else {
        this.tempPos.copy(current.camPos);
        this.tempLook.copy(current.lookAt);
      }

      const endPos = this.tempPos.clone();
      const endLook = this.tempLook.clone();

      if (next.kind === 'path') {
        this.updatePathShot(next, 0);
      } else {
        this.tempPos.copy(next.camPos);
        this.tempLook.copy(next.lookAt);
      }

      endPos.lerp(this.tempPos, smooth);
      endLook.lerp(this.tempLook, smooth);
      this.tempPos.copy(endPos);
      this.tempLook.copy(endLook);
    }

    // Hitung swayFactor yang diinterpolasi dengan mulus (1.0 untuk static, 0.0 untuk path)
    let swayFactor = 0;
    if (this.time < holdEnd) {
      swayFactor = current.kind === 'static' ? 1.0 : 0.0;
    } else {
      const t = (this.time - holdEnd) / this.transitionDuration;
      const smooth = t * t * (3 - 2 * t);
      const startSway = current.kind === 'static' ? 1.0 : 0.0;
      const endSway = next.kind === 'static' ? 1.0 : 0.0;
      swayFactor = THREE.MathUtils.lerp(startSway, endSway, smooth);
    }

    // Terapkan sway secara kontinu berdasarkan swayFactor
    if (swayFactor > 0) {
      const swayX = Math.sin(elapsed * 0.45) * 0.4 * swayFactor;
      const swayY = Math.sin(elapsed * 0.7) * 0.15 * swayFactor;
      this.tempPos.add(new THREE.Vector3(swayX, swayY, swayX * 0.4));
    }

    camera.position.copy(this.tempPos);
    camera.lookAt(this.tempLook);
  }
}
