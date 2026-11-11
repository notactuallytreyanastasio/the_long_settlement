// Lanewar on the glass: where things are, what a touch means, and everything that is drawn in 2D.
// Imperative shell. Both renderers use it: the 3D one draws the board itself (gl/fray3d.js) and asks this
// file only for the lettering and the cards; the 2D one asks for the board as well (opts.board).
//
//   frayLayout(L, safeTop)            -> { top, board, chips, cards[3], leave, hint }   logical px, same space as layout.js
//   frayScreen                        where the hero stands on the glass, written by whoever drew the board
//   frayPress(FL, run, down, up)      -> Msg | null     what a finger that went down at `down` and lifted at `up` asks for
//   frayKey(run, code)                -> Msg | null
//   drawFray(g, game, fx, L, opts)    the HUD; with opts.board the board too
//
// ONE FINGER. A turn is a swipe, or a tap on the side of the hero you want to go; a tap on the hero stands.
// Both, because a swipe is what a thumb does without looking and a tap is what a mouse does.

import { W, H, WEAPONS, WEAPON_IDS, PERKS, FOES, describe, waveSize, canLeave } from '../core/fray.js';

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

/** What each figure and weapon is painted, here and on the 3D board. */
export const FRAY_COLOURS = Object.freeze({
  hero: '#2bb7a3', foot: '#d8433a', lancer: '#3f6fd8', grenadier: '#3c7a4a', musket: '#e9e2d0', captain: '#8a4fc0',
  sabre: '#ffffff', flail: '#ffd24a', pike: '#bfe6ff', grape: '#ffb347', mortar: '#ff7a4a', oil: '#ff9a2a',
  feltA: '#2f8f6a', feltB: '#277d5c',
});

const rect = (x, y, w, h) => ({ x, y, w, h });
const inRect = (r, x, y, pad = 0) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;

const layouts = new Map();
export function frayLayout(L, safeTop = 0) {
  const st = Math.round(safeTop || 0);
  const k = `${L.kind}|${L.W}|${L.H}|${st}`;
  let FL = layouts.get(k);
  if (FL) return FL;
  const wide = L.kind === 'wide';
  const pad = wide ? 28 : 12;
  const top = rect(pad, st + (wide ? 16 : 10), L.W - pad * 2, 58);
  const chipsH = 46, hintH = 22;
  const chips = rect(pad, L.H - chipsH - hintH - 14, L.W - pad * 2, chipsH);
  const area = rect(pad, top.y + top.h + 8, L.W - pad * 2, chips.y - 8 - (top.y + top.h + 8));
  const cell = Math.floor(Math.min(area.w / W, area.h / H));
  const board = { x: Math.round(area.x + (area.w - cell * W) / 2), y: Math.round(area.y + (area.h - cell * H) / 2), w: cell * W, h: cell * H, cell, area };
  const cw = Math.min(L.W - pad * 2, 380), ch = wide ? 100 : 92, gap = 10;
  const cardsH = ch * 3 + gap * 2 + 14 + 52;
  const cy = Math.max(top.y + top.h + 56, Math.round((L.H - cardsH) / 2) + 20);
  const cx = Math.round((L.W - cw) / 2);
  const cards = [0, 1, 2].map((i) => rect(cx, cy + i * (ch + gap), cw, ch));
  const leave = rect(cx, cy + 3 * (ch + gap) + 4, cw, 52);
  FL = Object.freeze({ top, board, chips, cards, leave, hint: { x: L.W / 2, y: L.H - 12 }, area });
  layouts.set(k, FL);
  return FL;
}

/**
 * Where the hero is on the glass (logical px) and how big a square is there. The 3D view writes it from its
 * camera each frame; the 2D board writes it from the layout. A touch is read against it.
 */
export const frayScreen = { x: 0, y: 0, cell: 40, n: -1 };

const SWIPE = 20;        // logical px a finger must travel to be a swipe
const DRAFT_GUARD = 0.5; // seconds a draft ignores touches: the last swipes of a wave land on it otherwise

function dirOf(dx, dy) { return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : (dy > 0 ? 's' : 'n'); }

/** A finger went down at `down` [x, y] and came up at `up`. phaseT: seconds the run has been in its phase. */
export function frayPress(FL, run, down, up, phaseT) {
  if (!run) return null;
  if (run.phase === 'over') return phaseT > 0.6 ? { type: 'confirm' } : null;
  if (run.phase === 'draft') {
    if (phaseT < DRAFT_GUARD) return null;
    for (let i = 0; i < run.offers.length; i++) if (inRect(FL.cards[i], up[0], up[1]) && inRect(FL.cards[i], down[0], down[1])) return { type: 'fray', pick: i };
    if (canLeave(run) && inRect(FL.leave, up[0], up[1]) && inRect(FL.leave, down[0], down[1])) return { type: 'fray', leave: true };
    return null;
  }
  const dx = up[0] - down[0], dy = up[1] - down[1];
  if (dx * dx + dy * dy >= SWIPE * SWIPE) return { type: 'fray', act: dirOf(dx, dy) };
  const hx = up[0] - frayScreen.x, hy = up[1] - frayScreen.y, r = frayScreen.cell * 0.62;
  if (hx * hx + hy * hy <= r * r) return { type: 'fray', act: 'wait' };
  return { type: 'fray', act: dirOf(hx, hy) };
}

const KEY_ACT = {
  ArrowUp: 'n', KeyW: 'n', ArrowDown: 's', KeyS: 's', ArrowLeft: 'w', KeyA: 'w', ArrowRight: 'e', KeyD: 'e',
  Space: 'wait', Period: 'wait',
};
const KEY_PICK = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 };

/** Arrows or WASD move, Space stands; 1 2 3 take a card, H goes home from the draft, Enter leaves a fallen board. */
export function frayKey(run, code) {
  if (!run) return null;
  if (run.phase === 'turn') return KEY_ACT[code] ? { type: 'fray', act: KEY_ACT[code] } : null;
  if (run.phase === 'draft') {
    if (code in KEY_PICK) return run.offers[KEY_PICK[code]] ? { type: 'fray', pick: KEY_PICK[code] } : null;
    return code === 'KeyH' && canLeave(run) ? { type: 'fray', leave: true } : null;
  }
  return code === 'Enter' || code === 'NumpadEnter' || code === 'Space' ? { type: 'confirm' } : null;
}

// ───────────────────────── drawing ─────────────────────────

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
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
  while (z > 9 && g.measureText(s).width > maxW) { z -= 0.5; g.font = font(z, weight); }
  g.textAlign = align; g.fillStyle = fill; g.fillText(s, x, y);
}
/** Words wrapped to maxW, at most `lines` lines; returns the y after the last. */
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
  if (line) { g.fillText(line, x, y + n * lh, maxW); n++; }
  return y + n * lh;
}

function heart(g, x, y, s, full) {
  g.beginPath();
  g.moveTo(x, y + s * 0.3);
  g.bezierCurveTo(x, y - s * 0.25, x - s * 0.55, y - s * 0.25, x - s * 0.55, y + s * 0.12);
  g.bezierCurveTo(x - s * 0.55, y + s * 0.45, x - s * 0.2, y + s * 0.62, x, y + s * 0.85);
  g.bezierCurveTo(x + s * 0.2, y + s * 0.62, x + s * 0.55, y + s * 0.45, x + s * 0.55, y + s * 0.12);
  g.bezierCurveTo(x + s * 0.55, y - s * 0.25, x, y - s * 0.25, x, y + s * 0.3);
  g.closePath();
  g.fillStyle = full ? CORAL : '#39406e'; g.fill();
  g.lineWidth = 1.5; g.strokeStyle = INK; g.stroke();
}

function drawTop(g, run, FL) {
  const r = FL.top;
  panel(g, r, NAVY, 14);
  g.textBaseline = 'alphabetic';
  text(g, 'LANEWAR', r.x + 14, r.y + 22, 13, GOLD);
  text(g, `WAVE ${run.wave}`, r.x + 14, r.y + 46, 22, WHITE);
  // hearts, two rows when there are many
  const hp = run.hero.hp, max = run.hero.maxHp;
  const per = max > 13 ? Math.ceil(max / 2) : max, s = max > 13 ? 9 : 12;
  const hx0 = r.x + 118;
  for (let i = 0; i < max; i++) {
    const row = Math.floor(i / per), col = i % per;
    heart(g, hx0 + col * (s + 3), r.y + (max > 13 ? 12 : 20) + row * (s + 6), s, i < hp);
  }
  text(g, String(run.take), r.x + r.w - 14, r.y + 24, 18, GOLD, 'right');
  text(g, `${run.felled} felled`, r.x + r.w - 14, r.y + 42, 11, CREAM, 'right', 700);
  // the wave, as a bar: what is still to come and what is on the board
  const left = run.queue.length + run.foes.length, total = waveSize(run.wave) + (run.wave % 5 === 0 ? 1 : 0);
  const bw = r.w - 28, bx = r.x + 14, by = r.y + r.h - 7;
  rr(g, bx, by, bw, 4, 2); g.fillStyle = NAVY_DEEP; g.fill();
  const f = Math.max(0, Math.min(1, 1 - left / total));
  if (f > 0) { rr(g, bx, by, Math.max(4, bw * f), 4, 2); g.fillStyle = TEAL; g.fill(); }
}

function drawChips(g, run, FL) {
  const ids = WEAPON_IDS.filter((id) => run.weapons[id]);
  const perks = Object.keys(run.perks);
  const n = ids.length + (perks.length ? 1 : 0);
  const gap = 6, w = Math.min(96, (FL.chips.w - gap * (n - 1)) / n), h = FL.chips.h;
  let x = FL.chips.x + (FL.chips.w - (w * n + gap * (n - 1))) / 2;
  g.textBaseline = 'alphabetic';
  for (const id of ids) {
    const level = run.weapons[id], lv = WEAPONS[id].levels[level - 1];
    const wait = id === 'oil' ? 0 : Math.max(0, (run.cool[id] || 0) - 1);
    panel(g, rect(x, FL.chips.y, w, h), wait > 0 ? '#2a3156' : NAVY, 10, INK, 2.5);
    g.fillStyle = FRAY_COLOURS[id]; g.fillRect(x + 6, FL.chips.y + 6, 4, h - 12);
    fitText(g, SHORT[id], x + 14, FL.chips.y + 18, w - 18, 11.5, wait > 0 ? '#aab0d0' : WHITE);
    // level pips, and under them the turns until it fires again
    const pip = Math.min(6, (w - 20) / WEAPONS[id].levels.length - 1.5);
    for (let i = 0; i < WEAPONS[id].levels.length; i++) {
      g.fillStyle = i < level ? GOLD : '#39406e';
      g.fillRect(x + 14 + i * (pip + 1.5), FL.chips.y + 23, pip, 5);
    }
    if (lv.every > 1) text(g, wait > 0 ? `in ${wait}` : 'ready', x + 14, FL.chips.y + 40, 9, wait > 0 ? CREAM : TEAL, 'left', 700);
    x += w + gap;
  }
  if (perks.length) {
    panel(g, rect(x, FL.chips.y, w, h), NAVY, 10, INK, 2.5);
    const label = perks.map((p) => `${PERKS[p].name}${run.perks[p] > 1 ? ` ${run.perks[p]}` : ''}`).join(', ');
    g.font = font(9, 700); g.textAlign = 'left'; g.fillStyle = CREAM;
    wrap(g, label, x + 7, FL.chips.y + 15, w - 10, 11, 3);
  }
}

function drawDraft(g, run, FL, L, time) {
  g.fillStyle = 'rgba(13,16,42,0.72)'; g.fillRect(0, 0, L.W, L.H);
  const c0 = FL.cards[0];
  g.textBaseline = 'alphabetic';
  const owed = !canLeave(run);      // the pick left on the board last time
  text(g, owed ? 'YOUR PICK' : `WAVE ${run.wave} CLEARED`, L.W / 2, c0.y - 30, 24, GOLD, 'center');
  text(g, owed ? `Take one. Wave ${run.wave + 1} is waiting.` : 'Take one and fight on, or take the winnings home.', L.W / 2, c0.y - 10, 12.5, CREAM, 'center', 700);
  run.offers.forEach((offer, i) => {
    const r = FL.cards[i], d = describe(offer);
    const bob = Math.sin(time * 2.2 + i) * 1.5;
    const rc = rect(r.x, r.y + bob, r.w, r.h);
    panel(g, rc, CREAM, 14);
    const col = FRAY_COLOURS[offer.id] || GOLD;
    rr(g, rc.x + 10, rc.y + 10, 46, rc.h - 20, 9); g.fillStyle = offer.kind === 'weapon' ? NAVY : '#5a3d8a'; g.fill();
    text(g, String(i + 1), rc.x + 33, rc.y + rc.h / 2 + 9, 26, offer.kind === 'weapon' ? col : GOLD, 'center');
    fitText(g, d.name, rc.x + 68, rc.y + 30, rc.w - 150, 19, INK);
    const tag = d.isNew ? 'NEW' : offer.id === 'dressing' ? 'NOW' : `LEVEL ${d.level}`;
    g.font = font(10.5, 800);
    const tw = g.measureText(tag).width + 14;
    rr(g, rc.x + rc.w - tw - 12, rc.y + 14, tw, 20, 10); g.fillStyle = d.isNew ? CORAL : NAVY; g.fill();
    text(g, tag, rc.x + rc.w - 12 - tw / 2, rc.y + 28, 10.5, WHITE, 'center');
    g.font = font(12.5, 600); g.textAlign = 'left'; g.fillStyle = '#3a3f66';
    wrap(g, d.text, rc.x + 68, rc.y + 50, rc.w - 82, 15, 3);
  });
  if (owed) return;
  panel(g, FL.leave, NAVY, 14, GOLD, 2.5);
  text(g, `Take ${run.take} home`, L.W / 2, FL.leave.y + 24, 16, GOLD, 'center');
  text(g, 'back to the table with a ball save; the pick keeps', L.W / 2, FL.leave.y + 41, 11, CREAM, 'center', 700);
}

function drawOver(g, run, FL, L) {
  g.fillStyle = 'rgba(13,16,42,0.78)'; g.fillRect(0, 0, L.W, L.H);
  const w = Math.min(L.W - 40, 360), r = rect((L.W - w) / 2, L.H / 2 - 100, w, 200);
  panel(g, r, CREAM, 16);
  g.textBaseline = 'alphabetic';
  text(g, 'FALLEN', L.W / 2, r.y + 48, 30, CORAL, 'center');
  text(g, `at wave ${run.wave}, with ${run.felled} felled`, L.W / 2, r.y + 78, 14, INK, 'center', 700);
  text(g, `${Math.floor(run.take / 2)} of ${run.take} kept`, L.W / 2, r.y + 112, 18, NAVY, 'center');
  text(g, 'Your weapons stay with you. The board steps back two waves.', L.W / 2, r.y + 140, 10.5, '#3a3f66', 'center', 600);
  text(g, 'Tap to go back to the table', L.W / 2, r.y + 174, 13, NAVY, 'center');
}

const SHORT = { sabre: 'Sabre', pike: 'Pike', grape: 'Grape', flail: 'Flail', mortar: 'Mortar', oil: 'Oil' };
const LETTER = { foot: '', lancer: 'L', grenadier: 'G', musket: 'M', captain: 'C' };

/** The board, flat, for the 2D renderer. What the 3D view shows with tin, this shows with counters. */
function drawBoard2d(g, run, FL, time) {
  const b = FL.board, c = b.cell;
  panel(g, rect(b.x - 6, b.y - 6, b.w + 12, b.h + 12), '#7a4a22', 8);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    g.fillStyle = (x + y) % 2 ? FRAY_COLOURS.feltA : FRAY_COLOURS.feltB;
    g.fillRect(b.x + x * c, b.y + y * c, c, c);
  }
  for (const f of run.fires) {
    g.fillStyle = `rgba(255,154,42,${0.35 + 0.15 * Math.sin(time * 9 + f.x * 3 + f.y)})`;
    g.fillRect(b.x + f.x * c, b.y + f.y * c, c, c);
  }
  // where the last turn's weapons landed
  for (const e of run.events) {
    if (e.type !== 'swing') continue;
    g.fillStyle = FRAY_COLOURS[e.weapon]; g.globalAlpha = 0.3;
    for (const [x, y] of e.cells) g.fillRect(b.x + x * c + 2, b.y + y * c + 2, c - 4, c - 4);
    g.globalAlpha = 1;
  }
  g.textBaseline = 'middle';
  for (const f of run.foes) {
    const cx = b.x + (f.x + 0.5) * c, cy = b.y + (f.y + 0.5) * c, big = f.kind === 'captain' ? 0.46 : f.kind === 'grenadier' ? 0.4 : 0.32;
    if (f.aim) { g.strokeStyle = CORAL; g.lineWidth = 2; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(cx, cy); g.lineTo(b.x + (run.hero.x + 0.5) * c, b.y + (run.hero.y + 0.5) * c); g.stroke(); g.setLineDash([]); }
    g.beginPath(); g.arc(cx, cy, c * big, 0, Math.PI * 2); g.fillStyle = FRAY_COLOURS[f.kind]; g.fill();
    g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
    if (LETTER[f.kind]) text(g, LETTER[f.kind], cx, cy + 1, c * 0.34, f.kind === 'musket' ? INK : WHITE, 'center');
  }
  const hx = b.x + (run.hero.x + 0.5) * c, hy = b.y + (run.hero.y + 0.5) * c;
  g.beginPath(); g.arc(hx, hy, c * 0.4, 0, Math.PI * 2); g.fillStyle = FRAY_COLOURS.hero; g.fill();
  g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
  g.beginPath(); g.moveTo(hx + run.hero.face[0] * c * 0.2, hy + run.hero.face[1] * c * 0.2); g.lineTo(hx + run.hero.face[0] * c * 0.62, hy + run.hero.face[1] * c * 0.62);
  g.lineWidth = 4; g.strokeStyle = WHITE; g.stroke();
  g.textBaseline = 'alphabetic';
  frayScreen.x = hx; frayScreen.y = hy; frayScreen.cell = c; frayScreen.n = run.n;
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
  drawTop(g, run, FL);
  drawChips(g, run, FL);
  if (run.phase === 'turn') {
    const hint = fx.touch ? 'Swipe to move and face. Tap yourself to stand.' : 'Arrows or WASD to move and face. Space to stand.';
    text(g, hint, FL.hint.x, FL.hint.y, 11.5, CREAM, 'center', 700);
  } else if (run.phase === 'draft') drawDraft(g, run, FL, L, time);
  else if (run.phase === 'over') drawOver(g, run, FL, L);
  // the table's own callouts (the wave, what was carried home) ride over everything
  const toast = game.toasts[game.toasts.length - 1];
  if (toast && toast.t < 1.6 && run.phase === 'turn') {
    g.globalAlpha = Math.min(1, (1.6 - toast.t) * 3);
    fitText(g, toast.text.toUpperCase(), L.W / 2, FL.board.y + 34, L.W - 60, 26, GOLD, 'center');
    g.globalAlpha = 1;
  }
  g.restore();
  return FL;
}

/** For whoever needs the names without importing the core twice. */
export const FRAY_FOES = FOES;
