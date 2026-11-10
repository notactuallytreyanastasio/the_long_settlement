// Backdrop painters, third file (chapter 6, Kedge; chapter 7, Vessery by day). Part of the cinematic renderer: see ../cinema.js.
// Exports BACKDROPS_C: key -> { light, back(ctx, t, px, info), front?(ctx, t, px, info) }.
// Still and moving sections are marked with ctx = S(depth) and ctx = A(): the contract is written out in kit.js.
//
// Same look as backdrops-a.js: flat colour, indigo ink, one hard key light per place (../style.js), passed to def() so
// the cast is lit from the same side. Almost everything is in still layers; what moves is a flame, a glint, a gull.
//
// Where things must sit. On a phone the cast fills the lower three quarters of the picture, so only a strip of the
// painting is seen whole: about x 360..920 (all twelve are painted for the default portrait pan, 640) and y 40..215.
// The lamp that lights each place, and the thing the scene is about, are inside that strip. The wide film shows the
// rest: the middle between two figures (x 520..760) and both sides, down to about y 560 where the words begin.
import { TAU, lerp, mod, rnd, fillAll, rect, circ, poly, FONT_SERIF, S, A, X0, XW, sigilScale, chalkLine } from './kit.js';
import {
  INK, PALETTE as C, light as keyLight, shade, tint, blend, alpha, ink, outline, taperPath, cel, bloom, shaft, glint, bands, rings, curl,
  cloud, waves,
} from '../style.js';

export const BACKDROPS_C = Object.create(null);
function def(key, light, back, front) { BACKDROPS_C[key] = { light, back, front: front || null }; }

// ───────────────────────── local kit ─────────────────────────
const IW = 4, II = 2.2;   // ink weights in stage units: one unit is about 0.72 px on a phone, so these are 3 and 1.5 there
const LCOLS = [C.lantern, '#ffc65a', '#ff6a3a', '#ffe2a0', C.crimson, '#ffb04a', '#5fd6c8'];
const FIRE = ['#e8401c', C.lantern, C.white];
const ROPE = '#c9a868';

// path functions (see style.js): each adds one closed outline to the current path
const pp = (pts) => (c) => { c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); };
const rp = (x, y, w, h) => (c) => { c.rect(x, y, w, h); };
const cp = (x, y, r) => (c) => { c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); c.closePath(); };
const ep = (x, y, rx, ry) => (c) => { c.moveTo(x + rx, y); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.closePath(); };
/** an arch standing on (x, y)..(x + w, y), h tall, round-headed */
const archP = (x, y, w, h) => (c) => { const r = w / 2; c.moveTo(x, y); c.lineTo(x, y - h + r); c.arc(x + r, y - h + r, r, Math.PI, 0); c.lineTo(x + w, y); c.closePath(); };
const quadAt = (a, c, b, u) => [(1 - u) * (1 - u) * a[0] + 2 * u * (1 - u) * c[0] + u * u * b[0], (1 - u) * (1 - u) * a[1] + 2 * u * (1 - u) * c[1] + u * u * b[1]];

function flat(ctx, pathFn, col) { ctx.beginPath(); pathFn(ctx); ctx.fillStyle = col; ctx.fill(); }
function stroke(ctx, x0, y0, x1, y1, w = II, col = INK) { ink(ctx, w, col); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
function box(ctx, x, y, w, h, col, L, o) { cel(ctx, rp(x, y, w, h), col, L, o); }
/** a shape with a bright edge toward the lamp, without a clip: the shape in rim colour pushed toward the light, then itself over it */
function rimmed(ctx, pathFn, col, L, w, rimCol) {
  ctx.translate(L.dx * w, L.dy * w); flat(ctx, pathFn, rimCol || L.rim); ctx.translate(-L.dx * w, -L.dy * w);
  flat(ctx, pathFn, col);
}
/** a stepped sky from the top of the stage down to y1 */
function sky(ctx, y1, cols, stops) { bands(ctx, X0, -180, XW, y1 + 180, cols, stops); }
/** still stars: flat specks, and now and then a four-point glint */
function starsFlat(ctx, seed, n, yMax, col = C.white) {
  for (let i = 0; i < n; i++) {
    const x = X0 + rnd(seed + i * 1.37) * XW, y = -160 + rnd(seed * 2 + i * 2.11) * (yMax + 160);
    if (rnd(seed * 5 + i * 3) < 0.16) glint(ctx, x, y, 6 + rnd(seed + i) * 6, col, 0.95);
    else rect(ctx, x, y, 2.6, 2.6, alpha(col, 0.45 + 0.45 * rnd(seed * 3 + i)));
  }
}
/** the moving part of a lamp: a four-point glint that breathes */
function spark(ctx, x, y, r, t, seed = 0) {
  glint(ctx, x, y, r * (1 + 0.14 * Math.sin(t * 2.7 + seed * 5) + 0.06 * Math.sin(t * 7.1 + seed * 3)), C.white, 1, 0);
}
/** gulls, each wheeling about its own place: [[x, y, s, seed], ...] */
function gulls(ctx, list, t, col = INK) {
  for (const [x, y, s, seed] of list) {
    const fx = x + Math.sin(t * 0.3 + seed * 5) * 46, fy = y + Math.cos(t * 0.23 + seed * 3) * 14, f = Math.sin(t * 5 + seed * 9) * 0.3;
    ink(ctx, Math.max(1.8, s * 0.17), col);
    ctx.beginPath(); ctx.moveTo(fx - s, fy + s * (0.1 - f)); ctx.quadraticCurveTo(fx - s * 0.5, fy - s * 0.5, fx, fy); ctx.quadraticCurveTo(fx + s * 0.5, fy - s * 0.5, fx + s, fy + s * (0.1 - f)); ctx.stroke();
  }
}
/** a rope: an ink line with the rope's colour laid in it. pathFn here issues moveTo/lineTo/curves for an OPEN path */
function rope(ctx, pathFn, w, col = ROPE) {
  ink(ctx, w + 3.4); ctx.beginPath(); pathFn(ctx); ctx.stroke();
  ink(ctx, w, col); ctx.beginPath(); pathFn(ctx); ctx.stroke();
}
/** a coil of rope seen face on. dim 0..1 drops it into shadow */
function coil(ctx, x, y, r, L, dim = 0, col = ROPE) {
  cel(ctx, cp(x, y, r), shade(col, dim), L, { off: r * 0.22, ink: II });
  ink(ctx, 1.6, alpha(INK, 0.7));
  for (const k of [0.8, 0.62, 0.46]) { ctx.beginPath(); ctx.arc(x, y, r * k, 0, TAU); ctx.stroke(); }
  circ(ctx, x, y, r * 0.3, C.night); ink(ctx, II); ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, TAU); ctx.stroke();
}
/**
 * A paper lantern hung from (x, y); its body is centred s * 1.3 below. Lit: the paper in its own colour, a hot
 * near-white heart, a stepped bloom (bloomK scales it; 0 for none). Unlit: the paper in shadow.
 */
function paperLantern(ctx, x, y, s, col, L, lit = true, bloomK = 1) {
  const cy = y + s * 1.3, rx = s * 0.74, ry = s * 0.92;
  if (s < 9) {   // far away: a body and a heart
    if (lit && bloomK > 0) bloom(ctx, x, cy, s * 3.6 * bloomK, col, 0.8);
    flat(ctx, ep(x, cy, rx, ry), lit ? col : shade(col, 0.6));
    if (lit) flat(ctx, ep(x, cy, rx * 0.45, ry * 0.55), tint(col, 0.8));
    rect(ctx, x - s * 0.3, cy - ry - s * 0.12, s * 0.6, s * 0.2, INK);
    return;
  }
  if (lit && bloomK > 0) bloom(ctx, x, cy, s * 4.2 * bloomK, col, 0.9);
  stroke(ctx, x, y, x, cy - ry, Math.max(1.4, s * 0.08));
  cel(ctx, ep(x, cy, rx, ry), lit ? col : shade(col, 0.5), L, {
    off: s * 0.34, shadow: lit ? blend(col, C.crimson, 0.5) : shade(col, 0.72), ink: Math.max(1.6, s * 0.11),
    hi: lit ? ep(x, cy + ry * 0.08, rx * 0.44, ry * 0.6) : null, hiCol: tint(col, 0.85),
  });
  ink(ctx, Math.max(1, s * 0.05), alpha(INK, 0.45));
  for (const k of [-0.42, 0.42]) { ctx.beginPath(); ctx.ellipse(x, cy + k * ry, rx * Math.sqrt(1 - k * k), ry * 0.12, 0, 0, Math.PI); ctx.stroke(); }
  rect(ctx, x - s * 0.34, cy - ry - s * 0.1, s * 0.68, s * 0.2, INK);
  rect(ctx, x - s * 0.28, cy + ry - s * 0.08, s * 0.56, s * 0.16, INK);
  taperPath(ctx, [[x, cy + ry], [x + s * 0.06, cy + ry + s * 0.3], [x - s * 0.04, cy + ry + s * 0.62]], Math.max(1.6, s * 0.12), 0, lit ? blend(col, C.crimson, 0.5) : shade(col, 0.7));
}
/** the same lantern, swinging from its hook */
function swayLantern(ctx, x, y, s, col, L, t, seed, bloomK = 1, lit = true) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 1.1 + seed * 7) * 0.1 + Math.sin(t * 0.37 + seed * 3) * 0.05);
  paperLantern(ctx, 0, 0, s, col, L, lit, bloomK);
  ctx.restore();
}
/** a cel fire standing on (x, y), s its half-width: three flat tongues, the outer one inked. It moves with t. */
function fire(ctx, x, y, s, t, seed, cols = FIRE) {
  const w = Math.sin(t * 7 + seed * 5) * 0.14 + Math.sin(t * 3.3 + seed) * 0.1, h = 1 + 0.14 * Math.sin(t * 11 + seed * 3);
  for (let i = 0; i < 3; i++) {
    const m = i === 0 ? 1 : i === 1 ? 0.66 : 0.34;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.55 * m, y);
    ctx.bezierCurveTo(x - s * 1.05 * m, y - s * 0.7 * m * h, x - s * 0.25 * m + s * w * m, y - s * 1.3 * m * h, x + s * w * m * 2.2, y - s * 2.2 * m * h);
    ctx.bezierCurveTo(x + s * 0.5 * m + s * w * m, y - s * 1.2 * m * h, x + s * 0.98 * m, y - s * 0.6 * m * h, x + s * 0.55 * m, y);
    ctx.closePath();
    if (i === 0) { ink(ctx, Math.max(2, s * 0.2)); ctx.stroke(); }
    ctx.fillStyle = cols[i]; ctx.fill();
  }
}
/**
 * A standing crowd as flat silhouettes, each with a rim of light on the side of the lamp. Still.
 * o: { rim (width), rimCol, hat } as fractions of the row.
 */
function crowd(ctx, seed, x0, x1, y, n, s, col, L, o = {}) {
  const rw = o.rim === undefined ? s * 0.16 : o.rim, rc = o.rimCol || L.rim;
  for (let i = 0; i < n; i++) {
    const x = lerp(x0, x1, (i + rnd(seed + i) * 0.8) / n), yy = y + rnd(seed * 2 + i) * s * 0.55;
    const hat = o.hat && rnd(i * 7 + seed) < o.hat;
    for (let pass = 0; pass < 2; pass++) {
      const ox = pass ? 0 : L.dx * rw, oy = pass ? 0 : L.dy * rw;
      ctx.fillStyle = pass ? col : rc;
      ctx.beginPath(); ctx.arc(x + ox, yy + oy, s * 0.46, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - s * 0.92 + ox, yy + s * 4.6 + oy); ctx.lineTo(x - s * 0.92 + ox, yy + s * 1.36 + oy); ctx.arc(x + ox, yy + s * 1.36 + oy, s * 0.92, Math.PI, 0); ctx.lineTo(x + s * 0.92 + ox, yy + s * 4.6 + oy); ctx.fill();
      if (hat) { ctx.fillRect(x - s * 0.64 + ox, yy - s * 0.42 + oy, s * 1.28, s * 0.18); ctx.fillRect(x - s * 0.38 + ox, yy - s * 0.7 + oy, s * 0.76, s * 0.32); }
    }
  }
}
/** a flat row of buildings, some gabled, some with a chimney; a rim strip toward the lamp; windows as flat rects. o: { rim, rimCol, win, winP } */
function town(ctx, seed, x0, x1, base, hMin, hMax, wMin, wMax, col, L, o = {}) {
  let x = x0, i = 0;
  while (x < x1) {
    const w = lerp(wMin, wMax, rnd(seed + i * 1.3)), h = lerp(hMin, hMax, Math.pow(rnd(seed * 2 + i * 2.1), 1.5)), r = rnd(seed * 3 + i), top = base - h, roof = r < 0.42 ? w * 0.42 : 0;
    const xx = x, P = (c) => { c.moveTo(xx, base + 2); c.lineTo(xx, top); if (roof) c.lineTo(xx + w / 2, top - roof); c.lineTo(xx + w + 1, top); c.lineTo(xx + w + 1, base + 2); c.closePath(); };
    if (o.rim) rimmed(ctx, P, col, L, o.rim, o.rimCol); else flat(ctx, P, col);
    if (r > 0.42 && r < 0.6) rect(ctx, x + w * 0.58, top - 15, 8, 16, col);
    if (o.win) for (let wy = top + 10; wy < base - 9; wy += 17) for (let wx = x + 6; wx < x + w - 9; wx += 14) if (rnd(i * 31 + wx * 0.71 + wy * 1.31) < (o.winP || 0.3)) rect(ctx, wx, wy, 5.5, 8, o.win);
    x += w; i++;
  }
}
/** light lying on water: flat bars, shorter and thinner toward the horizon. Still. */
function lozenges(ctx, seed, x0, x1, y0, y1, n, col) {
  ctx.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const d = rnd(seed + i * 1.9), y = lerp(y0, y1, d * d), w = (10 + rnd(seed * 2 + i) * 44) * (0.35 + d), h = 2.4 + d * 5, x = lerp(x0, x1, rnd(seed * 3 + i * 1.1));
    ctx.beginPath(); ctx.ellipse(x, y, w / 2, h / 2, 0, 0, TAU); ctx.fill();
  }
}
/** the same, a few that come and go: the moving part of a reflection */
function shimmer(ctx, seed, x0, x1, y0, y1, n, col, t) {
  ctx.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const d = rnd(seed + i * 1.9), k = Math.sin(t * (0.9 + rnd(i * 3) * 1.1) + i * 5);
    if (k < 0.1) continue;
    const y = lerp(y0, y1, d * d), w = (10 + rnd(seed * 2 + i) * 40) * (0.35 + d) * k, x = lerp(x0, x1, rnd(seed * 3 + i * 1.1)) + Math.sin(t * 0.6 + i) * 8;
    ctx.fillRect(x - w / 2, y, w, 2 + d * 3.5);
  }
}
/** motes in a shaft of light, as small glints */
function dust(ctx, seed, n, t, x0, y0, w, h, col, r, vx, vy) {
  for (let i = 0; i < n; i++) {
    const d = rnd(seed + i * 1.7), x = x0 + mod(rnd(seed * 3 + i) * w + t * vx * (0.4 + d), w), y = y0 + mod(rnd(seed * 5 + i * 2.3) * h + t * vy * (0.4 + d), h);
    glint(ctx, x, y, r * (0.6 + d) * (0.75 + 0.25 * Math.sin(t * 2.2 + i * 3)), col, 0.45 + 0.4 * d, 0);
  }
}
/** Halcyon's emblem, and the thing behind the third reel: a plumb-weight hanging true on its line */
function plumbWeight(ctx, x, y, s, col) {
  stroke(ctx, x, y - s * 1.9, x, y - s * 0.45, Math.max(1.5, s * 0.1), col);
  poly(ctx, [[x - s * 0.15, y - s * 0.52], [x + s * 0.15, y - s * 0.52], [x + s * 0.15, y - s * 0.36], [x + s * 0.42, y - s * 0.2], [x + s * 0.42, y + s * 0.12], [x, y + s], [x - s * 0.42, y + s * 0.12], [x - s * 0.42, y - s * 0.2], [x - s * 0.15, y - s * 0.36]], col);
}

// ═════════════════════════ chapter 6: Kedge ═════════════════════════

// ── kedge-roads: sixty hulls at anchor under a line of cranes, dawn. Key light: the low sun, behind the cranes ──
const L_ROADS = keyLight('#ffc27a', -Math.PI * 0.52, { depth: 0.78, tint: '#34205e' });
const UP = { dx: 0, dy: -1 };
/** a quay crane as a silhouette of struts: drawn twice, the first time in the colour of the light behind it and pushed toward it */
function quayCrane(ctx, x, base, s, dir, col, rimCol, L) {
  const X = (u) => x + u * s * dir, Y = (v) => base + v * s;
  const struts = [
    [-34, 0, -18, -120, 9], [34, 0, 18, -120, 9], [-30, -30, 26, -62, 3.5], [30, -30, -26, -62, 3.5], [-26, -62, 22, -96, 3.5], [26, -62, -22, -96, 3.5],
    [0, -168, 0, -252, 8], [10, -150, 196, -292, 7], [14, -122, 196, -292, 3.5], [0, -252, 196, -292, 3], [0, -252, -56, -150, 4], [-56, -150, -10, -128, 4],
    [50, -180, 46, -146, 3], [90, -211, 80, -172, 3], [130, -241, 114, -200, 3], [164, -267, 150, -234, 3], [50, -180, 80, -172, 3], [90, -211, 114, -200, 3], [130, -241, 150, -234, 3],
  ];
  for (let pass = 0; pass < 2; pass++) {
    const ox = pass ? 0 : L.dx * 2.2, oy = pass ? 0 : L.dy * 2.2, c = pass ? col : rimCol;
    ink(ctx, 1, c);
    for (const [a, b, d, e, w] of struts) { ctx.lineWidth = Math.max(1.6, w * s); ctx.beginPath(); ctx.moveTo(X(a) + ox, Y(b) + oy); ctx.lineTo(X(d) + ox, Y(e) + oy); ctx.stroke(); }
    ctx.fillStyle = c;
    ctx.fillRect(X(-32) + ox - (dir < 0 ? 64 * s : 0), Y(-132) + oy, 64 * s, 12 * s);                 // the turntable
    ctx.fillRect(X(-22) + ox - (dir < 0 ? 44 * s : 0), Y(-172) + oy, 44 * s, 42 * s);                 // the driver's cab
    ctx.fillRect(X(-74) + ox - (dir < 0 ? 30 * s : 0), Y(-160) + oy, 30 * s, 22 * s);                 // the counterweight
  }
  rect(ctx, X(-10) - (dir < 0 ? 16 * s : 0), Y(-164), 16 * s, 14 * s, rimCol);                        // the cab window, with the dawn in it
  stroke(ctx, X(196), Y(-292), X(196), Y(-292) + 96 * s, Math.max(1.4, 2 * s), col);                  // the fall, and its block
  rect(ctx, X(196) - 5 * s, Y(-292) + 96 * s, 10 * s, 14 * s, col);
}
/** a hull riding at anchor, seen against the light: a dark shape with the sun along its rail */
function anchoredHull(ctx, x, y, s, col, rimCol, seed) {
  const d = rnd(seed) < 0.5 ? 1 : -1, X = (u) => x + u * s * d;
  rimmed(ctx, pp([[X(-60), y - 15 * s], [X(50), y - 15 * s], [X(70), y - 25 * s], [X(58), y], [X(-52), y]]), col, UP, Math.max(1.4, 2.4 * s), rimCol);
  if (s > 0.3) rimmed(ctx, rp(Math.min(X(-44), X(-12)), y - 31 * s, 32 * s, 17 * s), col, UP, Math.max(1.2, 2 * s), rimCol);
  const mh = (62 + rnd(seed * 3) * 30) * s;
  stroke(ctx, X(12), y - 14 * s, X(12), y - 14 * s - mh, Math.max(1.4, 3.4 * s), col);
  if (s > 0.3) { stroke(ctx, X(12), y - 14 * s - mh * 0.7, X(54), y - 22 * s, Math.max(1, 1.8 * s), col); stroke(ctx, X(-10), y - 14 * s - mh * 0.74, X(34), y - 14 * s - mh * 0.74, Math.max(1.2, 2.6 * s), col); }
  if (rnd(seed * 7) < 0.6) rect(ctx, X(12) - 1.6, y - 14 * s - mh - 3.2, 3.2, 3.2, '#fff0c0');   // a riding light, not yet put out
}
def('kedge-roads', L_ROADS, (ctx, t, px) => {
  const L = L_ROADS, hy = 326, sx = 668, sy = 178, DK = '#2a1850', RIM = '#ff9a5c';
  ctx = S(0.05);
  sky(ctx, hy, ['#3c3484', '#77479a', '#c9588a', '#f5825e', '#ffb45e', '#ffd88a'], [0.3, 0.5, 0.66, 0.8, 0.92, 1]);
  rings(ctx, sx, sy, 250, [alpha('#ffe2a0', 0.2), alpha('#ffe9b0', 0.3), alpha('#fff2c8', 0.5)], [1, 0.66, 0.38]);
  circ(ctx, sx, sy, 50, '#fff6e0');
  for (const [cx, cy, w, h, sd] of [[250, 120, 250, 40, 3], [1010, 86, 300, 46, 5], [470, 44, 180, 30, 7], [880, 226, 200, 28, 9], [-60, 210, 260, 36, 11]]) cloud(ctx, cx, cy, w, h, '#8a4a94', L, sd, 0);
  flat(ctx, (c) => { c.moveTo(X0, hy + 2); c.lineTo(X0, 270); c.quadraticCurveTo(-40, 250, 150, 286); c.lineTo(330, hy + 2); c.closePath(); }, '#6a3c8a');   // the far head of the roads
  flat(ctx, (c) => { c.moveTo(1540, hy + 2); c.lineTo(1540, 262); c.quadraticCurveTo(1330, 268, 1180, 300); c.lineTo(1060, hy + 2); c.closePath(); }, '#6a3c8a');
  // the sea: the sun's road down the middle of it
  bands(ctx, X0, hy, XW, 700, ['#f08a5c', '#b8527e', '#7a3a82', '#4a2a6c', '#2c1c52'], [0.05, 0.14, 0.3, 0.52, 1]);
  lozenges(ctx, 3, sx - 150, sx + 150, hy + 4, hy + 60, 30, '#ffe2a0');
  lozenges(ctx, 4, sx - 240, sx + 240, hy + 50, hy + 260, 34, '#ffc27a');
  lozenges(ctx, 5, X0, X0 + XW, hy + 4, hy + 40, 40, '#ffb45e');
  waves(ctx, X0, hy + 150, XW, 90, { len: 96, amp: 6, col: '#42266a', foam: '#ffb45e', every: 4, phase: 0.2, L });
  waves(ctx, X0, hy + 236, XW, 400, { len: 150, amp: 10, col: '#2c1c52', foam: '#ffb45e', every: 3, phase: 0.6, L });
  lozenges(ctx, 6, sx - 300, sx + 300, hy + 160, hy + 330, 16, '#ff9a5c');
  // the mole and its cranes, black against the day coming up; hulls beyond it, and three rows this side
  ctx = S(0.16);
  for (let i = 0; i < 9; i++) anchoredHull(ctx, -150 + i * 196 + rnd(i * 3.3) * 60, hy + 1, 0.3, '#5a347c', '#ffb45e', i * 1.7 + 40);
  rimmed(ctx, rp(X0, hy - 12, XW, 22), DK, UP, 3, RIM);
  for (let i = 0; i < 28; i++) rect(ctx, X0 + 30 + i * 66, hy - 4, 6, 8, i % 3 ? RIM : '#fff0c0');                 // sheds along the mole, lamps still lit in them
  for (const [x, s, dir] of [[-110, 0.98, 1], [140, 0.84, -1], [352, 0.9, 1], [566, 0.8, 1], [806, 0.94, -1], [1010, 0.82, 1], [1222, 1, -1], [1420, 0.86, -1]]) quayCrane(ctx, x, hy - 10, s, dir, DK, RIM, L);
  for (let i = 0; i < 14; i++) anchoredHull(ctx, -200 + i * 126 + rnd(i * 5.1) * 50, hy + 34 + rnd(i) * 8, 0.36, '#4a2a6c', RIM, i * 2.3 + 3);
  for (let i = 0; i < 11; i++) anchoredHull(ctx, -230 + i * 166 + rnd(i * 4.7) * 70, hy + 78 + rnd(i * 2) * 12, 0.56, '#3a2060', RIM, i * 3.1 + 11);
  ctx = S(0.4);
  for (let i = 0; i < 7; i++) anchoredHull(ctx, -190 + i * 262 + rnd(i * 6.3) * 90, hy + 152 + rnd(i * 3) * 14, 0.95, '#2a1850', RIM, i * 1.3 + 23);
  for (let i = 0; i < 4; i++) anchoredHull(ctx, -80 + i * 470 + rnd(i * 2.9) * 60, hy + 262, 1.5, '#1e1240', RIM, i * 4.1 + 31);
  // the quay we stand on: casks of stillsalt, a bollard, a mooring line
  const QD = '#170e34';
  rimmed(ctx, rp(X0, 664, XW, 400), QD, UP, 4, RIM);
  for (const [bx, by, s] of [[70, 664, 1], [150, 664, 1], [110, 600, 1], [1130, 664, 1.1], [1218, 664, 1.1], [1174, 594, 1.1], [1306, 664, 1.1]]) {
    const P = (c) => { c.moveTo(bx - 30 * s, by); c.quadraticCurveTo(bx - 40 * s, by - 34 * s, bx - 30 * s, by - 66 * s); c.lineTo(bx + 30 * s, by - 66 * s); c.quadraticCurveTo(bx + 40 * s, by - 34 * s, bx + 30 * s, by); c.closePath(); };
    rimmed(ctx, P, QD, UP, 3, RIM);
    stroke(ctx, bx - 34 * s, by - 20 * s, bx + 34 * s, by - 20 * s, 2.4, RIM); stroke(ctx, bx - 34 * s, by - 46 * s, bx + 34 * s, by - 46 * s, 2.4, RIM);
  }
  rimmed(ctx, (c) => { c.moveTo(600, 664); c.lineTo(606, 630); c.lineTo(592, 622); c.lineTo(592, 612); c.lineTo(660, 612); c.lineTo(660, 622); c.lineTo(646, 630); c.lineTo(652, 664); c.closePath(); }, QD, UP, 3, RIM);
  ink(ctx, 5, QD); ctx.beginPath(); ctx.moveTo(626, 636); ctx.quadraticCurveTo(820, 700, 1000, 560); ctx.stroke();
  ctx = A();
  const o = px * 0.05;
  spark(ctx, sx + o, sy, 72, t, 1);
  shimmer(ctx, 8, sx - 220, sx + 220, hy + 8, hy + 300, 22, '#fff0c0', t);
  gulls(ctx, [[430, 110, 15, 1], [860, 150, 12, 2], [760, 70, 10, 3], [250, 190, 12, 4], [1060, 200, 11, 5]], t, '#2a1850');
});

// ── compact-hall: a ropewalk shed used as a meeting hall, night. Key light: one hurricane lamp over the table ──
const L_ROPEWALK = keyLight('#ffc070', -Math.PI * 0.5, { depth: 0.9 });
def('compact-hall', L_ROPEWALK, (ctx, t, px) => {
  const L = L_ROPEWALK, lx = 640, ly = 132, vx = 640, vy = 236, WOOD = '#4a2838', DARK = '#150c24';
  const P = (x, y, k) => [vx + (x - vx) * k, vy + (y - vy) * k];   // a point of the near frame, carried back along the shed
  ctx = S(0.25);
  fillAll(ctx, DARK);
  // the far gable, lit, and the long walls running back to it
  const k0 = 0.36, a = P(-60, -200, k0), b = P(1340, 720, k0);
  rect(ctx, a[0], -200, b[0] - a[0], b[1] + 200, '#5a3038');
  rings(ctx, lx, ly, 520, ['#3a1e32', '#5a3038', '#8a4a3c'], [1, 0.66, 0.36]);
  rect(ctx, X0, -200, a[0] - X0, 1200, '#22122c'); rect(ctx, b[0], -200, 1600, 1200, '#22122c');
  flat(ctx, pp([[X0, 1000], [a[0], b[1]], [b[0], b[1]], [X0 + XW, 1000]]), '#2c1830');                              // the floor
  flat(ctx, pp([[vx - 150, b[1]], [vx + 150, b[1]], [vx + 560, 1000], [vx - 560, 1000]]), '#5a3038');               // and the lamp's light on it
  ink(ctx, 2, alpha(INK, 0.8)); ctx.beginPath();
  for (let i = -9; i <= 9; i++) { ctx.moveTo(vx + i * 26, b[1]); ctx.lineTo(vx + i * 150, 1000); }
  for (let i = 0; i < 9; i++) { const y = lerp(a[1], b[1], i / 9); ctx.moveTo(a[0], y); ctx.lineTo(X0, vy + (y - vy) / k0 * 1.5); ctx.moveTo(b[0], y); ctx.lineTo(X0 + XW, vy + (y - vy) / k0 * 1.5); }
  ctx.stroke();
  // the tally of hoppers, chalked on the gable
  const bx = 724, by = 150;
  box(ctx, bx - 8, by - 8, 172, 148, WOOD, L, { off: 4, ink: II });
  rect(ctx, bx, by, 156, 132, '#143c3a');
  ctx.fillStyle = '#e8f4e0'; ctx.font = `700 19px ${FONT_SERIF}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('HOPPERS', bx + 10, by + 24);
  ink(ctx, 2, '#e8f4e0'); chalkLine(ctx, bx + 8, by + 32, 138, 3);
  for (let r = 0; r < 5; r++) {
    const y = by + 50 + r * 18; ink(ctx, 2, alpha('#e8f4e0', 0.85)); chalkLine(ctx, bx + 10, y, 50 + rnd(r * 3) * 24, r + 5);
    ink(ctx, 2, r > 2 ? '#ff9a7a' : '#e8f4e0'); ctx.beginPath();
    for (let j = 0; j < (r > 2 ? 2 + (r % 2) : 5 + r); j++) { ctx.moveTo(bx + 96 + j * 6.5, y - 8); ctx.lineTo(bx + 95 + j * 6.5, y + 4); }
    ctx.stroke();
  }
  // the jack at the head of the walk: the great wheel that lays the strands, its hooks idle for the meeting
  const jx = 522, jy = 258;
  box(ctx, jx - 12, jy, 24, b[1] - jy, WOOD, L, { off: 0, shadow: false, ink: II }); box(ctx, jx - 70, b[1] - 16, 140, 16, WOOD, L, { off: 0, shadow: false, ink: II });
  ink(ctx, 14); ctx.beginPath(); ctx.arc(jx, jy, 66, 0, TAU); ctx.stroke(); ink(ctx, 9, '#a8623a'); ctx.beginPath(); ctx.arc(jx, jy, 66, 0, TAU); ctx.stroke();
  ink(ctx, 3, '#e8a868'); ctx.beginPath(); ctx.arc(jx, jy, 69, Math.PI * 1.55, Math.PI * 2.1); ctx.stroke();
  for (let i = 0; i < 8; i++) { const an = i * TAU / 8 + 0.2; stroke(ctx, jx, jy, jx + Math.cos(an) * 62, jy + Math.sin(an) * 62, 7); stroke(ctx, jx, jy, jx + Math.cos(an) * 62, jy + Math.sin(an) * 62, 3.4, '#a8623a'); }
  cel(ctx, cp(jx, jy, 13), C.brass, L, { off: 4, ink: II });
  stroke(ctx, jx, jy, jx - 40, jy + 30, 6); stroke(ctx, jx - 40, jy + 30, jx - 58, jy + 30, 8, '#3a2030');                                  // the crank
  for (const [cx2, r2] of [[430, 30], [476, 22], [852, 26]]) coil(ctx, cx2, b[1] - r2 * 0.6, r2, L, 0.25);                             // finished line, coiled down against the gable
  // roof frames, far to near: a tie-beam, a king post, two rafters
  ctx = S(0.4);
  for (const k of [0.5, 0.72, 1.06]) {
    const l = P(-40, 40, k), r = P(1320, 40, k), top = P(640, -230, k), w = 20 * k;
    const col = k > 1 ? '#1c1028' : k > 0.6 ? '#3a2030' : WOOD;
    for (const [x0, y0, x1, y1] of [[l[0], l[1], top[0], top[1]], [r[0], r[1], top[0], top[1]], [top[0], top[1], top[0], l[1]], [l[0] - 400, l[1], r[0] + 400, r[1]]]) {
      stroke(ctx, x0, y0, x1, y1, w + 4.4); stroke(ctx, x0, y0, x1, y1, w, col);
    }
    stroke(ctx, l[0] - 400, l[1] + w * 0.34, r[0] + 400, r[1] + w * 0.34, w * 0.3, k > 1 ? '#5a3038' : '#c98a5a');   // the underside of each beam takes the lamp
    for (const sd of [-1, 1]) { const px0 = P(640 + sd * 680, 40, k), py1 = P(640 + sd * 680, 720, k); stroke(ctx, px0[0], px0[1], py1[0], py1[1], w + 4.4); stroke(ctx, px0[0], px0[1], py1[0], py1[1], w, col); }
    // hanks of new rope hung over the beam to season
    if (k < 1) for (let i = 0; i < 7; i++) {
      if (i === 3) continue;
      const x = lerp(l[0] + 30 * k, r[0] - 30 * k, i / 6), h = (120 + rnd(i * 3 + k * 9) * 70) * k, hw = 20 * k;
      rope(ctx, (c) => { c.moveTo(x - hw, l[1]); c.bezierCurveTo(x - hw * 1.3, l[1] + h, x + hw * 1.3, l[1] + h, x + hw, l[1]); }, 7 * k, shade(ROPE, 0.12 + (k < 0.6 ? 0.1 : 0)));
      rope(ctx, (c) => { c.moveTo(x - hw * 0.5, l[1]); c.bezierCurveTo(x - hw * 0.8, l[1] + h * 0.8, x + hw * 0.8, l[1] + h * 0.8, x + hw * 0.5, l[1]); }, 6 * k, ROPE);
    }
  }
  // the strands of the walk itself, laid along both walls from the near posts to the far end
  for (const sd of [-1, 1]) for (let j = 0; j < 3; j++) {
    const n0 = P(640 + sd * (660 - j * 36), 470 + j * 26, 1.3), f0 = P(640 + sd * (660 - j * 36), 470 + j * 26, k0);
    rope(ctx, (c) => { c.moveTo(n0[0], n0[1]); c.quadraticCurveTo((n0[0] + f0[0]) / 2, (n0[1] + f0[1]) / 2 + 26, f0[0], f0[1]); }, 5, shade(ROPE, 0.25));
  }
  // the table at the far end, and the Compact round it
  crowd(ctx, 41, 392, 890, b[1] - 92, 14, 15, '#241428', L, { hat: 0.45, rimCol: '#ffc070' });
  box(ctx, 400, b[1] - 40, 480, 14, '#8a4a34', L, { off: 0, shadow: false, ink: II, rim: 3 });
  rect(ctx, 414, b[1] - 26, 12, 60, '#3a2030'); rect(ctx, 854, b[1] - 26, 12, 60, '#3a2030');
  for (const [x, w] of [[470, 46], [600, 60], [742, 40]]) { rect(ctx, x, b[1] - 46, w, 6, C.cream); ink(ctx, 1.4); ctx.strokeRect(x, b[1] - 46, w, 6); }
  // the hurricane lamp, on its hook under the middle beam
  const hk = P(640, 40, 0.72);
  stroke(ctx, lx, hk[1], lx, ly - 46, 2.6);
  bloom(ctx, lx, ly, 200, L.col, 1);
  ink(ctx, 2.6); ctx.beginPath(); ctx.moveTo(lx - 20, ly + 24); ctx.quadraticCurveTo(lx - 34, ly - 20, lx, ly - 46); ctx.quadraticCurveTo(lx + 34, ly - 20, lx + 20, ly + 24); ctx.stroke();   // the bail
  cel(ctx, pp([[lx - 13, ly - 34], [lx + 13, ly - 34], [lx + 9, ly - 22], [lx - 9, ly - 22]]), C.brass, L, { off: 0, shadow: false, ink: 2.4 });
  cel(ctx, (c) => { c.moveTo(lx - 9, ly - 22); c.bezierCurveTo(lx - 24, ly - 10, lx - 24, ly + 12, lx - 12, ly + 24); c.lineTo(lx + 12, ly + 24); c.bezierCurveTo(lx + 24, ly + 12, lx + 24, ly - 10, lx + 9, ly - 22); c.closePath(); }, '#fff0c0', L, { off: 0, shadow: false, ink: 2.4 });
  cel(ctx, pp([[lx - 22, ly + 24], [lx + 22, ly + 24], [lx + 26, ly + 44], [lx - 26, ly + 44]]), C.brass, L, { off: 0, ink: 2.4, shadow: pp([[lx + 4, ly + 24], [lx + 22, ly + 24], [lx + 26, ly + 44], [lx + 8, ly + 44]]) });
  // near: two posts of the walk with coils hung on them, and the back of the meeting
  ctx = S(0.8);
  for (const sd of [-1, 1]) {
    const x = 640 + sd * 610;
    box(ctx, x - 22, -200, 44, 1000, '#1c1028', L, { off: 0, shadow: false, ink: IW });
    rect(ctx, x - sd * 22 - (sd < 0 ? 0 : 6), -200, 6, 1000, '#8a4a3c');
    coil(ctx, x - sd * 8, 300, 62, L, 0.45); coil(ctx, x + sd * 30, 420, 50, L, 0.6);
  }
  crowd(ctx, 43, X0, 1560, 628, 26, 30, '#0e0818', L, { hat: 0.4, rimCol: '#c98a5a' });
  ctx = A();
  const o = px * 0.4;
  fire(ctx, lx + o, ly + 20, 8, t, 3);
  spark(ctx, lx + o, ly + 2, 27, t, 2);
});

// ── counting-room: the Commons' books shelved between coils of real rope, after midnight. Key light: a green-shaded desk lamp ──
const L_COUNTING = keyLight('#f0f2b0', -Math.PI * 0.5, { depth: 0.9, tint: '#0c1c3a' });
const BOOK_COLS = ['#8a3a44', '#3a6a6c', '#c9a868', '#5a4a8a', '#a8623a', '#2f5a7a', '#d9c08a'];
def('counting-room', L_COUNTING, (ctx, t, px) => {
  const L = L_COUNTING, lx = 632, ly = 150, DARK = '#0a0e22', WOOD = '#3a2c44';
  ctx = S(0.2);
  fillAll(ctx, DARK);
  rings(ctx, lx, ly + 60, 640, ['#0e1830', '#16303a', '#2a4c46'], [1, 0.64, 0.36]);
  // shelves, floor to ceiling: a bay of books, a bay of rope, and so on along the wall
  const dimAt = (x, y) => Math.min(0.78, Math.max(0, Math.hypot(x - lx, (y - ly - 60) * 1.2) / 620 - 0.12));
  for (let r = 0; r < 7; r++) {
    const y = 96 + r * 92;   // the shelf board
    for (let c = 0; c < 17; c++) {
      const x = -230 + c * 106, d = dimAt(x + 50, y - 40);
      if ((c + r * 2) % 3 === 0) { coil(ctx, x + 50, y - 40, 36, L, d + 0.08); if (rnd(c * 3 + r) < 0.5) coil(ctx, x + 62, y - 30, 26, L, d); }
      else for (let b = 0, bx = x + 4; bx < x + 96; b++) {
        const w = 9 + rnd(c * 7 + r * 3 + b) * 10, h = 54 + rnd(c + r * 5 + b * 3) * 28, lean = rnd(c * 11 + r + b * 5) < 0.1;
        const col = shade(BOOK_COLS[Math.floor(rnd(c * 5 + r * 7 + b * 2) * BOOK_COLS.length)], d);
        if (lean) { poly(ctx, [[bx, y], [bx + 14, y - h], [bx + 14 + w, y - h + 3], [bx + w, y]], col); ink(ctx, 1.5); ctx.stroke(); bx += w + 16; continue; }
        rect(ctx, bx, y - h, w, h, col); rect(ctx, bx, y - h * 0.78, w, 3, shade(C.brass, d)); ink(ctx, 1.5); ctx.strokeRect(bx, y - h, w, h);
        bx += w + 1;
      }
    }
    box(ctx, X0, y, XW, 10, shade(WOOD, r > 4 ? 0.4 : 0), L, { off: 0, shadow: false, ink: 1.8 });
    rect(ctx, lx - 330 + r * 12, y, 660 - r * 24, 3, '#8a9a70');   // the edge of each board, where the lamp reaches it
  }
  for (let c = 0; c < 18; c++) rect(ctx, -236 + c * 106, -200, 8, 1100, shade(WOOD, 0.3));
  // the window on the quay: night, one crane, the roads
  const wx = 196;
  box(ctx, wx - 14, 40, 168, 250, WOOD, L, { off: 6, ink: IW });
  bands(ctx, wx, 54, 140, 222, ['#080c2c', '#101a4c', '#1c2c6c', '#141a48'], [0.4, 0.62, 0.7, 1]);
  rect(ctx, wx + 60, 80, 5, 130, '#05061c'); ink(ctx, 4, '#05061c'); ctx.beginPath(); ctx.moveTo(wx + 62, 96); ctx.lineTo(wx + 128, 66); ctx.moveTo(wx + 62, 120); ctx.lineTo(wx + 128, 66); ctx.stroke();
  for (const [x, y] of [[20, 76], [96, 100], [40, 130], [118, 150]]) glint(ctx, wx + x, y, 5, C.white, 0.9);
  for (const [x, y] of [[24, 214], [50, 222], [100, 216], [122, 226]]) rect(ctx, wx + x, y, 4, 4, '#ffc65a');
  stroke(ctx, wx + 70, 54, wx + 70, 276, 5); stroke(ctx, wx, 165, wx + 140, 165, 5); outline(ctx, rp(wx, 54, 140, 222), II);
  // the standing desk: a clerk's slope, the rope ledger open on it
  ctx = S(0.35);
  const dx = 640, dy = 300;
  flat(ctx, pp([[dx - 260, dy + 30], [dx + 260, dy + 30], [dx + 300, 1000], [dx - 300, 1000]]), '#1a1430');
  cel(ctx, pp([[dx - 250, dy - 10], [dx + 250, dy - 10], [dx + 290, dy + 96], [dx - 290, dy + 96]]), '#6a4a4c', L, { off: 0, shadow: false, ink: IW, hi: ep(dx, dy + 30, 240, 60), hiCol: '#a8846a' });
  box(ctx, dx - 292, dy + 96, 584, 22, '#4a3040', L, { off: 0, shadow: false, ink: IW });
  box(ctx, dx - 250, dy - 28, 500, 18, '#4a3040', L, { off: 0, shadow: false, ink: II });
  for (const sd of [-1, 1]) box(ctx, dx + sd * 250 - 12, dy + 118, 24, 800, '#2a1c34', L, { off: 0, shadow: false, ink: II });
  // the book: two pages, ruled, a column that will not close
  const bk = (u, v) => [dx + u * (1 + v * 0.14), dy + 4 + v * 78];
  flat(ctx, pp([bk(-196, -0.04), bk(196, -0.04), bk(204, 1.06), bk(-204, 1.06)]), '#5a1e30'); outline(ctx, pp([bk(-196, -0.04), bk(196, -0.04), bk(204, 1.06), bk(-204, 1.06)]), II);
  for (const sd of [-1, 1]) {
    const pg = pp([bk(sd * 4, 0), bk(sd * 188, 0), bk(sd * 188, 1), bk(sd * 4, 1)]);
    flat(ctx, pg, sd < 0 ? '#f6f2cc' : '#e4dcae'); outline(ctx, pg, 1.8);
    ink(ctx, 1.3, alpha(C.seaDeep, 0.5)); ctx.beginPath();
    for (let r = 1; r < 7; r++) { const p0 = bk(sd * 14, r / 7), p1 = bk(sd * 180, r / 7); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); }
    ctx.stroke();
    ink(ctx, 1.4, alpha(C.crimson, 0.7)); ctx.beginPath(); { const p0 = bk(sd * 140, 0), p1 = bk(sd * 140, 1); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); } ctx.stroke();
    ink(ctx, 2, alpha(INK, 0.8));
    for (let r = 1; r < 6; r++) { const p0 = bk(sd < 0 ? -176 : 18, (r + 0.1) / 7 - 0.05); chalkLine(ctx, p0[0], p0[1], 60 + rnd(r * 3 + sd) * 44, r + sd * 3 + 9); }
  }
  // the steward's key, left on the desk and not mentioned
  const kx = dx + 226, ky = dy + 62;
  ink(ctx, 7, INK); ctx.beginPath(); ctx.arc(kx, ky, 9, 0, TAU); ctx.moveTo(kx + 9, ky); ctx.lineTo(kx + 42, ky + 3); ctx.moveTo(kx + 34, ky + 3); ctx.lineTo(kx + 34, ky + 12); ctx.moveTo(kx + 41, ky + 3); ctx.lineTo(kx + 41, ky + 11); ctx.stroke();
  ink(ctx, 3.4, C.brass); ctx.beginPath(); ctx.arc(kx, ky, 9, 0, TAU); ctx.moveTo(kx + 9, ky); ctx.lineTo(kx + 42, ky + 3); ctx.moveTo(kx + 34, ky + 3); ctx.lineTo(kx + 34, ky + 12); ctx.moveTo(kx + 41, ky + 3); ctx.lineTo(kx + 41, ky + 11); ctx.stroke();
  // the lamp: a brass arm off the back of the desk, a green glass shade, the light thrown straight down
  shaft(ctx, lx, ly + 6, Math.PI / 2, 138, 1.5, L.col, 0.16);
  bloom(ctx, lx, ly + 12, 170, L.col, 0.9);
  ink(ctx, 9, INK); ctx.beginPath(); ctx.moveTo(dx + 200, dy - 28); ctx.lineTo(dx + 200, 96); ctx.quadraticCurveTo(dx + 200, 60, dx + 160, 60); ctx.lineTo(lx, 60); ctx.lineTo(lx, ly - 40); ctx.stroke();
  ink(ctx, 4.6, C.brass); ctx.beginPath(); ctx.moveTo(dx + 200, dy - 28); ctx.lineTo(dx + 200, 96); ctx.quadraticCurveTo(dx + 200, 60, dx + 160, 60); ctx.lineTo(lx, 60); ctx.lineTo(lx, ly - 40); ctx.stroke();
  const shadeP = (c) => { c.moveTo(lx - 16, ly - 44); c.lineTo(lx + 16, ly - 44); c.bezierCurveTo(lx + 50, ly - 36, lx + 70, ly - 16, lx + 74, ly + 6); c.lineTo(lx - 74, ly + 6); c.bezierCurveTo(lx - 70, ly - 16, lx - 50, ly - 36, lx - 16, ly - 44); c.closePath(); };
  cel(ctx, shadeP, '#1f8a5c', L, { off: 0, ink: IW, shadow: pp([[lx + 20, ly - 50], [lx + 90, ly - 50], [lx + 90, ly + 10], [lx + 44, ly + 10]]), hi: pp([[lx - 30, ly - 36], [lx - 14, ly - 40], [lx - 34, ly - 2], [lx - 60, ly - 2]]), hiCol: '#7fe0a8' });
  cel(ctx, ep(lx, ly + 6, 72, 9), C.white, L, { off: 0, shadow: false, ink: 2.4 });
  // close to the lens, in the wide film: the end of a shelf, and rope hung from it
  ctx = S(0.9);
  box(ctx, 1190, -200, 400, 1100, '#070916', L, { off: 0, shadow: false, ink: IW });
  rect(ctx, 1190, -200, 5, 1100, '#3a5a4c');
  coil(ctx, 1210, 250, 84, L, 0.62); coil(ctx, 1250, 430, 64, L, 0.7);
  ctx = A();
  const o = px * 0.35;
  spark(ctx, lx + o, ly + 9, 25, t, 4);
  glint(ctx, kx + o, ky - 2, 13 + 4 * Math.sin(t * 3.3), C.white, 0.95, 0);
  { const a = t * 2.3, mx = lx + o + Math.cos(a) * 60 + Math.cos(a * 2.7) * 14, my = ly + 40 + Math.sin(a * 1.3) * 22; rect(ctx, mx - 3, my - 2, 6, 4, '#f6f2cc'); rect(ctx, mx - 1, my - 1, 2, 2, INK); }   // a moth
});

// ── cutter-deck: the Audit cutter lying in the roads, dusk. Key light: its single search lamp ──
const L_CUTTER = keyLight('#dff2ff', -Math.PI * 0.42, { depth: 0.9, tint: '#1a1040' });
def('cutter-deck', L_CUTTER, (ctx, t, px) => {
  const L = L_CUTTER, hy = 318, lx = 706, ly = 118, STEEL = '#3a4a78', DK = '#0c0e2c';
  ctx = S(0.05);
  sky(ctx, hy, ['#141440', '#2a2060', '#5a2c6c', '#9c3e62', '#d86a4c', '#f09a5a'], [0.36, 0.58, 0.76, 0.88, 0.96, 1]);
  starsFlat(ctx, 7, 26, 110);
  for (const [cx, cy, w, h, sd] of [[200, 196, 320, 34, 2], [1040, 150, 280, 30, 4], [560, 250, 220, 22, 6]]) cloud(ctx, cx, cy, w, h, '#3a2466', L, sd, 0);
  // Kedge on the horizon: the mole, the cranes, a town putting its lamps on
  town(ctx, 13, X0, 1560, hy + 2, 12, 46, 20, 50, '#1c1444', L, { win: '#ffc65a', winP: 0.3 });
  for (const [x, s, dir] of [[150, 0.3, 1], [300, 0.26, -1], [430, 0.3, 1], [930, 0.28, -1], [1060, 0.3, 1], [1200, 0.26, 1]]) quayCrane(ctx, x, hy - 6, s, dir, '#1c1444', '#1c1444', L);
  bloom(ctx, 452, hy - 60, 60, '#bfe8ff', 0.8); rect(ctx, 446, hy - 66, 12, 60, '#1c1444'); glint(ctx, 452, hy - 66, 12, C.white, 1);   // Kedge's own lamp, still whole
  bands(ctx, X0, hy, XW, 700, ['#a8525c', '#4a2c66', '#231c50', '#141238'], [0.03, 0.1, 0.3, 1]);
  lozenges(ctx, 21, X0, X0 + XW, hy + 4, hy + 36, 44, '#f09a5a');
  for (let i = 0; i < 9; i++) { const x = -160 + i * 190 + rnd(i * 3) * 80; anchoredHull(ctx, x, hy + 30 + rnd(i * 7) * 30, 0.4, '#141238', '#9c3e62', i * 2.7 + 5); }
  waves(ctx, X0, hy + 90, XW, 80, { len: 84, amp: 6, col: '#1a1644', foam: false });
  waves(ctx, X0, hy + 150, XW, 500, { len: 130, amp: 9, col: '#100e30', foam: '#6a7ab8', every: 3, phase: 0.4, L });
  // where the lamp is looking: a hard road of light out across the water
  ctx = S(0.3);
  shaft(ctx, lx - 16, ly + 6, Math.PI * 0.83, 1300, 0.2, L.col, 0.34);
  flat(ctx, ep(150, hy + 96, 190, 22), alpha(L.col, 0.4)); flat(ctx, ep(150, hy + 96, 110, 11), alpha(C.white, 0.6));
  // the deck: mast, boom and furled sail, shrouds, the rail
  ctx = S(0.5);
  const mx = 640;
  flat(ctx, pp([[X0, 1000], [X0, 548], [X0 + XW, 548], [X0 + XW, 1000]]), '#1c1c48');
  flat(ctx, pp([[mx - 60, 548], [mx + 330, 548], [mx + 700, 1000], [mx - 260, 1000]]), '#3a4274');                 // what spills down from the lamp
  ink(ctx, 2, alpha(INK, 0.85)); ctx.beginPath(); for (let i = -12; i <= 12; i++) { ctx.moveTo(mx + i * 66, 548); ctx.lineTo(mx + i * 180, 1000); } ctx.stroke();
  // rail and stanchions
  for (let i = 0; i < 20; i++) { const x = -240 + i * 92; box(ctx, x, 470, 10, 80, DK, L, { off: 0, shadow: false, ink: 0 }); rect(ctx, x, 470, 3, 80, '#5a6aa8'); }
  rimmed(ctx, rp(X0, 458, XW, 14), DK, UP, 3, '#8a9ad8'); rect(ctx, X0, 506, XW, 6, DK); rect(ctx, X0, 544, XW, 10, DK);
  // shrouds and ratlines, both sides
  for (const sd of [-1, 1]) {
    ink(ctx, 3.4, DK); ctx.beginPath();
    for (let j = 0; j < 4; j++) { ctx.moveTo(mx + sd * 14, -200); ctx.lineTo(mx + sd * (250 + j * 62), 462); }
    ctx.stroke();
    ink(ctx, 2, DK); ctx.beginPath();
    for (let r = 0; r < 9; r++) { const y = 60 + r * 46, u = (y + 200) / 662; ctx.moveTo(mx + sd * (14 + 236 * u), y); ctx.lineTo(mx + sd * (14 + 422 * u), y); }
    ctx.stroke();
  }
  // the mast: lit down the side that faces the lamp's own back-spill
  box(ctx, mx - 22, -200, 44, 760, '#5a3a4a', L, { off: 0, ink: IW, shadow: rp(mx - 22, -200, 22, 760), rim: 0 });
  rect(ctx, mx + 15, -200, 5, 760, '#c9d8f4');
  for (const y of [40, 260, 430]) { box(ctx, mx - 26, y, 52, 14, STEEL, L, { off: 0, shadow: false, ink: II }); }
  // boom, with the mainsail furled along it
  box(ctx, mx + 10, 396, 720, 16, '#5a3a4a', L, { off: 0, shadow: false, ink: II });
  cel(ctx, (c) => { c.moveTo(mx + 26, 398); c.quadraticCurveTo(mx + 22, 366, mx + 60, 364); for (let i = 0; i < 8; i++) c.quadraticCurveTo(mx + 102 + i * 84, 352 + (i % 2) * 5, mx + 144 + i * 84, 364); c.lineTo(mx + 740, 398); c.closePath(); }, '#b8b4d0', L, { off: 0, ink: IW, shadow: rp(mx, 382, 800, 30) });
  for (let i = 0; i < 9; i++) stroke(ctx, mx + 60 + i * 84, 362, mx + 60 + i * 84, 412, 4, DK);
  // the search lamp, on its bracket at the hounds
  stroke(ctx, mx + 22, ly + 30, lx + 10, ly + 30, 12); stroke(ctx, mx + 22, ly + 30, lx + 10, ly + 30, 6, STEEL);
  stroke(ctx, lx + 10, ly + 34, lx + 10, ly + 10, 10); stroke(ctx, lx + 10, ly + 34, lx + 10, ly + 10, 5, STEEL);
  bloom(ctx, lx - 14, ly + 4, 190, L.col, 0.9);
  ctx.save(); ctx.translate(lx, ly); ctx.rotate(-0.52);
  cel(ctx, (c) => { c.moveTo(-34, -24); c.lineTo(26, -20); c.quadraticCurveTo(40, 0, 26, 20); c.lineTo(-34, 24); c.closePath(); }, STEEL, L_CUTTER_BODY, { off: 9, ink: IW });
  rect(ctx, 6, -22, 6, 44, INK); rect(ctx, 30, -6, 12, 12, DK);
  cel(ctx, ep(-34, 0, 9, 25), C.white, L, { off: 0, shadow: false, ink: 2.6 });
  ctx.restore();
  ctx = A();
  const o = px * 0.5;
  spark(ctx, lx - 30 + o, ly + 16, 44, t, 5);
  shimmer(ctx, 23, 20, 300, hy + 84, hy + 112, 8, C.white, t);
  glint(ctx, 452 + px * 0.05, hy - 66, 12 + 3 * Math.sin(t * 2.1), C.white, 1, 0);
  // the Audit's pennant at the yard-arm: black, one white bar
  { const fx = 884 + o, fy = 112; ctx.beginPath(); ctx.moveTo(fx, fy);
    for (let i = 1; i <= 8; i++) ctx.lineTo(fx + i * 15, fy + Math.sin(i * 0.9 - t * 4) * 5 * (i / 8) + i * 2);
    for (let i = 8; i >= 0; i--) ctx.lineTo(fx + i * 15, fy + 26 - i * 1.6 + Math.sin(i * 0.9 - t * 4 + 0.4) * 5 * (i / 8) + i * 2);
    ctx.closePath(); ink(ctx, 4.4, '#5a6aa8'); ctx.stroke(); ctx.fillStyle = '#080818'; ctx.fill();
    stroke(ctx, fx + 26, fy + 4, fx + 26, fy + 24, 6, '#e6f0ff'); stroke(ctx, fx, -200, fx, fy + 30, 2.4, DK); }
});
const L_CUTTER_BODY = keyLight('#dff2ff', Math.PI * 0.75, { depth: 0.9, tint: '#1a1040' });   // the lamp's casing is lit by its own beam, from the mouth

// ── lantern-line: the quay at night, two files of dockers, a paper lantern each. Key light: the lanterns, warm, from below ──
const L_FILES = keyLight('#ffb04a', Math.PI * 0.5, { depth: 0.9, tint: '#12103c' });
/** one docker of the file, lantern held at the chest on the side toward the lane: lit from underneath */
function lanternBearer(ctx, x, y, s, sd, col, seed) {
  const lx = x + sd * s * 1.25, lyy = y + s * 2.2, lc = LCOLS[Math.floor(rnd(seed) * 4)], hat = rnd(seed * 3) < 0.5;
  if (s > 7) bloom(ctx, lx, lyy, s * 4.6, lc, 0.85);
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(x, y, s * 0.5, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - s * 0.98, y + s * 6.4); ctx.lineTo(x - s * 0.98, y + s * 1.44); ctx.arc(x, y + s * 1.44, s * 0.98, Math.PI, 0); ctx.lineTo(x + s * 0.98, y + s * 6.4); ctx.fill();
  if (hat) { ctx.fillRect(x - s * 0.7, y - s * 0.44, s * 1.4, s * 0.2); ctx.fillRect(x - s * 0.42, y - s * 0.76, s * 0.84, s * 0.36); }
  // what the lantern finds: the underside of the jaw, the arm that holds it, the front of the coat
  ctx.fillStyle = '#c9603a';
  ctx.beginPath(); ctx.arc(x, y, s * 0.5, 0.15 * Math.PI, 0.85 * Math.PI); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x + sd * s * 0.2, y + s * 1.2); ctx.lineTo(x + sd * s * 0.98, y + s * 1.5); ctx.lineTo(x + sd * s * 0.98, y + s * 4.6); ctx.lineTo(x + sd * s * 0.5, y + s * 3.2); ctx.closePath(); ctx.fill();
  if (s < 7) { rect(ctx, lx - s * 0.5, lyy - s * 0.6, s, s * 1.2, lc); return; }
  stroke(ctx, x + sd * s * 0.7, y + s * 1.6, lx, lyy - s * 0.7, Math.max(2, s * 0.34), col);
  flat(ctx, ep(lx, lyy, s * 0.6, s * 0.76), INK); flat(ctx, ep(lx, lyy, s * 0.6 - 1.8, s * 0.76 - 1.8), lc); flat(ctx, ep(lx, lyy + s * 0.06, s * 0.26, s * 0.42), tint(lc, 0.85));
  rect(ctx, lx - s * 0.28, lyy - s * 0.86, s * 0.56, s * 0.18, INK);
}
def('lantern-line', L_FILES, (ctx, t, px) => {
  const L = L_FILES, vx = 640, vy = 170, WALL = '#100c30';
  ctx = S(0.08);
  sky(ctx, 330, ['#06081e', '#0c1034', '#141a4c', '#1c2664'], [0.4, 0.66, 0.86, 1]);
  starsFlat(ctx, 19, 40, 200);
  // the lamp-house at the end of the quay, its great lamp still whole: where the walk is going
  bloom(ctx, vx, 84, 170, '#9fd8ff', 0.8);
  flat(ctx, pp([[vx - 34, vy + 6], [vx - 22, 104], [vx + 22, 104], [vx + 34, vy + 6]]), '#0a0c2c'); rect(ctx, vx - 30, 98, 60, 8, '#0a0c2c');
  rect(ctx, vx - 16, 68, 32, 30, '#e6f6ff'); flat(ctx, pp([[vx - 25, 68], [vx, 44], [vx + 25, 68]]), '#0a0c2c');
  for (const sd of [-1, 1]) town(ctx, 77 + sd, vx + (sd < 0 ? -420 : 60), vx + (sd < 0 ? -60 : 420), vy + 10, 14, 40, 18, 40, '#0a0c2c', L, { win: '#ffc65a', winP: 0.2 });
  // warehouses down both sides, their faces lit from the lane
  ctx = S(0.2);
  for (const sd of [-1, 1]) {
    const X = (u) => vx + sd * u;
    flat(ctx, pp([[X(96), vy - 24], [X(96), vy + 30], [X(1000), 620], [X(1000), -260], [X(520), -260]]), WALL);
    flat(ctx, pp([[X(96), vy + 8], [X(96), vy + 30], [X(1000), 620], [X(1000), 380]]), '#3a1c3c');     // the foot of each wall takes the lantern light
    flat(ctx, pp([[X(96), vy + 18], [X(96), vy + 30], [X(1000), 620], [X(1000), 520]]), '#6a2c3a');
    ink(ctx, II, alpha(INK, 0.9)); ctx.beginPath();
    for (const u of [150, 230, 340, 500, 740]) { ctx.moveTo(X(u), vy - 24 - (u - 96) * 0.31); ctx.lineTo(X(u), vy + 30 + (u - 96) * 0.652); }
    ctx.stroke();
    for (const [u, w] of [[180, 26], [270, 40], [400, 62], [590, 96]]) { const k = (u - 96) / 904; flat(ctx, pp([[X(u), vy + 30 + k * 590 - 12 - k * 330], [X(u + w), vy + 30 + (u + w - 96) / 904 * 590 - 12 - k * 340], [X(u + w), vy + 30 + (u + w - 96) / 904 * 590], [X(u), vy + 30 + k * 590]]), '#070620'); }
  }
  // the quay itself: a pool of warm stone down the lane, joints running to the lamp-house
  flat(ctx, pp([[vx - 96, vy + 30], [vx + 96, vy + 30], [vx + 1000, 620], [vx + 1000, 1000], [vx - 1000, 1000], [vx - 1000, 620]]), '#2a1638');
  flat(ctx, pp([[vx - 60, vy + 30], [vx + 60, vy + 30], [vx + 560, 1000], [vx - 560, 1000]]), '#4a2238');
  flat(ctx, pp([[vx - 24, vy + 30], [vx + 24, vy + 30], [vx + 250, 1000], [vx - 250, 1000]]), '#6a2e3a');
  ink(ctx, 2, alpha(INK, 0.8)); ctx.beginPath();
  for (let i = -7; i <= 7; i++) { ctx.moveTo(vx + i * 13, vy + 30); ctx.lineTo(vx + i * 150, 1000); }
  for (let j = 1; j < 9; j++) { const y = vy + 30 + j * j * 9; ctx.moveTo(vx - 96 - (y - vy - 30) * 1.54, y); ctx.lineTo(vx + 96 + (y - vy - 30) * 1.54, y); }
  ctx.stroke();
  // the two files, far to near
  ctx = S(0.3);
  for (let i = 15; i >= 0; i--) {
    const d = 1 / (0.74 + i * 0.36), s = 30 * d;
    for (const sd of [-1, 1]) lanternBearer(ctx, vx + sd * (30 + 400 * d), vy + 16 + 196 * d - s * 1.2, s, -sd, i > 9 ? '#141034' : '#0c0a26', i * 2.3 + (sd > 0 ? 50 : 0));
  }
  ctx = A();
  const o = px * 0.3;
  for (const [i, sd] of [[0, -1], [0, 1], [1, -1], [1, 1], [2, -1], [2, 1], [3, 1], [4, -1]]) {
    const d = 1 / (0.74 + i * 0.36), s = 30 * d, x = vx + sd * (30 + 400 * d) - sd * s * 1.25 + o, y = vy + 16 + 196 * d - s * 1.2 + s * 2.2;
    glint(ctx, x, y, s * (0.52 + 0.16 * Math.sin(t * (3 + i * 0.7) + i * 5 + sd)), C.white, 0.95, 0);
  }
  spark(ctx, vx + px * 0.08, 83, 30, t, 6);
});

// ── quarter-flame: Kedge's lamp-house, the great lamp cut with ash to a quarter, night. Key light: the grey-violet flame itself ──
const L_QUARTER = keyLight('#bfa8f0', -Math.PI * 0.5, { depth: 0.9, tint: '#140c30' });
const DIM_FIRE = ['#5a489c', '#bfa8f0', '#f6f0ff'];
def('quarter-flame', L_QUARTER, (ctx, t, px) => {
  const L = L_QUARTER, fx = 640, fy = 186, DARK = '#0c0a20', BR = '#8a6a5c';   // brass, in this light, is the colour of pewter
  ctx = S(0.15);
  fillAll(ctx, DARK);
  rings(ctx, fx, fy - 20, 600, ['#141030', '#1e1840', '#2e2658'], [1, 0.6, 0.3]);
  // the wall of the lamp-house: stone courses, and three tall lights looking over the roads
  ink(ctx, 2, alpha(INK, 0.8)); ctx.beginPath();
  for (let r = 0; r < 12; r++) { const y = -160 + r * 66; ctx.moveTo(X0, y); ctx.lineTo(X0 + XW, y); for (let c = 0; c < 15; c++) { const x = X0 + c * 128 + (r % 2) * 64; ctx.moveTo(x, y); ctx.lineTo(x, y + 66); } }
  ctx.stroke();
  for (const wx of [80, 1040, -360, 1480]) {
    cel(ctx, archP(wx - 16, 560, 192, 590), '#2a2248', L, { off: 0, shadow: false, ink: IW });
    ctx.save(); ctx.beginPath(); archP(wx, 548, 160, 560)(ctx); ctx.clip();
    bands(ctx, wx, -40, 160, 600, ['#06081e', '#0c1238', '#16205a', '#0e1440', '#080c2c'], [0.4, 0.62, 0.68, 0.84, 1]);
    for (let i = 0; i < 8; i++) glint(ctx, wx + 14 + rnd(i * 3 + wx) * 130, 20 + rnd(i * 7 + wx) * 280, 4 + rnd(i) * 4, C.white, 0.9);
    // the ships, warped in close under the dim light: a riding lamp each
    for (let i = 0; i < 7; i++) { const x = wx + 8 + rnd(i * 5 + wx * 3) * 140, y = 372 + rnd(i * 9 + wx) * 150, s = 0.5 + (y - 372) / 200; rect(ctx, x - 14 * s, y, 28 * s, 5 * s, '#05061c'); rect(ctx, x - 1, y - 20 * s, 2.4, 20 * s, '#05061c'); rect(ctx, x - 2, y - 22 * s, 4.4, 4.4, '#ffc65a'); }
    ctx.restore();
    stroke(ctx, wx + 80, -12, wx + 80, 548, 6); for (const y of [160, 310, 440]) stroke(ctx, wx, y, wx + 160, y, 5);
    outline(ctx, archP(wx, 548, 160, 560), II);
  }
  // the hood over the lamp, sooted by the flame it was built for
  ctx = S(0.3);
  cel(ctx, pp([[fx - 70, -200], [fx + 70, -200], [fx + 250, 40], [fx - 250, 40]]), BR, L, { off: 0, ink: IW, shadow: pp([[fx - 70, -200], [fx + 70, -200], [fx + 180, -50], [fx - 180, -50]]) });
  flat(ctx, pp([[fx - 236, 26], [fx + 236, 26], [fx + 250, 40], [fx - 250, 40]]), '#d8c8f4');
  flat(ctx, (c) => { c.moveTo(fx - 150, 26); c.quadraticCurveTo(fx, -110, fx + 150, 26); c.closePath(); }, '#1a1228');
  box(ctx, fx - 256, 40, 512, 14, '#5a4660', L, { off: 0, shadow: false, ink: II });
  // the rings of the engine, stopped: they have nothing to do at a quarter
  for (const [rx, ry, rot, w] of [[330, 96, -0.16, 13], [286, 60, 0.2, 9]]) {
    ink(ctx, w + 4.4); ctx.beginPath(); ctx.ellipse(fx, fy + 20, rx, ry, rot, 0, TAU); ctx.stroke();
    ink(ctx, w, BR); ctx.beginPath(); ctx.ellipse(fx, fy + 20, rx, ry, rot, 0, TAU); ctx.stroke();
    ink(ctx, w * 0.36, '#e0d0f8'); ctx.beginPath(); ctx.ellipse(fx, fy + 20 + w * 0.2, rx - w * 0.3, ry - w * 0.3, rot, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
  }
  // the bowl: wide enough for a fire the height of a man, and a heap of ash in it with one small flame
  const bowl = (c) => { c.moveTo(fx - 214, fy + 14); c.bezierCurveTo(fx - 200, fy + 150, fx - 90, fy + 190, fx, fy + 190); c.bezierCurveTo(fx + 90, fy + 190, fx + 200, fy + 150, fx + 214, fy + 14); c.closePath(); };
  cel(ctx, bowl, BR, L, { off: 0, ink: IW, shadow: (c) => { c.moveTo(fx - 230, fy + 86); c.quadraticCurveTo(fx, fy + 150, fx + 230, fy + 86); c.lineTo(fx + 230, fy + 220); c.lineTo(fx - 230, fy + 220); c.closePath(); } });
  cel(ctx, ep(fx, fy + 14, 214, 34), '#241a36', L, { off: 0, shadow: false, ink: IW });
  flat(ctx, ep(fx, fy + 12, 204, 27), '#e0d0f8'); flat(ctx, ep(fx, fy + 16, 196, 26), '#2e2444');   // the lip, lit from inside
  flat(ctx, (c) => { c.moveTo(fx - 150, fy + 26); c.quadraticCurveTo(fx - 60, fy - 26, fx, fy - 2); c.quadraticCurveTo(fx + 70, fy - 24, fx + 150, fy + 26); c.quadraticCurveTo(fx, fy + 52, fx - 150, fy + 26); c.closePath(); }, '#8a82a0');
  flat(ctx, (c) => { c.moveTo(fx - 90, fy + 16); c.quadraticCurveTo(fx - 30, fy - 14, fx, fy - 2); c.quadraticCurveTo(fx + 40, fy - 12, fx + 90, fy + 16); c.quadraticCurveTo(fx, fy + 34, fx - 90, fy + 16); c.closePath(); }, '#d4ccea');
  bloom(ctx, fx, fy - 26, 150, L.col, 0.9);
  // pedestal, floor, and what the cutting was done with: sacks of kelp-ash, a shovel stood in the heap
  box(ctx, fx - 60, fy + 186, 120, 260, '#5a4660', L, { off: 0, ink: IW, shadow: rp(fx + 10, fy + 186, 60, 260) });
  box(ctx, fx - 96, fy + 430, 192, 30, '#5a4660', L, { off: 0, shadow: false, ink: IW });
  rect(ctx, X0, 640, XW, 400, '#141030'); flat(ctx, ep(fx, 652, 520, 40), '#2e2658'); stroke(ctx, X0, 640, X0 + XW, 640, II);
  for (const [x, y, s] of [[320, 640, 1], [400, 640, 0.9], [356, 590, 0.9]]) {
    cel(ctx, (c) => { c.moveTo(x - 46 * s, y); c.quadraticCurveTo(x - 56 * s, y - 40 * s, x - 34 * s, y - 60 * s); c.lineTo(x + 30 * s, y - 62 * s); c.quadraticCurveTo(x + 56 * s, y - 40 * s, x + 46 * s, y); c.closePath(); }, '#6a6480', L, { off: 8, ink: IW });
    stroke(ctx, x - 20 * s, y - 60 * s, x + 16 * s, y - 62 * s, 5, '#c9a868');
  }
  flat(ctx, (c) => { c.moveTo(430, 640); c.quadraticCurveTo(500, 596, 560, 640); c.closePath(); }, '#8a82a0'); outline(ctx, (c) => { c.moveTo(430, 640); c.quadraticCurveTo(500, 596, 560, 640); c.closePath(); }, II);
  stroke(ctx, 500, 620, 548, 440, 9); stroke(ctx, 500, 620, 548, 440, 4.4, '#8a5a44'); cel(ctx, pp([[484, 606], [520, 598], [526, 640], [476, 644]]), '#9a94b4', L, { off: 4, ink: II });
  // the hopper's chute, at the right of the wide film, its hatch open to be counted
  cel(ctx, pp([[900, 300], [1010, 300], [990, 420], [920, 420]]), BR, L, { off: 10, ink: IW });
  box(ctx, 934, 420, 42, 220, BR, L, { off: 8, ink: IW });
  cel(ctx, pp([[1010, 300], [1070, 250], [1076, 262], [1016, 312]]), '#5a4660', L, { off: 0, shadow: false, ink: II });
  ctx = A();
  const o = px * 0.3;
  fire(ctx, fx + o, fy + 4, 25, t * 0.55, 7, DIM_FIRE);
  spark(ctx, fx + o, fy - 14, 17, t * 0.6, 8);
  for (let i = 0; i < 3; i++) { const ph = mod(t * 0.07 + i / 3, 1); curl(ctx, fx + o + Math.sin(ph * 5 + i * 2) * 26, fy - 50 - ph * 150, 9 + ph * 13, 1.4, i % 2 ? 1 : -1, 6, blend('#b8b0cc', '#1a1228', ph * 0.85), II); }   // it smokes, and it stinks
}, (ctx, t, px) => {
  // close to the lens: a rail of the gallery, at the edges of the wide film
  const o = px * 1.4;
  for (const x of [-40, 1250]) { ink(ctx, 26, '#060512'); ctx.beginPath(); ctx.moveTo(x + o, -100); ctx.lineTo(x + 40 + o, 900); ctx.stroke(); ink(ctx, 4, '#4a4070'); ctx.beginPath(); ctx.moveTo(x + (x < 0 ? 12 : -12) + o, -100); ctx.lineTo(x + 40 + (x < 0 ? 12 : -12) + o, 900); ctx.stroke(); }
});
