// The imperative shell's root. The only place state is held: one `let game`.
//
//   input ──► Msg ──► update(content, game, msg) ──► { game, effects }
//                                                        │        └──► interpret(effect): sound, speech, storage
//                                                        └──► renderer.draw(content, game, fx)
//
// Time enters the core as fixed ticks of physics.STEP. The frame loop banks real time in
// an accumulator and pays it out one STEP at a time, so the table plays the same on a
// 60 Hz laptop and a 144 Hz monitor; a long frame (a tab coming back from sleep) is
// clamped, not replayed.

import { content } from '../content/index.js';
import { init, update } from '../core/game.js';
import { preloadIds } from '../core/story.js';
import { STEP } from '../core/physics.js';
import { createRenderer } from './render.js';
import { createAudio } from './audio.js';
import { createVoice } from './voice.js';
import { createInput } from './input.js';

const SAVE_KEY = 'the-long-settlement.save.v1';
const MANIFEST_URL = 'assets/voice/manifest.json';
const W = 1280;
const H = 800;
const MAX_FRAME = 0.1;          // seconds of real time one frame may bank
const CHATTER_MAX = 3;          // non-blocking lines allowed to wait their turn
const PRELOAD_AHEAD = 3;        // lines of a cinematic to have ready beyond the one being spoken

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
    if (save.v !== 1 || !chapter || !chapter.scenes[save.scene]) throw new Error('not a save this build can load');
    return save;
  } catch (e) {
    console.warn(`main: discarding the stored save (${e.message}): ${raw.slice(0, 200)}`);
    try { localStorage.removeItem(SAVE_KEY); } catch { /* blocked */ }
    return null;
  }
}

function writeSave(save) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {
    console.warn(`main: could not save (${e.message})`);
  }
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

async function boot() {
  const canvas = $('stage');
  const gate = $('gate');

  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    const w = Math.max(320, Math.floor(W * s));
    const h = Math.round(w * H / W);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);
    if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
  }
  fit();
  window.addEventListener('resize', fit);

  const renderer = createRenderer(canvas);
  const audio = createAudio();
  const voice = createVoice(audio, content.cast, await fetchManifest());

  const newSeed = () => (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;

  // ── the state ──
  let game = init(newSeed());

  // view-only: what the renderer needs that is not game state
  const fx = { timeMs: performance.now(), voiceLevel: 0, speaking: null, flash: null, shake: 0 };
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

  const EFFECTS = {
    say(e) {
      if (e.blocking) { chatter.length = 0; speak(e.line, true); return; }
      // voice.js drops a non-blocking line while anything is speaking. A briefing is two
      // or three of them emitted on one tick, so they queue here; barks beyond a short
      // queue are let go, since by the time they were heard the moment would have passed.
      if (voice.speaking() || chatter.length > 0) {
        if (chatter.length < CHATTER_MAX) chatter.push(e.line);
        return;
      }
      speak(e.line, false);
    },
    hush() { chatter.length = 0; fx.speaking = null; voice.hush(); },
    sfx(e) { audio.sfx(e.name, e.vol === undefined ? 1 : e.vol); },
    music(e) { audio.music(e.mood); },
    shake(e) { fx.shake = Math.min(1, Math.max(fx.shake, e.power)); },
    flash(e) { fx.flash = { color: e.color, a: 0.7 }; },
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
    const ids = preloadIds(content, game, PRELOAD_AHEAD);
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
          game = init(newSeed());
          continue;
        }
        const r = update(content, game, m);
        game = r.game;
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

  function frame(now) {
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
      fx.timeMs = now;
      fx.voiceLevel = voice.level();
      fx.shake = Math.max(0, fx.shake - real * 2.2);
      if (fx.flash) {
        fx.flash.a -= real * 1.8;
        if (fx.flash.a <= 0) fx.flash = null;
      }
      renderer.draw(content, game, fx);
    } catch (err) {
      fatal(err);
      return;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ── the gate: a browser gives no sound until the page has been clicked ──
  const save = readSave();
  const resume = $('resume');
  if (save) {
    const ch = content.chapters[save.chapter];
    resume.textContent = `Continue: Chapter ${ch.number}, ${ch.scenes[save.scene].title}`;
    resume.hidden = false;
  }

  let muted = false;
  async function open(loadSave) {
    if (controls) return;
    await audio.unlock();
    gate.hidden = true;
    controls = createInput(canvas, {
      mode: () => game.mode,
      onMsg: dispatch,
      onMute() { muted = !muted; audio.setMuted(muted); $('muted').hidden = !muted; },
    });
    if (loadSave) dispatch({ type: 'load', save: loadSave });
    canvas.focus();
  }
  $('begin').addEventListener('click', () => { open(null).catch(fatal); });
  resume.addEventListener('click', () => { open(save).catch(fatal); });
  $('begin').disabled = false;
  $('begin').focus();

  // for the console and for driving the game from a test script
  window.tls = { game: () => game, send: dispatch, content, audio, voice };
}

boot().catch(fatal);
