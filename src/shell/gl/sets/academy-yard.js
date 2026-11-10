// SET: academy-yard. The parade ground of Halcyon Academy on its rock: ranks of cadets either side of a
// chained avenue, the Company's plumb-weight banner on a mast in the middle of it with a real brass bob
// hanging under the cloth, the barrack front and the gate tower behind (its clock on time, one lamp in a
// window at an hour when no lamp is needed), and off the edge of the rock the sea, the mole and the ferry.
// Chapter 3: ch3.s1 Parade (two thousand cadets and staff in ranks, an escort of twelve), and the epilogue
// (ch3.epi.05/09: a small figure in a cadet's coat holding a card above his head as the ferry clears the mole).
//
//   import { academyYard } from './sets/academy-yard.js';
//   const set = academyYard.build(GL, { light: 'morning' | 'dawn', low: false });
//
// Same shape as sets/lantern-stalls.js. Figures face +Z, cameras look toward -Z (the sun is that way, over the
// roofline, so the yard is backlit and every rank throws its shadow toward the camera). The strip x -3.2..3.2,
// z 0..1.6 is clear.
//
// What this set can do for its story:
//   setRanks(0..1)      how much of the parade is on the ground (the epilogue wants an empty yard: 0)
//   setEscort(on)       the escort of twelve, in the Proctor's teal, falls in behind the stage right marks
//   task('parade')      -> { pos, set(v) } ch3.s1's encounter: the ranks fall in, then the escort; any other type: null
//   cue(lineId)         ch3.s1.c01 the whole parade and the escort; ch3.epi.05 / .09 the yard empty
// marks: a, b, c, two, party, opposition as everywhere, plus
//   quay { pos, face }: at the sea wall, level with the ferry     gate { pos, face }: under the tower arch
//   banner (world point: the bob)     lamp (world point: the lit window)     focus = banner

import { m4, quat, rng, DEG, rgb } from '../math.js';
import { merge, tint, place, plane, box, cylinder, sphere, lathe, tube, curve, torus, setGlow, setOutline } from '../mesh.js';
import { node, group, material, makeEnv, createScene, mergeStatic, makeInstances } from '../scene.js';
import { createSprites } from '../sprites.js';
import { rayMesh, rayMaterial } from '../fx.js';
import { PAL, kitMaterials, anchorAt, scatter, pickLight, setRig, lampPost, cloudBank, gull, ferry, headland, lighthouse } from './kit.js';
import { H3, plumb, gonfalon, people, academyBlock, gateTower, clock } from './kit-ch3.js';

const WATER = -4, WALL_Z = -9.7;
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
const dirFrom = (azDeg, elDeg) => [Math.sin(azDeg * DEG) * Math.cos(elDeg * DEG), Math.sin(elDeg * DEG), -Math.cos(azDeg * DEG) * Math.cos(elDeg * DEG)]; // az 0 = straight out over the wall, + = right

const LIGHTS = {
  morning: {
    preset: 'day', power: 0.45, ranks: 1, escort: true,
    env: {
      key: { dir: dirFrom(13, 24), color: '#fff9ea' },
      shadow: { tint: '#8d8cf0', lift: 0.13, saturate: 1.4 },
      ambient: { sky: '#cfe4ff', ground: '#ffe9c4', amount: 0.15 },
      rim: { color: '#ffffff', amount: 1.0, edge: 0.72 },
      fog: { density: 0.003, start: 22, max: 0.86 },
      sky: { zenith: '#2468dc', mid: '#62b4f4', midAt: 0.42, horizon: '#fff4cc', below: '#c8ecf6', glow: '#fffbe0', glowAmount: 0.65, sunDir: dirFrom(7.2, 13), sun: { color: '#ffffff', size: 2.7, halo: '#fff2b8', haloAmount: 0.55 } },
      water: { deep: '#1f78d8', mid: '#35a4e6', shallow: '#7fe4dc', foam: '#ffffff', glint: '#fffbe0', glintDensity: 0.3 },
    },
    cloud: { color: '#ffffff', shadowTint: '#b4c6f8' }, shaft: 0.26, shaftColor: '#fff2c0', mist: '#ffffff', lit: [], ground: '#dcc9a0', slab: ['#f6e8c4', '#eeddb4', '#fbeed0', '#e8d6ac'],
  },
  dawn: {
    preset: 'sunset', power: 1, ranks: 0, escort: false,
    env: {
      key: { dir: dirFrom(20, 13), color: '#ffdcb0' },
      shadow: { tint: '#7f74e0', lift: 0.12, saturate: 1.4 },
      ambient: { sky: '#ffb09a', ground: '#7d6ad0', amount: 0.16 },
      rim: { color: '#ffd98a', amount: 1.0, edge: 0.72 },
      fog: { density: 0.0036, start: 20, max: 0.9 },
      sky: { zenith: '#3f50c8', mid: '#a88cec', midAt: 0.5, horizon: '#ffd07a', below: '#f6b088', glow: '#ffe890', glowAmount: 0.6, sunDir: dirFrom(7.5, 6.5), sun: { color: '#fffbe0', size: 2.5, halo: '#ffd070', haloAmount: 0.45 } },
      water: { deep: '#2a56c0', mid: '#3f8fe0', shallow: '#74e0d6', foam: '#fff6e4', glint: '#ffe7a0', glintDensity: 0.3 },
    },
    cloud: { color: '#ffd9b4', shadowTint: '#c878b8' }, shaft: 0.3, shaftColor: '#ffd890', mist: '#ffe6d2', lit: [[2, 1], [5, 2], [8, 0], [9, 1]], ground: '#e6cfa6', slab: ['#f6dfb6', '#ecd0a4', '#fbe6c2', '#e8c89c'],
  },
};

const CAMERAS = {
  wide: { target: [0.1, 1.9, -0.4], dist: 8.6, yaw: 3, pitch: 3.5, fov: 46, aspect: 0.46, shadowCenter: [0, 0, -2.2], shadowRadius: 9.5 },
  two: { target: [0, 1.12, 0.6], dist: 6.0, yaw: -15, pitch: 5, fov: 31, aspect: 0.46, shadowCenter: [0, 0, 0.3], shadowRadius: 3.6 },
  close: { target: [0.02, 0.86, 0.8], dist: 3.9, yaw: 21, pitch: 3, fov: 28, aspect: 0.46, shadowCenter: [0, 0, 0.5], shadowRadius: 2.6 },
  low: { target: [0.1, 1.95, 0.1], dist: 6.4, yaw: -5, pitch: -11, fov: 56, aspect: 0.46, shadowCenter: [0, 0, -1.6], shadowRadius: 9 },
  stage: { target: [0, 1.15, 0.4], dist: 9.6, yaw: -14, pitch: 6, fov: 25, aspect: 1.95, shadowCenter: [0, 0, -1.4], shadowRadius: 8.5, outline: 0.7 },
  landscape: { target: [0, 2.3, -1.6], dist: 11, yaw: 4, pitch: 3, fov: 42, aspect: 1.6, shadowCenter: [0, 0, -2.5], shadowRadius: 11 },
};

const MARKS = {
  a: { pos: [-0.8, 0, 0.55], face: 14 }, b: { pos: [0.02, 0, 0.8], face: 0 }, c: { pos: [0.82, 0, 0.55], face: -14 },
  two: [{ pos: [-0.42, 0, 0.62], face: 24 }, { pos: [0.42, 0, 0.62], face: -24 }],
  party: [{ pos: [-1.05, 0, 0.75], face: 78 }, { pos: [-1.85, 0, 1.15], face: 72 }, { pos: [-2.5, 0, 0.5], face: 80 }],
  opposition: [{ pos: [1.05, 0, 0.75], face: -78 }, { pos: [1.85, 0, 1.15], face: -72 }, { pos: [2.55, 0, 0.5], face: -80 }],
};

function build(engine = null, { light: lightName = 'morning', low = false } = {}) {
  const { name: light, L } = pickLight('academy-yard', LIGHTS, ALIAS[lightName] || lightName);
  const M = kitMaterials(), r = rng(1903);
  M.deco = material({ name: 'yard-deco', rim: 0.5, outline: false, castShadow: false });
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  if (env.sky.sunDir) env.sky.sunDir = norm(env.sky.sunDir);
  env.water.level = WATER;
  env.water.shores = [[0, WALL_Z - 0.9 + 900, 900, 0.9], [6.5, -58, 5.5, 0.8], [9.5, -64, 9, 0.9], [-64, -150, 40, 1.6], [44, -190, 15, 1.2]];

  // ---- where things stand
  const BLOCK = [-11.3, 0, -15.6], TOWER = [-0.45, 0, -14.8], MAST = [-2.0, 0, -8.6], MAST_H = 7.6;
  const FERRY = [4.4, WATER + 0.05, -56], FERRY_YAW = 62;

  // ---- static geometry
  const set = group('set-static'), flats = group('flats'), far = group('far');
  flats.add(node('ground', tint(place(plane(90, 26, 1, 1), 0, 0, WALL_Z + 13), L.ground), M.flat), node('ground-back', tint(place(plane(46, 8, 1, 1), -22 + TOWER[0] + 1.7, 0, WALL_Z - 4), L.ground), M.flat));
  // painted lines: the avenue's two edges, a line under every rank, the Company's device in the middle of the avenue
  const paint = [];
  for (const sx of [-1, 1]) paint.push(tint(place(plane(0.1, 13), sx * 1.42, 0.006, -3.2), '#ffffff'), tint(place(plane(0.2, 13), sx * 1.24, 0.005, -3.2), H3.teal));
  for (let k = 0; k < 8; k++) for (const sx of [-1, 1]) paint.push(tint(place(plane(6.4, 0.07), sx * 5.4, 0.005, -1.75 - k * 0.95), '#ffffff'));
  paint.push(tint(place(lathe([[1.0, 0], [0.86, 0]], 20, { crease: 180 }), 0, 0.007, -4.3), H3.gold), tint(place(lathe([[0.8, 0], [0, 0]], 20, { crease: 180 }), 0, 0.006, -4.3), H3.teal), place(plumb({ s: 1.25, color: H3.gold, line: '#ffffff', depth: 0.02 }), 0, 0.012, -4.95, -90, 0, 0));
  flats.add(node('paint', setOutline(merge(paint), 0), M.flat));

  const block = academyBlock({ w: 18.6, h: 5.3, d: 4.2, floors: 3, bays: 11, roofH: 1.4, seed: 4, door: 5.2, litAt: L.lit });
  set.add(node('block', block, M.prop, { pos: BLOCK }));
  const tower = gateTower({ w: 3.0, h: 7.4, d: 3.2, seed: 2, lit: true });
  set.add(node('tower', tower, M.prop, { pos: TOWER }));
  const ck = clock({ r: tower.anchors.clockR, thick: 0.14 }), CLOCK = anchorAt(tower, 'clock', TOWER);
  set.add(node('clock', merge(ck.face, place(ck.hour, 0, 0, 0, 0, 0, 62)), M.prop, { pos: CLOCK })); // the hour hand is part of the face: nobody watches it move
  // a lower wing behind the tower so the gap beside it is not a hole in the world
  if (!low) set.add(node('wing', academyBlock({ w: 5.2, h: 3.6, d: 3.4, floors: 2, bays: 3, roofH: 1.1, seed: 9, roof: H3.slateDark }), M.prop, { pos: [-23.3, 0, -14.4], rot: [0, 8, 0] }));
  // the sea wall: square merlons on a low parapet, from the tower out to the right
  const WX = TOWER[0] + 1.7, wallParts = [tint(place(box(40, 0.6, 0.5), WX + 20, 0.3, WALL_Z), H3.stone2), tint(place(box(40, 0.12, 0.66), WX + 20, 0.62, WALL_Z), H3.stone), tint(place(box(40, 6, 0.4), WX + 20, -3, WALL_Z - 0.2), H3.stone3)];
  for (let i = 0; i < 20; i++) wallParts.push(tint(place(box(0.7, 0.36, 0.5), WX + 0.6 + i * 1.5, 0.86, WALL_Z, 0, 0, (r() - 0.5) * 4), i % 2 ? H3.stone : H3.stone2));
  set.add(node('sea-wall', merge(wallParts), M.prop));
  const post = lampPost({ h: 2.7, arm: 0.5, lit: L.power > 0.8, s: 1.6 });
  const POSTS = [[4.4, 0, WALL_Z + 0.6], [10.4, 0, WALL_Z + 0.6]];
  for (const p of POSTS) set.add(node('post', post, M.prop, { pos: p, rot: [0, 180, 0] }));
  // the mast: a stepped plinth, a pole, a yard for the banner
  const mast = [tint(cylinder(0.85, 0.95, 0.22, 10), H3.stone2), tint(place(cylinder(0.6, 0.66, 0.22, 10), 0, 0.22, 0), H3.stone), tint(place(cylinder(0.11, 0.07, MAST_H - 0.44, 7), 0, 0.44, 0), '#fff8ea'), tint(place(torus(0.16, 0.05, 8, 4), 0, 1.3, 0), H3.gold), tint(place(sphere(0.2, 8, 5), 0, MAST_H + 0.1, 0), H3.gold)];
  set.add(node('mast', merge(mast), M.prop, { pos: MAST }));
  // the avenue: stone posts and a chain, to the gate
  const chain = [];
  for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) {
    const z = -2.2 - i * 1.6, x = sx * 1.78;
    if (sx < 0 && i === 4) continue;
    chain.push(tint(place(cylinder(0.13, 0.16, 0.5, 6), x, 0, z), '#fff8ea'), tint(place(sphere(0.13, 6, 4), x, 0.56, z), H3.gold));
    if (i < (sx < 0 ? 3 : 4)) chain.push(tint(tube(curve([[x, 0.46, z], [x, 0.3, z - 0.8], [x, 0.46, z - 1.6]], 4), 0.028, 4, { caps: false, crease: 180 }), H3.tealDark));
  }
  set.add(node('avenue', merge(chain), M.prop));
  // clipped cones in tubs either side of the gate, and along the front of the block: the only green there is
  const cone = merge(tint(place(cylinder(0.34, 0.4, 0.4, 6), 0, 0, 0), H3.tealDark), tint(place(cylinder(0.42, 0.42, 0.07, 6), 0, 0.36, 0), H3.gold), tint(place(lathe([[0, 0.4], [0.46, 0.45], [0.36, 1.0], [0.16, 1.6], [0, 1.9]], 7, { crease: 180 }), 0, 0, 0), PAL.leaf));
  for (const p of [[TOWER[0] - 1.5, 0, TOWER[2] + 0.9], [TOWER[0] + 1.5, 0, TOWER[2] + 0.9], [-6.4, 0, BLOCK[2] + 0.9], [-9.4, 0, BLOCK[2] + 0.9]]) set.add(node('cone', cone, M.prop, { pos: p, rot: [0, r() * 90, 0], scale: 0.95 + r() * 0.2 }));
  // a drum and a rack of practice staves by the left ranks; the stand the salute is taken from on the right
  const drum = merge(tint(place(cylinder(0.3, 0.3, 0.42, 9), 0, 0.3, 0), H3.cadet), tint(place(torus(0.3, 0.035, 9, 4), 0, 0.32, 0), H3.gold), tint(place(torus(0.3, 0.035, 9, 4), 0, 0.7, 0), H3.gold), tint(place(cylinder(0.28, 0.28, 0.03, 9), 0, 0.72, 0), H3.cream), tint(place(box(0.5, 0.3, 0.06), 0, 0.15, 0), H3.woodDark), tint(place(box(0.06, 0.3, 0.5), 0, 0.15, 0), H3.woodDark));
  set.add(node('drum', drum, M.prop, { pos: [-3.7, 0, -0.9], rot: [0, 20, 8] }));
  const dais = merge(tint(place(box(2.6, 0.24, 1.6), 0, 0.12, 0), H3.stone), tint(place(box(2.2, 0.2, 1.3), 0, 0.34, -0.1), H3.stone2), tint(place(box(2.24, 0.03, 1.34), 0, 0.455, -0.1), H3.teal), tint(place(box(2.3, 0.7, 0.07), 0, 0.82, -0.78), '#fff8ea'), tint(place(box(2.4, 0.08, 0.14), 0, 1.2, -0.78), H3.gold), place(plumb({ s: 0.5, depth: 0.3 }), 0, 1.1, -0.72));
  set.add(node('dais', dais, M.prop, { pos: [5.9, 0, -1.3], rot: [0, -28, 0] }));
  for (const at of [[BLOCK[0] - 5.0, 8.2, BLOCK[2] - 2.1], [BLOCK[0] + 4.6, 8.2, BLOCK[2] - 2.1], [POSTS[1][0] + 4, 2.3, WALL_Z]]) set.add(node('pole', tint(place(cylinder(0.03, 0.03, 1.7, 4), 0, -1.5, 0), '#fff8ea'), M.prop, { pos: at }));
  scene.root.add(mergeStatic(set, 'set'), mergeStatic(flats, 'flats'));

  // ---- far things: the mole and its light, the ferry, a headland
  const moleParts = [];
  { const a = [7.2, WATER + 1.1, -44], b = [12.5, WATER + 1.1, -74], dx = b[0] - a[0], dz = b[2] - a[2], len = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz) / DEG;
    moleParts.push(tint(place(box(2.6, 2.6, len), (a[0] + b[0]) / 2, WATER + 0.1, (a[2] + b[2]) / 2, 0, yaw, 0), H3.stone2), tint(place(box(2.9, 0.3, len + 0.4), (a[0] + b[0]) / 2, WATER + 1.4, (a[2] + b[2]) / 2, 0, yaw, 0), H3.stone));
    moleParts.push(tint(place(box(6, 3.4, 9), 8.2, WATER + 0.3, -40.5, 0, 12, 0), H3.stone3)); }
  far.add(node('mole', merge(moleParts), M.farFlat));
  const lh = lighthouse({ h: 5.2, r: 0.95, bands: 4, colors: [H3.stone, H3.teal], cap: H3.tealDark, lit: L.power > 0.8 }), LH = [12.5, WATER + 1.5, -74];
  far.add(node('mole-light', lh, M.farFlat, { pos: LH }));
  far.add(node('headland', headland({ w: 80, d: 30, h: 12, seed: 6, grass: PAL.leaf, seg: 20, rings: 8 }), M.farFlat, { pos: [-64, WATER - 0.6, -150] }));
  far.add(node('island', headland({ w: 30, d: 16, h: 5, seed: 11, grass: PAL.leafDark, seg: 16, rings: 6 }), M.farFlat, { pos: [44, WATER - 0.6, -190] }));
  scene.root.add(mergeStatic(far, 'far'));
  const ferryMesh = ferry({ len: 13, hull: '#fff8ea', keel: H3.tealDark, wall: '#fff6dc', roof: H3.coral, lit: L.power > 0.8, seed: 3 });
  const ferryNode = node('ferry', ferryMesh, M.farFlat, { pos: FERRY, rot: [0, FERRY_YAW, 0] });
  scene.root.add(ferryNode);

  // ---- flagstones: one instanced draw
  const slab = node('slabs', setOutline(place(plane(1.24, 1.24), 0, 0.003, 0), 0), M.flat); slab.castShadow = false;
  scatter(slab, 300, (i) => {
    const col = i % 20, row = Math.floor(i / 20), x = -12.6 + col * 1.32 + (row % 2) * 0.66, z = 3.4 - row * 1.32;
    if (z < WALL_Z + 0.9 || (Math.abs(x) < 1.6 && z < 1.5)) return null;
    return { m: m4.trs(x + (r() - 0.5) * 0.03, 0, z + (r() - 0.5) * 0.03, 0, (r() - 0.5) * 3, 0, 1), color: L.slab[Math.floor(r() * L.slab.length)] };
  });
  scene.root.add(slab);

  // ---- the parade. Near ranks are drawn in ink; the rest are too small for a line to help.
  const nearSpots = [], farSpots = [];
  const rank = (x0, files, z0, ranks, dx = 0.68, dz = 0.95, yaw = 0) => { for (let k = 0; k < ranks; k++) for (let i = 0; i < files; i++) { const z = z0 - k * dz, sp = { pos: [x0 + i * dx + (r() - 0.5) * 0.03, 0, z + (r() - 0.5) * 0.03], yaw: yaw + (r() - 0.5) * 4, s: 0.9 + r() * 0.12 }; (z > -3.3 ? nearSpots : farSpots).push(sp); } };
  rank(-5.6, 6, -1.75, 8, 0.68, 0.95, 6);          // left of the avenue
  rank(2.25, 6, -3.65, 6, 0.68, 0.95, -6);         // right of it, behind the escort
  if (!low) { rank(-11.0, 7, -1.75, 6, 0.7, 0.95, 8); rank(7.2, 5, -4.6, 3, 0.7, 0.95, -8); }
  const UNI = { coat: H3.cadet, cap: H3.tealDark, band: H3.silver };
  const nearRanks = people({ spots: nearSpots, material: M.prop, uniform: UNI, seed: 3 });
  const farRanks = people({ spots: farSpots, material: M.deco, uniform: UNI, lod: 1, seed: 5 });
  // the escort of twelve, in the Proctor's teal: two files of six, close behind where the Tribune is received
  const escSpots = []; for (let k = 0; k < 4; k++) for (let i = 0; i < 3; i++) escSpots.push({ pos: [2.3 + i * 0.62, 0, -0.95 - k * 0.72], yaw: -10, s: 1.0 });
  const escort = people({ spots: escSpots, material: M.prop, uniform: { coat: '#2f8f8a', cap: H3.tealDeep, band: H3.gold }, seed: 8 });
  for (const g of [nearRanks, farRanks]) for (const p of g.list) p.here = L.ranks;
  for (const p of escort.list) p.here = L.escort ? 1 : 0;
  for (const g of [nearRanks, farRanks, escort]) { g.writeAll(); for (const k of g.node.children) k.castShadow = g === nearRanks; scene.root.add(g.node); }

  // ---- the banner: cloth and bob swing on the yard
  const YARD = [MAST[0], MAST_H - 0.5, MAST[2] + 0.16];
  const bannerMesh = gonfalon({ w: 2.1, h: 3.9, color: H3.teal, trim: H3.silver, device: H3.gold, stripe: H3.silver, tail: 0.5 });
  const banner = node('banner', bannerMesh, M.prop, { pos: YARD }); scene.root.add(banner);
  const BOB_LEN = 1.5, bob = node('bob', merge(tint(place(cylinder(0.014, 0.014, BOB_LEN - 0.55, 4), 0, -BOB_LEN + 0.55, 0), H3.silver), place(plumb({ s: 0.9, depth: 1, seg: 8 }), 0, -BOB_LEN + 0.6, 0)), M.prop);
  bob.castShadow = false; scene.root.add(bob);
  const footLocal = bannerMesh.anchors.foot, BOB = [YARD[0], YARD[1] + footLocal[1] - BOB_LEN + 0.2, YARD[2]];
  // clock hands
  const minHand = node('minute', ck.minute, M.speck, { pos: CLOCK });
  minHand.castShadow = false; scene.root.add(minHand);
  // pennants: five links each, laid out along the wind every frame
  const PENS = [{ at: anchorAt(tower, 'top', TOWER), col: H3.coral, s: 1.5 }, { at: [BLOCK[0] - 5.0, 8.2, BLOCK[2] - 2.1], col: H3.gold, s: 1.1 }, { at: [BLOCK[0] + 4.6, 8.2, BLOCK[2] - 2.1], col: H3.gold, s: 1.1 }, { at: [POSTS[1][0] + 4, 2.3, WALL_Z], col: H3.teal, s: 0.9 }];
  const LINKS = 5, pen = node('pennants', setOutline(place(box(0.34, 0.4, 0.02), 0.17, 0, 0), 0), M.speck);
  pen.instances = makeInstances(PENS.length * LINKS); pen.instances.count = PENS.length * LINKS; scene.root.add(pen);

  // ---- sky
  const clouds = cloudBank({ count: low ? 4 : 5, seed: 12, arc: [150, 212], radius: [250, 430], height: [22, 140], size: [0.7, 1.4], speed: 0.05, ...L.cloud });
  scene.root.add(clouds.node);
  const gulls = node('gulls', gull({}), M.speck); gulls.instances = makeInstances(5); gulls.instances.count = 5; scene.root.add(gulls);

  // ---- foreground: a chain post and a pair of drums at the camera's feet
  const fg = group('fg');
  fg.add(node('fg-drum', drum, M.prop, { pos: [-2.0, 0, 2.9], rot: [0, -30, 0] }), node('fg-post', merge(tint(place(cylinder(0.13, 0.16, 0.5, 6), 0, 0, 0), '#fff8ea'), tint(place(sphere(0.13, 6, 4), 0, 0.56, 0), H3.gold)), M.prop, { pos: [2.1, 0, 2.8] }));
  const foreground = mergeStatic(fg, 'foreground'); scene.root.add(foreground);
  const actors = group('actors'); scene.root.add(actors);

  // ---- lamps: the east window that is lit when it need not be, the gate, two posts on the sea wall
  const LAMP = anchorAt(tower, 'lamp', TOWER);
  const postLamps = POSTS.map((p) => anchorAt(post, 'lamp', p, 180));
  const lamps = [
    { name: 'window', pos: [LAMP[0], LAMP[1], LAMP[2] + 0.8], color: '#ffc468', radius: 7, base: 1.2 },
    { name: 'gate', pos: [TOWER[0], 1.6, TOWER[2] + 1.2], color: '#ffd080', radius: 5, base: 0.8 },
    { name: 'post-1', pos: postLamps[0], color: '#ffc870', radius: 5.2, base: L.power > 0.8 ? 1 : 0 },
    { name: 'post-2', pos: postLamps[1], color: '#ffc870', radius: 5.2, base: L.power > 0.8 ? 1 : 0 },
  ];
  env.points = lamps.map((l) => ({ pos: l.pos, color: rgb(l.color), radius: l.radius, intensity: l.base * L.power }));
  const sprites = scene.sprites = createSprites(low ? 128 : 320);
  const winGlow = sprites.add({ kind: 'glow', pos: [LAMP[0], LAMP[1], LAMP[2] + 0.2], size: 2.6, color: '#ffb850', alpha: 0 });
  const postGlows = postLamps.map((p) => sprites.add({ kind: 'glow', pos: p, size: 1.7, color: '#ffb450', alpha: 0 }));
  const blockGlows = anchorAt(block, 'windows', BLOCK).map((p) => sprites.add({ kind: 'glow', pos: p, size: 1.3, color: '#ffc060', alpha: 0.4 }));
  const bobGlow = sprites.add({ kind: 'sparkle', pos: BOB, size: 0.9, color: '#fff6c0', alpha: 0 });
  const lhLamp = anchorAt(lh, 'lamp', LH), lhGlow = sprites.add({ kind: 'glow', pos: lhLamp, size: 5, color: '#ffe08a', alpha: 0 });

  // ---- the sun's slants through the yard, along the key light
  let shaftMat = null;
  if (L.shaft > 0 && !low) {
    const kd = env.key.dir, yaw = Math.atan2(kd[0], kd[2]) / DEG, tilt = Math.acos(kd[1]) / DEG, parts = [];
    for (const [x, z, len, w] of [[0.9, 0.9, 11, 1.3], [-1.3, 2.6, 12, 1.0]]) parts.push(place(rayMesh(len, 0.5, w, 10), x + kd[0] * len, kd[1] * len - 0.2, z + kd[2] * len, tilt, yaw, 0));
    shaftMat = rayMaterial({ power: 1.3, near: L.shaft, far: L.shaft * 0.3 });
    scene.root.add(node('sun-shafts', tint(merge(parts), L.shaftColor), shaftMat));
  }

  // ---- per-frame state
  const rig = setRig('academy-yard', CAMERAS, env);
  const key0 = Array.from(env.key.color), rim0 = env.rim.amount;
  let power = 1, ranks = L.ranks, escortOn = L.escort, lastT = -1, nextGust = 1, nextSpark = 0.5, cursor = 0;
  const P = [0, 0, 0], V = [0, 0, 0], S3 = [1, 1, 1], Q = quat.create(), Mx = m4.create(), rnd = rng(77);
  const penCols = PENS.map((p) => rgb(p.col));
  function setPower(p) { power = Math.max(0, Math.min(1.5, p)); }
  function setRanks(a) { ranks = Math.max(0, Math.min(1, a)); }
  function setEscort(on) { escortOn = !!on; }
  // (a rank that has wholly fallen out is not drawn at all)
  const settle = (g, goal, k) => { const n = Math.round(goal * g.count); let any = n > 0; for (let i = 0; i < g.count; i++) { const p = g.list[i], d = (i < n ? 1 : 0) - p.here; if (d > 0.004 || d < -0.004) { p.here += d * k; g.write(i); any = true; } } g.node.visible = any; };
  // ch3.s1's encounter (twice round the yard): the ranks fall in over the first lap, the escort of twelve on the second
  const PARADE = { pos: [2.5, 1.0, 0.5], size: 0.6, set(v) { setRanks(0.3 + 0.7 * Math.min(1, v * 2)); setEscort(v > 0.97); } };
  const task = (type) => (type === 'parade' ? PARADE : null);
  /** Stage business by script line. */
  function cue(id) {
    switch (id) {
      case 'ch3.s1.c01': setRanks(1); setEscort(true); return true;
      case 'ch3.epi.05': case 'ch3.epi.09': setRanks(0); setEscort(false); return true;
      default: return false;
    }
  }

  function update(time, dt = 0) {
    const pw = L.power * power, k = dt === 0 ? 1 : Math.min(1, dt * 5);
    // the machine powers the morning: a little more sun and rim with it, the lamps, the slants
    const sun = 0.84 + 0.16 * Math.min(1.3, power);
    for (let i = 0; i < 3; i++) env.key.color[i] = key0[i] * sun;
    env.rim.amount = rim0 * (0.7 + 0.3 * Math.min(1.3, power));
    if (shaftMat) { shaftMat.beam.near = L.shaft * (0.5 + 0.5 * Math.min(1.4, power)); shaftMat.beam.far = shaftMat.beam.near * 0.3; }
    for (let i = 0; i < lamps.length; i++) env.points[i].intensity = lamps[i].base * pw * (0.96 + 0.04 * Math.sin(time * 7.3 + i * 2.1));
    winGlow.alpha = 0.3 + 0.4 * Math.min(1.3, pw); winGlow.size[0] = winGlow.size[1] = 2.4 + 0.2 * Math.sin(time * 3.1);
    for (let i = 0; i < postGlows.length; i++) postGlows[i].alpha = lamps[2 + i].base * 0.55 * Math.min(1.2, pw);
    for (let i = 0; i < blockGlows.length; i++) blockGlows[i].alpha = 0.4;
    lhGlow.alpha = L.power > 0.8 ? 0.45 + 0.25 * Math.sin(time * 1.9) : 0;
    // ranks fall in and out; a few of the near ones breathe each frame
    settle(nearRanks, ranks, k); settle(farRanks, ranks, k); settle(escort, escortOn ? 1 : 0, k);
    if (dt > 0 && nearRanks.count) for (let j = 0; j < 8; j++) { const i = cursor = (cursor + 1) % nearRanks.count, p = nearRanks.list[i]; if (p.here < 0.05) continue; p.lift = Math.sin(time * 1.4 + p.ph) * 0.006; p.lean = Math.sin(time * 0.6 + p.ph * 2) * 0.8; nearRanks.write(i); }
    // the banner hangs like the weight on it: it barely moves, and the bob under it swings slow
    const sw = Math.sin(time * 0.7) * 2.2 + Math.sin(time * 1.9 + 1) * 0.8, bz = Math.sin(time * 0.53 + 0.6) * 1.6;
    banner.setRot(bz, 0, sw);
    const sa = sw * DEG, fy = footLocal[1];
    bob.position[0] = YARD[0] - Math.sin(sa) * fy; bob.position[1] = YARD[1] + Math.cos(sa) * fy + 0.06; bob.position[2] = YARD[2] + Math.sin(bz * DEG) * fy;
    const ba = Math.sin(time * 1.15 + 0.4) * 7; bob.setRot(Math.sin(time * 0.9) * 3, time * 20, ba);
    BOB[0] = bob.position[0] + Math.sin(ba * DEG) * (BOB_LEN - 0.3); BOB[1] = bob.position[1] - Math.cos(ba * DEG) * (BOB_LEN - 0.3); BOB[2] = bob.position[2];
    bobGlow.pos[0] = BOB[0]; bobGlow.pos[1] = BOB[1] + 0.15; bobGlow.pos[2] = BOB[2] + 0.2; bobGlow.alpha = Math.max(0, Math.sin(time * 1.15 + 0.4)) * 0.9 * Math.min(1.2, 0.4 + power * 0.6); bobGlow.rot = time * 0.6;
    // the clock keeps the Company's time: the minute hand goes round once a minute of ours
    minHand.setRot(0, 0, -time * 6);
    // pennants
    const pd = pen.instances.data;
    for (let j = 0; j < PENS.length; j++) {
      const pn = PENS[j], c = penCols[j]; let x = pn.at[0], y = pn.at[1], z = pn.at[2], ang = 8 + Math.sin(time * 0.5 + j) * 10;
      for (let i = 0; i < LINKS; i++) {
        const s = pn.s * (1 - i * 0.14); ang += Math.sin(time * 6.5 - i * 1.1 + j * 2) * (7 + i * 4);
        P[0] = x; P[1] = y - i * 0.03 * pn.s; P[2] = z; quat.fromEuler(Q, 0, ang * DEG, 0); S3[0] = S3[1] = S3[2] = s;
        m4.fromTRS(Mx, P, Q, S3); const o = (j * LINKS + i) * 20; pd.set(Mx, o); const sh = i % 2 ? 0.9 : 1; pd[o + 16] = c[0] * sh; pd[o + 17] = c[1] * sh; pd[o + 18] = c[2] * sh; pd[o + 19] = 1;
        x += Math.cos(ang * DEG) * 0.34 * s; z -= Math.sin(ang * DEG) * 0.34 * s;
      }
    }
    pen.instances.dirty = true;
    // ferry, clouds, gulls
    ferryNode.position[1] = FERRY[1] + Math.sin(time * 0.9) * 0.05; ferryNode.setRot(Math.sin(time * 0.8) * 1.2, FERRY_YAW, Math.sin(time * 1.1 + 1) * 1.6);
    clouds.update(time);
    for (let i = 0; i < 5; i++) {
      const a = time * (0.2 + i * 0.03) * (i % 2 ? 1 : -1) + i * 1.9, rad = 6 + i * 2.4, cx = 6 + i * 3.2, cz = -30 - i * 7;
      P[0] = cx + Math.cos(a) * rad; P[1] = 3.5 + i * 1.3 + Math.sin(time * 0.5 + i) * 0.8; P[2] = cz + Math.sin(a) * rad * 0.6;
      quat.fromEuler(Q, 0, Math.sin(a) * 0.35, Math.cos(a) * 0.3 * (i % 2 ? 1 : -1));
      const flap = Math.sin(time * (5.5 + i * 0.4) + i * 2); S3[0] = 1.9; S3[1] = 1.9 * (0.5 + 1.3 * flap); S3[2] = 1.9; if (Math.abs(S3[1]) < 0.12) S3[1] = 0.12;
      m4.fromTRS(Mx, P, Q, S3); gulls.instances.data.set(Mx, i * 20);
    }
    gulls.instances.dirty = true;

    if (lastT >= 0 && time - lastT < 0.5 && dt > 0) {
      if (time > nextGust) { // what is left of the fog, going over the wall
        nextGust = time + 2.2 + rnd() * 1.4; P[0] = -2 + rnd() * 8; P[1] = 0.9 + rnd() * 2.4; P[2] = WALL_Z + 0.5 + rnd() * 5; V[0] = -1.7; V[1] = 0.08; V[2] = 0.5;
        sprites.gust(P, { vel: V, size: 1.0 + rnd() * 0.6, life: 2.4, alpha: 0.8, color: L.mist });
      }
      if (time > nextSpark) { // brass and gold catch the sun: the mast head, the tower finial, the avenue's posts
        nextSpark = time + 0.3 / Math.max(0.3, power); const w = rnd();
        if (w < 0.3) { P[0] = MAST[0]; P[1] = MAST_H + 0.1; P[2] = MAST[2]; } else if (w < 0.5) { const t = PENS[0].at; P[0] = t[0]; P[1] = t[1] - 0.3; P[2] = t[2]; } else { P[0] = (rnd() < 0.5 ? -1 : 1) * 1.78; P[1] = 0.6; P[2] = -2.2 - Math.floor(rnd() * 5) * 1.6; }
        sprites.sparkle(P, { count: 1, size: 0.3, spread: 0.2, life: 0.8, color: '#fffbe0' });
      }
      sprites.update(dt);
    }
    lastT = time;
  }

  update(0, 0);
  const built = {
    id: 'academy-yard', light, scene, env, actors, foreground,
    cameras: CAMERAS, frame: rig.frame, view: rig.view,
    marks: { ...MARKS, quay: { pos: [4.6, 0, WALL_Z + 0.75], face: 150 }, gate: { pos: [TOWER[0], 0, TOWER[2] + 0.9], face: 0 }, banner: BOB, lamp: LAMP, focus: BOB },
    lamps, setPower, setRanks, setEscort, task, cue, update,
  };
  // ch3.s1: Thorne and two proctors review the parade from the back of the avenue
  built.encounter = () => { built.marks.extras = [{ pos: [-0.9, 0, -0.05], face: 12 }, { pos: [0.1, 0, -0.1], face: 0 }, { pos: [1.1, 0, -0.05], face: -12 }]; };
  return built;
}

// the core's light names (src/core/stage.js LIGHTS) this set also answers to, so content can say 'interior' / 'day'
const ALIAS = { day: 'morning' };
export const academyYard = { id: 'academy-yard', lights: [...Object.keys(LIGHTS), ...Object.keys(ALIAS)], cameras: Object.keys(CAMERAS), build };
export default academyYard;
