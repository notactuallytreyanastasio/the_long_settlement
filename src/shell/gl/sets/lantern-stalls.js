// SET: lantern-stalls. The Vessery lantern market on the Festival of Lots: a short harbour lane of
// crooked stalls under strings of paper lanterns, running down to the quay edge and the sea.
// Chapter 1 (ch1.s1 Nan's stall, ch1.s3 Tobb's book) and the mint epilogue of chapter 8 play here.
//
//   import { lanternStalls } from './sets/lantern-stalls.js';
//   const set = lanternStalls.build(GL, { light: 'dusk' });      // 'dusk' (default) | 'night' | 'day'
//   set.actors.add(figure.root);                                 // characters go under set.actors
//   set.frame(camera, 'wide', time);                             // a named camera mark
//   set.update(time, dt); renderer.render(set.scene, camera, time);
//
// World: +Y up, about metres, ground at y = 0. The camera marks look toward -Z: the sea, the sun
// and the lighthouse are that way. Figures face +Z. The stage is the strip x -3.2..3.2, z 0..1.6;
// nothing of the set stands in it.
//
// The returned set:
//   id, light
//   scene, env            createScene(env), filled; scene.sprites is shared (spawn your own bursts into it)
//   actors                empty Node at the origin for characters
//   foreground            Node holding the near crates and barrels (z 2.5..3.1): hide it for a view it gets in the way of
//   cameras               { wide, two, close, low, stage, landscape }: { target, dist, yaw, pitch, fov, aspect, shadowCenter, shadowRadius }
//                         wide / two / close / low are framed for a portrait phone (aspect 0.46),
//                         stage for the 430x220 live band (aspect 1.95), landscape for 16:10
//   frame(camera, name, time = 0)   place a camera on a mark (time adds a slow drift) and fit the shadow map to it
//   view(name)            { shadowCenter, shadowRadius } to spread into a renderer view rectangle
//   marks                 a, b, c: cutscene spots left to right { pos, face };  party[3], opposition[3]: stage band spots;
//                         focus: the big lantern;  nanLanterns: indices of the three lanterns over Nan's stall
//   lamps                 [{ name, pos, radius, color }] the six fixed point lights (0 is the big lantern)
//   setPower(p)           0..1.5 scales every lamp, glow and lit lantern (1 = as designed)
//   setLantern(i, lit)    one paper lantern on the strings, 0..1;  lanternCount
//   update(time, dt)      sway, flicker, gulls, smoke, sparkles, sprites.update(dt)

import * as GL0 from '../index.js';
import {
  m4, quat, rng, DEG,
  merge, tint, place, plane, cylinder, box, tube, curve, setGlow, roundedBox, scale as scaleMesh,
  Node, node, group, makeEnv, createScene, mergeStatic, makeInstances, setInstance,
  createSprites, rayMesh, rayMaterial, aimAxis,
} from '../index.js';
import {
  PAL, kitMaterials, anchorAt, scatter, stall, paperLantern, lanternString, bunting, crate, barrel, sack, bollard, ropeCoil,
  boat, house, lighthouse, lampPost, pole, headland, cloudBank, gull, quayEdge, cobble, rock, bush,
} from './kit.js';

const QUAY_Z = -7.6, WATER = -0.5;
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
const dirFrom = (azDeg, elDeg) => [Math.sin(azDeg * DEG) * Math.cos(elDeg * DEG), Math.sin(elDeg * DEG), -Math.cos(azDeg * DEG) * Math.cos(elDeg * DEG)]; // az 0 = straight out to sea, + = right

// ------------------------------------------------------------------------------------ light states

const LIGHTS = {
  dusk: {
    preset: 'sunset', power: 1, unlit: 0.5, glow: 0.42,
    env: {
      key: { dir: dirFrom(-15, 19), color: '#ffd296' },
      shadow: { tint: '#7f78e0', lift: 0.1, saturate: 1.4 },
      ambient: { sky: '#ffa98e', ground: '#7d6ad0', amount: 0.16 },
      rim: { color: '#ffd98a', amount: 1.0, edge: 0.72 },
      fog: { density: 0.0038, start: 16, max: 0.9 },
      sky: { zenith: '#3a4cc8', mid: '#9d86ee', midAt: 0.5, horizon: '#ffcf70', below: '#f6a878', glow: '#ffe890', glowAmount: 0.55, sunDir: dirFrom(0.8, 4.6), sun: { color: '#fffbe0', size: 2.3, halo: '#ffd070', haloAmount: 0.42 } },
      water: { deep: '#2a56c0', mid: '#3f8fe0', shallow: '#74e0d6', foam: '#fff6e4', glint: '#ffe7a0', glintDensity: 0.3 },
    },
    cloud: { color: '#ffd9b4', shadowTint: '#c878b8' }, smoke: '#ffe6d2', ray: 0.34, sunShaft: 0.16,
  },
  night: {
    preset: 'night', power: 1.25, unlit: 0.42, glow: 0.7,
    env: {
      key: { dir: dirFrom(-28, 38), color: '#7f9ef0' },
      shadow: { tint: '#2f44a8', lift: 0.12, saturate: 1.25 },
      ambient: { sky: '#3f5fd0', ground: '#2a3a92', amount: 0.16 },
      fog: { density: 0.0042, start: 16, max: 0.88 },
      sky: { zenith: '#0c1a70', mid: '#1c3fb0', midAt: 0.4, horizon: '#4f82e6', below: '#3058c4', sunDir: dirFrom(5, 13.5), moon: 0.72, stars: 1, sun: { size: 2.2 } },
      water: { deep: '#132a86', mid: '#1e45ae', shallow: '#3478d6', glintDensity: 0.16 },
    },
    cloud: { color: '#8fa6ea', shadowTint: '#3a50aa' }, smoke: '#b9c6f2', ray: 0.46, sunShaft: 0,
  },
  day: {
    preset: 'day', power: 0, unlit: 0.9, glow: 0,
    env: {
      key: { dir: norm([-0.5, 0.74, 0.42]), color: '#fff6dc' },
      shadow: { tint: '#8f9be6', lift: 0.07, saturate: 1.3 },
      sky: { sunDir: dirFrom(-6, 17) },
      fog: { density: 0.003, start: 20 },
      water: {},
    },
    cloud: { color: '#ffffff', shadowTint: '#b4c6f8' }, smoke: '#ffffff', ray: 0, sunShaft: 0,
  },
};

// ------------------------------------------------------------------------------------ cameras and marks

const CAMERAS = {
  wide: { target: [0.15, 2.6, -1.0], dist: 10.8, yaw: 2, pitch: 4, fov: 48, aspect: 0.46, shadowCenter: [0, 0, -1.5], shadowRadius: 9.5 },
  two: { target: [0, 0.9, 0.6], dist: 6.3, yaw: -15, pitch: 5, fov: 31, aspect: 0.46, shadowCenter: [0, 0, 0.3], shadowRadius: 3.6 },
  close: { target: [0.02, 0.86, 0.8], dist: 3.9, yaw: 21, pitch: 3, fov: 28, aspect: 0.46, shadowCenter: [0, 0, 0.5], shadowRadius: 2.6 },
  low: { target: [0.1, 1.75, 0.2], dist: 6.4, yaw: -7, pitch: -11, fov: 56, aspect: 0.46, shadowCenter: [0, 0, -1], shadowRadius: 8 },
  stage: { target: [0, 1.02, 0.5], dist: 9.4, yaw: -15, pitch: 7, fov: 24, aspect: 1.95, shadowCenter: [0, 0, -0.5], shadowRadius: 7.5, outline: 0.7 },
  landscape: { target: [0, 1.7, -1.2], dist: 10.5, yaw: 4, pitch: 5, fov: 40, aspect: 1.6, shadowCenter: [0, 0, -1.5], shadowRadius: 10.5 },
};

const MARKS = {
  a: { pos: [-0.8, 0, 0.55], face: 14 }, b: { pos: [0.02, 0, 0.8], face: 0 }, c: { pos: [0.82, 0, 0.55], face: -14 },
  party: [{ pos: [-1.05, 0, 0.75], face: 78 }, { pos: [-1.85, 0, 1.15], face: 72 }, { pos: [-2.5, 0, 0.5], face: 80 }],
  opposition: [{ pos: [1.05, 0, 0.75], face: -78 }, { pos: [1.85, 0, 1.15], face: -72 }, { pos: [2.55, 0, 0.5], face: -80 }],
};

// ------------------------------------------------------------------------------------ build

function build(engine = GL0, { light = 'dusk' } = {}) {
  const L = LIGHTS[light];
  if (!L) throw new Error(`lantern-stalls: unknown light "${light}" (have ${Object.keys(LIGHTS).join(', ')})`);
  const M = kitMaterials(), r = rng(4242);

  // ---- where things stand
  const stallDefs = [
    { name: 'nan', pos: [-2.3, 0, -1.9], yaw: 14, opts: { seed: 3, goods: 'lanterns', colors: [PAL.red, PAL.cream], lean: 0.07, sign: PAL.yellow } },
    { name: 'fruit', pos: [2.5, 0, -2.5], yaw: -20, opts: { seed: 8, goods: 'fruit', colors: [PAL.teal, PAL.cream], sign: PAL.coral, w: 2.1 } },
    { name: 'jars', pos: [-5.5, 0, -1.3], yaw: 30, opts: { seed: 5, goods: 'jars', colors: [PAL.yellow, PAL.cream], sign: PAL.teal, w: 2.0, h: 1.65 } },
    { name: 'tobb', pos: [5.7, 0, -1.5], yaw: -32, opts: { seed: 12, goods: 'lanterns', colors: [PAL.blue, PAL.cream], sign: PAL.pink, w: 2.1 } },
  ];
  const houseDefs = [
    { pos: [-3.95, 0, -5.0], yaw: 8, opts: { seed: 2, w: 3.4, d: 2.6, h: 3.3, roofH: 1.8, roof: '#ff8b3d', wall: PAL.cream, shutters: PAL.teal, sides: 'right', lit: 0.75 } },
    { pos: [4.15, 0, -5.3], yaw: -10, opts: { seed: 7, w: 3.2, d: 2.6, h: 3.9, roofH: 1.9, roof: '#35c9b5', wall: '#ffe6c4', shutters: PAL.coral, sides: 'left', lit: 0.75, floors: 3 } },
    { pos: [-7.9, 0, -4.4], yaw: 16, opts: { seed: 11, w: 3.0, d: 2.6, h: 2.7, roofH: 1.6, roof: '#f4573f', wall: '#fff6dc', shutters: PAL.blue, sides: 'none', lit: 0.6 } },
    { pos: [8.1, 0, -4.6], yaw: -14, opts: { seed: 15, w: 3.4, d: 2.6, h: 3.0, roofH: 1.7, roof: '#5b7fe8', wall: PAL.cream, shutters: PAL.yellow, sides: 'none', lit: 0.6 } },
  ];
  const POLE_L = [-3.55, 0, 1.95], POLE_R = [3.6, 0, 1.75];
  const POST = [-1.3, 0, QUAY_Z + 0.75];
  const BOAT = [0.75, WATER + 0.02, QUAY_Z - 1.75];

  // ---- static geometry, baked to one mesh per material
  const set = group('set-static');
  set.add(node('ground', tint(place(plane(90, 24, 1, 1), 0, 0, QUAY_Z + 0.3 + 12), '#ecd7a6'), M.ground));
  set.add(node('quay', quayEdge({ len: 26, drop: 1.7, seed: 4 }), M.ground, { pos: [0, 0, QUAY_Z] }));
  for (const sx of [-1, 1]) set.add(node('quay-far', tint(place(box(32, 1.9, 0.5), sx * 29, -0.95, QUAY_Z + 0.3), PAL.stone2), M.ground));

  const stalls = stallDefs.map((d) => { const m = stall(d.opts); set.add(node('stall-' + d.name, m, M.prop, { pos: d.pos, rot: [0, d.yaw, 0] })); return { ...d, mesh: m }; });
  const houses = houseDefs.map((d, i) => { const m = house(d.opts); set.add(node('house' + i, m, M.prop, { pos: d.pos, rot: [0, d.yaw, 0] })); return { ...d, mesh: m }; });

  const poleL = pole({ h: 5.3, seed: 2 }), poleR = pole({ h: 4.9, seed: 6, knob: PAL.coral });
  set.add(node('poleL', poleL, M.prop, { pos: POLE_L }), node('poleR', poleR, M.prop, { pos: POLE_R }));
  const post = lampPost({ h: 2.9, arm: 0.6, lit: L.power > 0 });
  set.add(node('post', post, M.prop, { pos: POST, rot: [0, 180, 0] }));
  set.add(node('bollard1', bollard({ s: 1.15 }), M.prop, { pos: [1.35, 0, QUAY_Z + 0.62] }), node('bollard2', bollard({ s: 1.15 }), M.prop, { pos: [-3.4, 0, QUAY_Z + 0.6] }), node('bollard3', bollard({ s: 1.15 }), M.prop, { pos: [4.6, 0, QUAY_Z + 0.6] }));
  set.add(node('coil', ropeCoil({}), M.prop, { pos: [2.05, 0, QUAY_Z + 1.0] }));
  set.add(node('moor', tint(tube(curve([[1.35, 0.33, QUAY_Z + 0.62], [1.5, 0.05, QUAY_Z + 0.1], [1.75, -0.3, QUAY_Z - 0.6], [BOAT[0] + 1.5, WATER + 0.55, BOAT[2] + 0.35]], 10), 0.028, 5, { crease: 180 }), PAL.rope), M.prop));
  // clutter beside the stalls, well clear of the stage strip
  const clutter = [
    [crate({ s: 0.56, seed: 1 }), [-3.75, 0, -0.55], 12], [crate({ s: 0.46, seed: 2, color: PAL.wood2 }), [-3.72, 0.57, -0.6], -14], [barrel({}), [-4.3, 0, -0.1], 0],
    [barrel({ r: 0.3, h: 0.74 }), [3.95, 0, -1.25], 0], [sack({ seed: 2 }), [3.55, 0, -0.75], 30], [sack({ seed: 5, s: 0.28 }), [4.1, 0, -0.6], 80], [crate({ s: 0.5, seed: 4 }), [2.35, 0, -5.9], 24],
    [crate({ s: 0.5, seed: 6, color: PAL.wood2 }), [-1.0, 0, -5.4], -8], [barrel({ r: 0.24, h: 0.6, color: PAL.wood2 }), [-1.55, 0, -5.1], 0], [sack({ seed: 9 }), [1.9, 0, -5.5], 10],
  ];
  clutter.forEach(([m, p, yaw], i) => set.add(node('clutter' + i, m, M.prop, { pos: p, rot: [0, yaw, 0] })));
  // three of Nan's lanterns lie where the stewards walked through them
  const fallen = [[-0.95, 0.13, -0.75, 80, 20, 0, PAL.lanterns[1]], [-1.35, 0.12, -0.35, -84, 70, 0, PAL.lanterns[2]], [-0.55, 0.13, -1.25, 86, -40, 10, PAL.lanterns[5]]];
  for (const [x, y, z, rx, ry, rz, col] of fallen) { const m = setGlow(paperLantern({ r: 0.13, seg: 8, cord: 0.01 }), 0); for (let i = 0; i < m.colors.length; i += 3) { const c = GL0.rgb(col); m.colors[i] *= c[0] * 0.85; m.colors[i + 1] *= c[1] * 0.85; m.colors[i + 2] *= c[2] * 0.85; } set.add(node('fallen', place(m, 0, 0.3, 0), M.prop, { pos: [x, y - 0.13, z], rot: [rx, ry, rz] })); }
  // green things in the corners
  set.add(node('bush1', bush({ seed: 2, s: 1.3 }), M.prop, { pos: [-6.6, 0.1, -3.0] }), node('bush2', bush({ seed: 5, s: 1.1, color: PAL.leaf }), M.prop, { pos: [7.0, 0.1, -3.1] }));

  // strings: wires are static, lanterns are instanced below
  const strings = [], wires = [];
  const eave = (h, name) => anchorAt(h.mesh, name, h.pos, h.yaw);
  const topL = anchorAt(poleL, 'top', POLE_L), topR = anchorAt(poleR, 'top', POLE_R);
  const addString = (a, b, opts, cols, big = -1) => { const s = lanternString(a, b, opts); wires.push(s.wire); strings.push({ ...s, cols, big }); return s; };
  const BIG = 2;
  const front = addString(topL, topR, { sag: 1.3, count: 8 }, [0, 2, 1, 0, 3, 2, 0, 5], BIG);   // the big lantern hangs from the third hook, left of centre
  addString(eave(houses[0], 'ridge'), eave(houses[1], 'ridge'), { sag: 1.0, count: 9, ends: 0.1 }, [2, 0, 5, 1, 0, 2, 3, 0, 1]);
  addString(topL, eave(houses[1], 'eaveL'), { sag: 0.9, count: 6, ends: 0.2 }, [1, 4, 2, 0, 5, 1]);
  const nanTop = anchorAt(stalls[0].mesh, 'top', stalls[0].pos, stalls[0].yaw), nanHook = anchorAt(stalls[0].mesh, 'hookR', stalls[0].pos, stalls[0].yaw);
  set.add(node('wires', merge(wires), M.flat));
  set.add(node('bunting1', bunting(eave(houses[2], 'eaveR'), topL, { sag: 0.7, count: 11, seed: 3 }), M.lantern));
  set.add(node('bunting2', bunting(topR, eave(houses[3], 'eaveL'), { sag: 0.7, count: 11, seed: 5 }), M.lantern));
  set.add(node('bunting3', bunting(eave(houses[1], 'eaveR'), eave(houses[3], 'ridge'), { sag: 0.4, count: 8, seed: 7 }), M.lantern));
  set.add(node('bunting4', bunting(eave(houses[2], 'ridge'), eave(houses[0], 'eaveL'), { sag: 0.4, count: 8, seed: 9 }), M.lantern));

  // far things: a headland with the lighthouse, a second shore with a huddle of houses, rocks
  const far = group('far');
  const HEAD = [-52, -0.6, -135], LH = [-11.7, 0, -129];
  const headMesh = headland({ w: 96, d: 34, h: 9, seed: 3 });
  far.add(node('headland', headMesh, M.far, { pos: HEAD }));
  // stand the lighthouse on the ground the headland actually has under that spot
  { let top = 0; const Pm = headMesh.positions; for (let i = 0; i < Pm.length; i += 3) if (Math.hypot(Pm[i] + HEAD[0] - LH[0], Pm[i + 2] + HEAD[2] - LH[2]) < 5 && Pm[i + 1] > top) top = Pm[i + 1]; LH[1] = HEAD[1] + top - 0.8; }
  const lh = lighthouse({ h: 13, r: 2.3 });
  far.add(node('lighthouse', lh, M.far, { pos: LH }));
  far.add(node('shore2', headland({ w: 80, d: 30, h: 15, seed: 8, grass: PAL.leafDark }), M.far, { pos: [78, -0.6, -150], rot: [0, 172, 0] }));
  for (let i = 0; i < 7; i++) { const s = 2.2 + r() * 1.6; far.add(node('town' + i, merge(tint(place(roundedBox(s, s * 1.2, s, 0.2, 1), 0, s * 0.6, 0), i % 2 ? PAL.cream : '#ffe6c4'), tint(place(cylinder(s * 0.85, 0, s * 0.9, 4), 0, s * 1.2, 0, 0, 45, 0), PAL.roofs[i % 5])), M.far, { pos: [48 + i * 5.2 + r() * 2, 3.5 + Math.sin(i * 1.3) * 2.2 + i * 0.5, -137 + r() * 5], rot: [0, r() * 40, 0] })); }
  for (const [x, z, s, seed] of [[-7.5, -19, 1.5, 3], [-9.2, -18.2, 0.9, 5], [9.5, -24, 1.9, 8], [19, -40, 2.6, 2]]) far.add(node('rock', rock({ seed, s }), M.prop, { pos: [x, WATER - 0.05, z] }));
  far.add(node('sailboat', boat({ len: 3.4, hull: PAL.cream, keel: PAL.teal, pennant: PAL.red, seed: 3 }), M.prop, { pos: [-5.5, WATER, -30], rot: [0, 115, 0] }));

  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  if (env.sky.sunDir) env.sky.sunDir = norm(env.sky.sunDir);
  env.water.level = WATER;
  env.water.shores = [[0, QUAY_Z + 0.1 + 900, 900, 0.75], [BOAT[0], BOAT[2], 0.95, 0.5], [BOAT[0] + 0.9, BOAT[2] + 0.15, 0.62, 0.45], [BOAT[0] - 0.9, BOAT[2] - 0.15, 0.62, 0.45], [-7.5, -19, 1.25, 0.6], [9.5, -24, 1.6, 0.7], [19, -40, 2.2, 0.8], [-5.5, -30, 1.3, 0.6], [-52, -135, 46, 1.6], [78, -150, 39, 1.6]];
  scene.root.add(mergeStatic(set, 'set'), mergeStatic(far, 'far'));

  // ---- cobbles: one instanced draw
  const cob = node('cobbles', cobble(), M.flat); cob.castShadow = false;
  const cobCols = ['#fbeac4', '#e4cc9c', '#f6dfb2', '#e0c696', '#f2d8aa'];
  scatter(cob, 520, (i) => {
    const col = i % 20, row = Math.floor(i / 20), x = -6.4 + col * 0.66 + (row % 2) * 0.33 + (r() - 0.5) * 0.16, z = QUAY_Z + 0.95 + row * 0.5 + (r() - 0.5) * 0.12;
    if (r() < 0.38) return null;
    const sc = 0.2 + r() * 0.09; return { m: m4.trs(x, 0.002, z, 0, r() * 360, 0, sc * 1.25, 1, sc * 0.9), color: cobCols[Math.floor(r() * cobCols.length)] };
  });
  scene.root.add(cob);

  // ---- foreground clutter (near the camera, low): its own node so a view can hide it
  const fg = group('fg');
  fg.add(node('fg1', crate({ s: 0.55, seed: 21 }), M.prop, { pos: [-1.55, 0, 2.95], rot: [0, 20, 0] }), node('fg2', barrel({ r: 0.28, h: 0.68 }), M.prop, { pos: [-2.15, 0, 2.6] }), node('fg3', sack({ seed: 4, s: 0.3 }), M.prop, { pos: [1.7, 0, 3.05], rot: [0, -30, 0] }), node('fg4', crate({ s: 0.5, seed: 9, color: PAL.wood2 }), M.prop, { pos: [2.25, 0, 2.6], rot: [0, -12, 0] }), node('fg5', ropeCoil({ r: 0.22 }), M.prop, { pos: [1.25, 0, 2.55] }));
  const foreground = mergeStatic(fg, 'foreground');
  scene.root.add(foreground);

  // ---- the moored boat bobs, so it is its own node
  const boatMesh = boat({ len: 3.3, hull: PAL.cream, keel: PAL.red, pennant: PAL.yellow, seed: 1 });
  const boatNode = node('boat', boatMesh, M.prop, { pos: BOAT, rot: [0, 78, 0] });
  scene.root.add(boatNode);

  // ---- paper lanterns: two shapes, two instanced draws
  const lanterns = []; // { hook, col [r,g,b], s, ph, lit, shape, inst, idx, glow }
  const shapeMesh = [paperLantern({ r: 0.17, shape: 'round' }), paperLantern({ r: 0.15, shape: 'tall' })];
  const shapeLen = shapeMesh.map((m) => -m.anchors.centre[1]);
  strings.forEach((s, si) => s.hooks.forEach((h, i) => {
    if (i === s.big) return;
    const shape = (i + si) % 3 === 1 ? 1 : 0;
    lanterns.push({ hook: h, col: GL0.rgb(PAL.lanterns[s.cols[i]]), s: 0.72 + r() * 0.24 + (si === 1 ? 0.12 : 0), ph: r() * 6.283, lit: 1, shape, inst: null, idx: 0, glow: null });
  }));
  // three more hang off the front corner of Nan's stall on a short line
  const nanLine = lanternString(nanTop, [nanHook[0] + 0.5, nanHook[1] + 0.25, nanHook[2] + 0.2], { sag: 0.25, count: 3, ends: 0.2 });
  const nanLanterns = [];
  nanLine.hooks.forEach((h, i) => { nanLanterns.push(lanterns.length); lanterns.push({ hook: h, col: GL0.rgb(PAL.lanterns[[1, 2, 5][i]]), s: 0.9, ph: r() * 6.283, lit: 1, shape: i === 1 ? 1 : 0, inst: null, idx: 0, glow: null }); });
  scene.root.add(node('nan-line', nanLine.wire, M.flat));
  const lanternNodes = shapeMesh.map((m, k) => { const n = node('lanterns' + k, m, M.lantern); n.castShadow = false; n.instances = makeInstances(lanterns.filter((l) => l.shape === k).length); scene.root.add(n); return n; });
  { const count = [0, 0]; for (const l of lanterns) { l.inst = lanternNodes[l.shape].instances; l.idx = count[l.shape]++; } lanternNodes.forEach((n, k) => { n.instances.count = count[k]; }); }

  // the big lantern over the stage: the focal light
  const bigHook = front.hooks[BIG];
  const bigMesh = paperLantern({ r: 0.42, shape: 'round', seg: 16, cord: 0.14 });
  const big = node('big-lantern', bigMesh, M.lantern, { pos: bigHook }); big.castShadow = false; big.tint.set([1.0, 0.72, 0.3, 1]);
  scene.root.add(big);
  const bigLen = -bigMesh.anchors.centre[1], FOCUS = [bigHook[0], bigHook[1] - bigLen, bigHook[2]];

  // ---- lamps: six fixed point lights
  const stallLamp = (i) => anchorAt(stalls[i].mesh, 'lamp', stalls[i].pos, stalls[i].yaw);
  const postLamp = anchorAt(post, 'lamp', POST, 180);
  const lamps = [
    { name: 'big', pos: [FOCUS[0], FOCUS[1], FOCUS[2]], color: '#ffb85a', radius: 7.2, base: 1.15 },
    { name: 'stall-nan', pos: stallLamp(0), color: '#ffc46a', radius: 3.4, base: 1 },
    { name: 'stall-fruit', pos: stallLamp(1), color: '#ffc46a', radius: 3.4, base: 1 },
    { name: 'stall-jars', pos: stallLamp(2), color: '#ffd07a', radius: 3.4, base: 0.95 },
    { name: 'stall-tobb', pos: stallLamp(3), color: '#ffb060', radius: 3.4, base: 0.95 },
    { name: 'quay-post', pos: postLamp, color: '#ffc870', radius: 5.2, base: 1 },
  ];
  env.points = lamps.map((l) => ({ pos: l.pos, color: GL0.rgb(l.color), radius: l.radius, intensity: l.base * L.power }));

  // ---- sprites: glows, then room for particles
  const sprites = scene.sprites = createSprites(384);
  for (const l of lanterns) l.glow = sprites.add({ kind: 'glow', pos: l.hook, size: 0.95 * l.s, color: l.col, alpha: 0 });
  const bigGlow = sprites.add({ kind: 'glow', pos: FOCUS, size: 2.5, color: '#ffa040', alpha: 0 });
  const lampGlows = lamps.slice(1).map((l) => sprites.add({ kind: 'glow', pos: l.pos, size: l.name === 'quay-post' ? 1.9 : 1.5, color: '#ffb450', alpha: 0 }));
  const winGlows = [];
  houses.forEach((h) => anchorAt(h.mesh, 'windows', h.pos, h.yaw).forEach((p) => winGlows.push(sprites.add({ kind: 'glow', pos: p, size: 1.1, color: '#ffc060', alpha: 0 }))));
  const lhLamp = anchorAt(lh, 'lamp', LH);
  const lhGlow = sprites.add({ kind: 'glow', pos: lhLamp, size: 15, color: '#ffe08a', alpha: 0 });
  // lanterns set afloat for the dark islands: a scatter of small lights on the water
  const floats = [], floatMesh = merge(tint(place(cylinder(0.2, 0.17, 0.05, 8), 0, 0, 0), PAL.wood), setGlow(tint(place(roundedBox(0.2, 0.22, 0.2, 0.04, 1), 0, 0.16, 0), '#ffffff'), 0.95));
  const floatNode = node('floats', floatMesh, M.speck);
  scatter(floatNode, 22, (i) => {
    const x = -16 + r() * 34, z = QUAY_Z - 3.5 - r() * r() * 46, col = PAL.lanterns[i % PAL.lanterns.length];
    if (Math.hypot(x - BOAT[0], z - BOAT[2]) < 2.2) return null;
    floats.push({ pos: [x, WATER + 0.2, z], glow: sprites.add({ kind: 'glow', pos: [x, WATER + 0.2, z], size: 0.8, color: col, alpha: 0 }), ph: r() * 6.283 });
    return { m: m4.trs(x, WATER, z, 0, r() * 360, 0, 1), color: L.power > 0 ? col : [0.9, 0.86, 0.8] };
  });
  scene.root.add(floatNode);

  // ---- light shafts: under the big lantern and the quay lamp, the lighthouse beam, two slants of low sun
  const shafts = [];
  if (L.ray > 0) {
    const rm = rayMaterial({ power: 1.5, near: L.ray, far: 0 });
    const s1 = node('shaft-big', tint(rayMesh(2.3, 0.3, 1.9, 18), '#ffb050'), rm, { pos: [FOCUS[0], FOCUS[1] - 0.25, FOCUS[2]] });
    const s2 = node('shaft-post', tint(rayMesh(2.3, 0.1, 1.35, 14), '#ffc060'), rm, { pos: [postLamp[0], postLamp[1], postLamp[2]] });
    scene.root.add(s1, s2); shafts.push(s1, s2);
  }
  const beam = group('lh-beam', { pos: lhLamp });
  if (L.power > 0) { const bm = rayMaterial({ power: 1.3, near: light === 'night' ? 0.34 : 0.22, far: 0 }), bmesh = tint(rayMesh(70, 0.6, 7, 14), '#ffe9a0'); beam.add(node('b1', bmesh, bm, { rot: [0, 0, 84] }), node('b2', bmesh, bm, { rot: [0, 0, -84] })); }
  scene.root.add(beam);
  if (L.sunShaft > 0) {
    const sm = rayMaterial({ power: 1.1, near: L.sunShaft, far: 0.0 }), holder = group('sun-shafts'); scene.root.add(holder); holder.updateWorld(null);
    const kd = env.key.dir, down = [-kd[0], -kd[1], -kd[2]];
    for (const [x, z, len, w] of [[0.5, -0.2, 15, 1.5], [-0.4, 3.2, 17, 1.2]]) {
      const n = node('sun-shaft', tint(rayMesh(len, 0.5, w, 10), '#ffd890'), sm, { pos: [x + kd[0] * len, kd[1] * len - 0.2, z + kd[2] * len], parent: holder });
      aimAxis(n, [0, -1, 0], down);
    }
  }

  // ---- sky: clouds, gulls
  const clouds = cloudBank({ count: 9, seed: 7, arc: [158, 204], radius: [250, 430], height: [14, 130], size: [0.7, 1.5], speed: 0.05, ...L.cloud });
  scene.root.add(clouds.node);
  const gulls = node('gulls', gull({}), M.speck); gulls.instances = makeInstances(5); gulls.instances.count = 5;
  if (light !== 'night') scene.root.add(gulls);

  const actors = group('actors'); scene.root.add(actors);

  // ---- per-frame state (everything below is allocation-free)
  let power = 1;
  const P = [0, 0, 0], V = [0, 0, 0], S3 = [1, 1, 1], Q = quat.create(), Mx = m4.create(), rnd = rng(77);
  const chimneys = [anchorAt(houses[0].mesh, 'chimney', houses[0].pos, houses[0].yaw), anchorAt(houses[1].mesh, 'chimney', houses[1].pos, houses[1].yaw)];
  const cool = light === 'day' ? 0 : 0.1; // a lantern that is out keeps its paper colour, dimmed and cooled
  let nextPuff = 0, nextSpark = 0, nextEmber = 0, nextGust = 1.2, nextRing = 0.8, lastT = -1;

  function setLantern(i, lit) { const l = lanterns[i]; if (!l) throw new Error(`lantern-stalls: no lantern ${i} (have ${lanterns.length})`); l.lit = Math.max(0, Math.min(1, lit)); }
  function setPower(p) { power = Math.max(0, Math.min(1.5, p)); }

  function update(time, dt = 0) {
    const pw = L.power * power, on = Math.min(1, pw);
    // paper lanterns: sway on their hooks, glow follows
    for (let i = 0; i < lanterns.length; i++) {
      const l = lanterns[i], az = (Math.sin(time * 1.25 + l.ph) * 5 + Math.sin(time * 0.43 + l.ph * 2.1) * 4) * DEG, ax = Math.sin(time * 1.05 + l.ph * 1.7) * 4 * DEG;
      quat.fromEuler(Q, ax, 0, az); S3[0] = S3[1] = S3[2] = l.s;
      m4.fromTRS(Mx, l.hook, Q, S3);
      const d = l.inst.data, o = l.idx * 20, k = l.lit * on, fl = 0.94 + 0.06 * Math.sin(time * 9.0 + l.ph * 5);
      d.set(Mx, o);
      const u0 = l.col[0] * L.unlit * (1 - cool), u1 = l.col[1] * L.unlit, u2 = l.col[2] * L.unlit + cool * 2;
      d[o + 16] = u0 + (l.col[0] * 1.06 * fl - u0) * k; d[o + 17] = u1 + (l.col[1] * fl - u1) * k; d[o + 18] = u2 + (l.col[2] * fl - u2) * k;
      l.inst.dirty = true;
      const len = shapeLen[l.shape] * l.s, g = l.glow;
      g.pos[0] = l.hook[0] + Math.sin(az) * len; g.pos[1] = l.hook[1] - Math.cos(az) * len; g.pos[2] = l.hook[2] - Math.sin(ax) * len;
      g.alpha = (L.glow + 0.06) * l.lit * Math.min(1.2, pw) * fl;
    }
    // the big lantern swings slowly; its light and glow go with it
    const bz = Math.sin(time * 0.8) * 3.2 * DEG, bx = Math.sin(time * 0.63 + 1) * 2.4 * DEG, flick = 0.93 + 0.07 * Math.sin(time * 11.3) * Math.sin(time * 6.1);
    quat.fromEuler(big.rotation, bx, 0, bz);
    const bp = lamps[0].pos; bp[0] = bigHook[0] + Math.sin(bz) * bigLen; bp[1] = bigHook[1] - Math.cos(bz) * bigLen; bp[2] = bigHook[2] - Math.sin(bx) * bigLen;
    bigGlow.pos[0] = bp[0]; bigGlow.pos[1] = bp[1]; bigGlow.pos[2] = bp[2]; bigGlow.alpha = L.glow * Math.min(1.2, pw) * flick; bigGlow.size[0] = bigGlow.size[1] = 2.5 * (0.96 + 0.04 * flick);
    big.tint[0] = L.unlit * 0.98 + (1 - L.unlit * 0.98) * on; big.tint[1] = L.unlit * 0.72 * (1 - on) + 0.72 * on; big.tint[2] = (L.unlit * 0.34 + cool * 2) * (1 - on) + 0.3 * on;
    for (let i = 0; i < lamps.length; i++) env.points[i].intensity = lamps[i].base * pw * (i === 0 ? flick : 0.95 + 0.05 * Math.sin(time * 8.3 + i * 2.1));
    for (let i = 0; i < lampGlows.length; i++) lampGlows[i].alpha = 0.55 * Math.min(1.2, pw);
    for (let i = 0; i < winGlows.length; i++) winGlows[i].alpha = (light === 'day' ? 0 : 0.42);
    for (let i = 0; i < shafts.length; i++) shafts[i].visible = pw > 0.05;
    // the lighthouse turns; its glow swells as the beam comes round
    beam.setRot(0, time * 22, 0);
    lhGlow.alpha = L.power > 0 ? 0.3 + 0.3 * Math.pow(Math.abs(Math.cos(time * 22 * DEG)), 6) : 0;
    for (let i = 0; i < floats.length; i++) floats[i].glow.alpha = L.power > 0 ? 0.5 + 0.2 * Math.sin(time * 2.1 + floats[i].ph) : 0;
    // boat
    boatNode.position[1] = BOAT[1] + Math.sin(time * 1.3) * 0.04;
    boatNode.setRot(Math.sin(time * 1.1) * 2.5, 78 + Math.sin(time * 0.3) * 3, Math.sin(time * 1.6 + 1) * 4);
    clouds.update(time);
    // gulls wheel over the water
    for (let i = 0; i < 5; i++) {
      const a = time * (0.22 + i * 0.03) * (i % 2 ? 1 : -1) + i * 1.9, rad = 7 + i * 2.2, cx = -4 + i * 3.5, cz = -24 - i * 5;
      P[0] = cx + Math.cos(a) * rad; P[1] = 4.5 + i * 1.2 + Math.sin(time * 0.5 + i) * 0.8; P[2] = cz + Math.sin(a) * rad * 0.6;
      quat.fromEuler(Q, 0, Math.sin(a) * 0.35, Math.cos(a) * 0.3 * (i % 2 ? 1 : -1)); // wings stay across the view: far gulls are tick marks
      const flap = Math.sin(time * (5.5 + i * 0.4) + i * 2); S3[0] = 1.9; S3[1] = 1.9 * (0.5 + 1.3 * flap); S3[2] = 1.9;
      if (Math.abs(S3[1]) < 0.12) S3[1] = 0.12;
      m4.fromTRS(Mx, P, Q, S3); gulls.instances.data.set(Mx, i * 20);
    }
    gulls.instances.dirty = true;

    // particles (skipped when time jumps)
    if (lastT >= 0 && time - lastT < 0.5 && dt > 0) {
      if (time > nextPuff) { nextPuff = time + 0.5; const c = chimneys[rnd() < 0.5 ? 0 : 1]; sprites.puff(c, { count: 1, size: 0.5, rise: 0.6, spread: 0.12, life: 3.0, color: L.smoke }); }
      if (pw > 0.05 && time > nextSpark) { nextSpark = time + 0.16; const l = lanterns[Math.floor(rnd() * lanterns.length)]; if (l.lit > 0.5) sprites.sparkle(l.glow.pos, { count: 1, size: 0.16, spread: 0.5, life: 0.9, color: '#fff0b0' }); }
      if (time > nextEmber) { // slow warm motes drifting up through the lane
        nextEmber = time + 0.3; P[0] = -3 + rnd() * 6; P[1] = 0.3 + rnd() * 2.6; P[2] = -4 + rnd() * 6; V[0] = 0.12 + rnd() * 0.1; V[1] = 0.12 + rnd() * 0.16; V[2] = 0.05;
        sprites.spawn({ kind: 'glow', pos: P, vel: V, size: 0.1 + rnd() * 0.08, life: 4.5, color: light === 'day' ? '#ffffff' : '#ffd070', alpha: light === 'day' ? 0.5 : 0.9 });
      }
      if (time > nextGust) { nextGust = time + 2.6 + rnd() * 1.5; P[0] = -4 + rnd() * 3; P[1] = 2.6 + rnd() * 2.6; P[2] = -6 + rnd() * 5; V[0] = 2.0; V[1] = 0.1; V[2] = 0.25; sprites.gust(P, { vel: V, size: 0.9 + rnd() * 0.5, life: 2.2, alpha: 0.85, color: light === 'night' ? '#c6d6ff' : '#fff6e6' }); }
      if (time > nextRing) { nextRing = time + 1.7; P[0] = -6 + rnd() * 14; P[1] = WATER + 0.03; P[2] = QUAY_Z - 1.2 - rnd() * 6; sprites.splash(P, { size: 0.9 + rnd() * 0.6, life: 1.4, spray: 0, color: light === 'night' ? '#bcd4ff' : '#fff6e4' }); }
      sprites.update(dt);
    }
    lastT = time;
  }

  function frame(camera, name, time = 0) {
    const c = CAMERAS[name];
    if (!c) throw new Error(`lantern-stalls: no camera "${name}" (have ${Object.keys(CAMERAS).join(', ')})`);
    camera.fov = c.fov;
    camera.orbit(c.target, c.dist * (1 + Math.sin(time * 0.17) * 0.012), c.yaw + Math.sin(time * 0.21) * 1.6, c.pitch + Math.sin(time * 0.13 + 1) * 0.5);
    env.shadow.center = c.shadowCenter; env.shadow.radius = c.shadowRadius; env.outline.width = c.outline || 1;
    return camera;
  }
  const views = {}; for (const k of Object.keys(CAMERAS)) views[k] = { shadowCenter: CAMERAS[k].shadowCenter, shadowRadius: CAMERAS[k].shadowRadius };

  update(0, 0);
  return {
    id: 'lantern-stalls', light, scene, env, actors, foreground,
    cameras: CAMERAS, frame, view: (name) => views[name],
    marks: { ...MARKS, focus: FOCUS, nanLanterns },
    lamps, setPower, setLantern, lanternCount: lanterns.length,
    update,
  };
}

export const lanternStalls = { id: 'lantern-stalls', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default lanternStalls;
