// Tiny Web Audio SFX. No audio files required — every sound is
// synthesized on the fly with oscillators, so this file ships its own
// sounds in ~2 KB of code.
//
// Browsers won't let an AudioContext start until after the first user
// interaction, so we create it lazily on the first play call and
// `resume()` if it's suspended. By the time the lobby countdown ticks
// for the first time the user has already clicked Queue or Solo, so
// the context resumes cleanly.

let ctx = null;
let master = null;
let enabled = true;

function ensureCtx() {
  if (ctx) return ctx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  } catch (err) {
    console.warn('[sound] could not create AudioContext', err);
    ctx = null;
  }
  return ctx;
}

function resumeIfNeeded() {
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
}

// Fire a single short tone with optional pitch glide and attack/decay.
function tone({
  freq,
  freq2,
  type = 'sine',
  duration = 0.15,
  gain = 0.25,
  when = 0,
  attack = 0.008,
} = {}) {
  if (!enabled) return;
  const c = ensureCtx();
  if (!c) return;
  resumeIfNeeded();
  const start = c.currentTime + when;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (typeof freq2 === 'number') {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq2), start + duration);
  }
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(g).connect(master);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

export const sfx = {
  setEnabled(on) { enabled = !!on; },
  isEnabled()    { return enabled; },

  // --- Countdown (both lobby match-start and in-round preround) ---
  tick() {
    tone({ freq: 660, duration: 0.08, gain: 0.18, type: 'square' });
  },
  go() {
    tone({ freq: 440, freq2: 880, duration: 0.32, gain: 0.26, type: 'triangle' });
    tone({ freq: 880, freq2: 1320, duration: 0.22, gain: 0.16, type: 'triangle', when: 0.04 });
  },

  // --- Round tally (life-change feedback, per player) ---
  lifeLost() {
    tone({ freq: 380, freq2: 150, duration: 0.42, gain: 0.3, type: 'sawtooth' });
    tone({ freq: 300, freq2: 120, duration: 0.42, gain: 0.18, type: 'sawtooth', when: 0.05 });
  },
  lifeSafe() {
    tone({ freq: 660, duration: 0.08, gain: 0.18, type: 'triangle' });
    tone({ freq: 880, duration: 0.12, gain: 0.22, type: 'triangle', when: 0.09 });
  },

  // --- Match finish ---
  matchWin() {
    // Triumphant ascending C major triad
    [523.25, 659.25, 783.99].forEach((f, i) => {
      tone({ freq: f, duration: 0.55, gain: 0.22, type: 'triangle', when: i * 0.08 });
    });
    // Sparkle on top
    tone({ freq: 1046.5, duration: 0.6, gain: 0.14, type: 'sine', when: 0.3 });
  },
  matchLose() {
    // Descending minor
    tone({ freq: 330, freq2: 165, duration: 0.6, gain: 0.28, type: 'sawtooth' });
    tone({ freq: 220, freq2: 110, duration: 0.6, gain: 0.2, type: 'sawtooth', when: 0.15 });
  },
};
