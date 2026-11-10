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
  const L = L_CRESSET, LW = L_CRESSET_W, hy = 250, lx = 730, ly = 104, night = NIGHT_HARBOUR.test(idOf(info));
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
  const L = L_MOLE, hy = 176, tx = 800, DARK = '#100e34';
  ctx = S(0.03);
  sky(ctx, hy, ['#0e0c30', '#1e1a54', '#47306e', '#9a4868', '#e8825a', '#ffd9a0'], [0.3, 0.52, 0.7, 0.84, 0.95, 1]);
  starsFlat(ctx, 61, 26, 40);
  rings(ctx, 452, hy + 6, 150, [alpha('#ffd9a0', 0.18), alpha('#ffe8bc', 0.34), '#fff3d6'], [1, 0.56, 0.2]);   // where the sun went
  for (const [x, y, w, c] of [[300, 112, 260, '#47306e'], [640, 138, 200, '#9a4868'], [1040, 104, 320, '#47306e'], [520, 76, 150, '#1e1a54']]) { rect(ctx, x - w / 2, y, w, 9, c); rect(ctx, x - w / 2 + 24, y - 7, w - 70, 8, c); }
  rect(ctx, X0, hy, XW, 60, '#5a3a72'); rect(ctx, X0, hy, XW, 4, '#ffd9a0');
  // the sea, standing up: nothing is laying it flat now
  ctx = A();
  const o = px * 0.06;
  waves(ctx, X0 - 200 + o, hy - 26 + Math.sin(t * 0.9) * 4, XW + 400, 90, { len: 190, amp: 22, phase: t * 0.13, col: '#4a2e6a', foam: '#ffc89a', every: 2, L });
  waves(ctx, X0 - 200 + o, hy - 8 + Math.sin(t * 0.9 + 1.4) * 5, XW + 400, 90, { len: 260, amp: 30, phase: -t * 0.11 + 0.3, col: '#2e2058', foam: '#ffd9b4', every: 2, L, ink: II });
  waves(ctx, X0 - 200 + o, hy + 16 + Math.sin(t * 0.9 + 2.6) * 4, XW + 400, 60, { len: 170, amp: 18, phase: t * 0.1 + 0.6, col: '#1c164a', foam: '#ffc89a', every: 3, L });
  // the mole, the Lamp capped at the head of it, and the still water it kept
  ctx = S(0.1);
  const m = px * 0.1;
  lampTower(ctx, tx + m, 100, hy + 50, 30, '#2a2456', L, { shade: DARK, rim: 4, dome: '#3a2c5c', capped: true, capRim: '#ffb27a' });
  sil(ctx, pp([[X0, hy + 34], [tx + 70 + m, hy + 34], [tx + 86 + m, hy + 64], [X0, hy + 64]]), DARK, L, 4, 0);
  rect(ctx, X0, hy + 34, tx + 70 + m - X0, 3, '#ffb27a');
  for (let i = 0; i < 18; i++) flat(ctx, archP(tx + 20 + m - i * 58, hy + 66, 32, 18), '#221a50');
  rect(ctx, X0, hy + 62, XW, 800, '#1c1a52');
  lozenges(ctx, 63, 300, 620, hy + 68, hy + 150, 20, '#e8825a'); lozenges(ctx, 64, X0, 1540, hy + 70, hy + 240, 26, '#47306e');
  waves(ctx, X0, hy + 170, XW, 700, { len: 120, amp: 6, col: '#15133f', foam: false, phase: 0.3 });
  hull(ctx, 330 + px * 0.2, 306, 1.0, DARK, L, 2); hull(ctx, 1090 + px * 0.2, 342, 1.3, DARK, L, 2); hull(ctx, 610 + px * 0.16, 276, 0.55, DARK, L, 1);
  hull(ctx, 760 + px * 0.3, 452, 1.9, '#0c0a2a', L, 2, '#c46a5a'); hull(ctx, 130 + px * 0.26, 404, 1.5, '#0c0a2a', L, 1); hull(ctx, 930 + px * 0.16, 286, 0.6, DARK, L, 2);
  ctx = A();
  { // it comes over the mole, a sea at a time
    for (let k = 0; k < 3; k++) {
      const ph = mod(t * 0.23 + k * 0.37, 1), bx = [560, 880, 250][k] + m, up = Math.sin(ph * Math.PI);
      if (ph > 0.9) continue;
      curl(ctx, bx, hy + 30 - up * 22, 7 + up * 5, 1.2, k % 2 ? 1 : -1, 4.5, '#ffe2c4', II);
      rect(ctx, bx - 34, hy + 34, 68, 3, '#ffe2c4');
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
  const u = i / (n - 1), k = Math.pow(u, 1.5);
  return [450 + Math.sin(u * 2.5 + 0.2) * 250 + u * 150, 122 + k * 520, 0.24 + k * 1.0];
}
def('lane-by-hand', L_BYHAND, (ctx, t, px) => {
  const L = L_BYHAND, hy = 96, N = 13, SEA = '#0d1140';
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
  { const arms = (c) => { for (let i = 0; i < 9; i += 2) { const x = -230 + i * 62 + rnd(i * 5) * 20 + q, y = 420 + rnd(i * 3) * 30; c.moveTo(x + 14, y + 40); c.lineTo(x + 40, y - 50); c.lineTo(x + 52, y - 47); c.lineTo(x + 34, y + 44); c.closePath(); } }; sil(ctx, arms, DARK, L, 4, 0, '#e87a3a'); }
});

// ── full-bench: three magistrates under a high window. Morning. Key: the window, behind them ──
const L_FULL = keyLight('#fff2cc', -Math.PI * 0.56, { depth: 0.88, tint: '#1a1848' });
const L_FULL_E = keyLight('#fff2cc', -Math.PI * 0.3, { depth: 0.88, tint: '#1a1848' }), L_FULL_W = keyLight('#fff2cc', -Math.PI * 0.7, { depth: 0.88, tint: '#1a1848' });
const FILE_COLS = ['#f3e3bb', '#d9c08a', '#bfd0cc', '#8fb4b8', '#e8cf9a', '#c9a868'];
/** a stack of files lying flat, bottom at y; returns the top */
function files(ctx, x, y, w, n, seed, dim = 0) {
  for (let i = 0; i < n; i++) {
    const h = 9 + rnd(seed + i) * 7, off = (rnd(seed * 3 + i) - 0.5) * 14, ww = w + (rnd(seed * 5 + i) - 0.5) * 16;
    y -= h;
    rect(ctx, x + off, y, ww, h, shade(FILE_COLS[Math.floor(rnd(seed * 7 + i) * FILE_COLS.length)], dim));
    if (rnd(seed * 11 + i) < 0.4) rect(ctx, x + off + ww * 0.3, y, 6, h, shade(C.crimson, dim * 0.8));
    ink(ctx, 1.6, alpha(INK, 0.9)); ctx.strokeRect(x + off, y, ww, h);
  }
  return y;
}
def('full-bench', L_FULL, (ctx, t, px) => {
  const L = L_FULL, WALL = '#2e2a4e', DARK = '#131028', wy = 190, R = 126;
  ctx = S(0.35);
  const wx = 640 + px * 0.35;
  fillAll(ctx, WALL);
  // a poor court: plaster gone in a patch, a stain under the cornice, one crack nobody has had mended
  flat(ctx, pp([[wx + 250, -40], [wx + 420, -60], [wx + 470, 60], [wx + 400, 150], [wx + 290, 120], [wx + 240, 40]]), '#3c3660');
  ink(ctx, 1.6, alpha(INK, 0.6)); ctx.beginPath(); for (let r = 0; r < 6; r++) { ctx.moveTo(wx + 260, -20 + r * 28); ctx.lineTo(wx + 450, -20 + r * 28); } ctx.stroke();
  flat(ctx, pp([[wx - 520, -180], [wx - 330, -180], [wx - 350, 60], [wx - 390, 130], [wx - 420, 70], [wx - 470, 96], [wx - 500, 20]]), '#262244');
  taperPath(ctx, [[wx - 260, -180], [wx - 236, -60], [wx - 262, 20], [wx - 230, 110], [wx - 250, 170]], 4, 0.5, INK);
  rect(ctx, X0, 300, XW, 700, '#221d3c'); rect(ctx, X0, 296, XW, 8, '#4a4266');
  for (const k of [-1, 1]) box(ctx, wx + k * 356 - 24, -180, 48, 480, '#3c3660', k < 0 ? L_FULL_E : L_FULL_W, { off: 14, ink: II, rim: 4 });
  // the window: a great half-round, with one pane boarded
  const fan = (r0, r1, a0, a1) => (c) => { c.moveTo(wx + Math.cos(a0) * r0, wy + Math.sin(a0) * r0); c.arc(wx, wy, r0, a0, a1); c.lineTo(wx + Math.cos(a1) * r1, wy + Math.sin(a1) * r1); c.arc(wx, wy, r1, a1, a0, true); c.closePath(); };
  bloom(ctx, wx, wy - 46, 360, L.col, 0.8);
  flat(ctx, fan(0, R + 16, Math.PI, TAU), DARK);
  flat(ctx, fan(0, R, Math.PI, TAU), '#d6eef2'); flat(ctx, fan(0, R * 0.78, Math.PI, TAU), '#fffbea'); flat(ctx, fan(0, R * 0.46, Math.PI, TAU), '#ffffff');
  flat(ctx, fan(R * 0.5, R, Math.PI * 1.667, Math.PI * 1.833), '#8a6a4a'); stroke(ctx, wx + Math.cos(Math.PI * 1.7) * R * 0.56, wy + Math.sin(Math.PI * 1.7) * R * 0.56, wx + Math.cos(Math.PI * 1.8) * R * 0.94, wy + Math.sin(Math.PI * 1.8) * R * 0.94, II);
  ink(ctx, 6, DARK); ctx.beginPath();
  for (let i = 1; i < 6; i++) { const a = Math.PI * (1 + i / 6); ctx.moveTo(wx, wy); ctx.lineTo(wx + Math.cos(a) * R, wy + Math.sin(a) * R); }
  ctx.moveTo(wx - R * 0.5, wy); ctx.arc(wx, wy, R * 0.5, Math.PI, TAU); ctx.stroke();
  outline(ctx, fan(0, R, Math.PI, TAU), IW);
  box(ctx, wx - R - 34, wy, R * 2 + 68, 14, '#5a5078', L, { off: 0, shadow: false, ink: II, rim: 3 });
  // what it throws into the room: two hard slabs, toward us
  flat(ctx, pp([[wx - R, wy + 14], [wx + R, wy + 14], [wx + R + 380, 980], [wx - R - 380, 980]]), alpha(L.col, 0.09));
  flat(ctx, pp([[wx - 54, wy + 14], [wx + 54, wy + 14], [wx + 190, 980], [wx - 190, 980]]), alpha(L.col, 0.1));
  // the Full Bench: three chairs with their backs to the light, and all three sitting
  ctx = S(0.45);
  const bx = 640 + px * 0.45;
  // the galleries: Cresset has come to watch three poor men be slow
  for (const k of [-1, 1]) {
    const gx = bx + k * 500, x0 = k < 0 ? X0 : gx, w = k < 0 ? gx - X0 : X0 + XW - gx, LL = k < 0 ? L_FULL_E : L_FULL_W;
    busts(ctx, Array.from({ length: 9 }, (_, i) => [gx + k * (40 + i * 46 + rnd(i * 3 + k) * 14), 196 + rnd(i * 7 + k) * 10, 15]), DARK, LL, 3, 0);
    box(ctx, x0, 228, w, 54, '#4a2a40', LL, { off: 0, shadow: false, ink: II, rim: 3 }); rect(ctx, x0, 240, w, 5, '#8a5a3a');
    for (let i = 0; i < 7; i++) rect(ctx, gx + k * (30 + i * 64), 250, 5, 30, alpha(INK, 0.6));
    box(ctx, gx - 9, 228, 18, 190, '#5a3448', LL, { off: 0, shadow: false, ink: II, rim: 3 });
  }
  for (const i of [-1, 1, 0]) {
    const x = bx + i * 196, top = i ? 132 : 112, LL = i < 0 ? L_FULL_E : i > 0 ? L_FULL_W : L;
    sil(ctx, (c) => { c.moveTo(x - 46, 260); c.lineTo(x - 46, top + 30); c.quadraticCurveTo(x - 42, top + 4, x, top); c.quadraticCurveTo(x + 42, top + 4, x + 46, top + 30); c.lineTo(x + 46, 260); c.closePath(); }, '#43203a', LL, 4, II);
    flat(ctx, cp(x, top + 22, 7), C.brass);
    busts(ctx, [[x, 184 - (i ? 0 : 6), 21]], '#17132e', LL, 3.4, II);
    rect(ctx, x - 6, 206 - (i ? 0 : 6), 5, 15, C.cream); rect(ctx, x + 1, 206 - (i ? 0 : 6), 5, 15, C.cream);
  }
  // the bench itself: good oak, the cloth darned
  box(ctx, bx - 420, 232, 840, 12, '#8a5a3a', L, { off: 0, shadow: false, ink: II, rim: 3 });
  box(ctx, bx - 400, 244, 800, 110, '#1f5a50', L, { off: 0, shadow: false, ink: II });
  rect(ctx, bx - 400, 244, 800, 12, alpha(C.night, 0.5));
  rect(ctx, bx + 120, 280, 70, 46, '#2c7a62'); ink(ctx, 1.6, C.cream); ctx.setLineDash([5, 5]); ctx.strokeRect(bx + 120, 280, 70, 46); ctx.setLineDash([]);
  rect(ctx, bx - 310, 300, 44, 30, '#18463e'); ink(ctx, 1.6, C.cream); ctx.setLineDash([5, 5]); ctx.strokeRect(bx - 310, 300, 44, 30); ctx.setLineDash([]);
  files(ctx, bx - 330, 232, 64, 6, 5, 0.25); files(ctx, bx + 262, 232, 70, 9, 8, 0.25); files(ctx, bx - 110, 232, 54, 3, 11, 0.25); files(ctx, bx + 76, 232, 50, 4, 14, 0.25);
  box(ctx, bx - 470, 354, 940, 30, '#4a2a40', L, { off: 8, ink: II, rim: 3 }); box(ctx, bx - 520, 384, 1040, 30, '#3a2034', L, { off: 8, ink: II, rim: 3 });
  // floor, the dock rail, the public
  rect(ctx, X0, 414, XW, 600, '#1a1734');
  flat(ctx, pp([[bx - 150, 414], [bx + 150, 414], [bx + 330, 980], [bx - 330, 980]]), '#8a7e84'); flat(ctx, pp([[bx - 60, 414], [bx + 60, 414], [bx + 150, 980], [bx - 150, 980]]), '#cfc0a4');
  stroke(ctx, X0, 414, X0 + XW, 414, IW);
  box(ctx, bx + 300, 470, 330, 16, '#8a5a3a', L, { off: 0, shadow: false, ink: II, rim: 3 });
  for (let i = 0; i < 9; i++) { box(ctx, bx + 310 + i * 38, 486, 9, 200, '#5a3a34', L, { off: 0, shadow: false, ink: 1.6 }); }
  busts(ctx, Array.from({ length: 22 }, (_, i) => [X0 + 40 + i * 84 + rnd(i * 3) * 30 + px * 0.6, 610 + rnd(i * 7) * 30, 30]), '#0e0c26', L, 4, 0);
}, (ctx, t, px) => {
  dust(ctx, 17, 22, t, 380 + px, 200, 520, 460, '#fff6dc', 5, 4, 5);
});

// ── assembly: a horseshoe of forty seats, twelve draped in grey. Noon. Key: the oculus overhead ──
const L_ASM = keyLight('#fff4d0', -Math.PI * 0.54, { depth: 0.85, tint: '#1a1a50' });
/** the forty seats, far to near: [x, y, scale, draped] */
const ASM_SEATS = (() => {
  const out = [];
  for (let tier = 0; tier < 2; tier++) for (let j = 0; j < 20; j++) {
    const a = lerp(Math.PI * 0.94, Math.PI * 2.06, (j + 0.5) / 20), s = Math.sin(a);
    out.push([640 + Math.cos(a) * (tier ? 400 : 560), 296 + s * (tier ? 92 : 136) + (tier ? 8 : 0), 0.74 + 0.5 * (1 + s) + tier * 0.1, (j * 7 + tier * 3) % 10 < 3]);
  }
  return out.sort((p, q) => p[1] - q[1]);
})();
def('assembly', L_ASM, (ctx, t, px) => {
  const L = L_ASM, oy = 100;
  ctx = S(0.3);
  const ox = 640 + px * 0.3;
  fillAll(ctx, '#1a1842');
  // the dome from below: rings of coffers stepping in to the eye
  for (const [rx, ry, c] of [[980, 360, '#211e4c'], [760, 276, '#2a2860'], [560, 200, '#363878'], [380, 132, '#4a509a'], [220, 74, '#6e7aba']]) { flat(ctx, ep(ox, oy, rx, ry), c); outline(ctx, ep(ox, oy, rx, ry), II, alpha(INK, 0.7)); }
  ink(ctx, II, alpha(INK, 0.55)); ctx.beginPath();
  for (let i = 0; i < 28; i++) { const a = (i / 28) * TAU + 0.11, c = Math.cos(a), s = Math.sin(a); ctx.moveTo(ox + c * 130, oy + s * 44); ctx.lineTo(ox + c * 980, oy + s * 360); }
  ctx.stroke();
  bloom(ctx, ox, oy, 250, L.col, 0.85);
  flat(ctx, ep(ox, oy, 116, 40), '#8f8aa8'); outline(ctx, ep(ox, oy, 116, 40), IW);
  flat(ctx, ep(ox, oy + 3, 96, 30), '#9fd6f0'); flat(ctx, ep(ox + 4, oy + 8, 78, 21), '#ffffff'); outline(ctx, ep(ox, oy + 3, 96, 30), II);
  // the drum: a cornice, pilasters, niches
  rect(ctx, X0, 176, XW, 900, '#2c2a5e');
  box(ctx, X0, 164, XW, 16, '#8f8aa8', L, { off: 0, shadow: false, ink: II, rim: 4 });
  for (let i = -5; i <= 5; i++) {
    const x = ox + i * 150;
    box(ctx, x - 14, 180, 28, 240, '#44427c', L, { off: 0, shadow: pp([[x + 2, 180], [x + 14, 180], [x + 14, 420], [x + 2, 420]]), ink: II });
    if (i < 5) flat(ctx, archP(x + 40, 420, 70, 200), '#201e4a');
  }
  // the floor, and the day standing on it
  rect(ctx, X0, 300, XW, 800, '#1c1a44');
  flat(ctx, ep(640 + px * 0.5, 470, 330, 80), '#4a4674'); flat(ctx, ep(640 + px * 0.5, 470, 230, 54), '#a39c98'); flat(ctx, ep(640 + px * 0.5, 470, 130, 30), '#f1e6cc');
  // the far half of the horseshoe; then the shaft; then the near arms
  ctx = S(0.5);
  const q = px * 0.5;
  const seat = (p) => {
    const x = p[0] + q, y = p[1], s = p[2];
    if (p[3]) {   // draped: a dark island's seat, under grey cloth
      cel(ctx, (c) => { c.moveTo(x - 21 * s, y + 46 * s); c.lineTo(x - 16 * s, y - 16 * s); c.quadraticCurveTo(x, y - 30 * s, x + 16 * s, y - 16 * s); c.lineTo(x + 21 * s, y + 46 * s); c.closePath(); }, '#b9b7cc', L, { off: 7 * s, ink: II, rim: 2.5 * s, rimCol: '#ffffff', shadow: '#77759a' });
      stroke(ctx, x - 5 * s, y - 14 * s, x - 9 * s, y + 44 * s, 1.6, alpha(INK, 0.6)); stroke(ctx, x + 7 * s, y - 10 * s, x + 11 * s, y + 44 * s, 1.6, alpha(INK, 0.6));
    } else {
      sil(ctx, archP(x - 15 * s, y + 44 * s, 30 * s, 68 * s), '#5a2238', L, 2.5 * s, II);
      busts(ctx, [[x, y, 11.5 * s]], '#17153a', L, 2.6 * s, 0);
    }
    rect(ctx, x - 21 * s, y + 28 * s, 42 * s, 20 * s, '#4a3050'); rect(ctx, x - 22 * s, y + 26 * s, 44 * s, 4 * s, '#c9a070'); ink(ctx, 1.6); ctx.strokeRect(x - 21 * s, y + 28 * s, 42 * s, 20 * s);
  };
  for (const p of ASM_SEATS) if (p[1] < 300) seat(p);
  flat(ctx, pp([[640 - 92 + px * 0.3, oy + 6], [640 + 92 + px * 0.3, oy + 6], [640 + 250 + q, 470], [640 - 250 + q, 470]]), alpha(L.col, 0.13));
  flat(ctx, pp([[640 - 44 + px * 0.3, oy + 6], [640 + 44 + px * 0.3, oy + 6], [640 + 120 + q, 470], [640 - 120 + q, 470]]), alpha(L.col, 0.13));
  // the table, and on it two schedules
  cel(ctx, ep(640 + q, 438, 150, 30), '#8a5a3a', L, { off: 0, shadow: false, ink: IW, rim: 4 });
  rect(ctx, 640 + q - 110, 440, 220, 60, '#4a2a40'); stroke(ctx, 640 + q - 110, 440, 640 + q - 110, 500, II); stroke(ctx, 640 + q + 110, 440, 640 + q + 110, 500, II);
  flat(ctx, pp([[570 + q, 428], [626 + q, 424], [632 + q, 444], [574 + q, 448]]), C.cream); outline(ctx, pp([[570 + q, 428], [626 + q, 424], [632 + q, 444], [574 + q, 448]]), 1.6); flat(ctx, cp(616 + q, 440, 6), C.crimson);
  flat(ctx, pp([[654 + q, 424], [712 + q, 428], [708 + q, 448], [650 + q, 444]]), C.cream); outline(ctx, pp([[654 + q, 424], [712 + q, 428], [708 + q, 448], [650 + q, 444]]), 1.6); rect(ctx, 676 + q, 425, 6, 22, C.sea);
  for (const p of ASM_SEATS) if (p[1] >= 300) seat(p);
}, (ctx, t, px) => {
  dust(ctx, 23, 20, t, 500 + px * 0.5, 110, 280, 360, '#fff6dc', 5, 3, 6);
  spark(ctx, 640 + px * 0.3 + 60, 96, 16, t, 3, '#ffffff');
});

// ── founders-lamp: the lamp-house at Cresset, rings twice the size of Saltmere's, a brass cap hanging on its chain. Night. Key: the cold white flame ──
const L_FOUND = keyLight('#dff4ff', -Math.PI * 0.6, { depth: 0.9, tint: '#0a0e3c' });
const L_FOUND_E = keyLight('#dff4ff', -Math.PI * 0.1, { depth: 0.9, tint: '#0a0e3c' }), L_FOUND_W = keyLight('#dff4ff', -Math.PI * 0.9, { depth: 0.9, tint: '#0a0e3c' });
const L_FOUND_UP = keyLight('#dff4ff', Math.PI * 0.5, { depth: 0.9, tint: '#0a0e3c' });   // for the cap: it is lit from underneath
const F_RINGS = [[250, 0.34, -0.2, 13], [356, 0.52, 0.3, 15], [470, 0.24, 0.08, 18]];   // rx, tilt, turn, width
def('founders-lamp', L_FOUND, (ctx, t, px) => {
  const L = L_FOUND, cx = 640 + px * 0.25, fy = 182, hy = 348, wy = 520, STONE = '#2c3676', DARK = '#090b2a', ry0 = fy - 34;
  // night, the roads, and Cresset's roofs a long way down
  ctx = S(0);
  sky(ctx, hy, ['#05061e', '#0a1040', '#122262', '#1c3c84'], [0.4, 0.68, 0.9, 1]);
  starsFlat(ctx, 51, 50, hy - 60);
  rect(ctx, X0, hy, XW, wy - hy + 4, '#102a66');
  flat(ctx, pp([[540, hy], [740, hy], [1000, wy], [280, wy]]), '#2e6eb0'); flat(ctx, pp([[604, hy], [676, hy], [780, wy], [500, wy]]), '#7cc4ee');
  lozenges(ctx, 53, 560, 720, hy + 4, wy - 10, 18, '#ffffff');
  stroke(ctx, X0, hy, X0 + XW, hy, 2, '#9fdcff');
  cityTier(ctx, 15, X0, 1560, hy + 100, 16, 46, 22, 44, '#1a2a6a', L, { shade: '#101c50', roof: '#3a5aa0', win: '#ffd27a', winP: 0.3 });
  // the arcade: piers lit on the side that faces the flame
  ctx = S(0.15);
  const ax = cx - px * 0.1;
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1, d = Math.floor(i / 2), x = ax + side * (252 + d * 200), w = 44 + d * 16;
    box(ctx, x - w / 2, -180, w, wy + 180 + d * 14, STONE, side < 0 ? L_FOUND_E : L_FOUND_W, { off: w * 0.42, ink: II, rim: 5, shadow: DARK });
    box(ctx, x - w / 2 - 8, wy + d * 14 - 14, w + 16, 17, STONE, side < 0 ? L_FOUND_E : L_FOUND_W, { off: 6, ink: II, shadow: DARK });
  }
  rect(ctx, X0, -180, XW, 204, DARK); rect(ctx, X0, 20, XW, 6, STONE); stroke(ctx, X0, 27, X0 + XW, 27, II);
  // the standing order, nailed where the watch will see it
  { const x = ax - 270, y = 112;
    cel(ctx, pp([[x, y], [x + 34, y + 2], [x + 33, y + 50], [x - 1, y + 48]]), C.cream, L_FOUND_E, { off: 5, ink: II });
    for (let r = 0; r < 4; r++) rect(ctx, x + 5, y + 9 + r * 7, 22 - (r % 2) * 6, 2.4, alpha(INK, 0.7));
    flat(ctx, cp(x + 24, y + 41, 5.5), C.crimson); flat(ctx, cp(x + 17, y + 3, 2.4), INK); }
  // the flame's reach, in flat steps; the three rings; the hopper and its chute
  ctx = S(0.25);
  rings(ctx, cx, ry0, 380, [alpha(L.col, 0.08), alpha(L.col, 0.13), alpha(L.col, 0.22)], [1, 0.64, 0.36]);
  for (const [rx, tilt, turn, w] of F_RINGS) {
    const e = (r, a0, a1) => { ctx.beginPath(); ctx.ellipse(cx, ry0, r, r * tilt, turn, a0, a1); ctx.stroke(); };
    ink(ctx, w + 5.5, INK); e(rx, 0, TAU);
    ink(ctx, w, C.brass); e(rx, 0, TAU);
    ink(ctx, w * 0.5, '#8a4a34'); e(rx + w * 0.2, Math.PI * 0.12, Math.PI * 0.88);     // the near limb, turned from the flame
    ink(ctx, w * 0.36, '#ffffff'); e(rx - w * 0.24, Math.PI * 1.14, Math.PI * 1.86);   // the far limb, facing it
  }
  const hx = cx - 208;
  stroke(ctx, hx + 20, 230, cx - 40, fy + 14, 15); stroke(ctx, hx + 20, 230, cx - 40, fy + 14, 9, '#8a4a34'); stroke(ctx, hx + 20, 226, cx - 40, fy + 10, 2.4, C.brass);
  stroke(ctx, hx + 14, 236, hx + 14, wy, 12); stroke(ctx, hx + 14, 236, hx + 14, wy, 6, '#8a4a34');
  cel(ctx, pp([[hx - 44, 150], [hx + 52, 150], [hx + 30, 238], [hx + 2, 238]]), C.brass, L_FOUND_E, { off: 14, ink: IW, rim: 4 });
  box(ctx, hx - 50, 142, 108, 11, C.brass, L_FOUND_E, { off: 0, shadow: false, ink: II });
  // the pedestal and the cup
  cel(ctx, pp([[cx - 54, wy], [cx - 30, fy + 44], [cx + 30, fy + 44], [cx + 54, wy]]), '#8a4a34', L, { off: 0, ink: IW, shadow: pp([[cx + 4, fy + 44], [cx + 30, fy + 44], [cx + 54, wy], [cx + 12, wy]]), rim: 0 });
  rect(ctx, cx - 20, fy + 46, 5, wy - fy - 48, C.brass);
  cel(ctx, pp([[cx - 200, wy + 2], [cx + 200, wy + 2], [cx + 168, wy - 20], [cx - 168, wy - 20]]), '#8a4a34', L, { off: 0, shadow: false, ink: II, rim: 3 });
  ink(ctx, 3);
  ctx.beginPath(); ctx.moveTo(cx - 50, fy + 4); ctx.quadraticCurveTo(cx - 42, fy + 42, cx - 10, fy + 46); ctx.lineTo(cx + 10, fy + 46); ctx.quadraticCurveTo(cx + 42, fy + 42, cx + 50, fy + 4); ctx.closePath();
  ctx.fillStyle = C.brass; ctx.fill(); ctx.stroke();
  flat(ctx, ep(cx, fy + 4, 50, 9), '#ffffff'); outline(ctx, ep(cx, fy + 4, 50, 9), 3);
  // the cap, on its chain: a brass bell wide enough to shut the cup, lit from underneath
  ink(ctx, 2.6, INK); for (let y = -176; y < 44; y += 15) { ctx.beginPath(); ctx.ellipse(cx, y + 7, 4.5, 8.5, 0, 0, TAU); ctx.stroke(); }
  ink(ctx, 1.6, C.brass); for (let y = -176; y < 44; y += 30) { ctx.beginPath(); ctx.ellipse(cx, y + 7, 4.5, 8.5, 0, 0, TAU); ctx.stroke(); }
  outline(ctx, cp(cx, 50, 9), 5); outline(ctx, cp(cx, 50, 9), 2, C.brass);
  cel(ctx, (c) => { c.moveTo(cx - 70, 112); c.quadraticCurveTo(cx - 62, 66, cx - 22, 58); c.lineTo(cx + 22, 58); c.quadraticCurveTo(cx + 62, 66, cx + 70, 112); c.closePath(); }, C.brass, L_FOUND_UP, { off: 16, ink: IW, rim: 5, rimCol: '#ffffff', shadow: '#7a4a3a' });
  rect(ctx, cx - 74, 108, 148, 9, '#ffffff'); outline(ctx, rp(cx - 74, 108, 148, 9), II);
  ctx = A();
  fire(ctx, cx, fy + 2, 37, t * 0.36, 3, COLD);
  spark(ctx, cx, fy - 30, 34, t, 4, '#ffffff');
  glint(ctx, cx - 40, 113, 9 + 3 * Math.sin(t * 1.7), '#ffffff', 1, 0);
  // each ring carries a shutter-lens, going round
  for (let i = 0; i < 3; i++) {
    const [rx, tilt, turn] = F_RINGS[i], a = t * (0.16 + i * 0.05) * (i % 2 ? 1 : -1) + i * 2.1, ex = Math.cos(a) * rx, ey = Math.sin(a) * rx * tilt;
    const lx = cx + ex * Math.cos(turn) - ey * Math.sin(turn), ly = ry0 + ex * Math.sin(turn) + ey * Math.cos(turn);
    rect(ctx, lx - 12, ly - 16, 24, 32, INK); rect(ctx, lx - 9, ly - 13, 18, 26, C.brass); rect(ctx, lx - 5.5, ly - 9.5, 11, 19, Math.sin(a) > 0 ? '#ffffff' : '#5fb4f4');
  }
  // the lamp-house floor: the flame lying in polished stone; the head of the stair
  ctx = S(0);
  rect(ctx, X0, wy, XW, 500, '#070a28');
  flat(ctx, ep(640, wy + 96, 430, 80), '#101e52'); flat(ctx, ep(640, wy + 78, 270, 48), '#1e4690'); flat(ctx, ep(640, wy + 62, 120, 20), '#7cc4ee'); flat(ctx, ep(640, wy + 56, 44, 7), '#ffffff');
  rect(ctx, X0, wy, XW, 3, '#9fdcff'); stroke(ctx, X0, wy + 4, X0 + XW, wy + 4, II);
  for (let i = 0; i < 5; i++) { const x = 1010 + i * 62, y = wy + 40 + i * 34; rect(ctx, x, y - 92, 9, 92 + i * 6, DARK); rect(ctx, x, y - 92, 3, 92 + i * 6, '#9fdcff'); }
  stroke(ctx, 1000, wy - 54, 1290, wy + 104, 9, DARK); stroke(ctx, 1000, wy - 57, 1290, wy + 101, 2.4, '#9fdcff');
}, (ctx, t, px) => {
  dust(ctx, 29, 14, t, 380 + px, 60, 520, 440, '#cfeaff', 4.5, 2, 7);
});

// ───────────────────────── Carrow ─────────────────────────
/** Carrow's lamp-house: a squat stone tower with a slate hat. (x, base) is the middle of its foot. Returns where its flame stands. */
function carrowLamp(ctx, x, base, s, col, sh, L, o = {}) {
  const top = base - s * 1.3;
  cel(ctx, pp([[x - s * 0.52, base], [x - s * 0.4, top], [x + s * 0.4, top], [x + s * 0.52, base]]), col, L, { off: s * 0.26, ink: II, rim: o.rim || 0, shadow: sh });
  for (let i = 0; i < 7; i++) rect(ctx, x - s * 0.3 + rnd(i * 3.3) * s * 0.5, top + s * (0.14 + i * 0.15), s * 0.16, 2, alpha(INK, 0.4));
  box(ctx, x - s * 0.5, top - s * 0.1, s, s * 0.11, col, L, { off: 0, shadow: false, ink: II });
  rect(ctx, x - s * 0.4, top - s * 0.48, s * 0.8, s * 0.4, o.room || alpha(INK, 0.9));
  for (const k of [-1, 0, 1]) rect(ctx, x + k * s * 0.36 - s * 0.05, top - s * 0.5, s * 0.1, s * 0.42, k * L.dx > 0 ? col : sh);
  cel(ctx, pp([[x - s * 0.56, top - s * 0.48], [x, top - s * 0.98], [x + s * 0.56, top - s * 0.48]]), o.hat || '#3a4470', L, { off: s * 0.2, ink: II, rim: o.rim || 0 });
  flat(ctx, archP(x - s * 0.17, base, s * 0.34, s * 0.58), o.door || alpha(INK, 0.92)); outline(ctx, archP(x - s * 0.17, base, s * 0.34, s * 0.58), II);
  return [x, top - s * 0.14];
}
/** a goat standing at (x, y), s its height at the shoulder; dir 1 faces right */
function goat(ctx, x, y, s, col, L, dir = 1) {
  sil(ctx, (c) => {
    c.moveTo(x + s * 0.62, y - s * 0.7); c.ellipse(x, y - s * 0.7, s * 0.62, s * 0.34, 0, 0, TAU); c.closePath();
    for (const k of [-0.46, -0.3, 0.3, 0.46]) c.rect(x + k * s - s * 0.05, y - s * 0.6, s * 0.1, s * 0.6);
    c.moveTo(x + dir * s * 0.4, y - s * 0.8); c.lineTo(x + dir * s * 0.72, y - s * 1.36); c.lineTo(x + dir * s * 1.12, y - s * 1.22); c.lineTo(x + dir * s * 1.08, y - s * 1.06); c.lineTo(x + dir * s * 0.86, y - s * 1.02); c.lineTo(x + dir * s * 0.7, y - s * 0.62); c.closePath();
    c.moveTo(x + dir * s * 0.74, y - s * 1.34); c.lineTo(x + dir * s * 0.52, y - s * 1.72); c.lineTo(x + dir * s * 0.86, y - s * 1.36); c.closePath();
    c.moveTo(x - dir * s * 0.56, y - s * 0.86); c.lineTo(x - dir * s * 0.78, y - s * 1.04); c.lineTo(x - dir * s * 0.6, y - s * 0.72); c.closePath();
  }, col, L, Math.max(1.4, s * 0.09), 0);
}
/** a kelp rack: two trestles and a pole, the weed hung over it to dry. (x, y) is the left foot; the pole is h above */
function kelpRack(ctx, x, y, w, h, L, cols, seed) {
  const top = y - h;
  for (const k of [0.06, 0.94]) { const px0 = x + w * k; stroke(ctx, px0 - h * 0.16, y, px0, top - 8, 7, INK); stroke(ctx, px0 + h * 0.16, y, px0, top - 8, 7, INK); stroke(ctx, px0 - h * 0.16, y, px0, top - 8, 3, '#7a5a4a'); stroke(ctx, px0 + h * 0.16, y, px0, top - 8, 3, '#7a5a4a'); }
  const n = Math.floor(w / 13);
  for (let i = 0; i < n; i++) {
    const kx = x + w * 0.04 + (i + 0.5) * (w * 0.92 / n), len = h * (0.34 + 0.4 * rnd(seed + i * 1.7)), wig = (rnd(seed * 3 + i) - 0.5) * 9;
    taperPath(ctx, [[kx, top - 2], [kx + wig, top + len * 0.35], [kx - wig * 0.7, top + len * 0.7], [kx + wig * 0.4, top + len]], 11, 3, INK);
    taperPath(ctx, [[kx, top], [kx + wig, top + len * 0.35], [kx - wig * 0.7, top + len * 0.7], [kx + wig * 0.4, top + len - 3]], 7, 1, cols[i % cols.length]);
  }
  stroke(ctx, x - 8, top, x + w + 8, top - 3, 8, INK); stroke(ctx, x - 8, top, x + w + 8, top - 3, 4, '#a8846a');
  rect(ctx, x, top - 3 + L.dy * 2, w, 1.6, L.rim);
}
const CARROW_SLOPE = [[548, 240], [640, 204], [700, 176], [760, 160], [840, 152], [1000, 140], [1250, 124], [1560, 114]];
function slopeY(x) { const P = CARROW_SLOPE; for (let i = 1; i < P.length; i++) if (x <= P[i][0]) return lerp(P[i - 1][1], P[i][1], (x - P[i - 1][0]) / (P[i][0] - P[i - 1][0])); return P[P.length - 1][1]; }
const L_CARM = keyLight('#ffd9a0', -Math.PI * 0.9, { depth: 0.7, tint: '#2a2a70' });
const L_CARD = keyLight('#ffb45a', -Math.PI * 0.3, { depth: 0.9, tint: '#10103c' });
/** the beach at Carrow: shingle, kelp racks, goats, the stone lamp-house on its rise. Morning (the lane held) or dusk (the sum) */
function carrow(ctx, t, px, dusk) {
  const L = dusk ? L_CARD : L_CARM, hy = 178, sx = 492, lhx = 836;
  const K = dusk
    ? { sky: ['#0c0c30', '#191a50', '#2c2a6c', '#4a3a7c', '#7a4a7a'], sea: '#1a1c56', sea1: '#15164a', sea2: '#10113c', foam: '#5a5a9a', land: '#14163e', stone: '#2a2c5c', stoneSh: '#14143a', shingle: '#232450', peb: ['#2e3064', '#191a44'], pebHi: '#5a5a9a', kelp: ['#1c2a40', '#262a4a', '#16223a'], goat: '#1c1c48', turf: '#1c2a44', wash: '#8a8ac0' }
    : { sky: ['#3a4a9a', '#6a6ab0', '#b47aa8', '#f09a78', '#ffd9a0'], sea: '#3a6aa8', sea1: '#2f5c9c', sea2: '#264c8a', foam: '#fff3d6', land: '#2a3068', stone: '#4a4a86', stoneSh: '#23235a', shingle: '#5c5690', peb: ['#746ea6', '#40407a'], pebHi: '#ffd9a0', kelp: ['#3a5a3a', '#5a5a2a', '#2c4a44'], goat: '#262860', turf: '#3a5a5a', wash: '#fff3d6' };
  ctx = S(0.04);
  sky(ctx, hy, K.sky, [0.36, 0.6, 0.8, 0.93, 1]);
  if (dusk) { starsFlat(ctx, 33, 44, hy - 30); rect(ctx, X0, hy - 5, XW, 5, '#c46a7a'); }
  else {
    rings(ctx, sx, hy - 6, 200, [alpha('#ffd9a0', 0.2), alpha('#ffe8bc', 0.34), alpha('#fff3d6', 0.7), '#fffdf2'], [1, 0.62, 0.34, 0.14]);   // the sun, an hour up
    for (const [x, y, w, c] of [[330, 104, 240, '#b47aa8'], [760, 76, 300, '#6a6ab0'], [1110, 96, 260, '#b47aa8'], [150, 144, 150, '#f09a78']]) { rect(ctx, x - w / 2, y, w, 8, c); rect(ctx, x - w / 2 + 26, y - 6, w - 80, 7, c); }
  }
  rect(ctx, X0, hy, XW, 400, K.sea); rect(ctx, X0, hy, XW, 3.5, dusk ? '#c46a7a' : '#fff3d6');
  if (!dusk) {
    for (let i = 0; i < 7; i++) rect(ctx, sx - 80 + i * 9, hy + 10 + i * 13, 160 - i * 18, 5, '#ffd9a0');   // the light coming across the water in dashes
    // the boat they came in: one hull wide, a lug sail, the sun behind it
    const bx = sx + 44, by = hy + 14;
    sil(ctx, (c) => { c.moveTo(bx - 40, by - 9); c.quadraticCurveTo(bx, by + 2, bx + 44, by - 12); c.lineTo(bx + 30, by + 6); c.lineTo(bx - 30, by + 6); c.closePath(); c.moveTo(bx - 4, by - 8); c.lineTo(bx - 20, by - 62); c.lineTo(bx + 22, by - 74); c.lineTo(bx + 30, by - 14); c.closePath(); }, '#2a2466', L, 2.4, II, '#fff3d6');
    stroke(ctx, bx + 2, by - 6, bx + 2, by - 82, 3, '#2a2466');
    busts(ctx, [[bx - 24, by - 20, 5.5], [bx + 34, by - 22, 5.5], [bx + 20, by - 21, 5]], '#1c1a50', L, 1.4, 0, '#fff3d6');
  }
  ctx = A();
  waves(ctx, X0 - 160 + px * 0.05, hy + 62, XW + 320, 70, { len: 100, amp: 7, phase: t * 0.2, col: K.sea1, foam: K.foam, L });
  waves(ctx, X0 - 160 + px * 0.05, hy + 120, XW + 320, 240, { len: 160, amp: 11, phase: -t * 0.16 + 0.4, col: K.sea2, foam: K.foam, L, ink: II });
  // the rise, the lamp-house, two roofs, the goats
  ctx = S(0.25);
  const o = px * 0.25;
  sil(ctx, (c) => { const P = CARROW_SLOPE; c.moveTo(P[0][0] - 70 + o, 440); c.lineTo(P[0][0] + o, P[0][1]); c.quadraticCurveTo(P[1][0] - 30 + o, P[1][1] + 6, P[1][0] + o, P[1][1]); for (let i = 2; i < P.length; i++) c.lineTo(P[i][0] + o, P[i][1]); c.lineTo(1600, 440); c.closePath(); }, K.land, L, 4, IW, dusk ? '#4a3a7c' : '#ffd9a0');
  // its seaward face, in the one shadow tone, and a path worn up it
  flat(ctx, (c) => { c.moveTo(478 + o, 440); c.lineTo(548 + o, 246); c.quadraticCurveTo(640 + o, 250, 700 + o, 300); c.quadraticCurveTo(760 + o, 360, 1000 + o, 380); c.lineTo(1600, 400); c.lineTo(1600, 440); c.closePath(); }, K.stoneSh);
  taperPath(ctx, [[lhx - 6 + o, slopeY(lhx) + 6], [lhx - 50 + o, 200], [lhx - 20 + o, 250], [lhx - 110 + o, 300], [lhx - 90 + o, 380]], 5, 16, alpha(K.pebHi, dusk ? 0.16 : 0.3));
  for (const [x, w, h] of [[1010, 84, 30], [1130, 70, 26]]) {
    const y = slopeY(x) + 4, xx = x + o;
    box(ctx, xx - w / 2, y - h, w, h + 6, K.stone, L, { off: 8, ink: II, shadow: K.stoneSh });
    cel(ctx, pp([[xx - w / 2 - 7, y - h + 2], [xx - w / 2 + 10, y - h - 20], [xx + w / 2 - 10, y - h - 20], [xx + w / 2 + 7, y - h + 2]]), K.turf, L, { off: 6, ink: II });
    rect(ctx, xx - 6, y - h + 10, 12, 12, alpha(INK, 0.85));
  }
  if (dusk) {   // one small lamp, in the lamp-house door: it lights the step and a wedge of the hill and nothing else
    bloom(ctx, lhx + o, slopeY(lhx) - 10, 150, L.col, 0.9);
    flat(ctx, pp([[lhx - 9 + o, slopeY(lhx) + 3], [lhx + 9 + o, slopeY(lhx) + 3], [lhx - 20 + o, 300], [lhx - 170 + o, 300]]), alpha(L.col, 0.26));
  }
  const fl = carrowLamp(ctx, lhx + o, slopeY(lhx) + 4, 47, K.stone, K.stoneSh, L, { rim: dusk ? 0 : 3, hat: dusk ? '#1c1c4c' : '#3a4480', door: dusk ? '#ffe2a0' : undefined, room: dusk ? undefined : '#3a3470' });
  if (dusk) { flat(ctx, ep(lhx + o, slopeY(lhx) - 6, 4, 8), '#ffffff'); bloom(ctx, lhx + o, slopeY(lhx) - 8, 40, '#ffe2a0', 0.9); }
  goat(ctx, 716 + o, slopeY(716) + 3, 20, K.goat, L, -1); goat(ctx, 930 + o, slopeY(930) + 3, 17, K.goat, L, 1); goat(ctx, 958 + o, slopeY(958) + 3, 12, K.goat, L, -1); goat(ctx, 640 + o, slopeY(640) + 4, 16, K.goat, L, 1); goat(ctx, 1220 + o, slopeY(1220) + 3, 19, K.goat, L, -1);
  ctx = A();
  if (dusk) spark(ctx, lhx + o, slopeY(lhx) - 10, 13, t, 5, '#fff3d6');
  else { fire(ctx, fl[0], fl[1] + 8, 6, t * 0.5, 2, DIM, 0); glint(ctx, fl[0], fl[1], 9 + 2 * Math.sin(t * 2), '#e6dcff', 0.9, 0); glint(ctx, sx, hy - 8, 30 + 4 * Math.sin(t * 1.3), '#ffffff', 0.9, 0); }
  // the shingle, the racks, what the tide left
  ctx = S(0.7);
  const q = px * 0.7;
  flat(ctx, (c) => { c.moveTo(X0 - 60, 1000); c.lineTo(X0 - 60, 430); c.quadraticCurveTo(300, 386, 640, 402); c.quadraticCurveTo(1000, 418, X0 + XW + 60, 382); c.lineTo(X0 + XW + 60, 1000); c.closePath(); }, K.shingle);
  ink(ctx, IW); ctx.beginPath(); ctx.moveTo(X0 - 60, 430); ctx.quadraticCurveTo(300, 386, 640, 402); ctx.quadraticCurveTo(1000, 418, X0 + XW + 60, 382); ctx.stroke();
  for (let i = 0; i < 50; i++) {
    const x = X0 + rnd(i * 3.1) * XW, y = 440 + rnd(i * 7.7) * 350, r = 9 + rnd(i * 5) * 16;
    flat(ctx, ep(x, y, r, r * 0.5), K.peb[i % 3 ? 0 : 1]); rect(ctx, x - r * 0.7 + (L.dx > 0 ? r * 0.5 : 0), y - r * 0.5, r * 0.9, 2.5, K.pebHi);
  }
  kelpRack(ctx, 366 + q, 452, 130, 350, L, K.kelp, 3);
  kelpRack(ctx, 960 + q, 560, 300, 190, L, K.kelp, 7); kelpRack(ctx, 60 + q, 520, 220, 150, L, K.kelp, 11);
  if (dusk) {   // the rowing boat, hauled up above the weed
    cel(ctx, (c) => { c.moveTo(430 + q, 580); c.quadraticCurveTo(560 + q, 612, 760 + q, 566); c.quadraticCurveTo(700 + q, 640, 560 + q, 646); c.quadraticCurveTo(470 + q, 640, 430 + q, 580); c.closePath(); }, '#3a2a5a', L, { off: 10, ink: IW, rim: 4, shadow: '#16143c' });
    stroke(ctx, 500 + q, 598, 500 + q, 636, II); stroke(ctx, 620 + q, 602, 620 + q, 640, II); stroke(ctx, 560 + q, 600, 830 + q, 560, 6, INK); stroke(ctx, 560 + q, 599, 830 + q, 559, 2.4, '#8a7a6a');
  }
  ctx = A();
  { const u = 0.5 + 0.5 * Math.sin(t * 0.7), y = 386 + u * 22;   // the wash, up the stones and back
    waves(ctx, X0 - 160 + px * 0.7, y, XW + 320, 14, { len: 130, amp: 6, phase: 0.2, col: K.wash, foam: false }); }
}
// ── carrow-morning: the lane held. Key: a low sun behind the arriving boat ──
def('carrow-morning', L_CARM, (ctx, t, px) => carrow(ctx, t, px, false));
// ── carrow-dusk: the sum. Key: the small lamp in the lamp-house door ──
def('carrow-dusk', L_CARD, (ctx, t, px) => carrow(ctx, t, px, true));
