// SET: cutter-deck. The deck of the Audit cutter lying across the roads at dusk: holystoned planks, a black bulwark
// with one white strake, the mast and the mainsail furled on its boom, the single search lamp on its bracket with
// its hard road of light out over the water, and Kedge on the horizon putting its lamps on.
// Chapter 6: ch6.s4 (Sable and Ren; the ration table; "I hit a lantern. I was told a lantern").
//
//   import { cutterDeck } from './sets/cutter-deck.js';
//   const set = cutterDeck.build(GL, { light: 'dusk', low: false });
//
// The shape is lantern-stalls' (see ../index.js). Figures face +Z; cameras look toward -Z, across the deck and over
// the rail to Kedge. The stage strip x -3.2..3.2, z 0..1.6 is clear. The rail runs along z = -2.9; the mast stands
// at (-2.5, -1.7); the bow is toward -X.
// Added here:
//   sweep()         the search lamp goes once round the roads (about nine seconds) and comes back to its bearing
//   setLamp(deg)    hold the lamp on a bearing (0 = straight out over the rail, + = toward the stern)
//   cue(lineId)     ch6.s4.c14: sweep()
//   task('search-lamp')  ch6.s4: v 0 the lamp turned inboard on the bow (it dazzles), v 1 trained out over the roads;
//                   Kedge's lamps come on with v. setback(): one sweep across the deck (also passLamp)
//   marks.rail { pos, face } (a place at the rail, looking at Kedge), marks.focus (the search lamp)
// low: true drops the far hulls, half the town's lights, the shore's outline, the gulls and the deck clutter.

import { m4, quat, rng, DEG, rgb } from '../math.js';
import { merge, tint, place, plane, box, cylinder, lathe, torus, extrude, setGlow, setOutline, fromArrays, sphere } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic, makeInstances } from '../scene.js';
import { createSprites } from '../sprites.js';
import { rayMesh, rayMaterial } from '../fx.js';
import { PAL, anchorAt, pickLight, planks, railing, lifeRing, ropeCoil, townBank, headland, cloudBank, gull, crate } from './kit.js';
import { K6, ch6Materials, shell, STD_MARKS, STD_CAMERAS, taskUnit, dirFrom, norm3, mastRig, searchLamp, gantry, hulk, mole, lampHouse, cask, bar, oar } from './kit-ch6.js';

const WATER = -2.2, RAIL_Z = -2.9, HALF = 9.5;

const LIGHTS = {
  dusk: {
    preset: 'sunset', power: 1,
    env: {
      key: { dir: dirFrom(-52, 30), color: '#ffcfb0' },                           // the last of the day, from over the bow
      shadow: { tint: '#5f58d4', lift: 0.12, saturate: 1.45 },
      ambient: { sky: '#b48cf0', ground: '#5a54cc', amount: 0.22 },
      rim: { color: '#ffd9a0', amount: 1.0, edge: 0.72 },
      fog: { color: '#c88ad0', density: 0.0034, start: 22, max: 0.82 },
      sky: { zenith: '#2a3cb8', mid: '#8a6ae0', midAt: 0.38, horizon: '#ff9a70', below: '#d87aa8', glow: '#ffc880', glowAmount: 0.5, sunDir: dirFrom(-24, -1.5), stars: 0.5, sun: { color: '#ffe0b0', size: 3, halo: '#ff9a60', haloAmount: 0.6 } },
      water: { deep: '#2a3cb0', mid: '#6058d8', shallow: '#f08aa8', foam: '#ffe6f0', glint: '#ffc890', glintDensity: 0.3, drift: [0.2, 0.1] },
    },
    cloud: { color: '#ff9ab0', shadowTint: '#7a58d0' },
  },
};

const CAMERAS = STD_CAMERAS({
  wide: { target: [0.05, 1.85, -0.4], dist: 8.4, yaw: 3, pitch: 3.5, fov: 45, shadowCenter: [0, 0, -1], shadowRadius: 8 },
  low: { target: [-0.2, 2.1, 0.0], dist: 6.4, yaw: 9, pitch: -13, fov: 56 },
  stage: { target: [0, 1.05, 0.4], dist: 9.4, yaw: -13, pitch: 7, fov: 24 },
});

function build(engine = null, { light, low = false } = {}) {
  const picked = pickLight('cutter-deck', LIGHTS, light), L = picked.L; light = picked.name;
  const M = ch6Materials(), r = rng(6565), FAR = low ? M.farFlat : M.far;

  // ---- the deck, the bulwark and its rail
  const ground = group('ground'), near = group('near');
  ground.add(node('deck', planks({ w: HALF * 2, d: 9.4, plank: 0.44, thick: 0.1, seed: 4, along: 'x', gap: 0, colors: ['#f6dcae', '#eecf9c', '#fbe4ba', '#e9c892'] }), M.flat, { pos: [0, 0, RAIL_Z + 4.7 - 0.25] }));
  ground.add(node('waterway', tint(place(box(HALF * 2 + 0.3, 0.12, 0.34), 0, 0.0, RAIL_Z + 0.06), K6.coral), M.ground));
  ground.traverse((n) => { n.castShadow = false; });
  near.add(node('bulwark', merge(tint(place(box(HALF * 2 + 0.3, 0.52, 0.16), 0, 0.3, RAIL_Z - 0.06), '#f4f1ff'), tint(place(box(HALF * 2 + 0.32, 0.12, 0.18), 0, 0.2, RAIL_Z - 0.06), K6.teal)), M.prop));
  near.add(node('rail', railing({ len: HALF * 2, h: 0.42, bay: 0.74, color: '#ffffff', post: K6.audit, cap: K6.brass }), M.prop, { pos: [0, 0.56, RAIL_Z - 0.06] }));
  near.add(node('ring', lifeRing({ r: 0.25, band: K6.audit }), M.prop, { pos: [3.3, 0.5, RAIL_Z + 0.08] }));
  // ---- mast, boom, furled sail, shrouds down to the far rail
  const MAST = [-1.95, 0, -1.7], RIG_S = 1.22;
  const rig = mastRig({ h: 9.2, boom: 5.6, beam: 2.3 / RIG_S * 2 * 0.52, sides: [1], ratlines: 7 });
  near.add(node('rig', rig, M.prop, { pos: MAST, scale: RIG_S, rot: [0, 180, 0] }));   // the boom runs aft, toward -X, clear of the view of Kedge
  // the lamp's bracket on the mast
  const LAMP = [MAST[0] + 0.55, 4.25, MAST[2] + 0.1];
  near.add(node('bracket', merge(bar([MAST[0], 4.2, MAST[2]], [LAMP[0], 3.55, LAMP[2]], 0.05, K6.iron, 5), bar([MAST[0], 3.4, MAST[2]], [LAMP[0], 3.55, LAMP[2]], 0.04, K6.iron, 5), tint(place(cylinder(0.14, 0.14, 0.08, 10), LAMP[0], 3.5, LAMP[2]), K6.iron)), M.prop));
  // ---- what a deck keeps: the skylight over the cabin (lit from below), the binnacle, a capstan, the Audit's sealed chest
  const SKY = [3.4, 0, -1.55];
  const skyl = merge(tint(place(box(1.9, 0.34, 1.2), 0, 0.17, 0), K6.audit), tint(place(box(2.0, 0.07, 1.3), 0, 0.36, 0), '#ffffff'));
  const panes = [];
  for (const sz of [-1, 1]) { panes.push(setGlow(tint(place(box(1.7, 0.03, 0.62), 0, 0.56, sz * 0.27, sz * 28, 0, 0), '#ffc468'), 0.95)); for (let i = -2; i <= 2; i++) panes.push(tint(place(box(0.05, 0.05, 0.66), i * 0.42, 0.57, sz * 0.27, sz * 28, 0, 0), K6.brass)); }
  near.add(node('skylight', merge(skyl, ...panes, tint(place(box(1.9, 0.07, 0.08), 0, 0.72, 0), K6.brass)), M.prop, { pos: SKY, rot: [0, -6, 0] }));
  near.add(node('binnacle', merge(tint(lathe([[0, 0], [0.24, 0], [0.2, 0.1], [0.15, 0.8], [0.22, 0.86], [0.22, 0.94], [0, 0.94]], 10, { crease: 50 }), K6.timberRed), tint(place(sphere(0.2, 10, 7), 0, 0.98, 0), K6.brass), setGlow(tint(place(cylinder(0.07, 0.07, 0.03, 8), 0, 1.0, 0.185, 90, 0, 0), '#ffe6a0'), 1)), M.prop, { pos: [5.6, 0, -1.2], rot: [0, -20, 0] }));
  near.add(node('capstan', merge(tint(lathe([[0, 0], [0.36, 0], [0.36, 0.08], [0.2, 0.16], [0.17, 0.52], [0.28, 0.62], [0.28, 0.74], [0, 0.76]], 12, { crease: 50 }), K6.timberDark), tint(place(torus(0.2, 0.03, 12, 5), 0, 0.3, 0), K6.brass)), M.prop, { pos: [-5.3, 0, -1.3] }));
  const chest = merge(tint(place(box(0.95, 0.5, 0.6), 0, 0.25, 0), K6.audit), tint(place(box(1.0, 0.12, 0.65), 0, 0.56, 0), K6.audit), tint(place(box(1.02, 0.05, 0.1), 0, 0.3, 0.27), '#ffffff'), tint(place(cylinder(0.11, 0.11, 0.04, 10), 0, 0.4, 0.31, 90, 0, 0), K6.coral), tint(place(box(0.08, 0.62, 0.66), -0.34, 0.31, 0), K6.brass), tint(place(box(0.08, 0.62, 0.66), 0.34, 0.31, 0), K6.brass));
  near.add(node('chest', chest, M.prop, { pos: [1.2, 0, -2.15], rot: [0, 8, 0] }));
  near.add(node('coil', ropeCoil({ r: 0.3, turns: 4 }), M.prop, { pos: [-0.6, 0, -2.3] }), node('coil2', ropeCoil({ r: 0.26, turns: 3, color: K6.rope2 }), M.prop, { pos: [-4.1, 0, -2.2] }));
  if (!low) near.add(node('oars', merge(place(oar({ len: 2.3 }), 0, 0, 0, 0, 0, 74), place(oar({ len: 2.3 }), 0.16, 0, 0.05, 0, 0, 70)), M.prop, { pos: [2.3, 0.6, RAIL_Z + 0.2] }), node('cask', cask({ r: 0.27, h: 0.66 }), M.prop, { pos: [6.4, 0, -2.2] }), node('crate', crate({ s: 0.5, seed: 3, color: K6.timber2 }), M.prop, { pos: [-6.3, 0, -2.1], rot: [0, 12, 0] }));
  // the falls of the boat he rowed out in, made fast at the rail
  near.add(node('falls', merge(bar([2.0, 0.98, RAIL_Z], [2.05, -1.2, RAIL_Z - 0.7], 0.02, K6.rope, 3), bar([2.6, 0.98, RAIL_Z], [2.6, -1.2, RAIL_Z - 0.7], 0.02, K6.rope, 3)), M.prop, { castShadow: false }));

  // ---- Kedge on the horizon: the mole and its cranes, the lamp-house, the town putting its lamps on, hulls between
  const far = group('far'), KZ = -95;
  far.add(node('mole', mole({ len: 90, h: 2.4, d: 5 }), FAR, { pos: [6, WATER, KZ] }));
  const cabs = [];
  [[-22, 15, K6.coral, 20], [-9, 17, K6.teal, -15], [4, 14, K6.yellow, 28], [30, 16, K6.coral, 190]].forEach(([x, h, col, yaw], i) => { const g = gantry({ h, reach: h * 0.78, seed: i + 3, color: col, detail: 0, load: !low }), pos = [x, WATER + 2.4, KZ]; far.add(node('crane' + i, g, FAR, { pos, rot: [0, yaw, 0] })); cabs.push(anchorAt(g, 'lamp', pos, yaw)); });
  const LH = [17, WATER + 2.4, KZ + 0.5];
  const lh = lampHouse({ h: 20, r: 4.4, flame: 'white', seg: 12 });
  far.add(node('lamp-house', lh, FAR, { pos: LH }));
  const LH_LAMP = anchorAt(lh, 'lamp', LH);
  const TOWN = [-18, WATER, KZ - 26];
  const town = townBank({ w: 80, d: 20, h: 15, rows: 4, seed: 7, lit: low ? 0.4 : 0.85 });
  far.add(node('town', town, FAR, { pos: TOWN, rot: [0, 6, 0] }));
  far.add(node('shore', headland({ w: 110, d: 30, h: 13, seed: 5, grass: '#7a6cd8', cliff: '#c89ad8', foot: '#a878c8', ...(low ? { seg: 20, rings: 8 } : { seg: 30, rings: 12 }) }), FAR, { pos: [70, WATER - 0.2, KZ - 50], rot: [0, 176, 0] }));
  const hullLights = [];
  if (!low) [[-16, -40, 10, 170], [9, -52, 9, 200], [-4, -66, 11, 160], [22, -44, 9, 185], [-28, -62, 10, 210], [34, -70, 9, 150]].forEach(([x, z, len, yaw], i) => { const h = hulk({ len, hull: [K6.cream, K6.salt, '#ffd9c0'][i % 3], boot: [K6.coral, K6.teal, K6.royal][i % 3], roof: [K6.teal, K6.coral, K6.yellow][i % 3], seed: i + 2, seg: 8, rings: 5 }); far.add(node('hull' + i, h, FAR, { pos: [x, WATER, z], rot: [0, yaw, 0] })); hullLights.push(anchorAt(h, 'lamp', [x, WATER, z], yaw)); });

  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  env.sky.sunDir = norm3(env.sky.sunDir);
  env.water.level = WATER; env.water.shores = [];
  scene.root.add(mergeStatic(ground, 'ground'), mergeStatic(near, 'near'), mergeStatic(far, 'far'));

  const sprites = scene.sprites = createSprites(low ? 192 : 384);

  // ---- the search lamp: its own node, turning; a hard beam and its road on the water
  const lampYaw = group('lamp-yaw', { pos: LAMP });
  const lampMesh = searchLamp({ s: 1.25 });
  const lampNode = node('search-lamp', lampMesh, M.prop, { rot: [8, 180, 0] }); lampNode.castShadow = false;
  lampYaw.add(lampNode);
  // the beam: a cone lying along -Z, dipping to the water
  const beam = node('beam', place(tint(rayMesh(46, 0.3, 3.4, 16), '#fff6d8'), 0, 0, -0.4, 82, 0, 0), rayMaterial({ power: 1.1, near: 0.5, far: 0.04 }));
  const road = node('road', setOutline(tint(fromArrays([-0.5, 0, 0, 0.5, 0, 0, -4.5, 0, -1, 4.5, 0, -1], [0, 2, 3, 0, 3, 1], [0, 0, 1, 0, 0, 1, 1, 1], 180), '#fff0c8'), 0), M.shaft, { pos: [0, WATER + 0.05 - LAMP[1], -20], scale: [1, 1, 52] });
  lampYaw.add(beam, road);
  scene.root.add(lampYaw);
  const lensGlow = sprites.add({ kind: 'glow', pos: [LAMP[0], LAMP[1], LAMP[2] - 0.4], size: 2.6, color: '#fff6d0', alpha: 0.7 });
  const lensStar = sprites.add({ kind: 'sparkle', pos: [LAMP[0], LAMP[1], LAMP[2] - 0.4], size: 2.2, color: '#ffffff', alpha: 0.9 });

  // ---- the Audit's pennant at the yard: black, one white bar
  const YARD = [MAST[0] - rig.anchors.yard[0] * RIG_S, rig.anchors.yard[1] * RIG_S, MAST[2]];
  const pennant = node('pennant', merge(tint(extrude([[0, 0], [1.5, 0.12], [1.5, 0.3], [0, 0.46]], 0.018, { crease: 30 }), K6.audit), tint(extrude([[0.02, 0.17], [1.5, 0.19], [1.5, 0.24], [0.02, 0.29]], 0.024, { crease: 30 }), '#ffffff')), M.prop, { pos: [YARD[0], YARD[1] - 0.5, YARD[2]] }); pennant.castShadow = false;
  scene.root.add(pennant);

  // ---- lights
  const lamps = [
    { name: 'search-spill', pos: [LAMP[0] + 0.6, LAMP[1] - 0.6, LAMP[2] + 1.4], color: '#fff0c8', radius: 9.5, base: 1.5, flicker: 0.02 },
    { name: 'skylight', pos: [SKY[0] - 0.2, 1.3, SKY[2] + 0.6], color: '#ffb458', radius: 5.6, base: 1.6 },
    { name: 'binnacle', pos: [5.4, 1.2, -0.8], color: '#ffc870', radius: 3.4, base: 1.0 },
  ];
  const glows = [
    { sprite: sprites.add({ kind: 'glow', pos: [SKY[0], 0.7, SKY[2]], size: 2.6, color: '#ffa848', alpha: 0 }), base: 0.5 },
    { sprite: sprites.add({ kind: 'glow', pos: LH_LAMP, size: 30, color: '#fff2c0', alpha: 0 }), base: 0.5, fixed: true },
  ];
  const lhStar = sprites.add({ kind: 'sparkle', pos: LH_LAMP, size: 14, color: '#ffffff', alpha: 0.9 });
  const twinkles = [];
  const wins = anchorAt(town, 'windows', TOWN, 6);
  for (let i = 0; i < Math.min(wins.length, low ? 10 : 26); i++) twinkles.push({ s: sprites.add({ kind: 'glow', pos: wins[i * Math.max(1, Math.floor(wins.length / (low ? 10 : 26)))] || wins[i], size: 3.2, color: ['#ffc860', '#ffb04a', '#ffdf8a'][i % 3], alpha: 0 }), on: 2 + r() * 26, ph: r() * 6.28 });
  for (const p of [...cabs, ...hullLights]) twinkles.push({ s: sprites.add({ kind: 'glow', pos: p, size: 2.4, color: '#ffe2a0', alpha: 0 }), on: r() * 8, ph: r() * 6.28 });

  const clouds = cloudBank({ style: low ? 'painted' : 'solid', count: 8, seed: 29, arc: [150, 212], radius: [250, 430], height: [16, 120], size: [0.7, 1.5], speed: 0.05, ...L.cloud });
  scene.root.add(clouds.node);
  const GULLS = low ? 0 : 4;
  const gulls = node('gulls', gull({}), M.speck); gulls.instances = makeInstances(4); gulls.instances.count = GULLS;
  if (GULLS) scene.root.add(gulls);

  const fg = group('fg');
  fg.add(node('fg1', ropeCoil({ r: 0.3, turns: 4 }), M.prop, { pos: [1.9, 0, 2.9] }), node('fg2', tint(place(box(0.5, 0.3, 0.2), 0, 0.15, 0), K6.timberDark), M.prop, { pos: [-2.1, 0, 2.9], rot: [0, 16, 0] }));
  const foreground = mergeStatic(fg, 'foreground'); scene.root.add(foreground);
  const actors = group('actors'); scene.root.add(actors);

  // ---- per frame
  let bearing = 14, hold = 14, sweepT = -1, clock = 0;
  const P = [0, 0, 0], V = [0, 0, 0], S3 = [1, 1, 1], Q = quat.create(), Mx = m4.create(), rnd = rng(83);
  let nextRing = 0.6, nextGust = 1.5, nextGlint = 0;
  function sweep() { sweepT = 0; }
  function setLamp(deg) { hold = deg; }
  // the live stage's task (ch6.s4, the row out): the search lamp starts turned inboard on whoever is coming over the bow
  // and is trained back out over the roads as the objective goes; Kedge puts its lamps on with it, not with the clock
  let rowed = false, auto = true;
  const CLOCK_FULL = twinkles.reduce((m, t) => Math.max(m, t.on), 0) + 1.2;
  const rowUnit = taskUnit({
    pos: LAMP, stand: null,
    apply(v, fresh) { if (fresh) { sweepT = -1; rowed = true; auto = false; } hold = 150 - 136 * v; clock = CLOCK_FULL * v; },
  });
  const task = (type) => (type === 'search-lamp' ? rowUnit.arm() : null);
  /** The drain: the lamp goes once round, across the deck. */
  function setback() { if (sweepT < 0) sweep(); }
  function cue(lineId) {
    if (lineId === 'ch6.s4.c14') { sweep(); return true; }
    if (lineId === 'ch6.s4.c01') { auto = true; hold = 14; if (!rowed) { clock = 0; sweepT = -1; } rowed = false; return true; }   // after the encounter the town is already lit: it is not put out again
    return false;
  }
  function tick(time, dt, pw, live) {
    if (auto) clock += dt;
    // the lamp: it looks slowly about its bearing; a sweep takes it once round and back
    let yaw = hold + Math.sin(time * 0.23) * 9;
    if (sweepT >= 0) { sweepT += dt; const u = sweepT / 9; if (u >= 1) sweepT = -1; else yaw += 360 * (u * u * (3 - 2 * u)); }
    bearing = yaw;
    lampYaw.setRot(0, -bearing, 0);
    const c = Math.cos(bearing * DEG), s = Math.sin(bearing * DEG), toward = Math.cos((bearing % 360) * DEG);   // toward > 0: looking out over the rail
    lensGlow.pos[0] = lensStar.pos[0] = LAMP[0] + s * 0.45; lensGlow.pos[2] = lensStar.pos[2] = LAMP[2] - c * 0.45;
    const face = Math.max(0, -toward);                                              // when it comes round inboard it dazzles
    lensGlow.alpha = 0.5 + 0.5 * face; lensGlow.size[0] = lensGlow.size[1] = 2.2 + 5 * face; lensStar.size[0] = lensStar.size[1] = 1.8 + 7 * face; lensStar.rot = time * 0.2;
    env.points[0].intensity *= 0.8 + 1.3 * face;
    road.visible = toward > 0.2;
    pennant.setRot(Math.sin(time * 2.4) * 5, -8 + Math.sin(time * 1.4) * 12, -4 + Math.sin(time * 3.2) * 6);
    lhStar.alpha = 0.75 + 0.2 * Math.sin(time * 2); lhStar.rot = time * 0.07;
    for (let i = 0; i < twinkles.length; i++) { const t = twinkles[i], k = Math.max(0, Math.min(1, (clock - t.on) / 1.2)); t.s.alpha = 0.55 * k * (0.85 + 0.15 * Math.sin(time * 3 + t.ph)); }   // the town puts its lamps on, one by one
    clouds.update(time);
    for (let i = 0; i < GULLS; i++) {
      const a = time * (0.22 + i * 0.03) * (i % 2 ? 1 : -1) + i * 1.9, rad = 7 + i * 2.4, cx = 2 + i * 3, cz = -24 - i * 6;
      P[0] = cx + Math.cos(a) * rad; P[1] = 4.5 + i * 1.2 + Math.sin(time * 0.5 + i) * 0.8; P[2] = cz + Math.sin(a) * rad * 0.6;
      quat.fromEuler(Q, 0, Math.sin(a) * 0.35, Math.cos(a) * 0.3 * (i % 2 ? 1 : -1));
      const flap = Math.sin(time * (5.5 + i * 0.4) + i * 2); S3[0] = 1.9; S3[1] = 1.9 * (0.5 + 1.3 * flap); S3[2] = 1.9;
      if (Math.abs(S3[1]) < 0.12) S3[1] = 0.12;
      m4.fromTRS(Mx, P, Q, S3); gulls.instances.data.set(Mx, i * 20);
    }
    gulls.instances.dirty = true;
    if (live) {
      if (time > nextRing) { nextRing = time + 1.3; P[0] = -8 + rnd() * 16; P[1] = WATER + 0.03; P[2] = RAIL_Z - 2.5 - rnd() * 8; sprites.splash(P, { size: 1 + rnd() * 0.7, life: 1.6, spray: 0, color: '#ffe6f0' }); }
      if (!low && time > nextGust) { nextGust = time + 2.6 + rnd() * 1.6; P[0] = -5 + rnd() * 4; P[1] = 2.4 + rnd() * 3; P[2] = -4 + rnd() * 4; V[0] = 2.0; V[1] = 0.1; V[2] = 0.2; sprites.gust(P, { vel: V, size: 0.9 + rnd() * 0.5, life: 2.2, alpha: 0.8, color: '#ffe6f0' }); }
      if (toward > 0.2 && time > nextGlint) { nextGlint = time + 0.12; const d = 8 + rnd() * 40; P[0] = LAMP[0] + s * d + (rnd() - 0.5) * d * 0.12; P[1] = WATER + 0.1; P[2] = LAMP[2] - c * d; V[0] = 0; V[1] = 0.02; V[2] = 0; sprites.spawn({ kind: 'sparkle', pos: P, vel: V, size: 0.4 + rnd() * 0.6, life: 0.8, color: '#fff6d0' }); }
    }
  }

  return shell({
    id: 'cutter-deck', light, L, low, scene, cameras: CAMERAS, actors, foreground, lamps, glows, tick, cue,
    marks: { ...STD_MARKS(), rail: { pos: [0.6, 0, RAIL_Z + 0.6], face: 180 }, focus: LAMP },
    extra: { sweep, setLamp, task, setback, passLamp: setback },
  });
}

export const cutterDeck = { id: 'cutter-deck', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default cutterDeck;
