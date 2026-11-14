// SANDLINE: a dusk desert compound, 40 x 36 m. Attackers spawn south, defenders
// north. Three lanes — west to site A, east to site B, mid past the watchtower —
// with containers, crates and sandbags for cover. Plain geometry only, no models,
// no textures, no network: the site letters are drawn on a canvas at runtime.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Bomb sites (centre, radius) and spawn points, in world metres.
export const SITES = {
  A: { x: -14, z: -12, r: 3.4 },
  B: { x: 14, z: -12, r: 3.4 },
};
export const SPAWNS = {
  attack: [[-3, 15], [-1, 15.5], [1, 15.5], [3, 15]],
  defend: [[-13, -14.5], [-5, -15], [5, -15], [13, -14.5]],
};
// Bot routes: ordered waypoints (x, z) from each spawn to each objective.
export const ROUTES = {
  attackA: [[-2, 12], [-6, 6], [-10, 0], [-13, -6], [-14, -11]],
  attackB: [[2, 12], [6, 6], [10, 0], [13, -6], [14, -11]],
  attackMid: [[0, 12], [0, 6], [0, 0], [-2, -6], [-6, -10]],
  defendA: [[-13, -14.5], [-14, -12], [-11, -8], [-8, -4]],
  defendB: [[13, -14.5], [14, -12], [11, -8], [8, -4]],
  defendMid: [[-5, -15], [0, -10], [0, -4], [2, 0]],
  holdA: [[-16, -9], [-14, -12]],
  holdB: [[16, -9], [14, -12]],
};

function letterTexture(letter, colour) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#171310';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = colour;
  ctx.font = '900 84px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 64, 70);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.94,
      metalness: 0.02,
    });
  }
  const glowA = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ember) });
  const glowB = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.teal) });

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Ground: sand slab with darker worn lanes, then dunes beyond the walls.
  box(40.4, 0.4, 36.4, 0, -0.2, 0, 'sand');
  box(3.2, 0.06, 30, -14, 0.03, -2, 'surface', false); // A lane
  box(3.2, 0.06, 30, 14, 0.03, -2, 'surface', false); // B lane
  box(3.2, 0.06, 30, 0, 0.03, 0, 'surface', false); // mid lane
  box(40.4, 0.06, 3.2, 0, 0.03, -12, 'surface', false); // site street
  for (const [x, z, s] of [[-26, -22, 9], [26, -20, 11], [0, -30, 13], [-28, 8, 8], [28, 10, 9], [0, 26, 12]]) {
    const dune = new THREE.Mesh(new THREE.SphereGeometry(s, 12, 8), materials.muted);
    dune.scale.y = 0.22;
    dune.position.set(x, -0.4, z);
    group.add(dune);
  }

  // Perimeter walls, 5 m, with a sandbag lip on the south (attacker) side.
  box(0.5, 5, 36.4, -20.2, 2.5, 0, 'surface');
  box(0.5, 5, 36.4, 20.2, 2.5, 0, 'surface');
  box(40.4, 5, 0.5, 0, 2.5, -18.2, 'surface');
  box(40.4, 5, 0.5, 0, 2.5, 18.2, 'surface');
  box(6, 0.9, 1, -6, 0.45, 16.9, 'hairline');
  box(6, 0.9, 1, 6, 0.45, 16.9, 'hairline');

  // Mid: watchtower on four legs with a platform bots and players can see over.
  for (const [x, z] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) box(0.35, 3.4, 0.35, x, 1.7, z, 'rust');
  box(4.4, 0.3, 4.4, 0, 3.55, 0, 'rust');
  box(4.4, 0.8, 0.3, 0, 4.1, -2.1, 'rust');
  box(0.3, 0.8, 4.4, -2.1, 4.1, 0, 'rust');
  box(0.3, 0.8, 4.4, 2.1, 4.1, 0, 'rust');

  // A site (west): container stack, crates, sandbags, pylon with the letter A.
  box(6, 2.6, 2.6, -17, 1.3, -8, 'rust');
  box(6, 2.6, 2.6, -17, 3.9, -8, 'sand');
  box(2.4, 2.4, 2.4, -10.5, 1.2, -14.5, 'sand');
  box(1.4, 1.4, 1.4, -10.5, 3.1, -14.5, 'hairline');
  box(3.4, 1, 1, -13, 0.5, -8.6, 'hairline');
  box(1.2, 1, 3.4, -17.5, 0.5, -13.5, 'hairline');
  // B site (east): mirrored, different cover rhythm so the sites play differently.
  box(2.6, 2.6, 6, 17, 1.3, -8, 'sand');
  box(2.6, 2.6, 6, 17, 3.9, -8, 'rust');
  box(2.4, 2.4, 2.4, 10.5, 1.2, -14.5, 'rust');
  box(3.4, 1, 1, 13, 0.5, -8.6, 'hairline');
  box(1.2, 1, 3.4, 17.5, 0.5, -13.5, 'hairline');
  box(1.4, 1.4, 1.4, 12.5, 0.7, -10.5, 'hairline');

  // Lane cover: mid doors, A-long crates, B-long barriers, connector walls.
  box(1.4, 3, 1.4, -2.2, 1.5, 4.5, 'hairline');
  box(1.4, 3, 1.4, 2.2, 1.5, 4.5, 'hairline');
  box(3.4, 1.1, 1.2, -8, 0.55, 2, 'hairline');
  box(1.2, 1.1, 3.4, 8, 0.55, 2, 'hairline');
  box(2.2, 1.1, 2.2, -6, 0.55, -6, 'sand');
  box(2.2, 1.1, 2.2, 6, 0.55, -6, 'rust');
  box(0.5, 2.6, 6, -8, 1.3, -10, 'surface');
  box(0.5, 2.6, 6, 8, 1.3, -10, 'surface');
  box(4, 1, 1, -4, 0.5, 10, 'hairline');
  box(4, 1, 1, 4, 0.5, 10, 'hairline');
  box(1.6, 0.8, 1.6, -12, 0.4, 6, 'sand');
  box(1.6, 0.8, 1.6, 12, 0.4, 6, 'sand');

  // Site markers: a glowing ring on the ground and a pylon with the letter.
  function siteMarker(site, letter, glow) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(site.r - 0.25, site.r, 40), glow);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.06, site.z);
    group.add(ring);
    const pylon = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 3.4, 0.7),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.9 }),
    );
    pylon.position.set(site.x, 1.7, site.z + site.r + 0.8);
    pylon.castShadow = true;
    group.add(pylon);
    colliders.push(new THREE.Box3().setFromObject(pylon));
    shootables.push(pylon);
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.MeshBasicMaterial({ map: letterTexture(letter, '#f0a830') }),
    );
    face.position.set(site.x, 3.1, site.z + site.r + 0.45);
    face.rotation.y = Math.PI;
    group.add(face);
  }
  siteMarker(SITES.A, 'A', glowA);
  siteMarker(SITES.B, 'B', glowB);

  // Light: a low amber sun in the west, cool dusk fill, warm sky gradient,
  // plus a warm glow over each bomb site so the sites read at a glance.
  const sky = new THREE.HemisphereLight(new THREE.Color('#8a6a4a'), new THREE.Color(PALETTE.canvas), 1.35);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb45e'), 2.8);
  sun.position.set(-24, 10, 6);
  sun.target.position.set(4, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -26;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#5a6a8a'), 0.75);
  fill.position.set(10, 12, 14);
  scene.add(fill);
  for (const site of [SITES.A, SITES.B]) {
    const glow = new THREE.PointLight(new THREE.Color(PALETTE.ember), 14, 14);
    glow.position.set(site.x, 4.5, site.z);
    scene.add(glow);
  }
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), fog: false }),
  );
  disc.position.set(-34, 7, -20);
  disc.lookAt(0, 1.5, 0);
  scene.add(disc);

  return { colliders, shootables, group };
}
