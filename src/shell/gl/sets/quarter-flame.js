// SET: quarter-flame. The lamp room of Kedge's lamp-house on the night the Compact cut its own lamp: the great bowl
// on its pedestal under a sooted copper hood, the rings of the engine round it, the hopper with its hatch standing
// open to be counted, kelp-ash in fish baskets, and three tall windows over the roads.
// Chapter 6: ch6.s7.c01-c15 (the lamp white and whole; a shovel of ash at a time; it drops to grey-violet; the sea
// stands up beyond the half-mile; the lane narrows to one hull and holds).
//
//   import { quarterFlame } from './sets/quarter-flame.js';
//   const set = quarterFlame.build(GL, { light: 'quarter' | 'white', low: false });
//
// The shape is lantern-stalls' (see ../index.js). Figures face +Z; cameras look toward -Z, at the lamp and the
// windows behind it. The stage strip x -3.2..3.2, z 0..1.6 is clear. The bowl stands at (0, -3.5) on a two-step
// dais; the room is round, radius 7.6 about the bowl, open toward the camera.
//   'quarter'  the flame cut to a quarter: small, grey-violet; the rings stopped; ash in the air; the sea stood up
//   'white'    the lamp whole: a white fire the height of a man, the rings turning, the room full of gold light
// Both are one room: the light state only picks where the flame starts.
//   setFlame(0.25..1)   the flame eases there (about four seconds); everything that depends on it follows
//   shovel()            a shovel of ash goes in: a puff of grey over the bowl
//   cue(lineId)         ch6.s7.c01..c03 the lamp stands white; c03 the first shovels; from c04 it drops
//   task('great-lamp')  ch6.s7: white at v 0, a shovel and a grey puff at each half, yellowing to 0.58 at v 1; the
//                       cutscene's c04 takes it to the quarter. setback(): a puff and a gutter (also passLamp)
//   The core's 'interior' builds 'white' (where ch6.s7 starts), 'night' builds 'quarter'.
//   marks.bowl { pos, face } (where a figure stands to put ash in), marks.hatch (by the hopper), marks.focus (the flame)
// low: true drops the dome ribs, two baskets, the roads' far lights and the motes.

import { m4, quat, rng, DEG, rgb } from '../math.js';
import { merge, tint, place, plane, box, cylinder, lathe, torus, setGlow, setOutline, gradientY, deform, sphere, flip } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic } from '../scene.js';
import { createSprites } from '../sprites.js';
import { rayMesh } from '../fx.js';
import { PAL, pickLight, sack, ropeCoil, railing, flame as flameMesh } from './kit.js';
import { K6, ch6Materials, shell, STD_MARKS, STD_CAMERAS, coreLight, taskUnit, norm3, cask, ringWall, greatBowl, lampHood, engineRing, hopperChute, ashBasket, shovel as shovelMesh, shaft, patch, bar } from './kit-ch6.js';

const C = [0, 0, -3.5], RAD = 7.6, H = 8.2, WATER = -9;

// the two ends the room moves between; everything else is shared
const WHITE = { key: '#fff2d0', sky: '#ffe2b0', ground: '#8a7ce0', shadow: '#8478e4', amb: 0.22, rim: '#fff0b8' };
const QUARTER = { key: '#cfc4ff', sky: '#7f78e8', ground: '#4a48b8', shadow: '#4c46b4', amb: 0.2, rim: '#d8ccff' };
const ENV = () => ({
  key: { dir: norm3([0.22, 0.62, -0.75]), color: WHITE.key },                      // the lamp is behind them: shadows run toward the camera
  shadow: { tint: WHITE.shadow, lift: 0.14, saturate: 1.4 },
  ambient: { sky: WHITE.sky, ground: WHITE.ground, amount: WHITE.amb },
  rim: { color: WHITE.rim, amount: 1.2, edge: 0.7 },
  fog: { color: '#3a4cc0', density: 0.004, start: 20, max: 0.7 },
  sky: { zenith: '#0b186c', mid: '#1e3cb0', midAt: 0.45, horizon: '#5f84ec', below: '#2c4cb8', sunDir: norm3([-0.5, 0.42, -1]), moon: 0.65, stars: 1, sun: { size: 2.6 } },
  water: { deep: '#132a86', mid: '#1e45ae', shallow: '#3478d6', glintDensity: 0.2, level: WATER },
});
const LIGHTS = {
  quarter: { preset: 'night', power: 1, flame: 0.25, env: ENV() },
  white: { preset: 'night', power: 1, flame: 1, env: ENV() },
};

const CORE = { interior: 'white', night: 'quarter' };      // the core's light names this set answers

const CAMERAS = STD_CAMERAS({
  wide: { target: [0.0, 2.0, -0.6], dist: 8.6, yaw: 2, pitch: 2.5, fov: 46, shadowCenter: [0, 0, -1.6], shadowRadius: 8.5 },
  low: { target: [0.05, 2.2, -0.2], dist: 6.6, yaw: -6, pitch: -13, fov: 56 },
  stage: { target: [0, 1.15, 0.2], dist: 9.8, yaw: -12, pitch: 6, fov: 25, shadowCenter: [0, 0, -1], shadowRadius: 8 },
  landscape: { target: [0, 2.0, -1.6], dist: 10.5, yaw: 4, pitch: 4, fov: 42 },
});

function build(engine = null, { light, low = false } = {}) {
  const picked = pickLight('quarter-flame', LIGHTS, coreLight(light, CORE)), L = picked.L; light = picked.name;
  const M = ch6Materials(), r = rng(6767);
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  env.sky.sunDir = norm3(env.sky.sunDir);
  env.water.shores = [];

  // ---- the room: a ring of stone bays with three tall lights over the roads, a floor of inlaid rings, a dome
  const room = group('room'), props = group('props');
  const WIN = { w: 2.3, sill: 1.5, top: 6.5 };
  const wallMesh = ringWall({ r: RAD, h: H, arc: 216, bays: 9, t: 0.6, open: { 3: WIN, 4: { ...WIN, w: 2.5, top: 6.9 }, 5: WIN, 1: { w: 1.7, sill: 0, top: 3.4 } }, color: '#b4b6f4', color2: '#9a9cec', band: '#f4ecd8', base: 1.25 });
  room.add(node('wall', wallMesh, M.wall, { pos: C }));
  const ring = (r0, r1, col, y) => tint(lathe([[r1, y], [r0, y]], 28, { crease: 180 }), col);
  room.add(node('floor', merge(ring(0, 2.9, '#ffe9c8', 0.0), ring(2.9, 3.3, K6.coral, 0.0), ring(3.3, 5.6, '#e9e2ff', 0.0), ring(5.6, 5.95, K6.teal, 0.0), ring(5.95, RAD + 0.3, '#cfc8f6', 0.0)), M.wall, { pos: C }));
  room.add(node('floor-front', tint(place(plane(RAD * 2 + 3, 16), 0, -0.004, C[2] + 8), '#cfc8f6'), M.wall));
  // spokes of the inlay, pointing at the windows
  const spokes = []; for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; spokes.push(tint(place(box(0.14, 0.012, 2.3), Math.sin(a) * 4.45, 0.004, Math.cos(a) * 4.45, 0, a / DEG, 0), i % 3 === 0 ? K6.coral : '#b8b0f0')); }
  room.add(node('spokes', setOutline(merge(spokes), 0), M.flat, { pos: C }));
  const dome = gradientY(lathe([[RAD + 0.3, H], [RAD * 0.98, H + 0.5], [RAD * 0.8, H + 2.2], [RAD * 0.45, H + 3.4], [0, H + 3.8]], 18, { crease: 180 }), '#6a5fd4', '#3f3a9c');
  // seen from inside, so turn it inside out: scale X by -1 flips the winding
  room.add(node('dome', flip(dome), M.wall, { pos: C }));
  room.add(node('cornice', tint(place(torus(RAD - 0.1, 0.22, 28, 5), 0, H, 0), '#f4ecd8'), M.wall, { pos: C }));
  if (!low) for (let i = 0; i < 9; i++) { const a = (-108 + 24 * i) * DEG; props.add(node('rib', bar([C[0] + Math.sin(a) * (RAD - 0.2), H, C[2] - Math.cos(a) * (RAD - 0.2)], [C[0] + Math.sin(a) * RAD * 0.42, H + 3.3, C[2] - Math.cos(a) * RAD * 0.42], 0.12, K6.brassDark, 5), M.prop, { castShadow: false })); }

  // ---- the lamp: dais, bowl, hood and flue
  const dais = merge(tint(lathe([[0, 0], [2.75, 0], [2.75, 0.2], [2.3, 0.2], [2.3, 0.4], [0, 0.4]], 20, { crease: 30 }), '#fff3dc'), tint(place(torus(2.75, 0.05, 20, 4), 0, 0.2, 0), K6.brass));
  props.add(node('dais', dais, M.prop, { pos: C }));
  const bowl = greatBowl({ r: 1.45, h: 1.75 });
  props.add(node('bowl', bowl, M.prop, { pos: [C[0], 0.4, C[2]] }));
  const FIRE = [C[0], 0.4 + bowl.anchors.fire[1], C[2]];
  const HOOD_Y = 5.45;
  props.add(node('hood', lampHood({ r: 2.35, h: 2.7 }), M.prop, { pos: [C[0], HOOD_Y, C[2]], castShadow: false }));
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + 0.5; props.add(node('stay', bar([C[0] + Math.cos(a) * 2.3, HOOD_Y + 0.1, C[2] + Math.sin(a) * 2.3], [C[0] + Math.cos(a) * 5.2, H + 1.6, C[2] + Math.sin(a) * 5.2], 0.035, K6.iron, 4), M.prop, { castShadow: false })); }

  // ---- the hopper and its chute at the right, hatch open; what the cutting is done with at the left
  const HOP = [4.55, 0, -2.5], HOP_YAW = -24;
  const hop = hopperChute({ h: 3.6, r: 1.05 });
  props.add(node('hopper', hop, M.prop, { pos: HOP, rot: [0, HOP_YAW, 0] }));
  props.add(node('hop-steps', merge(tint(place(box(1.1, 0.3, 0.6), 0, 0.15, 0), K6.timber2), tint(place(box(1.1, 0.6, 0.5), 0, 0.3, -0.5), K6.timber)), M.prop, { pos: [4.75, 0, -1.2], rot: [0, HOP_YAW, 0] }));
  props.add(node('casks', merge(place(cask({}), 0, 0, 0), place(cask({ r: 0.27, h: 0.66 }), 0.7, 0, 0.25), place(cask({}), 0.3, 0.72, 0.1, 0, 40, 0)), M.prop, { pos: [5.9, 0, -0.6] }));
  const ASH = [-4.1, 0, -1.9];
  const heap = tint(place(deform(sphere(1, 10, 6), (p) => { if (p[1] < 0) p[1] = 0; p[1] *= 0.55 + 0.15 * Math.sin(p[0] * 5); }), 0, 0, 0, 0, 0, 0, 0.75, 0.75, 0.62), K6.ash);
  props.add(node('ash-heap', merge(heap, place(shovelMesh({ len: 1.3, lean: 16 }), 0.2, 0.18, -0.05, 0, 30, 0)), M.prop, { pos: ASH }));
  const baskets = [[-3.2, -1.25, 1, 20], [-4.9, -1.15, 1.1, 70], [-3.75, -0.75, 0.9, 130], [-5.5, -2.1, 1, 0], [-2.9, -2.4, 0.95, 50]];
  baskets.forEach(([x, z, s, yaw], i) => { if (low && i > 2) return; props.add(node('basket' + i, ashBasket({ s }), M.prop, { pos: [x, 0, z], rot: [0, yaw, 0] })); });
  props.add(node('sack1', sack({ seed: 3, color: '#c8d4b8' }), M.prop, { pos: [-5.6, 0, -0.9], rot: [0, 40, 0] }), node('sack2', sack({ seed: 6, s: 0.3, color: '#c8d4b8' }), M.prop, { pos: [-5.1, 0, -0.45] }));
  props.add(node('spare-shovel', shovelMesh({ len: 1.25, lean: 8 }), M.prop, { pos: [-6.3, 0, -1.9], rot: [0, 60, 0] }));
  // two hand lanterns stood on the floor: the only warm light once the lamp is down
  const HAND = [[-2.45, 0, -0.75], [2.8, 0, -0.85]];
  const hand = merge(tint(lathe([[0, 0], [0.12, 0], [0.12, 0.05], [0.04, 0.07], [0, 0.07]], 8, { crease: 50 }), K6.brass), setGlow(tint(place(cylinder(0.075, 0.095, 0.2, 8), 0, 0.07, 0), '#ffe6a0'), 1), tint(place(cylinder(0.12, 0.03, 0.1, 8), 0, 0.27, 0), K6.brass), tint(place(torus(0.08, 0.012, 8, 4), 0, 0.42, 0, 90, 0, 0), K6.brass));
  for (const p of HAND) props.add(node('hand-lamp', hand, M.prop, { pos: p }));
  // the stair door in the left wall, standing open on a lit stair
  const door = wallMesh.anchors.openings.find((o) => o.sill === 0);
  const DOOR = [C[0] + door.pos[0], 1.7, C[2] + door.pos[2]];
  props.add(node('stair-glow', setOutline(setGlow(tint(place(box(1.7, 3.4, 0.05), 0, 1.7, -0.5), '#ffb860'), 1), 0), M.prop, { pos: [DOOR[0], 0, DOOR[2]], rot: [0, door.yaw, 0], castShadow: false }));
  props.add(node('door-leaf', tint(place(box(1.5, 3.2, 0.1), 0.75, 1.6, 0), K6.tealDark), M.prop, { pos: [DOOR[0] + Math.cos(door.yaw * DEG) * 0.85, 0, DOOR[2] - Math.sin(door.yaw * DEG) * 0.85], rot: [0, door.yaw - 70, 0] }));
  scene.root.add(mergeStatic(room, 'room'), mergeStatic(props, 'props'));

  // ---- outside the windows: the roads, hulls' riding lights, and the sea that stands up when the lamp is cut
  const sprites = scene.sprites = createSprites(low ? 192 : 384);
  const riding = [];
  if (!low) for (let i = 0; i < 16; i++) riding.push(sprites.add({ kind: 'glow', pos: [-34 + i * 4.6 + r() * 3, WATER + 1.5 + r(), -44 - r() * 50], size: 1.6 + r(), color: '#ffe2a0', alpha: 0.7 }));
  const waveMesh = gradientY(deform(box(260, 1, 16), (p) => { const u = p[0] / 130; if (p[1] > 0) { p[1] = 1 + 0.08 * Math.sin(u * 23) + 0.1 * Math.sin(u * 7 + 1); p[2] *= 0.3; } else p[1] = 0; }, 60), '#2a44b0', '#9aa8f4', 0, 1);
  const wave = node('sea-wall', waveMesh, M.farFlat, { pos: [0, WATER, -125] }); wave.castShadow = false;
  const crest = node('sea-crest', setGlow(tint(place(box(260, 0.06, 2), 0, 1.02, 1.6), '#f4f6ff'), 0.5), M.farFlat, { pos: [0, WATER, -125] }); crest.castShadow = false;
  scene.root.add(wave, crest);

  // ---- the flame, the rings, the light that comes from them
  const fl = node('flame', flameMesh({ r: 0.62, h: 2.0, seg: 9, root: '#ffffff', tip: '#ffc848' }), M.lantern, { pos: FIRE }); fl.castShadow = false;
  const flq = node('flame-quarter', flameMesh({ r: 0.62, h: 2.0, seg: 9, root: '#d8c8ff', tip: '#6448e0' }), M.lantern, { pos: FIRE }); flq.castShadow = false;
  scene.root.add(fl, flq);
  const RING_Y = FIRE[1] + 0.95;
  const rings = [
    { n: node('ring0', engineRing({ r: 2.0, studs: 8 }), M.prop, { pos: [C[0], RING_Y, C[2]] }), tilt: [18, 0, 12], rate: 26, a: 0 },
    { n: node('ring1', engineRing({ r: 2.25, studs: 10, tubeR: 0.05 }), M.prop, { pos: [C[0], RING_Y, C[2]] }), tilt: [-24, 0, -16], rate: -17, a: 40 },
    { n: node('ring2', engineRing({ r: 1.72, studs: 6, tubeR: 0.05 }), M.prop, { pos: [C[0], RING_Y, C[2]] }), tilt: [62, 0, 30], rate: 38, a: 90 },
  ];
  for (const g of rings) { g.n.castShadow = false; scene.root.add(g.n); }
  // light through the three windows (moon), and the lamp's own cone up into the hood
  const sh = [], pt = group('patches');
  for (const o of wallMesh.anchors.openings) {
    if (o.sill === 0) continue;
    const wx = C[0] + o.pos[0], wz = C[2] + o.pos[2], dx = C[0] - wx * 0.55, dz = 1.2 - wz;
    sh.push(place(shaft({ w: o.w * 0.9, h: o.h * 0.7, dir: [0, -0.62, 1], len: 7.5, cards: 3, color: '#93a8ff', spread: 0.15 }), wx, o.pos[1] + 0.3, wz + 0.1, 0, o.yaw, 0));
    pt.add(node('patch', patch({ w: o.w * 0.85, d: 3.4, panes: 2, shear: 0, color: '#a9b8ff', glow: 0.45, taper: 1.2 }), M.flat, { pos: [wx * 0.42, 0.012, wz + (C[2] - wz) * 0.0 + 6.2 - Math.abs(wx) * 0.25], rot: [0, o.yaw, 0] }));
  }
  const moonShafts = node('shafts', merge(sh), M.shaft);
  scene.root.add(moonShafts, mergeStatic(pt, 'patches'));
  const cone = node('flame-cone', tint(place(rayMesh(3.6, 0.5, 2.3, 18), FIRE[0], FIRE[1] + 0.2, FIRE[2], 180, 0, 0), '#fff0b0'), M.cone); scene.root.add(cone);

  const fg = group('fg');
  fg.add(node('rail-l', railing({ len: 2.6, h: 0.7, bay: 0.65, color: K6.brass, post: K6.iron, cap: K6.brass }), M.prop, { pos: [-2.9, 0, 3.0], rot: [0, 8, 0] }), node('rail-r', railing({ len: 2.6, h: 0.7, bay: 0.65, color: K6.brass, post: K6.iron, cap: K6.brass }), M.prop, { pos: [2.9, 0, 3.0], rot: [0, -8, 0] }));
  const foreground = mergeStatic(fg, 'foreground'); scene.root.add(foreground);
  const actors = group('actors'); scene.root.add(actors);

  const lamps = [
    { name: 'flame', pos: [FIRE[0], FIRE[1] + 0.8, FIRE[2] + 0.6], color: '#fff0c0', radius: 15, base: 1.6, flicker: 0.04, fixed: true },
    { name: 'flame-floor', pos: [FIRE[0], 1.0, FIRE[2] + 3.2], color: '#ffe6a8', radius: 8, base: 1.0, flicker: 0.04, fixed: true },
    { name: 'hand-l', pos: [HAND[0][0] + 0.5, 0.9, HAND[0][2] + 0.7], color: '#ffb050', radius: 6.5, base: 2.2 },
    { name: 'hand-r', pos: [HAND[1][0] - 0.5, 0.9, HAND[1][2] + 0.7], color: '#ffb050', radius: 6.5, base: 2.2 },
    { name: 'stair', pos: [DOOR[0] + 1.3, 1.6, DOOR[2] + 0.9], color: '#ffa850', radius: 5.5, base: 1.2 },
    { name: 'moon', pos: [0, 2.6, C[2] - 4.2], color: '#8fa8ff', radius: 7, base: 0.9, flicker: 0, fixed: true },
  ];
  const cWhite = rgb('#fff0c0'), cQuarter = rgb('#a890ff');
  const glows = [
    { sprite: sprites.add({ kind: 'glow', pos: [HAND[0][0], 0.2, HAND[0][2]], size: 1.9, color: '#ffb450', alpha: 0 }), base: 0.55 },
    { sprite: sprites.add({ kind: 'glow', pos: [HAND[1][0], 0.2, HAND[1][2]], size: 1.9, color: '#ffb450', alpha: 0 }), base: 0.55 },
    { sprite: sprites.add({ kind: 'glow', pos: [DOOR[0] + 0.3, 1.7, DOOR[2] + 0.2], size: 3.4, color: '#ffa040', alpha: 0 }), base: 0.4, fixed: true },
  ];
  const halo = sprites.add({ kind: 'glow', pos: [FIRE[0], FIRE[1] + 0.9, FIRE[2]], size: 8, color: '#fff2c0', alpha: 0.5 });
  const core = sprites.add({ kind: 'glow', pos: [FIRE[0], FIRE[1] + 0.7, FIRE[2]], size: 3, color: '#ffffff', alpha: 0.6 });
  const star = sprites.add({ kind: 'sparkle', pos: [FIRE[0], FIRE[1] + 0.9, FIRE[2] + 0.4], size: 4, color: '#ffffff', alpha: 0.9 });

  // ---- per frame
  let goal = L.flame, f = L.flame, shovelT = -1;
  const P = [0, 0, 0], V = [0, 0, 0], rnd = rng(71);
  const kW = rgb(WHITE.key), kQ = rgb(QUARTER.key), sW = rgb(WHITE.sky), sQ = rgb(QUARTER.sky), gW = rgb(WHITE.ground), gQ = rgb(QUARTER.ground), tW = rgb(WHITE.shadow), tQ = rgb(QUARTER.shadow), rW = rgb(WHITE.rim), rQ = rgb(QUARTER.rim);
  const mix3 = (out, a, b, t, k = 1) => { out[0] = (a[0] + (b[0] - a[0]) * t) * k; out[1] = (a[1] + (b[1] - a[1]) * t) * k; out[2] = (a[2] + (b[2] - a[2]) * t) * k; };
  const key0 = [1, 1, 1], ONE = [1, 1, 1];
  let nextSpark = 0, nextAsh = 0, nextGlint = 0;
  function setFlame(v, snap = false) { goal = Math.max(0.25, Math.min(1, v)); if (snap) f = goal; }
  function shovel() { shovelT = 0; }
  // the live stage's task (ch6.s7): the first shovels. The encounter takes the flame from white down into yellow
  // (0.58) and no further: "It's dropping. Yellow. Grey. There." is Tobb's line (c04), and the cue finishes it.
  let cut = false, shovels = 0;
  const lampUnit = taskUnit({
    pos: FIRE, stand: [-0.7, -0.35],
    apply(v, fresh) {
      if (fresh) { setFlame(1, true); cut = true; shovels = 0; }
      const n = Math.floor(v * 2 + 0.001);
      if (n > shovels) { shovels = n; shovel(); }
      setFlame(1 - 0.42 * v);
    },
  });
  const task = (type) => (type === 'great-lamp' ? lampUnit.arm() : null);
  /** The drain: too much ash at once. A grey puff rolls off the bowl and the flame gutters before it comes back. */
  function setback() { shovel(); f = Math.max(0.25, f - 0.22); }
  function cue(lineId) {
    const m = typeof lineId === 'string' && /^ch6\.s7\.c(\d+)$/.exec(lineId); if (!m) return false;
    const n = Number(m[1]);
    if (n >= 16) return false;
    if (n <= 3) { if (!cut) setFlame(1, n === 1); if (n === 3) shovel(); } else { setFlame(0.25); cut = false; }   // after the encounter the lamp is already yellowing: c01 does not put it back
    return true;
  }
  function tick(time, dt, pw, live, power) {
    f += Math.max(-dt * 0.19, Math.min(dt * 0.4, goal - f));
    const w = (f - 0.25) / 0.75, q = 1 - w;                                 // w: 1 whole and white, 0 cut to a quarter
    // the room's light follows the flame (and a little of the table's power, so an empty table dims the room)
    const house = 0.72 + 0.28 * Math.min(1, power) + 0.1 * Math.max(0, power - 1);
    mix3(key0, kQ, kW, w, (0.86 + 0.14 * w) * house); env.key.color[0] = key0[0]; env.key.color[1] = key0[1]; env.key.color[2] = key0[2];
    mix3(env.ambient.sky, sQ, sW, w); mix3(env.ambient.ground, gQ, gW, w); mix3(env.shadow.tint, tQ, tW, w); mix3(env.rim.color, rQ, rW, w);
    env.ambient.amount = QUARTER.amb + (WHITE.amb - QUARTER.amb) * w;
    // the flame itself: one mesh for each colour, cross-faded by scale
    const flick = 1 + 0.07 * Math.sin(time * 9.1) + 0.05 * Math.sin(time * 14.7 + 1), hgt = (0.4 + 0.6 * w) * flick, wid = 0.55 + 0.45 * w;
    fl.visible = w > 0.03; flq.visible = q > 0.03;
    fl.scale[0] = fl.scale[2] = wid * Math.min(1, w * 3) * (1 + 0.04 * Math.sin(time * 11)); fl.scale[1] = hgt * Math.min(1, w * 3); fl.setRot(0, time * 40, Math.sin(time * 3.1) * 2.5);
    flq.scale[0] = flq.scale[2] = wid * Math.min(1, q * 3) * 0.96; flq.scale[1] = hgt * 1.02 * Math.min(1, q * 3); flq.setRot(0, time * -33, Math.sin(time * 2.6) * 4);
    const fy = FIRE[1] + hgt * 0.9;
    mix3(env.points[0].color, cQuarter, cWhite, w); mix3(env.points[1].color, cQuarter, cWhite, w);
    env.points[0].intensity *= 0.42 + 0.58 * w; env.points[0].radius = 9 + 6 * w; env.points[1].intensity *= 0.35 + 0.65 * w;
    mix3(halo.color, cQuarter, cWhite, w); halo.size[0] = halo.size[1] = 4.2 + 3.6 * w; halo.alpha = (0.5 - 0.3 * w) * flick; halo.pos[1] = fy;
    core.size[0] = core.size[1] = 1.3 + 2.2 * w; core.alpha = 0.16; core.pos[1] = FIRE[1] + hgt * 0.7; mix3(core.color, cQuarter, ONE, 0.4 + 0.6 * w);
    star.size[0] = star.size[1] = (1.6 + 2.0 * w) * flick; star.pos[1] = fy; star.rot = time * 0.15; star.alpha = 0.3 + 0.5 * w; mix3(star.color, cQuarter, ONE, 0.3 + 0.7 * w);
    cone.visible = w > 0.08; cone.tint[0] = cone.tint[1] = cone.tint[2] = w * 0.55;
    moonShafts.tint[0] = moonShafts.tint[1] = moonShafts.tint[2] = 0.35 + 0.65 * q;   // the moon only shows in the room once the lamp is down
    // the engine: turning while the lamp is whole, run down and stopped at a quarter
    for (let i = 0; i < rings.length; i++) { const g = rings[i]; g.a += g.rate * dt * w * w; g.n.setRot(g.tilt[0], g.a, g.tilt[2]); }
    // out in the roads the sea stands up as the reach is halved
    const up = Math.max(0, Math.min(1, q * 1.2)); wave.scale[1] = 0.01 + 15 * up * up * (3 - 2 * up); crest.position[1] = WATER + wave.scale[1] - 1.02;
    wave.visible = crest.visible = up > 0.02;
    if (shovelT >= 0) { shovelT += dt; if (shovelT > 0.2 && shovelT - dt <= 0.2 && live) { P[0] = FIRE[0]; P[1] = FIRE[1] + 0.3; P[2] = FIRE[2] + 0.3; sprites.puff(P, { count: 5, size: 0.7, rise: 0.9, spread: 0.6, life: 2.2, color: '#c4d0b8' }); } if (shovelT > 1) shovelT = -1; }
    if (live) {
      if (time > nextSpark) { // whole: sparks of white salt-fire going up into the hood; cut: thin grey ash
        nextSpark = time + (w > 0.3 ? 0.07 : 0.3); P[0] = FIRE[0] + (rnd() - 0.5) * 0.8 * wid; P[1] = FIRE[1] + hgt * (0.4 + rnd()); P[2] = FIRE[2] + (rnd() - 0.5) * 0.6; V[0] = (rnd() - 0.5) * 0.4; V[1] = 0.9 + rnd() * 0.9; V[2] = (rnd() - 0.5) * 0.3;
        sprites.spawn({ kind: w > 0.3 ? 'sparkle' : 'glow', pos: P, vel: V, size: w > 0.3 ? 0.2 + rnd() * 0.25 : 0.09, life: 1.4, color: w > 0.3 ? '#fff6c8' : '#cfc4ff', alpha: 0.9 });
      }
      if (q > 0.3 && time > nextAsh) { nextAsh = time + 1.1; P[0] = FIRE[0] + (rnd() - 0.5) * 1.4; P[1] = FIRE[1] + 0.9; P[2] = FIRE[2] - 0.2; sprites.puff(P, { count: 1, size: 0.3, rise: 0.55, spread: 0.3, life: 3.4, color: '#8a86cc' }); }
      if (!low && time > nextGlint) { nextGlint = time + 0.25; P[0] = -4.5 + rnd() * 9; P[1] = 0.5 + rnd() * 3.6; P[2] = -5 + rnd() * 6; V[0] = 0.05; V[1] = 0.09 + rnd() * 0.1; V[2] = 0.05; sprites.spawn({ kind: 'glow', pos: P, vel: V, size: 0.06 + rnd() * 0.06, life: 5, color: w > 0.5 ? '#ffe9a8' : '#cdbcff', alpha: 0.75 }); }
    }
  }

  const set = shell({
    id: 'quarter-flame', light, L, low, scene, cameras: CAMERAS, actors, foreground, lamps, glows, tick, cue,
    marks: { ...STD_MARKS(), bowl: { pos: [-1.0, 0.4, C[2] + 2.2], face: 160 }, hatch: { pos: [3.5, 0, -1.2], face: 140 }, focus: FIRE },
    extra: { setFlame, shovel, flameLevel: () => f, task, setback, passLamp: setback },
  });
  return set;
}

export const quarterFlame = { id: 'quarter-flame', lights: [...Object.keys(LIGHTS), ...Object.keys(CORE)], cameras: Object.keys(CAMERAS), build };
export default quarterFlame;
