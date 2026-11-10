// SET: picket. The pithead gate of Saltmere at night, shut to the Circuit: two timber leaves chained between stone
// posts with a fire basket burning on each, the Mint's notice nailed to the left leaf, forty miners off a twelve-hour
// shift standing the line with their lamps, the winding tower black against the moon behind them, and far off to the
// right the town's own cold light, which has ten days left.
// Chapter 2: ch2.s1 The Toll (and where ch2.pro.19 ends: "a gate, and a notice nailed to it, and a woman who had read the notice").
//
//   import { picket } from './sets/picket.js';
//   const set = picket.build(GL, { light: 'night' | 'dusk', low: false });
//
// Same shape as sets/lantern-stalls.js. Figures face +Z, cameras look toward -Z (the gate, the pit, the moon). The
// strip x -4.4..4.4, z 0..1.6 is clear: it is the salt road up to the gate.
//
// What this set can do for its story:
//   openDoor(0..1)        the side door in the right-hand wall ("two pairs of hands can use the side door"): kitchen light spills out
//   setCrowd(0..1)        how many are on the line;  setMood(0..1): 0.2 a tired vigil, 1 shoving
//   cue(lineId)           ch2.s1.c03 the line closes up; c15 it eases; c17 the side door opens; c22 it stands open
//   task('side-door')     -> { pos, stand, set(v) } for an encounter that is about getting through
// marks: a, b, c, two, party, opposition as everywhere, plus
//   gate { pos, face }: before the chained leaves   door { pos, face }: at the side door   notice: world point of the paper
//   focus: the left fire basket

import { rng, m4 } from '../math.js';
import { merge, tint, place, box, plane, cylinder, setGlow, setOutline, fromArrays } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic } from '../scene.js';
import { createSprites } from '../sprites.js';
import { anchorAt, crowd, cloudBank, house, brazier, crate, barrel, townBank, scatter, cobble } from './kit.js';
import {
  SM, ch2Materials, shell, lightOf, stageMarks, norm3, pitGate, palisade, cresset, notice, headframe, saltHeap, lampHouse, oreCart, rails, flameBank, placard, pick,
} from './kit-ch2.js';

const GATE_Z = -4.7;
const dirFrom = (az, el) => { const D = Math.PI / 180; return [Math.sin(az * D) * Math.cos(el * D), Math.sin(el * D), -Math.cos(az * D) * Math.cos(el * D)]; };

const LIGHTS = {
  night: {
    preset: 'night', power: 1.2, night: true,
    env: {
      key: { dir: dirFrom(-24, 40), color: '#86a4f4' },
      shadow: { tint: '#2c40ac', lift: 0.13, saturate: 1.3 },
      ambient: { sky: '#4666d8', ground: '#2c3c98', amount: 0.17 },
      rim: { color: '#bcd6ff', amount: 0.7, edge: 0.74 },
      fog: { density: 0.0042, start: 18, max: 0.85 },
      sky: { zenith: '#0a166a', mid: '#1b3cac', midAt: 0.42, horizon: '#5886ea', below: '#3058c4', sunDir: dirFrom(5.5, 19.5), moon: 0.8, stars: 1, sun: { size: 3.6 } },
      water: null,
    },
    ground: '#eef0ff', cloud: { color: '#8fa6ea', shadowTint: '#3a50aa' }, smoke: '#b9c6f2', still: 0.9,
  },
  dusk: {
    preset: 'sunset', power: 1, night: false,
    env: {
      key: { dir: dirFrom(-30, 20), color: '#ffd8a8' },
      shadow: { tint: '#7f74e0', lift: 0.1, saturate: 1.4 },
      ambient: { sky: '#ffa48e', ground: '#7d6ad0', amount: 0.16 },
      rim: { color: '#ffd98a', amount: 1.0, edge: 0.72 },
      fog: { density: 0.004, start: 18, max: 0.9 },
      sky: { zenith: '#3a4cc8', mid: '#a886ee', midAt: 0.5, horizon: '#ffc870', below: '#f6a878', glow: '#ffe890', glowAmount: 0.55, sunDir: dirFrom(-9, 5), sun: { color: '#fffbe0', size: 2.6, halo: '#ffd070', haloAmount: 0.42 } },
      water: null,
    },
    ground: '#fff3dc', cloud: { color: '#ffd9b4', shadowTint: '#c878b8' }, smoke: '#ffe6d2', still: 0.6,
  },
};

const CAMERAS = {
  wide: { target: [-0.1, 2.5, -1.2], dist: 9.2, yaw: 3, pitch: 1, fov: 48, aspect: 0.46, shadowCenter: [0, 0, -1.6], shadowRadius: 8.5 },
  two: { target: [0, 1.12, 0.6], dist: 6.0, yaw: -15, pitch: 5, fov: 31, aspect: 0.46, shadowCenter: [0, 0, 0.3], shadowRadius: 3.6 },
  close: { target: [0.02, 0.86, 0.8], dist: 3.9, yaw: 21, pitch: 3, fov: 28, aspect: 0.46, shadowCenter: [0, 0, 0.5], shadowRadius: 2.6 },
  low: { target: [-0.1, 2.5, -0.6], dist: 6.2, yaw: -9, pitch: -14, fov: 58, aspect: 0.46, shadowCenter: [0, 0, -1.2], shadowRadius: 8.5 },
  stage: { target: [0.3, 1.2, 0.1], dist: 10.2, yaw: -13, pitch: 6, fov: 26, aspect: 1.95, shadowCenter: [0, 0, -1], shadowRadius: 8.5, outline: 0.7 },
  landscape: { target: [0, 2.4, -1.6], dist: 11, yaw: 4, pitch: 4, fov: 42, aspect: 1.6, shadowCenter: [0, 0, -1.8], shadowRadius: 10.5 },
};

function build(engine = null, { light: lightName = 'night', low = false } = {}) {
  const [light, L] = lightOf('picket', LIGHTS, lightName);
  const M = ch2Materials(), r = rng(907), night = L.night;
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  env.sky.sunDir = norm3(env.sky.sunDir);
  const deco = (n) => { n.castShadow = false; return n; };

  // ---- ground: packed salt, a paler road up to the gate, tub rails running under it
  const set = group('set');
  set.add(node('ground', tint(place(plane(160, 110, 1, 1), 0, 0, -35), L.ground), M.ground));
  set.add(deco(node('road', setOutline(tint(fromArrays([-2.6, 0.006, 5, 2.6, 0.006, 5, -1.9, 0.006, GATE_Z, 1.9, 0.006, GATE_Z], [0, 1, 2, 1, 3, 2], null, 180), night ? '#ffffff' : '#fffaf0'), 0), M.flat)));
  set.add(deco(node('rails', rails({ len: 14, seed: 3 }), M.prop, { pos: [-3.4, 0, GATE_Z - 5.2], rot: [0, 78, 0] })));

  // ---- the gate, its walls, the palisade running off both ways
  const GATE = [0, 0, GATE_Z];
  const gate = pitGate({ w: 4.2, h: 3.3, side: 1, seed: 4, wood: '#b9806a', wood2: '#cf9a80', stone: '#cfc8f4' });
  set.add(node('gate', gate, M.prop, { pos: GATE }));
  const gAt = (name) => anchorAt(gate, name, GATE);
  const cr = cresset({ h: 0.5, r: 0.3, post: false });
  const fireL = gAt('postL'), fireR = gAt('postR');
  set.add(node('cresset-l', cr, M.prop, { pos: [fireL[0], fireL[1] - 0.3, fireL[2]] }), node('cresset-r', cr, M.prop, { pos: [fireR[0], fireR[1] - 0.3, fireR[2]] }));
  const NOTICE = gAt('notice');
  set.add(deco(node('notice', notice({ s: 0.78, glow: night ? 0.3 : 0.1 }), M.prop, { pos: NOTICE, rot: [0, 0, -4] })));
  for (const sx of [-1, 1]) for (let k = 0; k < (low ? 1 : 2); k++) set.add(node('palisade', palisade({ len: 7, h: 2.5, seed: 3 + k + sx }), M.prop, { pos: [sx * (9.9 + k * 6.9), 0, GATE_Z - 0.2 - k * 0.6], rot: [0, -sx * (4 + k * 6), 0] }));
  // aprons on the nail by the side door
  const DOOR = gAt('door'), HINGE = gAt('hinge'), DW = gate.anchors.doorW, DH = gate.anchors.doorH;
  { const parts = []; for (let i = 0; i < 2; i++) parts.push(tint(place(box(0.32, 0.6, 0.04), i * 0.4, -0.34, 0.03, 0, 0, (i - 0.5) * 6), [SM.salt, '#bfe8ff'][i]), tint(place(box(0.05, 0.05, 0.08), i * 0.4, 0, 0.04), SM.iron)); set.add(deco(node('aprons', merge(parts), M.prop, { pos: [DOOR[0] + DW / 2 + 0.45, 1.75, DOOR[2] + 0.28] }))); }

  // ---- the pit behind the gate: the winding tower, the engine house with its stack, salt heaps
  const HEAD = [-1.2, 0, GATE_Z - 8.5];
  const hf = headframe({ h: 9.4, w: 4.2, seed: 1, color: '#7e4f5e', color2: '#a0685e' });
  set.add(deco(node('headframe', hf, M.prop, { pos: HEAD, rot: [0, 14, 0] }))); // behind the gate: its shadow falls where nobody looks, so it is not in the shadow pass
  const ENG = [6.4, 0, GATE_Z - 7.5];
  const eng = house({ seed: 9, w: 4.2, d: 3.4, h: 3.4, roofH: 1.9, wall: SM.brick, roof: '#5b7fe8', shutters: SM.enamel, sides: 'left', lit: 0.9, floors: 2, chimney: false, flowers: false, door: false });
  set.add(deco(node('engine-house', eng, M.prop, { pos: ENG, rot: [0, -16, 0] })));
  const STACK = [ENG[0] + 2.6, 0, ENG[2] - 1.2], STACK_H = 9.5;
  set.add(deco(node('stack', merge(tint(place(cylinder(0.75, 0.5, STACK_H, 9), 0, 0, 0), SM.brick), tint(place(cylinder(0.56, 0.6, 0.4, 9), 0, STACK_H - 0.5, 0), SM.brickDark), tint(place(cylinder(0.8, 0.8, 0.5, 9), 0, 0, 0), SM.brickDark)), M.prop, { pos: STACK, rot: [0, 0, -1.5] })));
  for (const [x, z, rr, hh, seed] of [[-6.8, GATE_Z - 4.5, 2.6, 2.2, 2], [-10.5, GATE_Z - 7, 3.4, 2.9, 5], [11.5, GATE_Z - 4.2, 2.4, 1.9, 8]]) set.add(deco(node('heap', saltHeap({ r: rr, h: hh, seed }), M.prop, { pos: [x, 0, z] })));

  // ---- in front of the gate, clear of the road: braziers, heaps, a tub off the rails, placards
  const BRZ = [[-3.9, 0, -2.5], [3.5, 0, -2.9]];
  const bz = brazier({ h: 0.95, r: 0.32 });
  for (const p of BRZ) set.add(node('brazier', bz, M.prop, { pos: p }));
  set.add(node('heap-l', saltHeap({ r: 1.3, h: 1.0, seed: 3 }), M.prop, { pos: [-6.3, 0, -1.7] }), node('heap-r', saltHeap({ r: 1.0, h: 0.75, seed: 6 }), M.prop, { pos: [6.9, 0, -0.6] }));
  set.add(node('tub', oreCart({ load: 0.4, seed: 2 }), M.prop, { pos: [-6.6, -0.1, 0.4], rot: [0, 24, -5] }));
  set.add(node('crates', merge(place(crate({ s: 0.6, seed: 3 }), 0, 0, 0), place(crate({ s: 0.48, seed: 7, color: SM.timberPale }), 0.72, 0, 0.1, 0, 20, 0), place(barrel({ r: 0.28, h: 0.7 }), -0.75, 0, 0.2), place(pick({ len: 1.0 }), 0.3, 0, 0.42)), M.prop, { pos: [5.6, 0, -3.5] }));
  const signs = [[-2.7, -3.3, ['OUR', 'LIGHT'], 8, SM.salt, SM.rust], [1.75, -3.7, ['TEN', 'DAYS'], -7, SM.mustard, SM.iron], [-5.0, -3.6, ['NO SALT', 'NO SEA'], 5, SM.salt, SM.royal], [5.1, -2.3, ['SHUT'], -10, SM.coral, SM.salt]];
  signs.forEach(([x, z, lines, tilt, c, ink], i) => { if (low && i > 1) return; set.add(deco(node('placard' + i, placard({ lines, h: 2.3, w: 1.05, color: c, ink }), M.prop, { pos: [x, 0, z], rot: [0, tilt, tilt * 0.6] }))); });
  scene.root.add(mergeStatic(set, 'set'));

  // ---- far: the town on its rise to the left, the lamp-house on its rock to the right
  const far = group('far');
  far.add(node('town', townBank({ w: 30, d: 10, h: 7, rows: 3, seed: 6, lit: night ? 0.3 : 0.12, tower: false }), low ? M.farFlat : M.far, { pos: [-30, 0, -40], rot: [0, 30, 0] }));
  const LH = [-9.5, 0, -58];
  const lh = lampHouse({ h: 9, r: 2.1 });
  far.add(node('lamp-rock', saltHeap({ r: 9, h: 11, seed: 4, top: '#d8ccff', low: '#a898e8' }), low ? M.farFlat : M.far, { pos: [LH[0], 0, LH[2]] }), node('lamp-house', lh, low ? M.farFlat : M.far, { pos: [LH[0], 9.6, LH[2]] }));
  scene.root.add(mergeStatic(far, 'far'));
  const lhLamp = [LH[0], 9.6 + lh.anchors.lamp[1], LH[2]];

  // crystals of salt in the ground catching the light: one instanced draw
  if (!low) {
    const glint = node('glints', cobble(), M.flat); glint.castShadow = false;
    scatter(glint, 140, () => { const x = -9 + r() * 18, z = GATE_Z + 0.6 + r() * 8.5; if (Math.abs(x) < 2.2) return r() < 0.5 ? null : { m: m4.trs(x, 0.004, z, 0, r() * 360, 0, 0.12 + r() * 0.1), color: night ? '#dfe6ff' : '#fff0d0' }; return { m: m4.trs(x, 0.004, z, 0, r() * 360, 0, 0.14 + r() * 0.16), color: r() < 0.5 ? (night ? '#ffffff' : '#fffaf0') : (night ? '#cfd8ff' : '#ffe6c0') }; });
    scene.root.add(glint);
  }

  // ---- the side door: a leaf that swings in, and what is behind it
  const doorPivot = group('door-pivot', { pos: [HINGE[0], 0, HINGE[2] - 0.2] });
  const leaf = node('door-leaf', merge(tint(place(box(DW, DH, 0.08), DW / 2, DH / 2, 0), SM.enamel), tint(place(box(DW - 0.2, 0.1, 0.03), DW / 2, DH * 0.3, 0.05), SM.enamelDark), tint(place(box(DW - 0.2, 0.1, 0.03), DW / 2, DH * 0.75, 0.05), SM.enamelDark), tint(place(cylinder(0.05, 0.05, 0.05, 6), DW - 0.16, DH * 0.5, 0.06, 90, 0, 0), SM.brass)), M.prop); leaf.castShadow = false;
  doorPivot.add(leaf); scene.root.add(doorPivot);
  const hearth = node('hearth', setOutline(setGlow(tint(place(box(DW + 0.3, DH + 0.2, 0.05), DOOR[0], DH / 2, DOOR[2] - 0.75), '#ffc878'), 1), 0), M.flat, { visible: false }); hearth.castShadow = false;
  const spill = node('spill', setOutline(setGlow(tint(fromArrays([-DW / 2, 0, 0, DW / 2, 0, 0, -DW * 1.5, 0, 3.6, DW * 0.9, 0, 3.8], [0, 2, 3, 0, 3, 1], null, 180), '#ffd890'), 0.9), 0), M.flat, { pos: [DOOR[0], 0.009, DOOR[2] + 0.2], visible: false }); spill.castShadow = false;
  scene.root.add(hearth, spill);

  // ---- the line: miners with their lamps, both sides of the road and across the gate
  const spots = [];
  for (const sx of [-1, 1]) for (let j = 0; j < 3; j++) for (let i = 0; i < 5; i++) { const x = sx * (1.9 + i * 0.72 + (r() - 0.5) * 0.24), z = -2.0 - j * 0.72 + (r() - 0.5) * 0.2 - i * 0.1; if (Math.hypot(x - BRZ[sx < 0 ? 0 : 1][0], z - BRZ[sx < 0 ? 0 : 1][2]) < 0.6) continue; spots.push({ pos: [x, 0, z], face: -sx * (12 + r() * 30), s: 0.92 + r() * 0.2 }); }
  for (let i = 0; i < 6; i++) spots.push({ pos: [-1.5 + i * 0.6 + (r() - 0.5) * 0.15, 0, GATE_Z + 0.75 + (r() - 0.5) * 0.2], face: (r() - 0.5) * 24, s: 0.95 + r() * 0.16 });
  for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = spots[i]; spots[i] = spots[j]; spots[j] = t; }
  const sprites = scene.sprites = createSprites(low ? 192 : 448);
  const folk = crowd({ spots, material: M.prop, sprites, seed: 7, detail: low ? 0 : 1, hold: 'lantern', colors: ['#ffd8b8', '#c4dcff', '#ffcfdc', '#d0f0c8', '#ffeaa8', '#dccfff'], glowSize: 0.6, amount: 1, variants: low ? 1 : 2 });
  scene.root.add(folk.node);

  // ---- fire: both baskets and both braziers in one draw
  const fireAt = [[fireL[0], fireL[1] + 0.02, fireL[2]], [fireR[0], fireR[1] + 0.02, fireR[2]], ...BRZ.map((p) => [p[0], p[1] + bz.anchors.fire[1], p[2]])];
  const fire = flameBank({ spots: [{ pos: fireAt[0], s: 2.3 }, { pos: fireAt[1], s: 2.1 }, { pos: fireAt[2], s: 1.3 }, { pos: fireAt[3], s: 1.3 }], material: M.speck });
  scene.root.add(fire.node);

  // ---- sky
  const clouds = cloudBank({ count: low ? 4 : 7, seed: 12, arc: [150, 215], radius: [250, 420], height: [30, 150], size: [0.7, 1.4], speed: 0.04, style: low ? 'painted' : 'solid', ...L.cloud });
  scene.root.add(clouds.node);

  const actors = group('actors'); scene.root.add(actors);
  const foreground = mergeStatic(group('fg', {}, node('fg-heap', saltHeap({ r: 0.9, h: 0.6, seed: 9 }), M.prop, { pos: [-2.6, 0, 3.1] }), node('fg-pick', pick({ len: 1.1 }), M.prop, { pos: [-2.2, 0, 2.9], rot: [0, 40, 0] }), node('fg-crate', crate({ s: 0.5, seed: 12 }), M.prop, { pos: [2.5, 0, 3.0], rot: [0, -18, 0] })), 'foreground');
  scene.root.add(foreground);

  // ---- lamps
  const lamps = [
    { name: 'cresset-l', pos: [fireAt[0][0], fireAt[0][1] + 0.3, fireAt[0][2] + 0.5], color: '#ffa850', radius: 8, base: 1.0, flicker: 0, fire: 0 },
    { name: 'cresset-r', pos: [fireAt[1][0], fireAt[1][1] + 0.3, fireAt[1][2] + 0.5], color: '#ffa850', radius: 7.5, base: 0.95, flicker: 0, fire: 1 },
    { name: 'brazier-l', pos: [fireAt[2][0], fireAt[2][1] + 0.35, fireAt[2][2]], color: '#ff9a48', radius: 5.2, base: 1.15, flicker: 0, fire: 2 },
    { name: 'brazier-r', pos: [fireAt[3][0], fireAt[3][1] + 0.35, fireAt[3][2]], color: '#ff9a48', radius: 5.2, base: 1.15, flicker: 0, fire: 3 },
    { name: 'door', pos: [DOOR[0] - 0.1, 1.1, DOOR[2] + 0.9], color: '#ffc070', radius: 4.6, base: 0, flicker: 0, fixed: true },
    { name: 'tower', pos: anchorAt(hf, 'lamp', HEAD, 14), color: '#ffb060', radius: 7, base: 1.0 },
  ];
  const glows = fireAt.map((p, i) => ({ sprite: sprites.add({ kind: 'glow', pos: [p[0], p[1] + 0.25, p[2]], size: i < 2 ? 3.4 : 2.0, color: '#ff9a40', alpha: 0 }), base: night ? 0.62 : 0.45, flick: 1 }));
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: lamps[5].pos, size: 2.0, color: '#ffb450', alpha: 0 }), base: 0.5 });
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: lhLamp, size: 9, color: SM.still, alpha: 0 }), base: L.still * 0.6, fixed: true });
  const lhHalo = sprites.add({ kind: 'glow', pos: lhLamp, size: 20, color: SM.stillDeep, alpha: 0 });
  const doorGlow = sprites.add({ kind: 'glow', pos: [DOOR[0], 1.0, DOOR[2] + 0.1], size: 2.4, color: '#ffc060', alpha: 0 });

  let door = 0, doorNow = 0, mood = 0.25, moodNow = 0.25, nextEmber = 0, nextSmoke = 0, nextGust = 2;
  const rnd = rng(19), P = [0, 0, 0], V = [0, 0, 0], FOLK = { lit: 1, lively: 0.25 }, stackTop = [STACK[0] - 0.25, STACK_H + 0.2, STACK[2]];
  function openDoor(v) { door = Math.max(0, Math.min(1, v)); }
  function setCrowd(a) { folk.setAmount(Math.max(0, Math.min(1, a))); }
  function setMood(v) { mood = Math.max(0, Math.min(1, v)); }
  function cue(id) {
    switch (id) {
      case 'ch2.s1.c01': openDoor(0); setMood(0.22); return true;
      case 'ch2.s1.c03': case 'ch2.s1.c10': setMood(0.6); return true;
      case 'ch2.s1.c15': setMood(0.25); return true;
      case 'ch2.s1.c17': openDoor(1); setMood(0.2); return true;
      case 'ch2.s1.c22': openDoor(1); return true;
      default: return false;
    }
  }
  const TASK = { pos: [DOOR[0], 1.0, DOOR[2] + 0.2], stand: [DOOR[0] - 0.5, DOOR[2] + 1.2], set: openDoor };
  const task = (type) => (type === 'side-door' ? TASK : null);
  function tick(time, dt, pw, live) {
    doorNow += (door - doorNow) * Math.min(1, dt * 4);
    leaf.setRot(0, 78 * doorNow, 0); hearth.visible = spill.visible = doorNow > 0.02; spill.setScale(0.3 + 0.7 * doorNow, 1, 1);
    env.points[4].intensity = 1.5 * doorNow; doorGlow.alpha = 0.6 * doorNow;
    moodNow += (mood - moodNow) * Math.min(1, dt * 3); FOLK.lively = moodNow; FOLK.lit = Math.min(1.3, 0.35 + 0.65 * pw); folk.update(time, dt, FOLK);
    lhHalo.alpha = L.still * (0.2 + 0.07 * Math.sin(time * 0.9));
    clouds.update(time);
    if (!live) return;
    if (time > nextEmber) { // sparks off the fires, climbing and drifting right
      nextEmber = time + 0.09; const p = fireAt[Math.floor(rnd() * fireAt.length)];
      P[0] = p[0] + (rnd() - 0.5) * 0.3; P[1] = p[1] + 0.4; P[2] = p[2]; V[0] = 0.25 + rnd() * 0.5; V[1] = 0.9 + rnd() * 0.9; V[2] = 0.1;
      sprites.spawn({ kind: 'glow', pos: P, vel: V, size: 0.07 + rnd() * 0.07, life: 1.6 + rnd(), color: '#ffc060', alpha: 0.95, drag: 0.4 });
    }
    if (time > nextSmoke) { nextSmoke = time + 0.6; sprites.puff(stackTop, { count: 1, size: 1.5, rise: 0.9, spread: 0.3, life: 4.5, color: L.smoke }); }
    if (!low && time > nextGust) { nextGust = time + 3.2 + rnd() * 2; P[0] = -6 + rnd() * 5; P[1] = 2.5 + rnd() * 3; P[2] = -5 + rnd() * 4; V[0] = 1.8; V[1] = 0.1; V[2] = 0.2; sprites.gust(P, { vel: V, size: 1 + rnd() * 0.5, life: 2.2, alpha: 0.7, color: night ? '#c6d6ff' : '#fff6e6' }); }
  }

  return shell({
    id: 'picket', light, L, scene, cameras: CAMERAS, actors, foreground, lamps, glows, fire, tick, house: false,
    marks: {
      ...stageMarks(), focus: fireAt[0], notice: NOTICE,
      gate: { pos: [0, 0, GATE_Z + 1.5], face: 0 }, door: { pos: [DOOR[0] - 0.3, 0, DOOR[2] + 1.1], face: 0 },
      back: [[-3.4, -0.6], [-2.6, -0.9], [-1.8, -0.7], [1.8, -0.7], [2.6, -0.9], [3.4, -0.6]],
    },
    extra: { openDoor, setCrowd, setMood, cue, task, crowd: folk },
  });
}

export const picket = { id: 'picket', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default picket;
