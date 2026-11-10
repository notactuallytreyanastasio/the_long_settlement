// Backdrop painters, first half (the ledger, the Line, chapters 1 and 2). Part of the cinematic renderer: see ../cinema.js.
// Exports BACKDROPS_A: key -> { light, back(ctx, t, px, info), front?(ctx, t, px, info) }.
// Still and moving sections are marked with ctx = S(depth) and ctx = A(): the contract is written out in kit.js.
//
// The look: flat colour, indigo ink, one hard key light per place (../style.js). Every backdrop declares its key
// light as a style Light and passes it to def(), so the cast is lit from the same side. Almost everything is
// painted into still layers; what moves is small: a flame, a few lanterns, a glint.
//
// Where things must sit. On a phone the cast fills the lower three quarters of the picture, so only a strip of
// the painting is seen whole: about x 360..920 (around the backdrop's portrait pan, 640 unless cinema.js says
// otherwise) and y 50..210. The lamp that lights each place hangs inside that strip. The wide film shows the
// rest: the middle between two figures (x 520..760) and both sides, down to about y 560 where the words begin.
import {
  TAU, lerp, mod, rnd, fillAll, rect, circ, poly, wrapText, FONT_SERIF, FONT_SCRIPT, FONT_MONO, S, A, motes, sigilScale, waveform, X0, XW,
  LINE_LIGHT, chalkLine, LINE_ID, revealCount,
} from './kit.js';
import { drawFigure } from './figures.js';
import {
  INK, PALETTE as C, light as keyLight, shade, tint, blend, alpha, ink, outline, taperPath, cel, bloom, shaft, glint, bands, rings, curl, gust,
  cloud, puff, waves,
} from '../style.js';

export const BACKDROPS_A = Object.create(null);
function def(key, light, back, front) { BACKDROPS_A[key] = { light, back, front: front || null }; }

// ───────────────────────── local kit ─────────────────────────
const IW = 4, II = 2.2;   // ink weights in stage units: one unit is about 0.72 px on a phone, so these are 3 and 1.5 there
const LCOLS = [C.lantern, '#ffc65a', '#ff6a3a', '#ffe2a0', C.crimson, '#ffb04a', '#5fd6c8'];
const FIRE = ['#e8401c', C.lantern, C.white], COLD = ['#2a66dc', '#7fd8ff', '#f2fcff'];

// path functions (see style.js): each adds one closed outline to the current path
const pp = (pts) => (c) => { c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); };
const rp = (x, y, w, h) => (c) => { c.rect(x, y, w, h); };
const cp = (x, y, r) => (c) => { c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); c.closePath(); };
const ep = (x, y, rx, ry) => (c) => { c.moveTo(x + rx, y); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.closePath(); };
const rrp = (x, y, w, h, r) => (c) => { c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
/** an arch standing on (x, y)..(x + w, y), h tall, round-headed */
const archP = (x, y, w, h) => (c) => { const r = w / 2; c.moveTo(x, y); c.lineTo(x, y - h + r); c.arc(x + r, y - h + r, r, Math.PI, 0); c.lineTo(x + w, y); c.closePath(); };

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
/** a few glints that breathe: pts [[x, y, r], ...] */
function twinkle(ctx, pts, t, col = C.white) {
  for (let i = 0; i < pts.length; i++) glint(ctx, pts[i][0], pts[i][1], pts[i][2] * (0.75 + 0.35 * Math.sin(t * (1.3 + i * 0.37) + i * 2.1)), col, 1, 0);
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
function swayLantern(ctx, x, y, s, col, L, t, seed, bloomK = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 1.1 + seed * 7) * 0.1 + Math.sin(t * 0.37 + seed * 3) * 0.05);
  paperLantern(ctx, 0, 0, s, col, L, true, bloomK);
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
/** a fire of several tongues standing on a line s wide about (x, y): the two at the sides behind, the tall ones in front */
function blaze(ctx, x, y, s, t, seed) {
  fire(ctx, x - s * 0.62, y, s * 0.42, t * 1.1, seed + 1); fire(ctx, x + s * 0.66, y, s * 0.36, t * 0.9, seed + 2);
  fire(ctx, x + s * 0.24, y, s * 0.56, t, seed + 3); fire(ctx, x - s * 0.2, y, s * 0.74, t * 0.8, seed + 4);
}
/**
 * A standing crowd as flat silhouettes, each with a rim of light on the side of the lamp. Still.
 * o: { rim (width), rimCol, hat, fists, signs, signCol } as fractions of the row, like kit crowdRow.
 */
function crowd(ctx, seed, x0, x1, y, n, s, col, L, o = {}) {
  const rw = o.rim === undefined ? s * 0.16 : o.rim, rc = o.rimCol || L.rim;
  for (let i = 0; i < n; i++) {
    const x = lerp(x0, x1, (i + rnd(seed + i) * 0.8) / n), yy = y + rnd(seed * 2 + i) * s * 0.55, r1 = rnd(i * 5 + seed), sd = rnd(i + seed * 9) < 0.5 ? -1 : 1;
    const hat = o.hat && rnd(i * 7 + seed) < o.hat, fist = o.fists && r1 < o.fists, sign = !fist && o.signs && r1 > 1 - o.signs;
    for (let pass = 0; pass < 2; pass++) {
      const ox = pass ? 0 : L.dx * rw, oy = pass ? 0 : L.dy * rw;
      ctx.fillStyle = pass ? col : rc;
      if (sign) {
        ctx.fillRect(x + s * 0.44 + ox, yy - s * 2.2 + oy, s * 0.14, s * 3.4);
        if (pass) { rect(ctx, x - s * 0.5, yy - s * 3.3, s * 2, s * 1.2, o.signCol || C.cream); ink(ctx, Math.max(1.2, s * 0.09)); ctx.strokeRect(x - s * 0.5, yy - s * 3.3, s * 2, s * 1.2); rect(ctx, x - s * 0.24, yy - s * 3.0, s * 1.4, s * 0.16, INK); rect(ctx, x - s * 0.24, yy - s * 2.66, s * 1.0, s * 0.16, INK); ctx.fillStyle = col; }
      }
      if (fist) {
        ctx.beginPath(); ctx.moveTo(x + sd * s * 0.5 + ox, yy + s * 1.1 + oy); ctx.lineTo(x + sd * s * 0.82 + ox, yy - s * 1.0 + oy); ctx.lineTo(x + sd * s * 1.14 + ox, yy - s * 1.0 + oy); ctx.lineTo(x + sd * s * 0.98 + ox, yy + s * 1.1 + oy); ctx.fill();
        ctx.beginPath(); ctx.arc(x + sd * s * 0.98 + ox, yy - s * 1.14 + oy, s * 0.29, 0, TAU); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(x + ox, yy + oy, s * 0.46, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - s * 0.92 + ox, yy + s * 4.6 + oy); ctx.lineTo(x - s * 0.92 + ox, yy + s * 1.36 + oy); ctx.arc(x + ox, yy + s * 1.36 + oy, s * 0.92, Math.PI, 0); ctx.lineTo(x + s * 0.92 + ox, yy + s * 4.6 + oy); ctx.fill();
      if (hat) { ctx.fillRect(x - s * 0.64 + ox, yy - s * 0.42 + oy, s * 1.28, s * 0.18); ctx.fillRect(x - s * 0.38 + ox, yy - s * 0.7 + oy, s * 0.76, s * 0.32); }
    }
  }
}
/** a flat row of buildings, some gabled, some with a chimney; a rim strip toward the lamp; lit windows as flat rects. o: { rim, rimCol, win, winP } */
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
/** a stack of files lying flat, bottom at y: flat bands with an ink line between, some tied in crimson. dim 0..1 drops them into shadow. Returns the top. */
const FILE_COLS = ['#f3e3bb', '#d9c08a', '#bfd0cc', '#8fb4b8', '#e8cf9a', '#c9a868'];
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

def('black', { amb: '#0b0b10', rim: '#8c93a8', key: -1 }, (ctx) => { fillAll(ctx, '#000'); });

// ── ledger: narration over an open account book; the entry writes itself. Key light: the candle at its left edge ──
function ledgerEntries(ctx, info, colW, maxRows) {
  // every consecutive narrator line up to the current one is an entry on the page
  let start = info.index;
  while (start > 0 && info.lines[start - 1].who === 'narrator') start--;
  let entries = [];
  for (let i = start; i <= info.index; i++) entries.push({ n: i - start + 1, rows: wrapText(ctx, info.lines[i].text, colW), text: info.lines[i].text, cur: i === info.index });
  let total = entries.reduce((s, e) => s + e.rows.length + 1, 0);
  while (total > maxRows && entries.length > 1) { total -= entries[0].rows.length + 1; entries = entries.slice(1); } // the page has been turned
  return entries;
}
const L_LEDGER = keyLight('#ffb45a', -Math.PI * 0.93, { depth: 0.85 });
def('ledger', L_LEDGER, (ctx, t, px, info) => {
  const L = L_LEDGER;
  const bx = 120 + px * 0.5, by = 78, bw = 1040, bh = 660, half = bw / 2;
  const cx = 131 + px * 0.5, fy = 300;      // the candle stands on the desk in front of the book's left margin; fy is the wick
  const PAPER = '#ead9ae', PAPER_LIT = '#fdf3d4', PAPER_SH = '#c4aa7e';
  ctx = S(0.5);
  fillAll(ctx, '#0f0a20');
  rings(ctx, cx, fy, 1000, ['#1a0f2c', '#2c1534', '#4a2034'], [1, 0.7, 0.42]);   // the candle's pool on the desk, in three flat steps
  for (let i = 0; i < 9; i++) { const y = -150 + i * 126 + rnd(i) * 30; stroke(ctx, X0, y, X0 + XW, y + rnd(i * 3) * 18 - 9, 2.6, alpha(INK, 0.75)); }
  // the book: its hard shadow, the cover, the block of pages
  flat(ctx, rp(bx + 4, by + 8, bw + 44, bh + 40), alpha(C.night, 0.8));
  cel(ctx, rrp(bx - 18, by - 14, bw + 36, bh + 32, 10), '#8a1e30', L, { off: 9, ink: IW, rim: 3 });
  for (let i = 3; i >= 1; i--) rect(ctx, bx - i * 2.4, by + i * 2, bw + i * 4.8, bh, i % 2 ? '#bca67a' : '#9c875e');
  ctx.save();
  ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.clip();
  rect(ctx, bx, by, bw, bh, PAPER);
  ctx.fillStyle = PAPER_SH; ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.moveTo(cx + 780, fy); ctx.arc(cx, fy, 780, 0, TAU); ctx.fill('evenodd');   // far from the flame the paper drops to its shadow tone
  circ(ctx, cx, fy, 400, PAPER_LIT);                                                                                                                  // and close to it, it is nearly white
  rect(ctx, bx + half - 14, by, 14, bh, PAPER_SH); rect(ctx, bx + half, by, 20, bh, shade(PAPER_SH, 0.22));                                           // the gutter
  ctx.restore();
  stroke(ctx, bx + half, by, bx + half, by + bh, II);
  outline(ctx, rp(bx, by, bw, bh), II);
  // rules, drawn by hand: not quite straight
  const top = by + 92, lh = 36, rows = 13, mL = 64, mR = 92;
  for (let side = 0; side < 2; side++) {
    const x0 = bx + side * half, xa = x0 + 22, xb = x0 + half - 22;
    for (let r = 0; r <= rows; r++) { const y = top + r * lh + 8; stroke(ctx, xa, y + rnd(r + side * 20) * 1.4, xb, y + rnd(r * 3 + side * 9) * 1.4, 1.2, alpha(C.seaDeep, 0.4)); }
    stroke(ctx, xa, top - lh + 6, xb, top - lh + 7, 1.6, alpha(C.crimson, 0.75));
    stroke(ctx, xa, top - lh + 11, xb, top - lh + 12, 1.6, alpha(C.crimson, 0.75));
    for (const vx of [x0 + mL, x0 + half - mR, x0 + half - mR + 5]) stroke(ctx, vx, top - lh + 6, vx + 1, by + bh - 20, 1.3, alpha(C.crimson, 0.6));
    ctx.fillStyle = alpha(INK, 0.8); ctx.font = `700 16px ${FONT_SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('No.', x0 + mL / 2 + 10, top - lh + 1);
    ctx.fillText('PARTICULARS', x0 + (mL + half - mR) / 2, top - lh + 1);
    ctx.fillText(side ? 'OWED' : 'PAID', x0 + half - mR / 2 - 8, top - lh + 1);
  }
  ctx.fillStyle = alpha(INK, 0.9); ctx.font = `28px ${FONT_SCRIPT}`; ctx.textAlign = 'center';
  ctx.fillText('Forty lights, in account with one another', bx + half / 2 + 14, by + 34);
  ctx.fillText('The Long Settlement', bx + half * 1.5, by + 34);
  // the entries
  ctx = A();
  ctx.font = `25px ${FONT_SCRIPT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const colW = half - mL - mR - 22;
  const R = rows - 1; // rows of writing per page: the last ruled row sits under the subtitle
  const pages = info.onePage ? 1 : 2;   // a tall frame shows only the left-hand page: the page is turned sooner
  const entries = ledgerEntries(ctx, info, colW, R * pages);
  const shown = revealCount(info.lines[info.index], info.lineT);
  let row = 0, pen = null;
  const at = (r) => ({ x: bx + (r >= R ? half : 0) + mL + 12, y: top + (r % R) * lh + 2, x0: bx + (r >= R ? half : 0) });
  for (const e of entries) {
    let left = e.cur ? shown : Infinity;
    const p0 = at(row);
    if (row < R * pages) {
      ctx.fillStyle = C.crimson; ctx.font = `20px ${FONT_SCRIPT}`; ctx.textAlign = 'center';
      ctx.fillText(String(e.n) + '.', p0.x0 + mL / 2 + 14, p0.y);
      ctx.font = `25px ${FONT_SCRIPT}`; ctx.textAlign = 'left';
    }
    for (const rtxt of e.rows) {
      if (row >= R * pages) break;
      const p = at(row);
      const part = left >= rtxt.length ? rtxt : rtxt.slice(0, Math.max(0, left));
      ctx.fillStyle = e.cur ? INK : alpha(INK, 0.72);
      if (part) ctx.fillText(part, p.x, p.y);
      if (e.cur && left < rtxt.length && left >= 0 && !pen) pen = { x: p.x + ctx.measureText(part).width, y: p.y };
      left -= rtxt.length + 1;
      row++;
    }
    if (!e.cur || shown >= e.text.length) {
      // a finished entry is ticked off in the money column
      const p = at(Math.min(row - 1, R * pages - 1));
      const tx = p.x0 + half - mR / 2 - 8;
      ink(ctx, 2.6, C.crimson); ctx.beginPath(); ctx.moveTo(tx - 16, p.y - 8); ctx.lineTo(tx - 8, p.y); ctx.lineTo(tx + 12, p.y - 18); ctx.stroke();
    }
    row++;
  }
  // the ribbon, and the candle in its dish
  ctx = S(0.5);
  const rb = (c) => { c.moveTo(bx + half + 4, by - 8); c.bezierCurveTo(bx + half + 30, by + 200, bx + half - 14, by + 420, bx + half + 12, by + bh + 46); c.lineTo(bx + half + 22, by + bh + 30); c.lineTo(bx + half + 32, by + bh + 46); c.bezierCurveTo(bx + half + 4, by + 420, bx + half + 48, by + 200, bx + half + 22, by - 8); c.closePath(); };
  cel(ctx, rb, C.crimson, L, { off: 5, ink: II });
  bloom(ctx, cx, fy - 26, 190, L.col, 1);
  cel(ctx, ep(cx, 640, 46, 13), C.brass, L, { off: 6, ink: II });
  cel(ctx, rp(cx - 17, fy, 34, 338), C.cream, L, { off: 0, shadow: false, ink: II });
  rect(ctx, cx + 4, fy + 2, 11, 334, '#c9a880');                                             // the candle's one shadow tone, on the side away from the page it lights
  cel(ctx, ep(cx, fy, 17, 6), tint(C.cream, 0.6), L, { off: 0, shadow: false, ink: 1.6 });
  flat(ctx, pp([[cx - 17, fy + 30], [cx - 23, fy + 70], [cx - 17, fy + 96]]), C.cream);       // a run of wax
  stroke(ctx, cx, fy, cx, fy - 9, 2.2);
  ctx = A();
  fire(ctx, cx, fy - 6, 13, t, 2);
  glint(ctx, cx, fy - 22, 30 + 5 * Math.sin(t * 3.1), C.white, 0.9, 0);
  // the pen
  if (pen) {
    const jx = Math.sin(t * 23) * 1.2, jy = Math.cos(t * 31) * 1.2;
    ctx.save(); ctx.translate(pen.x + jx + 2, pen.y + jy + 2); ctx.rotate(-0.72);
    ctx.fillStyle = alpha(C.night, 0.35); ctx.beginPath(); ctx.ellipse(118, 34, 124, 8, 0.06, 0, TAU); ctx.fill();
    ink(ctx, 2); ctx.beginPath(); ctx.moveTo(24, -7); ctx.lineTo(250, -5); ctx.quadraticCurveTo(260, 0, 250, 5); ctx.lineTo(24, 7); ctx.closePath();
    ctx.fillStyle = C.indigo; ctx.fill(); ctx.stroke();
    rect(ctx, 30, -6, 216, 4, '#5a52b0');
    poly(ctx, [[0, 0], [22, -7], [27, 0], [22, 7]], C.brass); ctx.stroke();
    rect(ctx, 24, -7.5, 14, 15, C.brass); ctx.strokeRect(24, -7.5, 14, 15);
    ctx.restore();
    circ(ctx, pen.x + 1, pen.y - 1, 2.4, INK);
  }
});

// ── line: the earpiece call. Nothing is lit but the dial ──
def('line', LINE_LIGHT, (ctx, t, px, info) => {
  ctx = S(0.25);
  fillAll(ctx, '#03101a');
  const cx = 248 + px * 0.3, cy = 322, TEAL = '#5fe0c8';
  rings(ctx, cx, cy, 560, ['#051a26', '#072a34', '#0a3e44'], [1, 0.68, 0.42]);
  ink(ctx, 1.4, alpha(TEAL, 0.07));
  ctx.beginPath();
  for (let x = -256; x < 1540; x += 64) { ctx.moveTo(x + px * 0.2, -180); ctx.lineTo(x + px * 0.2, 980); }
  for (let y = -160; y < 980; y += 64) { ctx.moveTo(X0, y); ctx.lineTo(X0 + XW, y); }
  ctx.stroke();
  ctx = A();
  for (let i = 1; i <= 4; i++) {
    const r = 150 + i * 110 + mod(t * 26, 110);
    ink(ctx, 3, alpha(TEAL, 0.2 * (1 - (r - 150) / 560)));
    ctx.beginPath(); ctx.arc(cx, cy, r, -0.9, 0.9); ctx.stroke();
  }
  stroke(ctx, 400, cy, 1340, cy, 1.5, alpha(TEAL, 0.25));
  waveform(ctx, 404, 1300, cy, 96, info.level * 0.8, info.tms * 1.31 + 900, '#1c7a78', 4);
  waveform(ctx, 404, 1300, cy, 170, info.level, info.tms, INK, 10);
  waveform(ctx, 404, 1300, cy, 170, info.level, info.tms, '#8ff5dc', 5);
  ctx.fillStyle = '#1c8a80';
  for (let i = 0; i < 56; i++) {
    const h = 4 + (0.08 + info.level) * 46 * (0.3 + 0.7 * Math.abs(Math.sin(i * 0.9 + info.tms * 0.008 + rnd(i) * 6)));
    ctx.fillRect(410 + i * 15, 520 - h, 9, h);
  }
  // the voice on the other end
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, 128, 0, TAU);
  ctx.fillStyle = '#062630'; ctx.fill();
  ctx.clip();
  circ(ctx, cx - 44, cy - 50, 120, '#0c4a50');
  if (info.portrait && info.portrait.look && info.portrait.id !== 'crowd' && info.portrait.id !== 'narrator') {
    ctx.translate(cx, cy + 118); ctx.scale(1.22, 1.22);
    drawFigure(ctx, info.portrait, { emote: info.portraitEmote, talk: info.level, focus: 0.8, light: LINE_LIGHT, facing: 1, gaze: 0.2, t });
  } else {
    ink(ctx, 7, TEAL);
    ctx.beginPath(); ctx.arc(cx, cy - 6, 44, Math.PI * 0.9, Math.PI * 2.1); ctx.stroke();
    circ(ctx, cx + 34, cy + 30, 16, TEAL);
  }
  ctx.restore();
  // the bezel: brass, inked, a hard light on its upper left
  ink(ctx, 16, INK); ctx.beginPath(); ctx.arc(cx, cy, 133, 0, TAU); ctx.stroke();
  ink(ctx, 9, C.brass); ctx.beginPath(); ctx.arc(cx, cy, 133, 0, TAU); ctx.stroke();
  ink(ctx, 4, shade(C.brass, 0.5)); ctx.beginPath(); ctx.arc(cx, cy, 135.5, -0.2, Math.PI * 0.75); ctx.stroke();
  ink(ctx, 4, C.white); ctx.beginPath(); ctx.arc(cx, cy, 131, Math.PI * 1.05, Math.PI * 1.45); ctx.stroke();
  ink(ctx, 2.4, alpha(TEAL, 0.7));
  ctx.beginPath();
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * TAU + t * 0.08, r0 = 148, r1 = i % 3 ? 155 : 164;
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
  }
  ctx.stroke();
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = `700 19px ${FONT_MONO}`; ctx.fillStyle = '#8ff5dc';
  const live = !info.portrait || info.portrait.id === LINE_ID;
  ctx.fillText(live ? 'THE LINE' : 'RECORDING', 96 + px * 0.3, 112);
  ctx.font = `16px ${FONT_MONO}`; ctx.fillStyle = '#3fb0a4';
  ctx.fillText(live ? 'HALCYON SURETY / PROCTOR CHANNEL / SEALED' : `LISTENING SHELL / PLAYBACK / ${String(info.portrait.name).toUpperCase()}`, 96 + px * 0.3, 138);
  const s = Math.floor(t);
  ctx.textAlign = 'right';
  ctx.fillText(`${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}  CARRIER ${(412.5 + Math.sin(t * 0.7) * 0.2).toFixed(2)}`, 1196 + px * 0.3, 112);
  if (live && mod(t, 1.2) < 0.7) { circ(ctx, 78 + px * 0.3, 105, 7, C.crimson); }
  ctx.textAlign = 'left';
  ctx = S(0);
  for (let y = -40; y < 860; y += 6) rect(ctx, X0, y, XW, 1.5, 'rgba(0,0,0,.2)');
});

// ── harbor-night: Vessery harbour, ten thousand paper lanterns. Key light: the great festival lantern on the quay ──
const L_HARBOR = keyLight(C.lantern, -Math.PI * 0.72, { depth: 0.85 });
const L_MOON = keyLight('#bcd0ff', -Math.PI * 0.25);
/** a point on the quadratic from a through c to b */
const quadAt = (a, c, b, u) => [(1 - u) * (1 - u) * a[0] + 2 * u * (1 - u) * c[0] + u * u * b[0], (1 - u) * (1 - u) * a[1] + 2 * u * (1 - u) * c[1] + u * u * b[1]];
def('harbor-night', L_HARBOR, (ctx, t, px) => {
  const L = L_HARBOR, hy = 446, NAVY = '#0a0c36';
  ctx = S(0);
  sky(ctx, hy, ['#0a0926', '#101244', '#172068', '#213a8c', '#3d4a96'], [0.3, 0.55, 0.76, 0.93, 1]);
  starsFlat(ctx, 1, 60, 300);
  ctx = S(0.05);
  const mx = 646 + px * 0.05;   // over the Mint's dome
  rings(ctx, mx, 138, 70, [alpha('#bcd0ff', 0.1), alpha('#bcd0ff', 0.16)], [1, 0.62]);
  cel(ctx, cp(mx, 138, 23), '#f0f2ff', L_MOON, { off: 9, shadow: '#a4b0e4', ink: 0 });
  // the lanterns let go: most of them are far enough off to hang still
  ctx = S(0.1);
  for (let i = 0; i < 130; i++) {
    const d = rnd(i * 3.1), x = X0 + rnd(i) * XW, y = hy - 12 - rnd(i * 7.7) * 600, r = 1.6 + d * 3.4, col = LCOLS[i % 5];
    if (d > 0.8) bloom(ctx, x, y, r * 5, col, 0.7);
    rect(ctx, x - r * 0.7, y - r, r * 1.4, r * 2, col);
    if (d > 0.5) rect(ctx, x - r * 0.3, y - r * 0.4, r * 0.6, r * 1.1, tint(col, 0.8));
  }
  ctx = A();
  for (let i = 0; i < 26; i++) {   // and a few near ones still climbing
    const d = rnd(i * 3.1 + 9), x = mod(rnd(i + 40) * 1800 + Math.sin(t * 0.3 + i) * 12 + px * (0.1 + d * 0.5) + t * (2 + d * 5), 1800) - 260, y = hy - 6 - mod(rnd(i * 7.7 + 3) * 640 + t * (6 + d * 14), 640);
    const r = 3 + d * 4.5, col = LCOLS[i % 5];
    ctx.fillStyle = INK; ctx.fillRect(x - r * 0.7 - 1.5, y - r - 1.5, r * 1.4 + 3, r * 2 + 3);
    ctx.fillStyle = col; ctx.fillRect(x - r * 0.7, y - r, r * 1.4, r * 2);
    ctx.fillStyle = C.white; ctx.fillRect(x - r * 0.3, y - r * 0.3, r * 0.6, r * 1.1);
  }
  twinkle(ctx, [[560, 196, 9], [760, 200, 7], [1020, 170, 10], [240, 120, 8]], t);
  // headland and the city across the water
  ctx = S(0.14);
  const o = px * 0.14;
  flat(ctx, (c) => { c.moveTo(X0, hy + 4); c.lineTo(X0, 372); c.bezierCurveTo(60 + o, 326, 300 + o, 396, 520 + o, 428); c.lineTo(1540, hy + 4); c.closePath(); }, '#141a58');
  town(ctx, 5, X0 + o, 1560, hy + 4, 20, 100, 24, 62, NAVY, L, { rim: 3, rimCol: '#e87a3a', win: '#ffc65a', winP: 0.3 });
  // the Mint hall, lit for the Drawing
  const dx = 640 + o;
  bloom(ctx, dx, 404, 130, C.lantern, 0.7);
  rimmed(ctx, rp(dx - 92, 366, 184, 86), NAVY, L, 4, '#e87a3a');
  for (let i = 0; i < 7; i++) rect(ctx, dx - 76 + i * 23.5, 384, 11, 60, i === 3 ? C.white : '#ffd27a');
  cel(ctx, (c) => { c.moveTo(dx - 74, 368); c.arc(dx, 368, 74, Math.PI, 0); c.closePath(); }, '#2c2c86', L, { off: 20, ink: 0, rim: 5, rimCol: '#ffb968', shadow: NAVY });
  rimmed(ctx, rp(dx - 12, 268, 24, 30), NAVY, L, 3, '#ffb968');
  stroke(ctx, dx, 268, dx, 240, 3.5, NAVY);
  glint(ctx, dx, 238, 13, C.white, 1);
  // water: flat scalloped bands, lantern light lying on it in bars
  rect(ctx, X0, hy + 2, XW, 560, '#13246a');
  lozenges(ctx, 11, X0, 1540, hy + 8, hy + 40, 40, '#e87a3a');
  lozenges(ctx, 12, dx - 90, dx + 90, hy + 6, hy + 60, 22, '#ffd27a');
  waves(ctx, X0, hy + 44, XW, 80, { len: 58, amp: 5, col: '#0f1c5a', foam: false });
  lozenges(ctx, 13, X0, 1540, hy + 62, hy + 100, 26, '#e87a3a');
  waves(ctx, X0, hy + 104, XW, 120, { len: 88, amp: 8, col: '#0b1448', foam: '#ffb968', every: 4, phase: 0.3, L });
  waves(ctx, X0, hy + 176, XW, 400, { len: 132, amp: 12, col: '#080d34', foam: '#ffb968', every: 3, phase: 0.6, L });
  // boats carrying their own lights
  for (const [bxx, byy, s, k] of [[236, 530, 1, 0], [1010, 584, 1.3, 2], [770, 498, 0.6, 4]]) {
    const x = bxx + px * 0.4;
    cel(ctx, pp([[x - 56 * s, byy], [x + 62 * s, byy], [x + 44 * s, byy + 17 * s], [x - 42 * s, byy + 17 * s]]), '#3a1c4a', L, { off: 5 * s, ink: 2.4, rim: 2 });
    stroke(ctx, x, byy, x, byy - 64 * s, 3 * s);
    stroke(ctx, x - 44 * s, byy - 8 * s, x, byy - 60 * s, 1.6); stroke(ctx, x + 50 * s, byy - 8 * s, x, byy - 60 * s, 1.6);
    for (let j = 0; j < 3; j++) paperLantern(ctx, x - 30 * s + j * 30 * s, byy - (58 - Math.abs(j - 1) * 14) * s, 8.5 * s, LCOLS[(k + j) % 5], L, true, 0.8);
    lozenges(ctx, 20 + k, x - 40 * s, x + 44 * s, byy + 22 * s, byy + 70 * s, 7, '#ffb04a');
  }
  ctx = A();
  shimmer(ctx, 15, X0, 1540, hy + 8, 700, 26, '#ffd27a', t);
  // the quay's own string, close to us: the great lantern is what lights this side of the water
  ctx = S(0.9);
  const q = px * 0.9, hook = [468 + q, 52], a0 = [-240 + q, -70], c0 = [150 + q, 80], b1 = [1520 + q, -70], c1 = [930 + q, 130];
  ink(ctx, 2.6);
  ctx.beginPath(); ctx.moveTo(a0[0], a0[1]); ctx.quadraticCurveTo(c0[0], c0[1], hook[0], hook[1]); ctx.quadraticCurveTo(c1[0], c1[1], b1[0], b1[1]); ctx.stroke();
  for (const [u, s, k] of [[0.5, 26, 1], [0.86, 22, 4]]) { const p = quadAt(hook, c1, b1, u); paperLantern(ctx, p[0], p[1], s, LCOLS[k], L, true, 0.55); }
  { const p = quadAt(a0, c0, hook, 0.45); paperLantern(ctx, p[0], p[1], 24, LCOLS[2], L, true, 0.55); }
  paperLantern(ctx, hook[0], hook[1], 46, C.lantern, L, true, 1.05);
  ctx = A();
  for (const [u, s, k, sd] of [[0.36, 28, 3, 1], [0.7, 24, 6, 2]]) { const p = quadAt(hook, c1, b1, u); swayLantern(ctx, p[0], p[1], s, LCOLS[k], L, t, sd, 0); }
  glint(ctx, hook[0], hook[1] + 46 * 1.36, 25 + 4 * Math.sin(t * 2.7), C.white, 0.95, 0);
  // quay rail
  ctx = S(1.1);
  const r = px * 1.1;
  rect(ctx, X0, 686, XW, 4, '#e87a3a'); rect(ctx, X0, 690, XW, 14, '#070620');
  for (let i = 0; i < 16; i++) { rect(ctx, -244 + i * 120 + r, 690, 4, 300, '#e87a3a'); rect(ctx, -240 + i * 120 + r, 690, 12, 300, '#070620'); }
});

// ── lantern-stalls: the night market on the docks. Key light: the big lantern over the lane ──
const L_STALLS = keyLight('#ffb04a', -Math.PI * 0.6, { depth: 0.85 });
/** one stall: posts, shelves of unlit paper lanterns, a striped awning, a counter. knocked: it has been walked through */
function marketStall(ctx, x, y, w, seed, knocked, L) {
  ctx.save();
  ctx.translate(x, y);
  if (knocked) ctx.rotate(0.09);
  box(ctx, 0, 0, 12, 260, '#3a1c2a', L, { off: 4, ink: II }); box(ctx, w - 12, 0, 12, 260, '#3a1c2a', L, { off: 4, ink: II });
  rect(ctx, 12, 30, w - 24, 170, '#1a0e2c');
  for (let r = 0; r < 2; r++) {
    for (let i = 0; i < Math.floor(w / 40); i++) {
      if (knocked && (i + r) % 3 === 0) continue;
      const c = LCOLS[(i + r * 2 + ((seed * 10) | 0)) % LCOLS.length], lit = !knocked && (i + r * 3 + ((seed * 7) | 0)) % 4 === 0;
      const lx = 34 + i * 40, ly = 92 + r * 62;
      if (lit) bloom(ctx, lx, ly, 46, c, 0.8);
      cel(ctx, ep(lx, ly, 13, 16), lit ? c : shade(c, 0.5), L, { off: 5, ink: 1.8, shadow: lit ? blend(c, C.crimson, 0.5) : shade(c, 0.72), hi: lit ? ep(lx, ly + 1, 5, 8) : null, hiCol: C.white });
    }
    rect(ctx, 12, 110 + r * 62, w - 24, 6, INK);
  }
  // awning: flat stripes, a scalloped hem, one hard shadow under it
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = i / n, b = (i + 1) / n, red = i % 2;
    poly(ctx, [[lerp(14, w - 14, a), -40], [lerp(14, w - 14, b), -40], [lerp(-24, w + 24, b), 24], [lerp(-24, w + 24, a), 24]], red ? C.crimson : C.cream);
    ctx.fillStyle = red ? shade(C.crimson, 0.3) : '#d8c08e';
    ctx.beginPath(); ctx.arc(lerp(-24, w + 24, (a + b) / 2), 24, (w + 48) / n / 2, 0, Math.PI); ctx.fill();
  }
  poly(ctx, [[14, -40], [w - 14, -40], [w - 6, -28], [6, -28]], alpha(C.white, 0.5));
  outline(ctx, pp([[14, -40], [w - 14, -40], [w + 24, 24], [-24, 24]]), IW);
  rect(ctx, 12, 30, w - 24, 16, alpha(C.night, 0.6));
  // counter
  box(ctx, -10, 196, w + 20, 70, '#7a3a2a', L, { off: 0, shadow: false, ink: II });
  rect(ctx, -10, 214, w + 20, 52, '#4a2030');
  box(ctx, -16, 188, w + 32, 12, '#c9783a', L, { off: 0, shadow: false, ink: II });
  for (let i = 1; i < 6; i++) stroke(ctx, -10 + (i * (w + 20)) / 6, 202, -10 + (i * (w + 20)) / 6, 264, 1.6);
  ctx.restore();
}
def('lantern-stalls', L_STALLS, (ctx, t, px) => {
  const L = L_STALLS;
  ctx = S(0);
  sky(ctx, 470, ['#0a0826', '#16103e', '#2a1650', '#4a1c4c'], [0.34, 0.62, 0.86, 1]);
  starsFlat(ctx, 4, 34, 170);
  // warehouses, and the lit lane between them
  ctx = S(0.2);
  town(ctx, 9, X0 + px * 0.2, 1560, 470, 170, 330, 110, 190, '#120a2c', L, { rim: 4, rimCol: '#a8442c', win: '#ffb04a', winP: 0.16 });
  rect(ctx, X0, 430, XW, 60, '#7a2c30');
  // strings of lanterns across the lane; the biggest hangs low in the middle and lights everything
  ctx = S(0.35);
  const q = px * 0.35, kx = 598 + q;
  ink(ctx, 2.4);
  ctx.beginPath(); ctx.moveTo(-200 + q, 40); ctx.quadraticCurveTo(200 + q, 140, kx, 52); ctx.quadraticCurveTo(1000 + q, 150, 1500 + q, 30); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-200 + q, 150); ctx.quadraticCurveTo(640 + q, 250, 1500 + q, 140); ctx.stroke();
  for (let i = 0; i < 9; i++) {
    const u = (i + 0.5) / 9, p = u < 0.47 ? quadAt([-200 + q, 40], [200 + q, 140], [kx, 52], u / 0.47) : quadAt([kx, 52], [1000 + q, 150], [1500 + q, 30], (u - 0.47) / 0.53);
    if (Math.abs(p[0] - kx) < 60 || i === 3 || i === 6) continue;
    paperLantern(ctx, p[0], p[1], 15 + rnd(i) * 5, LCOLS[(i * 3 + 1) % LCOLS.length], L, true, 0.5);
  }
  for (let i = 0; i < 14; i++) { const p = quadAt([-200 + q, 150], [640 + q, 250], [1500 + q, 140], (i + 0.5) / 14); paperLantern(ctx, p[0], p[1], 8, LCOLS[(i * 2) % LCOLS.length], L, true, 0.5); }
  shaft(ctx, kx, 120, Math.PI / 2, 760, 1.15, '#ffb04a', 0.2);
  paperLantern(ctx, kx, 52, 50, '#ffb04a', L, true, 1.05);
  ctx = A();
  for (const [i, sd] of [[3, 1], [6, 2]]) {
    const u = (i + 0.5) / 9, p = u < 0.47 ? quadAt([-200 + q, 40], [200 + q, 140], [kx, 52], u / 0.47) : quadAt([kx, 52], [1000 + q, 150], [1500 + q, 30], (u - 0.47) / 0.53);
    swayLantern(ctx, p[0], p[1], 20, LCOLS[i], L, t, sd, 0);
  }
  glint(ctx, kx, 52 + 50 * 1.36, 27 + 4 * Math.sin(t * 2.7), C.white, 0.95, 0);
  // ground: cobbles in ink, a hard pool of light under each stall
  ctx = S(0.55);
  const g = px * 0.55;
  rect(ctx, X0, 520, XW, 480, '#2c1436');
  flat(ctx, ep(640 + g, 600, 520, 70), '#5a2438'); flat(ctx, ep(640 + g, 596, 300, 38), '#8a3c36');
  ink(ctx, 2, alpha(INK, 0.8));
  for (let r = 0; r < 8; r++) {
    const y = 532 + r * r * 3.6 + r * 7, w = 40 + r * 11;
    ctx.beginPath();
    for (let x = X0 + mod((r % 2) * w * 0.5, w); x < 1540; x += w) { ctx.moveTo(x + w * 0.5 * Math.cos(Math.PI * 1.15), y + 10 + w * 0.5 * Math.sin(Math.PI * 1.15)); ctx.arc(x, y + 10, w * 0.5, Math.PI * 1.15, Math.PI * 1.85); }
    ctx.stroke();
  }
  crowd(ctx, 17, X0 + g, 1540, 452, 12, 19, '#120a2c', L, { hat: 0.4, rimCol: '#e87a3a' });
  for (let i = 0; i < 5; i++) marketStall(ctx, -214 + i * 356 + g, 262, 290, i * 1.7 + 0.3, i === 1, L);
  // Nan's spilled lanterns: one of them relit
  for (let i = 0; i < 4; i++) {
    const x = 244 + i * 50 + g, y = 574 + (i % 2) * 16, c = LCOLS[i], lit = i === 2;
    if (lit) bloom(ctx, x, y, 70, c, 0.9);
    ctx.save(); ctx.translate(x, y); ctx.rotate(1.2 + i * 0.5);
    cel(ctx, ep(0, 0, 13, 17), lit ? c : shade(c, 0.5), L, { off: 5, ink: 2, shadow: lit ? blend(c, C.crimson, 0.5) : shade(c, 0.72), hi: lit ? ep(0, 0, 5, 8) : null, hiCol: C.white });
    ctx.restore();
  }
  ctx = A();
  glint(ctx, 344 + g, 574, 16 + 4 * Math.sin(t * 5.1), C.white, 0.9, 0);
}, (ctx, t, px) => {
  // two lanterns hung close to the lens, at the edges of the wide film
  swayLantern(ctx, 96 + px * 1.6, -96, 64, C.crimson, L_STALLS, t, 71, 0);
  swayLantern(ctx, 1196 + px * 1.6, -120, 70, '#ffc65a', L_STALLS, t, 83, 0);
});

// ── drum-hall: the Mint hall and the great Reels. Key light: the hall lamp hung to the left of the Reels ──
function reelGlyph(ctx, kind, x, y, s) {
  ink(ctx, 2.2);
  if (kind === 0) { // orb
    circ(ctx, x, y, s, C.seaDeep); circ(ctx, x - s * 0.1, y - s * 0.1, s * 0.84, C.sea); circ(ctx, x - s * 0.36, y - s * 0.36, s * 0.22, C.white);
    ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.stroke();
  } else if (kind === 1) { // coin
    circ(ctx, x, y, s, C.brass); ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, s * 0.68, 0, TAU); ctx.stroke(); rect(ctx, x - s * 0.12, y - s * 0.42, s * 0.24, s * 0.84, INK);
  } else if (kind === 2) { // crown
    poly(ctx, [[x - s, y + s * 0.6], [x - s, y - s * 0.5], [x - s * 0.45, y], [x, y - s * 0.8], [x + s * 0.45, y], [x + s, y - s * 0.5], [x + s, y + s * 0.6]], C.crimson); ctx.stroke();
  } else { // tide
    ink(ctx, s * 0.3, C.seaDeep);
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x - s, y + i * s * 0.55); ctx.bezierCurveTo(x - s * 0.4, y + i * s * 0.55 - s * 0.5, x + s * 0.4, y + i * s * 0.55 + s * 0.5, x + s, y + i * s * 0.55); ctx.stroke(); }
  }
}
const L_DRUM = keyLight('#ffd27a', -Math.PI * 0.82, { depth: 0.88 });
def('drum-hall', L_DRUM, (ctx, t, px) => {
  const L = L_DRUM, DARK = '#170c2a', STONE = '#5a3052';
  ctx = S(0.2);
  fillAll(ctx, DARK);
  rings(ctx, 432 + px * 0.2, 118, 780, ['#26143a', '#44203f', '#743a40'], [1, 0.64, 0.34]);   // the lamp's light on the back wall, in three steps
  for (let i = -1; i < 7; i++) {   // the arcade: dark recesses, inked
    const x = -110 + i * 250 + px * 0.2;
    cel(ctx, archP(x, 600, 170, 520), '#1c0f30', L, { off: 12, ink: II, shadow: C.night });
    outline(ctx, archP(x + 14, 600, 142, 496), 1.6, alpha(C.brass, 0.55));
  }
  for (const bxx of [150, 1130]) {   // banners of the Mint
    const x = bxx + px * 0.2;
    cel(ctx, pp([[x - 52, -180], [x + 52, -180], [x + 52, 400], [x, 356], [x - 52, 400]]), '#1c7a5c', L, { off: 12, ink: IW });
    sigilScale(ctx, x, 200, 26, C.brass, 4);
    ink(ctx, 3, C.brass); ctx.beginPath(); ctx.arc(x, 200, 46, 0, TAU); ctx.stroke();
  }
  // the Reels of Assay: a brass cabinet, its three windows above head height
  const cx = 640 + px * 0.35;
  ctx = S(0.35);
  const cab = (c) => { c.moveTo(cx - 156, 620); c.lineTo(cx - 156, 92); c.quadraticCurveTo(cx, -34, cx + 156, 92); c.lineTo(cx + 156, 620); c.closePath(); };
  cel(ctx, cab, C.brass, L, { ink: IW, rim: 7, shadow: pp([[cx + 44, -60], [cx + 200, -60], [cx + 200, 640], [cx - 70, 640]]) });   // the lamp is on its left: the right of it is one hard shadow
  outline(ctx, (c) => { c.moveTo(cx - 142, 620); c.lineTo(cx - 142, 98); c.quadraticCurveTo(cx, -10, cx + 142, 98); c.lineTo(cx + 142, 620); c.closePath(); }, II);
  sigilScale(ctx, cx, 60, 14, INK, 3.2);
  rect(ctx, cx - 140, 94, 280, 148, INK);
  ctx = A();
  for (let r = 0; r < 3; r++) {
    const x = cx - 133 + r * 91, y = 101, w = 84, h = 134, run = t * (10 + r * 4) + r * 37, off = mod(run, 66);
    rect(ctx, x, y, w, h, C.cream);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    for (let j = -1; j < 3; j++) reelGlyph(ctx, mod(-Math.floor(run / 66) + j + r, 4), x + w / 2, y + j * 66 + off + 16, 20);
    ctx.restore();
    rect(ctx, x, y, w, 16, alpha(INK, 0.6)); rect(ctx, x, y + h - 16, w, 16, alpha(INK, 0.6));        // the curve of the reel, in two hard steps
    rect(ctx, x, y + 16, w, 12, alpha(INK, 0.25)); rect(ctx, x, y + h - 28, w, 12, alpha(INK, 0.25));
  }
  ctx = S(0.35);
  stroke(ctx, cx - 140, 168, cx + 140, 168, 2.6, C.crimson);
  flat(ctx, pp([[cx - 153, 158], [cx - 138, 168], [cx - 153, 178]]), C.crimson); flat(ctx, pp([[cx + 153, 158], [cx + 138, 168], [cx + 153, 178]]), C.crimson);
  box(ctx, cx - 122, 262, 244, 46, '#2a1640', L, { off: 0, shadow: false, ink: II });
  ctx.fillStyle = C.brass; ctx.font = `700 19px ${FONT_SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('REELS  OF  ASSAY', cx, 286);
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  // lever
  stroke(ctx, cx + 154, 330, cx + 208, 330, 20); stroke(ctx, cx + 154, 330, cx + 208, 330, 12, '#8a4a34');
  stroke(ctx, cx + 208, 330, cx + 216, 150, 15); stroke(ctx, cx + 208, 330, cx + 216, 150, 8, C.brass);
  cel(ctx, cp(cx + 217, 136, 22), C.crimson, L, { off: 8, ink: 3, hi: cp(cx + 209, 128, 6), hiCol: C.white });
  // the drum of names, at the right of the wide film
  const dx = cx + 430, dy = 380;
  stroke(ctx, dx - 74, 610, dx - 30, dy, 14); stroke(ctx, dx + 74, 610, dx + 30, dy, 14);
  stroke(ctx, dx - 74, 610, dx - 30, dy, 8, '#8a4a34'); stroke(ctx, dx + 74, 610, dx + 30, dy, 8, '#8a4a34');
  cel(ctx, cp(dx, dy, 98), '#2a1640', L, { off: 22, ink: 0, shadow: C.night });
  ctx = A();
  const rot = t * 0.35;
  ctx.fillStyle = C.cream;
  for (let i = 0; i < 16; i++) {
    const a = rot * 1.7 + i * 2.4, r = 20 + rnd(i * 3) * 62, c = Math.cos(a * 2), s = Math.sin(a * 2), x = dx + Math.cos(a) * r, y = dy + Math.sin(a) * r * 0.9;
    ctx.beginPath(); ctx.moveTo(x - 10 * c + 3.5 * s, y - 10 * s - 3.5 * c); ctx.lineTo(x + 10 * c + 3.5 * s, y + 10 * s - 3.5 * c); ctx.lineTo(x + 10 * c - 3.5 * s, y + 10 * s + 3.5 * c); ctx.lineTo(x - 10 * c - 3.5 * s, y - 10 * s + 3.5 * c); ctx.fill();
  }
  ink(ctx, 2.4, C.brass);
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(dx, dy, Math.max(1, Math.abs(Math.cos(rot + (i * Math.PI) / 4)) * 98), 98, 0, 0, TAU); ctx.stroke(); }
  ink(ctx, 11, INK); ctx.beginPath(); ctx.arc(dx, dy, 98, 0, TAU); ctx.stroke();
  ink(ctx, 5.5, C.brass); ctx.beginPath(); ctx.arc(dx, dy, 98, 0, TAU); ctx.stroke();
  circ(ctx, dx, dy, 9, C.brass);
  // columns: a hard rim toward the lamp, the far side dropped
  ctx = S(0.5);
  for (let i = -1; i < 7; i++) {
    const x = -160 + i * 250 + px * 0.5;
    if (Math.abs(x + 27 - cx) < 300) continue;
    box(ctx, x, -180, 54, 790, STONE, L, { off: 20, ink: II, rim: 6 });
    box(ctx, x - 10, 596, 74, 24, STONE, L, { off: 8, ink: II, rim: 3 });
  }
  // the lamp
  const lx = 432 + px * 0.5, ly = 118;
  shaft(ctx, lx, ly, 0.5, 1100, 0.62, L.col, 0.2);
  stroke(ctx, lx, -180, lx, ly - 40, 3);
  bloom(ctx, lx, ly, 210, L.col, 1);
  cel(ctx, pp([[lx - 12, ly - 44], [lx + 12, ly - 44], [lx + 30, ly - 22], [lx - 30, ly - 22]]), C.brass, L, { off: 0, shadow: false, ink: 2.6 });
  cel(ctx, cp(lx, ly, 25), C.white, L, { off: 0, shadow: false, ink: 2.6 });
  cel(ctx, pp([[lx - 14, ly + 22], [lx + 14, ly + 22], [lx, ly + 44]]), C.brass, L, { off: 0, shadow: false, ink: 2.6 });
  ctx = A();
  glint(ctx, lx, ly, 46 + 6 * Math.sin(t * 2.3), C.white, 1, 0);
  // floor and the waiting crowd
  ctx = S(0.7);
  rect(ctx, X0, 608, XW, 400, '#22123a');
  flat(ctx, pp([[cx - 250, 608], [cx + 330, 608], [cx + 900, 980], [cx - 380, 980]]), '#4a2444');   // where the lamp's light lies on the floor
  ink(ctx, 2, alpha(INK, 0.8));
  ctx.beginPath(); for (let i = -8; i < 24; i++) { ctx.moveTo(640 + (i - 8) * 60 + px * 0.5, 608); ctx.lineTo(640 + (i - 8) * 190 + px * 0.9, 980); } ctx.stroke();
  crowd(ctx, 31, X0 + px * 0.7, 1540, 556, 44, 19, '#1c1034', L, { hat: 0.35 });
  crowd(ctx, 33, X0 + px * 0.7, 1540, 604, 30, 30, '#100820', L, { hat: 0.35 });
}, (ctx, t, px) => {
  // lots: slips of paper drifting down through the light
  ctx.fillStyle = C.cream;
  for (let i = 0; i < 14; i++) {
    const d = rnd(i * 2.3), x = mod(rnd(i) * 1500 + Math.sin(t * 0.7 + i) * 40 + px * 1.4, 1500) - 110, y = mod(rnd(i * 5) * 800 + t * (26 + d * 30), 800) - 40;
    const a = t * (0.6 + d) + i, c = Math.cos(a), s = Math.sin(a), hw = 8, hh = 1 + 3 * Math.abs(Math.cos(t * 2 + i));
    ctx.beginPath(); ctx.moveTo(x - hw * c + hh * s, y - hw * s - hh * c); ctx.lineTo(x + hw * c + hh * s, y + hw * s - hh * c); ctx.lineTo(x + hw * c - hh * s, y + hw * s + hh * c); ctx.lineTo(x - hw * c - hh * s, y - hw * s + hh * c); ctx.fill();
  }
});

// ── bench: a magistrate's chamber, stacked files, the festival outside. Key light: the green-shaded lamp over the desk ──
const L_BENCH = keyLight('#ffd08a', -Math.PI * 0.42, { depth: 0.9 });
def('bench', L_BENCH, (ctx, t, px) => {
  const L = L_BENCH, DARK = '#140c28', WOOD = '#4a2640';
  ctx = S(0.2);
  fillAll(ctx, DARK);
  rings(ctx, 700 + px * 0.2, 170, 640, ['#20143a', '#382044', '#5a3048'], [1, 0.62, 0.34]);
  ink(ctx, 2.4, alpha(INK, 0.9));
  for (let i = -1; i < 12; i++) { const x = -220 + i * 160 + px * 0.2; ctx.strokeRect(x + 12, 40, 136, 300); ctx.strokeRect(x + 12, 366, 136, 190); }
  // window: the festival outside
  const wx = 350 + px * 0.25, NAVY = '#0a0c36';
  box(ctx, wx - 16, 26, 204, 316, WOOD, L, { off: 8, ink: IW, rim: 4 });
  ctx.save(); ctx.beginPath(); ctx.rect(wx, 42, 172, 284); ctx.clip();
  bands(ctx, wx, 42, 172, 284, ['#0a0926', '#172068', '#213a8c', '#3d4a96'], [0.4, 0.7, 0.9, 1]);
  for (let i = 0; i < 26; i++) { const r = 2 + rnd(i * 3) * 3; rect(ctx, wx + rnd(i) * 172, 60 + rnd(i * 5) * 220, r * 1.4, r * 2, LCOLS[i % 5]); }
  town(ctx, 61, wx - 10, wx + 190, 328, 16, 64, 20, 44, NAVY, L, { win: '#ffc65a', winP: 0.4 });
  ctx.restore();
  stroke(ctx, wx + 86, 42, wx + 86, 326, 6); stroke(ctx, wx, 136, wx + 172, 136, 5); stroke(ctx, wx, 232, wx + 172, 232, 5);
  outline(ctx, rp(wx, 42, 172, 284), II);
  ctx = A();
  for (let i = 0; i < 7; i++) {   // lanterns still going up past the glass
    const d = rnd(i * 3.7), x = wx + 10 + rnd(i) * 150 + Math.sin(t * 0.4 + i) * 4, y = 300 - mod(rnd(i * 5.3) * 250 + t * (6 + d * 12), 250), r = 3 + d * 3;
    ctx.fillStyle = LCOLS[i % 5]; ctx.fillRect(x - r * 0.7, y - r, r * 1.4, r * 2);
    ctx.fillStyle = C.white; ctx.fillRect(x - r * 0.3, y - r * 0.3, r * 0.6, r);
  }
  // the clock
  ctx = S(0.25);
  const kx = 596 + px * 0.25;
  box(ctx, kx - 32, 56, 64, 290, WOOD, L, { off: 9, ink: IW, rim: 4 });
  cel(ctx, cp(kx, 104, 24), C.cream, L, { off: 6, ink: 2.6 });
  rect(ctx, kx - 20, 144, 40, 184, C.night); outline(ctx, rp(kx - 20, 144, 40, 184), II);
  ctx = A();
  stroke(ctx, kx, 104, kx + Math.sin(t * 0.02 + 1) * 11, 104 - Math.cos(t * 0.02 + 1) * 11, 3.4);
  stroke(ctx, kx, 104, kx + Math.sin(t * 0.3) * 18, 104 - Math.cos(t * 0.3) * 18, 2);
  const pa = Math.sin(t * 2.6) * 0.1, pex = kx + Math.sin(pa) * 150, pey = 148 + Math.cos(pa) * 150;
  stroke(ctx, kx, 148, pex, pey, 2.4, C.brass);
  circ(ctx, pex, pey, 12, C.brass); ink(ctx, 2); ctx.beginPath(); ctx.arc(pex, pey, 12, 0, TAU); ctx.stroke();
  // shelves of files, floor to ceiling: in shadow except where the lamp reaches
  ctx = S(0.3);
  for (const [sx0, sw, dim] of [[790 + px * 0.3, 800, 0.42], [X0, 260 + 330 + px * 0.3 - 16, 0.62]]) {
    rect(ctx, sx0 - 12, -180, sw, 760, C.night);
    for (let r = 0; r < 6; r++) {
      const y = 76 + r * 100;
      for (let c = 0; c * 108 < sw - 60; c++) {
        const x = sx0 + c * 108 + rnd(r * 9 + c) * 16;
        if (rnd(r * 13 + c * 3) < 0.25) {
          for (let b = 0; b < 6; b++) { const h = 50 + rnd(r + c * 5 + b) * 34; rect(ctx, x + b * 14, y - h, 12, h, shade(FILE_COLS[Math.floor(rnd(r * 3 + c + b * 7) * 6)], dim + 0.1)); rect(ctx, x + b * 14, y - h * 0.6, 12, 4, shade(C.crimson, dim)); ink(ctx, 1.4); ctx.strokeRect(x + b * 14, y - h, 12, h); }
        } else files(ctx, x, y, 84, 4 + Math.floor(rnd(r * 5 + c * 7) * 5), r * 17 + c, dim + (r < 1 ? 0.2 : 0));
      }
      box(ctx, sx0 - 12, y, sw, 10, WOOD, L, { off: 0, shadow: false, ink: 1.8 });
    }
    stroke(ctx, sx0 - 12, -180, sx0 - 12, 580, IW);
  }
  // the desk
  const dy = 566;
  rect(ctx, X0, dy, XW, 420, '#2a1430');
  box(ctx, X0, dy - 6, XW, 12, '#9a5a3a', L, { off: 0, shadow: false, ink: II });
  // the lamp, hung low over the desk: a hard cone of light under it
  ctx = S(0.8);
  const lx = 700 + px * 0.8, ly = 168;
  shaft(ctx, lx, ly - 40, Math.PI / 2, 470, 1.3, L.col, 0.26);
  flat(ctx, ep(lx, dy, 270, 16), alpha(L.col, 0.5));
  stroke(ctx, lx, -180, lx, ly - 56, 3.4);
  bloom(ctx, lx, ly + 4, 130, L.col, 0.9);
  cel(ctx, pp([[lx - 20, ly - 58], [lx + 20, ly - 58], [lx + 70, ly], [lx - 70, ly]]), '#1c8a6a', L, { off: 0, shadow: pp([[lx - 6, ly - 58], [lx - 20, ly - 58], [lx - 70, ly], [lx - 24, ly]]), ink: IW, hi: pp([[lx + 8, ly - 56], [lx + 18, ly - 56], [lx + 58, ly - 4], [lx + 36, ly - 4]]), hiCol: '#7fe0b8' });
  cel(ctx, ep(lx, ly, 70, 10), C.white, L, { off: 0, shadow: false, ink: 2.6 });
  // scales, and files on the desk nearest the lens
  const bx = 300 + px * 0.8;
  ink(ctx, 9, INK); ctx.beginPath(); ctx.moveTo(bx, dy); ctx.lineTo(bx, dy - 150); ctx.moveTo(bx - 78, dy - 140); ctx.lineTo(bx + 78, dy - 152); ctx.stroke();
  ink(ctx, 4.5, C.brass); ctx.beginPath(); ctx.moveTo(bx, dy); ctx.lineTo(bx, dy - 150); ctx.moveTo(bx - 78, dy - 140); ctx.lineTo(bx + 78, dy - 152); ctx.stroke();
  for (const [s, yy] of [[-1, dy - 140], [1, dy - 152]]) {
    stroke(ctx, bx + s * 78, yy, bx + s * 78 - 24, yy + 66, 1.6); stroke(ctx, bx + s * 78, yy, bx + s * 78 + 24, yy + 66, 1.6);
    cel(ctx, (c) => { c.moveTo(bx + s * 78 - 27, yy + 66); c.arc(bx + s * 78, yy + 66, 27, Math.PI, 0, true); c.closePath(); }, C.brass, L, { off: 7, ink: 2.4 });
  }
  files(ctx, 40 + px * 0.8, dy, 150, 12, 3, 0.35);
  files(ctx, 520 + px * 0.8, dy - 4, 130, 7, 9, 0);
  files(ctx, 790 + px * 0.8, dy - 4, 150, 11, 14, 0);
  files(ctx, 1090 + px * 0.8, dy, 160, 17, 15, 0.3);
  files(ctx, -150 + px * 0.8, dy, 150, 20, 21, 0.5);
  ctx = A();
  glint(ctx, lx, ly + 2, 30 + 4 * Math.sin(t * 2.9), C.white, 0.95, 0);
}, (ctx, t, px) => {
  motes(ctx, 7, 16, '#ffe6b0', t, { x0: 540 + px, x1: 860 + px, y0: 190, y1: 560, vx: 3, vy: -4, r: 2.2, a: 0.7, tw: 1 });
});

// ── pier-riot: the docks, the night of the shot. Key light: the fire at the end of the pier ──
const L_RIOT = keyLight('#ff7a2a', -Math.PI * 0.54, { depth: 0.92 });
def('pier-riot', L_RIOT, (ctx, t, px) => {
  const L = L_RIOT, DARK = '#150a22', hy = 474;
  ctx = S(0);
  sky(ctx, hy, ['#120a24', '#2c0f34', '#5e1636', '#a82a2e', '#e8602a'], [0.3, 0.52, 0.72, 0.9, 1]);
  ctx = S(0.2);
  const fx = 640 + px * 0.2;
  rings(ctx, fx, 300, 440, [alpha('#ff7a2a', 0.14), alpha('#ff9a3a', 0.2), alpha('#ffc65a', 0.3)], [1, 0.62, 0.34]);
  // its smoke: lobed puffs going up and over to the right, and curls of it torn off by the wind
  for (let i = 5; i >= 0; i--) puff(ctx, fx + 40 + i * 62, 150 - i * 30 - (i > 3 ? (i - 3) * 14 : 0), 40 + i * 13, i % 2 ? '#3c1438' : '#521a3c', L, i + 3, II);
  curl(ctx, fx - 150, 96, 46, 1.6, 1, 13, '#521a3c', II);
  curl(ctx, fx + 470, 150, 44, 1.6, -1, 12, '#3c1438', II);
  town(ctx, 21, X0 + px * 0.2, 1560, hy + 2, 40, 150, 70, 150, DARK, L, { rim: 3, rimCol: '#e8602a', win: '#ff9a3a', winP: 0.1 });
  // cranes, their fire-side edges lit
  for (const [cxx, sd] of [[392, 1], [884, -1]]) {
    const x = cxx + px * 0.2;
    for (let pass = 0; pass < 2; pass++) {
      const o = pass ? 0 : sd * 4;
      ink(ctx, 9, pass ? DARK : '#ff9a3a');
      ctx.beginPath(); ctx.moveTo(x - 26 + o, hy); ctx.lineTo(x + o, 110); ctx.lineTo(x + 26 + o, hy); ctx.moveTo(x + o, 122); ctx.lineTo(x - sd * 170 + o, 176); ctx.moveTo(x + o, 122); ctx.lineTo(x + sd * 60 + o, 156); ctx.stroke();
    }
    ink(ctx, 4, DARK);
    ctx.beginPath(); for (let k = 0; k < 4; k++) { const y0 = 180 + k * 74, w0 = 5 + k * 5.4, w1 = 5 + (k + 1) * 5.4; ctx.moveTo(x - w0, y0); ctx.lineTo(x + w1, y0 + 74); ctx.moveTo(x + w0, y0); ctx.lineTo(x - w1, y0 + 74); } ctx.stroke();
    stroke(ctx, x - sd * 160, 174, x - sd * 160, 300, 2.4, DARK);
    rimmed(ctx, rp(x - sd * 160 - 16, 300, 32, 26), DARK, L, 3, '#ff9a3a');
  }
  // water
  rect(ctx, X0, hy, XW, 520, '#3c1030');
  lozenges(ctx, 23, fx - 420, fx + 420, hy + 6, hy + 70, 50, '#ff7a2a');
  waves(ctx, X0, hy + 60, XW, 480, { len: 96, amp: 8, col: '#280a28', foam: '#ff9a3a', every: 3, L });
  // the pier, running away from us: boards in ink, the fire's light down the middle of it
  ctx = S(0.3);
  const vx = 640 + px * 0.3;
  flat(ctx, pp([[vx - 150, 482], [vx + 150, 482], [1560, 980], [-280, 980]]), '#2a1232');
  flat(ctx, pp([[vx - 60, 482], [vx + 60, 482], [vx + 330, 980], [vx - 330, 980]]), '#6a2434');
  ink(ctx, 2, alpha(INK, 0.85));
  ctx.beginPath(); for (let i = 0; i < 12; i++) { const y = 486 + i * i * 3 + i * 5, k = (y - 482) / 498; ctx.moveTo(lerp(vx - 150, -280, k), y); ctx.lineTo(lerp(vx + 150, 1560, k), y); } ctx.stroke();
  outline(ctx, pp([[vx - 150, 482], [vx + 150, 482], [1560, 980], [-280, 980]]), II);
  // the barricade that is burning, and the lamp posts along the boards
  // the pier's lantern gantry, alight: two legs and a platform, the fire on top of it
  for (const s of [-1, 1]) { stroke(ctx, vx + s * 92, 486, vx + s * 66, 356, 13, DARK); stroke(ctx, vx + s * 92, 486, vx - s * 40, 372, 6, DARK); }
  rimmed(ctx, rp(vx - 96, 350, 192, 18), DARK, L, 4, '#ffc65a');
  for (let i = 0; i < 5; i++) {
    const u = i / 4, e = u * u;
    for (const s of [-1, 1]) {
      const x = vx + s * lerp(170, 700, e), y = lerp(486, 760, e), h = lerp(40, 190, e);
      rimmed(ctx, rp(x - h * 0.035, y - h, h * 0.07, h * 1.2), DARK, { dx: -s, dy: 0 }, Math.max(1.5, h * 0.02), '#ff9a3a');
      if ((i + (s > 0 ? 1 : 0)) % 3 !== 0) paperLantern(ctx, x, y - h - h * 0.04, h * 0.1, LCOLS[i % 3], L, true, 0.5);
    }
  }
  // the Compact on the boards: black against the fire, lit along their heads and shoulders
  crowd(ctx, 41, vx - 200, vx + 200, 466, 18, 9, DARK, L, { fists: 0.3, rimCol: '#ffc65a' });
  crowd(ctx, 43, vx - 430, vx + 430, 494, 22, 17, '#100820', L, { fists: 0.35, signs: 0.14, hat: 0.4, rimCol: '#ff9a3a' });
  crowd(ctx, 47, X0 + px * 0.7, 1540, 546, 20, 30, '#0c0618', L, { fists: 0.3, signs: 0.14, hat: 0.4, rimCol: '#ff7a2a' });
  ctx = A();
  blaze(ctx, vx, 352, 104, t, 1);
  glint(ctx, vx - 20, 318, 34 + 7 * Math.sin(t * 4.3), C.white, 0.9, 0);
}, (ctx, t, px) => {
  motes(ctx, 3, 34, '#ffb060', t, { x0: 300 + px, x1: 1000 + px, y0: 0, y1: 700, vx: 14, vy: -60, r: 2.6, a: 0.9, tw: 1, wob: 22 });
});

// ── mint-office: Corvane's panelled room, at night. Key light: the brass lamp hung beside the Mint's seal ──
const L_MINT = keyLight('#ffc878', -Math.PI * 0.74, { depth: 0.9 });
def('mint-office', L_MINT, (ctx, t, px) => {
  const L = L_MINT, DARK = '#1a0a24', WINE = '#3c1230';
  ctx = S(0.2);
  const o = px * 0.2, lx0 = 470 + o;
  fillAll(ctx, DARK);
  rings(ctx, lx0, 124, 720, ['#2a0e2c', '#4c1634', '#7c2a3a'], [1, 0.6, 0.32]);
  for (let i = -1; i < 9; i++) {   // panelling: ink, and a brass bead inside it
    const x = -230 + i * 230 + o;
    outline(ctx, rp(x + 16, 30, 198, 410), 2.6);
    outline(ctx, rp(x + 28, 42, 174, 386), 1.4, alpha(C.brass, 0.6));
  }
  rect(ctx, X0, 470, XW, 520, '#140818');
  box(ctx, X0, 462, XW, 10, C.brass, L, { off: 0, shadow: false, ink: 1.8 });
  // the seal of the Mint: a brass ring on a dark field, struck hard by the lamp on its upper left
  const sx = 700 + o, sy = 150;
  flat(ctx, cp(sx, sy, 96), INK);
  flat(ctx, cp(sx, sy, 90), C.brass);
  ctx.save(); ctx.beginPath(); ctx.arc(sx, sy, 90, 0, TAU); ctx.clip();
  flat(ctx, cp(sx + 16, sy + 12, 92), '#8a4a34');           // the ring's far side
  flat(ctx, cp(sx + 3, sy + 2.5, 89), C.brass);
  flat(ctx, cp(sx - 3, sy - 3, 86), C.white);               // its lit edge
  flat(ctx, cp(sx, sy, 86), C.brass);
  ctx.restore();
  flat(ctx, cp(sx, sy, 76), INK); flat(ctx, cp(sx, sy, 73), WINE);
  ink(ctx, 1.8, C.brass); ctx.beginPath(); ctx.arc(sx, sy, 50, 0, TAU); ctx.stroke();
  sigilScale(ctx, sx, sy + 2, 27, C.brass, 4.5);
  ctx.save(); ctx.translate(sx, sy); ctx.fillStyle = C.brass; ctx.font = `700 16px ${FONT_SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const motto = 'PAYABLE · IN · CALM · THE · MINT · ';
  for (let i = 0; i < motto.length; i++) { ctx.save(); ctx.rotate((i / motto.length) * TAU - Math.PI / 2); ctx.fillText(motto[i], 0, -61); ctx.restore(); }
  ctx.restore(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  // window on the harbour, at the right of the wide film: the festival is still going on out there
  const wx = 944 + px * 0.3, NAVY = '#0a0c36', win = (c) => { c.moveTo(wx, 462); c.lineTo(wx, 190); c.arc(wx + 120, 190, 120, Math.PI, 0); c.lineTo(wx + 240, 462); c.closePath(); };
  ctx.save(); ctx.beginPath(); win(ctx); ctx.clip();
  bands(ctx, wx, 60, 240, 380, ['#0a0926', '#172068', '#213a8c', '#3d4a96'], [0.4, 0.7, 0.92, 1]);
  for (let i = 0; i < 30; i++) { const r = 2 + rnd(i * 3) * 3; rect(ctx, wx + rnd(i) * 240, 80 + rnd(i * 5) * 300, r * 1.4, r * 2, LCOLS[i % 5]); }
  town(ctx, 71, wx - 20, wx + 260, 430, 14, 70, 18, 44, NAVY, L, { win: '#ffc65a', winP: 0.4 });
  rect(ctx, wx, 428, 240, 40, '#13246a'); lozenges(ctx, 73, wx, wx + 240, 434, 458, 16, '#ffb04a');
  ctx.restore();
  ink(ctx, 7); ctx.beginPath(); win(ctx); ctx.moveTo(wx + 120, 70); ctx.lineTo(wx + 120, 462); ctx.moveTo(wx, 300); ctx.lineTo(wx + 240, 300); ctx.stroke();
  for (const s of [0, 1]) {   // velvet: one fold of shadow each
    const x = wx + (s ? 214 : -52);
    cel(ctx, (c) => { c.moveTo(x, 30); c.lineTo(x + 80, 30); c.quadraticCurveTo(x + 72, 300, x + 94, 600); c.lineTo(x - 14, 600); c.quadraticCurveTo(x + 8, 300, x, 30); c.closePath(); }, '#156a5c', L, { off: 0, ink: IW, shadow: pp([[x + 34, 30], [x + 58, 30], [x + 66, 600], [x + 30, 600]]), rim: 5 });
  }
  box(ctx, wx - 76, 18, 392, 16, C.brass, L, { off: 5, ink: II });
  // fireplace, at the left of the wide film: banked low
  const fx = 176 + o;
  box(ctx, fx - 150, 250, 300, 230, '#4a3458', L, { off: 14, ink: IW, rim: 5 });
  box(ctx, fx - 170, 232, 340, 24, '#6a4a6a', L, { off: 6, ink: II, rim: 4 });
  rect(ctx, fx - 96, 310, 192, 170, C.night); outline(ctx, rp(fx - 96, 310, 192, 170), II);
  flat(ctx, ep(fx, 470, 80, 12), '#a82a2e'); flat(ctx, ep(fx - 10, 468, 46, 6), C.lantern);
  // a founder, in oils
  box(ctx, fx - 92, 22, 184, 196, C.brass, L, { off: 7, ink: IW, rim: 4 });
  rect(ctx, fx - 78, 36, 156, 168, '#1c0e2c'); outline(ctx, rp(fx - 78, 36, 156, 168), II);
  rimmed(ctx, ep(fx, 104, 30, 38), '#4a2a3a', L, 4, '#c9785a');
  rimmed(ctx, (c) => { c.moveTo(fx - 70, 204); c.quadraticCurveTo(fx - 60, 148, fx, 144); c.quadraticCurveTo(fx + 60, 148, fx + 70, 204); c.closePath(); }, '#2a1634', L, 4, '#c9785a');
  // the lamp
  ctx = S(0.5);
  const lx = 470 + px * 0.5, ly = 124;
  shaft(ctx, lx, ly, 0.9, 900, 0.9, L.col, 0.16);
  stroke(ctx, lx, -180, lx, ly - 46, 3);
  bloom(ctx, lx, ly, 200, L.col, 1);
  cel(ctx, pp([[lx - 10, ly - 50], [lx + 10, ly - 50], [lx + 34, ly - 22], [lx - 34, ly - 22]]), C.brass, L, { off: 0, shadow: false, ink: 2.6 });
  cel(ctx, cp(lx, ly, 26), C.white, L, { off: 0, shadow: false, ink: 2.6 });
  cel(ctx, pp([[lx - 16, ly + 22], [lx + 16, ly + 22], [lx, ly + 48]]), C.brass, L, { off: 0, shadow: false, ink: 2.6 });
  ctx = A();
  glint(ctx, lx, ly, 46 + 6 * Math.sin(t * 2.3), C.white, 1, 0);
  glint(ctx, sx - 58, sy - 62, 15 + 5 * Math.sin(t * 1.7 + 2), C.white, 1, 0);
  fire(ctx, fx + 20, 474, 16, t, 5);
  // the desk: the bond waiting to be signed, and his own light in little
  ctx = S(0.9);
  const dy = 584, d = px * 0.9;
  rect(ctx, X0, dy, XW, 420, '#220c26');
  box(ctx, X0, dy - 6, XW, 12, '#8a3a34', L, { off: 0, shadow: false, ink: II });
  rect(ctx, X0, dy + 6, XW, 3, C.brass);
  cel(ctx, pp([[560 + d, dy - 4], [760 + d, dy - 4], [790 + d, dy + 30], [540 + d, dy + 30]]), C.cream, L, { off: 0, shadow: false, ink: II });
  const ox = 96 + d;
  stroke(ctx, ox, dy - 6, ox, dy - 58, 9); stroke(ctx, ox, dy - 6, ox, dy - 58, 4.5, C.brass);
  box(ctx, ox - 26, dy - 14, 52, 9, C.brass, L, { off: 0, shadow: false, ink: 1.8 });
  bloom(ctx, ox, dy - 96, 80, '#7fd8ff', 0.8);
  ctx = A();
  for (let i = 0; i < 3; i++) {
    const rx = 46 - i * 9, ry = Math.max(2, rx * Math.abs(Math.sin(t * (0.3 + i * 0.17) + i)));
    ink(ctx, 5.5, INK); ctx.beginPath(); ctx.ellipse(ox, dy - 90, rx, ry, i * 0.9, 0, TAU); ctx.stroke();
    ink(ctx, 2.6, C.brass); ctx.beginPath(); ctx.ellipse(ox, dy - 90, rx, ry, i * 0.9, 0, TAU); ctx.stroke();
  }
  fire(ctx, ox, dy - 82, 8, t * 0.4, 2, COLD);   // a lamp-engine in little: his own light, on his own desk
});

// ── ferry-dawn: the morning lane out of harbour. Key light: the sun, just up ──
const L_DAWN = keyLight('#ffd08a', -Math.PI * 0.4, { depth: 0.75, tint: '#2c1c6a' });
def('ferry-dawn', L_DAWN, (ctx, t, px) => {
  const L = L_DAWN, hy = 252, sx = 704 + px * 0.05, sy = 172;
  ctx = S(0);
  sky(ctx, hy, ['#2a2468', '#6a3c8a', '#d8587c', '#ff9a62', '#ffd88a'], [0.3, 0.5, 0.7, 0.88, 1]);
  starsFlat(ctx, 6, 10, 20);
  ctx = S(0.05);
  shaft(ctx, sx, sy, -2.25, 900, 0.2, '#ffe2a0', 0.22); shaft(ctx, sx, sy, -1.5, 900, 0.13, '#ffe2a0', 0.2); shaft(ctx, sx, sy, -0.8, 900, 0.18, '#ffe2a0', 0.22);
  shaft(ctx, sx, sy, -2.85, 900, 0.1, '#ffe2a0', 0.2); shaft(ctx, sx, sy, -0.3, 900, 0.1, '#ffe2a0', 0.2);
  rings(ctx, sx, sy, 210, [alpha('#fff0c0', 0.2), alpha('#fff0c0', 0.3), alpha(C.white, 0.5)], [1, 0.62, 0.38]);
  circ(ctx, sx, sy, 50, C.white);
  // clouds: flat stacked lobes, violet on top, the sun under them
  ctx = S(0.08);
  const q = px * 0.08;
  for (const [x, y, w, h, sd] of [[380, 148, 330, 78, 3], [1040, 120, 380, 86, 5], [110, 96, 260, 60, 8], [860, 226, 210, 40, 11], [560, 60, 220, 44, 14]]) {
    cloud(ctx, x + q, y, w, h, '#a8488a', L, sd, 0);
    rect(ctx, x + q - w / 2 + 8, y - 7, w - 16, 7, '#ffb46a');
  }
  // Vessery, behind us on its headland
  ctx = S(0.15);
  const vx = 150 + px * 0.15;
  flat(ctx, (c) => { c.moveTo(X0, hy + 2); c.lineTo(X0, 196); c.bezierCurveTo(vx - 100, 150, vx + 220, 206, vx + 400, hy + 2); c.closePath(); }, '#5a3c8a');
  town(ctx, 33, X0 + px * 0.15, vx + 330, hy + 2, 12, 76, 16, 44, '#3c2a74', L, { rim: 3, rimCol: '#ff9a62' });
  cel(ctx, (c) => { c.moveTo(vx + 150, 214); c.arc(vx + 190, 214, 40, Math.PI, 0); c.closePath(); }, '#3c2a74', L, { off: 10, ink: 0, rim: 4, rimCol: '#ffb46a', shadow: '#2a1c5a' });
  // the sea: flat scalloped bands, the sun lying on it in white bars
  ctx = S(0.1);
  rect(ctx, X0, hy, XW, 760, '#ff9a6a');
  lozenges(ctx, 35, sx - 70, sx + 70, hy + 4, hy + 44, 26, C.white);
  waves(ctx, X0, hy + 46, XW, 100, { len: 60, amp: 5, col: '#d8587c', foam: false });
  lozenges(ctx, 36, sx - 110, sx + 110, hy + 60, hy + 106, 20, '#ffe2a0');
  waves(ctx, X0, hy + 110, XW, 100, { len: 90, amp: 8, col: '#8a4490', foam: '#ffe2c8', every: 3, L });
  lozenges(ctx, 37, sx - 150, sx + 150, hy + 126, hy + 190, 14, '#ffb46a');
  waves(ctx, X0, hy + 196, XW, 140, { len: 128, amp: 11, col: '#4a3080', foam: '#ffe2c8', every: 3, phase: 0.4, L });
  waves(ctx, X0, hy + 300, XW, 500, { len: 170, amp: 14, col: '#2a2060', foam: '#ffe2c8', every: 4, phase: 0.7, L });
  ctx = A();
  for (let i = 0; i < 10; i++) {   // the city's last lanterns, going out
    const a = Math.sin(t * 0.25 + i * 1.3);
    if (a > 0.2) rect(ctx, vx - 240 + rnd(i) * 560, hy - 12 - rnd(i * 3) * 80 - mod(t * 3 + i * 9, 60), 5, 7, a > 0.6 ? '#ffe2a0' : '#ff9a62');
  }
  shimmer(ctx, 39, sx - 120, sx + 120, hy + 6, hy + 230, 20, C.white, t);
  ink(ctx, 3.4);
  for (let i = 0; i < 4; i++) { // gulls
    const x = mod(200 + i * 330 + t * (18 + i * 4), 1700) - 200, y = 70 + i * 36 + Math.sin(t * 0.8 + i) * 14, w = 15 + i * 2, fl = Math.sin(t * 5 + i * 2) * 6;
    ctx.beginPath(); ctx.moveTo(x - w, y - fl); ctx.quadraticCurveTo(x - w * 0.4, y - 6, x, y); ctx.quadraticCurveTo(x + w * 0.4, y - 6, x + w, y - fl); ctx.stroke();
  }
  glint(ctx, sx, sy, 92 + 10 * Math.sin(t * 1.3), C.white, 0.9, 0);
  // the ferry rail
  ctx = S(1.1);
  const rx = px * 1.1, HULL = '#221850';
  rect(ctx, X0, 706, XW, 300, '#161040');
  for (let i = -2; i < 12; i++) { const x = i * 170 + rx; rect(ctx, x + 12, 556, 5, 160, '#ffb46a'); rect(ctx, x, 556, 14, 160, HULL); }
  rect(ctx, X0, 544, XW, 5, '#ffd88a'); rect(ctx, X0, 549, XW, 15, HULL); rect(ctx, X0, 632, XW, 9, HULL);
  ink(ctx, 22, INK); ctx.beginPath(); ctx.arc(196 + rx, 612, 37, 0, TAU); ctx.stroke();
  ink(ctx, 15, C.cream); ctx.beginPath(); ctx.arc(196 + rx, 612, 37, 0, TAU); ctx.stroke();
  ink(ctx, 15, C.crimson); ctx.lineCap = 'butt';
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(196 + rx, 612, 37, i * (Math.PI / 2) + 0.5, i * (Math.PI / 2) + 1.05); ctx.stroke(); }
  stroke(ctx, 1040 + rx, 430, 1040 + rx, 552, 7, HULL); stroke(ctx, 1040 + rx, 432, 1074 + rx, 432, 5, HULL);
  ctx = A();
  swayLantern(ctx, 1074 + rx, 432, 17, '#ffe2a0', L, t, 4, 0);
});

// ── causeway: a salt-white road across tidal flats to Saltmere. Key light: a hard white sun, high on the left ──
const L_SALT = keyLight('#fff6dc', -Math.PI * 0.7, { depth: 0.75, tint: '#123c6a' });
def('causeway', L_SALT, (ctx, t, px) => {
  const L = L_SALT, hy = 300, DEEP = '#123c6a';
  ctx = S(0);
  sky(ctx, hy, ['#1a5496', '#3a88c2', '#7cc2de', '#c8eeee'], [0.34, 0.62, 0.86, 1]);
  const ux = 500 + px * 0.05, uy = 128;
  rings(ctx, ux, uy, 190, [alpha(C.white, 0.16), alpha(C.white, 0.26)], [1, 0.56]);
  circ(ctx, ux, uy, 42, '#ffffff');
  ctx = S(0.08);
  const q = px * 0.08;
  for (const [x, y, w, h, sd] of [[850, 96, 300, 76, 5], [200, 216, 280, 60, 2], [1120, 236, 250, 52, 9], [640, 250, 170, 30, 12]]) cloud(ctx, x + q, y, w, h, '#fbfdf4', L, sd, 0);
  // Saltmere on the horizon: the headframe of the pit, two stacks, their smoke
  ctx = S(0.12);
  const hx = 772 + px * 0.12;
  flat(ctx, (c) => { c.moveTo(hx - 330, hy + 2); c.quadraticCurveTo(hx, hy - 50, hx + 330, hy + 2); c.closePath(); }, '#2c78a4');
  town(ctx, 51, hx - 250, hx + 250, hy - 14, 10, 44, 18, 46, DEEP, L, { rim: 3, rimCol: '#c8eeee' });
  for (let pass = 0; pass < 2; pass++) {
    const o = pass ? 0 : -3.5;
    ink(ctx, 8, pass ? DEEP : '#c8eeee');
    ctx.beginPath(); ctx.moveTo(hx - 40 + o, hy - 16); ctx.lineTo(hx + o, 150); ctx.lineTo(hx + 40 + o, hy - 16); ctx.moveTo(hx + o, 158); ctx.lineTo(hx + 104 + o, hy - 16); ctx.moveTo(hx - 24 + o, 226); ctx.lineTo(hx + 24 + o, 226); ctx.moveTo(hx - 14 + o, 188); ctx.lineTo(hx + 14 + o, 188); ctx.stroke();
    ink(ctx, 6, pass ? DEEP : '#c8eeee'); ctx.beginPath(); ctx.arc(hx + o, 148, 21, 0, TAU); ctx.stroke();
  }
  for (const cxx of [hx - 150, hx + 186]) {
    rimmed(ctx, rp(cxx - 7, 196, 14, 92), DEEP, L, 3, '#c8eeee');
    for (let j = 3; j >= 0; j--) puff(ctx, cxx + 16 + j * 30, 180 - j * 20, 16 + j * 7, '#e4f2ee', L, j + cxx, II);
    curl(ctx, cxx + 150, 96, 24, 1.5, -1, 8, '#e4f2ee', II);
  }
  // the flats: wet salt in flat bands, a cloud's shadow across the near ground
  ctx = S(0.3);
  const g = px * 0.3;
  rect(ctx, X0, hy, XW, 760, '#a8e0dc');
  flat(ctx, pp([[X0, hy + 44], [X0 + XW, hy + 30], [X0 + XW, 980], [X0, 980]]), '#5cc0c4');
  flat(ctx, pp([[X0, hy + 130], [X0 + XW, hy + 104], [X0 + XW, 980], [X0, 980]]), C.sea);
  flat(ctx, pp([[X0, hy + 250], [X0 + XW, hy + 200], [X0 + XW, 980], [X0, 980]]), C.seaDeep);
  for (let i = 0; i < 22; i++) {   // pans of standing water, white with the sky
    const d = rnd(i * 2.7), y = hy + 14 + d * d * 300, w = (50 + rnd(i * 3) * 170) * (0.3 + d), x = rnd(i * 5) * 1800 - 260 + g;
    flat(ctx, ep(x, y, w, w * 0.07 + 2), d > 0.6 ? '#7cc2de' : '#f4fbf4');
    if (i % 4 === 0) glint(ctx, x - w * 0.3, y, 9 + d * 12, '#ffffff', 1);
  }
  // the road, and the poles that mark it when the tide is over it: each throws a long hard shadow
  const vx = hx - 30 + px * 0.18;
  flat(ctx, pp([[vx - 5, hy + 1], [vx + 5, hy + 1], [1250 + g, 980], [-250 + g, 980]]), C.white);
  flat(ctx, pp([[vx + 1, hy + 1], [vx + 5, hy + 1], [1250 + g, 980], [900 + g, 980]]), '#c4dce0');
  taperPath(ctx, [[vx - 5, hy + 1], [-250 + g, 980]], 1.2, 7); taperPath(ctx, [[vx + 5, hy + 1], [1250 + g, 980]], 1.2, 7);
  taperPath(ctx, [[vx - 1, hy + 4], [330 + g, 980]], 0.8, 4, alpha(INK, 0.5)); taperPath(ctx, [[vx + 1.5, hy + 4], [790 + g, 980]], 0.8, 4, alpha(INK, 0.5));
  for (let i = 1; i < 8; i++) {
    const e = Math.pow(i / 7, 2.2), y = lerp(hy + 6, 900, e);
    for (const s of [-1, 1]) {
      const x = lerp(vx + s * 6, (s < 0 ? -250 : 1250) + px * 0.3, (y - hy - 1) / (980 - hy - 1)) + s * 8, h = 10 + e * 190;
      flat(ctx, pp([[x, y], [x + h * 1.5, y + h * 0.3], [x + h * 1.5, y + h * 0.3 + Math.max(2, h * 0.07)]]), alpha(DEEP, 0.55));
      taperPath(ctx, [[x, y], [x, y - h]], Math.max(2, h * 0.07), Math.max(1.4, h * 0.04));
      if (i < 6) flat(ctx, pp([[x, y - h], [x + h * 0.3, y - h * 0.9], [x, y - h * 0.78]]), C.crimson);
    }
  }
  ctx = A();
  for (const i of [6, 7]) {   // the nearest pennants snap in the wind
    const e = Math.pow(i / 7, 2.2), y = lerp(hy + 6, 900, e);
    for (const s of [-1, 1]) {
      const x = lerp(vx + s * 6, (s < 0 ? -250 : 1250) + px * 0.3, (y - hy - 1) / (980 - hy - 1)) + s * 8, h = 10 + e * 190, fl = Math.sin(t * 5 + i + s) * h * 0.05;
      ink(ctx, 2.4); ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x + h * 0.3, y - h * 0.9 + fl); ctx.lineTo(x, y - h * 0.78); ctx.closePath(); ctx.fillStyle = C.crimson; ctx.fill(); ctx.stroke();
    }
  }
  glint(ctx, ux, uy, 70 + 8 * Math.sin(t * 1.1), '#ffffff', 0.95, 0);
  // salt on the wind: curls of it, crossing the flats behind them
  for (let i = 0; i < 3; i++) gust(ctx, mod(rnd(i * 3) * 2000 + t * (150 + i * 40), 2000) - 400 + px, 360 + i * 110, 150 + i * 30, 20 + i * 5, 1, 8, C.white, II);
}, (ctx, t, px) => {
  motes(ctx, 5, 26, '#ffffff', t, { x0: -200 + px, x1: 1500 + px, y0: 300, y1: 800, vx: 260, vy: 14, r: 2.4, a: 0.8, streak: 7, wob: 6 });
});

// ── picket: the pithead gates of Saltmere, at night. Key light: the cresset burning on the left gatepost ──
const L_PICKET = keyLight('#ff9a3a', -Math.PI * 0.76, { depth: 0.92 });
function cresset(ctx, x, y, s, L) {   // an iron fire-basket on a post top; the fire itself is drawn moving
  stroke(ctx, x, y + s * 0.2, x, y + s * 1.5, s * 0.22);
  cel(ctx, pp([[x - s * 0.9, y - s * 0.7], [x + s * 0.9, y - s * 0.7], [x + s * 0.6, y + s * 0.3], [x - s * 0.6, y + s * 0.3]]), '#2a1838', L, { off: 0, shadow: false, ink: Math.max(2, s * 0.12) });
  ink(ctx, Math.max(1.6, s * 0.09));
  ctx.beginPath(); for (let i = -1; i <= 1; i++) { ctx.moveTo(x + i * s * 0.5, y - s * 0.7); ctx.lineTo(x + i * s * 0.34, y + s * 0.3); } ctx.moveTo(x - s * 0.76, y - s * 0.2); ctx.lineTo(x + s * 0.76, y - s * 0.2); ctx.stroke();
}
def('picket', L_PICKET, (ctx, t, px) => {
  const L = L_PICKET, DARK = '#0c0a26', STONE = '#4c3c64';
  ctx = S(0);
  sky(ctx, 560, ['#08082a', '#12184a', '#20306c', '#3a3a70'], [0.36, 0.64, 0.88, 1]);
  starsFlat(ctx, 8, 44, 300);
  // the headframe, and the sheds of the pit
  ctx = S(0.2);
  const hx = 930 + px * 0.2;
  for (let pass = 0; pass < 2; pass++) {
    const o = pass ? 0 : -4;
    ink(ctx, 11, pass ? DARK : '#c85a2c');
    ctx.beginPath(); ctx.moveTo(hx - 74 + o, 560); ctx.lineTo(hx - 26 + o, 156); ctx.moveTo(hx + 74 + o, 560); ctx.lineTo(hx + 26 + o, 156); ctx.moveTo(hx + 26 + o, 164); ctx.lineTo(hx + 320 + o, 560); ctx.stroke();
    ink(ctx, 8, pass ? DARK : '#c85a2c'); ctx.beginPath(); ctx.arc(hx + o, 124, 42, 0, TAU); ctx.stroke();
  }
  ink(ctx, 4.5, DARK);
  ctx.beginPath();
  for (let i = 0; i < 5; i++) { const y0 = 180 + i * 76, w0 = 29 + i * 9, w1 = 29 + (i + 1) * 9; ctx.moveTo(hx - w0, y0); ctx.lineTo(hx + w1, y0 + 76); ctx.moveTo(hx + w0, y0); ctx.lineTo(hx - w1, y0 + 76); ctx.moveTo(hx - w0, y0); ctx.lineTo(hx + w0, y0); }
  for (let i = 0; i < 8; i++) { ctx.moveTo(hx, 124); ctx.lineTo(hx + Math.cos(i * 0.785 + 0.2) * 42, 124 + Math.sin(i * 0.785 + 0.2) * 42); }
  ctx.stroke();
  stroke(ctx, hx + 42, 124, hx + 330, 548, 2, DARK);
  town(ctx, 81, X0 + px * 0.2, 1560, 560, 60, 170, 90, 180, DARK, L, { rim: 3, rimCol: '#8a3a34', win: '#ffb04a', winP: 0.05 });
  // the wall and the gates
  ctx = S(0.5);
  const gx = 640 + px * 0.5, kx = gx - 222, ky = 176;
  rect(ctx, X0, 300, XW, 290, '#1a1640');
  ink(ctx, 2, alpha(INK, 0.8)); ctx.beginPath(); for (let x = X0 + 10; x < 1540; x += 44) { ctx.moveTo(x, 300); ctx.lineTo(x, 590); } ctx.stroke();
  ink(ctx, 2.4, DARK); ctx.beginPath(); for (let x = X0; x < 1540; x += 60) { ctx.moveTo(x, 300); ctx.lineTo(x + 14, 280); ctx.lineTo(x + 30, 300); ctx.lineTo(x + 44, 282); ctx.lineTo(x + 60, 300); } ctx.stroke();
  rings(ctx, kx, ky - 20, 330, [alpha(L.col, 0.12), alpha(L.col, 0.18), alpha(L.col, 0.28)], [1, 0.62, 0.34]);
  rect(ctx, gx - 186, 262, 372, 340, '#141038');
  flat(ctx, pp([[gx - 186, 262], [gx - 50, 262], [gx - 130, 602], [gx - 186, 602]]), '#3a1c40');   // what the cresset reaches of the yard beyond
  for (let i = 0; i <= 14; i++) {
    const x = gx - 186 + i * 26.57;
    rect(ctx, x - 5.5, 280, 3, 322, '#ff9a3a'); rect(ctx, x - 3.5, 276, 8, 326, DARK); flat(ctx, pp([[x - 7, 282], [x + 0.5, 258], [x + 8, 282]]), DARK);
  }
  rect(ctx, gx - 186, 330, 372, 10, DARK); rect(ctx, gx - 186, 540, 372, 10, DARK); rect(ctx, gx - 6, 262, 12, 340, DARK);
  ink(ctx, 4, '#8a8fb0'); ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.moveTo(gx - 36, 424); ctx.quadraticCurveTo(gx, 470, gx + 36, 424); ctx.stroke(); ctx.setLineDash([]);
  cel(ctx, rp(gx - 13, 444, 26, 24), C.brass, L, { off: 5, ink: 2.4 });
  // the arch, and the name on it
  for (const [w, c] of [[46, INK], [38, '#2a1c4a']]) { ink(ctx, w, c); ctx.lineCap = 'butt'; ctx.beginPath(); ctx.arc(gx, 420, 300, Math.PI * 1.23, Math.PI * 1.77); ctx.stroke(); }
  ink(ctx, 4, '#ff9a3a'); ctx.lineCap = 'butt'; ctx.beginPath(); ctx.arc(gx, 420, 317, Math.PI * 1.23, Math.PI * 1.44); ctx.stroke();
  ctx.save(); ctx.translate(gx, 420); ctx.fillStyle = C.cream; ctx.font = `700 23px ${FONT_SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const sign = 'SALTMERE  No. 2  PIT';
  for (let i = 0; i < sign.length; i++) { ctx.save(); ctx.rotate(((i - (sign.length - 1) / 2) / sign.length) * 1.42); ctx.fillText(sign[i], 0, -300); ctx.restore(); }
  ctx.restore(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  // gateposts, and the notice
  for (const s of [-1, 1]) { box(ctx, gx + s * 222 - 36, 214, 72, 390, STONE, L, { off: 20, ink: IW, rim: 6 }); box(ctx, gx + s * 222 - 46, 200, 92, 22, STONE, L, { off: 8, ink: II, rim: 4 }); }
  ctx.save(); ctx.translate(gx + 62, 350); ctx.rotate(0.04);
  cel(ctx, rp(0, 0, 104, 136), C.cream, L, { off: 8, ink: II });
  ctx.fillStyle = INK; ctx.font = `700 17px ${FONT_SERIF}`; ctx.textAlign = 'center'; ctx.fillText('NOTICE', 52, 26);
  for (let i = 0; i < 6; i++) rect(ctx, 14, 42 + i * 11, 76 - (i % 3) * 14, 3.4, alpha(INK, 0.7));
  cel(ctx, cp(78, 116, 12), C.crimson, L, { off: 4, ink: 2 });
  ctx.restore(); ctx.textAlign = 'left';
  bloom(ctx, kx, ky - 24, 180, L.col, 1);
  cresset(ctx, kx, ky, 30, L); cresset(ctx, gx + 222, ky + 6, 22, L);
  // ground: frozen ruts, the cresset's light across them
  ctx = S(0.8);
  const g = px * 0.8;
  rect(ctx, X0, 590, XW, 420, '#12102e');
  flat(ctx, pp([[gx - 330, 590], [gx - 120, 590], [gx + 260 + g, 980], [gx - 300 + g, 980]]), '#4a2444');
  for (let i = 0; i < 16; i++) flat(ctx, ep(rnd(i) * 1800 - 260 + g, 606 + rnd(i * 3) * 190, 60 + rnd(i * 5) * 130, 4 + rnd(i * 7) * 7), i % 3 ? '#20306c' : '#3a3a70');
  stroke(ctx, X0, 590, X0 + XW, 590, II);
  crowd(ctx, 91, -220 + px * 0.6, gx - 270, 522, 9, 25, DARK, L, { signs: 0.3, hat: 0.6 });
  crowd(ctx, 93, gx + 270, 1500 + px * 0.6, 522, 9, 25, DARK, L, { signs: 0.3, hat: 0.6 });
  ctx = A();
  blaze(ctx, kx, ky - 22, 36, t, 1);
  fire(ctx, gx + 222, ky - 10, 15, t, 7);
  glint(ctx, kx, ky - 52, 28 + 6 * Math.sin(t * 4.1), C.white, 0.95, 0);
}, (ctx, t, px) => {
  motes(ctx, 9, 34, '#e8eef8', t, { x0: -100 + px, x1: 1400 + px, y0: -20, y1: 800, vx: 16, vy: 38, r: 2.2, a: 0.8, wob: 14 });
  motes(ctx, 11, 12, '#ffb060', t, { x0: 370 + px, x1: 480 + px, y0: 0, y1: 170, vx: 6, vy: -70, r: 2.2, a: 0.9, tw: 1 });
});

// ── mine-deep: a stillsalt gallery, eleven hundred feet down. Key light: the lamp on its hook under the first cap beam ──
const L_MINE = keyLight('#9fe4ff', -Math.PI * 0.62, { depth: 0.92, tint: '#160a3c' });
/** a cluster of stillsalt at (x, y), growing along angle a: flat two-facet shards, inked */
function shards(ctx, x, y, s, a, seed) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  for (let i = 0; i < 5; i++) {
    const r = (i - 2) * 0.36 + (rnd(seed + i) - 0.5) * 0.2, h = s * (0.5 + rnd(seed * 3 + i) * 0.8), w = s * (0.12 + rnd(seed * 5 + i) * 0.1);
    ctx.save(); ctx.rotate(r);
    ink(ctx, Math.max(1.6, s * 0.05));
    ctx.beginPath(); ctx.moveTo(-w, 0); ctx.lineTo(-w, -h * 0.8); ctx.lineTo(0, -h); ctx.lineTo(w, -h * 0.8); ctx.lineTo(w, 0); ctx.closePath(); ctx.stroke();
    poly(ctx, [[-w, 0], [-w, -h * 0.8], [0, -h], [0, 0]], i % 2 ? '#bff0ff' : C.white);
    poly(ctx, [[0, 0], [0, -h], [w, -h * 0.8], [w, 0]], '#3fa4ee');
    ctx.restore();
  }
  ctx.restore();
}
def('mine-deep', L_MINE, (ctx, t, px) => {
  const L = L_MINE, vx = 640 + px * 0.35, vy = 330, ROCK = ['#2a5cb4', '#1e479a', '#16337c', '#10215a', '#0a1136'];
  const setOf = (i) => { const s = lerp(0.15, 1.02, Math.pow(i / 4, 1.5)); return { s, w: 560 * s, h: 400 * s }; };
  const arch = (i, k) => (c) => {
    const { w, h } = setOf(i);
    c.moveTo(vx - w * k, vy + h * 0.72);
    for (let j = 0; j <= 10; j++) { const a = Math.PI + (j / 10) * Math.PI, jr = k * (1 + (rnd(i * 20 + j) - 0.5) * 0.17); c.lineTo(vx + Math.cos(a) * w * jr, vy - h * 0.2 + Math.sin(a) * h * 0.8 * jr); }
    c.lineTo(vx + w * k, vy + h * 0.72); c.closePath();
  };
  ctx = S(0.35);
  fillAll(ctx, '#3c78d0');
  rings(ctx, vx, vy, 150, ['#5c9ae4', '#9fd0ff'], [1, 0.5]);   // the far end of the gallery, where the seam is still thick
  shards(ctx, vx - 40, vy + 50, 26, -0.3, 60); shards(ctx, vx + 44, vy + 46, 22, 0.4, 61);
  for (let i = 0; i < 5; i++) {
    const { s, w, h } = setOf(i);
    // the rock around this opening, one flat tone darker each set toward us; a lit lip where the lamp finds its edge
    if (i >= 2) { ctx.translate(-5 * s, -5 * s); ctx.beginPath(); ctx.rect(X0 - 20, -200, XW + 40, 1200); arch(i, 1)(ctx); ctx.fillStyle = '#5c9ae4'; ctx.fill('evenodd'); ctx.translate(5 * s, 5 * s); }
    ctx.beginPath(); ctx.rect(X0 - 20, -200, XW + 40, 1200); arch(i, 1)(ctx); ctx.fillStyle = ROCK[i]; ctx.fill('evenodd');
    outline(ctx, arch(i, 1), 1.5 + s * 3);
    // pick-marked facets where the seam has been taken
    for (let k = 0; k < 8; k++) {
      const sd = k % 2 ? 1 : -1, bx = vx + sd * w * (1.06 + rnd(i * 9 + k) * 0.5), by = vy - h * 0.8 + rnd(i * 5 + k) * h * 1.5, fs = (14 + rnd(i * 3 + k) * 26) * (0.4 + s);
      poly(ctx, [[bx, by], [bx + fs, by + fs * 0.3], [bx + fs * 0.6, by + fs], [bx - fs * 0.3, by + fs * 0.7]], k % 3 ? shade(ROCK[i], 0.3) : blend(ROCK[i], '#5c9ae4', 0.4));
    }
    // timber set: two legs and a cap, lit along the lamp's side
    const tw = 6 + s * 22, TIMBER = shade('#8a5a5a', 0.55 - i * 0.1);
    for (const sd of [-1, 1]) {
      stroke(ctx, vx + sd * w * 0.9, vy + h * 0.74, vx + sd * w * 0.78, vy - h * 0.6, tw + 2 + s * 3);
      stroke(ctx, vx + sd * w * 0.9, vy + h * 0.74, vx + sd * w * 0.78, vy - h * 0.6, tw, TIMBER);
      stroke(ctx, vx + sd * w * 0.9 - tw * 0.3, vy + h * 0.74, vx + sd * w * 0.78 - tw * 0.3, vy - h * 0.6, Math.max(1.2, tw * 0.16), '#9fe4ff');
    }
    stroke(ctx, vx - w * 0.86, vy - h * 0.6, vx + w * 0.86, vy - h * 0.6, tw * 1.1 + 2 + s * 3);
    stroke(ctx, vx - w * 0.86, vy - h * 0.6, vx + w * 0.86, vy - h * 0.6, tw * 1.1, TIMBER);
    stroke(ctx, vx - w * 0.84, vy - h * 0.6 + tw * 0.34, vx + w * 0.84, vy - h * 0.6 + tw * 0.34, Math.max(1.2, tw * 0.16), '#9fe4ff');
    // what is left of the stillsalt
    if (i >= 1) {
      bloom(ctx, vx - w * 1.0, vy + h * 0.2, 46 * s + 30, '#3fb4ff', 0.7);
      shards(ctx, vx - w * 1.0, vy + h * (0.5 - rnd(i) * 0.5), 46 * s + 11, 1.25, i * 3 + 1);
      shards(ctx, vx + w * 1.0, vy + h * (0.55 - rnd(i * 3) * 0.6), 42 * s + 11, -1.25, i * 3 + 2);
      shards(ctx, vx + w * (i % 2 ? -0.42 : 0.5), vy - h * 0.97, 24 * s + 8, Math.PI, i * 3 + 3);
    }
  }
  // floor: sleepers and rails running in
  for (let i = 1; i < 11; i++) { const e = Math.pow(i / 10, 2.2), y = lerp(vy + 70, 860, e), w = lerp(26, 420, e); stroke(ctx, vx - w, y, vx + w, y, 3 + e * 14, '#0a0c2a'); }
  for (const s of [-1, 1]) { taperPath(ctx, [[vx + s * 16, vy + 66], [vx + s * 330, 880]], 2.4, 12); taperPath(ctx, [[vx + s * 16, vy + 66], [vx + s * 330, 880]], 1, 5, '#6ab4e8'); }
  // the lamp, hooked under the first cap: a hard cone of cold light under it
  ctx = S(0.6);
  const lx = 566 + px * 0.6, ly = 158;
  shaft(ctx, lx, ly, Math.PI / 2, 760, 1.0, L.col, 0.2);
  stroke(ctx, lx, 70, lx, ly - 34, 3);
  bloom(ctx, lx, ly, 200, L.col, 1);
  box(ctx, lx - 17, ly - 34, 34, 10, C.brass, L, { off: 0, shadow: false, ink: 2.2 }); box(ctx, lx - 17, ly + 24, 34, 10, C.brass, L, { off: 0, shadow: false, ink: 2.2 });
  cel(ctx, rp(lx - 13, ly - 24, 26, 48), C.white, L, { off: 0, shadow: false, ink: 2.2 });
  for (let i = -1; i <= 1; i++) stroke(ctx, lx + i * 9, ly - 24, lx + i * 9, ly + 24, 2);
  // the last good clusters, close to the lens
  ctx = S(1.1);
  bloom(ctx, 70 + px * 1.1, 600, 190, '#3fb4ff', 0.8); bloom(ctx, 1220 + px * 1.1, 590, 170, '#3fb4ff', 0.8);
  shards(ctx, 60 + px * 1.1, 660, 130, 0.5, 41); shards(ctx, 1230 + px * 1.1, 640, 112, -0.6, 43);
  ctx = A();
  glint(ctx, lx, ly, 30 + 5 * Math.sin(t * 2.1), C.white, 1, 0);
  twinkle(ctx, [[vx - 300, 250, 16], [vx + 310, 262, 14], [vx + 150, 120, 12], [vx - 520, 330, 18], [vx + 540, 300, 18], [vx, vy + 20, 14]], t);
  // the drip
  const dp = mod(t * 0.5, 1), dxp = vx - 250 + px * 0.7;
  if (dp < 0.6) rect(ctx, dxp, 110 + (dp / 0.6) * (dp / 0.6) * 560, 3, 11, '#bff0ff');
  else { ink(ctx, 2.4, alpha('#bff0ff', 1 - (dp - 0.6) / 0.4)); ctx.beginPath(); ctx.ellipse(dxp, 676, ((dp - 0.6) / 0.4) * 46, ((dp - 0.6) / 0.4) * 7, 0, 0, TAU); ctx.stroke(); }
}, (ctx, t, px) => {
  motes(ctx, 15, 24, '#bff0ff', t, { x0: 300 + px, x1: 1000 + px, y0: 0, y1: 700, vx: 3, vy: -9, r: 2.2, a: 0.8, tw: 1, wob: 16 });
});

// ── court: a circuit hearing in the miners' drill hall, under the roll. Key light: day through the high windows ──
const L_COURT = keyLight('#fff0c8', -Math.PI * 0.7, { depth: 0.85, tint: '#1a1c4a' });
def('court', L_COURT, (ctx, t, px) => {
  const L = L_COURT, WALL = '#262a4a', DARK = '#141230';
  ctx = S(0.4);
  const o = px * 0.3;
  fillAll(ctx, WALL);
  ink(ctx, 2, alpha(INK, 0.55));
  ctx.beginPath(); for (let y = -160; y < 520; y += 44) { ctx.moveTo(X0, y); ctx.lineTo(X0 + XW, y); } ctx.stroke();
  // roof trusses
  ink(ctx, 16, DARK);
  ctx.beginPath(); for (let i = -1; i < 5; i++) { const x = -200 + i * 400 + o; ctx.moveTo(x, 14); ctx.lineTo(x + 200, -150); ctx.lineTo(x + 400, 14); ctx.moveTo(x + 200, -150); ctx.lineTo(x + 200, 14); } ctx.stroke();
  rect(ctx, X0, 4, XW, 18, DARK);
  // high windows: the nearest white, and every one throwing a hard slab of day down and to the right
  for (const [wxx, key] of [[92, 0], [352, 1], [810, 0], [1070, 0]]) {
    const x = wxx + o;
    flat(ctx, pp([[x, 206], [x + 118, 206], [x + 118 + 470, 980], [x + 470 - 150, 980]]), alpha(L.col, key ? 0.2 : 0.12));
    if (key) flat(ctx, pp([[x + 30, 206], [x + 90, 206], [x + 90 + 470, 980], [x + 470 - 60, 980]]), alpha(L.col, 0.16));
    box(ctx, x - 12, 26, 142, 192, DARK, L, { off: 0, shadow: false, ink: 0 });
    rect(ctx, x, 38, 118, 168, key ? C.white : '#dfe8d8');
    if (key) bloom(ctx, x + 59, 122, 170, L.col, 0.7);
    stroke(ctx, x + 59, 38, x + 59, 206, 6, DARK); stroke(ctx, x, 94, x + 118, 94, 5, DARK); stroke(ctx, x, 150, x + 118, 150, 5, DARK);
    outline(ctx, rp(x, 38, 118, 168), II);
  }
  // the roll of those the pit kept: brass-framed, lit along its upper left
  const rx = 640 + o;
  cel(ctx, rp(rx - 116, 34, 232, 190), C.brass, L, { off: 8, ink: IW, rim: 4 });
  rect(ctx, rx - 102, 48, 204, 162, '#12343c'); outline(ctx, rp(rx - 102, 48, 204, 162), II);
  ctx.fillStyle = C.cream; ctx.font = `700 17px ${FONT_SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('KEPT  BY  THE  PIT', rx, 72);
  ctx.textAlign = 'left';
  for (let c = 0; c < 2; c++) for (let r = 0; r < 9; r++) rect(ctx, rx - 90 + c * 96, 84 + r * 13.5, 46 + rnd(c * 20 + r) * 36, 3.4, alpha(C.cream, 0.5 + 0.4 * rnd(r * 3 + c)));
  // racks of drill staves along the wall
  for (const rxx of [150, 990]) {
    const x = rxx + o;
    ink(ctx, 6, '#7a5a4a'); ctx.beginPath(); for (let i = 0; i < 9; i++) { ctx.moveTo(x + 10 + i * 16, 300 + rnd(i + rxx) * 8); ctx.lineTo(x + 12 + i * 16, 500); } ctx.stroke();
    rect(ctx, x, 330, 150, 9, DARK); rect(ctx, x, 470, 150, 9, DARK);
  }
  // floor: the windows' light lies on it in slabs
  rect(ctx, X0, 520, XW, 480, '#1e1c3a');
  for (const wxx of [92, 352, 810, 1070]) { const x = wxx + o + 190; flat(ctx, pp([[x, 520], [x + 240, 520], [x + 520, 980], [x + 190, 980]]), wxx === 352 ? '#b8a88a' : '#6a6272'); }
  ink(ctx, 2, alpha(INK, 0.7));
  ctx.beginPath(); for (let i = -10; i < 26; i++) { ctx.moveTo(640 + (i - 8) * 70 + px * 0.4, 520); ctx.lineTo(640 + (i - 8) * 230 + px, 980); } ctx.stroke();
  stroke(ctx, X0, 520, X0 + XW, 520, IW);
  // the bench on its dais
  const dx = 640 + px * 0.4;
  box(ctx, dx - 440, 506, 880, 36, '#4a2a40', L, { off: 8, ink: II, rim: 3 });
  for (let i = -1; i <= 1; i++) {
    const x = dx + i * 210, up = i ? 0 : 26;
    cel(ctx, (c) => { c.moveTo(x - 46, 508); c.lineTo(x - 46, 330 - up); c.quadraticCurveTo(x, 290 - up, x + 46, 330 - up); c.lineTo(x + 46, 508); c.closePath(); }, '#3a1c34', L, { off: 9, ink: II, rim: 3 });
  }
  box(ctx, dx - 380, 424, 760, 86, C.seaDeep, L, { off: 14, ink: II });
  box(ctx, dx - 388, 414, 776, 14, '#8a5a3a', L, { off: 0, shadow: false, ink: II, rim: 3 });
  files(ctx, dx - 330, 414, 70, 5, 5); files(ctx, dx + 240, 414, 76, 8, 8); files(ctx, dx - 110, 414, 60, 3, 11);
  // the public, standing along both walls: four hundred of them
  crowd(ctx, 101, X0 + px * 0.5, dx - 470, 462, 10, 21, DARK, L, { hat: 0.3 });
  crowd(ctx, 103, dx + 470, 1540 + px * 0.5, 462, 10, 21, DARK, L, { hat: 0.3 });
  crowd(ctx, 105, X0 + px * 0.6, 1540, 600, 22, 30, '#0e0c26', L, { hat: 0.35 });
}, (ctx, t, px) => {
  motes(ctx, 17, 26, '#fff6dc', t, { x0: 300 + px, x1: 1000 + px, y0: 200, y1: 700, vx: 5, vy: 4, r: 2, a: 0.6, tw: 1, wob: 18 });
});

// ── ledger-room: Saltmere's records, in the old powder vault, at night. Key light: the moon through the grille ──
const L_VAULT = keyLight('#bcd0ff', -Math.PI * 0.7, { depth: 0.92, tint: '#160c3a' });
const SPINES = ['#d6263f', '#0b5a6e', '#e0a83a', '#2c2670', '#8a4a6a', '#18a79c'];
/** shelves of ledgers: spines as flat bands, a gap where one has been taken. dim 0..1 drops them into shadow */
function stacks(ctx, x, y0, w, rowsN, rowH, seed, dim, L) {
  rect(ctx, x - 10, y0 - 14, w + 20, rowsN * rowH + 24, C.night);
  for (let r = 0; r < rowsN; r++) {
    const y = y0 + r * rowH;
    let sx = x, i = 0;
    while (sx < x + w - 10) {
      const sw = 15 + rnd(seed + r * 31 + i) * 16, h = rowH - 16 - rnd(seed * 3 + r * 7 + i) * 16;
      if (rnd(seed * 7 + r * 11 + i) > 0.08) {
        rect(ctx, sx, y + rowH - 8 - h, sw - 1, h, shade(SPINES[Math.floor(rnd(seed * 9 + r + i * 3) * SPINES.length)], dim));
        rect(ctx, sx, y + rowH - 8 - h * 0.8, sw - 1, 3, shade(C.cream, dim)); rect(ctx, sx, y + rowH - 8 - h * 0.28, sw - 1, 3, shade(C.cream, dim));
        ink(ctx, 1.5); ctx.strokeRect(sx, y + rowH - 8 - h, sw - 1, h);
      }
      sx += sw; i++;
    }
    box(ctx, x - 10, y + rowH - 8, w + 20, 9, shade('#6a4a6a', dim * 0.7), L, { off: 0, shadow: false, ink: 1.6 });
  }
  outline(ctx, rp(x - 10, y0 - 14, w + 20, rowsN * rowH + 24), IW);
}
def('ledger-room', L_VAULT, (ctx, t, px) => {
  const L = L_VAULT, DARK = '#0a0a28';
  ctx = S(0.2);
  const o = px * 0.2, wx = 440 + o;
  fillAll(ctx, DARK);
  ink(ctx, 2, alpha('#2c2670', 0.9));   // the vault's stone, coursed
  ctx.beginPath(); for (let r = 0; r < 9; r++) { const y = -120 + r * 86; ctx.moveTo(X0, y); ctx.lineTo(X0 + XW, y); for (let x = X0 + (r % 2) * 80; x < 1540; x += 160) { ctx.moveTo(x, y); ctx.lineTo(x, y + 86); } } ctx.stroke();
  // the moon's light: three hard slabs between the bars, down and to the right across the room
  for (let k = 0; k < 3; k++) flat(ctx, pp([[wx + 4 + k * 34, 196], [wx + 28 + k * 34, 196], [wx + 560 + k * 74, 980], [wx + 470 + k * 74, 980]]), alpha(L.col, 0.28));
  rings(ctx, wx + 52, 132, 210, [alpha(L.col, 0.1), alpha(L.col, 0.16)], [1, 0.58]);
  cel(ctx, pp([[wx - 26, 56], [wx + 130, 56], [wx + 118, 210], [wx - 14, 210]]), '#2c2670', L, { off: 10, ink: IW });
  flat(ctx, archP(wx, 196, 104, 126), C.white);
  ink(ctx, 6.5); ctx.beginPath(); for (let k = 1; k < 3; k++) { ctx.moveTo(wx + k * 34.7, 72); ctx.lineTo(wx + k * 34.7, 196); } ctx.moveTo(wx, 142); ctx.lineTo(wx + 104, 142); ctx.stroke();
  outline(ctx, archP(wx, 196, 104, 126), IW);
  // vault door, standing a little open
  const vx = 742 + px * 0.15, vy = 318;
  box(ctx, vx - 196, 108, 392, 500, '#161444', L, { off: 0, shadow: false, ink: IW });
  cel(ctx, cp(vx, vy, 172), '#5a6aa8', L, { off: 44, ink: IW, rim: 8, shadow: '#262a66' });
  ink(ctx, 3.4); for (const r of [140, 88]) { ctx.beginPath(); ctx.arc(vx, vy, r, 0, TAU); ctx.stroke(); }
  for (let i = 0; i < 16; i++) circ(ctx, vx + Math.cos(i * 0.3927) * 156, vy + Math.sin(i * 0.3927) * 156, 5.5, INK);
  for (let i = 0; i < 5; i++) { const a = 0.3 + i * (TAU / 5); stroke(ctx, vx, vy, vx + Math.cos(a) * 76, vy + Math.sin(a) * 76, 12); stroke(ctx, vx, vy, vx + Math.cos(a) * 76, vy + Math.sin(a) * 76, 6, '#bcd0ff'); cel(ctx, cp(vx + Math.cos(a) * 76, vy + Math.sin(a) * 76, 10), '#bcd0ff', L, { off: 4, ink: 2.2 }); }
  cel(ctx, cp(vx, vy, 20), '#bcd0ff', L, { off: 7, ink: 2.6 });
  rect(ctx, vx + 176, 120, 5, 476, C.lantern);
  // the stacks
  ctx = S(0.5);
  stacks(ctx, -230 + px * 0.5, 30, 590, 7, 82, 3, 0.5, L);
  stacks(ctx, 960 + px * 0.5, 30, 560, 7, 82, 9, 0.3, L);
  // ladder
  const lx = 1010 + px * 0.6;
  ink(ctx, 12); ctx.beginPath(); ctx.moveTo(lx, 620); ctx.lineTo(lx + 60, 10); ctx.moveTo(lx + 70, 620); ctx.lineTo(lx + 130, 10); ctx.stroke();
  ink(ctx, 6, '#8a5a6a'); ctx.beginPath(); ctx.moveTo(lx, 620); ctx.lineTo(lx + 60, 10); ctx.moveTo(lx + 70, 620); ctx.lineTo(lx + 130, 10); for (let i = 0; i < 9; i++) { ctx.moveTo(lx + 6 + i * 6.4, 560 - i * 62); ctx.lineTo(lx + 76 + i * 6.4, 560 - i * 62); } ctx.stroke();
  // floor: the slabs of moonlight lie on it
  rect(ctx, X0, 600, XW, 400, '#0c0c30');
  for (let k = 0; k < 3; k++) flat(ctx, pp([[wx + 318 + k * 62, 600], [wx + 372 + k * 62, 600], [wx + 500 + k * 80, 800], [wx + 430 + k * 80, 800]]), '#6a7ac0');
  stroke(ctx, X0, 600, X0 + XW, 600, II);
  // the reading table and a shuttered lamp
  ctx = S(0.9);
  const tx = 640 + px * 0.9;
  box(ctx, tx - 420, 612, 840, 300, '#2a1a44', L, { off: 0, shadow: false, ink: II });
  box(ctx, tx - 430, 604, 860, 12, '#5a3a6a', L, { off: 0, shadow: false, ink: II, rim: 3 });
  bloom(ctx, tx + 180, 578, 84, C.lantern, 0.8);
  cel(ctx, rp(tx + 164, 548, 32, 58), '#1a1640', L, { off: 0, shadow: false, ink: 2.4 }); rect(ctx, tx + 171, 560, 18, 32, C.white);
  cel(ctx, pp([[tx + 158, 548], [tx + 180, 528], [tx + 202, 548]]), '#1a1640', L, { off: 0, shadow: false, ink: 2.4 });
  cel(ctx, pp([[tx - 190, 604], [tx - 20, 592], [tx + 130, 604]]), C.cream, L, { off: 0, shadow: false, ink: II });
  stroke(ctx, tx - 20, 592, tx - 20, 604, 2);
  ctx = S(1.2);
  stacks(ctx, -330 + px * 1.2, -60, 190, 9, 96, 17, 0.72, L);
  stacks(ctx, 1400 + px * 1.2, -60, 200, 9, 96, 21, 0.72, L);
  ctx = A();
  glint(ctx, wx + 22, 98, 20 + 5 * Math.sin(t * 1.3), C.white, 1, 0);
  if (Math.sin(t * 0.9) > -0.4) rect(ctx, vx + 176, 120, 5, 476, '#ffe2a0');   // someone's lamp, beyond the door
}, (ctx, t, px) => {
  motes(ctx, 19, 22, '#dfe8ff', t, { x0: 480 + px, x1: 1000 + px, y0: 180, y1: 700, vx: 3, vy: 5, r: 2, a: 0.7, tw: 1, wob: 14 });
});

// ── orrery: the lamp-engine. Turning brass rings around a cold flame, above still water. Key light: the flame ──
const L_ENGINE = keyLight('#7fd8ff', -Math.PI * 0.4, { depth: 0.92, tint: '#120a3a' });
const L_ENGINE_E = keyLight('#7fd8ff', 0, { depth: 0.92, tint: '#120a3a' }), L_ENGINE_W = keyLight('#7fd8ff', Math.PI, { depth: 0.92, tint: '#120a3a' });   // for what stands to the left and to the right of it
function gear(ctx, x, y, r, teeth, a, col) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) { const rr2 = i % 2 ? r : r * 0.8, an = (i / (teeth * 2)) * TAU; ctx.lineTo(Math.cos(an - 0.07) * rr2, Math.sin(an - 0.07) * rr2); ctx.lineTo(Math.cos(an + 0.07) * rr2, Math.sin(an + 0.07) * rr2); }
  ctx.closePath(); ink(ctx, 5); ctx.stroke(); ctx.fillStyle = col; ctx.fill();
  circ(ctx, 0, 0, r * 0.5, INK); circ(ctx, 0, 0, r * 0.18, col);
  ink(ctx, r * 0.13, col); ctx.beginPath(); ctx.moveTo(-r * 0.76, 0); ctx.lineTo(r * 0.76, 0); ctx.moveTo(0, -r * 0.76); ctx.lineTo(0, r * 0.76); ctx.stroke();
  ctx.restore();
}
function engineRings(ctx, cx, cy, t) {
  for (let i = 4; i >= 0; i--) {
    const rx = 84 + i * 46, w = 9 - i * 0.8;
    const tilt = 0.16 + 0.3 * Math.abs(Math.sin(t * (0.1 + i * 0.03) + i * 1.3));
    const rot = Math.sin((i % 2 ? -1 : 1) * t * (0.05 + i * 0.012) + i * 0.7) * 0.5;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
    // a toothed ring: this is a machine, and the teeth are what turn it
    ink(ctx, 7, C.brass); ctx.lineCap = 'butt'; ctx.setLineDash([4, 10]); ctx.lineDashOffset = t * (4 + i) * (i % 2 ? 1 : -1);
    ctx.beginPath(); ctx.ellipse(0, 0, rx + 5, (rx + 5) * tilt, 0, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ink(ctx, w + 5, INK); ctx.beginPath(); ctx.ellipse(0, 0, rx, rx * tilt, 0, 0, TAU); ctx.stroke();
    ink(ctx, w, C.brass); ctx.beginPath(); ctx.ellipse(0, 0, rx, rx * tilt, 0, 0, TAU); ctx.stroke();
    ink(ctx, w * 0.5, '#8a4a34'); ctx.beginPath(); ctx.ellipse(0, 0, rx, rx * tilt, 0, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();   // the far limb, behind the flame: its one shadow
    ink(ctx, w * 0.4, C.white); ctx.beginPath(); ctx.ellipse(0, 0, rx - w * 0.2, (rx - w * 0.2) * tilt, 0, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke();   // the cold light, caught on the near limb
    // each ring carries a shutter-lens that throws the flame's light out to sea as it passes
    const pa = t * (0.2 + i * 0.06) * (i % 2 ? 1 : -1) + i * 2.1, lx = Math.cos(pa) * rx, ly = Math.sin(pa) * rx * tilt;
    rect(ctx, lx - 11, ly - 15, 22, 30, INK); rect(ctx, lx - 8, ly - 12, 16, 24, C.brass);
    rect(ctx, lx - 5, ly - 9, 10, 18, Math.sin(pa) > 0 ? C.white : '#3fa4ee');
    ctx.restore();
  }
}
def('orrery', L_ENGINE, (ctx, t, px) => {
  const L = L_ENGINE, cx = 640 + px * 0.25, cy = 186, wy = 500, hy = 372, STONE = '#2c3a78', DARK = '#0b0e30';
  // night and the sea, seen through the open arcade of the lamp-house
  ctx = S(0);
  sky(ctx, hy, ['#060826', '#0c1444', '#14286a', '#22468e'], [0.4, 0.68, 0.9, 1]);
  starsFlat(ctx, 41, 46, hy - 50);
  ctx = S(0.1);
  rect(ctx, X0, hy, XW, wy - hy + 4, '#12306a');
  waves(ctx, X0, hy + 30, XW, 60, { len: 52, amp: 4, col: '#0e2456', foam: false });
  waves(ctx, X0, hy + 74, XW, 80, { len: 80, amp: 6, col: '#0a1a46', foam: '#7fd8ff', every: 4, L });
  // the lane: where the smoke has lain, the sea is flat and takes the light
  const lane = cx - px * 0.15;
  flat(ctx, pp([[lane - 50, hy], [lane + 50, hy], [lane + 300, wy], [lane - 300, wy]]), '#2c6aa8');
  flat(ctx, pp([[lane - 18, hy], [lane + 18, hy], [lane + 110, wy], [lane - 110, wy]]), '#5cb0e0');
  lozenges(ctx, 43, lane - 60, lane + 60, hy + 4, wy - 10, 16, C.white);
  stroke(ctx, X0, hy, X0 + XW, hy, 2, '#7fd8ff');
  for (let i = 0; i < 7; i++) { const x = 70 + i * 190 + rnd(i * 3.1) * 90, y = hy + 3 + rnd(i * 5) * 16; poly(ctx, [[x - 11, y], [x + 12, y], [x + 8, y + 4], [x - 8, y + 4]], DARK); rect(ctx, x - 1, y - 12, 2, 12, DARK); }
  ctx = A();
  for (let i = 0; i < 7; i++) {   // out on the water, ships answer
    if (Math.sin(t * (0.9 + rnd(i) * 0.5) + i * 2.4) < -0.25) continue;
    const x = 70 + i * 190 + rnd(i * 3.1) * 90 + px * 0.1, y = hy + 3 + rnd(i * 5) * 16;
    rect(ctx, x - 2, y - 15, 4, 4, '#ffe2a0'); rect(ctx, x - 6, y + 6, 12, 2, C.lantern);
  }
  // the arcade: piers lit on the side that faces the flame, and the arches between them
  ctx = S(0.15);
  for (let i = 0; i < 8; i++) {
    const side = i % 2 ? 1 : -1, d = Math.floor(i / 2), x = cx + side * (300 + d * 150) - px * 0.1 + px * d * 0.1, w = 36 + d * 14;
    box(ctx, x - w / 2, -180, w, wy + 180 + d * 14, STONE, side < 0 ? L_ENGINE_E : L_ENGINE_W, { off: w * 0.42, ink: II, rim: 5, shadow: DARK });
    box(ctx, x - w / 2 - 7, wy + d * 14 - 12, w + 14, 15, STONE, side < 0 ? L_ENGINE_E : L_ENGINE_W, { off: 6, ink: II, shadow: DARK });
  }
  ctx.fillStyle = DARK;
  ctx.beginPath(); ctx.rect(X0, -180, XW, 280);
  for (const [a0, a1] of [[-750, -600], [-600, -450], [-450, -300], [-300, 300], [300, 450], [450, 600], [600, 750]]) { // arch heads, cut out of the wall above the piers
    const xa = cx + a0 - px * 0.1, wA = a1 - a0;
    ctx.moveTo(xa + wA - 16, 100); ctx.lineTo(xa + 16, 100); ctx.quadraticCurveTo(xa + wA / 2, 100 - Math.min(190, wA * 0.5) * 2, xa + wA - 16, 100);
  }
  ctx.fill('evenodd');
  ink(ctx, IW); ctx.beginPath();
  for (const [a0, a1] of [[-750, -600], [-600, -450], [-450, -300], [-300, 300], [300, 450], [450, 600], [600, 750]]) { const xa = cx + a0 - px * 0.1, wA = a1 - a0; ctx.moveTo(xa + 16, 100); ctx.quadraticCurveTo(xa + wA / 2, 100 - Math.min(190, wA * 0.5) * 2, xa + wA - 16, 100); }
  ctx.stroke();
  // the flame's light, in flat steps; the hopper and the chute that feeds the cup: tonight it is being filled by hand
  ctx = S(0.25);
  rings(ctx, cx, cy - 30, 300, [alpha(L.col, 0.1), alpha(L.col, 0.16), alpha(L.col, 0.26)], [1, 0.64, 0.36]);
  const hx = cx - 236;
  stroke(ctx, hx + 26, 150, cx - 30, cy - 4, 15); stroke(ctx, hx + 26, 150, cx - 30, cy - 4, 9, '#8a4a34'); stroke(ctx, hx + 26, 146, cx - 30, cy - 8, 2.4, C.brass);
  stroke(ctx, hx + 20, 150, hx + 20, wy, 12); stroke(ctx, hx + 20, 150, hx + 20, wy, 6, '#8a4a34');
  cel(ctx, pp([[hx - 36, 70], [hx + 46, 70], [hx + 32, 154], [hx + 8, 154]]), C.brass, L_ENGINE_E, { off: 14, ink: IW, rim: 4 });
  box(ctx, hx - 42, 62, 94, 11, C.brass, L_ENGINE_E, { off: 0, shadow: false, ink: II });
  // armature
  stroke(ctx, cx, cy + 36, cx, wy, 17); stroke(ctx, cx, cy + 36, cx, wy, 10, '#8a4a34'); stroke(ctx, cx - 3, cy + 36, cx - 3, wy, 2.6, C.brass);
  for (const s of [-1, 1]) { stroke(ctx, cx + s * 150, wy, cx + s * 20, cy + 190, 12); stroke(ctx, cx + s * 150, wy, cx + s * 20, cy + 190, 6, '#8a4a34'); }
  cel(ctx, pp([[cx - 190, wy + 2], [cx + 190, wy + 2], [cx + 160, wy - 18], [cx - 160, wy - 18]]), '#8a4a34', L, { off: 0, shadow: false, ink: II, rim: 3 });
  // the beam the engine throws: cold light going out between the piers, turning
  ctx = A();
  for (let i = 0; i < 2; i++) {
    const c = Math.cos(t * 0.11 + i * 2.6), bx = cx + c * 900;
    poly(ctx, [[cx, cy - 20], [bx - 90, hy - 30 - Math.abs(c) * 60], [bx + 90, hy + 10]], alpha(L.col, 0.1 + 0.06 * Math.abs(c)));
  }
  ctx.fillStyle = C.white;
  for (let i = 0; i < 3; i++) { const ph = mod(t * 0.5 + i * 0.33, 1); ctx.fillRect(lerp(hx + 30, cx - 34, ph) - 3, lerp(144, cy - 10, ph) - 3, 6, 6); }
  gear(ctx, cx + 62, wy - 56, 44, 12, t * 0.4, C.brass);
  gear(ctx, cx + 120, wy - 28, 26, 8, -t * 0.4 * (12 / 8) + 0.2, '#c9783a');
  gear(ctx, cx - 58, wy - 46, 34, 10, -t * 0.52, '#c9783a');
  engineRings(ctx, cx, cy, t);
  // the burner: a brass cup on the spindle, and stillsalt burning in it
  ink(ctx, 3);
  ctx.beginPath(); ctx.moveTo(cx - 38, cy + 4); ctx.quadraticCurveTo(cx - 32, cy + 36, cx - 8, cy + 40); ctx.lineTo(cx + 8, cy + 40); ctx.quadraticCurveTo(cx + 32, cy + 36, cx + 38, cy + 4); ctx.closePath();
  ctx.fillStyle = C.brass; ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.white; ctx.beginPath(); ctx.ellipse(cx, cy + 4, 38, 7, 0, 0, TAU); ctx.fill(); ctx.stroke();
  fire(ctx, cx, cy + 2, 40, t * 0.36, 3, COLD);
  glint(ctx, cx, cy - 24, 24 + 5 * Math.sin(t * 1.4), C.white, 1, 0);
  // its smoke does not rise. It pours, and lies down, and whatever it lies on goes flat
  const ga = ctx.globalAlpha;
  for (let i = 0; i < 5; i++) {
    const ph = mod(t * 0.07 + i / 5, 1), side = i % 2 ? 1 : -1, down = Math.min(1, ph * 2.4);
    ctx.globalAlpha = ga * Math.min(1, (1 - ph) * 2.2) * Math.min(1, ph * 8);
    curl(ctx, cx + side * (26 + ph * 330), cy + 50 + (wy - cy - 84) * down * (2 - down), 14 + ph * 26, 1.4, side, 5 + ph * 6, '#bfe8fa', II);
  }
  ctx.globalAlpha = ga;
  // still water: the flame lying in it in three flat steps
  ctx = S(0);
  rect(ctx, X0, wy, XW, 500, '#080c2c');
  flat(ctx, ep(640, wy + 96, 430, 80), '#101e52'); flat(ctx, ep(640, wy + 78, 270, 48), '#1a3e86'); flat(ctx, ep(640, wy + 62, 120, 20), '#5cb0e0'); flat(ctx, ep(640, wy + 56, 44, 7), C.white);
  lozenges(ctx, 47, 400, 880, wy + 20, wy + 190, 18, '#5cb0e0');
  rect(ctx, X0, wy, XW, 3, '#7fd8ff'); stroke(ctx, X0, wy + 4, X0 + XW, wy + 4, II);
  // sacks of salt at the basin's edge, the last of them cut open
  for (let i = 0; i < 5; i++) {
    const x = 170 + i * 48 + (i > 2 ? 700 : 0), y = wy - 2;
    cel(ctx, ep(x, y - 17, 27, 20), i % 2 ? '#c8b8a8' : '#e4d8c4', i > 2 ? L_ENGINE_W : L_ENGINE_E, { off: 8, ink: 2.6, shadow: '#5a4a7a' });
    stroke(ctx, x - 10, y - 34, x + 8, y - 38, 3.4);
    if (i === 2 || i === 4) for (let j = 0; j < 7; j++) rect(ctx, x + 20 + j * 6, y - 6 - rnd(j) * 7, 5, 5, C.white);
  }
}, (ctx, t, px) => {
  // the smoke on the floor, going out through the arches toward the sea
  const ga = ctx.globalAlpha; ctx.globalAlpha = ga * 0.55;
  for (let i = 0; i < 3; i++) gust(ctx, mod(rnd(i * 3) * 1700 + t * (i % 2 ? 16 : 12), 1700) - 220 + px, 474 + i * 16, 190, 16 + i * 4, 1, 9, '#bfe8fa', II);
  ctx.globalAlpha = ga;
  motes(ctx, 21, 18, '#cfeaff', t, { x0: 300 + px, x1: 980 + px, y0: 60, y1: 500, vx: 2, vy: 9, r: 2, a: 0.7, tw: 1, wob: 14 });
});

// ── commons-hall: long tables, soup, a chalkboard of names. Key light: the lamp hung over the tables ──
const L_COMMONS = keyLight('#ffc878', -Math.PI * 0.72, { depth: 0.88 });
function hallLamp(ctx, x, y, L, lit) {   // an enamel shade on a cord
  stroke(ctx, x, -180, x, y - 34, 3);
  if (lit) bloom(ctx, x, y + 6, 190, L.col, 1);
  cel(ctx, pp([[x - 12, y - 36], [x + 12, y - 36], [x + 46, y], [x - 46, y]]), C.sea, L, { off: 0, ink: IW, shadow: pp([[x + 2, y - 36], [x + 12, y - 36], [x + 46, y], [x + 14, y]]), hi: pp([[x - 9, y - 33], [x - 3, y - 33], [x - 22, y - 3], [x - 38, y - 3]]), hiCol: '#8fe8dc' });
  cel(ctx, ep(x, y, 46, 8), lit ? C.white : '#8a6a5a', L, { off: 0, shadow: false, ink: 2.4 });
}
def('commons-hall', L_COMMONS, (ctx, t, px) => {
  const L = L_COMMONS, DARK = '#22102c';
  ctx = S(0.25);
  const o = px * 0.25, lx0 = 410 + o;
  fillAll(ctx, DARK);
  rings(ctx, lx0, 136, 720, ['#34183a', '#582a3a', '#8a4638'], [1, 0.62, 0.34]);
  ink(ctx, 2, alpha(INK, 0.6)); ctx.beginPath(); for (let x = X0 + 14; x < 1540; x += 46) { ctx.moveTo(x, -180); ctx.lineTo(x, 560); } ctx.stroke();
  box(ctx, X0, 426, XW, 10, '#8a4638', L, { off: 0, shadow: false, ink: 1.8 });
  // window: evening over the pit
  const wx = 30 + o;
  box(ctx, wx - 12, 88, 204, 256, '#5a2c3a', L, { off: 8, ink: IW, rim: 4 });
  bands(ctx, wx, 100, 180, 232, ['#2a2468', '#6a3c8a', '#d8587c', '#ff9a62'], [0.36, 0.62, 0.84, 1]);
  ink(ctx, 5, C.night); ctx.beginPath(); ctx.moveTo(wx + 96, 332); ctx.lineTo(wx + 120, 190); ctx.lineTo(wx + 144, 332); ctx.stroke(); ctx.beginPath(); ctx.arc(wx + 120, 184, 13, 0, TAU); ctx.stroke();
  stroke(ctx, wx + 90, 100, wx + 90, 332, 6); stroke(ctx, wx, 210, wx + 180, 210, 5); outline(ctx, rp(wx, 100, 180, 232), II);
  // the stove, and the one pot that feeds four hundred
  const sx = 296 + o;
  box(ctx, sx - 16, -180, 32, 500, '#2a1a40', L, { off: 10, ink: II, rim: 3 });
  box(ctx, sx - 62, 320, 124, 110, '#2a1a40', L, { off: 16, ink: IW, rim: 5 });
  rect(ctx, sx - 30, 364, 60, 34, C.lantern); outline(ctx, rp(sx - 30, 364, 60, 34), II); stroke(ctx, sx - 10, 364, sx - 10, 398, 2); stroke(ctx, sx + 10, 364, sx + 10, 398, 2);
  cel(ctx, rrp(sx - 46, 268, 92, 54, 10), C.brass, L, { off: 12, ink: IW, rim: 4 });
  // the board: Gave, and Is owed
  const bx = 480 + o, bw = 420, by = 86, bh = 284;
  cel(ctx, rp(bx - 16, by - 16, bw + 32, bh + 38), '#8a4a34', L, { off: 9, ink: IW, rim: 4 });
  rect(ctx, bx, by, bw, bh, '#0f3038');
  flat(ctx, pp([[bx, by], [bx + 250, by], [bx + 90, by + bh], [bx, by + bh]]), '#18474e');   // the lamp reaches this much of the slate
  outline(ctx, rp(bx, by, bw, bh), II);
  ctx.fillStyle = C.cream; ctx.font = `700 25px ${FONT_SERIF}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('THE COMMONS', bx + 18, by + 36);
  ctx.font = `italic 16px ${FONT_SERIF}`; ctx.fillStyle = alpha(C.cream, 0.8);
  ctx.fillText('what is given is not owed', bx + 232, by + 35);
  ink(ctx, 2.6, alpha(C.cream, 0.7)); chalkLine(ctx, bx + 16, by + 50, bw - 32, 1);
  ctx.fillStyle = C.cream; ctx.font = `700 17px ${FONT_SERIF}`;
  ctx.fillText('GAVE', bx + 20, by + 78); ctx.fillText('IS OWED', bx + 228, by + 78);
  stroke(ctx, bx + 212, by + 60, bx + 214, by + bh - 12, 2.4, alpha(C.cream, 0.6));
  for (let c = 0; c < 2; c++) {
    const x = bx + 20 + c * 208;
    for (let r = 0; r < 7; r++) {
      const y = by + 104 + r * 26, seed = c * 20 + r;
      if (rnd(seed * 3.3) < 0.12) continue;
      ink(ctx, 2.8, alpha(C.cream, 0.6 + rnd(seed) * 0.35));
      chalkLine(ctx, x, y, 60 + rnd(seed * 5) * 50, seed);
      const tally = Math.floor(rnd(seed * 7) * 6);
      ctx.beginPath(); for (let k = 0; k < tally; k++) { ctx.moveTo(x + 132 + k * 8, y - 8); ctx.lineTo(x + 133 + k * 8, y + 6); } if (tally === 5) { ctx.moveTo(x + 128, y + 5); ctx.lineTo(x + 170, y - 7); } ctx.stroke();
    }
  }
  box(ctx, bx - 16, by + bh + 14, bw + 32, 10, '#c9783a', L, { off: 0, shadow: false, ink: 1.8 });
  rect(ctx, bx + 80, by + bh + 7, 26, 7, C.white); rect(ctx, bx + 120, by + bh + 7, 16, 7, C.white);
  // the Compact's banner
  const cxb = 1150 + o;
  cel(ctx, pp([[cxb - 80, 50], [cxb + 80, 50], [cxb + 80, 330], [cxb, 298], [cxb - 80, 330]]), C.crimson, L, { off: 14, ink: IW, rim: 4 });
  ink(ctx, 7, C.brass); ctx.beginPath(); ctx.arc(cxb - 18, 160, 34, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(cxb + 18, 160, 34, 0, TAU); ctx.stroke();
  ctx.fillStyle = C.brass; ctx.font = `700 17px ${FONT_SERIF}`; ctx.textAlign = 'center'; ctx.fillText('THE COMPACT', cxb, 244); ctx.textAlign = 'left';
  // floor, the long table, people eating
  rect(ctx, X0, 540, XW, 460, '#1a0c26');
  crowd(ctx, 111, -200 + px * 0.5, 1500 + px * 0.5, 448, 24, 22, '#1c0e2c', L, { hat: 0.3 });
  box(ctx, X0, 516, XW, 34, '#8a4638', L, { off: 0, shadow: false, ink: II });
  rect(ctx, X0, 518, XW, 6, '#c9783a');
  for (let i = 0; i < 12; i++) {
    const x = -200 + i * 146 + px * 0.55;
    cel(ctx, ep(x, 514, 21, 7), C.cream, L, { off: 3, ink: 2 }); flat(ctx, ep(x, 513, 15, 3.8), '#c9502c');
    if (i % 3 === 1) cel(ctx, (c) => { c.moveTo(x + 38, 512); c.ellipse(x + 62, 512, 24, 11, 0, Math.PI, 0); c.closePath(); }, '#c9783a', L, { off: 4, ink: 2 });
  }
  // lamps: the near one is the one that lights the board
  ctx = S(0.7);
  hallLamp(ctx, 410 + px * 0.7, 136, L, true);
  shaft(ctx, 410 + px * 0.7, 140, Math.PI / 2, 420, 1.2, L.col, 0.16);
  hallLamp(ctx, 1030 + px * 0.7, 120, L, false);
  ctx = A();
  glint(ctx, 410 + px * 0.7, 140, 30 + 4 * Math.sin(t * 2.6), C.white, 0.95, 0);
  for (let j = 0; j < 3; j++) {   // steam off the pot: curls, climbing
    const ph = mod(t * 0.16 + j * 0.33, 1), ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * Math.min(1, (1 - ph) * 2.5) * Math.min(1, ph * 6);
    curl(ctx, sx + (j - 1) * 20 + Math.sin(t * 0.8 + j * 2) * 8, 258 - ph * 150, 12 + ph * 16, 1.4, j % 2 ? 1 : -1, 5 + ph * 4, C.white, II);
    ctx.globalAlpha = ga;
  }
  // the near table edge
  ctx = S(0.8);
  box(ctx, X0, 668, XW, 300, '#5a2c3a', L, { off: 0, shadow: false, ink: 0 });
  box(ctx, X0, 660, XW, 10, '#c9783a', L, { off: 0, shadow: false, ink: II });
});

// ── shore-dusk: the shore below a town, the sun going into the sea. Key light: that sun ──
// One key, three scenes: at Saltmere (ch2) they make a fire on the sand; on Little Brand (ch4) a torn drift net is
// pegged along the sea wall and nobody shows a light. The fire and the net are drawn moving, chosen by the line's id.
const L_DUSK = keyLight('#ff9d5c', -Math.PI * 0.42, { depth: 0.88, tint: '#1a1250' });
const L_DUSK_MOON = keyLight('#ffffff', Math.PI * 0.25);
def('shore-dusk', L_DUSK, (ctx, t, px, info) => {
  const L = L_DUSK, hy = 226, sx = 694 + px * 0.05, DARK = '#1c1450';
  const line = info && info.lines ? info.lines[info.index] : null, fireScene = !!line && String(line.id).startsWith('ch2.');
  ctx = S(0);
  sky(ctx, hy, ['#141040', '#3c2472', '#8c3478', '#e2506a', '#ff9a5a'], [0.3, 0.52, 0.72, 0.9, 1]);
  starsFlat(ctx, 12, 22, 60);
  ctx = S(0.05);
  shaft(ctx, sx, hy, -2.2, 900, 0.16, '#ffb46a', 0.2); shaft(ctx, sx, hy, -1.45, 900, 0.14, '#ffb46a', 0.2); shaft(ctx, sx, hy, -0.85, 900, 0.18, '#ffb46a', 0.2);
  rings(ctx, sx, hy, 230, [alpha('#ffb060', 0.18), alpha('#ffc878', 0.28), alpha('#ffe2a0', 0.45)], [1, 0.62, 0.38]);
  circ(ctx, sx, hy, 64, C.white);
  cel(ctx, cp(420 + px * 0.05, 92, 22), C.cream, L_DUSK_MOON, { off: 13, shadow: '#3c2472', ink: 0 });   // a thin moon, already up
  ctx = S(0.08);
  const q = px * 0.08;
  for (const [x, y, w, h, sd] of [[330, 170, 300, 64, 3], [1060, 132, 360, 80, 5], [900, 206, 190, 34, 8], [80, 110, 240, 50, 11]]) {
    cloud(ctx, x + q, y, w, h, '#4a2474', L, sd, 0);
    rect(ctx, x + q - w / 2 + 8, y - 6, w - 16, 6, '#ff9a5a');
  }
  // the headland, with nothing lit on it; the sea in flat scalloped bands; the sand
  ctx = S(0.15);
  const hx = 1130 + px * 0.15;
  rect(ctx, X0, hy, XW, 380, '#e2506a');
  lozenges(ctx, 61, sx - 80, sx + 80, hy + 4, hy + 46, 26, C.white);
  rimmed(ctx, (c) => { c.moveTo(1560, hy + 6); c.lineTo(1560, 130); c.bezierCurveTo(hx + 200, 106, hx - 20, 156, hx - 300, hy + 6); c.closePath(); }, DARK, L, 4, '#e2506a');
  waves(ctx, X0, hy + 48, XW, 90, { len: 60, amp: 5, col: '#b03c78', foam: false });
  lozenges(ctx, 62, sx - 120, sx + 120, hy + 62, hy + 110, 20, '#ffe2a0');
  waves(ctx, X0, hy + 114, XW, 100, { len: 92, amp: 8, col: '#742e7c', foam: '#ffd8c0', every: 3, L });
  lozenges(ctx, 63, sx - 160, sx + 160, hy + 130, hy + 196, 14, '#ff9a5a');
  waves(ctx, X0, hy + 200, XW, 160, { len: 130, amp: 11, col: '#42246c', foam: '#ffd8c0', every: 3, phase: 0.4, L });
  ctx = S(0.4);
  flat(ctx, (c) => { c.moveTo(X0, 524); c.bezierCurveTo(200, 504, 900, 554, X0 + XW, 516); c.lineTo(X0 + XW, 990); c.lineTo(X0, 990); c.closePath(); }, '#6a3878');
  flat(ctx, (c) => { c.moveTo(X0, 552); c.bezierCurveTo(200, 530, 900, 582, X0 + XW, 544); c.lineTo(X0 + XW, 990); c.lineTo(X0, 990); c.closePath(); }, '#2c1c58');
  ctx = A();
  shimmer(ctx, 65, sx - 130, sx + 130, hy + 6, hy + 230, 20, C.white, t);
  glint(ctx, sx, hy - 8, 80 + 9 * Math.sin(t * 1.2), C.white, 0.9, 0);
  {   // the tide's edge, coming and going
    const adv = Math.sin(t * 0.45) * 10;
    ink(ctx, 4, C.cream); ctx.beginPath();
    for (let x = X0; x <= 1540; x += 60) { const y = 526 + adv + Math.sin(x * 0.011 + t * 0.3) * 7 + (x - 640) * (x - 640) * -0.00002; x === X0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
  }
  const g = px * 0.9;
  if (fireScene) {
    // Saltmere, the last night: a driftwood fire, and a ring of stones
    const fx = 640 + g, fy = 592;
    bloom(ctx, fx, fy - 30, 230, '#ff8a2a', 0.8 + 0.1 * Math.sin(t * 7));
    flat(ctx, ep(fx, fy + 8, 230, 26), '#6a2c50');
    for (let i = 0; i < 8; i++) { flat(ctx, ep(fx + Math.cos(i * 0.785) * 68, fy + 8 + Math.sin(i * 0.785) * 13, 13, 8.5), INK); flat(ctx, ep(fx + Math.cos(i * 0.785) * 68 - 1.5, fy + 6.5 + Math.sin(i * 0.785) * 13, 10, 6), '#5a3a70'); }
    stroke(ctx, fx - 52, fy + 6, fx + 46, fy - 6, 15); stroke(ctx, fx - 52, fy + 6, fx + 46, fy - 6, 8, '#8a4a34');
    stroke(ctx, fx - 42, fy - 8, fx + 54, fy + 8, 14); stroke(ctx, fx - 42, fy - 8, fx + 54, fy + 8, 7, '#6a3430');
    blaze(ctx, fx, fy, 52, t, 1);
  } else {
    // Little Brand: the drift net pegged along the sea wall, a hole torn in the middle of it
    const x0 = 60 + g, x1 = 1220 + g, top = 470, bot = 600, n = 29;
    ink(ctx, 2, INK); ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const u = i / n, xa = lerp(x0, x1, u), sagA = Math.sin(u * Math.PI) * 26;
      if (Math.abs(u - 0.5) < 0.09) continue;
      ctx.moveTo(xa, top + sagA); ctx.lineTo(xa + (x1 - x0) / n * 3.5, bot + sagA * 0.4);
      ctx.moveTo(xa + (x1 - x0) / n * 3.5, top + sagA); ctx.lineTo(xa, bot + sagA * 0.4);
    }
    ctx.stroke();
    ink(ctx, 4.5, C.cream); ctx.beginPath(); ctx.moveTo(x0, top); ctx.quadraticCurveTo(lerp(x0, x1, 0.22), top + 40, lerp(x0, x1, 0.41), top + 24); ctx.moveTo(lerp(x0, x1, 0.6), top + 24); ctx.quadraticCurveTo(lerp(x0, x1, 0.8), top + 40, x1 + 40, top); ctx.stroke();
    for (const x of [x0, x1 + 40]) { stroke(ctx, x, top - 30, x, 660, 16); stroke(ctx, x, top - 30, x, 660, 9, '#6a3878'); stroke(ctx, x + 3, top - 28, x + 3, 660, 2.4, '#ff9a5a'); }
  }
  // dune grass, black against the sea, at both edges of the wide film
  ctx = S(1.2);
  for (let i = 0; i < 46; i++) {
    const side = i % 2, x = (side ? 1280 + 200 - rnd(i) * 330 : -200 + rnd(i) * 330) + px * 1.2, h = 80 + rnd(i * 3) * 150, sw = (side ? -1 : 1) * (14 + rnd(i * 7) * 30);
    taperPath(ctx, [[x, 820], [x + sw * 0.3, 820 - h * 0.6], [x + sw, 820 - h]], 7, 0.5, '#0e0a30');
  }
}, (ctx, t, px, info) => {
  const line = info && info.lines ? info.lines[info.index] : null;
  if (line && String(line.id).startsWith('ch2.')) motes(ctx, 23, 14, '#ffb060', t, { x0: 560 + px * 0.9, x1: 730 + px * 0.9, y0: 260, y1: 570, vx: 10, vy: -80, r: 2.4, a: 0.9, tw: 1, wob: 20 });
});
