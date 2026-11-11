// Lanewar on the glass: where things are, what a touch means, and everything that is drawn in 2D.
// Imperative shell. Both renderers use it: the 3D one draws the board itself (gl/fray3d.js) and asks this
// file only for the lettering and the reels; the 2D one asks for the board as well (opts.board).
//
//   frayLayout(L, safeTop)        -> { top, area, board, reels[3], take[3], hold[3], pull, next, home, ... }   logical px
//   frayStick                     the thumb stick: written by input.js, drawn here, read by nobody else
//   frayPress(FL, run, down, up)  -> Msg | null     a tap at the reels (finger down and up on the same button)
//   frayKey(run, code)            -> Msg | null     a key at the reels or on a fallen board
//   drawFray(g, game, fx, L, opts)
//
// IN A WAVE the only control is the stick: put a thumb down anywhere and drag (input.js), or WASD / arrows.
// AT THE REELS everything is a button: PULL, a TAKE under each reel, a HOLD under that, NEXT WAVE, and the way home.

import {
  AW, AH, SLOTS, TIERS, WEAPONS, ITEMS, FOES, MULT_PAYS,
  describe, canTake, canPull, canLeave, pullCost, matches, levelCost,
} from '../core/fray.js';

const FACE = '"Avenir Next", "Trebuchet MS", ui-rounded, system-ui, sans-serif';
const font = (size, weight = 800) => `${weight} ${size}px ${FACE}`;
const INK = '#1d2146';
const CREAM = '#fff7e2';
const NAVY = '#1d2a5c';
const NAVY_DEEP = '#131c44';
const GOLD = '#ffd24a';
const CORAL = '#f2553a';
const TEAL = '#2bb7a3';
const WHITE = '#ffffff';
const DIM = '#39406e';

/** What each figure, weapon and piece of kit is painted, here and on the 3D board. */
export const FRAY_COLOURS = Object.freeze({
  hero: '#2bb7a3', foot: '#d8433a', lancer: '#3f6fd8', grenadier: '#3c7a4a', musket: '#e9e2d0', captain: '#8a4fc0',
  sabre: '#e8f0ff', pike: '#bfe6ff', flail: '#ffd24a', pistol: '#c9a26a', scatter: '#ffb347', mortar: '#ff7a4a', flask: '#ff9a2a',
  heart: '#f2553a', whetstone: '#aab4c8', drill: '#f2c84a', spyglass: '#6fd0f0', plate: '#8fa0c0', boots: '#b0703a',
  feint: '#c58af0', tonic: '#5fd08a', magnet: '#e04a6a', clover: '#4fc060',
  tin: '#ffd24a', feltA: '#2f8f6a', feltB: '#2b8762',
});
const TIER_COLOUR = ['#9aa3c0', '#5fd08a', '#6fb0ff', '#ffb347'];
const TIER_NAME = ['I', 'II', 'III', 'IV'];
const STAT_LABEL = { maxHp: 'Hearts', dmg: 'Damage %', haste: 'Attack speed %', range: 'Range %', armor: 'Armour', speed: 'Speed %', dodge: 'Dodge %', regen: 'Mending', magnet: 'Tin reach %', luck: 'Luck' };

const rect = (x, y, w, h) => ({ x, y, w, h });
const inRect = (r, x, y, pad = 4) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;

const layouts = new Map();
export function frayLayout(L, safeTop = 0) {
  const st = Math.round(safeTop || 0);
  const key = `${L.kind}|${L.W}|${L.H}|${st}`;
  let FL = layouts.get(key);
  if (FL) return FL;
  const wide = L.kind === 'wide';
  const pad = wide ? 24 : 10;
  const top = rect(pad, st + (wide ? 12 : 8), L.W - pad * 2, 62);
  const area = rect(pad, top.y + top.h + 6, L.W - pad * 2, L.H - (top.y + top.h + 6) - 54);
  const s = Math.min(area.w / AW, area.h / AH);
  const board = { x: area.x + (area.w - AW * s) / 2, y: area.y + (area.h - AH * s) / 2, w: AW * s, h: AH * s, s };
  const slots = rect(pad, L.H - 48, L.W - pad * 2, 40);
  // the reels: a column of things, centred, that fits a short phone
  const cw = Math.min(L.W - pad * 2, 410), cx = (L.W - cw) / 2;
  const short = L.H < 800;
  let y = top.y + (short ? 4 : 14);
  const title = { x: L.W / 2, y: y + 30 }; y += short ? 58 : 70;
  const rw = (cw - 16) / 3, rh = short ? 132 : 150;
  const reels = [0, 1, 2].map((i) => rect(cx + i * (rw + 8), y, rw, rh)); y += rh + 6;
  const take = reels.map((r) => rect(r.x, y, r.w, 38)); y += 38 + 5;
  const hold = reels.map((r) => rect(r.x, y, r.w, 28)); y += 28 + (short ? 8 : 12);
  const pull = rect(cx, y, cw, short ? 50 : 56); y += pull.h + (short ? 8 : 12);
  const load = rect(cx, y, cw, 46); y += 46 + (short ? 6 : 10);
  const bottomH = 50;
  const stats = rect(cx, y, cw, Math.max(40, L.H - y - bottomH - 22));
  const by = L.H - bottomH - 12;
  const next = rect(cx, by, cw * 0.56, bottomH);
  const home = rect(cx + cw * 0.56 + 8, by, cw * 0.44 - 8, bottomH);
  FL = Object.freeze({ top, area, board, slots, title, reels, take, hold, pull, load, stats, next, home });
  layouts.set(key, FL);
  return FL;
}

/** The thumb stick, logical px: where the thumb went down and where it is now. input.js writes it. */
export const frayStick = { on: false, ox: 0, oy: 0, x: 0, y: 0 };
/** Logical px of travel at which the stick is hard over. */
export const STICK_R = 46;

/** A tap at the reels or on the fallen board: `down` and `up` are [x, y] where the finger landed and lifted. */
export function frayPress(FL, run, down, up) {
  if (!run) return null;
  if (run.phase === 'over') return { type: 'confirm' };
  if (run.phase !== 'shop') return null;
  const on = (r) => inRect(r, up[0], up[1]) && inRect(r, down[0], down[1]);
  for (let i = 0; i < 3; i++) {
    if (on(FL.take[i]) || on(FL.reels[i])) return canTake(run, i) ? { type: 'fray', take: i } : null;
    if (on(FL.hold[i])) return run.slot.reels[i] !== null ? { type: 'fray', hold: i } : null;
  }
  if (on(FL.pull)) return canPull(run) ? { type: 'fray', pull: true } : null;
  if (on(FL.next)) return { type: 'fray', next: true };
  if (on(FL.home)) return canLeave(run) ? { type: 'fray', leave: true } : null;
  return null;
}

const KEY_TAKE = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 };
const KEY_HOLD = { KeyQ: 0, KeyW: 1, KeyE: 2 };
/** At the reels: Space pulls, 1 2 3 take, Q W E hold, Enter is the next wave, H is home. On a fallen board Enter or Space leaves. */
export function frayKey(run, code) {
  if (!run) return null;
  if (run.phase === 'over') return code === 'Enter' || code === 'NumpadEnter' || code === 'Space' ? { type: 'confirm' } : null;
  if (run.phase !== 'shop') return null;
  if (code === 'Space') return { type: 'fray', pull: true };
  if (code in KEY_TAKE) return { type: 'fray', take: KEY_TAKE[code] };
  if (code in KEY_HOLD) return { type: 'fray', hold: KEY_HOLD[code] };
  if (code === 'Enter' || code === 'NumpadEnter') return { type: 'fray', next: true };
  if (code === 'KeyH') return { type: 'fray', leave: true };
  return null;
}

// ───────────────────────── drawing ─────────────────────────

function rr(g, x, y, w, h, r) {
  const q = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + q, y); g.lineTo(x + w - q, y); g.quadraticCurveTo(x + w, y, x + w, y + q);
  g.lineTo(x + w, y + h - q); g.quadraticCurveTo(x + w, y + h, x + w - q, y + h);
  g.lineTo(x + q, y + h); g.quadraticCurveTo(x, y + h, x, y + h - q);
  g.lineTo(x, y + q); g.quadraticCurveTo(x, y, x + q, y);
  g.closePath();
}
function panel(g, r, fill, radius = 12, stroke = INK, lw = 3) {
  rr(g, r.x, r.y, r.w, r.h, radius);
  g.fillStyle = fill; g.fill();
  if (stroke) { g.lineWidth = lw; g.strokeStyle = stroke; g.stroke(); }
}
function text(g, s, x, y, size, fill = WHITE, align = 'left', weight = 800) {
  g.font = font(size, weight); g.textAlign = align; g.fillStyle = fill; g.fillText(s, x, y);
}
function fitText(g, s, x, y, maxW, size, fill, align = 'left', weight = 800) {
  let z = size;
  g.font = font(z, weight);
  while (z > 8 && g.measureText(s).width > maxW) { z -= 0.5; g.font = font(z, weight); }
  g.textAlign = align; g.fillStyle = fill; g.fillText(s, x, y);
}
/** Words wrapped to maxW around centre x, at most `lines` lines. The font must be set. */
function wrap(g, s, x, y, maxW, lh, lines = 3) {
  const words = s.split(' ');
  let line = '', n = 0;
  for (let i = 0; i < words.length; i++) {
    const t = line ? `${line} ${words[i]}` : words[i];
    if (g.measureText(t).width > maxW && line) {
      g.fillText(line, x, y + n * lh); n++; line = words[i];
      if (n >= lines - 1) { line = words.slice(i).join(' '); break; }
    } else line = t;
  }
  if (line) g.fillText(line, x, y + n * lh, maxW);
}
function bar(g, x, y, w, h, f, fill, back = NAVY_DEEP) {
  rr(g, x, y, w, h, h / 2); g.fillStyle = back; g.fill();
  const k = Math.max(0, Math.min(1, f));
  if (k > 0) { rr(g, x, y, Math.max(h, w * k), h, h / 2); g.fillStyle = fill; g.fill(); }
  rr(g, x, y, w, h, h / 2); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
}
/** A weapon or a piece of kit, as a token: its colour, and its first letters. */
function token(g, sym, cx, cy, r) {
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = FRAY_COLOURS[sym] || GOLD; g.fill();
  g.lineWidth = Math.max(2, r * 0.12); g.strokeStyle = INK; g.stroke();
  const name = (WEAPONS[sym] || ITEMS[sym]).name;
  g.textBaseline = 'middle';
  text(g, name.slice(0, 2).toUpperCase(), cx, cy + 1, r * 0.82, INK, 'center');
  g.textBaseline = 'alphabetic';
}

function drawTop(g, run, FL) {
  const r = FL.top;
  panel(g, r, NAVY, 14);
  const hp = Math.max(0, Math.ceil(run.hero.hp)), max = run.stats.maxHp;
  bar(g, r.x + 12, r.y + 10, r.w * 0.4, 16, hp / max, hp * 3 <= max ? '#ff3b2a' : CORAL);
  text(g, `${hp} / ${max}`, r.x + 12 + r.w * 0.2, r.y + 23, 11.5, WHITE, 'center');
  bar(g, r.x + 12, r.y + 32, r.w * 0.4, 9, run.xp / levelCost(run.level), TEAL);
  text(g, `LEVEL ${run.level}`, r.x + 12, r.y + 54, 10.5, CREAM, 'left', 700);
  if (run.slot.free > 0 && run.phase === 'wave') text(g, `${run.slot.free} free pull${run.slot.free > 1 ? 's' : ''}`, r.x + 12 + r.w * 0.4, r.y + 54, 10.5, GOLD, 'right', 800);
  // the clock, which is the wave
  const cx = r.x + r.w * 0.6;
  text(g, `WAVE ${run.wave}`, cx, r.y + 20, 11.5, GOLD, 'center');
  const secs = Math.max(0, Math.ceil(run.t));
  text(g, run.phase === 'wave' ? String(secs) : '0', cx, r.y + 52, 30, run.phase === 'wave' && secs <= 5 ? GOLD : WHITE, 'center');
  // tin
  g.beginPath(); g.arc(r.x + r.w - 20, r.y + 22, 8, 0, Math.PI * 2); g.fillStyle = GOLD; g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
  text(g, String(run.tin), r.x + r.w - 34, r.y + 28, 19, GOLD, 'right');
  text(g, `${run.felled} felled`, r.x + r.w - 12, r.y + 52, 10.5, CREAM, 'right', 700);
}

/** The six hands, as tokens with tier pips. */
function drawHands(g, run, r, size) {
  const gap = 6, w = (r.w - gap * (SLOTS - 1)) / SLOTS;
  for (let i = 0; i < SLOTS; i++) {
    const x = r.x + i * (w + gap), wpn = run.weapons[i];
    panel(g, rect(x, r.y, w, r.h), wpn ? NAVY : 'rgba(29,42,92,0.45)', 9, INK, 2);
    if (!wpn) continue;
    token(g, wpn.id, x + r.h / 2, r.y + r.h / 2, size);
    fitText(g, WEAPONS[wpn.id].name, x + r.h + 1, r.y + r.h / 2 - 2, w - r.h - 4, 10.5, WHITE);
    for (let t = 0; t < TIERS; t++) { g.fillStyle = t < wpn.tier ? TIER_COLOUR[wpn.tier - 1] : DIM; g.fillRect(x + r.h + 1 + t * 7, r.y + r.h / 2 + 4, 5.5, 5); }
  }
}

function drawStick(g) {
  if (!frayStick.on) return;
  const { ox, oy } = frayStick;
  let dx = frayStick.x - ox, dy = frayStick.y - oy;
  const d = Math.hypot(dx, dy);
  if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
  g.globalAlpha = 0.35; g.beginPath(); g.arc(ox, oy, STICK_R + 8, 0, Math.PI * 2); g.fillStyle = NAVY_DEEP; g.fill();
  g.globalAlpha = 0.5; g.lineWidth = 2.5; g.strokeStyle = WHITE; g.stroke();
  g.globalAlpha = 0.85; g.beginPath(); g.arc(ox + dx, oy + dy, 22, 0, Math.PI * 2); g.fillStyle = WHITE; g.fill();
  g.globalAlpha = 1;
}

const SPIN_NAMES = [...Object.keys(WEAPONS), ...Object.keys(ITEMS)];

function button(g, r, label, sub, on, fill = NAVY, ink = GOLD) {
  g.globalAlpha = on ? 1 : 0.4;
  panel(g, r, fill, 12, on ? ink : INK, 2.5);
  if (sub) { text(g, label, r.x + r.w / 2, r.y + r.h / 2 - 1, Math.min(17, r.h * 0.36), ink, 'center'); text(g, sub, r.x + r.w / 2, r.y + r.h / 2 + 14, 10.5, CREAM, 'center', 700); }
  else { g.textBaseline = 'middle'; fitText(g, label, r.x + r.w / 2, r.y + r.h / 2 + 1, r.w - 10, Math.min(16, r.h * 0.42), ink, 'center'); g.textBaseline = 'alphabetic'; }
  g.globalAlpha = 1;
}

function drawReels(g, run, FL, L, time) {
  g.fillStyle = 'rgba(13,16,42,0.86)'; g.fillRect(0, 0, L.W, L.H);
  const { slot } = run;
  text(g, 'THE REELS', FL.title.x, FL.title.y, 26, GOLD, 'center');
  text(g, `Wave ${run.wave} survived. Pull, then take one. Pairs and triples pay more.`, FL.title.x, FL.title.y + 18, 11, CREAM, 'center', 700);
  // tin, top right of the column
  text(g, `${run.tin} tin`, FL.reels[2].x + FL.reels[2].w, FL.title.y - 4, 15, GOLD, 'right');
  for (let i = 0; i < 3; i++) {
    const r = FL.reels[i], sym = slot.reels[i];
    // reel i stops a third of the way through the spin after reel i - 1
    const turning = slot.spinT > 0.6 - i * 0.3 && !(slot.held[i] && sym !== null && slot.spinT > 0) && sym !== null && slot.spinT > 0;
    const m = sym !== null && slot.spinT <= 0 ? matches(run, i) : 1;
    panel(g, r, CREAM, 14, m >= 3 ? GOLD : m === 2 ? TEAL : INK, m >= 2 ? 4.5 : 3);
    if (sym === null) { g.textBaseline = 'middle'; text(g, '?', r.x + r.w / 2, r.y + r.h / 2, 46, '#d9cba0', 'center'); g.textBaseline = 'alphabetic'; }
    else if (turning) {
      const shown = SPIN_NAMES[Math.floor(time * 18 + i * 5) % SPIN_NAMES.length];
      token(g, shown, r.x + r.w / 2, r.y + r.h * 0.4 + ((time * 9) % 1) * 14 - 7, r.w * 0.26);
    } else {
      const d = describe(run, i);
      token(g, sym, r.x + r.w / 2, r.y + 12 + r.w * 0.24, r.w * 0.24);
      fitText(g, d.name, r.x + r.w / 2, r.y + r.w * 0.48 + 32, r.w - 10, 14.5, INK, 'center');
      g.font = font(10.5, 600); g.textAlign = 'center'; g.fillStyle = '#3a3f66';
      wrap(g, d.text, r.x + r.w / 2, r.y + r.w * 0.48 + 47, r.w - 12, 12.5, 3);
      if (d.mult >= 2 && slot.spinT <= 0) {
        const tag = d.mult === 3 ? 'THREE!' : 'PAIR';
        rr(g, r.x + r.w / 2 - 30, r.y - 9, 60, 18, 9); g.fillStyle = d.mult === 3 ? GOLD : TEAL; g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
        text(g, tag, r.x + r.w / 2, r.y + 4, 10.5, INK, 'center');
      }
    }
    const settled = slot.spinT <= 0 && sym !== null;
    button(g, FL.take[i], 'TAKE', null, settled && canTake(run, i), NAVY, GOLD);
    button(g, FL.hold[i], slot.held[i] ? 'HELD' : 'HOLD', null, settled, slot.held[i] ? TEAL : NAVY_DEEP, slot.held[i] ? INK : CREAM);
  }
  const free = slot.free, cost = pullCost(run);
  button(g, FL.pull, 'PULL', free > 0 ? `free: ${free} owed` : `${cost} tin`, canPull(run), free > 0 ? '#2f6d4f' : NAVY, GOLD);
  drawHands(g, run, FL.load, FL.load.h * 0.3);
  // the stats, two columns
  const ids = Object.keys(STAT_LABEL), colW = FL.stats.w / 2, lh = Math.min(15, FL.stats.h / 5);
  if (lh >= 9) {
    ids.forEach((id, k) => {
      const x = FL.stats.x + (k % 2) * colW, y = FL.stats.y + 11 + Math.floor(k / 2) * lh, v = run.stats[id];
      text(g, STAT_LABEL[id], x + 4, y, Math.min(11, lh - 2), '#aab0d0', 'left', 700);
      text(g, String(Math.round(v)), x + colW - 12, y, Math.min(11, lh - 2), v > (id === 'maxHp' ? 10 : 0) ? TEAL : WHITE, 'right');
    });
  }
  button(g, FL.next, `WAVE ${run.wave + 1}`, 'fight on', slot.spinT <= 0, '#2f6d4f', WHITE);
  button(g, FL.home, 'HOME', `bank ${run.take}`, canLeave(run), NAVY, GOLD);
}

function drawOver(g, run, L) {
  g.fillStyle = 'rgba(13,16,42,0.8)'; g.fillRect(0, 0, L.W, L.H);
  const w = Math.min(L.W - 40, 360), r = rect((L.W - w) / 2, L.H / 2 - 100, w, 200);
  panel(g, r, CREAM, 16);
  text(g, 'FALLEN', L.W / 2, r.y + 48, 30, CORAL, 'center');
  text(g, `in wave ${run.wave}, with ${run.felled} felled`, L.W / 2, r.y + 78, 14, INK, 'center', 700);
  text(g, `${Math.floor(run.take / 2)} of ${run.take} kept`, L.W / 2, r.y + 112, 18, NAVY, 'center');
  text(g, 'Your weapons, kit and tin stay. The board steps back two waves.', L.W / 2, r.y + 140, 10.5, '#3a3f66', 'center', 600);
  text(g, 'Tap to go back to the table', L.W / 2, r.y + 174, 13, NAVY, 'center');
}

/** The board, flat, for the 2D renderer. What the 3D view shows with tin, this shows with counters. */
function drawBoard2d(g, run, FL, time) {
  const b = FL.board, s = b.s, X = (x) => b.x + x * s, Y = (y) => b.y + y * s;
  panel(g, rect(b.x - 6, b.y - 6, b.w + 12, b.h + 12), '#7a4a22', 8);
  g.fillStyle = FRAY_COLOURS.feltA; g.fillRect(b.x, b.y, b.w, b.h);
  g.save(); g.beginPath(); g.rect(b.x, b.y, b.w, b.h); g.clip();
  for (const f of run.fires) { g.globalAlpha = 0.35 + 0.1 * Math.sin(time * 9 + f.x); g.beginPath(); g.arc(X(f.x), Y(f.y), f.r * s, 0, Math.PI * 2); g.fillStyle = FRAY_COLOURS.flask; g.fill(); }
  g.globalAlpha = 1;
  for (const sh of run.shells) { g.beginPath(); g.arc(X(sh.x), Y(sh.y), sh.r * s, 0, Math.PI * 2); g.lineWidth = 2; g.strokeStyle = CORAL; g.setLineDash([5, 4]); g.stroke(); g.setLineDash([]); }
  for (const m of run.marks) { const k = 5 + 4 * (m.t % 0.3); g.lineWidth = 3; g.strokeStyle = CORAL; g.beginPath(); g.moveTo(X(m.x) - k, Y(m.y) - k); g.lineTo(X(m.x) + k, Y(m.y) + k); g.moveTo(X(m.x) + k, Y(m.y) - k); g.lineTo(X(m.x) - k, Y(m.y) + k); g.stroke(); }
  for (const d of run.drops) { g.beginPath(); g.arc(X(d.x), Y(d.y), 3.5, 0, Math.PI * 2); g.fillStyle = GOLD; g.fill(); g.lineWidth = 1; g.strokeStyle = INK; g.stroke(); }
  for (const f of run.foes) {
    const def = FOES[f.kind];
    if (f.state === 'wind' || f.state === 'aim') { g.strokeStyle = CORAL; g.lineWidth = 2; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(X(f.x), Y(f.y)); g.lineTo(X(f.x + f.cx * 4), Y(f.y + f.cy * 4)); g.stroke(); g.setLineDash([]); }
    g.beginPath(); g.arc(X(f.x), Y(f.y), def.r * s, 0, Math.PI * 2); g.fillStyle = f.flash > 0 ? WHITE : FRAY_COLOURS[f.kind]; g.fill();
    g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
  }
  for (const sh of run.shots) { g.beginPath(); g.arc(X(sh.x), Y(sh.y), 3, 0, Math.PI * 2); g.fillStyle = WHITE; g.fill(); }
  for (const sh of run.bolts) { g.beginPath(); g.arc(X(sh.x), Y(sh.y), 4, 0, Math.PI * 2); g.fillStyle = CORAL; g.fill(); g.lineWidth = 1.5; g.strokeStyle = INK; g.stroke(); }
  // melee, from the run's log: the last few swings as fading arcs
  for (const e of run.fx) {
    if (e.type !== 'swing' || run.fxN - e.n > 14) continue;
    g.globalAlpha = 0.5; g.lineWidth = 5; g.strokeStyle = FRAY_COLOURS[e.weapon]; g.beginPath();
    if (e.weapon === 'flail') g.arc(X(run.hero.x), Y(run.hero.y), e.r * s, 0, Math.PI * 2);
    else if (e.weapon === 'pike') { g.moveTo(X(run.hero.x), Y(run.hero.y)); g.lineTo(X(run.hero.x + Math.cos(e.a) * e.r), Y(run.hero.y + Math.sin(e.a) * e.r)); }
    else g.arc(X(run.hero.x), Y(run.hero.y), e.r * s, e.a - 1, e.a + 1);
    g.stroke(); g.globalAlpha = 1;
  }
  const blink = run.hero.inv > 0 && Math.floor(time * 16) % 2 === 0;
  g.beginPath(); g.arc(X(run.hero.x), Y(run.hero.y), 0.4 * s, 0, Math.PI * 2); g.fillStyle = blink ? WHITE : FRAY_COLOURS.hero; g.fill();
  g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
  g.restore();
}

/**
 * The Lanewar HUD over whatever drew the board. opts.board: draw the board too (the 2D renderer).
 * opts.clear: paint the ground first (the 2D renderer has nothing behind it).
 */
export function drawFray(g, game, fx, L, opts = {}) {
  const { run } = game;
  if (!run) throw new Error('fray-view: mode fray with no run to draw');
  const FL = frayLayout(L, fx.safe ? fx.safe.top : 0);
  const time = fx.timeMs / 1000;
  g.save();
  g.globalAlpha = 1; g.setLineDash([]); g.textBaseline = 'alphabetic';
  if (opts.clear) { g.fillStyle = INK; g.fillRect(0, 0, L.W, L.H); }
  if (opts.board) drawBoard2d(g, run, FL, time);
  if (run.phase === 'shop') drawReels(g, run, FL, L, time);
  drawTop(g, run, FL);
  if (run.phase === 'wave') {
    drawHands(g, run, FL.slots, FL.slots.h * 0.3);
    drawStick(g);
    if (run.time < 4 && run.cleared === 0) {
      const hint = fx.touch ? 'Drag anywhere to move. Your weapons fire by themselves.' : 'WASD or arrows to move. Your weapons fire by themselves.';
      g.globalAlpha = Math.min(1, 4 - run.time);
      text(g, hint, L.W / 2, FL.area.y + 28, 13, WHITE, 'center');
      g.globalAlpha = 1;
    }
    // the table's callouts (the wave) ride over the board
    const toast = game.toasts[game.toasts.length - 1];
    if (toast && toast.t < 1.4) {
      g.globalAlpha = Math.min(1, (1.4 - toast.t) * 3);
      fitText(g, toast.text.toUpperCase(), L.W / 2, FL.area.y + 70, L.W - 60, 26, GOLD, 'center');
      g.globalAlpha = 1;
    }
  } else if (run.phase === 'over') drawOver(g, run, L);
  g.restore();
  return FL;
}

export const FRAY_PAYS = MULT_PAYS;
