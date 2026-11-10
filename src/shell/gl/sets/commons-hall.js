// SET: commons-hall. The Saltmere Commons: one long hall that feeds four hundred a night from one stove and keeps
// its accounts in chalk on a board the length of the back wall. Two columns: GAVE, and IS OWED.
// Chapter 2: ch2.s2 Bread on the Line (night: the hall full, the stove going, a queue at the table where Ilse reads
// people their notices) and ch2.s7 What the Tide Is Owed (day: the hall nearly empty, sun through the gable, and
// Hesper chalks up two new names, in credit).
//
//   import { commonsHall } from './sets/commons-hall.js';
//   const set = commonsHall.build(GL, { light: 'night' | 'day', low: false });
//
// Same shape as sets/lantern-stalls.js. Figures face +Z, cameras look toward -Z, the strip x -4.4..4.4, z 0..1.6 is
// clear (the end of the runner lies in it). The side walls are splayed like stage flats.
//
// What this set can do for its story:
//   setCrowd(0..1)        how full the hall is (night starts full, day at a quarter); they come and go one by one
//   setNames(0 | 1 | 2)   MARAVEL I / VASKER R chalked in the IS OWED column (0: not yet)
//   task('red-notice', i) -> { pos, stand, set(v) } ch2.s2's encounter: three notices on a trestle (night only), each answered at v = 1
//   task('long-board')    -> { pos, stand, set(v) } ch2.s7's encounter: the hall fills a little and COAL / A ROOF / SALT are chalked on the day slate (an easel, day only)
//   cue(lineId)           ch2.s7.c05 chalks both names; ch2.s7.c01 wipes them; ch2.s2.c16 / c21 thin the hall for the late supper
// marks: a, b, c, two, party, opposition as everywhere, plus
//   board { pos, face }: where somebody stands to chalk   table { pos, face }: behind the writing table (Ilse's chair)
//   client { pos, face }: the head of the queue   stove { pos, face }: at the pots   seat { pos, face }: the form where Ren is told to sit
//   focus: the big lamp   credit: [2] world points of the two chalked names

import { rng, DEG } from '../math.js';
import { merge, tint, place, box, cylinder, setGlow, setOutline } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic } from '../scene.js';
import { createSprites } from '../sprites.js';
import { rayMesh, rayMaterial } from '../fx.js';
import { anchorAt, bunting, crowd, crate, sack, barrel } from './kit.js';
import {
  SM, ch2Materials, shell, lightOf, stageMarks, norm3, splay, roomWall, gableWall, paneWindow, shafts, floorPatch, boardFloor, openRoof, runner,
  hangLamp, trestle, form, tableware, stove, chalkboard, clothBanner, courtTable, pixelText, notice,
} from './kit-ch2.js';

const FOLK_COATS = ['#ffd2b0', '#bfdcff', '#ffc4d6', '#c6f0c0', '#ffe9a0', '#d8c8ff', '#ffbfa8', '#b8ece4'];
const BW = 6.2, BACK = -5.2, FW = 8.8, WING_Z = 2.6, H = 5.0, RISE = 2.7;

const LIGHTS = {
  night: {
    preset: 'night', power: 1, crowd: 1, night: true,
    env: {
      key: { dir: norm3([-0.28, 0.74, 0.6]), color: '#c4a2b4' },
      shadow: { tint: '#4a48d4', lift: 0.1, saturate: 1.5 },
      ambient: { sky: '#c88cc8', ground: '#4444c8', amount: 0.14 },
      rim: { color: '#ffd98a', amount: 0.5, edge: 0.76 },
      fog: { density: 0.0006, start: 40, max: 0.5 },
      sky: { zenith: '#0c1a70', mid: '#243ab0', midAt: 0.45, horizon: '#6a62dc', below: '#34349c', stars: 1, moon: 0, sunDir: norm3([-0.06, 0.34, -1]) },
      water: null,
    },
    glass: '#5a7cff', glass2: '#9a7cf0', glassGlow: 0.9, shaft: '#8fa8ff', patch: '#a8b8ff', patchGlow: 0.4, mote: '#ffe2a8', wall: '#f0c4c8', gable: '#d0a8dc', roof: '#b99ad8',
  },
  day: {
    preset: 'day', power: 0.35, crowd: 0.22, night: false,
    env: {
      key: { dir: norm3([-0.34, 0.8, 0.5]), color: '#fff4dc' },
      shadow: { tint: '#9a94ec', lift: 0.09, saturate: 1.35 },
      ambient: { sky: '#cfe4ff', ground: '#ffd9b0', amount: 0.13 },
      fog: { density: 0.0006, start: 40, max: 0.5 },
      sky: { sunDir: norm3([-0.3, 0.5, -1]) },
      water: null,
    },
    glass: '#fff6c8', glass2: '#bfe8ff', glassGlow: 1, shaft: '#ffe9a0', patch: '#fff2b8', patchGlow: 0.6, mote: '#fff6d0', wall: '#ffe9cc', gable: '#ffdcc4', roof: '#ffe2c4',
  },
};

const CAMERAS = {
  wide: { target: [0, 1.75, -0.5], dist: 8.4, yaw: 2, pitch: 4, fov: 44, aspect: 0.46, shadowCenter: [0, 0, -1.4], shadowRadius: 7.5 },
  two: { target: [0, 1.12, 0.6], dist: 6.0, yaw: -15, pitch: 5, fov: 31, aspect: 0.46, shadowCenter: [0, 0, 0.3], shadowRadius: 3.6 },
  close: { target: [0.02, 0.86, 0.8], dist: 3.9, yaw: 21, pitch: 3, fov: 28, aspect: 0.46, shadowCenter: [0, 0, 0.5], shadowRadius: 2.6 },
  low: { target: [0.1, 1.9, -0.4], dist: 6.2, yaw: -8, pitch: -10, fov: 56, aspect: 0.46, shadowCenter: [0, 0, -1], shadowRadius: 7.5 },
  stage: { target: [0.2, 1.15, 0.2], dist: 9.8, yaw: -11, pitch: 6, fov: 26, aspect: 1.95, shadowCenter: [0, 0, -0.8], shadowRadius: 7.5, outline: 0.7 },
  landscape: { target: [0, 1.9, -1.2], dist: 9.8, yaw: 4, pitch: 5, fov: 40, aspect: 1.6, shadowCenter: [0, 0, -1.5], shadowRadius: 9 },
};

function build(engine = null, { light: lightName = 'night', low = false } = {}) {
  const [light, L] = lightOf('commons-hall', LIGHTS, lightName);
  const M = ch2Materials(), r = rng(271), night = L.night;
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  const WL = splay(-1, BW, BACK, FW, WING_Z), WR = splay(1, BW, BACK, FW, WING_Z);
  const deco = (n) => { n.castShadow = false; return n; };

  // ---- the hall: floor, walls, gable with its big window, open roof
  const room = group('room');
  room.add(node('floor', place(boardFloor({ w: 20, d: 17, n: 26, colors: ['#f6b878', '#eea866', '#ffc68a'], seed: 4 }), 0, 0, 2.0), M.ground));
  const GW = { w: 2.6, sill: -1.0, top: 2.05 }; // in gable space (y = 0 at the eaves): the window drops a metre into the wall
  room.add(node('back', roomWall({ w: BW * 2 + 0.6, h: H, t: 0.4, color: L.wall, openings: [{ x: 0, w: GW.w, sill: H + GW.sill, top: H }] }), M.wall, { pos: [0, 0, BACK] }));
  room.add(node('gable', gableWall({ w: BW * 2 + 0.6, rise: RISE + 0.12, t: 0.4, color: L.gable, window: GW }), M.wall, { pos: [0, H, BACK] }));
  // a painted dado: a band of strong colour along the foot of every wall
  const dado = (w) => merge(tint(place(box(w, 1.15, 0.05), 0, 0.575, 0.025), SM.enamel), tint(place(box(w, 0.09, 0.07), 0, 1.19, 0.035), SM.mustard), tint(place(box(w, 0.14, 0.07), 0, 0.07, 0.035), SM.enamelDark));
  room.add(node('dado', dado(BW * 2 + 0.2), M.wall, { pos: [0, 0, BACK] }));
  const DOOR = { x: -1.6, w: 1.5, sill: 0, top: 2.7, arch: true }; // in the left wing, toward the back: the way in from the yard
  room.add(node('wing-l', roomWall({ w: WL.len + 0.4, h: H, t: 0.4, color: L.wall, openings: [DOOR, { x: 1.9, w: 1.3, sill: 1.9, top: 4.1, arch: true }] }), M.wall, { pos: WL.pos, rot: [0, WL.yaw, 0] }));
  room.add(node('wing-r', roomWall({ w: WR.len + 0.4, h: H, t: 0.4, color: L.wall, openings: [{ x: -1.9, w: 1.3, sill: 1.9, top: 4.1, arch: true }, { x: 0.9, w: 1.3, sill: 1.9, top: 4.1, arch: true }] }), M.wall, { pos: WR.pos, rot: [0, WR.yaw, 0] }));
  for (const Wg of [WL, WR]) room.add(node('dado-w', dado(Wg.len), M.wall, { pos: Wg.at(0, 0.0), rot: [0, Wg.yaw, 0] }));
  room.add(node('roof', openRoof({ w: FW * 2 + 1.6, d: WING_Z - BACK + 1.2, rise: RISE * (FW + 0.8) / (BW + 0.3), n: low ? 3 : 4, color: L.roof, beam: SM.timberDark }), M.wall, { pos: [0, H, BACK] }));
  // what is beyond the door and the wing windows: glowing cards (night blue, or daylight)
  const outside = night ? '#4a66e8' : '#dff4ff';
  room.add(node('door-sky', setGlow(tint(place(box(2.2, 3.2, 0.05), ...WL.at(DOOR.x, -0.9, 1.5), 0, WL.yaw, 0), outside), 0.9), M.flat));
  room.add(node('patch', floorPatch({ w: 2.2, d: 3.6, panes: 3, rows: 2, shear: 0.06, color: L.patch, glow: L.patchGlow }), M.flat, { pos: [0.2, 0.007, -1.5] }));
  room.add(node('runner', runner({ w: 1.5, len: 5.6, field: SM.wine, border: SM.mustard }), M.flat, { pos: [0, 0, -1.9], rot: [0, 1.5, 0] }));
  scene.root.add(mergeStatic(room, 'room'));

  // ---- props
  const props = group('props');
  // the board
  const BOARD = [0, 1.32, BACK + 0.04];
  const board = chalkboard({ w: 9.6, h: 2.1, rows: 8, seed: 5, headX: 1.3, headS: 0.3 });
  props.add(deco(node('board', board, M.prop, { pos: BOARD })));
  // windows: the gable window and three in the wings
  const win = paneWindow({ w: GW.w, h: GW.top - GW.sill, glass: L.glass, glass2: L.glass2, glow: L.glassGlow, bars: 2, rows: 2, frame: SM.timberDark, depth: 0.36 });
  const WIN = [0, H + GW.sill, BACK];
  props.add(deco(node('gable-window', win, M.prop, { pos: WIN })));
  const side = () => paneWindow({ w: 1.3, h: 2.2, glass: L.glass, glass2: L.glass2, glow: L.glassGlow * 0.9, bars: 1, rows: 2, depth: 0.34 });
  props.add(deco(node('win-l', side(), M.prop, { pos: WL.at(1.9, 0, 1.9), rot: [0, WL.yaw, 0] })));
  for (const x of [-1.9, 0.9]) props.add(deco(node('win-r', side(), M.prop, { pos: WR.at(x, 0, 1.9), rot: [0, WR.yaw, 0] })));
  // banners either side of the gable window, and one on each wing
  props.add(deco(node('banner1', clothBanner({ w: 0.9, h: 2.0, color: SM.royal, trim: SM.mustard, device: 'pick' }), M.prop, { pos: [-2.25, H + 1.05, BACK + 0.1], rot: [0, 0, 2] })));
  props.add(deco(node('banner2', clothBanner({ w: 0.9, h: 2.0, color: SM.rust, trim: SM.salt, device: 'lamp' }), M.prop, { pos: [2.25, H + 1.05, BACK + 0.1], rot: [0, 0, -2] })));
  props.add(deco(node('banner3', clothBanner({ w: 1.0, h: 2.3, color: SM.plum, trim: SM.mustard, device: 'wave' }), M.prop, { pos: WR.at(-0.5, 0.1, 4.5), rot: [0, WR.yaw, 0] })));
  props.add(deco(node('banner4', clothBanner({ w: 1.0, h: 2.3, color: SM.enamel, trim: SM.salt, device: 'ring', deviceColor: SM.mustard }), M.prop, { pos: WL.at(0.2, 0.1, 4.6), rot: [0, WL.yaw, 0] })));
  if (!low) {
    props.add(deco(node('bunting1', bunting([-BW + 0.3, H - 0.1, BACK + 1.6], [BW - 0.3, H - 0.1, BACK + 1.6], { sag: 0.9, count: 17, size: 0.3, seed: 3 }), M.prop)));
    props.add(deco(node('bunting2', bunting([-FW + 1.4, H - 0.1, -0.6], [FW - 1.4, H - 0.1, -0.6], { sag: 1.0, count: 19, size: 0.3, seed: 8 }), M.prop)));
  }
  // two long tables down the hall with forms either side
  const TX = 1.62, TZ = -2.95, TLEN = 3.3;
  for (const sx of [-1, 1]) {
    props.add(node('table', trestle({ len: TLEN, w: 0.95, seed: sx + 3 }), M.prop, { pos: [sx * TX, 0, TZ], rot: [0, sx * 2, 0] }));
    for (const k of [-1, 1]) props.add(node('form', form({ len: TLEN - 0.2 }), M.prop, { pos: [sx * TX + k * 0.72, 0, TZ] }));
    if (!low) props.add(deco(node('ware', tableware({ len: TLEN, w: 0.95, seed: sx + 5, n: 8 }), M.prop, { pos: [sx * TX, 0.62, TZ] })));
  }
  // a third table across the right wing, and the serving table in front of the stove
  props.add(node('table3', trestle({ len: 3.0, w: 0.9, seed: 9 }), M.prop, { pos: [5.1, 0, -1.2], rot: [0, 90 + WR.yaw * 0.2, 0] }));
  if (!low) props.add(deco(node('ware3', tableware({ len: 3.0, w: 0.9, seed: 12, n: 6 }), M.prop, { pos: [5.1, 0.62, -1.2], rot: [0, 90 + WR.yaw * 0.2, 0] })));
  props.add(node('form3', form({ len: 2.8 }), M.prop, { pos: [5.1, 0, -0.5], rot: [0, 90 + WR.yaw * 0.2, 0] }));
  // the one stove, back right, with the serving table before it
  const STOVE = [4.15, 0, BACK + 0.85], STOVE_YAW = -8;
  const stoveMesh = stove({ w: 2.7, flue: 3.6, seed: 2 });
  props.add(node('stove', stoveMesh, M.prop, { pos: STOVE, rot: [0, STOVE_YAW, 0] }));
  const sAt = (name) => anchorAt(stoveMesh, name, STOVE, STOVE_YAW);
  props.add(node('serving', trestle({ len: 2.6, w: 0.8, h: 0.8, seed: 14, color: SM.timberRed }), M.prop, { pos: [4.0, 0, BACK + 2.25], rot: [0, 90 - 6, 0] }));
  { // on the serving table: a tureen, a stack of bowls, loaves
    const parts = [];
    parts.push(tint(place(cylinder(0.3, 0.36, 0.34, 10), -0.5, 0, 0), SM.mustard), setGlow(tint(place(cylinder(0.31, 0.31, 0.012, 10), -0.5, 0.33, 0), '#ffb86a'), 0.3));
    for (let i = 0; i < 6; i++) parts.push(tint(place(cylinder(0.14, 0.09, 0.05, 7), 0.25, i * 0.04, 0.05), i % 2 ? SM.salt : '#bfe8ff'));
    for (let i = 0; i < 3; i++) parts.push(tint(place(box(0.34, 0.14, 0.18), 0.8, 0.07 + (i === 2 ? 0.14 : 0), -0.1 + (i % 2) * 0.22, 0, i * 20, 0), '#f0a85a'));
    props.add(deco(node('tureen', merge(parts), M.prop, { pos: [4.0, 0.8, BACK + 2.25], rot: [0, -6, 0] })));
  }
  props.add(node('sacks', merge(place(sack({ seed: 3, s: 0.4 }), 0, 0, 0), place(sack({ seed: 6, s: 0.34 }), 0.5, 0, 0.2, 0, 40, 0), place(barrel({ r: 0.3, h: 0.74 }), -0.7, 0, -0.1)), M.prop, { pos: [5.9, 0, BACK + 1.1] }));
  // the writing table, stage left, where the queue ends
  const TABLE = [-4.2, 0, -1.9], TABLE_YAW = 24;
  const wt = courtTable({ w: 1.7, d: 0.8, cloth: SM.royal, seed: 4 });
  props.add(node('writing-table', wt, M.prop, { pos: TABLE, rot: [0, TABLE_YAW, 0] }));
  const tt = anchorAt(wt, 'top', TABLE, TABLE_YAW);
  props.add(deco(node('red-seal', notice({ s: 0.34 }), M.prop, { pos: [tt[0] + 0.25, tt[1] + 0.01, tt[2] + 0.1], rot: [-90, TABLE_YAW + 14, 0] })));
  props.add(node('stool', merge(tint(place(cylinder(0.2, 0.2, 0.06, 8), 0, 0.42, 0), SM.rust), tint(place(cylinder(0.05, 0.07, 0.42, 5), 0, 0, 0), SM.timberDark)), M.prop, { pos: [TABLE[0] - 0.35, 0, TABLE[2] - 0.75] }));
  props.add(node('crates', merge(place(crate({ s: 0.6, seed: 2 }), 0, 0, 0), place(crate({ s: 0.46, seed: 5, color: SM.timberPale }), 0.05, 0.62, 0, 0, 18, 0)), M.prop, { pos: [-6.6, 0, -0.9], rot: [0, 30, 0] }));
  // aprons on the nail by the door
  { const parts = []; for (let i = 0; i < 3; i++) parts.push(tint(place(box(0.34, 0.62, 0.04), i * 0.42, -0.36, 0.03, 0, 0, (i - 1) * 4), [SM.salt, '#bfe8ff', SM.coral][i]), tint(place(box(0.05, 0.05, 0.08), i * 0.42, 0, 0.04), SM.iron)); props.add(deco(node('aprons', merge(parts), M.prop, { pos: WL.at(-0.1, 0.02, 2.2), rot: [0, WL.yaw, 0] }))); }
  // hanging lamps
  const HANG = [[0, H + 0.05, -2.5, 1.55, 0.5], [-4.3, H + 0.05, -2.1, 1.45, 0.4], [4.3, H + 0.05, -1.3, 1.45, 0.4]];
  const lampMeshes = HANG.map(([x, y, z, drop, rr], i) => { const m = hangLamp({ drop, r: rr, shade: [SM.enamel, SM.rust, SM.mustard][i] }); props.add(deco(node('lamp' + i, m, M.prop, { pos: [x, y, z] }))); return m; });
  scene.root.add(mergeStatic(props, 'props'));

  if (!low) scene.root.add(node('shafts', place(shafts({ w: GW.w * 0.8, h: (GW.top - GW.sill) * 0.7, dir: [0.02, -1, 0.74], len: 6.4, cards: 3, color: L.shaft }), 0, H + (GW.top + GW.sill) / 2, BACK + 0.05), M.shaft));

  // warm cones under the three lamps: one mesh
  const cones = node('lamp-cones', merge(HANG.map(([x, y, z, drop, rr], i) => tint(place(rayMesh(3.0, rr * 0.5, i ? 1.5 : 1.9, 14), x, y - drop + 0.05, z), '#ffc060'))), rayMaterial({ power: 1.4, near: night ? 0.3 : 0.12, far: 0 }));
  scene.root.add(cones);

  // ---- the two names, chalked at a cue
  const credit = board.anchors.credit.map((c) => [BOARD[0] + c[0], BOARD[1] + c[1], BOARD[2] + c[2] + 0.004]);
  const names = ['MARAVEL, I', 'VASKER, R'].map((s, i) => { const n = node('name' + i, pixelText(s, { s: 0.2, color: '#fff0a0', glow: 0.7, align: 'left', jitter: 0.12, seed: i + 3 }), M.flat, { pos: credit[i], visible: false }); n.castShadow = false; scene.root.add(n); return n; });

  // ---- people: at the tables, in the queue, at the stove
  const spots = [];
  for (const sx of [-1, 1]) for (const k of [-1, 1]) for (let i = 0; i < 5; i++) spots.push({ pos: [sx * TX + k * 0.74, 0.1, TZ - TLEN / 2 + 0.45 + i * 0.62], face: -k * 90 + (r() - 0.5) * 30, s: 0.82 + r() * 0.12 });
  for (let i = 0; i < 6; i++) spots.push({ pos: [TABLE[0] + 1.25 - i * 0.2 + (r() - 0.5) * 0.2, 0, TABLE[2] + 0.55 - i * 0.56 - 0.5], face: 150 + (r() - 0.5) * 30, s: 0.9 + r() * 0.14 });
  for (const [x, z, f] of [[3.2, BACK + 1.55, 60], [5.0, BACK + 1.5, -30], [5.6, -0.45, 180], [4.6, -0.45, 170], [5.2, -1.95, 10]]) spots.push({ pos: [x, 0, z], face: f, s: 0.95 });
  // shuffle so that a thin hall still has somebody in every part of it
  for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = spots[i]; spots[i] = spots[j]; spots[j] = t; }
  const sprites = scene.sprites = createSprites(low ? 128 : 320);
  const folk = crowd({ spots, material: M.prop, sprites: null, seed: 5, detail: low ? 0 : 1, hold: 'none', colors: FOLK_COATS, amount: L.crowd, variants: low ? 1 : 2 });
  scene.root.add(folk.node);

  const actors = group('actors'); scene.root.add(actors);
  const foreground = mergeStatic(group('fg', {}, node('fg-form', form({ len: 2.2 }), M.prop, { pos: [-2.2, 0, 3.0], rot: [0, 78, 0] }), node('fg-sack', sack({ seed: 9, s: 0.36 }), M.prop, { pos: [2.1, 0, 2.9] })), 'foreground');
  scene.root.add(foreground);

  // ---- lamps and glows
  const lampPos = HANG.map(([x, y, z], i) => [x + lampMeshes[i].anchors.lamp[0], y + lampMeshes[i].anchors.lamp[1], z]);
  const fire = sAt('fire'), pots = sAt('pots');
  const lamps = [
    { name: 'big', pos: lampPos[0], color: '#ffc870', radius: 8.5, base: 1.5 },
    { name: 'left', pos: lampPos[1], color: '#ffc06a', radius: 6.5, base: 1.25 },
    { name: 'right', pos: lampPos[2], color: '#ffc870', radius: 6.5, base: 1.25 },
    { name: 'stove', pos: [fire[0], fire[1] + 0.2, fire[2] + 0.5], color: '#ff8a3c', radius: 4.6, base: night ? 1.3 : 2.4, flicker: 0.14, fixed: true },
    { name: 'window', pos: [0.1, 2.6, BACK + 2.4], color: night ? '#8fa8ff' : '#fff0c0', radius: 5.2, base: night ? 1.0 : 2.6, flicker: 0, fixed: true },
  ];
  const glows = lampPos.map((p, i) => ({ sprite: sprites.add({ kind: 'glow', pos: [p[0], p[1] - 0.12, p[2]], size: i ? 2.0 : 2.7, color: '#ffc060', alpha: 0 }), base: 0.5 }));
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: fire, size: 1.7, color: '#ff8a30', alpha: 0 }), base: 0.6, fixed: true, flick: 1 });
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: [WIN[0], WIN[1] + 1.6, WIN[2] + 0.2], size: 4.4, color: night ? '#7f98ff' : '#fff2b0', alpha: 0 }), base: night ? 0.36 : 0.5, fixed: true });

  let want = L.crowd, nameCount = 0, nextSteam = 0, nextBowl = 0.4;
  const rnd = rng(31), P = [0, 0, 0], FOLK = { lit: 0, lively: 0.22 };
  function setCrowd(a) { want = Math.max(0, Math.min(1, a)); folk.setAmount(want); }
  function setNames(n) { nameCount = Math.max(0, Math.min(2, n | 0)); for (let i = 0; i < 2; i++) names[i].visible = i < nameCount; }
  function cue(id) {
    if (id === 'ch2.s7.c05') { setNames(2); sprites.sparkle(credit[0], { count: 5, size: 0.3, spread: 0.6, life: 0.9, color: '#fff6c0' }); return true; }
    if (id === 'ch2.s7.c01') { setNames(0); return true; }
    if (id === 'ch2.s2.c01') { setCrowd(1); return true; }
    if (id === 'ch2.s2.c10') { setCrowd(0.6); return true; }
    if (id === 'ch2.s2.c16' || id === 'ch2.s2.c21') { setCrowd(0.25); return true; }
    return false;
  }
  // ---- ch2.s2's encounter: three red-sealed notices propped on a trestle at the back of the strip; each gets its four-word reply
  const NX = [0.75, 1.5, 2.25], NZ = 0.35, NY = 0.96;
  scene.root.add(node('notice-trestle', merge(tint(place(box(2.3, 0.07, 0.5), 1.5, 0.7, NZ), SM.timberPale), tint(place(box(0.08, 0.7, 0.42), 0.5, 0.35, NZ), SM.timberDark), tint(place(box(0.08, 0.7, 0.42), 2.5, 0.35, NZ), SM.timberDark), tint(place(box(2.0, 0.06, 0.06), 1.5, 0.28, NZ), SM.timberDark)), M.prop, { visible: night }));
  const noticeNodes = NX.map((x, i) => { const n = node('red-notice' + i, notice({ s: 0.44 }), M.prop, { pos: [x, NY, NZ + 0.1], rot: [-12, (i - 1) * -6, 0], visible: night }); n.castShadow = false; scene.root.add(n); return n; });
  const replyNodes = NX.map((x, i) => { const n = node('reply' + i, merge(setGlow(tint(place(box(0.34, 0.2, 0.012), 0, 0, 0), '#fff8dc'), 0.5), ...[0, 1].map((k) => setOutline(tint(place(box(0.24 - k * 0.06, 0.022, 0.004), -k * 0.03, 0.035 - k * 0.07, 0.009), '#2a3f8f'), 0))), M.prop, { pos: [x + 0.03, NY - 0.1, NZ + 0.2], rot: [-14, (i - 1) * -6, 6 - i * 5], visible: false }); n.castShadow = false; scene.root.add(n); return n; });
  const replyGlows = NX.map((x) => sprites.add({ kind: 'glow', pos: [x, NY, NZ + 0.3], size: 0.9, color: '#fff2b0', alpha: 0 }));
  const replyV = [0, 0, 0];
  const NOTICES = NX.map((x, i) => ({ pos: [x, NY, NZ + 0.15], stand: [x - 0.62, NZ + 0.42], size: 0.4, set(v) { replyV[i] = v; replyNodes[i].visible = v > 0.97; replyGlows[i].alpha = v > 0.97 ? 0.5 : v * 0.25; } }));
  // ---- ch2.s7's encounter: the town comes in to look at its board, and three fresh entries are chalked on it
  const SLATE = [2.05, 0.8, 0.25];
  scene.root.add(node('day-slate', merge(tint(place(box(1.3, 0.86, 0.05), 0, 0, 0), SM.slate), tint(place(box(1.4, 0.06, 0.08), 0, 0.46, 0), SM.timberRed), tint(place(box(1.4, 0.06, 0.08), 0, -0.46, 0), SM.timberRed), tint(place(box(0.06, 0.98, 0.08), -0.68, 0, 0), SM.timberRed), tint(place(box(0.06, 0.98, 0.08), 0.68, 0, 0), SM.timberRed),
    tint(place(box(0.06, 1.3, 0.06), -0.5, -0.2, -0.12, 8, 0, 0), SM.timberDark), tint(place(box(0.06, 1.3, 0.06), 0.5, -0.2, -0.12, 8, 0, 0), SM.timberDark), tint(place(box(0.06, 1.3, 0.06), 0, -0.2, -0.42, -18, 0, 0), SM.timberDark)), M.prop, { pos: SLATE, rot: [-6, -12, 0], visible: !night }));
  const entries = [['COAL', 0.24], ['A ROOF', 0], ['SALT', -0.24]].map(([s, y], i) => { const n = node('entry' + i, pixelText(s, { s: 0.17, color: '#fff0a0', glow: 0.8, align: 'left', jitter: 0.08, seed: i + 11 }), M.flat, { pos: [SLATE[0] - 0.5, SLATE[1] + y - 0.08, SLATE[2] + 0.06], rot: [-6, -12, 0], visible: false }); n.castShadow = false; scene.root.add(n); return n; });
  let boardV = 0;
  const LONG_BOARD = { pos: [SLATE[0], SLATE[1] + 0.1, SLATE[2] + 0.1], stand: [SLATE[0] - 1.0, SLATE[2] + 0.5], size: 0.7, set(v) { const c = 0.25 + 0.35 * v; if (Math.abs(c - want) > 0.004) setCrowd(c); for (let i = 0; i < 3; i++) { const on = v * 3 > i + 0.97; if (on && !entries[i].visible) sprites.sparkle(entries[i].position, { count: 5, size: 0.3, spread: 0.6, life: 0.9, color: '#fff6c0' }); entries[i].visible = on; } boardV = v; } };
  const task = (type, i = 0) => (type === 'red-notice' ? NOTICES[i] || null : type === 'long-board' ? LONG_BOARD : null);
  function tick(time, dt, pw, live) {
    folk.update(time, dt, FOLK);
    if (!live) return;
    if (time > nextSteam) { nextSteam = time + 0.42; const p = pots[Math.floor(rnd() * pots.length)]; sprites.puff(p, { count: 1, size: 0.2, rise: 0.6, spread: 0.1, life: 1.9, color: night ? '#fff0e0' : '#ffffff' }); }
    if (!low && time > nextBowl) { nextBowl = time + 1.3; P[0] = (rnd() < 0.5 ? -1 : 1) * TX + (rnd() - 0.5) * 0.4; P[1] = 0.74; P[2] = TZ + (rnd() - 0.5) * TLEN * 0.8; sprites.puff(P, { count: 1, size: 0.1, rise: 0.3, spread: 0.04, life: 1.2, color: '#fff6ea' }); }
  }

  const SM_MARKS = stageMarks();
  const built = shell({
    id: 'commons-hall', light, L, scene, cameras: CAMERAS, actors, foreground, lamps, glows, tick,
    motes: low ? null : { box: [-1.6, 1.6, 0.8, 4.6, BACK + 0.6, -0.2], every: 0.35, color: L.mote, size: 0.06, vel: [0.02, -0.03, 0.05], life: 6, alpha: 0.75 },
    marks: {
      ...SM_MARKS, focus: lampPos[0], credit,
      board: { pos: [credit[0][0] + 0.5, 0, BACK + 0.95], face: 180 }, table: { pos: [TABLE[0] - 0.3, 0, TABLE[2] - 0.7], face: TABLE_YAW },
      client: { pos: [TABLE[0] + 0.45, 0, TABLE[2] + 0.85], face: TABLE_YAW + 180 }, stove: { pos: [STOVE[0] - 0.2, 0, STOVE[2] + 0.95], face: 180 },
      seat: { pos: [5.1, 0, -0.45], face: 180 },
    },
    extra: { setCrowd, setNames, cue, task, crowd: folk },
  });
  built.encounter = () => { for (let i = 0; i < 3; i++) { replyV[i] = 0; replyNodes[i].visible = false; entries[i].visible = false; } };
  return built;
}

export const commonsHall = { id: 'commons-hall', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default commonsHall;
