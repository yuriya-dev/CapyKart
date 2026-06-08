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

  // Offset dasar untuk Third-Person Camera (dekatkan ke karakter)
  private followDistance = 3.5; // Jarak di belakang kendaraan (dekatkan 15%)
  private followHeight = 1.35;  // Ketinggian di atas kendaraan (dekatkan 15%)
  private lookHeight = 0.5;     // Ketinggian titik fokus tatapan (dekatkan 15%)
  private cameraSmoothing = 5.0; // Kecepatan lerp mengikuti kart

  private initialized = false;
  private boostDistanceMultiplier = 1.0;

  private orbitYaw = 0;
  private orbitPitch = 0;

  // Animasi orbit otomatis saat countdown mulai
  private introActive = false;
  private introTime = 0;
  private introDuration = 5.0;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    // Posisi awal kamera
    this.camera.position.set(0, 10, 15);
    this.camera.lookAt(0, 0, 0);

    const handleResize = () => {
      setTimeout(() => {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
      }, 100);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

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

      // Hentikan intro jika pemain mulai menyeret kamera secara manual
      if (this.introActive) {
        this.introActive = false;
      }
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
   * Memulai animasi intro kamera memutar (orbit) otomatis.
   * @param duration Durasi animasi dalam detik
   */
  public startIntro(duration = 5.0) {
    this.initialized = false;
    this.introActive = true;
    this.introTime = 0;
    this.introDuration = duration;
    this.orbitYaw = Math.PI * 1.25; // Mulai dari serong depan (225 derajat)
    this.orbitPitch = Math.PI / 10; // Ketinggian sedikit naik (18 derajat)
  }

  /**
   * Mengatur ulang status kamera ke kondisi default.
   */
  public reset() {
    this.initialized = false;
    this.introActive = false;
    this.orbitYaw = 0;
    this.orbitPitch = 0;
  }

  /**
   * Memperbarui posisi kamera di belakang kendaraan
   * @param dt Delta time
   * @param target Posisi bodi kart (spherePos)
   * @param quaternion Rotasi hadap visual kart
   * @param speed Kecepatan linier kart
   * @param isAccelerating Apakah pemain sedang menekan gas
   */
  public update(dt: number, target: THREE.Vector3, quaternion: THREE.Quaternion, speed: number, isAccelerating: boolean, isBoosting = false) {
    // Jalankan auto-orbit intro jika aktif
    if (this.introActive) {
      this.introTime += dt;
      if (this.introTime >= this.introDuration) {
        this.introActive = false;
        this.orbitYaw = 0;
        this.orbitPitch = 0;
      } else {
        const t = this.introTime / this.introDuration;
        // Gunakan easing cubic ease-out
        const ease = 1 - Math.pow(1 - t, 3);
        const startYaw = Math.PI * 1.25;
        const startPitch = Math.PI / 10;
        this.orbitYaw = THREE.MathUtils.lerp(startYaw, 0, ease);
        this.orbitPitch = THREE.MathUtils.lerp(startPitch, 0, ease);
      }
    }

    // 1. Dapatkan arah hadap depan kart (diproyeksikan ke bidang XZ)
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
    forward.y = 0;
    forward.normalize();

    // 2. Kembalikan kamera ke posisi default jika kendaraan digas
    if (isAccelerating) {
      this.introActive = false; // Hentikan intro jika gas ditekan
      this.orbitYaw = THREE.MathUtils.lerp(this.orbitYaw, 0, dt * 4.0);
      this.orbitPitch = THREE.MathUtils.lerp(this.orbitPitch, 0, dt * 4.0);

      if (Math.abs(this.orbitYaw) < 0.001) this.orbitYaw = 0;
      if (Math.abs(this.orbitPitch) < 0.001) this.orbitPitch = 0;
    }

    // Lerp camera FOV: 60 base, 75 when boosting
    const targetFov = isBoosting ? 75 : 60;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, dt * 8.0);
    this.camera.updateProjectionMatrix();

    // 3. Hitung jarak dan tinggi dinamis berdasarkan kecepatan (efek tarikan kamera saat cepat)
    const speedRatio = THREE.MathUtils.clamp(Math.abs(speed) / 2.5, 0, 1);
    let dynamicDistance = this.followDistance + speedRatio * 0.4;
    const dynamicHeight = this.followHeight + speedRatio * 0.1;

    // Lerp dynamic distance multiplier for boosting (moves backward 10%)
    this.boostDistanceMultiplier = THREE.MathUtils.lerp(
      this.boostDistanceMultiplier,
      isBoosting ? 1.1 : 1.0,
      dt * 8.0
    );
    dynamicDistance *= this.boostDistanceMultiplier;

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
