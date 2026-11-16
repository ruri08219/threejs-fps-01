// The round state machine: buy (15 s) -> live (100 s) -> planted (35 s fuse) ->
// over (4 s banner) -> next round. First to 5 rounds wins the match.
// A round is won by elimination, by detonation, by defuse, or by the clock:
// defenders take it on time if the spike was never planted.
import { SITES } from './world.js';

export const BUY_SECONDS = 15;
export const ROUND_SECONDS = 100;
export const FUSE_SECONDS = 35;
export const PLANT_SECONDS = 3;
export const DEFUSE_SECONDS = 5;
export const WIN_ROUNDS = 5;

// The intermission shown after a round ends, before the next buy phase.
const OVER_SECONDS = 4;

export function createRounds() {
  const match = {
    round: 1,
    phase: 'buy', // buy | live | planted | over
    phaseTime: 0,
    timer: BUY_SECONDS,
    score: { attack: 0, defend: 0 },
    bomb: { planted: false, site: null, targetSite: SITES.A, fuse: 0, carrier: 'player' },
    overReason: '',
    matchOver: false,
    defuseProgress: 0,
  };

  function openRound(number, random = Math.random) {
    match.round = number;
    match.phase = 'buy';
    match.phaseTime = 0;
    match.timer = BUY_SECONDS;
    match.bomb.planted = false;
    match.bomb.site = null;
    // The attack's target site is a coin flip each round; the key is stamped
    // on the shared site object so the HUD and the bots read the same letter.
    match.bomb.targetSite = random() < 0.5 ? SITES.A : SITES.B;
    match.bomb.targetSite.key = match.bomb.targetSite === SITES.A ? 'A' : 'B';
    match.bomb.fuse = 0;
    match.bomb.carrier = 'player';
    match.defuseProgress = 0;
    match.overReason = '';
  }

  function closeRound(winner, reason) {
    if (match.phase === 'over') return false;
    match.phase = 'over';
    match.phaseTime = 0;
    match.timer = OVER_SECONDS;
    match.score[winner] += 1;
    match.overReason = reason;
    if (match.score[winner] >= WIN_ROUNDS) match.matchOver = true;
    return true;
  }

  return {
    state: match,
    startRound: openRound,
    reset() {
      match.round = 1;
      match.score.attack = 0;
      match.score.defend = 0;
      match.matchOver = false;
      openRound(1);
    },
    goLive() {
      match.phase = 'live';
      match.phaseTime = 0;
      match.timer = ROUND_SECONDS;
    },
    plant(siteKey) {
      const site = siteKey === 'A' ? SITES.A : SITES.B;
      site.key = siteKey;
      match.bomb.planted = true;
      match.bomb.site = site;
      match.bomb.fuse = FUSE_SECONDS;
      match.phase = 'planted';
      match.phaseTime = 0;
      match.timer = FUSE_SECONDS;
    },
    endRound: closeRound,
    step(dt) {
      match.phaseTime += dt;
      if (match.phase === 'buy') {
        match.timer = Math.max(0, BUY_SECONDS - match.phaseTime);
        if (match.timer === 0) this.goLive();
      } else if (match.phase === 'live') {
        match.timer = Math.max(0, ROUND_SECONDS - match.phaseTime);
        if (match.timer === 0) closeRound('defend', 'Time expired — the spike never went down.');
      } else if (match.phase === 'planted') {
        match.timer = Math.max(0, FUSE_SECONDS - match.phaseTime);
        match.bomb.fuse = match.timer;
        if (match.timer === 0) closeRound('attack', 'Spike detonated — site lost.');
      } else if (match.phase === 'over') {
        match.timer = Math.max(0, OVER_SECONDS - match.phaseTime);
      }
    },
  };
}
