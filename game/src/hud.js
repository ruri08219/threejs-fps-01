// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, score, team
// pips, kill feed, banners, buy menu, plant/defuse progress and overlays.
// It never touches the simulation; main.js pushes numbers in and reads the
// play and buy callbacks out.
const COPY = {
  start: {
    title: 'SANDLINE',
    copy: 'A dusk desert compound. You are AURUM, the attackers: plant the spike at A or B, or eliminate VANTA. First to 5 rounds takes the match.',
    action: 'Click to play',
  },
  paused: {
    title: 'SANDLINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const healthFill = $('health-fill');
  const healthValue = $('health-value');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const timerLabel = $('timer-label');
  const scoreA = $('score-a');
  const scoreB = $('score-b');
  const roundValue = $('round-value');
  const pipsA = $('pips-a');
  const pipsB = $('pips-b');
  const killfeed = $('killfeed');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const buyMenu = $('buy-menu');
  const buyMoney = $('buy-money');
  const progress = $('progress');
  const progressFill = $('progress-fill');
  const progressLabel = $('progress-label');
  const bombStatus = $('bomb-status');
  const hitmarker = $('hitmarker');
  const crosshair = $('crosshair');
  const vignette = $('vignette');
  const flashEl = $('flash');
  const grenadeLine = $('grenade-line');
  let hitTimer = 0;
  let bannerTimer = 0;
  let last = {};

  function setText(el, value, key) {
    if (last[key] !== value) {
      last[key] = value;
      el.textContent = value;
    }
  }
  function pips(el, alive, total, team) {
    const key = `pips-${team}`;
    const value = `${alive}/${total}`;
    if (last[key] === value) return;
    last[key] = value;
    el.innerHTML = '';
    for (let i = 0; i < total; i += 1) {
      const dot = document.createElement('i');
      if (i < alive) dot.className = `on ${team}`;
      el.appendChild(dot);
    }
  }

  return {
    setHealth(hp) {
      setText(healthValue, String(Math.max(0, Math.ceil(hp))), 'hp');
      const pct = Math.max(0, Math.min(100, hp));
      if (last.hppct !== pct) {
        last.hppct = pct;
        healthFill.style.width = `${pct}%`;
        healthFill.classList.toggle('low', pct <= 30);
      }
    },
    setAmmo(mag, reserve, name) {
      setText(ammoMag, String(mag), 'mag');
      setText(ammoReserve, `/ ${reserve}`, 'res');
      setText(weaponName, name, 'wname');
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setMoney(n) {
      setText(moneyValue, `$${n}`, 'money');
      setText(buyMoney, `$${n}`, 'buymoney');
    },
    setTimer(seconds, phase) {
      const s = Math.ceil(seconds);
      setText(timerValue, `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, 'timer');
      const label = phase === 'buy' ? 'BUY PHASE' : phase === 'planted' ? 'SPIKE LIVE' : phase === 'over' ? 'ROUND OVER' : 'ROUND';
      setText(timerLabel, label, 'tlabel');
      $('timer').classList.toggle('danger', phase === 'planted' || (phase === 'live' && seconds <= 15));
    },
    setScore(a, b, round) {
      setText(scoreA, String(a), 'sa');
      setText(scoreB, String(b), 'sb');
      setText(roundValue, `ROUND ${round}`, 'round');
    },
    setAlive(aAlive, aTotal, bAlive, bTotal) {
      pips(pipsA, aAlive, aTotal, 'aurum');
      pips(pipsB, bAlive, bTotal, 'vanta');
    },
    setGrenades(frag, flash, selected) {
      setText(grenadeLine, `FRAG ${frag} · DAZZLER ${flash} — [G] throw, [Q] ${selected === 'frag' ? 'FRAG' : 'DAZZLER'} selected`, 'nades');
    },
    setBombStatus(text) {
      setText(bombStatus, text, 'bomb');
    },
    setCrosshair(gapPx) {
      const gap = Math.round(gapPx);
      if (last.gap !== gap) {
        last.gap = gap;
        crosshair.style.setProperty('--gap', `${gap}px`);
      }
    },
    hitMarker(killed, head) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('head', !!head);
      hitmarker.style.transform = killed
        ? 'translate(-50%, -50%) rotate(45deg) scale(1.3)'
        : 'translate(-50%, -50%) rotate(45deg)';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on'), killed ? 220 : 90);
    },
    damageFlash() {
      vignette.classList.add('hit');
      setTimeout(() => vignette.classList.remove('hit'), 180);
    },
    flashWhite(strength) {
      flashEl.style.opacity = String(Math.max(0, Math.min(1, strength)));
    },
    killFeed(text, team) {
      const line = document.createElement('div');
      line.className = `feed-line ${team}`;
      line.textContent = text;
      killfeed.prepend(line);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => line.remove(), 5200);
    },
    banner(titleText, subText, team) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText;
      banner.className = `show ${team || ''}`;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.remove('show'), 3600);
    },
    hideBanner() {
      banner.classList.remove('show');
    },
    showProgress(label, fraction) {
      progress.hidden = false;
      progressLabel.textContent = label;
      progressFill.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
    },
    hideProgress() {
      progress.hidden = true;
    },
    showBuy(open) {
      buyMenu.hidden = !open;
    },
    buyOpen() {
      return !buyMenu.hidden;
    },
    onBuy(handler) {
      buyMenu.querySelectorAll('[data-buy]').forEach((button) => {
        button.addEventListener('click', () => handler(button.dataset.buy));
      });
    },
    refreshBuy(afford) {
      buyMenu.querySelectorAll('[data-buy]').forEach((button) => {
        button.disabled = !afford(button.dataset.buy);
      });
    },
    showOverlay(mode, extra) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = extra || text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
