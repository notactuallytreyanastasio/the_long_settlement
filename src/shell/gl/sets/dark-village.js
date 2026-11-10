// SET: dark-village. Little Brand, foreclosed nine years: stone houses with no lamp in any window, the island's light
// capped with sailcloth on the hill, and the net hall with its great doors open, where a herring net hangs with one
// knotted cord to a household (that is the whole Mint) and the one stove on the island is going.
// Chapter 4: s2 (Wyn shows Tobb the net; morning), s3.c01 (Ren follows the keeper out at night), s5 (sixty-one people
// and a stove ask the Tribune for an eighth hearing).
//
//   import { darkVillage } from './sets/dark-village.js';
//   const set = darkVillage.build(GL, { light: 'day', low: false });     // 'day' (default) | 'night' | 'hearing'
//
// The shape is lantern-stalls' (see ../index.js). The cast stands in the yard at the hall's threshold; the hall is
// straight behind them (its doorway x -1.8..1.8 at z = -2.5), the net on its back wall. Stage strip x -3.2..3.2, z 0..1.6.
// Added here:
//   setCrowd(0..1)        how much of the island has come to the hall (benches inside first, then the yard)
//   setMood(0..1)         how lively they are (0.2 a hearing listening, 1 the moment standing is ruled)
//   cue(lineId)           ch4.s2.c01, ch4.s3.c01, ch4.s5.c01 / c04 / c13 / c14
//   marks.focus           the stove;  marks.net: the middle of the accounts net;  marks.door: on the threshold
//   setPower(p)           the stove, the light it throws out of the doors, and the warmth of the hall's walls
// low: true drops the hill's houses, the cobbles' second half, yard clutter and paints the clouds.

import * as GL0 from '../index.js';
import {
  m4, rng, DEG, rgb, merge, tint, place, plane, box, cylinder, sphere, ellipsoid, tube, curve, setGlow, setOutline, extrude, roundedBox, deform, gradientY, lathe,
  node, group, makeEnv, createScene, mergeStatic, createSprites, rayMaterial, makeInstances,
} from '../index.js';
import { PAL, kitMaterials, anchorAt, pickLight, scatter, flame, barrel, sack, crate, ropeCoil, cloudBank, headland, lampPost, boat, cobble, planks, crowd, gull, bush, rock } from './kit.js';
import { C4, stoneHut, cappedLamp, netPanel, knotNet, netPole, stove, kelp, c4Shell, cams, MARKS4, norm3, dirFrom } from './kit-ch4.js';

const HALL_Z = -2.6, HALL_W = 7.8, HALL_D = 4.6, DOOR = 1.8, EAVE = 2.55, PEAK = 4.75, WATER = -3;

const LIGHTS = {
  day: {
    preset: 'day', power: 0.55, hall: 0.3, crowd: 0.12, mood: 0.25, moon: 0,
    env: {
      key: { dir: norm3([0.5, 0.7, 0.5]), color: '#fff3e0' },
      shadow: { tint: '#7f86e8', lift: 0.1, saturate: 1.35 },
      ambient: { sky: '#c8e4ff', ground: '#c8b8f0', amount: 0.16 },
      fog: { color: '#d8e8ff', density: 0.004, start: 16, max: 0.85 },
      sky: { zenith: '#3a78e0', mid: '#7fbcf4', midAt: 0.4, horizon: '#ffe6d8', below: '#c8dcf8', sunDir: dirFrom(140, 40) },
      water: { deep: '#2a66c8', mid: '#3f9ae0', shallow: '#8fe0e0' },
    },
    cloud: { color: '#ffffff', shadowTint: '#b8c4f8' }, smoke: '#ffffff', spill: 0.14,
  },
  night: {
    preset: 'night', power: 0.5, hall: 0.34, crowd: 0, mood: 0.2, moon: 0.75,
    env: {
      key: { dir: norm3([-0.5, 0.6, 0.62]), color: '#8fa4f4' },
      shadow: { tint: '#2a34a4', lift: 0.14, saturate: 1.3 },
      ambient: { sky: '#4a68dc', ground: '#3a3aa0', amount: 0.2 },
      rim: { color: '#bcd8ff', amount: 0.8, edge: 0.74 },
      fog: { color: '#2038a8', density: 0.005, start: 14, max: 0.86 },
      sky: { zenith: '#0a1668', mid: '#1a3aa8', midAt: 0.4, horizon: '#4a7ae6', below: '#2a50c0', sunDir: dirFrom(13, 23), moon: 0.72, stars: 1, sun: { size: 2.3 } },
      water: { deep: '#10257c', mid: '#1c44b0', shallow: '#3a8ae0', glintDensity: 0.16 },
    },
    cloud: { color: '#7f96ea', shadowTint: '#3046a8' }, smoke: '#b4c4f4', spill: 0.3,
  },
  hearing: {
    preset: 'night', power: 1.15, hall: 0.72, crowd: 1, mood: 0.25, moon: 0.75,
    env: {
      key: { dir: norm3([-0.5, 0.6, 0.62]), color: '#8fa4f4' },
      shadow: { tint: '#2a34a4', lift: 0.14, saturate: 1.3 },
      ambient: { sky: '#4a68dc', ground: '#4a3aa0', amount: 0.2 },
      rim: { color: '#ffd9a0', amount: 0.9, edge: 0.72 },
      fog: { color: '#2038a8', density: 0.005, start: 14, max: 0.86 },
      sky: { zenith: '#0a1668', mid: '#1a3aa8', midAt: 0.4, horizon: '#4a7ae6', below: '#2a50c0', sunDir: dirFrom(13, 23), moon: 0.72, stars: 1, sun: { size: 2.3 } },
      water: { deep: '#10257c', mid: '#1c44b0', shallow: '#3a8ae0', glintDensity: 0.16 },
    },
    cloud: { color: '#7f96ea', shadowTint: '#3046a8' }, smoke: '#ffd8c0', spill: 0.55,
  },
};

const CAMERAS = cams({ low: { target: [0.1, 1.7, 0.2], dist: 6.4, yaw: -7, pitch: -10, fov: 56 } });

function build(engine = GL0, { light, low = false } = {}) {
  const picked = pickLight('dark-village', LIGHTS, light), L = picked.L; light = picked.name;
  const M = kitMaterials(), r = rng(4204), night = light !== 'day', FAR = low ? M.farFlat : M.far;
  const hw = HALL_W / 2, zb = HALL_Z - HALL_D;

  const town = group('town'), yard = group('yard'), inside = group('inside'), ground = group('ground');
  ground.add(node('yard', tint(place(plane(70, 30, 1, 1), 0, 0, -6), '#d6d2f6'), M.ground));
  ground.traverse((n) => { n.castShadow = false; });

  // ---- the net hall: two stone piers, a timber lintel, a boarded gable, a slate roof with turf in it
  const stones = (x0, x1, y1, z, seed) => { const q = rng(seed), out = []; for (let i = 0; i < 16; i++) { const w = 0.34 + q() * 0.3, h = 0.2 + q() * 0.16; out.push(tint(place(roundedBox(w, h, 0.09, 0.04, 1), x0 + w / 2 + q() * (x1 - x0 - w), 0.2 + q() * (y1 - 0.5), z, 0, 0, (q() - 0.5) * 6), [C4.stone, '#e2dcfa', C4.stoneDark, '#b4a8e8'][i % 4])); } return merge(out); };
  for (const sx of [-1, 1]) {
    const x0 = sx < 0 ? -hw : DOOR, x1 = sx < 0 ? -DOOR : hw;
    town.add(node('pier', tint(place(roundedBox(x1 - x0, EAVE + 0.1, 0.5, 0.08, 1), (x0 + x1) / 2, EAVE / 2, HALL_Z - 0.2), C4.stone2), M.prop), node('pier-stones', stones(x0, x1, EAVE, HALL_Z + 0.07, 5 + sx), M.prop));
    town.add(node('side', tint(place(box(0.45, EAVE, HALL_D), sx * (hw - 0.22), EAVE / 2, HALL_Z - HALL_D / 2), C4.stone2), M.prop));
    town.add(node('jamb', tint(place(roundedBox(0.3, EAVE, 0.62, 0.05, 1), sx * (DOOR + 0.02), EAVE / 2, HALL_Z - 0.18), '#8a5a4a'), M.prop));
  }
  town.add(node('back', tint(place(box(HALL_W, EAVE + 2.4, 0.4), 0, (EAVE + 2.4) / 2, zb), C4.stone2), M.prop));
  town.add(node('lintel', tint(place(roundedBox(DOOR * 2 + 1.0, 0.36, 0.7, 0.06, 1), 0, EAVE + 0.1, HALL_Z - 0.15, 0, 0, -1.2), '#9a5a44'), M.prop));
  { const gable = [], n = 13, bw = (HALL_W - 0.2) / n; // boards in two reds, cut to the pitch
    for (let i = 0; i < n; i++) { const x = -hw + 0.1 + bw * (i + 0.5), top = PEAK - 0.12 - Math.abs(x) * ((PEAK - EAVE) / (hw + 0.4)); gable.push(tint(place(box(bw - 0.03, top - EAVE - 0.2, 0.12), x, (top + EAVE + 0.2) / 2, HALL_Z - 0.16), i % 2 ? '#e8627a' : '#d9506e')); }
    town.add(node('gable', merge(gable), M.prop));
    // a round vent in the gable, glowing when the stove is up, and a painted wooden herring over the door
    town.add(node('vent', merge(tint(place(cylinder(0.42, 0.42, 0.1, 12), 0, EAVE + 1.25, HALL_Z - 0.06, 90, 0, 0), '#8a5a4a'), setGlow(tint(place(cylinder(0.31, 0.31, 0.12, 12), 0, EAVE + 1.25, HALL_Z - 0.05, 90, 0, 0), night ? '#ffb85a' : '#ffe6b0'), L.hall), tint(place(box(0.06, 0.62, 0.05), 0, EAVE + 1.25, HALL_Z + 0.02), '#8a5a4a'), tint(place(box(0.62, 0.06, 0.05), 0, EAVE + 1.25, HALL_Z + 0.02), '#8a5a4a')), M.prop));
    const fish = merge(tint(extrude([[-0.55, 0], [-0.25, 0.17], [0.2, 0.15], [0.45, 0], [0.7, 0.16], [0.7, -0.16], [0.45, 0], [0.2, -0.15], [-0.25, -0.17]], 0.07, { bevel: 0.02 }), PAL.teal), tint(place(sphere(0.035, 6, 4), -0.33, 0.04, 0.045), PAL.cream));
    town.add(node('herring', fish, M.prop, { pos: [0, EAVE + 0.52, HALL_Z + 0.24], rot: [0, 0, 4] }));
  }
  { const e = hw + 0.5, th = 0.24, sl = [[-e, EAVE - 0.05], [-e * 0.5, EAVE + (PEAK - EAVE) * 0.46], [0.15, PEAK + 0.12], [e * 0.5, EAVE + (PEAK - EAVE) * 0.5], [e, EAVE - 0.05]];
    const roof = extrude([...sl, ...sl.slice().reverse().map(([x, y]) => [x * 0.985, y - th])], HALL_D + 0.9, { bevel: 0.05, crease: 40 });
    town.add(node('roof', tint(place(roof, 0, 0, HALL_Z - HALL_D / 2 + 0.1), C4.slate), M.prop));
    const turf = []; for (const [x, z, s] of [[-2.6, -3.0, 0.9], [2.2, -3.1, 0.7], [-1.0, -3.1, 0.5], [3.3, -3.0, 0.5]]) turf.push(tint(place(ellipsoid(s, 0.16, 0.5, 8, 4), x, PEAK + 0.02 - Math.abs(x - 0.15) * ((PEAK - EAVE) / e) * 1.0, z + 0.55, 0, 0, x < 0.15 ? 28 : -28), C4.turf));
    town.add(node('turf', merge(turf), M.prop));
  }
  // the great doors, swung right back
  const leaf = (seed) => { const q = rng(seed), p = []; for (let i = 0; i < 5; i++) p.push(tint(place(roundedBox(0.34, EAVE - 0.12 + (q() - 0.5) * 0.06, 0.08, 0.02, 1), 0.18 + i * 0.35, (EAVE - 0.1) / 2 + 0.04, 0), i % 2 ? PAL.teal : '#2fb0a8')); for (const y of [0.5, EAVE - 0.6]) p.push(tint(place(box(1.78, 0.12, 0.11), 0.9, y, 0), PAL.iron)); p.push(tint(place(torus3(), 1.5, 1.25, 0.07), PAL.gold)); return merge(p); };
  town.add(node('leafL', leaf(3), M.prop, { pos: [-DOOR - 0.12, 0, HALL_Z + 0.12], rot: [0, 212, 0] }), node('leafR', leaf(5), M.prop, { pos: [DOOR + 0.12, 0, HALL_Z + 0.12], rot: [0, -32, 0] }));
  // net floats strung under the lintel
  { const f = [], cols = [PAL.coral, PAL.yellow, PAL.teal, PAL.cream, PAL.pink, PAL.orange]; for (let i = 0; i < 9; i++) { const x = -1.6 + 3.2 * (i / 8); f.push(tint(place(sphere(0.1 + (i % 3) * 0.02, 8, 5), x, EAVE - 0.2 - 0.18 * Math.sin((i / 8) * Math.PI), HALL_Z + 0.2), cols[i % 6])); } f.push(tint(tube(curve([[-1.75, EAVE - 0.08, HALL_Z + 0.2], [0, EAVE - 0.3, HALL_Z + 0.2], [1.75, EAVE - 0.08, HALL_Z + 0.2]], 8), 0.014, 4, { crease: 180 }), PAL.rope)); town.add(node('floats', merge(f), M.prop)); }

  // ---- inside: boards, warm plaster, three tiers of bench, the stove, and the net
  const plaster = night ? '#ffbe86' : '#ffe2b8';
  inside.add(node('floor', planks({ w: HALL_W - 0.9, d: HALL_D, plank: 0.4, thick: 0.08, seed: 4, along: 'z', colors: ['#e9b078', '#f2c08a', '#dca068'] }), M.ground, { pos: [0, 0.02, HALL_Z - HALL_D / 2] }));
  inside.add(node('walls', setGlow(merge(tint(place(box(HALL_W - 0.9, EAVE + 2.2, 0.1), 0, (EAVE + 2.2) / 2, zb + 0.26), plaster), tint(place(box(0.1, EAVE + 1.2, HALL_D), -hw + 0.5, (EAVE + 1.2) / 2, HALL_Z - HALL_D / 2), plaster), tint(place(box(0.1, EAVE + 1.2, HALL_D), hw - 0.5, (EAVE + 1.2) / 2, HALL_Z - HALL_D / 2), plaster), tint(place(box(HALL_W - 0.9, 0.9, 0.12), 0, 0.45, zb + 0.32), '#c8643e')), L.hall), M.flat));
  const NET = [0.0, EAVE + 0.38, zb + 0.4];
  const net = knotNet({ w: 4.4, h: 2.0, cords: 13, seed: 3 });
  inside.add(node('net', setGlow(net, 0.3 + L.hall * 0.4), M.prop, { pos: NET }));
  inside.add(node('beam', tint(place(roundedBox(HALL_W - 1, 0.26, 0.26, 0.04, 1), 0, EAVE + 0.5, zb + 0.5), '#9a5a44'), M.prop));
  for (const [z, y] of [[zb + 1.55, 0.26], [zb + 0.95, 0.52]]) for (const sx of [-1, 1]) inside.add(node('tier', tint(place(roundedBox(2.5, y, 0.6, 0.03, 1), sx * 2.1, y / 2, z), '#c98452'), M.prop));
  const STOVE = [1.25, 0, HALL_Z - 1.25], stoveMesh = stove({ h: 1.0, r: 0.38, pipe: 3.3, lit: true });
  inside.add(node('stove', stoveMesh, M.prop, { pos: STOVE, rot: [0, -18, 0] }));
  const FIRE = anchorAt(stoveMesh, 'fire', STOVE, -18), PIPE = [STOVE[0] - 0.3, PEAK + 0.5, STOVE[2] - 0.2];
  inside.add(node('peat', merge(...[0, 1, 2, 3, 4].map((i) => tint(place(roundedBox(0.3, 0.13, 0.2, 0.03, 1), (i % 3) * 0.2 - 0.2, 0.07 + Math.floor(i / 3) * 0.13, (i % 2) * 0.1, 0, i * 23, 0), '#7a4a5a'))), M.prop, { pos: [2.3, 0.04, HALL_Z - 0.9] }));
  inside.traverse((n) => { n.castShadow = false; });

  // ---- the yard: nets on poles either side, creels, a boat on trestles, a street lamp with a sack over it
  const pole = (x, z, seed) => { const m = netPole({ h: 2.5, seed }); yard.add(node('pole', m, M.prop, { pos: [x, 0, z] })); return anchorAt(m, 'top', [x, 0, z]); };
  const hang = (a, b, o = {}) => { const dx = b[0] - a[0], dz = b[2] - a[2], w = Math.hypot(dx, dz); yard.add(node('net', netPanel({ w, h: 1.5, cols: 8, rows: 4, sag: 0.25, belly: 0.2, floats: PAL.coral, ...o }), M.prop, { pos: [(a[0] + b[0]) / 2, Math.min(a[1], b[1]) - 0.1, (a[2] + b[2]) / 2], rot: [0, -Math.atan2(dz, dx) / DEG, 0] })); };
  hang(pole(-5.6, -1.5, 2), pole(-3.5, -0.7, 4)); hang(pole(3.6, -0.9, 6), pole(5.9, -1.6, 8), { color: '#cfe0a8', floats: PAL.yellow });
  const creel = (s = 1) => merge(tint(lathe([[0, 0], [0.3 * s, 0], [0.3 * s, 0.05], [0.28 * s, 0.2 * s], [0.18 * s, 0.33 * s], [0, 0.36 * s]], 8, { crease: 40 }), '#d9a05a'), tint(place(torus3(0.3 * s, 0.03), 0, 0.05, 0, 90, 0, 0), '#8a5a4a'), tint(place(torus3(0.26 * s, 0.025), 0, 0.2 * s, 0, 90, 0, 0), '#8a5a4a'));
  yard.add(node('creels', merge(creel(1), place(creel(0.9), 0.62, 0, 0.1), place(creel(0.85), 0.3, 0.36, 0.05)), M.prop, { pos: [-3.7, 0, -1.75] }), node('barrel', barrel({ r: 0.3, h: 0.72, color: '#c8643e' }), M.prop, { pos: [3.3, 0, -1.9] }));
  yard.add(node('fishbox', merge(crate({ s: 0.52, seed: 5, color: PAL.wood2 }), ...[0, 1, 2, 3, 4].map((i) => tint(place(ellipsoid(0.17, 0.04, 0.06, 6, 4), (i - 2) * 0.05, 0.55 + (i % 2) * 0.03, (i - 2) * 0.07, 0, i * 30, 0), '#cfe8ff'))), M.prop, { pos: [3.95, 0, -1.3], rot: [0, 12, 0] }));
  const post = lampPost({ h: 2.8, arm: 0.55, lit: false });
  yard.add(node('lamp', post, M.prop, { pos: [4.75, 0, 0.2], rot: [0, 180, 0] }), node('lamp-sack', tint(place(lathe([[0.2, 0], [0.24, 0.3], [0.18, 0.62], [0.06, 0.74], [0, 0.74]], 7, { crease: 30 }), 0, -0.6, 0), C4.sail), M.prop, { pos: anchorAt(post, 'lamp', [4.75, 0, 0.2], 180) }));
  if (!low) {
    yard.add(node('boat', boat({ len: 3.0, hull: '#f2e6c8', keel: PAL.coral, mast: false, seed: 6 }), M.prop, { pos: [-5.9, 0.75, 0.6], rot: [178, 64, 0] }), node('trestle', merge(tint(place(box(0.1, 0.5, 1.2), 0.7, 0.25, 0), '#8a5a4a'), tint(place(box(0.1, 0.5, 1.2), -0.7, 0.25, 0), '#8a5a4a')), M.prop, { pos: [-5.9, 0, 0.6], rot: [0, 64, 0] }));
    yard.add(node('sack', sack({ seed: 4, s: 0.3 }), M.prop, { pos: [-4.4, 0, 0.5] }), node('coil', ropeCoil({ r: 0.26 }), M.prop, { pos: [4.1, 0, 0.9] }), node('weed', kelp({ s: 0.7, seed: 4 }), M.flat, { pos: [-2.9, 0.01, -1.7] }));
  }
  // houses either side of the hall and up the lane behind: every shutter to, nothing in any window
  for (const [x, z, yaw, o] of [[-7.6, -4.6, 22, { seed: 2, w: 3.2, h: 2.4 }], [7.9, -4.9, -24, { seed: 5, w: 3.0, h: 2.9, roofH: 1.7 }], [-11.5, -1.5, 50, { seed: 8, w: 3.0, h: 2.2 }], [11.6, -1.2, -52, { seed: 11, w: 3.2, h: 2.3 }], [-6.5, -10.5, 8, { seed: 14, w: 3.0, h: 2.8 }], [6.2, -11, -6, { seed: 17, w: 3.3, h: 2.5 }]]) town.add(node('hut', stoneHut(o), M.prop, { pos: [x, 0, z], rot: [0, yaw, 0] }));
  town.add(node('bush1', bush({ seed: 3, s: 1.3, color: '#3fa888' }), M.prop, { pos: [-5.4, 0.1, -3.9] }), node('bush2', bush({ seed: 6, s: 1.1, color: '#4fc4a0' }), M.prop, { pos: [5.6, 0.1, -4.2] }));

  // ---- the hill behind, and the island's light on it with its cap on
  const far = group('far'), HILL = [-4, -1.5, -40], TOWER = [-5.2, 0, -31];
  const hillMesh = headland({ w: 90, d: 40, h: 12, seed: 6, grass: night ? '#2f8a8e' : '#5fd0a0', cliff: night ? '#6a70d0' : '#c8c0f0', foot: '#8a80d8', capAt: 0.3, ...(low ? { seg: 24, rings: 10 } : {}) });
  far.add(node('hill', hillMesh, FAR, { pos: HILL, rot: [0, 180, 0] }));
  { let top = 0; const Pm = hillMesh.positions; for (let i = 0; i < Pm.length; i += 3) if (Math.hypot(-Pm[i] + HILL[0] - TOWER[0], -Pm[i + 2] + HILL[2] - TOWER[2]) < 5 && Pm[i + 1] > top) top = Pm[i + 1]; TOWER[1] = HILL[1] + top - 0.6; }
  const tower = cappedLamp({ h: 5.6, r: 1.25 });
  far.add(node('tower', tower, FAR, { pos: TOWER }));
  if (!low) for (const [x, z, s, seed] of [[5, -27, 1.5, 3], [10.5, -29, 1.3, 7], [-13, -28, 1.4, 9], [16, -33, 1.6, 12], [1, -34, 1.2, 15]]) far.add(node('up-hut', stoneHut({ seed, w: 2.6 * s, d: 2.2 * s, h: 2.0 * s, roofH: 1.4 * s }), FAR, { pos: [x, HILL[1] + 5.6 + (seed % 5) * 0.5, z], rot: [0, (seed % 7) * 9 - 20, 0] }));

  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  env.sky.sunDir = norm3(env.sky.sunDir); env.water.level = WATER;
  const insideNode = mergeStatic(inside, 'inside');
  scene.root.add(mergeStatic(ground, 'ground'), mergeStatic(town, 'town'), insideNode, mergeStatic(yard, 'yard'), mergeStatic(far, 'far'));

  const cob = node('cobbles', cobble(), M.flat); cob.castShadow = false;
  const cobCols = ['#eceafc', '#c8c6f0', '#dcd4f6', '#bcc4f0', '#e6d6f0'];
  scatter(cob, low ? 220 : 420, (i) => { const col = i % 20, row = Math.floor(i / 20), x = -6.6 + col * 0.68 + (row % 2) * 0.34 + (r() - 0.5) * 0.16, z = HALL_Z + 0.5 + row * 0.5 + (r() - 0.5) * 0.12; if (r() < 0.4) return null; const sc = 0.2 + r() * 0.1; return { m: m4.trs(x, 0.002, z, 0, r() * 360, 0, sc * 1.25, 1, sc * 0.9), color: cobCols[Math.floor(r() * cobCols.length)] }; });
  scene.root.add(cob);

  const fg = group('fg');
  fg.add(node('fg1', merge(creel(1.1), place(creel(0.9), 0.7, 0, 0.2)), M.prop, { pos: [-2.4, 0, 2.9] }), node('fg2', barrel({ r: 0.27, h: 0.64 }), M.prop, { pos: [2.3, 0, 2.8] }), node('fg3', ropeCoil({ r: 0.24 }), M.prop, { pos: [1.5, 0, 3.0] }));
  const foreground = mergeStatic(fg, 'foreground'); scene.root.add(foreground);

  const sprites = scene.sprites = createSprites(320);
  // ---- the island: benches in the hall first, then both sides of the yard
  const spots = [];
  for (const [z, y] of [[zb + 1.55, 0.26], [zb + 0.95, 0.52]]) for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) spots.push({ pos: [sx * (1.0 + i * 0.42), y, z], face: sx * -14, s: 0.86 });
  for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) spots.push({ pos: [sx * (1.15 + i * 0.44), 0.02, zb + 2.25], face: sx * -18, s: 0.86 });
  for (let i = 0; i < 14; i++) for (const sx of [-1, 1]) spots.push({ pos: [sx * (3.55 + (i % 4) * 0.52 + r() * 0.14), 0, -1.9 + Math.floor(i / 4) * 0.62 + r() * 0.2], face: sx * -62 });
  const folk = crowd({ spots, material: M.prop, sprites: null, hold: 'none', detail: 1, variants: low ? 2 : 3, seed: 5, amount: L.crowd });
  scene.root.add(folk.node);

  // the stove's fire, the light out of the doors
  const fire = node('fire', flame({ r: 0.1, h: 0.2 }), M.lantern, { pos: [FIRE[0], FIRE[1] - 0.12, FIRE[2] + 0.02] }); fire.castShadow = false; scene.root.add(fire);
  const fireGlow = sprites.add({ kind: 'glow', pos: FIRE, size: 2.0, color: '#ffa040', alpha: 0 }), doorGlow = sprites.add({ kind: 'glow', pos: [0, 1.5, HALL_Z - 0.6], size: 5.2, color: '#ff9a48', alpha: 0 }), ventGlow = sprites.add({ kind: 'glow', pos: [0, EAVE + 1.25, HALL_Z + 0.1], size: 1.5, color: '#ffb050', alpha: 0 });
  const spill = node('spill', tint(deform(plane(1, 1, 4, 6), (p) => { const t = p[2] + 0.5; p[0] *= 3.3 + t * 3.6; p[2] = HALL_Z + 0.2 + t * 5.6; p[1] = 0.03; }), '#ffb060'), rayMaterial({ power: 0.9, near: L.spill, far: 0 })); scene.root.add(spill);
  const clouds = cloudBank({ style: low ? 'painted' : 'solid', count: 7, seed: 5, arc: [150, 210], radius: [260, 420], height: [40, 150], size: [0.7, 1.4], speed: 0.05, ...L.cloud });
  scene.root.add(clouds.node);
  const gulls = node('gulls', gull({}), M.speck); gulls.instances = makeInstances(3); gulls.instances.count = 3; if (!night) scene.root.add(gulls);
  const actors = group('actors'); scene.root.add(actors);

  const lamps = [
    { name: 'stove', pos: [FIRE[0], FIRE[1] + 0.25, FIRE[2] + 0.35], color: '#ffa850', radius: 7.5, base: 1.7 },
    { name: 'doors', pos: [0, 1.5, HALL_Z + 0.9], color: '#ffb468', radius: 6.2, base: 1.25 },
    { name: 'net', pos: [0, EAVE - 0.4, zb + 1.4], color: '#ffc880', radius: 4.6, base: 1.0 },
  ];

  let crowdAmt = L.crowd, mood = L.mood, moodNow = L.mood, lastT = -1, nextPuff = 0, nextEmber = 0, nextGust = 1, cheer = 0;
  const P = [0, 0, 0], V = [0, 0, 0], S3 = [1, 1, 1], Q = GL0.quat.create(), Mx = m4.create(), rnd = rng(55);
  const setCrowd = (a) => { crowdAmt = Math.max(0, Math.min(1, a)); folk.setAmount(crowdAmt); }, setMood = (v) => { mood = Math.max(0, Math.min(1, v)); };
  const CUES = { 'ch4.s2.c01': () => { setCrowd(0.12); setMood(0.25); }, 'ch4.s3.c01': () => setCrowd(0), 'ch4.s5.c01': () => { setCrowd(1); setMood(0.25); }, 'ch4.s5.c04': () => setMood(0.6), 'ch4.s5.c05': () => setMood(0.15), 'ch4.s5.c13': () => { setMood(1); cheer = 1; }, 'ch4.s5.c14': () => setMood(0.4) };
  const cue = (id) => { const f = CUES[id]; if (f) f(); return !!f; };

  function update(time, dt, pw) {
    moodNow += (mood - moodNow) * Math.min(1, dt * 2 + (dt === 0 ? 1 : 0));
    folk.update(time, dt, { lit: 0, lively: moodNow });
    const fk = 0.9 + 0.1 * Math.sin(time * 10.3) * Math.sin(time * 6.1), on = Math.min(1.4, pw);
    fire.setScale(1, 0.8 + 0.5 * on * fk, 1); fire.visible = pw > 0.05;
    fireGlow.alpha = 0.55 * on * fk; doorGlow.alpha = (night ? 0.3 : 0.1) * on * (0.4 + 0.6 * L.hall / 0.72); ventGlow.alpha = 0.5 * on * (night ? 1 : 0.3);
    spill.material.beam.near = L.spill * on * fk; spill.visible = pw > 0.05;
    insideNode.glow = 0.45 + 0.55 * Math.min(1.3, pw / Math.max(0.3, L.power));
    clouds.update(time);
    for (let i = 0; i < 3; i++) { const a = time * (0.22 + i * 0.04) * (i % 2 ? 1 : -1) + i * 2.1, rad = 8 + i * 3; P[0] = -6 + i * 6 + Math.cos(a) * rad; P[1] = 9 + i * 1.6; P[2] = -20 - i * 4 + Math.sin(a) * rad * 0.5; GL0.quat.fromEuler(Q, 0, Math.sin(a) * 0.35, Math.cos(a) * 0.3); const fl = Math.sin(time * (5.5 + i * 0.4) + i * 2); S3[0] = 1.7; S3[1] = 1.7 * (0.5 + 1.3 * fl); S3[2] = 1.7; if (Math.abs(S3[1]) < 0.12) S3[1] = 0.12; m4.fromTRS(Mx, P, Q, S3); gulls.instances.data.set(Mx, i * 20); }
    gulls.instances.dirty = true;
    if (lastT >= 0 && time - lastT < 0.5 && dt > 0) {
      if (time > nextPuff) { nextPuff = time + (pw > 0.8 ? 0.35 : 0.7); sprites.puff(PIPE, { count: 1, size: 0.5, rise: 0.7, spread: 0.12, life: 3.2, color: L.smoke }); }
      if (night && pw > 0.3 && time > nextEmber) { nextEmber = time + 0.28; P[0] = -1.4 + rnd() * 2.8; P[1] = 0.3 + rnd() * 1.8; P[2] = HALL_Z + 0.2 + rnd() * 1.2; V[0] = (rnd() - 0.5) * 0.3; V[1] = 0.2 + rnd() * 0.2; V[2] = 0.35; sprites.spawn({ kind: 'glow', pos: P, vel: V, size: 0.09 + rnd() * 0.07, life: 4, color: '#ffc870', alpha: 0.9 }); }
      if (time > nextGust) { nextGust = time + 3 + rnd() * 2; P[0] = -5 + rnd() * 4; P[1] = 2.6 + rnd() * 2.4; P[2] = -2 + rnd() * 3; V[0] = 1.8; V[1] = 0.05; V[2] = 0.2; sprites.gust(P, { vel: V, size: 0.9 + rnd() * 0.5, life: 2.2, alpha: 0.7, color: night ? '#c6d6ff' : '#ffffff' }); }
      if (cheer > 0) { cheer -= dt * 0.6; if (rnd() < 0.3) { P[0] = -3 + rnd() * 6; P[1] = 1 + rnd() * 2; P[2] = HALL_Z + rnd() * 2; sprites.sparkle(P, { count: 2, size: 0.3, spread: 0.8, life: 0.8, color: '#ffe9a0' }); } }
      sprites.update(dt);
    }
    lastT = time;
  }

  return c4Shell({
    id: 'dark-village', light, low, scene, actors, foreground, cameras: CAMERAS, lamps, lampPower: L.power, update,
    marks: { ...MARKS4, focus: FIRE, net: [NET[0], NET[1] - 1, NET[2]], door: { pos: [0, 0, HALL_Z + 0.5], face: 0 }, tower: anchorAt(tower, 'top', TOWER) },
    extra: { setCrowd, setMood, cue },
  });
}

function torus3(R = 0.09, t = 0.02) { return GL0.torus(R, t, 10, 4); }

export const darkVillage = { id: 'dark-village', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default darkVillage;
