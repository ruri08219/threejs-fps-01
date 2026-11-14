// Sound, synthesized with WebAudio: no audio files, no network. Every effect is
// a short oscillator or filtered noise burst, distance-attenuated for enemy fire.
export function createAudio() {
  let ctx = null;
  let master = null;
  let enabled = true;

  function ensure() {
    if (ctx) return ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
    }
    return ctx;
  }
  function noiseBuffer(seconds) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
  function burst({ freq = 1000, q = 1, dur = 0.12, gain = 0.5, type = 'bandpass', slideTo = null }) {
    if (!enabled || !ensure() || ctx.state === 'suspended') return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur + 0.05);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (slideTo) filter.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    filter.Q.value = q;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(amp).connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }
  function tone({ freq = 440, dur = 0.1, gain = 0.3, type = 'sine', slideTo = null }) {
    if (!enabled || !ensure() || ctx.state === 'suspended') return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(amp).connect(master);
    osc.start(t);
    osc.stop(t + dur);
  }
  function attenuate(distance) {
    return Math.max(0.08, 1 - distance / 55);
  }
  return {
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
    setEnabled(on) {
      enabled = on;
    },
    shot(distance = 0) {
      burst({ freq: 900, q: 0.8, dur: 0.14, gain: 0.55 * attenuate(distance), slideTo: 180 });
    },
    enemyShot(distance) {
      burst({ freq: 700, q: 0.8, dur: 0.12, gain: 0.4 * attenuate(distance), slideTo: 150 });
    },
    shotgun(distance = 0) {
      burst({ freq: 500, q: 0.6, dur: 0.22, gain: 0.7 * attenuate(distance), slideTo: 90 });
    },
    sniper(distance = 0) {
      burst({ freq: 1400, q: 1.4, dur: 0.2, gain: 0.6 * attenuate(distance), slideTo: 220 });
    },
    dryFire() {
      tone({ freq: 1800, dur: 0.03, gain: 0.15, type: 'square' });
    },
    reload() {
      tone({ freq: 900, dur: 0.05, gain: 0.2, type: 'square' });
      setTimeout(() => tone({ freq: 600, dur: 0.05, gain: 0.2, type: 'square' }), 320);
    },
    hit(head) {
      tone({ freq: head ? 1500 : 1050, dur: 0.07, gain: 0.3, type: 'triangle' });
    },
    kill() {
      tone({ freq: 1320, dur: 0.09, gain: 0.3, type: 'triangle' });
      setTimeout(() => tone({ freq: 1760, dur: 0.12, gain: 0.3, type: 'triangle' }), 90);
    },
    hurt() {
      burst({ freq: 300, q: 0.7, dur: 0.15, gain: 0.4, slideTo: 120 });
    },
    plantBeep() {
      tone({ freq: 1200, dur: 0.08, gain: 0.25, type: 'square' });
    },
    explosion(distance = 0) {
      burst({ freq: 220, q: 0.5, dur: 0.7, gain: 0.8 * attenuate(distance), slideTo: 40 });
      tone({ freq: 90, dur: 0.6, gain: 0.4, slideTo: 30 });
    },
    flashPop(distance = 0) {
      tone({ freq: 2400, dur: 0.1, gain: 0.3 * attenuate(distance), slideTo: 900 });
    },
    buy() {
      tone({ freq: 880, dur: 0.07, gain: 0.25, type: 'triangle' });
      setTimeout(() => tone({ freq: 1320, dur: 0.1, gain: 0.25, type: 'triangle' }), 80);
    },
    roundWin() {
      tone({ freq: 523, dur: 0.16, gain: 0.3, type: 'triangle' });
      setTimeout(() => tone({ freq: 659, dur: 0.16, gain: 0.3, type: 'triangle' }), 140);
      setTimeout(() => tone({ freq: 784, dur: 0.28, gain: 0.3, type: 'triangle' }), 280);
    },
    roundLose() {
      tone({ freq: 392, dur: 0.18, gain: 0.3, type: 'triangle' });
      setTimeout(() => tone({ freq: 311, dur: 0.3, gain: 0.3, type: 'triangle' }), 160);
    },
    step() {
      tone({ freq: 220, dur: 0.03, gain: 0.05, type: 'sine' });
    },
  };
}
