// Everything 2D that sits over the 3D game: the live HUD, the subtitle box, the title, the chapter card, both
// ends and the turn-me-upright card. Canvas 2D, in the caller's logical pixels.
//
//   drawHud(ctx, content, game, stage, fx, layout)      dispatches on game.mode; draws nothing 3D and clears nothing
//   drawTitle / drawCard / drawEnd (ctx, content, game, fx, layout),  drawRotate(ctx, fx, layout)
//   hudRects(layout, fx) -> { band, table, reels, flippers, launch, mute, skip, cineMute, sub, strip, menuBegin, menuContinue }
//       the rectangles this file draws to, after defaults and safe areas: input hit-tests the same numbers
//   HUD_BAND_FOOT, HUD_BAND_HEAD   logical px of the band's foot and head that lettering stands in: frame the cast between them
//
// The caller owns the canvas: it sets the logical transform (canvas px / layout.W) and clears before calling.
// This file never calls setTransform, never clears, never reads pixels and never writes to `game`.
//
// THE LOOK is the toon engine's: cream panels, a navy ink line, a hard navy drop under every panel, rounded pills,
// heavy rounded lettering, coral and gold for what matters. No gradients on panels, no blur.
//
// WHAT IT READS
//   layout.gl  (all optional; GL_DEFAULT below has the same names, portrait 430 x 932)
//     band Rect      the live stage band at rest          table Rect   the 3D table's viewport
//     reels Rect     screen bounds of the drums            flippers Rect  both flippers and the gap between them
//     launch Disc    mute Disc    skip Rect    cineMute Disc    sub Rect (the subtitle box in a full-screen cutscene)
//   stage      core/stage.js stageState(): opposition { name, kind }, progress { done, total },
//              combo { count, level 0..4, left 0..1, name, mult }, power 0..1, phase, beat? { name },
//              buffs { shield, double, doubleT, kickback, helpers, hat }. Without stage.buffs the same are read
//              from game.boons.
//   fx         timeMs, safe { top, bottom }, muted, touch, speaking (the Line being barked in play), voiceLevel, flash
//              band      Rect: the band as drawn this frame. As it grows past layout.gl.band the play HUD leaves
//                        and the subtitle box arrives; absent, play shows the HUD and a cinematic shows the box.
//              anchors   { [castId]: { x, y } }: the top of a head, logical px. A bark hangs its speech tick there;
//                        with no anchor for the speaker it takes the objective line's place at the foot of the band.
//              hasSave   { chapter, scene } | null: the title offers Continue
//              loading   0..1 while the sets build: title and card show a bar where the tap prompt goes
//              In a cinematic an anchor for the speaker also gets a small speaking marker over their head.
//              Not drawn here: the energy arcs from the table to the stage (the director's drawOverlay).
//              sideways  true: only the turn-me-upright card is drawn
//
// State: none but caches (when a bark was first seen, so a long one can turn its pages; measured lettering).

import { currentScene, lineSeconds, endingOf } from '../../core/story.js';
import { SPIN_COST, LOAN, ledger } from '../../core/economy.js';
import { launchState } from '../render.js';

const TAU = Math.PI * 2;
const FACE = '"Avenir Next", "Trebuchet MS", ui-rounded, system-ui, sans-serif';
const MIN_TYPE = 11; // logical px; nothing is lettered smaller

const CREAM = '#fff7e2';
const CREAM_LO = '#f1dfb4';
const NAVY = '#1d2a5c';
const NAVY_HI = '#2a3a7c';
const NAVY_DEEP = '#131c44';
const CORAL = '#f2553a';
const CORAL_HI = '#ff8a5c';
const GOLD = '#ffd24a';
const GOLD_LO = '#e89a1c';
const TEAL = '#2bb7a3';
const SKY = '#4a8fe8';
const ROSE = '#ff6b8a';
const LILAC = '#8a7fb0';
const WHITE = '#ffffff';

const THREADS = { duty: GOLD, covert: '#8fd0ff', commons: '#ffab5c' };
const COMBO_FILL = ['#ffffff', '#ffffff', GOLD, '#ffa23c', '#ff6b5a'];
const COMBO_GENERIC = ['', '', 'DOUBLE', 'TEAM UP', 'TEAM MOVE'];
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/** The band's foot (status strip and objective line) and head (score and opposition rows), logical px. */
export const HUD_BAND_FOOT = 54;
export const HUD_BAND_HEAD = 60;
const STRIP_H = 30;

const R = (x, y, w, h) => Object.freeze({ x, y, w, h });
const D = (x, y, r) => Object.freeze({ x, y, r });
/** What layout.gl is assumed to be until the GL shell says otherwise. Portrait, 430 x 932. */
export const GL_DEFAULT = Object.freeze({
  band: R(0, 0, 430, 236),
  table: R(0, 236, 430, 696),
  reels: R(100, 246, 230, 96),
  flippers: R(96, 770, 238, 90),
  launch: D(382, 856, 38),
  mute: D(411, 221, 12),
  skip: R(314, 16, 102, 38),
  cineMute: D(290, 35, 15),
  sub: R(14, 756, 402, 134),
});

// ───────────────────────── small pure helpers ─────────────────────────

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const fmtInt = (n) => Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const font = (size, weight = 800, italic = false) => `${italic ? 'italic ' : ''}${weight} ${size}px ${FACE}`;
const backOut = (t) => { const c = 1.9, u = clamp(t, 0, 1) - 1; return 1 + (c + 1) * u * u * u + c * u * u; };

function luminance(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`hud: a cast colour must be #rrggbb, got ${JSON.stringify(hex)}`);
  const n = parseInt(m[1], 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

function safeOf(fx) {
  const s = fx.safe;
  if (s === undefined || s === null) return { top: 0, bottom: 0 };
  if (!(s.top >= 0) || !(s.bottom >= 0)) throw new Error(`hud: fx.safe must be { top, bottom } in logical px, got ${JSON.stringify(s)}`);
  return s;
}

function checkArgs(fx, layout) {
  if (!layout || !(layout.W > 0) || !(layout.H > 0)) throw new Error(`hud: needs a layout with W and H, got ${JSON.stringify(layout && { W: layout.W, H: layout.H })}`);
  if (!fx || typeof fx.timeMs !== 'number') throw new Error(`hud: fx.timeMs must be a number, got ${fx && String(fx.timeMs)}`);
}

/**
 * The rectangles the HUD draws to. Input reads the title menu and the buttons from here.
 * @returns {{band,table,reels,flippers,launch,mute,skip,cineMute,sub,strip,menuBegin,menuContinue}}
 */
export function hudRects(layout, fx) {
  const gl = (layout && layout.gl) || {};
  const pick = (k) => gl[k] || GL_DEFAULT[k];
  const safe = fx ? safeOf(fx) : { top: 0, bottom: 0 };
  const { W, H } = layout;
  const band = pick('band');
  const sub0 = pick('sub');
  const lift = Math.max(0, safe.bottom + 8 - (H - sub0.y - sub0.h));
  const skip0 = pick('skip');
  const cm = pick('cineMute');
  const drop = Math.max(0, safe.top + 6 - skip0.y);
  const bw = Math.min(300, W - 64);
  const by = Math.round(H * 0.66);
  const hasSave = Boolean(fx && fx.hasSave);
  return {
    band,
    table: pick('table'),
    reels: pick('reels'),
    flippers: pick('flippers'),
    launch: gl.launch || (layout.gl ? GL_DEFAULT.launch : layout.launch || GL_DEFAULT.launch),
    mute: pick('mute'),
    skip: R(skip0.x, skip0.y + drop, skip0.w, skip0.h),
    cineMute: D(cm.x, cm.y + drop, cm.r),
    sub: R(sub0.x, sub0.y - lift, sub0.w, sub0.h),
    strip: R(band.x, band.y + band.h - STRIP_H, band.w, STRIP_H),
    menuBegin: R((W - bw) / 2, by, bw, 58),
    menuContinue: hasSave ? R((W - bw) / 2, by + 74, bw, 50) : null,
  };
}

// ───────────────────────── canvas helpers ─────────────────────────

function rr(g, x, y, w, h, r) {
  const q = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + q, y);
  g.arcTo(x + w, y, x + w, y + h, q);
  g.arcTo(x + w, y + h, x, y + h, q);
  g.arcTo(x, y + h, x, y, q);
  g.arcTo(x, y, x + w, y, q);
  g.closePath();
}

/** A panel: a hard drop, a fill, an ink line. */
function panel(g, x, y, w, h, o = {}) {
  const r = o.r === undefined ? Math.min(13, h / 2) : o.r;
  const ink = o.ink || NAVY;
  const drop = o.drop === undefined ? 3 : o.drop;
  const lw = o.lw === undefined ? 2.5 : o.lw;
  if (drop > 0) {
    rr(g, x, y + drop, w, h, r);
    g.fillStyle = ink;
    g.fill();
    g.lineWidth = lw;
    g.strokeStyle = ink;
    g.stroke();
  }
  rr(g, x, y, w, h, r);
  g.fillStyle = o.fill || CREAM;
  g.fill();
  if (o.dash) g.setLineDash(o.dash);
  g.lineWidth = lw;
  g.strokeStyle = ink;
  g.stroke();
  if (o.dash) g.setLineDash([]);
}

/** Lettering with an ink line round it and a hard drop under it: for words that stand straight on the picture. */
function inked(g, text, x, y, o = {}) {
  const lw = o.lw === undefined ? 4 : o.lw;
  const drop = o.drop === undefined ? 2 : o.drop;
  g.lineJoin = 'round';
  g.miterLimit = 2;
  g.strokeStyle = o.ink || NAVY;
  g.lineWidth = lw;
  if (drop > 0) {
    g.fillStyle = o.ink || NAVY;
    g.strokeText(text, x, y + drop);
    g.fillText(text, x, y + drop);
  }
  g.strokeText(text, x, y);
  g.fillStyle = o.fill || WHITE;
  g.fillText(text, x, y);
}

/** Set the largest font from `size` down to `min` at which `text` fits maxW; returns the size set. */
function fit(g, text, maxW, size, min = MIN_TYPE, weight = 800, italic = false) {
  let s = size;
  for (;;) {
    g.font = font(s, weight, italic);
    if (s <= min || g.measureText(text).width <= maxW) return s;
    s = Math.max(min, s - 0.5);
  }
}

function wrap(g, text, maxW) {
  const out = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    if (word === '') continue;
    const next = line ? `${line} ${word}` : word;
    if (line && g.measureText(next).width > maxW) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

function ellipsize(g, text, maxW) {
  if (g.measureText(text).width <= maxW) return text;
  let s = String(text);
  while (s.length > 1 && g.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

function starPath(g, x, y, r0, r1, n, rot = -Math.PI / 2) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const r = i % 2 ? r1 : r0;
    if (i === 0) g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
}

function star(g, x, y, r, fill = GOLD, lw = 2) {
  starPath(g, x, y, r, r * 0.48, 5);
  g.lineJoin = 'round';
  g.fillStyle = fill;
  g.fill();
  g.strokeStyle = NAVY;
  g.lineWidth = lw;
  g.stroke();
}

function heartPath(g, x, y, s) {
  g.beginPath();
  g.moveTo(x, y + s * 0.9);
  g.bezierCurveTo(x - s * 1.5, y - s * 0.1, x - s * 0.75, y - s * 1.15, x, y - s * 0.35);
  g.bezierCurveTo(x + s * 0.75, y - s * 1.15, x + s * 1.5, y - s * 0.1, x, y + s * 0.9);
  g.closePath();
}

/** A writ: the ball it launches. */
function ballIcon(g, x, y, r, on) {
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fillStyle = on ? WHITE : NAVY_HI;
  g.fill();
  g.strokeStyle = on ? NAVY_DEEP : '#5d6fb4';
  g.lineWidth = 1.8;
  g.stroke();
  if (on) {
    g.beginPath();
    g.arc(x + r * 0.2, y + r * 0.2, r * 0.62, 0.15, Math.PI * 0.75);
    g.strokeStyle = '#b9c3e6';
    g.lineWidth = 1.6;
    g.stroke();
    g.beginPath();
    g.arc(x - r * 0.32, y - r * 0.34, r * 0.22, 0, TAU);
    g.fillStyle = '#dfe8ff';
    g.fill();
  }
}

function coinIcon(g, x, y, r) {
  g.beginPath();
  g.arc(x, y + 1.5, r, 0, TAU);
  g.fillStyle = '#b8690e';
  g.fill();
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fillStyle = GOLD;
  g.fill();
  g.strokeStyle = NAVY_DEEP;
  g.lineWidth = 1.8;
  g.stroke();
  g.beginPath();
  g.arc(x, y, r * 0.52, 0, TAU);
  g.strokeStyle = GOLD_LO;
  g.lineWidth = 1.6;
  g.stroke();
}

// ───────────────────────── the live HUD ─────────────────────────

/** How far the band has grown from its resting size toward the whole screen, 0..1. */
function growOf(rects, fx, layout) {
  const b = fx.band;
  if (!b) return null;
  if (!(b.h > 0)) throw new Error(`hud: fx.band must be a Rect with a height, got ${JSON.stringify(b)}`);
  const room = layout.H - rects.band.h;
  return room > 0 ? clamp((b.h - rects.band.h) / room, 0, 1) : 0;
}

/**
 * The chips under the opposition bar, as [label, fill, seconds or null]. stage.buffs is core/stage.js buffsOf():
 * { shield (s), double, doubleT (s), kickback, helpers, hat }. Without it the same four are read from game.boons.
 */
function boonsOf(game, stage) {
  let f = stage.buffs;
  if (f === undefined || f === null) {
    const b = game.boons || {};
    const balls = game.phys ? game.phys.balls.length : 0;
    f = { shield: b.ballSave, double: b.multT > 0 ? b.mult : 1, doubleT: b.multT, kickback: b.kickback, helpers: Math.max(0, balls - 1), hat: false };
  } else if (typeof f !== 'object' || Array.isArray(f)) {
    throw new Error(`hud: stage.buffs must be the object core/stage.js makes, got ${JSON.stringify(f)}`);
  }
  const out = [];
  if (f.hat) out.push(['THE HAT IS OUT', '#ffd9a8', null]);
  if (f.shield > 0) out.push([BOON_LOOK.ballSave[0], BOON_LOOK.ballSave[1], Math.ceil(f.shield)]);
  if (f.double > 1) out.push([`×${f.double} MARKS`, BOON_LOOK.doubleMarks[1], f.doubleT > 0 ? Math.ceil(f.doubleT) : null]);
  if (f.helpers > 0) out.push([BOON_LOOK.multiball[0], BOON_LOOK.multiball[1], null]);
  if (f.kickback > 0) out.push([f.kickback > 1 ? `KICK ×${f.kickback}` : 'KICK', BOON_LOOK.kickback[1], null]);
  return out;
}
const BOON_LOOK = {
  ballSave: ['SAVE', '#8fe3c8'],
  doubleMarks: ['×2 MARKS', GOLD],
  multiball: ['MULTIBALL', '#a9cdfb'],
  kickback: ['KICK', '#ffc08a'],
};

function drawScore(g, x, y, score) {
  const text = fmtInt(score);
  g.font = font(16, 800);
  const w = g.measureText(text).width + 40;
  panel(g, x, y, w, 26);
  star(g, x + 15, y + 13.5, 8);
  g.fillStyle = NAVY;
  g.textAlign = 'left';
  g.fillText(text, x + 28, y + 19);
  return w;
}

/** The opposition: its name on a pill and, under it, what is left of it. Returns { bottom, left } of the block. */
function drawOpposition(g, right, y, stage, now, maxW) {
  // a scene with no encounter has no opposition: the bar is then just the objective's
  const opp = stage.opposition || { name: 'Objective', kind: 'force' };
  if (typeof opp.name !== 'string') throw new Error(`hud: stage.opposition must have a name, got ${JSON.stringify(opp)}`);
  const pr = stage.progress;
  if (!pr || !(pr.total > 0) || !(pr.done >= 0)) throw new Error(`hud: stage.progress must be { done, total > 0 }, got ${JSON.stringify(pr)}`);
  const name = opp.name.toUpperCase();
  const force = opp.kind === 'force';
  const size = fit(g, name, maxW - 40, 13, MIN_TYPE, 800);
  const tw = g.measureText(name).width;
  const w = Math.max(132, tw + 40);
  const x = right - w;
  panel(g, x, y, w, 26);
  // people: a peaked cap. a force (weather, a crowd's panic, a debt): a gust
  g.strokeStyle = CORAL;
  g.fillStyle = CORAL;
  g.lineWidth = 2.6;
  g.lineCap = 'round';
  if (force) {
    g.beginPath();
    g.moveTo(x + 9, y + 10);
    g.quadraticCurveTo(x + 15, y + 5, x + 20, y + 10);
    g.moveTo(x + 9, y + 17);
    g.quadraticCurveTo(x + 15, y + 12, x + 22, y + 17);
    g.stroke();
  } else {
    g.beginPath();
    g.arc(x + 15, y + 15, 6, Math.PI, 0);
    g.closePath();
    g.fill();
    g.fillRect(x + 8, y + 15, 15, 3);
  }
  g.lineCap = 'butt';
  g.font = font(size, 800);
  g.fillStyle = NAVY;
  g.textAlign = 'left';
  g.fillText(name, x + 29, y + 13 + size * 0.36);

  // the bar: what the objective has not yet taken
  const by = y + 33;
  const bh = 14;
  const leftOf = clamp(1 - pr.done / pr.total, 0, 1);
  const won = stage.phase === 'resolve' || pr.done >= pr.total;
  const count = won ? 'DONE' : `${pr.done}/${pr.total}`;
  g.font = font(12, 800);
  const cw = g.measureText(count).width + 14;
  const bx = x + cw + 4;
  const bw = w - cw - 4;
  panel(g, x, by - 2, cw, bh + 4, { r: 9, fill: won ? GOLD : CREAM });
  g.fillStyle = NAVY;
  g.textAlign = 'center';
  g.fillText(count, x + cw / 2, by + 11.5);
  panel(g, bx, by, bw, bh, { r: 8, fill: NAVY_HI });
  if (leftOf > 0) {
    g.save();
    rr(g, bx + 1.2, by + 1.2, bw - 2.4, bh - 2.4, 6.5);
    g.clip();
    const fw = Math.max(6, (bw - 2.4) * leftOf);
    g.fillStyle = CORAL;
    g.fillRect(bx + 1.2, by, fw, bh);
    g.fillStyle = CORAL_HI;
    g.fillRect(bx + 1.2, by + 1.2, fw, 4);
    g.fillStyle = NAVY;
    g.fillRect(bx + 1.2 + fw, by, 2.2, bh);
    g.restore();
  }
  if (pr.total > 1 && pr.total <= 12) {
    g.fillStyle = 'rgba(29,42,92,0.55)';
    for (let i = 1; i < pr.total; i++) g.fillRect(bx + (bw * i) / pr.total - 0.75, by + 2, 1.5, bh - 4);
  }
  if (won) {
    const on = Math.floor(now / 120) % 2 === 0;
    g.font = font(11, 800, true);
    g.textAlign = 'center';
    inked(g, 'SETTLED!', bx + bw / 2, by + 11, { fill: on ? GOLD : WHITE, lw: 3, drop: 0 });
  }
  g.textAlign = 'left';
  return { bottom: by + bh + 3, left: x };
}

function drawBoons(g, right, y, boons) {
  let x = right;
  let row = y;
  for (const [label, fill, n] of boons) {
    const text = n === null ? label : `${label} ${n}`;
    g.font = font(MIN_TYPE, 800);
    const w = g.measureText(text).width + 14;
    if (x - w < right - 200) {
      x = right;
      row += 25;
    }
    panel(g, x - w, row, w, 19, { r: 9, fill, drop: 2, lw: 2 });
    g.fillStyle = NAVY;
    g.textAlign = 'center';
    g.fillText(text, x - w / 2, row + 13.5);
    x -= w + 5;
  }
  g.textAlign = 'left';
}

/** The combo: a number that jumps when it grows, its name at level 2 and up (kept inside maxW), and a fuse that burns down. */
function drawCombo(g, x, y, combo, now, maxW) {
  if (!combo || !(combo.count > 0)) return;
  const level = clamp(Math.floor(combo.level || 0), 0, 4);
  const left = clamp(combo.left === undefined ? 1 : combo.left, 0, 1);
  const fresh = clamp((left - 0.93) / 0.07, 0, 1); // the first third of a second after a hit
  const k = 1 + fresh * (0.16 + 0.07 * level);
  const fill = level >= 4 ? (Math.floor(now / 90) % 2 ? GOLD : COMBO_FILL[4]) : COMBO_FILL[level];
  const name = level >= 2 ? String(combo.name || COMBO_GENERIC[level]).toUpperCase() : level === 1 ? 'HITS' : '';
  g.save();
  g.translate(x, y);
  g.rotate(-0.05);
  g.scale(k, k);
  if (level >= 3) {
    // a burst behind the number: the team move
    starPath(g, 20, -12, 22 + level * 2, 15, 10, now / 700);
    g.fillStyle = level >= 4 ? CORAL : GOLD_LO;
    g.globalAlpha = 0.9;
    g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = NAVY;
    g.lineWidth = 2.5;
    g.lineJoin = 'round';
    g.stroke();
  }
  const size = 30 + level * 2;
  g.font = font(size, 800, true);
  g.textAlign = 'left';
  const num = String(combo.count);
  inked(g, num, 0, 0, { fill, lw: 5, drop: 3 });
  const nw = g.measureText(num).width;
  if (name) {
    fit(g, name, Math.max(60, maxW / k - nw - 6), level >= 3 ? 15 : 13, MIN_TYPE, 800, true);
    inked(g, name, nw + 6, -2, { fill: level >= 3 ? fill : WHITE, lw: 4, drop: 2 });
  }
  g.restore();
  // what the chain is worth: score only (the core never multiplies marks)
  if (combo.mult > 1) {
    g.font = font(MIN_TYPE, 800);
    g.textAlign = 'left';
    inked(g, `SCORE ×${combo.mult}`, x + 82, y + 15.5, { fill: fill === WHITE ? GOLD : fill, lw: 3, drop: 1 });
  }
  // the fuse
  const fw = 74;
  panel(g, x, y + 8, fw, 7, { r: 4, fill: NAVY_HI, drop: 0, lw: 2 });
  if (left > 0.02) {
    rr(g, x + 1.5, y + 9.5, Math.max(4, (fw - 3) * left), 4, 2);
    g.fillStyle = left < 0.25 && Math.floor(now / 110) % 2 ? WHITE : fill === WHITE ? GOLD : fill;
    g.fill();
  }
}

/** The foot of the band: writs, marks, what is owed, trust. Its top edge is the line the table's power runs along. */
function drawStrip(g, S, game, stage, now, mute) {
  const e = game.econ;
  g.fillStyle = NAVY;
  g.fillRect(S.x, S.y, S.w, S.h);
  const power = clamp(stage.power === undefined ? 1 : stage.power, 0, 1);
  g.fillStyle = '#56659f';
  g.fillRect(S.x, S.y, S.w, 3);
  const pw = (S.w * power) / 2;
  g.fillStyle = GOLD;
  g.fillRect(S.x + S.w / 2 - pw, S.y, pw * 2, 3);
  if (power > 0.02 && power < 0.999) {
    // the two ends of the live line glint
    g.fillStyle = WHITE;
    const tw = 4 + 2 * Math.sin(now / 130);
    g.fillRect(S.x + S.w / 2 - pw, S.y, tw, 3);
    g.fillRect(S.x + S.w / 2 + pw - tw, S.y, tw, 3);
  }
  const cy = S.y + 3 + (S.h - 3) / 2;
  const base = cy + 4.5;
  let x = S.x + 12;
  g.textAlign = 'left';

  // writs
  g.font = font(MIN_TYPE, 800);
  g.fillStyle = '#b9c6f2';
  g.fillText('WRITS', x, base - 0.5);
  x += g.measureText('WRITS').width + 9;
  const shown = Math.min(e.writs, 4);
  if (e.writs === 0) {
    ballIcon(g, x + 2, cy, 5.5, false);
    x += 14;
  }
  for (let i = 0; i < shown; i++) ballIcon(g, x + 2 + i * 14, cy, 5.5, true);
  x += shown * 14;
  if (e.writs > shown) {
    g.font = font(12, 800);
    g.fillStyle = WHITE;
    g.fillText(`+${e.writs - shown}`, x, base);
    x += g.measureText(`+${e.writs - shown}`).width + 4;
  }
  x += 9;

  // marks
  coinIcon(g, x + 7, cy - 0.5, 7);
  g.font = font(14, 800);
  g.fillStyle = CREAM;
  const marks = fmtInt(e.marks);
  g.fillText(marks, x + 18, base + 0.5);
  x += 18 + g.measureText(marks).width + 12;

  // trust, from the right; the mute button has the corner
  const muteInStrip = mute.y + mute.r > S.y && mute.y - mute.r < S.y + S.h && mute.x > S.x + S.w * 0.6;
  const right = muteInStrip ? mute.x - mute.r - 9 : S.x + S.w - 12;
  const tw = 58;
  const tx = right - tw;
  const trust = clamp(e.trust / 100, 0, 1);
  rr(g, tx, cy - 5, tw, 10, 5);
  g.fillStyle = NAVY_DEEP;
  g.fill();
  if (trust > 0) {
    rr(g, tx, cy - 5, Math.max(10, tw * trust), 10, 5);
    g.fillStyle = '#ffab5c';
    g.fill();
  }
  rr(g, tx, cy - 5, tw, 10, 5);
  g.strokeStyle = '#8795cf';
  g.lineWidth = 1.6;
  g.stroke();
  // one notch per aid ball the town will pass the hat for
  g.fillStyle = 'rgba(19,28,68,0.6)';
  for (let i = 1; i < 4; i++) g.fillRect(tx + (tw * i) / 4 - 0.75, cy - 3.5, 1.5, 7);
  heartPath(g, tx - 11, cy - 0.5, 6.4);
  g.fillStyle = ROSE;
  g.fill();
  g.strokeStyle = NAVY_DEEP;
  g.lineWidth = 1.8;
  g.stroke();
  const trustLeft = tx - 22;

  // what is owed to the Mint, only while something is
  if (e.debt > 0) {
    const text = `OWED ${fmtInt(Math.ceil(e.debt))}`;
    g.font = font(MIN_TYPE, 800);
    const w = g.measureText(text).width + 14;
    const dx = Math.min(x, trustLeft - w - 4);
    rr(g, dx, cy - 9, w, 18, 9);
    g.fillStyle = CORAL;
    g.fill();
    g.strokeStyle = NAVY_DEEP;
    g.lineWidth = 1.8;
    g.stroke();
    g.fillStyle = WHITE;
    g.textAlign = 'center';
    g.fillText(text, dx + w / 2, cy + 4);
    g.textAlign = 'left';
  }
}

function drawMute(g, b, muted) {
  g.beginPath();
  g.arc(b.x, b.y + 2, b.r, 0, TAU);
  g.fillStyle = NAVY_DEEP;
  g.fill();
  g.beginPath();
  g.arc(b.x, b.y, b.r, 0, TAU);
  g.fillStyle = muted ? '#c9cfe6' : CREAM;
  g.fill();
  g.strokeStyle = NAVY_DEEP;
  g.lineWidth = 2;
  g.stroke();
  const s = b.r / 12;
  g.fillStyle = NAVY;
  g.beginPath();
  g.moveTo(b.x - 6.5 * s, b.y - 2.5 * s);
  g.lineTo(b.x - 3 * s, b.y - 2.5 * s);
  g.lineTo(b.x + 1 * s, b.y - 6 * s);
  g.lineTo(b.x + 1 * s, b.y + 6 * s);
  g.lineTo(b.x - 3 * s, b.y + 2.5 * s);
  g.lineTo(b.x - 6.5 * s, b.y + 2.5 * s);
  g.closePath();
  g.fill();
  g.lineCap = 'round';
  g.lineWidth = 1.8 * s;
  if (muted) {
    g.strokeStyle = CORAL;
    g.lineWidth = 2.4 * s;
    g.beginPath();
    g.moveTo(b.x - 7 * s, b.y + 7 * s);
    g.lineTo(b.x + 7 * s, b.y - 7 * s);
    g.stroke();
  } else {
    g.strokeStyle = NAVY;
    g.beginPath();
    g.arc(b.x + 1.5 * s, b.y, 3.6 * s, -0.8, 0.8);
    g.stroke();
    g.beginPath();
    g.arc(b.x + 1.5 * s, b.y, 6.6 * s, -0.7, 0.7);
    g.stroke();
  }
  g.lineCap = 'butt';
}

// What each launch state looks like: cap colour, the big word, the small word under it, lettering colour.
function capOf(state) {
  switch (state.kind) {
    case 'launch': return [CORAL, 'LAUNCH', '', WHITE];
    case 'idle': return ['#8e9bc9', '', '', WHITE];
    case 'busy': return [NAVY_HI, '', '', WHITE];
    case 'free': return [GOLD, 'PULL', 'FREE', NAVY];
    case 'lever': return [GOLD, 'PULL', fmtInt(SPIN_COST), NAVY];
    case 'loan': return [ROSE, 'BORROW', `+${fmtInt(LOAN.marks)}`, WHITE];
    case 'credit': return [TEAL, 'BORROW', 'or wait', WHITE];
    default: throw new Error(`hud: no button is drawn for launch state '${state.kind}'`);
  }
}

/** The one button: plunger while a ball waits, lever when none can. `state` is render.js launchState(). */
function drawLaunch(g, b, state, now) {
  const [fill, word, small, col] = capOf(state);
  const live = state.kind !== 'idle' && state.kind !== 'busy';
  const press = state.kind === 'launch' ? state.charge * 4 : 0;
  const r = b.r;
  g.save();
  if (!live) g.globalAlpha = state.kind === 'busy' ? 0.92 : 0.5;
  // the well and the drop
  g.beginPath();
  g.arc(b.x, b.y + 5, r, 0, TAU);
  g.fillStyle = NAVY_DEEP;
  g.fill();
  const y = b.y + press;
  g.beginPath();
  g.arc(b.x, y, r, 0, TAU);
  g.fillStyle = CREAM;
  g.fill();
  g.strokeStyle = NAVY_DEEP;
  g.lineWidth = 3;
  g.stroke();
  const cr = r - 7;
  g.beginPath();
  g.arc(b.x, y, cr, 0, TAU);
  g.fillStyle = fill;
  g.fill();
  g.strokeStyle = NAVY_DEEP;
  g.lineWidth = 2.5;
  g.stroke();
  // one hard highlight
  g.beginPath();
  g.arc(b.x, y, cr - 5, Math.PI * 1.08, Math.PI * 1.52);
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = 3.5;
  g.lineCap = 'round';
  g.stroke();

  // the ring: charge while launching, the hat on its way while the town passes it
  const ring = state.kind === 'launch' ? state.charge : state.kind === 'credit' ? state.hat : 0;
  if (ring > 0) {
    g.beginPath();
    g.arc(b.x, y, r - 3.5, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(ring, 0, 1));
    g.strokeStyle = state.kind === 'credit' ? '#ffab5c' : GOLD;
    g.lineWidth = 5;
    g.stroke();
  }
  g.lineCap = 'butt';
  if (live && state.kind !== 'launch') {
    // a lever that can be pulled asks for it
    const pulse = (now / 900) % 1;
    g.beginPath();
    g.arc(b.x, y, r + 2 + pulse * 9, 0, TAU);
    g.strokeStyle = fill;
    g.globalAlpha = (1 - pulse) * 0.8;
    g.lineWidth = 3;
    g.stroke();
    g.globalAlpha = 1;
  }

  g.textAlign = 'center';
  if (state.kind === 'busy') {
    // the reels are turning: three beads go round
    for (let i = 0; i < 3; i++) {
      const a = now / 220 + (i * TAU) / 3;
      g.beginPath();
      g.arc(b.x + Math.cos(a) * 11, y + Math.sin(a) * 11, 4, 0, TAU);
      g.fillStyle = i === 0 ? GOLD : CREAM;
      g.fill();
    }
  } else if (state.kind === 'idle') {
    g.beginPath();
    g.arc(b.x, y, 5, 0, TAU);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fill();
  } else {
    const maxW = cr * 2 - 10;
    const size = fit(g, word, maxW, small ? 14 : 13.5, MIN_TYPE, 800);
    g.fillStyle = col;
    if (col === WHITE) {
      g.lineJoin = 'round';
      g.strokeStyle = NAVY_DEEP;
      g.lineWidth = 3;
      g.strokeText(word, b.x, y + (small ? -1 : size * 0.36));
    }
    g.fillText(word, b.x, y + (small ? -1 : size * 0.36));
    if (small) {
      g.font = font(MIN_TYPE, 800);
      if (col === WHITE) g.strokeText(small, b.x, y + 12.5);
      g.fillText(small, b.x, y + 12.5);
    }
  }
  g.restore();
  g.textAlign = 'left';
}

/** The words for a table with no ball on it. The button's own lettering is short; this says what a press does. */
function promptFor(state, finger) {
  const hold = finger ? 'Hold the button' : 'Hold Space';
  const press = finger ? 'Press the button' : 'Press Space';
  if (state.kind === 'launch') return [`${hold}, let go to launch`, CREAM];
  if (state.kind === 'lever') return [`No writ. ${press}: ${fmtInt(SPIN_COST)} marks a pull`, GOLD];
  if (state.kind === 'free') return [`No writ. ${press}: this pull is yours`, GOLD];
  if (state.kind === 'loan') return [`No marks. ${press}: the Mint lends ${fmtInt(LOAN.marks)}`, '#ffc2cf'];
  if (state.kind === 'credit') return ['The hat is coming round. Wait, or press to borrow', '#b9f0e3'];
  if (state.kind === 'busy') return ['The reels turn. By lot, and by law.', CREAM];
  if (state.kind === 'idle') return null;
  throw new Error(`hud: no prompt for launch state '${state.kind}'`);
}

function toastFill(kind) {
  const k = String(kind).toLowerCase();
  if (/loan|debt|bust|drain|garnish/.test(k)) return '#ffc2cf';
  if (/aid|trust|commons/.test(k)) return '#ffd9a8';
  if (/jackpot|payout|marks|score|boon|save|kick/.test(k)) return GOLD;
  return CREAM;
}

const PLATE_KINDS = new Set(['payout', 'jackpot', 'bust']);
const pays = (p) => p.writs > 0 || p.marks > 0 || p.points > 0 || Boolean(p.boon);
function gainsOf(p) {
  const out = [];
  if (p.writs > 0) out.push(`+${p.writs} writ${p.writs === 1 ? '' : 's'}`);
  if (p.marks > 0) out.push(`+${fmtInt(p.marks)} marks`);
  if (p.points > 0) out.push(`+${fmtInt(p.points)} pts`);
  if (p.boon) {
    const look = BOON_LOOK[p.boon];
    if (!look) throw new Error(`hud: unknown boon '${p.boon}'`);
    out.push(look[0].toLowerCase());
  }
  return out;
}

/** What the line paid, on a plate hung under the drums while it pays. Returns whether it was drawn. */
function drawPayPlate(g, reels, cx, y, now) {
  if (reels.phase !== 'paying' || !reels.result) return false;
  const payout = reels.result.payout;
  const win = pays(payout);
  const pop = backOut(clamp(reels.t / 0.18, 0, 1));
  const gains = gainsOf(payout);
  const sub = gains.length ? gains.join('  ·  ').toUpperCase() : 'NOTHING ALLOTTED';
  g.font = font(17, 800);
  const nw = g.measureText(payout.name).width;
  g.font = font(MIN_TYPE, 800);
  const w = clamp(Math.max(nw, g.measureText(sub).width) + 40, 180, 330);
  g.save();
  g.translate(cx, y + 24);
  g.scale(0.6 + 0.4 * pop, 0.6 + 0.4 * pop);
  panel(g, -w / 2, -24, w, 48, { r: 16, fill: win ? CREAM : '#c9cfe6', drop: 4, lw: 3 });
  if (win) {
    // a star on each shoulder of the plate; nothing that reaches up over the drums
    const tw = 1 + 0.12 * Math.sin(now / 140);
    star(g, -w / 2 + 2, -20, 10 * tw, GOLD, 2.2);
    star(g, w / 2 - 2, 20, 8 * tw, GOLD, 2.2);
  }
  g.textAlign = 'center';
  fit(g, payout.name, w - 28, 17, 12, 800);
  g.fillStyle = NAVY;
  g.fillText(payout.name, 0, -3);
  fit(g, sub, w - 24, MIN_TYPE, MIN_TYPE, 800);
  g.fillStyle = win ? CORAL : LILAC;
  g.fillText(ellipsize(g, sub, w - 20), 0, 14);
  g.restore();
  g.textAlign = 'left';
  return true;
}

function drawToasts(g, toasts, cx, y, maxW, hidePlateKinds) {
  const list = (toasts || []).filter((t) => !(hidePlateKinds && PLATE_KINDS.has(t.kind))).slice(-2);
  list.forEach((t, i) => {
    const pop = backOut(clamp(t.t / 0.16, 0, 1));
    const size = fit(g, t.text, maxW - 30, 14, MIN_TYPE, 800);
    const text = ellipsize(g, t.text, maxW - 30);
    const w = g.measureText(text).width + 30;
    g.save();
    g.translate(cx, y + i * 34 + 13);
    g.scale(0.7 + 0.3 * pop, 0.7 + 0.3 * pop);
    panel(g, -w / 2, -13, w, 26, { fill: toastFill(t.kind) });
    g.fillStyle = NAVY;
    g.textAlign = 'center';
    g.fillText(text, 0, size * 0.36);
    g.restore();
  });
  g.textAlign = 'left';
}

/** The objective line: the scene's hint, standing on the picture at the foot of the band. */
function drawHint(g, cx, base, text, maxW) {
  g.textAlign = 'center';
  fit(g, text, maxW, 13.5, 12, 800);
  const lines = g.measureText(text).width <= maxW ? [text] : wrap(g, text, maxW).slice(0, 2);
  lines.forEach((l, i) => inked(g, l, cx, base - (lines.length - 1 - i) * 16, { fill: CREAM, lw: 4, drop: 1.5 }));
  g.textAlign = 'left';
}

// When each bark was first drawn, so a long one can turn its pages. A cache of the clock, not of the game.
const barkSeen = { id: null, since: 0 };

/**
 * A bark: the speaker's name and words in a small bubble with a tick down to their head. Without an anchor
 * for the speaker it lies along the foot of the band where the objective line was. Returns true when it took
 * the objective line's place.
 */
function drawBark(g, content, line, fx, B, foot, now) {
  const who = content.cast[line.who];
  if (!who) throw new Error(`hud: line '${line.id}' is spoken by unknown cast id '${line.who}'`);
  if (barkSeen.id !== line.id || now < barkSeen.since) { barkSeen.id = line.id; barkSeen.since = now; }
  const anchor = fx.anchors && fx.anchors[line.who];
  const radio = line.fx === 'radio';
  const maxW = anchor ? 208 : B.w - 44;
  const perPage = anchor ? 3 : 2;
  g.font = font(12, 700);
  const lines = wrap(g, line.text, maxW);
  const pages = Math.ceil(lines.length / perPage);
  const page = Math.min(pages - 1, Math.floor(((now - barkSeen.since) / 1000 / lineSeconds(line)) * pages));
  const shown = lines.slice(page * perPage, page * perPage + perPage);
  const name = who.name.toUpperCase();
  g.font = font(MIN_TYPE, 800);
  const nameW = g.measureText(name).width;
  g.font = font(12, 700);
  const w = Math.max(nameW + 26, ...shown.map((l) => g.measureText(l).width)) + 22;
  const h = 22 + shown.length * 15;
  let x;
  let y;
  if (anchor) {
    x = clamp(anchor.x - w / 2, B.x + 6, B.x + B.w - w - 6);
    y = Math.max(B.y + 4, anchor.y - 12 - h);
  } else {
    x = B.x + (B.w - w) / 2;
    y = foot - h - 2;
  }
  const fill = radio ? '#dff3ff' : CREAM;
  panel(g, x, y, w, h, { r: 11, fill, drop: 2.5, dash: radio ? [5, 3] : null });
  if (anchor) {
    // the tick
    const tx = clamp(anchor.x, x + 14, x + w - 14);
    g.beginPath();
    g.moveTo(tx - 6, y + h - 1.2);
    g.lineTo(tx + (anchor.x - tx) * 0.5, y + h + 9);
    g.lineTo(tx + 6, y + h - 1.2);
    g.fillStyle = fill;
    g.fill();
    g.strokeStyle = NAVY;
    g.lineWidth = 2.5;
    g.lineJoin = 'round';
    g.stroke();
    g.fillStyle = fill;
    g.fillRect(tx - 5, y + h - 3.2, 10, 2.6);
  }
  // who: a bead in their colour, then the name
  g.beginPath();
  g.arc(x + 14, y + 11.5, 4 + clamp(fx.voiceLevel || 0, 0, 1) * 1.5, 0, TAU);
  g.fillStyle = who.color;
  g.fill();
  g.strokeStyle = NAVY;
  g.lineWidth = 1.6;
  g.stroke();
  g.textAlign = 'left';
  g.font = font(MIN_TYPE, 800);
  g.fillStyle = radio ? '#2d6fb3' : CORAL;
  g.fillText(name, x + 23, y + 15.5);
  g.font = font(12, 700);
  g.fillStyle = NAVY;
  shown.forEach((l, i) => g.fillText(l, x + 11, y + 31 + i * 15));
  if (pages > 1) {
    for (let k = 0; k < pages; k++) {
      g.beginPath();
      g.arc(x + w - 10 - (pages - 1 - k) * 7, y + 10, 2, 0, TAU);
      g.fillStyle = k === page ? NAVY : 'rgba(29,42,92,0.3)';
      g.fill();
    }
  }
  return !anchor;
}

function drawPlay(g, content, game, stage, fx, layout, rects, grow) {
  if (!stage) throw new Error('hud: drawHud needs the stage (core/stage.js stageState) while the game is in play');
  if (!game.econ) throw new Error('hud: game.econ is missing');
  const now = fx.timeMs;
  const safe = safeOf(fx);
  const B = rects.band;
  const S = rects.strip;
  const scene = currentScene(content, game);
  // as the band grows to take the screen, the HUD goes: the head rows up, the foot down, the table's things out
  const out = grow === null ? 0 : clamp(grow * 3, 0, 1);
  if (out >= 1) return;
  const top = Math.max(B.y + 8, safe.top + 4);

  // ── on the table ──
  g.save();
  g.globalAlpha = 1 - out;
  const T = rects.table;
  const cx = T.x + T.w / 2;
  const state = launchState(content, game);
  const plateUp = drawPayPlate(g, game.reels, cx, rects.reels.y + rects.reels.h + 8, now);
  const field = rects.flippers.y - (rects.reels.y + rects.reels.h);
  drawToasts(g, game.toasts, cx, rects.reels.y + rects.reels.h + field * 0.56, Math.min(330, T.w - 40), plateUp);
  const prompt = promptFor(state, Boolean(fx.touch));
  if (prompt) {
    const size = fit(g, prompt[0], T.w - 64, 13, MIN_TYPE, 800);
    const w = g.measureText(prompt[0]).width + 28;
    const py = rects.flippers.y - 44;
    g.globalAlpha = (1 - out) * (0.82 + 0.18 * Math.sin(now / 260));
    panel(g, cx - w / 2, py, w, 28, { fill: NAVY, ink: NAVY_DEEP });
    g.fillStyle = prompt[1];
    g.textAlign = 'center';
    g.fillText(prompt[0], cx, py + 14 + size * 0.36);
    g.textAlign = 'left';
    g.globalAlpha = 1 - out;
  }
  drawLaunch(g, rects.launch, state, now);
  g.restore();

  // ── the foot of the band ──
  g.save();
  // the foot rides the band's lower edge down as the band grows
  g.translate(0, fx.band ? Math.max(0, fx.band.y + fx.band.h - (B.y + B.h)) : 0);
  g.globalAlpha = 1 - out;
  const footBase = S.y - 9;
  let barked = false;
  if (fx.speaking) barked = drawBark(g, content, fx.speaking, fx, B, S.y - 4, now);
  if (!barked && scene) drawHint(g, B.x + B.w / 2, footBase, scene.hint, B.w - 28);
  drawStrip(g, S, game, stage, now, rects.mute);
  drawMute(g, rects.mute, Boolean(fx.muted));
  g.restore();

  // ── the head of the band ──
  g.save();
  g.translate(0, -out * (HUD_BAND_HEAD + top + 30));
  g.globalAlpha = 1 - out;
  const sw = drawScore(g, B.x + 10, top, game.econ.score);
  const opp = drawOpposition(g, B.x + B.w - 10, top, stage, now, B.w - sw - 34);
  drawBoons(g, B.x + B.w - 10, opp.bottom + 5, boonsOf(game, stage));
  // a short band (or a deep notch) has no room for both the scene's name and a combo: the combo wins
  const comboOn = Boolean(stage.combo && stage.combo.count > 0);
  const comboY = Math.min(top + 88, S.y - 42);
  drawCombo(g, B.x + 12, comboY, stage.combo, now, B.w * 0.56);
  if (scene && !(comboOn && comboY < top + 80)) {
    const col = THREADS[scene.thread];
    if (!col) throw new Error(`hud: scene '${scene.id}' has unknown thread '${scene.thread}'`);
    // the scene's name in its thread's colour and, after it, what the stage has just come to (stage.beat.name)
    const title = scene.title.toUpperCase();
    const room = opp.left - 10 - (B.x + 12);
    g.textAlign = 'left';
    fit(g, title, room, 12, MIN_TYPE, 800);
    const shownTitle = ellipsize(g, title, room);
    inked(g, shownTitle, B.x + 12, top + 46, { fill: col, lw: 3.5, drop: 1.5 });
    const tw = g.measureText(shownTitle).width;
    const beat = stage.beat && typeof stage.beat.name === 'string' ? stage.beat.name : '';
    if (beat && !comboOn) {
      g.font = font(12, 700);
      inked(g, ellipsize(g, beat, B.w - 24), B.x + 12, top + 63, { fill: CREAM, lw: 3.5, drop: 1.5 });
    } else if (beat && room - tw > 70) {
      g.font = font(MIN_TYPE, 700);
      inked(g, ellipsize(g, beat, room - tw - 8), B.x + 12 + tw + 8, top + 46, { fill: CREAM, lw: 3.5, drop: 1.5 });
    }
  }
  g.restore();
}

// ───────────────────────── the subtitle box ─────────────────────────

function drawSkip(g, r, touch) {
  panel(g, r.x, r.y, r.w, r.h, { r: r.h / 2, fill: 'rgba(255,247,226,0.94)' });
  g.font = font(13, 800);
  g.fillStyle = NAVY;
  g.textAlign = 'center';
  const label = touch ? 'SKIP' : 'SKIP  S';
  const tw = g.measureText(label).width;
  g.fillText(label, r.x + r.w / 2 - 9, r.y + r.h / 2 + 4.6);
  // two arrowheads
  g.fillStyle = CORAL;
  const ax = r.x + r.w / 2 - 9 + tw / 2 + 6;
  const ay = r.y + r.h / 2;
  for (let i = 0; i < 2; i++) {
    g.beginPath();
    g.moveTo(ax + i * 8, ay - 5.5);
    g.lineTo(ax + i * 8 + 7, ay);
    g.lineTo(ax + i * 8, ay + 5.5);
    g.closePath();
    g.fill();
  }
  g.textAlign = 'left';
}

/**
 * The line being spoken, in a box at the bottom: nameplate in the speaker's colour, their role the first time
 * they speak in this cinematic, the words, a tick to say there is more. A call over the Line is a cold box with
 * a dashed rim and a wave on the plate; the narrator's is a ledger page, ruled, in italics.
 */
function drawSubtitle(g, content, cine, fx, box, alpha) {
  const line = cine.lines[cine.index];
  if (!line) return;
  const who = content.cast[line.who];
  if (!who) throw new Error(`hud: line '${line.id}' is spoken by unknown cast id '${line.who}'`);
  const now = fx.timeMs;
  const radio = line.fx === 'radio';
  const narrator = line.who === 'narrator';
  const level = clamp(fx.voiceLevel || 0, 0, 1);
  let first = true;
  for (let i = 0; i < cine.index; i++) if (cine.lines[i].who === line.who) { first = false; break; }

  g.save();
  g.globalAlpha = alpha;
  g.translate(0, (1 - alpha) * 26);
  const { x, y, w, h } = box;
  const fill = radio ? '#e4f4ff' : narrator ? '#fbeecb' : CREAM;
  const ink = radio ? '#1c3f7a' : NAVY;
  panel(g, x, y, w, h, { r: 18, fill, ink, drop: 5, lw: 3, dash: radio ? [9, 5] : null });

  // the words
  const padX = 17;
  const lh = 23;
  const top = y + 43;
  const perPage = Math.max(1, Math.floor((h - 36) / lh));
  g.font = font(16.5, 600, narrator);
  const lines = wrap(g, line.text, w - padX * 2 - (narrator ? 16 : 0));
  const pages = Math.ceil(lines.length / perPage);
  const page = Math.min(pages - 1, Math.floor((Math.max(0, cine.lineT) / lineSeconds(line)) * pages));
  const shown = lines.slice(page * perPage, page * perPage + perPage);
  const y0 = top + Math.max(0, (perPage - shown.length) * lh * 0.28);
  if (narrator) {
    // the ledger's rules, one under each line, and its margin
    g.save();
    rr(g, x + 2, y + 2, w - 4, h - 4, 16);
    g.clip();
    g.fillStyle = 'rgba(29,42,92,0.12)';
    for (let ry = y0 + 6.5; ry < y + h - 6; ry += lh) g.fillRect(x + 12, ry, w - 24, 1.5);
    g.fillStyle = 'rgba(242,85,58,0.35)';
    g.fillRect(x + w - 30, y, 1.5, h);
    g.restore();
  }
  g.fillStyle = radio ? '#17305e' : NAVY;
  g.textAlign = 'left';
  shown.forEach((l, i) => g.fillText(l, x + padX, y0 + i * lh));

  // the nameplate
  g.font = font(14.5, 800);
  const name = who.name;
  const nw = g.measureText(name).width;
  const waveW = radio ? 26 : 0;
  const pw = nw + 28 + waveW;
  const px = x + 14;
  const py = y - 17;
  const plate = radio ? '#2d6fb3' : who.color;
  panel(g, px, py, pw, 32, { r: 13, fill: plate, ink, drop: 3, lw: 3 });
  // white on a dark plate, ink on a light one: most of the cast's colours are light
  g.fillStyle = luminance(plate) > 0.55 ? NAVY : WHITE;
  g.fillText(name, px + 14 + waveW, py + 21.5);
  if (radio) {
    // a wave that moves with the voice
    g.beginPath();
    for (let i = 0; i <= 16; i++) {
      const u = i / 16;
      const a = (3 + level * 6) * Math.sin(u * Math.PI) * Math.sin(u * 15 + now / 70);
      if (i === 0) g.moveTo(px + 11 + u * 22, py + 16 + a);
      else g.lineTo(px + 11 + u * 22, py + 16 + a);
    }
    g.strokeStyle = WHITE;
    g.lineWidth = 2;
    g.stroke();
  }
  // the role: who this is, the first time they speak; over the Line, that it is over the Line
  const role = radio ? 'Over the Line' : first && !narrator ? who.role : '';
  if (role) {
    g.textAlign = 'right';
    const maxW = w - pw - 40;
    if (maxW > 60) {
      fit(g, role.toUpperCase(), maxW, MIN_TYPE, MIN_TYPE, 800);
      g.fillStyle = radio ? '#2d6fb3' : LILAC;
      g.fillText(ellipsize(g, role.toUpperCase(), maxW), x + w - 16, y + 19);
    }
    g.textAlign = 'left';
  }
  // more to come: pages as beads, then the tick
  if (pages > 1) {
    for (let k = 0; k < pages; k++) {
      g.beginPath();
      g.arc(x + w - 38 - (pages - 1 - k) * 9, y + h - 13, 2.6, 0, TAU);
      g.fillStyle = k === page ? ink : 'rgba(29,42,92,0.25)';
      g.fill();
    }
  }
  const bob = Math.floor(now / 380) % 2 ? 2 : 0;
  g.beginPath();
  g.moveTo(x + w - 26, y + h - 18 + bob);
  g.lineTo(x + w - 14, y + h - 18 + bob);
  g.lineTo(x + w - 20, y + h - 10 + bob);
  g.closePath();
  g.fillStyle = CORAL;
  g.fill();
  g.restore();
}

/** Over the head of whoever is speaking: a small bubble with three beads that jump with the voice. */
function drawSpeaking(g, x, y, fx) {
  const now = fx.timeMs;
  const level = clamp(fx.voiceLevel || 0, 0, 1);
  const cy = y - 22 - (Math.floor(now / 380) % 2 ? 2 : 0);
  panel(g, x - 19, cy - 10, 38, 20, { r: 10, drop: 2.5 });
  g.beginPath();
  g.moveTo(x - 5, cy + 9);
  g.lineTo(x, cy + 16);
  g.lineTo(x + 5, cy + 9);
  g.fillStyle = CREAM;
  g.fill();
  g.strokeStyle = NAVY;
  g.lineWidth = 2.5;
  g.lineJoin = 'round';
  g.stroke();
  g.fillStyle = CREAM;
  g.fillRect(x - 4, cy + 6.5, 8, 3);
  for (let i = 0; i < 3; i++) {
    const up = Math.max(0, Math.sin(now / 110 - i * 1.1)) * (1.5 + level * 4);
    g.beginPath();
    g.arc(x - 9 + i * 9, cy - up + 1.5, 2.6, 0, TAU);
    g.fillStyle = i === 1 ? CORAL : NAVY;
    g.fill();
  }
}

function drawCine(g, content, game, fx, layout, rects, grow) {
  const cine = game.cine;
  if (!cine || !Array.isArray(cine.lines)) throw new Error(`hud: game.mode is 'cine' but game.cine is ${JSON.stringify(cine)}`);
  const alpha = grow === null ? 1 : clamp((grow - 0.55) / 0.35, 0, 1);
  if (alpha <= 0) return;
  drawSubtitle(g, content, cine, fx, rects.sub, alpha);
  g.save();
  g.globalAlpha = alpha;
  const line = cine.lines[cine.index];
  const at = line && fx.anchors && fx.anchors[line.who];
  if (at && line.fx !== 'radio') drawSpeaking(g, at.x, at.y, fx);
  drawSkip(g, rects.skip, Boolean(fx.touch));
  drawMute(g, rects.cineMute, Boolean(fx.muted));
  g.restore();
}

// ───────────────────────── title, card, ends, rotate ─────────────────────────

/** A wash that lets lettering stand on any picture: hard bands, not a gradient. */
function bandsWash(g, x, y, w, h, color, steps, from, to) {
  g.fillStyle = color;
  for (let i = 0; i < steps; i++) {
    g.globalAlpha = from + ((to - from) * i) / Math.max(1, steps - 1);
    g.fillRect(x, y + (h * i) / steps, w, h / steps + 0.5);
  }
  g.globalAlpha = 1;
}

/** Big lettering: a hard drop, a heavy ink line, a flat fill and one lighter stripe across the top of the letters. */
function logoLine(g, text, cx, y, size, fill, hi, maxW) {
  const s = fit(g, text, maxW, size, 20, 800);
  g.textAlign = 'center';
  g.lineJoin = 'round';
  g.miterLimit = 2;
  g.strokeStyle = NAVY;
  g.fillStyle = NAVY;
  g.lineWidth = s * 0.26;
  g.strokeText(text, cx, y + s * 0.12);
  g.strokeText(text, cx, y);
  g.fillStyle = fill;
  g.fillText(text, cx, y);
  // the stripe: the top third of the letters, a step lighter
  g.save();
  g.beginPath();
  g.rect(cx - maxW / 2 - 20, y - s, maxW + 40, s * 0.52);
  g.clip();
  g.fillStyle = hi;
  g.fillText(text, cx, y);
  g.restore();
  g.textAlign = 'left';
  return s;
}

function bigButton(g, r, label, sub, fill, col, now, pulse) {
  const k = pulse ? 1 + 0.02 * Math.sin(now / 240) : 1;
  g.save();
  g.translate(r.x + r.w / 2, r.y + r.h / 2);
  g.scale(k, k);
  panel(g, -r.w / 2, -r.h / 2, r.w, r.h, { r: r.h / 2, fill, drop: 6, lw: 3.5 });
  // one hard highlight along the top
  rr(g, -r.w / 2 + 12, -r.h / 2 + 6, r.w - 24, 5, 3);
  g.fillStyle = 'rgba(255,255,255,0.4)';
  g.fill();
  g.textAlign = 'center';
  if (sub) {
    g.font = font(17, 800);
    g.fillStyle = col;
    g.fillText(label, 0, -2);
    fit(g, sub, r.w - 36, 12, MIN_TYPE, 700);
    g.fillStyle = col;
    g.globalAlpha = 0.75;
    g.fillText(ellipsize(g, sub, r.w - 32), 0, 15);
    g.globalAlpha = 1;
  } else {
    g.font = font(22, 800);
    if (col === WHITE) {
      g.lineJoin = 'round';
      g.strokeStyle = NAVY;
      g.lineWidth = 4;
      g.strokeText(label, 0, 8);
    }
    g.fillStyle = col;
    g.fillText(label, 0, 8);
  }
  g.restore();
  g.textAlign = 'left';
}

/** While the sets build (fx.loading 0..1): a bar on a navy pill where the tap prompt will be. Returns whether it drew. */
function drawLoading(g, fx, cx, y) {
  const v = fx.loading;
  if (!(v >= 0) || v >= 1) return false;
  const w = 250;
  panel(g, cx - w / 2, y, w, 30, { fill: NAVY, ink: NAVY_DEEP });
  g.font = font(MIN_TYPE, 800);
  g.fillStyle = CREAM;
  g.textAlign = 'left';
  g.fillText('SETTING THE STAGE', cx - w / 2 + 14, y + 19);
  const bx = cx - w / 2 + 14 + g.measureText('SETTING THE STAGE').width + 8;
  const bw = cx + w / 2 - 14 - bx;
  rr(g, bx, y + 11, bw, 8, 4);
  g.fillStyle = NAVY_DEEP;
  g.fill();
  rr(g, bx, y + 11, Math.max(8, bw * v), 8, 4);
  g.fillStyle = GOLD;
  g.fill();
  return true;
}

/** What a tap does next, on a navy pill whose lettering blinks between cream and gold. */
function chip(g, text, cx, y, now) {
  g.font = font(13, 800);
  const w = g.measureText(text).width + 32;
  panel(g, cx - w / 2, y, w, 30, { fill: NAVY, ink: NAVY_DEEP });
  g.fillStyle = Math.floor(now / 520) % 2 ? GOLD : CREAM;
  g.textAlign = 'center';
  g.fillText(text, cx, y + 19.5);
  g.textAlign = 'left';
}

/** The title: the name of the game, and Begin (and Continue when fx.hasSave). The picture behind it is the caller's. */
export function drawTitle(g, content, game, fx, layout) {
  checkArgs(fx, layout);
  const rects = hudRects(layout, fx);
  const now = fx.timeMs;
  const { W, H } = layout;
  const safe = safeOf(fx);
  const cx = W / 2;
  g.save();
  // a lift of light behind the name, and a foot of navy under the menu
  bandsWash(g, 0, H * 0.6, W, H * 0.4, NAVY_DEEP, 4, 0.1, 0.42);
  const ty = Math.max(H * 0.2, safe.top + 110);
  g.save();
  g.translate(cx, ty + 40);
  g.rotate(now / 9000);
  for (let i = 0; i < 12; i++) {
    g.rotate(TAU / 12);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(-34, -310);
    g.lineTo(34, -310);
    g.closePath();
    g.fillStyle = 'rgba(255,247,226,0.16)';
    g.fill();
  }
  g.restore();

  g.save();
  g.translate(cx, ty);
  g.rotate(-0.045);
  // the over-line on a ribbon
  const over = 'A VOICED STORY, PLAYED ON A PINBALL TABLE';
  g.font = font(MIN_TYPE, 800);
  const ow = Math.min(W - 40, g.measureText(over).width + 30);
  panel(g, -ow / 2, -78, ow, 24, { fill: CORAL, r: 8 });
  g.fillStyle = WHITE;
  g.textAlign = 'center';
  fit(g, over, ow - 16, MIN_TYPE, MIN_TYPE, 800);
  g.fillText(over, 0, -62);
  logoLine(g, 'THE LONG', 0, 0, 62, CREAM, WHITE, W - 150);
  logoLine(g, 'SETTLEMENT', 0, 66, 62, GOLD, '#ffe68a', W - 52);
  g.restore();
  // three stars
  for (const [dx, dy, r] of [[-150, -38, 9], [158, -10, 11], [128, 96, 7]]) {
    const tw = 1 + 0.15 * Math.sin(now / 300 + dx);
    star(g, cx + dx, ty + dy, r * tw, WHITE, 2.2);
  }
  const tag = 'Every note reads: payable in calm.';
  g.font = font(15, 700, true);
  g.textAlign = 'center';
  inked(g, tag, cx, ty + 122, { fill: CREAM, lw: 4, drop: 2 });

  const begin = rects.menuBegin;
  const save = fx.hasSave || null;
  bigButton(g, begin, save ? 'NEW GAME' : 'BEGIN', '', CORAL, WHITE, now, true);
  if (save) {
    const ch = content.chapters[save.chapter];
    const sc = ch && ch.scenes[save.scene];
    if (!ch || !sc) throw new Error(`hud: fx.hasSave names chapter ${save.chapter} scene ${save.scene}, which the content does not have`);
    bigButton(g, rects.menuContinue, 'CONTINUE', `Chapter ${ROMAN[ch.number] || ch.number}: ${sc.title}`, CREAM, NAVY, now, false);
  }
  drawLoading(g, fx, cx, begin.y - 46);
  g.font = font(12, 700);
  g.textAlign = 'center';
  const foot = fx.touch ? 'Sound on. Hold the phone upright.' : 'Sound on.  Enter begins.  M mutes.';
  inked(g, foot, cx, H - Math.max(28, safe.bottom + 14), { fill: CREAM, lw: 3.5, drop: 1.5 });
  g.textAlign = 'left';
  const m = rects.cineMute;
  drawMute(g, D(W - 30, Math.max(30, safe.top + 24), m.r), Boolean(fx.muted));
  g.restore();
}

/** The chapter card: number, title, subtitle, the table's name. It lands in steps over game.modeT. */
export function drawCard(g, content, game, fx, layout) {
  checkArgs(fx, layout);
  const now = fx.timeMs;
  const { W, H } = layout;
  const safe = safeOf(fx);
  const cx = W / 2;
  const chapter = content.chapters[game.chapter];
  if (!chapter) throw new Error(`hud: no chapter at index ${game.chapter}`);
  const table = content.tables[chapter.tableId];
  if (!table) throw new Error(`hud: chapter ${chapter.id} names table '${chapter.tableId}', which the content does not have`);
  const t = game.modeT;
  const cy = Math.round(H * 0.44);
  g.save();
  // a slanted band across the picture
  const open = backOut(clamp(t / 0.3, 0, 1));
  const bh = 250 * open;
  g.save();
  g.translate(cx, cy);
  g.rotate(-0.07);
  g.fillStyle = NAVY;
  g.fillRect(-W, -bh / 2 - 7, W * 2, bh + 14);
  g.fillStyle = GOLD;
  g.fillRect(-W, -bh / 2 - 7, W * 2, 4);
  g.fillRect(-W, bh / 2 + 3, W * 2, 4);
  g.fillStyle = CREAM;
  g.fillRect(-W, -bh / 2, W * 2, bh);
  // bunting dots along both edges
  if (open > 0.9) {
    for (let i = -8; i <= 8; i++) {
      g.beginPath();
      g.arc(i * 30 + ((now / 60) % 30), -bh / 2 + 10, 3, 0, TAU);
      g.arc(i * 30 - ((now / 60) % 30), bh / 2 - 10, 3, 0, TAU);
      g.fillStyle = i % 2 ? CORAL : TEAL;
      g.fill();
    }
  }
  g.textAlign = 'center';
  if (t >= 0.3) {
    const pop = backOut(clamp((t - 0.3) / 0.2, 0, 1));
    g.save();
    g.translate(0, -78);
    g.scale(pop, pop);
    const label = `CHAPTER ${ROMAN[chapter.number] || chapter.number}`;
    g.font = font(15, 800);
    const lw = g.measureText(label).width + 34;
    panel(g, -lw / 2, -16, lw, 32, { fill: CORAL, r: 16, drop: 4, lw: 3 });
    g.fillStyle = WHITE;
    g.textAlign = 'center';
    g.fillText(label, 0, 5.5);
    g.restore();
  }
  if (t >= 0.5) {
    const pop = backOut(clamp((t - 0.5) / 0.22, 0, 1));
    g.save();
    g.translate(0, -8);
    g.scale(0.7 + 0.3 * pop, 0.7 + 0.3 * pop);
    const title = chapter.title.toUpperCase();
    g.font = font(44, 800);
    const one = g.measureText(title).width <= W - 56;
    const parts = one ? [title] : (() => { const ws = title.split(' '); const m = Math.ceil(ws.length / 2); return [ws.slice(0, m).join(' '), ws.slice(m).join(' ')]; })();
    const size = Math.min(...parts.map((p) => fit(g, p, W - 56, one ? 44 : 36, 22, 800)));
    parts.forEach((p, i) => {
      g.font = font(size, 800);
      g.lineJoin = 'round';
      g.fillStyle = CORAL;
      g.fillText(p, 0, (i - (parts.length - 1) / 2) * size * 1.02 + 3 + size * 0.2);
      g.fillStyle = NAVY;
      g.fillText(p, 0, (i - (parts.length - 1) / 2) * size * 1.02 + size * 0.2);
    });
    g.restore();
  }
  if (t >= 0.95) {
    g.font = font(15, 600, true);
    const lines = wrap(g, chapter.subtitle, W - 70).slice(0, 3);
    g.fillStyle = NAVY;
    g.globalAlpha = clamp((t - 0.95) / 0.2, 0, 1);
    lines.forEach((l, i) => g.fillText(l, 0, 52 + i * 20));
    g.font = font(MIN_TYPE, 800);
    g.fillStyle = LILAC;
    g.fillText(`THE ${String(table.name).toUpperCase()} TABLE`, 0, 52 + lines.length * 20 + 8);
    g.globalAlpha = 1;
  }
  g.restore();
  if (t > 1.5) {
    const y = H - Math.max(88, safe.bottom + 62);
    if (!drawLoading(g, fx, cx, y)) chip(g, fx.touch ? 'TAP TO GO ON' : 'ENTER TO GO ON', cx, y, now);
  }
  g.textAlign = 'left';
  g.restore();
}

/** A seesaw: what was given on the left, what was borrowed on the right. The heavier end is down. No numbers. */
function drawSeesaw(g, cx, cy, econ) {
  const { trust, loans } = ledger(econ);
  const tilt = clamp((loans - trust) / 300, -1, 1) * 0.2; // > 0: the loans' end is down
  // the stand
  g.beginPath();
  g.moveTo(cx - 13, cy + 22);
  g.lineTo(cx, cy);
  g.lineTo(cx + 13, cy + 22);
  g.closePath();
  g.fillStyle = NAVY;
  g.fill();
  g.save();
  g.translate(cx, cy);
  g.rotate(tilt);
  rr(g, -74, -4, 148, 8, 4);
  g.fillStyle = NAVY;
  g.fill();
  // given: a heart. borrowed: a coin
  heartPath(g, -62, -18, 11);
  g.fillStyle = ROSE;
  g.fill();
  g.strokeStyle = NAVY;
  g.lineWidth = 2.4;
  g.stroke();
  coinIcon(g, 62, -17, 11);
  g.restore();
  g.font = font(MIN_TYPE, 800);
  g.fillStyle = LILAC;
  g.textAlign = 'left';
  g.fillText('GIVEN', cx - 86, cy + 38);
  g.textAlign = 'right';
  g.fillText('BORROWED', cx + 86, cy + 38);
  g.textAlign = 'left';
}

/**
 * The end. The ending the ledger was read as (story.endingOf): its title, its closing words on a page, the
 * account under them, and the seesaw. 'commons' is warm and 'mint' is cold. With no endings in the content the
 * page says the ledger rests.
 */
export function drawEnd(g, content, game, fx, layout) {
  checkArgs(fx, layout);
  const now = fx.timeMs;
  const { W, H } = layout;
  const safe = safeOf(fx);
  const cx = W / 2;
  const e = game.econ;
  const end = endingOf(content, game);
  const told = end.title !== null;
  const cold = end.leaning === 'mint';
  const accent = cold ? SKY : CORAL;
  const hi = cold ? '#bfe0ff' : GOLD;
  g.save();
  bandsWash(g, 0, 0, W, H, cold ? '#16224f' : NAVY_DEEP, 1, 0.42, 0.42);
  const top = Math.max(74, safe.top + 48);
  g.textAlign = 'center';
  g.font = font(12, 800);
  const over = 'THE LONG SETTLEMENT';
  const ow = g.measureText(over).width + 28;
  panel(g, cx - ow / 2, top - 17, ow, 24, { fill: accent, r: 12 });
  g.fillStyle = WHITE;
  g.fillText(over, cx, top - 0.5);
  const head = (told ? end.title : 'Here the ledger rests').toUpperCase();
  const pop = backOut(clamp((game.modeT || 0) / 0.35, 0, 1));
  g.save();
  g.translate(cx, top + 62);
  g.rotate(-0.035);
  g.scale(0.8 + 0.2 * pop, 0.8 + 0.2 * pop);
  logoLine(g, head, 0, 0, 50, hi, WHITE, W - 56);
  g.restore();

  // the page
  const pw = W - 44;
  const px = cx - pw / 2;
  const inset = 18;
  const lh = 21;
  g.font = font(15, 600, true);
  const words = wrap(g, told ? end.text : `End of the chapters written so far: ${content.chapters.length}. The Circuit goes on.`, pw - inset * 2);
  const rows = [
    ['Score', fmtInt(e.score), NAVY],
    ['Marks in hand', fmtInt(e.marks), '#b8690e'],
    ['Owed to the Mint', e.debt > 0 ? fmtInt(Math.ceil(e.debt)) : 'nothing', e.debt > 0 ? CORAL : LILAC],
    ['Trust of the Commons', `${Math.round(e.trust)} / 100`, '#d8641c'],
    ['Pulls of the lever', fmtInt(e.spins), NAVY],
  ];
  const rowH = 31;
  const wordsH = words.length * lh + 26;
  const ph = wordsH + rows.length * rowH + 100;
  const py = top + 96;
  panel(g, px, py, pw, ph, { r: 20, drop: 6, lw: 3 });
  g.fillStyle = NAVY;
  g.textAlign = 'center';
  g.font = font(15, 600, true);
  words.forEach((l, i) => g.fillText(l, cx, py + 30 + i * lh));
  g.fillStyle = accent;
  g.fillRect(px + inset, py + wordsH, pw - inset * 2, 3);
  rows.forEach(([k, val, col], i) => {
    const y = py + wordsH + 26 + i * rowH;
    g.textAlign = 'left';
    g.font = font(14.5, 700);
    g.fillStyle = NAVY;
    g.fillText(k, px + inset, y);
    g.textAlign = 'right';
    g.font = font(16, 800);
    g.fillStyle = col;
    g.fillText(val, px + pw - inset, y);
    g.fillStyle = 'rgba(29,42,92,0.14)';
    g.fillRect(px + inset, y + 9, pw - inset * 2, 1.5);
  });
  drawSeesaw(g, cx, py + wordsH + rows.length * rowH + 46, e);

  chip(g, fx.touch ? 'TAP TO RETURN TO THE TITLE' : 'ENTER RETURNS TO THE TITLE', cx, H - Math.max(62, safe.bottom + 44), now);
  drawMute(g, D(W - 30, Math.max(30, safe.top + 24), 15), Boolean(fx.muted));
  g.restore();
}

/** A phone on its side: the whole canvas asks to be turned upright. Works at any layout size. */
export function drawRotate(g, fx, layout) {
  checkArgs(fx, layout);
  const { W, H } = layout;
  const now = fx.timeMs;
  g.save();
  g.fillStyle = NAVY;
  g.fillRect(0, 0, W, H);
  const k = Math.min(W / 430, H / 300);
  const cx = W / 2;
  const cy = H / 2 - 20 * k;
  // the phone: it lies on its side, stands up, waits, and lies down again
  const u = (now / 2600) % 1;
  const turn = u < 0.35 ? backOut(u / 0.35) : u < 0.8 ? 1 : 1 - (u - 0.8) / 0.2;
  g.save();
  g.translate(cx, cy);
  g.rotate((-Math.PI / 2) * (1 - turn));
  const pw = 54 * k;
  const ph = 96 * k;
  panel(g, -pw / 2, -ph / 2, pw, ph, { r: 11 * k, fill: CREAM, drop: 0, lw: 3.5 * k, ink: NAVY_DEEP });
  rr(g, -pw / 2 + 6 * k, -ph / 2 + 9 * k, pw - 12 * k, ph - 22 * k, 5 * k);
  g.fillStyle = turn > 0.9 ? TEAL : CORAL;
  g.fill();
  g.beginPath();
  g.arc(0, ph / 2 - 7 * k, 2.6 * k, 0, TAU);
  g.fillStyle = NAVY;
  g.fill();
  g.restore();
  g.textAlign = 'center';
  g.font = font(Math.max(15, 20 * k), 800);
  g.fillStyle = CREAM;
  g.fillText('Turn me upright', cx, cy + 84 * k);
  g.font = font(Math.max(MIN_TYPE, 13 * k), 700, true);
  g.fillStyle = '#b9c6f2';
  g.fillText('The table is built for a phone held tall.', cx, cy + 84 * k + Math.max(20, 24 * k));
  g.textAlign = 'left';
  g.restore();
}

// ───────────────────────── entry point ─────────────────────────

/**
 * Draw everything 2D for this frame. `stage` is core/stage.js stageState(content, game): required in play,
 * unused elsewhere.
 */
export function drawHud(g, content, game, stage, fx, layout) {
  checkArgs(fx, layout);
  g.save();
  g.globalAlpha = 1;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.setLineDash([]);
  if (fx.sideways === true) {
    drawRotate(g, fx, layout);
    g.restore();
    return;
  }
  const rects = hudRects(layout, fx);
  const grow = growOf(rects, fx, layout);
  if (game.mode === 'title') drawTitle(g, content, game, fx, layout);
  else if (game.mode === 'card') drawCard(g, content, game, fx, layout);
  else if (game.mode === 'end') drawEnd(g, content, game, fx, layout);
  else if (game.mode === 'cine') drawCine(g, content, game, fx, layout, rects, grow);
  else if (game.mode === 'play') drawPlay(g, content, game, stage, fx, layout, rects, grow);
  else throw new Error(`hud: unknown game mode '${game.mode}'`);
  // A flash is two hard steps, not a fade.
  if (fx.flash && fx.flash.a > 0.12) {
    g.globalAlpha = fx.flash.a > 0.3 ? 0.3 : 0.12;
    g.fillStyle = fx.flash.color;
    g.fillRect(0, 0, layout.W, layout.H);
  }
  g.restore();
}
