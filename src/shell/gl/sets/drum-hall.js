// SET: drum-hall. The Mint hall of Vessery on the night of the Drawing: the three great Reels of Assay
// in their cabinet on a stepped dais, the lot drum every adult name went into, the clerk's counter the
// slip is carried to, festival banners, chandeliers, tall windows on the lantern-lit town.
// Chapter 1: ch1.pro.20 (Ren puts his hand to the lever), ch1.s3.c24 (the fourth step), ch1.s4 (the Drawing).
//
//   import { drumHall } from './sets/drum-hall.js';
//   const set = drumHall.build(GL, { light: 'night' | 'hush', low: false });
//
// Same shape as sets/lantern-stalls.js (scene, env, actors, foreground, cameras, frame, view, marks, lamps,
// setPower, update). Figures face +Z, cameras look toward -Z, the stage strip x -3.2..3.2, z 0..1.6 is clear
// (only the flat runner carpet lies in it). The dais starts at z = -1.75 and its top is at y = 0.6.
//
// What this set can do for its story:
//   setReel(i, { spin, face })   reel i (0..2): spin true = turning; false = it runs on to `face` (0..7, see REEL_FACES in kit-b.js) and locks
//   setReels(spin, faces)        all three at once: setReels(true) / setReels(false, [0, 0, 0]) (orb, orb, orb)
//   pullLever()                  the lever on the cabinet's right flank goes down and comes back (1.1 s)
//   setDrum({ turn, open })      the lot drum: turn = revolutions per second (0 stops it, hatch to the front), open 0..1 swings the hatch up
//   slip(on)                     a paper slip in the cabinet's tray
// marks: a, b, c, two, party, opposition as everywhere, plus
//   lever { pos, face }   where a figure stands to pull it       drum { pos, face }   beside the lot drum's crank
//   dais [3] { pos, face } on the dais in front of the Reels (y = 0.6)    reels [3] world centres    drumMouth, slip, focus (world points)
// 'hush' is the hall holding its breath (ch1.s4.c03, c19): lamps down to embers, moonlight through the windows, the Reels' own lamps still lit.

import { m4, quat, rng, DEG, rgb } from '../math.js';
import { merge, tint, place, plane, box, cylinder, sphere, tube, curve, setGlow, setOutline } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic, makeInstances } from '../scene.js';
import { createSprites } from '../sprites.js';
import { PAL, anchorAt, bunting } from './kit.js';
import {
  KB, kitBMaterials, setShell, norm3, wall, windowFrame, shaftCards, lightPatch, skyline, ceiling, checker, rug, banner, dais, column, doorway,
  pew, clerkCounter, chandelier, sconce, reelDrum, reelHouse, reelAngle, lever, lotDrum, horn, fileStack, scroll,
} from './kit-b.js';

const W = 16, BACK = -5, FRONT = 5.5, H = 7.2, DAIS_Y = 0.6;

const LIGHTS = {
  night: {
    preset: 'night', power: 1, moon: 0.5,
    env: {
      key: { dir: norm3([-0.42, 0.74, 0.6]), color: '#ffe6bc' },
      shadow: { tint: '#7468e0', lift: 0.12, saturate: 1.45 },
      ambient: { sky: '#ffb890', ground: '#6a58d0', amount: 0.16 },
      rim: { color: '#ffd98a', amount: 0.5, edge: 0.76 },
      fog: { density: 0.0006, start: 40, max: 0.5 },
      sky: { zenith: '#0c1a70', mid: '#2a3fb8', midAt: 0.45, horizon: '#7a6ae0', below: '#3a3aa0', stars: 1, moon: 0.7, sunDir: norm3([-0.12, 0.42, -1]) },
      water: null,
    },
    shaft: '#9fb8ff', patch: '#b9c8ff', warm: 1,
  },
  hush: {
    preset: 'night', power: 0.38, moon: 1,
    env: {
      key: { dir: norm3([-0.3, 0.8, 0.5]), color: '#b8c4ff' },
      shadow: { tint: '#3f48b4', lift: 0.1, saturate: 1.3 },
      ambient: { sky: '#6a7ae8', ground: '#3a3aa0', amount: 0.16 },
      rim: { color: '#cfe0ff', amount: 0.7, edge: 0.74 },
      fog: { density: 0.0006, start: 40, max: 0.5 },
      sky: { zenith: '#0a1560', mid: '#2238a8', midAt: 0.45, horizon: '#5a68d8', below: '#2a2f90', stars: 1, moon: 0.7, sunDir: norm3([-0.12, 0.42, -1]) },
      water: null,
    },
    shaft: '#b8ccff', patch: '#cfdcff', warm: 0.5,
  },
};

const CAMERAS = {
  wide: { target: [-0.25, 1.75, -0.6], dist: 8.6, yaw: 7, pitch: 4, fov: 46, aspect: 0.46, shadowCenter: [0, 0, -1.2], shadowRadius: 8 },
  two: { target: [0, 1.12, 0.6], dist: 6.0, yaw: -14, pitch: 5, fov: 31, aspect: 0.46, shadowCenter: [0, 0, 0.3], shadowRadius: 3.6 },
  close: { target: [0.02, 0.86, 0.8], dist: 3.9, yaw: 18, pitch: 3, fov: 28, aspect: 0.46, shadowCenter: [0, 0, 0.5], shadowRadius: 2.6 },
  low: { target: [0.1, 2.0, -0.2], dist: 6.6, yaw: -6, pitch: -12, fov: 56, aspect: 0.46, shadowCenter: [0, 0, -1], shadowRadius: 8 },
  stage: { target: [0, 1.12, 0.3], dist: 9.6, yaw: -13, pitch: 6, fov: 25, aspect: 1.95, shadowCenter: [0, 0, -0.8], shadowRadius: 7.5, outline: 0.7 },
  landscape: { target: [0, 1.9, -1.4], dist: 10.5, yaw: 4, pitch: 5, fov: 40, aspect: 1.6, shadowCenter: [0, 0, -1.5], shadowRadius: 10.5 },
};

const MARKS = {
  a: { pos: [-0.8, 0, 0.55], face: 14 }, b: { pos: [0.02, 0, 0.8], face: 0 }, c: { pos: [0.82, 0, 0.55], face: -14 },
  two: [{ pos: [-0.42, 0, 0.62], face: 24 }, { pos: [0.42, 0, 0.62], face: -24 }],
  party: [{ pos: [-1.05, 0, 0.75], face: 78 }, { pos: [-1.85, 0, 1.15], face: 72 }, { pos: [-2.5, 0, 0.5], face: 80 }],
  opposition: [{ pos: [1.05, 0, 0.75], face: -78 }, { pos: [1.85, 0, 1.15], face: -72 }, { pos: [2.55, 0, 0.5], face: -80 }],
  dais: [{ pos: [-0.9, DAIS_Y, -2.75], face: 10 }, { pos: [0.1, DAIS_Y, -2.6], face: 0 }, { pos: [1.0, DAIS_Y, -2.75], face: -12 }],
};

function build(engine = null, { light = 'night', low = false } = {}) {
  const L = LIGHTS[light];
  if (!L) throw new Error(`drum-hall: unknown light "${light}" (have ${Object.keys(LIGHTS).join(', ')})`);
  const M = kitBMaterials(), r = rng(1907);
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  if (low) env.shadow.size = 512;

  // ---- the room: floor, back wall with five windows, side walls, ceiling
  const room = group('room');
  room.add(node('floor', place(checker({ w: W, d: FRONT - BACK + 6, nx: 16, nz: 16, colors: ['#ffeccb', '#ffb9a2'], seed: 3 }), 0, 0, (FRONT + BACK) / 2 + 3), M.ground));
  const WIN = [{ x: -5.9, w: 1.7, sill: 1.5, top: 5.4, arch: true }, { x: -3.2, w: 1.7, sill: 1.5, top: 5.4, arch: true }, { x: 0, w: 3.0, sill: 4.15, top: 6.55, arch: true }, { x: 3.2, w: 1.7, sill: 1.5, top: 5.4, arch: true }, { x: 5.9, w: 1.7, sill: 1.5, top: 5.4, arch: true }];
  room.add(node('back', wall({ w: W, h: H, t: 0.4, color: '#ffdcb0', openings: WIN }), M.wall, { pos: [0, 0, BACK] }));
  // the lower wall is a deep blue dado so the cream dais and the brass read against it
  room.add(node('dado', tint(place(box(W, 1.38, 0.06), 0, 0.69, BACK + 0.03), KB.royalDark), M.wall), node('dado-rail', tint(place(box(W, 0.12, 0.12), 0, 1.4, BACK + 0.06), KB.brass), M.wall));
  const DOOR = { x: -0.6, w: 1.6, sill: 0, top: 3.1, arch: true };
  for (const sx of [-1, 1]) {
    const side = wall({ w: FRONT - BACK, h: H, t: 0.4, color: '#ffd0b4', openings: sx > 0 ? [DOOR] : [] });
    room.add(node('side', side, M.wall, { pos: [sx * W / 2, 0, (FRONT + BACK) / 2], rot: [0, -sx * 90, 0] }));
    room.add(node('side-dado', tint(place(box(FRONT - BACK, 1.38, 0.06), 0, 0.69, 0.03), KB.royalDark), M.wall, { pos: [sx * (W / 2 - 0.001), 0, (FRONT + BACK) / 2], rot: [0, -sx * 90, 0], visible: sx < 0 }));
  }
  room.add(node('ceiling', ceiling({ w: W, d: 9, color: '#f4d4ff', beams: 6, beam: KB.plumDark, bw: 0.36, bh: 0.4 }), M.wall, { pos: [0, H, BACK + 4.5] }));
  scene.root.add(mergeStatic(room, 'room'));

  // ---- props baked to one mesh
  const props = group('props');
  const fanCols = ['#ff7448', '#ffd65a', '#7fe6d2', '#ff8fb4', '#ffd65a', '#ff7448'];
  WIN.forEach((o, i) => props.add(node('win' + i, windowFrame({ w: o.w, h: o.top - o.sill, arch: true, color: KB.plumDark, bars: i === 2 ? 3 : 1, fan: i === 2 ? [...fanCols, '#7fe6d2', '#ff8fb4'] : fanCols.slice(0, 4), glow: 0.85, depth: 0.4 }), M.prop, { pos: [o.x, o.sill, BACK] })));
  const daisMesh = dais({ w: 9.2, d: 2.3, n: 4, rise: DAIS_Y / 4, run: 0.3, color: '#fff3dc', edge: KB.wine, carpet: KB.wine });
  props.add(node('dais', daisMesh, M.prop, { pos: [0, 0, BACK + 1.25] }));
  const HOUSE = [0, DAIS_Y, BACK + 0.95], REEL_R = 0.6;
  const house = reelHouse({ w: 3.5, h: 2.7, d: 1.1, r: REEL_R, color: KB.royal, trim: KB.brass });
  props.add(node('reel-house', house, M.prop, { pos: HOUSE }));
  const DRUM = [-3.05, DAIS_Y, BACK + 1.55], DRUM_YAW = 16;
  const ld = lotDrum({ r: 0.66, len: 1.3 });
  props.add(node('drum-cradle', ld.cradle, M.prop, { pos: DRUM, rot: [0, DRUM_YAW, 0] }));
  const counter = clerkCounter({ w: 2.3, color: KB.teal, seed: 4 });
  props.add(node('counter', counter, M.prop, { pos: [3.25, DAIS_Y, BACK + 1.35], rot: [0, -12, 0] }));
  props.add(node('horn', horn({}), M.prop, { pos: [-4.7, DAIS_Y, BACK + 1.9], rot: [0, 30, 0] }));
  if (!low) props.add(node('files', fileStack({ n: 6, seed: 3 }), M.prop, { pos: [4.75, DAIS_Y, BACK + 1.2], rot: [0, 20, 0] }), node('writ', scroll({}), M.prop, { pos: [2.6, DAIS_Y + 1.1, BACK + 1.55], rot: [0, 40, 0] }));
  for (const [x, z] of [[-7.2, -2.2], [7.2, -2.2], [-7.2, 1.6], [7.2, 1.6]]) props.add(node('col', column({ h: H, r: 0.36, color: '#fff3dc', band: KB.brass }), M.prop, { pos: [x, 0, z] }));
  // banners down the back wall between the windows, and two long ones flanking the Reels
  const BAN = [[-4.55, 5.9, 'tide', KB.teal], [-1.95, 6.3, 'crown', KB.wine], [1.95, 6.3, 'orb', KB.plum], [4.55, 5.9, 'coin', KB.royal]];
  for (const [x, y, dev, col] of BAN) props.add(node('banner', banner({ w: 0.95, h: Math.abs(x) < 3 ? 3.0 : 3.6, color: col, trim: KB.brass, device: dev }), M.prop, { pos: [x, y, BACK + 0.2], rot: [0, 0, (r() - 0.5) * 3] }));
  const chans = [[0, H - 0.4, -1.6, 2.1, 1.05], [-4.3, H - 0.4, -2.6, 1.7, 0.75], [4.3, H - 0.4, -2.6, 1.7, 0.75]];
  const chanMesh = chans.map(([x, y, z, drop, rad]) => { const c = chandelier({ drop, r: rad, arms: rad > 1 ? 8 : 6 }); props.add(node('chandelier', c, M.lantern, { pos: [x, y, z] })); return c; });
  const scL = sconce({ s: 1.5 });
  for (const x of [-1.95, 1.95]) props.add(node('sconce', scL, M.prop, { pos: [x, 2.35, BACK + 0.08] }));
  const door = doorway({ w: 1.5, h: 2.5, open: 62, color: KB.teal, frame: '#fff3dc' });
  props.add(node('door', door, M.prop, { pos: [W / 2 - 0.02, 0, DOOR.x + (FRONT + BACK) / 2 - 0], rot: [0, -90, 0] }));
  props.add(node('runner', rug({ w: 1.7, d: 6.6, field: KB.wine, border: KB.brass, medallion: KB.royal }), M.prop, { pos: [0, 0, 1.55] }));
  if (!low) {
    props.add(node('bunt1', bunting([-7.7, 5.6, -1.0], [7.7, 5.4, -0.6], { sag: 1.1, count: 21, size: 0.34, seed: 3 }), M.prop), node('bunt2', bunting([-7.7, 5.9, -3.6], [7.7, 6.0, -3.2], { sag: 0.8, count: 19, size: 0.3, seed: 8 }), M.prop));
    for (const sx of [-1, 1]) props.add(node('pew', pew({ w: 2.6, seed: 2 + sx }), M.prop, { pos: [sx * 5.6, 0, 0.9], rot: [0, -sx * 62, 0] }));
  }
  scene.root.add(mergeStatic(props, 'props'));

  // ---- outside the windows: the town with its lanterns (one unlit, unshadowed mesh)
  const out = group('outside');
  out.add(node('town', skyline({ w: 22, h: 3.4, seed: 5 }), M.far, { pos: [0, 0.6, BACK - 3.2] }));
  out.add(node('town2', skyline({ w: 26, h: 5.2, seed: 9, color: '#2f3fa0', color2: '#3a4cb0', lanterns: false }), M.far, { pos: [1, 0.4, BACK - 6] }));
  scene.root.add(mergeStatic(out, 'outside'));

  // ---- window light: shafts and floor patches
  if (!low) {
    const sh = [], dir = [0.16, -1, 0.95];
    for (const i of [0, 1, 3, 4]) { const o = WIN[i]; sh.push(place(shaftCards({ w: o.w * 0.8, h: (o.top - o.sill) * 0.7, dir, len: 5.6, cards: 3, color: L.shaft }), o.x, (o.sill + o.top) / 2, BACK + 0.05)); }
    sh.push(place(shaftCards({ w: 2.4, h: 1.6, dir: [0, -1, 0.72], len: 6.5, cards: 3, color: '#ffc890', spread: 0.3 }), 0, 5.3, BACK + 0.05));
    scene.root.add(node('shafts', merge(sh), M.shaft));
  }
  const patches = group('patches');
  for (const i of [0, 1, 3, 4]) { const o = WIN[i]; patches.add(node('patch', lightPatch({ w: 1.5, d: 2.3, panes: 2, shear: -0.16, color: L.patch, glow: 0.5 }), M.flat, { pos: [o.x + 0.45, 0.006, BACK + 3.6] })); }
  scene.root.add(mergeStatic(patches, 'patches'));

  // ---- the three Reels: one instanced draw
  const reelNode = node('reels', reelDrum({ r: REEL_R, w: 0.84 }), M.prop); reelNode.instances = makeInstances(3); reelNode.instances.count = 3;
  scene.root.add(reelNode);
  const reelPos = anchorAt(house, 'reels', HOUSE, 0);
  const reels = reelPos.map((pos, i) => ({ pos, angle: reelAngle(i * 3 + 1), speed: 0, spin: false, face: (i * 3 + 1) % 8, pop: 0 }));

  // ---- the lever
  const lv = lever({ len: 1.2 }), LEVER = anchorAt(house, 'lever', HOUSE, 0);
  scene.root.add(node('lever-base', lv.base, M.prop, { pos: LEVER }));
  const leverArm = node('lever-arm', lv.arm, M.prop, { pos: LEVER }); scene.root.add(leverArm);
  let leverT = -1;

  // ---- the lot drum and its hatch
  const drumPivot = group('drum-pivot', { pos: [DRUM[0], DRUM[1] + ld.anchors.axle[1], DRUM[2]], rot: [0, DRUM_YAW, 0] });
  const drumNode = node('lot-drum', ld.drum, M.prop); drumPivot.add(drumNode);
  const hatchNode = node('hatch', ld.hatch, M.prop, { pos: ld.anchors.hinge }); hatchNode.castShadow = false; drumNode.add(hatchNode);
  scene.root.add(drumPivot);
  const drum = { turn: 0, open: 0, openNow: 0, angle: 0 };

  // ---- the slip in the tray
  const SLIP = anchorAt(house, 'slip', HOUSE, 0);
  const slipNode = node('slip', setGlow(tint(place(box(0.3, 0.012, 0.2), 0, 0.05, 0, 0, 14, 0), KB.paper), 0.4), M.prop, { pos: SLIP, visible: false }); slipNode.castShadow = false;
  scene.root.add(slipNode);

  // ---- foreground: the rope line the crowd stands behind
  const fg = group('fg');
  const posts = [[-3.0, 2.7], [-1.35, 2.95], [1.35, 2.95], [3.0, 2.7]];
  for (const [x, z] of posts) fg.add(node('post', merge(tint(cylinder(0.14, 0.11, 0.06, 8), KB.brassDark), tint(place(cylinder(0.035, 0.035, 0.78, 6), 0, 0.05, 0), KB.brass), tint(place(sphere(0.075, 8, 5), 0, 0.88, 0), KB.brass)), M.prop, { pos: [x, 0, z] }));
  for (let i = 0; i < posts.length - 1; i++) { if (i === 1) continue; const a = posts[i], b = posts[i + 1]; fg.add(node('rope', tint(tube(curve([[a[0], 0.8, a[1]], [(a[0] + b[0]) / 2, 0.58, (a[1] + b[1]) / 2], [b[0], 0.8, b[1]]], 8), 0.035, 5), KB.wine), M.prop)); }
  const foreground = mergeStatic(fg, 'foreground'); scene.root.add(foreground);

  const actors = group('actors'); scene.root.add(actors);

  // ---- lamps and glows
  const chanLamp = (i) => { const a = chanMesh[i].anchors.lamp, c = chans[i]; return [c[0] + a[0], c[1] + a[1], c[2] + a[2]]; };
  const houseLamps = anchorAt(house, 'lamps', HOUSE, 0), doorLight = [W / 2 + 1.1, 1.7, DOOR.x + (FRONT + BACK) / 2];
  const lamps = [
    { name: 'chandelier', pos: chanLamp(0), color: '#ffc468', radius: 8.5, base: 1.0 * L.warm + 0.1 },
    { name: 'chandelier-l', pos: chanLamp(1), color: '#ffb858', radius: 6.2, base: 0.95 * L.warm },
    { name: 'chandelier-r', pos: chanLamp(2), color: '#ffb858', radius: 6.2, base: 0.95 * L.warm },
    { name: 'reels', pos: [HOUSE[0], HOUSE[1] + 1.6, HOUSE[2] + 1.5], color: '#ffd680', radius: 3.6, base: 1.1, fixed: true },
    { name: 'door', pos: doorLight, color: '#ff9a50', radius: 5, base: 1.0 },
    { name: 'moon', pos: [-4.5, 2.6, BACK + 1.8], color: '#8fa8ff', radius: 4.6, base: 0.75 + 0.5 * L.moon, flicker: 0 },
  ];
  const sprites = scene.sprites = createSprites(low ? 128 : 320), glows = [];
  chans.forEach((c, i) => { const p = chanLamp(i); glows.push({ sprite: sprites.add({ kind: 'glow', pos: [p[0], p[1] - 0.1, p[2]], size: i === 0 ? 3.2 : 2.3, color: '#ffb450', alpha: 0 }), base: 0.42 }); });
  for (const p of houseLamps) glows.push({ sprite: sprites.add({ kind: 'glow', pos: p, size: 0.9, color: '#ffe08a', alpha: 0 }), base: 0.6, fixed: true });
  for (const x of [-1.95, 1.95]) glows.push({ sprite: sprites.add({ kind: 'glow', pos: [x, 2.35 + 0.3, BACK + 0.45], size: 1.3, color: '#ffb450', alpha: 0 }), base: 0.5 });
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: [W / 2 + 0.2, 1.5, doorLight[2]], size: 3.0, color: '#ff9a40', alpha: 0 }), base: 0.5, fixed: true });
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: [0, 5.3, BACK - 0.2], size: 4.4, color: '#ffc27a', alpha: 0 }), base: 0.3, fixed: true });

  // ---- per-frame
  const Q = quat.create(), S3 = [1, 1, 1], Mx = m4.create(), P = [0, 0, 0], V = [0, 0, 0], rnd = rng(55);
  let nextSlip = 0;
  function setReel(i, { spin, face } = {}) {
    const rl = reels[i]; if (!rl) throw new Error(`drum-hall: no reel ${i} (have 0..2)`);
    if (face != null) rl.face = ((face % 8) + 8) % 8;
    if (spin != null) { if (rl.spin && !spin) rl.pop = 1; rl.spin = !!spin; }
  }
  function setReels(spin, faces = null) { for (let i = 0; i < 3; i++) setReel(i, { spin, face: faces ? faces[i] : undefined }); }
  function pullLever() { leverT = 0; }
  function setDrum({ turn, open } = {}) { if (turn != null) drum.turn = turn; if (open != null) drum.open = Math.max(0, Math.min(1, open)); }
  function slip(on) { slipNode.visible = !!on; }

  function tick(time, dt, pw, live) {
    for (let i = 0; i < 3; i++) {
      const rl = reels[i];
      if (rl.spin) { rl.speed = Math.min(900, rl.speed + 2400 * dt); rl.angle = (rl.angle + rl.speed * dt) % 360; }
      else {
        const goal = reelAngle(rl.face); let d = ((goal - rl.angle) % 360 + 360) % 360; // always run forward to the face
        if (rl.speed > 1 && d > 0.5) { const step = Math.min(d, Math.max(rl.speed, 240) * dt); rl.angle = (rl.angle + step) % 360; d -= step; if (d < 0.5) { rl.angle = goal; rl.speed = 0; rl.pop = 1; } }
        else { rl.angle = goal; rl.speed = 0; }
      }
      rl.pop = Math.max(0, rl.pop - dt * 4);
      quat.fromEuler(Q, rl.angle * DEG, 0, 0); S3[0] = S3[1] = S3[2] = 1 + rl.pop * 0.07;
      m4.fromTRS(Mx, rl.pos, Q, S3); reelNode.instances.data.set(Mx, i * 20);
    }
    reelNode.instances.dirty = true;
    // lever: down fast, back slow
    let la = -14;
    if (leverT >= 0) { leverT += dt; const u = leverT / 1.1; la = u < 0.25 ? -14 + 96 * (u / 0.25) : u < 1 ? 82 - 96 * Math.pow((u - 0.25) / 0.75, 0.6) : -14; if (u >= 1) leverT = -1; }
    leverArm.setRot(la, 0, 0);
    // lot drum: turns; when stopped it eases round so the hatch faces the hall
    if (drum.turn !== 0) drum.angle = (drum.angle + drum.turn * 360 * dt) % 360;
    else { let d = ((0 - drum.angle) % 360 + 360) % 360; if (d > 180) d -= 360; drum.angle += d * Math.min(1, dt * 5); }
    drumNode.setRot(drum.angle + Math.sin(time * 0.9) * (drum.turn ? 0 : 1.2), 0, 0);
    drum.openNow += (drum.open - drum.openNow) * Math.min(1, dt * 7);
    hatchNode.setRot(-105 * drum.openNow, 0, 0);
    if (live && !low && time > nextSlip) { // lots: slips of paper drifting down through the light
      nextSlip = time + 0.22; P[0] = -5 + rnd() * 10; P[1] = 4.6 + rnd() * 1.6; P[2] = -3.6 + rnd() * 5; V[0] = (rnd() - 0.5) * 0.3; V[1] = -0.5 - rnd() * 0.3; V[2] = 0.1;
      sprites.spawn({ kind: 'dot', pos: P, vel: V, size: 0.07 + rnd() * 0.05, life: 7, color: rnd() < 0.7 ? '#fff6e0' : '#ffd9a0', alpha: 0.95, aspect: 0.5, spin: 2 });
    }
  }

  const drumWorld = [DRUM[0] - 0, DRUM[1] + ld.anchors.axle[1], DRUM[2]];
  return setShell({
    id: 'drum-hall', light, L, scene, cameras: CAMERAS, actors, foreground, lamps, glows, tick,
    motes: low ? null : { box: [-5, 5, 0.6, 4.5, -3.5, 1.5], every: 0.35, color: light === 'hush' ? '#cfdcff' : '#ffd890', size: 0.07, vel: [0.04, 0.05, 0.02], life: 5, alpha: 0.7 },
    marks: {
      ...MARKS,
      lever: { pos: [LEVER[0] + 0.5, DAIS_Y, LEVER[2] + 0.55], face: -60 }, drum: { pos: [DRUM[0] + 1.3, DAIS_Y, DRUM[2] + 0.55], face: -70 },
      reels: reelPos, drumMouth: [drumWorld[0] + Math.sin(DRUM_YAW * DEG) * 0.66, drumWorld[1], drumWorld[2] + Math.cos(DRUM_YAW * DEG) * 0.66], slip: SLIP, focus: [HOUSE[0], HOUSE[1] + 1.5, HOUSE[2] + 0.6],
    },
    extra: { setReel, setReels, pullLever, setDrum, slip, reels },
  });
}

export const drumHall = { id: 'drum-hall', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default drumHall;
