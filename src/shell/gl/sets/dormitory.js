// SET: dormitory. The scholarship dormitory at Halcyon: iron double bunks down both sides of a long room,
// head to the wall and foot to the aisle, a number on every one; one gas lamp over the aisle, one tall window
// at the far end, a kit box square under every foot rail. The room is seen from its lobby, through the arch
// with SCHOLARS over it: the passage door is in the lobby wall stage left, pegs and boots stage right.
// Chapter 3: ch3.s3 Bed Nineteen (Ren's old bunk, the two tallies under the frame; by lights-out every cadet
// holds his own contract; they vote with a hand up). Chapter 8 epilogues: lights-out, somebody walking it.
//
//   import { dormitory } from './sets/dormitory.js';
//   const set = dormitory.build(GL, { light: 'evening' | 'night', low: false });
//
// Same shape as sets/lantern-stalls.js. Figures face +Z, cameras look toward -Z down the aisle. The strip
// x -3.2..3.2, z 0..1.6 is clear (it is the lobby floor).
//
// What this set can do for its story:
//   setCadets(0..1)     boys sitting on the foot of their bunks, each with his contract in both hands ('night': all asleep, 0)
//   vote(0..1)          that share of them have a hand up (every hand in the room at 1)
//   task(type)          'tally' | 'bed-nineteen' -> { pos, stand, set(v) }: v 0..1 lights the scratched tally; else null
// marks: a, b, c, two, party, opposition as everywhere, plus
//   bed19 { pos, face }: standing at the foot of bed nineteen     tally (world point under its frame)
//   door { pos, face }: just inside the passage door     passage { pos, face }: outside it, back to the door
//   focus: the gas lamp

import { rng, DEG } from '../math.js';
import { merge, tint, place, box, cylinder, sphere, ellipsoid, lathe, quad, setGlow, setOutline } from '../mesh.js';
import { node, group, material, makeEnv, createScene, mergeStatic } from '../scene.js';
import { createSprites } from '../sprites.js';
import { rayMesh, rayMaterial } from '../fx.js';
import { KB, kitBMaterials, setShell, lightOf, norm3, wall, windowFrame, shaftCards, lightPatch, ceiling, boards, doorway, hangingLamp } from './kit-b.js';
import { H3, pixelText, people, bunk, stove } from './kit-ch3.js';

const HALF = 3.35, MOUTH = -0.95, BACK = -11.6, H = 4.7, LOBBY = 7.8, ROWS = 6, ROW0 = -1.85, PITCH = 1.58, FOOT = 1.22;

const LIGHTS = {
  evening: {
    preset: 'night', power: 1, night: false,
    env: {
      key: { dir: norm3([-0.3, 0.72, 0.62]), color: '#eec4b4' },
      shadow: { tint: '#5a4cd0', lift: 0.1, saturate: 1.5 },
      ambient: { sky: '#ffb090', ground: '#5a4cc8', amount: 0.15 },
      rim: { color: '#ffd98a', amount: 0.5, edge: 0.76 },
      fog: { color: '#6a78e8', density: 0.012, start: 7, max: 0.3 },
      sky: { zenith: '#1c2a90', mid: '#5a56d0', midAt: 0.45, horizon: '#f08ab0', below: '#34349c', stars: 0.6, moon: 0 },
      water: null,
    },
    glass: '#b09cff', glassGlow: 0.85, shaft: '#8274e0', patch: '#c8b8ff', wallUp: '#ffe6cc', sleepers: false, cadets: 1,
  },
  night: {
    preset: 'night', power: 0.6, night: true,
    env: {
      key: { dir: norm3([-0.28, 0.7, 0.64]), color: '#8ea2f4' },
      shadow: { tint: '#2f3fa8', lift: 0.13, saturate: 1.3 },
      ambient: { sky: '#4c6ce0', ground: '#33379c', amount: 0.17 },
      rim: { color: '#bcd0ff', amount: 0.6, edge: 0.76 },
      fog: { color: '#3048c0', density: 0.012, start: 7, max: 0.34 },
      sky: { zenith: '#0c1a70', mid: '#243ab0', midAt: 0.45, horizon: '#5a78e0', below: '#2f3aa0', stars: 1, moon: 0.7 },
      water: null,
    },
    glass: '#86a2f6', glassGlow: 0.7, shaft: '#4f66c8', patch: '#a8c0ff', wallUp: '#cfd4ff', sleepers: true, cadets: 0,
  },
};

const CAMERAS = {
  wide: { target: [0.05, 1.6, -0.6], dist: 8.4, yaw: 2.5, pitch: 5, fov: 44, aspect: 0.46, shadowCenter: [0, 0, -1.6], shadowRadius: 7 },
  two: { target: [0, 1.12, 0.6], dist: 6.0, yaw: -13, pitch: 5, fov: 31, aspect: 0.46, shadowCenter: [0, 0, 0.3], shadowRadius: 3.6 },
  close: { target: [0.02, 0.86, 0.8], dist: 3.9, yaw: 19, pitch: 3, fov: 28, aspect: 0.46, shadowCenter: [0, 0, 0.5], shadowRadius: 2.6 },
  low: { target: [0.5, 1.15, -1.0], dist: 5.6, yaw: -14, pitch: -4, fov: 50, aspect: 0.46, shadowCenter: [0, 0, -1.2], shadowRadius: 6 },
  stage: { target: [0, 1.12, 0.2], dist: 9.6, yaw: -10, pitch: 6, fov: 26, aspect: 1.95, shadowCenter: [0, 0, -1.0], shadowRadius: 7, outline: 0.7 },
  landscape: { target: [0, 1.7, -1.4], dist: 9.8, yaw: 4, pitch: 5, fov: 40, aspect: 1.6, shadowCenter: [0, 0, -1.6], shadowRadius: 9 },
};

const MARKS = {
  a: { pos: [-0.8, 0, 0.55], face: 14 }, b: { pos: [0.02, 0, 0.8], face: 0 }, c: { pos: [0.82, 0, 0.55], face: -14 },
  two: [{ pos: [-0.42, 0, 0.62], face: 24 }, { pos: [0.42, 0, 0.62], face: -24 }],
  party: [{ pos: [-1.05, 0, 0.75], face: 78 }, { pos: [-1.85, 0, 1.15], face: 72 }, { pos: [-2.5, 0, 0.5], face: 80 }],
  opposition: [{ pos: [1.05, 0, 0.75], face: -78 }, { pos: [1.85, 0, 1.15], face: -72 }, { pos: [2.55, 0, 0.5], face: -80 }],
};

function build(engine = null, { light: lightName = 'evening', low = false } = {}) {
  const [light, L] = lightOf('dormitory', LIGHTS, ALIAS[lightName] || lightName);
  const M = kitBMaterials(), r = rng(1919);
  M.deco = material({ name: 'dorm-deco', rim: 0, outline: false, castShadow: false });
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  const deco = (n) => { n.castShadow = false; return n; };
  const DADO = 1.25, dadoCol = H3.teal, lineCol = H3.gold;

  // ---- the room: a lobby across the front, the long dormitory through an arch behind it
  const room = group('room');
  room.add(node('floor', place(boards({ w: 18, d: 18, n: 22, colors: ['#f6d4a2', '#eec792', '#fbdfb4'], seed: 2 }), 0, 0, -4.4), M.flat));
  // the aisle is painted on the boards, as everything here is
  room.add(node('aisle', setOutline(merge(tint(place(box(0.07, 0.004, -BACK + MOUTH), -FOOT + 0.14, 0.006, (BACK + MOUTH) / 2), '#ffffff'), tint(place(box(0.07, 0.004, -BACK + MOUTH), FOOT - 0.14, 0.006, (BACK + MOUTH) / 2), '#ffffff'), tint(place(box(FOOT * 2 - 0.5, 0.004, -BACK + MOUTH - 0.3), 0, 0.004, (BACK + MOUTH) / 2), '#7f8cf0')), 0), M.flat));
  const SIDE_WIN = []; for (let i = 0; i < ROWS - 1; i++) SIDE_WIN.push(ROW0 - PITCH * (i + 0.5));
  const zc = (MOUTH + BACK) / 2, len = MOUTH - BACK;
  const sideOpen = (sgn) => SIDE_WIN.map((z) => ({ x: sgn * (z - zc), w: 0.86, sill: 2.75, top: 3.6 }));
  room.add(node('wall-l', wall({ w: len, h: H, t: 0.4, color: L.wallUp, openings: sideOpen(-1) }), M.wall, { pos: [-HALF, 0, zc], rot: [0, 90, 0] }));
  room.add(node('wall-r', wall({ w: len, h: H, t: 0.4, color: L.wallUp, openings: sideOpen(1) }), M.wall, { pos: [HALF, 0, zc], rot: [0, -90, 0] }));
  const WIN = { x: 0, w: 1.9, sill: 1.15, top: 4.2, arch: true };
  room.add(node('wall-back', wall({ w: HALF * 2 + 0.4, h: H, t: 0.4, color: L.wallUp, openings: [WIN] }), M.wall, { pos: [0, 0, BACK] }));
  const DOOR = { x: -5.55, w: 1.5, sill: 0, top: 2.7 }, lw = LOBBY - HALF;
  room.add(node('lobby-l', wall({ w: lw + 0.4, h: H + 0.6, t: 0.4, color: L.wallUp, openings: [{ ...DOOR, x: DOOR.x + (HALF + LOBBY) / 2 }] }), M.wall, { pos: [-(HALF + LOBBY) / 2, 0, MOUTH] }));
  room.add(node('lobby-r', wall({ w: lw + 0.4, h: H + 0.6, t: 0.4, color: L.wallUp }), M.wall, { pos: [(HALF + LOBBY) / 2, 0, MOUTH] }));
  for (const sx of [-1, 1]) room.add(node('lobby-side', wall({ w: 6, h: H + 0.6, t: 0.4, color: L.wallUp }), M.wall, { pos: [sx * (LOBBY + 0.8), 0, MOUTH + 2.6], rot: [0, -sx * 72, 0] }));
  // dado: Company teal to shoulder height with a gold line on it, all the way round
  const dado = [];
  for (const sx of [-1, 1]) {
    dado.push(tint(place(box(0.06, DADO, len), sx * (HALF - 0.03), DADO / 2, zc), dadoCol), tint(place(box(0.08, 0.08, len), sx * (HALF - 0.04), DADO + 0.04, zc), lineCol));
    dado.push(tint(place(box(0.34, H, 0.5), sx * (HALF - 0.02), H / 2, MOUTH + 0.05), '#fff8ea'), tint(place(box(0.42, 0.3, 0.58), sx * (HALF - 0.02), 0.15, MOUTH + 0.05), dadoCol)); // the arch's two piers
  }
  dado.push(tint(place(box(HALF * 2, DADO, 0.06), 0, DADO / 2, BACK + 0.03), dadoCol), tint(place(box(HALF * 2, 0.08, 0.08), 0, DADO + 0.04, BACK + 0.04), lineCol));
  for (const [x0, x1] of [[-LOBBY, DOOR.x - DOOR.w / 2 - 0.12], [DOOR.x + DOOR.w / 2 + 0.12, -HALF - 0.2], [HALF + 0.2, LOBBY]]) dado.push(tint(place(box(x1 - x0, DADO, 0.06), (x0 + x1) / 2, DADO / 2, MOUTH + 0.03), dadoCol), tint(place(box(x1 - x0, 0.08, 0.08), (x0 + x1) / 2, DADO + 0.04, MOUTH + 0.04), lineCol));
  // the header over the arch, and what it says
  dado.push(tint(place(box(HALF * 2 + 0.5, 0.95, 0.5), 0, H - 0.2, MOUTH + 0.05), '#fff8ea'), tint(place(box(3.7, 0.52, 0.06), 0, H - 0.26, MOUTH + 0.32), H3.tealDark), tint(place(box(3.84, 0.06, 0.08), 0, H - 0.55, MOUTH + 0.32), lineCol), tint(place(box(3.84, 0.06, 0.08), 0, H + 0.03, MOUTH + 0.32), lineCol));
  room.add(node('dado', merge(dado), M.wall), node('sign', place(pixelText('SCHOLARS', { s: 0.3, color: H3.gold, glow: 0.5 }), 0, H - 0.26, MOUTH + 0.36), M.flat));
  room.add(node('ceiling', ceiling({ w: HALF * 2 + 0.6, d: len + 0.4, color: '#5a62d8', beams: 4, beam: '#4450c0', bw: 0.26, bh: 0.3 }), M.wall, { pos: [0, H, zc] }));
  room.add(node('ceiling-lobby', tint(place(box(LOBBY * 2 + 6, 0.2, 8), 0, H + 0.7, MOUTH + 4), '#5a62d8'), M.wall));
  // glass: the tall window at the end, small high ones down both sides
  const glass = [setGlow(tint(place(box(WIN.w, WIN.top - WIN.sill, 0.05), 0, (WIN.sill + WIN.top) / 2, BACK - 0.34), L.glass), L.glassGlow)];
  for (const sx of [-1, 1]) for (const z of SIDE_WIN) glass.push(setGlow(tint(place(box(0.05, 0.85, 0.86), sx * (HALF + 0.34), 3.18, z), L.glass), L.glassGlow * 0.9), tint(place(box(0.5, 0.05, 0.05), sx * (HALF + 0.2), 3.18, z), '#fff8ea'), tint(place(box(0.5, 0.86, 0.05), sx * (HALF + 0.2), 3.18, z), '#fff8ea'));
  room.add(node('glass', merge(glass), M.deco));
  room.add(node('patch', lightPatch({ w: 1.5, d: 3.4, panes: 2, shear: 0.06, color: L.patch, glow: 0.45 }), M.flat, { pos: [0.12, 0.012, BACK + 3.0] }));
  scene.root.add(mergeStatic(room, 'room'));

  // ---- bunks: the near rows are drawn in ink and throw shadows, the far rows do neither
  const near = group('bunks-near'), far = group('bunks-far'), beds = [];
  for (let k = 0; k < ROWS; k++) for (const sx of [-1, 1]) {
    const number = 19 + k * 2 + (sx < 0 ? 1 : 0), z = ROW0 - PITCH * k, yaw = sx > 0 ? -72 : 72; // foot to the aisle, turned a little to the lobby so the plate can be read
    const mesh = bunk({ number, seed: number, blanket: k % 3 === 1 ? '#3fd0bc' : H3.teal, made: !L.sleepers, kit: H3.coral, lean: 0.02 });
    const pos = [sx * FOOT, 0, z];
    (k < 3 ? near : far).add(node('bunk' + number, mesh, k < 3 ? M.prop : M.deco, { pos, rot: [0, yaw, 0] }));
    beds.push({ number, pos, yaw, mesh, k, sx });
  }
  const at = (bed, name) => { const a = bed.mesh.anchors[name], c = Math.cos(bed.yaw * DEG), s = Math.sin(bed.yaw * DEG); return [bed.pos[0] + a[0] * c + a[2] * s, bed.pos[1] + a[1], bed.pos[2] - a[0] * s + a[2] * c]; };
  // whoever is asleep: a lump under the blanket and a head on the pillow
  if (L.sleepers) {
    const lumps = [], hairs = ['#7a5038', '#e07a40', '#4a4478', '#fff6e6'];
    for (const bed of beds) for (const lvl of ['lower', 'upper']) {
      if (r() < 0.12) continue;
      const c = at(bed, lvl), s = Math.sin(bed.yaw * DEG), cs = Math.cos(bed.yaw * DEG);
      lumps.push(tint(place(ellipsoid(0.3, 0.17, 0.6, 6, 4), c[0] + 0.1 * s, c[1] + 0.06, c[2] + 0.1 * cs, 0, bed.yaw, 0), bed.k % 3 === 1 ? '#3fd0bc' : H3.teal));
      lumps.push(tint(place(sphere(0.15, 6, 4), c[0] - 0.66 * s, c[1] + 0.12, c[2] - 0.66 * cs), hairs[Math.floor(r() * hairs.length)]));
    }
    far.add(node('sleepers', merge(lumps), M.deco));
  }
  // bed nineteen: the tally scratched on the inside of the foot rail, an old run and a new one begun where it stopped
  const B19 = beds.find((b) => b.number === 19), TALLY = at(B19, 'under');
  const strokes = [];
  for (let g = 0; g < 7; g++) { for (let i = 0; i < 4; i++) strokes.push(place(quad(0.012, 0.07), -0.3 + g * 0.09 + i * 0.016, 0, 0)); strokes.push(place(quad(0.012, 0.1), -0.3 + g * 0.09 + 0.024, 0, 0.001, 0, 0, 58)); }
  const tallyMesh = setOutline(merge(tint(merge(strokes.slice(0, 20)), '#9aa6e8'), tint(merge(strokes.slice(20)), '#fff6c8')), 0);
  const tally = node('tally', setGlow(tallyMesh, 0.25), M.flat, { pos: [TALLY[0], 0.36, TALLY[2]], rot: [0, B19.yaw, 0] }); tally.castShadow = false;
  tally.position[0] += Math.sin(B19.yaw * DEG) * 0.16; tally.position[2] += Math.cos(B19.yaw * DEG) * 0.16;
  scene.root.add(mergeStatic(near, 'bunks-near'), mergeStatic(far, 'bunks-far'), tally);

  // ---- the lobby: the passage door (left), pegs with coats and a row of boots (right), a stove, the rules
  const props = group('props');
  const door = doorway({ w: 1.4, h: 2.6, open: 0, color: H3.tealDark, frame: '#fff8ea', knob: H3.gold, glass: '#ffe2a0', side: 1 });
  props.add(deco(node('door', door, M.prop, { pos: [DOOR.x, 0, MOUTH] })));
  props.add(deco(node('transom', setGlow(tint(place(box(1.3, 0.34, 0.05), DOOR.x, 2.95, MOUTH - 0.1), '#ffe2a0'), 0.9), M.prop)));
  const PEG_X = [4.0, 4.7, 5.4, 6.1, 6.8], coat = (c) => merge(tint(place(lathe([[0, -0.9], [0.24, -0.9], [0.2, -0.3], [0.12, -0.02], [0, 0]], 6, { crease: 180 }), 0, 0, 0.12, 0, 0, 0, 1, 1, 0.5), c), tint(place(cylinder(0.02, 0.02, 0.16, 4), 0, 0, 0, 90, 0, 0), H3.gold), tint(place(cylinder(0.15, 0.13, 0.13, 6), 0, 0.32, 0.12), H3.tealDark), tint(place(cylinder(0.16, 0.155, 0.04, 6, { caps: false }), 0, 0.33, 0.12), H3.silver));
  props.add(deco(node('peg-rail', tint(place(box(3.5, 0.12, 0.06), 5.4, 2.28, MOUTH + 0.04), H3.woodDark), M.prop)));
  PEG_X.forEach((x, i) => props.add(deco(node('coat', coat(i === 3 ? H3.cadetDark : H3.cadet), M.prop, { pos: [x, 2.2, MOUTH + 0.06], rot: [0, 0, (r() - 0.5) * 5] }))));
  const boot = merge(tint(place(cylinder(0.075, 0.085, 0.3, 6), 0, 0.06, 0), '#2c2b52'), tint(place(box(0.15, 0.1, 0.26), 0, 0.05, 0.06), '#2c2b52'), tint(place(box(0.16, 0.03, 0.28), 0, 0.012, 0.06), H3.silver));
  props.add(deco(node('boot-shelf', tint(place(box(3.5, 0.06, 0.4), 5.4, 0.3, MOUTH + 0.24), H3.woodDark), M.prop)));
  for (let i = 0; i < 10; i++) props.add(deco(node('boot', boot, M.prop, { pos: [3.9 + i * 0.33 + (i % 2) * 0.02, 0.33, MOUTH + 0.22], rot: [0, (r() - 0.5) * 8, 0] })));
  props.add(deco(node('polish', merge(tint(place(cylinder(0.09, 0.09, 0.05, 8), 0, 0, 0), '#2c2b52'), tint(place(cylinder(0.07, 0.07, 0.02, 8), 0, 0.05, 0), H3.gold), tint(place(box(0.2, 0.05, 0.07), 0.2, 0.02, 0.02, 0, 30, 0), H3.woodPale)), M.prop, { pos: [7.2, 0.33, MOUTH + 0.24] })));
  // the rules, on a board between the door and the arch
  const rules = [tint(place(box(1.2, 1.5, 0.05), 0, 0, 0), H3.woodDark), tint(place(box(1.04, 1.34, 0.02), 0, 0, 0.03), H3.paper), place(pixelText('RULES', { s: 0.13, color: H3.red }), 0, 0.5, 0.045)];
  for (let i = 0; i < 8; i++) rules.push(setOutline(tint(place(quad(0.78 - (i % 3) * 0.12, 0.04), -0.06 * (i % 3), 0.3 - i * 0.11, 0.045), '#8f9bd8'), 0));
  props.add(deco(node('rules', merge(rules), M.prop, { pos: [-4.15, 2.2, MOUTH + 0.04], rot: [0, 0, -1.5] })));
  const STOVE = [6.6, 0, 0.7], st = stove({ s: 1.25, pipe: 3.6 });
  props.add(node('stove', st, M.prop, { pos: STOVE, rot: [0, -40, 0] }));
  // a bench under the rules, a bucket and brush by the door (somebody washed for his supper)
  props.add(node('bench', merge(tint(place(box(1.5, 0.08, 0.36), 0, 0.42, 0), H3.wood), tint(place(box(0.08, 0.42, 0.32), -0.6, 0.21, 0), H3.woodDark), tint(place(box(0.08, 0.42, 0.32), 0.6, 0.21, 0), H3.woodDark)), M.prop, { pos: [-4.15, 0, MOUTH + 0.32] }));
  props.add(node('bucket', merge(tint(place(cylinder(0.17, 0.22, 0.32, 8), 0, 0, 0), H3.silver), tint(place(cylinder(0.2, 0.2, 0.02, 8), 0, 0.29, 0), '#8fd0ff'), tint(place(box(0.3, 0.07, 0.1), 0.34, 0.035, 0.1, 0, 25, 0), H3.woodPale)), M.prop, { pos: [-6.9, 0, MOUTH + 0.5] }));
  // the window at the far end, the gas lamps
  props.add(deco(node('window', windowFrame({ w: WIN.w, h: WIN.top - WIN.sill, color: '#fff8ea', bars: 1, fan: null, depth: 0.4, thick: 0.12 }), M.prop, { pos: [0, WIN.sill, BACK] })));
  const LAMP = [0, H, -2.9], LAMP2 = [0, H, -7.6];
  const hl = hangingLamp({ drop: 1.5, r: 0.42, shade: H3.green, shape: 'cone', glass: '#ffe9a8' });
  props.add(deco(node('gas-lamp', hl, M.prop, { pos: LAMP })), deco(node('gas-lamp-2', hangingLamp({ drop: 1.5, r: 0.34, shade: H3.green, shape: 'cone', glass: '#ffe9a8' }), M.prop, { pos: LAMP2 })));
  scene.root.add(mergeStatic(props, 'props'));

  // ---- drawn light: the window down the aisle, the cone under the lamp
  const lampPos = [LAMP[0] + hl.anchors.lamp[0], LAMP[1] + hl.anchors.lamp[1], LAMP[2] + hl.anchors.lamp[2]];
  if (!low) scene.root.add(node('shaft', place(shaftCards({ w: WIN.w * 0.8, h: (WIN.top - WIN.sill) * 0.7, dir: [0.03, -0.62, 1], len: 5.2, cards: 3, color: L.shaft }), 0, (WIN.sill + WIN.top) / 2, BACK + 0.05), M.shaft));
  const cone = node('lamp-cone', tint(place(rayMesh(3.1, 0.3, 2.3, 16), lampPos[0], lampPos[1] + 0.05, lampPos[2]), '#ffc060'), rayMaterial({ power: 1.4, near: L.night ? 0.2 : 0.27, far: 0 }));
  scene.root.add(cone);

  // ---- the boys: one on the foot of every lower bunk, a few up top with their legs over the side
  const spots = [];
  for (const bed of beds) {
    const s = Math.sin(bed.yaw * DEG), c = Math.cos(bed.yaw * DEG), lo = at(bed, 'lower'), up = at(bed, 'upper'), toAisle = -bed.sx * 16;
    spots.push({ pos: [lo[0] + 0.56 * s, lo[1] - 0.02, lo[2] + 0.56 * c], yaw: bed.yaw * 0.25 + toAisle + (r() - 0.5) * 14, s: 0.66 + r() * 0.08, row: bed.k });
    if ((bed.k + (bed.sx > 0 ? 1 : 0)) % 2 === 0 && !(low && bed.k > 2)) spots.push({ pos: [up[0] + 0.5 * s, up[1] - 0.02, up[2] + 0.5 * c], yaw: bed.yaw * 0.25 + toAisle + (r() - 0.5) * 14, s: 0.64 + r() * 0.08, row: bed.k });
  }
  for (const [x, z] of [[-0.55, -9.4], [0.5, -10.0], [-0.1, -8.3]]) spots.push({ pos: [x, 0, z], yaw: (r() - 0.5) * 20, s: 0.68, row: 6 });
  const cadets = people({ spots, material: M.prop, uniform: { coat: H3.cadet, cap: H3.tealDark, band: H3.silver }, paper: true, arms: true, seed: 5 });
  scene.root.add(cadets.node);

  const fg = group('fg');
  fg.add(node('fg-box', merge(tint(place(box(0.6, 0.3, 0.42), 0, 0.15, 0), H3.coral), tint(place(box(0.62, 0.04, 0.44), 0, 0.24, 0), H3.brassDark)), M.prop, { pos: [-2.2, 0, 3.0], rot: [0, 18, 0] }), node('fg-boots', merge(place(boot, -0.1, 0, 0), place(boot, 0.12, 0, 0.03, 0, 12, 0)), M.prop, { pos: [2.1, 0, 2.9], rot: [0, 200, 0] }));
  const foreground = mergeStatic(fg, 'foreground'); scene.root.add(foreground);
  const actors = group('actors'); scene.root.add(actors);

  // ---- lamps
  const fire = [STOVE[0] - 0.3, 0.7, STOVE[2] + 0.35];
  const lamps = [
    { name: 'gas', pos: lampPos, color: '#ffc468', radius: 8, base: 1.5, flicker: 0.07 },
    { name: 'window', pos: [0, 2.6, BACK + 2.2], color: L.night ? '#8fa8ff' : '#a898ff', radius: 7, base: 1.2, flicker: 0 },
    { name: 'gas-2', pos: [LAMP2[0], LAMP2[1] - 1.7, LAMP2[2]], color: '#ffc468', radius: 5, base: 0.7, flicker: 0.07 },
    { name: 'door', pos: [DOOR.x + 0.3, 2.4, MOUTH + 1.0], color: '#ffc880', radius: 5, base: 0.9 },
    { name: 'stove', pos: fire, color: '#ff8a3c', radius: 4.2, base: 1.0, flicker: 0.16 },
  ];
  const sprites = scene.sprites = createSprites(low ? 96 : 224), glows = [];
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: lampPos, size: 2.6, color: '#ffc060', alpha: 0 }), base: 0.5 });
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: lamps[2].pos, size: 1.6, color: '#ffc060', alpha: 0 }), base: 0.4 });
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: [DOOR.x, 2.95, MOUTH + 0.1], size: 1.5, color: '#ffc870', alpha: 0 }), base: 0.45 });
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: [0, 2.9, BACK + 0.2], size: 4.4, color: L.night ? '#8fa8ff' : '#b8a0ff', alpha: 0 }), base: L.night ? 0.14 : 0.17, fixed: true });
  const stoveGlow = sprites.add({ kind: 'glow', pos: fire, size: 1.3, color: '#ff8a30', alpha: 0.5 });
  const tallyGlow = sprites.add({ kind: 'glow', pos: [tally.position[0], 0.36, tally.position[2]], size: 0.9, color: '#fff0a0', alpha: 0 });

  // ---- levers
  const N = cadets.count, hands = new Float32Array(N), order = new Uint16Array(N);
  { const rs = rng(5), sh = [...Array(N).keys()]; for (let i = N - 1; i > 0; i--) { const j = Math.floor(rs() * (i + 1)); const t = sh[i]; sh[i] = sh[j]; sh[j] = t; } sh.forEach((v, i) => { order[i] = v; }); }
  let present = L.cadets, votes = 0, tallyOn = 0;
  function setCadets(a) { present = Math.max(0, Math.min(1, a)); }
  function vote(v) { votes = Math.max(0, Math.min(1, v)); const n = Math.round(votes * N); for (let i = 0; i < N; i++) hands[order[i]] = i < n ? 1 : 0; }
  for (let i = 0; i < N; i++) { cadets.list[i].here = present; cadets.write(i); }
  const TASK = { pos: [tally.position[0], 0.4, tally.position[2]], stand: [B19.pos[0] - 0.5, B19.pos[2] + 0.9], set(v) { tallyOn = Math.max(0, Math.min(1, v)); } };
  // ch3.s3's encounter (reading the contract): the tally first, then boy after boy with his own copy
  const READ = { pos: TASK.pos, stand: TASK.stand, set(v) { tallyOn = Math.max(0, Math.min(1, v * 3)); setCadets((v - 1 / 3) * 1.5); if (votes !== 0) vote(0); } };
  const task = (type) => (type === 'tally' || type === 'bed-nineteen' ? TASK : type === 'indentures' ? READ : null);
  /** Stage business by script line. */
  function cue(id) {
    switch (id) {
      case 'ch3.s3.c10': setCadets(1); return true;
      case 'ch3.s3.c29': vote(0.35); return true;
      case 'ch3.s3.c30': vote(1); return true;
      default: return false;
    }
  }

  const P = [0, 0, 0], V = [0, 0, 0], rnd = rng(23);
  let nextMote = 0, nextEmber = 0, cursor = 0;
  function tick(time, dt, pw, live) {
    const k = dt === 0 ? 1 : Math.min(1, dt * 6), n = Math.round(present * N);
    for (let i = 0; i < N; i++) {
      const p = cadets.list[i], dh = (i < n ? 1 : 0) - p.here, du = hands[i] - p.hand;
      if (dh > 0.004 || dh < -0.004 || du > 0.004 || du < -0.004) { p.here += dh * k; p.hand += du * k; cadets.write(i); }
    }
    if (dt > 0) for (let j = 0; j < 4; j++) { const i = cursor = (cursor + 1) % N, p = cadets.list[i]; if (p.here < 0.05) continue; p.lean = Math.sin(time * 0.9 + p.ph) * 2.4; cadets.write(i); }
    cone.visible = pw > 0.05; cadets.node.visible = n > 0 || cadets.list[0].here > 0.02;
    stoveGlow.alpha = (0.42 + 0.1 * Math.sin(time * 9.1) * Math.sin(time * 5.3)) * Math.min(1.2, 0.4 + pw);
    tallyGlow.alpha = tallyOn * (0.5 + 0.2 * Math.sin(time * 3));
    if (!live || low) return;
    if (time > nextMote) { nextMote = time + 0.3; const u = rnd(); P[0] = (rnd() - 0.5) * 1.6; P[1] = 3.6 - u * 3.2; P[2] = BACK + 0.6 + u * 4.6; V[0] = 0.02; V[1] = -0.02; V[2] = 0.05; sprites.spawn({ kind: 'glow', pos: P, vel: V, size: 0.06 + rnd() * 0.05, life: 6, color: '#dcd4ff', alpha: 0.75 }); }
    if (time > nextEmber) { nextEmber = time + 0.4; P[0] = lampPos[0] + (rnd() - 0.5) * 2.2; P[1] = 0.4 + rnd() * 2.4; P[2] = lampPos[2] + (rnd() - 0.5) * 2.6; V[0] = 0.03; V[1] = 0.05; V[2] = 0.02; sprites.spawn({ kind: 'glow', pos: P, vel: V, size: 0.05 + rnd() * 0.04, life: 5, color: '#ffd890', alpha: 0.7 }); }
  }

  return setShell({
    id: 'dormitory', light, L, scene, cameras: CAMERAS, actors, foreground, lamps, glows, tick,
    marks: {
      ...MARKS, bed19: { pos: [B19.pos[0] - 0.55, 0, B19.pos[2] + 0.85], face: 30 }, tally: TASK.pos,
      door: { pos: [DOOR.x + 0.2, 0, MOUTH + 0.9], face: 60 }, passage: { pos: [DOOR.x, 0, MOUTH - 0.7], face: 180 }, focus: lampPos,
    },
    extra: { setCadets, vote, task, cue },
  });
}

// the core's light names (src/core/stage.js LIGHTS) this set also answers to, so content can say 'interior' / 'day'
const ALIAS = { interior: 'evening' };
export const dormitory = { id: 'dormitory', lights: [...Object.keys(LIGHTS), ...Object.keys(ALIAS)], cameras: Object.keys(CAMERAS), build };
export default dormitory;
