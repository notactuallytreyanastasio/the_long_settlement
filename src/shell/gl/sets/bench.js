// SET: bench. Magistrate Maravel's chamber on Bench Row, after hours: the chamber door with its lit glass
// (stage left), towers of files tied in ribbon that a cadet can cross behind and a daughter can whistle
// behind, the magistrate's desk under a green-shaded lamp (stage right) with his high-backed chair and
// the scales, walls of books, a tall window on the festival.
// Chapter 1: ch1.s2 The Listener (Ren plants the listening shell under the lip of the desk; Ilse and her father).
//
//   import { bench } from './sets/bench.js';
//   const set = bench.build(GL, { light: 'interior' | 'day', low: false });
//
// Same shape as sets/lantern-stalls.js. Figures face +Z, cameras look toward -Z, the strip x -4.4..4.4,
// z 0..1.6 is clear (the rug lies in it). The side walls are splayed like stage flats, so what hangs on
// them faces the camera.
//
// What this set can do for its story:
//   task('chamber-door') -> { pos, stand, set(v) }     v 0 shut .. 1 open a hand, the corridor's light spilling in (the door is in the back wall, stage left)
//   task('magistrate-desk') -> { pos, stand, set(v) }  v >= 1: the shell is planted under the lip and pulses red
//   openDoor(0..1), plant(on, live 0..1)               the same two things, directly
//   passLamp()                                         the setback: a clerk's lamp crosses the door glass (1.8 s)
// marks: a, b, c, two, party, opposition as everywhere, plus
//   lip (world point under the desk's front edge)   desk { pos, face }: at the lip
//   seat { pos, face }: the magistrate's chair   files { pos, face }: where somebody steps out from behind the towers
//   door { pos, face }: just inside the door   focus: the desk lamp

import { rng, DEG } from '../math.js';
import { merge, tint, place, box, sphere, setGlow } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic } from '../scene.js';
import { createSprites } from '../sprites.js';
import { anchorAt } from './kit.js';
import {
  KB, kitBMaterials, setShell, lightOf, wing, norm3, wall, windowFrame, shaftCards, lightPatch, skyline, ceiling, boards, wainscot, rug, curtain, doorway, doorLeaf,
  desk, chair, pew, stool, bookshelf, fileStack, paperPile, scroll, hangingLamp, deskLamp, sconce, scales, globe, inkstand,
} from './kit-b.js';

const BW = 4.4, BACK = -4.4, FW = 7.0, WING_Z = 2.4, H = 5.7;

const LIGHTS = {
  interior: {
    preset: 'night', power: 1,
    env: {
      key: { dir: norm3([-0.3, 0.72, 0.62]), color: '#ffe2b8' },
      shadow: { tint: '#6258d8', lift: 0.11, saturate: 1.45 },
      ambient: { sky: '#ffae8a', ground: '#5a4cc8', amount: 0.15 },
      rim: { color: '#ffd98a', amount: 0.5, edge: 0.76 },
      fog: { density: 0.0006, start: 40, max: 0.5 },
      sky: { zenith: '#0c1a70', mid: '#243ab0', midAt: 0.45, horizon: '#6a62dc', below: '#34349c', stars: 1, moon: 0.7, sunDir: norm3([-0.06, 0.34, -1]) },
      water: null,
    },
    shaft: '#9fb8ff', patch: '#aebcff', night: true,
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
    shaft: '#fff0b8', patch: '#fff4c8', night: false,
  },
};

const CAMERAS = {
  wide: { target: [0.4, 1.6, -0.5], dist: 8.2, yaw: -5, pitch: 5, fov: 44, aspect: 0.46, shadowCenter: [0, 0, -1.2], shadowRadius: 7 },
  two: { target: [0, 1.12, 0.6], dist: 6.0, yaw: -15, pitch: 5, fov: 31, aspect: 0.46, shadowCenter: [0, 0, 0.3], shadowRadius: 3.6 },
  close: { target: [0.02, 0.86, 0.8], dist: 3.9, yaw: 21, pitch: 3, fov: 28, aspect: 0.46, shadowCenter: [0, 0, 0.5], shadowRadius: 2.6 },
  low: { target: [0.5, 1.5, -0.6], dist: 6.0, yaw: -10, pitch: -9, fov: 54, aspect: 0.46, shadowCenter: [0, 0, -1], shadowRadius: 7 },
  stage: { target: [-0.3, 1.1, 0.2], dist: 9.6, yaw: -9, pitch: 6, fov: 26, aspect: 1.95, shadowCenter: [0, 0, -0.8], shadowRadius: 7, outline: 0.7 },
  landscape: { target: [0, 1.7, -1.2], dist: 9.6, yaw: 4, pitch: 5, fov: 40, aspect: 1.6, shadowCenter: [0, 0, -1.5], shadowRadius: 9 },
};

const MARKS = {
  a: { pos: [-0.8, 0, 0.55], face: 14 }, b: { pos: [0.02, 0, 0.8], face: 0 }, c: { pos: [0.82, 0, 0.55], face: -14 },
  two: [{ pos: [-0.42, 0, 0.62], face: 24 }, { pos: [0.42, 0, 0.62], face: -24 }],
  party: [{ pos: [-1.05, 0, 0.75], face: 78 }, { pos: [-1.85, 0, 1.15], face: 72 }, { pos: [-2.5, 0, 0.5], face: 80 }],
  opposition: [{ pos: [1.05, 0, 0.75], face: -78 }, { pos: [1.85, 0, 1.15], face: -72 }, { pos: [2.55, 0, 0.5], face: -80 }],
};

function build(engine = null, { light: lightName = 'interior', low = false } = {}) {
  const [light, L] = lightOf('bench', LIGHTS, lightName);
  const M = kitBMaterials(), r = rng(311), night = L.night;
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  if (low) env.shadow.size = 512;
  const WL = wing(-1, BW, BACK, FW, WING_Z), WR = wing(1, BW, BACK, FW, WING_Z);

  // ---- the room
  const room = group('room');
  room.add(node('floor', place(boards({ w: 18, d: 16, n: 22, colors: ['#f6b878', '#eea866', '#ffc68a'], seed: 4 }), 0, 0, 1.6), M.flat));
  const WIN = { x: -0.9, w: 2.5, sill: 1.3, top: 4.75, arch: true };
  const DOOR = { x: -3.4, w: 1.5, sill: 0, top: 2.62 };
  room.add(node('back', wall({ w: BW * 2 + 0.4, h: H, t: 0.4, color: '#ffd6c2', openings: [DOOR, WIN] }), M.wall, { pos: [0, 0, BACK] }));
  room.add(node('corridor', setGlow(tint(place(box(2.6, 3.0, 0.1), DOOR.x, 1.5, BACK - 1.3), night ? '#ffb45e' : '#ffe2b0'), 0.9), M.flat));
  room.add(node('wainscot', wainscot({ w: 6.3, h: 1.3, n: 5, color: KB.plum, panel: '#8d62d4', bead: KB.brass, rail: KB.plumDark }), M.wall, { pos: [1.25, 0, BACK] }));
  room.add(node('wing-l', wall({ w: WL.len + 0.3, h: H, t: 0.4, color: '#ffcbb8' }), M.wall, { pos: WL.pos, rot: [0, WL.yaw, 0] }));
  room.add(node('wing-r', wall({ w: WR.len + 0.3, h: H, t: 0.4, color: '#ffcbb8' }), M.wall, { pos: WR.pos, rot: [0, WR.yaw, 0] }));
  for (const Wg of [WL, WR]) room.add(node('wainscot-w', wainscot({ w: Wg.len, h: 1.3, n: 6, color: KB.plum, panel: '#8d62d4', bead: KB.brass, rail: KB.plumDark }), M.wall, { pos: Wg.pos, rot: [0, Wg.yaw, 0] }));
  room.add(node('ceiling', ceiling({ w: 15, d: 8, color: '#e6dcff', beams: 6, beam: KB.plumDark }), M.wall, { pos: [0, H, BACK + 4] }));
  room.add(node('patch', lightPatch({ w: 2.2, d: 3.0, panes: 3, shear: -0.3, color: L.patch, glow: 0.5 }), M.flat, { pos: [WIN.x + 0.95, 0.006, BACK + 2.9] }));
  scene.root.add(mergeStatic(room, 'room'));

  // ---- props
  const props = group('props'), deco = (n) => { n.castShadow = false; return n; };
  props.add(deco(node('window', windowFrame({ w: WIN.w, h: WIN.top - WIN.sill, color: KB.plumDark, bars: 2, fan: ['#7fe6d2', '#ffd65a', '#ff8fb4', '#ffd65a', '#7fe6d2'], glow: night ? 0.85 : 0.5, depth: 0.4 }), M.prop, { pos: [WIN.x, WIN.sill, BACK] })));
  for (const sx of [-1, 1]) props.add(deco(node('curtain', curtain({ w: 0.75, h: 3.7, color: KB.teal, side: sx }), M.prop, { pos: [WIN.x + sx * (WIN.w / 2 + 0.06), WIN.top + 0.25, BACK + 0.3] })));
  props.add(deco(node('rod', tint(place(box(WIN.w + 2.1, 0.07, 0.07), WIN.x, WIN.top + 0.3, BACK + 0.3), KB.brass), M.prop)));
  // the bench: desk, chair, what lies on the desk (stage right)
  const DESK = [2.0, 0, -1.5], DESK_YAW = -13;
  const deskMesh = desk({ w: 2.5, d: 1.05, h: 0.84, color: KB.woodRed, top: KB.baize, seed: 2 });
  props.add(node('desk', deskMesh, M.prop, { pos: DESK, rot: [0, DESK_YAW, 0] }));
  const on = (name) => anchorAt(deskMesh, name, DESK, DESK_YAW);
  const SEAT = on('seat');
  props.add(node('chair', chair({ high: true, s: 1.3, color: KB.woodDark, seat: KB.wine }), M.prop, { pos: [SEAT[0], 0, SEAT[2] - 0.15], rot: [0, DESK_YAW, 0] }));
  const top = on('top'), lampAt = on('lamp');
  const dl = deskLamp({ s: 1.6, shade: KB.emerald });
  props.add(deco(node('desk-lamp', dl, M.prop, { pos: lampAt })));
  props.add(deco(node('scales', scales({ h: 0.62, w: 0.56 }), M.prop, { pos: [top[0] + 0.8, top[1], top[2] - 0.35], rot: [0, 20, 0] })));
  props.add(deco(node('papers', paperPile({ n: 5, seed: 3, s: 0.3 }), M.prop, { pos: [top[0] + 0.1, top[1], top[2] + 0.1] })), deco(node('ink', inkstand({}), M.prop, { pos: [top[0] - 0.35, top[1], top[2] + 0.25], rot: [0, 30, 0] })));
  props.add(deco(node('desk-files', fileStack({ n: 4, seed: 9, w: 0.36, d: 0.28 }), M.prop, { pos: [top[0] + 0.5, top[1], top[2] - 0.05] })), deco(node('writ', scroll({}), M.prop, { pos: [top[0] - 0.7, top[1], top[2] + 0.12], rot: [0, -30, 0] })));
  // books along the back wall
  props.add(node('shelf1', bookshelf({ w: 1.7, h: 3.3, rows: 5, seed: 3, color: KB.woodRed, fill: 0.92 }), M.prop, { pos: [1.85, 0, BACK + 0.32] }));
  props.add(node('shelf2', bookshelf({ w: 1.6, h: 2.9, rows: 5, seed: 7, color: KB.woodRed, fill: low ? 0.6 : 0.88 }), M.prop, { pos: [3.5, 0, BACK + 0.32] }));
  props.add(node('shelf3', bookshelf({ w: 1.45, h: 2.5, rows: 4, seed: 11, color: KB.woodRed, fill: low ? 0.55 : 0.85 }), M.prop, { pos: WL.at(0.9, 0.3), rot: [0, WL.yaw, 0] }));
  props.add(deco(node('shelf-files', fileStack({ n: 4, seed: 5 }), M.prop, { pos: [3.5, 3.02, BACK + 0.32] })), deco(node('shelf-globe', globe({ r: 0.26 }), M.prop, { pos: WL.at(0.9, 0.3, 2.6) })));
  // shelves of box files on the right wing
  const rs = WR.at(0.4, 0.3);
  props.add(node('shelf4', bookshelf({ w: 2.4, h: 2.7, rows: 4, seed: 15, color: KB.woodRed, colors: [KB.parchment, '#ffe6b0', '#dfe8ff', KB.teal, KB.ribbon, '#ffd9c8'], fill: low ? 0.6 : 0.9 }), M.prop, { pos: rs, rot: [0, WR.yaw, 0] }));
  // the files: towers of them between the door and the desk
  const towers = [[-1.95, -1.35, 10, 1], [-1.2, -2.15, 13, 2], [-2.7, -2.3, 8, 3], [-0.35, -1.7, 7, 4], [0.35, -2.75, 11, 5], [-0.95, -3.3, 6, 6], [-2.0, -3.4, 9, 7], [3.95, -0.9, 12, 8], [4.75, -0.25, 8, 9], [0.4, -1.2, 4, 10]];
  towers.forEach(([x, z, n, seed], i) => { if (low && i > 5) return; props.add(node('tower' + i, fileStack({ n, seed, w: 0.46, d: 0.36, lean: 0.07 }), M.prop, { pos: [x, 0, z], rot: [0, r() * 60 - 30, 0] })); });
  props.add(node('stool', stool({ seat: KB.teal }), M.prop, { pos: [-3.2, 0, -1.5] }));
  // framed things on the walls
  const frame = (w, h, c, c2) => merge(tint(place(box(w, h, 0.06), 0, 0, 0.03), KB.brass), tint(place(box(w - 0.14, h - 0.14, 0.02), 0, 0, 0.065), c), tint(place(box((w - 0.14) * 0.5, (h - 0.14) * 0.4, 0.02), 0, -h * 0.08, 0.075), c2));
  props.add(deco(node('frame1', frame(0.8, 1.0, '#3f78e0', '#ffd24a'), M.prop, { pos: [-3.4, 3.7, BACK + 0.01], rot: [0, 0, -2] })), deco(node('frame2', frame(0.7, 0.9, '#35c9b5', KB.parchment), M.prop, { pos: [3.5, 4.0, BACK + 0.01], rot: [0, 0, -1.5] })));
  props.add(deco(node('frame3', frame(0.9, 0.7, KB.parchment, KB.ribbon), M.prop, { pos: WR.at(0.4, 0.02, 3.6), rot: [0, WR.yaw, 2] })), deco(node('frame4', frame(0.7, 0.9, '#ff8fb0', '#3f78e0'), M.prop, { pos: WL.at(-0.9, 0.02, 3.5), rot: [0, WL.yaw, -2] })));
  const HANG = [1.75, H, -1.35];
  const hl = hangingLamp({ drop: 2.3, r: 0.52, shade: KB.emerald, shape: 'cone' });
  props.add(deco(node('hanging-lamp', hl, M.prop, { pos: HANG })));
  const sc = sconce({ s: 1.4 }), SC = [DOOR.x + 1.25, 2.3, BACK + 0.02];
  props.add(deco(node('sconce', sc, M.prop, { pos: SC })));
  // the chamber door, in the left wing: frame here, the leaf is its own node
  const DW = 1.4, DH = 2.5;
  const dw = doorway({ w: DW, h: DH, frame: '#fff3dc', leaf: false });
  props.add(node('door-frame', dw, M.prop, { pos: [DOOR.x, 0, BACK] }));
  props.add(node('pew', pew({ w: 1.9, color: KB.woodRed, seed: 3 }), M.prop, { pos: WL.at(-1.7, 0.45), rot: [0, WL.yaw, 0] }));
  props.add(deco(node('rug', rug({ w: 5.6, d: 2.9, field: KB.wine, border: KB.brass, medallion: KB.royal }), M.prop, { pos: [-0.3, 0, 0.75], rot: [0, 3, 0] })));
  scene.root.add(mergeStatic(props, 'props'));

  const doorPivot = group('door-pivot', { pos: [DOOR.x - DW / 2, 0, BACK + 0.03] });
  const leaf = node('door-leaf', doorLeaf({ w: DW, h: DH, color: KB.wine, glass: '#ffc878', glow: night ? 0.85 : 0.4 }), M.prop); leaf.castShadow = false;
  doorPivot.add(leaf); scene.root.add(doorPivot);

  // ---- the listening shell under the lip of the desk
  const LIP = on('lip');
  const shell = node('shell', merge(tint(sphere(0.04, 8, 5), KB.brass), setGlow(tint(place(sphere(0.016, 6, 4), 0, -0.01, 0.032), '#ff5a48'), 1)), M.prop, { pos: LIP, visible: false }); shell.castShadow = false;
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
  const inDoor = [DOOR.x + 0.25, 1.5, BACK + 0.8], sconcePos = [SC[0], SC[1] + 0.28, SC[2] + 0.36], glassAt = [DOOR.x, 1.85, BACK + 0.12];
  const lamps = [
    { name: 'hanging', pos: hangPos, color: '#ffcf7a', radius: 7.5, base: 1.0 },
    { name: 'desk', pos: deskLampPos, color: '#d8ff9a', radius: 3.4, base: 1.0 },
    { name: 'door', pos: inDoor, color: '#ff9a50', radius: 4.4, base: 0.3, flicker: 0 },
    { name: 'sconce', pos: sconcePos, color: '#ffb860', radius: 4.2, base: 0.9 },
    { name: 'window', pos: [WIN.x + 0.3, 2.4, BACK + 1.7], color: night ? '#8fa8ff' : '#fff0c0', radius: 4.6, base: night ? 1.1 : 2.6, flicker: 0 },
  ];
  const sprites = scene.sprites = createSprites(low ? 96 : 256), glows = [];
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: [hangPos[0], hangPos[1] - 0.1, hangPos[2]], size: 2.6, color: '#ffc060', alpha: 0 }), base: 0.5 });
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: deskLampPos, size: 1.5, color: '#c8ff8a', alpha: 0 }), base: 0.55 });
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: sconcePos, size: 1.3, color: '#ffb450', alpha: 0 }), base: 0.5 });
  const doorGlow = sprites.add({ kind: 'glow', pos: glassAt, size: 1.6, color: '#ff9a40', alpha: 0 });
  const clerkGlow = sprites.add({ kind: 'glow', pos: [glassAt[0], glassAt[1], glassAt[2]], size: 1.5, color: '#ffe08a', alpha: 0 });
  const shellGlow = sprites.add({ kind: 'glow', pos: [LIP[0], LIP[1], LIP[2] + 0.05], size: 0.5, color: '#ff5a48', alpha: 0 });

  let shellOn = false, shellLive = 0, doorGoal = 0, doorNow = 0, passT = -1;
  function plant(onNow, live = 0) { shellOn = !!onNow; shell.visible = shellOn; shellLive = Math.max(0, Math.min(1, live)); }
  function openDoor(v) { doorGoal = Math.max(0, Math.min(1, v)); }
  function passLamp() { passT = 0; }
  const TASKS = {
    'chamber-door': { pos: [DOOR.x, 1.3, BACK + 0.1], stand: [DOOR.x + 0.5, 0.15], set: openDoor },
    'magistrate-desk': { pos: [LIP[0], LIP[1], LIP[2]], stand: [LIP[0] - 0.1, LIP[2] + 0.55], set(v) { plant(v >= 1, v >= 1 ? 1 : 0); } },
  };
  const task = (type) => TASKS[type] || null;
  function tick(time, dt) {
    doorNow += (doorGoal - doorNow) * Math.min(1, dt * 5);
    leaf.setRot(0, -34 * doorNow, 0);
    let pass = 0;
    if (passT >= 0) { passT += dt; const u = passT / 1.8; pass = Math.sin(Math.min(1, u) * Math.PI); clerkGlow.pos[0] = DOOR.x - 0.75 + 1.5 * u; clerkGlow.pos[1] = 1.85; clerkGlow.pos[2] = BACK + 0.14; if (u >= 1) passT = -1; }
    clerkGlow.alpha = pass * 0.95;
    env.points[2].intensity = 0.3 + 0.75 * doorNow + pass * 0.8;
    doorGlow.alpha = 0.3 + 0.3 * doorNow;
    const pulse = 0.5 + 0.5 * Math.sin(time * 5.2);
    shellGlow.alpha = shellOn ? shellLive * (0.45 + 0.4 * pulse) : 0; shellGlow.size[0] = shellGlow.size[1] = 0.35 + 0.25 * shellLive * pulse;
  }

  return setShell({
    id: 'bench', light, L, scene, cameras: CAMERAS, actors, foreground, lamps, glows, tick,
    motes: low ? null : { box: [WIN.x - 0.6, WIN.x + 2.2, 0.4, 3.6, BACK + 0.4, -0.4], every: 0.4, color: night ? '#cfdcff' : '#fff2c0', size: 0.06, vel: [0.03, -0.02, 0.05], life: 6, alpha: 0.75 },
    marks: {
      ...MARKS, lip: LIP, focus: deskLampPos,
      desk: { pos: [LIP[0] - 0.1, 0, LIP[2] + 0.5], face: 170 }, seat: { pos: [SEAT[0], 0, SEAT[2]], face: DESK_YAW },
      files: { pos: [-1.1, 0, -1.0], face: 30 }, door: { pos: [DOOR.x + 0.3, 0, BACK + 1.1], face: 10 },
    },
    extra: { plant, openDoor, passLamp, task },
  });
}

export const bench = { id: 'bench', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default bench;
