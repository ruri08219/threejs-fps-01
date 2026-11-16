// Grenades: a FRAG that arcs, bounces and explodes for area damage, and a
// DAZZLER flash that pops and blinds anyone looking at it. Both leave the
// thrower's eye on a fixed impulse along their aim; the sim is fixed-step, so
// a throw always flies the same arc.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const DROP = 14;
const FRAG_FUSE = 1.6;
const FRAG_RADIUS = 7;
const FRAG_DAMAGE = 110;
const FLASH_RADIUS = 16;
const FLASH_BLIND_SECONDS = 2.2;
// A grenade only ever meets a wall in this height band; the floor is handled
// separately, so a bounce off the ground reads as a bounce, not a wall hit.
const WALL_CEILING = 2.2;
const WALL_FLOOR = 0.4;

export function createGrenades(scene, colliders) {
  const fragShell = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.5, metalness: 0.4 });
  const flashShell = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.4, metalness: 0.3 });
  const inFlight = [];
  const lowWalls = colliders.filter((b) => b.max.y > WALL_FLOOR && b.min.y < WALL_CEILING);

  function struckWall(x, y, z, r) {
    if (x < -19.6 || x > 19.6 || z < -17.6 || z > 17.6) return true;
    for (const w of lowWalls) {
      if (x > w.minX - r && x < w.maxX + r && z > w.minZ - r && z < w.maxZ + r && y < w.max.y && y > w.min.y - 0.2) return true;
    }
    return false;
  }

  function throwGrenade(type, origin, dir) {
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), type === 'frag' ? fragShell : flashShell);
    orb.position.copy(origin);
    scene.add(orb);
    inFlight.push({
      type, mesh: orb,
      flight: new THREE.Vector3(dir.x * 13, dir.y * 13 + 3.5, dir.z * 13),
      timer: type === 'frag' ? FRAG_FUSE : 1.1,
      bounced: false,
    });
  }

  function step(dt, hooks) {
    for (let i = inFlight.length - 1; i >= 0; i -= 1) {
      const shell = inFlight[i];
      shell.timer -= dt;
      shell.flight.y -= DROP * dt;
      const at = shell.mesh.position;
      const nextX = at.x + shell.flight.x * dt;
      const nextY = at.y + shell.flight.y * dt;
      const nextZ = at.z + shell.flight.z * dt;
      if (struckWall(nextX, nextY, nextZ, 0.09)) {
        // A sideways wall hit reverses the horizontal flight, damped; a
        // downward hit near the floor bounces up instead.
        if (Math.abs(shell.flight.x) > 1 || Math.abs(shell.flight.z) > 1) {
          shell.flight.x *= -0.35;
          shell.flight.z *= -0.35;
          shell.bounced = true;
        }
        if (shell.flight.y < 0 && nextY < 0.35) shell.flight.y = Math.abs(shell.flight.y) * 0.4;
      } else {
        at.set(nextX, Math.max(0.09, nextY), nextZ);
      }
      if (at.y <= 0.1 && shell.flight.y < 0) {
        shell.flight.y = Math.abs(shell.flight.y) * 0.45;
        shell.flight.x *= 0.7;
        shell.flight.z *= 0.7;
      }
      if (shell.timer <= 0) {
        if (shell.type === 'frag') hooks.onFrag(at);
        else hooks.onFlash(at);
        scene.remove(shell.mesh);
        inFlight.splice(i, 1);
      }
    }
  }

  function clear() {
    for (const shell of inFlight) scene.remove(shell.mesh);
    inFlight.length = 0;
  }

  return { throwGrenade, step, clear, FRAG_RADIUS, FRAG_DAMAGE, FLASH_RADIUS, FLASH_BLIND_SECONDS };
}
