/**
 * src/core/Vehicle.ts
 *
 * Mengelola logika pergerakan kart, sinkronisasi dengan bodi dinamis (bola) Crashcat,
 * animasi skeletal Capybara (AnimationMixer), efek oleng kemudi, dan reset posisi jika keluar trek.
 */

import * as THREE from 'three';
import { rigidBody } from 'crashcat';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { InputState } from './Controls.ts';

const _tmpVec = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _zAxis = new THREE.Vector3();
const _newZ = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

// Parameter kecepatan & handling
const LINEAR_DAMP = 0.1;
export const MAX_SPEED = 1; // Naikkan sedikit agar terasa lebih cepat
export const BOOST_SPEED = 1.8;

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

export class Vehicle {
  public linearSpeed = 0;
  public angularSpeed = 0;
  public acceleration = 0;

  public startPosition = new THREE.Vector3(-0.03, 1.2, -45.67);
  public spherePos = new THREE.Vector3(0, 0.5, 0);
  public sphereVel = new THREE.Vector3();

  public rigidBody: any = null;
  public physicsWorld: any = null;

  public modelVelocity = new THREE.Vector3();
  private prevModelPos = new THREE.Vector3();

  public container = new THREE.Group();
  private bodyNode: THREE.Object3D | null = null;
  private wheels: THREE.Object3D[] = [];
  public wheelBL: THREE.Object3D | null = null;
  public wheelBR: THREE.Object3D | null = null;
  public onReset: (() => void) | null = null;

  // Animation Mixer untuk Capybara
  private mixer: THREE.AnimationMixer | null = null;
  private driveAction: THREE.AnimationAction | null = null;

  public driftIntensity = 0;
  public closestWaypointIdx = 0;
  public prevWaypointIdx = 0;
  public currentLap = 1;
  public isFinished = false;
  public finishTime = 0;
  private boostTimer = 0;
  public isBoosting = false;

  constructor() {
    this.container.name = 'player_kart';
  }

  public init(gltf: any): THREE.Group {
    // Clone using SkeletonUtils to preserve bone bindings for animations
    const vehicleModel = SkeletonUtils.clone(gltf.scene);

    // Scale model Capybara agar ukurannya pas di trek (lebar jalan ~4.4)
    // Scale 0.9 is perfect for 1.1 width kart on 4.4 width road
    vehicleModel.scale.setScalar(0.9);
    this.container.add(vehicleModel);

    // Siapkan Animation Mixer jika model memiliki animasi
    if (gltf.animations && gltf.animations.length > 0) {
      this.mixer = new THREE.AnimationMixer(vehicleModel);

      // Pilih animasi default "anim_0" yang merupakan loop idle/drive stabil
      const animClip = gltf.animations.find((a: any) => a.name === 'anim_0') || gltf.animations[0];
      this.driveAction = this.mixer.clipAction(animClip);
      this.driveAction.play();
    }

    // Group body parts so they lean together, excluding wheels/tires
    let capyAndKartNode: any = null;
    vehicleModel.traverse((child: any) => {
      if (child.name === 'capy_and_kart') {
        capyAndKartNode = child;
      }
    });

    if (capyAndKartNode) {
      const bodyGroup = new THREE.Group();
      bodyGroup.name = 'kart_body_group';
      capyAndKartNode.add(bodyGroup);

      const toMove: THREE.Object3D[] = [];
      capyAndKartNode.children.forEach((child: any) => {
        if (child === bodyGroup) return;

        const name = child.name.toLowerCase();
        const isWheel = name.includes('wheel') || name.includes('tire');

        if (!isWheel) {
          toMove.push(child);
        } else {
          child.rotation.order = 'YXZ';
          this.wheels.push(child);
        }
      });

      toMove.forEach(child => {
        bodyGroup.add(child);
      });

      this.bodyNode = bodyGroup;
    } else {
      // Fallback jika capy_and_kart tidak ditemukan
      vehicleModel.traverse((child: any) => {
        const name = child.name.toLowerCase();

        if (name.includes('body') || name.includes('chassis')) {
          child.rotation.order = 'YXZ';
          this.bodyNode = child;
        } else if (name.includes('wheel') || name.includes('tire')) {
          child.rotation.order = 'YXZ';
          this.wheels.push(child);
        }
      });
    }

    // Apply shadow and material roughness properties
    vehicleModel.traverse((child: any) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          child.material.roughness = 0.8;
          child.material.metalness = 0.1;
        }
      }
    });

    // Identify rear wheels BL and BR from the collected wheels
    for (const wheel of this.wheels) {
      if (wheel.position.z < 0) {
        if (wheel.position.x < 0) {
          this.wheelBL = wheel;
        } else {
          this.wheelBR = wheel;
        }
      }
    }
    console.log("DEBUG WHEELS COLLECTED:", this.wheels.map(w => ({ name: w.name, pos: w.position.clone() })));
    console.log("DEBUG WHEEL BL:", this.wheelBL ? { name: this.wheelBL.name, pos: this.wheelBL.position } : "null");
    console.log("DEBUG WHEEL BR:", this.wheelBR ? { name: this.wheelBR.name, pos: this.wheelBR.position } : "null");

    return this.container;
  }

  /**
   * Menetapkan tekstur kustom untuk kostum capy dan bodi kart pembalap ini
   */
  public setCustomTextures(suitUrl: string, kartUrl: string) {
    const loader = new THREE.TextureLoader();

    const suitTexture = loader.load(suitUrl);
    suitTexture.colorSpace = THREE.SRGBColorSpace;
    suitTexture.flipY = false;

    const kartTexture = loader.load(kartUrl);
    kartTexture.colorSpace = THREE.SRGBColorSpace;
    kartTexture.flipY = false;

    const tireTexture = loader.load('/tire.png');
    tireTexture.colorSpace = THREE.SRGBColorSpace;
    tireTexture.flipY = false;

    this.container.traverse((child: any) => {
      if (child.isMesh && child.material) {
        // Check if this mesh belongs to a wheel or tire
        let isTire = false;
        let p = child;
        while (p && p !== this.container) {
          const pName = p.name.toLowerCase();
          if (pName.includes('wheel') || pName.includes('tire')) {
            isTire = true;
            break;
          }
          p = p.parent;
        }

        if (child.name === 'node_41') {
          child.material = child.material.clone();
          child.material.map = suitTexture;
          child.material.needsUpdate = true;
        } else if (isTire) {
          if (child.material.map) {
            child.material = child.material.clone();
            child.material.map = tireTexture;
            child.material.needsUpdate = true;
          }
        } else if (child.material.map) {
          child.material = child.material.clone();
          child.material.map = kartTexture;
          child.material.needsUpdate = true;
        }
      }
    });
  }

  /**
   * Memicu boost pad (kecepatan bertambah sangat cepat selama beberapa detik)
   */
  public triggerBoost(durationSeconds = 2.0) {
    this.boostTimer = durationSeconds;
    this.isBoosting = true;
  }

  public update(dt: number, controlsInput: InputState) {
    // 1. Tangani Boost Timer
    if (this.boostTimer > 0) {
      this.boostTimer -= dt;
      if (this.boostTimer <= 0) {
        this.isBoosting = false;
      }
    }

    const currentMaxSpeed = this.isBoosting ? BOOST_SPEED : MAX_SPEED;

    // 2. Olah input kemudi & gas
    let inputX = controlsInput.x;
    let inputZ = controlsInput.z;

    if (controlsInput.touchActive && (inputX !== 0 || inputZ !== 0)) {
      // Input Sentuh: Joystick menentukan arah hadap di ruang dunia
      const targetAngle = Math.atan2(inputX, inputZ);
      _quat.setFromAxisAngle(_up, targetAngle);
      this.container.quaternion.slerp(_quat, 1 - Math.exp(-3.5 * dt));

      _forward.set(0, 0, 1).applyQuaternion(this.container.quaternion);
      const cross = _forward.x * inputZ - _forward.z * inputX;
      inputX = THREE.MathUtils.clamp(-cross * 2.0, -1, 1);

      this.linearSpeed = THREE.MathUtils.lerp(this.linearSpeed, currentMaxSpeed, dt * 2.0);
    } else {
      // Input Keyboard: Standar WASD/Panah
      let direction = Math.sign(this.linearSpeed);
      if (direction === 0) direction = Math.abs(inputZ) > 0.1 ? Math.sign(inputZ) : 1;

      const steeringGrip = THREE.MathUtils.clamp(Math.abs(this.linearSpeed), 0.3, 1.2);
      const targetAngular = -inputX * steeringGrip * 2.8 * direction;

      this.angularSpeed = THREE.MathUtils.lerp(this.angularSpeed, targetAngular, dt * 4.5);
      this.container.rotateY(this.angularSpeed * dt);

      const targetSpeed = inputZ;

      if (targetSpeed < 0 && this.linearSpeed > 0.01) {
        // Rem/Mundur cepat
        this.linearSpeed = THREE.MathUtils.lerp(this.linearSpeed, 0.0, dt * 9.0);
      } else if (targetSpeed < 0) {
        this.linearSpeed = THREE.MathUtils.lerp(this.linearSpeed, targetSpeed / 2.0, dt * 2.5);
      } else {
        this.linearSpeed = THREE.MathUtils.lerp(this.linearSpeed, targetSpeed * currentMaxSpeed, dt * 1.8);
      }
    }

    // Alignment hadap agar kart selalu rata dengan permukaan normal tanah
    _tmpVec.set(0, 1, 0).applyQuaternion(this.container.quaternion);
    if (_tmpVec.y > 0.5) {
      const targetQuat = this.alignWithY(this.container.quaternion, _up);
      this.container.quaternion.slerp(targetQuat, 0.25);
    }

    this.linearSpeed *= Math.max(0, 1 - LINEAR_DAMP * dt);

    // 3. Aplikasikan ke RigidBody Crashcat
    if (this.rigidBody) {
      _forward.set(0, 0, 1).applyQuaternion(this.container.quaternion);
      _forward.y = 0;
      _forward.normalize();

      _right.set(1, 0, 0).applyQuaternion(this.container.quaternion);
      _right.y = 0;
      _right.normalize();

      const angvel = this.rigidBody.motionProperties.angularVelocity;
      const drive = this.linearSpeed * 110 * dt;

      // Berikan impulse rotasi roda untuk menggerakkan bola fisika
      rigidBody.setAngularVelocity(this.physicsWorld, this.rigidBody, [
        angvel[0] + _right.x * drive,
        angvel[1],
        angvel[2] + _right.z * drive
      ]);

      const pos = this.rigidBody.position;
      this.spherePos.set(pos[0], pos[1], pos[2]);

      const vel = this.rigidBody.motionProperties.linearVelocity;
      this.sphereVel.set(vel[0], vel[1], vel[2]);
    }

    this.acceleration = THREE.MathUtils.lerp(
      this.acceleration,
      this.linearSpeed + (0.2 * this.linearSpeed * Math.abs(this.linearSpeed)),
      dt
    );

    // 4. Tangani jika jatuh dari batas bawah sirkuit (out of bounds)
    if (this.spherePos.y < -10) {
      this.resetPosition();
    }

    // Setel posisi visual kontainer kart agar presisi dengan bola fisika
    this.container.position.set(
      this.spherePos.x,
      this.spherePos.y - 0.65, // Offset Y agar menapak dengan permukaan jalan
      this.spherePos.z
    );

    if (dt > 0) {
      this.modelVelocity.subVectors(this.container.position, this.prevModelPos).divideScalar(dt);
      this.prevModelPos.copy(this.container.position);
    }

    // 5. Animasi & Oleng visual bodi
    this.updateBodyLean(dt, inputX);
    this.updateWheelsRotation();

    // Jalankan mixer animasi Capybara
    if (this.mixer) {
      // Kecepatan animasi disesuaikan dengan kecepatan gerak kart
      const animSpeed = THREE.MathUtils.clamp(Math.abs(this.linearSpeed) * 1.5, 0.4, 3.0);
      this.mixer.update(dt * animSpeed);
    }

    // Hitung intensitas gesekan/drift ban untuk memicu partikel asap
    this.driftIntensity = Math.abs(this.linearSpeed - this.acceleration) +
      (this.bodyNode ? Math.abs(this.bodyNode.rotation.z) * 1.8 : 0);
  }

  /**
   * Mereset posisi kart ke start line
   */
  public resetPosition() {
    if (this.rigidBody) {
      rigidBody.setPosition(this.physicsWorld, this.rigidBody, [this.startPosition.x, this.startPosition.y, this.startPosition.z], false);
      rigidBody.setLinearVelocity(this.physicsWorld, this.rigidBody, [0, 0, 0]);
      rigidBody.setAngularVelocity(this.physicsWorld, this.rigidBody, [0, 0, 0]);
    }

    this.spherePos.copy(this.startPosition);
    this.sphereVel.set(0, 0, 0);
    this.linearSpeed = 0;
    this.angularSpeed = 0;
    this.acceleration = 0;
    // Set rotasi awal agar menghadap ke arah waypoint selanjutnya (+X, Timur)
    this.container.rotation.set(0, Math.PI / 2, 0);
    this.container.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    this.prevModelPos.copy(this.container.position);
    this.isBoosting = false;
    this.boostTimer = 0;
    this.closestWaypointIdx = 0;
    this.prevWaypointIdx = 0;
    this.currentLap = 1;
    this.isFinished = false;
    this.finishTime = 0;
    if (this.onReset) {
      this.onReset();
    }
  }

  private alignWithY(quaternion: THREE.Quaternion, newY: THREE.Vector3): THREE.Quaternion {
    _zAxis.set(0, 0, 1).applyQuaternion(quaternion);
    const xAxis = _tmpVec.crossVectors(_zAxis, newY).negate().normalize();
    _newZ.crossVectors(xAxis, newY).normalize();

    _mat4.makeBasis(xAxis, newY, _newZ);
    return _quat.setFromRotationMatrix(_mat4);
  }

  /**
   * Membuat bodi mobil oleng secara dinamis saat menikung tajam
   */
  private updateBodyLean(dt: number, inputX: number) {
    if (!this.bodyNode) return;

    // Oleng depan-belakang saat akselerasi/rem
    this.bodyNode.rotation.x = lerpAngle(
      this.bodyNode.rotation.x,
      -(this.linearSpeed - this.acceleration) / 5.0,
      dt * 10
    );

    // Oleng kiri-kanan saat berbelok tajam (sentrifugal)
    this.bodyNode.rotation.z = lerpAngle(
      this.bodyNode.rotation.z,
      -(inputX / 4.8) * Math.abs(this.linearSpeed),
      dt * 6
    );

    this.bodyNode.position.y = THREE.MathUtils.lerp(this.bodyNode.position.y, 0.1, dt * 5);
  }

  /**
   * Memutar roda-roda visual secara prosedural jika terdeteksi
   */
  private updateWheelsRotation() {
    for (const wheel of this.wheels) {
      // Putar maju/mundur sesuai akselerasi roda
      wheel.rotation.x += this.acceleration * 1.5;
    }
  }
}
