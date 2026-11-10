// SET: proctor-office. Proctor Thorne's office at the top of the east stair, at first light: the east window
// behind her desk with the yard, the sea and the mole in it, its four panes laid across the boards; every
// class she has passed out in rows of frames, and one frame taken down; cadet files by the year; a regulator
// clock; the Line, her end of it, with its one amber valve; a green-shaded lamp she has not lit and nothing on
// the desk that is not square to the edge. A stove keeps the only warmth in the room.
// Chapter 3: ch3.s5 (the Carrow folder on her desk; "Sit down, Ren"; she straightens his collar).
// The epilogue's "lamp burned in an east window, long past the hour for lamps" is this room: light 'night'.
//
//   import { proctorOffice } from './sets/proctor-office.js';
//   const set = proctorOffice.build(GL, { light: 'dawn' | 'night', low: false });
//
// Same shape as sets/lantern-stalls.js. Figures face +Z, cameras look toward -Z. The strip x -3.2..3.2,
// z 0..1.6 is clear (the rug lies in it). The side walls are splayed like stage flats.
//
// What this set can do for its story:
//   placeFolder(on)      the Carrow folder on the desk, square to the edge, thinner than you would guess
//   setLine(0..1)        the Line's valve: 0 dark, 1 live and humming (it is live by default: she would rather hear nothing from it than know it was in a drawer)
//   lightLamp(on)        the desk lamp (lit in 'night', not in 'dawn')
//   task(type)           'folder' | 'proctor-desk' -> { pos, stand, set(v) } (v >= 0.5 puts the folder down); else null
// marks: a, b, c, two, party, opposition as everywhere, plus
//   seat { pos, face }: her chair, back to the window     guest { pos, face }: the chair he does not take
//   desk { pos, face }: standing at the front of the desk     frame (world point: the gap on the wall)     line (world point: the valve)
//   focus: the window

import { rng, DEG } from '../math.js';
import { merge, tint, place, box, cylinder, sphere, lathe, quad, setGlow, setOutline } from '../mesh.js';
import { node, group, material, makeEnv, createScene, mergeStatic } from '../scene.js';
import { createSprites } from '../sprites.js';
import { anchorAt } from './kit.js';
import { KB, kitBMaterials, setShell, lightOf, wing, norm3, wall, windowFrame, shaftCards, lightPatch, ceiling, boards, wainscot, rug, curtain, doorway, desk, chair, bookshelf, globe, inkstand, paperPile } from './kit-b.js';
import { H3, plumb, gonfalon, pixelText, frameWall, lineSet, stove, cabinet, regulator } from './kit-ch3.js';

const BW = 4.5, BACK = -4.5, FW = 7.0, WING_Z = 2.4, H = 5.5;

const LIGHTS = {
  dawn: {
    preset: 'day', power: 0.5, night: false,
    env: {
      key: { dir: norm3([0.4, 0.5, -0.77]), color: '#ffe9c4' }, // first light comes in low through the east window behind her: everything throws its shadow down the room
      shadow: { tint: '#7f86ec', lift: 0.1, saturate: 1.4 },
      ambient: { sky: '#c8dcff', ground: '#ffd0b8', amount: 0.14 },
      rim: { color: '#fff0c8', amount: 0.7, edge: 0.74 },
      fog: { density: 0.0006, start: 40, max: 0.4 },
      sky: { zenith: '#4a7ae0', mid: '#a8b8f6', horizon: '#ffe2b0', below: '#ffd0a0' },
      water: null,
    },
    sky: ['#ffc070', '#ffd98a', '#9fd0ff'], sea: '#4a8cf0', sun: '#fffbe0', shaft: '#ffd98a', patch: '#ffe9a8', shaftNear: 0.26, lampLit: false, wallUp: '#c3c9fb',
  },
  night: {
    preset: 'night', power: 1.1, night: true,
    env: {
      key: { dir: norm3([-0.34, 0.7, 0.62]), color: '#90a6f4' },
      shadow: { tint: '#2f3fa8', lift: 0.13, saturate: 1.3 },
      ambient: { sky: '#4c6ce0', ground: '#33379c', amount: 0.17 },
      rim: { color: '#bcd0ff', amount: 0.6, edge: 0.76 },
      fog: { density: 0.0006, start: 40, max: 0.4 },
      sky: { zenith: '#0c1a70', mid: '#243ab0', horizon: '#5a78e0', below: '#2f3aa0', stars: 1, moon: 0.7 },
      water: null,
    },
    sky: ['#4a66d8', '#3350c4', '#22349c'], sea: '#2a44b0', sun: '#f4f6ff', shaft: '#9fb8ff', patch: '#a8c0ff', shaftNear: 0.3, lampLit: true, wallUp: '#a9b2f2',
  },
};

const CAMERAS = {
  wide: { target: [0.2, 1.65, -0.5], dist: 8.4, yaw: 2, pitch: 5, fov: 44, aspect: 0.46, shadowCenter: [0, 0, -1.2], shadowRadius: 7 },
  two: { target: [0, 1.12, 0.6], dist: 6.0, yaw: -15, pitch: 5, fov: 31, aspect: 0.46, shadowCenter: [0, 0, 0.3], shadowRadius: 3.6 },
  close: { target: [0.02, 0.86, 0.8], dist: 3.9, yaw: 21, pitch: 3, fov: 28, aspect: 0.46, shadowCenter: [0, 0, 0.5], shadowRadius: 2.6 },
  low: { target: [0.5, 1.6, -0.6], dist: 6.0, yaw: -8, pitch: -9, fov: 54, aspect: 0.46, shadowCenter: [0, 0, -1], shadowRadius: 7 },
  stage: { target: [-0.1, 1.1, 0.2], dist: 9.6, yaw: -9, pitch: 6, fov: 26, aspect: 1.95, shadowCenter: [0, 0, -0.8], shadowRadius: 7, outline: 0.7 },
  landscape: { target: [0, 1.7, -1.2], dist: 9.6, yaw: 4, pitch: 5, fov: 40, aspect: 1.6, shadowCenter: [0, 0, -1.5], shadowRadius: 9 },
};

const MARKS = {
  a: { pos: [-0.8, 0, 0.55], face: 14 }, b: { pos: [0.02, 0, 0.8], face: 0 }, c: { pos: [0.82, 0, 0.55], face: -14 },
  two: [{ pos: [-0.42, 0, 0.62], face: 24 }, { pos: [0.42, 0, 0.62], face: -24 }],
  party: [{ pos: [-1.05, 0, 0.75], face: 78 }, { pos: [-1.85, 0, 1.15], face: 72 }, { pos: [-2.5, 0, 0.5], face: 80 }],
  opposition: [{ pos: [1.05, 0, 0.75], face: -78 }, { pos: [1.85, 0, 1.15], face: -72 }, { pos: [2.55, 0, 0.5], face: -80 }],
};

function build(engine = null, { light: lightName = 'dawn', low = false } = {}) {
  const [light, L] = lightOf('proctor-office', LIGHTS, lightName);
  const M = kitBMaterials(), r = rng(515);
  M.deco = material({ name: 'office-deco', rim: 0, outline: false, castShadow: false });
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  const WL = wing(-1, BW, BACK, FW, WING_Z), WR = wing(1, BW, BACK, FW, WING_Z);
  const deco = (n) => { n.castShadow = false; return n; };
  const PANEL_H = 1.7, PAN = { color: H3.tealDark, panel: H3.teal, bead: H3.silver, rail: H3.tealDeep };

  // ---- the room: teal panelling to the shoulder, pale above, a deep blue ceiling
  const room = group('room');
  room.add(node('floor', place(boards({ w: 18, d: 16, n: 20, colors: ['#f0c898', '#e8bc88', '#f6d4a8'], seed: 8 }), 0, 0, 1.6), M.flat));
  const WIN = { x: 1.55, w: 2.9, sill: 1.05, top: 4.7, arch: true };
  room.add(node('back', wall({ w: BW * 2 + 0.4, h: H, t: 0.4, color: L.wallUp, openings: [WIN] }), M.wall, { pos: [0, 0, BACK] }));
  { const x0 = -BW, x1 = WIN.x - WIN.w / 2 - 0.14; room.add(node('panel-bl', wainscot({ w: x1 - x0, h: PANEL_H, n: 4, ...PAN }), M.wall, { pos: [(x0 + x1) / 2, 0, BACK] })); }
  { const x0 = WIN.x + WIN.w / 2 + 0.14, x1 = BW; room.add(node('panel-br', wainscot({ w: x1 - x0, h: PANEL_H, n: 1, ...PAN }), M.wall, { pos: [(x0 + x1) / 2, 0, BACK] })); }
  room.add(node('panel-sill', tint(place(box(WIN.w + 0.3, WIN.sill - 0.02, 0.07), WIN.x, (WIN.sill - 0.02) / 2, BACK + 0.035), H3.tealDark), M.wall));
  const DOOR = { x: 1.6, w: 1.5, sill: 0, top: 2.65 };
  room.add(node('wing-l', wall({ w: WL.len + 0.3, h: H, t: 0.4, color: L.wallUp, openings: [DOOR] }), M.wall, { pos: WL.pos, rot: [0, WL.yaw, 0] }));
  room.add(node('wing-r', wall({ w: WR.len + 0.3, h: H, t: 0.4, color: L.wallUp }), M.wall, { pos: WR.pos, rot: [0, WR.yaw, 0] }));
  for (const [x0, x1] of [[-WL.len / 2, DOOR.x - DOOR.w / 2 - 0.14], [DOOR.x + DOOR.w / 2 + 0.14, WL.len / 2]]) room.add(node('panel-l', wainscot({ w: x1 - x0, h: PANEL_H, n: Math.max(1, Math.round((x1 - x0) / 1.3)), ...PAN }), M.wall, { pos: WL.at((x0 + x1) / 2), rot: [0, WL.yaw, 0] }));
  room.add(node('panel-r', wainscot({ w: WR.len, h: PANEL_H, n: 5, ...PAN }), M.wall, { pos: WR.pos, rot: [0, WR.yaw, 0] }));
  room.add(node('ceiling', ceiling({ w: 15, d: 8, color: '#4a5cd0', beams: 5, beam: '#3a48b8', bw: 0.3, bh: 0.3 }), M.wall, { pos: [0, H, BACK + 4] }));
  // what the window shows: sky going from gold at the sea to blue, the sun just up, the sea, the mole and its light, the ferry
  const wy0 = WIN.sill, wh = WIN.top - WIN.sill, view = [];
  L.sky.forEach((c, i) => view.push(setGlow(tint(place(box(WIN.w, wh * 0.26, 0.04), WIN.x, wy0 + wh * (0.36 + i * 0.26), BACK - 0.5), c), 0.95)));
  view.push(setGlow(tint(place(box(WIN.w, wh * 0.24, 0.05), WIN.x, wy0 + wh * 0.12, BACK - 0.48), L.sea), 0.85));
  view.push(setGlow(tint(place(cylinder(0.3, 0.3, 0.03, 14), WIN.x + 0.5, wy0 + wh * (L.night ? 0.66 : 0.34), BACK - 0.46, 90, 0, 0), L.sun), 1));
  view.push(tint(place(box(1.5, 0.09, 0.05), WIN.x - 0.5, wy0 + wh * 0.2, BACK - 0.44, 0, 0, -3), '#7a86d8'), tint(place(box(0.1, 0.34, 0.05), WIN.x + 0.22, wy0 + wh * 0.25, BACK - 0.44), '#fff8ea'), setGlow(tint(place(box(0.12, 0.08, 0.05), WIN.x + 0.22, wy0 + wh * 0.3, BACK - 0.43), '#ffd070'), 1));
  view.push(tint(place(box(0.44, 0.1, 0.05), WIN.x - 0.75, wy0 + wh * 0.14, BACK - 0.43), '#fff8ea'), tint(place(box(0.2, 0.09, 0.05), WIN.x - 0.78, wy0 + wh * 0.17, BACK - 0.43), H3.coral));
  room.add(node('view', merge(view), M.deco));
  room.add(node('patch', lightPatch({ w: 2.3, d: 3.2, panes: 2, rows: 2, shear: 0.5, color: L.patch, glow: 0.55 }), M.flat, { pos: [WIN.x - 1.6, 0.014, BACK + 3.5] }));
  scene.root.add(mergeStatic(room, 'room'));

  // ---- props
  const props = group('props'), small = group('small');
  small.add(node('window', windowFrame({ w: WIN.w, h: wh, color: '#fff8ea', bars: 1, fan: null, depth: 0.42, thick: 0.14, sillOut: 0.2 }), M.wall, { pos: [WIN.x, WIN.sill, BACK] }));
  for (const sx of [-1, 1]) small.add(node('curtain', curtain({ w: 0.6, h: 4.0, color: '#c23a5e', tie: H3.silver, side: sx }), M.wall, { pos: [WIN.x + sx * (WIN.w / 2 + 0.06), WIN.top + 0.3, BACK + 0.3] }));
  small.add(node('rod', tint(place(box(WIN.w + 1.6, 0.07, 0.07), WIN.x, WIN.top + 0.35, BACK + 0.3), H3.silver), M.wall));
  // every class she has passed out, in rows; one frame has been taken down
  const FR = [-2.2, 3.25, BACK + 0.02], fwall = frameWall({ cols: 4, rows: 3, fw: 0.56, fh: 0.44, gapX: 0.14, gapY: 0.14, frame: H3.brassDark, seed: 4, gaps: [[2, 1]], patch: '#e2e6ff' });
  small.add(node('frames', fwall, M.wall, { pos: FR }));
  const GAP = anchorAt(fwall, 'gaps', FR)[0];
  // cadet files, by year: a run of cabinets under the frames
  const YEARS = [1858, 1859, 1860, 1861];
  YEARS.forEach((y, i) => props.add(node('files' + i, cabinet({ w: 0.86, h: 1.5, d: 0.46, rows: 4, cols: 1, year: y, seed: 3 + i, color: H3.tealDeep, front: i % 2 ? H3.teal : '#3fd0bc' }), M.prop, { pos: [-3.6 + i * 0.92, 0, BACK + 0.03] })));
  // the regulator, between the frames and the window
  const reg = regulator({ h: 2.5, w: 0.62, wood: '#8a4a5c' }), REG = [-0.3, 0.9, BACK + 0.02];
  small.add(node('regulator', reg.body, M.wall, { pos: REG }));
  // her desk in front of the window, turned a little to the room; her chair with its back to the light
  const DESK = [1.45, 0, -2.3], DESK_YAW = -8;
  const deskMesh = desk({ w: 2.7, d: 1.05, h: 0.86, color: H3.tealDark, top: '#c23a5e', trim: H3.silver, seed: 9, lean: 0.006 });
  props.add(node('desk', deskMesh, M.prop, { pos: DESK, rot: [0, DESK_YAW, 0] }));
  const on = (name) => anchorAt(deskMesh, name, DESK, DESK_YAW), top = on('top'), SEAT = on('seat');
  const dq = (dx, dz, dy = 0) => { const c = Math.cos(DESK_YAW * DEG), s = Math.sin(DESK_YAW * DEG); return [top[0] + dx * c + dz * s, top[1] + dy, top[2] - dx * s + dz * c]; };
  props.add(node('her-chair', chair({ high: true, s: 1.35, color: H3.tealDeep, seat: '#c23a5e', knob: H3.silver }), M.prop, { pos: [SEAT[0], 0, SEAT[2] - 0.15], rot: [0, DESK_YAW, 0] }));
  const GUEST = [-0.55, 0, -1.25];
  props.add(node('guest-chair', chair({ s: 1.1, color: H3.tealDeep, seat: '#c23a5e' }), M.prop, { pos: GUEST, rot: [0, 155, 0] }));
  // on the desk, square to the edge: the lamp, an inkstand, a tray of papers, the frame she took down, face down
  const lampAt = dq(-1.05, -0.28), LAMP = [lampAt[0], lampAt[1] + 0.5, lampAt[2] + 0.06];
  const lampMesh = merge(tint(lathe([[0, 0], [0.11, 0], [0.1, 0.03], [0.03, 0.06], [0.022, 0.3], [0, 0.3]], 8, { crease: 50 }), H3.silver), (L.lampLit ? (m) => setGlow(m, 0.7) : (m) => m)(tint(place(lathe([[0.2, 0], [0.2, 0.05], [0.1, 0.13], [0, 0.14]], 10, { crease: 50 }), 0, 0.28, 0, 0, 0, 0, 1, 1, 0.7), L.lampLit ? '#4fe0a0' : H3.green)), ...(L.lampLit ? [setGlow(tint(place(sphere(0.075, 6, 4), 0, 0.27, 0), '#fff2c0'), 1)] : []));
  small.add(node('desk-lamp', lampMesh, M.wall, { pos: lampAt, rot: [0, DESK_YAW, 0], scale: 1.7 }));
  small.add(node('ink', inkstand({ metal: H3.silver }), M.wall, { pos: dq(0.95, -0.25), rot: [0, DESK_YAW, 0], scale: 1.2 }));
  small.add(node('tray', merge(tint(place(box(0.5, 0.05, 0.36), 0, 0.025, 0), H3.tealDeep), tint(place(box(0.44, 0.04, 0.3), 0, 0.06, 0), H3.paper)), M.wall, { pos: dq(0.95, 0.22), rot: [0, DESK_YAW, 0] }));
  small.add(node('frame-down', merge(tint(place(box(0.56, 0.04, 0.44), 0, 0.02, 0), H3.brassDark), tint(place(box(0.46, 0.012, 0.34), 0, 0.045, 0), '#b89a70')), M.wall, { pos: dq(-0.4, -0.2), rot: [0, DESK_YAW, 0] }));
  // the Line: her end of it, on its own stand by the left wing, wired up the wall
  const LINE = [-3.55, 0.98, -1.35], ls = lineSet({ s: 1.5 });
  props.add(node('line-stand', merge(tint(place(cylinder(0.3, 0.34, 0.06, 8), 0, 0, 0), H3.tealDeep), tint(place(cylinder(0.06, 0.07, 0.9, 6), 0, 0.06, 0), H3.silver), tint(place(cylinder(0.42, 0.42, 0.06, 10), 0, 0.93, 0), H3.tealDeep)), M.prop, { pos: [LINE[0], 0, LINE[2]] }));
  small.add(node('line', ls, M.wall, { pos: LINE, rot: [0, 35, 0] }));
  const VALVE = anchorAt(ls, 'valve', LINE, 35);
  // the stove in the right corner, a scuttle beside it; the Company's colours over it; a globe, a shelf of regulations
  const STOVE = [3.75, 0, -3.5], st = stove({ s: 1.35, pipe: 3.4 });
  props.add(node('stove', st, M.prop, { pos: STOVE, rot: [0, -30, 0] }));
  small.add(node('banner', gonfalon({ w: 0.95, h: 2.1, color: H3.teal, trim: H3.silver, tail: 0.3 }), M.wall, { pos: WR.at(-1.7, 0.08, 4.9), rot: [0, WR.yaw, 0] }));
  props.add(node('shelf', bookshelf({ w: 1.5, h: 2.5, rows: 4, seed: 7, color: H3.tealDeep, back: H3.navy, colors: [H3.teal, '#fff8ea', H3.cadet, '#c23a5e', H3.silver, H3.gold], fill: low ? 0.6 : 0.92 }), M.prop, { pos: WR.at(0.3, 0.3), rot: [0, WR.yaw, 0] }));
  small.add(node('globe', globe({ r: 0.26, metal: H3.silver }), M.wall, { pos: WR.at(0.3, 0.3, 2.56) }));
  // the head of the east stair: the door in the left wing, standing open
  props.add(node('door', doorway({ w: 1.4, h: 2.55, open: 62, color: H3.tealDark, frame: '#fff8ea', knob: H3.silver, side: 1 }), M.prop, { pos: WL.at(DOOR.x, 0), rot: [0, WL.yaw, 0] }));
  small.add(node('plate', merge(tint(place(box(0.9, 0.24, 0.03), 0, 0, 0), H3.silver), place(pixelText('PROCTOR', { s: 0.11, color: H3.tealDeep }), 0, 0, 0.02)), M.wall, { pos: WL.at(DOOR.x, 0.05, 2.95), rot: [0, WL.yaw, 0] }));
  small.add(node('rug', rug({ w: 6.2, d: 3.0, field: '#c23a5e', border: H3.silver, line: '#fff8ea', medallion: H3.teal }), M.wall, { pos: [-0.1, 0, 0.75], rot: [0, 1, 0] }));
  scene.root.add(mergeStatic(props, 'props'), mergeStatic(small, 'small'));

  // the folder, the regulator's bob
  const folder = node('folder', merge(tint(place(box(0.5, 0.025, 0.36), 0, 0.012, 0), '#ffb040'), tint(place(box(0.44, 0.012, 0.3), 0, 0.03, 0.01), H3.paper), tint(place(box(0.2, 0.014, 0.07), -0.1, 0.04, -0.08), H3.red)), M.prop, { pos: dq(-0.05, 0.2), rot: [0, DESK_YAW, 0] });
  folder.castShadow = false; folder.visible = false; scene.root.add(folder);
  const bob = node('bob', reg.bob, M.prop, { pos: anchorAt(reg.body, 'pivot', REG, 0) }); bob.castShadow = false; scene.root.add(bob);

  // ---- drawn light: the window's shaft across the room
  if (!low) scene.root.add(node('shafts', place(shaftCards({ w: WIN.w * 0.82, h: wh * 0.7, dir: [-0.5, -1, 0.95], len: 5.4, cards: 4, color: L.shaft, spread: 0.2 }), WIN.x, WIN.sill + wh * 0.52, BACK + 0.05), material({ kind: 'beam', name: 'office-shaft', beam: { power: 0.6, near: L.shaftNear, far: 0.05, steps: 0 }, outline: false })));

  // ---- foreground: from the stair door, the back of a chair and a hat stand
  const fg = group('fg');
  fg.add(node('fg-chair', chair({ s: 1.1, color: H3.tealDeep, seat: '#c23a5e' }), M.prop, { pos: [-1.7, 0, 3.0], rot: [0, 165, 0] }), node('fg-stand', merge(tint(place(cylinder(0.22, 0.26, 0.06, 8), 0, 0, 0), H3.tealDeep), tint(place(cylinder(0.035, 0.04, 1.5, 6), 0, 0.06, 0), H3.silver), tint(place(sphere(0.07, 6, 4), 0, 1.6, 0), H3.silver)), M.prop, { pos: [1.9, 0, 2.95] }));
  const foreground = mergeStatic(fg, 'foreground'); scene.root.add(foreground);
  const actors = group('actors'); scene.root.add(actors);

  // ---- lamps
  const fire = anchorAt(st, 'fire', STOVE, -30);
  const lamps = [
    { name: 'window', pos: [WIN.x - 0.5, 2.5, BACK + 1.8], color: L.night ? '#8fa8ff' : '#ffd898', radius: 7.5, base: L.night ? 1.0 : 1.8, flicker: 0 },
    { name: 'stove', pos: [fire[0], fire[1] + 0.2, fire[2] + 0.3], color: '#ff8a3c', radius: 4.8, base: L.night ? 1.0 : 2.0, flicker: 0.16 },
    { name: 'line', pos: [VALVE[0], VALVE[1] + 0.1, VALVE[2] + 0.2], color: '#ffa840', radius: 2.8, base: 1.6, flicker: 0.1 },
    { name: 'desk', pos: LAMP, color: '#ffc870', radius: 6, base: L.lampLit ? 1.3 : 0, flicker: 0.04 },
    { name: 'stair', pos: WL.at(DOOR.x, -0.9, 1.6), color: L.night ? '#ffa860' : '#bfe0ff', radius: 4.4, base: 1.6 },
  ];
  const sprites = scene.sprites = createSprites(low ? 96 : 224), glows = [];
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: [WIN.x + 0.5, wy0 + wh * (L.night ? 0.66 : 0.34), BACK + 0.1], size: L.night ? 2.6 : 2.4, color: L.night ? '#cfe0ff' : '#fff0b0', alpha: 0 }), base: L.night ? 0.45 : 0.4, fixed: true });
  const stoveGlow = sprites.add({ kind: 'glow', pos: fire, size: 1.5, color: '#ff8a30', alpha: 0.5 });
  const valveGlow = sprites.add({ kind: 'glow', pos: VALVE, size: 0.8, color: '#ffa840', alpha: 0 });
  const lampGlow = sprites.add({ kind: 'glow', pos: LAMP, size: 2.2, color: '#ffc050', alpha: 0 });

  // ---- levers
  let lineOn = 1, lampOn = L.lampLit ? 1 : 0, nextMote = 0, nextEmber = 0;
  const rnd = rng(61), P = [0, 0, 0], V = [0, 0, 0];
  function placeFolder(on = true) { folder.visible = !!on; }
  function setLine(v) { lineOn = Math.max(0, Math.min(1, v)); }
  function lightLamp(on = true) { lampOn = on ? 1 : 0; }
  const TASK = { pos: dq(-0.05, 0.2, 0.05), stand: [DESK[0] - 0.9, DESK[2] + 1.1], set(v) { placeFolder(v >= 0.5); } };
  // ch3.s5's encounter: the folder goes down on the first step, and on the last the Line goes dim (his end is in a sock)
  const CLIMB = { pos: TASK.pos, stand: TASK.stand, set(v) { placeFolder(v >= 0.45); setLine(v > 0.95 ? 0.15 : 1); } };
  const task = (type) => (type === 'proctor-desk' ? TASK : type === 'folder' ? CLIMB : null);

  function tick(time, dt, pw, live) {
    bob.setRot(0, 0, Math.sin(time * 3.1) * 8);
    stoveGlow.alpha = (0.45 + 0.12 * Math.sin(time * 9.1) * Math.sin(time * 5.3)) * Math.min(1.2, 0.5 + pw); stoveGlow.size[0] = stoveGlow.size[1] = 1.4 + 0.15 * Math.sin(time * 7.7);
    const hum = 0.75 + 0.25 * Math.sin(time * 2.2) * Math.sin(time * 0.7);
    valveGlow.alpha = lineOn * hum * 0.8; env.points[2].intensity *= lineOn * hum;
    lampGlow.alpha = lampOn * 0.55 * Math.min(1.2, pw); env.points[3].intensity = lampOn * 1.3 * pw;
    if (!live || low) return;
    if (time > nextMote) { // dust turning over in the window's light
      nextMote = time + 0.28; const u = rnd(); P[0] = WIN.x - u * 2.0 + (rnd() - 0.5) * 1.6; P[1] = 3.6 - u * 3.2; P[2] = BACK + 0.5 + u * 3.6; V[0] = -0.03; V[1] = -0.02; V[2] = 0.04;
      sprites.spawn({ kind: 'glow', pos: P, vel: V, size: 0.06 + rnd() * 0.05, life: 6, color: L.night ? '#dfe8ff' : '#fff2c8', alpha: 0.8 });
    }
    if (time > nextEmber) { nextEmber = time + 0.5; P[0] = fire[0] + (rnd() - 0.5) * 0.2; P[1] = fire[1] + 0.1; P[2] = fire[2] + 0.05; V[0] = (rnd() - 0.5) * 0.1; V[1] = 0.35 + rnd() * 0.3; V[2] = 0.1; sprites.spawn({ kind: 'glow', pos: P, vel: V, size: 0.05 + rnd() * 0.04, life: 1.4, color: '#ffb050', alpha: 0.9 }); }
  }

  return setShell({
    id: 'proctor-office', light, L, scene, cameras: CAMERAS, actors, foreground, lamps, glows, tick,
    marks: {
      ...MARKS, seat: { pos: [SEAT[0], 0, SEAT[2]], face: DESK_YAW }, guest: { pos: GUEST, face: 155 }, desk: { pos: [TASK.stand[0], 0, TASK.stand[1]], face: 160 },
      frame: GAP, line: VALVE, focus: [WIN.x, 3, BACK],
    },
    extra: { placeFolder, setLine, lightLamp, task },
  });
}

export const proctorOffice = { id: 'proctor-office', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default proctorOffice;
