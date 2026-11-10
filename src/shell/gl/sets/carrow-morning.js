// SET: carrow-morning. Carrow, the small island of the ending, in the morning (commons ending): a shingle beach
// falling to the tide, kelp racks, goats, a stone lamp-house with its door open, a table by the door with a bowl
// and bread on it; a woman at the tide line who saw the boat an hour off and has not moved; and the boat coming
// in with the low sun behind it.
// Chapter 8: ch8.epi.12-.27 (he comes home after thirteen years; the Tribune stops at the tide line, having no standing).
// sets/carrow-dusk.js is the same place at dusk (mint ending) and is built by buildCarrow() below.
//
//   import { carrowMorning } from './sets/carrow-morning.js';
//   const set = carrowMorning.build(GL, { light: 'morning', low: false });
//
// Same shape as sets/lantern-stalls.js. Figures face +Z, cameras look toward -Z (the sea), the strip x -3.2..3.2, z 0..1.6 is clear.
//   setBoat(0..1)     morning: 0 = the boat an hour off, 1 = grounded on the shingle (it eases; default 0.72: coming in)
//   setSea(0..1)      dusk: how high the sea stands all round the island (default 1)
//   cue(lineId)       ch8.epi.12 the boat far out; ch8.epi.13 and later, landed
// marks: a, b, c, two, party, opposition, plus focus (morning: the sun on the water; dusk: the lamp in the door),
//        door { pos, face }, table { pos, face } (where he sits to eat), tide { pos, face } (where the Tribune stops), mother { pos, face }

import { m4, quat, rng, DEG } from '../math.js';
import { merge, tint, place, box, cylinder, sphere, ellipsoid, tube, setOutline } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic, makeInstances } from '../scene.js';
import { createSprites } from '../sprites.js';
import { rayMesh, rayMaterial } from '../fx.js';
import { PAL, anchorAt, scatter, boat, house, rock, bush, tree, gull, townsfolk, cloudBank, sack, barrel, flame } from './kit.js';
import { C8, materials8, shell8, cams, marks8, pick8, norm8, dirFrom, seaWall, lampHouse, kelpRack, goat, pebble, beach, drystone, bowlTable, shipLantern } from './kit-ch8.js';

const WATER = -0.72, REACH = 9.3;
const beachY = (z) => { const t = Math.max(0, Math.min(1, (-z - 2.2) / (REACH - 2.2))); return -0.95 * t * t * (3 - 2 * t); };

const LIGHTS = {
  morning: {
    preset: 'day', power: 0.25, dusk: false,
    env: {
      key: { dir: dirFrom(-8, 17), color: '#ffe6ba' },
      shadow: { tint: '#8e8af0', lift: 0.1, saturate: 1.4 },
      ambient: { sky: '#bfe0ff', ground: '#ffd9b0', amount: 0.15 },
      rim: { color: '#fff0b0', amount: 1.2, edge: 0.7 },
      fog: { color: '#ffe6c0', density: 0.0036, start: 18, max: 0.85 },
      sky: { zenith: '#2a78e0', mid: '#7cc4f4', midAt: 0.42, horizon: '#ffe9a8', below: '#ffd9a0', glow: '#fff4c0', glowAmount: 0.85, sunDir: dirFrom(-5, 6.5), sun: { color: '#fffbe6', size: 3.2, halo: '#ffe08a', haloAmount: 0.6 } },
      water: { deep: '#2a8ad8', mid: '#44b8e4', shallow: '#8ee8dc', foam: '#ffffff', glint: '#fff4c0', glintDensity: 0.36 },
    },
    cloud: { color: '#fff2dc', shadowTint: '#e8a8c0' }, sand: '#f8e8c8', wet: '#e6c0b4', grass: '#7fdc5a', grass2: '#5cc86a', smoke: '#fff6ea', ray: 0.26,
  },
  dusk: {
    preset: 'sunset', power: 1.2, dusk: true,
    env: {
      key: { dir: dirFrom(40, 26), color: '#c8a8e8' },
      shadow: { tint: '#5448c4', lift: 0.13, saturate: 1.35 },
      ambient: { sky: '#8a70e4', ground: '#4a3ea8', amount: 0.2 },
      rim: { color: '#ffb880', amount: 0.9, edge: 0.72 },
      fog: { color: '#7a5cc8', density: 0.004, start: 16, max: 0.8 },
      sky: { zenith: '#1a1e84', mid: '#5a44be', midAt: 0.4, horizon: '#f08a8a', below: '#8a5cb8', glow: '#ffb890', glowAmount: 0.6, sunDir: dirFrom(46, -2), sun: { size: 3.0, haloAmount: 0.5 }, stars: 0.5 },
      water: { deep: '#1a2486', mid: '#3a44b4', shallow: '#8a70c8', foam: '#e8c8e8', glint: '#ffb890', glintDensity: 0.2 },
    },
    cloud: { color: '#d880a8', shadowTint: '#5444b4' }, sand: '#d8c0d4', wet: '#a890c8', grass: '#4fa884', grass2: '#3f9080', smoke: '#c8b8e8', ray: 0.5,
  },
};

const CAMERAS = cams({
  wide: { target: [0.2, 1.6, -0.4], dist: 8.4, yaw: 4, pitch: 5, fov: 44 },
  low: { target: [0.3, 1.8, 0.2], dist: 6.4, yaw: -8, pitch: -10, fov: 56 },
});

/** Carrow in either light. carrow-dusk.js calls this with its own id. */
export function buildCarrow(id, lights, { light: lightName, low = false } = {}) {
  const [light, L] = pick8(id, lights, lightName);
  const M = materials8(), r = rng(8505), dusk = L.dusk;
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env; env.sky.sunDir = norm8(env.sky.sunDir);
  env.water.level = WATER;
  const sprites = scene.sprites = createSprites(low ? 160 : 384);

  // ---- the ground: shingle to the tide, turf behind and at the sides
  const ground = group('ground');
  ground.add(node('beach', beach({ w: 60, front: 8, reach: REACH, drop: 0.95, seg: low ? 16 : 26, seed: 2, sand: L.sand, wet: L.wet }), M.ground));
  for (const [x, z, sx, sz, c] of [[-9.5, -1.6, 6.5, 3.4, L.grass], [9.6, -2.4, 6, 3.6, L.grass], [-12, 2.5, 8, 4, L.grass2], [12, 2.6, 8, 4, L.grass2], [5.2, -5.4, 2.6, 1.6, L.grass2]]) ground.add(node('turf', tint(place(ellipsoid(sx, 0.34, sz, low ? 10 : 14, 5), x, -0.1, z), c), M.ground));
  ground.traverse((n) => { n.castShadow = false; });
  scene.root.add(mergeStatic(ground, 'ground'));
  const peb = node('pebbles', pebble(), M.flat); peb.castShadow = false;
  const pebCols = dusk ? ['#f0dcec', '#d8c8ec', '#ffd8d8', '#c8bce4'] : ['#fff6e6', '#f2e2d2', '#ffe2d0', '#e8e2f4', '#fff0dc'];
  scatter(peb, low ? 120 : 240, (i) => {
    const x = (r() - 0.5) * 19, z = 2.6 - r() * 11.2, s = 0.05 + r() * r() * 0.12;
    return { m: m4.trs(x, beachY(z) - s * 0.12, z, 0, r() * 360, 0, s * 1.3, s, s), color: pebCols[Math.floor(r() * pebCols.length)] };
  });
  scene.root.add(peb);

  // ---- the lamp-house, the table by its door, the racks, the wall, the cottage
  const near = group('near'), mid = group('mid');
  const LH = [2.0, -0.04, -4.6], LH_YAW = -30, lh = lampHouse({ r: 1.5, h: 3.2, seed: 3 });
  near.add(node('lamp-house', lh, M.prop, { pos: LH, rot: [0, LH_YAW, 0] }));
  const lhA = (name) => anchorAt(lh, name, LH, LH_YAW), DOOR = lhA('door'), DOOR_LAMP = lhA('doorLamp'), TOP_LAMP = lhA('lamp');
  const TABLE = [0.25, -0.03, -2.85], tb = bowlTable({});
  near.add(node('table', tb, M.prop, { pos: TABLE, rot: [0, -12, 0] }), node('stool', merge(tint(place(cylinder(0.2, 0.22, 0.06, 8), 0, 0.3, 0), C8.wood), tint(place(cylinder(0.05, 0.07, 0.3, 5), 0, 0, 0), C8.woodDark)), M.prop, { pos: [TABLE[0] - 0.75, -0.03, TABLE[2] + 0.15] }));
  near.add(node('rack1', kelpRack({ w: 2.5, h: 1.55, seed: 2, n: low ? 6 : 10 }), M.prop, { pos: [-2.9, -0.06, -3.3], rot: [0, 24, 0] }), node('rack2', kelpRack({ w: 2.2, h: 1.4, seed: 7, n: low ? 5 : 8 }), M.prop, { pos: [-5.0, -0.02, -1.5], rot: [0, 52, 0] }));
  mid.add(node('rack3', kelpRack({ w: 2.4, h: 1.5, seed: 9, n: low ? 5 : 8 }), M.prop, { pos: [5.6, -0.03, -1.9], rot: [0, -40, 0] }));
  mid.add(node('wall', drystone({ len: low ? 3 : 5, h: 0.62, seed: 4 }), M.prop, { pos: [6.6, 0, 0.2], rot: [0, -64, 0] }), node('wall2', drystone({ len: 3, h: 0.55, seed: 8 }), M.prop, { pos: [-6.7, 0, 0.6], rot: [0, 70, 0] }));
  const COT = [-8.2, 0, -3.4], COT_YAW = 40, cot = house({ seed: 6, w: 2.8, d: 2.4, h: 2.0, roofH: 1.5, roof: C8.slate, wall: '#f2ecfa', shutters: C8.teal, floors: 1, lit: dusk ? 0.9 : 0.2, sides: 'none' });
  mid.add(node('cottage', cot, M.prop, { pos: COT, rot: [0, COT_YAW, 0] }));
  for (const [x, z, s, seed] of [[-3.7, -5.9, 1.25, 3], [4.9, -6.6, 1.0, 5], [-6.4, -4.6, 0.8, 8]]) mid.add(node('boulder', rock({ seed, s, low: dusk ? '#8a80c8' : PAL.rock2, high: dusk ? '#b0a4dc' : PAL.rock }), M.prop, { pos: [x, beachY(z) - 0.08, z] }));
  if (!low) mid.add(node('bush', bush({ seed: 3, s: 1.3, color: L.grass2 }), M.prop, { pos: [7.4, 0.1, -3.2] }), node('tree', tree({ seed: 4, h: 2.3, leaf: L.grass, leaf2: L.grass2 }), M.prop, { pos: [-10.4, 0.1, -1.4] }));
  near.add(node('basket', merge(tint(place(cylinder(0.22, 0.28, 0.3, 8), 0, 0, 0), '#e2b070'), tint(place(ellipsoid(0.25, 0.12, 0.25, 8, 4), 0, 0.3, 0), C8.kelpGreen)), M.prop, { pos: [-1.7, -0.03, -2.3] }));
  near.add(node('creel', sack({ seed: 5, s: 0.3 }), M.prop, { pos: [3.7, -0.02, -2.5], rot: [0, 40, 0] }), node('cask', barrel({ r: 0.24, h: 0.56 }), M.prop, { pos: [3.95, -0.03, -3.2] }));
  // the goats: one up on the boulder, one grazing by the racks, a kid at the lamp-house
  const goatAt = (m, p, yaw) => node('goat', m, M.prop, { pos: p, rot: [0, yaw, 0] });
  mid.add(goatAt(goat({ seed: 2 }), [-3.7, beachY(-5.9) + 0.48, -5.9], 120));
  near.add(goatAt(goat({ seed: 5, graze: true, patch: '#8a7a9a' }), [-4.1, -0.03, -0.55], 60), goatAt(goat({ seed: 9, s: 0.7, coat: '#f2d8b8' }), dusk ? [-1.2, -0.03, -2.6] : [0.35, beachY(-5.5), -5.5], dusk ? 70 : 168));
  mid.traverse((n) => { n.castShadow = false; });
  // far: skerries, and the arm of the island
  for (const [x, z, s, seed] of [[-14, -22, 2.4, 3], [11, -30, 3.2, 8], [-26, -44, 4.5, 2], [30, -52, 5, 6]]) { mid.add(node('skerry', rock({ seed, s, low: dusk ? '#5a52b0' : PAL.rock2, high: dusk ? '#8a7ed0' : PAL.rock }), M.prop, { pos: [x, WATER - 0.1, z] })); if (!dusk) env.water.shores.push([x, z, s * 0.6, 0.6]); }
  scene.root.add(mergeStatic(near, 'near'), mergeStatic(mid, 'mid'));
  env.water.shores.push([0, -REACH + 0.6 + 400, 400, 0.9]);

  // ---- her: at the tide line in the morning, in the lamp-house door at dusk with the small lamp
  const MOTHER = dusk ? { pos: [DOOR[0] - 0.1, -0.03, DOOR[2] - 0.05], face: LH_YAW - 10 } : { pos: [-0.95, beachY(-5.2), -5.2], face: 172 };
  const mm = townsfolk({ seed: 4, hold: dusk ? 'lantern' : 'none', coat: '#e86a8a', hair: '#f0e6d6', h: 1.16 });
  const mother = node('mother', mm, M.prop, { pos: MOTHER.pos, rot: [0, MOTHER.face, 0] }); scene.root.add(mother);
  const heldAt = dusk ? anchorAt(mm, 'light', MOTHER.pos, MOTHER.face) : DOOR_LAMP;
  // a lantern on a peg by the door (lit at dusk; in the morning it is only brass)
  const PEG = [DOOR_LAMP[0] - 0.75, 1.75, DOOR_LAMP[2] + 0.2];
  const peg = node('peg-lantern', shipLantern({ s: 1.0, glass: dusk ? '#ffe2a0' : '#d8e8f0' }), M.prop, { pos: PEG }); peg.castShadow = false; peg.glow = dusk ? 1 : 0.15; scene.root.add(peg);

  // ---- the boat: coming in under the sun (morning), or drawn up on the shingle (dusk)
  const boatMesh = boat({ len: 3.3, hull: PAL.cream, keel: C8.teal, pennant: C8.oxblood, seed: 4 });
  const BOAT_FAR = [-0.9, WATER + 0.02, -42], BOAT_IN = [-1.7, WATER + 0.16, -REACH - 1.1], BEACHED = [-6.0, beachY(-6.3) + 0.2, -6.3];
  const boatNode = node('boat', boatMesh, M.prop, { pos: dusk ? BEACHED : BOAT_IN, rot: dusk ? [0, 60, 14] : [0, 8, 0] }); boatNode.castShadow = false; scene.root.add(boatNode);

  // ---- dusk: the sea standing all round, like a wall round a garden
  const seas = [];
  if (dusk) for (const [x, z, yaw, w, seed] of [[0, -44, 0, 190, 2], [-58, -8, 64, 150, 5], [58, -8, -64, 150, 8]]) { const n = node('sea', seaWall({ w, h: 13, seg: low ? 12 : 22, seed, bow: 12, deep: '#1a2288', mid: '#3a48c0', high: '#7a78e4', foam: '#ffd0d8' }), M.sea, { pos: [x, WATER - 0.2, z], rot: [0, yaw, 0] }); seas.push(n); scene.root.add(n); }
  // ---- morning: two slants of low sun down the beach, gulls
  if (!dusk && !low) {
    const kd = env.key.dir, yaw = Math.atan2(kd[0], kd[2]) / DEG, tilt = Math.acos(kd[1]) / DEG, parts = [];
    for (const [x, z, len, w] of [[0.9, 0.6, 11, 1.4], [-1.4, 2.4, 12, 1.0]]) parts.push(place(rayMesh(len, 0.5, w, 10), x + kd[0] * len, kd[1] * len - 0.2, z + kd[2] * len, tilt, yaw, 0));
    scene.root.add(node('sun-shafts', tint(merge(parts), '#ffe2a0'), rayMaterial({ power: 1.3, near: L.ray, far: L.ray * 0.35 })));
  }
  const doorCone = dusk ? node('door-light', tint(place(rayMesh(3.4, 0.2, 1.9, 12), 0, 0, 0), '#ffb860'), rayMaterial({ power: 1.4, near: L.ray, far: 0 }), { pos: [heldAt[0], heldAt[1] + 0.1, heldAt[2]], rot: [58, LH_YAW - 12, 0] }) : null;
  if (doorCone) scene.root.add(doorCone);
  const clouds = cloudBank({ style: low ? 'painted' : 'solid', count: 6, seed: 4, arc: [156, 206], radius: [260, 430], height: [36, 150], size: [0.7, 1.5], speed: 0.05, ...L.cloud });
  scene.root.add(clouds.node);
  const gulls = node('gulls', gull({}), M.speck); gulls.instances = makeInstances(4); gulls.instances.count = 4; if (!dusk) scene.root.add(gulls);

  const fg = group('fg');
  for (const [x, z, s] of [[-2.1, 2.9, 1], [2.3, 3.0, 0.8], [-1.3, 2.5, 0.6]]) fg.add(node('tuft', merge(...[0, 1, 2, 3, 4].map((i) => tint(tube([[(i - 2) * 0.07, 0, 0], [(i - 2) * 0.13, 0.22 * s, 0.02], [(i - 2) * 0.24, 0.42 * s, 0.05]], (t) => 0.03 * (1 - t) + 0.006, 4), i % 2 ? L.grass : L.grass2))), M.prop, { pos: [x, 0, z], rot: [0, x * 50, 0] }));
  fg.add(node('fg-rock', rock({ seed: 12, s: 0.5 }), M.prop, { pos: [1.7, 0.02, 2.8] }));
  const foreground = mergeStatic(fg, 'foreground'); scene.root.add(foreground);
  const actors = group('actors'); scene.root.add(actors);

  // ---- lamps
  const SUN_SPOT = [BOAT_IN[0], WATER + 1.4, -REACH - 4];
  const lamps = dusk ? [
    { name: 'door', pos: [heldAt[0], heldAt[1], heldAt[2]], color: '#ffb458', radius: 8.5, base: 1.4, flicker: 0.1 },
    { name: 'peg', pos: [PEG[0], PEG[1] - 0.42, PEG[2]], color: '#ffc470', radius: 4.6, base: 1.0 },
    { name: 'lamp-house', pos: TOP_LAMP, color: '#ffd080', radius: 6, base: 0.9 },
    { name: 'cottage', pos: [COT[0] + 1.6, 1.2, COT[2] + 1.6], color: '#ffb060', radius: 4.5, base: 0.9 },
    { name: 'sea', pos: [0, 2.4, 3.2], color: '#a89cf0', radius: 6, base: 0.4, flicker: 0, fixed: true },
  ] : [
    { name: 'sun-on-sand', pos: [0, 1.6, -3.4], color: '#fff0c0', radius: 7, base: 0.5, flicker: 0, fixed: true },
    { name: 'door', pos: [DOOR_LAMP[0], DOOR_LAMP[1], DOOR_LAMP[2] + 0.3], color: '#ffb860', radius: 3.6, base: 1.0 },
  ];
  const glows = [];
  if (dusk) {
    glows.push({ sprite: sprites.add({ kind: 'glow', pos: lamps[0].pos, size: 2.2, color: '#ffa040', alpha: 0 }), base: 0.7, lamp: 0 }, { sprite: sprites.add({ kind: 'glow', pos: lamps[1].pos, size: 1.3, color: '#ffb450', alpha: 0 }), base: 0.55, lamp: 1 });
    glows.push({ sprite: sprites.add({ kind: 'glow', pos: TOP_LAMP, size: 2.6, color: '#ffd080', alpha: 0 }), base: 0.6, lamp: 2 });
    anchorAt(cot, 'windows', COT, COT_YAW).forEach((p) => glows.push({ sprite: sprites.add({ kind: 'glow', pos: p, size: 1.2, color: '#ffc060', alpha: 0 }), base: 0.45, fixed: true }));
  } else glows.push({ sprite: sprites.add({ kind: 'glow', pos: SUN_SPOT, size: 9, color: '#ffe9a0', alpha: 0 }), base: 0.34, fixed: true });
  const chimney = anchorAt(cot, 'chimney', COT, COT_YAW);

  let boatGoal = 0.72, boatNow = 0.72, sea = 1, seaNow = 1;
  const setBoat = (v) => { boatGoal = Math.max(0, Math.min(1, v)); }, setSea = (v) => { sea = Math.max(0, Math.min(1, v)); };
  // The woman on the beach is set dressing for the lines before she speaks (ch8.epi.12, ch8.mepi.19: seen from the boat).
  // From her first line the cast's Tamsin is on the stage, so the dressing figure goes: one mother, not two.
  const cue = (lineId) => {
    const m = /^ch8\.(m?)epi\.(\d+)/.exec(String(lineId)); if (!m) return false;
    const n = Number(m[2]), mint = m[1] === 'm';
    if (mint !== dusk) return false;
    mother.visible = n < (mint ? 20 : 13);
    if (!dusk) setBoat(n <= 12 ? 0.3 : 1);
    return true;
  };
  const P = [0, 0, 0], V = [0, 0, 0], Q = quat.create(), S3 = [1, 1, 1], Mx = m4.create(), rnd = rng(61);
  let nextPuff = 0, nextRing = 0.4, nextGlint = 0, nextGust = 1.4;
  function tick(time, dt, pw, live) {
    const e = dt === 0 ? 1 : 0;
    boatNow += (boatGoal - boatNow) * Math.min(1, dt * 0.25 + e); seaNow += (sea - seaNow) * Math.min(1, dt * 0.4 + e);
    clouds.update(time);
    if (!dusk) {
      const u = boatNow * boatNow * (3 - 2 * boatNow), ground = Math.max(0, (boatNow - 0.9) * 10);
      boatNode.setPos(BOAT_FAR[0] + (BOAT_IN[0] - BOAT_FAR[0]) * u, BOAT_IN[1] + Math.sin(time * 1.3) * 0.05 * (1 - ground), BOAT_FAR[2] + (BOAT_IN[2] - BOAT_FAR[2]) * u);
      boatNode.setRot(Math.sin(time * 1.1) * 2.5 * (1 - ground), 8 + Math.sin(time * 0.3) * 3, Math.sin(time * 1.6 + 1) * 4 * (1 - ground) + ground * 9);
      for (let i = 0; i < 4; i++) {
        const a = time * (0.24 + i * 0.03) * (i % 2 ? 1 : -1) + i * 1.9, rad = 6 + i * 2.2;
        P[0] = -3 + i * 3 + Math.cos(a) * rad; P[1] = 4.5 + i * 1.2 + Math.sin(time * 0.5 + i) * 0.8; P[2] = -20 - i * 5 + Math.sin(a) * rad * 0.6;
        quat.fromEuler(Q, 0, Math.sin(a) * 0.35, Math.cos(a) * 0.3 * (i % 2 ? 1 : -1));
        const flap = Math.sin(time * (5.5 + i * 0.4) + i * 2); S3[0] = 1.8; S3[1] = 1.8 * (0.5 + 1.3 * flap); S3[2] = 1.8; if (Math.abs(S3[1]) < 0.12) S3[1] = 0.12;
        m4.fromTRS(Mx, P, Q, S3); gulls.instances.data.set(Mx, i * 20);
      }
      gulls.instances.dirty = true;
    } else {
      for (let i = 0; i < seas.length; i++) seas[i].setScale(1, Math.max(0.02, seaNow * (1 + 0.03 * Math.sin(time * 0.45 + i * 2))), 1);
      doorCone.visible = pw > 0.1;
    }
    mother.setRot(0, MOTHER.face + Math.sin(time * 0.4) * 2, Math.sin(time * 0.9) * 1.2);
    if (live) {
      if (time > nextPuff) { nextPuff = time + 0.6; sprites.puff(chimney, { count: 1, size: 0.42, rise: 0.6, spread: 0.1, life: 3.2, color: L.smoke }); }
      if (time > nextRing) { nextRing = time + 0.8; P[0] = -9 + rnd() * 18; P[1] = WATER + 0.03; P[2] = -REACH - 0.3 - rnd() * rnd() * 7; sprites.splash(P, { size: 1.1 + rnd() * 0.9, life: 1.6, spray: 0, color: dusk ? '#e8c8e8' : '#ffffff' }); }
      if (!dusk && time > nextGlint) { nextGlint = time + 0.14; P[0] = SUN_SPOT[0] + (rnd() - 0.5) * 9; P[1] = WATER + 0.1; P[2] = -REACH - 2 - rnd() * 34; sprites.sparkle(P, { count: 1, size: 0.5 + rnd() * 0.4, spread: 0.3, life: 0.9, color: '#fff8d0' }); }
      if (time > nextGust) { nextGust = time + 3 + rnd() * 1.5; P[0] = -4 + rnd() * 3; P[1] = 2.2 + rnd() * 2.4; P[2] = -6 + rnd() * 5; V[0] = 1.6; V[1] = 0.1; V[2] = 0.3; sprites.gust(P, { vel: V, size: 0.9 + rnd() * 0.5, life: 2.4, alpha: 0.8, color: dusk ? '#d8c8f8' : '#ffffff' }); }
    }
  }

  return shell8({
    id, light, L, low, scene, cameras: CAMERAS, actors, foreground, lamps, glows, tick,
    motes: low ? null : dusk ? { box: [-1, 3, 0.4, 2.6, -4, 0], every: 0.4, color: '#ffc870', size: 0.08, vel: [-0.06, 0.12, 0.05], life: 4.5, alpha: 0.85 } : { box: [-4, 4, 0.3, 3, -5, 1.5], every: 0.35, color: '#fff6d0', size: 0.07, vel: [0.1, 0.06, 0.08], life: 5, alpha: 0.6 },
    marks: {
      ...marks8(), focus: dusk ? [heldAt[0], heldAt[1], heldAt[2]] : SUN_SPOT,
      door: { pos: [DOOR[0], 0, DOOR[2] + 0.2], face: LH_YAW }, table: { pos: [TABLE[0] - 0.75, 0, TABLE[2] + 0.15], face: 80 }, tide: { pos: [-2.3, beachY(-7.4), -7.4], face: 20 }, mother: MOTHER,
    },
    extra: { setBoat, setSea, cue },
  });
}

const MORNING = { morning: LIGHTS.morning };
export const CARROW_LIGHTS = LIGHTS;
export const carrowMorning = { id: 'carrow-morning', lights: Object.keys(MORNING), cameras: Object.keys(CAMERAS), build: (engine, opts) => buildCarrow('carrow-morning', MORNING, opts) };
export default carrowMorning;
