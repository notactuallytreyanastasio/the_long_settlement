// SET: exchange-floor. The trading floor of the Tallis Exchange: a tall cool hall with the board on its back
// wall (every price in Aurelle, chalked, rubbed out, chalked again), the clerks' gallery under it over three lit
// arches, a great fan window of coloured glass above it, and two trading pits on the floor, the salt pit under
// a coral standard and the bond pit under a teal one. The Tribune's hearing is held between them.
// Chapter 5: ch5.s1 Opening Bell (day: the floor is full and does not stop trading; lapse bonds jump every time
// she speaks), ch5.s3 Short (evening: after the closing bell, the pits empty and the day's slips in drifts).
//
//   import { exchangeFloor } from './sets/exchange-floor.js';
//   const set = exchangeFloor.build(GL, { light: 'day' | 'evening', low: false });
//
// Same shape as sets/lantern-stalls.js. Figures face +Z, cameras look toward -Z, the strip x -4.4..4.4,
// z 0..1.6 is clear (the pits' rims come to z -1.25).
//
// What this set can do for its story:
//   setCrowd(0..1)   traders in the pits and clerks on the gallery (day 1, evening 0)
//   setMood(0..1)    0 = the most expensive silence Tobb ever attended, 1 = sell the mark
//   setLapse(0..1)   the lapse-bond bar on the top row of the board (0.31 at the bell, 0.52 at the close)
//   cue(lineId)      ch5.s1.c01, c03, c05, c10, c14 (the silence), c15, c16 (runners), c26; ch5.s3.c01
// marks: a, b, c, two, party, opposition as everywhere, plus
//   board, lapse (world points)   salt, bond { pos, face }: a place on each pit's rim   focus = the fan window

import { m4, quat, rng, DEG } from '../math.js';
import { merge, tint, place, box, cylinder, sphere, ellipsoid, setGlow, setOutline, extrude } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic, makeInstances, material as GLmaterial } from '../scene.js';
import { createSprites } from '../sprites.js';
import { pickLight, crate } from './kit.js';
import { wall, windowFrame, lightPatch, wing, ceiling, stool } from './kit-b.js';
import { TL, MARKS, ch5Materials, shell, norm, throng, papers, shaft, fatColumn, lantern, ironRail, paving, priceBoard, pit, standard, lightNames, ownLight, taskUnit } from './kit-ch5.js';

const BW = 6.6, BACK = -6.6, FW = 9.4, WING_Z = 2.6, H = 8.2, GAL_Y = 2.05, GAL_D = 1.15;
const PITS = [{ x: -3.5, z: -3.25, color: '#ff7a5a', floor: TL.wine, name: 'salt' }, { x: 3.5, z: -3.25, color: TL.teal, floor: TL.plum, name: 'bond' }];
const PIT_R = 1.95;

// core light names (core/stage.js) this set answers besides its own
const ALIAS = { dusk: 'evening', night: 'evening', interior: 'day' };

const LIGHTS = {
  day: {
    preset: 'day', power: 0.35, crowd: 1, mood: 0.75, glass: 0.95, arch: 0.85,
    env: {
      key: { dir: norm([-0.34, 0.76, 0.52]), color: '#fff2d6' },
      shadow: { tint: '#8f86ea', lift: 0.09, saturate: 1.4 },
      ambient: { sky: '#cfe2ff', ground: '#ffcfb0', amount: 0.14 },
      rim: { color: '#fff0b8', amount: 0.6, edge: 0.75 },
      fog: { density: 0.0006, start: 40, max: 0.5 },
      sky: { zenith: '#4a98ee', mid: '#9ad6fa', horizon: '#fff3c0', sunDir: norm([-0.2, 0.6, -1]) },
      water: null,
    },
    shaft: '#fff0a8', shaftNear: 0.15, patch: '#fff2b0', fan: ['#ffd65a', '#7fe6d2', '#ff9ab8', '#ffd65a', '#7fe6d2', '#ff9ab8', '#ffd65a'], side: '#bfe6ff', mote: '#fff6d0',
    wall: ['#b6beff', '#a8b0f8'], floor: ['#ffd29c', '#ffa986', '#ffc590'], grout: '#d8846c',
  },
  evening: {
    preset: 'night', power: 1.3, crowd: 0, mood: 0.05, glass: 0.95, arch: 0.7,
    env: {
      key: { dir: norm([-0.36, 0.62, 0.6]), color: '#a99cf2' },
      shadow: { tint: '#3d3cae', lift: 0.11, saturate: 1.4 },
      ambient: { sky: '#7a62e0', ground: '#3a3296', amount: 0.17 },
      rim: { color: '#ffc070', amount: 0.8, edge: 0.74 },
      fog: { density: 0.0006, start: 40, max: 0.5 },
      sky: { zenith: '#3a3fb8', mid: '#b070e0', midAt: 0.5, horizon: '#ff9a5a', below: '#f08a70', stars: 0, moon: 0, sunDir: norm([-0.1, 0.2, -1]) },
      water: null,
    },
    shaft: '#ffa850', shaftNear: 0.34, patch: '#ffb060', fan: ['#ffb040', '#ff7a5a', '#ff9ab8', '#ffd65a', '#ff9ab8', '#ff7a5a', '#ffb040'], side: '#ff9a6a', mote: '#ffc880',
    wall: ['#8f8cf0', '#807ce6'], floor: ['#e8b89a', '#c88ea0', '#dca890'], grout: '#9a6c98',
  },
};

const CAMERAS = {
  wide: { target: [0.05, 2.0, -0.6], dist: 9.2, yaw: 2, pitch: 2.5, fov: 46, aspect: 0.46, shadowCenter: [0, 0, -1.4], shadowRadius: 8.5 },
  two: { target: [0, 1.12, 0.6], dist: 6.0, yaw: -14, pitch: 5, fov: 31, aspect: 0.46, shadowCenter: [0, 0, 0.3], shadowRadius: 3.8 },
  close: { target: [0.02, 0.86, 0.8], dist: 3.9, yaw: 19, pitch: 3, fov: 28, aspect: 0.46, shadowCenter: [0, 0, 0.5], shadowRadius: 2.6 },
  low: { target: [0.05, 2.5, -0.9], dist: 6.6, yaw: -5, pitch: -13, fov: 56, aspect: 0.46, shadowCenter: [0, 0, -1.2], shadowRadius: 8 },
  stage: { target: [0, 1.15, 0.2], dist: 9.8, yaw: -11, pitch: 6.5, fov: 26, aspect: 1.95, shadowCenter: [0, 0, -1], shadowRadius: 8, outline: 0.7 },
  landscape: { target: [0, 2.1, -1.6], dist: 10.6, yaw: 4, pitch: 3, fov: 42, aspect: 1.6, shadowCenter: [0, 0, -1.6], shadowRadius: 10 },
};

const bx = (w, h, d, x, y, z, c, rx = 0, ry = 0, rz = 0) => tint(place(box(w, h, d), x, y, z, rx, ry, rz), c);

function build(engine = null, { light: lightName = 'day', low = false } = {}) {
  const { name: light, L } = pickLight('exchange-floor', LIGHTS, ownLight(LIGHTS, ALIAS, lightName));
  const M = ch5Materials(), r = rng(5252);
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  const WL = wing(-1, BW, BACK, FW, WING_Z), WR = wing(1, BW, BACK, FW, WING_Z);

  // ---- the hall
  const room = group('room');
  room.add(node('floor', paving({ w: 22, d: 13, nx: 11, nz: 8, colors: L.floor, grout: L.grout, seed: 2 }), M.flat, { pos: [0, 0, BACK + 6.5] }));
  const FAN = { x: 0, w: 4.4, sill: 5.55, top: 7.75, arch: true }, SIDE = [{ x: -4.7, w: 1.5, sill: 3.0, top: 7.0, arch: true }, { x: 4.7, w: 1.5, sill: 3.0, top: 7.0, arch: true }];
  room.add(node('back', wall({ w: BW * 2 + 0.4, h: H, t: 0.4, color: L.wall[0], openings: [FAN, ...SIDE] }), M.wall, { pos: [0, 0, BACK] }));
  room.add(node('wing-l', wall({ w: WL.len + 0.3, h: H, t: 0.4, color: L.wall[1] }), M.wall, { pos: WL.pos, rot: [0, WL.yaw, 0] }));
  room.add(node('wing-r', wall({ w: WR.len + 0.3, h: H, t: 0.4, color: L.wall[1] }), M.wall, { pos: WR.pos, rot: [0, WR.yaw, 0] }));
  room.add(node('ceiling', ceiling({ w: 22, d: 12, color: TL.royal, beams: 7, beam: TL.navy, bw: 0.36, bh: 0.4 }), M.wall, { pos: [0, H, BACK + 6] }));
  // a teal dado with a brass rail round the hall, and a brass string course under the windows
  room.add(node('dado', merge(bx(BW * 2, GAL_Y, 0.08, 0, GAL_Y / 2, BACK + 0.04, TL.teal), bx(BW * 2, 0.12, 0.12, 0, 5.3, BACK + 0.05, TL.brass)), M.wall));
  for (const W of [WL, WR]) room.add(node('dado-w', merge(bx(W.len, 1.5, 0.08, 0, 0.75, 0.04, TL.teal), bx(W.len, 0.1, 0.12, 0, 1.55, 0.05, TL.brass), bx(W.len, 0.12, 0.12, 0, 5.3, 0.05, TL.brass)), M.wall, { pos: W.pos, rot: [0, W.yaw, 0] }));
  // three arches under the gallery: the ways out, lit from beyond (runners go by the east one)
  const ARCH = [-3.6, 0, 3.6];
  for (const x of ARCH) {
    const pts = [[-0.75, 0]]; for (let i = 0; i <= 8; i++) { const a = Math.PI * (1 - i / 8); pts.push([Math.cos(a) * 0.75, 1.05 + Math.sin(a) * 0.72]); } pts.push([0.75, 0]);
    room.add(node('arch', merge(setOutline(setGlow(tint(place(extrude(pts, 0.04, { crease: 30 }), x, 0, BACK + 0.1), '#ffc468'), L.arch), 0.4), bx(0.16, 1.1, 0.14, x - 0.83, 0.55, BACK + 0.12, TL.stone), bx(0.16, 1.1, 0.14, x + 0.83, 0.55, BACK + 0.12, TL.stone), bx(0.5, 0.12, 0.05, x, 0.6, BACK + 0.14, '#ffe6a8')), M.wall));
  }
  // what the fan window throws down the aisle
  room.add(node('patch', lightPatch({ w: 3.4, d: 2.6, panes: 4, rows: 2, shear: 0.12, color: L.patch, glow: 0.5 }), M.flat, { pos: [0.3, 0.02, -2.1] }));
  scene.root.add(mergeStatic(room, 'room'));

  // ---- props: gallery, board, windows, pits, standards, lamps
  const props = group('props'), deco = group('deco');
  props.add(node('gallery', merge(bx(BW * 2, 0.22, GAL_D, 0, GAL_Y - 0.11, BACK + GAL_D / 2, TL.woodPale), bx(BW * 2, 0.14, 0.14, 0, GAL_Y - 0.3, BACK + GAL_D - 0.07, TL.wood)), M.prop));
  const post = fatColumn({ h: GAL_Y - 0.22, r: 0.2, color: TL.stone, seg: 7 });
  for (const x of [-5.6, -1.8, 1.8, 5.6]) props.add(node('gal-post', post, M.prop, { pos: [x, 0, BACK + GAL_D - 0.2] }));
  deco.add(node('gal-rail', ironRail({ len: BW * 2 - 0.4, h: 0.6, bay: 0.82, knobs: false }), M.deco, { pos: [0, GAL_Y, BACK + GAL_D - 0.1] }));
  deco.add(node('ladder', merge(bx(0.06, 2.5, 0.06, -0.25, 1.2, 0, TL.woodDark, 0, 0, 0), bx(0.06, 2.5, 0.06, 0.25, 1.2, 0, TL.woodDark), ...[0, 1, 2, 3, 4, 5].map((i) => bx(0.5, 0.05, 0.05, 0, 0.3 + i * 0.36, 0, TL.wood))), M.deco, { pos: [-2.6, 0, BACK + GAL_D + 0.45], rot: [-18, 0, 0] }));
  const BOARD = [0, GAL_Y + 0.45, BACK + 0.12];
  const boardMesh = priceBoard({ w: 4.2, h: 2.45, rows: 6, seed: 4, slate: '#222a66', frame: TL.brassDark });
  deco.add(node('board', boardMesh, M.deco, { pos: BOARD }));
  deco.add(node('fan', windowFrame({ w: FAN.w, h: FAN.top - FAN.sill, color: TL.navy, bars: 0, transom: false, fan: L.fan, glow: L.glass, depth: 0.4, sillOut: 0.2 }), M.deco, { pos: [FAN.x, FAN.sill, BACK] }));
  for (const S of SIDE) deco.add(node('side-window', merge(windowFrame({ w: S.w, h: S.top - S.sill, color: TL.navy, bars: 1, fan: ['#7fe6d2', '#ffd65a', '#7fe6d2'], glow: L.glass, depth: 0.4 }), setOutline(setGlow(bx(S.w - 0.1, S.top - S.sill - S.w / 2, 0.02, 0, (S.top - S.sill - S.w / 2) / 2, -0.3, L.side), 0.75), 0)), M.deco, { pos: [S.x, S.sill, BACK] }));
  for (const p of PITS) {
    props.add(node('pit-' + p.name, pit({ r: PIT_R, floor: p.floor, gate: p.x < 0 ? 60 : -60 }), M.prop, { pos: [p.x, 0, p.z] }));
    props.add(node('standard', standard({ h: 3.5, color: p.color, side: p.x < 0 ? 1 : -1 }), M.prop, { pos: [p.x - Math.sign(p.x) * 1.55, 0.34, p.z - 1.0] }));
  }
  // hanging lamps either side of the board
  const lan = lantern({ s: 2.3, lit: true, metal: TL.brassDark }), LAN = [[-2.75, 5.0, -4.3], [2.75, 5.0, -4.3]];
  for (const p of LAN) deco.add(node('lamp', merge(lan, bx(0.03, H - p[1], 0.03, 0, (H - p[1]) / 2, 0, TL.brassDark)), M.deco, { pos: p }));
  const lanPos = LAN.map((p) => [p[0], p[1] - 0.7, p[2]]);
  // evening: the day's slips, in heaps
  if (light === 'evening') for (const [x, z, s] of [[-2.0, -2.6, 1], [1.6, -3.3, 0.8], [-4.9, -1.5, 0.7], [5.2, -1.7, 0.9], [0.4, -5.3, 0.7], [-3.5, -3.2, 1.1], [3.4, -3.3, 1.0]]) props.add(node('heap', tint(place(ellipsoid(0.7 * s, 0.2 * s, 0.55 * s, 7, 3), 0, 0.03, 0, 0, r() * 180, 0), TL.paper), M.prop, { pos: [x, 0, z] }));
  scene.root.add(mergeStatic(props, 'props'), mergeStatic(deco, 'deco'));

  // ---- the lapse bar on the board's top row: the one price that moves
  const row0 = boardMesh.anchors.rows[0], LAPSE = [BOARD[0] - 4.2 * 0.16, BOARD[1] + row0[1], BOARD[2] + 0.075];
  const bar = node('lapse-bar', setGlow(tint(place(box(1, 0.17, 0.03), 0.5, 0, 0), '#ffd24a'), 0.6), M.deco, { pos: LAPSE }); bar.castShadow = false; scene.root.add(bar);

  // ---- light through the glass
  const shaftMat = GLmaterial({ kind: 'beam', name: 'floor-shaft', beam: { power: 0.6, near: L.shaftNear, far: 0.02, steps: 0 }, outline: false });
  if (!low) scene.root.add(node('shafts', merge(
    place(shaft({ w: 3.4, h: 1.5, dir: [0.06, -1, 0.72], len: 7.6, cards: 4, color: L.shaft, spread: 0.2 }), FAN.x, FAN.sill + 1.0, BACK + 0.1),
    place(shaft({ w: 1.2, h: 2.6, dir: [0.5, -1, 0.9], len: 5.2, cards: 2, color: L.shaft }), SIDE[0].x, 5.2, BACK + 0.1),
    place(shaft({ w: 1.2, h: 2.6, dir: [-0.5, -1, 0.9], len: 5.2, cards: 2, color: L.shaft }), SIDE[1].x, 5.2, BACK + 0.1)), shaftMat));

  // ---- the floor: traders round the pits with slips up, clerks on the gallery
  const spots = [];
  for (const p of PITS) for (let i = 0; i < (low ? 10 : 15); i++) {
    const a = (i / (low ? 10 : 15)) * 6.283 + r() * 0.3, ring = i % 3, rad = [0.55, 1.15, 1.72][ring], x = p.x + Math.sin(a) * rad, z = p.z + Math.cos(a) * rad;
    if (z > -1.55) continue;
    spots.push({ pos: [x, [0.02, 0.19, 0.36][ring], z], face: Math.atan2(p.x - x, p.z - z) / DEG * 0.55 + (r() - 0.5) * 30 });
  }
  for (const x of [-4.4, -1.2, 1.5, 4.6]) spots.push({ pos: [x, GAL_Y, BACK + 0.62], face: (r() - 0.5) * 40 });
  for (const [x, z] of [[-6.2, -1.9], [6.3, -2.2], [-1.3, -5.3], [1.5, -5.5], [-6.6, -4.6], [6.6, -4.4]]) spots.push({ pos: [x, 0, z], face: -x * 6 });
  const crowd = throng({ spots, material: M.deco, seed: 5, detail: low ? 0 : 1, arm: 'slip', amount: L.crowd, colors: ['#f4573f', '#35c9b5', '#ffd24a', '#3f78e0', '#8a6be0', '#2fba7e', '#ff9a3c', '#e86a9a', '#3a4a9a', '#fff1d0'] });
  scene.root.add(...crowd.nodes);
  // slips: coming down all day; lying in drifts after the bell
  const falling = papers({ count: light === 'day' ? (low ? 8 : 16) : 3, box: [-5.4, 5.4, 0.2, 5.6, -5.6, -1.6], mode: 'fall', material: M.paper, seed: 3, size: 0.13 });
  scene.root.add(falling.node);
  const drifts = light === 'evening' ? papers({ count: low ? 40 : 90, box: [-6.4, 6.4, 0, 0, -5.9, 2.9], mode: 'lie', material: M.paper, seed: 9, size: 0.2 }) : null;
  if (drifts) scene.root.add(drifts.node);

  // ---- foreground: a runner's stool and a crate of blank slips
  const fg = group('fg');
  fg.add(node('fg-stool', stool({ color: TL.wood, seat: TL.teal }), M.prop, { pos: [-1.8, 0, 3.0], scale: 1.25 }), node('fg-crate', crate({ s: 0.5, seed: 3, color: TL.woodPale }), M.prop, { pos: [1.8, 0, 3.05], rot: [0, -20, 0] }), node('fg-slips', bx(0.4, 0.1, 0.3, 1.8, 0.56, 3.05, TL.paper, 0, -12, 0), M.prop));
  const foreground = mergeStatic(fg, 'foreground'); scene.root.add(foreground);
  const actors = group('actors'); scene.root.add(actors);

  // ---- lamps and halos
  const lamps = [
    { name: 'lamp-l', pos: lanPos[0], color: '#ffc060', radius: 7.5, base: 1.0 },
    { name: 'lamp-r', pos: lanPos[1], color: '#ffc060', radius: 7.5, base: 1.0 },
    { name: 'arches', pos: [0, 1.2, BACK + 1.6], color: '#ffb050', radius: 6.5, base: 0.9 },
    { name: 'window', pos: [0.2, 2.4, -2.2], color: light === 'day' ? '#fff0b0' : '#ff9a50', radius: 6.0, base: light === 'day' ? 0.5 : 0.9, flicker: 0 },
  ];
  const sprites = scene.sprites = createSprites(low ? 96 : 256), glows = [];
  lanPos.forEach((p) => glows.push({ sprite: sprites.add({ kind: 'glow', pos: p, size: 2.2, color: '#ffb450', alpha: 0 }), base: 0.5 }));
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: [0, FAN.sill + 1.2, BACK + 0.3], size: 4.2, color: L.shaft, alpha: 0 }), base: 0.26, fixed: true });
  for (const x of ARCH) glows.push({ sprite: sprites.add({ kind: 'glow', pos: [x, 1.1, BACK + 0.3], size: 2.0, color: '#ffb450', alpha: 0 }), base: 0.3, fixed: true });

  // ---- per-frame
  const P = [0, 0, 0], rnd = rng(71);
  let mood = L.mood, lapse = light === 'day' ? 0.31 : 0.52, shown = lapse, nextSpark = 0;
  const setCrowd = (a) => crowd.setAmount(a), setMood = (m) => { mood = Math.max(0, Math.min(1, m)); };
  function setLapse(v) { lapse = Math.max(0, Math.min(1, v)); }
  const CUES = {
    'ch5.s1.c01': () => { setCrowd(1); setMood(0.7); setLapse(0.31); }, 'ch5.s1.c03': () => { setMood(1); setLapse(0.4); }, 'ch5.s1.c05': () => setMood(0.6), 'ch5.s1.c10': () => { setMood(0.9); setLapse(0.35); },
    'ch5.s1.c14': () => setMood(0), 'ch5.s1.c15': () => { setMood(1); setLapse(0.55); }, 'ch5.s1.c16': () => setCrowd(0.82), 'ch5.s1.c26': () => { setMood(0.4); setLapse(0.52); }, 'ch5.s3.c01': () => { setCrowd(0); setMood(0); setLapse(0.52); },
  };
  const cue = (id) => { const f = CUES[id]; if (f) f(); return !!f; };
  function tick(time, dt, pw, live) {
    crowd.update(time, dt, { lively: mood });
    falling.update(time); if (drifts) drifts.update(time);
    const before = shown; shown += (lapse - shown) * Math.min(1, dt * 4 + (dt === 0 ? 1 : 0));
    bar.scale[0] = 0.25 + shown * 2.6; const up = lapse >= 0.45; bar.tint[0] = up ? 1 : 0.6; bar.tint[1] = up ? 0.62 : 1; bar.tint[2] = up ? 0.5 : 0.82;
    if (!live) return;
    if (Math.abs(shown - before) > 0.0015 && time > nextSpark) { nextSpark = time + 0.12; P[0] = LAPSE[0] + bar.scale[0]; P[1] = LAPSE[1]; P[2] = LAPSE[2] + 0.1; sprites.puff(P, { count: 1, size: 0.22, rise: 0.2, spread: 0.1, life: 0.8, color: '#f4f8ff' }); }
  }

  // ---- what the live stage asks for (kit-ch5 taskUnit)
  //   'price-board'   ch5.s1: the floor as the hearing is opened: the pits roaring, and the lapse-bond bar on the board
  //                   stepping up every time the objective does (it stands at 0.31 when the cutscene begins)
  //   'sell-slips'    ch5.s3: a cord between two posts with the sell slips Ren has matched pegged along it, nine by the end
  // setback(): the floor roars and the bar jumps (s1); a draught takes two slips off the cord (s3)
  let boardUnit = null, slipUnit = null, surge = 0;
  function task(type) {
    if (type === 'price-board') return boardUnit || (boardUnit = taskUnit([PITS[1].x - 1.55, 1.0, PITS[1].z + 1.75], null, (v, time, dt) => { surge = Math.max(0, surge - (dt || 0) / 2.2); setCrowd(1); setMood(Math.min(1, 1 - 0.3 * v + 0.4 * surge)); setLapse(0.19 + 0.12 * v + 0.14 * surge); }));
    if (type === 'sell-slips') {
      if (slipUnit) return slipUnit;
      const N = 9, X0 = 0.72, DX = 0.235, Y = 1.3, Z = 0.12, xr = X0 + (N - 1) * DX;
      const line = node('slip-line', merge(tint(place(cylinder(0.035, 0.045, Y + 0.08, 6), X0 - 0.2, (Y + 0.08) / 2, Z), TL.wood), tint(place(cylinder(0.035, 0.045, Y + 0.08, 6), xr + 0.2, (Y + 0.08) / 2, Z), TL.wood), tint(place(box(xr - X0 + 0.4, 0.02, 0.02), (X0 + xr) / 2, Y, Z), TL.iron)), M.prop); line.castShadow = false;
      const slips = node('sell-slips', setGlow(tint(box(1, 1, 1), TL.paper), 0.45), M.paper); slips.castShadow = false; slips.instances = makeInstances(N);
      const q = quat.create(), rr = rng(19);
      for (let k = 0; k < N; k++) { const o = k * 20; m4.fromTRS(slips.instances.data.subarray(o, o + 16), [X0 + k * DX, Y - 0.17 - rr() * 0.02, Z + 0.02], quat.fromEuler(q, 0, 0, (rr() - 0.5) * 0.24), [0.17, 0.27, 0.012]); const c = k % 3 === 1 ? [1, 0.82, 0.8] : k % 3 === 2 ? [0.82, 0.96, 1] : [1, 0.98, 0.9]; slips.instances.data.set([c[0], c[1], c[2], 1], o + 16); }
      scene.root.add(line, slips);
      const u = taskUnit([X0, Y - 0.15, Z + 0.1], [X0 - 0.45, 0.62], (v, time, dt) => {
        surge = Math.max(0, surge - (dt || 0) / 2.2);
        const n = Math.max(0, Math.round(N * v) - (surge > 0.05 ? 2 : 0)); slips.instances.count = n; slips.visible = n > 0; slips.instances.dirty = true;
        const next = Math.min(N - 1, n); u.pos[0] = X0 + next * DX; u.stand[0] = Math.min(1.9, u.pos[0] - 0.45);
        setCrowd(0); setMood(0);
      });
      return (slipUnit = u);
    }
    return null;
  }
  const setback = () => { surge = 1; };

  return shell({
    id: 'exchange-floor', light, L, scene, cameras: CAMERAS, actors, foreground, lamps, glows, tick, dim: 0.45,
    motes: low ? null : { box: [-2.6, 2.8, 0.6, 5.4, -5.6, -0.6], every: 0.3, color: L.mote, size: 0.07, vel: [0.03, -0.03, 0.05], life: 6, alpha: 0.75 },
    marks: {
      ...MARKS, extras: light === 'evening' ? [{ pos: [-0.75, 0, 0.2], face: 62 }] : null,     // evening (ch5.s3): Sable, a few paces behind Ren
      board: [BOARD[0], BOARD[1] + 1.2, BOARD[2]], lapse: LAPSE, focus: [0, FAN.sill + 1.0, BACK],
      salt: { pos: [PITS[0].x + 1.5, 0, PITS[0].z + 1.5], face: -140 }, bond: { pos: [PITS[1].x - 1.5, 0, PITS[1].z + 1.5], face: 140 },
    },
    extra: { setCrowd, setMood, setLapse, cue, task, setback, passLamp: setback },
  });
}

export const exchangeFloor = { id: 'exchange-floor', lights: lightNames(LIGHTS, ALIAS), cameras: Object.keys(CAMERAS), build };
export default exchangeFloor;
