// SET: ferry-dawn. The after deck of the lane ferry on the first lane of the morning: planks, a white rail,
// the brass lane lamp on its post, luggage, and astern across flat pink water Vessery going small with its
// lanterns going out one by one.
// Chapter 1 epilogue (ch1.epi.01-10): Ren, Ilse, and one paper lantern with Carrow painted on it.
//
//   import { ferryDawn } from './sets/ferry-dawn.js';
//   const set = ferryDawn.build(GL, { light: 'dawn', low: false });   // 'dawn' is the only light
//
// The shape is lantern-stalls' (see ../index.js). Figures face +Z (forward, toward the camera); cameras look
// toward -Z, astern. The deck strip x -4.4..4.4, z -0.2..1.6 is clear; the rail runs along z = -2.6.
// Added here:
//   setAfloat(0..1)       the Carrow lantern: 0 not yet on the water, then it drifts out to the west as the value
//                         rises (set it to 1 and it eases there by itself over about forty seconds)
//   cue(lineId)           ch1.epi.01 resets (lantern in hand, the town's lights on), ch1.epi.07 sets it afloat
//   marks.rail            a spot at the rail, port side, where the lantern is let down;  marks.focus: the lane lamp
// The town's lanterns go out one by one over the first fifty seconds after build or cue('ch1.epi.01').
// low: true drops the far town's windows and half its lights, the lifeboat's davits, the high clouds, two gulls.

import * as GL0 from '../index.js';
import {
  m4, quat, rng, DEG, rgb,
  merge, tint, place, plane, box, tube, curve, cylinder, sphere, lathe, extrude, setGlow, roundedBox, torus,
  node, group, makeEnv, createScene, mergeStatic, makeInstances, createSprites,
} from '../index.js';
import {
  PAL, kitMaterials, anchorAt, pickLight, setRig, lanternString, lanternLines, bunting,
  crate, barrel, sack, bollard, ropeCoil, boat, lighthouse, headland, cloudBank, gull, rock,
  planks, railing, lifeRing, townBank, floatLight,
} from './kit.js';

const WATER = -1.25, RAIL_Z = -2.6;
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
const dirFrom = (azDeg, elDeg) => [Math.sin(azDeg * DEG) * Math.cos(elDeg * DEG), Math.sin(elDeg * DEG), -Math.cos(azDeg * DEG) * Math.cos(elDeg * DEG)];

const LIGHTS = {
  dawn: {
    preset: 'sunset', power: 0.55,
    env: {
      key: { dir: dirFrom(-14, 21), color: '#fff0d2' },   // the sun is just up over the headland, left of the lighthouse
      shadow: { tint: '#a79cf0', lift: 0.12, saturate: 1.3 },
      ambient: { sky: '#ffc8d8', ground: '#a8a0f0', amount: 0.2 },
      rim: { color: '#ffe6a8', amount: 1.1, edge: 0.72 },
      fog: { color: '#ffd9c8', density: 0.0032, start: 20, max: 0.86 },
      sky: { zenith: '#6f9af0', mid: '#f7b0cc', midAt: 0.36, horizon: '#ffe6a6', below: '#ffcfae', glow: '#fff2b8', glowAmount: 0.75, sunDir: dirFrom(-7.4, 4.6), sun: { color: '#ffffff', size: 3.4, halo: '#ffc870', haloAmount: 0.75 } },
      water: { deep: '#5f8fe0', mid: '#8fb8f0', shallow: '#ffd2c2', foam: '#fffaf0', glint: '#fff0b8', glintDensity: 0.34, drift: [0.1, 0.5] },
    },
    cloud: { color: '#ffd2dc', shadowTint: '#b79cf0' },
  },
};

const CAMERAS = {
  wide: { target: [0.05, 1.6, -0.4], dist: 8.2, yaw: 2, pitch: 5, fov: 44, aspect: 0.46, shadowCenter: [0, 0, -0.8], shadowRadius: 8 },
  two: { target: [0, 1.12, 0.6], dist: 6.0, yaw: -15, pitch: 5, fov: 31, aspect: 0.46, shadowCenter: [0, 0, 0.3], shadowRadius: 3.6 },
  close: { target: [0.02, 0.86, 0.8], dist: 3.9, yaw: 21, pitch: 3, fov: 28, aspect: 0.46, shadowCenter: [0, 0, 0.5], shadowRadius: 2.6 },
  low: { target: [0.1, 1.8, 0.2], dist: 6.2, yaw: -7, pitch: -11, fov: 56, aspect: 0.46, shadowCenter: [0, 0, -1], shadowRadius: 8 },
  stage: { target: [0, 1.02, 0.5], dist: 9.4, yaw: -13, pitch: 7, fov: 24, aspect: 1.95, shadowCenter: [0, 0, -0.5], shadowRadius: 7.5, outline: 0.7 },
  landscape: { target: [0, 1.8, -1.2], dist: 10.5, yaw: 3, pitch: 5, fov: 40, aspect: 1.6, shadowCenter: [0, 0, -1.5], shadowRadius: 10.5 },
};

const MARKS = {
  a: { pos: [-0.8, 0, 0.55], face: 14 }, b: { pos: [0.02, 0, 0.8], face: 0 }, c: { pos: [0.82, 0, 0.55], face: -14 },
  two: [{ pos: [-0.42, 0, 0.62], face: 24 }, { pos: [0.42, 0, 0.62], face: -24 }],
  party: [{ pos: [-1.05, 0, 0.75], face: 78 }, { pos: [-1.85, 0, 1.15], face: 72 }, { pos: [-2.5, 0, 0.5], face: 80 }],
  opposition: [{ pos: [1.05, 0, 0.75], face: -78 }, { pos: [1.85, 0, 1.15], face: -72 }, { pos: [2.55, 0, 0.5], face: -80 }],
  rail: { pos: [-1.5, 0, RAIL_Z + 0.55], face: 180 },
};

function build(engine = GL0, { light, low = false } = {}) {
  const picked = pickLight('ferry-dawn', LIGHTS, light), L = picked.L; light = picked.name;
  const M = kitMaterials(), r = rng(2727), FAR = low ? M.farFlat : M.far;
  const HALF = 5.6;                                   // half the deck's beam
  const LAMP_POST = [-3.3, 0, RAIL_Z + 0.25], STAFF = [0.4, 0, RAIL_Z - 0.05];

  const near = group('near'), mid = group('mid'), ground = group('ground');
  // ---- the deck: boards fore and aft, a waterway plank round the edge, the hull's flank below it
  ground.add(node('deck', planks({ w: HALF * 2, d: 9.4, plank: 0.36, thick: 0.1, seed: 3, along: 'z', colors: ['#e9c08a', '#f2cf9c', '#dfb47c'] }), M.ground, { pos: [0, 0, RAIL_Z + 4.7 - 0.2] }));
  ground.add(node('waterway', tint(place(box(HALF * 2 + 0.3, 0.14, 0.36), 0, -0.03, RAIL_Z - 0.05), PAL.cream), M.ground));
  ground.add(node('hull', tint(place(box(HALF * 2 + 0.36, 1.5, 0.3), 0, -0.85, RAIL_Z - 0.2), '#fff6e0'), M.ground), node('hull-band', tint(place(box(HALF * 2 + 0.4, 0.22, 0.34), 0, -0.36, RAIL_Z - 0.2), PAL.coral), M.ground));
  ground.traverse((n) => { n.castShadow = false; });

  // ---- the taffrail, a life ring on it, the ensign staff
  near.add(node('rail', railing({ len: HALF * 2, h: 0.66, bay: 0.86, color: PAL.cream, post: '#fff6e0', cap: PAL.wood2 }), M.prop, { pos: [0, 0, RAIL_Z] }));
  near.add(node('ring', lifeRing({ r: 0.24 }), M.prop, { pos: [2.2, 0.4, RAIL_Z + 0.1] }));
  near.add(node('staff', merge(tint(place(cylinder(0.045, 0.03, 2.5, 6), 0, 0, 0, -7, 0, 0), PAL.woodDark), tint(place(sphere(0.06, 8, 6), 0, 2.5, -0.3), PAL.gold)), M.prop, { pos: STAFF }));
  const staffTop = [STAFF[0], 2.42, STAFF[2] - 0.3];

  // ---- the lane lamp: brass, on a post at the port quarter; it is what keeps the water flat behind them
  const lampMesh = merge(
    tint(lathe([[0, 0], [0.2, 0], [0.2, 0.07], [0.09, 0.14], [0.07, 1.3], [0.12, 1.36], [0, 1.36]], 10, { crease: 50 }), PAL.gold),
    tint(place(lathe([[0, 0], [0.22, 0], [0.26, 0.06], [0.12, 0.12], [0, 0.12]], 10, { crease: 50 }), 0, 1.36, 0), PAL.gold),
    setGlow(tint(place(sphere(0.2, 12, 9), 0, 1.66, 0), '#fff4c4'), 1),
    tint(place(torus(0.21, 0.016, 12, 4), 0, 1.66, 0), PAL.gold), tint(place(torus(0.21, 0.016, 12, 4), 0, 1.66, 0, 90, 0, 0), PAL.gold),
    tint(place(lathe([[0.27, 0], [0.2, 0.1], [0.05, 0.2], [0, 0.3]], 10, { crease: 50 }), 0, 1.84, 0), PAL.gold));
  near.add(node('lane-lamp', lampMesh, M.prop, { pos: LAMP_POST }));
  const LAMP = [LAMP_POST[0], 1.66, LAMP_POST[2]];

  // ---- what people bring aboard, and what a deck keeps: all outside the walkable strip
  const trunk = (w, h, d, col, band) => merge(tint(place(roundedBox(w, h, d, 0.05, 2), 0, h / 2, 0), col), tint(place(box(w + 0.02, 0.05, d + 0.02), 0, h * 0.62, 0), band), tint(place(box(0.08, h + 0.01, d + 0.03), -w * 0.28, h / 2, 0), band), tint(place(box(0.08, h + 0.01, d + 0.03), w * 0.28, h / 2, 0), band), tint(place(box(0.14, 0.09, 0.03), 0, h * 0.62, d / 2 + 0.02), PAL.gold));
  near.add(node('trunk1', trunk(0.95, 0.56, 0.6, PAL.teal, PAL.woodDark), M.prop, { pos: [3.6, 0, -1.55], rot: [0, -14, 0] }), node('trunk2', trunk(0.7, 0.4, 0.46, PAL.coral, PAL.woodDark), M.prop, { pos: [3.55, 0.56, -1.6], rot: [0, 10, 0] }), node('hatbox', merge(tint(place(cylinder(0.24, 0.24, 0.28, 12), 0, 0, 0), PAL.pink), tint(place(cylinder(0.255, 0.255, 0.07, 12), 0, 0.24, 0), PAL.cream)), M.prop, { pos: [4.45, 0, -1.3] }));
  near.add(node('capstan', merge(tint(lathe([[0, 0], [0.34, 0], [0.34, 0.08], [0.2, 0.16], [0.17, 0.5], [0.27, 0.6], [0.27, 0.72], [0, 0.74]], 12, { crease: 50 }), PAL.woodDark), tint(place(torus(0.2, 0.03, 12, 5), 0, 0.3, 0), PAL.gold)), M.prop, { pos: [-4.7, 0, -1.35] }), node('coil', ropeCoil({ r: 0.3 }), M.prop, { pos: [-3.9, 0, -1.75] }), node('cleat', bollard({ s: 0.8, color: PAL.woodDark }), M.prop, { pos: [1.5, 0, RAIL_Z + 0.42] }));
  if (!low) near.add(node('barrel', barrel({ r: 0.26, h: 0.62 }), M.prop, { pos: [-5.1, 0, -0.4] }), node('sack', sack({ seed: 3, s: 0.3 }), M.prop, { pos: [4.9, 0, -0.5], rot: [0, 40, 0] }));
  // a lifeboat slung outboard on the starboard quarter, seen over the rail in the band and the wide shots
  mid.add(node('lifeboat', boat({ len: 3.0, hull: PAL.cream, keel: PAL.teal, mast: false, seed: 4 }), M.prop, { pos: [HALF + 0.9, 0.5, 0.4], rot: [0, 4, 0] }));
  if (!low) for (const z of [-0.7, 1.5]) mid.add(node('davit', tint(tube(curve([[HALF - 0.1, 0, z], [HALF - 0.1, 1.9, z], [HALF + 0.35, 2.3, z], [HALF + 0.9, 2.05, z]], 10), 0.05, 6, { crease: 180 }), PAL.iron), M.prop), node('fall', tint(place(cylinder(0.014, 0.014, 1.2, 4, { caps: false }), HALF + 0.9, 0.85, z), PAL.rope), M.prop));
  // the deckhouse's after wall, port side, with its door and a porthole still lit
  mid.add(node('house', merge(tint(place(roundedBox(1.6, 2.5, 5, 0.1, 2), 0, 1.25, 0), '#fff6e0'), tint(place(roundedBox(1.9, 0.16, 5.4, 0.06, 1), 0, 2.56, 0), PAL.coral), tint(place(cylinder(0.24, 0.24, 0.06, 12), 0.8, 1.55, -1.3, 0, 0, -90), PAL.navy), setGlow(tint(place(cylinder(0.17, 0.17, 0.07, 12), 0.8, 1.55, -1.3, 0, 0, -90), PAL.glass), 0.8), tint(place(box(0.06, 1.7, 0.8), 0.8, 0.9, 0.6), PAL.teal)), M.prop, { pos: [-HALF - 0.7, 0, 1.2] }));
  mid.traverse((n) => { n.castShadow = false; });

  // ---- overhead: signal flags and last night's paper lanterns, from the mast (behind the camera) down to the staff
  const MAST_L = [-2.6, 6.2, 3.4], MAST_R = [3.0, 6.4, 3.2];
  near.add(node('flags1', bunting(MAST_L, staffTop, { sag: 0.5, count: 12, size: 0.3, seed: 3 }), M.prop), node('flags2', bunting(MAST_R, [HALF - 0.1, 0.7, RAIL_Z], { sag: 0.7, count: 11, size: 0.28, seed: 6, colors: [PAL.teal, PAL.cream, PAL.coral, PAL.yellow, PAL.blue] }), M.prop));
  const s1 = lanternString([MAST_R[0] - 0.6, MAST_R[1] - 0.6, MAST_R[2]], [LAMP_POST[0], 2.25, LAMP_POST[2]], { sag: 0.9, count: low ? 5 : 7, ends: 0.12 });
  near.add(node('wire', s1.wire, M.flat), node('lamp-stay', tint(place(cylinder(0.02, 0.02, 0.45, 4), LAMP_POST[0], 1.9, LAMP_POST[2]), PAL.gold), M.prop));

  // ---- astern: Vessery
  const far = group('far');
  const HEAD = [-46, -0.6, -150], LH = [-8.2, 0, -144];
  const headMesh = headland({ w: 96, d: 34, h: 9, seed: 3 });
  far.add(node('headland', headMesh, FAR, { pos: [HEAD[0], WATER - 0.1, HEAD[2]] }));
  { let top = 0; const Pm = headMesh.positions; for (let i = 0; i < Pm.length; i += 3) if (Math.hypot(Pm[i] + HEAD[0] - LH[0], Pm[i + 2] + HEAD[2] - LH[2]) < 5 && Pm[i + 1] > top) top = Pm[i + 1]; LH[1] = WATER - 0.1 + top - 0.8; }
  const lh = lighthouse({ h: 13, r: 2.3 });
  far.add(node('lighthouse', lh, FAR, { pos: LH }));
  const TOWN = [24, WATER, -120], TOWN_YAW = -10;
  const town = townBank({ w: 50, d: 18, h: 13, rows: 4, seed: 5, lit: low ? 0 : 0.22, dark: '#8fa6e8' });
  far.add(node('town', town, FAR, { pos: TOWN, rot: [0, TOWN_YAW, 0] }), node('town-foot', tint(place(box(56, 2.4, 3), 0, -0.6, 1.2), PAL.stoneDark), FAR, { pos: TOWN, rot: [0, TOWN_YAW, 0] }));
  far.add(node('shore2', headland({ w: 70, d: 30, h: 12, seed: 8, grass: PAL.leafDark }), FAR, { pos: [86, WATER - 0.1, -170], rot: [0, 172, 0] }));
  for (const [x, z, s, seed] of [[-16, -46, 2.2, 3], [-19, -44, 1.3, 5], [15, -64, 2.8, 8]]) far.add(node('rock', rock({ seed, s }), FAR, { pos: [x, WATER - 0.05, z] }));
  far.add(node('sail', boat({ len: 3.6, hull: PAL.cream, keel: PAL.red, pennant: PAL.red, seed: 3 }), FAR, { pos: [9, WATER, -52], rot: [0, 100, 0] }));

  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  env.sky.sunDir = norm(env.sky.sunDir);
  env.water.level = WATER;
  // foam round the islands; the wake is rings shed in update()
  env.water.shores = [[-16, -46, 1.8, 0.7], [15, -64, 2.3, 0.8], [HEAD[0], HEAD[2], 46, 1.6], [TOWN[0], TOWN[2] + 3, 26, 1.4], [9, -52, 1.3, 0.6]];
  scene.root.add(mergeStatic(ground, 'ground'), mergeStatic(near, 'near'), mergeStatic(mid, 'mid'), mergeStatic(far, 'far'));

  const fg = group('fg');
  fg.add(node('fg1', ropeCoil({ r: 0.26 }), M.prop, { pos: [1.7, 0, 2.9] }), node('fg2', crate({ s: 0.5, seed: 21 }), M.prop, { pos: [-1.8, 0, 2.9], rot: [0, 20, 0] }), node('fg3', sack({ seed: 4, s: 0.28 }), M.prop, { pos: [-2.35, 0, 2.55], rot: [0, -30, 0] }));
  const foreground = mergeStatic(fg, 'foreground');
  scene.root.add(foreground);

  const sprites = scene.sprites = createSprites(384);

  // last night's lanterns on the wire: out, paper pale in the daylight
  const lines = lanternLines({ strings: [{ ...s1, cols: [0, 3, 2, 5, 1, 4, 6] }], material: M.lantern, sprites, shapes: 1, seg: low ? 6 : 8, seed: 3 });
  scene.root.add(...lines.nodes);
  for (let i = 0; i < lines.count; i++) lines.setLit(i, i === 2 ? 1 : 0); // one somebody forgot

  // the ensign: its own node, so it can lift on the wind
  const flagMesh = merge(tint(extrude([[0, 0], [0.85, 0.06], [0.8, 0.5], [0, 0.52]], 0.016, { crease: 30 }), PAL.coral), tint(place(extrude([[0, 0.19], [0.83, 0.23], [0.82, 0.33], [0, 0.33]], 0.02, { crease: 30 }), 0, 0, 0), PAL.cream));
  const flag = node('ensign', flagMesh, M.prop, { pos: [staffTop[0], staffTop[1] - 0.62, staffTop[2] + 0.02] }); flag.castShadow = false;
  scene.root.add(flag);

  // the Carrow lantern
  const carrow = node('carrow', tint2(floatLight({ s: 1.5 }), '#ffb050'), M.lantern, { pos: [-1.8, WATER, RAIL_Z - 2] }); carrow.castShadow = false; carrow.visible = false;
  scene.root.add(carrow);
  const carrowGlow = sprites.add({ kind: 'glow', pos: [0, 0, 0], size: 1.5, color: '#ffa840', alpha: 0 });

  // Vessery's lights, going out one by one
  const lhLamp = anchorAt(lh, 'lamp', LH), lhGlow = sprites.add({ kind: 'glow', pos: lhLamp, size: 10, color: '#ffe9a8', alpha: 0 });
  const townLights = [];
  { const wins = anchorAt(town, 'windows', TOWN, TOWN_YAW).slice(0, 12), cols = ['#ffc860', '#ffb04a', '#ffdf8a', '#ff9fc0', '#ffd070'];
    for (let i = 0; i < (low ? 12 : 26); i++) { // window lights, then the lantern strings along the quay foot
      const p = i < wins.length ? wins[i] : [TOWN[0] - 24 + r() * 46, WATER + 1.6 + r() * 2.2, TOWN[2] + 5 + r() * 2];
      townLights.push({ glow: sprites.add({ kind: 'glow', pos: p, size: i < wins.length ? 3.4 : 2.4, color: cols[i % cols.length], alpha: 0 }), off: 4 + r() * 46, ph: r() * 6.283 });
    } }
  const laneGlow = sprites.add({ kind: 'glow', pos: LAMP, size: 1.7, color: '#fff0b0', alpha: 0 });

  const lamps = [
    { name: 'lane-lamp', pos: LAMP, color: '#ffe6a8', radius: 4.2, base: 1 },
    { name: 'porthole', pos: [-HALF + 0.4, 1.55, -0.1], color: '#ffc870', radius: 2.6, base: 0.9 },
  ];
  env.points = lamps.map((l) => ({ pos: l.pos, color: rgb(l.color), radius: l.radius, intensity: l.base * L.power }));

  const clouds = cloudBank({ count: low ? 5 : 9, seed: 13, arc: [156, 206], radius: [250, 430], height: [16, 120], size: [0.7, 1.5], speed: 0.06, ...L.cloud });
  scene.root.add(clouds.node);
  const high = low ? null : cloudBank({ count: 5, seed: 31, arc: [150, 212], radius: [300, 420], height: [170, 300], size: [0.9, 1.6], speed: 0.04, ...L.cloud });
  if (high) scene.root.add(high.node);
  const GULLS = low ? 3 : 5;
  const gulls = node('gulls', gull({}), M.speck); gulls.instances = makeInstances(GULLS); gulls.instances.count = GULLS;
  scene.root.add(gulls);

  const actors = group('actors'); scene.root.add(actors);

  let power = 1, afloat = 0, afloatNow = 0, clock = 0;
  const P = [0, 0, 0], V = [0, 0, 0], S3 = [1, 1, 1], Q = quat.create(), Mx = m4.create(), rnd = rng(77);
  let nextWake = 0, nextMote = 0, nextGust = 1, lastT = -1;
  const setPower = (p) => { power = Math.max(0, Math.min(1.5, p)); };
  const setAfloat = (a) => { afloat = Math.max(0, Math.min(1, a)); if (afloat === 0) afloatNow = 0; };
  function cue(lineId) {
    if (lineId === 'ch1.epi.01') { setAfloat(0); clock = 0; return true; }
    if (lineId === 'ch1.epi.07') { setAfloat(1); return true; }
    return false;
  }

  function update(time, dt = 0) {
    const pw = L.power * power;
    clock += dt;
    lines.update(time, { on: 1, pw: 0.6, unlit: 0.95, paper: 0.55, glow: 0.3, cool: 0 });
    env.points[0].intensity = lamps[0].base * pw * (0.95 + 0.05 * Math.sin(time * 7.1)); env.points[1].intensity = lamps[1].base * pw;
    laneGlow.alpha = 0.5 * Math.min(1.2, 0.5 + pw);
    lhGlow.alpha = 0.22 + 0.12 * Math.pow(Math.abs(Math.cos(time * 22 * DEG)), 6);
    for (let i = 0; i < townLights.length; i++) { const t = townLights[i], k = Math.max(0, Math.min(1, (t.off - clock) / 1.5)); t.glow.alpha = 0.5 * k * (0.85 + 0.15 * Math.sin(time * 3 + t.ph)); }
    // the ensign lifts and falls
    flag.setRot(Math.sin(time * 2.3) * 6, -78 + Math.sin(time * 1.3) * 14, 6 + Math.sin(time * 3.1) * 7);
    // the Carrow lantern goes out on the flat water toward the west (screen left), slowly
    afloatNow += (afloat - afloatNow) * Math.min(1, dt * 0.06);
    carrow.visible = afloat > 0;
    if (carrow.visible) {
      const u = afloatNow;
      carrow.position[0] = -1.8 - u * 7.5; carrow.position[1] = WATER + Math.sin(time * 1.4) * 0.03; carrow.position[2] = RAIL_Z - 6.4 - u * 44;
      const s = 1 + u * 2.2; carrow.scale[0] = carrow.scale[1] = carrow.scale[2] = s; carrow.setRot(Math.sin(time * 1.1) * 3, time * 9, Math.sin(time * 1.5) * 4);
      carrowGlow.pos[0] = carrow.position[0]; carrowGlow.pos[1] = carrow.position[1] + 0.26 * s; carrowGlow.pos[2] = carrow.position[2]; carrowGlow.size[0] = carrowGlow.size[1] = 1.5 * s; carrowGlow.alpha = 0.75 + 0.1 * Math.sin(time * 5);
    } else carrowGlow.alpha = 0;
    clouds.update(time); if (high) high.update(time);
    for (let i = 0; i < GULLS; i++) { // gulls follow the wake
      const a = time * (0.24 + i * 0.03) * (i % 2 ? 1 : -1) + i * 1.9, rad = 6 + i * 2.4, cx = -3 + i * 2.6, cz = -20 - i * 6;
      P[0] = cx + Math.cos(a) * rad; P[1] = 3.6 + i * 1.3 + Math.sin(time * 0.5 + i) * 0.8; P[2] = cz + Math.sin(a) * rad * 0.6;
      quat.fromEuler(Q, 0, Math.sin(a) * 0.35, Math.cos(a) * 0.3 * (i % 2 ? 1 : -1));
      const flap = Math.sin(time * (5.5 + i * 0.4) + i * 2); S3[0] = 1.9; S3[1] = 1.9 * (0.5 + 1.3 * flap); S3[2] = 1.9;
      if (Math.abs(S3[1]) < 0.12) S3[1] = 0.12;
      m4.fromTRS(Mx, P, Q, S3); gulls.instances.data.set(Mx, i * 20);
    }
    gulls.instances.dirty = true;

    if (lastT >= 0 && time - lastT < 0.5 && dt > 0) {
      if (time > nextWake) { // the wake: rings shed from under the counter and left behind
        nextWake = time + 0.32; P[0] = (rnd() - 0.5) * 2.6; P[1] = WATER + 0.03; P[2] = RAIL_Z - 2.2; V[0] = (P[0] > 0 ? 1 : -1) * 0.25; V[1] = 0; V[2] = -2.6;
        sprites.spawn({ kind: 'ring', pos: P, vel: V, size: 0.5, endSize: 2.6, life: 6, color: '#fffaf0' });
      }
      if (time > nextMote) { // the lane lamp's stillsalt, lying down flat astern: pale motes drifting back at rail height
        nextMote = time + 0.3; P[0] = LAMP[0] + (rnd() - 0.5) * 0.2; P[1] = LAMP[1] + 0.25; P[2] = LAMP[2]; V[0] = (rnd() - 0.5) * 0.25; V[1] = -0.1; V[2] = -1.2;
        sprites.spawn({ kind: 'glow', pos: P, vel: V, size: 0.14 + rnd() * 0.1, life: 5, color: '#fff2c8', alpha: 0.8 });
      }
      if (time > nextGust) { nextGust = time + 2.4 + rnd() * 1.5; P[0] = -4 + rnd() * 6; P[1] = 2.4 + rnd() * 2.6; P[2] = -3 + rnd() * 4; V[0] = 0.4; V[1] = 0.05; V[2] = -1.9; sprites.gust(P, { vel: V, size: 0.9 + rnd() * 0.5, life: 2.2, alpha: 0.8, color: '#fffaf0' }); }
      sprites.update(dt);
    }
    lastT = time;
  }

  const rig = setRig('ferry-dawn', CAMERAS, env);
  update(0, 0);
  return {
    id: 'ferry-dawn', light, low, scene, env, actors, foreground,
    cameras: CAMERAS, frame: rig.frame, view: rig.view,
    marks: { ...MARKS, focus: LAMP },
    lamps, setPower, setAfloat, cue, task: () => null,
    update,
  };
}

function tint2(mesh, color) { const c = rgb(color), C = mesh.colors; for (let i = 0; i < C.length; i += 3) { C[i] *= c[0]; C[i + 1] *= c[1]; C[i + 2] *= c[2]; } return mesh; }

export const ferryDawn = { id: 'ferry-dawn', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default ferryDawn;
