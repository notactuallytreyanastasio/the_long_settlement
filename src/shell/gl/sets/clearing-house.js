// SET: clearing-house. The clearing house of Tallis before it is light: the room where one sealed sheet for
// every counting-house in Aurelle is put into a brass carrier and sent down a tube. Seven brass tubes climb the
// back wall from a manifold of hatches; a round strongroom door stands to the right of them and a wall of
// pigeonholes to the left; under the one lamp that is lit is a sorting table with a carrier lying open on it and
// a sheaf of photographs, and a chair, and in the chair the person who was not supposed to be there.
// Chapter 5: ch5.s5 Clearing House.
//
//   import { clearingHouse } from './sets/clearing-house.js';
//   const set = clearingHouse.build(GL, { light: 'night' | 'dark', low: false });
//
// 'night' is the room as the brothers find it (the lamp lit); 'dark' is the same room with the lamp turned
// right down, for the lines at the doors before they reach it. setLamp() moves between them live.
// Same shape as sets/lantern-stalls.js. Figures face +Z, cameras look toward -Z, the strip x -4.4..4.4,
// z 0..1.6 is clear; the dais' front edge is at z -1.0.
//
// What this set can do for its story:
//   setLamp(0..1)      the hanging lamp over the table
//   send()             the carrier is closed, goes into the fourth tube and is gone "like a breath" (ch5.s5.c23)
//   reset()            puts the carrier back on the table, open
//   cue(lineId)        ch5.s5.c01 (lamp low), c14 (lamp up: she is sitting under it), c23 (send), c28 (a last breath in the pipe)
// marks: a, b, c, two, party, opposition as everywhere, plus
//   seat { pos, face }: in front of her chair, on the dais (y 0.26)   dais (its height)
//    carrier, tube (world points)   door { pos, face }   focus = the lamp

import { m4, quat, rng, DEG } from '../math.js';
import { merge, tint, place, box, cylinder, setGlow, setOutline } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic } from '../scene.js';
import { createSprites } from '../sprites.js';
import { rayMesh, rayMaterial } from '../fx.js';
import { pickLight, sack, crate } from './kit.js';
import { wall, wing, ceiling, doorway, hangingLamp, chair, stool } from './kit-b.js';
import { TL, MARKS, ch5Materials, shell, norm, shaft, paving, vaultDoor, tubeWall, carrier, pigeonholes, lightNames, ownLight, taskUnit } from './kit-ch5.js';

const BW = 4.7, BACK = -4.7, FW = 7.2, WING_Z = 2.4, H = 5.8;

// core light names (core/stage.js) this set answers besides its own
const ALIAS = { interior: 'night', predawn: 'night' };

const LIGHTS = {
  night: {
    preset: 'night', power: 1.15, lamp: 1,
    env: {
      key: { dir: norm([-0.36, 0.7, 0.62]), color: '#8c98f2' },
      shadow: { tint: '#2f36a4', lift: 0.11, saturate: 1.35 },
      ambient: { sky: '#5a70e4', ground: '#2e3090', amount: 0.17 },
      rim: { color: '#ffd080', amount: 0.8, edge: 0.74 },
      fog: { density: 0.0008, start: 30, max: 0.6 },
      sky: { zenith: '#16237e', mid: '#2c48b4', midAt: 0.45, horizon: '#6a8ae8', below: '#3a52b8', stars: 0.6, moon: 0, sunDir: norm([0.2, 0.3, -1]) },
      water: null,
    },
  },
  dark: {
    preset: 'night', power: 1.15, lamp: 0.2,
    env: {
      key: { dir: norm([-0.36, 0.7, 0.62]), color: '#7684ea' },
      shadow: { tint: '#2a30a0', lift: 0.11, saturate: 1.35 },
      ambient: { sky: '#5068e0', ground: '#2a2c8a', amount: 0.17 },
      rim: { color: '#a8c0ff', amount: 0.7, edge: 0.74 },
      fog: { density: 0.0008, start: 30, max: 0.6 },
      sky: { zenith: '#16237e', mid: '#2c48b4', midAt: 0.45, horizon: '#6a8ae8', below: '#3a52b8', stars: 0.6, moon: 0, sunDir: norm([0.2, 0.3, -1]) },
      water: null,
    },
  },
};

const CAMERAS = {
  wide: { target: [0.1, 1.75, -0.5], dist: 8.4, yaw: -2, pitch: 5, fov: 44, aspect: 0.46, shadowCenter: [0, 0, -1.2], shadowRadius: 7 },
  two: { target: [0, 1.12, 0.6], dist: 6.0, yaw: -15, pitch: 5, fov: 31, aspect: 0.46, shadowCenter: [0, 0, 0.3], shadowRadius: 3.6 },
  close: { target: [0.02, 0.86, 0.8], dist: 3.9, yaw: 21, pitch: 3, fov: 28, aspect: 0.46, shadowCenter: [0, 0, 0.5], shadowRadius: 2.6 },
  low: { target: [0.3, 1.7, -0.9], dist: 5.8, yaw: -8, pitch: -9, fov: 54, aspect: 0.46, shadowCenter: [0, 0, -1], shadowRadius: 7 },
  stage: { target: [0, 1.1, 0.2], dist: 9.6, yaw: -9, pitch: 6, fov: 26, aspect: 1.95, shadowCenter: [0, 0, -0.8], shadowRadius: 7, outline: 0.7 },
  landscape: { target: [0, 1.75, -1.2], dist: 9.6, yaw: 4, pitch: 5, fov: 40, aspect: 1.6, shadowCenter: [0, 0, -1.5], shadowRadius: 9 },
};

const bx = (w, h, d, x, y, z, c, rx = 0, ry = 0, rz = 0) => tint(place(box(w, h, d), x, y, z, rx, ry, rz), c);

function build(engine = null, { light: lightName = 'night', low = false } = {}) {
  const { name: light, L } = pickLight('clearing-house', LIGHTS, ownLight(LIGHTS, ALIAS, lightName));
  const M = ch5Materials(), r = rng(5555);
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  const WL = wing(-1, BW, BACK, FW, WING_Z), WR = wing(1, BW, BACK, FW, WING_Z);

  // ---- the room: slate-blue walls over a navy dado, a cold tiled floor, three small windows high up with no light in them yet
  const room = group('room');
  room.add(node('floor', paving({ w: 18, d: 13, nx: 10, nz: 8, colors: ['#7a84e4', '#6a72d6', '#8890ea'], grout: '#4a50b4', seed: 5 }), M.flat, { pos: [0, 0, BACK + 6.5] }));
  const CLER = [-3.1, 0, 3.1].map((x) => ({ x, w: 1.2, sill: 4.15, top: 5.25, arch: true }));
  room.add(node('back', wall({ w: BW * 2 + 0.4, h: H, t: 0.4, color: '#6672da', openings: CLER }), M.wall, { pos: [0, 0, BACK] }));
  const DOOR = { x: 0.5, w: 1.4, sill: 0, top: 2.6 };
  room.add(node('wing-l', wall({ w: WL.len + 0.3, h: H, t: 0.4, color: '#5c68d0' }), M.wall, { pos: WL.pos, rot: [0, WL.yaw, 0] }));
  room.add(node('wing-r', wall({ w: WR.len + 0.3, h: H, t: 0.4, color: '#5c68d0', openings: [DOOR] }), M.wall, { pos: WR.pos, rot: [0, WR.yaw, 0] }));
  room.add(node('dado', merge(bx(BW * 2, 1.2, 0.08, 0, 0.6, BACK + 0.04, TL.navy), bx(BW * 2, 0.1, 0.12, 0, 1.25, BACK + 0.05, TL.brass), bx(BW * 2, 0.12, 0.12, 0, 3.95, BACK + 0.05, TL.brassDark)), M.wall));
  room.add(node('dado-l', merge(bx(WL.len, 1.2, 0.08, 0, 0.6, 0.04, TL.navy), bx(WL.len, 0.1, 0.12, 0, 1.25, 0.05, TL.brass)), M.wall, { pos: WL.pos, rot: [0, WL.yaw, 0] }));
  for (const [x0, x1] of [[-WR.len / 2, DOOR.x - DOOR.w / 2 - 0.14], [DOOR.x + DOOR.w / 2 + 0.14, WR.len / 2]]) room.add(node('dado-r', merge(bx(x1 - x0, 1.2, 0.08, 0, 0.6, 0.04, TL.navy), bx(x1 - x0, 0.1, 0.12, 0, 1.25, 0.05, TL.brass)), M.wall, { pos: WR.at((x0 + x1) / 2), rot: [0, WR.yaw, 0] }));
  room.add(node('ceiling', ceiling({ w: 16, d: 8, color: '#27307a', beams: 5, beam: '#1a2260', bw: 0.32, bh: 0.34 }), M.wall, { pos: [0, H, BACK + 4] }));
  for (const c of CLER) room.add(node('pane', merge(setOutline(setGlow(bx(c.w, c.top - c.sill, 0.03, c.x, (c.sill + c.top) / 2, BACK - 0.3, '#5a7ae8'), 0.7), 0), bx(0.06, c.top - c.sill, 0.06, c.x, (c.sill + c.top) / 2, BACK - 0.2, TL.navy), bx(c.w, 0.06, 0.06, c.x, c.sill + 0.45, BACK - 0.2, TL.navy)), M.wall));
  const TABLE = [1.6, 0.26, -1.95];
  scene.root.add(mergeStatic(room, 'room'));

  // ---- the tube wall, the strongroom door, the pigeonholes
  const props = group('props'), deco = group('deco');
  const TUBES = [-1.15, 0, BACK + 0.02], tw = tubeWall({ w: 4.3, h: 5.0, n: 7, seed: 3 });
  props.add(node('tubes', tw, M.prop, { pos: TUBES }));
  const hatch = tw.anchors.hatches.map((p) => [TUBES[0] + p[0], p[1], TUBES[2] + p[2]]), tops = tw.anchors.tops.map((p) => [TUBES[0] + p[0], p[1], TUBES[2] + p[2]]);
  const VAULT = [3.05, 0, BACK + 0.32], vd = vaultDoor({ r: 1.12 });
  props.add(node('vault', vd.frame, M.prop, { pos: VAULT }), node('vault-wheel', vd.wheel, M.prop, { pos: [VAULT[0] + vd.frame.anchors.hub[0], vd.frame.anchors.hub[1], VAULT[2] + vd.frame.anchors.hub[2]], rot: [0, 0, 20] }));
  props.add(node('pigeonholes', pigeonholes({ w: 3.4, h: 2.4, cols: 6, rows: 4, seed: 6 }), M.prop, { pos: WL.at(0.3, 0.24, 1.3), rot: [0, WL.yaw, 0] }));
  props.add(node('pigeon-base', bx(3.5, 1.3, 0.5, 0, 0.65, 0, TL.tealDark), M.prop, { pos: WL.at(0.3, 0.26), rot: [0, WL.yaw, 0] }));
  // a second sorting table against the left wall, under sacks of the morning sheet
  const tableMesh = (w, d) => merge(bx(w, 0.1, d, 0, 0.82, 0, TL.woodPale), bx(w - 0.2, 0.16, d - 0.2, 0, 0.7, 0, TL.wood), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => tint(place(cylinder(0.06, 0.05, 0.7, 6), sx * (w / 2 - 0.14), 0, sz * (d / 2 - 0.14)), TL.woodDark)));
  props.add(node('table2', tableMesh(2.0, 0.9), M.prop, { pos: [-3.25, 0, -2.2], rot: [0, 24, 0] }));
  props.add(node('sack1', sack({ s: 0.36, seed: 3, color: '#ff9a7a' }), M.prop, { pos: [-3.5, 0.87, -2.3] }), node('sack2', sack({ s: 0.3, seed: 6, color: '#f1dca4' }), M.prop, { pos: [-2.85, 0.87, -2.05] }), node('sack3', sack({ s: 0.4, seed: 8, color: '#f1dca4' }), M.prop, { pos: [-4.2, 0, -1.2] }), node('sack4', sack({ s: 0.34, seed: 2, color: '#8ee8c8' }), M.prop, { pos: [2.15, 0, -3.6] }));
  // a clerk's dais under the lamp: her chair in the middle of it, and at her hand the table with the carrier's cradle,
  // a sheaf of photographs and the sealed sheets
  const DAIS = 0.26, TOP = DAIS + 0.875;
  props.add(node('dais', merge(bx(5.6, DAIS, 2.5, 0, DAIS / 2, 0, TL.woodPale), bx(5.8, DAIS * 0.5, 2.7, 0, DAIS * 0.25, 0, TL.wood), bx(5.6, 0.012, 0.12, 0, DAIS + 0.006, 1.16, TL.brass)), M.prop, { pos: [0.2, 0, -2.25] }));
  props.add(node('table', tableMesh(1.8, 0.95), M.prop, { pos: TABLE, rot: [0, -8, 0] }));
  const photo = (x, z, yaw) => merge(bx(0.3, 0.012, 0.22, x, TOP + 0.01, z, TL.paper, 0, yaw, 0), bx(0.24, 0.014, 0.16, x, TOP + 0.014, z, '#3a8f7a', 0, yaw, 0));
  deco.add(node('photos', merge(photo(0.1, -1.72, 12), photo(0.38, -1.9, -20), photo(0.0, -2.05, 40), photo(0.42, -1.62, 70), bx(0.3, 0.07, 0.22, 0.6, TOP + 0.05, -2.15, TL.paper, 0, 8, 0)), M.deco, { pos: [TABLE[0], 0, 0] }));
  deco.add(node('sheets', merge(bx(0.42, 0.16, 0.32, 0, 0.08, 0, TL.parchment), bx(0.44, 0.02, 0.06, 0, 0.17, 0, TL.wine), tint(place(cylinder(0.05, 0.05, 0.02, 8), 0, 0.185, 0), '#f4573f')), M.deco, { pos: [TABLE[0] + 0.55, TOP, TABLE[2] + 0.12], rot: [0, -12, 0] }));
  deco.add(node('cradle', merge(bx(0.5, 0.05, 0.22, 0, 0.025, 0, TL.woodDark), bx(0.05, 0.1, 0.22, -0.2, 0.07, 0, TL.woodDark), bx(0.05, 0.1, 0.22, 0.2, 0.07, 0, TL.woodDark)), M.deco, { pos: [TABLE[0] - 0.5, TOP, TABLE[2] + 0.2] }));
  const SEAT = [0.0, DAIS, -1.8];
  props.add(node('chair', chair({ high: true, s: 1.35, color: TL.brassDark, seat: TL.wine }), M.prop, { pos: [SEAT[0], DAIS, SEAT[2] - 0.62] }));
  props.add(node('stool', stool({ color: TL.wood, seat: TL.teal }), M.prop, { pos: [-3.3, 0, -0.9] }));
  // spare carriers racked on the manifold
  for (let i = 0; i < 4; i++) deco.add(node('spare', carrier({}), M.deco, { pos: [TUBES[0] - 1.5 + i * 0.5 + (i > 1 ? 1.2 : 0), 1.07, TUBES[2] + 0.42], rot: [0, 90 + i * 9, 0] }));
  // the lamp
  const HANG = [0.45, H, -1.75], hl = hangingLamp({ drop: 2.25, r: 0.5, shade: TL.emerald, shape: 'cone' });
  deco.add(node('lamp', hl, M.deco, { pos: HANG }));
  const LAMP = [HANG[0] + hl.anchors.lamp[0], HANG[1] + hl.anchors.lamp[1], HANG[2] + hl.anchors.lamp[2]];
  // the last door: not locked
  const door = doorway({ w: 1.3, h: 2.5, open: 40, color: TL.tealDark, frame: TL.stoneBlue, side: -1 });
  props.add(node('door', door, M.prop, { pos: WR.at(DOOR.x, 0), rot: [0, WR.yaw, 0] }));
  props.add(node('scale', merge(bx(0.7, 0.9, 0.5, 0, 0.45, 0, TL.tealDark), bx(0.8, 0.06, 0.6, 0, 0.93, 0, TL.brass), tint(place(cylinder(0.26, 0.26, 0.04, 10), 0, 1.0, 0), TL.brassDark)), M.prop, { pos: WR.at(DOOR.x - 1.5, 0.45), rot: [0, WR.yaw, 0] }));
  scene.root.add(mergeStatic(props, 'props'), mergeStatic(deco, 'deco'));

  // ---- the carrier: open on its cradle, or closed and on its way
  const REST = [TABLE[0] - 0.5, TOP + 0.08, TABLE[2] + 0.2], SENT = 4;
  const open = node('carrier-open', carrier({ open: true }), M.deco, { pos: REST }); open.castShadow = false;
  const shut = node('carrier', carrier({}), M.deco, { pos: REST }); shut.castShadow = false; shut.visible = false;
  scene.root.add(open, shut);

  // ---- light: the lamp's cone, pale shafts from the high windows
  const cone = node('lamp-cone', tint(place(rayMesh(3.0, 0.3, 2.2, 18), LAMP[0], LAMP[1] + 0.1, LAMP[2]), '#ffc060'), rayMaterial({ power: 1.4, near: 0.3, far: 0 }));
  scene.root.add(cone);
  if (!low) scene.root.add(node('shafts', merge(...CLER.map((c) => place(shaft({ w: 1.0, h: 0.8, dir: [0.25, -1, 0.8], len: 4.6, cards: 2, color: '#8fa8ff' }), c.x, (c.sill + c.top) / 2, BACK + 0.05))), M.shaft));

  // ---- foreground
  const fg = group('fg');
  fg.add(node('fg-crate', crate({ s: 0.56, seed: 5, color: TL.wood }), M.prop, { pos: [-1.85, 0, 3.0], rot: [0, 18, 0] }), node('fg-sack', sack({ s: 0.36, seed: 4, color: '#f1dca4' }), M.prop, { pos: [1.8, 0, 3.0], rot: [0, -30, 0] }));
  const foreground = mergeStatic(fg, 'foreground'); scene.root.add(foreground);
  const actors = group('actors'); scene.root.add(actors);

  // ---- lamps
  const doorLight = WR.at(DOOR.x, -0.9, 1.5);
  const lamps = [
    { name: 'lamp', pos: [LAMP[0], LAMP[1] - 0.3, LAMP[2] + 0.9], color: '#ffc468', radius: 8.5, base: 1.7, gain: L.lamp },
    { name: 'windows', pos: [0, 3.6, BACK + 1.6], color: '#7f98ff', radius: 6.0, base: 0.9, flicker: 0 },
    { name: 'hatches', pos: [TUBES[0], 1.5, BACK + 1.0], color: '#8ef0c8', radius: 3.6, base: 0.7, flicker: 0.02 },
    { name: 'door', pos: doorLight, color: '#8f9cff', radius: 4.0, base: 0.6, flicker: 0 },
  ];
  const sprites = scene.sprites = createSprites(low ? 96 : 256), glows = [];
  const lampGlow = { sprite: sprites.add({ kind: 'glow', pos: LAMP, size: 2.6, color: '#ffb850', alpha: 0 }), base: 0.55, gain: L.lamp };
  glows.push(lampGlow);
  const hatchGlow = hatch.map((p, i) => sprites.add({ kind: 'glow', pos: [p[0] + 0.11, p[1] + 0.24, p[2]], size: 0.42, color: i % 3 === 1 ? '#ffd24a' : '#8ef0c8', alpha: 0.6 }));

  // ---- per-frame
  const P = [0, 0, 0], MV = [0.02, 0.05, 0.01], rnd = rng(95);
  let lamp = L.lamp, lampShown = L.lamp, sendT = -1, sent = false, nextMote = 0, breathT = -1;
  const setLamp = (v) => { lamp = Math.max(0, Math.min(1, v)); };
  function send() { if (sendT < 0 && !sent) sendT = 0; }
  function reset() { sendT = -1; sent = false; open.visible = true; shut.visible = false; }
  const CUES = { 'ch5.s5.c01': () => { reset(); setLamp(0.2); }, 'ch5.s5.c14': () => setLamp(1), 'ch5.s5.c23': send, 'ch5.s5.c28': () => { breathT = 0; } };
  const cue = (id) => { const f = CUES[id]; if (f) f(); return !!f; };
  const H3 = hatch[SENT], T3 = tops[SENT];
  function tick(time, dt, pw, live) {
    lampShown += (lamp - lampShown) * Math.min(1, dt * 3 + (dt === 0 ? 1 : 0));
    lamps[0].gain = lampShown; lampGlow.gain = lampShown; cone.visible = lampShown * pw > 0.3;
    for (let i = 0; i < hatchGlow.length; i++) hatchGlow[i].alpha = (i === SENT && sent ? 0.15 : 0.45 + 0.2 * Math.sin(time * 1.3 + i * 1.9)) * Math.min(1, pw + 0.3);
    if (sendT >= 0) { // lid on, across to the hatch, and up
      sendT += dt; open.visible = false; shut.visible = true;
      const a = Math.min(1, sendT / 0.9), b = Math.max(0, Math.min(1, (sendT - 1.05) / 0.32)), e = a * a * (3 - 2 * a);
      if (b <= 0) { shut.setPos(REST[0] + (H3[0] - REST[0]) * e, REST[1] + (H3[1] - REST[1]) * e + Math.sin(e * Math.PI) * 0.35, REST[2] + (H3[2] - REST[2]) * e); shut.setRot(0, 0, e * 90); }
      else { shut.setPos(T3[0], H3[1] + (T3[1] - H3[1]) * b * b, T3[2] + 0.02); shut.setRot(0, 0, 90); }
      if (sendT > 1.37) { sendT = -1; sent = true; shut.visible = false; if (live) { sprites.puff(T3, { count: 3, size: 0.3, rise: 0.5, spread: 0.2, life: 1.4, color: '#ffffff' }); sprites.sparkle(H3, { count: 4, size: 0.24, spread: 0.3, life: 0.6, color: '#fff0b0' }); } }
    }
    if (!live) return;
    if (breathT >= 0) { breathT += dt; if (breathT > 0.2) { breathT = -1; sprites.puff(T3, { count: 2, size: 0.26, rise: 0.4, spread: 0.15, life: 1.6, color: '#dfe6ff' }); } }
    if (!low && lampShown > 0.5 && time > nextMote) { nextMote = time + 0.22; const a = rnd() * 6.283, rad = rnd() * 1.3; P[0] = LAMP[0] + Math.cos(a) * rad; P[1] = 1.1 + rnd() * 2.0; P[2] = LAMP[2] + Math.sin(a) * rad * 0.8; sprites.spawn({ kind: 'glow', pos: P, vel: MV, size: 0.05 + rnd() * 0.05, life: 4, color: '#ffd890', alpha: 0.8 }); }
  }

  // ---- what the live stage asks for (kit-ch5 taskUnit)
  //   'halcyon-lock'   ch5.s5: an iron-barred door, flat to the audience at stage left, with a brass lock plate and three
  //                    tumblers on it. Each third of the objective turns one home (it lights); at 1 the door swings open.
  //                    The room's lamp is kept low while they work (ch5.s5.c01 has it at 0.2).
  // setback(): the lamp is held too high for a moment, and the room jumps out of the dark
  let lockUnit = null;
  function task(type) {
    if (type !== 'halcyon-lock') return null;
    if (lockUnit) return lockUnit;
    const GX = -2.75, GZ = -0.55, GW = 1.3, GH = 2.25, bars = [];
    for (let i = 0; i < 6; i++) bars.push(tint(place(cylinder(0.028, 0.028, GH - 0.14, 6), 0.1 + i * (GW - 0.2) / 5, GH / 2, 0), TL.iron));
    for (const y of [0.1, GH - 0.06]) bars.push(bx(GW, 0.09, 0.07, GW / 2, y, 0, TL.iron));
    bars.push(bx(0.34, 0.5, 0.09, GW - 0.2, 1.08, 0.03, TL.brassDark));
    const frame = node('lock-frame', merge(bx(0.14, GH + 0.2, 0.16, -0.09, (GH + 0.2) / 2, 0, TL.wood), bx(0.14, GH + 0.2, 0.16, GW + 0.09, (GH + 0.2) / 2, 0, TL.wood), bx(GW + 0.32, 0.16, 0.18, GW / 2, GH + 0.2, 0, TL.wood)), M.prop, { pos: [GX, 0, GZ] }); frame.castShadow = false;
    const leaf = node('lock-door', merge(bars), M.prop, { pos: [GX, 0, GZ] }); leaf.castShadow = false;
    const dial = [0, 1, 2].map((k) => { const n = node('tumbler', merge(tint(place(cylinder(0.075, 0.075, 0.04, 10), 0, 0, 0, 90, 0, 0), TL.brass), bx(0.022, 0.07, 0.02, 0, 0.035, 0.025, TL.wine)), M.deco, { pos: [GW - 0.2, 1.25 - k * 0.17, 0.09] }); n.castShadow = false; leaf.add(n); return n; });
    const glow = [0, 1, 2].map((k) => sprites.add({ kind: 'glow', pos: [GX + GW - 0.2, 1.25 - k * 0.17, GZ + 0.2], size: 0.5, color: '#ffd24a', alpha: 0 }));
    scene.root.add(frame, leaf);
    return (lockUnit = taskUnit([GX + GW - 0.2, 1.1, GZ + 0.15], [GX + GW + 0.25, 0.55], (v, time) => {
      setLamp(0.2);
      for (let k = 0; k < 3; k++) { const t = Math.max(0, Math.min(1, v * 3 - k)); dial[k].setRot(0, 0, t >= 1 ? 0 : 140 - 140 * t + Math.sin(time * 5 + k * 2) * 10 * (1 - t)); glow[k].alpha = t >= 1 ? 0.75 : 0.12 * t; glow[k].pos[0] = GX + (GW - 0.2) * Math.cos(open3 * 1.3); }
      const want = v >= 0.999 ? 1 : 0; open3 += (want - open3) * 0.08; leaf.setRot(0, -75 * open3, 0);
    }));
  }
  let open3 = 0;
  const setback = () => { lampShown = 0.85; };

  return shell({
    id: 'clearing-house', light, L, scene, cameras: CAMERAS, actors, foreground, lamps, glows, tick, dim: 0.5,
    marks: {
      ...MARKS, seat: { pos: SEAT, face: 0 }, carrier: REST, tube: H3, focus: LAMP,
      door: { pos: WR.at(DOOR.x, 0.9), face: WR.yaw }, dais: DAIS,
    },
    extra: { setLamp, send, reset, cue, task, setback, passLamp: setback },
  });
}

export const clearingHouse = { id: 'clearing-house', lights: lightNames(LIGHTS, ALIAS), cameras: Object.keys(CAMERAS), build };
export default clearingHouse;
