// SET: commons-queue. Ropewalk at first light, outside the Compact's savings hall: a brick hall with its door
// open, lit and paying, both windows open, the Commons' two rings hung out over the street, and a line of people
// from the door back down the street to the harbour, not one of them talking. Low rope-sheds on the left keep
// the sun off half the road. In the middle of the street stands a table with the ledger open on it for anyone to
// read, and on the hall's wall the places are chalked up by name, so nobody loses one by sitting down.
// Chapter 5: ch5.s4 The Queue.
//
//   import { commonsQueue } from './sets/commons-queue.js';
//   const set = commonsQueue.build(GL, { light: 'dawn' | 'morning', low: false });
//
// Same shape as sets/lantern-stalls.js. Figures face +Z, cameras look toward -Z (down Ropewalk), the strip
// x -4.4..4.4, z 0..1.6 is clear and so is the back row; the table stands at z -1.7.
//
// What this set can do for its story:
//   setQueue(0..1)     how much of the line is there (1 at first light, about 0.4 by nine)
//   setSitting(0..1)   how many of them have sat down
//   setChalk(0..1)     the names on the wall
//   setMood(0..1)      0.05 = nobody talking, 1 = "Then it's gone!"
//   cue(lineId)        ch5.s4.c01, c02, c11, c12, c16, c18 (chalk the line: they sit), c21, c22, c26
// marks: a, b, c, two, party, opposition as everywhere, plus
//   table { pos, face }: behind the open ledger   ledger (world point)   door { pos, face }: the front of the line
//   wall (world point: the chalked names)   focus = the lit door

import { m4, quat, rng, DEG } from '../math.js';
import { merge, tint, place, box, cylinder, extrude, setGlow, setOutline, torus, quad } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic, makeInstances } from '../scene.js';
import { createSprites } from '../sprites.js';
import { PAL, pickLight, cloudBank, gull, headland, lampPost, crate, barrel, ledgerBook, anchorAt } from './kit.js';
import { TL, MARKS, ch5Materials, shell, dirFrom, throng, papers, gableHouse, paving, ringsSign } from './kit-ch5.js';

const QUAY_Z = -46, WATER = -1.5, STREET_X = -2.6;
const HALL = { pos: [4.25, 0, -5.5], yaw: -32, w: 7.2, h: 4.5, d: 4 };

const LIGHTS = {
  dawn: {
    preset: 'sunset', power: 0.9, lit: 0.3, pane: '#7f86dc',
    env: {
      key: { dir: dirFrom(-106, 21), color: '#ffd9aa' },
      shadow: { tint: '#6c72e0', lift: 0.1, saturate: 1.4 },
      ambient: { sky: '#aab8ff', ground: '#7868d0', amount: 0.17 },
      rim: { color: '#ffe0a0', amount: 0.9, edge: 0.72 },
      fog: { density: 0.0075, start: 9, max: 0.86 },
      sky: { zenith: '#4f74dc', mid: '#b0a4f0', midAt: 0.46, horizon: '#ffc9a0', below: '#ffb890', glow: '#ffe2a8', glowAmount: 0.6, sunDir: dirFrom(-9.5, 4.6), sun: { color: '#fff6d8', size: 2.7, halo: '#ffc880', haloAmount: 0.5 } },
      water: { deep: '#3a56c0', mid: '#7a8ce0', shallow: '#ffc8a8', foam: '#fff0e0', glint: '#ffe0a8', glintDensity: 0.3 },
    },
    cloud: { color: '#ffd4b8', shadowTint: '#a884d8' }, breath: true, mote: '#ffe6c0',
  },
  morning: {
    preset: 'day', power: 0.25, lit: 0.1, pane: '#9fd4ff',
    env: {
      key: { dir: dirFrom(-112, 34), color: '#fff2d0' },
      shadow: { tint: '#8a8ce8', lift: 0.09, saturate: 1.35 },
      ambient: { sky: '#c6e4ff', ground: '#9080e0', amount: 0.16 },
      rim: { color: '#fff2b8', amount: 0.9, edge: 0.72 },
      fog: { density: 0.004, start: 14, max: 0.85 },
      sky: { zenith: '#3f8fe8', mid: '#93d4f8', midAt: 0.5, horizon: '#fff3c8', below: '#ffe0b0', glow: '#fff6c8', glowAmount: 0.5, sunDir: dirFrom(-12, 16), sun: { color: '#fffbe6', size: 2.4, halo: '#ffe28a', haloAmount: 0.4 } },
      water: { deep: '#2a66d0', mid: '#46a0ea', shallow: '#86e6da', glintDensity: 0.32 },
    },
    cloud: { color: '#ffffff', shadowTint: '#b4c6f8' }, breath: false, mote: '#ffffff',
  },
};

const CAMERAS = {
  wide: { target: [0.1, 1.6, -0.4], dist: 8.2, yaw: 3, pitch: 5, fov: 44, aspect: 0.46, shadowCenter: [-1.4, 0, -1.2], shadowRadius: 9 },
  two: { target: [0, 1.12, 0.6], dist: 6.0, yaw: -15, pitch: 5, fov: 31, aspect: 0.46, shadowCenter: [0, 0, 0.3], shadowRadius: 4 },
  close: { target: [0.02, 0.86, 0.8], dist: 3.9, yaw: 21, pitch: 3, fov: 28, aspect: 0.46, shadowCenter: [0, 0, 0.5], shadowRadius: 2.8 },
  low: { target: [0, 1.6, -0.2], dist: 7.4, yaw: 9, pitch: -6, fov: 52, aspect: 0.46, shadowCenter: [-1.4, 0, -1], shadowRadius: 9 },
  stage: { target: [0, 1.02, 0.4], dist: 9.5, yaw: -14, pitch: 7, fov: 24, aspect: 1.95, shadowCenter: [-1.4, 0, -0.8], shadowRadius: 9, outline: 0.7 },
  landscape: { target: [0, 1.7, -1.2], dist: 10.4, yaw: 4, pitch: 5, fov: 40, aspect: 1.6, shadowCenter: [0, 0, -1.4], shadowRadius: 10 },
};

const bx = (w, h, d, x, y, z, c, rx = 0, ry = 0, rz = 0) => tint(place(box(w, h, d), x, y, z, rx, ry, rz), c);
const arch = (hw, spring, n = 8) => { const p = [[-hw, 0]]; for (let i = 0; i <= n; i++) { const a = Math.PI * (1 - i / n); p.push([Math.cos(a) * hw, spring + Math.sin(a) * hw]); } p.push([hw, 0]); return p; };

/** The Compact's savings hall on Ropewalk. Front faces +Z. anchors: door, windows[2], sign, chalk (bottom-left of the chalked patch), lamp. */
function savingsHall({ w = 7.2, h = 4.5, d = 4 } = {}) {
  const z = d / 2, parts = [bx(w, h, d, 0, h / 2, 0, '#ff9c7c'), bx(w + 0.3, 0.55, d + 0.3, 0, 0.275, 0, TL.stone2), bx(w + 0.4, 0.26, d + 0.4, 0, h + 0.02, 0, TL.cream)];
  parts.push(tint(place(extrude([[-d / 2 - 0.35, 0], [0, 1.9], [d / 2 + 0.35, 0]], w + 0.5, { crease: 30 }), 0, h + 0.15, 0, 0, 90, 0), TL.copper));
  for (const sx of [-1, 1]) parts.push(bx(0.34, h - 0.5, 0.2, sx * (w / 2 - 0.17), h / 2 + 0.25, z + 0.04, TL.cream));
  // the door, at the street end of the front: open, and lit, and paying
  const DX = -1.55;
  parts.push(tint(place(extrude(arch(0.98, 1.75), 0.16, { crease: 30 }), DX, 0.3, z + 0.02), TL.cream), setOutline(setGlow(tint(place(extrude(arch(0.78, 1.72), 0.1, { crease: 30 }), DX, 0.3, z + 0.08), '#ffd27a'), 0.95), 0.4));
  parts.push(bx(0.5, 0.9, 0.06, DX, 0.78, z + 0.15, '#ffe9b0'), bx(1.3, 0.1, 0.5, DX, 1.2, z + 0.3, TL.woodDark));                                 // the counter inside, seen through the door
  for (let k = 0; k < 2; k++) parts.push(bx(2.6 - k * 0.5, 0.16, 0.6 - k * 0.22, DX, 0.08 + k * 0.16, z + 0.4 - k * 0.1, TL.stone));
  for (const sx of [-1, 1]) parts.push(bx(0.08, 2.2, 0.72, DX + sx * 1.02, 1.42, z + 0.4, TL.tealDark, 0, sx * -24, 0));                           // the leaves, folded back
  // both windows open
  const WX = [0.55, 2.45];
  for (const x of WX) {
    parts.push(bx(1.36, 1.56, 0.12, x, 2.0, z + 0.02, TL.cream), setOutline(setGlow(bx(1.14, 1.34, 0.06, x, 2.0, z + 0.07, '#ffd27a'), 0.92), 0.4), bx(1.5, 0.12, 0.34, x, 1.22, z + 0.14, TL.woodPale));
    for (const sx of [-1, 1]) parts.push(bx(0.07, 1.4, 0.58, x + sx * 0.7, 2.0, z + 0.32, TL.tealDark, 0, sx * -30, 0));
  }
  // upper floor, and the board with the two rings over the door
  for (const x of [-2.6, -0.87, 0.87, 2.6]) parts.push(bx(0.82, 0.9, 0.1, x, 3.72, z + 0.02, TL.cream), setGlow(bx(0.64, 0.72, 0.05, x, 3.72, z + 0.06, '#8f96e0'), 0.15));
  parts.push(bx(1.9, 0.58, 0.1, DX, 2.86, z + 0.04, TL.cream), tint(place(torus(0.19, 0.05, 10, 4), DX - 0.14, 2.86, z + 0.12, 90, 0, 0), TL.copperDark), tint(place(torus(0.19, 0.05, 10, 4), DX + 0.14, 2.86, z + 0.12, 90, 0, 0), PAL.coral));
  // the patch of wall where places are chalked: at the corner, where the line turns
  const CX = -3.02;
  parts.push(bx(0.8, 1.6, 0.03, CX, 1.5, z + 0.012, '#e8785e'));
  const m = merge(parts);
  m.anchors = { door: [DX, 0, z + 0.9], doorGlow: [DX, 1.5, z + 0.3], windows: WX.map((x) => [x, 2.0, z + 0.25]), sign: [-w / 2 + 0.1, 3.75, z - 0.2], chalk: [CX - 0.36, 0.82, z + 0.04], lamp: [DX, 2.2, z + 1.6] };
  return m;
}

function build(engine = null, { light: lightName = 'dawn', low = false } = {}) {
  const { name: light, L } = pickLight('commons-queue', LIGHTS, lightName);
  const M = ch5Materials(), r = rng(5454);
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  env.water.level = WATER;
  env.water.shores = [[0, QUAY_Z + 0.1 + 900, 900, 0.75]];
  const hallAt = (name) => anchorAt(hall, name, HALL.pos, HALL.yaw);

  // ---- the street
  const flat = group('flat'), town = group('town'), far = group('far');
  flat.add(node('cobbles', paving({ w: 30, d: 54, nx: 22, nz: 46, colors: ['#f2dcb0', '#e6cc9c', '#f8e6c0', '#e0c494'], grout: '#c4a27c', seed: 6, gap: 0.06 }), M.flat, { pos: [0, 0, QUAY_Z + 27] }));
  town.add(node('quay', bx(60, 1.6, 0.6, 0, -0.8, QUAY_Z - 0.3, PAL.stone2), M.ground));
  const hall = savingsHall(HALL);
  town.add(node('hall', hall, M.wall, { pos: HALL.pos, rot: [0, HALL.yaw, 0] }));
  town.add(node('sign', ringsSign({ reach: 1.7, r: 0.36 }), M.prop, { pos: hallAt('sign'), rot: [0, HALL.yaw + 180, 0] }));
  // rope-sheds down the left: low, shuttered, the sun behind them
  const shed = (len, h, c, roof) => merge(bx(3.4, h, len, 0, h / 2, 0, c), tint(place(extrude([[-1.9, 0], [0, 1.1], [1.9, 0]], len + 0.4, { crease: 30 }), 0, h, 0), roof), ...[-1, 0, 1].map((k) => bx(0.08, h * 0.62, len * 0.22, 1.72, h * 0.36, k * len * 0.3, TL.tealDark)), bx(0.1, 0.14, len, 1.74, h * 0.74, 0, TL.woodDark));
  town.add(node('shed1', shed(6.0, 2.0, '#ffd9b4', TL.slate), M.prop, { pos: [-6.6, 0, -3.6], rot: [0, 4, 0] }));
  town.add(node('shed2', shed(4.6, 2.2, '#f2c6a0', TL.brick), M.prop, { pos: [-6.5, 0, 3.4], rot: [0, -3, 0] }));
  town.add(node('shed3', shed(7.0, 2.7, '#ffe2c0', TL.copperDark), M.prop, { pos: [-7.0, 0, -10.8], rot: [0, 2, 0] }));
  // coils of rope and a spar: it is Ropewalk
  town.add(node('coil', merge(tint(place(torus(0.34, 0.1, 10, 5), 0, 0.1, 0), PAL.rope), tint(place(torus(0.3, 0.1, 10, 5), 0.02, 0.28, 0), PAL.rope), tint(place(torus(0.24, 0.09, 10, 5), 0, 0.44, 0), PAL.rope)), M.prop, { pos: [-4.9, 0, -1.2] }));
  town.add(node('barrel', barrel({ r: 0.3, h: 0.74 }), M.prop, { pos: [-5.0, 0, -2.3] }), node('crate', crate({ s: 0.55, seed: 5 }), M.prop, { pos: [-4.8, 0, -6.2], rot: [0, 20, 0] }));
  const POST = [-4.3, 0, -3.9], post = lampPost({ h: 2.9, arm: 0.6, lit: true });
  town.add(node('post', post, M.prop, { pos: POST }));
  // the houses of Ropewalk, down to the water
  const houses = [];
  const addHouse = (pos, yaw, opts, mat, to) => { const m = gableHouse({ lit: L.lit, dark: L.pane, ...opts }); to.add(node('house', m, mat, { pos, rot: [0, yaw, 0] })); houses.push({ m, pos, yaw }); };
  const walls = [TL.lemon, TL.rose, TL.sky, TL.mintWall, TL.cream, TL.lilac], roofs = [TL.slate, TL.brick, TL.copper, '#e86a9a'], gables = ['step', 'point', 'bell'];
  const NS = low ? 3 : 5;
  for (let i = 0; i < NS; i++) {
    const zl = -16.6 - i * 3.9, zr = -11.2 - i * 3.8;
    addHouse([STREET_X - 4.6, 0, zl], 88, { w: 3.4, h: 4.4 + r() * 2, floors: 3, cols: 2, wall: walls[(i * 2) % 6], roof: roofs[i % 4], gable: gables[i % 3], seed: 40 + i, shut: 0.3 }, i < 2 ? M.wall : M.farFlat, i < 2 ? town : far);
    addHouse([STREET_X + 4.9 + (i === 0 ? 0.6 : 0), 0, zr], -88, { w: 3.4, h: 4.8 + r() * 2.2, floors: 3, cols: 2, wall: walls[(i * 2 + 1) % 6], roof: roofs[(i + 2) % 4], gable: gables[(i + 1) % 3], seed: 50 + i, awning: i % 2 ? PAL.coral : null }, i < 2 ? M.wall : M.farFlat, i < 2 ? town : far);
  }
  // the rope-shed and masts at the foot of the street
  far.add(node('rope-shed', merge(bx(9, 2.6, 3, 0, 1.3, 0, '#ffd0a8'), tint(place(extrude([[-1.8, 0], [0, 1.3], [1.8, 0]], 9.4, { crease: 30 }), 0, 2.6, 0, 0, 90, 0), TL.slate)), M.farFlat, { pos: [STREET_X - 8.4, 0, QUAY_Z + 5] }));
  for (const [x, hgt, c] of [[-4.6, 8, PAL.red], [-1.4, 6.4, TL.teal], [1.2, 9, PAL.yellow]]) far.add(node('mast', merge(tint(place(cylinder(0.12, 0.07, hgt, 5), 0, 0, 0), TL.woodDark), bx(2.6, 0.1, 0.1, 0, hgt * 0.72, 0, TL.woodDark), bx(1.6, 0.08, 0.08, 0, hgt * 0.45, 0, TL.woodDark), tint(place(extrude([[0, 0], [1.1, 0.2], [0, 0.42]], 0.04), 0.1, hgt - 0.5, 0), c)), M.farFlat, { pos: [x, WATER, QUAY_Z - 3 - Math.abs(x) * 0.6] }));
  if (!low) far.add(node('headland', headland({ w: 90, d: 30, h: 9, seed: 12 }), M.farFlat, { pos: [-60, WATER - 0.4, -170], rot: [0, 190, 0] }));

  // ---- the table in the street, and the book open on it for anyone to read
  const TABLE = [-0.05, 0, -1.75];
  town.add(node('table', merge(bx(1.9, 0.09, 0.95, 0, 0.8, 0, TL.woodPale), bx(1.7, 0.14, 0.75, 0, 0.7, 0, TL.wood), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => tint(place(cylinder(0.05, 0.04, 0.7, 6), sx * 0.8, 0, sz * 0.36, sz * 4, 0, sx * -4), TL.woodDark)), bx(1.5, 0.5, 0.02, 0, 0.5, 0.49, TL.copper), tint(place(torus(0.11, 0.03, 8, 4), -0.07, 0.5, 0.5, 90, 0, 0), TL.cream), tint(place(torus(0.11, 0.03, 8, 4), 0.07, 0.5, 0.5, 90, 0, 0), TL.cream)), M.prop, { pos: TABLE, rot: [0, 3, 0] }));
  town.add(node('ledger', ledgerBook({ w: 1.15, d: 0.74, cover: '#2f8f7e' }), M.prop, { pos: [TABLE[0], 0.85, TABLE[2]], rot: [-8, 3, 0] }));
  town.add(node('cashbox', merge(bx(0.34, 0.2, 0.24, 0, 0.1, 0, TL.iron), bx(0.36, 0.05, 0.26, 0, 0.22, 0, TL.brass)), M.prop, { pos: [TABLE[0] + 0.72, 0.85, TABLE[2] + 0.2], rot: [0, -14, 0] }));
  // Tobb's slate: the box, chalked up every hour
  town.add(node('slate', merge(bx(0.06, 1.5, 0.06, -0.36, 0.72, 0, TL.woodDark, 8, 0, -6), bx(0.06, 1.5, 0.06, 0.36, 0.72, 0, TL.woodDark, 8, 0, 6), bx(0.06, 1.4, 0.06, 0, 0.66, -0.36, TL.woodDark, -18, 0, 0), bx(0.86, 0.66, 0.05, 0, 1.08, 0.1, TL.board, 8, 0, 0), bx(0.6, 0.06, 0.02, 0, 1.26, 0.15, TL.chalk, 8, 0, 0), bx(0.4, 0.06, 0.02, -0.1, 1.1, 0.13, '#8ef0c8', 8, 0, 0), bx(0.5, 0.06, 0.02, -0.05, 0.94, 0.11, TL.chalk, 8, 0, 0)), M.prop, { pos: [1.75, 0, -2.3], rot: [0, -24, 0] }));
  scene.root.add(mergeStatic(flat, 'flat'), mergeStatic(town, 'town'), mergeStatic(far, 'far'));

  // ---- chalk on the wall: forty places, in order
  const CH = 40, chalk = node('chalk', setGlow(tint(box(1, 1, 1), TL.chalk), 0.35), M.speck, { pos: HALL.pos, rot: [0, HALL.yaw, 0] });
  chalk.castShadow = false; chalk.instances = makeInstances(CH);
  { const c0 = hall.anchors.chalk; for (let i = 0; i < CH; i++) { const row = Math.floor(i / 5), col = i % 5; m4.fromTRS(chalk.instances.data.subarray(i * 20, i * 20 + 16), [c0[0] + 0.08 + col * 0.14 + (r() - 0.5) * 0.02, c0[1] + 1.3 - row * 0.165, c0[2]], quat.fromEuler(quat.create(), 0, 0, (r() - 0.5) * 0.3), [0.08 + r() * 0.04, 0.035, 0.012]); } }
  scene.root.add(chalk);

  // ---- the line: from the door, along the front of the hall, and away down the street
  const door = hallAt('door'), PATH = [[door[0] - 0.1, door[2] + 0.1], [0.3, -4.3], [-1.3, -5.6], [-2.4, -7.6], [STREET_X - 0.2, -11], [STREET_X + 0.2, -15], [STREET_X - 0.1, -21], [STREET_X + 0.2, -28], [STREET_X, -36]];
  const along = (s) => { let rem = s; for (let i = 0; i < PATH.length - 1; i++) { const a = PATH[i], b = PATH[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (rem <= l || i === PATH.length - 2) { const t = Math.min(1, rem / l); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(a[0] - b[0], a[1] - b[1]) / DEG]; } rem -= l; } return [0, 0, 0]; };
  const nearSpots = [], farSpots = [];
  const N = low ? 60 : 104;
  for (let i = 0; i < N; i++) {
    const s = 0.5 + Math.floor(i / 2) * (low ? 1.1 : 0.72), p = along(s), side = (i % 2 ? 1 : -1) * (0.3 + r() * 0.12), a = p[2] * DEG;
    const x = p[0] + Math.cos(a) * side + (r() - 0.5) * 0.14, z = p[1] - Math.sin(a) * side + (r() - 0.5) * 0.14;
    (z > -8 ? nearSpots : farSpots).push({ pos: [x, 0, z], face: p[2] + (r() - 0.5) * 30, sit: 0 });
  }
  const near = throng({ spots: nearSpots, material: M.deco, seed: 6, detail: low ? 0 : 1 });
  const mass = throng({ spots: farSpots, material: M.speck, seed: 9, detail: 0 });
  scene.root.add(...near.nodes, ...mass.nodes);
  const everyone = [...near.people, ...mass.people], sitRank = everyone.map(() => r());

  // ---- small life: a sheet or two blowing, gulls over the water
  const pages = papers({ count: low ? 4 : 8, box: [-4.6, 0.5, 0, 1.2, -9, -2.6], mode: 'blow', material: M.paper, seed: 5, size: 0.18 });
  scene.root.add(pages.node);
  const birds = node('gulls', gull({}), M.speck); birds.instances = makeInstances(4); birds.instances.count = 4; scene.root.add(birds);
  const clouds = cloudBank({ count: 8, seed: 9, arc: [160, 206], radius: [250, 430], height: [24, 130], size: [0.7, 1.4], speed: 0.05, style: 'painted', ...L.cloud });
  scene.root.add(clouds.node);

  // ---- foreground: somebody's basket and a mooring post
  const fg = group('fg');
  fg.add(node('fg-crate', crate({ s: 0.5, seed: 8, color: TL.woodPale }), M.prop, { pos: [-1.8, 0, 3.0], rot: [0, 16, 0] }), node('fg-barrel', barrel({ r: 0.27, h: 0.64 }), M.prop, { pos: [1.85, 0, 2.95] }));
  const foreground = mergeStatic(fg, 'foreground'); scene.root.add(foreground);
  const actors = group('actors'); scene.root.add(actors);

  // ---- lamps: the door, the two windows, the street lamp nobody has put out yet
  const doorGlow = hallAt('doorGlow'), wins = hallAt('windows'), postLamp = anchorAt(post, 'lamp', POST, 0);
  const lamps = [
    { name: 'door', pos: hallAt('lamp'), color: '#ffc468', radius: 7.5, base: 1.3 },
    { name: 'window-l', pos: wins[0], color: '#ffc468', radius: 4.2, base: 1.0 },
    { name: 'window-r', pos: wins[1], color: '#ffc468', radius: 4.2, base: 1.0 },
    { name: 'post', pos: postLamp, color: '#ffc870', radius: 5.0, base: 0.9 },
  ];
  const sprites = scene.sprites = createSprites(low ? 128 : 320), glows = [];
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: doorGlow, size: 3.4, color: '#ffb450', alpha: 0 }), base: 0.5 });
  for (const p of wins) glows.push({ sprite: sprites.add({ kind: 'glow', pos: p, size: 2.0, color: '#ffb450', alpha: 0 }), base: 0.42 });
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: postLamp, size: 1.7, color: '#ffb450', alpha: 0 }), base: 0.5 });

  // ---- per-frame
  const P = [0, 0, 0], V = [0, 0, 0], S3 = [1, 1, 1], Q = quat.create(), Mx = m4.create(), rnd = rng(91);
  let mood = 0.05, nextBreath = 0, nextGust = 2;
  function setQueue(a) { near.setAmount(Math.min(1, a * 1.6)); mass.setAmount(Math.max(0, (a - 0.3) / 0.7)); }   // it empties from the far end
  function setSitting(f) { for (let i = 0; i < everyone.length; i++) everyone[i].sit = sitRank[i] < f ? 1 : 0; }
  function setChalk(v) { chalk.instances.count = Math.round(Math.max(0, Math.min(1, v)) * CH); chalk.visible = chalk.instances.count > 0; chalk.instances.dirty = true; }
  const setMood = (m) => { mood = Math.max(0, Math.min(1, m)); };
  setChalk(0);
  const CUES = {
    'ch5.s4.c01': () => { setQueue(1); setSitting(0); setChalk(0); setMood(0.05); }, 'ch5.s4.c02': () => setMood(0.7), 'ch5.s4.c04': () => setMood(0.3), 'ch5.s4.c11': () => setMood(1), 'ch5.s4.c12': () => setMood(0.4),
    'ch5.s4.c16': () => setMood(0.1), 'ch5.s4.c18': () => { setChalk(0.5); setSitting(0.45); }, 'ch5.s4.c21': () => setChalk(0.75), 'ch5.s4.c22': () => { setQueue(0.7); setSitting(0.6); }, 'ch5.s4.c26': () => { setQueue(0.4); setSitting(0.8); setChalk(1); setMood(0.1); },
  };
  const cue = (id) => { const f = CUES[id]; if (f) f(); return !!f; };
  function tick(time, dt, pw, live) {
    near.update(time, dt, { lively: mood }); mass.update(time, dt, { lively: mood });
    pages.update(time); clouds.update(time);
    for (let i = 0; i < 4; i++) {
      const a = time * (0.24 + i * 0.04) * (i % 2 ? 1 : -1) + i * 1.9, rad = 6 + i * 2.2;
      P[0] = -6 + i * 3 + Math.cos(a) * rad; P[1] = 6 + i * 1.3 + Math.sin(time * 0.5 + i) * 0.8; P[2] = -40 - i * 5 + Math.sin(a) * rad * 0.6;
      quat.fromEuler(Q, 0, Math.sin(a) * 0.35, Math.cos(a) * 0.3 * (i % 2 ? 1 : -1));
      const flap = Math.sin(time * (5.5 + i * 0.4) + i * 2); S3[0] = 1.8; S3[1] = 1.8 * (0.5 + 1.3 * flap); S3[2] = 1.8; if (Math.abs(S3[1]) < 0.12) S3[1] = 0.12;
      m4.fromTRS(Mx, P, Q, S3); birds.instances.data.set(Mx, i * 20);
    }
    birds.instances.dirty = true;
    if (!live) return;
    if (L.breath && !low && time > nextBreath) { // their breath, in the cold
      nextBreath = time + 0.28; const p = near.people[Math.floor(rnd() * near.people.length)];
      if (p && p.here > 0.5) { P[0] = p.pos[0]; P[1] = 0.78 * p.s - p.sit * 0.2; P[2] = p.pos[2] + 0.2; sprites.puff(P, { count: 1, size: 0.13, rise: 0.22, spread: 0.04, life: 1.3, color: '#ffffff' }); }
    }
    if (time > nextGust) { nextGust = time + 3 + rnd() * 2; P[0] = -5 + rnd() * 3; P[1] = 1.6 + rnd() * 2; P[2] = -8 + rnd() * 5; V[0] = 1.8; V[1] = 0.1; V[2] = 0.2; sprites.gust(P, { vel: V, size: 0.9 + rnd() * 0.4, life: 2.2, alpha: 0.7, color: '#fff0e6' }); }
  }

  const tableMark = { pos: [TABLE[0], 0, TABLE[2] - 0.75], face: 0 };
  return shell({
    id: 'commons-queue', light, L, scene, cameras: CAMERAS, actors, foreground, lamps, glows, tick, dim: 0.22,
    motes: low ? null : { box: [-3, 3, 0.3, 3, -3, 2], every: 0.4, color: L.mote, size: 0.06, vel: [0.1, 0.06, 0.03], life: 5, alpha: 0.6 },
    marks: { ...MARKS, table: tableMark, ledger: [TABLE[0], 0.95, TABLE[2]], door: { pos: [door[0], 0, door[2]], face: HALL.yaw }, wall: hallAt('chalk'), focus: doorGlow },
    extra: { setQueue, setSitting, setChalk, setMood, cue, queueCount: everyone.length },
  });
}

export const commonsQueue = { id: 'commons-queue', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default commonsQueue;
