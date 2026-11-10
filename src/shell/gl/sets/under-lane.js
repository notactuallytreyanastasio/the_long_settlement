// SET: under-lane. The Compact's secret run out to the dark islands: a broad rowing boat on black water at night,
// oars muffled, one lantern on its staff with the hood drawn down. Ahead in line, the other boats, one hooded light
// each; the Maund rocks; a long way north an Audit cutter working one bearing out and back with the one search lamp
// it is allowed. Astern, the dark islands.
// Chapter 4: s4 (Tobb confesses; they cross the cutter's line on his count) and the epilogue (Little Brand opens its
// lamp right up, then Tessaly, Orm town, and one far point in the west that keeps time). Chapter 5 prologue; chapter 8
// Mint epilogue.
//
//   import { underLane } from './sets/under-lane.js';
//   const set = underLane.build(GL, { light: 'night', low: false });     // 'night' (default) | 'dawn'
//
// The shape is lantern-stalls' (see ../index.js). The cast stands IN the boat: its sole is y = 0, x -3.4..3.2,
// z -0.75..1.85 (the stage strip is its near half; the thwarts and rowers are the far half). The boat, the rowers and
// set.actors ride the swell together (a couple of centimetres). Added here:
//   setHood(0..1)         1 = drawn right down (a slit of light), 0 = open
//   setCutter(0..1.5)     the Audit cutter's search lamp: 0 not there, 1 working its line, 1.5 sweeping close
//   setLamps(n)           islands with their lamps open: 1 Little Brand, 2 Tessaly, 3 Orm town, 4 the far one in the west
//   setStroke(0..1)       how hard they are rowing (0 = oars shipped)
//   cue(lineId)           ch4.s4.c01 / c05 / c09 / c23 / c24 / c26, ch4.epi.01 / 09 / 12 / 16, ch5.pro.02, ch8.mepi.13
//   marks.focus           the lantern;  marks.oar: a place on a thwart (seated, far side);  marks.stern, marks.bow
//   setPower(p)           the lantern and what it lights
// low: true drops the far boats' hulls (their lights stay), half the rocks, two rowers, and paints the clouds.

import * as GL0 from '../index.js';
import {
  m4, quat, rng, DEG, rgb, merge, tint, place, box, cylinder, sphere, tube, curve, setGlow, setOutline, roundedBox, deform,
  node, group, makeEnv, createScene, mergeStatic, createSprites, rayMesh, rayMaterial, makeInstances,
} from '../index.js';
import { PAL, kitMaterials, anchorAt, pickLight, barrel, sack, crate, ropeCoil, cloudBank, boat, crowd } from './kit.js';
import { C4, crag, hoodedLantern, longboat, oar, cutter, blanketRoll, c4Shell, cams, MARKS4, norm3, dirFrom } from './kit-ch4.js';

const WATER = -0.2, BOAT_Z = 0.55;

const LIGHTS = {
  night: {
    preset: 'night', power: 1,
    env: {
      key: { dir: norm3([-0.5, 0.56, 0.66]), color: '#8ea2f6' },
      shadow: { tint: '#232c9c', lift: 0.14, saturate: 1.3 },
      ambient: { sky: '#4666dc', ground: '#2a348e', amount: 0.2 },
      rim: { color: '#bcd8ff', amount: 0.85, edge: 0.72 },
      fog: { color: '#16289a', density: 0.0036, start: 18, max: 0.86 },
      sky: { zenith: '#070f5c', mid: '#14309c', midAt: 0.42, horizon: '#3f74e2', below: '#2248b8', sunDir: dirFrom(-6.5, 11.5), moon: 0.72, stars: 1, sun: { size: 2.1 } },
      water: { deep: '#0c1c70', mid: '#183ca8', shallow: '#2f78d8', foam: '#cfe2ff', glint: '#cfe6ff', glintDensity: 0.22, drift: [0.2, 0.3] },
    },
    cloud: { color: '#6f88e6', shadowTint: '#28389c' }, mist: '#b8ccff',
  },
  dawn: {
    preset: 'sunset', power: 0.7,
    env: {
      key: { dir: dirFrom(-34, 14), color: '#ffd0c0' },
      shadow: { tint: '#5a56d0', lift: 0.14, saturate: 1.35 },
      ambient: { sky: '#f0a8d0', ground: '#5a58c8', amount: 0.2 },
      rim: { color: '#ffe0a8', amount: 1.1, edge: 0.7 },
      fog: { color: '#e8a0c8', density: 0.003, start: 20, max: 0.84 },
      sky: { zenith: '#3a4ac8', mid: '#c88ad8', midAt: 0.36, horizon: '#ffd890', below: '#ffb49a', glow: '#fff0a8', glowAmount: 0.7, sunDir: dirFrom(-7, 2.6), sun: { color: '#fffbe6', size: 3.0, halo: '#ffc060', haloAmount: 0.7 } },
      water: { deep: '#3f4cc0', mid: '#7f7ae0', shallow: '#ffc0b4', foam: '#fff6ee', glint: '#fff0b0', glintDensity: 0.3, drift: [0.2, 0.3] },
    },
    cloud: { color: '#ffc4d4', shadowTint: '#9a78d8' }, mist: '#ffe6ee',
  },
};

const CAMERAS = cams({
  wide: { target: [0.1, 1.45, -0.2], dist: 8.4, yaw: 3, pitch: 8 },
  stage: { target: [0, 1.0, 0.5], dist: 9.6, yaw: -13, pitch: 8 },
});

function build(engine = GL0, { light, low = false } = {}) {
  const picked = pickLight('under-lane', LIGHTS, light), L = picked.L; light = picked.name;
  const M = kitMaterials(), r = rng(4404), night = light === 'night';

  // ---- our boat, and everything that rides in it
  const raft = group('raft', { pos: [0, 0, 0] }), fixed = group('boat-fixed');
  const hull = longboat({ len: 8.8, beam: 3.3, side: 0.32, seats: low ? 3 : 4, staff: 0, hull: '#fff1d0', keel: PAL.teal, band: PAL.coral, trim: '#c8743e', seed: 3 });
  const B = [0, 0, BOAT_Z];
  fixed.add(node('hull', hull, M.prop, { pos: B }));
  // the lantern staff, stepped against the far gunwale: crooked, with an iron crook to hang the light from
  const STAFF = [1.15, 0, BOAT_Z - 1.42], HOOK = [STAFF[0] - 0.42, 2.72, STAFF[2] + 0.05];
  fixed.add(node('staff', merge(tint(tube(curve([[STAFF[0], 0.0, STAFF[2]], [STAFF[0] + 0.06, 1.4, STAFF[2]], [STAFF[0] - 0.02, 2.75, STAFF[2]]], 8), (t) => 0.07 - 0.025 * t, 6, { crease: 180 }), '#8a5a4a'), tint(tube(curve([[STAFF[0] - 0.02, 2.7, STAFF[2]], [STAFF[0] - 0.2, 2.86, STAFF[2] + 0.03], HOOK], 6), 0.026, 5, { crease: 180 }), PAL.iron), tint(place(sphere(0.07, 7, 5), STAFF[0] - 0.02, 2.79, STAFF[2]), PAL.gold)), M.prop));
  // what the run carries: medicine chests and salt sacks aft, the record in oilcloth, a boat-hook, a water cask
  fixed.add(node('chest1', crate({ s: 0.52, seed: 3, color: PAL.teal, trim: '#1c8c9a' }), M.prop, { pos: [-3.35, 0, BOAT_Z - 0.5], rot: [0, 12, 0] }), node('chest2', crate({ s: 0.44, seed: 5, color: PAL.wood2 }), M.prop, { pos: [-3.3, 0.53, BOAT_Z - 0.48], rot: [0, -10, 0] }), node('sack1', sack({ seed: 2, s: 0.3, color: '#e6ecff' }), M.prop, { pos: [-3.5, 0, BOAT_Z + 0.35] }), node('sack2', sack({ seed: 6, s: 0.26, color: '#e6ecff' }), M.prop, { pos: [-3.0, 0, BOAT_Z + 0.9], rot: [0, 40, 0] }));
  fixed.add(node('cask', barrel({ r: 0.24, h: 0.56, color: '#c8643e' }), M.prop, { pos: [3.3, 0, BOAT_Z - 0.2] }), node('coil', ropeCoil({ r: 0.24 }), M.prop, { pos: [3.25, 0, BOAT_Z + 0.75] }), node('oilcloth', merge(tint(place(roundedBox(0.5, 0.2, 0.36, 0.08, 2), 0, 0.1, 0), '#3a4aa0'), tint(place(box(0.52, 0.03, 0.05), 0, 0.2, 0), PAL.rope), tint(place(box(0.05, 0.03, 0.38), 0, 0.2, 0), PAL.rope)), M.prop, { pos: [0.1, 0, BOAT_Z - 0.75], rot: [0, 14, 0] }));
  fixed.add(node('rolls', blanketRoll({ color: PAL.coral }), M.prop, { pos: [-2.2, 0, BOAT_Z - 0.85], rot: [0, 80, 0] }));
  // a stubby mast against the far gunwale with the sail furled dark on its yard, and two stays: something overhead
  const MAST = [-1.5, 0, BOAT_Z - 1.4], MH = 4.3;
  fixed.add(node('mast', merge(
    tint(tube(curve([[MAST[0], 0, MAST[2]], [MAST[0] - 0.05, MH * 0.5, MAST[2]], [MAST[0] + 0.04, MH, MAST[2]]], 8), (t) => 0.085 - 0.035 * t, 6, { crease: 180 }), '#8a5a4a'),
    tint(place(cylinder(0.04, 0.035, 3.2, 5), MAST[0] - 1.5, MH * 0.74 - 0.3, MAST[2] + 0.06, 0, 0, -79), '#8a5a4a'),
    tint(tube(curve([[MAST[0] - 1.4, MH * 0.74 - 0.36, MAST[2] + 0.1], [MAST[0] - 0.6, MH * 0.74 - 0.3, MAST[2] + 0.14], [MAST[0] + 0.5, MH * 0.74 + 0.02, MAST[2] + 0.12], [MAST[0] + 1.5, MH * 0.74 + 0.2, MAST[2] + 0.1]], 10), (t) => 0.07 + 0.07 * Math.sin(t * Math.PI), 7, { crease: 180 }), '#4a58c0'),
    tint(tube([[MAST[0] + 0.04, MH - 0.05, MAST[2]], [4.3, 0.9, BOAT_Z]], 0.014, 4, { crease: 180 }), PAL.rope), tint(tube([[MAST[0] + 0.04, MH - 0.05, MAST[2]], [-4.3, 0.7, BOAT_Z]], 0.014, 4, { crease: 180 }), PAL.rope),
    tint(place(GL0.extrude([[0, 0], [0.5, 0.1], [0, 0.22]], 0.02), MAST[0] + 0.06, MH - 0.3, MAST[2], 0, -20, 0), PAL.coral), tint(place(sphere(0.06, 7, 5), MAST[0] + 0.04, MH + 0.03, MAST[2]), PAL.gold)), M.prop));
  const boatNode = mergeStatic(fixed, 'boat'); raft.add(boatNode);

  // ---- the lane: the other boats ahead in line, the Maund rocks, the cutter, the islands
  const sea = group('sea'), far = group('far');
  const others = [[-3.2, -9.5, 74], [1.2, -17, 82], [5.5, -27, 70]];
  if (!low) for (const [x, z, yaw] of others) sea.add(node('other', boat({ len: 3.6, hull: '#d8cce8', keel: PAL.teal, mast: false, seed: x + 9 }), M.prop, { pos: [x, WATER + 0.02, z], rot: [0, yaw, 0] }));
  const rocks = [[7.5, -14, 3.2, 3.8, 3], [10.2, -17.5, 4.4, 6.2, 5], [6.2, -20, 2.4, 2.2, 8], [13.5, -13, 3, 3.0, 11], [-11, -24, 3.2, 3.4, 14], [-13.5, -27, 2.4, 5.0, 17], [16, -24, 4, 4.4, 20], [-8, -38, 3, 2.4, 23]].slice(0, low ? 4 : 8);
  for (const [x, z, w, h, seed] of rocks) sea.add(node('maund', crag({ w, h, d: w * 0.8, seed, low: night ? '#2a2c98' : '#5a4cc0', high: night ? '#5a66d8' : '#b89af0', cap: night ? '#7fa0f0' : '#ffd8c8', capAt: 0.8, lean: (seed % 3 - 1) * 0.12 }), M.prop, { pos: [x, WATER - 0.1, z] }));
  sea.traverse((n) => { n.castShadow = false; });
  const CUT0 = [26, WATER, -150], cutMesh = cutter({ len: 15, hull: night ? '#1c2a8a' : '#5a5ac8', sail: night ? '#3a4cb8' : '#a89ae8' });
  const ISLES = [ // Little Brand astern, then the ones that answer
    { name: 'brand', pos: [-21, WATER, -150], w: 34, h: 9, big: 1 }, { name: 'tessaly', pos: [13, WATER, -300], w: 44, h: 8 }, { name: 'orm', pos: [34, WATER, -250], w: 30, h: 11 }, { name: 'carrow', pos: [-4.5, WATER, -620], w: 30, h: 4 },
  ];
  for (const s of ISLES) { far.add(node('isle', crag({ w: s.w, h: s.h, d: 14, seed: s.w, low: night ? '#16227e' : '#6a66d8', high: night ? '#263ca8' : '#a8a8f0', seg: 9, rings: 5 }), M.farFlat, { pos: s.pos })); s.lamp = [s.pos[0] - s.w * 0.1, WATER + s.h * 0.82 + 1, s.pos[2] + 8]; }

  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  env.sky.sunDir = norm3(env.sky.sunDir); env.water.level = WATER;
  env.water.shores = [[0, BOAT_Z, 1.75, 0.3], [2.6, BOAT_Z, 1.3, 0.28], [-2.6, BOAT_Z, 1.3, 0.28], ...rocks.map(([x, z, w]) => [x, z, w * 0.62, 0.7]), ...others.map(([x, z]) => [x, z, 1.5, 0.5])];
  scene.root.add(raft, mergeStatic(sea, 'sea'), mergeStatic(far, 'far'));
  const cutNode = node('cutter', cutMesh, M.farFlat, { pos: CUT0, rot: [0, 160, 0] }); cutNode.castShadow = false; scene.root.add(cutNode);

  const sprites = scene.sprites = createSprites(384);
  // ---- rowers on the thwarts, their sweeps out over the far side
  const seats = hull.anchors.seats, locks = hull.anchors.locks;
  const folk = crowd({ spots: seats.map((s, i) => ({ pos: [B[0] + s[0], 0.02, B[2] + s[2] - 0.05], face: -84, s: 0.82 })), material: M.prop, sprites: null, hold: 'none', detail: 1, variants: 2, seed: 9, amount: 1 });
  raft.add(folk.node);
  const oars = node('oars', oar({ len: 2.7 }), M.prop); oars.castShadow = false; oars.instances = makeInstances(locks.length + 1); oars.instances.count = locks.length + 1; raft.add(oars);
  // the lantern: it swings on its hook
  const lanternMesh = hoodedLantern({ s: 1.5, hood: 0.72 });
  const lantern = node('lantern', lanternMesh, M.lantern, { pos: HOOK }); lantern.castShadow = false; lantern.tint.set([1, 0.78, 0.36, 1]); raft.add(lantern);
  const LAMP = [HOOK[0], HOOK[1] + lanternMesh.anchors.lamp[1], HOOK[2]];
  const actors = group('actors'); raft.add(actors);
  const foreground = group('foreground'); scene.root.add(foreground);

  const lampGlow = sprites.add({ kind: 'glow', pos: LAMP, size: 1.7, color: '#ffa848', alpha: 0 });
  const cone = node('lamp-cone', tint(rayMesh(2.5, 0.12, 1.5, 14), '#ffb050'), rayMaterial({ power: 1.5, near: 0.4, far: 0 }), { pos: [LAMP[0], LAMP[1] - 0.1, LAMP[2]] }); raft.add(cone);
  const otherGlows = others.map(([x, z]) => ({ g: sprites.add({ kind: 'glow', pos: [x, WATER + 1.5, z], size: 1.3, color: '#ffa848', alpha: 0 }), s: sprites.add({ kind: 'glow', pos: [x, WATER + 0.12, z + 1.6], size: [0.5, 1.6], color: '#ff9a40', alpha: 0 }), ph: r() * 6 }));
  for (const s of ISLES) { s.glow = sprites.add({ kind: 'glow', pos: s.lamp, size: s.big ? 13 : s.name === 'carrow' ? 9 : 11, color: '#3fb8ff', alpha: 0 }); s.core = sprites.add({ kind: 'glow', pos: s.lamp, size: s.big ? 2.6 : 2, color: '#bff2ff', alpha: 0 }); s.streak = sprites.add({ kind: 'glow', pos: [s.lamp[0], WATER + 0.2, s.lamp[2] + (s.big ? 40 : 60)], size: s.big ? [7, 2.2] : [5, 1.4], color: '#6fccff', alpha: 0 }); s.on = 0; }
  const brandBeam = node('brand-beam', tint(place(rayMesh(120, 1.2, 16, 12), 0, 0, 0, 78, 0, 0), '#8fe4ff'), rayMaterial({ power: 0.8, near: 0.5, far: 0 }), { pos: ISLES[0].lamp }); brandBeam.visible = false; scene.root.add(brandBeam);
  const cutLamp = anchorAt(cutMesh, 'lamp', CUT0, 160), cutGlow = sprites.add({ kind: 'glow', pos: cutLamp, size: 9, color: '#fff6d8', alpha: 0 });
  const search = node('search', tint(place(rayMesh(150, 0.6, 8, 12), 0, 0, 0, 0, 0, 86), '#fff2c8'), rayMaterial({ power: 1.1, near: 0.5, far: 0 }), { pos: cutLamp }); search.visible = false; scene.root.add(search);
  const clouds = cloudBank({ style: low ? 'painted' : 'solid', count: 8, seed: 12, arc: [150, 210], radius: [280, 440], height: [30, 190], size: [0.7, 1.4], speed: 0.04, ...L.cloud });
  scene.root.add(clouds.node);

  const lamps = [
    { name: 'lantern', pos: [LAMP[0], LAMP[1] - 0.25, LAMP[2] + 0.2], color: '#ffb058', radius: 7, base: 3.4, k: 1 },
    { name: 'search', pos: [0, 2.4, -3], color: '#fff2d0', radius: 9, base: 0, own: true, steady: true },
  ];

  let hood = 1, hoodNow = 1, cut = 0, cutNow = 0, lampsOn = 0, stroke = 0.7, strokeNow = 0.7, phase = 0, lastT = -1, nextMist = 0, nextWake = 0, lastCatch = -1;
  const P = [0, 0, 0], V = [0, 0, 0], S3 = [1, 1, 1], Q = quat.create(), Mx = m4.create(), rnd = rng(31);
  const setHood = (v) => { hood = Math.max(0, Math.min(1, v)); }, setCutter = (v) => { cut = Math.max(0, Math.min(1.5, v)); }, setLamps = (n) => { lampsOn = Math.max(0, Math.min(ISLES.length, n | 0)); }, setStroke = (v) => { stroke = Math.max(0, Math.min(1, v)); };
  const CUES = {
    'ch4.s4.c01': () => { setHood(1); setCutter(0); setLamps(0); setStroke(0.7); }, 'ch4.s4.c05': () => setCutter(1), 'ch4.s4.c09': () => setStroke(0.15), 'ch4.s4.c23': () => setStroke(0.7), 'ch4.s4.c24': () => setCutter(1.3), 'ch4.s4.c26': () => { setCutter(1.5); setStroke(1); },
    'ch4.epi.01': () => { setHood(1); setCutter(0); setLamps(0); setStroke(0.6); }, 'ch4.epi.09': () => setLamps(1), 'ch4.epi.12': () => setLamps(4), 'ch4.epi.16': () => setStroke(0.8),
    'ch5.pro.02': () => { setHood(1); setCutter(0); setLamps(0); setStroke(0.6); }, 'ch8.mepi.13': () => { setHood(1); setCutter(0); setLamps(0); setStroke(0.6); },
  };
  const cue = (id) => { const f = CUES[id]; if (f) f(); return !!f; };

  const FOLK = { lit: 0, lively: 0 };
  function update(time, dt, pw) {
    const ease = Math.min(1, dt * 1.6 + (dt === 0 ? 1 : 0));
    hoodNow += (hood - hoodNow) * ease; cutNow += (cut - cutNow) * Math.min(1, dt * 0.7 + (dt === 0 ? 1 : 0)); strokeNow += (stroke - strokeNow) * ease;
    // the boat rides the swell, and takes a little way on each stroke
    phase += dt * (1.6 + 1.6 * strokeNow);
    const pull = Math.sin(phase), surge = Math.max(0, pull) * strokeNow;
    raft.position[1] = Math.sin(time * 0.9) * 0.022; raft.position[0] = surge * 0.03;
    raft.setRot(Math.sin(time * 0.7 + 1) * 0.5, 0, Math.sin(time * 0.9 + 0.4) * 0.7 - surge * 0.25);
    // the sweeps: catch, pull, feather back. Shipped oars lie along the boat
    const d = oars.instances.data;
    for (let i = 0; i <= locks.length; i++) {
      const tiller = i === locks.length, lk = tiller ? null : locks[i], sw = Math.cos(phase - i * 0.12) * 26 * strokeNow, dip = (Math.sin(phase - i * 0.12) > 0 ? 13 : 4) * (0.3 + 0.7 * strokeNow) + 6;
      if (tiller) { P[0] = B[0] - 4.25; P[1] = 0.86; P[2] = B[2] + 0.1; quat.fromEuler(Q, -20 * DEG, (90 + Math.sin(time * 0.6) * 8) * DEG, 0); }
      else { P[0] = B[0] + lk[0]; P[1] = lk[1] + 0.04; P[2] = B[2] + lk[2]; quat.fromEuler(Q, -(strokeNow < 0.05 ? -2 : dip) * DEG, (strokeNow < 0.05 ? 80 : sw) * DEG, 0); }
      m4.fromTRS(Mx, P, Q, S3); d.set(Mx, i * 20);
    }
    oars.instances.dirty = true;
    FOLK.lively = 0.25 + 0.6 * strokeNow; folk.update(time, dt, FOLK);
    // the lantern
    const sway = Math.sin(time * 1.3) * 7 + Math.sin(time * 0.53 + 1) * 4, fl = 0.92 + 0.08 * Math.sin(time * 10.1) * Math.sin(time * 6.3), open = 1 - 0.4 * hoodNow, on = Math.min(1.4, pw);
    lantern.setRot(Math.sin(time * 1.1 + 2) * 4, 0, sway);
    lamps[0].k = open * fl; lampGlow.alpha = 0.7 * open * on * fl; lampGlow.size[0] = lampGlow.size[1] = 1.2 + 1.2 * open * on;
    cone.material.beam.near = (0.4 + 0.3 * (1 - hoodNow)) * on * fl; cone.setRot(0, 0, sway * 0.5); cone.visible = pw > 0.05;
    lantern.tint[0] = 0.55 + 0.45 * Math.min(1, on); lantern.tint[1] = 0.5 + 0.28 * Math.min(1, on); lantern.tint[2] = 0.5 - 0.14 * Math.min(1, on);
    for (let i = 0; i < otherGlows.length; i++) { const o = otherGlows[i], k = 0.5 + 0.12 * Math.sin(time * 2 + o.ph); o.g.alpha = k; o.s.alpha = k * 0.5; o.g.pos[1] = WATER + 1.5 + Math.sin(time * 0.9 + o.ph) * 0.06; }
    // the cutter works its bearing out and back; its lamp comes round
    const leg = Math.sin(time * 0.11), cx = CUT0[0] - 16 + leg * 22 - cutNow * 6, cz = CUT0[2] + cutNow * 46, vis = Math.min(1, cutNow);
    cutNode.visible = vis > 0.02; cutNode.position[0] = cx; cutNode.position[2] = cz; cutNode.position[1] = WATER - (1 - vis) * 4; cutNode.setRot(0, Math.cos(time * 0.11) > 0 ? 174 : 6, Math.sin(time * 0.8) * 2);
    const lx = cx + (cutLamp[0] - CUT0[0]) * (Math.cos(time * 0.11) > 0 ? 1 : -1), swing = Math.sin(time * (0.5 + 0.3 * cutNow)) * (38 + 18 * cutNow) + (cutNow > 1.2 ? -8 : 20);
    cutGlow.pos[0] = lx; cutGlow.pos[1] = cutLamp[1]; cutGlow.pos[2] = cz; cutGlow.alpha = 0.9 * vis; cutGlow.size[0] = cutGlow.size[1] = 3.5 + 2 * cutNow;
    search.visible = vis > 0.05; search.position[0] = lx; search.position[1] = cutLamp[1]; search.position[2] = cz; search.setRot(0, swing - 90, -4); search.material.beam.near = 0.5 * vis;
    const facing = Math.max(0, 1 - Math.abs(swing) / 16) * Math.max(0, cutNow - 0.9) * 1.6; lamps[1].base = facing * 1.6; // when the lamp comes across them
    // the islands' lamps
    for (let i = 0; i < ISLES.length; i++) {
      const s = ISLES[i], want = i < lampsOn ? 1 : 0; s.on += (want - s.on) * Math.min(1, dt * (0.9 - i * 0.12) + (dt === 0 ? 1 : 0));
      const tw = s.name === 'carrow' ? ((time * 0.5) % 1 < 0.55 ? 1 : 0.1) : 0.92 + 0.08 * Math.sin(time * 5 + i * 2);
      s.glow.alpha = 0.9 * s.on * tw; s.core.alpha = s.on * tw; s.streak.alpha = 0.55 * s.on * tw;
    }
    brandBeam.visible = ISLES[0].on > 0.05; brandBeam.material.beam.near = 0.42 * ISLES[0].on; brandBeam.setRot(0, Math.sin(time * 0.2) * 5 + 8, 0);
    clouds.update(time);
    if (lastT >= 0 && time - lastT < 0.5 && dt > 0) {
      const c = Math.floor(phase / 6.2832);
      if (c !== lastCatch && strokeNow > 0.1) { lastCatch = c; for (let i = 0; i < locks.length; i++) { P[0] = B[0] + locks[i][0] + 0.4; P[1] = WATER + 0.03; P[2] = B[2] + locks[i][2] - 2.5; sprites.splash(P, { size: 0.9, life: 1.3, spray: 1, color: night ? '#a8c8ff' : '#fff6ee' }); } }
      if (time > nextWake) { nextWake = time + 0.5; P[0] = B[0] - 4.6; P[1] = WATER + 0.03; P[2] = B[2] + (rnd() - 0.5) * 1.6; V[0] = -1.1; V[1] = 0; V[2] = (P[2] - B[2]) * 0.25; sprites.spawn({ kind: 'ring', pos: P, vel: V, size: 0.5, endSize: 2.2, life: 4.5, color: night ? '#9ab8ff' : '#fff6ee' }); if (night) sprites.sparkle(P, { count: 1, size: 0.16, spread: 1.2, life: 1.2, color: '#9ff0ff' }); }
      if (time > nextMist) { nextMist = time + 2.2 + rnd() * 1.6; P[0] = -7 + rnd() * 6; P[1] = WATER + 0.5 + rnd() * 1.6; P[2] = -4 - rnd() * 8; V[0] = 1.3; V[1] = 0.02; V[2] = 0.15; sprites.gust(P, { vel: V, size: 1.1 + rnd() * 0.7, life: 2.8, alpha: 0.55, color: L.mist }); }
      sprites.update(dt);
    }
    lastT = time;
  }

  return c4Shell({
    id: 'under-lane', light, low, scene, actors, foreground, cameras: CAMERAS, lamps, lampPower: L.power, update,
    marks: { ...MARKS4, focus: LAMP, oar: { pos: [B[0] + seats[1][0] + 0.9, 0, B[2] - 0.55], face: 90 }, stern: { pos: [-2.9, 0, 1.0], face: 80 }, bow: { pos: [2.9, 0, 0.9], face: -90 } },
    extra: { setHood, setCutter, setLamps, setStroke, cue },
  });
}

export const underLane = { id: 'under-lane', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default underLane;
