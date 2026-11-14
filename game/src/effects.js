// Effects: pooled tracers, impact sparks and the planted spike. Nothing is
// allocated per frame: a fixed pool of tracer lines is reused, and sparks are
// a single points cloud whose vertices are rewritten in place.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_POOL = 24;
const SPARK_COUNT = 120;

export function createEffects(scene) {
  const tracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.85 });
  const tracers = [];
  for (let i = 0; i < TRACER_POOL; i += 1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 1), tracerMat);
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerIndex = 0;

  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(SPARK_COUNT * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(
    sparkGeo,
    new THREE.PointsMaterial({ color: new THREE.Color(PALETTE.accent), size: 0.09, transparent: true, opacity: 0.95 }),
  );
  sparks.visible = false;
  sparks.frustumCulled = false;
  scene.add(sparks);
  const sparkVel = new Float32Array(SPARK_COUNT * 3);
  let sparkLife = 0;

  const spikeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ember), roughness: 0.4, metalness: 0.5, emissive: new THREE.Color(PALETTE.ember), emissiveIntensity: 1.2 });
  const spike = new THREE.Group();
  const spikeBody = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.7), spikeMat);
  spikeBody.position.y = 0.15;
  const spikeLight = new THREE.PointLight(new THREE.Color(PALETTE.ember), 0, 8);
  spikeLight.position.y = 0.6;
  spike.add(spikeBody, spikeLight);
  spike.visible = false;
  scene.add(spike);

  function tracer(from, to) {
    const item = tracers[tracerIndex];
    tracerIndex = (tracerIndex + 1) % TRACER_POOL;
    const mid = item.mesh.position;
    mid.set((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
    const len = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    item.mesh.scale.set(1, 1, Math.max(0.1, len));
    item.mesh.lookAt(to.x, to.y, to.z);
    item.mesh.visible = true;
    item.life = 0.07;
  }
  function impact(point, normal) {
    for (let i = 0; i < SPARK_COUNT; i += 1) {
      sparkPos[i * 3] = point.x;
      sparkPos[i * 3 + 1] = point.y;
      sparkPos[i * 3 + 2] = point.z;
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI - Math.PI / 2;
      const speed = 1.5 + Math.random() * 3.5;
      sparkVel[i * 3] = Math.cos(a) * Math.cos(b) * speed + normal.x * 2;
      sparkVel[i * 3 + 1] = Math.sin(b) * speed + normal.y * 2 + 1.5;
      sparkVel[i * 3 + 2] = Math.sin(a) * Math.cos(b) * speed + normal.z * 2;
    }
    sparkGeo.attributes.position.needsUpdate = true;
    sparks.visible = true;
    sparkLife = 0.35;
  }
  function step(dt) {
    for (const item of tracers) {
      if (item.life > 0) {
        item.life -= dt;
        if (item.life <= 0) item.mesh.visible = false;
      }
    }
    if (sparkLife > 0) {
      sparkLife -= dt;
      for (let i = 0; i < SPARK_COUNT; i += 1) {
        sparkVel[i * 3 + 1] -= 9 * dt;
        sparkPos[i * 3] += sparkVel[i * 3] * dt;
        sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
        sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
        if (sparkPos[i * 3 + 1] < 0.02) sparkPos[i * 3 + 1] = 0.02;
      }
      sparkGeo.attributes.position.needsUpdate = true;
      if (sparkLife <= 0) sparks.visible = false;
    }
  }
  function showSpike(x, z, on) {
    spike.visible = on;
    spike.position.set(x, 0, z);
    spikeLight.intensity = on ? 6 : 0;
  }
  function spikePulse(time) {
    if (spike.visible) spikeLight.intensity = 4 + Math.sin(time * 6) * 2.5;
  }
  return { tracer, impact, step, showSpike, spikePulse };
}
