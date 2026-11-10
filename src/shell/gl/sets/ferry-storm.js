// SET: ferry-storm. The deck of the Tallis ferry, six hours out of Halcyon Reach, when the Orm light goes out a week
// ahead of its notice and the lane closes round her: the flat water gone in eleven minutes, the sea standing up over
// the rail, rain, the storm lantern swinging on its hook, the hatch cover that will float, and the one boat.
// Chapter 4 prologue (ch4.pro.02-17).
//
//   import { ferryStorm } from './sets/ferry-storm.js';
//   const set = ferryStorm.build(GL, { light: 'storm', low: false });     // 'storm' (default) | 'calm'
//
// The shape is lantern-stalls' (see ../index.js). The deck strip x -4.4..4.4, z -0.2..1.6 is clear; the rail runs along
// z = -2.6. The deck, everything on it and set.actors roll and heave together; the horizon stays where it is.
// One build covers both lights: 'calm' and 'storm' only choose where setStorm starts.
//   setStorm(0..1)        0 the lane is open (flat pale water, the Orm light burning, a path of light to it),
//                         1 the Churn: swells over the rail, rain, lightning, the deck rolling. Sky, fog and water blend.
//   setOrm(0..1)          the Orm light (setStorm does not touch it: the light goes first, then the sea)
//   setBoat(on)           the ship's boat in its davits (false: the crew have cut it loose)
//   cue(lineId)           ch4.pro.02 / 04 / 07 / 14 / 17
//   marks.focus           the storm lantern;  marks.stern, marks.bow: forty feet apart along the rail;  marks.hatch
//   setPower(p)           the storm lantern and the deckhouse porthole
// low: true drops the far swells, half the rain, the boat's davits and deck clutter, and paints the clouds.

import * as GL0 from '../index.js';
import {
  m4, quat, rng, DEG, rgb, merge, tint, place, box, cylinder, sphere, tube, curve, setGlow, setOutline, roundedBox, extrude, lathe,
  node, group, makeEnv, createScene, mergeStatic, createSprites, rayMesh, rayMaterial, lerpEnv,
} from '../index.js';
import { PAL, kitMaterials, anchorAt, pickLight, barrel, sack, crate, ropeCoil, cloudBank, boat, lighthouse, planks, railing, lifeRing, bollard, bunting } from './kit.js';
import { C4, crag, hoodedLantern, hatchCover, seaSwells, rainField, c4Shell, cams, MARKS4, norm3, dirFrom } from './kit-ch4.js';

const WATER = -1.2, RAIL_Z = -2.6, HALF = 5.8;

const ENVS = {
  calm: {
    preset: 'sunset',
    env: {
      key: { dir: norm3([-0.5, 0.5, 0.7]), color: '#ffe6c8' },
      shadow: { tint: '#7a72dc', lift: 0.12, saturate: 1.35 },
      ambient: { sky: '#e0b8e8', ground: '#8a7ad8', amount: 0.2 },
      rim: { color: '#ffe0a8', amount: 1.0, edge: 0.72 },
      fog: { color: '#d8b0e0', density: 0.004, start: 18, max: 0.86 },
      sky: { zenith: '#5a68d8', mid: '#b494e4', midAt: 0.4, horizon: '#ffd9a0', below: '#e0a8c8', glow: '#fff0b0', glowAmount: 0.6, sunDir: dirFrom(7, 6), moon: 0, stars: 0, sun: { color: '#fff6dc', size: 2.6, halo: '#ffc870', haloAmount: 0.5 } },
      water: { deep: '#4a5ccc', mid: '#8a9cec', shallow: '#ffd4c4', foam: '#fffaf0', glint: '#fff0c0', glintDensity: 0.3, drift: [0.1, 0.4] },
    },
  },
  storm: {
    preset: 'sunset',
    env: {
      key: { dir: norm3([-0.5, 0.5, 0.7]), color: '#93a4f4' },
      shadow: { tint: '#232c9a', lift: 0.14, saturate: 1.35 },
      ambient: { sky: '#4f7ae0', ground: '#2f3a9a', amount: 0.22 },
      rim: { color: '#b8e4ff', amount: 1.0, edge: 0.7 },
      fog: { color: '#2a44b0', density: 0.0075, start: 14, max: 0.9 },
      sky: { zenith: '#0a1058', mid: '#1c2490', midAt: 0.5, horizon: '#3a7ccc', below: '#1c3aa4', glow: '#7fd0e8', glowAmount: 0.3, sunDir: dirFrom(7, 6), moon: 0, stars: 0, sun: { color: '#3f8ad4', size: 0.1, halo: '#3f8ad4', haloAmount: 0.0 } },
      water: { deep: '#0c1a72', mid: '#1b48b4', shallow: '#3fb4cc', foam: '#f4fbff', glint: '#bfe8ff', glintDensity: 0.12, drift: [0.9, 0.6] },
    },
  },
};
const LIGHTS = { storm: { start: 1, power: 1.15 }, calm: { start: 0.06, power: 0.8 } };

const CAMERAS = cams({ low: { target: [0.1, 1.8, 0.2], dist: 6.2, yaw: -7, pitch: -11, fov: 56 } });

function build(engine = GL0, { light, low = false } = {}) {
  const picked = pickLight('ferry-storm', LIGHTS, light), L = picked.L; light = picked.name;
  const M = kitMaterials(), r = rng(4004);

  // ---- the deck and what is bolted to it (all of this rolls)
  const deck = group('deck'), fixed = group('deck-fixed'), flat = group('deck-flat');
  flat.add(node('boards', planks({ w: HALF * 2, d: 9.6, plank: 0.36, thick: 0.1, seed: 5, along: 'z', colors: ['#d9a878', '#e6b888', '#c8946a'] }), M.ground, { pos: [0, 0, RAIL_Z + 4.6] }));
  flat.add(node('waterway', tint(place(box(HALF * 2 + 0.3, 0.14, 0.36), 0, -0.03, RAIL_Z - 0.05), PAL.cream), M.ground), node('hull', tint(place(box(HALF * 2 + 0.36, 1.6, 0.3), 0, -0.9, RAIL_Z - 0.2), '#fff6e0'), M.ground), node('band', tint(place(box(HALF * 2 + 0.4, 0.22, 0.34), 0, -0.36, RAIL_Z - 0.2), PAL.teal), M.ground));
  flat.traverse((n) => { n.castShadow = false; });
  fixed.add(node('rail', railing({ len: HALF * 2, h: 0.7, bay: 0.9, color: PAL.cream, post: '#fff6e0', cap: PAL.wood2 }), M.prop, { pos: [0, 0, RAIL_Z] }), node('ring', lifeRing({ r: 0.25 }), M.prop, { pos: [2.9, 0.42, RAIL_Z + 0.1] }));
  // the lantern post: an iron crook bolted to the rail
  const POST = [-1.45, 0, RAIL_Z + 0.2], PH = 3.05, HOOK = [POST[0] + 0.62, PH - 0.05, POST[2]];
  fixed.add(node('post', merge(tint(tube(curve([[POST[0], 0, POST[2]], [POST[0] + 0.03, PH * 0.6, POST[2]], [POST[0] - 0.02, PH, POST[2]], [POST[0] + 0.3, PH + 0.22, POST[2]], HOOK], 14), (t) => 0.075 - 0.035 * t, 7, { crease: 180 }), PAL.iron), tint(place(lathe([[0, 0], [0.2, 0], [0.2, 0.08], [0.1, 0.18], [0, 0.18]], 9, { crease: 50 }), POST[0], 0, POST[2]), PAL.iron)), M.prop));
  // the forward hatch: coamings, and its cover knocked askew (the one that will float)
  const HATCH = [2.25, 0, -1.45];
  fixed.add(node('coaming', merge(tint(place(roundedBox(1.7, 0.3, 1.5, 0.04, 1), 0, 0.15, 0), PAL.teal), tint(place(box(1.4, 0.05, 1.2), 0, 0.3, 0), '#27336e')), M.prop, { pos: HATCH, rot: [0, -6, 0] }), node('cover', hatchCover({ s: 1.5, seed: 3 }), M.prop, { pos: [HATCH[0] - 0.55, 0.3, HATCH[2] + 0.5], rot: [16, 22, -11] }));
  // the deckhouse aft (left), its door banging, one porthole lit
  fixed.add(node('house', merge(tint(place(roundedBox(1.8, 2.6, 5.4, 0.1, 2), 0, 1.3, 0), '#fff6e0'), tint(place(roundedBox(2.1, 0.18, 5.8, 0.06, 1), 0, 2.68, 0), PAL.coral), tint(place(cylinder(0.26, 0.26, 0.06, 12), 0.9, 1.6, -1.2, 0, 0, -90), PAL.navy), setGlow(tint(place(cylinder(0.19, 0.19, 0.07, 12), 0.9, 1.6, -1.2, 0, 0, -90), PAL.glass), 0.9), tint(place(box(0.07, 1.8, 0.85), 0.92, 0.92, 0.7, 0, 14, 0), PAL.teal)), M.prop, { pos: [-HALF - 0.6, 0, 0.9] }));
  const PORT = [-HALF + 0.4, 1.6, -0.3];
  fixed.add(node('capstan', merge(tint(lathe([[0, 0], [0.34, 0], [0.34, 0.08], [0.2, 0.16], [0.17, 0.5], [0.27, 0.6], [0.27, 0.72], [0, 0.74]], 12, { crease: 50 }), PAL.woodDark), tint(place(GL0.torus(0.2, 0.03, 12, 5), 0, 0.3, 0), PAL.gold)), M.prop, { pos: [-3.6, 0, -1.6] }), node('cleat', bollard({ s: 0.8, color: PAL.woodDark }), M.prop, { pos: [0.6, 0, RAIL_Z + 0.42] }));
  if (!low) fixed.add(node('lashed', merge(barrel({ r: 0.27, h: 0.64, color: '#c8643e' }), place(barrel({ r: 0.25, h: 0.6 }), 0.56, 0, 0.1), tint(place(GL0.torus(0.5, 0.02, 12, 4), 0.28, 0.4, 0.05, 90, 0, 0, 1.2, 0.8, 1), PAL.rope)), M.prop, { pos: [4.4, 0, -1.9] }), node('coil', ropeCoil({ r: 0.28 }), M.prop, { pos: [-2.6, 0, -1.9] }), node('crate', crate({ s: 0.5, seed: 6, color: PAL.wood2 }), M.prop, { pos: [-4.5, 0, -0.9], rot: [0, 20, 0] }));
  // rigging overhead: two stays and a hoist of signal flags, so there is something for the rain to fall through
  fixed.add(node('stays', merge(tint(tube([[-3.4, 7.4, 2.6], [HALF - 0.2, 0.75, RAIL_Z]], 0.018, 4, { crease: 180 }), PAL.rope), tint(tube([[2.6, 7.6, 2.8], [-HALF + 0.3, 0.75, RAIL_Z]], 0.018, 4, { crease: 180 }), PAL.rope)), M.prop), node('hoist', bunting([-3.2, 7.0, 2.5], [HOOK[0] - 0.62, PH + 0.05, POST[2]], { sag: 0.5, count: 9, size: 0.3, seed: 4, colors: [PAL.coral, PAL.yellow, PAL.teal, PAL.cream, PAL.pink] }), M.prop));
  // the davits on the starboard quarter (the boat itself is its own node: it goes)
  const DAV = [HALF + 0.9, 0.55, 0.3];
  if (!low) for (const z of [-0.8, 1.4]) fixed.add(node('davit', tint(tube(curve([[HALF - 0.1, 0, z], [HALF - 0.1, 1.9, z], [HALF + 0.35, 2.3, z], [HALF + 0.9, 2.05, z]], 10), 0.05, 6, { crease: 180 }), PAL.iron), M.prop));
  deck.add(mergeStatic(flat, 'deck-flat'), mergeStatic(fixed, 'deck-fixed'));
  const shipBoat = node('ship-boat', boat({ len: 3.1, hull: PAL.cream, keel: PAL.coral, mast: false, seed: 4 }), M.prop, { pos: DAV, rot: [0, 4, 0] }); shipBoat.castShadow = false; deck.add(shipBoat);

  // ---- the Orm light on its rock, far out along the lane
  const far = group('far'), ORM = [9.5, WATER, -96];
  far.add(node('orm-rock', crag({ w: 20, h: 6.5, d: 11, seed: 7, low: '#3a3cb0', high: '#7a7ae8', cap: '#5fc4b0', capAt: 0.7, seg: 10, rings: 6 }), M.farFlat, { pos: ORM }));
  const lh = lighthouse({ h: 10, r: 1.7, colors: [PAL.cream, '#5b7fe8'], cap: '#5b7fe8', lit: true }), LH = [ORM[0] - 1.5, WATER + 4.9, ORM[2]];
  far.add(node('orm-light', lh, M.farFlat, { pos: LH }));
  if (!low) for (const [x, z, w, h, seed] of [[-24, -70, 6, 4, 3], [30, -120, 9, 5, 5]]) far.add(node('skerry', crag({ w, h, d: w * 0.7, seed, low: '#2a2c98', high: '#5a5ad0' }), M.farFlat, { pos: [x, WATER, z] }));

  const A = makeEnv(ENVS.calm.preset, ENVS.calm.env), Bv = makeEnv(ENVS.storm.preset, ENVS.storm.env);
  const scene = createScene(makeEnv(ENVS.storm.preset, ENVS.storm.env)), env = scene.env;
  for (const e of [A, Bv, env]) { e.sky.sunDir = norm3(e.sky.sunDir); e.water.level = WATER; }
  env.water.shores = A.water.shores = Bv.water.shores = [[ORM[0], ORM[2], 9, 1.2]];
  scene.root.add(deck, mergeStatic(far, 'far'));
  const foreground = group('foreground');
  foreground.add(node('fg1', ropeCoil({ r: 0.26 }), M.prop, { pos: [1.9, 0, 2.9] }), node('fg2', sack({ seed: 4, s: 0.28 }), M.prop, { pos: [-2.2, 0, 2.8], rot: [0, -30, 0] }));
  deck.add(foreground);

  const sprites = scene.sprites = createSprites(448);
  // ---- the sea, and the weather
  const swells = seaSwells({ rows: [{ z: RAIL_Z - 3.2, n: 3, span: 15, size: 1.45, speed: 1.1 }, { z: -11.5, n: 4, span: 26, size: 2.5, speed: 0.9 }, { z: -20, n: 4, span: 44, size: 4.0, speed: 0.75 }, ...(low ? [] : [{ z: -36, n: 5, span: 80, size: 6.5, speed: 0.6 }])], material: M.ground, level: WATER, seed: 6, colors: { deep: '#14228a', mid: '#2458c8', lit: '#49d0d8', foam: '#f6fcff' } });
  scene.root.add(swells.node);
  const rain = rainField({ count: low ? 60 : 130, area: [18, 9, 6.5], at: [0, 4, -3.2], material: M.speck, wind: [-4.2, -13, 1.0], seed: 2 });
  scene.root.add(rain.node);
  const clouds = cloudBank({ style: low ? 'painted' : 'solid', count: 14, seed: 17, arc: [146, 214], radius: [220, 380], height: [30, 210], size: [1.3, 2.4], speed: 0.16, color: '#6a70d8', shadowTint: '#1c2484' });
  scene.root.add(clouds.node);

  // the storm lantern, swinging on its hook
  const lanternMesh = hoodedLantern({ s: 1.7, hood: 0 });
  const lantern = node('lantern', lanternMesh, M.lantern, { pos: HOOK }); lantern.castShadow = false; lantern.tint.set([1, 0.8, 0.4, 1]); deck.add(lantern);
  const lampLen = -lanternMesh.anchors.lamp[1], LAMP = [HOOK[0], HOOK[1] - lampLen, HOOK[2]];
  const lampGlow = sprites.add({ kind: 'glow', pos: LAMP, size: 2.4, color: '#ffa848', alpha: 0 }), portGlow = sprites.add({ kind: 'glow', pos: PORT, size: 1.3, color: '#ffc060', alpha: 0 });
  const cone = node('lamp-cone', tint(rayMesh(2.7, 0.14, 2.0, 14), '#ffb050'), rayMaterial({ power: 1.5, near: 0.4, far: 0 }), { pos: HOOK }); deck.add(cone);
  const pennant = node('pennant', tint(extrude([[0, 0], [0.9, 0.08], [0.86, 0.3], [0, 0.4]], 0.016, { crease: 30 }), PAL.coral), M.prop, { pos: [HALF - 0.3, 2.0, RAIL_Z] }); pennant.castShadow = false; deck.add(pennant);
  deck.add(node('staff', tint(place(cylinder(0.04, 0.03, 2.5, 6), HALF - 0.3, 0, RAIL_Z), PAL.woodDark), M.prop));
  // the Orm light and the lane it lays: a path of flat bright water out to the rock
  const ormLamp = anchorAt(lh, 'lamp', LH), ormGlow = sprites.add({ kind: 'glow', pos: ormLamp, size: 16, color: '#fff0b0', alpha: 0 }), ormCore = sprites.add({ kind: 'glow', pos: ormLamp, size: 5, color: '#ffffff', alpha: 0 });
  const lane = []; for (let i = 0; i < 8; i++) { const t = (i + 0.5) / 8, z = RAIL_Z - 4 + (ORM[2] + 8 - RAIL_Z + 4) * t * t; lane.push(sprites.add({ kind: 'glow', pos: [1 + (ORM[0] - 2.5) * t * t, WATER + 0.15, z], size: [5 + 16 * t, 0.7 + 1.6 * t], color: '#fff2c8', alpha: 0 })); }
  const flash = sprites.add({ kind: 'glow', pos: [-30, 30, -200], size: 150, color: '#bfe0ff', alpha: 0 });
  const actors = group('actors'); deck.add(actors);

  const lamps = [
    { name: 'storm-lantern', pos: [LAMP[0], LAMP[1], LAMP[2] + 0.3], color: '#ffb058', radius: 7.5, base: 2.6 },
    { name: 'porthole', pos: [PORT[0] + 0.4, PORT[1], PORT[2]], color: '#ffc870', radius: 3.4, base: 1.2 },
    { name: 'lightning', pos: [0, 5, -3], color: '#cfe4ff', radius: 16, base: 0, own: true, steady: true },
  ];

  let storm = L.start, stormNow = L.start, orm = L.start > 0.5 ? 0 : 1, ormNow = orm, hasBoat = true, lastT = -1, nextSpray = 1, nextBolt = 2.5, bolt = 0, nextGust = 0.5, nextDrip = 0;
  const P = [0, 0, 0], V = [0, 0, 0], rnd = rng(23);
  const setStorm = (v) => { storm = Math.max(0, Math.min(1, v)); }, setOrm = (v) => { orm = Math.max(0, Math.min(1, v)); }, setBoat = (on) => { hasBoat = !!on; };
  const CUES = { 'ch4.pro.02': () => { setStorm(0.06); setOrm(1); setBoat(true); stormNow = 0.06; ormNow = 1; }, 'ch4.pro.04': () => { setOrm(0); setStorm(0.45); }, 'ch4.pro.07': () => setStorm(1), 'ch4.pro.14': () => { setStorm(1); setOrm(0); }, 'ch4.pro.17': () => setBoat(false) };
  const cue = (id) => { const f = CUES[id]; if (f) f(); return !!f; };
  const BLEND = ['key', 'ambient', 'rim', 'fog', 'sky', 'water'];

  function update(time, dt, pw) {
    stormNow += (storm - stormNow) * Math.min(1, dt * 0.22 + (dt === 0 ? 1 : 0)); // it took eleven minutes: here, about ten seconds
    ormNow += (orm - ormNow) * Math.min(1, dt * 1.2 + (dt === 0 ? 1 : 0));
    const s = stormNow;
    for (let i = 0; i < BLEND.length; i++) lerpEnv(env[BLEND[i]], A[BLEND[i]], Bv[BLEND[i]], s);
    // the deck rolls and heaves; the horizon does not
    const roll = (Math.sin(time * 0.9) * 0.8 + Math.sin(time * 0.37) * 0.4) * (0.5 + 2.6 * s), pitch = Math.sin(time * 0.7 + 1) * (0.2 + 0.9 * s);
    deck.setRot(pitch, 0, roll); deck.position[1] = Math.sin(time * 0.7 + 1) * 0.07 * s;
    // the lantern swings the other way, harder as it blows
    const sw = -roll * 2.2 + Math.sin(time * 2.1) * (3 + 15 * s), fl = 0.9 + 0.1 * Math.sin(time * 12.1) * Math.sin(time * 7.3), on = Math.min(1.4, pw);
    lantern.setRot(Math.sin(time * 1.7 + 1) * (2 + 7 * s), 0, sw); cone.setRot(0, 0, sw); cone.material.beam.near = 0.42 * on * fl; cone.visible = pw > 0.05;
    const a = sw * DEG; lamps[0].pos[0] = LAMP[0] + Math.sin(a) * lampLen; lamps[0].pos[1] = HOOK[1] - Math.cos(a) * lampLen;
    lampGlow.pos[0] = lamps[0].pos[0]; lampGlow.pos[1] = lamps[0].pos[1]; lampGlow.alpha = 0.72 * on * fl; portGlow.alpha = 0.5 * on;
    lantern.tint[0] = 0.55 + 0.45 * Math.min(1, on); lantern.tint[1] = 0.5 + 0.3 * Math.min(1, on); lantern.tint[2] = 0.55 - 0.15 * Math.min(1, on);
    pennant.setRot(Math.sin(time * 9) * (4 + 10 * s), -70 - 20 * s + Math.sin(time * 6.3) * (6 + 14 * s), Math.sin(time * 11) * (3 + 9 * s));
    shipBoat.visible = hasBoat; if (hasBoat) shipBoat.setRot(Math.sin(time * 1.3) * 4 * s, 4, -roll * 1.5);
    swells.update(time, 0.02 + 0.98 * s); rain.update(time, dt, Math.max(0, (s - 0.25) / 0.6)); clouds.update(time);
    clouds.material && (clouds.node.visible = true);
    // the Orm light, and the lane lying flat under it
    const lit = ormNow * (0.9 + 0.1 * Math.sin(time * 3.1)); ormGlow.alpha = 0.85 * lit; ormCore.alpha = lit;
    for (let i = 0; i < lane.length; i++) lane[i].alpha = 0.34 * Math.max(0, ormNow * (1 - s * 1.4) - i * 0.02) * (0.85 + 0.15 * Math.sin(time * 1.3 + i));
    // lightning
    bolt = Math.max(0, bolt - dt * 5); flash.alpha = bolt * 0.5; lamps[2].base = bolt * 2.2;
    if (lastT >= 0 && time - lastT < 0.5 && dt > 0) {
      if (s > 0.55 && time > nextBolt) { nextBolt = time + 3.5 + rnd() * 5; bolt = 1; flash.pos[0] = -70 + rnd() * 140; P[0] = flash.pos[0] * 0.6; P[1] = 46; P[2] = -150; V[0] = 0; V[1] = 0; V[2] = 0; sprites.spawn({ kind: 'bolt', pos: P, vel: V, size: 46, life: 0.28, color: '#eaf6ff', alpha: 1, rot: 1.35 + rnd() * 0.4, aspect: 0.12 }); }
      if (time > nextSpray) { // a sea comes aboard over the rail
        nextSpray = time + 0.5 + (1 - s) * 6 + rnd() * 1.4;
        if (s > 0.2) { P[0] = -4.5 + rnd() * 9; P[1] = 0.5; P[2] = RAIL_Z - 0.2; sprites.puff(P, { count: 5 + Math.round(6 * s), size: 0.26 + 0.14 * s, rise: 1.8 + 1.6 * s, spread: 1.5, life: 0.9, color: '#eaf6ff' }); P[1] = 0.05; P[2] = RAIL_Z + 0.8; sprites.splash(P, { size: 1.6, life: 0.9, spray: 6, color: '#ffffff' }); }
      }
      if (time > nextGust) { nextGust = time + 0.5 + (1 - s) * 2.5 + rnd(); P[0] = 4 - rnd() * 6; P[1] = 1.2 + rnd() * 3.6; P[2] = -4 + rnd() * 5; V[0] = -3.2 - 3 * s; V[1] = 0.1; V[2] = 0.5; sprites.gust(P, { vel: V, size: 1.0 + rnd() * 0.8, life: 1.5, alpha: 0.75, color: '#dcebff' }); }
      if (s > 0.4 && time > nextDrip) { nextDrip = time + 0.09; P[0] = -4.8 + rnd() * 9.6; P[1] = 0.03; P[2] = RAIL_Z + 0.5 + rnd() * 4.6; sprites.spawn({ kind: 'ring', pos: P, size: 0.08, endSize: 0.5, life: 0.5, color: '#cfe6ff' }); }
      sprites.update(dt);
    }
    lastT = time;
  }

  return c4Shell({
    id: 'ferry-storm', light, low, scene, actors, foreground, cameras: CAMERAS, lamps, lampPower: L.power, update,
    marks: { ...MARKS4, focus: LAMP, stern: { pos: [-4.3, 0, 0.3], face: 60 }, bow: { pos: [4.3, 0, 0.3], face: -60 }, hatch: { pos: [1.5, 0, -0.3], face: 20 }, rail: { pos: [-0.3, 0, RAIL_Z + 0.6], face: 180 } },
    extra: { setStorm, setOrm, setBoat, cue },
  });
}

export const ferryStorm = { id: 'ferry-storm', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default ferryStorm;
