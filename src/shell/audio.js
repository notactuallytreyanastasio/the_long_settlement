// All of the game's sound, synthesised with WebAudio. No asset files.
//
//   createAudio() -> { unlock, sfx, music, setMuted, level, ctx, voiceBus,
//                      duck, isMuted, musicOut }   (duck/isMuted are extras for voice.js;
//                                                   musicOut is the ducked music, for metering)
//
// Graph:
//   mood buses ─► musicBus ──────────┐
//   mood sends ─► music reverb ──────┴─► duck ─┐
//   sfxBus ────────────────────────────────────┼─► master ─► limiter ─► mute ─► analyser ─► out
//   sfx send ─► sfx reverb ────────────────────┤
//   voiceBus ─► (tap analyser) ────────────────┘
//   (a reverb is 4 cross-fed feedback delays, no convolution)
//
// Music has a reverb of its own so that ALL of it passes through the duck. With
// one shared reverb straight into master, the wet half of the music (send 0.25
// to 0.8, and a tail that takes a second to fall 11 dB) went round the duck,
// and that is why speech used to sit on top of music that had barely moved.
//
// Music is a step sequencer scheduled against ctx.currentTime with a short
// lookahead. Each mood owns a bus, so changing mood is a 1.5 s cross-fade of
// two gains while the old mood's already-scheduled notes ring out underneath.
//
// Ilse's lullaby is four phrases of seven notes, one to a syllable (LULLABY).
// The four-note MOTIF, mi sol re do, is its last phrase with the passing notes
// taken out: "Keep ... light ... the sill".

export const SFX_NAMES = [
  'flip', 'bumper', 'sling', 'target', 'rollover', 'shot', 'saucer', 'eject', 'drain',
  'launch', 'wall', 'reelStart', 'reelStop', 'payout', 'jackpot', 'bust', 'loan', 'aid',
  'objective', 'sceneClear', 'card', 'confirm',
];

export const MOODS = [
  'title', 'festival', 'tense', 'covert', 'sorrow', 'hope', 'march', 'mine', 'court',
  'shrine', 'dread', 'silence', 'academy', 'storm', 'village', 'exchange',
];

/**
 * The lullaby, as semitones above the tonic. It was a rowing chant first: seven
 * even notes and a rest for the recovery, the stroke on 1, 3, 5 and 7.
 *
 *   1  Low the lamp and long the lane       mi mi sol sol la sol mi     stays where it is
 *   2  Hush, the water's lying still        sol sol mi mi re mi re      leans down, left open on re
 *   3  Who goes out comes home again        la la do' do' ti la sol     goes out furthest, and does not land
 *   4  Keep the light upon the sill         mi sol fa mi re re do       home
 *
 * The third is the one that gets lost: it is the only phrase above the octave
 * and the only one that ends away from the tonic chord's lower notes, so the
 * tune still closes without it. That is what 'sorrow' plays.
 */
export const LULLABY = {
  major: [[4, 4, 7, 7, 9, 7, 4], [7, 7, 4, 4, 2, 4, 2], [9, 9, 12, 12, 11, 9, 7], [4, 7, 5, 4, 2, 2, 0]],
  minor: [[3, 3, 7, 7, 8, 7, 3], [7, 7, 3, 3, 2, 3, 2], [8, 8, 12, 12, 10, 8, 7], [3, 7, 5, 3, 2, 2, 0]],
};

/** The last phrase's skeleton (notes 1, 2, 5 and 7 of it), as semitones above the tonic. */
export const MOTIF = { major: [4, 7, 2, 0], minor: [3, 7, 2, 0], inverted: [3, -1, 4, 6] };
// inverted: the minor tune's intervals (+4, -5, -2) turned upside down from the
// same first note. Where the tune came home, this one stops on the tritone.

const LOOKAHEAD = 0.25;      // seconds of music scheduled ahead of the clock
const TICK_MS = 40;
const XFADE = 1.5;
const DUCK_TO = 0.25;        // -12.04 dB
const DUCK_DOWN = 0.12;      // seconds to get there when a voice starts
const DUCK_UP = 0.6;         // seconds to come back when it stops
const DUCK_HOLD = 0.3;       // sound heard on the voice bus holds the duck this long past its end

/**
 * Where a gain that set off from `from` at t0, heading for `to` over `dur`
 * seconds along an exponential ramp (a straight line in dB), has got to at t.
 * The duck keeps its own account of this because AudioParam.value is not
 * dependable while a ramp is running (Firefox reports the last value set).
 */
export function duckAt(env, t) {
  if (!(env.from > 0) || !(env.to > 0)) throw new Error(`duckAt: gains must be positive, got ${JSON.stringify(env)}`);
  if (t <= env.t0) return env.from;
  if (t >= env.t0 + env.dur) return env.to;
  return env.from * Math.pow(env.to / env.from, (t - env.t0) / env.dur);
}

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
// deterministic 0..1 scatter for "random" placement that repeats per loop pair
const scatter = (a, b) => {
  const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export function createAudio() {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) throw new Error('createAudio: this browser has no AudioContext');
  const ctx = new AC({ latencyHint: 'interactive' });

  // ───────────── output chain ─────────────
  const master = ctx.createGain();
  master.gain.value = 0.9;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 12;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.2;
  const mute = ctx.createGain();
  const meter = ctx.createAnalyser();
  meter.fftSize = 512;
  master.connect(limiter);
  limiter.connect(mute);
  mute.connect(meter);
  meter.connect(ctx.destination);

  const musicBus = ctx.createGain();
  musicBus.gain.value = 0.5;
  const duckGain = ctx.createGain();
  musicBus.connect(duckGain);
  duckGain.connect(master);

  const sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.75;
  sfxBus.connect(master);

  const voiceBus = ctx.createGain();
  voiceBus.gain.value = 1.0;
  voiceBus.connect(master);
  const voiceTap = ctx.createAnalyser();
  voiceTap.fftSize = 256;
  voiceBus.connect(voiceTap);

  // ───────────── reverb: four feedback delays, each feeding the next ─────────────
  function makeReverb(dest) {
    const reverbIn = ctx.createGain();
    const times = [0.1127, 0.1513, 0.1973, 0.2411];
    const out = ctx.createGain();
    out.gain.value = 0.55;
    out.connect(dest);
    const lines = times.map((time, i) => {
      const d = ctx.createDelay(1);
      d.delayTime.value = time;
      const damp = ctx.createBiquadFilter();
      damp.type = 'lowpass';
      damp.frequency.value = 3200 - i * 350;
      const fb = ctx.createGain();
      fb.gain.value = 0.6;                 // 0.6 own + 0.2 from the neighbour < 1: stable
      reverbIn.connect(d);
      d.connect(damp);
      damp.connect(fb);
      fb.connect(d);
      if (ctx.createStereoPanner) {
        const pan = ctx.createStereoPanner();
        pan.pan.value = [-0.7, 0.7, -0.3, 0.3][i];
        damp.connect(pan);
        pan.connect(out);
      } else {
        damp.connect(out);
      }
      return { d, damp };
    });
    lines.forEach((l, i) => {
      const x = ctx.createGain();
      x.gain.value = 0.2;
      l.damp.connect(x);
      x.connect(lines[(i + 1) % lines.length].d);
    });
    return reverbIn;
  }
  const sfxSend = ctx.createGain();
  sfxSend.gain.value = 0.14;
  sfxBus.connect(sfxSend);
  sfxSend.connect(makeReverb(master));
  const reverbIn = makeReverb(duckGain);      // the music's own: its tail ducks with it

  // ───────────── shared noise ─────────────
  const noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate);
  {
    const d = noiseBuf.getChannelData(0);
    let s = 0x2545f491;
    for (let i = 0; i < d.length; i++) {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;       // xorshift: same hiss every run
      d[i] = ((s >>> 0) / 0xffffffff) * 2 - 1;
    }
  }

  // ───────────── primitives ─────────────
  // A pitched blip: fast attack, exponential decay, optional glide f -> f1.
  function tone(dest, { type = 'sine', f, f1, t, dur, vol, a = 0.002, detune = 0 }) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    if (detune) o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.03);
    return o;
  }

  // A filtered noise burst, optional filter sweep f -> f1.
  function noise(dest, { t, dur, vol, type = 'bandpass', f = 2000, f1, q = 1, a = 0.001 }) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.setValueAtTime(f, t);
    if (f1) flt.frequency.exponentialRampToValueAtTime(f1, t + dur);
    flt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt);
    flt.connect(g);
    g.connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.03);
  }

  // A struck bell: fundamental plus two inharmonic partials that die faster.
  function bellAt(dest, f, t, vol, decay = 1.6, detune = 0) {
    tone(dest, { f, t, dur: decay, vol, detune });
    tone(dest, { f: f * 2.756, t, dur: decay * 0.45, vol: vol * 0.32, detune });
    tone(dest, { f: f * 5.404, t, dur: decay * 0.18, vol: vol * 0.14, detune });
  }

  // ───────────── sound effects ─────────────
  const SFX = {
    // solenoid: a short low thump and the click of the plunger seating
    flip(t, v, d) {
      tone(d, { f: 130, f1: 42, t, dur: 0.075, vol: 0.9 * v });
      noise(d, { t, dur: 0.018, vol: 0.5 * v, f: 1900, q: 0.8 });
      noise(d, { t: t + 0.012, dur: 0.05, vol: 0.22 * v, type: 'lowpass', f: 420 });
    },
    // pop bumper: a bell on top of a coil kick
    bumper(t, v, d) {
      const f = 980 + Math.random() * 260;
      bellAt(d, f, t, 0.42 * v, 0.34);
      tone(d, { f: 190, f1: 62, t, dur: 0.09, vol: 0.75 * v });
      noise(d, { t, dur: 0.03, vol: 0.4 * v, type: 'highpass', f: 3200 });
    },
    sling(t, v, d) {
      tone(d, { type: 'square', f: 330, f1: 110, t, dur: 0.06, vol: 0.32 * v });
      noise(d, { t, dur: 0.045, vol: 0.5 * v, type: 'highpass', f: 2400 });
      tone(d, { f: 95, f1: 50, t, dur: 0.07, vol: 0.5 * v });
    },
    // standup target: plastic clack with a short metal ring
    target(t, v, d) {
      noise(d, { t, dur: 0.025, vol: 0.55 * v, f: 3100, q: 1.4 });
      tone(d, { type: 'triangle', f: 640, t, dur: 0.11, vol: 0.4 * v });
      tone(d, { type: 'triangle', f: 963, t, dur: 0.07, vol: 0.22 * v });
      tone(d, { f: 150, f1: 80, t, dur: 0.05, vol: 0.4 * v });
    },
    rollover(t, v, d) {
      tone(d, { f: 1320, f1: 1760, t, dur: 0.09, vol: 0.26 * v });
      tone(d, { f: 2640, t: t + 0.03, dur: 0.07, vol: 0.09 * v });
    },
    // ramp or orbit: the ball running up wire, and a rising whir
    shot(t, v, d) {
      noise(d, { t, dur: 0.42, vol: 0.3 * v, f: 500, f1: 3400, q: 3.5, a: 0.05 });
      tone(d, { type: 'sawtooth', f: 220, f1: 880, t, dur: 0.38, vol: 0.1 * v, a: 0.06 });
      bellAt(d, 1568, t + 0.34, 0.26 * v, 0.6);
    },
    // capture: the ball drops into the cup and the latch closes
    saucer(t, v, d) {
      tone(d, { f: 420, f1: 110, t, dur: 0.22, vol: 0.55 * v });
      noise(d, { t: t + 0.16, dur: 0.03, vol: 0.5 * v, f: 1500, q: 1 });
      tone(d, { f: 80, f1: 48, t: t + 0.16, dur: 0.14, vol: 0.7 * v });
      bellAt(d, 784, t + 0.2, 0.2 * v, 0.9);
    },
    eject(t, v, d) {
      tone(d, { f: 120, f1: 520, t, dur: 0.1, vol: 0.6 * v });
      noise(d, { t, dur: 0.04, vol: 0.45 * v, type: 'highpass', f: 2000 });
      tone(d, { f: 100, f1: 45, t, dur: 0.08, vol: 0.6 * v });
    },
    // the drain swallows: pitch and brightness both fall, with a closing gulp
    drain(t, v, d) {
      tone(d, { f: 210, f1: 34, t, dur: 1.0, vol: 0.8 * v, a: 0.03 });
      tone(d, { type: 'triangle', f: 316, f1: 51, t, dur: 0.9, vol: 0.25 * v, a: 0.03 });
      noise(d, { t, dur: 0.95, vol: 0.4 * v, type: 'lowpass', f: 1800, f1: 70, q: 4, a: 0.04 });
      tone(d, { f: 70, f1: 30, t: t + 0.78, dur: 0.3, vol: 0.7 * v, a: 0.02 });
    },
    // plunger: spring release and the ball leaving up the lane
    launch(t, v, d) {
      tone(d, { type: 'sawtooth', f: 70, f1: 240, t, dur: 0.16, vol: 0.26 * v });
      tone(d, { f: 110, f1: 46, t, dur: 0.09, vol: 0.8 * v });
      noise(d, { t: t + 0.02, dur: 0.4, vol: 0.28 * v, f: 700, f1: 4200, q: 2.5, a: 0.03 });
      tone(d, { f: 620, f1: 590, t: t + 0.01, dur: 0.3, vol: 0.06 * v }); // spring ring
    },
    wall(t, v, d) {
      noise(d, { t, dur: 0.02, vol: 0.3 * v, f: 2300, q: 1.2 });
      tone(d, { f: 180, f1: 110, t, dur: 0.03, vol: 0.25 * v });
    },
    // reels: the pawl clattering over the ratchet as the drums come up to speed
    reelStart(t, v, d) {
      tone(d, { f: 90, f1: 44, t, dur: 0.12, vol: 0.7 * v });               // lever
      let at = t + 0.03;
      for (let i = 0; i < 16; i++) {
        noise(d, { t: at, dur: 0.02, vol: (0.2 + 0.015 * i) * v, f: 1700 + (i % 3) * 420, q: 2 });
        tone(d, { type: 'square', f: 240 + (i % 3) * 30, t: at, dur: 0.02, vol: 0.07 * v });
        at += 0.075 - i * 0.0028;
      }
      tone(d, { type: 'sawtooth', f: 55, f1: 82, t, dur: 0.9, vol: 0.08 * v, a: 0.2 }); // motor
    },
    // one drum stopping: weight landing on the brake, and the detent bell
    reelStop(t, v, d) {
      tone(d, { f: 105, f1: 48, t, dur: 0.14, vol: 0.9 * v });
      noise(d, { t, dur: 0.03, vol: 0.55 * v, f: 1300, q: 0.9 });
      noise(d, { t: t + 0.04, dur: 0.02, vol: 0.2 * v, f: 2600, q: 2 });
      bellAt(d, 1244, t + 0.01, 0.16 * v, 0.5);
    },
    payout(t, v, d) {
      for (let i = 0; i < 9; i++) {
        const at = t + i * 0.07 + Math.random() * 0.025;
        const f = 2300 + Math.random() * 2400;
        tone(d, { f, t: at, dur: 0.16, vol: 0.2 * v });
        tone(d, { f: f * 1.47, t: at, dur: 0.1, vol: 0.12 * v });
        noise(d, { t: at, dur: 0.015, vol: 0.2 * v, type: 'highpass', f: 5000 });
      }
      tone(d, { f: 100, f1: 60, t, dur: 0.1, vol: 0.4 * v });               // hopper
    },
    jackpot(t, v, d) {
      [72, 76, 79, 84, 88, 91].forEach((m, i) => bellAt(d, mtof(m), t + i * 0.085, 0.3 * v, 1.4));
      tone(d, { f: 65.4, t, dur: 1.4, vol: 0.5 * v, a: 0.02 });
      for (let i = 0; i < 22; i++) {
        const at = t + 0.3 + i * 0.055 + Math.random() * 0.03;
        const f = 2200 + Math.random() * 2800;
        tone(d, { f, t: at, dur: 0.14, vol: 0.13 * v });
        tone(d, { f: f * 1.47, t: at, dur: 0.09, vol: 0.07 * v });
      }
    },
    // nothing lands: the machine swallows the stake
    bust(t, v, d) {
      tone(d, { f: 147, f1: 46, t, dur: 0.85, vol: 0.7 * v, a: 0.02 });
      tone(d, { f: 156, f1: 49, t, dur: 0.85, vol: 0.5 * v, a: 0.02 });     // a semitone of beating
      noise(d, { t, dur: 0.7, vol: 0.3 * v, type: 'lowpass', f: 900, f1: 60, q: 3, a: 0.03 });
      tone(d, { f: 62, f1: 30, t: t + 0.6, dur: 0.3, vol: 0.6 * v, a: 0.02 });
    },
    // the Mint's stamp coming down on a note of hand, then two falling notes
    loan(t, v, d) {
      tone(d, { f: 120, f1: 40, t, dur: 0.2, vol: 0.95 * v });
      noise(d, { t, dur: 0.06, vol: 0.5 * v, type: 'lowpass', f: 700 });
      noise(d, { t: t + 0.12, dur: 0.25, vol: 0.1 * v, type: 'highpass', f: 4000, a: 0.05 }); // paper
      bellAt(d, mtof(63), t + 0.22, 0.24 * v, 1.2);
      bellAt(d, mtof(60), t + 0.5, 0.26 * v, 1.8, -18);
    },
    // the Commons gives: the first two notes of the lullaby, warm, unhurried
    aid(t, v, d) {
      const pad = (m, at, dur) => {
        tone(d, { type: 'triangle', f: mtof(m), t: at, dur, vol: 0.2 * v, a: 0.05 });
        tone(d, { f: mtof(m + 12), t: at, dur: dur * 0.7, vol: 0.1 * v, a: 0.05 });
      };
      pad(64, t, 0.9);
      pad(67, t + 0.26, 1.3);
      pad(48, t, 1.5);
      noise(d, { t, dur: 0.5, vol: 0.05 * v, f: 2400, q: 1, a: 0.2 });
    },
    objective(t, v, d) {
      bellAt(d, mtof(79), t, 0.3 * v, 0.6);
      bellAt(d, mtof(86), t + 0.1, 0.32 * v, 1.1);
    },
    // a scene closes: the whole lullaby, struck, over a held fifth
    sceneClear(t, v, d) {
      MOTIF.major.forEach((s, i) => bellAt(d, mtof(72 + s), t + [0, 0.2, 0.4, 0.7][i], 0.3 * v, i === 3 ? 2.4 : 1.2));
      tone(d, { type: 'triangle', f: mtof(48), t, dur: 2.2, vol: 0.28 * v, a: 0.03 });
      tone(d, { type: 'triangle', f: mtof(55), t, dur: 2.2, vol: 0.18 * v, a: 0.03 });
      noise(d, { t: t + 0.7, dur: 1.2, vol: 0.05 * v, type: 'highpass', f: 6000, a: 0.02 });
    },
    // chapter card: a low struck beam and air moving in a large room
    card(t, v, d) {
      tone(d, { f: 58, f1: 41, t, dur: 2.2, vol: 0.9 * v, a: 0.004 });
      tone(d, { f: 87.3, t, dur: 1.6, vol: 0.3 * v, a: 0.004 });
      bellAt(d, 174.6, t, 0.2 * v, 2.6, -9);
      noise(d, { t, dur: 0.05, vol: 0.5 * v, type: 'lowpass', f: 500 });
      noise(d, { t, dur: 1.8, vol: 0.08 * v, f: 900, f1: 300, q: 1.5, a: 0.5 });
    },
    confirm(t, v, d) {
      noise(d, { t, dur: 0.012, vol: 0.3 * v, f: 2800, q: 1.5 });
      tone(d, { f: 660, t, dur: 0.06, vol: 0.18 * v });
      tone(d, { f: 990, t: t + 0.035, dur: 0.08, vol: 0.14 * v });
    },
  };

  // Simultaneous physics events would stack the same sample into a click.
  const MIN_GAP = { wall: 0.045, bumper: 0.03, flip: 0.02 };
  const lastSfx = {};

  function sfx(name, vol = 1) {
    const make = SFX[name];
    if (!make) throw new Error(`audio.sfx: unknown sound "${name}"`);
    if (typeof vol !== 'number' || Number.isNaN(vol)) throw new Error(`audio.sfx: bad volume ${vol} for "${name}"`);
    // A suspended context has a frozen clock: anything scheduled now would all
    // fire together on resume. Before the first gesture there is no sound.
    if (ctx.state !== 'running') return;
    // Measured in Chrome: for a moment after resume() the state reads 'running'
    // while currentTime is still 0. The gap check below then lets one of each
    // sound through and drops the repeats, so nothing stacks up when it starts.
    const t = ctx.currentTime;
    if (t - (lastSfx[name] ?? -1) < (MIN_GAP[name] ?? 0.012)) return;
    lastSfx[name] = t;
    make(t + 0.004, Math.max(0, Math.min(1.5, vol)), sfxBus);
  }

  // ───────────── instruments (each bound to one mood's bus) ─────────────
  function instruments(out) {
    const I = {
      // sustained chord: two detuned oscillators per note through one lowpass
      pad(notes, t, dur, vol, { type = 'sawtooth', cut = 900, att = 0.9, rel = 1.6, spread = 7 } = {}) {
        const flt = ctx.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.setValueAtTime(cut * 0.6, t);
        flt.frequency.linearRampToValueAtTime(cut, t + att);
        flt.frequency.linearRampToValueAtTime(cut * 0.7, t + dur + rel);
        flt.Q.value = 0.5;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vol, t + att);
        g.gain.setValueAtTime(vol, t + Math.max(att, dur));
        g.gain.linearRampToValueAtTime(0, t + Math.max(att, dur) + rel);
        flt.connect(g);
        g.connect(out);
        const end = t + Math.max(att, dur) + rel + 0.05;
        for (const m of notes) {
          for (const dt of [-spread, spread]) {
            const o = ctx.createOscillator();
            o.type = type;
            o.frequency.value = mtof(m);
            o.detune.value = dt;
            o.connect(flt);
            o.start(t);
            o.stop(end);
          }
        }
      },
      // plucked string: bright attack whose filter closes as it decays
      pluck(m, t, vol, { type = 'triangle', cut = 2600, decay = 0.5 } = {}) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = mtof(m);
        const flt = ctx.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.setValueAtTime(cut, t);
        flt.frequency.exponentialRampToValueAtTime(Math.max(200, cut * 0.2), t + decay);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
        o.connect(flt);
        flt.connect(g);
        g.connect(out);
        o.start(t);
        o.stop(t + decay + 0.03);
      },
      bell(m, t, vol, { decay = 2.2, detune = 0 } = {}) {
        bellAt(out, mtof(m), t, vol, decay, detune);
      },
      bass(m, t, dur, vol, { type = 'triangle', cut = 500 } = {}) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = mtof(m);
        const flt = ctx.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.value = cut;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vol, t + 0.015);
        g.gain.setValueAtTime(vol, t + Math.max(0.02, dur * 0.7));
        g.gain.linearRampToValueAtTime(0, t + dur);
        o.connect(flt);
        flt.connect(g);
        g.connect(out);
        o.start(t);
        o.stop(t + dur + 0.03);
      },
      // someone whistling: a sine that scoops up to pitch, vibrato arriving late, breath
      whistle(m, t, dur, vol) {
        const f = mtof(m);
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(f * 0.972, t);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.09);
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 5.3;
        const depth = ctx.createGain();
        depth.gain.setValueAtTime(0, t);
        depth.gain.linearRampToValueAtTime(0, t + Math.min(0.35, dur * 0.4));
        depth.gain.linearRampToValueAtTime(f * 0.006, t + dur);
        lfo.connect(depth);
        depth.connect(o.frequency);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vol, t + 0.07);
        g.gain.setValueAtTime(vol, t + dur * 0.75);
        g.gain.linearRampToValueAtTime(0, t + dur);
        o.connect(g);
        g.connect(out);
        o.start(t); lfo.start(t);
        o.stop(t + dur + 0.03); lfo.stop(t + dur + 0.03);
        noise(out, { t, dur, vol: vol * 0.1, f, q: 6, a: 0.05 });
      },
      kick(t, vol, f = 110) {
        tone(out, { f, f1: f * 0.38, t, dur: 0.22, vol });
        noise(out, { t, dur: 0.012, vol: vol * 0.25, type: 'lowpass', f: 900 });
      },
      hat(t, vol, decay = 0.04) {
        noise(out, { t, dur: decay, vol, type: 'highpass', f: 7000 });
      },
      snare(t, vol) {
        noise(out, { t, dur: 0.11, vol, f: 2200, q: 0.6 });
        tone(out, { type: 'triangle', f: 210, f1: 150, t, dur: 0.07, vol: vol * 0.6 });
      },
      tick(t, vol, f = 1800) {
        noise(out, { t, dur: 0.018, vol, f, q: 3 });
      },
      block(t, vol, f = 820) {
        tone(out, { f, t, dur: 0.07, vol });
        tone(out, { f: f * 1.51, t, dur: 0.04, vol: vol * 0.5 });
      },
      // iron on iron, somewhere down a gallery
      clank(t, vol) {
        for (const [r, a] of [[1, 1], [1.83, 0.6], [2.41, 0.4], [3.17, 0.25]]) {
          tone(out, { type: 'square', f: 412 * r, t, dur: 0.5 / r + 0.1, vol: vol * a * 0.4 });
        }
        noise(out, { t, dur: 0.02, vol: vol * 0.6, f: 3000, q: 0.7 });
      },
      air(t, dur, vol, f = 1200, f1 = 500) {
        noise(out, { t, dur, vol, f, f1, q: 1.2, a: dur * 0.5 });
      },
      // thunder a long way off, or a sea falling on a deck: a crack, then the roll
      rumble(t, dur, vol) {
        noise(out, { t, dur: 0.09, vol: vol * 0.5, type: 'highpass', f: 1800, a: 0.002 });
        noise(out, { t: t + 0.03, dur, vol, type: 'lowpass', f: 320, f1: 45, q: 0.7, a: 0.06 });
        tone(out, { f: 62, f1: 31, t: t + 0.03, dur: dur * 0.6, vol: vol * 0.7, a: 0.02 });
      },
      // steady hiss: rain on canvas, spray. Even level, soft edges, meant to overlap itself
      wash(t, dur, vol, f = 5200) {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        src.loop = true;
        const flt = ctx.createBiquadFilter();
        flt.type = 'highpass';
        flt.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vol, t + dur * 0.3);
        g.gain.setValueAtTime(vol, t + dur * 0.7);
        g.gain.linearRampToValueAtTime(0, t + dur);
        src.connect(flt);
        flt.connect(g);
        g.connect(out);
        src.start(t, Math.random() * 1.5);
        src.stop(t + dur + 0.03);
      },
      // one phrase of the lullaby: seven even steps, the last one held.
      // play(m, t, len, i) sounds one note; len is in seconds.
      phrase(notes, tonic, t, s, play) {
        if (!Array.isArray(notes) || notes.length !== 7) throw new Error(`audio: a lullaby phrase is seven notes, got ${JSON.stringify(notes)}`);
        notes.forEach((semi, i) => play(tonic + semi, t + i * s, i === 6 ? s * 2 : s, i));
      },
    };
    return I;
  }

  // ───────────── the moods ─────────────
  // step(k, t, s, I, n): k = step within the loop, t = when, s = seconds per
  // step, I = instruments, n = how many times the loop has come round.
  // div = steps per beat.
  const SCORE = {
    // D minor, slow. The tune is begun on a bell and not finished.
    title: {
      bpm: 66, div: 2, len: 64, vol: 0.9, send: 0.55,
      step(k, t, s, I, n) {
        const bar = k >> 3, b = k & 7;
        const chords = [[50, 57, 60, 65], [46, 53, 58, 62], [41, 53, 57, 60], [48, 55, 60, 62]];
        const c = chords[bar % 4];
        if (b === 0) {
          I.pad(c, t, s * 8, 0.035, { cut: 700 + 200 * (bar % 2) });
          I.bass(c[0] - 12, t, s * 7.5, 0.22, { type: 'sine' });
        }
        if (bar < 4) {
          const at = { 0: 0, 4: 1, 8: 2 }[k];                        // mi, sol, re ... and no do
          if (at !== undefined) I.bell(74 + MOTIF.minor[at], t, 0.14, { decay: 3 });
        } else if (b === 2 || b === 5) {
          I.pluck(c[1 + ((bar + b) % 3)] + 12, t, 0.07, { decay: 1.2, cut: 1800 });
        }
        if (bar === 7 && b === 4 && n % 2 === 1) I.bell(74, t, 0.1, { decay: 4 });  // every other time, home
      },
    },

    // G major in a lilting six: plucked dance tune, hand drum, shaker.
    festival: {
      bpm: 112, div: 3, len: 96, vol: 0.85, send: 0.25,
      step(k, t, s, I, n) {
        const bar = Math.floor(k / 12), b = k % 12;
        const scale = [67, 69, 71, 72, 74, 76, 78, 79, 81, 83];
        const tune = [
          '2.47..5.42..', '4..2.10.....', '3.57..8.75..', '4..6.41.....',
          '5.79..8.75..', '7..5.35.....', '4.68..7.64..', '7..4.20.....',
        ][bar];
        const roots = [43, 43, 48, 50, 52, 48, 50, 43][bar];
        const third = [59, 59, 64, 66, 67, 64, 66, 59][bar];
        const ch = tune[b];
        if (ch !== '.') I.pluck(scale[+ch] + (n % 4 === 3 ? 12 : 0), t, 0.16, { decay: 0.45, cut: 3400 });
        if (b === 0) { I.kick(t, 0.4, 95); I.bass(roots, t, s * 4, 0.3); }
        if (b === 6) { I.kick(t, 0.25, 120); I.bass(roots + 7, t, s * 3, 0.22); }
        if (b === 3 || b === 9) { I.tick(t, 0.16, 1400); I.pluck(third, t, 0.07, { decay: 0.2 }); I.pluck(third + 3, t, 0.06, { decay: 0.2 }); }
        if (b % 3 !== 0 || b === 9) I.hat(t, b % 3 === 2 ? 0.05 : 0.03, 0.03);
        if (b === 0 && bar % 2 === 0) I.pad([roots + 12, third, roots + 19], t, s * 22, 0.02, { cut: 1200, att: 0.4 });
      },
    },

    // E minor: a pulse that will not sit down.
    tense: {
      bpm: 96, div: 4, len: 64, vol: 1.0, send: 0.3,
      step(k, t, s, I, n) {
        const bar = k >> 4, b = k & 15;
        const root = [40, 40, 36, 35][bar];
        const pads = [[52, 59, 66], [52, 59, 67], [48, 55, 64], [47, 54, 63]][bar];
        if (b % 2 === 0) I.bass(root, t, s * 1.5, b % 8 === 0 ? 0.3 : 0.18, { type: 'sawtooth', cut: 260 });
        if ('x.xx.x.xx.x.x.xx'[b] === 'x') {
          const arp = [64, 67, 71, 67, 66, 67, 71, 74][(b + bar) % 8] + (bar === 3 ? -1 : 0);
          I.pluck(arp, t, 0.07, { decay: 0.14, cut: 1100 });
        }
        if (b === 0) { I.pad(pads, t, s * 15, 0.03, { cut: 800, att: 0.5, rel: 0.8 }); I.kick(t, 0.35, 80); }
        if (b === 4 || b === 12) I.hat(t, 0.05);
        if (b === 10 && bar % 2 === 1) I.tick(t, 0.12, 2400);
        if (bar === 3 && b === 8 && n % 2 === 1) I.air(t, s * 8, 0.05, 600, 2400);
      },
    },

    // F sharp minor, swung. The lullaby in pieces: two notes, a gap, the third
    // an octave down and late, and where home should be, the flat second.
    covert: {
      bpm: 84, div: 4, len: 64, vol: 0.85, send: 0.3,
      step(k, t0, s, I, n) {
        const bar = k >> 4, b = k & 15;
        const t = t0 + (b % 2 === 1 ? s * 0.3 : 0);                   // swing the off sixteenths
        const walk = { 0: 42, 3: 42, 6: 45, 8: 44, 11: 42, 14: 40 };
        const walk2 = { 0: 38, 3: 38, 6: 42, 8: 41, 11: 38, 14: 37 };
        const w = (bar === 2 ? walk2 : walk)[b];
        if (w !== undefined) I.bass(w, t, s * 1.6, 0.3, { cut: 380 });
        if (b === 4 || b === 12) I.tick(t, 0.14, 2000);
        if (b === 10 || (b === 15 && bar === 3)) I.tick(t, 0.07, 3200);
        if (b === 0 && bar % 2 === 0) I.pad([54, 61, 64, 68], t, s * 28, 0.018, { cut: 650, type: 'triangle' });
        const tonic = 66;
        if (n % 2 === 0) {
          if (bar === 1 && b === 2) I.pluck(tonic + MOTIF.minor[0], t, 0.13, { decay: 0.16 });
          if (bar === 1 && b === 5) I.pluck(tonic + MOTIF.minor[1], t, 0.13, { decay: 0.16 });
          if (bar === 2 && b === 9) I.pluck(tonic + MOTIF.minor[2] - 12, t, 0.13, { decay: 0.3 });
          if (bar === 3 && b === 6) I.pluck(tonic + 1, t, 0.1, { decay: 0.5, cut: 1500 });
        } else {                                                     // backwards, and abandoned
          if (bar === 1 && b === 3) I.pluck(tonic, t, 0.11, { decay: 0.16 });
          if (bar === 1 && b === 6) I.pluck(tonic + MOTIF.minor[2], t, 0.11, { decay: 0.16 });
          if (bar === 3 && b === 1) I.pluck(tonic + MOTIF.minor[1] - 1, t, 0.09, { decay: 0.6, cut: 1500 });
        }
      },
    },

    // A minor. The lullaby with its third phrase gone: a bell first, then whistled.
    // Phrase 1, phrase 2, a bar in which only the chord that belonged under
    // "who goes out comes home again" is played, then phrase 4. The whistler gets
    // as far as the breath for the third and has nothing to put on it.
    sorrow: {
      bpm: 54, div: 2, len: 64, vol: 0.75, send: 0.6,
      step(k, t, s, I) {
        const bar = k >> 3, b = k & 7;
        const chords = [[45, 52, 57, 60], [40, 52, 55, 59], [41, 53, 57, 60], [45, 52, 57, 60],
          [45, 52, 57, 60], [40, 52, 55, 59], [41, 53, 57, 60], [45, 52, 57, 64]];
        const c = chords[bar];
        if (b === 0) {
          I.pad(c.slice(1), t, s * 8, 0.035, { cut: 650, att: 1.2 });
          I.bass(c[0] - 12, t, s * 7, 0.2, { type: 'sine' });
        }
        const lost = bar % 4 === 2;
        if (b === 4 && !lost) I.pluck(c[2], t, 0.04, { decay: 1.4, cut: 1200 });
        if (b !== 0) return;
        if (lost) {
          if (bar === 6) I.air(t, s * 3, 0.03, 1800, 900);          // the breath, and no note
          return;
        }
        const ph = LULLABY.minor[bar % 4];
        if (bar < 4) {
          I.phrase(ph, 69, t, s, (m, at, len, i) => I.bell(m, at, i % 2 === 0 ? 0.14 : 0.09, { decay: i === 6 ? (bar === 3 ? 4.5 : 3) : 1.3 }));
        } else {
          I.phrase(ph, 69, t, s, (m, at, len) => I.whistle(m, at, len * 0.94, 0.065));
        }
      },
    },

    // C major. The lullaby plainly, all four phrases, over the chords it was
    // written for: struck on a bell, then whistled (every other time round the
    // whistle rests and a low bell rows it instead).
    hope: {
      bpm: 72, div: 2, len: 64, vol: 1.15, send: 0.45,
      step(k, t, s, I, n) {
        const bar = k >> 3, b = k & 7;
        // C | Em | F | C over G, twice; the last bar comes down onto the root
        const chords = [[48, 55, 60, 64], [52, 55, 59, 62], [41, 53, 57, 60], [43, 55, 60, 64],
          [48, 55, 60, 64], [52, 55, 59, 62], [41, 53, 57, 60], [48, 55, 60, 64]];
        const c = chords[bar];
        if (b === 0) {
          I.pad(c.slice(1), t, s * 8, 0.03, { cut: 1100, att: 0.7 });
          I.bass(c[0] - 12, t, s * 6, 0.24);
        }
        I.pluck(c[[1, 2, 3, 2, 1, 3, 2, 3][b]], t, b === 0 ? 0.05 : 0.03, { decay: 0.7, cut: 2000 });
        if (b === 0) {
          const ph = LULLABY.major[bar % 4];
          const last = bar % 4 === 3;
          if (bar < 4) {
            I.phrase(ph, 72, t, s, (m, at, len, i) => I.bell(m, at, i % 2 === 0 ? 0.16 : 0.11, { decay: i === 6 ? (last ? 3.5 : 2.4) : 1.1 }));
          } else if (n % 2 === 1) {
            I.phrase(ph, 72, t, s, (m, at, len) => I.whistle(m, at, len * 0.94, 0.075));
          } else {
            I.phrase(ph, 60, t, s, (m, at, len, i) => I.bell(m, at, i % 2 === 0 ? 0.13 : 0.08, { decay: i === 6 ? 3 : 1.2 }));
          }
        }
        if (bar >= 4 && (b === 0 || b === 4)) I.kick(t, 0.16, 70);     // the stroke of the oars
      },
    },

    // D dorian. Boots, a field drum, and horns that have been told what to play.
    march: {
      bpm: 100, div: 4, len: 64, vol: 0.85, send: 0.3,
      step(k, t, s, I, n) {
        const bar = k >> 4, b = k & 15;
        const chords = [[50, 57, 62, 65], [48, 55, 60, 64], [46, 53, 58, 62], [45, 52, 57, 61]];
        const c = chords[bar];
        const roll = 'x..xx.xxx..xxxxx'[b] === 'x';
        if (roll) I.snare(t, b % 4 === 0 ? 0.16 : 0.07);
        if (b === 0 || b === 8) { I.kick(t, 0.5, 78); I.bass(c[0] - 12 + (b === 8 ? 7 : 0), t, s * 6, 0.3, { type: 'sawtooth', cut: 220 }); }
        if (b === 0) I.pad(c.slice(1), t, s * 11, 0.035, { cut: 1500, att: 0.06, rel: 0.4, spread: 4 });
        const lead = [
          { 0: 62, 6: 65, 8: 69 }, { 0: 67, 6: 64, 8: 60 }, { 0: 58, 6: 62, 8: 65 }, { 0: 64, 8: 57, 12: 61 },
        ][bar][b];
        if (lead !== undefined && n % 2 === 1) I.pad([lead + 12], t, s * (b === 8 ? 6 : 4), 0.035, { type: 'square', cut: 1800, att: 0.04, rel: 0.25, spread: 3 });
      },
    },

    // B minor. A drone, water somewhere, and iron struck far down a gallery.
    mine: {
      bpm: 60, div: 2, len: 64, vol: 0.7, send: 0.7,
      step(k, t, s, I, n) {
        const bar = k >> 3, b = k & 7;
        if (k % 16 === 0) {
          I.pad([35, 42], t, s * 16, 0.07, { type: 'triangle', cut: 400, att: 2, rel: 2.5, spread: 5 });
          I.bass(23, t, s * 14, 0.22, { type: 'sine' });
        }
        if ((bar === 0 && b === 3) || (bar === 3 && b === 6) || (bar === 5 && b === 1)) {
          I.clank(t, 0.2);
          I.clank(t + 0.41, 0.07);
          I.clank(t + 0.82, 0.025);
        }
        const penta = [71, 74, 76, 78, 81, 83, 86];
        const r = scatter(k, n % 4);
        if (r > 0.8) I.pluck(penta[Math.floor(scatter(k + 5, n) * penta.length)], t + r * 0.1, 0.07, { decay: 0.9, cut: 4200, type: 'sine' });
        if (bar === 6 && b === 0) I.pad([59, 66, 69], t, s * 12, 0.02, { cut: 900, att: 2 });
        if (b === 0 && bar % 2 === 1) I.kick(t, 0.25, 50);
      },
    },

    // D minor. Procedure: a harpsichord figure over a bass that walks, and the block.
    court: {
      bpm: 76, div: 4, len: 64, vol: 0.85, send: 0.35,
      step(k, t, s, I, n) {
        const bar = k >> 4, b = k & 15;
        const chords = [[62, 65, 69, 74], [62, 67, 70, 74], [61, 64, 69, 73], [62, 65, 69, 74]];
        const walks = [[50, 53, 57, 53], [43, 46, 50, 46], [45, 49, 52, 45], [50, 45, 38, null]];
        const c = chords[bar];
        if (b % 2 === 0) {
          const idx = [0, 2, 1, 2, 3, 2, 1, 2][b >> 1];
          I.pluck(c[idx], t, b === 0 ? 0.1 : 0.07, { type: 'sawtooth', cut: 5200, decay: 0.32 });
        }
        if (b % 4 === 0) {
          const w = walks[bar][b >> 2];
          if (w !== null) I.bass(w, t, s * 3.6, 0.26, { cut: 600 });
        }
        if (k === 0) I.block(t, 0.3);
        if (bar === 3 && b === 12) { I.block(t, 0.16); I.block(t + s * 2, 0.22); }
        const top = [{ 4: 81, 10: 77 }, { 4: 79, 10: 82 }, { 4: 76, 10: 81 }, { 0: 77, 6: 74 }][bar][b];
        if (top !== undefined && n % 2 === 1) I.pluck(top, t, 0.08, { type: 'sawtooth', cut: 4200, decay: 0.7 });
      },
    },

    // E lydian. Open fifths, glass, and the brass works of the Orrery turning.
    shrine: {
      bpm: 48, div: 2, len: 64, vol: 0.7, send: 0.8,
      step(k, t, s, I, n) {
        const bar = k >> 3, b = k & 7;
        if (k % 16 === 0) {
          const c = (k / 16) % 2 === 0 ? [52, 59, 64] : [54, 61, 66];
          I.pad(c, t, s * 16, 0.04, { type: 'triangle', cut: 1400, att: 2.5, rel: 3 });
        }
        if (k === 0) I.bass(28, t, s * 30, 0.12, { type: 'sine' });
        if (b % 2 === 0) I.tick(t, b === 0 ? 0.05 : 0.025, 3600);       // the escapement
        const glass = [76, 78, 80, 82, 83, 85, 88];
        const r = scatter(k + 11, n % 3);
        if (r > 0.72) I.bell(glass[Math.floor(scatter(k, n + 3) * glass.length)], t, 0.07, { decay: 4 });
        if (bar === 4 && b === 0) I.bell(64 + MOTIF.major[0] + 12, t, 0.09, { decay: 5 });   // one note of it, held
      },
    },

    // C, no mode worth naming. The lullaby upside down on a cracked bell, ending
    // a semitone short. Two low thuds for a heart.
    dread: {
      bpm: 50, div: 2, len: 64, vol: 0.6, send: 0.65,
      step(k, t, s, I, n) {
        const bar = k >> 3, b = k & 7;
        if (k % 16 === 0) {
          I.pad([36, 37], t, s * 16, 0.06, { type: 'sawtooth', cut: 220, att: 3, rel: 3, spread: 11 });
          I.bass(24, t, s * 15, 0.17, { type: 'sine' });
        }
        if (b === 0 || b === 4) { I.kick(t, 0.4, 52); I.kick(t + 0.27, 0.26, 46); }
        const place = { 20: 0, 28: 1, 36: 2, 46: 3 };
        if (place[k] !== undefined) {
          I.bell(60 + MOTIF.inverted[place[k]], t, 0.12, { decay: 3.5, detune: place[k] === 3 ? -35 : -14 });
        }
        if (bar === 6 && b === 2) I.air(t, s * 10, 0.05, 3000, 5000);
        if (bar === 7 && b === 4 && n % 2 === 1) I.pad([73, 74], t, s * 4, 0.012, { cut: 3000, att: 1.5, rel: 1 });
      },
    },

    // B flat, and proud of it: field drum, a bugle call, the brass under it. But
    // the brass plays bare fifths, so the chords are the right shape with nothing
    // in them, and every third there is belongs to the bugle. The call is answered
    // the first time. The second time it comes from further off, the answer is
    // left to the drum, and the last bar stops on a bare fifth.
    academy: {
      bpm: 104, div: 4, len: 128, vol: 0.85, send: 0.4,
      step(k, t, s, I, n) {
        const bar = k >> 4, b = k & 15;
        const roots = [46, 46, 51, 53, 46, 43, 51, 53][bar];           // Bb Bb Eb F | Bb G Eb F
        if (b === 0) {
          I.pad([roots, roots + 7, roots + 12], t, s * 13, 0.04, { type: 'triangle', cut: 1300, att: 0.08, rel: 0.5, spread: 3 });
        }
        if (b === 0 || b === 8) {
          I.kick(t, 0.45, 76);
          I.bass(roots - 12 + (b === 8 ? 7 : 0), t, s * 5, 0.28, { type: 'sawtooth', cut: 210 });
        }
        if ('x...x.xxx...x.xx'[b] === 'x') I.snare(t, b % 8 === 4 ? 0.14 : 0.06);
        if (bar === 7 && b >= 12) I.snare(t + s * 0.5, 0.05);          // the roll into the repeat
        const horn = (m, steps, vol = 0.04) => I.pad([m], t, s * steps, vol, { type: 'square', cut: 1700, att: 0.03, rel: 0.2, spread: 3 });
        const call = [
          { 0: [58, 3], 3: [58, 1], 4: [62, 4], 8: [65, 6] },           // Bb . Bb D  F
          { 0: [70, 6], 8: [65, 3], 11: [62, 1], 12: [65, 4] },         // Bb'   F . D F
          { 0: [67, 4], 4: [70, 4], 8: [67, 3], 11: [63, 1], 12: [67, 4] },   // the answer: G Bb G Eb G
          { 0: [65, 6], 8: [69, 3], 12: [72, 4] },                      // F  A  C
        ][bar];
        if (call && call[b]) horn(call[b][0], call[b][1]);
        if (bar === 4 || bar === 5) {                                   // the call again, an octave down, further off
          const again = [{ 0: [46, 3], 3: [46, 1], 4: [50, 4], 8: [53, 6] }, { 0: [58, 6], 8: [53, 3], 11: [50, 1], 12: [53, 4] }][bar - 4];
          if (again[b]) horn(again[b][0] + (n % 2 === 1 ? 12 : 0), again[b][1], 0.03);
        }
        // bars 6 and 7: where the answer was, the drum, and one flat seventh nobody ordered
        if (bar === 6 && b === 8) I.pad([68], t, s * 8, 0.012, { type: 'triangle', cut: 900, att: 0.6, rel: 1 });
        if (bar === 7 && b === 0) I.bell(65, t, 0.06, { decay: 3, detune: -8 });
      },
    },

    // C sharp minor in a rolling six. Wind that changes its mind, a bass figure
    // that climbs each sea and is thrown back, rain, thunder not on any beat that
    // can be counted, and a bell-buoy a quarter-tone off everything else.
    storm: {
      bpm: 76, div: 6, len: 96, vol: 0.9, send: 0.5,
      step(k, t, s, I, n) {
        const bar = Math.floor(k / 24), b = k % 24;                     // four bars of 4 beats, six to the beat
        const root = [37, 37, 33, 32][bar];                             // C# C# A G#
        if (b % 12 === 0) I.wash(t, s * 18, 0.035, 4800 + 900 * ((bar + n) % 2));
        if (b === 0) {
          const up = (bar + n) % 2 === 0;
          I.air(t, s * 26, 0.11, up ? 350 : 1500, up ? 1500 : 300);     // the gust: rising one bar, falling the next
          I.pad([root + 12, root + 19, root + 24, root + 27], t, s * 22, 0.03, { cut: 520, att: 1.4, rel: 1.2, spread: 12 });
          I.bass(root - 12, t, s * 22, 0.2, { type: 'sine' });
        }
        // the sea: up the minor chord in sixes, cut short where it breaks
        const climb = [0, 7, 12, 15, 19, 24, 19, 15, 12, 7, 3, 0][b % 12];
        const breaks = b >= 18 && bar % 2 === 1;
        if (!breaks) I.bass(root + climb, t, s * 1.3, b % 6 === 0 ? 0.24 : 0.12, { type: 'sawtooth', cut: 240 + climb * 14 });
        if (breaks && b === 18) { I.kick(t, 0.5, 58); I.rumble(t, 1.4, 0.16); }
        if (b === 0 || b === 12) I.kick(t, 0.38, 54);
        if (bar >= 2 && b % 3 === 0) I.pluck(root + 36 + (b % 6 === 0 ? 3 : 7), t, 0.035, { type: 'sawtooth', cut: 2400, decay: 0.12 });
        // thunder: placed by the scatter, a different pair of places each time round for four rounds
        if (b % 6 === 2 && scatter(k + 3, n % 4) > 0.86) I.rumble(t + scatter(k, n) * s * 3, 2.6, 0.3);
        // the buoy: two strokes, the second as the swell lets go of it
        if ((bar === 1 && b === 9) || (bar === 3 && b === 3)) {
          I.bell(68, t, 0.09, { decay: 2.8, detune: -45 });
          I.bell(68, t + s * 4.3, 0.045, { decay: 2.2, detune: -45 });
        }
      },
    },

    // G, with the fourth raised, in five: three and two, the way a net is pulled
    // and then shaken out. Plucked tune, a drone that never moves, a hand drum.
    // Plain and warm; the C sharp and the short bar are the strangeness. In the
    // seventh bar the tune is the lullaby's third phrase, the lost one. Nobody on
    // Little Brand was ever told it was lost.
    village: {
      bpm: 92, div: 2, len: 80, vol: 0.9, send: 0.3,
      step(k, t, s, I, n) {
        const bar = Math.floor(k / 10), b = k % 10;
        const scale = [67, 69, 71, 73, 74, 76, 78, 79, 81, 83];         // G A B C# D E F# G A B
        const tune = [
          '0.2.4..2.1', '0..2.4.5.4', '4.5.7..5.4', '3..2.1.0..',
          '0.2.4..2.1', '4..5.7.8.7', '..........', '4..2.1.0..',
        ][bar];
        const ch = tune[b];
        if (ch !== '.') I.pluck(scale[+ch], t, b === 0 || b === 6 ? 0.15 : 0.11, { decay: 0.6, cut: 2000 });
        if (bar === 6 && b === 0) {
          I.phrase(LULLABY.major[2], 67, t, s, (m, at, len, i) => I.pluck(m, at, i % 2 === 0 ? 0.15 : 0.11, { decay: i === 6 ? 1.4 : 0.6, cut: 2000 }));
        }
        // the drone: root and fifth, restruck on the three and on the two
        if (b === 0) { I.bass(43, t, s * 5.5, 0.26); I.pluck(62, t, 0.05, { decay: 1.2, cut: 1200 }); I.kick(t, 0.24, 118); }
        if (b === 6) { I.bass(50, t, s * 3.5, 0.16); I.kick(t, 0.14, 150); }
        if (b === 3 || b === 8) I.tick(t, 0.06, 1100);
        if (b === 0 && bar % 2 === 0) I.pad([55, 62, 67], t, s * 19, 0.028, { type: 'triangle', cut: 1000, att: 0.8, rel: 1.2, spread: 5 });
        // every other time round, someone joins in a third below, late, and only on the strong notes
        if (n % 2 === 1 && ch !== '.' && (b === 0 || b === 6) && +ch >= 2) I.pluck(scale[+ch - 2], t + s * 0.08, 0.06, { type: 'sine', decay: 0.8, cut: 1500 });
      },
    },

    // A minor that will not stay there: an escapement ticking sixteenths, a
    // figure in threes laid across a bar of four so it never lines up twice, and
    // a root that moves up every two bars and ends on a dominant, wound to go
    // round again. One bell opens the floor. The high blips are prices.
    exchange: {
      bpm: 126, div: 4, len: 128, vol: 0.8, send: 0.22,
      step(k, t, s, I, n) {
        const bar = k >> 4, b = k & 15;
        const root = [45, 45, 48, 48, 50, 50, 52, 52][bar];             // A A C C D D E E
        const third = [3, 3, 4, 4, 3, 3, 4, 4][bar];
        const top = bar === 7 ? 10 : 12;                                // the last bar is a seventh chord
        const chord = [root + 12, root + 12 + third, root + 19, root + 12 + top];
        I.tick(t, b % 4 === 0 ? 0.09 : 0.035, b % 2 === 0 ? 3000 : 4300);          // the escapement
        if (k % 3 === 0) {                                              // threes against the four
          const i = (k / 3) % 4;
          I.pluck(chord[[0, 2, 1, 3][i]], t, i === 0 ? 0.085 : 0.06, { type: 'sawtooth', cut: 3600, decay: 0.16 });
        }
        if (b === 0 || b === 6 || b === 12) I.bass(root - (b === 12 ? 0 : 12) + (b === 6 ? 7 : 0), t, s * 2.2, b === 0 ? 0.3 : 0.2, { type: 'sawtooth', cut: 300 });
        if (b === 4 || b === 12) I.block(t, 0.07, 1240);
        if (b === 0 && bar % 2 === 0) I.pad([root + 12, root + 19, root + 24], t, s * 30, 0.016, { type: 'triangle', cut: 800, att: 0.3, rel: 0.5 });
        if (k === 0) { I.bell(81, t, 0.13, { decay: 2.6 }); I.kick(t, 0.3, 70); }
        // prices: short, high, where the scatter puts them; busier in the second half
        if (scatter(k, n % 3) > (bar < 4 ? 0.88 : 0.76)) I.pluck(root + 36 + [0, 2, third, 7][Math.floor(scatter(k + 7, n) * 4)], t, 0.03, { type: 'square', cut: 5000, decay: 0.05 });
        // the ratchet winding up the last half bar
        if (bar === 7 && b >= 8) { I.tick(t + s * 0.5, 0.04 + (b - 8) * 0.008, 2400 + (b - 8) * 260); }
      },
    },

    silence: null,
  };

  // ───────────── sequencer ─────────────
  let wanted = 'silence';      // what music() last asked for
  let playing = null;          // { mood, spec, bus, send, I, k, n, nextT }
  let timer = null;
  let muted = false;
  let duckAsked = false;
  let duckUntil = 0;
  let ducked = false;
  let duckEnv = { from: 1, to: 1, t0: 0, dur: 0 };

  // Move the duck now. Called from duck() the moment voice.js asks, not from the
  // next sequencer tick: a 40 ms timer (1 s in a background tab) is a long time
  // for a voice to be talking over full music.
  function setDuck(want) {
    if (want === ducked) return;
    ducked = want;
    const now = ctx.currentTime;
    const from = Math.max(DUCK_TO, Math.min(1, duckAt(duckEnv, now)));
    const to = want ? DUCK_TO : 1;
    // an interrupted ramp finishes in proportion to what is left of it, in dB
    const span = Math.abs(Math.log(to / from)) / Math.abs(Math.log(DUCK_TO));
    const dur = (want ? DUCK_DOWN : DUCK_UP) * span;
    duckEnv = { from, to, t0: now, dur };
    const g = duckGain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(from, now);
    if (dur > 0.001) g.exponentialRampToValueAtTime(to, now + dur);
    else g.setValueAtTime(to, now);
  }
  const tap = new Float32Array(voiceTap.fftSize);
  const meterBuf = new Float32Array(meter.fftSize);

  function rms(analyser, buf) {
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / buf.length);
  }

  function retire(p, now) {
    p.bus.gain.cancelScheduledValues(now);
    p.bus.gain.setValueAtTime(p.bus.gain.value, now);
    p.bus.gain.linearRampToValueAtTime(0, now + XFADE);
    setTimeout(() => { p.bus.disconnect(); p.send.disconnect(); }, (XFADE + 6) * 1000);
  }

  function begin(mood) {
    const now = ctx.currentTime;
    if (playing) { retire(playing, now); playing = null; }
    const spec = SCORE[mood];
    if (!spec) return;                                              // 'silence'
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0, now);
    bus.gain.linearRampToValueAtTime(spec.vol, now + XFADE);
    bus.connect(musicBus);
    const send = ctx.createGain();
    send.gain.value = spec.send;
    bus.connect(send);
    send.connect(reverbIn);
    playing = { mood, spec, bus, send, I: instruments(bus), k: 0, n: 0, nextT: now + 0.08 };
  }

  function tick() {
    if (ctx.state !== 'running') return;
    const now = ctx.currentTime;

    if (playing) {
      const p = playing;
      const s = 60 / p.spec.bpm / p.spec.div;
      if (p.nextT < now) p.nextT = now + 0.05;                       // the tab slept: do not replay the gap
      while (p.nextT < now + LOOKAHEAD) {
        p.spec.step(p.k, p.nextT, s, p.I, p.n);
        p.nextT += s;
        p.k += 1;
        if (p.k >= p.spec.len) { p.k = 0; p.n += 1; }
      }
    }

    // duck under speech: asked for by voice.js, or heard on the voice bus
    if (rms(voiceTap, tap) > 0.015) duckUntil = now + DUCK_HOLD;
    setDuck(duckAsked || now < duckUntil);
  }

  function music(mood) {
    if (!(mood in SCORE)) throw new Error(`audio.music: unknown mood "${mood}"`);
    if (mood === wanted) return;
    wanted = mood;
    if (ctx.state === 'running') begin(mood);                        // otherwise unlock() starts it
  }

  function unlock() {
    const started = () => {
      if (timer === null) timer = setInterval(tick, TICK_MS);
      if (wanted !== (playing ? playing.mood : 'silence')) begin(wanted);
      tick();
    };
    if (ctx.state === 'running') { started(); return Promise.resolve(); }
    return ctx.resume().then(started);
  }

  function setMuted(m) {
    muted = !!m;
    mute.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.02);
  }

  function level() {
    return Math.min(1, rms(meter, meterBuf) * 3);
  }

  return {
    unlock, sfx, music, setMuted, level, ctx, voiceBus,
    /** voice.js: hold the music down while a line is spoken (also covers speechSynthesis, which WebAudio cannot hear) */
    duck(on) {
      duckAsked = !!on;
      // down at once; back up only when nothing is still sounding on the voice bus (tick() sees to that)
      if (duckAsked) setDuck(true);
      else if (ctx.currentTime >= duckUntil) setDuck(false);
    },
    isMuted: () => muted,
    /** everything musical after the duck: connect an analyser here to meter it */
    musicOut: duckGain,
  };
}
