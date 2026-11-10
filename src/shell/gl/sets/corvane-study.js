// SET: corvane-study. Chancellor Corvane's private room on the hill above Tallis: one window (rain, the roofs
// of the city, and a customs shed standing exactly where Ropewalk would be), one table, and on the table all of
// Aurelle in brass on a slate sea: forty islands on stems with a small lamp on each, twenty-nine of them lit.
// A long-case clock, one chair, a curtain drawn back. The model is the light of the room.
// Chapter 5: ch5.s2 The Chancellor's Arithmetic (rain), ch5.epi.02..07 (night: he puts out one more with his
// thumb). Also ch6.epi.16, ch7.epi.16, ch8.s4 and ch8.mepi.18: he carries the model with him.
//
//   import { corvaneStudy } from './sets/corvane-study.js';
//   const set = corvaneStudy.build(GL, { light: 'rain' | 'night', low: false });
//
// Same shape as sets/lantern-stalls.js. Figures face +Z, cameras look toward -Z, the strip x -4.4..4.4,
// z 0..1.6 is clear. The table stands behind the strip, a little right of centre, so it shows over the heads.
//
// What this set can do for its story:
//   setDark(n, instant?)   how many of the forty lamps are out (11 by default; the order is fixed, so 12 is always the same one)
//   snuff()                one more, with a thread of smoke: ch5.epi.06
//   cue(lineId)            ch5.s2.c01 (eleven dark), ch5.epi.02 (eleven), ch5.epi.06 (twelve)
//   litCount()             lamps still burning
// marks: a, b, c, two, party, opposition as everywhere, plus
//   model (world point: the middle of the sea)   window { pos, face }: where he stands all day   guest { pos, face }: the chair
//   lamps40 [[x, y, z]]: every small lamp, in index order   focus = model

import { m4, quat, rng, DEG } from '../math.js';
import { merge, tint, place, box, cylinder, setGlow, setOutline } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic, makeInstances } from '../scene.js';
import { createSprites } from '../sprites.js';
import { pickLight } from './kit.js';
import { wall, windowFrame, lightPatch, skyline, ceiling, boards, wainscot, curtain, rug, chair, doorway, sconce, wing } from './kit-b.js';
import { TL, MARKS, ch5Materials, shell, norm, rain, shaft, islandTable, longClock, pendulum, lightNames, ownLight, taskUnit } from './kit-ch5.js';

const BW = 4.3, BACK = -4.3, FW = 6.8, WING_Z = 2.4, H = 5.4;
const DARK = [2, 7, 9, 13, 18, 24, 26, 31, 33, 36, 39, 15, 28, 5, 21, 11, 37, 3, 30, 17, 23, 8, 34, 12, 27, 6, 38, 19, 14, 29, 22, 4, 35, 10, 32, 16, 25, 20, 1, 0];

// core light names (core/stage.js) this set answers besides its own
const ALIAS = { interior: 'rain', day: 'rain', dusk: 'rain' };

const LIGHTS = {
  rain: {
    preset: 'night', power: 1,
    env: {
      key: { dir: norm([-0.38, 0.7, 0.6]), color: '#cfc8ff' },
      shadow: { tint: '#4844b6', lift: 0.11, saturate: 1.4 },
      ambient: { sky: '#8a98f0', ground: '#4a3fa8', amount: 0.16 },
      rim: { color: '#ffd98a', amount: 0.6, edge: 0.75 },
      fog: { density: 0.0008, start: 30, max: 0.6 },
      sky: { zenith: '#5a6cc4', mid: '#8696da', midAt: 0.5, horizon: '#b4c0ee', below: '#8c98d8', stars: 0, moon: 0, glowAmount: 0, sunDir: norm([0.4, 0.5, -1]) },
      water: null,
    },
    shaft: '#b8c8ff', patch: '#a8bcf4', pane: '#aebcf0', rain: 70, town: ['#5a66c0', '#6c78d0'], townLit: '#ffd88a', wall: ['#6468d2', '#5a5ec8'],
  },
  night: {
    preset: 'night', power: 1.1,
    env: {
      key: { dir: norm([-0.38, 0.7, 0.6]), color: '#7684ea' },
      shadow: { tint: '#2f34a0', lift: 0.11, saturate: 1.35 },
      ambient: { sky: '#5a6ee0', ground: '#30308e', amount: 0.16 },
      rim: { color: '#ffd98a', amount: 0.7, edge: 0.75 },
      fog: { density: 0.0008, start: 30, max: 0.6 },
      sky: { zenith: '#0c1a70', mid: '#20389e', midAt: 0.45, horizon: '#4a62d8', below: '#2c3aa0', stars: 0.8, moon: 0.6, sunDir: norm([-0.25, 0.42, -1]) },
      water: null,
    },
    shaft: '#8fa6ff', patch: '#8098f0', pane: '#3a4cb8', rain: 0, town: ['#2f3c9c', '#3c4ab0'], townLit: '#ffd070', wall: ['#565ccc', '#4c52c0'],
  },
};

const CAMERAS = {
  wide: { target: [-0.05, 1.72, -0.5], dist: 8.4, yaw: 0, pitch: 5, fov: 44, aspect: 0.46, shadowCenter: [0, 0, -1.2], shadowRadius: 7 },
  two: { target: [0, 1.12, 0.6], dist: 6.0, yaw: -15, pitch: 5, fov: 31, aspect: 0.46, shadowCenter: [0, 0, 0.3], shadowRadius: 3.6 },
  close: { target: [0.02, 0.86, 0.8], dist: 3.9, yaw: 21, pitch: 3, fov: 28, aspect: 0.46, shadowCenter: [0, 0, 0.5], shadowRadius: 2.6 },
  low: { target: [0.3, 1.5, -0.9], dist: 5.6, yaw: -8, pitch: -7, fov: 54, aspect: 0.46, shadowCenter: [0, 0, -1], shadowRadius: 7 },
  stage: { target: [0, 1.1, 0.2], dist: 9.6, yaw: -9, pitch: 6, fov: 26, aspect: 1.95, shadowCenter: [0, 0, -0.8], shadowRadius: 7, outline: 0.7 },
  landscape: { target: [0, 1.7, -1.2], dist: 9.4, yaw: 4, pitch: 5, fov: 40, aspect: 1.6, shadowCenter: [0, 0, -1.5], shadowRadius: 9 },
};

const bx = (w, h, d, x, y, z, c, rx = 0, ry = 0, rz = 0) => tint(place(box(w, h, d), x, y, z, rx, ry, rz), c);

function build(engine = null, { light: lightName = 'rain', low = false } = {}) {
  const { name: light, L } = pickLight('corvane-study', LIGHTS, ownLight(LIGHTS, ALIAS, lightName));
  const M = ch5Materials(); M.shaft.beam.near = 0.15;   // rain light: a haze, not a spotlight
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  const WL = wing(-1, BW, BACK, FW, WING_Z), WR = wing(1, BW, BACK, FW, WING_Z);

  // ---- the room: periwinkle plaster over a deep teal dado beaded in brass, warm boards, a navy ceiling
  const room = group('room');
  room.add(node('floor', place(boards({ w: 18, d: 16, n: 18, colors: ['#e8a070', '#dc9060', '#f0ac7c'], seed: 4 }), 0, 0, 1.6), M.flat));
  const WIN = { x: -0.75, w: 2.2, sill: 1.25, top: 4.75, arch: true }, DADO = 1.45;
  room.add(node('back', wall({ w: BW * 2 + 0.4, h: H, t: 0.4, color: L.wall[0], openings: [WIN] }), M.wall, { pos: [0, 0, BACK] }));
  const DOOR = { x: 0.4, w: 1.4, sill: 0, top: 2.6 };
  room.add(node('wing-l', wall({ w: WL.len + 0.3, h: H, t: 0.4, color: L.wall[1] }), M.wall, { pos: WL.pos, rot: [0, WL.yaw, 0] }));
  room.add(node('wing-r', wall({ w: WR.len + 0.3, h: H, t: 0.4, color: L.wall[1], openings: [DOOR] }), M.wall, { pos: WR.pos, rot: [0, WR.yaw, 0] }));
  const PAN = { color: TL.tealDark, panel: TL.teal, bead: TL.brass, rail: '#167486' };
  room.add(node('dado-bl', wainscot({ w: BW + WIN.x - WIN.w / 2 - 0.1, h: DADO, n: 2, ...PAN }), M.wall, { pos: [(-BW + WIN.x - WIN.w / 2 - 0.1) / 2, 0, BACK] }));
  room.add(node('dado-sill', bx(WIN.w + 0.2, WIN.sill - 0.04, 0.07, WIN.x, (WIN.sill - 0.04) / 2, BACK + 0.035, TL.tealDark), M.wall));
  room.add(node('dado-br', wainscot({ w: BW - WIN.x - WIN.w / 2 - 0.12, h: DADO, n: 4, ...PAN }), M.wall, { pos: [(BW + WIN.x + WIN.w / 2 + 0.12) / 2, 0, BACK] }));
  room.add(node('dado-l', wainscot({ w: WL.len, h: DADO, n: 5, ...PAN }), M.wall, { pos: WL.pos, rot: [0, WL.yaw, 0] }));
  for (const [x0, x1] of [[-WR.len / 2, DOOR.x - DOOR.w / 2 - 0.14], [DOOR.x + DOOR.w / 2 + 0.14, WR.len / 2]]) room.add(node('dado-r', wainscot({ w: x1 - x0, h: DADO, n: Math.max(1, Math.round((x1 - x0) / 1.3)), ...PAN }), M.wall, { pos: WR.at((x0 + x1) / 2), rot: [0, WR.yaw, 0] }));
  room.add(node('cornice', merge(bx(BW * 2, 0.16, 0.16, 0, H - 0.5, BACK + 0.08, TL.brass), bx(BW * 2, 0.4, 0.1, 0, H - 0.22, BACK + 0.05, '#6a5cd0')), M.wall));
  room.add(node('ceiling', ceiling({ w: 15, d: 8, color: TL.navy, beams: 5, beam: '#1c2658', bw: 0.3, bh: 0.3 }), M.wall, { pos: [0, H, BACK + 4] }));
  room.add(node('patch', lightPatch({ w: 2.0, d: 2.8, panes: 3, shear: -0.3, color: L.patch, glow: 0.42 }), M.flat, { pos: [WIN.x + 0.9, 0.02, BACK + 2.4] }));
  scene.root.add(mergeStatic(room, 'room'));

  // ---- the window, the curtain, the clock, the chair, the way out
  const props = group('props'), deco = group('deco');
  deco.add(node('window', windowFrame({ w: WIN.w, h: WIN.top - WIN.sill, color: TL.navy, bars: 2, fan: null, depth: 0.42, sillOut: 0.22 }), M.deco, { pos: [WIN.x, WIN.sill, BACK] }));
  deco.add(node('curtain', curtain({ w: 0.7, h: 3.9, color: TL.wine, side: -1 }), M.deco, { pos: [WIN.x - WIN.w / 2 - 0.1, WIN.top + 0.3, BACK + 0.32] }));
  deco.add(node('curtain-r', curtain({ w: 0.5, h: 3.9, color: TL.wine, side: 1 }), M.deco, { pos: [WIN.x + WIN.w / 2 + 0.06, WIN.top + 0.3, BACK + 0.32] }));
  deco.add(node('rod', merge(bx(WIN.w + 1.7, 0.08, 0.08, WIN.x, WIN.top + 0.36, BACK + 0.32, TL.brass)), M.deco));
  const CLOCK = [2.85, 0, BACK + 0.36], clock = longClock({ h: 3.0, w: 0.7, color: TL.wine });
  props.add(node('clock', clock, M.prop, { pos: CLOCK }));
  const sc = sconce({ s: 1.5 }), SCONCE = [[WIN.x - WIN.w / 2 - 1.0, 2.75, BACK + 0.08], [WIN.x + WIN.w / 2 + 0.95, 2.75, BACK + 0.08]];
  for (const p of SCONCE) deco.add(node('sconce', sc, M.deco, { pos: p }));
  const GUEST = [-2.35, 0, -1.25];
  props.add(node('chair', chair({ high: true, s: 1.3, color: TL.brassDark, seat: TL.wine }), M.prop, { pos: GUEST, rot: [0, 62, 0] }));
  const door = doorway({ w: 1.3, h: 2.5, open: 48, color: TL.wine, frame: TL.brass, side: -1 });
  props.add(node('door', door, M.prop, { pos: WR.at(DOOR.x, 0), rot: [0, WR.yaw, 0] }));
  // the umbrella he will hold over her, in its stand by the door
  props.add(node('umbrella', merge(tint(place(cylinder(0.2, 0.17, 0.6, 8), 0, 0, 0), TL.brassDark), tint(place(cylinder(0.035, 0.07, 0.95, 6), 0.03, 0.2, 0, 0, 0, -6), TL.navy), tint(place(cylinder(0.02, 0.02, 0.3, 4), 0.14, 1.12, 0, 0, 0, -6), TL.woodDark)), M.prop, { pos: WR.at(DOOR.x - 1.25, 0.35) }));
  // one picture: the Circuit, as the Mint draws it
  deco.add(node('chart', merge(bx(1.5, 1.1, 0.07, 0, 0, 0.035, TL.brass), bx(1.32, 0.92, 0.02, 0, 0, 0.075, '#3a56c8'), ...[[-0.4, 0.2], [0.1, 0.28], [0.42, -0.05], [-0.1, -0.22], [-0.5, -0.2], [0.3, -0.3]].map(([x, y]) => setGlow(tint(place(cylinder(0.05, 0.05, 0.02, 6), x, y, 0.09, 90, 0, 0), '#ffe27a'), 0.7))), M.deco, { pos: [WIN.x + WIN.w / 2 + 1.95, 3.55, BACK + 0.03], rot: [0, 0, -2] }));
  // tall panels beaded in brass, so the wall is not one field
  { const fr = (x, y, w, h) => merge(bx(w, 0.05, 0.03, x, y + h / 2, BACK + 0.02, TL.brass), bx(w, 0.05, 0.03, x, y - h / 2, BACK + 0.02, TL.brass), bx(0.05, h, 0.03, x - w / 2, y, BACK + 0.02, TL.brass), bx(0.05, h, 0.03, x + w / 2, y, BACK + 0.02, TL.brass), bx(w - 0.12, h - 0.12, 0.012, x, y, BACK + 0.012, '#7478de'));
    deco.add(node('panels', merge(fr(-3.25, 3.1, 1.5, 2.9), fr(1.55, 3.2, 1.6, 2.7), fr(3.5, 3.1, 1.1, 2.9)), M.deco)); }
  props.add(node('rug', rug({ w: 5.4, d: 3.0, field: TL.plumDark, border: TL.brass, line: TL.parchment, medallion: TL.wine }), M.deco, { pos: [0, 0, 0.6], rot: [0, 2, 0] }));

  // ---- the table
  const TABLE = [0.55, 0, -2.25], dark0 = DARK.slice(0, 11);
  const T = islandTable({ r: 1.38, h: 0.95, dark: dark0 });
  props.add(node('table', T.table, M.prop, { pos: TABLE }));
  scene.root.add(mergeStatic(props, 'props'), mergeStatic(deco, 'deco'));
  const spots = T.spots.map((p) => [TABLE[0] + p[0], p[1], TABLE[2] + p[2]]);
  const lampNode = node('model-lamps', T.lamp, M.lantern); lampNode.castShadow = false; lampNode.instances = makeInstances(40); lampNode.instances.count = 40; scene.root.add(lampNode);
  const MODEL = [TABLE[0], 1.05, TABLE[2]];

  // ---- outside: roofs in the rain, and the shed in the way
  const out = group('outside');
  out.add(node('town', skyline({ w: 11, h: 2.4, seed: 21, color: L.town[0], color2: L.town[1], lit: L.townLit, glow: light === 'night' ? 0.95 : 0.6, lanterns: light === 'night' }), M.speck, { pos: [WIN.x, 0.5, BACK - 4.4] }));
  out.add(node('shed', merge(bx(2.6, 1.9, 0.5, 0, 0.95, 0, light === 'night' ? '#1c2466' : '#3f4aa0'), bx(2.9, 0.2, 0.7, 0, 1.95, 0, light === 'night' ? '#161c54' : '#343e90')), M.speck, { pos: [WIN.x + 0.3, 1.0, BACK - 2.6] }));
  out.add(node('pane', setOutline(setGlow(bx(WIN.w + 0.2, WIN.top - WIN.sill + 0.2, 0.02, WIN.x, (WIN.top + WIN.sill) / 2, BACK - 8, L.pane), 0.6), 0), M.speck));
  scene.root.add(mergeStatic(out, 'outside'));
  if (!low) scene.root.add(node('shafts', place(shaft({ w: WIN.w * 0.8, h: (WIN.top - WIN.sill) * 0.7, dir: [0.34, -1, 0.9], len: 5.2, cards: 3, color: L.shaft }), WIN.x, (WIN.sill + WIN.top) / 2, BACK + 0.05), M.shaft));

  // ---- foreground: the back of the chair nobody has offered anyone, a side table
  const fg = group('fg');
  fg.add(node('fg-chair', chair({ s: 1.15, color: TL.brassDark, seat: TL.wine }), M.prop, { pos: [-1.7, 0, 3.0], rot: [0, 165, 0] }), node('fg-table', merge(tint(cylinder(0.3, 0.26, 0.05, 10), TL.woodDark), tint(place(cylinder(0.045, 0.04, 0.55, 6), 0, 0.05, 0), TL.brass), tint(place(cylinder(0.36, 0.36, 0.05, 12), 0, 0.6, 0), TL.woodDark), bx(0.3, 0.05, 0.22, 0, 0.67, 0, TL.parchment, 0, 20, 0)), M.prop, { pos: [1.7, 0, 2.95] }));
  const foreground = mergeStatic(fg, 'foreground'); scene.root.add(foreground);
  const actors = group('actors'); scene.root.add(actors);

  // ---- lamps
  const sconceAt = SCONCE.map((p) => [p[0] + sc.anchors.lamp[0], p[1] + sc.anchors.lamp[1], p[2] + sc.anchors.lamp[2] + 0.3]);
  const doorLight = WR.at(DOOR.x, -0.9, 1.6);
  const lamps = [
    { name: 'model', pos: [MODEL[0], 1.8, MODEL[2] + 0.5], color: '#ffc870', radius: 7.0, base: 1.5, flicker: 0.04, gain: 1 },
    { name: 'window', pos: [WIN.x + 0.4, 2.5, BACK + 1.7], color: light === 'night' ? '#7f98ff' : '#a8b8ff', radius: 5.0, base: 1.0, flicker: 0 },
    { name: 'sconce-l', pos: sconceAt[0], color: '#ffb860', radius: 3.6, base: 0.9 },
    { name: 'sconce-r', pos: sconceAt[1], color: '#ffb860', radius: 3.6, base: 0.9 },
    { name: 'door', pos: doorLight, color: '#ffa860', radius: 4.4, base: 0.9 },
    { name: 'hearth', pos: [0.6, 2.0, 2.6], color: '#ffc080', radius: 6.5, base: 0.75, flicker: 0.1 },   // the fire is behind the camera: it warms the faces the model lights from behind
  ];
  const sprites = scene.sprites = createSprites(low ? 128 : 320), glows = [];
  const modelGlow = { sprite: sprites.add({ kind: 'glow', pos: [MODEL[0], 1.3, MODEL[2]], size: 4.2, color: '#ffb850', alpha: 0 }), base: 0.5, gain: 1 };
  glows.push(modelGlow);
  for (const p of sconceAt) glows.push({ sprite: sprites.add({ kind: 'glow', pos: p, size: 1.3, color: '#ffb450', alpha: 0 }), base: 0.5 });
  const pin = spots.map((p) => sprites.add({ kind: 'glow', pos: [p[0], p[1] + 0.06, p[2]], size: 0.3, color: '#ffd070', alpha: 0 }));

  // ---- per-frame
  const pend = node('pendulum', pendulum({ len: 1.0 }), M.deco, { pos: [CLOCK[0] + clock.anchors.pendulum[0], clock.anchors.pendulum[1], CLOCK[2] + clock.anchors.pendulum[2]] }); pend.castShadow = false; scene.root.add(pend);
  const state = new Float32Array(40).fill(1), rank = new Int8Array(40); DARK.forEach((idx, k) => { rank[idx] = k; });
  let dark = 11; for (let i = 0; i < 40; i++) state[i] = rank[i] < dark ? 0 : 1;
  const Q = quat.create(), S3 = [1, 1, 1], Mx = m4.create(), P = [0, 0, 0], rnd = rng(81);
  const fall = L.rain > 0 && !low ? rain(sprites, [WIN.x - 1.5, WIN.x + 1.5, WIN.sill - 0.2, WIN.top + 0.4, BACK - 1.9, BACK - 0.5], { rate: L.rain, len: 0.5, speed: 8, slant: 1.4, color: '#dfe8ff', alpha: 0.65 }) : null;
  let smokeAt = -1, smokeT = 0, nextSmoke = 0, nextDrop = 0;
  function setDark(n, instant = false) {
    n = Math.max(0, Math.min(40, Math.round(n)));
    if (n > dark && !instant) { smokeAt = DARK[n - 1]; smokeT = 2.4; }
    dark = n; if (instant) for (let i = 0; i < 40; i++) state[i] = rank[i] < dark ? 0 : 1;
  }
  const snuff = () => setDark(dark + 1);
  const CUES = { 'ch5.s2.c01': () => setDark(11, true), 'ch5.epi.02': () => setDark(11, true), 'ch5.epi.06': () => setDark(12) };
  // chapters 6 to 8 come back to this room after ch5.epi.06: twenty-eight burn and twelve do not
  const LATER = /^(ch6\.epi\.|ch7\.epi\.|ch8\.s4\.|ch8\.mepi\.18)/;
  const cue = (id) => { const f = CUES[id]; if (f) { f(); return true; } if (LATER.test(id)) { if (dark !== 12) setDark(12, true); return true; } return false; };
  // the director calls this when an encounter is set up here. Chapter 5's is the model being lit ('brass-aurelle', below);
  // anybody else's is after the twelfth was put out
  const encounter = (st) => { const o = st && st.opposition; if (!(o && o.kind === 'force' && o.who.includes('brass-aurelle'))) setDark(12, true); };
  function tick(time, dt, pw, live) {
    const d = lampNode.instances.data, on = Math.min(1.2, pw); let lit = 0;
    for (let i = 0; i < 40; i++) {
      const want = rank[i] < dark ? 0 : 1; state[i] += (want - state[i]) * Math.min(1, dt * 9 + (dt === 0 ? 1 : 0));
      const s = state[i], fl = 0.9 + 0.1 * Math.sin(time * (7 + (i % 5)) + i * 1.7), k = s * Math.min(1, on) * fl, o = i * 20;
      S3[0] = S3[1] = S3[2] = i === 0 ? 1.7 : 1; m4.fromTRS(Mx, spots[i], Q, S3); d.set(Mx, o);
      d[o + 16] = 0.2 + 0.8 * k; d[o + 17] = 0.24 + 0.66 * k; d[o + 18] = 0.5 + 0.12 * k; d[o + 19] = 1;
      pin[i].alpha = 0.75 * k * (i === 0 ? 1.2 : 1); pin[i].size[0] = pin[i].size[1] = (i === 0 ? 0.55 : 0.3) * (0.92 + 0.08 * fl);
      lit += s;
    }
    lampNode.instances.dirty = true;
    lamps[0].gain = 0.25 + 0.75 * lit / 29; modelGlow.gain = 0.3 + 0.7 * lit / 29;
    pend.setRot(0, 0, Math.sin(time * 2.6) * 7);
    if (!live) return;
    if (fall) fall(time, dt);
    if (smokeT > 0) { smokeT -= dt; if (time > nextSmoke) { nextSmoke = time + 0.14; const p = spots[smokeAt]; P[0] = p[0]; P[1] = p[1] + 0.1; P[2] = p[2]; sprites.puff(P, { count: 1, size: 0.12, rise: 0.45, spread: 0.03, life: 1.5, color: '#dfe4ff' }); } }
    if (!low && time > nextDrop) { nextDrop = time + 0.5; const i = Math.floor(rnd() * 40); if (state[i] > 0.5) sprites.sparkle(spots[i], { count: 1, size: 0.14, spread: 0.1, life: 0.8, color: '#fff0b0' }); }
  }

  // ---- what the live stage asks for (kit-ch5 taskUnit)
  //   'brass-aurelle'   ch5.s2: the model as she comes into the room: every small lamp out at 0, and they come up island by
  //                     island until twenty-nine burn at 1 (the eleven that stay dark are the room's default, as ch5.s2.c01 has it)
  // setback(): a handful of the lamps gutter out and have to come back
  // marks.seat: where the director stands Corvane while an encounter is played here (at his window, back to the room)
  let modelUnit = null, gutter = 0;
  function task(type) {
    if (type !== 'brass-aurelle') return null;
    return modelUnit || (modelUnit = taskUnit([MODEL[0], MODEL[1] + 0.25, MODEL[2] + 0.3], null, (v, time, dt) => { gutter = Math.max(0, gutter - (dt || 0) / 2.4); setDark(40 - Math.round(29 * v) + Math.round(7 * gutter * Math.min(1, v * 3))); }));
  }
  const setback = () => { gutter = 1; };

  return shell({
    id: 'corvane-study', light, L, scene, cameras: CAMERAS, actors, foreground, lamps, glows, tick, dim: 0.5,
    motes: low ? null : { box: [WIN.x - 0.6, WIN.x + 2.6, 0.5, 3.6, BACK + 0.4, -0.4], every: 0.5, color: '#dfe8ff', size: 0.05, vel: [0.03, -0.02, 0.04], life: 6, alpha: 0.6 },
    marks: {
      ...MARKS, model: MODEL, focus: MODEL, lamps40: spots,
      window: { pos: [WIN.x + 0.1, 0, BACK + 1.0], face: 180 }, guest: { pos: GUEST, face: 62 }, seat: { pos: [WIN.x - 0.55, 0, BACK + 1.25], face: 150 },
    },
    extra: { setDark, snuff, cue, encounter, task, setback, passLamp: setback, litCount: () => 40 - dark },
  });
}

export const corvaneStudy = { id: 'corvane-study', lights: lightNames(LIGHTS, ALIAS), cameras: Object.keys(CAMERAS), build };
export default corvaneStudy;
