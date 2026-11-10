// SET: cutter-brig. Below decks on the Audit cutter, the night it takes two people out of Vessery on one tide: two barred
// berths either side of a narrow passage, a brass lamp swinging between them with the roll of the ship, and at the end
// of the passage the companion ladder under an open hatch, where the moon comes down.
// Chapter 7: ch7.epi.01-06 (Ren in one berth, Thorne in the other. "Ren. The Line. Is it switched on?" "Yes.").
//
//   import { cutterBrig } from './sets/cutter-brig.js';
//   const set = cutterBrig.build(GL, { light: 'night', low: false });
//
// The shape is lantern-stalls' (see ../index.js). Figures face +Z; cameras look toward -Z, forward along the keel. The
// strip x -3.0..3.0, z 0..1.6 is clear deck (the brig's own flat: where a watch would stand). The ship's sides are the
// walls at x = -3.35 and 3.35, and the deck head runs back over the cameras, so no camera mark sees out of the hull.
//   marks.two / a / c   are INSIDE the berths, behind the bars: a cutscene with two people locks one in each (left: Ren)
//   marks.b             the passage, under the lamp;  marks.berths[2]  the same two spots by name;  marks.focus  the lamp
//   setSwing(0..2)      how hard the ship rolls (1 as built): the lamp, its light and the hanging oilskins go with it
// One light state, 'night': deep blue, moon through the hatch and the two ports, everything warm from the one lamp.
// setPower scales the lamp (and a little of the moon). low: true drops the ports' beams, the far clutter and the drips.

import { m4, quat, rng, DEG } from '../math.js';
import { merge, tint, place, box, cylinder, torus, setGlow, setOutline, fromArrays } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic, material } from '../scene.js';
import { createSprites } from '../sprites.js';
import { PAL, kitMaterials, anchorAt, pickLight, barrel, ropeCoil, planks, crate } from './kit.js';
import { C7, STD_MARKS, STD_CAMERAS, shell7, dirFrom, norm7, hullSide, deckHead, cellFront, cellBarXs, chalk, numerals, bunk, shipLantern, ladder7, seaChest, wall7, floorPatch, tiles, auditSeal, bar } from './kit-ch7.js';

const H = 2.55, SIDE = 3.35, ALLEY = 0.56, FRONT = -0.15, BACK = -3.1, BOW = -4.9, AFT = 17;
const LAMP_HOOK = [0, H - 0.14, -0.8], LAMP_DROP = 0.5, LAMP_S = 1.6;

const LIGHTS = {
  night: {
    preset: 'night', power: 1.15, sun: 0.25,
    env: {
      key: { dir: norm7([0.22, 0.74, 0.62]), color: '#8794f0' },
      shadow: { tint: '#2a30a4', lift: 0.12, saturate: 1.35 },
      ambient: { sky: '#5068e0', ground: '#6a58e0', amount: 0.25 },
      rim: { color: '#ffcf80', amount: 0.85, edge: 0.74 },
      fog: { color: '#2a3aa8', density: 0.006, start: 9, max: 0.4 },
      sky: { zenith: '#0c1a70', mid: '#1c3fb0', midAt: 0.45, horizon: '#4f82e6', below: '#3058c4', sunDir: dirFrom(0, 70), moon: 0, stars: 1 },
      water: null,
    },
  },
};

const CAMERAS = STD_CAMERAS({
  wide: { target: [0, 1.3, -0.6], dist: 8.4, yaw: 2.5, pitch: 4, fov: 45, shadowCenter: [0, 0, -0.8], shadowRadius: 6 },
  low: { target: [0, 1.5, -0.4], dist: 5.6, yaw: 5, pitch: -9, fov: 54, shadowCenter: [0, 0, -0.8], shadowRadius: 6 },
  stage: { target: [0, 1.0, 0.3], dist: 9.4, yaw: 6, pitch: 6, shadowCenter: [0, 0, -0.5], shadowRadius: 6.5 },
  landscape: { target: [0, 1.25, -0.8], dist: 8.6, yaw: 3, pitch: 4, fov: 40, shadowCenter: [0, 0, -1], shadowRadius: 7 },
});

/** An oilskin on a peg: a coat-shaped slab with a hood, hanging from the origin. */
function oilskin(color, seed) {
  const r = rng(seed);
  return merge(tint(place(box(0.5, 0.95, 0.16), 0, -0.62, 0, 0, 0, (r() - 0.5) * 6), color), tint(place(box(0.2, 0.7, 0.14), -0.32, -0.55, 0, 0, 0, -8), color), tint(place(box(0.2, 0.7, 0.14), 0.32, -0.55, 0, 0, 0, 8), color),
    tint(place(cylinder(0.17, 0.1, 0.24, 6), 0, -0.2, 0), color), tint(place(box(0.06, 0.1, 0.06), 0, -0.03, 0), C7.brass));
}

function build(engine = null, { light, low = false } = {}) {
  const picked = pickLight('cutter-brig', LIGHTS, light), L = picked.L; light = picked.name;
  const M = kitMaterials(), r = rng(7676);
  M.beam = material({ kind: 'beam', name: 'brig-beam', beam: { power: 0.7, near: 0.62, far: 0.04, steps: 0 }, outline: false });
  M.wall = material({ name: 'brig-wall', rim: 0, bandEdge: -0.15, outline: { width: 1.9, self: 0.65 }, castShadow: false });
  const zc = (BOW + AFT) / 2, zl = AFT - BOW;

  // ---- the shell: deck, the ship's two sides, the deck head with its hatch, the bulkheads
  const hull = group('hull');
  hull.add(node('deck', place(planks({ w: SIDE * 2 + 0.6, d: zl, plank: 0.42, seed: 3, along: 'z', colors: ['#f0a860', '#e39a54', '#f6b672'] }), 0, 0, zc), M.ground));
  const PORT_Z = [-1.55, 1.0];
  const sideL = hullSide({ len: zl, h: H, lean: 0.55, bay: 1.45, ports: PORT_Z.map((z) => -(z - zc)) }), sideR = hullSide({ len: zl, h: H, lean: 0.55, bay: 1.45, ports: PORT_Z.map((z) => z - zc) });
  hull.add(node('side-left', sideL, M.wall, { pos: [-SIDE, 0, zc], rot: [0, 90, 0] }), node('side-right', sideR, M.wall, { pos: [SIDE, 0, zc], rot: [0, -90, 0] }));
  const HATCH = [0, -4.0];
  hull.add(node('deck-head', deckHead({ w: SIDE * 2 + 7, d: zl, beams: 13, hatch: [0, HATCH[1] - zc, 1.25, 1.0], plank: '#aab4f6', beam: '#fff0d4' }), M.wall, { pos: [0, H, zc] }));
  { const carl = []; for (let z = BACK + 0.9; z < 15; z += 1.35) carl.push(tint(place(box(SIDE * 2 + 7, 0.13, 0.15), 0, H - 0.065, z), '#ffd9a8')); hull.add(node('carlings', merge(carl), M.wall)); }
  // the bulkhead at the back of the berths, with the way through to the ladder; the bow bulkhead beyond, with the Audit's seal on it
  hull.add(node('bulkhead', wall7({ w: SIDE * 2 + 1.2, h: H, t: 0.16, color: '#4a6ee0', openings: [{ x: 0, w: ALLEY * 2 - 0.1, top: 2.2, arch: true }] }), M.wall, { pos: [0, 0, BACK] }));
  hull.add(node('bulkhead-trim', merge(tint(place(box(SIDE * 2 + 1.2, 0.5, 0.05), 0, 0.25, BACK + 0.03), '#2f4ab8'), tint(place(box(SIDE * 2 + 1.2, 0.09, 0.06), 0, 0.54, BACK + 0.04), C7.brass)), M.wall));
  hull.add(node('bow', merge(tint(place(box(SIDE * 2 + 1.2, H, 0.2), 0, H / 2, BOW), '#fff0d2'), tint(place(box(SIDE * 2 + 1.2, 0.7, 0.05), 0, 0.35, BOW + 0.12), '#2d8fa8'), place(auditSeal({ r: 0.24, span: 1.3 }), -1.25, 1.5, BOW + 0.13), place(auditSeal({ r: 0.24, span: 1.3 }), 1.25, 1.5, BOW + 0.13)), M.wall));
  hull.traverse((n) => { n.castShadow = false; });

  // ---- the two berths
  const cells = group('cells'), CW = SIDE - 0.1 - ALLEY, CX = ALLEY + CW / 2, SW = FRONT - BACK, BAR_H = 2.3, RAIL = 0.74;
  for (const sx of [-1, 1]) {
    // the passage side is the berth's real front: bars from deck to deck head, the door and its brass lock at the after end
    cells.add(node('passage-side', cellFront({ w: SW, h: BAR_H, gap: 0.34, door: sx, rail: RAIL }), M.prop, { pos: [sx * ALLEY, 0, (FRONT + BACK) / 2], rot: [0, -sx * 90, 0] }));
    // the end toward the cameras is cut away like a toy's: a sill, the head beam, and the stubs of the bars, so a face is never behind one
    const stubs = [tint(place(box(CW, 0.12, 0.14), 0, 0.06, 0), C7.navy)];
    for (const x of cellBarXs(CW, 0.34)) stubs.push(tint(place(cylinder(0.028, 0.028, 0.34, 5), x, BAR_H - 0.36, 0), C7.navy), tint(place(cylinder(0.028, 0.028, 0.16, 5), x, 0.1, 0), C7.navy));
    cells.add(node('cutaway', merge(stubs), M.prop, { pos: [sx * CX, 0, FRONT] }));
    cells.add(node('head', tint(place(box(CW + 0.1, H - BAR_H + 0.06, 0.16), sx * CX, (H + BAR_H) / 2 - 0.03, FRONT), '#e8452f'), M.prop), node('head2', tint(place(box(0.16, H - BAR_H + 0.02, SW), sx * ALLEY, (H + BAR_H) / 2, (FRONT + BACK) / 2), '#e8452f'), M.prop));
    cells.add(node('corner', tint(place(box(0.17, H, 0.17), sx * ALLEY, H / 2, FRONT), '#e8452f'), M.prop), node('corner-band', tint(place(box(0.19, 0.1, 0.19), sx * ALLEY, 1.05, FRONT), C7.brass), M.prop));
    // the berth itself, along the ship's side, with what a prisoner is left: a mug, a folded coat
    cells.add(node('bunk', bunk({ w: 1.9, blanket: sx < 0 ? C7.wine : C7.teal }), M.prop, { pos: [sx * (SIDE - 0.3), 0, -1.75], rot: [0, -sx * 90, 0] }));
    cells.add(node('mug', merge(tint(place(cylinder(0.06, 0.05, 0.11, 6), 0, 0, 0), '#dfe8ff'), tint(place(box(0.2, 0.05, 0.14), 0.2, 0, 0.1), '#fff0d4')), M.prop, { pos: [sx * (SIDE - 0.9), 0.02, -2.75] }));
  }
  // the berths' numbers, chalked on the head beams: two apart
  cells.add(node('numbers', merge(place(chalk(numerals('2', -0.06, -0.085, 0.17, 3), { t: 0.024, glow: 0.35 }), -CX, (H + BAR_H) / 2 - 0.03, FRONT + 0.085), place(chalk(numerals('4', -0.06, -0.085, 0.17, 5), { t: 0.024, glow: 0.35 }), CX, (H + BAR_H) / 2 - 0.03, FRONT + 0.085)), M.flat));
  // between the berths, on the passage: nothing. Past the bulkhead: the ladder, a sea chest, a coil, a bucket
  const fore = group('fore');
  fore.add(node('ladder', ladder7({ h: H + 0.1, w: 0.66, run: 0.75, rungs: 7 }), M.prop, { pos: [0, 0, BACK - 0.55] }));
  fore.add(node('chest', seaChest({}), M.prop, { pos: [-1.5, 0, BACK - 0.9], rot: [0, 14, 0] }), node('chest2', seaChest({ color: C7.wine, w: 0.7 }), M.prop, { pos: [1.7, 0, BACK - 1.0], rot: [0, -20, 0] }));
  if (!low) fore.add(node('coil', ropeCoil({ r: 0.24 }), M.prop, { pos: [1.2, 0, BACK - 0.55] }), node('barrel', barrel({ r: 0.28, h: 0.7 }), M.prop, { pos: [-2.4, 0, BACK - 1.1] }));
  // the flat this side of the bars: a watch stool, the key on its hook, a water cask, a chest
  const flat = group('flat');
  flat.add(node('cask', barrel({ r: 0.32, h: 0.8, color: '#e39a54' }), M.prop, { pos: [-2.85, 0, 2.35] }), node('dipper', tint(place(cylinder(0.07, 0.05, 0.1, 6), 0, 0.8, 0), C7.brass), M.prop, { pos: [-2.85, 0, 2.35] }));
  flat.add(node('chest3', seaChest({ color: '#2fbfa8', w: 0.9 }), M.prop, { pos: [2.75, 0, 2.3], rot: [0, -70, 0] }));
  if (!low) flat.add(node('crate', crate({ s: 0.5, seed: 5 }), M.prop, { pos: [2.8, 0, 3.3], rot: [0, 12, 0] }), node('coil2', ropeCoil({ r: 0.26 }), M.prop, { pos: [-2.7, 0, 3.4] }));
  // the key ring hangs on the corner post of the left berth, out of reach of both
  const KEY = [-ALLEY - 0.02, 1.72, FRONT + 0.1];
  flat.add(node('key-peg', tint(place(box(0.05, 0.05, 0.16), 0, 0, 0.05), C7.brass), M.prop, { pos: KEY }));

  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  env.sky.sunDir = norm7(env.sky.sunDir);

  // ---- what the lamp throws: the bars' shadows, raking out across the deck away from it (one unlined mesh)
  const L0 = [LAMP_HOOK[0], LAMP_HOOK[2]], strips = [];
  const strip = (fx, fz, reach, w0 = 0.035) => {
    const dx = fx - L0[0], dz = fz - L0[1], l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l, px = -uz, pz = ux, w1 = w0 + reach * 0.045, ex = fx + ux * reach, ez = fz + uz * reach;
    strips.push(fromArrays([fx - px * w0, 0.012, fz - pz * w0, fx + px * w0, 0.012, fz + pz * w0, ex + px * w1, 0.012, ez + pz * w1, ex - px * w1, 0.012, ez - pz * w1], [0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2], null, 180));
  };
  for (const sx of [-1, 1]) {
    for (const x of cellBarXs(SW, 0.34)) { const fz = (FRONT + BACK) / 2 + sx * x, fx = sx * ALLEY, l = Math.hypot(fx - L0[0], fz - L0[1]); strip(fx, fz, Math.min(3.2, (SIDE - 0.45 - ALLEY) * l / ALLEY)); }
    strip(sx * ALLEY, FRONT, 3.6, 0.09);   // the corner post's, out across the flat toward the cameras
  }
  hull.add(node('bar-shadows', setOutline(tint(merge(strips), '#b8566e'), 0), M.ground, { castShadow: false }));
  // warm light on the deck under the lamp, cold light at the foot of the ladder
  const pools = node('pools', merge(floorPatch([[-0.55, BACK - 0.3], [0.55, BACK - 0.3], [0.7, BACK - 1.5], [-0.7, BACK - 1.5]], { color: '#9fc4ff', glow: 0.75, y: 0.01 })), M.flat);
  // a grating in the flat, over the hold
  hull.add(node('grating', merge(place(tiles({ w: 1.26, d: 0.98, nx: 9, nz: 7, colors: ['#ffc88a', '#8a4a86'] }), 0, 0.014, 2.75), ...[[1.46, 0.1, 0, 2.21], [1.46, 0.1, 0, 3.29], [0.1, 1.18, -0.68, 2.75], [0.1, 1.18, 0.68, 2.75]].map(([w, d, x, z]) => setOutline(tint(place(box(w, 0.05, d), x, 0.02, z), '#d2643e'), 0))), M.ground, { castShadow: false }));
  pools.castShadow = false; scene.root.add(pools);

  // ---- light you can see: the moon down the hatch, and in at each port
  const sheet = (p) => fromArrays(p, [0, 2, 3, 0, 3, 1, 0, 3, 2, 0, 1, 3], [0, 0, 1, 0, 0, 1, 1, 1], 180);
  const beams = [];
  for (const dz of [-0.32, 0, 0.32]) beams.push(tint(sheet([-0.55, H + 0.1, HATCH[1] + dz, 0.55, H + 0.1, HATCH[1] + dz, -0.8, 0, HATCH[1] + dz + 0.75, 0.8, 0, HATCH[1] + dz + 0.75]), '#b4d0ff'));
  const portsL = anchorAt(sideL, 'ports', [-SIDE, 0, zc], 90), portsR = anchorAt(sideR, 'ports', [SIDE, 0, zc], -90), ports = [...portsL, ...portsR];
  if (!low) for (const p of ports) { const sx = p[0] < 0 ? 1 : -1; for (const dz of [-0.12, 0.12]) beams.push(tint(sheet([p[0], p[1] + 0.2, p[2] + dz, p[0], p[1] - 0.2, p[2] + dz, p[0] + sx * 1.9, 0.75, p[2] + dz, p[0] + sx * 1.9, 0, p[2] + dz]), '#8fb4ff')); }
  const beamNode = node('moon-beams', setOutline(merge(beams), 0), M.beam); beamNode.castShadow = false; scene.root.add(beamNode);

  // ---- the lamp: its own node, swinging; the oilskins and the key swing with the same roll
  const lampMesh = shipLantern({ drop: LAMP_DROP, s: LAMP_S });
  const lampNode = node('lamp', lampMesh, M.lantern, { pos: LAMP_HOOK }); lampNode.castShadow = false; scene.root.add(lampNode);
  hull.add(node('lamp-hook', tint(place(box(0.08, 0.16, 0.08), 0, 0.06, 0), C7.brass), M.wall, { pos: LAMP_HOOK, castShadow: false }));
  const LAMP_LEN = -lampMesh.anchors.lamp[1], lampPos = [LAMP_HOOK[0], LAMP_HOOK[1] - LAMP_LEN, LAMP_HOOK[2]];
  flat.add(node('oilskin1', oilskin('#ffc94a', 3), M.prop, { pos: [-SIDE + 0.5, 2.05, 2.9], rot: [4, 90, 0] }), node('oilskin2', oilskin('#f4573f', 7), M.prop, { pos: [SIDE - 0.5, 2.0, 1.75], rot: [-5, -90, 0] }));
  const hung = [
    { node: node('keys', merge(tint(place(torus(0.09, 0.014, 8, 3), 0, -0.12, 0.1, 90, 0, 0), C7.brass), tint(place(box(0.03, 0.17, 0.02), -0.03, -0.28, 0.1, 0, 0, 8), C7.brass), tint(place(box(0.03, 0.15, 0.02), 0.04, -0.27, 0.1, 0, 0, -10), C7.brass)), M.prop, { pos: KEY }), yaw: 0, k: 1.3, ph: 2.0 },
  ];
  // slung from the deck head over the flat: a net of cork floats, a coil of line
  const floats = []; for (let i = 0; i < 9; i++) floats.push(tint(place(cylinder(0.085, 0.085, 0.1, 6), Math.cos(i * 2.4) * 0.14, -0.3 - (i % 4) * 0.11, Math.sin(i * 2.4) * 0.14, i * 30, 0, i * 50), i % 3 ? C7.cork : '#fff6e4'));
  hung.push({ node: node('floats', merge(floats, tint(place(cylinder(0.012, 0.012, 0.22, 3), 0, -0.22, 0), PAL.rope)), M.prop, { pos: [-1.75, H - 0.2, 1.95] }), yaw: 0, k: 0.8, ph: 0.9 });
  flat.add(node('slung-coil', merge(tint(place(torus(0.2, 0.045, 10, 4), 0, -0.42, 0, 90, 0, 0), PAL.rope), tint(place(cylinder(0.012, 0.012, 0.24, 3), 0, -0.24, 0), PAL.rope)), M.prop, { pos: [1.8, H - 0.2, 2.5], rot: [0, 0, 5] }));
  for (const h of hung) { h.node.castShadow = false; scene.root.add(h.node); }
  scene.root.add(mergeStatic(hull, 'hull'), mergeStatic(cells, 'cells'), mergeStatic(fore, 'fore'), mergeStatic(flat, 'flat'));

  // ---- foreground: the after end of the flat, close to the wide camera
  const fg = group('fg');
  fg.add(node('fg1', seaChest({ color: C7.royal, w: 0.95, h: 0.5 }), M.prop, { pos: [-1.9, 0, 3.0], rot: [0, 22, 0] }), node('fg2', ropeCoil({ r: 0.24 }), M.prop, { pos: [1.75, 0, 3.0] }), node('fg3', merge(tint(place(cylinder(0.17, 0.14, 0.26, 7), 0, 0, 0), '#dfe8ff'), tint(place(torus(0.15, 0.014, 8, 3), 0, 0.3, 0, 90, 0, 0), C7.navy)), M.prop, { pos: [2.2, 0, 2.6] }));
  const foreground = mergeStatic(fg, 'foreground'); scene.root.add(foreground);

  // ---- sprites
  const sprites = scene.sprites = createSprites(low ? 128 : 256);
  const lampGlow = sprites.add({ kind: 'glow', pos: lampPos, size: 2.6, color: '#ffb04a', alpha: 0 }), lampCore = sprites.add({ kind: 'glow', pos: lampPos, size: 0.9, color: '#fff2c0', alpha: 0 });
  const portGlows = ports.map((p) => sprites.add({ kind: 'glow', pos: p, size: 1.5, color: '#6fa8ff', alpha: 0 }));
  const hatchGlow = sprites.add({ kind: 'glow', pos: [HATCH[0], H - 0.1, HATCH[1]], size: 2.4, color: '#a8c8ff', alpha: 0 });
  const keyStar = sprites.add({ kind: 'sparkle', pos: [KEY[0], KEY[1] - 0.14, KEY[2] + 0.12], size: 0.3, color: '#fff2c0', alpha: 0 });

  const lamps = [
    { name: 'lamp', pos: lampPos, color: '#ffb45a', radius: 9.0, base: 1.5, flicker: 0.07 },
    { name: 'moon-hatch', pos: [HATCH[0], 1.5, HATCH[1] + 0.2], color: '#7fb0ff', radius: 4.4, base: 1.0, flicker: 0 },
    { name: 'port-left', pos: [portsL[0][0] + 0.5, portsL[0][1] - 0.1, portsL[0][2]], color: '#6fa0ff', radius: 3.0, base: 0.75, flicker: 0 },
    { name: 'watch-aft', pos: [0.4, 1.5, 5.6], color: '#ff9a50', radius: 9.5, base: 0.95, flicker: 0.04 },   // the watch's own lantern, aft of every camera mark
    { name: 'port-right', pos: [portsR[0][0] - 0.5, portsR[0][1] - 0.1, portsR[0][2]], color: '#6fa0ff', radius: 3.0, base: 0.75, flicker: 0 },
  ];
  const actors = group('actors'); scene.root.add(actors);

  // ---- per-frame (allocation-free)
  const P = [0, 0, 0], V = [0, 0, 0], rnd = rng(77);
  let swing = 1, nextMote = 0, nextDrip = 1.2, lastDrip = -9;
  const setSwing = (v) => { swing = Math.max(0, Math.min(2, v)); };
  const cue = (lineId) => /^ch7\.epi\./.test(lineId || '');

  function tick(time, dt, pw, live, power) {
    // the roll: one slow sine and a quicker one riding on it
    const roll = (Math.sin(time * 0.92) * 10 + Math.sin(time * 2.2 + 1) * 2.5) * swing, pitchA = Math.sin(time * 0.61 + 0.7) * 3 * swing, az = roll * DEG, ax = pitchA * DEG;
    quat.fromEuler(lampNode.rotation, ax, 0, az);
    lampPos[0] = LAMP_HOOK[0] + Math.sin(az) * LAMP_LEN; lampPos[1] = LAMP_HOOK[1] - Math.cos(az) * LAMP_LEN; lampPos[2] = LAMP_HOOK[2] - Math.sin(ax) * LAMP_LEN;
    const fl = 0.93 + 0.07 * Math.sin(time * 11.3) * Math.sin(time * 6.1), on = Math.min(1.25, pw);
    lampGlow.pos[0] = lampCore.pos[0] = lampPos[0]; lampGlow.pos[1] = lampCore.pos[1] = lampPos[1]; lampGlow.pos[2] = lampCore.pos[2] = lampPos[2];
    lampGlow.alpha = 0.6 * on * fl; lampCore.alpha = 0.75 * Math.min(1, on) * fl;
    lampNode.tint[0] = lampNode.tint[1] = lampNode.tint[2] = 0.35 + 0.65 * Math.min(1, on);
    for (let i = 0; i < hung.length; i++) hung[i].node.setRot(0, 0, roll * hung[i].k);
    const moon = 0.75 + 0.25 * Math.min(1.2, power), sea = 0.8 + 0.2 * Math.sin(time * 1.7);
    for (let i = 0; i < portGlows.length; i++) portGlows[i].alpha = 0.5 * moon * (0.85 + 0.15 * Math.sin(time * 2.3 + i * 1.9));
    hatchGlow.alpha = 0.34 * moon * sea;
    keyStar.alpha = Math.max(0, Math.sin(time * 0.92 + 2.0)) * 0.9 * Math.min(1, on); keyStar.rot = time * 0.4;
    if (live) {
      if (time > nextMote) { nextMote = time + (low ? 0.5 : 0.22); P[0] = lampPos[0] + (rnd() - 0.5) * 2.4; P[1] = 0.5 + rnd() * 1.7; P[2] = LAMP_HOOK[2] + (rnd() - 0.4) * 3.4; V[0] = Math.sin(az) * 0.3; V[1] = 0.04 + rnd() * 0.06; V[2] = 0.05; sprites.spawn({ kind: 'glow', pos: P, vel: V, size: 0.05 + rnd() * 0.05, life: 4.0, color: '#ffd890', alpha: 0.7 * Math.min(1, on) }); }
      if (!low && time > nextDrip) { nextDrip = time + 1.3 + rnd() * 1.6; lastDrip = time; P[0] = HATCH[0] + (rnd() - 0.5) * 0.9; P[1] = H - 0.05; P[2] = HATCH[1] + (rnd() - 0.5) * 0.6; V[0] = 0; V[1] = -0.4; V[2] = 0; sprites.spawn({ kind: 'dot', pos: P, vel: V, size: 0.06, life: 0.72, color: '#cfe2ff', gravity: 9 }); }
      if (lastDrip > 0 && time - lastDrip > 0.7) { lastDrip = -9; P[1] = 0.03; sprites.splash(P, { size: 0.35, life: 0.7, spray: 0, color: '#cfe2ff' }); }
    }
  }

  const berth = [{ pos: [-(ALLEY + 0.5), 0, FRONT - 0.42], face: 18 }, { pos: [ALLEY + 0.5, 0, FRONT - 0.42], face: -18 }];
  const std = STD_MARKS();
  return shell7({
    id: 'cutter-brig', light, low, L, scene, cameras: CAMERAS, actors, foreground, lamps, glows: [], sun: L.sun, tick,
    marks: {
      ...std, a: berth[0], c: berth[1], b: { pos: [0, 0, 0.7], face: 0 }, two: berth, berths: berth, focus: lampPos,
      watch: { pos: [0.1, 0, 1.2], face: 180 }, back: [[1.3, 0.1], [2.1, -0.05], [2.7, 0.15], [-1.3, 0.1], [-2.1, -0.05], [-2.7, 0.15]],
    },
    extra: { setSwing, cue },
  });
}

export const cutterBrig = { id: 'cutter-brig', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default cutterBrig;
