// The cabinet renderer. Canvas 2D, logical size 1280x800.
//
//   left   0..440    story panel
//   centre 440..840  the pinball table (table space maps 1:1)
//   right  840..1280 the Reels of Assay and the ledger
//
// Imperative shell: this file reads game state and paints. It never writes to
// `game`. The only state it keeps is view state in the createRenderer closure
// (ball trails, hit flashes, sparks, eased ledger numbers, cached static layers).

import { REEL_STRIPS } from '../core/slot.js';
import { currentScene, objectiveProgress, litIds } from '../core/story.js';
import { SPIN_COST, LOAN, TRUST_PER_LOAN, canSpin, needsLoan } from '../core/economy.js';
import { drawCinema, drawPortrait } from './cinema.js';

const W = 1280;
const H = 800;
const TX = 440; // table origin on the cabinet
const TW = 400;
const TAU = Math.PI * 2;

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

// Where a reel sits (in strip-index units, float) and how fast it is moving.
// Pure in game.slot: a reel runs at constant speed, decelerates quadratically
// over the last DECEL seconds before its stopAt, lands exactly on its result
// symbol and rocks there: it carries a little past the payline, swings back
// short of it, and comes to rest.
const REEL_SPEED = 20; // symbols per second at full speed
const REEL_DECEL = 0.75; // seconds of easing before the stop
const ROCK_SECONDS = 0.45; // shorter than the gap between two reels stopping
const ROCK_SYMBOLS = 0.1; // the swing's envelope, in symbols: 6.6 px past the payline, then 2.5 px short of it

/** Offset of a landed reel from its symbol, `since` seconds after it stopped. */
export function reelRock(since) {
  if (!(since > 0) || since >= ROCK_SECONDS) return 0;
  const x = since / ROCK_SECONDS;
  return ROCK_SYMBOLS * (1 - x) * (1 - x) * Math.sin(TAU * 1.5 * x);
}

export function reelPose(i, slot) {
  const strip = REEL_STRIPS[i];
  let base = (i * 2) % strip.length;
  if (slot.result) {
    const sym = slot.result.reels[i];
    base = strip.indexOf(sym);
    if (base < 0) throw new Error(`render: reel ${i} result symbol '${sym}' is not on REEL_STRIPS[${i}]`);
  }
  if (slot.phase === 'idle') return { p: base, speed: 0 };
  // The core settles the spin on the tick the last reel stops and restarts slot.t, so in
  // 'settled' a reel stopped (slot.t + the head start it had on the last reel) seconds ago.
  // Without this the last reel, the one the eye is on, would freeze dead while the others rocked.
  if (slot.phase === 'settled') {
    const last = slot.stopAt[slot.stopAt.length - 1];
    return { p: base + reelRock(slot.t + last - slot.stopAt[i]), speed: 0 };
  }
  if (slot.phase !== 'spinning') throw new Error(`render: unknown slot phase '${slot.phase}'`);
  const u = slot.stopAt[i] - slot.t;
  if (u <= 0) return { p: base + reelRock(-u), speed: 0 };
  const rem = u < REEL_DECEL ? (REEL_SPEED * u * u) / (2 * REEL_DECEL) : REEL_SPEED * (u - REEL_DECEL / 2);
  return { p: base - rem, speed: u < REEL_DECEL ? (REEL_SPEED * u) / REEL_DECEL : REEL_SPEED };
}

// Where a finger does what, as fractions of the canvas. These mirror the tests in
// src/shell/input.js onPointerDown; if that file changes, the markings must follow.
//   play:  y < top is a strip (its right part, x > reelsFrom, goes back to the Reels);
//          x > plungeX and y > plungeY is the plunger; otherwise left half / right half flip.
//   slot:  the middle third (the table) goes to play; anywhere else is confirm.
const TOUCH = { top: 0.12, reelsFrom: 0.75, plungeX: 0.78, plungeY: 0.72, tableFrom: 1 / 3, tableTo: 2 / 3 };

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

function glow(g, x, y, r, color, a) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, A(color, a));
  gr.addColorStop(0.45, A(color, a * 0.35));
  gr.addColorStop(1, A(color, 0));
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
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
  while (s > 9 && g.measureText(text).width > maxW) {
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
    g.shadowColor = 'rgba(120,110,255,0.9)';
    g.shadowBlur = s * 0.5;
    const gr = g.createRadialGradient(-s * 0.26, -s * 0.3, s * 0.04, 0, 0, s * 0.74);
    gr.addColorStop(0, '#eef0ff');
    gr.addColorStop(0.3, '#8f8bf0');
    gr.addColorStop(0.75, '#3a2f96');
    gr.addColorStop(1, '#130e3a');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, s * 0.68, 0, TAU);
    g.fill();
    g.shadowBlur = 0;
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
  // An untouched canvas is 300x150. Give it the logical size; the integrator may
  // set any other backing size and draw() scales to it.
  if (canvas.width === 300 && canvas.height === 150) {
    canvas.width = W;
    canvas.height = H;
  }
  const doc = canvas.ownerDocument;
  probe = doc.createElement('canvas').getContext('2d');

  const view = {
    lastMs: null,
    layers: new Map(), // key -> offscreen canvas
    trails: new Map(), // ball id -> [[x,y],...]
    flashes: new Map(), // element id -> timeMs of last contact
    sparks: [], // {x,y,vx,vy,born,life,color}
    rings: [], // {x,y,born,color}
    prevHits: null,
    eased: { marks: null, score: null, trust: null, debt: null, lean: null },
    touch: false, // true on a touch device: draw where a finger does what
    toastSeen: new Map(), // kind|text -> timeMs first seen
    elems: new Map(), // table id -> Map(element id -> [x,y])
  };

  // A touch device is one whose main pointer is a finger, or any device once it has been
  // touched. A mouse click never turns the markings on.
  const win = doc.defaultView;
  if (win && typeof win.matchMedia === 'function') {
    view.touch = win.matchMedia('(hover: none) and (pointer: coarse)').matches;
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') view.touch = true;
  }, { passive: true });

  function layer(key, w, h, scale, paint) {
    const k = `${key}@${scale}`;
    let c = view.layers.get(k);
    if (!c) {
      c = doc.createElement('canvas');
      c.width = Math.ceil(w * scale);
      c.height = Math.ceil(h * scale);
      const g = c.getContext('2d');
      g.scale(scale, scale);
      paint(g);
      view.layers.set(k, c);
    }
    return c;
  }

  function chapterOf(content, game) {
    const ch = content.chapters[game.chapter];
    if (!ch) throw new Error(`render: no chapter at index ${game.chapter}`);
    return ch;
  }

  function tableOf(content, chapter) {
    const t = content.tables[chapter.tableId];
    if (!t) throw new Error(`render: chapter '${chapter.id}' names unknown table '${chapter.tableId}'`);
    return t;
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
    view.elems.set(table.id, m);
    return m;
  }

  // ─────────── static layers ───────────

  function paintChrome(g) {
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
    for (const x of [10, 850]) {
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

  function paintBezel(g) {
    // drawn over the table: inner shadow, then the two brass rails
    for (const [x0, x1] of [[0, 14], [TW, TW - 14]]) {
      const sh = g.createLinearGradient(x0, 0, x1, 0);
      sh.addColorStop(0, 'rgba(0,0,0,0.6)');
      sh.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = sh;
      g.fillRect(Math.min(x0, x1), 0, 14, H);
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
      g.fillRect(x, 0, 8, H);
    }
  }

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
        g.moveTo(x, y + 10);
        g.lineTo(x, y + 42);
        g.stroke();
        g.beginPath();
        g.moveTo(x - 6, y + 42);
        g.lineTo(x + 6, y + 42);
        g.lineTo(x, y + 60);
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
      g.font = `600 8px ${MONO}`;
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

  function paintTable(g, table) {
    const stops = table.theme.bg;
    if (!Array.isArray(stops) || stops.length === 0) throw new Error(`render: table '${table.id}' theme.bg is empty`);
    const bg = g.createLinearGradient(0, 0, 0, H);
    stops.forEach((c, i) => bg.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), c));
    g.fillStyle = bg;
    g.fillRect(0, 0, TW, H);
    // lantern light from above the top arch, pooled light over the flippers
    glow(g, 200, 120, 330, table.theme.glow, 0.13);
    glow(g, 200, 700, 240, table.theme.glow, 0.07);
    paintMotif(g, table);
    // playfield lettering
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const d of table.decor) {
      g.save();
      g.translate(d.pos[0], d.pos[1]);
      if (d.angle) g.rotate(d.angle);
      g.font = `italic 600 ${d.size}px ${SERIF}`;
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillText(d.text, 1, 1.5);
      g.fillStyle = A(table.theme.accent, 0.42);
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
    g.fillRect(0, 0, TW, H);
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
  }

  // ─────────── the table, live ───────────

  function label(g, text, x, y, on, color) {
    if (!text) return;
    g.font = `700 9px ${MONO}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const half = g.measureText(text).width / 2 + 3;
    x = clamp(x, 10 + half, TW - 10 - half); // keep insert lettering on the playfield
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillText(text, x + 0.5, y + 1);
    g.fillStyle = on > 0 ? A(color, 0.6 + 0.4 * on) : A(PAPER, 0.45);
    g.fillText(text, x, y);
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
  }

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

  function drawTable(g, table, game, scene, lit, threadCol, now, dt) {
    const { accent, glow: gl } = table.theme;
    const scale = canvas.width / W;
    const base = layer('table:' + table.id, TW, H, scale, (c) => paintTable(c, table));
    g.drawImage(base, 0, 0, TW, H);

    const phys = game.phys;
    const balls = phys ? phys.balls : [];
    const br = table.ballRadius;
    const pulse = 0.5 + 0.5 * Math.sin(now / 170);
    const hits = game.hits || {};
    const wanted = scene ? scene.objective.ids : [];
    const done = (id) => scene && scene.objective.kind === 'all' && wanted.includes(id) && (hits[id] || 0) > 0;
    const litAmt = (id) => (lit.has(id) ? 0.45 + 0.55 * pulse : 0);

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

    // ramps and orbit gates
    for (const s of table.shots) {
      const m = mid(s.a, s.b);
      const dl = Math.hypot(s.dir[0], s.dir[1]) || 1;
      const d = [s.dir[0] / dl, s.dir[1] / dl];
      const on = litAmt(s.id);
      if (s.exit) {
        // wireform: a pair of rails with ties, leaving along the shot and dropping onto the exit
        const ex = s.exit.pos;
        const c1 = [m[0] + d[0] * 80, m[1] + d[1] * 80];
        const c2 = [ex[0], ex[1] - 170];
        const N = 30;
        const left = [];
        const right = [];
        for (let k = 0; k <= N; k++) {
          const t = k / N;
          const u = 1 - t;
          const bx = u * u * u * m[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * ex[0];
          const by = u * u * u * m[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * ex[1];
          const tx = 3 * u * u * (c1[0] - m[0]) + 6 * u * t * (c2[0] - c1[0]) + 3 * t * t * (ex[0] - c2[0]);
          const ty = 3 * u * u * (c1[1] - m[1]) + 6 * u * t * (c2[1] - c1[1]) + 3 * t * t * (ex[1] - c2[1]);
          const tl = Math.hypot(tx, ty) || 1;
          left.push([bx - (ty / tl) * 6, by + (tx / tl) * 6]);
          right.push([bx + (ty / tl) * 6, by - (tx / tl) * 6]);
        }
        g.lineWidth = 1.3;
        g.strokeStyle = on > 0 ? A(threadCol, 0.25 + 0.3 * on) : A(STEEL, 0.2);
        for (const rail of [left, right]) {
          g.beginPath();
          rail.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
          g.stroke();
        }
        g.lineWidth = 1;
        g.strokeStyle = on > 0 ? A(threadCol, 0.14 + 0.16 * on) : A(STEEL, 0.1);
        g.beginPath();
        for (let k = 1; k < N; k += 2) {
          g.moveTo(left[k][0], left[k][1]);
          g.lineTo(right[k][0], right[k][1]);
        }
        g.stroke();
      }
      g.beginPath();
      g.moveTo(s.a[0], s.a[1]);
      g.lineTo(s.b[0], s.b[1]);
      g.strokeStyle = on > 0 ? A(threadCol, 0.5 + 0.4 * on) : A(accent, 0.28);
      g.lineWidth = 2;
      g.setLineDash([3, 4]);
      g.stroke();
      g.setLineDash([]);
      // two chevron inserts on the approach
      for (let k = 1; k <= 2; k++) {
        const cx = m[0] - d[0] * (10 + k * 15);
        const cy = m[1] - d[1] * (10 + k * 15);
        const phase = 0.5 + 0.5 * Math.sin(now / 170 + k * 1.4);
        const a = lit.has(s.id) ? 0.4 + 0.6 * phase : 0;
        if (a > 0) glow(g, cx, cy, 15, threadCol, 0.4 * a);
        g.save();
        g.translate(cx, cy);
        g.rotate(Math.atan2(d[1], d[0]));
        g.beginPath();
        g.moveTo(6, 0);
        g.lineTo(-4, -6);
        g.lineTo(-1.5, 0);
        g.lineTo(-4, 6);
        g.closePath();
        g.fillStyle = a > 0 ? A(threadCol, 0.5 + 0.5 * a) : 'rgba(0,0,0,0.45)';
        g.fill();
        g.strokeStyle = a > 0 ? A('#ffffff', 0.5 * a) : A(accent, 0.4);
        g.lineWidth = 1;
        g.stroke();
        g.restore();
      }
      label(g, table.labels[s.id], m[0] - d[0] * 56, m[1] - d[1] * 56, on, threadCol);
    }

    // lane lights
    for (const r of table.rollovers) {
      const on = litAmt(r.id);
      const over = balls.some((b) => b.inside && b.inside.includes(r.id)) ? 1 : 0;
      const got = done(r.id);
      const rad = Math.max(5, Math.min(r.r, 9));
      if (on > 0 || over) glow(g, r.pos[0], r.pos[1], rad * 3.2, over ? '#ffffff' : threadCol, 0.5 * Math.max(on, over));
      g.beginPath();
      g.arc(r.pos[0], r.pos[1], rad, 0, TAU);
      g.fillStyle = over ? '#fff' : on > 0 ? A(threadCol, 0.35 + 0.6 * on) : got ? A(threadCol, 0.55) : 'rgba(0,0,0,0.5)';
      g.fill();
      g.strokeStyle = on > 0 || got ? A(threadCol, 0.9) : A(accent, 0.45);
      g.lineWidth = 1.2;
      g.stroke();
      label(g, table.labels[r.id], r.pos[0], r.pos[1] + rad + 9, Math.max(on, got ? 0.5 : 0), threadCol);
    }

    // saucers
    for (const s of table.saucers) {
      const on = litAmt(s.id);
      if (on > 0) glow(g, s.pos[0], s.pos[1], s.r * 3, threadCol, 0.45 * on);
      const hole = g.createRadialGradient(s.pos[0], s.pos[1] + 2, 1, s.pos[0], s.pos[1], s.r);
      hole.addColorStop(0, '#000');
      hole.addColorStop(0.8, '#0a0705');
      hole.addColorStop(1, '#2a1d0e');
      g.fillStyle = hole;
      g.beginPath();
      g.arc(s.pos[0], s.pos[1], s.r, 0, TAU);
      g.fill();
      g.strokeStyle = on > 0 ? A(threadCol, 0.6 + 0.4 * on) : BRASS;
      g.lineWidth = 2.5;
      g.stroke();
      g.strokeStyle = A(BRASS_HI, 0.5);
      g.lineWidth = 0.8;
      g.beginPath();
      g.arc(s.pos[0], s.pos[1], s.r + 2.2, Math.PI * 1.05, Math.PI * 1.75);
      g.stroke();
      label(g, table.labels[s.id], s.pos[0], s.pos[1] + s.r + 11, on, threadCol);
    }

    // standup targets
    g.lineCap = 'round';
    for (const t of table.targets) {
      const on = litAmt(t.id);
      const fl = flashOf(t.id, now);
      const got = done(t.id);
      const n = inwardNormal(t.a, t.b);
      const m = mid(t.a, t.b);
      if (on > 0 || fl > 0) glow(g, m[0] + n[0] * 4, m[1] + n[1] * 4, 24, fl > 0 ? '#ffffff' : threadCol, 0.5 * Math.max(on, fl));
      g.beginPath();
      g.moveTo(t.a[0], t.a[1]);
      g.lineTo(t.b[0], t.b[1]);
      g.strokeStyle = '#1a120a';
      g.lineWidth = 8;
      g.stroke();
      g.strokeStyle = fl > 0.05 ? A('#ffffff', 0.6 + 0.4 * fl) : on > 0 ? A(threadCol, 0.55 + 0.45 * on) : got ? A(threadCol, 0.7) : A(accent, 0.55);
      g.lineWidth = 5;
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(t.a[0] + n[0] * 1.6, t.a[1] + n[1] * 1.6);
      g.lineTo(t.b[0] + n[0] * 1.6, t.b[1] + n[1] * 1.6);
      g.stroke();
      label(g, table.labels[t.id], m[0] + n[0] * 15, m[1] + n[1] * 15, Math.max(on, got ? 0.6 : 0), threadCol);
    }

    // one-way gates
    for (const o of table.oneWays) {
      g.beginPath();
      g.moveTo(o.a[0], o.a[1]);
      g.lineTo(o.b[0], o.b[1]);
      g.strokeStyle = A(STEEL, 0.5);
      g.lineWidth = 1.5;
      g.setLineDash([2, 3]);
      g.stroke();
      g.setLineDash([]);
      // which way it opens: small chevrons along the gate, pointing the way a ball may pass
      const pl = Math.hypot(o.pass[0], o.pass[1]) || 1;
      const pa = Math.atan2(o.pass[1] / pl, o.pass[0] / pl);
      const len = Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]);
      const count = Math.max(1, Math.floor(len / 26));
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

    // slingshots: a rubber that jumps when struck
    for (const s of table.slings) {
      const fl = flashOf(s.id, now);
      const n = inwardNormal(s.a, s.b);
      const m = mid(s.a, s.b);
      if (fl > 0) glow(g, m[0], m[1], 30, accent, 0.5 * fl);
      g.beginPath();
      g.moveTo(s.a[0], s.a[1]);
      g.quadraticCurveTo(m[0] + n[0] * 9 * fl, m[1] + n[1] * 9 * fl, s.b[0], s.b[1]);
      g.strokeStyle = fl > 0.05 ? A('#ffffff', 0.5 + 0.5 * fl) : A(accent, 0.85);
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
      const on = litAmt(b.id);
      const fl = flashOf(b.id, now);
      const [x, y] = b.pos;
      const r = b.r * (1 + 0.1 * fl);
      glow(g, x, y, r * 2.4, fl > 0 ? '#ffffff' : on > 0 ? threadCol : gl, 0.16 + 0.5 * Math.max(fl, on * 0.8));
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
      const capCol = on > 0 ? threadCol : accent;
      cap.addColorStop(0, fl > 0 ? '#ffffff' : A('#ffffff', 0.85));
      cap.addColorStop(0.3, A(capCol, 1));
      cap.addColorStop(1, 'rgba(20,12,6,0.95)');
      g.fillStyle = cap;
      g.beginPath();
      g.arc(x, y, r * 0.76, 0, TAU);
      g.fill();
      g.strokeStyle = on > 0 ? A(threadCol, 0.5 + 0.5 * on) : 'rgba(0,0,0,0.6)';
      g.lineWidth = 1.5;
      g.stroke();
      if (on > 0) {
        g.strokeStyle = A(threadCol, 0.35 + 0.6 * on);
        g.lineWidth = 2;
        g.beginPath();
        g.arc(x, y, r + 4 + 2 * pulse, 0, TAU);
        g.stroke();
      }
      label(g, table.labels[b.id], x, y + r + (on > 0 ? 14 : 9), on, threadCol);
    }

    // ball save insert between the flippers
    if (game.boons && game.boons.ballSave > 0 && table.flippers.length >= 2) {
      const fx0 = table.flippers.reduce((s, f) => s + f.pivot[0], 0) / table.flippers.length;
      const fy0 = Math.max(...table.flippers.map((f) => f.pivot[1])) + 46;
      glow(g, fx0, fy0, 34, LANTERN, 0.35 + 0.25 * pulse);
      g.font = `700 10px ${MONO}`;
      g.textAlign = 'center';
      g.fillStyle = A(LANTERN, 0.75 + 0.25 * pulse);
      g.fillText(`SAVE ${Math.ceil(game.boons.ballSave)}`, fx0, fy0 + 3);
      g.textAlign = 'left';
    }

    // plunger: a sprung rod under the ball rest, glowing hotter as it is drawn back
    {
      const [px, py] = table.plunger.pos;
      const charge = phys ? clamp(phys.charge, 0, 1) : 0;
      const top = py + br + 3 + charge * 34;
      const rod = g.createLinearGradient(px - 4, 0, px + 4, 0);
      rod.addColorStop(0, BRASS_LO);
      rod.addColorStop(0.4, BRASS_HI);
      rod.addColorStop(1, BRASS_LO);
      g.fillStyle = rod;
      g.fillRect(px - 2.5, top, 5, H - top);
      rr(g, px - 7, top - 2, 14, 7, 3);
      g.fill();
      g.strokeStyle = charge > 0 ? A(LANTERN, 0.5 + 0.5 * charge) : A(STEEL, 0.45);
      g.lineWidth = 1.5;
      g.beginPath();
      const coils = 9;
      const span = H - 6 - (top + 8);
      for (let k = 0; k <= coils * 2; k++) {
        const yy = top + 8 + (span * k) / (coils * 2);
        const xx = px + (k % 2 ? 6 : -6);
        if (k === 0) g.moveTo(px, yy);
        else g.lineTo(xx, yy);
      }
      g.stroke();
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
    for (const f of table.flippers) {
      const st = phys && phys.flippers ? phys.flippers[f.id] : null;
      const ang = st ? st.angle : f.restAngle;
      const tip = [f.pivot[0] + Math.cos(ang) * f.length, f.pivot[1] + Math.sin(ang) * f.length];
      const line = () => {
        g.beginPath();
        g.moveTo(f.pivot[0], f.pivot[1]);
        g.lineTo(tip[0], tip[1]);
      };
      g.save();
      g.translate(2, 5);
      line();
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.lineWidth = f.radius * 2 + 2;
      g.stroke();
      g.restore();
      line();
      g.strokeStyle = '#1a120a';
      g.lineWidth = f.radius * 2 + 2.5;
      g.stroke();
      const nx = -Math.sin(ang);
      const ny = Math.cos(ang);
      const body = g.createLinearGradient(f.pivot[0] - nx * f.radius, f.pivot[1] - ny * f.radius, f.pivot[0] + nx * f.radius, f.pivot[1] + ny * f.radius);
      const up = ny > 0 ? [0, 1] : [1, 0];
      body.addColorStop(up[0], '#fff6dc');
      body.addColorStop(0.5, '#e6d3a4');
      body.addColorStop(up[1], '#8f7742');
      g.strokeStyle = body;
      g.lineWidth = f.radius * 2;
      g.stroke();
      line();
      g.strokeStyle = A(accent, 0.9);
      g.lineWidth = Math.max(1.5, f.radius * 0.45);
      g.stroke();
      const cap = g.createRadialGradient(f.pivot[0] - 1.5, f.pivot[1] - 1.5, 0.5, f.pivot[0], f.pivot[1], f.radius * 0.75);
      cap.addColorStop(0, BRASS_HI);
      cap.addColorStop(1, BRASS_LO);
      g.fillStyle = cap;
      g.beginPath();
      g.arc(f.pivot[0], f.pivot[1], f.radius * 0.62, 0, TAU);
      g.fill();
    }

    // balls and their trails
    const seen = new Set();
    for (const b of balls) {
      seen.add(b.id);
      let tr = view.trails.get(b.id);
      if (!tr) view.trails.set(b.id, (tr = []));
      const lastP = tr[tr.length - 1];
      if (!lastP || Math.hypot(lastP[0] - b.pos[0], lastP[1] - b.pos[1]) > 160) tr.length = 0; // carried by a ramp: do not smear
      tr.push([b.pos[0], b.pos[1]]);
      if (tr.length > 14) tr.shift();
      if (b.state === 'live') {
        g.lineCap = 'round';
        for (let i = 1; i < tr.length; i++) {
          const a = i / tr.length;
          g.beginPath();
          g.moveTo(tr[i - 1][0], tr[i - 1][1]);
          g.lineTo(tr[i][0], tr[i][1]);
          g.strokeStyle = A(gl, 0.34 * a * a);
          g.lineWidth = br * 1.7 * a;
          g.stroke();
        }
      }
      const [x, y] = b.pos;
      const held = b.state === 'held';
      const r = held ? br * 0.86 : br;
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.beginPath();
      g.ellipse(x + 2, y + 4, r, r * 0.85, 0, 0, TAU);
      g.fill();
      if (!held) glow(g, x, y, r * 2.6, gl, 0.22);
      const sg = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.08, x, y, r);
      sg.addColorStop(0, '#ffffff');
      sg.addColorStop(0.3, '#d9dee6');
      sg.addColorStop(0.75, '#737b88');
      sg.addColorStop(1, '#262a31');
      g.fillStyle = sg;
      g.globalAlpha = held ? 0.75 : 1;
      g.beginPath();
      g.arc(x, y, r, 0, TAU);
      g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = A(gl, 0.5);
      g.lineWidth = 0.8;
      g.beginPath();
      g.arc(x, y, r - 0.6, Math.PI * 0.15, Math.PI * 0.85);
      g.stroke();
    }
    for (const id of [...view.trails.keys()]) if (!seen.has(id)) view.trails.delete(id);

    // sparks and objective rings
    view.sparks = view.sparks.filter((s) => now - s.born < s.life && now >= s.born);
    for (const s of view.sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 260 * dt;
      const a = 1 - (now - s.born) / s.life;
      g.fillStyle = A(s.color, a);
      g.fillRect(s.x - 1.2, s.y - 1.2, 2.4, 2.4);
    }
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

  function tableBanner(g, text, y, color, a) {
    g.font = `italic 17px ${SERIF}`;
    const w = g.measureText(text).width + 36;
    rr(g, 200 - w / 2, y - 17, w, 34, 17);
    g.fillStyle = `rgba(10,7,5,${0.82 * a})`;
    g.fill();
    g.strokeStyle = A(color, 0.7 * a);
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = A(color, a);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 200, y + 1);
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
  }

  // ─────────── the story panel ───────────

  function drawStory(g, content, game, fx, chapter, scene, table, threadCol) {
    const X = 30;
    const R = 410;
    const PW = R - X;
    const now = fx.timeMs;

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
    g.shadowColor = 'rgba(255,170,80,0.35)';
    g.shadowBlur = 14;
    g.fillText(chapter.title, X, 112);
    g.shadowBlur = 0;
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
      g.font = `700 10px ${MONO}`;
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
        const names = obj.ids.map((id) => table.labels[id] || id);
        let size = 11;
        const widthAt = (s) => {
          g.font = `700 ${s}px ${MONO}`;
          return names.reduce((w, n) => w + g.measureText(n).width + 16, 0) + 14 * (names.length - 1);
        };
        while (size > 7 && widthAt(size) > PW - 8) size -= 1;
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
      g.shadowColor = A(who.color, 0.6);
      g.shadowBlur = 10 + 14 * level;
      g.stroke();
      g.shadowBlur = 0;

      const nx = X + ps + 16;
      fitFont(g, who.name, R - nx, 21, (s) => `600 ${s}px ${SERIF}`);
      g.fillStyle = who.color;
      g.fillText(who.name, nx, vy + 22);
      g.font = `italic 13px ${SERIF}`;
      g.fillStyle = A(PAPER, 0.55);
      const roleLines = wrap(g, who.role, R - nx).slice(0, 2);
      roleLines.forEach((l, i) => g.fillText(l, nx, vy + 42 + i * 16));
      if (radio) {
        g.font = `700 9px ${MONO}`;
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
      g.shadowColor = 'rgba(0,0,0,0.8)';
      g.shadowBlur = 4;
      lines.slice(0, 7).forEach((l, i) => g.fillText(l, X, vy + ps + 34 + i * lh));
      g.shadowBlur = 0;
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
    if (game.mode === 'slot') {
      const e = game.econ;
      const go = view.touch ? 'Tap' : 'Enter';
      if (needsLoan(e)) hintRow(g, [['key', go], ['txt', `borrow ${fmtInt(LOAN.marks)} from the Mint`]], X, 732);
      else if (canSpin(e)) hintRow(g, [['key', go], ['txt', `spin the Reels (${fmtInt(SPIN_COST)} marks)`]], X, 732);
      else hintRow(g, [['key', go], ['txt', 'spin (not enough marks)']], X, 732);
      const toTable = e.writs > 0 ? 'play the table' : 'play (needs a writ)';
      if (view.touch) hintRow(g, [['key', 'Tap the table'], ['txt', toTable]], X, 762);
      else hintRow(g, [['key', 'P'], ['txt', toTable], ['key', 'M'], ['txt', 'mute']], X, 762);
    } else if (game.mode === 'play' && view.touch) {
      hintRow(g, [['key', 'Left half'], ['key', 'Right half'], ['txt', 'flip']], X, 732);
      hintRow(g, [['key', 'Corner'], ['txt', 'hold to plunge'], ['key', 'Top right'], ['txt', 'Reels']], X, 762);
    } else if (game.mode === 'play') {
      const cx = hintRow(g, [['key', '←'], ['key', '→'], ['txt', 'or'], ['key', 'Z'], ['key', '/'], ['txt', 'flip']], X, 732);
      hintRow(g, [['key', 'Space'], ['txt', 'plunge']], Math.max(cx + 4, 268), 732);
      hintRow(g, [['key', 'R'], ['txt', 'back to the Reels'], ['key', 'M'], ['txt', 'mute']], X, 762);
    } else {
      throw new Error(`render: no control hints for mode '${game.mode}'`);
    }
  }

  function toastColor(kind, fallback) {
    const k = String(kind).toLowerCase();
    if (/loan|debt|bust|drain|garnish/.test(k)) return RED;
    if (/aid|trust|commons/.test(k)) return THREADS.commons.color;
    if (/jackpot|payout|marks|score|boon|save/.test(k)) return BRASS_HI;
    return fallback;
  }

  // ─────────── the Reels of Assay and the ledger ───────────

  function drawReels(g, game, fx, dt) {
    const now = fx.timeMs;
    const slot = game.slot;
    const econ = game.econ;
    const X = 866;
    const R = 1254;
    const spinning = slot.phase === 'spinning';
    const payout = slot.result ? slot.result.payout : null;
    const shown = payout && !spinning; // result is on the payline
    const win = shown && (payout.writs > 0 || payout.marks > 0 || payout.boon);
    const focus = game.mode === 'slot';

    // header
    g.font = `600 17px ${SERIF}`;
    g.fillStyle = BRASS_HI;
    g.shadowColor = 'rgba(255,170,80,0.5)';
    g.shadowBlur = 12;
    spaced(g, 'THE REELS OF ASSAY', 1060, 46, 4, 'center');
    g.shadowBlur = 0;
    g.font = `italic 12px ${SERIF}`;
    g.fillStyle = A(PAPER, 0.45);
    g.textAlign = 'center';
    g.fillText('Mint of Aurelle  ·  payable in calm', 1060, 64);
    g.textAlign = 'left';

    // housing
    const hx = X;
    const hy = 78;
    const hw = R - X;
    const hh = 318;
    rr(g, hx, hy, hw, hh, 16);
    g.fillStyle = brassGrad(g, hx, hy, hx + hw, hy + hh);
    g.shadowColor = win ? 'rgba(255,190,90,0.8)' : 'rgba(0,0,0,0.9)';
    g.shadowBlur = win ? 26 + 10 * Math.sin(now / 120) : 14;
    g.fill();
    g.shadowBlur = 0;
    rr(g, hx + 3, hy + 3, hw - 6, hh - 6, 13);
    const face = g.createLinearGradient(0, hy, 0, hy + hh);
    face.addColorStop(0, '#2b1e11');
    face.addColorStop(1, '#130d08');
    g.fillStyle = face;
    g.fill();

    // chase lamps
    const lamps = 13;
    for (let i = 0; i < lamps; i++) {
      const lx = hx + 22 + ((hw - 44) * i) / (lamps - 1);
      let on;
      if (spinning) on = mod(Math.floor(now / 70) - i, 4) === 0 ? 1 : 0.15;
      else if (win) on = Math.floor(now / 180) % 2 === i % 2 ? 1 : 0.25;
      else on = focus ? 0.35 + 0.15 * Math.sin(now / 600 + i) : 0.15;
      for (const ly of [hy + 13, hy + hh - 13]) {
        if (on > 0.3) glow(g, lx, ly, 11, LANTERN, 0.5 * on);
        g.fillStyle = A(LANTERN, 0.25 + 0.75 * on);
        g.beginPath();
        g.arc(lx, ly, 2.6, 0, TAU);
        g.fill();
      }
    }

    // reel windows
    const RW = 112;
    const GAP = 12;
    const CELL = 92;
    const wy = hy + 26;
    const wh = hh - 52;
    const cy = wy + wh / 2;
    const x0 = hx + (hw - (RW * 3 + GAP * 2)) / 2;
    for (let i = 0; i < 3; i++) {
      const strip = REEL_STRIPS[i];
      const pose = reelPose(i, slot);
      const rx = x0 + i * (RW + GAP);
      g.save();
      rr(g, rx, wy, RW, wh, 6);
      g.clip();
      const paper = g.createLinearGradient(rx, 0, rx + RW, 0);
      paper.addColorStop(0, '#d9c9a4');
      paper.addColorStop(0.5, '#f3e8cc');
      paper.addColorStop(1, '#d4c39c');
      g.fillStyle = paper;
      g.fillRect(rx, wy, RW, wh);
      const fl = Math.floor(pose.p);
      const fr = pose.p - fl;
      const blur = clamp(pose.speed / REEL_SPEED, 0, 1);
      for (let k = -2; k <= 2; k++) {
        const sym = strip[mod(fl + k, strip.length)];
        const y = cy - (k - fr) * CELL;
        // divider between cells
        g.fillStyle = 'rgba(90,65,25,0.22)';
        g.fillRect(rx + 8, y + CELL / 2 - 0.5, RW - 16, 1);
        if (blur > 0.25) {
          g.globalAlpha = 0.22 * blur;
          drawSymbol(g, sym, rx + RW / 2, y - CELL * 0.2 * blur, 33);
          drawSymbol(g, sym, rx + RW / 2, y + CELL * 0.2 * blur, 33);
          g.globalAlpha = 1 - 0.55 * blur;
        }
        drawSymbol(g, sym, rx + RW / 2, y, 33);
        g.globalAlpha = 1;
      }
      // the drum curves away top and bottom
      const curve = g.createLinearGradient(0, wy, 0, wy + wh);
      curve.addColorStop(0, 'rgba(8,5,3,0.95)');
      curve.addColorStop(0.2, 'rgba(8,5,3,0.42)');
      curve.addColorStop(0.36, 'rgba(8,5,3,0)');
      curve.addColorStop(0.64, 'rgba(8,5,3,0)');
      curve.addColorStop(0.8, 'rgba(8,5,3,0.42)');
      curve.addColorStop(1, 'rgba(8,5,3,0.95)');
      g.fillStyle = curve;
      g.fillRect(rx, wy, RW, wh);
      if (win) {
        g.fillStyle = `rgba(255,200,110,${0.1 + 0.08 * Math.sin(now / 120 + i)})`;
        g.fillRect(rx, cy - CELL / 2, RW, CELL);
      }
      g.restore();
      rr(g, rx, wy, RW, wh, 6);
      g.strokeStyle = '#0a0705';
      g.lineWidth = 3;
      g.stroke();
      rr(g, rx - 1.5, wy - 1.5, RW + 3, wh + 3, 7);
      g.strokeStyle = A(BRASS_HI, 0.55);
      g.lineWidth = 1;
      g.stroke();
    }
    // payline
    g.strokeStyle = win ? A('#fff', 0.8) : A(RED, 0.55);
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(x0 - 4, cy);
    g.lineTo(x0 + RW * 3 + GAP * 2 + 4, cy);
    g.stroke();
    for (const [px, dir] of [[x0 - 5, 1], [x0 + RW * 3 + GAP * 2 + 5, -1]]) {
      g.fillStyle = win ? '#fff' : BRASS_HI;
      g.beginPath();
      g.moveTo(px + dir * 5, cy);
      g.lineTo(px - dir * 7, cy - 8);
      g.lineTo(px - dir * 7, cy + 8);
      g.closePath();
      g.fill();
    }

    // payout plate
    const py = 406;
    rr(g, X, py, hw, 96, 8);
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.fill();
    g.strokeStyle = A(BRASS, win ? 0.7 : 0.25);
    g.lineWidth = 1;
    g.stroke();
    g.textAlign = 'center';
    if (shown) {
      fitFont(g, payout.name, hw - 28, 21, (s) => `600 ${s}px ${SERIF}`);
      g.fillStyle = win ? BRASS_HI : A(PAPER, 0.6);
      if (win) {
        g.shadowColor = 'rgba(255,180,80,0.7)';
        g.shadowBlur = 12;
      }
      g.fillText(payout.name, 1060, py + 27);
      g.shadowBlur = 0;
      g.font = `italic 14px ${SERIF}`;
      g.fillStyle = A(PAPER, 0.78);
      const bl = wrap(g, payout.blurb, hw - 32).slice(0, 2);
      bl.forEach((l, i) => g.fillText(l, 1060, py + 48 + i * 17));
      const gains = [];
      if (payout.writs > 0) gains.push(`+${payout.writs} writ${payout.writs === 1 ? '' : 's'}`);
      if (payout.marks > 0) gains.push(`+${fmtInt(payout.marks)} marks`);
      if (payout.boon) gains.push(boonName(payout.boon));
      g.font = `600 12px ${MONO}`;
      g.fillStyle = win ? LANTERN : A(PAPER, 0.4);
      g.fillText(gains.length ? gains.join('   ·   ') : 'nothing allotted', 1060, py + 86);
    } else if (spinning) {
      g.font = `italic 19px ${SERIF}`;
      g.fillStyle = A(PAPER, 0.7);
      g.fillText('The reels turn' + '.'.repeat(1 + (Math.floor(now / 350) % 3)), 1060, py + 44);
      g.font = `italic 13px ${SERIF}`;
      g.fillStyle = A(PAPER, 0.4);
      g.fillText('By lot, and by law.', 1060, py + 68);
    } else {
      g.font = `italic 18px ${SERIF}`;
      g.fillStyle = A(PAPER, 0.75);
      g.fillText('Force is licensed. Writs are allotted by lot.', 1060, py + 40);
      g.font = `600 12px ${MONO}`;
      g.fillStyle = A(LANTERN, focus ? 0.6 + 0.4 * Math.sin(now / 260) : 0.4);
      g.fillText(`${view.touch ? 'TAP' : 'ENTER'}  ·  ${fmtInt(SPIN_COST)} MARKS A DRAW`, 1060, py + 70);
    }
    g.textAlign = 'left';

    // in play the reels stand back; the ledger stays readable
    if (!focus) {
      rr(g, X - 4, 28, hw + 8, 478, 12);
      g.fillStyle = 'rgba(6,4,3,0.5)';
      g.fill();
    }

    drawLedger(g, game, econ, now, dt, X, R);
  }

  function boonName(boon) {
    if (boon === 'ballSave') return 'ball save';
    if (boon === 'multiball') return 'multiball';
    if (boon === 'doubleMarks') return 'double marks';
    throw new Error(`render: unknown boon '${boon}'`);
  }

  function ease(key, target, dt) {
    const cur = view.eased[key];
    if (cur === null || !Number.isFinite(cur)) return (view.eased[key] = target);
    const next = cur + (target - cur) * Math.min(1, dt * 7);
    return (view.eased[key] = Math.abs(target - next) < 0.5 ? target : next);
  }

  function drawLedger(g, game, econ, now, dt, X, R) {
    const y0 = 512;
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
    g.moveTo(1060.5, y0 + 12);
    g.lineTo(1060.5, y0 + 124);
    g.stroke();

    const cap = (text, x, y, color = A(BRASS, 0.75)) => {
      g.font = `600 10px ${SERIF}`;
      g.fillStyle = color;
      spaced(g, text, x, y, 2.5);
    };
    const L = X + 16;
    const C = 1076;

    // marks
    const marks = ease('marks', econ.marks, dt);
    cap('MARKS', L, y0 + 24);
    g.font = `600 30px ${MONO}`;
    g.fillStyle = BRASS_HI;
    g.shadowColor = 'rgba(255,180,80,0.45)';
    g.shadowBlur = 10;
    g.fillText(fmtInt(marks), L, y0 + 56);
    g.shadowBlur = 0;
    if (game.boons && game.boons.mult > 1 && game.boons.multT > 0) {
      g.font = `700 13px ${MONO}`;
      g.fillStyle = LANTERN;
      g.textAlign = 'right';
      g.fillText(`×${game.boons.mult}`, 1048, y0 + 56);
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
      g.shadowColor = 'rgba(230,60,40,0.6)';
      g.shadowBlur = 10;
      g.fillText(fmtInt(Math.ceil(debt)), C, y0 + 116);
      g.shadowBlur = 0;
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
      g.shadowColor = tc;
      g.shadowBlur = 8;
      g.fillRect(bx, by, (bw * trust) / 100, 12);
      g.restore();
      g.shadowBlur = 0;
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
    const chips = [];
    const b = game.boons || { ballSave: 0, mult: 1, multT: 0 };
    if (b.ballSave > 0) chips.push([`BALL SAVE ${Math.ceil(b.ballSave)}s`, LANTERN]);
    if (b.mult > 1 && b.multT > 0) chips.push([`MARKS ×${b.mult} ${Math.ceil(b.multT)}s`, BRASS_HI]);
    const balls = game.phys ? game.phys.balls.length : 0;
    if (balls > 1) chips.push([`MULTIBALL ${balls}`, STEEL]);
    if (chips.length === 0) {
      g.font = `italic 14px ${SERIF}`;
      g.fillStyle = A(PAPER, 0.35);
      g.fillText('none in force', L, y0 + 248);
    }
    // all three boons at once are wider than the room beside the balance: step the type down until they fit
    const room = R - 16 - BAL_W - 10 - L;
    let size = 11;
    let pad = 9;
    const rowWidth = () => {
      g.font = `700 ${size}px ${MONO}`;
      return chips.reduce((sum, [text]) => sum + g.measureText(text).width + pad * 2, 0) + 8 * Math.max(0, chips.length - 1);
    };
    while (size > 7 && rowWidth() > room) {
      size -= 1;
      pad = Math.max(5, pad - 1);
    }
    let cx = L;
    for (const [text, col] of chips) {
      g.font = `700 ${size}px ${MONO}`;
      const cw = g.measureText(text).width + pad * 2;
      rr(g, cx, y0 + 234, cw, 22, 11);
      g.fillStyle = A(col, 0.14);
      g.fill();
      g.strokeStyle = A(col, 0.8);
      g.lineWidth = 1;
      g.stroke();
      g.fillStyle = col;
      g.textBaseline = 'middle';
      g.fillText(text, cx + pad, y0 + 245.5);
      g.textBaseline = 'alphabetic';
      cx += cw + 8;
    }
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

  // ─────────── touch: where a finger does what ───────────
  // Drawn over the cabinet, faintly, and only when view.touch is set.

  function touchTag(g, text, x, y, color, a, align = 'center') {
    g.font = `700 9px ${MONO}`;
    g.fillStyle = A(color, a);
    spaced(g, text, x, y, 1.5, align);
  }

  function touchFrame(g, x, y, w, h, color, a) {
    rr(g, x, y, w, h, 12);
    g.strokeStyle = A(color, a);
    g.lineWidth = 1.2;
    g.setLineDash([5, 7]);
    g.stroke();
    g.setLineDash([]);
  }

  function drawTouchZones(g, game, now) {
    const pulse = 0.5 + 0.5 * Math.sin(now / 320);
    if (game.mode === 'slot') {
      // the middle third is the table; everything else is the Reels
      const x0 = W * TOUCH.tableFrom;
      const x1 = W * TOUCH.tableTo;
      const ready = game.econ.writs > 0 && game.slot.phase !== 'spinning';
      touchFrame(g, x0 + 5, 5, x1 - x0 - 10, H - 10, BRASS_HI, ready ? 0.14 + 0.1 * pulse : 0.1);
      touchTag(g, 'TAP · THE TABLE', (x0 + x1) / 2, H - 14, BRASS_HI, ready ? 0.5 : 0.28);
      touchTag(g, 'TAP · THE REELS', (x1 + W) / 2, H - 14, LANTERN, 0.3);
      return;
    }
    if (game.mode !== 'play') throw new Error(`render: no touch zones for mode '${game.mode}'`);
    const balls = game.phys ? game.phys.balls : [];
    const waiting = balls.some((b) => b.state === 'plunger');
    const live = balls.some((b) => b.state === 'live');
    const top = H * TOUCH.top;
    // the two flipper halves, split down the middle of the table
    g.strokeStyle = A(PAPER, 0.1);
    g.lineWidth = 1;
    g.setLineDash([3, 9]);
    g.beginPath();
    g.moveTo(W / 2 + 0.5, top);
    g.lineTo(W / 2 + 0.5, H);
    g.stroke();
    g.setLineDash([]);
    touchTag(g, '◀ LEFT FLIPPER', W / 2 - 14, H - 10, PAPER, 0.3, 'right');
    touchTag(g, 'RIGHT FLIPPER ▶', W / 2 + 14, H - 10, PAPER, 0.3, 'left');
    // the plunger corner
    const px = W * TOUCH.plungeX;
    const py = H * TOUCH.plungeY;
    const charge = game.phys ? clamp(game.phys.charge, 0, 1) : 0;
    if (charge > 0) {
      rr(g, px + 5, py + 5, W - px - 10, H - py - 10, 12);
      g.fillStyle = A(LANTERN, 0.08 * charge);
      g.fill();
    }
    touchFrame(g, px + 5, py + 5, W - px - 10, H - py - 10, LANTERN, waiting ? 0.22 + 0.2 * pulse : 0.12);
    touchTag(g, 'HOLD · RELEASE TO PLUNGE', (px + W) / 2, H - 10, LANTERN, waiting ? 0.75 : 0.3);
    // the way back to the Reels: the right end of the top strip
    const rx = W * TOUCH.reelsFrom;
    touchFrame(g, rx + 5, 5, W - rx - 10, top - 10, BRASS_HI, live ? 0.1 : 0.18 + 0.14 * pulse);
    touchTag(g, 'TAP · BACK TO THE REELS', W - 34, 21, BRASS_HI, live ? 0.26 : 0.6, 'right');
  }

  // ─────────── the unified cabinet (slot and play) ───────────

  function drawCabinet(g, content, game, fx, dt) {
    const chapter = chapterOf(content, game);
    const table = tableOf(content, chapter);
    const scene = currentScene(content, game);
    const lit = new Set(litIds(content, game));
    const threadCol = scene ? (THREADS[scene.thread] || {}).color : BRASS;
    if (!threadCol) throw new Error(`render: scene '${scene.id}' has unknown thread '${scene.thread}'`);
    const scale = canvas.width / W;
    const now = fx.timeMs;

    g.drawImage(layer('chrome', W, H, scale, paintChrome), 0, 0, W, H);

    // the table, shaken on impact
    const sh = clamp(fx.shake || 0, 0, 1);
    g.save();
    g.beginPath();
    g.rect(TX, 0, TW, H);
    g.clip();
    g.translate(TX + Math.sin(now / 17) * 7 * sh, Math.cos(now / 13) * 5 * sh);
    drawTable(g, table, game, scene, lit, threadCol, now, dt);
    g.restore();

    g.save();
    g.translate(TX, 0);
    const pulse = 0.5 + 0.5 * Math.sin(now / 260);
    if (game.mode === 'slot') {
      g.fillStyle = 'rgba(5,3,2,0.52)';
      g.fillRect(0, 0, TW, H);
      if (game.econ.writs > 0) tableBanner(g, `${view.touch ? 'Tap here' : 'P'} — send the Plumb through the Orrery`, 400, BRASS_HI, 0.75 + 0.25 * pulse);
      else tableBanner(g, 'No writ, no Plumb. The Reels decide.', 400, PAPER, 0.7);
    } else {
      const balls = game.phys ? game.phys.balls : [];
      if (balls.some((b) => b.state === 'plunger')) tableBanner(g, view.touch ? 'Hold the corner, release to plunge' : 'Hold Space, release to plunge', 506, BRASS_HI, 0.7 + 0.3 * pulse);
      else if (balls.length === 0) tableBanner(g, `${view.touch ? 'Top right' : 'R'} — back to the Reels`, 506, PAPER, 0.7 + 0.3 * pulse);
    }
    g.drawImage(layer('bezel', TW + 16, H, scale, (c) => { c.translate(8, 0); paintBezel(c); }), -8, 0, TW + 16, H);
    g.restore();

    drawStory(g, content, game, fx, chapter, scene, table, threadCol);
    drawReels(g, game, fx, dt);
    if (view.touch) drawTouchZones(g, game, now);
  }

  // ─────────── title, chapter card, end ───────────

  function nightSky(g, now, warm) {
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#05070f');
    bg.addColorStop(0.55, '#0b1020');
    bg.addColorStop(0.56, '#070a14');
    bg.addColorStop(1, '#020203');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 90; i++) {
      const tw = 0.3 + 0.7 * Math.abs(Math.sin(now / 1400 + i * 2.1));
      g.fillStyle = `rgba(220,225,255,${0.5 * tw * hash(i + 300)})`;
      g.fillRect(hash(i) * W, hash(i + 500) * H * 0.5, 1.4, 1.4);
    }
    // the sea, and ten thousand paper lanterns going out on it
    const horizon = H * 0.56;
    glow(g, W / 2, horizon, 620, LANTERN, 0.1 * warm);
    for (let i = 0; i < 150; i++) {
      const depth = hash(i + 11); // 0 far, 1 near
      const y = horizon + 6 + depth * depth * (H - horizon - 20);
      const drift = (now / 1000) * (4 + depth * 10) * (hash(i + 77) > 0.5 ? 1 : -1);
      const x = mod(hash(i + 23) * W + drift, W + 40) - 20;
      const s = 1.2 + depth * 5;
      const fl = 0.7 + 0.3 * Math.sin(now / 300 + i);
      glow(g, x, y, s * 5, LANTERN, 0.22 * fl * warm);
      g.fillStyle = A('#ffd9a0', 0.9 * fl * warm);
      rr(g, x - s * 0.5, y - s * 0.8, s, s * 1.4, s * 0.3);
      g.fill();
      g.fillStyle = A(LANTERN, 0.12 * warm);
      g.fillRect(x - s * 0.4, y + s, s * 0.8, s * 3);
    }
    const v = g.createRadialGradient(W / 2, H * 0.45, 260, W / 2, H / 2, 820);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.85)');
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);
  }

  function orreryRings(g, cx, cy, now, a) {
    g.save();
    g.translate(cx, cy);
    for (let k = 0; k < 4; k++) {
      const r = 150 + k * 46;
      g.strokeStyle = A(BRASS, a * (0.32 - k * 0.05));
      g.lineWidth = k === 0 ? 2 : 1;
      g.beginPath();
      g.ellipse(0, 0, r, r * 0.34, 0, 0, TAU);
      g.stroke();
      const ang = now / (2600 + k * 1500) + k * 1.7;
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

  function drawTitle(g, game, fx) {
    const now = fx.timeMs;
    nightSky(g, now, 1);
    orreryRings(g, W / 2, 300, now, 0.8);
    g.textAlign = 'center';
    g.font = `600 13px ${SERIF}`;
    g.fillStyle = A(BRASS, 0.85);
    spaced(g, 'A TREATY  ·  A LOT  ·  A LEDGER', W / 2, 212, 5, 'center');
    g.font = `600 84px ${SERIF}`;
    g.shadowColor = 'rgba(255,170,70,0.75)';
    g.shadowBlur = 38;
    const tg = g.createLinearGradient(0, 240, 0, 340);
    tg.addColorStop(0, '#fff6dc');
    tg.addColorStop(0.55, '#f0cd83');
    tg.addColorStop(1, '#a87a34');
    g.fillStyle = tg;
    spaced(g, 'THE LONG', W / 2, 296, 14, 'center');
    spaced(g, 'SETTLEMENT', W / 2, 382, 14, 'center');
    g.shadowBlur = 0;
    rule(g, W / 2, 410, 300, 0.9);
    g.font = `italic 22px ${SERIF}`;
    g.fillStyle = A(PAPER, 0.85);
    g.fillText('Every note reads: payable in calm.', W / 2, 452);

    const p = 0.78 + 0.22 * Math.sin(now / 420);
    g.font = `600 17px ${SERIF}`;
    g.fillStyle = A(BRASS_HI, p);
    g.shadowColor = 'rgba(255,180,80,0.8)';
    g.shadowBlur = 16 * p;
    spaced(g, view.touch ? 'TAP TO OPEN THE ACCOUNT' : 'PRESS ENTER TO OPEN THE ACCOUNT', W / 2, 640, 4, 'center');
    g.shadowBlur = 0;
    g.textAlign = 'left';
    if (!view.touch) {
      const y = 730;
      let cx = W / 2 - 235;
      cx = hintRow(g, [['key', 'Enter'], ['txt', 'begin']], cx, y) + 14;
      cx = hintRow(g, [['key', 'S'], ['txt', 'skip a scene']], cx, y) + 14;
      hintRow(g, [['key', 'M'], ['txt', 'mute']], cx, y);
    }
    g.font = `italic 13px ${SERIF}`;
    g.fillStyle = A(PAPER, 0.35);
    g.textAlign = 'center';
    g.fillText('A voiced story. Sound on.', W / 2, 770);
    g.textAlign = 'left';
  }

  function drawCard(g, content, game, fx) {
    const now = fx.timeMs;
    const chapter = chapterOf(content, game);
    const table = tableOf(content, chapter);
    const t = game.modeT;
    const a1 = clamp(t / 0.8, 0, 1);
    const a2 = clamp((t - 0.5) / 0.9, 0, 1);
    const a3 = clamp((t - 1.2) / 0.9, 0, 1);
    g.fillStyle = '#040302';
    g.fillRect(0, 0, W, H);
    glow(g, W / 2, 380, 620, table.theme.glow, 0.13 * a1);
    orreryRings(g, W / 2, 392, now, 0.35 * a1);
    g.textAlign = 'center';
    g.font = `600 16px ${SERIF}`;
    g.fillStyle = A(BRASS, a1);
    spaced(g, `CHAPTER ${roman(chapter.number)}`, W / 2, 300, 9, 'center');
    rule(g, W / 2, 322, 220 * a1, a1);
    fitFont(g, chapter.title, 1080, 78, (s) => `600 ${s}px ${SERIF}`);
    g.fillStyle = A('#fff3d6', a2);
    g.shadowColor = `rgba(255,170,70,${0.6 * a2})`;
    g.shadowBlur = 30;
    g.fillText(chapter.title, W / 2, 412 + (1 - a2) * 10);
    g.shadowBlur = 0;
    fitFont(g, chapter.subtitle, 1000, 24, (s) => `italic ${s}px ${SERIF}`);
    g.fillStyle = A(PAPER, 0.8 * a3);
    g.fillText(chapter.subtitle, W / 2, 462);
    g.font = `600 12px ${SERIF}`;
    g.fillStyle = A(table.theme.accent, 0.8 * a3);
    spaced(g, String(table.name).toUpperCase(), W / 2, 520, 6, 'center');
    g.textAlign = 'left';
    if (t > 1.6) {
      const p = 0.5 + 0.5 * Math.sin(now / 420);
      g.globalAlpha = 0.5 + 0.5 * p;
      hintRow(g, [['key', view.touch ? 'Tap' : 'Enter'], ['txt', 'continue']], W / 2 - 62, 720);
      g.globalAlpha = 1;
    }
    // letterbox bars
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, 70);
    g.fillRect(0, H - 40, W, 40);
  }

  function drawEnd(g, content, game, fx, dt) {
    const now = fx.timeMs;
    const e = game.econ;
    nightSky(g, now, 0.45);
    g.textAlign = 'center';
    g.font = `600 13px ${SERIF}`;
    g.fillStyle = A(BRASS, 0.85);
    spaced(g, 'THE LONG SETTLEMENT', W / 2, 150, 6, 'center');
    g.font = `600 54px ${SERIF}`;
    g.fillStyle = '#fff3d6';
    g.shadowColor = 'rgba(255,170,70,0.5)';
    g.shadowBlur = 26;
    g.fillText('Here the ledger rests.', W / 2, 232);
    g.shadowBlur = 0;
    rule(g, W / 2, 262, 280, 0.9);
    g.font = `italic 20px ${SERIF}`;
    g.fillStyle = A(PAPER, 0.75);
    g.fillText('The account is not closed. It is carried forward.', W / 2, 302);

    // the page
    const px = W / 2 - 260;
    const py = 344;
    rr(g, px, py, 520, 250, 10);
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
    rows.forEach(([k, v, col], i) => {
      const y = py + 46 + i * 42;
      g.textAlign = 'left';
      g.font = `18px ${SERIF}`;
      g.fillStyle = A(PAPER, 0.75);
      g.fillText(k, px + 32, y);
      g.textAlign = 'right';
      g.font = `600 20px ${MONO}`;
      g.fillStyle = col;
      g.fillText(v, px + 488, y);
      if (i < rows.length - 1) {
        g.fillStyle = A(BRASS, 0.15);
        g.fillRect(px + 32, y + 14, 456, 1);
      }
    });
    g.textAlign = 'center';
    g.font = `italic 17px ${SERIF}`;
    g.fillStyle = A(PAPER, 0.55 + 0.25 * Math.sin(now / 600));
    g.fillText(`End of the chapters written so far: ${content.chapters.length}. The Circuit goes on.`, W / 2, 706);
    g.textAlign = 'left';
    // How the book stands as it is carried forward: the same wordless scales as the ledger's, larger.
    g.save();
    g.translate(W / 2, 640);
    g.scale(1.9, 1.9);
    drawBalance(g, e, 0, 0, now, dt);
    g.restore();
    if (view.touch) hintRow(g, [['key', 'Tap'], ['txt', 'return to the title']], W / 2 - 96, 752);
    else hintRow(g, [['key', 'Enter'], ['txt', 'return to the title'], ['key', 'M'], ['txt', 'mute']], W / 2 - 150, 752);
  }

  // ─────────── entry point ───────────

  function draw(content, game, fx) {
    const sx = canvas.width / W;
    const sy = canvas.height / H;
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    if (game.mode === 'cine') {
      view.lastMs = fx.timeMs;
      drawCinema(ctx, content, game, fx);
      return;
    }

    const dt = view.lastMs === null ? 0 : clamp((fx.timeMs - view.lastMs) / 1000, 0, 0.1);
    view.lastMs = fx.timeMs;

    ctx.save();
    if (game.mode === 'title') drawTitle(ctx, game, fx);
    else if (game.mode === 'card') drawCard(ctx, content, game, fx);
    else if (game.mode === 'end') drawEnd(ctx, content, game, fx, dt);
    else if (game.mode === 'slot' || game.mode === 'play') drawCabinet(ctx, content, game, fx, dt);
    else throw new Error(`render: unknown game mode '${game.mode}'`);
    ctx.restore();

    if (fx.flash && fx.flash.a > 0) {
      ctx.fillStyle = A(fx.flash.color, clamp(fx.flash.a, 0, 1));
      ctx.fillRect(0, 0, W, H);
    }
  }

  return { draw };
}
