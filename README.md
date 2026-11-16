[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/ruri08219/threejs-fps-01/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/ruri08219/threejs-fps-01/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

# SANDLINE — a three.js tactical FPS

A round-based tactical first-person shooter in the style Counter-Strike made
famous, built for make.fun's `threejs-fps-02` bounty — [Make the best three.js tactical FPS](https://make.fun/bounty/threejs-fps-02), $1,000 in USDC. It runs in a desktop
browser on three.js 0.187.0, from static files with no build step and no
network request. Single-player against bots.

## The game

You are AURUM, the attackers, with three bot teammates. VANTA defends with
four bots. First to 5 rounds takes the match.

- **Objective:** plant the spike at site A or B (hold `E` at a site), or
  eliminate the defending team. After a plant, the spike detonates in 35 s
  unless a defender defuses it (5 s at the site).
- **Economy:** kills pay $300, round wins $3250, losses $1900+ with a streak
  bonus. Press `B` during the 15 s buy phase to buy rifles, an SMG, a
  shotgun, a scoped DMR, FRAG and DAZZLER flash grenades.
- **Gunplay:** hitscan against bodies with headshot multipliers, damage
  falloff, recoil and spread that punish firing on the move, acceleration,
  crouching and collision with the map.
- **Bots:** follow routes to A, B or mid, hold positions, react to what they
  see and hear, strafe and burst-fire, plant the spike when they carry it,
  and defuse when it is down.
- **Map:** SANDLINE, a dusk desert compound — three lanes, two bomb sites,
  a mid watchtower, containers, crates and sandbags, in a warm sand/amber
  palette against a dark sky.

## Controls

`WASD` move · mouse look · click fire · `RMB` scope (Longbow) · `R` reload ·
`Ctrl`/`C` crouch · `Space` jump · `B` buy menu · `1`/`2` weapons ·
`G` throw grenade · `Q` switch grenade · `E` plant the spike (hold, at a site)

## Play it

```sh
node serve.ts   # then open http://localhost:8080
```

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and
writes `dossier.json` with the vendored make.fun library.

## Layout

- `game/index.html` — page, HUD, buy menu, overlays
- `game/src/main.js` — boot, fixed-step loop, combat resolution, round flow
- `game/src/world.js` — the SANDLINE map, sites, spawns, bot routes
- `game/src/bots.js` — bot AI: routes, combat, plant/defuse, hearing
- `game/src/weapons.js` — five guns, view models, firing state
- `game/src/rounds.js` — round state machine (buy/live/planted/over)
- `game/src/economy.js` — money, rewards, loss streaks
- `game/src/grenades.js` — FRAG and flash projectiles
- `game/src/audio.js` — synthesized WebAudio sound, no audio files
- `game/src/effects.js` — pooled tracers, impact sparks, the spike
- `game/src/player.js` — movement: accel, friction, gravity, crouch, jump
- `game/src/hud.js` — DOM HUD · `game/src/input.js` — keyboard/mouse
- `game/src/palette.js` — the look plan, in one place
- `game/vendor/three/` — three.js 0.187.0, byte for byte from the kit
- `vendor/makefun-threejs.ts` — the kit's dossier library, unchanged
