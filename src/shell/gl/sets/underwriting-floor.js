// SET: underwriting-floor. The underwriting floor at Halcyon by night: a wall of lettered drawers the width
// of the hall, three tall windows of moon over it, rows of high desks with their green lamps out, and one
// lamp left burning over the night clerk who does not look up. Brass pneumatic tubes run from an exchange on
// the ceiling down to every desk and tick all night, carrying paper between people who will never meet.
// Chapter 3: ch3.s4 (Ren goes in at the change of rounds: two clerks, one lamp; the sealed schedule filed
// under stationery returns; the clerk who knows a cadet's boots, and goes to make tea for eleven minutes;
// the long drawer under C, the island book, the Carrow folder).
//
//   import { underwritingFloor } from './sets/underwriting-floor.js';
//   const set = underwritingFloor.build(GL, { light: 'night', low: false });
//
// Same shape as sets/lantern-stalls.js. Figures face +Z, cameras look toward -Z. The strip x -3.2..3.2,
// z 0..1.6 is clear. The side walls are splayed like stage flats.
//
// What this set can do for its story:
//   openDrawer(0..1)     the long drawer under C slides out; what is in it lights whoever is reading
//   setClerk(on)         the night clerk at his desk (off: he has gone to make tea, and the tea-room door stands ajar and lit)
//   send(n = 1)          fire that many carriers through the tubes now (they also go by themselves)
//   task(type)           'drawer' | 'island-book' -> { pos, stand, set(v) } drives openDrawer;  'returns' | 'schedule' -> the stationery returns cabinet (set(v) lights it)
// marks: a, b, c, two, party, opposition as everywhere, plus
//   drawer { pos, face }: at the long drawer under C     returns { pos, face }: at the stationery returns cabinet
//   clerk { pos, face }: the night clerk's stool         window { pos, face }: the public side of the counter ("request it by day, at the window")
//   focus: the lit lamp

import { rng, DEG } from '../math.js';
import { merge, tint, place, box, cylinder, sphere, ellipsoid, lathe, torus, quad, setGlow, setOutline } from '../mesh.js';
import { node, group, material, makeEnv, createScene, mergeStatic } from '../scene.js';
import { createSprites } from '../sprites.js';
import { rayMesh, rayMaterial } from '../fx.js';
import { anchorAt, townsfolk } from './kit.js';
import { KB, kitBMaterials, setShell, lightOf, wing, norm3, wall, windowFrame, shaftCards, lightPatch, ceiling, checker, clerkCounter, fileStack, paperPile, doorway } from './kit-b.js';
import { H3, pixelText, drawerWall, tubeRun, clerkDesk, cabinet, regulator } from './kit-ch3.js';

const BW = 6.0, BACK = -8.8, FW = 8.6, WING_Z = 2.4, H = 6.6;

const LIGHTS = {
  night: {
    preset: 'night', power: 1,
    env: {
      key: { dir: norm3([-0.34, 0.7, 0.6]), color: '#8fa6f6' },
      shadow: { tint: '#2f3fae', lift: 0.13, saturate: 1.35 },
      ambient: { sky: '#4f70e4', ground: '#3a3aa4', amount: 0.17 },
      rim: { color: '#c4d6ff', amount: 0.75, edge: 0.74 },
      fog: { color: '#3552cc', density: 0.01, start: 8, max: 0.3 },
      sky: { zenith: '#0c1a70', mid: '#243ab0', midAt: 0.45, horizon: '#5a78e0', below: '#2f3aa0', stars: 1, moon: 0.7 },
      water: null,
    },
    glass: '#8fb0ff', shaft: '#6f8ae4', patch: '#c4d6ff',
  },
};

const CAMERAS = {
  wide: { target: [0.15, 1.75, -0.5], dist: 8.6, yaw: 3, pitch: 4, fov: 45, aspect: 0.46, shadowCenter: [0, 0, -1.6], shadowRadius: 7.5 },
  two: { target: [0, 1.12, 0.6], dist: 6.0, yaw: -15, pitch: 5, fov: 31, aspect: 0.46, shadowCenter: [0, 0, 0.3], shadowRadius: 3.6 },
  close: { target: [0.02, 0.86, 0.8], dist: 3.9, yaw: 21, pitch: 3, fov: 28, aspect: 0.46, shadowCenter: [0, 0, 0.5], shadowRadius: 2.6 },
  low: { target: [0.2, 1.9, -0.6], dist: 6.2, yaw: -8, pitch: -11, fov: 56, aspect: 0.46, shadowCenter: [0, 0, -1.2], shadowRadius: 7 },
  stage: { target: [0, 1.15, 0.2], dist: 9.6, yaw: -12, pitch: 6, fov: 26, aspect: 1.95, shadowCenter: [0, 0, -1.0], shadowRadius: 7.5, outline: 0.7 },
  landscape: { target: [0, 1.9, -1.4], dist: 10, yaw: 4, pitch: 5, fov: 40, aspect: 1.6, shadowCenter: [0, 0, -1.6], shadowRadius: 9.5 },
};

const MARKS = {
  a: { pos: [-0.8, 0, 0.55], face: 14 }, b: { pos: [0.02, 0, 0.8], face: 0 }, c: { pos: [0.82, 0, 0.55], face: -14 },
  two: [{ pos: [-0.42, 0, 0.62], face: 24 }, { pos: [0.42, 0, 0.62], face: -24 }],
  party: [{ pos: [-1.05, 0, 0.75], face: 78 }, { pos: [-1.85, 0, 1.15], face: 72 }, { pos: [-2.5, 0, 0.5], face: 80 }],
  opposition: [{ pos: [1.05, 0, 0.75], face: -78 }, { pos: [1.85, 0, 1.15], face: -72 }, { pos: [2.55, 0, 0.5], face: -80 }],
};

function build(engine = null, { light: lightName = 'night', low = false } = {}) {
  const [light, L] = lightOf('underwriting-floor', LIGHTS, lightName);
  const M = kitBMaterials(), r = rng(1414);
  M.deco = material({ name: 'floor-deco', rim: 0.6, outline: false, castShadow: false });
  M.brass = material({ name: 'floor-brass', rim: 1.2, spec: 0.7, specSize: 0.03, bandEdge: -0.05, outline: { width: 1.8, self: 0.7 }, castShadow: false });
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  const WL = wing(-1, BW, BACK, FW, WING_Z), WR = wing(1, BW, BACK, FW, WING_Z);
  const deco = (n) => { n.castShadow = false; return n; };

  // ---- the room
  const room = group('room');
  room.add(node('floor', place(checker({ w: 20, d: 14, nx: 20, nz: 14, colors: ['#8794f2', '#5b68d6'], seed: 3 }), 0, 0, -2.6), M.flat));
  const WINS = [-3.7, 0, 3.7].map((x) => ({ x, w: 1.9, sill: 3.75, top: 6.1, arch: true }));
  room.add(node('back', wall({ w: BW * 2 + 0.4, h: H, t: 0.4, color: '#8a92ee', openings: WINS }), M.wall, { pos: [0, 0, BACK] }));
  const TEA = { x: -1.0, w: 1.4, sill: 0, top: 2.6 };
  room.add(node('wing-l', wall({ w: WL.len + 0.3, h: H, t: 0.4, color: '#8a92ee' }), M.wall, { pos: WL.pos, rot: [0, WL.yaw, 0] }));
  room.add(node('wing-r', wall({ w: WR.len + 0.3, h: H, t: 0.4, color: '#8a92ee', openings: [TEA] }), M.wall, { pos: WR.pos, rot: [0, WR.yaw, 0] }));
  for (const [Wg, skip] of [[WL, null], [WR, TEA]]) { // a plum dado with a brass rail on both wings
    const runs = skip ? [[-Wg.len / 2, skip.x - skip.w / 2 - 0.14], [skip.x + skip.w / 2 + 0.14, Wg.len / 2]] : [[-Wg.len / 2, Wg.len / 2]];
    for (const [x0, x1] of runs) room.add(node('dado', merge(tint(place(box(x1 - x0, 1.5, 0.06), 0, 0.75, 0.03), '#7a5ad0'), tint(place(box(x1 - x0, 0.09, 0.09), 0, 1.54, 0.045), H3.brass)), M.wall, { pos: Wg.at((x0 + x1) / 2), rot: [0, Wg.yaw, 0] }));
  }
  room.add(node('ceiling', ceiling({ w: 19, d: 12, color: '#3a48c0', beams: 6, beam: '#2f3ca8', bw: 0.34, bh: 0.36 }), M.wall, { pos: [0, H, BACK + 6] }));
  const glass = WINS.map((w) => setGlow(tint(place(box(w.w, w.top - w.sill, 0.05), w.x, (w.sill + w.top) / 2, BACK - 0.34), L.glass), 0.92));
  glass.push(setGlow(tint(place(cylinder(0.42, 0.42, 0.03, 14), 0.3, 5.1, BACK - 0.3, 90, 0, 0), '#fffbe0'), 1)); // the moon, in the middle window
  room.add(node('glass', merge(glass), M.deco));
  const patches = [[-2.6, -5.6], [1.1, -5.6], [4.8, -5.6]].map(([x, z]) => place(lightPatch({ w: 1.6, d: 2.6, panes: 2, shear: -0.42, color: L.patch, glow: 0.42 }), x, 0.012, z));
  room.add(node('patches', merge(patches), M.flat));
  scene.root.add(mergeStatic(room, 'room'));
  // the pool the one lamp throws on the tiles
  scene.root.add(node('pool', setOutline(setGlow(tint(place(lathe([[1.7, 0], [0, 0]], 16, { crease: 180 }), 1.5, 0.014, -3.3, 0, 0, 0, 1, 1, 0.8), '#ffe2a0'), 0.6), 0), M.flat));

  // ---- the wall of drawers, lettered A to H; the long drawer under C is its own node so it can come out
  const COLS = 8, CW = 1.32, C_COL = 2;
  const dw = drawerWall({ cols: COLS, rows: 6, cw: CW, ch: 0.37, letters: 'ABCDEFGH', color: H3.tealDeep, front: H3.teal, front2: '#3fd0bc', seed: 4, skip: (c) => c === C_COL });
  const DW = [0, 0, BACK + 0.02];
  const props = group('props'), far = group('far-props');
  far.add(node('drawers', dw, M.wall, { pos: DW }));
  const LONG = anchorAt(dw, 'long', DW)[C_COL];
  // a rolling ladder against the wall, right of the middle
  { const lad = [], lx = 3.3; for (const sx of [-1, 1]) lad.push(tint(place(box(0.07, 3.5, 0.07), lx + sx * 0.3, 1.7, BACK + 0.95, -9, 0, 0), H3.woodDark)); for (let i = 0; i < 8; i++) lad.push(tint(place(box(0.6, 0.05, 0.08), lx, 0.35 + i * 0.4, BACK + 1.2 - i * 0.063), H3.woodPale)); lad.push(tint(place(cylinder(0.09, 0.09, 0.06, 6), lx - 0.3, 0.02, BACK + 1.24, 0, 0, 90), H3.brass), tint(place(cylinder(0.09, 0.09, 0.06, 6), lx + 0.36, 0.02, BACK + 1.24, 0, 0, 90), H3.brass)); far.add(node('ladder', merge(lad), M.wall)); }
  for (const w of WINS) far.add(node('window', windowFrame({ w: w.w, h: w.top - w.sill, color: H3.tealDeep, bars: 1, fan: low ? null : ['#7fe6d2', '#a9c6ff', '#7fe6d2'], glow: 0.8, depth: 0.4, thick: 0.12, sillOut: 0.12 }), M.wall, { pos: [w.x, w.sill, BACK] }));

  // ---- desks: two files either side of the aisle. The near ones are drawn in ink and throw shadows.
  const DESKS = [];
  // (the right file starts a desk further back than the left: that desk is the lit one, and nothing may stand in front of it)
  for (const [x, zs] of [[-1.95, [-2.5, -4.6, -6.6]], [1.6, [-3.5, -5.6]], [-4.5, [-3.5, -5.7]], [4.4, [-2.6, -4.7, -6.6]]]) zs.forEach((z, i) => DESKS.push({ pos: [x, 0, z], yaw: (x < 0 ? 5 : -5) + (r() - 0.5) * 5, near: z > -3.6 && Math.abs(x) < 3 }));
  const LIT = DESKS.findIndex((d) => d.pos[0] > 0 && d.pos[0] < 3 && d.near);
  const darkLamp = merge(tint(lathe([[0, 0], [0.11, 0], [0.1, 0.03], [0.03, 0.06], [0.022, 0.3], [0, 0.3]], 6, { crease: 50 }), H3.brass), tint(place(lathe([[0.2, 0], [0.2, 0.05], [0.1, 0.13], [0, 0.14]], 8, { crease: 50 }), 0, 0.28, 0, 0, 0, 0, 1, 1, 0.7), '#1f9a78'));
  const litLamp = merge(tint(lathe([[0, 0], [0.11, 0], [0.1, 0.03], [0.03, 0.06], [0.022, 0.3], [0, 0.3]], 8, { crease: 50 }), H3.brass), setGlow(tint(place(lathe([[0.2, 0], [0.2, 0.05], [0.1, 0.13], [0, 0.14]], 10, { crease: 50 }), 0, 0.28, 0, 0, 0, 0, 1, 1, 0.7), '#4fe0a0'), 0.7), setGlow(tint(place(sphere(0.075, 6, 4), 0, 0.27, 0), '#fff2c0'), 1));
  let lampPos = [0, 0, 0];
  DESKS.forEach((d, i) => {
    const mesh = clerkDesk({ w: 1.5, seed: 3 + i, color: i % 2 ? H3.woodDark : '#b8684a', top: H3.wood, cloth: i === LIT ? H3.green : '#2a9a7a', rack: i !== LIT, stool: i !== LIT });
    (d.near ? props : far).add(node('desk' + i, mesh, d.near ? M.prop : M.wall, { pos: d.pos, rot: [0, d.yaw, 0] }));
    const la = anchorAt(mesh, 'lamp', d.pos, d.yaw), lampMesh = i === LIT ? litLamp : darkLamp;
    (d.near ? props : far).add(deco(node('lamp' + i, lampMesh, d.near ? M.prop : M.wall, { pos: [la[0], la[1] - 0.06, la[2]], scale: 1.7 })));
    d.mesh = mesh; d.lamp = [la[0], la[1] + 0.42, la[2]]; d.top = anchorAt(mesh, 'top', d.pos, d.yaw); d.seat = anchorAt(mesh, 'seat', d.pos, d.yaw);
    if (i === LIT) lampPos = d.lamp;
  });
  // stationery returns: the dullest thing in the room, stage left against the wing, with a stack on it
  const RET = WL.at(-1.2, 0.34), retMesh = cabinet({ w: 1.3, h: 1.5, d: 0.5, rows: 3, cols: 2, color: '#8a7ae0', front: '#a99cf0', seed: 5 });
  props.add(node('returns', retMesh, M.prop, { pos: RET, rot: [0, WL.yaw, 0] }));
  props.add(deco(node('returns-plate', merge(tint(place(box(1.0, 0.24, 0.03), 0, 0, 0), H3.brass), place(pixelText('RETURNS', { s: 0.12, color: H3.navy }), 0, 0, 0.02)), M.prop, { pos: WL.at(-1.2, 0.62, 1.72), rot: [0, WL.yaw, 0] })));
  props.add(deco(node('returns-stack', fileStack({ n: 4, seed: 7 }), M.prop, { pos: WL.at(-1.5, 0.6, 1.52), rot: [0, WL.yaw + 14, 0] })), deco(node('returns-paper', paperPile({ n: 3, seed: 3 }), M.prop, { pos: WL.at(-0.9, 0.6, 1.52) })));
  // "the window": the counter where a Scholar requests his account by day, shuttered now
  const CTR = WL.at(1.7, 0.6);
  props.add(node('counter', clerkCounter({ w: 2.6, color: '#7a5ad0', top: H3.woodPale, bars: 7, seed: 2 }), M.prop, { pos: CTR, rot: [0, WL.yaw, 0] }));
  props.add(deco(node('closed', merge(tint(place(box(0.7, 0.3, 0.03), 0, 0, 0), H3.paper), place(pixelText('CLOSED', { s: 0.1, color: H3.red }), 0, 0, 0.02)), M.prop, { pos: [CTR[0] + 0.25, 1.56, CTR[2] + 0.3], rot: [0, WL.yaw, 4] })));
  // the regulator: nine minutes between rounds
  const reg = regulator({ h: 2.5, w: 0.66, wood: '#8a5ad0' }), REG = WR.at(1.7, 0.02, 1.6);
  props.add(deco(node('regulator', reg.body, M.prop, { pos: REG, rot: [0, WR.yaw, 0] })));
  // the tea room: a door in the right wing, a crack of warm light when he has gone to make it
  const door = doorway({ w: 1.3, h: 2.5, open: 24, color: H3.tealDark, frame: '#e6ecff', knob: H3.brass, side: -1 });
  props.add(node('tea-door', door, M.prop, { pos: WR.at(TEA.x, 0), rot: [0, WR.yaw, 0] }));
  // loose paper on the floor by the aisle, a trolley of ledgers
  const trolley = merge(tint(place(box(0.9, 0.06, 0.55), 0, 0.3, 0), H3.woodDark), tint(place(box(0.9, 0.06, 0.55), 0, 0.72, 0), H3.woodDark), ...[[-0.4, -0.24], [0.4, -0.24], [-0.4, 0.24], [0.4, 0.24]].map(([x, z]) => tint(place(cylinder(0.03, 0.03, 0.9, 5), x, 0.08, z), H3.brass)), ...[[-0.4, -0.24], [0.4, -0.24], [-0.4, 0.24], [0.4, 0.24]].map(([x, z]) => tint(place(sphere(0.07, 6, 4), x, 0.07, z), H3.navy)), tint(place(box(0.6, 0.14, 0.4), -0.1, 0.82, 0, 0, 8, 0), '#c23a5e'), tint(place(box(0.56, 0.12, 0.38), -0.08, 0.95, 0, 0, -6, 0), H3.teal), tint(place(box(0.5, 0.2, 0.36), 0.1, 0.43, 0), H3.gold));
  props.add(node('trolley', trolley, M.prop, { pos: [3.9, 0, -0.75], rot: [0, -24, 0] }));
  scene.root.add(mergeStatic(props, 'props'), mergeStatic(far, 'far-props'));

  // ---- the tubes: an exchange on the ceiling, a drop to every desk, two mains off into the building
  const EX = [0, H - 0.75, -4.4], paths = [], tubeParts = [];
  tubeParts.push(tint(place(cylinder(0.75, 0.75, 0.5, 12), EX[0], EX[1], EX[2]), H3.brass), tint(place(cylinder(0.9, 0.9, 0.1, 12), EX[0], EX[1] + 0.5, EX[2]), H3.brassDark), tint(place(cylinder(0.5, 0.3, 0.3, 10), EX[0], EX[1] - 0.3, EX[2]), H3.brassDark), tint(place(cylinder(0.2, 0.2, 0.8, 6), EX[0], EX[1] + 0.5, EX[2]), H3.brassDark));
  const dots = []; for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; dots.push(setGlow(tint(place(sphere(0.06, 5, 3), EX[0] + Math.sin(a) * 0.77, EX[1] + 0.25, EX[2] + Math.cos(a) * 0.77), i % 3 ? '#ffb040' : '#ff5a40'), 1)); }
  DESKS.forEach((d, i) => {
    if (low && !d.near && i % 2) return;
    const a = Math.atan2(d.pos[0] - EX[0], d.pos[2] - EX[2]), end = [d.pos[0] - (d.pos[0] < 0 ? -0.62 : 0.62), 1.75, d.pos[2] + 0.3];
    const pts = [[EX[0] + Math.sin(a) * 0.7, EX[1] + 0.3, EX[2] + Math.cos(a) * 0.7], [end[0], EX[1] + 0.3 - (i % 3) * 0.18, end[2]], end];
    paths.push(pts); tubeParts.push(tubeRun(pts, { r: 0.065, seg: 5 }), tint(place(cylinder(0.07, 0.15, 0.2, 6), end[0], end[1] - 0.2, end[2]), H3.brassDark));
  });
  for (const sx of [-1, 1]) { const pts = [[EX[0] + sx * 0.7, EX[1] + 0.15, EX[2] - 0.2], [sx * 3.2, EX[1] + 0.15, -7.0], [sx * 5.4, 5.2, BACK + 0.5], [sx * 5.4, 3.5, BACK + 0.5]]; paths.push(pts); tubeParts.push(tubeRun(pts, { r: 0.09, seg: 6 })); }
  { const pts = [[EX[0], EX[1] + 0.4, EX[2] + 0.7], [0.6, EX[1] + 0.4, 0.4], [7.0, EX[1] + 0.1, 1.6]]; paths.push(pts); tubeParts.push(tubeRun(pts, { r: 0.09, seg: 6 })); }
  scene.root.add(node('tubes', merge(tubeParts, ...dots), M.brass));

  // ---- the long drawer under C, and the island book in it
  const dwA = dw.anchors, drawer = node('drawer-c', merge(tint(place(box(dwA.cw - 0.1, dwA.longH - 0.07, 0.07), 0, 0, 0), '#ffd24a'), tint(place(box(dwA.cw * 0.42, 0.06, 0.07), 0, -dwA.longH * 0.16, 0.055), H3.brassDark), setOutline(tint(place(quad(dwA.cw * 0.3, 0.09), 0, dwA.longH * 0.18, 0.04), H3.paper), 0),
    tint(place(box(dwA.cw - 0.16, 0.04, 0.9), 0, -dwA.longH * 0.4, -0.45), H3.tealDeep), tint(place(box(dwA.cw - 0.3, 0.2, 0.7), 0, -dwA.longH * 0.22, -0.42), '#c23a5e'), setGlow(tint(place(box(dwA.cw - 0.5, 0.06, 0.5), 0, -dwA.longH * 0.06, -0.42), H3.paper), 0.5)), M.prop, { pos: [LONG[0], LONG[1], LONG[2] - 0.02] });
  drawer.castShadow = false; scene.root.add(drawer);

  // ---- the night clerk, who does not look up
  const SEAT = DESKS[LIT].seat;
  const clerkMesh = merge(townsfolk({ seed: 6, hold: 'none', coat: '#7a5ad0', hair: '#f0e6d6', h: 1.02 }), tint(place(cylinder(0.24, 0.2, 0.03, 8), 0, 0.84, 0.12, 14, 0, 0), '#2fba7e'), tint(place(ellipsoid(0.05, 0.13, 0.05, 5, 3), 0.22, 0.5, 0.14, 50, 0, 0), '#7a5ad0'), tint(place(ellipsoid(0.05, 0.13, 0.05, 5, 3), -0.22, 0.5, 0.14, 50, 0, 0), '#7a5ad0'));
  const clerk = node('night-clerk', clerkMesh, M.prop, { pos: [SEAT[0], 0.62, SEAT[2] + 0.12], rot: [8, DESKS[LIT].yaw, 0], scale: 1.12 }); scene.root.add(clerk);
  // the regulator's bob
  const bob = node('bob', reg.bob, M.prop, { pos: anchorAt(reg.body, 'pivot', REG, WR.yaw), rot: [0, WR.yaw, 0] }); bob.castShadow = false; scene.root.add(bob);

  // ---- drawn light: moon through the three windows, the cone under the lamp
  if (!low) scene.root.add(node('shafts', merge(WINS.map((w) => place(shaftCards({ w: w.w * 0.8, h: (w.top - w.sill) * 0.7, dir: [0.42, -1, 0.72], len: 5.6, cards: 2, color: L.shaft }), w.x, (w.sill + w.top) / 2, BACK + 0.05))), M.shaft));
  const cone = node('lamp-cone', tint(place(rayMesh(1.5, 0.12, 1.3, 14), lampPos[0], lampPos[1] + 0.04, lampPos[2]), '#ffd070'), rayMaterial({ power: 1.3, near: 0.4, far: 0 }));
  scene.root.add(cone);

  // ---- foreground: the back of a desk and a stool, as if from the tube room door
  const fg = group('fg');
  fg.add(node('fg-stack', fileStack({ n: 5, seed: 11 }), M.prop, { pos: [-2.3, 0, 2.9] }), node('fg-stool', merge(tint(place(cylinder(0.19, 0.19, 0.06, 8), 0, 0.56, 0), H3.woodDark), tint(place(cylinder(0.16, 0.16, 0.04, 8), 0, 0.61, 0), H3.velvet), tint(place(cylinder(0.04, 0.07, 0.56, 6), 0, 0, 0), H3.brassDark)), M.prop, { pos: [2.2, 0, 2.8] }));
  const foreground = mergeStatic(fg, 'foreground'); scene.root.add(foreground);
  const actors = group('actors'); scene.root.add(actors);

  // ---- lamps
  const teaPos = WR.at(TEA.x - 0.2, -0.5, 1.5), teaIn = WR.at(TEA.x, 0.9, 1.4);
  const lamps = [
    { name: 'desk', pos: lampPos, color: '#ffc870', radius: 9, base: 1.7, flicker: 0.05 },
    { name: 'moon', pos: [0.6, 3.6, BACK + 3.2], color: '#8fa8ff', radius: 9, base: 1.1, flicker: 0 },
    { name: 'moon-l', pos: [-3.4, 3.2, BACK + 3.4], color: '#8fa8ff', radius: 7, base: 0.9, flicker: 0 },
    { name: 'tea', pos: teaIn, color: '#ffa860', radius: 5.5, base: 0, flicker: 0.04 },
    { name: 'drawer', pos: [LONG[0], LONG[1] + 0.5, LONG[2] + 0.9], color: '#ffd070', radius: 4.5, base: 0, flicker: 0 },
    { name: 'exchange', pos: [EX[0], EX[1] - 0.5, EX[2]], color: '#ffa040', radius: 4, base: 0.8, flicker: 0.2 },
  ];
  const sprites = scene.sprites = createSprites(low ? 96 : 224), glows = [];
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: [lampPos[0], lampPos[1] - 0.05, lampPos[2]], size: 2.4, color: '#ffc050', alpha: 0 }), base: 0.6 });
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: [0.3, 5.1, BACK + 0.1], size: 3.6, color: '#cfe0ff', alpha: 0 }), base: 0.45, fixed: true });
  for (const w of WINS) glows.push({ sprite: sprites.add({ kind: 'glow', pos: [w.x, 4.9, BACK + 0.3], size: 4.2, color: '#7f9cff', alpha: 0 }), base: 0.22, fixed: true });
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: [EX[0], EX[1] + 0.1, EX[2]], size: 2.6, color: '#ff9a40', alpha: 0 }), base: 0.3 });
  const teaGlow = sprites.add({ kind: 'glow', pos: teaPos, size: 2.2, color: '#ffa850', alpha: 0 });
  const drawerGlow = sprites.add({ kind: 'glow', pos: [LONG[0], LONG[1] + 0.1, LONG[2] + 0.5], size: 1.8, color: '#ffe08a', alpha: 0 });
  const retGlow = sprites.add({ kind: 'glow', pos: [RET[0] + 0.3, 1.2, RET[2] + 0.3], size: 1.6, color: '#fff0a0', alpha: 0 });
  // carriers: one glow per tube, parked invisible until it is sent
  const runs = paths.map((pts) => { const seg = []; let total = 0; for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1], pts[i + 1][2] - pts[i][2]); seg.push(l); total += l; } return { pts, seg, total, t: -1, dir: 1, sprite: sprites.add({ kind: 'glow', pos: pts[0], size: 0.5, color: '#fff2c0', alpha: 0 }) }; });

  // ---- levers
  let open = 0, openNow = 0, clerkOn = true, clerkNow = 1, retOn = 0, nextSend = 0.6, nextMote = 0, nextTick = 0;
  const rnd = rng(41), P = [0, 0, 0], V = [0, 0, 0];
  function openDrawer(v) { open = Math.max(0, Math.min(1, v)); }
  function setClerk(on) { clerkOn = !!on; }
  function send(n = 1) { for (let k = 0; k < n; k++) { const start = Math.floor(rnd() * runs.length); for (let j = 0; j < runs.length; j++) { const q = runs[(start + j) % runs.length]; if (q.t < 0) { q.t = 0; q.dir = rnd() < 0.5 ? 1 : -1; break; } } } }
  const DRAWER_TASK = { pos: [LONG[0], LONG[1], LONG[2] + 0.4], stand: [LONG[0] + 0.5, LONG[2] + 1.2], set(v) { openDrawer(v); } };
  const RET_TASK = { pos: [RET[0], 1.5, RET[2]], stand: [RET[0] + 0.9, RET[2] + 0.4], set(v) { retOn = Math.max(0, Math.min(1, v)); } };
  const task = (type) => (type === 'drawer' || type === 'island-book' ? DRAWER_TASK : type === 'returns' || type === 'schedule' ? RET_TASK : null);

  function tick(time, dt, pw, live) {
    const k = dt === 0 ? 1 : Math.min(1, dt * 5);
    openNow += (open - openNow) * k; clerkNow += ((clerkOn ? 1 : 0) - clerkNow) * k;
    drawer.position[2] = LONG[2] - 0.02 + openNow * 0.62;
    drawerGlow.alpha = openNow * 0.6; drawerGlow.pos[2] = LONG[2] + 0.3 + openNow * 0.5;
    env.points[4].intensity = openNow * 1.3; env.points[3].intensity = (1 - clerkNow) * 1.2 * Math.min(1.2, 0.5 + pw * 0.5);
    teaGlow.alpha = (1 - clerkNow) * 0.6; retGlow.alpha = retOn * (0.45 + 0.15 * Math.sin(time * 3));
    clerk.visible = clerkNow > 0.03; clerk.scale[0] = clerk.scale[1] = clerk.scale[2] = Math.max(0.001, clerkNow * 1.12);
    clerk.setRot(8 + Math.sin(time * 0.7) * 1.5, DESKS[LIT].yaw + Math.sin(time * 0.31) * 3, 0); // he writes; he does not look up
    bob.setRot(0, WR.yaw, Math.sin(time * 3.1) * 9);
    cone.visible = pw > 0.05;
    // carriers
    for (let i = 0; i < runs.length; i++) {
      const q = runs[i], sp = q.sprite;
      if (q.t < 0) { sp.alpha = 0; continue; }
      q.t += dt * 7.5; // metres a second: through in a second
      if (q.t >= q.total) { q.t = -1; sp.alpha = 0; continue; }
      let d = q.dir > 0 ? q.t : q.total - q.t, s = 0; while (s < q.seg.length - 1 && d > q.seg[s]) { d -= q.seg[s]; s++; }
      const a = q.pts[s], b = q.pts[s + 1], u = d / q.seg[s];
      sp.pos[0] = a[0] + (b[0] - a[0]) * u; sp.pos[1] = a[1] + (b[1] - a[1]) * u; sp.pos[2] = a[2] + (b[2] - a[2]) * u; sp.alpha = 0.95;
    }
    if (!live) return;
    if (time > nextSend) { nextSend = time + (0.5 + rnd() * 1.6) / Math.max(0.35, pw); send(1); }
    if (time > nextTick) { nextTick = time + 0.9; P[0] = EX[0] + (rnd() - 0.5) * 1.2; P[1] = EX[1] - 0.2; P[2] = EX[2] + 0.8; sprites.sparkle(P, { count: 1, size: 0.16, spread: 0.3, life: 0.5, color: '#ffe0a0' }); }
    if (!low && time > nextMote) { nextMote = time + 0.3; const u = rnd(), w = WINS[Math.floor(rnd() * 3)]; P[0] = w.x + u * 2.2 + (rnd() - 0.5) * 0.8; P[1] = 4.9 - u * 4.5; P[2] = BACK + 0.4 + u * 3.6; V[0] = 0.03; V[1] = -0.02; V[2] = 0.04; sprites.spawn({ kind: 'glow', pos: P, vel: V, size: 0.05 + rnd() * 0.05, life: 6, color: '#dfe8ff', alpha: 0.7 }); }
  }

  return setShell({
    id: 'underwriting-floor', light, L, scene, cameras: CAMERAS, actors, foreground, lamps, glows, tick,
    marks: {
      ...MARKS, drawer: { pos: [DRAWER_TASK.stand[0], 0, DRAWER_TASK.stand[1]], face: 200 }, returns: { pos: [RET_TASK.stand[0], 0, RET_TASK.stand[1]], face: -110 },
      clerk: { pos: [SEAT[0], 0, SEAT[2]], face: DESKS[LIT].yaw }, window: { pos: [CTR[0] + 0.9, 0, CTR[2] + 0.5], face: -120 }, focus: lampPos,
    },
    extra: { openDrawer, setClerk, send, task },
  });
}

export const underwritingFloor = { id: 'underwriting-floor', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default underwritingFloor;
