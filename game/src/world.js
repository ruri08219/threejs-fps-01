// SANDLINE: a dusk desert compound, 40 x 36 m. Attackers spawn south, defenders
// north. Three lanes — west to site A, east to site B, mid past the watchtower —
// with containers, crates and sandbags for cover. Plain geometry only, no
// models, no textures, no network: the site letters are drawn on a canvas
// at runtime and pasted on the pylons.
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

// A site letter (A or B) as a small canvas texture for a pylon face.
function letterPlate(letter, colour) {
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

  const skins = {};
  for (const name of Object.keys(PALETTE)) {
    skins[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.94,
      metalness: 0.02,
    });
  }
  const emberGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ember) });
  const tealGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.teal) });

  const colliders = [];
  const shootables = [];

  // A solid block: part of the scenery, a collider for movement, and a
  // shootable surface for hitscan. Decorative slabs pass collide=false.
  function placeBlock(width, height, depth, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), skins[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Ground: a sand slab with darker worn lanes, then dunes beyond the walls.
  placeBlock(40.4, 0.4, 36.4, 0, -0.2, 0, 'sand');
  placeBlock(3.2, 0.06, 30, -14, 0.03, -2, 'surface', false); // A lane
  placeBlock(3.2, 0.06, 30, 14, 0.03, -2, 'surface', false); // B lane
  placeBlock(3.2, 0.06, 30, 0, 0.03, 0, 'surface', false); // mid lane
  placeBlock(40.4, 0.06, 3.2, 0, 0.03, -12, 'surface', false); // site street
  for (const [x, z, s] of [[-26, -22, 9], [26, -20, 11], [0, -30, 13], [-28, 8, 8], [28, 10, 9], [0, 26, 12]]) {
    const mound = new THREE.Mesh(new THREE.SphereGeometry(s, 12, 8), skins.muted);
    mound.scale.y = 0.22;
    mound.position.set(x, -0.4, z);
    group.add(mound);
  }

  // Perimeter walls, 5 m, with a sandbag lip on the south (attacker) side.
  placeBlock(0.5, 5, 36.4, -20.2, 2.5, 0, 'surface');
  placeBlock(0.5, 5, 36.4, 20.2, 2.5, 0, 'surface');
  placeBlock(40.4, 5, 0.5, 0, 2.5, -18.2, 'surface');
  placeBlock(40.4, 5, 0.5, 0, 2.5, 18.2, 'surface');
  placeBlock(6, 0.9, 1, -6, 0.45, 16.9, 'hairline');
  placeBlock(6, 0.9, 1, 6, 0.45, 16.9, 'hairline');

  // Mid: a watchtower on four legs, its platform high enough to see over.
  for (const [x, z] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) placeBlock(0.35, 3.4, 0.35, x, 1.7, z, 'rust');
  placeBlock(4.4, 0.3, 4.4, 0, 3.55, 0, 'rust');
  placeBlock(4.4, 0.8, 0.3, 0, 4.1, -2.1, 'rust');
  placeBlock(0.3, 0.8, 4.4, -2.1, 4.1, 0, 'rust');
  placeBlock(0.3, 0.8, 4.4, 2.1, 4.1, 0, 'rust');

  // A site (west): a container stack, crates, sandbags, and the letter pylon.
  placeBlock(6, 2.6, 2.6, -17, 1.3, -8, 'rust');
  placeBlock(6, 2.6, 2.6, -17, 3.9, -8, 'sand');
  placeBlock(2.4, 2.4, 2.4, -10.5, 1.2, -14.5, 'sand');
  placeBlock(1.4, 1.4, 1.4, -10.5, 3.1, -14.5, 'hairline');
  placeBlock(3.4, 1, 1, -13, 0.5, -8.6, 'hairline');
  placeBlock(1.2, 1, 3.4, -17.5, 0.5, -13.5, 'hairline');
  // B site (east): mirrored, but a different cover rhythm so the sites play
  // differently instead of feeling like the same fight twice.
  placeBlock(2.6, 2.6, 6, 17, 1.3, -8, 'sand');
  placeBlock(2.6, 2.6, 6, 17, 3.9, -8, 'rust');
  placeBlock(2.4, 2.4, 2.4, 10.5, 1.2, -14.5, 'rust');
  placeBlock(3.4, 1, 1, 13, 0.5, -8.6, 'hairline');
  placeBlock(1.2, 1, 3.4, 17.5, 0.5, -13.5, 'hairline');
  placeBlock(1.4, 1.4, 1.4, 12.5, 0.7, -10.5, 'hairline');

  // Lane cover: mid doors, A-long crates, B-long barriers, connector walls.
  placeBlock(1.4, 3, 1.4, -2.2, 1.5, 4.5, 'hairline');
  placeBlock(1.4, 3, 1.4, 2.2, 1.5, 4.5, 'hairline');
  placeBlock(3.4, 1.1, 1.2, -8, 0.55, 2, 'hairline');
  placeBlock(1.2, 1.1, 3.4, 8, 0.55, 2, 'hairline');
  placeBlock(2.2, 1.1, 2.2, -6, 0.55, -6, 'sand');
  placeBlock(2.2, 1.1, 2.2, 6, 0.55, -6, 'rust');
  placeBlock(0.5, 2.6, 6, -8, 1.3, -10, 'surface');
  placeBlock(0.5, 2.6, 6, 8, 1.3, -10, 'surface');
  placeBlock(4, 1, 1, -4, 0.5, 10, 'hairline');
  placeBlock(4, 1, 1, 4, 0.5, 10, 'hairline');
  placeBlock(1.6, 0.8, 1.6, -12, 0.4, 6, 'sand');
  placeBlock(1.6, 0.8, 1.6, 12, 0.4, 6, 'sand');

  // Site markers: a glowing ring on the ground and a pylon with the letter,
  // facing south so attackers read it as they push in.
  function flagSite(site, letter, glow) {
    const halo = new THREE.Mesh(new THREE.RingGeometry(site.r - 0.25, site.r, 40), glow);
    halo.rotation.x = -Math.PI / 2;
    halo.position.set(site.x, 0.06, site.z);
    group.add(halo);
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 3.4, 0.7),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.9 }),
    );
    post.position.set(site.x, 1.7, site.z + site.r + 0.8);
    post.castShadow = true;
    group.add(post);
    colliders.push(new THREE.Box3().setFromObject(post));
    shootables.push(post);
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.MeshBasicMaterial({ map: letterPlate(letter, '#f0a830') }),
    );
    plate.position.set(site.x, 3.1, site.z + site.r + 0.45);
    plate.rotation.y = Math.PI;
    group.add(plate);
  }
  flagSite(SITES.A, 'A', emberGlow);
  flagSite(SITES.B, 'B', tealGlow);

  // Light: a low amber sun in the west, a cool dusk fill, and a warm glow over
  // each bomb site so the sites read at a glance from anywhere on the map.
  // The levels are deliberately generous: the first pass read too dark on
  // shaded faces and in the lanes, so the hemisphere and the fill were raised
  // until the ground, the crates and the far walls all stay readable while
  // the dusk mood (warm sun, cool fill) is kept.
  const dome = new THREE.HemisphereLight(new THREE.Color('#b08d63'), new THREE.Color(PALETTE.canvas), 2.1);
  scene.add(dome);
  const sunLamp = new THREE.DirectionalLight(new THREE.Color('#ffb45e'), 3.6);
  sunLamp.position.set(-24, 10, 6);
  sunLamp.target.position.set(4, 0, -4);
  sunLamp.castShadow = true;
  sunLamp.shadow.mapSize.set(2048, 2048);
  sunLamp.shadow.camera.left = -26;
  sunLamp.shadow.camera.right = 26;
  sunLamp.shadow.camera.top = 26;
  sunLamp.shadow.camera.bottom = -26;
  sunLamp.shadow.camera.far = 70;
  sunLamp.shadow.bias = -0.0006;
  scene.add(sunLamp, sunLamp.target);
  const fillLamp = new THREE.DirectionalLight(new THREE.Color('#5a6a8a'), 1.25);
  fillLamp.position.set(10, 12, 14);
  scene.add(fillLamp);
  for (const spot of [SITES.A, SITES.B]) {
    const glow = new THREE.PointLight(new THREE.Color(PALETTE.ember), 22, 16);
    glow.position.set(spot.x, 4.5, spot.z);
    scene.add(glow);
  }
  // The setting sun itself, a flat amber disc low over the western dunes.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), fog: false }),
  );
  sunDisc.position.set(-34, 7, -20);
  sunDisc.lookAt(0, 1.5, 0);
  scene.add(sunDisc);

  return { colliders, shootables, group };
}
