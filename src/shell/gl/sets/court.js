// SET: court. The circuit bench sitting in the Saltmere miners' drill hall, under the roll of those the pit has kept:
// a magistrate at a borrowed high desk on a dais, the Tribune's table stage left and the Assessor's stage right, four
// hundred people standing on the forms down both sides, banners in the roof, day slanting in through the high windows.
// Chapter 2: ch2.s4 The Hearing.
//
//   import { court } from './sets/court.js';
//   const set = court.build(GL, { light: 'day', low: false });
//
// Same shape as sets/lantern-stalls.js. Figures face +Z, cameras look toward -Z, the strip x -4.4..4.4, z 0..1.6 is
// clear (the aisle runner lies in it).
//
// What this set can do for its story:
//   setMood(0..1)         how the hall stands: 0 dead still (the suspension is read out), 0.25 listening, 1 on its feet shouting
//   setCrowd(0..1)        how many are in
//   cue(lineId)           ch2.s4.c12 / c14 hush; c18 listening again; c24 the stay (the gavel: sparks at the bench); c25 thirty days (cheering); c26 settles
// marks: a, b, c, two, party, opposition as everywhere, plus
//   tribune { pos, face }: at the Tribune's table (her hand flat on it)   assessor { pos, face }: at the Assessor's table
//   bar { pos, face }: before the bench   bench: world point of the magistrate's head   gavel: world point   focus: the roll

import { rng } from '../math.js';
import { merge, tint, place, box, setGlow } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic, material } from '../scene.js';
import { createSprites } from '../sprites.js';
import { anchorAt, crowd } from './kit.js';
import {
  SM, ch2Materials, shell, lightOf, stageMarks, norm3, splay, roomWall, gableWall, paneWindow, shafts, floorPatch, boardFloor, openRoof, runner,
  clothBanner, courtTable, judgeBench, rollBoard, ropeRail, lampRack, form, hangLamp,
} from './kit-ch2.js';

const BW = 6.4, BACK = -5.8, FW = 9.0, WING_Z = 2.6, H = 5.4, RISE = 2.8;
const FOLK_COATS = ['#ffd2b0', '#bfdcff', '#ffc4d6', '#c6f0c0', '#ffe9a0', '#d8c8ff', '#ffbfa8', '#b8ece4'];

const LIGHTS = {
  day: {
    preset: 'day', power: 0.3,
    env: {
      key: { dir: norm3([-0.42, 0.76, 0.5]), color: '#f4e4cc' },
      shadow: { tint: '#8a86ee', lift: 0.08, saturate: 1.4 },
      ambient: { sky: '#cfe0ff', ground: '#ffd0b8', amount: 0.13 },
      rim: { color: '#fff2c0', amount: 0.6, edge: 0.76 },
      fog: { density: 0.0006, start: 40, max: 0.5 },
      sky: { sunDir: norm3([-0.5, 0.5, -1]) },
      water: null,
    },
    glass: '#fff8d0', glass2: '#bfe6ff', shaft: '#ffd870', patch: '#fff0b0',
  },
};

const CAMERAS = {
  wide: { target: [-0.35, 2.1, -0.7], dist: 9.0, yaw: 17, pitch: 3, fov: 50, aspect: 0.46, shadowCenter: [0, 0, -1.6], shadowRadius: 8 },
  two: { target: [0, 1.12, 0.6], dist: 6.0, yaw: -15, pitch: 5, fov: 31, aspect: 0.46, shadowCenter: [0, 0, 0.3], shadowRadius: 3.6 },
  close: { target: [0.02, 0.86, 0.8], dist: 3.9, yaw: 21, pitch: 3, fov: 28, aspect: 0.46, shadowCenter: [0, 0, 0.5], shadowRadius: 2.6 },
  low: { target: [0.1, 2.3, -0.9], dist: 6.4, yaw: -6, pitch: -12, fov: 56, aspect: 0.46, shadowCenter: [0, 0, -1.4], shadowRadius: 8 },
  stage: { target: [0, 1.25, 0.1], dist: 10.2, yaw: -10, pitch: 6, fov: 26, aspect: 1.95, shadowCenter: [0, 0, -1], shadowRadius: 8, outline: 0.7 },
  landscape: { target: [0, 2.1, -1.4], dist: 10, yaw: 4, pitch: 5, fov: 40, aspect: 1.6, shadowCenter: [0, 0, -1.6], shadowRadius: 9.5 },
};

function build(engine = null, { light: lightName = 'day', low = false } = {}) {
  const [light, L] = lightOf('court', LIGHTS, lightName);
  const M = ch2Materials(), r = rng(613);
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  const WL = splay(-1, BW, BACK, FW, WING_Z), WR = splay(1, BW, BACK, FW, WING_Z);
  const deco = (n) => { n.castShadow = false; return n; };
  const WALL = '#bcc2fa', WALL2 = '#a8acee';

  // ---- the hall
  const room = group('room');
  room.add(node('floor', place(boardFloor({ w: 21, d: 18, n: 24, colors: ['#f2cf9c', '#eac48c', '#f8d8aa'], seed: 7, gapColor: '#c79a6a' }), 0, 0, 2.0), M.flat));
  const BWIN = [-4.5, 4.5].map((x) => ({ x, w: 1.5, sill: 2.5, top: 5.0, arch: true }));
  room.add(node('back', roomWall({ w: BW * 2 + 0.6, h: H, t: 0.4, color: WALL, openings: BWIN }), M.wall, { pos: [0, 0, BACK] }));
  room.add(node('gable', gableWall({ w: BW * 2 + 0.6, rise: RISE + 0.12, t: 0.4, color: WALL2 }), M.wall, { pos: [0, H, BACK] }));
  const dado = (w) => merge(tint(place(box(w, 1.5, 0.05), 0, 0.75, 0.025), SM.wine), tint(place(box(w, 0.1, 0.08), 0, 1.55, 0.04), SM.brass), tint(place(box(w, 0.16, 0.08), 0, 0.08, 0.04), '#8e2850'));
  room.add(node('dado', dado(BW * 2 + 0.2), M.wall, { pos: [0, 0, BACK] }));
  const WWIN = [{ x: -2.0, w: 1.4, sill: 2.6, top: 4.9, arch: true }, { x: 1.0, w: 1.4, sill: 2.6, top: 4.9, arch: true }];
  for (const Wg of [WL, WR]) {
    room.add(node('wing', roomWall({ w: Wg.len + 0.4, h: H, t: 0.4, color: WALL, openings: WWIN }), M.wall, { pos: Wg.pos, rot: [0, Wg.yaw, 0] }));
    room.add(node('dado-w', dado(Wg.len), M.wall, { pos: Wg.at(0, 0), rot: [0, Wg.yaw, 0] }));
  }
  room.add(node('roof', openRoof({ w: FW * 2 + 1.6, d: WING_Z - BACK + 1.2, rise: RISE * (FW + 0.8) / (BW + 0.3), n: low ? 3 : 4, color: '#eef0ff', beam: '#7a4a6e' }), M.wall, { pos: [0, H, BACK] }));
  // sun on the floor: the left windows thrown across the hall
  room.add(node('patch1', floorPatch({ w: 1.5, d: 3.6, panes: 2, rows: 2, shear: -0.9, color: L.patch, glow: 0.6 }), M.flat, { pos: [-0.6, 0.007, -1.9], rot: [0, 62, 0] }));
  room.add(node('patch2', floorPatch({ w: 1.5, d: 3.6, panes: 2, rows: 2, shear: -0.9, color: L.patch, glow: 0.6 }), M.flat, { pos: [1.0, 0.007, 0.9], rot: [0, 62, 0] }));
  room.add(node('aisle', runner({ w: 1.7, len: 4.6, field: SM.royal, border: SM.brass, line: SM.salt }), M.flat, { pos: [0, 0, -0.5] }));
  scene.root.add(mergeStatic(room, 'room'));

  // ---- props
  const props = group('props');
  // the bench on its dais, the roll above it
  const BENCH = [0, 0, -4.05];
  const benchMesh = judgeBench({ w: 3.5, h: 1.3 });
  props.add(node('bench', benchMesh, M.prop, { pos: BENCH }));
  const ROLL = [0, 2.95, BACK + 0.06];
  const roll = rollBoard({ w: 3.3, h: 2.9, cols: 4, rows: 12, seed: 3 });
  props.add(deco(node('roll', roll, M.prop, { pos: ROLL })));
  props.add(deco(node('roll-lamps', lampRack({ n: 7, len: 3.2, lit: 0 }), M.prop, { pos: [ROLL[0], ROLL[1] - 0.12, ROLL[2] + 0.2] })));
  // windows
  const pane = (w, h) => paneWindow({ w, h, glass: L.glass, glass2: L.glass2, glow: 1, bars: 1, rows: 2, frame: '#7a4a6e', depth: 0.36 });
  for (const o of BWIN) props.add(deco(node('win-b', pane(o.w, o.top - o.sill), M.prop, { pos: [o.x, o.sill, BACK] })));
  for (const Wg of [WL, WR]) for (const o of WWIN) props.add(deco(node('win-w', pane(o.w, o.top - o.sill), M.prop, { pos: Wg.at(o.x, 0, o.sill), rot: [0, Wg.yaw, 0] })));
  // banners: two by the roll, four hung from the tie beams down the hall
  props.add(deco(node('banner-l', clothBanner({ w: 1.0, h: 2.6, color: SM.rust, trim: SM.mustard, device: 'pick' }), M.prop, { pos: [-2.6, 5.5, BACK + 0.12], rot: [0, 0, 1.5] })));
  props.add(deco(node('banner-r', clothBanner({ w: 1.0, h: 2.6, color: SM.enamel, trim: SM.salt, device: 'lamp' }), M.prop, { pos: [2.6, 5.5, BACK + 0.12], rot: [0, 0, -1.5] })));
  const hung = [[-3.6, -2.9, SM.royal, 'wave', 4], [3.6, -2.9, SM.plum, 'ring', -4], [-5.3, -0.4, SM.mustard, 'pick', 3], [5.3, -0.4, SM.coral, 'lamp', -3]];
  hung.forEach(([x, z, c, d, tilt], i) => { if (low && i > 1) return; props.add(deco(node('banner' + i, clothBanner({ w: 1.15, h: 2.2, color: c, trim: i === 2 ? SM.rust : SM.salt, device: d, deviceColor: i === 2 ? SM.rust : SM.salt }), M.prop, { pos: [x, H - 0.25, z], rot: [0, tilt * 3, tilt * 0.5] }))); });
  // the parties' tables
  const TT = [-2.05, 0, -1.25], AT = [2.05, 0, -1.25];
  const tTab = courtTable({ w: 1.6, d: 0.78, cloth: SM.enamel, seed: 2 }), aTab = courtTable({ w: 1.6, d: 0.78, cloth: SM.wine, seed: 6 });
  props.add(node('table-t', tTab, M.prop, { pos: TT, rot: [0, 18, 0] }), node('table-a', aTab, M.prop, { pos: AT, rot: [0, -18, 0] }));
  // the Assessor's side has brought files; the Tribune's has one brief
  { const parts = []; for (let i = 0; i < 6; i++) parts.push(tint(place(box(0.34, 0.07, 0.26), (i % 2) * 0.03, 0.035 + i * 0.07, 0, 0, i * 7 - 12, 0), [SM.paper, '#ffe6b0', '#dfe8ff'][i % 3]), tint(place(box(0.35, 0.02, 0.05), (i % 2) * 0.03, 0.07 + i * 0.07, 0, 0, i * 7 - 12, 0), SM.seal)); props.add(deco(node('files', merge(parts), M.prop, { pos: [AT[0] + 0.5, 0.69, AT[2] - 0.05] })), deco(node('files2', merge(parts), M.prop, { pos: [AT[0] + 1.25, 0, AT[2] - 0.3], rot: [0, 30, 0] }))); }
  // stepped forms down both sides for the town to stand on, behind rope rails
  const tiers = (sx) => { const parts = []; for (let j = 0; j < 4; j++) parts.push(tint(place(box(4.4, 0.24 * (j + 1), 0.66), sx * 4.85, 0.12 * (j + 1), -2.0 - j * 0.66), j % 2 ? SM.timber : SM.timberPale)); return merge(parts); };
  for (const sx of [-1, 1]) {
    props.add(node('tiers', tiers(sx), M.prop));
    props.add(node('rail', ropeRail({ len: 3.4, rope: SM.wine }), M.prop, { pos: [sx * 4.6, 0, -1.45] }));
  }
  // miners' lamps on the wings, a form by the door
  for (const Wg of [WL, WR]) props.add(deco(node('rack', lampRack({ n: 6, len: 2.6 }), M.prop, { pos: Wg.at(-0.5, 0.06, 2.35), rot: [0, Wg.yaw, 0] })));
  props.add(node('form', form({ len: 2.4 }), M.prop, { pos: WR.at(2.6, 0.5), rot: [0, WR.yaw + 90, 0] }));
  const HL = [3.3, H + 0.05, -0.9], hl = hangLamp({ drop: 1.3, r: 0.5, shade: SM.wine });
  props.add(deco(node('lamp', hl, M.prop, { pos: HL })));
  scene.root.add(mergeStatic(props, 'props'));

  // ---- sun: shafts from the left wing's windows across the hall, and from the back windows toward the lens
  if (!low) {
    const parts = [];
    for (const o of WWIN) { const p = WL.at(o.x, 0.1, (o.sill + o.top) / 2); parts.push(place(shafts({ w: 1.2, h: 1.7, dir: [0, -0.62, 1], len: 9.5, cards: 3, color: L.shaft, spread: 0.3 }), p[0], p[1], p[2], 0, WL.yaw, 0)); }
    for (const o of BWIN) parts.push(place(shafts({ w: 1.2, h: 1.7, dir: [-o.x * 0.05, -0.8, 1], len: 6, cards: 2, color: L.shaft, spread: 0.2 }), o.x, (o.sill + o.top) / 2, BACK + 0.05));
    scene.root.add(node('shafts', merge(parts), material({ kind: 'beam', name: 'court-shaft', beam: { power: 0.6, near: 0.5, far: 0.08, steps: 0 }, outline: false })));
  }

  // ---- the town
  const spots = [];
  for (const sx of [-1, 1]) for (let j = 0; j < 4; j++) for (let i = 0; i < 7; i++) spots.push({ pos: [sx * (2.85 + i * 0.56 + (r() - 0.5) * 0.14), 0.24 * (j + 1), -2.0 - j * 0.66 + (r() - 0.5) * 0.1], face: -sx * (38 + r() * 26), s: 0.86 + r() * 0.2 });
  for (let i = 0; i < 8; i++) { const sx = i % 2 ? 1 : -1; spots.push({ pos: [sx * (5.2 + (i >> 1) * 0.55), 0, -0.9 + (r() - 0.5) * 0.3], face: -sx * 70, s: 0.9 + r() * 0.16 }); }
  for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = spots[i]; spots[i] = spots[j]; spots[j] = t; }
  const sprites = scene.sprites = createSprites(low ? 128 : 320);
  const folk = crowd({ spots, material: M.prop, sprites: null, seed: 11, detail: low ? 0 : 1, hold: 'none', colors: FOLK_COATS, amount: 1, variants: low ? 1 : 2 });
  scene.root.add(folk.node);

  const actors = group('actors'); scene.root.add(actors);
  const fg = group('fg', {}, node('fg-rail', ropeRail({ len: 2.6, rope: SM.wine }), M.prop, { pos: [-2.7, 0, 3.0], rot: [0, 10, 0] }), node('fg-rail2', ropeRail({ len: 2.6, rope: SM.wine }), M.prop, { pos: [2.7, 0, 3.0], rot: [0, -10, 0] }));
  const foreground = mergeStatic(fg, 'foreground');
  scene.root.add(foreground);

  // ---- lamps
  const seat = anchorAt(benchMesh, 'seat', BENCH), gavel = anchorAt(benchMesh, 'gavel', BENCH), lampAt = [HL[0], HL[1] + hl.anchors.lamp[1], HL[2]];
  const lamps = [
    { name: 'roll', pos: [0, 4.2, BACK + 1.6], color: '#ffe6a0', radius: 5.5, base: 1.5, flicker: 0, fixed: true },
    { name: 'sun-floor', pos: [0.2, 1.6, -1.2], color: '#fff0c0', radius: 6.5, base: 1.1, flicker: 0, fixed: true },
    { name: 'hall', pos: lampAt, color: '#ffc870', radius: 7, base: 1.2 },
    { name: 'win-l', pos: [-4.2, 3.2, BACK + 1.6], color: '#fff0c8', radius: 4.6, base: 1.2, flicker: 0, fixed: true },
    { name: 'win-r', pos: [4.2, 3.2, BACK + 1.6], color: '#fff0c8', radius: 4.6, base: 1.2, flicker: 0, fixed: true },
  ];
  const glows = [{ sprite: sprites.add({ kind: 'glow', pos: [lampAt[0], lampAt[1] - 0.1, lampAt[2]], size: 1.8, color: '#ffc060', alpha: 0 }), base: 1.0 }];
  for (const o of BWIN) glows.push({ sprite: sprites.add({ kind: 'glow', pos: [o.x, (o.sill + o.top) / 2, BACK + 0.3], size: 4.2, color: '#fff2b0', alpha: 0 }), base: 0.42, fixed: true });
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: [ROLL[0], ROLL[1] + 3.3, ROLL[2] + 0.2], size: 1.6, color: '#ffd24a', alpha: 0 }), base: 0.6, fixed: true });

  let mood = 0.25, moodNow = 0.25, nextCheer = 0;
  const rnd = rng(47), P = [0, 0, 0], FOLK = { lit: 0, lively: 0.25 };
  function setMood(v) { mood = Math.max(0, Math.min(1, v)); }
  function setCrowd(a) { folk.setAmount(Math.max(0, Math.min(1, a))); }
  function cue(id) {
    switch (id) {
      case 'ch2.s4.c01': setMood(0.25); return true;
      case 'ch2.s4.c12': case 'ch2.s4.c14': case 'ch2.s4.c17': setMood(0.02); return true;
      case 'ch2.s4.c18': setMood(0.22); return true;
      case 'ch2.s4.c24': setMood(0.5); sprites.sparkle(gavel, { count: 7, size: 0.4, spread: 0.7, life: 0.8, color: '#fff6c0' }); return true;
      case 'ch2.s4.c25': setMood(1); return true;
      case 'ch2.s4.c26': case 'ch2.s4.c28': setMood(0.35); return true;
      default: return false;
    }
  }
  function tick(time, dt, pw, live) {
    moodNow += (mood - moodNow) * Math.min(1, dt * 3);
    FOLK.lively = moodNow; folk.update(time, dt, FOLK);
    if (live && moodNow > 0.7 && time > nextCheer) { // caps and scraps of paper go up
      nextCheer = time + 0.12; const sx = rnd() < 0.5 ? -1 : 1; P[0] = sx * (3.2 + rnd() * 3.4); P[1] = 1.8 + rnd() * 1.2; P[2] = -2 - rnd() * 2;
      sprites.spawn({ kind: 'dot', pos: P, vel: [(rnd() - 0.5) * 1.2, 2.2 + rnd() * 1.4, 0.4], size: 0.09 + rnd() * 0.06, life: 1.5, gravity: -4.2, color: SM.cloth[Math.floor(rnd() * SM.cloth.length)], alpha: 1 });
    }
  }

  return shell({
    id: 'court', light, L, scene, cameras: CAMERAS, actors, foreground, lamps, glows, tick,
    motes: low ? null : { box: [-3.5, 3.5, 0.8, 4.8, BACK + 0.8, 0.6], every: 0.22, color: '#fff2c0', size: 0.06, vel: [0.05, -0.03, 0.03], life: 6, alpha: 0.8 },
    marks: {
      ...stageMarks(), focus: [ROLL[0], ROLL[1] + 1.5, ROLL[2]], bench: seat, gavel,
      tribune: { pos: [TT[0] - 0.15, 0, TT[2] + 0.62], face: 150 }, assessor: { pos: [AT[0] + 0.15, 0, AT[2] + 0.62], face: -150 },
      bar: { pos: [0, 0, -1.9], face: 180 },
    },
    extra: { setMood, setCrowd, cue, crowd: folk },
  });
}

export const court = { id: 'court', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default court;
