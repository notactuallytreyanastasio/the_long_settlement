// SET: orrery. The lamp-engine as a model: a round tower room open to the night sea through five arches,
// and in the middle of it a brass orrery of forty lights. Five toothed rings precess round a cold flame;
// each carries eight small lamps, one for every island city. Twenty-nine burn. Eleven have gone dark.
// Chapter 1: ch1.pro.02 - ch1.pro.04 (the narrator: forty cities, the lamps, the lanes; eleven gone dark).
//
//   import { orrery } from './sets/orrery.js';
//   const set = orrery.build(GL, { light: 'night', low: false });
//
// Same shape as sets/lantern-stalls.js. Figures face +Z, cameras look toward -Z, the strip x -4.4..4.4,
// z 0..1.6 is clear. The orrery stands at x 0, z -2.6; its rings sweep out to 2.5 from the hub at y 3.
// NOTE the 'close' mark is on the lamps (target near the hub), not on a head: the prologue lines here have nobody on stage.
//
// What this set can do for its story:
//   setDark(n, instant = false)   how many of the forty lamps are out (0..11): they go out, or relight, one at a time
//   cue(lineId) -> bool           ch1.pro.02 / .03: all forty lit;  ch1.pro.04: eleven go dark one by one
//   setSpeed(k)                   how fast the rings turn (1 = as designed)
// marks: a, b, c, two, party, opposition as everywhere, plus focus (the hub), lampCount (40), darkCount

import { m4, quat, rng, DEG } from '../math.js';
import { merge, tint, place, box, plane, cylinder, sphere, ellipsoid, lathe, torus, tube, setGlow, setOutline, flip } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic, makeInstances } from '../scene.js';
import { createSprites } from '../sprites.js';
import { kitMaterials } from './kit.js';
import { KB, kitBMaterials, setShell, lightOf, norm3, wall, windowFrame, shaftCards, rug, column, gear, globe, telescope, scroll, fileStack } from './kit-b.js';
import { trimSet } from '../scene.js';
import { withDetail } from '../mesh.js';

const O = [0, 0, -2.6], RW = 6.9, WALL_H = 5.6, HUB_Y = 3.0;

const LIGHTS = {
  night: {
    preset: 'night', power: 1,
    env: {
      key: { dir: norm3([-0.3, 0.7, 0.64]), color: '#d6e2ff' },
      shadow: { tint: '#3a44b8', lift: 0.12, saturate: 1.35 },
      ambient: { sky: '#5f7cf0', ground: '#3a3aa8', amount: 0.17 },
      rim: { color: '#9fe8ff', amount: 0.75, edge: 0.72 },
      fog: { density: 0.0016, start: 30, max: 0.7 },
      sky: { zenith: '#070f52', mid: '#16309c', midAt: 0.42, horizon: '#4f78e0', below: '#16309c', stars: 1, moon: 0.72, sunDir: norm3([0.16, 0.34, -1]), sun: { size: 2.6 } },
      water: { deep: '#0e1f78', mid: '#1a3aa6', shallow: '#2c68cc', glint: '#bfe0ff', glintDensity: 0.22 },
    },
  },
};

const CAMERAS = {
  wide: { target: [0, 2.35, -1.4], dist: 9.4, yaw: 4, pitch: 3, fov: 46, aspect: 0.46, shadowCenter: [0, 0, -1.4], shadowRadius: 7 },
  two: { target: [0, 1.12, 0.6], dist: 6.0, yaw: -15, pitch: 5, fov: 31, aspect: 0.46, shadowCenter: [0, 0, 0.3], shadowRadius: 3.6 },
  close: { target: [0.25, 3.05, -2.4], dist: 5.4, yaw: 22, pitch: -5, fov: 34, aspect: 0.46, shadowCenter: [0, 0, -2], shadowRadius: 5 },
  low: { target: [0, 3.0, -1.9], dist: 6.4, yaw: -9, pitch: -22, fov: 58, aspect: 0.46, shadowCenter: [0, 0, -1.5], shadowRadius: 7 },
  stage: { target: [0, 1.25, 0.2], dist: 10.2, yaw: -12, pitch: 5, fov: 26, aspect: 1.95, shadowCenter: [0, 0, -0.8], shadowRadius: 7, outline: 0.7 },
  landscape: { target: [0, 2.3, -1.8], dist: 10.5, yaw: 4, pitch: 3, fov: 42, aspect: 1.6, shadowCenter: [0, 0, -1.5], shadowRadius: 9 },
};

const MARKS = {
  a: { pos: [-0.8, 0, 0.55], face: 14 }, b: { pos: [0.02, 0, 0.8], face: 0 }, c: { pos: [0.82, 0, 0.55], face: -14 },
  two: [{ pos: [-0.42, 0, 0.62], face: 24 }, { pos: [0.42, 0, 0.62], face: -24 }],
  party: [{ pos: [-1.05, 0, 0.75], face: 78 }, { pos: [-1.85, 0, 1.15], face: 72 }, { pos: [-2.5, 0, 0.5], face: 80 }],
  opposition: [{ pos: [1.05, 0, 0.75], face: -78 }, { pos: [1.85, 0, 1.15], face: -72 }, { pos: [2.55, 0, 0.5], face: -80 }],
};

// five rings: radius, tilt from level (degrees), precession (degrees/second, sign = direction), lamp drift along the ring (degrees/second)
const RINGS = [
  { r: 1.0, tilt: 62, prec: 19, drift: 26, ph: 0.3 },
  { r: 1.36, tilt: 34, prec: -13, drift: -18, ph: 1.7 },
  { r: 1.72, tilt: 50, prec: 9, drift: 13, ph: 3.1 },
  { r: 2.08, tilt: 20, prec: -7, drift: -10, ph: 4.4 },
  { r: 2.46, tilt: 38, prec: 5, drift: 7, ph: 5.6 },
];
const PER_RING = 8, COUNT = RINGS.length * PER_RING;
// the eleven that are out, in the order they went (ring * 8 + slot)
const DARK = [3, 14, 22, 37, 9, 28, 0, 33, 19, 6, 25];

function build(engine = null, { light: lightName = 'night', low = false } = {}) {
  const [light, L] = lightOf('orrery', LIGHTS, lightName);
  const M = kitBMaterials(), r = rng(4040);
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  env.water.level = -7; env.water.shores = [];

  // ---- the room: a round floor, five wall bays each with an arch on the sea, a dome
  const room = group('room');
  room.add(node('floor', tint(place(plane(30, 24), 0, -0.004, 2), '#8898ee'), M.flat));
  room.add(node('floor-disc', setOutline(merge(tint(place(cylinder(6.3, 6.3, 0.01, 28), 0, 0, 0), '#a8b4f6'), tint(place(cylinder(4.6, 4.6, 0.01, 28), 0, 0.004, 0), '#5a6ad8'), tint(place(cylinder(4.4, 4.4, 0.01, 28), 0, 0.008, 0), '#a8b4f6'),
    tint(place(cylinder(2.6, 2.6, 0.01, 24), 0, 0.012, 0), KB.brass), tint(place(cylinder(2.45, 2.45, 0.01, 24), 0, 0.016, 0), '#2c3aa8')), 0), M.flat, { pos: O }));
  // a compass star let into the floor, pointing at the lens
  const star = []; for (let i = 0; i < 8; i++) { const a = i * 45, long = i % 2 === 0; star.push(tint(place(cylinder(long ? 0.36 : 0.22, 0, long ? 4.3 : 3.4, 4), 0, 0.02, 0, 90, a, 0, 1, 0.02, 1), long ? KB.brass : '#dfe4ff')); }
  room.add(node('star', setOutline(merge(star), 0), M.flat, { pos: O }));
  const bays = [-80, -40, 0, 40, 80], apo = RW * Math.cos(20 * DEG), chord = 2 * RW * Math.sin(20 * DEG) + 0.3;
  const ARCH = { x: 0, w: 2.9, sill: 0.95, top: 4.7, arch: true };
  const bayAt = (a, out = 0, y = 0) => [O[0] + Math.sin(a * DEG) * (apo - out), y, O[2] - Math.cos(a * DEG) * (apo - out)];
  for (const a of bays) room.add(node('bay', wall({ w: chord, h: WALL_H, t: 0.5, color: '#9aa6f4', openings: [ARCH] }), M.wall, { pos: bayAt(a), rot: [0, -a, 0] }));
  // the dome: seen from inside, so flipped; a band of gilt, a scatter of painted stars
  const dome = flip(lathe([[RW + 0.3, 0], [RW + 0.1, 1.2], [RW * 0.82, 2.6], [RW * 0.5, 3.7], [1.1, 4.3], [0, 4.35]], 20, { crease: 180 }));
  room.add(node('dome', tint(dome, '#3540b4'), M.wall, { pos: [O[0], WALL_H, O[2]] }));
  room.add(node('dome-band', tint(place(torus(RW + 0.05, 0.16, 20, 4), 0, 0, 0), KB.brass), M.wall, { pos: [O[0], WALL_H, O[2]] }));
  const stars = []; for (let i = 0; i < (low ? 16 : 34); i++) { const a = (r() - 0.5) * 3.2, t = 0.25 + r() * 0.6, rad = RW * Math.cos(t * 1.45) * 0.97, y = WALL_H + 4.2 * Math.sin(t * 1.45) * 0.98; stars.push(setGlow(tint(place(cylinder(0.07 + r() * 0.06, 0, 0.02, 4), O[0] + Math.sin(a) * rad, y, O[2] - Math.cos(a) * rad, 90 - t * 80, -a / DEG, 0), '#ffe08a'), 0.9)); }
  room.add(node('dome-stars', setOutline(merge(stars), 0), M.wall));
  scene.root.add(mergeStatic(room, 'room'));

  // ---- props
  const props = group('props'), deco = (n) => { n.castShadow = false; return n; };
  for (const a of bays) props.add(deco(node('arch', windowFrame({ w: ARCH.w, h: ARCH.top - ARCH.sill, color: '#dfe4ff', bars: 0, transom: false, fan: null, depth: 0.5, sillOut: 0.22 }), M.prop, { pos: bayAt(a, 0, ARCH.sill), rot: [0, -a, 0] })));
  for (const a of [-100, -60, -20, 20, 60, 100]) props.add(node('col', column({ h: WALL_H, r: 0.3, color: '#dfe4ff', band: KB.brass }), M.prop, { pos: [O[0] + Math.sin(a * DEG) * (RW - 0.35), 0, O[2] - Math.cos(a * DEG) * (RW - 0.35)] }));
  // the engine's standing parts: a stepped plinth with gear trains, the pillar, the cradle and the flame's cage
  const plinth = merge(
    tint(lathe([[0, 0], [1.45, 0], [1.45, 0.22], [1.2, 0.22], [1.2, 0.5], [0.92, 0.5], [0.92, 0.86], [0.5, 0.98], [0, 0.98]], 12, { crease: 30 }), KB.royal),
    tint(place(torus(1.45, 0.07, 12, 4), 0, 0.22, 0), KB.brass), tint(place(torus(1.2, 0.06, 12, 4), 0, 0.5, 0), KB.brass), tint(place(torus(0.92, 0.06, 12, 4), 0, 0.86, 0), KB.brass),
    tint(lathe([[0, 0.9], [0.26, 0.9], [0.16, 1.2], [0.11, HUB_Y - 0.75], [0.2, HUB_Y - 0.6], [0.12, HUB_Y - 0.46], [0, HUB_Y - 0.46]], 10, { crease: 40 }), KB.brass),
    place(gear({ r: 0.46, teeth: 10, t: 0.1 }), 0.6, 0.72, 0.98, 0, 16, 0), place(gear({ r: 0.3, teeth: 8, t: 0.1, color: KB.copper }), -0.42, 0.6, 1.16, 0, -14, 0), place(gear({ r: 0.36, teeth: 9, t: 0.1, color: '#dfe4ff' }), -0.95, 0.72, 0.7, 0, -40, 0));
  props.add(node('plinth', plinth, M.prop, { pos: O }));
  const cage = merge(tint(place(torus(0.42, 0.035, 14, 4), 0, 0, 0), KB.brass), tint(place(torus(0.42, 0.035, 14, 4), 0, 0, 0, 90, 0, 0), KB.brass), tint(place(torus(0.42, 0.035, 14, 4), 0, 0, 0, 90, 90, 0), KB.brass), tint(place(cylinder(0.2, 0.3, 0.12, 10), 0, -0.5, 0), KB.brassDark));
  props.add(deco(node('cage', cage, M.prop, { pos: [O[0], HUB_Y, O[2]] })));
  // a fixed meridian hoop the rings turn inside, on two arms
  props.add(deco(node('meridian', merge(tint(place(torus(2.74, 0.055, 28, 4), 0, HUB_Y, 0, 90, 0, 0), KB.brassDark), tint(place(box(0.5, 0.12, 0.3), 0, HUB_Y - 2.74, 0), KB.brassDark)), M.prop, { pos: O, rot: [0, 14, 0] })));
  // what an astronomer keeps to hand
  props.add(node('telescope', telescope({ len: 1.4 }), M.prop, { pos: [-4.6, 0, -2.2], rot: [0, 150, 0], scale: 1.2 }));
  const table = merge(tint(place(cylinder(0.75, 0.75, 0.08, 12), 0, 0.8, 0), KB.royalDark), tint(place(torus(0.75, 0.04, 12, 4), 0, 0.84, 0), KB.brass), tint(lathe([[0, 0], [0.4, 0], [0.34, 0.06], [0.08, 0.14], [0.07, 0.8], [0, 0.8]], 8, { crease: 40 }), KB.brassDark));
  props.add(node('chart-table', table, M.prop, { pos: [4.75, 0, -1.9] }), deco(node('table-globe', globe({ r: 0.3 }), M.prop, { pos: [4.6, 0.88, -2.1] })), deco(node('table-scroll', scroll({ len: 0.5 }), M.prop, { pos: [5.0, 0.88, -1.6], rot: [0, 60, 0] })), deco(node('table-scroll2', scroll({ len: 0.4, ribbon: KB.teal }), M.prop, { pos: [4.6, 0.88, -1.5], rot: [0, -20, 0] })));
  if (!low) props.add(node('charts', fileStack({ n: 5, seed: 7, colors: ['#dfe8ff', KB.parchment, '#c8d4ff'] }), M.prop, { pos: [5.3, 0, -0.9] }));
  // two braziers, warm against all that blue
  const brazier = merge(tint(lathe([[0, 0], [0.3, 0], [0.26, 0.05], [0.05, 0.1], [0.05, 0.86], [0.16, 0.95], [0.4, 1.12], [0.44, 1.26], [0.36, 1.26], [0.3, 1.14], [0, 1.1]], 10, { crease: 40 }), KB.brassDark), setGlow(tint(place(ellipsoid(0.26, 0.2, 0.26, 8, 5), 0, 1.3, 0), '#ff9a3a'), 0.95), setGlow(tint(place(ellipsoid(0.14, 0.22, 0.14, 8, 5), 0.02, 1.42, 0), '#ffe07a'), 1));
  const BRAZ = [[-3.9, 0, -0.75], [3.9, 0, -0.75]];
  for (const p of BRAZ) props.add(node('brazier', brazier, M.prop, { pos: p }));
  props.add(deco(node('carpet', rug({ round: true, w: 3.4, field: '#2c3aa8', border: KB.brass, line: '#dfe4ff', medallion: KB.teal }), M.prop, { pos: [0, 0.02, 0.85], scale: [1.5, 1, 0.62] })));
  scene.root.add(mergeStatic(props, 'props'));

  // ---- far out: the dark shapes of islands on the horizon, some with a light
  const far = group('far'), isl = [];
  for (let i = 0; i < 9; i++) { const a = (-64 + i * 16 + (r() - 0.5) * 8) * DEG, d = 150 + r() * 120, s = 6 + r() * 10; isl.push({ pos: [Math.sin(a) * d, -7 + s * 0.42, O[2] - Math.cos(a) * d], lit: i % 4 !== 2 }); far.add(node('isle', tint(place(ellipsoid(s * 1.6, s * 0.4, s, 8, 5), Math.sin(a) * d, -7, O[2] - Math.cos(a) * d), '#1c2a88'), M.speck)); }
  scene.root.add(mergeStatic(far, 'far'));
  if (!low) { // moonlight through the middle arches
    const sh = []; for (const a of [-40, 0, 40]) { const p = bayAt(a, 0.1, (ARCH.sill + ARCH.top) / 2); sh.push(place(shaftCards({ w: ARCH.w * 0.75, h: (ARCH.top - ARCH.sill) * 0.6, dir: [0, -1, 0.95], len: 5.4, cards: 2, color: '#7f9cf0' }), p[0], p[1], p[2], 0, -a, 0)); }
    scene.root.add(node('shafts', merge(sh), M.shaft));
  }

  // ---- the rings (one instanced draw) and the forty lamps (one instanced draw)
  const ringMesh = merge(tint(torus(1, 0.03, 32, 4), KB.brass), ...Array.from({ length: 16 }, (_, i) => tint(place(box(0.05, 0.035, 0.05), Math.cos(i * 22.5 * DEG) * 1.045, 0, Math.sin(i * 22.5 * DEG) * 1.045, 0, -i * 22.5, 0), KB.brassDark)));
  const ringNode = node('rings', ringMesh, M.prop); ringNode.castShadow = false; ringNode.instances = makeInstances(RINGS.length); ringNode.instances.count = RINGS.length; scene.root.add(ringNode);
  const lampMesh = merge(setGlow(tint(sphere(0.085, 8, 6), '#ffffff'), 0.95), tint(place(cylinder(0.06, 0.035, 0.05, 6), 0, 0.07, 0), [0.75, 0.55, 0.2]), tint(place(cylinder(0.035, 0.06, 0.05, 6), 0, -0.12, 0), [0.75, 0.55, 0.2]));
  const lampNode = node('city-lamps', lampMesh, kitMaterials().lantern); lampNode.instances = makeInstances(COUNT); lampNode.instances.count = COUNT; scene.root.add(lampNode);
  const flame = node('cold-flame', merge(setGlow(tint(place(ellipsoid(0.2, 0.34, 0.2, 10, 7), 0, 0.04, 0), '#8fe8ff'), 1), setGlow(tint(place(ellipsoid(0.1, 0.2, 0.1, 8, 5), 0, 0, 0), '#ffffff'), 1)), kitMaterials().lantern, { pos: [O[0], HUB_Y, O[2]] });
  scene.root.add(flame);

  // ---- foreground: nothing (the low camera lies on the floor here, and anything near the lens would be in its way)
  const foreground = group('foreground'); scene.root.add(foreground);

  const actors = group('actors'); scene.root.add(actors);

  // ---- lamps and glows
  const HUB = [O[0], HUB_Y, O[2]];
  const lamps = [
    { name: 'cold-flame', pos: [HUB[0], HUB[1], HUB[2] + 0.2], color: '#7fd8ff', radius: 9.5, base: 1.15, flicker: 0.08 },
    { name: 'brazier-l', pos: [BRAZ[0][0], 1.5, BRAZ[0][2] + 0.2], color: '#ff9a4a', radius: 4.8, base: 1.05, flicker: 0.14 },
    { name: 'brazier-r', pos: [BRAZ[1][0], 1.5, BRAZ[1][2] + 0.2], color: '#ff9a4a', radius: 4.8, base: 1.05, flicker: 0.14 },
    { name: 'front', pos: [0, 2.6, 3.4], color: '#b8c8ff', radius: 6, base: 0.7, flicker: 0 },
  ];
  const sprites = scene.sprites = createSprites(low ? 128 : 256), glows = [];
  const flameGlow = sprites.add({ kind: 'glow', pos: HUB, size: 2.6, color: '#7fd8ff', alpha: 0.7 });
  for (const p of BRAZ) glows.push({ sprite: sprites.add({ kind: 'glow', pos: [p[0], 1.4, p[2]], size: 1.9, color: '#ff9a40', alpha: 0 }), base: 0.6 });
  for (const s of isl) if (s.lit) sprites.add({ kind: 'glow', pos: s.pos, size: 9, color: '#ffc870', alpha: 0.85 });
  const lampGlow = []; for (let i = 0; i < COUNT; i++) lampGlow.push(sprites.add({ kind: 'glow', pos: [0, 0, 0], size: 0.5, color: '#ffc860', alpha: 0 }));

  // ---- per-frame
  const Q = quat.create(), Qt = quat.create(), S3 = [1, 1, 1], Mx = m4.create(), P = [0, 0, 0], V = [0, 0, 0], rnd = rng(17);
  const lit = new Float32Array(COUNT).fill(1), order = new Int8Array(COUNT).fill(-1); DARK.forEach((k, i) => { order[k] = i; });
  let darkGoal = DARK.length, darkNow = DARK.length, speed = 1, spin = 0, nextSpark = 0;
  for (const k of DARK) lit[k] = 0;
  function setDark(n, instant = false) { darkGoal = Math.max(0, Math.min(DARK.length, Math.round(n))); if (instant) { darkNow = darkGoal; for (let i = 0; i < COUNT; i++) lit[i] = order[i] >= 0 && order[i] < darkGoal ? 0 : 1; } }
  function setSpeed(k) { speed = k; }
  function cue(lineId) {
    if (lineId === 'ch1.pro.02' || lineId === 'ch1.pro.03') { setDark(0, true); return true; }
    if (lineId === 'ch1.pro.04') { setDark(DARK.length); return true; }
    return false;
  }
  const WARM = [1.0, 0.8, 0.36], OUT = [0.2, 0.26, 0.62];
  function tick(time, dt, pw, live) {
    spin += dt * speed;
    // lamps go out (or relight) one every 0.28 s
    if (darkNow !== darkGoal) darkNow += Math.sign(darkGoal - darkNow) * Math.min(Math.abs(darkGoal - darkNow), dt / 0.28);
    for (let i = 0; i < RINGS.length; i++) {
      const R = RINGS[i];
      quat.fromEuler(Q, R.tilt * DEG, (R.prec * spin + R.ph * 57.3) * DEG, 0);
      S3[0] = S3[1] = S3[2] = R.r; m4.fromTRS(Mx, HUB, Q, S3); ringNode.instances.data.set(Mx, i * 20);
      for (let j = 0; j < PER_RING; j++) {
        const k = i * PER_RING + j, a = (j * (360 / PER_RING) + R.drift * spin) * DEG;
        P[0] = Math.cos(a) * R.r; P[1] = 0; P[2] = Math.sin(a) * R.r;
        // rotate P by Q
        const qx = Q[0], qy = Q[1], qz = Q[2], qw = Q[3], ix = qw * P[0] + qy * P[2] - qz * P[1], iy = qw * P[1] + qz * P[0] - qx * P[2], iz = qw * P[2] + qx * P[1] - qy * P[0], iw = -qx * P[0] - qy * P[1] - qz * P[2];
        const x = ix * qw + iw * -qx + iy * -qz - iz * -qy + HUB[0], y = iy * qw + iw * -qy + iz * -qx - ix * -qz + HUB[1], z = iz * qw + iw * -qz + ix * -qy - iy * -qx + HUB[2];
        const want = order[k] >= 0 && order[k] < darkNow - 0.001 ? 0 : 1;
        if (want < lit[k] && lit[k] === 1 && live) { V[0] = 0; V[1] = 0.35; V[2] = 0; P[0] = x; P[1] = y + 0.1; P[2] = z; sprites.puff(P, { count: 1, size: 0.2, rise: 0.4, spread: 0.03, life: 1.3, color: '#c8d4ff' }); }
        lit[k] += (want - lit[k]) * Math.min(1, dt * 6 + (dt === 0 ? 1 : 0)); if (Math.abs(want - lit[k]) < 0.01) lit[k] = want;
        const fl = 0.93 + 0.07 * Math.sin(time * 8 + k * 1.7), d = lampNode.instances.data, o = k * 20, on = lit[k] * Math.min(1, pw + 0.25);
        d[o] = d[o + 5] = d[o + 10] = 1; d[o + 1] = d[o + 2] = d[o + 4] = d[o + 6] = d[o + 8] = d[o + 9] = 0; d[o + 12] = x; d[o + 13] = y; d[o + 14] = z; d[o + 15] = 1;
        for (let c = 0; c < 3; c++) d[o + 16 + c] = OUT[c] + (WARM[c] * fl - OUT[c]) * on;
        const g = lampGlow[k]; g.pos[0] = x; g.pos[1] = y; g.pos[2] = z; g.alpha = 0.62 * on * fl;
      }
    }
    ringNode.instances.dirty = true; lampNode.instances.dirty = true;
    const ff = 0.9 + 0.1 * Math.sin(time * 6.3) * Math.sin(time * 2.9);
    flame.setScale(1 + 0.06 * Math.sin(time * 5.1), 1 + 0.12 * Math.sin(time * 7.3 + 1), 1 + 0.06 * Math.sin(time * 4.3));
    flameGlow.alpha = 0.62 * ff * Math.min(1.2, pw + 0.2); flameGlow.size[0] = flameGlow.size[1] = 2.5 + 0.3 * ff;
    if (live && !low && time > nextSpark) { nextSpark = time + 0.3; const p = BRAZ[rnd() < 0.5 ? 0 : 1]; P[0] = p[0] + (rnd() - 0.5) * 0.3; P[1] = 1.45; P[2] = p[2]; V[0] = (rnd() - 0.5) * 0.2; V[1] = 0.6 + rnd() * 0.4; V[2] = 0.05; sprites.spawn({ kind: 'glow', pos: P, vel: V, size: 0.07 + rnd() * 0.05, life: 1.7, color: '#ffb050', alpha: 0.95 }); }
  }

  return setShell({
    id: 'orrery', light, L, scene, cameras: CAMERAS, actors, foreground, lamps, glows, tick,
    motes: low ? null : { box: [-2.6, 2.6, 0.6, 5.2, -4.6, -0.4], every: 0.3, color: '#bfe8ff', size: 0.06, vel: [0.03, 0.05, 0.02], life: 6, alpha: 0.7 },
    marks: { ...MARKS, focus: HUB, lampCount: COUNT, darkCount: DARK.length },
    extra: { setDark, setSpeed, cue, task: () => null },
  });
}

export const orrery = { id: 'orrery', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build: (g, o) => { const set = withDetail(o && o.low ? 0.7 : 1, () => build(g, o)); trimSet(set); return set; } };   // low: round things are cut with 0.7 of their segments (mesh.js withDetail); trimSet: each pass skips the triangles its cameras can never see
export default orrery;
