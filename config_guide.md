# Panduan Konfigurasi Game (Capybara Racing)

Dokumen ini menjelaskan cara menyesuaikan parameter permainan seperti **Kecepatan Kart**, **Sensitivitas Kemudi (Handling)**, **Kamera Pengikut (Third-Person Camera)**, dan **Sensitivitas Virtual Joystick** untuk pengembang.

---

## 1. Mengatur Kecepatan Kart (Speed Settings)

Seluruh konfigurasi kecepatan kart diatur di dalam file [Vehicle.ts](file:///f:/Hackathon/capy-racing-3d/src/core/Vehicle.ts).

### Parameter Utama Kecepatan:
*   **Kecepatan Maksimal Normal (`MAX_SPEED`):**
    *   **Lokasi:** Baris 24 di `Vehicle.ts`
    *   **Variabel:** `export const MAX_SPEED = 2.2;`
    *   **Penjelasan:** Kecepatan batas maksimum kart saat berjalan maju secara normal. Naikkan nilai ini (misal ke `3.0`) jika ingin balapan terasa lebih cepat secara keseluruhan.
*   **Kecepatan Maksimal Boost (`BOOST_SPEED`):**
    *   **Lokasi:** Baris 25 di `Vehicle.ts`
    *   **Variabel:** `export const BOOST_SPEED = 3.5;`
    *   **Penjelasan:** Kecepatan batas maksimum kart ketika mengenai panel penambah kecepatan (Boost Pad).
*   **Hambatan Kecepatan Linier (`LINEAR_DAMP`):**
    *   **Lokasi:** Baris 23 di `Vehicle.ts`
    *   **Variabel:** `const LINEAR_DAMP = 0.1;`
    *   **Penjelasan:** Nilai gesekan udara yang mereduksi kecepatan kart secara pasif saat tidak menekan tombol gas. Nilai lebih tinggi membuat kart berhenti lebih cepat saat melepas gas.
*   **Gravitasi Dunia:**
    *   **Lokasi:** Baris 37 di [world.ts](file:///f:/Hackathon/capy-racing-3d/src/physics/world.ts)
    *   **Variabel:** `worldSettings.gravity = [0, -25.0, 0];`
    *   **Penjelasan:** Gravitasi fisik kart. Nilai `-25.0` disetel lebih tinggi dari gravitasi bumi (`-9.8`) agar kart tetap menapak kuat di aspal saat melaju kencang dan tidak melayang di tikungan/tanjakan.

---

## 2. Mengatur Sensitivitas Kemudi (Handling & Steering)

Handling kemudi dipengaruhi oleh input di [Controls.ts](file:///f:/Hackathon/capy-racing-3d/src/core/Controls.ts) dan perhitungannya di [Vehicle.ts](file:///f:/Hackathon/capy-racing-3d/src/core/Vehicle.ts).

### Parameter Utama Kemudi:
*   **Sensitivitas Belok (Steering Speed Factor):**
    *   **Lokasi:** Baris 186 di `Vehicle.ts`
    *   **Variabel:** `const targetAngular = -inputX * steeringGrip * 3.8 * direction;`
    *   **Penjelasan:** Angka `3.8` adalah pengali kecepatan belok angular. Naikkan nilai ini (misal ke `5.0`) untuk membuat setir berbelok lebih tajam dan sensitif. Turunkan (misal ke `2.5`) agar kendali terasa lebih stabil.
*   **Respon Kecepatan Setir (Steering Lerp Rate):**
    *   **Lokasi:** Baris 188 di `Vehicle.ts`
    *   **Variabel:** `this.angularSpeed = THREE.MathUtils.lerp(this.angularSpeed, targetAngular, dt * 4.5);`
    *   **Penjelasan:** Nilai `4.5` mengontrol kecepatan transisi interpolasi kemudi dari lurus ke belok penuh. Nilai lebih besar (misal `8.0`) membuat setir terasa sangat responsif dan instan, sedangkan nilai lebih kecil (misal `2.0`) membuat setir terasa berat/lambat.
*   **Hambatan Angular/Rotasi Kart (`angularDamping`):**
    *   **Lokasi:** Baris 70 di [world.ts](file:///f:/Hackathon/capy-racing-3d/src/physics/world.ts)
    *   **Variabel:** `angularDamping: 3.5`
    *   **Penjelasan:** Mencegah kart berputar secara liar (spinning out). Jika kart terasa terlalu mudah melintir saat menabrak dinding, naikkan nilai damping ini.

---

## 3. Mengatur Kamera Pengikut (Follow Camera Settings)

Sistem kamera pengikut (Third-Person Follow Camera) diatur di dalam file [Camera.ts](file:///f:/Hackathon/capy-racing-3d/src/core/Camera.ts).

### Parameter Utama Kamera:
*   **Jarak di Belakang Kart (`followDistance`):**
    *   **Lokasi:** Baris 15 di `Camera.ts`
    *   **Variabel:** `private followDistance = 7.0;`
    *   **Penjelasan:** Jarak horizontal default dari kamera ke bagian belakang kart.
*   **Ketinggian Kamera (`followHeight`):**
    *   **Lokasi:** Baris 16 di `Camera.ts`
    *   **Variabel:** `private followHeight = 2.8;`
    *   **Penjelasan:** Jarak vertikal default kamera di atas posisi kart.
*   **Tinggi Fokus Pandangan (`lookHeight`):**
    *   **Lokasi:** Baris 17 di `Camera.ts`
    *   **Variabel:** `private lookHeight = 1.0;`
    *   **Penjelasan:** Mengatur titik fokus tinggi yang ditatap kamera. Nilai lebih tinggi membuat kamera menatap lebih ke atas.
*   **Kelenturan Kamera (`cameraSmoothing`):**
    *   **Lokasi:** Baris 18 di `Camera.ts`
    *   **Variabel:** `private cameraSmoothing = 5.0;`
    *   **Penjelasan:** Mengatur kelembutan kamera saat mengikuti gerakan kart. Nilai lebih kecil (misal `2.0`) membuat kamera terasa memiliki efek pegas lambat yang lentur (lagging behind), sementara nilai besar (misal `15.0`) membuat kamera mengikuti kart secara sangat kaku dan instan.
*   **Efek Zoom Tarikan Kecepatan (Dynamic FOV/Zoom Effect):**
    *   **Lokasi:** Baris 49-51 di `Camera.ts`
    *   **Variabel:**
        ```typescript
        const speedRatio = THREE.MathUtils.clamp(Math.abs(speed) / 2.5, 0, 1);
        const dynamicDistance = this.followDistance + speedRatio * 1.5;
        const dynamicHeight = this.followHeight + speedRatio * 0.3;
        ```
    *   **Penjelasan:** Mengatur seberapa jauh kamera menjauh (zooming out) secara dinamis saat kart melaju cepat atau menggunakan boost. Ubah angka `1.5` (jarak menjauh) dan `0.3` (tinggi naik) untuk menyesuaikan efek dramatis kecepatan.

---

## 4. Mengatur Kontrol Sentuh (Touch / Mobile Joystick)

Virtual Joystick untuk pengguna perangkat mobile diatur di dalam file [Controls.ts](file:///f:/Hackathon/capy-racing-3d/src/core/Controls.ts).

### Parameter Utama:
*   **Radius Batas Gerakan Joystick (`steerRange`):**
    *   **Lokasi:** Baris 101 di `Controls.ts`
    *   **Variabel:** `const steerRange = 40;`
    *   **Penjelasan:** Mengatur radius tarikan knob joystick dalam piksel. Nilai lebih kecil membuat respons joystick terasa lebih sensitif karena jarak tarik yang pendek.
*   **Sudut Rotasi Arah Joystick:**
    *   **Lokasi:** Baris 193-194 di `Controls.ts`
    *   **Variabel:**
        ```typescript
        x = (jx + jy) * Math.SQRT1_2 / mag;
        z = (-jx + jy) * Math.SQRT1_2 / mag;
        ```
    *   **Penjelasan:** Kode ini merotasi input joystick sebesar 45 derajat agar selaras dengan sudut pandang kamera 3D yang serong (isometric view), sehingga menggeser joystick ke arah atas visual layar akan menggerakkan kart maju serong ke depan sesuai perspektif kamera.

---

## 5. Sinkronisasi dan Visualisasi Waypoint Sirkuit (Circuit Waypoints Alignment)

Waypoint (titik bantu jalan) digunakan oleh bot AI untuk navigasi di sepanjang trek. Posisi waypoint asli dihitung secara relatif terhadap lintasan, namun jika model visual trek (GLTF) bergeser saat diekspor dari Blender, waypoint ini harus disinkronkan secara manual.

### A. Mengatur Pergeseran Waypoint (Waypoint Shift)
Seluruh kalkulasi pergeseran waypoint diatur dalam file [main.ts](file:///f:/Hackathon/capy-racing-3d/src/main.ts).

*   **Pengaturan Pergeseran (Shift Offset):**
    *   **Lokasi:** Baris 695-699 di `main.ts`
    *   **Variabel:**
        ```typescript
        const shift = new THREE.Vector3(
          new_x_center - 0.15 - 25.0, // Menggeser mundur 25 meter di sumbu X agar sinkron dengan jalan
          0,
          new_z_center - (-48.15)
        );
        ```
    *   **Penjelasan:**
        *   `new_x_center - 0.15 - 25.0`: Menggeser waypoint sepanjang sumbu longitudinal (X). Nilai `-25.0` digunakan untuk menggeser waypoint mundur sejauh 25 meter agar sejajar dengan posisi garis start yang baru. Jika posisi waypoint kurang mundur, ubah nilainya menjadi lebih negatif (misal `-30.0`). Jika terlalu mundur (kurang maju), kurangi nilainya (misal `-20.0`).
        *   `new_z_center - (-48.15)`: Menggeser posisi lateral (Z) waypoint agar pas berada di tengah-tengah jalan raya secara horizontal.

### B. Menampilkan/Menyembunyikan Titik Visualisasi Waypoint
Untuk mempermudah penyelarasan waypoint dengan lintasan visual di layar browser, Anda dapat mengaktifkan titik visualisasi berwarna merah di game.

*   **Kode Visualisasi:**
    *   **Lokasi:** Baris 706-710 di `main.ts`
    *   **Kode:**
        ```typescript
        // Visualisasi waypoints (Garis titik merah)
        const pointsGeo = new THREE.BufferGeometry().setFromPoints(trackData.waypoints);
        const pointsMat = new THREE.PointsMaterial({ color: 0xff0000, size: 0.8 });
        const pointsObj = new THREE.Points(pointsGeo, pointsMat);
        scene.add(pointsObj);
        ```
    *   **Penjelasan:** Secara bawaan, kode ini memunculkan bulatan merah (`THREE.Points`) pada setiap koordinat waypoint di layar.
        *   **Untuk mematikan/menyembunyikan titik merah di produksi (release):** Silakan beri komentar (`//`) atau hapus baris `scene.add(pointsObj);` di file `main.ts`.

Kalau bot masih menabrak wall di tikungan paling tajam setelah ini, ada dua parameter utama yang bisa kamu tuning langsung di 

main.ts baris 472-487
:

typescript
// Kurangi angka ini agar bot mulai melambat LEBIH AWAL sebelum tikungan
const turnLoad = Math.max(curvatureAngle * 1.2, Math.abs(angle));
if (turnLoad > 1.2) {
  gas = 0.2;   // ← Tikungan sangat tajam, turunkan jika masih terlalu cepat (misal: 0.15)
} else if (turnLoad > 0.7) {
  gas = 0.35;  // ← Tikungan tajam
} ...