/**
 * src/core/Camera.ts
 *
 * Mengelola sistem kamera pengikut orang ketiga (Third-Person Follow Camera)
 * yang memposisikan kamera di belakang kart, mengikuti rotasi yaw, serta
 * menyimulasikan efek tarikan/zoom dinamis berdasarkan kecepatan.
 */

import * as THREE from 'three';

export class FollowCamera {
  public camera: THREE.PerspectiveCamera;

  // Offset dasar untuk Third-Person Camera
  private followDistance = 7.0; // Jarak di belakang kendaraan
  private followHeight = 2.8;   // Ketinggian di atas kendaraan
  private lookHeight = 1.0;     // Ketinggian titik fokus tatapan
  private cameraSmoothing = 5.0; // Kecepatan lerp mengikuti kart

  private initialized = false;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    // Posisi awal kamera
    this.camera.position.set(0, 10, 15);
    this.camera.lookAt(0, 0, 0);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });
  }

  /**
   * Memperbarui posisi kamera di belakang kendaraan
   * @param dt Delta time
   * @param target Posisi bodi kart (spherePos)
   * @param quaternion Rotasi hadap visual kart
   * @param speed Kecepatan linier kart
   */
  public update(dt: number, target: THREE.Vector3, quaternion: THREE.Quaternion, speed: number) {
    // 1. Dapatkan arah hadap depan kart (diproyeksikan ke bidang XZ)
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
    forward.y = 0;
    forward.normalize();

    // 2. Hitung jarak dan tinggi dinamis berdasarkan kecepatan (efek tarikan kamera saat cepat)
    const speedRatio = THREE.MathUtils.clamp(Math.abs(speed) / 2.5, 0, 1);
    const dynamicDistance = this.followDistance + speedRatio * 1.5;
    const dynamicHeight = this.followHeight + speedRatio * 0.3;

    // 3. Tentukan posisi kamera ideal di belakang target
    const idealPos = new THREE.Vector3()
      .copy(target)
      .addScaledVector(forward, -dynamicDistance);
    idealPos.y += dynamicHeight;

    // 4. Interpolasi mulus (lerp) posisi kamera agar tidak patah-patah
    const lerpFactor = this.initialized ? 1 - Math.exp(-dt * this.cameraSmoothing) : 1;
    this.camera.position.lerp(idealPos, lerpFactor);
    this.initialized = true;

    // 5. Tentukan titik fokus kamera (sedikit di depan mobil agar jalan di depan terlihat jelas)
    const lookTarget = new THREE.Vector3()
      .copy(target)
      .addScaledVector(forward, 2.0); // tatapan sedikit ke depan mobil
    lookTarget.y += this.lookHeight;

    this.camera.lookAt(lookTarget);

    if (Math.random() < 0.02) {
      console.log(`CAMERA_UPDATE: camPos=[${this.camera.position.x.toFixed(2)}, ${this.camera.position.y.toFixed(2)}, ${this.camera.position.z.toFixed(2)}], target=[${target.x.toFixed(2)}, ${target.y.toFixed(2)}, ${target.z.toFixed(2)}], speed=${speed.toFixed(2)}`);
    }
  }
}
