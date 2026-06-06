import * as THREE from 'three';
import { Vehicle } from './Vehicle';

const MAX_SEGMENTS = 4096;
const VERTS_PER_SEGMENT = 6;
const FLOATS_PER_SEGMENT = VERTS_PER_SEGMENT * 3;
const COLOR_FLOATS_PER_SEGMENT = VERTS_PER_SEGMENT * 4;

const WIDTH = 0.12; // Adjusted width for visual presence
const Y_OFFSET = 0.02; // Small offset above ground to avoid z-fighting
const MIN_SEGMENT_LENGTH = 0.02;
const INTENSITY_MIN = 0.3;
const INTENSITY_MAX = 2.0;
const INV_INTENSITY_RANGE = 1 / (INTENSITY_MAX - INTENSITY_MIN);

const _wheelWorld = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _side = new THREE.Vector3();
const _pL = new THREE.Vector3();
const _pR = new THREE.Vector3();
const _cL = new THREE.Vector3();
const _cR = new THREE.Vector3();

class DriftTrail {
  public mesh: THREE.Mesh;
  public positions: Float32Array;
  public colors: Float32Array;
  public geometry: THREE.BufferGeometry;
  public segmentIndex: number = 0;
  public drawCount: number = 0;
  public prev: THREE.Vector3 = new THREE.Vector3();
  public active: boolean = false;
  public dirty: boolean = false;

  constructor(scene: THREE.Scene, material: THREE.Material) {
    const positions = new Float32Array(MAX_SEGMENTS * FLOATS_PER_SEGMENT);
    const colors = new Float32Array(MAX_SEGMENTS * COLOR_FLOATS_PER_SEGMENT);

    // Pre-fill RGB to 1 (white). Vertex colors multiply with material color.
    for (let i = 0; i < MAX_SEGMENTS * VERTS_PER_SEGMENT; i++) {
      const o = i * 4;
      colors[o] = 1;
      colors[o + 1] = 1;
      colors[o + 2] = 1;
    }

    const geometry = new THREE.BufferGeometry();

    const posAttr = new THREE.BufferAttribute(positions, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', posAttr);

    const colorAttr = new THREE.BufferAttribute(colors, 4);
    colorAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('color', colorAttr);

    geometry.setDrawRange(0, 0);

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    scene.add(this.mesh);

    this.positions = positions;
    this.colors = colors;
    this.geometry = geometry;
  }

  public track(wheel: THREE.Object3D | null, groundY: number, intensity: number, emit: boolean) {
    if (!wheel) return;

    wheel.getWorldPosition(_wheelWorld);
    _wheelWorld.y = groundY;

    if (emit && this.active) {
      const alpha = THREE.MathUtils.clamp((intensity - INTENSITY_MIN) * INV_INTENSITY_RANGE, 0, 1);
      this._writeSegment(this.prev, _wheelWorld, alpha, true);
    }

    this.prev.copy(_wheelWorld);
    this.active = emit;
  }

  private _writeSegment(prev: THREE.Vector3, curr: THREE.Vector3, alpha: number, markDirty: boolean) {
    _dir.subVectors(curr, prev);
    _dir.y = 0;
    const len = _dir.length();
    if (len < MIN_SEGMENT_LENGTH) return;
    _dir.divideScalar(len);

    _side.set(_dir.z, 0, -_dir.x).multiplyScalar(WIDTH);

    _pL.copy(prev).add(_side);
    _pR.copy(prev).sub(_side);
    _cL.copy(curr).add(_side);
    _cR.copy(curr).sub(_side);

    const offset = this.segmentIndex * FLOATS_PER_SEGMENT;
    const p = this.positions;

    // Winding CCW from above so DoubleSide isn't strictly required, but used anyway
    p[offset + 0] = _pL.x; p[offset + 1] = _pL.y; p[offset + 2] = _pL.z;
    p[offset + 3] = _pR.x; p[offset + 4] = _pR.y; p[offset + 5] = _pR.z;
    p[offset + 6] = _cL.x; p[offset + 7] = _cL.y; p[offset + 8] = _cL.z;
    p[offset + 9] = _pR.x; p[offset + 10] = _pR.y; p[offset + 11] = _pR.z;
    p[offset + 12] = _cR.x; p[offset + 13] = _cR.y; p[offset + 14] = _cR.z;
    p[offset + 15] = _cL.x; p[offset + 16] = _cL.y; p[offset + 17] = _cL.z;

    const colorOffset = this.segmentIndex * COLOR_FLOATS_PER_SEGMENT;
    const c = this.colors;

    for (let i = 0; i < VERTS_PER_SEGMENT; i++) {
      c[colorOffset + i * 4 + 3] = alpha;
    }

    if (markDirty) {
      const posAttr = this.geometry.attributes.position as THREE.BufferAttribute;
      posAttr.addUpdateRange(offset, FLOATS_PER_SEGMENT);
      posAttr.needsUpdate = true;

      const colAttr = this.geometry.attributes.color as THREE.BufferAttribute;
      colAttr.addUpdateRange(colorOffset, COLOR_FLOATS_PER_SEGMENT);
      colAttr.needsUpdate = true;

      this.dirty = true;
    }

    this.segmentIndex = (this.segmentIndex + 1) % MAX_SEGMENTS;

    if (this.drawCount < MAX_SEGMENTS * VERTS_PER_SEGMENT) {
      this.drawCount += VERTS_PER_SEGMENT;
      this.geometry.setDrawRange(0, this.drawCount);
    }
  }

  public reset() {
    this.segmentIndex = 0;
    this.drawCount = 0;
    this.active = false;
    this.dirty = false;
    this.geometry.setDrawRange(0, 0);
  }
}

export class DriftMarks {
  public trails: DriftTrail[];

  constructor(scene: THREE.Scene) {
    const material = new THREE.MeshBasicMaterial({
      color: 0x111111,
      transparent: true,
      opacity: 0.65, // Opacity is multiplied with vertex alpha
      vertexColors: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });

    this.trails = [
      new DriftTrail(scene, material),
      new DriftTrail(scene, material),
    ];
  }

  public update(vehicle: Vehicle) {
    // Force update of the vehicle's world matrices to get accurate wheel world positions
    vehicle.container.updateMatrixWorld(true);

    // Drifting is active if driftIntensity is high enough and kart is moving fast enough
    const emit = vehicle.driftIntensity > 0.22 && Math.abs(vehicle.linearSpeed) > 0.15;

    if (!emit && !this.trails[0].active && !this.trails[1].active) return;

    const groundY = vehicle.container.position.y + Y_OFFSET;
    const intensity = vehicle.driftIntensity;

    this.trails[0].track(vehicle.wheelBL, groundY, intensity, emit);
    this.trails[1].track(vehicle.wheelBR, groundY, intensity, emit);
  }

  public reset() {
    for (const trail of this.trails) {
      trail.reset();
    }
  }
}
