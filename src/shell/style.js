// The cel-style toolkit: flat colour, ink, one hard key light. Canvas 2D, pure drawing helpers.
//
// Every helper takes the context first and keeps no state except caches keyed by its arguments. Nothing here
// makes a gradient, sets shadowBlur or ctx.filter, or reads pixels: every edge is a hard edge, every glow is
// flat discs. All of it runs against the cinema's draw-nothing context (cinema/kit.js NULL_CTX), so it is safe in
// still sections and moving ones alike. Units are whatever the caller's transform says; where a default is in
// pixels it is meant for phone-logical pixels (see INK_W).
//
// A path function ("pathFn") is (ctx) => { ctx.moveTo(..); ctx.lineTo(..); ... }: it ADDS one closed outline to
// the current path and must not call beginPath, fill or stroke. The helpers call it several times, sometimes
// under a translate, to cut the shadow and the rim out of the same shape.
//
// colour
//   INK                                   the outline colour: deep indigo, never black
//   INK_W, INK_IN                         outline weights: 3 on a silhouette, 1.5 inside a form
//   PALETTE                               { ink, white, sea, seaDeep, lantern, brass, crimson, cream, indigo, night }
//   rgbOf(c) -> [r,g,b]                   parse #rgb, #rrggbb, rgb(), rgba(), hsl(); memoised
//   blend(a, b, k) -> css                 a toward b by k (0..1); memoised
//   shade(c, k) -> css                    c toward INK by k; memoised
//   tint(c, k) -> css                     c toward near-white by k; memoised
//   alpha(c, a) -> css rgba               c at opacity a; memoised
// light
//   light(col, angle, opts) -> Light      angle points FROM the subject TOWARD the lamp, canvas radians (0 right, -PI/2 up).
//                                         opts { depth 0..1 (0.8), tint, rim, amb }. Light is plain frozen data:
//                                         { id, col, angle, dx, dy, key, depth, shadowTint, rim, core, amb }
//   LIGHTS                                a few named Lights to start from: lantern, dawn, moon, storm, cold, hearth
//   shadowOf(base, L) -> css              the one shadow tone of base under L (tinted with L's complement); memoised
//   hiOf(base, L) -> css                  the one highlight tone of base under L; memoised
// ink
//   ink(ctx, width = INK_W, col = INK)                     set stroke state: ink colour, width, round joins and caps
//   outline(ctx, pathFn, width, col)                       stroke a path function in ink, centred on its edge
//   taper(ctx, x0, y0, x1, y1, w0, w1, col = INK)          a straight stroke whose width runs from w0 to w1 (0 ends in a point)
//   taperPath(ctx, pts, w0, w1, col = INK, belly = 0)      the same along a polyline [[x,y],..]; belly > 0 swells the middle
// forms
//   cel(ctx, pathFn, base, L, opts)                        the workhorse: base fill, one hard shadow, optional hard highlight,
//                                                          ink, optional rim; one save/clip/restore.
//                                                          opts { off (6), shadow: css | pathFn | false, hi: pathFn, hiCol,
//                                                                 ink (INK_W; 0 none), inkCol, rim (0), rimCol }
//   rim(ctx, pathFn, L, width, col = L.rim)                hard bright strip just inside the lit edge of a form
//   coreShadow(ctx, pathFn, L, width, col)                 the same on the far side, in shadow colour (default L.shadowTint at .5)
//   castShadow(ctx, x, y, rx, ry, L, len, col)             ground shadow of something standing at (x, y): a flat ellipse thrown away from L
//   castPoly(ctx, pathFn, groundY, L, len, col)            a form's own silhouette laid down on the ground line groundY, away from L
// light volumes
//   bloom(ctx, x, y, r, col, a, core)                      three concentric flat discs of falling alpha; core (a colour) adds a hot centre
//   lamp(ctx, x, y, r, L, a = 1, t = 0)                    a light source: bloom in L.col, near-white core, a glint that breathes with t
//   shaft(ctx, x, y, angle, len, spread, col, a)           hard-edged wedge of light from (x, y) along angle; two flat steps
//   glint(ctx, x, y, r, col, a = 1, rot = 0)               four-point star
//   bands(ctx, x, y, w, h, colours, stops)                 stepped sky: flat horizontal bands top to bottom (stops: fractions where each ends)
//   rings(ctx, x, y, r, colours, stops)                    stepped light volume: flat concentric discs, outermost first
// shape language
//   curl(ctx, x, y, r, turns, dir, width, col, inkW)       outlined spiral ribbon that thins to its centre: wind, smoke, steam, spray
//   gust(ctx, x, y, len, r, dir, width, col, inkW)         a streak of wind ending in a curl
//   cloud(ctx, x, y, w, h, col, L, seed, inkW)             flat-bottomed stack of lobes, cel-shaded
//   waves(ctx, x, y, w, h, opts)                           flat scalloped band with foam curls.
//                                                          opts { len (64), amp (10), phase (0), col, foam, every (2), ink (0), L }
//   puff(ctx, x, y, r, col, L, seed, inkW)                 one round lobed puff (smoke, spray burst), cel-shaded

const TAU = Math.PI * 2;
const BIG = 20000;
const CACHE_MAX = 4096;

/** the outline colour */
export const INK = '#1a1640';
/** outline weights: on a silhouette, and inside a form */
export const INK_W = 3;
export const INK_IN = 1.5;

/** the recurring colours of the world */
export const PALETTE = Object.freeze({
  ink: INK,
  white: '#fff6e0',     // near-white: the core of a lamp, foam, a catchlight
  sea: '#18a79c',       // sea teal
  seaDeep: '#0b5a6e',
  lantern: '#ff9326',   // lantern orange
  brass: '#e0a83a',     // Mint brass
  crimson: '#d6263f',   // signal crimson
  cream: '#f3e3bb',     // parchment
  indigo: '#2c2670',    // ink indigo, as a fill
  night: '#0e0b2a',     // the darkest third of a frame
});

// ───────────────────────── colour ─────────────────────────
const _rgb = new Map();
function hsl2rgb(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (u) => { u = ((u % 1) + 1) % 1; return u < 1 / 6 ? p + (q - p) * 6 * u : u < 1 / 2 ? q : u < 2 / 3 ? p + (q - p) * (2 / 3 - u) * 6 : p; };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
function rgb2hsl(v) {
  const r = v[0] / 255, g = v[1] / 255, b = v[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d < 1e-6) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
/** css colour string (or [r,g,b]) -> [r,g,b], each 0..255 */
export function rgbOf(c) {
  if (Array.isArray(c)) return c;
  let v = _rgb.get(c);
  if (v) return v;
  if (typeof c !== 'string') throw new Error(`style: a colour must be a css string, got ${String(c)}`);
  const s = c.trim();
  let m;
  if ((m = /^#([0-9a-f]{3})$/i.exec(s))) v = [...m[1]].map((h) => parseInt(h + h, 16));
  else if ((m = /^#([0-9a-f]{6})$/i.exec(s))) v = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  else if ((m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(s))) v = [+m[1], +m[2], +m[3]];
  else if ((m = /^hsla?\(\s*(-?[\d.]+)(?:deg)?[,\s]+([\d.]+)%[,\s]+([\d.]+)%/i.exec(s))) v = hsl2rgb(+m[1], +m[2] / 100, +m[3] / 100);
  else throw new Error(`style: cannot parse colour '${c}' (use #rgb, #rrggbb, rgb() or hsl())`);
  if (_rgb.size >= CACHE_MAX) _rgb.clear();
  _rgb.set(c, v);
  return v;
}
const hex = (v) => '#' + ((1 << 24) | (Math.max(0, Math.min(255, Math.round(v[0]))) << 16) | (Math.max(0, Math.min(255, Math.round(v[1]))) << 8) | Math.max(0, Math.min(255, Math.round(v[2])))).toString(16).slice(1);
const _memo = new Map();
function memo(key, make) {
  let v = _memo.get(key);
  if (v === undefined) { if (_memo.size >= CACHE_MAX) _memo.clear(); v = make(); _memo.set(key, v); }
  return v;
}
const q3 = (k) => Math.round((k < 0 ? 0 : k > 1 ? 1 : k) * 1000) / 1000;
/** a toward b by k */
export function blend(a, b, k) {
  k = q3(k);
  return memo(`b|${a}|${b}|${k}`, () => { const x = rgbOf(a), y = rgbOf(b); return hex([x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k]); });
}
/** c toward ink by k */
export const shade = (c, k) => blend(c, INK, k);
/** c toward near-white by k */
export const tint = (c, k) => blend(c, PALETTE.white, k);
/** c at opacity a, as an rgba() string */
export function alpha(c, a) {
  a = q3(a);
  return memo(`a|${c}|${a}`, () => { const v = rgbOf(c); return `rgba(${Math.round(v[0])},${Math.round(v[1])},${Math.round(v[2])},${a})`; });
}

// ───────────────────────── light ─────────────────────────
let _lightN = 0;
/**
 * A key light. angle points from the subject toward the lamp, in canvas radians: 0 is a lamp on the right,
 * -PI/2 a lamp overhead, PI a lamp on the left. Shadows fall along (-dx, -dy).
 * opts: depth 0..1 how far the shadow side drops (0.8); tint the shadow's hue (default: the complement of col);
 *       rim, amb: override the computed rim and ambient colours.
 * The result also carries { amb, rim, key } in the form the cinema's figures already read, so it can be a backdrop's light.
 */
export function light(col, angle, opts = {}) {
  if (typeof angle !== 'number' || !Number.isFinite(angle)) throw new Error(`style: light() needs an angle in radians, got ${String(angle)}`);
  const v = rgbOf(col), [h, s] = rgb2hsl(v);
  const depth = opts.depth === undefined ? 0.8 : opts.depth;
  // the complement, deep and saturated: what the far side of every form is tinted with
  const shadowTint = opts.tint || hex(hsl2rgb(h + 180, Math.max(0.5, Math.min(0.85, s * 0.9 + 0.2)), 0.2));
  const dx = Math.cos(angle), dy = Math.sin(angle);
  return Object.freeze({
    id: `L${++_lightN}`, col, angle, dx, dy, depth, shadowTint,
    rim: opts.rim || blend(col, '#ffffff', 0.62),
    core: blend(col, '#ffffff', 0.9),
    amb: opts.amb || blend(shadowTint, col, 0.12),
    key: dx >= 0 ? 1 : -1,
  });
}
/** the one shadow tone of base under L: base darkened, then pulled toward the complement of the light */
export function shadowOf(base, L) {
  return memo(`s|${base}|${L.id}`, () => { const v = rgbOf(base), d = 1 - 0.6 * L.depth; return blend(hex([v[0] * d, v[1] * d, v[2] * d]), L.shadowTint, 0.42 * L.depth); });
}
/** the one highlight tone of base under L */
export function hiOf(base, L) {
  return memo(`h|${base}|${L.id}`, () => blend(base, L.rim, 0.6));
}
/** Lights to start from. A backdrop should declare its own; these show the range. */
export const LIGHTS = Object.freeze({
  lantern: light(PALETTE.lantern, -Math.PI * 0.75),                 // a paper lantern, up and to the left
  hearth: light('#ff6a1e', Math.PI * 0.82, { depth: 0.9 }),         // a fire low on the left: light from below
  dawn: light('#ffd08a', -Math.PI * 0.12, { depth: 0.65 }),         // a low sun on the right
  moon: light('#bcd0ff', -Math.PI * 0.3, { depth: 0.85 }),          // cold, high right
  storm: light('#dff2ff', -Math.PI * 0.5, { depth: 0.9 }),          // lightning overhead
  cold: light('#7fd8ff', -Math.PI * 0.62, { depth: 0.85 }),         // a lamp-engine's cold flame
});

// ───────────────────────── ink ─────────────────────────
/** set the stroke state for an outline */
export function ink(ctx, width = INK_W, col = INK) {
  ctx.strokeStyle = col; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
}
/** stroke a path function in ink, centred on its edge */
export function outline(ctx, pathFn, width = INK_W, col = INK) {
  ink(ctx, width, col);
  ctx.beginPath(); pathFn(ctx); ctx.stroke();
}
/** a straight stroke whose width runs from w0 at (x0, y0) to w1 at (x1, y1) */
export function taper(ctx, x0, y0, x1, y1, w0, w1, col = INK) {
  const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy);
  if (!(d > 0)) return;
  const nx = -dy / d, ny = dx / d, a = Math.atan2(dy, dx), h0 = w0 / 2, h1 = w1 / 2;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(x0 + nx * h0, y0 + ny * h0);
  ctx.lineTo(x1 + nx * h1, y1 + ny * h1);
  if (h1 > 0.2) ctx.arc(x1, y1, h1, a + Math.PI / 2, a - Math.PI / 2, true);
  ctx.lineTo(x1 - nx * h1, y1 - ny * h1);
  ctx.lineTo(x0 - nx * h0, y0 - ny * h0);
  if (h0 > 0.2) ctx.arc(x0, y0, h0, a - Math.PI / 2, a + Math.PI / 2, true);
  ctx.closePath();
  ctx.fill();
}
/** add the outline of a ribbon along pts to the current path: half-width at each point from hw(u), u = 0..1 along it */
function ribbon(ctx, pts, hw) {
  const n = pts.length;
  if (n < 2) return;
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[i > 0 ? i - 1 : i], b = pts[i < n - 1 ? i + 1 : i];
    const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1, h = hw(i / (n - 1));
    L.push(p[0] - (dy / d) * h, p[1] + (dx / d) * h);
    R.push(p[0] + (dy / d) * h, p[1] - (dx / d) * h);
  }
  ctx.moveTo(L[0], L[1]);
  for (let i = 1; i < n; i++) ctx.lineTo(L[i * 2], L[i * 2 + 1]);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(R[i * 2], R[i * 2 + 1]);
  ctx.closePath();
}
/** a stroke along a polyline whose width runs from w0 to w1; belly > 0 swells the middle by that many times the mean width */
export function taperPath(ctx, pts, w0, w1, col = INK, belly = 0) {
  if (!pts || pts.length < 2) return;
  const mean = (w0 + w1) / 2;
  ctx.fillStyle = col;
  ctx.beginPath();
  ribbon(ctx, pts, (u) => (w0 + (w1 - w0) * u) / 2 + belly * mean * Math.sin(u * Math.PI) / 2);
  ctx.fill();
}

// ───────────────────────── forms ─────────────────────────
/** everything outside the path, as seen from inside a clip: a huge rectangle plus the path, to be filled 'evenodd' */
function outside(ctx, pathFn, ox, oy) {
  ctx.beginPath();
  ctx.rect(-BIG, -BIG, BIG * 2, BIG * 2);
  ctx.translate(ox, oy);
  pathFn(ctx);
  ctx.translate(-ox, -oy);
}
/**
 * Paint one form in the house style: base colour, one hard-edged shadow on the side away from the light, an
 * optional hard highlight, an ink line, an optional bright rim on the lit edge. One save/clip/restore.
 *
 * The shadow is the part of the form that the form itself, slid `off` toward the light, does not cover: a
 * crescent on the far side, as wide as off. Pass opts.shadow as a pathFn to draw the shadow shape yourself
 * (it is clipped to the form), as a css colour to keep the crescent in another tone, or false for none.
 * The ink line lies inside the silhouette (so it never smears a neighbour) and the rim is laid over it: where
 * the key light hits, the line thins by the rim's width, and breaks when the rim is as wide as the line.
 */
export function cel(ctx, pathFn, base, L, opts) {
  const o = opts || NO_OPTS;
  const off = o.off === undefined ? 6 : o.off;
  const inkW = o.ink === undefined ? INK_W : o.ink;
  ctx.beginPath(); pathFn(ctx);
  ctx.fillStyle = base; ctx.fill();
  ctx.save();
  ctx.clip();
  if (o.shadow !== false) {
    if (typeof o.shadow === 'function') { ctx.beginPath(); o.shadow(ctx); ctx.fillStyle = shadowOf(base, L); ctx.fill(); }
    else if (off > 0) { outside(ctx, pathFn, L.dx * off, L.dy * off); ctx.fillStyle = o.shadow || shadowOf(base, L); ctx.fill('evenodd'); }
  }
  if (o.hi) { ctx.beginPath(); o.hi(ctx); ctx.fillStyle = o.hiCol || hiOf(base, L); ctx.fill(); }
  if (inkW > 0) { ink(ctx, inkW * 2, o.inkCol || INK); ctx.beginPath(); pathFn(ctx); ctx.stroke(); }   // the clip keeps the inner half
  if (o.rim > 0) { outside(ctx, pathFn, -L.dx * o.rim, -L.dy * o.rim); ctx.fillStyle = o.rimCol || L.rim; ctx.fill('evenodd'); }
  ctx.restore();
}
const NO_OPTS = Object.freeze({});
/** a hard bright strip just inside the lit edge of a form */
export function rim(ctx, pathFn, L, width, col) {
  if (!(width > 0)) return;
  ctx.save();
  ctx.beginPath(); pathFn(ctx); ctx.clip();
  outside(ctx, pathFn, -L.dx * width, -L.dy * width);
  ctx.fillStyle = col || L.rim; ctx.fill('evenodd');
  ctx.restore();
}
/** a hard dark strip just inside the far edge of a form */
export function coreShadow(ctx, pathFn, L, width, col) {
  if (!(width > 0)) return;
  ctx.save();
  ctx.beginPath(); pathFn(ctx); ctx.clip();
  outside(ctx, pathFn, L.dx * width, L.dy * width);
  ctx.fillStyle = col || alpha(L.shadowTint, 0.5); ctx.fill('evenodd');
  ctx.restore();
}
/**
 * The ground shadow of something standing at (x, y): a flat ellipse rx by ry, thrown len away from the light.
 * The lower the lamp, the longer the caller should make len; the shadow keeps to the ground (it never rises).
 */
export function castShadow(ctx, x, y, rx, ry, L, len = 0, col) {
  const sx = -L.dx * len, sy = Math.abs(L.dy) < 0.2 ? 0 : -L.dy * len * 0.18;
  ctx.fillStyle = col || alpha(L.shadowTint, 0.55);
  ctx.beginPath();
  ctx.ellipse(x + sx / 2, y + Math.max(0, sy) / 2, rx + Math.abs(sx) / 2, ry + Math.abs(sy) / 2, 0, 0, TAU);
  ctx.fill();
}
/**
 * A form's own silhouette laid down on the ground: pathFn is drawn sheared about the line y = groundY, thrown
 * len (in units of the form's height, 1 = as long as it is tall) away from the light and flattened.
 */
export function castPoly(ctx, pathFn, groundY, L, len = 1, col) {
  const kx = -L.dx * len, ky = 0.16;
  ctx.save();
  // x' = x + (groundY - y) * kx,  y' = groundY + (groundY - y) * ky
  ctx.transform(1, 0, -kx, -ky, groundY * kx, groundY * (1 + ky));
  ctx.beginPath(); pathFn(ctx);
  ctx.fillStyle = col || alpha(L.shadowTint, 0.55); ctx.fill();
  ctx.restore();
}

// ───────────────────────── light volumes ─────────────────────────
function disc(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
/** bloom without blur: three concentric flat discs, alpha falling outward. core (a colour) adds a hot centre. */
export function bloom(ctx, x, y, r, col, a = 1, core) {
  if (!(a > 0.003) || !(r > 0)) return;
  ctx.fillStyle = alpha(col, 0.14 * a); disc(ctx, x, y, r);
  ctx.fillStyle = alpha(col, 0.2 * a); disc(ctx, x, y, r * 0.64);
  ctx.fillStyle = alpha(col, 0.34 * a); disc(ctx, x, y, r * 0.36);
  if (core) { ctx.fillStyle = alpha(core, Math.min(1, a)); disc(ctx, x, y, r * 0.15); }
}
/** four-point star */
export function glint(ctx, x, y, r, col = PALETTE.white, a = 1, rot = 0) {
  if (!(a > 0.003) || !(r > 0)) return;
  const k = r * 0.13, c = Math.cos(rot), s = Math.sin(rot);
  ctx.fillStyle = a >= 1 ? col : alpha(col, a);
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const c0 = i === 0 ? c : i === 1 ? -s : i === 2 ? -c : s, s0 = i === 0 ? s : i === 1 ? c : i === 2 ? -s : -c;   // the arm
    const c1 = -s0, s1 = c0;                                                                                         // the next arm
    if (i === 0) ctx.moveTo(x + c0 * r, y + s0 * r);
    ctx.quadraticCurveTo(x + (c0 + c1) * k, y + (s0 + s1) * k, x + c1 * r, y + s1 * r);
  }
  ctx.closePath(); ctx.fill();
}
/** a light source: bloom, a near-white core and a glint that breathes with t (seconds) */
export function lamp(ctx, x, y, r, L, a = 1, t = 0) {
  const p = 1 + 0.06 * Math.sin(t * 2.3);
  bloom(ctx, x, y, r * p, L.col, a, L.core);
  glint(ctx, x, y, r * 0.5 * (1 + 0.12 * Math.sin(t * 3.1 + 1)), PALETTE.white, a, 0);
}
/** a shaft of light: a hard-edged wedge from (x, y) along angle, spread radians wide, in two flat steps */
export function shaft(ctx, x, y, angle, len, spread, col, a = 0.2) {
  if (!(a > 0.003) || !(len > 0)) return;
  for (const [k, al] of SHAFT_STEPS) {
    const h = spread * k / 2, r = len / Math.cos(Math.min(1.4, spread / 2));
    ctx.fillStyle = alpha(col, a * al);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle - h) * r, y + Math.sin(angle - h) * r);
    ctx.lineTo(x + Math.cos(angle + h) * r, y + Math.sin(angle + h) * r);
    ctx.closePath(); ctx.fill();
  }
}
const SHAFT_STEPS = [[1, 0.55], [0.5, 0.45]];
function stopsOf(n, stops, what) {
  if (stops === undefined) return null;
  if (!Array.isArray(stops) || stops.length !== n) throw new Error(`style: ${what} got ${n} colours and ${stops && stops.length} stops; give one stop per colour (the fraction where it ends)`);
  return stops;
}
/** a stepped sky: flat horizontal bands from the top down. stops[i] is the fraction of h where colour i ends (default: equal bands) */
export function bands(ctx, x, y, w, h, colours, stops) {
  const n = colours.length, st = stopsOf(n, stops, 'bands()');
  let y0 = y;
  for (let i = 0; i < n; i++) {
    const y1 = i === n - 1 ? y + h : y + h * (st ? st[i] : (i + 1) / n);
    ctx.fillStyle = colours[i];
    ctx.fillRect(x, y0, w, y1 - y0 + (i === n - 1 ? 0 : 1));   // a pixel of overlap: no seam between bands under a fractional transform
    y0 = y1;
  }
}
/** a stepped light volume: flat concentric discs, outermost first. stops[i] is the fraction of r that colour i reaches (default: equal steps) */
export function rings(ctx, x, y, r, colours, stops) {
  const n = colours.length, st = stopsOf(n, stops, 'rings()');
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colours[i];
    disc(ctx, x, y, r * (st ? st[i] : (n - i) / n));
  }
}

// ───────────────────────── shape language ─────────────────────────
const rnd = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function spiralPts(x, y, r, turns, dir, lead) {
  const steps = Math.max(8, Math.ceil(turns * 18)), pts = [];
  // a straight lead-in along the tangent, then the spiral winding in to the centre
  if (lead > 0) for (let i = 3; i >= 1; i--) pts.push([x + r, y + dir * (lead * i) / 3]);
  for (let i = 0; i <= steps; i++) {
    const u = i / steps, a = -dir * u * turns * TAU, rr = r * (1 - u * 0.86);
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
  }
  return pts;
}
function strokeRibbon(ctx, pts, width, col, inkW, hw) {
  ctx.beginPath(); ribbon(ctx, pts, hw);
  if (inkW > 0) { ink(ctx, inkW * 2, INK); ctx.stroke(); }
  ctx.fillStyle = col; ctx.fill();
}
/**
 * A curl: an outlined spiral ribbon that winds in from radius r and thins to a point at its centre.
 * dir 1 winds counter-clockwise on screen, -1 clockwise. width is the ribbon at its widest.
 */
export function curl(ctx, x, y, r, turns = 1.5, dir = 1, width = 6, col = PALETTE.white, inkW = INK_IN) {
  if (!(r > 0) || !(turns > 0)) return;
  const pts = spiralPts(x, y, r, turns, dir, 0);
  strokeRibbon(ctx, pts, width, col, inkW, (u) => (width / 2) * (u < 0.12 ? 0.25 + u * 6.25 : 1 - 0.92 * ((u - 0.12) / 0.88)));
}
/** a streak of wind from (x, y) running len to the right (dir 1) or left (-1), ending in a curl of radius r */
export function gust(ctx, x, y, len, r, dir = 1, width = 5, col = PALETTE.white, inkW = INK_IN) {
  const pts = [];
  for (let i = 0; i <= 6; i++) pts.push([x + dir * (len * i) / 6, y + Math.sin((i / 6) * Math.PI) * -r * 0.25]);
  // wind up and over into the curl
  const cx = x + dir * len, cy = y - r;
  for (let i = 1; i <= 26; i++) {
    const u = i / 26, a = Math.PI / 2 - dir * u * 1.6 * TAU, rr = r * (1 - u * 0.8);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  strokeRibbon(ctx, pts, width, col, inkW, (u) => (width / 2) * (u < 0.2 ? u * 5 : 1 - 0.9 * ((u - 0.2) / 0.8)));
}
const _lobes = new Map();
/** the top edge of a stack of round lobes w wide and h tall, as offsets from its bottom-centre: [x0, y0, x1, y1, ...]; memoised */
function lobesEdge(w, h, seed) {
  const key = `${Math.round(w * 4)}|${Math.round(h * 4)}|${seed}`;
  let e = _lobes.get(key);
  if (e) return e;
  // three to five circles standing in a row, tallest near the middle; the edge is the highest circle at each x
  const n = 3 + Math.floor(rnd(seed) * 3), step = w / (n + 0.6), cs = [];
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, dome = Math.pow(Math.sin(u * Math.PI), 0.8);
    const r = Math.min(step * (0.6 + 0.24 * rnd(seed + i * 3.1)), h * 0.5), top = h * (0.42 + 0.58 * dome) * (0.8 + 0.2 * rnd(seed + i * 7.7));
    cs.push([-w / 2 + step * 0.8 + (w - step * 1.6) * (n === 1 ? 0.5 : i / (n - 1)), -top + r, r]);
  }
  e = [];
  const m = Math.max(16, Math.min(64, Math.ceil(w / 3)));
  for (let k = 0; k <= m; k++) {
    const x = -w / 2 + (w * k) / m;
    let y = 0;
    for (const [cx, cy, r] of cs) { const d = x - cx; if (Math.abs(d) < r) y = Math.min(y, cy - Math.sqrt(r * r - d * d)); }
    e.push(x, y);
  }
  if (_lobes.size >= 512) _lobes.clear();
  _lobes.set(key, e);
  return e;
}
function lobesPath(ctx, x, y, w, h, seed) {
  const e = lobesEdge(w, h, seed);
  ctx.moveTo(x + e[0], y);
  for (let i = 0; i < e.length; i += 2) ctx.lineTo(x + e[i], y + e[i + 1]);
  ctx.lineTo(x + e[e.length - 2], y);
  ctx.closePath();
}
/** a cloud: a flat-bottomed stack of lobes w wide and h tall, standing on (x, y), cel-shaded under L */
export function cloud(ctx, x, y, w, h, col, L, seed = 1, inkW = 0) {
  cel(ctx, (c) => lobesPath(c, x, y, w, h, seed), col, L, { off: h * 0.2, ink: inkW });
}
function puffPath(ctx, x, y, r, seed) {
  const n = 6 + Math.floor(rnd(seed) * 3);
  for (let i = 0; i <= n; i++) {
    const a0 = (i / n) * TAU, a1 = ((i + 0.5) / n) * TAU, k = 1.18 + 0.16 * rnd(seed + i * 2.3);
    if (i === 0) ctx.moveTo(x + Math.cos(a0) * r * 0.86, y + Math.sin(a0) * r * 0.86);
    else ctx.quadraticCurveTo(x + Math.cos(a1 - TAU / n) * r * k, y + Math.sin(a1 - TAU / n) * r * k, x + Math.cos(a0) * r * 0.86, y + Math.sin(a0) * r * 0.86);
  }
  ctx.closePath();
}
/** one round lobed puff of smoke or spray, cel-shaded under L */
export function puff(ctx, x, y, r, col, L, seed = 1, inkW = INK_IN) {
  cel(ctx, (c) => puffPath(c, x, y, r, seed), col, L, { off: r * 0.28, ink: inkW });
}
/**
 * A band of sea: flat colour with a scalloped top edge (pointed crests, round troughs) from (x, y) down h, and
 * foam: a hard white cap under every `every`-th crest and a curl breaking off it. Move it with opts.phase (in
 * crest lengths; any real number). opts: len crest spacing (64), amp crest height (10), col, foam colour
 * (near-white; false for none), every (2), ink (0: no line along the top), L (a Light: the caps sit on the lit side).
 */
export function waves(ctx, x, y, w, h, opts) {
  const o = opts || NO_OPTS;
  const len = o.len || 64, amp = o.amp === undefined ? 10 : o.amp, every = o.every || 2;
  const ph = ((o.phase || 0) % 1 + 1) % 1, i0 = Math.floor(o.phase || 0);
  const x0 = x - len + ph * len, n = Math.ceil(w / len) + 2;
  const top = (c) => {
    c.moveTo(x0, y);
    for (let i = 0; i < n; i++) c.quadraticCurveTo(x0 + (i + 0.5) * len, y + amp * 2, x0 + (i + 1) * len, y);
  };
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y - amp * 3 - 8, w, h + amp * 3 + 8); ctx.clip();
  ctx.beginPath(); top(ctx);
  ctx.lineTo(x0 + n * len, y + h); ctx.lineTo(x0, y + h); ctx.closePath();
  ctx.fillStyle = o.col || PALETTE.sea; ctx.fill();
  if (o.ink > 0) { ink(ctx, o.ink, INK); ctx.beginPath(); top(ctx); ctx.stroke(); }
  if (o.foam !== false) {
    const foam = o.foam || PALETTE.white, side = o.L && o.L.dx < 0 ? -1 : 1;
    for (let i = 0; i <= n; i++) {
      if ((((i - i0) % every) + every) % every !== 0) continue;
      const cx = x0 + i * len;
      // the cap: a sliver hanging under the crest on the lit side
      ctx.fillStyle = foam;
      ctx.beginPath();
      ctx.moveTo(cx, y);
      ctx.quadraticCurveTo(cx + side * len * 0.2, y + amp * 0.75, cx + side * len * 0.46, y + amp * 0.98);
      ctx.quadraticCurveTo(cx + side * len * 0.16, y + amp * 1.5, cx, y);
      ctx.fill();
      curl(ctx, cx - side * amp * 0.1, y - amp * 0.55, amp * 0.6, 1.1, side, Math.max(2, amp * 0.34), foam, o.ink > 0 ? Math.min(o.ink, INK_IN) : 0);
    }
  }
  ctx.restore();
}
