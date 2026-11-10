// Faces for the cast: eyes, lids, mouths, cheek markings and emote effects, drawn once with the 2D
// canvas API into one atlas and worn by characters.js as curved decals on the head.
// Needs a DOM (it draws on a canvas); characters.js works without it, faceless, under node.
//
// A face is five layers, bottom to top, each one decal node whose uvRect is swapped per frame:
//   eyes   the eyeball: white with a big iris. Both eyes are one mesh and share one cell; the iris
//          is moved (eye direction) by sliding the uv window, so nothing has to be clipped
//   lids   a skin-coloured mask with the eye opening cut out of it, the upper-lid shadow and the
//          lash line. One cell per (lid set, emote, open | shut). The skin is drawn WHITE and the
//          node is tinted with the character's skin colour, so the whole cast shares these cells
//   marks  per character: blush, freckles, laugh lines, scars
//   mouth  shared: one closed shape per emote and three open shapes in three styles for talking
//   fx     shared, only shown for some emotes: tears, a deeper blush, shock lines, an anger flush
// Brows are not here: they are small 3D meshes on the head (characters.js), so they stand off the
// brow in profile and blend smoothly between emotes.
//
//   createFaces({ size = 2048 }) -> {
//     atlas, material,                       one 'blend' material for every face layer of every character
//     lid(set, emote, shut) -> rect          set: 'round' | 'lash' | 'old'
//     eyeball(irisColor, kind) -> rect       kind: 'normal' | 'small' | 'wet'
//     mouth(emote, level 0..3) -> rect
//     marks(key, spec) -> rect               spec: { skin, blush, freckles, laugh, scar, beauty }
//     fx(name) -> rect | null
//   }
// Cells are added the first time they are asked for; characters.js asks for everything a character
// can show when it is created, so nothing is drawn (and the texture is not re-uploaded) during play.

import { createAtlas } from './atlas.js';
import { material } from './scene.js';
import { rgb } from './math.js';

export const EMOTES = ['neutral', 'smile', 'grim', 'shock', 'tears', 'anger', 'soft'];

/**
 * What each emote does to the face. `lid` shapes the eye opening (fractions of the lid cell):
 *   ht / hb  height of the opening above / below its centre line
 *   c1 / c2  how high the upper lid arches at the inner (nose) end and the outer end, 1 = a round arch
 *   tilt     raises the outer corner;  bot  how round the lower lid is (low = pushed up by a cheek)
 * `brow` is [raise, scowl] in degrees for the 3D brows (scowl > 0 pulls the inner ends down).
 * `mouth` is the closed shape, `open` the style of the talking shapes, `eye` the eyeball cell,
 * `fx` the overlay, `shut` the shape of the closed eye ('down' a sleeping curve, 'up' a happy arch).
 */
export const EMOTE = {
  neutral: { lid: { ht: 0.31, hb: 0.28, c1: 1.0, c2: 1.0, tilt: 0.015, bot: 1.0 }, brow: [0, 0], mouth: 'plain', open: 'O', eye: 'normal', fx: null, shut: 'down' },
  smile: { lid: { ht: 0.31, hb: 0.2, c1: 1.04, c2: 1.04, tilt: 0.025, bot: 0.38 }, brow: [3.5, -4], mouth: 'happy', open: 'D', eye: 'normal', fx: 'blush', shut: 'up' },
  grim: { lid: { ht: 0.17, hb: 0.24, c1: 0.42, c2: 0.5, tilt: 0.0, bot: 0.95 }, brow: [-4.5, 7], mouth: 'down', open: 'A', eye: 'normal', fx: null, shut: 'down' },
  shock: { lid: { ht: 0.355, hb: 0.31, c1: 1.06, c2: 1.06, tilt: 0.0, bot: 1.05 }, brow: [8, -5], mouth: 'o', open: 'O', eye: 'small', fx: 'shock', shut: 'down' },
  tears: { lid: { ht: 0.25, hb: 0.25, c1: 1.2, c2: 0.5, tilt: -0.045, bot: 0.8 }, brow: [3, -17], mouth: 'wobble', open: 'A', eye: 'wet', fx: 'tears', shut: 'down' },
  anger: { lid: { ht: 0.25, hb: 0.23, c1: 0.0, c2: 1.0, tilt: 0.05, bot: 0.72 }, brow: [-5.5, 21], mouth: 'grit', open: 'A', eye: 'normal', fx: 'anger', shut: 'down' },
  soft: { lid: { ht: 0.2, hb: 0.25, c1: 0.85, c2: 0.62, tilt: -0.012, bot: 1.0 }, brow: [1.5, -9], mouth: 'softsmile', open: 'D', eye: 'normal', fx: 'softblush', shut: 'up' },
};

/** The angular layout of the face decals on the head, shared with characters.js (degrees). */
export const FACE = {
  eyeYaw: 24, eyePitch: -6,
  lid: { w: 41.5, h: 46.7 },      // one eye's lid patch; the opening is 60% of its width
  ball: { w: 30, h: 38 },         // the eyeball patch under it
  window: 0.7,                    // the eyeball patch shows this much of the eyeball cell, so the iris can slide
  mouth: { pitch: -31.5, w: 27, h: 18.6 },
  wide: { pitch: -12, w: 100, h: 66 }, // marks and fx: one patch across the whole face
};

const LW = 128, LH = 144;   // lid cell
const BS = 192;             // eyeball cell
const MW = 128, MH = 88;    // mouth cell
const WW = 288, WH = 190;   // marks / fx cell
const INK = '#3d2a4c';      // lash and mouth ink (the lash is multiplied by the skin tint, so it lands near plum-black)
const MOUTH_INK = '#3a2038';

const hex = (c) => { const r = rgb(c); return '#' + [0, 1, 2].map((i) => Math.round(Math.max(0, Math.min(1, r[i])) * 255).toString(16).padStart(2, '0')).join(''); };
const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]); };
const rgba = (c, a) => { const r = rgb(c); return `rgba(${Math.round(r[0] * 255)},${Math.round(r[1] * 255)},${Math.round(r[2] * 255)},${a})`; };

// Transparent canvas pixels come back from the browser as transparent BLACK, and a linear filter
// then drags black into every soft edge. Putting the colour underneath at 1/255 alpha keeps the
// colour and stays under the renderer's discard threshold.
function underfill(g, w, h, color) {
  g.globalCompositeOperation = 'destination-over'; g.fillStyle = rgba(color, 0.0045); g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over';
}

// ------------------------------------------------------------------------------------ eyes

function openingPath(g, w, h, L) {
  const cx = w * 0.5, cy = h * 0.52, a = w * 0.3;
  const ix = cx - a, iy = cy + h * 0.03, ox = cx + a, oy = cy - L.tilt * h;
  g.beginPath(); g.moveTo(ix, iy);
  g.bezierCurveTo(cx - a * 0.86, cy - L.ht * h * 1.33 * L.c1, cx + a * 0.62, cy - L.ht * h * 1.33 * L.c2 - L.tilt * h, ox, oy);
  g.bezierCurveTo(cx + a * 0.9, cy + L.hb * h * 1.33 * L.bot, cx - a * 0.72, cy + L.hb * h * 1.33 * L.bot, ix, iy);
  g.closePath();
}
function topLid(g, w, h, L) {
  const cx = w * 0.5, cy = h * 0.52, a = w * 0.3;
  g.beginPath(); g.moveTo(cx - a, cy + h * 0.03);
  g.bezierCurveTo(cx - a * 0.86, cy - L.ht * h * 1.33 * L.c1, cx + a * 0.62, cy - L.ht * h * 1.33 * L.c2 - L.tilt * h, cx + a, cy - L.tilt * h);
}

function drawLid(set, L, shut, shutStyle) {
  return (g, w, h) => {
    const cx = w * 0.5, cy = h * 0.52, a = w * 0.3, f = 9;
    // the skin mask: opaque in the middle, feathered at the cell's edge
    g.fillStyle = '#fff'; g.fillRect(f, f, w - 2 * f, h - 2 * f);
    const strip = (x0, y0, x1, y1, rx, ry, rw, rh) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(rx, ry, rw, rh); };
    strip(f, 0, 0, 0, 0, f, f, h - 2 * f); strip(w - f, 0, w, 0, w - f, f, f, h - 2 * f);
    strip(0, f, 0, 0, f, 0, w - 2 * f, f); strip(0, h - f, 0, h, f, h - f, w - 2 * f, f);
    for (const [px, py] of [[f, f], [w - f, f], [f, h - f], [w - f, h - f]]) {
      const gr = g.createRadialGradient(px, py, 0, px, py, f); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(px < w / 2 ? 0 : w - f, py < h / 2 ? 0 : h - f, f, f);
    }
    const old = set === 'old', lash = set === 'lash';
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (shut) {
      // a closed eye: one thick curve. 'up' is the happy arch, 'down' the resting lid
      const y0 = cy + h * (shutStyle === 'up' ? 0.07 : 0.03), bend = h * (shutStyle === 'up' ? -0.15 : 0.13);
      g.strokeStyle = INK; g.lineWidth = w * (old ? 0.07 : 0.085);
      g.beginPath(); g.moveTo(cx - a * 0.98, y0); g.quadraticCurveTo(cx, y0 + bend * 2, cx + a * 1.02, y0 - h * 0.01); g.stroke();
      if (lash) { g.lineWidth = w * 0.05; g.beginPath(); g.moveTo(cx + a * 0.95, y0); g.lineTo(cx + a * 1.3, y0 + (shutStyle === 'up' ? 0.045 : 0.05) * h); g.moveTo(cx + a * 0.7, y0 + bend * 0.55); g.lineTo(cx + a * 0.98, y0 + bend * 0.55 + 0.06 * h); g.stroke(); }
      if (old) { g.lineWidth = w * 0.028; g.globalAlpha = 0.55; g.beginPath(); g.moveTo(cx - a * 0.5, y0 + h * 0.17); g.quadraticCurveTo(cx, y0 + h * 0.22, cx + a * 0.6, y0 + h * 0.15); g.stroke(); g.globalAlpha = 1; }
      underfill(g, w, h, '#ffffff');
      return;
    }
    // cut the opening
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; openingPath(g, w, h, L); g.fill(); g.globalCompositeOperation = 'source-over';
    // the upper lid's shadow on the eyeball: a soft wide band and a firmer narrow one
    g.save(); openingPath(g, w, h, L); g.clip();
    g.strokeStyle = 'rgba(70,52,150,0.2)'; g.lineWidth = h * 0.3; topLid(g, w, h, L); g.stroke();
    g.strokeStyle = 'rgba(60,40,130,0.3)'; g.lineWidth = h * 0.16; topLid(g, w, h, L); g.stroke();
    g.restore();
    // lower lid: a thin line under the outer half
    g.save(); g.beginPath(); g.rect(cx - a * 0.15, 0, w, h); g.clip();
    g.strokeStyle = INK; g.globalAlpha = old ? 0.7 : 0.45; g.lineWidth = w * 0.028; openingPath(g, w, h, L); g.stroke();
    g.restore(); g.globalAlpha = 1;
    // lash line
    g.strokeStyle = INK; g.lineWidth = w * (old ? 0.07 : lash ? 0.095 : 0.088); topLid(g, w, h, L); g.stroke();
    const ox = cx + a, oy = cy - L.tilt * h;
    if (lash) { // two flicks at the outer corner
      g.lineWidth = w * 0.055;
      g.beginPath(); g.moveTo(ox - w * 0.02, oy - h * 0.02); g.lineTo(ox + w * 0.1, oy - h * 0.075); g.stroke();
      g.beginPath(); g.moveTo(ox - w * 0.09, oy - h * 0.085 * L.c2 - h * 0.03); g.lineTo(ox + w * 0.01, oy - h * 0.16 * Math.max(0.5, L.c2) - h * 0.03); g.stroke();
    } else { // a short tail so the corner is not a blunt end
      g.lineWidth = w * 0.06; g.beginPath(); g.moveTo(ox - w * 0.01, oy); g.lineTo(ox + w * 0.045, oy + h * 0.035); g.stroke();
    }
    if (old) { // a crease above the lid and a soft bag under it
      g.lineWidth = w * 0.026; g.globalAlpha = 0.5;
      g.beginPath(); g.moveTo(cx - a * 0.7, cy - L.ht * h - h * 0.085); g.quadraticCurveTo(cx + a * 0.1, cy - L.ht * h * L.c2 - h * 0.13, cx + a * 0.95, cy - L.ht * h * 0.5 - h * 0.07); g.stroke();
      g.beginPath(); g.moveTo(cx - a * 0.55, cy + L.hb * h + h * 0.07); g.quadraticCurveTo(cx, cy + L.hb * h + h * 0.115, cx + a * 0.6, cy + L.hb * h + h * 0.06); g.stroke();
      g.globalAlpha = 1;
    }
    underfill(g, w, h, '#ffffff');
  };
}

function drawEyeball(color, kind) {
  return (g, s) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
    const c = s / 2, R = s * (kind === 'small' ? 0.125 : 0.215), cy = c - (kind === 'small' ? 0 : s * 0.012);
    const dark = mix(color, '#141033', 0.72), deep = mix(color, '#141033', 0.42), light = mix(color, '#ffffff', 0.5);
    g.fillStyle = dark; g.beginPath(); g.arc(c, cy, R, 0, 7); g.fill();
    const gr = g.createLinearGradient(0, cy - R, 0, cy + R); gr.addColorStop(0, deep); gr.addColorStop(0.5, hex(color)); gr.addColorStop(1, light);
    g.fillStyle = gr; g.beginPath(); g.arc(c, cy, R * 0.86, 0, 7); g.fill();
    // a bright crescent along the bottom of the iris
    g.save(); g.beginPath(); g.arc(c, cy, R * 0.86, 0, 7); g.clip();
    g.fillStyle = rgba(mix(color, '#ffffff', 0.72), 0.85); g.beginPath(); g.ellipse(c, cy + R * 0.74, R * 0.62, R * 0.3, 0, 0, 7); g.fill();
    g.restore();
    g.fillStyle = mix(color, '#0d0a24', 0.9); g.beginPath(); g.ellipse(c, cy - R * 0.04, R * 0.42, R * 0.46, 0, 0, 7); g.fill();
    // catchlights: a big one up and to one side, a small one opposite
    g.fillStyle = '#ffffff';
    const k = kind === 'wet' ? 1.25 : 1;
    g.beginPath(); g.ellipse(c - R * 0.36, cy - R * 0.4, R * 0.31 * k, R * 0.27 * k, -0.4, 0, 7); g.fill();
    g.beginPath(); g.arc(c + R * 0.42, cy + R * 0.36, R * 0.13 * k, 0, 7); g.fill();
    if (kind === 'wet') { g.beginPath(); g.ellipse(c - R * 0.1, cy + R * 0.62, R * 0.3, R * 0.11, 0, 0, 7); g.fill(); g.beginPath(); g.arc(c + R * 0.05, cy - R * 0.62, R * 0.09, 0, 7); g.fill(); }
  };
}

// ------------------------------------------------------------------------------------ mouths

const MOUTH_IN = '#7d2638', TONGUE = '#f58c93', TEETH = '#fff9f0';

const CLOSED = {
  plain(g, w, h) { line(g, w, [[0.37, 0.47], [0.5, 0.56], [0.63, 0.47]]); },
  happy(g, w, h) { line(g, w, [[0.25, 0.36], [0.5, 0.82], [0.75, 0.36]]); tick(g, w, h, 0.25, 0.36, -1); tick(g, w, h, 0.75, 0.36, 1); },
  softsmile(g, w, h) { line(g, w, [[0.34, 0.42], [0.5, 0.66], [0.66, 0.42]]); },
  down(g, w, h) { line(g, w, [[0.33, 0.58], [0.5, 0.38], [0.67, 0.58]]); },
  o(g, w, h) { g.fillStyle = MOUTH_IN; g.strokeStyle = MOUTH_INK; g.lineWidth = w * 0.045; g.beginPath(); g.ellipse(w * 0.5, h * 0.52, w * 0.085, h * 0.2, 0, 0, 7); g.fill(); g.stroke(); },
  wobble(g, w, h) {
    g.strokeStyle = MOUTH_INK; g.lineWidth = w * 0.05; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(w * 0.31, h * 0.6); g.quadraticCurveTo(w * 0.37, h * 0.36, w * 0.44, h * 0.5); g.quadraticCurveTo(w * 0.5, h * 0.62, w * 0.56, h * 0.48); g.quadraticCurveTo(w * 0.63, h * 0.36, w * 0.69, h * 0.6); g.stroke();
  },
  grit(g, w, h) {
    g.fillStyle = TEETH; g.strokeStyle = MOUTH_INK; g.lineWidth = w * 0.045; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(w * 0.3, h * 0.56); g.quadraticCurveTo(w * 0.5, h * 0.26, w * 0.7, h * 0.56); g.quadraticCurveTo(w * 0.72, h * 0.74, w * 0.64, h * 0.78); g.quadraticCurveTo(w * 0.5, h * 0.66, w * 0.36, h * 0.78); g.quadraticCurveTo(w * 0.28, h * 0.74, w * 0.3, h * 0.56); g.closePath(); g.fill(); g.stroke();
    g.lineWidth = w * 0.022; g.beginPath(); g.moveTo(w * 0.33, h * 0.63); g.quadraticCurveTo(w * 0.5, h * 0.46, w * 0.67, h * 0.63); g.moveTo(w * 0.43, h * 0.42); g.lineTo(w * 0.43, h * 0.71); g.moveTo(w * 0.57, h * 0.42); g.lineTo(w * 0.57, h * 0.71); g.stroke();
  },
};
function line(g, w, p) {
  const h = w * MH / MW;
  g.strokeStyle = MOUTH_INK; g.lineWidth = w * 0.055; g.lineCap = 'round';
  g.beginPath(); g.moveTo(p[0][0] * w, p[0][1] * h); g.quadraticCurveTo(p[1][0] * w, p[1][1] * h, p[2][0] * w, p[2][1] * h); g.stroke();
}
function tick(g, w, h, x, y, s) { g.lineWidth = w * 0.045; g.beginPath(); g.moveTo((x - s * 0.02) * w, (y + 0.05) * h); g.lineTo((x + s * 0.025) * w, (y - 0.07) * h); g.stroke(); }

// open mouths: n = 1..3. 'D' a grin (flat top, round bottom), 'O' an oval, 'A' a shout turned down at the corners
function drawOpen(style, n) {
  return (g, w, h) => {
    const k = n / 3, cx = w * 0.5;
    g.fillStyle = MOUTH_IN; g.strokeStyle = MOUTH_INK; g.lineWidth = w * 0.048; g.lineJoin = 'round';
    g.beginPath();
    if (style === 'D') {
      const hw = w * (0.2 + 0.07 * k), top = h * (0.34 - 0.04 * k), dep = h * (0.2 + 0.42 * k);
      g.moveTo(cx - hw, top); g.quadraticCurveTo(cx, top + h * 0.07, cx + hw, top);
      g.bezierCurveTo(cx + hw * 0.95, top + dep * 1.25, cx - hw * 0.95, top + dep * 1.25, cx - hw, top);
    } else if (style === 'O') {
      g.ellipse(cx, h * 0.52, w * (0.1 + 0.07 * k), h * (0.15 + 0.25 * k), 0, 0, 7);
    } else {
      const hw = w * (0.15 + 0.09 * k), top = h * (0.4 - 0.1 * k), bot = h * (0.6 + 0.24 * k);
      g.moveTo(cx - hw * 0.72, top + h * 0.03); g.quadraticCurveTo(cx, top - h * 0.1, cx + hw * 0.72, top + h * 0.03);
      g.quadraticCurveTo(cx + hw * 1.25, (top + bot) * 0.55, cx + hw, bot); g.quadraticCurveTo(cx, bot - h * 0.09, cx - hw, bot);
      g.quadraticCurveTo(cx - hw * 1.25, (top + bot) * 0.55, cx - hw * 0.72, top + h * 0.03);
    }
    g.closePath(); g.fill();
    g.save(); g.clip();
    if (n >= 2 || style === 'A') { g.fillStyle = TEETH; g.fillRect(0, 0, w, h * (style === 'A' ? 0.4 - 0.02 * k : style === 'D' ? 0.36 + 0.03 * k : 0.34)); }
    if (n >= 2) { g.fillStyle = TONGUE; g.beginPath(); g.ellipse(cx + w * 0.01, h * (style === 'D' ? 0.52 + 0.36 * k : style === 'O' ? 0.6 + 0.2 * k : 0.66 + 0.2 * k), w * (0.1 + 0.05 * k), h * (0.12 + 0.07 * k), 0, 0, 7); g.fill(); }
    g.restore();
    g.stroke();
  };
}

// ------------------------------------------------------------------------------------ marks and fx

// where an angle on the face lands in a wide cell
const wx = (yaw) => (yaw / FACE.wide.w + 0.5) * WW;
const wy = (pitch) => ((FACE.wide.pitch + FACE.wide.h / 2 - pitch) / FACE.wide.h) * WH;
const DEGX = WW / FACE.wide.w, DEGY = WH / FACE.wide.h;

function blush(g, yaw, pitch, rw, rh, color, alpha) {
  for (const s of [-1, 1]) {
    const x = wx(yaw * s), y = wy(pitch);
    g.save(); g.translate(x, y); g.scale(rw * DEGX, rh * DEGY);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, rgba(color, alpha)); gr.addColorStop(0.55, rgba(color, alpha * 0.8)); gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, 7); g.fill(); g.restore();
  }
}

function drawMarks(spec) {
  return (g, w, h) => {
    const skin = spec.skin || '#f0c8a0';
    const pink = spec.blushColor || mix(skin, '#ff5a5a', 0.62);
    if (spec.blush !== 0) blush(g, 35, -24, 9.5, 5.6, pink, spec.blush ?? 0.5);
    g.lineCap = 'round';
    if (spec.freckles) {
      g.fillStyle = rgba(mix(skin, '#8a3a1a', 0.62), 0.85);
      const dots = [[27, -22, 1.0], [32, -19.5, 0.85], [37, -22.5, 1.0], [31.5, -25.5, 0.8], [41, -20, 0.7], [23, -19.5, 0.7], [5, -19, 0.75], [-4, -20.5, 0.65]];
      for (const s of [-1, 1]) for (const [a, b, r] of dots) { if (s < 0 && Math.abs(a) < 8) continue; g.beginPath(); g.arc(wx(a * s), wy(b + (s < 0 ? 0.6 : 0)), r * 1.15 * DEGX, 0, 7); g.fill(); }
    }
    if (spec.laugh) {
      g.strokeStyle = rgba(mix(skin, '#4a1c20', 0.6), 0.75); g.lineWidth = 0.95 * DEGX;
      for (const s of [-1, 1]) {
        // crow's feet at the outer corner of each eye
        for (const [dy, len] of [[4.5, 5], [0, 6], [-4.5, 5]]) { g.beginPath(); g.moveTo(wx(s * 42.5), wy(-6 + dy * 0.6)); g.lineTo(wx(s * (42.5 + len)), wy(-6 + dy * 1.5)); g.stroke(); }
        // the line from the nose round the mouth
        g.beginPath(); g.moveTo(wx(s * 11), wy(-22)); g.quadraticCurveTo(wx(s * 19), wy(-28), wx(s * 17.5), wy(-37)); g.stroke();
      }
      // two soft lines on the brow
      g.globalAlpha = 0.6; g.beginPath(); g.moveTo(wx(-13), wy(17.5)); g.quadraticCurveTo(wx(0), wy(19), wx(13), wy(17.5)); g.stroke(); g.globalAlpha = 1;
    }
    if (spec.scar) { // a pale nick down through one brow
      const s = spec.scar === 'R' ? -1 : 1;
      g.strokeStyle = rgba(mix(skin, '#fff0e8', 0.75), 0.95); g.lineWidth = 1.5 * DEGX;
      g.beginPath(); g.moveTo(wx(s * 30), wy(19.5)); g.lineTo(wx(s * 26.5), wy(8.5)); g.stroke();
    }
    if (spec.beauty) { g.fillStyle = rgba(mix(skin, '#2a1410', 0.8), 0.9); g.beginPath(); g.arc(wx(spec.beauty === 'R' ? -30 : 30), wy(-30), 0.9 * DEGX, 0, 7); g.fill(); }
    if (spec.stubble) blush(g, 0, -36, 24, 9, mix(skin, '#30344a', 0.6), 0.4);
  };
}

const FX = {
  blush(g) {
    blush(g, 35, -24, 11, 6.4, '#ff6a6a', 0.55);
    g.strokeStyle = 'rgba(232,72,84,0.8)'; g.lineWidth = 0.95 * DEGX; g.lineCap = 'round';
    for (const s of [-1, 1]) for (const d of [-3, 0, 3]) { g.beginPath(); g.moveTo(wx(s * (35 + d) + 1.2), wy(-22)); g.lineTo(wx(s * (35 + d) - 1.2), wy(-26)); g.stroke(); }
  },
  softblush(g) { blush(g, 34, -24, 12, 6.6, '#ff7a70', 0.5); },
  tears(g) {
    blush(g, 33, -23, 11, 6, '#ff6a6a', 0.45);
    for (const s of [-1, 1]) {
      const x = wx(s * 31), y = wy(-19.5);
      // a drop welling at the outer corner, and its track down the cheek
      g.fillStyle = '#e4f6ff'; g.strokeStyle = '#5a9ae8'; g.lineWidth = 0.75 * DEGX; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(x - 2.6 * DEGX, y - 0.4 * DEGY); g.quadraticCurveTo(x + s * 0.5 * DEGX, y - 1.8 * DEGY, x + 2.8 * DEGX, y - 0.2 * DEGY);
      g.bezierCurveTo(x + 3.6 * DEGX, y + 7 * DEGY, x + 3.2 * DEGX, y + 14 * DEGY, x + 0.6 * DEGX, y + 17.5 * DEGY);
      g.bezierCurveTo(x - 3.4 * DEGX, y + 20 * DEGY, x - 4.6 * DEGX, y + 13 * DEGY, x - 2.6 * DEGX, y - 0.4 * DEGY); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(x - 0.9 * DEGX, y + 12.5 * DEGY, 0.9 * DEGX, 2.2 * DEGY, 0.1, 0, 7); g.fill();
      // a flying droplet
      g.fillStyle = '#e4f6ff'; g.beginPath(); g.arc(wx(s * 44), wy(-13), 1.5 * DEGX, 0, 7); g.fill(); g.stroke();
    }
  },
  shock(g) {
    // cold lines down one side of the brow, and a sweat drop on the other temple
    g.strokeStyle = 'rgba(80,110,220,0.75)'; g.lineWidth = 1.05 * DEGX; g.lineCap = 'round';
    [[-45, 18, 7], [-41, 19, 9], [-37, 19.5, 6.5], [-33, 20, 8]].forEach(([a, b, l]) => { g.beginPath(); g.moveTo(wx(a), wy(b)); g.lineTo(wx(a), wy(b - l)); g.stroke(); });
    const x = wx(43), y = wy(13);
    g.fillStyle = '#dff3ff'; g.strokeStyle = '#5a9ae8'; g.lineWidth = 0.75 * DEGX; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(x, y - 5.5 * DEGY); g.bezierCurveTo(x + 4.6 * DEGX, y + 1.5 * DEGY, x + 3 * DEGX, y + 5.5 * DEGY, x, y + 5.5 * DEGY); g.bezierCurveTo(x - 3 * DEGX, y + 5.5 * DEGY, x - 4.6 * DEGX, y + 1.5 * DEGY, x, y - 5.5 * DEGY); g.closePath(); g.fill(); g.stroke();
  },
  anger(g) {
    blush(g, 30, -22, 15, 7, '#ff4a3a', 0.5);
    blush(g, 0, -19, 9, 4, '#ff4a3a', 0.2);
    // the vein mark on one temple
    const x = wx(42), y = wy(15), r = 3.6 * DEGX;
    g.strokeStyle = '#e6323a'; g.lineWidth = 1.5 * DEGX; g.lineCap = 'round';
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.3; g.beginPath(); g.arc(x + Math.cos(a) * r * 1.42, y + Math.sin(a) * r * 1.42, r, a + Math.PI - 0.62, a + Math.PI + 0.62); g.stroke(); }
  },
};

// ------------------------------------------------------------------------------------ the atlas

export function createFaces({ size = 2048, figure = null } = {}) {
  const atlas = createAtlas(size, { pad: 6 });
  const cells = new Map();
  const cell = (name, w, h, draw) => { let r = cells.get(name); if (!r) { r = atlas.add(name, w, h, draw); cells.set(name, r); } return r; };
  // the face is shaded exactly like the skin under it, or the lid mask shows as a rectangle
  const mat = material({ name: 'face', map: atlas.texture, texMode: 'blend', outline: false, receiveShadow: false, rim: figure ? figure.rim : 1, bands: figure ? figure.bands : 2, bandEdge: figure ? figure.bandEdge : 0, bandSoft: figure ? figure.bandSoft : 0.006 });
  const emoteOf = (e) => { const E = EMOTE[e]; if (!E) throw new Error(`faces: unknown emote "${e}" (have ${EMOTES.join(', ')})`); return E; };
  return {
    atlas, material: mat,
    lid(set, emote, shut) {
      if (set !== 'round' && set !== 'lash' && set !== 'old') throw new Error(`faces: unknown lid set "${set}" (have round, lash, old)`);
      const E = emoteOf(emote);
      return shut ? cell(`lid:${set}:shut:${E.shut}`, LW, LH, drawLid(set, E.lid, true, E.shut)) : cell(`lid:${set}:${emote}`, LW, LH, drawLid(set, E.lid, false, E.shut));
    },
    eyeball(color, kind = 'normal') { const c = hex(color); return cell(`eye:${c}:${kind}`, BS, BS, drawEyeball(c, kind)); },
    mouth(emote, level = 0) {
      const E = emoteOf(emote), n = Math.max(0, Math.min(3, level | 0));
      return n === 0 ? cell(`mouth:${E.mouth}`, MW, MH, CLOSED[E.mouth]) : cell(`mouth:${E.open}${n}`, MW, MH, drawOpen(E.open, n));
    },
    marks(key, spec) { return cell(`marks:${key}`, WW, WH, drawMarks(spec)); },
    fx(name) { if (!name) return null; if (!FX[name]) throw new Error(`faces: unknown fx "${name}" (have ${Object.keys(FX).join(', ')})`); return cell(`fx:${name}`, WW, WH, FX[name]); },
  };
}
