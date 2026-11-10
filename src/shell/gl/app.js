// The 3D renderer the shell draws with when the device has WebGL2: one WebGL canvas, one 2D HUD canvas over it.
//
//   const app = createGlApp(glCanvas, hudCanvas, { quality: 'low' | 'mid' | 'high' | null });
//   app.ok                              false when there is no WebGL2, and from the moment the context is lost
//   app.canDraw(content, game)          true when every set the current chapter needs exists (see TEMP_SET_FALLBACK)
//   app.observe(content, before, msg, after)   once per core tick in play: the table's events (bumper, reelStop, ...)
//   app.draw(content, game, fx, layout) the same contract as render.js: reads the game, never changes it.
//                                       layout must be one from layout.js computeGlLayout (it has layout.gl)
//   app.dispose()
//
// What is on the glass, by game.mode:
//   title, card, end   a set of the chapter turning slowly under the HUD module's screen
//   play               the live stage band (stage.js director, fed by the core's stageState) over the 3D table
//   cine               the band grown to the whole canvas, the table slid away below; the director plays the lines
// play <-> cine is one number, `cineW` 0..1, eased over GROW seconds: the band's rectangle and the table's offset are
// both read from it, so there is no cut. The director eases its own camera from the rectangle it is given.
//
// TWO COORDINATE SPACES. layout.js and the HUD work in logical px (430 wide in portrait). The engine and the director
// work in CSS px of the GL canvas. They differ by k = canvas.clientWidth / layout.W, and this file is the only place
// that converts: rectangles go to the engine times k, head anchors come back divided by k.
//
// SETS are built here, never by the director: a queue ordered by first use, one build every few frames while a
// title, card or cinematic is up, none during play. A set the director asks for before its turn is built at once
// (one long frame, logged). Each new set is drawn once into a few pixels so its buffers are on the GPU before the
// frame that needs them.
//
// QUALITY. Three tiers. With no ?q= the app starts at 'high' (a mouse) or 'mid' (a finger) and steps down whenever
// 120 frames of play or cinematic average more than BUDGET_MS apart. It never steps back up.

import * as GL from './index.js';
import { stageState, setsNeeded } from '../../core/stage.js';
import { currentChapter } from '../../core/story.js';

// These two are written by other hands this round. Until they exist the app goes on without them, out loud.
const optional = (path) => import(path).catch((e) => { console.warn(`gl/app: ${path} did not load (${e && e.message}); going on without it`); return null; });
const setsIndex = await optional('./sets/index.js');
const hudModule = await optional('./hud.js');

/**
 * TEMPORARY, for the integrator to delete: chapter 1's sets that did not exist when this was written are stood in
 * for by another set. canDraw counts a key listed here as present. A key in neither SETS nor this table makes
 * canDraw false, which is what keeps chapters 2-8 on the 2D renderer.
 */
export const TEMP_SET_FALLBACK = Object.freeze({
  'harbor-night': 'lantern-stalls', 'drum-hall': 'lantern-stalls', 'pier-riot': 'lantern-stalls', bench: 'lantern-stalls',
  'mint-office': 'lantern-stalls', orrery: 'lantern-stalls', 'ferry-dawn': 'lantern-stalls',
  ledger: 'lantern-stalls', line: 'lantern-stalls', black: 'lantern-stalls',
});

const INK = '#1d2146';
const GROW = 0.75;              // seconds for the band to grow to the whole canvas, or shrink back
const VEIL = 0.45;              // seconds an ink veil takes to lift after a screen gives way to the stage
const PUMP_EVERY = 5;           // frames between background builds
const BUDGET_MS = 21;           // mean frame interval above which the tier steps down (48 frames a second)
const MEASURE = 120;            // frames per measurement
const SETTLE = 45;              // frames ignored after a tier change, a build or a mode change

export const TIERS = Object.freeze({
  high: Object.freeze({ engine: 'high', dpr: 2, shadow: 2048, low: false }),
  mid: Object.freeze({ engine: 'medium', dpr: 1.5, shadow: 1024, low: false }),
  low: Object.freeze({ engine: 'low', dpr: 1, shadow: 512, low: true }),
});
const TIER_ORDER = ['high', 'mid', 'low'];

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (t) => t * t * (3 - 2 * t);
const allSets = () => (setsIndex && setsIndex.SETS) || GL.SETS;

/** The set definition for a key, or null. `stood` is true when it is a TEMP_SET_FALLBACK stand-in. */
function setDef(key) {
  const S = allSets();
  if (Object.hasOwn(S, key)) return { def: S[key], stood: false };
  const other = TEMP_SET_FALLBACK[key];
  if (other && Object.hasOwn(S, other)) return { def: S[other], stood: true };
  return null;
}

/** A light a set definition knows. The core names lights the artists may not have built ('interior'); a set's first light stands in. */
function lightFor(def, light) {
  if (!def.lights || def.lights.length === 0) return light || 'dusk';
  return def.lights.includes(light) ? light : def.lights[0];
}

/** Every (set key, light) a chapter uses, in first-use order. */
function chapterPairs(chapter) {
  const out = [], seen = new Set();
  const want = (set, light) => { const k = `${set}|${light}`; if (!seen.has(k)) { seen.add(k); out.push({ set, light }); } };
  const sets = chapter.stage.sets;
  const lines = (ls, enc) => { for (const l of ls) if (l.bg) { if (enc && enc.set === l.bg) want(enc.set, enc.light); else want(sets[l.bg].set, sets[l.bg].light); } };
  if (chapter.scenes[0] && chapter.scenes[0].encounter) want(chapter.scenes[0].encounter.set, chapter.scenes[0].encounter.light);   // the title turns on it
  lines(chapter.prologue, null);
  for (const s of chapter.scenes) { if (s.encounter) want(s.encounter.set, s.encounter.light); lines(s.cutscene, s.encounter); }
  lines(chapter.epilogue, null);
  return out;
}

/**
 * @param {HTMLCanvasElement} glCanvas   gets the WebGL2 context. Must not have a context yet
 * @param {HTMLCanvasElement} hudCanvas  the 2D canvas over it; this file clears it every frame
 * @param {{quality?: 'low'|'mid'|'high'|null}} [opts]
 */
export function createGlApp(glCanvas, hudCanvas, opts = {}) {
  const win = glCanvas.ownerDocument.defaultView;
  const pinned = opts.quality && TIERS[opts.quality] ? opts.quality : null;
  if (opts.quality && !pinned) throw new Error(`gl/app: unknown quality ${JSON.stringify(opts.quality)} (have ${Object.keys(TIERS).join(', ')})`);
  let tierName = pinned || (win.matchMedia && win.matchMedia('(pointer: coarse)').matches ? 'mid' : 'high');

  let renderer;
  try {
    // MSAA is a property of the context: it cannot be dropped later, so the low tier is made without it
    renderer = GL.createRenderer(glCanvas, { dprCap: TIERS[tierName].dpr, antialias: tierName !== 'low', quality: TIERS[tierName].engine });
  } catch (e) {
    console.warn(`gl/app: no 3D renderer (${e && e.message}); the 2D renderer draws`);
    return { ok: false, reason: String(e && e.message), canDraw: () => false, observe() {}, draw() {}, dispose() {} };
  }
  const gl = renderer.gl;
  const hud = hudCanvas.getContext('2d');
  if (!hud) throw new Error('gl/app: the HUD canvas gave no 2D context');

  const app = { ok: true, reason: '', stats: { tier: tierName, pinned: !!pinned, draws: 0, tris: 0, frameMs: 0, built: 0, urgent: 0, queued: 0, steps: [] } };
  let disposed = false;
  renderer.ctx.onLost = () => { if (!disposed) console.warn('gl/app: the WebGL context was lost; the 2D renderer takes over'); app.ok = false; app.reason = 'context lost'; };

  function applyTier() {
    const t = TIERS[tierName];
    app.stats.tier = tierName;
    if (typeof renderer.setQuality === 'function') renderer.setQuality(t.engine);
    else renderer.ctx.dprCap = t.dpr;
  }
  applyTier();

  // ───────────────────────── sets, tables, the cast ─────────────────────────

  const troupe = GL.createTroupe({ detail: 1 });
  const built = new Map();        // 'key|light' -> set
  const tables = new Map();       // table id -> table view
  const queue = [];               // { kind: 'set', key, light } | { kind: 'table', id }, in the order they will be wanted
  let planned = -1, total = 0, sincePump = 0, settle = SETTLE;
  const warmCam = GL.createCamera({ fov: 40, near: 0.3, far: 1500 });

  const pairKey = (key, light) => { const d = setDef(key); return d ? `${d.def.id}|${lightFor(d.def, light)}` : null; };

  function buildSet(key, light) {
    const d = setDef(key);
    if (!d) throw new Error(`gl/app: no set "${key}" (have ${Object.keys(allSets()).join(', ')})`);
    const lt = lightFor(d.def, light), k = `${d.def.id}|${lt}`;
    let set = built.get(k);
    if (set) return set;
    set = d.def.build(GL, { light: lt, low: TIERS[tierName].low });
    built.set(k, set);
    app.stats.built++;
    // once, into a corner the next draw paints over: geometry and textures go to the GPU now, not on the frame that cuts to it
    const cams = set.cameras || {};
    const name = cams.wide ? 'wide' : Object.keys(cams)[0];
    if (name) {
      set.frame(warmCam, name, 0);
      set.env.shadow.size = TIERS[tierName].shadow;
      renderer.render(set.scene, warmCam, 0, { x: 0, y: 0, w: 8, h: 8, ...set.view(name) });
    }
    settle = SETTLE;
    return set;
  }

  function plan(content, chapterIndex) {
    if (chapterIndex === planned) return;
    planned = chapterIndex;
    queue.length = 0;
    const chapter = content.chapters[chapterIndex];
    if (!chapter || !chapter.stage || !chapter.stage.sets) { total = 0; return; }
    const pairs = chapterPairs(chapter), seen = new Set();
    pairs.forEach((p, i) => {
      const k = pairKey(p.set, p.light);
      if (k && !built.has(k) && !seen.has(k)) { seen.add(k); queue.push({ kind: 'set', key: p.set, light: p.light }); }
      if (i === 0 && !tables.has(chapter.tableId)) queue.push({ kind: 'table', id: chapter.tableId });
    });
    total = queue.length;
  }

  /** Build the next thing in the queue if this is a moment for it. Returns true when something was built this frame. */
  function pump(content, mode, moving) {
    app.stats.queued = queue.length;
    if (queue.length === 0) return false;
    if (mode === 'play' || moving) return false;
    if (++sincePump < PUMP_EVERY) return false;
    sincePump = 0;
    const item = queue.shift();
    if (item.kind === 'table') { if (!tables.has(item.id)) tableNow(content, item.id); } else buildSet(item.key, item.light);
    return true;
  }

  /** The director's getSet: a built set, built now if it has to be. */
  function getSet(key, light) {
    if (key == null) return null;
    const k = pairKey(key, light);
    if (!k) throw new Error(`gl/app: the stage asked for set "${key}", which does not exist (have ${Object.keys(allSets()).join(', ')})`);
    const have = built.get(k);
    if (have) return have;
    const at = queue.findIndex((q) => q.kind === 'set' && pairKey(q.key, q.light) === k);
    if (at >= 0) queue.splice(at, 1);
    app.stats.urgent++;
    console.warn(`gl/app: set ${k} was wanted before it was built; building it now (one long frame)`);
    return buildSet(key, light);
  }

  function tableNow(content, id) {
    const view = GL.createTableView(content, id, { shadowSize: TIERS[tierName].shadow });
    view.fitKey = null;
    tables.set(id, view);
    app.stats.built++;
    // as for a set: everything on the GPU now, in a corner the next draw paints over
    renderer.render(view.scene, view.camera, 0, { ...view.rect, x: 0, y: 0, w: 8, h: 8 });
    settle = SETTLE;
    return view;
  }

  // ───────────────────────── the director ─────────────────────────

  const director = typeof GL.createDirector === 'function'
    ? GL.createDirector(troupe, { getSet })
    : createLegacyDirector(troupe, getSet);
  app.stats.director = typeof GL.createDirector === 'function' ? 'stage.js createDirector' : 'TEMPORARY legacy shim (app.js)';

  // ───────────────────────── per-frame state ─────────────────────────

  const stageCam = GL.createCamera({ fov: 24, near: 0.3, far: 1500 });
  const titleCam = GL.createCamera({ fov: 40, near: 0.3, far: 1500 });
  const frameEvents = [], tickEvents = [];
  const bandCss = { x: 0, y: 0, w: 0, h: 0 }, bandLogical = { x: 0, y: 0, w: 0, h: 0 };
  const F = { content: null, game: null, stage: null, camera: stageCam, rect: bandCss, voice: null, hit, events: frameEvents, cine: 0, quality: tierName };
  const voice = { who: '', level: 0, line: null };
  const hudFx = {};
  const anchors = {}, anchorPool = [], P2 = [0, 0];
  let lastT = null, lastKind = null, cineW = 1, veil = 0, titleSet = null, tview = null, lastLight = null;
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

  function count(s) { app.stats.draws += s.drawCalls; app.stats.tris += s.triangles; }

  function measure(realMs, mode, builtNow) {
    ema += (realMs - ema) * 0.05;
    app.stats.frameMs = ema;
    if (pinned || tierName === 'low') return;
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
      const k = first ? pairKey(first.set, first.light) : null;
      const set = k ? built.get(k) : null;
      titleSet = set ? { chapter: game.chapter, set } : null;
    }
    clearAll(INK);
    if (!titleSet) return;
    const set = titleSet.set, name = layout.kind === 'wide' && set.cameras.landscape ? 'landscape' : 'wide', c = set.cameras[name];
    set.update(time, dt);
    if (set.setPower) set.setPower(1);
    if (set.foreground) set.foreground.visible = true;
    set.frame(titleCam, name, time);
    titleCam.fov = c.fov;
    titleCam.orbit(c.target, c.dist * Math.max(1, c.aspect / (cssW / cssH)), c.yaw + Math.sin(time * 0.11) * 13, c.pitch + Math.sin(time * 0.07) * 1.5);
    set.env.shadow.size = TIERS[tierName].shadow;
    troupe.aim(titleCam);
    count(renderer.render(set.scene, titleCam, time, { x: 0, y: 0, w: cssW, h: cssH, ...set.view(name) }));
  }

  function drawStage(content, game, fx, layout, time, dt, cssW, cssH, k, stage) {
    const g = layout.gl, e = smooth(cineW);
    bandLogical.x = g.band.x * (1 - e); bandLogical.y = g.band.y * (1 - e);
    bandLogical.w = g.band.w + (layout.W - g.band.w) * e; bandLogical.h = g.band.h + (layout.H - g.band.h) * e;
    bandCss.x = bandLogical.x * k; bandCss.y = bandLogical.y * k; bandCss.w = bandLogical.w * k; bandCss.h = bandLogical.h * k;

    tview = tableFor(content, game, layout, k);
    if (stage.light !== lastLight) { lastLight = stage.light; if (typeof tview.setLight === 'function' && stage.light) tview.setLight(stage.light); }

    if (fx.speaking) { voice.who = fx.speaking.who; voice.level = fx.voiceLevel; voice.line = fx.speaking; F.voice = voice; } else F.voice = null;
    F.content = content; F.game = game; F.stage = stage; F.cine = e; F.quality = tierName;
    director.update(dt, time, F);

    clearAll(INK);
    if (e < 0.999) {
      // the table slides off the foot of the canvas as the band grows over it
      tview.update(game, frameEvents, dt);
      tview.rect.y = tview.baseY + e * (cssH - tview.baseY + 4);
      tview.env.shadow.size = TIERS[tierName].shadow;
      count(tview.render(renderer, time));
    }
    const set = director.set;
    if (set) {
      set.env.shadow.size = TIERS[tierName].shadow;
      count(renderer.render(set.scene, stageCam, time, { x: bandCss.x, y: bandCss.y, w: bandCss.w, h: bandCss.h, ...director.view }));
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
      if (cineW > 0.001 && cineW < 0.999 || game.mode === 'play') {
        // the seam between the stage and the table: an ink rule with a gold lip, riding the band's lower edge
        const y = bandCss.y + bandCss.h;
        if (y < cssH - 1) { hud.fillStyle = INK; hud.fillRect(bandCss.x, y - 3 * k, bandCss.w, 5 * k); hud.fillStyle = '#ffd24a'; hud.fillRect(bandCss.x, y - 3 * k, bandCss.w, 1.5 * k); }
      }
      if (typeof director.drawOverlay === 'function') { hud.save(); director.drawOverlay(hud); hud.restore(); }
    }
    if (veil > 0.003) { hud.globalAlpha = smooth(clamp(veil, 0, 1)); hud.fillStyle = INK; hud.fillRect(0, 0, cssW, cssH); hud.globalAlpha = 1; }

    // logical px: the HUD module's
    hud.setTransform(dev * k, 0, 0, dev * k, 0, 0);
    for (const id in anchors) { anchorPool.push(anchors[id]); delete anchors[id]; }
    if (isStage && typeof director.headOf === 'function') {
      const pin = (id) => { if (typeof id !== 'string' || anchors[id]) return; if (director.headOf(id, P2)) { const a = anchorPool.pop() || { x: 0, y: 0 }; a.x = P2[0] / k; a.y = P2[1] / k; anchors[id] = a; } };
      if (stage.party) stage.party.forEach(pin);
      if (stage.opposition && stage.opposition.who) stage.opposition.who.forEach(pin);
      if (fx.speaking) pin(fx.speaking.who);
    }
    Object.assign(hudFx, fx);
    hudFx.band = isStage ? bandLogical : null;
    hudFx.cine = isStage ? smooth(cineW) : 0;
    hudFx.anchors = anchors;
    hudFx.sub = isStage ? director.sub || null : null;
    hudFx.cues = isStage ? director.cues || null : null;
    hudFx.k = k;
    hudFx.loading = total > 0 && queue.length > 0 ? 1 - queue.length / total : 1;
    hudFx.quality = tierName;
    hudFx.hasSave = null;
    hud.save();
    if (hudModule && typeof hudModule.drawHud === 'function') hudModule.drawHud(hud, content, game, isStage ? stage : null, hudFx, layout);
    else placeholderHud(hud, content, game, stage, hudFx, layout);
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

    const mode = game.mode, isStage = mode === 'play' || mode === 'cine', kind = isStage ? 'stage' : 'screen';
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
    } else {
      drawScreen(content, game, layout, time, dt, cssW, cssH);
    }
    frameEvents.length = 0;
    drawHudPass(content, game, fx, layout, cssW, cssH, k, stage, isStage);
    measure(real * 1000, mode, builtNow);
  }

  // ───────────────────────── the rest of the surface ─────────────────────────

  const drawable = new Map();     // chapter index -> boolean, for the sets that exist now
  let drawableFor = -1;
  function canDraw(content, game) {
    if (!app.ok || disposed) return false;
    const n = Object.keys(allSets()).length;
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
    if (typeof director.dispose === 'function') director.dispose();
    renderer.dispose();
  }

  app.canDraw = canDraw; app.observe = observe; app.draw = draw; app.dispose = dispose;
  app.renderer = renderer; app.director = director; app.sets = built; app.tables = tables;
  Object.defineProperty(app, 'tier', { get: () => tierName });
  return app;
}

// ───────────────────────── TEMPORARY: a HUD until hud.js exists ─────────────────────────

/** Enough to see where things are while src/shell/gl/hud.js is being written. Not styled; delete with hud.js in place. */
function placeholderHud(g, content, game, stage, fx, layout) {
  const L = layout.gl, W = layout.W, H = layout.H;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  const text = (s, x, y, px, fill = '#fff7e2') => { g.font = `800 ${px}px "Avenir Next", system-ui, sans-serif`; g.lineWidth = px * 0.28; g.strokeStyle = '#1d2146'; g.strokeText(s, x, y); g.fillStyle = fill; g.fillText(s, x, y); };
  const ch = content.chapters[game.chapter];
  if (game.mode === 'title') { text('THE LONG SETTLEMENT', W / 2, H * 0.3, 30); text(fx.loading < 1 ? `building ${Math.round(fx.loading * 100)}%` : 'tap to begin', W / 2, H * 0.36, 14, '#ffd24a'); return; }
  if (game.mode === 'card') { text(`CHAPTER ${ch.number}`, W / 2, H * 0.3, 16, '#ffd24a'); text(ch.title.toUpperCase(), W / 2, H * 0.35, 30); text(ch.subtitle, W / 2, H * 0.4, 13); return; }
  if (game.mode === 'end') { text('THE END', W / 2, H * 0.4, 30); return; }
  if (game.mode === 'cine') {
    const line = game.cine.lines[game.cine.index], b = L.sub;
    g.fillStyle = '#fff7e2'; g.strokeStyle = '#1d2146'; g.lineWidth = 3;
    g.beginPath(); g.roundRect(b.x, b.y, b.w, b.h, 16); g.fill(); g.stroke();
    g.fillStyle = '#1d2146'; g.textAlign = 'left'; g.textBaseline = 'top';
    g.font = '800 13px "Avenir Next", system-ui, sans-serif'; g.fillText((content.cast[line.who] ? content.cast[line.who].name : line.who).toUpperCase(), b.x + 14, b.y + 10);
    g.font = '600 15px "Avenir Next", system-ui, sans-serif';
    const words = line.text.split(' '); let row = '', y = b.y + 32;
    for (const w of words) { if (g.measureText(row + w).width > b.w - 28) { g.fillText(row, b.x + 14, y); y += 20; row = ''; } row += w + ' '; }
    g.fillText(row, b.x + 14, y);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(29,33,70,0.7)'; g.beginPath(); g.roundRect(L.skip.x, L.skip.y, L.skip.w, L.skip.h, 12); g.fill(); text('SKIP', L.skip.x + L.skip.w / 2, L.skip.y + L.skip.h / 2, 13);
    return;
  }
  const p = stage.progress, band = fx.band, slide = -fx.cine * 80;
  text(`${p.done}/${p.total}`, band.x + 36, band.y + 20 + slide, 15);
  if (stage.opposition) text(stage.opposition.name.toUpperCase(), band.x + band.w - 84, band.y + 20 + slide, 12);
  if (stage.combo.count > 1) text(`${stage.combo.count} ${stage.combo.name || 'HITS'}`, band.x + 80, band.y + 46 + slide, 16, '#ffe27a');
  text(`${Math.floor(game.econ.score)}  W${game.econ.writs}  T${Math.round(game.econ.trust)}`, W / 2, band.y + band.h + 16, 12);
  g.globalAlpha = 0.85 * (1 - fx.cine); g.fillStyle = '#f2553a'; g.strokeStyle = '#1d2146'; g.lineWidth = 3;
  g.beginPath(); g.arc(L.launch.x, L.launch.y, L.launch.r, 0, 7); g.fill(); g.stroke(); g.globalAlpha = 1;
}

// ───────────────────────── TEMPORARY: the director's shape, on the slice's createEncounter / createCine ─────────────────────────

/**
 * Stands in for stage.js createDirector until it exists, so the shell can be driven end to end: the same surface
 * (update, set, view, fade, headOf, dispose), played with the vertical slice's encounter and cutscene objects. It knows
 * only the slice's four cast members, shows nobody for anyone else, and cuts (under a fade) where the real one moves.
 */
function createLegacyDirector(troupe, getSet) {
  const known = (id) => Object.hasOwn(GL.CAST, id);
  const view = { shadowCenter: [0, 0, 0.5], shadowRadius: 3 };
  const dir = { set: null, view, fade: 0, fadeColor: INK, sub: { who: '', onStage: false, x: NaN, y: NaN, radio: false }, cues: [], punch: 0 };
  let key = '', enc = null, cine = null, actors = [], rect = null, camera = null;
  const state = { speaker: '', emote: 'neutral', cam: 'wide', camera: null, aspect: 1, viewHeight: 400, snap: false };
  function strike() {
    for (const ch of actors) { if (ch.root.parent) ch.root.parent.remove(ch.root); if (ch.glow && dir.set && dir.set.scene.sprites) dir.set.scene.sprites.remove(ch.glow); }
    actors = []; enc = null; cine = null;
  }
  dir.update = (dt, time, f) => {
    const { game, stage } = f; camera = f.camera; rect = f.rect;
    const aspect = rect.w / rect.h;
    const fight = stage.phase === 'fight' || stage.phase === 'resolve';
    const want = fight ? `enc|${game.chapter}|${game.scene}` : `cine|${stage.set}|${stage.light}|${stage.party.join(',')}`;
    if (want !== key) {
      const set = getSet(stage.set, stage.light);
      if (!(fight && enc && key.startsWith('enc'))) dir.fade = dir.set ? 1 : 0;
      strike(); key = want; dir.set = set;
      if (fight) {
        const party = stage.party.filter(known), opp = stage.opposition.who.map((w) => (known(w) ? w : 'bailiff'));
        enc = GL.createEncounter(set, troupe, { party: party.length ? party : ['ren'], opposition: opp, title: stage.opposition.name });
        actors = enc.all;
      } else {
        const on = stage.party.filter(known).slice(0, 3);
        if (on.length) { cine = GL.createCine(set, troupe, { on }); actors = cine.list; }
      }
    }
    dir.fade = Math.max(0, dir.fade - dt / 0.35);
    const set = dir.set;
    set.update(time, dt);
    if (enc) {
      if (set.foreground) set.foreground.visible = false;
      enc.update(dt, time, stage.phase === 'resolve' && !enc.won ? [{ type: 'sceneClear' }] : f.events, stage.progress);
      enc.frame(camera, aspect, time, rect.h);
      view.shadowCenter = enc.view.shadowCenter; view.shadowRadius = enc.view.shadowRadius;
      dir.punch = enc.punch;
    } else if (cine) {
      state.speaker = stage.speaker; state.emote = stage.emote || 'neutral'; state.cam = stage.cam || 'wide'; state.camera = camera; state.aspect = aspect; state.viewHeight = rect.h;
      if (set.setPower) set.setPower(1);
      cine.update(dt, time, state);
      view.shadowCenter = cine.view.shadowCenter; view.shadowRadius = cine.view.shadowRadius;
    } else {
      const name = set.cameras[stage.cam] ? stage.cam : 'wide';
      if (set.foreground) set.foreground.visible = true;
      set.frame(camera, name, time); troupe.aim(camera);
      const v = set.view(name); view.shadowCenter = v.shadowCenter; view.shadowRadius = v.shadowRadius;
    }
  };
  const HP = [0, 0, 0];
  dir.headOf = (id, out) => {
    const ch = actors.find((c) => c.id === id || (typeof c.id === 'string' && c.id.replace(/\d+$/, '') === id));
    if (!ch || !rect) return false;
    HP[0] = ch.headPos[0]; HP[1] = ch.headPos[1] + ch.headRadius * 1.1; HP[2] = ch.headPos[2];
    return GL.projectTo(camera, HP, rect, out);
  };
  dir.dispose = strike;
  return dir;
}
