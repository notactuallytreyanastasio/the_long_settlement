// SET: compact-hall. The Kedge Compact's ropewalk on a meeting night: the head-house where the great jack stands,
// one hurricane lamp over the tally table, the hoppers of forty lamps chalked on a board, and behind it the walk
// itself running off a quarter of a mile under its roof frames with four hundred dockers standing in it.
// Chapter 6: ch6.s2 (Hesper moves the strike; the key left on the tally table), ch6.s5 (average; the vote by lantern).
//
//   import { compactHall } from './sets/compact-hall.js';
//   const set = compactHall.build(GL, { light: 'night' | 'vote', low: false });
//
// The shape is lantern-stalls' (see ../index.js). Figures face +Z; cameras look toward -Z, down the walk. The stage
// strip x -3.2..3.2, z 0..1.6 is clear. The head-house is x -6.5..6.5; its back wall is at z = -4.6 with the mouth of
// the walk (5.6 wide) in the middle of it; the walk runs back to a gable door at z = -40.
//   'night'  the meeting: lanterns carried low and mostly dark, moonlight down through the roof lights
//   'vote'   the same hall with every lantern raised (setVote(1) from the start)
// Added here:
//   setVote(0..1)   the dockers' lanterns go up, front rows first: "from a coil of rope it looked like a harbour"
//   setKey(on)      the steward's key on the tally table, next to the chalk
//   cue(lineId)     ch6.s2.c26.. shows the key; ch6.s5.c28.. raises the vote; ch6.s5.c01 lowers it again
//   task('tally-column', i)  ch6.s2, three units: Tobb's hopper table on an easel right of the tally table, a chalk bar a
//                   unit (the capital's forty days, the rich ports' thirty, the small lights' nine, in coral)
//   task('hatch', i)         ch6.s5, three units: the head-house's roof hatches thrown off one at a time, the moon coming down
//   setback()       the hall shouts: every lantern is shaken up at the table for a second and a half (also as passLamp)
//   The core's 'interior' builds 'night'.
//   marks.coil      the coil of rope the Tribune is given to sit on { pos, face }; marks.table, marks.focus (the lamp)
// low: true drops the far crowd to half, the roof shafts in the walk, the bunting and the motes.

import { m4, quat, rng, DEG, rgb } from '../math.js';
import { merge, tint, place, plane, box, tube, curve, cylinder, lathe, setGlow, setOutline, torus, sphere } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic, makeInstances } from '../scene.js';
import { createSprites } from '../sprites.js';
import { rayMesh } from '../fx.js';
import { PAL, pickLight, planks, ropeCoil, bunting, crowd, sack } from './kit.js';
import { K6, ch6Materials, shell, STD_MARKS, STD_CAMERAS, coreLight, taskUnit, pulse, norm3, cask, plankWall, truss, shaft, patch, hurricaneLamp, ropeJack, tallyBoard, trestle, hank, openBook, bar } from './kit-ch6.js';

const HW = 6.5, BACK = -4.6, FRONT = 4, EAVE = 4.5, RISE = 2.6, WALK_HW = 2.8, WALK_END = -40, WALK_EAVE = 4.1;

const ENV = (over = {}) => ({
  key: { dir: norm3([-0.36, 0.78, 0.52]), color: '#ffe2b4' },                    // the house light: warm, from the lamp's side of the room
  shadow: { tint: '#6f63e0', lift: 0.12, saturate: 1.45 },
  ambient: { sky: '#ffb890', ground: '#5a52cc', amount: 0.17 },
  rim: { color: '#ffd98a', amount: 0.55, edge: 0.76 },
  fog: { color: '#3d44b4', density: 0.016, start: 9, max: 0.8 },                 // the walk goes blue with distance
  sky: { zenith: '#0c1a70', mid: '#2440b8', midAt: 0.45, horizon: '#5f78ea', below: '#2a3aa0', stars: 1, moon: 0, sunDir: norm3([-0.4, 0.6, -0.5]) },
  water: null,
  ...over,
});
const LIGHTS = {
  night: { preset: 'night', power: 1, vote: 0, env: ENV() },
  vote: { preset: 'night', power: 1.1, vote: 1, env: ENV({ ambient: { sky: '#ffc090', ground: '#6a5ad4', amount: 0.2 } }) },
};

const CORE = { interior: 'night' };      // the core's light names this set answers (kit-ch6 coreLight)

const CAMERAS = STD_CAMERAS({
  wide: { target: [0.05, 1.85, -0.6], dist: 8.6, yaw: 2, pitch: 3.5, fov: 46, shadowCenter: [0, 0, -1.4], shadowRadius: 8 },
  low: { target: [0.1, 2.1, -0.2], dist: 6.4, yaw: -6, pitch: -12, fov: 56 },
  stage: { target: [0, 1.12, 0.3], dist: 9.6, yaw: -12, pitch: 6, fov: 25, shadowCenter: [0, 0, -0.8], shadowRadius: 7.5 },
  landscape: { target: [0, 1.9, -1.4], dist: 10.5, yaw: 4, pitch: 5, fov: 40 },
});

function build(engine = null, { light, low = false } = {}) {
  const picked = pickLight('compact-hall', LIGHTS, coreLight(light, CORE)), L = picked.L; light = picked.name;
  const M = ch6Materials(), r = rng(6262);
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;

  // ---- the head-house: floor, back wall with the mouth of the walk, side walls with tall night windows, roof
  const room = group('room'), props = group('props');
  room.add(node('floor', place(planks({ w: HW * 2 + 0.4, d: FRONT - BACK + 6, plank: 0.62, thick: 0.1, seed: 3, along: 'z', colors: ['#f2bc82', '#e9ad70', '#f8c992', '#e4a468'] }), 0, 0, (FRONT + BACK) / 2 + 3), M.wall));
  const MOUTH = { x: 0, w: WALK_HW * 2, sill: 0, top: 4.0 };
  room.add(node('back', plankWall({ w: HW * 2, h: EAVE + RISE, t: 0.24, colors: ['#ffe0a8', '#ffd294', '#ffe8ba'], board: 0.5, openings: [MOUTH], seed: 4, post: K6.timberRed }), M.wall, { pos: [0, 0, BACK] }));
  room.add(node('dado', merge(...[-1, 1].map((sx) => tint(place(box(HW - WALK_HW - 0.1, 1.2, 0.08), sx * (WALK_HW + (HW - WALK_HW) / 2 + 0.05), 0.6, BACK + 0.04), K6.royal))), M.wall));
  const SIDE_WIN = [{ x: -1.7, w: 1.5, sill: 1.5, top: 3.9, bars: 1 }, { x: 2.2, w: 1.5, sill: 1.5, top: 3.9, bars: 1 }];
  for (const sx of [-1, 1]) {
    room.add(node('side', plankWall({ w: FRONT - BACK, h: EAVE, t: 0.24, colors: [K6.teal, '#3ad0c0', K6.tealDark], board: 0.5, openings: SIDE_WIN, seed: 5 + sx, posts: 2.87, post: K6.timberRed, rail: K6.royal }), M.wall, { pos: [sx * HW, 0, (FRONT + BACK) / 2], rot: [0, -sx * 90, 0] }));
  }
  // roof: two slopes of dark boards over the head-house, and the walk's lower roof running back
  const slab = (x0, y0, x1, y1, z0, z1, col, th = 0.14) => tint(place(box(Math.hypot(x1 - x0, y1 - y0) + 0.3, th, z1 - z0), (x0 + x1) / 2, (y0 + y1) / 2 + th / 2, (z0 + z1) / 2, 0, 0, Math.atan2(y1 - y0, x1 - x0) / DEG), col);
  const ROOF = '#5a4fc0', ROOF2 = '#4a44ac';
  room.add(node('roof', merge(slab(-HW - 0.3, EAVE, 0, EAVE + RISE, BACK, FRONT, ROOF), slab(0, EAVE + RISE, HW + 0.3, EAVE, BACK, FRONT, ROOF)), M.wall));
  const WR = WALK_EAVE + 1.5;
  room.add(node('walk-roof', merge(slab(-WALK_HW - 0.2, WALK_EAVE, 0, WR, WALK_END, BACK - 0.2, ROOF2), slab(0, WR, WALK_HW + 0.2, WALK_EAVE, WALK_END, BACK - 0.2, ROOF2)), M.wall));
  room.add(node('walk-floor', tint(place(plane(WALK_HW * 2, BACK - WALK_END), 0, 0.01, (BACK + WALK_END) / 2), '#e0a878'), M.wall));
  for (const sx of [-1, 1]) room.add(node('walk-wall', plankWall({ w: BACK - WALK_END, h: WALK_EAVE, t: 0.2, colors: ['#3f8fe0', '#3478d0', '#4a9cea'], board: 0.9, seed: 9 + sx, posts: 3.94, post: '#2f9fc4' }), M.wall, { pos: [sx * WALK_HW, 0, (BACK + WALK_END) / 2], rot: [0, -sx * 90, 0] }));
  // the far gable and its door, standing open on the quay lamps
  room.add(node('gable', plankWall({ w: WALK_HW * 2, h: WR, t: 0.2, colors: ['#3f8fe0', '#3478d0'], board: 0.8, openings: [{ x: 0, w: 2.2, sill: 0, top: 3.0 }], seed: 2, post: K6.timberRed }), M.wall, { pos: [0, 0, WALK_END] }));
  room.add(node('gable-glow', setOutline(setGlow(tint(place(box(2.2, 3.0, 0.05), 0, 1.5, WALK_END - 0.3), '#ffc870'), 1), 0), M.flat));

  // roof frames: two over the head-house, then one every four metres down the walk
  for (const z of [BACK + 0.5, -0.9, 2.6]) props.add(node('truss', truss({ span: HW * 2, rise: RISE - 0.1, color: K6.timberRed, beam: 0.3 }), M.prop, { pos: [0, EAVE, z], castShadow: false }));
  const walkTruss = truss({ span: WALK_HW * 2, rise: 1.4, color: '#2f9fc4', beam: 0.22, brace: false });
  const WT = []; for (let z = BACK - 3.2; z > WALK_END + 1; z -= 4.2) WT.push(z);
  for (const z of WT) props.add(node('wtruss', walkTruss, M.prop, { pos: [0, WALK_EAVE, z], castShadow: false }));

  // ---- the strands of the walk: three lines a side on trestle posts, running to the far end
  const strands = [];
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 3; k++) strands.push(bar([sx * (WALK_HW - 0.35 - k * 0.16), 0.95 + k * 0.03, BACK + 0.6], [sx * (WALK_HW - 0.35 - k * 0.16), 0.95 + k * 0.03, WALK_END + 0.5], 0.035, k % 2 ? K6.rope2 : K6.rope, 4));
    for (let z = BACK - 1.5; z > WALK_END + 1; z -= 6) strands.push(tint(place(box(0.1, 0.95, 0.1), sx * (WALK_HW - 0.5), 0.475, z), K6.timberDark), tint(place(box(0.7, 0.08, 0.1), sx * (WALK_HW - 0.5), 0.92, z), K6.timberDark));
  }
  props.add(node('strands', merge(strands), M.prop, { castShadow: false }));

  // ---- the meeting: the tally table under the lamp, the board of hoppers, the jack, coils, casks, banners
  const TABLE = [0.15, 0, -2.5];
  props.add(node('table', trestle({ w: 2.5, d: 0.95, h: 0.82, seed: 4 }), M.prop, { pos: TABLE, rot: [0, 3, 0] }));
  props.add(node('book', openBook({ w: 0.8, d: 0.56 }), M.prop, { pos: [TABLE[0] - 0.5, 0.82, TABLE[2] + 0.02], rot: [0, 8, 0] }));
  props.add(node('chalk', merge(tint(place(box(0.14, 0.035, 0.035), 0, 0.02, 0, 0, 30, 0), K6.chalk), tint(place(box(0.1, 0.035, 0.035), 0.12, 0.02, 0.07, 0, -20, 0), K6.chalk), tint(place(cylinder(0.11, 0.09, 0.09, 8), -0.3, 0, 0.1), K6.teal)), M.prop, { pos: [TABLE[0] + 0.62, 0.82, TABLE[2] + 0.1] }));
  const LAMP_HOOK = [0.1, EAVE - 0.15, -0.9];
  const lampMesh = hurricaneLamp({ drop: 1.55, s: 1.9 });
  const LAMP = [LAMP_HOOK[0], LAMP_HOOK[1] + lampMesh.anchors.lamp[1], LAMP_HOOK[2]];
  // the board of hoppers, on the back wall left of the mouth; the jack and its wheel on the right
  props.add(node('board', tallyBoard({ w: 2.9, h: 2.0, rows: 7, seed: 3 }), M.prop, { pos: [-4.55, 1.45, BACK + 0.12], rot: [0, 0, -1.5] }));
  props.add(node('board-lamp', merge(bar([-4.55, 3.95, BACK + 0.1], [-4.55, 3.95, BACK + 0.6], 0.03, K6.iron, 4), setGlow(tint(place(cylinder(0.1, 0.13, 0.2, 8), -4.55, 3.7, BACK + 0.6), '#ffe9a0'), 1), tint(place(cylinder(0.16, 0.03, 0.1, 8), -4.55, 3.9, BACK + 0.6), K6.brass)), M.prop));
  props.add(node('jack', ropeJack({ r: 1.25 }), M.prop, { pos: [4.5, 0, BACK + 1.05], rot: [0, -14, 0] }));
  const hk = hank({ r: 0.3 });
  for (const [x, y] of [[3.2, 3.5], [3.85, 3.45], [5.55, 3.5], [-3.05, 3.9]]) props.add(node('hank', hk, M.prop, { pos: [x, y, BACK + 0.02], castShadow: false }));
  const COIL = [-2.1, 0, -1.15];
  props.add(node('coil', ropeCoil({ r: 0.44, turns: 5 }), M.prop, { pos: COIL }), node('coil2', ropeCoil({ r: 0.4, turns: 4, color: K6.rope2 }), M.prop, { pos: [2.35, 0, -1.35] }));
  props.add(node('coil3', ropeCoil({ r: 0.5, turns: 6 }), M.prop, { pos: [-5.2, 0, -2.6] }), node('coil4', ropeCoil({ r: 0.42, turns: 3, color: K6.rope2 }), M.prop, { pos: [-5.25, 0.39, -2.6] }));
  props.add(node('cask1', cask({}), M.prop, { pos: [5.6, 0, -1.7] }), node('cask2', cask({ r: 0.27, h: 0.66 }), M.prop, { pos: [5.5, 0, -0.9] }), node('sack', sack({ seed: 3, color: K6.salt }), M.prop, { pos: [-5.5, 0, 0.5], rot: [0, 50, 0] }));
  // the Compact's colours: two long banners either side of the mouth, a rope ring on each
  const ban = (col, ring) => merge(tint(place(box(1.05, 2.5, 0.04), 0, -1.25, 0), col), tint(place(box(1.2, 0.1, 0.1), 0, 0, 0), K6.timberDark), tint(place(box(1.05, 0.16, 0.05), 0, -2.3, 0.005), ring), tint(place(torus(0.3, 0.07, 14, 5), 0, -1.05, 0.04, 90, 0, 0), ring), tint(place(box(0.5, 0.5, 0.04), 0, -2.62, 0, 0, 0, 45), col));
  props.add(node('banner-l', ban(K6.coral, K6.cream), M.prop, { pos: [-2.95, 6.55, BACK + 0.18], rot: [0, 0, 1.5], castShadow: false }), node('banner-r', ban(K6.plum, K6.yellow), M.prop, { pos: [2.95, 6.55, BACK + 0.18], rot: [0, 0, -2], castShadow: false }));
  props.add(node('mouth-beam', tint(place(box(WALK_HW * 2 + 0.9, 0.34, 0.4), 0, 4.15, BACK + 0.1), K6.timberRed), M.prop, { castShadow: false }));
  if (!low) props.add(node('bunt1', bunting([-HW + 0.2, 4.2, 1.2], [HW - 0.2, 4.3, 0.9], { sag: 0.7, count: 17, size: 0.34, seed: 3, colors: [K6.coral, K6.cream, K6.teal, K6.yellow, K6.plum] }), M.prop, { castShadow: false }), node('bunt2', bunting([-HW + 0.2, 4.3, -3.0], [HW - 0.2, 4.2, -3.2], { sag: 0.5, count: 17, size: 0.3, seed: 8, colors: [K6.teal, K6.yellow, K6.coral, K6.cream] }), M.prop, { castShadow: false }));
  // wall lanterns down the walk, both sides, alternately: warm points going off into the blue
  const walkLamps = [];
  for (let i = 0; i < 5; i++) { const z = BACK - 4 - i * 7.6, sx = i % 2 ? 1 : -1, p = [sx * (WALK_HW - 0.3), 2.9, z]; walkLamps.push(p); props.add(node('wl', merge(setGlow(tint(place(cylinder(0.1, 0.13, 0.22, 8), 0, -0.11, 0), '#ffe2a0'), 1), tint(place(cylinder(0.17, 0.04, 0.1, 8), 0, 0.1, 0), K6.brass), tint(place(box(0.3, 0.05, 0.05), -sx * -0.15, 0.2, 0), K6.iron)), M.prop, { pos: p, castShadow: false })); }
  scene.root.add(mergeStatic(room, 'room'), mergeStatic(props, 'props'));

  // ---- window light: moon through the left wall's windows and down through the walk's roof
  const moon = '#9fb8ff';
  const sh = [], pt = group('patches');
  for (const o of SIDE_WIN) { // the left wall's windows: world z = centre - o.x (the wall is turned to face +X)
    const z = (FRONT + BACK) / 2 - o.x;
    sh.push(place(shaft({ w: o.w * 0.9, h: (o.top - o.sill) * 0.8, dir: [-0.12, -0.8, 1], len: 5.2, cards: 3, color: moon, spread: 0.2 }), -HW + 0.1, (o.sill + o.top) / 2, z, 0, 90, 0));
    pt.add(node('patch', patch({ w: 1.4, d: 2.6, panes: 2, shear: 0, color: '#aebfff', glow: 0.5 }), M.flat, { pos: [-HW + 3.7, 0.012, z + 0.4], rot: [0, 90, 0] }));
  }
  if (!low) for (let i = 1; i < WT.length - 1; i += 2) { const z = WT[i] - 2.1; sh.push(place(shaft({ w: 1.2, h: 0.3, dir: [0.45, 0.1, 1], len: 4.6, cards: 1, color: '#3440b0', spread: 0.5 }), -1.2, WALK_EAVE + 0.6, z, 90, 0, 0)); pt.add(node('wp', patch({ w: 1.3, d: 1.5, panes: 2, shear: 0.1, color: '#93a8ff', glow: 0.45 }), M.flat, { pos: [0.8, 0.02, z + 0.4] })); }
  scene.root.add(node('shafts', merge(sh), M.shaft), mergeStatic(pt, 'patches'));
  // the lamp's own cone
  const cone = node('lamp-cone', tint(place(rayMesh(3.0, 0.2, 2.4, 18), LAMP[0], LAMP[1] - 0.1, LAMP[2]), '#b88a40'), M.cone);
  scene.root.add(cone);
  const lampNode = node('hurricane', lampMesh, M.lantern, { pos: LAMP_HOOK }); lampNode.castShadow = false;
  scene.root.add(lampNode);

  const sprites = scene.sprites = createSprites(low ? 256 : 448);

  // ---- four hundred dockers: near rows in the mouth of the walk and along the head-house walls, a far mass behind
  const nearSpots = [], farSpots = [];
  for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) nearSpots.push({ pos: [-2.25 + i * 0.9 + (r() - 0.5) * 0.3 + (row % 2) * 0.4, 0, BACK - 0.5 - row * 1.15 + (r() - 0.5) * 0.3], face: (r() - 0.5) * 24, s: 1.02 + r() * 0.2 });
  for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) nearSpots.push({ pos: [sx * (4.2 + r() * 1.6), 0, BACK + 1.9 + i * 0.95 + (r() - 0.5) * 0.3 + (sx > 0 ? 1.2 : 0.4)], face: -sx * (62 + r() * 24), s: 1.02 + r() * 0.2 });
  const farRows = low ? 9 : 16;
  for (let row = 0; row < farRows; row++) for (let i = 0; i < 6; i++) farSpots.push({ pos: [-2.2 + i * 0.88 + (r() - 0.5) * 0.4 + (row % 2) * 0.35, 0, BACK - 4.0 - row * (low ? 2.2 : 1.35) + (r() - 0.5) * 0.4], face: (r() - 0.5) * 30, s: 1.0 + r() * 0.2 });
  const dockerCoats = ['#ffbc9c', '#a8d0ff', '#ffdc90', '#b4ecd0', '#ffb4c4', '#cdbcff', '#ffd0a8', '#9ce0e8'], farCoats = ['#f09a80', '#7fb4f0', '#f0c868', '#84d8b8', '#f094b0', '#b49cf0'];
  const nearCrowd = crowd({ spots: nearSpots, material: M.prop, sprites, seed: 5, detail: 1, hold: 'lantern', colors: dockerCoats, glowSize: 0.7, variants: 2 });
  const farCrowd = crowd({ spots: farSpots, material: M.speck, sprites, seed: 9, detail: 0, hold: 'lantern', colors: farCoats, glowSize: 0.8, variants: 1 });
  scene.root.add(nearCrowd.node, farCrowd.node);
  // the lanterns that go up for the vote: one above every docker, on a stick
  const all = [...nearSpots, ...farSpots];
  const upPaper = setGlow(lathe([[0, 0.14], [0.07, 0.17], [0.13, 0.3], [0.13, 0.42], [0.07, 0.55], [0, 0.58]], 6, { crease: 180 }), 0.92);
  const upMesh = merge(upPaper, tint(place(cylinder(0.05, 0.065, 0.05, 5), 0, 0.56, 0), [0.22, 0.24, 0.42]), tint(place(cylinder(0.012, 0.012, 0.6, 3, { caps: false }), 0, -0.45, 0), [0.25, 0.25, 0.4]));
  const upNode = node('raised', upMesh, M.speck); upNode.castShadow = false; upNode.instances = makeInstances(all.length); upNode.instances.count = all.length;
  scene.root.add(upNode);
  const ups = all.map((sp, i) => ({ x: sp.pos[0] + (i % 2 ? 0.22 : -0.22), z: sp.pos[2], y: 1.02 * (sp.s || 1) + 0.5 + r() * 0.3, col: rgb(PAL.lanterns[Math.floor(r() * PAL.lanterns.length)]), ph: r() * 6.283, at: i / all.length, glow: sprites.add({ kind: 'glow', pos: [0, 0, 0], size: i < nearSpots.length ? 0.95 : 1.25, color: '#ffc060', alpha: 0 }) }));

  // ---- the key
  const keyNode = node('key', merge(tint(place(torus(0.045, 0.014, 8, 4), 0, 0.012, 0), K6.brass), tint(place(box(0.13, 0.02, 0.022), 0.1, 0.012, 0), K6.brass), tint(place(box(0.03, 0.02, 0.05), 0.15, 0.012, 0.03), K6.brass)), M.prop, { pos: [TABLE[0] + 0.86, 0.83, TABLE[2] + 0.26], rot: [0, 24, 0], visible: false });
  keyNode.castShadow = false; scene.root.add(keyNode);
  const keyGlint = sprites.add({ kind: 'sparkle', pos: [TABLE[0] + 0.9, 0.9, TABLE[2] + 0.26], size: 0.3, color: '#fff2b0', alpha: 0 });

  const fg = group('fg');
  fg.add(node('fg1', ropeCoil({ r: 0.36, turns: 4 }), M.prop, { pos: [-1.9, 0, 2.9] }), node('fg2', cask({ r: 0.26, h: 0.62 }), M.prop, { pos: [2.1, 0, 2.8] }), node('fg3', ropeCoil({ r: 0.28, turns: 3, color: K6.rope2 }), M.prop, { pos: [1.5, 0, 3.1] }));
  const foreground = mergeStatic(fg, 'foreground'); scene.root.add(foreground);
  const actors = group('actors'); scene.root.add(actors);

  // ---- lamps and glows
  const lamps = [
    { name: 'hurricane', pos: LAMP, color: '#ffc060', radius: 10, base: 1.5, flicker: 0.07 },
    { name: 'board', pos: [-4.55, 3.4, BACK + 1.0], color: '#ffc870', radius: 4.2, base: 1.0 },
    { name: 'walk-1', pos: [walkLamps[0][0] * 0.6, 2.6, walkLamps[0][2]], color: '#ffb458', radius: 6.5, base: 1.1 },
    { name: 'walk-2', pos: [walkLamps[1][0] * 0.6, 2.6, walkLamps[1][2]], color: '#ffb458', radius: 6.5, base: 1.0 },
    { name: 'moon', pos: [-3.4, 2.2, 0.4], color: '#8fa8ff', radius: 5, base: 0.9, flicker: 0, fixed: true },
    { name: 'gable', pos: [0, 2, WALK_END + 2], color: '#ffc870', radius: 9, base: 1.2, fixed: true },
  ];
  const glows = [
    { sprite: sprites.add({ kind: 'glow', pos: LAMP, size: 3.6, color: '#ffb048', alpha: 0 }), base: 0.5 },
    { sprite: sprites.add({ kind: 'glow', pos: [-4.55, 3.7, BACK + 0.6], size: 1.3, color: '#ffb450', alpha: 0 }), base: 0.5 },
    { sprite: sprites.add({ kind: 'glow', pos: [0, 1.7, WALK_END + 0.4], size: 5, color: '#ffb050', alpha: 0 }), base: 0.35, fixed: true },
  ];
  for (const p of walkLamps) glows.push({ sprite: sprites.add({ kind: 'glow', pos: p, size: 1.5, color: '#ffb450', alpha: 0 }), base: 0.55 });
  const lampStar = sprites.add({ kind: 'sparkle', pos: LAMP, size: 1.5, color: '#fff6d0', alpha: 0.7 });

  // ---- the live stage's two tasks (see the header): Tobb's hopper table on an easel, and the three roof hatches
  const EASEL = [1.2, 0, -0.95];      // low and near the middle: the band's HUD plates cover the top corners of the frame
  const BAR_X = [-0.42, 0, 0.42], BAR_H = [0.86, 0.66, 0.2], BAR_COL = [K6.cream, K6.yellow, K6.coral];
  const easel = group('easel');
  easel.add(node('easel-frame', merge(
    tint(place(box(1.56, 1.2, 0.05), 0, 1.2, 0), '#2c4a66'), tint(place(box(1.68, 0.07, 0.09), 0, 1.82, 0), K6.timberDark), tint(place(box(1.68, 0.07, 0.12), 0, 0.58, 0.02), K6.timberDark),
    tint(place(box(0.07, 1.9, 0.07), -0.7, 0.95, -0.08, -7, 0, 0), K6.timberDark), tint(place(box(0.07, 1.9, 0.07), 0.7, 0.95, -0.08, -7, 0, 0), K6.timberDark), tint(place(box(0.07, 1.8, 0.07), 0, 0.9, -0.42, 16, 0, 0), K6.timberDark),
    tint(place(box(1.3, 0.02, 0.02), 0, 0.7, 0.035), K6.chalk)), M.prop));
  const bars = BAR_X.map((bx, i) => { const n = node('easel-bar' + i, setGlow(tint(place(box(0.26, 1, 0.02), 0, 0.5, 0), BAR_COL[i]), 0.5), M.prop, { pos: [bx, 0.72, 0.04] }); n.castShadow = false; n.setScale(1, 0.001, 1); n.visible = false; easel.add(n); return n; });
  easel.position[0] = EASEL[0]; easel.position[2] = EASEL[2]; easel.setRot(0, -10, 0); easel.visible = false;
  scene.root.add(easel);
  const barV = [0, 0, 0];
  const setBar = (i, v) => { barV[i] = v; bars[i].visible = v > 0.01; bars[i].setScale(1, Math.max(0.001, BAR_H[i] * v), 1); };
  const HATCH_X = [-2.3, 0.1, 2.4], hatches = HATCH_X.map((hx, i) => {
    const g = group('hatch' + i);
    g.add(node('hatch-shaft', place(shaft({ w: 1.5, h: 1.0, dir: [0.16 - 0.1 * i, 0.2, 1], len: 5.7, cards: 3, color: '#eef3ff', spread: 0.25 }), hx, 5.5, -0.5, 90, 0, 0), M.shaft));
    g.add(node('hatch-patch', patch({ w: 1.7, d: 1.7, panes: 2, shear: 0, color: '#e4ecff', glow: 0.85 }), M.flat, { pos: [hx + 0.5 - 0.3 * i, 0.014, 0.55] }));
    g.visible = false; scene.root.add(g);
    return { g, glow: sprites.add({ kind: 'glow', pos: [hx + 0.3, 1.3, -0.1], size: 2.6, color: '#c8d6ff', alpha: 0 }), v: 0 };
  });
  const surge = pulse(1.7);
  const tallyUnits = BAR_X.map((bx, i) => taskUnit({
    pos: [EASEL[0] + bx, 1.2, EASEL[2] + 0.1], stand: [EASEL[0] - 1.0 + bx * 0.5, 0.2],
    apply(v, fresh) { if (fresh) { easel.visible = true; for (const h of hatches) h.v = 0; setKey(false); setVote(0); } setBar(i, v); },
  }));
  const hatchUnits = HATCH_X.map((hx, i) => taskUnit({
    pos: [hx, 2.3, 0.3], stand: null,
    apply(v, fresh) { if (fresh) { easel.visible = true; for (let k = 0; k < 3; k++) setBar(k, 1); setKey(false); setVote(0); } hatches[i].v = v; },
  }));
  /** 'tally-column' x3 (ch6.s2: forty days, thirty, nine) and 'hatch' x3 (ch6.s5: the hearing opened). */
  function task(type, index = 0) {
    const list = type === 'tally-column' ? tallyUnits : type === 'hatch' ? hatchUnits : null;
    return list && list[index] ? list[index].arm() : null;
  }
  /** The drain: the hall shouts for the strike and four hundred lanterns are shaken at the table. */
  function setback() { surge.hit(); }

  // ---- per frame
  let vote = L.vote, voteNow = L.vote, keyOn = false;
  const Q = quat.create(), S3 = [1, 1, 1], Mx = m4.create(), P = [0, 0, 0], rnd = rng(31);
  let nextSpark = 0;
  const CO = { lit: 0, lively: 0 };
  function setVote(v) { vote = Math.max(0, Math.min(1, v)); }
  function setKey(on) { keyOn = !!on; keyNode.visible = keyOn; }
  function cue(lineId) {
    if (typeof lineId !== 'string') return false;
    const m = /^ch6\.s(\d)\.c(\d+)$/.exec(lineId); if (!m) return false;
    const s = Number(m[1]), n = Number(m[2]);
    if (s === 2) { setKey(n >= 26); setVote(0); return true; }
    if (s === 5) { setKey(false); setVote(n >= 28 ? 1 : 0); return true; }
    return false;
  }
  function tick(time, dt, pw, live) {
    voteNow += Math.max(-dt * 0.8, Math.min(dt * 0.45, vote - voteNow));
    const sw = Math.sin(time * 0.7) * 2.2, sw2 = Math.sin(time * 0.53 + 1) * 1.6;
    lampNode.setRot(sw2, 0, sw);
    const len = -lampMesh.anchors.lamp[1];
    LAMP[0] = LAMP_HOOK[0] + Math.sin(sw * DEG) * len; LAMP[2] = LAMP_HOOK[2] - Math.sin(sw2 * DEG) * len;
    glows[0].sprite.pos[0] = lampStar.pos[0] = LAMP[0]; glows[0].sprite.pos[2] = lampStar.pos[2] = LAMP[2];
    cone.position[0] = LAMP[0] - LAMP_HOOK[0]; cone.position[2] = LAMP[2] - LAMP_HOOK[2]; cone.visible = pw > 0.05;
    lampStar.alpha = 0.6 * Math.min(1, pw) * (0.8 + 0.2 * Math.sin(time * 9)); lampStar.rot = time * 0.2;
    const sg = surge.value(dt), shown = Math.min(1, voteNow + 0.3 * sg);
    const carried = 0.16 + 0.5 * voteNow + 0.5 * sg;           // the lanterns they came with: low and mostly dark until the vote
    CO.lit = carried * Math.min(1.3, 0.4 + pw); CO.lively = 0.22 + 0.3 * voteNow + 0.7 * sg;
    for (let i = 0; i < hatches.length; i++) { const h = hatches[i]; h.g.visible = h.v > 0.3; h.glow.alpha = 0.34 * h.v; }
    nearCrowd.update(time, dt, CO); farCrowd.update(time, dt, CO);
    const d = upNode.instances.data;
    for (let i = 0; i < ups.length; i++) {
      const u = ups[i], k = Math.max(0, Math.min(1, (shown * 1.35 - u.at * 0.35) * 4 - 0.0)), e = k * k * (3 - 2 * k), bob = Math.sin(time * 1.7 + u.ph) * 0.05;
      P[0] = u.x + Math.sin(time * 0.9 + u.ph) * 0.04; P[1] = u.y - 0.9 * (1 - e) + bob; P[2] = u.z;
      quat.fromEuler(Q, 0, u.ph, Math.sin(time * 1.3 + u.ph) * 0.12); S3[0] = S3[1] = S3[2] = e < 0.02 ? 0.0001 : 0.6 + 0.4 * e;
      m4.fromTRS(Mx, P, Q, S3); d.set(Mx, i * 20);
      const fl = 0.92 + 0.08 * Math.sin(time * 8 + u.ph * 3);
      d[i * 20 + 16] = u.col[0] * fl; d[i * 20 + 17] = u.col[1] * fl; d[i * 20 + 18] = u.col[2] * fl;
      u.glow.pos[0] = P[0]; u.glow.pos[1] = P[1] + 0.36; u.glow.pos[2] = P[2]; u.glow.alpha = 0.62 * e * fl * Math.min(1.2, 0.5 + pw * 0.6);
    }
    upNode.instances.dirty = true; upNode.visible = shown > 0.01;
    keyGlint.alpha = keyOn ? 0.5 + 0.5 * Math.sin(time * 2.4) : 0;
    if (live && voteNow > 0.5 && time > nextSpark) { nextSpark = time + 0.1; const u = ups[Math.floor(rnd() * ups.length)]; sprites.sparkle(u.glow.pos, { count: 1, size: 0.22, spread: 0.4, life: 0.9, color: '#fff0b0' }); }
  }

  return shell({
    id: 'compact-hall', light, L, low, scene, cameras: CAMERAS, actors, foreground, lamps, glows, tick, cue, house: 0.55,
    motes: low ? null : { box: [-4, 4, 0.6, 4.2, -4, 1.5], every: 0.3, color: '#ffd890', size: 0.07, vel: [0.04, 0.05, 0.02], life: 5, alpha: 0.75 },
    marks: { ...STD_MARKS(), coil: { pos: [COIL[0], 0.42, COIL[2]], face: 20 }, table: [TABLE[0], 0.82, TABLE[2]], focus: LAMP },
    extra: { setVote, setKey, voteLevel: () => voteNow, task, setback, passLamp: setback },
  });
}

export const compactHall = { id: 'compact-hall', lights: [...Object.keys(LIGHTS), ...Object.keys(CORE)], cameras: Object.keys(CAMERAS), build };
export default compactHall;
