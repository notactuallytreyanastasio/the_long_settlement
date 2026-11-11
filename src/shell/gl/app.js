// The 3D renderer the shell draws with when the device has WebGL2: one WebGL canvas, one 2D HUD canvas over it.
//
//   const app = createGlApp(glCanvas, hudCanvas, { quality: 'min' | 'low' | 'mid' | 'high' | null });
//   app.ok                              false when there is no WebGL2, and from the moment the context is lost
//   app.canDraw(content, game)          true when every set the current chapter needs exists
//   app.observe(content, before, msg, after)   once per core tick in play: the table's events (bumper, reelStop, ...)
//   app.draw(content, game, fx, layout) the same contract as render.js: reads the game, never changes it.
//                                       layout must be one from layout.js computeGlLayout (it has layout.gl)
//   app.dispose()
//
// What is on the glass, by game.mode:
//   title, card, end   a set of the chapter turning slowly under the HUD module's screen
//   play               the live stage band (stage.js director, fed by the core's stageState) over the 3D table
//   cine               the band grown to the whole canvas, the table slid away below; the director plays the lines
//   fray               Lanewar: the tin-soldier board (fray3d.js) in the middle of the glass, its HUD over it
// play <-> cine is one number, `cineW` 0..1, eased over GROW seconds: the band's rectangle and the table's offset are
// both read from it, so there is no cut. The director eases its own camera from the rectangle it is given.
//
// TWO COORDINATE SPACES. layout.js and the HUD work in logical px (430 wide in portrait). The engine and the director
// work in CSS px of the GL canvas. They differ by k = canvas.clientWidth / layout.W, and this file is the only place
// that converts: rectangles go to the engine times k, head anchors come back divided by k.
//
// THE BAND'S FRAME. The director is told how much of the band's foot the HUD covers (F.pad, CSS px) and puts the
// ground line just above it; layout.js makes the band taller under a notch (computeGlLayout's safeTop), because the
// head of the band is then sky nobody can letter on. An empty table lays a veil of night over the band (drawHudPass).
//
// SETS are built here, never by the director: a queue ordered by first use, one build every few frames while a
// title, card or cinematic is up, none during play. A set the director asks for before its turn is built at once
// (one long frame, logged). Each new set is drawn once into a few pixels so its buffers are on the GPU before the
// frame that needs them.
//
// QUALITY. Four tiers (high, mid, low, min). With no ?q= the app starts at 'high' and steps down whenever 120 frames of play or
// cinematic average more than BUDGET_MS apart. It never steps back up. The first cinematic is the whole canvas of
// stage, the heaviest thing there is, so a phone that cannot hold 'high' has usually left it before the first ball.

import * as GL from './index.js';
import { stageState, setsNeeded } from '../../core/stage.js';
import { currentChapter } from '../../core/story.js';
import { SETS } from './sets/index.js';
import { drawHud, HUD_BAND_HEAD, HUD_BAND_FOOT } from './hud.js';
import { createDirector } from './stage.js';
import { createFrayView } from './fray3d.js';
import { frayLayout, frayScreen } from '../fray-view.js';

const INK = '#1d2146';
const INK_RGB = GL.rgb(INK);     // the same ink as the renderer's frame clear
const GROW = 0.75;              // seconds for the band to grow to the whole canvas, or shrink back
const VEIL = 0.45;              // seconds an ink veil takes to lift after a screen gives way to the stage
const PUMP_EVERY = 5;           // frames between background builds
const BUDGET_MS = 21;           // mean frame interval above which the tier steps down (48 frames a second)
const MEASURE = 120;            // frames per measurement
const SETTLE = 45;              // frames ignored after a tier change, a build or a mode change

// engine: the renderer's own quality object of that name (renderer.js QUALITY: pixel ratio cap, anti-aliasing, shadow
// size and rate, lamps per fragment, water). band: what the live band's view asks for on top of that while it is at
// rest above the table (it is 220 px tall; in a cinematic it gets the lot).
// Whether a set is built `low` (without its distant detail) is decided per USE, not once: on a phone (lowSets) the
// live band always stands on the low build, and a cinematic stands on the full build while the tier is 'high' and on
// the low one after it has stepped down. Two builds of one place are told apart by the third part of their key
// ('id|light|low' / 'id|light|full'); the director carries the figures from one to the other (stage.js adopt), and
// every script cue a build was sent is replayed to its twin (cueLog), so the place is in the same state in both.
export const TIERS = Object.freeze({
  high: Object.freeze({ engine: 'high', band: Object.freeze({}) }),
  mid: Object.freeze({ engine: 'medium', band: Object.freeze({ shadowSize: 512 }) }),
  low: Object.freeze({ engine: 'low', band: Object.freeze({ shadow: 'off' }) }),
  // The last resort, for a device that cannot hold 'low' at 48 frames a second: 'low' at three quarters of a CSS pixel
  // (0.56 of low's fragments, and fill is what such a device is out of), one lamp, outlines only on what is 12 px or more.
  // Not the renderer's own 'min': that one compiles shadows out altogether, and only the fight has blob shades to stand
  // in for them (stage.js S.blobs); a cinematic at 'min' would have its cast floating.
  min: Object.freeze({ engine: Object.freeze({ base: 'low', name: 'min', dprCap: 0.75, maxLamps: 1, outlineMinPx: 12 }), band: Object.freeze({ shadow: 'off' }) }),
});
const TIER_ORDER = ['high', 'mid', 'low', 'min'];

/** The table's three looks (table3d setLight), by the core's light names for an encounter (core/stage.js LIGHTS). */
const TABLE_LIGHT = Object.freeze({ dusk: 'dusk', night: 'night', predawn: 'night', dawn: 'dawn', day: 'day', interior: 'night' });

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (t) => t * t * (3 - 2 * t);

/** The set definition for a key, or null. */
function setDef(key) {
  return Object.hasOwn(SETS, key) ? { def: SETS[key] } : null;
}

/** A light a set definition knows. The core names lights the artists may not have built ('interior'); a set's first light stands in. */
function lightFor(def, light) {
  if (!def.lights || def.lights.length === 0) return light || 'dusk';
  return def.lights.includes(light) ? light : def.lights[0];
}

/** The figures a chapter puts on the stage, as { id, lod }: 'stage' for parties and people in the way (the live band), 'full' for whoever a cinematic shows. */
function chapterCast(chapter) {
  const out = [], seen = new Set();
  const want = (id, lod) => { const k = `${id}:${lod}`; if (!seen.has(k)) { seen.add(k); out.push({ id, lod }); } };
  const lines = (ls) => { for (const l of ls) if (l.on) for (const id of l.on) want(id, 'full'); };
  lines(chapter.prologue);
  for (const s of chapter.scenes) {
    const e = s.encounter;
    if (e) {
      for (const id of e.party) want(id, 'stage');
      if (e.opposition.kind === 'people') for (const id of e.opposition.who) want(id, 'stage');
      for (const id of e.extras || []) want(id, 'stage');
    }
    lines(s.cutscene);
  }
  lines(chapter.epilogue);
  if (chapter.stage.clerk) want(chapter.stage.clerk, 'stage');
  if (chapter.stage.townsfolk) want(chapter.stage.townsfolk, 'stage');
  return out;
}

/** Every (set key, light, use) a chapter needs, in first-use order. use: 'band' for an encounter, 'lines' for its resolution and for every cinematic. */
function chapterPairs(chapter) {
  const out = [], seen = new Set();
  const want = (set, light, use) => { const k = `${set}|${light}|${use}`; if (!seen.has(k)) { seen.add(k); out.push({ set, light, use }); } };
  const sets = chapter.stage.sets;
  const lines = (ls, enc) => { for (const l of ls) if (l.bg) { if (enc && enc.set === l.bg) want(enc.set, enc.light, 'lines'); else want(sets[l.bg].set, sets[l.bg].light, 'lines'); } };
  if (chapter.scenes[0] && chapter.scenes[0].encounter) want(chapter.scenes[0].encounter.set, chapter.scenes[0].encounter.light, 'lines');   // the title turns on it
  lines(chapter.prologue, null);
  for (const s of chapter.scenes) { if (s.encounter) { want(s.encounter.set, s.encounter.light, 'band'); want(s.encounter.set, s.encounter.light, 'lines'); } lines(s.cutscene, s.encounter); }
  lines(chapter.epilogue, null);
  return out;
}

/**
 * @param {HTMLCanvasElement} glCanvas   gets the WebGL2 context. Must not have a context yet
 * @param {HTMLCanvasElement} hudCanvas  the 2D canvas over it; this file clears it every frame
 * @param {{quality?: 'min'|'low'|'mid'|'high'|null}} [opts]
 */
export function createGlApp(glCanvas, hudCanvas, opts = {}) {
  const pinned = opts.quality && TIERS[opts.quality] ? opts.quality : null;
  if (opts.quality && !pinned) throw new Error(`gl/app: unknown quality ${JSON.stringify(opts.quality)} (have ${Object.keys(TIERS).join(', ')})`);
  let tierName = pinned || 'high';
  // a finger means a phone or a tablet: its sets are the light ones, unless ?q=high asks for everything
  const win = glCanvas.ownerDocument.defaultView;
  const lowSets = pinned ? pinned !== 'high' : !!(win.matchMedia && win.matchMedia('(pointer: coarse)').matches);

  let renderer;
  try {
    renderer = GL.createRenderer(glCanvas, { quality: TIERS[tierName].engine });
  } catch (e) {
    console.warn(`gl/app: no 3D renderer (${e && e.message}); the 2D renderer draws`);
    return { ok: false, reason: String(e && e.message), canDraw: () => false, observe() {}, draw() {}, dispose() {} };
  }
  const gl = renderer.gl;
  const hud = hudCanvas.getContext('2d');
  if (!hud) throw new Error('gl/app: the HUD canvas gave no 2D context');

  const app = { ok: true, reason: '', stats: { tier: tierName, pinned: !!pinned, lowSets: false, draws: 0, tris: 0, frameMs: 0, built: 0, freed: 0, urgent: 0, queued: 0, steps: [] } };
  app.stats.lowSets = lowSets;
  let disposed = false;
  renderer.ctx.onLost = () => { if (!disposed) console.warn('gl/app: the WebGL context was lost; the 2D renderer takes over'); app.ok = false; app.reason = 'context lost'; };
  // ...and gives the picture back when the browser restores the context (a phone takes it away from a tab in the
  // background and returns it). Without this the rest of the session was the 2D game. Nothing here needs rebuilding by
  // hand: every GPU object is keyed by the context's generation and is made again on first use (gl.js).
  const rebuild = renderer.ctx.onRestored;
  renderer.ctx.onRestored = () => {
    if (rebuild) rebuild();
    if (disposed || app.reason !== 'context lost') return;
    console.warn('gl/app: the WebGL context is back; drawing in 3D again');
    app.ok = true; app.reason = ''; settle = SETTLE * 2;
  };

  function applyTier() {
    app.stats.tier = tierName;
    renderer.setQuality(TIERS[tierName].engine);
  }
  applyTier();

  // ───────────────────────── sets, tables, the cast ─────────────────────────

  const troupe = GL.createTroupe({ detail: 1 });
  const built = new Map();        // 'key|light' -> set
  const tables = new Map();       // table id -> table view
  const queue = [];               // { kind: 'set', key, light } | { kind: 'table', id } | { kind: 'figure', id, lod }, in the order they will be wanted
  let planned = -1, total = 0, sincePump = 0, settle = SETTLE;
  const warmCam = GL.createCamera({ fov: 40, near: 0.3, far: 1500 });

  /** Is this use of a set drawn on its low build? Never on a desktop; on a phone the band always, a cinematic once the tier has left 'high'. */
  const lowFor = (use) => lowSets && (use === 'band' || tierName !== 'high');
  const pairKey = (key, light, use) => { const d = setDef(key); return d ? `${d.def.id}|${lightFor(d.def, light)}|${lowFor(use) ? 'low' : 'full'}` : null; };
  const cueLog = new Map();       // 'id|light' -> [line ids sent to any build of that place, this chapter]

  function buildSet(key, light, use) {
    const d = setDef(key);
    if (!d) throw new Error(`gl/app: no set "${key}" (have ${Object.keys(SETS).join(', ')})`);
    const lt = lightFor(d.def, light), low = lowFor(use), place = `${d.def.id}|${lt}`, k = `${place}|${low ? 'low' : 'full'}`;
    let set = built.get(k);
    if (set) return set;
    // a phone's build is also cut coarser: round shapes get 0.7 of their segments (mesh.js withDetail; chapter 1's sets do it themselves, nesting is harmless)
    set = low ? GL.withDetail(0.7, () => d.def.build(GL, { light: lt, low })) : d.def.build(GL, { light: lt, low });
    if (!set || !set.scene || !set.actors || !set.cameras || typeof set.frame !== 'function') throw new Error(`gl/app: set "${key}" (${lt}) did not build a set (need scene, actors, cameras, frame)`);
    set.place = place;
    built.set(k, set);
    // the other build of this place has heard script cues this chapter: this one hears them now, in order
    const heard = cueLog.get(place);
    if (heard && set.cue) for (const id of heard) set.cue(id);
    app.stats.built++;
    // once, into a corner the next draw paints over: geometry and textures go to the GPU now, not on the frame that cuts to it
    const cams = set.cameras || {};
    const name = cams.wide ? 'wide' : Object.keys(cams)[0];
    if (name) {
      set.frame(warmCam, name, 0);
      renderer.render(set.scene, warmCam, 0, { x: 0, y: 0, w: 8, h: 8, ...set.view(name) });
    }
    settle = SETTLE;
    return set;
  }

  /**
   * Another chapter: everything the last one built is given back, on the GPU (renderer.release; about 5 MB a set) and in
   * JS (the registry's references are dropped). Places the next chapter shares are built again rather than kept: a set
   * carries what its chapter's cues did to it (lamps put out, a crowd gone home), and the next chapter starts clean.
   * The set the director is still showing goes when the director has left it (dropStale, every frame).
   */
  let stale = null;
  function freeFor(chapter) {
    for (const set of built.values()) {
      if (set === director.set) { if (stale && stale !== set) renderer.release(stale.scene, { skip: [stale.actors] }); stale = set; continue; }
      renderer.release(set.scene, { skip: [set.actors] });
      app.stats.freed++;
    }
    built.clear(); asked.clear(); titleSet = null;
    for (const [id, view] of [...tables]) {
      if (chapter && id === chapter.tableId) continue;
      renderer.release(view.scene);
      tables.delete(id);
      if (tview === view) tview = null;
      if (lastLit === view) lastLit = null;
    }
  }
  function dropStale() {
    if (!stale || director.set === stale) return;
    renderer.release(stale.scene, { skip: [stale.actors] });
    app.stats.freed++;
    stale = null;
  }

  function plan(content, chapterIndex) {
    if (chapterIndex === planned) return;
    const first = planned < 0;
    planned = chapterIndex;
    queue.length = 0;
    const chapter = content.chapters[chapterIndex];
    if (!first) freeFor(chapter);
    if (!chapter || !chapter.stage || !chapter.stage.sets) { total = 0; return; }
    const pairs = chapterPairs(chapter), seen = new Set();
    cueLog.clear();
    pairs.forEach((p, i) => {
      const k = pairKey(p.set, p.light, p.use);
      if (k && !built.has(k) && !seen.has(k)) { seen.add(k); queue.push({ kind: 'set', key: p.set, light: p.light, use: p.use }); }
      if (i === 0 && !tables.has(chapter.tableId)) queue.push({ kind: 'table', id: chapter.tableId });
    });
    // the cast, one figure a turn, after the first set and the table: the band's light figures for whoever fights,
    // the full ones for whoever speaks in a cinematic. (Doubles and walk-ons are still built by the director on entry.)
    const figures = [];
    for (const { id, lod } of chapterCast(chapter)) if (troupe.has(id) && !troupe.pool.has(`${id}#0:${lod}`)) figures.push({ kind: 'figure', id, lod });
    queue.splice(Math.min(2, queue.length), 0, ...figures);
    total = queue.length;
  }

  /** Build the next thing in the queue if this is a moment for it. Returns true when something was built this frame. */
  function pump(content, mode, moving) {
    app.stats.queued = queue.length;
    if (queue.length === 0) return false;
    if (mode === 'play' || moving) return false;
    if (++sincePump < PUMP_EVERY) return false;
    sincePump = 0;
    const item = queue[0];
    queue.shift();
    if (item.kind === 'figure') { troupe.take(item.id, 0, item.lod); app.stats.built++; settle = SETTLE; }
    else if (item.kind === 'table') { if (!tables.has(item.id)) tableNow(content, item.id); }
    else buildSet(item.key, item.light, item.use);
    return true;
  }

  /** The director's getSet, asked every frame: a built set, built now if it has to be. */
  const asked = new Map();        // key -> Map('light|low' or 'light|full' -> set)
  function getSet(key, light, use = 'lines') {
    if (key == null) return null;
    let byLight = asked.get(key);
    if (!byLight) asked.set(key, byLight = new Map());
    const lk = lowFor(use) ? `${light}|low` : `${light}|full`;
    let set = byLight.get(lk);
    if (!set) byLight.set(lk, set = buildNow(key, light, use));
    return set;
  }
  function buildNow(key, light, use) {
    const k = pairKey(key, light, use);
    if (!k) throw new Error(`gl/app: the stage asked for set "${key}", which does not exist (have ${Object.keys(SETS).join(', ')})`);
    const have = built.get(k);
    if (have) return have;
    const at = queue.findIndex((q) => q.kind === 'set' && pairKey(q.key, q.light, q.use) === k);
    if (at >= 0) queue.splice(at, 1);
    app.stats.urgent++;
    console.warn(`gl/app: set ${k} was wanted before it was built; building it now (one long frame)`);
    return buildSet(key, light, use);
  }
  /** The director sent a script cue to a set: remember it for the place, and tell the place's other build. */
  function onCue(set, id) {
    if (!set.place) return;
    let heard = cueLog.get(set.place);
    if (!heard) cueLog.set(set.place, heard = []);
    if (heard.length < 400) heard.push(id);
    for (const tail of ['low', 'full']) { const twin = built.get(`${set.place}|${tail}`); if (twin && twin !== set && twin.cue) twin.cue(id); }
  }

  function tableNow(content, id) {
    const view = GL.createTableView(content, id, { detail: lowSets ? 0.75 : 1 });     // a phone's table is cut a little coarser (engine: 63-73k -> 50-57k triangles)
    view.fitKey = null;
    tables.set(id, view);
    app.stats.built++;
    // as for a set: everything on the GPU now, in a corner the next draw paints over
    renderer.render(view.scene, view.camera, 0, { ...view.rect, x: 0, y: 0, w: 8, h: 8 });
    settle = SETTLE;
    return view;
  }

  // ───────────────────────── the director ─────────────────────────

  const director = createDirector(troupe, { getSet, onCue });

  // ───────────────────────── per-frame state ─────────────────────────

  const stageCam = GL.createCamera({ fov: 24, near: 0.3, far: 1500 });
  const titleCam = GL.createCamera({ fov: 40, near: 0.3, far: 1500 });
  const frameEvents = [], tickEvents = [];
  const bandCss = { x: 0, y: 0, w: 0, h: 0 }, bandLogical = { x: 0, y: 0, w: 0, h: 0 };
  // what the director is handed each frame. Beyond its own list: events (this frame's table events), cine (0..1, how far
  // the band has grown), pad (CSS px at the head and foot of the rect that the HUD covers in play), quality
  const F = { content: null, game: null, stage: null, camera: stageCam, rect: bandCss, voice: null, hit, events: frameEvents, cine: 0, pad: { top: 0, bottom: 0 }, quality: tierName };
  const voice = { who: '', level: 0, line: null };
  const hudFx = {};
  const anchors = {}, anchorPool = [], goalAt = { x: 0, y: 0 };
  let lastT = null, lastKind = null, cineW = 1, veil = 0, titleSet = null, tview = null, lastLight = null, lastLit = null;
  let acc = 0, accN = 0, ema = 0;

  /** Where on the glass (CSS px) a logged table event happened. For the director's energy arcs. */
  function hit(ev, out) {
    if (!tview || !ev) return false;
    const w = ev.id ? tview.where(ev.id) : null;
    if (w) tview.project(w[0], w[1], 8, out);
    else if (ev.type === 'payout' || ev.type === 'lit') tview.reelPos(1, out);
    else if (tview.hitScreen && tview.hitScreen.t !== undefined) { out[0] = tview.hitScreen.x; out[1] = tview.hitScreen.y; }
    else return false;
    return true;
  }

  function clearAll(color) {
    const c = GL.rgb(color);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.disable(gl.SCISSOR_TEST); gl.viewport(0, 0, glCanvas.width, glCanvas.height);
    gl.clearColor(c[0], c[1], c[2], 1); gl.clear(gl.COLOR_BUFFER_BIT);
  }

  function count(s, what) { app.stats.draws += s.drawCalls; app.stats.tris += s.triangles; app.stats[what] = `${s.drawCalls} draws, ${s.triangles} triangles`; }

  function measure(realMs, mode, builtNow) {
    ema += (realMs - ema) * 0.05;
    app.stats.frameMs = ema;
    if (pinned || tierName === TIER_ORDER[TIER_ORDER.length - 1]) return;
    if (builtNow || (mode !== 'play' && mode !== 'cine') || realMs > 100) { settle = SETTLE; return; }
    if (settle > 0) { settle--; acc = 0; accN = 0; return; }
    acc += realMs; accN++;
    if (accN < MEASURE) return;
    const mean = acc / accN; acc = 0; accN = 0;
    if (mean <= BUDGET_MS) return;
    const from = tierName;
    tierName = TIER_ORDER[TIER_ORDER.indexOf(tierName) + 1];
    app.stats.steps.push({ from, to: tierName, meanMs: +mean.toFixed(1) });
    console.warn(`gl/app: frames ${mean.toFixed(1)} ms apart at quality '${from}'; stepping down to '${tierName}'`);
    applyTier();
    settle = SETTLE * 2;
  }

  function tableFor(content, game, layout, k) {
    const id = currentChapter(content, game).tableId;
    const view = tables.get(id) || tableNow(content, id);
    const key = `${layout.W}x${layout.H}@${k.toFixed(4)}`;
    if (view.fitKey !== key) {
      const tf = layout.gl.tableFit, t = layout.gl.table;
      view.fit({ W: layout.W * k, H: layout.H * k, table: { x: tf.x * k, y: tf.y * k, scale: tf.scale * k } });
      // the viewport is as wide as the layout says, whatever padding fit() chose: same camera, more sea either side
      view.rect.x = t.x * k; view.rect.w = t.w * k;
      view.baseY = view.rect.y;
      view.fitKey = key;
    }
    return view;
  }

  // ───────────────────────── draw ─────────────────────────

  function drawScreen(content, game, layout, time, dt, cssW, cssH) {
    // a set of this chapter, turning slowly. Until one is built: ink, and the HUD says it is loading
    if (!titleSet || titleSet.chapter !== game.chapter) {
      const chapter = content.chapters[game.chapter];
      const first = chapter && chapter.stage && chapter.stage.sets ? chapterPairs(chapter)[0] : null;
      const k = first ? pairKey(first.set, first.light, first.use) : null;
      const set = k ? built.get(k) : null;
      titleSet = set ? { chapter: game.chapter, set } : null;
    }
    if (!titleSet) { clearAll(INK); return; }
    const set = titleSet.set, name = layout.kind === 'wide' && set.cameras.landscape ? 'landscape' : 'wide', c = set.cameras[name];
    set.update(time, dt);
    if (set.setPower) set.setPower(1);
    if (set.foreground) set.foreground.visible = true;
    if (set.wings) for (const w of set.wings) w.visible = true;
    set.frame(titleCam, name, time);
    titleCam.fov = c.fov;
    titleCam.orbit(c.target, c.dist * Math.max(1, c.aspect / (cssW / cssH)), c.yaw + Math.sin(time * 0.11) * 13, c.pitch + Math.sin(time * 0.07) * 1.5);
    troupe.aim(titleCam);
    const view = { x: 0, y: 0, w: cssW, h: cssH, ...set.view(name) };
    renderer.begin(INK_RGB);
    renderer.prepare(set.scene, titleCam, time, view);
    count(renderer.render(set.scene, titleCam, time, view), 'screen');
    renderer.end();
  }

  function drawStage(content, game, fx, layout, time, dt, cssW, cssH, k, stage) {
    const g = layout.gl, e = smooth(cineW);
    bandLogical.x = g.band.x * (1 - e); bandLogical.y = g.band.y * (1 - e);
    bandLogical.w = g.band.w + (layout.W - g.band.w) * e; bandLogical.h = g.band.h + (layout.H - g.band.h) * e;
    bandCss.x = bandLogical.x * k; bandCss.y = bandLogical.y * k; bandCss.w = bandLogical.w * k; bandCss.h = bandLogical.h * k;

    tview = tableFor(content, game, layout, k);
    // the table is lit like the encounter it powers. (A cinematic's backdrop may be lit otherwise; the table is away then.)
    if ((stage.phase === 'fight' || stage.phase === 'resolve') && stage.light && (stage.light !== lastLight || tview !== lastLit)) {
      lastLight = stage.light; lastLit = tview;
      const name = TABLE_LIGHT[stage.light];
      if (!name) throw new Error(`gl/app: no table light for the stage light "${stage.light}" (have ${Object.keys(TABLE_LIGHT).join(', ')})`);
      tview.setLight(name, cineW > 0.9 ? 0 : 1.5);       // at once while the table is away, else a slow turn of the light
    }

    if (fx.speaking) { voice.who = fx.speaking.who; voice.level = fx.voiceLevel; voice.line = fx.speaking; F.voice = voice; } else F.voice = null;
    F.content = content; F.game = game; F.stage = stage; F.cine = e; F.quality = tierName;
    F.pad.top = (HUD_BAND_HEAD + Math.max(0, fx.safe ? fx.safe.top : 0)) * k * (1 - e); F.pad.bottom = HUD_BAND_FOOT * k * (1 - e);
    director.update(dt, time, F);

    // One frame for the renderer (renderer.js, "a frame of several views"): both shadow maps first, then the table and the
    // band back to back into one buffer, then one copy to the canvas. Two self-presenting render() calls made a phone's
    // GPU leave the canvas half drawn and come back to it.
    const showTable = e < 0.999, set = director.set;
    let sview = null;
    if (showTable) {
      // the table slides off the foot of the canvas as the band grows over it
      tview.update(game, frameEvents, dt);
      tview.rect.y = tview.baseY + e * (cssH - tview.baseY + 4);
    }
    if (set) {
      const extra = cineW === 0 ? TIERS[tierName].band : null;
      sview = { x: bandCss.x, y: bandCss.y, w: bandCss.w, h: bandCss.h, ...director.view, ...extra };
    }
    renderer.begin(INK_RGB);
    if (showTable) renderer.prepare(tview.scene, tview.camera, time, tview.rect);
    if (sview) renderer.prepare(set.scene, stageCam, time, sview);
    if (showTable) count(tview.render(renderer, time), 'table');
    if (sview) count(renderer.render(set.scene, stageCam, time, sview), 'stage');
    drawInset(fx, layout, time, dt, k, e);
    renderer.end();
  }

  // ───────────────────────── the caller's inset ─────────────────────────
  // A line over the Line from somebody who is not on the stage: their own figure, talking, in a small picture at the
  // head of the cinematic (hud.js draws the frame at fx.inset). One figure on a cold flat ground: 3 draws, 10k triangles.

  let insetScene = null, insetCam = null, insetFig = null, insetId = '', insetOn = 0;
  const insetRect = { x: 0, y: 0, w: 0, h: 0 }, insetAt = [0, 0, 0], insetState = { emote: 'neutral', talk: 0, speaking: false, pose: 'stand', look: 'camera', face: 10, camera: null, snap: false, energy: 1 };
  function drawInset(fx, layout, time, dt, k, e) {
    const ins = director.inset;
    insetOn = clamp(insetOn + (ins && e > 0.9 ? dt : -dt) / 0.25, 0, 1);
    if (!ins || insetOn <= 0) { insetRect.w = 0; return; }
    if (!insetScene) {
      insetScene = GL.createScene(GL.makeEnv('night', { sky: { zenith: '#1c3f7a', mid: '#2d6fb3', horizon: '#9fd0f4', below: '#2d6fb3', glowAmount: 0, stars: 0, moon: 0 }, fog: { density: 0 }, water: null, ambient: { amount: 0.85 } }));
      insetCam = GL.createCamera({ fov: 22, near: 0.2, far: 60 });
    }
    if (insetId !== ins.as) {
      if (insetFig) insetScene.root.remove(insetFig.root);
      insetFig = troupe.take(ins.as, 7, 'full'); insetFig.release(); insetFig.home(); insetFig.root.setPos(0, 0, 0);
      insetScene.root.add(insetFig.root); insetId = ins.as; insetState.snap = true;
    }
    const line = F.stage && F.stage.line ? F.stage.line : null;
    insetState.emote = (line && line.emote) || 'neutral'; insetState.talk = F.voice ? Math.max(F.voice.level || 0, 0.03) : 0; insetState.camera = insetCam;
    insetFig.update(dt, insetState); insetState.snap = false;
    const hp = insetFig.headPos, hr = insetFig.headRadius, top = insetFig.height;
    insetAt[0] = hp[0]; insetAt[1] = hp[1] > 0.1 ? hp[1] - hr * 0.2 : top * 0.78; insetAt[2] = hp[2];
    insetCam.fov = 22; insetCam.orbit(insetAt, hr * 9.2, -12, 2);
    const side = 96, safeTop = fx.safe ? fx.safe.top : 0;
    insetRect.w = side; insetRect.h = side; insetRect.x = layout.kind === 'wide' ? 28 : 16; insetRect.y = layout.kind === 'wide' ? 24 : Math.max(18, safeTop + 10);
    troupe.aim(insetCam);
    const grow = 0.6 + 0.4 * smooth(insetOn), w = side * grow * k, x = (insetRect.x + side * (1 - grow) / 2) * k, y = (insetRect.y + side * (1 - grow) / 2) * k;
    insetRect.x = x / k; insetRect.y = y / k; insetRect.w = w / k; insetRect.h = w / k;
    count(renderer.render(insetScene, insetCam, time, { x, y, w, h: w, shadow: 'off' }), 'inset');
  }

  // ───────────────────────── Lanewar ─────────────────────────
  // The board has its own scene and camera, built the first time the saucer opens it (about 20 ms). It is drawn
  // into the rectangle fray-view.js leaves between the HUD's head and foot, and where the hero comes out on the
  // glass is written back for the touch target.
  let frayView = null;
  const frayRect = { x: 0, y: 0, w: 0, h: 0, shadowCenter: null, shadowRadius: 0 }, frayAt = [0, 0], frayBeside = [0, 0, 0], frayAt2 = [0, 0];
  function drawFrayBoard(game, fx, layout, time, dt, k) {
    if (!game.run) throw new Error('gl/app: mode fray with no run');
    if (!frayView) { frayView = createFrayView(GL); frayRect.shadowCenter = frayView.view.shadowCenter; frayRect.shadowRadius = frayView.view.shadowRadius; app.stats.built++; }
    const a = frayLayout(layout, fx.safe ? fx.safe.top : 0).area;
    frayRect.x = a.x * k; frayRect.y = a.y * k; frayRect.w = a.w * k; frayRect.h = a.h * k;
    frayView.update(game.run, dt, time);
    const cam = frayView.frame(frayRect.w / frayRect.h, time);
    renderer.begin(INK_RGB);
    renderer.prepare(frayView.scene, cam, time, frayRect);
    count(renderer.render(frayView.scene, cam, time, frayRect), 'fray');
    renderer.end();
    const h = frayView.hero;
    frayBeside[0] = h[0] + 1; frayBeside[1] = h[1]; frayBeside[2] = h[2];
    if (GL.projectTo(cam, h, frayRect, frayAt) && GL.projectTo(cam, frayBeside, frayRect, frayAt2)) {
      frayScreen.x = frayAt[0] / k; frayScreen.y = frayAt[1] / k; frayScreen.cell = Math.abs(frayAt2[0] - frayAt[0]) / k; frayScreen.n = game.run.n;
    }
  }

  function drawHudPass(content, game, fx, layout, cssW, cssH, k, stage, isStage) {
    const dev = hudCanvas.width / cssW;         // device px per CSS px of the HUD canvas
    hud.setTransform(1, 0, 0, 1, 0, 0);
    hud.globalAlpha = 1; hud.globalCompositeOperation = 'source-over';
    hud.clearRect(0, 0, hudCanvas.width, hudCanvas.height);

    // CSS px: what belongs to the 3D picture
    hud.setTransform(dev, 0, 0, dev, 0, 0);
    if (isStage) {
      if (!director.set) { hud.fillStyle = '#000'; hud.fillRect(bandCss.x, bandCss.y, bandCss.w, bandCss.h); }
      if (director.fade > 0.003) { hud.globalAlpha = clamp(director.fade, 0, 1); hud.fillStyle = director.fadeColor || INK; hud.fillRect(bandCss.x, bandCss.y, bandCss.w, bandCss.h); hud.globalAlpha = 1; }
      // an empty table dims their world: the lamps and figures go down in the director, and a veil of night comes
      // over the whole band (on a sunlit set the lamps alone do not show it). A ball at the plunger lifts half of it.
      const fight = stage && stage.phase === 'fight' && director.stage ? director.stage.fight : null;
      if (fight && cineW < 0.999) {
        const a = clamp((0.5 - fight.power) / 0.25, 0, 1) * 0.36 * (1 - smooth(cineW));
        if (a > 0.004) { hud.globalAlpha = a; hud.fillStyle = '#0b1030'; hud.fillRect(bandCss.x, bandCss.y, bandCss.w, bandCss.h); hud.globalAlpha = 1; }
      }
      hud.save(); director.drawOverlay(hud); hud.restore();
    }
    if (veil > 0.003) { hud.globalAlpha = smooth(clamp(veil, 0, 1)); hud.fillStyle = INK; hud.fillRect(0, 0, cssW, cssH); hud.globalAlpha = 1; }

    // logical px: the HUD module's
    hud.setTransform(dev * k, 0, 0, dev * k, 0, 0);
    for (const id in anchors) { anchorPool.push(anchors[id]); delete anchors[id]; }
    if (isStage) {
      const from = director.anchors;      // head tops, CSS px
      for (const id in from) { const a = anchorPool.pop() || { x: 0, y: 0 }; a.x = from[id].x / k; a.y = from[id].y / k; anchors[id] = a; }
    }
    Object.assign(hudFx, fx);
    hudFx.band = isStage ? bandLogical : null;
    hudFx.cine = isStage ? smooth(cineW) : 0;
    hudFx.anchors = anchors;
    hudFx.sub = isStage ? director.sub || null : null;
    hudFx.cues = isStage ? director.cues || null : null;
    hudFx.inset = isStage && insetRect.w > 0 ? insetRect : null;
    // where the stage has put the encounter's ring (logical px), so the HUD can keep its pills off the thing being worked on
    const dg = isStage ? director.goal : null;
    if (dg && dg.on && dg.kind === 'ring' && dg.x === dg.x) { goalAt.x = dg.x / k; goalAt.y = dg.y / k; hudFx.goal = goalAt; } else hudFx.goal = null;
    hudFx.k = k;
    hudFx.loading = total > 0 && queue.length > 0 ? 1 - queue.length / total : 1;
    hudFx.quality = tierName;
    hudFx.hasSave = null;
    hud.save();
    drawHud(hud, content, game, isStage ? stage : null, hudFx, layout);
    hud.restore();
  }

  function draw(content, game, fx, layout) {
    if (!app.ok || disposed) return;
    if (!layout || !layout.gl) throw new Error('gl/app.draw: the layout has no `gl` part; pass one from layout.js computeGlLayout');
    const time = fx.timeMs / 1000;
    const real = lastT === null ? 0 : time - lastT;
    lastT = time;
    const dt = clamp(real, 0, 0.1);
    renderer.resize();
    const cssW = glCanvas.clientWidth, cssH = glCanvas.clientHeight;
    if (!(cssW > 0) || !(cssH > 0)) return;
    const k = cssW / layout.W;
    app.stats.draws = 0; app.stats.tris = 0;

    const mode = game.mode, isStage = mode === 'play' || mode === 'cine', isFray = mode === 'fray', kind = isStage ? 'stage' : isFray ? 'fray' : 'screen';
    plan(content, game.chapter);
    const want = mode === 'play' ? 0 : 1;
    if (kind !== lastKind) {
      // a screen gives way to the stage (or the other way) under an ink veil. From a card the stage starts full: a prologue
      // is already where it should be, and a loaded game's table slides in from below
      if (lastKind !== null) veil = 1;
      cineW = 1;
      lastKind = kind;
      settle = SETTLE;
    }
    const moving = isStage && Math.abs(want - cineW) > 0.001;
    const builtNow = pump(content, mode, moving);
    if (isStage) cineW = clamp(cineW + clamp(want - cineW, -dt / GROW, dt / GROW), 0, 1);
    veil = Math.max(0, veil - dt / VEIL);

    let stage = null;
    if (isStage) {
      stage = stageState(content, game);
      drawStage(content, game, fx, layout, time, dt, cssW, cssH, k, stage);
    } else if (isFray) {
      drawFrayBoard(game, fx, layout, time, dt, k);
    } else {
      drawScreen(content, game, layout, time, dt, cssW, cssH);
    }
    frameEvents.length = 0;
    dropStale();
    app.stats.cineW = cineW; app.stats.phase = stage ? stage.phase : 'idle';
    drawHudPass(content, game, fx, layout, cssW, cssH, k, stage, isStage);
    measure(real * 1000, mode, builtNow);
  }

  // ───────────────────────── the rest of the surface ─────────────────────────

  const drawable = new Map();     // chapter index -> boolean, for the sets that exist now
  let drawableFor = -1;
  function canDraw(content, game) {
    if (!app.ok || disposed) return false;
    const n = Object.keys(SETS).length;
    if (n !== drawableFor) { drawable.clear(); drawableFor = n; }
    let yes = drawable.get(game.chapter);
    if (yes === undefined) {
      const chapter = content.chapters[game.chapter];
      const need = chapter ? setsNeeded(chapter) : [];
      yes = need.length > 0 && need.every((key) => setDef(key) !== null) && chapter.scenes.every((s) => !!s.encounter);
      drawable.set(game.chapter, yes);
    }
    return yes;
  }

  function observe(content, before, msg, after) {
    if (!app.ok || msg.type !== 'tick' || before.mode !== 'play' || !before.phys) return;
    tickEvents.length = 0;
    GL.tableEvents(content, before, msg, after, tickEvents);
    if (frameEvents.length < 256) for (let i = 0; i < tickEvents.length; i++) frameEvents.push(tickEvents[i]);
  }

  function dispose() {
    if (disposed) return;
    disposed = true; app.ok = false; app.reason = 'disposed';
    director.dispose();
    renderer.dispose();
  }

  app.canDraw = canDraw; app.observe = observe; app.draw = draw; app.dispose = dispose;
  app.renderer = renderer; app.director = director; app.sets = built; app.tables = tables;
  Object.defineProperty(app, 'tier', { get: () => tierName });
  return app;
}
