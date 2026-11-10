// SET: kedge-roads. The salt quay of Kedge, looking out over the roads: sixty hulls at anchor, riding high and
// empty, under the line of cranes on the mole, the sun coming up behind the cranes, the lamp-house at the mole's end.
// Chapter 6: ch6.pro.04-20 (the collier lands them; Hesper on the quay), ch6.s1 (Foss at the foot of the gangway),
// ch6.s7.c16-c26 (the open boat rows out on the dim lane, under the cutter's rail), ch6.epi.01-15 (Kedge burning grey astern).
//
//   import { kedgeRoads } from './sets/kedge-roads.js';
//   const set = kedgeRoads.build(GL, { light: 'dawn' | 'grey' | 'night', low: false });
//
// The shape is lantern-stalls' (see ../index.js). Figures face +Z; cameras look toward -Z, out to sea. The stage
// strip x -3.2..3.2, z 0..1.6 is clear. The quay edge is at z = -5.2; the collier lies alongside at the left with
// her gangway down (marks.gangway is its foot), a grey Halcyon packet at the right.
//   'dawn'   the lamp whole and white, the roads flat, gold light through the cranes
//   'grey'   first light after the cutting: the lamp a quarter, grey-violet; the sea stood up in a wall beyond the
//            half-mile; the Audit cutter across the mouth of the mole; the open boat can row out (setBoat / cue)
//   'night'  the same, later: riding lights, the grey lamp, a warm quay lamp
// Added here:
//   setBoat(0..1)   the Compact's open boat: 0 not yet put out (hidden), then it rows out down the lane to the mouth
//   cue(lineId)     ch6.s7.c16 puts the boat out (it eases to the cutter over about a minute); ch6.s7.c26 sends it through
//   marks.gangway, marks.focus (the lamp-house flame), marks.mouth (where the cutter lies)
// low: true halves the far hulls, drops the cranes' bracing, the gulls and the far clouds' outline.

import { m4, quat, rng, DEG, rgb } from '../math.js';
import { merge, tint, place, plane, box, tube, curve, cylinder, extrude, setGlow, gradientY, deform, sphere } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic, makeInstances } from '../scene.js';
import { createSprites } from '../sprites.js';
import { rayMesh, rayMaterial } from '../fx.js';
import { PAL, anchorAt, pickLight, scatter, quayEdge, cobble, bollard, ropeCoil, lampPost, gangway, cloudBank, gull, crate, sack, bunting } from './kit.js';
import { K6, ch6Materials, shell, STD_MARKS, STD_CAMERAS, dirFrom, norm3, cask, gantry, hulk, mole, lampHouse, cutterHull, openBoat, oar } from './kit-ch6.js';

const QUAY_Z = -5.2, WATER = -1.3;

const LIGHTS = {
  dawn: {
    preset: 'sunset', power: 0.55, flame: 'white', wall: 0, cutter: false,
    env: {
      key: { dir: dirFrom(-40, 22), color: '#ffe4b8' },
      shadow: { tint: '#8f84ea', lift: 0.12, saturate: 1.4 },
      ambient: { sky: '#ffc0b0', ground: '#8a7ce0', amount: 0.2 },
      rim: { color: '#ffe29a', amount: 1.15, edge: 0.7 },
      fog: { color: '#ffd2b4', density: 0.0034, start: 18, max: 0.86 },
      sky: { zenith: '#4f78e8', mid: '#f29ac4', midAt: 0.34, horizon: '#ffe08a', below: '#ffc68e', glow: '#fff0a8', glowAmount: 0.8, sunDir: dirFrom(-3.2, 4.4), sun: { color: '#ffffff', size: 3.6, halo: '#ffc060', haloAmount: 0.8 } },
      water: { deep: '#3f6fd8', mid: '#6fa8f0', shallow: '#ffd0b8', foam: '#fffaf0', glint: '#fff0a0', glintDensity: 0.36, drift: [0.12, 0.3] },
    },
    cloud: { color: '#ffd0c8', shadowTint: '#b48ce8' }, shaft: 0.3, lampGlow: '#fff6c8',
  },
  grey: {
    preset: 'sunset', power: 0.4, flame: 'quarter', wall: 1, cutter: true,
    env: {
      key: { dir: dirFrom(-14, 20), color: '#f2ecff' },
      shadow: { tint: '#7f86e4', lift: 0.14, saturate: 1.25 },
      ambient: { sky: '#cfc8ff', ground: '#7a82d8', amount: 0.24 },
      rim: { color: '#fff0c0', amount: 0.9, edge: 0.72 },
      fog: { color: '#cfc4f4', density: 0.0038, start: 18, max: 0.84 },
      sky: { zenith: '#5a6ad8', mid: '#b0a0ee', midAt: 0.36, horizon: '#ffe6a8', below: '#c8b8f0', glow: '#fff2c0', glowAmount: 0.5, sunDir: dirFrom(-3.2, 2.2), sun: { color: '#fffbe8', size: 2.8, halo: '#ffd890', haloAmount: 0.5 } },
      water: { deep: '#4a5ec8', mid: '#7c8ee4', shallow: '#c8c0f4', foam: '#f4f1ff', glint: '#fff0c0', glintDensity: 0.2, drift: [0.1, 0.25] },
    },
    cloud: { color: '#e4dcff', shadowTint: '#9a8ce0' }, shaft: 0.16, lampGlow: K6.quarter,
  },
  night: {
    preset: 'night', power: 1.15, flame: 'quarter', wall: 1, cutter: true,
    env: {
      key: { dir: dirFrom(-30, 40), color: '#8aa4f4' },
      shadow: { tint: '#3046b0', lift: 0.13, saturate: 1.25 },
      ambient: { sky: '#4868d8', ground: '#2c3c98', amount: 0.18 },
      fog: { density: 0.0036, start: 18, max: 0.86 },
      sky: { zenith: '#0c1a70', mid: '#2040b4', midAt: 0.4, horizon: '#6a7cea', below: '#3558c8', sunDir: dirFrom(-12, 16), moon: 0.6, stars: 1, sun: { size: 2.4 } },
      water: { deep: '#142c8c', mid: '#2048b4', shallow: '#3c7cdc', glintDensity: 0.16 },
    },
    cloud: { color: '#8fa6ea', shadowTint: '#3a50aa' }, shaft: 0, lampGlow: K6.quarter,
  },
};

const CAMERAS = STD_CAMERAS({
  wide: { target: [0.1, 1.7, -0.4], dist: 8.2, yaw: 2, pitch: 4.5, fov: 44 },
  low: { target: [0.1, 1.9, 0.2], dist: 6.4, yaw: -6, pitch: -10, fov: 56 },
  stage: { target: [0, 1.05, 0.5], dist: 9.4, yaw: -13, pitch: 7, fov: 24 },
});

function build(engine = null, { light, low = false } = {}) {
  const picked = pickLight('kedge-roads', LIGHTS, light), L = picked.L; light = picked.name;
  const M = ch6Materials(), r = rng(6061), FAR = low ? M.farFlat : M.far, lit = light !== 'dawn' || true;
  const dark = light === 'night';

  // ---- the quay
  const set = group('set');
  set.add(node('ground', tint(place(plane(90, 26, 1, 1), 0, 0, QUAY_Z + 0.3 + 13), '#efdcb4'), M.ground));
  set.add(node('quay', quayEdge({ len: 30, drop: 1.7, seed: 6 }), M.ground, { pos: [0, 0, QUAY_Z] }));
  for (const sx of [-1, 1]) set.add(node('quay-far', tint(place(box(34, 1.9, 0.5), sx * 32, -0.95, QUAY_Z + 0.3), PAL.stone2), M.ground));
  // stillsalt in casks, stacked either side of the way down to the edge
  const stacks = [[-2.5, -2.9, 0], [-3.15, -2.7, 0], [-2.8, -2.75, 0.72], [-3.4, -3.5, 0], [2.6, -3.3, 0], [3.25, -3.0, 0], [2.95, -3.1, 0.72], [-6.2, -2.4, 0], [-6.8, -2.0, 0], [-6.5, -2.2, 0.72], [6.3, -1.6, 0], [5.7, -2.1, 0]];
  const cm = cask({});
  stacks.forEach(([x, z, y], i) => set.add(node('cask' + i, cm, M.prop, { pos: [x, y, z], rot: [0, i * 47, 0] })));
  set.add(node('cask-lantern', merge(tint(place(cylinder(0.09, 0.07, 0.06, 8), 0, 0, 0), K6.brass), setGlow(tint(place(cylinder(0.07, 0.085, 0.2, 8), 0, 0.06, 0), '#ffe9a0'), 1), tint(place(cylinder(0.1, 0.02, 0.09, 8), 0, 0.26, 0), K6.brass)), M.prop, { pos: [-2.8, 1.44, -2.75] }));
  set.add(node('cask-side', cask({}), M.prop, { pos: [3.9, 0.3, -2.4], rot: [90, 30, 0] }));
  set.add(node('crate1', crate({ s: 0.6, seed: 3, color: K6.timber2 }), M.prop, { pos: [-4.3, 0, -3.3], rot: [0, 14, 0] }), node('sack1', sack({ seed: 4, color: K6.salt }), M.prop, { pos: [4.6, 0, -3.2], rot: [0, 40, 0] }), node('sack2', sack({ seed: 7, s: 0.3, color: K6.salt }), M.prop, { pos: [5.1, 0, -2.7] }));
  set.add(node('bollard1', bollard({ s: 1.2 }), M.prop, { pos: [-1.3, 0, QUAY_Z + 0.6] }), node('bollard2', bollard({ s: 1.2 }), M.prop, { pos: [3.6, 0, QUAY_Z + 0.6] }), node('bollard3', bollard({ s: 1.2 }), M.prop, { pos: [-6.4, 0, QUAY_Z + 0.6] }));
  set.add(node('coil', ropeCoil({ r: 0.3 }), M.prop, { pos: [-0.5, 0, QUAY_Z + 1.0] }));
  const POST = [1.75, 0, QUAY_Z + 0.75];
  const post = lampPost({ h: 3.0, arm: 0.6, lit: true });
  set.add(node('post', post, M.prop, { pos: POST, rot: [0, 180, 0] }));
  // the collier, alongside at the left with her gangway down; a Halcyon packet in grey at the right
  const COLLIER = [-11.2, WATER, -12.5], PACKET = [10.2, WATER, -9.5];
  const collier = hulk({ len: 17, hull: K6.tar, boot: K6.coral, house: K6.cream, roof: K6.coral, seed: 3, seg: 16, rings: 10 });
  set.add(node('collier', collier, M.prop, { pos: COLLIER, rot: [0, 12, 0] }));
  set.add(node('packet', hulk({ len: 13, hull: K6.grey, boot: K6.greyDark, house: '#e6e8f6', roof: K6.greyDark, seed: 8, seg: 16, rings: 10 }), M.prop, { pos: PACKET, rot: [0, -14, 0] }));
  const GANG = [-5.6, 0, QUAY_Z + 0.5];
  set.add(node('gangway', gangway({ len: 4.6, w: 1.0, rise: 1.75, seed: 3 }), M.prop, { pos: GANG, rot: [0, 50, 0] }));
  set.add(node('moor1', tint(tube(curve([[-1.3, 0.36, QUAY_Z + 0.6], [-2.4, 0.0, QUAY_Z - 0.3], [-4.6, 0.2, QUAY_Z - 2.2], [-8.6, 1.9, QUAY_Z - 5.6]], 10), 0.035, 5, { crease: 180 }), PAL.rope), M.prop));
  set.add(node('moor2', tint(tube(curve([[3.6, 0.36, QUAY_Z + 0.6], [4.6, 0.0, QUAY_Z - 0.4], [6.4, 0.1, QUAY_Z - 2], [8.2, 1.4, QUAY_Z - 3.6]], 10), 0.035, 5, { crease: 180 }), PAL.rope), M.prop));
  // the quay's own crane, right of the stage: its jib swings in over the way down to the edge with a cask on the hook
  const QC = [5.0, 0, -3.5], QC_YAW = 172;
  const quayCrane = gantry({ h: 7.4, reach: 6.0, seed: 9, color: K6.teal, roof: K6.coral, cab: K6.cream, detail: 1 });
  set.add(node('quay-crane', quayCrane, M.prop, { pos: QC, rot: [0, QC_YAW, 0] }));
  // signal flags from the lamp post out to the collier's mast: colour against the sky
  if (!low) set.add(node('flags', bunting([POST[0] - 0.2, 3.1, POST[2]], [-9, 6.6, -11], { sag: 0.9, count: 13, size: 0.3, seed: 4, colors: [K6.coral, K6.cream, K6.teal, K6.yellow] }), M.prop, { castShadow: false }));

  // ---- the roads: the mole in two arms with the mouth between them, cranes along it, the lamp-house on the right arm's end
  const far = group('far'), back = group('back'), MOLE_Z = -62, MOUTH = 5.5;
  for (const sx of [-1, 1]) far.add(node('mole', mole({ len: 60, h: 2.6, d: 6 }), FAR, { pos: [sx * (MOUTH + 30), WATER, MOLE_Z] }));
  const cranes = [[-33, 15, K6.coral, 20], [-20, 17, K6.teal, -12], [-10.5, 14, K6.yellow, 24], [15.5, 16, K6.coral, 190], [26, 14, K6.royal, 168], [36, 17, K6.teal, 200]];
  const cabWins = [];
  cranes.forEach(([x, h, col, yaw], i) => {
    const g = gantry({ h, reach: h * 0.78, seed: i + 2, color: col, roof: i % 2 ? K6.coral : K6.teal, detail: low ? 0 : 1, lit: true }), pos = [x, WATER + 2.6, MOLE_Z];
    far.add(node('crane' + i, g, FAR, { pos, rot: [0, yaw, 0] }));
    cabWins.push(anchorAt(g, 'lamp', pos, yaw));
  });
  const LH = [MOUTH + 3.2, WATER + 2.6, MOLE_Z + 0.2];
  const lh = lampHouse({ h: 16.5, r: 3.6, flame: L.flame });
  far.add(node('lamp-house', lh, FAR, { pos: LH, rot: [0, -10, 0] }));
  const LAMP = anchorAt(lh, 'lamp', LH, -10);
  // a low shore and the salt sheds behind the left arm
  back.add(node('shore', gradientY(place(box(120, 5, 20), -70, WATER + 1.5, MOLE_Z - 46), '#c8a8d8', '#f0d8b8'), M.farFlat));
  for (let i = 0; i < 6; i++) { const s = 4 + r() * 2.4; back.add(node('shed' + i, merge(tint(place(box(s * 1.5, s, s), 0, s / 2, 0), i % 2 ? K6.cream : K6.salt), tint(place(cylinder(s * 1.12, 0, s * 0.6, 4), 0, s, 0, 0, 45, 0, 1.3, 1, 1), [K6.teal, K6.coral, K6.royal][i % 3])), M.farFlat, { pos: [-74 + i * 9 + r() * 3, WATER + 3.6, MOLE_Z - 40 + r() * 4], rot: [0, r() * 20 - 10, 0] })); }
  // hulls: three rows this side of the mole, a scatter beyond it
  const hullCols = [[K6.cream, K6.coral, K6.teal], [K6.salt, K6.teal, K6.coral], ['#ffd9c0', K6.royal, K6.yellow], [K6.tar, K6.coral, K6.cream], ['#cfe6ff', K6.coral, K6.royal], [K6.yellow, K6.tar, K6.coral]];
  const hullSpots = [], ridingLights = [];
  for (let row = 0; row < 4; row++) {
    const z = -21 - row * 10.5, n = 5 + row * 2;
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * (8.4 + row * 0.6) + (r() - 0.5) * 3 + (row % 2 ? 3.5 : 0);
      if (Math.abs(x) < 3.4) continue;                    // the lane down the middle stays open
      if (Math.hypot(x - COLLIER[0], z - COLLIER[2]) < 12 || Math.hypot(x - PACKET[0], z - PACKET[2]) < 10) continue;
      hullSpots.push([x, z + (r() - 0.5) * 4, 6.2 + r() * 3.4, 150 + r() * 60]);
    }
  }
  for (let i = 0; i < 16; i++) hullSpots.push([-80 + i * 10.4 + r() * 4, MOLE_Z - 12 - r() * 26, 8 + r() * 4, 160 + r() * 40]);
  hullSpots.forEach(([x, z, len, yaw], i) => {
    if (low && i % 3) return;
    const c = hullCols[i % hullCols.length], h = hulk({ len, hull: c[0], boot: c[1], roof: c[2], seed: i + 1, seg: z < MOLE_Z ? 6 : 8, rings: z < MOLE_Z ? 4 : 5, lit: true });
    (z < MOLE_Z ? back : far).add(node('hull' + i, h, z < MOLE_Z ? M.farFlat : FAR, { pos: [x, WATER, z], rot: [0, yaw, 0] }));
    if (z > MOLE_Z) ridingLights.push(anchorAt(h, 'lamp', [x, WATER, z], yaw));
  });
  // the sea beyond the half-mile, stood up: a long grey-violet wall with a pale crest
  if (L.wall) {
    const wave = deform(box(420, 1, 30), (p) => { const u = p[0] / 210; if (p[1] > 0) { p[1] = 16 + Math.sin(u * 17) * 1.2 + Math.sin(u * 5.3 + 1) * 1.6; p[2] *= 0.25; } else p[1] = -1; }, 60);
    back.add(node('sea-wall', gradientY(wave, dark ? '#20389c' : '#4a58c0', dark ? '#5f7ce8' : '#8f9cf0', 0, 16), M.farFlat, { pos: [0, WATER, -170] }));
    back.add(node('sea-crest', tint(place(tube(curve(Array.from({ length: 15 }, (_, i) => { const u = (i - 7) / 7; return [u * 210, 16.2 + Math.sin(u * 17) * 1.2 + Math.sin(u * 5.3 + 1) * 1.6, -166]; }), 60), 0.8, 4, { crease: 180 }), 0, WATER, 0), '#ffffff'), M.farFlat));
  }

  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  env.sky.sunDir = norm3(env.sky.sunDir);
  env.water.level = WATER;
  env.water.shores = [[0, QUAY_Z + 0.1 + 900, 900, 0.75], [COLLIER[0], COLLIER[2], 3.2, 0.7], [COLLIER[0] - 1.2, COLLIER[2] - 4.6, 3.0, 0.7], [COLLIER[0] + 1.2, COLLIER[2] + 4.6, 2.6, 0.7], [PACKET[0], PACKET[2], 2.6, 0.6], [PACKET[0] + 0.9, PACKET[2] - 3.4, 2.2, 0.6], [PACKET[0] - 0.9, PACKET[2] + 3.4, 2.0, 0.6], [-37, MOLE_Z, 6, 1], [37, MOLE_Z, 6, 1]];
  const setNode = mergeStatic(set, 'set'), farNode = mergeStatic(far, 'far');
  scene.root.add(setNode, farNode, mergeStatic(back, 'back'));

  // ---- cobbles
  const cob = node('cobbles', cobble(), M.flat); cob.castShadow = false;
  const cobCols = ['#fbeccc', '#e6d0a4', '#f6e2ba', '#e2caa0', '#d8d0e8'];
  scatter(cob, low ? 260 : 440, (i) => {
    const col = i % 20, row = Math.floor(i / 20), x = -6.6 + col * 0.68 + (row % 2) * 0.34 + (r() - 0.5) * 0.16, z = QUAY_Z + 0.95 + row * 0.52 + (r() - 0.5) * 0.12;
    if (r() < 0.4) return null;
    const sc = 0.2 + r() * 0.09; return { m: m4.trs(x, 0.002, z, 0, r() * 360, 0, sc * 1.3, 1, sc * 0.9), color: cobCols[Math.floor(r() * cobCols.length)] };
  });
  scene.root.add(cob);

  const fg = group('fg');
  fg.add(node('fg1', cask({}), M.prop, { pos: [-1.9, 0, 2.8] }), node('fg2', cask({ r: 0.26, h: 0.62 }), M.prop, { pos: [-2.5, 0, 2.5] }), node('fg3', ropeCoil({ r: 0.24 }), M.prop, { pos: [1.5, 0, 2.7] }), node('fg4', sack({ seed: 3, s: 0.3, color: K6.salt }), M.prop, { pos: [2.2, 0, 2.9], rot: [0, -30, 0] }));
  const foreground = mergeStatic(fg, 'foreground'); scene.root.add(foreground);

  const sprites = scene.sprites = createSprites(low ? 192 : 384);

  // ---- two near hulls that swing at their anchors, the cutter, the open boat
  const nearHulls = [
    { n: node('near-hull1', hulk({ len: 10.5, hull: K6.cream, boot: K6.coral, roof: K6.teal, seed: 21 }), M.prop, { pos: [-5.2, WATER, -21] }), yaw: 164, ph: 0 },
    { n: node('near-hull2', hulk({ len: 9.5, hull: '#cfe6ff', boot: K6.teal, roof: K6.coral, seed: 25 }), M.prop, { pos: [6.4, WATER, -27] }), yaw: 204, ph: 2 },
  ];
  for (const h of nearHulls) { h.n.castShadow = false; scene.root.add(h.n); }
  const MOUTH_POS = [0.5, WATER, MOLE_Z + 5];
  const cutter = node('cutter', cutterHull({ len: 17 }), M.prop, { pos: MOUTH_POS, rot: [0, 98, 0] }); cutter.castShadow = false; cutter.visible = L.cutter;
  scene.root.add(cutter);
  const boatMesh = openBoat({ len: 6 });
  const boat = node('open-boat', boatMesh, M.prop, { pos: [0.4, WATER, QUAY_Z - 4] }); boat.castShadow = false; boat.visible = false;
  const oars = node('oars', oar({ len: 2.1 }), M.prop); oars.castShadow = false; oars.instances = makeInstances(8); oars.instances.count = 8; oars.visible = false;
  scene.root.add(boat, oars);

  // ---- light: the sun's shafts through the cranes, glows
  if (L.shaft > 0 && !low) {
    const kd = env.sky.sunDir, parts = [];
    for (const [x, z, len, w] of [[-3.5, -30, 30, 3.2], [3.0, -36, 34, 2.6], [-0.6, -8, 12, 1.5]]) {
      const yaw = Math.atan2(kd[0], kd[2]) / DEG, tilt = Math.acos(Math.max(0.12, kd[1] + 0.12)) / DEG;
      parts.push(place(rayMesh(len, 0.6, w, 10), x + kd[0] * len, (kd[1] + 0.12) * len - 0.4, z + kd[2] * len, tilt, yaw, 0));
    }
    scene.root.add(node('sun-shafts', tint(merge(parts), light === 'dawn' ? '#ffd890' : '#fff0d0'), rayMaterial({ power: 1.3, near: L.shaft, far: L.shaft * 0.3 })));
  }
  const postLamp = anchorAt(post, 'lamp', POST, 180);
  const lamps = [
    { name: 'quay-post', pos: postLamp, color: '#ffc870', radius: 8.5, base: 1.6 },
    { name: 'casks', pos: [-1.5, 2.4, 0.2], color: '#ffa444', radius: 11, base: 1.7 },
    { name: 'collier', pos: [-6.6, 2.3, -7.4], color: '#ffb860', radius: 5, base: 0.8 },
    { name: 'crane-cab', pos: anchorAt(quayCrane, 'lamp', QC, QC_YAW), color: '#ffc060', radius: 4.6, base: 0.9 },
  ];
  const glows = [{ sprite: sprites.add({ kind: 'glow', pos: postLamp, size: 1.9, color: '#ffb450', alpha: 0 }), base: 0.5 }];
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: LAMP, size: L.flame === 'white' ? 26 : 20, color: L.lampGlow, alpha: 0 }), base: L.flame === 'white' ? 0.5 / L.power : 0.6 / L.power, fixed: true });
  const lampStar = sprites.add({ kind: 'sparkle', pos: LAMP, size: L.flame === 'white' ? 12 : 5, color: L.flame === 'white' ? '#ffffff' : '#e0d4ff', alpha: 0.9 });
  for (const p of cabWins) glows.push({ sprite: sprites.add({ kind: 'glow', pos: p, size: 3.4, color: '#ffc860', alpha: 0 }), base: 0.34 / L.power, fixed: true });
  if (!low || dark) for (let i = 0; i < ridingLights.length; i += dark ? 1 : 3) glows.push({ sprite: sprites.add({ kind: 'glow', pos: ridingLights[i], size: dark ? 2.4 : 1.6, color: '#ffe9a0', alpha: 0 }), base: (dark ? 0.6 : 0.3) / L.power, fixed: true });
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: [-2.8, 1.6, -2.75], size: 1.5, color: '#ffb450', alpha: 0 }), base: 0.5 });
  const cutterGlow = sprites.add({ kind: 'glow', pos: [MOUTH_POS[0], WATER + 9.5, MOUTH_POS[2]], size: 7, color: '#ffffff', alpha: L.cutter ? 0.5 : 0 });

  // ---- sky
  const clouds = cloudBank({ style: low ? 'painted' : 'solid', count: 9, seed: 17, arc: [156, 206], radius: [250, 430], height: [20, 130], size: [0.7, 1.5], speed: 0.05, ...L.cloud });
  scene.root.add(clouds.node);
  const high = low ? null : cloudBank({ style: 'painted', count: 6, seed: 37, arc: [150, 212], radius: [300, 420], height: [170, 320], size: [0.9, 1.7], speed: 0.04, ...L.cloud });
  if (high) scene.root.add(high.node);
  const GULLS = low ? 0 : 5;
  const gulls = node('gulls', gull({}), M.speck); gulls.instances = makeInstances(5); gulls.instances.count = GULLS;
  if (GULLS && !dark) scene.root.add(gulls);
  // the collier's house flag: its own node, so it can lift
  const flag = node('flag', merge(tint(extrude([[0, 0], [0.9, 0.05], [0.86, 0.5], [0, 0.52]], 0.016, { crease: 30 }), K6.coral), tint(extrude([[0.2, 0.16], [0.6, 0.18], [0.6, 0.36], [0.2, 0.36]], 0.022, { crease: 30 }), K6.cream)), M.prop, { pos: [-9, 6.6, -11] }); flag.castShadow = false;
  scene.root.add(node('flag-staff', tint(place(cylinder(0.05, 0.035, 5.4, 6), -9, 1.9, -11), K6.timberDark), M.prop), flag);

  const actors = group('actors'); scene.root.add(actors);

  // ---- per frame
  let boatGoal = 0, boatNow = 0, boatRate = 1 / 55, stroke = 0;
  const P = [0, 0, 0], V = [0, 0, 0], S3 = [1, 1, 1], Q = quat.create(), Mx = m4.create(), rnd = rng(77), rowlocks = boatMesh.anchors.rowlocks;
  let nextRing = 0.5, nextGust = 1.4, nextSpark = 0, nextPuff = 0.8;
  const BOAT_Z0 = QUAY_Z - 4.5, BOAT_HOLD = MOLE_Z + 15, BOAT_OUT = MOLE_Z - 14;
  function setBoat(v) { boatGoal = Math.max(0, Math.min(1, v)); if (boatGoal === 0) boatNow = 0; }
  function cue(lineId) {
    if (typeof lineId !== 'string' || !lineId.startsWith('ch6.s7.c')) return false;
    const n = Number(lineId.slice(8));
    if (n >= 26) { setBoat(1); return true; }
    if (n >= 16) { setBoat(0.82); return true; }       // rows out and lies under the cutter's rail until she is let through
    return false;
  }
  function tick(time, dt, pw, live) {
    for (let i = 0; i < nearHulls.length; i++) { const h = nearHulls[i]; h.n.position[1] = WATER + Math.sin(time * 0.9 + h.ph) * 0.06; h.n.setRot(Math.sin(time * 0.8 + h.ph) * 1.6, h.yaw + Math.sin(time * 0.17 + h.ph) * 5, Math.sin(time * 1.1 + h.ph * 2) * 2.2); }
    cutter.position[1] = WATER + Math.sin(time * 0.8 + 1) * 0.05; cutter.setRot(Math.sin(time * 0.7) * 1.2, 98, Math.sin(time * 1.0) * 1.6);
    lampStar.alpha = 0.75 + 0.2 * Math.sin(time * 2.3); lampStar.rot = time * 0.1;
    flag.setRot(Math.sin(time * 2.3) * 6, -70 + Math.sin(time * 1.3) * 14, 5 + Math.sin(time * 3.1) * 7);
    clouds.update(time); if (high) high.update(time);
    for (let i = 0; i < GULLS; i++) {
      const a = time * (0.22 + i * 0.03) * (i % 2 ? 1 : -1) + i * 1.9, rad = 6 + i * 2.2, cx = -4 + i * 2.6, cz = -22 - i * 6;
      P[0] = cx + Math.cos(a) * rad; P[1] = 5 + i * 1.3 + Math.sin(time * 0.5 + i) * 0.8; P[2] = cz + Math.sin(a) * rad * 0.6;
      quat.fromEuler(Q, 0, Math.sin(a) * 0.35, Math.cos(a) * 0.3 * (i % 2 ? 1 : -1));
      const flap = Math.sin(time * (5.5 + i * 0.4) + i * 2); S3[0] = 1.9; S3[1] = 1.9 * (0.5 + 1.3 * flap); S3[2] = 1.9;
      if (Math.abs(S3[1]) < 0.12) S3[1] = 0.12;
      m4.fromTRS(Mx, P, Q, S3); gulls.instances.data.set(Mx, i * 20);
    }
    gulls.instances.dirty = true;
    // the open boat: out down the lane at the pace of the chant
    boatNow += Math.max(-dt, Math.min(dt * boatRate, boatGoal - boatNow));
    const out = boatGoal > 0;
    boat.visible = oars.visible = out;
    if (out) {
      const u = boatNow, z = u < 0.82 ? BOAT_Z0 + (BOAT_HOLD - BOAT_Z0) * (u / 0.82) : BOAT_HOLD + (BOAT_OUT - BOAT_HOLD) * ((u - 0.82) / 0.18), moving = Math.abs(boatGoal - boatNow) > 0.002 ? 1 : 0.25;
      stroke += dt * 2.1 * moving;
      const bx0 = 0.4 + Math.sin(u * 5) * 0.5, by = WATER + Math.sin(time * 1.3) * 0.04, surge = Math.max(0, Math.sin(stroke)) * 0.3 * moving;
      boat.position[0] = bx0; boat.position[1] = by; boat.position[2] = z - surge; boat.setRot(Math.sin(time * 1.1) * 1.5 - surge * 3, 180, Math.sin(time * 1.6) * 2);
      for (let i = 0; i < 8; i++) { // four oars a side, all together: the boat points toward -Z, so its starboard is at -X
        const side = i < 4 ? 1 : -1, rl = rowlocks[i % 4], sweep = Math.sin(stroke) * 30, dip = Math.cos(stroke) > 0 ? -14 : 8;
        P[0] = bx0 - side * rl[0]; P[1] = by + rl[1]; P[2] = z - surge - rl[2];
        quat.fromEuler(Q, 0, (side > 0 ? 180 : 0) * DEG + side * sweep * DEG, (dip - 6) * DEG); S3[0] = S3[1] = S3[2] = 1;
        m4.fromTRS(Mx, P, Q, S3); oars.instances.data.set(Mx, i * 20);
      }
      oars.instances.dirty = true;
      if (live && moving === 1 && Math.sin(stroke) > 0.95 && time > nextPuff) { nextPuff = time + 0.6; P[0] = bx0; P[1] = WATER + 0.03; P[2] = z + 3.2; V[0] = 0; V[1] = 0; V[2] = 0.3; sprites.spawn({ kind: 'ring', pos: P, vel: V, size: 0.6, endSize: 3.4, life: 3.5, color: '#fffaf0' }); }
    }
    if (live) {
      if (time > nextRing) { nextRing = time + 1.5; P[0] = -7 + rnd() * 14; P[1] = WATER + 0.03; P[2] = QUAY_Z - 1.2 - rnd() * 7; sprites.splash(P, { size: 0.9 + rnd() * 0.6, life: 1.5, spray: 0, color: dark ? '#bcd4ff' : '#fff6e4' }); }
      if (!low && time > nextGust) { nextGust = time + 2.6 + rnd() * 1.6; P[0] = -4 + rnd() * 4; P[1] = 2.4 + rnd() * 3; P[2] = -6 + rnd() * 5; V[0] = 1.9; V[1] = 0.1; V[2] = 0.3; sprites.gust(P, { vel: V, size: 0.9 + rnd() * 0.5, life: 2.2, alpha: 0.8, color: dark ? '#c6d6ff' : '#fff6e6' }); }
      if (time > nextSpark) { // salt in the air off the casks, and glints on the sun's road
        nextSpark = time + 0.22; P[0] = -3 + rnd() * 6; P[1] = WATER + 0.1; P[2] = -9 - rnd() * 40; V[0] = 0; V[1] = 0.02; V[2] = 0;
        sprites.spawn({ kind: 'sparkle', pos: P, vel: V, size: 0.5 + rnd() * 0.7, life: 0.9, color: dark ? '#cfdcff' : '#fff4c0' });
        P[0] = -3.6 + rnd() * 7.2; P[1] = 0.4 + rnd() * 2.2; P[2] = -4 + rnd() * 5; V[0] = 0.14; V[1] = 0.1; V[2] = 0.03;
        sprites.spawn({ kind: 'glow', pos: P, vel: V, size: 0.07 + rnd() * 0.06, life: 4.5, color: dark ? '#cfdcff' : '#fff2d0', alpha: 0.8 });
      }
    }
  }

  return shell({
    id: 'kedge-roads', light, L, low, scene, cameras: CAMERAS, actors, foreground, lamps, glows, tick, cue,
    marks: { ...STD_MARKS(), gangway: { pos: [GANG[0] + 0.5, 0, GANG[2] + 0.9], face: 30 }, focus: LAMP, mouth: MOUTH_POS },
    extra: { setBoat },
  });
}

export const kedgeRoads = { id: 'kedge-roads', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default kedgeRoads;
