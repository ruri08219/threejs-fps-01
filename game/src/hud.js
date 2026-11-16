// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, score, team
// pips, kill feed, banners, buy menu, plant/defuse progress and overlays.
// It never touches the simulation; main.js pushes numbers in and reads the
// play and buy callbacks back out. Text writes are cached so the DOM is only
// touched when a value actually changes.
const OVERLAY_TEXT = {
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
  const grab = (id) => document.getElementById(id);
  const overlayPane = grab('overlay');
  const overlayHeading = grab('overlay-title');
  const overlayBody = grab('overlay-copy');
  const playBtn = grab('play');
  const magEl = grab('ammo-mag');
  const reserveEl = grab('ammo-reserve');
  const weaponEl = grab('weapon-name');
  const healthBar = grab('health-fill');
  const healthNum = grab('health-value');
  const moneyNum = grab('money-value');
  const timerNum = grab('timer-value');
  const timerTag = grab('timer-label');
  const scoreNumA = grab('score-a');
  const scoreNumB = grab('score-b');
  const roundTag = grab('round-value');
  const pipsElA = grab('pips-a');
  const pipsElB = grab('pips-b');
  const feedEl = grab('killfeed');
  const bannerPane = grab('banner');
  const bannerHeading = grab('banner-title');
  const bannerBody = grab('banner-sub');
  const shopPane = grab('buy-menu');
  const shopMoney = grab('buy-money');
  const progressPane = grab('progress');
  const progressBar = grab('progress-fill');
  const progressTag = grab('progress-label');
  const bombTag = grab('bomb-status');
  const markerEl = grab('hitmarker');
  const crossEl = grab('crosshair');
  const hurtEl = grab('vignette');
  const flashPane = grab('flash');
  const nadeTag = grab('grenade-line');
  let hitClock = 0;
  let bannerClock = 0;
  const cache = {};

  function paintText(el, value, key) {
    if (cache[key] !== value) {
      cache[key] = value;
      el.textContent = value;
    }
  }

  function renderPips(el, alive, total, team) {
    const key = `pips-${team}`;
    const value = `${alive}/${total}`;
    if (cache[key] === value) return;
    cache[key] = value;
    el.innerHTML = '';
    for (let i = 0; i < total; i += 1) {
      const dot = document.createElement('i');
      if (i < alive) dot.className = `on ${team}`;
      el.appendChild(dot);
    }
  }

  function phaseName(phase) {
    if (phase === 'buy') return 'BUY PHASE';
    if (phase === 'planted') return 'SPIKE LIVE';
    if (phase === 'over') return 'ROUND OVER';
    return 'ROUND';
  }

  return {
    setHealth(hp) {
      paintText(healthNum, String(Math.max(0, Math.ceil(hp))), 'hp');
      const pct = Math.max(0, Math.min(100, hp));
      if (cache.hppct !== pct) {
        cache.hppct = pct;
        healthBar.style.width = `${pct}%`;
        healthBar.classList.toggle('low', pct <= 30);
      }
    },
    setAmmo(mag, reserve, name) {
      paintText(magEl, String(mag), 'mag');
      paintText(reserveEl, `/ ${reserve}`, 'res');
      paintText(weaponEl, name, 'wname');
      grab('ammo').classList.toggle('empty', mag === 0);
    },
    setMoney(n) {
      paintText(moneyNum, `$${n}`, 'money');
      paintText(shopMoney, `$${n}`, 'buymoney');
    },
    setTimer(seconds, phase) {
      const s = Math.ceil(seconds);
      paintText(timerNum, `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, 'timer');
      paintText(timerTag, phaseName(phase), 'tlabel');
      grab('timer').classList.toggle('danger', phase === 'planted' || (phase === 'live' && seconds <= 15));
    },
    setScore(a, b, round) {
      paintText(scoreNumA, String(a), 'sa');
      paintText(scoreNumB, String(b), 'sb');
      paintText(roundTag, `ROUND ${round}`, 'round');
    },
    setAlive(aAlive, aTotal, bAlive, bTotal) {
      renderPips(pipsElA, aAlive, aTotal, 'aurum');
      renderPips(pipsElB, bAlive, bTotal, 'vanta');
    },
    setGrenades(frag, flash, selected) {
      paintText(nadeTag, `FRAG ${frag} · DAZZLER ${flash} — [G] throw, [Q] ${selected === 'frag' ? 'FRAG' : 'DAZZLER'} selected`, 'nades');
    },
    setBombStatus(text) {
      paintText(bombTag, text, 'bomb');
    },
    setCrosshair(gapPx) {
      const gap = Math.round(gapPx);
      if (cache.gap !== gap) {
        cache.gap = gap;
        crossEl.style.setProperty('--gap', `${gap}px`);
      }
    },
    hitMarker(killed, head) {
      markerEl.classList.add('on');
      markerEl.classList.toggle('head', !!head);
      markerEl.style.transform = killed
        ? 'translate(-50%, -50%) rotate(45deg) scale(1.3)'
        : 'translate(-50%, -50%) rotate(45deg)';
      clearTimeout(hitClock);
      hitClock = setTimeout(() => markerEl.classList.remove('on'), killed ? 220 : 90);
    },
    damageFlash() {
      hurtEl.classList.add('hit');
      setTimeout(() => hurtEl.classList.remove('hit'), 180);
    },
    flashWhite(strength) {
      flashPane.style.opacity = String(Math.max(0, Math.min(1, strength)));
    },
    killFeed(text, team) {
      const line = document.createElement('div');
      line.className = `feed-line ${team}`;
      line.textContent = text;
      feedEl.prepend(line);
      while (feedEl.children.length > 5) feedEl.removeChild(feedEl.lastChild);
      setTimeout(() => line.remove(), 5200);
    },
    banner(titleText, subText, team) {
      bannerHeading.textContent = titleText;
      bannerBody.textContent = subText;
      bannerPane.className = `show ${team || ''}`;
      clearTimeout(bannerClock);
      bannerClock = setTimeout(() => bannerPane.classList.remove('show'), 3600);
    },
    hideBanner() {
      bannerPane.classList.remove('show');
    },
    showProgress(label, fraction) {
      progressPane.hidden = false;
      progressTag.textContent = label;
      progressBar.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
    },
    hideProgress() {
      progressPane.hidden = true;
    },
    showBuy(open) {
      shopPane.hidden = !open;
    },
    buyOpen() {
      return !shopPane.hidden;
    },
    onBuy(handler) {
      shopPane.querySelectorAll('[data-buy]').forEach((button) => {
        button.addEventListener('click', () => handler(button.dataset.buy));
      });
    },
    refreshBuy(afford) {
      shopPane.querySelectorAll('[data-buy]').forEach((button) => {
        button.disabled = !afford(button.dataset.buy);
      });
    },
    showOverlay(mode, extra) {
      const text = OVERLAY_TEXT[mode];
      overlayHeading.textContent = text.title;
      overlayBody.textContent = extra || text.copy;
      playBtn.textContent = text.action;
      overlayPane.hidden = false;
      playBtn.focus();
    },
    hideOverlay() {
      overlayPane.hidden = true;
    },
    onPlay(handler) {
      playBtn.addEventListener('click', handler);
    },
  };
}
