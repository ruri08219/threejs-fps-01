// Economy: CS-style money. Kill +$300, round win +$3250, loss +$1900 with a
// $500 streak bonus per consecutive loss (cap $3400), plant +$300 for the team.
// The buy menu may only be used during buy time, inside the spawn area.
export const START_MONEY = 800;
export const KILL_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1900;
export const LOSS_STREAK_BONUS = 500;
export const LOSS_REWARD_CAP = 3400;
export const PLANT_REWARD = 300;

export function createEconomy() {
  const state = { money: START_MONEY, lossStreak: 0 };
  return {
    state,
    reset() {
      state.money = START_MONEY;
      state.lossStreak = 0;
    },
    canAfford(price) {
      return state.money >= price;
    },
    spend(price) {
      if (!this.canAfford(price)) return false;
      state.money -= price;
      return true;
    },
    kill() {
      state.money += KILL_REWARD;
    },
    roundEnd(won, planted) {
      if (won) {
        state.money += WIN_REWARD;
        state.lossStreak = 0;
      } else {
        state.money += Math.min(LOSS_REWARD + state.lossStreak * LOSS_STREAK_BONUS, LOSS_REWARD_CAP);
        state.lossStreak += 1;
      }
      if (planted) state.money += PLANT_REWARD;
    },
  };
}
