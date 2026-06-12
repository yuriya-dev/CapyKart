/**
 * src/core/Minimap.ts
 *
 * Mengelola rendering peta kecil (minimap) 2D pada elemen HTML5 Canvas.
 * Memproyeksikan koordinat 3D dari waypoints sirkuit ke koordinat 2D kanvas,
 * menggambar jalur sirkuit dengan efek neon glow, serta menampilkan posisi
 * dan arah hadap krt player dan bots secara real-time.
 */

import * as THREE from 'three';

export interface BotMinimapInfo {
  position: THREE.Vector3;
  color: string;
}

export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private waypoints: THREE.Vector3[];
  private startLinePos: THREE.Vector3;

  // Track boundaries
  private minX = Infinity;
  private maxX = -Infinity;
  private minZ = Infinity;
  private maxZ = -Infinity;

  // Drawing properties
  private padding = 12;
  private lastWidth = 0;
  private lastHeight = 0;

  constructor(canvas: HTMLCanvasElement, waypoints: THREE.Vector3[], startLinePos: THREE.Vector3) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not get 2D context from canvas');
    }
    this.ctx = context;
    this.waypoints = waypoints;
    this.startLinePos = startLinePos;

    // Calculate track bounds
    this.waypoints.forEach(wp => {
      if (wp.x < this.minX) this.minX = wp.x;
      if (wp.x > this.maxX) this.maxX = wp.x;
      if (wp.z < this.minZ) this.minZ = wp.z;
      if (wp.z > this.maxZ) this.maxZ = wp.z;
    });

    // Make sure we have a valid bounding box
    if (this.maxX === this.minX) {
      this.minX -= 50;
      this.maxX += 50;
    }
    if (this.maxZ === this.minZ) {
      this.minZ -= 50;
      this.maxZ += 50;
    }
  }

  /**
   * Resizes the canvas to match its display size multiplied by devicePixelRatio
   * to ensure crystal-clear rendering on high-DPI screens.
   */
  private resizeCanvasIfNeeded() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // Only resize if the display size has changed
    if (this.lastWidth !== rect.width || this.lastHeight !== rect.height) {
      this.canvas.width = rect.width * dpr;
      this.canvas.height = rect.height * dpr;
      
      this.lastWidth = rect.width;
      this.lastHeight = rect.height;
    }
  }

  /**
   * Projects a 3D coordinate (x, z) to 2D canvas coordinates (px, py).
   */
  private project(x: number, z: number, width: number, height: number): { x: number; y: number } {
    const scaleX = (width - 2 * this.padding) / (this.maxX - this.minX);
    const scaleZ = (height - 2 * this.padding) / (this.maxZ - this.minZ);
    const scale = Math.min(scaleX, scaleZ);

    const offsetX = this.padding + (width - 2 * this.padding - (this.maxX - this.minX) * scale) / 2;
    const offsetY = this.padding + (height - 2 * this.padding - (this.maxZ - this.minZ) * scale) / 2;

    return {
      x: offsetX + (x - this.minX) * scale,
      y: offsetY + (z - this.minZ) * scale
    };
  }

  /**
   * Updates and draws the minimap.
   */
  public update(
    playerPosition: THREE.Vector3,
    playerRotation: THREE.Quaternion,
    playerColor: string,
    bots: BotMinimapInfo[]
  ) {
    this.resizeCanvasIfNeeded();

    const dpr = window.devicePixelRatio || 1;
    const width = this.lastWidth;
    const height = this.lastHeight;

    const ctx = this.ctx;

    // Reset transform and clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width * dpr, height * dpr);

    // Apply scale for DPR support
    ctx.scale(dpr, dpr);

    if (this.waypoints.length === 0) return;

    // Draw Track Road (Base shadow/thickness)
    ctx.beginPath();
    const startPt = this.project(this.waypoints[0].x, this.waypoints[0].z, width, height);
    ctx.moveTo(startPt.x, startPt.y);
    for (let i = 1; i < this.waypoints.length; i++) {
      const pt = this.project(this.waypoints[i].x, this.waypoints[i].z, width, height);
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.closePath();

    ctx.strokeStyle = '#1e1c26'; // Dark road base
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowBlur = 0; // No shadow for base road
    ctx.stroke();

    // Draw Track Centerline (Neon glowing line)
    ctx.strokeStyle = '#47a1ff'; // Cyan/blue neon
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#47a1ff';
    ctx.shadowBlur = 8;
    ctx.stroke();

    // Reset shadow for subsequent elements
    ctx.shadowBlur = 0;

    // Draw Start/Finish Line
    const startIdx = 0;
    const nextIdx = 1;
    
    // Find direction perpendicular to start line
    const wpStart = this.waypoints[startIdx];
    const wpNext = this.waypoints[nextIdx];
    const dir = new THREE.Vector3().subVectors(wpNext, wpStart).normalize();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize();

    // Draw a small dashed checkered line across the road
    const lineHalfWidth = 5; // length of checkered line on each side
    const pLeft = this.project(this.startLinePos.x - perp.x * lineHalfWidth, this.startLinePos.z - perp.z * lineHalfWidth, width, height);
    const pRight = this.project(this.startLinePos.x + perp.x * lineHalfWidth, this.startLinePos.z + perp.z * lineHalfWidth, width, height);

    ctx.beginPath();
    ctx.moveTo(pLeft.x, pLeft.y);
    ctx.lineTo(pRight.x, pRight.y);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.setLineDash([2, 2]); // checkered effect
    ctx.stroke();
    ctx.setLineDash([]); // Reset dash

    // Draw Bots Positions
    bots.forEach(bot => {
      const bPt = this.project(bot.position.x, bot.position.z, width, height);
      
      // Draw bot dot
      ctx.beginPath();
      ctx.arc(bPt.x, bPt.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = bot.color;
      ctx.fill();
      ctx.strokeStyle = '#1a1c1c';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    });

    // Draw Player Position and Direction
    const pPt = this.project(playerPosition.x, playerPosition.z, width, height);

    // Get 2D yaw direction from 3D quaternion
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(playerRotation);
    const angle = Math.atan2(forward.z, forward.x);

    // Draw player outline glow
    ctx.shadowColor = playerColor;
    ctx.shadowBlur = 6;

    // Draw player main circle
    ctx.beginPath();
    ctx.arc(pPt.x, pPt.y, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = playerColor;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Draw player heading arrow (triangle)
    ctx.shadowBlur = 0; // Reset shadow
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();

    const arrowLength = 9;
    const arrowWidth = 5.5;

    // Tip of the arrow
    const ax = pPt.x + Math.cos(angle) * arrowLength;
    const ay = pPt.y + Math.sin(angle) * arrowLength;
    
    // Bottom-left corner
    const lx = pPt.x + Math.cos(angle + Math.PI * 0.82) * arrowWidth;
    const ly = pPt.y + Math.sin(angle + Math.PI * 0.82) * arrowWidth;
    
    // Bottom-right corner
    const rx = pPt.x + Math.cos(angle - Math.PI * 0.82) * arrowWidth;
    const ry = pPt.y + Math.sin(angle - Math.PI * 0.82) * arrowWidth;

    ctx.moveTo(ax, ay);
    ctx.lineTo(lx, ly);
    ctx.lineTo(rx, ry);
    ctx.closePath();
    ctx.fill();
  }
}
