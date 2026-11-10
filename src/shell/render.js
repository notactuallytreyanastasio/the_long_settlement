// The cabinet renderer. Canvas 2D, drawn to a Layout (src/shell/layout.js).
//
//   createRenderer(canvas) -> { draw(content, game, fx, layout) }
//
// Portrait (430 x 932, a phone held upright) is the cabinet; 'wide' (1280 x 800) is the
// same table with the story panel on its left and the ledger on its right.
//
//   portrait   hud     score line, then the Reels of Assay in a lit window with marks to
//                      their left and writs, trust and the leaning scale to their right
//              story   scene title, objective pips, the line being spoken
//              table   the playfield. Fill lanes show the reel they feed; spin elements
//                      glow when the reels are armed and carry a charge arc when not.
//              launch  one round button: plunger while a ball waits, lever when none can
//
// Imperative shell: this file reads game state and paints. It never writes to `game`.
// The only state it keeps is view state in the createRenderer closure (ball trails, hit
// flashes, sparks, eased numbers, cached layers).
//
// Frame cost. Mobile Safari rasterises shadowBlur on the CPU, per call, so nothing here
// sets it while drawing a frame. Every glow is a cached radial sprite stamped with
// drawImage; every lit title is rendered once, with its shadow, into its own canvas;
// the playfield with all its unlit furniture, the frame, the reel housing, the reel
// symbols and the ball are layers painted once per size. A frame is then a few dozen
// drawImage calls, the lit overlays, the flippers and the text.

import { REEL_STRIPS } from '../core/slot.js';
import { currentScene, objectiveProgress, litIds, lineSeconds } from '../core/story.js';
import { SPIN_COST, LOAN, TRUST_PER_LOAN, canSpin, aidAvailable } from '../core/economy.js';
import { drawCinema, drawPortrait } from './cinema.js';

const TW = 400; // table space
const TH = 800;
const TAU = Math.PI * 2;
const MIN_TYPE = 11; // logical px; nothing is lettered smaller than this

const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
const MONO = '"SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';

const BRASS = '#c9a25a';
const BRASS_HI = '#f4dc9c';
const BRASS_LO = '#6b4f22';
const PAPER = '#eadcc0';
const LANTERN = '#ffb347';
const RED = '#e5533d';
const STEEL = '#cfd6de';

const THREADS = {
  duty: { color: '#e6cb7c', label: 'DUTY', gloss: 'the Circuit and the contract' },
  covert: { color: '#7fa6e6', label: 'COVERT', gloss: 'what the Line asks of you' },
  commons: { color: '#f28c4e', label: 'COMMONS', gloss: 'what the town will remember' },
};

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

// How a turning reel moves. Pure in cell.spin (seconds left): full speed, then a
// quadratic run-out over the last REEL_DECEL seconds that ends exactly on the symbol.
const REEL_SPEED = 16; // symbols per second
const REEL_DECEL = 0.3;

/** Symbols still to pass under the payline for a cell with `spin` seconds left to turn. */
export function reelRemaining(spin) {
  if (!(spin > 0)) return 0;
  return spin < REEL_DECEL ? (REEL_SPEED * spin * spin) / (2 * REEL_DECEL) : REEL_SPEED * (spin - REEL_DECEL / 2);
}

/**
 * What the one button is right now. Pure in (chapter, game).
 *   launch  a ball is at the plunger: hold to charge (charge 0..1), release to launch
 *   idle    a ball is in play, or a writ is about to put one on the plunger
 *   busy    the lever has been pulled and the reels are still turning or paying
 *   aid     no ball and no writ, and the town will cover one
 *   free    the chapter's scripted first pull, which costs nothing
 *   lever   a pull costs SPIN_COST and the player has it
 *   loan    the player cannot pay: this press borrows
 */
export function launchState(chapter, game) {
  const reels = game.reels;
  if (!reels || !Array.isArray(reels.cells)) throw new Error(`render: game.reels is missing or has no cells: ${JSON.stringify(reels)}`);
  const balls = game.phys ? game.phys.balls : [];
  if (balls.some((b) => b.state === 'plunger')) return { kind: 'launch', charge: clamp(game.phys.charge, 0, 1) };
  if (balls.length > 0 || game.econ.writs > 0) return { kind: 'idle', charge: 0 };
  if (reels.phase === 'paying' || reels.cells.some((c) => c.spin > 0)) return { kind: 'busy', charge: 0 };
  if (aidAvailable(game.econ)) return { kind: 'aid', charge: 0 };
  if (chapter.riggedSpin && game.spunThisChapter === false) return { kind: 'free', charge: 0 };
  return { kind: canSpin(game.econ) ? 'lever' : 'loan', charge: 0 };
}

// ───────────────────────── small pure helpers ─────────────────────────

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

const rgbCache = new Map();
let probe = null; // a 2d context used only to normalise css colours
function rgbOf(color) {
  let v = rgbCache.get(color);
  if (v) return v;
  probe.fillStyle = '#000';
  probe.fillStyle = color;
  const s = String(probe.fillStyle);
  if (s[0] === '#') {
    v = [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  } else {
    const m = s.match(/[\d.]+/g);
    if (!m || m.length < 3) throw new Error(`render: cannot parse colour '${color}'`);
    v = [Number(m[0]), Number(m[1]), Number(m[2])];
  }
  rgbCache.set(color, v);
  return v;
}
function A(color, a) {
  const [r, g, b] = rgbOf(color);
  return `rgba(${r},${g},${b},${a})`;
}

function rr(g, x, y, w, h, r) {
  const q = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + q, y);
  g.arcTo(x + w, y, x + w, y + h, q);
  g.arcTo(x + w, y + h, x, y + h, q);
  g.arcTo(x, y + h, x, y, q);
  g.arcTo(x, y, x + w, y, q);
  g.closePath();
}
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

function brassGrad(g, x0, y0, x1, y1) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, BRASS_HI);
  gr.addColorStop(0.35, BRASS);
  gr.addColorStop(0.7, BRASS_LO);
  gr.addColorStop(1, '#a8833f');
  return gr;
}

function keycap(g, label, x, y) {
  g.font = `600 12px ${MONO}`;
  const w = Math.max(24, g.measureText(label).width + 14);
  rr(g, x, y - 11, w, 22, 5);
  const gr = g.createLinearGradient(0, y - 11, 0, y + 11);
  gr.addColorStop(0, '#3a2c1a');
  gr.addColorStop(1, '#1c140c');
  g.fillStyle = gr;
  g.fill();
  g.strokeStyle = A(BRASS, 0.7);
  g.lineWidth = 1;
  g.stroke();
  g.fillStyle = BRASS_HI;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, x + w / 2, y + 0.5);
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
      g.fillStyle = A(PAPER, 0.78);
      g.textBaseline = 'middle';
      g.fillText(s, cx, y + 1);
      g.textBaseline = 'alphabetic';
      cx += g.measureText(s).width + 10;
    } else throw new Error(`render: unknown hint part '${kind}'`);
  }
  return cx;
}
// ───────────────────────── symbol art ─────────────────────────
// Each symbol is drawn centred on (cx, cy) inside a box of half-size s.

function drawSymbol(g, sym, cx, cy, s) {
  g.save();
  g.translate(cx, cy);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (sym === 'coin') {
    const gr = g.createRadialGradient(-s * 0.3, -s * 0.35, s * 0.05, 0, 0, s * 0.95);
    gr.addColorStop(0, '#fff3c4');
    gr.addColorStop(0.45, '#e3b548');
    gr.addColorStop(1, '#8a6418');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, s * 0.88, 0, TAU);
    g.fill();
    g.strokeStyle = '#5e430f';
    g.lineWidth = s * 0.06;
    g.stroke();
    g.strokeStyle = 'rgba(94,67,15,0.65)';
    g.lineWidth = s * 0.035;
    g.beginPath();
    g.arc(0, 0, s * 0.66, 0, TAU);
    g.stroke();
    g.fillStyle = '#6e4f12';
    g.beginPath();
    g.moveTo(0, -s * 0.42);
    g.lineTo(s * 0.27, 0);
    g.lineTo(0, s * 0.42);
    g.lineTo(-s * 0.27, 0);
    g.closePath();
    g.fill();
    g.strokeStyle = '#fff0b8';
    g.lineWidth = s * 0.05;
    g.beginPath();
    g.moveTo(-s * 0.44, 0);
    g.lineTo(s * 0.44, 0);
    g.stroke();
  } else if (sym === 'scale') {
    g.strokeStyle = '#3b2a12';
    g.lineWidth = s * 0.09;
    g.beginPath();
    g.moveTo(0, -s * 0.66);
    g.lineTo(0, s * 0.7);
    g.moveTo(-s * 0.42, s * 0.76);
    g.lineTo(s * 0.42, s * 0.76);
    g.moveTo(-s * 0.7, -s * 0.5);
    g.lineTo(s * 0.7, -s * 0.5);
    g.stroke();
    g.lineWidth = s * 0.035;
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.moveTo(sx * s * 0.7, -s * 0.5);
      g.lineTo(sx * s * 0.94, s * 0.12);
      g.moveTo(sx * s * 0.7, -s * 0.5);
      g.lineTo(sx * s * 0.46, s * 0.12);
      g.stroke();
      const gr = g.createLinearGradient(0, s * 0.1, 0, s * 0.4);
      gr.addColorStop(0, '#e8c261');
      gr.addColorStop(1, '#8a6418');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(sx * s * 0.7, s * 0.12, s * 0.27, 0, Math.PI);
      g.closePath();
      g.fill();
      g.stroke();
    }
    g.fillStyle = '#d7ab45';
    g.beginPath();
    g.arc(0, -s * 0.72, s * 0.11, 0, TAU);
    g.fill();
    g.stroke();
  } else if (sym === 'gavel') {
    g.fillStyle = '#3b2a12';
    rr(g, -s * 0.78, s * 0.66, s * 1.0, s * 0.17, s * 0.06);
    g.fill();
    g.rotate(-0.62);
    const wood = g.createLinearGradient(0, -s * 0.2, 0, s * 0.9);
    wood.addColorStop(0, '#8a5526');
    wood.addColorStop(1, '#4a2a10');
    g.fillStyle = wood;
    rr(g, -s * 0.08, -s * 0.15, s * 0.16, s * 1.05, s * 0.07);
    g.fill();
    const head = g.createLinearGradient(0, -s * 0.66, 0, -s * 0.14);
    head.addColorStop(0, '#a56a31');
    head.addColorStop(1, '#5a3414');
    g.fillStyle = head;
    rr(g, -s * 0.56, -s * 0.66, s * 1.12, s * 0.52, s * 0.1);
    g.fill();
    g.strokeStyle = '#2c1a08';
    g.lineWidth = s * 0.04;
    g.stroke();
    g.fillStyle = '#e0b552';
    g.fillRect(-s * 0.42, -s * 0.66, s * 0.11, s * 0.52);
    g.fillRect(s * 0.31, -s * 0.66, s * 0.11, s * 0.52);
  } else if (sym === 'crown') {
    const gr = g.createLinearGradient(0, -s * 0.7, 0, s * 0.75);
    gr.addColorStop(0, '#fff0b0');
    gr.addColorStop(0.5, '#e0b040');
    gr.addColorStop(1, '#8a6418');
    g.fillStyle = gr;
    g.strokeStyle = '#5e430f';
    g.lineWidth = s * 0.05;
    g.beginPath();
    g.moveTo(-s * 0.78, s * 0.42);
    g.lineTo(-s * 0.88, -s * 0.36);
    g.lineTo(-s * 0.42, s * 0.06);
    g.lineTo(0, -s * 0.66);
    g.lineTo(s * 0.42, s * 0.06);
    g.lineTo(s * 0.88, -s * 0.36);
    g.lineTo(s * 0.78, s * 0.42);
    g.closePath();
    g.fill();
    g.stroke();
    rr(g, -s * 0.8, s * 0.42, s * 1.6, s * 0.26, s * 0.05);
    g.fill();
    g.stroke();
    g.fillStyle = '#c0392b';
    for (const [x, y] of [[-0.88, -0.4], [0, -0.7], [0.88, -0.4], [0, 0.55]]) {
      g.beginPath();
      g.arc(x * s, y * s, s * 0.09, 0, TAU);
      g.fill();
      g.stroke();
    }
    g.fillStyle = '#2f6f8c';
    for (const x of [-0.45, 0.45]) {
      g.beginPath();
      g.arc(x * s, s * 0.55, s * 0.07, 0, TAU);
      g.fill();
    }
  } else if (sym === 'tide') {
    const cols = ['#5cc1c9', '#2d93a8', '#1c5f78'];
    g.lineWidth = s * 0.15;
    for (let k = 0; k < 3; k++) {
      g.strokeStyle = cols[k];
      g.beginPath();
      const y0 = (-0.4 + k * 0.4) * s;
      for (let j = 0; j <= 24; j++) {
        const x = (-0.84 + (1.68 * j) / 24) * s;
        const y = y0 + Math.sin((j / 24) * TAU * 1.5 + k * 1.3) * s * 0.13;
        if (j === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
    g.strokeStyle = '#13455a';
    g.lineWidth = s * 0.05;
    g.beginPath();
    g.moveTo(-s * 0.84, s * 0.74);
    g.lineTo(s * 0.84, s * 0.74);
    g.stroke();
  } else if (sym === 'orb') {
    const gr = g.createRadialGradient(-s * 0.26, -s * 0.3, s * 0.04, 0, 0, s * 0.74);
    gr.addColorStop(0, '#eef0ff');
    gr.addColorStop(0.3, '#8f8bf0');
    gr.addColorStop(0.75, '#3a2f96');
    gr.addColorStop(1, '#130e3a');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, s * 0.68, 0, TAU);
    g.fill();
    g.strokeStyle = '#8a6418';
    g.lineWidth = s * 0.06;
    g.beginPath();
    g.ellipse(0, 0, s * 0.94, s * 0.28, -0.42, 0.25, Math.PI - 0.25);
    g.stroke();
    g.fillStyle = '#e3b548';
    g.beginPath();
    g.arc(s * 0.82, -s * 0.36, s * 0.08, 0, TAU);
    g.fill();
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

  /** A soft round light. One 64 px sprite per colour, stamped at any size. */
  function glow(g, x, y, r, color, a) {
    if (!(a > 0) || !(r > 0)) return;
    let s = view.glows.get(color);
    if (!s) {
      s = doc.createElement('canvas');
      s.width = s.height = 64;
      const c = s.getContext('2d');
      const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, A(color, 1));
      gr.addColorStop(0.45, A(color, 0.35));
      gr.addColorStop(1, A(color, 0));
      c.fillStyle = gr;
      c.fillRect(0, 0, 64, 64);
      view.glows.set(color, s);
    }
    const prev = g.globalAlpha;
    g.globalAlpha = prev * Math.min(1, a);
    g.drawImage(s, x - r, y - r, r * 2, r * 2);
    g.globalAlpha = prev;
  }

  /**
   * Lettering with a halo, rendered once (shadow and all) into its own canvas and stamped.
   * `fill` is a css colour or a list of [stop, colour] for a top-to-bottom gradient.
   * (x, y) is the alphabetic baseline; align is 'left' | 'center' | 'right'.
   */
  function litText(g, text, x, y, o) {
    const { size, weight = '600', style = '', gap = 0, fill, halo, blur, align = 'center', alpha = 1 } = o;
    const font = `${style} ${weight} ${size}px ${SERIF}`.trim();
    const key = `lit|${text}|${font}|${gap}|${JSON.stringify(fill)}|${halo}|${blur}`;
    probe.font = font;
    const chars = [...String(text)];
    const tw = gap ? chars.reduce((s, c) => s + probe.measureText(c).width, 0) + gap * (chars.length - 1) : probe.measureText(text).width;
    const pad = blur * 1.6 + 4;
    const w = tw + pad * 2;
    const h = size * 1.5 + pad * 2;
    const base = pad + size * 1.1;
    const c = layer(key, w, h, view.ds, (c2) => {
      c2.font = font;
      c2.textBaseline = 'alphabetic';
      if (typeof fill === 'string') c2.fillStyle = fill;
      else {
        const gr = c2.createLinearGradient(0, base - size, 0, base + size * 0.15);
        for (const [stop, col] of fill) gr.addColorStop(stop, col);
        c2.fillStyle = gr;
      }
      c2.shadowColor = halo;
      c2.shadowBlur = blur * view.ds; // painted once, here, never per frame
      if (gap) spaced(c2, text, pad, base, gap);
      else c2.fillText(text, pad, base);
    });
    const left = align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x;
    const prev = g.globalAlpha;
    g.globalAlpha = prev * clamp(alpha, 0, 1);
    g.drawImage(c, left - pad, y - base, w, h);
    g.globalAlpha = prev;
    return tw;
  }

  /** A reel symbol of half-size s centred on (cx, cy), from a sprite. */
  function symbol(g, sym, cx, cy, s) {
    const box = s * 2.4;
    const c = layer(`sym:${sym}:${s}`, box, box, view.ds, (c2) => {
      if (sym === 'orb') glowInto(c2, box / 2, box / 2, s * 1.15, '#786eff', 0.55);
      drawSymbol(c2, sym, box / 2, box / 2, s);
    });
    g.drawImage(c, cx - box / 2, cy - box / 2, box, box);
  }
  function glowInto(c, x, y, r, color, a) {
    const gr = c.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, A(color, a));
    gr.addColorStop(0.6, A(color, a * 0.5));
    gr.addColorStop(1, A(color, 0));
    c.fillStyle = gr;
    c.fillRect(x - r, y - r, r * 2, r * 2);
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

  function paintMotif(g, table) {
    const { accent, glow: gl, motif } = table.theme;
    const m = String(motif).toLowerCase();
    if (/lantern|harbo|festival|lot/.test(m)) {
      // a harbour of paper lanterns: strings across the upper field, lights on the water below
      g.strokeStyle = A(accent, 0.16);
      g.lineWidth = 1;
      for (let k = 0; k < 4; k++) {
        const y = 70 + k * 135;
        g.beginPath();
        g.moveTo(10, y);
        g.quadraticCurveTo(200, y + 46, 390, y - 8);
        g.stroke();
        for (let j = 1; j < 9; j++) {
          const t = j / 9;
          const x = 10 + 380 * t;
          const yy = (1 - t) * (1 - t) * y + 2 * (1 - t) * t * (y + 46) + t * t * (y - 8);
          glow(g, x, yy + 9, 16, gl, 0.16);
          g.fillStyle = A(gl, 0.34);
          rr(g, x - 3.5, yy + 3, 7, 11, 3);
          g.fill();
        }
      }
      for (let i = 0; i < 46; i++) {
        const x = 20 + hash(i) * 360;
        const y = 520 + hash(i + 100) * 270;
        glow(g, x, y, 8 + hash(i + 200) * 10, gl, 0.1);
        g.fillStyle = A(gl, 0.3);
        g.fillRect(x - 1.5, y - 1.5, 3, 3);
        g.fillStyle = A(gl, 0.07);
        g.fillRect(x - 6, y + 5, 12, 1);
      }
    } else if (/salt|crystal|mine|shaft|strata/.test(m)) {
      // strata and stillsalt shards
      g.lineWidth = 1;
      for (let k = 0; k < 16; k++) {
        const y = 40 + k * 50;
        g.strokeStyle = A(accent, 0.07 + hash(k) * 0.06);
        g.beginPath();
        g.moveTo(0, y);
        for (let x = 0; x <= 400; x += 40) g.lineTo(x, y + (hash(k * 13 + x) - 0.5) * 22);
        g.stroke();
      }
      for (let i = 0; i < 26; i++) {
        const x = 20 + hash(i + 5) * 360;
        const y = 40 + hash(i + 50) * 720;
        const h = 14 + hash(i + 80) * 30;
        const w = h * 0.3;
        const lean = (hash(i + 31) - 0.5) * 0.9;
        g.save();
        g.translate(x, y);
        g.rotate(lean);
        glow(g, 0, 0, h * 0.9, gl, 0.08);
        g.beginPath();
        g.moveTo(0, -h / 2);
        g.lineTo(w, -h / 6);
        g.lineTo(w * 0.7, h / 2);
        g.lineTo(-w * 0.7, h / 2);
        g.lineTo(-w, -h / 6);
        g.closePath();
        g.fillStyle = A(gl, 0.1);
        g.fill();
        g.strokeStyle = A(gl, 0.3);
        g.stroke();
        g.beginPath();
        g.moveTo(0, -h / 2);
        g.lineTo(0, h / 2);
        g.strokeStyle = A(gl, 0.16);
        g.stroke();
        g.restore();
      }
    } else if (/banner|parade|academy/.test(m)) {
      // a parade ground: ranked flagstones, and plumb-weight banners hung down both sides
      g.lineWidth = 1;
      g.strokeStyle = A(accent, 0.055);
      g.beginPath();
      for (let y = 30; y < 800; y += 44) { g.moveTo(0, y); g.lineTo(400, y); }
      for (let x = 12; x < 400; x += 47) { g.moveTo(x, 0); g.lineTo(x, 800); }
      g.stroke();
      for (let i = 0; i < 6; i++) {
        const x = i % 2 ? 338 : 62;
        const y = 150 + Math.floor(i / 2) * 212;
        const w = 30;
        const h = 92;
        glow(g, x, y + h / 2, 70, gl, 0.05);
        g.beginPath();
        g.moveTo(x - w / 2, y);
        g.lineTo(x + w / 2, y);
        g.lineTo(x + w / 2, y + h);
        g.lineTo(x, y + h - 14);
        g.lineTo(x - w / 2, y + h);
        g.closePath();
        g.fillStyle = A(accent, 0.07);
        g.fill();
        g.strokeStyle = A(accent, 0.24);
        g.stroke();
        // the plumb: a line and a weight
        g.strokeStyle = A(gl, 0.3);
        g.beginPath();
        g.moveTo(x - 6, y + 12);
        g.lineTo(x + 6, y + 12);
        g.moveTo(x, y + 12);
        g.lineTo(x, y + 34);
        g.stroke();
        // a bob, not an arrowhead: square shoulders, then the point
        g.beginPath();
        g.moveTo(x - 5, y + 34);
        g.lineTo(x + 5, y + 34);
        g.lineTo(x + 5, y + 45);
        g.lineTo(x, y + 58);
        g.lineTo(x - 5, y + 45);
        g.closePath();
        g.fillStyle = A(gl, 0.22);
        g.fill();
      }
    } else if (/reef|dark|tide|brand/.test(m)) {
      // black water: long swell lines, rock under the surface, a few shuttered lights
      g.lineWidth = 1;
      for (let k = 0; k < 20; k++) {
        const y = 30 + k * 40;
        g.strokeStyle = A(gl, 0.035 + hash(k + 9) * 0.04);
        g.beginPath();
        g.moveTo(0, y);
        for (let x = 0; x <= 400; x += 25) g.lineTo(x, y + Math.sin(x / 38 + k * 1.7) * 6 + (hash(k * 7 + x) - 0.5) * 4);
        g.stroke();
      }
      for (let i = 0; i < 14; i++) {
        const x = 24 + hash(i + 3) * 352;
        const y = 60 + hash(i + 41) * 700;
        const r = 12 + hash(i + 77) * 26;
        g.beginPath();
        for (let k = 0; k <= 9; k++) {
          const a = (k / 9) * TAU;
          const rr_ = r * (0.62 + hash(i * 11 + (k % 9)) * 0.5);
          const px = x + Math.cos(a) * rr_ * 1.5;
          const py = y + Math.sin(a) * rr_ * 0.7;
          if (k) g.lineTo(px, py); else g.moveTo(px, py);
        }
        g.closePath();
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fill();
        g.strokeStyle = A(gl, 0.09);
        g.stroke();
      }
      for (let i = 0; i < 9; i++) {
        const x = 30 + hash(i + 300) * 340;
        const y = 420 + hash(i + 330) * 360;
        glow(g, x, y, 14, accent, 0.16);
        g.fillStyle = A(accent, 0.5);
        g.fillRect(x - 1, y - 2, 2, 4);
      }
    } else if (/ticker|exchange|price|bell/.test(m)) {
      // the exchange: ruled ledger columns and a price line that will not sit still
      g.lineWidth = 1;
      g.strokeStyle = A(accent, 0.06);
      g.beginPath();
      for (let x = 20; x < 400; x += 36) { g.moveTo(x, 0); g.lineTo(x, 800); }
      for (let y = 24; y < 800; y += 24) { g.moveTo(0, y); g.lineTo(400, y); }
      g.stroke();
      for (let k = 0; k < 3; k++) {
        const y0 = 170 + k * 230;
        let y = y0;
        g.strokeStyle = A(gl, 0.2 - k * 0.04);
        g.lineWidth = 1.4;
        g.beginPath();
        g.moveTo(8, y);
        for (let x = 20; x <= 400; x += 12) {
          y = clamp(y + (hash(k * 97 + x) - 0.5 + (k === 1 ? 0.12 : -0.05)) * 26, y0 - 70, y0 + 70);
          g.lineTo(x, y);
        }
        g.stroke();
      }
      g.font = `600 12px ${MONO}`;
      g.textAlign = 'center';
      for (let i = 0; i < 30; i++) {
        const x = 38 + (i % 10) * 36;
        const y = 36 + Math.floor(hash(i + 500) * 30) * 24;
        const n = 40 + Math.floor(hash(i + 520) * 59);
        g.fillStyle = A(hash(i + 540) > 0.5 ? gl : accent, 0.16);
        g.fillText(String(n), x, y + 8);
      }
      g.textAlign = 'left';
    } else {
      throw new Error(`render: table '${table.id}' has motif ${JSON.stringify(motif)}, which paintMotif cannot draw`);
    }
    // Every table is an Orrery: the brass rings are always there, under the motif.
    g.save();
    g.translate(200, 300);
    for (let k = 0; k < 5; k++) {
      const r = 46 + k * 38;
      g.strokeStyle = A(accent, 0.1 - k * 0.012);
      g.lineWidth = k % 2 ? 1 : 2;
      g.beginPath();
      g.arc(0, 0, r, 0, TAU);
      g.stroke();
      const a = hash(k + 70) * TAU;
      g.fillStyle = A(accent, 0.28);
      g.beginPath();
      g.arc(Math.cos(a) * r, Math.sin(a) * r, 3, 0, TAU);
      g.fill();
    }
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * TAU;
      g.strokeStyle = A(accent, 0.1);
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(Math.cos(a) * 198, Math.sin(a) * 198);
      g.lineTo(Math.cos(a) * (k % 6 ? 204 : 212), Math.sin(a) * (k % 6 ? 204 : 212));
      g.stroke();
    }
    g.restore();
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

  function strokeRails(g, rails, railStyle, tieStyle) {
    g.lineWidth = 1.3;
    g.strokeStyle = railStyle;
    for (const rail of [rails.left, rails.right]) {
      g.beginPath();
      rail.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      g.stroke();
    }
    g.lineWidth = 1;
    g.strokeStyle = tieStyle;
    g.beginPath();
    for (let k = 1; k < rails.left.length - 1; k += 2) {
      g.moveTo(rails.left[k][0], rails.left[k][1]);
      g.lineTo(rails.right[k][0], rails.right[k][1]);
    }
    g.stroke();
  }

  const unit = (v) => {
    const l = Math.hypot(v[0], v[1]) || 1;
    return [v[0] / l, v[1] / l];
  };

  function chevron(g, cx, cy, ang, fill, stroke) {
    g.save();
    g.translate(cx, cy);
    g.rotate(ang);
    g.beginPath();
    g.moveTo(6, 0);
    g.lineTo(-4, -6);
    g.lineTo(-1.5, 0);
    g.lineTo(-4, 6);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    g.strokeStyle = stroke;
    g.lineWidth = 1;
    g.stroke();
    g.restore();
  }

  // Where an element's insert label sits.
  function labelSpot(table, kind, e) {
    if (kind === 'shot') {
      const m = mid(e.a, e.b);
      const d = unit(e.dir);
      return [m[0] - d[0] * 58, m[1] - d[1] * 58];
    }
    if (kind === 'rollover') return [e.pos[0], e.pos[1] + laneRad(table, e) + 11];
    if (kind === 'saucer') return [e.pos[0], e.pos[1] + e.r + 13];
    if (kind === 'bumper') return [e.pos[0], e.pos[1] + e.r + 12];
    if (kind === 'target') {
      const n = inwardNormal(e.a, e.b);
      const m = mid(e.a, e.b);
      return [m[0] + n[0] * 17, m[1] + n[1] * 17];
    }
    throw new Error(`render: no label spot for element kind '${kind}'`);
  }

  // A fill lane's light is big enough to show the symbol its reel holds.
  const laneRad = (table, r) => (table.reels.fill.includes(r.id) ? 11 : Math.max(5, Math.min(r.r, 9)));

  function label(g, tf, text, spot, color) {
    if (!text) return;
    g.font = `700 ${tf}px ${MONO}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const half = g.measureText(text).width / 2 + 3;
    const x = clamp(spot[0], 10 + half, TW - 10 - half); // keep insert lettering on the playfield
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillText(text, x + 0.5, spot[1] + 1);
    g.fillStyle = color;
    g.fillText(text, x, spot[1]);
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
  }

  function eachLabelled(table, fn) {
    for (const e of table.shots) fn('shot', e);
    for (const e of table.rollovers) fn('rollover', e);
    for (const e of table.saucers) fn('saucer', e);
    for (const e of table.targets) fn('target', e);
    for (const e of table.bumpers) fn('bumper', e);
  }

  // The whole playfield at rest: art, rails and every element unlit. tf is the insert type size.
  function paintTable(g, table, tf) {
    const { accent, glow: gl } = table.theme;
    const stops = table.theme.bg;
    if (!Array.isArray(stops) || stops.length === 0) throw new Error(`render: table '${table.id}' theme.bg is empty`);
    const bg = g.createLinearGradient(0, 0, 0, TH);
    stops.forEach((c, i) => bg.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), c));
    g.fillStyle = bg;
    g.fillRect(0, 0, TW, TH);
    // lantern light from above the top arch, pooled light over the flippers
    glow(g, 200, 120, 330, gl, 0.13);
    glow(g, 200, 700, 240, gl, 0.07);
    paintMotif(g, table);
    // playfield lettering
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const d of table.decor) {
      g.save();
      g.translate(d.pos[0], d.pos[1]);
      if (d.angle) g.rotate(d.angle);
      g.font = `italic 600 ${Math.max(d.size, tf)}px ${SERIF}`;
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillText(d.text, 1, 1.5);
      g.fillStyle = A(accent, 0.42);
      g.fillText(d.text, 0, 0);
      g.restore();
    }
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    // vignette
    const v = g.createRadialGradient(200, 380, 180, 200, 400, 520);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.fillStyle = v;
    g.fillRect(0, 0, TW, TH);

    // ramps and orbit gates
    for (const s of table.shots) {
      const m = mid(s.a, s.b);
      const d = unit(s.dir);
      if (s.exit) strokeRails(g, rampRails(table, s), A(STEEL, 0.2), A(STEEL, 0.1));
      g.beginPath();
      g.moveTo(s.a[0], s.a[1]);
      g.lineTo(s.b[0], s.b[1]);
      g.strokeStyle = A(accent, 0.28);
      g.lineWidth = 2;
      g.setLineDash([3, 4]);
      g.stroke();
      g.setLineDash([]);
      for (let k = 1; k <= 2; k++) chevron(g, m[0] - d[0] * (10 + k * 15), m[1] - d[1] * (10 + k * 15), Math.atan2(d[1], d[0]), 'rgba(0,0,0,0.45)', A(accent, 0.4));
    }

    // rails: drop shadow, brass body, lit edge
    g.lineCap = 'round';
    const trace = () => {
      g.beginPath();
      for (const w of table.walls) {
        g.moveTo(w.a[0], w.a[1]);
        g.lineTo(w.b[0], w.b[1]);
      }
    };
    g.save();
    g.translate(1.5, 3);
    trace();
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.lineWidth = 7;
    g.stroke();
    g.restore();
    trace();
    g.strokeStyle = '#3a2a12';
    g.lineWidth = 6;
    g.stroke();
    g.strokeStyle = BRASS;
    g.lineWidth = 3.6;
    g.stroke();
    g.save();
    g.translate(-0.6, -0.8);
    trace();
    g.strokeStyle = A(BRASS_HI, 0.85);
    g.lineWidth = 1.1;
    g.stroke();
    g.restore();

    // lane lights
    for (const r of table.rollovers) {
      const rad = laneRad(table, r);
      g.beginPath();
      g.arc(r.pos[0], r.pos[1], rad, 0, TAU);
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fill();
      g.strokeStyle = A(accent, 0.45);
      g.lineWidth = 1.2;
      g.stroke();
    }

    // saucers
    for (const s of table.saucers) {
      const hole = g.createRadialGradient(s.pos[0], s.pos[1] + 2, 1, s.pos[0], s.pos[1], s.r);
      hole.addColorStop(0, '#000');
      hole.addColorStop(0.8, '#0a0705');
      hole.addColorStop(1, '#2a1d0e');
      g.fillStyle = hole;
      g.beginPath();
      g.arc(s.pos[0], s.pos[1], s.r, 0, TAU);
      g.fill();
      g.strokeStyle = BRASS;
      g.lineWidth = 2.5;
      g.stroke();
      g.strokeStyle = A(BRASS_HI, 0.5);
      g.lineWidth = 0.8;
      g.beginPath();
      g.arc(s.pos[0], s.pos[1], s.r + 2.2, Math.PI * 1.05, Math.PI * 1.75);
      g.stroke();
    }

    // standup targets
    for (const t of table.targets) {
      const n = inwardNormal(t.a, t.b);
      g.beginPath();
      g.moveTo(t.a[0], t.a[1]);
      g.lineTo(t.b[0], t.b[1]);
      g.strokeStyle = '#1a120a';
      g.lineWidth = 8;
      g.stroke();
      g.strokeStyle = A(accent, 0.55);
      g.lineWidth = 5;
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(t.a[0] + n[0] * 1.6, t.a[1] + n[1] * 1.6);
      g.lineTo(t.b[0] + n[0] * 1.6, t.b[1] + n[1] * 1.6);
      g.stroke();
    }

    // one-way gates, with small chevrons pointing the way a ball may pass
    for (const o of table.oneWays) {
      g.beginPath();
      g.moveTo(o.a[0], o.a[1]);
      g.lineTo(o.b[0], o.b[1]);
      g.strokeStyle = A(STEEL, 0.5);
      g.lineWidth = 1.5;
      g.setLineDash([2, 3]);
      g.stroke();
      g.setLineDash([]);
      const p = unit(o.pass);
      const pa = Math.atan2(p[1], p[0]);
      const count = Math.max(1, Math.floor(Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]) / 26));
      g.strokeStyle = A(STEEL, 0.55);
      g.lineWidth = 1.2;
      for (let k = 0; k < count; k++) {
        const t = (k + 0.5) / count;
        g.save();
        g.translate(o.a[0] + (o.b[0] - o.a[0]) * t, o.a[1] + (o.b[1] - o.a[1]) * t);
        g.rotate(pa);
        g.beginPath();
        g.moveTo(-1, -3.5);
        g.lineTo(3, 0);
        g.lineTo(-1, 3.5);
        g.stroke();
        g.restore();
      }
    }

    // slingshot rubbers
    for (const s of table.slings) {
      g.beginPath();
      g.moveTo(s.a[0], s.a[1]);
      g.lineTo(s.b[0], s.b[1]);
      g.strokeStyle = A(accent, 0.85);
      g.lineWidth = 3.2;
      g.stroke();
      for (const p of [s.a, s.b]) {
        g.fillStyle = BRASS;
        g.beginPath();
        g.arc(p[0], p[1], 3, 0, TAU);
        g.fill();
      }
    }

    // bumpers
    for (const b of table.bumpers) {
      const [x, y] = b.pos;
      const r = b.r;
      glow(g, x, y, r * 2.4, gl, 0.16);
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.beginPath();
      g.arc(x + 2, y + 4, r, 0, TAU);
      g.fill();
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fillStyle = brassGrad(g, x - r, y - r, x + r, y + r);
      g.fill();
      g.strokeStyle = '#2a1d0e';
      g.lineWidth = 1;
      g.stroke();
      const cap = g.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.05, x, y, r * 0.78);
      cap.addColorStop(0, A('#ffffff', 0.85));
      cap.addColorStop(0.3, A(accent, 1));
      cap.addColorStop(1, 'rgba(20,12,6,0.95)');
      g.fillStyle = cap;
      g.beginPath();
      g.arc(x, y, r * 0.76, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.6)';
      g.lineWidth = 1.5;
      g.stroke();
    }

    eachLabelled(table, (kind, e) => label(g, tf, table.labels[e.id], labelSpot(table, kind, e), A(PAPER, 0.45)));
  }

  // The frame round the glass: inner shadow, then the two brass side rails.
  function paintBezel(g) {
    for (const [x0, x1] of [[0, 14], [TW, TW - 14]]) {
      const sh = g.createLinearGradient(x0, 0, x1, 0);
      sh.addColorStop(0, 'rgba(0,0,0,0.6)');
      sh.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = sh;
      g.fillRect(Math.min(x0, x1), 0, 14, TH);
    }
    const top = g.createLinearGradient(0, 0, 0, 30);
    top.addColorStop(0, 'rgba(0,0,0,0.7)');
    top.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = top;
    g.fillRect(0, 0, TW, 30);
    for (const x of [-8, TW]) {
      const rg = g.createLinearGradient(x, 0, x + 8, 0);
      rg.addColorStop(0, BRASS_LO);
      rg.addColorStop(0.35, BRASS_HI);
      rg.addColorStop(0.6, BRASS);
      rg.addColorStop(1, '#3d2c12');
      g.fillStyle = rg;
      g.fillRect(x, 0, 8, TH);
    }
  }

  function paintBall(g, r, gl) {
    const c = r * 2;
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.beginPath();
    g.ellipse(c + 2, c + 4, r, r * 0.85, 0, 0, TAU);
    g.fill();
    const sg = g.createRadialGradient(c - r * 0.35, c - r * 0.4, r * 0.08, c, c, r);
    sg.addColorStop(0, '#ffffff');
    sg.addColorStop(0.3, '#d9dee6');
    sg.addColorStop(0.75, '#737b88');
    sg.addColorStop(1, '#262a31');
    g.fillStyle = sg;
    g.beginPath();
    g.arc(c, c, r, 0, TAU);
    g.fill();
    g.strokeStyle = A(gl, 0.5);
    g.lineWidth = 0.8;
    g.beginPath();
    g.arc(c, c, r - 0.6, Math.PI * 0.15, Math.PI * 0.85);
    g.stroke();
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
    const { accent, glow: gl } = table.theme;
    g.drawImage(layer(`table:${table.id}:${tf}`, TW, TH, res, (c) => paintTable(c, table, tf)), 0, 0, TW, TH);

    const reels = reelsOf(game);
    const phys = game.phys;
    const balls = phys ? phys.balls : [];
    const br = table.ballRadius;
    const pulse = 0.5 + 0.5 * Math.sin(now / 170);
    const slow = 0.5 + 0.5 * Math.sin(now / 420);
    const hits = game.hits || {};
    const wanted = scene ? scene.objective.ids : [];
    const done = (id) => scene && scene.objective.kind === 'all' && wanted.includes(id) && (hits[id] || 0) > 0;
    const litAmt = (id) => (lit.has(id) ? 0.45 + 0.55 * pulse : 0);
    const spinIds = table.reels.spin;
    const armed = reels.armed === true;
    const chargeFrac = armed ? 1 : reels.need > 0 ? clamp(reels.charge / reels.need, 0, 1) : 0;
    const kickback = Boolean(game.boons && game.boons.kickback);
    const relabel = (kind, e, color) => label(g, tf, table.labels[e.id], labelSpot(table, kind, e), color);

    // contacts seen this frame feed the retained flashes
    for (const b of balls) {
      if (b.state !== 'live') continue;
      for (const bu of table.bumpers) if (Math.hypot(b.pos[0] - bu.pos[0], b.pos[1] - bu.pos[1]) < bu.r + br + 3) touch(bu.id, b.pos[0], b.pos[1], now, gl);
      for (const t of table.targets) if (segDist(b.pos, t.a, t.b) < br + 3.5) touch(t.id, b.pos[0], b.pos[1], now, accent);
      for (const s of table.slings) if (segDist(b.pos, s.a, s.b) < br + 3) touch(s.id, b.pos[0], b.pos[1], now, accent);
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

    // A spin element: lit gold and circled while the reels are armed; otherwise it carries
    // a small arc that fills as bumpers, slings and targets charge the reels back up.
    const spinMark = (x, y, r) => {
      if (armed) {
        glow(g, x, y, r * 2.6, LANTERN, 0.4 + 0.3 * slow);
        g.strokeStyle = A(LANTERN, 0.75 + 0.25 * slow);
        g.lineWidth = 2;
        g.setLineDash([5, 4]);
        g.lineDashOffset = -now / 60;
        g.beginPath();
        g.arc(x, y, r, 0, TAU);
        g.stroke();
        g.setLineDash([]);
        g.lineDashOffset = 0;
      } else {
        g.strokeStyle = 'rgba(0,0,0,0.5)';
        g.lineWidth = 3.4;
        g.beginPath();
        g.arc(x, y, r, 0, TAU);
        g.stroke();
        g.strokeStyle = A(LANTERN, 0.22);
        g.lineWidth = 2;
        g.stroke();
        if (chargeFrac > 0) {
          g.strokeStyle = A(LANTERN, 0.95);
          g.lineCap = 'round';
          g.beginPath();
          g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * chargeFrac);
          g.stroke();
        }
      }
    };

    // ramps and orbit gates
    for (const s of table.shots) {
      const on = litAmt(s.id);
      const spins = spinIds.includes(s.id);
      const gold = spins && armed;
      if (on === 0 && !spins) continue;
      const m = mid(s.a, s.b);
      const d = unit(s.dir);
      const col = on > 0 ? threadCol : LANTERN;
      const amt = on > 0 ? on : gold ? 0.5 + 0.5 * slow : 0;
      if (amt > 0) {
        if (s.exit) strokeRails(g, rampRails(table, s), A(col, 0.25 + 0.3 * amt), A(col, 0.14 + 0.16 * amt));
        g.beginPath();
        g.moveTo(s.a[0], s.a[1]);
        g.lineTo(s.b[0], s.b[1]);
        g.strokeStyle = A(col, 0.5 + 0.4 * amt);
        g.lineWidth = 2;
        g.stroke();
        for (let k = 1; k <= 2; k++) {
          const cx = m[0] - d[0] * (10 + k * 15);
          const cy = m[1] - d[1] * (10 + k * 15);
          const a = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(now / 170 + k * 1.4));
          glow(g, cx, cy, 15, col, 0.4 * a);
          chevron(g, cx, cy, Math.atan2(d[1], d[0]), A(col, 0.5 + 0.5 * a), A('#ffffff', 0.5 * a));
        }
        relabel('shot', s, A(col, 0.6 + 0.4 * amt));
      }
      if (spins) spinMark(m[0] + d[0] * 16, m[1] + d[1] * 16, 9);
    }

    // lane lights
    for (const r of table.rollovers) {
      const on = litAmt(r.id);
      const over = balls.some((b) => b.inside && b.inside.includes(r.id));
      const got = done(r.id);
      const reel = table.reels.fill.indexOf(r.id);
      const kick = kickback && /^out/.test(r.id);
      if (on === 0 && !over && !got && reel < 0 && !kick) continue;
      const [x, y] = r.pos;
      const rad = laneRad(table, r);
      const ringCol = on > 0 || got ? threadCol : kick ? LANTERN : reel >= 0 ? BRASS_HI : accent;
      if (on > 0 || over || kick) glow(g, x, y, rad * 3.2, over ? '#ffffff' : ringCol, 0.5 * Math.max(on, over ? 1 : 0, kick ? 0.5 + 0.3 * slow : 0));
      if (reel >= 0) {
        // the lane shows the reel it feeds: its numeral while empty, the symbol once it holds one
        const cell = reels.cells[reel];
        const holds = cell.sym !== null && !(cell.spin > 0);
        g.beginPath();
        g.arc(x, y, rad, 0, TAU);
        g.fillStyle = over ? '#fff' : holds ? '#efe3c6' : cell.spin > 0 ? A(LANTERN, 0.5 + 0.4 * pulse) : `rgba(12,8,5,${0.82 - 0.2 * slow})`;
        g.fill();
        if (holds) symbol(g, cell.sym, x, y, rad * 0.8);
        else if (!(cell.spin > 0)) {
          g.font = `700 ${tf}px ${SERIF}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillStyle = A(BRASS_HI, 0.6 + 0.4 * slow);
          g.fillText(ROMAN[reel + 1], x, y + 0.5);
          g.textAlign = 'left';
          g.textBaseline = 'alphabetic';
        }
      } else {
        g.beginPath();
        g.arc(x, y, rad, 0, TAU);
        g.fillStyle = over ? '#fff' : on > 0 ? A(threadCol, 0.35 + 0.6 * on) : kick ? A(LANTERN, 0.55 + 0.3 * slow) : A(threadCol, 0.55);
        g.fill();
      }
      g.beginPath();
      g.arc(x, y, rad, 0, TAU);
      g.strokeStyle = A(ringCol, on > 0 ? 0.6 + 0.4 * on : 0.9);
      g.lineWidth = on > 0 ? 2 : 1.3;
      g.stroke();
      if (kick) label(g, tf, 'KICK', labelSpot(table, 'rollover', r), LANTERN);
      else if (on > 0 || got) relabel('rollover', r, A(threadCol, 0.6 + 0.4 * Math.max(on, 0.5)));
    }

    // saucers
    for (const s of table.saucers) {
      const on = litAmt(s.id);
      if (on > 0) {
        glow(g, s.pos[0], s.pos[1], s.r * 3, threadCol, 0.45 * on);
        g.strokeStyle = A(threadCol, 0.6 + 0.4 * on);
        g.lineWidth = 2.5;
        g.beginPath();
        g.arc(s.pos[0], s.pos[1], s.r, 0, TAU);
        g.stroke();
        relabel('saucer', s, A(threadCol, 0.6 + 0.4 * on));
      }
      if (spinIds.includes(s.id)) {
        spinMark(s.pos[0], s.pos[1], s.r + 6);
        if (armed && on === 0) relabel('saucer', s, A(LANTERN, 0.7 + 0.3 * slow));
      }
    }

    // standup targets
    g.lineCap = 'round';
    for (const t of table.targets) {
      const on = litAmt(t.id);
      const fl = flashOf(t.id, now);
      const got = done(t.id);
      if (on === 0 && fl === 0 && !got) continue;
      const n = inwardNormal(t.a, t.b);
      const m = mid(t.a, t.b);
      if (on > 0 || fl > 0) glow(g, m[0] + n[0] * 4, m[1] + n[1] * 4, 24, fl > 0 ? '#ffffff' : threadCol, 0.5 * Math.max(on, fl));
      g.beginPath();
      g.moveTo(t.a[0], t.a[1]);
      g.lineTo(t.b[0], t.b[1]);
      g.strokeStyle = fl > 0.05 ? A('#ffffff', 0.6 + 0.4 * fl) : on > 0 ? A(threadCol, 0.55 + 0.45 * on) : A(threadCol, 0.7);
      g.lineWidth = 5;
      g.stroke();
      if (on > 0 || got) relabel('target', t, A(threadCol, 0.6 + 0.4 * Math.max(on, 0.6)));
    }

    // slingshots: the rubber jumps when struck
    for (const s of table.slings) {
      const fl = flashOf(s.id, now);
      if (fl === 0) continue;
      const n = inwardNormal(s.a, s.b);
      const m = mid(s.a, s.b);
      glow(g, m[0], m[1], 30, accent, 0.5 * fl);
      g.beginPath();
      g.moveTo(s.a[0], s.a[1]);
      g.quadraticCurveTo(m[0] + n[0] * 9 * fl, m[1] + n[1] * 9 * fl, s.b[0], s.b[1]);
      g.strokeStyle = A('#ffffff', 0.5 + 0.5 * fl);
      g.lineWidth = 3.2;
      g.stroke();
    }

    // bumpers
    for (const b of table.bumpers) {
      const on = litAmt(b.id);
      const fl = flashOf(b.id, now);
      if (on === 0 && fl === 0) continue;
      const [x, y] = b.pos;
      glow(g, x, y, b.r * (2.4 + 0.6 * fl), fl > 0 ? '#ffffff' : threadCol, 0.5 * Math.max(fl, on * 0.8));
      if (fl > 0) {
        g.strokeStyle = A('#ffffff', fl);
        g.lineWidth = 2;
        g.beginPath();
        g.arc(x, y, b.r + 2 + 6 * (1 - fl), 0, TAU);
        g.stroke();
      }
      if (on > 0) {
        g.fillStyle = A(threadCol, 0.25 + 0.3 * on);
        g.beginPath();
        g.arc(x, y, b.r * 0.76, 0, TAU);
        g.fill();
        g.strokeStyle = A(threadCol, 0.35 + 0.6 * on);
        g.lineWidth = 2;
        g.beginPath();
        g.arc(x, y, b.r + 4 + 2 * pulse, 0, TAU);
        g.stroke();
        relabel('bumper', b, A(threadCol, 0.6 + 0.4 * on));
      }
    }

    // ball save insert between the flippers
    if (game.boons && game.boons.ballSave > 0 && table.flippers.length >= 2) {
      const fx0 = table.flippers.reduce((s, f) => s + f.pivot[0], 0) / table.flippers.length;
      const fy0 = Math.max(...table.flippers.map((f) => f.pivot[1])) + 46;
      glow(g, fx0, fy0, 34, LANTERN, 0.35 + 0.25 * pulse);
      g.font = `700 ${tf}px ${MONO}`;
      g.textAlign = 'center';
      g.fillStyle = A(LANTERN, 0.75 + 0.25 * pulse);
      g.fillText(`SAVE ${Math.ceil(game.boons.ballSave)}`, fx0, fy0 + 4);
      g.textAlign = 'left';
    }

    // plunger: a sprung rod under the ball rest, hotter as it is drawn back
    {
      const [px, py] = table.plunger.pos;
      const charge = phys ? clamp(phys.charge, 0, 1) : 0;
      const top = py + br + 3 + charge * 34;
      g.fillStyle = BRASS;
      g.fillRect(px - 2.5, top, 5, TH - top);
      g.fillStyle = BRASS_HI;
      g.fillRect(px - 1, top, 1.5, TH - top);
      g.fillStyle = BRASS;
      rr(g, px - 7, top - 2, 14, 7, 3);
      g.fill();
      if (charge > 0) {
        glow(g, px, py, 30, LANTERN, 0.35 * charge);
        g.beginPath();
        g.arc(px, py, br + 5, -Math.PI / 2, -Math.PI / 2 + TAU * charge);
        g.strokeStyle = charge > 0.92 ? '#fff' : LANTERN;
        g.lineWidth = 2.5;
        g.stroke();
      }
    }

    // flippers
    g.lineCap = 'round';
    for (const f of table.flippers) {
      const st = phys && phys.flippers ? phys.flippers[f.id] : null;
      const ang = st ? st.angle : f.restAngle;
      const tip = [f.pivot[0] + Math.cos(ang) * f.length, f.pivot[1] + Math.sin(ang) * f.length];
      const line = (ox, oy) => {
        g.beginPath();
        g.moveTo(f.pivot[0] + ox, f.pivot[1] + oy);
        g.lineTo(tip[0] + ox, tip[1] + oy);
      };
      line(2, 5);
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.lineWidth = f.radius * 2 + 2;
      g.stroke();
      line(0, 0);
      g.strokeStyle = '#1a120a';
      g.lineWidth = f.radius * 2 + 2.5;
      g.stroke();
      g.strokeStyle = '#e6d3a4';
      g.lineWidth = f.radius * 2;
      g.stroke();
      line(0, -f.radius * 0.45);
      g.strokeStyle = '#fff6dc';
      g.lineWidth = f.radius * 0.7;
      g.stroke();
      line(0, 0);
      g.strokeStyle = A(accent, 0.9);
      g.lineWidth = Math.max(1.5, f.radius * 0.45);
      g.stroke();
      g.fillStyle = BRASS;
      g.beginPath();
      g.arc(f.pivot[0], f.pivot[1], f.radius * 0.62, 0, TAU);
      g.fill();
      g.fillStyle = BRASS_HI;
      g.beginPath();
      g.arc(f.pivot[0] - 1, f.pivot[1] - 1, f.radius * 0.25, 0, TAU);
      g.fill();
    }

    // balls and their trails
    const ballSprite = layer(`ball:${table.id}`, br * 4, br * 4, res, (c) => paintBall(c, br, gl));
    const seen = new Set();
    for (const b of balls) {
      seen.add(b.id);
      let tr = view.trails.get(b.id);
      if (!tr) view.trails.set(b.id, (tr = []));
      const lastP = tr[tr.length - 1];
      if (!lastP || Math.hypot(lastP[0] - b.pos[0], lastP[1] - b.pos[1]) > 160) tr.length = 0; // carried by a ramp: do not smear
      tr.push([b.pos[0], b.pos[1]]);
      if (tr.length > 12) tr.shift();
      const [x, y] = b.pos;
      const held = b.state === 'held';
      if (b.state === 'live') {
        g.lineCap = 'round';
        // three strokes of falling weight, not one per sample
        for (const [from, w, a] of [[0, 0.5, 0.1], [4, 1.0, 0.16], [8, 1.5, 0.22]]) {
          if (tr.length <= from + 1) continue;
          g.beginPath();
          g.moveTo(tr[from][0], tr[from][1]);
          for (let i = from + 1; i < tr.length; i++) g.lineTo(tr[i][0], tr[i][1]);
          g.strokeStyle = A(gl, a);
          g.lineWidth = br * w;
          g.stroke();
        }
        glow(g, x, y, br * 2.6, gl, 0.22);
      }
      g.globalAlpha = held ? 0.7 : 1;
      const k = held ? 0.86 : 1;
      g.drawImage(ballSprite, x - br * 2 * k, y - br * 2 * k, br * 4 * k, br * 4 * k);
      g.globalAlpha = 1;
    }
    for (const id of [...view.trails.keys()]) if (!seen.has(id)) view.trails.delete(id);

    // sparks and objective rings
    view.sparks = view.sparks.filter((s) => now - s.born < s.life && now >= s.born);
    for (const s of view.sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 260 * dt;
      g.globalAlpha = 1 - (now - s.born) / s.life;
      g.fillStyle = s.color;
      g.fillRect(s.x - 1.2, s.y - 1.2, 2.4, 2.4);
    }
    g.globalAlpha = 1;
    view.rings = view.rings.filter((r) => now - r.born < 600 && now >= r.born);
    for (const r of view.rings) {
      const k = (now - r.born) / 600;
      g.strokeStyle = A(r.color, (1 - k) * 0.9);
      g.lineWidth = 3 * (1 - k) + 0.5;
      g.beginPath();
      g.arc(r.x, r.y, 10 + k * 46, 0, TAU);
      g.stroke();
    }
  }

  // The table inside its frame, at layout.table, shifted by `dy` and shaken on impact.
  function drawTableAt(g, L, dy, content, game, fx, table, scene, lit, threadCol, dt) {
    const T = L.table;
    const s = T.scale;
    const now = fx.timeMs;
    const res = view.ds * s;
    const tf = Math.ceil(MIN_TYPE / s);
    const sh = clamp(fx.shake || 0, 0, 1);
    g.save();
    g.beginPath();
    g.rect(T.x, T.y + dy, TW * s, Math.max(0, L.H - T.y - dy));
    g.clip();
    g.translate(T.x + Math.sin(now / 17) * 7 * sh * s, T.y + dy + Math.cos(now / 13) * 5 * sh * s);
    g.scale(s, s);
    drawTable(g, table, game, scene, lit, threadCol, now, dt, res, tf);
    g.restore();
    g.save();
    g.translate(T.x, T.y + dy);
    g.scale(s, s);
    g.drawImage(layer('bezel', TW + 16, TH, res, (c) => { c.translate(8, 0); paintBezel(c); }), -8, 0, TW + 16, TH);
    g.restore();
  }

  // A prompt on the glass, in table space. Only shown while no ball is in play.
  function tableBanner(g, text, y, color, a, tf) {
    g.font = `italic ${tf + 3}px ${SERIF}`;
    const w = Math.min(TW - 44, g.measureText(text).width + 32);
    rr(g, 187 - w / 2, y - 16, w, 32, 16);
    g.fillStyle = `rgba(10,7,5,${0.84 * a})`;
    g.fill();
    g.strokeStyle = A(color, 0.7 * a);
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = A(color, a);
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
    if (state.kind === 'aid') return [`${press}: the town covers this ball`, THREADS.commons.color];
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

  // Three cells in a brass housing at (x, y). cw x ch is one cell; returns the housing's size.
  function drawReelWindow(g, game, x, y, cw, ch, gap, pad, now) {
    const reels = reelsOf(game);
    const W = cw * 3 + gap * 2 + pad * 2;
    const H = ch + pad * 2;
    const ss = Math.round(Math.min(cw, ch) * 0.36); // symbol half-size
    const paying = reels.phase === 'paying';
    const win = paying && pays(reels.result.payout);
    g.drawImage(layer(`housing:${cw}:${ch}:${gap}:${pad}`, W + 8, H + 10, view.ds, (c) => {
      c.translate(4, 3);
      c.fillStyle = 'rgba(0,0,0,0.5)';
      rr(c, 0, 3, W, H, pad + 4);
      c.fill();
      rr(c, 0, 0, W, H, pad + 4);
      c.fillStyle = brassGrad(c, 0, 0, W, H);
      c.fill();
      rr(c, 2, 2, W - 4, H - 4, pad + 2);
      const face = c.createLinearGradient(0, 0, 0, H);
      face.addColorStop(0, '#2b1e11');
      face.addColorStop(1, '#130d08');
      c.fillStyle = face;
      c.fill();
      for (let i = 0; i < 3; i++) {
        const cx = pad + i * (cw + gap);
        rr(c, cx, pad, cw, ch, 5);
        const well = c.createLinearGradient(0, pad, 0, pad + ch);
        well.addColorStop(0, '#050302');
        well.addColorStop(1, '#16100a');
        c.fillStyle = well;
        c.fill();
        c.strokeStyle = A(BRASS_HI, 0.5);
        c.lineWidth = 1;
        c.stroke();
      }
    }), x - 4, y - 3, W + 8, H + 10);
    const paper = layer(`paper:${cw}:${ch}`, cw, ch, view.ds, (c) => {
      rr(c, 0, 0, cw, ch, 5);
      const p = c.createLinearGradient(0, 0, cw, 0);
      p.addColorStop(0, '#d9c9a4');
      p.addColorStop(0.5, '#f3e8cc');
      p.addColorStop(1, '#d4c39c');
      c.fillStyle = p;
      c.fill();
    });
    const drum = layer(`drum:${cw}:${ch}`, cw, ch, view.ds, (c) => {
      rr(c, 0, 0, cw, ch, 5);
      const curve = c.createLinearGradient(0, 0, 0, ch);
      curve.addColorStop(0, 'rgba(8,5,3,0.8)');
      curve.addColorStop(0.24, 'rgba(8,5,3,0)');
      curve.addColorStop(0.76, 'rgba(8,5,3,0)');
      curve.addColorStop(1, 'rgba(8,5,3,0.8)');
      c.fillStyle = curve;
      c.fill();
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
        g.globalAlpha = fast ? 0.55 : 1;
        for (let k = -1; k <= 1; k++) symbol(g, strip[mod(fl + k, strip.length)], mx, my - (k - fr) * ch, ss);
        if (fast) {
          // a smear, not a second reel: the same symbols a third of a cell behind
          g.globalAlpha = 0.25;
          for (let k = -1; k <= 1; k++) symbol(g, strip[mod(fl + k, strip.length)], mx, my - (k - fr) * ch - ch * 0.3, ss);
        }
        g.globalAlpha = 1;
        g.drawImage(drum, cx, cy, cw, ch);
        g.restore();
      } else if (cell.sym !== null) {
        const since = view.locked[i] === null ? 9 : (now - view.locked[i]) / 1000;
        const u = since >= 0 && since < 0.4 ? since / 0.4 : 1;
        const rock = u < 1 ? 0.09 * ch * (1 - u) * (1 - u) * Math.sin(TAU * 1.5 * u) : 0;
        g.drawImage(paper, cx, cy, cw, ch);
        if (win) {
          g.fillStyle = `rgba(255,190,80,${0.22 + 0.2 * Math.sin(now / 110 + i)})`;
          rr(g, cx, cy, cw, ch, 5);
          g.fill();
        }
        symbol(g, cell.sym, mx, my + rock, ss);
        g.drawImage(drum, cx, cy, cw, ch);
        if (u < 1) {
          g.strokeStyle = A('#ffffff', 1 - u);
          g.lineWidth = 2;
          rr(g, cx - 1, cy - 1, cw + 2, ch + 2, 6);
          g.stroke();
        }
      } else {
        // empty: the reel's numeral, waiting for its lane
        g.font = `600 ${Math.max(MIN_TYPE, Math.round(ch * 0.34))}px ${SERIF}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = A(BRASS, 0.3 + 0.12 * Math.sin(now / 420 + i * 1.3));
        g.fillText(ROMAN[i + 1], mx, my + 1);
        g.textAlign = 'left';
        g.textBaseline = 'alphabetic';
      }
    }
    // payline, bright while the line pays
    const ly = y + pad + ch / 2;
    g.fillStyle = win ? A('#ffffff', 0.85) : paying ? A(RED, 0.8) : A(RED, 0.35);
    g.fillRect(x + pad - 3, ly - 0.5, W - pad * 2 + 6, 1);
    return { w: W, h: H };
  }

  // Progress to re-arming: a rule that fills, and burns steadily once the reels are armed.
  function drawChargeBar(g, reels, x, y, w, now) {
    const armed = reels.armed === true;
    const frac = armed ? 1 : reels.need > 0 ? clamp(reels.charge / reels.need, 0, 1) : 0;
    rr(g, x, y, w, 4, 2);
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fill();
    if (frac > 0) {
      rr(g, x, y, Math.max(4, w * frac), 4, 2);
      g.fillStyle = armed ? A(LANTERN, 0.75 + 0.25 * Math.sin(now / 200)) : A(BRASS, 0.9);
      g.fill();
    }
    if (armed) glow(g, x + w / 2, y + 2, w * 0.4, LANTERN, 0.18 + 0.1 * Math.sin(now / 200));
  }

  // ─────────── the one button ───────────

  const DOMES = {
    launch: ['#ffe7b0', '#f0a23a', '#7a3d0c'],
    lever: ['#ffc0b0', '#d2452f', '#56140b'],
    loan: ['#ffc0b0', '#b8321f', '#3d0d07'],
    free: ['#fff3c4', '#e3b548', '#6e4f12'],
    aid: ['#ffd9b0', '#f28c4e', '#6e3210'],
    idle: ['#9a8a68', '#4a3d28', '#1c150c'],
    busy: ['#9a8a68', '#4a3d28', '#1c150c'],
  };

  function drawLaunch(g, b, state, now) {
    const { x, y, r } = b;
    const dome = DOMES[state.kind];
    if (!dome) throw new Error(`render: no button face for launch state '${state.kind}'`);
    const live = state.kind !== 'idle' && state.kind !== 'busy';
    const pulse = 0.5 + 0.5 * Math.sin(now / 300);
    const box = r * 2 + 16;
    if (live) glow(g, x, y, r * 1.7, state.kind === 'launch' || state.kind === 'free' ? LANTERN : state.kind === 'aid' ? THREADS.commons.color : RED, 0.25 + 0.25 * pulse);
    g.drawImage(layer(`button:${r}`, box, box, view.ds, (c) => {
      const m = box / 2;
      c.fillStyle = 'rgba(0,0,0,0.55)';
      c.beginPath();
      c.arc(m + 1.5, m + 4, r, 0, TAU);
      c.fill();
      c.beginPath();
      c.arc(m, m, r, 0, TAU);
      c.fillStyle = brassGrad(c, m - r, m - r, m + r, m + r);
      c.fill();
      c.strokeStyle = '#2a1d0e';
      c.lineWidth = 1;
      c.stroke();
      c.beginPath();
      c.arc(m, m, r - 7, 0, TAU);
      c.fillStyle = '#0d0906';
      c.fill();
      // knurling on the bezel
      c.strokeStyle = 'rgba(40,26,8,0.55)';
      c.lineWidth = 1;
      for (let k = 0; k < 36; k++) {
        const a = (k / 36) * TAU;
        c.beginPath();
        c.moveTo(m + Math.cos(a) * (r - 6), m + Math.sin(a) * (r - 6));
        c.lineTo(m + Math.cos(a) * (r - 1.5), m + Math.sin(a) * (r - 1.5));
        c.stroke();
      }
    }), x - box / 2, y - box / 2, box, box);
    const dr = r - 9;
    const sink = state.charge > 0 ? 1.5 : 0;
    g.drawImage(layer(`dome:${state.kind}:${r}`, dr * 2, dr * 2, view.ds, (c) => {
      const gr = c.createRadialGradient(dr * 0.7, dr * 0.6, dr * 0.08, dr, dr, dr);
      gr.addColorStop(0, dome[0]);
      gr.addColorStop(0.45, dome[1]);
      gr.addColorStop(1, dome[2]);
      c.fillStyle = gr;
      c.beginPath();
      c.arc(dr, dr, dr, 0, TAU);
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.35)';
      c.lineWidth = 1.2;
      c.beginPath();
      c.arc(dr, dr, dr - 2.5, Math.PI * 1.1, Math.PI * 1.6);
      c.stroke();
    }), x - dr, y - dr + sink, dr * 2, dr * 2);

    // charge: a ring on the bezel, and the dome whitening as it fills
    if (state.kind === 'launch' && state.charge > 0) {
      g.fillStyle = A('#ffffff', 0.3 * state.charge);
      g.beginPath();
      g.arc(x, y + sink, dr, 0, TAU);
      g.fill();
      g.lineCap = 'butt';
      g.strokeStyle = state.charge > 0.92 ? '#ffffff' : LANTERN;
      g.lineWidth = 5;
      g.beginPath();
      g.arc(x, y, r - 3.5, -Math.PI / 2, -Math.PI / 2 + TAU * state.charge);
      g.stroke();
    } else if (live) {
      g.strokeStyle = A('#ffffff', 0.25 + 0.45 * pulse);
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(x, y, r + 3 + 2 * pulse, 0, TAU);
      g.stroke();
    }

    let main;
    let sub;
    if (state.kind === 'launch') [main, sub] = ['LAUNCH', state.charge > 0 ? `${Math.round(state.charge * 100)}%` : 'HOLD'];
    else if (state.kind === 'idle') [main, sub] = ['LAUNCH', ''];
    else if (state.kind === 'busy') [main, sub] = ['REELS', '·'.repeat(1 + (Math.floor(now / 300) % 3))];
    else if (state.kind === 'lever') [main, sub] = ['LEVER', `−${fmtInt(SPIN_COST)}`];
    else if (state.kind === 'free') [main, sub] = ['LEVER', 'FREE'];
    else if (state.kind === 'loan') [main, sub] = ['LOAN', `+${fmtInt(LOAN.marks)}`];
    else if (state.kind === 'aid') [main, sub] = ['AID', '+1 BALL'];
    else throw new Error(`render: no button lettering for launch state '${state.kind}'`);
    const dark = live && state.kind !== 'lever' && state.kind !== 'loan';
    const ink = dark ? '#2a1606' : live ? '#fff3e6' : A(PAPER, 0.5);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `700 ${r >= 44 ? 14 : 12}px ${MONO}`;
    g.fillStyle = ink;
    g.fillText(main, x, y + sink - (sub ? 6 : 0));
    if (sub) {
      g.font = `700 ${r >= 44 ? 12 : MIN_TYPE}px ${MONO}`;
      g.fillText(sub, x, y + sink + 8);
    }
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
  }

  function drawMute(g, b, muted) {
    const { x, y, r } = b;
    const box = r * 2 + 6;
    g.drawImage(layer(`mute:${r}`, box, box, view.ds, (c) => {
      const m = box / 2;
      c.beginPath();
      c.arc(m, m, r, 0, TAU);
      c.fillStyle = 'rgba(10,7,5,0.85)';
      c.fill();
      c.strokeStyle = A(BRASS, 0.75);
      c.lineWidth = 1.2;
      c.stroke();
      // a speaker
      const k = r / 16;
      c.fillStyle = BRASS_HI;
      c.beginPath();
      c.moveTo(m - 7 * k, m - 3 * k);
      c.lineTo(m - 3.5 * k, m - 3 * k);
      c.lineTo(m + 0.5 * k, m - 6.5 * k);
      c.lineTo(m + 0.5 * k, m + 6.5 * k);
      c.lineTo(m - 3.5 * k, m + 3 * k);
      c.lineTo(m - 7 * k, m + 3 * k);
      c.closePath();
      c.fill();
    }), x - box / 2, y - box / 2, box, box);
    const k = r / 16;
    g.lineCap = 'round';
    if (muted) {
      g.strokeStyle = RED;
      g.lineWidth = 1.8;
      g.beginPath();
      g.moveTo(x + 3 * k, y - 3.5 * k);
      g.lineTo(x + 8 * k, y + 3.5 * k);
      g.moveTo(x + 8 * k, y - 3.5 * k);
      g.lineTo(x + 3 * k, y + 3.5 * k);
      g.stroke();
    } else {
      g.strokeStyle = BRASS_HI;
      g.lineWidth = 1.4;
      g.beginPath();
      g.arc(x + 1 * k, y, 4 * k, -0.7, 0.7);
      g.stroke();
      g.beginPath();
      g.arc(x + 1 * k, y, 7.5 * k, -0.7, 0.7);
      g.stroke();
    }
  }

  // ─────────── portrait: the head of the table ───────────

  function paintWood(g, w, h) {
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#16100a');
    bg.addColorStop(1, '#070504');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.lineWidth = 1;
    const n = Math.round(h / 9);
    for (let i = 0; i < n; i++) {
      g.strokeStyle = `rgba(${hash(i) > 0.5 ? '255,200,140' : '0,0,0'},${0.015 + hash(i + 9) * 0.03})`;
      const y = hash(i + 40) * h;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(w * 0.3, y + hash(i + 3) * 14 - 7, w * 0.7, y + hash(i + 5) * 14 - 7, w, y + hash(i + 7) * 8 - 4);
      g.stroke();
    }
  }

  // The plate behind the hud and the story strip, in its own coordinates (0,0 = hud's corner).
  function paintHeadP(g, L) {
    const w = L.hud.w;
    const h = L.hud.h + L.story.h;
    const p = g.createLinearGradient(0, 0, 0, h);
    p.addColorStop(0, '#241910');
    p.addColorStop(0.6, '#17100b');
    p.addColorStop(1, '#0d0906');
    g.fillStyle = p;
    g.fillRect(0, 0, w, h);
    const lamp = g.createRadialGradient(w / 2, 20, 10, w / 2, 20, 260);
    lamp.addColorStop(0, 'rgba(255,180,90,0.16)');
    lamp.addColorStop(1, 'rgba(255,180,90,0)');
    g.fillStyle = lamp;
    g.fillRect(0, 0, w, h);
    // the story strip is a darker inlay
    g.fillStyle = 'rgba(0,0,0,0.34)';
    g.fillRect(0, L.hud.h, w, L.story.h);
    g.fillStyle = A(BRASS, 0.3);
    g.fillRect(12, 31, w - 24, 1);
    g.fillRect(0, L.hud.h, w, 1);
    const edge = g.createLinearGradient(0, h - 3, 0, h);
    edge.addColorStop(0, BRASS_HI);
    edge.addColorStop(0.5, BRASS);
    edge.addColorStop(1, BRASS_LO);
    g.fillStyle = edge;
    g.fillRect(0, h - 3, w, 3);
  }

  function cap(g, text, x, y, color = A(BRASS, 0.8), align = 'left') {
    g.font = `600 ${MIN_TYPE}px ${SERIF}`;
    g.fillStyle = color;
    return spaced(g, text, x, y, 2, align);
  }

  function writBalls(g, writs, x, y, r, step, maxN) {
    const showN = writs > maxN ? maxN - 1 : writs;
    for (let i = 0; i < Math.max(showN, 1); i++) {
      const bx = x + r + i * step;
      if (i < showN) g.drawImage(layer(`writ:${r}`, r * 2 + 2, r * 2 + 2, view.ds, (c) => {
        const m = r + 1;
        const sg = c.createRadialGradient(m - r * 0.33, m - r * 0.33, r * 0.1, m, m, r);
        sg.addColorStop(0, '#ffffff');
        sg.addColorStop(0.4, '#c9d0d8');
        sg.addColorStop(1, '#3a4049');
        c.fillStyle = sg;
        c.beginPath();
        c.arc(m, m, r, 0, TAU);
        c.fill();
      }), bx - r - 1, y - r - 1, r * 2 + 2, r * 2 + 2);
      else {
        g.strokeStyle = A(RED, 0.7);
        g.lineWidth = 1;
        g.setLineDash([2, 3]);
        g.beginPath();
        g.arc(bx, y, r - 0.5, 0, TAU);
        g.stroke();
        g.setLineDash([]);
      }
    }
    return x + Math.max(showN, 1) * step;
  }

  function trustBar(g, econ, trust, x, y, w, h, now) {
    const tc = THREADS.commons.color;
    rr(g, x, y, w, h, h / 2);
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fill();
    g.strokeStyle = A(tc, 0.45);
    g.lineWidth = 1;
    g.stroke();
    if (trust > 0) {
      g.drawImage(layer(`trustfill:${w}:${h}`, w, h, view.ds, (c) => {
        rr(c, 0, 0, w, h, h / 2);
        const tg = c.createLinearGradient(0, 0, w, 0);
        tg.addColorStop(0, '#8a3d1a');
        tg.addColorStop(1, '#ffc27a');
        c.fillStyle = tg;
        c.fill();
      }), 0, 0, ((w * trust) / 100) * view.ds, h * view.ds, x, y, (w * trust) / 100, h);
    }
    // one aid ball per 25 trust: a lantern at each quarter
    const earned = Math.floor(econ.trust / 25);
    for (let q = 1; q <= 4; q++) {
      const qx = x + (w * q) / 4 - (q === 4 ? 4 : 0);
      const state = q > earned ? 'unlit' : q <= econ.aidUsed ? 'spent' : 'lit';
      const ly = y + h / 2;
      if (state === 'lit') glow(g, qx, ly, h + 6, LANTERN, 0.55 + 0.2 * Math.sin(now / 250 + q));
      rr(g, qx - 3, ly - h / 2 - 2.5, 6, h + 5, 2.5);
      g.fillStyle = state === 'lit' ? '#ffd9a0' : state === 'spent' ? '#5a3c1e' : '#120c08';
      g.fill();
      g.strokeStyle = state === 'unlit' ? A(PAPER, 0.3) : tc;
      g.lineWidth = 1;
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
      g.font = `600 13px ${MONO}`;
      g.fillStyle = PAPER;
      g.fillText(fmtInt(score), hud.x + 14 + sw + 8, y0 + 22);
      g.font = `600 ${MIN_TYPE}px ${SERIF}`;
      g.fillStyle = A(BRASS, 0.85);
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
        if (on) glow(g, cx + widths[i] / 2, y0 + 111, widths[i] * 0.8, col, 0.3);
        g.fillStyle = on ? col : A(PAPER, 0.2);
        g.fillText(texts[i], cx, y0 + 111.5);
        cx += widths[i] + space;
      });
      g.textBaseline = 'alphabetic';
    }

    // left of the reels: marks, and what is owed
    const lx = hud.x + 14;
    const marks = ease('marks', econ.marks, dt);
    cap(g, 'MARKS', lx, y0 + 50);
    const mText = fmtInt(marks);
    const mult = game.boons && game.boons.mult > 1 && game.boons.multT > 0;
    const mSize = fitFont(g, mText, wx - lx - (mult ? 30 : 8), 23, (s) => `600 ${s}px ${MONO}`);
    g.fillStyle = BRASS_HI;
    g.fillText(mText, lx, y0 + 76);
    if (mult) {
      const mw = g.measureText(mText).width;
      g.font = `700 12px ${MONO}`;
      g.fillStyle = LANTERN;
      g.fillText(`×${game.boons.mult}`, lx + mw + 4, y0 + 76 - (mSize - 12) * 0.2);
    }
    const debt = ease('debt', econ.debt, dt);
    if (econ.debt > 0) {
      g.font = `700 12px ${MONO}`;
      g.fillStyle = A(RED, 0.8 + 0.2 * Math.sin(now / 300));
      g.fillText(`OWED ${fmtInt(Math.ceil(debt))}`, lx, y0 + 95);
    } else {
      g.font = `italic 12px ${SERIF}`;
      g.fillStyle = A(PAPER, 0.4);
      g.fillText('no arrears', lx, y0 + 95);
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
    const endX = writBalls(g, writs, rx, y0 + 63, 6, 15, 4);
    if (writs > 4 || writs === 0) {
      g.font = `700 12px ${MONO}`;
      g.fillStyle = writs > 0 ? PAPER : A(RED, 0.9);
      g.fillText(writs > 4 ? `×${writs}` : '0', endX + 3, y0 + 67);
    }
    const trust = clamp(ease('trust', econ.trust, dt), 0, 100);
    cap(g, 'TRUST', rx, y0 + 90, A(THREADS.commons.color, 0.95));
    g.font = `600 12px ${MONO}`;
    g.fillStyle = PAPER;
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

  // Toasts, newest last, as pills centred on cx from y downward.
  function drawToasts(g, game, cx, y, maxW, maxN, threadCol, now) {
    const toasts = game.toasts || [];
    const live = new Set();
    toasts.slice(-maxN).forEach((t, i) => {
      const key = `${t.kind}|${t.text}`;
      live.add(key);
      if (!view.toastSeen.has(key) || view.toastSeen.get(key) > now) view.toastSeen.set(key, now);
      const a = clamp((now - view.toastSeen.get(key)) / 180, 0, 1);
      const col = toastColor(t.kind, threadCol);
      fitFont(g, t.text, maxW - 28, 14, (s) => `600 ${s}px ${SERIF}`);
      const text = ellipsize(g, t.text, maxW - 28);
      const w = g.measureText(text).width + 28;
      const ty = y + i * 30 - (1 - a) * 8;
      rr(g, cx - w / 2, ty, w, 26, 13);
      g.fillStyle = `rgba(8,6,4,${0.86 * a})`;
      g.fill();
      g.strokeStyle = A(col, 0.7 * a);
      g.lineWidth = 1;
      g.stroke();
      g.fillStyle = A(col, a);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(text, cx, ty + 13.5);
      g.textAlign = 'left';
      g.textBaseline = 'alphabetic';
    });
    for (const k of [...view.toastSeen.keys()]) if (!live.has(k)) view.toastSeen.delete(k);
  }

  // The payout, named over the foot of the reel window while the line pays.
  function drawPayPlate(g, reels, cx, y, w, now) {
    if (reels.phase !== 'paying') return;
    const payout = reels.result.payout;
    const win = pays(payout);
    const flash = 0.5 + 0.5 * Math.sin(now / 90);
    const col = win ? BRASS_HI : A(PAPER, 0.8);
    rr(g, cx - w / 2, y, w, 44, 8);
    g.fillStyle = 'rgba(10,7,4,0.94)';
    g.fill();
    g.strokeStyle = win ? A(LANTERN, 0.6 + 0.4 * flash) : A(RED, 0.7);
    g.lineWidth = 1.5;
    g.stroke();
    g.textAlign = 'center';
    fitFont(g, payout.name, w - 20, 17, (s) => `600 ${s}px ${SERIF}`);
    g.fillStyle = win ? A(BRASS_HI, 0.7 + 0.3 * flash) : col;
    g.fillText(payout.name, cx, y + 20);
    const gains = gainsOf(payout);
    g.font = `700 ${MIN_TYPE}px ${MONO}`;
    g.fillStyle = win ? LANTERN : A(PAPER, 0.5);
    g.fillText(gains.length ? gains.join(' · ').toUpperCase() : 'NOTHING ALLOTTED', cx, y + 36, w - 16);
    g.textAlign = 'left';
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
    // pushes the head and the table down by the difference; the controls stay where input has them.
    const marquee = safe.top <= 6;
    const dy = Math.max(0, safe.top - 32);

    g.drawImage(layer('woodP', L.W, L.H, view.ds, (c) => paintWood(c, L.W, L.H)), 0, 0, L.W, L.H);
    drawTableAt(g, L, dy, content, game, fx, table, scene, lit, threadCol, dt);

    const state = launchState(chapter, game);
    const prompt = promptFor(state, true);
    if (prompt) {
      const s = L.table.scale;
      g.save();
      g.translate(L.table.x, L.table.y + dy);
      g.scale(s, s);
      tableBanner(g, prompt[0], 540, prompt[1], 0.75 + 0.25 * Math.sin(now / 260), Math.ceil(MIN_TYPE / s));
      g.restore();
    }

    drawHudP(g, L, dy, game, chapter, table, now, dt, marquee);
    drawStoryP(g, L, dy, content, game, fx, table, scene, threadCol, now);
    // on the glass under the head: what the line paid, then the callouts
    const paying = reelsOf(game).phase === 'paying';
    drawPayPlate(g, reelsOf(game), L.W / 2, L.table.y + dy + 8, 310, now);
    drawToasts(g, game, L.W / 2, L.table.y + dy + (paying ? 58 : 8), L.W - 80, 2, threadCol, now);
    drawLaunch(g, L.launch, state, now);
    drawMute(g, L.mute, Boolean(fx.muted));
  }

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

    // post and foot
    g.lineCap = 'round';
    g.strokeStyle = brassGrad(g, cx - 3, pivot[1], cx + 3, cy + 20);
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(cx, pivot[1]);
    g.lineTo(cx, cy + 19);
    g.stroke();
    g.fillStyle = BRASS_LO;
    rr(g, cx - 12, cy + 18, 24, 4, 2);
    g.fill();
    g.strokeStyle = A(BRASS_HI, 0.5);
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(cx - 11, cy + 18.5);
    g.lineTo(cx + 11, cy + 18.5);
    g.stroke();

    // beam: the left end sinks as the commons pan grows heavier
    const dx = Math.cos(tilt) * ARM;
    const dy = Math.sin(tilt) * ARM;
    const ends = [[cx - dx, pivot[1] + dy], [cx + dx, pivot[1] - dy]];
    g.strokeStyle = BRASS;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(ends[0][0], ends[0][1]);
    g.lineTo(ends[1][0], ends[1][1]);
    g.stroke();
    g.fillStyle = BRASS_HI;
    g.beginPath();
    g.arc(pivot[0], pivot[1], 2.6, 0, TAU);
    g.fill();
    // a pointer under the pivot swings with the beam
    g.strokeStyle = A(BRASS_HI, 0.8);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(pivot[0], pivot[1]);
    g.lineTo(pivot[0] - Math.sin(tilt) * 12, pivot[1] + Math.cos(tilt) * 12);
    g.stroke();

    // pans hang plumb from the beam ends, each with what has been put in it
    const fills = [1 - Math.exp(-trustW / 150), 1 - Math.exp(-loanW / 150)];
    ends.forEach(([ex, ey], side) => {
      const py = ey + DROP;
      const col = side === 0 ? tc : RED;
      const amount = fills[side];
      g.strokeStyle = A(STEEL, 0.5);
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(ex, ey);
      g.lineTo(ex - PAN, py);
      g.moveTo(ex, ey);
      g.lineTo(ex + PAN, py);
      g.stroke();
      if (amount > 0.01) {
        // a mound that grows with the total: lamplight on the left, red coin on the right
        const h = 2 + amount * 8;
        if (side === 0) glow(g, ex, py - h / 2, 9 + amount * 9, LANTERN, 0.25 + 0.35 * amount);
        const mound = g.createLinearGradient(0, py - h, 0, py);
        mound.addColorStop(0, side === 0 ? '#ffd9a0' : '#ff9a86');
        mound.addColorStop(1, col);
        g.fillStyle = mound;
        g.beginPath();
        g.ellipse(ex, py, PAN - 2.5, h, 0, Math.PI, TAU);
        g.closePath();
        g.fill();
      }
      g.fillStyle = '#2a1d0e';
      g.strokeStyle = amount > 0.01 ? A(col, 0.95) : A(BRASS, 0.7);
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(ex - PAN, py);
      g.quadraticCurveTo(ex, py + 9, ex + PAN, py);
      g.closePath();
      g.fill();
      g.stroke();
    });
    g.lineCap = 'butt';
  }

  // ─────────── wide: the frame, the story panel, the ledger ───────────

  function paintChrome(g, L) {
    const W = L.W;
    const H = L.H;
    const TX = L.table.x;
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#16100a');
    bg.addColorStop(1, '#070504');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // wood grain
    g.lineWidth = 1;
    for (let i = 0; i < 90; i++) {
      g.strokeStyle = `rgba(${hash(i) > 0.5 ? '255,200,140' : '0,0,0'},${0.015 + hash(i + 9) * 0.03})`;
      const y = hash(i + 40) * H;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(W * 0.3, y + hash(i + 3) * 14 - 7, W * 0.7, y + hash(i + 5) * 14 - 7, W, y + hash(i + 7) * 8 - 4);
      g.stroke();
    }
    for (const x of [L.story.x, L.hud.x]) {
      // panel plate with inner shadow and a brass edge
      rr(g, x, 10, 420, 780, 14);
      const p = g.createLinearGradient(0, 10, 0, 790);
      p.addColorStop(0, '#221810');
      p.addColorStop(0.5, '#17100b');
      p.addColorStop(1, '#0e0a07');
      g.fillStyle = p;
      g.shadowColor = 'rgba(0,0,0,0.9)';
      g.shadowBlur = 18;
      g.fill();
      g.shadowBlur = 0;
      g.save();
      rr(g, x, 10, 420, 780, 14);
      g.clip();
      const lamp = g.createRadialGradient(x + 210, -40, 20, x + 210, -40, 520);
      lamp.addColorStop(0, 'rgba(255,180,90,0.16)');
      lamp.addColorStop(1, 'rgba(255,180,90,0)');
      g.fillStyle = lamp;
      g.fillRect(x, 10, 420, 780);
      g.strokeStyle = 'rgba(0,0,0,0.8)';
      g.lineWidth = 10;
      g.shadowColor = 'rgba(0,0,0,0.9)';
      g.shadowBlur = 16;
      rr(g, x - 4, 6, 428, 788, 16);
      g.stroke();
      g.restore();
      g.shadowBlur = 0;
      rr(g, x + 0.5, 10.5, 419, 779, 14);
      g.strokeStyle = brassGrad(g, x, 10, x + 420, 790);
      g.lineWidth = 1.5;
      g.stroke();
      rr(g, x + 6.5, 16.5, 407, 767, 10);
      g.strokeStyle = A(BRASS, 0.18);
      g.lineWidth = 1;
      g.stroke();
      for (const [sx, sy] of [[x + 14, 24], [x + 406, 24], [x + 14, 776], [x + 406, 776]]) {
        const sg = g.createRadialGradient(sx - 1, sy - 1, 0.5, sx, sy, 4);
        sg.addColorStop(0, BRASS_HI);
        sg.addColorStop(1, BRASS_LO);
        g.fillStyle = sg;
        g.beginPath();
        g.arc(sx, sy, 3.2, 0, TAU);
        g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.6)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(sx - 2, sy - 1.4);
        g.lineTo(sx + 2, sy + 1.4);
        g.stroke();
      }
    }
    g.fillStyle = '#000';
    g.fillRect(TX, 0, TW, H);
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
    const card = g.createLinearGradient(0, 150, 0, 318);
    card.addColorStop(0, 'rgba(0,0,0,0.42)');
    card.addColorStop(1, 'rgba(0,0,0,0.22)');
    g.fillStyle = card;
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
    const page = g.createLinearGradient(0, y0, 0, y0 + 266);
    page.addColorStop(0, '#1d1610');
    page.addColorStop(1, '#100b08');
    g.fillStyle = page;
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
        const sg = g.createRadialGradient(bx - 3, by - 3, 1, bx, by, 9);
        sg.addColorStop(0, '#ffffff');
        sg.addColorStop(0.4, '#c9d0d8');
        sg.addColorStop(1, '#3a4049');
        g.fillStyle = sg;
        g.beginPath();
        g.arc(bx, by, 9, 0, TAU);
        g.fill();
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
      const tg = g.createLinearGradient(bx, 0, bx + bw, 0);
      tg.addColorStop(0, '#8a3d1a');
      tg.addColorStop(1, '#ffc27a');
      g.fillStyle = tg;
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
      g.fillText(gains.length ? gains.join('   ·   ') : 'nothing allotted', CX, py + 86);
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
      lever: 'No writ, no ball.', free: 'The Reels are yours tonight.', loan: 'No writ, and no marks.', aid: 'The town will cover this one.',
    }[state.kind];
    if (!heading) throw new Error(`render: no heading for launch state '${state.kind}'`);
    g.fillText(heading, X + 16, by + 62);
    const prompt = promptFor(state, view.touch);
    g.font = `15px ${SERIF}`;
    g.fillStyle = prompt ? prompt[1] : A(PAPER, 0.55);
    const words = prompt ? prompt[0] : game.econ.writs > 0 ? `${Math.floor(game.econ.writs)} writ${Math.floor(game.econ.writs) === 1 ? '' : 's'} in hand. One writ, one ball.` : 'The last writ is on the table.';
    wrap(g, words + '.', 210).slice(0, 3).forEach((l, i) => g.fillText(l, X + 16, by + 90 + i * 20));
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
    const state = launchState(chapter, game);

    g.drawImage(layer('chromeW', L.W, L.H, view.ds, (c) => paintChrome(c, L)), 0, 0, L.W, L.H);
    drawTableAt(g, L, 0, content, game, fx, table, scene, lit, threadCol, dt);
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

  // ─────────── title, chapter card, end ───────────

  function nightSky(g, L, now, warm) {
    const { W, H } = L;
    const wide = L.kind === 'wide';
    g.drawImage(layer('sky', W, H, view.ds, (c) => {
      const bg = c.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#05070f');
      bg.addColorStop(0.55, '#0b1020');
      bg.addColorStop(0.56, '#070a14');
      bg.addColorStop(1, '#020203');
      c.fillStyle = bg;
      c.fillRect(0, 0, W, H);
      for (let i = 0; i < 90; i++) {
        c.fillStyle = `rgba(220,225,255,${0.45 * hash(i + 300)})`;
        c.fillRect(hash(i) * W, hash(i + 500) * H * 0.5, 1.4, 1.4);
      }
    }), 0, 0, W, H);
    // the sea, and ten thousand paper lanterns going out on it
    const horizon = H * 0.56;
    glow(g, W / 2, horizon, wide ? 620 : 420, LANTERN, 0.1 * warm);
    const n = wide ? 150 : 90;
    g.fillStyle = '#ffd9a0';
    for (let i = 0; i < n; i++) {
      const depth = hash(i + 11); // 0 far, 1 near
      const y = horizon + 6 + depth * depth * (H - horizon - 20);
      const drift = (now / 1000) * (4 + depth * 10) * (hash(i + 77) > 0.5 ? 1 : -1);
      const x = mod(hash(i + 23) * W + drift, W + 40) - 20;
      const s = 1.2 + depth * 5;
      const fl = 0.7 + 0.3 * Math.sin(now / 300 + i);
      glow(g, x, y, s * 5, LANTERN, 0.22 * fl * warm);
      g.globalAlpha = 0.9 * fl * warm;
      g.fillRect(x - s * 0.5, y - s * 0.8, s, s * 1.4);
    }
    g.globalAlpha = 1;
    g.drawImage(layer('skyVignette', W, H, 1, (c) => {
      const m = Math.max(W, H);
      const v = c.createRadialGradient(W / 2, H * 0.45, m * 0.2, W / 2, H / 2, m * 0.66);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.85)');
      c.fillStyle = v;
      c.fillRect(0, 0, W, H);
    }), 0, 0, W, H);
  }

  function orreryRings(g, cx, cy, k, now, a) {
    g.save();
    g.translate(cx, cy);
    for (let i = 0; i < 4; i++) {
      const r = (150 + i * 46) * k;
      g.strokeStyle = A(BRASS, a * (0.32 - i * 0.05));
      g.lineWidth = i === 0 ? 2 : 1;
      g.beginPath();
      g.ellipse(0, 0, r, r * 0.34, 0, 0, TAU);
      g.stroke();
      const ang = now / (2600 + i * 1500) + i * 1.7;
      const px = Math.cos(ang) * r;
      const py = Math.sin(ang) * r * 0.34;
      glow(g, px, py, 14, LANTERN, 0.6 * a);
      g.fillStyle = A(BRASS_HI, a);
      g.beginPath();
      g.arc(px, py, 3.2, 0, TAU);
      g.fill();
    }
    g.restore();
  }

  function rule(g, cx, y, half, a) {
    if (!(half > 0)) return;
    const gr = g.createLinearGradient(cx - half, 0, cx + half, 0);
    gr.addColorStop(0, A(BRASS, 0));
    gr.addColorStop(0.5, A(BRASS_HI, a));
    gr.addColorStop(1, A(BRASS, 0));
    g.fillStyle = gr;
    g.fillRect(cx - half, y, half * 2, 1.2);
    g.fillStyle = A(BRASS_HI, a);
    g.save();
    g.translate(cx, y + 0.6);
    g.rotate(Math.PI / 4);
    g.fillRect(-3.5, -3.5, 7, 7);
    g.restore();
  }

  const TITLE_FILL = [[0, '#fff6dc'], [0.55, '#f0cd83'], [1, '#a87a34']];

  function drawTitle(g, L, fx) {
    const now = fx.timeMs;
    const { W, H } = L;
    const P = L.kind === 'portrait';
    const cx = W / 2;
    const safe = safeOf(fx);
    nightSky(g, L, now, 1);
    const ty = P ? 330 : 296; // baseline of the first title line
    orreryRings(g, cx, ty + (P ? 20 : 4), P ? 0.62 : 1, now, 0.8);
    g.font = `600 ${P ? 11 : 13}px ${SERIF}`;
    g.fillStyle = A(BRASS, 0.85);
    spaced(g, 'A TREATY  ·  A LOT  ·  A LEDGER', cx, ty - (P ? 62 : 84), P ? 3 : 5, 'center');
    const title = { size: P ? 46 : 84, gap: P ? 6 : 14, fill: TITLE_FILL, halo: 'rgba(255,170,70,0.75)', blur: P ? 22 : 38 };
    litText(g, 'THE LONG', cx, ty, title);
    litText(g, 'SETTLEMENT', cx, ty + (P ? 52 : 86), title);
    rule(g, cx, ty + (P ? 74 : 114), P ? 150 : 300, 0.9);
    g.font = `italic ${P ? 17 : 22}px ${SERIF}`;
    g.fillStyle = A(PAPER, 0.85);
    g.textAlign = 'center';
    g.fillText('Every note reads: payable in calm.', cx, ty + (P ? 110 : 156));
    g.textAlign = 'left';

    const p = 0.78 + 0.22 * Math.sin(now / 420);
    litText(g, view.touch || P ? 'TAP TO OPEN THE ACCOUNT' : 'PRESS ENTER TO OPEN THE ACCOUNT', cx, P ? 660 : 640,
      { size: P ? 14 : 17, gap: P ? 3 : 4, fill: BRASS_HI, halo: 'rgba(255,180,80,0.8)', blur: 12, alpha: p });
    if (!view.touch && !P) {
      const y = 730;
      let x = cx - 235;
      x = hintRow(g, [['key', 'Enter'], ['txt', 'begin']], x, y) + 14;
      x = hintRow(g, [['key', 'S'], ['txt', 'skip a scene']], x, y) + 14;
      hintRow(g, [['key', 'M'], ['txt', 'mute']], x, y);
    }
    g.font = `italic 13px ${SERIF}`;
    g.fillStyle = A(PAPER, 0.4);
    g.textAlign = 'center';
    g.fillText('A voiced story. Sound on.', cx, H - Math.max(30, safe.bottom + 16));
    g.textAlign = 'left';
    drawMute(g, L.mute, Boolean(fx.muted));
  }

  function drawCard(g, L, content, game, fx) {
    const now = fx.timeMs;
    const { W, H } = L;
    const P = L.kind === 'portrait';
    const cx = W / 2;
    const cy = P ? 440 : 392;
    const safe = safeOf(fx);
    const chapter = chapterOf(content, game);
    const table = tableOf(content, chapter);
    const t = game.modeT;
    const a1 = clamp(t / 0.8, 0, 1);
    const a2 = clamp((t - 0.5) / 0.9, 0, 1);
    const a3 = clamp((t - 1.2) / 0.9, 0, 1);
    g.fillStyle = '#040302';
    g.fillRect(0, 0, W, H);
    glow(g, cx, cy - 12, P ? 420 : 620, table.theme.glow, 0.13 * a1);
    orreryRings(g, cx, cy, P ? 0.62 : 1, now, 0.35 * a1);
    g.font = `600 ${P ? 13 : 16}px ${SERIF}`;
    g.fillStyle = A(BRASS, a1);
    spaced(g, `CHAPTER ${roman(chapter.number)}`, cx, cy - (P ? 74 : 92), P ? 6 : 9, 'center');
    rule(g, cx, cy - (P ? 56 : 70), (P ? 120 : 220) * a1, a1);
    const size = fitFont(g, chapter.title, W - (P ? 44 : 200), P ? 46 : 78, (s) => `600 ${s}px ${SERIF}`);
    litText(g, chapter.title, cx, cy + (P ? 8 : 20) + (1 - a2) * 10, { size, fill: '#fff3d6', halo: 'rgba(255,170,70,0.6)', blur: P ? 18 : 30, alpha: a2 });
    g.textAlign = 'center';
    g.font = `italic ${P ? 17 : 24}px ${SERIF}`;
    g.fillStyle = A(PAPER, 0.8 * a3);
    wrap(g, chapter.subtitle, W - (P ? 60 : 280)).slice(0, 3).forEach((l, i) => g.fillText(l, cx, cy + (P ? 48 : 70) + i * (P ? 23 : 30)));
    g.textAlign = 'left';
    g.font = `600 ${P ? 11 : 12}px ${SERIF}`;
    g.fillStyle = A(table.theme.accent, 0.8 * a3);
    spaced(g, String(table.name).toUpperCase(), cx, cy + (P ? 136 : 128), P ? 4 : 6, 'center');
    // letterbox bars
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, P ? Math.max(90, safe.top) : 70);
    g.fillRect(0, H - (P ? 150 : 40), W, P ? 150 : 40);
    if (t > 1.6) {
      g.globalAlpha = 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(now / 420));
      if (P) {
        g.font = `600 13px ${SERIF}`;
        g.fillStyle = BRASS_HI;
        spaced(g, 'TAP TO CONTINUE', cx, H - Math.max(84, safe.bottom + 60), 3, 'center');
      } else hintRow(g, [['key', view.touch ? 'Tap' : 'Enter'], ['txt', 'continue']], cx - 62, 720);
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
    nightSky(g, L, now, 0.45);
    const top = P ? Math.max(120, safe.top + 60) : 150;
    g.font = `600 ${P ? 11 : 13}px ${SERIF}`;
    g.fillStyle = A(BRASS, 0.85);
    spaced(g, 'THE LONG SETTLEMENT', cx, top, P ? 4 : 6, 'center');
    litText(g, 'Here the ledger rests.', cx, top + (P ? 54 : 82), { size: P ? 34 : 54, fill: '#fff3d6', halo: 'rgba(255,170,70,0.5)', blur: P ? 16 : 26 });
    rule(g, cx, top + (P ? 76 : 112), P ? 150 : 280, 0.9);
    g.textAlign = 'center';
    g.font = `italic ${P ? 15 : 20}px ${SERIF}`;
    g.fillStyle = A(PAPER, 0.75);
    wrap(g, 'The account is not closed. It is carried forward.', W - 60).forEach((l, i) => g.fillText(l, cx, top + (P ? 108 : 152) + i * 22));

    // the page
    const pw = P ? W - 44 : 520;
    const px = cx - pw / 2;
    const py = top + (P ? 140 : 194);
    const rowH = P ? 44 : 42;
    rr(g, px, py, pw, rowH * 5 + 40, 10);
    g.fillStyle = 'rgba(8,6,4,0.78)';
    g.fill();
    g.strokeStyle = A(BRASS, 0.5);
    g.lineWidth = 1;
    g.stroke();
    const rows = [
      ['Score', fmtInt(e.score), PAPER],
      ['Marks in hand', fmtInt(e.marks), BRASS_HI],
      ['Owed to the Mint', e.debt > 0 ? fmtInt(Math.ceil(e.debt)) : 'nothing', e.debt > 0 ? RED : A(PAPER, 0.6)],
      ['Trust of the Commons', `${Math.round(e.trust)} / 100`, THREADS.commons.color],
      ['Draws at the Reels', fmtInt(e.spins), PAPER],
    ];
    const inset = P ? 20 : 32;
    rows.forEach(([k, v, col], i) => {
      const y = py + 46 + i * rowH;
      g.textAlign = 'left';
      g.font = `${P ? 16 : 18}px ${SERIF}`;
      g.fillStyle = A(PAPER, 0.75);
      g.fillText(k, px + inset, y);
      g.textAlign = 'right';
      g.font = `600 ${P ? 17 : 20}px ${MONO}`;
      g.fillStyle = col;
      g.fillText(v, px + pw - inset, y);
      if (i < rows.length - 1) {
        g.fillStyle = A(BRASS, 0.15);
        g.fillRect(px + inset, y + 14, pw - inset * 2, 1);
      }
    });
    // How the book stands as it is carried forward: the same wordless scales as the ledger's, larger.
    const sy = py + rowH * 5 + (P ? 110 : 70);
    g.save();
    g.translate(cx, sy);
    g.scale(1.9, 1.9);
    drawBalance(g, e, 0, 0, now, dt);
    g.restore();
    g.textAlign = 'center';
    g.font = `italic ${P ? 14 : 17}px ${SERIF}`;
    g.fillStyle = A(PAPER, 0.55 + 0.25 * Math.sin(now / 600));
    wrap(g, `End of the chapters written so far: ${content.chapters.length}. The Circuit goes on.`, W - 60).forEach((l, i) => g.fillText(l, cx, sy + (P ? 84 : 70) + i * 20));
    g.textAlign = 'left';
    if (P) {
      g.font = `600 13px ${SERIF}`;
      g.fillStyle = A(BRASS_HI, 0.7 + 0.3 * Math.sin(now / 420));
      spaced(g, 'TAP TO RETURN TO THE TITLE', cx, H - Math.max(60, safe.bottom + 40), 3, 'center');
    } else if (view.touch) hintRow(g, [['key', 'Tap'], ['txt', 'return to the title']], cx - 96, 764);
    else hintRow(g, [['key', 'Enter'], ['txt', 'return to the title'], ['key', 'M'], ['txt', 'mute']], cx - 150, 764);
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
