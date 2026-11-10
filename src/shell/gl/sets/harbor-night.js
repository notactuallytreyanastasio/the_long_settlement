// SET: harbor-night. Vessery harbour on the night of the Festival of Lots: the stone quay head where the
// ferry pier begins, a great festival lantern on its mast, the lane ferry dressed overall, and a basin full
// of paper lights set afloat for the islands that no longer answer.
// Chapter 1: prologue (ch1.pro.08-19, Ren counting from above), the march (ch1.s3.c13-23), the quiet after
// the shot (ch1.s5.c10-28) and Cast Off (ch1.s7: the crowd on both sides of the pier, every one with a light).
//
//   import { harborNight } from './sets/harbor-night.js';
//   const set = harborNight.build(GL, { light: 'night', low: false });   // 'night' (default) | 'predawn'
//
// The shape is lantern-stalls' (see ../index.js): scene, env, actors, foreground, cameras, frame, view, marks,
// lamps, setPower, update. Figures face +Z, cameras look toward -Z (the sea). The stage strip x -3.2..3.2,
// z 0..1.6 is kept clear. Added here:
//   setCrowd(0..1)        how many townsfolk have gathered (they arrive one by one). 'night' starts at 0.4,
//                         'predawn' at 1. The first to arrive stand along the pier, the rest fill the quay.
//   setMood(0..1)         0.25 a vigil, 1 a march (how much the crowd bobs and shoves)
//   setLantern(i, lit), lanternCount     one paper lantern on the strings
//   cue(lineId)           stage business keyed to script lines (the march fills the quay; Cast Off calms it)
//   marks.focus           the great lantern;  marks.gangway: where the ferry is boarded (on the pier)
// low: true drops the far town's glows, half the floating lights, a third of the crowd and one lantern string.

import * as GL0 from '../index.js';
import {
  m4, rng, DEG, rgb,
  merge, tint, place, plane, box, tube, curve, cylinder, sphere, setGlow,
  node, group, makeEnv, createScene, mergeStatic, createSprites, rayMesh, rayMaterial,
} from '../index.js';
import {
  PAL, COATS, kitMaterials, anchorAt, scatter, pickLight, setRig, paperLantern, lanternString, lanternLines, crowd, bunting,
  crate, barrel, sack, bollard, ropeCoil, boat, lighthouse, lampPost, pole, headland, cloudBank, quayEdge, cobble, rock,
  pier, ferry, gangway, townBank, floatLight,
} from './kit.js';

const QUAY_Z = -5.2, WATER = -0.5;
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
const dirFrom = (azDeg, elDeg) => [Math.sin(azDeg * DEG) * Math.cos(elDeg * DEG), Math.sin(elDeg * DEG), -Math.cos(azDeg * DEG) * Math.cos(elDeg * DEG)]; // az 0 = straight out to sea, + = right

// ------------------------------------------------------------------------------------ light states

const LIGHTS = {
  night: {
    preset: 'night', power: 1.25, unlit: 0.42, glow: 0.7, crowd: 0.4, mood: 0.3,
    env: {
      key: { dir: dirFrom(-30, 40), color: '#7f9ef0' },
      shadow: { tint: '#2f44a8', lift: 0.12, saturate: 1.25 },
      ambient: { sky: '#3f5fd0', ground: '#2a3a92', amount: 0.17 },
      fog: { density: 0.0036, start: 18, max: 0.86 },
      sky: { zenith: '#0b176c', mid: '#1c3fb0', midAt: 0.42, horizon: '#4f82e6', below: '#3058c4', sunDir: dirFrom(13, 21), moon: 0.72, stars: 1, sun: { size: 2.3 } },
      water: { deep: '#122a88', mid: '#1e45ae', shallow: '#3478d6', glint: '#ffd9a0', glintDensity: 0.2 },
    },
    cloud: { color: '#8fa6ea', shadowTint: '#3a50aa' }, ray: 0.46, beam: 0.24, rings: '#bcd4ff',
  },
  // an hour before the ferry: the sky has let go of black and there is a blush along the sea, but every lamp is still lit
  predawn: {
    preset: 'night', power: 1.1, unlit: 0.5, glow: 0.6, crowd: 1, mood: 0.22,
    env: {
      key: { dir: dirFrom(-36, 30), color: '#a3b2f6' },
      shadow: { tint: '#4350b8', lift: 0.13, saturate: 1.25 },
      ambient: { sky: '#7f86ea', ground: '#4a4cae', amount: 0.2 },
      rim: { color: '#ffc8b4', amount: 0.7, edge: 0.76 },
      fog: { color: '#e79ab0', density: 0.0034, start: 18, max: 0.8 },
      sky: { zenith: '#16207e', mid: '#4b55c8', midAt: 0.34, horizon: '#ff9f9a', below: '#8a6fd0', glow: '#ffd08a', glowAmount: 0.75, sunDir: dirFrom(-22, 27), moon: 0.5, stars: 0.45, sun: { size: 2.0, haloAmount: 0.2 } },
      water: { deep: '#1d2f92', mid: '#4a5cc4', shallow: '#f09aa8', foam: '#ffd9d4', glint: '#ffd0a8', glintDensity: 0.26 },
    },
    cloud: { color: '#f2a8b8', shadowTint: '#5a55b8' }, ray: 0.36, beam: 0.16, rings: '#ffd9e0',
  },
};

// ------------------------------------------------------------------------------------ cameras and marks

const CAMERAS = {
  wide: { target: [0.05, 1.6, -0.4], dist: 8.2, yaw: 2, pitch: 5, fov: 44, aspect: 0.46, shadowCenter: [0, 0, -1.2], shadowRadius: 8 },
  two: { target: [0, 1.12, 0.6], dist: 6.0, yaw: -15, pitch: 5, fov: 31, aspect: 0.46, shadowCenter: [0, 0, 0.3], shadowRadius: 3.6 },
  close: { target: [0.02, 0.86, 0.8], dist: 3.9, yaw: 21, pitch: 3, fov: 28, aspect: 0.46, shadowCenter: [0, 0, 0.5], shadowRadius: 2.6 },
  low: { target: [0.0, 1.85, 0.2], dist: 6.2, yaw: 6, pitch: -12, fov: 56, aspect: 0.46, shadowCenter: [0, 0, -1], shadowRadius: 8 },
  stage: { target: [0, 1.02, 0.5], dist: 9.4, yaw: -13, pitch: 7, fov: 24, aspect: 1.95, shadowCenter: [0, 0, -0.5], shadowRadius: 7.5, outline: 0.7 },
  landscape: { target: [0, 1.8, -1.2], dist: 10.5, yaw: 3, pitch: 5, fov: 40, aspect: 1.6, shadowCenter: [0, 0, -1.5], shadowRadius: 10.5 },
};

const MARKS = {
  a: { pos: [-0.8, 0, 0.55], face: 14 }, b: { pos: [0.02, 0, 0.8], face: 0 }, c: { pos: [0.82, 0, 0.55], face: -14 },
  two: [{ pos: [-0.42, 0, 0.62], face: 24 }, { pos: [0.42, 0, 0.62], face: -24 }],
  party: [{ pos: [-1.05, 0, 0.75], face: 78 }, { pos: [-1.85, 0, 1.15], face: 72 }, { pos: [-2.5, 0, 0.5], face: 80 }],
  opposition: [{ pos: [1.05, 0, 0.75], face: -78 }, { pos: [1.85, 0, 1.15], face: -72 }, { pos: [2.55, 0, 0.5], face: -80 }],
};

// what the script asks this set to do, by line id
const CUES = {
  'ch1.pro.08': { crowd: 0.4, mood: 0.3 },
  'ch1.s3.c13': { crowd: 1, mood: 1 }, 'ch1.s3.c15': { crowd: 1, mood: 0.8 },
  'ch1.s5.c10': { crowd: 0.12, mood: 0.15 },
  'ch1.s7.c01': { crowd: 1, mood: 0.22 }, 'ch1.s7.c04': { crowd: 1, mood: 0.6 }, 'ch1.s7.c06': { crowd: 1, mood: 0.7 }, 'ch1.s7.c08': { crowd: 1, mood: 0.25 },
};

// ------------------------------------------------------------------------------------ build

function build(engine = GL0, { light, low = false } = {}) {
  const picked = pickLight('harbor-night', LIGHTS, light), L = picked.L; light = picked.name;
  const M = kitMaterials(), r = rng(9191);
  const PIER_X = -0.9, PIER_W = 2.4, PIER_LEN = 16.5;
  const FERRY = [2.75, WATER, -14.2], FERRY_YAW = 184, BOAT = [-4.3, WATER + 0.02, -8.2];
  const GREAT = [-2.25, 0, -2.3], POLE_R = [2.55, 0, -3.1], POLE_L = [-5.6, 0, -4.2];

  // ---- near statics (cast shadows on the stage), mid statics (do not), ground
  const near = group('near'), mid = group('mid'), ground = group('ground');
  ground.add(node('ground', tint(place(plane(90, 22, 1, 1), 0, 0, QUAY_Z + 0.3 + 11), '#e6d2a6'), M.ground));
  ground.add(node('quay', quayEdge({ len: low ? 22 : 30, drop: 1.7, seed: 6 }), M.ground, { pos: [0, 0, QUAY_Z] }));
  for (const sx of [-1, 1]) ground.add(node('quay-far', tint(place(box(32, 1.9, 0.5), sx * (low ? 27 : 31), -0.95, QUAY_Z + 0.3), PAL.stone2), M.ground));
  ground.traverse((n) => { n.castShadow = false; });

  // the great festival lantern hangs from a crooked mast over the left of the stage
  const greatPole = merge(
    tint(tube(curve([[0, 0.1, 0], [0.06, 2.2, 0], [-0.05, 4.2, 0], [0.25, 4.75, 0], [0.85, 4.8, 0], [1.1, 4.55, 0]], 16), (t) => 0.1 - 0.05 * t, 7, { crease: 180 }), PAL.woodDark),
    tint(place(cylinder(0.24, 0.2, 0.3, 8), 0, 0, 0), PAL.stone2), tint(place(sphere(0.09, 8, 6), 1.1, 4.5, 0), PAL.gold));
  near.add(node('great-pole', greatPole, M.prop, { pos: GREAT }));
  const greatHook = [GREAT[0] + 1.1, 4.42, GREAT[2]], greatTop = [GREAT[0] + 0.25, 4.75, GREAT[2]];
  const poleR = pole({ h: 4.7, seed: 6, knob: PAL.coral }), poleL = pole({ h: 4.2, seed: 3 });
  near.add(node('poleR', poleR, M.prop, { pos: POLE_R }), node('poleL', poleL, M.prop, { pos: POLE_L }));
  const posts = [{ pos: [PIER_X - PIER_W / 2 - 0.75, 0, QUAY_Z + 0.55], yaw: 0 }, { pos: [PIER_X + PIER_W / 2 + 0.75, 0, QUAY_Z + 0.55], yaw: 180 }].map((p) => { const m = lampPost({ h: 2.8, arm: 0.55 }); near.add(node('post', m, M.prop, { pos: p.pos, rot: [0, p.yaw, 0] })); return { ...p, mesh: m }; });
  near.add(node('bollard1', bollard({ s: 1.15 }), M.prop, { pos: [2.3, 0, QUAY_Z + 0.6] }), node('bollard2', bollard({ s: 1.15 }), M.prop, { pos: [-4.4, 0, QUAY_Z + 0.6] }));
  const clutter = [
    [crate({ s: 0.58, seed: 1 }), [-3.7, 0, -0.5], 14], [crate({ s: 0.46, seed: 2, color: PAL.wood2 }), [-3.68, 0.59, -0.55], -12], [barrel({}), [-4.35, 0, -1.3], 0],
    [barrel({ r: 0.3, h: 0.74 }), [3.75, 0, -0.9], 0], [sack({ seed: 2 }), [3.5, 0, -0.3], 30], [crate({ s: 0.5, seed: 4 }), [4.4, 0, -0.5], 24], [ropeCoil({}), [1.7, 0, QUAY_Z + 0.95], 0],
  ];
  clutter.forEach(([m, p, yaw], i) => near.add(node('clutter' + i, m, M.prop, { pos: p, rot: [0, yaw, 0] })));
  // paper lights waiting on the quay edge to be set afloat
  for (const [x, z, c] of [[-3.3, QUAY_Z + 0.75, 1], [-3.0, QUAY_Z + 0.5, 3], [3.2, QUAY_Z + 0.7, 5], [1.25, QUAY_Z + 0.5, 0]]) near.add(node('waiting', tint2(floatLight({ s: 1.1 }), PAL.lanterns[c]), M.lantern, { pos: [x, 0.03, z], rot: [0, x * 40, 0] }));

  // the pier, the ferry alongside it, the way aboard
  const pierMesh = pier({ len: PIER_LEN, w: PIER_W, drop: 0.6, seed: 4 });
  mid.add(node('pier', pierMesh, M.prop, { pos: [PIER_X, 0, QUAY_Z + 0.25] }));
  const ferryMesh = ferry({ len: 11, seed: 2 });
  mid.add(node('ferry', ferryMesh, M.prop, { pos: FERRY, rot: [0, FERRY_YAW, 0] }));
  const fA = (name) => anchorAt(ferryMesh, name, FERRY, FERRY_YAW);
  const gate = fA('gate'), gx = PIER_X + PIER_W / 2 - 0.15;
  mid.add(node('gangway', gangway({ len: Math.max(0.6, gate[0] - gx), w: 0.85, rise: gate[1] }), M.prop, { pos: [gx, 0, gate[2]], rot: [0, -90, 0] }));
  for (const z of [-9.5, -18.6]) mid.add(node('hawser', tint(tube(curve([[PIER_X + PIER_W / 2 + 0.06, 0.5, z], [PIER_X + PIER_W / 2 + 0.3, 0.1, z - 0.1], [FERRY[0] - 1.5, WATER + 0.8, z - (z < -14 ? -0.8 : 0.8)]], 8), 0.028, 5, { crease: 180 }), PAL.rope), M.prop));
  for (const [x, z, s, seed] of [[-9.5, -17, 1.4, 3], [-11, -16.2, 0.9, 5], [11.5, -22, 1.8, 8]]) mid.add(node('rock', rock({ seed, s }), M.prop, { pos: [x, WATER - 0.05, z] }));
  mid.traverse((n) => { n.castShadow = false; });

  // strings: from the great mast across the quay and out to the ferry's masthead, and the ferry dressed overall
  const mast = fA('mast'), topR = anchorAt(poleR, 'top', POLE_R), topL = anchorAt(poleL, 'top', POLE_L);
  const strings = [], wires = [];
  const addString = (a, b, opts, cols) => { const s = lanternString(a, b, opts); wires.push(s.wire); strings.push({ ...s, cols }); return s; };
  addString(greatTop, topR, { sag: 1.0, count: 7, ends: 0.1 }, [0, 2, 1, 0, 3, 2, 5]);
  addString(topR, mast, { sag: 1.7, count: low ? 6 : 9, ends: 0.08 }, [2, 0, 5, 1, 0, 2, 3, 0, 1]);
  addString(mast, fA('bow'), { sag: 0.5, count: 4, ends: 0.14 }, [1, 4, 2, 0]);
  addString(mast, fA('stern'), { sag: 0.5, count: 4, ends: 0.14 }, [3, 0, 5, 2]);
  if (!low) addString(topL, greatTop, { sag: 0.8, count: 5, ends: 0.12 }, [5, 1, 0, 3, 2]);
  near.add(node('wires', merge(wires), M.flat));
  if (!low) near.add(node('bunting', bunting(topL, [-9.5, 3.4, -3.2], { sag: 0.5, count: 9, seed: 3 }), M.prop), node('bunting2', bunting(topR, [7.5, 3.6, -2.6], { sag: 0.6, count: 10, seed: 5 }), M.prop));

  // far: the lighthouse on its headland, and the town climbing the far arm of the bay
  const far = group('far');
  const HEAD = [-50, -0.6, -128], LH = [-9.4, 0, -122];
  const headMesh = headland({ w: 96, d: 34, h: 9, seed: 3, grass: '#3f9a78' });
  far.add(node('headland', headMesh, M.far, { pos: HEAD }));
  { let top = 0; const Pm = headMesh.positions; for (let i = 0; i < Pm.length; i += 3) if (Math.hypot(Pm[i] + HEAD[0] - LH[0], Pm[i + 2] + HEAD[2] - LH[2]) < 5 && Pm[i + 1] > top) top = Pm[i + 1]; LH[1] = HEAD[1] + top - 0.8; }
  const lh = lighthouse({ h: 13, r: 2.3 });
  far.add(node('lighthouse', lh, M.far, { pos: LH }));
  const TOWN = [27, WATER, -78], TOWN_YAW = -14;
  const town = townBank({ w: 46, d: 18, h: 13, rows: 4, seed: 5, lit: 0.8 });
  far.add(node('town', town, M.far, { pos: TOWN, rot: [0, TOWN_YAW, 0] }));
  far.add(node('town-foot', tint(place(box(52, 2.4, 3), 0, -0.6, 1.2), PAL.stoneDark), M.far, { pos: TOWN, rot: [0, TOWN_YAW, 0] }));
  if (!low) far.add(node('sailboat', boat({ len: 3.4, hull: PAL.cream, keel: PAL.teal, pennant: PAL.red, seed: 3 }), M.far, { pos: [-7.5, WATER, -34], rot: [0, 115, 0] }));

  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  if (env.sky.sunDir) env.sky.sunDir = norm(env.sky.sunDir);
  env.water.level = WATER;
  env.water.shores = [[0, QUAY_Z + 0.1 + 900, 900, 0.75], [FERRY[0], FERRY[2] + 2.6, 2.2, 0.6], [FERRY[0], FERRY[2] - 2.6, 2.2, 0.6], [BOAT[0], BOAT[2], 0.95, 0.5], [-9.5, -17, 1.2, 0.6], [11.5, -22, 1.5, 0.7], [-50, -128, 46, 1.6], [TOWN[0], TOWN[2] + 3, 24, 1.4]];
  scene.root.add(mergeStatic(ground, 'ground'), mergeStatic(near, 'near'), mergeStatic(mid, 'mid'), mergeStatic(far, 'far'));

  // ---- cobbles: one instanced draw
  const cob = node('cobbles', cobble(), M.flat); cob.castShadow = false;
  const cobCols = ['#f6e4c0', '#dcc698', '#f0d9ae', '#d8c092', '#ecd2a6'];
  scatter(cob, low ? 260 : 440, (i) => {
    const col = i % 20, row = Math.floor(i / 20), x = -6.4 + col * 0.66 + (row % 2) * 0.33 + (r() - 0.5) * 0.16, z = QUAY_Z + 0.95 + row * (low ? 0.62 : 0.4) + (r() - 0.5) * 0.12;
    if (r() < 0.4) return null;
    const sc = 0.2 + r() * 0.09; return { m: m4.trs(x, 0.002, z, 0, r() * 360, 0, sc * 1.25, 1, sc * 0.9), color: cobCols[Math.floor(r() * cobCols.length)] };
  });
  scene.root.add(cob);

  // ---- foreground clutter
  const fg = group('fg');
  fg.add(node('fg1', crate({ s: 0.55, seed: 21 }), M.prop, { pos: [-1.6, 0, 2.95], rot: [0, 20, 0] }), node('fg2', bollard({ s: 1.2 }), M.prop, { pos: [1.75, 0, 2.9] }), node('fg3', ropeCoil({ r: 0.24 }), M.prop, { pos: [1.15, 0, 2.6] }), node('fg4', sack({ seed: 4, s: 0.3 }), M.prop, { pos: [-2.2, 0, 2.6], rot: [0, -30, 0] }));
  const foreground = mergeStatic(fg, 'foreground');
  scene.root.add(foreground);

  // ---- a small boat on the left of the pier, bobbing
  const boatNode = node('boat', boat({ len: 3.1, hull: PAL.cream, keel: PAL.red, pennant: PAL.yellow, seed: 1 }), M.prop, { pos: BOAT, rot: [0, 70, 0] });
  boatNode.castShadow = false; scene.root.add(boatNode);

  // ---- sprites first: everything below adds glows to them
  const sprites = scene.sprites = createSprites(512);

  // ---- paper lanterns on the strings, and the great lantern
  const lines = lanternLines({ strings, material: M.lantern, sprites, shapes: low ? 1 : 2, seg: low ? 7 : 8, seed: 7 });
  scene.root.add(...lines.nodes);
  const greatMesh = paperLantern({ r: 0.46, shape: 'round', seg: 16, cord: 0.14 });
  const great = node('great-lantern', greatMesh, M.lantern, { pos: greatHook }); great.castShadow = false; great.tint.set([1.0, 0.72, 0.3, 1]);
  scene.root.add(great);
  const greatLen = -greatMesh.anchors.centre[1], FOCUS = [greatHook[0], greatHook[1] - greatLen, greatHook[2]];

  // ---- the crowd: along the pier first, then the quay either side of the stage
  const spots = [];
  { const pierSide = [], quaySide = [];
    for (let i = 0; i < 9; i++) for (const sx of [-1, 1]) pierSide.push({ pos: [PIER_X + sx * (PIER_W / 2 - 0.32 - r() * 0.12), 0, QUAY_Z - 0.9 - i * 1.25 - (sx > 0 ? 0.55 : 0) - r() * 0.3], face: sx > 0 ? -38 - r() * 30 : 38 + r() * 30 });
    for (let i = 0; i < 26; i++) { const sx = i % 2 ? 1 : -1, col = Math.floor(i / 2) % 4, row = Math.floor(i / 8); quaySide.push({ pos: [sx * (2.15 + col * 0.72 + r() * 0.3) + (sx < 0 ? -1.2 : 0.1), 0, -1.75 - row * 0.8 - r() * 0.35], face: -sx * (20 + r() * 30) }); }
    // interleave, so a thin crowd is thin everywhere
    for (let i = 0; i < Math.max(pierSide.length, quaySide.length); i++) { if (i < pierSide.length) spots.push(pierSide[i]); if (i < quaySide.length) spots.push(quaySide[i]); }
  }
  const folk = crowd({ spots: low ? spots.filter((_, i) => i % 3 !== 2) : spots, material: M.prop, sprites, seed: 11, amount: L.crowd, glow: '#ffc060' });
  scene.root.add(folk.node);

  // ---- lamps: six fixed point lights
  const postLamps = posts.map((p) => anchorAt(p.mesh, 'lamp', p.pos, p.yaw));
  const lamps = [
    { name: 'great', pos: [FOCUS[0], FOCUS[1], FOCUS[2]], color: '#ffb85a', radius: 7.6, base: 1.15 },
    { name: 'post-left', pos: postLamps[0], color: '#ffc870', radius: 5.0, base: 1 },
    { name: 'post-right', pos: postLamps[1], color: '#ffc870', radius: 5.0, base: 1 },
    { name: 'crowd-left', pos: [-3.6, 1.5, -2.6], color: '#ffb060', radius: 3.6, base: 0.8 },
    { name: 'crowd-right', pos: [3.4, 1.5, -2.6], color: '#ffb060', radius: 3.6, base: 0.8 },
    { name: 'pier', pos: [PIER_X, 1.6, -9.5], color: '#ffc46a', radius: 5.0, base: 0.9 },
  ];
  env.points = lamps.map((l) => ({ pos: l.pos, color: rgb(l.color), radius: l.radius, intensity: l.base * L.power }));

  // ---- glows
  const greatGlow = sprites.add({ kind: 'glow', pos: FOCUS, size: 2.7, color: '#ffa040', alpha: 0 });
  const lampGlows = postLamps.map((p) => sprites.add({ kind: 'glow', pos: p, size: 1.8, color: '#ffb450', alpha: 0 }));
  const laneLamp = fA('lamp'), laneGlow = sprites.add({ kind: 'glow', pos: laneLamp, size: 3.4, color: '#ffe9a0', alpha: 0 });
  const winGlows = [];
  if (!low) anchorAt(town, 'windows', TOWN, TOWN_YAW).slice(0, 22).forEach((p) => winGlows.push(sprites.add({ kind: 'glow', pos: p, size: 3.2, color: '#ffc060', alpha: 0 })));
  fA('windows').forEach((p) => winGlows.push(sprites.add({ kind: 'glow', pos: p, size: 0.8, color: '#ffc060', alpha: 0 })));
  const lhLamp = anchorAt(lh, 'lamp', LH), lhGlow = sprites.add({ kind: 'glow', pos: lhLamp, size: 15, color: '#ffe08a', alpha: 0 });

  // ---- the lights on the water: one instanced draw of bare paper boxes, the nearest few with a halo
  const floats = [], floatNode = node('floats', floatLight({ detail: 0 }), M.speck);
  scatter(floatNode, low ? 170 : 360, (i) => {
    const u = r(), z = QUAY_Z - 1.2 - u * u * 74, x = (r() - 0.5) * (22 + (QUAY_Z - z) * 1.3), col = PAL.lanterns[i % PAL.lanterns.length];
    if (x > PIER_X - PIER_W / 2 - 0.5 && x < PIER_X + PIER_W / 2 + 0.5 && z > QUAY_Z - PIER_LEN - 0.5) return null;
    if (Math.abs(x - FERRY[0]) < 2.5 && Math.abs(z - FERRY[2]) < 6.4) return null;
    if (Math.hypot(x - BOAT[0], z - BOAT[2]) < 2.0) return null;
    const s = 1 + (QUAY_Z - z) * 0.035; // far ones are drawn larger, or they are less than a pixel
    if (floats.length < (low ? 26 : 54) && z > -30) floats.push({ glow: sprites.add({ kind: 'glow', pos: [x, WATER + 0.2, z], size: 0.8 * s, color: col, alpha: 0 }), ph: r() * 6.283 });
    return { m: m4.trs(x, WATER, z, 0, r() * 360, 0, s), color: col };
  });
  scene.root.add(floatNode);

  // ---- light shafts: under the great lantern and the two quay lamps (one mesh), and the lighthouse beam
  const shafts = [];
  { const cones = merge(tint(place(rayMesh(2.6, 0.32, 2.0, 16), FOCUS[0], FOCUS[1] - 0.25, FOCUS[2]), '#ffb050'), ...postLamps.map((p) => tint(place(rayMesh(2.2, 0.1, 1.25, 12), p[0], p[1], p[2]), '#ffc060')));
    const s1 = node('lamp-shafts', cones, rayMaterial({ power: 1.5, near: L.ray, far: 0 })); scene.root.add(s1); shafts.push(s1); }
  const beam = group('lh-beam', { pos: lhLamp });
  { const one = () => tint(rayMesh(70, 0.6, 7, 14), '#ffe9a0'); beam.add(node('beams', merge(place(one(), 0, 0, 0, 0, 0, 84), place(one(), 0, 0, 0, 0, 0, -84)), rayMaterial({ power: 1.3, near: L.beam, far: 0 }))); }
  scene.root.add(beam);

  const clouds = cloudBank({ count: low ? 6 : 9, seed: 11, arc: [158, 204], radius: [250, 430], height: [18, 130], size: [0.7, 1.5], speed: 0.05, ...L.cloud });
  scene.root.add(clouds.node);

  const actors = group('actors'); scene.root.add(actors);

  // ---- per-frame state (allocation-free)
  let power = 1, mood = L.mood, moodNow = L.mood;
  const P = [0, 0, 0], V = [0, 0, 0], rnd = rng(77);
  let nextSpark = 0, nextEmber = 0, nextGust = 1.2, nextRing = 0.8, lastT = -1;

  const setPower = (p) => { power = Math.max(0, Math.min(1.5, p)); };
  const setCrowd = (a) => folk.setAmount(a);
  const setMood = (m) => { mood = Math.max(0, Math.min(1, m)); };
  function cue(lineId) { const c = CUES[lineId]; if (!c) return false; if (c.crowd != null) setCrowd(c.crowd); if (c.mood != null) setMood(c.mood); return true; }

  function update(time, dt = 0) {
    const pw = L.power * power, on = Math.min(1, pw);
    lines.update(time, { on, pw, unlit: L.unlit, glow: L.glow });
    moodNow += (mood - moodNow) * Math.min(1, dt * 2 + (dt === 0 ? 1 : 0));
    folk.update(time, dt, { lit: pw, lively: moodNow });
    // the great lantern swings slowly; its light and glow go with it
    const bz = Math.sin(time * 0.8) * 3.2 * DEG, bx = Math.sin(time * 0.63 + 1) * 2.4 * DEG, flick = 0.93 + 0.07 * Math.sin(time * 11.3) * Math.sin(time * 6.1);
    GL0.quat.fromEuler(great.rotation, bx, 0, bz);
    const bp = lamps[0].pos; bp[0] = greatHook[0] + Math.sin(bz) * greatLen; bp[1] = greatHook[1] - Math.cos(bz) * greatLen; bp[2] = greatHook[2] - Math.sin(bx) * greatLen;
    greatGlow.pos[0] = bp[0]; greatGlow.pos[1] = bp[1]; greatGlow.pos[2] = bp[2]; greatGlow.alpha = L.glow * Math.min(1.2, pw) * flick; greatGlow.size[0] = greatGlow.size[1] = 2.7 * (0.96 + 0.04 * flick);
    great.tint[0] = L.unlit + (1 - L.unlit) * on; great.tint[1] = L.unlit * 0.72 * (1 - on) + 0.72 * on; great.tint[2] = (L.unlit * 0.34 + 0.2) * (1 - on) + 0.3 * on;
    for (let i = 0; i < lamps.length; i++) env.points[i].intensity = lamps[i].base * pw * (i === 0 ? flick : 0.95 + 0.05 * Math.sin(time * 8.3 + i * 2.1)) * (i === 3 || i === 4 ? 0.35 + 0.65 * folk.amount : 1);
    for (let i = 0; i < lampGlows.length; i++) lampGlows[i].alpha = 0.55 * Math.min(1.2, pw);
    laneGlow.alpha = 0.5 + 0.08 * Math.sin(time * 2.3);
    for (let i = 0; i < winGlows.length; i++) winGlows[i].alpha = 0.4;
    for (let i = 0; i < shafts.length; i++) shafts[i].visible = pw > 0.05;
    beam.setRot(0, time * 22, 0);
    lhGlow.alpha = 0.3 + 0.3 * Math.pow(Math.abs(Math.cos(time * 22 * DEG)), 6);
    for (let i = 0; i < floats.length; i++) floats[i].glow.alpha = 0.55 + 0.2 * Math.sin(time * 2.1 + floats[i].ph);
    boatNode.position[1] = BOAT[1] + Math.sin(time * 1.3) * 0.04;
    boatNode.setRot(Math.sin(time * 1.1) * 2.5, 70 + Math.sin(time * 0.3) * 3, Math.sin(time * 1.6 + 1) * 4);
    clouds.update(time);

    if (lastT >= 0 && time - lastT < 0.5 && dt > 0) {
      if (pw > 0.05 && time > nextSpark) { nextSpark = time + 0.16; const l = lines.list[Math.floor(rnd() * lines.list.length)]; if (l.lit > 0.5) sprites.sparkle(l.glow.pos, { count: 1, size: 0.16, spread: 0.5, life: 0.9, color: '#fff0b0' }); }
      if (time > nextEmber) { // warm motes rising off the crowd's lights
        nextEmber = time + 0.3; P[0] = -4 + rnd() * 8; P[1] = 0.4 + rnd() * 2.6; P[2] = -5 + rnd() * 6; V[0] = 0.1 + rnd() * 0.1; V[1] = 0.12 + rnd() * 0.16; V[2] = 0.04;
        sprites.spawn({ kind: 'glow', pos: P, vel: V, size: 0.1 + rnd() * 0.08, life: 4.5, color: '#ffd070', alpha: 0.9 });
      }
      if (time > nextGust) { nextGust = time + 2.6 + rnd() * 1.5; P[0] = -4 + rnd() * 3; P[1] = 2.6 + rnd() * 2.6; P[2] = -6 + rnd() * 5; V[0] = 2.0; V[1] = 0.1; V[2] = 0.25; sprites.gust(P, { vel: V, size: 0.9 + rnd() * 0.5, life: 2.2, alpha: 0.8, color: '#c6d6ff' }); }
      if (time > nextRing) { nextRing = time + 1.5; P[0] = -8 + rnd() * 16; P[1] = WATER + 0.03; P[2] = QUAY_Z - 1.2 - rnd() * 7; if (Math.abs(P[0] - PIER_X) > PIER_W / 2 + 0.4) sprites.splash(P, { size: 0.9 + rnd() * 0.6, life: 1.4, spray: 0, color: L.rings }); }
      sprites.update(dt);
    }
    lastT = time;
  }

  const rig = setRig('harbor-night', CAMERAS, env);
  update(0, 0);
  return {
    id: 'harbor-night', light, low, scene, env, actors, foreground,
    cameras: CAMERAS, frame: rig.frame, view: rig.view,
    marks: { ...MARKS, focus: FOCUS, gangway: { pos: [gx - 0.6, 0, gate[2]], face: 90 } },
    lamps, setPower, setCrowd, setMood, cue, setLantern: lines.setLit, lanternCount: lines.count,
    update,
  };
}

// colour a mesh but keep its dark parts dark (multiplies)
function tint2(mesh, color) { const c = rgb(color), C = mesh.colors; for (let i = 0; i < C.length; i += 3) { C[i] *= c[0]; C[i + 1] *= c[1]; C[i + 2] *= c[2]; } return mesh; }

export const harborNight = { id: 'harbor-night', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default harborNight;
