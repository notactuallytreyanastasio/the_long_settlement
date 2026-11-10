// SET: hall-steps. The steps of the Mint hall on the Hill, late in the afternoon: the broad fourth step where a cadet once
// held a line (a brass strip marks it), the last flight up to the colonnade, the great doors shut under the Audit's red
// seal, and Tobb's old board still on the wall beside them.
// Chapter 7: ch7.s3 (the Assessor's disclosure; Ren arrested on the fourth step, to open the doors) and ch7.s7.c01-13
// (noon, the seal gone: Tobb chalks the forty-light table on his own board and certifies it).
//
//   import { hallSteps } from './sets/hall-steps.js';
//   const set = hallSteps.build(GL, { light: 'afternoon' | 'noon', low: false });
//
// The shape is lantern-stalls' (see ../index.js). Figures face +Z (down the steps, toward the harbour the light comes
// from), cameras look toward -Z at the hall. The strip x -4.4..4.4, z -0.1..1.6 is the fourth step, y = 0. Added here:
//   setSeal(on)         the Audit's seal across the doors ('afternoon' is built with it, 'noon' without)
//   setBoard(state)     'odds' (his old odds, as left) | 'table' (the forty-light table, ringed)
//   task('fourth-step') ch7.s3: setCrowd 0.2 -> 1 with the objective.   task('chalk-table') ch7.s7: odds, wiped ('wiped' is a
//                       third board state), then the table growing up the board; a glow on it when it is whole
//   setback()           the watchers press and a third give back (also passLamp). Core 'dusk' builds 'afternoon', 'day' builds 'noon'.
//   setCrowd(0..1)      the dock come up to watch, at both ends of the step and on the flight below
//   cue(lineId)         the above, keyed to the script (ch7.s3 / ch7.s7)
//   marks.below         one step below the fourth, where the Assessor stops (y = -0.2);  marks.doors, marks.board
//   marks.focus         the seal on the doors
// 'afternoon': a low sun from behind the camera rakes the columns' shadows across the doors and throws everybody's
// shadow up the stair; the two brass standards by the doors are lit. 'noon': a high clear sun, lamps capped.
// low: true drops the watchers below, the shafts, the planting and the studs, and halves the crowd.

import { m4, quat, rng, DEG, rgb } from '../math.js';
import { merge, tint, place, plane, box, sphere, lathe, torus, setGlow } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic, makeInstances } from '../scene.js';
import { createSprites } from '../sprites.js';
import { rayMaterial } from '../fx.js';
import { PAL, kitMaterials, anchorAt, pickLight, cloudBank, gull, tree, bush } from './kit.js';
import { C7, STD_MARKS, STD_CAMERAS, shell7, sunShafts, rows, folk7, dirFrom, norm7, stairs7, tiles, mintHall, auditSeal, lampStandard, banner7, oddsBoard, coreLight, taskUnit, pulse } from './kit-ch7.js';

const HX = 0.85, Z_UP = -1.95, Z_DN = 2.45, RISE = 0.2, RUN = 0.42, N_UP = 6, FLOOR = RISE * N_UP, PORT_Z = Z_UP - RUN * N_UP;
const SMOCKS = ['#4fc0d4', '#ff9470'];

const LIGHTS = {
  afternoon: {
    preset: 'sunset', power: 0.85, sun: 0.3, seal: true, crowd: 0.6,
    env: {
      key: { dir: dirFrom(-126, 17), color: '#ffd9a0' },
      shadow: { tint: '#6a5fd8', lift: 0.07, saturate: 1.5 },
      ambient: { sky: '#ffb090', ground: '#8a6ad8', amount: 0.15 },
      rim: { color: '#ffe0a0', amount: 0.6, edge: 0.76 },
      fog: { density: 0.0016, start: 26, max: 0.6 },
      sky: { zenith: '#2a3cb8', mid: '#7a6ae4', midAt: 0.42, horizon: '#ffb8a0', below: '#f6a878', glow: '#ffd890', glowAmount: 0.3, sunDir: dirFrom(-126, 17), sun: { size: 2.4 } },
      water: null,
    },
    cloud: { color: '#ffc8b0', shadowTint: '#b070c8' }, ray: 0.34, rayColor: '#ffd088', mote: '#ffd890',
  },
  noon: {
    preset: 'day', power: 0, sun: 0.34, seal: false, crowd: 1,
    env: {
      key: { dir: dirFrom(-148, 33), color: '#fff6dc' },
      shadow: { tint: '#929cf0', lift: 0.1, saturate: 1.35 },
      ambient: { sky: '#bfe4ff', ground: '#ffe9b0', amount: 0.12 },
      fog: { density: 0.0012, start: 30, max: 0.5 },
      sky: { zenith: '#1a62d8', mid: '#4aa8f2', midAt: 0.42, horizon: '#c9eefa', below: '#bfe6f4', sunDir: dirFrom(-148, 33) },
      water: null,
    },
    cloud: { color: '#ffffff', shadowTint: '#b4c6f8' }, ray: 0, rayColor: '#fff6d0', mote: '#ffffff',
  },
};

const CORE = { dusk: 'afternoon', day: 'noon' };      // the core's light names this set answers: ch7.s3 is 'dusk', ch7.s7 is 'day'

const CAMERAS = STD_CAMERAS({
  wide: { target: [0.25, 1.95, -0.6], dist: 8.6, yaw: 4, pitch: 3.5, fov: 46, shadowCenter: [0.4, 0, -2.4], shadowRadius: 9 },
  low: { target: [0.4, 2.5, -0.4], dist: 6.4, yaw: -7, pitch: -15, fov: 58, shadowCenter: [0.4, 0, -2.4], shadowRadius: 9 },
  stage: { shadowCenter: [0, 0, -1.6], shadowRadius: 8.5 },
  landscape: { target: [0.4, 2.4, -1.6], dist: 11, yaw: 3, pitch: 4, shadowCenter: [0.4, 0, -2.4], shadowRadius: 11 },
});

function build(engine = null, { light, low = false } = {}) {
  const picked = pickLight('hall-steps', LIGHTS, coreLight(light, CORE)), L = picked.L; light = picked.name;
  const M = kitMaterials(), r = rng(3303), lit = L.power > 0;
  const HALL = [HX, FLOOR, PORT_Z];

  // ---- the stair: the ground below, the flight up from the dock, the fourth step, the flight to the colonnade
  const ground = group('ground');
  ground.add(node('below', tint(place(plane(90, 40, 1, 1), 0, -1.0, 22), '#f1dcae'), M.ground));
  ground.add(node('terrace', tint(place(box(70, 1.6, 30), 0, -0.8, Z_UP - 15), '#f6e2b8'), M.ground));
  ground.add(node('fourth', tint(place(box(44, 1.0, Z_DN - Z_UP), 0, -0.5, (Z_DN + Z_UP) / 2), '#ffe6cc'), M.ground));
  ground.add(node('paving', place(tiles({ w: 44, d: Z_DN - Z_UP - 0.5, nx: 40, nz: 4, colors: ['#ffe9d2', '#f6b7a6'] }), 0, 0.004, (Z_DN + Z_UP) / 2 - 0.2), M.flat));
  ground.add(node('down', stairs7({ w: 44, n: 5, rise: RISE, run: RUN, colors: ['#f7cdb4', '#ffe6cc'], nose: '#e9a892' }), M.ground, { pos: [0, -1.0, Z_DN + RUN * 5] }));
  ground.add(node('up', stairs7({ w: 15.2, n: N_UP, rise: RISE, run: RUN, colors: ['#ffe6cc', '#f7c4ae'], nose: '#e9a892' }), M.ground, { pos: [HX, 0, Z_UP] }));
  // the brass strip let into the fourth step, where the line was held
  const strip = [tint(place(box(15.2, 0.03, 0.12), HX, 0.012, Z_DN - 0.3), C7.brass)];
  if (!low) for (let i = 0; i < 26; i++) strip.push(tint(place(box(0.07, 0.035, 0.07), HX - 7.2 + i * 0.576, 0.02, Z_DN - 0.3, 0, 45, 0), C7.brassDark));
  ground.add(node('strip', merge(strip), M.ground));
  ground.traverse((n) => { n.castShadow = false; });

  // ---- the hall
  const near = group('near');
  const hall = mintHall({ w: 13, h: 4.8, d: 3.2, colX: [-5.7, -3.55, -1.6, 1.6, 3.55, 5.7], doorW: 2.6, doorH: 3.6, doors: 'shut', dome: true, body: 7, detail: low ? 0 : 1, wall: '#ffa98c' });
  near.add(node('hall', hall, M.prop, { pos: HALL }));
  for (const sx of [-1, 1]) { // the cheeks of the stair, a planter on each
    const x = HX + sx * 8.05;
    near.add(node('cheek', merge(tint(place(box(0.9, 1.75, RUN * N_UP + 0.5), 0, 0.875, -RUN * N_UP / 2), C7.stone2), tint(place(box(1.06, 0.14, RUN * N_UP + 0.66), 0, 1.8, -RUN * N_UP / 2), C7.stone), tint(place(box(0.7, 0.3, 0.7), 0, 2.0, -0.5), C7.royalDark)), M.prop, { pos: [x, 0, Z_UP] }));
    if (!low) near.add(node('shrub', bush({ seed: 3 + sx, s: 1.25, color: sx < 0 ? PAL.leaf : PAL.leafDark }), M.prop, { pos: [x, 2.1, Z_UP - 0.5] }));
  }
  // blue urns with clipped bays at the foot of the flight
  if (!low) for (const sx of [-1, 1]) near.add(node('urn', merge(tint(lathe([[0, 0], [0.24, 0], [0.2, 0.08], [0.34, 0.34], [0.36, 0.52], [0.26, 0.62], [0.3, 0.68], [0, 0.68]], 9, { crease: 50 }), C7.royal), tint(place(torus(0.33, 0.035, 9, 3), 0, 0.47, 0), C7.brass), tint(place(sphere(0.42, 9, 6), 0, 1.02, 0), sx < 0 ? PAL.leaf : PAL.leaf2), ...[0, 1, 2, 3, 4].map((k) => tint(place(sphere(0.07, 5, 3), Math.cos(k * 1.3) * 0.36, 1.05 + Math.sin(k * 2.1) * 0.2, Math.sin(k * 1.3) * 0.36 + 0.1), k % 2 ? PAL.coral : PAL.yellow))), M.prop, { pos: [HX + sx * 4.15, 0, Z_UP + 0.42] }));
  // the lamp standards either side of the doors
  const stdL = lampStandard({ h: 2.7, lit }), LAMPS = [anchorAt(hall, 'lampL', HALL), anchorAt(hall, 'lampR', HALL)].map((p) => [p[0], FLOOR, PORT_Z - 1.0]);
  LAMPS[0][0] = HX - 1.6; LAMPS[1][0] = HX + 1.6; LAMPS[0][2] = LAMPS[1][2] = PORT_Z - 0.02;
  LAMPS.push([HX - 5.6, 0, Z_UP + 0.35], [HX + 5.6, 0, Z_UP + 0.35]);
  for (const p of LAMPS) near.add(node('standard', stdL, M.prop, { pos: p }));
  // Tobb's board, on the wall between the second and third columns
  const BOARD = [HX - 2.62, FLOOR + 1.15, PORT_Z - 3.2 + 0.3], ob = oddsBoard({ w: 1.5, h: 1.2, seed: 5 });
  near.add(node('board', ob.board, M.prop, { pos: BOARD }));
  // a plaque on the other side to balance it: the Mint's hours, in brass
  near.add(node('plaque', merge(tint(place(box(1.2, 0.9, 0.06), 0, 0.45, 0), C7.royalDark), tint(place(box(1.3, 0.08, 0.1), 0, 0.92, 0), C7.brass), tint(place(box(1.3, 0.08, 0.1), 0, -0.02, 0), C7.brass), ...[0.68, 0.5, 0.32].map((y, i) => tint(place(box(0.8 - i * 0.14, 0.05, 0.08), 0, y, 0.02), C7.brass))), M.prop, { pos: [HX + 2.62, FLOOR + 1.4, PORT_Z - 3.2 + 0.3] }));
  if (!low) { near.add(node('tree', tree({ seed: 4, h: 3.6 }), M.prop, { pos: [HX - 10.2, 0, -3.4] }), node('tree2', tree({ seed: 9, h: 3.0, leaf: PAL.leafDark }), M.prop, { pos: [HX + 10.4, 0, -3.0] })); }

  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  env.sky.sunDir = norm7(env.sky.sunDir);
  scene.root.add(mergeStatic(ground, 'ground'), mergeStatic(near, 'near'));

  // ---- the seal, and the chalk: their own nodes, the script changes them
  const sealNode = node('seal', setGlow(auditSeal({ r: 0.38, span: 2.3 }), 0.45), M.prop, { pos: anchorAt(hall, 'sealAt', HALL) }); sealNode.castShadow = false; sealNode.visible = L.seal;
  const chalkPos = BOARD;
  const oddsNode = node('chalk-odds', ob.odds, M.flat, { pos: chalkPos }), tableNode = node('chalk-table', ob.table, M.flat, { pos: chalkPos, visible: false });
  oddsNode.castShadow = tableNode.castShadow = false;
  scene.root.add(sealNode, oddsNode, tableNode);

  // ---- the banners in the outer bays: one instanced draw, stirring
  const banMesh = banner7({ w: 1.0, h: 3.1, color: '#ffffff', trim: '#fff0b0', device: '#fff6dc' });
  const BAN = [{ pos: [HX - 4.62, FLOOR + 4.45, PORT_Z - 3.2 + 0.34], col: C7.wine, ph: 0 }, { pos: [HX + 4.62, FLOOR + 4.45, PORT_Z - 3.2 + 0.34], col: C7.teal, ph: 2.1 }];
  const banNode = node('banners', banMesh, M.prop); banNode.castShadow = false; banNode.instances = makeInstances(2); banNode.instances.count = 2;
  BAN.forEach((b, i) => banNode.instances.data.set(rgb(b.col), i * 20 + 16));
  scene.root.add(banNode);

  // ---- sprites, crowd, lamps
  const sprites = scene.sprites = createSprites(low ? 128 : 256);
  const face = (p) => Math.atan2(0 - p[0], 0.6 - p[2]) / DEG;
  const sideSpots = [...rows(3, 9, -6.9, -3.9, -1.7, -0.5, face), ...rows(5, 9, 3.9, 6.9, -1.7, -0.5, face)], spots = [];
  for (let i = 0; i < 9; i++) spots.push(sideSpots[i], sideSpots[9 + i]);
  const folk = folk7({ spots: low ? spots.filter((_, i) => i % 2 === 0) : spots, material: M.prop, seed: 5, coats: SMOCKS.slice(0, low ? 1 : 2), amount: L.crowd });
  scene.root.add(folk.node);
  const foreground = group('foreground');
  scene.root.add(foreground);

  const lampAt = LAMPS.map((p) => [p[0], p[1] + 2.5, p[2]]);
  const lamps = [
    { name: 'standard-left', pos: lampAt[0], color: '#ffc468', radius: 5.6, base: 1.1 },
    { name: 'standard-right', pos: lampAt[1], color: '#ffc468', radius: 5.6, base: 1.1 },
    { name: 'step-left', pos: lampAt[2], color: '#ffc468', radius: 5.2, base: 1.1 },
    { name: 'step-right', pos: lampAt[3], color: '#ffc468', radius: 5.2, base: 1.1 },
  ];
  const glows = lit ? lampAt.map((p) => ({ sprite: sprites.add({ kind: 'glow', pos: p, size: 2.3, color: '#ffb450', alpha: 0 }), base: 0.62 })) : [];
  const FINIAL = anchorAt(hall, 'finial', HALL);
  const domeStar = sprites.add({ kind: 'sparkle', pos: FINIAL, size: 2.4, color: '#fffbe6', alpha: 0 });
  const SEAL = anchorAt(hall, 'sealAt', HALL), sealGlow = sprites.add({ kind: 'glow', pos: [SEAL[0], SEAL[1], SEAL[2] + 0.2], size: 1.5, color: '#ff6a50', alpha: 0 });

  if (!low && L.ray > 0) scene.root.add(node('sun-shafts', sunShafts(env.key.dir, [[HX - 2.6, PORT_Z - 2.9, 11, 1.0, FLOOR + 0.6], [HX + 3.0, PORT_Z - 2.9, 12, 1.1, FLOOR + 0.9], [HX + 5.4, PORT_Z - 2.9, 11, 0.9, FLOOR + 0.4], [HX - 5.0, PORT_Z - 2.9, 12, 0.8, FLOOR + 0.5]], L.rayColor), rayMaterial({ power: 1.2, near: 0.03, far: L.ray })));

  const clouds = cloudBank({ style: 'painted', count: 8, seed: 9, arc: [150, 212], radius: [240, 420], height: [60, 230], size: [0.8, 1.6], speed: 0.05, ...L.cloud });
  scene.root.add(clouds.node);
  const gulls = node('gulls', gull({}), M.speck); gulls.instances = makeInstances(4); gulls.instances.count = 4; scene.root.add(gulls);
  const actors = group('actors'); scene.root.add(actors);

  const boardGlow = sprites.add({ kind: 'glow', pos: [BOARD[0], BOARD[1] + 0.7, BOARD[2] + 0.3], size: 2.6, color: '#ffe27a', alpha: 0 });

  // ---- per-frame
  const P = [0, 0, 0], V = [0, 0, 0], S3 = [1, 1, 1], Q = quat.create(), Mx = m4.create(), rnd = rng(31);
  let nextMote = 0, seal = L.seal, sealNow = seal ? 1 : 0;
  const setSeal = (on) => { seal = !!on; };
  const setBoard = (state) => { if (state !== 'odds' && state !== 'table' && state !== 'wiped') throw new Error(`hall-steps: no board state "${state}" (have odds, wiped, table)`); oddsNode.visible = state === 'odds'; tableNode.visible = state === 'table'; tableNode.scale[1] = 1; };
  let crowdA = 0.5, pressing = false, climbed = false, chalked = false, ringed = 0;
  const setCrowd = (a) => { crowdA = a; folk.setAmount(a); };
  // the live stage's two tasks
  const press = pulse(1.8);
  const stepUnit = taskUnit({
    pos: [SEAL[0], SEAL[1], SEAL[2]], stand: null,
    apply(v, fresh) { if (fresh) { setSeal(true); setBoard('odds'); climbed = true; chalked = false; ringed = 0; } setCrowd(0.2 + 0.8 * v); },
  });
  const chalkUnit = taskUnit({
    pos: [BOARD[0], BOARD[1] + 0.7, BOARD[2] + 0.2], stand: [Math.max(-1.6, Math.min(1.9, BOARD[0] - 0.9)), 0.12],   // the board is up by the doors: he works toward it from the step
    apply(v, fresh) {
      if (fresh) { setSeal(false); setCrowd(0.7); chalked = true; climbed = false; }
      if (v < 0.24) setBoard('odds'); else if (v < 0.49) setBoard('wiped'); else { setBoard('table'); tableNode.scale[1] = Math.max(0.05, Math.min(1, (v - 0.4) / 0.6)); }
      ringed = v >= 0.999 ? 1 : 0; setCrowd(0.7 + 0.3 * v);
    },
  });
  /** 'fourth-step' (ch7.s3): the dock comes up to watch, both ends of the step and the flight below. 'chalk-table' (ch7.s7): his old odds, wiped, then the forty-light table chalked up from the foot of the board. */
  const task = (type) => (type === 'fourth-step' ? stepUnit.arm() : type === 'chalk-table' ? chalkUnit.arm() : null);
  /** The drain: the watchers press up the flight and a third of them are waved back down. */
  function setback() { press.hit(); }
  function cue(lineId) {
    const m = /^ch7\.(s\d)\.?[a-z]?(\d+)?/.exec(lineId || ''); if (!m) return false;
    const n = Number(m[2] || 0);
    if (m[1] === 's3') { setSeal(true); setBoard('odds'); ringed = 0; if (climbed) { if (n >= 16) climbed = false; } else setCrowd(n >= 16 ? 1 : 0.5); return true; }   // after the encounter the dock is already up: c01 does not send it down
    if (m[1] === 's7') { setSeal(false); if (chalked) { if (n >= 3) chalked = false; } else setBoard(n >= 3 ? 'table' : 'odds'); setCrowd(1); return true; }       // ...and the table is already chalked: c01 does not put the odds back
    return false;
  }

  function tick(time, dt, pw, live, power) {
    const pr = press.value(dt);
    if (pr > 0 || pressing) { pressing = pr > 0; folk.setAmount(crowdA * (1 - 0.35 * pr)); }
    boardGlow.alpha = ringed * (0.4 + 0.15 * Math.sin(time * 3));
    folk.update(time, dt, { lit: 0, lively: 0.22 + 0.6 * pr });
    for (let i = 0; i < BAN.length; i++) { const b = BAN[i]; quat.fromEuler(Q, Math.sin(time * 0.9 + b.ph) * 2.2 * DEG, 0, Math.sin(time * 0.7 + b.ph * 2) * 1.6 * DEG); m4.fromTRS(Mx, b.pos, Q, S3); banNode.instances.data.set(Mx, i * 20); }
    banNode.instances.dirty = true;
    for (let i = 0; i < 4; i++) {
      const a = time * (0.2 + i * 0.04) * (i % 2 ? 1 : -1) + i * 1.9, rad = 5 + i * 2.2;
      P[0] = HX - 3 + i * 2.5 + Math.cos(a) * rad; P[1] = 11 + i * 1.3 + Math.sin(time * 0.5 + i) * 0.8; P[2] = -9 - i * 3 + Math.sin(a) * rad * 0.6;
      quat.fromEuler(Q, 0, Math.sin(a) * 0.35, Math.cos(a) * 0.3 * (i % 2 ? 1 : -1));
      const flap = Math.sin(time * (5.5 + i * 0.4) + i * 2); S3[0] = 1.6; S3[1] = 1.6 * (0.5 + 1.3 * flap); S3[2] = 1.6; if (Math.abs(S3[1]) < 0.12) S3[1] = 0.12;
      m4.fromTRS(Mx, P, Q, S3); gulls.instances.data.set(Mx, i * 20);
    }
    S3[0] = S3[1] = S3[2] = 1; gulls.instances.dirty = true;
    clouds.update(time);
    // the seal goes with a small crack of wax, not a pop
    const goal = seal ? 1 : 0;
    if (sealNow !== goal) { sealNow += Math.sign(goal - sealNow) * Math.min(Math.abs(goal - sealNow), dt * 3 + (dt === 0 ? 1 : 0)); if (live && goal === 0 && sealNow < 0.05) sprites.sparkle(SEAL, { count: 5, size: 0.3, spread: 0.6, life: 0.8, color: '#ffb0a0' }); }
    sealNode.visible = sealNow > 0.05; sealNode.scale[0] = sealNode.scale[1] = sealNode.scale[2] = 0.6 + 0.4 * sealNow;
    sealGlow.alpha = sealNow * (lit ? 0.3 + 0.2 * Math.min(1.2, power) : 0.16) * (0.9 + 0.1 * Math.sin(time * 2.2));
    const flash = Math.pow(Math.abs(Math.sin(time * 0.6)), 4);
    domeStar.alpha = (0.4 + 0.5 * flash) * (0.5 + 0.5 * Math.min(1.2, power)); domeStar.rot = time * 0.2; domeStar.size[0] = domeStar.size[1] = 1.8 + 1.4 * flash;
    if (live && time > nextMote) { nextMote = time + (low ? 0.5 : 0.24); P[0] = HX - 5 + rnd() * 10; P[1] = 0.4 + rnd() * 4; P[2] = -5 + rnd() * 6; V[0] = 0.1 + rnd() * 0.1; V[1] = 0.06 + rnd() * 0.12; V[2] = -0.08; sprites.spawn({ kind: 'glow', pos: P, vel: V, size: 0.07 + rnd() * 0.07, life: 5, color: L.mote, alpha: lit ? 0.9 : 0.5 }); }
  }

  return shell7({
    id: 'hall-steps', light, low, L, scene, cameras: CAMERAS, actors, foreground, lamps, glows, sun: L.sun, tick,
    marks: {
      ...STD_MARKS(), focus: SEAL, extras: [{ pos: [1.95, 0, 0.42], face: -52 }],      // where the Tribune waits on the fourth step (ch7.s3), and watches from (ch7.s7)
      below: { pos: [0.5, -RISE, Z_DN + RUN * 0.5], face: 180 }, doors: { pos: [HX, FLOOR, PORT_Z - 2.3], face: 0 }, board: { pos: [BOARD[0] + 0.4, FLOOR, BOARD[2] + 0.9], face: -150 },
      back: [[1.3, 0.1], [2.1, -0.05], [2.9, 0.15], [-1.3, 0.1], [-2.1, -0.05], [-2.9, 0.15]],
    },
    extra: { setSeal, setBoard, setCrowd, cue, task, setback, passLamp: setback },
  });
}

export const hallSteps = { id: 'hall-steps', lights: [...Object.keys(LIGHTS), ...Object.keys(CORE)], cameras: Object.keys(CAMERAS), build };
export default hallSteps;
