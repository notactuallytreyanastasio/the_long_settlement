// SET: founders-lamp. The lamp room at the top of the Founders' Lamp, on the head of Cresset's mole, at night: the
// great lamp on its plinth with the cold white flame, two brass rings turning round it (twice the size of
// Saltmere's), the brass cap as wide as a cartwheel hanging over it on a chain, the winch that lowers the cap,
// the hopper and the fuel bins, glazing all round with the night, the harbour and the city far below.
// Chapter 8: ch8.s3 The Brass Cap (the order pinned up, the cap still bright from the lathe), and the mint
// ending's ch8.m6.c20-c24 (the cap is down and the room dark; six people wind it up and the lamp catches).
//
//   import { foundersLamp } from './sets/founders-lamp.js';
//   const set = foundersLamp.build(GL, { light: 'lit' | 'dark', low: false });
//
// Same shape as sets/lantern-stalls.js. Figures face +Z, cameras look toward -Z, the strip x -3.2..3.2, z 0..1.6 is clear.
// What this set can do for its story:
//   setCap(0..1)        0 = the cap is down on the cup and the flame is out, 1 = hung high and the lamp burning (it eases)
//   task(type)          any type naming the cap, the lamp or the winch -> { pos, stand, set(v) }: v 0..1 winds the cap up
//   cue(lineId)         ch8.m6.c20 puts the cap down, ch8.m6.c24 ("She's caught") lets it burn again; ch8.s3.* it hangs
// marks: a, b, c, two, party, opposition, plus focus (the flame), winch, hopper, door { pos, face }, order (the pinned order)

import { rng, DEG, rgb } from '../math.js';
import { merge, tint, place, box, cylinder, torus, sphere, setGlow, setOutline } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic } from '../scene.js';
import { createSprites } from '../sprites.js';
import { rayMesh, rayMaterial } from '../fx.js';
import { anchorAt, flame, townBank, crate, sack } from './kit.js';
import {
  C8, materials8, shell8, cams, marks8, pick8, norm8, dirFrom,
  lampPlinth, lampRing, brassCap, chain, winch, hopper, bin, shovel, arcWall, arcStair, glazing, domeInside, shipLantern,
} from './kit-ch8.js';

const CZ = -2.5, RR = 6.6, FLOOR_DROP = -15; // the room's centre and radius; how far below the sea is

const ENV = {
  key: { dir: norm8([0.1, 0.8, -1]), color: '#a9bcf6' },
  shadow: { tint: '#4a55d0', lift: 0.1, saturate: 1.4 },
  ambient: { sky: '#6f90f0', ground: '#5a44c0', amount: 0.14 },
  rim: { color: '#ffffff', amount: 1.1, edge: 0.7 },
  fog: { color: '#3f66d8', density: 0.0012, start: 30, max: 0.7 },
  sky: { zenith: '#0a1466', mid: '#1a3aae', midAt: 0.42, horizon: '#4a7ae6', below: '#2a50c0', sunDir: dirFrom(-13, 15), moon: 0.7, stars: 1, sun: { size: 2.4 } },
  water: { level: FLOOR_DROP, deep: '#122a88', mid: '#1e45ae', shallow: '#3478d6', glint: '#dfeaff', glintDensity: 0.22 },
};
const LIGHTS = { lit: { preset: 'night', power: 1, cap: 1, env: ENV }, dark: { preset: 'night', power: 1, cap: 0, env: ENV } };
const DARK = { key: rgb('#6078d8'), tint: rgb('#3442ac'), amb: 0.12 }; // what the room falls to with the cap down

const CAMERAS = cams({
  wide: { target: [0.05, 1.9, -0.6], dist: 8.6, yaw: 2, pitch: 3, fov: 46 },
  low: { target: [0.1, 2.3, -0.4], dist: 6.4, yaw: -8, pitch: -16, fov: 58 },
  stage: { target: [0, 1.25, 0.3], dist: 9.6, yaw: -13, pitch: 6, fov: 26, aspect: 1.95, shadowCenter: [0, 0, -0.8], shadowRadius: 7.5, outline: 0.7 },
  landscape: { target: [0, 2.0, -1.4], dist: 10.5, yaw: 4, pitch: 3, fov: 42 },
});

const CUES = { 'ch8.m6.c20': 0, 'ch8.m6.c21': 0, 'ch8.m6.c22': 0, 'ch8.m6.c23': 0.25, 'ch8.m6.c24': 1 };

function build(engine = null, { light: lightName, low = false } = {}) {
  const [light, L] = pick8('founders-lamp', LIGHTS, lightName);
  const M = materials8(), r = rng(808);
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  env.sky.sunDir = norm8(env.sky.sunDir);
  const litKey = Array.from(env.key.color), litTint = Array.from(env.shadow.tint), litAmb = env.ambient.amount;

  // ---- the room: a round floor, a low parapet with brass glazing on it, stone at the sides, the dome over it
  const room = group('room'), deco = (n) => { n.castShadow = false; return n; };
  const ringFloor = (rad, col, y) => tint(place(cylinder(rad, rad, 0.02, low ? 16 : 24), 0, y, CZ), col);
  room.add(node('floor', setOutline(merge(tint(place(box(30, 0.02, 14), 0, -0.02, 2), '#5f62d0'), ringFloor(RR, '#7f80e6', -0.015), ringFloor(4.3, '#d2405a', -0.012), ringFloor(4.0, '#9d9cf2', -0.009), ringFloor(2.6, C8.brass, -0.006), ringFloor(2.4, '#7474dc', -0.003)), 0), M.flat));
  room.add(node('parapet', merge(arcWall({ r: RR, h: 1.15, a0: -84, a1: 84, seg: low ? 10 : 16, color: C8.stoneBlue }), arcWall({ r: RR, y: 4.75, h: 1.3, a0: -84, a1: 84, seg: low ? 10 : 16, color: C8.slate })), M.wall));
  for (const sx of [-1, 1]) room.add(node('side', arcWall({ r: RR, h: 6.05, a0: sx > 0 ? 84 : -150, a1: sx > 0 ? 150 : -84, seg: 6, color: sx > 0 ? '#6f6cdc' : '#7872e0' }), M.wall));
  room.add(node('dome', domeInside({ r: RR, h: 3.4, eye: 1.0, seg: low ? 12 : 18, ribs: low ? 6 : 10, color: '#7f8cf0', low }), M.wall, { pos: [0, 6.0, CZ] }));
  scene.root.add(mergeStatic(room, 'room'));

  const props = group('props');
  props.add(deco(node('glazing', glazing({ r: RR - 0.05, y: 1.15, h: 3.6, a0: -84, a1: 84, n: low ? 8 : 12, bars: low ? 1 : 2 }), M.prop, { pos: [0, 0, CZ] })));
  const plinth = lampPlinth({ r: 1.0, h: 1.75, seg: low ? 8 : 12 }), PL = [0, 0, CZ];
  props.add(node('plinth', plinth, M.prop, { pos: PL }));
  const FLAME = anchorAt(plinth, 'flame', PL), CUP = anchorAt(plinth, 'cup', PL), FOCUS = [FLAME[0], FLAME[1] + 0.55, FLAME[2]];
  // the winch, stage right at the back, and the chain's run: up from the drum to a pulley in the dome, across, and down to the cap
  const WINCH = [3.7, 0, -2.3], WYAW = -32, wm = winch({ w: 1.2, h: 1.1 });
  props.add(node('winch', wm, M.prop, { pos: WINCH, rot: [0, WYAW, 0] }));
  const drum = anchorAt(wm, 'drum', WINCH, WYAW), PULLEY_Y = 7.6;
  props.add(deco(node('chain-run', merge(place(chain(PULLEY_Y - drum[1], { link: 0.2 }), drum[0], PULLEY_Y, drum[2]), tint(place(torus(0.22, 0.06, 8, 4), drum[0], PULLEY_Y + 0.1, drum[2], 0, 0, 90), C8.brass), tint(place(torus(0.22, 0.06, 8, 4), 0, PULLEY_Y + 0.1, CZ, 0, 0, 90), C8.brass),
    tint(place(cylinder(0.035, 0.035, Math.hypot(drum[0], drum[2] - CZ), 5), 0, PULLEY_Y + 0.3, CZ, 90, Math.atan2(drum[0], drum[2] - CZ) / DEG, 0), C8.brassDark)), M.prop)));
  // the hopper, the bins it is fed from, the coal shovel
  const HOP = [2.75, 0, -3.9];
  props.add(node('hopper', hopper({ s: 1.15 }), M.prop, { pos: HOP, rot: [0, 150, 0] }));
  props.add(node('bin1', bin({ heap: 'salt' }), M.prop, { pos: [4.6, 0, -0.9], rot: [0, -40, 0] }), node('bin2', bin({ heap: 'ash', color: C8.oxblood }), M.prop, { pos: [5.2, 0, -1.9], rot: [0, -58, 0] }));
  props.add(deco(node('shovel', shovel(), M.prop, { pos: [3.95, 0.02, -0.75], rot: [0, 200, 0] })));
  // stage left: the stair comes up through a hatch, a lit doorway, the order pinned to the door post
  const st = arcStair({ r: RR - 0.1, a0: -128, a1: -96, n: 6, rise: 0.2, w: 1.2, y: -1.2 });
  props.add(deco(node('stair', st, M.prop, { pos: [0, 0, CZ] })));
  const dA = -110, dS = Math.sin(dA * DEG), dC = Math.cos(dA * DEG), DP = [dS * (RR - 0.12), 0, CZ - dC * (RR - 0.12)];
  props.add(deco(node('door', merge(tint(place(box(1.5, 2.7, 0.16), 0, 1.35, 0), '#fff0d4'), setGlow(tint(place(box(1.2, 2.45, 0.1), 0, 1.25, 0.07), '#ffc070'), 0.95), tint(place(box(0.46, 0.6, 0.03), 1.05, 1.6, 0.1, 0, 0, -4), C8.parchment), tint(place(sphere(0.045, 6, 4), 1.05, 1.86, 0.13), C8.oxblood)), M.prop, { pos: DP, rot: [0, -dA, 0] })));
  const ORDER = [DP[0] + Math.cos(-dA * DEG) * 1.05, 1.6, DP[2] - Math.sin(-dA * DEG) * 1.05];
  props.add(node('crate', crate({ s: 0.6, seed: 4 }), M.prop, { pos: [-4.6, 0, -1.0], rot: [0, 24, 0] }), deco(node('sack', sack({ seed: 3, s: 0.36 }), M.prop, { pos: [-5.2, 0, -0.2], rot: [0, 60, 0] })));
  const hand = shipLantern({ s: 1.25 }), HAND = [-4.6, 0.62 + 0.78, -1.0];
  props.add(deco(node('hand-lantern', hand, M.prop, { pos: HAND })));
  props.add(deco(node('sconce', merge(tint(place(box(0.14, 0.5, 0.14), 5.25, 2.3, -0.6), C8.brassDark), tint(place(cylinder(0.2, 0.12, 0.1, 8), 4.95, 2.3, -0.65), C8.brass), setGlow(tint(place(sphere(0.16, 8, 6), 4.95, 2.55, -0.65), '#ffe2a0'), 1)), M.prop)));
  const HUNG = [-19, 21].map((a) => [Math.sin(a * DEG) * (RR - 0.45), 4.5, CZ - Math.cos(a * DEG) * (RR - 0.45)]);
  for (const h of HUNG) props.add(deco(node('hung', shipLantern({ s: 1.5 }), M.prop, { pos: h })));
  if (!low) for (let i = 0; i < 4; i++) { const a = (-62 + i * 41) * DEG; props.add(deco(node('stool' + i, tint(place(cylinder(0.3, 0.36, 0.34, 8), Math.sin(a) * (RR - 0.7), 0, CZ - Math.cos(a) * (RR - 0.7)), i % 2 ? C8.oxblood : C8.brassDark), M.prop))); }
  scene.root.add(mergeStatic(props, 'props'));

  // ---- far below: the harbour and the city, seen through the glass
  const far = group('far'), FAR = low ? M.farFlat : M.far;
  far.add(node('town', townBank({ w: 70, d: 22, h: 17, rows: low ? 3 : 4, seed: 9, lit: 0.9, tower: true }), FAR, { pos: [-34, FLOOR_DROP, -112], rot: [0, 20, 0] }));
  far.add(node('quay', tint(place(box(90, 3, 5), 0, 0, 0), '#7f8ae0'), FAR, { pos: [30, FLOOR_DROP - 0.5, -80], rot: [0, -24, 0] }));
  scene.root.add(mergeStatic(far, 'far'));
  env.water.shores = [[-34, -112, 36, 1.6]];

  // ---- the moving things: rings, flame, cap on its chain
  const rings = [node('ring1', lampRing(1.62, { t: 0.075 }), M.prop), node('ring2', lampRing(2.0, { t: 0.085 }), M.prop)];
  const ringPivot = group('rings', { pos: FOCUS }); rings.forEach((n) => { n.castShadow = false; ringPivot.add(n); }); scene.root.add(ringPivot);
  const fl = node('flame', flame({ r: 0.4, h: 1.25, seg: low ? 6 : 8, root: '#ffffff', tip: '#8fd0ff' }), M.lantern, { pos: FLAME }); fl.castShadow = false; scene.root.add(fl);
  const capMesh = brassCap({ r: 0.95 }), CAP_UP = 5.0, CAP_DOWN = CUP[1] + 0.98 * 0.95 + 0.12;
  const cap = node('cap', capMesh, M.prop, { pos: [0, CAP_UP, CZ] }); scene.root.add(cap);
  const capChain = node('cap-chain', chain(PULLEY_Y - CAP_DOWN, { link: 0.2 }), M.prop, { pos: [0, CAP_UP, CZ] }); capChain.castShadow = false; cap.add(capChain); capChain.setPos(0, PULLEY_Y - CAP_DOWN, 0);
  // light: a column from the flame up into the cap, and two beams leaving through the glass
  const column = node('column', tint(place(rayMesh(3.0, 0.75, 0.28, 12), 0, 3.3, 0), '#cfe4ff'), rayMaterial({ power: 2.2, near: 0.0, far: 0.34 }), { pos: FLAME }); scene.root.add(column);
  const beams = group('beams', { pos: FOCUS });
  { const one = () => tint(rayMesh(60, 0.5, 9, 12), '#e6f4ff'); beams.add(node('beam', merge(place(one(), 0, 0, 0, 0, 0, 86), place(one(), 0, 0, 0, 0, 0, -86)), rayMaterial({ power: 1.4, near: low ? 0.12 : 0.16, far: 0 }))); }
  scene.root.add(beams);

  // ---- foreground
  const fg = group('fg');
  fg.add(node('fg-bin', bin({ heap: 'ash', w: 0.8 }), M.prop, { pos: [1.9, 0, 2.95], rot: [0, -20, 0] }), node('fg-sack', sack({ seed: 7, s: 0.34 }), M.prop, { pos: [-1.8, 0, 2.9], rot: [0, 30, 0] }), node('fg-coil', tint(place(torus(0.3, 0.07, 10, 5), 0, 0.07, 0), C8.brassDark), M.prop, { pos: [-2.4, 0, 2.5] }));
  const foreground = mergeStatic(fg, 'foreground'); scene.root.add(foreground);
  const actors = group('actors'); scene.root.add(actors);

  // ---- lamps and glows
  const handLamp = [HAND[0], HAND[1] - 0.52, HAND[2]];
  const lamps = [
    { name: 'flame', pos: [FOCUS[0], FOCUS[1], FOCUS[2]], color: '#f2f8ff', radius: 6.4, base: 1.4, flicker: 0.08 },
    { name: 'door', pos: [DP[0] + 1.1, 1.5, DP[2] + 0.4], color: '#ff9448', radius: 6.2, base: 1.15, fixed: true },
    { name: 'hand', pos: handLamp, color: '#ffc46a', radius: 4.6, base: 1.0, fixed: true },
    { name: 'sconce', pos: [4.9, 2.5, -0.6], color: '#ffb050', radius: 5.2, base: 0.95, fixed: true },
    { name: 'front', pos: [-2.4, 1.9, 2.4], color: '#ffc080', radius: 5.6, base: 0.9, fixed: true },
    { name: 'back', pos: [0, 4.2, CZ - RR + 0.9], color: '#ffb860', radius: 4.6, base: 0.9, fixed: true },
  ];
  const sprites = scene.sprites = createSprites(low ? 128 : 320), glows = [];
  const flameGlow = sprites.add({ kind: 'glow', pos: FOCUS, size: 4.6, color: '#cfe6ff', alpha: 0 }), core = sprites.add({ kind: 'glow', pos: FOCUS, size: 1.9, color: '#ffffff', alpha: 0 });
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: [DP[0] + 0.3, 1.5, DP[2] + 0.2], size: 2.4, color: '#ff9a40', alpha: 0 }), base: 0.5, fixed: true });
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: handLamp, size: 1.5, color: '#ffb450', alpha: 0 }), base: 0.6, fixed: true });
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: [4.95, 2.55, -0.65], size: 1.5, color: '#ffb450', alpha: 0 }), base: 0.6, fixed: true });
  for (const h of HUNG) glows.push({ sprite: sprites.add({ kind: 'glow', pos: [h[0], h[1] - 0.63, h[2]], size: 1.7, color: '#ffb450', alpha: 0 }), base: 0.7, fixed: true });
  const lensGlow = rings.map(() => sprites.add({ kind: 'sparkle', pos: [0, 0, 0], size: 0.7, color: '#ffffff', alpha: 0 }));

  let capGoal = L.cap, capNow = L.cap, burn = L.cap, nextPuff = 0, nextSpark = 0;
  const setCap = (v) => { capGoal = Math.max(0, Math.min(1, v)); };
  const capTask = { pos: [0, CAP_UP, CZ], stand: [WINCH[0] - 0.9, WINCH[2] + 0.9], set: setCap };
  const task = (type) => (/cap|lamp|winch|flame/.test(String(type)) ? capTask : null);
  const cue = (id) => { if (id in CUES) { setCap(CUES[id]); return true; } if (/^ch8\.s3\./.test(id)) { setCap(1); return true; } return false; };
  const P = [0, 0, 0], rnd = rng(31);
  function tick(time, dt, pw, live) {
    capNow += (capGoal - capNow) * Math.min(1, dt * 1.6 + (dt === 0 ? 1 : 0));
    const want = capNow > 0.12 ? 1 : 0; burn += (want - burn) * Math.min(1, dt * 2.5 + (dt === 0 ? 1 : 0));
    const b = burn * Math.min(1.25, 0.35 + 0.65 * pw), sway = Math.sin(time * 0.7) * 1.2 * capNow;
    cap.setPos(0, CAP_DOWN + (CAP_UP - CAP_DOWN) * capNow, CZ); cap.setRot(sway, 0, Math.sin(time * 0.53 + 1) * 1.4 * capNow);
    rings[0].setRot(24, time * 16, 0); rings[1].setRot(-34, -time * 11 + 40, 12);
    const f = 0.9 + 0.1 * Math.sin(time * 9.1) * Math.sin(time * 5.3);
    fl.setScale(Math.max(0.001, burn * (0.94 + 0.08 * Math.sin(time * 12.3))), Math.max(0.001, burn * f), Math.max(0.001, burn)); fl.setRot(0, time * 40, 0);
    lamps[0].k = burn;
    flameGlow.alpha = 0.5 * b * f; core.alpha = 0.75 * b; column.visible = burn > 0.3 && capNow > 0.5; beams.visible = burn > 0.5; beams.setRot(0, time * 14, 0);
    for (let i = 0; i < 3; i++) env.key.color[i] = DARK.key[i] + (litKey[i] - DARK.key[i]) * burn;
    for (let i = 0; i < 3; i++) env.shadow.tint[i] = DARK.tint[i] + (litTint[i] - DARK.tint[i]) * burn;
    env.ambient.amount = DARK.amb + (litAmb - DARK.amb) * burn;
    for (let i = 0; i < rings.length; i++) { // where each ring's lens is: the ring's +Z turned by its quaternion
      const q = rings[i].rotation, R0 = i ? 2.0 : 1.62, g = lensGlow[i];
      g.pos[0] = FOCUS[0] + 2 * (q[0] * q[2] + q[3] * q[1]) * R0; g.pos[1] = FOCUS[1] + 2 * (q[1] * q[2] - q[3] * q[0]) * R0; g.pos[2] = FOCUS[2] + (1 - 2 * (q[0] * q[0] + q[1] * q[1])) * R0; g.alpha = 0.8 * b;
    }
    if (live) {
      if (burn > 0.5 && time > nextPuff) { nextPuff = time + 0.45; P[0] = FOCUS[0]; P[1] = FOCUS[1] + 0.9; P[2] = FOCUS[2]; sprites.puff(P, { count: 1, size: 0.34, rise: 0.9, spread: 0.1, life: 2.2, color: '#eef4ff' }); }
      if (burn > 0.5 && time > nextSpark) { nextSpark = time + 0.22; P[0] = FOCUS[0] + (rnd() - 0.5) * 3.6; P[1] = FOCUS[1] + (rnd() - 0.5) * 2.6; P[2] = FOCUS[2] + (rnd() - 0.2) * 2; sprites.sparkle(P, { count: 1, size: 0.2, spread: 0.2, life: 0.8, color: '#ffffff' }); }
    }
  }

  return shell8({
    id: 'founders-lamp', light, L, low, scene, cameras: CAMERAS, actors, foreground, lamps, glows, tick, house: 0.6,
    motes: low ? null : { box: [-3.5, 3.5, 0.3, 4.2, -4.5, 1.2], every: 0.35, color: '#dfeaff', size: 0.07, vel: [0.02, 0.08, 0.03], life: 5, alpha: 0.7 },
    marks: { ...marks8(), focus: FOCUS, winch: { pos: [WINCH[0] - 0.95, 0, WINCH[2] + 0.75], face: 120 }, hopper: { pos: [HOP[0] - 0.2, 0, HOP[2] + 1.3], face: 170 }, door: { pos: [DP[0] + 1.3, 0, DP[2] + 0.6], face: 60 }, order: ORDER },
    extra: { setCap, task, cue },
  });
}

export const foundersLamp = { id: 'founders-lamp', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default foundersLamp;
