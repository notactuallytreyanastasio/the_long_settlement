// SET: bench. Magistrate Maravel's chamber on Bench Row: his desk on a low platform under a green-shaded
// lamp, the high-backed chair, the scales, walls of books, towers of files tied in ribbon (somebody can
// whistle behind them unseen), a tall window on the festival, a door left ajar on the lit corridor.
// Chapter 1: ch1.s2 (Ren plants the listening shell under the lip of the desk; Ilse and her father).
//
//   import { bench } from './sets/bench.js';
//   const set = bench.build(GL, { light: 'night' | 'day', low: false });
//
// Same shape as sets/lantern-stalls.js. Figures face +Z, cameras look toward -Z, the stage strip
// x -3.2..3.2, z 0..1.6 is clear (the rug lies in it). The desk platform top is y = 0.3.
//
// What this set can do for its story:
//   plant(on, live = 0)    the listening shell under the desk lip: on shows it (a thumbnail of brass),
//                          live 0..1 makes it pulse (ch1.s2.c27 "The shell is live")
// marks: a, b, c, two, party, opposition as everywhere, plus
//   lip (world point under the desk's front edge)   desk { pos, face }: crouching at the lip
//   seat { pos, face }: behind the desk, on the platform   files { pos, face }: coming out from behind the file towers
//   door { pos, face }: just inside the door   focus: the desk lamp

import { rng, DEG } from '../math.js';
import { merge, tint, place, box, sphere, setGlow } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic } from '../scene.js';
import { createSprites } from '../sprites.js';
import { PAL, anchorAt } from './kit.js';
import {
  KB, kitBMaterials, setShell, norm3, wall, windowFrame, shaftCards, lightPatch, skyline, ceiling, boards, wainscot, rug, curtain, dais, doorway,
  desk, chair, pew, stool, bookshelf, fileStack, paperPile, scroll, hangingLamp, deskLamp, sconce, scales, globe, inkstand,
} from './kit-b.js';

const W = 11.6, BACK = -4.4, FRONT = 5, H = 5.7, PLAT = 0.3;

const LIGHTS = {
  night: {
    preset: 'night', power: 1,
    env: {
      key: { dir: norm3([-0.3, 0.72, 0.62]), color: '#ffe2b8' },
      shadow: { tint: '#6258d8', lift: 0.11, saturate: 1.45 },
      ambient: { sky: '#ffae8a', ground: '#5a4cc8', amount: 0.15 },
      rim: { color: '#ffd98a', amount: 0.5, edge: 0.76 },
      fog: { density: 0.0006, start: 40, max: 0.5 },
      sky: { zenith: '#0c1a70', mid: '#243ab0', midAt: 0.45, horizon: '#6a62dc', below: '#34349c', stars: 1, moon: 0.7, sunDir: norm3([-0.2, 0.36, -1]) },
      water: null,
    },
    shaft: '#9fb8ff', patch: '#aebcff', moon: 1, lit: 0.95,
  },
  day: {
    preset: 'day', power: 0.3,
    env: {
      key: { dir: norm3([-0.36, 0.78, 0.5]), color: '#fff4dc' },
      shadow: { tint: '#9a94ec', lift: 0.08, saturate: 1.35 },
      ambient: { sky: '#cfe4ff', ground: '#ffd9b0', amount: 0.12 },
      fog: { density: 0.0006, start: 40, max: 0.5 },
      sky: { sunDir: norm3([-0.5, 0.5, -1]) },
      water: null,
    },
    shaft: '#fff0b8', patch: '#fff4c8', moon: 0, lit: 0,
  },
};

const CAMERAS = {
  wide: { target: [0.1, 1.6, -0.5], dist: 8.2, yaw: 5, pitch: 5, fov: 44, aspect: 0.46, shadowCenter: [0, 0, -1.2], shadowRadius: 7 },
  two: { target: [0, 1.12, 0.6], dist: 6.0, yaw: -15, pitch: 5, fov: 31, aspect: 0.46, shadowCenter: [0, 0, 0.3], shadowRadius: 3.6 },
  close: { target: [0.02, 0.86, 0.8], dist: 3.9, yaw: 21, pitch: 3, fov: 28, aspect: 0.46, shadowCenter: [0, 0, 0.5], shadowRadius: 2.6 },
  low: { target: [0.5, 1.5, -0.6], dist: 6.0, yaw: -10, pitch: -9, fov: 54, aspect: 0.46, shadowCenter: [0, 0, -1], shadowRadius: 7 },
  stage: { target: [0, 1.08, 0.3], dist: 9.2, yaw: -13, pitch: 6, fov: 25, aspect: 1.95, shadowCenter: [0, 0, -0.8], shadowRadius: 7, outline: 0.7 },
  landscape: { target: [0, 1.7, -1.2], dist: 9.6, yaw: 4, pitch: 5, fov: 40, aspect: 1.6, shadowCenter: [0, 0, -1.5], shadowRadius: 9 },
};

const MARKS = {
  a: { pos: [-0.8, 0, 0.55], face: 14 }, b: { pos: [0.02, 0, 0.8], face: 0 }, c: { pos: [0.82, 0, 0.55], face: -14 },
  two: [{ pos: [-0.42, 0, 0.62], face: 24 }, { pos: [0.42, 0, 0.62], face: -24 }],
  party: [{ pos: [-1.05, 0, 0.75], face: 78 }, { pos: [-1.85, 0, 1.15], face: 72 }, { pos: [-2.5, 0, 0.5], face: 80 }],
  opposition: [{ pos: [1.05, 0, 0.75], face: -78 }, { pos: [1.85, 0, 1.15], face: -72 }, { pos: [2.55, 0, 0.5], face: -80 }],
};

function build(engine = null, { light = 'night', low = false } = {}) {
  const L = LIGHTS[light];
  if (!L) throw new Error(`bench: unknown light "${light}" (have ${Object.keys(LIGHTS).join(', ')})`);
  const M = kitBMaterials(), r = rng(311), night = light === 'night';
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  if (low) env.shadow.size = 512;

  // ---- the room
  const room = group('room');
  room.add(node('floor', place(boards({ w: W, d: FRONT - BACK + 6, n: 16, colors: ['#f6b878', '#eea866', '#ffc68a'], seed: 4 }), 0, 0, (FRONT + BACK) / 2 + 3), M.flat));
  const WIN = { x: -1.55, w: 2.5, sill: 1.3, top: 4.75, arch: true };
  room.add(node('back', wall({ w: W, h: H, t: 0.4, color: '#ffd6c2', openings: [WIN] }), M.wall, { pos: [0, 0, BACK] }));
  room.add(node('wainscot', wainscot({ w: W, h: 1.3, n: 9, color: KB.plum, panel: '#8d62d4', bead: KB.brass, rail: KB.plumDark }), M.wall, { pos: [0, 0, BACK] }));
  const DOOR = { x: -0.4, w: 1.5, sill: 0, top: 2.62 };
  for (const sx of [-1, 1]) {
    room.add(node('side', wall({ w: FRONT - BACK, h: H, t: 0.4, color: '#ffcbb8', openings: sx > 0 ? [DOOR] : [] }), M.wall, { pos: [sx * W / 2, 0, (FRONT + BACK) / 2], rot: [0, -sx * 90, 0] }));
    if (sx < 0) room.add(node('side-wainscot', wainscot({ w: FRONT - BACK, h: 1.3, n: 7, color: KB.plum, panel: '#8d62d4', bead: KB.brass, rail: KB.plumDark }), M.wall, { pos: [sx * W / 2, 0, (FRONT + BACK) / 2], rot: [0, -sx * 90, 0] }));
  }
  room.add(node('ceiling', ceiling({ w: W, d: 8, color: '#e6dcff', beams: 5, beam: KB.plumDark }), M.wall, { pos: [0, H, BACK + 4] }));
  room.add(node('patch', lightPatch({ w: 2.2, d: 3.0, panes: 3, shear: -0.3, color: L.patch, glow: 0.5 }), M.flat, { pos: [WIN.x + 0.95, 0.006, BACK + 2.8] }));
  scene.root.add(mergeStatic(room, 'room'));

  // ---- props
  const props = group('props'), deco = (n) => { n.castShadow = false; return n; };
  props.add(deco(node('window', windowFrame({ w: WIN.w, h: WIN.top - WIN.sill, color: KB.plumDark, bars: 2, fan: ['#7fe6d2', '#ffd65a', '#ff8fb4', '#ffd65a', '#7fe6d2'], glow: night ? 0.85 : 0.5, depth: 0.4 }), M.prop, { pos: [WIN.x, WIN.sill, BACK] })));
  for (const sx of [-1, 1]) props.add(deco(node('curtain', curtain({ w: 0.75, h: 3.7, color: KB.teal, side: sx }), M.prop, { pos: [WIN.x + sx * (WIN.w / 2 + 0.06), WIN.top + 0.25, BACK + 0.3] })));
  props.add(deco(node('rod', tint(place(box(WIN.w + 2.1, 0.07, 0.07), WIN.x, WIN.top + 0.3, BACK + 0.3), KB.brass), M.prop)));
  // the bench: platform, desk, chair, what lies on the desk
  const DESK = [1.35, PLAT, -2.55], DESK_YAW = -6;
  props.add(node('platform', dais({ w: 4.3, d: 2.3, n: 2, rise: PLAT / 2, run: 0.26, color: KB.plumDark, edge: KB.brass }), M.prop, { pos: [1.35, 0, -3.1] }));
  const deskMesh = desk({ w: 2.6, d: 1.05, h: 0.84, color: KB.woodRed, top: KB.baize, seed: 2 });
  props.add(node('desk', deskMesh, M.prop, { pos: DESK, rot: [0, DESK_YAW, 0] }));
  props.add(node('chair', chair({ high: true, s: 1.25, color: KB.woodDark, seat: KB.wine }), M.prop, { pos: [1.5, PLAT, -3.55], rot: [0, -8, 0] }));
  const on = (name) => anchorAt(deskMesh, name, DESK, DESK_YAW);
  const top = on('top'), lampAt = on('lamp');
  const dl = deskLamp({ s: 1.5, shade: KB.emerald });
  props.add(deco(node('desk-lamp', dl, M.prop, { pos: lampAt })));
  props.add(deco(node('scales', scales({ h: 0.62, w: 0.56 }), M.prop, { pos: [top[0] + 0.85, top[1], top[2] - 0.2], rot: [0, 20, 0] })));
  props.add(deco(node('papers', paperPile({ n: 5, seed: 3, s: 0.3 }), M.prop, { pos: [top[0] + 0.1, top[1], top[2] + 0.1] })), deco(node('ink', inkstand({}), M.prop, { pos: [top[0] - 0.35, top[1], top[2] + 0.22], rot: [0, 30, 0] })));
  props.add(deco(node('desk-files', fileStack({ n: 4, seed: 9, w: 0.36, d: 0.28 }), M.prop, { pos: [top[0] + 0.45, top[1], top[2] - 0.22] })), deco(node('writ', scroll({}), M.prop, { pos: [top[0] - 0.75, top[1], top[2] + 0.3], rot: [0, -30, 0] })));
  // books along the back wall, right of the window and in the left corner
  props.add(node('shelf1', bookshelf({ w: 1.75, h: 3.3, rows: 5, seed: 3, color: KB.woodRed, fill: 0.92 }), M.prop, { pos: [3.05, 0, BACK + 0.32] }));
  props.add(node('shelf2', bookshelf({ w: 1.75, h: 3.0, rows: 5, seed: 7, color: KB.woodRed, fill: low ? 0.6 : 0.88 }), M.prop, { pos: [4.85, 0, BACK + 0.32] }));
  props.add(node('shelf3', bookshelf({ w: 1.5, h: 2.5, rows: 4, seed: 11, color: KB.woodRed, fill: low ? 0.55 : 0.85 }), M.prop, { pos: [-4.75, 0, BACK + 0.32] }));
  props.add(deco(node('shelf-files', fileStack({ n: 4, seed: 5 }), M.prop, { pos: [4.85, 3.12, BACK + 0.32] })), deco(node('shelf-globe', globe({ r: 0.26 }), M.prop, { pos: [-4.75, 2.6, BACK + 0.32] })));
  // the files: towers of them, tallest on the right where somebody can stand behind
  const towers = [[3.7, -1.55, 13, 1], [4.35, -1.15, 11, 2], [4.5, -1.95, 15, 3], [3.2, -2.05, 7, 4], [-3.55, -3.4, 9, 5], [-4.1, -2.85, 12, 6], [-3.0, -3.75, 5, 7], [-4.9, -1.9, 8, 8], [4.9, -0.4, 6, 9]];
  towers.forEach(([x, z, n, seed], i) => { if (low && i > 5) return; props.add(node('tower' + i, fileStack({ n, seed, w: 0.46, d: 0.36, lean: 0.07 }), M.prop, { pos: [x, 0, z], rot: [0, r() * 60 - 30, 0] })); });
  props.add(node('pew', pew({ w: 2.0, color: KB.woodRed, seed: 3 }), M.prop, { pos: [-5.1, 0, 0.3], rot: [0, 84, 0] }));
  props.add(node('stool', stool({ seat: KB.teal }), M.prop, { pos: [-2.9, 0, -2.6] }));
  // framed things on the walls
  const frame = (w, h, c, c2) => merge(tint(place(box(w, h, 0.06), 0, 0, 0.03), KB.brass), tint(place(box(w - 0.14, h - 0.14, 0.02), 0, 0, 0.065), c), tint(place(box((w - 0.14) * 0.5, (h - 0.14) * 0.4, 0.02), 0, -h * 0.08, 0.075), c2));
  props.add(deco(node('frame1', frame(0.8, 1.0, '#3f78e0', '#ffd24a'), M.prop, { pos: [-3.75, 2.6, BACK + 0.01], rot: [0, 0, -2] })), deco(node('frame2', frame(0.6, 0.5, KB.parchment, KB.ribbon), M.prop, { pos: [0.75, 2.3, BACK + 0.01], rot: [0, 0, 3] })), deco(node('frame3', frame(0.7, 0.9, '#35c9b5', KB.parchment), M.prop, { pos: [1.55, 3.45, BACK + 0.01], rot: [0, 0, -1.5] })));
  const HANG = [1.2, H, -2.3];
  const hl = hangingLamp({ drop: 2.25, r: 0.5, shade: KB.emerald, shape: 'cone' });
  props.add(deco(node('hanging-lamp', hl, M.prop, { pos: HANG })));
  const sc = sconce({ s: 1.4 });
  props.add(deco(node('sconce', sc, M.prop, { pos: [-W / 2 + 0.02, 2.5, -1.2], rot: [0, 90, 0] })));
  const door = doorway({ w: 1.4, h: 2.5, open: 58, color: KB.wine, frame: '#fff3dc' });
  props.add(node('door', door, M.prop, { pos: [W / 2 - 0.02, 0, DOOR.x + (FRONT + BACK) / 2], rot: [0, -90, 0] }));
  props.add(deco(node('rug', rug({ w: 5.4, d: 2.9, field: KB.wine, border: KB.brass, medallion: KB.royal }), M.prop, { pos: [0, 0, 0.75], rot: [0, 3, 0] })));
  scene.root.add(mergeStatic(props, 'props'));

  // ---- the listening shell under the lip of the desk
  const LIP = on('lip');
  const shell = node('shell', merge(tint(sphere(0.035, 8, 5), KB.brass), setGlow(tint(place(sphere(0.014, 6, 4), 0, -0.01, 0.028), '#ff5a48'), 1)), M.prop, { pos: LIP, visible: false }); shell.castShadow = false;
  scene.root.add(shell);

  // ---- outside the window
  const out = group('outside');
  out.add(node('town', skyline({ w: 12, h: 2.6, seed: 4, lanterns: night, lit: night ? '#ffd070' : '#8fa0e0', color: night ? '#3b4fb8' : '#f0c8a8', color2: night ? '#5468d0' : '#ffe0c0', glow: night ? 0.95 : 0 }), M.speck, { pos: [WIN.x, 0.9, BACK - 3] }));
  scene.root.add(mergeStatic(out, 'outside'));
  if (!low) scene.root.add(node('shafts', place(shaftCards({ w: WIN.w * 0.8, h: (WIN.top - WIN.sill) * 0.7, dir: [0.3, -1, 0.9], len: 5.2, cards: 3, color: L.shaft }), WIN.x, (WIN.sill + WIN.top) / 2, BACK + 0.05), M.shaft));

  // ---- foreground: a clerk's corner near the lens
  const fg = group('fg');
  fg.add(node('fg-files', fileStack({ n: 6, seed: 21, w: 0.5, d: 0.4 }), M.prop, { pos: [-1.55, 0, 2.9] }), node('fg-stool', stool({ seat: KB.wine }), M.prop, { pos: [1.6, 0, 2.95] }), node('fg-files2', fileStack({ n: 3, seed: 14 }), M.prop, { pos: [1.6, 0.48, 2.95] }));
  const foreground = mergeStatic(fg, 'foreground'); scene.root.add(foreground);

  const actors = group('actors'); scene.root.add(actors);

  // ---- lamps
  const deskLampPos = [lampAt[0] + dl.anchors.lamp[0], lampAt[1] + dl.anchors.lamp[1], lampAt[2] + dl.anchors.lamp[2]];
  const hangPos = [HANG[0] + hl.anchors.lamp[0], HANG[1] + hl.anchors.lamp[1], HANG[2] + hl.anchors.lamp[2]];
  const doorZ = DOOR.x + (FRONT + BACK) / 2, sconcePos = [-W / 2 + 0.36, 2.78, -1.2];
  const lamps = [
    { name: 'hanging', pos: hangPos, color: '#ffcf7a', radius: 7.5, base: 1.0 },
    { name: 'desk', pos: deskLampPos, color: '#d8ff9a', radius: 3.2, base: 1.0 },
    { name: 'door', pos: [W / 2 + 1.0, 1.7, doorZ], color: '#ff9a50', radius: 5, base: 0.95 + L.lit * 0.1 },
    { name: 'sconce', pos: sconcePos, color: '#ffb860', radius: 4.2, base: 0.9 },
    { name: 'window', pos: [WIN.x + 0.3, 2.4, BACK + 1.7], color: night ? '#8fa8ff' : '#fff0c0', radius: 4.6, base: night ? 1.1 : 2.6, flicker: 0 },
  ];
  const sprites = scene.sprites = createSprites(low ? 96 : 256), glows = [];
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: [hangPos[0], hangPos[1] - 0.1, hangPos[2]], size: 2.6, color: '#ffc060', alpha: 0 }), base: 0.5 });
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: deskLampPos, size: 1.5, color: '#c8ff8a', alpha: 0 }), base: 0.55 });
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: sconcePos, size: 1.3, color: '#ffb450', alpha: 0 }), base: 0.5 });
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: [W / 2 + 0.2, 1.5, doorZ], size: 3.0, color: '#ff9a40', alpha: 0 }), base: 0.5, fixed: true });
  const shellGlow = sprites.add({ kind: 'glow', pos: [LIP[0], LIP[1], LIP[2] + 0.04], size: 0.5, color: '#ff5a48', alpha: 0 });
  let shellOn = false, shellLive = 0;
  function plant(onNow, live = 0) { shellOn = !!onNow; shell.visible = shellOn; shellLive = Math.max(0, Math.min(1, live)); }
  function tick(time) { shellGlow.alpha = shellOn ? shellLive * (0.45 + 0.4 * Math.sin(time * 5.2)) : 0; shellGlow.size[0] = shellGlow.size[1] = 0.35 + 0.25 * shellLive * (0.5 + 0.5 * Math.sin(time * 5.2)); }

  return setShell({
    id: 'bench', light, L, scene, cameras: CAMERAS, actors, foreground, lamps, glows, tick,
    motes: low ? null : { box: [WIN.x - 0.6, WIN.x + 2.2, 0.4, 3.6, BACK + 0.4, -0.4], every: 0.4, color: night ? '#cfdcff' : '#fff2c0', size: 0.06, vel: [0.03, -0.02, 0.05], life: 6, alpha: 0.75 },
    marks: {
      ...MARKS, lip: LIP, focus: deskLampPos,
      desk: { pos: [LIP[0], PLAT, LIP[2] + 0.5], face: 180 }, seat: { pos: [1.45, PLAT, -3.3], face: 0 },
      files: { pos: [3.1, 0, -1.0], face: -50 }, door: { pos: [W / 2 - 1.0, 0, doorZ], face: -90 },
    },
    extra: { plant },
  });
}

export const bench = { id: 'bench', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default bench;
