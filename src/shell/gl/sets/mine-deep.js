// SET: mine-deep. Gallery nine of the Saltmere pit, eleven hundred feet down: a rock gallery under timber sets, a lamp
// on its hook under the first cap beam, the cage at the foot of the shaft (stage left), tub rails running back into the
// dark past empty tubs, and the gallery office (stage right) where the assay book lies in its green cloth. The walls
// were stillsalt once, blue from floor to roof. Now they are rock, with a few last shards in the cracks and one thin
// seam far down the gallery.
// Chapter 2: ch2.s3 Down the Shafts.
//
//   import { mineDeep } from './sets/mine-deep.js';
//   const set = mineDeep.build(GL, { light: 'lamp', low: false });
//
// Same shape as sets/lantern-stalls.js. Figures face +Z, cameras look toward -Z (down the gallery). The strip
// x -4.4..4.4, z 0..1.6 is clear. There is no sky: the fog is the dark of the gallery, and it is blue, not black.
//
// What this set can do for its story:
//   setBook(0 | 1)        the assay book on the stand outside the office: 0 shut in its green cloth, 1 open (Ren reads it out)
//   setSeam(0..1)         how much stillsalt still shows (1 = as built: a few shards; 0 = none: "it's only rock")
//   dropCage(0..1)        the cage: 0 at the gallery floor, 1 hauled up out of sight
//   cue(lineId)           ch2.s3.c01 the cage lands; c06 the book is handed over; c09 it is open; c23 it is shut again
//   task('assay-book')    -> { pos, stand, set(v) } (v >= 1 opens it)
//   task('gallery-nine')  -> { pos, set(v) } ch2.s3's encounter: v = how far down the gallery; the shards show, the shut book glows at 1
// marks: a, b, c, two, party, opposition as everywhere, plus
//   book { pos, face }: at the stand   cage { pos, face }: stepping out of the cage   wall { pos, face }: at the bare wall Hesper shows them
//   focus: the hook lamp   page: world point of the open book

import { rng, m4 } from '../math.js';
import { merge, tint, place, box, plane, cylinder, setGlow, setOutline, fromArrays } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic } from '../scene.js';
import { createSprites } from '../sprites.js';
import { rayMesh, rayMaterial } from '../fx.js';
import { anchorAt, crate, barrel, sack, ropeCoil, ledgerBook, scatter, cobble, rock } from './kit.js';
import {
  SM, ch2Materials, shell, lightOf, stageMarks, norm3, cave, timberSet, oreCart, rails, cage, pick, crystals, hangLamp, lectern, handLamp, pixelText, paneWindow, roomWall, keg, lampPool,
} from './kit-ch2.js';

const FRONT = 3.6, LEN = 20, W = 12.4, HGT = 5.6, NARROW = 0.44;

const LIGHTS = {
  lamp: {
    preset: 'night', power: 1.15,
    env: {
      key: { dir: norm3([-0.34, 0.62, 0.7]), color: '#efe6ff' },
      shadow: { tint: '#4a3fc4', lift: 0.3, saturate: 1.35, on: false },
      ambient: { sky: '#5a4ce0', ground: '#3a2c9c', amount: 0.15 },
      rim: { color: '#9fe8ff', amount: 0.75, edge: 0.72 },
      fog: { color: '#2a28a8', density: 0.03, start: 12, max: 0.86 },
      sky: { zenith: '#1a1670', mid: '#24208a', midAt: 0.5, horizon: '#2c2aa8', below: '#241e84', stars: 0, moon: 0, sunDir: norm3([0, 1, -0.2]) },
      water: null,
    },
  },
};

const CAMERAS = {
  wide: { target: [0, 1.9, -0.6], dist: 8.6, yaw: 2, pitch: 3, fov: 50, aspect: 0.46, shadowCenter: [0, 0, -1.4], shadowRadius: 7.5 },
  two: { target: [0, 1.12, 0.6], dist: 6.0, yaw: -15, pitch: 5, fov: 31, aspect: 0.46, shadowCenter: [0, 0, 0.3], shadowRadius: 3.6 },
  close: { target: [0.02, 0.86, 0.8], dist: 3.9, yaw: 21, pitch: 3, fov: 28, aspect: 0.46, shadowCenter: [0, 0, 0.5], shadowRadius: 2.6 },
  low: { target: [0.2, 1.9, -0.3], dist: 6.2, yaw: -10, pitch: -11, fov: 56, aspect: 0.46, shadowCenter: [0, 0, -1], shadowRadius: 7.5 },
  stage: { target: [0.2, 1.2, 0.1], dist: 9.8, yaw: -12, pitch: 6, fov: 26, aspect: 1.95, shadowCenter: [0, 0, -0.8], shadowRadius: 7.5, outline: 0.7 },
  landscape: { target: [0, 1.9, -1.2], dist: 9.6, yaw: 4, pitch: 5, fov: 40, aspect: 1.6, shadowCenter: [0, 0, -1.5], shadowRadius: 9 },
};

function build(engine = null, { light: lightName = 'lamp', low = false } = {}) {
  const [light, L] = lightOf('mine-deep', LIGHTS, ALIAS[lightName] || lightName);
  const M = ch2Materials(), r = rng(1109);
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  const deco = (n) => { n.castShadow = false; return n; };
  const halfAt = (z) => (W / 2) * (1 - NARROW * ((FRONT - z) / LEN)); // the gallery's half width at floor level

  // ---- the rock
  const rockG = group('rock');
  rockG.add(node('cave', cave({ w: W, h: HGT, len: LEN, seg: low ? 10 : 14, rings: low ? 9 : 13, seed: 7, lump: 1.25, flat: 0.62, narrow: NARROW, colors: ['#3428a0', '#4c40c4', '#3c30ac', '#5e50d6', '#463abc', '#6c5ee0'], bands: 6 }), M.rock, { pos: [0, -0.15, FRONT] }));
  rockG.add(node('end', tint(place(box(9, 6, 0.4), 0, 3, FRONT - LEN - 0.1), '#241e84'), M.rock));
  scene.root.add(mergeStatic(rockG, 'rock'));
  const floorG = group('floor');
  floorG.add(node('floor', tint(place(plane(16, LEN + 8, 1, 1), 0, 0, FRONT - LEN / 2 + 2), '#6c5ecc'), M.ground));
  // a trodden way down the middle, paler
  floorG.add(deco(node('way', setOutline(tint(fromArrays([-2.3, 0.006, 5, 2.3, 0.006, 5, -0.6, 0.006, FRONT - LEN, 1.9, 0.006, FRONT - LEN], [0, 1, 2, 1, 3, 2], null, 180), '#8c7ee6'), 0), M.flat)));
  scene.root.add(mergeStatic(floorG, 'floor'));

  // ---- timber, track, the cage, the office
  const props = group('props');
  const SETS = [[-2.2, 6.4, 3.75, 1], [-5.6, 5.4, 3.5, 2], [-9.0, 4.4, 3.25, 3], [-12.4, 3.6, 3.0, 4]];
  const tsets = SETS.map(([z, w, h, seed], i) => { if (low && i > 2) return null; const m = timberSet({ w, h, seed, t: 0.4 - i * 0.03 }); props.add(node('set' + i, m, M.prop, { pos: [0.3 * i, 0, z], rot: [0, (r() - 0.5) * 5, 0] })); return m; });
  // lagging boards in the roof between the first two sets
  for (let i = 0; i < 5; i++) props.add(deco(node('lag', tint(place(box(0.5, 0.07, 3.3), -2.2 + i * 1.1, SETS[0][2] + 0.86 - Math.abs(i - 2) * 0.12, -3.9, 0, (r() - 0.5) * 6, (i - 2) * -7), i % 2 ? SM.timber : SM.timberPale), M.prop)));
  // the gallery's name board hangs from the first cap
  const sign = merge(tint(place(box(2.2, 0.5, 0.06), 0, 0, 0), SM.rust), place(pixelText('GALLERY 9', { s: 0.24, color: SM.salt, glow: 0.25 }), 0, 0, 0.04), tint(place(cylinder(0.012, 0.012, 0.3, 4), -1.0, 0.26, 0), SM.iron), tint(place(cylinder(0.012, 0.012, 0.3, 4), 1.0, 0.26, 0), SM.iron));
  props.add(deco(node('sign', sign, M.prop, { pos: [-0.85, SETS[0][2] - 0.5, SETS[0][0] + 0.25], rot: [0, 0, 2.5] })));
  // the hook lamp: the light of the scene
  const HOOK = [0.7, SETS[0][2] - 0.02, SETS[0][0] + 0.1];
  const hl = hangLamp({ drop: 0.75, r: 0.36, shade: SM.rust });
  props.add(deco(node('hook-lamp', hl, M.prop, { pos: HOOK })));
  const lampPos = [HOOK[0], HOOK[1] + hl.anchors.lamp[1], HOOK[2]];
  // tub rails down the right of the gallery, a tub near, a tub far, both empty
  const RX = 2.6;
  props.add(node('rails', rails({ len: 15.5, seed: 2 }), M.prop, { pos: [RX - 0.9, 0, -8.6], rot: [0, 90 + 6.5, 0] }));
  props.add(node('buffer', merge(tint(place(box(1.2, 0.5, 0.2), 0, 0.3, 0), SM.timberDark), tint(place(box(0.2, 0.7, 0.24), -0.45, 0.35, 0), SM.rust), tint(place(box(0.2, 0.7, 0.24), 0.45, 0.35, 0), SM.rust)), M.prop, { pos: [RX, 0, -0.75], rot: [0, 6, 0] }));
  props.add(node('tub1', oreCart({ load: 0, seed: 1 }), M.prop, { pos: [RX - 0.4, 0.02, -4.3], rot: [0, 96, 0] }));
  if (!low) props.add(node('tub2', oreCart({ load: 0, seed: 2, color: SM.ironBlue }), M.prop, { pos: [RX - 1.2, 0.02, -10.3], rot: [0, 97, 0] }));
  // the cage at the shaft foot, stage left: guides going up into the roof
  const CAGE = [-3.7, 0, -2.9];
  for (const sx of [-1, 1]) props.add(deco(node('guide', tint(place(box(0.14, 6, 0.14), CAGE[0] + sx * 0.95, 3, CAGE[2] - 0.5), SM.timberDark), M.prop)));
  props.add(node('shaft-curb', merge(tint(place(box(2.4, 0.16, 0.2), 0, 0.08, 1.05), SM.timber), tint(place(box(0.2, 0.16, 2.3), -1.1, 0.08, 0), SM.timber), tint(place(box(0.2, 0.16, 2.3), 1.1, 0.08, 0), SM.timber)), M.prop, { pos: CAGE }));
  // the office: a timber front let into the right wall, a lit window, a door, its name
  const OFF = [4.35, 0, -3.3], OFF_YAW = -52;
  const office = group('office', { pos: OFF, rot: [0, OFF_YAW, 0] });
  office.add(node('front', roomWall({ w: 3.4, h: 2.7, t: 0.16, color: SM.timberPale, openings: [{ x: -0.75, w: 1.1, sill: 1.0, top: 2.0 }, { x: 0.95, w: 0.9, sill: 0, top: 2.05 }] }), M.prop));
  office.add(deco(node('win', paneWindow({ w: 1.1, h: 1.0, arch: false, glass: '#ffd070', glass2: '#ffb050', glow: 1, bars: 1, rows: 2, frame: SM.timberDark, depth: 0.16 }), M.prop, { pos: [-0.75, 1.0, 0] })));
  office.add(deco(node('door', merge(tint(place(box(0.86, 2.0, 0.06), 0, 1.0, -0.08), SM.enamel), tint(place(box(0.7, 0.08, 0.03), 0, 0.6, -0.04), SM.enamelDark), tint(place(box(0.7, 0.08, 0.03), 0, 1.5, -0.04), SM.enamelDark), tint(place(cylinder(0.04, 0.04, 0.05, 6), 0.3, 1.0, -0.03, 90, 0, 0), SM.brass)), M.prop, { pos: [0.95, 0, 0] })));
  office.add(deco(node('battens', merge([-1.6, -0.1, 1.6].map((x) => tint(place(box(0.14, 2.7, 0.06), x, 1.35, 0.03), SM.timberDark))), M.prop)));
  office.add(node('eave', tint(place(box(3.8, 0.12, 0.9), 0, 2.76, 0.25, 12, 0, 0), SM.rust), M.prop));
  office.add(deco(node('name', merge(tint(place(box(1.5, 0.4, 0.05), 0, 0, 0), SM.iron), place(pixelText('ASSAY', { s: 0.24, color: SM.mustard, glow: 0.3 }), 0, 0, 0.03)), M.prop, { pos: [0.1, 2.35, 0.06] })));
  props.add(office);
  // the stand outside it, a lamp on a keg, the tally
  const STAND = [2.05, 0, -1.55], STAND_YAW = -28;
  const stand = lectern({ h: 0.86, w: 0.84 });
  props.add(node('stand', stand, M.prop, { pos: STAND, rot: [0, STAND_YAW, 0] }));
  const KEG = [3.05, 0, -1.25];
  props.add(node('keg', keg({ r: 0.26, h: 0.6 }), M.prop, { pos: KEG }));
  const hand = handLamp({ s: 1.5 });
  props.add(deco(node('hand-lamp', hand, M.prop, { pos: [KEG[0], 0.6, KEG[2]] })));
  const handPos = [KEG[0], 0.6 + hand.anchors.lamp[1], KEG[2]];
  // this year's yield, chalked on a slate by the office door: 206
  props.add(deco(node('tally', merge(tint(place(box(1.2, 0.9, 0.05), 0, 0, 0), SM.slateDark), tint(place(box(1.3, 1.0, 0.03), 0, 0, -0.03), SM.timberDark), place(pixelText('CASKS', { s: 0.14, color: SM.chalk, glow: 0.3 }), 0, 0.26, 0.03), place(pixelText('206', { s: 0.36, color: '#ffe9a0', glow: 0.8 }), 0, -0.1, 0.03)), M.prop, { pos: [3.05, 1.95, -1.95], rot: [0, OFF_YAW + 14, -3] })));
  // tools and stores
  props.add(node('stores-l', merge(place(crate({ s: 0.6, seed: 3, color: SM.timber }), 0, 0, 0), place(crate({ s: 0.46, seed: 8, color: SM.timberPale }), 0.1, 0.62, 0, 0, 22, 0), place(barrel({ r: 0.28, h: 0.7 }), 0.85, 0, 0.3), place(pick({ len: 1.1 }), -0.5, 0, 0.36), place(pick({ len: 1.0 }), -0.75, 0, 0.2, 0, 60, 0), place(ropeCoil({ r: 0.24 }), 0.7, 0, 0.95)), M.prop, { pos: [-5.0, 0, -0.9], rot: [0, 24, 0] }));
  if (!low) props.add(node('stores-r', merge(place(sack({ seed: 4, s: 0.38 }), 0, 0, 0), place(sack({ seed: 7, s: 0.32 }), 0.5, 0, 0.15, 0, 50, 0), place(crate({ s: 0.5, seed: 5 }), -0.7, 0, -0.2, 0, 14, 0)), M.prop, { pos: [5.2, 0, -0.5], rot: [0, -30, 0] }));
  for (const [x, z, s, seed] of [[-4.6, -6.2, 1.2, 3], [-3.2, -11.5, 1.0, 5], [4.2, -7.4, 1.1, 8], [-5.6, 1.6, 1.0, 2], [5.6, 1.9, 1.2, 6]]) props.add(node('rock', rock({ seed, s, low: '#5a4cc0', high: '#8a7cec' }), M.prop, { pos: [x, -0.05, z] }));
  scene.root.add(mergeStatic(props, 'props'));

  // ---- what is left of the salt: a few shards in the cracks, a hand-wide seam far down on the right. One node, so setSeam can dim it.
  const still = group('still');
  const SHARDS = [[-4.9, 1.5, -4.6, 0, 0, -62, 0.5, 5, 1], [4.3, 2.6, -6.2, 0, 0, 58, 0.42, 4, 2], [-3.5, 0.0, -8.4, 0, 0, -14, 0.5, 5, 3], [-2.2, 3.9, -6.6, 0, 0, 170, 0.36, 3, 4], [3.9, 0.0, -11.2, 0, 0, 20, 0.44, 4, 5], [-5.3, 0.1, 0.6, 0, 0, -22, 0.32, 3, 6]];
  SHARDS.forEach(([x, y, z, rx, ry, rz, s, n, seed], i) => { if (low && i > 3) return; still.add(node('shard' + i, crystals({ n, s, seed }), M.prop, { pos: [x, y, z], rot: [rx, ry, rz] })); });
  // the seam of gallery twelve, as far as the eye goes: a thin crooked bright line and a few points on it
  { const parts = []; let x = 1.1, y = 0.5; for (let i = 0; i < 7; i++) { const nx = x + 0.12 + r() * 0.2, ny = y + 0.3 + r() * 0.25; parts.push(place(box(0.07, Math.hypot(nx - x, ny - y) + 0.04, 0.05), (x + nx) / 2, (y + ny) / 2, 0, 0, 0, -Math.atan2(nx - x, ny - y) * 180 / Math.PI)); x = nx; y = ny; } still.add(node('seam', setGlow(tint(merge(parts), SM.still), 1), M.flat, { pos: [0.3, 0, FRONT - LEN + 0.16] })); }
  const stillNode = mergeStatic(still, 'still'), stillParts = []; stillNode.traverse((n) => { n.castShadow = false; stillParts.push(n); });
  scene.root.add(stillNode);

  // the hook lamp's pool on the gallery floor (drawn: warm light on blue rock shows nothing otherwise)
  const pool = node('pool', lampPool({ r: 2.7, color: '#a47ee0', hot: '#eca47c', glow: 0.45, seed: 2, squash: 0.7 }), M.flat, { pos: [lampPos[0] - 0.3, 0.012, lampPos[2] + 1.2] }); pool.castShadow = false;
  scene.root.add(pool);

  // ---- the cage (it moves) and the light down the shaft
  const cageNode = node('cage', cage({ w: 1.5, h: 2.3 }), M.prop, { pos: CAGE, rot: [0, 12, 0] });
  scene.root.add(cageNode);
  if (!low) {
    const beams = merge(tint(place(rayMesh(5.6, 0.5, 1.3, 12), CAGE[0], 5.7, CAGE[2]), '#8fc8ff'), tint(place(rayMesh(2.9, 0.16, 1.5, 14), lampPos[0], lampPos[1] + 0.1, lampPos[2]), '#ffc060'));
    scene.root.add(node('beams', beams, rayMaterial({ power: 1.4, near: 0.42, far: 0 })));
  }

  // ---- the assay book: shut in its green cloth, or open
  const top = anchorAt(stand, 'top', STAND, STAND_YAW), tilt = stand.anchors.tilt;
  const shut = node('book-shut', merge(tint(place(box(0.5, 0.11, 0.66), 0, 0.055, 0), '#2fba7e'), tint(place(box(0.52, 0.03, 0.1), 0, 0.12, 0), SM.mustard), tint(place(box(0.44, 0.09, 0.62), 0.04, 0.055, 0), SM.paper)), M.prop, { pos: top, rot: [tilt, STAND_YAW, 0] }); shut.castShadow = false;
  const open = node('book-open', setGlow(ledgerBook({ w: 0.86, d: 0.6, thick: 0.06, cover: '#2fba7e', ribbon: SM.mustard }), 0.12), M.prop, { pos: top, rot: [tilt, STAND_YAW, 0], visible: false }); open.castShadow = false;
  scene.root.add(shut, open);

  // glints in the floor where salt was trodden in: one instanced draw
  if (!low) {
    const glint = node('glints', cobble(), M.flat); glint.castShadow = false;
    scatter(glint, 90, () => { const z = 2.5 - r() * 15, x = (r() - 0.5) * 2 * (halfAt(z) - 0.8); return { m: m4.trs(x, 0.005, z, 0, r() * 360, 0, 0.1 + r() * 0.16), color: r() < 0.3 ? '#b6f0ff' : '#9486ea' }; });
    scene.root.add(glint);
  }

  const actors = group('actors'); scene.root.add(actors);
  const foreground = mergeStatic(group('fg', {}, node('fg-rock', rock({ seed: 12, s: 1.1, low: '#4a3fb0', high: '#7a6ce0' }), M.prop, { pos: [-2.7, -0.05, 3.1] }), node('fg-crys', crystals({ n: 3, s: 0.3, seed: 9 }), M.prop, { pos: [-2.3, 0.25, 3.0], rot: [0, 0, -30] }), node('fg-crate', crate({ s: 0.52, seed: 14 }), M.prop, { pos: [2.6, 0, 3.0], rot: [0, -20, 0] })), 'foreground');
  scene.root.add(foreground);

  // ---- lamps
  const sprites = scene.sprites = createSprites(low ? 128 : 320);
  const winAt = [OFF[0] - 0.9, 1.5, OFF[2] + 0.9];
  const lamps = [
    { name: 'hook', pos: lampPos, color: '#ffc468', radius: 7.2, base: 1.4 },
    { name: 'office', pos: winAt, color: '#ffb450', radius: 5.0, base: 1.25 },
    { name: 'hand', pos: [handPos[0], handPos[1] + 0.2, handPos[2] + 0.2], color: '#ffd080', radius: 3.6, base: 1.2 },
    { name: 'shaft', pos: [CAGE[0], 3.4, CAGE[2] + 0.4], color: '#8fc8ff', radius: 6.0, base: 1.3, flicker: 0, fixed: true },
    { name: 'far', pos: [1.0, 2.6, -9.2], color: '#ffb860', radius: 6.0, base: 1.1 },
    { name: 'still', pos: [-4.2, 1.5, -4.8], color: SM.still, radius: 4.2, base: 1.0, flicker: 0.12, fixed: true },
  ];
  const glows = [
    { sprite: sprites.add({ kind: 'glow', pos: [lampPos[0], lampPos[1] - 0.05, lampPos[2]], size: 2.6, color: '#ffb850', alpha: 0 }), base: 0.6 },
    { sprite: sprites.add({ kind: 'glow', pos: winAt, size: 2.2, color: '#ffa840', alpha: 0 }), base: 0.42 },
    { sprite: sprites.add({ kind: 'glow', pos: handPos, size: 1.2, color: '#ffc060', alpha: 0 }), base: 0.6 },
    { sprite: sprites.add({ kind: 'glow', pos: [1.0, 2.75, -9.0], size: 1.5, color: '#ffb450', alpha: 0 }), base: 0.7 },
  ];
  const shardGlows = SHARDS.map(([x, y, z, , , , s]) => sprites.add({ kind: 'glow', pos: [x, y + 0.15, z + 0.1], size: 1.6 * s + 0.5, color: SM.still, alpha: 0 }));
  const seamGlow = sprites.add({ kind: 'glow', pos: [1.9, 1.7, FRONT - LEN + 0.4], size: 3.4, color: SM.stillDeep, alpha: 0 });

  let seam = 1, book = 0, cageUp = 0, cageNow = 0, nextDrip = 1.2, nextGlint = 0;
  const rnd = rng(23), P = [0, 0, 0];
  function setBook(v) { book = v >= 1 ? 1 : 0; shut.visible = !book; open.visible = !!book; }
  function setSeam(v) { seam = Math.max(0, Math.min(1, v)); }
  function dropCage(v) { cageUp = Math.max(0, Math.min(1, v)); }
  function cue(id) {
    switch (id) {
      case 'ch2.s3.c01': setBook(0); dropCage(0); return true;
      case 'ch2.s3.c06': setBook(0); sprites.sparkle(top, { count: 4, size: 0.3, spread: 0.4, life: 0.8, color: '#c8ffd8' }); return true;
      case 'ch2.s3.c09': setBook(1); walkV = -1; return true;
      case 'ch2.s3.c23': setBook(0); return true;
      default: return false;
    }
  }
  const TASK = { pos: [top[0], top[1] + 0.1, top[2]], stand: [STAND[0] - 0.35, STAND[2] + 0.75], set(v) { setBook(v >= 1 ? 1 : 0); } };
  // ch2.s3's encounter (the walk down gallery nine): the last shards catch the lamp as they go, and the book in its cloth is lit when they reach it
  const bookGlow = sprites.add({ kind: 'glow', pos: [top[0], top[1] + 0.12, top[2] + 0.1], size: 1.3, color: '#9dffc0', alpha: 0 });
  let walkV = -1;
  const WALK = { pos: [top[0], top[1] + 0.1, top[2]], set(v) { walkV = v; setBook(0); setSeam(0.1 + 0.9 * v); } };
  const task = (type) => (type === 'assay-book' ? TASK : type === 'gallery-nine' ? WALK : null);
  function tick(time, dt, pw, live) {
    cageNow += (cageUp - cageNow) * Math.min(1, dt * 2.2);
    bookGlow.alpha = walkV > 0.9 ? (walkV - 0.9) * 10 * (0.55 + 0.15 * Math.sin(time * 3)) : 0;
    cageNode.position[1] = cageNow * 6.2 + (cageNow > 0.02 && cageNow < 0.98 ? Math.sin(time * 30) * 0.01 : 0); cageNode.visible = cageNow < 0.97;
    { const k = 0.62 + 0.38 * Math.min(1.3, pw / L.power) + 0.02 * Math.sin(time * 4.7); pool.setScale(k, 1, k); }
    const tw = 0.82 + 0.18 * Math.sin(time * 1.7);
    for (let i = 0; i < stillParts.length; i++) { const n = stillParts[i]; n.tint[0] = n.tint[1] = n.tint[2] = 0.25 + 0.75 * seam; }
    for (let i = 0; i < shardGlows.length; i++) shardGlows[i].alpha = (low && i > 3 ? 0 : 0.5) * seam * (0.8 + 0.2 * Math.sin(time * 2.3 + i * 1.9));
    seamGlow.alpha = 0.42 * seam * tw; env.points[5].intensity = 1.0 * seam * tw;
    if (!live) return;
    if (time > nextDrip) { nextDrip = time + 1.1 + rnd() * 1.6; P[0] = (rnd() - 0.5) * 7; P[2] = -1.5 - rnd() * 8; P[1] = 0.03; sprites.splash(P, { size: 0.5 + rnd() * 0.3, life: 1.0, spray: 0, color: '#b9c8ff' }); }
    if (seam > 0.05 && time > nextGlint) { nextGlint = time + 0.5; const s = SHARDS[Math.floor(rnd() * (low ? 4 : SHARDS.length))]; P[0] = s[0]; P[1] = s[1] + 0.2; P[2] = s[2] + 0.1; sprites.sparkle(P, { count: 1, size: 0.24, spread: 0.3, life: 0.8, color: '#dffcff' }); }
  }

  return shell({
    id: 'mine-deep', light, L, scene, cameras: CAMERAS, actors, foreground, lamps, glows, tick, house: false,
    motes: low ? null : { box: [-3.5, 3.5, 0.4, 3.4, -7, 1], every: 0.3, color: '#bfe8ff', size: 0.05, vel: [0.03, 0.02, 0.04], life: 6, alpha: 0.7 },
    marks: {
      ...stageMarks(), focus: lampPos, page: top,
      book: { pos: [STAND[0] - 0.3, 0, STAND[2] + 0.7], face: 150 }, cage: { pos: [CAGE[0] + 1.3, 0, CAGE[2] + 0.4], face: 60 }, wall: { pos: [-3.9, 0, -0.6], face: -60 },
    },
    extra: { setBook, setSeam, dropCage, cue, task },
  });
}

// the core's light names (src/core/stage.js LIGHTS) this set also answers to, so content can say 'interior' / 'day'
const ALIAS = { interior: 'lamp' };
export const mineDeep = { id: 'mine-deep', lights: [...Object.keys(LIGHTS), ...Object.keys(ALIAS)], cameras: Object.keys(CAMERAS), build };
export default mineDeep;
