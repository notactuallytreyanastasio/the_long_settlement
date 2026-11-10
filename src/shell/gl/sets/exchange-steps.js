// SET: exchange-steps. The porch of the Tallis Exchange, looking out between its columns: the opening bell
// hangs in the middle bay, six steps go down to a small square, the Mint hall stands on the left corner with
// its doors barred and three windows of five shuttered, and one street runs straight downhill between tall
// gabled houses to the harbour and the sun. The city stands in that square and that street and looks up.
// Chapter 5: ch5.s6 The Steps (morning: the run, the four findings, "Not behind. Beside."), ch5.s7 Default
// (dusk: the Line opens, contract 417 is declined), ch5.epi.01 (night over Tallis).
//
//   import { exchangeSteps } from './sets/exchange-steps.js';
//   const set = exchangeSteps.build(GL, { light: 'morning' | 'dusk' | 'night', low: false });
//
// Same shape as sets/lantern-stalls.js. Figures face +Z, cameras look toward -Z (down the street), the strip
// x -4.4..4.4, z 0..1.6 is clear, the back row z -0.1..0.2 too (columns and rail stand at z <= -1).
//
// What this set can do for its story:
//   setCrowd(0..1)     how much of the city is in the square and the street (morning 1, dusk 0.18, night 0)
//   setMood(0..1)      0.1 = everyone watching everyone else's feet, 1 = a run
//   ring()             the opening / closing bell swings
//   cue(lineId)        ch5.s6.c01 (bell, full street), c03 / c10 / c13 (shouting), c04 / c11 / c14 (listening),
//                      c20 (the tide), c23 (stood still), c25 (closing bell), ch5.s7.c01, ch5.epi.01
// marks: a, b, c, two, party, opposition as everywhere, plus
//   rail { pos, face }: where a hand lies flat on the rail   bell, focus (world points: the bell's mouth)

import { m4, quat, rng, DEG, rgb } from '../math.js';
import { merge, tint, place, box, cylinder, quad, extrude, setGlow, sphere, roundedBox } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic, makeInstances } from '../scene.js';
import { createSprites } from '../sprites.js';
import { rayMesh, rayMaterial } from '../fx.js';
import { PAL, pickLight, steps, cloudBank, gull, headland, townBank, crate, ledgerBook } from './kit.js';
import { TL, MARKS, ch5Materials, shell, dirFrom, throng, papers, gableHouse, fatColumn, bell, lantern, ironRail, paving, lightNames, ownLight, taskUnit } from './kit-ch5.js';

const COL_Z = -1.5, RAIL_Z = -1.95, EDGE_Z = -2.2, STEP_N = 6, RISE = 0.2, RUN = 0.42;
const STREET_Y = -STEP_N * RISE, FOOT_Z = EDGE_Z - STEP_N * RUN, ROW_Z = -10.9, SW = 2.9, SLOPE_Z = -13.5, QUAY_Z = -50, QUAY_Y = -3.0, WATER = -3.7;
const streetY = (z) => (z > SLOPE_Z ? STREET_Y : STREET_Y + (QUAY_Y - STREET_Y) * (SLOPE_Z - z) / (SLOPE_Z - QUAY_Z));

// core light names (core/stage.js) this set answers besides its own
const ALIAS = { day: 'morning', dawn: 'morning' };

const LIGHTS = {
  morning: {
    preset: 'day', power: 0.3, crowd: 1, mood: 0.6, lit: 0.12, win: 0, pane: '#9fd4ff',
    env: {
      key: { dir: dirFrom(-76, 19), color: '#ffeec2' },   // the sun is drawn at the foot of the street; the light comes over the roofs on the left, so fronts are lit and the columns lie across the landing
      shadow: { tint: '#8480e6', lift: 0.08, saturate: 1.4 },
      ambient: { sky: '#c6e4ff', ground: '#9080e0', amount: 0.17 },
      rim: { color: '#fff2b8', amount: 1.0, edge: 0.72 },
      fog: { density: 0.0042, start: 14, max: 0.85 },
      sky: { zenith: '#3f8fe8', mid: '#93d4f8', midAt: 0.5, horizon: '#fff3b8', below: '#ffdca0', glow: '#fff6c8', glowAmount: 0.6, sunDir: dirFrom(-3.6, 8.6), sun: { color: '#fffbe6', size: 2.5, halo: '#ffe28a', haloAmount: 0.46 } },
      water: { deep: '#2a66d0', mid: '#46a0ea', shallow: '#86e6da', foam: '#fffbe8', glint: '#fff0b0', glintDensity: 0.34 },
    },
    cloud: { color: '#fff6e0', shadowTint: '#b8c0f4' }, shaft: 0.26, shaftColor: '#fff0b0', paper: '#fffaf0', mote: '#ffffff',
  },
  dusk: {
    preset: 'sunset', power: 1, crowd: 0.18, mood: 0.15, lit: 0.6, win: 0.4, pane: '#6a6fd0',
    env: {
      key: { dir: dirFrom(-22, 14), color: '#ffcb96' },
      shadow: { tint: '#7468de', lift: 0.1, saturate: 1.4 },
      ambient: { sky: '#ff9c86', ground: '#6e5cc8', amount: 0.16 },
      rim: { color: '#ffd080', amount: 1.0, edge: 0.72 },
      fog: { density: 0.0042, start: 14, max: 0.88 },
      sky: { zenith: '#30389e', mid: '#a468e0', midAt: 0.46, horizon: '#ff9c58', below: '#f08870', glow: '#ffd070', glowAmount: 0.6, sunDir: dirFrom(-3.4, 3.4), sun: { color: '#fff4d0', size: 2.9, halo: '#ffb060', haloAmount: 0.5 } },
      water: { deep: '#3440a8', mid: '#7a68d8', shallow: '#ffa878', foam: '#ffe8d0', glint: '#ffd890', glintDensity: 0.3 },
    },
    cloud: { color: '#ffc8a0', shadowTint: '#b060b8' }, shaft: 0.3, shaftColor: '#ffc880', paper: '#ffe6d0', mote: '#ffd070',
  },
  night: {
    preset: 'night', power: 1.25, crowd: 0, mood: 0.1, lit: 0.62, win: 0.5, pane: TL.glassOff,
    env: {
      key: { dir: dirFrom(-30, 40), color: '#86a4f4' },
      shadow: { tint: '#2f44a8', lift: 0.12, saturate: 1.25 },
      ambient: { sky: '#4162d4', ground: '#2a3a92', amount: 0.17 },
      fog: { density: 0.0042, start: 16, max: 0.86 },
      sky: { zenith: '#0c1a70', mid: '#1c3fb0', midAt: 0.42, horizon: '#4f82e6', below: '#3058c4', sunDir: dirFrom(4.5, 11), moon: 0.72, stars: 1, sun: { size: 2.3 } },
      water: { deep: '#132a86', mid: '#1e45ae', shallow: '#3478d6', glintDensity: 0.18 },
    },
    cloud: { color: '#8fa6ea', shadowTint: '#3a50aa' }, shaft: 0, shaftColor: '#ffc880', paper: '#aebcf4', mote: '#ffd070',
  },
};

const CAMERAS = {
  wide: { target: [0.05, 1.62, -0.4], dist: 8.3, yaw: 2, pitch: 4.5, fov: 44, aspect: 0.46, shadowCenter: [0, 0, -0.6], shadowRadius: 8 },
  two: { target: [0, 1.12, 0.6], dist: 6.0, yaw: -14, pitch: 5, fov: 31, aspect: 0.46, shadowCenter: [0, 0, 0.3], shadowRadius: 3.8 },
  close: { target: [0.02, 0.86, 0.8], dist: 3.9, yaw: 19, pitch: 3, fov: 28, aspect: 0.46, shadowCenter: [0, 0, 0.5], shadowRadius: 2.6 },
  low: { target: [0.05, 2.05, -0.2], dist: 6.3, yaw: -6, pitch: -12, fov: 56, aspect: 0.46, shadowCenter: [0, 0, -0.6], shadowRadius: 8 },
  stage: { target: [0, 1.0, 0.4], dist: 9.6, yaw: -13, pitch: 7.5, fov: 24, aspect: 1.95, shadowCenter: [0, 0, -0.3], shadowRadius: 7.5, outline: 0.7 },
  landscape: { target: [0, 1.75, -1.2], dist: 10.4, yaw: 4, pitch: 4.5, fov: 40, aspect: 1.6, shadowCenter: [0, 0, -1], shadowRadius: 10 },
};

const bx = (w, h, d, x, y, z, c, rx = 0, ry = 0, rz = 0) => tint(place(box(w, h, d), x, y, z, rx, ry, rz), c);

/** The Mint's hall in Tallis: five tall windows, three of them shuttered "for the protection of depositors", and a bar across the bronze doors. Front faces +Z. */
function mintHall({ w = 8, h = 5.2, d = 3, lit = 0.5 } = {}) {
  const parts = [bx(w, h, d, 0, h / 2, 0, '#fff3d8'), bx(w + 0.3, 0.5, d + 0.3, 0, 0.25, 0, TL.stone2), bx(w + 0.4, 0.3, d + 0.4, 0, h + 0.05, 0, TL.brass), bx(w + 0.1, 0.5, d + 0.1, 0, h + 0.45, 0, '#ffe6c0')], wins = [];
  parts.push(tint(place(extrude([[-w * 0.3, 0], [0, 1.3], [w * 0.3, 0]], 0.5, { crease: 30 }), 0, h + 0.7, d / 2 - 0.3), TL.slate), tint(place(cylinder(0.36, 0.36, 0.12, 10), 0, h + 1.12, d / 2, 90, 0, 0), TL.brass));
  const bay = w / 5.4, z = d / 2;
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * bay;
    if (i < 4) parts.push(bx(0.26, h - 0.5, 0.18, x + bay / 2, h / 2 + 0.25, z + 0.04, TL.stone2));
    if (i === 2) { // the doors, barred
      parts.push(bx(1.5, 2.7, 0.14, x, 1.85, z + 0.02, TL.slateDark), bx(1.26, 2.5, 0.12, x, 1.75, z + 0.07, TL.brassDark), bx(0.04, 2.5, 0.13, x, 1.75, z + 0.08, TL.slateDark), bx(1.6, 0.16, 0.14, x, 1.7, z + 0.16, TL.navy));
      for (let k = 0; k < 2; k++) parts.push(bx(2.1 - k * 0.4, 0.25, 0.5 - k * 0.2, x, 0.12 + k * 0.25, z + 0.3 - k * 0.1, TL.stone));
      continue;
    }
    const shut = i !== 3, wy = 2.5, wh = 2.3, ww = 0.86;
    parts.push(bx(ww + 0.2, wh + 0.2, 0.1, x, wy, z + 0.02, TL.slateDark), tint(place(cylinder(ww / 2 + 0.1, ww / 2 + 0.1, 0.1, 8), x, wy + wh / 2, z + 0.02, 90, 0, 0), TL.slateDark));
    if (shut) { for (const sx of [-1, 1]) parts.push(bx(ww / 2 - 0.02, wh, 0.07, x + sx * ww / 4, wy, z + 0.08, TL.tealDark)); parts.push(bx(ww + 0.1, 0.1, 0.09, x, wy, z + 0.12, TL.navy)); }
    else { parts.push(setGlow(bx(ww, wh, 0.06, x, wy, z + 0.07, lit > 0.3 ? TL.glass : '#bfe0ff'), lit > 0.3 ? 0.9 : 0.25), bx(0.05, wh, 0.07, x, wy, z + 0.09, TL.slateDark), bx(ww, 0.05, 0.07, x, wy + 0.3, z + 0.09, TL.slateDark)); wins.push([x, wy, z + 0.15]); }
  }
  const m = merge(parts); m.anchors = { windows: wins, door: [0, 0, z + 0.6] };
  return m;
}

function build(engine = null, { light: lightName = 'morning', low = false } = {}) {
  const { name: light, L } = pickLight('exchange-steps', LIGHTS, ownLight(LIGHTS, ALIAS, lightName));
  const M = ch5Materials(), r = rng(5151);
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  env.water.level = WATER;
  env.water.shores = [[0, QUAY_Z + 0.1 + 900, 900, 0.75]];

  // ---- the porch: landing, colonnade, bell bay, rail, steps
  const porch = group('porch'), flat = group('flat'), town = group('town'), far = group('far');
  flat.add(node('landing', paving({ w: 22, d: 7.4, nx: 11, nz: 5, seed: 3, colors: ['#f2dcae', '#e8cc9a', '#f6e4bc'], grout: '#c8a67c' }), M.flat, { pos: [0, 0, EDGE_Z + 3.7] }));
  flat.add(node('carpet', merge(bx(2.2, 0.01, 3.0, 0, 0.006, 0.4, TL.wine), bx(1.9, 0.012, 2.7, 0, 0.008, 0.4, '#d8527a'), bx(2.2, 0.012, 0.12, 0, 0.01, -1.02, TL.brass), bx(2.2, 0.012, 0.12, 0, 0.01, 1.82, TL.brass)), M.flat));
  town.add(node('steps', steps({ w: 22, n: STEP_N, rise: RISE, run: RUN, color: TL.stone, color2: '#f0dcb4' }), M.ground, { pos: [0, 0, EDGE_Z] }));
  const COLS = [-9.4, -5.6, -1.8, 1.8, 5.6, 9.4], COL_H = 4.7;
  const col = fatColumn({ h: COL_H, r: 0.34, color: '#f4e0b8', base: '#e6cc9c' });
  for (const x of COLS) porch.add(node('column', col, M.prop, { pos: [x, 0, COL_Z], rot: [0, x * 7, 0] }));
  // entablature: a copper-green frieze under a stone cornice, brass dentils, and the foot of a pediment for the low camera
  const ent = [bx(22.5, 0.34, 1.2, 0, COL_H + 0.17, COL_Z, TL.stone), bx(22.5, 0.5, 1.1, 0, COL_H + 0.59, COL_Z, TL.copper), bx(22.9, 0.22, 1.5, 0, COL_H + 0.95, COL_Z, TL.stone)];
  for (let i = 0; i < 28; i++) ent.push(bx(0.26, 0.2, 0.1, -10.8 + i * 0.8, COL_H + 0.59, COL_Z + 0.58, TL.brass));
  ent.push(tint(place(extrude([[-9, 0], [0, 2.3], [9, 0]], 0.8, { crease: 30 }), 0, COL_H + 1.06, COL_Z), '#fff3d8'), tint(place(cylinder(0.62, 0.62, 0.16, 12), 0, COL_H + 1.8, COL_Z + 0.42, 90, 0, 0), TL.brass), tint(place(cylinder(0.42, 0.42, 0.18, 12), 0, COL_H + 1.8, COL_Z + 0.44, 90, 0, 0), TL.copperDark));
  porch.add(node('entablature', merge(ent), M.prop));
  const B = bell({ r: 0.44 }), BELL = [0, COL_H - 0.08, COL_Z];
  porch.add(node('bell-yoke', B.yoke, M.deco, { pos: BELL }));
  // the rail: short returns either side of the way down, long runs in the outer bays
  const newel = merge(bx(0.34, 0.82, 0.34, 0, 0.41, 0, TL.stone), bx(0.44, 0.1, 0.44, 0, 0.86, 0, TL.stone2), tint(place(sphere(0.15, 8, 5), 0, 1.04, 0), TL.brass));
  for (const sx of [-1, 1]) {
    porch.add(node('newel', newel, M.prop, { pos: [sx * 0.86, 0, RAIL_Z] }));
    porch.add(node('rail-c', ironRail({ len: 0.5, bay: 0.25, knobs: false }), M.prop, { pos: [sx * 1.2, 0, RAIL_Z] }));
    porch.add(node('rail-1', ironRail({ len: 2.8, bay: 0.56 }), M.prop, { pos: [sx * 3.7, 0, RAIL_Z] }));
    porch.add(node('rail-2', ironRail({ len: 2.8, bay: 0.56 }), M.prop, { pos: [sx * 7.5, 0, RAIL_Z] }));
  }
  // lanterns on brackets inside the middle bay and the outer ones
  const lit = L.power > 0, lan = lantern({ s: 1.5, lit }), LAN = [[-1.22, 3.3, COL_Z + 0.1], [1.22, 3.3, COL_Z + 0.1], [-5.02, 3.3, COL_Z + 0.1], [5.02, 3.3, COL_Z + 0.1]];
  LAN.forEach((p, i) => { const sx = i % 2 ? 1 : -1; porch.add(node('lantern', lan, M.deco, { pos: p }), node('bracket', merge(bx(0.42, 0.06, 0.06, sx * 0.2, 0.03, 0, TL.iron), bx(0.06, 0.3, 0.06, sx * 0.38, -0.12, 0, TL.iron)), M.deco, { pos: p })); });
  const lanPos = LAN.map((p) => [p[0], p[1] - 0.45, p[2]]);

  // ---- the square and the street
    town.add(node('square', tint(place(quad(60, FOOT_Z - SLOPE_Z + 0.4), 0, STREET_Y, (FOOT_Z + SLOPE_Z) / 2 + 0.2, -90, 0, 0), '#f6e2b6'), M.ground));
  { const len = Math.hypot(SLOPE_Z - QUAY_Z, STREET_Y - QUAY_Y), ang = Math.atan2(STREET_Y - QUAY_Y, SLOPE_Z - QUAY_Z) / DEG;
    town.add(node('street', tint(place(quad(60, len), 0, (STREET_Y + QUAY_Y) / 2, (SLOPE_Z + QUAY_Z) / 2, -90 - ang, 0, 0), '#f0d8a8'), M.ground)); }
  town.add(node('quay', bx(70, 1.6, 0.6, 0, QUAY_Y - 0.8, QUAY_Z - 0.3, PAL.stone2), M.ground));
  const houses = [];
  const farMat = M.farFlat;
  const addHouse = (pos, yaw, opts, mat = M.wall, to = town) => { const m = gableHouse({ lit: L.lit, dark: L.pane, ...opts }); to.add(node('house', m, mat, { pos, rot: [0, yaw, 0] })); houses.push({ m, pos, yaw }); return m; };
  const hall = mintHall({ lit: L.lit });
  const HALL = [-(SW + 4.1), STREET_Y, ROW_Z];
  town.add(node('mint-hall', hall, M.wall, { pos: HALL }));
  addHouse([-(SW + 9.9), STREET_Y, ROW_Z + 0.1], 4, { w: 3.2, h: 5.6, floors: 3, cols: 2, wall: TL.rose, roof: TL.slate, gable: 'bell', seed: 3, awning: PAL.coral });
  addHouse([SW + 1.5, STREET_Y, ROW_Z + 0.2], -3, { w: 3.0, h: 5.9, floors: 3, cols: 2, wall: TL.lemon, roof: TL.copper, gable: 'step', seed: 5, awning: TL.teal, shutter: PAL.coral });
  addHouse([SW + 4.7, STREET_Y, ROW_Z], 2, { w: 3.2, h: 4.8, floors: 2, cols: 3, wall: TL.mintWall, roof: TL.brick, gable: 'point', seed: 8, shutter: TL.royal });
  addHouse([SW + 8.1, STREET_Y, ROW_Z + 0.2], -4, { w: 3.3, h: 6.4, floors: 4, cols: 2, wall: TL.cream, roof: TL.slate, gable: 'step', seed: 11, awning: PAL.yellow, shutter: TL.wine });
  if (!low) addHouse([SW + 11.6, STREET_Y, ROW_Z], 3, { w: 3.2, h: 5.2, floors: 3, cols: 2, wall: TL.lilac, roof: TL.copper, gable: 'bell', seed: 13 });
  // down the street, both sides, gables to the road
  const walls = [TL.cream, TL.rose, TL.sky, TL.lemon, TL.mintWall, TL.lilac, '#ffd9c0'], roofs = [TL.copper, TL.brick, TL.slate, '#e86a9a', TL.copperDark], gables = ['step', 'bell', 'point'];
  const NS = low ? 4 : 6;
  for (let i = 0; i < NS; i++) for (const sx of [-1, 1]) {
    const z = -14.4 - i * 3.5 - (sx > 0 ? 0.9 : 0), hh = 4.6 + r() * 2.4;
    addHouse([sx * (SW + 1.25 + r() * 0.3), streetY(z) - 0.3, z], -sx * (86 + r() * 8), { w: 3.3, d: 2.6, h: hh, floors: hh > 5.6 ? 4 : 3, cols: 2, wall: walls[(i * 2 + (sx > 0 ? 1 : 0)) % walls.length], roof: roofs[(i + (sx > 0 ? 2 : 0)) % roofs.length], gable: gables[(i + (sx > 0 ? 1 : 0)) % 3], seed: 20 + i * 2 + sx, shut: 0.15, awning: i % 2 === 0 ? [PAL.coral, TL.teal, PAL.yellow][i % 3] : null, door: i < 3 }, i < 3 ? M.wall : farMat, i < 3 ? town : far);
  }
  // masts at the foot of the street
  for (const [x, hgt, c] of [[-1.6, 7.5, PAL.red], [1.9, 6.2, TL.teal], [4.4, 8.2, PAL.yellow]]) far.add(node('mast', merge(tint(place(cylinder(0.12, 0.07, hgt, 5), 0, 0, 0), TL.woodDark), bx(2.4, 0.1, 0.1, 0, hgt * 0.72, 0, TL.woodDark), bx(1.5, 0.08, 0.08, 0, hgt * 0.45, 0, TL.woodDark), tint(place(extrude([[0, 0], [1.1, 0.2], [0, 0.42]], 0.04), 0.1, hgt - 0.5, 0), c)), farMat, { pos: [x, WATER, QUAY_Z - 3 - Math.abs(x)] }));

  scene.root.add(mergeStatic(flat, 'flat'), mergeStatic(porch, 'porch'), mergeStatic(town, 'town'));

  // ---- far: the rest of the city on its hills either side, a headland across the water
  far.add(node('city-l', townBank({ w: 40, d: 14, h: 9, rows: 3, seed: 4, lit: L.lit + 0.1 }), farMat, { pos: [-30, STREET_Y - 0.6, -17], rot: [0, 28, 0] }));
  far.add(node('city-r', townBank({ w: 40, d: 14, h: 10, rows: 3, seed: 9, lit: L.lit + 0.1 }), farMat, { pos: [31, STREET_Y - 0.6, -18], rot: [0, -30, 0] }));
  if (!low) far.add(node('headland', headland({ w: 90, d: 30, h: 10, seed: 6 }), farMat, { pos: [70, WATER - 0.4, -170], rot: [0, 170, 0] }));
  scene.root.add(mergeStatic(far, 'far'));

  // ---- the bell
  
  const bellNode = node('bell', B.bell, M.prop, { pos: BELL }); bellNode.castShadow = false; scene.root.add(bellNode);
  const MOUTH = [BELL[0], BELL[1] + B.bell.anchors.mouth[1], BELL[2]];

  // ---- the city: a near crowd in the square (kept back from the foot of the steps), a mass down the street
  const spotsNear = [], spotsFar = [];
  for (let row = 0; row < 5; row++) for (let i = 0; i < (low ? 11 : 15); i++) {
    const x = -11 + i * (low ? 2.2 : 1.57) + (row % 2) * 0.6 + (r() - 0.5) * 0.5, z = FOOT_Z - 1.2 - row * 0.92 + (r() - 0.5) * 0.3;
    if (Math.hypot(x, (z - FOOT_Z) * 1.2) < 2.6 || (z < ROW_Z + 2.0 && Math.abs(x) > SW)) continue;
    spotsNear.push({ pos: [x, STREET_Y, z], face: -x * 2.2 + (r() - 0.5) * 24 });
  }
  for (let row = 0; row < (low ? 9 : 16); row++) for (let i = 0; i < 5; i++) {
    const z = ROW_Z + 1.4 - row * 1.25 + (r() - 0.5) * 0.5, x = -2.2 + i * 1.1 + (row % 2) * 0.4 + (r() - 0.5) * 0.4;
    if (r() < 0.12) continue;
    spotsFar.push({ pos: [x, streetY(z), z], face: (r() - 0.5) * 30 });
  }
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const near = throng({ spots: shuffle(spotsNear), material: M.deco, seed: 3, detail: 0, amount: L.crowd });
  const mass = throng({ spots: shuffle(spotsFar), material: M.speck, seed: 7, detail: 0, amount: L.crowd });
  scene.root.add(...near.nodes, ...mass.nodes);

  // ---- the extra page, loose in the square; pigeons that will not settle
  const pages = papers({ count: low ? 8 : 16, box: [-9, 9, STREET_Y, STREET_Y + 1.5, ROW_Z + 1.8, FOOT_Z - 0.4], mode: 'blow', material: M.paper, seed: 4, size: 0.2, colors: [L.paper] });
  scene.root.add(pages.node);
  const birds = node('pigeons', gull({ color: '#e8ecff', tip: '#8d97c9' }), M.speck); birds.instances = makeInstances(5); birds.instances.count = 5;
  if (light !== 'night') scene.root.add(birds);

  // ---- light: sun through the colonnade, lantern cones, halos
  if (L.shaft > 0 && !low) {
    const kd = env.key.dir, yaw = Math.atan2(kd[0], kd[2]) / DEG, tilt = Math.acos(kd[1]) / DEG, parts = [];
    for (const [x, z, len, w] of [[0.5, 0.7, 9.5, 1.3], [-3.4, 0.4, 9.5, 1.1], [4.2, 0.8, 9.5, 1.2]]) parts.push(place(rayMesh(len, 0.5, w, 10), x + kd[0] * len, kd[1] * len - 0.2, z + kd[2] * len, tilt, yaw, 0));
    scene.root.add(node('sun-shafts', tint(merge(parts), L.shaftColor), rayMaterial({ power: 1.3, near: L.shaft, far: L.shaft * 0.35 })));
  }
  let cones = null;
  if (L.power >= 1 && !low) { cones = node('lamp-cones', tint(merge(lanPos.slice(0, 2).map((p) => place(rayMesh(2.6, 0.12, 1.3, 12), p[0], p[1], p[2]))), '#ffc060'), rayMaterial({ power: 1.5, near: 0.4, far: 0 })); scene.root.add(cones); }
  const sprites = scene.sprites = createSprites(low ? 128 : 320), glows = [];
  lanPos.forEach((p) => glows.push({ sprite: sprites.add({ kind: 'glow', pos: p, size: 1.6, color: '#ffb450', alpha: 0 }), base: 0.5 }));
  if (L.win > 0) {
    anchorsOf(hall, HALL, 0).forEach((p) => glows.push({ sprite: sprites.add({ kind: 'glow', pos: p, size: 2.2, color: '#ffc060', alpha: 0 }), base: L.win, fixed: true }));
    houses.slice(0, 5).forEach((h) => anchorsOf(h.m, h.pos, h.yaw).slice(0, 3).forEach((p) => glows.push({ sprite: sprites.add({ kind: 'glow', pos: p, size: 1.2, color: '#ffc060', alpha: 0 }), base: L.win, fixed: true })));
  }
  if (L.power >= 1) for (let i = 0; i < 5; i++) { const z = -15 - i * 4.2, sx = i % 2 ? 1 : -1; glows.push({ sprite: sprites.add({ kind: 'glow', pos: [sx * (SW - 0.2), streetY(z) + 2.0, z], size: 2.0, color: '#ffb450', alpha: 0 }), base: 0.5 }); }
  const clouds = cloudBank({ count: 8, seed: 5, arc: [160, 204], radius: [250, 430], height: [22, 130], size: [0.7, 1.4], speed: 0.05, style: 'painted', ...L.cloud });
  scene.root.add(clouds.node);

  // ---- foreground: the clerk's table with the record on it, a stool
  const fg = group('fg');
  fg.add(node('fg-crate', crate({ s: 0.62, seed: 4, color: TL.wood }), M.prop, { pos: [1.75, 0, 3.0], rot: [0, -18, 0] }), node('fg-book', ledgerBook({ w: 0.6, d: 0.44 }), M.prop, { pos: [1.75, 0.64, 3.0], rot: [0, -30, 0] }), node('fg-crate2', crate({ s: 0.44, seed: 7, color: TL.woodPale }), M.prop, { pos: [-1.8, 0, 3.05], rot: [0, 24, 0] }));
  const foreground = mergeStatic(fg, 'foreground'); scene.root.add(foreground);
  const actors = group('actors'); scene.root.add(actors);

  const lamps = [
    { name: 'porch-l', pos: lanPos[0], color: '#ffb85a', radius: 6.4, base: 1.1 },
    { name: 'porch-r', pos: lanPos[1], color: '#ffc46a', radius: 6.4, base: 1.1 },
    { name: 'bay-l', pos: lanPos[2], color: '#ffc46a', radius: 5.0, base: 0.9 },
    { name: 'bay-r', pos: lanPos[3], color: '#ffc46a', radius: 5.0, base: 0.9 },
  ];

  // ---- per-frame
  const P = [0, 0, 0], V = [0, 0, 0], S3 = [1, 1, 1], Q = quat.create(), Mx = m4.create(), rnd = rng(61);
  let mood = L.mood, swing = 0, swingT = 0, nextGust = 1.5, nextMote = 0;
  function setCrowd(a) { near.setAmount(a); mass.setAmount(a); }
  function setMood(m) { mood = Math.max(0, Math.min(1, m)); }
  function ring() { swing = 1; swingT = 0; }
  const CUES = {
    'ch5.s6.c01': () => { setCrowd(1); setMood(0.7); ring(); }, 'ch5.s6.c03': () => setMood(1), 'ch5.s6.c10': () => setMood(1), 'ch5.s6.c13': () => setMood(0.9),
    'ch5.s6.c04': () => setMood(0.35), 'ch5.s6.c11': () => setMood(0.35), 'ch5.s6.c14': () => setMood(0.3), 'ch5.s6.c20': () => { setMood(1); setCrowd(0.75); },
    'ch5.s6.c23': () => { setMood(0.1); setCrowd(0.6); }, 'ch5.s6.c25': () => { ring(); setCrowd(0.45); setMood(0.2); }, 'ch5.s7.c01': () => { setCrowd(0.18); setMood(0.15); }, 'ch5.epi.01': () => setCrowd(0),
  };
  const cue = (id) => { const f = CUES[id]; if (f) f(); return !!f; };
  function tick(time, dt, pw, live) {
    near.update(time, dt, { lively: mood }); mass.update(time, dt, { lively: mood });
    pages.update(time); clouds.update(time);
    // the bell: a slow idle sway, and a decaying swing when it is rung
    swingT += dt; swing = Math.max(0, swing - dt * 0.28);
    bellNode.setRot(0, 0, Math.sin(time * 0.7) * 1.5 + Math.sin(swingT * 5.4) * 26 * swing * swing);
    if (cones) cones.visible = pw > 0.05;
    for (let i = 0; i < 5; i++) {
      const a = time * (0.5 + i * 0.07) * (i % 2 ? 1 : -1) + i * 1.3, rad = 2.2 + i * 0.9;
      P[0] = -2 + i * 1.6 + Math.cos(a) * rad; P[1] = COL_H + 2.2 + i * 0.5 + Math.sin(time * 0.8 + i) * 0.5; P[2] = -6 - i * 1.5 + Math.sin(a) * rad * 0.6;
      quat.fromEuler(Q, 0, Math.sin(a) * 0.35, Math.cos(a) * 0.3 * (i % 2 ? 1 : -1));
      const flap = Math.sin(time * (9 + i * 0.6) + i * 2); S3[0] = 0.62; S3[1] = 0.62 * (0.5 + 1.3 * flap); S3[2] = 0.62; if (Math.abs(S3[1]) < 0.08) S3[1] = 0.08;
      m4.fromTRS(Mx, P, Q, S3); birds.instances.data.set(Mx, i * 20);
    }
    birds.instances.dirty = true;
    if (!live) return;
    if (swing > 0.5 && Math.sin(swingT * 5.4) > 0.96) sprites.sparkle(MOUTH, { count: 2, size: 0.3, spread: 0.7, life: 0.6, color: '#fff0b0' });
    if (time > nextGust) { nextGust = time + 2.8 + rnd() * 1.6; P[0] = -4 + rnd() * 3; P[1] = 1.8 + rnd() * 2.4; P[2] = -7 + rnd() * 4; V[0] = 2.0; V[1] = 0.1; V[2] = 0.2; sprites.gust(P, { vel: V, size: 0.9 + rnd() * 0.5, life: 2.2, alpha: 0.8, color: light === 'night' ? '#c6d6ff' : '#fff6e6' }); }
    if (!low && time > nextMote) { nextMote = time + 0.3; P[0] = -3 + rnd() * 6; P[1] = 0.3 + rnd() * 2.8; P[2] = -1.2 + rnd() * 3; V[0] = 0.14; V[1] = 0.1 + rnd() * 0.1; V[2] = 0.05; sprites.spawn({ kind: 'glow', pos: P, vel: V, size: 0.07 + rnd() * 0.06, life: 4.5, color: L.mote, alpha: light === 'morning' ? 0.55 : 0.9 }); }
  }

  // ---- what the live stage asks for (kit-ch5 taskUnit)
  //   'the-run'        ch5.s6: the city in the square and the street: a run at 0, the front rows standing still by 1;
  //                    the bell swings each time the objective moves
  //   'record-lamps'   ch5.s7: dusk on the porch: its four lanterns come on one at a time, a quarter of the objective each
  // setback(): the crowd surges (s6); the lanterns gutter (s7)
  let runUnit = null, lampUnit = null, surge = 0, rung = -1;
  function task(type) {
    if (type === 'the-run') return runUnit || (runUnit = taskUnit([0.3, 1.05, RAIL_Z + 0.1], null, (v, time, dt) => {
      surge = Math.max(0, surge - (dt || 0) / 2.2); setCrowd(1); setMood(Math.min(1, 1 - 0.5 * v + 0.45 * surge));
      const step = Math.floor(v * 3 + 0.04); if (step > rung) { if (rung >= 0) ring(); rung = step; } else if (step < rung) rung = step;
    }));
    if (type === 'record-lamps') return lampUnit || (lampUnit = taskUnit([lanPos[1][0], lanPos[1][1], lanPos[1][2]], null, (v, time, dt) => {
      surge = Math.max(0, surge - (dt || 0) / 1.6); setCrowd(0.18); setMood(0.15);
      for (let i = 0; i < 4; i++) { const k = Math.max(0.04, Math.min(1, v * 4 - [1, 0, 2, 3].indexOf(i))) * (1 - 0.7 * surge * Math.abs(Math.sin(time * 23 + i))); lamps[i].gain = k; glows[i].gain = k; }
      if (cones) cones.visible = v > 0.3;
      const at = lanPos[[1, 0, 2, 3][Math.min(3, Math.floor(v * 4))]]; lampUnit.pos[0] = at[0]; lampUnit.pos[1] = at[1]; lampUnit.pos[2] = at[2];
    }));
    return null;
  }
  const setback = () => { surge = 1; };
  // a cutscene has the porch as the light state built it
  const litAll = () => { for (let i = 0; i < 4; i++) { lamps[i].gain = 1; glows[i].gain = 1; } };

  return shell({
    id: 'exchange-steps', light, L, scene, cameras: CAMERAS, actors, foreground, lamps, glows, tick, dim: 0.22,
    marks: { ...MARKS, extras: light === 'morning' ? [{ pos: [0.95, 0, 0.8], face: -58 }, { pos: [1.75, 0, 0.32], face: -52 }] : null, rail: { pos: [0.95, 0, RAIL_Z + 0.42], face: 168 }, bell: MOUTH, focus: MOUTH },
    extra: { setCrowd, setMood, ring, cue: (id) => { const hit = cue(id); if (hit) litAll(); return hit; }, task, setback, passLamp: setback, crowdCount: near.people.length + mass.people.length },
  });
}

/** Lit-window centres of a house placed at pos with a yaw, in set space. */
function anchorsOf(mesh, pos, yaw) {
  const c = Math.cos(yaw * DEG), s = Math.sin(yaw * DEG);
  return (mesh.anchors.windows || []).map((q) => [pos[0] + q[0] * c + q[2] * s, pos[1] + q[1], pos[2] - q[0] * s + q[2] * c]);
}

export const exchangeSteps = { id: 'exchange-steps', lights: lightNames(LIGHTS, ALIAS), cameras: Object.keys(CAMERAS), build };
export default exchangeSteps;
