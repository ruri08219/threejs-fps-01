// Keyboard and mouse, plus the pointer lock that turns the mouse into look.
// Plain browser APIs only. Edge-triggered keys (buy, throw, switch weapon)
// are queued in `tapped` and read once per frame by main.js; held keys live in
// `held` for the whole time they are pressed.
export function createInput(canvas, onLockChange) {
  const held = new Set();
  const tapped = new Set();
  const pad = { keys: held, pressed: tapped, locked: false, firing: false, aiming: false, lookX: 0, lookY: 0 };

  function trackKey(event, down) {
    if (down) {
      if (!held.has(event.code)) tapped.add(event.code);
      held.add(event.code);
    } else {
      held.delete(event.code);
    }
    // Space scrolls the page by default; the game owns it while playing.
    if (event.code === 'Space') event.preventDefault();
  }

  window.addEventListener('keydown', (event) => trackKey(event, true));
  window.addEventListener('keyup', (event) => trackKey(event, false));
  window.addEventListener('blur', () => {
    held.clear();
    tapped.clear();
  });
  window.addEventListener('mousemove', (event) => {
    if (!pad.locked) return;
    pad.lookX += event.movementX;
    pad.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (!pad.locked) return;
    if (event.button === 0) pad.firing = true;
    if (event.button === 2) pad.aiming = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) pad.firing = false;
    if (event.button === 2) pad.aiming = false;
  });
  window.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    pad.locked = document.pointerLockElement === canvas;
    if (!pad.locked) {
      held.clear();
      pad.firing = false;
      pad.aiming = false;
    }
    onLockChange(pad.locked);
  });

  return {
    state: pad,
    requestLock() {
      // requestPointerLock returns a promise in newer Chrome; a call without
      // a user gesture rejects it, so swallow that — the game keeps running
      // unlocked and re-locks on the next real click.
      const pending = canvas.requestPointerLock();
      if (pending && pending.catch) pending.catch(() => {});
    },
    takeLook() {
      const dx = pad.lookX;
      const dy = pad.lookY;
      pad.lookX = 0;
      pad.lookY = 0;
      return { x: dx, y: dy };
    },
    takePressed() {
      const queue = [...tapped];
      tapped.clear();
      return queue;
    },
  };
}
