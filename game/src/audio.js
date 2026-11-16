// Sound, synthesized with WebAudio: no audio files, no network. Every effect
// is a short oscillator or a filtered noise burst, distance-attenuated for
// anything that is not the player's own gun.
export function createAudio() {
  let audioCtx = null;
  let bus = null;
  let audible = true;

  // The context is only created on the first sound (the browser wants a user
  // gesture first); if creation fails, every call below becomes a no-op.
  function acquire() {
    if (audioCtx) return audioCtx;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      bus = audioCtx.createGain();
      bus.gain.value = 0.5;
      bus.connect(audioCtx.destination);
    } catch {
      audioCtx = null;
    }
    return audioCtx;
  }

  function makeNoise(seconds) {
    const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * seconds, audioCtx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i += 1) samples[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function noiseBurst({ freq = 1000, q = 1, dur = 0.12, gain = 0.5, type = 'bandpass', slideTo = null }) {
    if (!audible || !acquire() || audioCtx.state === 'suspended') return;
    const start = audioCtx.currentTime;
    const source = audioCtx.createBufferSource();
    source.buffer = makeNoise(dur + 0.05);
    const filter = audioCtx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, start);
    if (slideTo) filter.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    filter.Q.value = q;
    const amp = audioCtx.createGain();
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.001, start + dur);
    source.connect(filter).connect(amp).connect(bus);
    source.start(start);
    source.stop(start + dur + 0.05);
  }

  function oscTone({ freq = 440, dur = 0.1, gain = 0.3, type = 'sine', slideTo = null }) {
    if (!audible || !acquire() || audioCtx.state === 'suspended') return;
    const start = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    const amp = audioCtx.createGain();
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.001, start + dur);
    osc.connect(amp).connect(bus);
    osc.start(start);
    osc.stop(start + dur);
  }

  // Distant sounds fade out to a floor of 0.08 so they never vanish entirely.
  function distanceGain(distance) {
    return Math.max(0.08, 1 - distance / 55);
  }

  // A short chime played a little later, for two-note cues.
  function later(delayMs, fn) {
    setTimeout(fn, delayMs);
  }

  return {
    unlock() {
      acquire();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    },
    setEnabled(on) {
      audible = on;
    },
    shot(distance = 0) {
      noiseBurst({ freq: 900, q: 0.8, dur: 0.14, gain: 0.55 * distanceGain(distance), slideTo: 180 });
    },
    enemyShot(distance) {
      noiseBurst({ freq: 700, q: 0.8, dur: 0.12, gain: 0.4 * distanceGain(distance), slideTo: 150 });
    },
    shotgun(distance = 0) {
      noiseBurst({ freq: 500, q: 0.6, dur: 0.22, gain: 0.7 * distanceGain(distance), slideTo: 90 });
    },
    sniper(distance = 0) {
      noiseBurst({ freq: 1400, q: 1.4, dur: 0.2, gain: 0.6 * distanceGain(distance), slideTo: 220 });
    },
    dryFire() {
      oscTone({ freq: 1800, dur: 0.03, gain: 0.15, type: 'square' });
    },
    reload() {
      oscTone({ freq: 900, dur: 0.05, gain: 0.2, type: 'square' });
      later(320, () => oscTone({ freq: 600, dur: 0.05, gain: 0.2, type: 'square' }));
    },
    hit(head) {
      oscTone({ freq: head ? 1500 : 1050, dur: 0.07, gain: 0.3, type: 'triangle' });
    },
    kill() {
      oscTone({ freq: 1320, dur: 0.09, gain: 0.3, type: 'triangle' });
      later(90, () => oscTone({ freq: 1760, dur: 0.12, gain: 0.3, type: 'triangle' }));
    },
    hurt() {
      noiseBurst({ freq: 300, q: 0.7, dur: 0.15, gain: 0.4, slideTo: 120 });
    },
    plantBeep() {
      oscTone({ freq: 1200, dur: 0.08, gain: 0.25, type: 'square' });
    },
    explosion(distance = 0) {
      noiseBurst({ freq: 220, q: 0.5, dur: 0.7, gain: 0.8 * distanceGain(distance), slideTo: 40 });
      oscTone({ freq: 90, dur: 0.6, gain: 0.4, slideTo: 30 });
    },
    flashPop(distance = 0) {
      oscTone({ freq: 2400, dur: 0.1, gain: 0.3 * distanceGain(distance), slideTo: 900 });
    },
    buy() {
      oscTone({ freq: 880, dur: 0.07, gain: 0.25, type: 'triangle' });
      later(80, () => oscTone({ freq: 1320, dur: 0.1, gain: 0.25, type: 'triangle' }));
    },
    roundWin() {
      oscTone({ freq: 523, dur: 0.16, gain: 0.3, type: 'triangle' });
      later(140, () => oscTone({ freq: 659, dur: 0.16, gain: 0.3, type: 'triangle' }));
      later(280, () => oscTone({ freq: 784, dur: 0.28, gain: 0.3, type: 'triangle' }));
    },
    roundLose() {
      oscTone({ freq: 392, dur: 0.18, gain: 0.3, type: 'triangle' });
      later(160, () => oscTone({ freq: 311, dur: 0.3, gain: 0.3, type: 'triangle' }));
    },
    step() {
      oscTone({ freq: 220, dur: 0.03, gain: 0.05, type: 'sine' });
    },
  };
}
