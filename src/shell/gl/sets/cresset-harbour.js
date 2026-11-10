// SET: cresset-harbour. The quay at Cresset, the capital: white stone, a brass rail along the water, the customs
// stair, banners out for Renewal Day, the Circuit ferry alongside; across the basin the town climbs to the
// Assembly dome, and on the head of the mole stands the Founders' Lamp, white, brighter than the sun on that side.
// Chapter 8: ch8.pro.02 / .16 (noon: the Tribune comes ashore; the prisoner comes up the customs stair), ch8.s3.c15
// (night: she reads the order on the harbour wall, under a light that leaves her no dark to sit in), and the mint
// epilogue ch8.mepi.01 (night: father and daughter at the rail, under a lamp that belongs to a company now).
//
//   import { cressetHarbour } from './sets/cresset-harbour.js';
//   const set = cressetHarbour.build(GL, { light: 'day' | 'night', low: false });
//
// Same shape as sets/lantern-stalls.js. Figures face +Z, cameras look toward -Z (the sea), the strip x -3.2..3.2, z 0..1.6 is clear.
//   setLamp(0..1)   the Founders' Lamp (1 = burning white);  cue(lineId) is accepted and changes nothing (the light state is the build's)
// marks: a, b, c, two, party, opposition, plus focus (the lamp), wall { pos, face } (where she sits on the harbour wall),
//        rail { pos, face }, stair { pos, face } (top of the customs stair), gangway { pos, face }

import { m4, quat, rng, DEG } from '../math.js';
import { merge, tint, place, box, cylinder, sphere, tube, curve } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic, makeInstances } from '../scene.js';
import { createSprites } from '../sprites.js';
import { PAL, anchorAt, crate, barrel, sack, bollard, ropeCoil, boat, lampPost, pole, bunting, steps, railing, ferry, gangway, gull } from './kit.js';
import { C8, materials8, shell8, cams, marks8, pick8, norm8, dirFrom, harbourBase, bannerDrop } from './kit-ch8.js';

const QUAY_Z = -5.6, WATER = -0.5;

const LIGHTS = {
  day: {
    preset: 'day', power: 0, night: false,
    env: {
      key: { dir: norm8([-0.55, 0.8, 0.3]), color: '#fff4d6' },
      shadow: { tint: '#8f9cf0', lift: 0.08, saturate: 1.35 },
      ambient: { sky: '#cfe6ff', ground: '#ffe9c0', amount: 0.12 },
      fog: { density: 0.003, start: 22, max: 0.85 },
      sky: { zenith: '#1a62d6', mid: '#4aa8f0', midAt: 0.4, horizon: '#cdeefa', below: '#9adcf0', sunDir: dirFrom(-34, 46) },
      water: { deep: '#1a7fd8', mid: '#2aa8e4', shallow: '#74e2dc', glint: '#ffffff', glintDensity: 0.3 },
    },
    cloud: { color: '#ffffff', shadowTint: '#b4c6f8' }, beam: 0.1, halo: 0.75, white: 0.8, rings: '#ffffff',
  },
  night: {
    preset: 'night', power: 1.15, night: true,
    env: {
      key: { dir: norm8([0.22, 0.52, -1]), color: '#c2d4ff' },
      shadow: { tint: '#3448b4', lift: 0.12, saturate: 1.3 },
      ambient: { sky: '#4a6ce0', ground: '#2e3c9c', amount: 0.17 },
      rim: { color: '#f4f8ff', amount: 1.0, edge: 0.72 },
      fog: { color: '#4f82e6', density: 0.0032, start: 20, max: 0.84 },
      sky: { zenith: '#0a1568', mid: '#1b3cae', midAt: 0.42, horizon: '#5a8cee', below: '#3058c4', sunDir: dirFrom(-12, 26), moon: 0.6, stars: 1, sun: { size: 2.0 } },
      water: { deep: '#122a88', mid: '#2048b4', shallow: '#3c80dc', glint: '#eaf2ff', glintDensity: 0.26 },
    },
    cloud: { color: '#8fa6ea', shadowTint: '#3a50aa' }, beam: 0.3, halo: 1, white: 1.1, rings: '#cfe0ff',
  },
};

const CAMERAS = cams({ low: { target: [0.4, 1.9, 0.2], dist: 6.4, yaw: -10, pitch: -13, fov: 56 } });

function build(engine = null, { light: lightName, low = false } = {}) {
  const [light, L] = pick8('cresset-harbour', LIGHTS, lightName);
  const M = materials8(), r = rng(8101), night = L.night;
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env; env.sky.sunDir = norm8(env.sky.sunDir);
  const sprites = scene.sprites = createSprites(low ? 160 : 384);
  const base = harbourBase({ scene, M, low, seed: 5, quayZ: QUAY_Z, water: WATER, ground: '#f6ead2', beam: L.beam, far: { lit: night ? 0.85 : 0.25, towerGlow: night ? 0.5 : 0 }, cloud: { ...L.cloud, count: 6 } });
  const A = base.F.anchors;

  const near = group('near'), mid = group('mid');
  // the rail along the water, broken for the customs stair
  const RAIL_Z = QUAY_Z + 0.55, STAIR_X = -3.3;
  near.add(node('rail-r', railing({ len: 5.6, h: 0.7, bay: 1.12, color: C8.brass, post: C8.marble2, cap: C8.brass }), M.prop, { pos: [STAIR_X + 1.1 + 2.8, 0, RAIL_Z] }));
  near.add(node('rail-l', railing({ len: 5.4, h: 0.7, bay: 1.1, color: C8.brass, post: C8.marble2, cap: C8.brass }), M.prop, { pos: [STAIR_X - 1.1 - 2.7, 0, RAIL_Z] }));
  mid.add(node('stair', steps({ w: 2.0, n: 6, rise: 0.25, run: 0.4, color: C8.marble, color2: C8.marble2 }), M.prop, { pos: [STAIR_X, 0, QUAY_Z + 0.05] }));
  for (const sx of [-1, 1]) near.add(node('newel', merge(tint(place(cylinder(0.16, 0.2, 0.95, 8), 0, 0, 0), C8.marble), tint(place(sphere(0.2, 8, 6), 0, 1.08, 0), C8.brass)), M.prop, { pos: [STAIR_X + sx * 1.12, 0, RAIL_Z] }));
  // the harbour wall, stage left: low enough to sit on
  const WALL = [-5.3, 0, -1.9];
  near.add(node('wall', merge(tint(place(box(3.6, 0.5, 0.7), 0, 0.25, 0), C8.marble2), tint(place(box(3.8, 0.12, 0.86), 0, 0.56, 0), C8.marble), tint(place(box(0.8, 0.8, 0.8), -2.1, 0.4, 0), C8.marble), tint(place(sphere(0.3, 8, 6), -2.1, 1.0, 0), C8.brass)), M.prop, { pos: WALL, rot: [0, 24, 0] }));
  // lamp posts, banners on tall poles, a string of flags between them
  const posts = [{ pos: [-0.9, 0, RAIL_Z + 0.5], yaw: 0 }, { pos: [6.3, 0, RAIL_Z + 0.5], yaw: 180 }].map((p) => { const m = lampPost({ h: 3.0, arm: 0.6, color: C8.navy, lit: night }); near.add(node('post', m, M.prop, { pos: p.pos, rot: [0, p.yaw, 0] })); return { ...p, mesh: m }; });
  const POLE_L = [-4.4, 0, -3.6], POLE_R = [4.3, 0, -3.9], pl = pole({ h: 5.6, seed: 4, color: C8.marble2, knob: C8.brass }), pr = pole({ h: 5.2, seed: 9, color: C8.marble2, knob: C8.brass });
  near.add(node('poleL', pl, M.prop, { pos: POLE_L }), node('poleR', pr, M.prop, { pos: POLE_R }));
  const topL = anchorAt(pl, 'top', POLE_L), topR = anchorAt(pr, 'top', POLE_R);
  near.add(node('bannerL', bannerDrop({ w: 0.95, h: 2.6, color: C8.oxblood, device: 'flame' }), M.prop, { pos: [topL[0] + 0.62, topL[1] - 0.5, topL[2]], rot: [0, 12, 0] }), node('bannerR', bannerDrop({ w: 0.95, h: 2.4, color: C8.royal, device: 'scales' }), M.prop, { pos: [topR[0] - 0.62, topR[1] - 0.5, topR[2]], rot: [0, -14, 0] }));
  near.add(node('flags', bunting(topL, topR, { sag: 1.1, count: low ? 9 : 15, size: 0.26, colors: [C8.oxblood, C8.brass, PAL.cream, C8.royal, C8.copper], seed: 4 }), M.prop));
  // cargo and quay furniture at the sides
  const clutter = [[crate({ s: 0.62, seed: 1 }), [4.3, 0, -1.3], 14], [crate({ s: 0.5, seed: 2, color: PAL.wood2 }), [4.32, 0.63, -1.35], -12], [barrel({ r: 0.3, h: 0.74 }), [5.1, 0, -0.7], 0], [sack({ seed: 2 }), [3.9, 0, -0.55], 30],
    [bollard({ s: 1.2 }), [5.3, 0, RAIL_Z + 0.3], 0], [bollard({ s: 1.2 }), [-6.3, 0, RAIL_Z + 0.75], 0], [ropeCoil({}), [5.2, 0, RAIL_Z + 1.2], 0], [barrel({}), [-6.6, 0, -0.6], 0], [crate({ s: 0.55, seed: 6 }), [-7.3, 0, -1.3], 30]];
  clutter.forEach(([m, p, yaw], i) => (low && i % 3 === 1) || near.add(node('clutter' + i, m, M.prop, { pos: p, rot: [0, yaw, 0] })));
  // the Circuit ferry alongside, its gangway down, the Audit cutter at the customs stair
  const FERRY = [7.5, WATER, QUAY_Z - 2.5], FERRY_YAW = -90, fm = ferry({ len: 11, seed: 3, keel: C8.oxblood, roof: C8.copper });
  mid.add(node('ferry', fm, M.prop, { pos: FERRY, rot: [0, FERRY_YAW, 0] }));
  const fA = (name) => anchorAt(fm, name, FERRY, FERRY_YAW), gate = fA('gate');
  mid.add(node('gangway', gangway({ len: QUAY_Z + 0.35 - gate[2], w: 0.9, rise: gate[1] }), M.prop, { pos: [gate[0], 0, QUAY_Z + 0.35] }));
  mid.add(node('hawser', tint(tube(curve([[5.3, 0.4, RAIL_Z + 0.3], [5.0, 0.1, QUAY_Z - 0.4], [FERRY[0] - 4.6, WATER + 1.3, FERRY[2] + 0.9]], 8), 0.03, 5, { crease: 180 }), PAL.rope), M.prop));
  mid.traverse((n) => { n.castShadow = false; });
  env.water.shores.push([FERRY[0] + 2.6, FERRY[2], 2.2, 0.6], [FERRY[0] - 2.6, FERRY[2], 2.2, 0.6], [-3.6, -9.2, 0.95, 0.5]);
  scene.root.add(mergeStatic(near, 'near'), mergeStatic(mid, 'mid'));
  const CUTTER = [-3.7, WATER + 0.02, -9.2];
  const cutter = low ? null : node('cutter', boat({ len: 3.2, hull: C8.navy, keel: C8.oxblood, pennant: C8.brass, seed: 2 }), M.prop, { pos: CUTTER, rot: [0, 80, 0] });
  if (cutter) { cutter.castShadow = false; scene.root.add(cutter); }

  const fg = group('fg');
  fg.add(node('fg1', crate({ s: 0.55, seed: 21 }), M.prop, { pos: [-1.6, 0, 2.95], rot: [0, 20, 0] }), node('fg2', bollard({ s: 1.2 }), M.prop, { pos: [1.75, 0, 2.9] }), node('fg3', ropeCoil({ r: 0.24 }), M.prop, { pos: [1.15, 0, 2.6] }));
  const foreground = mergeStatic(fg, 'foreground'); scene.root.add(foreground);
  const gulls = node('gulls', gull({}), M.speck); gulls.instances = makeInstances(5); gulls.instances.count = 5;
  if (!night) scene.root.add(gulls);
  const actors = group('actors'); scene.root.add(actors);

  // ---- lamps: the Founders' Lamp cannot reach as a point light from fifty metres, so its white is a lamp of its own, high on the seaward right
  const postLamps = posts.map((p) => anchorAt(p.mesh, 'lamp', p.pos, p.yaw)), laneLamp = fA('lamp');
  const lamps = [
    { name: 'founders', pos: [3.6, 5.2, -6.5], color: '#f2f8ff', radius: 13, base: L.white, flicker: 0.02, fixed: true },
    { name: 'post-left', pos: postLamps[0], color: '#ffc870', radius: 5.2, base: 1 },
    { name: 'post-right', pos: postLamps[1], color: '#ffc870', radius: 5.2, base: 1 },
    { name: 'ferry', pos: [gate[0], 1.6, QUAY_Z + 0.8], color: '#ffb860', radius: 4.5, base: 0.8 },
  ];
  const glows = postLamps.map((p, i) => ({ sprite: sprites.add({ kind: 'glow', pos: p, size: 1.9, color: '#ffb450', alpha: 0 }), base: 0.55, lamp: i + 1 }));
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: laneLamp, size: 2.6, color: '#ffe9a0', alpha: 0 }), base: 0.5, fixed: night });
  if (night && !low) A.windows.slice(0, 18).forEach((p) => glows.push({ sprite: sprites.add({ kind: 'glow', pos: p, size: 3.0, color: '#ffc060', alpha: 0 }), base: 0.4, fixed: true }));
  let lampGoal = 1;
  const setLamp = (v) => { lampGoal = Math.max(0, Math.min(1, v)); };
  const P = [0, 0, 0], Q = quat.create(), S3 = [1, 1, 1], Mx = m4.create(), rnd = rng(5);
  let nextRing = 0.6, nextGlint = 0;
  function tick(time, dt, pw, live) {
    base.lamp.set(lampGoal * L.halo); base.lamp.update(time); lamps[0].k = lampGoal; base.clouds.update(time);
    if (cutter) { cutter.position[1] = CUTTER[1] + Math.sin(time * 1.3) * 0.04; cutter.setRot(Math.sin(time * 1.1) * 2.5, 80 + Math.sin(time * 0.3) * 3, Math.sin(time * 1.6 + 1) * 4); }
    if (!night) {
      for (let i = 0; i < 5; i++) {
        const a = time * (0.22 + i * 0.03) * (i % 2 ? 1 : -1) + i * 1.9, rad = 7 + i * 2.2;
        P[0] = -4 + i * 3.5 + Math.cos(a) * rad; P[1] = 5 + i * 1.3 + Math.sin(time * 0.5 + i) * 0.8; P[2] = -24 - i * 5 + Math.sin(a) * rad * 0.6;
        quat.fromEuler(Q, 0, Math.sin(a) * 0.35, Math.cos(a) * 0.3 * (i % 2 ? 1 : -1));
        const flap = Math.sin(time * (5.5 + i * 0.4) + i * 2); S3[0] = 1.9; S3[1] = 1.9 * (0.5 + 1.3 * flap); S3[2] = 1.9; if (Math.abs(S3[1]) < 0.12) S3[1] = 0.12;
        m4.fromTRS(Mx, P, Q, S3); gulls.instances.data.set(Mx, i * 20);
      }
      gulls.instances.dirty = true;
    }
    if (live) {
      if (time > nextRing) { nextRing = time + 1.4; P[0] = -8 + rnd() * 14; P[1] = WATER + 0.03; P[2] = QUAY_Z - 1.4 - rnd() * 7; sprites.splash(P, { size: 0.9 + rnd() * 0.6, life: 1.4, spray: 0, color: L.rings }); }
      if (time > nextGlint) { nextGlint = time + 0.2; P[0] = A.lamp[0] + (rnd() - 0.5) * 16; P[1] = WATER + 0.1; P[2] = -12 - rnd() * 30; sprites.sparkle(P, { count: 1, size: 0.5, spread: 0.3, life: 0.9, color: '#ffffff' }); }
    }
  }

  return shell8({
    id: 'cresset-harbour', light, L, low, scene, cameras: CAMERAS, actors, foreground, lamps, glows, tick,
    motes: low ? null : { box: [-4, 4, 0.4, 3.4, -4, 1.5], every: 0.4, color: night ? '#dfeaff' : '#ffffff', size: 0.07, vel: [0.12, 0.08, 0.03], life: 4.5, alpha: night ? 0.8 : 0.5 },
    marks: { ...marks8(), focus: A.lamp, wall: { pos: [WALL[0] + 0.3, 0.62, WALL[2]], face: 24 }, rail: { pos: [1.2, 0, RAIL_Z + 0.5], face: 180 }, stair: { pos: [STAIR_X, 0, QUAY_Z + 0.7], face: 0 }, gangway: { pos: [gate[0], 0, QUAY_Z + 1.0], face: 0 } },
    extra: { setLamp },
  });
}

export const cressetHarbour = { id: 'cresset-harbour', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default cressetHarbour;
