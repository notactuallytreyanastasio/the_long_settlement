// SET: lantern-line. Six hundred paces of open quay between the Compact's hall and Kedge's lamp-house, at night, in
// the hour before the lamp is let down: warehouses down both sides, the great lamp still white and whole at the far
// end, and the dockers standing in two files with a paper lantern each. No blades, no writs.
// Chapter 6: ch6.s6 (Foss counts them; the Tribune walks the whole of it and does not hurry).
//
//   import { lanternLine } from './sets/lantern-line.js';
//   const set = lanternLine.build(GL, { light: 'night', low: false });
//
// The shape is lantern-stalls' (see ../index.js). Figures face +Z; cameras look toward -Z, down the lane to the
// lamp-house. The stage strip x -3.2..3.2, z 0..1.6 is clear; the files stand at x = -2.5 and x = 2.5 from z = -1.5
// back, every 1.6 m, facing each other across the lane. The light is the lanterns: warm, low, from both sides.
// Added here:
//   setLine(0..1)   how much of the two files has turned out (they arrive front to back); 1 from the start
//   cue(lineId)     ch6.s6.c01..c04: the quay is still open (setLine(0)); from c05 the files stand
//   marks.file      a place in the left file, about half way down, for Ren { pos, face }; marks.walk [far, near]: the
//                   Tribune's way between the lanterns; marks.focus: the great lamp
// low: true thins the far half of the files to plain figures, drops the hoists' loads, the bunting and half the cobbles.

import { m4, quat, rng, DEG } from '../math.js';
import { merge, tint, place, plane, box, cylinder, setGlow, setOutline } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic, makeInstances } from '../scene.js';
import { createSprites } from '../sprites.js';
import { rayMesh, rayMaterial } from '../fx.js';
import { PAL, anchorAt, pickLight, scatter, cobble, bollard, ropeCoil, crowd, cloudBank, bunting, crate, sack } from './kit.js';
import { K6, ch6Materials, shell, STD_MARKS, STD_CAMERAS, dirFrom, norm3, cask, lampHouse, warehouse, bar } from './kit-ch6.js';

const CORNERS = [[-4.86, -0.8], [4.86, -1.7], [-4.86, -7.6], [4.86, -8.4]];
const FILE_X = 2.5, FILE_Z0 = -1.5, PITCH = 1.6, PER_FILE = 21, FACE_X = 4.9, LH_Z = -46;

const LIGHTS = {
  night: {
    preset: 'night', power: 1.2,
    env: {
      key: { dir: dirFrom(-26, 44), color: '#6c8cf4' },
      shadow: { tint: '#3148b4', lift: 0.13, saturate: 1.3 },
      ambient: { sky: '#4a6cdc', ground: '#2e3c9c', amount: 0.18 },
      rim: { color: '#ffd9a0', amount: 0.8, edge: 0.74 },
      fog: { color: '#3a58c8', density: 0.006, start: 14, max: 0.8 },
      sky: { zenith: '#0b186c', mid: '#1e3cb0', midAt: 0.42, horizon: '#5f84ec', below: '#2c4cb8', sunDir: dirFrom(-7.5, 17.5), moon: 0.7, stars: 1, sun: { size: 2.3 } },
      water: null,
    },
    cloud: { color: '#8fa6ea', shadowTint: '#3a50aa' },
  },
};

const CAMERAS = STD_CAMERAS({
  wide: { target: [0.0, 1.95, -0.4], dist: 8.6, yaw: 1.5, pitch: 3.5, fov: 46, shadowCenter: [0, 0, -1.4], shadowRadius: 8 },
  low: { target: [0.05, 1.9, 0.2], dist: 6.4, yaw: -5, pitch: -11, fov: 56 },
  stage: { target: [0, 1.05, 0.5], dist: 9.4, yaw: -11, pitch: 7, fov: 24 },
});

function build(engine = null, { light, low = false } = {}) {
  const picked = pickLight('lantern-line', LIGHTS, light), L = picked.L; light = picked.name;
  const M = ch6Materials(), r = rng(6464);
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  env.sky.sunDir = norm3(env.sky.sunDir);

  // ---- the quay: pale salt-stained stone, a line of flags down the middle of the lane
  const set = group('set'), far = group('far');
  set.add(node('ground', tint(place(plane(60, 110, 1, 1), 0, 0, -25), '#f0dcc0'), M.ground));
  // ---- warehouses down both sides, gables to the lane
  const houses = [
    { side: -1, z: -3.6, o: { w: 5.6, d: 5.4, h: 4.3, roofH: 2.3, seed: 2, wall: K6.cream, roof: K6.coral, band: K6.teal, door: 'open' } },
    { side: 1, z: -4.6, o: { w: 5.2, d: 5.4, h: 4.9, roofH: 2.2, seed: 5, wall: '#ffe2c8', roof: K6.teal, band: K6.coral, door: 'open', doorCol: K6.royal } },
    { side: -1, z: -10.4, o: { w: 5.4, d: 5.4, h: 5.3, roofH: 2.4, seed: 7, wall: '#ffe9c4', roof: K6.royal, band: K6.yellow, door: 'shut', doorCol: K6.coral } },
    { side: 1, z: -11.2, o: { w: 5.6, d: 5.4, h: 4.2, roofH: 2.5, seed: 9, wall: K6.salt, roof: K6.coral, band: K6.royal, door: 'open' } },
    { side: -1, z: -17.4, o: { w: 5.8, d: 5.4, h: 4.5, roofH: 2.2, seed: 12, wall: K6.cream, roof: K6.teal, band: K6.coral, door: 'open' } },
    { side: 1, z: -17.8, o: { w: 5.4, d: 5.4, h: 5.2, roofH: 2.3, seed: 14, wall: '#ffd9c8', roof: K6.plum, band: K6.yellow, door: 'shut' } },
    { side: -1, z: -24.6, o: { w: 5.6, d: 5.4, h: 5.0, roofH: 2.4, seed: 17, wall: '#ffe2c8', roof: K6.coral, band: K6.teal, door: 'open' } },
    { side: 1, z: -24.8, o: { w: 5.6, d: 5.4, h: 4.4, roofH: 2.3, seed: 19, wall: K6.cream, roof: K6.royal, band: K6.coral, door: 'open' } },
    { side: -1, z: -32, o: { w: 6.0, d: 5.4, h: 4.6, roofH: 2.2, seed: 22, wall: K6.salt, roof: K6.teal, band: K6.coral, door: 'shut' } },
    { side: 1, z: -32, o: { w: 6.0, d: 5.4, h: 4.9, roofH: 2.4, seed: 24, wall: '#ffe9c4', roof: K6.coral, band: K6.teal, door: 'open' } },
  ];
  const doorGlows = [], winGlows = [], hoists = [];
  houses.forEach((h, i) => {
    const m = warehouse({ lit: 0.7, ...h.o }), pos = [h.side * (FACE_X + h.o.d / 2), 0, h.z], yaw = -h.side * 90;
    (i < 6 ? set : far).add(node('wh' + i, m, i < 6 ? M.prop : M.far, { pos, rot: [0, yaw, 0] }));
    if (h.o.door === 'open') doorGlows.push(anchorAt(m, 'door', pos, yaw));
    for (const p of anchorAt(m, 'windows', pos, yaw)) winGlows.push(p);
    hoists.push(anchorAt(m, 'hoist', pos, yaw));
  });
  // what stands along the walls: casks, crates, coils; and a load on some of the hoists
  const clutter = [[cask({}), -4.1, -1.2], [cask({ r: 0.27, h: 0.64 }), -4.25, -0.5], [crate({ s: 0.62, seed: 2, color: K6.timber2 }), 4.2, -1.7], [crate({ s: 0.48, seed: 5 }), 4.15, -1.65, 0.63], [sack({ seed: 3, color: K6.salt }), 4.25, -0.6], [cask({}), -4.2, -7.2], [cask({}), -3.9, -7.9], [crate({ s: 0.6, seed: 8 }), 4.1, -8.2], [ropeCoil({ r: 0.32, turns: 4 }), -4.0, -13.6], [cask({}), 4.1, -14.4], [cask({}), 4.25, -15.2], [crate({ s: 0.7, seed: 11, color: K6.timber2 }), -4.1, -21]];
  clutter.forEach(([m, x, z, y = 0], i) => set.add(node('clutter' + i, m, M.prop, { pos: [x, y, z], rot: [0, i * 37, 0] })));
  if (!low) for (const i of [0, 3, 4]) { const p = hoists[i]; set.add(node('load' + i, merge(cask({ r: 0.3, h: 0.7 }), bar([0, 0.7, 0], [0, 1.3, 0], 0.02, K6.rope, 3)), M.prop, { pos: [p[0] - Math.sign(p[0]) * 0.1, p[1] - 2.3, p[2]], rot: [0, i * 50, 6] })); }
  if (!low) set.add(node('bunt1', bunting([-FACE_X, 5.2, -6.6], [FACE_X, 5.6, -7.4], { sag: 1.0, count: 13, size: 0.36, seed: 3, colors: [K6.coral, K6.cream, K6.teal, K6.yellow] }), M.prop, { castShadow: false }), node('bunt2', bunting([-FACE_X, 5.8, -14], [FACE_X, 5.3, -14.6], { sag: 1.1, count: 13, size: 0.34, seed: 6, colors: [K6.teal, K6.yellow, K6.coral, K6.cream] }), M.prop, { castShadow: false }));
  // near overhead: flags from eave to eave above the head of the line, and a lantern on each near corner
  set.add(node('bunt0', bunting([-FACE_X, 4.9, -1.2], [FACE_X, 5.3, -1.8], { sag: 0.9, count: 13, size: 0.38, seed: 9, colors: [K6.yellow, K6.coral, K6.cream, K6.teal] }), M.prop, { castShadow: false }), node('bunt00', bunting([-FACE_X - 0.4, 5.6, 1.4], [FACE_X + 0.4, 5.2, 1.0], { sag: 1.0, count: 13, size: 0.4, seed: 12, colors: [K6.coral, K6.cream, K6.teal, K6.yellow] }), M.prop, { castShadow: false }));
  for (const [x, z] of CORNERS) set.add(node('corner-lamp', merge(bar([x, 3.3, z], [x - Math.sign(x) * 0.5, 3.3, z], 0.03, K6.iron, 4), setGlow(tint(place(cylinder(0.11, 0.14, 0.24, 8), x - Math.sign(x) * 0.5, 2.98, z), '#ffe2a0'), 1), tint(place(cylinder(0.19, 0.04, 0.12, 8), x - Math.sign(x) * 0.5, 3.22, z), K6.brass)), M.prop, { castShadow: false }));
  set.add(node('bollard1', bollard({ s: 1.1 }), M.prop, { pos: [-3.9, 0, 1.9] }), node('bollard2', bollard({ s: 1.1 }), M.prop, { pos: [3.95, 0, 2.2] }));

  // ---- the lamp-house at the end of it, the great lamp still whole
  const LH = [0, 0, LH_Z];
  const lh = lampHouse({ h: 18, r: 4.4, flame: 'white', seg: 16 });
  far.add(node('lamp-house', lh, M.far, { pos: LH }));
  far.add(node('lh-steps', merge(tint(place(box(9, 0.5, 4), 0, 0.25, LH_Z + 5.2), K6.stone2), tint(place(box(7, 0.5, 3), 0, 0.75, LH_Z + 5), K6.stone)), M.far));
  for (const sx of [-1, 1]) far.add(node('sea-wall', tint(place(box(40, 1.4, 1.2), sx * 26, 0.7, LH_Z + 4), K6.stone2), M.far));
  const LAMP = anchorAt(lh, 'lamp', LH);
  scene.root.add(mergeStatic(set, 'set'), mergeStatic(far, 'far'));

  const cob = node('cobbles', cobble(), M.flat); cob.castShadow = false;
  const cobCols = ['#f4e6c8', '#dccfb4', '#ece0c8', '#d4cce0', '#e8d4b0'];
  scatter(cob, low ? 240 : 480, (i) => {
    const col = i % 12, row = Math.floor(i / 12), sx = col < 6 ? -1 : 1, x = sx * (1.1 + (col % 6) * 0.66 + (row % 2) * 0.3 + (r() - 0.5) * 0.14), z = 3.4 - row * 0.62 + (r() - 0.5) * 0.12;
    if (r() < 0.3) return null;
    const sc = 0.21 + r() * 0.09; return { m: m4.trs(x, 0.002, z, 0, r() * 360, 0, sc * 1.3, 1, sc * 0.9), color: cobCols[Math.floor(r() * cobCols.length)] };
  });
  scene.root.add(cob);

  const sprites = scene.sprites = createSprites(low ? 256 : 448);

  // ---- the two files
  const nearSpots = [], farSpots = [], NEAR = 6;
  for (let i = 0; i < PER_FILE; i++) for (const sx of [-1, 1]) {
    const sp = { pos: [sx * (FILE_X + (r() - 0.5) * 0.24), 0, FILE_Z0 - i * PITCH + (r() - 0.5) * 0.3], face: -sx * (84 + (r() - 0.5) * 16), s: 1.06 + r() * 0.2 };
    (i < NEAR ? nearSpots : farSpots).push(sp);
  }
  const coats = ['#ffbc9c', '#a8d0ff', '#ffdc90', '#b4ecd0', '#ffb4c4', '#cdbcff', '#ffd0a8', '#9ce0e8'];
  const nearFile = crowd({ spots: nearSpots, material: M.prop, sprites, seed: 4, detail: 1, hold: 'lantern', colors: coats, glowSize: 1.0, variants: 3 });
  const farFile = crowd({ spots: farSpots, material: low ? M.speck : M.prop, sprites, seed: 8, detail: low ? 0 : 1, hold: 'lantern', colors: coats, glowSize: 1.15, variants: low ? 1 : 2 });
  nearFile.pace = 6; farFile.pace = 10;
  scene.root.add(nearFile.node, farFile.node);

  // ---- the great lamp: its halo, and two slow arms of light over the roofs
  const beams = group('beams', { pos: LAMP });
  beams.add(node('beam', merge(place(tint(rayMesh(60, 0.8, 9, 14), '#fff2c0'), 0, 0, 0, 0, 0, 80), place(tint(rayMesh(60, 0.8, 9, 14), '#fff2c0'), 0, 0, 0, 0, 0, -80)), rayMaterial({ power: 1.3, near: 0.26, far: 0 })));
  scene.root.add(beams);
  // warm light spilling out of the open doors, as cones laid across the lane
  const spill = [];
  for (const p of doorGlows.slice(0, 4)) spill.push(place(tint(rayMesh(4.4, 0.5, 1.9, 10), '#ffb050'), p[0], 0.9, p[2], 0, 0, p[0] < 0 ? 80 : -80));
  scene.root.add(node('door-spill', merge(spill), rayMaterial({ power: 1.2, near: 0.3, far: 0 })));

  const lamps = [
    { name: 'file-front', pos: [0, 1.1, -1.6], color: '#ffac48', radius: 7.5, base: 2.1 },
    { name: 'file-near', pos: [0.3, 1.3, 2.6], color: '#ffb858', radius: 6.4, base: 1.3 },
    { name: 'file-2', pos: [0, 1.0, -6.4], color: '#ffac48', radius: 8, base: 1.9 },
    { name: 'file-3', pos: [0, 1.0, -13.5], color: '#ffac48', radius: 9, base: 1.8 },
    { name: 'file-4', pos: [0, 1.2, -23], color: '#ffac48', radius: 12, base: 1.7 },
    { name: 'great-lamp', pos: [0, LAMP[1] - 4, LH_Z + 8], color: '#fff2c8', radius: 22, base: 1.2, fixed: true, flicker: 0.02 },
  ];
  const glows = [
    { sprite: sprites.add({ kind: 'glow', pos: LAMP, size: 22, color: '#fff2b8', alpha: 0 }), base: 0.5, fixed: true },
    { sprite: sprites.add({ kind: 'glow', pos: LAMP, size: 7, color: '#ffffff', alpha: 0 }), base: 0.55, fixed: true },
  ];
  for (const [x, z] of CORNERS) glows.push({ sprite: sprites.add({ kind: 'glow', pos: [x - Math.sign(x) * 0.5, 3.0, z], size: 1.7, color: '#ffb450', alpha: 0 }), base: 0.5 });
  for (const p of doorGlows) glows.push({ sprite: sprites.add({ kind: 'glow', pos: p, size: 3.2, color: '#ffa848', alpha: 0 }), base: 0.38, fixed: true });
  for (const p of winGlows) glows.push({ sprite: sprites.add({ kind: 'glow', pos: p, size: 1.3, color: '#ffc060', alpha: 0 }), base: 0.4, fixed: true });
  const lampStar = sprites.add({ kind: 'sparkle', pos: LAMP, size: 11, color: '#ffffff', alpha: 0.9 });

  const clouds = cloudBank({ style: low ? 'painted' : 'solid', count: 7, seed: 23, arc: [150, 210], radius: [260, 430], height: [40, 150], size: [0.7, 1.4], speed: 0.05, ...L.cloud });
  scene.root.add(clouds.node);

  const fg = group('fg');
  fg.add(node('fg1', cask({}), M.prop, { pos: [-2.2, 0, 2.9] }), node('fg2', ropeCoil({ r: 0.26 }), M.prop, { pos: [1.7, 0, 2.8] }), node('fg3', crate({ s: 0.5, seed: 4 }), M.prop, { pos: [2.4, 0, 3.0], rot: [0, 20, 0] }));
  const foreground = mergeStatic(fg, 'foreground'); scene.root.add(foreground);
  const actors = group('actors'); scene.root.add(actors);

  // ---- per frame
  let line = 1;
  const CO = { lit: 1, lively: 0.2 }, P = [0, 0, 0], V = [0, 0, 0], rnd = rng(47);
  let nextSpark = 0, nextEmber = 0, nextGust = 2;
  function setLine(v, snap = false) { line = Math.max(0, Math.min(1, v)); nearFile.setAmount(line); farFile.setAmount(line); if (snap) { nearFile.update(0, 0, CO); farFile.update(0, 0, CO); } }
  function cue(lineId) {
    const m = typeof lineId === 'string' && /^ch6\.s6\.c(\d+)$/.exec(lineId); if (!m) return false;
    setLine(Number(m[1]) >= 5 ? 1 : 0, Number(m[1]) === 1);
    return true;
  }
  function tick(time, dt, pw, live) {
    CO.lit = Math.min(1.4, 0.35 + pw * 0.7); CO.lively = 0.18;
    nearFile.update(time, dt, CO); farFile.update(time, dt, CO);
    // the lane's light is the files': it goes with them
    const here = (nearFile.people[0].here + farFile.people[farFile.people.length - 1].here) * 0.5;
    for (let i = 0; i < 5; i++) env.points[i].intensity *= 0.15 + 0.85 * (i < 2 ? nearFile.people[0].here : here);
    beams.setRot(0, time * 9, 0);
    lampStar.alpha = 0.8 + 0.15 * Math.sin(time * 2.1); lampStar.rot = time * 0.08;
    clouds.update(time);
    if (live) {
      if (time > nextSpark && nearFile.people[0].here > 0.5) { nextSpark = time + 0.14; const f = rnd() < 0.4 ? nearFile : farFile, p = f.people[Math.floor(rnd() * f.people.length)]; if (p.glow && p.here > 0.5) sprites.sparkle(p.glow.pos, { count: 1, size: 0.2, spread: 0.4, life: 0.9, color: '#fff0b0' }); }
      if (time > nextEmber) { nextEmber = time + 0.28; P[0] = -3 + rnd() * 6; P[1] = 0.4 + rnd() * 2.4; P[2] = -9 + rnd() * 11; V[0] = 0.1 + rnd() * 0.1; V[1] = 0.12 + rnd() * 0.14; V[2] = 0.04; sprites.spawn({ kind: 'glow', pos: P, vel: V, size: 0.08 + rnd() * 0.07, life: 4.5, color: '#ffd070', alpha: 0.85 }); }
      if (!low && time > nextGust) { nextGust = time + 3 + rnd() * 2; P[0] = -4 + rnd() * 3; P[1] = 3 + rnd() * 3; P[2] = -10 + rnd() * 8; V[0] = 1.8; V[1] = 0.1; V[2] = 0.2; sprites.gust(P, { vel: V, size: 0.9 + rnd() * 0.5, life: 2.2, alpha: 0.8, color: '#c6d6ff' }); }
    }
  }

  return shell({
    id: 'lantern-line', light, L, low, scene, cameras: CAMERAS, actors, foreground, lamps, glows, tick, cue,
    marks: { ...STD_MARKS(), file: { pos: [-FILE_X, 0, FILE_Z0 - 10 * PITCH + PITCH / 2], face: 84 }, walk: [{ pos: [0, 0, FILE_Z0 - (PER_FILE - 1) * PITCH], face: 180 }, { pos: [0, 0, FILE_Z0], face: 180 }], focus: LAMP },
    extra: { setLine, files: [nearFile, farFile] },
  });
}

export const lanternLine = { id: 'lantern-line', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default lanternLine;
