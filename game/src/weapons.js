// Weapons: five guns plus the two grenades' shop data. Each gun owns its numbers,
// its view model and its firing state; main.js owns the ray and the damage.
// Damage falls off with range; headshots multiply; spread grows with movement.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  p9: { id: 'p9', name: 'P9 Sidearm', price: 0, damage: 26, headMult: 4, pellets: 1, mag: 12, reserve: 36, gap: 0.16, reloadTime: 1.4, spreadStill: 0.004, spreadMoving: 0.03, auto: false, kick: 0.03, falloff: 0.55 },
  vk47: { id: 'vk47', name: 'VK-47 Rifle', price: 2700, damage: 34, headMult: 4, pellets: 1, mag: 30, reserve: 90, gap: 0.096, reloadTime: 1.9, spreadStill: 0.0022, spreadMoving: 0.028, auto: true, kick: 0.055, falloff: 0.7 },
  raptor: { id: 'raptor', name: 'Raptor-9 SMG', price: 1500, damage: 22, headMult: 4, pellets: 1, mag: 28, reserve: 84, gap: 0.07, reloadTime: 1.6, spreadStill: 0.004, spreadMoving: 0.034, auto: true, kick: 0.04, falloff: 0.45 },
  breacher: { id: 'breacher', name: 'Breacher-12 Shotgun', price: 1200, damage: 9, headMult: 2, pellets: 8, mag: 6, reserve: 24, gap: 0.85, reloadTime: 2.4, spreadStill: 0.05, spreadMoving: 0.07, auto: false, kick: 0.14, falloff: 0.3 },
  longbow: { id: 'longbow', name: 'Longbow DMR', price: 4750, damage: 95, headMult: 4, pellets: 1, mag: 5, reserve: 15, gap: 1.1, reloadTime: 2.8, spreadStill: 0.0005, spreadMoving: 0.06, auto: false, kick: 0.12, falloff: 0.95 },
};
export const GRENADES = {
  frag: { id: 'frag', name: 'FRAG Grenade', price: 300 },
  flash: { id: 'flash', name: 'DAZZLER Flash', price: 200 },
};

function buildViewModel(def) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.6, metalness: 0.3 });
  const group = new THREE.Group();
  function part(w, h, d, x, y, z, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }
  if (def.id === 'p9') {
    part(0.05, 0.09, 0.26, 0, 0, -0.1, body);
    part(0.045, 0.12, 0.07, 0, -0.09, 0.06, grip);
  } else if (def.id === 'raptor') {
    part(0.07, 0.09, 0.34, 0, 0, -0.12, body);
    part(0.04, 0.04, 0.3, 0, 0.02, -0.32, dark);
    part(0.05, 0.14, 0.06, 0, -0.1, -0.02, grip);
    part(0.06, 0.05, 0.12, 0, -0.06, 0.14, grip);
  } else if (def.id === 'breacher') {
    part(0.09, 0.11, 0.5, 0, 0, -0.12, dark);
    part(0.05, 0.05, 0.52, 0, 0.045, -0.14, body);
    part(0.07, 0.09, 0.2, 0, -0.03, 0.26, grip);
  } else if (def.id === 'longbow') {
    part(0.07, 0.09, 0.62, 0, 0, -0.18, body);
    part(0.05, 0.05, 0.5, 0, 0.03, -0.3, dark);
    part(0.06, 0.06, 0.16, 0, 0.09, -0.1, dark); // scope
    part(0.06, 0.08, 0.2, 0, -0.03, 0.28, grip);
  } else {
    part(0.09, 0.1, 0.42, 0, 0, -0.12, body);
    part(0.045, 0.045, 0.4, 0, 0.025, -0.38, grip);
    part(0.075, 0.08, 0.22, 0, -0.02, 0.3, grip);
    part(0.05, 0.04, 0.14, 0, 0.07, -0.05, dark); // sight
  }
  group.position.set(0.24, -0.2, -0.42);
  return group;
}

export function createWeapons(camera) {
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const models = {};
  for (const def of Object.values(WEAPONS)) {
    models[def.id] = buildViewModel(def);
    models[def.id].visible = false;
    camera.add(models[def.id]);
  }

  const state = {
    id: 'p9', mag: WEAPONS.p9.mag, reserve: WEAPONS.p9.reserve,
    cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, zoomed: false,
  };
  // Ammo is kept per weapon, so switching guns never refills one.
  const ammo = {};
  for (const def of Object.values(WEAPONS)) ammo[def.id] = { mag: def.mag, reserve: def.reserve };
  models.p9.visible = true;

  function def() {
    return WEAPONS[state.id];
  }
  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.id];
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    model.position.y = -0.2 + (state.zoomed ? 0.055 : 0);
    model.position.x = 0.24 + (state.zoomed ? -0.24 : 0);
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def().reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def().mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }
  return {
    state,
    def,
    step,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def().gap;
      state.flash = 0.06;
      state.kick = def().kick;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === def().mag || state.reserve === 0) return;
      state.reloadLeft = def().reloadTime;
    },
    spread(speed) {
      const d = def();
      return d.spreadStill + Math.min(1, speed / 5.2) * d.spreadMoving + (state.zoomed ? -d.spreadStill * 0.6 : 0);
    },
    equip(id) {
      if (!WEAPONS[id] || id === state.id) return;
      ammo[state.id] = { mag: state.mag, reserve: state.reserve };
      models[state.id].visible = false;
      state.id = id;
      state.mag = ammo[id].mag;
      state.reserve = ammo[id].reserve;
      state.cooldown = 0.25;
      state.reloadLeft = 0;
      state.zoomed = false;
      models[id].visible = true;
    },
    setZoom(on) {
      state.zoomed = on && state.id === 'longbow' && state.reloadLeft === 0;
    },
    refill() {
      for (const def of Object.values(WEAPONS)) {
        ammo[def.id] = { mag: def.mag, reserve: def.reserve };
      }
      state.mag = def().mag;
      state.reserve = def().reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
    muzzleWorld(out) {
      out.set(0.24, -0.16, -0.95);
      return camera.localToWorld(out);
    },
  };
}
