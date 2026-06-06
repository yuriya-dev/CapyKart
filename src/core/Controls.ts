/**
 * src/core/Controls.ts
 *
 * Menangani input dari Keyboard (WASD / Panah), Gamepad, dan Virtual Joystick di Mobile
 * untuk mengendalikan kemudi (X) dan akselerasi/rem (Z).
 */

export interface InputState {
  x: number;
  z: number;
  touchActive: boolean;
}

export class Controls {
  private keys: { [key: string]: boolean } = {};
  public x = 0;
  public z = 0;
  public touchActive = false;

  // Joystick touch state
  private steerPointerId: number | null = null;
  private steerStartX = 0;
  private steerStartY = 0;
  private touchDirX = 0;
  private touchDirY = 0;

  constructor() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
    });
    
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    this.setupTouchUI();
  }

  private setupTouchUI() {
    if (!('ontouchstart' in window) && !navigator.maxTouchPoints) return;

    // Tambahkan style untuk virtual joystick
    const css = document.createElement('style');
    css.textContent = `
      .touch-controls {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 100;
      }
      .steer-zone {
        position: absolute;
        inset: 0;
        pointer-events: auto;
        touch-action: none;
      }
      .steer-base {
        position: absolute;
        width: 120px;
        height: 120px;
        margin: -60px 0 0 -60px;
        border-radius: 50%;
        background: rgba(20, 241, 149, 0.1); /* Solana Green transparent */
        border: 2px solid rgba(0, 194, 255, 0.3); /* Solana Teal */
        box-shadow: 0 0 15px rgba(0, 194, 255, 0.2);
        display: none;
        backdrop-filter: blur(4px);
      }
      .steer-knob {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 50px;
        height: 50px;
        margin: -25px 0 0 -25px;
        border-radius: 50%;
        background: rgba(153, 69, 255, 0.6); /* Solana Purple */
        border: 1px solid rgba(255, 255, 255, 0.5);
        box-shadow: 0 0 8px rgba(153, 69, 255, 0.8);
      }
    `;
    document.head.appendChild(css);

    const container = document.createElement('div');
    container.className = 'touch-controls';

    const steerZone = document.createElement('div');
    steerZone.className = 'steer-zone';

    const base = document.createElement('div');
    base.className = 'steer-base';
    
    const knob = document.createElement('div');
    knob.className = 'steer-knob';
    
    base.appendChild(knob);
    steerZone.appendChild(base);
    container.appendChild(steerZone);
    document.body.appendChild(container);

    const steerRange = 40;

    steerZone.addEventListener('pointerdown', (e) => {
      // Hanya terima input jika pointer ID kosong
      if (this.steerPointerId !== null) return;
      
      steerZone.setPointerCapture(e.pointerId);
      this.steerPointerId = e.pointerId;
      this.steerStartX = e.clientX;
      this.steerStartY = e.clientY;
      this.touchActive = true;
      this.touchDirX = 0;
      this.touchDirY = 0;
      
      base.style.left = `${e.clientX}px`;
      base.style.top = `${e.clientY}px`;
      base.style.display = 'block';
    });

    steerZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.steerPointerId) return;
      
      let dx = (e.clientX - this.steerStartX) / steerRange;
      let dy = (e.clientY - this.steerStartY) / steerRange;
      const mag = Math.sqrt(dx * dx + dy * dy);

      if (mag > 1) {
        dx /= mag;
        dy /= mag;
      }

      this.touchDirX = dx;
      this.touchDirY = dy;
      
      // Gerakkan knob dalam batas bundaran base (60px radius base)
      knob.style.transform = `translate(${this.touchDirX * 35}px, ${this.touchDirY * 35}px)`;
    });

    const endSteer = (e: PointerEvent) => {
      if (e.pointerId !== this.steerPointerId) return;
      
      this.steerPointerId = null;
      this.touchActive = false;
      this.touchDirX = 0;
      this.touchDirY = 0;
      knob.style.transform = '';
      base.style.display = 'none';
    };

    steerZone.addEventListener('pointerup', endSteer);
    steerZone.addEventListener('pointercancel', endSteer);
  }

  public update(): InputState {
    let x = 0;
    let z = 0;

    // 1. Keyboard Inputs
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) x -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) x += 1;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) z += 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) z -= 1;

    // 2. Gamepad Inputs
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of gamepads) {
      if (!gp) continue;

      // Axis 0 = Left Stick X (Horisontal)
      const stickX = gp.axes[0];
      if (Math.abs(stickX) > 0.15) {
        x = stickX;
      }

      // RT (Accelerate) vs LT (Reverse/Break)
      const rt = gp.buttons[7] ? gp.buttons[7].value : 0;
      const lt = gp.buttons[6] ? gp.buttons[6].value : 0;
      if (rt > 0.1 || lt > 0.1) {
        z = rt - lt;
      }
      break; // Hanya baca gamepad pertama yang aktif
    }

    // 3. Touch Joystick Input (dirotasikan sesuai kamera serong)
    if (this.touchActive) {
      const jx = this.touchDirX;
      const jy = this.touchDirY;
      const mag = Math.sqrt(jx * jx + jy * jy);

      if (mag > 0.15) {
        // Rotasikan arah joystick 45 derajat agar arah atas joystick
        // menggerakkan kart serong kanan-atas (sesuai perspektif kamera serong)
        x = (jx + jy) * Math.SQRT1_2 / mag;
        z = (-jx + jy) * Math.SQRT1_2 / mag;
      }
    }

    this.x = x;
    this.z = z;

    return {
      x,
      z,
      touchActive: this.touchActive
    };
  }
}
