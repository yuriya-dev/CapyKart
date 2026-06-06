declare module 'crashcat' {
  export function registerAll(): void;
  export function createWorldSettings(): any;
  export function addBroadphaseLayer(settings: any): number;
  export function addObjectLayer(settings: any, broadphaseLayer: number): number;
  export function enableCollision(settings: any, layerA: number, layerB: number): void;
  export function createWorld(settings: any): any;
  export function updateWorld(world: any, contactListener: any, dt: number): void;

  export namespace rigidBody {
    export function create(world: any, config: {
      shape: any;
      motionType: number;
      objectLayer: number;
      position?: number[];
      quaternion?: number[];
      mass?: number;
      friction?: number;
      restitution?: number;
      linearDamping?: number;
      angularDamping?: number;
      gravityFactor?: number;
      motionQuality?: number;
    }): any;
    export function setPosition(world: any, body: any, pos: number[], active?: boolean): void;
    export function setLinearVelocity(world: any, body: any, vel: number[]): void;
    export function setAngularVelocity(world: any, body: any, vel: number[]): void;
  }

  export namespace box {
    export function create(config: { halfExtents: number[] }): any;
  }

  export namespace sphere {
    export function create(config: { radius: number }): any;
  }

  export const MotionType: {
    STATIC: number;
    KINEMATIC: number;
    DYNAMIC: number;
  };

  export const MotionQuality: {
    DISCRETE: number;
    LINEAR_CAST: number;
  };

  export namespace triangleMesh {
    export function create(config: {
      positions: number[] | Float32Array;
      indices: number[] | Uint32Array | Uint16Array;
    }): any;
  }
}
