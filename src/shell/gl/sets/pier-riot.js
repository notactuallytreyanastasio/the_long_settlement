// SET: pier-riot. The Vessery docks an hour after the Drawing, the night of the shot: the foot of the hall
// steps on the left, the long pier running out to a fire at its end, the dock crane and its bollard on the
// right, and the festival still hanging overhead with half its lanterns out.
// Chapter 1, scene 5 "The Pier" (encounter: Ren gets Ilse off the steps, along the pier, under the crane)
// and the first nine lines of its cutscene (ch1.s5.c01-09).
//
//   import { pierRiot } from './sets/pier-riot.js';
//   const set = pierRiot.build(GL, { light: 'night', low: false });   // 'night' is the only light
//
// The shape is lantern-stalls' (see ../index.js). Figures face +Z, cameras look toward -Z (down the pier,
// at the fire). The strip x -4.4..4.4, z -0.2..1.6 is clear. The fire is the key light: it is behind the
// stage, so everything is a blue silhouette with an orange edge, and the crane's lamp lights the strip.
// Added here:
//   setRiot(0..1)         how much of the riot is in view: torches on the steps, the pier and the quay, how hard
//                         they shove, how high the fire stands. Starts at 0.8
//   cue(lineId)           ch1.s5.c01 (full riot) .. ch1.s5.c07 (it has moved off down the pier)
//   marks.cover           under the crane, behind the bollard: where Ren sits Ilse down
//   marks.steps           the foot of the hall steps (where the scene starts);  marks.fire, marks.focus (the crane lamp)
// low: true drops the far town's glows, a third of the rioters, one lantern string and the high clouds.

import * as GL0 from '../index.js';
import {
  m4, rng, DEG, rgb,
  merge, tint, place, plane, box, tube, curve, cylinder, setGlow, roundedBox,
  node, group, makeEnv, createScene, mergeStatic, createSprites, rayMesh, rayMaterial,
} from '../index.js';
import {
  PAL, kitMaterials, anchorAt, scatter, pickLight, setRig, paperLantern, lanternString, lanternLines, crowd, bunting,
  crate, barrel, sack, bollard, ropeCoil, lighthouse, pole, headland, cloudBank, quayEdge, cobble, rock,
  pier, crane, steps, townBank, floatLight, flame, wreck, archWindow, cloud,
} from './kit.js';

const QUAY_Z = -6.4, WATER = -0.5;
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
const dirFrom = (azDeg, elDeg) => [Math.sin(azDeg * DEG) * Math.cos(elDeg * DEG), Math.sin(elDeg * DEG), -Math.cos(azDeg * DEG) * Math.cos(elDeg * DEG)];
const RIOT_COATS = ['#ffe2cc', '#e4d8ff', '#ffd9c4', '#d8e6ff', '#fff0c8', '#f2d4e0']; // pale, as COATS, a little dustier

const LIGHTS = {
  night: {
    preset: 'night', power: 1.15, unlit: 0.4, glow: 0.7, riot: 0.8,
    env: {
      key: { dir: dirFrom(9, 36), color: '#8aa2f4' },                 // the moon, behind and above: the stones stay blue
      shadow: { tint: '#2f3aa6', lift: 0.12, saturate: 1.3 },
      ambient: { sky: '#4458d0', ground: '#33309a', amount: 0.18 },
      rim: { color: '#ff9a52', amount: 1.4, edge: 0.7 },             // and every edge that faces down the pier is the fire's
      fog: { color: '#6a4fc0', density: 0.0046, start: 14, max: 0.84 },
      sky: { zenith: '#0c1568', mid: '#2a2f9c', midAt: 0.4, horizon: '#b0509a', below: '#6a3aa0', glow: '#ff8a4a', glowAmount: 0.95, sunDir: dirFrom(2.5, 1.5), moon: 0, stars: 0.8, sun: { size: 0.01, color: '#ff9a50', halo: '#ff8a4a', haloAmount: 0.55 } },
      water: { deep: '#14237e', mid: '#2c3aa8', shallow: '#c8569a', foam: '#ffc8b0', glint: '#ff9a5a', glintDensity: 0.3 },
    },
    cloud: { color: '#9a7fe0', shadowTint: '#4a3aa0' }, ray: 0.42, beam: 0.2, smoke: '#a98ae6', smokeShade: '#4a3a9c', smoke2: '#9a66b8',
  },
};

const CAMERAS = {
  wide: { target: [0.1, 1.6, -0.4], dist: 8.2, yaw: 2, pitch: 5, fov: 44, aspect: 0.46, shadowCenter: [0, 0, -1.2], shadowRadius: 8 },
  two: { target: [0, 1.12, 0.6], dist: 6.0, yaw: -15, pitch: 5, fov: 31, aspect: 0.46, shadowCenter: [0, 0, 0.3], shadowRadius: 3.6 },
  close: { target: [0.02, 0.86, 0.8], dist: 3.9, yaw: 21, pitch: 3, fov: 28, aspect: 0.46, shadowCenter: [0, 0, 0.5], shadowRadius: 2.6 },
  low: { target: [0.2, 1.8, 0.2], dist: 6.2, yaw: -8, pitch: -12, fov: 56, aspect: 0.46, shadowCenter: [0, 0, -1], shadowRadius: 8 },
  stage: { target: [0, 1.02, 0.5], dist: 9.4, yaw: -13, pitch: 7, fov: 24, aspect: 1.95, shadowCenter: [0, 0, -0.5], shadowRadius: 7.5, outline: 0.7 },
  landscape: { target: [0, 1.8, -1.2], dist: 10.5, yaw: 3, pitch: 5, fov: 40, aspect: 1.6, shadowCenter: [0, 0, -1.5], shadowRadius: 10.5 },
};

const MARKS = {
  a: { pos: [-0.8, 0, 0.55], face: 14 }, b: { pos: [0.02, 0, 0.8], face: 0 }, c: { pos: [0.82, 0, 0.55], face: -14 },
  two: [{ pos: [-0.42, 0, 0.62], face: 24 }, { pos: [0.42, 0, 0.62], face: -24 }],
  party: [{ pos: [-1.05, 0, 0.75], face: 78 }, { pos: [-1.85, 0, 1.15], face: 72 }, { pos: [-2.5, 0, 0.5], face: 80 }],
  opposition: [{ pos: [1.05, 0, 0.75], face: -78 }, { pos: [1.85, 0, 1.15], face: -72 }, { pos: [2.55, 0, 0.5], face: -80 }],
  steps: { pos: [-2.9, 0, 0.3], face: 80 }, cover: { pos: [2.7, 0, 0.5], face: -60 },
};

const CUES = { 'ch1.s5.c01': { riot: 1 }, 'ch1.s5.c02': { riot: 0.9 }, 'ch1.s5.c05': { riot: 0.8 }, 'ch1.s5.c07': { riot: 0.5 }, 'ch1.s5.c09': { riot: 0.4 } };

function build(engine = GL0, { light, low = false } = {}) {
  const picked = pickLight('pier-riot', LIGHTS, light), L = picked.L; light = picked.name;
  const M = kitMaterials(), r = rng(5151), FAR = low ? M.farFlat : M.far;
  const PIER_X = 0.55, PIER_W = 2.6, PIER_LEN = 17;
  const CRANE = [2.55, 0, -4.1], CRANE_YAW = 180 - 8;          // boom reaches back over the pier's root
  const HALL_X = -3.9, STEP_TOP = -4.9, STEP_N = 6, RISE = 0.24, RUN = 0.44, LAND_Y = STEP_N * RISE;
  const FIRE = [PIER_X + 0.1, 0, QUAY_Z + 0.25 - PIER_LEN + 1.3];
  const FALLEN = [-1.35, 0, -1.75];

  const near = group('near'), mid = group('mid'), ground = group('ground');
  ground.add(node('ground', tint(place(plane(90, 22, 1, 1), 0, 0, QUAY_Z + 0.3 + 11), '#e2cfa8'), M.ground));
  ground.add(node('quay', quayEdge({ len: low ? 17 : 24, drop: 1.7, seed: 9 }), M.ground, { pos: [(low ? 8.5 : 12) - 2.4, 0, QUAY_Z] }));
  ground.add(node('quay-far', tint(place(box(32, 1.9, 0.5), 36, -0.95, QUAY_Z + 0.3), PAL.stone2), M.ground));
  ground.add(node('hall-foot', tint(place(box(10, 2.2, 4.4), 0, -1.1, 0), PAL.stone2), M.ground, { pos: [HALL_X - 3.5, 0, STEP_TOP - 3.3] }));
  ground.traverse((n) => { n.castShadow = false; });

  // ---- left: the foot of the hall steps, two fat columns, the hall's flank with one lit door
  const stepsMesh = steps({ w: 5.4, n: STEP_N, rise: RISE, run: RUN });
  near.add(node('steps', stepsMesh, M.prop, { pos: [HALL_X, LAND_Y, STEP_TOP], rot: [0, 180, 0] }));
  near.add(node('landing', tint(place(box(5.4, LAND_Y + 0.4, 3.6), 0, (LAND_Y - 0.4) / 2, -1.8), PAL.stone), M.prop, { pos: [HALL_X, 0, STEP_TOP] }));
  near.add(node('cheek', tint(place(roundedBox(0.5, LAND_Y + 0.5, STEP_N * RUN + 0.3, 0.06, 1), 0, (LAND_Y + 0.5) / 2 - 0.1, STEP_N * RUN / 2), PAL.stone2), M.prop, { pos: [HALL_X - 2.95, 0, STEP_TOP] }));
  near.add(node('newel', merge(tint(place(roundedBox(0.56, 0.5, 0.56, 0.06, 1), 0, 0.25, 0), PAL.stone2), tint(place(GL0.sphere(0.2, 10, 7), 0, 0.64, 0), PAL.stone)), M.prop, { pos: [HALL_X + 2.95, 0, STEP_TOP + STEP_N * RUN - 0.1] })); // the open side: only a low post, so the steps read from the stage
  const colMesh = () => merge(tint(place(cylinder(0.42, 0.42, 0.3, 12), 0, 0, 0), PAL.stone2), tint(place(cylinder(0.34, 0.3, 4.3, 12), 0, 0.3, 0), PAL.cream), tint(place(roundedBox(0.95, 0.3, 0.95, 0.06, 1), 0, 4.75, 0), PAL.stone2));
  for (const x of [-1.25, 1.25]) mid.add(node('column', colMesh(), M.prop, { pos: [HALL_X + x, LAND_Y, STEP_TOP - 0.75] }));
  mid.add(node('lintel', tint(place(box(4.6, 0.9, 1.3), -0.6, LAND_Y + 5.35, -0.75), PAL.cream), M.prop, { pos: [HALL_X, 0, STEP_TOP] }));
  mid.add(node('hall-wall', tint(place(box(7, 9, 0.6), -2.0, 4.5, -2.6), '#eadcc6'), M.prop, { pos: [HALL_X, 0, STEP_TOP] })); // its right edge stops at x -2.4: a portrait frame keeps the pier and the fire
  const DOOR = [HALL_X - 0.4, LAND_Y, STEP_TOP - 2.28];
  mid.add(node('hall-door', archWindow({ w: 1.7, h: 3.3, glass: '#ffc46a', frame: PAL.stone2, bars: PAL.woodDark, glow: 0.95 }), M.prop, { pos: DOOR }));

  // ---- centre: the pier, and the wreck burning at its end
  const pierMesh = pier({ len: PIER_LEN, w: PIER_W, drop: 0.6, seed: 7 });
  mid.add(node('pier', pierMesh, M.prop, { pos: [PIER_X, 0, QUAY_Z + 0.25] }));
  const wreckMesh = wreck({ s: 1.9, seed: 3 });
  mid.add(node('wreck', wreckMesh, M.prop, { pos: FIRE, rot: [0, 20, 0] }));
  mid.add(node('pier-crate', crate({ s: 0.6, seed: 8 }), M.prop, { pos: [PIER_X + 0.8, 0, -9.4], rot: [0, 30, 0] }), node('pier-barrel', barrel({}), M.prop, { pos: [PIER_X - 0.85, 0.27, -11.2], rot: [90, 40, 0] }));

  // ---- right: the crane, its bollard, the cargo it was working
  const craneMesh = crane({ h: 4.7, reach: 3.1, seed: 2, line: 0.22 });
  near.add(node('crane', craneMesh, M.prop, { pos: CRANE, rot: [0, CRANE_YAW, 0] }));
  const craneLamp = anchorAt(craneMesh, 'lamp', CRANE, CRANE_YAW), craneTop = anchorAt(craneMesh, 'top', CRANE, CRANE_YAW);
  near.add(node('bollard', bollard({ s: 1.5 }), M.prop, { pos: [3.05, 0, -0.95] }), node('coil', ropeCoil({ r: 0.3 }), M.prop, { pos: [3.9, 0, -1.25] }));
  const cargo = [
    [crate({ s: 0.7, seed: 1 }), [4.55, 0, -2.3], 12], [crate({ s: 0.58, seed: 2, color: PAL.wood2 }), [4.5, 0.71, -2.35], -14], [crate({ s: 0.6, seed: 5 }), [5.35, 0, -1.7], 30],
    [barrel({ r: 0.32, h: 0.78 }), [3.75, 0, -2.75], 0], [sack({ seed: 2, s: 0.38 }), [5.0, 0, -1.0], 30], [barrel({ r: 0.28, h: 0.7 }), [1.55, 0.29, -2.6], 0],
    [crate({ s: 0.5, seed: 9, color: PAL.wood2 }), [-5.3, 0, -1.4], 20], [sack({ seed: 7 }), [-4.9, 0, -0.85], -20],
  ];
  cargo.forEach(([m, p, yaw], i) => (low && i > 5) || near.add(node('cargo' + i, m, M.prop, { pos: p, rot: i === 5 ? [90, 25, 0] : [0, yaw, 0] })));
  // what the night has left on the stones: the pole the shot took the lantern off, dead paper, a trampled banner
  near.add(node('fallen-pole', tint(place(cylinder(0.05, 0.04, 2.9, 6), 0, 0, 0, 86, 0, 0), PAL.woodDark), M.prop, { pos: [FALLEN[0] - 0.3, 0.07, FALLEN[2] - 2.7], rot: [0, 14, 0] }));
  for (const [x, z, rx, ry, c] of [[FALLEN[0], FALLEN[2], 82, -30, 0], [-0.2, -2.6, 80, 20, 2], [1.2, -1.6, -84, 70, 5], [-3.1, -1.35, 86, -40, 1], [2.1, -3.6, 78, 10, 3]]) near.add(node('dead-lantern', tint2(setGlow(paperLantern({ r: 0.14, seg: 7, cord: 0.01 }), 0), PAL.lanterns[c], 0.8), M.prop, { pos: [x, 0.28, z], rot: [rx, ry, 0] }));
  near.add(node('banner', tint(place(box(1.5, 0.02, 0.5), 0, 0.012, 0), PAL.red), M.flat, { pos: [0.3, 0, -3.5], rot: [0, 24, 0] }), node('banner2', tint(place(box(0.5, 0.022, 0.5), 0, 0.014, 0), PAL.cream), M.flat, { pos: [0.3, 0, -3.5], rot: [0, 24, 0] }));

  // ---- overhead: the festival strings, from the hall to the crane and out along the pier
  const POLE_P = [PIER_X - PIER_W / 2 - 0.1, 0, -10.6];
  const poleP = pole({ h: 4.4, seed: 8, knob: PAL.coral });
  mid.add(node('pier-pole', poleP, M.prop, { pos: POLE_P }));
  const hallHook = [HALL_X + 1.25, LAND_Y + 4.9, STEP_TOP - 0.5], topP = anchorAt(poleP, 'top', POLE_P);
  const strings = [], wires = [];
  const addString = (a, b, opts, cols) => { const s = lanternString(a, b, opts); wires.push(s.wire); strings.push({ ...s, cols }); return s; };
  addString(hallHook, craneTop, { sag: 1.3, count: 7, ends: 0.1 }, [0, 2, 1, 0, 3, 2, 5]);
  addString(craneTop, topP, { sag: 1.1, count: low ? 4 : 6, ends: 0.12 }, [1, 4, 2, 0, 5, 1]);
  if (!low) addString(hallHook, topP, { sag: 1.5, count: 6, ends: 0.12 }, [2, 0, 5, 1, 0, 2]);
  near.add(node('wires', merge(wires), M.flat));
  if (!low) mid.add(node('bunting', bunting(craneTop, [8.5, 3.2, -3.4], { sag: 0.5, count: 9, seed: 3 }), M.prop));
  mid.traverse((n) => { n.castShadow = false; });

  // ---- far
  const far = group('far');
  const HEAD = [-50, -0.6, -128], LH = [-9.4, 0, -122];
  const headMesh = headland({ w: 96, d: 34, h: 9, seed: 3, grass: '#3f9a78' });
  far.add(node('headland', headMesh, FAR, { pos: HEAD }));
  { let top = 0; const Pm = headMesh.positions; for (let i = 0; i < Pm.length; i += 3) if (Math.hypot(Pm[i] + HEAD[0] - LH[0], Pm[i + 2] + HEAD[2] - LH[2]) < 5 && Pm[i + 1] > top) top = Pm[i + 1]; LH[1] = HEAD[1] + top - 0.8; }
  const lh = lighthouse({ h: 13, r: 2.3 });
  far.add(node('lighthouse', lh, FAR, { pos: LH }));
  const TOWN = [30, WATER, -80], TOWN_YAW = -16;
  const town = townBank({ w: 46, d: 18, h: 13, rows: 4, seed: 5, lit: 0.55 });
  far.add(node('town', town, FAR, { pos: TOWN, rot: [0, TOWN_YAW, 0] }), node('town-foot', tint(place(box(52, 2.4, 3), 0, -0.6, 1.2), PAL.stoneDark), FAR, { pos: TOWN, rot: [0, TOWN_YAW, 0] }));
  for (const [x, z, s, seed] of [[9.5, -19, 1.6, 3], [11, -18, 0.9, 5], [-6, -26, 1.5, 8]]) far.add(node('rock', rock({ seed, s }), FAR, { pos: [x, WATER - 0.05, z] }));

  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  env.sky.sunDir = norm(env.sky.sunDir);
  env.water.level = WATER;
  env.water.shores = [[14, QUAY_Z + 0.1 + 900, 900, 0.75], [9.5, -19, 1.3, 0.6], [-6, -26, 1.2, 0.6], [-50, -128, 46, 1.6], [TOWN[0], TOWN[2] + 3, 24, 1.4], [FIRE[0], FIRE[2], 2.2, 0.8]];
  scene.root.add(mergeStatic(ground, 'ground'), mergeStatic(near, 'near'), mergeStatic(mid, 'mid'), mergeStatic(far, 'far'));

  const cob = node('cobbles', cobble(), M.flat); cob.castShadow = false;
  const cobCols = ['#f2dfc0', '#d8c49c', '#ecd6b0', '#d4be96', '#e8d0aa'];
  scatter(cob, low ? 220 : 480, (i) => {
    const col = i % 20, row = Math.floor(i / 20), x = -6.4 + col * 0.66 + (row % 2) * 0.33 + (r() - 0.5) * 0.16, z = QUAY_Z + 0.95 + row * (low ? 0.68 : 0.36) + (r() - 0.5) * 0.12;
    if (r() < 0.4 || (x < HALL_X + 3.1 && z < STEP_TOP + STEP_N * RUN + 0.2)) return null;
    const sc = 0.2 + r() * 0.09; return { m: m4.trs(x, 0.002, z, 0, r() * 360, 0, sc * 1.25, 1, sc * 0.9), color: cobCols[Math.floor(r() * cobCols.length)] };
  });
  scene.root.add(cob);

  const fg = group('fg');
  fg.add(node('fg1', crate({ s: 0.55, seed: 21 }), M.prop, { pos: [1.7, 0, 2.95], rot: [0, -20, 0] }), node('fg2', tint2(setGlow(paperLantern({ r: 0.15, seg: 7, cord: 0.01 }), 0), PAL.lanterns[1], 0.8), M.prop, { pos: [-1.6, 0.3, 2.8], rot: [84, 30, 0] }), node('fg3', sack({ seed: 4, s: 0.3 }), M.prop, { pos: [2.3, 0, 2.6], rot: [0, -30, 0] }), node('fg4', barrel({ r: 0.26, h: 0.64 }), M.prop, { pos: [-2.3, 0.26, 2.7], rot: [90, 60, 0] }));
  const foreground = mergeStatic(fg, 'foreground');
  scene.root.add(foreground);

  const sprites = scene.sprites = createSprites(512);

  // ---- lanterns: the shot and the crush have put half of them out
  const lines = lanternLines({ strings, material: M.lantern, sprites, shapes: low ? 1 : 2, seg: low ? 6 : 8, seed: 5 });
  scene.root.add(...lines.nodes);
  for (let i = 0; i < lines.count; i++) if ((i * 7 + 3) % 5 < 2 || i === 1) lines.setLit(i, 0);

  // ---- the riot: torches on the steps, along the pier, and on the quay beyond the crane
  const spots = [];
  { const onSteps = [], onPier = [], onQuay = [];
    for (let i = 0; i < 9; i++) { const k = 1 + (i % 5), x = HALL_X - 2.1 + r() * 4.2; onSteps.push(i > 6 ? { pos: [x, LAND_Y, STEP_TOP - 0.35 - r() * 0.5], face: 20 + r() * 40 } : { pos: [x, LAND_Y - RISE * k, STEP_TOP + RUN * (k + 0.5)], face: 20 + r() * 60 }); } // step k's tread is RISE * k below the landing
    for (let i = 0; i < 14; i++) onPier.push({ pos: [PIER_X + (r() - 0.5) * (PIER_W - 0.7), 0, QUAY_Z - 1.2 - i * 0.95 - r() * 0.4], face: (r() - 0.5) * 300 });
    for (let i = 0; i < 9; i++) onQuay.push({ pos: [3.4 + (i % 4) * 0.8 + r() * 0.4, 0, -3.6 - Math.floor(i / 4) * 0.85 - r() * 0.3], face: -40 - r() * 60 });
    for (let i = 0; i < 14; i++) { if (i < onPier.length) spots.push(onPier[i]); if (i < onSteps.length) spots.push(onSteps[i]); if (i < onQuay.length) spots.push(onQuay[i]); }
  }
  const folk = crowd({ spots: low ? spots.filter((_, i) => i % 3 !== 2) : spots, material: M.prop, sprites, seed: 31, hold: 'torch', colors: RIOT_COATS, glow: '#ff9a40', glowSize: 0.5, amount: L.riot, variants: low ? 2 : 3 });
  scene.root.add(folk.node);

  // ---- fire: the wreck at the pier's end, and the lantern the shot brought down still burning by the steps
  const fireAt = anchorAt(wreckMesh, 'fire', FIRE, 20);
  const flames = [
    { n: node('flame0', flame({ r: 0.75, h: 2.3 }), M.speck, { pos: fireAt[0] }), ph: 0, s: 1 },
    { n: node('flame1', flame({ r: 0.5, h: 1.5 }), M.speck, { pos: fireAt[1] }), ph: 2.1, s: 1 },
    { n: node('flame2', flame({ r: 0.13, h: 0.34 }), M.speck, { pos: [FALLEN[0], 0.12, FALLEN[2]] }), ph: 4.0, s: 1, small: true },
  ];
  for (const f of flames) { f.n.castShadow = false; scene.root.add(f.n); }
  const FIRE_TOP = [fireAt[0][0], fireAt[0][1] + 1.2, fireAt[0][2]];
  // the smoke: lobed toon clouds climbing off the fire and leaning down the wind, one instanced draw, looping
  const SMOKE_N = low ? 5 : 7;
  const smoke = node('smoke', tint(cloud({ seed: 4, w: 2.2, puffs: 3 }), L.smoke), GL0.material({ name: 'riot-smoke', outline: false, rim: 0, fog: 0.2, shadowTint: L.smokeShade, receiveShadow: false, castShadow: false, bandEdge: 0.1, bandSoft: 0.01, lightUp: 0.6 }));
  smoke.castShadow = false; smoke.instances = GL0.makeInstances(SMOKE_N); smoke.instances.count = SMOKE_N; scene.root.add(smoke);

  const lamps = [
    { name: 'crane', pos: craneLamp, color: '#ffc470', radius: 5.8, base: 1.2 },
    { name: 'fire', pos: FIRE_TOP, color: '#ff8a3a', radius: 15, base: 1.3 },
    { name: 'fallen', pos: [FALLEN[0], 0.5, FALLEN[2]], color: '#ff9a48', radius: 2.4, base: 0.9 },
    { name: 'hall-door', pos: [DOOR[0], DOOR[1] + 1.4, DOOR[2] + 0.9], color: '#ffc46a', radius: 3.4, base: 0.85 },
    { name: 'torches-pier', pos: [PIER_X, 1.5, -10.0], color: '#ff9a48', radius: 4.6, base: 0.9 },
    { name: 'torches-quay', pos: [4.6, 1.6, -4.0], color: '#ff9a48', radius: 3.0, base: 0.8 },
  ];
  env.points = lamps.map((l) => ({ pos: l.pos, color: rgb(l.color), radius: l.radius, intensity: l.base * L.power }));

  const craneGlow = sprites.add({ kind: 'glow', pos: craneLamp, size: 2.0, color: '#ffb450', alpha: 0 });
  const fireGlow = sprites.add({ kind: 'glow', pos: FIRE_TOP, size: 9, color: '#ff8030', alpha: 0 });
  const fireCore = sprites.add({ kind: 'glow', pos: [FIRE_TOP[0], FIRE_TOP[1] - 0.4, FIRE_TOP[2]], size: 3.2, color: '#ffd070', alpha: 0 });
  const fallenGlow = sprites.add({ kind: 'glow', pos: [FALLEN[0], 0.3, FALLEN[2]], size: 0.9, color: '#ffa040', alpha: 0 });
  const doorGlow = sprites.add({ kind: 'glow', pos: [DOOR[0], DOOR[1] + 1.7, DOOR[2] + 0.2], size: 2.2, color: '#ffb450', alpha: 0 });
  const winGlows = [];
  if (!low) anchorAt(town, 'windows', TOWN, TOWN_YAW).slice(0, 16).forEach((p) => winGlows.push(sprites.add({ kind: 'glow', pos: p, size: 3.2, color: '#ffc060', alpha: 0 })));
  const lhLamp = anchorAt(lh, 'lamp', LH), lhGlow = sprites.add({ kind: 'glow', pos: lhLamp, size: 15, color: '#ffe08a', alpha: 0 });

  // the lights set afloat earlier are still out there, drifting through it
  const floats = [], floatNode = node('floats', floatLight({ detail: 0 }), M.speck);
  scatter(floatNode, low ? 60 : 130, (i) => {
    const u = r(), z = QUAY_Z - 1.5 - u * u * 70, x = 2.2 + (r() - 0.35) * (20 + (QUAY_Z - z) * 1.2), col = ['#ffc860', '#ffb04a', '#ffdf8a', '#ff9458'][i % 4];
    if (Math.abs(x - PIER_X) < PIER_W / 2 + 0.6 && z > QUAY_Z - PIER_LEN - 2) return null;
    const s = 1 + (QUAY_Z - z) * 0.02;
    if (floats.length < (low ? 10 : 22) && z > -30) floats.push({ glow: sprites.add({ kind: 'glow', pos: [x, WATER + 0.2, z], size: 0.62 * s, color: col, alpha: 0 }), ph: r() * 6.283 });
    return { m: m4.trs(x, WATER, z, 0, r() * 360, 0, s), color: col };
  });
  scene.root.add(floatNode);

  const shaft = node('lamp-shaft', tint(place(rayMesh(2.9, 0.12, 1.9, 14), craneLamp[0], craneLamp[1], craneLamp[2]), '#ffc060'), rayMaterial({ power: 1.5, near: L.ray, far: 0 }));
  scene.root.add(shaft);
  const beam = group('lh-beam', { pos: lhLamp });
  { const one = () => tint(rayMesh(70, 0.6, 7, 14), '#ffe9a0'); beam.add(node('beams', merge(place(one(), 0, 0, 0, 0, 0, 84), place(one(), 0, 0, 0, 0, 0, -84)), rayMaterial({ power: 1.3, near: L.beam, far: 0 }))); }
  scene.root.add(beam);
  const clouds = cloudBank({ count: low ? 4 : 8, seed: 19, arc: [156, 206], radius: [250, 430], height: [22, 130], size: [0.7, 1.5], speed: 0.07, ...L.cloud });
  scene.root.add(clouds.node);
  const high = low ? null : cloudBank({ count: 5, seed: 29, arc: [150, 212], radius: [300, 420], height: [170, 300], size: [0.9, 1.6], speed: 0.05, ...L.cloud });
  if (high) scene.root.add(high.node);

  const actors = group('actors'); scene.root.add(actors);

  let power = 1, riot = L.riot, riotNow = L.riot;
  const P = [0, 0, 0], V = [0, 0, 0], rnd = rng(77), SM_P = [0, 0, 0], SM_S = [1, 1, 1], SM_Q = GL0.quat.create(), SM_M = m4.create();
  let nextSpark = 0, nextEmber = 0, nextRing = 0.8, lastT = -1;
  const setPower = (p) => { power = Math.max(0, Math.min(1.5, p)); };
  const setRiot = (a) => { riot = Math.max(0, Math.min(1, a)); folk.setAmount(riot); };
  function cue(lineId) { const c = CUES[lineId]; if (!c) return false; setRiot(c.riot); return true; }

  function update(time, dt = 0) {
    const pw = L.power * power, on = Math.min(1, pw);
    riotNow += (riot - riotNow) * Math.min(1, dt * 1.5 + (dt === 0 ? 1 : 0));
    lines.update(time, { on, pw, unlit: L.unlit, glow: L.glow, cool: 0.12 });
    folk.update(time, dt, { lit: 0.7 + 0.5 * riotNow, lively: 0.35 + 0.65 * riotNow });
    // fire does not answer to the table's power: it is the riot's, and stands as high as the riot does
    const big = 0.55 + 0.6 * riotNow;
    for (let i = 0; i < flames.length; i++) {
      const f = flames[i], k = f.small ? 1 : big, fl = 1 + 0.16 * Math.sin(time * 9.1 + f.ph) + 0.1 * Math.sin(time * 14.7 + f.ph * 2.3);
      f.n.scale[0] = f.n.scale[2] = k * (1 + 0.1 * Math.sin(time * 6.3 + f.ph)); f.n.scale[1] = k * fl;
      f.n.setRot(Math.sin(time * 3.1 + f.ph) * 5, time * 40 + f.ph * 50, Math.sin(time * 2.3 + f.ph) * 7 - 5);
    }
    const flick = 0.9 + 0.1 * Math.sin(time * 10.3) * Math.sin(time * 6.7), fl2 = 0.88 + 0.12 * Math.sin(time * 13.1 + 1);
    env.points[0].intensity = lamps[0].base * pw * (0.96 + 0.04 * Math.sin(time * 8.3));
    env.points[1].intensity = lamps[1].base * big * flick;
    env.points[2].intensity = lamps[2].base * fl2;
    env.points[3].intensity = lamps[3].base * Math.max(0.6, on);
    env.points[4].intensity = lamps[4].base * riotNow * flick; env.points[5].intensity = lamps[5].base * riotNow * fl2;
    craneGlow.alpha = 0.6 * Math.min(1.2, pw); shaft.visible = pw > 0.05;
    fireGlow.alpha = 0.34 * big * flick; fireGlow.size[0] = fireGlow.size[1] = 9 * big; fireCore.alpha = 0.6 * flick; fallenGlow.alpha = 0.7 * fl2; doorGlow.alpha = 0.3;
    for (let i = 0; i < winGlows.length; i++) winGlows[i].alpha = 0.36;
    beam.setRot(0, time * 22, 0);
    lhGlow.alpha = 0.3 + 0.3 * Math.pow(Math.abs(Math.cos(time * 22 * DEG)), 6);
    for (let i = 0; i < floats.length; i++) floats[i].glow.alpha = 0.5 + 0.2 * Math.sin(time * 2.1 + floats[i].ph);
    clouds.update(time); if (high) high.update(time);
    for (let i = 0; i < SMOKE_N; i++) { // each lobe rises 9 units over 14 seconds, growing, then starts again small
      const u = ((time / 14 + i / SMOKE_N) % 1 + 1) % 1, sc = (0.35 + 1.5 * u) * big * Math.min(1, u * 8) * Math.min(1, (1 - u) * 5);
      SM_P[0] = FIRE_TOP[0] + 0.3 + u * u * 5.5 + Math.sin(i * 2.4 + time * 0.3) * 0.25; SM_P[1] = FIRE_TOP[1] + 0.9 + u * 9; SM_P[2] = FIRE_TOP[2] - 0.6 - u * 2;
      GL0.quat.fromEuler(SM_Q, 0, i * 1.3 + time * 0.05, Math.sin(i * 1.7) * 0.2); SM_S[0] = SM_S[1] = SM_S[2] = Math.max(0.001, sc);
      m4.fromTRS(SM_M, SM_P, SM_Q, SM_S); smoke.instances.data.set(SM_M, i * 20);
    }
    smoke.instances.dirty = true;

    if (lastT >= 0 && time - lastT < 0.5 && dt > 0) {
      if (time > nextSpark) { // sparks off the fire, and now and then off a torch
        nextSpark = time + 0.09; P[0] = FIRE_TOP[0] + (rnd() - 0.5) * 1.4; P[1] = FIRE_TOP[1] - 0.6 + rnd(); P[2] = FIRE_TOP[2]; V[0] = (rnd() - 0.3) * 1.2; V[1] = 1.6 + rnd() * 1.6; V[2] = (rnd() - 0.5) * 0.6;
        sprites.spawn({ kind: 'glow', pos: P, vel: V, size: 0.16 + rnd() * 0.14, life: 1.6 + rnd(), color: '#ffb050', alpha: 1, gravity: -0.3 });
      }
      if (time > nextEmber) { // embers and burnt paper drifting across the stage on the wind
        nextEmber = time + 0.22; P[0] = -5 + rnd() * 10; P[1] = 0.2 + rnd() * 3.2; P[2] = -6 + rnd() * 7; V[0] = 0.5 + rnd() * 0.5; V[1] = 0.2 + rnd() * 0.3; V[2] = 0.3;
        sprites.spawn({ kind: 'glow', pos: P, vel: V, size: 0.07 + rnd() * 0.07, life: 3.5, color: rnd() < 0.7 ? '#ff9a48' : '#ffd890', alpha: 0.95 });
      }
      if (time > nextRing) { nextRing = time + 1.7; P[0] = 2.5 + rnd() * 12; P[1] = WATER + 0.03; P[2] = QUAY_Z - 1.2 - rnd() * 7; sprites.splash(P, { size: 0.9 + rnd() * 0.6, life: 1.4, spray: 0, color: '#ffc8b0' }); }
      sprites.update(dt);
    }
    lastT = time;
  }

  const rig = setRig('pier-riot', CAMERAS, env);
  setRiot(L.riot);
  update(0, 0);
  return {
    id: 'pier-riot', light, low, scene, env, actors, foreground,
    cameras: CAMERAS, frame: rig.frame, view: rig.view,
    marks: { ...MARKS, focus: craneLamp, fire: FIRE_TOP },
    lamps, setPower, setRiot, cue, task: () => null, setLantern: lines.setLit, lanternCount: lines.count,
    update,
  };
}

function tint2(mesh, color, k = 1) { const c = rgb(color), C = mesh.colors; for (let i = 0; i < C.length; i += 3) { C[i] *= c[0] * k; C[i + 1] *= c[1] * k; C[i + 2] *= c[2] * k; } return mesh; }

export const pierRiot = { id: 'pier-riot', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default pierRiot;
