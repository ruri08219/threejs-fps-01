// The match economy, CS-style. A kill pays $300, a round win $3250, a loss
// $1900 plus $500 for every consecutive loss in a row (capped at $3400), and a
// plant adds $300 for the whole team. The buy menu only opens during buy time;
// the shop itself (what can be bought, and when) lives in main.js.
export const START_MONEY = 800;
export const KILL_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1900;
export const LOSS_STREAK_BONUS = 500;
export const LOSS_REWARD_CAP = 3400;
export const PLANT_REWARD = 300;

export function createEconomy() {
  const coffer = { money: START_MONEY, lossStreak: 0 };

  function resetCoffer() {
    coffer.money = START_MONEY;
    coffer.lossStreak = 0;
  }

  function canPay(price) {
    return coffer.money >= price;
  }

  function payOut(price) {
    if (coffer.money < price) return false;
    coffer.money -= price;
    return true;
  }

  function scoreKill() {
    coffer.money += KILL_REWARD;
  }

  function settleRound(won, planted) {
    if (won) {
      coffer.money += WIN_REWARD;
      coffer.lossStreak = 0;
    } else {
      // A losing streak pays more each round, up to the cap — the classic
      // comeback mechanic that keeps a broke team in the game.
      const consolation = Math.min(LOSS_REWARD + coffer.lossStreak * LOSS_STREAK_BONUS, LOSS_REWARD_CAP);
      coffer.money += consolation;
      coffer.lossStreak += 1;
    }
    if (planted) coffer.money += PLANT_REWARD;
  }

  return {
    state: coffer,
    reset: resetCoffer,
    canAfford: canPay,
    spend: payOut,
    kill: scoreKill,
    roundEnd: settleRound,
  };
}
