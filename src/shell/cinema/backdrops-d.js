// Backdrop painters, fourth part (chapter 8, Cresset, and the two endings). Part of the cinematic renderer: see ../cinema.js.
// Exports BACKDROPS_D: key -> { light, back(ctx, t, px, info), front?(ctx, t, px, info) }.
// Still and moving sections are marked with ctx = S(depth) and ctx = A(): the contract is written out in kit.js.
//
// Keys: cresset-harbour, full-bench, assembly, founders-lamp, mole-dark, lane-by-hand, quay-break, carrow-morning,
// carrow-dusk. Same look as backdrops-a and -b: flat colour, indigo ink, ONE key light per place, declared as a
// style.js Light and passed to def() so the cast is lit from the same side.
//
// Where things sit. All nine use the default portrait pan (640). On a phone the cast covers everything below
// about y = 220, and the window is x 367..913: the lamp and the subject of each painting are inside that strip.
// The rest is for the wide film and for lines with nobody on stage.
//
// Two paintings read the current line's id (as shore-dusk does), in their moving sections only, so the still
// layers are the same either way: cresset-harbour is day, and night on lines of ch8.s3 (the bible uses the key
// for both); see NIGHT_HARBOUR.
import { TAU, lerp, mod, rnd, fillAll, rect, poly, S, A, X0, XW } from './kit.js';
import {
  INK, PALETTE as C, light as keyLight, shade, tint, blend, alpha, ink, outline, taperPath, cel, bloom, shaft, glint, bands, rings, curl,
  cloud, waves,
} from '../style.js';

export const BACKDROPS_D = Object.create(null);
function def(key, light, back, front) { BACKDROPS_D[key] = { light, back, front: front || null }; }

// ───────────────────────── local kit ─────────────────────────
const IW = 4, II = 2.2;   // ink weights in stage units: about 3 and 1.5 px on a phone
const WHITE = C.white;
const COLD = ['#3f86e8', '#bfe6ff', '#ffffff'];      // stillsalt burning bright
const DIM = ['#5a4a9a', '#a894e0', '#e6dcff'];       // three of ash to one of salt: grey-violet
const VIOLET = '#b4a0ea';

const pp = (pts) => (c) => { c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); };
const rp = (x, y, w, h) => (c) => { c.rect(x, y, w, h); };
const cp = (x, y, r) => (c) => { c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); c.closePath(); };
const ep = (x, y, rx, ry) => (c) => { c.moveTo(x + rx, y); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.closePath(); };
/** an arch standing on (x, y)..(x + w, y), h tall, round-headed */
const archP = (x, y, w, h) => (c) => { const r = w / 2; c.moveTo(x, y); c.lineTo(x, y - h + r); c.arc(x + r, y - h + r, r, Math.PI, 0); c.lineTo(x + w, y); c.closePath(); };

function flat(ctx, pathFn, col) { ctx.beginPath(); pathFn(ctx); ctx.fillStyle = col; ctx.fill(); }
function stroke(ctx, x0, y0, x1, y1, w = II, col = INK) { ink(ctx, w, col); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
function box(ctx, x, y, w, h, col, L, o) { cel(ctx, rp(x, y, w, h), col, L, o); }
/** a silhouette in one tone, inked, with a hard rim on the side of the lamp. No clip: cheap enough for crowds. */
function sil(ctx, pathFn, col, L, d = 3, w = IW, rimCol) {
  if (w > 0) { ink(ctx, w * 2); ctx.beginPath(); pathFn(ctx); ctx.stroke(); }
  if (d > 0) { ctx.translate(L.dx * d, L.dy * d); flat(ctx, pathFn, rimCol || L.rim); ctx.translate(-L.dx * d, -L.dy * d); }
  flat(ctx, pathFn, col);
}
/** head and shoulders, cut off flat at y + 3.2 s */
function bustPath(c, x, y, s) {
  c.moveTo(x + s * 0.46, y); c.arc(x, y, s * 0.46, 0, TAU); c.closePath();
  c.moveTo(x - s * 0.95, y + s * 3.2); c.lineTo(x - s * 0.95, y + s * 1.25); c.quadraticCurveTo(x - s * 0.9, y + s * 0.55, x, y + s * 0.52);
  c.quadraticCurveTo(x + s * 0.9, y + s * 0.55, x + s * 0.95, y + s * 1.25); c.lineTo(x + s * 0.95, y + s * 3.2); c.closePath();
}
/** a row of people, [[x, y, s], ...], as one rim-lit shape */
function busts(ctx, list, col, L, d = 2.4, w = 0, rimCol) { sil(ctx, (c) => { for (const p of list) bustPath(c, p[0], p[1], p[2]); }, col, L, d, w, rimCol); }
/** a stepped sky from the top of the stage down to y1 */
function sky(ctx, y1, cols, stops) { bands(ctx, X0, -180, XW, y1 + 180, cols, stops); }
function starsFlat(ctx, seed, n, yMax, col = WHITE) {
  for (let i = 0; i < n; i++) {
    const x = X0 + rnd(seed + i * 1.37) * XW, y = -160 + rnd(seed * 2 + i * 2.11) * (yMax + 160);
    if (rnd(seed * 5 + i * 3) < 0.16) glint(ctx, x, y, 6 + rnd(seed + i) * 6, col, 0.95);
    else rect(ctx, x, y, 2.6, 2.6, alpha(col, 0.45 + 0.45 * rnd(seed * 3 + i)));
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
/** a cel flame standing on (x, y), s its half-width: three flat tongues, the outer one inked. slow < 1 for stillsalt */
function fire(ctx, x, y, s, t, seed, cols, inkW) {
  const w = Math.sin(t * 7 + seed * 5) * 0.14 + Math.sin(t * 3.3 + seed) * 0.1, h = 1 + 0.14 * Math.sin(t * 11 + seed * 3);
  for (let i = 0; i < 3; i++) {
    const m = i === 0 ? 1 : i === 1 ? 0.66 : 0.34;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.55 * m, y);
    ctx.bezierCurveTo(x - s * 1.05 * m, y - s * 0.7 * m * h, x - s * 0.25 * m + s * w * m, y - s * 1.3 * m * h, x + s * w * m * 2.2, y - s * 2.2 * m * h);
    ctx.bezierCurveTo(x + s * 0.5 * m + s * w * m, y - s * 1.2 * m * h, x + s * 0.98 * m, y - s * 0.6 * m * h, x + s * 0.55 * m, y);
    ctx.closePath();
    if (i === 0 && inkW !== 0) { ink(ctx, inkW || Math.max(2, s * 0.2)); ctx.stroke(); }
    ctx.fillStyle = cols[i]; ctx.fill();
  }
}
/** the moving part of a lamp: a four-point glint that breathes */
function spark(ctx, x, y, r, t, seed = 0, col = WHITE) {
  const k = 1 + 0.14 * Math.sin(t * 2.7 + seed * 5) + 0.06 * Math.sin(t * 7.1 + seed * 3);
  glint(ctx, x, y, r * k, col, 1, 0);
  glint(ctx, x, y, r * 0.5 * (2 - k), col, 0.7, Math.PI / 4);
}
/** motes in a shaft of light, as small glints */
function dust(ctx, seed, n, t, x0, y0, w, h, col, r, vx, vy) {
  for (let i = 0; i < n; i++) {
    const d = rnd(seed + i * 1.7), x = x0 + mod(rnd(seed * 3 + i) * w + t * vx * (0.4 + d), w), y = y0 + mod(rnd(seed * 5 + i * 2.3) * h + t * vy * (0.4 + d), h);
    glint(ctx, x, y, r * (0.6 + d) * (0.75 + 0.25 * Math.sin(t * 2.2 + i * 3)), col, 0.45 + 0.4 * d, 0);
  }
}
/**
 * A row of town: each house a wall, a strip of shade on the side away from the lamp, a roof (gable or parapet),
 * dark windows by day or lit ones by night. o: { roof, win, winP, rim, rimCol }
 */
function cityTier(ctx, seed, x0, x1, base, hMin, hMax, wMin, wMax, wall, L, o = {}) {
  let x = x0, i = 0;
  const lampRight = L.dx > 0, sh = o.shade || shade(wall, 0.34), roof = o.roof || shade(wall, 0.5);
  while (x < x1) {
    const w = lerp(wMin, wMax, rnd(seed + i * 1.3)), h = lerp(hMin, hMax, Math.pow(rnd(seed * 2 + i * 2.1), 1.4)), r = rnd(seed * 3 + i), top = base - h, sw = w * 0.32;
    rect(ctx, x, top, w + 1, h + 2, wall);
    rect(ctx, lampRight ? x : x + w - sw, top, sw + 1, h + 2, sh);
    if (o.rim) rect(ctx, lampRight ? x + w - o.rim : x, top, o.rim, h, o.rimCol || L.rim);
    if (r < 0.45) poly(ctx, [[x - 3, top + 1], [x + w / 2, top - w * 0.4], [x + w + 4, top + 1]], roof);
    else { rect(ctx, x - 2, top - 5, w + 5, 7, roof); if (r > 0.8) rect(ctx, x + w * 0.6, top - 16, 7, 12, roof); }
    if (o.win) for (let wy = top + 10; wy < base - 10; wy += 17) for (let wx = x + 6; wx < x + w - 9; wx += 13) if (rnd(i * 31 + wx * 0.71 + wy * 1.31) < (o.winP || 0.5)) rect(ctx, wx, wy, 5, 8, o.win);
    x += w; i++;
  }
}
/**
 * The Founders' Lamp from outside: a tall stone tower at the head of the mole, an open lantern room under a
 * small dome. (x, fy) is where the flame stands; the tower's foot is at base. Returns nothing; the flame is the caller's.
 * o: { rim, capped } capped hangs the brass cap down inside the lantern room.
 */
function lampTower(ctx, x, fy, base, s, col, L, o = {}) {
  const gy = fy + s * 0.5, w0 = s * 1.5, w1 = s * 0.95, sh = o.shade || shade(col, 0.4);
  const body = pp([[x - w0, base], [x - w1, gy + s * 0.3], [x + w1, gy + s * 0.3], [x + w0, base]]);
  cel(ctx, body, col, L, { off: s * 0.7, ink: o.ink === undefined ? II : o.ink, rim: o.rim || 0, shadow: sh });
  for (let i = 1; i < 5; i++) { const y = lerp(gy + s * 0.3, base, i / 5), ww = lerp(w1, w0, i / 5); rect(ctx, x - ww, y, ww * 2, 2, alpha(INK, 0.35)); }
  for (let i = 0; i < 3; i++) rect(ctx, x - s * 0.12, lerp(gy + s * 0.9, base - s * 1.4, i / 2), s * 0.24, s * 0.5, alpha(INK, 0.7));
  box(ctx, x - s * 1.35, gy, s * 2.7, s * 0.32, col, L, { off: 0, shadow: false, ink: II });          // the gallery
  for (const k of [-1, -0.34, 0.34, 1]) rect(ctx, x + k * s * 1.02 - s * 0.09, fy - s * 0.86, s * 0.18, s * 1.4, k * L.dx > 0 ? col : sh);   // the lantern room's piers
  cel(ctx, (c) => { c.moveTo(x - s * 1.25, fy - s * 0.84); c.quadraticCurveTo(x - s * 1.1, fy - s * 1.9, x, fy - s * 2.1); c.quadraticCurveTo(x + s * 1.1, fy - s * 1.9, x + s * 1.25, fy - s * 0.84); c.closePath(); }, o.dome || C.brass, L, { off: s * 0.5, ink: II, rim: o.rim || 0 });
  stroke(ctx, x, fy - s * 2.1, x, fy - s * 2.8, Math.max(1.6, s * 0.14));
  if (o.capped) { flat(ctx, pp([[x - s * 0.62, fy + s * 0.3], [x - s * 0.36, fy - s * 0.7], [x + s * 0.36, fy - s * 0.7], [x + s * 0.62, fy + s * 0.3]]), shade(C.brass, 0.45)); rect(ctx, x - s * 0.62, fy + s * 0.2, s * 1.24, s * 0.12, o.capRim || C.brass); }
}
/** a hull at anchor, (x, y) the middle of its waterline: one or two masts, furled. Flat. */
function hull(ctx, x, y, s, col, L, masts = 2, stripe) {
  sil(ctx, pp([[x - 62 * s, y - 14 * s], [x + 70 * s, y - 16 * s], [x + 52 * s, y + 3 * s], [x - 50 * s, y + 3 * s]]), col, L, 2 * s, 0);
  if (stripe) rect(ctx, x - 56 * s, y - 10 * s, 120 * s, 2.4 * s, stripe);
  for (let m = 0; m < masts; m++) {
    const mx = x + (masts === 1 ? 4 : m ? 30 : -22) * s, h = (m ? 62 : 78) * s;
    rect(ctx, mx - 1.3 * s, y - 14 * s - h, 2.6 * s, h, col);
    rect(ctx, mx - 20 * s, y - 14 * s - h * 0.72, 40 * s, 2 * s, col); rect(ctx, mx - 15 * s, y - 14 * s - h * 0.74 - 3 * s, 30 * s, 3.4 * s, stripe || col);
  }
}
const idOf = (info) => (info && info.lines && info.lines[info.index] && info.lines[info.index].id) || '';

// ───────────────────────── chapter 8: Cresset ─────────────────────────

// ── cresset-harbour: the capital from the water, by day. Key: the Founders' Lamp, white, brighter than the sun on that side ──
// Lines of ch8.s3 (and any line whose id matches NIGHT_HARBOUR) see the same harbour at night: the wash and the
// lamp's night light are drawn moving, over the same still layers.
const NIGHT_HARBOUR = /^ch8\.s3\./;
const L_CRESSET = keyLight('#eef8ff', -Math.PI * 0.4, { depth: 0.72, tint: '#17366e' });
const L_CRESSET_W = keyLight('#eef8ff', -Math.PI * 0.74, { depth: 0.72, tint: '#17366e' });   // for what stands to the right of the lamp
def('cresset-harbour', L_CRESSET, (ctx, t, px, info) => {
  const L = L_CRESSET, LW = L_CRESSET_W, hy = 250, lx = 730, ly = 92, night = NIGHT_HARBOUR.test(idOf(info));
  ctx = S(0.04);
  sky(ctx, hy, ['#2a6fbc', '#3f8fd0', '#6cb6e0', '#a8dcec', '#dcf4f0'], [0.3, 0.52, 0.72, 0.9, 1]);
  // the sun, on the other side of the sky, and outshone
  rings(ctx, 462, 50, 46, [alpha('#fff1c4', 0.22), '#ffe9a8'], [1, 0.42]);
  cloud(ctx, 250, 150, 250, 54, '#eef8ff', L, 3); cloud(ctx, 1120, 104, 280, 60, '#eef8ff', LW, 7); cloud(ctx, 520, 196, 150, 28, '#c8e8f4', L, 5);
  // a second noon: the lamp's light in flat steps, and hard spokes of it
  rings(ctx, lx, ly, 340, [alpha('#ffffff', 0.13), alpha('#ffffff', 0.2), alpha('#ffffff', 0.34)], [1, 0.66, 0.4]);
  for (let i = 0; i < 10; i++) shaft(ctx, lx, ly, (i / 10) * TAU + 0.16, 470 - (i % 2) * 150, 0.1, '#ffffff', 0.55);
  // the city on its hill: three tiers, every wall white on the side that faces the lamp
  ctx = S(0.1);
  const o = px * 0.1;
  flat(ctx, (c) => { c.moveTo(X0, hy + 4); c.lineTo(X0, 120); c.bezierCurveTo(120 + o, 96, 330 + o, 110, 470 + o, 150); c.bezierCurveTo(560 + o, 180, 640 + o, 214, 700 + o, hy + 4); c.closePath(); }, '#7fa8cc');
  cityTier(ctx, 3, X0 + o, 560 + o, 176, 26, 64, 26, 50, '#a9c6de', L, { roof: '#6f8fba', rim: 3, rimCol: '#ffffff' });
  // the Assembly: a copper dome with an eye in it
  { const ax = 452 + o;
    box(ctx, ax - 64, 132, 128, 60, '#d9cfc0', L, { off: 14, ink: II, rim: 4, rimCol: '#ffffff' });
    for (let i = 0; i < 6; i++) rect(ctx, ax - 54 + i * 20, 142, 7, 50, '#8a86a8');
    cel(ctx, (c) => { c.moveTo(ax - 56, 134); c.arc(ax, 134, 56, Math.PI, 0); c.closePath(); }, '#4fb0a0', L, { off: 16, ink: II, rim: 5, rimCol: '#ffffff', shadow: '#2c6a86' });
    rect(ctx, ax - 9, 66, 18, 14, '#d9cfc0'); glint(ctx, ax + 22, 96, 12, '#ffffff', 1); }
  cityTier(ctx, 5, X0 + o, 650 + o, 222, 30, 78, 30, 58, '#e4d6bc', L, { roof: '#c66a4a', win: '#6a6a9a', winP: 0.45, rim: 4, rimCol: '#ffffff' });
  cityTier(ctx, 7, X0 + o, 600 + o, hy + 2, 22, 52, 34, 66, '#f1e6cc', L, { roof: '#a8503e', win: '#5a5a8e', winP: 0.4, rim: 4, rimCol: '#ffffff' });
  cityTier(ctx, 9, 1010 + o, 1560, hy - 10, 24, 70, 30, 60, '#e4d6bc', LW, { roof: '#c66a4a', win: '#6a6a9a', winP: 0.45, rim: 4, rimCol: '#ffffff' });
  // the mole, and the Lamp at the head of it
  rect(ctx, 610 + o, hy - 22, 960, 26, '#cfc4b4'); rect(ctx, 610 + o, hy - 22, 960, 5, '#ffffff'); rect(ctx, 610 + o, hy - 8, 960, 12, '#8f8aa8');
  for (let i = 0; i < 16; i++) flat(ctx, archP(790 + i * 52 + o, hy + 4, 30, 18), '#4c5a94');
  lampTower(ctx, lx + o, ly, hy + 2, 30, '#efe6d4', L, { shade: '#9a98b8', rim: 3, dome: C.brass });
  rings(ctx, lx + o, ly, 60, [alpha('#ffffff', 0.5), '#ffffff'], [1, 0.52]);
  // the roads: a flat sea, and the lamp lying in it
  rect(ctx, X0, hy + 2, XW, 800, '#1f9aa4');
  flat(ctx, pp([[lx - 60 + o, hy + 2], [lx + 60 + o, hy + 2], [lx + 330, 980], [lx - 330, 980]]), '#58c4c0');
  flat(ctx, pp([[lx - 22 + o, hy + 2], [lx + 22 + o, hy + 2], [lx + 120, 980], [lx - 120, 980]]), '#b8ece0');
  lozenges(ctx, 11, lx - 110, lx + 110, hy + 6, hy + 150, 30, '#ffffff');
  waves(ctx, X0, hy + 60, XW, 90, { len: 70, amp: 4, col: alpha('#0b5a6e', 0.35), foam: false });
  waves(ctx, X0, hy + 150, XW, 700, { len: 130, amp: 7, col: alpha('#0b5a6e', 0.4), foam: '#ffffff', every: 4, phase: 0.4, L });
  stroke(ctx, X0, hy + 3, X0 + XW, hy + 3, II, alpha(INK, 0.6));
  hull(ctx, 250 + px * 0.2, 316, 1.1, '#23406e', L, 2, '#f1e6cc'); hull(ctx, 1040 + px * 0.2, 300, 0.8, '#23406e', LW, 2, C.crimson); hull(ctx, 470 + px * 0.16, 284, 0.5, '#3a5a8a', L, 1);
  ctx = A();
  shimmer(ctx, 15, lx - 150, lx + 150, hy + 8, 640, 22, '#ffffff', t);
  if (night) {
    // the same roads at night: everything the lamp does not reach goes to indigo
    rect(ctx, X0, -200, XW, 1300, alpha('#0a0a34', 0.74));
    rings(ctx, lx + o, ly, 330, [alpha('#dff2ff', 0.1), alpha('#dff2ff', 0.16), alpha('#ffffff', 0.3), '#ffffff'], [1, 0.62, 0.34, 0.1]);
    flat(ctx, pp([[lx - 22 + o, hy + 2], [lx + 22 + o, hy + 2], [lx + 120, 980], [lx - 120, 980]]), alpha('#dff2ff', 0.3));
    ctx.fillStyle = '#ffd27a';
    for (let i = 0; i < 46; i++) { const x = (i < 34 ? 370 + rnd(i * 3.3) * 250 : 1010 + rnd(i * 3.3) * 400) + o, y = (i < 34 ? 150 : 190) + rnd(i * 7.1) * 90; ctx.fillRect(x, y, 4, 6); }
  }
  spark(ctx, lx + o, ly, night ? 46 : 38, t, 1, '#ffffff');
  // gulls, by day
  if (!night) { ink(ctx, II, '#ffffff'); ctx.beginPath(); for (let i = 0; i < 4; i++) { const x = mod(300 + i * 310 + t * (9 + i * 3), 1500) - 100, y = 150 + i * 14 + Math.sin(t * 0.7 + i) * 10, f = Math.sin(t * 5 + i * 2) * 5; ctx.moveTo(x - 10, y - f); ctx.quadraticCurveTo(x - 4, y - 4, x, y); ctx.quadraticCurveTo(x + 4, y - 4, x + 10, y - f); } ctx.stroke(); }
  // the ferry's rail: we are on the water
  ctx = S(1.1);
  const r = px * 1.1;
  rect(ctx, X0, 700, XW, 5, '#ffffff'); rect(ctx, X0, 705, XW, 16, '#1c2a5a');
  for (let i = 0; i < 16; i++) { rect(ctx, -244 + i * 120 + r, 721, 4, 300, '#ffffff'); rect(ctx, -240 + i * 120 + r, 721, 12, 300, '#1c2a5a'); }
});

// ── mole-dark: the harbour with the Lamp out and the sea standing up beyond the mole. Dusk. Key: the last daylight on the horizon ──
const L_MOLE = keyLight('#ffb27a', -Math.PI * 0.88, { depth: 0.9, tint: '#12103e' });
def('mole-dark', L_MOLE, (ctx, t, px) => {
  const L = L_MOLE, hy = 214, tx = 800, DARK = '#100e34';
  ctx = S(0.03);
  sky(ctx, hy, ['#0e0c30', '#1e1a54', '#47306e', '#9a4868', '#e8825a', '#ffd9a0'], [0.3, 0.52, 0.7, 0.84, 0.95, 1]);
  starsFlat(ctx, 61, 26, 60);
  rings(ctx, 452, hy + 6, 150, [alpha('#ffd9a0', 0.18), alpha('#ffe8bc', 0.34), '#fff3d6'], [1, 0.56, 0.2]);   // where the sun went
  for (const [x, y, w, c] of [[300, 150, 260, '#47306e'], [640, 176, 200, '#9a4868'], [1040, 140, 320, '#47306e'], [520, 110, 150, '#1e1a54']]) { rect(ctx, x - w / 2, y, w, 9, c); rect(ctx, x - w / 2 + 24, y - 7, w - 70, 8, c); }
  rect(ctx, X0, hy, XW, 60, '#5a3a72'); rect(ctx, X0, hy, XW, 4, '#ffd9a0');
  // the sea, standing up: nothing is laying it flat now
  ctx = A();
  const o = px * 0.06;
  waves(ctx, X0 - 200 + o, hy + 4 + Math.sin(t * 0.9) * 3, XW + 400, 60, { len: 150, amp: 17, phase: t * 0.16, col: '#3a2a66', foam: '#ffc89a', every: 2, L });
  waves(ctx, X0 - 200 + o, hy + 22 + Math.sin(t * 0.9 + 1.4) * 4, XW + 400, 60, { len: 210, amp: 24, phase: -t * 0.13 + 0.3, col: '#241c54', foam: '#ffc89a', every: 2, L, ink: II });
  // the mole, the Lamp capped at the head of it, and the still water it kept
  ctx = S(0.1);
  const m = px * 0.1;
  lampTower(ctx, tx + m, 78, hy + 50, 30, '#2a2456', L, { shade: DARK, rim: 4, dome: '#3a2c5c', capped: true, capRim: '#ffb27a' });
  sil(ctx, pp([[X0, hy + 34], [tx + 70 + m, hy + 34], [tx + 86 + m, hy + 64], [X0, hy + 64]]), DARK, L, 4, 0);
  rect(ctx, X0, hy + 34, tx + 70 + m - X0, 3, '#ffb27a');
  for (let i = 0; i < 18; i++) flat(ctx, archP(tx + 20 + m - i * 58, hy + 66, 32, 18), '#221a50');
  rect(ctx, X0, hy + 62, XW, 800, '#1c1a52');
  lozenges(ctx, 63, 300, 620, hy + 68, hy + 150, 20, '#e8825a'); lozenges(ctx, 64, X0, 1540, hy + 70, hy + 240, 26, '#47306e');
  waves(ctx, X0, hy + 170, XW, 700, { len: 120, amp: 6, col: '#15133f', foam: false, phase: 0.3 });
  hull(ctx, 330 + px * 0.2, 326, 1.0, DARK, L, 2); hull(ctx, 1090 + px * 0.2, 352, 1.3, DARK, L, 2); hull(ctx, 610 + px * 0.16, 300, 0.55, DARK, L, 1);
  ctx = A();
  { // it comes over the mole, a sea at a time
    for (let k = 0; k < 3; k++) {
      const ph = mod(t * 0.23 + k * 0.37, 1), bx = [560, 880, 250][k] + m, up = Math.sin(ph * Math.PI);
      if (ph > 0.9) continue;
      for (let i = 0; i < 3; i++) curl(ctx, bx + (i - 1) * 26, hy + 30 - up * (26 + i * 12), 9 + i * 3 + up * 5, 1.3, i % 2 ? 1 : -1, 6, '#ffe2c4', II);
    }
    shimmer(ctx, 66, 280, 640, hy + 70, 520, 10, '#e8825a', t);
  }
  // the quay we stand on: bollards, a ring, the first chalk
  ctx = S(0.9);
  const q = px * 0.9;
  rect(ctx, X0, 640, XW, 400, '#0c0a2a'); rect(ctx, X0, 640, XW, 5, '#c46a5a');
  for (const bx of [200, 640, 1080]) { cel(ctx, (c) => { const x = bx + q; c.moveTo(x - 22, 642); c.lineTo(x - 16, 596); c.quadraticCurveTo(x - 30, 580, x, 574); c.quadraticCurveTo(x + 30, 580, x + 16, 596); c.lineTo(x + 22, 642); c.closePath(); }, '#2a2456', L, { off: 9, ink: II, rim: 3, shadow: DARK }); }
  ink(ctx, 3, alpha(C.cream, 0.8));
  ctx.beginPath(); for (let i = 0; i < 14; i++) { const x = 300 + i * 54 + q; ctx.moveTo(x, 668); ctx.lineTo(x + 3, 700); ctx.moveTo(x + 12, 716); ctx.lineTo(x + 30, 716); } ctx.stroke();
});

// ── lane-by-hand: small boats strung across the roads, a pan of dim flame in each. Night. Key: that chain of flames ──
const L_BYHAND = keyLight(VIOLET, -Math.PI * 0.36, { depth: 0.85, tint: '#0c0a36' });
const L_BYHAND_E = keyLight(VIOLET, -Math.PI * 0.12), L_BYHAND_W = keyLight(VIOLET, -Math.PI * 0.88);   // the oarsman each side of a pan
/** where boat i of n sits in the chain, far to near: [x, y, scale] */
function chainAt(i, n) {
  const u = i / (n - 1), k = Math.pow(u, 1.7);
  return [470 + Math.sin(u * 2.5 + 0.2) * 250 + u * 150, 118 + k * 520, 0.16 + k * 1.05];
}
def('lane-by-hand', L_BYHAND, (ctx, t, px) => {
  const L = L_BYHAND, hy = 88, N = 13, SEA = '#0d1140';
  ctx = S(0.05);
  sky(ctx, hy, ['#06061e', '#0a0c30', '#121646', '#1c2260'], [0.4, 0.7, 0.92, 1]);
  starsFlat(ctx, 71, 60, hy - 6);
  // the bar, and the roads inside it: ruffled water, and a lane of flat where the pans burn, a hull apart
  rect(ctx, X0, hy, XW, 900, SEA);
  flat(ctx, pp([[X0, hy + 2], [X0, hy - 5], [520, hy - 8], [900, hy - 3], [1100, hy + 2]]), '#05051a');
  waves(ctx, X0, hy + 22, XW, 40, { len: 40, amp: 3, col: '#0a0d36', foam: false });
  waves(ctx, X0, hy + 70, XW, 80, { len: 70, amp: 5, col: '#090b30', foam: '#3a3a7a', every: 3, L });
  waves(ctx, X0, hy + 170, XW, 140, { len: 110, amp: 8, col: '#07092a', foam: '#3a3a7a', every: 3, phase: 0.4, L });
  waves(ctx, X0, hy + 330, XW, 600, { len: 170, amp: 12, col: '#060724', foam: '#3a3a7a', every: 2, phase: 0.7, L });
  ctx = S(0.2);
  const o = px * 0.2;
  for (let pass = 0; pass < 3; pass++) for (let i = 0; i < N; i++) {
    const [x, y, s] = chainAt(i, N);
    flat(ctx, ep(x + o, y + 8 * s, [150, 104, 56][pass] * s + 6, [36, 24, 12][pass] * s + 2), ['#161a56', '#262a76', '#5a54a8'][pass]);
  }
  for (let i = 0; i < N; i++) {
    const [x0, y, s] = chainAt(i, N), x = x0 + o, dir = i % 2 ? 1 : -1;
    lozenges(ctx, 80 + i, x - 40 * s, x + 40 * s, y + 12 * s, y + 60 * s, 5, VIOLET);
    bloom(ctx, x, y - 24 * s, 80 * s + 10, VIOLET, 0.8);
    // the boat, two at the oars, and the pan on a thwart between them
    sil(ctx, (c) => { c.moveTo(x - 66 * s, y - 12 * s); c.quadraticCurveTo(x, y + 2 * s, x + 66 * s, y - 12 * s); c.quadraticCurveTo(x + 44 * s, y + 13 * s, x, y + 14 * s); c.quadraticCurveTo(x - 44 * s, y + 13 * s, x - 66 * s, y - 12 * s); c.closePath(); }, '#241a4a', L, 2.5 * s, s > 0.45 ? II : 0, '#8a78c8');
    if (s > 0.3) {
      busts(ctx, [[x - 34 * s, y - 38 * s, 11 * s]], '#15123c', L_BYHAND_E, 2.2 * s, 0, VIOLET); busts(ctx, [[x + 34 * s, y - 38 * s, 11 * s]], '#15123c', L_BYHAND_W, 2.2 * s, 0, VIOLET);
      stroke(ctx, x - dir * 30 * s, y - 14 * s, x - dir * 96 * s, y + 10 * s, Math.max(1.5, 3 * s), '#15123c');
      rect(ctx, x - 13 * s, y - 16 * s, 26 * s, 6 * s, '#6a6294'); rect(ctx, x - 13 * s, y - 16 * s, 26 * s, 2 * s, '#e6dcff');
    } else rect(ctx, x - 20 * s, y - 26 * s, 40 * s, 16 * s, '#15123c');
  }
  ctx = A();
  for (let i = 0; i < N; i++) {
    const [x, y, s] = chainAt(i, N);
    if (s > 0.3) fire(ctx, x + o, y - 16 * s, 11 * s, t * 0.5, i, DIM, 0);
    else rect(ctx, x + o - 2, y - 22 * s - 4, 4, 5, '#e6dcff');
    if (s > 0.24) glint(ctx, x + o, y - 30 * s, (16 * s + 5) * (1 + 0.16 * Math.sin(t * 2.1 + i * 1.7)), '#f2ecff', 0.95, 0);
  }
  shimmer(ctx, 77, 380, 1000, hy + 40, 700, 16, VIOLET, t);
  // out past the bar a blue point shows, and goes, and shows: the dark islands, answering
  for (const [bx, sp, ph] of [[592, 0.9, 0], [716, 0.9, 2.1], [838, 0.9, 4.2]]) {
    if (Math.sin(t * sp + ph) > 0.2) { bloom(ctx, bx + px * 0.05, hy - 14, 22, '#5fa8ff', 0.9); glint(ctx, bx + px * 0.05, hy - 14, 9, '#cfe6ff', 1, 0); }
  }
  // the edge of the mole, chalked with places so that nobody loses one by sitting
  ctx = S(1.0);
  const q = px;
  rect(ctx, X0, 716, XW, 400, '#0b0926'); rect(ctx, X0, 716, XW, 5, '#6a5aa8');
  ink(ctx, 3, alpha(C.cream, 0.85));
  ctx.beginPath(); for (let i = 0; i < 20; i++) { const x = -160 + i * 84 + q; ctx.moveTo(x, 734); ctx.lineTo(x, 790); ctx.moveTo(x + 20, 750); ctx.lineTo(x + 34 + rnd(i) * 22, 750); ctx.moveTo(x + 20, 764); ctx.lineTo(x + 50, 764); } ctx.stroke();
});

// ── quay-break: the quay in flight, an overloaded ferry casting off. Night. Key: one ship's lantern, swinging ──
const L_BREAK = keyLight('#ffb04a', -Math.PI * 0.56, { depth: 0.9, tint: '#0e0a38' });
def('quay-break', L_BREAK, (ctx, t, px) => {
  const L = L_BREAK, hy = 300, DARK = '#0c0a2c', HULL = '#3a1c40', hx = 606, hook = 58;
  ctx = S(0.05);
  sky(ctx, hy, ['#07061e', '#0c0d34', '#151a50', '#22266a'], [0.4, 0.7, 0.92, 1]);
  starsFlat(ctx, 91, 40, 200);
  // Cresset behind, lightless but for windows, and the Lamp capped
  cityTier(ctx, 13, X0, 1560, hy + 2, 30, 110, 30, 62, '#12113c', L, { shade: '#0e0c30', roof: '#0e0c30', win: '#ffc65a', winP: 0.12 });
  lampTower(ctx, 318, 150, hy + 2, 22, '#17154a', L, { shade: '#0e0c30', dome: '#221c50', capped: true, ink: 0 });
  rect(ctx, X0, hy + 2, XW, 800, '#0d1040');
  waves(ctx, X0, hy + 30, XW, 90, { len: 60, amp: 6, col: '#0a0c36', foam: '#3a3a7a', every: 3 });
  waves(ctx, X0, hy + 110, XW, 600, { len: 110, amp: 10, col: '#07082a', foam: '#e87a3a', every: 3, phase: 0.5, L });
  // the lantern's reach, at rest
  ctx = S(0.3);
  const o = px * 0.3;
  rings(ctx, hx + o, hook + 70, 330, [alpha(L.col, 0.08), alpha(L.col, 0.12), alpha(L.col, 0.2)], [1, 0.64, 0.36]);
  // the ferry, down by the head with what she is carrying
  ctx.save(); ctx.translate(820 + o, 300); ctx.rotate(-0.035); ctx.translate(-820, -300);
  rect(ctx, 632, -190, 9, 440, DARK); rect(ctx, 632, -190, 3, 440, '#e87a3a');                                 // the mast
  stroke(ctx, 520, 40, 760, 34, 7, DARK); stroke(ctx, 636, -60, 1140, 236, II, DARK); stroke(ctx, 636, -60, 440, 236, II, DARK);   // the yard, the stays
  stroke(ctx, hx, 40, hx, hook, II, DARK);
  // funnel and wheelhouse
  cel(ctx, rp(1010, 60, 64, 180), '#5a2030', L, { off: 16, ink: IW, rim: 4 }); rect(ctx, 1010, 84, 64, 16, C.cream); rect(ctx, 1004, 52, 76, 12, DARK);
  cel(ctx, rp(760, 136, 210, 106), '#c9b48e', L, { off: 22, ink: IW, rim: 4, shadow: '#5a4a7a' }); rect(ctx, 750, 124, 230, 14, HULL);
  for (let i = 0; i < 4; i++) { rect(ctx, 778 + i * 48, 160, 32, 34, '#ffd27a'); ink(ctx, II); ctx.strokeRect(778 + i * 48, 160, 32, 34); }
  // everyone who could get a foot on her: the rail, the wheelhouse roof, the shrouds
  busts(ctx, Array.from({ length: 9 }, (_, i) => [770 + i * 24 + rnd(i) * 8, 100 + rnd(i * 3) * 8, 12]), '#1a1440', L, 3, II, '#ffb968');
  busts(ctx, Array.from({ length: 34 }, (_, i) => [442 + i * 32 + rnd(i * 7) * 14, 206 + rnd(i * 5) * 16 - (i % 5 === 0 ? 14 : 0), 14 + rnd(i) * 4]), '#1a1440', L, 3.4, II, '#ffb968');
  busts(ctx, Array.from({ length: 30 }, (_, i) => [456 + i * 36 + rnd(i * 11) * 16, 232 + rnd(i * 13) * 10, 15 + rnd(i * 3) * 4]), '#120e34', L, 3, 0, '#e87a3a');
  // bundles, a chair, a birdcage, held up out of the crush
  for (const [bx, by, w, h, c] of [[520, 168, 34, 26, '#8a5a3a'], [690, 150, 28, 34, '#6a4a8a'], [924, 176, 40, 24, '#8a5a3a'], [1130, 160, 30, 30, '#4a6a7a']]) { stroke(ctx, bx + w / 2, by + h, bx + w / 2 + 6, by + h + 30, 5, '#1a1440'); box(ctx, bx, by, w, h, c, L, { off: 6, ink: II, rim: 2 }); }
  // the hull: rail, strake, the name board nobody is reading
  cel(ctx, pp([[400, 250], [1560, 250], [1560, 470], [470, 470], [410, 330]]), HULL, L, { off: 20, ink: IW, rim: 5, shadow: '#1c1034' });
  rect(ctx, 404, 250, 1160, 9, C.cream); rect(ctx, 430, 300, 1130, 7, '#e87a3a'); stroke(ctx, 404, 259, 1560, 259, II);
  for (let i = 0; i < 12; i++) { flat(ctx, cp(520 + i * 92, 350, 11), '#ffd27a'); outline(ctx, cp(520 + i * 92, 350, 11), II); }
  ctx.restore();
  // the gap, widening; the gangway going into it; the line let go
  flat(ctx, pp([[160 + o, 420], [250 + o, 396], [448 + o, 300], [470 + o, 318], [270 + o, 430]]), '#8a5a3a'); outline(ctx, pp([[160 + o, 420], [250 + o, 396], [448 + o, 300], [470 + o, 318], [270 + o, 430]]), II);
  busts(ctx, [[300 + o, 318, 15], [350 + o, 296, 15], [398 + o, 268, 15]], '#1a1440', L, 3.4, II, '#ffb968');
  taperPath(ctx, [[470 + o, 290], [380 + o, 360], [330 + o, 470], [250 + o, 520], [120 + o, 500]], 6, 4, '#c9b48e');
  // the lantern itself swings
  ctx = A();
  { const a = Math.sin(t * 1.3) * 0.2 + Math.sin(t * 0.47) * 0.06, lx0 = hx + (hx - 820) * 0 + o, ly0 = hook - 2;   // pivot (the ferry's list is small enough to ignore here)
    const lx = lx0 + Math.sin(a) * 74, ly = ly0 + Math.cos(a) * 74;
    stroke(ctx, lx0, ly0, lx, ly - 22, II, DARK);
    bloom(ctx, lx, ly, 150, L.col, 0.9);
    ctx.fillStyle = INK; ctx.fillRect(lx - 17, ly - 24, 34, 48); ctx.fillStyle = '#5a3a2a'; ctx.fillRect(lx - 14, ly - 21, 28, 6); ctx.fillRect(lx - 14, ly + 15, 28, 6);
    ctx.fillStyle = L.col; ctx.fillRect(lx - 12, ly - 15, 24, 30); ctx.fillStyle = WHITE; ctx.fillRect(lx - 6, ly - 9, 12, 20);
    spark(ctx, lx, ly, 26, t, 2);
    // smoke: she has steam up and is not waiting
    for (let i = 0; i < 4; i++) { const ph = mod(t * 0.12 + i / 4, 1); ctx.globalAlpha = Math.min(1, (1 - ph) * 2) * Math.min(1, ph * 6); curl(ctx, 1046 + o + ph * 150, 40 - ph * 150, 16 + ph * 30, 1.4, 1, 8 + ph * 8, '#3a3466', II); }
    ctx.globalAlpha = 1;
  }
  // the quay: the ones who did not get aboard, and what they dropped
  ctx = S(0.8);
  const q = px * 0.8;
  flat(ctx, pp([[X0, 1000], [X0, 470], [150 + q, 452], [330 + q, 486], [420 + q, 1000]]), '#141238'); stroke(ctx, X0, 470, 150 + q, 452, IW); stroke(ctx, 150 + q, 452, 330 + q, 486, IW); stroke(ctx, 330 + q, 486, 420 + q, 1000, IW);
  rect(ctx, X0, 468, 150 + q - X0, 4, '#e87a3a');
  cel(ctx, rp(40 + q, 520, 110, 70), '#8a5a3a', L, { off: 12, ink: IW, rim: 4 }); stroke(ctx, 40 + q, 544, 150 + q, 544, II); cel(ctx, ep(250 + q, 560, 40, 28), '#c9b48e', L, { off: 10, ink: IW, rim: 3, shadow: '#5a4a7a' });
  busts(ctx, Array.from({ length: 9 }, (_, i) => [-230 + i * 62 + rnd(i * 5) * 20 + q, 420 + rnd(i * 3) * 30, 26]), DARK, L, 4, 0, '#e87a3a');
  { const arms = (c) => { for (let i = 0; i < 9; i += 2) { const x = -230 + i * 62 + rnd(i * 5) * 20 + q, y = 420 + rnd(i * 3) * 30; c.moveTo(x + 16, y + 40); c.lineTo(x + 44, y - 44); c.lineTo(x + 60, y - 40); c.lineTo(x + 40, y + 44); c.closePath(); } }; sil(ctx, arms, DARK, L, 4, 0, '#e87a3a'); }
});
