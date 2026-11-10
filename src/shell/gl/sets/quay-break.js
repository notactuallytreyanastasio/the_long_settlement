// SET: quay-break. Mint ending. The quay at Cresset in flight, at night, with the Founders' Lamp out and the sea
// standing up beyond the mole: an overloaded ferry casting off, its deck and its roof packed, a crowd pressing
// at the gangway, carts on their sides, dropped trunks and bundles, bank notes blowing; and over the foot of the
// gangway one ship's lantern swinging on its crook, which is all the light there is.
// Chapter 8: ch8.m6.c04-c13 (third minute; the boy of nine holding a place for his mother at the foot of the gangway)
// and ch8.m6.c25-c29 (after: the Lamp burns white again over an empty quay, the ferry back, the carts where they fell).
//
//   import { quayBreak } from './sets/quay-break.js';
//   const set = quayBreak.build(GL, { light: 'flight' | 'after', low: false });
//
// Same shape as sets/lantern-stalls.js. Figures face +Z, cameras look toward -Z (the sea), the strip x -3.2..3.2, z 0..1.6 is clear.
//   setPanic(0..1)    how hard the crowd shoves and how far the lantern swings;  setCrowd(0..1) how many are on the quay and the ferry
//   setLamp(0..1)     the Founders' Lamp;  setSea(0..1) the standing sea
//   cue(lineId)       ch8.m6.c04 the flight; ch8.m6.c25 and later: the lamp relit, the quay empty, the sea down
// marks: a, b, c, two, party, opposition, plus focus (the swinging lantern), gangway { pos, face } (its foot: where the boy stands), cart

import { rng, DEG } from '../math.js';
import { merge, tint, place, box, sphere, tube, curve, cylinder } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic, makeInstances } from '../scene.js';
import { createSprites } from '../sprites.js';
import { rayMesh, rayMaterial } from '../fx.js';
import { PAL, COATS, anchorAt, crate, barrel, sack, bollard, ropeCoil, ferry, gangway, crowd, townsfolk } from './kit.js';
import { C8, materials8, shell8, cams, marks8, pick8, norm8, dirFrom, harbourBase, seaWall, cart, shipLantern, putInst } from './kit-ch8.js';

const QUAY_Z = -5.6, WATER = -0.5;

const LIGHTS = {
  flight: {
    preset: 'night', power: 1.2, lamp: 0, sea: 1, crowd: 1, panic: 1,
    env: {
      key: { dir: dirFrom(-30, 34), color: '#7c92ec' },
      shadow: { tint: '#2c3aa6', lift: 0.12, saturate: 1.3 },
      ambient: { sky: '#4a5cd6', ground: '#3a2a98', amount: 0.17 },
      rim: { color: '#ffc890', amount: 0.9, edge: 0.74 },
      fog: { color: '#4a5ed8', density: 0.003, start: 20, max: 0.82 },
      sky: { zenith: '#0a1060', mid: '#22309c', midAt: 0.4, horizon: '#5a66dc', below: '#2c3cb0', sunDir: dirFrom(-24, 30), moon: 0.4, stars: 0.7, sun: { size: 2.0 } },
      water: { deep: '#0e1a74', mid: '#1c34a0', shallow: '#4a58cc', foam: '#c8d0ff', glint: '#ffc890', glintDensity: 0.22 },
    },
    cloud: { color: '#6a78d8', shadowTint: '#2c3890', count: 7 },
  },
  after: {
    preset: 'night', power: 1.0, lamp: 1, sea: 0, crowd: 0, panic: 0,
    env: {
      key: { dir: norm8([-0.3, 0.5, -1]), color: '#c6d8ff' },
      shadow: { tint: '#3448b4', lift: 0.12, saturate: 1.3 },
      ambient: { sky: '#4a6ce0', ground: '#2e3c9c', amount: 0.17 },
      rim: { color: '#f4f8ff', amount: 1.0, edge: 0.72 },
      fog: { color: '#4f82e6', density: 0.003, start: 20, max: 0.84 },
      sky: { zenith: '#0a1568', mid: '#1b3cae', midAt: 0.42, horizon: '#5a8cee', below: '#3058c4', sunDir: dirFrom(18, 22), moon: 0.6, stars: 1, sun: { size: 2.0 } },
      water: { deep: '#122a88', mid: '#2048b4', shallow: '#3c80dc', glint: '#eaf2ff', glintDensity: 0.26 },
    },
    cloud: { color: '#8fa6ea', shadowTint: '#3a50aa', count: 6 },
  },
};

const CAMERAS = cams({
  wide: { target: [0.1, 1.7, -0.4], dist: 8.2, yaw: 3, pitch: 4, fov: 46 },
  low: { target: [0.1, 1.9, 0.2], dist: 6.4, yaw: -6, pitch: -12, fov: 56 },
});

function build(engine = null, { light: lightName, low = false } = {}) {
  const [light, L] = pick8('quay-break', LIGHTS, lightName);
  const M = materials8(), r = rng(8404);
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env; env.sky.sunDir = norm8(env.sky.sunDir);
  const sprites = scene.sprites = createSprites(low ? 192 : 448);
  const base = harbourBase({ scene, M, low, seed: 11, quayZ: QUAY_Z, water: WATER, ground: '#aaa2e2', cobbles: ['#c0b8f0', '#9c94de', '#b4acea', '#928ad6'], cloud: L.cloud, beam: 0.26,
    far: { tower: [-3.6, -1.2, -52], moleDir: 1, moleLen: 120, town: [-24, -0.5, -38], lit: 0.9, towerGlow: L.lamp ? 0.5 : 0 } });
  const A = base.F.anchors;
  const sea1 = node('sea1', seaWall({ w: 300, h: 16, seg: low ? 18 : 32, seed: 4, bow: 14, deep: '#16227e', mid: '#2a4ac4', high: '#5a8ee8', foam: '#e6e0ff' }), M.sea, { pos: [0, WATER - 0.2, A.moleZ - 16] });
  scene.root.add(sea1);

  // ---- the ferry, alongside and casting off; the gangway still down
  const FERRY = [4.9, WATER, QUAY_Z - 2.55], FERRY_YAW = -90, fm = ferry({ len: 11, seed: 3, keel: C8.oxblood, roof: C8.copper });
  const ferryNode = node('ferry', fm, M.prop, { pos: FERRY, rot: [0, FERRY_YAW, 0] }); ferryNode.castShadow = false; scene.root.add(ferryNode);
  const fA = (name) => anchorAt(fm, name, FERRY, FERRY_YAW), gate = fA('gate');
  env.water.shores.push([FERRY[0] + 2.6, FERRY[2], 2.2, 0.6], [FERRY[0] - 2.6, FERRY[2], 2.2, 0.6]);
  // everyone aboard: the foredeck, the afterdeck and the deckhouse roof, as instances that ride with the hull
  const NP = low ? 12 : 20, aboard = node('aboard', townsfolk({ hold: 'none', detail: 0 }), M.prop); aboard.castShadow = false; aboard.instances = makeInstances(NP); aboard.instances.count = NP; scene.root.add(aboard);
  const riders = []; for (let i = 0; i < NP; i++) { const k = i % 3, lz = k === 0 ? 2.0 + r() * 2.6 : k === 1 ? -3.4 - r() * 1.3 : -2.4 + r() * 2.4, lx = (r() - 0.5) * (k === 2 ? 1.6 : 2.3), ly = k === 2 ? 2.78 : 0.76; riders.push({ lx, ly, lz, ph: r() * 6.28, s: 0.8 + r() * 0.2, col: COATS[i % COATS.length], yaw: r() * 360 }); }

  // ---- the quay: the lantern on its crook over the gangway foot, carts on their sides, what was dropped
  const near = group('near'), GX = gate[0];
  near.add(node('gangway', gangway({ len: QUAY_Z + 0.35 - gate[2], w: 0.9, rise: gate[1] }), M.prop, { pos: [GX, 0, QUAY_Z + 0.35] }));
  const CROOK = [GX - 1.25, 0, QUAY_Z + 0.95], HOOK = [GX - 0.35, 3.25, QUAY_Z + 1.0];
  near.add(node('crook', merge(tint(tube(curve([[0, 0.05, 0], [0.05, 1.8, 0], [-0.04, 3.1, 0], [0.2, 3.5, 0.02], [0.7, 3.5, 0.04], [0.9, 3.3, 0.05]], 14), (t) => 0.085 - 0.04 * t, 6, { crease: 180 }), C8.navy), tint(cylinder(0.2, 0.16, 0.3, 8), C8.stoneBlue)), M.prop, { pos: CROOK }));
  const CART1 = [-3.5, 0.5, -1.9], CART2 = [3.9, 0.48, -1.5];
  near.add(node('cart1', cart({ seed: 2, load: false }), M.prop, { pos: CART1, rot: [8, 30, 86] }), node('cart2', cart({ seed: 5, load: false, wheel: C8.teal }), M.prop, { pos: CART2, rot: [-6, -140, -82] }));
  const dropped = [[crate({ s: 0.5, seed: 1 }), [-2.6, 0, -2.6], 34], [sack({ seed: 2 }), [-4.4, 0, -0.7], 30], [sack({ seed: 6, s: 0.3 }), [-2.2, 0, -1.5], 80], [crate({ s: 0.42, seed: 3, color: PAL.wood2 }), [3.0, 0, -2.7], -20], [barrel({ r: 0.26, h: 0.62 }), [5.0, 0.26, -0.7], 0],
    [crate({ s: 0.46, seed: 8, color: C8.oxblood }), [1.5, 0, -3.3], 12], [bollard({ s: 1.2 }), [-0.6, 0, QUAY_Z + 0.6], 0], [bollard({ s: 1.2 }), [-5.2, 0, QUAY_Z + 0.6], 0], [ropeCoil({}), [-4.5, 0, QUAY_Z + 1.0], 0]];
  dropped.forEach(([m, p, yaw], i) => (low && i % 3 === 2) || near.add(node('dropped' + i, m, M.prop, { pos: p, rot: [i === 4 ? 90 : 0, yaw, 0] })));
  // notes blowing about, a lost hat, a child's shoe
  for (let i = 0; i < (low ? 8 : 18); i++) near.add(node('note', tint(place(box(0.22, 0.012, 0.13), 0, 0.012, 0), i % 3 ? C8.parchment : '#dfe8ff'), M.flat, { pos: [-4 + r() * 8, 0, -4.4 + r() * 4.2], rot: [0, r() * 360, 0] }));
  near.add(node('hat', merge(tint(place(cylinder(0.2, 0.2, 0.03, 10), 0, 0, 0), C8.navy), tint(place(cylinder(0.12, 0.11, 0.14, 10), 0, 0.03, 0), C8.navy), tint(place(cylinder(0.125, 0.125, 0.04, 10), 0, 0.03, 0), C8.oxblood)), M.prop, { pos: [0.9, 0, -2.3], rot: [0, 0, 6] }));
  // PIER FOUR: a board on a post, and the place under it where the boy sleeps afterwards
  near.add(node('pier4', merge(tint(place(cylinder(0.06, 0.07, 2.2, 6), 0, 0, 0), C8.woodDark), tint(place(box(1.1, 0.5, 0.07), 0, 2.1, 0.02, 0, 0, -3), C8.parchment), ...[0, 1, 2, 3].map((i) => tint(place(box(0.05, 0.3, 0.03), -0.2 + i * 0.13, 2.1, 0.06, 0, 0, -3), C8.navy))), M.prop, { pos: [-1.9, 0, -3.5], rot: [0, 12, 0] }));
  scene.root.add(mergeStatic(near, 'near'));
  const lantern = node('lantern', shipLantern({ s: 1.9 }), M.lantern, { pos: HOOK }); lantern.castShadow = false; scene.root.add(lantern);
  const LEN = 0.42 * 1.9, FOCUS = [HOOK[0], HOOK[1] - LEN, HOOK[2]];
  const cone = node('cone', tint(rayMesh(2.9, 0.12, 2.0, 14), '#ffb050'), rayMaterial({ power: 1.5, near: 0.42, far: 0 }), { pos: HOOK }); scene.root.add(cone);

  // ---- the crowd on the quay, pressing toward the gangway
  const spots = [];
  for (let i = 0; i < 28; i++) { const a = r() * 6.28, d = 0.8 + Math.sqrt(i) * 0.62 + r() * 0.3, x = GX + 0.4 + Math.cos(a) * d * 1.25, z = QUAY_Z + 1.9 + Math.abs(Math.sin(a)) * d * 0.62; if (z > -0.5 && Math.abs(x) < 3.6) continue; spots.push({ pos: [x, 0, z], face: Math.atan2(GX - x, (QUAY_Z + 0.4) - z) / DEG }); }
  const folk = crowd({ spots: low ? spots.filter((_, i) => i % 2 === 0) : spots, material: M.prop, sprites, seed: 21, amount: L.crowd, hold: 'none', variants: 2 });
  folk.pace = 14; scene.root.add(folk.node);

  const fg = group('fg');
  fg.add(node('fg1', crate({ s: 0.55, seed: 21 }), M.prop, { pos: [-1.9, 0.2, 2.95], rot: [24, 20, 0] }), node('fg2', sack({ seed: 4, s: 0.32 }), M.prop, { pos: [1.8, 0, 3.0], rot: [0, -30, 0] }), node('fg3', tint(place(box(0.5, 0.3, 0.34), 0, 0.15, 0), C8.oxbloodDark), M.prop, { pos: [2.5, 0, 2.6], rot: [0, 24, 0] }));
  const foreground = mergeStatic(fg, 'foreground'); scene.root.add(foreground);
  const actors = group('actors'); scene.root.add(actors);

  const lamps = [
    { name: 'lantern', pos: [FOCUS[0], FOCUS[1], FOCUS[2]], color: '#ffb458', radius: 9, base: 1.3, flicker: 0.1, fixed: true },
    { name: 'ferry-ports', pos: [FERRY[0] + 0.6, 1.6, QUAY_Z - 0.6], color: '#ffc470', radius: 5, base: 0.9, fixed: true },
    { name: 'founders', pos: [-3.4, 5.2, -6.5], color: '#f2f8ff', radius: 13, base: 1.1, flicker: 0.02, fixed: true },
  ];
  const lanternGlow = sprites.add({ kind: 'glow', pos: lamps[0].pos, size: 2.6, color: '#ffa040', alpha: 0 });
  const glows = fA('windows').slice(3).map((p) => ({ sprite: sprites.add({ kind: 'glow', pos: p, size: 0.9, color: '#ffc060', alpha: 0 }), base: 0.6, fixed: true }));
  if (!low) A.windows.slice(0, 12).forEach((p) => glows.push({ sprite: sprites.add({ kind: 'glow', pos: p, size: 3.0, color: '#ffc060', alpha: 0 }), base: 0.4, fixed: true }));

  let panic = L.panic, panicNow = L.panic, lampGoal = L.lamp, lampNow = L.lamp, sea = L.sea, seaNow = L.sea, away = 0;
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const setPanic = (v) => { panic = clamp01(v); }, setCrowd = (v) => folk.setAmount(v), setLamp = (v) => { lampGoal = clamp01(v); }, setSea = (v) => { sea = clamp01(v); };
  function cue(id) {
    const m = /^ch8\.m6\.c(\d+)/.exec(id); if (!m) return false; const n = Number(m[1]);
    if (n >= 25) { setPanic(0); setCrowd(0); setLamp(1); setSea(0); } else if (n >= 4 && n <= 13) { setPanic(1); setCrowd(1); setLamp(0); setSea(1); } else return false;
    return true;
  }
  const P = [0, 0, 0], V = [0, 0, 0], rnd = rng(41);
  let nextNote = 0, nextRing = 0.4, nextGust = 0.6;
  function tick(time, dt, pw, live) {
    const e = dt === 0 ? 1 : 0;
    panicNow += (panic - panicNow) * Math.min(1, dt * 1.2 + e); lampNow += (lampGoal - lampNow) * Math.min(1, dt * 1.2 + e); seaNow += (sea - seaNow) * Math.min(1, dt * 0.4 + e);
    base.lamp.set(lampNow); base.lamp.update(time); base.clouds.update(time); lamps[2].k = lampNow;
    sea1.visible = seaNow > 0.02; sea1.setScale(1, Math.max(0.02, seaNow * (1 + 0.03 * Math.sin(time * 0.5))), 1);
    // the lantern swings; its light, glow and cone go with it
    const sw = (10 + 24 * panicNow) * Math.sin(time * (1.4 + 0.5 * panicNow)), sx = Math.sin(time * 0.9 + 1) * 6 * panicNow;
    lantern.setRot(sx, 0, sw); cone.setRot(sx, 0, sw);
    const lp = lamps[0].pos; lp[0] = HOOK[0] + Math.sin(sw * DEG) * LEN; lp[1] = HOOK[1] - Math.cos(sw * DEG) * LEN; lp[2] = HOOK[2] - Math.sin(sx * DEG) * LEN;
    lanternGlow.alpha = 0.7 * (0.92 + 0.08 * Math.sin(time * 9));
    // the ferry strains at its last line: it rolls, and everyone aboard rolls with it
    const roll = Math.sin(time * 1.1) * (1.5 + 3 * panicNow), pitch = Math.sin(time * 0.8 + 1) * 1.2, heave = Math.sin(time * 1.3) * 0.06, drift = 0.5 * panicNow * (0.5 + 0.5 * Math.sin(time * 0.35));
    ferryNode.setPos(FERRY[0], FERRY[1] + heave, FERRY[2] - drift); ferryNode.setRot(roll, FERRY_YAW, pitch);
    const n = Math.round(folk.amount * NP); aboard.instances.count = n; aboard.visible = n > 0;
    for (let i = 0; i < n; i++) { const p = riders[i], hop = Math.abs(Math.sin(time * 3 + p.ph)) * 0.06 * panicNow; putInst(aboard.instances, i, FERRY[0] - p.lz, FERRY[1] + heave + p.ly + hop + p.lx * Math.sin(roll * DEG), FERRY[2] - drift + p.lx, roll, p.yaw + Math.sin(time + p.ph) * 20, 0, p.s, p.s, p.s, 1, 0.92, 0.86); }
    folk.update(time, dt, { lit: 0, lively: 0.2 + 0.8 * panicNow });
    if (live) {
      if (panicNow > 0.3 && time > nextNote) { nextNote = time + 0.35; P[0] = -4 + rnd() * 8; P[1] = 0.2 + rnd() * 1.6; P[2] = -4 + rnd() * 4; V[0] = 1.6 + rnd(); V[1] = 0.5 + rnd() * 0.6; V[2] = 0.3; sprites.spawn({ kind: 'dot', pos: P, vel: V, size: 0.12, life: 2.2, color: '#fff3d6', gravity: 0.6 }); }
      if (time > nextRing) { nextRing = time + 0.9; P[0] = -8 + rnd() * 9; P[1] = WATER + 0.03; P[2] = QUAY_Z - 1.4 - rnd() * 7; sprites.splash(P, { size: 1 + rnd() * 0.8, life: 1.3, spray: panicNow > 0.5 ? 3 : 0, color: '#d0d8ff' }); }
      if (panicNow > 0.3 && time > nextGust) { nextGust = time + 1.5 + rnd(); P[0] = -4 + rnd() * 3; P[1] = 2.4 + rnd() * 2.6; P[2] = -6 + rnd() * 5; V[0] = 2.8; V[1] = 0.1; V[2] = 0.5; sprites.gust(P, { vel: V, size: 0.9 + rnd() * 0.5, life: 1.8, alpha: 0.8, color: '#c6d0ff' }); }
    }
  }

  return shell8({
    id: 'quay-break', light, L, low, scene, cameras: CAMERAS, actors, foreground, lamps, glows, tick,
    marks: { ...marks8(), focus: FOCUS, gangway: { pos: [GX - 0.2, 0, QUAY_Z + 1.2], face: 0 }, cart: { pos: [CART1[0] + 0.9, 0, CART1[2] + 0.5], face: 40 }, pier4: { pos: [-1.6, 0, -3.0], face: 20 } },
    extra: { setPanic, setCrowd, setLamp, setSea, cue },
  });
}

export const quayBreak = { id: 'quay-break', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default quayBreak;
