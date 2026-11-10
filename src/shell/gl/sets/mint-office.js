// SET: mint-office. Chancellor Corvane's room at the Mint, late: wine-red panelling beaded in brass, the
// seal of the Mint over the mantel of a lit fire (centre), an emerald carpet nobody is to mark, a wide desk (stage
// right) with his high chair behind it, tea, a screw press, and the surety bond on a reading stand with
// its four wax discs; a tall window on the night harbour.
// Chapter 1: ch1.s6 Seal of the Mint (Ilse reads the bond aloud; Ren signs it).
//
//   import { mintOffice } from './sets/mint-office.js';
//   const set = mintOffice.build(GL, { light: 'interior', low: false });
//
// Same shape as sets/lantern-stalls.js. Figures face +Z, cameras look toward -Z, the strip x -4.4..4.4,
// z 0..1.6 is clear (the carpet lies in it). Side walls are splayed like stage flats.
//
// What this set can do for its story:
//   task('surety-bond') -> { pos, stand, set(v) }   the bond's four wax discs (M, I, N, T) turn from blank to red at
//                                                   v 0.25 / 0.5 / 0.75 / 1, each with a pop, a sparkle and the press coming down
//   setSeals(n 0..4)                                the same, directly
//   pourTea()                                       the setback tell: steam rises from the pot for a few seconds
// marks: a, b, c, two, party, opposition as everywhere, plus
//   seat { pos, face }: Corvane's chair behind the desk (he never rises)   guest { pos, face }: the chair offered to the Tribune
//   bond (world point: the sheet)   seal (world point: the Mint's seal on the wall)   focus = bond

import { m4, quat, rng, DEG } from '../math.js';
import { merge, tint, place, box, cylinder, sphere, setGlow } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic, makeInstances } from '../scene.js';
import { createSprites } from '../sprites.js';
import { anchorAt } from './kit.js';
import {
  KB, kitBMaterials, setShell, lightOf, wing, norm3, wall, windowFrame, shaftCards, lightPatch, skyline, ceiling, boards, wainscot, cornice, rug, curtain, doorway,
  desk, chair, bookshelf, fileStack, paperPile, scroll, hangingLamp, deskLamp, sconce, candle, fireplace, globe, telescope, teaSet, inkstand, sealPress, mintSeal, scales,
} from './kit-b.js';
import { trimSet } from '../scene.js';
import { withDetail } from '../mesh.js';

const BW = 4.5, BACK = -4.4, FW = 7.0, WING_Z = 2.4, H = 5.6;

const LIGHTS = {
  interior: {
    preset: 'night', power: 1,
    env: {
      key: { dir: norm3([-0.36, 0.7, 0.62]), color: '#ffe0b4' },
      shadow: { tint: '#7a4ec8', lift: 0.11, saturate: 1.45 },
      ambient: { sky: '#ffa888', ground: '#6a40b8', amount: 0.15 },
      rim: { color: '#ffd98a', amount: 0.5, edge: 0.76 },
      fog: { density: 0.0006, start: 40, max: 0.5 },
      sky: { zenith: '#0c1a70', mid: '#243ab0', midAt: 0.45, horizon: '#5a6ae0', below: '#2f3aa0', stars: 1, moon: 0.7, sunDir: norm3([-0.52, 0.36, -1]) },
      water: null,
    },
    shaft: '#9fb8ff', patch: '#9fd0e8',
  },
};

const CAMERAS = {
  wide: { target: [0.25, 1.65, -0.5], dist: 8.4, yaw: -3, pitch: 5, fov: 44, aspect: 0.46, shadowCenter: [0, 0, -1.2], shadowRadius: 7 },
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

function build(engine = null, { light: lightName = 'interior', low = false } = {}) {
  const [light, L] = lightOf('mint-office', LIGHTS, lightName);
  const M = kitBMaterials(), r = rng(808);
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  const WL = wing(-1, BW, BACK, FW, WING_Z), WR = wing(1, BW, BACK, FW, WING_Z);
  const PANEL_H = 3.3, PAN = { color: KB.wine, panel: '#d8527a', bead: KB.brass, rail: KB.wineDark };

  // ---- the room: wine panelling two thirds of the way up, a pale frieze, a deep blue coffered ceiling
  const room = group('room');
  room.add(node('floor', place(boards({ w: 18, d: 16, n: 20, colors: ['#e89a62', '#dc8c56', '#f0a870'], seed: 6 }), 0, 0, 1.6), M.flat));
  const WIN = { x: -2.95, w: 1.9, sill: 1.15, top: 4.5, arch: true };
  room.add(node('back', wall({ w: BW * 2 + 0.4, h: H, t: 0.4, color: '#ffe2c8', openings: [WIN] }), M.wall, { pos: [0, 0, BACK] }));
  room.add(node('panel-bl', tint(place(box(BW + WIN.x - WIN.w / 2 - 0.1, PANEL_H, 0.07), (-BW + WIN.x - WIN.w / 2 - 0.1) / 2, PANEL_H / 2, BACK + 0.035), KB.wine), M.wall));
  room.add(node('panel-sill', tint(place(box(WIN.w + 0.2, WIN.sill - 0.02, 0.07), WIN.x, (WIN.sill - 0.02) / 2, BACK + 0.035), KB.wine), M.wall));
  room.add(node('panel-br', wainscot({ w: BW - WIN.x - WIN.w / 2 - 0.12, h: PANEL_H, n: 5, ...PAN }), M.wall, { pos: [(BW + WIN.x + WIN.w / 2 + 0.12) / 2, 0, BACK] }));
  const DOOR = { x: -0.3, w: 1.5, sill: 0, top: 2.62 };
  room.add(node('wing-l', wall({ w: WL.len + 0.3, h: H, t: 0.4, color: '#ffe2c8' }), M.wall, { pos: WL.pos, rot: [0, WL.yaw, 0] }));
  room.add(node('wing-r', wall({ w: WR.len + 0.3, h: H, t: 0.4, color: '#ffe2c8', openings: [DOOR] }), M.wall, { pos: WR.pos, rot: [0, WR.yaw, 0] }));
  room.add(node('panel-l', wainscot({ w: WL.len, h: PANEL_H, n: 5, ...PAN }), M.wall, { pos: WL.pos, rot: [0, WL.yaw, 0] }));
  for (const [x0, x1] of [[-WR.len / 2, DOOR.x - DOOR.w / 2 - 0.14], [DOOR.x + DOOR.w / 2 + 0.14, WR.len / 2]]) room.add(node('panel-r', wainscot({ w: x1 - x0, h: PANEL_H, n: Math.max(1, Math.round((x1 - x0) / 1.3)), ...PAN }), M.wall, { pos: WR.at((x0 + x1) / 2), rot: [0, WR.yaw, 0] }));
  room.add(node('cornice', cornice({ w: BW * 2, color: KB.brass, dentil: '#fff3dc' }), M.wall, { pos: [0, H - 0.12, BACK] }));
  room.add(node('ceiling', ceiling({ w: 15, d: 8, color: KB.royalDark, beams: 6, beam: KB.navy, bw: 0.3, bh: 0.3 }), M.wall, { pos: [0, H, BACK + 4] }));
  room.add(node('patch', lightPatch({ w: 1.7, d: 2.6, panes: 2, shear: -0.42, color: L.patch, glow: 0.5 }), M.flat, { pos: [WIN.x + 1.2, 0.02, BACK + 2.6] }));
  scene.root.add(mergeStatic(room, 'room'));

  // ---- props
  const props = group('props'), deco = (n) => { n.castShadow = false; return n; };
  props.add(deco(node('window', windowFrame({ w: WIN.w, h: WIN.top - WIN.sill, color: KB.wineDark, bars: 1, fan: ['#ffd65a', '#7fe6d2', '#7fe6d2', '#ffd65a'], glow: 0.85, depth: 0.4 }), M.prop, { pos: [WIN.x, WIN.sill, BACK] })));
  for (const sx of [-1, 1]) props.add(deco(node('curtain', curtain({ w: 0.55, h: 3.6, color: KB.emerald, side: sx }), M.prop, { pos: [WIN.x + sx * (WIN.w / 2 + 0.04), WIN.top + 0.25, BACK + 0.3] })));
  props.add(deco(node('rod', tint(place(box(WIN.w + 1.5, 0.07, 0.07), WIN.x, WIN.top + 0.3, BACK + 0.3), KB.brass), M.prop)));
  // the fire, with the seal of the Mint over the mantel: the middle of the back wall
  const FIRE = [0.05, 0, BACK];
  const fp = fireplace({ w: 2.3, h: 1.75, d: 0.55, color: '#fff3dc', inner: '#4a2a7a', trim: KB.brass });
  props.add(node('fireplace', fp, M.prop, { pos: FIRE }));
  const SEAL = [FIRE[0], 3.35, BACK + 0.1];
  props.add(deco(node('seal', mintSeal({ r: 0.82, glow: 0.8 }), M.prop, { pos: SEAL })));
  const mant = anchorAt(fp, 'mantel', FIRE, 0);
  const cd = candle({ h: 0.26 });
  for (const sx of [-1, 1]) props.add(deco(node('candle', cd, M.prop, { pos: [mant[0] + sx * 0.95, mant[1], mant[2]] })));
  props.add(deco(node('mantel-scales', scales({ h: 0.5, w: 0.5, tilt: -8 }), M.prop, { pos: [mant[0] + 0.45, mant[1], mant[2]] })), deco(node('mantel-globe', globe({ r: 0.2 }), M.prop, { pos: [mant[0] - 0.5, mant[1], mant[2]] })));
  for (const x of [FIRE[0] - 1.5, FIRE[0] + 1.5]) props.add(deco(node('sconce', sconce({ s: 1.4 }), M.prop, { pos: [x, 2.55, BACK + 0.08] })));
  // books in the right corner, a telescope and a globe by the window
  props.add(node('shelf', bookshelf({ w: 1.5, h: 3.0, rows: 5, seed: 5, color: KB.wineDark, back: KB.navy, fill: low ? 0.6 : 0.9 }), M.prop, { pos: [3.72, 0, BACK + 0.3] }));
  props.add(node('telescope', telescope({ len: 1.3 }), M.prop, { pos: [-3.75, 0, -2.9], rot: [0, 200, 0] }));
  props.add(node('side-table', merge(tint(cylinder(0.34, 0.3, 0.05, 10), KB.wineDark), tint(place(cylinder(0.05, 0.04, 0.7, 6), 0, 0.05, 0), KB.brass), tint(place(cylinder(0.44, 0.44, 0.06, 12), 0, 0.75, 0), KB.wineDark)), M.prop, { pos: [-1.95, 0, -3.45] }), deco(node('big-globe', globe({ r: 0.34 }), M.prop, { pos: [-1.95, 0.81, -3.45] })));
  // the desk: stage right, wide, turned a little toward the room
  const DESK = [2.25, 0, -1.5], DESK_YAW = -12;
  const deskMesh = desk({ w: 3.0, d: 1.15, h: 0.86, color: '#c9456a', top: KB.navy, trim: KB.brass, seed: 5 });
  props.add(node('desk', deskMesh, M.prop, { pos: DESK, rot: [0, DESK_YAW, 0] }));
  const on = (name) => anchorAt(deskMesh, name, DESK, DESK_YAW), top = on('top'), SEAT = on('seat');
  const dq = (dx, dz, dy = 0) => { const c = Math.cos(DESK_YAW * DEG), s = Math.sin(DESK_YAW * DEG); return [top[0] + dx * c + dz * s, top[1] + dy, top[2] - dx * s + dz * c]; };
  props.add(node('chancellor-chair', chair({ high: true, s: 1.4, color: KB.brassDark, seat: KB.emerald, knob: KB.brass }), M.prop, { pos: [SEAT[0], 0, SEAT[2] - 0.2], rot: [0, DESK_YAW, 0] }));
  const GUEST = [-2.75, 0, -0.75];
  props.add(node('guest-chair', chair({ s: 1.15, color: KB.wineDark, seat: KB.emerald }), M.prop, { pos: GUEST, rot: [0, 75, 0] }));
  const dl = deskLamp({ s: 1.6, shade: '#ffb040' }), lampAt = dq(1.15, -0.3);
  props.add(deco(node('desk-lamp', dl, M.prop, { pos: lampAt })));
  props.add(deco(node('tea', teaSet({}), M.prop, { pos: dq(-1.0, 0.12), rot: [0, DESK_YAW + 20, 0], scale: 1.25 })));
  props.add(deco(node('ink', inkstand({}), M.prop, { pos: dq(0.72, 0.3), rot: [0, DESK_YAW - 20, 0], scale: 1.2 })), deco(node('papers', paperPile({ n: 4, seed: 6 }), M.prop, { pos: dq(0.6, -0.25) })), deco(node('writ', scroll({}), M.prop, { pos: dq(1.1, 0.25), rot: [0, 50, 0] })));
  // the bond: a tall sheet on a sloped reading stand at the front of the desk, facing the visitors
  const BOND = dq(-0.12, 0.2), BOND_TILT = -24, BW2 = 0.92, BH = 0.92;
  const bondLocal = (x, y, z = 0) => { const t = BOND_TILT * DEG, yy = y * Math.cos(t) - z * Math.sin(t), zz = y * Math.sin(t) + z * Math.cos(t), c = Math.cos(DESK_YAW * DEG), s = Math.sin(DESK_YAW * DEG); return [BOND[0] + x * c + zz * s, BOND[1] + yy, BOND[2] - x * s + zz * c]; };
  const stand = merge(tint(place(box(BW2 + 0.14, BH + 0.1, 0.05), 0, BH / 2 + 0.03, -0.035), KB.brassDark), tint(place(box(BW2 + 0.2, 0.06, 0.14), 0, 0.03, 0.03), KB.brass),
    tint(place(box(BW2, BH, 0.012), 0, BH / 2 + 0.05, 0), KB.parchment), tint(place(box(BW2 * 0.7, 0.05, 0.014), 0, BH * 0.9, 0.004), KB.navy));
  const lines = []; for (let i = 0; i < 7; i++) lines.push(tint(place(box(BW2 * (0.72 - (i % 3) * 0.08), 0.022, 0.014), -BW2 * 0.04 * (i % 3), BH * (0.78 - i * 0.075), 0.004), '#8f9bd8'));
  props.add(deco(node('bond', merge(stand, ...lines, tint(place(box(0.05, 0.3, 0.014), -BW2 * 0.42, BH * 0.12, 0.006), KB.ribbon), tint(place(box(0.05, 0.3, 0.014), BW2 * 0.42, BH * 0.12, 0.006), KB.ribbon)), M.prop, { pos: BOND, rot: [BOND_TILT, DESK_YAW, 0] })));
  const press = sealPress({ s: 1.5 }), PRESS = dq(-0.62, -0.28);
  props.add(deco(node('press', press.frame, M.prop, { pos: PRESS, rot: [0, DESK_YAW, 0] })));
  // the way in, in the right wing; a cabinet of files beside it
  const door = doorway({ w: 1.4, h: 2.5, open: 50, color: KB.emerald, frame: KB.brass, glass: null, side: -1 });
  props.add(node('door', door, M.prop, { pos: WR.at(DOOR.x, 0), rot: [0, WR.yaw, 0] }));
  props.add(node('cabinet', bookshelf({ w: 1.5, h: 1.5, rows: 2, seed: 9, color: KB.wineDark, colors: [KB.parchment, '#ffe6b0', KB.teal, KB.ribbon], fill: 0.9, top: false }), M.prop, { pos: WR.at(1.9, 0.3), rot: [0, WR.yaw, 0] }), deco(node('cabinet-files', fileStack({ n: 3, seed: 2 }), M.prop, { pos: WR.at(1.9, 0.3, 1.52) })));
  // left wing: a portrait and a long case of ledgers
  const frame = (w, h, c, c2) => merge(tint(place(box(w, h, 0.07), 0, 0, 0.035), KB.brass), tint(place(box(w - 0.16, h - 0.16, 0.02), 0, 0, 0.075), c), tint(place(sphere(Math.min(w, h) * 0.2, 8, 5), 0, h * 0.06, 0.07, 0, 0, 0, 1, 1, 0.3), c2), tint(place(box(w * 0.5, h * 0.26, 0.02), 0, -h * 0.27, 0.08), c2));
  props.add(deco(node('portrait', frame(1.1, 1.4, KB.royal, '#ffd8b0'), M.prop, { pos: WL.at(0.3, 0.03, 2.2), rot: [0, WL.yaw, 0] })), deco(node('portrait2', frame(0.8, 1.0, KB.emeraldDark, '#ffe6c8'), M.prop, { pos: WL.at(-1.6, 0.03, 2.4), rot: [0, WL.yaw, 2] })));
  props.add(node('ledger-case', bookshelf({ w: 2.2, h: 1.2, rows: 2, seed: 13, color: KB.wineDark, fill: low ? 0.6 : 0.9, top: false }), M.prop, { pos: WL.at(0.2, 0.3), rot: [0, WL.yaw, 0] }), deco(node('case-lamp', cd, M.prop, { pos: WL.at(0.8, 0.3, 1.22) })));
  const HANG = [-0.6, H, -1.6];
  const hl = hangingLamp({ drop: 1.7, r: 0.42, shape: 'globe', glass: '#ffe2a0' });
  props.add(deco(node('hanging-lamp', hl, M.prop, { pos: HANG })));
  // "mind the carpet"
  props.add(deco(node('carpet', rug({ w: 6.6, d: 3.3, field: KB.emerald, border: KB.brass, line: '#fff3dc', medallion: KB.wine }), M.prop, { pos: [-0.2, 0, 0.7], rot: [0, -2, 0] })));
  scene.root.add(mergeStatic(props, 'props'));

  // ---- the press's screw and the four wax discs: the only things that move
  const screwRest = anchorAt(press, 'screw', PRESS, DESK_YAW);
  const screw = node('press-screw', press.screw, M.prop, { pos: screwRest, rot: [0, DESK_YAW, 0] }); screw.castShadow = false; scene.root.add(screw);
  const wax = node('wax', merge(tint(place(cylinder(0.095, 0.095, 0.035, 10), 0, 0, 0, 90, 0, 0), '#ffffff'), tint(place(cylinder(0.055, 0.055, 0.014, 8), 0, 0, 0.035, 90, 0, 0), [0.86, 0.86, 0.86])), M.prop);
  wax.castShadow = false; wax.instances = makeInstances(4); wax.instances.count = 4; scene.root.add(wax);
  const waxPos = [0, 1, 2, 3].map((i) => bondLocal((i - 1.5) * 0.215, 0.2, 0.012));

  // ---- outside the window: the harbour roofs, low, so the moon and sky fill the glass
  const out = group('outside');
  out.add(node('town', skyline({ w: 12, h: 2.2, seed: 12, lanterns: true }), M.speck, { pos: [WIN.x, 0.6, BACK - 3] }));
  scene.root.add(mergeStatic(out, 'outside'));
  if (!low) scene.root.add(node('shafts', place(shaftCards({ w: WIN.w * 0.8, h: (WIN.top - WIN.sill) * 0.7, dir: [0.42, -1, 0.85], len: 5.0, cards: 3, color: L.shaft }), WIN.x, (WIN.sill + WIN.top) / 2, BACK + 0.05), M.shaft));

  // ---- foreground: the backs of two chairs, as if from the door
  const fg = group('fg');
  fg.add(node('fg-chair', chair({ s: 1.15, color: KB.wineDark, seat: KB.emerald }), M.prop, { pos: [-1.6, 0, 3.0], rot: [0, 160, 0] }), node('fg-table', merge(tint(cylinder(0.3, 0.26, 0.05, 10), KB.wineDark), tint(place(cylinder(0.045, 0.04, 0.55, 6), 0, 0.05, 0), KB.brass), tint(place(cylinder(0.36, 0.36, 0.05, 12), 0, 0.6, 0), KB.wineDark)), M.prop, { pos: [1.65, 0, 2.95] }), node('fg-candle', cd, M.prop, { pos: [1.65, 0.65, 2.95] }));
  const foreground = mergeStatic(fg, 'foreground'); scene.root.add(foreground);

  const actors = group('actors'); scene.root.add(actors);

  // ---- lamps
  const fire = anchorAt(fp, 'fire', FIRE, 0), deskLampPos = [lampAt[0], lampAt[1] + dl.anchors.lamp[1], lampAt[2]];
  const hangPos = [HANG[0] + hl.anchors.lamp[0], HANG[1] + hl.anchors.lamp[1], HANG[2] + hl.anchors.lamp[2]];
  const lamps = [
    { name: 'hanging', pos: hangPos, color: '#ffd080', radius: 7.5, base: 0.95 },
    { name: 'fire', pos: [fire[0], fire[1] + 0.2, fire[2] + 0.5], color: '#ff8a3c', radius: 5.2, base: 1.15, flicker: 0.16 },
    { name: 'desk', pos: deskLampPos, color: '#ffc468', radius: 3.6, base: 1.0 },
    { name: 'seal', pos: [SEAL[0] - 0.5, SEAL[1] + 0.5, SEAL[2] + 1.0], color: '#ffd27a', radius: 3.0, base: 1.0 },
    { name: 'window', pos: [WIN.x + 0.4, 2.3, BACK + 1.7], color: '#8fa8ff', radius: 4.6, base: 1.15, flicker: 0 },
    { name: 'door', pos: WR.at(DOOR.x, -0.9, 1.6), color: '#ffa860', radius: 4.2, base: 0.8 },
  ];
  const sprites = scene.sprites = createSprites(low ? 96 : 256), glows = [];
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: hangPos, size: 2.4, color: '#ffc060', alpha: 0 }), base: 0.45 });
  const fireGlow = sprites.add({ kind: 'glow', pos: [fire[0], fire[1], fire[2] + 0.1], size: 2.4, color: '#ff8a30', alpha: 0.6 });
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: deskLampPos, size: 1.5, color: '#ffb850', alpha: 0 }), base: 0.55 });
  for (const sx of [-1, 1]) { glows.push({ sprite: sprites.add({ kind: 'glow', pos: [mant[0] + sx * 0.95, mant[1] + 0.34, mant[2]], size: 0.7, color: '#ffd070', alpha: 0 }), base: 0.6 }); glows.push({ sprite: sprites.add({ kind: 'glow', pos: [FIRE[0] + sx * 1.5, 2.85, BACK + 0.45], size: 1.2, color: '#ffb450', alpha: 0 }), base: 0.5 }); }
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: [SEAL[0], SEAL[1] + 0.33, SEAL[2] + 0.1], size: 1.1, color: '#ff9a3c', alpha: 0 }), base: 0.45, fixed: true });

  // ---- per-frame
  const Q = quat.create(), S3 = [1, 1, 1], Mx = m4.create(), P = [0, 0, 0], V = [0, 0, 0], rnd = rng(31);
  const seal = [0, 0, 0, 0].map(() => ({ on: 0, pop: 0, mix: 0 }));
  let pressT = -1, teaT = -1, nextEmber = 0, nextSteam = 0;
  quat.fromEuler(Q, BOND_TILT * DEG, DESK_YAW * DEG, 0);
  function setSeals(n) {
    n = Math.max(0, Math.min(4, Math.round(n)));
    for (let i = 0; i < 4; i++) { const want = i < n ? 1 : 0; if (want && !seal[i].on) { seal[i].pop = 1; pressT = 0; sprites.sparkle(waxPos[i], { count: 5, size: 0.2, spread: 0.3, life: 0.7, color: '#ffe6a0' }); } seal[i].on = want; }
  }
  function pourTea() { teaT = 0; }
  const TEA = dq(-1.12, 0.12, 0.3);
  const TASK = { pos: bondLocal(0, BH * 0.5, 0.02), stand: [BOND[0] - 0.75, BOND[2] + 0.95], set(v) { setSeals(Math.floor(v * 4 + 1e-4)); } };
  const task = (type) => (type === 'surety-bond' ? TASK : null);
  const BLANK = [0.96, 0.9, 0.74], RED = [0.95, 0.2, 0.22];
  function tick(time, dt, pw, live) {
    for (let i = 0; i < 4; i++) {
      const s = seal[i]; s.pop = Math.max(0, s.pop - dt * 3.5); s.mix += (s.on - s.mix) * Math.min(1, dt * 12 + (dt === 0 ? 1 : 0));
      S3[0] = S3[1] = S3[2] = 1 + s.mix * 0.25 + s.pop * 0.7; m4.fromTRS(Mx, waxPos[i], Q, S3);
      const d = wax.instances.data, o = i * 20; d.set(Mx, o);
      for (let k = 0; k < 3; k++) d[o + 16 + k] = BLANK[k] + (RED[k] - BLANK[k]) * s.mix;
    }
    wax.instances.dirty = true;
    let drop = 0;
    if (pressT >= 0) { pressT += dt; const u = pressT / 0.6; drop = u < 0.3 ? u / 0.3 : Math.max(0, 1 - (u - 0.3) / 0.7); if (u >= 1) pressT = -1; }
    screw.position[1] = screwRest[1] - drop * press.anchors.drop * 1.4; screw.setRot(0, DESK_YAW + drop * 200, 0);
    fireGlow.alpha = (0.5 + 0.12 * Math.sin(time * 9.1) * Math.sin(time * 5.3)) * Math.min(1.2, pw); fireGlow.size[0] = fireGlow.size[1] = 2.3 + 0.2 * Math.sin(time * 7.7);
    if (!live) return;
    if (!low && time > nextEmber) { nextEmber = time + 0.28; P[0] = fire[0] + (rnd() - 0.5) * 0.7; P[1] = fire[1] + 0.1; P[2] = fire[2] + 0.05; V[0] = (rnd() - 0.5) * 0.15; V[1] = 0.5 + rnd() * 0.4; V[2] = 0.12; sprites.spawn({ kind: 'glow', pos: P, vel: V, size: 0.07 + rnd() * 0.05, life: 1.6, color: '#ffb050', alpha: 0.95 }); }
    if (teaT >= 0) { teaT += dt; if (time > nextSteam) { nextSteam = time + 0.16; sprites.puff(TEA, { count: 1, size: 0.16, rise: 0.5, spread: 0.05, life: 1.6, color: '#ffffff' }); } if (teaT > 3) teaT = -1; }
  }

  return setShell({
    id: 'mint-office', light, L, scene, cameras: CAMERAS, actors, foreground, lamps, glows, tick,
    motes: low ? null : { box: [WIN.x - 0.4, WIN.x + 2.4, 0.4, 3.4, BACK + 0.4, -0.6], every: 0.45, color: '#dfe8ff', size: 0.06, vel: [0.03, -0.015, 0.04], life: 6, alpha: 0.7 },
    marks: {
      ...MARKS, seat: { pos: [SEAT[0], 0, SEAT[2]], face: DESK_YAW }, guest: { pos: GUEST, face: 75 },
      bond: TASK.pos, seal: SEAL, focus: TASK.pos,
    },
    extra: { setSeals, pourTea, task },
  });
}

export const mintOffice = { id: 'mint-office', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build: (g, o) => { const set = withDetail(o && o.low ? 0.7 : 1, () => build(g, o)); trimSet(set); return set; } };   // low: round things are cut with 0.7 of their segments (mesh.js withDetail); trimSet: each pass skips the triangles its cameras can never see
export default mintOffice;
