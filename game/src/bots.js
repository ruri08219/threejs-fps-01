// Bots: 3 AURUM teammates, 4 VANTA defenders. Each bot is a small state machine —
// route, hold, combat, plant, defuse — with waypoints, line-of-sight checks,
// reaction delay, burst fire with aim error, and hearing: a nearby gunshot pulls
// bots to investigate. Movement is a 2D circle against the world's colliders.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WEAPONS } from './weapons.js';
import { SPAWNS, ROUTES } from './world.js';

const TEAM_COLOUR = { attack: PALETTE.accent, defend: PALETTE.teal };
const NAMES = {
  attack: ['Kestrel', 'Dune', 'Sable'],
  defend: ['Ghost', 'Wraith', 'Havoc', 'Nomad'],
};
const BOT_SPEED = 3.6;
const RADIUS = 0.4;

export function createBots(scene, colliders, random) {
  const walls2d = [];
  for (const box of colliders) {
    if (box.max.y < 0.4 || box.min.y > 1.6) continue;
    walls2d.push({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z });
  }
  const hitMeshes = [];
  const list = [];

  function buildBody(team) {
    const group = new THREE.Group();
    const vest = new THREE.MeshStandardMaterial({ color: new THREE.Color(TEAM_COLOUR[team]), roughness: 0.6, metalness: 0.05 });
    const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.85 });
    const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.6 });
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.62, 0.2), dark);
    legL.position.set(-0.13, 0.31, 0);
    const legR = legL.clone();
    legR.position.x = 0.13;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.66, 0.3), vest);
    torso.position.y = 0.98;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), skin);
    head.position.y = 1.52;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.34), vest);
    band.position.y = 1.6;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.55), dark);
    gun.position.set(0.2, 1.15, -0.3);
    for (const mesh of [legL, legR, torso, head, band, gun]) {
      mesh.castShadow = true;
      group.add(mesh);
    }
    return { group, legL, legR, torso, head, gun };
  }

  function makeBot(id, team, name) {
    const body = buildBody(team);
    scene.add(body.group);
    const bot = {
      id, team, name, ...body,
      pos: body.group.position,
      yaw: 0, health: 100, alive: true, fall: 0,
      weapon: team === 'defend' ? WEAPONS.vk47 : WEAPONS.vk47,
      mag: 30, reserve: 90,
      route: [], routeIndex: 0, holdPos: null,
      state: 'route', stateTime: 0,
      target: null, lastSeen: new THREE.Vector3(), lastSeenAt: -99,
      reactionAt: 0, burstLeft: 0, burstGap: 0, nextShotAt: 0,
      strafeDir: 1, strafeUntil: 0, blindUntil: 0,
      plantProgress: 0, defuseProgress: 0,
      carrier: false, walkPhase: random() * 6,
      accuracy: 0.55 + random() * 0.25, reaction: 0.32 + random() * 0.28,
      investigate: null,
    };
    body.torso.userData.bot = bot;
    body.torso.userData.part = 'torso';
    body.head.userData.bot = bot;
    body.head.userData.part = 'head';
    hitMeshes.push(body.torso, body.head);
    list.push(bot);
    return bot;
  }

  for (let i = 0; i < 3; i += 1) makeBot(`a${i}`, 'attack', NAMES.attack[i]);
  for (let i = 0; i < 4; i += 1) makeBot(`d${i}`, 'defend', NAMES.defend[i]);

  function blocked(x, z) {
    if (x < -19.4 || x > 19.4 || z < -17.4 || z > 17.4) return true;
    for (const w of walls2d) {
      if (x > w.minX - RADIUS && x < w.maxX + RADIUS && z > w.minZ - RADIUS && z < w.maxZ + RADIUS) return true;
    }
    return false;
  }
  function move(bot, dx, dz, dt) {
    let nx = bot.pos.x + dx * dt;
    let nz = bot.pos.z + dz * dt;
    if (!blocked(nx, bot.pos.z)) bot.pos.x = nx;
    if (!blocked(bot.pos.x, nz)) bot.pos.z = nz;
    // Separation from other bots.
    for (const other of list) {
      if (other === bot || !other.alive) continue;
      const ox = bot.pos.x - other.pos.x;
      const oz = bot.pos.z - other.pos.z;
      const d2 = ox * ox + oz * oz;
      if (d2 > 0.01 && d2 < 0.64) {
        const d = Math.sqrt(d2);
        bot.pos.x += (ox / d) * (0.8 - d) * 0.5;
        bot.pos.z += (oz / d) * (0.8 - d) * 0.5;
      }
    }
  }
  function faceToward(bot, x, z, dt, rate = 6) {
    const want = Math.atan2(-(x - bot.pos.x), -(z - bot.pos.z));
    let diff = want - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += Math.max(-rate * dt, Math.min(rate * dt, diff));
  }

  function spawnRound(roundNumber) {
    const attackPlans = [ROUTES.attackA, ROUTES.attackB, ROUTES.attackMid, ROUTES.attackA, ROUTES.attackB];
    const defendPlans = [ROUTES.defendA, ROUTES.defendB, ROUTES.defendMid, ROUTES.holdB];
    const aShift = (roundNumber * 2) % 3;
    const dShift = roundNumber % 2;
    for (const bot of list) {
      bot.alive = true;
      bot.health = 100;
      bot.fall = 0;
      bot.group.rotation.set(0, 0, 0);
      bot.group.position.y = 0;
      bot.weapon = WEAPONS.vk47;
      bot.mag = 30;
      bot.reserve = 90;
      bot.carrier = false;
      bot.state = 'route';
      bot.stateTime = 0;
      bot.target = null;
      bot.investigate = null;
      bot.plantProgress = 0;
      bot.defuseProgress = 0;
      bot.blindUntil = 0;
      if (bot.team === 'attack') {
        const spawn = SPAWNS.attack[list.indexOf(bot)];
        bot.pos.set(spawn[0], 0, spawn[1]);
        bot.yaw = 0;
        const plan = attackPlans[(list.indexOf(bot) + aShift) % 3];
        bot.route = plan.map(([x, z]) => ({ x, z }));
        bot.routeIndex = 0;
      } else {
        const idx = list.indexOf(bot) - 3;
        const spawn = SPAWNS.defend[idx];
        bot.pos.set(spawn[0], 0, spawn[1]);
        bot.yaw = Math.PI;
        const plan = defendPlans[(idx + dShift) % defendPlans.length];
        bot.route = plan.map(([x, z]) => ({ x, z }));
        bot.routeIndex = 0;
      }
    }
  }

  function eyeOf(bot) {
    return { x: bot.pos.x, y: 1.52, z: bot.pos.z };
  }

  function step(dt, ctx) {
    const now = ctx.time;
    for (const bot of list) {
      if (!bot.alive) {
        bot.fall = Math.min(1, bot.fall + dt / 0.4);
        bot.group.rotation.x = -bot.fall * 1.45;
        bot.group.position.y = -bot.fall * 0.08;
        continue;
      }
      const blind = now < bot.blindUntil;
      // --- Perception, staggered by bot id so not every bot raycasts every tick.
      const sense = ((now * 10 + list.indexOf(bot)) | 0) % 2 === 0;
      if (sense && !blind) {
        let best = null;
        let bestDist = 42;
        const candidates = [];
        if (ctx.player.alive && ctx.player.team !== bot.team) candidates.push({ kind: 'player', x: ctx.player.pos.x, y: ctx.player.pos.y + ctx.player.eye, z: ctx.player.pos.z });
        for (const other of list) {
          if (other !== bot && other.alive && other.team !== bot.team) {
            candidates.push({ kind: 'bot', bot: other, x: other.pos.x, y: 1.2, z: other.pos.z });
          }
        }
        for (const cand of candidates) {
          const dx = cand.x - bot.pos.x;
          const dy = cand.y - 1.52;
          const dz = cand.z - bot.pos.z;
          const dist = Math.hypot(dx, dy, dz);
          if (dist > bestDist) continue;
          if (ctx.canSee(bot.pos.x, 1.52, bot.pos.z, cand.x, cand.y, cand.z)) {
            best = cand;
            bestDist = dist;
          }
        }
        if (best) {
          if (bot.target !== best.kind && !(bot.target && bot.target.kind === best.kind && bot.target.bot === best.bot)) {
            bot.reactionAt = now + bot.reaction;
          }
          bot.target = best;
          bot.lastSeen.set(best.x, best.y, best.z);
          bot.lastSeenAt = now;
          if (bot.state !== 'combat') {
            bot.state = 'combat';
            bot.stateTime = 0;
            bot.burstLeft = 0;
          }
        } else if (bot.target && now - bot.lastSeenAt > 1.5) {
          bot.target = null;
          if (bot.state === 'combat') {
            bot.state = 'route';
            bot.stateTime = 0;
            if (bot.investigate === null) bot.investigate = { x: bot.lastSeen.x, z: bot.lastSeen.z };
          }
        }
      }
      if (blind) bot.target = null;

      // --- Bomb duties.
      if (bot.team === 'attack' && bot.carrier && !ctx.bomb.planted && ctx.phase === 'live' && !bot.target) {
        const site = ctx.bomb.targetSite;
        const dx = site.x - bot.pos.x;
        const dz = site.z - bot.pos.z;
        if (Math.hypot(dx, dz) < site.r) {
          if (bot.state !== 'plant') {
            bot.state = 'plant';
            bot.stateTime = 0;
            bot.plantProgress = 0;
          }
          bot.plantProgress += dt;
          faceToward(bot, site.x, site.z, dt);
          if (bot.plantProgress >= 3) {
            bot.state = 'route';
            ctx.onPlanted(site.key);
          }
          continue;
        }
      }
      if (bot.team === 'defend' && ctx.bomb.planted && ctx.phase === 'planted' && !bot.target) {
        const site = ctx.bomb.site;
        const dx = site.x - bot.pos.x;
        const dz = site.z - bot.pos.z;
        if (Math.hypot(dx, dz) < site.r + 0.5) {
          if (bot.state !== 'defuse') {
            bot.state = 'defuse';
            bot.stateTime = 0;
            bot.defuseProgress = 0;
          }
          bot.defuseProgress += dt;
          faceToward(bot, site.x, site.z, dt);
          ctx.defuseProgress = Math.max(ctx.defuseProgress, bot.defuseProgress / 5);
          if (bot.defuseProgress >= 5) {
            bot.state = 'route';
            ctx.onDefused();
          }
          continue;
        }
      }

      // --- Movement and fire.
      const speed = blind ? 1.2 : BOT_SPEED;
      let moving = false;
      if (bot.state === 'combat' && bot.target) {
        const tx = bot.target.x;
        const tz = bot.target.z;
        faceToward(bot, tx, tz, dt, 8);
        const dist = Math.hypot(tx - bot.pos.x, tz - bot.pos.z);
        const want = dist > 20 ? 1 : dist < 7 ? -1 : 0;
        if (now > bot.strafeUntil) {
          bot.strafeDir = random() < 0.5 ? -1 : 1;
          bot.strafeUntil = now + 0.7 + random() * 0.9;
        }
        const fx = -Math.sin(bot.yaw);
        const fz = -Math.cos(bot.yaw);
        const sx = Math.cos(bot.yaw);
        const sz = -Math.sin(bot.yaw);
        const mx = fx * want + sx * bot.strafeDir * 0.7;
        const mz = fz * want + sz * bot.strafeDir * 0.7;
        const len = Math.hypot(mx, mz) || 1;
        move(bot, (mx / len) * speed, (mz / len) * speed, dt);
        moving = true;
        // Burst fire once reacted.
        if (now >= bot.reactionAt && bot.nextShotAt <= now) {
          if (bot.burstLeft <= 0) {
            bot.burstLeft = 3 + ((random() * 3) | 0);
            bot.nextShotAt = now + 0.45 + random() * 0.7;
          } else if (bot.mag > 0) {
            bot.burstLeft -= 1;
            bot.nextShotAt = now + bot.weapon.gap * 1.15;
            bot.mag -= 1;
            const err = (blind ? 0.12 : 0.016 + bestDistError(dist, bot.accuracy)) * (moving ? 1.6 : 1);
            const from = eyeOf(bot);
            const dir = {
              x: (tx - from.x) / dist + (random() * 2 - 1) * err,
              y: (bot.lastSeen.y - from.y) / dist + (random() * 2 - 1) * err,
              z: (tz - from.z) / dist + (random() * 2 - 1) * err,
            };
            const dl = Math.hypot(dir.x, dir.y, dir.z) || 1;
            ctx.shootFrom(bot, from, { x: dir.x / dl, y: dir.y / dl, z: dir.z / dl });
          } else {
            bot.mag = bot.weapon.mag;
            bot.reserve = Math.max(0, bot.reserve - bot.weapon.mag);
            bot.nextShotAt = now + bot.weapon.reloadTime;
          }
        }
      } else if (bot.state === 'plant' || bot.state === 'defuse') {
        // handled above; stand still.
      } else {
        // Route following: investigate first, then the assigned route.
        let goal = null;
        if (bot.investigate) goal = bot.investigate;
        else if (bot.routeIndex < bot.route.length) goal = bot.route[bot.routeIndex];
        else if (bot.holdPos) goal = bot.holdPos;
        if (goal) {
          const dx = goal.x - bot.pos.x;
          const dz = goal.z - bot.pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 0.7) {
            if (bot.investigate) bot.investigate = null;
            else bot.routeIndex += 1;
          } else {
            faceToward(bot, goal.x, goal.z, dt);
            move(bot, (dx / dist) * speed, (dz / dist) * speed, dt);
            moving = true;
          }
        } else {
          // Hold: slow scan.
          bot.yaw += Math.sin(now * 0.5 + list.indexOf(bot)) * dt * 0.4;
        }
      }
      bot.stateTime += dt;
      // Walk animation.
      if (moving) {
        bot.walkPhase += dt * 9;
        const swing = Math.sin(bot.walkPhase) * 0.45;
        bot.legL.rotation.x = swing;
        bot.legR.rotation.x = -swing;
      } else {
        bot.legL.rotation.x *= 0.9;
        bot.legR.rotation.x *= 0.9;
      }
      bot.group.rotation.y = bot.yaw;
    }
  }

  function bestDistError(dist, accuracy) {
    return (1 - accuracy) * 0.03 + dist * 0.0009;
  }

  function onShotFired(pos, team) {
    for (const bot of list) {
      if (!bot.alive || bot.team === team || bot.state === 'combat') continue;
      const d = Math.hypot(pos.x - bot.pos.x, pos.z - bot.pos.z);
      if (d < 26) bot.investigate = { x: pos.x, z: pos.z };
    }
  }

  function aliveCount(team) {
    return list.filter((b) => b.alive && b.team === team).length;
  }

  function setCarrier(bot) {
    for (const b of list) if (b.team === 'attack') b.carrier = false;
    if (bot) bot.carrier = true;
  }

  return { list, hitMeshes, step, spawnRound, onShotFired, aliveCount, setCarrier, eyeOf };
}
