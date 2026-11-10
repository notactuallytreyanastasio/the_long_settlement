// SET: cell. A cell in the capital kept for persons of standing: dressed blue stone, a window that is high,
// barred and faces nothing, a heavy door with somebody's lantern beyond its grille, and what a person of
// standing is allowed: a cot with a good blanket, a shelf, a washstand, one peg (his greatcoat is on it), a rug,
// a table, a chair, and a lamp that they take away at ten. A moth goes round the lamp.
// Chapter 5: ch5.epi.08..20 (the Magistrate is brought the Tallis record, and reads it twice). Chapter 8: ch8.pro.14.
//
//   import { cell } from './sets/cell.js';
//   const set = cell.build(GL, { light: 'lamp' | 'dark', low: false });
//
// Same shape as sets/lantern-stalls.js. Figures face +Z, cameras look toward -Z, the strip x -3.4..3.4,
// z 0..1.6 is clear (it is a small room: the wings close in at x 3.6 by the back row).
//
// What this set can do for its story:
//   setLamp(0..1)    the lamp on the table (the moth follows it)
//   takeLamp()       it is taken: the flame goes down over four seconds and the cell is the window and the grille
//   cue(lineId)      ch5.epi.08 / ch8.pro.14 (lamp lit), ch5.epi.20 (taken, after a few seconds)
// marks: a, b, c, two, party, opposition as everywhere (opposition[0] is at the door: the turnkey), plus
//   seat { pos, face }: his chair at the table   sheet (world point: the one sheet)   door { pos, face }   focus = the lamp

import { m4, quat, rng, DEG } from '../math.js';
import { merge, tint, place, box, cylinder, sphere, lathe, setGlow, setOutline } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic } from '../scene.js';
import { createSprites } from '../sprites.js';
import { rayMesh, rayMaterial } from '../fx.js';
import { pickLight } from './kit.js';
import { TL, MARKS, ch5Materials, shell, norm, shaft, paving, cot, washstand, coatPeg, barredWindow, cellDoor } from './kit-ch5.js';

const BW = 3.5, BACK = -3.5, FW = 5.6, WING_Z = 2.4, H = 4.4;

const LIGHTS = {
  lamp: {
    preset: 'night', power: 1.1, lamp: 1,
    env: {
      key: { dir: norm([-0.3, 0.7, 0.64]), color: '#8e9af2' },
      shadow: { tint: '#2c34a2', lift: 0.11, saturate: 1.35 },
      ambient: { sky: '#5a6ee4', ground: '#2e308e', amount: 0.17 },
      rim: { color: '#ffd080', amount: 0.8, edge: 0.74 },
      fog: { density: 0.0008, start: 30, max: 0.6 },
      sky: { zenith: '#101c74', mid: '#22389e', midAt: 0.45, horizon: '#4a62d8', below: '#2c3aa0', stars: 0.5, moon: 0 },
      water: null,
    },
  },
  dark: {
    preset: 'night', power: 1.1, lamp: 0.06,
    env: {
      key: { dir: norm([-0.3, 0.7, 0.64]), color: '#7c8aee' },
      shadow: { tint: '#2a30a0', lift: 0.11, saturate: 1.35 },
      ambient: { sky: '#5068e0', ground: '#2a2c8a', amount: 0.17 },
      rim: { color: '#a8c0ff', amount: 0.7, edge: 0.74 },
      fog: { density: 0.0008, start: 30, max: 0.6 },
      sky: { zenith: '#101c74', mid: '#22389e', midAt: 0.45, horizon: '#4a62d8', below: '#2c3aa0', stars: 0.5, moon: 0 },
      water: null,
    },
  },
};

const CAMERAS = {
  wide: { target: [0.15, 1.5, -0.4], dist: 7.6, yaw: -2, pitch: 5, fov: 44, aspect: 0.46, shadowCenter: [0, 0, -0.8], shadowRadius: 6 },
  two: { target: [0, 1.12, 0.6], dist: 6.0, yaw: -15, pitch: 5, fov: 31, aspect: 0.46, shadowCenter: [0, 0, 0.3], shadowRadius: 3.6 },
  close: { target: [0.02, 0.86, 0.8], dist: 3.9, yaw: 21, pitch: 3, fov: 28, aspect: 0.46, shadowCenter: [0, 0, 0.5], shadowRadius: 2.6 },
  low: { target: [0.3, 1.5, -0.6], dist: 5.4, yaw: -8, pitch: -9, fov: 54, aspect: 0.46, shadowCenter: [0, 0, -0.8], shadowRadius: 6 },
  stage: { target: [0, 1.05, 0.2], dist: 9.0, yaw: -9, pitch: 6, fov: 25, aspect: 1.95, shadowCenter: [0, 0, -0.6], shadowRadius: 6.5, outline: 0.7 },
  landscape: { target: [0, 1.5, -1.0], dist: 8.6, yaw: 4, pitch: 5, fov: 40, aspect: 1.6, shadowCenter: [0, 0, -1.2], shadowRadius: 8 },
};

const bx = (w, h, d, x, y, z, c, rx = 0, ry = 0, rz = 0) => tint(place(box(w, h, d), x, y, z, rx, ry, rz), c);

function build(engine = null, { light: lightName = 'lamp', low = false } = {}) {
  const { name: light, L } = pickLight('cell', LIGHTS, lightName);
  const M = ch5Materials(), r = rng(5656);
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  const wingOf = (side) => { const dx = FW - BW, dz = WING_Z - BACK, len = Math.hypot(dx, dz), yaw = Math.atan2(-side * dz, dx) / DEG; return { len, yaw, pos: [side * (BW + FW) / 2, 0, (BACK + WING_Z) / 2] }; };
  const WL = wingOf(-1), WR = wingOf(1);
  const wingAt = (W, lx, out = 0, y = 0) => { const c = Math.cos(W.yaw * DEG), s = Math.sin(W.yaw * DEG); return [W.pos[0] + lx * c + out * s, y, W.pos[2] - lx * s + out * c]; };

  // ---- the cell: dressed stone, flagged floor, a low dark vault
  const room = group('room');
  const STONE = ['#8590ec', '#7882e2', '#929cf2', '#7078da'];
  room.add(node('floor', paving({ w: 14, d: 10, nx: 8, nz: 6, colors: ['#8a84e0', '#7a74d2', '#9a92e8'], grout: '#4c48a8', seed: 3 }), M.flat, { pos: [0, 0, BACK + 5] }));
  room.add(node('back', paving({ w: BW * 2 + 0.3, d: H, nx: 6, nz: 6, colors: STONE, grout: '#4a52b6', seed: 5, gap: 0.05 }), M.flat, { pos: [0, H / 2, BACK], rot: [90, 0, 0] }));
  for (const W of [WL, WR]) room.add(node('wing', paving({ w: W.len + 0.3, d: H, nx: 6, nz: 6, colors: STONE, grout: '#4a52b6', seed: W === WL ? 7 : 9, gap: 0.05 }), M.flat, { pos: W.pos.map((v, i) => (i === 1 ? H / 2 : v)), rot: [90, W.yaw, 0] }));
  room.add(node('ceiling', merge(bx(13, 0.2, 7.5, 0, H + 0.1, BACK + 3.6, '#262e78'), ...[-3.4, -1.1, 1.1, 3.4].map((x) => bx(0.34, 0.36, 7.4, x, H - 0.18, BACK + 3.6, '#1a2260'))), M.wall));
  room.add(node('skirting', bx(BW * 2, 0.26, 0.1, 0, 0.13, BACK + 0.05, '#4a52b6'), M.wall));
  scene.root.add(mergeStatic(room, 'room'));

  // ---- what he is allowed
  const props = group('props'), deco = group('deco');
  const WIN = [-0.55, 3.2, BACK + 0.14];
  deco.add(node('window', barredWindow({ w: 1.15, h: 0.86, bars: 4, sky: '#5f80f0', glow: 0.8 }), M.deco, { pos: WIN }));
  const DOOR = [2.05, 0, BACK + 0.12], cd = cellDoor({ w: 1.2, h: 2.3 });
  props.add(node('door', cd, M.prop, { pos: DOOR }));
  const GRILLE = [DOOR[0] + cd.anchors.grille[0], cd.anchors.grille[1], DOOR[2] + cd.anchors.grille[2]];
  props.add(node('cot', cot({ len: 1.95, w: 0.85, blanket: TL.royal }), M.prop, { pos: wingAt(WL, 0.5, 0.62), rot: [0, WL.yaw, 0] }));
  props.add(node('washstand', washstand({}), M.prop, { pos: [-2.75, 0, BACK + 0.5] }));
  deco.add(node('peg', coatPeg({ len: 1.2 }), M.deco, { pos: [0.75, 2.2, BACK + 0.03] }));
  // the shelf: a few books, a folded cloth, the spectacle case
  deco.add(node('shelf', merge(bx(1.3, 0.07, 0.3, 0, 0, 0.15, TL.woodDark), bx(0.07, 0.24, 0.24, -0.5, -0.14, 0.12, TL.woodDark), bx(0.07, 0.24, 0.24, 0.5, -0.14, 0.12, TL.woodDark),
    ...[['#f4573f', 0.36, -0.45], ['#35c9b5', 0.3, -0.33], ['#ffd24a', 0.34, -0.22], ['#8a6be0', 0.28, -0.1]].map(([c, h, x], i) => bx(0.1, h, 0.22, x, 0.035 + h / 2, 0.15, c, 0, 0, i === 3 ? -14 : 0)), bx(0.3, 0.08, 0.2, 0.3, 0.075, 0.15, TL.paper), bx(0.22, 0.06, 0.1, 0.32, 0.145, 0.16, TL.wine)), M.deco, { pos: [-1.95, 2.25, BACK + 0.02] }));
  props.add(node('rug', merge(bx(3.4, 0.012, 2.1, 0, 0.006, 0, TL.wine), bx(3.0, 0.014, 1.7, 0, 0.008, 0, '#d8527a'), bx(2.6, 0.016, 1.3, 0, 0.01, 0, TL.wine)), M.flat, { pos: [0, 0, 0.55], rot: [0, 3, 0] }));
  // the table and the chair, a little right of the middle: the lamp, and one sheet
  const TABLE = [1.0, 0, -1.3], TOP = 0.8;
  props.add(node('table', merge(bx(1.3, 0.08, 0.8, 0, TOP - 0.04, 0, TL.woodPale), bx(1.14, 0.12, 0.64, 0, TOP - 0.14, 0, TL.wood), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => tint(place(cylinder(0.05, 0.04, TOP - 0.1, 6), sx * 0.54, 0, sz * 0.3), TL.woodDark))), M.prop, { pos: TABLE, rot: [0, -6, 0] }));
  const SHEET = [TABLE[0] - 0.22, TOP + 0.012, TABLE[2] + 0.12];
  deco.add(node('sheet', merge(bx(0.34, 0.012, 0.46, 0, 0, 0, TL.paper, 0, 12, 0), ...[0, 1, 2, 3, 4].map((i) => bx(0.24, 0.014, 0.018, 0.01, 0.002, -0.15 + i * 0.07, '#8f9bd8', 0, 12, 0)), bx(0.14, 0.03, 0.06, 0.36, 0.01, 0.1, TL.brassDark, 0, -20, 0)), M.deco, { pos: SHEET }));
  const SEAT = [TABLE[0] - 0.35, 0, TABLE[2] - 0.75];
  props.add(node('chair', merge(bx(0.5, 0.07, 0.48, 0, 0.44, 0, TL.woodDark), bx(0.42, 0.06, 0.4, 0, 0.5, 0.01, TL.royal), bx(0.5, 0.7, 0.07, 0, 0.84, -0.22, TL.woodDark, -5, 0, 0), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => tint(place(cylinder(0.04, 0.03, 0.42, 5), sx * 0.2, 0, sz * 0.19), TL.woodDark))), M.prop, { pos: [SEAT[0], 0, SEAT[2] - 0.2], rot: [0, 10, 0] }));
  // a slop pail and a stool by the door, where the turnkey puts the tray
  props.add(node('stool', merge(tint(place(cylinder(0.2, 0.2, 0.06, 8), 0, 0.4, 0), TL.wood), ...[0, 1, 2].map((i) => tint(place(cylinder(0.035, 0.028, 0.42, 5), Math.sin(i * 2.094) * 0.13, 0, Math.cos(i * 2.094) * 0.13), TL.wood))), M.prop, { pos: [3.0, 0, -2.3] }));
  scene.root.add(mergeStatic(props, 'props'), mergeStatic(deco, 'deco'));

  // ---- the lamp: its own node, so it can go out
  const LAMP_AT = [TABLE[0] + 0.3, TOP, TABLE[2] - 0.08], FLAME = [LAMP_AT[0], LAMP_AT[1] + 0.34, LAMP_AT[2]];
  const lampBody = node('lamp-body', merge(tint(lathe([[0, 0], [0.12, 0], [0.13, 0.03], [0.05, 0.08], [0.1, 0.15], [0.09, 0.22], [0, 0.22]], 8, { crease: 50 }), TL.brass), tint(place(cylinder(0.1, 0.1, 0.02, 8), 0, 0.46, 0), TL.brass), tint(place(cylinder(0.012, 0.012, 0.14, 4), 0.1, 0.34, 0), TL.brassDark)), M.deco, { pos: LAMP_AT }); lampBody.castShadow = false;
  const lampGlass = node('lamp-glass', setGlow(tint(place(lathe([[0.07, 0], [0.1, 0.08], [0.075, 0.2], [0.05, 0.24], [0, 0.24]], 8, { crease: 180 }), 0, 0.22, 0), '#ffe6a0'), 0.95), M.lantern, { pos: LAMP_AT }); lampGlass.castShadow = false;
  scene.root.add(lampBody, lampGlass);

  // ---- light from the window and from the grille
  if (!low) scene.root.add(node('shafts', merge(
    place(shaft({ w: 1.0, h: 0.7, dir: [0.42, -1, 0.7], len: 4.2, cards: 3, color: '#8fa8ff' }), WIN[0], WIN[1], WIN[2] + 0.1),
    place(shaft({ w: 0.36, h: 0.24, dir: [-0.25, -0.75, 1], len: 2.4, cards: 2, color: '#ffb860', spread: 0.6 }), GRILLE[0], GRILLE[1], GRILLE[2] + 0.02)), M.shaft));
  const cone = node('lamp-cone', tint(place(rayMesh(1.0, 0.1, 1.5, 14), FLAME[0], FLAME[1] + 0.1, FLAME[2]), '#ffc060'), rayMaterial({ power: 1.3, near: 0.3, far: 0 }));
  scene.root.add(cone);

  // ---- foreground: the tray he has not touched
  const fg = group('fg');
  fg.add(node('fg-stool', merge(tint(place(cylinder(0.22, 0.22, 0.06, 8), 0, 0.42, 0), TL.wood), ...[0, 1, 2].map((i) => tint(place(cylinder(0.035, 0.028, 0.44, 5), Math.sin(i * 2.094) * 0.14, 0, Math.cos(i * 2.094) * 0.14), TL.wood)), tint(place(cylinder(0.2, 0.2, 0.02, 8), 0, 0.49, 0), TL.brassDark), tint(place(cylinder(0.07, 0.06, 0.09, 6), 0.05, 0.5, 0.02), TL.paper)), M.prop, { pos: [-1.7, 0, 2.9] }));
  const foreground = mergeStatic(fg, 'foreground'); scene.root.add(foreground);
  const actors = group('actors'); scene.root.add(actors);

  // ---- lamps
  const lamps = [
    { name: 'lamp', pos: [FLAME[0] - 0.2, FLAME[1] + 0.4, FLAME[2] + 0.7], color: '#ffc060', radius: 7.0, base: 1.6, flicker: 0.1, gain: L.lamp },
    { name: 'window', pos: [WIN[0] + 0.5, 2.2, BACK + 1.5], color: '#7f98ff', radius: 4.8, base: 1.0, flicker: 0 },
    { name: 'grille', pos: [GRILLE[0] - 0.15, GRILLE[1] - 0.2, GRILLE[2] + 0.7], color: '#ffb060', radius: 3.4, base: 0.9, flicker: 0.12 },
  ];
  const sprites = scene.sprites = createSprites(low ? 64 : 160), glows = [];
  const lampGlow = { sprite: sprites.add({ kind: 'glow', pos: FLAME, size: 1.9, color: '#ffb850', alpha: 0 }), base: 0.6, gain: L.lamp };
  glows.push(lampGlow, { sprite: sprites.add({ kind: 'glow', pos: GRILLE, size: 1.0, color: '#ffb450', alpha: 0 }), base: 0.5, fixed: true }, { sprite: sprites.add({ kind: 'glow', pos: [WIN[0], WIN[1], WIN[2] + 0.1], size: 2.0, color: '#7f98ff', alpha: 0 }), base: 0.3, fixed: true });
  const moth = sprites.add({ kind: 'dot', pos: [FLAME[0], FLAME[1], FLAME[2]], size: [0.07, 0.045], color: '#fff6e0', alpha: 0.95 });

  // ---- per-frame
  let lamp = L.lamp, shown = L.lamp, takeT = -1;
  const setLamp = (v) => { lamp = Math.max(0, Math.min(1, v)); takeT = -1; };
  const takeLamp = () => { takeT = 0; };
  const CUES = { 'ch5.epi.08': () => setLamp(1), 'ch8.pro.14': () => setLamp(1), 'ch5.epi.20': takeLamp };
  const cue = (id) => { const f = CUES[id]; if (f) f(); return !!f; };
  function tick(time, dt, pw) {
    if (takeT >= 0) { takeT += dt; if (takeT > 5) lamp = Math.max(0.05, 1 - (takeT - 5) / 4); }
    shown += (lamp - shown) * Math.min(1, dt * 4 + (dt === 0 ? 1 : 0));
    lamps[0].gain = shown; lampGlow.gain = shown; cone.visible = shown * pw > 0.3;
    lampGlass.glow = 0.12 + 0.88 * Math.min(1, shown * pw); const t = 0.3 + 0.7 * Math.min(1, shown * pw); lampGlass.tint[0] = t; lampGlass.tint[1] = t; lampGlass.tint[2] = 0.5 + 0.5 * t;
    // a moth, round the glass
    const a = time * 1.7, rad = 0.3 + Math.sin(time * 0.9) * 0.1;
    moth.pos[0] = FLAME[0] + Math.cos(a) * rad; moth.pos[1] = FLAME[1] - 0.03 + Math.sin(a * 1.3) * rad * 0.5; moth.pos[2] = FLAME[2] + Math.sin(a) * rad * 0.7;
    moth.size[1] = 0.02 + 0.04 * Math.abs(Math.sin(time * 30)); moth.alpha = shown > 0.3 ? 0.95 : 0;
  }

  return shell({
    id: 'cell', light, L, scene, cameras: CAMERAS, actors, foreground, lamps, glows, tick, dim: 0.5,
    motes: low ? null : { box: [WIN[0] - 0.2, WIN[0] + 1.8, 0.4, 3.0, BACK + 0.3, -0.6], every: 0.6, color: '#dfe8ff', size: 0.045, vel: [0.02, -0.02, 0.03], life: 6, alpha: 0.6 },
    marks: {
      ...MARKS, c: { pos: [0.7, 0, 0.55], face: -14 },
      opposition: [{ pos: [1.75, 0, 0.6], face: -78 }, { pos: [2.45, 0, 1.1], face: -72 }, { pos: [3.0, 0, 0.45], face: -80 }],
      seat: { pos: SEAT, face: 12 }, sheet: SHEET, door: { pos: [DOOR[0] - 0.1, 0, DOOR[2] + 0.9], face: -20 }, focus: FLAME,
    },
    extra: { setLamp, takeLamp, cue },
  });
}

export const cell = { id: 'cell', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default cell;
