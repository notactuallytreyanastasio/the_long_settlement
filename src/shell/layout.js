// Where everything on the screen is. Pure: numbers in, plain data out.
//
//   computeLayout(vw, vh) -> Layout       'portrait' whenever vh > vw, otherwise 'wide'
//   toLogical(layout, canvasRect, clientX, clientY) -> [x, y]
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
//                    exit. Its left edge is 73 px right of the right flipper's pivot.
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
 * @property {{art:Rect, text:Rect}} cine
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
  cine: Object.freeze({ art: rect(0, 0, 430, 540), text: rect(20, 560, 390, 260) }),
});

const WIDE = Object.freeze({
  kind: 'wide',
  W: 1280,
  H: 800,
  table: Object.freeze({ x: 440, y: 0, scale: 1 }),
  story: rect(10, 10, 420, 780),
  hud: rect(850, 10, 420, 780),
  launch: disc(1196, 446, 46),
  mute: disc(1242, 38, 14),
  skip: rect(1146, 22, 112, 40),
  cine: Object.freeze({ art: rect(0, 0, 1280, 800), text: rect(160, 600, 960, 170) }),
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
