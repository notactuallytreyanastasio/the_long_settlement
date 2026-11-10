// SET: mole-lanterns. The harbour mole at night, looking west out to sea. It was not the night for lanterns: Vessery lit
// them anyway and hung them, ten thousand, in one line down the mole where the west could see. Nan's twelve painted
// names hang nearest, over the stage. Far out and low, the dark answers: two points of blue.
// Chapter 7: ch7.s7.c14-22 (Nan and Ilse; "We are still here! Are you?"; the far light, then the nearer one).
//
//   import { moleLanterns } from './sets/mole-lanterns.js';
//   const set = moleLanterns.build(GL, { light: 'night', low: false });
//
// The shape is lantern-stalls' (see ../index.js). Figures face +Z, cameras look toward -Z, down the mole and out to the
// west. The strip x -4.4..4.4, z -0.1..1.6 is clear. Added here:
//   setAnswer(n)        0: the west is dark;  1: the far point shows, goes, shows (it keeps time: Carrow);  2: and the nearer
//                       one, flickering (Little Brand, Wyn doing it on purpose). Built at 2.
//   setLit(0..1)        how far down the mole the line has been lit, from the stage outward (1 as built)
//   setCrowd(0..1), setLantern(i, lit), lanternCount (the modelled lanterns; 0..11 are Nan's twelve names, 9 is Saltmere, the wet one)
//   cue(lineId)         ch7.s7.c14-16: no answer yet;  c17: the far light;  c18 on: both
//   task('lantern-line')  -> { pos, set(v) }: the line lit from the stage outward, for an encounter that hangs it
//   marks.wire          where Nan and Ilse take the two ends of one lantern;  marks.focus  the far blue point;  marks.names (world points)
// One light state, 'night': deep blue, a quarter moon, every warm thing a lantern. setPower scales the whole line.
// low: true models half as many lanterns, halves the crowd and the far lights' halos, and drops the cutter's wake and the gusts.

import { m4, quat, rng, DEG, rgb } from '../math.js';
import { merge, tint, place, plane, box, tube, curve, cylinder, setGlow, setOutline } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic, makeInstances } from '../scene.js';
import { createSprites } from '../sprites.js';
import { rayMesh, rayMaterial } from '../fx.js';
import { PAL, kitMaterials, anchorAt, scatter, pickLight, paperLantern, lanternString, lanternLines, bollard, ropeCoil, pole, cloudBank, cobble, crate } from './kit.js';
import { C7, STD_MARKS, STD_CAMERAS, shell7, rows, folk7, dirFrom, norm7, moleWall, cutter, basket } from './kit-ch7.js';

const WATER = -0.95, LEN = 120, BEND = 5;

const LIGHTS = {
  night: {
    preset: 'night', power: 1.2, sun: 0.2, unlit: 0.4, glow: 0.7,
    env: {
      key: { dir: dirFrom(-150, 42), color: '#86a4f4' },
      shadow: { tint: '#2f44a8', lift: 0.12, saturate: 1.25 },
      ambient: { sky: '#3f5fd0', ground: '#2a3a92', amount: 0.18 },
      rim: { color: '#bcd6ff', amount: 0.6, edge: 0.76 },
      fog: { color: '#3e6fe0', density: 0.0028, start: 22, max: 0.8 },
      sky: { zenith: '#08135e', mid: '#1837a6', midAt: 0.44, horizon: '#4a7ee6', below: '#2f55c0', sunDir: dirFrom(-13, 14.5), moon: 0.6, stars: 1, sun: { size: 2.2 } },
      water: { deep: '#102682', mid: '#1b40aa', shallow: '#2f72d4', foam: '#bcd4ff', glint: '#ffd9a0', glintDensity: 0.22 },
    },
    cloud: { color: '#8fa6ea', shadowTint: '#3a50aa' },
  },
};

const CAMERAS = STD_CAMERAS({
  wide: { target: [0.1, 1.75, -0.4], dist: 8.3, yaw: -1.5, pitch: 4.5, fov: 46 },
  low: { target: [0.1, 2.0, 0.2], dist: 6.3, yaw: 4, pitch: -13, fov: 58 },
});

function build(engine = null, { light, low = false } = {}) {
  const picked = pickLight('mole-lanterns', LIGHTS, light), L = picked.L; light = picked.name;
  const M = kitMaterials(), r = rng(1212);

  // ---- the mole and the head of the quay it leaves from
  const ground = group('ground'), near = group('near');
  const mole = moleWall({ len: LEN, w0: 9.5, w1: 4.6, drop: 2.0, bend: BEND, seg: low ? 12 : 18, seed: 4, top: '#e9d8b4' });
  ground.add(node('mole', mole, M.ground, { pos: [0, 0, -1.6] }));
  ground.add(node('head', tint(place(box(60, 2.2, 14), 0, -1.1, 5.4), '#ecdcb6'), M.ground));
  ground.add(node('head-edge', merge(...[-1, 1].map((sx) => tint(place(box(25, 0.24, 0.6), sx * 17.3, 0.02, -1.4), PAL.stone2))), M.ground));
  ground.traverse((n) => { n.castShadow = false; });
  const at = (t, across = 0) => { const p = mole.at(t, across); return [p[0], 0, p[2] - 1.6]; };

  // ---- the line: one tall pole by the stage, then a post every bay down the left of the mole
  const POLE0 = [3.9, 0, 2.2], pole0 = pole({ h: 5.3, seed: 6, knob: PAL.coral }), top0 = anchorAt(pole0, 'top', POLE0);
  near.add(node('pole0', pole0, M.prop, { pos: POLE0 }));
  const BAY = 6.2, posts = [];
  for (let z = 2.4; z < LEN - 4; z += BAY * (1 + posts.length * 0.03)) { const t = z / LEN, p = at(t, -0.8), h = 4.3 - Math.min(1.2, posts.length * 0.06); posts.push({ pos: p, top: [p[0] + 0.05, h, p[2]], t }); }
  posts.forEach((p, i) => { if (i < 5) near.add(node('post' + i, pole({ h: p.top[1] + 0.06, seed: 11 + i, knob: i % 2 ? PAL.yellow : PAL.teal }), M.prop, { pos: p.pos })); });
  // the far posts are sticks: one unlined mesh
  const sticks = []; posts.forEach((p, i) => { if (i >= 5) sticks.push(tint(place(cylinder(0.09, 0.06, p.top[1], 4), p.pos[0], 0, p.pos[2]), PAL.woodDark)); });
  near.add(node('far-posts', setOutline(merge(sticks), 0), M.flat));
  const NEAR_SPANS = low ? 2 : 3, strings = [], wires = [];
  const names = lanternString(top0, posts[0].top, { sag: 1.05, count: 12, ends: 0.07 }); wires.push(names.wire);
  strings.push({ hooks: names.hooks, cols: [0, 2, 1, 4, 0, 3, 2, 6, 1, 5, 0, 2], scale: 1.28 });
  for (let i = 0; i < NEAR_SPANS; i++) { const s = lanternString(posts[i].top, posts[i + 1].top, { sag: 0.7, count: low ? 5 : 7, ends: 0.1 }); wires.push(s.wire); strings.push({ hooks: s.hooks, cols: [2, 0, 5, 1, 0, 3, 2].map((c) => (c + i) % 7) }); }
  // every other span is a wire with lights too small to model: they are instanced specks below
  const far = [];
  for (let i = NEAR_SPANS; i < posts.length - 1; i++) {
    const s = lanternString(posts[i].top, posts[i + 1].top, { sag: 0.6, count: Math.max(4, 9 - Math.floor(i / 3)), ends: 0.08, radius: 0.02 });
    wires.push(s.wire); s.hooks.forEach((h, k) => far.push({ pos: [h[0], h[1] - 0.3, h[2]], t: posts[i].t, col: PAL.lanterns[(k + i * 3) % PAL.lanterns.length], ph: r() * 6.283 }));
  }
  near.add(node('wires', setOutline(merge(wires), 0), M.flat));
  near.add(node('bollard', bollard({ s: 1.15 }), M.prop, { pos: [-4.9, 0, -0.9] }), node('bollard2', bollard({ s: 1.15 }), M.prop, { pos: [5.4, 0, -0.8] }));
  // Nan's hand-cart of spare paper and frames, stage right, clear of the strip
  near.add(node('cart', merge(tint(place(box(1.2, 0.5, 0.75), 0, 0.62, 0), PAL.wood2), tint(place(box(1.3, 0.07, 0.85), 0, 0.36, 0), PAL.woodDark), ...[-1, 1].map((sx) => tint(place(cylinder(0.3, 0.3, 0.07, 9), sx * 0.66, 0.3, 0, 0, 0, 90), PAL.woodDark)), tint(place(cylinder(0.03, 0.03, 0.9, 4), 0.6, 0.6, 0, 0, 0, -60), PAL.woodDark),
    ...[0, 1, 2, 3].map((k) => setGlow(tint(place(paperLantern({ r: 0.13, seg: 6, tassel: false, cord: 0.01 }), -0.4 + k * 0.27, 1.24 + (k % 2) * 0.04, (k % 2 - 0.5) * 0.3), PAL.lanterns[(k * 2 + 1) % 7]), 0.25))), M.prop, { pos: [5.1, 0, -2.2], rot: [0, -24, 0] }));
  if (!low) near.add(node('crate', crate({ s: 0.5, seed: 4 }), M.prop, { pos: [-5.6, 0, -2.3], rot: [0, 18, 0] }), node('basket', basket({ full: false }), M.prop, { pos: [-4.7, 0, -2.6] }));

  // ---- out on the water: the Audit cutter standing out on the night tide, its one lamp lit
  const CUT = [19, WATER + 0.05, -46], cutMesh = cutter({ len: 11, lit: true, sails: true });
  const cutNode = node('cutter', cutMesh, M.far, { pos: CUT, rot: [0, 78, 0] }); cutNode.castShadow = false;

  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  env.sky.sunDir = norm7(env.sky.sunDir); env.water.level = WATER;
  env.water.shores = [[0, 899.2, 900.6, 0.7], [CUT[0], CUT[2], 3.2, 0.6], [CUT[0] + 0.6, CUT[2] + 3, 2.4, 0.6], [CUT[0] - 0.6, CUT[2] - 3, 2.4, 0.6]];
  for (let i = 0; i < 6; i++) { const p = at((i + 0.5) / 6); env.water.shores.push([p[0], p[2], mole.width((i + 0.5) / 6) / 2 + 6 - i * 0.6, 0.6]); }
  scene.root.add(mergeStatic(ground, 'ground'), mergeStatic(near, 'near'), cutNode);

  const cob = node('cobbles', cobble(), M.flat); cob.castShadow = false;
  const cobCols = ['#f2e2c0', '#d8c69c', '#ead6ae', '#d2bc90'];
  scatter(cob, low ? 120 : 300, (i) => {
    const col = i % 20, row = Math.floor(i / 20), x = -6.6 + col * 0.7 + (row % 2) * 0.35 + (r() - 0.5) * 0.18, z = -1.0 + row * (low ? 0.9 : 0.42) + (r() - 0.5) * 0.12;
    if (r() < 0.4) return null;
    const sc = 0.22 + r() * 0.1; return { m: m4.trs(x, 0.002, z, 0, r() * 360, 0, sc * 1.3, 1, sc * 0.9), color: cobCols[Math.floor(r() * cobCols.length)] };
  });
  scene.root.add(cob);

  const fg = group('fg');
  fg.add(node('fg1', ropeCoil({ r: 0.24 }), M.prop, { pos: [1.3, 0, 2.7] }), node('fg2', basket({ r: 0.24, full: false }), M.prop, { pos: [-1.8, 0, 2.8] }), node('fg3', setGlow(tint(place(paperLantern({ r: 0.15, seg: 6, tassel: false, cord: 0.01 }), 0, 0.42, 0), PAL.lanterns[3]), 0.3), M.prop, { pos: [-1.75, 0.2, 2.8] }));
  const foreground = mergeStatic(fg, 'foreground'); scene.root.add(foreground);

  // ---- sprites, the modelled lanterns, the far specks
  const sprites = scene.sprites = createSprites(512);
  const lines = lanternLines({ strings, material: M.lantern, sprites, shapes: low ? 1 : 2, seg: low ? 6 : 8, seed: 3, glowSize: 1.0 });
  scene.root.add(...lines.nodes);
  lines.setLit(9, 0.3);   // Saltmere is the wet one
  const speckMesh = setOutline(setGlow(tint(place(box(0.2, 0.26, 0.2), 0, 0, 0), '#ffffff'), 0.95), 0);
  const speck = node('far-lanterns', speckMesh, M.speck); speck.instances = makeInstances(far.length); speck.instances.count = far.length; speck.cull = false;
  const camZ = 8;
  far.forEach((f, i) => {
    const d = camZ - f.pos[2], s = 0.7 + d * 0.022; f.s = s; f.c = rgb(f.col);
    speck.instances.data.set(m4.trs(f.pos[0], f.pos[1], f.pos[2], 0, r() * 90, 0, s), i * 20);
    f.glow = (i % (low ? 4 : 2) === 0) ? sprites.add({ kind: 'glow', pos: f.pos, size: 1.1 * s, color: f.col, alpha: 0 }) : null;
    f.refl = (i % (low ? 6 : 3) === 1) ? sprites.add({ kind: 'glow', pos: [f.pos[0] - 2.6 - r() * 1.5, WATER + 0.05, f.pos[2]], size: [2.6 * s, 0.5 * s], color: f.col, alpha: 0 }) : null;
  });
  scene.root.add(speck);
  const nameAt = names.hooks.map((h) => [h[0], h[1] - 0.45, h[2]]), FOCUS_LAMP = nameAt[5];
  // reflections of the near line, lying on the water to the left of the mole
  const refl = []; for (let i = 0; i < (low ? 4 : 9); i++) { const p = at(0.03 + i * 0.012, -1); refl.push({ sprite: sprites.add({ kind: 'glow', pos: [p[0] - 2.2 - (i % 3) * 0.7, WATER + 0.04, p[2] - i * 0.4], size: [2.2, 0.42], color: PAL.lanterns[i % 7], alpha: 0 }), ph: i * 1.7 }); }

  // ---- the crowd, each with a light
  const face = (p) => 180 + Math.atan2(-(p[0] + 30), -(p[2] + 300)) / DEG * 0 + (p[0] > 0 ? -150 : 150) * 0 + 180 * 0;
  const spots = [];
  { const a = rows(3, 8, 2.3, 5.4, -1.9, -3.4, (p) => -14 + r() * 28), b = rows(5, 6, -5.6, -3.9, -1.7, -3.0, (p) => 20 + r() * 20);
    const down = []; for (let i = 0; i < 20; i++) { const t = 0.045 + i * 0.011 + r() * 0.004, p = at(t, 0.1 + r() * 0.72); down.push({ pos: p, face: (r() < 0.5 ? 180 : 0) + (r() - 0.5) * 60 }); }
    for (let i = 0; i < 20; i++) { if (i < a.length) spots.push(a[i]); if (i < b.length) spots.push(b[i]); spots.push(down[i]); } }
  void face;
  const folk = folk7({ spots: low ? spots.filter((_, i) => i % 2 === 0) : spots, material: M.prop, seed: 7, coats: ['#5a8fe0', '#e8785c'].slice(0, low ? 1 : 2), hold: 'lantern', sprites, glow: '#ffc060', glowSize: 0.8, amount: 1 });
  scene.root.add(folk.node);

  // ---- lamps: six fixed lights down the line
  const mid = (i) => { const a = posts[i].top, b = posts[i + 1].top; return [(a[0] + b[0]) / 2, a[1] - 1.2, (a[2] + b[2]) / 2]; };
  const lamps = [
    { name: 'names', pos: [FOCUS_LAMP[0], FOCUS_LAMP[1] - 0.2, FOCUS_LAMP[2]], color: '#ffb85a', radius: 7.8, base: 1.15 },
    { name: 'names-left', pos: [nameAt[10][0], nameAt[10][1], nameAt[10][2]], color: '#ffc46a', radius: 5.6, base: 0.95 },
    { name: 'names-right', pos: [nameAt[1][0], nameAt[1][1], nameAt[1][2]], color: '#ffc46a', radius: 5.6, base: 0.95 },
    { name: 'span-1', pos: mid(0), color: '#ffb060', radius: 6.5, base: 1.0 },
    { name: 'span-2', pos: mid(1), color: '#ffb060', radius: 6.5, base: 0.95 },
    { name: 'crowd', pos: [3.9, 1.5, -2.7], color: '#ffb060', radius: 4.0, base: 0.85 },
  ];

  // ---- the answer: two points of blue, far out and low
  const BLUE = [{ pos: [-40, 3.2, -640], size: 13, col: '#7fd8ff' }, { pos: [-66, 3.0, -380], size: 10, col: '#9fe6ff' }].map((b) => ({
    ...b, glow: sprites.add({ kind: 'glow', pos: b.pos, size: b.size, color: b.col, alpha: 0 }), star: sprites.add({ kind: 'sparkle', pos: b.pos, size: b.size * 0.9, color: '#eaffff', alpha: 0 }),
    refl: sprites.add({ kind: 'glow', pos: [b.pos[0], WATER + 0.2, b.pos[2] + 40], size: [b.size * 0.5, b.size * 0.16], color: b.col, alpha: 0 }), now: 0,
  }));
  const cutLamp = anchorAt(cutMesh, 'lamp', CUT, 78), cutGlow = sprites.add({ kind: 'glow', pos: cutLamp, size: 5, color: '#fff0b0', alpha: 0.75 });

  // a cone of warm light under the names, one mesh
  scene.root.add(node('lamp-shafts', merge(tint(place(rayMesh(2.6, 0.3, 2.1, 14), FOCUS_LAMP[0], FOCUS_LAMP[1], FOCUS_LAMP[2]), '#ffb050'), tint(place(rayMesh(2.4, 0.2, 1.6, 12), nameAt[9][0], nameAt[9][1], nameAt[9][2]), '#ffc060'), tint(place(rayMesh(2.4, 0.2, 1.6, 12), nameAt[2][0], nameAt[2][1], nameAt[2][2]), '#ffc060')), rayMaterial({ power: 1.5, near: 0.4, far: 0 })));
  const clouds = cloudBank({ style: 'painted', count: 6, seed: 13, arc: [160, 204], radius: [260, 430], height: [50, 170], size: [0.7, 1.4], speed: 0.04, ...L.cloud });
  scene.root.add(clouds.node);
  const actors = group('actors'); scene.root.add(actors);

  // ---- per-frame
  const P = [0, 0, 0], V = [0, 0, 0], rnd = rng(77);
  let answer = 2, lit = 1, litNow = 1, nextSpark = 0, nextEmber = 0, nextGust = 1.4, nextRing = 0.6;
  const setAnswer = (n) => { answer = Math.max(0, Math.min(2, Math.round(n))); };
  const setLit = (v) => { lit = Math.max(0, Math.min(1, v)); };
  const setCrowd = (a) => folk.setAmount(a);
  const lineTask = { pos: [FOCUS_LAMP[0], FOCUS_LAMP[1], FOCUS_LAMP[2]], set: setLit };
  const task = (type) => (type === 'lantern-line' ? lineTask : null);
  function cue(lineId) {
    const m = /^ch7\.s7\.c(\d+)/.exec(lineId || ''); if (!m) return false;
    const n = Number(m[1]); if (n < 14) return false;
    setLit(1); setAnswer(n < 17 ? 0 : n === 17 ? 1 : 2); return true;
  }

  function tick(time, dt, pw, live, power) {
    litNow += (lit - litNow) * Math.min(1, dt * 1.5 + (dt === 0 ? 1 : 0));
    const on = Math.min(1, pw), reach = litNow * 1.08;
    // the modelled lanterns light from the stage outward as the line is lit
    for (let i = 0; i < lines.list.length; i++) { if (i === 9) continue; const want = i < 12 ? (litNow > 0.02 ? 1 : 0) : (reach > 0.04 + (i - 12) * 0.004 ? 1 : 0); const l = lines.list[i]; l.lit += (want - l.lit) * Math.min(1, dt * 6 + (dt === 0 ? 1 : 0)); }
    lines.update(time, { on, pw, unlit: L.unlit, glow: L.glow });
    const D = speck.instances.data;
    for (let i = 0; i < far.length; i++) {
      const f = far[i], k = (f.t < reach ? 1 : 0.16) * (0.9 + 0.1 * Math.sin(time * 7 + f.ph)) * (0.25 + 0.75 * on), o = i * 20 + 16;
      D[o] = f.c[0] * k * 1.1; D[o + 1] = f.c[1] * k; D[o + 2] = f.c[2] * k;
      if (f.glow) f.glow.alpha = 0.62 * k * Math.min(1.2, pw); if (f.refl) f.refl.alpha = 0.34 * k * (0.7 + 0.3 * Math.sin(time * 2.3 + f.ph));
    }
    speck.instances.dirty = true;
    for (let i = 0; i < refl.length; i++) refl[i].sprite.alpha = 0.4 * on * litNow * (0.7 + 0.3 * Math.sin(time * 2.1 + refl[i].ph));
    folk.update(time, dt, { lit: pw, lively: 0.55 });
    // the far light keeps time; the nearer one flickers, on purpose
    for (let i = 0; i < 2; i++) {
      const b = BLUE[i], goal = answer > i ? 1 : 0; b.now += (goal - b.now) * Math.min(1, dt * 1.2 + (dt === 0 ? 1 : 0));
      const beat = i === 0 ? Math.pow(Math.max(0, Math.sin(time * 1.25)), 0.6) : (0.55 + 0.45 * Math.sin(time * 9.1) * Math.sin(time * 5.3 + 1)) * (Math.sin(time * 0.9) > -0.6 ? 1 : 0.25);
      const a = b.now * beat;
      b.glow.alpha = 0.85 * a; b.star.alpha = a; b.star.rot = time * 0.3 + i; b.star.size[0] = b.star.size[1] = b.size * (0.7 + 0.5 * beat); b.refl.alpha = 0.4 * a;
    }
    cutGlow.alpha = 0.7 + 0.08 * Math.sin(time * 2.3);
    cutNode.position[1] = CUT[1] + Math.sin(time * 0.9) * 0.08; cutNode.setRot(Math.sin(time * 0.8) * 1.5, 78, Math.sin(time * 1.1) * 2);
    clouds.update(time);
    env.water.glintDensity = 0.1 + 0.14 * on * litNow;
    if (live) {
      if (pw > 0.05 && time > nextSpark) { nextSpark = time + 0.14; const l = lines.list[Math.floor(rnd() * lines.list.length)]; if (l.lit > 0.5) sprites.sparkle(l.glow.pos, { count: 1, size: 0.18, spread: 0.5, life: 0.9, color: '#fff0b0' }); }
      if (time > nextEmber) { nextEmber = time + (low ? 0.5 : 0.26); P[0] = -4 + rnd() * 8; P[1] = 0.4 + rnd() * 2.8; P[2] = -6 + rnd() * 7; V[0] = -0.14 - rnd() * 0.1; V[1] = 0.12 + rnd() * 0.16; V[2] = -0.06; sprites.spawn({ kind: 'glow', pos: P, vel: V, size: 0.1 + rnd() * 0.08, life: 4.5, color: '#ffd070', alpha: 0.9 }); }
      if (!low && time > nextGust) { nextGust = time + 2.8 + rnd() * 1.5; P[0] = 3 - rnd() * 3; P[1] = 2.6 + rnd() * 2.6; P[2] = -8 + rnd() * 6; V[0] = -2.0; V[1] = 0.1; V[2] = -0.3; sprites.gust(P, { vel: V, size: 0.9 + rnd() * 0.5, life: 2.2, alpha: 0.8, color: '#c6d6ff' }); }
      if (time > nextRing) { nextRing = time + 1.5; P[0] = (rnd() < 0.5 ? -1 : 1) * (7 + rnd() * 8); P[1] = WATER + 0.03; P[2] = -4 - rnd() * 12; sprites.splash(P, { size: 0.9 + rnd() * 0.6, life: 1.4, spray: 0, color: '#bcd4ff' }); }
    }
  }

  return shell7({
    id: 'mole-lanterns', light, low, L, scene, cameras: CAMERAS, actors, foreground, lamps, glows: [], sun: L.sun, tick,
    marks: {
      ...STD_MARKS(), focus: BLUE[0].pos, names: nameAt,
      wire: [{ pos: [-0.5, 0, 0.3], face: 30 }, { pos: [0.6, 0, 0.3], face: -30 }],
      back: [[1.3, 0.1], [2.1, -0.05], [2.9, 0.15], [-1.3, 0.1], [-2.1, -0.05], [-2.9, 0.15]],
    },
    extra: { setAnswer, setLit, setCrowd, setLantern: lines.setLit, lanternCount: lines.count, task, cue },
  });
}

export const moleLanterns = { id: 'mole-lanterns', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default moleLanterns;
