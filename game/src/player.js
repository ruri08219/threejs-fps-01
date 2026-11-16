// Player movement: acceleration, friction, gravity, crouch and jump, resolved
// as a box against the world's colliders one axis at a time, so a wall never
// swallows the player and a corner never snags them.
import * as THREE from 'three';

const BODY_RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.4;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 6.2;

export function createPlayer(colliders) {
  const mover = {
    position: new THREE.Vector3(0, 0, 9.5),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: STAND_EYE,
    onGround: true,
    crouching: false,
    height: STAND_HEIGHT,
  };
  const probeBox = new THREE.Box3();
  const heading = new THREE.Vector3();

  // The lift keeps the feet and the crown out of the horizontal tests, so
  // standing on the floor is never read as walking into a wall.
  function blockedBy(x, y, z, height, lift) {
    probeBox.min.set(x - BODY_RADIUS, y + lift, z - BODY_RADIUS);
    probeBox.max.set(x + BODY_RADIUS, y + height - lift, z + BODY_RADIUS);
    for (const collider of colliders) if (probeBox.intersectsBox(collider)) return collider;
    return null;
  }

  function look(dx, dy, sensitivity = 0.0022) {
    mover.yaw -= dx * sensitivity;
    mover.pitch = Math.max(-1.45, Math.min(1.45, mover.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    mover.pitch = Math.min(1.45, mover.pitch + pitchKick);
    mover.yaw += yawKick;
  }

  function step(dt, keys) {
    const crouchHeld = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouchHeld && !mover.crouching) {
      mover.crouching = true;
      mover.height = CROUCH_HEIGHT;
    } else if (!crouchHeld && mover.crouching && !blockedBy(mover.position.x, mover.position.y, mover.position.z, STAND_HEIGHT, 0.02)) {
      // Standing up is refused while something is overhead.
      mover.crouching = false;
      mover.height = STAND_HEIGHT;
    }
    const eyeGoal = mover.crouching ? CROUCH_EYE : STAND_EYE;
    mover.eye += (eyeGoal - mover.eye) * Math.min(1, dt * 12);

    const advance = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const sidestep = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    heading.set(0, 0, 0);
    if (advance || sidestep) {
      const sin = Math.sin(mover.yaw);
      const cos = Math.cos(mover.yaw);
      heading.set(-sin * advance + cos * sidestep, 0, -cos * advance - sin * sidestep).normalize();
    }

    const pace = mover.crouching ? CROUCH_SPEED : WALK_SPEED;
    const lerp = Math.min(1, (mover.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / pace);
    mover.velocity.x += (heading.x * pace - mover.velocity.x) * lerp;
    mover.velocity.z += (heading.z * pace - mover.velocity.z) * lerp;
    if (mover.onGround && !heading.lengthSq()) {
      const drag = Math.max(0, 1 - FRICTION * dt);
      mover.velocity.x *= drag;
      mover.velocity.z *= drag;
    }

    if (keys.has('Space') && mover.onGround) {
      mover.velocity.y = JUMP_SPEED;
      mover.onGround = false;
    }
    mover.velocity.y -= GRAVITY * dt;

    // Horizontal axes resolve separately, so sliding along a wall works.
    const tryX = mover.position.x + mover.velocity.x * dt;
    if (!blockedBy(tryX, mover.position.y, mover.position.z, mover.height, 0.04)) mover.position.x = tryX;
    else mover.velocity.x = 0;
    const tryZ = mover.position.z + mover.velocity.z * dt;
    if (!blockedBy(mover.position.x, mover.position.y, tryZ, mover.height, 0.04)) mover.position.z = tryZ;
    else mover.velocity.z = 0;

    mover.position.y += mover.velocity.y * dt;
    mover.onGround = false;
    const floorHit = blockedBy(mover.position.x, mover.position.y, mover.position.z, mover.height, 0);
    if (floorHit && mover.velocity.y <= 0) {
      mover.position.y = floorHit.max.y;
      mover.velocity.y = 0;
      mover.onGround = true;
    } else if (floorHit) {
      mover.position.y = floorHit.min.y - mover.height;
      mover.velocity.y = 0;
    }
    if (mover.position.y < 0) {
      mover.position.y = 0;
      mover.velocity.y = 0;
      mover.onGround = true;
    }
    mover.velocity.y = Math.max(-30, mover.velocity.y);
  }

  return {
    state: mover,
    step,
    look,
    recoil,
    groundSpeed() {
      return Math.hypot(mover.velocity.x, mover.velocity.z);
    },
  };
}
