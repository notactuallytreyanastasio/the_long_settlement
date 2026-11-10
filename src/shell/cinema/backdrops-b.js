// Backdrop painters, second half (chapters 3, 4 and 5). Part of the cinematic renderer: see ../cinema.js.
// Exports BACKDROPS_B: key -> { light, back(ctx, t, px, info), front?(ctx, t, px, info) }.
// Still and moving sections are marked with ctx = S(depth) and ctx = A(): the contract is written out in kit.js.
//
// Every painting here is built the same way: flat colour, indigo ink, and ONE key light that the whole frame
// obeys. Each backdrop declares that light as a style.js Light (L_*), which is also what the cast is lit by.
//
// Where things have to be. On a phone the cast stand very large: with two people on stage, everything below
// about y = 210 is behind somebody's head. The portrait window is 600 stage units wide, centred on the
// backdrop's pan (cinema.js PORTRAIT_PAN, else 640). So the lamp and the thing each place is about are painted
// in the band y 30..210 within 280 of the pan; what lies below is for the wide frame and for lines with nobody
// on stage.
//
// Cost. Almost all of each painting sits in two still layers (a far one that fills the frame, a near one that is
// only as large as what it holds). What moves each frame is a handful of flat shapes: a glint on the lamp, a
// banner, a pendulum, a band of sea, rain. Nothing moving makes a gradient or sets a clip.
import { TAU, clamp, lerp, mod, rnd, rect, circ, seg, poly, FONT_SERIF, S, A, fillAll, waveform, X0, XW } from './kit.js';
import { INK, PALETTE, light, shadowOf, hiOf, blend, alpha, ink, outline, taper, cel, bloom, shaft, glint, bands, rings, curl, gust, waves } from '../style.js';

export const BACKDROPS_B = Object.create(null);
function def(key, light, back, front) { BACKDROPS_B[key] = { light, back, front: front || null }; }

// ───────────────────────── local kit ─────────────────────────
// One stage unit is about 0.72 logical px on a phone, so the house 3 px silhouette line is 4.2 here.
const IW = 4.2, II = 2.1;
const WHITE = PALETTE.white;
const pR = (x, y, w, h) => (c) => c.rect(x, y, w, h);
const pP = (pts) => (c) => { c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); };
const pE = (x, y, rx, ry) => (c) => { c.moveTo(x + rx, y); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.closePath(); };
/** a doorway or window with a round head */
const pArch = (x, y, w, h) => (c) => { c.moveTo(x, y + h); c.lineTo(x, y + w / 2); c.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); c.lineTo(x + w, y + h); c.closePath(); };
/** flat fill and an ink line centred on the edge */
function flat(ctx, path, col, w = IW) {
  ctx.beginPath(); path(ctx); ctx.fillStyle = col; ctx.fill();
  if (w > 0) { ink(ctx, w); ctx.stroke(); }
}
/**
 * A silhouette in one tone, inked, with a hard rim on the side the light is on. No clip: the rim is the same
 * shape slid d toward the lamp and laid under the fill, so the line breaks where the light hits. Cheap enough
 * for crowds; forms that need a shadow tone as well use style.js cel().
 */
function sil(ctx, path, col, L, d = 3, w = IW, rimCol) {
  if (w > 0) { ink(ctx, w * 2); ctx.beginPath(); path(ctx); ctx.stroke(); }
  if (d > 0) { ctx.translate(L.dx * d, L.dy * d); ctx.beginPath(); path(ctx); ctx.fillStyle = rimCol || L.rim; ctx.fill(); ctx.translate(-L.dx * d, -L.dy * d); }
  ctx.beginPath(); path(ctx); ctx.fillStyle = col; ctx.fill();
}
/** head and shoulders, cut off flat at y + 3.2 s. Wound the same way as its neighbours, so a row can be one path */
function bustPath(c, x, y, s) {
  c.moveTo(x + s * 0.46, y); c.arc(x, y, s * 0.46, 0, TAU); c.closePath();
  c.moveTo(x - s * 0.95, y + s * 3.2); c.lineTo(x - s * 0.95, y + s * 1.25); c.quadraticCurveTo(x - s * 0.9, y + s * 0.55, x, y + s * 0.52);
  c.quadraticCurveTo(x + s * 0.9, y + s * 0.55, x + s * 0.95, y + s * 1.25); c.lineTo(x + s * 0.95, y + s * 3.2); c.closePath();
}
/** a row of people, [[x, y, s], ...], as one rim-lit shape */
function busts(ctx, list, col, L, d = 2.4, w = 0, rimCol) {
  sil(ctx, (c) => { for (const p of list) bustPath(c, p[0], p[1], p[2]); }, col, L, d, w, rimCol);
}
/** a light source that stays put: stepped bloom, a core that is nearly white. The glint over it is drawn moving, by spark() */
function source(ctx, x, y, r, L, a = 1) {
  bloom(ctx, x, y, r, L.col, a, L.core);
  ctx.fillStyle = WHITE; ctx.beginPath(); ctx.arc(x, y, r * 0.075, 0, TAU); ctx.fill();
}
/** the moving part of a lamp: a four-point glint that breathes */
function spark(ctx, x, y, r, t, seed = 0) {
  const k = 1 + 0.14 * Math.sin(t * 2.7 + seed * 5) + 0.06 * Math.sin(t * 7.1 + seed * 3);
  glint(ctx, x, y, r * k, WHITE, 1, 0);
  glint(ctx, x, y, r * 0.5 * (2 - k), WHITE, 0.7, Math.PI / 4);
}
/** motes in a shaft of light, as small glints */
function dust(ctx, seed, n, t, x0, y0, w, h, col, r, vx, vy) {
  for (let i = 0; i < n; i++) {
    const d = rnd(seed + i * 1.7), x = x0 + mod(rnd(seed * 3 + i) * w + t * vx * (0.4 + d), w), y = y0 + mod(rnd(seed * 5 + i * 2.3) * h + t * vy * (0.4 + d), h);
    glint(ctx, x, y, r * (0.6 + d) * (0.75 + 0.25 * Math.sin(t * 2.2 + i * 3)), col, 0.45 + 0.4 * d, 0);
  }
}
/** a few fixed stars: four-point glints, large and small */
function starField(ctx, seed, n, x0, y0, w, h, col = WHITE) {
  for (let i = 0; i < n; i++) {
    const big = rnd(seed * 5 + i * 3) < 0.22;
    glint(ctx, x0 + rnd(seed + i * 1.37) * w, y0 + rnd(seed * 2 + i * 2.11) * h, big ? 9 : 4.5, col, big ? 1 : 0.7, 0);
  }
}
/** a cloud: round lobes stacked in two tiers on a flat base, the lowest part in the shadow tone. Still sections only (it clips). */
function cloudStack(ctx, x, y, w, h, col, sh, seed, inkW = 0) {
  const n = 3 + Math.floor(rnd(seed) * 2), cs = [];
  for (let i = 0; i < n; i++) { const u = (i + 0.5) / n, r = h * (0.36 + 0.2 * Math.sin(u * Math.PI) + 0.08 * rnd(seed + i * 3.1)); cs.push([x - w / 2 + u * w, y - r * 0.35, r]); }
  for (let i = 0; i < n - 2; i++) { const u = (i + 1 + 0.3 * rnd(seed + i * 9.7)) / (n - 1), r = h * (0.3 + 0.1 * rnd(seed * 3 + i)); cs.push([x - w / 2 + u * w, y - h * 0.62, r]); }
  const path = (c) => { for (const [cx, cy, r] of cs) { c.moveTo(cx + r, cy); c.arc(cx, cy, r, 0, TAU); c.closePath(); } };
  ctx.save();
  ctx.beginPath(); ctx.rect(x - w, y - h * 3, w * 2, h * 3); ctx.clip();
  if (inkW > 0) { ink(ctx, inkW * 2); ctx.beginPath(); path(ctx); ctx.stroke(); }
  ctx.beginPath(); path(ctx); ctx.fillStyle = col; ctx.fill();
  ctx.clip();
  rect(ctx, x - w, y - h * 0.2, w * 2, h * 0.2, sh);
  ctx.restore();
  if (inkW > 0) seg(ctx, x - w / 2 - h * 0.1, y, x + w / 2 + h * 0.1, y, INK, inkW);
}
/** a hanging lamp's shade, seen from the side: (x, y) is the middle of its open mouth */
function lampShade(ctx, x, y, s, col, L, topY) {
  seg(ctx, x, topY, x, y - s * 0.6, INK, Math.max(II, s * 0.07));
  sil(ctx, pP([[x - s, y], [x - s * 0.34, y - s * 0.62], [x + s * 0.34, y - s * 0.62], [x + s, y]]), col, L, 0, IW);
  flat(ctx, pE(x, y, s * 0.94, s * 0.16), L.core, II);
}

// ───────────────────────── chapter 3: Halcyon Reach ─────────────────────────
/** Halcyon's emblem: the plumb-weight, a bob hanging true on its line */
function plumbWeight(ctx, x, y, s, col) {
  rect(ctx, x - s * 0.5, y - s * 1.6, s, s * 0.12, col);
  seg(ctx, x, y - s * 1.55, x, y - s * 0.45, col, Math.max(1.5, s * 0.09));
  poly(ctx, [[x - s * 0.15, y - s * 0.52], [x + s * 0.15, y - s * 0.52], [x + s * 0.15, y - s * 0.36], [x + s * 0.42, y - s * 0.2], [x + s * 0.42, y + s * 0.12], [x, y + s], [x - s * 0.42, y + s * 0.12], [x - s * 0.42, y - s * 0.2], [x - s * 0.15, y - s * 0.36]], col);
}
/** a banner standing straight out in the wind, in two hard tones: (x, y) is the top of the hoist */
function banner(ctx, x, y, w, h, t, col, colSh, emblem) {
  const N = 12, off = (u, k) => Math.sin(u * 7 - t * 5.2 + k) * 9 * u + Math.sin(u * 15 - t * 8) * 3 * u;
  const top = (u) => y + off(u, 0) + u * 8, bot = (u) => y + h + off(u, 0.5) + u * 4;
  ctx.beginPath(); ctx.moveTo(x, top(0));
  for (let i = 1; i <= N; i++) ctx.lineTo(x + (i / N) * w, top(i / N));
  for (let i = N; i >= 0; i--) ctx.lineTo(x + (i / N) * w, bot(i / N));
  ctx.closePath();
  ink(ctx, IW * 2); ctx.stroke(); ctx.fillStyle = col; ctx.fill();
  ctx.fillStyle = colSh; ctx.beginPath();
  for (let i = 0; i < N; i++) {
    const u0 = i / N, u1 = (i + 1) / N;
    if (Math.sin(u0 * 7 - t * 5.2 + 1.2) > -0.1) continue;       // only the folds that have turned from the light
    ctx.moveTo(x + u0 * w, top(u0)); ctx.lineTo(x + u1 * w, top(u1)); ctx.lineTo(x + u1 * w, bot(u1)); ctx.lineTo(x + u0 * w, bot(u0)); ctx.closePath();
  }
  ctx.fill();
  emblem(x + w * 0.46, y + h * 0.56 + off(0.46, 0.25) + 3);
}

// ── academy-yard: the parade ground, under the plumb-weight banner. Key: a hard white morning sun, high over the roofline ──
const L_YARD = light('#fff0c8', -Math.PI * 0.56, { depth: 0.7, tint: '#27306a', amb: '#46526a' });
def('academy-yard', L_YARD, (ctx, t, px) => {
  const L = L_YARD, sx = 792, sy = 88;
  ctx = S(0.15);
  bands(ctx, X0 - 60, -200, XW + 120, 680, ['#2f4a7a', '#5479a4', '#8fb1c6', '#ecdfb8'], [0.38, 0.62, 0.82, 1]);
  rings(ctx, sx, sy, 250, [alpha('#fff0c8', 0.14), alpha('#fff0c8', 0.2), alpha('#fff0c8', 0.42), '#fffdf0'], [1, 0.66, 0.36, 0.15]);
  cloudStack(ctx, 560, 150, 200, 50, '#ebe6d4', '#8fa6c4', 3);
  cloudStack(ctx, 1030, 70, 160, 42, '#cfd8dc', '#7f98bc', 8);
  cloudStack(ctx, 236, 196, 260, 62, '#ebe6d4', '#8fa6c4', 5);
  cloudStack(ctx, -40, 96, 190, 48, '#cfd8dc', '#7f98bc', 11);
  cloudStack(ctx, 1320, 150, 240, 60, '#ebe6d4', '#8fa6c4', 14);
  // the sea off the edge of the rock, and the mole the ferry leaves from
  const ex = 250;
  waves(ctx, X0 - 60, 404, ex - X0 + 60, 100, { len: 76, amp: 7, col: '#3c6f92', L });
  waves(ctx, X0 - 60, 436, ex - X0 + 60, 60, { len: 96, amp: 9, phase: 0.4, col: '#2c557c', L });
  flat(ctx, pP([[ex, 442], [ex - 330, 430], [ex - 338, 416], [ex, 414]]), '#2a3158', II);
  seg(ctx, ex - 330, 420, ex - 330, 386, INK, 5); bloom(ctx, ex - 330, 382, 30, PALETTE.lantern, 1, WHITE);
  // the Academy: grey and square. The sun is behind its roofline, so the face we see is the shadow tone
  const ax = 276, tx = 930;
  flat(ctx, pP([[ax, 186], [ax - 30, 204], [ax - 30, 480], [ax, 480]]), '#cfd0c2', II);
  rect(ctx, ax, 186, 1500, 300, '#7c88a6'); rect(ctx, ax, 296, 1500, 6, '#5b6690');
  for (let r = 0; r < 3; r++) for (let c = 0; c < 28; c++) {
    const wx = ax + 26 + c * 52, wy = 212 + r * 92;
    if (wx > tx - 96 && wx < tx + 70) continue;
    rect(ctx, wx, wy, 26, 50, '#3c477a'); rect(ctx, wx + 22, wy, 4, 50, '#cfd0c2'); rect(ctx, wx, wy + 46, 26, 4, '#cfd0c2');
  }
  rect(ctx, ax - 8, 176, 1520, 12, '#ece6cc'); seg(ctx, ax - 8, 189, ax + 1512, 189, INK, II); seg(ctx, ax - 8, 176, ax + 1512, 176, INK, IW);
  // the gate tower, its clock, and one lamp in a window at an hour when no lamp is needed
  cel(ctx, pR(tx - 62, 48, 124, 440), '#b1b8c0', L, { shadow: pR(tx + 4, 48, 60, 440), ink: IW, rim: 6 });
  for (let i = 0; i < 4; i++) flat(ctx, pR(tx - 70 + i * 38.6, 20, 24, 30), i > 1 ? shadowOf('#b1b8c0', L) : '#b1b8c0', IW);
  flat(ctx, pR(tx - 72, 42, 144, 14), '#cfd0c2', IW);
  flat(ctx, pE(tx, 112, 35, 35), INK, 0); flat(ctx, pE(tx, 112, 29, 29), PALETTE.cream, 0);
  for (let i = 0; i < 4; i++) seg(ctx, tx + Math.cos(i * 1.5708) * 20, 112 + Math.sin(i * 1.5708) * 20, tx + Math.cos(i * 1.5708) * 26, 112 + Math.sin(i * 1.5708) * 26, INK, 3);
  seg(ctx, tx, 112, tx + 15, 103, INK, 4.5); seg(ctx, tx, 112, tx - 5, 90, INK, 3);
  flat(ctx, pArch(tx - 14, 170, 28, 46), PALETTE.lantern, II * 1.5); bloom(ctx, tx, 190, 52, PALETTE.lantern, 0.9, WHITE);
  plumbWeight(ctx, tx, 306, 30, PALETTE.brass);
  flat(ctx, pArch(tx - 40, 380, 80, 108), '#1c1c4c', IW);
  flat(ctx, pP([[tx + 62, 190], [tx + 250, 190], [tx + 480, 486], [tx + 62, 486]]), alpha(L.shadowTint, 0.42), 0);   // the tower's shadow down the wall
  shaft(ctx, sx, sy, 1.9, 900, 0.2, '#fff0c8', 0.2); shaft(ctx, sx, sy, 2.45, 1000, 0.16, '#fff0c8', 0.18);
  rect(ctx, 436, -200, 9, 690, INK); rect(ctx, 442, -200, 3, 690, L.rim);                                           // the pole
  ctx = A();
  const o = px * 0.15;
  banner(ctx, 445 + o, 60, 270, 120, t, '#2f4f7c', '#1b2c5a', (bx, by) => plumbWeight(ctx, bx, by, 32, PALETTE.brass));
  ink(ctx, II * 1.4);
  ctx.beginPath();
  for (let i = 0; i < 3; i++) { // gulls
    const x = 330 + mod(i * 233 + t * (18 + i * 5), 760) + o, y = 232 - i * 34 + Math.sin(t * 0.8 + i) * 10, w = 11 + i * 2, fl = Math.sin(t * 5 + i * 2) * 5;
    ctx.moveTo(x - w, y - fl); ctx.quadraticCurveTo(x - w * 0.4, y - 5, x, y); ctx.quadraticCurveTo(x + w * 0.4, y - 5, x + w, y - fl);
  }
  ctx.stroke();
  spark(ctx, sx + o, sy, 44, t, 1);
  gust(ctx, mod(t * 60, 1900) - 300 + o, 262, 150, 18, 1, 6, '#f6f1e2', II);   // what is left of the fog, going over the wall
  // the ground, and two thousand people on it, each throwing the same shadow
  ctx = S(0.45);
  rect(ctx, X0 - 60, 470, XW + 120, 560, '#d2cab0');
  for (let i = -9; i <= 9; i += 2) poly(ctx, [[640 + i * 40, 470], [640 + (i + 1) * 40, 470], [640 + (i + 1) * 260, 1000], [640 + i * 260, 1000]], '#c4bca2');
  seg(ctx, X0 - 60, 470, X0 + XW + 60, 470, INK, IW);
  for (let k = 0; k < 5; k++) {
    const u = k / 4, y = 448 + u * u * 70 + k * 6, s = 7 + u * 16, gap = 46 + u * 110, n = Math.round(26 - u * 14), list = [];
    for (const sd of [-1, 1]) for (let i = 0; i < n; i++) list.push([640 + sd * (gap + i * s * 2.5), y, s]);
    busts(ctx, list.map((p) => [p[0] + s * 0.5, p[1] + s * 0.8, s]), alpha(L.shadowTint, 0.4), L, 0, 0);
    busts(ctx, list, '#27384f', L, 1.4 + u * 2.6, u > 0.6 ? II : 0);
    ctx.fillStyle = '#141d3a'; ctx.beginPath();
    for (const [x, yy] of list) { ctx.rect(x - s * 0.52, yy - s * 0.5, s * 1.04, s * 0.2); ctx.rect(x - s * 0.38, yy - s * 0.78, s * 0.76, s * 0.3); }
    ctx.fill();
  }
});

// ── dormitory: sixty iron bunks. Key: one gas lamp over the aisle, turned low ──
const L_DORM = light('#ff9d3a', -Math.PI / 2, { depth: 0.9, tint: '#1a1450', amb: '#1e1a3c' });
def('dormitory', L_DORM, (ctx, t, px) => {
  const L = L_DORM, vx = 640, vy = 232, D = 5.2, lx = 640, ly = 118;
  const pr = (X, Y, d) => [vx + X / d, vy + Y / d];
  const q = (a, b, c, e, col, w = 0) => flat(ctx, pP([a, b, c, e]), col, w);
  ctx = S(0.3);
  fillAll(ctx, '#0e0b2a');
  // the far wall, with the one tall window
  const [fx0, fy0] = pr(-720, -340, D), [fx1, fy1] = pr(720, 420, D);
  rect(ctx, fx0, fy0, fx1 - fx0, fy1 - fy0, '#2a2a6c');
  const [wx0, wy0] = pr(-190, -280, D), [wx1, wy1] = pr(190, 130, D);
  bands(ctx, wx0, wy0, wx1 - wx0, wy1 - wy0, ['#27408c', '#4a74c4', '#9cc0ee']);
  for (let i = 1; i < 3; i++) seg(ctx, lerp(wx0, wx1, i / 3), wy0, lerp(wx0, wx1, i / 3), wy1, INK, II);
  seg(ctx, wx0, lerp(wy0, wy1, 0.4), wx1, lerp(wy0, wy1, 0.4), INK, II);
  outline(ctx, pR(wx0, wy0, wx1 - wx0, wy1 - wy0), IW);
  // walls, ceiling, floor
  for (const s of [-1, 1]) {
    q(pr(s * 720, -340, 0.6), pr(s * 720, -340, D), pr(s * 720, 420, D), pr(s * 720, 420, 0.6), '#1b1a4c');
    q(pr(s * 720, 150, 0.6), pr(s * 720, 150, D), pr(s * 720, 420, D), pr(s * 720, 420, 0.6), '#141238');
    const a = pr(s * 720, 150, 0.6), b = pr(s * 720, 150, D); seg(ctx, a[0], a[1], b[0], b[1], INK, II);
  }
  q(pr(-720, -340, 0.6), pr(720, -340, 0.6), pr(720, -340, D), pr(-720, -340, D), '#0e0b2a');
  q(pr(-720, 420, D), pr(720, 420, D), pr(720, 420, 0.6), pr(-720, 420, 0.6), '#2c2250');
  q(pr(-190, 420, D), pr(190, 420, D), pr(190, 420, 0.6), pr(-190, 420, 0.6), '#8a4a48');     // where the lamp reaches the boards
  q(pr(-90, 420, D), pr(90, 420, D), pr(90, 420, 0.6), pr(-90, 420, 0.6), '#d98444');
  for (let i = -5; i <= 5; i++) { const a = pr(i * 130, 420, D), b = pr(i * 130, 420, 0.6); seg(ctx, a[0], a[1], b[0], b[1], INK, II); }
  outline(ctx, pR(fx0, fy0, fx1 - fx0, fy1 - fy0), II);
  // bunks, far to near: head to the wall, foot to the aisle, a number on every one
  const blanket = '#46568f';
  for (let i = 6; i >= 0; i--) {
    const d = 0.92 + i * 0.6, dd = 0.36, hz = (c) => blend(c, '#2a2a6c', (i / 7) * 0.8);
    for (const s of [-1, 1]) {
      const A1 = s * 250, B = s * 720, lw = Math.max(II, 12 / d);
      { const a = pr(A1, -150, d + dd), b = pr(A1, 420, d + dd); seg(ctx, a[0], a[1], b[0], b[1], INK, lw * 0.8); }
      // the upper bunk is above the eye: its edge, and the dark underneath it
      q(pr(A1, -30, d), pr(B, -30, d), pr(B, -30, d + dd), pr(A1, -30, d + dd), hz('#121036'));
      q(pr(A1, -76, d), pr(B, -76, d), pr(B, -30, d), pr(A1, -30, d), hz(blanket), II);
      q(pr(A1, -76, d), pr(B, -76, d), pr(B, -68, d), pr(A1, -68, d), hz(hiOf(blanket, L)));
      q(pr(A1, -76, d), pr(A1 + s * 120, -76, d), pr(A1 + s * 120, -56, d), pr(A1, -56, d), hz(PALETTE.cream));
      // the lower one is below it: the made bed from above, lit only at the aisle end
      q(pr(A1, 150, d), pr(B, 150, d), pr(B, 150, d + dd), pr(A1, 150, d + dd), hz(shadowOf(blanket, L)));
      q(pr(A1, 150, d), pr(A1 + s * 150, 150, d), pr(A1 + s * 110, 150, d + dd), pr(A1, 150, d + dd), hz(hiOf(blanket, L)));
      q(pr(A1, 150, d), pr(B, 150, d), pr(B, 194, d), pr(A1, 194, d), hz(blanket), II);
      q(pr(A1, 154, d), pr(A1 + s * 120, 154, d), pr(A1 + s * 120, 172, d), pr(A1, 172, d), hz(PALETTE.cream));
      q(pr(A1 + s * 30, 330, d), pr(A1 + s * 230, 330, d), pr(A1 + s * 230, 420, d), pr(A1 + s * 30, 420, d), hz('#5a3040'), II);   // kit box
      // the foot of the frame, on the aisle: iron, with the lamp along its inner edge
      const a = pr(A1, -150, d), b = pr(A1, 420, d), c = pr(A1, -150, d + dd);
      seg(ctx, a[0], a[1], b[0], b[1], INK, lw); seg(ctx, a[0] - s * lw * 0.34, a[1], b[0] - s * lw * 0.34, b[1], hz(L.col), lw * 0.3);
      seg(ctx, a[0], a[1], c[0], c[1], INK, lw * 0.8);
      if (i < 2) {
        const p = pr(A1, -112, d), r = 22 / d;
        flat(ctx, pE(p[0], p[1], r, r), PALETTE.brass, II * 1.5);
        ctx.fillStyle = INK; ctx.font = `700 ${Math.round(27 / d)}px ${FONT_SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(19 + i * 2 + (s > 0 ? 0 : 1)), p[0], p[1] + 1); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      }
      if (i === 0 && s > 0) { // bed nineteen: what is owed, scratched where an inspection does not look
        for (let k = 0; k < 30; k++) {
          const g = Math.floor(k / 5), X = A1 + 44 + g * 56 + (k % 5) * 9, a2 = k % 5 === 4 ? pr(X - 40, 232, d) : pr(X, 206, d), b2 = k % 5 === 4 ? pr(X + 3, 210, d) : pr(X + 2, 236, d);
          seg(ctx, a2[0], a2[1], b2[0], b2[1], PALETTE.cream, 2.4);
        }
      }
    }
  }
  // the gas lamp, and the cone it throws down the aisle
  shaft(ctx, lx, ly, Math.PI / 2, 760, 1.15, L.col, 0.2);
  lampShade(ctx, lx, ly, 52, '#2c2670', L, -200);
  source(ctx, lx, ly + 8, 190, L);
  ctx = A();
  spark(ctx, lx + px * 0.3, ly + 8, 36, t, 2);
}, (ctx, t, px) => {
  dust(ctx, 207, 8, t, 480 + px, 160, 320, 420, L_DORM.rim, 7, 4, 9);
});

// ── proctor-office: the top of the east stair. Key: the east window, cold and from the right ──
const L_PROC = light('#d6ebff', -Math.PI * 0.12, { depth: 0.85, tint: '#0c1840', amb: '#16222e' });
def('proctor-office', L_PROC, (ctx, t, px) => {
  const L = L_PROC, wx = 800, wy = 40, ww = 190, wh = 262;
  ctx = S(0.2);
  fillAll(ctx, '#123034');
  rect(ctx, X0 - 60, 330, XW + 120, 160, '#0c1e2a'); seg(ctx, X0 - 60, 330, X0 + XW + 60, 330, INK, II);
  rect(ctx, X0 - 60, 484, XW + 120, 520, '#0e1228'); seg(ctx, X0 - 60, 484, X0 + XW + 60, 484, INK, IW);
  // the east window: the yard below, the mole, the lane going out
  bands(ctx, wx, wy, ww, wh, ['#7fb0e6', '#b9d8f4', '#f6fcff'], [0.3, 0.6, 1]);
  rect(ctx, wx, wy + wh - 62, ww, 26, '#4a7fae'); rect(ctx, wx, wy + wh - 62, ww, 4, WHITE);
  poly(ctx, [[wx, wy + wh], [wx, wy + wh - 38], [wx + ww, wy + wh - 46], [wx + ww, wy + wh]], '#8ea0b4');
  poly(ctx, [[wx + 70, wy + wh - 40], [wx + ww, wy + wh - 70], [wx + ww, wy + wh - 62], [wx + 74, wy + wh - 34]], '#2a3158');
  rect(ctx, wx + 44, wy + wh - 120, 4, 90, INK); poly(ctx, [[wx + 48, wy + wh - 120], [wx + 84, wy + wh - 112], [wx + 48, wy + wh - 100]], '#2f4f7c');
  // what it lets in: a hard shaft down to the boards, and four panes laid on the floor
  poly(ctx, [[wx, wy], [wx + ww, wy], [wx + ww - 470, 990], [wx - 760, 990]], alpha(L.col, 0.1));
  poly(ctx, [[wx + 30, wy + wh * 0.4], [wx + ww - 20, wy + wh * 0.4], [wx + ww - 470, 990], [wx - 600, 990]], alpha(L.col, 0.09));
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) poly(ctx, [[wx - 250 + i * 150 - j * 120, 500 + j * 46], [wx - 250 + i * 150 + 130 - j * 120, 500 + j * 46], [wx - 250 + i * 150 + 20 - j * 120, 540 + j * 46], [wx - 250 + i * 150 - 110 - j * 120, 540 + j * 46]], alpha(L.col, 0.32));
  bloom(ctx, wx + ww / 2, wy + wh * 0.6, 250, L.col, 0.6);
  seg(ctx, wx + ww / 2, wy, wx + ww / 2, wy + wh, INK, IW * 1.3); seg(ctx, wx, wy + wh * 0.46, wx + ww, wy + wh * 0.46, INK, IW * 1.3);
  outline(ctx, pR(wx, wy, ww, wh), IW * 1.8);
  flat(ctx, pR(wx - 16, wy + wh, ww + 32, 14), '#2a5a50', II); rect(ctx, wx - 14, wy + wh + 1, ww + 28, 4, L.rim);
  // every class she has passed out, in rows. One frame has been taken down.
  for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) {
    const x = 414 - 3 * 54 + c * 54, y = 44 + r * 70;
    if (r === 1 && c === 4) { outline(ctx, pR(x + 3, y + 3, 38, 50), II, '#1c4a48'); circ(ctx, x + 22, y - 3, 3, INK); continue; }
    flat(ctx, pR(x, y, 44, 56), '#d9cba0', IW); rect(ctx, x + 40, y + 2, 3, 52, L.rim);
    ctx.fillStyle = '#3a2c4a'; ctx.beginPath();
    for (let k = 0; k < 3; k++) for (let j = 0; j < 4 - (k % 2); j++) { const hx = x + 9 + j * 9 + (k % 2) * 4.5, hy = y + 16 + k * 13; ctx.moveTo(hx + 3, hy); ctx.arc(hx, hy, 3, 0, TAU); ctx.rect(hx - 3.5, hy + 3, 7, 6); }
    ctx.fill();
  }
  // cadet files, by year
  for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
    const x = 90 + c * 84, y = 344 + r * 46;
    flat(ctx, pR(x, y, 80, 42), '#1a3a40', II); rect(ctx, x + 26, y + 9, 28, 12, PALETTE.cream); rect(ctx, x + 32, y + 28, 16, 5, PALETTE.brass);
  }
  // the regulator clock
  const kx = 610;
  cel(ctx, pR(kx - 36, 30, 72, 262), '#4a2c3c', L, { shadow: pR(kx - 36, 30, 40, 262), ink: IW, rim: 5 });
  flat(ctx, pE(kx, 78, 26, 26), PALETTE.cream, II * 1.5); seg(ctx, kx, 78, kx + 12, 70, INK, 3.5); seg(ctx, kx, 78, kx - 3, 60, INK, 2.5);
  rect(ctx, kx - 24, 116, 48, 164, '#1c1230');
  // the Line: her end of it
  const sx = 716;
  flat(ctx, pR(sx - 44, 300, 88, 190), '#0c1e2a', II);
  cel(ctx, pR(sx - 58, 196, 116, 104), '#5a3a2a', L, { shadow: pR(sx - 58, 196, 50, 104), ink: IW, rim: 4 });
  flat(ctx, pE(sx - 16, 244, 31, 31), '#04201f', 0); bloom(ctx, sx - 16, 244, 50, '#5fe0c8', 0.8);
  outline(ctx, pE(sx - 16, 244, 31, 31), II * 1.6, PALETTE.brass);
  for (let i = 0; i < 3; i++) flat(ctx, pE(sx + 36, 220 + i * 24, 7, 7), PALETTE.brass, II);
  plumbWeight(ctx, sx, 150, 22, PALETTE.brass);
  ctx = A();
  const o = px * 0.2;
  { const a = Math.sin(t * Math.PI) * 0.2, bx = kx + o + Math.sin(a) * 118, by = 138 + Math.cos(a) * 118;
    seg(ctx, kx + o, 122, bx, by, PALETTE.brass, 3.5); flat(ctx, pE(bx, by, 13, 13), PALETTE.brass, II); circ(ctx, bx + 4, by - 4, 3.5, WHITE); }
  waveform(ctx, sx - 42 + o, sx + 10 + o, 244, 15, 0.3 + 0.2 * Math.sin(t * 0.9), t * 1000, '#7ff5dc', 2.6);
  if (mod(t, 1.2) < 0.7) circ(ctx, sx + 36 + o, 220, 4, PALETTE.crimson);
  // her desk: a green-shaded lamp she has not lit, and nothing on it that is not square to the edge
  ctx = S(0.9);
  rect(ctx, X0 - 60, 600, XW + 120, 420, '#2a1626'); rect(ctx, X0 - 60, 592, XW + 120, 12, '#7a4a3a'); rect(ctx, X0 - 60, 592, XW + 120, 4, L.rim);
  seg(ctx, X0 - 60, 604, X0 + XW + 60, 604, INK, II);
  { const lx = 330, dy = 592;
    seg(ctx, lx, dy, lx, dy - 86, PALETTE.brass, 6); flat(ctx, pR(lx - 30, dy - 9, 60, 9), PALETTE.brass, II);
    cel(ctx, (c) => { c.moveTo(lx - 60, dy - 84); c.quadraticCurveTo(lx, dy - 140, lx + 60, dy - 84); c.closePath(); }, '#1f8a66', L, { off: 22, ink: IW, rim: 5 }); }
  flat(ctx, pP([[1010, 590], [1150, 590], [1164, 574], [1024, 574]]), PALETTE.cream, II);
  flat(ctx, pR(1190, 562, 60, 30), '#1a3a40', II);
}, (ctx, t, px) => {
  dust(ctx, 213, 7, t, 560 + px, 80, 420, 420, L_PROC.rim, 6, -5, 7);
});

// ── hearing-hall: a company auditorium, every seat filled, nobody speaking. Key: the house lamp, left up ──
const L_HALL = light('#ffe2a8', -Math.PI / 2, { depth: 0.85, tint: '#241046', amb: '#221a34' });
def('hearing-hall', L_HALL, (ctx, t, px) => {
  const L = L_HALL, lx = 640, ly = 96, gy = 200;
  const SKIN = ['#d9a57c', '#a8744e'], HAIR = [INK, '#5a3424', '#b9b4c4'];
  ctx = S(0.3);
  fillAll(ctx, '#140e2a');
  rect(ctx, X0 - 60, gy, XW + 120, 110, '#2a1840');
  // company colours either side of the lamp
  for (const x of [400, 880]) {
    const sd = x < lx ? -1 : 1;
    flat(ctx, pP([[x - 46, -40], [x + 46, -40], [x + 46, 136], [x, 118], [x - 46, 136]]), '#2f4f7c', IW);
    poly(ctx, [[x, -38], [x + sd * 44, -38], [x + sd * 44, 132], [x, 116]], '#1b2c5a');
    plumbWeight(ctx, x, 62, 24, PALETTE.brass);
  }
  // the gallery, where children are put
  rect(ctx, X0 - 60, gy - 96, XW + 120, 96, '#1a1236');
  for (let r = 0; r < 3; r++) {
    const y = gy - 62 + r * 22, s = 12 + r * 1.5, n = Math.floor((XW + 120) / (s * 2.6)), list = [];
    for (let i = 0; i < n; i++) list.push([X0 - 40 + (i + (r % 2) * 0.5) * s * 2.6, y, s]);
    busts(ctx, list, r === 2 ? '#2f4f7c' : '#243c6c', L, 2.2);
    ctx.fillStyle = SKIN[r % 2]; ctx.beginPath(); for (const [x, yy] of list) { ctx.moveTo(x + s * 0.4, yy); ctx.arc(x, yy, s * 0.4, 0, TAU); } ctx.fill();
    ctx.fillStyle = '#141d3a'; ctx.beginPath(); for (const [x, yy] of list) ctx.rect(x - s * 0.48, yy - s * 0.5, s * 0.96, s * 0.34); ctx.fill();
  }
  rect(ctx, X0 - 60, gy, XW + 120, 46, '#5a1f38'); rect(ctx, X0 - 60, gy - 7, XW + 120, 9, PALETTE.brass); rect(ctx, X0 - 60, gy - 7, XW + 120, 3, WHITE);
  seg(ctx, X0 - 60, gy + 2, X0 + XW + 60, gy + 2, INK, II); seg(ctx, X0 - 60, gy + 46, X0 + XW + 60, gy + 46, INK, IW);
  for (let x = X0 + 20; x < X0 + XW; x += 130) outline(ctx, pR(x + 12, gy + 11, 106, 24), II, '#8a3a50');
  rect(ctx, X0 - 60, gy + 48, XW + 120, 30, '#0e0b2a');                                           // the shadow it throws on the back wall
  for (let x = X0 + 110; x < X0 + XW; x += 300) flat(ctx, pR(x, gy + 46, 20, 110), '#1a1236', II);
  // the back wall: three doors, shut on the minute
  for (let i = 0; i < 3; i++) { const x = 250 + i * 390; flat(ctx, pR(x - 40, 262, 80, 60), '#0e0b2a', II); rect(ctx, x - 20, 244, 40, 11, '#8fe0a0'); }
  // two thousand people, in rows
  for (let r = 0; r < 9; r++) {
    const u = r / 8, y = lerp(296, 474, Math.pow(u, 1.2)), s = lerp(10, 28, u), n = Math.round(lerp(64, 24, u)), span = XW + 200;
    rect(ctx, X0 - 60, y + s * 1.5, XW + 120, s * 3.4, r % 2 ? '#521b34' : '#461630'); rect(ctx, X0 - 60, y + s * 1.5, XW + 120, Math.max(2, s * 0.16), '#a4505a');
    const coats = [[], []], heads = [[], []], hair = [[], [], []];
    for (let i = 0; i < n; i++) {
      const x = X0 - 100 + (i + (r % 2) * 0.5) * (span / n);
      if (Math.abs(x - (640 - 250 - u * 170)) < s * 1.5 || Math.abs(x - (640 + 250 + u * 170)) < s * 1.5) continue;   // the aisles
      const h = rnd(i * 3.7 + r * 17), p = [x, y + (rnd(i * 1.3 + r * 7) - 0.5) * s * 0.3, s];
      coats[h > 0.7 ? 1 : 0].push(p); heads[Math.floor(rnd(i * 9.1 + r * 3) * 2)].push(p); hair[Math.floor(rnd(i * 5.3 + r * 11) * 3)].push(p);
    }
    busts(ctx, coats[0], blend('#27384f', '#140e2a', 0.35 - u * 0.35), L, 1.4 + u * 2.4, u > 0.7 ? II : 0);
    busts(ctx, coats[1], blend('#5a5674', '#140e2a', 0.35 - u * 0.35), L, 1.4 + u * 2.4, u > 0.7 ? II : 0);
    for (let k = 0; k < 2; k++) { ctx.fillStyle = blend(SKIN[k], '#140e2a', 0.3 - u * 0.3); ctx.beginPath(); for (const [x, yy] of heads[k]) { ctx.moveTo(x + s * 0.42, yy); ctx.arc(x, yy, s * 0.42, 0, TAU); } ctx.fill(); }
    for (let k = 0; k < 3; k++) { ctx.fillStyle = blend(HAIR[k], '#140e2a', 0.2 - u * 0.2); ctx.beginPath(); for (const [x, yy] of hair[k]) { ctx.moveTo(x - s * 0.47, yy - s * 0.04); ctx.arc(x, yy - s * 0.06, s * 0.47, Math.PI, TAU); ctx.closePath(); } ctx.fill(); }
    if (s > 17) { ctx.fillStyle = INK; ctx.beginPath(); for (const k of [0, 1]) for (const [x, yy] of heads[k]) { ctx.rect(x - s * 0.26, yy + s * 0.08, s * 0.17, s * 0.06); ctx.rect(x + s * 0.09, yy + s * 0.08, s * 0.17, s * 0.06); } ctx.fill(); }   // eyes, down
  }
  // the lip of the stage she is standing on
  rect(ctx, X0 - 60, 646, XW + 120, 400, '#34182c'); rect(ctx, X0 - 60, 638, XW + 120, 10, '#c98a5a'); seg(ctx, X0 - 60, 649, X0 + XW + 60, 649, INK, II);
  // the house lamp
  shaft(ctx, lx, ly, Math.PI / 2, 800, 1.5, L.col, 0.13);
  seg(ctx, lx, -200, lx, ly - 34, INK, 6); flat(ctx, pR(lx - 16, ly - 40, 32, 14), PALETTE.brass, II);
  source(ctx, lx, ly, 230, L);
  flat(ctx, pE(lx, ly, 27, 27), L.core, IW);
  ctx = A();
  spark(ctx, lx + px * 0.3, ly, 46, t, 3);
}, (ctx, t, px) => {
  dust(ctx, 217, 8, t, 360 + px, 120, 560, 400, L_HALL.rim, 7, 3, 6);
});

// ── underwriting-floor: a night-lit hall of ledgers and pneumatic tubes. Key: the one green-shaded lamp left burning ──
const L_UNDER = light('#c9f5b4', -Math.PI * 0.36, { depth: 0.9, tint: '#06102c', amb: '#0e2024' });
/** a run of brass tube along a polyline */
function tube(ctx, pts, w, L) {
  const path = () => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); };
  ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
  ctx.strokeStyle = INK; ctx.lineWidth = w + IW * 1.6; path(); ctx.stroke();
  ctx.strokeStyle = shadowOf(PALETTE.brass, L); ctx.lineWidth = w; path(); ctx.stroke();
  ctx.save(); ctx.translate(-w * 0.16, -w * 0.16);
  ctx.strokeStyle = PALETTE.brass; ctx.lineWidth = w * 0.56; path(); ctx.stroke();
  ctx.translate(-w * 0.12, -w * 0.12); ctx.strokeStyle = WHITE; ctx.lineWidth = w * 0.14; path(); ctx.stroke();
  ctx.restore();
  for (let i = 1; i < pts.length - 1; i++) flat(ctx, pE(pts[i][0], pts[i][1], w * 0.82, w * 0.82), PALETTE.brass, II);   // collars at the bends
}
def('underwriting-floor', L_UNDER, (ctx, t, px) => {
  const L = L_UNDER, lx = 806, ly = 152;
  ctx = S(0.2);
  fillAll(ctx, '#071418');
  // the wall of drawers, lettered: every island, every indenture. Lit only where the lamp's cone crosses it
  const drawers = (lit) => {
    for (let c = -5; c < 29; c++) for (let r = 0; r < 8; r++) {
      const x = c * 66, y = 128 + r * 44, k = rnd(c * 7 + r) < 0.5;
      rect(ctx, x + 2, y + 2, 62, 40, lit ? (k ? '#2f7a5c' : '#3f8a66') : (k ? '#0f2a2c' : '#123236'));
      rect(ctx, x + 20, y + 9, 26, 11, lit ? PALETTE.cream : '#2c5552'); rect(ctx, x + 27, y + 27, 12, 4, lit ? PALETTE.brass : '#5a4a1e');
    }
  };
  drawers(false);
  ctx.save(); ctx.beginPath(); ctx.moveTo(lx - 30, ly); ctx.lineTo(lx + 30, ly); ctx.lineTo(lx + 330, 480); ctx.lineTo(lx - 330, 480); ctx.clip(); rect(ctx, lx - 340, ly, 680, 340, INK); drawers(true); ctx.restore();
  rect(ctx, X0 - 60, 96, XW + 120, 30, '#0a1e22'); seg(ctx, X0 - 60, 127, X0 + XW + 60, 127, INK, II);
  ctx.fillStyle = PALETTE.brass; ctx.font = `700 20px ${FONT_SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  for (let c = 0; c < 23; c++) ctx.fillText('ABCDEFGHIJKLMNOPQRSTUVW'[c], c * 66 - 132 + 33, 119);
  ctx.textAlign = 'left';
  rect(ctx, X0 - 60, 480, XW + 120, 520, '#0a1a20'); seg(ctx, X0 - 60, 480, X0 + XW + 60, 480, INK, IW);
  // the tubes: paper going between people who will never meet
  tube(ctx, [[X0 - 60, 38], [X0 + XW + 60, 38]], 13, L);
  tube(ctx, [[X0 - 60, 62], [404, 62], [404, 392]], 13, L);
  tube(ctx, [[X0 + XW + 60, 84], [960, 84], [960, 392]], 13, L);
  for (const x of [404, 960]) flat(ctx, pR(x - 24, 388, 48, 30), shadowOf(PALETTE.brass, L), IW);
  // the night clerk under the lamp, who does not look up
  shaft(ctx, lx, ly, Math.PI / 2, 520, 1.2, L.col, 0.16);
  flat(ctx, pP([[lx - 96, 480], [lx - 96, 372], [lx + 96, 372], [lx + 96, 480]]), '#2a1c34', IW);
  flat(ctx, pP([[lx - 104, 372], [lx + 104, 372], [lx + 84, 336], [lx - 84, 336]]), '#4a2c3c', IW);
  flat(ctx, pP([[lx - 62, 366], [lx - 2, 368], [lx - 2, 342], [lx - 54, 340]]), WHITE, II); flat(ctx, pP([[lx - 2, 368], [lx + 58, 366], [lx + 50, 340], [lx - 2, 342]]), PALETTE.cream, II);
  busts(ctx, [[lx + 4, 268, 24]], '#123236', L, 4, IW);
  lampShade(ctx, lx, ly, 54, '#1f8a66', L, -200);
  poly(ctx, [[lx - 46, ly - 8], [lx - 22, ly - 30], [lx - 6, ly - 30], [lx - 18, ly - 8]], '#6fd0a0');
  source(ctx, lx, ly + 8, 190, L);
  ctx = A();
  const o = px * 0.2;
  spark(ctx, lx + o, ly + 8, 34, t, 4);
  { const x = X0 + mod(t * 620, 4200); flat(ctx, pE(x + o, 38, 15, 7), WHITE, II); }                 // a carrier, through in a second
  if (mod(t * 0.7, 3) < 0.25) circ(ctx, 404 + o, 380, 5, PALETTE.crimson);
  // rows of desks, their lamps out
  ctx = S(0.5);
  for (let r = 0; r < 3; r++) {
    const y = 470 + r * r * 24 + r * 30, s = 17 + r * 10, gap = 170 + r * 80;
    for (let i = -2; i < 12; i++) {
      const x = i * gap + (r % 2) * gap * 0.5 - 40;
      flat(ctx, pR(x - gap * 0.36, y, gap * 0.72, s * 4), '#1c1430', II);
      flat(ctx, pP([[x - gap * 0.38, y], [x + gap * 0.38, y], [x + gap * 0.3, y - s * 0.7], [x - gap * 0.3, y - s * 0.7]]), '#2a1c34', II);
      rect(ctx, x - gap * 0.3 + 3, y - s * 0.7, gap * 0.6 - 6, Math.max(2, s * 0.1), '#3f8a66');
      seg(ctx, x + gap * 0.2, y - s * 0.7, x + gap * 0.2, y - s * 1.7, shadowOf(PALETTE.brass, L), Math.max(2.5, s * 0.16));
      sil(ctx, (c) => { c.moveTo(x + gap * 0.2 - s, y - s * 1.6); c.quadraticCurveTo(x + gap * 0.2, y - s * 2.5, x + gap * 0.2 + s, y - s * 1.6); c.closePath(); }, '#0f3a30', L, 2 + r, II);
    }
  }
}, (ctx, t, px) => {
  dust(ctx, 219, 6, t, 620 + px, 180, 380, 300, L_UNDER.rim, 6, 3, 5);
});

// ───────────────────────── chapter 4: dark water ─────────────────────────
/** rain as hard slanted strokes: one path, one stroke */
function rain(ctx, seed, n, t, px, slant, col, lw) {
  ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'butt'; ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const d = rnd(seed + i * 1.7), v = 900 + d * 700, len = 26 + d * 44;
    const y = mod(rnd(seed * 5 + i * 2.3) * 1200 + t * v, 1200) - 200;
    const x = mod(rnd(seed * 3 + i) * 2000 + t * v * slant, 2000) - 360 + px;
    ctx.moveTo(x, y); ctx.lineTo(x + slant * len, y + len);
  }
  ctx.stroke();
}
/** fork lightning: on for two short beats about every seven seconds. Hard on, hard off */
function lightning(t) { const ph = mod(t, 7.3); return ph < 0.1 || (ph > 0.18 && ph < 0.24) ? 1 : 0; }

// ── ferry-storm: the lane closing round the Tallis ferry. Key: the storm lantern on its hook ──
const L_STORM = light(PALETTE.lantern, -Math.PI * 0.6, { depth: 0.9, tint: '#06243a', amb: '#102838' });
def('ferry-storm', L_STORM, (ctx, t, px) => {
  const L = L_STORM, roll = Math.sin(t * 0.9) * 0.03 + Math.sin(t * 0.37) * 0.014, heave = Math.sin(t * 0.7 + 1) * 9, hy = 252;
  ctx = S(0);
  bands(ctx, X0 - 60, -200, XW + 120, hy + 260, ['#080a24', '#0f2248', '#1a4a68', '#49988e'], [0.5, 0.72, 0.9, 1]);
  for (let i = 0; i < 10; i++) circ(ctx, X0 + i * 200 + rnd(i) * 90, -70 + rnd(i * 3) * 60, 130 + rnd(i * 7) * 60, '#05061a');   // cloud, in flat hanging lobes
  for (let i = 0; i < 9; i++) circ(ctx, X0 + 90 + i * 215 + rnd(i * 5) * 90, 96 + rnd(i * 9) * 40, 64 + rnd(i * 2) * 44, '#0b1638');
  ctx = A();
  const o = px * 0.06;
  if (lightning(t)) {
    fillAll(ctx, alpha('#dff2ff', 0.2));
    const b = [[930, -60], [900, 30], [936, 70], [884, 150], [910, 176], [872, hy]];
    for (let i = 0; i < b.length - 1; i++) taper(ctx, b[i][0] + o, b[i][1], b[i + 1][0] + o, b[i + 1][1], 11 - i * 2, 9 - i * 2, WHITE);
  }
  ctx.save();
  ctx.translate(640, 440 + heave); ctx.rotate(roll); ctx.translate(-640, -440);
  // the Orm light, a week ahead of its notice: its glow shrinks, and the flat water under it closes like an eye
  const ox = 404 + o, dying = 0.5 + 0.5 * Math.sin(t * 0.21 + 1.2);
  ctx.fillStyle = alpha('#7fd8ff', 0.55); ctx.beginPath(); ctx.ellipse(ox, hy + 8, 40 + 170 * dying, 7, 0, 0, TAU); ctx.fill();
  bloom(ctx, ox, 150, 22 + 60 * dying, '#7fd8ff', 0.5 + 0.5 * dying, WHITE);
  poly(ctx, [[ox - 30, hy + 6], [ox - 22, hy - 12], [ox + 26, hy - 12], [ox + 36, hy + 6]], INK);
  poly(ctx, [[ox - 9, hy - 10], [ox - 6, 164], [ox + 6, 164], [ox + 9, hy - 10]], INK); rect(ctx, ox - 11, 158, 22, 7, INK); poly(ctx, [[ox - 10, 142], [ox, 130], [ox + 10, 142]], INK);
  glint(ctx, ox, 150, 6 + 12 * dying, WHITE, 1, 0);
  // the sea standing up
  waves(ctx, X0 - 160, hy, XW + 320, 80, { len: 84, amp: 7, phase: t * 0.5, col: '#226a78', L });
  waves(ctx, X0 - 160, hy + 44, XW + 320, 120, { len: 140, amp: 13, phase: -t * 0.4 + 0.3, col: '#185670', L, ink: II });
  waves(ctx, X0 - 160, hy + 124, XW + 320, 180, { len: 210, amp: 21, phase: t * 0.33 + 0.6, col: '#103e5c', L, ink: IW });
  waves(ctx, X0 - 160, hy + 250, XW + 320, 700, { len: 300, amp: 30, phase: -t * 0.28, col: '#0b2848', L, ink: IW });
  // the one that is going to come aboard
  const wb = Math.sin(t * 0.8) * 14, wave = (c) => {
    c.moveTo(1700, 1000); c.lineTo(1700, 150 + wb); c.quadraticCurveTo(1100, 20 + wb, 880, 62 + wb); c.quadraticCurveTo(790, 80 + wb, 752, 138 + wb);
    c.quadraticCurveTo(840, 120 + wb, 850, 190 + wb); c.quadraticCurveTo(820, 330, 610, 420); c.quadraticCurveTo(470, 470, 300, 480); c.lineTo(300, 1000); c.closePath();
  };
  sil(ctx, wave, '#1c5e74', L, 7, IW);
  ctx.fillStyle = '#103e5c'; ctx.beginPath(); ctx.moveTo(1700, 1000); ctx.lineTo(1700, 300 + wb); ctx.quadraticCurveTo(1120, 180 + wb, 930, 260 + wb); ctx.quadraticCurveTo(800, 420, 520, 500); ctx.lineTo(520, 1000); ctx.fill();
  ink(ctx, II * 2); ctx.beginPath();
  for (let i = 0; i < 16; i++) { const u = i / 15, x = lerp(756, 1240, u), y = lerp(128, 40, Math.pow(u, 0.4)) + wb + (i % 2) * 5, r = 15 - u * 5 + (i % 3) * 3; ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }
  ctx.stroke(); ctx.fillStyle = WHITE; ctx.fill();
  for (let i = 0; i < 3; i++) { const ph = mod(t * 0.5 + i / 3, 1); curl(ctx, 760 - ph * 190 - i * 20, 110 + wb - Math.sin(ph * Math.PI) * 70 + i * 24, 20 - ph * 8, 1.5, -1, 7, WHITE, II); }   // spray, torn off the top
  ctx.restore();
  // the storm lantern, on its hook, swinging the other way
  const lx = 590 + o, sw = -roll * 6 + Math.sin(t * 2.3) * 0.05, cx = lx - Math.sin(sw) * 92, cy = -30 + Math.cos(sw) * 150;
  seg(ctx, lx, -200, lx, -30, INK, 5);
  bloom(ctx, cx, cy, 190, L.col, 1, L.core);
  ctx.save(); ctx.translate(lx, -30); ctx.rotate(sw);
  seg(ctx, 0, 0, 0, 112, INK, 4);
  flat(ctx, pP([[-24, 112], [0, 96], [24, 112]]), INK, 0); flat(ctx, pR(-20, 112, 40, 64), L.core, IW); flat(ctx, pR(-25, 174, 50, 12), INK, 0);
  seg(ctx, 0, 114, 0, 174, INK, II); rect(ctx, -25, 174, 50, 3.5, L.col);
  ctx.restore();
  spark(ctx, cx, cy, 30, t, 6);
  // the deck rail, streaming
  ctx = S(1.1);
  rect(ctx, X0 - 60, 706, XW + 120, 400, '#0a0d2c');
  for (let i = -2; i < 12; i++) sil(ctx, pR(i * 170, 560, 20, 160), '#141a44', L, 4, IW);
  sil(ctx, pR(X0 - 60, 546, XW + 120, 20), '#141a44', L, 5, IW); sil(ctx, pR(X0 - 60, 632, XW + 120, 11), '#141a44', L, 3, II);
  ctx = A();
}, (ctx, t, px) => {
  rain(ctx, 301, 70, t, px, -0.42, alpha('#dff2ff', 0.42), 2.2);
  rain(ctx, 307, 34, t * 1.2, px * 1.3, -0.5, alpha('#dff2ff', 0.7), 3.2);
});

// ── wreck-shore: a shingle beach below a breakwater, under a hill with no light on it. Key: the dawn, an hour off, low on the left ──
const L_SHORE = light('#ffd9a0', -Math.PI * 0.94, { depth: 0.8, tint: '#1c245c', amb: '#2c3458' });
/** a stone house with nothing in its windows */
function stoneHouse(ctx, x, y, w, h, L, seed) {
  sil(ctx, (c) => { c.moveTo(x, y); c.lineTo(x, y - h); c.lineTo(x + w * 0.5, y - h - w * 0.36); c.lineTo(x + w, y - h); c.lineTo(x + w, y); c.closePath(); }, '#242a62', L, 4, IW);
  poly(ctx, [[x + w * 0.5, y - h - w * 0.36], [x + w, y - h], [x + w, y], [x + w * 0.5, y]], '#1a1e4c');
  const n = Math.max(1, Math.floor(w / 36));
  for (let i = 0; i < n; i++) { const wx = x + 10 + (i + rnd(seed + i) * 0.3) * ((w - 28) / n); rect(ctx, wx, y - h + 14, 13, 18, '#0e0b2a'); rect(ctx, wx, y - h + 14, 3, 18, '#3c4686'); }
}
/** a lamp-tower with its cap down: a light that has been put out */
function deadLamp(ctx, x, y, s, col, L) {
  sil(ctx, (c) => {
    c.moveTo(x - s * 0.3, y); c.lineTo(x - s * 0.2, y - s * 2.2); c.lineTo(x - s * 0.5, y - s * 2.2); c.lineTo(x - s * 0.5, y - s * 2.45); c.lineTo(x - s * 0.34, y - s * 2.45);
    c.lineTo(x - s * 0.34, y - s * 3.1); c.lineTo(x, y - s * 3.5); c.lineTo(x + s * 0.34, y - s * 3.1); c.lineTo(x + s * 0.34, y - s * 2.45); c.lineTo(x + s * 0.5, y - s * 2.45); c.lineTo(x + s * 0.5, y - s * 2.2);
    c.lineTo(x + s * 0.2, y - s * 2.2); c.lineTo(x + s * 0.3, y); c.closePath();
  }, col, L, 3.5, IW);
}
def('wreck-shore', L_SHORE, (ctx, t, px) => {
  const L = L_SHORE, hy = 236, gx = 392;
  ctx = S(0.05);
  bands(ctx, X0 - 60, -200, XW + 120, hy + 200, ['#1c2260', '#40468e', '#96608e', '#ec946a', '#ffd9a0'], [0.4, 0.62, 0.8, 0.92, 1]);
  starField(ctx, 311, 14, 300, 20, 900, 90);
  rings(ctx, gx, hy, 210, [alpha('#ffd9a0', 0.2), alpha('#ffe8bc', 0.32), alpha('#fff3d6', 0.6), '#fffdf2'], [1, 0.66, 0.38, 0.16]);   // where the sun will be, in an hour
  cloudStack(ctx, 250, 150, 230, 44, '#96608e', '#5a4a8e', 3); cloudStack(ctx, 610, 196, 170, 30, '#ec946a', '#96608e', 6); cloudStack(ctx, 60, 80, 200, 40, '#40468e', '#2c3276', 9);
  rect(ctx, X0 - 60, hy, XW + 120, 300, '#2a4a8a'); rect(ctx, X0 - 60, hy, XW + 120, 5, '#fff3d6');
  for (let i = 0; i < 5; i++) rect(ctx, gx - 70 + i * 10, hy + 12 + i * 11, 140 - i * 20, 5, '#ffd9a0');   // the light coming across the water in dashes
  // the hill, and what stands on it, all of it unlit
  sil(ctx, (c) => { c.moveTo(500, hy + 120); c.lineTo(560, hy - 6); c.quadraticCurveTo(650, 150, 730, 110); c.quadraticCurveTo(800, 70, 900, 60); c.lineTo(1700, 30); c.lineTo(1700, hy + 120); c.closePath(); }, '#161a4a', L, 5, IW);
  deadLamp(ctx, 806, 76, 24, '#0e0b2a', L);
  stoneHouse(ctx, 620, 196, 64, 30, L, 1); stoneHouse(ctx, 690, 160, 56, 28, L, 2); stoneHouse(ctx, 850, 150, 70, 36, L, 3); stoneHouse(ctx, 940, 120, 60, 30, L, 4);
  stoneHouse(ctx, 1030, 170, 90, 44, L, 5); stoneHouse(ctx, 1150, 130, 70, 34, L, 6); stoneHouse(ctx, 740, 232, 80, 36, L, 7); stoneHouse(ctx, 900, 236, 110, 50, L, 8);
  // the breakwater, and eleven people coming down it with a rope
  sil(ctx, pP([[1700, 250], [1000, 268], [560, 330], [540, 348], [560, 372], [1700, 372]]), '#0e0b2a', L, 5, IW);
  { const list = []; for (let i = 0; i < 11; i++) list.push([600 + i * 38 + rnd(i) * 10, 300 - i * 5.6 - (i > 9 ? 3 : 0), 9]);
    busts(ctx, list, '#1a1e4c', L, 2.6, II);
    ink(ctx, II, PALETTE.cream); ctx.beginPath(); ctx.moveTo(list[0][0] - 60, list[0][1] + 40); for (const p of list) ctx.lineTo(p[0] - 4, p[1] + 16); ctx.stroke(); }
  ctx = A();
  const o = px * 0.05;
  waves(ctx, X0 - 160 + o, hy + 58, XW + 320, 70, { len: 110, amp: 9, phase: t * 0.22, col: '#234080', L });
  waves(ctx, X0 - 160 + o, hy + 104, XW + 320, 200, { len: 170, amp: 14, phase: -t * 0.18 + 0.4, col: '#1c3470', L, ink: II });
  { // the sea breaking on the end of the breakwater
    const bx = 548 + o, ph = mod(t * 0.4, 1);
    for (let i = 0; i < 3; i++) curl(ctx, bx - 14 - i * 22, 330 - Math.sin(ph * Math.PI) * (30 + i * 16), 12 + i * 3, 1.4, i % 2 ? 1 : -1, 6, WHITE, II);
  }
  // shingle
  ctx = S(0.7);
  flat(ctx, (c) => { c.moveTo(X0 - 60, 1000); c.lineTo(X0 - 60, 470); c.quadraticCurveTo(300, 420, 640, 432); c.quadraticCurveTo(1000, 444, X0 + XW + 60, 404); c.lineTo(X0 + XW + 60, 1000); c.closePath(); }, '#565088', IW);
  for (let i = 0; i < 46; i++) {
    const x = X0 + rnd(i * 3.1) * XW, y = 470 + rnd(i * 7.7) * 320, r = 9 + rnd(i * 5) * 16;
    flat(ctx, pE(x, y, r, r * 0.5), i % 3 ? '#6a649c' : '#3c3a70', 0); rect(ctx, x - r * 0.7, y - r * 0.5, r * 0.9, 2.5, '#ffd9a0');
  }
  // what came ashore with them: the hatch cover, a spar, a cask
  flat(ctx, pP([[330, 560], [1500, 590], [1500, 640], [470, 590]]), alpha(L.shadowTint, 0.5), 0);
  cel(ctx, pP([[250, 560], [390, 540], [420, 572], [280, 596]]), '#a8744e', L, { off: 9, ink: IW, rim: 5 });
  seg(ctx, 272, 572, 404, 552, INK, II); seg(ctx, 262, 584, 396, 562, INK, II);
  flat(ctx, pP([[1020, 640], [1700, 672], [1700, 720], [1100, 670]]), alpha(L.shadowTint, 0.5), 0);
  cel(ctx, pE(1010, 630, 46, 34), '#8a5a3a', L, { off: 12, ink: IW, rim: 5 }); seg(ctx, 992, 600, 992, 660, INK, II); seg(ctx, 1028, 600, 1028, 660, INK, II);
  taper(ctx, 560, 700, 900, 650, 16, 9, INK); taper(ctx, 560, 696, 900, 647, 5, 3, '#ffd9a0');
  ctx = A();
  { // the wash, up the stones and back
    const u = 0.5 + 0.5 * Math.sin(t * 0.7), y = 420 + u * 26;
    waves(ctx, X0 - 160 + px * 0.7, y, XW + 320, 16, { len: 130, amp: 6, phase: 0.2, col: WHITE, foam: false });
  }
});

// ── dark-village: stone houses, no lamps in any window; and the net hall, where the accounts hang. Key: the stove in the hall ──
const L_VILL = light('#ff7a2a', Math.PI * 0.5, { depth: 0.9, tint: '#0c1244', amb: '#1a1c40' });
def('dark-village', L_VILL, (ctx, t, px) => {
  const L = L_VILL, nx = 640;
  ctx = S(0.1);
  bands(ctx, X0 - 60, -200, XW + 120, 700, ['#080824', '#0e123a', '#182056'], [0.4, 0.62, 1]);
  starField(ctx, 321, 60, X0, -40, XW, 330);                                    // with no light below, every star there is
  // the hill, the capped lamp, the upper houses
  flat(ctx, (c) => { c.moveTo(X0 - 60, 500); c.lineTo(X0 - 60, 250); c.quadraticCurveTo(200, 170, 380, 150); c.quadraticCurveTo(470, 144, 560, 200); c.lineTo(560, 500); c.closePath(); }, '#0e0b2a', IW);
  deadLamp(ctx, 404, 150, 26, '#0e0b2a', { dx: 0, dy: -1, rim: '#3c4686' });
  flat(ctx, (c) => { c.moveTo(720, 500); c.lineTo(720, 230); c.quadraticCurveTo(900, 150, 1100, 190); c.quadraticCurveTo(1300, 220, X0 + XW + 60, 200); c.lineTo(X0 + XW + 60, 500); c.closePath(); }, '#0e0b2a', IW);
  for (const [x, y, w, h] of [[150, 300, 120, 80], [300, 290, 96, 70], [900, 280, 110, 80], [1040, 300, 130, 90], [1200, 290, 100, 70], [-60, 310, 150, 90]]) {
    flat(ctx, (c) => { c.moveTo(x, y + h + 120); c.lineTo(x, y); c.lineTo(x + w / 2, y - w * 0.36); c.lineTo(x + w, y); c.lineTo(x + w, y + h + 120); c.closePath(); }, '#1a1e4c', IW);
    for (let i = 0; i < 2; i++) { rect(ctx, x + 18 + i * (w - 52), y + 22, 16, 22, '#0e0b2a'); rect(ctx, x + 18 + i * (w - 52), y + 22, 16, 3, '#3c4686'); }
  }
  // the street
  rect(ctx, X0 - 60, 480, XW + 120, 540, '#141238');
  for (let r = 0; r < 7; r++) { ctx.fillStyle = '#1e1c4c'; ctx.beginPath(); for (let i = 0; i < 30; i++) { const x = X0 + i * 64 + (r % 2) * 32, y = 500 + r * 44; ctx.moveTo(x + 26, y); ctx.ellipse(x, y, 26, 10 + r, 0, 0, TAU); } ctx.fill(); }
  // the net hall: the one building with a fire in it. Its great door stands open
  flat(ctx, pP([[nx - 230, 490], [nx - 230, 150], [nx, 10], [nx + 230, 150], [nx + 230, 490]]), '#1a1e4c', IW);
  flat(ctx, pP([[nx - 252, 164], [nx, 0], [nx + 252, 164], [nx + 252, 140], [nx, -26], [nx - 252, 140]]), '#0e0b2a', IW);
  flat(ctx, pR(nx + 130, -30, 34, 110), '#0e0b2a', IW);
  const door = pArch(nx - 112, 56, 224, 434);
  ctx.save(); ctx.beginPath(); door(ctx); ctx.clip();
  bands(ctx, nx - 112, 56, 224, 434, ['#e8521c', '#ff8a2e', '#ffc46a', '#fff0c0'], [0.2, 0.42, 0.72, 1]);
  rings(ctx, nx, 470, 150, ['#fff0c0', '#fffdf2'], [1, 0.5]);
  ctx.restore();
  // the herring net: mesh, a head-rope, and one cord to a household, knotted for every day owed
  ctx.save(); ctx.beginPath(); door(ctx); ctx.clip();
  ink(ctx, 1.8); ctx.beginPath();
  for (let i = -8; i < 14; i++) { ctx.moveTo(nx - 112 + i * 22, 76); ctx.lineTo(nx - 112 + i * 22 + 130, 206); ctx.moveTo(nx - 112 + i * 22 + 130, 76); ctx.lineTo(nx - 112 + i * 22, 206); }
  ctx.stroke();
  ctx.restore();
  ink(ctx, IW); ctx.beginPath(); ctx.moveTo(nx - 112, 150); ctx.quadraticCurveTo(nx, 60, nx + 112, 150); ctx.stroke();
  for (let i = 0; i < 12; i++) {
    const x = nx - 96 + i * 17.5, y0 = 150 - Math.sin(((i + 0.5) / 12) * Math.PI) * 44 + 4, len = 70 + rnd(i * 3) * 130, n = 2 + Math.floor(rnd(i * 7) * 5);
    seg(ctx, x, y0, x, y0 + len, INK, 2.6);
    for (let k = 0; k < n; k++) circ(ctx, x, y0 + 18 + k * ((len - 22) / n), 4.4, INK);
  }
  // sixty-one people and a stove
  { const list = []; for (let i = 0; i < 9; i++) list.push([nx - 100 + i * 25, 418 + (i % 2) * 12, 15]); busts(ctx, list, INK, L, 0, 0); }
  flat(ctx, pP([[nx - 16, 490], [nx - 20, 430], [nx + 20, 430], [nx + 16, 490]]), INK, 0); rect(ctx, nx - 5, 330, 10, 100, INK);
  outline(ctx, door, IW * 1.4);
  for (const s of [-1, 1]) { sil(ctx, pR(nx + s * 138 - 26, 200, 52, 290), '#242a62', { dx: -s, dy: 0, rim: L.rim }, 5, IW); for (let i = 0; i < 6; i++) seg(ctx, nx + s * 138 - 26, 240 + i * 44, nx + s * 138 + 26, 240 + i * 44, INK, II); }   // the doors, folded back
  bloom(ctx, nx, 300, 330, L.col, 0.5);
  // what the fire throws into the street
  poly(ctx, [[nx - 112, 490], [nx + 112, 490], [nx + 520, 1000], [nx - 520, 1000]], '#c2581c');
  poly(ctx, [[nx - 60, 490], [nx + 60, 490], [nx + 250, 1000], [nx - 250, 1000]], '#ff9a3a');
  ctx = A();
  const o = px * 0.1;
  for (let i = 0; i < 3; i++) { // the only smoke in the village
    const ph = mod(t * 0.16 + i / 3, 1);
    curl(ctx, nx + 147 + o + Math.sin(ph * 5 + i) * 16 + ph * 40, -34 - ph * 130, 12 + ph * 20, 1.6, i % 2 ? 1 : -1, 7, blend('#5a5674', '#182056', ph), ph < 0.7 ? II : 0);
  }
  spark(ctx, nx + o, 262, 14 + 6 * Math.sin(t * 9), t, 7);
  // nets on the drying poles, either side
  ctx = S(0.6);
  for (const s of [-1, 1]) {
    const x = 640 + s * 520;
    sil(ctx, pR(x - 8, 180, 16, 700), '#0e0b2a', { dx: -s, dy: 0, rim: L.rim }, 4, IW);
    sil(ctx, pR(x - s * 210 - 110, 196, 220 + 110, 12), '#0e0b2a', { dx: -s * 0.3, dy: 0.95, rim: L.rim }, 3, IW);
    flat(ctx, (c) => { c.moveTo(x - s * 300, 208); c.quadraticCurveTo(x - s * 150, 420, x - s * 10, 208); c.closePath(); }, '#141238', IW);
    ink(ctx, II); ctx.beginPath(); for (let i = 1; i < 6; i++) { ctx.moveTo(x - s * 300 + s * i * 48, 208); ctx.lineTo(x - s * 300 + s * i * 48 + s * (3 - i) * 8, 208 + Math.sin((i / 6) * Math.PI) * 190); } ctx.stroke();
  }
});

// ── hidden-lamp: a small shuttered flame in a sea-cave. Key: the lamp itself, cold and blue ──
/** long and short, like a slow pulse: how far the shutter stands open, 0..1 */
function lampSignal(t) {
  const pat = [1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 0, 0], u = mod(t / 0.62, pat.length), i = Math.floor(u), f = u - i;
  return lerp(pat[i], pat[(i + 1) % pat.length], clamp(f * 4));
}
const L_CAVE = light('#7fd8ff', -Math.PI * 0.42, { depth: 0.9, tint: '#1a0c44', amb: '#0e1c3a' });
def('hidden-lamp', L_CAVE, (ctx, t, px) => {
  const L = L_CAVE, lx = 664, ly = 150, open = lampSignal(t);
  ctx = S(0.15);
  fillAll(ctx, '#0a0826');
  // the cave mouth: night, the sea, and the others answering
  const mouth = (c) => { c.moveTo(160, 500); c.quadraticCurveTo(170, 300, 250, 170); c.quadraticCurveTo(310, 60, 400, 50); c.quadraticCurveTo(470, 60, 480, 170); c.quadraticCurveTo(500, 330, 470, 500); c.closePath(); };
  ctx.save(); ctx.beginPath(); mouth(ctx); ctx.clip();
  bands(ctx, 100, 0, 460, 240, ['#10143c', '#1c2c6c', '#2c5296'], [0.5, 0.8, 1]);
  starField(ctx, 331, 9, 230, 60, 250, 120);
  rect(ctx, 100, 240, 460, 300, '#16245c'); rect(ctx, 100, 240, 460, 4, '#7fd8ff');
  ctx.restore();
  outline(ctx, mouth, IW * 1.5);
  // the rock: strata, in planes. The ones that face the lamp are lit; the rest is the dark
  for (const [pts, lit] of [
    [[[480, 60], [640, 20], [900, 40], [960, 120], [800, 96], [560, 120]], 1], [[[500, 250], [600, 228], [760, 250], [940, 230], [960, 300], [520, 310]], 1],
    [[[960, 120], [1160, 60], [1540, 120], [1540, 260], [1100, 240], [940, 230]], 0], [[[520, 310], [960, 300], [1200, 330], [1180, 400], [540, 420]], 0],
    [[[160, 500], [170, 300], [60, 240], [-260, 300], [-260, 500]], 0], [[[250, 170], [310, 60], [200, 20], [-100, 60], [60, 240], [170, 300]], 0],
    [[[1100, 240], [1540, 260], [1540, 420], [1180, 400], [1200, 330]], 0],
  ]) flat(ctx, pP(pts), lit ? '#1f4684' : '#12123a', II);
  for (const [pts] of [[[[560, 120], [800, 96], [960, 120], [940, 230], [760, 250], [600, 228], [500, 250], [480, 170]]]]) flat(ctx, pP(pts), '#161c50', II);
  for (const [x, y, r] of [[540, 96, 9], [890, 70, 7], [930, 262, 8], [580, 276, 6]]) glint(ctx, x, y, r, WHITE, 1, 0);   // wet, where the light finds it
  // the lamp, in its niche at the back: brass, a cold flame, and a shutter of old ship's copper gone green
  flat(ctx, pArch(lx - 74, ly - 96, 148, 170), '#070620', IW);
  flat(ctx, pP([[lx - 96, ly + 74], [lx + 96, ly + 74], [lx + 84, ly + 92], [lx - 84, ly + 92]]), '#285a9c', II);
  flat(ctx, pR(lx - 22, ly + 48, 44, 26), PALETTE.brass, II); flat(ctx, pR(lx - 14, ly + 38, 28, 12), shadowOf(PALETTE.brass, L), II);
  // the floor of the cave, the pool, and what is kept here: kelp drying on a line, a cask of the ash
  flat(ctx, (c) => { c.moveTo(X0 - 60, 1000); c.lineTo(X0 - 60, 500); c.quadraticCurveTo(400, 470, 700, 486); c.quadraticCurveTo(1100, 500, X0 + XW + 60, 470); c.lineTo(X0 + XW + 60, 1000); c.closePath(); }, '#10103a', IW);
  flat(ctx, pE(560, 600, 300, 44), '#1c2c6c', II); flat(ctx, pE(600, 596, 150, 18), '#7fd8ff', 0);
  cel(ctx, pR(980, 400, 90, 110), '#5a3a4a', L, { off: 14, ink: IW, rim: 5 }); seg(ctx, 980, 430, 1070, 430, INK, II); seg(ctx, 980, 480, 1070, 480, INK, II);
  seg(ctx, 860, 196, 1300, 170, INK, II);
  for (let i = 0; i < 7; i++) { const x = 900 + i * 54, y = 194 - i * 3.3; flat(ctx, (c) => { c.moveTo(x - 9, y); c.quadraticCurveTo(x - 16, y + 60, x - 2, y + 100 + (i % 3) * 20); c.quadraticCurveTo(x + 14, y + 50, x + 9, y); c.closePath(); }, i % 2 ? '#1f6a5c' : '#144a4c', II); }
  ctx = A();
  const o = px * 0.15, x = lx + o;
  for (const [sx, dt, r] of [[300, 2.9, 1], [396, 5.7, 0.8], [350, 8.3, 0.6]]) { // three points of blue on the horizon, each keeping its own time
    const on = lampSignal(t + dt); if (on > 0.5) { bloom(ctx, sx + o, 236, 26 * r, '#7fd8ff', 1, WHITE); glint(ctx, sx + o, 236, 13 * r, WHITE, 1, 0); } else circ(ctx, sx + o, 236, 2.2, '#7fd8ff');
  }
  // what the shutter lets out
  bloom(ctx, x, ly, 130 + 130 * open, L.col, 0.7 + 0.3 * open);
  if (open > 0.5) for (let i = 0; i < 4; i++) shaft(ctx, x, ly - 40 + i * 26, Math.PI * (0.62 + i * 0.09), 900, 0.07, L.col, 0.26);
  ctx.fillStyle = '#2f7fdc'; ctx.beginPath(); ctx.moveTo(x - 17, ly + 38); ctx.quadraticCurveTo(x - 26, ly + 4, x + Math.sin(t * 2.7) * 4, ly - 26); ctx.quadraticCurveTo(x + 26, ly + 4, x + 17, ly + 38); ctx.fill();
  ctx.fillStyle = WHITE; ctx.beginPath(); ctx.moveTo(x - 9, ly + 38); ctx.quadraticCurveTo(x - 14, ly + 14, x + Math.sin(t * 2.7) * 2, ly - 6); ctx.quadraticCurveTo(x + 14, ly + 14, x + 9, ly + 38); ctx.fill();
  ctx.fillStyle = L.core; ctx.fillRect(x - 64, ly - 86, 128, 148);                // shut, it still leaks: a line of light between every slat
  ctx.fillStyle = '#2f7fdc'; ctx.beginPath(); ctx.moveTo(x - 17, ly + 38); ctx.quadraticCurveTo(x - 26, ly + 4, x + Math.sin(t * 2.7) * 4, ly - 26); ctx.quadraticCurveTo(x + 26, ly + 4, x + 17, ly + 38); ctx.fill();
  for (let i = 0; i < 5; i++) { // the slats: shut they are a wall of green copper, open they stand edge-on
    const y = ly - 84 + i * 30, h = 24 - open * 18;
    ctx.fillStyle = INK; ctx.fillRect(x - 66, y - 2, 132, h + 4);
    ctx.fillStyle = i % 2 ? '#1f6a5c' : '#8a4630'; ctx.fillRect(x - 63, y, 126, h);
    ctx.fillStyle = L.rim; ctx.fillRect(x - 63, y + h - Math.min(h, 3 + open * 3), 126, Math.min(h, 3 + open * 3));
  }
  ink(ctx, IW * 1.4); ctx.strokeRect(x - 66, ly - 88, 132, 152);
  seg(ctx, x + 78, ly - 80, x + 78, ly + 20 + open * 26, PALETTE.brass, 4); circ(ctx, x + 78, ly + 24 + open * 26, 7, PALETTE.brass);   // the pull
  // the cold smoke, which goes down, along the floor, and out to sea
  for (let i = 0; i < 3; i++) { const ph = mod(t * 0.11 + i / 3, 1); curl(ctx, x - 110 - ph * 330, ly + 120 + ph * 250 + Math.sin(ph * 6 + i) * 10, 16 + ph * 18, 1.5, 1, 7, blend('#bfe8ff', '#1c2c6c', ph * 0.8), II); }
  // the roof of the cave, near
  ctx = S(0.6);
  flat(ctx, (c) => {
    c.moveTo(X0 - 60, -200); c.lineTo(X0 + XW + 60, -200); c.lineTo(X0 + XW + 60, 60);
    for (let i = 12; i >= 0; i--) { const x2 = X0 + (i / 12) * XW, d = 20 + rnd(i * 3.3) * 60; c.lineTo(x2 + 50, 10); c.lineTo(x2, 10 + (i % 4 === 1 ? d + 40 : d * 0.3)); }
    c.closePath();
  }, '#070620', IW);
});

// ── under-lane: rowing boats on black water, one hooded lantern each. Key: our own boat's lantern, hood down, on its bow-staff ──
const L_LANE = light('#ffb24a', -Math.PI * 0.3, { depth: 0.92, tint: '#0a0c3c', amb: '#10143a' });
/** a boat a long way off: a hull, three backs, and its lantern. (x, y) is the waterline amidships */
function farBoat(ctx, x, y, s) {
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.moveTo(x - 46 * s, y - 7 * s); ctx.quadraticCurveTo(x - 36 * s, y + 6 * s, x - 20 * s, y + 6 * s); ctx.lineTo(x + 30 * s, y + 6 * s); ctx.quadraticCurveTo(x + 46 * s, y + 4 * s, x + 54 * s, y - 10 * s); ctx.lineTo(x + 38 * s, y - 3 * s); ctx.lineTo(x - 38 * s, y - 3 * s); ctx.closePath(); ctx.fill();
  for (let j = 0; j < 3; j++) { ctx.beginPath(); ctx.arc(x - 22 * s + j * 18 * s, y - 15 * s, 4.6 * s, 0, TAU); ctx.fill(); ctx.fillRect(x - 27 * s + j * 18 * s, y - 12 * s, 10 * s, 11 * s); }
  ctx.fillRect(x + 46 * s, y - 30 * s, 2.4 * s, 22 * s);
}
def('under-lane', L_LANE, (ctx, t, px) => {
  const L = L_LANE, hy = 196, lx = 812, ly = 128;
  const BOATS = [[400, hy + 12, 0.5], [548, hy + 26, 0.72], [700, hy + 20, 0.6], [1130, hy + 14, 0.5], [180, hy + 30, 0.8]];
  ctx = S(0.05);
  bands(ctx, X0 - 60, -200, XW + 120, hy + 200, ['#06061c', '#0a0e30', '#141e50'], [0.55, 0.85, 1]);
  starField(ctx, 341, 40, X0, -30, XW, 200);
  // the Maund rocks
  for (const [x, w, h] of [[380, 90, 90], [452, 60, 140], [520, 110, 64], [1180, 80, 120], [1260, 130, 56], [-120, 160, 70], [60, 80, 110]]) {
    flat(ctx, pP([[x - w / 2, hy + 2], [x - w * 0.3, hy - h * 0.6], [x - w * 0.08, hy - h], [x + w * 0.12, hy - h * 0.82], [x + w * 0.34, hy - h * 0.4], [x + w / 2, hy + 2]]), '#0a0826', IW);
    poly(ctx, [[x - w * 0.08, hy - h], [x + w * 0.12, hy - h * 0.82], [x + w * 0.34, hy - h * 0.4], [x + w * 0.1, hy - h * 0.5]], '#1c2660');
  }
  // black water, in flat bands
  bands(ctx, X0 - 60, hy, XW + 120, 700, ['#141e50', '#0e1440', '#0a0c30', '#070620'], [0.07, 0.2, 0.45, 1]);
  waves(ctx, X0 - 60, hy + 46, XW + 120, 60, { len: 150, amp: 5, col: '#0e1440', foam: false });
  waves(ctx, X0 - 60, hy + 134, XW + 120, 120, { len: 230, amp: 8, phase: 0.4, col: '#0a0c30', foam: false });
  // the boats, in line, pulling to the same count: one hooded lantern each
  for (const [x, y, s] of BOATS) {
    farBoat(ctx, x, y, s);
    bloom(ctx, x + 47 * s, y - 34 * s, 40 * s, L.col, 1, L.core);
    for (let j = 0; j < 4; j++) rect(ctx, x + 47 * s - (15 - j * 3) * s, y + (12 + j * 9) * s, (30 - j * 6) * s, 3.4 * s, j < 2 ? L.col : '#b8641c');
  }
  // the Audit cutter, a long way off, looking for a wreck with the one light it is allowed
  poly(ctx, [[904, hy + 2], [946, hy + 2], [938, hy + 8], [912, hy + 8]], INK); rect(ctx, 923, hy - 22, 3, 24, INK);
  ctx = A();
  const o = px * 0.05;
  { const a = Math.PI * 0.5 + Math.sin(t * 0.33) * 1.0; shaft(ctx, 924 + o, hy - 22, a, 190, 0.09, '#dff2ff', 0.22); glint(ctx, 924 + o, hy - 22, 9, WHITE, 1, 0); }
  for (let i = 0; i < BOATS.length; i++) { const [x, y, s] = BOATS[i]; glint(ctx, x + 47 * s + o, y - 34 * s, 12 * s * (1 + 0.2 * Math.sin(t * 3 + i * 2)), WHITE, 1, 0); }
  // our own boat: the gunwale, the bow-staff, and the lantern with its hood down
  ctx = S(1.1);
  shaft(ctx, lx, ly + 20, Math.PI * 0.62, 900, 0.62, L.col, 0.22);
  sil(ctx, (c) => { c.moveTo(X0 - 60, 1000); c.lineTo(X0 - 60, 620); c.quadraticCurveTo(640, 716, X0 + XW + 60, 600); c.lineTo(X0 + XW + 60, 1000); c.closePath(); }, '#1a1238', L, 6, IW);
  ink(ctx, IW * 2.4); ctx.beginPath(); ctx.moveTo(930, 680); ctx.quadraticCurveTo(900, 300, 884, 150); ctx.quadraticCurveTo(872, 70, lx, 84); ctx.stroke();
  ink(ctx, 3, L.col); ctx.beginPath(); ctx.moveTo(925, 680); ctx.quadraticCurveTo(895, 300, 879, 150); ctx.stroke();
  seg(ctx, lx, 84, lx, ly - 30, INK, 4);
  bloom(ctx, lx, ly + 16, 170, L.col, 1);
  flat(ctx, pP([[lx - 40, ly - 2], [lx - 12, ly - 34], [lx + 12, ly - 34], [lx + 40, ly - 2]]), '#1a1238', IW);     // the hood
  flat(ctx, pR(lx - 24, ly - 2, 48, 38), L.core, IW); seg(ctx, lx - 8, ly, lx - 8, ly + 34, INK, II); seg(ctx, lx + 8, ly, lx + 8, ly + 34, INK, II);
  flat(ctx, pR(lx - 30, ly + 36, 60, 10), '#1a1238', IW);
  ctx = A();
  spark(ctx, lx + px * 1.1, ly + 16, 30, t, 9);
});

// ───────────────────────── chapter 5: Tallis ─────────────────────────
// ── exchange-floor: the trading pits. Key: morning through the one tall window, upper left ──
const BOARD_ROWS = [['STILLSALT', 880, 14, 0], ['MARK', 96, 5, -1], ['LAPSE BOND', 38, 9, 1], ['RENEWAL', 61, 7, -1], ['LANE CARGO', 212, 11, 0]];
const L_FLOOR = light('#ffdf9a', -Math.PI * 0.8, { depth: 0.8, tint: '#2a1450', amb: '#30263e' });
def('exchange-floor', L_FLOOR, (ctx, t, px) => {
  const L = L_FLOOR, bx = 500, by = 34, bw = 412, bh = 206;
  ctx = S(0.2);
  fillAll(ctx, '#2c1a3c');
  rect(ctx, X0 - 60, 300, XW + 120, 200, '#221432');
  // tall windows, morning in them
  for (const [x, a] of [[350, 1], [130, 1], [-90, 1], [1150, 0], [1370, 0]]) {
    const win = pArch(x, 6, 112, 300);
    if (a) { ctx.save(); ctx.beginPath(); win(ctx); ctx.clip(); bands(ctx, x, 0, 112, 310, ['#fffdf0', '#fff0c4', '#ffd98a'], [0.45, 0.75, 1]); ctx.restore(); } else flat(ctx, win, '#4a3a6c', 0);
    seg(ctx, x + 56, 6, x + 56, 306, INK, IW); for (let i = 1; i < 4; i++) seg(ctx, x, 6 + i * 76, x + 112, 6 + i * 76, INK, II);
    outline(ctx, win, IW * 1.5);
    flat(ctx, pR(x - 12, 306, 136, 12), '#5a3a5c', II);
  }
  bloom(ctx, 406, 120, 260, L.col, 0.7);
  // the board: every price in Aurelle, made here, and remade while you look
  cel(ctx, pR(bx - 12, by - 12, bw + 24, bh + 24), PALETTE.brass, L, { off: 8, ink: IW, rim: 5 });
  flat(ctx, pR(bx, by, bw, bh), '#16143c', II);
  ctx.fillStyle = PALETTE.brass; ctx.font = `700 19px ${FONT_SERIF}`; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; ctx.fillText('TALLIS EXCHANGE', bx + 16, by + 28);
  seg(ctx, bx + 12, by + 38, bx + bw - 12, by + 38, PALETTE.brass, 2);
  ctx.fillStyle = PALETTE.cream; ctx.font = `700 18px ${FONT_SERIF}`;
  for (let i = 0; i < BOARD_ROWS.length; i++) ctx.fillText(BOARD_ROWS[i][0], bx + 16, by + 66 + i * 32);
  // the bell that makes the prices
  seg(ctx, bx - 12, by + 110, bx - 44, by + 110, INK, 6); seg(ctx, bx - 40, by + 110, bx - 40, by + 124, INK, 4);
  cel(ctx, (c) => { c.moveTo(bx - 70, by + 176); c.quadraticCurveTo(bx - 58, by + 166, bx - 58, by + 142); c.quadraticCurveTo(bx - 56, by + 122, bx - 40, by + 122); c.quadraticCurveTo(bx - 24, by + 122, bx - 22, by + 142); c.quadraticCurveTo(bx - 22, by + 166, bx - 10, by + 176); c.closePath(); }, PALETTE.brass, L, { off: 9, ink: IW, rim: 4 });
  glint(ctx, bx - 52, by + 138, 12, WHITE, 1, 0);
  // what the window throws across the hall
  poly(ctx, [[350, 6], [462, 6], [1500, 700], [900, 1000], [700, 1000]], alpha(L.col, 0.13));
  poly(ctx, [[380, 100], [462, 60], [1300, 700], [1000, 800]], alpha(L.col, 0.11));
  // the gallery rail, and the pits below it
  rect(ctx, X0 - 60, 300, XW + 120, 10, PALETTE.brass); rect(ctx, X0 - 60, 300, XW + 120, 3, WHITE); seg(ctx, X0 - 60, 311, X0 + XW + 60, 311, INK, II);
  for (let x = X0; x < X0 + XW; x += 60) rect(ctx, x, 311, 5, 40, shadowOf(PALETTE.brass, L));
  rect(ctx, X0 - 60, 500, XW + 120, 520, '#4a2c44');
  for (const [x, col, s] of [[420, PALETTE.sea, 1], [860, PALETTE.crimson, -1], [120, PALETTE.brass, 1], [1160, '#8a5acc', -1]]) { // a standard so a runner can find the pit from across the floor
    rect(ctx, x - 3, 330, 6, 200, INK); flat(ctx, pP([[x, 334], [x + s * 70, 346], [x, 366]]), col, II);
  }
  for (let r = 0; r < 4; r++) {
    const u = r / 3, y = 372 + r * 34, s = 13 + r * 5, list = [], hands = [];
    for (let i = 0; i < 60; i++) { const x = X0 + i * s * 2.3 + rnd(i * 3 + r) * s; if (x > X0 + XW) break; const p = [x, y + rnd(i * 7 + r * 3) * s * 0.5, s]; list.push(p); if (rnd(i * 5.1 + r * 9) < 0.3) hands.push(p); }
    ctx.fillStyle = PALETTE.cream; ctx.beginPath(); for (const [x, yy] of hands) ctx.rect(x + s * 0.7, yy - s * 1.9, s * 0.7, s * 0.9); ctx.fill();   // slips held up, to be seen across the pit
    ink(ctx, s * 0.34, blend('#2a2250', '#221432', 0.4 - u * 0.4)); ctx.beginPath(); for (const [x, yy] of hands) { ctx.moveTo(x + s * 0.7, yy + s * 1.2); ctx.lineTo(x + s * 1.0, yy - s * 1.1); } ctx.stroke();
    busts(ctx, list, blend('#2a2250', '#221432', 0.4 - u * 0.4), L, 1.6 + u * 2, u > 0.6 ? II : 0);
  }
  ctx = A();
  const o = px * 0.2;
  ctx.font = `700 18px ${FONT_SERIF}`; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'right';
  for (let i = 0; i < BOARD_ROWS.length; i++) { // chalked, rubbed out, chalked again
    const [, base, vol, drift] = BOARD_ROWS[i], k = Math.floor(t / 1.7 + i * 0.37), d = Math.round((rnd(k * 3.1 + i * 17) - 0.5) * vol) + drift * (mod(k, 6) - 3), y = by + 66 + i * 32;
    ctx.fillStyle = WHITE; ctx.fillText(String(base + d), bx + bw - 64 + o, y);
    if (d) { ctx.fillStyle = d > 0 ? PALETTE.sea : PALETTE.crimson; ctx.beginPath(); const tx = bx + bw - 36 + o, s = d > 0 ? -1 : 1; ctx.moveTo(tx - 9, y - 6 - s * 6); ctx.lineTo(tx + 9, y - 6 - s * 6); ctx.lineTo(tx, y - 6 + s * 7); ctx.fill(); }
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.cream; ctx.beginPath();
  for (let i = 0; i < 9; i++) { // the day's slips, coming down
    const ph = mod(t * (0.1 + rnd(i) * 0.06) + rnd(i * 3), 1), x = 380 + rnd(i * 7) * 620 + Math.sin(ph * 9 + i) * 30 + o, y = 250 + ph * 500, a = ph * 14 + i;
    ctx.moveTo(x - Math.cos(a) * 9, y - Math.sin(a) * 9); ctx.lineTo(x + Math.sin(a) * 5, y - Math.cos(a) * 5); ctx.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9); ctx.lineTo(x - Math.sin(a) * 5, y + Math.cos(a) * 5); ctx.closePath();
  }
  ctx.fill();
});

// ── exchange-steps: the steps of the Exchange, and the city in the street below them. Key: a low sun down the street, from the left ──
const L_STEPS = light('#ffb86a', -Math.PI * 0.9, { depth: 0.8, tint: '#241a5c', amb: '#3a3054' });
def('exchange-steps', L_STEPS, (ctx, t, px) => {
  const L = L_STEPS, sx = 664, sy = 166, ex = 800;
  ctx = S(0.1);
  bands(ctx, X0 - 60, -200, XW + 120, 540, ['#2a2868', '#66488a', '#c4626c', '#ff9a4a', '#ffd9a0'], [0.42, 0.6, 0.76, 0.9, 1]);
  rings(ctx, sx, sy, 220, [alpha('#ffd9a0', 0.16), alpha('#ffe6b8', 0.3), alpha('#fff3d6', 0.6), '#fffdf2'], [1, 0.66, 0.4, 0.2]);
  cloudStack(ctx, 300, 120, 240, 44, '#c4626c', '#66488a', 4); cloudStack(ctx, 520, 60, 170, 30, '#66488a', '#2a2868', 7);
  // the city going down to the harbour; the Mint hall with its doors bolted
  flat(ctx, (c) => { c.moveTo(X0 - 60, 520); c.lineTo(X0 - 60, 250); for (let i = 0; i < 26; i++) { const x = X0 + i * 44, h = 250 - rnd(i * 3.3) * 60 + i * 2; c.lineTo(x, h); c.lineTo(x + 44, h); } c.lineTo(900, 520); c.closePath(); }, '#8a4a7c', 0);
  sil(ctx, (c) => {
    c.moveTo(X0 - 60, 540); c.lineTo(X0 - 60, 300);
    for (let i = 0; i < 16; i++) { const x = X0 + i * 62, h = 300 - rnd(i * 5.1) * 70 + i * 3; c.lineTo(x, h); if (i % 3 === 0) c.lineTo(x + 31, h - 26); c.lineTo(x + 62, h); }
    c.lineTo(742, 310); c.lineTo(742, 262); c.arc(700, 262, 42, 0, Math.PI, true); c.lineTo(658, 310); c.lineTo(760, 320); c.lineTo(900, 540); c.closePath();
  }, '#2a2060', L, 4, IW);
  rect(ctx, 698, 196, 4, 26, INK);
  // the street, full: a run is everyone watching everyone else's feet
  rect(ctx, X0 - 60, 420, 1200, 620, '#3a2a66');
  for (let r = 0; r < 5; r++) {
    const u = r / 4, y = 400 + r * 30, s = 9 + r * 4.5, list = [];
    for (let i = 0; i < 80; i++) { const x = X0 + i * s * 2.2 + rnd(i * 3 + r * 7) * s; if (x > 860) break; list.push([x, y + rnd(i * 7 + r) * s * 0.5, s]); }
    busts(ctx, list, blend('#1c1a4c', '#3a2a66', 0.4 - u * 0.4), L, 1.5 + u * 2.4, u > 0.6 ? II : 0);
  }
  // the Exchange: its porch, its columns, its doors
  rect(ctx, ex + 20, 150, 1000, 380, '#1c1648');
  cel(ctx, pR(ex + 190, 190, 150, 340), '#8a5a3a', L, { shadow: pR(ex + 265, 190, 75, 340), ink: IW });                    // the bronze doors
  for (let i = 0; i < 2; i++) for (let j = 0; j < 4; j++) outline(ctx, pR(ex + 202 + i * 70, 204 + j * 80, 56, 64), II);
  for (let i = 0; i < 6; i++) {
    const x = ex + 30 + i * 132;
    flat(ctx, pP([[x + 22, 530], [x + 44, 530], [x + 330, 1000], [x + 240, 1000]]), alpha(L.shadowTint, 0.5), 0);
    cel(ctx, pR(x, 160, 46, 370), '#ecd2ac', L, { shadow: pR(x + 20, 160, 26, 370), ink: IW, rim: 5 });
    seg(ctx, x + 12, 168, x + 12, 522, alpha(INK, 0.5), II);
    flat(ctx, pR(x - 8, 146, 62, 16), '#ecd2ac', IW); flat(ctx, pR(x - 8, 516, 62, 16), '#ecd2ac', IW);
  }
  cel(ctx, pR(ex - 4, 100, 1100, 48), '#ecd2ac', L, { shadow: pR(ex - 4, 136, 1100, 12), ink: IW, rim: 4 });
  cel(ctx, pP([[ex - 20, 100], [ex + 380, -40], [ex + 1100, -40], [ex + 1100, 100]]), '#d8b48c', L, { off: 10, ink: IW, rim: 5 });
  ctx.fillStyle = INK; ctx.font = `700 21px ${FONT_SERIF}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('THE EXCHANGE OF TALLIS', ex + 26, 126); ctx.textBaseline = 'alphabetic';
  // the opening bell, in the porch
  seg(ctx, ex + 112, 148, ex + 112, 176, INK, 4);
  ctx = A();
  const o = px * 0.1;
  { const a = Math.sin(t * 2.6) * 0.16, x = ex + 112 + o, y = 176;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    sil(ctx, (c) => { c.moveTo(-30, 52); c.quadraticCurveTo(-18, 42, -18, 20); c.quadraticCurveTo(-16, 0, 0, 0); c.quadraticCurveTo(16, 0, 18, 20); c.quadraticCurveTo(18, 42, 30, 52); c.closePath(); }, PALETTE.brass, L, 3, IW);
    circ(ctx, 0, 56, 6, INK); glint(ctx, -9, 18, 10, WHITE, 1, 0);
    ctx.restore(); }
  spark(ctx, sx + o, sy, 40, t, 11);
  ink(ctx, II * 1.3); ctx.beginPath();
  for (let i = 0; i < 3; i++) { // pigeons that will not settle
    const x = 600 + mod(i * 211 + t * (30 + i * 9), 700) + o, y = 70 + i * 22 + Math.sin(t * 1.1 + i * 2) * 16, w = 10 + i * 2, fl = Math.sin(t * 9 + i * 2) * 6;
    ctx.moveTo(x - w, y - fl); ctx.quadraticCurveTo(x - w * 0.4, y - 4, x, y); ctx.quadraticCurveTo(x + w * 0.4, y - 4, x + w, y - fl);
  }
  ctx.stroke();
  // the steps
  ctx = S(0.5);
  for (let i = 0; i < 7; i++) {
    const y = 530 + i * 44, x0 = 560 - i * 60;
    flat(ctx, pP([[x0, y], [X0 + XW + 60, y], [X0 + XW + 60, y + 16], [x0 - 14, y + 16]]), '#f0d4a8', 0);
    flat(ctx, pP([[x0 - 14, y + 16], [X0 + XW + 60, y + 16], [X0 + XW + 60, y + 44], [x0 - 60, y + 44]]), '#8a6490', 0);
    seg(ctx, x0, y, X0 + XW + 60, y, INK, II);
  }
  for (let i = 0; i < 6; i++) { const x = ex + 30 + i * 132; poly(ctx, [[x + 30, 530], [x + 56, 530], [x + 420, 1000], [x + 300, 1000]], alpha(L.shadowTint, 0.45)); }   // the columns, laid down the steps
  // lamp standards at the foot of the porch, not lit yet
  for (const x of [600, 1260]) {
    sil(ctx, pR(x - 6, 380, 12, 330), '#1c1648', L, 3, IW); sil(ctx, pP([[x - 20, 380], [x - 14, 336], [x + 14, 336], [x + 20, 380]]), '#3a2a66', L, 3, IW); sil(ctx, pP([[x - 22, 336], [x, 316], [x + 22, 336]]), '#1c1648', L, 3, IW);
  }
}, (ctx, t, px) => {
  ctx.fillStyle = PALETTE.cream; ctx.beginPath();
  for (let i = 0; i < 7; i++) { // the extra page, loose in the street
    const ph = mod(t * (0.07 + rnd(i) * 0.05) + rnd(i * 3), 1), x = 200 + ph * 1300 + px, y = 520 + rnd(i * 7) * 240 - Math.sin(ph * 12 + i) * 40, a = ph * 20 + i;
    ctx.moveTo(x - Math.cos(a) * 16, y - Math.sin(a) * 16); ctx.lineTo(x + Math.sin(a) * 10, y - Math.cos(a) * 10); ctx.lineTo(x + Math.cos(a) * 16, y + Math.sin(a) * 16); ctx.lineTo(x - Math.sin(a) * 10, y + Math.cos(a) * 10); ctx.closePath();
  }
  ctx.fill(); ink(ctx, II); ctx.stroke();
});

// ── corvane-study: one window, one table, and all of Aurelle on it in brass. Key: the model's own lamps, cold and many ──
const DARK_ISLANDS = new Set([2, 7, 9, 13, 18, 24, 26, 31, 33, 36, 39]);   // eleven of forty: twenty-nine lit
if (DARK_ISLANDS.size !== 11) throw new Error(`cinema: the model shows ${40 - DARK_ISLANDS.size} lit islands; the bible says twenty-nine`);
const L_STUDY = light('#7fd8ff', -Math.PI * 0.56, { depth: 0.9, tint: '#2a0c30', amb: '#1e1834' });
def('corvane-study', L_STUDY, (ctx, t, px) => {
  const L = L_STUDY, wx = 806, wy = 34, ww = 150, wh = 230;
  const isl = [];
  for (let i = 0; i < 40; i++) { const c = i % 10, r = Math.floor(i / 10); isl.push({ i, c, r, x: 386 + c * 40 + (r % 2) * 20 + (rnd(i * 3.1) - 0.5) * 16, y: 232 - r * 50 - rnd(i * 5.7) * 22 + Math.abs(c - 4.5) * 5, lit: !DARK_ISLANDS.has(i) }); }
  ctx = S(0.2);
  fillAll(ctx, '#2c1034');
  for (let x = X0; x < X0 + XW; x += 150) { rect(ctx, x, -200, 75, 680, '#341440'); seg(ctx, x, -200, x, 480, INK, II); }
  rect(ctx, X0 - 60, 330, XW + 120, 150, '#1c0c2a'); seg(ctx, X0 - 60, 330, X0 + XW + 60, 330, INK, II);
  rect(ctx, X0 - 60, 480, XW + 120, 540, '#140a24'); seg(ctx, X0 - 60, 480, X0 + XW + 60, 480, INK, IW);
  // the one window: rain, the roofs of Tallis, and a customs shed where Ropewalk would be
  bands(ctx, wx, wy, ww, wh, ['#34427a', '#56669c', '#8c9cc0'], [0.4, 0.72, 1]);
  poly(ctx, [[wx, wy + wh], [wx, wy + wh - 50], [wx + 30, wy + wh - 70], [wx + 60, wy + wh - 50], [wx + 60, wy + wh - 86], [wx + 96, wy + wh - 60], [wx + ww, wy + wh - 64], [wx + ww, wy + wh]], '#34427a');
  poly(ctx, [[wx + 30, wy + wh], [wx + 30, wy + wh - 78], [wx + 96, wy + wh - 112], [wx + ww, wy + wh - 90], [wx + ww, wy + wh]], '#1a1c50');   // the shed
  seg(ctx, wx + ww / 2, wy, wx + ww / 2, wy + wh, INK, IW); seg(ctx, wx, wy + wh * 0.5, wx + ww, wy + wh * 0.5, INK, IW);
  outline(ctx, pR(wx, wy, ww, wh), IW * 1.6);
  flat(ctx, pR(wx - 12, wy + wh, ww + 24, 12), '#4a1c50', II);
  flat(ctx, pP([[wx - 16, wy - 20], [wx - 52, wy - 20], [wx - 40, wy + wh + 60], [wx - 16, wy + wh + 50]]), '#5a1f38', IW);                    // the curtain, drawn back
  // a long-case clock
  cel(ctx, pR(190, 120, 80, 360), '#4a2040', L, { shadow: pR(190, 120, 34, 360), ink: IW, rim: 4 });
  flat(ctx, pE(230, 170, 28, 28), PALETTE.cream, II * 1.5); seg(ctx, 230, 170, 230, 150, INK, 3); seg(ctx, 230, 170, 244, 176, INK, 4);
  // the table: a slate sea with a brass rim
  bloom(ctx, 580, 170, 330, L.col, 0.55);
  flat(ctx, pE(580, 340, 330, 30), PALETTE.brass, IW); flat(ctx, pE(580, 336, 318, 25), '#16245c', II);
  flat(ctx, pP([[330, 350], [830, 350], [800, 480], [360, 480]]), '#241030', IW);
  // forty islands on brass stems, a lamp on each. Twenty-nine burn. A lane is a wire between two lit neighbours; a dark one has none
  for (const a of isl) seg(ctx, a.x, a.y, a.x + (a.x - 580) * 0.12, 336, a.lit ? PALETTE.brass : shadowOf(PALETTE.brass, L), 2.2);
  ink(ctx, 1.8, '#bfe8ff'); ctx.beginPath();
  for (const a of isl) for (const b of isl) {
    if (b.i <= a.i || !a.lit || !b.lit) continue;
    const dc = Math.abs(a.c - b.c), dr = Math.abs(a.r - b.r);
    if ((dr === 0 && dc === 1) || (dr === 1 && dc === 0)) { ctx.moveTo(a.x, a.y - 4); ctx.lineTo(b.x, b.y - 4); }
  }
  ctx.stroke();
  for (const a of isl) {
    if (a.lit) bloom(ctx, a.x, a.y - 8, 24, L.col, 0.9);
    flat(ctx, pP([[a.x - 9, a.y], [a.x + 9, a.y], [a.x + 5, a.y + 6], [a.x - 5, a.y + 6]]), a.lit ? PALETTE.brass : '#3a2a4a', II);
    if (a.lit) { circ(ctx, a.x, a.y - 7, 5.5, WHITE); } else flat(ctx, pP([[a.x - 6, a.y], [a.x, a.y - 12], [a.x + 6, a.y]]), INK, 0);
  }
  ctx = A();
  const o = px * 0.2;
  for (let k = 0; k < 6; k++) { const a = isl[(Math.floor(t * 0.9) * 7 + k * 5) % 40]; if (a.lit) glint(ctx, a.x + o, a.y - 7, 13 * (0.7 + 0.5 * Math.abs(Math.sin(t * 2.8 + k))), WHITE, 1, 0); }
  ctx.strokeStyle = '#dfe8ff'; ctx.lineWidth = 2; ctx.lineCap = 'butt'; ctx.beginPath();
  for (let i = 0; i < 12; i++) { // rain on the glass
    const x = wx + 8 + rnd(i * 3.1) * (ww - 20) + o, y = wy + 6 + mod(rnd(i * 7.3) * wh + t * (90 + rnd(i) * 80), wh - 40);
    ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 22);
  }
  ctx.stroke();
  // the one chair
  ctx = S(0.5);
  cel(ctx, (c) => { c.moveTo(1010, 1000); c.lineTo(1010, 380); c.quadraticCurveTo(1100, 330, 1190, 380); c.lineTo(1190, 1000); c.closePath(); }, '#5a1f38', L, { off: 16, ink: IW, rim: 5 });
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) circ(ctx, 1052 + i * 48, 430 + j * 60, 5, INK);
});

// ── commons-queue: a line of people outside a savings hall at dawn, and the ledger open on a table in the street. Key: first light, at the foot of the street ──
const L_QUEUE = light('#ffcf8a', -Math.PI * 0.88, { depth: 0.78, tint: '#2a1c5c', amb: '#3c3250' });
def('commons-queue', L_QUEUE, (ctx, t, px) => {
  const L = L_QUEUE, sx = 506, sy = 172, hx = 770;
  ctx = S(0.05);
  bands(ctx, X0 - 60, -200, XW + 120, 600, ['#343478', '#84588c', '#e4826a', '#ffc27a', '#ffe9b8'], [0.36, 0.5, 0.6, 0.68, 1]);
  rings(ctx, sx, sy, 230, [alpha('#ffe9b8', 0.2), alpha('#fff0c8', 0.34), alpha('#fff6de', 0.62), '#fffdf2'], [1, 0.66, 0.4, 0.2]);
  cloudStack(ctx, 640, 86, 200, 36, '#84588c', '#343478', 5); cloudStack(ctx, 380, 44, 150, 28, '#84588c', '#343478', 2);
  // the end of the street: the rope-shed, masts, the harbour
  rect(ctx, X0 - 60, 236, XW + 120, 300, '#4a5a9c'); rect(ctx, X0 - 60, 236, XW + 120, 4, '#fff6de');
  for (const [x, h] of [[452, 150], [540, 190], [596, 120], [668, 160]]) { seg(ctx, x, 250, x, 250 - h, INK, 4); seg(ctx, x - 22, 250 - h * 0.7, x + 22, 250 - h * 0.7, INK, 3); seg(ctx, x - 14, 250 - h * 0.9, x + 14, 250 - h * 0.9, INK, 2.5); }
  sil(ctx, pP([[420, 330], [420, 262], [560, 232], [700, 262], [700, 330]]), '#241a5c', L, 4, IW);
  // warehouses down the left side, shuttered: the sun is behind them
  sil(ctx, pP([[X0 - 60, 560], [X0 - 60, 20], [250, 40], [250, 110], [430, 130], [430, 560]]), '#1c1648', L, 5, IW);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) { const x = -160 + c * 100 - (c > 3 ? 0 : 0), y = 80 + r * 104 + (c > 3 ? 70 : 0); if (y > 470) continue; flat(ctx, pR(x, y, 50, 66), '#2a2060', II); seg(ctx, x + 25, y, x + 25, y + 66, INK, II); }
  // the savings hall, with the light full on it
  cel(ctx, pR(hx, -200, 900, 720), '#f0c49a', L, { shadow: pR(hx + 660, -200, 240, 720), ink: IW, rim: 6 });
  for (let i = 0; i < 5; i++) seg(ctx, hx, 60 + i * 92, hx + 900, 60 + i * 92, alpha(INK, 0.35), II);
  cel(ctx, pR(hx - 14, 196, 930, 30), '#d8a07c', L, { shadow: pR(hx - 14, 216, 930, 10), ink: IW, rim: 4 });
  for (let i = 0; i < 4; i++) { const x = hx + 60 + i * 200; if (i === 1) continue; flat(ctx, pArch(x, 20, 70, 150), '#2a2060', IW); rect(ctx, x + 4, 20 + 35, 5, 112, '#f0c49a'); }
  flat(ctx, pArch(hx + 250, 250, 110, 270), '#fff0c0', IW);                                         // the door: open, and lit, and paying
  // places chalked on the wall, so nobody need stand to keep one
  ink(ctx, 2.6, WHITE); ctx.beginPath(); for (let i = 0; i < 12; i++) { const x = hx + 20 + i * 18 + (i > 5 ? 150 : 0); ctx.moveTo(x, 440); ctx.lineTo(x + 3, 462); } ctx.stroke();
  // the street
  flat(ctx, pP([[X0 - 60, 1000], [X0 - 60, 520], [430, 330], [700, 330], [hx, 520], [X0 + XW + 60, 520], [X0 + XW + 60, 1000]]), '#8a6490', 0);
  poly(ctx, [[470, 330], [640, 330], [900, 1000], [300, 1000]], '#f0b48a');                         // the sun, laid up the middle of it
  poly(ctx, [[X0 - 60, 520], [430, 330], [470, 330], [-100, 1000], [X0 - 60, 1000]], '#3a2a66');   // and the warehouses' shadow
  seg(ctx, hx, 520, X0 + XW + 60, 520, INK, IW);
  // three hundred people, and not one of them talking: the line, from the door back down the street
  for (let k = 0; k < 9; k++) {
    const u = k / 8, x = lerp(590, hx + 250, u * u) + (k > 6 ? 0 : 0), y = lerp(322, 440, u), s = lerp(5, 24, u);
    const list = []; for (let i = 0; i < (k < 4 ? 5 : 2); i++) list.push([x - i * s * 1.9 * (k < 4 ? 1 : -0.0) + (k >= 4 ? i * s * 2.1 : 0), y + (i % 2) * s * 0.3, s]);
    busts(ctx, list.map((p) => [p[0] + s * 1.4, p[1] + s * 0.5, s]), alpha(L.shadowTint, 0.45), L, 0, 0);
    busts(ctx, list, k % 2 ? '#2a2060' : '#3a2a4a', L, 1.2 + u * 3, u > 0.5 ? II : 0);
  }
  // the Commons' two rings, hung out over the street
  seg(ctx, hx + 4, 84, hx - 96, 84, INK, 7); rect(ctx, hx - 96, 80, 100, 3, L.rim);
  ctx = A();
  const o = px * 0.3;
  { const sw = Math.sin(t * 0.8) * 5, bx = hx - 86 + o;
    ctx.beginPath(); ctx.moveTo(bx, 90); ctx.lineTo(bx + 66, 90); ctx.lineTo(bx + 66 + sw, 196); ctx.lineTo(bx + 33 + sw, 178); ctx.lineTo(bx + sw, 196); ctx.closePath();
    ink(ctx, IW * 2); ctx.stroke(); ctx.fillStyle = PALETTE.crimson; ctx.fill();
    ctx.fillStyle = '#8a1a3a'; ctx.beginPath(); ctx.moveTo(bx + 40, 90); ctx.lineTo(bx + 66, 90); ctx.lineTo(bx + 66 + sw, 196); ctx.lineTo(bx + 40 + sw * 0.8, 181); ctx.fill();
    ink(ctx, 4.5, PALETTE.brass); ctx.beginPath(); ctx.arc(bx + 24 + sw * 0.4, 132, 15, 0, TAU); ctx.moveTo(bx + 57 + sw * 0.4, 132); ctx.arc(bx + 42 + sw * 0.4, 132, 15, 0, TAU); ctx.stroke();
    glint(ctx, bx + 16 + sw * 0.4, 122, 9, WHITE, 1, 0); }
  spark(ctx, sx + px * 0.05, sy, 42, t, 12);
  for (let i = 0; i < 3; i++) { const ph = mod(t * 0.3 + i / 3, 1); curl(ctx, 640 + i * 70 + px * 0.33, 316 - ph * 40, 7 + ph * 7, 1.3, i % 2 ? 1 : -1, 4, WHITE, ph < 0.6 ? II : 0); }   // their breath, in the cold
  // the table in the street, and the book open on it for anyone to read
  ctx = S(0.5);
  const tx = 1010, ty = 570;
  flat(ctx, pP([[tx - 90, ty + 40], [tx + 600, ty + 100], [tx + 600, ty + 180], [tx + 60, ty + 110]]), alpha(L.shadowTint, 0.45), 0);
  cel(ctx, pR(tx - 150, ty, 300, 26), '#8a5a3a', L, { off: 8, ink: IW, rim: 5 }); flat(ctx, pR(tx - 130, ty + 26, 20, 300), '#5a3a4a', IW); flat(ctx, pR(tx + 110, ty + 26, 20, 300), '#5a3a4a', IW);
  flat(ctx, pP([[tx - 100, ty], [tx, ty - 4], [tx - 6, ty - 40], [tx - 92, ty - 34]]), WHITE, IW); flat(ctx, pP([[tx, ty - 4], [tx + 100, ty], [tx + 90, ty - 34], [tx - 6, ty - 40]]), PALETTE.cream, IW);
  ink(ctx, II); ctx.beginPath(); for (let i = 0; i < 4; i++) { ctx.moveTo(tx - 84, ty - 28 + i * 7); ctx.lineTo(tx - 18, ty - 32 + i * 7); ctx.moveTo(tx + 10, ty - 32 + i * 7); ctx.lineTo(tx + 80, ty - 28 + i * 7); } ctx.stroke();
});

// ── clearing-house: vault doors, sorting tables, night. Key: the one lamp they have lit, held low ──
const L_CLEAR = light(PALETTE.lantern, -Math.PI * 0.74, { depth: 0.92, tint: '#0a1a48', amb: '#161e3c' });
/** a vault door: a steel disc, a handwheel, and the bolts round it */
function vaultDoor(ctx, x, y, r, L, lit) {
  flat(ctx, pE(x, y, r * 1.14, r * 1.14), '#0e0b2a', IW);
  cel(ctx, pE(x, y, r, r), lit ? '#5e6ea6' : '#2a3068', L, { off: r * 0.22, ink: IW, rim: lit ? 7 : 3 });
  outline(ctx, pE(x, y, r * 0.74, r * 0.74), II);
  for (let i = 0; i < 12; i++) { const a = i * TAU / 12; circ(ctx, x + Math.cos(a) * r * 0.87, y + Math.sin(a) * r * 0.87, r * 0.045, INK); }
  ink(ctx, r * 0.07, lit ? PALETTE.brass : shadowOf(PALETTE.brass, L)); ctx.beginPath(); ctx.arc(x, y, r * 0.4, 0, TAU);
  for (let i = 0; i < 5; i++) { const a = i * TAU / 5 - 0.3; ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r * 0.4, y + Math.sin(a) * r * 0.4); }
  ctx.stroke();
  flat(ctx, pE(x, y, r * 0.11, r * 0.11), lit ? PALETTE.brass : shadowOf(PALETTE.brass, L), II);
  if (lit) { glint(ctx, x - r * 0.3, y - r * 0.28, r * 0.13, WHITE, 1, 0); glint(ctx, x - r * 0.72, y - r * 0.5, r * 0.09, WHITE, 1, 0); }
}
def('clearing-house', L_CLEAR, (ctx, t, px) => {
  const L = L_CLEAR, lx = 452, ly = 146;
  ctx = S(0.15);
  fillAll(ctx, '#121844');
  // not yet light, in the roof
  rect(ctx, X0 - 60, -200, XW + 120, 232, '#0a0e30'); for (let x = X0; x < X0 + XW; x += 120) flat(ctx, pP([[x + 10, -200], [x + 110, -200], [x + 96, 22], [x + 24, 22]]), '#1a2a6c', II);
  rect(ctx, X0 - 60, 26, XW + 120, 12, '#0e0b2a');
  rect(ctx, X0 - 60, 480, XW + 120, 540, '#0c1030'); seg(ctx, X0 - 60, 480, X0 + XW + 60, 480, INK, IW);
  // the tube wall: every counting-house in Aurelle is on the other end of one of these
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) { const x = -20 + c * 66, y = 110 + r * 82; flat(ctx, pE(x, y, 24, 24), shadowOf(PALETTE.brass, L), IW); circ(ctx, x, y, 14, '#0a0e30'); rect(ctx, x - 14, y + 32, 28, 9, '#2a3068'); }
  // pigeonholes: the morning sheet, sorted by city
  flat(ctx, pR(540, 56, 156, 184), '#2a1c44', IW);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { const x = 548 + c * 37, y = 64 + r * 44; rect(ctx, x, y, 31, 36, '#0e0b2a'); if (rnd(r * 5 + c * 3) < 0.7) { rect(ctx, x + 3, y + 14 + rnd(r + c) * 8, 25, 22 - rnd(r + c) * 8, PALETTE.cream); rect(ctx, x + 3, y + 14 + rnd(r + c) * 8, 25, 3, WHITE); } }
  // vault doors
  vaultDoor(ctx, 852, 176, 138, L, true);
  vaultDoor(ctx, 1230, 190, 124, L, false);
  // the lamp, and what it reaches
  shaft(ctx, lx, ly, Math.PI / 2, 700, 1.25, L.col, 0.18);
  lampShade(ctx, lx, ly, 48, '#2a3068', L, -200);
  source(ctx, lx, ly + 8, 200, L);
  ctx = A();
  spark(ctx, lx + px * 0.15, ly + 8, 34, t, 13);
  { const ph = mod(t * 0.22, 1); if (ph < 0.5) curl(ctx, 112 + px * 0.15, 104 - ph * 60, 8 + ph * 26, 1.4, 1, 6, WHITE, II); }   // one of them has just been sent: it went like a breath
  // the sorting tables: sacks, a brass carrier open, and a sheaf of photographs
  ctx = S(0.6);
  for (const x of [-180, 300, 780, 1260]) {
    const lit = x === 300;
    cel(ctx, pR(x, 540, 400, 30), lit ? '#8a5a3a' : '#2a1c44', L, { off: 8, ink: IW, rim: lit ? 6 : 3 });
    flat(ctx, pR(x + 20, 570, 26, 440), '#1a1238', IW); flat(ctx, pR(x + 354, 570, 26, 440), '#1a1238', IW);
    if (lit) {
      flat(ctx, pP([[x + 60, 540], [x + 150, 540], [x + 160, 514], [x + 70, 514]]), PALETTE.cream, IW); flat(ctx, pP([[x + 80, 520], [x + 170, 524], [x + 176, 498], [x + 88, 494]]), WHITE, IW);
      cel(ctx, pR(x + 230, 510, 110, 30), PALETTE.brass, L, { off: 8, ink: IW, rim: 4 }); flat(ctx, pE(x + 340, 525, 9, 15), '#0e0b2a', II);
    } else for (let i = 0; i < 2; i++) cel(ctx, pE(x + 120 + i * 170, 506, 70, 40), '#3a3a6c', L, { off: 12, ink: IW, rim: 3 });
  }
});

// ── cell: a cell kept for persons of standing. Key: the lamp they will take away at ten ──
const L_CELL = light('#ffb060', -Math.PI * 0.72, { depth: 0.92, tint: '#10184c', amb: '#181c3c' });
def('cell', L_CELL, (ctx, t, px) => {
  const L = L_CELL, lx = 560, ly = 150, sy = 204;
  ctx = S(0.2);
  fillAll(ctx, '#161a48');
  rings(ctx, lx, ly, 330, ['#1e2458', '#2c3470', '#46508e'], [1, 0.66, 0.36]);                    // the wall, as far as the lamp reaches it
  ink(ctx, II); ctx.beginPath();
  for (let r = -2; r < 6; r++) { // dressed stone
    const y = r * 96 + 10; ctx.moveTo(X0 - 60, y); ctx.lineTo(X0 + XW + 60, y);
    for (let x = X0 + (r % 2) * 110; x < X0 + XW; x += 220) { ctx.moveTo(x, y); ctx.lineTo(x, y + 96); }
  }
  ctx.stroke();
  rect(ctx, X0 - 60, 490, XW + 120, 520, '#0e0b2a'); seg(ctx, X0 - 60, 490, X0 + XW + 60, 490, INK, IW);
  // the window: high, barred, and facing nothing
  const wx = 800, wy = 34;
  flat(ctx, pArch(wx - 14, wy - 14, 128, 150), '#46508e', IW);
  flat(ctx, pArch(wx, wy, 100, 122), '#07081c', IW); glint(ctx, wx + 66, wy + 40, 7, WHITE, 1, 0);
  for (let i = 1; i < 4; i++) { rect(ctx, wx + i * 25 - 4, wy + 4, 8, 118, INK); rect(ctx, wx + i * 25 - 4, wy + 30, 2.5, 92, L.col); }
  // the door, and somebody's lantern in the passage
  sil(ctx, pArch(120, 150, 180, 340), '#2a1c44', L, 5, IW);
  for (let i = 0; i < 3; i++) seg(ctx, 120, 250 + i * 90, 300, 250 + i * 90, INK, IW);
  flat(ctx, pR(180, 196, 60, 44), L.col, IW); for (let i = 1; i < 4; i++) seg(ctx, 180 + i * 15, 196, 180 + i * 15, 240, INK, 3.5);
  // persons of standing are allowed a shelf, a peg and a basin
  poly(ctx, [[lx - 96, sy + 12], [lx + 150, sy + 12], [lx + 210, sy + 60], [lx - 60, sy + 60]], alpha(L.shadowTint, 0.55));
  cel(ctx, pR(lx - 100, sy, 250, 13), '#8a5a3a', L, { off: 5, ink: IW, rim: 4 });
  for (const x of [lx - 76, lx + 120]) flat(ctx, pP([[x, sy + 13], [x + 12, sy + 13], [x, sy + 44]]), '#5a3a4a', II);
  cel(ctx, (c) => { c.moveTo(lx + 66, sy - 24); c.lineTo(lx + 134, sy - 24); c.quadraticCurveTo(lx + 126, sy, lx + 100, sy); c.quadraticCurveTo(lx + 74, sy, lx + 66, sy - 24); c.closePath(); }, PALETTE.cream, L, { off: 9, ink: IW, rim: 4 });
  { const x = 936; circ(ctx, x, 110, 7, INK); // the greatcoat he was brought here in, on the one peg
    poly(ctx, [[x + 30, 130], [x + 130, 250], [x + 140, 470], [x + 40, 470]], alpha(L.shadowTint, 0.55));
    cel(ctx, (c) => { c.moveTo(x, 112); c.quadraticCurveTo(x + 50, 130, x + 58, 200); c.lineTo(x + 66, 440); c.lineTo(x - 60, 440); c.lineTo(x - 54, 200); c.quadraticCurveTo(x - 46, 130, x, 112); c.closePath(); }, '#3c3460', L, { off: 14, ink: IW, rim: 5 });
    seg(ctx, x, 150, x, 440, INK, II); flat(ctx, pP([[x, 112], [x + 30, 132], [x + 6, 176]]), '#7a6aa8', II); flat(ctx, pP([[x, 112], [x - 30, 132], [x - 6, 176]]), '#7a6aa8', II);
    seg(ctx, x - 40, 200, x - 44, 400, INK, II); seg(ctx, x + 42, 200, x + 48, 400, INK, II); for (let i = 0; i < 3; i++) circ(ctx, x + 12, 220 + i * 60, 5, PALETTE.brass); }
  // the lamp
  source(ctx, lx, ly, 210, L);
  flat(ctx, pP([[lx - 26, sy], [lx - 20, sy - 16], [lx + 20, sy - 16], [lx + 26, sy]]), PALETTE.brass, IW);
  flat(ctx, (c) => { c.moveTo(lx - 15, sy - 16); c.quadraticCurveTo(lx - 26, sy - 50, lx - 9, sy - 86); c.lineTo(lx + 9, sy - 86); c.quadraticCurveTo(lx + 26, sy - 50, lx + 15, sy - 16); c.closePath(); }, L.core, IW);
  ctx = A();
  const o = px * 0.2;
  ctx.fillStyle = L.col; ctx.beginPath(); ctx.moveTo(lx - 7 + o, sy - 20); ctx.quadraticCurveTo(lx - 11 + o, sy - 40, lx + o + Math.sin(t * 9) * 2, sy - 58 - Math.sin(t * 13) * 3); ctx.quadraticCurveTo(lx + 11 + o, sy - 40, lx + 7 + o, sy - 20); ctx.fill();
  spark(ctx, lx + o, ly + 6, 30, t, 14);
  { const a = t * 1.7, r = 50 + Math.sin(t * 0.9) * 16, mx = lx + o + Math.cos(a) * r, my = ly - 6 + Math.sin(a * 1.3) * r * 0.5, f = Math.sin(t * 30) * 5; // a moth, round the glass
    poly(ctx, [[mx, my], [mx - 7, my - 4 - f], [mx - 3, my + 3]], INK); poly(ctx, [[mx, my], [mx + 7, my - 4 - f], [mx + 3, my + 3]], INK); }
  // the table, and one sheet
  ctx = S(0.85);
  poly(ctx, [[300, 640], [1100, 640], [1300, 1000], [200, 1000]], alpha(L.shadowTint, 0.5));
  cel(ctx, pR(330, 606, 700, 26), '#8a5a3a', L, { off: 8, ink: IW, rim: 6 }); flat(ctx, pR(360, 632, 30, 400), '#5a3a4a', IW); flat(ctx, pR(970, 632, 30, 400), '#5a3a4a', IW);
  flat(ctx, pP([[600, 606], [730, 606], [744, 584], [614, 584]]), WHITE, IW);
});
