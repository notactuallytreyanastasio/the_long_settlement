// SET: hidden-lamp. The sea-cave under Little Brand where the keeper hides a lamp: a flame the size of a child's fist,
// cold and blue, fed on quay scrapings, in a brass burner on a ledge with a shutter of old ship's copper behind it.
// Through the cave mouth: black water, and the other dark islands answering.
// Chapter 4: s3 (Ren follows Wyn down; she works the shutter and three islands answer), s5 (the eighth hearing sits
// here all night and the eleventh signal comes at first light), s7 (Carrow's answer). Chapter 8 commons epilogue.
//
//   import { hiddenLamp } from './sets/hidden-lamp.js';
//   const set = hiddenLamp.build(GL, { light: 'night', low: false });     // 'night' (default) | 'dawn' | 'day'
//
// The shape is lantern-stalls' (see ../index.js): figures face +Z, cameras look toward -Z, out of the cave mouth.
// The stage strip x -3.2..3.2, z 0..1.6 is clear sand. Added here:
//   setShutter(0..1)      0 shut (the flame burns for the cave only), 1 swung clear: the beam goes out to sea
//   setSignal(on)         the keeper is working the shutter: long and short, like a slow pulse
//   setAnswers(n)         how many of the eleven dark islands are showing a lamp (they come up one at a time)
//   cue(lineId)           the script's business: ch4.s3.c02/c05/c08/c09/c12/c14, ch4.s5.c19/c26/c27, ch4.s7.c01/c15, ch8.epi.03
//   marks.focus           the flame;  marks.keeper: at the shutter;  marks.mouth: where someone stops at the cave mouth;
//   marks.desk            at the sea-chest where the charts are written on
//   setPower(p)           the flame, its glow and its light on the rock (the candle is the cave's own)
// low: true drops the far island humps, half the stalactites and the outer rocks.

import * as GL0 from '../index.js';
import {
  m4, quat, rng, DEG, rgb, merge, tint, place, plane, box, cylinder, sphere, tube, curve, setGlow, setOutline, extrude, roundedBox, blob, deform, gradientY,
  node, group, makeEnv, createScene, mergeStatic, createSprites, rayMesh, rayMaterial,
} from '../index.js';
import { PAL, kitMaterials, anchorAt, pickLight, flame, barrel, sack, crate, ropeCoil, cloudBank } from './kit.js';
import { C4, crag, stalactite, copperLamp, chartDesk, kelp, blanketRoll, c4Shell, cams, MARKS4, norm3, dirFrom } from './kit-ch4.js';

const WATER = -0.28, LIP = -4.9;

const LIGHTS = {
  night: {
    preset: 'night', power: 1, candle: 1, shaft: 0, flame: 1,
    env: {
      key: { dir: norm3([-0.45, 0.62, 0.64]), color: '#959ef0' },
      shadow: { tint: '#3a2fa8', lift: 0.16, saturate: 1.45 },
      ambient: { sky: '#5f7ff0', ground: '#6a3fb0', amount: 0.22 },
      rim: { color: '#9fe8ff', amount: 0.9, edge: 0.72 },
      fog: { color: '#1c2f9a', density: 0.004, start: 14, max: 0.8 },
      sky: { zenith: '#0a1668', mid: '#1a3aa8', midAt: 0.4, horizon: '#4f86ea', below: '#2a50c0', sunDir: dirFrom(8.5, 6.5), moon: 0.7, stars: 1, sun: { size: 2.0 } },
      water: { deep: '#10257c', mid: '#1c44b0', shallow: '#3a8ae0', foam: '#cfe6ff', glint: '#bfe6ff', glintDensity: 0.2 },
    },
    cloud: { color: '#6f8ae6', shadowTint: '#2a3a9a' }, smoke: '#9fd0ff', rock: ['#5a36b4', '#b07cf0'], sand: '#ffd9cf',
  },
  dawn: {
    preset: 'sunset', power: 0.8, candle: 0.7, shaft: 0.36, flame: 0.85,
    env: {
      key: { dir: norm3([-0.4, 0.6, 0.7]), color: '#ffd9c8' },
      shadow: { tint: '#6a5fd8', lift: 0.14, saturate: 1.35 },
      ambient: { sky: '#ffb8c8', ground: '#6a5cc8', amount: 0.2 },
      rim: { color: '#ffe0a0', amount: 1.1, edge: 0.7 },
      fog: { color: '#f0a8c0', density: 0.003, start: 16, max: 0.8 },
      sky: { zenith: '#4a5ad0', mid: '#e89ad0', midAt: 0.34, horizon: '#ffe08a', below: '#ffb890', glow: '#fff0a8', glowAmount: 0.8, sunDir: dirFrom(7.5, 3.2), sun: { color: '#fffbe6', size: 3.0, halo: '#ffc060', haloAmount: 0.7 } },
      water: { deep: '#4a5ad0', mid: '#8a8ae8', shallow: '#ffc8b8', foam: '#fff6ee', glint: '#fff0b0', glintDensity: 0.34 },
    },
    cloud: { color: '#ffc8d0', shadowTint: '#a878d8' }, smoke: '#ffe0e8', rock: ['#7a4cc0', '#d09af0'], sand: '#ffe0d0',
  },
  day: {
    preset: 'day', power: 0.6, candle: 0, shaft: 0.3, flame: 0.7,
    env: {
      key: { dir: norm3([-0.4, 0.66, 0.64]), color: '#fff2dc' },
      shadow: { tint: '#6f6ae0', lift: 0.12, saturate: 1.35 },
      ambient: { sky: '#bfe4ff', ground: '#8a7ae0', amount: 0.2 },
      fog: { density: 0.0028, start: 18 },
      sky: { sunDir: dirFrom(30, 40) },
      water: { deep: '#1d7ed8', mid: '#2bb8e0', shallow: '#7fe8dc' },
    },
    cloud: { color: '#ffffff', shadowTint: '#b4c6f8' }, smoke: '#ffffff', rock: ['#8a66d8', '#d8b8f8'], sand: '#ffe9c8',
  },
};

const CAMERAS = cams({
  wide: { target: [0.1, 1.6, -0.4], dist: 8.2, yaw: 3, pitch: 4 },
  low: { target: [0.1, 1.85, 0.2], dist: 6.4, yaw: -7, pitch: -12, fov: 56 },
});

function build(engine = GL0, { light, low = false } = {}) {
  const picked = pickLight('hidden-lamp', LIGHTS, light), L = picked.L; light = picked.name;
  const M = kitMaterials(), r = rng(4104), rk = { low: L.rock[0], high: L.rock[1] };
  const PED = [-1.42, 0, -2.75], PED_H = 1.22;

  // ---- the cave: sand, walls, the arch of the mouth, the roof. None of it casts a shadow (the lamp does the modelling).
  const shell = group('shell'), near = group('near');
  shell.add(node('sand', gradientY(deform(plane(30, 16, 10, 6), (p) => { p[2] += 2.6; p[1] = p[2] < LIP + 0.6 ? -0.5 : Math.max(0, Math.abs(p[0]) - 6) * 0.3; }), L.sand, L.sand), M.ground));
  const wallAt = (x, z, w, h, d, seed, o = {}) => shell.add(node('rock', crag({ w, h, d, seed, seg: 11, rings: 8, lumps: 1.5, ...rk, ...o }), M.prop, { pos: [x, o.y || 0, z], rot: [0, o.yaw || 0, 0] }));
  // left wall, front to back, then the left jamb of the mouth
  wallAt(-6.6, 3.2, 5, 5.4, 4.4, 2); wallAt(-5.3, 0.4, 4.4, 6.6, 4, 5, { lean: 0.08 }); wallAt(-4.6, -2.6, 4.2, 7.6, 4, 9, { lean: 0.1 }); wallAt(-3.9, -5.6, 5.6, 8.6, 4.2, 12, { lean: 0.16 });
  wallAt(-8.5, -4.4, 6, 9, 6, 15); wallAt(-9.5, 0.5, 5, 8, 7, 18);
  // right wall and jamb
  wallAt(6.9, 3.0, 5, 5.2, 4.4, 3); wallAt(5.9, 0.2, 4.2, 6.4, 4, 7, { lean: -0.08 }); wallAt(5.6, -2.9, 4, 7.4, 4, 11, { lean: -0.12 }); wallAt(5.4, -6.0, 5, 8.8, 4.4, 14, { lean: -0.2 });
  wallAt(9.4, -4.2, 6, 9, 6, 17); wallAt(10, 0.8, 5, 8, 7, 20);
  // broken rock stacked against both jambs, so the mouth has an edge with steps in it
  for (const [x, z, w, h, seed, ln] of [[-2.5, -4.6, 2.0, 4.6, 51, 0.1], [-3.1, -3.3, 1.9, 3.1, 53, 0.05], [-2.0, -5.3, 1.5, 2.2, 55, 0.12], [-3.6, -1.6, 1.7, 2.4, 57, 0], [-2.7, -5.0, 1.6, 6.3, 59, 0.2],
    [3.9, -4.9, 2.0, 4.2, 52, -0.1], [4.4, -3.5, 1.8, 2.9, 54, -0.05], [3.4, -5.6, 1.5, 2.0, 56, -0.14], [4.7, -1.5, 1.7, 2.2, 58, 0], [4.0, -5.3, 1.6, 6.0, 60, -0.22]])
    wallAt(x, z, w, h, w * 0.9, seed, { lean: ln, seg: 7, rings: 5, lumps: 1.1, high: seed % 4 < 2 ? C4.rockHigh : rk.high });
  // the lintel over the mouth and the roof behind it
  wallAt(0.9, -6.0, 9.5, 2.6, 4.4, 23, { y: 5.9, low: rk.high, high: rk.low }); wallAt(-1.6, -3.6, 9, 2.4, 6, 26, { y: 6.5, low: rk.high, high: rk.low }); wallAt(2.4, -1.2, 10, 2.4, 6, 29, { y: 6.9, low: rk.high, high: rk.low });
  wallAt(-0.5, 2.6, 16, 2.6, 7, 31, { y: 7.2, low: rk.high, high: rk.low });
  // a dark plate behind everything, so no sky shows through a gap that is not the mouth
  const dark = rk.low;
  shell.add(node('back', merge(tint(place(box(16, 14, 1), -9.4, 6, -8.2), dark), tint(place(box(16, 14, 1), 12.2, 6, -8.2), dark), tint(place(box(12, 8, 1), 1.4, 11.2, -8.2), dark), tint(place(box(40, 1, 22), 0, 9.6, 1), dark)), M.flat));
  // the lip where the sand stops and the sea comes in, and reef beyond it
  for (const [x, z, w, h, seed] of [[-2.3, LIP + 0.1, 2.2, 0.55, 3], [0.2, LIP - 0.2, 1.6, 0.3, 6], [2.6, LIP, 2.4, 0.6, 8], [1.2, LIP - 2.6, 1.5, 0.7, 11], [-0.9, LIP - 5.5, 1.2, 0.5, 13]]) shell.add(node('lip', crag({ w, h, d: w * 0.7, seed, low: C4.wet, high: rk.high, cap: C4.kelp, capAt: 0.6 }), M.prop, { pos: [x, WATER + 0.05, z] }));
  // stalactites along the arch and the roof
  const drips = low ? 9 : 22;
  for (let i = 0; i < drips; i++) { const arch = i % 2 === 0, x = arch ? -1.6 + r() * 5.4 : -4 + r() * 9.5, z = arch ? -5.2 + r() * 0.9 : -4.4 + r() * 4.4, h = arch ? 0.9 + r() * 1.6 : 0.6 + r() * 1.2; shell.add(node('drip', stalactite({ h, r: 0.22 + r() * 0.2, seed: i + 1, low: rk.low, high: rk.high }), M.prop, { pos: [x, 6.3 + Math.abs(z + 3) * 0.12 - (x > -1 && x < 3 && z < -4.6 ? 0.2 : 0), z] })); }
  // strata: pale shelves let into the walls, catching the lamp
  for (const [x, y, z, w, yaw, tilt] of [[-3.2, 2.5, -2.9, 2.6, 24, 5], [-2.9, 3.9, -4.3, 2.8, 30, -4], [-3.7, 1.2, -0.6, 2.2, 40, 3], [-2.6, 5.2, -4.9, 2.2, 26, 6], [4.2, 2.2, -3.2, 2.4, -32, -5], [3.9, 3.8, -4.9, 2.6, -28, 4], [4.6, 1.1, -0.4, 2.0, -44, 2], [3.6, 5.3, -5.4, 2.2, -24, -5]])
    shell.add(node('shelf', gradientY(deform(roundedBox(w, 0.3, 1.1, 0.1, 1), (p) => { p[1] += Math.sin(p[0] * 2.1 + x) * 0.07; }, 20), rk.high, C4.rockHigh), M.prop, { pos: [x, y, z], rot: [0, yaw, tilt] }));
  // tide pools left in the sand: they hold the sky's blue and a little of the lamp
  const pool = (rx, rz, seed) => { const o = []; for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283, k = 1 + 0.22 * Math.sin(a * 3 + seed) + 0.1 * Math.sin(a * 5 + seed * 2); o.push([Math.cos(a) * rx * k, Math.sin(a) * rz * k]); } return o; };
  for (const [x, z, rx, rz, seed] of [[-1.9, 2.1, 0.8, 0.45, 1], [0.9, -3.3, 0.9, 0.5, 4], [3.3, 1.3, 0.6, 0.4, 7], [-0.2, 2.9, 0.5, 0.3, 9]]) {
    shell.add(node('pool-rim', tint(place(extrude(pool(rx * 1.16, rz * 1.2, seed), 0.02), x, 0.006, z, 90, 0, 0), light === 'night' ? '#c79ae0' : '#e0a8b8'), M.flat));
    shell.add(node('pool', setGlow(tint(place(extrude(pool(rx, rz, seed), 0.02), x, 0.014, z, 90, 0, 0), light === 'night' ? '#49d8f0' : '#8ff0e8'), 0.55), M.flat));
  }
  shell.traverse((n) => { n.castShadow = false; });

  // ---- the ledge and the lamp
  near.add(node('ledge', crag({ w: 1.7, h: PED_H, d: 1.3, seed: 41, low: rk.low, high: C4.rockHigh, lumps: 0.6 }), M.prop, { pos: PED }));
  near.add(node('ledge2', crag({ w: 1.1, h: 0.62, d: 0.9, seed: 44, ...rk }), M.prop, { pos: [PED[0] + 0.95, 0, PED[2] + 0.35] }), node('step', crag({ w: 0.9, h: 0.34, d: 0.7, seed: 47, ...rk }), M.prop, { pos: [PED[0] - 0.2, 0, PED[2] + 0.85] }));
  const lampParts = copperLamp({ s: 1.2 }), STAND = [PED[0], PED_H - 0.06, PED[2]];
  near.add(node('burner', lampParts.stand, M.prop, { pos: STAND }));
  const FLAME = anchorAt(lampParts.stand, 'flame', STAND), hingeL = anchorAt(lampParts.stand, 'hinge', STAND), HINGE = [2 * STAND[0] - hingeL[0], hingeL[1] - 0.12, STAND[2] - 0.08];
  // what the keeper keeps by it: a sack of scrapings (it glows a little), the log, a bucket of kelp-ash
  near.add(node('scrapings', merge(sack({ seed: 3, s: 0.26, color: '#d9e6f4' }), setGlow(tint(place(blob({ rx: 0.13, ry: 0.06, rz: 0.11, lumps: 0.8, seed: 5, seg: 7, rings: 4 }), 0, 0.5, 0), C4.cold), 0.8)), M.prop, { pos: [PED[0] + 0.95, 0.56, PED[2] + 0.35], rot: [0, 30, 0] }));
  near.add(node('log', merge(tint(place(roundedBox(0.34, 0.07, 0.26, 0.02, 1), 0, 0.035, 0), '#c23a5e'), tint(place(box(0.3, 0.02, 0.22), 0, 0.075, 0), '#fff4d2')), M.prop, { pos: [PED[0] + 0.52, PED_H - 0.02, PED[2] + 0.3], rot: [0, -24, 4] }));
  // the working side of the cave: a sea-chest for a desk, charts, a cask of ash, kelp drying on a line
  const desk = chartDesk({ lit: L.candle > 0 }), DESK = [1.4, 0, -1.8], DESK_YAW = -12;
  near.add(node('desk', desk, M.prop, { pos: DESK, rot: [0, DESK_YAW, 0] }));
  const CANDLE = anchorAt(desk, 'flame', DESK, DESK_YAW);
  near.add(node('cask', barrel({ r: 0.3, h: 0.7, color: '#c8643e' }), M.prop, { pos: [2.75, 0, -2.45] }), node('ash', tint(place(cylinder(0.24, 0.24, 0.03, 10), 0, 0.68, 0), '#e6ecff'), M.prop, { pos: [2.75, 0, -2.45] }), node('coil', ropeCoil({ r: 0.26 }), M.prop, { pos: [3.3, 0, -0.75] }));
  near.add(node('rolls', merge(blanketRoll({ color: PAL.coral }), place(blanketRoll({ color: PAL.teal, stripe: PAL.yellow, len: 0.5 }), 0.1, 0.24, 0.04, 0, 20, 0)), M.prop, { pos: [-3.3, 0, -0.9], rot: [0, 50, 0] }), node('crate', crate({ s: 0.5, seed: 4, color: PAL.wood2 }), M.prop, { pos: [-3.6, 0, -1.9], rot: [0, 14, 0] }));
  { // kelp on a line, right of the mouth
    const a = [1.75, 2.7, -3.9], b = [4.6, 3.3, -2.0], parts = [tint(tube(curve([a, [(a[0] + b[0]) / 2, 2.6, (a[2] + b[2]) / 2], b], 8), 0.014, 4, { crease: 180 }), PAL.rope), tint(place(cylinder(0.05, 0.04, 2.75, 5), a[0], 0, a[2], 0, 0, 2), '#8a5a4a')];
    for (let i = 0; i < 7; i++) { const t = 0.08 + 0.84 * (i / 6), x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t, y = a[1] + (b[1] - a[1]) * t - 0.42 * 4 * t * (1 - t) * 0.6, len = 0.5 + r() * 0.6; parts.push(tint(place(extrude([[-0.08, 0], [0.08, 0], [0.11, -len * 0.6], [0.02, -len], [-0.07, -len * 0.7]], 0.02, { crease: 30 }), x, y, z, 0, 30 + r() * 30, (r() - 0.5) * 10), i % 2 ? C4.kelp : C4.kelp2)); }
    near.add(node('kelp-line', setOutline(merge(parts), 0.7), M.prop));
  }
  near.add(node('weed1', kelp({ s: 0.8, seed: 2 }), M.flat, { pos: [1.1, 0.01, -3.6] }), node('weed2', kelp({ s: 0.6, seed: 5 }), M.flat, { pos: [-3.0, 0.01, 0.5] }));
  { const fl = [], cols = [PAL.teal, PAL.coral, PAL.yellow, PAL.mint, PAL.pink]; for (let i = 0; i < 7; i++) fl.push(setGlow(tint(place(sphere(0.15 + r() * 0.07, 9, 6), (r() - 0.5) * 0.9, 0.16 + (i > 4 ? 0.26 : 0), (r() - 0.5) * 0.6), cols[i % 5]), 0.25));
    near.add(node('floats', merge(fl), M.prop, { pos: [-2.75, 0, -0.55] }), node('floats2', merge(setGlow(tint(place(sphere(0.17, 9, 6), 0, 0.17, 0), PAL.teal), 0.25), setGlow(tint(place(sphere(0.13, 9, 6), 0.3, 0.13, 0.1), PAL.yellow), 0.25)), M.prop, { pos: [0.75, 0, -2.6] })); }
  for (const [x, z, c, s] of [[-0.6, -1.2, PAL.coral, 0.13], [0.5, 2.3, PAL.pink, 0.11], [2.4, 0.2, PAL.yellow, 0.1], [-2.2, 0.9, PAL.orange, 0.12]]) near.add(node('star', tint(place(extrude([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => { const a = i * 0.6283, q = i % 2 ? 0.45 : 1; return [Math.cos(a) * q * s, Math.sin(a) * q * s]; }), 0.04, { bevel: 0.012 }), x, 0.025, z, 90, x * 40, 0), c), M.prop));
  for (const [x, z, h, seed] of [[-3.4, -3.4, 1.0, 3], [4.3, -4.2, 1.3, 6], [3.9, 1.9, 0.7, 9], [-4.1, 2.2, 0.9, 12]]) near.add(node('mite', place(stalactite({ h, r: 0.3, seed, low: rk.high, high: rk.low }), 0, 0, 0, 180, 0, 0), M.prop, { pos: [x, 0, z] }));

  // ---- out to sea: the other dark islands, low humps on the horizon
  const far = group('far'), ISLES = [];
  const isleAt = [[9, -260], [31, -300], [-9, -330], [48, -250], [-34, -280], [20, -380], [72, -300], [-62, -320], [-20, -420], [96, -360], [2, -460]];
  isleAt.forEach(([x, z], i) => { const w = 26 + r() * 22, h = 3.5 + r() * 5; if (!low) far.add(node('isle', crag({ w, h, d: 12, seed: i + 60, low: light === 'night' ? '#1c2a8a' : '#7a7ae0', high: light === 'night' ? '#2c44b0' : '#a8b8f4', seg: 9, rings: 5 }), M.farFlat, { pos: [x, WATER, z] })); ISLES.push({ pos: [x - w * 0.12, WATER + h * 0.8 + 1.2, z + 7], h }); });

  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  env.sky.sunDir = norm3(env.sky.sunDir); env.water.level = WATER;
  env.water.shores = [[0, LIP + 60, 60, 0.55], [1.2, LIP - 2.6, 1.0, 0.5], [-0.9, LIP - 5.5, 0.8, 0.5]];
  scene.root.add(mergeStatic(shell, 'shell'), mergeStatic(near, 'near'));
  if (!low) scene.root.add(mergeStatic(far, 'far'));

  const fg = group('fg');
  fg.add(node('fg1', crag({ w: 2.2, h: 1.0, d: 1.2, seed: 71, ...rk }), M.prop, { pos: [-2.5, 0, 3.2] }), node('fg2', crag({ w: 1.8, h: 0.8, d: 1.1, seed: 73, ...rk }), M.prop, { pos: [2.6, 0, 3.3] }), node('fg3', kelp({ s: 0.7, seed: 8 }), M.flat, { pos: [1.5, 0.01, 2.6] }));
  const foreground = mergeStatic(fg, 'foreground'); scene.root.add(foreground);

  // ---- the moving parts: shutter, flame, candle flame
  const shutter = node('shutter', setGlow(lampParts.shutter, 0.35), M.prop, { pos: HINGE }); shutter.castShadow = false; scene.root.add(shutter);
  const fl = node('flame', flame({ r: 0.085, h: 0.24, root: '#f4ffff', tip: C4.coldDeep }), M.lantern, { pos: FLAME }); fl.castShadow = false; scene.root.add(fl);
  const cf = node('candle-flame', flame({ r: 0.03, h: 0.1 }), M.lantern, { pos: CANDLE }); cf.castShadow = false; cf.visible = L.candle > 0; scene.root.add(cf);

  const sprites = scene.sprites = createSprites(320);
  const flameGlow = sprites.add({ kind: 'glow', pos: [FLAME[0], FLAME[1] + 0.1, FLAME[2]], size: 2.2, color: '#6fd8ff', alpha: 0 });
  const flameCore = sprites.add({ kind: 'glow', pos: [FLAME[0], FLAME[1] + 0.1, FLAME[2] + 0.05], size: 0.7, color: '#e8fbff', alpha: 0 });
  const candleGlow = sprites.add({ kind: 'glow', pos: CANDLE, size: 1.5, color: '#ffb450', alpha: 0 });
  for (const s of ISLES) { s.glow = sprites.add({ kind: 'glow', pos: s.pos, size: 14, color: '#8fe0ff', alpha: 0 }); s.streak = sprites.add({ kind: 'glow', pos: [s.pos[0], WATER + 0.2, s.pos[2] + 26], size: [3.4, 1.1], color: '#6fc8ff', alpha: 0 }); s.on = 0; s.ph = r() * 6.283; s.rate = 0.5 + r() * 0.5; }

  // ---- the beam out through the mouth, and (dawn, day) the sun coming in the other way
  const AIM = norm3([1.6 - FLAME[0], 2.0 - FLAME[1], -9 - FLAME[2]]);
  const along = (mesh, d) => { // lay a rayMesh (which hangs down -Y) along the direction d
    const X = norm3([-d[2], 0, d[0]]), Z = [X[1] * -d[2] - X[2] * -d[1], X[2] * -d[0] - X[0] * -d[2], X[0] * -d[1] - X[1] * -d[0]];
    return deform(mesh, (p) => { const x = p[0], y = p[1], z = p[2]; p[0] = X[0] * x - d[0] * y + Z[0] * z; p[1] = X[1] * x - d[1] * y + Z[1] * z; p[2] = X[2] * x - d[2] * y + Z[2] * z; });
  };
  const beam = node('beam', along(tint(rayMesh(46, 0.16, 5.5, 14), '#8fe4ff'), AIM), rayMaterial({ power: 1.4, near: 0.5, far: 0 }), { pos: FLAME });
  beam.visible = false; scene.root.add(beam);
  const spill = node('spill', tint(rayMesh(2.6, 0.2, 2.3, 14), '#7fd8ff'), rayMaterial({ power: 1.6, near: 0.3, far: 0 }), { pos: [FLAME[0], FLAME[1] + 0.1, FLAME[2]] }); scene.root.add(spill);
  if (L.shaft > 0) { // slants of first light through the mouth onto the sand
    const parts = []; for (const [x, w, len] of [[0.2, 1.3, 11], [1.9, 0.9, 12], [-0.6, 0.6, 10]]) parts.push(place(rayMesh(len, 0.5, w, 10), x + 0.9, 3.6, -8.6, -72, -6 - x * 3, 0));
    scene.root.add(node('sun-shafts', tint(merge(parts), light === 'dawn' ? '#ffd0a0' : '#fff2d0'), rayMaterial({ power: 1.2, near: L.shaft, far: L.shaft * 0.5 })));
  }
  const clouds = cloudBank({ style: low ? 'painted' : 'solid', count: 6, seed: 9, arc: [164, 200], radius: [300, 440], height: [26, 90], size: [0.6, 1.2], speed: 0.04, ...L.cloud });
  scene.root.add(clouds.node);
  const actors = group('actors'); scene.root.add(actors);

  const lamps = [
    { name: 'flame', pos: [FLAME[0], FLAME[1] + 0.15, FLAME[2] + 0.25], color: '#6fd8ff', radius: 12, base: 3.2, k: 1 },
    { name: 'candle', pos: [CANDLE[0], CANDLE[1] + 0.2, CANDLE[2]], color: '#ffb860', radius: 4.6, base: 1.5 * L.candle, own: true },
    { name: 'mouth', pos: [1.4, 1.6, LIP - 1.2], color: light === 'night' ? '#4f8cf0' : light === 'dawn' ? '#ffb0a0' : '#bfe8ff', radius: 8, base: 0.7, own: true, steady: true },
  ];

  let shut = 0.12, shutNow = 0.12, signal = false, answers = 0, lastT = -1, nextSmoke = 0, nextSpark = 0, nextRing = 0.6, nextDrip = 2;
  const P = [0, 0, 0], V = [0, 0, 0], rnd = rng(91);
  const setShutter = (v) => { shut = Math.max(0, Math.min(1, v)); }, setSignal = (on) => { signal = !!on; }, setAnswers = (n) => { answers = Math.max(0, Math.min(ISLES.length, n | 0)); };
  const CUES = {
    'ch4.s3.c02': () => { setShutter(0.1); setSignal(false); setAnswers(0); }, 'ch4.s3.c05': () => setShutter(0.14), 'ch4.s3.c08': () => setShutter(1), 'ch4.s3.c09': () => { setShutter(1); setSignal(true); },
    'ch4.s3.c12': () => setAnswers(3), 'ch4.s3.c14': () => setAnswers(8), 'ch4.s3.c23': () => setSignal(false),
    'ch4.s5.c19': () => { setShutter(1); setSignal(true); setAnswers(9); }, 'ch4.s5.c26': () => setAnswers(10), 'ch4.s5.c27': () => { setAnswers(11); setSignal(false); },
    'ch4.s7.c01': () => { setShutter(0.3); setSignal(false); setAnswers(2); }, 'ch4.s7.c15': () => { setShutter(1); setSignal(true); }, 'ch8.epi.03': () => { setShutter(1); setSignal(false); setAnswers(11); },
  };
  const cue = (id) => { const f = CUES[id]; if (f) f(); return !!f; };

  function update(time, dt, pw) {
    // the shutter eases; when the keeper is signalling it closes and opens in longs and shorts
    const beat = (time * 0.55) % 4, gate = signal ? (beat < 1.5 || (beat > 2 && beat < 2.5) || (beat > 3 && beat < 3.5) ? 1 : 0.06) : 1;
    shutNow += (shut * gate - shutNow) * Math.min(1, dt * 7 + (dt === 0 ? 1 : 0));
    shutter.setRot(0, 180 - shutNow * 118, 0);
    const flick = 0.9 + 0.1 * Math.sin(time * 9.1) * Math.sin(time * 5.3 + 1), f = L.flame * (0.55 + 0.45 * Math.min(1.3, pw)) * flick;
    fl.setScale(0.9 + 0.5 * Math.min(1.5, pw) * L.flame, (0.9 + 0.6 * Math.min(1.5, pw) * L.flame) * (0.92 + 0.16 * flick), 0.9 + 0.5 * Math.min(1.5, pw) * L.flame); fl.setRot(Math.sin(time * 3.1) * 5, time * 40, Math.sin(time * 2.3) * 6);
    flameGlow.alpha = 0.62 * f; flameGlow.size[0] = flameGlow.size[1] = 2.0 + 0.9 * pw; flameCore.alpha = 0.8 * f;
    lamps[0].k = (0.62 + 0.38 * shutNow) * L.flame * flick;
    beam.visible = shutNow > 0.2 && pw > 0.05; beam.material.beam.near = 0.5 * Math.min(1, (shutNow - 0.2) / 0.5) * Math.min(1.2, pw) * (light === 'day' ? 0.4 : 1);
    spill.material.beam.near = 0.26 * f;
    cf.setScale(1, 0.9 + 0.2 * Math.sin(time * 11), 1); candleGlow.alpha = 0.6 * L.candle;
    // the answers: each island keeps its own slow time
    for (let i = 0; i < ISLES.length; i++) {
      const s = ISLES[i], want = i < answers ? 1 : 0; s.on += (want - s.on) * Math.min(1, dt * (0.35 + i * 0.05) + (dt === 0 ? 1 : 0));
      const b = (time * s.rate * 0.5 + s.ph) % 3, lit = b < 1.2 || (b > 1.7 && b < 2.1) ? 1 : 0.12, a = s.on * lit * (light === 'day' ? 0.35 : 1);
      s.glow.alpha = 0.95 * a; s.streak.alpha = 0.5 * a;
    }
    clouds.update(time);
    if (lastT >= 0 && time - lastT < 0.5 && dt > 0) {
      if (time > nextSmoke) { // the cold smoke goes down, along the sand, and out to sea
        nextSmoke = time + 0.42; P[0] = FLAME[0] + 0.1; P[1] = FLAME[1] + 0.5; P[2] = FLAME[2]; V[0] = 0.5 + rnd() * 0.3; V[1] = -0.5; V[2] = -0.7 - rnd() * 0.4;
        sprites.spawn({ kind: 'puff', pos: P, vel: V, size: 0.22, endSize: 0.7, life: 3.4, color: L.smoke, alpha: 0.5, drag: 0.35 });
      }
      if (time > nextSpark) { nextSpark = time + 0.3; P[0] = FLAME[0]; P[1] = FLAME[1] + 0.2; P[2] = FLAME[2]; sprites.sparkle(P, { count: 1, size: 0.14, spread: 0.7, life: 1.0, color: '#d8f6ff' }); }
      if (time > nextRing) { nextRing = time + 1.5; P[0] = -2 + rnd() * 5.5; P[1] = WATER + 0.03; P[2] = LIP - 0.8 - rnd() * 5; sprites.splash(P, { size: 0.9 + rnd() * 0.5, life: 1.5, spray: 0, color: light === 'night' ? '#a8ccff' : '#fff6ee' }); }
      if (time > nextDrip) { nextDrip = time + 1.9 + rnd() * 2; P[0] = -3 + rnd() * 6; P[1] = 4.6; P[2] = -4 + rnd() * 3; V[0] = 0; V[1] = -2; V[2] = 0; sprites.spawn({ kind: 'dot', pos: P, vel: V, size: 0.07, life: 0.95, color: '#bfe8ff', gravity: 7 }); }
      sprites.update(dt);
    }
    lastT = time;
  }

  return c4Shell({
    id: 'hidden-lamp', light, low, scene, actors, foreground, cameras: CAMERAS, lamps, lampPower: L.power, update,
    marks: { ...MARKS4, focus: FLAME, keeper: { pos: [PED[0] + 0.95, 0, PED[2] + 1.25], face: -150 }, mouth: { pos: [2.3, 0, -3.3], face: -20 }, desk: { pos: [1.5, 0, -0.9], face: 170 } },
    extra: { setShutter, setSignal, setAnswers, cue },
  });
}

export const hiddenLamp = { id: 'hidden-lamp', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default hiddenLamp;
