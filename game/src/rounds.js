// Round state machine: buy (15 s) -> live (100 s) -> planted (35 s fuse) ->
// over (4 s banner) -> next round. First to 5 rounds wins the match.
// Win conditions: elimination, bomb detonation, defuse, or time expiring
// (defenders win on time if the bomb was never planted).
import { SITES } from './world.js';

export const BUY_SECONDS = 15;
export const ROUND_SECONDS = 100;
export const FUSE_SECONDS = 35;
export const PLANT_SECONDS = 3;
export const DEFUSE_SECONDS = 5;
export const WIN_ROUNDS = 5;

export function createRounds() {
  const state = {
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

  function startRound(number, random = Math.random) {
    state.round = number;
    state.phase = 'buy';
    state.phaseTime = 0;
    state.timer = BUY_SECONDS;
    state.bomb.planted = false;
    state.bomb.site = null;
    state.bomb.targetSite = random() < 0.5 ? SITES.A : SITES.B;
    state.bomb.targetSite.key = state.bomb.targetSite === SITES.A ? 'A' : 'B';
    state.bomb.fuse = 0;
    state.bomb.carrier = 'player';
    state.defuseProgress = 0;
    state.overReason = '';
  }

  return {
    state,
    startRound,
    reset() {
      state.round = 1;
      state.score.attack = 0;
      state.score.defend = 0;
      state.matchOver = false;
      startRound(1);
    },
    goLive() {
      state.phase = 'live';
      state.phaseTime = 0;
      state.timer = ROUND_SECONDS;
    },
    plant(siteKey) {
      const site = siteKey === 'A' ? SITES.A : SITES.B;
      site.key = siteKey;
      state.bomb.planted = true;
      state.bomb.site = site;
      state.bomb.fuse = FUSE_SECONDS;
      state.phase = 'planted';
      state.phaseTime = 0;
      state.timer = FUSE_SECONDS;
    },
    endRound(winner, reason) {
      if (state.phase === 'over') return false;
      state.phase = 'over';
      state.phaseTime = 0;
      state.timer = 4;
      state.score[winner] += 1;
      state.overReason = reason;
      if (state.score[winner] >= WIN_ROUNDS) state.matchOver = true;
      return true;
    },
    step(dt) {
      state.phaseTime += dt;
      if (state.phase === 'buy') {
        state.timer = Math.max(0, BUY_SECONDS - state.phaseTime);
        if (state.timer === 0) this.goLive();
      } else if (state.phase === 'live') {
        state.timer = Math.max(0, ROUND_SECONDS - state.phaseTime);
        if (state.timer === 0) this.endRound('defend', 'Time expired — the spike never went down.');
      } else if (state.phase === 'planted') {
        state.timer = Math.max(0, FUSE_SECONDS - state.phaseTime);
        state.bomb.fuse = state.timer;
        if (state.timer === 0) this.endRound('attack', 'Spike detonated — site lost.');
      } else if (state.phase === 'over') {
        state.timer = Math.max(0, 4 - state.phaseTime);
      }
    },
  };
}
