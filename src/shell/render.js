// The cabinet renderer. Canvas 2D, drawn to a Layout (src/shell/layout.js).
//
//   createRenderer(canvas) -> { draw(content, game, fx, layout) }
//
// Portrait (430 x 932, a phone held upright) is the cabinet; 'wide' (1280 x 800) is the
// same table with the story panel on its left and the ledger on its right.
//
//   portrait   hud     score line, then the Reels of Assay as three inked tiles with marks
//                      to their left and writs, trust and the leaning scale to their right
//              story   scene title, objective pips, the line being spoken
//              table   the playfield. Fill lanes show the reel they feed and carry a tag
//                      that says so; spin elements carry a curl that fills as the reels
//                      charge and burn with rays once the reels are armed.
//              launch  one round cap: plunger while a ball waits, lever when none can
//
// The look is cel: flat colour, one hard shadow tone and one hard highlight per form, an
// indigo ink line, and one key light per table (LOOKS below) that every form obeys. The
// helpers are src/shell/style.js. Nothing here makes a gradient, sets shadowBlur or
// ctx.filter, or reads pixels: light is flat discs and wedges, shadows are flat shapes.
//
// Imperative shell: this file reads game state and paints. It never writes to `game`.
// The only state it keeps is view state in the createRenderer closure (ball trails, hit
// flashes, sparks, eased numbers, cached layers).
//
// Frame cost. The playfield with its scene, cast shadows and every unlit element is one
// layer painted once per size; so are the head plate, the frame, the reel housing, the
// reel symbols, the button caps, the ball and the posters behind the title, the chapter
// card and the end. A frame is those drawImage calls, the lit overlays, the flippers and
// the text.

import { REEL_STRIPS } from '../core/slot.js';
import { currentScene, objectiveProgress, litIds, lineSeconds } from '../core/story.js';
import { SPIN_COST, LOAN, TRUST_PER_LOAN, leaning } from '../core/economy.js';
import { leverStatus, AID_WAIT } from '../core/game.js';
import { drawCinema, drawPortrait } from './cinema.js';
import {
  INK, PALETTE, light, shadowOf, alpha as A, blend, shade, tint, ink as inkLine, cel, bloom, shaft, glint, curl, bands, rings, waves,
} from './style.js';

const TW = 400; // table space
const TH = 800;
const TAU = Math.PI * 2;
const MIN_TYPE = 11; // logical px; nothing is lettered smaller than this

const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
const MONO = '"SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';

const WHITE = PALETTE.white;
const NIGHT = PALETTE.night;
const PLATE = '#17123f'; // the head and the panels: ink indigo, a step above night
const BRASS = PALETTE.brass;
const BRASS_HI = '#ffd873';
const BRASS_LO = '#8a5a1c';
const PAPER = PALETTE.cream;
const LANTERN = PALETTE.lantern;
const CRIMSON = PALETTE.crimson;
const RED = '#ff5466'; // crimson as lettering on a dark ground
const STEEL = '#bcd0ff';
const PEARL = '#ece6f7';
const PEARL_LO = '#8c8cc6';

const THREADS = {
  duty: { color: '#ffd24a', label: 'DUTY', gloss: 'the Circuit and the contract' },
  covert: { color: '#6fb6ff', label: 'COVERT', gloss: 'what the Line asks of you' },
  commons: { color: '#ff8a3c', label: 'COMMONS', gloss: 'what the town will remember' },
};

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

// The lamp over the head of the cabinet: the reels, the button and the ledger are lit by it.
const HUD_L = light(LANTERN, -Math.PI * 0.68, { depth: 0.8 });

// One key light per table. `lamp` is where it stands on the playfield (table space); the
// light's angle points from the middle of the field toward it, and every wall, post, bumper
// and target throws a hard shadow the other way. `pool` is the lit ground, stepped outward
// from the lamp; `night` is what the light does not reach.
function look(o) {
  const ang = Math.atan2(o.lamp[1] - 400, o.lamp[0] - 200);
  return Object.freeze({ ...o, L: light(o.light, ang, { depth: 0.85 }) });
}
const LOOKS = [
  // Vessery: a festival lantern over the breakwater, teal water going to night
  [/lantern|harbo|festival|lot/, look({ key: 'harbour', lamp: [62, 66], light: '#ffb054', night: '#090d30', pool: ['#0b2350', '#0d4470', '#127a86'], poolR: [760, 500, 250],
    rail: '#e0a83a', bump: '#d6263f', cap: '#ff9326', dim: '#152058', word: '#1a5f8a', flip: '#fff6e0', stripe: '#ff9326' })],
  // Saltmere: the headframe's cold lamp, slate strata
  [/salt|crystal|mine|shaft|strata/, look({ key: 'mine', lamp: [338, 44], light: '#bfeaff', night: '#0a0d26', pool: ['#141f45', '#1f3d66', '#3a7396'], poolR: [740, 470, 230],
    rail: '#9fb6d8', bump: '#2c5fa8', cap: '#7fd6ff', dim: '#17204c', word: '#2a5580', flip: '#eef6ff', stripe: '#3aa7e0' })],
  // Halcyon: a low dawn over the parade ground
  [/banner|parade|academy/, look({ key: 'parade', lamp: [187, 20], light: '#ffd08a', night: '#100b34', pool: ['#221a5c', '#3d2f8a', '#7a4f9a'], poolR: [780, 480, 210],
    rail: '#e0a83a', bump: '#fff6e0', cap: '#e0a83a', dim: '#1c1650', word: '#4a3fa0', flip: '#fff6e0', stripe: '#d6263f' })],
  // Little Brand: one hidden hearth, and the rest of the water black
  [/reef|dark|tide|brand/, look({ key: 'reef', lamp: [330, 200], light: '#ff8a3c', night: '#05061a', pool: ['#080c26', '#0c1838', '#143050'], poolR: [520, 300, 130],
    rail: '#6f7fb0', bump: '#1f2a5c', cap: '#d9773a', dim: '#0d1230', word: '#16284a', flip: '#dfe6ff', stripe: '#ff8a3c' })],
  // Tallis: the bell lamp over the exchange floor, oxblood and gold
  [/ticker|exchange|price|bell/, look({ key: 'exchange', lamp: [187, 30], light: '#fff0b0', night: '#150a2a', pool: ['#2e1238', '#5a1f3a', '#96402e'], poolR: [800, 500, 230],
    rail: '#ffd24a', bump: '#7a1730', cap: '#ffd24a', dim: '#231040', word: '#7a2f44', flip: '#fff6e0', stripe: '#d6263f' })],
];
function lookOf(table) {
  const m = String(table.theme && table.theme.motif).toLowerCase();
  for (const [re, k] of LOOKS) if (re.test(m)) return k;
  throw new Error(`render: table '${table.id}' has motif ${JSON.stringify(table.theme && table.theme.motif)}, which no look is drawn for`);
}

// How a turning reel moves. Pure in cell.spin (seconds left): full speed, then a
// quadratic run-out over the last REEL_DECEL seconds that ends exactly on the symbol.
const REEL_SPEED = 16; // symbols per second
const REEL_DECEL = 0.3;

const PLATE_MS = 2400;
const PLATE_KINDS = new Set(['payout', 'jackpot', 'bust']);

/** Symbols still to pass under the payline for a cell with `spin` seconds left to turn. */
export function reelRemaining(spin) {
  if (!(spin > 0)) return 0;
  return spin < REEL_DECEL ? (REEL_SPEED * spin * spin) / (2 * REEL_DECEL) : REEL_SPEED * (spin - REEL_DECEL / 2);
}

/**
 * What the one button is right now. Pure in (content, game); the lever's half of it is the
 * core's own leverStatus, so the button never promises what a press will not do.
 *   launch  a ball is at the plunger: hold to charge (charge 0..1), release to launch
 *   idle    a ball is in play, a writ is about to put one on the plunger, or the table
 *           emptied a moment ago and the button is not yet the lever
 *   busy    the lever has been pulled and the reels are still turning
 *   credit  no ball and no writ, and the town is passing the hat: a ball arrives by itself
 *           (hat 0..1 is how near it is). A press now does not wait: it borrows and pulls
 *   free    the chapter's scripted first pull, which costs nothing
 *   lever   a pull costs SPIN_COST and the player has it
 *   loan    the player cannot pay: this press borrows
 */
export function launchState(content, game) {
  const reels = game.reels;
  if (!reels || !Array.isArray(reels.cells)) throw new Error(`render: game.reels is missing or has no cells: ${JSON.stringify(reels)}`);
  const balls = game.phys ? game.phys.balls : [];
  if (balls.some((b) => b.state === 'plunger')) return { kind: 'launch', charge: clamp(game.phys.charge, 0, 1) };
  const status = leverStatus(content, game);
  if (status === null) return { kind: 'idle', charge: 0 };
  if (status === 'wait') return { kind: reels.cells.some((c) => c.spin > 0) ? 'busy' : 'idle', charge: 0 };
  if (status === 'credit') return { kind: 'credit', charge: 0, hat: clamp((game.emptyT || 0) / AID_WAIT, 0, 1) };
  if (status === 'free') return { kind: 'free', charge: 0 };
  if (status === 'pull') return { kind: 'lever', charge: 0 };
  if (status === 'loan') return { kind: 'loan', charge: 0 };
  throw new Error(`render: the core's leverStatus gave a value this renderer does not know: ${JSON.stringify(status)}`);
}
// ───────────────────────── small pure helpers ─────────────────────────

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const mod = (a, n) => ((a % n) + n) % n;
const hash = (i) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const fmtInt = (n) => Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const roman = (n) => ROMAN[n] || String(n);
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

function segDist(p, a, b) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const l2 = vx * vx + vy * vy;
  const t = l2 === 0 ? 0 : clamp(((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l2, 0, 1);
  return Math.hypot(p[0] - (a[0] + vx * t), p[1] - (a[1] + vy * t));
}

// Unit normal of segment a-b that points toward the table's vertical centre line.
function inwardNormal(a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  let n = [-dy / l, dx / l];
  const m = mid(a, b);
  if ((200 - m[0]) * n[0] + (360 - m[1]) * n[1] < 0) n = [-n[0], -n[1]];
  return n;
}
// ───────────────────────── canvas helpers ─────────────────────────

let probe = null; // a 2d context used only to measure lettering

/** add a rounded rectangle to the current path (a pathFn body: no beginPath) */
function rrPath(g, x, y, w, h, r) {
  const q = Math.max(0, Math.min(r, w / 2, h / 2));
  g.moveTo(x + q, y);
  g.arcTo(x + w, y, x + w, y + h, q);
  g.arcTo(x + w, y + h, x, y + h, q);
  g.arcTo(x, y + h, x, y, q);
  g.arcTo(x, y, x + w, y, q);
  g.closePath();
}
function rr(g, x, y, w, h, r) {
  g.beginPath();
  rrPath(g, x, y, w, h, r);
}
const circ = (x, y, r) => (c) => { c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); c.closePath(); };
const box = (x, y, w, h, r) => (c) => rrPath(c, x, y, w, h, r);
const poly = (pts) => (c) => { pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); };

/** add a star of n rays to the current path: points at r1, valleys at r0 */
function starPath(g, x, y, r0, r1, n, rot) {
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * TAU;
    const r = i % 2 ? r0 : r1;
    if (i) g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
}
/** a burst: hard rays, near-white, with an ink line round them */
function burst(g, x, y, r0, r1, n, rot, fill, inkW) {
  g.beginPath();
  starPath(g, x, y, r0, r1, n, rot);
  if (inkW > 0) { inkLine(g, inkW * 2); g.stroke(); }
  g.fillStyle = fill;
  g.fill();
}
/** a fan of hard wedges from (x, y): every other one of 2n sectors, from r0 out to r1 */
function rays(g, x, y, r0, r1, n, rot, fill) {
  g.fillStyle = fill;
  g.beginPath();
  const w = TAU / (n * 2);
  for (let i = 0; i < n; i++) {
    const a = rot + i * 2 * w;
    g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
    g.lineTo(x + Math.cos(a - w * 0.1) * r1, y + Math.sin(a - w * 0.1) * r1);
    g.lineTo(x + Math.cos(a + w * 1.1) * r1, y + Math.sin(a + w * 1.1) * r1);
    g.lineTo(x + Math.cos(a + w) * r0, y + Math.sin(a + w) * r0);
    g.closePath();
  }
  g.fill();
}
/** a teardrop: a disc of radius r at (x, y) with a point reaching `reach` along ang */
function tearPath(g, x, y, r, ang, reach) {
  const phi = Math.acos(Math.min(1, r / reach));
  g.moveTo(x + Math.cos(ang) * reach, y + Math.sin(ang) * reach);
  g.arc(x, y, r, ang + phi, ang - phi + TAU);
  g.closePath();
}
/** a number in hard steps: a sine made to tick */
const stepped = (v, n) => Math.round(v * n) / n;

function wrap(g, text, maxW) {
  const out = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    const next = line ? line + ' ' + word : word;
    if (line && g.measureText(next).width > maxW) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

// Letter-spaced text (ctx.letterSpacing is not everywhere yet).
function spaced(g, text, x, y, gap, align = 'left') {
  const chars = [...String(text)];
  const widths = chars.map((c) => g.measureText(c).width);
  const total = widths.reduce((s, w) => s + w, 0) + gap * (chars.length - 1);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  const prev = g.textAlign;
  g.textAlign = 'left';
  chars.forEach((c, i) => {
    g.fillText(c, cx, y);
    cx += widths[i] + gap;
  });
  g.textAlign = prev;
  return total;
}

// Set a font, shrinking the size until `text` fits `maxW`.
function fitFont(g, text, maxW, size, make) {
  let s = size;
  g.font = make(s);
  while (s > 11 && g.measureText(text).width > maxW) {
    s -= 1;
    g.font = make(s);
  }
  return s;
}

/** lettering with an ink line round it, drawn straight (for the few labels that change every frame) */
function inked(g, text, x, y, fill, inkW = 3) {
  g.lineJoin = 'round';
  g.strokeStyle = INK;
  g.lineWidth = inkW;
  g.strokeText(text, x, y);
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

const brassGrad = () => BRASS; // brass is one flat tone now

function keycap(g, label, x, y) {
  g.font = `700 12px ${MONO}`;
  const w = Math.max(24, g.measureText(label).width + 14);
  rr(g, x, y - 9, w, 22, 5);
  g.fillStyle = INK;
  g.fill();
  rr(g, x, y - 11, w, 20, 5);
  g.fillStyle = PAPER;
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = 2;
  g.stroke();
  g.fillStyle = INK;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, x + w / 2, y - 0.5);
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  return w;
}

// A row of keycaps and words: parts are ['key','Enter'] or ['txt','spin'].
function hintRow(g, parts, x, y) {
  let cx = x;
  for (const [kind, s] of parts) {
    if (kind === 'key') cx += keycap(g, s, cx, y) + 6;
    else if (kind === 'txt') {
      g.font = `15px ${SERIF}`;
      g.fillStyle = A(PAPER, 0.85);
      g.textBaseline = 'middle';
      g.fillText(s, cx, y + 1);
      g.textBaseline = 'alphabetic';
      cx += g.measureText(s).width + 10;
    } else throw new Error(`render: unknown hint part '${kind}'`);
  }
  return cx;
}
// ───────────────────────── symbol art ─────────────────────────
// Each symbol is drawn centred on (cx, cy) inside a box of half-size s: flat shapes, one
// shadow tone, one highlight, an ink line. They are large in their tiles on purpose.

function drawSymbol(g, sym, cx, cy, s) {
  const L = HUD_L;
  const iw = Math.max(1.4, s * 0.12);
  g.save();
  g.translate(cx, cy);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (sym === 'coin') {
    cel(g, circ(0, 0, s * 0.92), BRASS, L, { off: s * 0.24, ink: iw, shadow: '#b06a1c',
      hi: (c) => { c.ellipse(-s * 0.36, -s * 0.44, s * 0.3, s * 0.13, -0.7, 0, TAU); }, hiCol: WHITE });
    g.fillStyle = INK;
    g.beginPath();
    poly([[0, -s * 0.46], [s * 0.32, 0], [0, s * 0.46], [-s * 0.32, 0]])(g);
    g.fill();
    g.fillStyle = BRASS_HI;
    g.beginPath();
    poly([[0, -s * 0.2], [s * 0.14, 0], [0, s * 0.2], [-s * 0.14, 0]])(g);
    g.fill();
  } else if (sym === 'scale') {
    const frame = () => {
      g.beginPath();
      g.moveTo(0, -s * 0.62);
      g.lineTo(0, s * 0.66);
      g.moveTo(-s * 0.44, s * 0.76);
      g.lineTo(s * 0.44, s * 0.76);
      g.moveTo(-s * 0.72, -s * 0.5);
      g.lineTo(s * 0.72, -s * 0.5);
    };
    frame();
    inkLine(g, s * 0.3);
    g.stroke();
    frame();
    inkLine(g, s * 0.12, BRASS);
    g.stroke();
    for (const sx of [-1, 1]) {
      inkLine(g, iw * 0.6);
      g.beginPath();
      g.moveTo(sx * s * 0.72, -s * 0.5);
      g.lineTo(sx * s * 0.98, s * 0.14);
      g.moveTo(sx * s * 0.72, -s * 0.5);
      g.lineTo(sx * s * 0.46, s * 0.14);
      g.stroke();
      const x = sx * s * 0.7;
      cel(g, (c) => { c.moveTo(x - s * 0.32, s * 0.12); c.arc(x, s * 0.12, s * 0.32, Math.PI, 0, true); c.closePath(); }, sx < 0 ? '#ff8a3c' : CRIMSON, L, { off: s * 0.1, ink: iw * 0.8 });
    }
    cel(g, circ(0, -s * 0.7, s * 0.16), BRASS_HI, L, { off: 0, ink: iw * 0.8 });
  } else if (sym === 'gavel') {
    cel(g, box(-s * 0.8, s * 0.6, s * 1.05, s * 0.24, s * 0.08), '#8a4a1c', L, { off: s * 0.08, ink: iw * 0.8 });
    g.rotate(-0.62);
    cel(g, box(-s * 0.11, -s * 0.2, s * 0.22, s * 1.12, s * 0.09), '#c9772e', L, { off: s * 0.07, ink: iw * 0.8 });
    cel(g, box(-s * 0.62, -s * 0.72, s * 1.24, s * 0.58, s * 0.12), '#c9772e', L, { off: s * 0.16, ink: iw,
      hi: (c) => { c.rect(-s * 0.46, -s * 0.72, s * 0.14, s * 0.58); c.rect(s * 0.32, -s * 0.72, s * 0.14, s * 0.58); }, hiCol: BRASS_HI });
  } else if (sym === 'crown') {
    cel(g, poly([[-s * 0.8, s * 0.62], [-s * 0.92, -s * 0.4], [-s * 0.42, s * 0.04], [0, -s * 0.72], [s * 0.42, s * 0.04], [s * 0.92, -s * 0.4], [s * 0.8, s * 0.62]]), BRASS, L, { off: s * 0.2, ink: iw, shadow: '#b06a1c',
      hi: (c) => { c.rect(-s, s * 0.3, s * 2, s * 0.12); }, hiCol: BRASS_HI });
    for (const [x, y, col] of [[-0.9, -0.44, CRIMSON], [0, -0.76, CRIMSON], [0.9, -0.44, CRIMSON], [-0.4, 0.46, PALETTE.sea], [0.4, 0.46, PALETTE.sea], [0, 0.46, WHITE]]) {
      g.beginPath();
      g.arc(x * s, y * s, s * 0.12, 0, TAU);
      g.fillStyle = col;
      g.fill();
      inkLine(g, iw * 0.6);
      g.stroke();
    }
  } else if (sym === 'tide') {
    g.save();
    g.beginPath();
    g.arc(0, 0, s * 0.92, 0, TAU);
    g.clip();
    g.fillStyle = '#bfeee4';
    g.fillRect(-s, -s, s * 2, s * 2);
    waves(g, -s, -s * 0.2, s * 2, s * 2, { len: s * 0.95, amp: s * 0.2, col: PALETTE.sea, every: 1, phase: 0.3, foam: false, ink: iw * 0.7 });
    waves(g, -s, s * 0.34, s * 2, s * 2, { len: s * 0.8, amp: s * 0.16, col: PALETTE.seaDeep, every: 1, phase: 0.8, foam: false, ink: iw * 0.7 });
    g.restore();
    g.beginPath();
    g.arc(0, 0, s * 0.92, 0, TAU);
    inkLine(g, iw);
    g.stroke();
    curl(g, -s * 0.1, -s * 0.36, s * 0.3, 1.2, 1, s * 0.16, WHITE, iw * 0.5);
  } else if (sym === 'orb') {
    cel(g, circ(0, 0, s * 0.68), '#6a5cff', L, { off: s * 0.22, ink: iw, shadow: '#2c2196',
      hi: (c) => { c.ellipse(-s * 0.26, -s * 0.32, s * 0.2, s * 0.11, -0.7, 0, TAU); }, hiCol: WHITE });
    g.beginPath();
    g.ellipse(0, 0, s * 0.98, s * 0.28, -0.42, 0.3, Math.PI - 0.3);
    inkLine(g, s * 0.2);
    g.stroke();
    inkLine(g, s * 0.08, BRASS_HI);
    g.stroke();
    glint(g, s * 0.72, -s * 0.52, s * 0.3, WHITE, 1, 0);
  } else {
    throw new Error(`render: no art for reel symbol '${sym}'`);
  }
  g.restore();
}

// ───────────────────────── the renderer ─────────────────────────

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('createRenderer: canvas has no 2d context');
  const doc = canvas.ownerDocument;
  probe = doc.createElement('canvas').getContext('2d');

  const view = {
    lastMs: null,
    ds: 0, // device pixels per logical pixel the layers were painted for
    layers: new Map(), // key -> offscreen canvas
    glows: new Map(), // colour -> radial sprite
    trails: new Map(), // ball id -> [[x,y],...]
    flashes: new Map(), // element id -> timeMs of last contact
    sparks: [], // {x,y,vx,vy,born,life,color}
    rings: [], // {x,y,born,color}
    prevHits: null,
    eased: { marks: null, score: null, trust: null, debt: null, lean: null },
    touch: false, // true on a touch device: say "tap" and "hold", not key names
    toastSeen: new Map(), // kind|text -> timeMs first seen
    plate: { result: null, since: 0 }, // the last paid line, kept up long enough to read
    elems: new Map(), // table id -> Map(element id -> [x,y])
    rails: new Map(), // table id|shot id -> {left, right}
    locked: [null, null, null], // per reel: timeMs it was seen to stop
    wasTurning: [false, false, false],
    spoken: { id: null, since: 0 }, // the line in the story strip and when it appeared
  };

  // A touch device is one whose main pointer is a finger, or any device once it has been
  // touched. A mouse click never changes the wording.
  const win = doc.defaultView;
  if (win && typeof win.matchMedia === 'function') {
    view.touch = win.matchMedia('(hover: none) and (pointer: coarse)').matches;
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') view.touch = true;
  }, { passive: true });

  // ─────────── cached layers and sprites ───────────

  /** An offscreen canvas of logical size w x h at `res` device pixels per unit, painted once. */
  function layer(key, w, h, res, paint) {
    const k = `${key}@${res.toFixed(3)}`;
    let c = view.layers.get(k);
    if (!c) {
      c = doc.createElement('canvas');
      c.width = Math.max(1, Math.ceil(w * res));
      c.height = Math.max(1, Math.ceil(h * res));
      const g = c.getContext('2d');
      g.scale(res, res);
      paint(g);
      view.layers.set(k, c);
    }
    return c;
  }

  /** A light, in three flat discs. (The name is from when it was a soft sprite.) */
  function glow(g, x, y, r, color, a) {
    if (!(a > 0) || !(r > 0)) return;
    bloom(g, x, y, r * 0.8, color, Math.min(1, a * 1.5));
  }

  /**
   * Inked lettering, rendered once into its own canvas and stamped: an ink line round each
   * letter, a flat fill, optionally a second tone on the lower part of the letters (lo) and
   * a hard drop behind them (drop px, down and to the right, in dropCol).
   * (x, y) is the alphabetic baseline; align is 'left' | 'center' | 'right'.
   */
  function inkText(g, text, x, y, o) {
    const { size, weight = '700', style = '', gap = 0, face = SERIF, align = 'center', alpha = 1, drop = 0, dropCol = CRIMSON, lo = null } = o;
    const fill = typeof o.fill === 'string' ? o.fill : Array.isArray(o.fill) ? o.fill[0][1] : WHITE;
    const iw = o.ink === undefined ? Math.max(2, size * 0.11) : o.ink;
    const font = `${style} ${weight} ${size}px ${face}`.trim();
    const key = `ink|${text}|${font}|${gap}|${fill}|${iw}|${drop}|${dropCol}|${lo}`;
    probe.font = font;
    const chars = [...String(text)];
    const tw = gap ? chars.reduce((s, c) => s + probe.measureText(c).width, 0) + gap * (chars.length - 1) : probe.measureText(text).width;
    const pad = iw + drop + 4;
    const w = tw + pad * 2;
    const h = size * 1.5 + pad * 2;
    const base = pad + size * 1.1;
    const c = layer(key, w, h, view.ds, (c2) => {
      const put = (k, dx, dy, stroke) => {
        k.font = font;
        k.textBaseline = 'alphabetic';
        k.lineJoin = 'round';
        const one = (s, px) => (stroke ? k.strokeText(s, px + dx, base + dy) : k.fillText(s, px + dx, base + dy));
        if (!gap) return one(text, pad);
        let px = pad;
        for (const ch of chars) { one(ch, px); px += k.measureText(ch).width + gap; }
        return undefined;
      };
      if (drop > 0) {
        c2.strokeStyle = c2.fillStyle = dropCol;
        c2.lineWidth = iw * 2;
        put(c2, drop * 0.7, drop, true);
        put(c2, drop * 0.7, drop, false);
      }
      if (iw > 0) {
        c2.strokeStyle = INK;
        c2.lineWidth = iw * 2;
        put(c2, 0, 0, true);
      }
      // the letters themselves, on their own canvas so the second tone stays inside them
      const t = doc.createElement('canvas');
      t.width = Math.ceil(w * view.ds);
      t.height = Math.ceil(h * view.ds);
      const k = t.getContext('2d');
      k.scale(view.ds, view.ds);
      k.fillStyle = fill;
      put(k, 0, 0, false);
      if (lo) {
        k.globalCompositeOperation = 'source-atop';
        k.fillStyle = lo;
        k.fillRect(0, base - size * 0.3, w, size);
      }
      c2.drawImage(t, 0, 0, w, h);
    });
    const left = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x;
    const prev = g.globalAlpha;
    g.globalAlpha = prev * clamp(alpha, 0, 1);
    g.drawImage(c, left - pad, y - base, w, h);
    g.globalAlpha = prev;
    return tw;
  }
  const litText = inkText;

  /** A sticker: a flat pill with an ink line and inked-on lettering, centred on (cx, cy). Returns its width. */
  function sticker(g, text, cx, cy, o) {
    const { size = 12, fill = PAPER, col = INK, face = MONO, weight = '700', padX = 9, h = size + 10, maxW = 1e9, gap = 0, lineW = 2 } = o || {};
    g.font = `${weight} ${size}px ${face}`;
    const tw = Math.min(maxW - padX * 2, g.measureText(text).width + gap * (String(text).length - 1));
    const w = tw + padX * 2;
    rr(g, cx - w / 2, cy - h / 2 + 2.5, w, h, h / 2);
    g.fillStyle = INK;
    g.fill();
    rr(g, cx - w / 2, cy - h / 2, w, h, h / 2);
    g.fillStyle = fill;
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = lineW;
    g.stroke();
    g.fillStyle = col;
    g.textBaseline = 'middle';
    if (gap) spaced(g, text, cx, cy + 0.5, gap, 'center');
    else {
      g.textAlign = 'center';
      g.fillText(text, cx, cy + 0.5, tw);
      g.textAlign = 'left';
    }
    g.textBaseline = 'alphabetic';
    return w;
  }

  /** A reel symbol of half-size s centred on (cx, cy), from a sprite. */
  function symbol(g, sym, cx, cy, s, k = 1) {
    const bx = s * 2.4;
    const c = layer(`sym:${sym}:${s}`, bx, bx, view.ds, (c2) => drawSymbol(c2, sym, bx / 2, bx / 2, s));
    g.drawImage(c, cx - (bx * k) / 2, cy - (bx * k) / 2, bx * k, bx * k);
  }
  view.pay = { result: null, since: 0 }; // the paying line the reel window last saw, and when it landed

  /** A writ, or a ball seen small: a flat pearl of radius r in a sprite 2r + 4 square. */
  function pearl(r) {
    return layer(`pearl:${r}`, r * 2 + 4, r * 2 + 4, view.ds, (c) => {
      cel(c, circ(r + 2, r + 2, r), PEARL, HUD_L, { off: r * 0.5, shadow: PEARL_LO, ink: Math.max(1.2, r * 0.2),
        hi: (k2) => { k2.ellipse(r + 2 - r * 0.3, r + 2 - r * 0.36, r * 0.3, r * 0.17, -0.7, 0, TAU); }, hiCol: '#ffffff' });
    });
  }

  function chapterOf(content, game) {
    const ch = content.chapters[game.chapter];
    if (!ch) throw new Error(`render: no chapter at index ${game.chapter}`);
    return ch;
  }

  function tableOf(content, chapter) {
    const t = content.tables[chapter.tableId];
    if (!t) throw new Error(`render: chapter '${chapter.id}' names unknown table '${chapter.tableId}'`);
    const r = t.reels;
    if (!r || !Array.isArray(r.fill) || r.fill.length !== 3 || !Array.isArray(r.spin)) {
      throw new Error(`render: table '${t.id}' needs reels: { fill: [id, id, id], spin: string[] }, has ${JSON.stringify(r)}`);
    }
    return t;
  }

  function reelsOf(game) {
    const r = game.reels;
    if (!r || !Array.isArray(r.cells) || r.cells.length !== 3) {
      throw new Error(`render: game.reels must carry three cells, got ${JSON.stringify(r)}`);
    }
    if (r.phase !== 'open' && r.phase !== 'paying') throw new Error(`render: unknown reels phase '${r.phase}'`);
    if (r.phase === 'paying' && !r.result) throw new Error('render: reels are paying with no result');
    return r;
  }

  function elemMap(table) {
    let m = view.elems.get(table.id);
    if (m) return m;
    m = new Map();
    for (const b of table.bumpers) m.set(b.id, b.pos);
    for (const t of table.targets) m.set(t.id, mid(t.a, t.b));
    for (const r of table.rollovers) m.set(r.id, r.pos);
    for (const s of table.shots) m.set(s.id, mid(s.a, s.b));
    for (const s of table.saucers) m.set(s.id, s.pos);
    for (const s of table.slings) m.set(s.id, mid(s.a, s.b));
    for (const id of [...table.reels.fill, ...table.reels.spin]) {
      if (!m.has(id)) throw new Error(`render: table '${table.id}' reels name '${id}', which is not an element of the table`);
    }
    view.elems.set(table.id, m);
    return m;
  }

  // ─────────── the playfield: what never changes ───────────
  // The scene under the furniture. It keeps to the ground tones of its look and thin ink, so
  // that nothing in it can be mistaken for something to shoot at: only the key lamp is bright.

  const ell = (x, y, rx, ry) => (c) => { c.moveTo(x + rx, y); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.closePath(); };

  /** The key lamp as a paper lantern of radius r: stepped bloom, orange paper, a near-white core. */
  function paperLamp(g, x, y, r, K) {
    const L = K.L;
    rings(g, x, y, r * 3.4, [A(L.col, 0.14), A(L.col, 0.2), A(L.col, 0.34)], [1, 0.68, 0.42]);
    g.fillStyle = INK;
    g.fillRect(x - r * 0.3, y - r * 1.3, r * 0.6, r * 2.6);
    cel(g, ell(x, y, r * 0.88, r), LANTERN, HUD_L, { off: r * 0.3, ink: 2.4, shadow: '#d1481c' });
    g.fillStyle = WHITE;
    g.beginPath();
    g.ellipse(x, y, r * 0.42, r * 0.6, 0, 0, TAU);
    g.fill();
    inkLine(g, 1.2);
    g.beginPath();
    g.ellipse(x, y, r * 0.5, r, 0, 0, TAU);
    g.stroke();
    glint(g, x - r * 0.3, y - r * 0.36, r * 0.62, '#ffffff', 1, 0);
  }
  /** The key lamp as a bare flame or a sun: stepped bloom and a near-white core, no body. */
  function bareLamp(g, x, y, r, K, n) {
    const L = K.L;
    rings(g, x, y, r * 4, [A(L.col, 0.14), A(L.col, 0.22), A(L.col, 0.4)], [1, 0.66, 0.4]);
    if (n > 0) burst(g, x, y, r * 0.9, r * 1.7, n, 0.2, L.rim, 0);
    g.fillStyle = L.core;
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
    if (n >= 0) glint(g, x, y, r * 2.2, WHITE, 0.95, 0);
  }
  function smallLantern(g, x, y, w, h, fill, inkW) {
    rr(g, x - w / 2, y - h / 2, w, h, w * 0.4);
    g.fillStyle = fill;
    g.fill();
    inkLine(g, inkW);
    g.stroke();
    g.fillStyle = INK;
    g.fillRect(x - w * 0.3, y - h / 2 - 1.5, w * 0.6, 2);
  }

  function paintMotif(g, table, K) {
    const L = K.L;
    const [lx, ly] = K.lamp;
    const toMid = Math.atan2(430 - ly, 190 - lx);
    if (K.key === 'harbour') {
      // the harbour on festival night: scalloped water that takes the light of the pool
      for (let k = 0; k < 11; k++) {
        waves(g, 0, 148 + k * 62, TW, 62, { len: 84 - (k % 3) * 10, amp: 6 + (k % 2) * 3, phase: hash(k + 3) * 2,
          col: k % 2 ? A('#040a3a', 0.3) : A('#3fd6c0', 0.09), foam: A(WHITE, 0.16 + 0.3 * (1 - k / 11)), every: 3, L });
      }
      shaft(g, lx, ly, toMid, 760, 0.46, L.col, 0.16);
      // paper lanterns set adrift, each carrying a name
      for (let i = 0; i < 10; i++) {
        const x = 34 + hash(i + 20) * 310;
        const y = 350 + hash(i + 40) * 420;
        g.fillStyle = A(LANTERN, 0.32);
        g.fillRect(x - 7, y + 8, 14, 2.5);
        smallLantern(g, x, y, 8, 10, blend('#ff9326', K.pool[1], 0.3), 1.2);
      }
      // a string of them from the lamp to the dock side
      inkLine(g, 1.5);
      g.beginPath();
      g.moveTo(lx + 16, ly - 14);
      g.quadraticCurveTo(210, 74, 352, 30);
      g.stroke();
      for (let j = 1; j <= 7; j++) {
        const t = j / 8;
        const u = 1 - t;
        const x = u * u * (lx + 16) + 2 * u * t * 210 + t * t * 352;
        const y = u * u * (ly - 14) + 2 * u * t * 74 + t * t * 30;
        smallLantern(g, x, y + 7, 7, 9, j % 2 ? blend(CRIMSON, K.pool[1], 0.25) : blend(LANTERN, K.pool[1], 0.2), 1.2);
      }
      paperLamp(g, lx, ly, 21, K);
    } else if (K.key === 'mine') {
      // stillsalt strata: faulted bands, and shards standing out of them
      const edge = (k) => {
        const pts = [];
        for (let x = 0; x <= TW; x += 50) {
          const y = 96 + k * 74 + x * 0.24 + (hash(k * 17 + x) - 0.5) * 22;
          pts.push([x, y], [x + 50, y]);
        }
        return pts;
      };
      for (let k = -1; k < 11; k++) {
        const top = edge(k);
        const bot = edge(k + 1).reverse();
        g.beginPath();
        poly([...top, ...bot])(g);
        g.fillStyle = k % 2 ? A('#02041e', 0.3) : A('#8fdcff', 0.05);
        g.fill();
      }
      shaft(g, lx, ly, toMid, 820, 0.4, L.col, 0.13);
      shaft(g, lx, ly, toMid + 0.52, 520, 0.16, L.col, 0.1);
      for (let i = 0; i < 15; i++) {
        const x = 26 + hash(i + 5) * 330;
        const y = 150 + hash(i + 50) * 620;
        const h = 16 + hash(i + 80) * 26;
        const w = h * 0.34;
        const lean = (hash(i + 31) - 0.5) * 0.9;
        g.save();
        g.translate(x, y);
        // its shadow first, thrown down the field
        g.fillStyle = A('#02031a', 0.42);
        g.beginPath();
        poly([[-w * 0.7, h / 2], [w * 0.7, h / 2], [w * 0.7 - L.dx * h * 1.3, h / 2 - L.dy * h * 1.3], [-w * 0.7 - L.dx * h * 1.3, h / 2 - L.dy * h * 1.1]])(g);
        g.fill();
        g.rotate(lean);
        cel(g, poly([[0, -h / 2], [w, -h / 6], [w * 0.7, h / 2], [-w * 0.7, h / 2], [-w, -h / 6]]), blend(K.pool[2], '#9fe6ff', 0.3), L, { off: w * 0.7, ink: 1.5, rim: 1.4, rimCol: A(WHITE, 0.8) });
        g.restore();
      }
      bareLamp(g, lx, ly, 7, K, 0);
    } else if (K.key === 'parade') {
      // the parade ground at first light: ranked flagstones, the sun on the pediment
      rays(g, lx, ly, 30, 900, 9, 0.12, A(L.col, 0.07));
      g.fillStyle = A('#05032a', 0.2);
      g.beginPath();
      for (let r = 0; r < 15; r++) {
        for (let c = -1; c < 7; c++) {
          if ((r + c) & 1) continue;
          g.rect(c * 62 + (r % 2) * 31, 120 + r * 46, 60, 44);
        }
      }
      g.fill();
      for (const [x, y] of [[66, 150], [308, 150], [140, 392], [234, 392]]) {
        const w = 26;
        const h = 78;
        const shape = poly([[x - w / 2, y], [x + w / 2, y], [x + w / 2, y + h], [x, y + h - 14], [x - w / 2, y + h]]);
        // long shadows straight down the ground, away from the sun
        g.fillStyle = A('#05032a', 0.4);
        g.beginPath();
        poly([[x - w / 2, y + h - 6], [x + w / 2, y + h - 6], [x + w / 2 + (x - lx) * 0.16, y + h + 88], [x - w / 2 + (x - lx) * 0.16, y + h + 88]])(g);
        g.fill();
        cel(g, shape, blend(CRIMSON, K.pool[1], 0.42), L, { off: 5, ink: 1.5, rim: 1.6, rimCol: A(L.rim, 0.7) });
        // the plumb: a line and a bob
        g.fillStyle = A(BRASS, 0.75);
        g.fillRect(x - 6, y + 12, 12, 2.5);
        g.fillRect(x - 1, y + 12, 2, 22);
        g.beginPath();
        poly([[x - 5, y + 34], [x + 5, y + 34], [x + 5, y + 44], [x, y + 56], [x - 5, y + 44]])(g);
        g.fill();
        g.fillStyle = INK;
        g.fillRect(x - w / 2 - 3, y - 3, w + 6, 4);
      }
      bareLamp(g, lx, ly - 8, 26, K, -1);
    } else if (K.key === 'reef') {
      // black water. One hearth is still lit, behind a shutter, and the rocks know where it is.
      for (let k = 0; k < 12; k++) {
        waves(g, 0, 70 + k * 62, TW, 62, { len: 92 - (k % 3) * 12, amp: 5 + (k % 2) * 3, phase: hash(k + 9) * 2,
          col: k % 2 ? A('#000008', 0.34) : A('#3a5fa8', 0.06), foam: A('#9fb4e6', 0.14), every: 4, L });
      }
      rays(g, lx, ly, 20, 250, 7, 0.4, A(L.col, 0.07));
      rings(g, lx, ly, 58, [A(L.col, 0.16), A(L.col, 0.26)], [1, 0.6]);
      for (let i = 0; i < 12; i++) {
        const x = 30 + hash(i + 3) * 320;
        const y = 120 + hash(i + 41) * 640;
        const r = 9 + hash(i + 77) * 15;
        const pts = [];
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * TAU;
          const q = r * (0.7 + hash(i * 11 + k) * 0.5);
          pts.push([x + Math.cos(a) * q * 1.4, y + Math.sin(a) * q * 0.75]);
        }
        const toLamp = Math.atan2(ly - y, lx - x);
        const local = { ...L, dx: Math.cos(toLamp), dy: Math.sin(toLamp) };
        cel(g, poly(pts), '#141a40', local, { off: r * 0.5, ink: 1.8, shadow: '#070a20', rim: 2, rimCol: A(L.col, clamp(1.15 - Math.hypot(lx - x, ly - y) / 420, 0.12, 0.9)) });
      }
      // the lanterns of nine winters, unlit
      for (let i = 0; i < 9; i++) smallLantern(g, 40 + hash(i + 300) * 300, 430 + hash(i + 330) * 330, 8, 10, '#161c48', 1.2);
    } else if (K.key === 'exchange') {
      // the exchange floor under the bell lamp: lozenge tiles, and a price that is falling
      rays(g, lx, ly, 26, 900, 11, 0.1, A(L.col, 0.06));
      g.fillStyle = A('#0a0224', 0.22);
      g.beginPath();
      for (let r = 0; r < 26; r++) {
        for (let c = 0; c < 7; c++) {
          const x = c * 68 + (r % 2) * 34;
          const y = 96 + r * 30;
          poly([[x, y - 28], [x + 32, y], [x, y + 28], [x - 32, y]])(g);
        }
      }
      g.fill();
      // the price line: steps up, then the run
      const line = [[14, 392], [60, 392], [60, 368], [108, 368], [108, 380], [150, 380], [150, 350], [196, 350], [196, 366], [236, 366], [236, 420], [270, 420], [270, 476], [300, 476], [300, 548], [330, 548]];
      g.beginPath();
      line.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      g.lineJoin = 'miter';
      g.lineCap = 'butt';
      g.strokeStyle = A('#ff7a5c', 0.2);
      g.lineWidth = 7;
      g.stroke();
      g.fillStyle = A('#ff7a5c', 0.2);
      g.beginPath();
      poly([[314, 548], [346, 548], [330, 572]])(g);
      g.fill();
      // dropped slips
      for (let i = 0; i < 14; i++) {
        g.save();
        g.translate(30 + hash(i + 500) * 320, 440 + hash(i + 520) * 330);
        g.rotate(hash(i + 540) * 3);
        g.fillStyle = A(PAPER, 0.16);
        g.fillRect(-7, -4, 14, 8);
        g.restore();
      }
      // the bell lamp
      rings(g, lx, ly, 86, [A(L.col, 0.14), A(L.col, 0.22), A(L.col, 0.4)], [1, 0.66, 0.4]);
      cel(g, (c) => { c.moveTo(lx - 17, ly + 12); c.quadraticCurveTo(lx - 14, ly - 16, lx, ly - 17); c.quadraticCurveTo(lx + 14, ly - 16, lx + 17, ly + 12); c.closePath(); }, BRASS_HI, HUD_L, { off: 5, ink: 2.4, shadow: '#c9772e' });
      g.fillStyle = WHITE;
      g.beginPath();
      g.arc(lx, ly + 13, 5, 0, TAU);
      g.fill();
      inkLine(g, 1.5);
      g.stroke();
      glint(g, lx, ly + 13, 22, WHITE, 0.95, 0);
    } else {
      throw new Error(`render: look '${K.key}' has no scene`);
    }
  }

  // The wireform of a ramp: two rails from the gate, dropping onto the exit.
  function rampRails(table, s) {
    const key = `${table.id}|${s.id}`;
    let r = view.rails.get(key);
    if (r) return r;
    const m = mid(s.a, s.b);
    const dl = Math.hypot(s.dir[0], s.dir[1]) || 1;
    const d = [s.dir[0] / dl, s.dir[1] / dl];
    const ex = s.exit.pos;
    const c1 = [m[0] + d[0] * 80, m[1] + d[1] * 80];
    const c2 = [ex[0], ex[1] - 170];
    const N = 30;
    r = { left: [], right: [] };
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      const u = 1 - t;
      const bx = u * u * u * m[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * ex[0];
      const by = u * u * u * m[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * ex[1];
      const tx = 3 * u * u * (c1[0] - m[0]) + 6 * u * t * (c2[0] - c1[0]) + 3 * t * t * (ex[0] - c2[0]);
      const ty = 3 * u * u * (c1[1] - m[1]) + 6 * u * t * (c2[1] - c1[1]) + 3 * t * t * (ex[1] - c2[1]);
      const tl = Math.hypot(tx, ty) || 1;
      r.left.push([bx - (ty / tl) * 6, by + (tx / tl) * 6]);
      r.right.push([bx + (ty / tl) * 6, by - (tx / tl) * 6]);
    }
    view.rails.set(key, r);
    return r;
  }

  // A ramp's wireform: two inked rails and their ties.
  function strokeRails(g, rails, col, a) {
    g.globalAlpha = a;
    for (const [w, c] of [[4.2, INK], [1.8, col]]) {
      inkLine(g, w, c);
      for (const rail of [rails.left, rails.right]) {
        g.beginPath();
        rail.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
        g.stroke();
      }
    }
    inkLine(g, 1.2, col);
    g.beginPath();
    for (let k = 1; k < rails.left.length - 1; k += 2) {
      g.moveTo(rails.left[k][0], rails.left[k][1]);
      g.lineTo(rails.right[k][0], rails.right[k][1]);
    }
    g.stroke();
    g.globalAlpha = 1;
  }

  const unit = (v) => {
    const l = Math.hypot(v[0], v[1]) || 1;
    return [v[0] / l, v[1] / l];
  };

  // A fat arrowhead of half-size s pointing along ang.
  function chevron(g, cx, cy, ang, s, fill, inkW) {
    g.save();
    g.translate(cx, cy);
    g.rotate(ang);
    g.beginPath();
    g.moveTo(s, 0);
    g.lineTo(-s * 0.6, -s);
    g.lineTo(-s * 0.1, 0);
    g.lineTo(-s * 0.6, s);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    if (inkW > 0) { inkLine(g, inkW); g.stroke(); }
    g.restore();
  }

  // Where an element's insert label sits.
  function labelSpot(table, kind, e) {
    if (kind === 'shot') {
      const m = mid(e.a, e.b);
      const d = unit(e.dir);
      // a long name is drawn toward its own side wall, clear of the lettering down the middle
      // of the table (Little Brand's BREAKWATER ran into LITTLE BRAND)
      const half = String(table.labels[e.id] || '').length * 3.9 + 3;
      const x = m[0] - d[0] * 58;
      return [x + (x < TW / 2 ? -1 : 1) * Math.max(0, half - 27), m[1] - d[1] * 58];
    }
    if (kind === 'rollover') return [e.pos[0], e.pos[1] + laneRad(table, e) + 11];
    if (kind === 'saucer') return [e.pos[0], e.pos[1] + e.r + 13];
    if (kind === 'bumper') {
      // under the cap, unless a target's letter already sits there (Halcyon's drills stand
      // beside the dormitory and bond banks): then over it
      const below = [e.pos[0], e.pos[1] + e.r + 12];
      const crowded = table.targets.some((t) => {
        const s = labelSpot(table, 'target', t);
        return Math.abs(s[0] - below[0]) < 34 && Math.abs(s[1] - below[1]) < 12;
      });
      return crowded ? [e.pos[0], e.pos[1] - e.r - 11] : below;
    }
    if (kind === 'target') {
      const n = inwardNormal(e.a, e.b);
      const m = mid(e.a, e.b);
      return [m[0] + n[0] * 17, m[1] + n[1] * 17];
    }
    throw new Error(`render: no label spot for element kind '${kind}'`);
  }

  // A fill lane's light is big enough to show the symbol its reel holds.
  const laneRad = (table, r) => (table.reels.fill.includes(r.id) ? 11 : Math.max(5, Math.min(r.r, 9)));

  // Insert lettering stays between the left wall and the plunger lane: a long name is moved in, never cut.
  const LABEL_X0 = 13;
  const LABEL_X1 = 362;
  // An unlit insert's name: flat and quiet, with a hard drop so it holds on any ground.
  function label(g, tf, text, spot, color) {
    if (!text) return;
    g.font = `700 ${tf}px ${MONO}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const half = g.measureText(text).width / 2 + 2;
    const x = clamp(spot[0], LABEL_X0 + half, LABEL_X1 - half);
    g.fillStyle = A('#04031c', 0.8);
    g.fillText(text, x + 1, spot[1] + 1.5);
    g.fillStyle = color;
    g.fillText(text, x, spot[1]);
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
  }
  // A lit insert's name: a sticker in the light's colour with ink lettering.
  function tag(g, tf, text, spot, fill, col = INK) {
    if (!text) return;
    g.font = `700 ${tf}px ${MONO}`;
    const half = g.measureText(text).width / 2 + 7;
    sticker(g, text, clamp(spot[0], LABEL_X0 + half, LABEL_X1 - half), spot[1], { size: tf, fill, col, padX: 6, h: tf + 6, lineW: 1.8 });
  }

  // The tag under the three fill lanes: what they are for, with a pointer up into each.
  function fillTagBox(g, table, tf) {
    const lanes = table.reels.fill.map((id) => table.rollovers.find((r) => r.id === id));
    if (lanes.some((r) => !r)) throw new Error(`render: table '${table.id}' reels.fill names a lane that is not a rollover`);
    const names = table.reels.fill.map((id) => table.labels[id]);
    const text = names[0] && names.every((n) => n === names[0]) ? `${names[0]} · FILL REELS` : 'FILL REELS';
    const cx = lanes.reduce((s, r) => s + r.pos[0], 0) / lanes.length;
    const y = Math.max(...lanes.map((r) => r.pos[1] + laneRad(table, r))) + tf / 2 + 16;
    g.font = `700 ${tf}px ${MONO}`;
    const half = g.measureText(text).width / 2 + 8;
    return { lanes, text, half, x: clamp(cx, LABEL_X0 + half, LABEL_X1 - half), y, h: tf + 7 };
  }
  function fillTag(g, table, tf, fill, col) {
    const { lanes, text, half, x, y, h } = fillTagBox(g, table, tf);
    for (const r of lanes) {
      const px = clamp(r.pos[0], x - half + 8, x + half - 8);
      g.beginPath();
      g.moveTo(px - 6, y - h / 2 + 1);
      g.lineTo(px, y - h / 2 - 8);
      g.lineTo(px + 6, y - h / 2 + 1);
      g.closePath();
      g.fillStyle = fill;
      g.fill();
      inkLine(g, 1.8);
      g.stroke();
    }
    sticker(g, text, x, y, { size: tf, fill, col, padX: 8, h, lineW: 1.8 });
  }
  // Three lanes that share one name are named once, under the middle lane.
  function labelText(table, e) {
    const fill = table.reels.fill;
    if (fill.includes(e.id) && e.id !== fill[1] && fill.every((id) => table.labels[id] === table.labels[fill[0]])) return '';
    return table.labels[e.id];
  }

  function eachLabelled(table, fn) {
    for (const e of table.shots) fn('shot', e);
    for (const e of table.rollovers) fn('rollover', e);
    for (const e of table.saucers) fn('saucer', e);
    for (const e of table.targets) fn('target', e);
    for (const e of table.bumpers) fn('bumper', e);
  }


  // A bumper at rest: a lantern or a drum seen from above. Skirt and skin, each in two tones.
  function paintBumper(g, b, K) {
    const L = K.L;
    const [x, y] = b.pos;
    const r = b.r;
    cel(g, circ(x, y, r), K.bump, L, { off: r * 0.36, ink: 2.6, rim: 2.2 });
    g.fillStyle = INK;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + 0.5;
      g.beginPath();
      g.arc(x + Math.cos(a) * r * 0.82, y + Math.sin(a) * r * 0.82, 1.5, 0, TAU);
      g.fill();
    }
    cel(g, circ(x, y, r * 0.64), K.cap, L, { off: r * 0.2, ink: 1.8,
      hi: (c) => { c.ellipse(x + L.dx * r * 0.3, y + L.dy * r * 0.3, r * 0.2, r * 0.1, L.angle + Math.PI / 2, 0, TAU); }, hiCol: WHITE });
  }

  // A standup target's insert: a teardrop whose point touches the target it stands for.
  function targetInsert(g, table, t, tf, fill, col, inkW) {
    const n = inwardNormal(t.a, t.b);
    const [x, y] = labelSpot(table, 'target', t);
    g.beginPath();
    tearPath(g, x, y, 8.5, Math.atan2(-n[1], -n[0]), 13.5);
    g.fillStyle = fill;
    g.fill();
    inkLine(g, inkW);
    g.stroke();
    g.font = `700 ${tf}px ${MONO}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = col;
    g.fillText(table.labels[t.id] || '', x, y + 0.5);
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
  }

  // The whole playfield at rest: the scene, the cast shadows, the rails and every element unlit.
  // tf is the insert type size, res the device pixels per table unit it is painted at.
  function paintTable(g, table, tf, res) {
    const K = lookOf(table);
    const L = K.L;
    const fills = table.reels.fill;
    g.fillStyle = K.night;
    g.fillRect(0, 0, TW, TH);
    g.save();
    g.beginPath();
    g.rect(0, 0, TW, TH);
    g.clip();
    rings(g, K.lamp[0], K.lamp[1], K.poolR[0], K.pool, K.poolR.map((v) => v / K.poolR[0]));
    paintMotif(g, table, K);
    // playfield lettering: part of the ground, in the ground's own tone, with a hard drop
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const d of table.decor) {
      const big = d.size >= 20;
      g.save();
      g.translate(d.pos[0], d.pos[1]);
      if (d.angle) g.rotate(d.angle);
      g.font = `italic 700 ${Math.max(d.size, tf)}px ${SERIF}`;
      g.fillStyle = A('#04031c', 0.6);
      g.fillText(d.text, big ? 2 : 1, big ? 3 : 1.5);
      g.fillStyle = big ? K.word : blend(K.word, PAPER, 0.3);
      g.fillText(d.text, 0, 0);
      g.restore();
    }
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.restore();

    const trace = (c) => {
      c.beginPath();
      for (const w of table.walls) {
        c.moveTo(w.a[0], w.a[1]);
        c.lineTo(w.b[0], w.b[1]);
      }
    };

    // cast shadows: everything that stands on the field throws one flat shape away from the lamp.
    // Painted solid on their own canvas and laid down once, so that where two meet they do not double.
    {
      const sh = doc.createElement('canvas');
      sh.width = Math.max(1, Math.ceil(TW * res));
      sh.height = Math.max(1, Math.ceil(TH * res));
      const s = sh.getContext('2d');
      s.scale(res, res);
      const sx = -L.dx;
      const sy = -L.dy;
      s.strokeStyle = s.fillStyle = '#04031c';
      s.lineCap = 'round';
      s.lineJoin = 'round';
      s.lineWidth = 6.5;
      for (let i = 1; i <= 6; i++) {
        s.save();
        s.translate(sx * i * 2.1, sy * i * 2.1);
        trace(s);
        s.stroke();
        s.restore();
      }
      for (const b of table.bumpers) {
        s.lineWidth = b.r * 2;
        s.beginPath();
        s.moveTo(b.pos[0] + sx * 4, b.pos[1] + sy * 4);
        s.lineTo(b.pos[0] + sx * b.r * 1.15, b.pos[1] + sy * b.r * 1.15);
        s.stroke();
      }
      s.lineWidth = 7;
      for (const t of [...table.targets, ...table.slings]) {
        for (let i = 1; i <= 3; i++) {
          s.beginPath();
          s.moveTo(t.a[0] + sx * i * 3, t.a[1] + sy * i * 3);
          s.lineTo(t.b[0] + sx * i * 3, t.b[1] + sy * i * 3);
          s.stroke();
        }
      }
      g.globalAlpha = 0.55;
      g.drawImage(sh, 0, 0, TW, TH);
      g.globalAlpha = 1;
    }

    // ramps and orbit gates
    for (const s of table.shots) {
      const m = mid(s.a, s.b);
      const d = unit(s.dir);
      if (s.exit) strokeRails(g, rampRails(table, s), STEEL, 0.4);
      g.beginPath();
      g.moveTo(s.a[0], s.a[1]);
      g.lineTo(s.b[0], s.b[1]);
      inkLine(g, 5);
      g.stroke();
      inkLine(g, 2.2, K.dim);
      g.stroke();
      for (let k = 0; k < 3; k++) chevron(g, m[0] - d[0] * (13 + k * 15), m[1] - d[1] * (13 + k * 15), Math.atan2(d[1], d[0]), 7, K.dim, 1.5);
    }

    // rails: an ink line, the rail in two tones, a bright rim on the lamp's side
    trace(g);
    inkLine(g, 7.6);
    g.stroke();
    inkLine(g, 4.4, K.rail);
    g.stroke();
    g.save();
    g.translate(-L.dx * 1.3, -L.dy * 1.3);
    trace(g);
    inkLine(g, 1.8, shadowOf(K.rail, L));
    g.stroke();
    g.restore();
    g.save();
    g.translate(L.dx * 1.3, L.dy * 1.3);
    trace(g);
    inkLine(g, 1.5, WHITE);
    g.stroke();
    g.restore();

    // lane inserts, unlit
    for (const r of table.rollovers) {
      const rad = laneRad(table, r);
      const reel = fills.indexOf(r.id);
      g.beginPath();
      g.arc(r.pos[0], r.pos[1], rad, 0, TAU);
      g.fillStyle = K.dim;
      g.fill();
      inkLine(g, reel >= 0 ? 2.4 : 1.8);
      g.stroke();
    }
    fillTag(g, table, tf, K.dim, A(PAPER, 0.6));

    // saucers: a hole with a rail round it
    for (const s of table.saucers) {
      const [x, y] = s.pos;
      g.beginPath();
      g.arc(x, y, s.r, 0, TAU);
      g.fillStyle = '#04031c';
      g.fill();
      inkLine(g, 6.4);
      g.stroke();
      inkLine(g, 3, K.rail);
      g.stroke();
      inkLine(g, 1.4, WHITE);
      g.beginPath();
      g.arc(x, y, s.r + 0.6, L.angle - 0.7, L.angle + 0.7);
      g.stroke();
    }

    // standup targets: a slab, and its teardrop insert in front of it
    const slab = blend(K.cap, K.night, 0.5);
    for (const t of table.targets) {
      g.beginPath();
      g.moveTo(t.a[0], t.a[1]);
      g.lineTo(t.b[0], t.b[1]);
      inkLine(g, 9);
      g.stroke();
      g.lineCap = 'butt';
      g.strokeStyle = slab;
      g.lineWidth = 5;
      g.stroke();
      targetInsert(g, table, t, tf, K.dim, A(PAPER, 0.6), 1.6);
    }

    // one-way gates, with small chevrons pointing the way a ball may pass
    for (const o of table.oneWays) {
      const p = unit(o.pass);
      const pa = Math.atan2(p[1], p[0]);
      const count = Math.max(1, Math.floor(Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]) / 22));
      for (let k = 0; k < count; k++) {
        const t = (k + 0.5) / count;
        chevron(g, o.a[0] + (o.b[0] - o.a[0]) * t, o.a[1] + (o.b[1] - o.a[1]) * t, pa, 4.5, STEEL, 1.4);
      }
    }

    // slingshot rubbers
    for (const s of table.slings) {
      g.beginPath();
      g.moveTo(s.a[0], s.a[1]);
      g.lineTo(s.b[0], s.b[1]);
      inkLine(g, 7.5);
      g.stroke();
      inkLine(g, 3.6, K.cap);
      g.stroke();
      for (const p of [s.a, s.b]) {
        g.beginPath();
        g.arc(p[0], p[1], 3.8, 0, TAU);
        g.fillStyle = WHITE;
        g.fill();
        inkLine(g, 1.8);
        g.stroke();
      }
    }

    for (const b of table.bumpers) paintBumper(g, b, K);

    const tagBox = fillTagBox(g, table, tf);
    eachLabelled(table, (kind, e) => {
      if (kind === 'target' || fills.includes(e.id)) return; // these carry their own lettering
      const spot = labelSpot(table, kind, e);
      // a name that would sit on the fill tag is left off: it comes up as a sticker when its insert is lit
      if (Math.abs(spot[1] - tagBox.y) < tagBox.h + 6 && Math.abs(spot[0] - tagBox.x) < tagBox.half + 24) return;
      label(g, tf, table.labels[e.id], spot, A(PAPER, 0.62));
    });

    // the frame's own shadow on the glass: a hard strip along the top and along the lamp's side
    g.fillStyle = A('#04031c', 0.5);
    g.fillRect(0, 0, TW, 6);
    g.fillRect(L.dx < 0 ? 0 : TW - 6, 6, 6, TH - 6);
  }

  // The frame either side of the glass, painted into the frame layer at T: two flat brass rails.
  function paintRails(g, T, H) {
    for (const x of [T.x - 8 * T.scale, T.x + TW * T.scale]) {
      const w = 8 * T.scale;
      g.fillStyle = INK;
      g.fillRect(x - 1.5, T.y, w + 3, H - T.y);
      g.fillStyle = BRASS;
      g.fillRect(x, T.y, w, H - T.y);
      g.fillStyle = BRASS_HI;
      g.fillRect(x, T.y, w * 0.3, H - T.y);
      g.fillStyle = BRASS_LO;
      g.fillRect(x + w * 0.7, T.y, w * 0.3, H - T.y);
    }
  }

  // The Plumb: a flat pearl. Its sprite is 5 radii square with the ball in the middle and the
  // shadow it throws, away from the table's lamp, beside it.
  function paintBall(g, r, K) {
    const L = K.L;
    const c = r * 2.5;
    g.fillStyle = A('#04031c', 0.5);
    g.beginPath();
    g.ellipse(c - L.dx * r * 0.8, c - L.dy * r * 0.8 + 1.5, r * 1.02, r * 0.92, 0, 0, TAU);
    g.fill();
    cel(g, circ(c, c, r), PEARL, L, { off: r * 0.5, shadow: PEARL_LO, ink: 1.8,
      hi: (k) => { k.ellipse(c + L.dx * r * 0.42, c + L.dy * r * 0.42, r * 0.3, r * 0.17, L.angle + Math.PI / 2, 0, TAU); }, hiCol: '#ffffff' });
  }

  function flipperPath(g, px, py, ang, len, r0, r1) {
    const b = Math.asin(clamp((r0 - r1) / len, -1, 1));
    const a0 = ang + Math.PI / 2 + b;
    const a1 = ang - Math.PI / 2 - b;
    g.moveTo(px + Math.cos(a0) * r0, py + Math.sin(a0) * r0);
    g.arc(px, py, r0, a0, a1 + TAU);
    g.arc(px + Math.cos(ang) * len, py + Math.sin(ang) * len, r1, a1, a0);
    g.closePath();
  }

  // ─────────── the playfield: what moves and what is lit ───────────

  function touch(id, x, y, now, color) {
    const last = view.flashes.get(id);
    if (last !== undefined && now - last < 140) return;
    view.flashes.set(id, now);
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * TAU;
      const sp = 40 + Math.random() * 120;
      view.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, born: now, life: 260 + Math.random() * 240, color });
    }
  }
  const flashOf = (id, now) => {
    const t = view.flashes.get(id);
    return t === undefined ? 0 : clamp(1 - (now - t) / 240, 0, 1);
  };


  // Drawn in table space (400 x 800); the caller has translated and scaled. res is device
  // pixels per table unit, tf the insert type size.
  function drawTable(g, table, game, scene, lit, threadCol, now, dt, res, tf) {
    const K = lookOf(table);
    const L = K.L;
    g.drawImage(layer(`table:${table.id}:${tf}`, TW, TH, res, (c) => paintTable(c, table, tf, res)), 0, 0, TW, TH);

    const reels = reelsOf(game);
    const phys = game.phys;
    const balls = phys ? phys.balls : [];
    const br = table.ballRadius;
    // lights tick: they are on, half on or off, never fading
    const pulse = stepped(0.5 + 0.5 * Math.sin(now / 170), 2);
    const slow = stepped(0.5 + 0.5 * Math.sin(now / 420), 2);
    const blink = Math.floor(now / 520) % 2 === 0;
    const hits = game.hits || {};
    const wanted = scene ? scene.objective.ids : [];
    const done = (id) => scene && scene.objective.kind === 'all' && wanted.includes(id) && (hits[id] || 0) > 0;
    const litAmt = (id) => (lit.has(id) ? 0.5 + 0.5 * pulse : 0);
    const hot = (col, on) => (on >= 1 ? tint(col, 0.7) : col);
    const spinIds = table.reels.spin;
    const fills = table.reels.fill;
    const armed = reels.armed === true;
    const chargeFrac = armed ? 1 : reels.need > 0 ? clamp(reels.charge / reels.need, 0, 1) : 0;
    const kickback = Boolean(game.boons && game.boons.kickback);
    const name = (e) => table.labels[e.id];

    // contacts seen this frame feed the retained flashes
    for (const b of balls) {
      if (b.state !== 'live') continue;
      for (const bu of table.bumpers) if (Math.hypot(b.pos[0] - bu.pos[0], b.pos[1] - bu.pos[1]) < bu.r + br + 3) touch(bu.id, b.pos[0], b.pos[1], now, WHITE);
      for (const t of table.targets) if (segDist(b.pos, t.a, t.b) < br + 3.5) touch(t.id, b.pos[0], b.pos[1], now, K.cap);
      for (const s of table.slings) if (segDist(b.pos, s.a, s.b) < br + 3) touch(s.id, b.pos[0], b.pos[1], now, K.cap);
    }
    // objective progress made since last frame rings the element
    if (view.prevHits && view.prevHits !== hits) {
      const em = elemMap(table);
      for (const id of Object.keys(hits)) {
        if ((hits[id] || 0) > (view.prevHits[id] || 0) && em.has(id)) {
          const p = em.get(id);
          view.rings.push({ x: p[0], y: p[1], born: now, color: threadCol });
        }
      }
    }
    view.prevHits = hits;

    // The charge of the reels, shown at every element that spins them: an arc that fills as
    // bumpers, slings and targets charge them, and a ring of turning rays once they are armed.
    const spinRing = (x, y, r) => {
      if (armed) {
        rays(g, x, y, r + 2, r + 9 + 3 * slow, 9, now / 900, LANTERN);
        g.beginPath();
        g.arc(x, y, r, 0, TAU);
        inkLine(g, 5.5);
        g.stroke();
        inkLine(g, 2.6, slow >= 1 ? WHITE : BRASS_HI);
        g.stroke();
      } else {
        g.beginPath();
        g.arc(x, y, r, 0, TAU);
        inkLine(g, 5);
        g.stroke();
        inkLine(g, 2.2, K.dim);
        g.stroke();
        if (chargeFrac > 0) {
          g.beginPath();
          g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * chargeFrac);
          inkLine(g, 2.6, LANTERN);
          g.stroke();
        }
      }
    };
    // ...and on a lane, where there is room, the curl that means "this spins the reels"
    const spinBadge = (x, y) => {
      const R = 9;
      const bx = R * 2 + 6;
      if (armed) bloom(g, x, y, R * 2.3, LANTERN, 0.7 + 0.3 * slow);
      g.drawImage(layer(`spin:${table.id}:${armed}`, bx, bx, res, (c) => {
        c.beginPath();
        c.arc(bx / 2, bx / 2, R - 1, 0, TAU);
        c.fillStyle = armed ? WHITE : K.dim;
        c.fill();
        curl(c, bx / 2, bx / 2, R * 0.74, 1.5, 1, R * 0.46, armed ? LANTERN : A(PAPER, 0.5), armed ? 1 : 0);
      }), x - bx / 2, y - bx / 2, bx, bx);
      spinRing(x, y, R);
    };

    // ramps and orbit gates
    for (const s of table.shots) {
      const on = litAmt(s.id);
      const spins = spinIds.includes(s.id);
      const gold = spins && armed;
      const m = mid(s.a, s.b);
      const d = unit(s.dir);
      if (on > 0 || gold) {
        const col = on > 0 ? threadCol : LANTERN;
        if (s.exit) strokeRails(g, rampRails(table, s), col, 0.9);
        g.beginPath();
        g.moveTo(s.a[0], s.a[1]);
        g.lineTo(s.b[0], s.b[1]);
        inkLine(g, 5.5);
        g.stroke();
        inkLine(g, 2.6, WHITE);
        g.stroke();
        // three arrows marching up into the lane, one of them white-hot at a time
        const lead = 2 - (Math.floor(now / 150) % 3);
        const ang = Math.atan2(d[1], d[0]);
        for (let k = 0; k < 3; k++) {
          const cx = m[0] - d[0] * (13 + k * 15);
          const cy = m[1] - d[1] * (13 + k * 15);
          if (k === lead) bloom(g, cx, cy, 15, col, 0.9);
          chevron(g, cx, cy, ang, k === lead ? 8.5 : 7, k === lead ? WHITE : col, 1.6);
        }
        tag(g, tf, gold && blink ? 'SPIN' : name(s), labelSpot(table, 'shot', s), gold && blink ? WHITE : hot(col, on));
      }
      if (spins) spinBadge(m[0] + d[0] * 16, m[1] + d[1] * 16);
    }

    // lane inserts
    let wanting = false;
    for (const r of table.rollovers) {
      const on = litAmt(r.id);
      const over = balls.some((b) => b.inside && b.inside.includes(r.id));
      const got = done(r.id);
      const reel = fills.indexOf(r.id);
      const kick = kickback && /^out/.test(r.id);
      if (on === 0 && !over && !got && reel < 0 && !kick) continue;
      const [x, y] = r.pos;
      const rad = laneRad(table, r);
      if (reel >= 0) {
        // the lane shows the reel it feeds: its numeral while empty, the symbol once it holds one
        const cell = reels.cells[reel];
        const turning = cell.spin > 0;
        const holds = cell.sym !== null && !turning;
        const want = !holds && !turning && reels.phase === 'open';
        wanting = wanting || want;
        if (want || on > 0 || over) bloom(g, x, y, rad * 2.3, on > 0 ? threadCol : BRASS_HI, over ? 1 : 0.55 + 0.35 * slow);
        g.beginPath();
        g.arc(x, y, rad, 0, TAU);
        g.fillStyle = over ? '#ffffff' : holds ? PAPER : turning ? LANTERN : want && slow >= 1 ? WHITE : want ? BRASS_HI : K.dim;
        g.fill();
        inkLine(g, 2.4);
        g.stroke();
        if (holds) symbol(g, cell.sym, x, y, Math.round(rad * 0.74));
        else if (!turning) {
          g.font = `700 ${tf + 1}px ${SERIF}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillStyle = INK;
          g.fillText(ROMAN[reel + 1], x, y + 0.5);
          g.textAlign = 'left';
          g.textBaseline = 'alphabetic';
        }
        if (on > 0) {
          g.beginPath();
          g.arc(x, y, rad + 3.5, 0, TAU);
          inkLine(g, 2.2, hot(threadCol, on));
          g.stroke();
        }
      } else {
        const col = on > 0 || got ? threadCol : kick ? LANTERN : K.cap;
        if (on > 0 || over || kick) bloom(g, x, y, rad * 2.4, over ? WHITE : col, over ? 1 : kick && on === 0 ? 0.5 + 0.3 * slow : on);
        g.beginPath();
        g.arc(x, y, rad, 0, TAU);
        g.fillStyle = over ? '#ffffff' : on > 0 ? hot(col, on) : col;
        g.fill();
        inkLine(g, 2);
        g.stroke();
        if (on > 0 || kick) {
          g.fillStyle = WHITE;
          g.beginPath();
          g.arc(x, y, rad * 0.4, 0, TAU);
          g.fill();
        }
        if (kick) tag(g, tf, 'KICK', labelSpot(table, 'rollover', r), LANTERN);
        else if (on > 0 || got) tag(g, tf, name(r), labelSpot(table, 'rollover', r), hot(threadCol, on));
      }
    }
    if (wanting) fillTag(g, table, tf, slow >= 1 ? WHITE : BRASS_HI, INK);

    // saucers
    for (const s of table.saucers) {
      const on = litAmt(s.id);
      const spins = spinIds.includes(s.id);
      const [x, y] = s.pos;
      if (spins) spinRing(x, y, s.r + 5);
      if (on > 0) {
        bloom(g, x, y, s.r * 2.6, threadCol, on);
        g.beginPath();
        g.arc(x, y, s.r, 0, TAU);
        inkLine(g, 6.4);
        g.stroke();
        inkLine(g, 3.2, hot(threadCol, on));
        g.stroke();
        tag(g, tf, name(s), labelSpot(table, 'saucer', s), hot(threadCol, on));
      } else if (spins && armed) {
        tag(g, tf, blink ? 'SPIN' : name(s), labelSpot(table, 'saucer', s), blink ? WHITE : LANTERN);
      }
    }

    // standup targets
    for (const t of table.targets) {
      const on = litAmt(t.id);
      const fl = flashOf(t.id, now);
      const got = done(t.id);
      if (on === 0 && fl === 0 && !got) continue;
      const m = mid(t.a, t.b);
      const spot = labelSpot(table, 'target', t);
      if (on > 0) bloom(g, spot[0], spot[1], 19, threadCol, on);
      if (fl > 0) burst(g, m[0], m[1], 5, 11 + 9 * stepped(fl, 2), 7, 0.3, WHITE, 1.4);
      g.beginPath();
      g.moveTo(t.a[0], t.a[1]);
      g.lineTo(t.b[0], t.b[1]);
      inkLine(g, 9);
      g.stroke();
      g.lineCap = 'butt';
      g.strokeStyle = fl > 0.05 ? '#ffffff' : hot(threadCol, on);
      g.lineWidth = 5;
      g.stroke();
      if (on > 0 && fl <= 0.05) {
        g.strokeStyle = WHITE;
        g.lineWidth = 1.6;
        g.stroke();
      }
      if (on > 0 || got) targetInsert(g, table, t, tf, on >= 1 ? WHITE : threadCol, INK, 1.8);
    }

    // slingshots: the rubber jumps when struck
    for (const s of table.slings) {
      const fl = flashOf(s.id, now);
      if (fl === 0) continue;
      const n = inwardNormal(s.a, s.b);
      const m = mid(s.a, s.b);
      burst(g, m[0] + n[0] * 6, m[1] + n[1] * 6, 5, 10 + 9 * stepped(fl, 2), 6, 0.2, WHITE, 1.4);
      g.beginPath();
      g.moveTo(s.a[0], s.a[1]);
      g.quadraticCurveTo(m[0] + n[0] * 11 * fl, m[1] + n[1] * 11 * fl, s.b[0], s.b[1]);
      inkLine(g, 7.5);
      g.stroke();
      inkLine(g, 3.6, '#ffffff');
      g.stroke();
    }

    // bumpers: struck, they flash in a burst of hard rays; lit, they burn in the thread's colour
    for (const b of table.bumpers) {
      const on = litAmt(b.id);
      const fl = flashOf(b.id, now);
      if (on === 0 && fl === 0) continue;
      const [x, y] = b.pos;
      const r = b.r;
      if (fl > 0) {
        const q = stepped(fl, 3);
        burst(g, x, y, r * 1.02, r + 5 + 15 * q, 10, 0.16 + (1 - q) * 0.3, q > 0.5 ? '#ffffff' : L.rim, 1.6);
        g.beginPath();
        g.arc(x, y, r, 0, TAU);
        g.fillStyle = K.cap;
        g.fill();
        inkLine(g, 2.6);
        g.stroke();
        g.beginPath();
        g.arc(x, y, r * 0.64, 0, TAU);
        g.fillStyle = '#ffffff';
        g.fill();
        inkLine(g, 1.8);
        g.stroke();
      } else {
        bloom(g, x, y, r * 2.2, threadCol, on);
        g.beginPath();
        g.arc(x, y, r * 0.64, 0, TAU);
        g.fillStyle = threadCol;
        g.fill();
        inkLine(g, 1.8);
        g.stroke();
        g.fillStyle = WHITE;
        g.beginPath();
        g.arc(x, y, r * (on >= 1 ? 0.4 : 0.26), 0, TAU);
        g.fill();
      }
      if (on > 0) tag(g, tf, name(b), labelSpot(table, 'bumper', b), hot(threadCol, on));
    }

    // ball save insert between the flippers
    if (game.boons && game.boons.ballSave > 0 && table.flippers.length >= 2) {
      const fx0 = table.flippers.reduce((s, f) => s + f.pivot[0], 0) / table.flippers.length;
      const fy0 = Math.max(...table.flippers.map((f) => f.pivot[1])) + 46;
      bloom(g, fx0, fy0, 30, LANTERN, 0.6 + 0.3 * pulse);
      tag(g, tf, `SAVE ${Math.ceil(game.boons.ballSave)}`, [fx0, fy0], pulse >= 1 ? WHITE : LANTERN);
    }

    // plunger: a sprung rod under the ball rest, and a ring that closes as it is drawn back
    {
      const [px, py] = table.plunger.pos;
      const charge = phys ? clamp(phys.charge, 0, 1) : 0;
      const top = py + br + 3 + charge * 34;
      g.fillStyle = INK;
      g.fillRect(px - 4.5, top, 9, TH - top);
      g.fillStyle = BRASS;
      g.fillRect(px - 2.5, top, 5, TH - top);
      g.fillStyle = BRASS_HI;
      g.fillRect(px - 2.5, top, 1.6, TH - top);
      rr(g, px - 8, top - 4, 16, 8, 3);
      g.fillStyle = CRIMSON;
      g.fill();
      inkLine(g, 1.8);
      g.stroke();
      if (charge > 0) {
        g.beginPath();
        g.arc(px, py, br + 5.5, -Math.PI / 2, -Math.PI / 2 + TAU * charge);
        inkLine(g, 6);
        g.stroke();
        inkLine(g, 3, charge > 0.92 ? '#ffffff' : LANTERN);
        g.stroke();
      }
    }

    // flippers: chunky, inked, one stripe
    for (const f of table.flippers) {
      const st = phys && phys.flippers ? phys.flippers[f.id] : null;
      const ang = st ? st.angle : f.restAngle;
      const [px, py] = f.pivot;
      const r0 = f.radius + 2.6;
      const r1 = f.radius + 0.4;
      const shape = (c) => flipperPath(c, px, py, ang, f.length, r0, r1);
      g.fillStyle = A('#04031c', 0.5);
      g.beginPath();
      flipperPath(g, px - L.dx * 4 + 1, py - L.dy * 4 + 3, ang, f.length, r0, r1);
      g.fill();
      cel(g, shape, K.flip, L, { off: 3.2, ink: 2.2 });
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      g.beginPath();
      g.moveTo(px + ca * 11, py + sa * 11);
      g.lineTo(px + ca * (f.length - 3), py + sa * (f.length - 3));
      inkLine(g, 3.2, K.stripe);
      g.stroke();
      g.beginPath();
      g.arc(px, py, 3.6, 0, TAU);
      g.fillStyle = BRASS;
      g.fill();
      inkLine(g, 1.6);
      g.stroke();
    }

    // balls: a cast shadow, a short stepped trail when fast, the pearl
    const ballSprite = layer(`ball:${table.id}`, br * 5, br * 5, res, (c) => paintBall(c, br, K));
    const seen = new Set();
    for (const b of balls) {
      seen.add(b.id);
      let tr = view.trails.get(b.id);
      if (!tr) view.trails.set(b.id, (tr = []));
      const lastP = tr[tr.length - 1];
      if (!lastP || Math.hypot(lastP[0] - b.pos[0], lastP[1] - b.pos[1]) > 160) tr.length = 0; // carried by a ramp: do not smear
      tr.push([b.pos[0], b.pos[1]]);
      if (tr.length > 8) tr.shift();
      const [x, y] = b.pos;
      const held = b.state === 'held';
      if (b.state === 'live' && tr.length >= 4) {
        const far = tr[tr.length - 4];
        if (Math.hypot(far[0] - x, far[1] - y) > 13) {
          // three flat discs falling away behind it
          const n = tr.length;
          for (const [back, k, a] of [[6, 0.42, 0.22], [4, 0.6, 0.36], [2, 0.8, 0.55]]) {
            if (n - 1 - back < 0) continue;
            const p = tr[n - 1 - back];
            g.fillStyle = A(L.rim, a);
            g.beginPath();
            g.arc(p[0], p[1], br * k, 0, TAU);
            g.fill();
          }
        }
      }
      g.globalAlpha = held ? 0.75 : 1;
      const k = held ? 0.86 : 1;
      g.drawImage(ballSprite, x - br * 2.5 * k, y - br * 2.5 * k, br * 5 * k, br * 5 * k);
      g.globalAlpha = 1;
    }
    for (const id of [...view.trails.keys()]) if (!seen.has(id)) view.trails.delete(id);

    // sparks are four-point glints; objective rings are two hard rings
    view.sparks = view.sparks.filter((s) => now - s.born < s.life && now >= s.born);
    for (const s of view.sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 260 * dt;
      const k = 1 - (now - s.born) / s.life;
      glint(g, s.x, s.y, 2.5 + 4.5 * k, s.color, 1, 0.4);
    }
    view.rings = view.rings.filter((r) => now - r.born < 600 && now >= r.born);
    for (const r of view.rings) {
      const k = stepped((now - r.born) / 600, 6);
      g.beginPath();
      g.arc(r.x, r.y, 12 + k * 44, 0, TAU);
      inkLine(g, 6.5 * (1 - k) + 2);
      g.stroke();
      inkLine(g, 4 * (1 - k) + 0.8, k < 0.34 ? WHITE : r.color);
      g.stroke();
    }
  }

  // The table at T = {x, y, scale}, shaken on impact. The frame round it is the caller's.
  function drawTableAt(g, L, T, content, game, fx, table, scene, lit, threadCol, dt) {
    const s = T.scale;
    const now = fx.timeMs;
    const sh = clamp(fx.shake || 0, 0, 1);
    g.save();
    g.beginPath();
    g.rect(T.x, T.y, TW * s, Math.max(0, L.H - T.y));
    g.clip();
    if (sh > 0) {
      // a shaken table uncovers a sliver of what is behind it
      g.fillStyle = NIGHT;
      g.fillRect(T.x, T.y, TW * s, L.H - T.y);
    }
    g.translate(T.x + Math.sin(now / 17) * 7 * sh * s, T.y + Math.cos(now / 13) * 5 * sh * s);
    g.scale(s, s);
    drawTable(g, table, game, scene, lit, threadCol, now, dt, view.ds * s, Math.ceil(MIN_TYPE / s));
    g.restore();
  }


  // A prompt on the glass, in table space. Only shown while no ball is in play.
  function tableBanner(g, text, y, color, a, tf) {
    g.font = `italic 700 ${tf + 3}px ${SERIF}`;
    const w = Math.min(TW - 44, g.measureText(text).width + 32);
    rr(g, 187 - w / 2, y - 13, w, 32, 16);
    g.fillStyle = '#04031c';
    g.fill();
    rr(g, 187 - w / 2, y - 16, w, 32, 16);
    g.fillStyle = PLATE;
    g.fill();
    g.strokeStyle = color;
    g.lineWidth = a >= 0.9 ? 2.6 : 1.6;
    g.stroke();
    g.fillStyle = color;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 187, y + 1, w - 20);
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
  }

  function promptFor(state, finger) {
    const hold = finger ? 'Hold the button' : 'Hold Space';
    const press = finger ? 'Press the lever' : 'Press Space';
    if (state.kind === 'launch') return [`${hold}, release to launch`, BRASS_HI];
    if (state.kind === 'lever') return [`No writ. ${press}: ${fmtInt(SPIN_COST)} marks a pull`, BRASS_HI];
    if (state.kind === 'free') return [`No writ. ${press}: this pull is yours`, BRASS_HI];
    if (state.kind === 'loan') return [`No marks. ${press}: the Mint lends ${fmtInt(LOAN.marks)}`, RED];
    if (state.kind === 'credit') return ['The hat is coming round. Wait, or press to borrow', THREADS.commons.color];
    if (state.kind === 'busy') return ['The reels turn. By lot, and by law.', PAPER];
    if (state.kind === 'idle') return null;
    throw new Error(`render: no prompt for launch state '${state.kind}'`);
  }

  function ellipsize(g, text, maxW) {
    if (g.measureText(text).width <= maxW) return text;
    let s = String(text);
    while (s.length > 1 && g.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s.trimEnd() + '…';
  }

  function toastColor(kind, fallback) {
    const k = String(kind).toLowerCase();
    if (/loan|debt|bust|drain|garnish/.test(k)) return RED;
    if (/aid|trust|commons/.test(k)) return THREADS.commons.color;
    if (/jackpot|payout|marks|score|boon|save|kick/.test(k)) return BRASS_HI;
    return fallback;
  }

  function boonName(boon) {
    if (boon === 'ballSave') return 'ball save';
    if (boon === 'multiball') return 'multiball';
    if (boon === 'doubleMarks') return 'double marks';
    if (boon === 'kickback') return 'kickback';
    throw new Error(`render: unknown boon '${boon}'`);
  }

  function gainsOf(payout) {
    const gains = [];
    if (payout.writs > 0) gains.push(`+${payout.writs} writ${payout.writs === 1 ? '' : 's'}`);
    if (payout.marks > 0) gains.push(`+${fmtInt(payout.marks)} marks`);
    if (payout.points > 0) gains.push(`+${fmtInt(payout.points)} pts`);
    if (payout.boon) gains.push(boonName(payout.boon));
    return gains;
  }
  const pays = (payout) => payout.writs > 0 || payout.marks > 0 || payout.points > 0 || Boolean(payout.boon);

  function ease(key, target, dt) {
    const cur = view.eased[key];
    if (cur === null || !Number.isFinite(cur)) return (view.eased[key] = target);
    const next = cur + (target - cur) * Math.min(1, dt * 7);
    return (view.eased[key] = Math.abs(target - next) < 0.5 ? target : next);
  }

  // The four boons, as [short name, colour, seconds left or null] for those in force.
  function boonsInForce(game) {
    const b = game.boons || {};
    const balls = game.phys ? game.phys.balls.length : 0;
    return [
      ['SAVE', LANTERN, b.ballSave > 0 ? Math.ceil(b.ballSave) : null, b.ballSave > 0],
      [`×${b.mult > 1 ? b.mult : 2}`, BRASS_HI, b.mult > 1 && b.multT > 0 ? Math.ceil(b.multT) : null, b.mult > 1 && b.multT > 0],
      ['MULTI', STEEL, balls > 1 ? balls : null, balls > 1],
      ['KICK', LANTERN, null, Boolean(b.kickback)],
    ];
  }


  // ─────────── the Reels of Assay ───────────

  // Three tiles in a brass housing at (x, y). cw x ch is one tile; returns the housing's size.
  // An empty reel is a dark well with its numeral; a held one is a cream tile with a large flat
  // symbol; a turning one streaks; a paying line slams, and rays stand out round the housing.
  function drawReelWindow(g, game, x, y, cw, ch, gap, pad, now) {
    const reels = reelsOf(game);
    const W = cw * 3 + gap * 2 + pad * 2;
    const H = ch + pad * 2;
    const ss = Math.round(Math.min(cw, ch) * 0.4); // symbol half-size
    const paying = reels.phase === 'paying';
    const win = paying && pays(reels.result.payout);
    if (!paying) view.pay = { result: null, since: 0 };
    else if (view.pay.result !== reels.result || now < view.pay.since) view.pay = { result: reels.result, since: now };
    const slam = paying ? clamp((now - view.pay.since) / 170, 0, 1) : 1;
    const flick = Math.floor(now / 110) % 2 === 0;
    if (win) {
      const m = pad * 1.5;
      g.save();
      g.beginPath();
      g.rect(x - m, y - m * 0.7, W + m * 2, H + m * 1.4);
      g.clip();
      rays(g, x + W / 2, y + H / 2, H * 0.3, W, 12, now / 1300, flick ? WHITE : BRASS_HI);
      g.restore();
    }
    g.drawImage(layer(`housing:${cw}:${ch}:${gap}:${pad}`, W + 12, H + 14, view.ds, (c) => {
      c.translate(6, 4);
      rr(c, 1, 5, W, H, pad + 4);
      c.fillStyle = '#04031c';
      c.fill();
      cel(c, box(0, 0, W, H, pad + 4), BRASS, HUD_L, { off: 4, ink: 2.6, shadow: '#b06a1c', rim: 1.8, rimCol: WHITE });
      rr(c, pad - 3, pad - 3, W - pad * 2 + 6, H - pad * 2 + 6, 7);
      c.fillStyle = INK;
      c.fill();
      for (let i = 0; i < 3; i++) {
        rr(c, pad + i * (cw + gap), pad, cw, ch, 5);
        c.fillStyle = '#231d66';
        c.fill();
      }
    }), x - 6, y - 4, W + 12, H + 14);
    const paper = layer(`paper:${cw}:${ch}`, cw, ch, view.ds, (c) => {
      cel(c, box(0, 0, cw, ch, 5), PAPER, HUD_L, { off: 3.5, shadow: '#dcc089', ink: 1.6 });
    });

    for (let i = 0; i < 3; i++) {
      const cell = reels.cells[i];
      const cx = x + pad + i * (cw + gap);
      const cy = y + pad;
      const mx = cx + cw / 2;
      const my = cy + ch / 2;
      const turning = cell.spin > 0;
      if (view.wasTurning[i] && !turning && cell.sym !== null) view.locked[i] = now;
      view.wasTurning[i] = turning;
      if (turning) {
        if (cell.sym === null) throw new Error(`render: reel ${i} is turning (spin ${cell.spin}) toward no symbol`);
        const strip = REEL_STRIPS[i];
        const base = strip.indexOf(cell.sym);
        if (base < 0) throw new Error(`render: reel ${i} is turning toward '${cell.sym}', which is not on REEL_STRIPS[${i}]`);
        const p = base - reelRemaining(cell.spin);
        const fl = Math.floor(p);
        const fr = p - fl;
        const fast = cell.spin > REEL_DECEL;
        g.save();
        g.beginPath();
        g.rect(cx, cy, cw, ch);
        g.clip();
        g.drawImage(paper, cx, cy, cw, ch);
        if (fast) {
          // the streak: the same symbols twice more behind, each a step fainter, and hard speed lines
          for (const [back, a] of [[0.44, 0.22], [0.22, 0.42]]) {
            g.globalAlpha = a;
            for (let k = -1; k <= 1; k++) symbol(g, strip[mod(fl + k, strip.length)], mx, my - (k - fr) * ch - ch * back, ss);
          }
          g.globalAlpha = 1;
        }
        for (let k = -1; k <= 1; k++) symbol(g, strip[mod(fl + k, strip.length)], mx, my - (k - fr) * ch, ss);
        if (fast) {
          g.fillStyle = A(INK, 0.5);
          for (let j = 0; j < 4; j++) {
            const lx = cx + cw * (0.14 + j * 0.24);
            const ly = cy + mod(now * 0.5 + j * ch * 0.37 + i * 9, ch * 1.4) - ch * 0.4;
            g.fillRect(lx, ly, 2, ch * 0.36);
          }
        }
        g.fillStyle = A(INK, 0.4);
        g.fillRect(cx, cy, cw, 5);
        g.fillRect(cx, cy + ch - 5, cw, 5);
        g.restore();
      } else if (cell.sym !== null) {
        const since = view.locked[i] === null ? 9 : (now - view.locked[i]) / 1000;
        const u = since >= 0 && since < 0.4 ? since / 0.4 : 1;
        const rock = u < 1 ? 0.09 * ch * (1 - u) * (1 - u) * Math.sin(TAU * 1.5 * u) : 0;
        g.drawImage(paper, cx, cy, cw, ch);
        if (win && flick) {
          rr(g, cx + 1.5, cy + 1.5, cw - 3, ch - 3, 4);
          g.fillStyle = '#fff2a8';
          g.fill();
        }
        symbol(g, cell.sym, mx, my + rock, ss, win ? 1 + 0.3 * (1 - slam) : 1);
        if (u < 1) {
          rr(g, cx - 1, cy - 1, cw + 2, ch + 2, 6);
          g.strokeStyle = u < 0.5 ? '#ffffff' : BRASS_HI;
          g.lineWidth = u < 0.5 ? 3 : 1.5;
          g.stroke();
        }
      } else {
        // empty: the reel's numeral, waiting for its lane
        g.font = `700 ${Math.max(MIN_TYPE, Math.round(ch * 0.36))}px ${SERIF}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = A(BRASS_HI, Math.floor(now / 520 + i) % 3 === 0 ? 0.85 : 0.45);
        g.fillText(ROMAN[i + 1], mx, my + 1);
        g.textAlign = 'left';
        g.textBaseline = 'alphabetic';
      }
    }
    // the payline: a bar between two pointers, white while the line pays
    const ly = y + pad + ch / 2;
    const col = win ? '#ffffff' : paying ? RED : CRIMSON;
    if (paying) {
      g.fillStyle = INK;
      g.fillRect(x + pad - 2, ly - 2, W - pad * 2 + 4, 4);
      g.fillStyle = col;
      g.fillRect(x + pad - 2, ly - 1, W - pad * 2 + 4, 2);
    }
    for (const [px, dir] of [[x + 2, 1], [x + W - 2, -1]]) {
      g.beginPath();
      g.moveTo(px, ly - 5);
      g.lineTo(px + dir * (pad + 1), ly);
      g.lineTo(px, ly + 5);
      g.closePath();
      g.fillStyle = col;
      g.fill();
      inkLine(g, 1.4);
      g.stroke();
    }
    return { w: W, h: H };
  }

  // Progress to re-arming, in pips: brass as they fill, lantern-and-white once the reels are armed.
  function drawChargeBar(g, reels, x, y, w, now) {
    const armed = reels.armed === true;
    const need = reels.need > 0 ? reels.need : 0;
    const n = need >= 2 && need <= 14 ? Math.round(need) : 10;
    const frac = armed ? 1 : need > 0 ? clamp(reels.charge / need, 0, 1) : 0;
    const litN = armed ? n : Math.floor(frac * n + 1e-6);
    const hotOn = Math.floor(now / 260) % 2 === 0;
    rr(g, x, y, w, 6, 3);
    g.fillStyle = INK;
    g.fill();
    const sw = (w - 3) / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle = i < litN ? (armed ? (hotOn ? WHITE : LANTERN) : BRASS_HI) : '#2f2877';
      g.fillRect(x + 2 + i * sw, y + 1.5, sw - 1.5, 3);
    }
  }

  // ─────────── the one button ───────────
  // A cel cap in a brass bezel. The plunger is a smooth ring with an orange cap; the lever is
  // a toothed ring, and its cap's colour says what a press will cost: crimson for marks, gold
  // when it is free, plum when the Mint must lend, sea-green when the town's hat is coming.

  const CAPS = {
    launch: { cap: LANTERN, lo: '#d1481c', text: INK, cog: false, halo: LANTERN },
    idle: { cap: '#2f2a7a', lo: '#1c1850', text: A(PAPER, 0.6), cog: false, halo: null },
    busy: { cap: '#2f2a7a', lo: '#1c1850', text: PAPER, cog: true, halo: null },
    lever: { cap: CRIMSON, lo: '#8f1030', text: WHITE, cog: true, halo: RED },
    free: { cap: BRASS_HI, lo: '#e08a1c', text: INK, cog: true, halo: BRASS_HI },
    loan: { cap: '#7a1440', lo: '#450a2c', text: WHITE, cog: true, halo: CRIMSON },
    credit: { cap: PALETTE.sea, lo: PALETTE.seaDeep, text: WHITE, cog: true, halo: THREADS.commons.color },
  };

  function paintCap(c, kind, r, m) {
    const k = CAPS[kind];
    c.fillStyle = '#04031c';
    c.beginPath();
    c.arc(m + 2, m + 5, r, 0, TAU);
    c.fill();
    const bezel = k.cog ? (p) => starPath(p, m, m, r - 3.5, r + 0.5, 16, 0) : circ(m, m, r);
    cel(c, bezel, BRASS, HUD_L, { off: 5, ink: 2.8, shadow: '#b06a1c', rim: 2, rimCol: WHITE });
    c.beginPath();
    c.arc(m, m, r - 6.5, 0, TAU);
    c.fillStyle = INK;
    c.fill();
    const dr = r - 9.5;
    cel(c, circ(m, m, dr), k.cap, HUD_L, { off: dr * 0.24, shadow: k.lo, ink: 2,
      hi: (p) => { p.ellipse(m - dr * 0.36, m - dr * 0.5, dr * 0.34, dr * 0.12, -0.62, 0, TAU); }, hiCol: kind === 'idle' || kind === 'busy' ? A(WHITE, 0.25) : WHITE });
    // what the cap does, as a mark over its lettering
    const gy = m - dr * 0.56;
    if (kind === 'launch' || kind === 'idle') chevron(c, m, gy + 1, -Math.PI / 2, 5.5, k.text, 0);
    else if (kind === 'lever') chevron(c, m, gy, Math.PI / 2, 5.5, k.text, 0);
    else if (kind === 'free') glint(c, m, gy, 8, INK, 1, 0);
    else if (kind === 'loan') {
      c.beginPath();
      c.arc(m, gy, 4.5, 0, TAU);
      c.fillStyle = BRASS_HI;
      c.fill();
      inkLine(c, 1.5);
      c.stroke();
    } else if (kind === 'credit') {
      // the hat that goes round
      c.fillStyle = k.text;
      c.beginPath();
      c.arc(m, gy + 2, 5, Math.PI, 0);
      c.closePath();
      c.fill();
      c.fillRect(m - 8.5, gy + 1.5, 17, 2.4);
    }
  }

  function drawLaunch(g, b, state, now) {
    const { x, y, r } = b;
    const k = CAPS[state.kind];
    if (!k) throw new Error(`render: no button face for launch state '${state.kind}'`);
    const live = state.kind !== 'idle' && state.kind !== 'busy';
    const pulse = stepped(0.5 + 0.5 * Math.sin(now / 300), 2);
    const bx = r * 2 + 24;
    if (live) {
      bloom(g, x, y, r * 1.55, k.halo, 0.55 + 0.35 * pulse);
      if (state.kind === 'free') rays(g, x, y, r + 1, r + 9, 10, now / 1100, BRASS_HI);
    }
    const sink = state.charge > 0 ? 2 : 0;
    g.drawImage(layer(`cap:${state.kind}:${r}`, bx, bx, view.ds, (c) => paintCap(c, state.kind, r, bx / 2)), x - bx / 2, y - bx / 2 + sink, bx, bx);

    // charge: a ring closing round the bezel, white when full
    const ring = (frac, col) => {
      g.lineCap = 'butt';
      g.beginPath();
      g.arc(x, y + sink, r - 3.2, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
      g.strokeStyle = INK;
      g.lineWidth = 7.5;
      g.stroke();
      g.strokeStyle = col;
      g.lineWidth = 4.5;
      g.stroke();
    };
    if (state.kind === 'launch' && state.charge > 0) ring(state.charge, state.charge > 0.92 ? '#ffffff' : WHITE);
    else if (live) {
      g.strokeStyle = A(WHITE, pulse >= 1 ? 0.9 : pulse > 0 ? 0.5 : 0.2);
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y, r + 4 + 2 * pulse, 0, TAU);
      g.stroke();
    }
    if (state.kind === 'credit') ring(state.hat, THREADS.commons.color); // when it closes the town's ball arrives

    let main;
    let sub;
    if (state.kind === 'launch') [main, sub] = ['LAUNCH', state.charge > 0 ? `${Math.round(state.charge * 100)}%` : 'HOLD'];
    else if (state.kind === 'idle') [main, sub] = ['LAUNCH', ''];
    else if (state.kind === 'busy') [main, sub] = ['REELS', '●'.repeat(1 + (Math.floor(now / 300) % 3))];
    else if (state.kind === 'lever') [main, sub] = ['LEVER', `−${fmtInt(SPIN_COST)}`];
    else if (state.kind === 'free') [main, sub] = ['LEVER', 'FREE'];
    else if (state.kind === 'loan') [main, sub] = ['LOAN', `+${fmtInt(LOAN.marks)}`];
    else if (state.kind === 'credit') [main, sub] = ['BORROW', '+ PULL'];
    else throw new Error(`render: no button lettering for launch state '${state.kind}'`);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `700 ${r >= 44 ? 14 : 12}px ${MONO}`;
    g.fillStyle = k.text;
    g.fillText(main, x, y + sink + (sub ? 0 : 5));
    if (sub) {
      g.font = `700 ${r >= 44 ? 12 : MIN_TYPE}px ${MONO}`;
      g.fillText(sub, x, y + sink + 13);
    }
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
  }

  function drawMute(g, b, muted) {
    const { x, y, r } = b;
    const bx = r * 2 + 8;
    g.drawImage(layer(`mute:${r}`, bx, bx, view.ds, (c) => {
      const m = bx / 2;
      cel(c, circ(m, m, r), '#2f2a7a', HUD_L, { off: 3, ink: 2, shadow: '#1c1850' });
      const k = r / 16;
      c.fillStyle = PAPER;
      c.beginPath();
      c.moveTo(m - 7 * k, m - 3 * k);
      c.lineTo(m - 3.5 * k, m - 3 * k);
      c.lineTo(m + 0.5 * k, m - 6.5 * k);
      c.lineTo(m + 0.5 * k, m + 6.5 * k);
      c.lineTo(m - 3.5 * k, m + 3 * k);
      c.lineTo(m - 7 * k, m + 3 * k);
      c.closePath();
      c.fill();
    }), x - bx / 2, y - bx / 2, bx, bx);
    const k = r / 16;
    g.lineCap = 'round';
    if (muted) {
      g.strokeStyle = RED;
      g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(x + 3 * k, y - 3.5 * k);
      g.lineTo(x + 8 * k, y + 3.5 * k);
      g.moveTo(x + 8 * k, y - 3.5 * k);
      g.lineTo(x + 3 * k, y + 3.5 * k);
      g.stroke();
    } else {
      g.strokeStyle = PAPER;
      g.lineWidth = 1.6;
      g.beginPath();
      g.arc(x + 1 * k, y, 4 * k, -0.7, 0.7);
      g.stroke();
      g.beginPath();
      g.arc(x + 1 * k, y, 7.5 * k, -0.7, 0.7);
      g.stroke();
    }
  }

  // ─────────── portrait: the head of the table ───────────

  // What shows round the glass: night, with the cabinet's edge as one hard band.
  function paintFrameP(g, w, h) {
    g.fillStyle = '#07051c';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#0d0a2c';
    g.fillRect(0, 0, w * 0.5, h);
  }

  // The plate behind the hud and the story strip, in its own coordinates (0,0 = hud's corner).
  function paintHeadP(g, L) {
    const w = L.hud.w;
    const h = L.hud.h + L.story.h;
    g.fillStyle = PLATE;
    g.fillRect(0, 0, w, h);
    // the lamp over the reels: a hard wedge of light down the middle of the head
    g.save();
    g.beginPath();
    g.rect(0, 32, w, L.hud.h - 32);
    g.clip();
    shaft(g, w / 2, -70, Math.PI / 2, 190, 1.5, LANTERN, 0.2);
    g.restore();
    g.fillStyle = NIGHT;
    g.fillRect(0, 0, w, 32);
    g.fillRect(0, L.hud.h, w, L.story.h);
    g.fillStyle = INK;
    g.fillRect(0, 31, w, 2);
    g.fillStyle = INK;
    g.fillRect(0, L.hud.h - 1.5, w, 3);
    g.fillStyle = A(BRASS, 0.55);
    g.fillRect(0, L.hud.h - 0.5, w, 1);
    g.fillStyle = INK;
    g.fillRect(0, h - 5, w, 5);
    g.fillStyle = BRASS;
    g.fillRect(0, h - 4, w, 3);
    g.fillStyle = BRASS_HI;
    g.fillRect(0, h - 4, w, 1);
  }

  function cap(g, text, x, y, color = A(PAPER, 0.75), align = 'left') {
    g.font = `700 ${MIN_TYPE}px ${SERIF}`;
    g.fillStyle = color;
    return spaced(g, text, x, y, 2, align);
  }

  function writBalls(g, writs, x, y, r, step, maxN) {
    const showN = writs > maxN ? maxN - 1 : writs;
    for (let i = 0; i < Math.max(showN, 1); i++) {
      const bx = x + r + i * step;
      if (i < showN) g.drawImage(pearl(r), bx - r - 2, y - r - 2, r * 2 + 4, r * 2 + 4);
      else {
        g.beginPath();
        g.arc(bx, y, r - 0.5, 0, TAU);
        g.fillStyle = INK;
        g.fill();
        g.strokeStyle = RED;
        g.lineWidth = 1.5;
        g.stroke();
      }
    }
    return x + Math.max(showN, 1) * step;
  }

  function trustBar(g, econ, trust, x, y, w, h, now) {
    const tc = THREADS.commons.color;
    rr(g, x - 1.5, y - 1.5, w + 3, h + 3, h / 2 + 1.5);
    g.fillStyle = INK;
    g.fill();
    rr(g, x, y, w, h, h / 2);
    g.fillStyle = '#2f2877';
    g.fill();
    if (trust > 0) {
      const fw = Math.max(h, (w * trust) / 100);
      rr(g, x, y, fw, h, h / 2);
      g.fillStyle = tc;
      g.fill();
      g.fillStyle = '#ffc27a';
      g.fillRect(x + h / 2, y + 1, Math.max(0, fw - h), Math.max(1.5, h * 0.3));
    }
    // one aid ball per 25 trust: a lantern at each quarter
    const earned = Math.floor(econ.trust / 25);
    const flick = Math.floor(now / 300) % 2 === 0;
    for (let q = 1; q <= 4; q++) {
      const qx = x + (w * q) / 4 - (q === 4 ? 4 : 0);
      const state = q > earned ? 'unlit' : q <= econ.aidUsed ? 'spent' : 'lit';
      const ly = y + h / 2;
      if (state === 'lit') bloom(g, qx, ly, h + 7, LANTERN, flick ? 1 : 0.7);
      rr(g, qx - 3.5, ly - h / 2 - 3, 7, h + 6, 3);
      g.fillStyle = state === 'lit' ? WHITE : state === 'spent' ? '#7a4a1e' : PLATE;
      g.fill();
      g.strokeStyle = state === 'lit' ? LANTERN : INK;
      g.lineWidth = 1.6;
      g.stroke();
    }
  }

  // dy: how far the head has been pushed down to clear a notch. marquee: draw the top line.
  function drawHudP(g, L, dy, game, chapter, table, now, dt, marquee) {
    const hud = L.hud;
    const econ = game.econ;
    const reels = reelsOf(game);
    const y0 = hud.y + dy;
    g.drawImage(layer('headP', hud.w, hud.h + L.story.h, view.ds, (c) => paintHeadP(c, L)), hud.x, y0, hud.w, hud.h + L.story.h);

    // the top line: the score, and where we are. A notch may sit over it; nothing here is needed to play.
    if (marquee) {
      const score = ease('score', econ.score, dt);
      const sw = cap(g, 'SCORE', hud.x + 14, y0 + 22);
      g.font = `700 13px ${MONO}`;
      g.fillStyle = WHITE;
      g.fillText(fmtInt(score), hud.x + 14 + sw + 8, y0 + 22);
      g.font = `700 ${MIN_TYPE}px ${SERIF}`;
      g.fillStyle = BRASS_HI;
      const place = ellipsize(g, `${roman(chapter.number)} · ${String(table.name).toUpperCase()}`, 170);
      spaced(g, place, hud.x + hud.w - 14, y0 + 22, 1.5, 'right');
    }

    // the reels, in the middle of the head
    const cw = 48;
    const ch = 46;
    const gap = 4;
    const pad = 6;
    const ww = cw * 3 + gap * 2 + pad * 2;
    const wx = hud.x + (hud.w - ww) / 2;
    const wy = y0 + 37;
    drawReelWindow(g, game, wx, wy, cw, ch, gap, pad, now);
    drawChargeBar(g, reels, wx + 4, wy + ch + pad * 2 + 3, ww - 8, now);

    // boons: four lamps under the window, lit while in force
    {
      const lamps = boonsInForce(game);
      g.font = `700 ${MIN_TYPE}px ${MONO}`;
      g.textBaseline = 'middle';
      const texts = lamps.map(([name, , n, on]) => (on && n !== null ? `${name} ${n}` : name));
      const widths = texts.map((t) => g.measureText(t).width);
      const total = widths.reduce((s, w) => s + w, 0);
      const space = Math.max(6, (ww - total) / (lamps.length - 1));
      let cx = wx + Math.min(0, (ww - total - space * (lamps.length - 1)) / 2);
      lamps.forEach(([, col, , on], i) => {
        if (on) {
          rr(g, cx - 3, y0 + 105, widths[i] + 6, 13, 3);
          g.fillStyle = col;
          g.fill();
        }
        g.fillStyle = on ? INK : A(PAPER, 0.3);
        g.fillText(texts[i], cx, y0 + 112);
        cx += widths[i] + space;
      });
      g.textBaseline = 'alphabetic';
    }

    // left of the reels: marks, and what is owed
    const lx = hud.x + 14;
    const marks = ease('marks', econ.marks, dt);
    symbol(g, 'coin', lx + 6, y0 + 46, 6);
    cap(g, 'MARKS', lx + 17, y0 + 50);
    const mText = fmtInt(marks);
    const mult = game.boons && game.boons.mult > 1 && game.boons.multT > 0;
    const mSize = fitFont(g, mText, wx - lx - (mult ? 32 : 10), 25, (s) => `700 ${s}px ${MONO}`);
    g.fillStyle = INK;
    g.fillText(mText, lx + 1.5, y0 + 78.5);
    g.fillStyle = BRASS_HI;
    g.fillText(mText, lx, y0 + 77);
    if (mult) {
      const mw = g.measureText(mText).width;
      g.font = `700 12px ${MONO}`;
      g.fillStyle = LANTERN;
      g.fillText(`×${game.boons.mult}`, lx + mw + 4, y0 + 77 - (mSize - 12) * 0.2);
    }
    const debt = ease('debt', econ.debt, dt);
    if (econ.debt > 0) {
      g.font = `700 12px ${MONO}`;
      const text = `OWED ${fmtInt(Math.ceil(debt))}`;
      const tw = g.measureText(text).width;
      rr(g, lx - 3, y0 + 85, tw + 8, 15, 3);
      g.fillStyle = Math.floor(now / 500) % 2 ? CRIMSON : '#b01834';
      g.fill();
      g.fillStyle = WHITE;
      g.fillText(text, lx + 1, y0 + 96.5);
    } else {
      g.font = `italic 12px ${SERIF}`;
      g.fillStyle = A(PAPER, 0.5);
      g.fillText('no arrears', lx, y0 + 96);
    }

    // which way the whole book leans: the small scale, under the marks
    g.save();
    g.translate(wx - 26, y0 + 101);
    g.scale(0.56, 0.56);
    drawBalance(g, econ, 0, 0, now, dt);
    g.restore();

    // right of the reels: writs as balls, and trust. The last 46 px are the mute button's.
    const rx = wx + ww + 10;
    const rw = hud.x + hud.w - 46 - rx;
    cap(g, 'WRITS', rx, y0 + 50);
    const writs = Math.max(0, Math.floor(econ.writs));
    const endX = writBalls(g, writs, rx, y0 + 64, 6.5, 16, 4);
    if (writs > 4 || writs === 0) {
      g.font = `700 13px ${MONO}`;
      g.fillStyle = writs > 0 ? WHITE : RED;
      g.fillText(writs > 4 ? `×${writs}` : '0', endX + 3, y0 + 68.5);
    }
    const trust = clamp(ease('trust', econ.trust, dt), 0, 100);
    cap(g, 'TRUST', rx, y0 + 90, THREADS.commons.color);
    g.font = `700 13px ${MONO}`;
    g.fillStyle = WHITE;
    g.textAlign = 'right';
    g.fillText(String(Math.round(trust)), rx + rw, y0 + 90);
    g.textAlign = 'left';
    trustBar(g, econ, trust, rx, y0 + 98, rw, 7, now);
  }

  // ─────────── portrait: the story strip ───────────

  function pips(g, scene, game, right, y, now, maxW) {
    const th = THREADS[scene.thread];
    const prog = objectiveProgress(scene, game.hits, game.seq);
    const total = Math.max(1, prog.total);
    if (total > 12 || total * 11 > maxW) {
      g.font = `700 12px ${MONO}`;
      g.fillStyle = prog.complete ? th.color : PAPER;
      g.textAlign = 'right';
      g.fillText(`${prog.done}/${prog.total}`, right, y + 4);
      g.textAlign = 'left';
      return g.measureText(`${prog.done}/${prog.total}`).width;
    }
    const w = total * 11 - 3;
    for (let i = 0; i < total; i++) {
      const cx = right - w + 4 + i * 11;
      const filled = i < prog.done;
      const next = i === prog.done;
      g.beginPath();
      g.arc(cx, y, 4, 0, TAU);
      g.fillStyle = filled ? th.color : 'rgba(0,0,0,0.55)';
      g.fill();
      g.strokeStyle = filled ? A('#ffffff', 0.7) : A(th.color, next ? 0.6 + 0.4 * Math.sin(now / 170) : 0.4);
      g.lineWidth = filled ? 0.6 : 1.2;
      g.stroke();
    }
    return w;
  }

  // Wrap with a shorter first line (the speaker's name sits in the indent).
  function wrapIndent(g, text, maxW, indent) {
    const out = [];
    let line = '';
    for (const word of String(text).split(/\s+/)) {
      const next = line ? line + ' ' + word : word;
      if (line && g.measureText(next).width > maxW - (out.length === 0 ? indent : 0)) {
        out.push(line);
        line = word;
      } else line = next;
    }
    if (line) out.push(line);
    return out;
  }

  function reelsCaption(table, game) {
    const reels = reelsOf(game);
    const name = (id) => table.labels[id] || id;
    if (reels.phase === 'paying') return [reels.result.payout.name, BRASS_HI];
    if (reels.cells.some((c) => c.spin > 0)) return ['The reels turn.', A(PAPER, 0.7)];
    if (reels.armed) return [`Reels lit: shoot ${table.reels.spin.map(name).join(', ')}`, LANTERN];
    const held = reels.cells.filter((c) => c.sym !== null).length;
    if (held > 0) return [`${held} of 3 reels held. ${name(table.reels.fill[0])} lanes fill the rest.`, A(PAPER, 0.7)];
    return [`${name(table.reels.fill[0])} lanes fill the reels. Bumpers re-arm the spin.`, A(PAPER, 0.55)];
  }

  function drawStoryP(g, L, dy, content, game, fx, table, scene, threadCol, now) {
    const S = L.story;
    const y0 = S.y + dy;
    const right = S.x + S.w - 14;
    const line = fx.speaking;
    const level = clamp(fx.voiceLevel || 0, 0, 1);
    g.fillStyle = threadCol;
    g.fillRect(S.x, y0 + 1, 3, S.h - 4);
    let x0 = S.x + 14;

    if (line) {
      const who = content.cast[line.who];
      if (!who) throw new Error(`render: line '${line.id}' is spoken by unknown cast id '${line.who}'`);
      const ps = 50;
      const px = S.x + 11;
      const py = y0 + 7;
      g.save();
      rr(g, px, py, ps, ps, 6);
      g.clip();
      drawPortrait(g, who, px, py, ps, line.emote, level, now / 1000);
      if (line.fx === 'radio') {
        g.fillStyle = 'rgba(90,150,255,0.12)';
        g.fillRect(px, py, ps, ps);
      }
      g.restore();
      rr(g, px, py, ps, ps, 6);
      g.strokeStyle = line.fx === 'radio' ? THREADS.covert.color : A(who.color, 0.6 + 0.4 * level);
      g.lineWidth = 1.5 + level;
      g.stroke();
      x0 = px + ps + 10;
    }

    // line 1: thread, scene title, pips
    const y1 = y0 + 19;
    if (scene) {
      const th = THREADS[scene.thread];
      const pw = pips(g, scene, game, right, y1 - 4, now, 130);
      g.font = `700 ${MIN_TYPE}px ${MONO}`;
      g.fillStyle = th.color;
      const lw = spaced(g, th.label, x0, y1, 1.5);
      const room = right - pw - 12 - (x0 + lw + 8);
      fitFont(g, scene.title, room, 15, (s) => `600 ${s}px ${SERIF}`);
      g.fillStyle = '#fff6e0';
      g.fillText(ellipsize(g, scene.title, room), x0 + lw + 8, y1);
    } else {
      g.font = `italic 14px ${SERIF}`;
      g.fillStyle = A(PAPER, 0.6);
      g.fillText('The account for this chapter is closed.', x0, y1);
    }

    // lines 2 and 3: the voice if there is one, else the objective and the state of the reels
    const y2 = y0 + 38;
    const y3 = y0 + 55;
    if (line) {
      const who = content.cast[line.who];
      if (view.spoken.id !== line.id) view.spoken = { id: line.id, since: now };
      g.font = `600 13px ${SERIF}`;
      const nameW = g.measureText(who.name).width + 8;
      g.font = `13px ${SERIF}`;
      const lines = wrapIndent(g, line.text, right - x0, nameW);
      const pages = Math.ceil(lines.length / 2);
      const elapsed = Math.max(0, (now - view.spoken.since) / 1000);
      const page = Math.min(pages - 1, Math.floor((elapsed / lineSeconds(line)) * pages));
      if (page === 0) {
        g.font = `600 13px ${SERIF}`;
        g.fillStyle = line.fx === 'radio' ? THREADS.covert.color : who.color;
        g.fillText(who.name, x0, y2);
        g.font = `13px ${SERIF}`;
      }
      g.fillStyle = '#fff3d6';
      lines.slice(page * 2, page * 2 + 2).forEach((l, i) => g.fillText(l, x0 + (page === 0 && i === 0 ? nameW : 0), i === 0 ? y2 : y3));
      if (pages > 1) {
        // which part of the line this is
        for (let k = 0; k < pages; k++) {
          g.fillStyle = A(PAPER, k === page ? 0.8 : 0.25);
          g.fillRect(right - (pages - k) * 7 + 3, y0 + S.h - 6, 4, 2);
        }
      }
    } else {
      view.spoken = { id: null, since: now };
      if (scene) {
        g.font = `italic 13px ${SERIF}`;
        g.fillStyle = A(PAPER, 0.88);
        g.fillText(ellipsize(g, scene.hint, right - x0), x0, y2);
      }
      const [text, col] = reelsCaption(table, game);
      g.font = `12px ${SERIF}`;
      g.fillStyle = col;
      g.fillText(ellipsize(g, text, right - x0), x0, y3);
    }
  }


  // The button sits over the foot of the plunger lane. A ball waiting there is drawn again
  // on top of the button's rim, where it really is, so it is never hidden.
  function drawWaitingBall(g, b, T, table, game) {
    if (!game.phys) return;
    const r = table.ballRadius * T.scale;
    for (const ball of game.phys.balls) {
      if (ball.state !== 'plunger') continue;
      const x = T.x + ball.pos[0] * T.scale;
      const y = T.y + ball.pos[1] * T.scale;
      if (Math.hypot(x - b.x, y - b.y) > b.r + r + 8) continue;
      bloom(g, x, y, r * 2.4, LANTERN, 0.9);
      const rq = Math.round(r * 4) / 4;
      g.drawImage(pearl(rq), x - rq - 2, y - rq - 2, rq * 2 + 4, rq * 2 + 4);
    }
  }

  // Toasts, newest last, as stickers centred on cx from y downward. The kinds the pay plate
  // already names are left to it.
  function drawToasts(g, game, cx, y, maxW, maxN, threadCol, now) {
    const toasts = game.toasts || [];
    const live = new Set();
    toasts.filter((t) => !PLATE_KINDS.has(t.kind)).slice(-maxN).forEach((t, i) => {
      const key = `${t.kind}|${t.text}`;
      live.add(key);
      if (!view.toastSeen.has(key) || view.toastSeen.get(key) > now) view.toastSeen.set(key, now);
      const a = clamp((now - view.toastSeen.get(key)) / 160, 0, 1);
      const col = toastColor(t.kind, threadCol);
      const size = fitFont(g, t.text, maxW - 28, 14, (s) => `700 ${s}px ${SERIF}`);
      const text = ellipsize(g, t.text, maxW - 28);
      sticker(g, text, cx, y + 13 + i * 31 - (1 - a) * 7, { size, face: SERIF, fill: a < 1 ? WHITE : col, col: INK, padX: 13, h: 26, maxW, lineW: 2.2 });
    });
    for (const k of [...view.toastSeen.keys()]) if (!live.has(k)) view.toastSeen.delete(k);
  }

  // The payout, named on a plate hung under the story strip while the line pays: parchment
  // when it paid, plate-dark when it did not. It is 44 tall and stops short of the top lanes.
  // The core shows a paid line for PAY_SECONDS and then clears the cells; the plate stays
  // up for PLATE_MS so the name can be read, and returns whether it was drawn.
  function drawPayPlate(g, reels, cx, y, w, now) {
    if (reels.phase === 'paying') {
      if (view.plate.result !== reels.result) view.plate = { result: reels.result, since: now };
    } else if (view.plate.result && (now - view.plate.since > PLATE_MS || now < view.plate.since || reels.source !== null)) {
      view.plate = { result: null, since: 0 };       // read, or the reels are busy with a new line
    }
    if (!view.plate.result) return false;
    const payout = view.plate.result.payout;
    const win = pays(payout);
    const fresh = now - view.plate.since < 420 && Math.floor(now / 70) % 2 === 0;
    rr(g, cx - w / 2 + 2, y + 4, w, 44, 9);
    g.fillStyle = '#04031c';
    g.fill();
    rr(g, cx - w / 2, y, w, 44, 9);
    g.fillStyle = win ? (fresh ? '#ffffff' : PAPER) : PLATE;
    g.fill();
    g.strokeStyle = win ? INK : RED;
    g.lineWidth = win ? 2.6 : 2;
    g.stroke();
    g.textAlign = 'center';
    fitFont(g, payout.name, w - 20, 17, (s) => `700 ${s}px ${SERIF}`);
    g.fillStyle = win ? INK : A(PAPER, 0.9);
    g.fillText(payout.name, cx, y + 20);
    const gains = gainsOf(payout);
    g.font = `700 ${MIN_TYPE}px ${MONO}`;
    g.fillStyle = win ? '#b01834' : A(PAPER, 0.6);
    g.fillText(gains.length ? gains.join(' · ').toUpperCase() : 'NOTHING ALLOTTED', cx, y + 36, w - 16);
    g.textAlign = 'left';
    return true;
  }

  function drawPlayP(g, L, content, game, fx, dt) {
    const chapter = chapterOf(content, game);
    const table = tableOf(content, chapter);
    elemMap(table);
    const scene = currentScene(content, game);
    const lit = new Set(litIds(content, game));
    const threadCol = scene ? (THREADS[scene.thread] || {}).color : BRASS;
    if (!threadCol) throw new Error(`render: scene '${scene.id}' has unknown thread '${scene.thread}'`);
    const now = fx.timeMs;
    const safe = safeOf(fx);
    // The top line of the hud (32 px) is the only thing a notch may cover. A deeper inset
    // pushes the head down by the difference and the table shrinks to fit under it, its
    // foot where it was: the flippers and the outlanes do not move against the button,
    // and the controls stay where input has them.
    const marquee = safe.top <= 6;
    const dy = Math.max(0, safe.top - 32);
    const full = TH * L.table.scale;
    const ts = (L.table.scale * (full - dy)) / full;
    const T = { x: L.table.x + (TW * (L.table.scale - ts)) / 2, y: L.table.y + dy, scale: ts };

    // The frame: night and the two rails. Only what the head and the table leave showing is drawn.
    {
      const frame = layer(`frameP:${dy}`, L.W, L.H, view.ds, (c) => { paintFrameP(c, L.W, L.H); paintRails(c, T, L.H); });
      const k = view.ds;
      const strip = (x, y, w, h) => { if (w > 0 && h > 0) g.drawImage(frame, x * k, y * k, w * k, h * k, x, y, w, h); };
      const tw = TW * ts;
      strip(0, 0, L.W, L.hud.y + dy);
      strip(0, T.y, T.x, L.H - T.y);
      strip(T.x + tw, T.y, L.W - T.x - tw, L.H - T.y);
      strip(T.x, T.y + TH * ts, tw, L.H - T.y - TH * ts);
    }
    drawTableAt(g, L, T, content, game, fx, table, scene, lit, threadCol, dt);

    const state = launchState(content, game);
    const prompt = promptFor(state, true);
    if (prompt) {
      g.save();
      g.translate(T.x, T.y);
      g.scale(ts, ts);
      tableBanner(g, prompt[0], BANNER_Y, prompt[1], 0.75 + 0.25 * Math.sin(now / 260), Math.ceil(MIN_TYPE / ts));
      g.restore();
    }

    drawHudP(g, L, dy, game, chapter, table, now, dt, marquee);
    drawStoryP(g, L, dy, content, game, fx, table, scene, threadCol, now);
    // What the line paid hangs under the head, above the top lanes. Callouts go on the open
    // water of the lower field, between the lane mouths and the slingshots, where they cover
    // neither the lanes nor the flippers.
    drawPayPlate(g, reelsOf(game), L.W / 2, T.y + 5, 310, now);
    drawToasts(g, game, T.x + 187 * ts, T.y + TOAST_Y * ts, 300, 2, threadCol, now);
    drawLaunch(g, L.launch, state, now);
    drawWaitingBall(g, L.launch, T, table, game);
    drawMute(g, L.mute, Boolean(fx.muted));
  }
  const TOAST_Y = 504; // table space: under every table's ramp-mouth labels, over its name
  const BANNER_Y = 592; // the prompt (shown only while no ball is in play) sits under the toasts, across the slingshots

  function safeOf(fx) {
    const s = fx.safe;
    if (s === undefined || s === null) return { top: 0, bottom: 0 };
    if (!(s.top >= 0) || !(s.bottom >= 0)) throw new Error(`render: fx.safe must be { top, bottom } in logical px, got ${JSON.stringify(s)}`);
    return s;
  }
  // Which way the book leans: a pair of scales, and no words. The left pan holds every
  // trust the player has ever earned, the right pan every loan ever taken, weighed at
  // TRUST_PER_LOAN each: the same sum economy.leaning() does. Level is level; the heavier
  // pan hangs lower. It names no ending and shows no number.
  function drawBalance(g, econ, cx, cy, now, dt) {
    for (const f of ['trustEarned', 'loansTaken']) {
      if (typeof econ[f] !== 'number' || !Number.isFinite(econ[f])) {
        throw new Error(`render: econ.${f} must be a finite number to weigh, got ${String(econ[f])}`);
      }
    }
    const trustW = econ.trustEarned;
    const loanW = econ.loansTaken * TRUST_PER_LOAN;
    const diff = ease('lean', trustW - loanW, dt); // > 0: the commons pan is the heavier
    const MAX_TILT = 0.34; // radians
    const tilt = MAX_TILT * Math.tanh(diff / (TRUST_PER_LOAN * 2)) + 0.012 * Math.sin(now / 1100);
    const tc = THREADS.commons.color;
    const ARM = 28;
    const DROP = 17; // beam end to pan rim
    const PAN = 11; // pan half-width
    const pivot = [cx, cy - 15];
    const dx = Math.cos(tilt) * ARM;
    const dy = Math.sin(tilt) * ARM;
    // the left end sinks as the commons pan grows heavier
    const ends = [[cx - dx, pivot[1] + dy], [cx + dx, pivot[1] - dy]];

    // post, foot and beam: one ink pass, one brass pass
    const frame = () => {
      g.beginPath();
      g.moveTo(cx, pivot[1]);
      g.lineTo(cx, cy + 19);
      g.moveTo(cx - 11, cy + 20);
      g.lineTo(cx + 11, cy + 20);
      g.moveTo(ends[0][0], ends[0][1]);
      g.lineTo(ends[1][0], ends[1][1]);
    };
    frame();
    inkLine(g, 6);
    g.stroke();
    frame();
    inkLine(g, 2.8, BRASS);
    g.stroke();
    g.beginPath();
    g.arc(pivot[0], pivot[1], 3.4, 0, TAU);
    g.fillStyle = BRASS_HI;
    g.fill();
    inkLine(g, 1.5);
    g.stroke();

    // pans hang plumb from the beam ends, each with what has been put in it
    const fills = [1 - Math.exp(-trustW / 150), 1 - Math.exp(-loanW / 150)];
    ends.forEach(([ex, ey], side) => {
      const py = ey + DROP;
      const col = side === 0 ? tc : CRIMSON;
      const amount = fills[side];
      g.strokeStyle = STEEL;
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(ex, ey);
      g.lineTo(ex - PAN, py);
      g.moveTo(ex, ey);
      g.lineTo(ex + PAN, py);
      g.stroke();
      if (amount > 0.01) {
        // a mound that grows with the total: lamplight on the left, red coin on the right
        const h = 2.5 + amount * 8;
        if (side === 0) bloom(g, ex, py - h / 2, 8 + amount * 9, LANTERN, 0.5 + 0.4 * amount);
        g.fillStyle = col;
        g.beginPath();
        g.ellipse(ex, py, PAN - 2.5, h, 0, Math.PI, TAU);
        g.closePath();
        g.fill();
        g.fillStyle = side === 0 ? WHITE : '#ff8a96';
        g.beginPath();
        g.ellipse(ex - 2, py - h * 0.5, (PAN - 2.5) * 0.4, h * 0.3, 0, 0, TAU);
        g.fill();
      }
      g.beginPath();
      g.moveTo(ex - PAN, py);
      g.quadraticCurveTo(ex, py + 10, ex + PAN, py);
      g.closePath();
      g.fillStyle = amount > 0.01 ? BRASS_HI : BRASS;
      g.fill();
      inkLine(g, 1.8);
      g.stroke();
    });
    g.lineCap = 'butt';
  }

  // ─────────── wide: the frame, the story panel, the ledger ───────────

  function paintChrome(g, L) {
    const W = L.W;
    const H = L.H;
    const TX = L.table.x;
    g.fillStyle = '#07051c';
    g.fillRect(0, 0, W, H);
    for (const x of [L.story.x, L.hud.x]) {
      // a panel: a flat plate with a hard drop, an ink line, and the lamp's wedge across its head
      rr(g, x + 4, 15, 420, 780, 14);
      g.fillStyle = '#020110';
      g.fill();
      rr(g, x, 10, 420, 780, 14);
      g.fillStyle = PLATE;
      g.fill();
      g.save();
      g.clip();
      shaft(g, x + 210, -120, Math.PI / 2, 420, 1.3, LANTERN, 0.12);
      g.restore();
      rr(g, x + 1.5, 11.5, 417, 777, 13);
      g.strokeStyle = INK;
      g.lineWidth = 4;
      g.stroke();
      rr(g, x + 5, 15, 410, 770, 10);
      g.strokeStyle = BRASS;
      g.lineWidth = 1.5;
      g.stroke();
      for (const [sx, sy] of [[x + 15, 25], [x + 405, 25], [x + 15, 775], [x + 405, 775]]) {
        g.beginPath();
        g.arc(sx, sy, 3.4, 0, TAU);
        g.fillStyle = BRASS_HI;
        g.fill();
        inkLine(g, 1.4);
        g.stroke();
      }
    }
    g.fillStyle = NIGHT;
    g.fillRect(TX, 0, TW, H);
    paintRails(g, L.table, H);
  }

  function drawStoryW(g, L, content, game, fx, chapter, scene, table, threadCol, state) {
    // written against a panel whose corner is (10, 10)
    const X = 30;
    const R = 410;
    const PW = R - X;
    const now = fx.timeMs;
    g.save();
    g.translate(L.story.x - 10, L.story.y - 10);

    // masthead
    g.font = `600 11px ${SERIF}`;
    g.fillStyle = A(BRASS, 0.8);
    spaced(g, 'THE LONG SETTLEMENT', 220, 40, 4.5, 'center');
    g.strokeStyle = A(BRASS, 0.3);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(X, 52.5);
    g.lineTo(R, 52.5);
    g.stroke();

    // chapter
    g.font = `600 12px ${SERIF}`;
    g.fillStyle = BRASS;
    spaced(g, `CHAPTER ${roman(chapter.number)}`, X, 78, 3);
    g.font = `12px ${SERIF}`;
    g.fillStyle = A(PAPER, 0.45);
    g.textAlign = 'right';
    g.fillText(table.name, R, 78);
    g.textAlign = 'left';
    fitFont(g, chapter.title, PW, 31, (s) => `600 ${s}px ${SERIF}`);
    g.fillStyle = PAPER;
    g.fillText(chapter.title, X, 112);
    fitFont(g, chapter.subtitle, PW, 15, (s) => `italic ${s}px ${SERIF}`);
    g.fillStyle = A(PAPER, 0.6);
    g.fillText(chapter.subtitle, X, 134);

    // scene card
    rr(g, X - 8, 150, PW + 16, 168, 8);
    g.fillStyle = NIGHT;
    g.fill();
    g.strokeStyle = A(threadCol, 0.35);
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = threadCol;
    g.fillRect(X - 8, 162, 3, 144);

    if (scene) {
      const th = THREADS[scene.thread];
      if (!th) throw new Error(`render: scene '${scene.id}' has unknown thread '${scene.thread}'`);
      // badge
      g.font = `700 11px ${MONO}`;
      const bw = g.measureText(th.label).width + 2.5 * (th.label.length - 1) + 22;
      rr(g, X + 4, 162, bw, 20, 10);
      g.fillStyle = A(th.color, 0.16);
      g.fill();
      g.strokeStyle = A(th.color, 0.85);
      g.stroke();
      g.fillStyle = th.color;
      spaced(g, th.label, X + 4 + bw / 2, 176, 2.5, 'center');
      g.font = `italic 12px ${SERIF}`;
      g.fillStyle = A(th.color, 0.7);
      g.fillText(th.gloss, X + 4 + bw + 10, 176);
      g.font = `11px ${MONO}`;
      g.fillStyle = A(PAPER, 0.4);
      g.textAlign = 'right';
      g.fillText(`${game.scene + 1}/${chapter.scenes.length}`, R, 176);
      g.textAlign = 'left';

      fitFont(g, scene.title, PW - 8, 25, (s) => `600 ${s}px ${SERIF}`);
      g.fillStyle = '#fff6e0';
      g.fillText(scene.title, X + 4, 214);

      g.font = `16px ${SERIF}`;
      g.fillStyle = A(PAPER, 0.82);
      const hl = wrap(g, scene.hint, PW - 8).slice(0, 2);
      hl.forEach((l, i) => g.fillText(l, X + 4, 240 + i * 21));

      // progress
      const prog = objectiveProgress(scene, game.hits, game.seq);
      const py = 294;
      const obj = scene.objective;
      if (obj.kind === 'sequence') {
        // the route, in order
        const full = obj.ids.map((id) => table.labels[id] || id);
        let names = full;
        let size = 11;
        const widthAt = (s) => {
          g.font = `700 ${s}px ${MONO}`;
          return names.reduce((w, n) => w + g.measureText(n).width + 16, 0) + 14 * (names.length - 1);
        };
        // a long route keeps its type size and shortens its names
        for (let keep = 10; keep >= 2 && widthAt(size) > PW - 8; keep--) names = full.map((n) => n.slice(0, keep));
        g.font = `700 ${size}px ${MONO}`;
        let cx = X + 4;
        names.forEach((n, i) => {
          const w = g.measureText(n).width + 16;
          const state = i < prog.done ? 'done' : i === prog.done ? 'next' : 'todo';
          rr(g, cx, py - 11, w, 22, 5);
          g.fillStyle = state === 'done' ? A(th.color, 0.85) : state === 'next' ? A(th.color, 0.12 + 0.14 * (0.5 + 0.5 * Math.sin(now / 170))) : 'rgba(0,0,0,0.35)';
          g.fill();
          g.strokeStyle = state === 'todo' ? A(PAPER, 0.25) : th.color;
          g.stroke();
          g.fillStyle = state === 'done' ? '#120c06' : state === 'next' ? th.color : A(PAPER, 0.45);
          g.textBaseline = 'middle';
          g.fillText(n, cx + 8, py + 0.5);
          g.textBaseline = 'alphabetic';
          cx += w;
          if (i < names.length - 1) {
            g.fillStyle = A(PAPER, 0.4);
            g.fillText('›', cx + 4, py + 4);
            cx += 14;
          }
        });
      } else if (obj.kind === 'all' || obj.kind === 'count') {
        const total = Math.max(1, prog.total);
        const room = PW - 70;
        if (total <= 20) {
          const step = Math.min(22, room / total);
          const rad = Math.min(6.5, step / 2 - 1.5);
          for (let i = 0; i < total; i++) {
            const cx = X + 4 + rad + i * step;
            const filled = i < prog.done;
            if (filled) glow(g, cx, py, rad * 2.6, th.color, 0.4);
            g.beginPath();
            g.arc(cx, py, rad, 0, TAU);
            g.fillStyle = filled ? th.color : 'rgba(0,0,0,0.5)';
            g.fill();
            g.strokeStyle = filled ? '#fff' : A(th.color, i === prog.done ? 0.9 : 0.4);
            g.lineWidth = filled ? 0.6 : 1.2;
            g.stroke();
          }
        } else {
          rr(g, X + 4, py - 5, room, 10, 5);
          g.fillStyle = 'rgba(0,0,0,0.5)';
          g.fill();
          g.strokeStyle = A(th.color, 0.5);
          g.stroke();
          rr(g, X + 4, py - 5, Math.max(10, (room * prog.done) / total), 10, 5);
          g.fillStyle = th.color;
          g.fill();
        }
        g.font = `600 14px ${MONO}`;
        g.fillStyle = prog.complete ? th.color : A(PAPER, 0.8);
        g.textAlign = 'right';
        g.fillText(`${prog.done}/${prog.total}`, R, py + 5);
        g.textAlign = 'left';
      } else {
        throw new Error(`render: scene '${scene.id}' has unknown objective kind '${obj.kind}'`);
      }
    } else {
      g.font = `italic 17px ${SERIF}`;
      g.fillStyle = A(PAPER, 0.55);
      g.fillText('The account for this chapter is closed.', X + 4, 238);
    }

    // the voice
    const line = fx.speaking;
    const vy = 334;
    const level = clamp(fx.voiceLevel || 0, 0, 1);
    if (line) {
      const who = content.cast[line.who];
      if (!who) throw new Error(`render: line '${line.id}' is spoken by unknown cast id '${line.who}'`);
      const radio = line.fx === 'radio';
      // portrait in a brass frame
      const ps = 92;
      g.save();
      rr(g, X, vy, ps, ps, 8);
      g.fillStyle = '#0b0806';
      g.fill();
      g.clip();
      drawPortrait(g, who, X, vy, ps, line.emote, level, now / 1000);
      if (radio) {
        g.fillStyle = 'rgba(90,150,255,0.10)';
        g.fillRect(X, vy, ps, ps);
        g.fillStyle = 'rgba(0,0,0,0.22)';
        for (let yy = vy + ((now / 40) % 4); yy < vy + ps; yy += 4) g.fillRect(X, yy, ps, 1);
      }
      g.restore();
      rr(g, X, vy, ps, ps, 8);
      g.strokeStyle = brassGrad(g, X, vy, X + ps, vy + ps);
      g.lineWidth = 2;
      g.stroke();

      const nx = X + ps + 16;
      fitFont(g, who.name, R - nx, 21, (s) => `600 ${s}px ${SERIF}`);
      g.fillStyle = who.color;
      g.fillText(who.name, nx, vy + 22);
      g.font = `italic 13px ${SERIF}`;
      g.fillStyle = A(PAPER, 0.55);
      const roleLines = wrap(g, who.role, R - nx).slice(0, 2);
      roleLines.forEach((l, i) => g.fillText(l, nx, vy + 42 + i * 16));
      if (radio) {
        g.font = `700 11px ${MONO}`;
        g.fillStyle = THREADS.covert.color;
        spaced(g, '◉ OVER THE LINE', nx, vy + 46 + roleLines.length * 16, 1.5);
      }
      // waveform
      const wy = vy + ps - 10;
      const bars = 30;
      const bw = (R - nx) / bars;
      for (let i = 0; i < bars; i++) {
        const n = 0.5 + 0.5 * Math.sin(now / 90 + i * 1.7) * Math.sin(now / 53 + i * 0.6);
        const jitter = radio ? hash(i + Math.floor(now / 60)) * 0.3 : 0;
        const h = 2 + (level * (0.35 + 0.65 * n) + jitter * 0.4) * 22;
        g.fillStyle = A(radio ? THREADS.covert.color : who.color, 0.35 + 0.6 * level);
        g.fillRect(nx + i * bw, wy - h / 2, Math.max(1.5, bw - 2.5), h);
      }
      // subtitle
      g.font = `18px ${SERIF}`;
      let lines = wrap(g, line.text, PW);
      let lh = 25;
      if (lines.length > 6) {
        g.font = `16px ${SERIF}`;
        lines = wrap(g, line.text, PW);
        lh = 22;
      }
      g.fillStyle = '#fff3d6';
      lines.slice(0, 7).forEach((l, i) => g.fillText(l, X, vy + ps + 34 + i * lh));
    } else {
      // nobody is speaking: a resting line
      g.strokeStyle = A(BRASS, 0.22);
      g.lineWidth = 1;
      g.beginPath();
      for (let x = X; x <= R; x += 4) {
        const y = vy + 46 + Math.sin(x / 13 + now / 900) * 2.2 * Math.sin(x / 61);
        if (x === X) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
      g.font = `italic 13px ${SERIF}`;
      g.fillStyle = A(PAPER, 0.28);
      g.textAlign = 'center';
      g.fillText('The Line is quiet.', 220, vy + 76);
      g.textAlign = 'left';
    }

    // toasts
    const toasts = game.toasts || [];
    const live = new Set();
    const shown = toasts.slice(-3);
    shown.forEach((t, i) => {
      const key = `${t.kind}|${t.text}`;
      live.add(key);
      if (!view.toastSeen.has(key) || view.toastSeen.get(key) > now) view.toastSeen.set(key, now);
      const age = (now - view.toastSeen.get(key)) / 1000;
      const a = clamp(age / 0.18, 0, 1);
      const col = toastColor(t.kind, threadCol);
      const y = 608 + i * 34;
      const slide = (1 - a) * -18;
      rr(g, X - 8 + slide, y, PW + 16, 28, 6);
      g.fillStyle = `rgba(8,6,4,${0.75 * a})`;
      g.fill();
      g.strokeStyle = A(col, 0.6 * a);
      g.lineWidth = 1;
      g.stroke();
      g.fillStyle = A(col, a);
      g.fillRect(X - 8 + slide, y + 4, 3, 20);
      fitFont(g, t.text, PW - 8, 15, (s) => `600 ${s}px ${SERIF}`);
      g.fillText(t.text, X + 4 + slide, y + 19);
    });
    for (const k of [...view.toastSeen.keys()]) if (!live.has(k)) view.toastSeen.delete(k);


    // controls
    g.strokeStyle = A(BRASS, 0.25);
    g.beginPath();
    g.moveTo(X, 712.5);
    g.lineTo(R, 712.5);
    g.stroke();
    if (view.touch) {
      hintRow(g, [['key', 'Left half'], ['key', 'Right half'], ['txt', 'flip']], X, 732);
      hintRow(g, [['key', 'Button'], ['txt', state.kind === 'launch' || state.kind === 'idle' ? 'hold, release to launch' : 'the lever']], X, 762);
    } else {
      const cx = hintRow(g, [['key', '←'], ['key', '→'], ['txt', 'or'], ['key', 'Z'], ['key', '/'], ['txt', 'flip']], X, 732);
      hintRow(g, [['key', 'M'], ['txt', 'mute']], Math.max(cx + 4, 300), 732);
      hintRow(g, [['key', 'Space'], ['txt', state.kind === 'launch' || state.kind === 'idle' ? 'hold, release to launch' : 'pull the lever']], X, 762);
    }
    g.restore();
  }

  function drawLedgerW(g, game, econ, now, dt, X, R, y0) {
    const MIDX = (X + R) / 2;
    const w = R - X;
    // a ledger page
    rr(g, X, y0, w, 266, 8);
    g.fillStyle = NIGHT;
    g.fill();
    g.strokeStyle = A(BRASS, 0.4);
    g.lineWidth = 1;
    g.stroke();
    g.strokeStyle = A(BRASS, 0.13);
    for (const ly of [y0 + 68, y0 + 130, y0 + 204]) {
      g.beginPath();
      g.moveTo(X + 12, ly + 0.5);
      g.lineTo(R - 12, ly + 0.5);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(MIDX + 0.5, y0 + 12);
    g.lineTo(MIDX + 0.5, y0 + 124);
    g.stroke();

    const cap = (text, x, y, color = A(BRASS, 0.75)) => {
      g.font = `600 11px ${SERIF}`;
      g.fillStyle = color;
      spaced(g, text, x, y, 2.5);
    };
    const L = X + 16;
    const C = MIDX + 16;

    // marks
    const marks = ease('marks', econ.marks, dt);
    cap('MARKS', L, y0 + 24);
    g.font = `600 30px ${MONO}`;
    g.fillStyle = BRASS_HI;
    g.fillText(fmtInt(marks), L, y0 + 56);
    if (game.boons && game.boons.mult > 1 && game.boons.multT > 0) {
      g.font = `700 13px ${MONO}`;
      g.fillStyle = LANTERN;
      g.textAlign = 'right';
      g.fillText(`×${game.boons.mult}`, MIDX - 12, y0 + 56);
      g.textAlign = 'left';
    }

    // writs
    cap('WRITS', C, y0 + 24);
    const writs = Math.max(0, Math.floor(econ.writs));
    // six fit beside a one-digit count; past six the count is '×nn' and needs the sixth's room
    const showN = writs > 6 ? 5 : writs;
    for (let i = 0; i < Math.max(showN, 1); i++) {
      const bx = C + 10 + i * 24;
      const by = y0 + 46;
      if (i < showN) {
        g.drawImage(pearl(9), bx - 11, by - 11, 22, 22);
      } else {
        g.strokeStyle = A(STEEL, 0.3);
        g.setLineDash([2, 3]);
        g.beginPath();
        g.arc(bx, by, 8.5, 0, TAU);
        g.stroke();
        g.setLineDash([]);
      }
    }
    g.font = `600 16px ${MONO}`;
    g.fillStyle = writs > 0 ? PAPER : A(RED, 0.9);
    g.textAlign = 'right';
    g.fillText(writs > 6 ? `×${writs}` : String(writs), R - 16, y0 + 52);
    g.textAlign = 'left';

    // score
    const score = ease('score', econ.score, dt);
    cap('SCORE', L, y0 + 88);
    g.font = `600 21px ${MONO}`;
    g.fillStyle = PAPER;
    g.fillText(fmtInt(score), L, y0 + 116);

    // debt
    const debt = ease('debt', econ.debt, dt);
    if (econ.debt > 0) {
      const throb = 0.75 + 0.25 * Math.sin(now / 300);
      cap('OWED TO THE MINT', C, y0 + 88, A(RED, 0.9));
      g.font = `600 21px ${MONO}`;
      g.fillStyle = A(RED, throb);
      g.fillText(fmtInt(Math.ceil(debt)), C, y0 + 116);
      g.font = `italic 11px ${SERIF}`;
      g.fillStyle = A(RED, 0.75);
      g.textAlign = 'right';
      g.fillText(`garnished ${Math.round(LOAN.garnish * 100)}%`, R - 16, y0 + 116);
      g.textAlign = 'left';
    } else {
      cap('OWED TO THE MINT', C, y0 + 88, A(PAPER, 0.35));
      g.font = `italic 15px ${SERIF}`;
      g.fillStyle = A(PAPER, 0.4);
      g.fillText('no arrears', C, y0 + 114);
    }

    // trust
    const trust = clamp(ease('trust', econ.trust, dt), 0, 100);
    const tc = THREADS.commons.color;
    cap('TRUST OF THE COMMONS', L, y0 + 150, A(tc, 0.9));
    g.font = `600 13px ${MONO}`;
    g.fillStyle = PAPER;
    g.textAlign = 'right';
    g.fillText(`${Math.round(trust)}/100`, R - 16, y0 + 151);
    g.textAlign = 'left';
    const bx = L;
    const bw = w - 32;
    const by = y0 + 162;
    rr(g, bx, by, bw, 12, 6);
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fill();
    g.strokeStyle = A(tc, 0.45);
    g.stroke();
    if (trust > 0) {
      g.save();
      rr(g, bx, by, bw, 12, 6);
      g.clip();
      g.fillStyle = tc;
      g.fillRect(bx, by, (bw * trust) / 100, 12);
      g.restore();
    }
    // one aid ball per 25 trust: a lantern at each quarter
    const earned = Math.floor(econ.trust / 25);
    for (let q = 1; q <= 4; q++) {
      const qx = bx + (bw * q) / 4 - (q === 4 ? 6 : 0);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(qx - 0.5, by, 1, 12);
      const state = q > earned ? 'unlit' : q <= econ.aidUsed ? 'spent' : 'lit';
      const ly = by + 6;
      if (state === 'lit') glow(g, qx, ly, 14, LANTERN, 0.55 + 0.2 * Math.sin(now / 250 + q));
      rr(g, qx - 4.5, ly - 9, 9, 18, 3.5);
      g.fillStyle = state === 'lit' ? '#ffd9a0' : state === 'spent' ? '#5a3c1e' : '#120c08';
      g.fill();
      g.strokeStyle = state === 'unlit' ? A(PAPER, 0.3) : A(tc, 1);
      g.lineWidth = 1;
      g.stroke();
    }
    g.font = `italic 11px ${SERIF}`;
    g.fillStyle = A(PAPER, 0.45);
    const left = Math.max(0, earned - econ.aidUsed);
    g.fillText(left > 0 ? `the town will cover ${left} lost ball${left === 1 ? '' : 's'}` : 'the Mint lends; the Commons gives', bx, by + 32);

    // the balance of the whole book stands at the right of the last row; boons keep to its left
    const BAL_W = 84;
    drawBalance(g, econ, R - 16 - BAL_W / 2, y0 + 236, now, dt);


    // boons
    cap('BOONS', L, y0 + 224);
    const chips = boonsInForce(game).filter((b) => b[3]);
    if (chips.length === 0) {
      g.font = `italic 14px ${SERIF}`;
      g.fillStyle = A(PAPER, 0.35);
      g.fillText('none in force', L, y0 + 248);
    }
    let cx = L;
    g.font = `700 ${MIN_TYPE}px ${MONO}`;
    for (const [name, col, n] of chips) {
      const text = n === null ? name : `${name} ${n}`;
      const cw = g.measureText(text).width + 16;
      rr(g, cx, y0 + 234, cw, 22, 11);
      g.fillStyle = A(col, 0.14);
      g.fill();
      g.strokeStyle = A(col, 0.8);
      g.lineWidth = 1;
      g.stroke();
      g.fillStyle = col;
      g.textBaseline = 'middle';
      g.fillText(text, cx + 8, y0 + 245.5);
      g.textBaseline = 'alphabetic';
      cx += cw + 6;
    }
  }

  // The right-hand panel: the reels in their window, what they paid, the button, the ledger.
  function drawHudW(g, L, game, chapter, table, state, now, dt) {
    const hud = L.hud;
    const X = hud.x + 16;
    const R = hud.x + hud.w - 16;
    const CX = (X + R) / 2;
    const reels = reelsOf(game);
    const paying = reels.phase === 'paying';
    const payout = paying ? reels.result.payout : null;
    const win = paying && pays(payout);

    litText(g, 'THE REELS OF ASSAY', CX - 16, hud.y + 36, { size: 17, gap: 4, fill: BRASS_HI, halo: 'rgba(255,170,80,0.5)', blur: 12 });
    g.font = `italic 12px ${SERIF}`;
    g.fillStyle = A(PAPER, 0.45);
    g.textAlign = 'center';
    g.fillText('Mint of Aurelle  ·  payable in calm', CX - 16, hud.y + 54);
    g.textAlign = 'left';

    const cw = 104;
    const ch = 96;
    const gap = 10;
    const pad = 12;
    const ww = cw * 3 + gap * 2 + pad * 2;
    const wx = CX - ww / 2;
    const wy = hud.y + 68;
    if (win) glow(g, CX, wy + 60, 240, LANTERN, 0.2 + 0.1 * Math.sin(now / 120));
    drawReelWindow(g, game, wx, wy, cw, ch, gap, pad, now);
    drawChargeBar(g, reels, wx + 8, wy + ch + pad * 2 + 6, ww - 16, now);

    // payout plate
    const py = hud.y + 206;
    rr(g, X, py, R - X, 96, 8);
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.fill();
    g.strokeStyle = A(BRASS, win ? 0.7 : 0.25);
    g.lineWidth = 1;
    g.stroke();
    g.textAlign = 'center';
    if (paying) {
      fitFont(g, payout.name, R - X - 28, 21, (s) => `600 ${s}px ${SERIF}`);
      g.fillStyle = win ? A(BRASS_HI, 0.75 + 0.25 * Math.sin(now / 90)) : A(PAPER, 0.6);
      g.fillText(payout.name, CX, py + 27);
      g.font = `italic 14px ${SERIF}`;
      g.fillStyle = A(PAPER, 0.78);
      wrap(g, payout.blurb, R - X - 32).slice(0, 2).forEach((l, i) => g.fillText(l, CX, py + 48 + i * 17));
      const gains = gainsOf(payout);
      g.font = `600 12px ${MONO}`;
      g.fillStyle = win ? LANTERN : A(PAPER, 0.4);
      g.fillText(gains.length ? gains.join('  ·  ') : 'nothing allotted', CX, py + 86, R - X - 24); // pts.*maxWidth
    } else {
      const [text, col] = reelsCaption(table, game);
      g.font = `italic 17px ${SERIF}`;
      g.fillStyle = A(PAPER, 0.75);
      g.fillText('Force is licensed. Writs are allotted by lot.', CX, py + 36);
      fitFont(g, text, R - X - 28, 14, (s) => `${s}px ${SERIF}`);
      g.fillStyle = col;
      g.fillText(text, CX, py + 66);
    }
    g.textAlign = 'left';

    // the button's plate: what it is now, in words, beside it
    const by = hud.y + 312;
    rr(g, X, by, R - X, 180, 8);
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fill();
    g.strokeStyle = A(BRASS, 0.2);
    g.stroke();
    const lever = state.kind !== 'launch' && state.kind !== 'idle';
    g.font = `600 ${MIN_TYPE}px ${SERIF}`;
    g.fillStyle = A(BRASS, 0.8);
    spaced(g, lever ? 'THE LEVER' : 'THE PLUNGER', X + 16, by + 30, 2.5);
    g.font = `600 20px ${SERIF}`;
    g.fillStyle = PAPER;
    const heading = {
      launch: 'A ball is waiting.', idle: 'The Plumb is in play.', busy: 'The reels turn.',
      lever: 'No writ, no ball.', free: 'The Reels are yours tonight.', loan: 'No writ, and no marks.', credit: 'The town will cover this one.',
    }[state.kind];
    if (!heading) throw new Error(`render: no heading for launch state '${state.kind}'`);
    g.fillText(heading, X + 16, by + 62);
    const prompt = promptFor(state, view.touch);
    g.font = `15px ${SERIF}`;
    g.fillStyle = prompt ? prompt[1] : A(PAPER, 0.55);
    const words = prompt ? prompt[0] : game.econ.writs > 0 ? `${Math.floor(game.econ.writs)} writ${Math.floor(game.econ.writs) === 1 ? '' : 's'} in hand. One writ, one ball.` : 'The last writ is on the table.';
    wrap(g, /[.!?]$/.test(words) ? words : words + '.', 210).slice(0, 3).forEach((l, i) => g.fillText(l, X + 16, by + 90 + i * 20));
    g.font = `italic 12px ${SERIF}`;
    g.fillStyle = A(PAPER, 0.45);
    g.fillText(`A pull is ${fmtInt(SPIN_COST)} marks. The Mint lends ${fmtInt(LOAN.marks)} for ${fmtInt(LOAN.owed)}.`, X + 16, by + 164);

    drawLedgerW(g, game, game.econ, now, dt, X, R, hud.y + 502);
  }

  function drawPlayW(g, L, content, game, fx, dt) {
    const chapter = chapterOf(content, game);
    const table = tableOf(content, chapter);
    elemMap(table);
    const scene = currentScene(content, game);
    const lit = new Set(litIds(content, game));
    const threadCol = scene ? (THREADS[scene.thread] || {}).color : BRASS;
    if (!threadCol) throw new Error(`render: scene '${scene.id}' has unknown thread '${scene.thread}'`);
    const now = fx.timeMs;
    const state = launchState(content, game);

    // the frame either side of the glass; the table paints its own rectangle
    {
      const chrome = layer('chromeW', L.W, L.H, view.ds, (c) => paintChrome(c, L));
      const k = view.ds;
      const right = L.table.x + TW * L.table.scale;
      g.drawImage(chrome, 0, 0, L.table.x * k, L.H * k, 0, 0, L.table.x, L.H);
      g.drawImage(chrome, right * k, 0, (L.W - right) * k, L.H * k, right, 0, L.W - right, L.H);
    }
    drawTableAt(g, L, L.table, content, game, fx, table, scene, lit, threadCol, dt);
    const prompt = promptFor(state, view.touch);
    if (prompt) {
      g.save();
      g.translate(L.table.x, L.table.y);
      g.scale(L.table.scale, L.table.scale);
      tableBanner(g, prompt[0], 540, prompt[1], 0.75 + 0.25 * Math.sin(now / 260), Math.ceil(MIN_TYPE / L.table.scale));
      g.restore();
    }
    drawStoryW(g, L, content, game, fx, chapter, scene, table, threadCol, state);
    drawHudW(g, L, game, chapter, table, state, now, dt);
    drawLaunch(g, L.launch, state, now);
    drawMute(g, L.mute, Boolean(fx.muted));
  }


  // ─────────── title, chapter card, end: posters ───────────
  // One coast, at night, seen from the water. The lighthouse on the near rock is the key
  // light; the headlands go away to the left with a lamp on each, burning or out. The title
  // shows a coast with some of its lamps gone. The end shows it one of two ways, by which
  // way the ledger leans: every lamp lit and the water full of lanterns, or every lamp out
  // under the Mint's one cold flame.

  const COLD_L = light('#bfeaff', -Math.PI * 0.3, { depth: 0.9 });
  const COAST = {
    title: { key: 'title', tower: true, cold: false, lamps: [1, 0, 1, 1, 0, 1], adrift: 1 },
    // at the end the coast stands lower in an upright frame, under the ledger page
    commons: { key: 'commons', tower: true, cold: false, lamps: [1, 1, 1, 1, 1, 1], adrift: 1.6, low: true },
    mint: { key: 'mint', tower: false, cold: true, lamps: [0, 0, 0, 0, 0, 0], adrift: 0.5, low: true },
  };

  function coastGeom(L, v) {
    const P = L.kind === 'portrait';
    const hy = P ? (v.low ? 700 : 540) : 470;
    const tx = P ? (v.low ? 366 : 338) : 1096;
    const th = P ? 118 : 185;
    return { P, hy, tx, th, top: hy - 8 - th, lamp: [tx, hy - 8 - th - 16], cold: P ? [58, 70] : [L.W * 0.15, 150] };
  }

  function paintCoast(c, L, v) {
    const { W, H } = L;
    const G = coastGeom(L, v);
    const { hy, tx, th, top } = G;
    const key = v.cold ? COLD_L.col : LANTERN;
    const TL = v.cold ? COLD_L : HUD_L;
    bands(c, 0, 0, W, hy + 2, [NIGHT, '#141046', '#221968', v.cold ? '#262c7c' : '#3d2585', v.cold ? '#2f4a8c' : '#8f3a78'], [0.36, 0.6, 0.8, 0.93, 1]);
    for (let i = 0; i < 46; i++) {
      const x = hash(i) * W;
      const y = hash(i + 500) * hy * 0.76;
      if (i % 6 === 0) glint(c, x, y, 5 + hash(i + 9) * 5, WHITE, 0.9, 0);
      else {
        c.fillStyle = A(WHITE, 0.3 + 0.5 * hash(i + 300));
        c.fillRect(x, y, 2, 2);
      }
    }
    if (v.cold) {
      // the Mint's flame: cold, high, and the only light there is
      const [mx, my] = G.cold;
      rays(c, mx, my, 30, Math.hypot(W, H), 10, 0.25, A(key, 0.05));
      rings(c, mx, my, G.P ? 110 : 150, [A(key, 0.12), A(key, 0.2), A(key, 0.38)], [1, 0.64, 0.36]);
      burst(c, mx, my, 15, 30, 8, 0.2, COLD_L.rim, 0);
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(mx, my, 15, 0, TAU);
      c.fill();
      glint(c, mx, my, 48, '#ffffff', 1, 0);
    }
    // the sea, in flat scalloped bands that darken toward us
    const sea = ['#14337a', '#102b6c', '#0d245e', '#0a1d50', '#081742', '#061134', '#040c28', '#03081e'];
    c.fillStyle = sea[0];
    c.fillRect(0, hy, W, H - hy);
    // the coast going away to the left: three headlands, each a step paler than the one in front
    const heads = [[0.66, 20, '#2b2278'], [0.44, 36, '#1e1860'], [0.2, 60, '#130f48']];
    let lampN = 0;
    heads.forEach(([reach, h, col], k) => {
      const x1 = W * reach;
      const top2 = poly([[-4, hy + 3], [-4, hy - h * 0.7], [x1 * 0.3, hy - h], [x1 * 0.68, hy - h * 0.8], [x1 - W * 0.05, hy - h * 0.5], [x1, hy + 3]]);
      cel(c, top2, col, TL, { off: 5, ink: k === 2 ? 2.6 : 1.6, shadow: shade(col, 0.4) });
      for (const u of k === 0 ? [0.56, 0.78, 0.93] : k === 1 ? [0.62, 0.9] : [0.72]) {
        const lx = x1 * u;
        const ly = hy - h * (u < 0.7 ? 1 : u < 0.86 ? 0.82 : 0.56) - 2;
        const s = 1 + k * 0.6;
        const on = v.lamps[lampN++ % v.lamps.length];
        c.fillStyle = INK;
        c.fillRect(lx - s, ly - 5 * s, s * 2, 6 * s);
        if (on) {
          bloom(c, lx, ly - 6.5 * s, 9 * s, LANTERN, 1, WHITE);
          c.fillStyle = A(LANTERN, 0.8);
          c.fillRect(lx - 3 * s, hy + 6 + k * 5, 6 * s, 2);
        }
      }
    });
    for (let k = 0; k < 8; k++) {
      const y = hy + 12 + (k * k * (H - hy)) / 62;
      waves(c, 0, y, W, H - y, { len: 46 + k * 18, amp: 3 + k * 1.7, phase: hash(k + 60) * 3, col: sea[k], foam: k >= 2 && k <= 5 ? A(WHITE, 0.3 + k * 0.08) : false, every: 3 + (k % 2) });
    }
    // the lamp's road on the water
    for (let i = 0; i < 5; i++) {
      c.fillStyle = A(v.tower ? LANTERN : key, (v.tower ? 0.85 : 0.3) - i * 0.12);
      const x = v.tower ? tx : G.cold[0];
      if (hy + 16 + i * i * 4.4 < H) c.fillRect(x - (4 + i * 3), hy + 16 + i * i * 4.4, 8 + i * 6, 3 + i * 0.4);
    }
    // the rock and the tower
    cel(c, poly([[tx - 84, hy + 16], [tx - 58, hy - 8], [tx - 20, hy - 15], [tx + 26, hy - 11], [tx + 62, hy + 4], [tx + 90, hy + 18]]), '#130f48', TL, { off: 7, ink: 3, shadow: '#0a0828', rim: 2.4, rimCol: v.tower ? A(LANTERN, 0.9) : A(key, 0.5) });
    const w0 = th * 0.17;
    const w1 = th * 0.115;
    cel(c, poly([[tx - w0, hy - 8], [tx - w1, top], [tx + w1, top], [tx + w0, hy - 8]]), PAPER, TL, { off: w0 * 0.8, ink: 3, shadow: v.cold ? '#7f8fc4' : '#c79a86',
      hi: (p) => { p.rect(tx - w0, top + th * 0.18, w0 * 2, th * 0.17); p.rect(tx - w0, top + th * 0.56, w0 * 2, th * 0.17); }, hiCol: v.cold ? '#7a1f48' : CRIMSON });
    c.fillStyle = INK;
    c.fillRect(tx - w1 - 6, top - 5, w1 * 2 + 12, 6);
    c.fillRect(tx - 4, hy - 22, 8, 14);
    cel(c, box(tx - w1 + 1, top - 30, w1 * 2 - 2, 26, 3), v.tower ? WHITE : '#231d66', TL, { off: 0, ink: 3 });
    cel(c, poly([[tx - w1 - 4, top - 29], [tx, top - 30 - w1 * 1.5], [tx + w1 + 4, top - 29]]), v.cold ? '#7a1f48' : CRIMSON, TL, { off: 4, ink: 3 });
  }

  function drawCoast(g, L, now, v) {
    const { W, H } = L;
    const G = coastGeom(L, v);
    g.drawImage(layer(`coast:${v.key}:${L.kind}`, W, H, view.ds, (c) => paintCoast(c, L, v)), 0, 0, W, H);
    if (v.tower) {
      // the light: two hard beams that swing, stepped bloom, a white core
      const [lx, ly] = G.lamp;
      shaft(g, lx, ly, Math.PI + 0.1 + 0.2 * Math.sin(now / 2600), W, 0.2, LANTERN, 0.34);
      shaft(g, lx, ly, -0.16 + 0.14 * Math.sin(now / 3100 + 1), W * 0.5, 0.2, LANTERN, 0.34);
      const r = (G.P ? 56 : 78) * (1 + 0.05 * stepped(Math.sin(now / 400), 2));
      rings(g, lx, ly, r, [A(LANTERN, 0.16), A(LANTERN, 0.26), A(LANTERN, 0.5)], [1, 0.64, 0.36]);
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(lx, ly, G.P ? 8 : 11, 0, TAU);
      g.fill();
      glint(g, lx, ly, r * 0.5, '#ffffff', 1, 0);
    }
    // paper lanterns on the water: lit, or carried out dark
    const n = Math.round((G.P ? 13 : 24) * v.adrift);
    const lit = !v.cold;
    const sprite = layer(`adrift:${lit}`, 20, 30, view.ds, (c) => {
      cel(c, box(3, 4, 14, 18, 5), lit ? LANTERN : '#1c1a55', HUD_L, { off: 3, ink: 2, shadow: lit ? '#d1481c' : '#0e0c34' });
      if (lit) {
        c.fillStyle = WHITE;
        c.fillRect(7.5, 8, 5, 10);
      }
      c.fillStyle = INK;
      c.fillRect(6, 2, 8, 3);
    });
    for (let i = 0; i < n; i++) {
      const depth = hash(i + 11); // 0 far, 1 near
      const y = G.hy + 26 + depth * depth * (H - G.hy - 70);
      const drift = (now / 1000) * (3 + depth * 9) * (hash(i + 77) > 0.5 ? 1 : -1);
      const x = mod(hash(i + 23) * W + drift, W + 40) - 20;
      const k = 0.45 + depth * 0.9;
      if (lit) {
        g.fillStyle = A(LANTERN, 0.55);
        g.fillRect(x - 8 * k, y + 12 * k + 2, 16 * k, 2.5 * k);
      }
      g.drawImage(sprite, x - 10 * k, y - 15 * k + Math.round(Math.sin(now / 700 + i) * 1.5), 20 * k, 30 * k);
    }
  }

  // A flat brass rule with a lozenge on it.
  function rule(g, cx, y, half, a) {
    if (!(half > 0)) return;
    g.fillStyle = A(BRASS_HI, a);
    g.fillRect(cx - half, y, half * 2, 2);
    g.beginPath();
    poly([[cx, y - 5], [cx + 6, y + 1], [cx, y + 7], [cx - 6, y + 1]])(g);
    g.fill();
  }

  function drawTitle(g, L, fx) {
    const now = fx.timeMs;
    const { W, H } = L;
    const P = L.kind === 'portrait';
    const cx = W / 2;
    const safe = safeOf(fx);
    drawCoast(g, L, now, COAST.title);
    const ty = P ? Math.max(214, safe.top + 150) : 196; // baseline of the first title line
    g.font = `700 ${P ? 11 : 13}px ${SERIF}`;
    g.fillStyle = BRASS_HI;
    spaced(g, 'A TREATY  ·  A LOT  ·  A LEDGER', cx, ty - (P ? 66 : 100), P ? 3 : 5, 'center');
    const title = { size: P ? 48 : 92, gap: P ? 3 : 10, fill: WHITE, lo: BRASS_HI, drop: P ? 4 : 7, dropCol: CRIMSON };
    inkText(g, 'THE LONG', cx, ty, title);
    inkText(g, 'SETTLEMENT', cx, ty + (P ? 56 : 100), title);
    rule(g, cx, ty + (P ? 78 : 130), P ? 150 : 300, 1);
    g.font = `italic ${P ? 17 : 22}px ${SERIF}`;
    g.fillStyle = PAPER;
    g.textAlign = 'center';
    g.fillText('Every note reads: payable in calm.', cx, ty + (P ? 110 : 170));
    g.textAlign = 'left';

    const on = Math.floor(now / 520) % 2 === 0;
    const py = P ? 706 : 628;
    sticker(g, view.touch || P ? 'TAP TO OPEN THE ACCOUNT' : 'PRESS ENTER TO OPEN THE ACCOUNT', cx, py,
      { size: P ? 13 : 16, face: SERIF, fill: on ? WHITE : BRASS_HI, col: INK, gap: P ? 2.5 : 3.5, padX: P ? 16 : 22, h: P ? 36 : 42, lineW: 2.8 });
    if (!view.touch && !P) {
      const y = 730;
      let x = cx - 235;
      x = hintRow(g, [['key', 'Enter'], ['txt', 'begin']], x, y) + 14;
      x = hintRow(g, [['key', 'S'], ['txt', 'skip a scene']], x, y) + 14;
      hintRow(g, [['key', 'M'], ['txt', 'mute']], x, y);
    }
    g.font = `italic 13px ${SERIF}`;
    g.fillStyle = A(PAPER, 0.7);
    g.textAlign = 'center';
    g.fillText('A voiced story. Sound on.', cx, H - Math.max(30, safe.bottom + 16));
    g.textAlign = 'left';
    drawMute(g, L.mute, Boolean(fx.muted));
  }

  // What stands under a chapter's key light on its card, drawn about (0, 0) at scale k.
  function emblem(g, K, x, y, k) {
    const L = K.L;
    g.save();
    g.translate(x, y);
    g.scale(k, k);
    if (K.key === 'harbour') {
      inkLine(g, 2);
      g.beginPath();
      g.moveTo(-150, -86);
      g.quadraticCurveTo(-40, -30, 0, -58);
      g.quadraticCurveTo(70, -16, 150, -70);
      g.stroke();
      paperLamp(g, -98, -14, 20, K);
      paperLamp(g, 100, -2, 17, K);
      paperLamp(g, 0, 6, 56, K);
    } else if (K.key === 'mine') {
      bareLamp(g, 44, -66, 9, K, 8);
      for (const [sx, h, lean, tone] of [[-52, 96, -0.32, 0.2], [48, 78, 0.4, 0.35], [0, 150, 0.04, 0.5]]) {
        const w = h * 0.3;
        g.save();
        g.translate(sx, 84 - h / 2);
        g.rotate(lean);
        cel(g, poly([[0, -h / 2], [w, -h / 5], [w * 0.7, h / 2], [-w * 0.7, h / 2], [-w, -h / 5]]), blend(K.pool[2], '#bff0ff', tone), L, { off: w * 0.8, ink: 3, rim: 3, rimCol: '#ffffff',
          hi: (c) => { poly([[0, -h / 2], [w * 0.2, -h / 5], [w * 0.1, h / 2], [-w * 0.25, h / 2], [-w * 0.3, -h / 5]])(c); }, hiCol: A('#ffffff', 0.35) });
        g.restore();
      }
    } else if (K.key === 'parade') {
      bareLamp(g, 0, -44, 30, K, 0);
      g.fillStyle = INK;
      g.fillRect(-54, -92, 108, 9);
      g.fillRect(-4, -104, 8, 14);
      cel(g, poly([[-40, -84], [40, -84], [40, 96], [0, 66], [-40, 96]]), CRIMSON, L, { off: 12, ink: 3, shadow: '#8f1030', rim: 3 });
      g.fillStyle = BRASS_HI;
      g.fillRect(-16, -56, 32, 6);
      g.fillRect(-2.5, -56, 5, 54);
      g.beginPath();
      poly([[-13, -4], [13, -4], [13, 22], [0, 50], [-13, 22]])(g);
      g.fill();
      inkLine(g, 2);
      g.stroke();
    } else if (K.key === 'reef') {
      rings(g, 0, -6, 70, [A(L.col, 0.14), A(L.col, 0.26)], [1, 0.56]);
      for (const [rx, ry, r] of [[-86, 66, 40], [84, 72, 34], [0, 92, 58]]) {
        const pts = [];
        for (let i = 0; i < 9; i++) {
          const a = Math.PI + (i / 8) * Math.PI;
          pts.push([rx + Math.cos(a) * r * (0.8 + 0.3 * hash(i + r)), ry + Math.sin(a) * r * (0.5 + 0.3 * hash(i * 3 + r))]);
        }
        cel(g, poly(pts), '#141a40', { ...L, dx: -rx / 120, dy: -0.9 }, { off: 8, ink: 3, shadow: '#070a20', rim: 2.6, rimCol: A(L.col, 0.85) });
      }
      // the shuttered lamp: a dark lantern with one slit of fire
      g.fillStyle = INK;
      g.fillRect(-9, -62, 18, 12);
      cel(g, ell(0, -6, 32, 44), '#1c2258', L, { off: 9, ink: 3, shadow: '#0c0f30' });
      g.fillStyle = INK;
      g.fillRect(-6, -36, 12, 60);
      g.fillStyle = L.core;
      g.fillRect(-2.5, -32, 5, 52);
      glint(g, 0, -6, 15, L.col, 1, 0);
    } else if (K.key === 'exchange') {
      burst(g, 0, 0, 72, 112, 14, 0.1, A(L.col, 0.4), 0);
      rings(g, 0, 0, 84, [A(L.col, 0.2), A(L.col, 0.36)], [1, 0.6]);
      g.fillStyle = INK;
      g.fillRect(-7, -86, 14, 22);
      cel(g, (c) => { c.moveTo(-62, 54); c.quadraticCurveTo(-36, 34, -34, -30); c.quadraticCurveTo(-30, -70, 0, -72); c.quadraticCurveTo(30, -70, 34, -30); c.quadraticCurveTo(36, 34, 62, 54); c.closePath(); }, BRASS_HI, HUD_L, { off: 12, ink: 3, shadow: '#d1781c', rim: 3, rimCol: '#ffffff' });
      cel(g, circ(0, 62, 12), WHITE, HUD_L, { off: 3, ink: 3, shadow: BRASS });
    } else {
      throw new Error(`render: look '${K.key}' has no emblem`);
    }
    g.restore();
  }

  function paintCard(c, L, K, ex, ey, k) {
    const { W, H } = L;
    c.fillStyle = K.night;
    c.fillRect(0, 0, W, H);
    const R = Math.hypot(W, H) * 0.66;
    rings(c, ex, ey, R, K.pool, [1, 0.6, 0.3]);
    rays(c, ex, ey, 60 * k, R, 12, 0.13, A(K.L.col, 0.08));
    // the ground the chapter stands on: one hard dark shape, so the foot of the card is night
    c.fillStyle = A('#04031c', 0.62);
    c.beginPath();
    poly([[0, ey + 300 * k], [W, ey + 230 * k], [W, H], [0, H]])(c);
    c.fill();
    emblem(c, K, ex, ey, k);
  }

  function drawCard(g, L, content, game, fx) {
    const now = fx.timeMs;
    const { W, H } = L;
    const P = L.kind === 'portrait';
    const cx = W / 2;
    const cy = P ? 452 : 404;
    const safe = safeOf(fx);
    const chapter = chapterOf(content, game);
    const table = tableOf(content, chapter);
    const K = lookOf(table);
    const t = game.modeT;
    const a1 = clamp(t / 0.8, 0, 1);
    const a2 = clamp((t - 0.5) / 0.9, 0, 1);
    const a3 = clamp((t - 1.2) / 0.9, 0, 1);
    const barTop = P ? Math.max(90, safe.top) : 70;
    const barBot = P ? 150 : 40;
    const ek = P ? 1 : 1.1;
    const ey = cy - (P ? 204 : 196);
    g.fillStyle = '#04031c';
    g.fillRect(0, 0, W, H);
    g.globalAlpha = a1;
    g.drawImage(layer(`card:${table.id}:${L.kind}`, W, H, view.ds, (c) => paintCard(c, L, K, cx, ey, ek)), 0, 0, W, H);
    g.globalAlpha = a1;
    sticker(g, `CHAPTER ${roman(chapter.number)}`, cx, cy - (P ? 62 : 70), { size: P ? 13 : 16, face: SERIF, fill: BRASS_HI, col: INK, gap: P ? 4 : 6, padX: P ? 16 : 22, h: P ? 28 : 34, lineW: 2.6 });
    g.globalAlpha = 1;
    const size = fitFont(g, chapter.title, W - (P ? 56 : 220), P ? 46 : 78, (s) => `700 ${s}px ${SERIF}`);
    inkText(g, chapter.title, cx, cy + (P ? 10 : 30) + (1 - a2) * 10, { size, fill: WHITE, lo: K.L.rim, drop: P ? 4 : 6, dropCol: CRIMSON, alpha: a2 });
    g.textAlign = 'center';
    g.font = `italic ${P ? 17 : 24}px ${SERIF}`;
    g.fillStyle = A(PAPER, a3);
    wrap(g, chapter.subtitle, W - (P ? 60 : 280)).slice(0, 3).forEach((l, i) => g.fillText(l, cx, cy + (P ? 50 : 80) + i * (P ? 23 : 30)));
    g.textAlign = 'left';
    g.font = `700 ${P ? 11 : 12}px ${SERIF}`;
    g.fillStyle = A(K.cap, a3);
    spaced(g, String(table.name).toUpperCase(), cx, cy + (P ? 138 : 138), P ? 4 : 6, 'center');
    // letterbox bars
    g.fillStyle = '#04031c';
    g.fillRect(0, 0, W, barTop);
    g.fillRect(0, H - barBot, W, barBot);
    g.fillStyle = A(BRASS, a1);
    g.fillRect(0, barTop, W, 2);
    g.fillRect(0, H - barBot - 2, W, 2);
    if (t > 1.6) {
      g.globalAlpha = Math.floor(now / 520) % 2 ? 0.6 : 1;
      if (P) {
        g.font = `700 13px ${SERIF}`;
        g.fillStyle = BRASS_HI;
        spaced(g, 'TAP TO CONTINUE', cx, H - Math.max(84, safe.bottom + 60), 3, 'center');
      } else hintRow(g, [['key', view.touch ? 'Tap' : 'Enter'], ['txt', 'continue']], cx - 62, 782);
      g.globalAlpha = 1;
    }
  }

  function drawEnd(g, L, content, game, fx, dt) {
    const now = fx.timeMs;
    const { W, H } = L;
    const P = L.kind === 'portrait';
    const cx = W / 2;
    const safe = safeOf(fx);
    const e = game.econ;
    for (const f of ['trustEarned', 'loansTaken']) {
      if (!e || typeof e[f] !== 'number' || !Number.isFinite(e[f])) throw new Error(`render: econ.${f} must be a finite number to weigh, got ${String(e && e[f])}`);
    }
    // the coast as the ledger leaves it: the same sum the scales weigh, and no words for it
    const v = leaning(e) === 'commons' ? COAST.commons : COAST.mint;
    drawCoast(g, L, now, v);
    const top = P ? Math.max(120, safe.top + 60) : 110;
    g.font = `700 ${P ? 11 : 13}px ${SERIF}`;
    g.fillStyle = v.cold ? '#bfeaff' : BRASS_HI;
    spaced(g, 'THE LONG SETTLEMENT', cx, top, P ? 4 : 6, 'center');
    inkText(g, 'Here the ledger rests.', cx, top + (P ? 52 : 76), { size: P ? 33 : 54, fill: WHITE, lo: v.cold ? '#bfeaff' : BRASS_HI, drop: P ? 3 : 5, dropCol: v.cold ? '#2c5fa8' : CRIMSON });
    rule(g, cx, top + (P ? 72 : 104), P ? 150 : 280, 1);
    g.textAlign = 'center';
    g.font = `italic ${P ? 15 : 20}px ${SERIF}`;
    g.fillStyle = PAPER;
    wrap(g, 'The account is not closed. It is carried forward.', W - 60).forEach((l, i) => g.fillText(l, cx, top + (P ? 104 : 142) + i * 22));

    // the page: parchment, inked
    const pw = P ? W - 48 : 520;
    const px = cx - pw / 2;
    const py = top + (P ? 130 : 170);
    const rowH = P ? 42 : 40;
    const ph = rowH * 5 + 30;
    g.drawImage(layer(`page:${pw}:${ph}`, pw + 12, ph + 12, view.ds, (c) => {
      rr(c, 6, 8, pw, ph, 8);
      c.fillStyle = '#04031c';
      c.fill();
      cel(c, box(2, 2, pw, ph, 8), PAPER, HUD_L, { off: 6, shadow: '#dcc089', ink: 3 });
    }), px - 2, py - 2, pw + 12, ph + 12);
    const rows = [
      ['Score', fmtInt(e.score), INK],
      ['Marks in hand', fmtInt(e.marks), '#9a5a12'],
      ['Owed to the Mint', e.debt > 0 ? fmtInt(Math.ceil(e.debt)) : 'nothing', e.debt > 0 ? '#b01834' : A(INK, 0.6)],
      ['Trust of the Commons', `${Math.round(e.trust)} / 100`, '#c2500f'],
      ['Draws at the Reels', fmtInt(e.spins), INK],
    ];
    const inset = P ? 18 : 30;
    rows.forEach(([k, val, col], i) => {
      const y = py + 38 + i * rowH;
      g.textAlign = 'left';
      g.font = `${P ? 16 : 18}px ${SERIF}`;
      g.fillStyle = INK;
      g.fillText(k, px + inset, y);
      g.textAlign = 'right';
      g.font = `700 ${P ? 17 : 20}px ${MONO}`;
      g.fillStyle = col;
      g.fillText(val, px + pw - inset, y);
      if (i < rows.length - 1) {
        g.fillStyle = A(INK, 0.2);
        g.fillRect(px + inset, y + 13, pw - inset * 2, 1.5);
      }
    });
    // How the book stands as it is carried forward: the same wordless scales as the ledger's, larger.
    const sy = py + ph + (P ? 98 : 92);
    g.save();
    g.translate(cx, sy);
    g.scale(1.9, 1.9);
    drawBalance(g, e, 0, 0, now, dt);
    g.restore();
    g.textAlign = 'center';
    g.font = `italic ${P ? 14 : 17}px ${SERIF}`;
    g.fillStyle = A(PAPER, 0.85);
    wrap(g, `End of the chapters written so far: ${content.chapters.length}. The Circuit goes on.`, W - 60).forEach((l, i) => g.fillText(l, cx, py + ph + 30 + i * 20));
    g.textAlign = 'left';
    if (P) {
      sticker(g, 'TAP TO RETURN TO THE TITLE', cx, H - Math.max(64, safe.bottom + 44), { size: 13, face: SERIF, fill: Math.floor(now / 520) % 2 ? BRASS_HI : WHITE, col: INK, gap: 2.5, padX: 16, h: 36, lineW: 2.8 });
    } else if (view.touch) hintRow(g, [['key', 'Tap'], ['txt', 'return to the title']], cx - 96, 770);
    else hintRow(g, [['key', 'Enter'], ['txt', 'return to the title'], ['key', 'M'], ['txt', 'mute']], cx - 150, 770);
    drawMute(g, L.mute, Boolean(fx.muted));
  }

  // ─────────── entry point ───────────

  function draw(content, game, fx, layout) {
    const L = layout;
    if (!L || (L.kind !== 'portrait' && L.kind !== 'wide')) throw new Error(`render: draw needs a layout from computeLayout, got ${JSON.stringify(L && L.kind)}`);
    if (!fx || typeof fx.timeMs !== 'number') throw new Error(`render: fx.timeMs must be a number, got ${fx && String(fx.timeMs)}`);
    const sx = canvas.width / L.W;
    const sy = canvas.height / L.H;
    // layers are painted for one resolution; a resize or a turn of the phone starts them again
    if (Math.abs(sx - view.ds) > 1e-3) {
      view.layers.clear();
      view.ds = sx;
    }
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    if (game.mode === 'cine') {
      view.lastMs = fx.timeMs;
      drawCinema(ctx, content, game, fx, L);
      return;
    }

    const dt = view.lastMs === null ? 0 : clamp((fx.timeMs - view.lastMs) / 1000, 0, 0.1);
    view.lastMs = fx.timeMs;

    ctx.save();
    if (game.mode === 'title') drawTitle(ctx, L, fx);
    else if (game.mode === 'card') drawCard(ctx, L, content, game, fx);
    else if (game.mode === 'end') drawEnd(ctx, L, content, game, fx, dt);
    else if (game.mode === 'play') {
      if (L.kind === 'portrait') drawPlayP(ctx, L, content, game, fx, dt);
      else drawPlayW(ctx, L, content, game, fx, dt);
    } else throw new Error(`render: unknown game mode '${game.mode}'`);
    ctx.restore();

    if (fx.flash && fx.flash.a > 0) {
      ctx.fillStyle = A(fx.flash.color, clamp(fx.flash.a, 0, 1));
      ctx.fillRect(0, 0, L.W, L.H);
    }
  }

  return { draw };
}
