// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's
// rate. SANDLINE: 4v4 round-based tactical FPS — AURUM (you + 3 bots) attack, VANTA
// (4 bots) defend. Plant the spike at A or B, or eliminate the defenders; first to
// 5 rounds takes the match. ?shot=start|play|bomb|end with &seed=N sets up a
// deterministic frame for a capture, renders it twice, then freezes it and sets
// window.__shotReady.
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

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = shot ? mulberry32(seed) : Math.random;

// Reused temporaries: the hot loops allocate nothing.
const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();
const tmpDir = new THREE.Vector3();

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const audio = createAudio();
const effects = createEffects(scene);
const economy = createEconomy();
const rounds = createRounds();
const grenades = createGrenades(scene, world.colliders);
const bots = createBots(scene, world.colliders, random);
const hud = createHud();
const player = createPlayer(world.colliders);
const weapons = createWeapons(camera);
const input = createInput(renderer.domElement, onLockChange);

const raycaster = new THREE.Raycaster();
raycaster.far = 100;
const shootables = world.shootables.concat(bots.hitMeshes);

const body = player.state;
const game = {
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
let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let fovTarget = 74;

const botCtx = {
  time: 0,
  player: { pos: body.position, eye: 1.6, alive: true, team: 'attack' },
  bomb: rounds.state.bomb,
  phase: 'buy',
  defuseProgress: 0,
  canSee(x1, y1, z1, x2, y2, z2) {
    tmpVec.set(x2 - x1, y2 - y1, z2 - z1);
    const dist = tmpVec.length();
    if (dist < 0.01) return true;
    tmpVec.divideScalar(dist);
    raycaster.set(tmpVec2.set(x1, y1, z1), tmpVec);
    raycaster.far = dist - 0.3;
    return raycaster.intersectObjects(world.shootables, false).length === 0;
  },
  shootFrom(bot, from, dir) {
    fireHitscan(bot, from, dir, bot.weapon, 0);
  },
  onPlanted(siteKey) {
    doPlant('bot', siteKey);
  },
  onDefused() {
    finishRound('defend', 'Spike defused — site held.');
  },
};

function raySphere(origin, dir, cx, cy, cz, r) {
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
function fireHitscan(shooter, origin, dir, def, spread) {
  const isPlayer = shooter === 'player';
  const muzzle = tmpVec2;
  if (isPlayer) weapons.muzzleWorld(muzzle);
  else muzzle.set(origin.x + dir.x * 0.5, origin.y + dir.y * 0.5, origin.z + dir.z * 0.5);
  let hitPoint = null;
  let hitNormal = null;
  for (let p = 0; p < def.pellets; p += 1) {
    tmpDir.set(
      dir.x + (random() * 2 - 1) * spread,
      dir.y + (random() * 2 - 1) * spread,
      dir.z + (random() * 2 - 1) * spread,
    ).normalize();
    raycaster.set(tmpVec.set(origin.x, origin.y, origin.z), tmpDir);
    raycaster.far = 100;
    const hits = raycaster.intersectObjects(shootables, false);
    let bestDist = hits.length ? hits[0].distance : 100;
    let best = hits.length ? hits[0] : null;
    let playerHit = null;
    if (!isPlayer && game.alive) {
      const eye = body.position.y + body.eye;
      const tHead = raySphere(tmpVec, tmpDir, body.position.x, eye + 0.02, body.position.z, 0.2);
      const tTorso = raySphere(tmpVec, tmpDir, body.position.x, body.position.y + 1.0, body.position.z, 0.45);
      const t = tHead > 0 ? tHead : tTorso;
      if (t > 0 && t < bestDist) {
        playerHit = { dist: t, head: tHead > 0 && tHead < (tTorso > 0 ? tTorso : Infinity) };
        bestDist = t;
      }
    }
    const end = tmpVec.set(origin.x, origin.y, origin.z).addScaledVector(tmpDir, bestDist);
    effects.tracer(muzzle, end);
    if (playerHit) {
      const dmg = Math.round(def.damage * (playerHit.head ? def.headMult : 1) * falloff(bestDist, def.falloff));
      damagePlayer(dmg, origin, playerHit.head);
      hitPoint = end;
    } else if (best && best.object.userData.bot) {
      const bot = best.object.userData.bot;
      const head = best.object.userData.part === 'head';
      const dmg = Math.round(def.damage * (head ? def.headMult : 1) * falloff(bestDist, def.falloff));
      damageBot(bot, dmg, head, shooter);
      hitPoint = best.point;
      hitNormal = best.face ? best.face.normal : null;
      if (isPlayer) hud.hitMarker(!bot.alive, head);
    } else if (best) {
      hitPoint = best.point;
      hitNormal = best.face ? best.face.normal : null;
      effects.impact(best.point, hitNormal || tmpVec.set(0, 1, 0));
    }
  }
  const team = isPlayer ? 'attack' : shooter.team;
  bots.onShotFired(muzzle, team);
  return hitPoint;
}

function falloff(dist, keep) {
  return keep + (1 - keep) * Math.max(0, 1 - dist / 55);
}

function damageBot(bot, amount, head, attacker) {
  if (!bot.alive) return;
  bot.health -= amount;
  if (bot.health > 0) {
    if (attacker === 'player') audio.hit(head);
    return;
  }
  bot.alive = false;
  bot.health = 0;
  bot.fall = 0;
  if (attacker === 'player') {
    game.kills += 1;
    economy.kill();
    audio.kill();
    hud.killFeed(`You ▸ ${bot.name}`, 'aurum');
    hud.setMoney(economy.state.money);
  } else if (attacker && attacker !== 'player') {
    hud.killFeed(`${attacker.name} ▸ ${bot.name}`, attacker.team);
  }
  if (bot.carrier) {
    const next = bots.list.find((b) => b.alive && b.team === 'attack');
    bots.setCarrier(next || null);
    if (next) rounds.state.bomb.carrier = 'bot';
  }
  checkElimination();
}

function damagePlayer(amount, from, head) {
  if (!game.alive) return;
  game.hp -= amount;
  game.plantProgress = 0;
  hud.damageFlash();
  audio.hurt();
  hud.setHealth(game.hp);
  if (game.hp > 0) return;
  game.hp = 0;
  game.alive = false;
  game.deaths += 1;
  botCtx.player.alive = false;
  if (document.pointerLockElement) document.exitPointerLock();
  hud.banner('YOU ARE DOWN', 'Your team fights on — spectating a teammate.', 'vanta');
  if (rounds.state.bomb.carrier === 'player') {
    const next = bots.list.find((b) => b.alive && b.team === 'attack');
    bots.setCarrier(next || null);
    if (next) rounds.state.bomb.carrier = 'bot';
  }
  checkElimination();
}

function checkElimination() {
  const phase = rounds.state.phase;
  if (phase !== 'live' && phase !== 'planted') return;
  const aAlive = bots.aliveCount('attack') + (game.alive ? 1 : 0);
  const dAlive = bots.aliveCount('defend');
  if (aAlive === 0 && !rounds.state.bomb.planted) finishRound('defend', 'AURUM eliminated.');
  else if (dAlive === 0 && !rounds.state.bomb.planted) finishRound('attack', 'VANTA eliminated.');
}

function doPlant(who, siteKey) {
  if (rounds.state.phase !== 'live') return;
  rounds.plant(siteKey);
  const site = rounds.state.bomb.site;
  effects.showSpike(site.x, site.z, true);
  audio.plantBeep();
  hud.banner('SPIKE PLANTED', `Fuse running — ${siteKey} site. Hold it.`, 'aurum');
  hud.killFeed(who === 'player' ? 'You planted the spike' : `${who} planted the spike`, 'aurum');
}

function finishRound(winner, reason) {
  if (!rounds.endRound(winner, reason)) return;
  settleRound(winner, reason);
}

function settleRound(winner, reason) {
  const won = winner === 'attack';
  economy.roundEnd(won, rounds.state.bomb.planted);
  effects.showSpike(0, 0, false);
  if (won) audio.roundWin();
  else audio.roundLose();
  hud.banner(won ? 'ROUND WON' : 'ROUND LOST', reason, won ? 'aurum' : 'vanta');
  hud.setMoney(economy.state.money);
  hud.setScore(rounds.state.score.attack, rounds.state.score.defend, rounds.state.round);
  game.settled = true;
}

function respawnPlayer() {
  const spawn = SPAWNS.attack[1];
  body.position.set(spawn[0], 0, spawn[1]);
  body.velocity.set(0, 0, 0);
  body.yaw = 0;
  body.pitch = 0;
  body.eye = 1.6;
  game.hp = 100;
  game.alive = true;
  game.plantProgress = 0;
  game.flashBlind = 0;
  game.spectate = null;
  botCtx.player.alive = true;
  weapons.refill();
  hud.setHealth(100);
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, weapons.def().name);
}

function startMatch() {
  economy.reset();
  rounds.reset();
  game.kills = 0;
  game.deaths = 0;
  game.ownedPrimary = null;
  game.grenades = { frag: 0, flash: 0 };
  game.selectedGrenade = 'frag';
  game.settled = false;
  game.matchShown = false;
  weapons.equip('p9');
  grenades.clear();
  effects.showSpike(0, 0, false);
  startRound(1);
}

function startRound(number) {
  rounds.startRound(number, random);
  bots.spawnRound(number);
  respawnPlayer();
  game.settled = false;
  hud.setScore(rounds.state.score.attack, rounds.state.score.defend, number);
  hud.setMoney(economy.state.money);
  hud.setBombStatus('SPIKE ON YOU — PLANT AT A OR B');
  hud.banner(`ROUND ${number}`, `Plant the spike at ${rounds.state.bomb.targetSite.key} — or clear VANTA.`, 'aurum');
}

function buy(id) {
  if (rounds.state.phase !== 'buy') return;
  if (WEAPONS[id]) {
    const def = WEAPONS[id];
    if (game.ownedPrimary === id) return;
    if (!economy.spend(def.price)) return;
    game.ownedPrimary = id;
    weapons.equip(id);
    audio.buy();
  } else if (GRENADES[id]) {
    if (game.grenades[id] >= 2) return;
    if (!economy.spend(GRENADES[id].price)) return;
    game.grenades[id] += 1;
    audio.buy();
  }
  hud.setMoney(economy.state.money);
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, weapons.def().name);
  refreshBuy();
}

function refreshBuy() {
  hud.refreshBuy((id) => {
    if (WEAPONS[id]) return economy.canAfford(WEAPONS[id].price) && game.ownedPrimary !== id;
    return economy.canAfford(GRENADES[id].price) && game.grenades[id] < 2;
  });
}

function throwGrenade() {
  const kind = game.selectedGrenade;
  if (game.grenades[kind] <= 0 || game.throwCooldown > 0 || !game.alive) return;
  game.grenades[kind] -= 1;
  game.throwCooldown = 0.5;
  camera.getWorldDirection(tmpDir);
  tmpVec.copy(camera.position).addScaledVector(tmpDir, 0.5);
  grenades.throwGrenade(kind, tmpVec, tmpDir);
  hud.setGrenades(game.grenades.frag, game.grenades.flash, game.selectedGrenade);
}

function onFrag(pos) {
  const distToPlayer = Math.hypot(pos.x - body.position.x, pos.y - body.position.y, pos.z - body.position.z);
  audio.explosion(distToPlayer);
  effects.impact(pos, tmpVec.set(0, 1, 0));
  for (const bot of bots.list) {
    if (!bot.alive) continue;
    const d = Math.hypot(pos.x - bot.pos.x, pos.z - bot.pos.z);
    if (d > grenades.FRAG_RADIUS) continue;
    const los = botCtx.canSee(pos.x, pos.y + 0.3, pos.z, bot.pos.x, 1.2, bot.pos.z);
    const dmg = Math.round(grenades.FRAG_DAMAGE * (1 - d / grenades.FRAG_RADIUS) * (los ? 1 : 0.5));
    damageBot(bot, dmg, false, 'player');
  }
  if (game.alive && distToPlayer < grenades.FRAG_RADIUS) {
    const los = botCtx.canSee(pos.x, pos.y + 0.3, pos.z, body.position.x, body.position.y + 1.2, body.position.z);
    damagePlayer(Math.round(grenades.FRAG_DAMAGE * (1 - distToPlayer / grenades.FRAG_RADIUS) * (los ? 1 : 0.5)), pos, false);
  }
}

function onFlash(pos) {
  const distToPlayer = Math.hypot(pos.x - body.position.x, pos.y - body.position.y, pos.z - body.position.z);
  audio.flashPop(distToPlayer);
  for (const bot of bots.list) {
    if (!bot.alive) continue;
    const d = Math.hypot(pos.x - bot.pos.x, pos.z - bot.pos.z);
    if (d > grenades.FLASH_RADIUS) continue;
    if (!botCtx.canSee(pos.x, pos.y + 0.3, pos.z, bot.pos.x, 1.5, bot.pos.z)) continue;
    const fx = -Math.sin(bot.yaw);
    const fz = -Math.cos(bot.yaw);
    const toFlash = Math.hypot(pos.x - bot.pos.x, pos.z - bot.pos.z) || 1;
    const facing = (fx * (pos.x - bot.pos.x) + fz * (pos.z - bot.pos.z)) / toFlash;
    if (facing > -0.1 || d < 4) bot.blindUntil = elapsed + grenades.FLASH_BLIND_SECONDS;
  }
  if (game.alive && distToPlayer < grenades.FLASH_RADIUS) {
    camera.getWorldDirection(tmpDir);
    const toFlash = tmpVec.set(pos.x - camera.position.x, pos.y - camera.position.y, pos.z - camera.position.z);
    const d = toFlash.length() || 1;
    toFlash.divideScalar(d);
    const facing = tmpDir.dot(toFlash);
    if (facing > 0.2 && botCtx.canSee(pos.x, pos.y + 0.3, pos.z, camera.position.x, camera.position.y, camera.position.z)) {
      game.flashBlind = Math.min(1, 1.3 - distToPlayer / 20);
    }
  }
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    audio.unlock();
    hud.hideOverlay();
    hud.showBuy(false);
  } else if (!rounds.state.matchOver) {
    hud.showOverlay(started ? 'paused' : 'start');
  }
}

function syncCamera() {
  if (!game.alive) {
    const mate = bots.list.find((b) => b.alive && b.team === 'attack');
    if (mate) {
      camera.position.set(mate.pos.x, 1.55, mate.pos.z);
      camera.rotation.set(-0.08, mate.yaw, 0, 'YXZ');
      return;
    }
  }
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

function playerShoot() {
  if (!weapons.takeRound()) {
    audio.dryFire();
    weapons.reload();
    return;
  }
  camera.getWorldDirection(tmpDir);
  fireHitscan('player', camera.position, tmpDir, weapons.def(), weapons.spread(player.groundSpeed()));
  weapons.pullTrigger();
  player.recoil(weapons.def().kick * 0.16 + random() * 0.002, (random() * 2 - 1) * 0.003);
  if (weapons.def().id === 'breacher') audio.shotgun(0);
  else if (weapons.def().id === 'longbow') audio.sniper(0);
  else audio.shot(0);
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, weapons.def().name);
}

function step(dt) {
  // The match does not tick until the player clicks play (shot mode drives
  // the sim itself, so it is exempt). Before that the scene just renders.
  if (!started && !shot) return;
  elapsed += dt;
  botCtx.time = elapsed;
  const phase = rounds.state.phase;
  botCtx.phase = phase;

  // Round clock. rounds.step may end the round on a timer (it scores itself);
  // settle the economy/banner exactly once, whoever ended it.
  const prevPhase = phase;
  const scoreBefore = { a: rounds.state.score.attack, d: rounds.state.score.defend };
  rounds.step(dt);
  if (rounds.state.phase === 'over' && !game.settled) {
    let winner = null;
    if (rounds.state.score.attack > scoreBefore.a) winner = 'attack';
    else if (rounds.state.score.defend > scoreBefore.d) winner = 'defend';
    else winner = rounds.state.overReason.includes('detonat') ? 'attack' : 'defend';
    settleRound(winner, rounds.state.overReason);
  }
  if (rounds.state.phase === 'over' && rounds.state.phaseTime >= 4) {
    if (rounds.state.matchOver) {
      if (!game.matchShown) {
        game.matchShown = true;
        if (document.pointerLockElement) document.exitPointerLock();
        hud.showOverlay('start', `Match over — AURUM ${rounds.state.score.attack} : ${rounds.state.score.defend} VANTA. You scored ${game.kills} eliminations. Click to play again.`);
      }
    } else {
      startRound(rounds.state.round + 1);
    }
  }
  if (prevPhase === 'buy' && rounds.state.phase === 'live') {
    hud.showBuy(false);
    hud.banner('GO', `Plant at ${rounds.state.bomb.targetSite.key} — or clear the site.`, 'aurum');
  }

  // Player.
  const keys = input.state.keys;
  if (game.alive && !hud.buyOpen()) {
    player.step(dt, keys);
    if (player.groundSpeed() > 0.5 && player.state.onGround) {
      game.stepAccum += player.groundSpeed() * dt;
      if (game.stepAccum > 2.4) {
        game.stepAccum = 0;
        audio.step();
      }
    }
  }
  weapons.step(dt);
  game.throwCooldown = Math.max(0, game.throwCooldown - dt);
  if (game.flashBlind > 0) {
    game.flashBlind = Math.max(0, game.flashBlind - dt / 2.2);
    hud.flashWhite(game.flashBlind);
  }

  // Planting (player carries the spike).
  if (game.alive && phase === 'live' && rounds.state.bomb.carrier === 'player') {
    const site = rounds.state.bomb.targetSite;
    const d = Math.hypot(site.x - body.position.x, site.z - body.position.z);
    if (d < site.r && keys.has('KeyE')) {
      game.plantProgress += dt;
      hud.showProgress('PLANTING SPIKE', game.plantProgress / 3);
      if (game.plantProgress >= 3) {
        game.plantProgress = 0;
        hud.hideProgress();
        doPlant('player', site.key);
      }
    } else {
      if (game.plantProgress > 0) hud.hideProgress();
      game.plantProgress = Math.max(0, game.plantProgress - dt * 2);
    }
  } else if (game.plantProgress > 0) {
    hud.hideProgress();
    game.plantProgress = 0;
  }

  // Bots and grenades. Bots only act once the round is live — the buy phase
  // is freeze time: nobody shoots, nobody moves, nobody dies.
  if (phase === 'live' || phase === 'planted') bots.step(dt, botCtx);
  grenades.step(dt, { onFrag, onFlash });
  effects.step(dt);
  effects.spikePulse(elapsed);
  if (!rounds.state.bomb.planted) botCtx.defuseProgress = 0;
  else if (botCtx.defuseProgress > 0.01) hud.showProgress('SPIKE BEING DEFUSED', botCtx.defuseProgress);
  else if (game.plantProgress <= 0) hud.hideProgress();

  // Zoom.
  const wantZoom = input.state.aiming && weapons.def().id === 'longbow' && game.alive;
  weapons.setZoom(wantZoom);
  fovTarget = wantZoom ? 32 : 74;
  if (Math.abs(camera.fov - fovTarget) > 0.2) {
    camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
  }

  // HUD.
  hud.setTimer(rounds.state.timer, rounds.state.phase);
  hud.setAlive(bots.aliveCount('attack') + (game.alive ? 1 : 0), 4, bots.aliveCount('defend'), 4);
  hud.setGrenades(game.grenades.frag, game.grenades.flash, game.selectedGrenade);
  hud.setCrosshair(6 + weapons.spread(player.groundSpeed()) * 3200 + player.groundSpeed() * 1.5);
  if (rounds.state.bomb.planted) {
    hud.setBombStatus(`SPIKE PLANTED — ${Math.ceil(rounds.state.timer)}s TO DETONATION`);
  } else if (rounds.state.bomb.carrier === 'player') {
    hud.setBombStatus('SPIKE ON YOU — PLANT AT A OR B');
  } else {
    const carrier = bots.list.find((b) => b.carrier);
    hud.setBombStatus(carrier ? `SPIKE WITH ${carrier.name.toUpperCase()}` : 'SPIKE LOST');
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    const sens = weapons.state.zoomed ? 0.5 : 1;
    player.look(look.x * sens, look.y * sens);
    for (const code of input.takePressed()) {
      if (code === 'KeyB' && rounds.state.phase === 'buy' && game.alive) {
        const open = !hud.buyOpen();
        hud.showBuy(open);
        refreshBuy();
        if (open && document.pointerLockElement) document.exitPointerLock();
        else if (!open) input.requestLock();
      } else if (code === 'KeyG') {
        throwGrenade();
      } else if (code === 'KeyQ') {
        game.selectedGrenade = game.selectedGrenade === 'frag' ? 'flash' : 'frag';
        hud.setGrenades(game.grenades.frag, game.grenades.flash, game.selectedGrenade);
      } else if (code === 'Digit1' && game.ownedPrimary) {
        weapons.equip(game.ownedPrimary);
        hud.setAmmo(weapons.state.mag, weapons.state.reserve, weapons.def().name);
      } else if (code === 'Digit2') {
        weapons.equip('p9');
        hud.setAmmo(weapons.state.mag, weapons.state.reserve, weapons.def().name);
      }
    }
    // Semi-auto guns fire once per click; autos fire while held.
    const firingNow = input.state.firing && game.alive && !hud.buyOpen();
    if (firingNow && weapons.ready() && (weapons.def().auto || !game.wasFiring)) playerShoot();
    game.wasFiring = firingNow;
    if (input.state.keys.has('KeyR')) weapons.reload();
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBanner();
  hud.showBuy(false);
  startMatch();
  rounds.state.phase = 'live';
  rounds.state.phaseTime = 0;
  rounds.state.timer = 100;
  body.position.set(-1, 0, 14);
  body.yaw = 0.12;
  body.pitch = 0.01;
  settle(30);
  if (name === 'start') {
    rounds.state.phase = 'buy';
    rounds.state.timer = 15;
    body.position.set(-1, 0, 14);
    body.yaw = 0.1;
    body.pitch = 0.02;
    syncCamera();
    hud.showOverlay('start');
    hud.setTimer(15, 'buy');
  } else if (name === 'play') {
    const foe = bots.list.find((b) => b.team === 'defend');
    foe.pos.set(0, 0, -2);
    foe.yaw = Math.PI;
    foe.group.rotation.y = Math.PI;
    const mate = bots.list.find((b) => b.team === 'attack');
    mate.pos.set(-3, 0, 5);
    mate.yaw = -0.3;
    body.position.set(0, 0, 8);
    settle(10);
    aimAt(new THREE.Vector3(foe.pos.x, 1.2, foe.pos.z));
    playerShoot();
    settle(4);
    hud.setAmmo(weapons.state.mag, weapons.state.reserve, weapons.def().name);
    hud.hideBanner();
  } else if (name === 'bomb') {
    const site = SITES.A;
    rounds.state.bomb.targetSite = site;
    site.key = 'A';
    body.position.set(-12.5, 0, -10);
    settle(10);
    aimAt(new THREE.Vector3(site.x, 1.2, site.z));
    const foe = bots.list.find((b) => b.team === 'defend');
    foe.pos.set(-16, 0, -13.5);
    foe.yaw = 2.4;
    settle(6);
    game.plantProgress = 1.9;
    hud.showProgress('PLANTING SPIKE', 1.9 / 3);
    hud.hideBanner();
  } else {
    // end: round won at A, spike down, banner up.
    rounds.state.round = 4;
    rounds.state.score.attack = 3;
    rounds.state.score.defend = 2;
    rounds.state.phase = 'over';
    rounds.state.phaseTime = 0;
    rounds.state.overReason = 'Site A secured — spike detonated.';
    const site = SITES.A;
    effects.showSpike(site.x, site.z, true);
    body.position.set(-10, 0, -6);
    settle(10);
    aimAt(new THREE.Vector3(site.x, 0.5, site.z));
    hud.setScore(3, 2, 4);
    hud.banner('ROUND WON', 'Site A secured — spike detonated.', 'aurum');
    settle(6);
  }
  hud.setScore(rounds.state.score.attack, rounds.state.score.defend, rounds.state.round);
  hud.setAmmo(weapons.state.mag, weapons.state.reserve, weapons.def().name);
  hud.setHealth(game.hp);
  hud.setMoney(economy.state.money);
  if (name === 'end') hud.setBombStatus('SPIKE DETONATED — SITE A SECURED');
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

hud.onPlay(() => {
  if (shot) return;
  started = true;
  if (rounds.state.matchOver) {
    startMatch();
    hud.hideOverlay();
    input.requestLock();
    return;
  }
  audio.unlock();
  input.requestLock();
});
hud.onBuy((id) => buy(id));
// Clicking the canvas re-locks the pointer when play is underway (e.g. after
// closing the buy menu, where a keydown lock request can be refused).
renderer.domElement.addEventListener('click', () => {
  if (!shot && started && !input.state.locked && !hud.buyOpen() && game.alive && !rounds.state.matchOver) {
    input.requestLock();
  }
});


// Debug hook for automated play-tests (read-only state snapshot).
window.__debug = {
  state() {
    return {
      phase: rounds.state.phase,
      round: rounds.state.round,
      timer: Math.round(rounds.state.timer * 10) / 10,
      score: { ...rounds.state.score },
      player: { hp: game.hp, alive: game.alive, pos: [Math.round(body.position.x * 10) / 10, Math.round(body.position.z * 10) / 10], money: economy.state.money },
      bots: bots.list.map((b) => ({ name: b.name, team: b.team, alive: b.alive, hp: b.health, state: b.state, pos: [Math.round(b.pos.x * 10) / 10, Math.round(b.pos.z * 10) / 10] })),
      bomb: { planted: rounds.state.bomb.planted, carrier: rounds.state.bomb.carrier },
    };
  },
};

startMatch();
hud.setAmmo(weapons.state.mag, weapons.state.reserve, weapons.def().name);
hud.setHealth(100);
hud.setMoney(economy.state.money);
hud.setScore(0, 0, 1);
hud.setGrenades(0, 0, 'frag');
syncCamera();
if (shot) runShot(shot);
else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
