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

  private orbitYaw = 0;
  private orbitPitch = 0;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    // Posisi awal kamera
    this.camera.position.set(0, 10, 15);
    this.camera.lookAt(0, 0, 0);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });

    // Event listener untuk memutar kamera menggunakan drag/pointer
    let isDragging = false;
    let previousPointerX = 0;
    let previousPointerY = 0;

    window.addEventListener('pointerdown', (e) => {
      // Hanya mulai menyeret jika targetnya adalah canvas utama
      if ((e.target as HTMLElement).tagName?.toLowerCase() !== 'canvas') return;
      isDragging = true;
      previousPointerX = e.clientX;
      previousPointerY = e.clientY;
    });

    window.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      
      const dx = e.clientX - previousPointerX;
      const dy = e.clientY - previousPointerY;
      
      // Sensitivitas rotasi kemudi kamera
      this.orbitYaw -= dx * 0.005;
      this.orbitPitch += dy * 0.005;
      
      // Batasi pitch rotasi vertikal (tidak bisa terbalik/melewati bawah tanah)
      this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch, -Math.PI / 4, Math.PI / 3);
      
      previousPointerX = e.clientX;
      previousPointerY = e.clientY;
    });

    const stopDragging = () => {
      isDragging = false;
    };
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
  }

  /**
   * Memperbarui posisi kamera di belakang kendaraan
   * @param dt Delta time
   * @param target Posisi bodi kart (spherePos)
   * @param quaternion Rotasi hadap visual kart
   * @param speed Kecepatan linier kart
   * @param isAccelerating Apakah pemain sedang menekan gas
   */
  public update(dt: number, target: THREE.Vector3, quaternion: THREE.Quaternion, speed: number, isAccelerating: boolean) {
    // 1. Dapatkan arah hadap depan kart (diproyeksikan ke bidang XZ)
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
    forward.y = 0;
    forward.normalize();

    // 2. Kembalikan kamera ke posisi default jika kendaraan digas
    if (isAccelerating) {
      this.orbitYaw = THREE.MathUtils.lerp(this.orbitYaw, 0, dt * 4.0);
      this.orbitPitch = THREE.MathUtils.lerp(this.orbitPitch, 0, dt * 4.0);

      if (Math.abs(this.orbitYaw) < 0.001) this.orbitYaw = 0;
      if (Math.abs(this.orbitPitch) < 0.001) this.orbitPitch = 0;
    }

    // 3. Hitung jarak dan tinggi dinamis berdasarkan kecepatan (efek tarikan kamera saat cepat)
    const speedRatio = THREE.MathUtils.clamp(Math.abs(speed) / 2.5, 0, 1);
    const dynamicDistance = this.followDistance + speedRatio * 1.5;
    const dynamicHeight = this.followHeight + speedRatio * 0.3;

    // 4. Hitung posisi lokal kamera relatif terhadap kart dengan rotasi orbit yaw & pitch
    const localPos = new THREE.Vector3(0, dynamicHeight, -dynamicDistance);

    const orbitQuat = new THREE.Quaternion();
    const euler = new THREE.Euler(this.orbitPitch, this.orbitYaw, 0, 'YXZ');
    orbitQuat.setFromEuler(euler);
    localPos.applyQuaternion(orbitQuat);

    // 5. Tentukan posisi kamera ideal di dunia
    const idealPos = new THREE.Vector3().copy(localPos).applyQuaternion(quaternion).add(target);

    // 6. Interpolasi mulus (lerp) posisi kamera agar tidak patah-patah
    const lerpFactor = this.initialized ? 1 - Math.exp(-dt * this.cameraSmoothing) : 1;
    this.camera.position.lerp(idealPos, lerpFactor);
    this.initialized = true;

    // 7. Tentukan titik fokus kamera (sedikit di depan mobil agar jalan di depan terlihat jelas)
    const lookLocal = new THREE.Vector3(0, this.lookHeight, 2.0);
    lookLocal.applyQuaternion(orbitQuat); // Putar arah tatapan mengikuti orbit yaw & pitch
    
    const lookTarget = new THREE.Vector3().copy(lookLocal).applyQuaternion(quaternion).add(target);

    this.camera.lookAt(lookTarget);

    if (Math.random() < 0.02) {
      console.log(`CAMERA_UPDATE: camPos=[${this.camera.position.x.toFixed(2)}, ${this.camera.position.y.toFixed(2)}, ${this.camera.position.z.toFixed(2)}], target=[${target.x.toFixed(2)}, ${target.y.toFixed(2)}, ${target.z.toFixed(2)}], speed=${speed.toFixed(2)}`);
    }
  }
}
