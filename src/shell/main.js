// The imperative shell's root. The only place state is held: one `let game`.
//
//   input ──► Msg ──► update(content, game, msg) ──► { game, effects }
//                                                        │        └──► interpret(effect): sound, speech, storage
//                                                        └──► renderer.draw(content, game, fx)
//
// Time enters the core as fixed ticks of physics.STEP. The frame loop banks real time in
// an accumulator and pays it out one STEP at a time, so the table plays the same on a
// 60 Hz phone and a 144 Hz monitor; a long frame is clamped, not replayed.
//
// The page is laid out by layout.js: computeLayout(viewport) says whether this is the
// portrait cabinet (a phone held upright) or the wide one, how big the logical canvas is
// and where everything on it goes. The shell sizes the canvas to that, hands the layout to
// the renderer and to input, and recomputes it when the viewport changes.
//
// When the page is hidden (the phone locked, another app in front) everything stops: the
// frame loop, the audio clock, and the timers that would otherwise end a spoken line.
//
// TWO RENDERERS. render.js paints the 2D game on #stage. src/shell/gl/app.js draws the 3D game on #gl, with
// #stage as its HUD. Each frame the 3D one draws if it is wanted (GL_DEFAULT, ?gl=1, ?gl=0), has a context
// (glApp.ok) and has every set the chapter needs (glApp.canDraw); otherwise the 2D one does. The two have
// different layouts (computeGlLayout / computeLayout), so `layout` follows whichever is drawing, and input
// reads it from there. The 3D module is fetched only when wanted: a browser that is not asked for it, or has
// no WebGL2, never loads a line of it.

import { content } from '../content/index.js';
import { init, update, SAVE_VERSION, LOADABLE_SAVES } from '../core/game.js';
import { preloadIds } from '../core/story.js';
import { STEP } from '../core/physics.js';
import { createRenderer } from './render.js';
import { cinemaCache, warmCinema } from './cinema.js';
import { FONT_UI, FONT_SERIF, FONT_MONO } from './cinema/kit.js';
import { createAudio } from './audio.js';
import { createVoice } from './voice.js';
import { createInput } from './input.js';
import { computeLayout, computeGlLayout, wantsRotate } from './layout.js';

// The key was named before saves had versions. It is kept, so a v:1 save is still found;
// the version that matters is the `v` inside (the core's SAVE_VERSION; its load takes the older ones in LOADABLE_SAVES as well).
const SAVE_KEY = 'the-long-settlement.save.v1';
const SAVE_V = SAVE_VERSION;
const MANIFEST_URL = 'assets/voice/manifest.json';
const MAX_DPR = 2;              // an iPhone reports 3; nine backing pixels per point is fill-rate for nothing
const MAX_FRAME = 0.1;          // seconds of real time one frame may bank
const CHATTER_MAX = 3;          // non-blocking lines allowed to wait their turn
const PRELOAD_AHEAD = 3;        // lines of a cinematic to have ready beyond the one being spoken
const PRELOAD_MAX = 8;          // voice files asked for at one time; the rest load when they are spoken
const LOAD_WAIT_MS = 1500;      // how long Continue waits for sound before going on without it

// The 3D renderer. ?gl=1 asks for it, ?gl=0 refuses it, and with neither GL_DEFAULT decides: the integrator
// flipped this one constant to true once chapter 1 played through in 3D. ?q=min|low|mid|high pins its quality tier.
const GL_DEFAULT = true;
const QUERY = new URLSearchParams(window.location.search);
const GL_ASKED = QUERY.get('gl') === '1';                                  // asked for by name: its errors are fatal
const GL_WANTED = QUERY.get('gl') === '0' ? false : GL_ASKED || GL_DEFAULT;
// ?lanewar: a new game starts with the Lanewar board already set, so the first ball into the saucer opens it
// (otherwise the table sets it after FRAY_NEED bumper, sling and target hits). For trying the board without the wait.
const LANEWAR_SET = QUERY.has('lanewar');
const firstGame = (seedN) => { const g = init(seedN); return LANEWAR_SET ? { ...g, fray: { ...g.fray, lit: true } } : g; };
const GL_QUALITY = QUERY.get('q');

const $ = (id) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`main: index.html has no #${id}`);
  return el;
};

// ───────────────────────── fail loudly ─────────────────────────

let dead = false;
function fatal(err) {
  if (dead) return;
  dead = true;
  console.error(err);
  const box = $('fatal');
  box.textContent = `The Long Settlement stopped.\n\n${err && err.stack ? err.stack : String(err)}`;
  box.hidden = false;
}
window.addEventListener('error', (e) => fatal(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => fatal(e.reason));

// ───────────────────────── storage ─────────────────────────

function readSave() {
  let raw;
  try { raw = localStorage.getItem(SAVE_KEY); } catch { return null; }      // storage blocked: play without saves
  if (!raw) return null;
  try {
    const save = JSON.parse(raw);
    const chapter = content.chapters[save.chapter];
    if (!LOADABLE_SAVES.includes(save.v) || !chapter || !chapter.scenes[save.scene]) throw new Error('not a save this build can load');
    return save;
  } catch (e) {
    console.warn(`main: discarding the stored save (${e.message}): ${raw.slice(0, 200)}`);
    try { localStorage.removeItem(SAVE_KEY); } catch { /* blocked */ }
    return null;
  }
}

function writeSave(save) {
  if (!save || save.v !== SAVE_V) throw new Error(`main: the core asked to store a save that is not v:${SAVE_V}: ${JSON.stringify(save)}`);
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {
    console.warn(`main: could not save (${e.message})`);
  }
}

// ───────────────────────── warm ─────────────────────────

/**
 * Pay, behind the gate, two costs the browser otherwise charges to the first cutscene of a session.
 *
 * Found with the Chrome profiler at 4x CPU throttle on the Continue path (a loaded game has no chapter
 * card to warm a cinematic under): the first cut from the table to a cutscene was one frame of 115-122 ms,
 * and 70 ms of it was a single ctx.setTransform() in kit.js S(), the first call on the first canvas the page
 * ever made with { willReadFrequently: true }. Chrome sets up its software canvas path on that call, once per
 * page, whatever the size of the canvas: the same call on the next backdrop is 4-6 ms. (It looked like script
 * "outside canvas calls" in the earlier measurement because setTransform was not among the calls it timed.)
 * The rest was the first measureText and fillText in each of the cinematic's fonts, 8-10 ms each.
 *
 * So: one small software canvas, and a word measured and drawn in each font family the cinematics use.
 * This takes 90 ms at 4x throttle (about 20 ms unthrottled), on the gate where nothing is moving, and the
 * first cut is then 46-55 ms at 4x: a still layer's ordinary first build step. The sizes below are the
 * cinematics' common ones; a size not listed still finds its family resolved.
 */
function warmCanvasPaths() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('main: this browser gave no 2D context for a 64 x 64 canvas');
  g.setTransform(2, 0, 0, 2, 0, 0);
  const fonts = [
    `700 20px ${FONT_SERIF}`, `28px ${FONT_SERIF}`, `italic 28px ${FONT_SERIF}`, `italic 17px ${FONT_SERIF}`,
    `700 22px ${FONT_UI}`, `600 11px ${FONT_UI}`, `600 11px ${FONT_MONO}`,
  ];
  for (const font of fonts) {
    g.font = font;
    g.measureText('The Long Settlement 0123');
    g.fillText('The Long Settlement 0123', 2, 20);
  }
  g.getImageData(0, 0, 1, 1);      // makes the browser rasterise now what was recorded above
  c.width = 0;                     // give the backing store back
  c.height = 0;
}

// ───────────────────────── boot ─────────────────────────

async function fetchManifest() {
  // No manifest is a supported state: voice.js then speaks with speechSynthesis.
  let res;
  try { res = await fetch(MANIFEST_URL, { cache: 'no-cache' }); } catch { return {}; }
  if (res.status === 404) return {};
  if (!res.ok) throw new Error(`main: ${MANIFEST_URL} answered HTTP ${res.status}`);
  const manifest = await res.json();
  if (!manifest || typeof manifest.lines !== 'object') throw new Error(`main: ${MANIFEST_URL} has no "lines" object`);
  return manifest;
}

/** Can this browser make a WebGL2 context? Asked of a scratch canvas, whose context is handed straight back. */
function hasWebGL2() {
  if (typeof WebGL2RenderingContext === 'undefined') return false;
  let gl = null;
  try { gl = document.createElement('canvas').getContext('webgl2'); } catch { return false; }
  if (!gl) return false;
  const lose = gl.getExtension('WEBGL_lose_context');
  if (lose) lose.loseContext();        // a page gets only so many contexts; do not leave this one to the collector
  return true;
}

/**
 * The 3D renderer, or null: not wanted, no #gl canvas in this page, the module failed to load, or no WebGL2.
 * Asked for by name (?gl=1), a failure to load is thrown; as a default it is logged and the 2D game goes on.
 */
async function loadGl(glCanvas, hudCanvas) {
  if (!GL_WANTED || !glCanvas || !hasWebGL2()) return null;                // no WebGL2: never touch the GL path
  try {
    const { createGlApp } = await import('./gl/app.js');
    const app = createGlApp(glCanvas, hudCanvas, { quality: GL_QUALITY === 'min' || GL_QUALITY === 'low' || GL_QUALITY === 'mid' || GL_QUALITY === 'high' ? GL_QUALITY : null });
    return app.ok ? app : null;
  } catch (e) {
    if (GL_ASKED) throw e;
    console.warn(`main: the 3D renderer did not start (${e && e.message}); drawing in 2D`);
    return null;
  }
}

async function boot() {
  const canvas = $('stage');
  const glCanvas = document.getElementById('gl');     // absent from a cached index.html: then there is no 3D
  const gate = $('gate');

  // view-only: what the renderer needs that is not game state
  //   safe: the part of each canvas edge that lies under the notch, the home indicator or a
  //         rounded corner, in logical px (0 where the canvas does not reach that far)
  //   muted, touch: what the mute button shows, and whether a finger is how this is played
  const fx = {
    timeMs: performance.now(), voiceLevel: 0, speaking: null, flash: null, shake: 0,
    safe: { top: 0, right: 0, bottom: 0, left: 0 }, muted: false, touch: window.matchMedia('(pointer: coarse)').matches,
  };

  // ── layout ──
  const safeProbe = $('safe');                    // padded with env(safe-area-inset-*) by the stylesheet
  let layout = null;

  // A phone on its side gets a card asking to be turned upright, not a wide cabinet four centimetres tall;
  // the game behind the card is stopped (see sleep and wake) until it is.
  const rotateCard = $('rotate');
  const touchPrimary = window.matchMedia('(hover: none) and (pointer: coarse)');
  let sideways = false;
  let onSideways = () => {};                        // set once the loop exists
  let glApp = null;                                 // the 3D renderer, once loaded (see loadGl)
  let glOn = false;                                 // it is the one drawing: decided each frame in pickRenderer

  function fit() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (!(vw > 0) || !(vh > 0)) return;             // minimised, or not laid out yet: keep what we have
    const turn = wantsRotate(vw, vh, touchPrimary.matches);
    if (turn !== sideways) { sideways = turn; rotateCard.hidden = !turn; onSideways(); }
    layout = glOn ? computeGlLayout(vw, vh) : computeLayout(vw, vh);
    if (!layout || !(layout.W > 0) || !(layout.H > 0)) throw new Error(`main: ${glOn ? 'computeGlLayout' : 'computeLayout'}(${vw}, ${vh}) gave ${JSON.stringify(layout)}`);
    const s = Math.min(vw / layout.W, vh / layout.H);
    const w = Math.max(1, Math.floor(layout.W * s));
    const h = Math.max(1, Math.floor(layout.H * s));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
    if (glCanvas) {
      // the same box as #stage; its backing store is the 3D renderer's business (it has its own pixel-ratio cap)
      glCanvas.style.width = `${w}px`;
      glCanvas.style.height = `${h}px`;
      glCanvas.hidden = !glOn;
    }
    document.body.classList.toggle('gl', glOn);

    const inset = getComputedStyle(safeProbe);
    const rect = canvas.getBoundingClientRect();
    const px = (v) => parseFloat(v) || 0;
    const over = (insetPx, gapPx) => Math.max(0, insetPx - Math.max(0, gapPx)) / s;
    fx.safe = {
      top: over(px(inset.paddingTop), rect.top),
      right: over(px(inset.paddingRight), vw - rect.right),
      bottom: over(px(inset.paddingBottom), vh - rect.bottom),
      left: over(px(inset.paddingLeft), rect.left),
    };
    // the 3D layout gives the stage band back the height a notch takes from its head (same W and H, so the canvases stand)
    if (glOn) layout = computeGlLayout(vw, vh, fx.safe.top);
  }
  fit();
  window.addEventListener('resize', fit);
  // iOS fires orientationchange before the viewport has its new size, and sometimes no resize after
  window.addEventListener('orientationchange', () => { fit(); setTimeout(fit, 300); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);

  const renderer = createRenderer(canvas);
  glApp = await loadGl(glCanvas, canvas);
  cinemaCache.stepped = true;      // frames follow one another here: build a backdrop a layer a frame, never all in one
  warmCanvasPaths();
  const audio = createAudio();
  const voice = createVoice(audio, content.cast, await fetchManifest());

  const newSeed = () => (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;

  // ── the state ──
  let game = firstGame(newSeed());

  const chatter = [];           // non-blocking lines waiting for the voice to be free

  // ── effects ──
  function speak(line, blocking) {
    const started = voice.say(line, {
      blocking,
      onDone(reason) {
        if (fx.speaking === line) fx.speaking = null;
        // Only a line that was heard to its end moves the story on. A hushed, dropped or
        // interrupted line also gets its onDone, and answering those would skip lines.
        if (reason !== 'ended') return;
        if (blocking) dispatch({ type: 'lineDone', id: line.id });
        else nextChatter();
      },
    });
    if (started) fx.speaking = line;
  }

  function nextChatter() {
    if (voice.speaking()) return;
    const line = chatter.shift();
    if (line) speak(line, false);
  }

  // THE RESOLVE HOLD (3D only). A scene's cutscene begins the tick its objective completes, and the core's stage
  // model keeps showing the encounter, won, for the first RESOLVE_HOLD of it: the band grows to the whole glass over
  // the party's cheer. Line one used to be spoken over that. Here its voice waits until the stage is the cutscene:
  // the line is held and spoken from the frame loop once `held.at` has passed, if the story is still on it. The
  // core's own clock is not touched (its safety net allows a line half as long again plus two seconds).
  const RESOLVE_HOLD_MS = 1150;
  let held = null;              // { line, at } | null
  function holdsForResolve(line) {
    const c = game.cine;
    return glOn && game.mode === 'cine' && !!c && c.kind === 'scene' && c.index === 0 && c.lines[0] === line && c.t < 0.2
      && !!content.chapters[game.chapter].scenes[game.scene].encounter;
  }
  function speakHeld(now) {
    if (!held || now < held.at) return;
    const { line } = held;
    held = null;
    const c = game.cine;
    if (game.mode === 'cine' && c && c.lines[c.index] === line) speak(line, true);
  }

  const EFFECTS = {
    say(e) {
      if (e.blocking && holdsForResolve(e.line)) { chatter.length = 0; voice.hush(); fx.speaking = null; held = { line: e.line, at: performance.now() + RESOLVE_HOLD_MS }; return; }
      if (e.blocking) { held = null; chatter.length = 0; speak(e.line, true); return; }
      // voice.js drops a non-blocking line while anything is speaking. A briefing is two
      // or three of them emitted on one tick, so they queue here; barks beyond a short
      // queue are let go, since by the time they were heard the moment would have passed.
      if (voice.speaking() || chatter.length > 0) {
        if (chatter.length < CHATTER_MAX) chatter.push(e.line);
        return;
      }
      speak(e.line, false);
    },
    hush() { held = null; chatter.length = 0; fx.speaking = null; voice.hush(); },
    sfx(e) { audio.sfx(e.name, e.vol === undefined ? 1 : e.vol); },
    music(e) { audio.music(e.mood); },
    shake(e) { fx.shake = Math.min(1, Math.max(fx.shake, e.power)); },
    flash(e) { fx.flash = { color: e.color, a: 0.45 }; },
    save(e) { writeSave(e.save); },
  };

  function interpret(effect) {
    const run = EFFECTS[effect.type];
    if (!run) throw new Error(`main: the core emitted an effect the shell cannot interpret: ${JSON.stringify(effect)}`);
    run(effect);
  }

  // ── preload ── have the audio for what is about to be said ready before the core asks.
  // What is "about to be said" changes only when the story moves (mode, chapter, scene, or
  // the line of a cinematic), so the list is rebuilt on that and not on every tick.
  // voice.preload is optional: a voice without it fetches each line when it is spoken.
  const canPreload = typeof voice.preload === 'function';
  if (!canPreload) console.warn('main: this voice has no preload(ids); lines will load as they are spoken');
  let preloadKey = null;
  function preload() {
    if (!canPreload) return;
    const key = `${game.mode}|${game.chapter}|${game.scene}|${game.cine ? `${game.cine.kind}:${game.cine.index}` : ''}`;
    if (key === preloadKey) return;
    preloadKey = key;
    // In play the list is the briefing, the head of the cutscene, then every bark of the
    // chapter. The barks are cut off here: one that is not ready loads when it is called.
    const ids = preloadIds(content, game, PRELOAD_AHEAD).slice(0, PRELOAD_MAX);
    if (ids.length > 0) voice.preload(ids);
  }

  // ── dispatch ── (a voice callback can fire while effects are being interpreted; queue it)
  const pending = [];
  let dispatching = false;
  function dispatch(msg) {
    pending.push(msg);
    if (dispatching || dead) return;
    dispatching = true;
    try {
      while (pending.length > 0) {
        const m = pending.shift();
        // 'end' has no way out in the core: the shell deals a fresh game.
        if (game.mode === 'end' && m.type === 'confirm') {
          EFFECTS.hush();
          game = firstGame(newSeed());
          continue;
        }
        const before = game;
        const r = update(content, game, m);
        game = r.game;
        if (glOn && m.type === 'tick') glApp.observe(content, before, m, game);     // the 3D table's events, read off the tick
        for (const e of r.effects) interpret(e);
      }
      preload();
    } catch (err) {
      pending.length = 0;
      fatal(err);
    } finally {
      dispatching = false;
    }
  }

  // ── the loop ──
  let controls = null;          // created when the gate opens; until then nothing can be pressed
  const NO_INPUT = { left: false, right: false, plunge: false, nudge: null };
  let last = null;
  let bank = 0;
  let raf = null;

  /** Which renderer draws this frame. A change of renderer is a change of layout, so the canvases are fitted again. */
  function pickRenderer() {
    const want = glApp !== null && glApp.ok && glApp.canDraw(content, game);
    if (want !== glOn) {
      glOn = want;
      if (controls) controls.release();           // the buttons have moved under any finger that is down
      fit();
    }
    return glOn;
  }

  function frame(now) {
    raf = null;
    if (dead) return;
    try {
      const real = last === null ? 0 : Math.min(MAX_FRAME, Math.max(0, (now - last) / 1000));
      last = now;
      bank += real;
      const input = controls ? controls.state() : NO_INPUT;
      while (bank >= STEP) {
        dispatch({ type: 'tick', dt: STEP, input });
        bank -= STEP;
      }
      speakHeld(now);
      fx.timeMs = now;
      fx.voiceLevel = voice.level();
      fx.shake = Math.max(0, fx.shake - real * 2.2);
      if (fx.flash) {
        fx.flash.a -= real * 1.8;
        if (fx.flash.a <= 0) fx.flash = null;
      }
      fx.touch = fx.touch || (controls !== null && controls.touched());
      let drawn = false;
      if (pickRenderer()) {
        try {
          glApp.draw(content, game, fx, layout);
          drawn = true;
        } catch (err) {
          // Asked for by name (?gl=1), a 3D renderer that throws stops the page, loudly. As the default it must not
          // take the game with it: say so, retire it for this session, and let the 2D renderer draw this very frame.
          if (GL_ASKED) throw err;
          console.error('main: the 3D renderer threw; the 2D renderer takes over for this session', err);
          glApp.ok = false;
          pickRenderer();
        }
      }
      if (!drawn) {
        renderer.draw(content, game, fx, layout);
        // while the chapter card is up, get the prologue's first backdrop ready behind it
        if (game.mode === 'card') warmCinema(content, game, layout, canvas.width / layout.W, now);
      }
    } catch (err) {
      fatal(err);
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  // ── hidden and shown ──
  function sleep() {
    if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
    last = null;                  // the time away is not banked
    bank = 0;
    if (controls) controls.release();     // a finger lifted while we were away sends no pointerup
    voice.pause();
    audio.pause();
  }
  function wake() {
    if (dead || document.hidden) return;
    fit();
    if (sideways) return;         // still on its side: stay stopped behind the card
    audio.resume();
    voice.resume();
    if (raf === null) raf = requestAnimationFrame(frame);
  }
  onSideways = () => (sideways ? sleep() : wake());
  document.addEventListener('visibilitychange', () => (document.hidden ? sleep() : wake()));
  window.addEventListener('pagehide', sleep);
  window.addEventListener('pageshow', wake);
  wake();

  // ── sound needs a gesture ── iOS runs an AudioContext only once resume() has been called
  // from inside touchend (touchstart does not count) or a later event of the same tap, and
  // can take it away again for a phone call. unlock() is cheap when there is nothing to do,
  // so every gesture asks. Capture phase: it runs before any handler that might want sound.
  const unlock = () => { audio.unlock(); };
  for (const type of ['touchend', 'pointerup', 'click', 'keydown']) {
    document.addEventListener(type, unlock, { capture: true, passive: true });
  }

  // ── the gate: a browser gives no sound until the page has been clicked ──
  const save = readSave();
  const resume = $('resume');
  if (save) {
    const ch = content.chapters[save.chapter];
    resume.textContent = `Continue: Chapter ${ch.number}, ${ch.scenes[save.scene].title}`;
    resume.hidden = false;
  }

  // Nothing here waits on the audio context without a time limit. On a machine with no
  // output device resume() never settles, and a gate that awaited it never opened.
  function open(loadSave) {
    if (controls) return;
    const sound = audio.unlock();
    gate.hidden = true;
    controls = createInput(canvas, {
      mode: () => game.mode,
      layout: () => layout,
      fray: () => (game.run ? { run: game.run, safeTop: fx.safe ? fx.safe.top : 0 } : null),
      onMsg: dispatch,
      onMute() { fx.muted = !fx.muted; audio.setMuted(fx.muted); },      // the renderer draws the button's state
    });
    canvas.focus();
    if (!loadSave) return;
    // A loaded game speaks its briefing at once. Give the context a moment to be running so
    // that line is the recorded voice and not the synthesiser; then go on regardless.
    Promise.race([sound, new Promise((r) => setTimeout(r, LOAD_WAIT_MS))])
      .then(() => dispatch({ type: 'load', save: loadSave }))
      .catch(fatal);
  }
  $('begin').addEventListener('click', () => { try { open(null); } catch (e) { fatal(e); } });
  resume.addEventListener('click', () => { try { open(save); } catch (e) { fatal(e); } });
  $('begin').disabled = false;
  $('begin').focus();

  // for the console and for driving the game from a test script
  // `set` replaces the state outright: a measuring script uses it to stand the game in a given cinematic
  window.tls = { game: () => game, set: (g) => { game = g; }, send: dispatch, content, audio, voice, layout: () => layout, fx, input: () => (controls ? controls.state() : NO_INPUT), gl: () => glApp, glOn: () => glOn };
}

boot().catch(fatal);
