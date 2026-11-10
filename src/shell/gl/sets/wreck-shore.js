// SET: wreck-shore. The shingle beach under Little Brand where the Churn put three people ashore: a breakwater of
// rough blocks with the island coming down it carrying a rope, the hatch cover they floated in on, a spar, a cask,
// weed; above, a hill with no light on it and the island's lamp capped; out to the left the sea and, an hour off, dawn.
// Chapter 4: prologue (pro.19-20), s1 (the rescue; Wyn), and the barks of s2.
//
//   import { wreckShore } from './sets/wreck-shore.js';
//   const set = wreckShore.build(GL, { light: 'predawn', low: false });     // 'predawn' (default) | 'day'
//
// The shape is lantern-stalls' (see ../index.js). Stage strip x -3.2..3.2, z 0..1.6 is clear shingle; the breakwater
// runs along z = -4.3 from x = -1.2 out to the right, the sea is to the left and behind it. Added here:
//   setRescue(0..1)       how many of the eleven are on the breakwater (they come one by one)
//   setSurf(0..1)         how hard the sea is still running
//   cue(lineId)           ch4.pro.19 / pro.20, ch4.s1.b01 / c01 / c24 / c25
//   marks.focus           the rescuers' hooded lantern;  marks.surf: at the water's edge, left;  marks.steps: the foot of
//                         the breakwater steps;  marks.cover: beside the hatch cover
//   setPower(p)           the lantern on its pole and the pool it makes on the shingle
// low: true drops the hill's houses, half the shingle and the far swells, and paints the clouds.

import * as GL0 from '../index.js';
import {
  m4, quat, rng, DEG, rgb, merge, tint, place, plane, box, cylinder, sphere, tube, curve, setGlow, setOutline, roundedBox, deform, gradientY,
  node, group, makeEnv, createScene, mergeStatic, createSprites, rayMesh, rayMaterial, makeInstances,
} from '../index.js';
import { PAL, kitMaterials, anchorAt, pickLight, scatter, barrel, sack, crate, ropeCoil, cloudBank, headland, cobble, crowd, steps, gull, brazier, rock } from './kit.js';
import { C4, crag, stoneHut, cappedLamp, hoodedLantern, hatchCover, spar, kelp, blanketRoll, breakwater, seaSwells, netPole, c4Shell, cams, MARKS4, norm3, dirFrom } from './kit-ch4.js';

const WATER = -0.34, BW_Z = -4.3, BW_H = 1.6, BW_X0 = -0.3;

const LIGHTS = {
  predawn: {
    preset: 'sunset', power: 1, surf: 0.55,
    env: {
      key: { dir: dirFrom(-52, 15), color: '#ffb0c0' },                   // the dawn, an hour off, low on the left
      shadow: { tint: '#3a3cb0', lift: 0.15, saturate: 1.4 },
      ambient: { sky: '#6a78e8', ground: '#4a3ea8', amount: 0.24 },
      rim: { color: '#ffc0b0', amount: 1.2, edge: 0.68 },
      fog: { color: '#5a58c8', density: 0.0042, start: 16, max: 0.84 },
      sky: { zenith: '#101c7c', mid: '#3a3cb8', midAt: 0.38, horizon: '#ff8f9a', below: '#c86ab0', glow: '#ffc890', glowAmount: 0.8, sunDir: dirFrom(-16, -1.5), stars: 0.6, sun: { color: '#ffe0b0', size: 2.4, halo: '#ff9a70', haloAmount: 0.8 } },
      water: { deep: '#1a2890', mid: '#3a4cc8', shallow: '#c878c0', foam: '#fff0f0', glint: '#ffc8c0', glintDensity: 0.3, drift: [0.5, 0.25] },
    },
    cloud: { color: '#ff9ab0', shadowTint: '#5a48b8' }, shingle: 0.92, hill: ['#5a4cc8', '#9a6cd8', '#4a3ea8'],
  },
  day: {
    preset: 'day', power: 0, surf: 0.3,
    env: {
      key: { dir: norm3([-0.55, 0.66, 0.5]), color: '#fff4e0' },
      shadow: { tint: '#7f86e8', lift: 0.1, saturate: 1.35 },
      ambient: { sky: '#c8e4ff', ground: '#c8b8f0', amount: 0.16 },
      fog: { color: '#d8e8ff', density: 0.0036, start: 18, max: 0.85 },
      sky: { zenith: '#2a6ee0', mid: '#6fb8f4', midAt: 0.4, horizon: '#e8f4ff', below: '#a8dcf0', sunDir: dirFrom(-150, 50) },
      water: { deep: '#1d6ed0', mid: '#2ba8e0', shallow: '#7fe8dc', drift: [0.5, 0.25] },
    },
    cloud: { color: '#ffffff', shadowTint: '#b8c4f8' }, shingle: 0.8, hill: ['#5fd0a0', '#c8c0f0', '#8a80d8'],
  },
};

const CAMERAS = cams({ wide: { target: [0.0, 1.55, -0.4], dist: 8.2, yaw: 4, pitch: 5 } });

function build(engine = GL0, { light, low = false } = {}) {
  const picked = pickLight('wreck-shore', LIGHTS, light), L = picked.L; light = picked.name;
  const M = kitMaterials(), r = rng(4004), dark = light === 'predawn', FAR = low ? M.farFlat : M.far;

  const near = group('near'), ground = group('ground');
  // ---- the beach: it falls away to the left and toward the camera's left corner
  const slope = (x, z) => Math.min(0, -(Math.max(0, -x - 4.2 - z * 0.12)) * 0.16);
  ground.add(node('beach', tint(deform(plane(60, 26, 20, 6), (p) => { p[2] -= 3; p[1] = slope(p[0], p[2]) - (p[2] < BW_Z - 1.2 ? 1.2 : 0); }, 180), dark ? '#b8aee8' : '#e2c8a4'), M.ground));
  ground.traverse((n) => { n.castShadow = false; });

  // ---- the breakwater, its round head, steps down to the shingle, an iron beacon nobody lights
  const bwLen = 17, bw = breakwater({ len: bwLen, h: BW_H, w: 2.3, seed: 4 }), BW = [BW_X0 + bwLen / 2, 0, BW_Z];
  near.add(node('breakwater', bw, M.prop, { pos: BW }));
  for (const [dx, dz, w, h, seed] of [[-0.5, 0.1, 1.5, 1.05, 3], [-1.5, -0.3, 1.3, 0.6, 5], [-0.7, 1.0, 1.1, 0.5, 7], [-2.3, 0.4, 1.0, 0.3, 9]]) near.add(node('tumble', crag({ w, h, d: w * 0.9, seed, low: C4.stoneDark, high: C4.stone, cap: C4.kelp, capAt: 0.75, lumps: 0.5 }), M.prop, { pos: [BW_X0 + dx, -0.25, BW_Z + dz] }));
  const beacon = brazier({ h: 1.1, r: 0.3 }); // cold: the coals are grey
  { const C = beacon.colors, G = beacon.glow; for (let i = 0; i < G.length; i++) if (G[i] > 0) { G[i] = 0; C[i * 3] = 0.42; C[i * 3 + 1] = 0.44; C[i * 3 + 2] = 0.7; } }
  near.add(node('beacon', beacon, M.prop, { pos: [BW_X0 + 0.55, BW_H + 0.08, BW_Z - 0.1] }));
  near.add(node('steps', place(steps({ w: 1.5, n: 5, rise: BW_H / 5, run: 0.36, color: C4.stone, color2: '#d6cdf2' }), 0, 0, 0, 0, 180, 0), M.prop, { pos: [2.9, BW_H, BW_Z + 1.15] }));
  // the long rope, made fast to a ring on the breakwater and run down the shingle
  near.add(node('rope', tint(tube(curve([[1.0, BW_H + 0.12, BW_Z + 0.6], [0.9, 0.9, BW_Z + 1.5], [0.4, 0.04, -2.0], [-1.0, 0.04, -1.2], [-2.3, 0.04, -1.9], [-3.6, 0.03, -0.9]], 20), 0.03, 5, { crease: 180 }), PAL.rope), M.prop), node('ring', tint(place(GL0.torus(0.13, 0.03, 8, 4), 1.0, BW_H + 0.14, BW_Z + 0.75, 20, 0, 0), PAL.iron), M.prop));
  // ---- what came ashore with them
  near.add(node('hatch', hatchCover({ s: 1.3, seed: 2 }), M.prop, { pos: [-1.3, 0.34, -2.3], rot: [-40, 18, -6] }), node('hatch-rock', crag({ w: 1.5, h: 0.7, d: 0.9, seed: 21, low: dark ? '#4a48b8' : '#9a90e0', high: dark ? '#8f8cf0' : '#d8d0f8' }), M.prop, { pos: [-1.3, 0, -2.85] }), node('spar', spar({ len: 3.4 }), M.prop, { pos: [-3.7, 0.0, -2.9], rot: [0, 24, 0] }), node('cask', barrel({ r: 0.27, h: 0.62, color: '#c8643e' }), M.prop, { pos: [-2.7, 0.26, -1.5], rot: [86, 30, 0] }));
  near.add(node('weed1', kelp({ s: 0.9, seed: 2 }), M.flat, { pos: [-1.1, 0.01, -1.0] }), node('weed2', kelp({ s: 0.7, seed: 5 }), M.flat, { pos: [1.3, 0.01, -2.3] }), node('weed3', kelp({ s: 1.0, seed: 8 }), M.flat, { pos: [-3.4, 0.01, 0.6] }), node('weed4', kelp({ s: 0.7, seed: 11 }), M.flat, { pos: [3.6, 0.01, 0.9] }));
  // ---- what the island brought down: blankets (the dry ones), a hooded lantern on a pole, a creel, a stretcher of oars
  const POLE = [1.55, 0, -2.55], poleMesh = netPole({ h: 2.35, arm: 0.5, seed: 5 });
  near.add(node('pole', poleMesh, M.prop, { pos: POLE }));
  const HOOK = anchorAt(poleMesh, 'armL', POLE);
  near.add(node('blankets', merge(blanketRoll({ color: PAL.coral }), place(blanketRoll({ color: PAL.yellow, stripe: PAL.teal }), 0.05, 0, 0.32), place(blanketRoll({ color: PAL.teal, stripe: PAL.cream, len: 0.5 }), 0.04, 0.26, 0.16, 0, 14, 0)), M.prop, { pos: [2.5, 0, -1.6], rot: [0, -30, 0] }), node('basket', merge(tint(cylinder(0.26, 0.32, 0.36, 9), '#d9a05a'), tint(place(GL0.torus(0.32, 0.03, 9, 4), 0, 0.36, 0, 90, 0, 0), '#8a5a4a'), tint(place(box(0.4, 0.1, 0.3), 0, 0.36, 0), PAL.cream)), M.prop, { pos: [3.2, 0, -2.3] }));
  for (const [x, z, s, seed] of [[-5.4, -2.2, 1.3, 3], [4.6, -0.8, 0.9, 6], [-4.6, 1.9, 0.8, 9], [5.4, 1.6, 1.1, 12]]) near.add(node('boulder', crag({ w: s * 1.5, h: s * 0.8, d: s * 1.1, seed, low: dark ? '#4a48b8' : '#9a90e0', high: dark ? '#8f8cf0' : '#d8d0f8', cap: C4.kelp, capAt: 0.7 }), M.prop, { pos: [x, slope(x, z) - 0.05, z] }));

  // ---- the hill with no light on it
  const far = group('far'), HILL = [22, -1.2, -62], TOWER = [3.2, 0, -52];
  const hillMesh = headland({ w: 110, d: 44, h: 11, seed: 4, grass: L.hill[0], cliff: L.hill[1], foot: L.hill[2], capAt: 0.34, ...(low ? { seg: 24, rings: 10 } : {}) });
  far.add(node('hill', hillMesh, FAR, { pos: HILL, rot: [0, 180, 0] }));
  const topAt = (x, z) => { let top = 0; const Pm = hillMesh.positions; for (let i = 0; i < Pm.length; i += 3) if (Math.hypot(-Pm[i] + HILL[0] - x, -Pm[i + 2] + HILL[2] - z) < 5 && Pm[i + 1] > top) top = Pm[i + 1]; return HILL[1] + top; };
  TOWER[1] = topAt(TOWER[0], TOWER[2]) - 0.7;
  const tower = cappedLamp({ h: 6.5, r: 1.5, colors: dark ? ['#8f8cf0', '#5a58d0'] : [C4.stone, C4.slate] });
  far.add(node('tower', tower, FAR, { pos: TOWER }));
  if (!low) for (const [x, z, s, seed] of [[8.5, -47, 1.5, 3], [14, -49, 1.3, 7], [-2.5, -50, 1.2, 9]]) far.add(node('hut', stoneHut({ seed, w: 2.6 * s, d: 2.2 * s, h: 2.0 * s, roofH: 1.4 * s, ...(dark ? { wall: '#8a86e8', roof: '#4a44b0', shutters: '#c878c0' } : {}) }), FAR, { pos: [x, topAt(x, z) - 1.2, z], rot: [0, (seed % 7) * 9 - 20, 0] }));
  for (const [x, z, w, h, seed] of [[-14, -22, 4, 3.4, 5], [-19, -30, 5, 5.5, 8], [-9, -40, 3, 2.2, 11], [12, -50, 16, 13.5, 14], [26, -48, 20, 15, 17], [-6, -52, 12, 10.5, 20]]) far.add(node('stack', crag({ w, h, d: w * 0.8, seed, low: dark ? '#2a2c98' : '#7a70d8', high: dark ? '#5a5ad0' : '#c8c0f8' }), FAR, { pos: [x, WATER - 0.1, z] }));

  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  env.sky.sunDir = norm3(env.sky.sunDir); env.water.level = WATER;
  env.water.shores = [[60, 6, 66.3, 0.9], [BW_X0 - 0.5, BW_Z, 1.9, 0.8], [BW[0], BW_Z - 1.6, 8.6, 0.5], [-14, -22, 2.6, 0.8], [-19, -30, 3.2, 0.8]];
  scene.root.add(mergeStatic(ground, 'ground'), mergeStatic(near, 'near'), mergeStatic(far, 'far'));

  // shingle: one instanced draw of flat stones in five colours
  const peb = node('shingle', cobble(), M.flat); peb.castShadow = false;
  scatter(peb, low ? 200 : 340, (i) => { const x = -7.5 + r() * 15, z = BW_Z + 1.3 + r() * 8.6, sc = 0.07 + r() * r() * 0.17; if (slope(x, z) < -0.3) return null; const c = rgb(C4.shingle[Math.floor(r() * C4.shingle.length)]); return { m: m4.trs(x, slope(x, z) + 0.003, z, 0, r() * 360, 0, sc * 1.3, 1.6, sc), color: [c[0] * L.shingle, c[1] * L.shingle, c[2]] }; });
  scene.root.add(peb);

  const fg = group('fg');
  fg.add(node('fg1', crag({ w: 1.7, h: 0.7, d: 1.0, seed: 31, low: dark ? '#4a48b8' : '#9a90e0', high: dark ? '#8f8cf0' : '#d8d0f8', cap: C4.kelp, capAt: 0.65 }), M.prop, { pos: [2.5, 0, 3.1] }), node('fg2', kelp({ s: 0.9, seed: 14 }), M.flat, { pos: [-1.6, 0.01, 2.8] }), node('fg3', crate({ s: 0.44, seed: 8, color: PAL.wood2 }), M.prop, { pos: [-2.6, 0, 3.0], rot: [14, 30, 8] }));
  const foreground = mergeStatic(fg, 'foreground'); scene.root.add(foreground);

  const sprites = scene.sprites = createSprites(384);
  // ---- the eleven, on the breakwater and coming down its steps
  const spots = []; for (let i = 0; i < 11; i++) { const onSteps = i >= 8; spots.push(onSteps ? { pos: [2.9 + (i % 2 ? 0.3 : -0.3), BW_H - (i - 7) * (BW_H / 5) * 1.4, BW_Z + 1.2 + (i - 8) * 0.5], face: 10 } : { pos: [BW_X0 + 1.2 + i * 0.6 + (i > 3 ? 1.9 : 0), BW_H + 0.1, BW_Z + 0.3 - (i % 2) * 0.5], face: (i % 3 - 1) * 14 }); }
  const folk = crowd({ spots, material: M.prop, sprites: null, hold: 'none', detail: 1, variants: 2, seed: 4, amount: 1 });
  scene.root.add(folk.node);
  const swells = seaSwells({ rows: [{ z: -9.5, n: 3, span: 20, size: 1.25, speed: 1.0 }, { z: -16, n: 3, span: 30, size: 1.9, speed: 0.8 }, ...(low ? [] : [{ z: -26, n: 4, span: 50, size: 2.8, speed: 0.7 }])], material: M.ground, level: WATER, seed: 3, colors: dark ? { deep: '#1a2890', mid: '#3a4cc8', lit: '#c878c0', foam: '#fff0f4' } : { deep: '#1d6ed0', mid: '#2ba8e0', lit: '#7fe8dc', foam: '#ffffff' } });
  for (const w of swells.list) w.x -= 13;
  scene.root.add(swells.node);
  // the lantern on the pole
  const lanternMesh = hoodedLantern({ s: 1.35, hood: 0.55, lit: L.power > 0 });
  const lantern = node('lantern', lanternMesh, M.lantern, { pos: HOOK }); lantern.castShadow = false; lantern.tint.set([1, 0.8, 0.4, 1]); scene.root.add(lantern);
  const LAMP = [HOOK[0], HOOK[1] + lanternMesh.anchors.lamp[1], HOOK[2]];
  const lampGlow = sprites.add({ kind: 'glow', pos: LAMP, size: 1.9, color: '#ffa848', alpha: 0 });
  const cone = node('lamp-cone', tint(rayMesh(2.2, 0.12, 1.7, 14), '#ffb050'), rayMaterial({ power: 1.5, near: 0.4, far: 0 }), { pos: [LAMP[0], LAMP[1] - 0.1, LAMP[2]] }); scene.root.add(cone);
  if (dark) { // first light, low across the water from the left
    const parts = []; for (const [z, w, len] of [[-7, 2.2, 30], [-12, 3, 36]]) parts.push(place(rayMesh(len, 0.8, w, 10), -30, 3.4, z - 6, 0, 0, -80));
    scene.root.add(node('dawn-shafts', tint(merge(parts), '#ff9ab0'), rayMaterial({ power: 1.0, near: 0.2, far: 0.03 })));
  }
  const clouds = cloudBank({ style: low ? 'painted' : 'solid', count: 7, seed: 21, arc: [140, 205], radius: [260, 420], height: [22, 120], size: [0.7, 1.5], speed: 0.05, ...L.cloud });
  scene.root.add(clouds.node);
  const gulls = node('gulls', gull({}), M.speck); gulls.instances = makeInstances(3); gulls.instances.count = 3; scene.root.add(gulls);
  const actors = group('actors'); scene.root.add(actors);

  const lamps = [
    { name: 'lantern', pos: [LAMP[0], LAMP[1] - 0.2, LAMP[2] + 0.3], color: '#ffb058', radius: 7.2, base: 2.6 },
    { name: 'dawn', pos: [-7, 1.4, -5], color: '#ff8fa8', radius: 9, base: dark ? 0.7 : 0, own: true, steady: true },
  ];

  let rescue = 1, surf = L.surf, surfNow = L.surf, lastT = -1, nextRing = 0, nextSpray = 0.5, nextGust = 1;
  const P = [0, 0, 0], V = [0, 0, 0], S3 = [1, 1, 1], Q = quat.create(), Mx = m4.create(), rnd = rng(17);
  const setRescue = (a) => { rescue = Math.max(0, Math.min(1, a)); folk.setAmount(rescue); }, setSurf = (v) => { surf = Math.max(0, Math.min(1, v)); };
  folk.pace = 3;
  const CUES = { 'ch4.pro.19': () => { setRescue(0); setSurf(0.7); }, 'ch4.pro.20': () => setRescue(0.1), 'ch4.s1.b01': () => setRescue(0.6), 'ch4.s1.c01': () => { setRescue(1); setSurf(0.5); }, 'ch4.s1.c24': () => setRescue(0.5), 'ch4.s1.c25': () => setRescue(0.1) };
  const cue = (id) => { const f = CUES[id]; if (f) f(); return !!f; };

  const FOLK = { lit: 0, lively: 0.35 };
  function update(time, dt, pw) {
    surfNow += (surf - surfNow) * Math.min(1, dt + (dt === 0 ? 1 : 0));
    folk.update(time, dt, FOLK);
    swells.update(time, surfNow);
    const sway = Math.sin(time * 1.5) * 5 + Math.sin(time * 0.6 + 1) * 3, fl = 0.92 + 0.08 * Math.sin(time * 10.1) * Math.sin(time * 6.3), on = Math.min(1.4, pw);
    lantern.setRot(Math.sin(time * 1.1 + 2) * 3, 0, sway); cone.setRot(0, 0, sway * 0.5); cone.visible = pw > 0.05; cone.material.beam.near = 0.4 * on * fl;
    lampGlow.alpha = 0.7 * on * fl; lantern.tint[0] = 0.55 + 0.45 * Math.min(1, on); lantern.tint[1] = 0.5 + 0.3 * Math.min(1, on); lantern.tint[2] = 0.55 - 0.15 * Math.min(1, on);
    clouds.update(time);
    for (let i = 0; i < 3; i++) { const a = time * (0.24 + i * 0.04) * (i % 2 ? 1 : -1) + i * 2.1, rad = 6 + i * 3; P[0] = -9 + i * 4 + Math.cos(a) * rad; P[1] = 5 + i * 1.5 + Math.sin(time * 0.5 + i) * 0.7; P[2] = -16 - i * 5 + Math.sin(a) * rad * 0.5; quat.fromEuler(Q, 0, Math.sin(a) * 0.35, Math.cos(a) * 0.3); const f = Math.sin(time * (5.5 + i * 0.4) + i * 2); S3[0] = 1.7; S3[1] = 1.7 * (0.5 + 1.3 * f); S3[2] = 1.7; if (Math.abs(S3[1]) < 0.12) S3[1] = 0.12; m4.fromTRS(Mx, P, Q, S3); gulls.instances.data.set(Mx, i * 20); }
    gulls.instances.dirty = true;
    if (lastT >= 0 && time - lastT < 0.5 && dt > 0) {
      if (time > nextRing) { nextRing = time + 0.7; P[0] = -6.2 - rnd() * 3; P[1] = WATER + 0.03; P[2] = -3 + rnd() * 6; V[0] = 0.5; V[1] = 0; V[2] = 0; sprites.spawn({ kind: 'ring', pos: P, vel: V, size: 0.5, endSize: 2.4, life: 2.6, color: dark ? '#ffd8e0' : '#ffffff' }); }
      if (time > nextSpray) { nextSpray = time + 1.6 + rnd() * 1.8 - surfNow; P[0] = BW_X0 - 1.9 + rnd() * 0.9; P[1] = WATER + 0.4; P[2] = BW_Z - 0.8 + rnd() * 1.4; sprites.puff(P, { count: 3 + Math.round(4 * surfNow), size: 0.55, rise: 1.6 + 1.4 * surfNow, spread: 0.9, life: 1.1, color: dark ? '#f0e0ff' : '#ffffff' }); sprites.splash(P, { size: 2, life: 1.2, spray: 5, color: '#ffffff' }); }
      if (time > nextGust) { nextGust = time + 2.6 + rnd() * 1.8; P[0] = -7 + rnd() * 5; P[1] = 1.6 + rnd() * 2.6; P[2] = -3 + rnd() * 4; V[0] = 2.0; V[1] = 0.06; V[2] = 0.2; sprites.gust(P, { vel: V, size: 0.9 + rnd() * 0.6, life: 2.2, alpha: 0.7, color: dark ? '#e0d0ff' : '#ffffff' }); }
      sprites.update(dt);
    }
    lastT = time;
  }

  return c4Shell({
    id: 'wreck-shore', light, low, scene, actors, foreground, cameras: CAMERAS, lamps, lampPower: L.power, update,
    marks: { ...MARKS4, focus: LAMP, surf: { pos: [-4.4, slope(-4.4, 0.6), 0.6], face: 70 }, steps: { pos: [2.9, 0, BW_Z + 3.3], face: 0 }, cover: { pos: [-1.3, 0, -0.75], face: 30 }, breakwater: [1, BW_H, BW_Z] },
    extra: { setRescue, setSurf, cue },
  });
}

export const wreckShore = { id: 'wreck-shore', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default wreckShore;
