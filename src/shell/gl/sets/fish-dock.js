// SET: fish-dock. Vessery's Dock Quarter by day: the gutting trestles cleared and laid as a table for the Tribune, nets
// drying, boats at the quay, and across the harbour the red roofs climbing the Hill to the Mint hall and its copper dome.
// Chapter 7: ch7.pro.09 (the morning lane in), ch7.s2 (the seventh hearing: the roll of struck names, the slate),
// ch7.s4.c03 (the drum carried down and counted on the trestles until the light goes), ch7.s6 (Thorne reads the bond).
//
//   import { fishDock } from './sets/fish-dock.js';
//   const set = fishDock.build(GL, { light: 'morning' | 'dusk', low: false });
//
// The shape is lantern-stalls' (see ../index.js). Figures face +Z, cameras look toward -Z: "the Tribune's back to the water
// and the Mint hall above her". The strip x -4.4..4.4, z -0.1..1.6 is clear. Added here:
//   setCrowd(0..1)      how much of the Dock Quarter has turned out (0.5 as built; the roll in s2 fills it)
//   setDrum(on)         the lot drum on the hearing trestle, unsealed, with the tied bundles of fifty beside it (ch7.s4.c03 on)
//   setTally(0..1)      how much of the slate is chalked
//   cue(lineId)         the above, keyed to the script (ch7.pro / s2 / s4 / s6)
//   task('struck-roll')  ch7.s2: the quarter turns out with the objective (0.4 -> 1) and the slate is chalked from a third on
//   task('quay-walk')    ch7.s6: the dock gathers (0.55 -> 0.9) as the Assessor brings his prisoner along the quay
//   setback()           the crowd presses and a third of it gives back for two seconds (also passLamp)
//   The core's 'day' builds 'morning'.
//   marks.table         where the hearing sits;  marks.slate (Tobb, tally clerk);  marks.box (the fish box the Tribune is lent);
//   marks.dockEnd       where she stands with her back to the count (ch7.s4.c18);  marks.focus  the dome's brass lantern
// 'morning' is a high clear sun and capped lamps: setPower turns the daylight up and down a little and sets the harbour
// glittering. 'dusk' is the end of the count: a low sun down the harbour, the quay lamps and the town's windows lit.
// low: true halves the crowd and the paving, drops the headland, lighthouse and far glows, and unlines the far shore.

import { m4, quat, rng, DEG, rgb } from '../math.js';
import { merge, tint, place, plane, box, tube, curve, cylinder, setGlow } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic, makeInstances } from '../scene.js';
import { createSprites } from '../sprites.js';
import { rayMaterial } from '../fx.js';
import {
  PAL, kitMaterials, anchorAt, scatter, pickLight, crate, barrel, bollard, lampPost, pole, headland, lighthouse, cloudBank, gull, cobble, planks,
} from './kit.js';
import {
  coreLight, taskUnit, pulse,
  C7, STD_MARKS, STD_CAMERAS, shell7, sunShafts, rows, folk7, dirFrom, norm7,
  trestle, fishBox, basket, fish, dryingNet, skiff, cutter, moleWall, quay7, slate, mintHall, hillTown, lotDrum7, slipBundle, shipLantern, paperStack,
} from './kit-ch7.js';

const QUAY_Z = -6.6, WATER = -0.55;
const SMOCKS = ['#4fc0d4', '#ff9470', '#ffd24a'];   // dock smocks, dyed in the mesh (kit-ch7 folk7)

const LIGHTS = {
  morning: {
    preset: 'day', power: 0, sun: 0.34, crowd: 0.55,
    env: {
      key: { dir: dirFrom(-108, 43), color: '#fff6dc' },
      shadow: { tint: '#8a94ea', lift: 0.07, saturate: 1.35 },
      ambient: { sky: '#bfe4ff', ground: '#ffe9b0', amount: 0.11 },
      fog: { density: 0.0026, start: 24, max: 0.8 },
      sky: { zenith: '#1a62d8', mid: '#4aa8f2', midAt: 0.4, horizon: '#c9eefa', below: '#8fd6ea', glow: '#fffbe0', glowAmount: 0.55, sunDir: dirFrom(-8.5, 15.5), sun: { size: 2.5, haloAmount: 0.6 } },
      water: { deep: '#1a86d8', mid: '#2bb4e4', shallow: '#74e6dc', foam: '#ffffff', glint: '#f4fdff', glintDensity: 0.3 },
    },
    cloud: { color: '#ffffff', shadowTint: '#b4c6f8' }, ray: 0.13, rayColor: '#fff6d0', mote: '#ffffff', town: 0,
  },
  dusk: {
    preset: 'sunset', power: 1, sun: 0.15, crowd: 1,
    env: {
      key: { dir: dirFrom(-20, 17), color: '#ffdcae' },
      shadow: { tint: '#7c74e0', lift: 0.1, saturate: 1.4 },
      ambient: { sky: '#ffa98e', ground: '#7d6ad0', amount: 0.17 },
      rim: { color: '#ffd98a', amount: 1.0, edge: 0.72 },
      fog: { density: 0.003, start: 22, max: 0.84 },
      sky: { zenith: '#3a4cc8', mid: '#a184ee', midAt: 0.48, horizon: '#ffcf70', below: '#f6a878', glow: '#ffe890', glowAmount: 0.6, sunDir: dirFrom(-9, 5.2), sun: { color: '#fffbe0', size: 2.4, halo: '#ffd070', haloAmount: 0.45 } },
      water: { deep: '#2a56c0', mid: '#4a8fe0', shallow: '#ffb890', foam: '#fff6e4', glint: '#ffe7a0', glintDensity: 0.34 },
    },
    cloud: { color: '#ffd9b4', shadowTint: '#c878b8' }, ray: 0.3, rayColor: '#ffd088', mote: '#ffd070', town: 1,
  },
};

const CORE = { day: 'morning' };      // the core's light names this set answers ('dusk' is its own)

const CAMERAS = STD_CAMERAS({
  wide: { target: [0.1, 1.72, -0.4], dist: 8.3, yaw: 3, pitch: 4.5 },
  low: { target: [0.2, 2.0, 0.2], dist: 6.3, yaw: -6, pitch: -12 },
});

function build(engine = null, { light, low = false } = {}) {
  const picked = pickLight('fish-dock', LIGHTS, coreLight(light, CORE)), L = picked.L; light = picked.name;
  const M = kitMaterials(), r = rng(7071), FAR = low ? M.farFlat : M.far, lit = L.power > 0;
  const TABLE = [0.15, 0, -1.95], SLATE = [2.45, 0, -2.05], SLATE_YAW = -20;

  // ---- ground: the dock floor, a planked apron along the edge, the quay wall
  const ground = group('ground');
  ground.add(node('floor', tint(place(plane(96, 26, 1, 1), 0, 0, QUAY_Z + 0.3 + 13), '#f4e3b6'), M.ground));
  ground.add(node('apron', place(planks({ w: 40, d: 2.2, seed: 5, plank: 0.55, colors: ['#e9b06c', '#dca25e', '#f0bd7c'] }), 0, 0.035, QUAY_Z + 1.55), M.ground));
  ground.add(node('quay', quay7({ len: low ? 30 : 44, drop: 1.7, seed: 6 }), M.ground, { pos: [0, 0, QUAY_Z] }));
  for (const sx of [-1, 1]) ground.add(node('quay-far', tint(place(box(30, 1.9, 0.5), sx * (low ? 30 : 37), -0.95, QUAY_Z + 0.3), PAL.stone2), M.ground));
  ground.traverse((n) => { n.castShadow = false; });

  // ---- near statics
  const near = group('near');
  const table = trestle({ w: 2.9, d: 0.95, h: 0.82, seed: 3 });
  near.add(node('table', table, M.prop, { pos: TABLE, rot: [0, 3, 0] }));
  // the table they laid her: a runner, the roll, a hand bell
  near.add(node('runner', tint(place(box(1.2, 0.02, 1.0), 0, 0.83, 0), C7.teal), M.prop, { pos: TABLE, rot: [0, 3, 0] }));
  near.add(node('roll', place(paperStack({ n: 4, seed: 2, colors: [C7.paper, C7.parchment, '#ffe6b0'] }), -0.75, 0.84, 0.05), M.prop, { pos: TABLE }));
  near.add(node('bell', merge(tint(place(cylinder(0.11, 0.035, 0.15, 7), 0, 0, 0), C7.brass), tint(place(cylinder(0.02, 0.02, 0.12, 4), 0, 0.15, 0), C7.woodDark)), M.prop, { pos: [TABLE[0] + 1.05, 0.84, TABLE[2] + 0.1] }));
  const sl = slate({ count: 62, figure: '900', seed: 4 });
  near.add(node('slate', sl.stand, M.prop, { pos: SLATE, rot: [0, SLATE_YAW, 0] }));
  const BOX = [-1.75, 0, -1.2];
  near.add(node('seat', fishBox({ catchIn: false, seed: 9, h: 0.3 }), M.prop, { pos: BOX, rot: [180, 16, 0], }));
  near.children[near.children.length - 1].position[1] = 0.3;
  // the other trestles, cleared; the catch is in boxes on the ground beside them
  const TR = [[-4.5, -2.7, 14, 2.3], [-7.3, -1.7, 28, 2.1], [4.6, -3.0, -12, 2.4], [7.4, -1.9, -27, 2.1], [-3.0, -4.9, -5, 2.2], [3.4, -5.1, 7, 2.2]];
  TR.forEach(([x, z, yaw, w], i) => { if (low && i >= 4) return; near.add(node('trestle' + i, trestle({ w, seed: 10 + i }), M.prop, { pos: [x, 0, z], rot: [0, yaw, 0] })); });
  const BOXES = [[-3.35, 0, -1.45, 20, 1], [-3.3, 0.25, -1.5, -6, 1], [-5.6, 0, -3.6, 70, 1], [5.9, 0, -1.25, -30, 1], [5.85, 0.25, -1.3, 10, 0], [3.3, 0, -1.75, 84, 1], [-6.2, 0, -0.6, 10, 0], [6.6, 0, -3.7, 40, 1], [-1.2, 0, -5.5, 4, 1], [1.5, 0, -5.7, -8, 1]];
  BOXES.forEach(([x, y, z, yaw, c], i) => { if (low && i % 3 === 2) return; near.add(node('fishbox' + i, fishBox({ seed: i + 1, catchIn: !!c }), M.prop, { pos: [x, y, z], rot: [0, yaw, 0] })); });
  near.add(node('basket1', basket({}), M.prop, { pos: [-4.1, 0, -1.2] }), node('basket2', basket({ r: 0.26, h: 0.34 }), M.prop, { pos: [4.25, 0, -1.6] }), node('basket3', basket({ full: false }), M.prop, { pos: [-2.5, 0, -3.7] }));
  near.add(node('barrel', barrel({ r: 0.3, h: 0.74 }), M.prop, { pos: [-5.3, 0, -1.4] }), node('crate', crate({ s: 0.55, seed: 3 }), M.prop, { pos: [8.4, 0, -0.9], rot: [0, 20, 0] }));
  for (const [x, z, yaw] of [[-4.5, -2.7, 14], [4.6, -3.0, -12]]) near.add(node('fishrow', merge(place(fish({ len: 0.36 }), -0.5, 0.82, 0.1, 0, 20, 0), place(fish({ len: 0.3 }), 0.1, 0.82, -0.1, 0, 170, 0), place(fish({ len: 0.4 }), 0.6, 0.82, 0.12, 0, -10, 0)), M.prop, { pos: [x, 0, z], rot: [0, yaw, 0] }));
  // nets drying between poles, gulls' perches
  const NETS = [[[-6.9, 0, -5.0], [-3.6, 0, -5.75], 3.5, 2], [[3.95, 0, -5.8], [7.1, 0, -5.1], 3.3, 6]];
  for (const [a, b, h, seed] of NETS) {
    const pa = pole({ h, seed, knob: C7.cork }), pb = pole({ h: h - 0.2, seed: seed + 1, knob: PAL.teal });
    near.add(node('pole', pa, M.prop, { pos: a }), node('pole', pb, M.prop, { pos: b }));
    near.add(node('net', dryingNet(anchorAt(pa, 'top', a), anchorAt(pb, 'top', b), { drop: 2.0, seed, color: seed === 2 ? C7.net : '#3a78c8' }), M.prop));
  }
  // the quay lamps (capped by day) and the lantern by the slate
  const POSTS = [{ pos: [-2.35, 0, QUAY_Z + 0.72], yaw: 0 }, { pos: [8.6, 0, QUAY_Z + 0.7], yaw: 180 }].map((p) => { const m = lampPost({ h: 3.0, arm: 0.6, lit }); near.add(node('post', m, M.prop, { pos: p.pos, rot: [0, p.yaw, 0] })); return { ...p, mesh: m }; });
  const CROOK = [SLATE[0] + 0.85, 0, SLATE[2] - 0.35], crookTop = [CROOK[0] - 0.42, 2.25, CROOK[2] + 0.05];
  near.add(node('crook', merge(tint(tube(curve([[CROOK[0], 0, CROOK[2]], [CROOK[0] + 0.05, 1.5, CROOK[2]], [CROOK[0] - 0.05, 2.3, CROOK[2]], [crookTop[0], crookTop[1] + 0.06, crookTop[2]]], 10), (t) => 0.05 - 0.02 * t, 5, { crease: 180 }), PAL.woodDark), tint(place(cylinder(0.14, 0.11, 0.16, 6), CROOK[0], 0, CROOK[2]), PAL.stone2)), M.prop));
  const lanternMesh = shipLantern({ drop: 0.3, s: 1.5, glass: lit ? '#ffe6a0' : '#eaf2ff' });
  if (!lit) setGlow(lanternMesh, 0.1);
  near.add(node('table-lantern', lanternMesh, M.prop, { pos: crookTop }));
  for (const x of [1.3, -4.6, 5.9]) near.add(node('bollard', bollard({ s: 1.15 }), M.prop, { pos: [x, 0, QUAY_Z + 0.62] }));
  near.add(node('moor', merge(
    tint(tube(curve([[1.3, 0.33, QUAY_Z + 0.62], [1.5, 0.05, QUAY_Z + 0.1], [1.9, -0.3, QUAY_Z - 0.7], [2.3, WATER + 0.3, QUAY_Z - 1.6]], 8), 0.028, 4, { crease: 180 }), PAL.rope),
    tint(tube(curve([[-4.6, 0.33, QUAY_Z + 0.62], [-4.4, 0.05, QUAY_Z + 0.1], [-4.0, -0.3, QUAY_Z - 0.6], [-3.7, WATER + 0.3, QUAY_Z - 1.3]], 8), 0.028, 4, { crease: 180 }), PAL.rope)), M.prop));

  // ---- across the harbour: the mole with the Audit cutter, the Hill, the Mint hall on its crown, a headland and the light
  const far = group('far');
  const MOLE = [36, 0.45, -32], moleMesh = moleWall({ len: 30, w0: 4.2, w1: 3.2, drop: 1.6, seg: 8, seed: 3 });
  far.add(node('mole', moleMesh, FAR, { pos: MOLE, rot: [0, 90, 0] }));
  const CUT = [3.6, WATER, -29.4], cutMesh = cutter({ len: 11.5, lit });
  far.add(node('cutter', cutMesh, FAR, { pos: CUT, rot: [0, 176, 0] }));
  const TOWN = [1.5, WATER + 0.3, -60], town = hillTown({ w: 116, d: 34, h: 12, rows: 4, seed: 4, crownX: 0.5, crownW: 20, windows: !low });
  far.add(node('town', town, FAR, { pos: TOWN }));
  far.add(node('town-foot', tint(place(box(124, 2.6, 3), 0, -0.9, 1.4), PAL.stoneDark), FAR, { pos: TOWN }));
  const HALL_S = 1.4, crown = anchorAt(town, 'crown', TOWN), hallMesh = mintHall({ detail: 0, w: 12, cols: 6, body: 7 });
  far.add(node('hall', hallMesh, FAR, { pos: [crown[0], crown[1] + 0.3, crown[2]], scale: HALL_S }));
  far.add(node('hall-steps', tint(place(box(12 * HALL_S, 1.4, 3), 0, -0.4, 1.2), C7.stone2), FAR, { pos: crown }));
  const FINIAL = anchorAt(hallMesh, 'finial', [crown[0], crown[1] + 0.3, crown[2]], 0, HALL_S);
  let lh = null, LH = [-62, 0, -118];
  if (!low) {
    const HEAD = [-104, -0.6, -124], headMesh = headland({ w: 100, d: 34, h: 10, seed: 3, seg: 24, rings: 10 });
    far.add(node('headland', headMesh, FAR, { pos: HEAD }));
    { let top = 0; const Pm = headMesh.positions; for (let i = 0; i < Pm.length; i += 3) if (Math.hypot(Pm[i] + HEAD[0] - LH[0], Pm[i + 2] + HEAD[2] - LH[2]) < 6 && Pm[i + 1] > top) top = Pm[i + 1]; LH[1] = HEAD[1] + top - 0.8; }
    lh = lighthouse({ h: 13, r: 2.3, lit }); far.add(node('lighthouse', lh, FAR, { pos: LH }));
    far.add(node('smack', skiff({ len: 6, hull: '#fff6dc', keel: PAL.teal, pennant: PAL.red, seed: 5 }), FAR, { pos: [-13, WATER, -30], rot: [0, 150, 0] }));
  }

  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  env.sky.sunDir = norm7(env.sky.sunDir); env.water.level = WATER;
  const BOATS = [{ pos: [-3.7, WATER + 0.02, QUAY_Z - 1.55], yaw: 78, s: 1, col: '#ffffff' }, { pos: [2.5, WATER + 0.02, QUAY_Z - 1.9], yaw: 104, s: 1.12, col: '#bfe8ff' }, { pos: [7.2, WATER + 0.02, QUAY_Z - 3.0], yaw: 168, s: 1.5, col: '#ffe2c8' }, { pos: [-9.5, WATER + 0.02, QUAY_Z - 2.6], yaw: 20, s: 1.3, col: '#d8ffd8' }];
  env.water.shores = [[0, QUAY_Z + 0.1 + 900, 900, 0.75], ...BOATS.map((b) => [b.pos[0], b.pos[2], 0.9 * b.s, 0.45]), [CUT[0], CUT[2], 3.4, 0.6], [CUT[0] + 3, CUT[2], 2.6, 0.6], [CUT[0] - 3, CUT[2], 2.6, 0.6], [TOWN[0], TOWN[2] + 3 - 900, 900, 1.2]];
  near.traverse((n) => { if (n.name === 'fishrow' || n.name === 'roll' || n.name === 'runner') n.castShadow = false; });
  scene.root.add(mergeStatic(ground, 'ground'), mergeStatic(near, 'near'), mergeStatic(far, 'far'));

  // ---- the slate's chalk: its own node, so the tally can grow
  const chalkNode = node('chalk', sl.marks, M.flat, { pos: SLATE, rot: [0, SLATE_YAW, 0] }); chalkNode.castShadow = false; scene.root.add(chalkNode);

  // ---- paving: one instanced draw
  const cob = node('cobbles', cobble(), M.flat); cob.castShadow = false;
  const cobCols = ['#fff0cc', '#ecd6a4', '#f8e2b6', '#e6cd9c', '#f4dcae'];
  scatter(cob, low ? 170 : 420, (i) => {
    const col = i % 21, row = Math.floor(i / 21), x = -7.2 + col * 0.72 + (row % 2) * 0.36 + (r() - 0.5) * 0.18, z = QUAY_Z + 3.0 + row * (low ? 1.2 : 0.5) + (r() - 0.5) * 0.14;
    if (r() < 0.42) return null;
    const sc = 0.22 + r() * 0.1; return { m: m4.trs(x, 0.002, z, 0, r() * 360, 0, sc * 1.3, 1, sc * 0.9), color: cobCols[Math.floor(r() * cobCols.length)] };
  });
  scene.root.add(cob);

  // ---- foreground: fish boxes and a creel at the edges of the wide shot
  const fg = group('fg');
  fg.add(node('fg1', fishBox({ seed: 21 }), M.prop, { pos: [-1.65, 0, 2.95], rot: [0, 24, 0] }), node('fg2', basket({ r: 0.24 }), M.prop, { pos: [-2.25, 0, 2.6] }), node('fg3', fishBox({ seed: 23, catchIn: false }), M.prop, { pos: [1.75, 0, 3.0], rot: [0, -28, 0] }), node('fg4', barrel({ r: 0.26, h: 0.62 }), M.prop, { pos: [2.35, 0, 2.6] }));
  const foreground = mergeStatic(fg, 'foreground'); scene.root.add(foreground);

  // ---- the lot drum on the hearing trestle (ch7.s4.c03 on): unsealed, hatch up, the bundles of fifty tied off beside it
  const ld = lotDrum7({ r: 0.45, len: 0.98 }), drumG = group('drum-on-trestle');
  drumG.add(node('cradle', ld.cradle, M.prop), node('drum', ld.drum, M.prop, { pos: ld.anchors.axle, rot: [-36, 0, 0] }), node('hatch', ld.hatch, M.prop, { pos: ld.anchors.axle, rot: [-108, 0, 0] }));
  const bundles = []; for (let i = 0; i < 12; i++) bundles.push(place(slipBundle({ s: 1.1 }), 1.0 + (i % 3) * 0.23, Math.floor(i / 6) * 0.1, -0.2 + (Math.floor(i / 3) % 2) * 0.2, 0, (r() - 0.5) * 20, 0));
  for (let i = 0; i < 5; i++) bundles.push(place(slipBundle({ s: 1.1 }), -1.15 + (i % 2) * 0.22, Math.floor(i / 2) * 0.1, -0.1 + (i % 3) * 0.12, 0, 70 + (r() - 0.5) * 30, 0));
  drumG.add(node('bundles', merge(bundles), M.prop));
  const drumNode = mergeStatic(drumG, 'drum'); drumNode.position.set([TABLE[0], 0.83, TABLE[2]]); drumNode.visible = false; scene.root.add(drumNode);

  // ---- boats at the quay: one instanced draw, bobbing
  const boatNode = node('boats', skiff({ len: 2.7, seed: 2 }), M.prop); boatNode.castShadow = false; boatNode.instances = makeInstances(BOATS.length); boatNode.instances.count = BOATS.length;
  BOATS.forEach((b, i) => { const c = rgb(b.col); boatNode.instances.data.set(c, i * 20 + 16); });
  scene.root.add(boatNode);

  // ---- sprites, the crowd, lamps
  const sprites = scene.sprites = createSprites(low ? 192 : 384);
  const face = (p) => Math.atan2(TABLE[0] - p[0], TABLE[2] + 1.6 - p[2]) / DEG;
  const spots = [];
  { const L1 = rows(3, 13, -8.4, -3.9, -1.25, -4.3, face), R1 = rows(5, 13, 3.9, 8.4, -1.25, -4.3, face), B1 = [...rows(7, 5, -2.5, -0.9, -3.3, -4.4, face), ...rows(9, 5, 1.2, 2.9, -3.4, -4.5, face), ...rows(11, 6, -5.5, 5.5, -5.2, -5.9, face)];
    const clear = (s) => !TR.some(([x, z, , w]) => Math.abs(s.pos[0] - x) < w / 2 + 0.2 && Math.abs(s.pos[2] - z) < 0.75) && !BOXES.some(([x, , z]) => Math.hypot(s.pos[0] - x, s.pos[2] - z) < 0.55) && Math.hypot(s.pos[0] - SLATE[0], s.pos[2] - SLATE[2]) > 0.9 && Math.hypot(s.pos[0] - CROOK[0], s.pos[2] - CROOK[2]) > 0.5;
    const a = L1.filter(clear), b = R1.filter(clear), c = B1.filter(clear);
    for (let i = 0; i < Math.max(a.length, b.length, c.length); i++) { if (i < c.length) spots.push(c[i]); if (i < a.length) spots.push(a[i]); if (i < b.length) spots.push(b[i]); }
  }
  const folk = folk7({ spots: low ? spots.filter((_, i) => i % 2 === 0) : spots, material: M.prop, seed: 13, coats: SMOCKS.slice(0, low ? 1 : 2), amount: L.crowd });
  scene.root.add(folk.node);

  const postLamps = POSTS.map((p) => anchorAt(p.mesh, 'lamp', p.pos, p.yaw)), tableLamp = [crookTop[0], crookTop[1] - 0.66, crookTop[2]];
  const lamps = [
    { name: 'table', pos: tableLamp, color: '#ffbe62', radius: 6.4, base: 1.15 },
    { name: 'post-left', pos: postLamps[0], color: '#ffc870', radius: 5.4, base: 1 },
    { name: 'post-right', pos: postLamps[1], color: '#ffc870', radius: 5.4, base: 1 },
  ];
  const glows = [];
  if (lit) {
    glows.push({ sprite: sprites.add({ kind: 'glow', pos: tableLamp, size: 2.0, color: '#ffa848', alpha: 0 }), base: 0.6 });
    for (const p of postLamps) glows.push({ sprite: sprites.add({ kind: 'glow', pos: p, size: 1.8, color: '#ffb450', alpha: 0 }), base: 0.55 });
    glows.push({ sprite: sprites.add({ kind: 'glow', pos: anchorAt(cutMesh, 'lamp', CUT, 176), size: 4.5, color: '#fff0b0', alpha: 0 }), base: 0.7, fixed: true });
    if (!low) { anchorAt(town, 'windows', TOWN).filter((_, i) => i % 3 === 0).slice(0, 26).forEach((p) => glows.push({ sprite: sprites.add({ kind: 'glow', pos: p, size: 3.0, color: '#ffc060', alpha: 0 }), base: 0.5, fixed: true })); if (lh) glows.push({ sprite: sprites.add({ kind: 'glow', pos: anchorAt(lh, 'lamp', LH), size: 13, color: '#ffe08a', alpha: 0 }), base: 0.5, fixed: true }); }
  }
  // the focal light: the sun on the dome's brass lantern
  const domeGlow = sprites.add({ kind: 'glow', pos: FINIAL, size: lit ? 9 : 7, color: lit ? '#ffd27a' : '#fffbe0', alpha: 0 });
  const domeStar = sprites.add({ kind: 'sparkle', pos: FINIAL, size: 6.5, color: '#fffbe6', alpha: 0, rot: 0.2 });

  // ---- light: slants of sun across the dock (low: none), a cone under the lit lantern
  if (!low && L.ray > 0) {
    const kd = light === 'dusk' ? env.key.dir : norm7([-0.45, 0.8, -0.38]);
    scene.root.add(node('sun-shafts', sunShafts(kd, light === 'dusk' ? [[0.6, 0.9, 10, 1.3], [-1.2, 3.0, 11, 1.0]] : [[-1.6, -2.4, 9, 1.5], [1.9, -3.6, 10, 1.2], [-4.4, -4.6, 9, 1.1]], L.rayColor), rayMaterial({ power: 1.3, near: L.ray, far: L.ray * 0.3 })));
  }

  const clouds = cloudBank({ style: 'painted', count: 9, seed: 5, arc: [156, 206], radius: [250, 430], height: [30, 150], size: [0.7, 1.5], speed: 0.05, ...L.cloud });
  scene.root.add(clouds.node);
  const gulls = node('gulls', gull({}), M.speck); gulls.instances = makeInstances(6); gulls.instances.count = 6; scene.root.add(gulls);

  const actors = group('actors'); scene.root.add(actors);

  // ---- per-frame (allocation-free)
  const P = [0, 0, 0], V = [0, 0, 0], S3 = [1, 1, 1], Q = quat.create(), Mx = m4.create(), rnd = rng(77);
  let nextGlint = 0, nextMote = 0, nextRing = 0.6, nextGust = 1.5, tally = 1, drumOn = false, pressing = false;
  let crowdA = L.crowd, called = false;
  const setCrowd = (a) => { crowdA = a; folk.setAmount(a); };
  const setDrum = (on) => { drumOn = !!on; drumNode.visible = drumOn; };
  const setTally = (v) => { tally = Math.max(0, Math.min(1, v)); chalkNode.visible = tally > 0.02; chalkNode.tint[3] = 1; chalkNode.scale[1] = 1; };
  function cue(lineId) {
    const m = /^ch7\.(pro|s\d|epi|m\d)\.?[a-z]?(\d+)?/.exec(lineId || ''); if (!m) return false;
    const part = m[1], n = Number(m[2] || 0);
    if (part === 'pro') { setCrowd(0.55); setDrum(false); setTally(0); }
    else if (part === 's2') { setDrum(false); if (called) { if (n >= 10) called = false; } else { setCrowd(n >= 9 ? 1 : 0.8); setTally(n >= 10 ? 1 : 0); } }   // after the encounter the quarter is already out and the slate chalked: c01 does not send them home
    else if (part === 's4') { setCrowd(1); setDrum(true); setTally(1); }
    else if (part === 's6') { setCrowd(0.85); setDrum(false); setTally(1); }
    else return false;
    return true;
  }

  // the live stage's two tasks, and its setback
  const press = pulse(1.8);
  const rollUnit = taskUnit({
    pos: [SLATE[0], 1.45, SLATE[2] + 0.2], stand: null,
    apply(v, fresh) { if (fresh) { setDrum(false); called = true; } setCrowd(0.4 + 0.6 * v); setTally(v >= 0.3 ? v : 0); },
  });
  const walkUnit = taskUnit({
    pos: [TABLE[0], 1.1, TABLE[2] + 0.4], stand: null,
    apply(v, fresh) { if (fresh) { setDrum(false); setTally(1); called = false; } setCrowd(0.55 + 0.35 * v); },
  });
  /** 'struck-roll' (ch7.s2): the quarter turns out lane by lane and the slate is chalked. 'quay-walk' (ch7.s6): the dock gathers as she is brought along the quay. */
  const task = (type) => (type === 'struck-roll' ? rollUnit.arm() : type === 'quay-walk' ? walkUnit.arm() : null);
  /** The drain: the dock presses in to see and a third of it is pushed back out of the way again. */
  function setback() { press.hit(); }

  function tick(time, dt, pw, live, power) {
    const pr = press.value(dt);
    if (pr > 0 || pressing) { pressing = pr > 0; folk.setAmount(crowdA * (1 - 0.35 * pr)); }
    folk.update(time, dt, { lit: 0, lively: (drumOn ? 0.5 : 0.3) + 0.6 * pr });
    for (let i = 0; i < BOATS.length; i++) {
      const b = BOATS[i];
      P[0] = b.pos[0]; P[1] = b.pos[1] + Math.sin(time * 1.3 + i * 2.1) * 0.04; P[2] = b.pos[2];
      quat.fromEuler(Q, Math.sin(time * 1.1 + i) * 2.5 * DEG, (b.yaw + Math.sin(time * 0.3 + i) * 3) * DEG, Math.sin(time * 1.6 + 1 + i * 1.7) * 4 * DEG);
      S3[0] = S3[1] = S3[2] = b.s; m4.fromTRS(Mx, P, Q, S3); boatNode.instances.data.set(Mx, i * 20);
    }
    boatNode.instances.dirty = true;
    for (let i = 0; i < 6; i++) {
      const a = time * (0.22 + i * 0.03) * (i % 2 ? 1 : -1) + i * 1.9, rad = 6 + i * 2.0, cx = -5 + i * 2.6, cz = -15 - i * 4;
      P[0] = cx + Math.cos(a) * rad; P[1] = 4.2 + i * 1.1 + Math.sin(time * 0.5 + i) * 0.8; P[2] = cz + Math.sin(a) * rad * 0.6;
      quat.fromEuler(Q, 0, Math.sin(a) * 0.35, Math.cos(a) * 0.3 * (i % 2 ? 1 : -1));
      const flap = Math.sin(time * (5.5 + i * 0.4) + i * 2); S3[0] = 1.8; S3[1] = 1.8 * (0.5 + 1.3 * flap); S3[2] = 1.8;
      if (Math.abs(S3[1]) < 0.12) S3[1] = 0.12;
      m4.fromTRS(Mx, P, Q, S3); gulls.instances.data.set(Mx, i * 20);
    }
    gulls.instances.dirty = true;
    clouds.update(time);
    // the dome's lantern flashes in the sun; brighter with the table's power
    const flash = 0.5 + 0.5 * Math.pow(Math.abs(Math.sin(time * 0.7)), 3), sunK = 0.45 + 0.55 * Math.min(1.2, power);
    domeGlow.alpha = (lit ? 0.5 : 0.42) * sunK * (0.7 + 0.3 * flash); domeStar.alpha = 0.95 * sunK * flash; domeStar.rot = time * 0.25; domeStar.size[0] = domeStar.size[1] = 5 + 3.5 * flash;
    env.water.glintDensity = (lit ? 0.34 : 0.3) * (0.5 + 0.5 * Math.min(1.3, power));
    if (live) {
      if (time > nextGlint) { nextGlint = time + 0.09 / Math.max(0.3, power); P[0] = -12 + rnd() * 24; P[1] = WATER + 0.05; P[2] = QUAY_Z - 1 - rnd() * rnd() * 26; sprites.sparkle(P, { count: 1, size: 0.3 + (QUAY_Z - P[2]) * 0.03, spread: 0.2, life: 0.8, color: lit ? '#ffe9a8' : '#ffffff' }); }
      if (time > nextMote) { nextMote = time + (low ? 0.6 : 0.3); P[0] = -4 + rnd() * 8; P[1] = 0.3 + rnd() * 2.6; P[2] = -5 + rnd() * 6; V[0] = 0.12 + rnd() * 0.1; V[1] = 0.1 + rnd() * 0.14; V[2] = 0.05; sprites.spawn({ kind: 'glow', pos: P, vel: V, size: 0.08 + rnd() * 0.07, life: 4.5, color: L.mote, alpha: lit ? 0.9 : 0.55 }); }
      if (time > nextRing) { nextRing = time + 1.6; P[0] = -8 + rnd() * 16; P[1] = WATER + 0.03; P[2] = QUAY_Z - 1.2 - rnd() * 6; sprites.splash(P, { size: 0.9 + rnd() * 0.6, life: 1.4, spray: 0, color: '#fff6e4' }); }
      if (!low && time > nextGust) { nextGust = time + 2.8 + rnd() * 1.5; P[0] = -4 + rnd() * 3; P[1] = 2.6 + rnd() * 2.4; P[2] = -6 + rnd() * 5; V[0] = 2.0; V[1] = 0.1; V[2] = 0.25; sprites.gust(P, { vel: V, size: 0.9 + rnd() * 0.5, life: 2.2, alpha: 0.8, color: '#ffffff' }); }
    }
  }

  return shell7({
    id: 'fish-dock', light, low, L, scene, cameras: CAMERAS, actors, foreground, lamps, glows, sun: L.sun, tick,
    marks: {
      ...STD_MARKS(), focus: FINIAL, extras: [{ pos: [2.05, 0, 0.4], face: -50 }],      // by the hearing's trestle: who waits there for a walk to arrive (ch7.s6: the Tribune)
      table: { pos: [TABLE[0], 0, TABLE[2] + 0.75], face: 0 }, slate: { pos: [SLATE[0] - 0.75, 0, SLATE[2] + 0.55], face: 30 }, box: { pos: [BOX[0], 0, BOX[2]], face: 20 },
      dockEnd: { pos: [-5.0, 0, QUAY_Z + 1.3], face: 180 }, back: [[1.3, 0.1], [2.1, -0.05], [2.9, 0.15], [-1.3, 0.1], [-2.1, -0.05], [-2.9, 0.15]],
    },
    extra: { setCrowd, setDrum, setTally, cue, task, setback, passLamp: setback },
  });
}

export const fishDock = { id: 'fish-dock', lights: [...Object.keys(LIGHTS), ...Object.keys(CORE)], cameras: Object.keys(CAMERAS), build };
export default fishDock;
