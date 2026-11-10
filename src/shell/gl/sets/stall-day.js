// SET: stall-day. The lantern market of chapter 1 on an ordinary afternoon: the same lane, the same two crooked houses,
// the quay and the lighthouse, and no festival. "By day the stall was a trestle, a paste pot, and forty frames with no
// paper on them." The sun stands low over the water behind the front wire and comes through the paper.
// Chapter 7: ch7.s1 (Ren delivers Wyn's letter; Nan letters Little Brand and hangs Tessaly beside it, and keeps both).
//
//   import { stallDay } from './sets/stall-day.js';
//   const set = stallDay.build(GL, { light: 'afternoon', low: false });
//
// The shape is lantern-stalls' (see ../index.js). Figures face +Z, cameras look toward -Z, out to sea and into the sun.
// The strip x -3.4..3.4, z -0.1..1.6 is clear. Added here:
//   setNames(n)         1: Tessaly hangs alone on the short wire over the trestle;  2: and Little Brand beside it (ch7.s1.c26 on)
//   setPapered(0..1)    how many of the bare frames on the back wire have been papered (the scene's work: "hold that frame")
//   cue(lineId)         ch7.s1.c26 on: both names
//   task(type)          -> { pos, set(v) }: the papering, for the encounter that helps at the stall
//   marks.work          Nan's end of the trestle;  marks.short  one trestle short (where the Tribune stops, ch7.s1.c22);
//   marks.wire[2]       under the names, for holding the paper flat;  marks.focus  the Tessaly lantern;  marks.pot  the paste pot
// One light state, 'afternoon'. Nothing is lit: every glow is the sun through paper, and setPower turns that up and down.
// low: true drops the two outer houses and stalls, the far shore and half the paving, and hangs one shape of lantern.

import { m4, quat, rng, DEG, rgb } from '../math.js';
import { merge, tint, place, plane, box, tube, curve, cylinder, setGlow, setOutline } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic, makeInstances } from '../scene.js';
import { createSprites } from '../sprites.js';
import { rayMaterial } from '../fx.js';
import {
  PAL, kitMaterials, anchorAt, scatter, pickLight, stall, paperLantern, lanternString, lanternLines, bunting, crate, barrel, sack, bollard, ropeCoil,
  house, lighthouse, lampPost, wonk, pole, headland, cloudBank, gull, cobble, rock, bush,
} from './kit.js';
import { C7, STD_MARKS, STD_CAMERAS, shell7, sunShafts, dirFrom, norm7, trestle, basket, skiff, quay7, lanternFrame, pastePot, paperStack, bar } from './kit-ch7.js';

const QUAY_Z = -7.6, WATER = -0.5;

const LIGHTS = {
  afternoon: {
    preset: 'day', power: 0.55, sun: 0.4,
    env: {
      key: { dir: dirFrom(-17, 27), color: '#fff0cc' },
      shadow: { tint: '#7f86ea', lift: 0.08, saturate: 1.4 },
      ambient: { sky: '#bfe0ff', ground: '#ffd9a0', amount: 0.14 },
      rim: { color: '#fff0b0', amount: 0.9, edge: 0.72 },
      fog: { color: '#ffe9c0', density: 0.003, start: 20, max: 0.82 },
      sky: { zenith: '#1f5fd6', mid: '#5aaef4', midAt: 0.46, horizon: '#ffe6a4', below: '#ffd9a0', glow: '#fff2b8', glowAmount: 0.45, sunDir: dirFrom(1.6, 12.6), sun: { color: '#fffdf0', size: 2.3, halo: '#ffe08a', haloAmount: 0.3 } },
      water: { deep: '#1f78d6', mid: '#34aee6', shallow: '#7fe8dc', foam: '#ffffff', glint: '#fff2b0', glintDensity: 0.34 },
    },
    cloud: { color: '#fff6e4', shadowTint: '#b9b4f0' },
  },
};

const CAMERAS = STD_CAMERAS({
  wide: { target: [0.1, 1.6, -0.4], dist: 8.2, yaw: 3, pitch: 5, fov: 44 },
  low: { target: [0.1, 1.8, 0.2], dist: 6.4, yaw: -7, pitch: -11, fov: 56 },
  stage: { yaw: -11 },
});

/** One of the two names: a big paper lantern with a hand's worth of brush strokes across its face. White paper; tint the node. */
function nameLantern(strokes, seed) {
  const r = rng(seed), R0 = 0.3, m = paperLantern({ r: R0, shape: 'round', seg: 12, cord: 0.12 }), cy = m.anchors.centre[1], parts = [];
  strokes.forEach((row, j) => {
    const y = cy + 0.1 - j * 0.2, n = row.length;
    row.forEach((h, i) => {
      const a = (-34 + (68 * (i + 0.5)) / n) * DEG, rr = R0 * (0.5 + 0.5 * Math.pow(Math.cos((y - cy) / (R0 * 0.95) * 1.2), 0.8)) + 0.012;
      parts.push(place(box(0.026 + r() * 0.012, 0.15 * h, 0.012), Math.sin(a) * rr, y + (r() - 0.5) * 0.02, Math.cos(a) * rr, 0, a / DEG, (r() - 0.5) * 24));
      if (r() < 0.55) parts.push(place(box(0.07, 0.024, 0.012), Math.sin(a) * rr, y + (r() - 0.3) * 0.08 * h, Math.cos(a) * rr, 0, a / DEG, (r() - 0.5) * 30));
    });
  });
  const ink = setOutline(setGlow(tint(merge(parts), [0.16, 0.14, 0.34]), 0), 0), out = merge(m, ink);
  out.anchors = m.anchors;
  return out;
}

/** A house for the edge of the band: a leaning box, a hipped roof, shuttered windows, a door. anchors as kit.js's house (eaveL, eaveR, ridge, chimney). */
function plainHouse({ w = 3, d = 2.6, h = 3, roofH = 1.7, wall = PAL.cream, roof = PAL.red, shutters = PAL.teal, seed = 1 } = {}) {
  const r = rng(seed * 31 + 5), parts = [tint(place(box(w, h, d), 0, h / 2, 0), wall), tint(place(box(w + 0.12, 0.5, d + 0.12), 0, 0.25, 0), PAL.stone2)];
  parts.push(tint(place(cylinder(Math.hypot(w, d) * 0.5 + 0.35, 0.3, roofH, 4), 0, h, 0, 0, 45, 0, w / d > 1 ? 1.1 : 1, 1, 1), roof));
  for (const fy of [0.34, 0.74]) for (const fx of [-0.26, 0.26]) {
    if (fy < 0.5 && fx > 0) { parts.push(tint(place(box(0.8, 1.5, 0.08), fx * w, 0.75, d / 2 + 0.03), shutters)); continue; }
    const x = fx * w, y = fy * h;
    parts.push(tint(place(box(0.6, 0.72, 0.06), x, y, d / 2 + 0.02), PAL.glassOff || '#5b7fe8'));
    for (const sx of [-1, 1]) parts.push(tint(place(box(0.26, 0.8, 0.07), x + sx * 0.44, y, d / 2 + 0.05, 0, sx * (8 + r() * 14), 0), shutters));
  }
  parts.push(tint(place(box(0.4, 0.9, 0.4), w * 0.24, h + roofH * 0.55, -d * 0.1), PAL.stone2));
  const m = wonk(merge(parts), { lean: (r() - 0.5) * 0.06, bulge: 0.08 });
  m.anchors = { eaveL: [-w / 2, h + 0.08, d / 2], eaveR: [w / 2, h + 0.08, d / 2], ridge: [0, h + roofH, 0], chimney: [w * 0.24, h + roofH * 0.55 + 0.9, -d * 0.1] };
  return m;
}

function build(engine = null, { light, low = false } = {}) {
  const picked = pickLight('stall-day', LIGHTS, light), L = picked.L; light = picked.name;
  const M = kitMaterials(), r = rng(7171), FAR = low ? M.farFlat : M.far;
  const NAN = { pos: [-2.75, 0, -2.25], yaw: 16 }, TABLE = [0.3, 0, -1.6], TABLE_YAW = -3, SHORT = [3.85, 0, -1.15];

  // ---- ground and quay
  const ground = group('ground');
  ground.add(node('floor', tint(place(plane(90, 24, 1, 1), 0, 0, QUAY_Z + 0.3 + 12), '#f6e2b0'), M.ground));
  ground.add(node('quay', quay7({ len: low ? 26 : 36, drop: 1.7, seed: 4 }), M.ground, { pos: [0, 0, QUAY_Z] }));
  for (const sx of [-1, 1]) ground.add(node('quay-far', tint(place(box(32, 1.9, 0.5), sx * (low ? 29 : 34), -0.95, QUAY_Z + 0.3), PAL.stone2), M.ground));
  ground.traverse((n) => { n.castShadow = false; });

  // ---- the lane: chapter 1's houses with their shutters to, Nan's stall, the pitches either side packed away
  const set = group('set'), sideL = group('set-left'), sideR = group('set-right'), sideOf = (x) => (x < -4.8 ? sideL : x > 4.8 ? sideR : set);
  const houseDefs = [
    { pos: [-3.95, 0, -5.0], yaw: 8, opts: { seed: 2, w: 3.4, d: 2.6, h: 3.3, roofH: 1.8, roof: '#ff8b3d', wall: PAL.cream, shutters: PAL.teal, sides: 'right', lit: 0 } },
    { pos: [4.15, 0, -5.3], yaw: -10, opts: { seed: 7, w: 3.2, d: 2.6, h: 3.9, roofH: 1.9, roof: '#35c9b5', wall: '#ffe6c4', shutters: PAL.coral, sides: 'left', lit: 0, floors: 3 } },
    { pos: [-7.9, 0, -4.4], yaw: 16, opts: { seed: 11, w: 3.0, d: 2.6, h: 2.7, roofH: 1.6, roof: '#f4573f', wall: '#fff6dc', shutters: PAL.blue, sides: 'none', lit: 0 } },
    { pos: [8.1, 0, -4.6], yaw: -14, opts: { seed: 15, w: 3.4, d: 2.6, h: 3.0, roofH: 1.7, roof: '#5b7fe8', wall: PAL.cream, shutters: PAL.yellow, sides: 'none', lit: 0 } },
  ].slice(0, low ? 2 : 4);
  // the two houses that frame the stage are kit.js's; the outer two are only ever seen at the band's edges, and are a tenth of the triangles
  const houses = houseDefs.map((d, i) => { const m = i < 2 ? house(d.opts) : plainHouse(d.opts); sideOf(d.pos[0]).add(node('house' + i, m, M.prop, { pos: d.pos, rot: [0, d.yaw, 0] })); return { ...d, mesh: m }; });
  const nanStall = stall({ seed: 3, goods: 'none', colors: [PAL.red, PAL.cream], lean: 0.07, sign: PAL.yellow });
  set.add(node('stall-nan', nanStall, M.prop, { pos: NAN.pos, rot: [0, NAN.yaw, 0] }));
  if (!low) {
    // the other pitches are struck: bare posts, the awning rolled and tied along the top rail
    for (const [x, z, yaw, c, g] of [[-6.0, -1.3, 30, PAL.yellow, sideL], [6.2, -1.6, -32, PAL.blue, sideR]]) g.add(node('pitch', merge(
      ...[-1, 1].map((sx) => tint(place(box(0.12, 2.0, 0.12), sx * 1.0, 1.0, 0, 0, 0, sx * 3), PAL.woodDark)), tint(place(box(2.3, 0.1, 0.1), 0, 1.95, 0), PAL.woodDark),
      tint(place(cylinder(0.16, 0.16, 2.1, 7), -1.05, 2.12, 0, 0, 0, -90), c), ...[-0.6, 0, 0.6].map((k) => tint(place(cylinder(0.175, 0.175, 0.07, 7), k - 0.03, 2.12, 0, 0, 0, -90), PAL.cream)),
      tint(place(box(2.2, 0.08, 0.9), 0, 0.85, 0), PAL.wood2), ...[-1, 1].map((sx) => tint(place(box(0.1, 0.85, 0.8), sx * 0.95, 0.42, 0), PAL.woodDark))), M.prop, { pos: [x, 0, z], rot: [0, yaw, 0] }));
    sideL.add(node('bush1', bush({ seed: 2, s: 1.3 }), M.prop, { pos: [-6.6, 0.1, -3.0] })); sideR.add(node('bush2', bush({ seed: 5, s: 1.1, color: PAL.leaf }), M.prop, { pos: [7.0, 0.1, -3.1] }));
  }

  // the work trestle, and what is on it
  const table = trestle({ w: 2.7, d: 0.9, h: 0.8, seed: 5 });
  set.add(node('trestle', table, M.prop, { pos: TABLE, rot: [0, TABLE_YAW, 0] }));
  const POT = [TABLE[0] - 0.55, 0.8, TABLE[2] + 0.12];
  const onTable = [
    place(pastePot({ s: 1.2 }), -0.55, 0.8, 0.12),
    place(paperStack({ n: 7, seed: 2 }), 0.25, 0.8, 0.1, 0, 12, 0), place(paperStack({ n: 4, seed: 5 }), 0.95, 0.8, -0.12, 0, -20, 0),
    place(lanternFrame({ r: 0.19, thick: 2.2, cord: 0.01 }), -1.02, 0.99, -0.05, 82, 30, 0), place(lanternFrame({ r: 0.17, shape: 'tall', thick: 2.2, cord: 0.01 }), 0.62, 0.97, -0.2, 90, -50, 0),
    tint(place(cylinder(0.05, 0.06, 0.14, 6), 1.12, 0.8, 0.22), '#ff7a8a'), tint(place(box(0.02, 0.22, 0.02), 1.12, 0.9, 0.22, 0, 0, 14), C7.woodDark), tint(place(box(0.02, 0.2, 0.02), 1.1, 0.9, 0.2, 10, 0, -12), C7.wood),
    tint(place(box(0.3, 0.02, 0.05), -0.12, 0.81, 0.3, 0, 24, 0), '#dfe8ff'),
  ];
  set.add(node('on-table', merge(onTable), M.prop, { pos: [TABLE[0], 0, TABLE[2]], rot: [0, TABLE_YAW, 0] }));
  // one trestle short: the next pitch, bare but for a crate
  set.add(node('trestle2', trestle({ w: 2.1, seed: 9 }), M.prop, { pos: SHORT, rot: [0, -20, 0] }));
  // frames stacked in creels, bundles of split cane, a stool, the stall's own clutter
  const stacked = [];
  for (let i = 0; i < 4; i++) stacked.push(place(lanternFrame({ r: 0.19, thick: 2.2, cord: 0.01, shape: i % 2 ? 'tall' : 'round' }), -1.55 + (i % 2) * 0.34, 0.5 + Math.floor(i / 2) * 0.27, -0.72 - (i % 2) * 0.1, 76 + i * 9, i * 50, 0));
  set.add(node('stacked', merge(stacked), M.flat));
  const cane = []; for (let i = 0; i < 9; i++) cane.push(bar([-0.9 + i * 0.03, 0.05 + (i % 3) * 0.035, -2.75], [0.5 + i * 0.04, 0.07 + (i % 3) * 0.035, -2.62 + (i % 2) * 0.06], 0.03, i % 3 ? C7.bamboo : '#e8a860'));
  set.add(node('cane', merge(cane, tint(place(box(0.08, 0.14, 0.2), -0.5, 0.1, -2.7), PAL.red), tint(place(box(0.08, 0.14, 0.2), 0.2, 0.1, -2.66), PAL.red)), M.prop));
  set.add(node('stool', merge(tint(place(cylinder(0.2, 0.2, 0.06, 8), 0, 0.42, 0), C7.woodPale), ...[0, 1, 2].map((k) => tint(place(cylinder(0.03, 0.025, 0.44, 4), Math.cos(k * 2.094) * 0.14, 0, Math.sin(k * 2.094) * 0.14, Math.sin(k * 2.094) * 9, 0, -Math.cos(k * 2.094) * 9), C7.woodDark))), M.prop, { pos: [1.55, 0, -2.45] }));
  const clutter = [
    [basket({ r: 0.3, h: 0.36, full: false }), [-1.45, 0, -0.78], 0], [crate({ s: 0.56, seed: 1 }), [-4.0, 0, -0.75], 12], [crate({ s: 0.46, seed: 2, color: PAL.wood2 }), [-3.97, 0.57, -0.8], -14], [barrel({}), [-4.5, 0, -0.2], 0],
    [crate({ s: 0.5, seed: 4 }), [SHORT[0] + 0.2, 0.8, SHORT[2]], 24], [sack({ seed: 2 }), [4.9, 0, -0.5], 30], [barrel({ r: 0.3, h: 0.74 }), [2.5, 0, -5.6], 0], [crate({ s: 0.5, seed: 6, color: PAL.wood2 }), [-1.0, 0, -5.6], -8], [sack({ seed: 9 }), [1.9, 0, -5.9], 10],
  ];
  clutter.forEach(([m, p, yaw], i) => { if (low && i > 5) return; set.add(node('clutter' + i, m, M.prop, { pos: p, rot: [0, yaw, 0] })); });

  // ---- poles and wires
  const POLE_L = [-3.55, 0, 1.95], POLE_R = [3.6, 0, 1.75], BACK_L = [-1.5, 0, -3.75], BACK_R = [3.3, 0, -4.05], NAME_L = [-1.2, 0, -2.5], NAME_R = [1.85, 0, -2.55];
  const poleL = pole({ h: 5.3, seed: 2 }), poleR = pole({ h: 4.9, seed: 6, knob: PAL.coral }), backL = pole({ h: 4.0, seed: 4, knob: PAL.teal }), backR = pole({ h: 3.8, seed: 8, knob: PAL.yellow });
  const nameL = pole({ h: 3.05, seed: 12, knob: PAL.red }), nameR = pole({ h: 2.95, seed: 14, knob: PAL.teal });
  set.add(node('poleL', poleL, M.prop, { pos: POLE_L }), node('poleR', poleR, M.prop, { pos: POLE_R }), node('backL', backL, M.prop, { pos: BACK_L }), node('backR', backR, M.prop, { pos: BACK_R }), node('nameL', nameL, M.prop, { pos: NAME_L }), node('nameR', nameR, M.prop, { pos: NAME_R }));
  const topL = anchorAt(poleL, 'top', POLE_L), topR = anchorAt(poleR, 'top', POLE_R), topBL = anchorAt(backL, 'top', BACK_L), topBR = anchorAt(backR, 'top', BACK_R), topNL = anchorAt(nameL, 'top', NAME_L), topNR = anchorAt(nameR, 'top', NAME_R);
  const eave = (h, name) => anchorAt(h.mesh, name, h.pos, h.yaw), wires = [], strings = [];
  // finished lanterns, unlit: the front wire across the stage and the wire from ridge to ridge
  const addString = (a, b, opts, cols, scale = 1) => { const s = lanternString(a, b, opts); wires.push(s.wire); strings.push({ hooks: s.hooks, cols, scale }); return s; };
  addString(topL, topR, { sag: 1.3, count: 7 }, [0, 2, 1, 4, 3, 2, 5], 1.3);
  addString(eave(houses[0], 'ridge'), eave(houses[1], 'ridge'), { sag: 1.0, count: 9, ends: 0.1 }, [2, 0, 5, 1, 0, 2, 3, 0, 1], 1.1);
  // forty frames with no paper on them: three wires of them, and four in the creel
  const frameHooks = [];
  const addFrames = (a, b, opts) => { const s = lanternString(a, b, opts); wires.push(s.wire); s.hooks.forEach((h) => frameHooks.push(h)); return s; };
  const backWire = addFrames(topBL, topBR, { sag: 0.5, count: 11, ends: 0.06 });
  addFrames([topBL[0], topBL[1] - 0.95, topBL[2] + 0.05], [topBR[0], topBR[1] - 0.9, topBR[2] + 0.05], { sag: 0.3, count: 10, ends: 0.08 });
  addFrames(topBR, topR, { sag: 0.9, count: 9, ends: 0.1 });
  addFrames(anchorAt(nanStall, 'top', NAN.pos, NAN.yaw), topBL, { sag: 0.25, count: 6, ends: 0.16 });
  const names = lanternString(topNL, topNR, { sag: 0.22, count: 2, ends: 0.33 }); wires.push(names.wire);
  set.add(node('wires', setOutline(merge(wires), 0), M.flat));
  if (!low) {
    set.add(node('bunting1', bunting(eave(houses[2], 'eaveR'), topL, { sag: 0.7, count: 11, seed: 3 }), M.prop), node('bunting2', bunting(topR, eave(houses[3], 'eaveL'), { sag: 0.7, count: 11, seed: 5 }), M.prop));
  }
  const post = lampPost({ h: 2.9, arm: 0.6, lit: false }), POST = [-1.3, 0, QUAY_Z + 0.75];
  set.add(node('post', post, M.prop, { pos: POST, rot: [0, 180, 0] }));
  for (const x of [1.35, -3.4, 4.6]) set.add(node('bollard', bollard({ s: 1.15 }), M.prop, { pos: [x, 0, QUAY_Z + 0.6] }));
  set.add(node('coil', ropeCoil({}), M.prop, { pos: [2.05, 0, QUAY_Z + 1.0] }));

  // ---- far: chapter 1's headland and lighthouse, the second shore, rocks
  const far = group('far');
  const HEAD = [-52, -0.6, -135], LH = [-11.7, 0, -129];
  const headMesh = headland({ w: 96, d: 34, h: 9, seed: 3, seg: 24, rings: 10 });
  far.add(node('headland', headMesh, FAR, { pos: HEAD }));
  { let top = 0; const Pm = headMesh.positions; for (let i = 0; i < Pm.length; i += 3) if (Math.hypot(Pm[i] + HEAD[0] - LH[0], Pm[i + 2] + HEAD[2] - LH[2]) < 5 && Pm[i + 1] > top) top = Pm[i + 1]; LH[1] = HEAD[1] + top - 0.8; }
  far.add(node('lighthouse', lighthouse({ h: 13, r: 2.3, lit: false }), FAR, { pos: LH }));
  if (!low) far.add(node('shore2', headland({ w: 80, d: 30, h: 15, seed: 8, grass: PAL.leafDark, seg: 24, rings: 10 }), FAR, { pos: [78, -0.6, -150], rot: [0, 172, 0] }));
  for (const [x, z, s, seed] of [[-7.5, -19, 1.5, 3], [9.5, -24, 1.9, 8]]) far.add(node('rock', rock({ seed, s }), FAR, { pos: [x, WATER - 0.05, z] }));

  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  env.sky.sunDir = norm7(env.sky.sunDir); env.water.level = WATER;
  const BOATS = [{ pos: [0.75, WATER + 0.02, QUAY_Z - 1.75], yaw: 78, s: 1.15, col: '#ffffff' }, { pos: [-5.5, WATER + 0.02, -27], yaw: 115, s: 1.6, col: '#d8f4ff' }, { pos: [8, WATER + 0.02, -38], yaw: 60, s: 2.0, col: '#ffe2c8' }];
  env.water.shores = [[0, QUAY_Z + 0.1 + 900, 900, 0.75], ...BOATS.map((b) => [b.pos[0], b.pos[2], 0.9 * b.s, 0.45]), [-7.5, -19, 1.25, 0.6], [9.5, -24, 1.6, 0.7], [-52, -135, 46, 1.6], [78, -150, 39, 1.6]];
  set.traverse((n) => { if (n.name === 'on-table' || n.name === 'cane') n.castShadow = false; });
  const wings = [mergeStatic(sideL, 'set-left'), mergeStatic(sideR, 'set-right')];
  scene.root.add(mergeStatic(ground, 'ground'), mergeStatic(set, 'set'), wings[0], wings[1], mergeStatic(far, 'far'));

  // ---- paving
  const cob = node('cobbles', cobble(), M.flat); cob.castShadow = false;
  const cobCols = ['#fff0c8', '#ecd29c', '#f8e0b0', '#e6c896', '#f4d8a8'];
  scatter(cob, low ? 170 : 340, (i) => {
    const col = i % 20, row = Math.floor(i / 20), x = -6.4 + col * 0.66 + (row % 2) * 0.33 + (r() - 0.5) * 0.16, z = QUAY_Z + 0.95 + row * (low ? 1.5 : 0.76) + (r() - 0.5) * 0.12;
    if (r() < 0.38) return null;
    const sc = 0.2 + r() * 0.09; return { m: m4.trs(x, 0.002, z, 0, r() * 360, 0, sc * 1.25, 1, sc * 0.9), color: cobCols[Math.floor(r() * cobCols.length)] };
  });
  scene.root.add(cob);

  // ---- foreground: a creel of frames and offcuts of paper at the edges of the wide shot
  const fg = group('fg');
  fg.add(node('fg1', basket({ r: 0.3, h: 0.34, full: false }), M.prop, { pos: [-1.7, 0, 2.9] }), node('fg2', crate({ s: 0.5, seed: 21 }), M.prop, { pos: [-2.3, 0, 2.55], rot: [0, 20, 0] }),
    node('fg3', place(paperStack({ n: 6, seed: 8 }), 0, 0.5, 0), M.prop, { pos: [-2.3, 0, 2.55], rot: [0, 40, 0] }), node('fg4', sack({ seed: 4, s: 0.3 }), M.prop, { pos: [1.85, 0, 3.0], rot: [0, -30, 0] }), node('fg5', ropeCoil({ r: 0.22 }), M.prop, { pos: [1.3, 0, 2.6] }));
  const foreground = mergeStatic(fg, 'foreground'); scene.root.add(foreground);

  // ---- boats: one instanced draw
  const boatNode = node('boats', skiff({ len: 2.8, seed: 2 }), M.prop); boatNode.castShadow = false; boatNode.instances = makeInstances(BOATS.length); boatNode.instances.count = BOATS.length;
  BOATS.forEach((b, i) => { boatNode.instances.data.set(rgb(b.col), i * 20 + 16); });
  scene.root.add(boatNode);

  // ---- sprites; the finished lanterns; how much sun each one has behind it
  const sprites = scene.sprites = createSprites(low ? 192 : 384);
  const lines = lanternLines({ strings, material: M.lantern, sprites, shapes: low ? 1 : 2, seg: 8, seed: 3, glowSize: 1.25 });
  scene.root.add(...lines.nodes);
  const EYE = [0.4, 2.3, 7.7], SUN = env.sky.sunDir;
  const through = (p) => { const d = norm7([p[0] - EYE[0], p[1] - 0.4 - EYE[1], p[2] - EYE[2]]), c = d[0] * SUN[0] + d[1] * SUN[1] + d[2] * SUN[2], a = Math.acos(Math.min(1, c)) / DEG; return 0.42 + 0.58 * Math.max(0, Math.min(1, (26 - a) / 20)); };
  let hot = lines.list[0];
  for (const l of lines.list) { l.lit = through(l.hook); if (l.lit > hot.lit) hot = l; }

  // ---- the bare frames: two shapes, instanced, swinging
  const frameMesh = [lanternFrame({ r: 0.2, thick: 2.3 }), lanternFrame({ r: 0.18, shape: 'tall', thick: 2.3 })];
  const frames = frameHooks.map((h, i) => ({ hook: h, shape: i % 3 === 1 ? 1 : 0, s: 0.85 + r() * 0.3, ph: r() * 6.283, yaw: r() * 3 }));
  const frameNodes = frameMesh.map((m, k) => { const n = node('frames' + k, m, M.flat); n.castShadow = false; n.instances = makeInstances(frames.filter((f) => f.shape === k).length); scene.root.add(n); return n; });
  { const count = [0, 0]; for (const f of frames) { f.inst = frameNodes[f.shape].instances; f.idx = count[f.shape]++; } frameNodes.forEach((n, k) => { n.instances.count = count[k]; }); }
  const cane0 = rgb('#ffffff');
  for (const f of frames) f.inst.data.set(cane0, f.idx * 20 + 16);
  // the back wire's frames can take paper: fresh lanterns that grow over them as the work is done
  const freshMesh = paperLantern({ r: 0.215, shape: 'round', seg: 8 }), fresh = backWire.hooks.map((h, i) => ({ hook: h, col: rgb(PAL.lanterns[(i * 3 + 1) % PAL.lanterns.length]), now: 0, f: frames[i], glow: sprites.add({ kind: 'glow', pos: [h[0], h[1] - 0.3, h[2]], size: 1.0, color: PAL.lanterns[(i * 3 + 1) % PAL.lanterns.length], alpha: 0 }) }));
  const freshNode = node('fresh', freshMesh, M.lantern); freshNode.castShadow = false; freshNode.instances = makeInstances(fresh.length); freshNode.instances.count = fresh.length; scene.root.add(freshNode);

  // ---- the two names
  const NAMES = [{ col: '#7fe6d2', strokes: [[1, 0.8, 1, 0.7, 1, 0.8, 1], [0.6, 0.5]], seed: 5 }, { col: '#ffb24a', strokes: [[1, 0.7, 0.9, 1, 0.7, 0.9], [1, 0.8, 0.7, 1, 0.8]], seed: 9 }].map((d, i) => {
    const mesh = nameLantern(d.strokes, d.seed), n = node('name' + i, mesh, M.lantern, { pos: names.hooks[i] }); n.castShadow = false; scene.root.add(n);
    const c = rgb(d.col), len = -mesh.anchors.centre[1], centre = [names.hooks[i][0], names.hooks[i][1] - len, names.hooks[i][2]];
    return { node: n, c, len, hook: names.hooks[i], centre, glow: sprites.add({ kind: 'glow', pos: centre, size: 2.3, color: d.col, alpha: 0 }), now: i === 0 ? 1 : 0 };
  });
  const FOCUS = NAMES[0].centre;

  // ---- light: the sun's own flare behind the hottest lantern, slants of it down through the wires, one warm pool under the names
  const flare = sprites.add({ kind: 'sparkle', pos: [hot.hook[0], hot.hook[1] - 0.35, hot.hook[2] - 0.3], size: 2.0, color: '#fffbe6', alpha: 0, rot: 0.3 });
  const halo = sprites.add({ kind: 'glow', pos: [hot.hook[0], hot.hook[1] - 0.35, hot.hook[2] - 0.3], size: 3.2, color: '#ffe9a0', alpha: 0 });
  const shafts = node('sun-shafts', sunShafts(dirFrom(-4, 35), low ? [[0.3, -0.4, 9, 1.5], [-1.9, 1.0, 9.5, 1.0]] : [[0.3, -0.4, 9, 1.5], [-1.9, 1.0, 9.5, 1.0], [2.3, -1.6, 9, 1.1], [-0.6, -3.2, 8, 0.9]], '#ffe6a0'), rayMaterial({ power: 1.3, near: 0.26, far: 0.08 }));
  scene.root.add(shafts);
  const lamps = [
    { name: 'paper', pos: [FOCUS[0] + 0.6, FOCUS[1] - 0.2, FOCUS[2] + 0.5], color: '#ffd27a', radius: 5.5, base: 1.0, flicker: 0.02 },
    { name: 'front-wire', pos: [hot.hook[0], hot.hook[1] - 0.6, hot.hook[2]], color: '#ffc46a', radius: 6.0, base: 0.8, flicker: 0.02 },
  ];

  const clouds = cloudBank({ style: 'painted', count: 8, seed: 7, arc: [158, 204], radius: [250, 430], height: [40, 150], size: [0.7, 1.5], speed: 0.05, ...L.cloud });
  scene.root.add(clouds.node);
  const gulls = node('gulls', gull({}), M.speck); gulls.instances = makeInstances(5); gulls.instances.count = 5; scene.root.add(gulls);
  const chimney = anchorAt(houses[0].mesh, 'chimney', houses[0].pos, houses[0].yaw);
  const actors = group('actors'); scene.root.add(actors);

  // ---- per-frame (allocation-free)
  const P = [0, 0, 0], V = [0, 0, 0], S3 = [1, 1, 1], Q = quat.create(), Mx = m4.create(), rnd = rng(77);
  let namesN = 1, papered = 0, nextPuff = 0, nextMote = 0, nextGlint = 0, nextRing = 0.8, nextGust = 1.3, nextScrap = 2;
  const setNames = (n) => { namesN = Math.max(0, Math.min(2, Math.round(n))); };
  const setPapered = (v) => { papered = Math.max(0, Math.min(1, v)); };
  const paperTask = { pos: [backWire.hooks[5][0], backWire.hooks[5][1] - 0.4, backWire.hooks[5][2]], set: setPapered };
  const task = () => paperTask;
  function cue(lineId) {
    const m = /^ch7\.s1\.c(\d+)/.exec(lineId || ''); if (!m) return false;
    setNames(Number(m[1]) >= 26 ? 2 : 1); return true;
  }

  function tick(time, dt, pw, live, power) {
    const sunK = 0.5 + 0.5 * Math.min(1.3, power), snap = dt === 0 ? 1 : 0;
    lines.update(time, { on: Math.min(1, sunK), pw: sunK, unlit: 0.86, paper: 0.3, glow: 0.3, cool: 0 });
    // frames swing on their hooks, lighter than paper
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i], az = (Math.sin(time * 1.5 + f.ph) * 8 + Math.sin(time * 0.5 + f.ph * 2.1) * 5) * DEG, ax = Math.sin(time * 1.2 + f.ph * 1.7) * 6 * DEG;
      quat.fromEuler(Q, ax, f.yaw + time * 0.1 * Math.sin(f.ph), az); S3[0] = S3[1] = S3[2] = f.s;
      m4.fromTRS(Mx, f.hook, Q, S3); f.inst.data.set(Mx, f.idx * 20); f.inst.dirty = true;
    }
    // fresh paper on the back wire, left to right
    const D = freshNode.instances.data, done = papered * fresh.length;
    for (let i = 0; i < fresh.length; i++) {
      const p = fresh[i], goal = i < Math.round(done) ? 1 : 0; p.now += (goal - p.now) * Math.min(1, dt * 5 + snap);
      const f = p.f, az = (Math.sin(time * 1.5 + f.ph) * 6) * DEG, s = f.s * (p.now < 0.02 ? 0.0001 : 0.3 + 0.7 * p.now) * (1 + 0.2 * Math.sin(Math.min(1, p.now) * Math.PI));
      quat.fromEuler(Q, 0, 0, az); S3[0] = S3[1] = S3[2] = s; m4.fromTRS(Mx, p.hook, Q, S3); D.set(Mx, i * 20);
      const k = 0.75 + 0.3 * sunK; D[i * 20 + 16] = p.col[0] * k; D[i * 20 + 17] = p.col[1] * k; D[i * 20 + 18] = p.col[2] * k; D[i * 20 + 19] = 1;
      p.glow.alpha = 0.3 * p.now * sunK;
    }
    freshNode.instances.dirty = true; freshNode.visible = papered > 0 || fresh[0].now > 0.02;
    // the names: Tessaly, and Little Brand beside it
    for (let i = 0; i < 2; i++) {
      const n = NAMES[i], goal = namesN > i ? 1 : 0; n.now += (goal - n.now) * Math.min(1, dt * 4 + snap);
      n.node.visible = n.now > 0.02;
      const bz = Math.sin(time * 0.8 + i * 1.9) * 4 * DEG, bx = Math.sin(time * 0.63 + 1 + i) * 2.4 * DEG, s = 0.3 + 0.7 * n.now;
      quat.fromEuler(n.node.rotation, bx, 0.25 - i * 0.5, bz); n.node.scale[0] = n.node.scale[1] = n.node.scale[2] = s;
      const k = 0.78 + 0.34 * sunK; n.node.tint[0] = n.c[0] * k; n.node.tint[1] = n.c[1] * k; n.node.tint[2] = n.c[2] * k;
      n.glow.pos[0] = n.hook[0] + Math.sin(bz) * n.len; n.glow.pos[1] = n.hook[1] - Math.cos(bz) * n.len * s; n.glow.alpha = 0.42 * n.now * sunK;
    }
    const tw = 0.5 + 0.5 * Math.sin(time * 0.9);
    flare.alpha = 0.7 * sunK * (0.7 + 0.3 * tw); flare.rot = 0.3 + time * 0.12; flare.size[0] = flare.size[1] = 1.7 + 0.6 * tw; halo.alpha = 0.3 * sunK;
    shafts.visible = power > 0.15;
    for (let i = 0; i < BOATS.length; i++) {
      const b = BOATS[i];
      P[0] = b.pos[0]; P[1] = b.pos[1] + Math.sin(time * 1.3 + i * 2.1) * 0.04; P[2] = b.pos[2];
      quat.fromEuler(Q, Math.sin(time * 1.1 + i) * 2.5 * DEG, (b.yaw + Math.sin(time * 0.3 + i) * 3) * DEG, Math.sin(time * 1.6 + 1 + i * 1.7) * 4 * DEG);
      S3[0] = S3[1] = S3[2] = b.s; m4.fromTRS(Mx, P, Q, S3); boatNode.instances.data.set(Mx, i * 20);
    }
    boatNode.instances.dirty = true;
    for (let i = 0; i < 5; i++) {
      const a = time * (0.22 + i * 0.03) * (i % 2 ? 1 : -1) + i * 1.9, rad = 7 + i * 2.2, cx = -4 + i * 3.5, cz = -24 - i * 5;
      P[0] = cx + Math.cos(a) * rad; P[1] = 4.5 + i * 1.2 + Math.sin(time * 0.5 + i) * 0.8; P[2] = cz + Math.sin(a) * rad * 0.6;
      quat.fromEuler(Q, 0, Math.sin(a) * 0.35, Math.cos(a) * 0.3 * (i % 2 ? 1 : -1));
      const flap = Math.sin(time * (5.5 + i * 0.4) + i * 2); S3[0] = 1.9; S3[1] = 1.9 * (0.5 + 1.3 * flap); S3[2] = 1.9;
      if (Math.abs(S3[1]) < 0.12) S3[1] = 0.12;
      m4.fromTRS(Mx, P, Q, S3); gulls.instances.data.set(Mx, i * 20);
    }
    gulls.instances.dirty = true;
    clouds.update(time);
    env.water.glintDensity = 0.34 * (0.45 + 0.55 * Math.min(1.3, power));
    if (live) {
      if (time > nextPuff) { nextPuff = time + 0.6; sprites.puff(chimney, { count: 1, size: 0.5, rise: 0.6, spread: 0.12, life: 3.0, color: '#ffffff' }); }
      if (time > nextMote) { nextMote = time + (low ? 0.5 : 0.25); P[0] = -3.5 + rnd() * 7; P[1] = 0.4 + rnd() * 3.2; P[2] = -4 + rnd() * 6; V[0] = 0.14 + rnd() * 0.1; V[1] = 0.06 + rnd() * 0.12; V[2] = 0.06; sprites.spawn({ kind: 'glow', pos: P, vel: V, size: 0.08 + rnd() * 0.08, life: 4.5, color: '#fff2c0', alpha: 0.75 }); }
      if (time > nextGlint) { nextGlint = time + 0.1 / Math.max(0.3, power); P[0] = -10 + rnd() * 20; P[1] = WATER + 0.05; P[2] = QUAY_Z - 1 - rnd() * rnd() * 30; sprites.sparkle(P, { count: 1, size: 0.3 + (QUAY_Z - P[2]) * 0.03, spread: 0.2, life: 0.8, color: '#fff6c8' }); }
      if (time > nextRing) { nextRing = time + 1.7; P[0] = -6 + rnd() * 14; P[1] = WATER + 0.03; P[2] = QUAY_Z - 1.2 - rnd() * 6; sprites.splash(P, { size: 0.9 + rnd() * 0.6, life: 1.4, spray: 0, color: '#fff6e4' }); }
      if (!low && time > nextGust) { nextGust = time + 2.6 + rnd() * 1.5; P[0] = -4 + rnd() * 3; P[1] = 2.6 + rnd() * 2.4; P[2] = -6 + rnd() * 5; V[0] = 2.0; V[1] = 0.1; V[2] = 0.25; sprites.gust(P, { vel: V, size: 0.9 + rnd() * 0.5, life: 2.2, alpha: 0.8, color: '#ffffff' }); }
      if (time > nextScrap) { nextScrap = time + 1.1 + rnd(); P[0] = TABLE[0] - 0.8 + rnd() * 1.6; P[1] = 0.95; P[2] = TABLE[2]; V[0] = 0.5 + rnd() * 0.5; V[1] = 0.5 + rnd() * 0.4; V[2] = 0.2; sprites.spawn({ kind: 'dot', pos: P, vel: V, size: 0.07, life: 1.6, color: PAL.lanterns[Math.floor(rnd() * PAL.lanterns.length)], gravity: 0.7 }); }
    }
  }

  return shell7({
    id: 'stall-day', light, low, L, scene, cameras: CAMERAS, actors, foreground, lamps, glows: [], sun: L.sun, tick,
    marks: {
      ...STD_MARKS(), focus: FOCUS, pot: POT,
      work: { pos: [TABLE[0] - 1.75, 0, TABLE[2] + 0.2], face: 62 }, short: { pos: [SHORT[0] - 1.0, 0, SHORT[2] + 0.95], face: -52 },
      wire: [{ pos: [TABLE[0] - 0.55, 0, TABLE[2] + 0.85], face: 170 }, { pos: [TABLE[0] + 0.5, 0, TABLE[2] + 0.85], face: -170 }],
      back: [[1.3, 0.1], [2.1, -0.05], [2.9, 0.15], [-1.3, 0.1], [-2.1, -0.05], [-2.9, 0.15]],
    },
    extra: { wings, setNames, setPapered, setLantern: lines.setLit, lanternCount: lines.count, frameCount: frames.length + 4, task, cue },
  });
}

export const stallDay = { id: 'stall-day', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default stallDay;
