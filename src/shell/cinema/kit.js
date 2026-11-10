// The cinema's shared kit: constants, small maths, colour, drawing primitives, the still-layer cache
// (S(), A(), cinemaCache) and the scenery pieces that more than one file paints with.
// Part of the cinematic renderer: see ../cinema.js for the whole picture. No DOM is needed to import this.
//
// The painter table P is filled by ../cinema.js from the two backdrop files; paintBackdrop() and buildStills()
// read it when a frame is drawn, never at import time. Every helper here is exported; names that begin with an
// underscore are this module's own state.

export const W = 1280;
export const H = 800;
export const TAU = Math.PI * 2;

// ───────────────────────── small maths ─────────────────────────
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, k) => a + (b - a) * k;
export const ease = (k) => { k = clamp(k); return k * k * (3 - 2 * k); };
export const mod = (a, n) => ((a % n) + n) % n;
/** deterministic hash noise in [0,1) */
export function rnd(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}
export const flick = (t, seed) => 0.82 + 0.12 * Math.sin(t * 7.3 + seed * 11) + 0.06 * Math.sin(t * 17.1 + seed * 5);

// ───────────────────────── colour ─────────────────────────
const _rgb = new Map();
export function hsl2rgb(h, s, l) {
  h = mod(h, 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (u) => {
    u = mod(u, 1);
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
/** css colour string (or [r,g,b]) -> [r,g,b] */
export function rgb(c) {
  if (Array.isArray(c)) return c;
  let v = _rgb.get(c);
  if (v) return v;
  if (typeof c !== 'string') throw new Error(`cinema: colour must be a css string, got ${String(c)}`);
  const s = c.trim();
  let m;
  if ((m = /^#([0-9a-f]{3})$/i.exec(s))) v = [...m[1]].map((h) => parseInt(h + h, 16));
  else if ((m = /^#([0-9a-f]{6})$/i.exec(s))) v = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  else if ((m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(s))) v = [+m[1], +m[2], +m[3]];
  else if ((m = /^hsla?\(\s*([\d.]+)(?:deg)?[,\s]+([\d.]+)%[,\s]+([\d.]+)%/i.exec(s))) v = hsl2rgb(+m[1], +m[2] / 100, +m[3] / 100);
  else throw new Error(`cinema: cannot parse colour '${c}' (use #rgb, #rrggbb, rgb() or hsl())`);
  _rgb.set(c, v);
  return v;
}
export const css = (a) => `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})`;
export function rgba(c, a) {
  const v = rgb(c);
  return `rgba(${v[0] | 0},${v[1] | 0},${v[2] | 0},${a < 0 ? 0 : a > 1 ? 1 : a})`;
}
/** -> [r,g,b] */
export function mix(c1, c2, k) {
  const a = rgb(c1), b = rgb(c2);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}
/** Lighting for a figure: pull colours toward the scene's ambient, dim when not in focus. */
export function toner(light, focus) {
  const A = rgb(light.amb);
  const a = 0.12 + 0.24 * (1 - focus);
  const d = 1 - 0.13 * (1 - focus);
  return (c) => {
    const v = rgb(c);
    return `rgb(${((v[0] + (A[0] - v[0]) * a) * d) | 0},${((v[1] + (A[1] - v[1]) * a) * d) | 0},${((v[2] + (A[2] - v[2]) * a) * d) | 0})`;
  };
}

// ───────────────────────── drawing primitives ─────────────────────────
export function fade(ctx, a, fn) {
  if (a <= 0.003) return;
  const g = ctx.globalAlpha;
  ctx.globalAlpha = g * clamp(a);
  fn();
  ctx.globalAlpha = g;
}
export function vgrad(ctx, y0, y1, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}
export function hgrad(ctx, x0, x1, stops) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}
export function fillAll(ctx, style) {
  ctx.fillStyle = style;
  ctx.fillRect(-260, -180, W + 520, H + 360);
}
export function rect(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
export function circ(ctx, x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
export function seg(ctx, x0, y0, x1, y1, c, w) {
  ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
}
export function poly(ctx, pts, c) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) i ? ctx.lineTo(pts[i][0], pts[i][1]) : ctx.moveTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  if (c) { ctx.fillStyle = c; ctx.fill(); }
}
export function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
export function wrapText(ctx, text, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const rows = [];
  let cur = '';
  for (const w of words) {
    const tryRow = cur ? cur + ' ' + w : w;
    if (cur && ctx.measureText(tryRow).width > maxW) { rows.push(cur); cur = w; } else cur = tryRow;
  }
  if (cur) rows.push(cur);
  return rows;
}

export const FONT_UI = '"Avenir Next", "Segoe UI", "Helvetica Neue", system-ui, sans-serif';
export const FONT_SERIF = 'Georgia, "Iowan Old Style", "Times New Roman", serif';
export const FONT_SCRIPT = '"Snell Roundhand", "Apple Chancery", "Segoe Script", "Brush Script MT", cursive';
export const FONT_MONO = '"SF Mono", Menlo, Consolas, monospace';

// ───────────────────────── offscreen: sprites and still layers ─────────────────────────
// A phone cannot repaint a whole backdrop from vectors sixty times a second, so the parts of a backdrop that do
// not move are painted once into offscreen canvases and blitted. A painter marks its own sections:
//
//   ctx = S(depth);          what follows is still. depth is the parallax factor those statements multiply px by
//   ctx = S(depth, alpha);   still, but shown at an opacity that changes: a lamp's pool of light that flickers.
//                            The section paints it at full strength; alpha is applied when the layer is shown
//   ctx = A();               what follows moves
//
// A painter runs twice. The build pass (once per backdrop and canvas size) hands each still section an
// offscreen context and everything else a context that draws nothing; t is whatever it was at that moment and
// px is 0. The live pass (every frame) shows each still layer where its section begins, shifted by px * depth,
// and hands the still statements the context that draws nothing. So a still section must not leave a save(),
// a transform or a clip open for the moving code after it, and S() must be reached the same number of times on
// every run. With no DOM (node) or with cinemaCache.enabled false, both return the real context.
//
// Two copies of a layer are kept. The first is in stage space, a little larger than any view of it, and is
// drawn scaled while the camera moves. Scaling an image costs about what a gradient costs, so once the camera
// has stood still for a frame the layer is resampled once more, into device pixels exactly as it lies on the
// canvas, and from then on it is copied 1:1, which costs almost nothing. That is why the camera's backdrop
// transform must come to rest between moves (see drawCinema).
export const HAS_DOM = typeof document !== 'undefined' && typeof document.createElement === 'function';
export function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}
export function freeCanvas(c) { if (c) { c.width = 0; c.height = 0; } }   // Safari holds the backing store until the size goes to zero

export const NULL_GRAD = { addColorStop() {} };
/** a context that draws nothing: what the statements of the other kind are run against */
export const NULL_CTX = (() => {
  const o = { globalAlpha: 1, canvas: null };
  const noop = () => {};
  for (const m of ['save', 'restore', 'translate', 'rotate', 'scale', 'transform', 'setTransform', 'resetTransform', 'beginPath', 'closePath',
    'moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'arc', 'arcTo', 'ellipse', 'rect', 'roundRect', 'fill', 'stroke', 'clip',
    'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText', 'drawImage', 'setLineDash']) o[m] = noop;
  o.createLinearGradient = o.createRadialGradient = () => NULL_GRAD;
  o.measureText = () => ({ width: 0 });
  o.getLineDash = () => [];
  return o;
})();

/** Still-layer cache. Exported so a harness can switch it off and read what it holds. */
export const cinemaCache = {
  enabled: true,
  keep: 2,          // backdrops held at once: the one on screen, and the one dissolving out or coming next
  budget: 5.2e6,    // most pixels one still layer may hold. A canvas too large to cache at its own resolution is painted live
  stepped: false,   // build still layers one to a frame and hold the picture until they are there (see drawCinema). The game's
                    // shell turns this on; a harness that draws single frames leaves it off and gets every layer at once
  holdCamera: false, // a harness sets this to compare cached frames with uncached ones: the uncached camera then rests too
  builds: 0,        // halves of a backdrop completed
  steps: 0,         // single layers built by the stepped builder
  stats() {
    let layers = 0, px = 0;
    for (const r of _stills.values()) for (const part of [r.back, r.front]) for (const l of part.layers) if (l.canvas) { layers++; px += l.canvas.width * l.canvas.height; if (l.rest && l.rest.canvas) px += l.rest.canvas.width * l.rest.canvas.height; }
    return { backdrops: _stills.size, layers, megabytes: +((px * 4) / 1048576).toFixed(1), builds: cinemaCache.builds };
  },
  clear() { for (const r of _stills.values()) dropStills(r); _stills.clear(); },
};
const _stills = new Map();   // backdrop key -> { id, back: { layers, built }, front: { layers, built } }, least recently used first
let _pass = null;            // the painter pass in progress: { mode: 'off'|'build'|'live', key, real, part, cfg, cur, i, px }

export function dropLayer(l) { freeCanvas(l.canvas); if (l.rest) freeCanvas(l.rest.canvas); l.rest = null; }
export function dropStills(rec) { for (const part of [rec.back, rec.front]) { for (const l of part.layers) dropLayer(l); part.layers = []; part.built = false; } }
export function stillsFor(key, cfg) {
  let rec = _stills.get(key);
  if (rec && rec.id !== cfg.id) { dropStills(rec); rec = null; }     // the canvas changed size
  if (!rec) rec = { id: cfg.id, back: { layers: [], built: false }, front: { layers: [], built: false } };
  _stills.delete(key); _stills.set(key, rec);
  while (_stills.size > cinemaCache.keep) { const [k, r] = _stills.entries().next().value; dropStills(r); _stills.delete(k); }
  return rec;
}
/** finish the layer being built: find what was actually painted, keep only that rectangle */
export function sealLayer(p) {
  const cur = p.cur;
  if (!cur) return;
  p.cur = null;
  const c = cur.canvas, w = c.width, h = c.height, k = cur.k;
  const _t0 = performance.now();
  const d = new Uint32Array(c.getContext('2d').getImageData(0, 0, w, h).data.buffer);
  const rowHas = (y) => { for (let i = y * w, e = i + w; i < e; i++) if (d[i] >>> 24) return true; return false; };
  let y0 = 0, y1 = h - 1;
  while (y0 < h && !rowHas(y0)) y0++;
  if (y0 === h) { freeCanvas(c); p.part.layers.push({ canvas: null, depth: cur.depth, rest: null, seen: null }); return; }   // nothing was painted
  while (!rowHas(y1)) y1--;
  const colHas = (x) => { for (let y = y0; y <= y1; y++) if (d[y * w + x] >>> 24) return true; return false; };
  let x0 = 0, x1 = w - 1;
  while (!colHas(x0)) x0++;
  while (!colHas(x1)) x1--;
  let opaque = x0 === 0 && y0 === 0 && x1 === w - 1 && y1 === h - 1;
  if (opaque) for (let i = 0, n = w * h; i < n; i++) if ((d[i] >>> 24) !== 255) { opaque = false; break; }
  x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(w - 1, x1 + 1); y1 = Math.min(h - 1, y1 + 1);
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const out = newCanvas(bw, bh);
  out.getContext('2d', opaque ? { alpha: false } : undefined).drawImage(c, x0, y0, bw, bh, 0, 0, bw, bh);
  freeCanvas(c);
  p.part.layers.push({ canvas: out, depth: cur.depth, opaque, x: p.cfg.x + x0 / k, y: p.cfg.y + y0 / k, w: bw / k, h: bh / k, rest: null, seen: null });
  cinemaCache.sealMs = (cinemaCache.sealMs || 0) + performance.now() - _t0;
}
export const sameAt = (r, a, d, e, f) => Math.abs(r.a - a) < 1e-6 && Math.abs(r.d - d) < 1e-6 && Math.abs(r.e - e) < 0.02 && Math.abs(r.f - f) < 0.02;
/** resample a layer into device pixels for the place it now lies: (a, d) scale and (e, f) origin of stage space on the canvas */
export function restLayer(l, a, d, e, f, clip) {
  if (l.rest) freeCanvas(l.rest.canvas);
  const x0 = Math.max(clip.x, Math.floor(a * l.x + e)), y0 = Math.max(clip.y, Math.floor(d * l.y + f));
  const x1 = Math.min(clip.x + clip.w, Math.ceil(a * (l.x + l.w) + e)), y1 = Math.min(clip.y + clip.h, Math.ceil(d * (l.y + l.h) + f));
  l.rest = { a, d, e, f, canvas: null, x: x0, y: y0 };
  if (x1 <= x0 || y1 <= y0) return;
  const c = newCanvas(x1 - x0, y1 - y0);
  const g = c.getContext('2d', l.opaque ? { alpha: false } : undefined);
  g.setTransform(a, 0, 0, d, e - x0, f - y0);
  g.drawImage(l.canvas, l.x, l.y, l.w, l.h);
  l.rest.canvas = c;
}
/** show one still layer on the real context */
export function showLayer(p, l, alpha) {
  if (!l.canvas || !(alpha > 0.003)) return;
  const ctx = p.real, shift = p.px * l.depth, ga = ctx.globalAlpha;
  if (alpha < 1) ctx.globalAlpha = ga * alpha;
  const R = p.rest;
  let straight = false;
  if (R) {
    const M = ctx.getTransform();
    straight = M.b === 0 && M.c === 0 && M.a > 0 && M.d > 0;
    if (straight) {
      const e = M.e + M.a * shift - R.sx, f = M.f - R.sy;
      if (!(l.rest && sameAt(l.rest, M.a, M.d, e, f))) {
        if (l.seen && sameAt(l.seen, M.a, M.d, e, f)) restLayer(l, M.a, M.d, e, f, R.clip);   // the second frame in the same place: at rest
        else l.seen = { a: M.a, d: M.d, e, f };
      }
      if (l.rest && sameAt(l.rest, M.a, M.d, e, f)) {
        if (l.rest.canvas) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(l.rest.canvas, l.rest.x + Math.round(R.sx), l.rest.y + Math.round(R.sy));
          ctx.setTransform(M.a, M.b, M.c, M.d, M.e, M.f);
        }
        ctx.globalAlpha = ga;
        return;
      }
    }
  }
  // on the move. On a dense screen nearest-neighbour sampling is a quarter of the cost and motion hides it;
  // under a rotation (a deck rolling) it would crawl along every edge, so that is always filtered
  const coarse = straight && p.dev >= 1.5;
  if (coarse) ctx.imageSmoothingEnabled = false;
  ctx.drawImage(l.canvas, l.x + shift, l.y, l.w, l.h);
  if (coarse) ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = ga;
}
/** begin a still section */
export function S(depth, alpha) {
  const p = _pass;
  if (!p) throw new Error('cinema: S() called outside a backdrop painter');
  if (typeof depth !== 'number') throw new Error(`cinema: S() needs a parallax depth, got ${String(depth)} in backdrop '${p.key}'`);
  if (alpha !== undefined && !(alpha >= 0)) throw new Error(`cinema: S() alpha must be a number >= 0, got ${String(alpha)} in backdrop '${p.key}'`);
  if (p.mode === 'off') {
    if (p.ga !== null) { p.real.globalAlpha = p.ga; p.ga = null; }
    if (alpha !== undefined) { p.ga = p.real.globalAlpha; p.real.globalAlpha = p.ga * Math.min(1, alpha); }
    return p.real;
  }
  if (p.mode === 'build') {
    sealLayer(p);
    // A stepped build paints one section per pass: the others get the context that draws nothing.
    if (p.only !== undefined && p.n++ !== p.only) return NULL_CTX;
    const { x, y, w, h } = p.cfg;
    const k = alpha === undefined ? p.cfg.k : p.cfg.k / 2;    // a pool of light has no detail to lose: half the resolution, a quarter of the memory
    const c = newCanvas(w * k, h * k);
    const g = c.getContext('2d', { willReadFrequently: true });   // painted and read back once on the CPU, then copied
    g.setTransform(k, 0, 0, k, -x * k, -y * k);
    p.cur = { canvas: c, depth, k };
    return g;
  }
  const l = p.part.layers[p.i++];
  if (!l) throw new Error(`cinema: backdrop '${p.key}' reached still section ${p.i - 1} but only ${p.part.layers.length} were built (S() must not depend on time)`);
  showLayer(p, l, alpha === undefined ? 1 : Math.min(1, alpha));
  return NULL_CTX;
}
/** begin a moving section */
export function A() {
  const p = _pass;
  if (!p) throw new Error('cinema: A() called outside a backdrop painter');
  if (p.mode === 'build') { sealLayer(p); return NULL_CTX; }
  if (p.mode === 'off' && p.ga !== null) { p.real.globalAlpha = p.ga; p.ga = null; }
  return p.real;
}
export function buildStills(key, which, cfg, rec, T, info) {
  const part = rec[which];
  for (const l of part.layers) dropLayer(l);
  part.layers = [];
  const outer = _pass;
  _pass = { mode: 'build', key, real: null, part, cfg, cur: null, i: 0, px: 0 };
  try { P[key][which](NULL_CTX, T, 0, info); sealLayer(_pass); part.built = true; cinemaCache.builds++; } finally { if (_pass.cur) freeCanvas(_pass.cur.canvas); _pass = outer; }
}
/**
 * Build ONE more still layer of one half of a backdrop, and say whether that half is now complete.
 * buildStills() paints every layer of a half in one call, which on a phone is a frame of 80 to 270 ms: the
 * painter's vectors at full resolution, software-rastered, once per section. This runs the painter once per
 * section instead, each time with only that section's context real, so the work can be laid one layer to a
 * frame (see warmStills). The painter's own arithmetic is run again each time; against a context that draws
 * nothing that is well under a millisecond.
 */
export function buildStillsStep(key, which, cfg, rec, T, info) {
  const part = rec[which];
  if (part.built) return true;
  const fn = P[key][which];
  if (!fn) { part.built = true; return true; }
  const outer = _pass;
  const only = part.layers.length;
  _pass = { mode: 'build', key, real: null, part, cfg, cur: null, i: 0, px: 0, only, n: 0 };
  try {
    fn(NULL_CTX, T, 0, info);
    sealLayer(_pass);
    // sections seen: _pass.n. This pass built section `only` if there was one; the half is done when there is no next.
    if (_pass.n <= only + 1) { part.built = true; cinemaCache.builds++; }
    cinemaCache.steps++;
  } finally { if (_pass.cur) freeCanvas(_pass.cur.canvas); _pass = outer; }
  return part.built;
}
/** true when both halves of a backdrop are in the cache at this size (always, where nothing is cached) */
export function stillsReady(key, cfg) {
  if (!cfg) return true;
  const rec = _stills.get(key);
  return !!rec && rec.id === cfg.id && rec.back.built && (rec.front.built || !P[key].front);
}
/**
 * Bring a backdrop's still layers nearer to ready: at least one layer, and more while the clock says there is
 * time left in this frame. Returns true once everything is built. Never paints to the screen.
 */
export function warmStills(key, cfg, T, info, budgetMs = 4) {
  if (!cfg) return true;
  if (!P[key]) throw new Error(`cinema: cannot warm unknown backdrop '${key}'`);
  const rec = stillsFor(key, cfg);
  const now = typeof performance !== 'undefined' ? () => performance.now() : () => 0;
  const t0 = now();
  for (;;) {
    if (!rec.back.built) buildStillsStep(key, 'back', cfg, rec, T, info);
    else if (P[key].front && !rec.front.built) buildStillsStep(key, 'front', cfg, rec, T, info);
    else return true;
    if (now() - t0 >= budgetMs) break;
  }
  return rec.back.built && (rec.front.built || !P[key].front);
}
/**
 * Paint one half ('back' or 'front') of a backdrop. cfg (from stillsConfig) turns the still-layer cache on;
 * rest ({ clip, sx, sy, dev }: the picture's rectangle and this frame's shake, in device pixels) lets layers be
 * copied 1:1 while the camera is still.
 */
export function paintBackdrop(ctx, key, which, T, px, info, cfg, rest) {
  const fn = P[key][which];
  if (!fn) return;
  if (!cfg) {
    _pass = { mode: 'off', key, real: ctx, ga: null };
    try { fn(ctx, T, px, info); } finally { if (_pass.ga !== null) ctx.globalAlpha = _pass.ga; _pass = null; }
    return;
  }
  const rec = stillsFor(key, cfg);
  if (!rec[which].built) buildStills(key, which, cfg, rec, T, info);
  _pass = { mode: 'live', key, real: ctx, part: rec[which], cfg, cur: null, i: 0, px, rest: rest || null, dev: rest ? rest.dev : 1 };
  try { fn(ctx, T, px, info); } finally { _pass = null; }
}

// Glows are the commonest thing in these paintings. One radial sprite per colour, drawn scaled with the alpha
// wanted: the same picture as a fresh radial gradient (its stops were a, 0.35a, 0), without making a gradient.
export const GLOW_PX = 128;
const _glowSprites = new Map();
export function glowSprite(v) {
  const key = ((v[0] & 255) << 16) | ((v[1] & 255) << 8) | (v[2] & 255);
  let s = _glowSprites.get(key);
  if (!s) {
    if (_glowSprites.size >= 256) { for (const c of _glowSprites.values()) freeCanvas(c); _glowSprites.clear(); }
    s = newCanvas(GLOW_PX, GLOW_PX);
    const g = s.getContext('2d'), h = GLOW_PX / 2, gr = g.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, rgba(v, 1)); gr.addColorStop(0.45, rgba(v, 0.35)); gr.addColorStop(1, rgba(v, 0));
    g.fillStyle = gr; g.fillRect(0, 0, GLOW_PX, GLOW_PX);
    _glowSprites.set(key, s);
  }
  return s;
}
export function glow(ctx, x, y, r, c, a) {
  if (ctx === NULL_CTX || !(a > 0.003) || !(r > 0)) return;
  if (!HAS_DOM) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(c, a)); g.addColorStop(0.45, rgba(c, a * 0.35)); g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    return;
  }
  const al = ctx.globalAlpha;
  ctx.globalAlpha = al * (a > 1 ? 1 : a);
  ctx.drawImage(glowSprite(rgb(c)), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = al;
}
// Things that never change, painted once at device resolution and copied 1:1 afterwards: the vignette, the
// ground behind the words. paint(g) draws into the rectangle r in the caller's own coordinates.
export const _baked = new Map();
export function baked(ctx, name, r, alpha, paint) {
  if (!(alpha > 0.003)) return;
  const M = HAS_DOM && typeof ctx.getTransform === 'function' ? ctx.getTransform() : null;
  const w = M ? Math.round(M.a * r.w) : 0, h = M ? Math.round(M.d * r.h) : 0;
  if (!M || M.b !== 0 || M.c !== 0 || w < 1 || h < 1 || w * h > cinemaCache.budget) { fade(ctx, alpha, () => paint(ctx)); return; }
  const sig = `${w}x${h}|${r.w}x${r.h}`;
  let e = _baked.get(name);
  if (!e || e.sig !== sig) {
    if (e) freeCanvas(e.canvas);
    const c = newCanvas(w, h), g = c.getContext('2d');
    g.setTransform(w / r.w, 0, 0, h / r.h, -r.x * (w / r.w), -r.y * (h / r.h));
    paint(g);
    e = { sig, canvas: c };
    _baked.set(name, e);
  }
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * clamp(alpha);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(e.canvas, Math.round(M.a * r.x + M.e), Math.round(M.d * r.y + M.f));
  ctx.setTransform(M.a, M.b, M.c, M.d, M.e, M.f);
  ctx.globalAlpha = ga;
}
/** darkened corners over the rectangle r, with the proportions the gradient had on the 1280x800 stage */
export function vignette(ctx, r, a) {
  baked(ctx, 'vignette', r, a, (g) => {
    g.save();
    g.translate(r.x + r.w / 2, r.y + r.h / 2); g.scale(r.w / W, r.h / H);
    const gr = g.createRadialGradient(0, 0, 300, 0, 0, 820);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = gr; g.fillRect(-W / 2, -H / 2, W, H);
    g.restore();
  });
}

// ───────────────────────── shared scenery pieces ─────────────────────────
export function stars(ctx, seed, n, yMax, t) {
  for (let i = 0; i < n; i++) {
    const x = rnd(seed + i * 1.37) * (W + 400) - 200;
    const y = rnd(seed * 2 + i * 2.11) * (yMax + 160) - 160;
    const a = 0.25 + 0.6 * rnd(seed * 3 + i) * (0.7 + 0.3 * Math.sin(t * (0.8 + rnd(i) * 2) + i));
    const s = rnd(seed * 5 + i * 3) < 0.12 ? 2.2 : 1.3;
    rect(ctx, x, y, s, s, `rgba(225,232,255,${a})`);
  }
}
export function lantern(ctx, x, y, s, col, t, seed) {
  const sway = Math.sin(t * 1.1 + seed * 7) * 0.1 + Math.sin(t * 0.37 + seed * 3) * 0.05;
  const fl = flick(t, seed);
  if (s < 10) { // far away: a glow and a body, no ribs
    const lx = x - Math.sin(sway) * s * 1.3, ly = y + s * 1.3;
    glow(ctx, lx, ly, s * 4.2, col, 0.34 * fl);
    seg(ctx, x, y, lx, y + s * 0.4, 'rgba(12,8,10,.85)', 1);
    ctx.fillStyle = css(mix(col, '#fff6d8', 0.45 * fl));
    ctx.beginPath(); ctx.ellipse(lx, ly, s * 0.72, s * 0.9, 0, 0, TAU); ctx.fill();
    rect(ctx, lx - s * 0.3, ly - s * 0.98, s * 0.6, s * 0.16, '#1a0e0a');
    rect(ctx, lx - s * 0.26, ly + s * 0.84, s * 0.52, s * 0.14, '#1a0e0a');
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(sway);
  glow(ctx, 0, s * 1.3, s * 4.6, col, 0.34 * fl);
  seg(ctx, 0, 0, 0, s * 0.42, 'rgba(12,8,10,.85)', Math.max(1, s * 0.07));
  const g = ctx.createRadialGradient(0, s * 1.35, s * 0.1, 0, s * 1.3, s * 0.95);
  g.addColorStop(0, css(mix(col, '#fff6d8', 0.75 * fl)));
  g.addColorStop(0.55, css(mix(col, '#fff', 0.12)));
  g.addColorStop(1, css(mix(col, '#3a0c04', 0.35)));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, s * 1.3, s * 0.72, s * 0.9, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(60,20,8,.35)'; ctx.lineWidth = Math.max(0.6, s * 0.035);
  for (const k of [-0.42, 0, 0.42]) {
    ctx.beginPath(); ctx.ellipse(0, s * 1.3, s * 0.72 * Math.sqrt(1 - k * k * 0.9), s * 0.9, 0, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, s * (1.3 + k * 1.2), s * 0.72 * Math.sqrt(1 - k * k * 1.6), s * 0.1, 0, 0, Math.PI); ctx.stroke();
  }
  rect(ctx, -s * 0.3, s * 0.36, s * 0.6, s * 0.14, '#1a0e0a');
  rect(ctx, -s * 0.26, s * 2.14, s * 0.52, s * 0.12, '#1a0e0a');
  seg(ctx, 0, s * 2.26, Math.sin(t * 2 + seed) * s * 0.1, s * 2.8, css(mix(col, '#200', 0.3)), Math.max(1, s * 0.09));
  ctx.restore();
}
export function lanternString(ctx, x0, y0, x1, y1, sag, n, s, cols, t, seed) {
  ctx.strokeStyle = 'rgba(10,8,12,.8)'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + sag * 2, x1, y1); ctx.stroke();
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    lantern(ctx, lerp(x0, x1, u), lerp(y0, y1, u) + sag * 4 * u * (1 - u), s * (0.85 + 0.3 * rnd(seed + i)), cols[(i + ((seed * 7) | 0)) % cols.length], t, seed + i * 1.9);
  }
}
export function flame(ctx, x, y, s, t, seed) {
  const w = Math.sin(t * 9 + seed * 5) * 0.16 + Math.sin(t * 4.1 + seed) * 0.1;
  const h = 1 + 0.18 * Math.sin(t * 13 + seed * 3);
  glow(ctx, x, y - s * 0.6, s * 5.5, '#ff8a2a', 0.26 + 0.06 * Math.sin(t * 11 + seed));
  for (const [c, m] of [['#e8501a', 1], ['#ffa42e', 0.68], ['#fff0a8', 0.36]]) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.5 * m, y);
    ctx.quadraticCurveTo(x - s * 0.7 * m, y - s * 0.8 * m * h, x + s * w * m * 2, y - s * 1.9 * m * h);
    ctx.quadraticCurveTo(x + s * 0.7 * m, y - s * 0.8 * m * h, x + s * 0.5 * m, y);
    ctx.fill();
  }
}
export function motes(ctx, seed, n, col, t, o) {
  const w = o.x1 - o.x0, h = o.y1 - o.y0;
  for (let i = 0; i < n; i++) {
    const d = rnd(seed + i * 1.7);
    const x = o.x0 + mod(rnd(seed * 3 + i) * w + t * (o.vx || 0) * (0.4 + d) + Math.sin(t * 0.8 + i) * (o.wob || 10), w);
    const y = o.y0 + mod(rnd(seed * 5 + i * 2.3) * h + t * (o.vy || 0) * (0.4 + d) + Math.cos(t * 0.6 + i * 2) * (o.wob || 10) * 0.5, h);
    const a = o.a * (0.35 + 0.65 * d) * (o.tw ? 0.55 + 0.45 * Math.sin(t * 2.2 + i * 3) : 1);
    const r = o.r * (0.5 + d);
    ctx.fillStyle = rgba(col, a);
    if (o.streak) ctx.fillRect(x, y, r * o.streak, Math.max(1, r * 0.5));
    else { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  }
}
export function skyline(ctx, seed, x0, x1, base, hMin, hMax, wMin, wMax, col, win, t) {
  let x = x0, i = 0;
  while (x < x1) {
    const w = lerp(wMin, wMax, rnd(seed + i * 1.3));
    const h = lerp(hMin, hMax, Math.pow(rnd(seed * 2 + i * 2.1), 1.6));
    ctx.fillStyle = col;
    ctx.fillRect(x, base - h, w + 1, h + 2);
    const r = rnd(seed * 3 + i);
    if (r < 0.28) poly(ctx, [[x, base - h], [x + w / 2, base - h - w * 0.45], [x + w, base - h]], col);
    else if (r < 0.36) { ctx.beginPath(); ctx.arc(x + w / 2, base - h, w * 0.42, Math.PI, 0); ctx.fill(); }
    else if (r < 0.42) ctx.fillRect(x + w * 0.42, base - h - 22, 3, 22);
    if (win) {
      const stepY = h > 160 ? 14 : 9, stepX = h > 160 ? 12 : 8;
      for (let wy = base - h + 6; wy < base - 5; wy += stepY) {
        for (let wx = x + 4; wx < x + w - 4; wx += stepX) {
          if (rnd(i * 31 + wx * 0.71 + wy * 1.31) < 0.3) rect(ctx, wx, wy, 3, 4, rgba(win, 0.45 + 0.35 * Math.sin(t * 0.6 + wx * 0.3 + wy)));
        }
      }
    }
    x += w; i++;
  }
}
export function waterStreaks(ctx, seed, x0, x1, y0, y1, n, col, t, a = 0.5) {
  for (let i = 0; i < n; i++) {
    const d = rnd(seed + i * 1.9);
    const y = lerp(y0, y1, d * d);
    const w = (12 + rnd(seed * 2 + i) * 60) * (0.4 + d);
    const x = lerp(x0, x1, rnd(seed * 3 + i * 1.1)) + Math.sin(t * (0.5 + rnd(i) * 0.8) + i) * 14 * (0.3 + d);
    const al = a * (0.25 + 0.75 * rnd(seed * 7 + i)) * (0.55 + 0.45 * Math.sin(t * (1 + rnd(i * 3)) + i * 5));
    rect(ctx, x - w / 2, y, w, 1 + d * 2.2, rgba(col, al));
  }
}
/** a row of standing people as silhouettes: heads and shoulders, optional raised fists, signs, torches */
export function crowdRow(ctx, seed, x0, x1, y, n, s, col, t, o = {}) {
  for (let i = 0; i < n; i++) {
    const x = lerp(x0, x1, (i + rnd(seed + i) * 0.8) / n);
    const bob = Math.sin(t * (1 + rnd(i + seed * 3) * 1.5) + i * 1.7) * s * 0.07 * (o.bob === undefined ? 1 : o.bob);
    const yy = y + rnd(seed * 2 + i) * s * 0.55 + bob;
    const r1 = rnd(i * 5 + seed);
    ctx.fillStyle = col;
    if (o.fists && r1 < o.fists) {
      const sd = rnd(i + seed * 9) < 0.5 ? -1 : 1;
      const up = 1 + 0.25 * Math.sin(t * 3 + i * 2.3);
      ctx.strokeStyle = col; ctx.lineWidth = s * 0.3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x + sd * s * 0.7, yy + s * 0.9); ctx.lineTo(x + sd * s * 0.95, yy - s * 0.9 * up); ctx.stroke();
      ctx.lineCap = 'butt';
      circ(ctx, x + sd * s * 0.95, yy - s * 0.9 * up - s * 0.12, s * 0.24, col);
    } else if (o.signs && r1 > 1 - o.signs) {
      const tilt = Math.sin(t * 1.3 + i) * 0.06 + (rnd(i * 3 + seed) - 0.5) * 0.3;
      ctx.save(); ctx.translate(x + s * 0.5, yy + s); ctx.rotate(tilt);
      rect(ctx, -s * 0.06, -s * 3.2, s * 0.12, s * 3.2, col);
      rect(ctx, -s * 0.9, -s * 4.1, s * 1.8, s * 1.1, o.signCol || col);
      if (o.signInk) { rect(ctx, -s * 0.65, -s * 3.85, s * 1.3, s * 0.12, o.signInk); rect(ctx, -s * 0.65, -s * 3.55, s * 0.9, s * 0.12, o.signInk); rect(ctx, -s * 0.65, -s * 3.27, s * 1.1, s * 0.12, o.signInk); }
      ctx.restore();
    } else if (o.torch && r1 > 0.5 && r1 < 0.5 + o.torch) {
      rect(ctx, x + s * 0.72, yy - s * 1.6, s * 0.12, s * 2.6, col);
      flame(ctx, x + s * 0.78, yy - s * 1.6, s * 0.5, t, seed + i);
      ctx.fillStyle = col;
    }
    ctx.beginPath(); ctx.arc(x, yy, s * 0.42, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, yy + s * 1.3, s * 0.88, s * 0.85, 0, 0, TAU); ctx.fill();
    ctx.fillRect(x - s * 0.88, yy + s * 1.3, s * 1.76, s * 3);
    if (o.hat && rnd(i * 7 + seed) < o.hat) { ctx.fillRect(x - s * 0.5, yy - s * 0.42, s * 1.0, s * 0.16); ctx.fillRect(x - s * 0.34, yy - s * 0.62, s * 0.68, s * 0.24); }
  }
}
/** the Mint's sigil: a balance */
export function sigilScale(ctx, x, y, s, col, lw) {
  ctx.strokeStyle = col; ctx.lineWidth = lw || Math.max(1.5, s * 0.07); ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.lineTo(x, y + s);
  ctx.moveTo(x - s * 0.5, y + s); ctx.lineTo(x + s * 0.5, y + s);
  ctx.moveTo(x - s, y - s * 0.7); ctx.lineTo(x + s, y - s * 0.7);
  ctx.moveTo(x - s, y - s * 0.7); ctx.lineTo(x - s * 1.3, y); ctx.moveTo(x - s, y - s * 0.7); ctx.lineTo(x - s * 0.7, y);
  ctx.moveTo(x + s, y - s * 0.7); ctx.lineTo(x + s * 1.3, y); ctx.moveTo(x + s, y - s * 0.7); ctx.lineTo(x + s * 0.7, y);
  ctx.stroke();
  ctx.beginPath(); ctx.arc(x - s, y, s * 0.3, 0, Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.arc(x + s, y, s * 0.3, 0, Math.PI); ctx.stroke();
  ctx.lineCap = 'butt';
}
/** the Line's waveform, driven by voice level */
export function waveform(ctx, x0, x1, y, amp, level, tms, col, lw) {
  const lv = 0.05 + clamp(level) * 0.95;
  ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let x = x0; x <= x1; x += 4) {
    const u = (x - x0) / (x1 - x0);
    const env = Math.pow(Math.sin(u * Math.PI), 0.8);
    const v = Math.sin(x * 0.045 + tms * 0.011) * 0.5 + Math.sin(x * 0.113 - tms * 0.019) * 0.3 + Math.sin(x * 0.271 + tms * 0.031) * 0.2;
    const yy = y + v * env * amp * lv;
    x === x0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
  }
  ctx.stroke();
}

// ───────────────────────── backdrops ─────────────────────────
// Each backdrop is { light, back(ctx, t, px, info), front?(ctx, t, px, info) }.
//   t     seconds, continuous       px   parallax offset in pixels; layers multiply it by their depth
//   info  { tms, level, lineT, lines, index, portrait, portraitEmote }
// back is painted behind the cast, front (dust, embers, mist) over them. Painters cover
// x -260..1540, y -180..980 so the camera can move without showing an edge.
// light: amb tints the cast, rim is the edge light, key is the side the light comes from.
export const X0 = -260, XW = 1800;
export const P = Object.create(null);

// ── line: the earpiece call ──
export const LINE_LIGHT = { amb: '#06181c', rim: '#5fe0c8', key: -1 };

// ── orrery: the lamp-engine. Turning brass rings around a cold flame, above still water ──
/** stillsalt burning: a heavy, slow, blue-white flame */
export function coldFlame(ctx, x, y, s, t, seed, bare) {
  const w = Math.sin(t * 2.7 + seed * 5) * 0.07 + Math.sin(t * 1.1 + seed) * 0.05;
  const h = 1 + 0.07 * Math.sin(t * 3.7 + seed * 3);
  if (!bare) glow(ctx, x, y - s * 0.7, s * 6.5, '#6fc4ff', 0.3 + 0.04 * Math.sin(t * 2.3 + seed));
  for (const [c, m] of [['#2a66dc', 1], ['#86d0ff', 0.68], ['#f2fcff', 0.36]]) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.56 * m, y);
    ctx.bezierCurveTo(x - s * 0.9 * m, y - s * 0.7 * m * h, x - s * 0.3 * m + s * w * m, y - s * 1.2 * m * h, x + s * w * m * 2, y - s * 1.7 * m * h);
    ctx.bezierCurveTo(x + s * 0.3 * m + s * w * m, y - s * 1.2 * m * h, x + s * 0.9 * m, y - s * 0.7 * m * h, x + s * 0.56 * m, y);
    ctx.fill();
  }
}

// ── commons-hall: long tables, soup, a chalkboard of names ──
export function chalkLine(ctx, x, y, w, seed) {
  ctx.beginPath();
  for (let k = 0; k <= w; k += 5) {
    const yy = y + Math.sin(k * 0.6 + seed * 9) * 2.6 * rnd(seed + Math.floor(k / 14)) + (rnd(seed * 3 + k) - 0.5) * 2;
    k ? ctx.lineTo(x + k, yy) : ctx.moveTo(x + k, yy);
  }
  ctx.stroke();
}
export const LINE_ID = 'thorne'; // the one voice that is live on the Line; any other fx:'radio' speaker is a recording played back

/** how many characters of a line are on screen after lineT seconds: the text lands over the first half of the line */
export function revealCount(line, lineT) {
  const len = line.text.length;
  const words = line.text.split(/\s+/).length;
  const est = 1.4 + words * 0.34;
  const cps = Math.max(34, len / (est * 0.5));
  return Math.min(len, Math.floor(lineT * cps));
}
