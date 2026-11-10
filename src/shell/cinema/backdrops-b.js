// Backdrop painters, second half (chapters 3, 4 and 5). Part of the cinematic renderer: see ../cinema.js.
// Exports BACKDROPS_B: key -> { light, back(ctx, t, px, info), front?(ctx, t, px, info) }.
// Still and moving sections are marked with ctx = S(depth) and ctx = A(): the contract is written out in kit.js.
import {
  H, TAU, clamp, lerp, ease, mod, rnd, flick, css, rgba, mix, vgrad, hgrad, fillAll, rect, circ, seg, poly, rr, FONT_SERIF, FONT_MONO, S, A,
  glow, stars, lantern, flame, motes, skyline, waterStreaks, crowdRow, waveform, X0, XW, coldFlame, chalkLine,
} from './kit.js';

export const BACKDROPS_B = Object.create(null);
function def(key, light, back, front) { BACKDROPS_B[key] = { light, back, front: front || null }; }

// ───────────────────────── chapter 3: Halcyon Reach ─────────────────────────
/** Halcyon's emblem: the plumb-weight, a bob hanging true on its line */
function plumbWeight(ctx, x, y, s, col) {
  rect(ctx, x - s * 0.5, y - s * 1.6, s, s * 0.1, col);
  seg(ctx, x, y - s * 1.55, x, y - s * 0.45, col, Math.max(1, s * 0.07));
  poly(ctx, [[x - s * 0.15, y - s * 0.52], [x + s * 0.15, y - s * 0.52], [x + s * 0.15, y - s * 0.36], [x + s * 0.42, y - s * 0.2], [x + s * 0.42, y + s * 0.12], [x, y + s], [x - s * 0.42, y + s * 0.12], [x - s * 0.42, y - s * 0.2], [x - s * 0.15, y - s * 0.36]], col);
}
/** ranks on parade: identical, evenly spaced, and perfectly still */
function ranks(ctx, x0, x1, y, n, s, col, capCol) {
  for (let i = 0; i < n; i++) {
    const x = lerp(x0, x1, n === 1 ? 0.5 : i / (n - 1));
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y, s * 0.4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - s * 0.82, y + s * 3.8); ctx.lineTo(x - s * 0.82, y + s * 0.95); ctx.quadraticCurveTo(x - s * 0.8, y + s * 0.5, x, y + s * 0.48); ctx.quadraticCurveTo(x + s * 0.8, y + s * 0.5, x + s * 0.82, y + s * 0.95); ctx.lineTo(x + s * 0.82, y + s * 3.8); ctx.fill();
    rect(ctx, x - s * 0.5, y - s * 0.4, s, s * 0.17, capCol);
    rect(ctx, x - s * 0.38, y - s * 0.66, s * 0.76, s * 0.28, capCol);
  }
}
/** a banner standing straight out in the wind: (x, y) is the top of the hoist */
function banner(ctx, x, y, w, h, t, col, colSh, emblem) {
  const N = 14;
  const off = (u, k) => Math.sin(u * 7 - t * 5.2 + k) * 9 * u + Math.sin(u * 15 - t * 8) * 3 * u;
  for (let i = 0; i < N; i++) {
    const u0 = i / N, u1 = (i + 1) / N;
    const sh = 0.5 + 0.5 * Math.sin(u0 * 7 - t * 5.2 + 1.2);
    poly(ctx, [[x + u0 * w, y + off(u0, 0) + u0 * 8], [x + u1 * w + 0.6, y + off(u1, 0) + u1 * 8], [x + u1 * w + 0.6, y + h + off(u1, 0.5) + u1 * 4], [x + u0 * w, y + h + off(u0, 0.5) + u0 * 4]], css(mix(colSh, col, sh)));
  }
  emblem(x + w * 0.46, y + h * 0.56 + off(0.46, 0.25) + 3);
}

// ── academy-yard: the parade ground, under the plumb-weight banner ──
def('academy-yard', { amb: '#48525e', rim: '#f0f3f4', key: -1 }, (ctx, t, px) => {
  ctx = S(0);
  fillAll(ctx, vgrad(ctx, -180, 470, [[0, '#4c5a6e'], [0.55, '#8f9ca8'], [1, '#cdd2cf']]));
  ctx = A();
  for (let i = 0; i < 11; i++) {
    const x = mod(rnd(i * 3) * 1900 + t * (5 + rnd(i) * 6), 1900) - 300 + px * 0.05, y = -60 + rnd(i * 7) * 250;
    ctx.fillStyle = `rgba(62,72,90,${0.16 + rnd(i * 5) * 0.16})`; ctx.beginPath(); ctx.ellipse(x, y, 200 + rnd(i * 2) * 220, 20 + rnd(i * 9) * 26, 0, 0, TAU); ctx.fill();
  }
  // the sea off the edge of the rock, and the mole the ferry leaves from
  const ex = 250 + px * 0.2;
  ctx.fillStyle = vgrad(ctx, 392, 470, [[0, '#8e9aa2'], [1, '#56646e']]); ctx.fillRect(X0, 392, ex - X0 + 4, 80);
  waterStreaks(ctx, 201, X0, ex, 396, 468, 40, '#e6ecee', t, 0.5);
  poly(ctx, [[ex, 428], [ex - 330, 420], [ex - 338, 414], [ex - 330, 412], [ex, 416]], '#3c444c');
  rect(ctx, ex - 334, 388, 4, 26, '#3c444c'); circ(ctx, ex - 332, 386, 5, rgba('#ffe2a0', 0.6 + 0.4 * Math.sin(t * 1.6)));
  for (let i = 0; i < 4; i++) { // gulls over the mole
    const x = ex - 300 + mod(i * 97 + t * (14 + i * 3), 360), y = 330 + i * 16 + Math.sin(t * 0.8 + i) * 12, w = 8 + i, fl = Math.sin(t * 5 + i * 2) * 4;
    ctx.strokeStyle = 'rgba(40,46,56,.8)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x - w, y - fl); ctx.quadraticCurveTo(x - w * 0.4, y - 4, x, y); ctx.quadraticCurveTo(x + w * 0.4, y - 4, x + w, y - fl); ctx.stroke();
  }
  // the Academy: grey and square
  ctx = S(0.2);
  const ax = ex + 30;
  ctx.fillStyle = hgrad(ctx, ax, ax + 1300, [[0, '#7c848a'], [1, '#666e76']]); ctx.fillRect(ax, 176, 1400, 300);
  rect(ctx, ax - 8, 168, 1420, 12, '#535a62'); rect(ctx, ax, 300, 1400, 4, 'rgba(0,0,0,.14)');
  poly(ctx, [[ax, 176], [ax - 26, 190], [ax - 26, 476], [ax, 476]], '#4a5158');
  for (let r = 0; r < 4; r++) for (let c = 0; c < 38; c++) {
    const wx = ax + 22 + c * 36, wy = 196 + r * 62;
    if (wx > ax + 690 && wx < ax + 800) continue;
    rect(ctx, wx, wy, 15, 34, '#343c46'); rect(ctx, wx, wy, 15, 3, '#9aa2a8'); rect(ctx, wx + 7, wy, 1, 34, '#59616a');
  }
  // one lamp in an east window, at an hour when no lamp is needed
  rect(ctx, ax + 22 + 36 * 36, 196, 15, 34, rgba('#ffd890', 0.85)); glow(ctx, ax + 29 + 36 * 36, 212, 40, '#ffd890', 0.3);
  // the gate tower and its clock
  const tx = ax + 745;
  rect(ctx, tx - 62, 64, 124, 412, '#727a82'); rect(ctx, tx - 62, 64, 16, 412, '#5a626a');
  rect(ctx, tx - 70, 56, 140, 12, '#4f565e'); for (let i = 0; i < 5; i++) rect(ctx, tx - 70 + i * 31, 40, 16, 18, '#4f565e');
  circ(ctx, tx, 124, 34, '#3a4048'); circ(ctx, tx, 124, 29, '#e4e2d6');
  for (let i = 0; i < 12; i++) seg(ctx, tx + Math.cos(i * 0.5236) * 23, 124 + Math.sin(i * 0.5236) * 23, tx + Math.cos(i * 0.5236) * 27, 124 + Math.sin(i * 0.5236) * 27, '#2a3038', 1.5);
  seg(ctx, tx, 124, tx + Math.sin(t * 0.02 + 5.3) * 20, 124 - Math.cos(t * 0.02 + 5.3) * 20, '#1c2026', 2.2); seg(ctx, tx, 124, tx + 9, 124 - 11, '#1c2026', 3);
  ctx.fillStyle = '#2a3038'; ctx.beginPath(); ctx.moveTo(tx - 40, 476); ctx.lineTo(tx - 40, 372); ctx.quadraticCurveTo(tx, 322, tx + 40, 372); ctx.lineTo(tx + 40, 476); ctx.fill();
  plumbWeight(ctx, tx, 250, 30, '#c9b06a');
  // the banner
  ctx = A();
  const fx = 500 + px * 0.3;
  rect(ctx, fx - 3, -180, 6, 660, '#30363e'); rect(ctx, fx - 1, -180, 2, 660, '#aab2b8'); rect(ctx, fx - 14, 470, 28, 10, '#30363e');
  banner(ctx, fx + 3, 74, 330, 128, t, '#2f4f7c', '#1a2f50', (bx, by) => { plumbWeight(ctx, bx, by, 34, '#e0c47a'); });
  seg(ctx, fx + 3, 74, fx + 3, 204, '#aab2b8', 2);
  // the ground, and two thousand people on it
  ctx = S(0.45);
  ctx.fillStyle = vgrad(ctx, 470, 800, [[0, '#9c9c92'], [0.3, '#7c7c74'], [1, '#3e3e3c']]); ctx.fillRect(X0, 470, XW, 520);
  for (let i = -8; i <= 8; i++) seg(ctx, 640 + i * 46 + px * 0.3, 472, 640 + i * 250 + px, 980, 'rgba(240,240,230,.12)', 2);
  for (let k = 0; k < 5; k++) {
    const u = k / 4, y = 446 + u * u * 70 + k * 6, s = 6.5 + u * 15, gap = 46 + u * 110, n = Math.round(30 - u * 16), sx = px * (0.3 + u * 0.3);
    const col = css(mix('#27384f', '#9aa4ac', 0.5 - u * 0.4)), cap = css(mix('#1a2638', '#9aa4ac', 0.45 - u * 0.4));
    ranks(ctx, 640 - gap - n * s * 2.3 + sx, 640 - gap + sx, y, n, s, col, cap);
    ranks(ctx, 640 + gap + sx, 640 + gap + n * s * 2.3 + sx, y, n, s, col, cap);
  }
}, (ctx, t, px) => {
  for (let i = 0; i < 6; i++) { // what is left of the fog, going over the wall
    const x = mod(rnd(i * 3) * 1900 + t * (16 + i * 3), 1900) - 300 + px;
    ctx.fillStyle = 'rgba(226,232,236,.06)'; ctx.beginPath(); ctx.ellipse(x, 400 + i * 44, 380, 30, 0, 0, TAU); ctx.fill();
  }
});

// ── dormitory: sixty iron bunks ──
def('dormitory', { amb: '#1c222c', rim: '#ffd9a0', key: 1 }, (ctx, t, px) => {
  const vy = 300, D = 5.4;
  const pr = (X, Y, d) => [640 + X / d + px * 0.35, vy + Y / d];
  const quad = (a, b, c, d2, col) => poly(ctx, [a, b, c, d2], col);
  ctx = S(0.35);
  fillAll(ctx, '#11151b');
  // far wall, with the one tall window
  const [fx0, fy0] = pr(-760, -340, D), [fx1, fy1] = pr(760, 400, D);
  ctx.fillStyle = vgrad(ctx, fy0, fy1, [[0, '#2a323c'], [0.6, '#343c44'], [1, '#22282e']]); ctx.fillRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
  const [wx0, wy0] = pr(-150, -260, D), [wx1, wy1] = pr(150, 120, D);
  ctx.fillStyle = vgrad(ctx, wy0, wy1, [[0, '#2c4470'], [1, '#8a9cc0']]); ctx.fillRect(wx0, wy0, wx1 - wx0, wy1 - wy0);
  glow(ctx, (wx0 + wx1) / 2, (wy0 + wy1) / 2, 150, '#9fb8e8', 0.3);
  ctx.strokeStyle = '#161a20'; ctx.lineWidth = 2.5; ctx.strokeRect(wx0, wy0, wx1 - wx0, wy1 - wy0);
  for (let i = 1; i < 3; i++) seg(ctx, lerp(wx0, wx1, i / 3), wy0, lerp(wx0, wx1, i / 3), wy1, '#161a20', 2);
  for (let i = 1; i < 4; i++) seg(ctx, wx0, lerp(wy0, wy1, i / 4), wx1, lerp(wy0, wy1, i / 4), '#161a20', 2);
  { const [dx0, dy0] = pr(420, -80, D), [dx1, dy1] = pr(620, 400, D); rect(ctx, dx0, dy0, dx1 - dx0, dy1 - dy0, '#1a1e24'); circ(ctx, dx0 + 6, (dy0 + dy1) / 2, 1.6, '#c9a85a'); }
  // walls, ceiling, floor
  for (const s of [-1, 1]) {
    quad(pr(s * 760, -340, 0.7), pr(s * 760, -340, D), pr(s * 760, 400, D), pr(s * 760, 400, 0.7), s < 0 ? '#1e242c' : '#252c34');
    quad(pr(s * 760, 110, 0.7), pr(s * 760, 110, D), pr(s * 760, 400, D), pr(s * 760, 400, 0.7), s < 0 ? '#1a2426' : '#202c2e');
    const a = pr(s * 760, 110, 0.7), b = pr(s * 760, 110, D); seg(ctx, a[0], a[1], b[0], b[1], '#0e1216', 3);
  }
  quad(pr(-760, -340, 0.7), pr(760, -340, 0.7), pr(760, -340, D), pr(-760, -340, D), '#14181e');
  ctx.fillStyle = vgrad(ctx, fy1, 800, [[0, '#4a4034'], [0.3, '#3a3026'], [1, '#17120e']]);
  ctx.beginPath(); const fl = [pr(-760, 400, D), pr(760, 400, D), pr(760, 400, 0.6), pr(-760, 400, 0.6)]; fl.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.fill();
  for (let i = -8; i <= 8; i++) { const a = pr(i * 95, 400, D), b = pr(i * 95, 400, 0.6); seg(ctx, a[0], a[1], b[0], b[1], 'rgba(0,0,0,.28)', 1.2); }
  { const a = pr(-150, 400, D), b = pr(150, 400, D), c = pr(230, 400, 1.2), d2 = pr(-230, 400, 1.2); quad(a, b, c, d2, 'rgba(150,180,235,.1)'); } // the window, lying on the boards
  // bunks, far to near: head to the wall, foot to the aisle, a number on every one
  for (let i = 11; i >= 0; i--) {
    const d = 1.0 + i * 0.36, dd = 0.2, haze = clamp((d - 1) / 4.6);
    const iron = css(mix('#0c0e12', '#2a323c', haze)), blanket = css(mix('#5c636c', '#343c46', haze)), top = css(mix('#747c86', '#3a424c', haze)), sheet = css(mix('#d6d2c4', '#4a525c', haze));
    for (const s of [-1, 1]) {
      const A = s * 300, B = s * 760, lw = Math.max(1.2, 9 / d);
      // the far rail of the frame
      for (const Y of [-60, 30, 240]) { const a = pr(A, Y, d + dd), b = pr(B, Y, d + dd); seg(ctx, a[0], a[1], b[0], b[1], iron, lw * 0.7); }
      { const a = pr(A, -60, d + dd), b = pr(A, 400, d + dd); seg(ctx, a[0], a[1], b[0], b[1], iron, lw * 0.8); }
      // kit box under the lower bunk
      quad(pr(A + s * 30, 330, d), pr(A + s * 200, 330, d), pr(A + s * 200, 400, d), pr(A + s * 30, 400, d), css(mix('#2e2218', '#232a32', haze)));
      for (const Y of [30, 240]) {
        quad(pr(A, Y, d), pr(B, Y, d), pr(B, Y, d + dd), pr(A, Y, d + dd), top);               // the made bed, from above
        quad(pr(A, Y, d), pr(B, Y, d), pr(B, Y + 38, d), pr(A, Y + 38, d), blanket);           // its near edge
        quad(pr(A, Y + 4, d), pr(A + s * 120, Y + 4, d), pr(A + s * 120, Y + 16, d), pr(A, Y + 16, d), sheet); // sheet turned down, square
        const a = pr(A, Y + 38, d), b = pr(B, Y + 38, d); seg(ctx, a[0], a[1], b[0], b[1], iron, lw * 0.8);
      }
      // the foot of the frame, on the aisle
      { const a = pr(A, -60, d), b = pr(A, 400, d); seg(ctx, a[0], a[1], b[0], b[1], iron, lw); }
      for (const Y of [-60, 30, 240]) { const a = pr(A, Y, d), b = pr(A, Y, d + dd); seg(ctx, a[0], a[1], b[0], b[1], iron, lw * 0.8); }
      if (d < 3.4) {
        const n = 19 + (s > 0 ? 0 : 1) + i * 2 * (s > 0 ? 1 : 1), c = pr(A, -18, d), r = 15 / d;
        circ(ctx, c[0], c[1], r, css(mix('#c9a85a', '#3a424c', haze))); circ(ctx, c[0], c[1], r * 0.8, css(mix('#1c160c', '#2a323c', haze)));
        ctx.fillStyle = css(mix('#e8cc82', '#59616a', haze)); ctx.font = `700 ${Math.round(15 / d)}px ${FONT_SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(n), c[0], c[1] + 0.5); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      }
      if (i === 0 && s > 0) { // bed nineteen: what is owed, scratched where an inspection does not look
        for (let k = 0; k < 34; k++) {
          const g = Math.floor(k / 5), X = A + 44 + g * 46 + (k % 5) * 7, a = pr(X, 76, d), b = pr(X + 2, 98, d);
          if (k % 5 === 4) { const a2 = pr(X - 32, 94, d), b2 = pr(X + 2, 80, d); seg(ctx, a2[0], a2[1], b2[0], b2[1], k < 20 ? 'rgba(200,196,180,.3)' : 'rgba(236,230,206,.8)', 1.4); } else seg(ctx, a[0], a[1], b[0], b[1], k < 20 ? 'rgba(200,196,180,.3)' : 'rgba(236,230,206,.8)', 1.4);
        }
      }
    }
  }
  // gas lamps down the middle of the ceiling, turned low
  ctx = A();
  for (const d of [4.2, 3.0, 2.0, 1.25]) {
    const a = pr(0, -340, d), b = pr(0, -215, d), fl = flick(t, d);
    seg(ctx, a[0], a[1], b[0], b[1], '#0c0e12', Math.max(1, 3 / d));
    ctx = S(0.35, 0.26 * fl + 0.05);
    glow(ctx, b[0], b[1] + 8 / d, 330 / d, '#ffc878', 1);
    ctx = A();
    poly(ctx, [[b[0] - 34 / d, b[1] + 8 / d], [b[0] + 34 / d, b[1] + 8 / d], [b[0] + 14 / d, b[1] - 16 / d], [b[0] - 14 / d, b[1] - 16 / d]], '#262a2a');
    circ(ctx, b[0], b[1] + 12 / d, 8 / d, rgba('#fff0c0', 0.9));
  }
}, (ctx, t, px) => {
  motes(ctx, 207, 50, '#ffe6c0', t, { x0: 100 + px, x1: 1180 + px, y0: 60, y1: 620, vx: 3, vy: 4, r: 1.3, a: 0.3, tw: 1, wob: 16 });
});

// ── proctor-office: the top of the east stair ──
def('proctor-office', { amb: '#131b1d', rim: '#c6e8dc', key: 1 }, (ctx, t, px) => {
  ctx = S(0.2);
  fillAll(ctx, vgrad(ctx, -180, 800, [[0, '#0e1517'], [0.5, '#1c282a'], [1, '#0c1112']]));
  for (let x = X0 + mod(px * 0.2, 150); x < 1540; x += 150) { rect(ctx, x, -180, 2, 660, 'rgba(0,0,0,.25)'); rect(ctx, x + 2, -180, 1, 660, 'rgba(160,200,190,.04)'); }
  rect(ctx, X0, 478, XW, 6, '#0a0f10'); rect(ctx, X0, 318, XW, 3, 'rgba(0,0,0,.3)');
  // the east window: the yard below, the mole, the lane going out
  ctx = A();
  const wx = 900 + px * 0.25;
  ctx.save();
  ctx.beginPath(); ctx.rect(wx, 64, 250, 380); ctx.clip();
  ctx.fillStyle = vgrad(ctx, 64, 330, [[0, '#1c2c4c'], [0.7, '#5a6c8c'], [1, '#a8aeb8']]); ctx.fillRect(wx, 64, 250, 270);
  ctx.fillStyle = vgrad(ctx, 330, 444, [[0, '#7c8a98'], [1, '#2c3a48']]); ctx.fillRect(wx, 330, 250, 114);
  rect(ctx, wx, 332, 250, 5, 'rgba(226,236,244,.4)');
  waterStreaks(ctx, 211, wx, wx + 250, 336, 400, 16, '#dfe8ee', t, 0.5);
  for (let i = 0; i < 4; i++) { const x = wx + mod(i * 90 + t * 5 - px * 0.2, 340) - 50; ctx.fillStyle = 'rgba(226,232,236,.2)'; ctx.beginPath(); ctx.ellipse(x, 300 + i * 12, 90, 9, 0, 0, TAU); ctx.fill(); }
  poly(ctx, [[wx, 444], [wx, 408], [wx + 250, 400], [wx + 250, 444]], '#2a3038');
  poly(ctx, [[wx + 80, 404], [wx + 250, 372], [wx + 250, 378], [wx + 84, 408]], '#343c46');
  rect(ctx, wx + 58, 300, 2.5, 110, '#1a1e24');
  banner(ctx, wx + 60, 302, 46, 20, t, '#2f4f7c', '#1a2f50', () => {});
  ctx.restore();
  ctx.strokeStyle = '#0a0f10'; ctx.lineWidth = 9; ctx.strokeRect(wx, 64, 250, 380);
  seg(ctx, wx + 125, 64, wx + 125, 444, '#0a0f10', 6); seg(ctx, wx, 250, wx + 250, 250, '#0a0f10', 6);
  rect(ctx, wx - 14, 444, 278, 12, '#1a2426');
  poly(ctx, [[wx, 64], [wx + 250, 64], [wx - 330, 980], [wx - 900, 980]], 'rgba(170,200,230,.05)');
  ctx = S(0.25);
  glow(ctx, wx + 125, 250, 300, '#9fb8e0', 0.12);
  ctx = A();
  // every class she has passed out, in rows. One frame has been taken down.
  ctx = S(0.2);
  const gx = 96 + px * 0.2;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
    const x = gx + c * 76, y = 84 + r * 76;
    if (r === 2 && c === 4) { rect(ctx, x + 2, y + 2, 56, 62, 'rgba(160,200,190,.06)'); circ(ctx, x + 30, y - 4, 2, '#0a0f10'); continue; }
    rect(ctx, x, y, 60, 66, '#0c1112'); rect(ctx, x + 4, y + 4, 52, 58, '#3a3a34');
    rect(ctx, x + 7, y + 7, 46, 52, css(mix('#b4a888', '#3a4a48', 0.3 + rnd(r * 7 + c) * 0.3)));
    for (let k = 0; k < 3; k++) for (let j = 0; j < 7 - k; j++) { // a class photograph: rows of small heads
      const hx = x + 12 + j * 6.2 + k * 3, hy = y + 24 + k * 10;
      circ(ctx, hx, hy, 2, 'rgba(30,30,28,.75)'); rect(ctx, hx - 2.4, hy + 2, 4.8, 7, 'rgba(30,30,28,.75)');
    }
  }
  // cadet files, by year
  for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
    const x = gx - 6 + c * 78, y = 326 + r * 38;
    rect(ctx, x, y, 74, 34, '#172022'); rect(ctx, x + 1, y + 1, 72, 1.5, 'rgba(160,200,190,.08)');
    rect(ctx, x + 24, y + 8, 26, 10, '#cdc6ae'); rect(ctx, x + 30, y + 22, 14, 4, '#b08a3e');
  }
  // floor, and her desk: a green-shaded lamp, and nothing on it that is not square to the edge
  ctx.fillStyle = vgrad(ctx, 484, 800, [[0, '#1a1c18'], [1, '#080a09']]); ctx.fillRect(X0, 484, XW, 500);
  const dx = px * 0.9, dy = 596;
  ctx.fillStyle = vgrad(ctx, dy, 800, [[0, '#2a1e16'], [0.2, '#16100c'], [1, '#080605']]); ctx.fillRect(X0, dy, XW, 400);
  rect(ctx, X0, dy - 4, XW, 6, '#4a3626');
  // the regulator clock
  ctx = A();
  const kx = 620 + px * 0.2;
  rect(ctx, kx - 34, 70, 68, 220, '#0c1112'); rect(ctx, kx - 28, 76, 56, 208, '#1a1410');
  circ(ctx, kx, 112, 24, '#e6e2d2'); seg(ctx, kx, 112, kx + Math.sin(t * 0.105) * 18, 112 - Math.cos(t * 0.105) * 18, '#14100c', 1.6); seg(ctx, kx, 112, kx - 9, 112 + 7, '#14100c', 2.4);
  { const a = Math.sin(t * Math.PI) * 0.17; seg(ctx, kx, 146, kx + Math.sin(a) * 110, 146 + Math.cos(a) * 110, '#c9a85a', 2); circ(ctx, kx + Math.sin(a) * 110, 146 + Math.cos(a) * 110, 12, '#d8b866'); }
  // the Line: her end of it
  const sx = 760 + px * 0.25;
  rect(ctx, sx - 70, 330, 140, 150, '#0c1112'); rect(ctx, sx - 76, 324, 152, 9, '#22302e');
  rect(ctx, sx - 58, 218, 116, 108, '#2a2418'); ctx.strokeStyle = '#b08a3e'; ctx.lineWidth = 2; ctx.strokeRect(sx - 58, 218, 116, 108);
  circ(ctx, sx - 16, 262, 30, '#04171a'); glow(ctx, sx - 16, 262, 60, '#5fe0c8', 0.26 + 0.1 * Math.sin(t * 2.1));
  ctx.strokeStyle = '#b08a3e'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(sx - 16, 262, 30, 0, TAU); ctx.stroke();
  ctx.save(); ctx.beginPath(); ctx.arc(sx - 16, 262, 27, 0, TAU); ctx.clip(); waveform(ctx, sx - 46, sx + 14, 262, 16, 0.25 + 0.2 * Math.sin(t * 0.9), t * 1000, 'rgba(110,245,220,.9)', 1.6); ctx.restore();
  for (let i = 0; i < 3; i++) { circ(ctx, sx + 34, 238 + i * 24, 6, '#b08a3e'); circ(ctx, sx + 34, 238 + i * 24, 3, i === 0 && mod(t, 1.2) < 0.7 ? '#ff5a4a' : '#3a2a10'); }
  ctx.strokeStyle = '#caa24a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(sx + 58, 300); ctx.bezierCurveTo(sx + 100, 330, sx + 86, 250, sx + 96, 214); ctx.stroke();
  circ(ctx, sx + 96, 210, 5, '#caa24a'); seg(ctx, sx + 96, 196, sx + 96, 206, '#22302e', 3); rect(ctx, sx + 84, 192, 24, 5, '#22302e');
  ctx.fillStyle = 'rgba(110,245,220,.7)'; ctx.font = `600 9px ${FONT_MONO}`; ctx.textAlign = 'center'; ctx.fillText('THE LINE', sx, 320); ctx.textAlign = 'left';
  plumbWeight(ctx, sx, 172, 24, '#c9b06a');
  const lx = 150 + dx;
  ctx = S(0.9, 0.2 * flick(t, 3) + 0.08);
  glow(ctx, lx, dy - 60, 300, '#ffe0a0', 1);
  ctx = A();
  seg(ctx, lx, dy, lx, dy - 84, '#b08a3e', 5); rect(ctx, lx - 30, dy - 8, 60, 8, '#8a6a2e');
  ctx.fillStyle = hgrad(ctx, lx - 58, lx + 58, [[0, '#0e3a2a'], [0.4, '#2f8a66'], [1, '#0e3a2a']]);
  ctx.beginPath(); ctx.moveTo(lx - 58, dy - 84); ctx.quadraticCurveTo(lx, dy - 132, lx + 58, dy - 84); ctx.closePath(); ctx.fill();
  rect(ctx, lx - 54, dy - 86, 108, 4, '#fff0c0');
  poly(ctx, [[lx + 90, dy - 2], [lx + 210, dy - 2], [lx + 222, dy - 14], [lx + 100, dy - 14]], '#d9cba6');
  rect(ctx, 1060 + dx, dy - 30, 120, 28, '#22302e'); rect(ctx, 1064 + dx, dy - 36, 112, 7, '#cdc6ae');
}, (ctx, t, px) => {
  motes(ctx, 213, 36, '#cfe4f0', t, { x0: 500 + px, x1: 1180 + px, y0: 60, y1: 600, vx: -3, vy: 4, r: 1.3, a: 0.32, tw: 1, wob: 14 });
});

// ── hearing-hall: a company auditorium, every seat filled, nobody speaking ──
def('hearing-hall', { amb: '#1e1b24', rim: '#ffe8c4', key: -1 }, (ctx, t, px) => {
  ctx = S(0.3);
  fillAll(ctx, vgrad(ctx, -180, 800, [[0, '#0c0a10'], [0.4, '#1e1a22'], [1, '#0a080c']]));
  const bx = px * 0.15;
  // the back wall: three doors, shut on the minute
  rect(ctx, X0, 40, XW, 250, '#231e28');
  for (let i = 0; i < 3; i++) {
    const x = 250 + i * 390 + bx;
    rect(ctx, x - 44, 262, 88, 110, '#120e14'); rect(ctx, x - 1, 262, 2, 110, '#2a2430');
    rect(ctx, x - 20, 248, 40, 10, rgba('#8fe0a0', 0.5 + 0.1 * Math.sin(t * 0.7 + i))); glow(ctx, x, 252, 46, '#8fe0a0', 0.14);
  }
  // company colours either side
  for (const x of [430, 850]) {
    const hx = x + bx;
    ctx.fillStyle = hgrad(ctx, hx - 44, hx + 44, [[0, '#1a2f50'], [0.5, '#2f4f7c'], [1, '#1a2f50']]);
    ctx.beginPath(); ctx.moveTo(hx - 44, 30); ctx.lineTo(hx + 44, 30); ctx.lineTo(hx + 44, 160); ctx.lineTo(hx, 144); ctx.lineTo(hx - 44, 160); ctx.fill();
    plumbWeight(ctx, hx, 96, 24, '#e0c47a');
  }
  // the gallery, where children are put
  const gy = 176, gpx = px * 0.2;
  rect(ctx, X0, gy - 70, XW, 76, '#17131b');
  for (let r = 0; r < 3; r++) {
    const y = gy - 50 + r * 18, s = 7 + r * 1.2, n = 82 - r * 6;
    for (let i = 0; i < n; i++) {
      const x = X0 + 20 + (i + (r % 2) * 0.5) * ((XW - 40) / n) + gpx, look = rnd(i * 3.7 + r * 91) < 0.05 ? Math.sin(t * 0.5 + i) * s * 0.2 : 0;
      ctx.fillStyle = css(mix('#27384f', '#0e0c12', 0.25 + (2 - r) * 0.2)); ctx.beginPath(); ctx.ellipse(x, y + s * 1.25, s * 0.86, s * 0.8, 0, 0, TAU); ctx.fill();
      circ(ctx, x + look, y, s * 0.42, css(mix(['#c8a078', '#a87c58', '#dcb894', '#8a6040'][Math.floor(rnd(i * 9.1 + r) * 4)], '#0e0c12', 0.45 + (2 - r) * 0.12)));
      ctx.fillStyle = css(mix(['#1a1410', '#3a2a1c', '#6a4a2a', '#0c0a0a'][Math.floor(rnd(i * 5.3 + r * 3) * 4)], '#0e0c12', 0.4)); ctx.beginPath(); ctx.arc(x + look, y - s * 0.06, s * 0.44, Math.PI, 0); ctx.fill();
    }
  }
  ctx.fillStyle = vgrad(ctx, gy, gy + 46, [[0, '#4a3828'], [1, '#22180f']]); ctx.fillRect(X0, gy, XW, 46);
  rect(ctx, X0, gy - 4, XW, 6, '#c9a85a'); rect(ctx, X0, gy + 46, XW, 5, '#0c0a0c');
  for (let x = X0 + mod(gpx, 120); x < 1540; x += 120) { ctx.strokeStyle = 'rgba(201,168,90,.35)'; ctx.lineWidth = 1.2; ctx.strokeRect(x + 10, gy + 9, 100, 28); }
  { const cx = 640 + gpx; circ(ctx, cx, gy + 23, 19, '#1a1410'); circ(ctx, cx, gy + 23, 15, '#e6e2d2'); seg(ctx, cx, gy + 23, cx, gy + 11, '#14100c', 1.5); seg(ctx, cx, gy + 23, cx + 7, gy + 23, '#14100c', 2); }
  for (let x = X0 + 90 + mod(gpx, 300); x < 1540; x += 300) rect(ctx, x, gy + 51, 16, 250, '#141018'); // the posts that carry it
  ctx.fillStyle = vgrad(ctx, gy + 51, gy + 130, [[0, 'rgba(0,0,0,.6)'], [1, 'rgba(0,0,0,0)']]); ctx.fillRect(X0, gy + 51, XW, 80);
  // two thousand people, in rows, breathing
  const skins = ['#c8a078', '#a87c58', '#dcb894', '#8a6040', '#e6c8a8'], hairs = ['#1a1410', '#3a2a1c', '#6a4a2a', '#0c0a0a', '#8a8a8e', '#a8733a'];
  for (let r = 0; r < 11; r++) {
    const u = r / 10, y = lerp(292, 470, Math.pow(u, 1.25)), s = lerp(8.5, 25, u), n = Math.round(lerp(74, 26, u)), rpx = px * (0.25 + 0.45 * u), dim = 0.55 - u * 0.45;
    const span = XW + 200;
    rect(ctx, X0, y + s * 1.5, XW, s * 3, css(mix('#3c1a1e', '#0c0a0e', 0.3 + dim * 0.6)));   // the row of seat backs they sit against
    for (let i = 0; i < n; i++) {
      const x = X0 - 100 + (i + (r % 2) * 0.5) * (span / n) + rpx, a1 = Math.abs(x - rpx - (640 - 250 - u * 170)), a2 = Math.abs(x - rpx - (640 + 250 + u * 170));
      if (a1 < s * 1.5 || a2 < s * 1.5) continue;   // the aisles
      const h = rnd(i * 3.7 + r * 17), breathe = Math.sin(t * 1.1 + h * 40) * s * 0.025, look = h < 0.04 ? Math.sin(t * 0.45 + i) * s * 0.22 : 0;
      const yy = y + (rnd(i * 1.3 + r * 7) - 0.5) * s * 0.3 + breathe;
      ctx.fillStyle = css(mix(h > 0.7 ? '#3a4048' : '#27384f', '#0c0a0e', 0.12 + dim)); ctx.beginPath(); ctx.ellipse(x, yy + s * 1.3, s * 0.9, s * 0.85, 0, 0, TAU); ctx.fill();
      ctx.fillRect(x - s * 0.9, yy + s * 1.3, s * 1.8, s * 1.4);
      circ(ctx, x + look, yy, s * 0.43, css(mix(skins[Math.floor(rnd(i * 9.1 + r * 3) * 5)], '#0c0a0e', 0.16 + dim)));
      ctx.fillStyle = css(mix(hairs[Math.floor(rnd(i * 5.3 + r * 11) * 6)], '#0c0a0e', 0.1 + dim)); ctx.beginPath(); ctx.arc(x + look, yy - s * 0.07, s * 0.45, Math.PI * 0.96, Math.PI * 2.04); ctx.fill();
      if (s > 14) { rect(ctx, x + look - s * 0.24, yy + s * 0.02, s * 0.16, s * 0.045, 'rgba(20,10,10,.5)'); rect(ctx, x + look + s * 0.08, yy + s * 0.02, s * 0.16, s * 0.045, 'rgba(20,10,10,.5)'); } // eyes, down
    }
  }
  // the house lights, left up
  ctx = A();
  for (let i = 0; i < 5; i++) {
    const x = 80 + i * 280 + px * 0.5, fl = flick(t, i);
    seg(ctx, x, -180, x, 70, '#0a080c', 2);
    ctx = S(0.5, 0.2 * fl + 0.05);
    glow(ctx, x, 86, 240, '#ffe2b0', 1);
    ctx = A();
    circ(ctx, x, 86, 15, rgba('#fff2d0', 0.92)); rect(ctx, x - 9, 66, 18, 8, '#3a2c1c');
  }
  // the lip of the stage she is standing on
  ctx.fillStyle = vgrad(ctx, 640, 800, [[0, '#3e2c1c'], [1, '#120c08']]); ctx.fillRect(X0, 646, XW, 340);
  rect(ctx, X0, 640, XW, 7, '#6a4c30');
}, (ctx, t, px) => {
  motes(ctx, 217, 60, '#ffeccc', t, { x0: -60 + px, x1: 1340 + px, y0: 60, y1: 520, vx: 2, vy: 3, r: 1.3, a: 0.3, tw: 1, wob: 16 });
});

// ── underwriting-floor: a night-lit hall of ledgers and pneumatic tubes ──
/** a run of brass tube with a carrier going through it: pts is a polyline */
function tubeRun(ctx, pts, w, t, speed, phase) {
  ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
  const path = () => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); };
  ctx.strokeStyle = '#3a2a0e'; ctx.lineWidth = w + 2; path(); ctx.stroke();
  ctx.strokeStyle = '#a8842e'; ctx.lineWidth = w; path(); ctx.stroke();
  ctx.strokeStyle = 'rgba(244,224,160,.55)'; ctx.lineWidth = Math.max(1, w * 0.22); path(); ctx.stroke();
  let len = 0; const segs = [];
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(l); len += l; }
  for (let i = 1; i < pts.length - 1; i++) { ctx.fillStyle = '#6a4e18'; ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1], w * 0.85, 0, TAU); ctx.fill(); } // collars at the bends
  // the carrier: gone dark for most of the cycle, then through in a second
  const cyc = len + 1500, at = mod(t * speed + phase * cyc, cyc);
  if (at < len) {
    let d = at, i = 0; while (d > segs[i]) { d -= segs[i]; i++; }
    const u = d / segs[i], x = lerp(pts[i][0], pts[i + 1][0], u), y = lerp(pts[i][1], pts[i + 1][1], u);
    glow(ctx, x, y, w * 3.4, '#fff0b8', 0.6);
    ctx.fillStyle = '#fff6d6'; ctx.beginPath(); ctx.ellipse(x, y, w * 0.9, w * 0.5, Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]), 0, TAU); ctx.fill();
  }
}
function bankersLamp(ctx, x, y, s, lit, t, seed) {
  if (lit) glow(ctx, x, y - s * 0.4, s * 5, '#b8f0c0', 0.22 * flick(t, seed) + 0.06);
  seg(ctx, x, y, x, y - s * 1.1, '#b08a3e', Math.max(1.5, s * 0.14)); rect(ctx, x - s * 0.5, y - s * 0.12, s, s * 0.12, '#8a6a2e');
  ctx.fillStyle = lit ? hgrad(ctx, x - s, x + s, [[0, '#145238'], [0.45, '#49c088'], [1, '#145238']]) : '#0e2a20';
  ctx.beginPath(); ctx.moveTo(x - s, y - s * 1.1); ctx.quadraticCurveTo(x, y - s * 1.9, x + s, y - s * 1.1); ctx.closePath(); ctx.fill();
  if (lit) { rect(ctx, x - s * 0.9, y - s * 1.12, s * 1.8, Math.max(1.5, s * 0.08), '#fff6d0'); poly(ctx, [[x - s * 0.9, y - s * 1.05], [x + s * 0.9, y - s * 1.05], [x + s * 2.2, y], [x - s * 2.2, y]], 'rgba(255,240,190,.1)'); }
}
def('underwriting-floor', { amb: '#0b1917', rim: '#c2ecd0', key: -1 }, (ctx, t, px) => {
  ctx = S(0.2);
  fillAll(ctx, vgrad(ctx, -180, 800, [[0, '#04090a'], [0.5, '#0d1a19'], [1, '#050909']]));
  // the wall of drawers, lettered: every island, every indenture
  const wx = px * 0.2;
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVW';
  for (let c = -3; c < 24; c++) {
    const x = c * 64 + wx;
    for (let r = 0; r < 9; r++) {
      const y = 132 + r * 38;
      rect(ctx, x, y, 61, 35, css(mix('#16221f', '#0a1211', rnd(c * 7 + r) * 0.6)));
      rect(ctx, x + 19, y + 7, 23, 9, rgba('#cdc6ae', 0.3 + rnd(c + r * 13) * 0.3)); rect(ctx, x + 25, y + 22, 11, 3.5, '#8a6a2e');
    }
    rect(ctx, x, 104, 61, 24, '#1c2a27');
    if (c >= 0 && c < letters.length) { ctx.fillStyle = 'rgba(224,196,122,.75)'; ctx.font = `700 15px ${FONT_SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(letters[c], x + 30, 122); ctx.textAlign = 'left'; }
  }
  rect(ctx, X0, 474, XW, 8, '#070c0c');
  { const lx = 1104 + wx; seg(ctx, lx, 476, lx + 34, 100, '#3a2c1c', 6); seg(ctx, lx + 58, 476, lx + 92, 100, '#3a2c1c', 6); for (let i = 0; i < 9; i++) seg(ctx, lx + 3 + i * 3.6, 440 - i * 40, lx + 61 + i * 3.6, 440 - i * 40, '#3a2c1c', 4); }
  // the tubes: paper going between people who will never meet
  ctx = A();
  const tp = px * 0.45;
  tubeRun(ctx, [[X0, 96], [220 + tp, 96], [220 + tp, 392]], 9, t, 520, 0.1);
  tubeRun(ctx, [[X0 + XW, 84], [470 + tp, 84], [470 + tp, 392]], 9, t, 600, 0.55);
  tubeRun(ctx, [[X0, 72], [820 + tp, 72], [820 + tp, 392]], 9, t, 480, 0.8);
  tubeRun(ctx, [[X0 + XW, 60], [1080 + tp, 60], [1080 + tp, 392]], 9, t, 560, 0.3);
  for (const x of [220, 470, 820, 1080]) { rect(ctx, x - 20 + tp, 388, 40, 26, '#6a4e18'); rect(ctx, x - 14 + tp, 396, 28, 12, '#12100a'); circ(ctx, x + tp, 384, 3, mod(t * 0.7 + x, 3) < 0.25 ? '#ff5a4a' : '#3a1410'); }
  // floor
  ctx = S(0.5);
  ctx.fillStyle = vgrad(ctx, 480, 800, [[0, '#10201d'], [1, '#040707']]); ctx.fillRect(X0, 480, XW, 500);
  // rows of desks: most lamps out, a few left burning over an open book
  for (let r = 0; r < 3; r++) {
    const y = 452 + r * r * 22 + r * 24, s = 15 + r * 9, gap = 150 + r * 70, dpx = px * (0.4 + r * 0.25);
    for (let i = -2; i < 13; i++) {
      const x = i * gap + (r % 2) * gap * 0.5 + dpx, lit = rnd(i * 7.7 + r * 31) < 0.32;
      ctx.fillStyle = vgrad(ctx, y, y + s * 3.4, [[0, '#2a2016'], [1, '#0c0907']]); ctx.fillRect(x - gap * 0.36, y, gap * 0.72, s * 3.4);
      rect(ctx, x - gap * 0.38, y - s * 0.2, gap * 0.76, s * 0.24, '#463422');
      poly(ctx, [[x - gap * 0.36, y - s * 0.2], [x + gap * 0.36, y - s * 0.2], [x + gap * 0.3, y - s * 0.75], [x - gap * 0.3, y - s * 0.75]], '#1c1610'); // the slope of the desk
      if (lit) { poly(ctx, [[x - s * 1.5, y - s * 0.28], [x - s * 0.1, y - s * 0.3], [x - s * 0.1, y - s * 0.7], [x - s * 1.3, y - s * 0.66]], '#d9d2b4'); poly(ctx, [[x - s * 0.1, y - s * 0.3], [x + s * 1.3, y - s * 0.28], [x + s * 1.1, y - s * 0.66], [x - s * 0.1, y - s * 0.7]], '#c6be9e'); }
      bankersLamp(ctx, x + gap * 0.2, y - s * 0.74, s * 0.8, lit, t, i + r * 5);
      if (lit) { ctx.fillStyle = 'rgba(184,240,192,.06)'; ctx.beginPath(); ctx.ellipse(x, y + s * 3.6, gap * 0.5, s * 0.6, 0, 0, TAU); ctx.fill(); }
    }
  }
  // one night clerk, far down the room, who does not look up
  ctx = A();
  { const x = 228 + px * 0.4, y = 418; const nod = Math.sin(t * 0.4) * 1.2; ctx.fillStyle = '#060b0b'; ctx.beginPath(); ctx.arc(x, y + nod, 8, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(x, y + 24, 16, 16, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(184,240,192,.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y + nod, 8, -0.4, 1.2); ctx.stroke(); }
}, (ctx, t, px) => {
  motes(ctx, 219, 44, '#d4f4dc', t, { x0: -60 + px, x1: 1340 + px, y0: 100, y1: 620, vx: 3, vy: 3, r: 1.3, a: 0.26, tw: 1, wob: 16 });
});

// ───────────────────────── chapter 4: dark water ─────────────────────────
function rain(ctx, seed, n, t, px, slant, a, lw) {
  ctx.strokeStyle = `rgba(206,228,240,${a})`; ctx.lineWidth = lw; ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const d = rnd(seed + i * 1.7), v = 900 + d * 700, len = 16 + d * 34;
    const y = mod(rnd(seed * 5 + i * 2.3) * 1200 + t * v, 1200) - 200;
    const x = mod(rnd(seed * 3 + i) * 2000 + t * v * slant, 2000) - 360 + px;
    ctx.moveTo(x, y); ctx.lineTo(x + slant * len, y + len);
  }
  ctx.stroke();
}
/** sheet lightning, a long way off: one soft pulse and an echo, about every seven seconds */
function lightning(t) {
  const ph = mod(t, 7.3);
  if (ph < 0.5) return Math.max(0, 1 - ph / 0.5) * 0.8 + (ph > 0.16 && ph < 0.26 ? 0.2 : 0);
  return 0;
}
/** a swell: one filled layer of sea with a moving crest */
function swell(ctx, y0, amp, k, sp, ph, t, fill, crest) {
  const f = (x) => y0 + Math.sin(x * k + t * sp + ph) * amp + Math.sin(x * k * 2.7 + t * sp * 1.6 + ph * 2) * amp * 0.3;
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.moveTo(X0 - 60, 1100);
  for (let x = X0 - 60; x <= X0 + XW + 60; x += 24) ctx.lineTo(x, f(x));
  ctx.lineTo(X0 + XW + 60, 1100); ctx.fill();
  if (crest) {
    ctx.strokeStyle = crest; ctx.lineWidth = 2; ctx.beginPath();
    for (let x = X0 - 60; x <= X0 + XW + 60; x += 24) { const y = f(x); if (Math.cos(x * k + t * sp + ph) > 0.2) { ctx.moveTo(x, y); ctx.lineTo(x + 24, f(x + 24)); } }
    ctx.stroke();
  }
}

// ── ferry-storm: the lane closing round the Tallis ferry ──
def('ferry-storm', { amb: '#0e1a22', rim: '#c8e4f0', key: -1 }, (ctx, t, px) => {
  const roll = Math.sin(t * 0.9) * 0.04 + Math.sin(t * 0.37) * 0.018, heave = Math.sin(t * 0.7 + 1) * 12, lt = lightning(t);
  ctx = S(0);
  fillAll(ctx, vgrad(ctx, -180, 424, [[0, '#04080c'], [0.6, '#12222c'], [1, '#34484e']]));
  ctx = A();
  ctx.save();
  ctx.translate(640, 440 + heave); ctx.rotate(roll); ctx.translate(-640, -440);
  if (lt > 0) { fillAll(ctx, `rgba(170,205,235,${0.2 * lt})`); glow(ctx, 300 + px * 0.05, 160, 520, '#cfe4ff', 0.3 * lt); }
  for (let i = 0; i < 16; i++) { // cloud, torn and going fast
    const x = mod(rnd(i * 3) * 2000 + t * (26 + rnd(i) * 30), 2000) - 360 + px * 0.06, y = -90 + rnd(i * 7) * 420;
    ctx.fillStyle = `rgba(${4 + lt * 50},${9 + lt * 60},${14 + lt * 70},${0.4 + rnd(i * 5) * 0.3})`; ctx.beginPath(); ctx.ellipse(x, y, 190 + rnd(i * 2) * 260, 28 + rnd(i * 9) * 44, 0, 0, TAU); ctx.fill();
  }
  // the Orm light, a week ahead of its notice: the smoke thins and the flat water under it closes like an eye
  const ox = 880 + px * 0.05, dying = 0.5 + 0.5 * Math.sin(t * 0.21 + 1.2), calm = 30 + 190 * dying;
  ctx.fillStyle = hgrad(ctx, ox - calm, ox + calm, [[0, 'rgba(168,214,240,0)'], [0.5, `rgba(168,214,240,${0.16 + 0.3 * dying})`], [1, 'rgba(168,214,240,0)']]);
  ctx.fillRect(ox - calm, 420, calm * 2, 10);
  poly(ctx, [[ox - 26, 424], [ox + 30, 424], [ox + 18, 412], [ox - 12, 414]], '#0a1218');
  rect(ctx, ox - 3, 392, 6, 22, '#0a1218');
  glow(ctx, ox, 390, 22 + 70 * dying, '#8fd4ff', 0.2 + 0.5 * dying); circ(ctx, ox, 390, 1.6 + 2.4 * dying, rgba('#eaf8ff', 0.4 + 0.6 * dying));
  for (let i = 0; i < 5; i++) { const ph = mod(t * 0.05 + i / 5, 1); ctx.fillStyle = rgba('#b8dcf4', 0.12 * dying * (1 - ph)); ctx.beginPath(); ctx.ellipse(ox - ph * 150, 408 + ph * 12, 20 + ph * 80, 6 + ph * 4, 0, 0, TAU); ctx.fill(); }
  // the sea standing up
  rect(ctx, X0 - 60, 424, XW + 120, 600, '#0c1a20');
  for (let k = 0; k < 7; k++) {
    const u = k / 6;
    swell(ctx, 428 + k * k * 6.5 + k * 16 - px * 0, 5 + k * 6.5, 0.0075 - u * 0.003, 0.8 + u * 0.5, k * 2.1, t, css(mix(mix('#1e3a44', '#060c10', u), '#bcd8e8', lt * 0.18)), `rgba(214,236,244,${0.14 + u * 0.14 + lt * 0.2})`);
    for (let i = 0; i < 9; i++) { // spindrift blowing off the tops
      const x = mod(rnd(k * 31 + i) * 1900 + t * (40 + k * 22), 1900) - 320, y = 426 + k * k * 6.5 + k * 16 + Math.sin(x * (0.0075 - u * 0.003) + t * (0.8 + u * 0.5) + k * 2.1) * (5 + k * 6.5);
      rect(ctx, x, y - 3 - k, 16 + k * 7, 1.5 + k * 0.3, `rgba(226,240,246,${0.3 + u * 0.2})`);
    }
  }
  ctx.restore();
  // the deck rail, streaming
  const rx = px * 1.1, tilt = -roll * 0.5;
  ctx.save(); ctx.translate(640, 640); ctx.rotate(tilt); ctx.translate(-640, -640);
  ctx = S(1.1);
  ctx.fillStyle = vgrad(ctx, 700, 800, [[0, '#1a2026'], [1, '#0a0e12']]); ctx.fillRect(X0 - 60, 706, XW + 120, 400);
  for (let i = -2; i < 12; i++) { const x = i * 170 + rx; ctx.fillStyle = hgrad(ctx, x, x + 16, [[0, '#0c1216'], [0.5, '#34444c'], [1, '#0c1216']]); ctx.fillRect(x, 552, 16, 170); }
  ctx = A();
  rect(ctx, X0 - 60, 548, XW + 120, 15, '#222c32'); rect(ctx, X0 - 60, 548, XW + 120, 3, `rgba(200,228,240,${0.3 + lt * 0.5})`);
  rect(ctx, X0 - 60, 632, XW + 120, 8, '#141c20');
  for (let i = 0; i < 26; i++) { const x = mod(i * 71 + rnd(i) * 40, 1800) - 260 + rx, ph = mod(t * (1.2 + rnd(i * 3)) + rnd(i * 5), 1); rect(ctx, x, 563 + ph * 60, 1.6, 9, `rgba(200,228,240,${0.4 * (1 - ph)})`); } // water coming off it
  // the storm lantern, on a hook, swinging the other way
  const lx = 1060 + rx;
  seg(ctx, lx - 44, 552, lx - 44, 380, '#0c1216', 6); seg(ctx, lx - 44, 384, lx, 384, '#0c1216', 5);
  ctx.save(); ctx.translate(lx, 386); ctx.rotate(-roll * 7 + Math.sin(t * 2.3) * 0.06);
  glow(ctx, 0, 40, 130, '#ffc878', 0.34 * flick(t, 6));
  seg(ctx, 0, 0, 0, 16, '#0c1216', 2); rect(ctx, -13, 16, 26, 7, '#141c20'); rect(ctx, -11, 23, 22, 34, rgba('#ffdc9a', 0.9 * flick(t, 6))); rect(ctx, -13, 57, 26, 7, '#141c20');
  seg(ctx, -11, 23, -11, 57, '#141c20', 2.5); seg(ctx, 11, 23, 11, 57, '#141c20', 2.5); seg(ctx, 0, 23, 0, 57, 'rgba(20,28,32,.6)', 1.5);
  ctx.restore();
  // green water over the bow, now and then
  const sp = mod(t, 5.2);
  if (sp < 1.6) {
    const u = sp / 1.6;
    for (let i = 0; i < 70; i++) {
      const a = -1.5 + rnd(i * 3.3) * 1.3, v = 240 + rnd(i * 7.1) * 420;
      const x = -120 + rx + Math.cos(a) * v * u * 1.5, y = 580 + Math.sin(a) * v * u + 520 * u * u;
      circ(ctx, x, y, 1.5 + rnd(i) * 3.5, `rgba(226,240,246,${0.6 * (1 - u)})`);
    }
  }
  ctx.restore();
}, (ctx, t, px) => {
  rain(ctx, 301, 150, t, px, -0.42, 0.26, 1.2);
  rain(ctx, 307, 70, t * 1.2, px * 1.3, -0.5, 0.4, 1.8);
  for (let i = 0; i < 5; i++) { const x = mod(rnd(i * 3) * 1900 - t * (90 + i * 20), 1900) - 300 + px; ctx.fillStyle = 'rgba(200,225,238,.05)'; ctx.beginPath(); ctx.ellipse(x, 300 + i * 80, 380, 46, -0.1, 0, TAU); ctx.fill(); }
  const lt = lightning(t); if (lt > 0) fillAll(ctx, `rgba(200,225,255,${0.07 * lt})`);
});

// ── wreck-shore: a shingle beach below a breakwater, under a hill with no light on it ──
function stoneHouse(ctx, x, y, w, h, wall, roof, seed) {
  rect(ctx, x, y - h, w, h, wall);
  poly(ctx, [[x - 5, y - h], [x + w / 2, y - h - w * 0.34], [x + w + 5, y - h]], roof);
  rect(ctx, x + w * (0.68 + rnd(seed) * 0.12), y - h - w * 0.36, w * 0.11, w * 0.24, roof);
  for (let i = 0; i < 8; i++) rect(ctx, x + rnd(seed + i) * (w - 12), y - rnd(seed * 3 + i) * h, 6 + rnd(seed * 5 + i) * 9, 2, 'rgba(255,255,255,.045)');
  const n = w > 110 ? 3 : 2;
  for (let i = 0; i < n; i++) { // windows: glass with nothing behind it
    const wx = x + w * (0.16 + i * (0.68 / Math.max(1, n - 1))) - w * 0.06, wy = y - h * 0.72, ww = w * 0.13, wh = h * 0.24;
    rect(ctx, wx, wy, ww, wh, '#020306'); rect(ctx, wx - 1, wy + wh, ww + 2, 2, 'rgba(255,255,255,.1)');
    seg(ctx, wx + ww / 2, wy, wx + ww / 2, wy + wh, 'rgba(255,255,255,.07)', 1);
    poly(ctx, [[wx, wy], [wx + ww * 0.5, wy], [wx, wy + wh * 0.5]], 'rgba(170,196,236,.1)');
  }
  rect(ctx, x + w * 0.42, y - h * 0.4, w * 0.15, h * 0.4, '#020306');
}
/** the lamp-house on the crest, capped these nine years */
function deadLamp(ctx, x, y, s, col) {
  poly(ctx, [[x - s * 0.5, y], [x + s * 0.5, y], [x + s * 0.34, y - s * 1.9], [x - s * 0.34, y - s * 1.9]], col);
  rect(ctx, x - s * 0.5, y - s * 2.0, s, s * 0.12, col);
  for (let i = -2; i <= 2; i++) rect(ctx, x + i * s * 0.2 - s * 0.03, y - s * 2.5, s * 0.06, s * 0.5, col);
  poly(ctx, [[x - s * 0.5, y - s * 2.5], [x, y - s * 2.95], [x + s * 0.5, y - s * 2.5]], col);
}
def('wreck-shore', { amb: '#242c36', rim: '#d4e0ea', key: -1 }, (ctx, t, px) => {
  ctx = S(0);
  fillAll(ctx, vgrad(ctx, -180, 404, [[0, '#141c28'], [0.5, '#3c4a5a'], [1, '#909ba4']]));
  ctx = A();
  for (let i = 0; i < 12; i++) {
    const x = mod(rnd(i * 3) * 1900 + t * (9 + rnd(i) * 8), 1900) - 300 + px * 0.05, y = -40 + rnd(i * 7) * 380;
    ctx.fillStyle = `rgba(22,30,42,${0.3 + rnd(i * 5) * 0.25})`; ctx.beginPath(); ctx.ellipse(x, y, 180 + rnd(i * 2) * 240, 16 + rnd(i * 9) * 26, 0, 0, TAU); ctx.fill();
  }
  ctx = S(0.05);
  glow(ctx, 160 + px * 0.05, 404, 420, '#dfe6ea', 0.2); // where the sun will be, in an hour
  // the sea that put them here, still coming in
  ctx.fillStyle = vgrad(ctx, 404, 600, [[0, '#6c7a84'], [0.3, '#35444e'], [1, '#18222a']]); ctx.fillRect(X0, 404, XW, 200);
  ctx = A();
  for (let k = 0; k < 6; k++) {
    const y = 414 + k * k * 4.6 + k * 8, adv = mod(t * (0.1 + k * 0.012) + k * 0.37, 1);
    ctx.strokeStyle = `rgba(232,240,244,${(0.2 + k * 0.08) * Math.sin(adv * Math.PI)})`; ctx.lineWidth = 1.5 + k * 0.7; ctx.beginPath();
    for (let x = X0; x <= 1540; x += 22) { const yy = y + adv * (10 + k * 5) + Math.sin(x * 0.013 + k * 2 + t * 0.4) * (2 + k); x === X0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); }
    ctx.stroke();
  }
  // the hill, and what stands on it, all of it unlit
  ctx = S(0.3);
  const hx = px * 0.12;
  ctx.fillStyle = '#131920';
  ctx.beginPath(); ctx.moveTo(430 + hx, 420); ctx.bezierCurveTo(620 + hx, 330, 760 + hx, 150, 1010 + hx, 124); ctx.bezierCurveTo(1200 + hx, 110, 1400 + hx, 190, 1560, 230); ctx.lineTo(1560, 480); ctx.lineTo(430 + hx, 480); ctx.fill();
  deadLamp(ctx, 1020 + hx, 128, 22, '#0c1016');
  for (let i = 0; i < 9; i++) {
    const x = 640 + i * 96 + rnd(i * 3) * 30 + hx, y = 392 - Math.sin(clamp((x - hx - 480) / 900) * Math.PI * 0.9) * 190 + rnd(i * 7) * 40 + 40;
    stoneHouse(ctx, x, y, 54 + rnd(i) * 24, 30 + rnd(i * 5) * 14, '#1c232c', '#0e1218', i * 3 + 1);
  }
  // the breakwater, and eleven people coming down it with a rope
  const bx = px * 0.3;
  ctx.fillStyle = '#20262c';
  ctx.beginPath(); ctx.moveTo(1560, 436); ctx.lineTo(470 + bx, 414); ctx.lineTo(452 + bx, 424); ctx.lineTo(470 + bx, 446); ctx.lineTo(1560, 500); ctx.fill();
  for (let i = 0; i < 30; i++) { const u = rnd(i * 3.1), x = lerp(480, 1540, u) + bx; rect(ctx, x, lerp(418, 438, u) + rnd(i * 7) * lerp(20, 50, u), 20 + rnd(i) * 30, 2, 'rgba(0,0,0,.3)'); }
  seg(ctx, 470 + bx, 414, 1560, 436, 'rgba(212,224,234,.4)', 1.5);
  ctx = A();
  { // the sea breaking on the end of it
    const ph = mod(t * 0.28, 1), ex = 452 + bx;
    for (let i = 0; i < 46; i++) { const a = -Math.PI * (0.15 + rnd(i * 3) * 0.7), v = 30 + rnd(i * 7) * 70; circ(ctx, ex + Math.cos(a) * v * ph * 1.2, 428 + Math.sin(a) * v * ph + 60 * ph * ph, 1.5 + rnd(i) * 3, `rgba(236,244,248,${0.7 * (1 - ph)})`); }
  }
  for (let i = 0; i < 11; i++) {
    const u = i / 10, x = lerp(520, 1010, u) + bx + Math.sin(t * 1.6 + i * 1.3) * 2, y = lerp(415, 425, u) - 21, s = 5.2 + u * 1.6, step = Math.sin(t * 5 + i * 2.1) * 1.2;
    ctx.fillStyle = '#0a0e12';
    ctx.beginPath(); ctx.arc(x, y - step * 0.4, s * 0.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - s * 0.7, y + s * 3.2); ctx.lineTo(x - s * 0.8, y + s * 0.8); ctx.quadraticCurveTo(x - 2, y + s * 0.3, x + s * 0.7, y + s * 0.9); ctx.lineTo(x + s * 0.6, y + s * 3.2); ctx.fill();
    seg(ctx, x - s * 0.6, y + s * 1.2, x - s * 1.7, y + s * 1.9, '#0a0e12', s * 0.4);     // an arm, on the rope
    if (i < 10) { const x2 = lerp(520, 1010, (i + 1) / 10) + bx; ctx.strokeStyle = 'rgba(214,204,176,.8)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x - s * 1.7, y + s * 1.9); ctx.quadraticCurveTo((x + x2) / 2 - 8, y + s * 2.7 + 4, x2 - (s + 0.16) * 1.7, y + s * 1.9 + 1); ctx.stroke(); }
    if (i === 0) { ctx.strokeStyle = 'rgba(214,204,176,.8)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x - s * 1.7, y + s * 1.9); ctx.quadraticCurveTo(x - 90, y + 80, 300 + px * 0.6, 560); ctx.stroke(); }
  }
  // shingle
  ctx = S(0.7);
  ctx.fillStyle = vgrad(ctx, 540, 800, [[0, '#59626a'], [0.25, '#3a4148'], [1, '#14181c']]);
  ctx.beginPath(); ctx.moveTo(X0, 1000); ctx.lineTo(X0, 592); ctx.bezierCurveTo(200, 560, 520, 548, 900, 520); ctx.lineTo(1560, 486); ctx.lineTo(1560, 1000); ctx.fill();
  for (let i = 0; i < 260; i++) {
    const d = rnd(i * 1.7), x = X0 + rnd(i * 3.3) * XW + px * (0.5 + d * 0.5), y = 560 + d * d * 240 - (x - px > 700 ? (x - px - 700) * 0.06 : 0);
    ctx.fillStyle = `rgba(${150 + rnd(i) * 70},${160 + rnd(i * 5) * 60},${170 + rnd(i * 7) * 50},${0.1 + d * 0.22})`; ctx.beginPath(); ctx.ellipse(x, y, 3 + d * 9, 2 + d * 4.5, 0, 0, TAU); ctx.fill();
  }
  ctx = A();
  for (let i = 0; i < 4; i++) { // the wash, up the stones and back
    const adv = Math.sin(t * 0.5 - i * 0.9) * 16, y0 = 566 + i * 10 + adv;
    ctx.strokeStyle = `rgba(238,244,248,${0.6 - i * 0.12})`; ctx.lineWidth = 3 - i * 0.5; ctx.beginPath();
    for (let x = X0; x <= 940; x += 24) { const y = y0 - (x + 260) * 0.036 + Math.sin(x * 0.012 + i * 2 + t * 0.3) * 6 + Math.sin(x * 0.04 + i) * 2.5; x === X0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
  }
  // what came ashore with them: the hatch cover, a spar, a cask working in the wash
  const wx = px * 0.7;
  ctx.save(); ctx.translate(250 + wx, 560 + Math.sin(t * 0.5) * 3); ctx.rotate(-0.12 + Math.sin(t * 0.5) * 0.02);
  poly(ctx, [[-90, 0], [70, -14], [96, 16], [-70, 34]], '#3a2c20'); for (let i = 1; i < 5; i++) seg(ctx, -90 + i * 34, i * -2.8, -70 + i * 34, 34 - i * 3.6, '#1c140e', 2);
  seg(ctx, -90, 0, 70, -14, 'rgba(212,224,234,.4)', 1.5); circ(ctx, 40, 4, 5, '#6a6a66');
  ctx.restore();
  seg(ctx, 560 + wx, 548, 800 + wx, 520, '#2a2018', 9); seg(ctx, 700 + wx, 532, 730 + wx, 500, '#2a2018', 5);
  ctx.strokeStyle = 'rgba(190,180,150,.6)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(800 + wx, 520); ctx.bezierCurveTo(840 + wx, 560, 780 + wx, 566, 860 + wx, 580); ctx.stroke();
  { const cx = 70 + wx + Math.sin(t * 0.5) * 18, cy = 590 + Math.sin(t * 0.5) * 4; ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.sin(t * 0.5) * 0.5); ctx.fillStyle = '#4a3624'; ctx.beginPath(); ctx.ellipse(0, 0, 30, 20, 0, 0, TAU); ctx.fill(); for (const k of [-16, 0, 16]) seg(ctx, k, -19 + Math.abs(k) * 0.3, k, 19 - Math.abs(k) * 0.3, '#1c1410', 2.5); ctx.restore(); }
}, (ctx, t, px) => {
  for (let i = 0; i < 6; i++) { const x = mod(rnd(i * 3) * 1900 + t * (22 + i * 4), 1900) - 300 + px; ctx.fillStyle = 'rgba(214,226,234,.06)'; ctx.beginPath(); ctx.ellipse(x, 380 + i * 52, 360, 34, 0, 0, TAU); ctx.fill(); }
  motes(ctx, 311, 50, '#eef4f8', t, { x0: -100 + px, x1: 1380 + px, y0: 300, y1: 680, vx: 60, vy: -6, r: 1.3, a: 0.4, wob: 10 });
});

// ── dark-village: stone houses, no lamps in any window; and the net hall, where the accounts hang ──
def('dark-village', { amb: '#101826', rim: '#b8cce8', key: 1 }, (ctx, t, px) => {
  ctx = S(0.05);
  fillAll(ctx, vgrad(ctx, -180, 470, [[0, '#02040a'], [0.55, '#0a1226'], [1, '#1c2a44']]));
  // with no light below, every star there is
  ctx.save(); ctx.translate(700 + px * 0.03, 150); ctx.rotate(-0.42);
  for (let i = 0; i < 60; i++) glow(ctx, (rnd(i * 3.1) - 0.5) * 1500, (rnd(i * 7.7) - 0.5) * 90, 40 + rnd(i) * 70, '#9fb4e8', 0.035);
  for (let i = 0; i < 220; i++) rect(ctx, (rnd(i * 1.3) - 0.5) * 1500, (rnd(i * 5.1) - 0.5) * (60 + rnd(i) * 80), 1.2, 1.2, `rgba(226,234,255,${0.2 + rnd(i * 9) * 0.5})`);
  ctx.restore();
  ctx = A();
  stars(ctx, 31, 300, 440, t);
  // the hill, the capped lamp, the upper houses
  ctx = S(0.3);
  const hx = px * 0.12;
  ctx.fillStyle = '#080c16';
  ctx.beginPath(); ctx.moveTo(X0, 470); ctx.lineTo(X0, 300); ctx.bezierCurveTo(-40 + hx, 190, 180 + hx, 150, 330 + hx, 200); ctx.bezierCurveTo(520 + hx, 262, 700 + hx, 250, 900 + hx, 290); ctx.bezierCurveTo(1150 + hx, 340, 1400, 330, 1560, 360); ctx.lineTo(1560, 470); ctx.fill();
  deadLamp(ctx, 250 + hx, 172, 20, '#060810');
  for (let i = 0; i < 10; i++) { const x = -160 + i * 160 + rnd(i * 3) * 50 + hx; stoneHouse(ctx, x, [300, 270, 240, 262, 300, 316, 326, 350, 368, 380][i] + 40, 60 + rnd(i) * 26, 32 + rnd(i * 5) * 16, '#0f1522', '#070a12', i * 5 + 2); }
  // the street
  const mx = px * 0.3;
  stoneHouse(ctx, -250 + mx, 478, 230, 170, '#161e2c', '#0a0e18', 41);
  stoneHouse(ctx, -10 + mx, 478, 180, 134, '#1a2230', '#0c101a', 43);
  stoneHouse(ctx, 1110 + mx, 478, 190, 150, '#1a2230', '#0c101a', 47);
  stoneHouse(ctx, 1300 + mx, 478, 260, 190, '#161e2c', '#0a0e18', 53);
  // the net hall: the one building with a fire in it
  const nx = 640 + mx, fl = flick(t, 9);
  rect(ctx, nx - 380, 178, 760, 302, '#1c2432');
  poly(ctx, [[nx - 404, 180], [nx, 44], [nx + 404, 180]], '#0c101a');
  for (let i = 0; i < 12; i++) seg(ctx, nx - 370 + i * 30, 172 - i * 10, nx - 340 + i * 30, 184 - i * 10, 'rgba(255,255,255,.03)', 2);
  rect(ctx, nx + 250, 70, 34, 76, '#0c101a');
  ctx = A();
  for (let i = 0; i < 7; i++) { // the only smoke in the village
    const ph = mod(t * 0.08 + i / 7, 1); ctx.fillStyle = `rgba(150,160,184,${0.16 * (1 - ph)})`;
    ctx.beginPath(); ctx.ellipse(nx + 267 + ph * 150 + Math.sin(t * 0.6 + i) * 8, 66 - ph * 130, 12 + ph * 46, 9 + ph * 26, 0, 0, TAU); ctx.fill();
  }
  for (let i = 0; i < 26; i++) rect(ctx, nx - 370 + rnd(i * 3.3) * 720, 190 + rnd(i * 7.1) * 280, 10 + rnd(i) * 16, 2, 'rgba(255,255,255,.04)');
  // its doors stand open: firelight on the back wall, and the net across it
  const ox0 = nx - 300, ox1 = nx + 300, oy0 = 204, oy1 = 480;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(ox0, oy1); ctx.lineTo(ox0, oy0 + 26); ctx.quadraticCurveTo(nx, oy0 - 22, ox1, oy0 + 26); ctx.lineTo(ox1, oy1); ctx.closePath(); ctx.clip();
  rect(ctx, ox0, oy0 - 20, ox1 - ox0, 310, '#1a0e08');
  ctx = S(0.3, fl);
  { const g = ctx.createRadialGradient(nx + 150, 452, 10, nx + 60, 400, 420); g.addColorStop(0, rgba('#ffa050', 0.75)); g.addColorStop(0.4, rgba('#b85a24', 0.42)); g.addColorStop(1, 'rgba(60,24,10,0)'); ctx.fillStyle = g; ctx.fillRect(ox0, oy0 - 20, ox1 - ox0, 310); }
  ctx = A();
  // sixty-one people and a stove
  crowdRow(ctx, 321, ox0 - 10, ox1 - 90, 440, 13, 13, '#0c0706', t, { bob: 0.3, hat: 0.3 });
  rect(ctx, nx + 126, 418, 50, 62, '#0a0606'); rect(ctx, nx + 144, 180, 12, 240, '#0a0606'); rect(ctx, nx + 134, 436, 34, 10, rgba('#ffb060', 0.9 * fl)); glow(ctx, nx + 151, 440, 70, '#ff9040', 0.5 * fl);
  // the herring net: mesh, a head-rope, and one cord to a household, knotted for every day owed
  ctx = S(0.3);
  ctx.strokeStyle = 'rgba(12,7,5,.5)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let i = -16; i < 40; i++) { ctx.moveTo(ox0 + i * 17, oy0); ctx.lineTo(ox0 + i * 17 + 250, oy0 + 250); ctx.moveTo(ox0 + i * 17 + 250, oy0); ctx.lineTo(ox0 + i * 17, oy0 + 250); }
  ctx.stroke();
  ctx.strokeStyle = '#d2c096'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(ox0, oy0 + 22); ctx.quadraticCurveTo(nx, oy0 + 2, ox1, oy0 + 22); ctx.stroke();
  ctx = A();
  for (let i = 0; i < 37; i++) {
    const u = (i + 0.5) / 37, x = lerp(ox0 + 8, ox1 - 8, u), y0 = oy0 + 22 - Math.sin(u * Math.PI) * 10, len = 96 + rnd(i * 3.7) * 136, sw = Math.sin(t * 0.7 + i * 0.9) * 2.4;
    const col = rnd(i * 9.3) < 0.22 ? '#c8704a' : rnd(i * 5.1) < 0.3 ? '#9fb4b0' : '#e2d2a6';
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y0); ctx.quadraticCurveTo(x + sw * 0.4, y0 + len * 0.5, x + sw, y0 + len); ctx.stroke();
    const knots = 1 + Math.floor(rnd(i * 7.9) * 9);
    for (let k = 0; k < knots; k++) { const v = (k + 1) / 10; circ(ctx, x + sw * v * v, y0 + len * v * 1.02, 3.1, col); circ(ctx, x + sw * v * v - 0.8, y0 + len * v * 1.02 - 0.8, 1.2, 'rgba(255,255,255,.5)'); }
    circ(ctx, x, y0, 2.6, '#d2c096');
  }
  ctx.restore();
  ctx.strokeStyle = '#0a0e18'; ctx.lineWidth = 12;
  ctx.beginPath(); ctx.moveTo(ox0, oy1); ctx.lineTo(ox0, oy0 + 26); ctx.quadraticCurveTo(nx, oy0 - 22, ox1, oy0 + 26); ctx.lineTo(ox1, oy1); ctx.stroke();
  for (const s of [-1, 1]) { rect(ctx, nx + s * 328 - 22, 200, 44, 280, '#141a26'); for (let i = 0; i < 7; i++) rect(ctx, nx + s * 328 - 22, 212 + i * 38, 44, 2, '#0a0e18'); } // the doors, folded back
  // what the fire throws into the street
  ctx = S(0.6);
  ctx.fillStyle = vgrad(ctx, 470, 800, [[0, '#121826'], [1, '#04060a']]); ctx.fillRect(X0, 478, XW, 500);
  for (let i = 0; i < 70; i++) { const d = rnd(i * 1.9), x = X0 + rnd(i * 3.7) * XW + px * (0.4 + d * 0.5), y = 486 + d * d * 260; ctx.fillStyle = `rgba(150,170,210,${0.05 + d * 0.06})`; ctx.beginPath(); ctx.ellipse(x, y, 10 + d * 24, 2 + d * 4, 0, 0, TAU); ctx.fill(); }
  ctx = A();
  poly(ctx, [[ox0, 480], [ox1, 480], [ox1 + 220, 800], [ox0 - 220, 800]], rgba('#d87a3a', 0.13 * fl));
  // nets on the drying poles, either side
  for (const s of [-1, 1]) {
    const x0 = 640 + s * 560 + px * 0.8, x1 = 640 + s * 800 + px * 0.8, sw = Math.sin(t * 0.8 + s) * 5;
    seg(ctx, x0, 800, x0, 330, '#06080e', 7); seg(ctx, x1, 800, x1, 300, '#06080e', 8);
    ctx.strokeStyle = 'rgba(6,8,14,.9)'; ctx.lineWidth = 1.2; ctx.beginPath();
    for (let i = 0; i <= 12; i++) { const u = i / 12, x = lerp(x0, x1, u); ctx.moveTo(x, lerp(336, 306, u) + Math.sin(u * Math.PI) * 30); ctx.lineTo(x + sw, 640); }
    for (let j = 0; j < 9; j++) { ctx.moveTo(x0 + sw * j / 9, 350 + j * 32); ctx.quadraticCurveTo((x0 + x1) / 2 + sw, 372 + j * 32, x1 + sw * j / 9, 322 + j * 34); }
    ctx.stroke();
  }
}, (ctx, t, px) => {
  for (let i = 0; i < 4; i++) { const x = mod(rnd(i * 3) * 1800 + t * 7, 1800) - 260 + px; ctx.fillStyle = 'rgba(150,170,214,.035)'; ctx.beginPath(); ctx.ellipse(x, 470 + i * 46, 340, 26, 0, 0, TAU); ctx.fill(); }
});

// ── hidden-lamp: a small shuttered flame in a sea-cave ──
/** long and short, like a slow pulse: how far the shutter stands open, 0..1 */
function lampSignal(t) {
  const pat = [1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 0, 0], u = mod(t / 0.62, pat.length), i = Math.floor(u), f = u - i;
  return lerp(pat[i], pat[(i + 1) % pat.length], ease(f * 2.2));
}
def('hidden-lamp', { amb: '#07131f', rim: '#86ccff', key: 1 }, (ctx, t, px) => {
  const open = lampSignal(t), lit = 0.3 + 0.7 * open;
  // the cave mouth: night, the sea, and the others answering
  fillAll(ctx, '#02050a');
  const mx = px * 0.15;
  ctx = S(0.15);
  ctx.fillStyle = vgrad(ctx, 60, 372, [[0, '#081430'], [0.7, '#1c3460'], [1, '#3a5a8c']]); ctx.fillRect(-60 + mx, 40, 560, 334);
  ctx = A();
  stars(ctx, 331, 200, 360, t);
  ctx = S(0.15);
  ctx.fillStyle = vgrad(ctx, 372, 560, [[0, '#24446c'], [1, '#081220']]); ctx.fillRect(-60 + mx, 372, 560, 200);
  poly(ctx, [[60 + mx, 372], [120 + mx, 356], [180 + mx, 360], [230 + mx, 372]], '#060a14');
  poly(ctx, [[300 + mx, 372], [340 + mx, 362], [420 + mx, 372]], '#060a14');
  ctx = A();
  for (const [x, dt, r] of [[150, 2.9, 1], [322, 5.7, 0.8], [246, 8.3, 0.55]]) { // three points of blue, each keeping its own time
    const o = lampSignal(t + dt);
    glow(ctx, x + mx, 356 + (1 - r) * 12, 34 * r, '#8fd4ff', 0.75 * o); circ(ctx, x + mx, 356 + (1 - r) * 12, 2.4 * r, rgba('#f0fbff', o));
    for (let j = 0; j < 6; j++) rect(ctx, x + mx - 9 * r + Math.sin(t * 2 + j) * 2, 378 + j * 9, (18 - j * 2) * r, 1.6, rgba('#8fd4ff', 0.4 * o * (1 - j / 6)));
  }
  waterStreaks(ctx, 333, -40 + mx, 480 + mx, 378, 540, 50, '#7fa8d8', t, 0.3);
  // the rock: everything that is not the mouth
  ctx = S(0.3);
  const rx = px * 0.3;
  ctx.fillStyle = vgrad(ctx, -180, 800, [[0, '#03070c'], [0.5, '#0b1722'], [1, '#04080d']]);
  ctx.beginPath(); ctx.rect(X0, -180, XW, 1160);
  ctx.moveTo(50 + rx, 560); ctx.bezierCurveTo(10 + rx, 380, 60 + rx, 190, 170 + rx, 120); ctx.bezierCurveTo(260 + rx, 70, 370 + rx, 110, 410 + rx, 220); ctx.bezierCurveTo(440 + rx, 330, 470 + rx, 430, 440 + rx, 560); ctx.closePath();
  ctx.fill('evenodd');
  ctx.strokeStyle = 'rgba(150,190,240,.5)'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(50 + rx, 560); ctx.bezierCurveTo(10 + rx, 380, 60 + rx, 190, 170 + rx, 120); ctx.bezierCurveTo(260 + rx, 70, 370 + rx, 110, 410 + rx, 220); ctx.stroke();
  // the lamp, on its ledge at the back, and the light it lets out
  ctx = A();
  const lx = 800 + px * 0.4, ly = 232;
  ctx = S(0.4, 0.3 * lit);
  glow(ctx, lx, ly - 20, 620, '#4fa8f0', 1);
  ctx = A();
  for (let i = 0; i < 26; i++) { // strata, wet where the light finds them
    const y = -120 + i * 36 + rnd(i) * 20, a = 0.05 + 0.1 * lit * clamp(1 - Math.abs(y - ly) / 520);
    ctx.strokeStyle = `rgba(134,204,255,${a})`; ctx.lineWidth = 1 + rnd(i * 7) * 2.4;
    ctx.beginPath(); ctx.moveTo(470 + rx * 1.2, y + 30); ctx.bezierCurveTo(700 + rx, y + rnd(i * 2) * 50 - 30, 1100 + rx, y - rnd(i * 5) * 50 + 40, X0 + XW, y + 16); ctx.stroke();
  }
  ctx.fillStyle = '#02050a'; ctx.beginPath(); ctx.ellipse(lx, ly - 34, 128, 108, 0, 0, TAU); ctx.fill();   // the niche
  { const g = ctx.createRadialGradient(lx, ly - 30, 6, lx, ly - 30, 124); g.addColorStop(0, rgba('#9fdcff', 0.6 * lit)); g.addColorStop(1, 'rgba(60,140,220,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(lx, ly - 34, 126, 106, 0, 0, TAU); ctx.fill(); }
  poly(ctx, [[lx - 150, ly + 26], [lx + 160, ly + 26], [lx + 130, ly + 52], [lx - 120, ly + 48]], '#0a1520'); seg(ctx, lx - 150, ly + 26, lx + 160, ly + 26, rgba('#86ccff', 0.3 * lit), 1.5);
  rect(ctx, lx - 22, ly + 6, 44, 20, '#1a2a38'); rect(ctx, lx - 16, ly, 32, 8, '#243848');
  coldFlame(ctx, lx, ly + 2, 31, t, 7);
  // the shutter: old ship's copper, gone green, in slats she works with one hand
  const sw = 176, sh = 152, s0 = ly - 124;
  for (let i = 0; i < 6; i++) { // what gets out between the slats, when it is open
    const y = s0 + 12 + i * 25;
    poly(ctx, [[lx - sw / 2, y + 8], [lx + sw / 2, y + 8], [lx + sw / 2 + 760, y + 300 + i * 150], [lx - sw / 2 - 900, y + 240 + i * 150]], `rgba(120,196,255,${0.035 * open})`);
  }
  for (let i = 0; i < 6; i++) {
    const y = s0 + 2 + i * 25, h = 23 - open * 17;
    ctx.fillStyle = vgrad(ctx, y, y + h, [[0, css(mix('#c07a44', '#86ccff', 0.2 * lit))], [1, '#5a3018']]); ctx.fillRect(lx - sw / 2, y, sw, h);
    for (let k = 0; k < 5; k++) { ctx.fillStyle = `rgba(86,170,144,${0.5 + rnd(i * 5 + k) * 0.3})`; ctx.fillRect(lx - sw / 2 + rnd(i * 9 + k * 3) * (sw - 30), y, 12 + rnd(i + k * 7) * 26, h); }
    for (let k = 0; k < 8; k++) circ(ctx, lx - sw / 2 + 10 + k * ((sw - 20) / 7), y + h / 2, 1.4, 'rgba(20,10,6,.7)');
  }
  ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 6; ctx.strokeRect(lx - sw / 2 - 3, s0 - 3, sw + 6, sh + 6);
  seg(ctx, lx + sw / 2 + 12, s0 + 8, lx + sw / 2 + 12, s0 + sh - 26 + open * 22, '#6a4a2a', 4); circ(ctx, lx + sw / 2 + 12, s0 + sh - 22 + open * 22, 6, '#8a6a3a'); // the pull
  // kelp drying on a line; a cask of the ash; a sack of scrapings
  const kx = px * 0.6;
  ctx.strokeStyle = '#04070c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(1000 + kx, 96); ctx.quadraticCurveTo(1200 + kx, 128, 1540, 90); ctx.stroke();
  for (let i = 0; i < 12; i++) {
    const x = 1016 + i * 40 + kx, y0 = 100 + Math.sin((i / 12) * Math.PI) * 18, len = 70 + rnd(i * 3) * 90, sw2 = Math.sin(t * 0.9 + i) * 5;
    ctx.strokeStyle = css(mix('#0c1a14', '#2a5a48', 0.2 + 0.3 * lit)); ctx.lineWidth = 5 + rnd(i) * 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.bezierCurveTo(x + 8, y0 + len * 0.3, x - 8 + sw2, y0 + len * 0.7, x + sw2, y0 + len); ctx.stroke(); ctx.lineCap = 'butt';
  }
  ctx = S(0.6);
  ctx.fillStyle = vgrad(ctx, 500, 800, [[0, '#0a1520'], [1, '#020406']]);
  ctx.beginPath(); ctx.moveTo(X0, 1000); ctx.lineTo(X0, 560); ctx.bezierCurveTo(300, 520, 700, 500, 1560, 470); ctx.lineTo(1560, 1000); ctx.fill();
  ctx = A();
  { const bx = 1150 + kx; ctx.fillStyle = hgrad(ctx, bx - 44, bx + 44, [[0, css(mix('#2a2018', '#86ccff', 0.3 * lit))], [1, '#0c0806']]); ctx.beginPath(); ctx.ellipse(bx, 440, 46, 62, 0, 0, TAU); ctx.fill(); rect(ctx, bx - 44, 410, 88, 5, '#0a0a0c'); rect(ctx, bx - 46, 452, 92, 5, '#0a0a0c'); ctx.fillStyle = '#9aa2a4'; ctx.beginPath(); ctx.ellipse(bx, 382, 36, 9, 0, 0, TAU); ctx.fill(); }
  // the pool, and the drip that keeps the time
  ctx.fillStyle = 'rgba(10,26,40,.9)'; ctx.beginPath(); ctx.ellipse(560 + px * 0.5, 540, 300, 30, 0, 0, TAU); ctx.fill();
  waterStreaks(ctx, 337, 300 + px * 0.5, 820 + px * 0.5, 522, 560, 26, '#86ccff', t, 0.5 * lit);
  for (let i = 0; i < 4; i++) {
    const x = 380 + i * 120 + px * 0.5, ph = mod(t * 0.45 + i * 0.29, 1);
    if (ph < 0.5) rect(ctx, x, 90 + ph * 2 * 440, 1.6, 10, rgba('#bfe4ff', 0.6));
    else { const r = (ph - 0.5) * 2; ctx.strokeStyle = rgba('#bfe4ff', 0.5 * (1 - r)); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(x, 538, 6 + r * 44, 1.5 + r * 6, 0, 0, TAU); ctx.stroke(); }
  }
}, (ctx, t, px) => {
  // the cold smoke, which goes down, along the floor, and out to sea
  for (let i = 0; i < 7; i++) { const x = mod(rnd(i * 3) * 1700 - t * (14 + i * 3), 1700) - 220 + px; ctx.fillStyle = 'rgba(150,205,245,.05)'; ctx.beginPath(); ctx.ellipse(x, 500 + i * 16, 300, 20, 0, 0, TAU); ctx.fill(); }
  // the roof of the cave, near
  ctx.fillStyle = '#010305';
  for (let i = 0; i < 16; i++) { const x = -260 + i * 118 + rnd(i * 3) * 60 + px, h = 60 + rnd(i * 7) * 130, w = 30 + rnd(i) * 50; ctx.beginPath(); ctx.moveTo(x - w, -180); ctx.lineTo(x - w * 0.5, -60 + h * 0.3); ctx.lineTo(x, -80 + h); ctx.lineTo(x + w * 0.5, -60 + h * 0.2); ctx.lineTo(x + w, -180); ctx.fill(); }
});

// ── under-lane: rowing boats on black water, one hooded lantern each ──
function rowBoat(ctx, x, y, s, t, seed, stroke, n) {
  const dip = Math.sin(t * 0.8 + seed) * 2 * s;
  ctx.save(); ctx.translate(x, y + dip);
  // the pool of light the hood lets fall
  ctx.fillStyle = rgba('#ffb860', 0.16); ctx.beginPath(); ctx.ellipse(86 * s, 15 * s, 46 * s, 6 * s, 0, 0, TAU); ctx.fill();
  for (let j = 0; j < 5; j++) rect(ctx, 70 * s + Math.sin(t * 2 + j + seed) * 4 * s, (18 + j * 5) * s, (30 - j * 5) * s, Math.max(1, 1.6 * s), rgba('#ffb860', 0.34 - j * 0.06));
  ctx.fillStyle = '#020407';
  ctx.beginPath(); ctx.moveTo(-84 * s, -9 * s); ctx.quadraticCurveTo(-70 * s, 12 * s, -40 * s, 13 * s); ctx.lineTo(56 * s, 13 * s); ctx.quadraticCurveTo(84 * s, 9 * s, 98 * s, -14 * s); ctx.lineTo(70 * s, -4 * s); ctx.lineTo(-70 * s, -4 * s); ctx.closePath(); ctx.fill();
  const c = Math.cos(stroke), sn = Math.sin(stroke);
  for (let j = 0; j < n; j++) {
    const bx = (-46 + j * (92 / n)) * s, lean = -sn * 7 * s;
    // the oar: out, down, through, and back, all of them together
    const hx = bx + lean + 4 * s, hy = -14 * s, tx = bx + 6 * s + sn * 30 * s, ty = 10 * s - Math.max(0, c) * 12 * s;
    seg(ctx, hx, hy, tx, ty, '#05080c', Math.max(1, 2.2 * s));
    if (c < 0.1) { ctx.strokeStyle = `rgba(190,214,236,${0.4 * -Math.min(0, c - 0.1)})`; ctx.lineWidth = Math.max(1, s * 1.2); ctx.beginPath(); ctx.ellipse(tx, 13 * s, 9 * s, 2 * s, 0, 0, TAU); ctx.stroke(); }
    ctx.fillStyle = '#020407';
    seg(ctx, bx, -3 * s, bx + lean, -19 * s, '#020407', 10 * s);
    ctx.beginPath(); ctx.arc(bx + lean * 1.25, -27 * s, 5.4 * s, 0, TAU); ctx.fill();
  }
  seg(ctx, -62 * s, -3 * s, -64 * s, -20 * s, '#020407', 10 * s); circ(ctx, -64 * s, -28 * s, 5.4 * s, '#020407');   // whoever has the tiller
  // the lantern at the bow, hooded: a slit, and no more
  seg(ctx, 88 * s, -10 * s, 88 * s, -30 * s, '#020407', Math.max(1, 2 * s));
  glow(ctx, 91 * s, -34 * s, 26 * s, '#ffb860', 0.5 * flick(t, seed));
  rect(ctx, 82 * s, -42 * s, 12 * s, 14 * s, '#020407'); poly(ctx, [[80 * s, -42 * s], [88 * s, -48 * s], [96 * s, -42 * s]], '#020407');
  rect(ctx, 93 * s, -38 * s, Math.max(1.2, 2.2 * s), 7 * s, rgba('#ffdc9a', 0.95));
  ctx.strokeStyle = 'rgba(255,190,110,.4)'; ctx.lineWidth = Math.max(1, 1.4 * s);    // what little of it falls on the boat itself
  ctx.beginPath(); ctx.moveTo(98 * s, -14 * s); ctx.lineTo(70 * s, -4 * s); ctx.lineTo(20 * s, -4 * s); ctx.stroke();
  ctx.restore();
}
def('under-lane', { amb: '#050b14', rim: '#ffc27a', key: -1 }, (ctx, t, px) => {
  const hy = 388;
  ctx = S(0);
  fillAll(ctx, vgrad(ctx, -180, hy, [[0, '#010205'], [0.6, '#050a14'], [1, '#0e1826']]));
  ctx = A();
  stars(ctx, 341, 110, hy - 40, t);
  // the Maund rocks
  ctx.fillStyle = '#020408';
  for (const [x, w, h] of [[120, 90, 110], [210, 60, 170], [300, 120, 80], [1130, 80, 130], [1210, 130, 60], [-120, 160, 70]]) {
    const xx = x + px * 0.1; ctx.beginPath(); ctx.moveTo(xx - w / 2, hy + 2); ctx.lineTo(xx - w * 0.3, hy - h * 0.6); ctx.lineTo(xx - w * 0.08, hy - h); ctx.lineTo(xx + w * 0.12, hy - h * 0.82); ctx.lineTo(xx + w * 0.34, hy - h * 0.4); ctx.lineTo(xx + w / 2, hy + 2); ctx.fill();
  }
  // the Audit cutter, a long way off, looking for a wreck with the one light it is allowed
  const cx = 860 + Math.sin(t * 0.05) * 90 + px * 0.06, a = Math.PI * 0.5 + Math.sin(t * 0.33) * 1.05;
  poly(ctx, [[cx, hy - 9], [cx + Math.cos(a - 0.05) * 760, hy - 9 + Math.sin(a - 0.05) * 240], [cx + Math.cos(a + 0.05) * 760, hy - 9 + Math.sin(a + 0.05) * 240]], 'rgba(190,220,255,.07)');
  poly(ctx, [[cx - 16, hy], [cx + 18, hy], [cx + 12, hy + 4], [cx - 12, hy + 4]], '#020408'); rect(ctx, cx - 1, hy - 14, 2, 14, '#020408');
  glow(ctx, cx, hy - 10, 26, '#cfe4ff', 0.8); circ(ctx, cx, hy - 10, 1.8, '#ffffff');
  // black water
  ctx = S(0);
  ctx.fillStyle = vgrad(ctx, hy, 800, [[0, '#0a1422'], [0.3, '#050a12'], [1, '#010204']]); ctx.fillRect(X0, hy, XW, 600);
  seg(ctx, X0, hy, X0 + XW, hy, 'rgba(120,150,190,.2)', 1);
  ctx = A();
  for (let k = 0; k < 9; k++) { // a long slow swell, which is all a dark sea shows of itself
    const y = hy + 14 + k * k * 4.2 + k * 9;
    ctx.strokeStyle = `rgba(130,160,200,${0.05 + k * 0.012})`; ctx.lineWidth = 1 + k * 0.35; ctx.beginPath();
    for (let x = X0; x <= 1540; x += 30) { const yy = y + Math.sin(x * 0.006 + t * 0.5 + k * 1.7) * (2 + k * 1.3); x === X0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); }
    ctx.stroke();
  }
  waterStreaks(ctx, 343, cx - 60, cx + 60, hy + 4, hy + 90, 16, '#cfe4ff', t, 0.3);
  // the boats, in line, pulling to the same count
  const stroke = t * 2.0;
  rowBoat(ctx, 1150 + px * 0.16, hy + 14, 0.26, t, 5, stroke, 3);
  rowBoat(ctx, 250 + px * 0.2, hy + 24, 0.36, t, 1, stroke, 3);
  rowBoat(ctx, 440 + px * 0.32, hy + 52, 0.62, t, 2, stroke, 4);
  rowBoat(ctx, 836 + px * 0.5, hy + 92, 0.96, t, 3, stroke, 4);
  // our own boat: the gunwale, a thwart, and the lantern with its hood down
  const gx = px * 1.1;
  ctx.fillStyle = '#020407';
  ctx.beginPath(); ctx.moveTo(X0, 1000); ctx.lineTo(X0, 610); ctx.quadraticCurveTo(640 + gx, 700, X0 + XW, 596); ctx.lineTo(X0 + XW, 1000); ctx.fill();
  ctx.strokeStyle = 'rgba(255,194,122,.25)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X0, 610); ctx.quadraticCurveTo(640 + gx, 700, X0 + XW, 596); ctx.stroke();
  const lx = 120 + gx;
  seg(ctx, lx, 640, lx, 468, '#020407', 7);
  ctx = S(1.1, 0.3 * flick(t, 4));
  glow(ctx, lx + 14, 446, 150, '#ffb860', 1);
  ctx = A();
  rect(ctx, lx - 22, 418, 44, 54, '#05080c'); poly(ctx, [[lx - 28, 418], [lx, 394], [lx + 28, 418]], '#05080c');
  rect(ctx, lx + 14, 430, 6, 30, rgba('#ffdc9a', 0.95)); poly(ctx, [[lx + 20, 430], [lx + 20, 460], [lx + 330, 560], [lx + 330, 470]], 'rgba(255,184,96,.06)');
}, (ctx, t, px) => {
  for (let i = 0; i < 7; i++) { const x = mod(rnd(i * 3) * 1900 + t * (8 + i * 2), 1900) - 300 + px; ctx.fillStyle = 'rgba(120,150,190,.05)'; ctx.beginPath(); ctx.ellipse(x, 350 + i * 44, 400, 26, 0, 0, TAU); ctx.fill(); }
});

// ───────────────────────── chapter 5: Tallis ─────────────────────────
// ── exchange-floor: the trading pits ──
const BOARD_ROWS = [['STILLSALT', 880, 14, 0], ['MARK', 96, 5, -1], ['LAPSE BOND', 38, 9, 1], ['RENEWAL', 61, 7, -1], ['LANE CARGO', 212, 11, 0], ['LAMP OIL', 47, 3, 0]];
def('exchange-floor', { amb: '#2a2216', rim: '#ffe6b4', key: 1 }, (ctx, t, px) => {
  ctx = S(0.2);
  fillAll(ctx, vgrad(ctx, -180, 500, [[0, '#1a140c'], [0.5, '#35281a'], [1, '#221a10']]));
  const bx = px * 0.15;
  // tall windows, morning in them
  for (const x0 of [-160, 110, 950, 1220]) {
    const x = x0 + bx;
    ctx.fillStyle = '#120d08'; ctx.beginPath(); ctx.moveTo(x - 10, 440); ctx.lineTo(x - 10, 130); ctx.arc(x + 80, 130, 90, Math.PI, 0); ctx.lineTo(x + 170, 440); ctx.fill();
    ctx.fillStyle = vgrad(ctx, 40, 430, [[0, '#fff6dc'], [1, '#e2c890']]); ctx.beginPath(); ctx.moveTo(x, 430); ctx.lineTo(x, 130); ctx.arc(x + 80, 130, 80, Math.PI, 0); ctx.lineTo(x + 160, 430); ctx.fill();
    for (let i = 1; i < 4; i++) rect(ctx, x + i * 40 - 2, 50, 4, 380, '#120d08');
    for (let i = 0; i < 5; i++) rect(ctx, x, 130 + i * 62, 160, 4, '#120d08');
    poly(ctx, [[x, 130], [x + 160, 130], [x + 160 - 420, 980], [x - 760, 980]], 'rgba(255,240,200,.05)');
    glow(ctx, x + 80, 240, 260, '#fff0c8', 0.12);
  }
  for (const x0 of [60, 330, 900, 1170]) { const x = x0 + bx; ctx.fillStyle = hgrad(ctx, x - 22, x + 22, [[0, '#2a2014'], [0.5, '#5a4830'], [1, '#2a2014']]); ctx.fillRect(x - 22, -180, 44, 640); rect(ctx, x - 28, 440, 56, 20, '#3a2c1c'); }
  // the board: every price in Aurelle, made here, and remade while you look
  const gx = 384 + px * 0.2, gy = 82, gw = 512, gh = 240;
  rect(ctx, gx - 12, gy - 12, gw + 24, gh + 24, '#8a6a2e'); rect(ctx, gx - 6, gy - 6, gw + 12, gh + 12, '#2a1e0c');
  ctx.fillStyle = vgrad(ctx, gy, gy + gh, [[0, '#141a18'], [1, '#0c100f']]); ctx.fillRect(gx, gy, gw, gh);
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(232,208,138,.9)'; ctx.font = `700 15px ${FONT_SERIF}`; ctx.fillText('TALLIS EXCHANGE', gx + 16, gy + 24);
  ctx.textAlign = 'right'; ctx.font = `600 11px ${FONT_MONO}`; ctx.fillStyle = 'rgba(232,208,138,.6)'; ctx.fillText('LAST          CHANGE', gx + gw - 18, gy + 23); ctx.textAlign = 'left';
  rect(ctx, gx + 12, gy + 32, gw - 24, 1.5, 'rgba(232,208,138,.5)');
  ctx = A();
  BOARD_ROWS.forEach(([name, base, range, trend], i) => {
    const y = gy + 62 + i * 31, tick = Math.floor(t / 1.9 + i * 0.37), v = base + trend * mod(tick, 9) + Math.floor(rnd(tick * 3.1 + i * 17) * range) - (range >> 1), prev = base + trend * mod(tick - 1, 9) + Math.floor(rnd((tick - 1) * 3.1 + i * 17) * range) - (range >> 1), d = v - prev;
    const fresh = mod(t / 1.9 + i * 0.37, 1) < 0.18;
    if (fresh) rect(ctx, gx + 250, y - 18, 250, 24, 'rgba(232,208,138,.12)');
    ctx.font = `600 17px ${FONT_SERIF}`; ctx.fillStyle = 'rgba(236,234,222,.86)'; ctx.fillText(name, gx + 18, y);
    ctx.font = `600 19px ${FONT_MONO}`; ctx.textAlign = 'right'; ctx.fillStyle = fresh ? '#fff6d6' : 'rgba(236,234,222,.86)'; ctx.fillText(String(v), gx + 384, y);
    ctx.fillStyle = d > 0 ? '#7fd09a' : d < 0 ? '#e0705a' : 'rgba(236,234,222,.5)'; ctx.fillText((d > 0 ? '+' : '') + d, gx + gw - 44, y); ctx.textAlign = 'left';
    if (d) poly(ctx, d > 0 ? [[gx + gw - 34, y - 2], [gx + gw - 20, y - 2], [gx + gw - 27, y - 14]] : [[gx + gw - 34, y - 13], [gx + gw - 20, y - 13], [gx + gw - 27, y - 1]], d > 0 ? '#7fd09a' : '#e0705a');
    for (let k = 0; k < 4; k++) rect(ctx, gx + 18 + rnd(i * 9 + k) * 200, y + 6, 20 + rnd(i + k * 5) * 40, 1, 'rgba(236,234,222,.07)'); // old chalk
  });
  // the board clerk on his gantry, with a rag and a stick of chalk
  { const cx = gx + 60 + (0.5 + 0.5 * Math.sin(t * 0.35)) * (gw - 120), cy = gy + gh + 2;
    rect(ctx, gx - 30, cy + 10, gw + 60, 6, '#3a2c1c'); for (let i = 0; i < 9; i++) rect(ctx, gx - 30 + i * ((gw + 56) / 8), cy + 16, 4, 30, '#3a2c1c');
    ctx.fillStyle = '#17110a'; ctx.beginPath(); ctx.arc(cx, cy - 22, 8, 0, TAU); ctx.fill(); rect(ctx, cx - 10, cy - 14, 20, 26, '#17110a'); seg(ctx, cx + 6, cy - 8, cx + 16, cy - 30 + Math.sin(t * 6) * 4, '#17110a', 5); }
  // the bell that makes the prices
  { const cx = 640 + px * 0.2, a = Math.sin(t * 1.1) * 0.07; ctx.save(); ctx.translate(cx, -30); ctx.rotate(a);
    seg(ctx, 0, 0, 0, 84, '#2a1e0c', 4);
    ctx.fillStyle = hgrad(ctx, -34, 34, [[0, '#6a4a16'], [0.35, '#f0d88c'], [1, '#6a4a16']]); ctx.beginPath(); ctx.moveTo(-14, 84); ctx.quadraticCurveTo(-18, 118, -36, 134); ctx.lineTo(36, 134); ctx.quadraticCurveTo(18, 118, 14, 84); ctx.fill();
    circ(ctx, Math.sin(t * 1.1 + 0.6) * 9, 138, 6, '#4a3410'); ctx.restore(); }
  // the gallery rail, and the pits below it
  ctx = S(0.45);
  ctx.fillStyle = vgrad(ctx, 470, 800, [[0, '#4a3a24'], [1, '#17100a']]); ctx.fillRect(X0, 470, XW, 520);
  for (let i = -14; i < 30; i++) seg(ctx, 640 + (i - 8) * 60 + px * 0.4, 470, 640 + (i - 8) * 210 + px, 980, 'rgba(0,0,0,.18)', 1.2);
  ctx = A();
  for (const [pxc, label, seed] of [[250, 'SALT', 401], [1030, 'BONDS', 409]]) {
    const cx = pxc + px * 0.45;
    // a standard so a runner can find the pit from across the floor
    seg(ctx, cx, 470, cx, 322, '#2a1e0c', 5); rect(ctx, cx - 50, 322, 100, 34, '#8a6a2e'); rect(ctx, cx - 46, 326, 92, 26, '#1a140c');
    ctx.fillStyle = '#e8d08a'; ctx.font = `700 17px ${FONT_SERIF}`; ctx.textAlign = 'center'; ctx.fillText(label, cx, 346); ctx.textAlign = 'left';
    crowdRow(ctx, seed, cx - 290, cx + 250, 404, 16, 13, '#1a140e', t, { fists: 0.5, hat: 0.5 });
    ctx.strokeStyle = '#b08a3e'; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(cx, 476, 300, 34, 0, Math.PI, 0); ctx.stroke();
    for (let i = 0; i <= 10; i++) { const a = Math.PI + (i / 10) * Math.PI; rect(ctx, cx + Math.cos(a) * 300 - 2, 476 + Math.sin(a) * 34, 4, 30, '#8a6a2e'); }
    crowdRow(ctx, seed + 2, cx - 320, cx + 280, 432, 13, 20, '#120d08', t, { fists: 0.55, hat: 0.4 });
    for (let i = 0; i < 9; i++) { // slips held up, to be seen across the pit
      const x = cx - 280 + rnd(seed + i * 3) * 540, up = Math.sin(t * (2.4 + rnd(i)) + i * 2.1);
      if (up > 0) rect(ctx, x, 370 - up * 16, 8, 11, 'rgba(244,238,220,.85)');
    }
  }
}, (ctx, t, px) => {
  // the day's slips, coming down
  for (let i = 0; i < 46; i++) {
    const d = rnd(i * 1.7), x = mod(rnd(i * 3.3) * 1700 + Math.sin(t * (0.8 + d) + i) * 50, 1700) - 200 + px, y = mod(rnd(i * 7.7) * 760 + t * (36 + d * 50), 760) - 40, a = t * (2 + d * 3) + i;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = `rgba(246,240,222,${0.35 + d * 0.4})`; ctx.fillRect(-5 - d * 4, -(2 + d * 2) * Math.abs(Math.cos(a * 0.7)) - 0.5, 10 + d * 8, (4 + d * 4) * Math.abs(Math.cos(a * 0.7)) + 1); ctx.restore();
  }
  motes(ctx, 411, 40, '#fff0c8', t, { x0: -60 + px, x1: 1340 + px, y0: 80, y1: 560, vx: 4, vy: 5, r: 1.3, a: 0.3, tw: 1, wob: 16 });
});

// ── exchange-steps: the steps of the Exchange, and the city in the street below them ──
def('exchange-steps', { amb: '#363240', rim: '#ffd8b0', key: -1 }, (ctx, t, px) => {
  ctx = S(0);
  fillAll(ctx, vgrad(ctx, -180, 470, [[0, '#2c3450'], [0.5, '#7a7488'], [0.85, '#d8a888'], [1, '#f0c898']]));
  ctx = A();
  for (let i = 0; i < 10; i++) {
    const x = mod(rnd(i * 3) * 1900 + t * (4 + rnd(i) * 4), 1900) - 300 + px * 0.05, y = 40 + rnd(i * 7) * 300;
    ctx.fillStyle = `rgba(52,52,80,${0.25 + rnd(i * 5) * 0.2})`; ctx.beginPath(); ctx.ellipse(x, y, 170 + rnd(i * 2) * 220, 12 + rnd(i * 9) * 18, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,190,140,.2)'; ctx.beginPath(); ctx.ellipse(x - 8, y + 9, 150 + rnd(i * 2) * 200, 4, 0, 0, TAU); ctx.fill();
  }
  // the city going down to the harbour; the Mint hall with its doors bolted
  const cx0 = px * 0.1;
  ctx = S(0.12);
  skyline(ctx, 421, X0 + cx0, 620, 452, 30, 150, 26, 70, '#4a4660', '#ffd898', t);
  { const dx = 130 + cx0; rect(ctx, dx - 70, 330, 140, 124, '#3a3650'); ctx.fillStyle = '#3a3650'; ctx.beginPath(); ctx.arc(dx, 330, 54, Math.PI, 0); ctx.fill(); rect(ctx, dx - 3, 250, 6, 30, '#3a3650'); for (let i = 0; i < 6; i++) rect(ctx, dx - 56 + i * 21, 350, 9, 60, '#2a2640'); rect(ctx, dx - 16, 400, 32, 54, '#1c1a2c'); }
  skyline(ctx, 423, X0 + px * 0.16, 560, 462, 60, 210, 50, 110, '#2e2c40', '#ffd898', t);
  // the street, full: a run is everyone watching everyone else's feet
  ctx = A();
  const fl = Math.sin(t * 0.25);
  crowdRow(ctx, 425, X0 + px * 0.25, 520 + px * 0.25, 428, 44, 7, '#262436', t, { bob: 0.5 });
  crowdRow(ctx, 427, X0 + px * 0.32, 500 + px * 0.32, 440, 30, 11, '#201e2e', t, { bob: 0.6, hat: 0.4, signs: 0.06, signCol: '#d8ccb0', signInk: '#2a2030' });
  crowdRow(ctx, 429, X0 + px * 0.4, 470 + px * 0.4, 458, 20, 17, '#191724', t, { bob: 0.6, hat: 0.4, torch: fl > 2 ? 0.1 : 0 });
  // the Exchange: its porch, its columns, its doors
  ctx = S(0.35);
  const ex = px * 0.35;
  rect(ctx, 470 + ex, -180, 1200, 660, '#1e1b26');
  ctx.fillStyle = vgrad(ctx, 150, 480, [[0, '#14121a'], [1, '#2a2630']]); ctx.fillRect(520 + ex, 140, 1100, 340);
  { const dx = 900 + ex; // the bronze doors
    ctx.fillStyle = hgrad(ctx, dx - 110, dx + 110, [[0, '#3a2c1a'], [0.5, '#6a5230'], [1, '#3a2c1a']]); ctx.fillRect(dx - 110, 190, 220, 290);
    rect(ctx, dx - 2, 190, 4, 290, '#1c140a');
    for (let r = 0; r < 4; r++) for (const s of [-1, 1]) { ctx.strokeStyle = 'rgba(232,208,138,.35)'; ctx.lineWidth = 1.5; ctx.strokeRect(dx + (s < 0 ? -98 : 12), 204 + r * 68, 86, 54); circ(ctx, dx + s * 55, 231 + r * 68, 5, 'rgba(232,208,138,.4)'); }
    rect(ctx, dx - 124, 176, 248, 16, '#4a4450'); }
  for (let i = 0; i < 6; i++) {
    const x = 540 + i * 186 + ex, w = 66;
    ctx.fillStyle = hgrad(ctx, x - w / 2, x + w / 2, [[0, '#e4d2bc'], [0.25, '#b8a898'], [0.8, '#6a6270'], [1, '#4a4654']]); ctx.fillRect(x - w / 2, 128, w, 352);
    for (let k = 1; k < 6; k++) rect(ctx, x - w / 2 + k * (w / 6), 134, 1.5, 340, 'rgba(30,26,40,.22)');
    rect(ctx, x - w / 2 - 9, 112, w + 18, 18, '#a89a8c'); rect(ctx, x - w / 2 - 5, 104, w + 10, 10, '#c8b8a4');
    rect(ctx, x - w / 2 - 8, 466, w + 16, 16, '#8a7e78');
  }
  ctx.fillStyle = vgrad(ctx, 30, 106, [[0, '#8a7e7c'], [1, '#b0a294']]); ctx.fillRect(470 + ex, 40, 1200, 66);
  rect(ctx, 460 + ex, 30, 1220, 12, '#c8b8a4');
  ctx.fillStyle = 'rgba(42,36,48,.75)'; ctx.font = `700 21px ${FONT_SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('T H E   E X C H A N G E   O F   T A L L I S', 930 + ex, 100); ctx.textAlign = 'left';
  poly(ctx, [[470 + ex, 30], [470 + ex, -180], [440 + ex, -180], [440 + ex, 40]], '#5a5260');
  // the opening bell, in the porch
  ctx = A();
  { const bx = 714 + ex, a = Math.sin(t * 1.3) * 0.1; ctx.save(); ctx.translate(bx, 140); ctx.rotate(a); seg(ctx, 0, 0, 0, 30, '#1c140a', 3);
    ctx.fillStyle = hgrad(ctx, -22, 22, [[0, '#6a4a16'], [0.35, '#f0d88c'], [1, '#6a4a16']]); ctx.beginPath(); ctx.moveTo(-9, 30); ctx.quadraticCurveTo(-12, 52, -24, 62); ctx.lineTo(24, 62); ctx.quadraticCurveTo(12, 52, 9, 30); ctx.fill(); circ(ctx, Math.sin(t * 1.3 + 0.6) * 6, 65, 4, '#4a3410'); ctx.restore(); }
  // pigeons along the cornice, and one that will not settle
  for (let i = 0; i < 9; i++) { const x = 520 + i * 96 + rnd(i * 3) * 50 + ex; ctx.fillStyle = '#3a3644'; ctx.beginPath(); ctx.ellipse(x, 24, 7, 5, 0, 0, TAU); ctx.fill(); circ(ctx, x + 5 * (i % 2 ? 1 : -1), 19 + (Math.sin(t * 2 + i * 3) > 0.9 ? 2 : 0), 3, '#3a3644'); }
  { const ph = mod(t * 0.13, 1), x = 560 + ex + ph * 700, y = 80 + Math.sin(ph * 9) * 40, fl2 = Math.sin(t * 16) * 7; ctx.strokeStyle = '#2a2634'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x - 9, y - fl2); ctx.quadraticCurveTo(x - 3, y - 2, x, y); ctx.quadraticCurveTo(x + 3, y - 2, x + 9, y - fl2); ctx.stroke(); }
  // the steps
  ctx = S(0.6);
  const sx = px * 0.6;
  for (let i = 0; i < 8; i++) {
    const y = 480 + i * 30 + i * i * 2.4, h = 30 + i * 4.8, x0 = 360 - i * 46 + sx;
    ctx.fillStyle = vgrad(ctx, y, y + h, [[0, css(mix('#c4b4a0', '#4a4450', i / 9))], [0.4, css(mix('#8e8280', '#2e2a36', i / 9))], [1, css(mix('#5a525a', '#1c1a24', i / 9))]]);
    ctx.fillRect(x0, y, 1700, h + 1); rect(ctx, x0, y, 1700, 2, 'rgba(255,226,190,.3)');
    poly(ctx, [[x0, y], [x0, y + h + 1], [x0 - 40, y + h + 1]], '#2a2630');
  }
  ctx.fillStyle = vgrad(ctx, 470, 800, [[0, '#3a3644'], [1, '#12101a']]); ctx.beginPath(); ctx.moveTo(X0, 470); ctx.lineTo(360 + sx, 470); ctx.lineTo(-10 + sx, 800); ctx.lineTo(X0, 1000); ctx.fill();
  // lamp standards at the foot of the porch
  ctx = A();
  for (const lx0 of [430, 1250]) { const lx = lx0 + px * 0.5; rect(ctx, lx - 16, 440, 32, 44, '#5a525a'); seg(ctx, lx, 440, lx, 250, '#1c1a24', 6); seg(ctx, lx - 20, 262, lx + 20, 262, '#1c1a24', 4);
    for (const s of [-1, 1]) { glow(ctx, lx + s * 20, 250, 50, '#ffd898', 0.3 * flick(t, lx0 + s)); circ(ctx, lx + s * 20, 250, 9, rgba('#ffe8b8', 0.9)); } }
}, (ctx, t, px) => {
  for (let i = 0; i < 26; i++) { // the extra page, loose in the street
    const d = rnd(i * 1.7), x = mod(rnd(i * 3.3) * 1800 + t * (50 + d * 90), 1800) - 260 + px, y = 430 + rnd(i * 7.7) * 300 + Math.sin(t * (1.5 + d) + i) * 16, a = t * (1.5 + d * 3) + i;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.fillStyle = `rgba(244,236,220,${0.3 + d * 0.4})`; ctx.fillRect(-7, -4.5 * Math.abs(Math.cos(a * 0.6)) - 0.5, 14, 9 * Math.abs(Math.cos(a * 0.6)) + 1); ctx.restore();
  }
});

// ── corvane-study: one window, one table, and all of Aurelle on it in brass ──
const DARK_ISLANDS = new Set([2, 7, 9, 13, 18, 24, 26, 31, 33, 36, 39]);   // eleven of forty: twenty-nine lit
if (DARK_ISLANDS.size !== 11) throw new Error(`cinema: the model shows ${40 - DARK_ISLANDS.size} lit islands; the bible says twenty-nine`);
def('corvane-study', { amb: '#16121a', rim: '#cfdcf0', key: 1 }, (ctx, t, px) => {
  ctx = S(0.2);
  fillAll(ctx, vgrad(ctx, -180, 800, [[0, '#0c080c'], [0.5, '#22161a'], [1, '#0a0707']]));
  for (let i = -1; i < 9; i++) { const x = -230 + i * 230 + px * 0.2; ctx.fillStyle = 'rgba(0,0,0,.07)'; ctx.fillRect(x + 16, 30, 198, 420); ctx.fillStyle = 'rgba(90,40,46,.1)'; ctx.fillRect(x + 28, 42, 174, 396); }
  rect(ctx, X0, 470, XW, 6, '#3a2610');
  // the one window: rain, the roofs of Tallis, and a customs shed where Ropewalk would be
  ctx = A();
  const wx = 960 + px * 0.25;
  ctx.save();
  ctx.beginPath(); ctx.rect(wx, 60, 240, 390); ctx.clip();
  ctx.fillStyle = vgrad(ctx, 60, 450, [[0, '#59647a'], [1, '#a4a8ac']]); ctx.fillRect(wx, 60, 240, 390);
  skyline(ctx, 431, wx - 20 - px * 0.1, wx + 260, 360, 20, 90, 18, 44, '#4c5668', '#ffd898', t);
  rect(ctx, wx, 360, 240, 90, '#3a4252');
  poly(ctx, [[wx - 10 - px * 0.16, 450], [wx - 10 - px * 0.16, 330], [wx + 90 - px * 0.16, 290], [wx + 200 - px * 0.16, 330], [wx + 200 - px * 0.16, 450]], '#232a38'); // the shed
  for (let i = 0; i < 6; i++) rect(ctx, wx + 6 + i * 32 - px * 0.16, 352, 16, 30, '#1a202c');
  for (let i = 0; i < 40; i++) { // rain on the glass: it gathers, then runs
    const x = wx + rnd(i * 3.3) * 240, ph = mod(t * (0.07 + rnd(i) * 0.1) + rnd(i * 7), 1), y = 60 + Math.pow(ph, 2.2) * 420;
    rect(ctx, x + Math.sin(y * 0.05 + i) * 2, y - 16 * ph, 1.5, 6 + 16 * ph, 'rgba(232,238,246,.35)'); circ(ctx, x + Math.sin(y * 0.05 + i) * 2, y, 2, 'rgba(240,244,250,.5)');
  }
  ctx.restore();
  ctx.strokeStyle = '#150c08'; ctx.lineWidth = 9; ctx.strokeRect(wx, 60, 240, 390); seg(ctx, wx + 120, 60, wx + 120, 450, '#150c08', 6); seg(ctx, wx, 220, wx + 240, 220, '#150c08', 6);
  rect(ctx, wx - 14, 450, 268, 12, '#2a1a10');
  { const x = wx - 66; ctx.fillStyle = hgrad(ctx, x, x + 70, [[0, '#2a0c12'], [0.4, '#5a1c26'], [0.7, '#2a0c12'], [1, '#48161e']]); ctx.beginPath(); ctx.moveTo(x, 34); ctx.lineTo(x + 70, 34); ctx.quadraticCurveTo(x + 60 + Math.sin(t * 0.5) * 3, 300, x + 78, 600); ctx.lineTo(x - 10, 600); ctx.quadraticCurveTo(x + 8, 300, x, 34); ctx.fill(); }
  poly(ctx, [[wx, 60], [wx + 240, 60], [wx - 240, 980], [wx - 1000, 980]], 'rgba(200,214,236,.055)');
  ctx = S(0.25);
  glow(ctx, wx + 120, 250, 320, '#b8c8e0', 0.14);
  ctx = A();
  // a long-case clock, and the one chair
  { const kx = 96 + px * 0.2; rect(ctx, kx - 34, 80, 68, 400, '#150c08'); rect(ctx, kx - 28, 86, 56, 388, '#24140c'); circ(ctx, kx, 128, 24, '#e6e0cc'); seg(ctx, kx, 128, kx + Math.sin(t * 0.105) * 18, 128 - Math.cos(t * 0.105) * 18, '#14100c', 1.6); seg(ctx, kx, 128, kx + 10, 128 + 6, '#14100c', 2.4);
    const a = Math.sin(t * Math.PI * 0.8) * 0.12; seg(ctx, kx, 170, kx + Math.sin(a) * 200, 170 + Math.cos(a) * 200, '#c9a85a', 2); circ(ctx, kx + Math.sin(a) * 200, 170 + Math.cos(a) * 200, 15, '#d8b866'); }
  // the table
  ctx = S(0.425);
  const tx = px * 0.5, ty = 462;
  ctx.fillStyle = vgrad(ctx, ty, 800, [[0, '#3a1e12'], [0.1, '#20100a'], [1, '#080403']]); ctx.fillRect(110 + tx, ty, 950, 400);
  rect(ctx, 100 + tx, ty - 6, 970, 8, '#6a3a1e'); rect(ctx, 100 + tx, ty + 2, 970, 2, '#8a6a2e');
  ctx.fillStyle = '#0c1620'; ctx.beginPath(); ctx.ellipse(585 + tx, ty - 8, 470, 15, 0, 0, TAU); ctx.fill();   // a slate sea
  ctx.strokeStyle = 'rgba(160,200,236,.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(585 + tx, ty - 8, 470, 15, 0, 0, TAU); ctx.stroke();
  // forty islands on brass stems, a lamp on each. Twenty-nine burn.
  const isl = [];
  for (let i = 0; i < 40; i++) {
    const c = i % 10, r = Math.floor(i / 10);
    isl.push({ i, r, x: 172 + c * 90 + (r % 2) * 42 + (rnd(i * 3.1) - 0.5) * 34 + tx * 0.85, y: 420 - r * 50 - rnd(i * 5.7) * 26, lit: !DARK_ISLANDS.has(i) });
  }
  ctx.lineWidth = 1.2;
  for (const a of isl) for (const b of isl) { // a lane: a wire between two lit neighbours. A dark one has none.
    if (b.i <= a.i || !a.lit || !b.lit) continue;
    const dc = Math.abs((a.i % 10) - (b.i % 10)), dr = Math.abs(a.r - b.r);
    if ((dr === 0 && dc === 1) || (dr === 1 && dc === 0)) { ctx.strokeStyle = 'rgba(150,206,246,.3)'; ctx.beginPath(); ctx.moveTo(a.x, a.y - 3); ctx.lineTo(b.x, b.y - 3); ctx.stroke(); }
  }
  for (const o of isl.slice().sort((a, b) => b.r - a.r)) {
    const s = 1 - o.r * 0.1;
    seg(ctx, o.x, ty - 8, o.x, o.y, o.lit ? '#a8842e' : '#4a3a1c', 2.2 * s); seg(ctx, o.x - 0.6, ty - 8, o.x - 0.6, o.y, 'rgba(244,224,160,.35)', 0.8);
    if (o.lit) { ctx.fillStyle = 'rgba(150,206,246,.12)'; ctx.beginPath(); ctx.ellipse(o.x, o.y - 2, 40 * s, 9 * s, 0, 0, TAU); ctx.fill(); } // the calm it keeps
    ctx.fillStyle = o.lit ? '#c9a85a' : '#5a4a2a'; ctx.beginPath(); ctx.ellipse(o.x, o.y, 15 * s, 4.5 * s, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = o.lit ? '#6a4e22' : '#2e2616'; ctx.beginPath(); ctx.moveTo(o.x - 11 * s, o.y - 1); ctx.quadraticCurveTo(o.x - 4 * s, o.y - (8 + rnd(o.i) * 6) * s, o.x + 3 * s, o.y - 5 * s); ctx.quadraticCurveTo(o.x + 8 * s, o.y - 3 * s, o.x + 11 * s, o.y - 1); ctx.fill();
    rect(ctx, o.x + 3 * s, o.y - 12 * s, 3 * s, 8 * s, o.lit ? '#e0c47a' : '#3a2e18');
    if (!o.lit) circ(ctx, o.x + 4.5 * s, o.y - 12.5 * s, 1.6 * s, '#0a0806');
  }
  ctx = A();
  for (const o of isl) {
    if (!o.lit) continue;
    const s = 1 - o.r * 0.1;
    glow(ctx, o.x + 4.5 * s, o.y - 15 * s, 24 * s, '#8fd4ff', 0.55 + 0.1 * Math.sin(t * 3 + o.i)); coldFlame(ctx, o.x + 4.5 * s, o.y - 12 * s, 5.2 * s, t, o.i);
  }
}, (ctx, t, px) => {
  motes(ctx, 433, 30, '#dfe8f6', t, { x0: 300 + px, x1: 1200 + px, y0: 60, y1: 560, vx: -3, vy: 4, r: 1.2, a: 0.28, tw: 1, wob: 14 });
});

// ── commons-queue: a line of people outside a savings hall at dawn, and the ledger open on a table in the street ──
def('commons-queue', { amb: '#383038', rim: '#ffd6a0', key: -1 }, (ctx, t, px) => {
  ctx = S(0);
  fillAll(ctx, vgrad(ctx, -180, 452, [[0, '#232a4a'], [0.5, '#6a5a78'], [0.82, '#e0a080'], [1, '#ffd8a0']]));
  ctx = A();
  stars(ctx, 441, 30, 140, t);
  ctx = S(0.05);
  glow(ctx, 330 + px * 0.05, 450, 460, '#ffe0a8', 0.45);
  ctx = A();
  for (let i = 0; i < 7; i++) { const x = mod(rnd(i * 3) * 1800 + t * 3, 1800) - 260 + px * 0.06, y = 230 + rnd(i * 7) * 170; ctx.fillStyle = 'rgba(70,50,90,.4)'; ctx.beginPath(); ctx.ellipse(x, y, 120 + rnd(i) * 160, 8 + rnd(i * 9) * 8, 0, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,170,120,.4)'; ctx.beginPath(); ctx.ellipse(x - 6, y + 7, 110 + rnd(i) * 140, 3.5, 0, 0, TAU); ctx.fill(); }
  // the end of the street: the rope-shed, masts, the harbour
  const fx = px * 0.1;
  skyline(ctx, 443, 180 + fx, 760, 452, 20, 110, 24, 60, '#5a4660', null, t);
  for (let i = 0; i < 6; i++) { const x = 260 + i * 44 + rnd(i) * 20 + fx; seg(ctx, x, 452, x, 330 + rnd(i * 3) * 50, '#4a3a54', 2); seg(ctx, x - 12, 380 + rnd(i * 5) * 30, x + 12, 380 + rnd(i * 5) * 30, '#4a3a54', 1.5); }
  for (let i = 0; i < 5; i++) { const ph = mod(t * 0.05 + i / 5, 1); ctx.fillStyle = `rgba(250,220,200,${0.2 * (1 - ph)})`; ctx.beginPath(); ctx.ellipse(520 + fx + ph * 60, 340 - ph * 120, 8 + ph * 30, 6 + ph * 16, 0, 0, TAU); ctx.fill(); }
  // warehouses down the left side, shuttered
  ctx = S(0.33);
  const lx = px * 0.3;
  for (const [x0, w, top] of [[-260, 300, 70], [40, 220, 150]]) {
    const x = x0 + lx;
    ctx.fillStyle = hgrad(ctx, x, x + w, [[0, '#2a2030'], [1, '#3e2e3a']]); ctx.fillRect(x, top, w, 410);
    for (let r = 0; r < 14; r++) rect(ctx, x, top + 12 + r * 28, w, 1.5, 'rgba(0,0,0,.16)');
    for (let r = 0; r < 3; r++) for (let c = 0; c < Math.floor(w / 90); c++) { rect(ctx, x + 26 + c * 90, top + 40 + r * 110, 42, 62, '#1a1420'); seg(ctx, x + 47 + c * 90, top + 40 + r * 110, x + 47 + c * 90, top + 102 + r * 110, '#2e2434', 2); }
    rect(ctx, x + w - 6, top, 6, 410, 'rgba(255,214,160,.25)');
    seg(ctx, x + w * 0.5, top, x + w * 0.5 + 40, top - 20, '#1a1420', 5);
  }
  // places chalked on the wall, so nobody need stand to keep one
  { const x = 70 + lx; ctx.strokeStyle = 'rgba(244,240,228,.8)'; ctx.fillStyle = 'rgba(244,240,228,.85)'; ctx.font = `600 15px ${FONT_SERIF}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    for (let i = 0; i < 12; i++) { const yy = 196 + (i % 6) * 34, xx = x + Math.floor(i / 6) * 96; ctx.fillText(String(41 + i), xx, yy); ctx.lineWidth = 2; chalkLine(ctx, xx + 26, yy - 5, 30 + rnd(i * 3) * 30, i + 60); if (rnd(i * 7) < 0.4) seg(ctx, xx - 4, yy - 6, xx + 62, yy - 4, 'rgba(244,240,228,.7)', 1.6); } }
  // the savings hall
  const hx = 820 + px * 0.35;
  ctx.fillStyle = hgrad(ctx, hx, hx + 760, [[0, '#59404a'], [1, '#3a2a36']]); ctx.fillRect(hx, 20, 760, 462);
  for (let r = 0; r < 16; r++) rect(ctx, hx, 34 + r * 28, 760, 1.5, 'rgba(0,0,0,.14)');
  rect(ctx, hx, 20, 8, 462, 'rgba(255,214,160,.3)');
  rect(ctx, hx + 60, 150, 440, 50, '#16301f'); ctx.strokeStyle = '#c9a85a'; ctx.lineWidth = 2; ctx.strokeRect(hx + 64, 154, 432, 42);
  ctx.fillStyle = '#e8d08a'; ctx.font = `700 21px ${FONT_SERIF}`; ctx.textAlign = 'center'; ctx.fillText('COMPACT  SAVINGS  HALL', hx + 280, 183); ctx.textAlign = 'left';
  ctx = A();
  { const dx = hx + 170; // the door: open, and lit, and paying
    ctx.fillStyle = vgrad(ctx, 230, 482, [[0, '#ffe2a8'], [1, '#d88a48']]); ctx.beginPath(); ctx.moveTo(dx - 62, 482); ctx.lineTo(dx - 62, 280); ctx.arc(dx, 280, 62, Math.PI, 0); ctx.lineTo(dx + 62, 482); ctx.fill();
    ctx = S(0.33, 0.3 * flick(t, 2) + 0.1);
    glow(ctx, dx, 380, 240, '#ffc070', 1);
    ctx = A();
    ctx.strokeStyle = '#1e1420'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(dx - 62, 482); ctx.lineTo(dx - 62, 280); ctx.arc(dx, 280, 62, Math.PI, 0); ctx.lineTo(dx + 62, 482); ctx.stroke();
    crowdRow(ctx, 445, dx - 50, dx + 50, 400, 3, 15, '#3a1c10', t, { bob: 0.3 }); }
  for (const wx of [330, 470]) { const x = hx + wx; rect(ctx, x - 8, 250, 96, 150, '#1e1420'); ctx.fillStyle = vgrad(ctx, 258, 392, [[0, '#ffdc9a'], [1, '#c8783a']]); ctx.fillRect(x, 258, 80, 134); rect(ctx, x + 38, 258, 4, 134, '#1e1420'); rect(ctx, x, 322, 80, 4, '#1e1420'); }
  { const bxr = hx + 40; seg(ctx, bxr, 86, bxr - 70, 86, '#1e1420', 5); // the Commons' two rings, hung out over the street
    const sw = Math.sin(t * 0.8) * 4; ctx.fillStyle = '#7a2a1c'; ctx.beginPath(); ctx.moveTo(bxr - 66, 90); ctx.lineTo(bxr - 8, 90); ctx.lineTo(bxr - 8 + sw, 190); ctx.lineTo(bxr - 37 + sw, 174); ctx.lineTo(bxr - 66 + sw, 190); ctx.fill();
    ctx.strokeStyle = '#e8d08a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(bxr - 44 + sw * 0.4, 128, 13, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(bxr - 30 + sw * 0.4, 128, 13, 0, TAU); ctx.stroke(); }
  // the street
  ctx = S(0.45);
  ctx.fillStyle = vgrad(ctx, 452, 800, [[0, '#8a6a68'], [0.2, '#4a3a48'], [1, '#15101a']]); ctx.fillRect(X0, 452, XW, 540);
  ctx.fillStyle = hgrad(ctx, 150, 560, [[0, 'rgba(255,214,160,0)'], [0.5, 'rgba(255,214,160,.3)'], [1, 'rgba(255,214,160,0)']]); ctx.fillRect(150 + px * 0.3, 454, 410, 180);
  for (let i = 0; i < 80; i++) { const d = rnd(i * 1.9), x = X0 + rnd(i * 3.7) * XW + px * (0.4 + d * 0.5), y = 462 + d * d * 300; ctx.fillStyle = `rgba(255,220,190,${0.04 + d * 0.06})`; ctx.beginPath(); ctx.ellipse(x, y, 10 + d * 22, 2 + d * 4, 0, 0, TAU); ctx.fill(); }
  // three hundred people, and not one of them talking: the line, from the door back down the street
  ctx = A();
  const qx = px * 0.4;
  crowdRow(ctx, 447, 300 + qx * 0.6, 470 + qx * 0.6, 430, 22, 5, '#3a2e40', t, { bob: 0.2 });
  crowdRow(ctx, 449, 150 + qx * 0.8, 470 + qx * 0.8, 437, 20, 9, '#2c2234', t, { bob: 0.2, hat: 0.4 });
  crowdRow(ctx, 451, -260 + qx, 380 + qx, 448, 22, 15, '#211a28', t, { bob: 0.2, hat: 0.4 });
  crowdRow(ctx, 453, 780 + qx, 960 + qx, 436, 5, 17, '#211a28', t, { bob: 0.2, hat: 0.4 });
  for (let i = 0; i < 9; i++) { // their breath, in the cold
    const x = -200 + i * 68 + rnd(i * 3) * 30 + qx, ph = mod(t * 0.3 + rnd(i * 7), 1);
    ctx.fillStyle = `rgba(255,236,220,${0.2 * Math.sin(ph * Math.PI)})`; ctx.beginPath(); ctx.ellipse(x + ph * 16, 440 - ph * 22, 5 + ph * 12, 4 + ph * 7, 0, 0, TAU); ctx.fill();
  }
  // the table in the street, and the book open on it for anyone to read
  ctx = S(0.5);
  const tx = 640 + px * 0.5, ty = 432;
  seg(ctx, tx - 130, ty + 4, tx - 150, 500, '#2a1c14', 6); seg(ctx, tx - 110, ty + 4, tx - 90, 500, '#2a1c14', 6); seg(ctx, tx + 130, ty + 4, tx + 150, 500, '#2a1c14', 6); seg(ctx, tx + 110, ty + 4, tx + 90, 500, '#2a1c14', 6);
  ctx.fillStyle = vgrad(ctx, ty, ty + 14, [[0, '#8a6238'], [1, '#4a3018']]); ctx.fillRect(tx - 160, ty, 320, 14); rect(ctx, tx - 160, ty, 320, 2.5, 'rgba(255,224,170,.6)');
  poly(ctx, [[tx - 120, ty], [tx + 120, ty], [tx + 104, ty - 16], [tx - 104, ty - 16]], '#3a2616');   // the slope it is propped on
  for (const s of [-1, 1]) {
    poly(ctx, [[tx, ty - 12], [tx + s * 112, ty - 16], [tx + s * 96, ty - 88], [tx, ty - 80]], s < 0 ? '#efe4c6' : '#e0d3b0');
    for (let r = 0; r < 8; r++) seg(ctx, tx + s * 10, ty - 22 - r * 7.4, tx + s * (100 - r * 1.7), ty - 25 - r * 7.6, 'rgba(50,34,40,.6)', 1.2);
    seg(ctx, tx + s * 76, ty - 15, tx + s * 66, ty - 84, 'rgba(150,40,40,.6)', 1); seg(ctx, tx + s * 84, ty - 15, tx + s * 74, ty - 85, 'rgba(150,40,40,.6)', 1);
  }
  seg(ctx, tx, ty - 12, tx, ty - 80, '#7a2a22', 2.5);
  ctx.strokeStyle = '#3b1813'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(tx - 112, ty - 16); ctx.lineTo(tx - 96, ty - 88); ctx.lineTo(tx, ty - 80); ctx.lineTo(tx + 96, ty - 88); ctx.lineTo(tx + 112, ty - 16); ctx.stroke();
  ctx = A();
  lantern(ctx, tx + 142, ty - 62, 11, '#ffd9a0', t, 9); seg(ctx, tx + 142, ty, tx + 142, ty - 62, '#2a1c14', 3);
  // two reading it: a finger going down a column
  for (const [dx, s] of [[-176, 21], [182, 19]]) { const x = tx + dx, y = ty - 62, lean = dx < 0 ? 1 : -1, nod = Math.sin(t * 0.7 + dx) * 1.5;
    ctx.fillStyle = '#1a1220'; ctx.beginPath(); ctx.arc(x + lean * 12, y + nod, s * 0.44, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(x, y + s * 1.4, s * 0.9, s * 0.9, 0, 0, TAU); ctx.fill(); ctx.fillRect(x - s * 0.9, y + s * 1.4, s * 1.8, s * 4);
    seg(ctx, x + lean * s * 0.7, y + s * 1.2, x + lean * (s * 2.6), y + s * 1.5 + Math.sin(t * 0.4 + dx) * 8, '#1a1220', s * 0.3); }
}, (ctx, t, px) => {
  for (let i = 0; i < 6; i++) { const x = mod(rnd(i * 3) * 1900 + t * 10, 1900) - 300 + px; ctx.fillStyle = 'rgba(255,226,200,.05)'; ctx.beginPath(); ctx.ellipse(x, 440 + i * 40, 360, 26, 0, 0, TAU); ctx.fill(); }
});

// ── clearing-house: vault doors, sorting tables, night ──
/** part 'door' leaves the wheel off, part 'wheel' paints only the wheel; neither paints both */
function vaultDoor(ctx, x, y, r, label, a, part) {
  if (part === 'wheel') {
    for (let i = 0; i < 5; i++) { const an = a + i * (TAU / 5); seg(ctx, x, y, x + Math.cos(an) * r * 0.42, y + Math.sin(an) * r * 0.42, '#8a96a8', r * 0.04); circ(ctx, x + Math.cos(an) * r * 0.42, y + Math.sin(an) * r * 0.42, r * 0.05, '#aab4c4'); }
    circ(ctx, x, y, r * 0.11, '#aab4c4');
    return;
  }
  rect(ctx, x - r - 34, y - r - 40, r * 2 + 68, r * 2 + 90, '#0e1219');
  glow(ctx, x, y, r * 1.7, '#3a5a9a', 0.14);
  { const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r); g.addColorStop(0, '#5c6778'); g.addColorStop(1, '#1a202c'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = '#090c12'; ctx.lineWidth = 4; for (const k of [1, 0.8, 0.5]) { ctx.beginPath(); ctx.arc(x, y, r * k, 0, TAU); ctx.stroke(); }
  for (let i = 0; i < 16; i++) circ(ctx, x + Math.cos(i * 0.3927) * r * 0.9, y + Math.sin(i * 0.3927) * r * 0.9, r * 0.032, '#090c12');
  if (part !== 'door') {
    for (let i = 0; i < 5; i++) { const an = a + i * (TAU / 5); seg(ctx, x, y, x + Math.cos(an) * r * 0.42, y + Math.sin(an) * r * 0.42, '#8a96a8', r * 0.04); circ(ctx, x + Math.cos(an) * r * 0.42, y + Math.sin(an) * r * 0.42, r * 0.05, '#aab4c4'); }
    circ(ctx, x, y, r * 0.11, '#aab4c4');
  }
  rect(ctx, x - 20, y - r - 30, 40, 20, '#8a6a2e'); ctx.fillStyle = '#1a140c'; ctx.font = `700 14px ${FONT_SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(label, x, y - r - 15); ctx.textAlign = 'left';
}
def('clearing-house', { amb: '#0e1218', rim: '#ffdca4', key: -1 }, (ctx, t, px) => {
  ctx = S(0.15);
  fillAll(ctx, vgrad(ctx, -180, 800, [[0, '#04060a'], [0.5, '#111620'], [1, '#05070a']]));
  // not yet light, in the roof
  for (let i = 0; i < 5; i++) { const x = -160 + i * 330 + px * 0.5; poly(ctx, [[x, -180], [x + 190, -180], [x + 160, 84], [x + 30, 84]], '#16223a'); for (let k = 1; k < 4; k++) seg(ctx, x + k * 47, -180, x + 30 + k * 32, 84, '#070a10', 2.5); seg(ctx, x + 14, -40, x + 176, -40, '#070a10', 2.5); }
  rect(ctx, X0, 84, XW, 10, '#070a10');
  const bx = px * 0.15;
  vaultDoor(ctx, 250 + bx, 300, 150, 'I', 0, 'door');
  vaultDoor(ctx, 1030 + bx, 300, 150, 'II', 0.6);
  ctx = A();
  vaultDoor(ctx, 250 + bx, 300, 150, 'I', Math.sin(t * 0.17) * 0.2, 'wheel');
  // the tube wall: every counting-house in Aurelle is on the other end of one of these
  const wx = 640 + px * 0.2;
  rect(ctx, wx - 150, 100, 300, 380, '#0c1017');
  for (let i = 0; i < 12; i++) {
    const x = wx - 132 + i * 24, going = i === 7;
    ctx.fillStyle = hgrad(ctx, x - 7, x + 7, [[0, '#3a2a0e'], [0.4, '#c9a85a'], [1, '#4a3410']]); ctx.fillRect(x - 7, -180, 14, 580);
    rect(ctx, x - 9, 150, 18, 6, '#6a4e18'); rect(ctx, x - 9, 300, 18, 6, '#6a4e18');
    rect(ctx, x - 9, 398, 18, 34, '#6a4e18'); rect(ctx, x - 6, 404, 12, 20, '#0a0806');
    circ(ctx, x, 442, 3.4, mod(t * 0.6 + i * 0.37, 2.4) < 0.3 ? '#7fd09a' : '#1a2a1e');
    rect(ctx, x - 8, 452, 16, 9, '#cdc6ae');
    if (going) { // one of them has just been sent: it went like a breath
      const ph = mod(t * 0.42, 1); if (ph < 0.5) { const y = 396 - ph * 2 * 520; glow(ctx, x, y, 34, '#fff0b8', 0.7); ctx.fillStyle = '#fff6d6'; ctx.beginPath(); ctx.ellipse(x, y, 5, 11, 0, 0, TAU); ctx.fill(); }
      circ(ctx, x, 442, 3.4, ph < 0.6 ? '#ff5a4a' : '#3a1410');
    }
  }
  ctx = S(0.5);
  rect(ctx, wx - 160, 462, 320, 22, '#2a1e12'); rect(ctx, wx - 166, 458, 332, 6, '#4a3626');
  // pigeonholes: the morning sheet, sorted by city
  for (const s of [-1, 1]) {
    const x0 = wx + s * 430 - 130 + px * 0.2;
    rect(ctx, x0 - 8, 372, 276, 112, '#0a0d13');
    for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) { const x = x0 + c * 33, y = 380 + r * 34; rect(ctx, x, y, 29, 30, '#161b25'); if (rnd(c * 7 + r * 13 + s) < 0.7) { const h = 6 + rnd(c + r * 5 + s * 3) * 18; rect(ctx, x + 3, y + 30 - h, 23, h, '#cfc6aa'); rect(ctx, x + 3, y + 30 - h, 23, 1.5, '#8a2a22'); } }
  }
  // floor, and the sorting tables
  ctx.fillStyle = vgrad(ctx, 484, 800, [[0, '#141a24'], [1, '#04060a']]); ctx.fillRect(X0, 484, XW, 500);
  for (let i = -8; i <= 8; i++) seg(ctx, 640 + i * 90 + px * 0.4, 484, 640 + i * 330 + px, 980, 'rgba(0,0,0,.25)', 1.3);
  const tx = px * 0.6;
  for (const x0 of [-240, 860]) {
    const x = x0 + tx;
    ctx.fillStyle = vgrad(ctx, 500, 640, [[0, '#33261a'], [1, '#0e0a07']]); ctx.fillRect(x, 506, 620, 200); rect(ctx, x - 8, 500, 636, 8, '#4a3626');
    for (let i = 0; i < 7; i++) { const bx2 = x + 30 + i * 84, h = 14 + rnd(i * 3 + x0) * 26; rect(ctx, bx2, 500 - h, 56, h, i % 2 ? '#c8bea0' : '#d6ccb0'); rect(ctx, bx2 + 24, 500 - h, 5, h, '#8a2a22'); rect(ctx, bx2, 500 - h * 0.5, 56, 2, '#8a2a22'); }
    for (let i = 0; i < 2; i++) { ctx.fillStyle = '#5a5244'; ctx.beginPath(); ctx.ellipse(x + 180 + i * 300, 690, 60, 46, 0.2 - i * 0.5, 0, TAU); ctx.fill(); } // sacks
  }
  // one lamp lit, and the table under it: a brass carrier, open, and a sheaf of photographs
  ctx = A();
  const lx = 640 + px * 0.7, fl = flick(t, 11);
  seg(ctx, lx, -180, lx, 150, '#070a10', 2.5);
  poly(ctx, [[lx - 54, 176], [lx + 54, 176], [lx + 300, 560], [lx - 300, 560]], rgba('#ffe2a8', 0.075 * fl));
  ctx = S(0.7, 0.24 * fl + 0.06);
  glow(ctx, lx, 190, 380, '#ffd088', 1);
  ctx = A();
  ctx.fillStyle = hgrad(ctx, lx - 56, lx + 56, [[0, '#0e3a2a'], [0.4, '#2f8a66'], [1, '#0e3a2a']]); ctx.beginPath(); ctx.moveTo(lx - 56, 176); ctx.quadraticCurveTo(lx, 118, lx + 56, 176); ctx.closePath(); ctx.fill();
  rect(ctx, lx - 52, 174, 104, 5, '#fff2c8'); circ(ctx, lx, 186, 10, rgba('#fff6d8', 0.95));
  ctx = S(0.7);
  ctx.fillStyle = vgrad(ctx, 520, 800, [[0, '#4a3420'], [1, '#150e08']]); ctx.fillRect(lx - 250, 524, 500, 300); rect(ctx, lx - 258, 518, 516, 8, '#6a4c30');
  ctx.fillStyle = 'rgba(255,226,168,.14)'; ctx.beginPath(); ctx.ellipse(lx, 524, 230, 12, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = hgrad(ctx, lx - 96, lx - 20, [[0, '#6a4a16'], [0.4, '#f0d88c'], [1, '#6a4a16']]); rr(ctx, lx - 96, 494, 76, 26, 12); ctx.fill();
  ctx.save(); ctx.translate(lx - 20, 507); ctx.rotate(-0.9); ctx.fillStyle = '#c9a85a'; ctx.beginPath(); ctx.ellipse(10, 0, 5, 13, 0, 0, TAU); ctx.fill(); ctx.restore();
  ctx.fillStyle = '#1a140a'; ctx.beginPath(); ctx.ellipse(lx - 21, 507, 5, 12, 0, 0, TAU); ctx.fill();
  for (let i = 0; i < 4; i++) { ctx.save(); ctx.translate(lx + 60 + i * 22, 510 - i * 1.5); ctx.rotate(-0.2 + i * 0.13); rect(ctx, -26, -5, 52, 10, '#e6dfc8'); rect(ctx, -22, -3.5, 44, 7, '#3a3a40'); ctx.restore(); }
}, (ctx, t, px) => {
  motes(ctx, 461, 44, '#ffe8c0', t, { x0: 380 + px, x1: 900 + px, y0: 150, y1: 540, vx: 2, vy: 5, r: 1.3, a: 0.4, tw: 1, wob: 14 });
});

// ── cell: a cell kept for persons of standing ──
def('cell', { amb: '#14161e', rim: '#ffd9a8', key: -1 }, (ctx, t, px) => {
  ctx = S(0.2);
  fillAll(ctx, vgrad(ctx, -180, 800, [[0, '#090a10'], [0.5, '#1c1f28'], [1, '#08090c']]));
  const bx = px * 0.2;
  for (let r = -3; r < 12; r++) { // dressed stone
    const y = r * 58 + 10; rect(ctx, X0, y, XW, 2, 'rgba(0,0,0,.35)'); rect(ctx, X0, y + 2, XW, 1, 'rgba(160,170,200,.035)');
    for (let c = -2; c < 15; c++) rect(ctx, c * 130 + (r % 2) * 65 + bx, y, 2, 58, 'rgba(0,0,0,.3)');
  }
  // the window: high, barred, and facing nothing
  ctx = A();
  const wx = 830 + bx, cloud = 0.55 + 0.45 * Math.sin(t * 0.13);
  poly(ctx, [[wx - 30, 60], [wx + 170, 60], [wx + 150, 224], [wx - 10, 224]], '#0c0d12');
  ctx.fillStyle = vgrad(ctx, 76, 210, [[0, '#122040'], [1, '#3a507c']]); ctx.fillRect(wx, 76, 140, 134);
  circ(ctx, wx + 96, 118, 17, rgba('#e8eeff', 0.5 + 0.5 * cloud)); glow(ctx, wx + 96, 118, 70, '#b8c8ff', 0.3 * cloud);
  for (let i = 0; i < 3; i++) { const x = wx + mod(i * 70 + t * 4, 220) - 50; ctx.fillStyle = 'rgba(20,30,56,.6)'; ctx.beginPath(); ctx.ellipse(x, 110 + i * 22, 50, 9, 0, 0, TAU); ctx.fill(); }
  for (let i = 0; i < 5; i++) rect(ctx, wx + 12 + i * 28, 76, 6, 134, '#07080c'); rect(ctx, wx, 138, 140, 6, '#07080c');
  ctx.strokeStyle = '#07080c'; ctx.lineWidth = 6; ctx.strokeRect(wx, 76, 140, 134);
  // what it lets in, laid on the wall and the floor in bars
  for (let i = 0; i < 5; i++) poly(ctx, [[wx + 18 + i * 28, 210], [wx + 34 + i * 28, 210], [wx - 430 + i * 62, 800], [wx - 478 + i * 62, 800]], rgba('#b8c8ff', 0.05 + 0.07 * cloud));
  // the door, and somebody's lantern in the passage
  const dx = 190 + px * 0.3, pass = Math.max(0, Math.sin(t * 0.21));
  ctx = S(0.28);
  rect(ctx, dx - 124, 96, 248, 392, '#0a0b10');
  ctx.fillStyle = hgrad(ctx, dx - 106, dx + 106, [[0, '#2a1e14'], [0.5, '#3e2c1c'], [1, '#22180f']]); ctx.fillRect(dx - 106, 112, 212, 376);
  for (let i = 1; i < 5; i++) rect(ctx, dx - 106 + i * 42, 112, 2, 376, 'rgba(0,0,0,.4)');
  for (const y of [150, 300, 440]) { rect(ctx, dx - 110, y, 220, 16, '#14161c'); for (let i = 0; i < 6; i++) circ(ctx, dx - 92 + i * 37, y + 8, 3.4, '#3a3e48'); }
  rect(ctx, dx - 40, 400, 80, 26, '#14161c'); circ(ctx, dx + 82, 320, 8, '#3a3e48');
  // persons of standing are allowed a shelf, a peg and a basin
  const sx = 470 + px * 0.25;
  rect(ctx, sx - 10, 250, 230, 8, '#2a1e14'); seg(ctx, sx + 4, 258, sx + 4, 282, '#2a1e14', 4); seg(ctx, sx + 206, 258, sx + 206, 282, '#2a1e14', 4);
  for (let i = 0; i < 7; i++) { const h = 40 + rnd(i * 3) * 22, w = 15 + rnd(i * 7) * 9; rect(ctx, sx + 48 + i * 24, 250 - h, w, h, ['#3a1c1c', '#1c2a3a', '#2e2a20', '#1c3a2c'][i % 4]); rect(ctx, sx + 48 + i * 24, 250 - h * 0.8, w, 2, 'rgba(201,168,90,.5)'); }
  // the basin stands at the wall end of the shelf: at the other end it sat on the head of whoever stood centre stage
  { const x = sx + 16; ctx.fillStyle = '#d8d2c0'; ctx.beginPath(); ctx.ellipse(x, 244, 20, 6, 0, 0, TAU); ctx.fill(); rect(ctx, x - 9, 218, 18, 26, '#c8c2b0'); }
  { const x = 1150 + bx; circ(ctx, x, 150, 5, '#3a3e48'); // the greatcoat he was brought here in, on the one peg
    ctx.fillStyle = '#12131a'; ctx.beginPath(); ctx.moveTo(x - 8, 152); ctx.quadraticCurveTo(x - 70, 190, x - 62, 480); ctx.lineTo(x + 60, 480); ctx.quadraticCurveTo(x + 66, 190, x + 8, 152); ctx.fill();
    poly(ctx, [[x - 8, 154], [x - 34, 196], [x - 6, 250], [x, 170]], '#1c1e28'); poly(ctx, [[x + 8, 154], [x + 34, 196], [x + 6, 250], [x, 170]], '#191b24');
    seg(ctx, x, 250, x, 478, 'rgba(0,0,0,.5)', 2); for (let i = 0; i < 4; i++) circ(ctx, x + 8, 280 + i * 50, 3.2, '#3a3e48'); }
  // floor
  ctx.fillStyle = vgrad(ctx, 488, 800, [[0, '#1a1c24'], [1, '#07080a']]); ctx.fillRect(X0, 488, XW, 500);
  for (let i = -8; i <= 8; i++) seg(ctx, 640 + i * 110 + px * 0.4, 488, 640 + i * 400 + px, 980, 'rgba(0,0,0,.3)', 1.5);
  for (let i = 0; i < 4; i++) seg(ctx, X0, 520 + i * i * 22 + i * 20, X0 + XW, 520 + i * i * 22 + i * 20, 'rgba(0,0,0,.3)', 1.5);
  ctx = A();
  for (let i = 0; i < 5; i++) poly(ctx, [[wx - 196 + i * 43, 488], [wx - 178 + i * 43, 488], [wx - 430 + i * 62, 800], [wx - 478 + i * 62, 800]], rgba('#b8c8ff', 0.05 + 0.08 * cloud));
  // the table, the lamp they will take away at ten, and one sheet
  rect(ctx, dx - 38, 190, 76, 62, '#06070a'); glow(ctx, dx, 221, 110, '#ffb860', 0.4 * pass); rect(ctx, dx - 34, 194, 68, 54, rgba('#ffb860', 0.55 * pass));
  for (let i = 0; i < 4; i++) rect(ctx, dx - 26 + i * 18, 190, 5, 62, '#14161c');
  const tx = px * 0.85, ty = 584, fl = flick(t, 13);
  ctx = S(0.85);
  ctx.fillStyle = vgrad(ctx, ty, 800, [[0, '#3a2a1c'], [0.14, '#1e150e'], [1, '#090605']]); ctx.fillRect(X0, ty, XW, 400);
  rect(ctx, X0, ty - 5, XW, 7, '#5a4028');
  ctx = A();
  const lx = 330 + tx;
  ctx = S(0.85, 0.3 * fl + 0.06);
  glow(ctx, lx, ty - 70, 420, '#ffc070', 1);
  ctx = A();
  rect(ctx, lx - 26, ty - 22, 52, 18, '#8a6a2e'); rect(ctx, lx - 16, ty - 30, 32, 9, '#b08a3e');
  ctx.fillStyle = 'rgba(255,236,190,.16)'; ctx.strokeStyle = 'rgba(255,240,210,.5)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(lx - 14, ty - 30); ctx.bezierCurveTo(lx - 30, ty - 70, lx - 12, ty - 100, lx - 9, ty - 126); ctx.lineTo(lx + 9, ty - 126); ctx.bezierCurveTo(lx + 12, ty - 100, lx + 30, ty - 70, lx + 14, ty - 30); ctx.closePath(); ctx.fill(); ctx.stroke();
  flame(ctx, lx, ty - 34, 12, t, 13);
  poly(ctx, [[820 + tx, ty - 3], [990 + tx, ty - 3], [1010 + tx, ty - 26], [846 + tx, ty - 26]], '#e9e0c6');
  for (let i = 0; i < 5; i++) seg(ctx, 858 + tx + i * 3.5, ty - 22 + i * 3.6, 992 + tx + i * 3, ty - 22 + i * 3.6, 'rgba(40,30,52,.6)', 1);
  { const a = t * 1.7, r = 46 + Math.sin(t * 0.9) * 16; // a moth, round the glass
    const mx2 = lx + Math.cos(a) * r, my = ty - 100 + Math.sin(a * 1.3) * 34, w = Math.abs(Math.sin(t * 30)) * 5 + 1;
    ctx.fillStyle = 'rgba(232,220,196,.8)'; ctx.beginPath(); ctx.ellipse(mx2 - 3, my, w, 3, -0.5, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(mx2 + 3, my, w, 3, 0.5, 0, TAU); ctx.fill(); }
}, (ctx, t, px) => {
  motes(ctx, 471, 34, '#d4dcff', t, { x0: 400 + px, x1: 1000 + px, y0: 200, y1: 640, vx: -2, vy: 3, r: 1.2, a: 0.3, tw: 1, wob: 12 });
});
