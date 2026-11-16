// Weapons: five guns plus the two grenades' shop data. Each gun owns its
// numbers, its view model and its firing state; main.js owns the ray and the
// damage. Damage falls off with range, headshots multiply, and spread grows
// with movement — standing still is always the accurate shot.
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
  flash: {
    id: 'flash', name: 'DAZZLER Flash', price: 200,
  },
};

// One gun's first-person model, built from boxes: a different silhouette per
// weapon so the player can tell at a glance what is in their hands. Every
// model carries one thin amber stripe — the gun has to read against dark
// walls and sand alike, and the stripe is what the eye catches first. The
// rig sits a touch higher and further in than the first pass, which had the
// grip half out of the bottom of the frame.
function makeGunModel(spec) {
  const gripMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.6, metalness: 0.3 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.45, metalness: 0.25, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.7 });
  const assembly = new THREE.Group();
  function addBit(w, h, d, x, y, z, mat) {
    const bit = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    bit.position.set(x, y, z);
    assembly.add(bit);
    return bit;
  }
  if (spec.id === 'p9') {
    addBit(0.05, 0.09, 0.26, 0, 0, -0.1, bodyMat);
    addBit(0.045, 0.12, 0.07, 0, -0.09, 0.06, gripMat);
    addBit(0.052, 0.012, 0.2, 0, 0.048, -0.1, stripeMat);
  } else if (spec.id === 'raptor') {
    addBit(0.07, 0.09, 0.34, 0, 0, -0.12, bodyMat);
    addBit(0.04, 0.04, 0.3, 0, 0.02, -0.32, darkMat);
    addBit(0.05, 0.14, 0.06, 0, -0.1, -0.02, gripMat);
    addBit(0.06, 0.05, 0.12, 0, -0.06, 0.14, gripMat);
    addBit(0.072, 0.012, 0.26, 0, 0.048, -0.12, stripeMat);
  } else if (spec.id === 'breacher') {
    addBit(0.09, 0.11, 0.5, 0, 0, -0.12, darkMat);
    addBit(0.05, 0.05, 0.52, 0, 0.045, -0.14, bodyMat);
    addBit(0.07, 0.09, 0.2, 0, -0.03, 0.26, gripMat);
    addBit(0.092, 0.012, 0.4, 0, 0.058, -0.12, stripeMat);
  } else if (spec.id === 'longbow') {
    addBit(0.07, 0.09, 0.62, 0, 0, -0.18, bodyMat);
    addBit(0.05, 0.05, 0.5, 0, 0.03, -0.3, darkMat);
    addBit(0.06, 0.06, 0.16, 0, 0.09, -0.1, darkMat); // scope
    addBit(0.06, 0.08, 0.2, 0, -0.03, 0.28, gripMat);
    addBit(0.072, 0.012, 0.5, 0, 0.048, -0.18, stripeMat);
  } else {
    addBit(0.09, 0.1, 0.42, 0, 0, -0.12, bodyMat);
    addBit(0.045, 0.045, 0.4, 0, 0.025, -0.38, gripMat);
    addBit(0.075, 0.08, 0.22, 0, -0.02, 0.3, gripMat);
    addBit(0.05, 0.04, 0.14, 0, 0.07, -0.05, darkMat); // sight
    addBit(0.092, 0.012, 0.32, 0, 0.053, -0.12, stripeMat);
  }
  assembly.position.set(0.21, -0.14, -0.42);
  // The rig is scaled up half again: at life size the pistol read as a thin
  // bar against the sand, easy to miss entirely. Bigger, higher and with a
  // glowing stripe, it reads as a gun at a glance.
  assembly.scale.set(1.5, 1.5, 1.5);
  return assembly;
}

export function createWeapons(camera) {
  // The muzzle flash: a glowing quad and a point light on the camera, shown
  // for a few frames after every shot.
  const burstQuad = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24), // the glowing muzzle quad
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  burstQuad.position.set(0.21, -0.12, -0.95);
  burstQuad.visible = false;
  camera.add(burstQuad);
  const burstLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  burstLight.position.set(0.21, -0.10, -0.6);
  camera.add(burstLight);

  const rigs = {};
  for (const spec of Object.values(WEAPONS)) {
    rigs[spec.id] = makeGunModel(spec);
    rigs[spec.id].visible = false;
    camera.add(rigs[spec.id]);
  }

  const state = {
    id: 'p9',
    mag: WEAPONS.p9.mag,
    reserve: WEAPONS.p9.reserve,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    zoomed: false,
  };
  // Ammo is tracked per weapon, so switching guns never refills one.
  const stock = {};
  for (const spec of Object.values(WEAPONS)) stock[spec.id] = { mag: spec.mag, reserve: spec.reserve };
  rigs.p9.visible = true;
  let bobPhase = 0;

  function selected() {
    const held = WEAPONS[state.id];
    return held;
  }

  function step(frame, speed) {
    state.cooldown = Math.max(0, state.cooldown - frame);
    state.flash = Math.max(0, state.flash - frame);
    state.kick += (0 - state.kick) * Math.min(1, frame * 14);
    const rig = rigs[state.id];
    // Walk bob: the gun sways with the player's stride, stronger the faster
    // they move, and settles the moment they stop — the same movement that
    // the spread punishes is visible in the hands.
    const pace = Math.min(1, (speed || 0) / 5.2);
    bobPhase += frame * (speed || 0) * 1.7;
    const bob = Math.sin(bobPhase) * 0.008 * pace;
    rig.position.z = -0.42 + state.kick;
    rig.rotation.x = state.kick * 2.2;
    rig.position.y = -0.14 + (state.zoomed ? 0.055 : 0) + bob;
    rig.position.x = 0.21 + (state.zoomed ? -0.21 : 0) + Math.cos(bobPhase * 0.5) * 0.004 * pace;
    burstQuad.visible = state.flash > 0;
    burstQuad.rotation.z = state.flash * 30;
    burstLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) { // a reload is in progress
      state.reloadLeft = Math.max(0, state.reloadLeft - frame);
      // The reload dip: the gun tilts down while the mag is swapped.
      rig.rotation.x = -0.55 * Math.min(1, (selected().reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) { // mag swapped, top it up
        const shortfall = selected().mag - state.mag;
        const taken = Math.min(shortfall, state.reserve);
        state.mag += taken;
        state.reserve -= taken;
      }
    }
  }

  return {
    state: state,
    def: selected,
    step: step,
    ready() { // can this gun fire right now?
      const hasAmmo = state.mag > 0;
      return hasAmmo && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = selected().gap;
      state.flash = 0.06; // brief muzzle glow
      state.kick = selected().kick;
    },
    takeRound() {
      if (state.mag <= 0) { return false; }
      state.mag = state.mag - 1;
      return true;
    },
    reload() { // start a reload, if one is possible
      if (state.reloadLeft > 0 || state.mag === selected().mag || state.reserve === 0) return;
      state.reloadLeft = selected().reloadTime;
    },
    spread(speed) { // bloom grows with movement, shrinks when scoped
      const d = selected();
      const moving = Math.min(1, speed / 5.2) * d.spreadMoving;
      const scoped = state.zoomed ? -d.spreadStill * 0.6 : 0;
      return d.spreadStill + moving + scoped;
    },
    equip(id) {
      if (!WEAPONS[id] || id === state.id) return;
      stock[state.id] = { mag: state.mag, reserve: state.reserve };
      rigs[state.id].visible = false;
      state.id = id;
      state.mag = stock[id].mag;
      state.reserve = stock[id].reserve;
      state.cooldown = 0.25;
      state.reloadLeft = 0;
      state.zoomed = false;
      rigs[id].visible = true;
    },
    setZoom(on) {
      state.zoomed = on && state.id === 'longbow' && state.reloadLeft === 0;
    },
    refill() {
      for (const spec of Object.values(WEAPONS)) {
        stock[spec.id] = { mag: spec.mag, reserve: spec.reserve };
      }
      state.mag = selected().mag;
      state.reserve = selected().reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
    muzzleWorld(out) {
      out.set(0.21, -0.10, -0.95);
      return camera.localToWorld(out);
    },
  };
}
