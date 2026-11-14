// Grenades: a FRAG that arcs, bounces once and explodes for area damage, and a
// DAZZLER flash that pops and blinds anyone looking at it. Both are thrown with
// a fixed impulse from the thrower's eye along their aim; the sim is fixed-step.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const GRAVITY = 14;
const FRAG_FUSE = 1.6;
const FRAG_RADIUS = 7;
const FRAG_DAMAGE = 110;
const FLASH_RADIUS = 16;
const FLASH_BLIND_SECONDS = 2.2;

export function createGrenades(scene, colliders) {
  const fragMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.5, metalness: 0.4 });
  const flashMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.4, metalness: 0.3 });
  const thrown = [];
  const walls2d = colliders.filter((b) => b.max.y > 0.4 && b.min.y < 2.2);

  function blocked(x, y, z, r) {
    if (x < -19.6 || x > 19.6 || z < -17.6 || z > 17.6) return true;
    for (const w of walls2d) {
      if (x > w.minX - r && x < w.maxX + r && z > w.minZ - r && z < w.maxZ + r && y < w.max.y && y > w.min.y - 0.2) return true;
    }
    return false;
  }

  function throwGrenade(kind, origin, dir) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), kind === 'frag' ? fragMat : flashMat);
    mesh.position.copy(origin);
    scene.add(mesh);
    thrown.push({
      kind, mesh,
      vel: new THREE.Vector3(dir.x * 13, dir.y * 13 + 3.5, dir.z * 13),
      fuse: kind === 'frag' ? FRAG_FUSE : 1.1,
      bounced: false,
    });
  }

  function step(dt, ctx) {
    for (let i = thrown.length - 1; i >= 0; i -= 1) {
      const g = thrown[i];
      g.fuse -= dt;
      g.vel.y -= GRAVITY * dt;
      const p = g.mesh.position;
      const nx = p.x + g.vel.x * dt;
      const ny = p.y + g.vel.y * dt;
      const nz = p.z + g.vel.z * dt;
      if (blocked(nx, ny, nz, 0.09)) {
        if (Math.abs(g.vel.x) > 1 || Math.abs(g.vel.z) > 1) {
          g.vel.x *= -0.35;
          g.vel.z *= -0.35;
          g.bounced = true;
        }
        if (g.vel.y < 0 && ny < 0.35) g.vel.y = Math.abs(g.vel.y) * 0.4;
      } else {
        p.set(nx, Math.max(0.09, ny), nz);
      }
      if (p.y <= 0.1 && g.vel.y < 0) {
        g.vel.y = Math.abs(g.vel.y) * 0.45;
        g.vel.x *= 0.7;
        g.vel.z *= 0.7;
      }
      if (g.fuse <= 0) {
        if (g.kind === 'frag') ctx.onFrag(p);
        else ctx.onFlash(p);
        scene.remove(g.mesh);
        thrown.splice(i, 1);
      }
    }
  }

  function clear() {
    for (const g of thrown) scene.remove(g.mesh);
    thrown.length = 0;
  }

  return { throwGrenade, step, clear, FRAG_RADIUS, FRAG_DAMAGE, FLASH_RADIUS, FLASH_BLIND_SECONDS };
}
