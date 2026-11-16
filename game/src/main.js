// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. SANDLINE: 4v4 round-based tactical FPS — AURUM (you + 3 bots)
// attack, VANTA (4 bots) defend. Plant the spike at A or B, or eliminate the
// defenders; first to 5 rounds takes the match. ?shot=start|play|bomb|end with
// &seed=N sets up a deterministic frame for a capture, renders it twice, then
// freezes it and sets window.__shotReady.
//
// Where the game lives, one module per job: world.js builds the 40x36 m dusk
// compound (three lanes, sites A/B, bot routes, lighting); player.js moves
// the hero with acceleration, crouch and map collision; weapons.js owns the
// five guns, their view models, spread that grows with movement, recoil and
// headshot multipliers; bots.js drives the seven bots (routes, holds, sight
// and hearing, plant/defuse); rounds.js owns phases, timers and scoring;
// economy.js owns money and the buy menu; grenades.js throws frag and flash;
// effects.js pools tracers, sparks and dust; audio.js synthesises every
// sound; hud.js is the DOM (health, ammo, timer, score, kill feed, shop).
// The sim ticks at a fixed 60 Hz in tick() and never allocates in its hot
// loops; rendering only reads state, it never writes it.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, SITES, SPAWNS } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons, WEAPONS, GRENADES } from './weapons.js';
import { createBots } from './bots.js';
import { createEconomy } from './economy.js';
import { createRounds } from './rounds.js';
import { createGrenades } from './grenades.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { createHud } from './hud.js';

const STEP = 1 / 60;
const query = new URLSearchParams(window.location.search);
const shotName = query.get('shot');
const shotSeed = Number.parseInt(query.get('seed') ?? '1', 10) || 1;

// A tiny seeded PRNG so screenshot mode is deterministic; live play uses
// Math.random like any other browser game.
function seededRandom(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = shotName ? seededRandom(shotSeed) : Math.random;

// Reused temporaries: the hot loops allocate nothing.
const scratchA = new THREE.Vector3();
const scratchB = new THREE.Vector3();
const scratchDir = new THREE.Vector3();

const gl = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
gl.setSize(window.innerWidth, window.innerHeight);
gl.shadowMap.enabled = true;
gl.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(gl.domElement);

const stage = new THREE.Scene();
stage.background = new THREE.Color(PALETTE.canvas);
stage.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 30, 85);
const cam = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
stage.add(cam);

const arena = createWorld(stage);
const sfx = createAudio();
const fx = createEffects(stage);
const purse = createEconomy();
const match = createRounds();
const throws = createGrenades(stage, arena.colliders);
const squad = createBots(stage, arena.colliders, rng);
const ui = createHud();
const hero = createPlayer(arena.colliders);
const arsenal = createWeapons(cam);
const controls = createInput(gl.domElement, lockChanged);

const caster = new THREE.Raycaster();
caster.far = 100;
const targets = arena.shootables.concat(squad.hitMeshes);

const heroBody = hero.state;
const session = {
  hp: 100,
  alive: true,
  ownedPrimary: null,
  grenades: { frag: 0, flash: 0 },
  selectedGrenade: 'frag',
  throwCooldown: 0,
  plantProgress: 0,
  flashBlind: 0,
  kills: 0,
  deaths: 0,
  spectate: null,
  settled: false,
  stepAccum: 0,
  wasFiring: false,
  matchShown: false,
};
let clock = 0;
let held = false;
let playing = false;
let acc = 0;
let prevNow = performance.now();
let targetFov = 74;

// What the bots are allowed to know about the match: the player's position,
// the spike, the phase, and the shared helpers for seeing and shooting.
const botWorld = {
  time: 0,
  player: { pos: heroBody.position, eye: 1.6, alive: true, team: 'attack' },
  bomb: match.state.bomb,
  phase: 'buy',
  defuseProgress: 0,
  canSee(x1, y1, z1, x2, y2, z2) {
    scratchA.set(x2 - x1, y2 - y1, z2 - z1);
    const dist = scratchA.length();
    if (dist < 0.01) return true;
    scratchA.divideScalar(dist);
    caster.set(scratchB.set(x1, y1, z1), scratchA);
    caster.far = dist - 0.3;
    return caster.intersectObjects(arena.shootables, false).length === 0;
  },
  shootFrom(bot, from, dir) {
    hitscan(bot, from, dir, bot.weapon, 0);
  },
  onPlanted(siteKey) {
    plantSpike('bot', siteKey);
  },
  onDefused() {
    closeRound('defend', 'Spike defused — site held.');
  },
};

// A ray against a sphere, for the player's capsule (head + torso spheres).
function sphereHit(origin, dir, cx, cy, cz, r) {
  const ox = origin.x - cx;
  const oy = origin.y - cy;
  const oz = origin.z - cz;
  const b = ox * dir.x + oy * dir.y + oz * dir.z;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : -1;
}

// One hitscan shot, resolved against the world, the bots' bodies and (for bot
// shooters) the player's capsule, approximated as head and torso spheres.
function hitscan(shooter, origin, dir, def, spread) {
  const isPlayer = shooter === 'player';
  const muzzle = scratchB;
  if (isPlayer) arsenal.muzzleWorld(muzzle);
  else muzzle.set(origin.x + dir.x * 0.5, origin.y + dir.y * 0.5, origin.z + dir.z * 0.5);
  let hitPoint = null;
  let hitNormal = null;
  for (let p = 0; p < def.pellets; p += 1) {
    scratchDir.set(
      dir.x + (rng() * 2 - 1) * spread,
      dir.y + (rng() * 2 - 1) * spread,
      dir.z + (rng() * 2 - 1) * spread,
    ).normalize();
    caster.set(scratchA.set(origin.x, origin.y, origin.z), scratchDir);
    caster.far = 100;
    const hits = caster.intersectObjects(targets, false);
    let bestDist = hits.length ? hits[0].distance : 100;
    let best = hits.length ? hits[0] : null;
    let playerHit = null;
    if (!isPlayer && session.alive) {
      const eye = heroBody.position.y + heroBody.eye;
      const tHead = sphereHit(scratchA, scratchDir, heroBody.position.x, eye + 0.02, heroBody.position.z, 0.2);
      const tTorso = sphereHit(scratchA, scratchDir, heroBody.position.x, heroBody.position.y + 1.0, heroBody.position.z, 0.45);
      const t = tHead > 0 ? tHead : tTorso;
      if (t > 0 && t < bestDist) {
        playerHit = { dist: t, head: tHead > 0 && tHead < (tTorso > 0 ? tTorso : Infinity) };
        bestDist = t;
      }
    }
    const end = scratchA.set(origin.x, origin.y, origin.z).addScaledVector(scratchDir, bestDist);
    fx.tracer(muzzle, end);
    if (playerHit) {
      const dmg = Math.round(def.damage * (playerHit.head ? def.headMult : 1) * rangeKeep(bestDist, def.falloff));
      hurtPlayer(dmg, origin, playerHit.head);
      hitPoint = end;
    } else if (best && best.object.userData.bot) {
      const bot = best.object.userData.bot;
      const head = best.object.userData.part === 'head';
      const dmg = Math.round(def.damage * (head ? def.headMult : 1) * rangeKeep(bestDist, def.falloff));
      hurtBot(bot, dmg, head, shooter);
      hitPoint = best.point;
      hitNormal = best.face ? best.face.normal : null;
      if (isPlayer) ui.hitMarker(!bot.alive, head);
    } else if (best) {
      hitPoint = best.point;
      hitNormal = best.face ? best.face.normal : null;
      fx.impact(best.point, hitNormal || scratchA.set(0, 1, 0));
    }
  }
  const team = isPlayer ? 'attack' : shooter.team;
  squad.onShotFired(muzzle, team);
  return hitPoint;
}

// Damage keeps a fraction of itself at long range: `keep` is the fraction
// that survives at 55 m, and it interpolates linearly up to that distance.
function rangeKeep(dist, keep) {
  return keep + (1 - keep) * Math.max(0, 1 - dist / 55);
}

function hurtBot(bot, amount, head, attacker) {
  if (!bot.alive) return;
  bot.health -= amount;
  if (bot.health > 0) {
    if (attacker === 'player') sfx.hit(head);
    return;
  }
  bot.alive = false;
  bot.health = 0;
  bot.fall = 0;
  if (attacker === 'player') {
    session.kills += 1;
    purse.kill();
    sfx.kill();
    ui.killFeed(`You ▸ ${bot.name}`, 'aurum');
    ui.setMoney(purse.state.money);
  } else if (attacker && attacker !== 'player') {
    ui.killFeed(`${attacker.name} ▸ ${bot.name}`, attacker.team);
  }
  if (bot.carrier) {
    // The spike passes to the next living attacker.
    const next = squad.list.find((b) => b.alive && b.team === 'attack');
    squad.setCarrier(next || null);
    if (next) match.state.bomb.carrier = 'bot';
  }
  checkWipe();
}

function hurtPlayer(amount, from, head) {
  if (!session.alive) return;
  session.hp -= amount;
  session.plantProgress = 0;
  ui.damageFlash();
  sfx.hurt();
  ui.setHealth(session.hp);
  if (session.hp > 0) return;
  session.hp = 0;
  session.alive = false;
  session.deaths += 1;
  botWorld.player.alive = false;
  if (document.pointerLockElement) document.exitPointerLock();
  ui.banner('YOU ARE DOWN', 'Your team fights on — spectating a teammate.', 'vanta');
  if (match.state.bomb.carrier === 'player') {
    const next = squad.list.find((b) => b.alive && b.team === 'attack');
    squad.setCarrier(next || null);
    if (next) match.state.bomb.carrier = 'bot';
  }
  checkWipe();
}

function checkWipe() {
  const phase = match.state.phase;
  if (phase !== 'live' && phase !== 'planted') return;
  const aAlive = squad.aliveCount('attack') + (session.alive ? 1 : 0);
  const dAlive = squad.aliveCount('defend');
  if (aAlive === 0 && !match.state.bomb.planted) closeRound('defend', 'AURUM eliminated.');
  else if (dAlive === 0 && !match.state.bomb.planted) closeRound('attack', 'VANTA eliminated.');
}

function plantSpike(who, siteKey) {
  if (match.state.phase !== 'live') return;
  match.plant(siteKey);
  const site = match.state.bomb.site;
  fx.showSpike(site.x, site.z, true);
  sfx.plantBeep();
  ui.banner('SPIKE PLANTED', `Fuse running — ${siteKey} site. Hold it.`, 'aurum');
  ui.killFeed(who === 'player' ? 'You planted the spike' : `${who} planted the spike`, 'aurum');
}

function closeRound(winner, reason) {
  if (!match.endRound(winner, reason)) return;
  awardRound(winner, reason);
}

function awardRound(winner, reason) {
  const won = winner === 'attack';
  purse.roundEnd(won, match.state.bomb.planted);
  fx.showSpike(0, 0, false);
  if (won) sfx.roundWin();
  else sfx.roundLose();
  ui.banner(won ? 'ROUND WON' : 'ROUND LOST', reason, won ? 'aurum' : 'vanta');
  ui.setMoney(purse.state.money);
  ui.setScore(match.state.score.attack, match.state.score.defend, match.state.round);
  session.settled = true;
}

function resetPlayer() {
  const spawn = SPAWNS.attack[1];
  heroBody.position.set(spawn[0], 0, spawn[1]);
  heroBody.velocity.set(0, 0, 0);
  heroBody.yaw = 0;
  heroBody.pitch = 0;
  heroBody.eye = 1.6;
  session.hp = 100;
  session.alive = true;
  session.plantProgress = 0;
  session.flashBlind = 0;
  session.spectate = null;
  botWorld.player.alive = true;
  arsenal.refill();
  ui.setHealth(100);
  ui.setAmmo(arsenal.state.mag, arsenal.state.reserve, arsenal.def().name);
}

function newMatch() {
  purse.reset();
  match.reset();
  session.kills = 0;
  session.deaths = 0;
  session.ownedPrimary = null;
  session.grenades = { frag: 0, flash: 0 };
  session.selectedGrenade = 'frag';
  session.settled = false;
  session.matchShown = false;
  arsenal.equip('p9');
  throws.clear();
  fx.showSpike(0, 0, false);
  newRound(1);
}

function newRound(number) {
  match.startRound(number, rng);
  squad.spawnRound(number);
  resetPlayer();
  session.settled = false;
  ui.setScore(match.state.score.attack, match.state.score.defend, number);
  ui.setMoney(purse.state.money);
  ui.setBombStatus('SPIKE ON YOU — PLANT AT A OR B');
  ui.banner(`ROUND ${number}`, `Plant the spike at ${match.state.bomb.targetSite.key} — or clear VANTA.`, 'aurum');
}

function purchase(id) {
  if (match.state.phase !== 'buy') return;
  if (WEAPONS[id]) {
    const def = WEAPONS[id];
    if (session.ownedPrimary === id) return;
    if (!purse.spend(def.price)) return;
    session.ownedPrimary = id;
    arsenal.equip(id);
    sfx.buy();
  } else if (GRENADES[id]) {
    if (session.grenades[id] >= 2) return;
    if (!purse.spend(GRENADES[id].price)) return;
    session.grenades[id] += 1;
    sfx.buy();
  }
  ui.setMoney(purse.state.money);
  ui.setAmmo(arsenal.state.mag, arsenal.state.reserve, arsenal.def().name);
  refreshShop();
}

function refreshShop() {
  ui.refreshBuy((id) => {
    if (WEAPONS[id]) return purse.canAfford(WEAPONS[id].price) && session.ownedPrimary !== id;
    return purse.canAfford(GRENADES[id].price) && session.grenades[id] < 2;
  });
}

function lobGrenade() {
  const kind = session.selectedGrenade;
  if (session.grenades[kind] <= 0 || session.throwCooldown > 0 || !session.alive) return;
  session.grenades[kind] -= 1;
  session.throwCooldown = 0.5;
  cam.getWorldDirection(scratchDir);
  scratchA.copy(cam.position).addScaledVector(scratchDir, 0.5);
  throws.throwGrenade(kind, scratchA, scratchDir);
  ui.setGrenades(session.grenades.frag, session.grenades.flash, session.selectedGrenade);
}

function fragBurst(pos) {
  const distToPlayer = Math.hypot(pos.x - heroBody.position.x, pos.y - heroBody.position.y, pos.z - heroBody.position.z);
  sfx.explosion(distToPlayer);
  fx.impact(pos, scratchA.set(0, 1, 0));
  for (const bot of squad.list) {
    if (!bot.alive) continue;
    const d = Math.hypot(pos.x - bot.pos.x, pos.z - bot.pos.z);
    if (d > throws.FRAG_RADIUS) continue;
    const los = botWorld.canSee(pos.x, pos.y + 0.3, pos.z, bot.pos.x, 1.2, bot.pos.z);
    const dmg = Math.round(throws.FRAG_DAMAGE * (1 - d / throws.FRAG_RADIUS) * (los ? 1 : 0.5));
    hurtBot(bot, dmg, false, 'player');
  }
  if (session.alive && distToPlayer < throws.FRAG_RADIUS) {
    const los = botWorld.canSee(pos.x, pos.y + 0.3, pos.z, heroBody.position.x, heroBody.position.y + 1.2, heroBody.position.z);
    hurtPlayer(Math.round(throws.FRAG_DAMAGE * (1 - distToPlayer / throws.FRAG_RADIUS) * (los ? 1 : 0.5)), pos, false);
  }
}

function flashBurst(pos) {
  const distToPlayer = Math.hypot(pos.x - heroBody.position.x, pos.y - heroBody.position.y, pos.z - heroBody.position.z);
  sfx.flashPop(distToPlayer);
  for (const bot of squad.list) {
    if (!bot.alive) continue;
    const d = Math.hypot(pos.x - bot.pos.x, pos.z - bot.pos.z);
    if (d > throws.FLASH_RADIUS) continue;
    if (!botWorld.canSee(pos.x, pos.y + 0.3, pos.z, bot.pos.x, 1.5, bot.pos.z)) continue;
    const fx2 = -Math.sin(bot.yaw);
    const fz = -Math.cos(bot.yaw);
    const toFlash = Math.hypot(pos.x - bot.pos.x, pos.z - bot.pos.z) || 1;
    const facing = (fx2 * (pos.x - bot.pos.x) + fz * (pos.z - bot.pos.z)) / toFlash;
    if (facing > -0.1 || d < 4) bot.blindUntil = clock + throws.FLASH_BLIND_SECONDS;
  }
  if (session.alive && distToPlayer < throws.FLASH_RADIUS) {
    cam.getWorldDirection(scratchDir);
    const toFlash = scratchA.set(pos.x - cam.position.x, pos.y - cam.position.y, pos.z - cam.position.z);
    const d = toFlash.length() || 1;
    toFlash.divideScalar(d);
    const facing = scratchDir.dot(toFlash);
    if (facing > 0.2 && botWorld.canSee(pos.x, pos.y + 0.3, pos.z, cam.position.x, cam.position.y, cam.position.z)) {
      session.flashBlind = Math.min(1, 1.3 - distToPlayer / 20);
    }
  }
}

function lockChanged(locked) {
  if (shotName) return;
  if (locked) {
    playing = true;
    sfx.unlock();
    ui.hideOverlay();
    ui.showBuy(false);
  } else if (!match.state.matchOver) {
    ui.showOverlay(playing ? 'paused' : 'start');
  }
}

function placeCamera() {
  if (!session.alive) {
    // Dead: spectate a living teammate from their eyes.
    const mate = squad.list.find((b) => b.alive && b.team === 'attack');
    if (mate) {
      cam.position.set(mate.pos.x, 1.55, mate.pos.z);
      cam.rotation.set(-0.08, mate.yaw, 0, 'YXZ');
      return;
    }
  }
  cam.position.set(heroBody.position.x, heroBody.position.y + heroBody.eye, heroBody.position.z);
  cam.rotation.set(heroBody.pitch, heroBody.yaw, 0, 'YXZ');
}

function lookAtPoint(point) {
  const dx = point.x - heroBody.position.x;
  const dy = point.y - (heroBody.position.y + heroBody.eye);
  const dz = point.z - heroBody.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  heroBody.yaw = Math.atan2(-dx, -dz);
  heroBody.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  placeCamera();
}

function fireWeapon() {
  if (!arsenal.takeRound()) {
    sfx.dryFire();
    arsenal.reload();
    return;
  }
  cam.getWorldDirection(scratchDir);
  hitscan('player', cam.position, scratchDir, arsenal.def(), arsenal.spread(hero.groundSpeed()));
  arsenal.pullTrigger();
  hero.recoil(arsenal.def().kick * 0.16 + rng() * 0.002, (rng() * 2 - 1) * 0.003);
  if (arsenal.def().id === 'breacher') sfx.shotgun(0);
  else if (arsenal.def().id === 'longbow') sfx.sniper(0);
  else sfx.shot(0);
  ui.setAmmo(arsenal.state.mag, arsenal.state.reserve, arsenal.def().name);
}

function tick(dt) {
  // The match does not tick until the player clicks play (shot mode drives
  // the sim itself, so it is exempt). Before that the scene just renders.
  if (!playing && !shotName) return;
  clock += dt;
  botWorld.time = clock;
  const phase = match.state.phase;
  botWorld.phase = phase;

  // Round clock. match.step may end the round on a timer (it scores itself);
  // settle the economy and the banner exactly once, whoever ended it.
  const prevPhase = phase;
  const scoreBefore = { a: match.state.score.attack, d: match.state.score.defend };
  match.step(dt);
  if (match.state.phase === 'over' && !session.settled) {
    let winner = null;
    if (match.state.score.attack > scoreBefore.a) winner = 'attack';
    else if (match.state.score.defend > scoreBefore.d) winner = 'defend';
    else winner = match.state.overReason.includes('detonat') ? 'attack' : 'defend';
    awardRound(winner, match.state.overReason);
  }
  if (match.state.phase === 'over' && match.state.phaseTime >= 4) {
    if (match.state.matchOver) {
      if (!session.matchShown) {
        session.matchShown = true;
        if (document.pointerLockElement) document.exitPointerLock();
        ui.showOverlay('start', `Match over — AURUM ${match.state.score.attack} : ${match.state.score.defend} VANTA. You scored ${session.kills} eliminations. Click to play again.`);
      }
    } else {
      newRound(match.state.round + 1);
    }
  }
  if (prevPhase === 'buy' && match.state.phase === 'live') {
    ui.showBuy(false);
    ui.banner('GO', `Plant at ${match.state.bomb.targetSite.key} — or clear the site.`, 'aurum');
  }

  // Player.
  const keys = controls.state.keys;
  if (session.alive && !ui.buyOpen()) {
    hero.step(dt, keys);
    if (hero.groundSpeed() > 0.5 && hero.state.onGround) {
      session.stepAccum += hero.groundSpeed() * dt;
      if (session.stepAccum > 2.4) {
        session.stepAccum = 0;
        sfx.step();
      }
    }
  }
  arsenal.step(dt, hero.groundSpeed());
  session.throwCooldown = Math.max(0, session.throwCooldown - dt);
  if (session.flashBlind > 0) {
    session.flashBlind = Math.max(0, session.flashBlind - dt / 2.2);
    ui.flashWhite(session.flashBlind);
  }

  // Planting (the player carries the spike).
  if (session.alive && phase === 'live' && match.state.bomb.carrier === 'player') {
    const site = match.state.bomb.targetSite;
    const d = Math.hypot(site.x - heroBody.position.x, site.z - heroBody.position.z);
    if (d < site.r && keys.has('KeyE')) {
      session.plantProgress += dt;
      ui.showProgress('PLANTING SPIKE', session.plantProgress / 3);
      if (session.plantProgress >= 3) {
        session.plantProgress = 0;
        ui.hideProgress();
        plantSpike('player', site.key);
      }
    } else {
      if (session.plantProgress > 0) ui.hideProgress();
      session.plantProgress = Math.max(0, session.plantProgress - dt * 2);
    }
  } else if (session.plantProgress > 0) {
    ui.hideProgress();
    session.plantProgress = 0;
  }

  // Bots and grenades. Bots only act once the round is live — the buy phase
  // is freeze time: nobody shoots, nobody moves, nobody dies.
  if (phase === 'live' || phase === 'planted') squad.step(dt, botWorld);
  throws.step(dt, { onFrag: fragBurst, onFlash: flashBurst });
  fx.step(dt);
  fx.spikePulse(clock);
  if (!match.state.bomb.planted) botWorld.defuseProgress = 0;
  else if (botWorld.defuseProgress > 0.01) ui.showProgress('SPIKE BEING DEFUSED', botWorld.defuseProgress);
  else if (session.plantProgress <= 0) ui.hideProgress();

  // Zoom (Longbow scope on right mouse).
  const wantZoom = controls.state.aiming && arsenal.def().id === 'longbow' && session.alive;
  arsenal.setZoom(wantZoom);
  targetFov = wantZoom ? 32 : 74;
  if (Math.abs(cam.fov - targetFov) > 0.2) {
    cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 10);
    cam.updateProjectionMatrix();
  }

  // HUD.
  ui.setTimer(match.state.timer, match.state.phase);
  ui.setAlive(squad.aliveCount('attack') + (session.alive ? 1 : 0), 4, squad.aliveCount('defend'), 4);
  ui.setGrenades(session.grenades.frag, session.grenades.flash, session.selectedGrenade);
  ui.setCrosshair(6 + arsenal.spread(hero.groundSpeed()) * 3200 + hero.groundSpeed() * 1.5);
  if (match.state.bomb.planted) {
    ui.setBombStatus(`SPIKE PLANTED — ${Math.ceil(match.state.timer)}s TO DETONATION`);
  } else if (match.state.bomb.carrier === 'player') {
    ui.setBombStatus('SPIKE ON YOU — PLANT AT A OR B');
  } else {
    const carrier = squad.list.find((b) => b.carrier);
    ui.setBombStatus(carrier ? `SPIKE WITH ${carrier.name.toUpperCase()}` : 'SPIKE LOST');
  }
}

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - prevNow) / 1000, 0.1);
  prevNow = now;
  if (!held) {
    const look = controls.takeLook();
    const sens = arsenal.state.zoomed ? 0.5 : 1;
    hero.look(look.x * sens, look.y * sens);
    for (const code of controls.takePressed()) {
      if (code === 'KeyB' && match.state.phase === 'buy' && session.alive) {
        const open = !ui.buyOpen();
        ui.showBuy(open);
        refreshShop();
        if (open && document.pointerLockElement) document.exitPointerLock();
        else if (!open) controls.requestLock();
      } else if (code === 'KeyG') {
        lobGrenade();
      } else if (code === 'KeyQ') {
        session.selectedGrenade = session.selectedGrenade === 'frag' ? 'flash' : 'frag';
        ui.setGrenades(session.grenades.frag, session.grenades.flash, session.selectedGrenade);
      } else if (code === 'Digit1' && session.ownedPrimary) {
        arsenal.equip(session.ownedPrimary);
        ui.setAmmo(arsenal.state.mag, arsenal.state.reserve, arsenal.def().name);
      } else if (code === 'Digit2') {
        arsenal.equip('p9');
        ui.setAmmo(arsenal.state.mag, arsenal.state.reserve, arsenal.def().name);
      }
    }
    // Semi-auto guns fire once per click; autos fire while held.
    const firingNow = controls.state.firing && session.alive && !ui.buyOpen();
    if (firingNow && arsenal.ready() && (arsenal.def().auto || !session.wasFiring)) fireWeapon();
    session.wasFiring = firingNow;
    if (controls.state.keys.has('KeyR')) arsenal.reload();
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      tick(STEP);
      acc -= STEP;
      steps += 1;
    }
    if (acc > STEP * 5) acc = 0;
    placeCamera();
  }
  gl.render(stage, cam);
}

// Advance the sim by hand, for the deterministic screenshot setups.
function advance(steps) {
  for (let i = 0; i < steps; i += 1) tick(STEP);
}

function stageShot(name) {
  ui.hideOverlay();
  ui.hideBanner();
  ui.showBuy(false);
  newMatch();
  match.state.phase = 'live';
  match.state.phaseTime = 0;
  match.state.timer = 100;
  heroBody.position.set(-1, 0, 14);
  heroBody.yaw = 0.12;
  heroBody.pitch = 0.01;
  advance(30);
  if (name === 'start') {
    match.state.phase = 'buy';
    match.state.timer = 15;
    heroBody.position.set(-1, 0, 14);
    heroBody.yaw = 0.1;
    heroBody.pitch = 0.02;
    placeCamera();
    ui.showOverlay('start');
    ui.setTimer(15, 'buy');
  } else if (name === 'play') {
    const foe = squad.list.find((b) => b.team === 'defend');
    foe.pos.set(0, 0, -2);
    foe.yaw = Math.PI;
    foe.group.rotation.y = Math.PI;
    const mate = squad.list.find((b) => b.team === 'attack');
    mate.pos.set(-3, 0, 5);
    mate.yaw = -0.3;
    heroBody.position.set(0, 0, 8);
    advance(10);
    lookAtPoint(new THREE.Vector3(foe.pos.x, 1.2, foe.pos.z));
    fireWeapon();
    advance(4);
    ui.setAmmo(arsenal.state.mag, arsenal.state.reserve, arsenal.def().name);
    ui.hideBanner();
  } else if (name === 'bomb') {
    const site = SITES.A;
    match.state.bomb.targetSite = site;
    site.key = 'A';
    heroBody.position.set(-12.5, 0, -10);
    advance(10);
    lookAtPoint(new THREE.Vector3(site.x, 1.2, site.z));
    const foe = squad.list.find((b) => b.team === 'defend');
    foe.pos.set(-16, 0, -13.5);
    foe.yaw = 2.4;
    advance(6);
    session.plantProgress = 1.9;
    ui.showProgress('PLANTING SPIKE', 1.9 / 3);
    ui.hideBanner();
  } else {
    // end: a round won at A, the spike down, the banner up.
    match.state.round = 4;
    match.state.score.attack = 3;
    match.state.score.defend = 2;
    match.state.phase = 'over';
    match.state.phaseTime = 0;
    match.state.overReason = 'Site A secured — spike detonated.';
    const site = SITES.A;
    fx.showSpike(site.x, site.z, true);
    heroBody.position.set(-10, 0, -6);
    advance(10);
    lookAtPoint(new THREE.Vector3(site.x, 0.5, site.z));
    ui.setScore(3, 2, 4);
    ui.banner('ROUND WON', 'Site A secured — spike detonated.', 'aurum');
    advance(6);
  }
  ui.setScore(match.state.score.attack, match.state.score.defend, match.state.round);
  ui.setAmmo(arsenal.state.mag, arsenal.state.reserve, arsenal.def().name);
  ui.setHealth(session.hp);
  ui.setMoney(purse.state.money);
  if (name === 'end') ui.setBombStatus('SPIKE DETONATED — SITE A SECURED');
  paintTwice();
}

// Render twice so the frame is settled, then freeze and signal the capture.
function paintTwice() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    placeCamera();
    gl.render(stage, cam);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      held = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  cam.aspect = window.innerWidth / window.innerHeight;
  cam.updateProjectionMatrix();
  gl.setSize(window.innerWidth, window.innerHeight);
});

ui.onPlay(() => {
  if (shotName) return;
  playing = true;
  if (match.state.matchOver) {
    newMatch();
    ui.hideOverlay();
    controls.requestLock();
    return;
  }
  sfx.unlock();
  controls.requestLock();
});
ui.onBuy((id) => purchase(id));
// Clicking the canvas re-locks the pointer when play is underway (e.g. after
// closing the buy menu, where a keydown lock request can be refused).
gl.domElement.addEventListener('click', () => {
  if (!shotName && playing && !controls.state.locked && !ui.buyOpen() && session.alive && !match.state.matchOver) {
    controls.requestLock();
  }
});


// Debug hook for automated play-tests (a read-only state snapshot).
window.__debug = {
  state() {
    return {
      phase: match.state.phase,
      round: match.state.round,
      timer: Math.round(match.state.timer * 10) / 10,
      score: { ...match.state.score },
      player: { hp: session.hp, alive: session.alive, pos: [Math.round(heroBody.position.x * 10) / 10, Math.round(heroBody.position.z * 10) / 10], money: purse.state.money },
      bots: squad.list.map((b) => ({ name: b.name, team: b.team, alive: b.alive, hp: b.health, state: b.state, pos: [Math.round(b.pos.x * 10) / 10, Math.round(b.pos.z * 10) / 10] })),
      bomb: { planted: match.state.bomb.planted, carrier: match.state.bomb.carrier },
    };
  },
};

newMatch();
ui.setAmmo(arsenal.state.mag, arsenal.state.reserve, arsenal.def().name);
ui.setHealth(100);
ui.setMoney(purse.state.money);
ui.setScore(0, 0, 1);
ui.setGrenades(0, 0, 'frag');
placeCamera();
if (shotName) stageShot(shotName);
else {
  ui.showOverlay('start');
  requestAnimationFrame(loop);
}
