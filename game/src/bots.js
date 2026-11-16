// Bots: 3 AURUM teammates, 4 VANTA defenders. Each bot is a small state machine
// — route, hold, combat, plant, defuse — with waypoints, line-of-sight checks,
// a reaction delay, burst fire with aim error, and hearing: a nearby gunshot
// pulls bots over to investigate. Movement is a 2D circle against the world's
// colliders, so bots slide along walls instead of getting stuck on them.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WEAPONS } from './weapons.js';
import { SPAWNS, ROUTES } from './world.js';

const TEAM_SHADE = { attack: PALETTE.accent, defend: PALETTE.teal };
const HANDLES = {
  attack: ['Kestrel', 'Dune', 'Sable'],
  defend: ['Ghost', 'Wraith', 'Havoc', 'Nomad'],
};
const PATROL_SPEED = 3.6;
const UNIT_RADIUS = 0.4;

export function createBots(scene, colliders, random) {
  // The 2D wall list for bot movement: only boxes that actually block a
  // walking body (tall enough to reach the torso, low enough to matter).
  const wallMap = [];
  for (const box of colliders) {
    if (box.max.y < 0.4 || box.min.y > 1.6) continue;
    wallMap.push({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z });
  }
  const targetMeshes = [];
  const roster = [];

  // A bot's visible body: legs, a team-coloured torso, a head with a band,
  // and a gun. Torso and head are the hitscan targets; the rest is dressing.
  function buildBot(team) {
    const group = new THREE.Group();
    const vestMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(TEAM_SHADE[team]), roughness: 0.6, metalness: 0.05 });
    const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.85 });
    const skinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.6 });
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.62, 0.2), darkMat);
    legL.position.set(-0.13, 0.31, 0);
    const legR = legL.clone();
    legR.position.x = 0.13;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.66, 0.3), vestMat);
    torso.position.y = 0.98;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), skinMat);
    head.position.y = 1.52;
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.34), vestMat);
    band.position.y = 1.6;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.55), darkMat);
    gun.position.set(0.2, 1.15, -0.3);
    for (const mesh of [legL, legR, torso, head, band, gun]) {
      mesh.castShadow = true;
      group.add(mesh);
    }
    return { group, legL, legR, torso, head, gun };
  }

  function addBot(id, team, name) {
    const body = buildBot(team);
    scene.add(body.group);
    const unit = {
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
    body.torso.userData.bot = unit;
    body.torso.userData.part = 'torso';
    body.head.userData.bot = unit;
    body.head.userData.part = 'head';
    targetMeshes.push(body.torso, body.head);
    roster.push(unit);
    return unit;
  }

  for (let i = 0; i < 3; i += 1) addBot(`a${i}`, 'attack', HANDLES.attack[i]);
  for (let i = 0; i < 4; i += 1) addBot(`d${i}`, 'defend', HANDLES.defend[i]);

  function walled(x, z) {
    if (x < -19.4 || x > 19.4 || z < -17.4 || z > 17.4) return true;
    for (const w of wallMap) {
      if (x > w.minX - UNIT_RADIUS && x < w.maxX + UNIT_RADIUS && z > w.minZ - UNIT_RADIUS && z < w.maxZ + UNIT_RADIUS) return true;
    }
    return false;
  }

  function glide(unit, dx, dz, dt) {
    const nextX = unit.pos.x + dx * dt;
    const nextZ = unit.pos.z + dz * dt;
    if (!walled(nextX, unit.pos.z)) unit.pos.x = nextX;
    if (!walled(unit.pos.x, nextZ)) unit.pos.z = nextZ;
    // Separation: bots push each other apart so they never stack in a doorway.
    for (const other of roster) {
      if (other === unit || !other.alive) continue;
      const pushX = unit.pos.x - other.pos.x;
      const pushZ = unit.pos.z - other.pos.z;
      const distSq = pushX * pushX + pushZ * pushZ;
      if (distSq > 0.01 && distSq < 0.64) {
        const gap = Math.sqrt(distSq);
        unit.pos.x += (pushX / gap) * (0.8 - gap) * 0.5;
        unit.pos.z += (pushZ / gap) * (0.8 - gap) * 0.5;
      }
    }
  }

  function face(unit, x, z, dt, turnRate = 6) {
    const heading = Math.atan2(-(x - unit.pos.x), -(z - unit.pos.z));
    let delta = heading - unit.yaw;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    unit.yaw += Math.max(-turnRate * dt, Math.min(turnRate * dt, delta));
  }

  // Round setup: fresh health, a shuffled route plan per round so the same
  // push does not repeat every round, and everyone back on their spawn.
  function spawnRound(roundNumber) {
    const attackRoutes = [ROUTES.attackA, ROUTES.attackB, ROUTES.attackMid, ROUTES.attackA, ROUTES.attackB];
    const defendRoutes = [ROUTES.defendA, ROUTES.defendB, ROUTES.defendMid, ROUTES.holdB];
    const attackShift = (roundNumber * 2) % 3;
    const defendShift = roundNumber % 2;
    for (const unit of roster) {
      unit.alive = true;
      unit.health = 100;
      unit.fall = 0;
      unit.group.rotation.set(0, 0, 0);
      unit.group.position.y = 0;
      unit.weapon = WEAPONS.vk47;
      unit.mag = 30;
      unit.reserve = 90;
      unit.carrier = false;
      unit.state = 'route';
      unit.stateTime = 0;
      unit.target = null;
      unit.investigate = null;
      unit.plantProgress = 0;
      unit.defuseProgress = 0;
      unit.blindUntil = 0;
      if (unit.team === 'attack') {
        const point = SPAWNS.attack[roster.indexOf(unit)];
        unit.pos.set(point[0], 0, point[1]);
        unit.yaw = 0;
        const routePlan = attackRoutes[(roster.indexOf(unit) + attackShift) % 3];
        unit.route = routePlan.map(([x, z]) => ({ x, z }));
        unit.routeIndex = 0;
      } else {
        const slot = roster.indexOf(unit) - 3;
        const point = SPAWNS.defend[slot];
        unit.pos.set(point[0], 0, point[1]);
        unit.yaw = Math.PI;
        const routePlan = defendRoutes[(slot + defendShift) % defendRoutes.length];
        unit.route = routePlan.map(([x, z]) => ({ x, z }));
        unit.routeIndex = 0;
      }
    }
  }

  function eyeAt(unit) {
    return { x: unit.pos.x, y: 1.52, z: unit.pos.z };
  }

  // Aim error grows with distance and with the shooter's own inaccuracy.
  function spreadFor(range, skill) {
    return (1 - skill) * 0.03 + range * 0.0009;
  }

  function step(dt, ctx) {
    const t = ctx.time;
    for (const unit of roster) {
      if (!unit.alive) {
        // The fall: the body tips back over 0.4 s and stays down.
        unit.fall = Math.min(1, unit.fall + dt / 0.4);
        unit.group.rotation.x = -unit.fall * 1.45;
        unit.group.position.y = -unit.fall * 0.08;
        continue;
      }
      const isBlind = t < unit.blindUntil;
      // --- Perception, staggered by bot id so not every bot raycasts on the
      // same tick. The player is checked first, then the enemy bots.
      const senseTick = ((t * 10 + roster.indexOf(unit)) | 0) % 2 === 0;
      if (senseTick && !isBlind) {
        let spotted = null;
        let nearest = 42;
        const foes = [];
        if (ctx.player.alive && ctx.player.team !== unit.team) foes.push({ kind: 'player', x: ctx.player.pos.x, y: ctx.player.pos.y + ctx.player.eye, z: ctx.player.pos.z });
        for (const other of roster) {
          if (other !== unit && other.alive && other.team !== unit.team) {
            foes.push({ kind: 'bot', bot: other, x: other.pos.x, y: 1.2, z: other.pos.z });
          }
        }
        for (const foe of foes) {
          const gapX = foe.x - unit.pos.x;
          const gapY = foe.y - 1.52;
          const gapZ = foe.z - unit.pos.z;
          const range = Math.hypot(gapX, gapY, gapZ);
          if (range > nearest) continue;
          if (ctx.canSee(unit.pos.x, 1.52, unit.pos.z, foe.x, foe.y, foe.z)) {
            spotted = foe;
            nearest = range;
          }
        }
        if (spotted) {
          if (unit.target !== spotted.kind && !(unit.target && unit.target.kind === spotted.kind && unit.target.bot === spotted.bot)) {
            unit.reactionAt = t + unit.reaction;
          }
          unit.target = spotted;
          unit.lastSeen.set(spotted.x, spotted.y, spotted.z);
          unit.lastSeenAt = t;
          if (unit.state !== 'combat') {
            unit.state = 'combat';
            unit.stateTime = 0;
            unit.burstLeft = 0;
          }
        } else if (unit.target && t - unit.lastSeenAt > 1.5) {
          // Lost sight: drop back to the route, but go look where the enemy
          // was last seen before resuming it.
          unit.target = null;
          if (unit.state === 'combat') {
            unit.state = 'route';
            unit.stateTime = 0;
            if (unit.investigate === null) unit.investigate = { x: unit.lastSeen.x, z: unit.lastSeen.z };
          }
        }
      }
      if (isBlind) unit.target = null;

      // --- Bomb duties. The carrier plants when it reaches the target site;
      // a defender defuses when it reaches a planted spike.
      if (unit.team === 'attack' && unit.carrier && !ctx.bomb.planted && ctx.phase === 'live' && !unit.target) {
        const objective = ctx.bomb.targetSite;
        const gapX = objective.x - unit.pos.x;
        const gapZ = objective.z - unit.pos.z;
        if (Math.hypot(gapX, gapZ) < objective.r) {
          if (unit.state !== 'plant') {
            unit.state = 'plant';
            unit.stateTime = 0;
            unit.plantProgress = 0;
          }
          unit.plantProgress += dt;
          face(unit, objective.x, objective.z, dt);
          if (unit.plantProgress >= 3) {
            unit.state = 'route';
            ctx.onPlanted(objective.key);
          }
          continue;
        }
      }
      if (unit.team === 'defend' && ctx.bomb.planted && ctx.phase === 'planted' && !unit.target) {
        const objective = ctx.bomb.site;
        const gapX = objective.x - unit.pos.x;
        const gapZ = objective.z - unit.pos.z;
        if (Math.hypot(gapX, gapZ) < objective.r + 0.5) {
          if (unit.state !== 'defuse') {
            unit.state = 'defuse';
            unit.stateTime = 0;
            unit.defuseProgress = 0;
          }
          unit.defuseProgress += dt;
          face(unit, objective.x, objective.z, dt);
          ctx.defuseProgress = Math.max(ctx.defuseProgress, unit.defuseProgress / 5);
          if (unit.defuseProgress >= 5) {
            unit.state = 'route';
            ctx.onDefused();
          }
          continue;
        }
      }

      // --- Movement and fire.
      const pace = isBlind ? 1.2 : PATROL_SPEED;
      let onMove = false;
      if (unit.state === 'combat' && unit.target) {
        const foeX = unit.target.x;
        const foeZ = unit.target.z;
        face(unit, foeX, foeZ, dt, 8);
        const range = Math.hypot(foeX - unit.pos.x, foeZ - unit.pos.z);
        // Close in from far away, back off up close, strafe sideways in
        // between so the bot is a moving target.
        const approach = range > 20 ? 1 : range < 7 ? -1 : 0;
        if (t > unit.strafeUntil) {
          unit.strafeDir = random() < 0.5 ? -1 : 1;
          unit.strafeUntil = t + 0.7 + random() * 0.9;
        }
        const fwdX = -Math.sin(unit.yaw);
        const fwdZ = -Math.cos(unit.yaw);
        const sideX = Math.cos(unit.yaw);
        const sideZ = -Math.sin(unit.yaw);
        const stepX = fwdX * approach + sideX * unit.strafeDir * 0.7;
        const stepZ = fwdZ * approach + sideZ * unit.strafeDir * 0.7;
        const mag = Math.hypot(stepX, stepZ) || 1;
        glide(unit, (stepX / mag) * pace, (stepZ / mag) * pace, dt);
        onMove = true;
        // Burst fire, once the reaction delay has passed.
        if (t >= unit.reactionAt && unit.nextShotAt <= t) {
          if (unit.burstLeft <= 0) {
            unit.burstLeft = 3 + ((random() * 3) | 0);
            unit.nextShotAt = t + 0.45 + random() * 0.7;
          } else if (unit.mag > 0) {
            unit.burstLeft -= 1;
            unit.nextShotAt = t + unit.weapon.gap * 1.15;
            unit.mag -= 1;
            const wobble = (isBlind ? 0.12 : 0.016 + spreadFor(range, unit.accuracy)) * (onMove ? 1.6 : 1);
            const eye = eyeAt(unit);
            const aim = {
              x: (foeX - eye.x) / range + (random() * 2 - 1) * wobble,
              y: (unit.lastSeen.y - eye.y) / range + (random() * 2 - 1) * wobble,
              z: (foeZ - eye.z) / range + (random() * 2 - 1) * wobble,
            };
            const aimLen = Math.hypot(aim.x, aim.y, aim.z) || 1;
            ctx.shootFrom(unit, eye, { x: aim.x / aimLen, y: aim.y / aimLen, z: aim.z / aimLen });
          } else {
            unit.mag = unit.weapon.mag;
            unit.reserve = Math.max(0, unit.reserve - unit.weapon.mag);
            unit.nextShotAt = t + unit.weapon.reloadTime;
          }
        }
      } else if (unit.state === 'plant' || unit.state === 'defuse') {
        // Handled above; stand still while the spike is worked on.
      } else {
        // Route following: an investigation first, then the assigned route,
        // then a slow scan in place when the route is done.
        let destination = null;
        if (unit.investigate) destination = unit.investigate;
        else if (unit.routeIndex < unit.route.length) destination = unit.route[unit.routeIndex];
        else if (unit.holdPos) destination = unit.holdPos;
        if (destination) {
          const gapX = destination.x - unit.pos.x;
          const gapZ = destination.z - unit.pos.z;
          const gap = Math.hypot(gapX, gapZ);
          if (gap < 0.7) {
            if (unit.investigate) unit.investigate = null;
            else unit.routeIndex += 1;
          } else {
            face(unit, destination.x, destination.z, dt);
            glide(unit, (gapX / gap) * pace, (gapZ / gap) * pace, dt);
            onMove = true;
          }
        } else {
          // Hold: a slow scan, each bot on its own phase.
          unit.yaw += Math.sin(t * 0.5 + roster.indexOf(unit)) * dt * 0.4;
        }
      }
      unit.stateTime += dt;
      // Walk animation: legs swing while moving, ease back when still.
      if (onMove) {
        unit.walkPhase += dt * 9;
        const swing = Math.sin(unit.walkPhase) * 0.45;
        unit.legL.rotation.x = swing;
        unit.legR.rotation.x = -swing;
      } else {
        unit.legL.rotation.x *= 0.9;
        unit.legR.rotation.x *= 0.9;
      }
      unit.group.rotation.y = unit.yaw;
    }
  }

  // Hearing: a gunshot pulls every enemy bot within earshot toward the sound.
  function onShotFired(origin, team) {
    for (const unit of roster) {
      if (!unit.alive || unit.team === team || unit.state === 'combat') continue;
      const d = Math.hypot(origin.x - unit.pos.x, origin.z - unit.pos.z);
      if (d < 26) unit.investigate = { x: origin.x, z: origin.z };
    }
  }

  function aliveCount(team) {
    return roster.filter((u) => u.alive && u.team === team).length;
  }

  function setCarrier(unit) {
    for (const u of roster) if (u.team === 'attack') u.carrier = false;
    if (unit) unit.carrier = true;
  }

  return { list: roster, hitMeshes: targetMeshes, step, spawnRound, onShotFired, aliveCount, setCarrier, eyeOf: eyeAt };
}
