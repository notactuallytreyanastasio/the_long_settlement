// SET: hearing-hall. The Company auditorium at Halcyon Reach, seen from the stage: the boards and the
// footlights at the lip, then two thousand and forty seats raked up to three shut doors, the gallery
// "where children are put" above them, and over that the great window with the Company's plumb weight
// leaded into it. The house lamp hangs in the middle of it all.
// Chapter 3: ch3.s2 The Silent Hearing (every seat filled, nobody speaking; they leave by rows, front rows first),
// ch3.s6 the hearing resumed (a boy stands up in the gallery and holds the rail, then they stand one after another
// for six hours), ch3.s7 (by night: the hall empty, two thousand seats turned up, a listening shell set on the stage).
//
//   import { hearingHall } from './sets/hearing-hall.js';
//   const set = hearingHall.build(GL, { light: 'full' | 'night', low: false });
//
// Same shape as sets/lantern-stalls.js. The players stand on the stage facing +Z with the house behind them,
// as on any stage; cameras look toward -Z, out over the lip into the hall. The strip x -3.2..3.2, z 0..1.6 is clear.
//
// What this set can do for its story:
//   setCrowd(0..1)        how much of the house is in its seats; it empties front rows first and files out a row at a time
//   setStanding(0..1)     that share of the house is on its feet (ch3.s6: each stood when the one before sat down)
//   standOne()            the next one stands, and the one before sits
//   setGallery(0..1)      cadets along the gallery rail
//   placeShell(on)        the grey listening shell on the boards beside marks.edge, with its red tick
//   task(type)            'witness' | 'hall' -> { pos, stand, set(v) }: v drives setStanding; anything else: null
// marks: a, b, c, two, party, opposition as everywhere, plus
//   edge { pos, face }: sitting on the lip of the stage, back to the camera     table { pos, face }: the Tribune's table (stage right)
//   gallery { pos, face }: the boy at the rail     guard { pos, face }: one pace behind his left shoulder
//   shell (world point)     focus: the house lamp     window: the great window
// cameras: the six everywhere, plus 'gallery' (portrait, on the rail)

import { m4, quat, rng, DEG } from '../math.js';
import { merge, tint, place, box, cylinder, sphere, setGlow, setOutline, extrude, lathe, torus, ellipsoid } from '../mesh.js';
import { node, group, material, makeEnv, createScene, mergeStatic } from '../scene.js';
import { createSprites } from '../sprites.js';
import { rayMesh, rayMaterial } from '../fx.js';
import { KB, kitBMaterials, setShell, lightOf, norm3, wall, windowFrame, shaftCards, ceiling, boards, curtain, chair } from './kit-b.js';
import { H3, HEADS, plumb, gonfalon, people, seatRow, footlight } from './kit-ch3.js';

const LIP = -1.4, W = 7.6, BACK = -17.2, H = 10.6, PIT = -1.1, RISE = 0.26, RUN = 1.1, ROWS = 10, ROW0 = -3.5, GAL_Y = 4.0, GAL_Z = -13.9, CROSS_Y = PIT + RISE * ROWS;

const LIGHTS = {
  full: {
    preset: 'day', power: 0.8, night: false,
    env: {
      key: { dir: norm3([-0.34, 0.74, 0.58]), color: '#fff2da' },
      shadow: { tint: '#8d80ea', lift: 0.1, saturate: 1.4 },
      ambient: { sky: '#d4dcff', ground: '#ffc4a0', amount: 0.14 },
      rim: { color: '#fff0c0', amount: 0.6, edge: 0.76 },
      fog: { color: '#ffe9c8', density: 0.006, start: 9, max: 0.34 },
      sky: { zenith: '#3f8fe8', mid: '#8fd0ff', horizon: '#fff0c8', below: '#ffe2b0' },
      water: null,
    },
    glass: '#fff6d0', glassGlow: 0.95, side: '#bfe6ff', shaft: '#ffe9b0', seatsUp: false, crowd: 1, wallTop: '#aab2f6', carpet: ['#7c88ec', '#6f7ae2'], boards: ['#f6c078', '#eeb068', '#fcca88'], pool: '#ffe2a0',
  },
  night: {
    preset: 'night', power: 1.1, night: true,
    env: {
      key: { dir: norm3([-0.3, 0.7, 0.62]), color: '#93a8f4' },
      shadow: { tint: '#3443ae', lift: 0.13, saturate: 1.3 },
      ambient: { sky: '#4f6fe0', ground: '#3a3a9c', amount: 0.17 },
      rim: { color: '#bcd0ff', amount: 0.6, edge: 0.76 },
      fog: { color: '#3b55c8', density: 0.008, start: 9, max: 0.4 },
      sky: { zenith: '#0c1a70', mid: '#243ab0', horizon: '#5a78e0', below: '#2f3aa0', stars: 1, moon: 0.7 },
      water: null,
    },
    glass: '#a8c4ff', glassGlow: 0.9, side: '#5f86ee', shaft: '#9fb8ff', seatsUp: true, crowd: 0, wallTop: '#8f9af0', carpet: ['#6672dc', '#5a66d2'], boards: ['#c98f86', '#bf8480', '#d39a8e'], pool: '#ffc880',
  },
};

const CAMERAS = {
  wide: { target: [0.1, 1.75, -0.4], dist: 8.6, yaw: 3, pitch: 4, fov: 46, aspect: 0.46, shadowCenter: [0, 0, -0.6], shadowRadius: 7 },
  two: { target: [0, 1.12, 0.6], dist: 6.0, yaw: -13, pitch: 4, fov: 31, aspect: 0.46, shadowCenter: [0, 0, 0.3], shadowRadius: 3.6 },
  close: { target: [0.02, 0.86, 0.8], dist: 3.9, yaw: 19, pitch: 2, fov: 28, aspect: 0.46, shadowCenter: [0, 0, 0.5], shadowRadius: 2.6 },
  low: { target: [0.1, 2.1, -0.4], dist: 6.4, yaw: -6, pitch: -12, fov: 56, aspect: 0.46, shadowCenter: [0, 0, -0.6], shadowRadius: 7 },
  stage: { target: [0, 1.25, 0.3], dist: 9.6, yaw: -13, pitch: 5, fov: 26, aspect: 1.95, shadowCenter: [0, 0, -0.2], shadowRadius: 7, outline: 0.7 },
  landscape: { target: [0, 2.2, -1.2], dist: 10.5, yaw: 4, pitch: 3, fov: 44, aspect: 1.6, shadowCenter: [0, 0, -0.6], shadowRadius: 9 },
  gallery: { target: [-1.1, GAL_Y + 0.75, GAL_Z - 0.3], dist: 6.2, yaw: 12, pitch: 3, fov: 30, aspect: 0.46, shadowCenter: [-1, GAL_Y, GAL_Z], shadowRadius: 4 },
};

const MARKS = {
  a: { pos: [-0.8, 0, 0.55], face: 14 }, b: { pos: [0.02, 0, 0.8], face: 0 }, c: { pos: [0.82, 0, 0.55], face: -14 },
  two: [{ pos: [-0.42, 0, 0.62], face: 24 }, { pos: [0.42, 0, 0.62], face: -24 }],
  party: [{ pos: [-1.05, 0, 0.75], face: 78 }, { pos: [-1.85, 0, 1.15], face: 72 }, { pos: [-2.5, 0, 0.5], face: 80 }],
  opposition: [{ pos: [1.05, 0, 0.75], face: -78 }, { pos: [1.85, 0, 1.15], face: -72 }, { pos: [2.55, 0, 0.5], face: -80 }],
};

const HOUSE_COATS = ['#3fc0ae', '#3f78e0', '#6f8cf0', '#f4f1ff', '#8a6be0', '#ffd24a', '#ff8fb0', '#27a8c8', '#ffb040', '#e8ecff', '#4fc463', '#ff7a5a'];

function build(engine = null, { light: lightName = 'full', low = false } = {}) {
  const [light, L] = lightOf('hearing-hall', LIGHTS, lightName);
  const M = kitBMaterials(), r = rng(303);
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  const deco = (n) => { n.castShadow = false; return n; };

  // ---- the room
  const room = group('room');
  room.add(node('stage', place(boards({ w: 20, d: 8.4, n: 22, colors: L.boards, seed: 4 }), 0, 0, LIP + 4.2), M.flat));
  room.add(node('lip', merge(tint(place(box(20, 0.1, 0.16), 0, 0.03, LIP + 0.02), H3.gold), tint(place(box(20, 1.7, 0.2), 0, -0.85, LIP - 0.1), H3.tealDark)), M.wall));
  // the house floor: a pit, ten risers, a cross aisle under the gallery; two aisles with runners
  const floor = [tint(place(box(W * 2, 0.3, 2.6), 0, PIT - 0.15, LIP - 1.3), L.carpet[1])];
  for (let k = 0; k < ROWS; k++) floor.push(tint(place(box(W * 2, RISE + 0.3, RUN), 0, PIT + RISE * k - 0.15 + RISE / 2 - RISE / 2, ROW0 - RUN * k + 0.2), L.carpet[k % 2]));
  floor.push(tint(place(box(W * 2, 0.3, 4), 0, CROSS_Y - 0.15, GAL_Z - 1.4), L.carpet[0]));
  for (const ax of [-2.72, 2.72]) for (let k = 0; k < ROWS; k++) floor.push(tint(place(box(0.74, 0.03, RUN), ax, PIT + RISE * k + 0.015, ROW0 - RUN * k + 0.2), k % 2 ? '#e0506a' : '#ea6278'), tint(place(box(0.86, 0.02, RUN), ax, PIT + RISE * k + 0.008, ROW0 - RUN * k + 0.2), H3.gold));
  room.add(node('floor', merge(floor), M.wall));
  // walls: teal dado, pale above; three tall windows a side, the great window and three doors at the back
  const SIDE_Z = [-4.6, -8.6, -12.2], zc = (LIP + 1.6 + BACK) / 2, sideLen = LIP + 1.6 - BACK, BASE = -1.7;
  const sideOpen = (sgn) => SIDE_Z.map((z) => ({ x: sgn * (z - zc), w: 1.7, sill: 3.3 - BASE, top: 8.3 - BASE, arch: true }));
  room.add(node('wall-l', wall({ w: sideLen, h: H - BASE, t: 0.5, color: L.wallTop, openings: sideOpen(-1) }), M.wall, { pos: [-W, BASE, zc], rot: [0, 90, 0] }));
  room.add(node('wall-r', wall({ w: sideLen, h: H - BASE, t: 0.5, color: L.wallTop, openings: sideOpen(1) }), M.wall, { pos: [W, BASE, zc], rot: [0, -90, 0] }));
  const DOORS = [-4.4, 0, 4.4], GW = { x: 0, w: 4.6, sill: 5.9 - BASE, top: 10.0 - BASE, arch: true };
  room.add(node('wall-back', wall({ w: W * 2 + 0.6, h: H - BASE, t: 0.5, color: L.wallTop, openings: [...DOORS.map((x) => ({ x, w: 1.5, sill: CROSS_Y - BASE, top: CROSS_Y + 2.25 - BASE, arch: true })), GW] }), M.wall, { pos: [0, BASE, BACK] }));
  for (const sx of [-1, 1]) room.add(node('dado', merge(tint(place(box(0.08, 2.9, sideLen), sx * (W - 0.04), BASE + 4.4 - 1.45, zc), H3.teal), tint(place(box(0.12, 0.12, sideLen), sx * (W - 0.06), BASE + 4.4, zc), H3.gold)), M.wall));
  room.add(node('dado-back', merge(tint(place(box(W * 2, 0.4, 0.08), 0, GAL_Y + 0.95, BACK + 0.04), H3.teal), tint(place(box(W * 2, 0.1, 0.1), 0, GAL_Y + 1.2, BACK + 0.05), H3.gold)), M.wall));
  room.add(node('ceiling', ceiling({ w: W * 2 + 1, d: sideLen + 1, color: '#4458d0', beams: 6, beam: '#3445b4', bw: 0.36, bh: 0.4 }), M.wall, { pos: [0, H, zc] }));
  // the gallery: a slab on four columns, a low parapet with the Company's colours on it
  const gal = [tint(place(box(W * 2, 0.34, -BACK + GAL_Z + 0.1), 0, GAL_Y - 0.17, (GAL_Z + BACK) / 2), '#fff3dc'), tint(place(box(W * 2, 0.36, 0.16), 0, GAL_Y + 0.18, GAL_Z + 0.08), '#fff8ea'), tint(place(box(W * 2, 0.08, 0.26), 0, GAL_Y + 0.4, GAL_Z + 0.08), H3.gold), tint(place(box(W * 2, 0.16, 0.2), 0, GAL_Y - 0.24, GAL_Z + 0.1), H3.teal)];
  for (let i = 0; i < 12; i++) gal.push(tint(place(box(0.86, 0.22, 0.05), -W + 0.65 + i * ((W * 2 - 1.3) / 11), GAL_Y + 0.17, GAL_Z + 0.18), i % 2 ? H3.teal : '#3fd0bc'));
  gal.push(tint(place(box(W * 2, 0.3, 1.3), 0, GAL_Y + 0.15, BACK + 1.0), '#fff3dc')); // a second step for the back row
  room.add(node('gallery', merge(gal), M.wall));
  scene.root.add(mergeStatic(room, 'room'));

  // ---- what is out in the house: no outline at that distance, no shadows; the big pieces up high keep their line
  const room2 = [];
  M.deco = material({ name: 'hall-deco', rim: 0, outline: false, castShadow: false });
  const house0 = group('house'), hero = group('hero'), stage = group('stage-props');
  const pillar = (h) => merge(tint(place(cylinder(0.3, 0.3, 0.2, 6), 0, 0, 0), '#fff3dc'), tint(place(cylinder(0.2, 0.18, h - 0.4, 6), 0, 0.2, 0), '#fff3dc'), tint(place(cylinder(0.24, 0.24, 0.07, 6), 0, 0.3, 0), H3.gold), tint(place(cylinder(0.2, 0.32, 0.2, 6), 0, h - 0.2, 0), '#fff3dc'));
  for (const x of [-6.6, -2.72 - 0.9, 2.72 + 0.9, 6.6]) house0.add(node('col', pillar(GAL_Y - CROSS_Y - 0.3), M.deco, { pos: [x, CROSS_Y, GAL_Z - 0.25] }));
  // the great window: a fan of coloured glass and the plumb weight leaded into the middle of it
  house0.add(node('great-pane', setGlow(tint(place(box(GW.w, GW.top - GW.sill, 0.05), 0, (GW.sill + GW.top) / 2 + BASE, BACK - 0.4), L.glass), L.glassGlow), M.deco));
  hero.add(node('great-window', windowFrame({ w: GW.w, h: GW.top - GW.sill, color: H3.tealDeep, bars: 3, fan: [H3.gold, '#7fe6d2', '#8fd0ff', '#ffb0c0', '#8fd0ff', '#7fe6d2', H3.gold], glow: 0.9, depth: 0.5, thick: 0.16, sillOut: 0.2 }), M.wall, { pos: [0, GW.sill + BASE, BACK] }));
  hero.add(node('great-plumb', plumb({ s: 2.3, color: H3.tealDeep, line: H3.tealDeep, depth: 0.2, seg: 8 }), M.wall, { pos: [0, GW.sill + BASE + 2.55, BACK - 0.2] }));
  // side windows: plain glass in a deep frame
  for (const sx of [-1, 1]) for (const z of SIDE_Z) {
    house0.add(node('side-pane', setGlow(tint(place(box(0.05, 5.0, 1.7), sx * (W + 0.42), 5.8, z), L.side), L.glassGlow * 0.9), M.deco));
    house0.add(node('side-window', windowFrame({ w: 1.7, h: 5.0, color: H3.tealDeep, bars: 1, transom: !low, fan: null, depth: 0.5, thick: 0.12, sillOut: 0 }), M.deco, { pos: [sx * W, 3.3, z], rot: [0, -sx * 90, 0] }));
  }
  // company colours: either side of the great window, between the side windows, off the gallery front
  for (const sx of [-1, 1]) {
    hero.add(node('banner-back', gonfalon({ w: 1.5, h: 4.0, color: H3.teal, trim: H3.silver, stripe: H3.silver }), M.wall, { pos: [sx * 4.4, 9.9, BACK + 0.14] }));
    for (const z of [-6.6, -10.4]) house0.add(node('banner-side', gonfalon({ w: 1.1, h: 3.4, color: z < -8 ? H3.cadet : H3.teal, trim: H3.silver }), M.deco, { pos: [sx * (W - 0.16), 8.6, z], rot: [0, -sx * 90, 0] }));
    hero.add(node('banner-gal', gonfalon({ w: 0.9, h: 1.5, color: H3.cadet, trim: H3.gold, tail: 0.25 }), M.wall, { pos: [sx * 2.72, GAL_Y + 0.26, GAL_Z + 0.22] }));
  }
  // three doors, shut on the minute; a lit fanlight over each
  for (const x of DOORS) {
    house0.add(node('door', merge(tint(place(box(1.5, 2.2, 0.08), 0, 1.1, 0), H3.tealDark), tint(place(box(0.5, 0.7, 0.04), -0.36, 1.45, 0.05), H3.teal), tint(place(box(0.5, 0.7, 0.04), 0.36, 1.45, 0.05), H3.teal), tint(place(box(0.5, 0.7, 0.04), -0.36, 0.55, 0.05), H3.teal), tint(place(box(0.5, 0.7, 0.04), 0.36, 0.55, 0.05), H3.teal), tint(place(box(0.05, 2.2, 0.05), 0, 1.1, 0.05), H3.gold)), M.deco, { pos: [x, CROSS_Y, BACK - 0.12] }));
    house0.add(node('fan', setGlow(tint(place(box(1.3, 0.5, 0.04), x, CROSS_Y + 1.95, BACK - 0.2), L.night ? '#7f9cf0' : '#fff0b8'), 0.85), M.deco));
  }
  // seats: three blocks a row
  const BLOCKS = [{ x: 0, n: 7 }, { x: -5.3, n: 7 }, { x: 5.3, n: 7 }], PITCH = 0.62;
  for (let k = 0; k < ROWS; k++) for (const b of BLOCKS) house0.add(node('seats', seatRow({ n: b.n, pitch: PITCH, up: L.seatsUp, plain: !L.seatsUp }), M.deco, { pos: [b.x, PIT + RISE * k, ROW0 - RUN * k] }));
  // gallery sconces, the house lamp: two brass rings of candles on a long chain
  const SCONCES = [[-6.4, GAL_Y + 2.3, BACK + 0.1], [6.4, GAL_Y + 2.3, BACK + 0.1], [-2.3, GAL_Y + 2.3, BACK + 0.1], [2.3, GAL_Y + 2.3, BACK + 0.1]];
  for (const p of SCONCES) house0.add(node('sconce', merge(tint(place(box(0.2, 0.34, 0.2), 0, 0, 0.1), H3.gold), setGlow(tint(place(ellipsoid(0.16, 0.24, 0.16, 6, 4), 0, 0.4, 0.2), '#ffe0a0'), 0.95)), M.deco, { pos: p }));
  const HOUSE = [0, H, -5.8], DROP = 3.7;
  { const parts = [tint(place(cylinder(0.03, 0.03, DROP - 0.9, 4), 0, -DROP + 0.9, 0), H3.gold), tint(place(torus(1.7, 0.09, 18, 5), 0, -DROP, 0), H3.gold), tint(place(torus(1.0, 0.07, 14, 5), 0, -DROP + 0.75, 0), H3.gold), tint(place(lathe([[0, -0.5], [0.2, -0.36], [0.34, -0.1], [0.12, 0.1], [0, 0.1]], 8, { crease: 50 }), 0, -DROP - 0.1, 0), H3.gold), tint(place(sphere(0.2, 8, 5), 0, -DROP + 1.0, 0), H3.gold)];
    for (const [rad, n, y] of [[1.7, 10, -DROP], [1.0, 6, -DROP + 0.75]]) for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + rad, x = Math.sin(a) * rad, z = Math.cos(a) * rad; parts.push(tint(place(cylinder(0.035, 0.035, 0.2, 5), x, y + 0.04, z), H3.paper), setGlow(tint(place(ellipsoid(0.07, 0.13, 0.07, 5, 3), x, y + 0.36, z), '#ffe6a0'), 1)); if (i % 2 === 0) parts.push(tint(place(box(0.03, 0.03, rad), x / 2, y + 0.0, z / 2, 0, a / DEG, 0), H3.gold)); }
    hero.add(node('house-lamp', merge(parts), M.wall, { pos: HOUSE })); }
  // the proscenium: curtain legs either side, a swagged valance over
  for (const sx of [-1, 1]) stage.add(node('curtain', curtain({ w: 1.5, h: 7.4, color: H3.teal, tie: H3.gold, side: sx, folds: 5 }), M.prop, { pos: [sx * 4.75, 7.2, LIP + 0.25] }));
  { const sw = []; for (let i = 0; i < 7; i++) { const x = -5.4 + i * 1.8; sw.push(tint(place(lathe([[0, -1.0], [0.5, -0.82], [0.92, -0.3], [0.95, 0], [0, 0]], 8, { crease: 180 }), x, 7.5, LIP + 0.3, 0, 0, 0, 1, 1, 0.22), i % 2 ? H3.teal : '#3fd0bc'), tint(place(sphere(0.12, 6, 4), x + 0.9, 6.95, LIP + 0.42), H3.gold)); } sw.push(tint(place(box(13, 0.3, 0.3), 0, 7.5, LIP + 0.3), H3.gold)); stage.add(deco(node('valance', merge(sw), M.prop))); }
  // footlights along the lip, and the pool each throws on the boards
  const FOOT_X = []; for (let x = -4.0; x <= 4.01; x += 1.0) FOOT_X.push(x);
  const fl = footlight({ s: 0.8 });
  for (const x of FOOT_X) stage.add(deco(node('foot', fl, M.prop, { pos: [x, 0.07, LIP + 0.2] })));
  { const pools = FOOT_X.map((x) => place(lathe([[0.62, 0], [0, 0]], 10, { crease: 180 }), x, 0.012, LIP + 0.95, 0, 0, 0, 1, 1, 1.5)); room2.push(setOutline(setGlow(tint(merge(pools), L.pool), 0.4), 0)); }
  // the Tribune's table, stage right, facing the house; her chair with its back to us; the record, a carafe, a hand bell
  const TABLE = [4.05, 0, -0.45];
  stage.add(node('table', merge(tint(place(box(1.8, 0.1, 0.86), 0, 0.8, 0), H3.velvet), tint(place(box(1.66, 0.74, 0.7), 0, 0.38, 0), H3.tealDark), tint(place(box(1.84, 0.05, 0.9), 0, 0.73, 0), H3.gold), tint(place(box(1.3, 0.44, 0.04), 0, 0.4, -0.36), H3.teal), place(plumb({ s: 0.4, depth: 0.3 }), 0, 0.62, -0.4, 0, 180, 0)), M.prop, { pos: TABLE, rot: [0, -12, 0] }));
  stage.add(node('chair', chair({ s: 1.15, color: KB.woodDark, seat: H3.velvet }), M.prop, { pos: [TABLE[0] + 0.1, 0, TABLE[2] + 0.75], rot: [0, 172, 0] }));
  stage.add(deco(node('record', merge(tint(place(box(0.5, 0.08, 0.36), 0, 0.04, 0), '#c23a5e'), tint(place(box(0.46, 0.03, 0.32), 0, 0.09, 0), H3.paper), tint(place(cylinder(0.07, 0.05, 0.22, 7), 0.55, 0, -0.05), '#bfe8ff'), tint(place(lathe([[0, 0], [0.08, 0], [0.05, 0.1], [0.015, 0.13], [0.015, 0.2], [0, 0.2]], 7, { crease: 50 }), -0.5, 0, 0.05), H3.gold)), M.prop, { pos: [TABLE[0], 0.85, TABLE[2]], rot: [0, 160, 0] })));
  // a lectern, stage left, with the Company's device on its front: where Counsel reads clauses from
  const LECT = [-4.0, 0, -0.55];
  stage.add(node('lectern', merge(tint(place(box(0.7, 0.1, 0.6), 0, 0.05, 0), H3.tealDark), tint(place(cylinder(0.09, 0.12, 1.0, 7), 0, 0.1, 0), H3.gold), tint(place(box(0.8, 0.07, 0.6), 0, 1.14, 0, 18, 0, 0), H3.tealDark), tint(place(box(0.84, 0.5, 0.06), 0, 0.86, -0.28), H3.teal), place(plumb({ s: 0.42, depth: 0.3 }), 0, 1.08, -0.33, 0, 180, 0), tint(place(box(0.5, 0.03, 0.4), 0, 1.19, 0.02, 18, 0, 0), H3.paper)), M.prop, { pos: LECT, rot: [0, -14, 0] }));
  house0.add(node('pools', merge(room2), M.deco));
  scene.root.add(mergeStatic(house0, 'house'), mergeStatic(hero, 'hero'), mergeStatic(stage, 'stage-props'));

  // ---- light that is drawn: the great window's shaft down the house, a cone under the lamp, side shafts
  const lampPos = [HOUSE[0], HOUSE[1] - DROP + 0.3, HOUSE[2]];
  if (!low) {
    const gy = (GW.sill + GW.top) / 2 + BASE;
    const side = [place(shaftCards({ w: GW.w * 0.86, h: (GW.top - GW.sill) * 0.74, dir: [0.1, -0.42, 1], len: 15.5, cards: 4, color: L.shaft, spread: 0.3 }), 0, gy, BACK + 0.1)];
    for (const z of SIDE_Z) side.push(place(shaftCards({ w: 1.4, h: 3.6, dir: [0, -0.8, -1], len: 6.5, cards: 2, color: L.shaft }), W - 0.1, 6.0, z, 0, -90, 0));
    scene.root.add(node('shafts', merge(side), material({ kind: 'beam', name: 'hall-shaft', beam: { power: 0.6, near: L.night ? 0.36 : 0.5, far: 0.05, steps: 0 }, outline: false })));
  }
  const cone = node('lamp-cone', tint(place(rayMesh(5.2, 1.2, 4.2, 18), lampPos[0], lampPos[1] - 0.1, lampPos[2]), '#ffc060'), rayMaterial({ power: 1.4, near: L.night ? 0.3 : 0.2, far: 0 }));
  scene.root.add(cone);

  // ---- the house
  // The near rows are drawn with their ink line; the far rows are smaller on screen than the line is wide, so they go without.
  const NEAR = 4, spotsN = [], spotsF = [], rowOf = [];
  for (let k = 0; k < ROWS; k++) for (const b of BLOCKS) for (let i = 0; i < b.n; i++) {
    if (low && k >= 5 && (i + k) % 2) continue;
    (k < NEAR ? spotsN : spotsF).push({ pos: [b.x - (b.n * PITCH) / 2 + PITCH * (i + 0.5) + (r() - 0.5) * 0.06, PIT + RISE * k + 0.28, ROW0 - RUN * k - 0.02], yaw: (r() - 0.5) * 16 + (b.x ? -Math.sign(b.x) * 8 : 0), s: 0.84 + r() * 0.18, row: k });
  }
  const near = people({ spots: spotsN, material: M.prop, heads: [HEADS[0], HEADS[1]], seed: 7, coats: HOUSE_COATS });
  const far = people({ spots: spotsF, material: M.deco, heads: [HEADS[2], HEADS[4], HEADS[3]].slice(0, low ? 2 : 3), lod: 1, seed: 9, coats: HOUSE_COATS });
  scene.root.add(near.node, far.node);
  // everyone in the house as one list: { grp, i }
  const who = []; spotsN.forEach((sp, i) => { who.push({ grp: near, i }); rowOf.push(sp.row); }); spotsF.forEach((sp, i) => { who.push({ grp: far, i }); rowOf.push(sp.row); });
  // cadets in the gallery: a rank at the rail, a rank on the step behind
  const gspots = [];
  for (let i = 0; i < 22; i++) { const x = -6.9 + i * 0.66; if (Math.abs(x + 1.1) < 0.75) continue; gspots.push({ pos: [x, GAL_Y, GAL_Z - 0.5], yaw: (r() - 0.5) * 10, s: 0.74 + r() * 0.1 }); }
  if (!low) for (let i = 0; i < 20; i++) gspots.push({ pos: [-6.5 + i * 0.68, GAL_Y + 0.3, BACK + 1.2], yaw: (r() - 0.5) * 10, s: 0.76 + r() * 0.1 });
  const cadets = people({ spots: gspots, material: M.deco, uniform: { coat: H3.cadet, cap: H3.tealDark, band: H3.silver }, lod: 1, seed: 11 });
  scene.root.add(cadets.node);

  // the listening shell: a thumbnail of grey on the boards
  const SHELL = [0.95, 0.03, -0.95];
  const shell = node('shell', merge(tint(place(lathe([[0, 0], [0.07, 0], [0.085, 0.03], [0.05, 0.07], [0, 0.08]], 7, { crease: 180 }), 0, 0, 0, 0, 0, 0, 1, 1, 0.8), '#b9c0d6'), setGlow(tint(place(sphere(0.02, 5, 3), 0, 0.08, 0), '#ff5040'), 1)), M.prop, { pos: SHELL });
  shell.visible = false; shell.castShadow = false; scene.root.add(shell);

  const fg = group('fg'); const foreground = mergeStatic(fg, 'foreground'); scene.root.add(foreground);
  const actors = group('actors'); scene.root.add(actors);

  // ---- lamps and glows
  const lamps = [
    { name: 'house', pos: lampPos, color: '#ffd080', radius: 13, base: L.night ? 0.75 : 1.0, flicker: 0.03 },
    { name: 'foot-l', pos: [-1.5, 0.45, LIP + 0.7], color: '#ffc468', radius: 4.6, base: 0.85, flicker: 0.04 },
    { name: 'foot-r', pos: [1.5, 0.45, LIP + 0.7], color: '#ffc468', radius: 4.6, base: 0.85, flicker: 0.04 },
    { name: 'window', pos: [0, 6.4, BACK + 3], color: L.night ? '#8fa8ff' : '#fff0c8', radius: 10, base: 1.0, flicker: 0 },
    { name: 'gallery-l', pos: [-4.4, GAL_Y + 2.4, BACK + 1.2], color: '#ffc070', radius: 6, base: 0.9 },
    { name: 'gallery-r', pos: [4.4, GAL_Y + 2.4, BACK + 1.2], color: '#ffc070', radius: 6, base: 0.9 },
  ];
  const sprites = scene.sprites = createSprites(low ? 96 : 256), glows = [];
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: [lampPos[0], lampPos[1] + 0.1, lampPos[2]], size: 5.4, color: '#ffb850', alpha: 0 }), base: L.night ? 0.5 : 0.4 });
  for (const x of FOOT_X) glows.push({ sprite: sprites.add({ kind: 'glow', pos: [x, 0.2, LIP + 0.26], size: 0.42, color: '#ffc860', alpha: 0 }), base: 0.6 });
  for (const p of SCONCES) glows.push({ sprite: sprites.add({ kind: 'glow', pos: [p[0], p[1] + 0.4, p[2] + 0.5], size: 1.6, color: '#ffb450', alpha: 0 }), base: 0.5 });
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: [0, 8.2, BACK + 0.3], size: 8.5, color: L.night ? '#7f9cff' : '#fff0b0', alpha: 0 }), base: L.night ? 0.3 : 0.26, fixed: true });
  const shellGlow = sprites.add({ kind: 'glow', pos: [SHELL[0], SHELL[1] + 0.08, SHELL[2]], size: 0.5, color: '#ff5040', alpha: 0 });

  // ---- the story's levers
  const N = who.length, order = new Uint16Array(N), standOrder = new Uint16Array(N);
  { const idx = [...Array(N).keys()]; idx.sort((a, b) => rowOf[b] - rowOf[a] || a - b); idx.forEach((v, i) => { order[i] = v; }); // the back rows are the last to go
    const rs = rng(99), sh = [...Array(N).keys()]; for (let i = N - 1; i > 0; i--) { const j = Math.floor(rs() * (i + 1)); const t = sh[i]; sh[i] = sh[j]; sh[j] = t; } sh.forEach((v, i) => { standOrder[i] = v; }); }
  const want = new Float32Array(N), up = new Float32Array(N), upNow = new Float32Array(N);
  const person = (i) => who[i].grp.list[who[i].i], writeP = (i) => who[i].grp.write(who[i].i);
  let crowd = L.crowd, standing = 0, gallery = L.night ? 0 : 1, one = -1, shellOn = false, cursor = 0;
  const applyCrowd = () => { const n = Math.round(crowd * N); for (let i = 0; i < N; i++) want[order[i]] = i < n ? 1 : 0; };
  const applyStand = () => { const n = Math.round(standing * N); for (let i = 0; i < N; i++) up[standOrder[i]] = i < n ? 1 : 0; if (one >= 0) up[standOrder[one % N]] = 1; };
  function setCrowd(a) { crowd = Math.max(0, Math.min(1, a)); applyCrowd(); }
  function setStanding(a) { standing = Math.max(0, Math.min(1, a)); one = -1; applyStand(); }
  function standOne() { one = one < 0 ? Math.round(standing * N) : one + 1; applyStand(); return person(standOrder[one % N]).pos; }
  function setGallery(a) { gallery = Math.max(0, Math.min(1, a)); }
  function placeShell(on = true) { shellOn = !!on; shell.visible = shellOn; }
  applyCrowd(); applyStand();
  for (let i = 0; i < N; i++) { person(i).here = want[i]; writeP(i); }
  for (let i = 0; i < cadets.count; i++) { cadets.list[i].here = gallery; cadets.write(i); }
  const TASK = { pos: [0, 2.2, -8], stand: [-1.0, 0.7], set(v) { setStanding(v * 0.6); } };
  const task = (type) => (type === 'witness' || type === 'hall' ? TASK : null);

  const P = [0, 0, 0], V = [0, 0, 0], rnd = rng(17);
  let nextMote = 0;
  function tick(time, dt, pw, live) {
    const k = dt === 0 ? 1 : Math.min(1, dt * 5);
    // people settle toward where the story wants them; a slice of the rest breathes each frame
    for (let i = 0; i < N; i++) {
      const dh = want[i] - person(i).here, du = up[i] - upNow[i];
      if (dh > 0.004 || dh < -0.004 || du > 0.004 || du < -0.004) { const p = person(i); p.here += dh * k; upNow[i] += du * k; p.lift = upNow[i] * 0.3; writeP(i); }
    }
    if (dt > 0) for (let j = 0; j < 16; j++) { const i = cursor = (cursor + 1) % N, p = person(i); if (p.here < 0.05) continue; p.lean = Math.sin(time * 0.8 + p.ph) * 1.6; p.lift = upNow[i] * 0.3 + Math.sin(time * 1.3 + p.ph * 2) * 0.008; writeP(i); }
    for (let i = 0; i < cadets.count; i++) { const p = cadets.list[i], d = gallery - p.here; if (d > 0.004 || d < -0.004) { p.here += d * k; cadets.write(i); } }
    cadets.node.visible = gallery > 0.01 || cadets.list[0].here > 0.02; near.node.visible = far.node.visible = crowd > 0 || person(order[0]).here > 0.02;
    cone.visible = pw > 0.05;
    shellGlow.alpha = shellOn ? 0.45 + 0.35 * Math.sin(time * 5.2) : 0;
    if (!live || low) return;
    if (time > nextMote) { // dust in the great window's light
      nextMote = time + 0.22; const u = rnd(); P[0] = (rnd() - 0.5) * 4; P[1] = 8.4 - u * 6.2 + (rnd() - 0.5) * 1.2; P[2] = BACK + 1 + u * 13; V[0] = 0.04; V[1] = -0.03; V[2] = 0.05;
      sprites.spawn({ kind: 'glow', pos: P, vel: V, size: 0.09 + rnd() * 0.08, life: 6, color: L.night ? '#cfdcff' : '#fff2c0', alpha: 0.75 });
    }
  }

  return setShell({
    id: 'hearing-hall', light, L, scene, cameras: CAMERAS, actors, foreground, lamps, glows, tick,
    marks: {
      ...MARKS, edge: { pos: [0.45, 0, -1.02], face: 180 }, table: { pos: [TABLE[0] + 0.1, 0, TABLE[2] + 0.75], face: 172 },
      gallery: { pos: [-1.1, GAL_Y, GAL_Z - 0.5], face: 0 }, guard: { pos: [-0.55, GAL_Y, GAL_Z - 1.15], face: 0 },
      shell: SHELL, focus: lampPos, window: [0, 8, BACK],
    },
    extra: { setCrowd, setStanding, standOne, setGallery, placeShell, task },
  });
}

export const hearingHall = { id: 'hearing-hall', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default hearingHall;
