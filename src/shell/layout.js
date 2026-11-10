// Where everything on the screen is. Pure: numbers in, plain data out.
//
//   computeLayout(vw, vh) -> Layout       'portrait' whenever vh > vw, otherwise 'wide'   (the 2D renderer's cabinet)
//   computeGlLayout(vw, vh) -> Layout     the same question for the 3D renderer (src/shell/gl/app.js); see the end of this file
//   toLogical(layout, canvasRect, clientX, clientY) -> [x, y]
//   wantsRotate(vw, vh, touchPrimary) -> boolean       a phone on its side: show "turn me upright" instead of a tiny wide cabinet
//
// The canvas has one logical size per kind (430 x 932 upright, 1280 x 800 on its side) and
// the shell scales that to the glass, so every rectangle here is in logical pixels and is
// the same on every phone. The renderer draws to these rectangles and input hit-tests
// them: a control is where this file says it is and nowhere else.
//
// Portrait, top to bottom:
//   hud    0..120    a ledger line (score, chapter), then the three reels in their window
//                    with marks on their left and writs and trust on their right
//   story  120..184  scene title, objective pips, the line being spoken
//   table  184..920  table space (400 x 800) at 0.92, centred. The flippers come out at
//                    y = 826..860, above where thumbs rest; below them is the drain.
//   launch           bottom right, over the foot of the plunger lane and the outlane's
//                    exit. Its left edge is 79 px right of the right flipper's pivot.
//
// The three controls are placed where no phone's notch or home bar reaches (the tallest
// top inset is 59 pt = 65 logical px, the home bar 34 pt = 38), because they cannot move:
// input reads them from here and has never heard of safe areas.

/**
 * @typedef {{x:number,y:number,w:number,h:number}} Rect
 * @typedef {{x:number,y:number,r:number}} Disc
 * @typedef {Object} Layout
 * @property {'portrait'|'wide'} kind
 * @property {number} W
 * @property {number} H
 * @property {{x:number,y:number,scale:number}} table
 * @property {Rect} hud
 * @property {Rect} story
 * @property {Disc} launch
 * @property {Disc} mute
 * @property {Rect} skip
 * @property {{art:Rect, text:Rect, mute:Disc}} cine   mute: the mute button while a cinematic runs (layout.mute is under the skip button then)
 * @property {GlLayout} [gl]   only on a layout from computeGlLayout
 *
 * @typedef {Object} GlLayout   where the 3D renderer and its HUD put things, logical px
 * @property {Rect} band        the live stage band at rest (in a cinematic it grows to the whole canvas)
 * @property {Rect} table       the viewport the 3D table is drawn into
 * @property {{x:number,y:number,scale:number}} tableFit   what table3d's view.fit() wants: the 2D footprint whose foot the 3D table stands on
 * @property {Rect} reels       screen bounds of the three drums at the head of the table: the HUD keeps off it
 * @property {Rect} flippers    screen bounds of both flippers and the gap between them: the HUD keeps off it
 * @property {Disc} launch      same disc as layout.launch
 * @property {Disc} mute        same disc as layout.mute (in play, title, card, end)
 * @property {Disc} cineMute    same disc as layout.cine.mute (in a cinematic)
 * @property {Rect} skip        same rect as layout.skip
 * @property {Rect} sub         the subtitle box of a full-screen cinematic
 */

const rect = (x, y, w, h) => Object.freeze({ x, y, w, h });
const disc = (x, y, r) => Object.freeze({ x, y, r });

const PORTRAIT = Object.freeze({
  kind: 'portrait',
  W: 430,
  H: 932,
  table: Object.freeze({ x: 31, y: 184, scale: 0.92 }),
  hud: rect(0, 0, 430, 120),
  story: rect(0, 120, 430, 64),
  launch: disc(382, 856, 38),
  mute: disc(408, 97, 16),
  skip: rect(310, 840, 104, 44),
  cine: Object.freeze({ art: rect(0, 0, 430, 540), text: rect(20, 560, 390, 260), mute: disc(268, 862, 18) }),
});

const WIDE = Object.freeze({
  kind: 'wide',
  W: 1280,
  H: 800,
  table: Object.freeze({ x: 440, y: 0, scale: 1 }),
  story: rect(10, 10, 420, 780),
  hud: rect(850, 10, 420, 780),
  launch: disc(1196, 412, 46),
  mute: disc(1242, 38, 14),
  skip: rect(1146, 22, 112, 40),
  cine: Object.freeze({ art: rect(0, 0, 1280, 800), text: rect(160, 600, 960, 170), mute: disc(1106, 42, 15) }),
});

/**
 * @param {number} vw viewport width, css px
 * @param {number} vh viewport height, css px
 * @returns {Layout}
 */
export function computeLayout(vw, vh) {
  if (!(vw > 0) || !(vh > 0) || !Number.isFinite(vw) || !Number.isFinite(vh)) {
    throw new Error(`layout.computeLayout: the viewport must have a positive finite size, got ${String(vw)} x ${String(vh)}`);
  }
  return vh > vw ? PORTRAIT : WIDE;
}

/**
 * A pointer position in logical pixels. canvasRect is the canvas's getBoundingClientRect();
 * a point outside the canvas comes back outside 0..W, 0..H and the caller decides.
 * @param {Layout} layout
 * @param {{left:number,top:number,width:number,height:number}} canvasRect
 * @returns {[number, number]}
 */
export function toLogical(layout, canvasRect, clientX, clientY) {
  if (!layout || !(layout.W > 0) || !(layout.H > 0)) {
    throw new Error(`layout.toLogical: not a layout: ${JSON.stringify(layout)}`);
  }
  if (!canvasRect || !(canvasRect.width > 0) || !(canvasRect.height > 0)) {
    throw new Error(`layout.toLogical: the canvas rect has no area: ${JSON.stringify(canvasRect && { width: canvasRect.width, height: canvasRect.height })}`);
  }
  return [
    ((clientX - canvasRect.left) / canvasRect.width) * layout.W,
    ((clientY - canvasRect.top) / canvasRect.height) * layout.H,
  ];
}

/** Below this many css px of height a touch screen held on its side is a phone, and the wide cabinet on it is too small to play. */
export const ROTATE_BELOW = 500;

/**
 * Should the page ask to be turned upright instead of showing the game? Only a phone on its side: wider than
 * tall, short, and played with a finger. A small desktop window is left alone (it has a keyboard), and so is a
 * tablet on its side (tall enough for the wide cabinet).
 * @param {number} vw viewport width, css px
 * @param {number} vh viewport height, css px
 * @param {boolean} touchPrimary the main pointer is a finger: matchMedia('(hover: none) and (pointer: coarse)')
 */
export function wantsRotate(vw, vh, touchPrimary) {
  if (!(vw > 0) || !(vh > 0) || !Number.isFinite(vw) || !Number.isFinite(vh)) {
    throw new Error(`layout.wantsRotate: the viewport must have a positive finite size, got ${String(vw)} x ${String(vh)}`);
  }
  return touchPrimary === true && vw > vh && vh < ROTATE_BELOW;
}

// ───────────────────────── the 3D renderer's layout ─────────────────────────
//
// Portrait is 430 logical px wide and as tall as the glass is, between GL_MIN_H and 932: a phone in a Safari tab
// shows about 393 x 660, and a fixed 430 x 932 canvas letterboxed into that is 304 px wide. Top to bottom:
//   band    0..bandH        the live stage, full width (about 220 on a tall phone, less on a short one)
//   table   bandH-12..H     the 3D table. Its foot stands 12 px above the bottom edge whatever the height, so the
//                           flippers and the launch button are always the same distance from the thumbs.
// Wide is 1280 x 800: the stage is the left 800, the table stands in the right 480.
//
// The touch contract is the 2D one: launch is a disc at the foot of the plunger lane, every other touch in play
// is a flipper by the half of the SCREEN it lands on, and mute / skip are where layout.mute / layout.skip /
// layout.cine.mute say. input.js reads those three and knows nothing about layout.gl.

export const GL_W = 430;
export const GL_MIN_H = 700;
export const GL_MAX_H = 932;
const GL_FOOT = 12;             // px between the foot of the table and the bottom of the canvas
const GL_SEAM = 12;             // px the band overlaps the head of the table's viewport (empty sea up there)

const glCache = new Map();

function glPortrait(H) {
  const W = GL_W;
  const bandH = Math.round(Math.min(220, Math.max(168, H * 0.236)));
  const ty = bandH - GL_SEAM;
  const scale = Math.min(0.93, (H - GL_FOOT - ty) / 800);
  const tw = 400 * scale;
  const tx = (W - tw) / 2;
  const th = 800 * scale;
  // table-space fractions measured off the Vessery view at its solved pitch: the drums sit in the first sixth of the
  // footprint's height, the flippers between 84% and 94% of it
  const reels = rect(tx + tw * 0.16, ty + th * 0.035, tw * 0.68, th * 0.125);
  const flippers = rect(tx + tw * 0.2, ty + th * 0.84, tw * 0.6, th * 0.105);
  const launch = disc(W - 48, H - 76, 38);
  // mute sits in the HUD's status strip, the last 30 px of the band. skip and the cinematic's mute are below the
  // tallest notch (59 pt is 65 logical px), so the HUD never has to move them from where input expects them
  const mute = disc(W - 19, bandH - 15, 12);
  const cineMute = disc(W - 160, 92, 15);
  const skip = rect(W - 120, 72, 104, 40);
  const sub = rect(14, H - 180, W - 28, 132);
  const band = rect(0, 0, W, bandH);
  return Object.freeze({
    kind: 'portrait', W, H,
    table: Object.freeze({ x: tx, y: ty, scale }),
    hud: band, story: band,
    launch, mute, skip,
    cine: Object.freeze({ art: rect(0, 0, W, H), text: sub, mute: cineMute }),
    gl: Object.freeze({ band, table: rect(0, ty, W, H - ty), tableFit: Object.freeze({ x: tx, y: ty, scale }), reels, flippers, launch, mute, cineMute, skip, sub }),
  });
}

function glWide() {
  const W = 1280, H = 800, split = 800;
  const scale = 0.97, tw = 400 * scale, th = 800 * scale;
  const tx = split + (W - split - tw) / 2, ty = H - GL_FOOT - th;
  const band = rect(0, 0, split, H);
  const reels = rect(tx + tw * 0.16, ty + th * 0.035, tw * 0.68, th * 0.125);
  const flippers = rect(tx + tw * 0.2, ty + th * 0.84, tw * 0.6, th * 0.105);
  const launch = disc(W - 44, H - 78, 38);
  const mute = disc(split - 19, H - 15, 12);
  const cineMute = disc(W - 164, 44, 15);
  const skip = rect(W - 124, 24, 104, 40);
  const sub = rect(200, H - 190, W - 400, 150);
  return Object.freeze({
    kind: 'wide', W, H,
    table: Object.freeze({ x: tx, y: ty, scale }),
    hud: band, story: band,
    launch, mute, skip,
    cine: Object.freeze({ art: rect(0, 0, W, H), text: sub, mute: cineMute }),
    gl: Object.freeze({ band, table: rect(split, 0, W - split, H), tableFit: Object.freeze({ x: tx, y: ty, scale }), reels, flippers, launch, mute, cineMute, skip, sub }),
  });
}

/**
 * The layout the 3D renderer draws to. Same shape as computeLayout's, plus `gl`. Portrait layouts differ only in
 * height, and one object is kept per height, so a caller may compare layouts by identity to see a resize.
 * @param {number} vw viewport width, css px
 * @param {number} vh viewport height, css px
 * @returns {Layout}
 */
export function computeGlLayout(vw, vh) {
  if (!(vw > 0) || !(vh > 0) || !Number.isFinite(vw) || !Number.isFinite(vh)) {
    throw new Error(`layout.computeGlLayout: the viewport must have a positive finite size, got ${String(vw)} x ${String(vh)}`);
  }
  const H = vh > vw ? Math.round(Math.min(GL_MAX_H, Math.max(GL_MIN_H, (GL_W * vh) / vw))) : 0;
  let L = glCache.get(H);
  if (!L) { L = H ? glPortrait(H) : glWide(); glCache.set(H, L); }
  return L;
}
