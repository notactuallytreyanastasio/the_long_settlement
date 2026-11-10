// SET: counting-room. The Kedge Commons' books, in a loft over the ropewalk: shelves to the rafters, a bay of
// ledgers, a bay of real rope, and so on along the wall; a clerk's standing desk with the rope ledger open on it
// under one green-shaded lamp; a tall window on the quay, the moon, one crane, the roads.
// Chapter 6: ch6.s3 (Tobb works the column standing up: forty for twenty-four, entered as rope).
//
//   import { countingRoom } from './sets/counting-room.js';
//   const set = countingRoom.build(GL, { light: 'midnight', low: false });
//
// The shape is lantern-stalls' (see ../index.js). Figures face +Z; cameras look toward -Z, at the shelves. The stage
// strip x -3.2..3.2, z 0..1.6 is clear (a flat rug lies in it). The back wall is at z = -4.3; the desk stands at
// (-1.35, -2.2) with its slope toward the room; the window is right of it; the stair down to the walk is at the right.
// Added here:
//   setKey(on)     the steward's key lying on the desk (on from the start: it fitted)
//   setLamp(0..1)  the green lamp alone, apart from setPower (0 = turned right down)
//   task('rope-ledger')  ch6.s3: the sum worked on a slate stood right of the desk, a chalk row a quarter of the
//                  objective, the green lamp coming up from 0.42 to full; the last figure ringed
//   setback()      a step on the stair: the lamp turned right down, the stair's glow up, for under two seconds (also passLamp)
//   The core's 'interior' and 'night' build 'midnight'.
//   marks.desk { pos, face }  where Tobb stands to work the book;  marks.book (the open ledger), marks.focus (the lamp)
// low: true drops two shelf bays' contents to plain blocks, the hanks on the rafters, the moths and the motes.

import { m4, quat, rng, DEG, rgb } from '../math.js';
import { merge, tint, place, plane, box, cylinder, setGlow, setOutline, torus, extrude } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic } from '../scene.js';
import { createSprites } from '../sprites.js';
import { rayMesh } from '../fx.js';
import { PAL, pickLight, planks, ropeCoil } from './kit.js';
import { K6, ch6Materials, shell, STD_MARKS, STD_CAMERAS, coreLight, taskUnit, pulse, norm3, plankWall, shaft, patch, hank, shelfBay, clerkDesk, greenLamp, openBook, gantry, bar, cask } from './kit-ch6.js';

const HW = 6.2, BACK = -4.3, FRONT = 4, EAVE = 3.0, RIDGE = 5.9, WATER = -7;

const LIGHTS = {
  midnight: {
    preset: 'night', power: 1,
    env: {
      key: { dir: norm3([-0.34, 0.8, 0.5]), color: '#a4b0fa' },                    // a cool house light, so the lamp and the stair are the warm things
      shadow: { tint: '#3f3fb8', lift: 0.12, saturate: 1.45 },
      ambient: { sky: '#7f8cf0', ground: '#4a44b8', amount: 0.2 },
      rim: { color: '#cfe0ff', amount: 0.7, edge: 0.74 },
      fog: { color: '#2a44b8', density: 0.002, start: 30, max: 0.6 },
      sky: { zenith: '#0b186c', mid: '#2040b4', midAt: 0.45, horizon: '#4466dc', below: '#2440b0', stars: 1, moon: 0.7, sunDir: norm3([0.118, 0.105, -1]), sun: { size: 3.6 } },
      water: { deep: '#132a86', mid: '#1e45ae', shallow: '#3478d6', glintDensity: 0.22, level: WATER },
    },
  },
};

const CORE = { interior: 'midnight', night: 'midnight' };      // the core's light names this set answers

const CAMERAS = STD_CAMERAS({
  wide: { target: [-0.1, 1.7, -0.5], dist: 8.2, yaw: 2, pitch: 4, fov: 44, shadowCenter: [0, 0, -1.2], shadowRadius: 7.5 },
  low: { target: [0.0, 1.9, 0.0], dist: 6.2, yaw: -8, pitch: -11, fov: 54 },
  stage: { target: [0, 1.1, 0.3], dist: 9.4, yaw: -12, pitch: 6, fov: 24, shadowCenter: [0, 0, -0.6], shadowRadius: 7 },
});

function build(engine = null, { light, low = false } = {}) {
  const picked = pickLight('counting-room', LIGHTS, coreLight(light, CORE)), L = picked.L; light = picked.name;
  const M = ch6Materials(), r = rng(6363);
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  env.sky.sunDir = norm3(env.sky.sunDir); env.water.shores = [];

  // ---- the loft: boards, a gable wall with the window, low side walls, the roof coming down both sides
  const room = group('room'), props = group('props');
  room.add(node('floor', place(planks({ w: HW * 2 + 0.4, d: FRONT - BACK + 6, plank: 0.5, thick: 0.1, seed: 5, along: 'z', colors: ['#e8a878', '#dc9a6a', '#f0b688', '#d89462'] }), 0, 0, (FRONT + BACK) / 2 + 3), M.wall));
  const WIN = { x: 1.55, w: 2.3, sill: 1.05, top: 4.25 };
  room.add(node('back', plankWall({ w: HW * 2, h: RIDGE + 0.2, t: 0.24, colors: ['#8f8cf0', '#7f7ce6', '#9a98f6'], board: 0.55, openings: [WIN], seed: 3, post: '#fff0d0' }), M.wall, { pos: [0, 0, BACK] }));
  // the window's arched head and glazing bars
  const arch = []; for (let i = 0; i <= 10; i++) { const a = Math.PI * (1 - i / 10); arch.push([Math.cos(a) * WIN.w / 2, 3.1 + Math.sin(a) * 1.15]); }
  room.add(node('win-head', tint(place(extrude([...arch, [WIN.w / 2, 4.3], [-WIN.w / 2, 4.3]], 0.2, { crease: 30 }), WIN.x, 0, BACK - 0.12), '#8f8cf0'), M.wall));
  const bars = [bar([WIN.x, WIN.sill, BACK - 0.1], [WIN.x, 4.25, BACK - 0.1], 0.04, '#fff0d0', 4), bar([WIN.x - WIN.w / 2, 3.1, BACK - 0.1], [WIN.x + WIN.w / 2, 3.1, BACK - 0.1], 0.04, '#fff0d0', 4), bar([WIN.x - WIN.w / 2, 2.05, BACK - 0.1], [WIN.x + WIN.w / 2, 2.05, BACK - 0.1], 0.04, '#fff0d0', 4)];
  for (const sx of [-1, 1]) bars.push(bar([WIN.x, 3.1, BACK - 0.1], [WIN.x + sx * WIN.w * 0.36, 3.95, BACK - 0.1], 0.03, '#fff0d0', 4));
  props.add(node('win-bars', merge(bars), M.prop, { castShadow: false }));
  props.add(node('win-seat', merge(tint(place(box(WIN.w + 0.5, 0.12, 0.6), WIN.x, WIN.sill, BACK + 0.3), '#fff0d0'), tint(place(box(WIN.w + 0.3, WIN.sill, 0.5), WIN.x, WIN.sill / 2, BACK + 0.25), K6.royal), tint(place(box(1.0, 0.14, 0.44), WIN.x - 0.5, WIN.sill + 0.13, BACK + 0.3, 0, 6, 0), K6.coral)), M.prop));
  for (const sx of [-1, 1]) room.add(node('side', plankWall({ w: FRONT - BACK, h: EAVE, t: 0.24, colors: ['#6f78e4', '#6068d8'], board: 0.6, seed: 6 + sx, posts: 2.76, post: K6.timberRed }), M.wall, { pos: [sx * HW, 0, (FRONT + BACK) / 2], rot: [0, -sx * 90, 0] }));
  const slab = (x0, y0, x1, y1, col) => tint(place(box(Math.hypot(x1 - x0, y1 - y0) + 0.3, 0.14, FRONT - BACK), (x0 + x1) / 2, (y0 + y1) / 2 + 0.07, (FRONT + BACK) / 2, 0, 0, Math.atan2(y1 - y0, x1 - x0) / DEG), col);
  room.add(node('roof', merge(slab(-HW - 0.3, EAVE - 0.1, 0, RIDGE, '#5a50c4'), slab(0, RIDGE, HW + 0.3, EAVE - 0.1, '#5a50c4')), M.wall));
  // rafters: pairs along the roof, a ridge pole, two tie-beams with rope hung on them
  const raf = [];
  for (const z of [BACK + 0.4, -2.1, 0.1, 2.3]) for (const sx of [-1, 1]) raf.push(tint(place(box(Math.hypot(HW, RIDGE - EAVE) + 0.2, 0.2, 0.2), sx * HW / 2, (RIDGE + EAVE) / 2 - 0.16, z, 0, 0, sx * -Math.atan2(RIDGE - EAVE, HW) / DEG), K6.timberRed));
  raf.push(tint(place(box(0.24, 0.24, FRONT - BACK), 0, RIDGE - 0.22, (FRONT + BACK) / 2), K6.timberRed));
  for (const z of [-2.1, 2.3]) raf.push(tint(place(box(HW * 1.25, 0.2, 0.2), 0, 4.45, z), K6.timberRed));
  props.add(node('rafters', merge(raf), M.prop, { castShadow: false }));

  // ---- shelves between coils of real rope, along the gable wall and round the corner
  const bay = (x, kind, seed, h, w = 1.2) => props.add(node('bay', shelfBay({ w, h, d: 0.5, rows: Math.round(h / 0.78), kind: low && seed % 2 ? 'none' : kind, seed, wood: K6.timberRed, back: '#3a3a9c' }), M.prop, { pos: [x, 0, BACK + 0.32], rot: [0, 0, (r() - 0.5) * 1.2] }));
  const gableH = (x) => EAVE + (RIDGE - EAVE) * (1 - Math.abs(x) / HW) - 0.5;
  [[-5.45, 'rope', 3], [-4.2, 'books', 4], [-2.95, 'rope', 5], [-1.7, 'books', 6], [-0.42, 'books', 7], [3.55, 'rope', 8], [4.8, 'books', 9]].forEach(([x, kind, seed]) => bay(x, kind, seed, Math.min(4.3, gableH(x))));
  props.add(node('bay-l', shelfBay({ w: 1.5, h: 2.5, d: 0.45, rows: 3, kind: 'books', seed: 12, wood: K6.timberRed, back: '#3a3a9c' }), M.prop, { pos: [-HW + 0.3, 0, -1.9], rot: [0, 90, 0] }), node('bay-l2', shelfBay({ w: 1.5, h: 2.5, d: 0.45, rows: 3, kind: 'rope', seed: 14, wood: K6.timberRed, back: '#3a3a9c' }), M.prop, { pos: [-HW + 0.3, 0, -0.3], rot: [0, 90, 0] }));
  // a ladder to the top shelves
  const ladder = [bar([-0.26, 0, 0], [-0.22, 3.6, 0], 0.04, K6.timber2, 5), bar([0.26, 0, 0], [0.22, 3.6, 0], 0.04, K6.timber2, 5)];
  for (let i = 1; i < 9; i++) ladder.push(bar([-0.25, i * 0.4, 0], [0.25, i * 0.4, 0], 0.028, K6.timber2, 4));
  props.add(node('ladder', merge(ladder), M.prop, { pos: [-3.5, 0, BACK + 1.25], rot: [-14, 6, 0] }));
  // rope everywhere else: hung on the tie-beams and the walls, coiled on the floor
  const hk = hank({ r: 0.3 });
  if (!low) for (const [x, z, yaw] of [[-2.6, -2.1, 0], [-1.5, -2.1, 0], [2.7, -2.1, 0], [3.6, -2.1, 0]]) props.add(node('hank', hk, M.prop, { pos: [x, 4.36, z + 0.1], rot: [0, yaw, 0], castShadow: false }));
  for (const [z, y] of [[-2.9, 2.5], [-1.6, 2.45], [0.2, 2.5]]) props.add(node('hank-r', hk, M.prop, { pos: [HW - 0.14, y, z], rot: [0, -90, 0], castShadow: false }));
  props.add(node('coil1', ropeCoil({ r: 0.48, turns: 6 }), M.prop, { pos: [2.9, 0, -3.2] }), node('coil2', ropeCoil({ r: 0.4, turns: 4, color: K6.rope2 }), M.prop, { pos: [3.05, 0.4, -3.25] }), node('coil3', ropeCoil({ r: 0.44, turns: 5 }), M.prop, { pos: [-4.9, 0, 0.9] }), node('cask', cask({}), M.prop, { pos: [5.3, 0, -3.3] }));

  // ---- the standing desk, the rope ledger, the green lamp, the key
  const DESK = [-1.35, 0, -2.15], DESK_YAW = 10;
  const dm = clerkDesk({ w: 1.45, d: 0.85, h: 1.1 });
  props.add(node('desk', dm, M.prop, { pos: DESK, rot: [0, DESK_YAW, 0] }));
  const onDesk = (lx, ly, lz) => { const c = Math.cos(DESK_YAW * DEG), s = Math.sin(DESK_YAW * DEG); return [DESK[0] + lx * c + lz * s, ly, DESK[2] - lx * s + lz * c]; };
  const BOOK = onDesk(0.08, dm.anchors.slope[1] - 0.02, 0.04);
  props.add(node('ledger', openBook({ w: 0.95, d: 0.6, cover: K6.wine }), M.prop, { pos: BOOK, rot: [dm.anchors.tilt, DESK_YAW, 0] }));
  const lampAt = onDesk(-0.62, 1.37, -0.3);
  const gl = greenLamp({ s: 1.5 });
  props.add(node('green-lamp', gl, M.prop, { pos: lampAt, rot: [0, DESK_YAW - 20, 0], castShadow: false }));
  const la = gl.anchors.lamp, lc = Math.cos((DESK_YAW - 20) * DEG), ls = Math.sin((DESK_YAW - 20) * DEG);
  const LAMP = [lampAt[0] + la[0] * lc + la[2] * ls, lampAt[1] + la[1], lampAt[2] - la[0] * ls + la[2] * lc];
  props.add(node('stool', merge(tint(place(cylinder(0.2, 0.18, 0.07, 10), 0, 0.72, 0), K6.teal), ...[0, 1, 2].map((i) => bar([Math.cos(i * 2.09) * 0.22, 0, Math.sin(i * 2.09) * 0.22], [Math.cos(i * 2.09) * 0.1, 0.72, Math.sin(i * 2.09) * 0.1], 0.03, K6.timberDark, 4))), M.prop, { pos: [-2.75, 0, -1.5] }));
  props.add(node('books-floor', merge(tint(place(box(0.5, 0.09, 0.36), 0, 0.045, 0, 0, 12, 0), K6.books[3]), tint(place(box(0.46, 0.08, 0.34), 0.02, 0.13, 0, 0, -8, 0), K6.books[0]), tint(place(box(0.44, 0.08, 0.32), 0, 0.21, 0.01, 0, 20, 0), K6.books[2])), M.prop, { pos: [-0.2, 0, -2.9] }));
  // a rug in the Compact's colours under the stage
  const rug = merge(tint(place(box(5.2, 0.016, 2.5), 0, 0.008, 0), K6.coral), tint(place(box(4.7, 0.018, 2.0), 0, 0.01, 0), K6.cream), tint(place(box(4.3, 0.02, 1.6), 0, 0.012, 0), K6.tealDark), tint(place(cylinder(0.5, 0.5, 0.022, 14), 0, 0.004, 0), K6.yellow));
  props.add(node('rug', setOutline(rug, 0.5), M.flat, { pos: [0.1, 0, 0.5], rot: [0, 2, 0], castShadow: false }));

  // ---- the stair down to the walk, at the right: a rail round the well and the walk's lamplight coming up
  const STAIR = [4.5, 0, -0.8];
  const well = [tint(place(box(1.5, 0.02, 1.9), 0, 0.012, 0), '#2a2a7c'), setGlow(tint(place(box(1.3, 0.02, 1.7), 0, 0.016, 0), '#ffb450'), 0.85)];
  for (const [x, z] of [[-0.8, -1.0], [0.8, -1.0], [-0.8, 1.0], [0.8, 1.0]]) well.push(bar([x, 0, z], [x, 0.95, z], 0.05, K6.timberRed, 5));
  well.push(bar([-0.8, 0.92, -1.0], [0.8, 0.92, -1.0], 0.04, K6.timber2, 5), bar([-0.8, 0.92, -1.0], [-0.8, 0.92, 1.0], 0.04, K6.timber2, 5), bar([0.8, 0.92, -1.0], [0.8, 0.92, 1.0], 0.04, K6.timber2, 5));
  props.add(node('stair-well', merge(well), M.prop, { pos: STAIR, castShadow: false }));
  scene.root.add(mergeStatic(room, 'room'), mergeStatic(props, 'props'));

  // ---- outside: one crane on the quay below, the roads
  const out = group('out');
  out.add(node('crane', gantry({ h: 10.5, reach: 7, seed: 4, color: '#5f7cf0', cab: '#7f98f6', roof: '#4a64e0', detail: 0, lit: true, load: true }), M.speck, { pos: [4.4, WATER + 1.5, -15], rot: [0, 186, 0] }));
  out.add(node('quay', tint(place(box(60, 1.5, 6), 0, WATER + 0.75, -11), '#3444a8'), M.speck));
  scene.root.add(mergeStatic(out, 'outside'));
  const sprites = scene.sprites = createSprites(low ? 128 : 256);
  const riding = [];
  for (let i = 0; i < (low ? 5 : 11); i++) riding.push(sprites.add({ kind: 'glow', pos: [-9 + i * 2.6 + r() * 2, WATER + 0.9 + r() * 0.8, -30 - r() * 40], size: 1.1 + r() * 0.8, color: '#ffe2a0', alpha: 0.7 }));
  const cabGlow = sprites.add({ kind: 'glow', pos: [4.4, WATER + 8.0, -15.5], size: 1.6, color: '#ffc860', alpha: 0.7 });

  // ---- light you can see: the moon through the window, the lamp's cone on the book, the stair's glow
  const moonDir = [-0.42, -0.62, 1];
  scene.root.add(node('shafts', merge(place(shaft({ w: WIN.w * 0.9, h: (WIN.top - WIN.sill) * 0.78, dir: moonDir, len: 7.2, cards: 4, color: '#9fb4ff', spread: 0.18 }), WIN.x, (WIN.sill + WIN.top) / 2 + 0.1, BACK + 0.05), place(shaft({ w: 1.2, h: 0.2, dir: [0.1, 1, 0.12], len: 2.6, cards: 2, color: '#ff9a40', spread: 0.5 }), STAIR[0], 0.1, STAIR[2], 0, 0, 0)), M.shaft));
  const pt = group('patches');
  pt.add(node('moon-patch', patch({ w: 2.1, d: 3.4, panes: 2, shear: -0.42, color: '#b4c2ff', glow: 0.55, taper: 1.15 }), M.flat, { pos: [WIN.x - 1.95, 0.03, BACK + 4.75] }));
  scene.root.add(mergeStatic(pt, 'patches'));
  const cone = node('lamp-cone', tint(place(rayMesh(1.0, 0.12, 0.62, 14), LAMP[0], LAMP[1] - 0.02, LAMP[2]), '#d8ffb0'), M.cone); scene.root.add(cone);

  // the key: its own node, so it can be taken
  const KEY = onDesk(0.52, dm.anchors.slope[1] + 0.03, 0.2);
  const keyNode = node('key', merge(tint(place(torus(0.05, 0.016, 8, 4), 0, 0.012, 0), K6.brass), tint(place(box(0.15, 0.022, 0.024), 0.11, 0.012, 0), K6.brass), tint(place(box(0.03, 0.022, 0.055), 0.17, 0.012, 0.03), K6.brass)), M.prop, { pos: KEY, rot: [dm.anchors.tilt, DESK_YAW + 30, 0] }); keyNode.castShadow = false;
  scene.root.add(keyNode);
  const keyGlint = sprites.add({ kind: 'sparkle', pos: [KEY[0], KEY[1] + 0.06, KEY[2]], size: 0.3, color: '#fff2b0', alpha: 0.8 });

  const fg = group('fg');
  fg.add(node('fg1', ropeCoil({ r: 0.36, turns: 4 }), M.prop, { pos: [-2.0, 0, 2.9] }), node('fg2', merge(tint(place(box(0.5, 0.09, 0.36), 0, 0.045, 0, 0, 12, 0), K6.books[1]), tint(place(box(0.46, 0.08, 0.34), 0.02, 0.13, 0, 0, -8, 0), K6.books[5])), M.prop, { pos: [1.9, 0, 2.9] }));
  const foreground = mergeStatic(fg, 'foreground'); scene.root.add(foreground);
  const actors = group('actors'); scene.root.add(actors);

  const lamps = [
    { name: 'green-lamp', pos: [LAMP[0] + 0.3, LAMP[1] - 0.1, LAMP[2] + 0.7], color: '#ffe4a0', radius: 7, base: 2.5, flicker: 0.03 },
    { name: 'lamp-shade', pos: [LAMP[0], LAMP[1] + 0.9, LAMP[2] + 0.3], color: '#7fffb0', radius: 3.2, base: 0.9, flicker: 0.02 },
    { name: 'stair', pos: [STAIR[0] - 0.6, 1.0, STAIR[2] + 0.4], color: '#ff9a48', radius: 6.4, base: 2.2 },
    { name: 'moon', pos: [WIN.x - 1.2, 1.4, BACK + 3.4], color: '#8fa8ff', radius: 5.2, base: 1.2, flicker: 0, fixed: true },
    { name: 'moon-win', pos: [WIN.x, 2.6, BACK + 1.0], color: '#9fb4ff', radius: 4.2, base: 0.9, flicker: 0, fixed: true },
  ];
  const glows = [
    { sprite: sprites.add({ kind: 'glow', pos: LAMP, size: 1.5, color: '#c8ffb0', alpha: 0 }), base: 0.55 },
    { sprite: sprites.add({ kind: 'glow', pos: [STAIR[0], 0.4, STAIR[2]], size: 3.0, color: '#ff9a40', alpha: 0 }), base: 0.45 },
  ];
  const lampStar = sprites.add({ kind: 'sparkle', pos: LAMP, size: 0.7, color: '#f0ffd0', alpha: 0.6 });
  const moths = low ? [] : [0, 1].map((i) => ({ s: sprites.add({ kind: 'glow', pos: [LAMP[0], LAMP[1], LAMP[2]], size: 0.07, color: '#fff6e0', alpha: 0.9 }), ph: i * 2.4, sp: 2.6 + i * 0.9 }));

  // ---- the live stage's task: the working of the sum, on a slate stood against the shelves right of the desk
  const SLATE = [0.55, 0, -2.75], ROW_W = [0.9, 0.7, 0.98, 0.56], ROW_COL = [K6.chalk, K6.chalk, K6.chalk, K6.yellow];
  const slate = group('slate');
  slate.add(node('slate-board', merge(tint(place(box(1.3, 1.5, 0.05), 0, 1.35, 0), '#2c4a66'), tint(place(box(1.42, 0.08, 0.08), 0, 2.13, 0), K6.timberRed), tint(place(box(1.42, 0.08, 0.1), 0, 0.57, 0.01), K6.timberRed), tint(place(box(0.08, 1.64, 0.08), -0.69, 1.35, 0), K6.timberRed), tint(place(box(0.08, 1.64, 0.08), 0.69, 1.35, 0), K6.timberRed), tint(place(box(0.5, 0.56, 0.4), 0, 0.28, -0.1), K6.books[2])), M.prop));
  const rows = ROW_W.map((w, i) => { const n = node('slate-row' + i, setGlow(tint(place(box(1, 0.09, 0.02), 0.5, 0, 0), ROW_COL[i]), 0.55), M.prop, { pos: [-0.5, 1.9 - i * 0.32, 0.04] }); n.castShadow = false; n.visible = false; slate.add(n); return n; });
  const ring = node('slate-ring', setGlow(tint(place(torus(0.2, 0.025, 14, 5), 0, 0, 0, 90, 0, 0), K6.yellow), 0.8), M.prop, { pos: [0.3, 0.94, 0.05] }); ring.castShadow = false; ring.visible = false; slate.add(ring);
  slate.position[0] = SLATE[0]; slate.position[2] = SLATE[2]; slate.setRot(-6, -8, 0); slate.visible = false;
  scene.root.add(slate);
  const slateGlow = sprites.add({ kind: 'glow', pos: [SLATE[0] + 0.3, 0.95, SLATE[2] + 0.3], size: 1.2, color: '#ffe27a', alpha: 0 });
  let work = 0;
  const ledgerUnit = taskUnit({
    pos: [SLATE[0], 1.4, SLATE[2] + 0.2], stand: [-0.45, -0.95],
    apply(v, fresh) {
      if (fresh) { slate.visible = true; setKey(true); }
      work = v;
      for (let i = 0; i < 4; i++) { const u = Math.max(0, Math.min(1, v * 4 - i)); rows[i].visible = u > 0.02; rows[i].setScale(Math.max(0.001, ROW_W[i] * u), 1, 1); }
      ring.visible = v >= 0.999; setLamp(0.42 + 0.58 * v);
    },
  });
  /** 'rope-ledger' (ch6.s3): four rows of the sum chalked a row a letter, the green lamp turned up as they read; ringed at the end. */
  const task = (type) => (type === 'rope-ledger' ? ledgerUnit.arm() : null);
  const hush = pulse(1.8);
  /** The drain: a step on the stair. The lamp is turned right down until it has gone. */
  function setback() { hush.hit(); }
  /** The slate is only there once the encounter has put it there; a cutscene reached some other way sees the room as built. */
  function cue(lineId) { if (lineId === 'ch6.s3.c01' && !slate.visible) { setLamp(1); return true; } return false; }

  let lampLevel = 1;
  const rnd = rng(19), P = [0, 0, 0], V = [0, 0, 0];
  let nextMote = 0;
  function setKey(on) { keyNode.visible = !!on; }
  function setLamp(v) { lampLevel = Math.max(0, Math.min(1, v)); }
  function tick(time, dt, pw, live) {
    const hs = hush.value(dt), lampLevel0 = lampLevel;
    lampLevel = lampLevel0 * (1 - 0.92 * hs);
    env.points[2].intensity *= 1 + 0.9 * hs;                   // the stair's light comes up as somebody climbs it
    slateGlow.alpha = work >= 0.999 ? 0.45 + 0.15 * Math.sin(time * 3) : 0;
    env.points[0].intensity *= lampLevel; env.points[1].intensity *= lampLevel;
    glows[0].sprite.alpha *= lampLevel; cone.visible = pw * lampLevel > 0.05; lampStar.alpha = 0.5 * Math.min(1, pw) * lampLevel; lampStar.rot = time * 0.3;
    keyGlint.alpha = keyNode.visible ? 0.4 + 0.4 * Math.sin(time * 2.2) : 0;
    for (let i = 0; i < moths.length; i++) { const m = moths[i], a = time * m.sp + m.ph; m.s.pos[0] = LAMP[0] + Math.cos(a) * 0.3; m.s.pos[1] = LAMP[1] - 0.1 + Math.sin(a * 1.7) * 0.14; m.s.pos[2] = LAMP[2] + Math.sin(a) * 0.3; m.s.alpha = 0.9 * lampLevel; }
    for (let i = 0; i < riding.length; i++) riding[i].alpha = 0.55 + 0.2 * Math.sin(time * 1.7 + i * 2.3);
    cabGlow.alpha = 0.6 + 0.15 * Math.sin(time * 1.1);
    if (live && !low && time > nextMote) { // dust in the moon's shaft, drifting down it
      nextMote = time + 0.22; const u = rnd(); P[0] = WIN.x + (rnd() - 0.5) * 1.6 + moonDir[0] * u * 5; P[1] = 3.0 + (rnd() - 0.5) * 1.6 + moonDir[1] * u * 4.4; P[2] = BACK + 0.5 + moonDir[2] * u * 5; V[0] = -0.06; V[1] = -0.05; V[2] = 0.08;
      sprites.spawn({ kind: 'glow', pos: P, vel: V, size: 0.05 + rnd() * 0.06, life: 5, color: '#dfe6ff', alpha: 0.8 });
    }
    lampLevel = lampLevel0;
  }

  return shell({
    id: 'counting-room', light, L, low, scene, cameras: CAMERAS, actors, foreground, lamps, glows, tick, cue, house: 0.45,
    marks: { ...STD_MARKS(), desk: { pos: onDesk(0.05, 0, 0.95), face: 180 + DESK_YAW }, book: BOOK, key: KEY, focus: LAMP },
    extra: { setKey, setLamp, task, setback, passLamp: setback },
  });
}

export const countingRoom = { id: 'counting-room', lights: [...Object.keys(LIGHTS), ...Object.keys(CORE)], cameras: Object.keys(CAMERAS), build };
export default countingRoom;
