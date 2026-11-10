// SET: causeway. The road in to Saltmere: four miles of white salt laid across the tidal flats, tide markers leaning
// along both edges, salt stacked in cones on the pans, and at the end of it the island: a huddle of pale houses, the
// winding tower, the lamp-house with its cold light. The tide keeps its own hours.
// Chapter 2: ch2.pro.02 - pro.19 (Ilse reading the contract for the forty-first time; Tobb on lapse bonds).
//
//   import { causeway } from './sets/causeway.js';
//   const set = causeway.build(GL, { light: 'day' | 'night', low: false });
//
// Same shape as sets/lantern-stalls.js. Figures face +Z, cameras look toward -Z: the road runs away from the lens to
// the island, and the sun stands over it on the left. The strip x -4.4..4.4, z 0..1.6 is the road itself.
//
// What this set can do for its story:
//   setTide(0..1)         0 the flats are bare wet sand with pools, 1 the sea is up to the lip of the road (default 0.55)
//   cue(lineId)           ch2.pro.02 half tide; ch2.pro.19 the tide is making (the gate is close now)
//   task('tide')          -> { pos, set(v) }: v = how far the crossing has got; the tide follows it in
// marks: a, b, c, two, party, opposition as everywhere, plus
//   road { pos, face }: further up the road, backs to the lens   stone { pos, face }: at the milestone   focus: the town's lamp

import { rng, m4, quat, DEG } from '../math.js';
import { merge, tint, place, box, plane, cylinder, setGlow, setOutline } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic, makeInstances } from '../scene.js';
import { createSprites } from '../sprites.js';
import { cloudBank, gull, rock, crate, barrel, scatter, cobble } from './kit.js';
import { SM, ch2Materials, shell, lightOf, stageMarks, norm3, saltRoad, tideMarker, saltHeap, islandTown, pixelText, oreCart } from './kit-ch2.js';

const dirFrom = (az, el) => [Math.sin(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), -Math.cos(az * DEG) * Math.cos(el * DEG)];
const PATH = [[0, 7], [0, 1], [0.3, -5], [1.6, -14], [-0.8, -30], [2.4, -52], [0.6, -80], [0, -104]];
const LOW_TIDE = -0.62, HIGH_TIDE = -0.07;

const LIGHTS = {
  day: {
    preset: 'day', power: 0.25, night: false,
    env: {
      key: { dir: dirFrom(-24, 30), color: '#fff8e4' },
      shadow: { tint: '#8a9af0', lift: 0.07, saturate: 1.35 },
      ambient: { sky: '#c4e6ff', ground: '#ffeec8', amount: 0.11 },
      rim: { color: '#ffffff', amount: 0.75, edge: 0.74 },
      fog: { density: 0.0034, start: 26, max: 0.9 },
      sky: { zenith: '#1a62d4', mid: '#4aa8f0', midAt: 0.4, horizon: '#d4f2f8', below: '#9fe0ec', glow: '#fffbe0', glowAmount: 0.5, sunDir: dirFrom(-7.2, 17.5), sun: { color: '#fffef4', size: 3.0, halo: '#fff4c0', haloAmount: 0.55 } },
      water: { deep: '#1d86d8', mid: '#3cb8e4', shallow: '#8cece0', foam: '#ffffff', glint: '#ffffff', glintDensity: 0.3 },
    },
    road: '#fffdf6', edge: '#e6e2ff', foot: '#b8b0ea', flat: '#f2deb4', cloud: { color: '#ffffff', shadowTint: '#b4c6f8' }, still: 0.5,
  },
  night: {
    preset: 'night', power: 1.1, night: true,
    env: {
      key: { dir: dirFrom(-26, 38), color: '#86a4f4' },
      shadow: { tint: '#2c40ac', lift: 0.13, saturate: 1.3 },
      ambient: { sky: '#4666d8', ground: '#2c3c98', amount: 0.17 },
      rim: { color: '#bcd6ff', amount: 0.7, edge: 0.74 },
      fog: { density: 0.004, start: 22, max: 0.86 },
      sky: { zenith: '#0a166a', mid: '#1b3cac', midAt: 0.42, horizon: '#5886ea', below: '#3058c4', sunDir: dirFrom(-7, 16), moon: 0.75, stars: 1, sun: { size: 3.2 } },
      water: { deep: '#132a86', mid: '#1e45ae', shallow: '#3478d6', glintDensity: 0.2 },
    },
    road: '#f4f4ff', edge: '#c8ccff', foot: '#7a80d8', flat: '#8a90e0', cloud: { color: '#8fa6ea', shadowTint: '#3a50aa' }, still: 0.95,
  },
};

const CAMERAS = {
  wide: { target: [0.1, 1.9, -0.8], dist: 8.8, yaw: 3, pitch: 4, fov: 46, aspect: 0.46, shadowCenter: [0, 0, -1.6], shadowRadius: 8.5 },
  two: { target: [0, 1.12, 0.6], dist: 6.0, yaw: -15, pitch: 5, fov: 31, aspect: 0.46, shadowCenter: [0, 0, 0.3], shadowRadius: 3.6 },
  close: { target: [0.02, 0.86, 0.8], dist: 3.9, yaw: 21, pitch: 3, fov: 28, aspect: 0.46, shadowCenter: [0, 0, 0.5], shadowRadius: 2.6 },
  low: { target: [0.1, 1.8, 0.0], dist: 6.2, yaw: -8, pitch: -9, fov: 56, aspect: 0.46, shadowCenter: [0, 0, -1], shadowRadius: 8.5 },
  stage: { target: [0.1, 1.05, 0.3], dist: 9.6, yaw: -14, pitch: 7, fov: 25, aspect: 1.95, shadowCenter: [0, 0, -0.6], shadowRadius: 8, outline: 0.7 },
  landscape: { target: [0, 1.8, -1.4], dist: 10.5, yaw: 4, pitch: 5, fov: 40, aspect: 1.6, shadowCenter: [0, 0, -1.6], shadowRadius: 10.5 },
};

function build(engine = null, { light: lightName = 'day', low = false } = {}) {
  const [light, L] = lightOf('causeway', LIGHTS, lightName);
  const M = ch2Materials(), r = rng(1723), night = L.night;
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  env.sky.sunDir = norm3(env.sky.sunDir);
  const deco = (n) => { n.castShadow = false; return n; };
  // where the road's centre line is at depth z (for standing things beside it)
  const roadX = (z) => { for (let i = 0; i < PATH.length - 1; i++) { const a = PATH[i], b = PATH[i + 1]; if (z <= a[1] && z >= b[1]) return a[0] + (b[0] - a[0]) * (a[1] - z) / (a[1] - b[1]); } return 0; };
  const halfAt = (z) => (10 + (2.4 - 10) * Math.min(1, Math.max(0, (7 - z) / 111))) / 2;

  // ---- the flats (under the water when the tide is in), the road
  const set = group('set');
  set.add(node('flats', tint(place(plane(400, 300, 1, 1), 0, LOW_TIDE - 0.02, -110), L.flat), M.ground));
  set.add(node('road', saltRoad({ path: PATH, w: 10, w1: 2.4, drop: 0.75, n: low ? 22 : 34, top: L.road, edge: L.edge, foot: L.foot }), M.ground));
  // ruts: two long faint lines worn by the salt carts, and the crown of the road
  { const parts = []; for (const off of [-0.8, 0.8]) for (let i = 0; i < 16; i++) { const z = 5 - i * 3.2, k = 1 - Math.min(1, (7 - z) / 111) * 0.76; parts.push(place(box(0.16 * k, 0.012, 2.6), roadX(z) + off * k, 0.016, z, 0, Math.atan2(roadX(z - 1.6) - roadX(z + 1.6), -3.2) / DEG + 180, 0)); } set.add(deco(node('ruts', setOutline(tint(merge(parts), night ? '#b8bcf8' : '#dcd6f8'), 0), M.flat))); }

  // ---- markers down both edges, getting smaller with distance
  const MARKS_Z = [2.4, -2.6, -7.5, -13, -19, -26, -34, -43, -54, -66];
  const lit = night ? 1 : 0, markerTops = [];
  MARKS_Z.forEach((z, i) => { if (low && i > 6) return; for (const sx of [-1, 1]) { if (sx > 0 && i === 1) continue; const s = i < 2 ? 1.1 : 1, x = roadX(z) + sx * (halfAt(z) + 0.25), m = tideMarker({ h: 3.1 * s, seed: i * 2 + (sx > 0 ? 1 : 0) + 1, band: i % 3 === 0 ? SM.royal : SM.rust, lit: night && i % 2 === 0 }); set.add(node('marker', m, M.prop, { pos: [x, -0.45, z + (sx > 0 ? 1.1 : 0)] })); if (night && i % 2 === 0) markerTops.push([x + m.anchors.top[0], -0.45 + m.anchors.top[1], z + (sx > 0 ? 1.1 : 0)]); } });
  // the milestone
  const STONE = [4.25, 0, -2.5];
  set.add(node('milestone', merge(tint(place(box(0.8, 1.05, 0.34), 0, 0.5, 0), '#fff0d8'), tint(place(cylinder(0.4, 0.4, 0.34, 10), 0, 1.03, 0, 90, 0, 0), '#fff0d8'), tint(place(box(0.95, 0.16, 0.5), 0, 0.08, 0), '#e8d0b0'), place(pixelText('SALT', { s: 0.14, color: SM.rust, glow: 0.1 }), 0, 0.95, 0.18), place(pixelText('MERE', { s: 0.14, color: SM.rust, glow: 0.1 }), 0, 0.73, 0.18), place(pixelText('IV', { s: 0.2, color: SM.iron, glow: 0.1 }), 0, 0.42, 0.18)), M.prop, { pos: STONE, rot: [0, -14, 3] }));
  // a salt cart that lost a wheel to the tide, off the left edge; flotsam
  set.add(node('wreck', oreCart({ load: 0.5, seed: 3, color: SM.royal }), M.prop, { pos: [-6.1, -0.62, -3.6], rot: [8, 34, -19] }));
  set.add(node('flotsam', merge(place(crate({ s: 0.5, seed: 5 }), 0, 0, 0, 12, 20, 8), place(barrel({ r: 0.26, h: 0.62 }), 1.1, 0.05, 0.6, 80, 30, 0)), M.prop, { pos: [6.4, -0.5, 0.2] }));
  // salt on the pans: rows of cones on low banks either side
  const pans = [[-12, -15, 5, 3], [-16, -27, 4, 2], [12.5, -19, 4, 3], [17, -34, 5, 2], [-10, -42, 3, 2], [11, -52, 3, 2]];
  pans.forEach(([x, z, n, rows], k) => { if (low && k > 3) return; const parts = [tint(place(box(n * 2.3 + 1.6, 0.4, rows * 2.4 + 1.2), 0, 0.02, 0), night ? '#a8acf0' : '#ffeed0')]; for (let j = 0; j < rows; j++) for (let i = 0; i < n; i++) parts.push(place(saltHeap({ r: 0.95 + r() * 0.2, h: 1.2 + r() * 0.5, seed: k * 10 + i + j * 3, top: L.road, low: night ? '#8a90e8' : '#c8ccff' }), (i - (n - 1) / 2) * 2.3, 0.2, (j - (rows - 1) / 2) * 2.4)); set.add(node('pan' + k, merge(parts), M.prop, { pos: [x, LOW_TIDE - 0.05, z], rot: [0, (r() - 0.5) * 30, 0] })); });
  for (const [x, z, s, seed] of [[-8.5, -6, 1.5, 3], [9, -9, 1.2, 5], [-7, 3.2, 1.0, 8], [7.6, 3.4, 1.3, 2], [-22, -40, 3, 4]]) set.add(node('rock', rock({ seed, s, low: night ? '#6a70c8' : '#a8a0e0', high: night ? '#a0a4ea' : '#e8dcf4' }), M.prop, { pos: [x, LOW_TIDE - 0.1, z] }));
  scene.root.add(mergeStatic(set, 'set'));

  // ---- Saltmere, at the end of the road
  const TOWN = [0.5, LOW_TIDE - 0.3, -122];
  const town = islandTown({ w: 78, h: 11, seed: 4, lit: night ? 0.35 : 0, lampLit: true });
  const far = group('far', {}, node('town', town, low ? M.farFlat : M.far, { pos: TOWN }));
  scene.root.add(mergeStatic(far, 'far'));
  const townLamp = [TOWN[0] + town.anchors.lamp[0], TOWN[1] + town.anchors.lamp[1], TOWN[2]];

  // salt glinting on the road: one instanced draw
  if (!low) {
    const glint = node('glints', cobble(), M.flat); glint.castShadow = false;
    scatter(glint, 150, () => { const z = 5 - r() * 30, x = roadX(z) + (r() - 0.5) * 2 * (halfAt(z) - 0.5); return { m: m4.trs(x, 0.018, z, 0, r() * 360, 0, 0.1 + r() * 0.14), color: r() < 0.4 ? (night ? '#d8dcff' : '#e4dcff') : '#ffffff' }; });
    scene.root.add(glint);
  }

  // ---- sky: clouds, gulls
  const clouds = cloudBank({ count: low ? 6 : 10, seed: 31, arc: [150, 210], radius: [240, 430], height: [26, 150], size: [0.8, 1.7], speed: 0.05, style: low ? 'painted' : 'solid', ...L.cloud });
  scene.root.add(clouds.node);
  const gulls = node('gulls', gull({}), M.speck); gulls.instances = makeInstances(6); gulls.instances.count = 6; gulls.castShadow = false;
  if (!night) scene.root.add(gulls);

  const actors = group('actors'); scene.root.add(actors);
  const foreground = mergeStatic(group('fg', {}, node('fg-marker', tideMarker({ h: 2.6, seed: 31, band: SM.rust }), M.prop, { pos: [-2.9, -0.2, 3.3] }), node('fg-rock', rock({ seed: 7, s: 0.8, low: '#a8a0e0', high: '#e8dcf4' }), M.prop, { pos: [2.7, -0.05, 3.1] })), 'foreground');
  scene.root.add(foreground);

  // ---- lamps
  const sprites = scene.sprites = createSprites(low ? 128 : 320);
  const lamps = markerTops.slice(0, 5).map((p, i) => ({ name: 'marker' + i, pos: p, color: '#ffc870', radius: 5.5, base: 1.0 }));
  const glows = markerTops.map((p) => ({ sprite: sprites.add({ kind: 'glow', pos: p, size: 1.3, color: '#ffc060', alpha: 0 }), base: 0.6 }));
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: townLamp, size: 12, color: SM.still, alpha: 0 }), base: L.still * 0.55, fixed: true });
  const halo = sprites.add({ kind: 'glow', pos: townLamp, size: 30, color: SM.stillDeep, alpha: 0 });
  env.water.shores = [[-8.5, -6, 1.3, 0.6], [9, -9, 1.1, 0.5], [-7, 3.2, 0.9, 0.5], [7.6, 3.4, 1.1, 0.5], [TOWN[0], TOWN[2], 36, 1.6], [-6.1, -3.6, 0.9, 0.5]];

  let tide = 0.55, tideNow = 0.55, nextRing = 0.4, nextSpark = 0, nextGust = 1;
  const rnd = rng(83), P = [0, 0, 0], V = [0, 0, 0], Q = quat.create(), S3 = [1, 1, 1], Mx = m4.create();
  function setTide(v) { tide = Math.max(0, Math.min(1, v)); }
  function cue(id) {
    if (id === 'ch2.pro.02') { setTide(0.55); return true; }
    if (id === 'ch2.pro.19') { setTide(0.9); return true; }
    return false;
  }
  const TASK = { pos: [0, 0.3, -6], set(v) { setTide(0.4 + 0.6 * v); } };
  const task = (type) => (type === 'tide' ? TASK : null);
  function tick(time, dt, pw, live) {
    tideNow += (tide - tideNow) * Math.min(1, dt * 0.5 + (dt === 0 ? 1 : 0));
    env.water.level = LOW_TIDE + (HIGH_TIDE - LOW_TIDE) * tideNow + Math.sin(time * 0.7) * 0.012;
    halo.alpha = L.still * (0.16 + 0.05 * Math.sin(time * 0.9));
    clouds.update(time);
    for (let i = 0; i < 6; i++) {
      const a = time * (0.2 + i * 0.03) * (i % 2 ? 1 : -1) + i * 1.9, rad = 6 + i * 2.4, cx = -6 + i * 3, cz = -22 - i * 6;
      P[0] = cx + Math.cos(a) * rad; P[1] = 4 + i * 1.3 + Math.sin(time * 0.5 + i) * 0.8; P[2] = cz + Math.sin(a) * rad * 0.6;
      quat.fromEuler(Q, 0, Math.sin(a) * 0.35, Math.cos(a) * 0.3 * (i % 2 ? 1 : -1));
      const flap = Math.sin(time * (5.5 + i * 0.4) + i * 2); S3[0] = 1.8; S3[1] = 1.8 * (0.5 + 1.3 * flap); S3[2] = 1.8; if (Math.abs(S3[1]) < 0.12) S3[1] = 0.12;
      m4.fromTRS(Mx, P, Q, S3); gulls.instances.data.set(Mx, i * 20);
    }
    gulls.instances.dirty = true;
    if (!live) return;
    if (time > nextRing) { nextRing = time + 0.7; const z = 2 - rnd() * 20, sx = rnd() < 0.5 ? -1 : 1; P[0] = roadX(z) + sx * (halfAt(z) + 0.9 + rnd() * 3.5); P[1] = env.water.level + 0.03; P[2] = z; sprites.splash(P, { size: 0.9 + rnd() * 0.7, life: 1.5, spray: 0, color: night ? '#bcd4ff' : '#ffffff' }); }
    if (time > nextSpark) { nextSpark = time + 0.2; const z = 3 - rnd() * 16; P[0] = roadX(z) + (rnd() - 0.5) * 2 * (halfAt(z) - 0.4); P[1] = 0.05; P[2] = z; sprites.sparkle(P, { count: 1, size: 0.22, spread: 0.1, life: 0.7, color: '#ffffff' }); }
    if (!low && time > nextGust) { nextGust = time + 2.6 + rnd() * 1.6; P[0] = -6 + rnd() * 5; P[1] = 1.2 + rnd() * 3; P[2] = -7 + rnd() * 6; V[0] = 2.1; V[1] = 0.05; V[2] = 0.2; sprites.gust(P, { vel: V, size: 1 + rnd() * 0.5, life: 2.2, alpha: 0.85, color: night ? '#c6d6ff' : '#ffffff' }); }
  }

  return shell({
    id: 'causeway', light, L, scene, cameras: CAMERAS, actors, foreground, lamps, glows, tick, house: false,
    marks: { ...stageMarks(), focus: townLamp, road: { pos: [0.4, 0, -4.2], face: 180 }, stone: { pos: [STONE[0] - 0.9, 0, STONE[2] + 0.6], face: -30 } },
    extra: { setTide, cue, task },
  });
}

export const causeway = { id: 'causeway', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default causeway;
