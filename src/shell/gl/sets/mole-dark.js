// SET: mole-dark. Cresset's quay with the Founders' Lamp out: the tower a dark shape on the head of the mole
// against the last daylight, and beyond the mole the sea standing up. A crowd has come out of its doors with
// whatever lights it owns. Stage left, the harbour wall with its chalk (who is owed); stage right, the foot of
// the Mint steps and a watchman's brazier.
// Chapter 8: ch8.s5.c22-c25 (the cap comes down; the water begins, very slowly, to stand up), ch8.s6.c01 and
// ch8.m6.c01 (first minute), ch8.s6.c20 (commons: Corvane comes down the mole alone and reads the chalk; the
// boats are out in the roads), ch8.m6.c14 (mint: he watches from the Mint steps).
//
//   import { moleDark } from './sets/mole-dark.js';
//   const set = moleDark.build(GL, { light: 'dusk', low: false });
//
// Same shape as sets/lantern-stalls.js. Figures face +Z, cameras look toward -Z (the sea), the strip x -3.2..3.2, z 0..1.6 is clear.
//   setSea(0..1)      how far the sea has stood up beyond the mole (it eases);  setLamp(0..1) the Founders' Lamp
//   setBoats(0..1)    the small boats with their fire pans, strung across the roads inside the mole (commons ending)
//   setCrowd(0..1)    how much of the city is on the quay
//   task('quay-lights') -> { pos, stand: null, set(v) }: the scene-6 encounter (the same in both endings). v 0..1 brings
//                     the city out of its doors onto the quay with whatever lights it owns, while the sea goes on
//                     standing up. Asking for it starts from the cap just down: a few people, no boats. Its `stand` is where
//                     the walk ends: the water, stage right.
//   cue(lineId)       ch8.s5.c22 lamp out, sea 0.15; c25 sea 0.6; ch8.s6.c01 / ch8.m6.c01 sea 0.85; ch8.s6.c20 boats out, sea 0.5; ch8.m6.c14 sea 1, the quay nearly empty
// marks: a, b, c, two, party, opposition, plus focus (the dark lamp), chalk { pos, face }, steps { pos, face } (on the Mint steps)

import { rng, DEG } from '../math.js';
import { merge, tint, place, box } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic, makeInstances } from '../scene.js';
import { createSprites } from '../sprites.js';
import { PAL, anchorAt, crate, barrel, sack, bollard, ropeCoil, lampPost, steps, brazier, flame, crowd, townsfolk } from './kit.js';
import { C8, materials8, shell8, cams, marks8, pick8, norm8, dirFrom, unit8, noteLean8, harbourBase, seaWall, chalkWall, column8, skiff, putInst } from './kit-ch8.js';

const QUAY_Z = -5.6, WATER = -0.5;

const LIGHTS = {
  dusk: {
    preset: 'sunset', power: 1.1,
    env: {
      key: { dir: dirFrom(-20, 13), color: '#ffb48c' },
      shadow: { tint: '#5a52cc', lift: 0.12, saturate: 1.35 },
      ambient: { sky: '#8a72e6', ground: '#4a40ae', amount: 0.19 },
      rim: { color: '#ffb080', amount: 1.1, edge: 0.7 },
      fog: { color: '#b06aa8', density: 0.0026, start: 22, max: 0.8 },
      sky: { zenith: '#161c7c', mid: '#5a46c0', midAt: 0.36, horizon: '#ff9666', below: '#b05c96', glow: '#ffc890', glowAmount: 0.85, sunDir: dirFrom(-20, -1.2), sun: { size: 3.4, haloAmount: 0.6 } },
      water: { deep: '#1a2486', mid: '#3c46b4', shallow: '#b0709c', foam: '#ffd0c4', glint: '#ffa880', glintDensity: 0.26 },
    },
    cloud: { color: '#e88aa0', shadowTint: '#5a4ab8', count: 5 },
  },
};

const CAMERAS = cams({ low: { target: [0.3, 1.9, 0.2], dist: 6.4, yaw: -9, pitch: -12, fov: 56 } });
const CUES = {
  'ch8.s5.c22': { lamp: 0, sea: 0.15, boats: 0, crowd: 0.5 }, 'ch8.s5.c25': { sea: 0.6, crowd: 1 },
  'ch8.s6.c01': { lamp: 0, sea: 0.85, boats: 0, crowd: 1 }, 'ch8.m6.c01': { lamp: 0, sea: 0.85, boats: 0, crowd: 1 },
  'ch8.s6.c20': { lamp: 0, sea: 0.5, boats: 1, crowd: 0.6 }, 'ch8.m6.c14': { lamp: 0, sea: 1, boats: 0, crowd: 0.15 },
};

function build(engine = null, { light: lightName, low = false } = {}) {
  const [light, L] = pick8('mole-dark', LIGHTS, lightName);
  const M = materials8(), r = rng(8202);
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env; env.sky.sunDir = norm8(env.sky.sunDir);
  const sprites = scene.sprites = createSprites(low ? 192 : 448);
  const base = harbourBase({ scene, M, low, seed: 5, quayZ: QUAY_Z, water: WATER, ground: '#e8d2c0', cobbles: ['#f6dcc8', '#e0c4b4', '#eed0c0', '#d8bcb0'], cloud: L.cloud, beam: 0.22, far: { lit: 0.9 } });
  const A = base.F.anchors;

  // ---- the sea standing up beyond the mole: two walls, the nearer one curling, the farther one higher and darker
  const SEA_Z = A.moleZ - 16;
  const sea1 = node('sea1', seaWall({ w: 300, h: 15, seg: low ? 20 : 36, seed: 2, bow: 14, deep: '#1c2a96', mid: '#3460d8', high: '#62b4f0', foam: '#fff0e8' }), M.sea, { pos: [0, WATER - 0.2, SEA_Z] });
  const sea2 = node('sea2', seaWall({ w: 420, h: 24, seg: low ? 14 : 24, seed: 7, bow: 30, deep: '#182280', mid: '#2c44b8', high: '#5a7ee0', foam: '#ffc4c8' }), M.sea, { pos: [20, WATER - 0.2, SEA_Z - 46] });
  sea1.static = false; sea2.static = false; scene.root.add(sea2, sea1);

  // ---- the quay
  const near = group('near');
  const CHALK = [-4.7, 0, -2.5], CHALK_YAW = 22;
  near.add(node('chalk', chalkWall({ w: 3.4, h: 1.55, seed: 4, rows: low ? 2 : 3 }), M.prop, { pos: CHALK, rot: [0, CHALK_YAW, 0] }));
  // the Mint steps: three flights' worth is off stage; what shows is the foot, two columns and a brazier
  const STEPS = [5.4, 0, -2.6], SY = -64;
  near.add(node('mint-steps', steps({ w: 3.4, n: 6, rise: 0.22, run: 0.42, color: C8.marble, color2: C8.marble2 }), M.prop, { pos: [STEPS[0] + 1.9, 1.32, STEPS[2] - 0.9], rot: [0, SY + 180, 0] }));
  near.add(node('mint-landing', tint(place(box(5, 1.32, 4.4), 0, 0.66, 0), C8.marble2), M.prop, { pos: [STEPS[0] + 4.3, 0, STEPS[2] - 2.0], rot: [0, SY, 0] }));
  for (const dz of [-2.1, 1.3]) near.add(node('column', column8({ h: 4.6, r: 0.34 }), M.prop, { pos: [STEPS[0] + 2.6 + dz * 0.42, 1.32, STEPS[2] - 1.4 + dz * 0.9] }));
  const BRAZ = [3.75, 0, -2.2], bz = brazier({ h: 0.95, r: 0.3 });
  near.add(node('brazier', bz, M.prop, { pos: BRAZ }));
  const post = lampPost({ h: 3.0, arm: 0.6, color: C8.navy, lit: false }), POST = [-1.2, 0, QUAY_Z + 1.0];
  near.add(node('post', post, M.prop, { pos: POST }));
  const clutter = [[crate({ s: 0.6, seed: 1 }), [-6.6, 0, -1.2], 14], [barrel({}), [-7.2, 0, -0.4], 0], [sack({ seed: 2 }), [-3.2, 0, -3.3], 30], [bollard({ s: 1.2 }), [1.6, 0, QUAY_Z + 0.6], 0], [bollard({ s: 1.2 }), [-4.6, 0, QUAY_Z + 0.6], 0], [ropeCoil({}), [2.3, 0, QUAY_Z + 1.0], 0]];
  clutter.forEach(([m, p, yaw], i) => near.add(node('clutter' + i, m, M.prop, { pos: p, rot: [0, yaw, 0] })));
  scene.root.add(mergeStatic(near, 'near'));
  const fire = node('fire', flame({ r: 0.24, h: 0.62 }), M.lantern, { pos: anchorAt(bz, 'fire', BRAZ) }); fire.castShadow = false; scene.root.add(fire);

  // ---- the city on the quay, backs to us, watching the water
  const spots = [];
  for (let i = 0; i < 24; i++) { const sx = i % 2 ? 1 : -1, col = Math.floor(i / 2) % 5, row = Math.floor(i / 10); spots.push({ pos: [sx * (1.0 + col * 0.74 + r() * 0.3) + (sx < 0 ? -0.5 : 0.3), 0, -2.2 - row * 0.85 - r() * 0.4 - (col === 0 ? 0.9 : 0)], face: 180 + sx * (6 + r() * 22) }); }
  const folk = crowd({ spots: low ? spots.filter((_, i) => i % 2 === 0) : spots, material: M.prop, sprites, seed: 13, amount: 1, glow: '#ffc060', variants: 2 });
  scene.root.add(folk.node);

  // ---- the boats in the roads (commons ending): a line of skiffs inside the mole, a grey-violet flame in each pan
  const NB = low ? 6 : 9, sk = skiff({}), boats = node('boats', sk, M.prop), pans = node('pans', flame({ r: 0.16, h: 0.4, seg: 5, root: '#ffffff', tip: C8.kelpDeep }), M.lantern), rowers = node('rowers', townsfolk({ hold: 'none', detail: 0 }), M.prop);
  for (const n of [boats, pans, rowers]) { n.castShadow = false; n.instances = makeInstances(n === rowers ? NB * 2 : NB); n.instances.count = 0; scene.root.add(n); }
  const fleet = []; for (let i = 0; i < NB; i++) { const u = i / (NB - 1); fleet.push({ x: -13 + u * 27 + (r() - 0.5), z: -15 - Math.sin(u * 3.1) * 9 - r() * 2, yaw: 70 + r() * 40, ph: r() * 6.28, glow: sprites.add({ kind: 'glow', pos: [0, 0, 0], size: 1.5, color: C8.kelp, alpha: 0 }) }); }

  const fg = group('fg');
  fg.add(node('fg1', bollard({ s: 1.25 }), M.prop, { pos: [-1.8, 0, 2.9] }), node('fg2', ropeCoil({ r: 0.26 }), M.prop, { pos: [-1.1, 0, 2.6] }), node('fg3', crate({ s: 0.55, seed: 21 }), M.prop, { pos: [1.9, 0, 2.95], rot: [0, -16, 0] }));
  const foreground = mergeStatic(fg, 'foreground'); scene.root.add(foreground);
  const actors = group('actors'); scene.root.add(actors);

  const firePos = anchorAt(bz, 'fire', BRAZ);
  const lamps = [
    { name: 'brazier', pos: [firePos[0], firePos[1] + 0.3, firePos[2]], color: '#ffa850', radius: 7.2, base: 1.15, flicker: 0.14 },
    { name: 'crowd-left', pos: [-3.2, 1.4, -2.8], color: '#ffb060', radius: 4.2, base: 0.8 },
    { name: 'crowd-right', pos: [2.6, 1.4, -3.4], color: '#ffb060', radius: 4.0, base: 0.8 },
    { name: 'horizon', pos: [-1.5, 2.2, -7.5], color: '#ff9a70', radius: 7, base: 0.55, flicker: 0, fixed: true },
  ];
  const glows = [{ sprite: sprites.add({ kind: 'glow', pos: lamps[0].pos, size: 2.4, color: '#ffa040', alpha: 0 }), base: 0.6, lamp: 0 }];
  if (!low) A.windows.slice(0, 16).forEach((p) => glows.push({ sprite: sprites.add({ kind: 'glow', pos: p, size: 3.0, color: '#ffc060', alpha: 0 }), base: 0.42, fixed: true }));

  let sea = 0.85, seaNow = 0.85, lampGoal = 0, lampNow = 0, boatGoal = 0, boatNow = 0;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const setSea = (v) => { sea = clamp01(v); }, setLamp = (v) => { lampGoal = clamp01(v); }, setBoats = (v) => { boatGoal = clamp01(v); }, setCrowd = (v) => folk.setAmount(v);
  const quayTask = unit8([2.3, 1.0, 0.2], [2.0, 0.8], (v) => { setCrowd(0.2 + 0.8 * v); setSea(0.5 + 0.35 * v); });
  const task = (type) => { if (String(type) !== 'quay-lights') return null; setLamp(0); lampNow = 0; setBoats(0); boatNow = 0; setCrowd(0.2); sea = seaNow = 0.5; return quayTask.reset(); };
  function cue(id) { noteLean8(id); const c = CUES[id]; if (!c) return false; if (c.sea != null) setSea(c.sea); if (c.lamp != null) setLamp(c.lamp); if (c.boats != null) setBoats(c.boats); if (c.crowd != null) setCrowd(c.crowd); return true; }
  const P = [0, 0, 0], V = [0, 0, 0], rnd = rng(17);
  let nextMist = 0, nextRing = 0.5, nextGust = 1;
  function tick(time, dt, pw, live) {
    const e = (dt === 0 ? 1 : 0);
    seaNow += (sea - seaNow) * Math.min(1, dt * 0.35 + e); lampNow += (lampGoal - lampNow) * Math.min(1, dt * 1.5 + e); boatNow += (boatGoal - boatNow) * Math.min(1, dt * 0.8 + e);
    const breathe = 1 + 0.03 * Math.sin(time * 0.5);
    sea1.setScale(1, Math.max(0.02, seaNow * breathe), 1); sea2.setScale(1, Math.max(0.02, seaNow * seaNow * (2 - breathe)), 1);
    sea1.position[0] = Math.sin(time * 0.11) * 3; sea2.position[0] = 20 - Math.sin(time * 0.07) * 5;
    base.lamp.set(lampNow); base.lamp.update(time); base.clouds.update(time);
    folk.update(time, dt, { lit: pw, lively: 0.25 + 0.3 * seaNow });
    lamps[1].k = lamps[2].k = 0.3 + 0.7 * folk.amount;
    fire.setScale(0.9 + 0.12 * Math.sin(time * 11), 0.9 + 0.2 * Math.sin(time * 7.3) * Math.sin(time * 4.1), 1); fire.setRot(0, time * 50, 0);
    const n = Math.round(boatNow * NB); boats.instances.count = pans.instances.count = n; rowers.instances.count = n * 2; boats.visible = pans.visible = rowers.visible = n > 0;
    for (let i = 0; i < NB; i++) {
      const b = fleet[i], bob = Math.sin(time * 1.3 + b.ph) * 0.05, y = WATER + 0.02 + bob, c = Math.cos(b.yaw * DEG), s = Math.sin(b.yaw * DEG), g = b.glow, pz = sk.anchors.pan[2], py = sk.anchors.pan[1];
      if (i >= n) { g.alpha = 0; continue; }
      const sc = 1.5; putInst(boats.instances, i, b.x, y, b.z, Math.sin(time * 1.1 + b.ph) * 3, b.yaw, 0, sc, sc, sc, 1, 0.9, 0.8);
      g.pos[0] = b.x + s * pz * sc; g.pos[1] = y + py * sc + 0.2; g.pos[2] = b.z + c * pz * sc; g.alpha = 0.7 + 0.15 * Math.sin(time * 6 + b.ph);
      putInst(pans.instances, i, g.pos[0], y + py * sc, g.pos[2], 0, time * 60 + i * 40, 0, 1.4, 1.2 + 0.25 * Math.sin(time * 8 + b.ph), 1.4, 0.8, 0.72, 1);
      for (let k = 0; k < 2; k++) { const sz = sk.anchors.seats[k][2]; putInst(rowers.instances, i * 2 + k, b.x + s * sz * sc, y + 0.2, b.z + c * sz * sc, 0, b.yaw, 0, 0.95, 0.95, 0.95, k ? 0.85 : 1, 0.86, k ? 1 : 0.8); }
    }
    if (live) {
      if (seaNow > 0.2 && time > nextMist) { nextMist = time + 0.12; P[0] = -40 + rnd() * 80; P[1] = WATER + 15 * seaNow * (0.96 + rnd() * 0.08); P[2] = SEA_Z + 3; sprites.sparkle(P, { count: 1, size: 1.6, spread: 0.8, life: 1.1, color: '#fff4ee' }); }
      if (time > nextRing) { nextRing = time + 1.5; P[0] = -8 + rnd() * 16; P[1] = WATER + 0.03; P[2] = QUAY_Z - 1.4 - rnd() * 7; sprites.splash(P, { size: 1 + rnd() * 0.6, life: 1.4, spray: 0, color: '#ffc8c0' }); }
      if (time > nextGust) { nextGust = time + 1.9 + rnd(); P[0] = -4 + rnd() * 3; P[1] = 2.4 + rnd() * 2.6; P[2] = -6 + rnd() * 5; V[0] = 2.4; V[1] = 0.1; V[2] = 0.5; sprites.gust(P, { vel: V, size: 0.9 + rnd() * 0.5, life: 2.0, alpha: 0.8, color: '#ffd9e0' }); }
    }
  }

  return shell8({
    id: 'mole-dark', light, L, low, scene, cameras: CAMERAS, actors, foreground, lamps, glows, tick,
    motes: low ? null : { box: [3.4, 4.1, 1.0, 1.4, -2.5, -1.9], every: 0.25, color: '#ffb050', size: 0.08, vel: [0.15, 0.7, 0.05], life: 2.4, alpha: 0.9 },
    marks: { ...marks8(), focus: A.lamp, chalk: { pos: [CHALK[0] + 0.5, 0, CHALK[2] + 0.9], face: 200 }, steps: { pos: [STEPS[0] + 0.4, 0.66, STEPS[2] - 0.2], face: -40 } },
    extra: { setSea, setLamp, setBoats, setCrowd, cue, task },
  });
}

export const moleDark = { id: 'mole-dark', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default moleDark;
