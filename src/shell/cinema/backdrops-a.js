// Backdrop painters, first half (the ledger, the Line, chapters 1 and 2). Part of the cinematic renderer: see ../cinema.js.
// Exports BACKDROPS_A: key -> { light, back(ctx, t, px, info), front?(ctx, t, px, info) }.
// Still and moving sections are marked with ctx = S(depth) and ctx = A(): the contract is written out in kit.js.
import {
  TAU, lerp, mod, rnd, flick, css, rgba, mix, fade, vgrad, hgrad, fillAll, rect, circ, seg, poly, rr, wrapText, FONT_SERIF, FONT_SCRIPT,
  FONT_MONO, S, A, glow, stars, lantern, lanternString, flame, motes, skyline, waterStreaks, crowdRow, sigilScale, waveform, X0, XW,
  LINE_LIGHT, coldFlame, chalkLine, LINE_ID, revealCount,
} from './kit.js';
import { drawFigure } from './figures.js';

export const BACKDROPS_A = Object.create(null);
function def(key, light, back, front) { BACKDROPS_A[key] = { light, back, front: front || null }; }

const LANTERN_COLS = ['#ff9a3c', '#ffc65a', '#ff6a3a', '#ffe2a0', '#e8503a', '#ffb04a', '#7fd6c8'];

def('black', { amb: '#0b0b10', rim: '#8c93a8', key: -1 }, (ctx) => { fillAll(ctx, '#000'); });

// ── ledger: narration over an open account book; the entry writes itself ──
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
def('ledger', { amb: '#2a1a0c', rim: '#ffcf8a', key: -1 }, (ctx, t, px, info) => {
  ctx = S(0.5);
  fillAll(ctx, vgrad(ctx, -180, 980, [[0, '#1d1009'], [1, '#0b0604']]));
  for (let i = 0; i < 30; i++) {
    const y = -150 + i * 40 + rnd(i) * 22;
    ctx.strokeStyle = `rgba(0,0,0,${0.12 + rnd(i * 3) * 0.2})`; ctx.lineWidth = 1 + rnd(i * 7) * 2;
    ctx.beginPath(); ctx.moveTo(X0, y); ctx.bezierCurveTo(300, y + rnd(i * 2) * 24 - 12, 900, y - rnd(i * 5) * 24 + 12, X0 + XW, y + 6); ctx.stroke();
  }
  const fl = flick(t, 1);
  const bx = 120 + px * 0.5, by = 78, bw = 1040, bh = 660, half = bw / 2;
  ctx = S(0.8, 0.3 * fl);
  glow(ctx, 40 + px * 0.8, 120, 760, '#ffb45a', 1);
  ctx = A();
  // the book
  ctx = S(0.5);
  ctx.fillStyle = 'rgba(0,0,0,.55)'; rr(ctx, bx - 10, by + 14, bw + 44, bh + 30, 12); ctx.fill();
  ctx.fillStyle = '#3b1813'; rr(ctx, bx - 16, by - 12, bw + 32, bh + 28, 9); ctx.fill();
  ctx.strokeStyle = '#8a6a2e'; ctx.lineWidth = 1.5; rr(ctx, bx - 10, by - 6, bw + 20, bh + 16, 6); ctx.stroke();
  for (let i = 3; i >= 0; i--) { rect(ctx, bx - i * 2.2, by + i * 1.6, bw + i * 4.4, bh, i % 2 ? '#cbbb96' : '#b9a87f'); }
  ctx.fillStyle = hgrad(ctx, bx, bx + half, [[0, '#d9cba6'], [0.12, '#e9dcbb'], [0.86, '#e6d8b4'], [1, '#b39f78']]);
  ctx.fillRect(bx, by, half, bh);
  ctx.fillStyle = hgrad(ctx, bx + half, bx + bw, [[0, '#b7a37c'], [0.14, '#e8dbb9'], [0.9, '#eadfc0'], [1, '#d9cba6']]);
  ctx.fillRect(bx + half, by, half, bh);
  // foxing
  for (let i = 0; i < 26; i++) glow(ctx, bx + rnd(i * 3.3) * bw, by + rnd(i * 5.7) * bh, 8 + rnd(i) * 26, '#8a5a2a', 0.05 + rnd(i * 9) * 0.05);
  // rules, drawn by hand: not quite straight
  const top = by + 92, lh = 36, rows = 13, mL = 64, mR = 92;
  for (let side = 0; side < 2; side++) {
    const x0 = bx + side * half, xa = x0 + 22, xb = x0 + half - 22;
    for (let r = 0; r <= rows; r++) {
      const y = top + r * lh + 8;
      ctx.strokeStyle = 'rgba(64,104,150,.34)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(xa, y + rnd(r + side * 20) * 1.4); ctx.lineTo(xb, y + rnd(r * 3 + side * 9) * 1.4); ctx.stroke();
    }
    seg(ctx, xa, top - lh + 6, xb, top - lh + 7, 'rgba(120,30,30,.6)', 1.2);
    seg(ctx, xa, top - lh + 10, xb, top - lh + 11, 'rgba(120,30,30,.6)', 1.2);
    for (const vx of [x0 + mL, x0 + half - mR, x0 + half - mR + 4]) seg(ctx, vx, top - lh + 6, vx + 1, by + bh - 20, 'rgba(150,40,40,.5)', 1);
    ctx.fillStyle = 'rgba(70,40,30,.75)'; ctx.font = `600 11px ${FONT_SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('No.', x0 + mL / 2 + 10, top - lh + 1);
    ctx.fillText('PARTICULARS', x0 + (mL + half - mR) / 2, top - lh + 1);
    ctx.fillText(side ? 'OWED' : 'PAID', x0 + half - mR / 2 - 8, top - lh + 1);
  }
  ctx.fillStyle = 'rgba(50,24,20,.82)'; ctx.font = `28px ${FONT_SCRIPT}`; ctx.textAlign = 'center';
  ctx.fillText('Forty lights, in account with one another', bx + half / 2, by + 36);
  ctx.fillText('The Long Settlement', bx + half * 1.5, by + 36);
  // the entries
  ctx = A();
  ctx.font = `25px ${FONT_SCRIPT}`; ctx.textAlign = 'left';
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
      ctx.fillStyle = 'rgba(130,34,30,.85)'; ctx.font = `20px ${FONT_SCRIPT}`; ctx.textAlign = 'center';
      ctx.fillText(String(e.n) + '.', p0.x0 + mL / 2 + 10, p0.y);
      ctx.font = `25px ${FONT_SCRIPT}`; ctx.textAlign = 'left';
    }
    for (const rtxt of e.rows) {
      if (row >= R * pages) break;
      const p = at(row);
      const part = left >= rtxt.length ? rtxt : rtxt.slice(0, Math.max(0, left));
      ctx.fillStyle = e.cur ? 'rgba(24,18,40,.94)' : 'rgba(40,30,52,.72)';
      if (part) ctx.fillText(part, p.x, p.y);
      if (e.cur && left < rtxt.length && left >= 0 && !pen) pen = { x: p.x + ctx.measureText(part).width, y: p.y };
      left -= rtxt.length + 1;
      row++;
    }
    if (!e.cur || shown >= e.text.length) {
      // a finished entry is ticked off in the money column
      const p = at(Math.min(row - 1, R * pages - 1));
      ctx.strokeStyle = 'rgba(130,34,30,.7)'; ctx.lineWidth = 1.8;
      const tx = p.x0 + half - mR / 2 - 8;
      ctx.beginPath(); ctx.moveTo(tx - 16, p.y - 8); ctx.lineTo(tx - 8, p.y); ctx.lineTo(tx + 12, p.y - 18); ctx.stroke();
    }
    row++;
  }
  // gutter shadow and ribbon
  ctx = S(0.5);
  ctx.fillStyle = hgrad(ctx, bx + half - 44, bx + half + 44, [[0, 'rgba(60,40,20,0)'], [0.5, 'rgba(40,24,12,.5)'], [1, 'rgba(60,40,20,0)']]);
  ctx.fillRect(bx + half - 44, by, 88, bh);
  ctx.fillStyle = '#7a1c22';
  ctx.beginPath(); ctx.moveTo(bx + half + 6, by - 6); ctx.bezierCurveTo(bx + half + 30, by + 200, bx + half - 12, by + 420, bx + half + 16, by + bh + 40); ctx.lineTo(bx + half + 30, by + bh + 40);
  ctx.bezierCurveTo(bx + half + 2, by + 420, bx + half + 44, by + 200, bx + half + 20, by - 6); ctx.fill();
  // the pen
  ctx = A();
  if (pen) {
    const jx = Math.sin(t * 23) * 1.2, jy = Math.cos(t * 31) * 1.2;
    ctx.save(); ctx.translate(pen.x + jx + 2, pen.y + jy + 2); ctx.rotate(-0.72);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(110, 34, 120, 9, 0.06, 0, TAU); ctx.fill();
    poly(ctx, [[0, 0], [22, -6], [26, 0], [22, 6]], '#c9a85a');
    seg(ctx, 2, 0, 20, 0, '#2a1c10', 1);
    ctx.fillStyle = hgrad(ctx, 24, 250, [[0, '#2c1a12'], [0.3, '#4a2a1a'], [1, '#1a0e0a']]);
    ctx.beginPath(); ctx.moveTo(24, -6); ctx.lineTo(250, -4); ctx.quadraticCurveTo(258, 0, 250, 4); ctx.lineTo(24, 6); ctx.closePath(); ctx.fill();
    rect(ctx, 24, -6.5, 14, 13, '#b08a3e');
    ctx.restore();
    circ(ctx, pen.x + 1, pen.y - 1, 2.2, 'rgba(24,18,40,.9)');
  }
  // candle and ink
  ctx = S(0.9);
  const cx = 44 + px * 0.9;
  rect(ctx, cx - 16, 250, 32, 320, '#d8ccb0'); rect(ctx, cx - 16, 250, 9, 320, '#b8aa8a');
  ctx.fillStyle = '#e8dcc0'; ctx.beginPath(); ctx.ellipse(cx, 250, 16, 6, 0, 0, TAU); ctx.fill();
  fillAll(ctx, (() => { const g = ctx.createRadialGradient(360, 300, 200, 640, 400, 900); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.62)'); return g; })());
  ctx = A();
  flame(ctx, cx, 246, 13, t, 2);
});
def('line', LINE_LIGHT, (ctx, t, px, info) => {
  ctx = S(0.25);
  fillAll(ctx, '#020b0d');
  const cx = 248 + px * 0.3, cy = 322;
  glow(ctx, cx, cy, 520, '#0f6a60', 0.3);
  for (let x = -256; x < 1540; x += 64) seg(ctx, x + px * 0.2, -180, x + px * 0.2, 980, 'rgba(70,220,196,.045)', 1);
  for (let y = -160; y < 980; y += 64) seg(ctx, X0, y, X0 + XW, y, 'rgba(70,220,196,.045)', 1);
  ctx = A();
  for (let i = 1; i <= 5; i++) {
    const r = 150 + i * 92 + mod(t * 26, 92);
    ctx.strokeStyle = `rgba(70,220,196,${0.11 * (1 - (r - 150) / 560)})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, r, -0.9, 0.9); ctx.stroke();
  }
  seg(ctx, 400, cy, 1340, cy, 'rgba(70,220,196,.16)', 1);
  waveform(ctx, 404, 1300, cy, 96, info.level * 0.8, info.tms * 1.31 + 900, 'rgba(70,220,196,.3)', 2);
  waveform(ctx, 404, 1300, cy, 170, info.level, info.tms, 'rgba(110,245,220,.95)', 3);
  for (let i = 0; i < 56; i++) {
    const h = 4 + (0.08 + info.level) * 46 * (0.3 + 0.7 * Math.abs(Math.sin(i * 0.9 + info.tms * 0.008 + rnd(i) * 6)));
    rect(ctx, 410 + i * 15, 520 - h, 9, h, `rgba(70,220,196,${0.22 + 0.3 * rnd(i * 3)})`);
  }
  // the voice on the other end
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, 128, 0, TAU);
  ctx.fillStyle = '#04171a'; ctx.fill();
  ctx.clip();
  glow(ctx, cx - 40, cy - 50, 190, '#2aa898', 0.3);
  if (info.portrait && info.portrait.look && info.portrait.id !== 'crowd' && info.portrait.id !== 'narrator') {
    ctx.translate(cx, cy + 118); ctx.scale(1.22, 1.22);
    drawFigure(ctx, info.portrait, { emote: info.portraitEmote, talk: info.level, focus: 0.8, light: LINE_LIGHT, facing: 1, gaze: 0.2, t });
  } else {
    ctx.strokeStyle = 'rgba(110,245,220,.7)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(cx, cy - 6, 44, Math.PI * 0.9, Math.PI * 2.1); ctx.stroke();
    circ(ctx, cx + 34, cy + 30, 16, 'rgba(110,245,220,.7)');
  }
  ctx.restore();
  for (let y = cy - 128; y < cy + 128; y += 4) rect(ctx, cx - 128, y, 256, 1, 'rgba(0,0,0,.16)');
  ctx.strokeStyle = '#b08a3e'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cx, cy, 130, 0, TAU); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,236,180,.55)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, cy, 136, 0, TAU); ctx.stroke();
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * TAU + t * 0.08, r0 = 144, r1 = i % 4 ? 150 : 158;
    seg(ctx, cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, 'rgba(110,245,220,.45)', 1.4);
  }
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = `600 15px ${FONT_MONO}`; ctx.fillStyle = 'rgba(110,245,220,.8)';
  const live = !info.portrait || info.portrait.id === LINE_ID;
  ctx.fillText(live ? 'THE LINE' : 'RECORDING', 96 + px * 0.3, 118);
  ctx.font = `12px ${FONT_MONO}`; ctx.fillStyle = 'rgba(110,245,220,.5)';
  ctx.fillText(live ? 'HALCYON SURETY  /  PROCTOR CHANNEL  /  SEALED' : `LISTENING SHELL  /  PLAYBACK  /  ${String(info.portrait.name).toUpperCase()}`, 96 + px * 0.3, 138);
  const s = Math.floor(t);
  ctx.textAlign = 'right';
  ctx.fillText(`${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}  CARRIER ${(412.5 + Math.sin(t * 0.7) * 0.2).toFixed(2)}`, 1196 + px * 0.3, 118);
  if (live && mod(t, 1.2) < 0.7) circ(ctx, 80 + px * 0.3, 113, 5, '#ff5a4a');
  ctx.textAlign = 'left';
  ctx = S(0);
  for (let y = -40; y < 860; y += 4) rect(ctx, X0, y, XW, 1, 'rgba(0,0,0,.16)');
});

// ── harbor-night: Vessery harbour, ten thousand paper lanterns ──
def('harbor-night', { amb: '#101a3c', rim: '#ffb968', key: 1 }, (ctx, t, px) => {
  ctx = S(0);
  fillAll(ctx, vgrad(ctx, -180, 452, [[0, '#050818'], [0.55, '#0f1d48'], [1, '#2b4470']]));
  ctx = A();
  stars(ctx, 1, 150, 380, t);
  const mx = 1010 + px * 0.05;
  ctx = S(0.05);
  glow(ctx, mx, 120, 260, '#b8c8ff', 0.22);
  circ(ctx, mx, 120, 32, '#e8ecff'); circ(ctx, mx - 9, 112, 7, 'rgba(180,190,230,.5)'); circ(ctx, mx + 10, 130, 5, 'rgba(180,190,230,.4)');
  // the lanterns let go: a slow river of them rising over the city
  ctx = A();
  for (let i = 0; i < 230; i++) {
    const d = rnd(i * 3.1);
    const x = mod(rnd(i) * 1800 + Math.sin(t * 0.3 + i) * 10 + px * (0.1 + d * 0.5) + t * (2 + d * 5), 1800) - 260;
    const y = 446 - mod(rnd(i * 7.7) * 640 + t * (5 + d * 13), 640);
    const fl = 0.7 + 0.3 * Math.sin(t * (3 + rnd(i * 5) * 4) + i);
    const r = 1.1 + d * 3.6;
    const col = LANTERN_COLS[i % 5];
    if (d > 0.72) glow(ctx, x, y, r * 6, col, 0.3 * fl);
    ctx.fillStyle = rgba(col, (0.35 + 0.65 * d) * fl);
    ctx.fillRect(x - r * 0.7, y - r, r * 1.4, r * 2);
  }
  // headland and the city across the water
  ctx = S(0.14);
  ctx.fillStyle = '#0a1230';
  ctx.beginPath(); ctx.moveTo(X0, 452); ctx.lineTo(X0, 380 + 0); ctx.bezierCurveTo(60 + px * 0.1, 330, 300 + px * 0.1, 400, 520 + px * 0.1, 430); ctx.lineTo(1540, 452); ctx.fill();
  skyline(ctx, 5, X0 + px * 0.15, 1560, 452, 18, 110, 18, 58, '#081028', '#ffcf7a', t);
  // the Mint hall dome
  const dx = 420 + px * 0.15;
  rect(ctx, dx - 70, 368, 140, 86, '#081028');
  ctx.fillStyle = '#081028'; ctx.beginPath(); ctx.arc(dx, 368, 56, Math.PI, 0); ctx.fill();
  rect(ctx, dx - 3, 286, 6, 30, '#081028');
  for (let i = 0; i < 7; i++) rect(ctx, dx - 58 + i * 18, 384, 8, 50, rgba('#ffcf7a', 0.55 + 0.2 * Math.sin(t + i)));
  glow(ctx, dx, 400, 150, '#ffb85c', 0.22);
  // water
  ctx.fillStyle = vgrad(ctx, 452, 800, [[0, '#122456'], [0.4, '#0a1436'], [1, '#04081a']]);
  ctx.fillRect(X0, 452, XW, 540);
  ctx = A();
  waterStreaks(ctx, 11, X0, 1540, 456, 800, 190, '#ffb85c', t, 0.6);
  waterStreaks(ctx, 13, mx - 120, mx + 120, 456, 760, 40, '#dfe6ff', t, 0.55);
  // boats carrying their own lights
  for (let b = 0; b < 6; b++) {
    const d = b / 5;
    const x = mod(160 + b * 263 + rnd(b * 9) * 120 + t * (3 + b) * (b % 2 ? 1 : -1), 1700) - 200 + px * (0.3 + d * 0.5);
    const y = 480 + d * 150 + Math.sin(t * 0.9 + b) * 2;
    const s = 0.5 + d * 0.9;
    ctx.fillStyle = '#060a18';
    ctx.beginPath(); ctx.moveTo(x - 44 * s, y); ctx.lineTo(x + 50 * s, y); ctx.lineTo(x + 36 * s, y + 13 * s); ctx.lineTo(x - 34 * s, y + 13 * s); ctx.fill();
    rect(ctx, x - 2 * s, y - 52 * s, 2.4 * s, 52 * s, '#060a18');
    for (let j = 0; j < 3; j++) lantern(ctx, x - 26 * s + j * 26 * s, y - (30 + (j % 2) * 14) * s, 6.5 * s, LANTERN_COLS[(b + j) % 5], t, b * 7 + j);
    for (let j = 0; j < 8; j++) rect(ctx, x - 30 * s + rnd(b + j * 3) * 60 * s + Math.sin(t * 2 + j + b) * 4, y + 18 * s + j * 7 * s, (26 - j * 2) * s, 2, rgba('#ffb85c', 0.42 - j * 0.045));
  }
  // near strings of lanterns across the quay
  lanternString(ctx, -220 + px * 0.9, -30, 620 + px * 0.9, 40, 80, 6, 19, LANTERN_COLS, t, 41);
  lanternString(ctx, 540 + px * 0.9, 50, 1500 + px * 0.9, -40, 90, 7, 19, LANTERN_COLS, t, 57);
  // quay rail
  ctx = S(1.1);
  rect(ctx, X0, 690, XW, 12, '#04060e');
  for (let i = 0; i < 16; i++) rect(ctx, -240 + i * 120 + px * 1.1, 690, 10, 300, '#04060e');
});

// ── lantern-stalls: the night market on the docks ──
/** part 0 paints the stall, part 1 only the lit lanterns that sway under its awning */
function stall(ctx, x, y, w, t, seed, knocked, part) {
  ctx.save();
  ctx.translate(x, y);
  if (knocked) ctx.rotate(0.09);
  if (part === 1) {
    const m = Math.floor(w / 48);
    for (let i = 0; i < m; i++) {
      if (knocked && i % 2) continue;
      lantern(ctx, 30 + i * ((w - 60) / Math.max(1, m - 1)), 34 + (i % 2) * 12, 12, LANTERN_COLS[(i + ((seed * 13) | 0)) % LANTERN_COLS.length], t, seed + i * 3);
    }
    ctx.restore();
    return;
  }
  rect(ctx, 0, 0, 9, 250, '#120a08'); rect(ctx, w - 9, 0, 9, 250, '#120a08');
  // back shelves of unlit paper lanterns
  rect(ctx, 9, 40, w - 18, 150, '#1c100c');
  for (let r = 0; r < 2; r++) {
    rect(ctx, 9, 100 + r * 60, w - 18, 5, '#0d0705');
    for (let i = 0; i < Math.floor(w / 34); i++) {
      const c = LANTERN_COLS[(i + r * 2 + ((seed * 10) | 0)) % LANTERN_COLS.length];
      ctx.fillStyle = css(mix(c, '#1a0c08', 0.55));
      ctx.beginPath(); ctx.ellipse(28 + i * 34, 82 + r * 60, 11, 14, 0, 0, TAU); ctx.fill();
    }
  }
  // awning
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = i / n, b = (i + 1) / n;
    poly(ctx, [[lerp(14, w - 14, a), -34], [lerp(14, w - 14, b), -34], [lerp(-22, w + 22, b), 26], [lerp(-22, w + 22, a), 26]], i % 2 ? '#6a1c16' : '#c9b68a');
    ctx.fillStyle = i % 2 ? '#571410' : '#b09c70';
    ctx.beginPath(); ctx.arc(lerp(-22, w + 22, (a + b) / 2), 26, (w + 44) / n / 2, 0, Math.PI); ctx.fill();
  }
  ctx.fillStyle = vgrad(ctx, -34, 26, [[0, 'rgba(0,0,0,.45)'], [1, 'rgba(0,0,0,0)']]); ctx.fillRect(-22, -34, w + 44, 60);
  // counter
  ctx.fillStyle = vgrad(ctx, 190, 260, [[0, '#4a2c18'], [1, '#22120a']]); ctx.fillRect(-8, 190, w + 16, 70);
  rect(ctx, -12, 184, w + 24, 10, '#5c3a20');
  for (let i = 1; i < 6; i++) rect(ctx, -8 + (i * (w + 16)) / 6, 194, 2, 66, 'rgba(0,0,0,.3)');
  ctx.restore();
}
def('lantern-stalls', { amb: '#2a1408', rim: '#ffc46b', key: -1 }, (ctx, t, px) => {
  ctx = S(0);
  fillAll(ctx, vgrad(ctx, -180, 800, [[0, '#07081a'], [0.45, '#1f1024'], [1, '#2e1510']]));
  ctx = A();
  stars(ctx, 4, 60, 190, t);
  ctx = S(0.2);
  skyline(ctx, 9, X0 + px * 0.2, 1560, 440, 190, 350, 90, 170, '#150b12', '#ffb85c', t);
  glow(ctx, 640, 470, 760, '#ff8a2a', 0.22);
  ctx = A();
  lanternString(ctx, -160 + px * 0.3, 150, 700 + px * 0.3, 118, 46, 10, 8, LANTERN_COLS, t, 11);
  lanternString(ctx, 600 + px * 0.3, 104, 1440 + px * 0.3, 160, 56, 10, 8, LANTERN_COLS, t, 23);
  lanternString(ctx, -200 + px * 0.4, 230, 1500 + px * 0.4, 216, 40, 18, 7, LANTERN_COLS, t, 29);
  // ground
  ctx = S(0.55);
  ctx.fillStyle = vgrad(ctx, 520, 800, [[0, '#3a2012'], [1, '#0e0705']]); ctx.fillRect(X0, 520, XW, 480);
  for (let r = 0; r < 9; r++) {
    const y = 530 + r * r * 3.4 + r * 6, w = 34 + r * 9;
    for (let x = X0 + mod(px * (0.5 + r * 0.06) + (r % 2) * w * 0.5, w); x < 1540; x += w) {
      ctx.strokeStyle = `rgba(0,0,0,${0.18 + r * 0.02})`; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(x, y + 10, w * 0.52, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    }
  }
  // stalls
  for (let i = 0; i < 5; i++) stall(ctx, -200 + i * 350 + px * 0.55, 286, 280, t, i * 1.7 + 0.3, i === 1, 0);
  ctx = A();
  for (let i = 0; i < 5; i++) stall(ctx, -200 + i * 350 + px * 0.55, 286, 280, t, i * 1.7 + 0.3, i === 1, 1);
  // Nan's spilled lanterns, relit one by one
  for (let i = 0; i < 4; i++) {
    const x = 250 + i * 46 + px * 0.6, y = 566 + (i % 2) * 14;
    ctx.save(); ctx.translate(x, y); ctx.rotate(1.2 + i * 0.5);
    ctx.fillStyle = css(mix(LANTERN_COLS[i], '#1a0c08', i === 2 ? 0 : 0.5));
    ctx.beginPath(); ctx.ellipse(0, 0, 12, 15, 0, 0, TAU); ctx.fill();
    ctx.restore();
    if (i === 2) glow(ctx, x, y, 60, LANTERN_COLS[i], 0.4 * flick(t, i));
  }
  ctx = S(0.55);
  for (let i = 0; i < 5; i++) glow(ctx, -60 + i * 350 + px * 0.55, 560, 230, '#ffb85c', 0.16);
  // people passing, far
  ctx = A();
  crowdRow(ctx, 17, X0 + px * 0.45, 1540, 462, 11, 19, 'rgba(14,7,8,.9)', t, { hat: 0.4 });
}, (ctx, t, px) => {
  // out-of-focus lanterns hung close to the lens
  lanternString(ctx, -260 + px * 1.6, -70, 520 + px * 1.6, -40, 60, 3, 34, LANTERN_COLS, t, 71);
  lanternString(ctx, 800 + px * 1.6, -50, 1560 + px * 1.6, -80, 60, 3, 34, LANTERN_COLS, t, 83);
});

// ── drum-hall: the Mint hall and the great Reels ──
function reelGlyph(ctx, kind, x, y, s) {
  if (kind === 0) { // orb
    const g = ctx.createRadialGradient(x - s * 0.3, y - s * 0.3, s * 0.1, x, y, s);
    g.addColorStop(0, '#f4fbff'); g.addColorStop(0.5, '#7fc6e8'); g.addColorStop(1, '#1c4a78');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill();
  } else if (kind === 1) { // coin
    circ(ctx, x, y, s, '#d8b25a'); circ(ctx, x, y, s * 0.7, '#a8842e'); rect(ctx, x - s * 0.12, y - s * 0.45, s * 0.24, s * 0.9, '#e8d08a');
  } else if (kind === 2) { // crown
    poly(ctx, [[x - s, y + s * 0.6], [x - s, y - s * 0.5], [x - s * 0.45, y], [x, y - s * 0.8], [x + s * 0.45, y], [x + s, y - s * 0.5], [x + s, y + s * 0.6]], '#d8b25a');
  } else { // tide
    ctx.strokeStyle = '#3a8ab0'; ctx.lineWidth = s * 0.28;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x - s, y + i * s * 0.55); ctx.bezierCurveTo(x - s * 0.4, y + i * s * 0.55 - s * 0.5, x + s * 0.4, y + i * s * 0.55 + s * 0.5, x + s, y + i * s * 0.55); ctx.stroke(); }
  }
}
def('drum-hall', { amb: '#241a10', rim: '#ffe2a0', key: -1 }, (ctx, t, px) => {
  ctx = S(0.2);
  fillAll(ctx, vgrad(ctx, -180, 800, [[0, '#0d0906'], [0.5, '#2a1c10'], [1, '#170f09']]));
  // arcaded back wall
  for (let i = -1; i < 7; i++) {
    const x = -110 + i * 250 + px * 0.2;
    ctx.fillStyle = vgrad(ctx, 40, 560, [[0, '#17100a'], [1, '#3b2a18']]);
    ctx.beginPath(); ctx.moveTo(x, 580); ctx.lineTo(x, 170); ctx.arc(x + 85, 170, 85, Math.PI, 0); ctx.lineTo(x + 170, 580); ctx.fill();
    ctx.strokeStyle = 'rgba(216,178,90,.25)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, 580); ctx.lineTo(x, 170); ctx.arc(x + 85, 170, 85, Math.PI, 0); ctx.lineTo(x + 170, 580); ctx.stroke();
  }
  // banners of the Mint
  ctx = A();
  for (const bx of [118, 1162]) {
    const x = bx + px * 0.3, sw = Math.sin(t * 0.7 + bx) * 4;
    ctx.fillStyle = hgrad(ctx, x - 50, x + 50, [[0, '#123a2c'], [0.5, '#1c5a44'], [1, '#0e2c22']]);
    ctx.beginPath(); ctx.moveTo(x - 50, -180); ctx.lineTo(x + 50, -180); ctx.lineTo(x + 50 + sw, 400); ctx.lineTo(x + sw, 360); ctx.lineTo(x - 50 + sw, 400); ctx.fill();
    sigilScale(ctx, x + sw * 0.5, 200, 26, '#d8b25a', 3);
    ctx.strokeStyle = '#d8b25a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + sw * 0.5, 200, 44, 0, TAU); ctx.stroke();
  }
  // the Reels of Assay
  const cx = 640 + px * 0.35;
  ctx = S(0.35);
  glow(ctx, cx, 320, 520, '#ffcf7a', 0.2);
  ctx.fillStyle = hgrad(ctx, cx - 250, cx + 250, [[0, '#5a4018'], [0.2, '#c9a24a'], [0.5, '#f0d68a'], [0.8, '#b08a3a'], [1, '#4a3414']]);
  ctx.beginPath(); ctx.moveTo(cx - 240, 600); ctx.lineTo(cx - 240, 190); ctx.quadraticCurveTo(cx, 40, cx + 240, 190); ctx.lineTo(cx + 240, 600); ctx.fill();
  ctx.strokeStyle = '#3a280e'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(cx - 222, 600); ctx.lineTo(cx - 222, 198); ctx.quadraticCurveTo(cx, 62, cx + 222, 198); ctx.lineTo(cx + 222, 600); ctx.stroke();
  sigilScale(ctx, cx, 154, 20, '#3a280e', 3);
  ctx = A();
  for (let r = 0; r < 3; r++) {
    const x = cx - 186 + r * 128, y = 220, w = 116, h = 190;
    rect(ctx, x - 6, y - 6, w + 12, h + 12, '#2a1c0a');
    ctx.fillStyle = vgrad(ctx, y, y + h, [[0, '#6a6252'], [0.5, '#f4ecd6'], [1, '#6a6252']]); ctx.fillRect(x, y, w, h);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const off = mod(t * (10 + r * 4) + r * 37, 70);
    for (let j = -1; j < 4; j++) {
      const gy = y + j * 70 + off + 25;
      const kind = mod(Math.floor((t * (10 + r * 4) + r * 37) / 70) * -1 + j + r, 4);
      reelGlyph(ctx, kind, x + w / 2, gy, 22);
    }
    ctx.fillStyle = vgrad(ctx, y, y + h, [[0, 'rgba(0,0,0,.6)'], [0.3, 'rgba(0,0,0,0)'], [0.7, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.6)']]); ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
  ctx = S(0.35);
  seg(ctx, cx - 200, 315, cx + 200, 315, 'rgba(160,30,30,.55)', 2);
  rect(ctx, cx - 130, 440, 260, 46, '#2a1c0a');
  ctx.fillStyle = '#f0d68a'; ctx.font = `600 19px ${FONT_SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('REELS  OF  ASSAY', cx, 464);
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  // lever
  seg(ctx, cx + 240, 420, cx + 290, 420, '#8a6a2e', 12);
  seg(ctx, cx + 290, 420, cx + 300, 250, '#c9a24a', 9);
  circ(ctx, cx + 300, 244, 19, '#a82a22'); circ(ctx, cx + 294, 238, 6, 'rgba(255,255,255,.4)');
  // the drum of names, turning
  const dx = cx - 410, dy = 400, rot = t * 0.35;
  seg(ctx, dx - 70, 600, dx - 30, dy, '#3a280e', 9); seg(ctx, dx + 70, 600, dx + 30, dy, '#3a280e', 9);
  circ(ctx, dx, dy, 96, 'rgba(20,12,6,.7)');
  ctx = A();
  for (let i = 0; i < 26; i++) {
    const a = rot * 1.7 + i * 2.4, r = 20 + rnd(i * 3) * 62;
    ctx.save(); ctx.translate(dx + Math.cos(a) * r, dy + Math.sin(a) * r * 0.9); ctx.rotate(a * 2);
    rect(ctx, -9, -3, 18, 6, 'rgba(238,226,196,.85)');
    ctx.restore();
  }
  ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(dx, dy, 96, 0, TAU); ctx.stroke();
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const w = Math.abs(Math.cos(rot + (i * Math.PI) / 6)) * 96;
    ctx.beginPath(); ctx.ellipse(dx, dy, Math.max(1, w), 96, 0, 0, TAU); ctx.stroke();
  }
  circ(ctx, dx, dy, 8, '#f0d68a');
  // columns
  ctx = S(0.5);
  for (let i = -1; i < 7; i++) {
    const x = -160 + i * 250 + px * 0.5;
    if (Math.abs(x + 24 - cx) < 300) continue;
    ctx.fillStyle = hgrad(ctx, x, x + 50, [[0, '#2a1e12'], [0.35, '#6a543a'], [1, '#1c140c']]); ctx.fillRect(x, -180, 50, 790);
    rect(ctx, x - 9, 592, 68, 22, '#3a2c1c');
    for (let j = 1; j < 4; j++) rect(ctx, x + j * 12, -180, 2, 772, 'rgba(0,0,0,.22)');
  }
  // chandelier light
  ctx = A();
  for (const lx of [330, 950]) {
    const x = lx + px * 0.6;
    seg(ctx, x, -180, x, 40, '#1a120a', 3);
    for (let i = -2; i <= 2; i++) { flame(ctx, x + i * 22, 62 - Math.abs(i) * 6, 6, t, lx + i); rect(ctx, x + i * 22 - 3, 62 - Math.abs(i) * 6, 6, 12, '#e8dcc0'); }
    ctx.strokeStyle = '#8a6a2e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, 40, 48, 0.2, Math.PI - 0.2); ctx.stroke();
    poly(ctx, [[x - 40, 70], [x + 40, 70], [x + 300, 800], [x - 300, 800]], 'rgba(255,220,150,.035)');
  }
  // floor and the waiting crowd
  ctx = S(0.7);
  ctx.fillStyle = vgrad(ctx, 600, 800, [[0, '#3a2a1a'], [1, '#120c07']]); ctx.fillRect(X0, 600, XW, 400);
  for (let i = -8; i < 24; i++) seg(ctx, 640 + (i - 8) * 60 + px * 0.5, 600, 640 + (i - 8) * 190 + px * 0.9, 980, 'rgba(0,0,0,.25)', 1.5);
  ctx = A();
  crowdRow(ctx, 31, X0 + px * 0.7, 1540, 560, 30, 19, '#0c0806', t, { hat: 0.35, bob: 0.6 });
}, (ctx, t, px) => {
  // lots: slips of paper drifting down through the light
  for (let i = 0; i < 26; i++) {
    const d = rnd(i * 2.3);
    const x = mod(rnd(i) * 1500 + Math.sin(t * 0.7 + i) * 40 + px * 1.4, 1500) - 110;
    const y = mod(rnd(i * 5) * 800 + t * (26 + d * 30), 800) - 40;
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * (0.6 + d) + i);
    rect(ctx, -7, -2.5, 14, 5 * Math.abs(Math.cos(t * 2 + i)) + 1, `rgba(244,232,200,${0.25 + d * 0.4})`);
    ctx.restore();
  }
});

// ── bench: a magistrate's chamber, stacked files ──
function fileStack(ctx, x, y, w, n, seed) {
  const cols = ['#d9cba6', '#c9b68a', '#b8b4a0', '#a9b0b4', '#cfc0a0', '#bca47a'];
  for (let i = 0; i < n; i++) {
    const h = 7 + rnd(seed + i) * 6, off = (rnd(seed * 3 + i) - 0.5) * 12;
    y -= h;
    rect(ctx, x + off, y, w + (rnd(seed * 5 + i) - 0.5) * 14, h - 1, cols[Math.floor(rnd(seed * 7 + i) * cols.length)]);
    if (rnd(seed * 11 + i) < 0.4) rect(ctx, x + off + w * 0.3, y, 4, h - 1, '#a02a26');
  }
  return y;
}
def('bench', { amb: '#1c1610', rim: '#ffd9a0', key: 1 }, (ctx, t, px) => {
  ctx = S(0.2);
  fillAll(ctx, vgrad(ctx, -180, 800, [[0, '#1c140d'], [0.6, '#2c2015'], [1, '#150f0a']]));
  for (let i = -1; i < 12; i++) {
    const x = -220 + i * 160 + px * 0.2;
    ctx.strokeStyle = '#120c07'; ctx.lineWidth = 3; ctx.strokeRect(x + 12, 40, 136, 300); ctx.strokeRect(x + 12, 366, 136, 190);
    ctx.strokeStyle = 'rgba(255,220,160,.06)'; ctx.lineWidth = 1; ctx.strokeRect(x + 15, 43, 136, 300);
  }
  // window: the festival outside
  ctx = A();
  const wx = 96 + px * 0.25;
  rect(ctx, wx - 14, 40, 268, 440, '#0e0906');
  ctx.save(); ctx.beginPath(); ctx.rect(wx, 54, 240, 412); ctx.clip();
  ctx.fillStyle = vgrad(ctx, 54, 466, [[0, '#0a1230'], [1, '#2a3c68']]); ctx.fillRect(wx, 54, 240, 412);
  for (let i = 0; i < 46; i++) {
    const d = rnd(i * 3.7);
    const x = wx + rnd(i) * 240 + Math.sin(t * 0.4 + i) * 5 - px * 0.1;
    const y = 466 - mod(rnd(i * 5.3) * 420 + t * (6 + d * 12), 420);
    glow(ctx, x, y, 5 + d * 9, LANTERN_COLS[i % 5], 0.5);
  }
  skyline(ctx, 61, wx - 20 - px * 0.1, wx + 280, 466, 20, 90, 20, 50, '#070c20', '#ffcf7a', t);
  ctx.restore();
  rect(ctx, wx + 116, 54, 8, 412, '#0e0906'); rect(ctx, wx, 190, 240, 6, '#0e0906'); rect(ctx, wx, 330, 240, 6, '#0e0906');
  poly(ctx, [[wx, 466], [wx + 240, 466], [wx + 520, 980], [wx - 120, 980]], 'rgba(120,150,220,.05)');
  // the clock
  const kx = 440 + px * 0.25;
  rect(ctx, kx - 34, 70, 68, 300, '#22160d'); rect(ctx, kx - 40, 62, 80, 12, '#3a2614');
  circ(ctx, kx, 124, 27, '#e8dcc0'); circ(ctx, kx, 124, 2.5, '#1a100a');
  seg(ctx, kx, 124, kx + Math.sin(t * 0.02 + 1) * 13, 124 - Math.cos(t * 0.02 + 1) * 13, '#1a100a', 2.5);
  seg(ctx, kx, 124, kx + Math.sin(t * 0.3) * 20, 124 - Math.cos(t * 0.3) * 20, '#1a100a', 1.5);
  rect(ctx, kx - 24, 172, 48, 180, '#0d0806');
  const pa = Math.sin(t * 2.6) * 0.22;
  seg(ctx, kx, 174, kx + Math.sin(pa) * 150, 174 + Math.cos(pa) * 150, '#b08a3e', 2);
  circ(ctx, kx + Math.sin(pa) * 150, 174 + Math.cos(pa) * 150, 12, '#d8b25a');
  // shelves of files, floor to ceiling
  ctx = S(0.3);
  const sx0 = 560 + px * 0.3;
  rect(ctx, sx0 - 12, -180, 1100, 760, '#170f09');
  for (let r = 0; r < 6; r++) {
    const y = 76 + r * 100;
    rect(ctx, sx0 - 12, y, 1100, 9, '#3a2614');
    for (let c = 0; c < 9; c++) {
      const x = sx0 + c * 108 + rnd(r * 9 + c) * 16;
      if (rnd(r * 13 + c * 3) < 0.25) {
        // upright bundles
        for (let b = 0; b < 6; b++) {
          const h = 50 + rnd(r + c * 5 + b) * 34;
          rect(ctx, x + b * 14, y - h, 12, h, ['#b8a888', '#8a8f96', '#a89068', '#c4b89a'][Math.floor(rnd(r * 3 + c + b * 7) * 4)]);
          rect(ctx, x + b * 14, y - h * 0.6, 12, 3, '#8a2622');
        }
      } else fileStack(ctx, x, y, 84, 5 + Math.floor(rnd(r * 5 + c * 7) * 6), r * 17 + c);
    }
  }
  ctx.fillStyle = vgrad(ctx, -180, 580, [[0, 'rgba(0,0,0,.72)'], [0.55, 'rgba(0,0,0,.28)'], [1, 'rgba(0,0,0,.42)']]); ctx.fillRect(sx0 - 12, -180, 1100, 760);
  // the desk
  const dy = 566;
  ctx.fillStyle = vgrad(ctx, dy, 800, [[0, '#4a2e1a'], [0.12, '#2c1a0e'], [1, '#0e0806']]); ctx.fillRect(X0, dy, XW, 420);
  rect(ctx, X0, dy - 4, XW, 8, '#6a4426');
  // lamp
  const lx = 930 + px * 0.8;
  ctx = A();
  ctx = S(0.8, 0.34 * flick(t, 3) + 0.1);
  glow(ctx, lx, dy - 60, 420, '#ffd08a', 1);
  ctx = A();
  seg(ctx, lx, dy, lx, dy - 96, '#8a6a2e', 6); rect(ctx, lx - 30, dy - 8, 60, 8, '#8a6a2e');
  ctx.fillStyle = hgrad(ctx, lx - 70, lx + 70, [[0, '#0f3a2a'], [0.5, '#2c8a62'], [1, '#0f3a2a']]);
  ctx.beginPath(); ctx.moveTo(lx - 44, dy - 132); ctx.lineTo(lx + 44, dy - 132); ctx.lineTo(lx + 72, dy - 92); ctx.lineTo(lx - 72, dy - 92); ctx.fill();
  rect(ctx, lx - 66, dy - 94, 132, 5, '#fff2c8');
  poly(ctx, [[lx - 70, dy - 90], [lx + 70, dy - 90], [lx + 260, dy + 4], [lx - 260, dy + 4]], 'rgba(255,225,160,.09)');
  // scales
  const bx = 330 + px * 0.8, tip = Math.sin(t * 0.8) * 0.05;
  seg(ctx, bx, dy, bx, dy - 150, '#b08a3e', 5); rect(ctx, bx - 30, dy - 8, 60, 8, '#8a6a2e');
  ctx.save(); ctx.translate(bx, dy - 146); ctx.rotate(tip);
  seg(ctx, -76, 0, 76, 0, '#d8b25a', 4);
  for (const s of [-1, 1]) {
    seg(ctx, s * 76, 0, s * 76 - 24, 66, '#b08a3e', 1.2); seg(ctx, s * 76, 0, s * 76 + 24, 66, '#b08a3e', 1.2);
    ctx.fillStyle = '#c9a24a'; ctx.beginPath(); ctx.arc(s * 76, 66, 26, 0, Math.PI); ctx.fill();
  }
  ctx.restore();
  circ(ctx, bx, dy - 150, 7, '#f0d68a');
  // files on the desk, nearest the lens
  ctx = S(0.9);
  fileStack(ctx, 40 + px * 0.9, dy, 150, 14, 3);
  fileStack(ctx, 520 + px * 0.9, dy, 130, 8, 9);
  fileStack(ctx, 1090 + px * 0.9, dy, 160, 19, 14);
  fileStack(ctx, -150 + px * 0.9, dy, 150, 22, 21);
}, (ctx, t, px) => {
  motes(ctx, 7, 46, '#ffe6b0', t, { x0: 560 + px, x1: 1300 + px, y0: 180, y1: 600, vx: 4, vy: -5, r: 1.6, a: 0.4, tw: 1 });
});

// ── pier-riot ──
def('pier-riot', { amb: '#240c0c', rim: '#ff7a3c', key: -1 }, (ctx, t, px) => {
  ctx = S(0);
  fillAll(ctx, vgrad(ctx, -180, 470, [[0, '#0c0408'], [0.6, '#3a0e10'], [1, '#b0421a']]));
  ctx = A();
  const fl = flick(t, 4);
  ctx = S(0.2, 0.5 * fl);
  glow(ctx, 250 + px * 0.2, 440, 520, '#ff6a1a', 1);
  ctx = A();
  ctx = S(0.2, 0.3 * flick(t, 9));
  glow(ctx, 1080 + px * 0.2, 450, 300, '#ff8a2a', 1);
  ctx = A();
  for (let i = 0; i < 16; i++) {
    const x = mod(rnd(i) * 1800 + t * (6 + rnd(i * 3) * 8), 1800) - 260, y = 60 + rnd(i * 5) * 300;
    ctx.fillStyle = `rgba(14,6,8,${0.2 + rnd(i * 7) * 0.2})`;
    ctx.beginPath(); ctx.ellipse(x, y, 130 + rnd(i * 9) * 150, 40 + rnd(i * 2) * 40, 0, 0, TAU); ctx.fill();
  }
  ctx = S(0.2);
  skyline(ctx, 21, X0 + px * 0.2, 1560, 470, 40, 150, 70, 150, '#12060a', '#ff8a3a', t);
  // cranes
  for (const cx of [170, 880, 1230]) {
    const x = cx + px * 0.25;
    ctx.strokeStyle = '#12060a'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(x - 22, 470); ctx.lineTo(x, 190); ctx.lineTo(x + 22, 470); ctx.moveTo(x, 200); ctx.lineTo(x + 150, 250); ctx.moveTo(x, 200); ctx.lineTo(x - 50, 230); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 140, 248); ctx.lineTo(x + 140 + Math.sin(t * 0.8 + cx) * 6, 380); ctx.stroke();
  }
  ctx.fillStyle = vgrad(ctx, 470, 800, [[0, '#4a1410'], [0.4, '#1c080c'], [1, '#07030a']]); ctx.fillRect(X0, 470, XW, 520);
  ctx = A();
  waterStreaks(ctx, 23, X0, 1540, 474, 800, 150, '#ff7a2a', t, 0.6);
  // the pier, running away from us
  ctx = S(0.3);
  const vx = 640 + px * 0.3;
  ctx.fillStyle = vgrad(ctx, 480, 800, [[0, '#2a1612'], [1, '#120a08']]);
  poly(ctx, [[vx - 150, 482], [vx + 150, 482], [1560, 980], [-280, 980]]); ctx.fill();
  for (let i = 0; i < 16; i++) { const y = 482 + i * i * 2.4 + i * 4; seg(ctx, X0, y, X0 + XW, y, 'rgba(0,0,0,.3)', 1 + i * 0.12); }
  ctx.fillStyle = vgrad(ctx, 470, 800, [[0, '#4a1410'], [0.4, '#1c080c'], [1, '#07030a']]);
  poly(ctx, [[vx - 150, 482], [-280, 980], [X0, 980], [X0, 482]]); ctx.fill();
  poly(ctx, [[vx + 150, 482], [1560, 980], [1560, 482]]); ctx.fill();
  ctx = A();
  waterStreaks(ctx, 27, X0, 380, 490, 800, 40, '#ff7a2a', t, 0.5);
  waterStreaks(ctx, 29, 900, 1540, 490, 800, 40, '#ff7a2a', t, 0.5);
  for (let i = 0; i < 6; i++) {
    const u = i / 5, e = u * u;
    for (const s of [-1, 1]) {
      const x = vx + s * lerp(150, 720, e), y = lerp(482, 760, e), h = lerp(26, 130, e);
      rect(ctx, x - h * 0.07, y - h, h * 0.14, h * 1.3, '#0c0606');
      if ((i + (s > 0 ? 1 : 0)) % 3 !== 0) lantern(ctx, x, y - h - h * 0.05, h * 0.11, LANTERN_COLS[i % 3], t, i * 3 + s);
    }
  }
  // the Compact on the boards
  crowdRow(ctx, 41, vx - 190, vx + 190, 470, 20, 9, '#0c0507', t, { fists: 0.3, torch: 0.1 });
  crowdRow(ctx, 43, vx - 420, vx + 420, 496, 24, 17, '#0a0406', t, { fists: 0.35, signs: 0.12, torch: 0.08, signCol: '#b8a888', signInk: '#3a0e10', hat: 0.4 });
  crowdRow(ctx, 47, X0 + px * 0.7, 1540, 548, 22, 30, '#070304', t, { fists: 0.3, signs: 0.14, torch: 0.06, signCol: '#cdbd98', signInk: '#3a0e10', hat: 0.4 });
}, (ctx, t, px) => {
  motes(ctx, 3, 70, '#ffb060', t, { x0: -100 + px, x1: 1400 + px, y0: 0, y1: 800, vx: 14, vy: -60, r: 2, a: 0.8, tw: 1, wob: 22 });
  for (let i = 0; i < 5; i++) {
    const x = mod(rnd(i * 3) * 1700 + t * 20, 1700) - 220;
    ctx.fillStyle = 'rgba(20,8,8,.14)'; ctx.beginPath(); ctx.ellipse(x, 120 + i * 130, 300, 70, 0, 0, TAU); ctx.fill();
  }
});

// ── mint-office: Corvane's panelled room ──
def('mint-office', { amb: '#1e120c', rim: '#ffb070', key: -1 }, (ctx, t, px) => {
  ctx = S(0.2);
  fillAll(ctx, vgrad(ctx, -180, 800, [[0, '#1a0a0c'], [0.5, '#34141a'], [1, '#1a0b0a']]));
  for (let i = -1; i < 9; i++) {
    const x = -230 + i * 230 + px * 0.2;
    ctx.strokeStyle = '#8a6a2e'; ctx.lineWidth = 2; ctx.strokeRect(x + 16, 30, 198, 410);
    ctx.strokeStyle = 'rgba(138,106,46,.5)'; ctx.lineWidth = 1; ctx.strokeRect(x + 28, 42, 174, 386);
  }
  ctx.fillStyle = vgrad(ctx, 470, 800, [[0, '#24120c'], [1, '#0e0705']]); ctx.fillRect(X0, 470, XW, 520);
  rect(ctx, X0, 466, XW, 7, '#8a6a2e'); rect(ctx, X0, 473, XW, 3, '#3a2610');
  // the seal of the Mint
  const sx = 640 + px * 0.2;
  glow(ctx, sx, 210, 240, '#d8b25a', 0.12);
  circ(ctx, sx, 210, 112, '#1c0c0e');
  ctx.strokeStyle = '#d8b25a'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(sx, 210, 112, 0, TAU); ctx.stroke();
  ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx, 210, 96, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(sx, 210, 70, 0, TAU); ctx.stroke();
  sigilScale(ctx, sx, 212, 40, '#d8b25a', 4);
  ctx.save(); ctx.translate(sx, 210); ctx.fillStyle = '#d8b25a'; ctx.font = `600 15px ${FONT_SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const motto = 'PAYABLE · IN · CALM · THE · MINT · OF · AURELLE · ';
  for (let i = 0; i < motto.length; i++) { ctx.save(); ctx.rotate((i / motto.length) * TAU - Math.PI / 2); ctx.fillText(motto[i], 0, -83); ctx.restore(); }
  ctx.restore(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  // window on the harbour
  ctx = A();
  const wx = 900 + px * 0.3;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(wx, 470); ctx.lineTo(wx, 190); ctx.arc(wx + 130, 190, 130, Math.PI, 0); ctx.lineTo(wx + 260, 470); ctx.closePath();
  ctx.fillStyle = '#0c0606'; ctx.fill(); ctx.clip();
  ctx.fillStyle = vgrad(ctx, 60, 470, [[0, '#070b20'], [1, '#27406c']]); ctx.fillRect(wx, 50, 260, 420);
  for (let i = 0; i < 40; i++) {
    const d = rnd(i * 3.3), x = wx + rnd(i) * 260 + Math.sin(t * 0.4 + i) * 4 - px * 0.12, y = 470 - mod(rnd(i * 5) * 420 + t * (5 + d * 10), 420);
    glow(ctx, x, y, 4 + d * 8, LANTERN_COLS[i % 5], 0.5);
  }
  skyline(ctx, 71, wx - 30 - px * 0.12, wx + 300, 440, 14, 70, 16, 40, '#060a1c', '#ffcf7a', t);
  rect(ctx, wx, 440, 260, 30, '#0a1230');
  waterStreaks(ctx, 73, wx, wx + 260, 442, 470, 14, '#ffb85c', t, 0.6);
  ctx.restore();
  ctx.strokeStyle = '#1a0c08'; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(wx, 470); ctx.lineTo(wx, 190); ctx.arc(wx + 130, 190, 130, Math.PI, 0); ctx.lineTo(wx + 260, 470); ctx.moveTo(wx + 130, 60); ctx.lineTo(wx + 130, 470); ctx.moveTo(wx, 300); ctx.lineTo(wx + 260, 300); ctx.stroke();
  for (const s of [0, 1]) { // velvet
    const x = wx + (s ? 228 : -46);
    ctx.fillStyle = hgrad(ctx, x, x + 78, [[0, '#0e2a20'], [0.3, '#1c5440'], [0.6, '#0e2a20'], [0.85, '#1a4a38'], [1, '#0a1e17']]);
    ctx.beginPath(); ctx.moveTo(x, 30); ctx.lineTo(x + 78, 30); ctx.quadraticCurveTo(x + 70 + Math.sin(t * 0.6 + s) * 3, 300, x + 90, 600); ctx.lineTo(x - 12, 600); ctx.quadraticCurveTo(x + 8, 300, x, 30); ctx.fill();
  }
  rect(ctx, wx - 70, 22, 400, 14, '#8a6a2e');
  // fireplace
  const fx = 210 + px * 0.3;
  rect(ctx, fx - 150, 250, 300, 230, '#3c3430'); rect(ctx, fx - 170, 236, 340, 22, '#57504a');
  rect(ctx, fx - 96, 310, 192, 170, '#080405');
  ctx = S(0.3, 0.26 * flick(t, 5) + 0.06);
  glow(ctx, fx, 440, 380, '#ff7a2a', 1);
  ctx = A();
  for (let i = -1; i <= 1; i++) flame(ctx, fx + i * 44, 474, 30 - Math.abs(i) * 6, t, 5 + i);
  seg(ctx, fx - 80, 470, fx + 80, 462, '#1a0c06', 12); seg(ctx, fx - 60, 458, fx + 70, 474, '#24100a', 10);
  // a founder, in oils
  rect(ctx, fx - 92, 30, 184, 190, '#8a6a2e'); rect(ctx, fx - 80, 42, 160, 166, '#140c0c');
  ctx.fillStyle = '#2a1c1a'; ctx.beginPath(); ctx.ellipse(fx, 108, 30, 38, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(fx - 70, 208); ctx.quadraticCurveTo(fx - 60, 150, fx, 146); ctx.quadraticCurveTo(fx + 60, 150, fx + 70, 208); ctx.fill();
  glow(ctx, fx - 10, 100, 60, '#c9a880', 0.16);
  // mantel clock
  rect(ctx, fx - 22, 196, 44, 40, '#2a1a0e'); circ(ctx, fx, 214, 14, '#e8dcc0');
  seg(ctx, fx, 214, fx + Math.sin(t * 0.25) * 10, 214 - Math.cos(t * 0.25) * 10, '#1a100a', 1.5);
  // the desk: the bond waiting to be signed
  ctx = S(0.9);
  const dy = 584;
  ctx.fillStyle = vgrad(ctx, dy, 800, [[0, '#3e1e12'], [0.14, '#22100a'], [1, '#0a0504']]); ctx.fillRect(X0, dy, XW, 420);
  rect(ctx, X0, dy - 4, XW, 7, '#6a3a1e'); rect(ctx, X0, dy + 3, XW, 2, '#8a6a2e');
  const lx = 1120 + px * 0.9;
  glow(ctx, lx, dy - 70, 320, '#ffd08a', 0.26);
  seg(ctx, lx, dy, lx, dy - 100, '#b08a3e', 6); rect(ctx, lx - 28, dy - 8, 56, 8, '#b08a3e');
  ctx.fillStyle = '#e8d8a8'; ctx.beginPath(); ctx.moveTo(lx - 34, dy - 150); ctx.lineTo(lx + 34, dy - 150); ctx.lineTo(lx + 54, dy - 96); ctx.lineTo(lx - 54, dy - 96); ctx.fill();
  const ox = 150 + px * 0.9; // a desk orrery, turning
  seg(ctx, ox, dy, ox, dy - 56, '#b08a3e', 5); rect(ctx, ox - 24, dy - 8, 48, 8, '#8a6a2e');
  ctx = A();
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = '#d8b25a'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(ox, dy - 90, 46 - i * 9, Math.max(2, (46 - i * 9) * Math.abs(Math.sin(t * (0.3 + i * 0.17) + i))), i * 0.9, 0, TAU); ctx.stroke();
  }
  coldFlame(ctx, ox, dy - 84, 9, t, 2); // a lamp-engine in little: his own light, on his own desk
});

// ── ferry-dawn ──
def('ferry-dawn', { amb: '#4a3550', rim: '#ffd0a0', key: 1 }, (ctx, t, px) => {
  const rock = Math.sin(t * 0.5) * 0.007;
  ctx = S(0);
  fillAll(ctx, vgrad(ctx, -180, 440, [[0, '#232c54'], [0.45, '#7a557c'], [0.8, '#ee9c72'], [1, '#ffdca6']]));
  ctx = A();
  stars(ctx, 6, 30, 120, t);
  const sx = 640 + px * 0.05;
  ctx = S(0.05);
  glow(ctx, sx, 436, 520, '#fff0c0', 0.5);
  circ(ctx, sx, 436, 44, '#fff6dc');
  ctx = A();
  for (let i = 0; i < 9; i++) {
    const x = mod(rnd(i * 3) * 1700 + t * (2 + rnd(i) * 3), 1700) - 220 + px * 0.1, y = 150 + rnd(i * 7) * 220;
    ctx.fillStyle = `rgba(255,190,150,${0.25 + rnd(i * 5) * 0.2})`; ctx.beginPath(); ctx.ellipse(x, y, 120 + rnd(i * 2) * 160, 9 + rnd(i * 9) * 9, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(90,60,110,.25)'; ctx.beginPath(); ctx.ellipse(x + 10, y - 9, 110 + rnd(i * 2) * 150, 8, 0, 0, TAU); ctx.fill();
  }
  for (let i = 0; i < 5; i++) { // gulls
    const x = mod(200 + i * 260 + t * (18 + i * 4), 1700) - 200, y = 170 + i * 34 + Math.sin(t * 0.8 + i) * 16, w = 12 + i * 2, fl = Math.sin(t * 5 + i * 2) * 5;
    ctx.strokeStyle = 'rgba(40,30,50,.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - w, y - fl); ctx.quadraticCurveTo(x - w * 0.4, y - 5, x, y); ctx.quadraticCurveTo(x + w * 0.4, y - 5, x + w, y - fl); ctx.stroke();
  }
  // Vessery, behind us, its last lanterns going out
  ctx = S(0.15);
  const vx = 150 + px * 0.15;
  ctx.fillStyle = '#5a4668'; ctx.beginPath(); ctx.moveTo(X0, 442); ctx.lineTo(X0, 400); ctx.bezierCurveTo(vx - 100, 360, vx + 200, 400, vx + 420, 442); ctx.fill();
  skyline(ctx, 33, X0 + px * 0.15, vx + 360, 442, 8, 64, 14, 40, '#4c3a5e', null, t);
  ctx = A();
  for (let i = 0; i < 40; i++) {
    const a = 0.75 * Math.max(0, Math.sin(t * 0.25 + i * 1.3));
    rect(ctx, X0 + 40 + rnd(i) * (vx + 520), 442 - rnd(i * 3) * 150 - mod(t * 3 + i * 9, 80), 2.5, 3.5, rgba('#ffcf7a', a));
  }
  ctx = S(0);
  ctx.fillStyle = vgrad(ctx, 440, 800, [[0, '#e9a57c'], [0.25, '#8a6482'], [1, '#1c2444']]); ctx.fillRect(X0, 440, XW, 560);
  ctx = A();
  waterStreaks(ctx, 35, sx - 150, sx + 150, 444, 700, 90, '#fff0c0', t, 0.85);
  waterStreaks(ctx, 37, X0, 1540, 446, 800, 130, '#ffe0c8', t, 0.35);
  for (let i = 0; i < 7; i++) { // the wake
    const y = 500 + i * 34, w = 80 + i * 110, ph = Math.sin(t * 0.9 + i) * 10;
    ctx.strokeStyle = `rgba(255,240,225,${0.3 - i * 0.03})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(300 - w + ph, y); ctx.quadraticCurveTo(300, y - 12, 300 + w + ph, y + 4); ctx.stroke();
  }
  // the ferry rail
  ctx.save();
  ctx.translate(640, 640); ctx.rotate(-rock); ctx.translate(-640, -640);
  ctx = S(1.1);
  const rx = px * 1.1;
  ctx.fillStyle = vgrad(ctx, 700, 800, [[0, '#2a1c20'], [1, '#120c10']]); ctx.fillRect(X0, 706, XW, 300);
  for (let i = -2; i < 12; i++) {
    const x = i * 170 + rx;
    ctx.fillStyle = hgrad(ctx, x, x + 16, [[0, '#1c1216'], [0.5, '#4a3030'], [1, '#1c1216']]); ctx.fillRect(x, 552, 16, 170);
  }
  rect(ctx, X0, 548, XW, 15, '#3a2424'); rect(ctx, X0, 548, XW, 3, 'rgba(255,200,150,.4)');
  rect(ctx, X0, 632, XW, 8, '#2a1a1c');
  ctx.strokeStyle = '#d8ccb8'; ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(196 + rx, 610, 36, 0, TAU); ctx.stroke();
  ctx.strokeStyle = '#b0342a'; ctx.lineWidth = 12;
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(196 + rx, 610, 36, i * (Math.PI / 2) + 0.5, i * (Math.PI / 2) + 1.05); ctx.stroke(); }
  ctx = A();
  lantern(ctx, 1040 + rx, 440, 16, '#ffd9a0', t, 4);
  seg(ctx, 1040 + rx, 440, 1040 + rx, 552, '#1c1216', 5); seg(ctx, 1040 + rx, 440, 1070 + rx, 440, '#1c1216', 4);
  ctx.restore();
}, (ctx, t, px) => {
  for (let i = 0; i < 6; i++) {
    const x = mod(rnd(i * 3) * 1900 + t * (12 + i * 3), 1900) - 300 + px;
    ctx.fillStyle = 'rgba(255,225,205,.07)'; ctx.beginPath(); ctx.ellipse(x, 470 + i * 44, 360, 30, 0, 0, TAU); ctx.fill();
  }
});

// ── causeway: a salt-white road across tidal flats ──
def('causeway', { amb: '#6e7884', rim: '#ffffff', key: 1 }, (ctx, t, px) => {
  ctx = S(0);
  fillAll(ctx, vgrad(ctx, -180, 436, [[0, '#7f97ad'], [0.6, '#bccbd4'], [1, '#eceee6']]));
  glow(ctx, 380 + px * 0.05, 120, 420, '#ffffff', 0.5);
  circ(ctx, 380 + px * 0.05, 120, 30, 'rgba(255,255,250,.95)');
  ctx = A();
  for (let i = 0; i < 10; i++) {
    const x = mod(rnd(i * 3) * 1800 + t * (3 + rnd(i) * 4), 1800) - 260 + px * 0.1, y = 90 + rnd(i * 7) * 280;
    ctx.fillStyle = `rgba(255,255,255,${0.3 + rnd(i * 5) * 0.3})`; ctx.beginPath(); ctx.ellipse(x, y, 130 + rnd(i * 2) * 190, 12 + rnd(i * 9) * 14, 0, 0, TAU); ctx.fill();
  }
  // Saltmere on the horizon
  const hx = 760 + px * 0.12, hc = '#8494a2';
  rect(ctx, hx - 260, 418, 520, 20, hc);
  skyline(ctx, 51, hx - 250, hx + 250, 436, 8, 40, 16, 44, hc, null, t);
  ctx.strokeStyle = hc; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(hx - 34, 436); ctx.lineTo(hx, 330); ctx.lineTo(hx + 34, 436); ctx.moveTo(hx, 336); ctx.lineTo(hx + 80, 436); ctx.moveTo(hx - 20, 400); ctx.lineTo(hx + 20, 400); ctx.moveTo(hx - 12, 368); ctx.lineTo(hx + 12, 368); ctx.stroke();
  ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(hx, 330, 15, 0, TAU); ctx.stroke();
  for (const cx of [hx - 150, hx + 170]) {
    rect(ctx, cx - 5, 356, 10, 80, hc);
    for (let j = 0; j < 6; j++) { ctx.fillStyle = `rgba(150,160,170,${0.3 - j * 0.045})`; ctx.beginPath(); ctx.arc(cx + j * 16 + Math.sin(t * 0.6 + j) * 5, 350 - j * 12, 9 + j * 5, 0, TAU); ctx.fill(); }
  }
  // the flats
  ctx = S(0.3);
  ctx.fillStyle = vgrad(ctx, 436, 800, [[0, '#e4e7df'], [0.3, '#cfd6d4'], [1, '#aeb9bd']]); ctx.fillRect(X0, 436, XW, 560);
  ctx = A();
  for (let i = 0; i < 26; i++) {
    const d = rnd(i * 2.7), y = 446 + d * d * 330, w = (60 + rnd(i * 3) * 220) * (0.3 + d), x = rnd(i * 5) * 1800 - 260 + px * (0.2 + d * 0.6);
    ctx.fillStyle = `rgba(150,184,208,${0.45 + 0.15 * Math.sin(t * 0.7 + i)})`; ctx.beginPath(); ctx.ellipse(x, y, w, w * 0.07 + 1.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(x - w * 0.5 + Math.sin(t + i) * w * 0.2, y - 1, w * 0.4, 1.5);
  }
  for (let i = 0; i < 5; i++) { // shimmer where the road meets the sky
    ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let x = X0; x < 1540; x += 20) ctx.lineTo(x, 438 + i * 4 + Math.sin(x * 0.03 + t * 2 + i) * 1.6);
    ctx.stroke();
  }
  // the road
  const vx = hx - 30;
  ctx.fillStyle = vgrad(ctx, 436, 800, [[0, '#f6f5ee'], [1, '#e2e0d6']]);
  poly(ctx, [[vx - 5, 437], [vx + 5, 437], [1250 + px, 980], [-250 + px, 980]]); ctx.fill();
  ctx.fillStyle = 'rgba(120,130,140,.22)';
  poly(ctx, [[vx + 5, 437], [1250 + px, 980], [1330 + px, 980]]); ctx.fill();
  poly(ctx, [[vx - 5, 437], [-250 + px, 980], [-330 + px, 980]]); ctx.fill();
  for (const o of [-0.18, 0.2]) { ctx.strokeStyle = 'rgba(150,150,140,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(vx, 438); ctx.lineTo(500 + px + o * 1500, 980); ctx.stroke(); }
  for (let i = 1; i < 9; i++) {
    const e = Math.pow(i / 8, 2.4), y = lerp(440, 900, e);
    for (const s of [-1, 1]) {
      const x = lerp(vx + s * 6, (s < 0 ? -250 : 1250) + px, (y - 437) / (980 - 437)) + s * 6, h = 8 + e * 150;
      rect(ctx, x - h * 0.03, y - h, Math.max(1.5, h * 0.06), h, '#4a4a48');
      const fl = Math.sin(t * 5 + i + s) * h * 0.04;
      poly(ctx, [[x, y - h], [x + h * 0.28, y - h * 0.9 + fl], [x, y - h * 0.8]], '#b03a2a');
    }
  }
}, (ctx, t, px) => {
  // salt on the wind
  motes(ctx, 5, 70, '#ffffff', t, { x0: -200 + px, x1: 1500 + px, y0: 300, y1: 800, vx: 260, vy: 14, r: 2, a: 0.5, streak: 7, wob: 6 });
  for (let i = 0; i < 4; i++) {
    const x = mod(rnd(i * 3) * 2200 + t * 120, 2200) - 500;
    ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.beginPath(); ctx.ellipse(x, 560 + i * 60, 380, 26, 0, 0, TAU); ctx.fill();
  }
});

// ── picket: pithead gates, braziers ──
function brazier(ctx, x, y, s, t, seed) {
  glow(ctx, x, y - s * 0.6, s * 5.5, '#ff7a2a', 0.3 * flick(t, seed));
  flame(ctx, x - s * 0.3, y - s * 0.9, s * 0.55, t, seed); flame(ctx, x + s * 0.3, y - s * 0.9, s * 0.45, t, seed + 3);
  ctx.fillStyle = '#17110f'; ctx.fillRect(x - s * 0.6, y - s, s * 1.2, s * 1.3);
  for (let i = 0; i < 9; i++) circ(ctx, x - s * 0.42 + (i % 3) * s * 0.42, y - s * 0.72 + Math.floor(i / 3) * s * 0.38, s * 0.09, rgba('#ff9a3a', 0.6 + 0.4 * Math.sin(t * 6 + i + seed)));
  seg(ctx, x - s * 0.5, y + s * 0.3, x - s * 0.8, y + s * 1.1, '#17110f', s * 0.12); seg(ctx, x + s * 0.5, y + s * 0.3, x + s * 0.8, y + s * 1.1, '#17110f', s * 0.12);
}
def('picket', { amb: '#141a2a', rim: '#ff9a48', key: 1 }, (ctx, t, px) => {
  ctx = S(0);
  fillAll(ctx, vgrad(ctx, -180, 540, [[0, '#080d1e'], [0.6, '#1c2746'], [1, '#473a4c']]));
  ctx = A();
  stars(ctx, 8, 90, 330, t);
  // headframe
  ctx = S(0.5);
  const hx = 960 + px * 0.2, hc = '#0b0e18';
  ctx.strokeStyle = hc; ctx.lineWidth = 9;
  ctx.beginPath(); ctx.moveTo(hx - 70, 560); ctx.lineTo(hx - 26, 90); ctx.moveTo(hx + 70, 560); ctx.lineTo(hx + 26, 90); ctx.moveTo(hx - 26, 96); ctx.lineTo(hx - 300, 560); ctx.stroke();
  ctx.lineWidth = 4;
  for (let i = 0; i < 6; i++) { const y0 = 130 + i * 72, w0 = 30 + i * 7.4, w1 = 30 + (i + 1) * 7.4; ctx.beginPath(); ctx.moveTo(hx - w0, y0); ctx.lineTo(hx + w1, y0 + 72); ctx.moveTo(hx + w0, y0); ctx.lineTo(hx - w1, y0 + 72); ctx.moveTo(hx - w0, y0); ctx.lineTo(hx + w0, y0); ctx.stroke(); }
  ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(hx, 76, 44, 0, TAU); ctx.stroke();
  ctx.lineWidth = 2.5; for (let i = 0; i < 8; i++) seg(ctx, hx, 76, hx + Math.cos(i * 0.785 + 0.2) * 44, 76 + Math.sin(i * 0.785 + 0.2) * 44, hc, 2.5);
  seg(ctx, hx - 44, 76, hx - 318, 548, hc, 1.5);
  skyline(ctx, 81, X0 + px * 0.25, 1560, 560, 60, 170, 90, 180, '#0b0e18', '#ffb060', t);
  // the wall and the gates
  const gx = 640 + px * 0.5;
  ctx.fillStyle = vgrad(ctx, 290, 580, [[0, '#1e2230'], [1, '#12141c']]); ctx.fillRect(X0, 300, XW, 290);
  for (let x = X0 + mod(px * 0.5, 22); x < 1540; x += 22) rect(ctx, x, 300, 3, 290, 'rgba(0,0,0,.28)');
  for (let x = X0 + mod(px * 0.5, 90); x < 1540; x += 90) { seg(ctx, x, 300, x + 16, 280, '#0b0e18', 2); seg(ctx, x + 16, 280, x + 60, 284, '#0b0e18', 1.2); }
  rect(ctx, gx - 250, 250, 500, 350, '#0c0f18');
  ctx.fillStyle = vgrad(ctx, 250, 600, [[0, '#2a2438'], [1, '#3a2c34']]); ctx.fillRect(gx - 226, 276, 452, 324);
  // beyond the bars: the dark yard
  glow(ctx, gx, 520, 260, '#ff8a3a', 0.1);
  for (let i = 0; i <= 18; i++) { const x = gx - 226 + i * 25.1; rect(ctx, x - 3, 276, 6, 324, '#0c0f18'); poly(ctx, [[x - 6, 280], [x, 262], [x + 6, 280]], '#0c0f18'); }
  rect(ctx, gx - 226, 330, 452, 8, '#0c0f18'); rect(ctx, gx - 226, 540, 452, 8, '#0c0f18'); rect(ctx, gx - 5, 262, 10, 338, '#0c0f18');
  ctx.strokeStyle = '#7a7f8c'; ctx.lineWidth = 3; ctx.setLineDash([7, 5]); ctx.beginPath(); ctx.moveTo(gx - 34, 426); ctx.quadraticCurveTo(gx, 468, gx + 34, 426); ctx.stroke(); ctx.setLineDash([]);
  rect(ctx, gx - 11, 446, 22, 20, '#8a8f9c');
  // the arch sign
  ctx.strokeStyle = '#0c0f18'; ctx.lineWidth = 34; ctx.beginPath(); ctx.arc(gx, 420, 300, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
  ctx.save(); ctx.translate(gx, 420); ctx.fillStyle = '#b9b2a0'; ctx.font = `700 21px ${FONT_SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const sign = 'SALTMERE  No. 2  PIT';
  for (let i = 0; i < sign.length; i++) { ctx.save(); ctx.rotate(((i - (sign.length - 1) / 2) / sign.length) * 1.5); ctx.fillText(sign[i], 0, -300); ctx.restore(); }
  ctx.restore(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  // the notice
  ctx = A();
  ctx.save(); ctx.translate(gx + 96, 352); ctx.rotate(0.03 + Math.sin(t * 1.4) * 0.008);
  rect(ctx, 0, 0, 96, 130, '#dcd4bc');
  ctx.fillStyle = '#3a1410'; ctx.font = `700 11px ${FONT_SERIF}`; ctx.textAlign = 'center';
  ctx.fillText('NOTICE OF', 48, 20); ctx.fillText('FORECLOSURE', 48, 34);
  for (let i = 0; i < 6; i++) rect(ctx, 12, 46 + i * 10, 72 - (i % 3) * 12, 2, 'rgba(40,30,30,.6)');
  circ(ctx, 72, 112, 11, '#a02a26');
  const fl = Math.sin(t * 2.2) * 4;
  poly(ctx, [[0, 130], [22 + fl, 122 - fl], [0, 104]], '#b8b09a');
  ctx.restore(); ctx.textAlign = 'left';
  // ground
  ctx = S(0.8);
  ctx.fillStyle = vgrad(ctx, 590, 800, [[0, '#1c1a22'], [1, '#0b0a10']]); ctx.fillRect(X0, 590, XW, 420);
  for (let i = 0; i < 20; i++) { ctx.fillStyle = 'rgba(200,210,225,.09)'; ctx.beginPath(); ctx.ellipse(rnd(i) * 1800 - 260 + px * 0.8, 600 + rnd(i * 3) * 190, 60 + rnd(i * 5) * 140, 5 + rnd(i * 7) * 9, 0, 0, TAU); ctx.fill(); }
  // the picket
  ctx = A();
  crowdRow(ctx, 91, -220 + px * 0.6, gx - 280, 530, 8, 24, '#090a10', t, { signs: 0.3, signCol: '#b8b09a', signInk: '#2a1410', hat: 0.6, bob: 0.4 });
  crowdRow(ctx, 93, gx + 280, 1500 + px * 0.6, 530, 8, 24, '#090a10', t, { signs: 0.3, signCol: '#b8b09a', signInk: '#2a1410', hat: 0.6, bob: 0.4 });
  brazier(ctx, 446 + px * 0.8, 600, 34, t, 1);
  brazier(ctx, 838 + px * 0.8, 606, 36, t, 2);
}, (ctx, t, px) => {
  motes(ctx, 9, 130, '#e8eef8', t, { x0: -100 + px, x1: 1400 + px, y0: -20, y1: 800, vx: 16, vy: 38, r: 1.8, a: 0.6, wob: 14 });
  motes(ctx, 11, 26, '#ffb060', t, { x0: 380 + px, x1: 520 + px, y0: 260, y1: 580, vx: 6, vy: -70, r: 1.7, a: 0.9, tw: 1 });
  motes(ctx, 13, 26, '#ffb060', t, { x0: 770 + px, x1: 910 + px, y0: 260, y1: 580, vx: -6, vy: -70, r: 1.7, a: 0.9, tw: 1 });
});

// ── mine-deep: a blue-lit stillsalt gallery ──
function crystal(ctx, x, y, s, a, t, seed) {
  const pulse = 0.6 + 0.4 * Math.sin(t * 1.3 + seed * 5);
  glow(ctx, x, y - s * 0.4, s * 2.6, '#3fb4ff', 0.3 * pulse);
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  for (let i = 0; i < 5; i++) {
    const r = (i - 2) * 0.34 + (rnd(seed + i) - 0.5) * 0.2, h = s * (0.5 + rnd(seed * 3 + i) * 0.8), w = s * (0.1 + rnd(seed * 5 + i) * 0.1);
    ctx.save(); ctx.rotate(r);
    poly(ctx, [[-w, 0], [-w, -h * 0.8], [0, -h], [0, 0]], css(mix('#1c5a9a', '#bfeaff', 0.2 + 0.5 * pulse * rnd(seed * 7 + i))));
    poly(ctx, [[0, 0], [0, -h], [w, -h * 0.8], [w, 0]], css(mix('#0e3466', '#7fd0ff', 0.25 * pulse)));
    ctx.restore();
  }
  ctx.restore();
}
def('mine-deep', { amb: '#061430', rim: '#6fd8ff', key: 1 }, (ctx, t, px) => {
  ctx = S(0.35);
  fillAll(ctx, '#02060e');
  const vx = 640 + px * 0.35, vy = 380;
  glow(ctx, vx, vy, 520, '#12509a', 0.45);
  // the gallery, receding set by set
  for (let i = 0; i < 6; i++) {
    const u = i / 5, s = lerp(0.15, 1.02, Math.pow(u, 1.5)), w = 560 * s, h = 400 * s, x = vx;
    const arch = () => {
      ctx.moveTo(x - w, vy + h * 0.72);
      for (let k = 0; k <= 14; k++) { const a = Math.PI + (k / 14) * Math.PI, jr = 1 + (rnd(i * 20 + k) - 0.5) * 0.13; ctx.lineTo(x + Math.cos(a) * w * jr, vy - h * 0.2 + Math.sin(a) * h * 0.8 * jr); }
      ctx.lineTo(x + w, vy + h * 0.72);
      ctx.closePath();
    };
    // the rock face around this opening, lit from within
    ctx.fillStyle = css(mix('#123768', '#040a18', u));
    ctx.beginPath(); ctx.rect(X0, -180, XW, 1160); arch(); ctx.fill('evenodd');
    ctx.strokeStyle = rgba('#6fc0ff', 0.26 - u * 0.12); ctx.lineWidth = 2 + s * 3;
    ctx.beginPath(); arch(); ctx.stroke();
    // facets of bare, pick-marked rock where the seam has been taken
    for (let k = 0; k < 10; k++) {
      const sd = k % 2 ? 1 : -1, bx = x + sd * w * (1.04 + rnd(i * 9 + k) * 0.5), by = vy - h * 0.8 + rnd(i * 5 + k) * h * 1.5, fs = (14 + rnd(i * 3 + k) * 26) * (0.4 + s);
      poly(ctx, [[bx, by], [bx + fs, by + fs * 0.3], [bx + fs * 0.6, by + fs], [bx - fs * 0.3, by + fs * 0.7]], `rgba(${k % 3 ? '4,10,24' : '70,110,170'},${k % 3 ? 0.28 : 0.1})`);
    }
    // timber set
    const tw = 5 + s * 20;
    for (const sd of [-1, 1]) {
      seg(ctx, x + sd * w * 0.9, vy + h * 0.74, x + sd * w * 0.78, vy - h * 0.6, css(mix('#5a4028', '#0a0c12', u * 0.8)), tw);
      seg(ctx, x + sd * w * 0.9 - tw * 0.3, vy + h * 0.74, x + sd * w * 0.78 - tw * 0.3, vy - h * 0.6, rgba('#9fd0ff', 0.2 - u * 0.1), Math.max(1, tw * 0.14));
    }
    seg(ctx, x - w * 0.86, vy - h * 0.6, x + w * 0.86, vy - h * 0.6, css(mix('#6a4a2e', '#0c0e14', u * 0.8)), tw * 1.1);
    seg(ctx, x - w * 0.86, vy - h * 0.6 + tw * 0.5, x + w * 0.86, vy - h * 0.6 + tw * 0.5, 'rgba(0,0,0,.4)', Math.max(1, tw * 0.2));
  }
  ctx = A();
  for (let i = 0; i < 6; i++) { // what is left of the stillsalt
    const s = lerp(0.15, 1.02, Math.pow(i / 5, 1.5)), w = 560 * s, h = 400 * s, x = vx;
    crystal(ctx, x - w * 1.0, vy + h * (0.5 - rnd(i) * 0.5), 46 * s + 11, 1.25, t, i * 3 + 1);
    crystal(ctx, x + w * 1.0, vy + h * (0.55 - rnd(i * 3) * 0.6), 42 * s + 11, -1.25, t, i * 3 + 2);
    if (i % 2 === 0) crystal(ctx, x + w * (rnd(i * 7) - 0.5) * 0.9, vy - h * 0.96, 22 * s + 7, Math.PI, t, i * 3 + 3);
    crystal(ctx, x - w * 0.97, vy + h * 0.72, 20 * s + 6, 0.5, t, i * 5 + 4);
  }
  // floor and rails
  ctx = S(0.35);
  ctx.fillStyle = vgrad(ctx, vy + 60, 800, [[0, 'rgba(8,20,44,0)'], [1, 'rgba(10,30,60,.5)']]); ctx.fillRect(X0, vy + 60, XW, 600);
  ctx = A();
  for (let i = 1; i < 12; i++) { const e = Math.pow(i / 11, 2.2), y = lerp(vy + 70, 860, e), w = lerp(26, 420, e); seg(ctx, vx - w + px * e, y, vx + w + px * e, y, '#1a1c22', 2 + e * 12); }
  for (const s of [-1, 1]) {
    ctx.strokeStyle = '#5a7a9a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(vx + s * 16, vy + 66); ctx.lineTo(vx + s * 330 + px, 880); ctx.stroke();
  }
  // the last good clusters, close to the lens
  crystal(ctx, 60 + px * 1.1, 640, 120, 0.5, t, 41);
  crystal(ctx, 1230 + px * 1.1, 620, 105, -0.6, t, 43);
  crystal(ctx, 1150 + px * 0.9, 96, 60, 2.6, t, 47);
  // lamp on its hook
  const sw = Math.sin(t * 1.1) * 0.12, lx = vx + 200 + px * 0.6;
  ctx.save(); ctx.translate(lx, -40); ctx.rotate(sw);
  seg(ctx, 0, 0, 0, 200, '#0c1018', 2.5);
  glow(ctx, 0, 226, 300, '#9fdcff', 0.26 * flick(t, 6) + 0.08);
  rect(ctx, -15, 200, 30, 8, '#2a3038'); rect(ctx, -15, 244, 30, 8, '#2a3038');
  rect(ctx, -11, 208, 22, 36, '#d6f2ff');
  for (let i = -1; i <= 1; i++) rect(ctx, i * 9 - 1, 208, 2, 36, '#2a3038');
  ctx.restore();
  // the drip
  const dp = mod(t * 0.5, 1), dxp = vx - 250 + px * 0.7;
  if (dp < 0.6) rect(ctx, dxp, 110 + (dp / 0.6) * (dp / 0.6) * 560, 2, 9, 'rgba(160,220,255,.7)');
  else { ctx.strokeStyle = `rgba(160,220,255,${0.6 * (1 - (dp - 0.6) / 0.4)})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(dxp, 676, ((dp - 0.6) / 0.4) * 46, ((dp - 0.6) / 0.4) * 7, 0, 0, TAU); ctx.stroke(); }
}, (ctx, t, px) => {
  motes(ctx, 15, 70, '#8fdcff', t, { x0: -100 + px, x1: 1400 + px, y0: 0, y1: 800, vx: 3, vy: -9, r: 1.7, a: 0.7, tw: 1, wob: 16 });
});

// ── court: a circuit hearing in a drill hall ──
def('court', { amb: '#2c2a26', rim: '#fff0cc', key: -1 }, (ctx, t, px) => {
  ctx = S(0.4);
  fillAll(ctx, vgrad(ctx, -180, 520, [[0, '#211f1c'], [1, '#4a453c']]));
  for (let y = -160; y < 520; y += 22) seg(ctx, X0, y, X0 + XW, y, 'rgba(0,0,0,.12)', 1);
  // high windows and their light
  for (let i = 0; i < 6; i++) {
    const x = -150 + i * 300 + px * 0.2;
    rect(ctx, x - 8, 22, 136, 216, '#181612');
    ctx.fillStyle = vgrad(ctx, 30, 230, [[0, '#f2f4e6'], [1, '#bccdc8']]); ctx.fillRect(x, 30, 120, 200);
    rect(ctx, x + 57, 30, 6, 200, '#181612'); rect(ctx, x, 94, 120, 5, '#181612'); rect(ctx, x, 162, 120, 5, '#181612');
    poly(ctx, [[x, 230], [x + 120, 230], [x + 520, 980], [x + 180, 980]], 'rgba(255,246,214,.06)');
    glow(ctx, x + 60, 130, 220, '#fff6dc', 0.14);
  }
  // roof trusses
  for (let i = -1; i < 5; i++) {
    const x = -200 + i * 400 + px * 0.45;
    ctx.strokeStyle = '#141210'; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.moveTo(x, 10); ctx.lineTo(x + 200, -150); ctx.lineTo(x + 400, 10); ctx.moveTo(x + 200, -150); ctx.lineTo(x + 200, 10); ctx.moveTo(x + 100, -70); ctx.lineTo(x + 200, 10); ctx.lineTo(x + 300, -70); ctx.stroke();
  }
  rect(ctx, X0, 4, XW, 14, '#141210');
  // the banner of the Benches
  const bx = 640 + px * 0.25;
  ctx.fillStyle = hgrad(ctx, bx - 90, bx + 90, [[0, '#17264a'], [0.5, '#27407a'], [1, '#17264a']]);
  ctx.beginPath(); ctx.moveTo(bx - 90, 250); ctx.lineTo(bx + 90, 250); ctx.lineTo(bx + 90, 420); ctx.lineTo(bx, 392); ctx.lineTo(bx - 90, 420); ctx.fill();
  rect(ctx, bx - 100, 244, 200, 8, '#b08a3e');
  ctx.strokeStyle = '#e8d08a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(bx - 34, 290); ctx.lineTo(bx + 34, 290); ctx.moveTo(bx - 26, 296); ctx.lineTo(bx - 26, 352); ctx.moveTo(bx, 296); ctx.lineTo(bx, 352); ctx.moveTo(bx + 26, 296); ctx.lineTo(bx + 26, 352); ctx.moveTo(bx - 38, 358); ctx.lineTo(bx + 38, 358); ctx.moveTo(bx - 34, 290); ctx.lineTo(bx, 272); ctx.lineTo(bx + 34, 290); ctx.stroke();
  // racks of drill staves along the wall
  for (const rx of [140, 1010]) {
    const x = rx + px * 0.25;
    rect(ctx, x, 330, 150, 7, '#1c1814'); rect(ctx, x, 470, 150, 7, '#1c1814');
    for (let i = 0; i < 9; i++) seg(ctx, x + 10 + i * 16, 300 + rnd(i + rx) * 8, x + 12 + i * 16, 500, '#6a5236', 4);
  }
  // floor with its painted drill lines
  ctx.fillStyle = vgrad(ctx, 520, 800, [[0, '#4a3e2c'], [1, '#1c1610']]); ctx.fillRect(X0, 520, XW, 480);
  for (let i = -10; i < 26; i++) seg(ctx, 640 + (i - 8) * 70 + px * 0.4, 520, 640 + (i - 8) * 230 + px, 980, 'rgba(0,0,0,.2)', 1.4);
  ctx.strokeStyle = 'rgba(230,226,200,.3)'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.ellipse(640 + px * 0.6, 690, 520, 90, 0, 0, TAU); ctx.stroke();
  seg(ctx, X0, 600, X0 + XW, 600, 'rgba(230,226,200,.22)', 4);
  // the bench on its dais
  const dx = 640 + px * 0.4;
  rect(ctx, dx - 440, 508, 880, 34, '#2a2018'); rect(ctx, dx - 440, 504, 880, 6, '#5a4630');
  for (let i = -1; i <= 1; i++) {
    const x = dx + i * 210;
    ctx.fillStyle = '#20140e'; ctx.beginPath(); ctx.moveTo(x - 46, 508); ctx.lineTo(x - 46, 330 - (i ? 0 : 26)); ctx.quadraticCurveTo(x, 296 - (i ? 0 : 26), x + 46, 330 - (i ? 0 : 26)); ctx.lineTo(x + 46, 508); ctx.fill();
    ctx.strokeStyle = '#8a6a2e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 36, 500); ctx.lineTo(x - 36, 338 - (i ? 0 : 26)); ctx.quadraticCurveTo(x, 310 - (i ? 0 : 26), x + 36, 338 - (i ? 0 : 26)); ctx.lineTo(x + 36, 500); ctx.stroke();
  }
  ctx.fillStyle = vgrad(ctx, 420, 510, [[0, '#215a3e'], [1, '#0f2e20']]); ctx.fillRect(dx - 380, 424, 760, 86);
  rect(ctx, dx - 388, 416, 776, 12, '#4a3220');
  for (let x = dx - 380; x < dx + 380; x += 14) rect(ctx, x, 504, 8, 9, '#c9a24a');
  for (let i = 0; i < 8; i++) rect(ctx, dx - 372 + i * 100 + rnd(i) * 30, 424, 3, 86, 'rgba(0,0,0,.16)');
  fileStack(ctx, dx - 330, 416, 70, 6, 5); fileStack(ctx, dx + 240, 416, 76, 9, 8); fileStack(ctx, dx - 110, 416, 60, 3, 11);
  rect(ctx, dx + 60, 404, 40, 12, '#3a2614'); seg(ctx, dx + 66, 398, dx + 120, 384, '#5a3a1e', 6); rect(ctx, dx + 108, 372, 30, 18, '#3a2614');
  // the public, standing at the back of the hall and at the sides
  ctx = A();
  crowdRow(ctx, 101, X0 + px * 0.5, dx - 470, 468, 9, 20, '#17130f', t, { hat: 0.3, bob: 0.3 });
  crowdRow(ctx, 103, dx + 470, 1540 + px * 0.5, 468, 9, 20, '#17130f', t, { hat: 0.3, bob: 0.3 });
}, (ctx, t, px) => {
  motes(ctx, 17, 80, '#fff6dc', t, { x0: -100 + px, x1: 1400 + px, y0: 120, y1: 760, vx: 5, vy: 4, r: 1.5, a: 0.38, tw: 1, wob: 18 });
});

// ── ledger-room: a records vault at night ──
function ledgerShelf(ctx, x, y0, w, rowsN, rowH, seed, dark) {
  rect(ctx, x - 10, y0 - 14, w + 20, rowsN * rowH + 24, '#0b0d14');
  const cols = ['#4a1c1c', '#1c3a2c', '#3a2c1a', '#1c2a4a', '#2e2420', '#3c1a2a'];
  for (let r = 0; r < rowsN; r++) {
    const y = y0 + r * rowH;
    let sx = x;
    let i = 0;
    while (sx < x + w - 8) {
      const sw = 13 + rnd(seed + r * 31 + i) * 16, h = rowH - 16 - rnd(seed * 3 + r * 7 + i) * 16;
      const lean = rnd(seed * 5 + r * 3 + i) < 0.06;
      if (rnd(seed * 7 + r * 11 + i) > 0.07) { // a gap is a ledger someone has taken
        ctx.save(); ctx.translate(sx, y + rowH - 8); if (lean) ctx.rotate(-0.16);
        rect(ctx, 0, -h, sw - 1.5, h, css(mix(cols[Math.floor(rnd(seed * 9 + r + i * 3) * cols.length)], '#05060a', dark)));
        rect(ctx, 0, -h * 0.82, sw - 1.5, 2, rgba('#c9a24a', 0.5 * (1 - dark)));
        rect(ctx, 0, -h * 0.3, sw - 1.5, 2, rgba('#c9a24a', 0.5 * (1 - dark)));
        ctx.restore();
      }
      sx += sw; i++;
    }
    rect(ctx, x - 10, y + rowH - 8, w + 20, 8, '#171a24');
  }
}
def('ledger-room', { amb: '#0c1220', rim: '#9fc0ff', key: 1 }, (ctx, t, px) => {
  ctx = S(0.2);
  fillAll(ctx, vgrad(ctx, -180, 800, [[0, '#04070e'], [0.6, '#0c1322'], [1, '#05070c']]));
  // vault door, standing a little open
  const vx = 640 + px * 0.15, vy = 330;
  rect(ctx, vx - 230, 80, 460, 520, '#10141e');
  glow(ctx, vx, vy, 330, '#3a5a9a', 0.2);
  ctx.fillStyle = (() => { const g = ctx.createRadialGradient(vx - 60, vy - 60, 20, vx, vy, 190); g.addColorStop(0, '#5a6678'); g.addColorStop(1, '#1c2230'); return g; })();
  ctx.beginPath(); ctx.arc(vx, vy, 186, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#0a0d14'; ctx.lineWidth = 5; for (const r of [186, 150, 96]) { ctx.beginPath(); ctx.arc(vx, vy, r, 0, TAU); ctx.stroke(); }
  for (let i = 0; i < 16; i++) circ(ctx, vx + Math.cos(i * 0.3927) * 168, vy + Math.sin(i * 0.3927) * 168, 6, '#0a0d14');
  ctx = A();
  const wa = Math.sin(t * 0.2) * 0.3;
  for (let i = 0; i < 5; i++) { const a = wa + i * (TAU / 5); seg(ctx, vx, vy, vx + Math.cos(a) * 80, vy + Math.sin(a) * 80, '#8a96a8', 7); circ(ctx, vx + Math.cos(a) * 80, vy + Math.sin(a) * 80, 9, '#aab4c4'); }
  circ(ctx, vx, vy, 20, '#aab4c4');
  rect(ctx, vx + 191, 110, 2.5, 470, rgba('#ffd9a0', 0.32 + 0.12 * Math.sin(t * 0.9)));
  glow(ctx, vx + 194, 340, 150, '#ffd9a0', 0.14);
  // the stacks
  ctx = S(0.5);
  ledgerShelf(ctx, -230 + px * 0.5, 30, 560, 7, 82, 3, 0.35);
  ledgerShelf(ctx, 950 + px * 0.5, 30, 560, 7, 82, 9, 0.35);
  // ladder
  const lx = 1010 + px * 0.6;
  seg(ctx, lx, 620, lx + 60, 10, '#3a2c1c', 7); seg(ctx, lx + 70, 620, lx + 130, 10, '#3a2c1c', 7);
  for (let i = 0; i < 9; i++) seg(ctx, lx + 6 + i * 6.4, 560 - i * 62, lx + 76 + i * 6.4, 560 - i * 62, '#3a2c1c', 5);
  // moonlight through the grille
  const mx = 300 + px * 0.3;
  ctx.fillStyle = 'rgba(150,185,255,.075)';
  for (let i = 0; i < 4; i++) poly(ctx, [[mx + i * 34, -180], [mx + i * 34 + 22, -180], [mx + 380 + i * 80, 980], [mx + 320 + i * 80, 980]], 'rgba(150,185,255,.07)');
  // floor
  ctx.fillStyle = vgrad(ctx, 600, 800, [[0, '#0e121c'], [1, '#04060a']]); ctx.fillRect(X0, 600, XW, 400);
  for (let i = 0; i < 4; i++) poly(ctx, [[mx + 330 + i * 78, 600], [mx + 388 + i * 78, 600], [mx + 470 + i * 96, 800], [mx + 400 + i * 96, 800]], 'rgba(150,185,255,.1)');
  // the reading table and a shuttered lamp
  const tx = 640 + px * 0.9;
  ctx.fillStyle = vgrad(ctx, 610, 800, [[0, '#2a2018'], [1, '#0c0806']]); ctx.fillRect(tx - 420, 612, 840, 300);
  rect(ctx, tx - 430, 606, 860, 9, '#4a3826');
  ctx = A();
  ctx = S(0.9, 0.3 * flick(t, 7) + 0.1);
  glow(ctx, tx + 180, 580, 300, '#ffc070', 1);
  ctx = A();
  ctx = S(1);
  rect(ctx, tx + 164, 548, 32, 58, '#1a1a1e'); rect(ctx, tx + 170, 558, 20, 34, '#ffe2a8'); poly(ctx, [[tx + 160, 548], [tx + 180, 530], [tx + 200, 548]], '#1a1a1e');
  poly(ctx, [[tx - 190, 606], [tx - 20, 596], [tx - 20, 606]], '#d9cba6'); poly(ctx, [[tx - 20, 596], [tx + 130, 606], [tx - 20, 606]], '#c9b88e');
  ledgerShelf(ctx, -330 + px * 1.2, -60, 190, 9, 96, 17, 0.75);
  ledgerShelf(ctx, 1400 + px * 1.2, -60, 200, 9, 96, 21, 0.75);
  // a watchman's lamp passing somewhere beyond the shelves
  ctx = A();
  glow(ctx, 640 + Math.sin(t * 0.23) * 620 + px, 280, 220, '#9fc0ff', 0.07);
}, (ctx, t, px) => {
  motes(ctx, 19, 60, '#c8d8ff', t, { x0: 200 + px, x1: 1100 + px, y0: 0, y1: 700, vx: 3, vy: 5, r: 1.4, a: 0.4, tw: 1, wob: 14 });
});
/** its smoke does not rise. It pours, and lies down, and whatever it lies on goes flat */
function sinkingSmoke(ctx, x, y, fall, spread, n, t, seed, a) {
  for (let i = 0; i < n; i++) {
    const ph = mod(t * 0.09 + i / n + rnd(seed + i) * 0.2, 1);
    const side = rnd(seed * 3 + i) < 0.5 ? -1 : 1;
    const down = Math.min(1, ph * 2.6);
    const out = Math.max(0, ph - 0.3) / 0.7;
    const sx = x + side * (10 + rnd(seed * 5 + i) * 26) * down + side * out * spread + Math.sin(t * 0.7 + i) * 6;
    const sy = y + fall * (1 - (1 - down) * (1 - down));
    const r = 16 + down * 26 + out * 60;
    ctx.fillStyle = rgba('#b8dcf4', a * (1 - ph) * (0.5 + 0.5 * down));
    ctx.beginPath(); ctx.ellipse(sx, sy, r * (1 + out * 1.6), r * (1 - out * 0.72), 0, 0, TAU); ctx.fill();
  }
}
function cog(ctx, x, y, r, teeth, a, col, dark) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.fillStyle = col;
  ctx.beginPath();
  for (let i = 0; i < teeth * 2; i++) { const rr2 = i % 2 ? r : r * 0.84, an = (i / (teeth * 2)) * TAU; ctx.lineTo(Math.cos(an - 0.06) * rr2, Math.sin(an - 0.06) * rr2); ctx.lineTo(Math.cos(an + 0.06) * rr2, Math.sin(an + 0.06) * rr2); }
  ctx.closePath(); ctx.fill();
  circ(ctx, 0, 0, r * 0.52, dark);
  for (let i = 0; i < 4; i++) seg(ctx, 0, 0, Math.cos(i * 1.5708) * r * 0.8, Math.sin(i * 1.5708) * r * 0.8, col, r * 0.14);
  circ(ctx, 0, 0, r * 0.17, col);
  ctx.restore();
}
function engineRings(ctx, cx, cy, t) {
  const N = 5;
  for (let i = N - 1; i >= 0; i--) {
    const rx = 92 + i * 50;
    const tilt = 0.16 + 0.3 * Math.abs(Math.sin(t * (0.1 + i * 0.03) + i * 1.3));
    const rot = Math.sin((i % 2 ? -1 : 1) * t * (0.05 + i * 0.012) + i * 0.7) * 0.5;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
    ctx.strokeStyle = hgrad(ctx, -rx, rx, [[0, '#5a3e12'], [0.3, '#e8cc82'], [0.55, '#a07a2e'], [0.8, '#dcbc6a'], [1, '#4a3410']]);
    ctx.lineWidth = 8 - i * 0.7;
    ctx.beginPath(); ctx.ellipse(0, 0, rx, rx * tilt, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(40,24,6,.6)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, 0, rx - 5, (rx - 5) * tilt, 0, 0, TAU); ctx.stroke();
    // the cold light, caught on the inside of the brass
    ctx.strokeStyle = 'rgba(170,220,255,.5)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(0, 0, rx - 2, (rx - 2) * tilt, 0, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke();
    // a toothed ring: this is a machine, and the teeth are what turn it
    const teeth = 36 + i * 12, spin = t * (0.05 + i * 0.01) * (i % 2 ? 1 : -1);
    for (let k = 0; k < teeth; k++) {
      const a = (k / teeth) * TAU + spin, c = Math.cos(a), s = Math.sin(a);
      seg(ctx, c * rx, s * rx * tilt, c * (rx + 6), s * (rx + 6) * tilt, 'rgba(226,198,120,.6)', 1.6);
    }
    // each ring carries a shutter-lens that throws the flame's light out to sea as it passes
    const pa = t * (0.2 + i * 0.06) * (i % 2 ? 1 : -1) + i * 2.1, lx = Math.cos(pa) * rx, ly = Math.sin(pa) * rx * tilt;
    ctx.save(); ctx.translate(lx, ly); ctx.rotate(pa * 0.5);
    rect(ctx, -9, -13, 18, 26, '#6a4a16');
    rect(ctx, -6, -10, 12, 20, Math.sin(pa) > 0 ? 'rgba(190,232,255,.85)' : 'rgba(90,130,170,.6)');
    ctx.strokeStyle = '#e8cc82'; ctx.lineWidth = 1.5; ctx.strokeRect(-9, -13, 18, 26);
    ctx.restore();
    ctx.restore();
  }
  // the burner: a brass cup on the spindle, and stillsalt burning in it
  ctx.fillStyle = hgrad(ctx, cx - 36, cx + 36, [[0, '#4a3410'], [0.35, '#e8cc82'], [1, '#5a3e12']]);
  ctx.beginPath(); ctx.moveTo(cx - 36, cy + 4); ctx.quadraticCurveTo(cx - 30, cy + 34, cx - 8, cy + 38); ctx.lineTo(cx + 8, cy + 38); ctx.quadraticCurveTo(cx + 30, cy + 34, cx + 36, cy + 4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#dff4ff'; ctx.beginPath(); ctx.ellipse(cx, cy + 4, 36, 7, 0, 0, TAU); ctx.fill();
  for (let i = 0; i < 9; i++) rect(ctx, cx - 28 + i * 7 + rnd(i) * 3, cy - 2 - rnd(i * 3) * 5, 5, 5, i % 2 ? '#ffffff' : '#bfe4f8'); // the salt
  coldFlame(ctx, cx, cy + 2, 44, t, 3, true);
}
/** the light the burner throws, at full strength: engineRings leaves it out so that it can be a still layer */
function engineGlow(ctx, cx, cy) {
  glow(ctx, cx, cy - 30, 260, '#7fc8ff', 1);
  glow(ctx, cx, cy - 28.8, 286, '#6fc4ff', 1);
}
def('orrery', { amb: '#0c151c', rim: '#a8dcff', key: -1 }, (ctx, t, px) => {
  const cx = 640 + px * 0.25, cy = 262, wy = 500, hy = 412;
  // night and the sea, seen through the open arcade of the lamp-house
  ctx = S(0);
  fillAll(ctx, vgrad(ctx, -180, hy, [[0, '#02050a'], [0.6, '#081424'], [1, '#17304a']]));
  ctx = A();
  stars(ctx, 41, 90, hy - 30, t);
  ctx = S(0.1);
  ctx.fillStyle = vgrad(ctx, hy, wy, [[0, '#1c3a56'], [1, '#0a1826']]); ctx.fillRect(X0, hy, XW, wy - hy);
  // the lane: where the smoke has lain, the sea is flat and takes the light
  ctx.fillStyle = hgrad(ctx, cx - 620, cx + 620, [[0, 'rgba(150,205,240,0)'], [0.5, 'rgba(150,205,240,.3)'], [1, 'rgba(150,205,240,0)']]);
  ctx.fillRect(cx - 620, hy, 1240, 16);
  ctx = A();
  waterStreaks(ctx, 43, X0, 1540, hy + 4, wy, 50, '#9ad0f0', t, 0.3);
  seg(ctx, X0, hy, X0 + XW, hy, 'rgba(170,215,240,.35)', 1);
  // out on the water, ships answer
  for (let i = 0; i < 7; i++) {
    const x = 70 + i * 190 + rnd(i * 3.1) * 90 + px * 0.06, y = hy + 3 + rnd(i * 5) * 16;
    const on = Math.sin(t * (0.9 + rnd(i) * 0.5) + i * 2.4) > -0.25 ? 1 : 0.12;
    poly(ctx, [[x - 9, y], [x + 10, y], [x + 7, y + 3], [x - 7, y + 3]], '#04080e');
    rect(ctx, x - 0.5, y - 10, 1.2, 10, '#04080e');
    glow(ctx, x, y - 10, 16, '#ffd08a', 0.75 * on);
    rect(ctx, x - 1, y - 11, 2.4, 2.4, rgba('#ffe6b0', on));
    rect(ctx, x - 5, y + 5, 10, 1.4, rgba('#ffd08a', 0.4 * on));
  }
  // the arcade: piers and the arches between them
  ctx = S(0.15);
  for (let i = 0; i < 8; i++) {
    const side = i % 2 ? 1 : -1, d = Math.floor(i / 2), x = cx + side * (300 + d * 150) + px * (0.1 + d * 0.1), w = 34 + d * 14;
    ctx.fillStyle = hgrad(ctx, x - w / 2, x + w / 2, side < 0 ? [[0, '#05080b'], [0.7, css(mix('#2c4658', '#070b0f', 0.5 + d * 0.1))], [1, '#6f9cb8']] : [[0, '#6f9cb8'], [0.3, css(mix('#2c4658', '#070b0f', 0.5 + d * 0.1))], [1, '#05080b']]);
    ctx.fillRect(x - w / 2, -180, w, wy + 180 + d * 14);
    rect(ctx, x - w / 2 - 6, wy + d * 14 - 12, w + 12, 14, '#10161a');
    rect(ctx, x - w / 2 - 5, 96, w + 10, 10, '#10161a');
  }
  ctx.fillStyle = '#070b0f';
  ctx.beginPath(); ctx.rect(X0, -180, XW, 280);
  for (const [a0, a1] of [[-750, -600], [-600, -450], [-450, -300], [-300, 300], [300, 450], [450, 600], [600, 750]]) { // arch heads, cut out of the wall above the piers
    const xa = cx + a0 + px * 0.15, wA = a1 - a0;
    ctx.moveTo(xa + wA - 16, 100); ctx.lineTo(xa + 16, 100); ctx.quadraticCurveTo(xa + wA / 2, 100 - Math.min(150, wA * 0.5), xa + wA - 16, 100);
  }
  ctx.fill('evenodd');
  // the beam the engine throws: cold light going out between the piers, turning
  ctx = A();
  for (let i = 0; i < 3; i++) {
    const a = t * 0.11 + i * 2.1, c = Math.cos(a);
    const bx = cx + c * 900;
    poly(ctx, [[cx, cy - 20], [bx - 90, hy - 30 - Math.abs(c) * 60], [bx + 90, hy + 10]], `rgba(150,210,255,${0.05 + 0.04 * Math.abs(c)})`);
  }
  // the hopper, and the chute that feeds the cup: tonight it is being filled by hand
  const hx = cx - 232;
  seg(ctx, hx + 26, 196, cx - 30, cy - 6, '#6a4a16', 9); seg(ctx, hx + 26, 193, cx - 30, cy - 9, '#d8b866', 2);
  poly(ctx, [[hx - 34, 120], [hx + 44, 120], [hx + 30, 200], [hx + 10, 200]], '#7a5a1e');
  poly(ctx, [[hx - 34, 120], [hx - 10, 120], [hx + 14, 200], [hx + 10, 200]], '#c9a85a');
  rect(ctx, hx - 40, 114, 90, 8, '#e0c070');
  seg(ctx, hx + 20, 200, hx + 20, wy, '#3a2a0c', 7);
  for (let i = 0; i < 3; i++) { const ph = mod(t * 0.5 + i * 0.33, 1); rect(ctx, lerp(hx + 30, cx - 34, ph), lerp(190, cy - 12, ph) - 3, 4, 4, 'rgba(235,248,255,.9)'); }
  // armature and the gear train that turns the rings
  seg(ctx, cx, cy + 36, cx, wy, '#5a3e12', 11); seg(ctx, cx - 3, cy + 36, cx - 3, wy, '#c9a24a', 2);
  seg(ctx, cx - 150, wy, cx - 20, cy + 150, '#4a3410', 7); seg(ctx, cx + 150, wy, cx + 20, cy + 150, '#4a3410', 7);
  cog(ctx, cx + 62, wy - 52, 44, 14, t * 0.4, '#b08a3a', '#2a1c08');
  cog(ctx, cx + 118, wy - 22, 26, 9, -t * 0.4 * (14 / 9) + 0.2, '#d8b866', '#2a1c08');
  cog(ctx, cx - 58, wy - 40, 34, 11, -t * 0.52, '#8a6a26', '#2a1c08');
  poly(ctx, [[cx - 190, wy], [cx + 190, wy], [cx + 160, wy - 16], [cx - 160, wy - 16]], '#3a2a0c');
  engineRings(ctx, cx, cy, t);
  const burn = 0.3 + 0.05 * Math.sin(t * 1.4);
  ctx = S(0.25, burn);
  engineGlow(ctx, cx, cy);
  ctx = A();
  sinkingSmoke(ctx, cx, cy + 10, wy - cy - 14, 380, 16, t, 5, 0.13);
  // still water
  ctx = S(0);
  ctx.fillStyle = vgrad(ctx, wy, 800, [[0, '#0e1e2a'], [1, '#020406']]); ctx.fillRect(X0, wy, XW, 500);
  ctx = A();
  ctx.save();
  ctx.beginPath(); ctx.rect(X0, wy, XW, 500); ctx.clip();
  fade(ctx, 0.4, () => { ctx.save(); ctx.translate(0, wy * 2); ctx.scale(1, -1); engineRings(ctx, cx, cy, t); ctx.restore(); });
  ctx = S(0.25, 0.4 * burn);
  engineGlow(ctx, cx, wy * 2 - cy + 60);     // its reflection: the same light, upside down in the basin
  ctx = A();
  ctx.restore();
  seg(ctx, X0, wy, X0 + XW, wy, 'rgba(160,205,230,.3)', 1.5);
  // sacks of salt at the basin's edge, the last of them cut open
  for (let i = 0; i < 5; i++) {
    const x = cx - 470 + i * 46 + px * 0.5 + (i > 2 ? 700 : 0), y = wy - 2;
    ctx.fillStyle = i % 2 ? '#6a6252' : '#7c7462'; ctx.beginPath(); ctx.ellipse(x, y - 17, 26, 19, (rnd(i) - 0.5) * 0.5, 0, TAU); ctx.fill();
    seg(ctx, x - 10, y - 32, x + 8, y - 36, '#3a3428', 3);
    if (i === 2 || i === 4) for (let j = 0; j < 7; j++) rect(ctx, x + 18 + j * 5, y - 6 - rnd(j) * 6, 4, 4, 'rgba(232,246,255,.85)');
  }
}, (ctx, t, px) => {
  // the smoke on the floor, going out through the arches toward the sea
  for (let i = 0; i < 7; i++) {
    const x = mod(rnd(i * 3) * 1700 + t * (i % 2 ? 11 : -9), 1700) - 220 + px;
    ctx.fillStyle = 'rgba(170,215,245,.05)'; ctx.beginPath(); ctx.ellipse(x, 470 + i * 14, 320, 20, 0, 0, TAU); ctx.fill();
  }
  motes(ctx, 21, 40, '#cfeaff', t, { x0: 300 + px, x1: 980 + px, y0: 60, y1: 500, vx: 2, vy: 9, r: 1.4, a: 0.5, tw: 1, wob: 14 });
});
def('commons-hall', { amb: '#2c1c10', rim: '#ffcf90', key: 1 }, (ctx, t, px) => {
  ctx = S(0.25);
  fillAll(ctx, vgrad(ctx, -180, 560, [[0, '#24160c'], [1, '#4a301c']]));
  for (let x = X0 + mod(px * 0.2, 46); x < 1540; x += 46) rect(ctx, x, -180, 2, 740, 'rgba(0,0,0,.2)');
  rect(ctx, X0, 430, XW, 8, '#2a1a0e');
  // window: evening over the pit
  const wx = 60 + px * 0.25;
  rect(ctx, wx - 10, 90, 200, 250, '#1a0f08');
  ctx.fillStyle = vgrad(ctx, 100, 330, [[0, '#1c2a52'], [1, '#6a5a78']]); ctx.fillRect(wx, 100, 180, 230);
  ctx.strokeStyle = '#141a30'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(wx + 96, 330); ctx.lineTo(wx + 120, 190); ctx.lineTo(wx + 144, 330); ctx.stroke(); ctx.beginPath(); ctx.arc(wx + 120, 184, 12, 0, TAU); ctx.stroke();
  rect(ctx, wx + 86, 100, 7, 230, '#1a0f08'); rect(ctx, wx, 208, 180, 6, '#1a0f08');
  // the board
  const bx = 430 + px * 0.25, bw = 620, by = 70, bh = 320;
  rect(ctx, bx - 14, by - 14, bw + 28, bh + 34, '#5a3c22');
  ctx.fillStyle = vgrad(ctx, by, by + bh, [[0, '#1c2a26'], [1, '#141f1c']]); ctx.fillRect(bx, by, bw, bh);
  for (let i = 0; i < 9; i++) { ctx.fillStyle = 'rgba(220,230,225,.035)'; ctx.beginPath(); ctx.ellipse(bx + rnd(i) * bw, by + rnd(i * 3) * bh, 120, 34, rnd(i * 5), 0, TAU); ctx.fill(); }
  ctx.fillStyle = 'rgba(238,236,224,.88)'; ctx.font = `700 26px ${FONT_SERIF}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('THE COMMONS', bx + 22, by + 40);
  ctx.font = `italic 15px ${FONT_SERIF}`; ctx.fillStyle = 'rgba(238,236,224,.6)';
  ctx.fillText('what is given is not owed', bx + 250, by + 39);
  ctx.strokeStyle = 'rgba(238,236,224,.5)'; ctx.lineWidth = 2; chalkLine(ctx, bx + 20, by + 52, bw - 40, 1);
  for (let c = 0; c < 3; c++) {
    const x = bx + 24 + c * 200;
    for (let r = 0; r < 9; r++) {
      const y = by + 78 + r * 26, seed = c * 20 + r;
      if (rnd(seed * 3.3) < 0.12) continue;
      ctx.strokeStyle = `rgba(238,236,224,${0.5 + rnd(seed) * 0.35})`; ctx.lineWidth = 2.2;
      chalkLine(ctx, x, y, 60 + rnd(seed * 5) * 60, seed);
      const tally = Math.floor(rnd(seed * 7) * 6);
      for (let k = 0; k < tally; k++) seg(ctx, x + 140 + k * 7, y - 8, x + 141 + k * 7, y + 6, 'rgba(238,236,224,.75)', 2);
      if (tally === 5) seg(ctx, x + 136, y + 5, x + 172, y - 7, 'rgba(238,236,224,.75)', 2);
    }
  }
  rect(ctx, bx - 14, by + bh + 12, bw + 28, 9, '#6a4a2c'); rect(ctx, bx + 80, by + bh + 6, 26, 6, '#eeeade'); rect(ctx, bx + 120, by + bh + 6, 16, 6, '#eeeade');
  // the Compact's banner
  const cxb = 1180 + px * 0.25;
  ctx.fillStyle = '#7a2a1c'; ctx.beginPath(); ctx.moveTo(cxb - 80, 60); ctx.lineTo(cxb + 80, 60); ctx.lineTo(cxb + 80, 330); ctx.lineTo(cxb, 300); ctx.lineTo(cxb - 80, 330); ctx.fill();
  ctx.strokeStyle = '#e8d08a'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cxb - 18, 170, 34, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(cxb + 18, 170, 34, 0, TAU); ctx.stroke();
  ctx.fillStyle = '#e8d08a'; ctx.font = `700 17px ${FONT_SERIF}`; ctx.textAlign = 'center'; ctx.fillText('THE COMPACT', cxb, 250); ctx.textAlign = 'left';
  // floor, tables, people eating
  ctx.fillStyle = vgrad(ctx, 540, 800, [[0, '#3a2414'], [1, '#150c07']]); ctx.fillRect(X0, 540, XW, 460);
  ctx = A();
  crowdRow(ctx, 111, -200 + px * 0.5, 1500 + px * 0.5, 452, 20, 22, '#1a0f09', t, { hat: 0.3, bob: 0.5 });
  ctx.fillStyle = vgrad(ctx, 520, 560, [[0, '#7a5230'], [1, '#4a2e18']]); ctx.fillRect(X0, 520, XW, 30);
  rect(ctx, X0, 516, XW, 6, '#8e6238');
  for (let i = 0; i < 12; i++) {
    const x = -200 + i * 146 + px * 0.55;
    ctx.fillStyle = '#d9cfb8'; ctx.beginPath(); ctx.ellipse(x, 514, 20, 6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#8a4a22'; ctx.beginPath(); ctx.ellipse(x, 513, 15, 3.6, 0, 0, TAU); ctx.fill();
    for (let j = 0; j < 3; j++) {
      const ph = mod(t * 0.4 + j * 0.33 + i * 0.17, 1);
      ctx.strokeStyle = `rgba(255,244,225,${0.2 * (1 - ph)})`; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x - 6 + j * 6, 508 - ph * 20); ctx.quadraticCurveTo(x - 12 + j * 6 + Math.sin(t * 2 + j + i) * 7, 494 - ph * 34, x - 4 + j * 6, 480 - ph * 46); ctx.stroke();
    }
    if (i % 3 === 1) { ctx.fillStyle = '#b07a3a'; ctx.beginPath(); ctx.ellipse(x + 62, 510, 24, 10, 0, Math.PI, 0); ctx.fill(); }
  }
  // lamps
  for (const lx of [250, 760, 1160]) {
    const x = lx + px * 0.7, sw = Math.sin(t * 0.9 + lx) * 0.05;
    ctx = S(0.7, 0.3 * flick(t, lx) + 0.06);
    glow(ctx, x, 58, 330, '#ffc878', 1);
    ctx = A();
    ctx.save(); ctx.translate(x, -180); ctx.rotate(sw);
    seg(ctx, 0, 0, 0, 216, '#120a06', 2.5);
    poly(ctx, [[-30, 232], [30, 232], [15, 208], [-15, 208]], '#2a2a26');
    rect(ctx, -9, 232, 18, 15, '#fff0c0');
    ctx.restore();
  }
  // the near table edge
  ctx = S(0.8);
  ctx.fillStyle = vgrad(ctx, 640, 800, [[0, '#5a3a20'], [1, '#22140a']]); ctx.fillRect(X0, 668, XW, 300);
  rect(ctx, X0, 662, XW, 8, '#7a5230');
}, (ctx, t, px) => {
  for (let i = 0; i < 5; i++) {
    const x = mod(rnd(i * 3) * 1700 + t * 9, 1700) - 220 + px;
    ctx.fillStyle = 'rgba(255,236,206,.045)'; ctx.beginPath(); ctx.ellipse(x, 380 + i * 60, 300, 44, 0, 0, TAU); ctx.fill();
  }
});

// ── shore-dusk ──
def('shore-dusk', { amb: '#2a1c3a', rim: '#ff9d5c', key: 1 }, (ctx, t, px) => {
  ctx.translate(0, -52);
  ctx = S(0);
  fillAll(ctx, vgrad(ctx, -180, 436, [[0, '#0c1028'], [0.45, '#3a2a5e'], [0.8, '#b3506a'], [1, '#f39c5a']]));
  ctx = A();
  stars(ctx, 12, 90, 240, t);
  ctx = S(0.05);
  glow(ctx, 420 + px * 0.05, 440, 520, '#ffb060', 0.5);
  ctx.strokeStyle = '#f4ecd8'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(1040 + px * 0.05, 120, 24, Math.PI * 0.6, Math.PI * 1.5); ctx.stroke();
  ctx = A();
  for (let i = 0; i < 9; i++) {
    const x = mod(rnd(i * 3) * 1800 + t * (2 + rnd(i) * 2), 1800) - 260 + px * 0.1, y = 210 + rnd(i * 7) * 190, w = 120 + rnd(i * 2) * 200;
    ctx.fillStyle = 'rgba(40,24,60,.6)'; ctx.beginPath(); ctx.ellipse(x, y, w, 9 + rnd(i * 9) * 8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,150,90,.4)'; ctx.beginPath(); ctx.ellipse(x - 8, y + 7, w * 0.9, 4, 0, 0, TAU); ctx.fill();
  }
  // the headland and the pit, small now
  const hx = 1130 + px * 0.15;
  ctx.fillStyle = '#1e1630'; ctx.beginPath(); ctx.moveTo(1560, 440); ctx.lineTo(1560, 350); ctx.bezierCurveTo(hx + 200, 330, hx - 20, 372, hx - 280, 440); ctx.fill();
  ctx.strokeStyle = '#1e1630'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(hx + 40, 372); ctx.lineTo(hx + 56, 304); ctx.lineTo(hx + 72, 372); ctx.stroke(); ctx.beginPath(); ctx.arc(hx + 56, 300, 9, 0, TAU); ctx.stroke();
  for (let i = 0; i < 7; i++) rect(ctx, hx - 60 + i * 44 + rnd(i) * 20, 386 - rnd(i * 3) * 22, 3, 3, rgba('#ffcf7a', 0.5 + 0.4 * Math.sin(t * 0.8 + i)));
  // sea
  ctx = S(0);
  ctx.fillStyle = vgrad(ctx, 436, 580, [[0, '#d4795a'], [0.4, '#6a3f6a'], [1, '#232750']]); ctx.fillRect(X0, 436, XW, 150);
  ctx = A();
  waterStreaks(ctx, 61, 200, 660, 440, 570, 70, '#ffc890', t, 0.8);
  waterStreaks(ctx, 63, X0, 1540, 440, 580, 90, '#ffb8a0', t, 0.3);
  // sand, and the tide going out
  ctx = S(0);
  ctx.fillStyle = vgrad(ctx, 570, 800, [[0, '#5a4058'], [0.25, '#33263c'], [1, '#120e1c']]); ctx.fillRect(X0, 570, XW, 440);
  ctx.fillStyle = vgrad(ctx, 570, 640, [[0, 'rgba(240,150,100,.34)'], [1, 'rgba(240,150,100,0)']]); ctx.fillRect(X0, 570, XW, 70);
  ctx = A();
  for (let i = 0; i < 4; i++) {
    const adv = Math.sin(t * 0.45 - i * 0.9) * 14, y0 = 572 + i * 15 + adv;
    ctx.strokeStyle = `rgba(255,236,226,${0.55 - i * 0.11})`; ctx.lineWidth = 2.6 - i * 0.4;
    ctx.beginPath();
    for (let x = X0; x <= 1540; x += 26) { const y = y0 + Math.sin(x * 0.011 + i * 2 + t * 0.3) * 6 + Math.sin(x * 0.037 + i) * 2.5; x === X0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
  }
  // driftwood
  ctx.strokeStyle = '#17101c'; ctx.lineWidth = 11; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(200 + px * 0.8, 668); ctx.quadraticCurveTo(310 + px * 0.8, 640, 440 + px * 0.8, 660); ctx.stroke();
  ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(330 + px * 0.8, 650); ctx.lineTo(360 + px * 0.8, 618); ctx.stroke(); ctx.lineCap = 'butt';
  // the fire
  const fx = 640 + px * 0.9, fy = 664;
  ctx = S(0.9, 0.3 * flick(t, 8) + 0.08);
  glow(ctx, fx, fy - 20, 440, '#ff8a2a', 1);
  ctx = A();
  ctx.fillStyle = 'rgba(255,150,70,.12)'; ctx.beginPath(); ctx.ellipse(fx, fy + 6, 240, 30, 0, 0, TAU); ctx.fill();
  flame(ctx, fx - 14, fy, 30, t, 1); flame(ctx, fx + 16, fy, 24, t, 4); flame(ctx, fx, fy - 2, 18, t, 7);
  seg(ctx, fx - 50, fy + 6, fx + 44, fy - 6, '#1c0e0a', 11); seg(ctx, fx - 40, fy - 8, fx + 52, fy + 8, '#26120c', 10);
  for (let i = 0; i < 8; i++) { ctx.fillStyle = '#231a26'; ctx.beginPath(); ctx.ellipse(fx + Math.cos(i * 0.785) * 66, fy + 8 + Math.sin(i * 0.785) * 12, 11, 7, 0, 0, TAU); ctx.fill(); }
  // dune grass
  for (let i = 0; i < 60; i++) {
    const side = i % 2, x = (side ? 1280 + 200 - rnd(i) * 330 : -200 + rnd(i) * 330) + px * 1.2, h = 70 + rnd(i * 3) * 120, sw = Math.sin(t * 1.2 + i) * 14 + (side ? -20 : 20);
    ctx.strokeStyle = '#0c0914'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x, 810); ctx.quadraticCurveTo(x + sw * 0.3, 810 - h * 0.6, x + sw, 810 - h); ctx.stroke();
  }
}, (ctx, t, px) => {
  ctx.translate(0, -52);
  motes(ctx, 23, 30, '#ffb060', t, { x0: 540 + px * 0.9, x1: 750 + px * 0.9, y0: 300, y1: 660, vx: 10, vy: -80, r: 1.8, a: 0.9, tw: 1, wob: 20 });
});
