// SET: shore-dusk. A shore below a town with the sun going into the sea. One key, three scenes:
//   'dusk'   Saltmere, the last night (ch2.epi): a driftwood fire in a ring of stones, a beached boat, a drying rack, the
//            spring cask waiting by the tide line, the town's cold lamp on its rock holding the water flat
//   'night'  the same shore later (ch2.epi.13 on: "the fire had burned low", "the night was very cold"): moon, embers
//   'brand'  Little Brand (ch4.s2.c15, ch4.s6): no fire and no light anywhere; a torn drift net pegged along the sea
//            wall with a hole in the middle of it, mended from both ends
//
//   import { shoreDusk } from './sets/shore-dusk.js';
//   const set = shoreDusk.build(GL, { light: 'dusk' | 'night' | 'brand', low: false });
//
// Same shape as sets/lantern-stalls.js. Figures face +Z, cameras look toward -Z: the sea and the sun are that way.
// The strip x -4.4..4.4, z 0..1.6 is clear sand.
//
// What this set can do for its story:
//   setFire(0..1.3)       the fire: 1 well alight, 0.3 burned low, 0 out (brand has none)
//   setHole(0..1)         brand: how much of the net is still torn (1 as found, 0 mended); a separate mesh per quarter
//   cue(lineId)           ch2.epi.01 fire up; epi.13 burning down; epi.21 low; ch4.s2.c15 the hole as found; ch4.s6.c01 six feet left
//   task('drift-net')     brand -> { pos, stand, set(v) }: v = how much is mended
// marks: a, b, c, two, party, opposition as everywhere, plus
//   fire { pos, face }: sitting by the fire   sleep { pos, face }: where the Tribune lies with the brief under her head
//   netL, netR { pos, face }: the two ends of the net (brand)   tide { pos, face }: at the water's edge   focus: the fire

import { rng, m4, DEG } from '../math.js';
import { merge, tint, place, box, plane, cylinder, setGlow, setOutline, fromArrays } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic } from '../scene.js';
import { createSprites } from '../sprites.js';
import { rayMesh, rayMaterial } from '../fx.js';
import { boat, headland, cloudBank, rock, barrel, crate, ropeCoil, house, scatter, cobble } from './kit.js';
import {
  SM, ch2Materials, shell, lightOf, stageMarks, norm3, driftFire, duneGrass, seaWall, driftNet, dryingRack, lampHouse, saltHeap, flameBank, handLamp,
} from './kit-ch2.js';

const SHORE_Z = -6.6, WATER = -0.22;
const dirFrom = (az, el) => [Math.sin(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), -Math.cos(az * DEG) * Math.cos(el * DEG)];

const LIGHTS = {
  dusk: {
    preset: 'sunset', power: 1, fire: 1, lamp: 1, night: false, brand: false,
    env: {
      key: { dir: dirFrom(-12, 16), color: '#ffd9a8' },
      shadow: { tint: '#7a70de', lift: 0.1, saturate: 1.4 },
      ambient: { sky: '#ffa48e', ground: '#7d6ad0', amount: 0.16 },
      rim: { color: '#ffd98a', amount: 1.0, edge: 0.7 },
      fog: { density: 0.0036, start: 18, max: 0.9 },
      sky: { zenith: '#3646c4', mid: '#a47ee8', midAt: 0.46, horizon: '#ffc466', below: '#f6a070', glow: '#ffe890', glowAmount: 0.6, sunDir: dirFrom(-3.5, 3.4), sun: { color: '#fffbe0', size: 3.0, halo: '#ffcc68', haloAmount: 0.46 } },
      water: { deep: '#2a50bc', mid: '#4488dc', shallow: '#7fe0d4', foam: '#fff6e4', glint: '#ffe7a0', glintDensity: 0.34 },
    },
    sand: '#ffe2a8', wet: '#e9b388', cloud: { color: '#ffd4b0', shadowTint: '#c870b8' }, smoke: '#ffe2d0', sunShaft: 0.2,
  },
  night: {
    preset: 'night', power: 1.1, fire: 0.38, lamp: 1, night: true, brand: false,
    env: {
      key: { dir: dirFrom(-30, 36), color: '#86a4f4' },
      shadow: { tint: '#2c40ac', lift: 0.13, saturate: 1.3 },
      ambient: { sky: '#4666d8', ground: '#2c3c98', amount: 0.17 },
      rim: { color: '#bcd6ff', amount: 0.7, edge: 0.74 },
      fog: { density: 0.004, start: 18, max: 0.86 },
      sky: { zenith: '#0a166a', mid: '#1b3cac', midAt: 0.42, horizon: '#5886ea', below: '#3058c4', sunDir: dirFrom(-6, 15), moon: 0.7, stars: 1, sun: { size: 3.0 } },
      water: { deep: '#132a86', mid: '#1e45ae', shallow: '#3478d6', glintDensity: 0.2 },
    },
    sand: '#e9e4ff', wet: '#b9b4f0', cloud: { color: '#8fa6ea', shadowTint: '#3a50aa' }, smoke: '#b9c6f2', sunShaft: 0,
  },
  brand: {
    preset: 'sunset', power: 0, fire: 0, lamp: 0, night: false, brand: true,
    env: {
      key: { dir: dirFrom(14, 13), color: '#ffc8a8' },
      shadow: { tint: '#8c7ce8', lift: 0.24, saturate: 1.4 }, // the whole strip stands in the sea wall's shadow: lifted, or it goes to mud
      ambient: { sky: '#f09aa0', ground: '#8a6cd0', amount: 0.24 },
      rim: { color: '#ffc890', amount: 1.0, edge: 0.7 },
      fog: { density: 0.004, start: 18, max: 0.9 },
      sky: { zenith: '#2c3cb8', mid: '#9070e0', midAt: 0.44, horizon: '#ffa868', below: '#e88c78', glow: '#ffd890', glowAmount: 0.5, sunDir: dirFrom(4.5, 2.2), sun: { color: '#fff0d0', size: 3.2, halo: '#ffb060', haloAmount: 0.46 } },
      water: { deep: '#2644ac', mid: '#3c74d0', shallow: '#6cc8d0', foam: '#fff0e0', glint: '#ffd8a0', glintDensity: 0.3 },
    },
    sand: '#f6d6a8', wet: '#d8a488', cloud: { color: '#ffc4b0', shadowTint: '#b068b8' }, smoke: '#ffe2d0', sunShaft: 0.16,
  },
};

const CAMERAS = {
  wide: { target: [0.1, 1.7, -0.6], dist: 8.6, yaw: 3, pitch: 4, fov: 46, aspect: 0.46, shadowCenter: [0, 0, -1.4], shadowRadius: 8 },
  two: { target: [0, 1.12, 0.6], dist: 6.0, yaw: -15, pitch: 5, fov: 31, aspect: 0.46, shadowCenter: [0, 0, 0.3], shadowRadius: 3.6 },
  close: { target: [0.02, 0.86, 0.8], dist: 3.9, yaw: 21, pitch: 3, fov: 28, aspect: 0.46, shadowCenter: [0, 0, 0.5], shadowRadius: 2.6 },
  low: { target: [0.1, 1.7, 0.1], dist: 6.2, yaw: -8, pitch: -9, fov: 56, aspect: 0.46, shadowCenter: [0, 0, -1], shadowRadius: 8 },
  stage: { target: [0.1, 1.05, 0.3], dist: 9.6, yaw: -14, pitch: 7, fov: 25, aspect: 1.95, shadowCenter: [0, 0, -0.6], shadowRadius: 7.5, outline: 0.7 },
  landscape: { target: [0, 1.7, -1.2], dist: 10.5, yaw: 4, pitch: 5, fov: 40, aspect: 1.6, shadowCenter: [0, 0, -1.5], shadowRadius: 10.5 },
};

function build(engine = null, { light: lightName = 'dusk', low = false } = {}) {
  const [light, L] = lightOf('shore-dusk', LIGHTS, lightName);
  const M = ch2Materials(), r = rng(1301), night = L.night, brand = L.brand;
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  env.sky.sunDir = norm3(env.sky.sunDir);
  env.water.level = WATER;
  const deco = (n) => { n.castShadow = false; return n; };

  // ---- the beach: dry sand, a wet shelf at the tide line, ripple ridges
  const set = group('set');
  set.add(node('sand', tint(place(plane(120, 30, 1, 1), 0, 0, SHORE_Z + 1.4 + 15), L.sand), M.ground));
  { // the wet shelf slopes into the water
    const z0 = SHORE_Z + 1.4, z1 = SHORE_Z - 1.2;
    set.add(deco(node('wet', tint(fromArrays([-60, 0, z0, 60, 0, z0, -60, WATER - 0.2, z1, 60, WATER - 0.2, z1], [0, 1, 2, 1, 3, 2], null, 180), L.wet), M.ground)));
  }
  if (!low) { const parts = []; for (let i = 0; i < 16; i++) { const z = SHORE_Z + 2.2 + r() * 6, x = -9 + r() * 18, w = 1.2 + r() * 2.2; if (z > -0.4 && z < 2 && Math.abs(x) < 4.6) continue; parts.push(place(box(w, 0.02, 0.09), x, 0.008, z, 0, (r() - 0.5) * 16, 0)); } set.add(deco(node('ripples', setOutline(tint(merge(parts), night ? '#cfc8f6' : brand ? '#e4bc90' : '#f2cc90'), 0), M.flat))); }

  // ---- what lies on it
  const BOAT = [-4.7, 0.16, -3.3];
  set.add(node('boat', boat({ len: 3.4, hull: SM.salt, keel: SM.enamel, pennant: SM.rust, mast: !brand, seed: 5 }), M.prop, { pos: BOAT, rot: [9, 58, 13] }));
  set.add(node('boat-prop', merge(tint(place(cylinder(0.05, 0.06, 0.9, 5), 0, 0, 0, 0, 0, 24), SM.timberDark), tint(place(cylinder(0.05, 0.06, 0.8, 5), 0.9, 0, 0.5, 0, 0, -20), SM.timberDark)), M.prop, { pos: [BOAT[0] + 0.4, 0, BOAT[2] + 0.7] }));
  const RACK = [4.8, 0, -3.5];
  set.add(node('rack', dryingRack({ len: 2.6, h: 1.7, seed: 3, hung: brand ? '#b8a8e0' : '#ffb86a' }), M.prop, { pos: RACK, rot: [0, -24, 0] }));
  set.add(node('gear', merge(place(crate({ s: 0.5, seed: 4 }), 0, 0, 0, 0, 16, 0), place(ropeCoil({ r: 0.26 }), 0.75, 0, 0.2), place(barrel({ r: 0.24, h: 0.6 }), -0.65, 0, 0.1)), M.prop, { pos: [6.3, 0, -1.3] }));
  for (const [x, z, s, seed] of [[-7.4, -4.6, 1.5, 3], [-8.4, -3.4, 0.9, 5], [7.6, -5.2, 1.3, 8], [-2.6, SHORE_Z - 2.6, 1.0, 2], [3.8, SHORE_Z - 4.5, 1.4, 6], [-11, SHORE_Z - 9, 2.2, 9]]) set.add(node('rock', rock({ seed, s, low: night ? '#7a74c8' : '#a890d0', high: night ? '#a8a2e8' : '#e0c0d8' }), M.prop, { pos: [x, z < SHORE_Z ? WATER - 0.1 : -0.05, z] }));
  const tufts = [[-6.2, 0.8, 1.2, 1], [-7.1, -0.9, 1.0, 2], [-5.6, 2.3, 0.9, 3], [6.2, 1.2, 1.1, 4], [7.3, -0.2, 1.2, 5], [5.5, 2.6, 0.9, 6], [-8.6, -2.2, 1.1, 7], [8.8, -2.6, 1.0, 8]];
  { const parts = []; tufts.forEach(([x, z, s, seed], i) => { if (low && i > 4) return; parts.push(place(duneGrass({ s: 0.8 * s, n: low ? 6 : 10, seed, color: night ? '#2a7a9a' : '#3aa07a', tip: night ? '#6ad0c8' : '#b8f090' }), x, 0, z)); }); set.add(deco(node('grass', merge(parts), M.prop))); }

  // ---- Saltmere: the fire, the brief, the spring cask at the tide line. Little Brand: the sea wall and the net.
  const FIRE = [1.15, 0, -1.95];
  let fire = null, fireTop = null, netTask = null; const netParts = [];
  const NET_Z = -2.7, NET_LEN = 9.6;
  if (!brand) {
    const df = driftFire({ r: 0.52, seed: 2 });
    set.add(node('fire-wood', df, M.prop, { pos: FIRE }));
    fireTop = [FIRE[0], df.anchors.fire[1], FIRE[2]];
    // a drift log to sit on, a blanket, the brief she fell asleep on, tied in red tape
    set.add(node('log', tint(place(cylinder(0.2, 0.17, 2.2, 7), -1.1, 0.19, 0, 0, 0, 90), '#f0dcc0'), M.prop, { pos: [FIRE[0] - 0.1, 0, FIRE[2] - 1.05], rot: [0, 8, 0] }));
    set.add(deco(node('blanket', setOutline(merge(tint(place(box(1.5, 0.03, 0.8), 0, 0.015, 0), SM.royal), tint(place(box(1.5, 0.032, 0.12), 0, 0.016, 0.22), SM.mustard), tint(place(box(1.5, 0.032, 0.12), 0, 0.016, -0.22), SM.mustard)), 0.6), M.prop, { pos: [-0.75, 0, -1.7], rot: [0, 12, 0] })));
    set.add(deco(node('brief', merge(tint(place(box(0.34, 0.1, 0.26), 0, 0.05, 0), SM.paper), tint(place(box(0.35, 0.03, 0.05), 0, 0.105, 0), SM.seal), tint(place(box(0.05, 0.03, 0.27), 0, 0.105, 0), SM.seal)), M.prop, { pos: [-1.25, 0.03, -1.75], rot: [0, 30, 0] })));
    // the cask that goes out on the ebb, with its lantern
    set.add(node('cask', barrel({ r: 0.3, h: 0.7, color: SM.timberPale }), M.prop, { pos: [-2.1, 0, SHORE_Z + 1.9] }));
    set.add(deco(node('cask-lamp', handLamp({ s: 1.4 }), M.prop, { pos: [-2.1, 0.7, SHORE_Z + 1.9] })));
  } else {
    set.add(node('sea-wall', seaWall({ len: 15, h: 1.0, seed: 4, colors: ['#f0d0b0', '#e4c0a0', '#ffe0c0'] }), M.prop, { pos: [0, 0, NET_Z - 0.45] }));
    // dark houses above the wall: nobody shows a light
    for (const [x, s, seed, roofc] of [[-6.4, 1, 3, '#8a6be0'], [6.8, 0.9, 7, '#e86a9a']]) set.add(node('house', house({ seed, w: 3.0 * s, d: 2.4, h: 2.5 * s, roofH: 1.5, wall: '#f6dcc8', roof: roofc, shutters: SM.enamel, sides: 'none', lit: 0, flowers: false }), M.prop, { pos: [x, 0, NET_Z - 2.6], rot: [0, x < 0 ? 12 : -14, 0] }));
  }
  scene.root.add(mergeStatic(set, 'set'));

  if (brand) { // the net: four meshes with less and less of a hole, one shown at a time
    [0.34, 0.2, 0.09, 0].forEach((hole, i) => { const n = node('net' + i, driftNet({ len: NET_LEN, h: 1.5, hole, seed: 3 }), M.prop, { pos: [0, 0, NET_Z], visible: i === 0 }); n.castShadow = i === 0; scene.root.add(n); netParts.push(n); });
  }

  // ---- far: a headland with nothing lit on it, and (Saltmere) the lamp-house on its rock
  const far = group('far');
  far.add(node('headland', headland({ w: 90, d: 30, h: 10, seed: 5, grass: night ? '#3a6ac8' : '#7a9a70', cliff: night ? '#8a90e0' : '#f0c8a8', foot: night ? '#5a66c8' : '#d89a90', seg: low ? 24 : 40, rings: low ? 10 : 16 }), low ? M.farFlat : M.far, { pos: [-62, -0.6, -125] }));
  const LH = [13.5, 0, -40];
  let lhLamp = null;
  if (!brand) { const lh = lampHouse({ h: 8, r: 1.9 }); far.add(node('lamp-rock', saltHeap({ r: 6.5, h: 4.4, seed: 6, top: night ? '#b8b4f0' : '#f0c8b8', low: night ? '#6a70c8' : '#c08aa8' }), low ? M.farFlat : M.far, { pos: [LH[0], WATER - 0.3, LH[2]] }), node('lamp-house', lh, low ? M.farFlat : M.far, { pos: [LH[0], 3.4, LH[2]] })); lhLamp = [LH[0], 3.4 + lh.anchors.lamp[1], LH[2]]; }
  scene.root.add(mergeStatic(far, 'far'));
  env.water.shores = [[0, SHORE_Z + 900, 900, 0.9], [-2.6, SHORE_Z - 2.6, 0.9, 0.5], [3.8, SHORE_Z - 4.5, 1.2, 0.6], [-11, SHORE_Z - 9, 1.9, 0.7], [-62, -125, 44, 1.6], ...(brand ? [] : [[LH[0], LH[2], 6.2, 1.0]])];

  // shells and pebbles: one instanced draw
  if (!low) {
    const peb = node('pebbles', cobble(), M.flat); peb.castShadow = false;
    scatter(peb, 110, () => { const x = -9 + r() * 18, z = SHORE_Z + 0.4 + r() * 9; return { m: m4.trs(x, 0.004, z, 0, r() * 360, 0, 0.07 + r() * 0.1), color: [night ? '#ffffff' : '#fff6e0', night ? '#b8b4f0' : '#f0b8a0', '#bfe8e0', night ? '#d8d0ff' : '#ffd0b0'][Math.floor(r() * 4)] }; });
    scene.root.add(peb);
  }

  const sprites = scene.sprites = createSprites(low ? 160 : 384);
  if (!brand) { fire = flameBank({ spots: [{ pos: fireTop, s: 2.5 }], material: M.speck, r: 0.22, h: 0.62 }); scene.root.add(fire.node); }

  // slants of the last sun across the sand
  if (L.sunShaft > 0 && !low) {
    const kd = env.key.dir, yaw = Math.atan2(kd[0], kd[2]) / DEG, tilt = Math.acos(kd[1]) / DEG, parts = [];
    for (const [x, z, len, w] of [[0.7, 1.0, 10, 1.3], [-1.6, 2.8, 11, 1.0]]) parts.push(place(rayMesh(len, 0.5, w, 10), x + kd[0] * len, kd[1] * len - 0.2, z + kd[2] * len, tilt, yaw, 0));
    scene.root.add(node('sun-shafts', tint(merge(parts), '#ffd890'), rayMaterial({ power: 1.3, near: L.sunShaft, far: L.sunShaft * 0.35 })));
  }
  const clouds = cloudBank({ count: low ? 5 : 8, seed: 21, arc: [156, 206], radius: [250, 430], height: [16, 130], size: [0.7, 1.5], speed: 0.04, style: low ? 'painted' : 'solid', ...L.cloud });
  scene.root.add(clouds.node);

  const actors = group('actors'); scene.root.add(actors);
  const foreground = mergeStatic(group('fg', {}, node('fg-grass', duneGrass({ s: 1.0, n: 12, seed: 14, color: night ? '#2a7a9a' : '#3aa07a', tip: night ? '#6ad0c8' : '#b8f090' }), M.prop, { pos: [-2.4, 0, 3.0] }), node('fg-grass2', duneGrass({ s: 0.9, n: 10, seed: 17, color: night ? '#2a7a9a' : '#3aa07a', tip: night ? '#6ad0c8' : '#b8f090' }), M.prop, { pos: [2.5, 0, 3.1] }), node('fg-rock', rock({ seed: 4, s: 0.7, low: night ? '#7a74c8' : '#a890d0', high: night ? '#a8a2e8' : '#e0c0d8' }), M.prop, { pos: [2.0, -0.05, 2.9] })), 'foreground');
  foreground.traverse((n) => { n.castShadow = false; });
  scene.root.add(foreground);

  // ---- lamps
  const lamps = [], glows = [];
  let fireGlow = null, emberGlow = null, lhHalo = null;
  if (!brand) {
    lamps.push({ name: 'fire', pos: [fireTop[0], fireTop[1] + 0.45, fireTop[2] + 0.25], color: '#ff9a48', radius: 8.5, base: 1.5, flicker: 0, fire: 0, fixed: true });
    lamps.push({ name: 'cask', pos: [-2.1, 1.0, SHORE_Z + 2.1], color: '#ffc870', radius: 3.4, base: 1.0 });
    fireGlow = sprites.add({ kind: 'glow', pos: [fireTop[0], fireTop[1] + 0.3, fireTop[2]], size: 3.0, color: '#ff9a40', alpha: 0 });
    emberGlow = sprites.add({ kind: 'glow', pos: [fireTop[0], fireTop[1], fireTop[2]], size: 1.2, color: '#ff6a28', alpha: 0 });
    glows.push({ sprite: sprites.add({ kind: 'glow', pos: [-2.1, 0.92, SHORE_Z + 1.9], size: 1.1, color: '#ffc060', alpha: 0 }), base: 0.6 });
    glows.push({ sprite: sprites.add({ kind: 'glow', pos: lhLamp, size: 6.5, color: SM.still, alpha: 0 }), base: night ? 0.62 : 0.4, fixed: true });
    lhHalo = sprites.add({ kind: 'glow', pos: lhLamp, size: 15, color: SM.stillDeep, alpha: 0 });
  }

  let fireLevel = L.fire, fireNow = L.fire, hole = 1, nextSmoke = 0, nextEmber = 0, nextRing = 0.5, nextGust = 1.5;
  const rnd = rng(61), P = [0, 0, 0], V = [0, 0, 0];
  function setFire(v) { fireLevel = Math.max(0, Math.min(1.3, v)); }
  function setHole(v) { hole = Math.max(0, Math.min(1, v)); const k = hole > 0.75 ? 0 : hole > 0.4 ? 1 : hole > 0.05 ? 2 : 3; for (let i = 0; i < netParts.length; i++) netParts[i].visible = i === k; }
  function cue(id) {
    switch (id) {
      case 'ch2.epi.01': setFire(1); return true;
      case 'ch2.epi.13': setFire(0.6); return true;
      case 'ch2.epi.21': case 'ch2.epi.22': setFire(0.3); return true;
      case 'ch4.s2.c15': setHole(1); return true;
      case 'ch4.s6.c01': setHole(0.5); return true;
      default: return false;
    }
  }
  if (brand) netTask = { pos: [0, 0.9, NET_Z + 0.1], stand: [-0.9, NET_Z + 0.8], set(v) { setHole(1 - v); } };
  const task = (type) => (type === 'drift-net' ? netTask : null);
  function tick(time, dt, pw, live) {
    clouds.update(time);
    if (fire) {
      fireNow += (fireLevel - fireNow) * Math.min(1, dt * 0.8 + (dt === 0 ? 1 : 0));
      const f = fire.spots[0]; f.level = Math.max(0.02, fireNow); fire.update(time, 1);
      env.points[0].intensity = lamps[0].base * (0.12 + 0.88 * fireNow) * (0.72 + 0.35 * f.flick);
      fireGlow.alpha = (night ? 0.75 : 0.62) * fireNow * (0.85 + 0.15 * f.flick); fireGlow.size[0] = fireGlow.size[1] = 1.4 + 1.8 * fireNow;
      emberGlow.alpha = 0.55 + 0.2 * Math.sin(time * 2.1);
      lhHalo.alpha = (night ? 0.26 : 0.16) + 0.05 * Math.sin(time * 0.9);
    }
    if (!live) return;
    if (fire && time > nextSmoke) { nextSmoke = time + (fireNow > 0.5 ? 0.3 : 0.7); P[0] = fireTop[0]; P[1] = fireTop[1] + 0.6 * fireNow + 0.2; P[2] = fireTop[2]; sprites.puff(P, { count: 1, size: 0.13 + 0.08 * fireNow, rise: 1.0, spread: 0.08, life: 2.6, color: L.smoke }); }
    if (fire && fireNow > 0.15 && time > nextEmber) { nextEmber = time + 0.1 / fireNow; P[0] = fireTop[0] + (rnd() - 0.5) * 0.3; P[1] = fireTop[1] + 0.3; P[2] = fireTop[2]; V[0] = -0.3 - rnd() * 0.4; V[1] = 0.9 + rnd() * 1.0; V[2] = -0.1; sprites.spawn({ kind: 'glow', pos: P, vel: V, size: 0.06 + rnd() * 0.07, life: 1.6 + rnd(), color: '#ffc060', alpha: 0.95, drag: 0.4 }); }
    if (time > nextRing) { nextRing = time + 0.9; P[0] = -9 + rnd() * 18; P[1] = WATER + 0.03; P[2] = SHORE_Z - 0.9 - rnd() * 3; sprites.splash(P, { size: 0.9 + rnd() * 0.7, life: 1.5, spray: 0, color: night ? '#bcd4ff' : '#fff6e4' }); }
    if (!low && time > nextGust) { nextGust = time + 3 + rnd() * 2; P[0] = -5 + rnd() * 4; P[1] = 1.6 + rnd() * 2.6; P[2] = -6 + rnd() * 5; V[0] = 1.7; V[1] = 0.05; V[2] = 0.2; sprites.gust(P, { vel: V, size: 0.9 + rnd() * 0.5, life: 2.2, alpha: 0.75, color: night ? '#c6d6ff' : '#fff6e6' }); }
  }

  return shell({
    id: 'shore-dusk', light, L, scene, cameras: CAMERAS, actors, foreground, lamps, glows, tick, house: false,
    marks: {
      ...stageMarks(), focus: fireTop || [0, 0.9, NET_Z],
      fire: { pos: [FIRE[0] - 1.0, 0, FIRE[2] + 0.5], face: 70 }, sleep: { pos: [-0.9, 0, -1.6], face: 100 },
      netL: { pos: [-NET_LEN / 2 + 0.4, 0, NET_Z + 0.7], face: 170 }, netR: { pos: [NET_LEN / 2 - 0.4, 0, NET_Z + 0.7], face: -170 },
      tide: { pos: [0.6, 0, SHORE_Z + 1.9], face: 180 },
    },
    extra: { setFire, setHole, cue, task },
  });
}

export const shoreDusk = { id: 'shore-dusk', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default shoreDusk;
