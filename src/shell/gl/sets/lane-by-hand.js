// SET: lane-by-hand. Commons ending. Night at the harbour steps of Cresset with the Founders' Lamp dark: small boats
// strung across the roads from the steps to the bar and out past it, a pan of dim grey-violet flame in each,
// and under that chain of flames the water lying down, one hull wide, between two walls of standing sea.
// Chapter 8: ch8.s6.c09-c19 (the first pan is lit on the harbour steps; the stewards go down to the boats; the
// lane holds) and ch8.s6.c28 (the Chancellor gets down into a boat and rows).
//
//   import { laneByHand } from './sets/lane-by-hand.js';
//   const set = laneByHand.build(GL, { light: 'night', low: false });
//
// Same shape as sets/lantern-stalls.js. Figures face +Z, cameras look toward -Z (the sea), the strip x -3.2..3.2, z 0..1.6 is clear.
//   setChain(0..1)     how much of the chain is lit, from the steps outward (it eases, one boat at a time)
//   setBlue(0..1)      the blue points past the bar (the dark islands answering); the far west one keeps time
//   task(type)         any type naming the lane, the chain, a boat or a pan -> { pos, stand, set(v) } = setChain
//   cue(lineId)        ch8.s6.c09 first pan; c13 half the chain; c16 the blue points; c19 and c28 the whole chain
// marks: a, b, c, two, party, opposition, plus focus (the first pan), steps { pos, face } (top of the harbour steps), boat (the first boat)

import { rng, DEG } from '../math.js';
import { merge, tint, place, box, cylinder, sphere } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic, makeInstances } from '../scene.js';
import { createSprites } from '../sprites.js';
import { PAL, crate, barrel, sack, bollard, ropeCoil, steps, flame, crowd, townsfolk } from './kit.js';
import { C8, materials8, shell8, cams, marks8, pick8, norm8, dirFrom, harbourBase, seaWall, skiff, shipLantern, putInst } from './kit-ch8.js';

const QUAY_Z = -5.6, WATER = -0.5, BAR_Z = -52;

const LIGHTS = {
  night: {
    preset: 'night', power: 1.15,
    env: {
      key: { dir: dirFrom(-150, 42), color: '#8aa2f2' },
      shadow: { tint: '#3040ac', lift: 0.12, saturate: 1.3 },
      ambient: { sky: '#4a62d8', ground: '#3a2e9c', amount: 0.18 },
      rim: { color: '#c8b4ff', amount: 0.9, edge: 0.74 },
      fog: { color: '#4a6ee0', density: 0.0028, start: 22, max: 0.8 },
      sky: { zenith: '#0a1466', mid: '#1a36a8', midAt: 0.42, horizon: '#5682ea', below: '#2c50c0', sunDir: dirFrom(16, 24), moon: 0.55, stars: 1, sun: { size: 2.0 } },
      water: { deep: '#101f7c', mid: '#1c3ca8', shallow: '#6a58d8', foam: '#d8c8ff', glint: '#d0b8ff', glintDensity: 0.3 },
    },
    cloud: { color: '#7f92e6', shadowTint: '#34449e', count: 5 },
  },
};

const CAMERAS = cams({
  wide: { target: [0.1, 1.5, -0.4], dist: 8.2, yaw: 2, pitch: 6, fov: 44 },
  low: { target: [0.2, 1.8, 0.2], dist: 6.4, yaw: -6, pitch: -10, fov: 56 },
});
const CUES = { 'ch8.s6.c09': { chain: 0.07, blue: 0 }, 'ch8.s6.c11': { chain: 0.25 }, 'ch8.s6.c13': { chain: 0.55 }, 'ch8.s6.c16': { chain: 0.8, blue: 1 }, 'ch8.s6.c19': { chain: 1, blue: 1 }, 'ch8.s6.c28': { chain: 1, blue: 1 } };

function build(engine = null, { light: lightName, low = false } = {}) {
  const [light, L] = pick8('lane-by-hand', LIGHTS, lightName);
  const M = materials8(), r = rng(8303);
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env; env.sky.sunDir = norm8(env.sky.sunDir);
  const sprites = scene.sprites = createSprites(low ? 192 : 448);
  const base = harbourBase({ scene, M, low, seed: 8, quayZ: QUAY_Z, water: WATER, ground: '#cfc6ee', cobbles: ['#e2dcfa', '#c4bcec', '#d8d0f6', '#b8b0e4'], cloud: L.cloud, beam: 0,
    far: { tower: [6.4, -1.2, BAR_Z], moleZ: BAR_Z, moleDir: 1, moleLen: 80, town: [-22, -0.5, -40], lit: 0.9 } });
  const A = base.F.anchors;
  base.lamp.set(0);

  // ---- the standing sea either side of the lane, beyond the bar: two walls facing each other across one hull's width
  const LANE_X = -1.2, far = group('seas');
  const wallL = node('sea-l', seaWall({ w: 150, h: 11, seg: low ? 12 : 22, seed: 3, deep: '#16227e', mid: '#2c46b8', high: '#6a6ee6', foam: '#e6d8ff' }), M.sea, { pos: [LANE_X - 9, WATER - 0.2, BAR_Z - 82], rot: [0, 84, 0] });
  const wallR = node('sea-r', seaWall({ w: 150, h: 11, seg: low ? 12 : 22, seed: 9, deep: '#16227e', mid: '#2c46b8', high: '#6a6ee6', foam: '#e6d8ff' }), M.sea, { pos: [LANE_X + 9, WATER - 0.2, BAR_Z - 82], rot: [0, -84, 0] });
  const wallB = node('sea-b', seaWall({ w: 400, h: 15, seg: low ? 10 : 18, seed: 5, bow: -40, deep: '#121c70', mid: '#2238a4', high: '#4a58d0', foam: '#c8b8f4' }), M.sea, { pos: [LANE_X, WATER - 0.2, BAR_Z - 170] });
  scene.root.add(wallB, wallL, wallR);

  // ---- the harbour steps, a bollard each side, the first boat at their foot
  const STEP_X = 1.5, near = group('near');
  near.add(node('steps', steps({ w: 2.6, n: 6, rise: 0.25, run: 0.4, color: '#e6e0fa', color2: '#c8c0ee' }), M.prop, { pos: [STEP_X, 0, QUAY_Z + 0.05] }));
  for (const sx of [-1, 1]) near.add(node('newel', merge(tint(place(cylinder(0.2, 0.24, 0.8, 8), 0, 0, 0), '#e6e0fa'), tint(place(sphere(0.22, 8, 6), 0, 0.95, 0), C8.brass)), M.prop, { pos: [STEP_X + sx * 1.55, 0, QUAY_Z + 0.5] }));
  const clutter = [[crate({ s: 0.6, seed: 1 }), [-4.2, 0, -1.4], 14], [barrel({}), [-4.9, 0, -0.5], 0], [sack({ seed: 2 }), [4.4, 0, -1.2], 30], [bollard({ s: 1.2 }), [-2.6, 0, QUAY_Z + 0.6], 0], [ropeCoil({}), [-1.9, 0, QUAY_Z + 1.0], 0], [crate({ s: 0.5, seed: 5, color: PAL.wood2 }), [5.1, 0, -0.6], -20],
    [tint(place(box(0.5, 0.06, 0.34), 0, 0.03, 0), C8.parchment), [2.9, 0.0, -1.9], 20]]; // the writ a steward set down on the step
  clutter.forEach(([m, p, yaw], i) => near.add(node('clutter' + i, m, M.prop, { pos: p, rot: [0, yaw, 0] })));
  const HAND = [-4.2, 0.62 + 0.8, -1.4];
  near.add(node('hand', shipLantern({ s: 1.3 }), M.prop, { pos: HAND }));
  scene.root.add(mergeStatic(near, 'near'));

  // ---- people on the quay with their own small lights, watching the chain go out
  const spots = [];
  for (let i = 0; i < 18; i++) { const sx = i % 2 ? 1 : -1, col = Math.floor(i / 2) % 3, row = Math.floor(i / 6); spots.push({ pos: [sx * (3.3 + col * 0.8 + r() * 0.3) + (sx > 0 ? 0.6 : 0), 0, -2.4 - row * 0.9 - r() * 0.4], face: 180 + sx * (10 + r() * 20) }); }
  const folk = crowd({ spots: low ? spots.filter((_, i) => i % 2 === 0) : spots, material: M.prop, sprites, seed: 5, amount: 1, glow: '#ffc060', variants: 2 });
  scene.root.add(folk.node);

  // ---- the chain: boats from the steps to the bar and on between the walls
  const NB = low ? 12 : 20, sk = skiff({}), boats = node('boats', sk, M.prop), pans = node('pans', flame({ r: 0.17, h: 0.44, seg: 5, root: '#ffffff', tip: C8.kelpDeep }), M.lantern), rowers = node('rowers', townsfolk({ hold: 'none', detail: 0 }), M.prop);
  for (const n of [boats, pans, rowers]) { n.castShadow = false; n.instances = makeInstances(n === rowers ? NB * 2 : NB); n.instances.count = n === rowers ? NB * 2 : NB; scene.root.add(n); }
  const chain = [];
  for (let i = 0; i < NB; i++) {
    const u = i / (NB - 1), z = QUAY_Z - 3.2 - Math.pow(u, 1.55) * 150, x = STEP_X + (LANE_X - STEP_X) * Math.min(1, u * 2.4) + Math.sin(u * 7) * 0.9 * (1 - u), s = 1.5 + u * 3.2; // far boats are drawn larger, or they are a pixel
    chain.push({ x, z, s, yaw: 84 + (r() - 0.5) * 30, ph: r() * 6.28, lit: 0, glow: sprites.add({ kind: 'glow', pos: [x, 0.8, z], size: 1.6 + u * 5, color: C8.kelp, alpha: 0 }) });
  }
  const FIRST = [chain[0].x, WATER + 1.3, chain[0].z];
  env.water.shores.push([chain[0].x, chain[0].z, 1.1, 0.5]);
  // the blue points past the bar: four, low on the horizon inside the lane
  const blues = [-5.5, -1.5, 2.2, 6.5].map((dx, i) => sprites.add({ kind: 'glow', pos: [LANE_X + dx * 2.2, WATER + 2.4 + (i % 2) * 0.9, BAR_Z - 150], size: 6.5, color: '#6fb8ff', alpha: 0 }));

  const fg = group('fg');
  fg.add(node('fg1', bollard({ s: 1.25 }), M.prop, { pos: [-1.9, 0, 2.9] }), node('fg2', ropeCoil({ r: 0.26 }), M.prop, { pos: [-1.2, 0, 2.6] }), node('fg3', barrel({ r: 0.28, h: 0.7 }), M.prop, { pos: [2.0, 0, 2.95] }));
  const foreground = mergeStatic(fg, 'foreground'); scene.root.add(foreground);
  const actors = group('actors'); scene.root.add(actors);

  const lamps = [
    { name: 'first-pan', pos: FIRST, color: '#c8b0ff', radius: 7.5, base: 1.2, flicker: 0.16 },
    { name: 'hand', pos: [HAND[0], HAND[1] - 0.55, HAND[2]], color: '#ffc06a', radius: 5.4, base: 1.0, fixed: true },
    { name: 'crowd-left', pos: [-3.9, 1.4, -3.0], color: '#ffb060', radius: 4.2, base: 0.8 },
    { name: 'crowd-right', pos: [4.3, 1.4, -3.0], color: '#ffb060', radius: 4.2, base: 0.8 },
    { name: 'chain', pos: [0.2, 1.6, -11.5], color: '#b9a0ff', radius: 7, base: 0.9, flicker: 0.1 },
  ];
  const glows = [{ sprite: sprites.add({ kind: 'glow', pos: lamps[1].pos, size: 1.7, color: '#ffb450', alpha: 0 }), base: 0.6, fixed: true }];
  if (!low) A.windows.slice(0, 12).forEach((p) => glows.push({ sprite: sprites.add({ kind: 'glow', pos: p, size: 3.0, color: '#ffc060', alpha: 0 }), base: 0.4, fixed: true }));

  let chainGoal = 1, chainNow = 1, blueGoal = 1, blueNow = 1;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const setChain = (v) => { chainGoal = clamp01(v); }, setBlue = (v) => { blueGoal = clamp01(v); };
  const laneTask = { pos: FIRST, stand: [STEP_X - 0.6, QUAY_Z + 1.3], set: setChain };
  const task = (type) => (/lane|chain|boat|pan|flame/.test(String(type)) ? laneTask : null);
  function cue(id) { const c = CUES[id]; if (!c) return false; if (c.chain != null) setChain(c.chain); if (c.blue != null) setBlue(c.blue); return true; }
  const P = [0, 0, 0], rnd = rng(23);
  let nextSmoke = 0, nextRing = 0.5, nextSpark = 0;
  function tick(time, dt, pw, live) {
    const e = dt === 0 ? 1 : 0;
    chainNow += Math.max(-dt * 0.5, Math.min(dt * 0.22, chainGoal - chainNow)) + e * (chainGoal - chainNow); blueNow += (blueGoal - blueNow) * Math.min(1, dt * 0.8 + e);
    base.lamp.update(time); base.clouds.update(time); folk.update(time, dt, { lit: pw, lively: 0.3 });
    const lit = chainNow * NB, on = Math.min(1.2, 0.4 + 0.6 * pw);
    for (let i = 0; i < NB; i++) {
      const b = chain[i], want = Math.max(0, Math.min(1, lit - i)); b.lit += (want - b.lit) * Math.min(1, dt * 4 + e);
      const bob = Math.sin(time * 1.3 + b.ph) * 0.05 * (i < 6 ? 1 : 0.4), y = WATER + 0.02 + bob, c = Math.cos(b.yaw * DEG), s = Math.sin(b.yaw * DEG), sc = b.s, pz = sk.anchors.pan[2] * sc, py = sk.anchors.pan[1] * sc, here = i === 0 ? 1 : b.lit;
      putInst(boats.instances, i, b.x, y - (1 - here) * 3, b.z, Math.sin(time * 1.1 + b.ph) * 3, b.yaw, 0, sc, sc, sc, 1, 0.92, 0.82);
      const fx = b.x + s * pz, fz = b.z + c * pz, fl = b.lit * (0.85 + 0.25 * Math.sin(time * 8 + b.ph) * Math.sin(time * 5.1 + b.ph));
      putInst(pans.instances, i, fx, y + py - (b.lit < 0.02 ? 9 : 0), fz, 0, time * 60 + i * 40, 0, 1.5 * sc * 0.66, Math.max(0.01, fl * 1.5 * sc * 0.66), 1.5 * sc * 0.66, 0.86, 0.76, 1);
      for (let k = 0; k < 2; k++) { const sz = sk.anchors.seats[k][2] * sc; putInst(rowers.instances, i * 2 + k, b.x + s * sz, y + 0.14 * sc - (1 - here) * 3, b.z + c * sz, 0, b.yaw + (k ? 180 : 0), Math.sin(time * 2 + b.ph + k) * 6, 0.62 * sc, 0.62 * sc, 0.62 * sc, k ? 0.85 : 1, 0.88, k ? 1 : 0.82); }
      const g = b.glow; g.pos[0] = fx; g.pos[1] = y + py + 0.2 * sc; g.pos[2] = fz; g.alpha = 0.75 * fl * on;
    }
    lamps[0].k = chain[0].lit; lamps[4].k = Math.min(1, chainNow * 3);
    for (let i = 0; i < blues.length; i++) blues[i].alpha = blueNow * (i === 0 ? 0.25 + 0.75 * (Math.sin(time * 3.1) > 0 ? 1 : 0) : 0.75 + 0.1 * Math.sin(time * 2 + i)); // the far west one keeps time
    if (live) {
      if (chain[0].lit > 0.5 && time > nextSmoke) { nextSmoke = time + 0.5; const b = chain[Math.floor(rnd() * Math.min(4, NB))]; if (b.lit > 0.5) { P[0] = b.glow.pos[0]; P[1] = b.glow.pos[1] + 0.3; P[2] = b.glow.pos[2]; sprites.puff(P, { count: 1, size: 0.3 * b.s * 0.6, rise: 0.7, spread: 0.1, life: 2.4, color: '#b8a8e8' }); } }
      if (time > nextRing) { nextRing = time + 1.3; P[0] = -8 + rnd() * 16; P[1] = WATER + 0.03; P[2] = QUAY_Z - 1.4 - rnd() * 9; sprites.splash(P, { size: 1 + rnd() * 0.6, life: 1.4, spray: 0, color: '#d8c8ff' }); }
      if (time > nextSpark) { nextSpark = time + 0.2; const b = chain[Math.floor(rnd() * NB)]; if (b.lit > 0.5) sprites.sparkle(b.glow.pos, { count: 1, size: 0.2 * b.s, spread: 0.4 * b.s, life: 0.9, color: '#efe4ff' }); }
    }
  }

  return shell8({
    id: 'lane-by-hand', light, L, low, scene, cameras: CAMERAS, actors, foreground, lamps, glows, tick,
    marks: { ...marks8(), focus: FIRST, steps: { pos: [STEP_X, 0, QUAY_Z + 1.1], face: 180 }, boat: [chain[0].x, WATER + 0.3, chain[0].z] },
    extra: { setChain, setBlue, task, cue, boatCount: NB },
  });
}

export const laneByHand = { id: 'lane-by-hand', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default laneByHand;
