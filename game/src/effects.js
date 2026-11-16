// Effects: pooled tracer beams, impact sparks, the planted spike, and the
// dusk air itself — slow amber motes drifting over the compound so the scene
// never reads as an empty grey box. Nothing is allocated per frame: the
// tracer beams are a fixed reused pool, the sparks and the motes are single
// points clouds whose vertices are rewritten in place.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const BOLT_POOL = 24;
const SPARK_TOTAL = 120;
const BOLT_LIFE = 0.07;
const EMBER_LIFE = 0.35;
const EMBER_GRAVITY = 9;
const MOTE_TOTAL = 140;

// A fixed-seed shuffle so the motes sit in the same places every load:
// the capture frames and live play agree, and no per-frame random is needed.
function moteRandom(seed) {
  let a = seed;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createEffects(scene) {
  // --- Tracers: one shared beam mesh per shot, stretched between two points.
  const boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.85 });
  const beams = [];
  for (let i = 0; i < BOLT_POOL; i += 1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 1), boltMat);
    mesh.visible = false;
    scene.add(mesh);
    beams.push({ mesh, life: 0 });
  }
  let beamCursor = 0;

  // --- Impact sparks: one burst, one cloud, reused for every hit.
  const emberGeo = new THREE.BufferGeometry();
  const emberPos = new Float32Array(SPARK_TOTAL * 3);
  emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
  const emberCloud = new THREE.Points(
    emberGeo,
    new THREE.PointsMaterial({ color: new THREE.Color(PALETTE.accent), size: 0.09, transparent: true, opacity: 0.95 }),
  );
  emberCloud.visible = false;
  emberCloud.frustumCulled = false;
  scene.add(emberCloud);
  const emberVel = new Float32Array(SPARK_TOTAL * 3);
  let emberLife = 0;

  // --- Dust motes: warm specks hanging in the dusk light, always on.
  // They drift on slow sine paths inside the compound walls and wrap around,
  // so the air has depth even when nobody is shooting.
  const moteGeo = new THREE.BufferGeometry();
  const motePos = new Float32Array(MOTE_TOTAL * 3);
  const motePhase = new Float32Array(MOTE_TOTAL * 2);
  const moteSeed = moteRandom(7);
  for (let i = 0; i < MOTE_TOTAL; i += 1) {
    motePos[i * 3] = (moteSeed() * 2 - 1) * 19;
    motePos[i * 3 + 1] = 0.3 + moteSeed() * 5.5;
    motePos[i * 3 + 2] = (moteSeed() * 2 - 1) * 17;
    motePhase[i * 2] = moteSeed() * Math.PI * 2;
    motePhase[i * 2 + 1] = 0.25 + moteSeed() * 0.6;
  }
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const moteCloud = new THREE.Points(
    moteGeo,
    new THREE.PointsMaterial({
      color: new THREE.Color(PALETTE.accent),
      size: 0.07,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  moteCloud.frustumCulled = false;
  scene.add(moteCloud);
  let moteClock = 0;

  // --- The planted spike: a glowing prop with a pulsing light.
  const spikeSkin = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ember), roughness: 0.4, metalness: 0.5, emissive: new THREE.Color(PALETTE.ember), emissiveIntensity: 1.2 });
  const spikeProp = new THREE.Group();
  const spikeCore = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.7), spikeSkin);
  spikeCore.position.y = 0.15;
  const spikeGlow = new THREE.PointLight(new THREE.Color(PALETTE.ember), 0, 8);
  spikeGlow.position.y = 0.6;
  spikeProp.add(spikeCore, spikeGlow);
  spikeProp.visible = false;
  scene.add(spikeProp);

  function tracer(from, to) {
    const beam = beams[beamCursor];
    beamCursor = (beamCursor + 1) % BOLT_POOL;
    const midpoint = beam.mesh.position;
    midpoint.set((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    beam.mesh.scale.set(1, 1, Math.max(0.1, length));
    beam.mesh.lookAt(to.x, to.y, to.z);
    beam.mesh.visible = true;
    beam.life = BOLT_LIFE;
  }

  function impact(point, normal) {
    for (let i = 0; i < SPARK_TOTAL; i += 1) {
      emberPos[i * 3] = point.x;
      emberPos[i * 3 + 1] = point.y;
      emberPos[i * 3 + 2] = point.z;
      // A random burst direction, biased along the surface normal and upward.
      const azimuth = Math.random() * Math.PI * 2;
      const elevation = Math.random() * Math.PI - Math.PI / 2;
      const speed = 1.5 + Math.random() * 3.5;
      emberVel[i * 3] = Math.cos(azimuth) * Math.cos(elevation) * speed + normal.x * 2;
      emberVel[i * 3 + 1] = Math.sin(elevation) * speed + normal.y * 2 + 1.5;
      emberVel[i * 3 + 2] = Math.sin(azimuth) * Math.cos(elevation) * speed + normal.z * 2;
    }
    emberGeo.attributes.position.needsUpdate = true;
    emberCloud.visible = true;
    emberLife = EMBER_LIFE;
  }

  function step(dt) {
    for (const beam of beams) {
      if (beam.life > 0) {
        beam.life -= dt;
        if (beam.life <= 0) beam.mesh.visible = false;
      }
    }
    if (emberLife > 0) {
      emberLife -= dt;
      for (let i = 0; i < SPARK_TOTAL; i += 1) {
        emberVel[i * 3 + 1] -= EMBER_GRAVITY * dt;
        emberPos[i * 3] += emberVel[i * 3] * dt;
        emberPos[i * 3 + 1] += emberVel[i * 3 + 1] * dt;
        emberPos[i * 3 + 2] += emberVel[i * 3 + 2] * dt;
        if (emberPos[i * 3 + 1] < 0.02) emberPos[i * 3 + 1] = 0.02;
      }
      emberGeo.attributes.position.needsUpdate = true;
      if (emberLife <= 0) emberCloud.visible = false;
    }
    // Motes never stop: each one bobs on its own sine and drifts sideways,
    // wrapping at the walls so the cloud never thins out.
    moteClock += dt;
    for (let i = 0; i < MOTE_TOTAL; i += 1) {
      const phase = motePhase[i * 2];
      const speed = motePhase[i * 2 + 1];
      motePos[i * 3] += Math.sin(moteClock * 0.22 * speed + phase) * dt * 0.35;
      motePos[i * 3 + 1] += Math.cos(moteClock * 0.31 * speed + phase) * dt * 0.12;
      motePos[i * 3 + 2] += Math.cos(moteClock * 0.19 * speed + phase * 1.7) * dt * 0.3;
      if (motePos[i * 3] > 19) motePos[i * 3] = -19;
      else if (motePos[i * 3] < -19) motePos[i * 3] = 19;
      if (motePos[i * 3 + 2] > 17) motePos[i * 3 + 2] = -17;
      else if (motePos[i * 3 + 2] < -17) motePos[i * 3 + 2] = 17;
      if (motePos[i * 3 + 1] > 6) motePos[i * 3 + 1] = 0.3;
      else if (motePos[i * 3 + 1] < 0.2) motePos[i * 3 + 1] = 5.8;
    }
    moteGeo.attributes.position.needsUpdate = true;
  }

  function showSpike(x, z, on) {
    spikeProp.visible = on;
    spikeProp.position.set(x, 0, z);
    spikeGlow.intensity = on ? 6 : 0;
  }

  function spikePulse(time) {
    if (spikeProp.visible) spikeGlow.intensity = 4 + Math.sin(time * 6) * 2.5;
  }

  return { tracer, impact, step, showSpike, spikePulse };
}
