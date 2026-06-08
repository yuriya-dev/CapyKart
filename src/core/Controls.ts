/**
 * src/core/Controls.ts
 *
 * Menangani input dari Keyboard (WASD / Panah), Gamepad, dan Virtual Buttons di Mobile
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

  // Button inputs
  private buttonLeft = false;
  private buttonRight = false;
  private buttonUp = false;
  private buttonDown = false;

  // Callback for booster
  public onBoosterPressed: (() => void) | null = null;

  // DOM Elements references
  private containerEl: HTMLElement | null = null;

  constructor() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
    });
    
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    // Jalankan setup setelah DOM siap
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setupTouchUI());
    } else {
      this.setupTouchUI();
    }
  }

  private setupTouchUI() {
    const container = document.getElementById('mobile-controls');
    if (!container) return;

    this.containerEl = container;

    // 1. Setup Navigation Buttons Event Listeners
    const bindButton = (id: string, onPress: (pressed: boolean) => void) => {
      const btn = document.getElementById(id);
      if (!btn) return;

      const setPressed = (pressed: boolean, e: Event) => {
        e.stopPropagation();
        e.preventDefault();
        onPress(pressed);
      };

      btn.addEventListener('pointerdown', (e) => setPressed(true, e));
      btn.addEventListener('pointerup', (e) => setPressed(false, e));
      btn.addEventListener('pointercancel', (e) => setPressed(false, e));
      btn.addEventListener('pointerleave', (e) => setPressed(false, e));
      
      // Prevent context menus on long press on mobile
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    };

    bindButton('btn-steer-left', (pressed) => { this.buttonLeft = pressed; });
    bindButton('btn-steer-right', (pressed) => { this.buttonRight = pressed; });
    bindButton('btn-acc-up', (pressed) => { this.buttonUp = pressed; });
    bindButton('btn-acc-down', (pressed) => { this.buttonDown = pressed; });

    // 2. Setup Booster Button
    const btnMobileBoost = document.getElementById('btn-mobile-boost');
    if (btnMobileBoost) {
      const triggerBoost = (e: Event) => {
        e.stopPropagation();
        e.preventDefault();
        if (this.onBoosterPressed) {
          this.onBoosterPressed();
        }
      };
      btnMobileBoost.addEventListener('pointerdown', triggerBoost);
      btnMobileBoost.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  public setVisible(visible: boolean) {
    if (!this.containerEl) return;
    
    // Check touch capabilities
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const hud = document.getElementById('hud');

    if (visible && isTouch) {
      this.containerEl.classList.remove('hidden');
      if (hud) hud.classList.add('mobile-active');
    } else {
      this.containerEl.classList.add('hidden');
      if (hud) hud.classList.remove('mobile-active');
    }
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

    // 3. Touch Controls Input (Buttons)
    let bx = 0;
    let bz = 0;
    if (this.buttonLeft) bx -= 1;
    if (this.buttonRight) bx += 1;
    if (this.buttonUp) bz += 1;
    if (this.buttonDown) bz -= 1;

    // Keep touchActive as false for button mode so Vehicle.ts utilizes keyboard controls (relative steer)
    // which is way smoother for discrete/digital inputs.
    this.touchActive = false;

    // Overwrite input values only if mobile buttons are pressed
    const mobileBtnActive = this.buttonLeft || this.buttonRight || this.buttonUp || this.buttonDown;
    if (mobileBtnActive) {
      x = bx;
      z = bz;
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
