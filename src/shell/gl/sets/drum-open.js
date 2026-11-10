// SET: drum-open. The drum hall of the Mint, opened for a public count. Chapter 1 saw this hall from the floor, looking up
// at the Reels (sets/drum-hall.js). Chapter 7 stands on the dais BEHIND them: the Reels of Assay with their brass back
// toward us, the lot drum in its cradle, and down the whole length of the nave the great doors, cut open by the Assessor,
// with the dock's daylight coming in as one shaft that reaches the drum.
// Chapter 7: ch7.s4.c01-02 (the seal cut, "take it down the steps") and ch7.s5 (evening, the hall emptied: the back-plate
// off, three wheels and three pawls, the plumb-weight wired behind the third reel, the key log read by a hand lamp).
//
//   import { drumOpen } from './sets/drum-open.js';
//   const set = drumOpen.build(GL, { light: 'day' | 'evening', low: false });
//
// The shape is lantern-stalls' (see ../index.js). Figures face +Z; cameras look toward -Z, down the nave to the doors.
// The strip x -4.4..4.4, z -0.1..1.6 is the dais (y = 0); the hall floor is 0.6 below it. Added here:
//   setPlate(on)        the brass back-plate of the Reels: fitted, or off and leaning against the cabinet
//   setDrum(state)      'sealed' (in its cradle under the Audit's wax) | 'open' | 'gone' (carried down to the dock)
//   setCrowd(0..1)      the dock in the doorway and down the aisles
//   task('lot-drum')    ch7.s4: the dock comes in with the objective (0.25 -> 1); complete, the drum's wax is off ('open')
//   task('reel-works')  ch7.s5: the plate comes away at the first hits, a wheel is run a tooth per hit, the plumb shows only at the end
//   setback()           the crowd presses; the wheels run back (also passLamp). Core 'dusk' / 'interior' build 'evening'.
//   cue(lineId)         ch7.s4: plate on, drum sealed, the dock at the doors;  ch7.s5: plate off, drum gone, hall empty
//   marks.works         where a figure stands at the open back of the Reels;  marks.bench, marks.drum, marks.plumb (world point),
//   marks.focus         'day': the doorway;  'evening': the hand lamp on the bench
// 'day' is built in the ch7.s4 state, 'evening' in the ch7.s5 state. setPower raises the sconces and the hand lamp, and
// with them the daylight in the doorway. low: true drops the far windows, the banners, the shaft cards and half the crowd.
// Nothing here imports kit-b.js: the hall's pieces are rebuilt in kit-ch7.js so this set does not move when chapter 1's kit does.

import { m4, quat, rng, DEG, rgb } from '../math.js';
import { merge, tint, place, box, cylinder, sphere, tube, curve, setGlow, setOutline, fromArrays } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic, makeInstances, material } from '../scene.js';
import { createSprites } from '../sprites.js';
import { PAL, kitMaterials, pickLight, ledgerBook } from './kit.js';
import {
  C7, STD_MARKS, STD_CAMERAS, shell7, rows, folk7, dirFrom, norm7, stairs7, column7, doorLeaf7, banner7, wall7, tallWindow, fanRays, floorPatch, tiles,
  chandelier7, lotDrum7, reelWorks, plumb, trestle, shipLantern, mintSeal7, paperStack,
  coreLight, taskUnit, pulse } from './kit-ch7.js';

const FLOOR = -0.6, EDGE = -3.0, DOOR_Z = -17.5, HALF = 7, H = 7.0, COL_X = 3.35, COL_Z = [-5.0, -8.3, -11.6, -14.9];

const LIGHTS = {
  day: {
    preset: 'day', power: 0.55, sun: 0.4, state: 's4',
    env: {
      key: { dir: dirFrom(3, 20), color: '#fff2d2' },
      shadow: { tint: '#6464dc', lift: 0.1, saturate: 1.45 },
      ambient: { sky: '#a8b4ff', ground: '#ffb890', amount: 0.16 },
      rim: { color: '#fff6d8', amount: 1.1, edge: 0.7 },
      fog: { density: 0.004, start: 10, max: 0.35, color: '#c9c4ff' },
      sky: { zenith: '#2a78e0', mid: '#6fb8f4', horizon: '#d8f0ff', below: '#bfe6f4', sunDir: dirFrom(3, 20) },
      water: null,
    },
    out: ['#4aa8f2', '#d8f2ff', '#35c0e0'], shaft: '#fff6d8', patch: '#fff0c0', shaftAmt: 0.8, mote: '#fff2c0', fan: 0.9,
  },
  evening: {
    preset: 'night', power: 1, sun: 0.25, state: 's5',
    env: {
      key: { dir: dirFrom(3, 12), color: '#ffb890' },
      shadow: { tint: '#4a4ac0', lift: 0.15, saturate: 1.4 },
      ambient: { sky: '#7a7ae8', ground: '#5a4ab8', amount: 0.2 },
      rim: { color: '#ffc8a0', amount: 0.8, edge: 0.72 },
      fog: { density: 0.004, start: 10, max: 0.35, color: '#6a5ad0' },
      sky: { zenith: '#3a4cc8', mid: '#a184ee', horizon: '#ffcf70', below: '#f6a878', sunDir: dirFrom(3, 12) },
      water: null,
    },
    out: ['#7a6ae4', '#ffc078', '#c86a9a'], shaft: '#ffb880', patch: '#ffc890', shaftAmt: 0.5, mote: '#ffd070', fan: 0.6,
  },
};

const CORE = { dusk: 'evening', interior: 'evening' };      // the core's light names this set answers ('day' is its own)

const CAMERAS = STD_CAMERAS({
  wide: { target: [0.05, 1.7, -0.4], dist: 8.3, yaw: 1.5, pitch: 4.5, fov: 46, shadowCenter: [0, 0, -1.5], shadowRadius: 8 },
  low: { target: [0.0, 2.3, -0.4], dist: 6.4, yaw: -5, pitch: -14, fov: 58 },
  stage: { shadowCenter: [0, 0, -1.0], shadowRadius: 7.5 },
});

function build(engine = null, { light, low = false } = {}) {
  const picked = pickLight('drum-open', LIGHTS, coreLight(light, CORE)), L = picked.L; light = picked.name;
  const K = kitMaterials(), M = {
    ...K,
    wall: material({ name: 'c7-wall', rim: 0, bandEdge: -0.2, outline: { width: 1.9, self: 0.65 }, castShadow: false }),
    shaft: material({ kind: 'beam', name: 'c7-shaft', beam: { power: 0.6, near: L.shaftAmt, far: 0.05, steps: 0 }, outline: false }),
  };
  const r = rng(1907), evening = light === 'evening';
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  env.sky.sunDir = norm7(env.sky.sunDir);

  // ---- the room: dais, steps, nave floor, the far wall with the great doorway, side walls with shuttered windows, ceiling
  const room = group('room');
  room.add(node('dais', tint(place(box(HALF * 2, 0.7, 6.4), 0, -0.35, EDGE + 3.2), '#f8cfa6'), M.wall));
  room.add(node('dais-edge', tint(place(box(HALF * 2, 0.1, 0.16), 0, -0.05, EDGE + 0.08), C7.wine), M.wall));
  room.add(node('dais-steps', stairs7({ w: HALF * 2, n: 3, rise: 0.2, run: 0.36, colors: ['#ffe6cc', '#fff0d6'], nose: C7.wine }), M.wall, { pos: [0, FLOOR, EDGE - 1.08], rot: [0, 180, 0] }));
  room.add(node('floor', place(tiles({ w: HALF * 2, d: EDGE - DOOR_Z, nx: 14, nz: 14, colors: ['#ffeccb', '#ffb9a2'] }), 0, FLOOR, (EDGE + DOOR_Z) / 2), M.flat));
  room.add(node('runner', merge(tint(place(box(2.2, 0.02, EDGE - 1.2 - DOOR_Z), 0, FLOOR + 0.012, (EDGE - 1.2 + DOOR_Z) / 2), C7.wine), ...[-1, 1].map((sx) => tint(place(box(0.12, 0.024, EDGE - 1.2 - DOOR_Z), sx * 0.92, FLOOR + 0.014, (EDGE - 1.2 + DOOR_Z) / 2), C7.brass))), M.flat));
  room.add(node('rug', merge(tint(place(box(7.0, 0.02, 2.6), 0, 0.006, 0.7), C7.wine), tint(place(box(6.6, 0.024, 2.2), 0, 0.008, 0.7), '#d8506e'), tint(place(box(7.0, 0.026, 0.1), 0, 0.01, -0.5), C7.brass), tint(place(box(7.0, 0.026, 0.1), 0, 0.01, 1.9), C7.brass)), M.flat));
  const DOOR = { x: 0, w: 3.4, sill: 0, top: 4.7, arch: true };
  room.add(node('far-wall', wall7({ w: HALF * 2, h: H, t: 0.5, color: '#f2ae9c', openings: [DOOR] }), M.wall, { pos: [0, FLOOR, DOOR_Z] }));
  room.add(node('far-dado', merge(...[-1, 1].map((sx) => tint(place(box(HALF - 1.9, 1.4, 0.08), sx * (HALF + 1.9) / 2, FLOOR + 0.7, DOOR_Z + 0.04), C7.royalDark)), ...[-1, 1].map((sx) => tint(place(box(HALF - 1.9, 0.12, 0.14), sx * (HALF + 1.9) / 2, FLOOR + 1.42, DOOR_Z + 0.07), C7.brass))), M.wall));
  const WIN_Z = low ? [-6.6, -13.2] : [-6.6, -9.9, -13.2, -16.0], side = WIN_Z.map((z) => ({ x: z - (EDGE + DOOR_Z) / 2, w: 1.7, sill: 1.5, top: 5.4, arch: true }));
  for (const sx of [-1, 1]) {
    room.add(node('side', wall7({ w: EDGE - DOOR_Z + 8, h: H, t: 0.4, color: '#eea898', openings: side.map((o) => ({ ...o, x: sx > 0 ? o.x : -o.x })) }), M.wall, { pos: [sx * HALF, FLOOR, (EDGE + DOOR_Z) / 2], rot: [0, -sx * 90, 0] }));
    room.add(node('side-dado', tint(place(box(EDGE - DOOR_Z + 8, 1.4, 0.07), 0, 0.7, 0.035), C7.royalDark), M.wall, { pos: [sx * (HALF - 0.002), FLOOR, (EDGE + DOOR_Z) / 2], rot: [0, -sx * 90, 0] }));
  }
  const ceil = [tint(place(box(HALF * 2, 0.2, EDGE - DOOR_Z + 8), 0, FLOOR + H + 0.1, (EDGE + DOOR_Z) / 2 + 3), '#e9d0ff')];
  for (const z of [-1.2, -4.2, -7.4, -10.6, -13.8, -16.6]) ceil.push(tint(place(box(HALF * 2, 0.4, 0.38), 0, FLOOR + H - 0.2, z, 0, 0, (z * 7 % 3) - 1), C7.plumDark));
  room.add(node('ceiling', merge(ceil), M.wall));

  // ---- props baked to one mesh
  const props = group('props');
  const fans = [['#ff7448', '#ffd65a', '#7fe6d2', '#ff8fb4'], ['#7fe6d2', '#ff8fb4', '#ffd65a', '#ff7448']];
  for (const sx of [-1, 1]) WIN_Z.forEach((z, i) => props.add(node('win', tallWindow({ w: 1.7, h: 3.9, fan: fans[i % 2], glow: L.fan, shut: true }), M.prop, { pos: [sx * HALF, FLOOR + 1.5, z], rot: [0, -sx * 90, 0] })));
  for (const sx of [-1, 1]) COL_Z.forEach((z, i) => { if (low && i === 3) return; props.add(node('col', column7({ h: H, r: 0.36, color: '#fff3dc', seg: low ? 6 : 8 }), M.prop, { pos: [sx * COL_X, FLOOR, z] })); });
  // the doorway: jambs, a brass keystone seal, the two leaves swung in
  props.add(node('door-frame', merge(...[-1, 1].map((sx) => tint(place(box(0.3, 3.0, 0.7), sx * 1.85, FLOOR + 1.5, DOOR_Z + 0.1), '#fff3dc')), place(mintSeal7({ r: 0.62, glow: 0.8 }), 0, FLOOR + 5.55, DOOR_Z + 0.12)), M.prop));
  for (const sx of [-1, 1]) props.add(node('leaf', doorLeaf7({ w: 1.68, h: 3.6, studs: !low }), M.prop, { pos: [sx * 1.7, FLOOR, DOOR_Z + 0.25], rot: [0, sx > 0 ? 180 - 78 : 78, 0], scale: [1, 1, sx > 0 ? -1 : 1] }));
  // the Reels, back toward us
  const WORKS = [2.5, 0, -1.85], WORKS_YAW = -16, rw = reelWorks({});
  props.add(node('reel-cabinet', rw.cabinet, M.prop, { pos: WORKS, rot: [0, WORKS_YAW, 0] }));
  const wAt = (a) => { const c = Math.cos(WORKS_YAW * DEG), s = Math.sin(WORKS_YAW * DEG); return [WORKS[0] + a[0] * c + a[2] * s, WORKS[1] + a[1], WORKS[2] - a[0] * s + a[2] * c]; };
  // the bench they work at, the Assessor's fair copy of the log on it
  const BENCH = [0.1, 0, -1.75];
  props.add(node('bench', trestle({ w: 1.9, d: 0.7, h: 0.78, seed: 7, colors: [C7.woodRed, C7.wood, '#d47648'], legs: C7.plumDark }), M.prop, { pos: BENCH, rot: [0, 4, 0] }));
  props.add(node('log', ledgerBook({ w: 0.62, d: 0.44, thick: 0.06, cover: C7.royalDark }), M.prop, { pos: [BENCH[0] - 0.35, 0.79, BENCH[2] + 0.02], rot: [0, 8, 0] }));
  props.add(node('papers', paperStack({ n: 3, seed: 5, colors: [C7.paper, C7.parchment] }), M.prop, { pos: [BENCH[0] + 0.3, 0.79, BENCH[2] + 0.1] }));
  // the lot drum's cradle stays; the drum itself is a node of its own
  const DRUM = [-2.0, 0, -1.75], DRUM_YAW = 16, ld = lotDrum7({ r: 0.66, len: 1.3 });
  props.add(node('cradle', ld.cradle, M.prop, { pos: DRUM, rot: [0, DRUM_YAW, 0] }));
  if (!low) {
    const cols = [C7.wine, C7.teal, C7.plum, C7.royal];
    for (const sx of [-1, 1]) COL_Z.slice(0, 3).forEach((z, i) => props.add(node('banner', banner7({ w: 0.9, h: 2.6, color: cols[(i * 2 + (sx > 0 ? 1 : 0)) % 4] }), M.prop, { pos: [sx * (COL_X - 0.02), FLOOR + 5.6, z + 0.5], rot: [0, 0, (r() - 0.5) * 3] })));
  }
  props.add(node('lamp-stand', merge(tint(tube(curve([[1.72, 0, -1.2], [1.76, 1.3, -1.2], [1.68, 2.1, -1.2], [1.38, 2.18, -1.16]], 8), (t) => 0.045 - 0.018 * t, 5, { crease: 180 }), C7.brass), tint(place(cylinder(0.17, 0.12, 0.1, 7), 1.72, 0, -1.2), C7.brassDark)), M.prop));
  const CHAN = [[0, FLOOR + H - 0.4, -6.6, 1.5, 1.0], [0, FLOOR + H - 0.4, -12.4, 1.5, 0.9]];
  const chanMesh = CHAN.map(([x, y, z, drop, rad]) => { const c = chandelier7({ drop, r: rad, arms: 6, lit: evening }); props.add(node('chandelier', c, M.prop, { pos: [x, y, z] })); return c; });
  // sconces on the nearest columns
  const SCONCE = [[-COL_X + 0.1, 2.0, COL_Z[0] + 0.5], [COL_X - 0.1, 2.0, COL_Z[0] + 0.5]];
  for (const p of SCONCE) props.add(node('sconce', merge(tint(place(cylinder(0.09, 0.07, 0.1, 6), 0, -0.1, 0), C7.brass), setGlow(tint(place(sphere(0.13, 7, 5), 0, 0.1, 0), '#ffe0a0'), 0.95)), M.prop, { pos: p }));
  scene.root.add(mergeStatic(props, 'props'), mergeStatic(room, 'room'));

  // ---- outside the doors: the sky, the sea, the red roofs of the Dock Quarter below (one unlit card and a few boxes)
  const oz = DOOR_Z - 2.2, [oTop, oLow, oSea] = L.out, out = [];
  { const P0 = [-5, FLOOR + 6, oz, 5, FLOOR + 6, oz, -5, FLOOR + 1.3, oz, 5, FLOOR + 1.3, oz], m = fromArrays(P0, [0, 2, 3, 0, 3, 1], null, 180), ct = rgb(oTop), cl = rgb(oLow);
    for (let i = 0; i < 4; i++) { const c = i < 2 ? ct : cl; m.colors[i * 3] = c[0]; m.colors[i * 3 + 1] = c[1]; m.colors[i * 3 + 2] = c[2]; } out.push(m); }
  out.push(tint(place(box(10, 0.75, 0.02), 0, FLOOR + 0.95, oz + 0.02), oSea), tint(place(box(10, 0.6, 0.02), 0, FLOOR + 0.3, oz + 0.04), '#fff0d0'));
  for (let i = 0; i < 9; i++) { const x = -4 + i * 1.0 + r() * 0.3, s = 0.5 + r() * 0.4; out.push(tint(place(box(s, s * 0.9, 0.02), x, FLOOR + 0.55 + s * 0.4, oz + 0.06), i % 2 ? '#ffe6c4' : '#fff6dc'), tint(place(cylinder(s * 0.72, 0, s * 0.6, 4), x, FLOOR + 0.55 + s * 0.85, oz + 0.3, 0, 45, 0, 1, 1, 0.1), C7.roofs[i % 5])); }
  const outNode = node('outside', setOutline(setGlow(merge(out), 1), 0), K.speck); outNode.castShadow = false; scene.root.add(outNode);

  // ---- the shaft: cards from the doorway to the drum, and the light it lays on the floor
  const aim = [DRUM[0] + 0.2, 0.9, DRUM[2]], src = [0, FLOOR + 2.6, DOOR_Z + 0.3], dirS = [aim[0] - src[0], aim[1] - src[1] - 1.0, aim[2] - src[2]];
  if (!low) scene.root.add(node('shaft', fanRays([-1.5, 1.5, FLOOR + 3.9, DOOR_Z + 0.4], [[-6.2, -5.0, FLOOR, -9.5], [DRUM[0] - 1.1, DRUM[0] + 0.9, 0.9, DRUM[2] - 0.2], [-0.7, 0.5, FLOOR, -5.2], [1.6, 2.8, FLOOR, -7.5], [4.6, 5.9, FLOOR, -10.5]], L.shaft), M.shaft));
  const patch = merge(floorPatch([[-1.55, DOOR_Z + 0.3], [1.55, DOOR_Z + 0.3], [DRUM[0] + 1.9, EDGE - 1.1], [DRUM[0] - 1.3, EDGE - 1.1]], { color: L.patch, glow: 0.8, y: FLOOR + 0.018 }), floorPatch([[DRUM[0] - 1.35, EDGE], [DRUM[0] + 1.95, EDGE], [DRUM[0] + 2.0, -0.6], [DRUM[0] - 1.5, -0.6]], { color: L.patch, glow: 0.8, y: 0.012 }));
  // the five windows of chapter 1 are behind us now: their coloured heads lie on the dais at our feet
  const stain = []; ['#ff9a6c', '#ffd86a', '#ffa0c0', '#ffd86a', '#ff9a6c'].forEach((c, i) => { const x = -3.6 + i * 1.8; for (let k = 0; k < 3; k++) { const a = x - 0.42 + k * 0.3, sh = 0.5; stain.push(floorPatch([[a, 2.25], [a + 0.24, 2.25], [a + 0.24 - sh, 3.3 - Math.abs(k - 1) * 0.16], [a - sh, 3.3 - Math.abs(k - 1) * 0.16]], { color: c, glow: evening ? 0.35 : 0.85, y: 0.014 })); } });
  const patchNode = node('patch', merge(patch, ...stain), M.flat); patchNode.castShadow = false; scene.root.add(patchNode);

  // ---- the three wheels (one instanced draw), the back-plate, the plumb, the drum
  const wheelNode = node('wheels', rw.wheel, M.prop); wheelNode.castShadow = false; wheelNode.instances = makeInstances(3); wheelNode.instances.count = 3; scene.root.add(wheelNode);
  const wheels = rw.anchors.wheels.map((a, i) => ({ pos: wAt(a), angle: i * 45, tick: 0 }));
  const plateOn = wAt(rw.anchors.plateOn), plateOff = wAt([2.55, 0, 0.55]);
  const plateNode = node('back-plate', rw.plate, M.prop, { pos: plateOn, rot: [0, WORKS_YAW, 0] }); scene.root.add(plateNode);
  const PLUMB = wAt(rw.anchors.plumb), plumbNode = node('plumb', plumb({ drop: 0.3, s: 1.5 }), M.prop, { pos: PLUMB }); plumbNode.castShadow = false; scene.root.add(plumbNode);
  const drumPivot = group('drum-pivot', { pos: [DRUM[0], ld.anchors.axle[1], DRUM[2]], rot: [0, DRUM_YAW, 0] });
  const drumNode = node('lot-drum', merge(ld.drum, ld.hatch), M.prop), sealNode = node('drum-seal', ld.seal, M.prop); sealNode.castShadow = false;
  drumNode.add(sealNode); drumPivot.add(drumNode); scene.root.add(drumPivot);
  // the hand lamp: on the bench by day, lit in the evening
  const STAND = [1.72, 0, -1.2], HOOK = [STAND[0] - 0.34, 2.12, STAND[2] + 0.04];
  const handMesh = shipLantern({ drop: 0.2, s: 1.45, glass: evening ? '#ffe6a0' : '#eef2ff' }); if (!evening) setGlow(handMesh, 0.12);
  const handNode = node('hand-lamp', handMesh, M.prop, { pos: HOOK }); handNode.castShadow = false; scene.root.add(handNode);

  const foreground = group('foreground'); scene.root.add(foreground);
  const actors = group('actors'); scene.root.add(actors);

  // ---- sprites, the dock in the doorway, lamps
  const sprites = scene.sprites = createSprites(low ? 128 : 256);
  const spots = [...rows(3, 7, -1.5, 1.5, DOOR_Z + 0.9, DOOR_Z + 2.2, 0, FLOOR), ...rows(5, 5, -6.2, -4.4, -6, -13, 80, FLOOR), ...rows(7, 5, 4.4, 6.2, -6, -13, -80, FLOOR)];
  const folk = folk7({ spots: low ? spots.filter((_, i) => i % 2 === 0) : spots, material: M.prop, seed: 9, coats: ['#4fc0d4'], tints: ['#ffffff', '#ffd8c8', '#fff0b0', '#d8ffe0', '#ffd0e0', '#e0e0ff'], amount: L.state === 's4' ? 1 : 0 });
  scene.root.add(folk.node);
  const handLamp = [HOOK[0], HOOK[1] - 0.6, HOOK[2] + 0.12], chanLamp = [CHAN[0][0], CHAN[0][1] + chanMesh[0].anchors.lamp[1], CHAN[0][2]]; void chanLamp;
  const lamps = [
    { name: 'hand', pos: handLamp, color: '#ffbe62', radius: 6.2, base: evening ? 1.35 : 0 },
    { name: 'doorway', pos: [0, FLOOR + 2.2, DOOR_Z + 2.4], color: evening ? '#ffb080' : '#fff2d0', radius: 9, base: evening ? 0.7 : 1.1, flicker: 0 },
    { name: 'drum', pos: [DRUM[0] + 0.3, 2.3, DRUM[2] - 0.9], color: evening ? '#ffb080' : '#fff0c8', radius: 4.6, base: evening ? 0.5 : 1.7, flicker: 0 },
    { name: 'sconce-left', pos: [SCONCE[0][0] + 0.3, SCONCE[0][1] + 0.1, SCONCE[0][2] + 0.2], color: '#ffb858', radius: 5.0, base: 1.0 },
    { name: 'sconce-right', pos: [SCONCE[1][0] - 0.3, SCONCE[1][1] + 0.1, SCONCE[1][2] + 0.2], color: '#ffb858', radius: 5.0, base: 1.0 },
    { name: 'windows', pos: [0, 3.4, 3.6], color: evening ? '#a8b4ff' : '#fff2dc', radius: 9.5, base: evening ? 0.75 : 1.5, flicker: 0 },   // the hall's five windows, behind the camera
  ];
  const glows = [];
  for (const p of SCONCE) glows.push({ sprite: sprites.add({ kind: 'glow', pos: [p[0], p[1] + 0.1, p[2]], size: 1.3, color: '#ffb450', alpha: 0 }), base: 0.6 });
  if (evening) { glows.push({ sprite: sprites.add({ kind: 'glow', pos: handLamp, size: 2.2, color: '#ffa848', alpha: 0 }), base: 0.62 }); for (const c of CHAN) glows.push({ sprite: sprites.add({ kind: 'glow', pos: [c[0], c[1] - c[3] + 0.2, c[2]], size: 2.6, color: '#ffb450', alpha: 0 }), base: 0.4 }); }
  const doorGlow = sprites.add({ kind: 'glow', pos: [0, FLOOR + 2.4, DOOR_Z + 0.2], size: evening ? 6 : 8.5, color: evening ? '#ffb070' : '#fff6d8', alpha: 0 });
  const plumbGlint = sprites.add({ kind: 'sparkle', pos: [PLUMB[0], PLUMB[1] - 0.4, PLUMB[2] + 0.1], size: 0.5, color: '#eaf2ff', alpha: 0 });

  // ---- per-frame
  const P = [0, 0, 0], V = [0, 0, 0], S3 = [1, 1, 1], Q = quat.create(), Mx = m4.create(), rnd = rng(55);
  let plate = L.state === 's4', plateNow = plate ? 1 : 0, drumState = L.state === 's4' ? 'sealed' : 'gone', nextMote = 0, nextTick = 2;
  const setPlate = (on) => { plate = !!on; };
  const setDrum = (state) => { if (!['sealed', 'open', 'gone'].includes(state)) throw new Error(`drum-open: no drum state "${state}" (have sealed, open, gone)`); drumState = state; };
  let crowdA = 0, pressing = false, opened = false, working = false, found = true, teeth = 0;
  const setCrowd = (a) => { crowdA = a; folk.setAmount(a); };
  // the live stage's two tasks
  const press = pulse(1.8);
  const drumUnit = taskUnit({
    pos: [DRUM[0], 1.2, DRUM[2] + 0.3], stand: [DRUM[0] - 0.8, 0.35],
    apply(v, fresh) { if (fresh) { setPlate(true); working = false; found = true; opened = true; } setDrum(v >= 0.999 ? 'open' : 'sealed'); setCrowd(0.25 + 0.75 * v); },
  });
  const worksUnit = taskUnit({
    pos: [PLUMB[0], PLUMB[1], PLUMB[2] + 0.15], stand: [WORKS[0] - 1.1, 0.3],
    apply(v, fresh) {
      if (fresh) { setDrum('gone'); setCrowd(0); working = true; opened = false; teeth = Math.floor(v * 20); }
      setPlate(v < 0.12); found = v >= 0.999;
      const n = Math.floor(v * 20 + 0.001); if (n > teeth) { wheels[n % 3].tick = 1; teeth = n; }
    },
  });
  /** 'lot-drum' (ch7.s4): the dock comes down the aisles; at the end the wax is off the drum. 'reel-works' (ch7.s5): the plate comes away, the wheels are run a tooth at a time, and behind the third the plumb shows at the last. */
  const task = (type) => (type === 'lot-drum' ? drumUnit.arm() : type === 'reel-works' ? worksUnit.arm() : null);
  /** The drain: the crowd presses (s4); the wheels run back a turn (s5). */
  function setback() { press.hit(); for (const w of wheels) w.tick = 2; }
  function cue(lineId) {
    const m = /^ch7\.(s\d)/.exec(lineId || ''); if (!m) return false;
    if (m[1] === 's4') { setPlate(true); setDrum(opened ? 'open' : 'sealed'); setCrowd(1); working = false; found = true; return true; }   // after the encounter the wax is already off
    if (m[1] === 's5') { setPlate(false); setDrum('gone'); setCrowd(0); working = false; found = true; opened = false; return true; }
    return false;
  }

  function tick(time, dt, pw, live, power) {
    const pr = press.value(dt);
    if (pr > 0 || pressing) { pressing = pr > 0; folk.setAmount(crowdA * (1 - 0.35 * pr)); }
    folk.update(time, dt, { lit: 0, lively: 0.3 + 0.6 * pr });
    // the plate: fitted, or walked off to lean against the cabinet's flank
    const goal = plate ? 1 : 0; plateNow += (goal - plateNow) * Math.min(1, dt * 4 + (dt === 0 ? 1 : 0));
    const k = plateNow;
    plateNode.position[0] = plateOff[0] + (plateOn[0] - plateOff[0]) * k; plateNode.position[1] = plateOff[1] + (plateOn[1] - plateOff[1]) * k; plateNode.position[2] = plateOff[2] + (plateOn[2] - plateOff[2]) * k;
    plateNode.setRot(-12 * (1 - k), WORKS_YAW - 62 * (1 - k), 0);
    const open = 1 - k;
    plumbNode.visible = open > 0.5 && found; plumbNode.setRot(Math.sin(time * 1.7) * 2.5, 0, Math.sin(time * 1.3 + 1) * 3);
    plumbGlint.alpha = open > 0.5 && found ? 0.55 + 0.4 * Math.sin(time * 2.6) : 0; plumbGlint.rot = time * 0.4;
    // honest brass: now and then a wheel is let run a tooth and the pawl drops
    if (live && open > 0.5 && !working && time > nextTick) { nextTick = time + 1.2 + rnd() * 2; const w = wheels[Math.floor(rnd() * 3)]; w.tick = 1; }
    for (let i = 0; i < 3; i++) {
      const w = wheels[i]; if (w.tick > 0) { const step = Math.min(w.tick, dt * 3); w.tick -= step; w.angle += step * 45; }
      quat.fromEuler(Q, w.angle * DEG, WORKS_YAW * DEG, 0); m4.fromTRS(Mx, w.pos, Q, S3); wheelNode.instances.data.set(Mx, i * 20);
    }
    wheelNode.instances.dirty = true;
    drumPivot.visible = drumState !== 'gone'; sealNode.visible = drumState === 'sealed';
    drumNode.setRot(Math.sin(time * 0.9) * 1.2, 0, 0);
    handNode.setRot(0, 0, Math.sin(time * 1.1) * 1.2);
    doorGlow.alpha = (evening ? 0.42 : 0.5) * (0.6 + 0.4 * Math.min(1.25, power)) * (0.96 + 0.04 * Math.sin(time * 0.8));
    for (const i of [1, 2, 5]) env.points[i].intensity = lamps[i].base * (0.55 + 0.45 * Math.min(1.25, power));
    if (live && time > nextMote) { // dust in the shaft
      nextMote = time + (low ? 0.4 : 0.16); const u = rnd();
      P[0] = src[0] + dirS[0] * u + (rnd() - 0.5) * 2.0; P[1] = src[1] + dirS[1] * u + (rnd() - 0.5) * 2.4; P[2] = src[2] + dirS[2] * u; V[0] = 0.05; V[1] = 0.04 + rnd() * 0.06; V[2] = 0.06;
      sprites.spawn({ kind: 'glow', pos: P, vel: V, size: 0.07 + rnd() * 0.07, life: 5, color: L.mote, alpha: 0.85 });
    }
  }

  return shell7({
    id: 'drum-open', light, low, L, scene, cameras: CAMERAS, actors, foreground, lamps, glows, sun: L.sun, tick,
    marks: {
      ...STD_MARKS(), focus: evening ? handLamp : [0, FLOOR + 2.4, DOOR_Z],
      works: { pos: [WORKS[0] - 0.9, 0, WORKS[2] + 1.25], face: -150 }, bench: { pos: [BENCH[0], 0, BENCH[2] + 0.75], face: 180 }, drum: { pos: [DRUM[0] + 1.3, 0, DRUM[2] + 0.5], face: -110 }, plumb: PLUMB,
      back: [[1.3, 0.1], [2.1, -0.05], [2.9, 0.15], [-1.3, 0.1], [-2.1, -0.05], [-2.9, 0.15]],
    },
    extra: { setPlate, setDrum, setCrowd, cue, task, setback, passLamp: setback },
  });
}

export const drumOpen = { id: 'drum-open', lights: [...Object.keys(LIGHTS), ...Object.keys(CORE)], cameras: Object.keys(CAMERAS), build };
export default drumOpen;
