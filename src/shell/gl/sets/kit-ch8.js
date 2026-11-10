// The chapter 8 kit: Cresset, the capital, and Carrow, the island of the ending. Same rules as kit.js
// (pure, one options object per builder, per-vertex colour, anchors in the builder's own space, chunky
// and a little crooked). Used by sets/assembly, carrow-dusk, carrow-morning, cresset-harbour,
// founders-lamp, full-bench, lane-by-hand, mole-dark, quay-break.
//
// The shell
//   shell8(spec)               everything a chapter 8 set returns that is the same for all nine: cameras, frame(),
//                              view(), lamps -> env.points, setPower(), update() (lamp flicker, glows, motes, sprites)
//   cams(over), marks8()       the standard camera marks and standing marks, with per-set overrides
//   pick8(id, LIGHTS, name)    a light state by name; an unknown name warns and uses the first
//   putInst(inst, i, ...)      write one instance transform and colour without allocating
//   materials8()               kitMaterials() + wall (encloses a room, casts nothing), shaft (additive), sea, glass
// Cresset
//   lampTower(opts)            the Founders' Lamp from outside: { body, glass } + anchors lamp, top, door
//   cressetFar(opts)           the capital's geography, shared by the four harbour sets: the mole, the tower on its
//                              head, the town and the Assembly dome: { nodes[], glass (a node), anchors }
//   harbourBase(opts)          the quay the four harbour sets stand on, with cressetFar beyond it and the lamp's light
//   mole(opts), dome(opts)     the breakwater; the Assembly dome
//   seaWall(opts)              the sea standing up: a long curling wall of water (materials8().sea)
//   skiff(opts)                a tubby open boat with a fire pan on a bow post, pale so an instance colour paints it
//   cart(opts), shipLantern(), chalkWall(opts)
// The lamp-house
//   lampPlinth(opts), lampRing(R), brassCap(opts), chain(len), winch(opts), hopper(opts), bin(opts), shovel()
//   arcWall(opts), arcStair(opts), glazing(opts)
// The Assembly and the Bench
//   horseshoe(opts)            seat positions on an arc open toward the camera
//   seat(), drape(), tierArc(opts), domeInside(opts), column8(opts), lectern(opts), treaty()
//   highBench(opts), magistrate(opts), dock(opts), greatWindow(opts), bannerDrop(opts), chequer(opts), bucket()
// Carrow
//   lampHouse(opts)            the stone lamp-house: anchors door, lamp, top
//   kelpRack(opts), goat(opts), pebble(), beach(opts), drystone(opts), bowlTable()

import { m4, quat, rng, DEG, rgb } from '../math.js';
import {
  sphere, ellipsoid, blob, cylinder, lathe, torus, box, roundedBox, extrude, tube, curve, plane, fromArrays,
  merge, tint, place, setGlow, setOutline, gradientY, deform, flip, scale as scaleMesh,
} from '../mesh.js';
import { node, group, material, mergeStatic } from '../scene.js';
import { rayMesh, rayMaterial } from '../fx.js';
import { PAL, kitMaterials, wonk, townBank, quayEdge, cobble, scatter, cloudBank } from './kit.js';

/** Chapter 8 colours: white capital stone, oxblood and brass, the cold white of the great lamp, kelp-flame violet. */
export const C8 = {
  marble: '#fff4e0', marble2: '#f6dfc6', marbleCool: '#e6e4ff', stoneBlue: '#98a6f2', slate: '#7080dc', slateDark: '#4b59b8',
  oxblood: '#c0344e', oxbloodDark: '#8e2448', brass: '#ffc94a', brassDark: '#dc9230', copper: '#3fd0b8', copperDark: '#2aa69c',
  grey: '#c2c6de', greyDark: '#979dc4', lampWhite: '#f4f9ff', lampBlue: '#b4dcff', kelp: '#c2a8ff', kelpDeep: '#8f6fe8',
  kelpGreen: '#58b06c', kelpDark: '#2f8f74', royal: '#3b62d8', navy: '#27336e', wine: '#c23a5e', plum: '#7a4fc4', teal: '#27b8a8',
  parchment: '#fff3d6', wood: '#d08a4a', woodRed: '#b05a44', woodDark: '#8a4a36', chalk: '#ffffff', iron: '#3b4a7a',
  shingle: ['#f2e6d2', '#d9d3ee', '#ffd9c8', '#c6cdf0', '#f6efe0', '#e8c8b4'],
};

const R = (seed) => rng(Math.floor(seed * 7919) + 17);
const bx = (w, h, d, x, y, z, c, rx = 0, ry = 0, rz = 0) => tint(place(box(w, h, d), x, y, z, rx, ry, rz), c);
const rb = (w, h, d, rad, x, y, z, c, rx = 0, ry = 0, rz = 0) => tint(place(roundedBox(w, h, d, rad, 1), x, y, z, rx, ry, rz), c);
const cyl = (r0, r1, h, seg, x, y, z, c, rx = 0, ry = 0, rz = 0) => tint(place(cylinder(r0, r1, h, seg), x, y, z, rx, ry, rz), c);
const keep = (mesh, anchors) => { mesh.anchors = anchors; return mesh; };
export const norm8 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
/** A direction toward a light: az 0 = straight out (toward -Z), + = right; el = degrees above the horizon. */
export const dirFrom = (azDeg, elDeg) => [Math.sin(azDeg * DEG) * Math.cos(elDeg * DEG), Math.sin(elDeg * DEG), -Math.cos(azDeg * DEG) * Math.cos(elDeg * DEG)];

// ------------------------------------------------------------------------------------ the shell

const _q = quat.create(), _p = [0, 0, 0], _s = [1, 1, 1], _m = m4.create();
/** Write instance i of a node's instances: position, Euler degrees, scale, colour. Allocates nothing (for update loops). */
export function putInst(inst, i, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx, cr = 1, cg = 1, cb = 1) {
  quat.fromEuler(_q, rx * DEG, ry * DEG, rz * DEG); _p[0] = x; _p[1] = y; _p[2] = z; _s[0] = sx; _s[1] = sy; _s[2] = sz;
  m4.fromTRS(_m, _p, _q, _s);
  const d = inst.data, o = i * 20; d.set(_m, o); d[o + 16] = cr; d[o + 17] = cg; d[o + 18] = cb; d[o + 19] = 1; inst.dirty = true;
}

export function materials8() {
  return {
    ...kitMaterials(),
    wall: material({ name: 'ch8-wall', rim: 0, bandEdge: -0.2, outline: { width: 1.9, self: 0.65 }, castShadow: false }),
    shaft: material({ kind: 'beam', name: 'ch8-shaft', beam: { power: 0.7, near: 0.34, far: 0.03, steps: 0 }, outline: false }),
    sea: material({ name: 'ch8-sea', rim: 0, emissive: 0.9, bandEdge: -0.3, outline: { width: 2.2, self: 0.8 }, castShadow: false, receiveShadow: false, fog: 0.35 }),
    glass: material({ name: 'ch8-glass', rim: 0, outline: false, castShadow: false, receiveShadow: false, fog: 0.3 }),
  };
}

export function pick8(id, LIGHTS, name) {
  const first = Object.keys(LIGHTS)[0];
  if (name != null && LIGHTS[name]) return [name, LIGHTS[name]];
  if (name != null && typeof console !== 'undefined') console.warn(`${id}: unknown light "${name}" (have ${Object.keys(LIGHTS).join(', ')}); using "${first}"`);
  return [first, LIGHTS[first]];
}

const CAM8 = {
  wide: { target: [0.1, 1.55, -0.4], dist: 8.2, yaw: 3, pitch: 5, fov: 44, aspect: 0.46, shadowCenter: [0, 0, -1.2], shadowRadius: 8 },
  two: { target: [0, 1.12, 0.6], dist: 6.0, yaw: -15, pitch: 5, fov: 31, aspect: 0.46, shadowCenter: [0, 0, 0.3], shadowRadius: 3.6 },
  close: { target: [0.02, 0.86, 0.8], dist: 3.9, yaw: 21, pitch: 3, fov: 28, aspect: 0.46, shadowCenter: [0, 0, 0.5], shadowRadius: 2.6 },
  low: { target: [0.1, 1.75, 0.2], dist: 6.4, yaw: -7, pitch: -11, fov: 56, aspect: 0.46, shadowCenter: [0, 0, -1], shadowRadius: 8 },
  stage: { target: [0, 1.02, 0.5], dist: 9.4, yaw: -15, pitch: 7, fov: 24, aspect: 1.95, shadowCenter: [0, 0, -0.5], shadowRadius: 7.5, outline: 0.7 },
  landscape: { target: [0, 1.7, -1.2], dist: 10.5, yaw: 4, pitch: 5, fov: 40, aspect: 1.6, shadowCenter: [0, 0, -1.5], shadowRadius: 10.5 },
};
/** The standard six camera marks, each merged with over[name]. */
export function cams(over = {}) { const o = {}; for (const k of Object.keys(CAM8)) o[k] = { ...CAM8[k], ...(over[k] || {}) }; return o; }
/** The standard standing marks: a, b, c, two[2], party[3], opposition[3]. A fresh copy per set. */
export function marks8() {
  return {
    a: { pos: [-0.8, 0, 0.55], face: 14 }, b: { pos: [0.02, 0, 0.8], face: 0 }, c: { pos: [0.82, 0, 0.55], face: -14 },
    two: [{ pos: [-0.42, 0, 0.62], face: 24 }, { pos: [0.42, 0, 0.62], face: -24 }],
    party: [{ pos: [-1.05, 0, 0.75], face: 78 }, { pos: [-1.85, 0, 1.15], face: 72 }, { pos: [-2.5, 0, 0.5], face: 80 }],
    opposition: [{ pos: [1.05, 0, 0.75], face: -78 }, { pos: [1.85, 0, 1.15], face: -72 }, { pos: [2.55, 0, 0.5], face: -80 }],
  };
}

/**
 * The half of a set that is the same for every chapter 8 set.
 *   spec: { id, light, L (needs .power: how lit the lamps are in this light), low, scene, cameras, marks, actors, foreground,
 *           lamps [{ name, pos, color, radius, base, flicker?, k? (a live multiplier the set may change), fixed? (ignores power) }]  at most 6
 *           glows [{ sprite, base, lamp? (index: follows that lamp's k), fixed? }]
 *           motes { box [x0, x1, y0, y1, z0, z1], every, color, size, vel, life, alpha, kind } | null
 *           house   0..1: how far setPower reaches the scene's key light and ambient (rooms: 1; open air: 0)
 *           tick(time, dt, pw, live)   the set's own animation; pw = L.power * setPower; live is false on a time jump
 *           extra   set-specific fields merged into the result }
 * Sets with no hooks of their own still answer task() and cue() (null / false).
 */
export function shell8({ id, light, L, low = false, scene, cameras, marks, actors, foreground, lamps = [], glows = [], motes = null, house = 0, tick = null, extra = {} }) {
  const env = scene.env, sprites = scene.sprites;
  if (lamps.length > 6) throw new Error(`${id}: ${lamps.length} fixed lamps; the limit is 6 (the engine draws 8, two stay free for carried lamps)`);
  for (const l of lamps) if (l.k == null) l.k = 1;
  env.points = lamps.map((l) => ({ pos: l.pos, color: rgb(l.color), radius: l.radius, intensity: l.base }));
  const key0 = Array.from(env.key.color), amb0 = env.ambient.amount, lift0 = env.shadow.lift;
  const rnd = rng(811), P = [0, 0, 0], V0 = [0.05, 0.06, 0.02];
  let power = 1, lastT = -1, nextMote = 0;
  function setPower(p) { power = Math.max(0, Math.min(1.5, p)); }
  function update(time, dt = 0) {
    const pw = (L.power ?? 1) * power, live = lastT >= 0 && time - lastT < 0.5 && dt > 0;
    if (house > 0) {
      const h = power <= 1 ? 1 - house * 0.5 * (1 - power) : 1 + 0.16 * (power - 1);
      for (let i = 0; i < 3; i++) env.key.color[i] = key0[i] * h;
      env.ambient.amount = amb0 * (1 - 0.4 * house * (1 - Math.min(1, power))); env.shadow.lift = lift0 * (1 - 0.5 * house * (1 - Math.min(1, power)));
    }
    for (let i = 0; i < lamps.length; i++) { const l = lamps[i], f = l.flicker ?? 0.05; env.points[i].intensity = l.base * l.k * (l.fixed ? 1 : pw) * (1 - f + f * Math.sin(time * (7.3 + i * 1.7) + i * 2.1) * Math.sin(time * 3.1 + i)); }
    for (let i = 0; i < glows.length; i++) { const g = glows[i]; g.sprite.alpha = g.base * (g.lamp != null ? lamps[g.lamp].k : 1) * Math.min(1.25, g.fixed ? 1 : pw); }
    if (tick) tick(time, dt, pw, live);
    if (live) {
      if (motes && time > nextMote) {
        nextMote = time + motes.every; const b = motes.box;
        P[0] = b[0] + rnd() * (b[1] - b[0]); P[1] = b[2] + rnd() * (b[3] - b[2]); P[2] = b[4] + rnd() * (b[5] - b[4]);
        sprites.spawn({ kind: motes.kind || 'glow', pos: P, vel: motes.vel || V0, size: (motes.size || 0.07) * (0.6 + rnd() * 0.8), life: motes.life || 5, color: motes.color || '#ffe6a0', alpha: motes.alpha ?? 0.8, gravity: motes.gravity || 0 });
      }
      sprites.update(dt);
    }
    lastT = time;
  }
  function frame(camera, name, time = 0) {
    const c = cameras[name];
    if (!c) throw new Error(`${id}: no camera "${name}" (have ${Object.keys(cameras).join(', ')})`);
    camera.fov = c.fov;
    camera.orbit(c.target, c.dist * (1 + Math.sin(time * 0.17) * 0.01), c.yaw + Math.sin(time * 0.21) * 1.2, c.pitch + Math.sin(time * 0.13 + 1) * 0.4);
    env.shadow.center = c.shadowCenter; env.shadow.radius = c.shadowRadius; env.outline.width = c.outline || 1;
    return camera;
  }
  const views = {}; for (const k of Object.keys(cameras)) views[k] = { shadowCenter: cameras[k].shadowCenter, shadowRadius: cameras[k].shadowRadius };
  const set = { id, light, low, scene, env, actors, foreground: foreground || group('foreground'), cameras, frame, view: (name) => views[name], marks, lamps, setPower, update, task: () => null, cue: () => false, ...extra };
  update(0, 0);
  return set;
}

// ------------------------------------------------------------------------------------ Cresset from outside

/**
 * The Founders' Lamp: a fat white tower banded in oxblood, a brass gallery, a glazed lamp room under a brass dome.
 * Returns { body, glass }: the glass is its own mesh (white, glowing) so a set can put the lamp out. Origin: centre of the foot.
 * anchors (on body): lamp (centre of the lamp room), top, door.
 */
export function lampTower({ h = 14, r = 2.2, seg = 12, bands = 3 } = {}) {
  const y0 = h * 0.07, y1 = h * 0.68, rAt = (y) => r * (1.1 - 0.3 * Math.max(0, Math.min(1, (y - y0) / (y1 - y0))));
  const parts = [
    tint(lathe([[r * 1.42, 0], [r * 1.42, h * 0.045], [r * 1.16, y0], [rAt(y0), y0], [rAt(y1), y1], [r * 1.12, y1 + h * 0.025], [r * 1.12, y1 + h * 0.05], [r * 0.5, y1 + h * 0.05]], seg), C8.marble),
    tint(place(torus(r * 1.1, h * 0.012, seg, 5), 0, y1 + h * 0.085, 0), C8.brass),
    tint(place(lathe([[r * 0.78, 0], [r * 0.82, h * 0.02], [r * 0.6, h * 0.075], [r * 0.2, h * 0.11], [r * 0.09, h * 0.125], [r * 0.09, h * 0.16], [0, h * 0.175]], seg), 0, h * 0.875, 0), C8.brass),
    tint(place(sphere(r * 0.13, 8, 6), 0, h * 1.04, 0), C8.brass),
    tint(place(cylinder(r * 0.74, r * 0.74, h * 0.02, seg), 0, y1 + h * 0.05, 0), C8.oxblood),
  ];
  for (let i = 0; i < bands; i++) { const y = y0 + (y1 - y0) * (0.14 + i * 0.31), bh = h * 0.07; parts.push(tint(place(cylinder(rAt(y) + 0.04, rAt(y + bh) + 0.04, bh, seg, { caps: false }), 0, y, 0), i % 2 ? C8.brass : C8.oxblood)); }
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; parts.push(tint(place(box(r * 0.07, h * 0.13, r * 0.07), Math.cos(a) * r * 0.68, y1 + h * 0.12, Math.sin(a) * r * 0.68), C8.brassDark)); }
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; parts.push(tint(place(box(r * 0.05, h * 0.035, r * 0.05), Math.cos(a) * r * 1.1, y1 + h * 0.066, Math.sin(a) * r * 1.1), C8.brassDark)); }
  parts.push(tint(place(roundedBox(r * 0.5, h * 0.11, 0.3, 0.12, 1), 0, h * 0.055 + y0 * 0.6, rAt(y0) - 0.05), C8.oxbloodDark));
  for (const [y, a] of [[0.3, 20], [0.48, -25], [0.6, 10]]) parts.push(setGlow(tint(place(roundedBox(r * 0.2, h * 0.04, 0.2, 0.06, 1), Math.sin(a * DEG) * rAt(h * y), h * y, Math.cos(a * DEG) * rAt(h * y) - 0.04, 0, a, 0), '#ffd880'), 0.9));
  const glass = setGlow(setOutline(tint(place(cylinder(r * 0.62, r * 0.62, h * 0.125, seg, { caps: false }), 0, y1 + h * 0.07, 0), C8.lampWhite), 0.4), 1);
  return { body: keep(merge(parts), { lamp: [0, y1 + h * 0.13, 0], top: [0, h * 1.06, 0], door: [0, 0, rAt(0) + 0.3] }), glass };
}

/** The mole: a breakwater along X, its walkway top at y = 0, a blocky parapet on the seaward (-Z) side, round arches in its face. */
export function mole({ len = 60, w = 3.2, drop = 2.2, parapet = 1.0, seed = 1, block = 2.4, color = C8.marble2, arches = true } = {}) {
  const r = R(seed), parts = [bx(len, drop + 0.3, w, 0, -(drop + 0.3) / 2, 0, color), bx(len + 0.3, 0.22, w + 0.3, 0, -0.02, 0, C8.marble)];
  parts.push(bx(len, parapet * 0.6, 0.6, 0, parapet * 0.3, -w / 2 + 0.3, color));
  const n = Math.floor(len / block);
  for (let i = 0; i < n; i++) if (i % 2 === 0) parts.push(bx(block * 0.92, parapet * 0.5, 0.7, -len / 2 + (i + 0.5) * block, parapet * 0.6 + parapet * 0.22 + r() * 0.05, -w / 2 + 0.3, i % 4 ? C8.marble : '#ffe6c8', 0, 0, (r() - 0.5) * 3));
  if (arches) for (let x = -len / 2 + 3; x < len / 2 - 2; x += 6) parts.push(tint(place(roundedBox(2.4, drop * 1.3, 0.3, 1.1, 1), x, -drop * 0.75, w / 2 - 0.05), C8.slate));
  return merge(parts);
}

/** The Assembly dome from outside: a white drum with columns, a copper-green dome, a brass lantern. Origin: centre of the foot. anchors: top, eye */
export function dome({ r = 6, drum = 4, seg = 14 } = {}) {
  const parts = [
    tint(cylinder(r * 1.12, r * 1.08, drum * 0.2, seg), C8.marble2), tint(place(cylinder(r * 0.94, r * 0.94, drum, seg), 0, drum * 0.2, 0), C8.marble),
    tint(place(cylinder(r * 1.08, r * 1.08, drum * 0.14, seg), 0, drum * 1.2, 0), C8.marble2),
    tint(place(lathe([[r, 0], [r * 0.97, r * 0.3], [r * 0.83, r * 0.58], [r * 0.56, r * 0.82], [r * 0.24, r * 0.94], [r * 0.2, r * 0.96]], seg, { crease: 180 }), 0, drum * 1.34, 0), C8.copper),
    tint(place(lathe([[r * 0.24, 0], [r * 0.24, r * 0.16], [r * 0.3, r * 0.18], [r * 0.12, r * 0.32], [0, r * 0.5]], 8), 0, drum * 1.34 + r * 0.94, 0), C8.brass),
  ];
  for (let i = 0; i < seg; i++) { const a = ((i + 0.5) / seg) * Math.PI * 2; parts.push(tint(place(cylinder(r * 0.07, r * 0.07, drum, 6), Math.cos(a) * r * 1.0, drum * 0.2, Math.sin(a) * r * 1.0), C8.marble)); }
  for (let i = 0; i < seg; i += 2) { const a = (i / seg) * Math.PI * 2; parts.push(setGlow(tint(place(roundedBox(r * 0.16, drum * 0.55, 0.2, 0.07, 1), Math.sin(a) * r * 0.95, drum * 0.7, Math.cos(a) * r * 0.95, 0, a / DEG, 0), '#ffe08a'), 0.85)); }
  return keep(merge(parts), { top: [0, drum * 1.34 + r * 1.44, 0], eye: [0, drum * 1.34 + r * 0.96, 0] });
}

/**
 * The capital's geography, the same in every harbour set (camera looks toward -Z, out to sea): the mole runs across the
 * view at z = moleZ, the Founders' Lamp stands on its head at `tower`, the town climbs the left arm of the bay under
 * the Assembly dome. Returns { nodes (far statics, unmerged, to add to a far group), glass (a node: the lamp room's
 * panes, for putting the lamp out), anchors: { lamp, top, dome, windows[], moleZ } }.
 */
export function cressetFar({ M, low = false, tower = [3.4, -1.2, -52], h = 16, moleZ = -52, water = -0.5, town = [-17, -0.5, -40], townYaw = 62, lit = 0.8, seed = 3, towerGlow = 0, moleDir = -1, moleLen = 110 } = {}) {
  const FAR = low ? M.farFlat : M.far, nodes = [];
  const moleY = water + 1.9;
  nodes.push(node('mole', mole({ len: moleLen, w: 4, drop: 2.6, parapet: 1.3, seed, block: 4.4, arches: false }), FAR, { pos: [tower[0] + moleDir * (moleLen / 2 - 3), moleY, moleZ] }));
  nodes.push(node('mole-head', tint(cylinder(5.2, 5.6, 3.0, low ? 10 : 14), C8.marble2), FAR, { pos: [tower[0], moleY - 2.9, moleZ] }));
  const T = lampTower({ h, r: h * 0.135, seg: low ? 10 : 14 }), TP = [tower[0], moleY, moleZ];
  if (towerGlow > 0) setGlow(T.body, towerGlow);
  nodes.push(node('tower', T.body, FAR, { pos: TP }));
  const glass = node('tower-glass', T.glass, M.glass, { pos: TP }); glass.castShadow = false;
  const bank = townBank({ w: 46, d: 18, h: 14, rows: low ? 3 : 4, seed: seed + 2, lit, walls: [C8.marble, '#ffe6c4', '#ffd9c8', '#fff6dc'], tower: false });
  nodes.push(node('town', bank, FAR, { pos: town, rot: [0, townYaw, 0] }));
  const c = Math.cos(townYaw * DEG), s = Math.sin(townYaw * DEG), at = (q) => [town[0] + q[0] * c + q[2] * s, town[1] + q[1], town[2] - q[0] * s + q[2] * c];
  const dm = dome({ r: 5.4, drum: 3.6, seg: low ? 10 : 14 }), DP = at([2, 12.2, -11]);
  nodes.push(node('dome', dm, FAR, { pos: DP }));
  nodes.push(node('town-foot', bx(52, 2.6, 3, 0, -0.6, 1.2, C8.marble2), FAR, { pos: town, rot: [0, townYaw, 0] }));
  const wins = (bank.anchors.windows || []).map(at);
  return { nodes, glass, anchors: { lamp: [TP[0], TP[1] + T.body.anchors.lamp[1], TP[2]], top: [TP[0], TP[1] + T.body.anchors.top[1], TP[2]], foot: TP, dome: [DP[0], DP[1] + dm.anchors.top[1], DP[2]], windows: wins, moleZ, moleY } };
}

/**
 * The ground the four harbour sets share: a cobbled quay ending at z = quayZ, the water, cressetFar() beyond, a cloud bank.
 * Adds all of it to scene.root (static geometry merged) and fills env.water. The scene must have its sprites already.
 * Returns { F (the cressetFar result), quayZ, water, clouds, lamp: { set(k 0..1), update(time) } }: lamp.set puts the
 * Founders' Lamp out or on (its panes, a big white halo, two turning beams).
 */
export function harbourBase({ scene, M, low = false, seed = 5, quayZ = -5.6, water = -0.5, ground = '#f2e6cc', cobbles = ['#fff6e0', '#eadcc0', '#f8ecd2', '#e4d4ba', '#fff0d8'], far = {}, cloud = {}, beam = 0.2, halo = '#dff0ff', haloSize = 20, quayLen = 30 } = {}) {
  const env = scene.env, r = rng(seed * 131 + 7), g = group('ground');
  g.add(node('ground', tint(place(plane(90, 22, 1, 1), 0, 0, quayZ + 0.3 + 11), ground), M.ground));
  g.add(node('quay', quayEdge({ len: low ? 22 : quayLen, drop: 1.7, seed }), M.ground, { pos: [0, 0, quayZ] }));
  for (const sx of [-1, 1]) g.add(node('quay-far', bx(32, 1.9, 0.5, sx * (low ? 27 : 31), -0.95, quayZ + 0.3, PAL.stone2), M.ground));
  g.traverse((n) => { n.castShadow = false; });
  scene.root.add(mergeStatic(g, 'ground'));
  const cob = node('cobbles', cobble(), M.flat); cob.castShadow = false;
  scatter(cob, low ? 150 : 320, (i) => {
    const col = i % 20, row = Math.floor(i / 20), x = -6.4 + col * 0.66 + (row % 2) * 0.33 + (r() - 0.5) * 0.16, z = quayZ + 0.95 + row * (low ? 0.95 : 0.55) + (r() - 0.5) * 0.12;
    if (r() < 0.42) return null;
    const sc = 0.2 + r() * 0.09; return { m: m4.trs(x, 0.002, z, 0, r() * 360, 0, sc * 1.25, 1, sc * 0.9), color: cobbles[Math.floor(r() * cobbles.length)] };
  });
  scene.root.add(cob);
  const F = cressetFar({ M, low, water, seed, ...far }), fg = group('far');
  F.nodes.forEach((n) => fg.add(n)); scene.root.add(mergeStatic(fg, 'far'), F.glass);
  env.water.level = water;
  env.water.shores = [[0, quayZ + 0.1 + 900, 900, 0.75], [F.anchors.foot[0], F.anchors.foot[2], 6.0, 1.0]];
  const clouds = cloudBank({ style: low ? 'painted' : 'solid', count: 8, seed: seed + 6, arc: [156, 206], radius: [260, 430], height: [30, 150], size: [0.7, 1.5], speed: 0.05, ...cloud });
  scene.root.add(clouds.node);
  const A = F.anchors.lamp, glow = scene.sprites.add({ kind: 'glow', pos: A, size: haloSize, color: halo, alpha: 0 }), core = scene.sprites.add({ kind: 'glow', pos: A, size: haloSize * 0.36, color: '#ffffff', alpha: 0 });
  const beams = group('lamp-beams', { pos: A });
  { const one = () => tint(rayMesh(80, 0.8, 9, low ? 8 : 14), '#eef6ff'); beams.add(node('beams', merge(place(one(), 0, 0, 0, 0, 0, 85), place(one(), 0, 0, 0, 0, 0, -85)), rayMaterial({ power: 1.3, near: beam, far: 0 }))); }
  scene.root.add(beams);
  let k = 1;
  const lamp = {
    set(v) { k = Math.max(0, Math.min(1, v)); },
    get level() { return k; },
    update(time) {
      const t = F.glass.tint; t[0] = 0.2 + 0.8 * k; t[1] = 0.26 + 0.74 * k; t[2] = 0.55 + 0.45 * k; F.glass.glow = k;
      glow.alpha = k * (0.42 + 0.14 * Math.pow(Math.abs(Math.cos(time * 14 * DEG)), 6)); core.alpha = k * 0.9; beams.visible = k > 0.4 && beam > 0; beams.setRot(0, time * 14, 0);
    },
  };
  return { F, quayZ, water, clouds, lamp };
}

/**
 * The sea standing up: a wall of water `w` long (along X) and `h` high, its face toward +Z, a band of foam along
 * its crest. Origin: the middle of its foot. Scale the node in Y to raise it. Use materials8().sea.
 */
export function seaWall({ w = 120, h = 9, seg = 28, seed = 1, bow = 0, deep = '#1c3ca8', mid = '#2f7fe0', high = '#63d6e6', foam = '#f4ffff' } = {}) {
  const prof = [[7, 0], [3.4, 0.04], [1.3, 0.26], [0.2, 0.56], [0.0, 0.78], [-0.5, 0.9], [-0.9, 0.93], [-1.8, 1.0], [-3.4, 0.96]], cols = [deep, deep, mid, mid, high, high, foam, foam, foam].map((c) => rgb(c));
  const pos = [], idx = [], np = prof.length, C = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg, x = (u - 0.5) * w, lump = 1 + 0.1 * Math.sin(u * 23 + seed) + 0.07 * Math.sin(u * 57 + seed * 2.3) + (i % 2 ? 0.035 : -0.035), back = bow * (u - 0.5) * (u - 0.5) * 4;
    for (let j = 0; j < np; j++) { const k = j >= 4 ? lump : 1; pos.push(x, prof[j][1] * h * k, prof[j][0] * (h / 9) - back + (j >= 5 ? Math.sin(u * 31 + seed) * 0.5 : 0)); const cc = cols[j], rib = j > 0 && j < 5 && i % 2 ? 1.12 : 1; C.push([Math.min(1, cc[0] * rib), Math.min(1, cc[1] * rib), Math.min(1, cc[2] * rib)]); }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < np - 1; j++) { const a = i * np + j, b = (i + 1) * np + j; idx.push(a, b, b + 1, a, b + 1, a + 1); }
  const m = fromArrays(pos, idx, null, 180);
  for (let i = 0; i < C.length; i++) { m.colors[i * 3] = C[i][0]; m.colors[i * 3 + 1] = C[i][1]; m.colors[i * 3 + 2] = C[i][2]; }
  return setOutline(m, 0);
}

/** A tubby open boat for instancing (pale: the instance colour paints it), bow toward +Z, waterline at y = 0. anchors: pan (the fire pan on its bow post), seats[2] */
export function skiff({ len = 1.9, pan = true } = {}) {
  const hull = deform(ellipsoid(len * 0.24, len * 0.2, len / 2, 8, 6), (p) => { if (p[1] > 0.03) p[1] = 0.03 + (p[1] - 0.03) * 0.15; p[1] += Math.abs(p[2]) * Math.abs(p[2]) * 0.09; }, 50);
  for (let i = 0; i < hull.colors.length; i += 3) { const top = hull.positions[i + 1] > 0.02 && Math.abs(hull.positions[i]) < len * 0.19 && Math.abs(hull.positions[i + 2]) < len * 0.4; hull.colors[i] = top ? 0.62 : 1; hull.colors[i + 1] = top ? 0.5 : 0.97; hull.colors[i + 2] = top ? 0.5 : 0.9; }
  const parts = [place(hull, 0, 0.08, 0), bx(len * 0.42, 0.05, 0.14, 0, 0.16, -len * 0.08, '#d9b48a')];
  const py = 0.78, pz = len * 0.42;
  if (pan) parts.push(cyl(0.025, 0.025, py - 0.1, 5, 0, 0.1, pz, '#6a6f9a'), tint(place(lathe([[0.05, 0], [0.17, 0.07], [0.18, 0.1], [0.15, 0.1]], 7), 0, py - 0.04, pz), '#6a6f9a'));
  return keep(merge(parts), { pan: [0, py + 0.06, pz], seats: [[0, 0.16, -len * 0.08], [0, 0.16, -len * 0.3]] });
}

/** A two-wheeled hand cart, standing (facing +Z, shafts forward). Tip it over with the node's rotation. About 1.5 long. */
export function cart({ color = C8.wood, trim = C8.woodDark, wheel = C8.oxblood, load = true, seed = 1 } = {}) {
  const r = R(seed), parts = [rb(0.95, 0.1, 1.4, 0.03, 0, 0.5, 0, color), bx(0.95, 0.3, 0.06, 0, 0.7, -0.67, trim), bx(0.06, 0.26, 1.4, -0.45, 0.68, 0, trim), bx(0.06, 0.26, 1.4, 0.45, 0.68, 0, trim)];
  for (const sx of [-1, 1]) {
    parts.push(tint(place(torus(0.36, 0.055, 12, 5), sx * 0.56, 0.4, -0.1, 0, 0, 90), wheel), cyl(0.07, 0.07, 0.1, 6, sx * 0.56 - 0.05 * sx - 0.05, 0.4, -0.1, trim, 0, 0, -90));
    for (let i = 0; i < 4; i++) parts.push(bx(0.035, 0.66, 0.035, sx * 0.56, 0.4, -0.1, trim, i * 45, 0, 0));
    parts.push(tint(tube([[sx * 0.4, 0.5, 0.7], [sx * 0.38, 0.56, 1.2], [sx * 0.36, 0.66, 1.55]], 0.035, 5), trim));
  }
  if (load) { parts.push(rb(0.5, 0.34, 0.5, 0.04, -0.15, 0.73, -0.25, PAL.wood2, 0, r() * 30, 0), tint(place(ellipsoid(0.24, 0.17, 0.3, 8, 5), 0.2, 0.7, 0.25), '#f1dca4')); }
  return merge(parts);
}

/** A ship's lantern to hang from a hook (origin at the hook): a brass cage, glowing glass. anchors: lamp */
export function shipLantern({ s = 1, glass = '#ffe2a0' } = {}) {
  const parts = [tint(place(torus(0.07, 0.016, 8, 4), 0, -0.07, 0, 90, 0, 0), C8.brassDark), cyl(0.05, 0.16, 0.1, 8, 0, -0.26, 0, C8.brass), cyl(0.17, 0.17, 0.04, 8, 0, -0.62, 0, C8.brass)];
  parts.push(setGlow(tint(place(cylinder(0.13, 0.13, 0.32, 8), 0, -0.58, 0), glass), 1));
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; parts.push(bx(0.025, 0.34, 0.025, Math.cos(a) * 0.145, -0.42, Math.sin(a) * 0.145, C8.brassDark)); }
  return keep(scaleMesh(merge(parts), s), { lamp: [0, -0.42 * s, 0] });
}

/** A stretch of harbour wall with rows of chalk tallies on it (who is owed), facing +Z, standing on y = 0. */
export function chalkWall({ w = 3, h = 1.5, seed = 1, color = C8.slate, rows = 3 } = {}) {
  const r = R(seed), parts = [rb(w, h, 0.5, 0.06, 0, h / 2, 0, color), rb(w + 0.2, 0.16, 0.66, 0.05, 0, h + 0.05, 0, C8.stoneBlue)];
  for (let row = 0; row < rows; row++) { let x = -w / 2 + 0.25; const y = h * 0.82 - row * (h * 0.24); while (x < w / 2 - 0.3) { const n = 1 + Math.floor(r() * 5); for (let i = 0; i < n; i++) parts.push(setOutline(setGlow(bx(0.03, 0.2 + r() * 0.04, 0.02, x + i * 0.07, y, 0.26, C8.chalk, 0, 0, (r() - 0.5) * 12), 0.35), 0)); if (n === 5) parts.push(setOutline(setGlow(bx(0.03, 0.4, 0.02, x + 0.14, y, 0.265, C8.chalk, 0, 0, 62), 0.35), 0)); x += n * 0.07 + 0.16 + r() * 0.2; } }
  return merge(parts);
}

// ------------------------------------------------------------------------------------ the lamp-house

/** A wall that is part of a cylinder, seen from inside: from angle a0 to a1 (degrees, 0 = straight back at -Z, + = toward +X). */
export function arcWall({ r = 6, h = 5, y = 0, a0 = -100, a1 = 100, seg = 16, color = C8.stoneBlue, t = 0 } = {}) {
  const pos = [], idx = [];
  for (let i = 0; i <= seg; i++) { const a = (a0 + (a1 - a0) * (i / seg)) * DEG; pos.push(Math.sin(a) * r, y, -Math.cos(a) * r, Math.sin(a) * (r + t), y + h, -Math.cos(a) * (r + t)); }
  for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 2, a + 3, a, a + 3, a + 1); }
  return tint(fromArrays(pos, idx, null, 180), color);
}

/** Tall panes between brass mullions round an arc (the lamp room's glazing): the panes are left open (the sky shows through); returns the brasswork. */
export function glazing({ r = 6, y = 1.1, h = 3.6, a0 = -90, a1 = 90, n = 9, color = C8.brass, dark = C8.brassDark, bars = 2 } = {}) {
  const parts = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n), s = Math.sin(a * DEG), c = Math.cos(a * DEG); parts.push(tint(place(box(0.16, h, 0.16), s * r, y + h / 2, -c * r, 0, -a, 0), color)); }
  const ring = (yy, rad, col) => { const pts = []; for (let i = 0; i <= n * 2; i++) { const a = (a0 + (a1 - a0) * (i / (n * 2))) * DEG; pts.push([Math.sin(a) * r, yy, -Math.cos(a) * r]); } return tint(tube(pts, rad, 5, { crease: 180 }), col); };
  parts.push(ring(y + 0.02, 0.1, color), ring(y + h, 0.12, color));
  for (let b = 1; b <= bars; b++) parts.push(ring(y + (h * b) / (bars + 1), 0.045, dark));
  return merge(parts);
}

/** Steps climbing round the inside of a round wall from angle a0 to a1; a brass rail on the open side. anchors: top, foot */
export function arcStair({ r = 5.4, a0 = 60, a1 = 100, n = 8, rise = 0.24, w = 1.1, y = 0, color = C8.marble2, rail = C8.brass } = {}) {
  const parts = [], pts = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (a1 - a0) * ((i + 0.5) / n), s = Math.sin(a * DEG), c = Math.cos(a * DEG), rr = r - w / 2, yy = y + (i + 1) * rise;
    parts.push(tint(place(box(w, yy - y, (Math.abs(a1 - a0) * DEG * r) / n + 0.04), s * rr, y + (yy - y) / 2, -c * rr, 0, -a, 0), i % 2 ? color : C8.marble));
    pts.push([s * (r - w), yy + 0.75, -c * (r - w)]);
    if (i % 2 === 0) parts.push(tint(place(cylinder(0.03, 0.03, 0.75, 5), s * (r - w), yy, -c * (r - w)), rail));
  }
  parts.push(tint(tube(pts, 0.045, 5, { crease: 180 }), rail));
  const top = pts[n - 1], foot = pts[0];
  return keep(merge(parts), { top: [top[0], y + n * rise, top[2]], foot: [foot[0], y, foot[2]] });
}

/** The great lamp's plinth: stepped stone, a brass collar, the cup the flame stands in. anchors: flame, cup (rim height) */
export function lampPlinth({ r = 1.0, h = 1.5, seg = 10 } = {}) {
  const parts = [
    tint(cylinder(r * 1.5, r * 1.42, h * 0.16, seg), C8.marble2), tint(place(cylinder(r * 1.2, r * 1.12, h * 0.16, seg), 0, h * 0.16, 0), C8.marble),
    tint(place(cylinder(r * 0.86, r * 0.7, h * 0.44, seg), 0, h * 0.32, 0), C8.slate),
    tint(place(torus(r * 0.74, r * 0.07, seg, 5), 0, h * 0.76, 0), C8.brass), tint(place(torus(r * 0.88, r * 0.06, seg, 5), 0, h * 0.34, 0), C8.brass),
    tint(place(lathe([[r * 0.5, 0], [r * 0.8, h * 0.1], [r * 0.95, h * 0.24], [r * 0.9, h * 0.25], [r * 0.7, h * 0.14], [0, h * 0.12]], seg), 0, h * 0.76, 0), C8.brass),
  ];
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; parts.push(tint(place(sphere(r * 0.1, 6, 4), Math.cos(a) * r * 0.82, h * 0.6, Math.sin(a) * r * 0.82), C8.brass)); }
  return keep(merge(parts), { flame: [0, h * 0.9, 0], cup: [0, h * 1.01, 0] });
}

/** One of the great rings: a fat brass hoop of radius R lying flat (turn the node), with four knuckles and a lens. */
export function lampRing(Rr = 1.6, { t = 0.07, lens = true } = {}) {
  const parts = [tint(torus(Rr, t, 26, 6), C8.brass)];
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; parts.push(tint(place(sphere(t * 1.9, 6, 4), Math.cos(a) * Rr, 0, Math.sin(a) * Rr), C8.brassDark)); }
  if (lens) parts.push(setGlow(tint(place(ellipsoid(t * 3.2, t * 3.2, t * 1.2, 8, 4), 0, 0, Rr), '#d8f0ff'), 0.9));
  return merge(parts);
}

/** The brass cap: a bell as wide as a cartwheel, hung by a ring (origin: the ring, the cap hangs below). anchors: rim (y of its mouth) */
export function brassCap({ r = 0.85 } = {}) {
  const hgt = r * 0.95, out = lathe([[r * 1.05, 0], [r * 1.06, r * 0.07], [r * 0.95, r * 0.12], [r * 0.9, r * 0.36], [r * 0.62, r * 0.68], [r * 0.24, r * 0.86], [r * 0.12, r * 0.95], [0, r * 0.95]], 14, { crease: 50 });
  const inside = tint(flip(place(lathe([[r * 0.98, 0.02], [r * 0.84, r * 0.34], [r * 0.56, r * 0.62], [0, r * 0.8]], 14, { crease: 180 }), 0, 0, 0)), C8.brassDark);
  const m = merge(place(gradientY(out, C8.brassDark, C8.brass), 0, -hgt - 0.12, 0), place(inside, 0, -hgt - 0.12, 0), tint(place(torus(0.09, 0.028, 8, 5), 0, -0.07, 0, 90, 0, 0), C8.brass), tint(place(torus(r * 0.93, r * 0.035, 14, 5), 0, -hgt - 0.12 + r * 0.3, 0), '#fff0a8'));
  return keep(m, { rim: [0, -hgt - 0.12, 0] });
}

/** A chain hanging from the origin, `len` long: fat alternating links. */
export function chain(len = 2, { link = 0.17, color = C8.brassDark } = {}) {
  const parts = [], n = Math.max(1, Math.round(len / link));
  for (let i = 0; i < n; i++) parts.push(place(torus(link * 0.36, link * 0.11, 6, 4), 0, -(i + 0.5) * (len / n), 0, 90, i % 2 ? 90 : 0, 0));
  return tint(merge(parts), color);
}

/** A two-handed winch: timber cheeks, a rope drum (axis along X), a crank each side. anchors: drum (where the chain leaves), handleL, handleR */
export function winch({ w = 1.1, h = 1.0, color = C8.woodRed, metal = C8.brass } = {}) {
  const cheek = () => extrude([[-0.42, 0], [0.42, 0], [0.16, h], [-0.16, h]], 0.09, { bevel: 0.015 });
  const parts = [tint(place(cheek(), -w / 2, 0, 0, 0, 90, 0), color), tint(place(cheek(), w / 2, 0, 0, 0, 90, 0), color), bx(w + 0.3, 0.1, 0.9, 0, 0.05, 0, C8.woodDark)];
  parts.push(cyl(0.2, 0.2, w - 0.12, 10, -w / 2 + 0.06, h * 0.78, 0, metal, 0, 0, -90), cyl(0.045, 0.045, w + 0.5, 6, -w / 2 - 0.25, h * 0.78, 0, C8.brassDark, 0, 0, -90));
  for (const sx of [-1, 1]) parts.push(tint(tube([[sx * (w / 2 + 0.22), h * 0.78, 0], [sx * (w / 2 + 0.24), h * 0.78 + 0.26 * sx, 0.2], [sx * (w / 2 + 0.44), h * 0.78 + 0.27 * sx, 0.21]], 0.04, 5), C8.brassDark), tint(place(sphere(0.07, 6, 4), sx * (w / 2 + 0.44), h * 0.78 + 0.27 * sx, 0.21), C8.oxblood));
  return keep(merge(parts), { drum: [0, h * 0.78 + 0.2, 0], handleL: [-(w / 2 + 0.44), h * 0.78 - 0.27, 0.21], handleR: [w / 2 + 0.44, h * 0.78 + 0.27, 0.21] });
}

/** The hopper that feeds the lamp: a brass funnel on three legs with a chute. anchors: mouth */
export function hopper({ s = 1 } = {}) {
  const parts = [tint(place(lathe([[0.1, 0], [0.12, 0.25], [0.52, 0.8], [0.56, 0.86], [0.5, 0.86], [0.1, 0.3]], 10), 0, 0.75, 0), C8.brass), tint(place(torus(0.55, 0.035, 10, 4), 0, 1.6, 0), C8.brassDark)];
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + 0.5; parts.push(tint(tube([[Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5], [Math.cos(a) * 0.34, 0.8, Math.sin(a) * 0.34], [Math.cos(a) * 0.4, 1.3, Math.sin(a) * 0.4]], 0.04, 5), C8.brassDark)); }
  parts.push(tint(tube([[0, 0.8, 0], [0.3, 0.62, 0], [0.75, 0.5, 0]], 0.09, 6), C8.brass));
  return keep(scaleMesh(merge(parts), s), { mouth: [0, 1.62 * s, 0], spout: [0.75 * s, 0.5 * s, 0] });
}

/** A fuel bin with a heap in it ('ash' grey-violet, 'salt' white). */
export function bin({ w = 0.9, h = 0.6, d = 0.7, heap = 'ash', color = C8.woodRed } = {}) {
  const col = heap === 'ash' ? '#b8b0e8' : '#fff8ee';
  return merge(rb(w, h, d, 0.04, 0, h / 2, 0, color), bx(w + 0.06, 0.07, d + 0.06, 0, h * 0.82, 0, C8.woodDark), bx(w + 0.06, 0.07, d + 0.06, 0, h * 0.2, 0, C8.woodDark), tint(place(ellipsoid(w * 0.42, h * 0.34, d * 0.4, 8, 5), 0, h * 0.98, 0), col));
}

/** A coal shovel lying along +Z from the origin (blade at the far end). */
export function shovel() { return merge(tint(tube([[0, 0.03, 0], [0, 0.05, 0.5], [0, 0.03, 0.85]], 0.028, 5), C8.wood), rb(0.26, 0.04, 0.32, 0.02, 0, 0.03, 1.0, '#8f97c8'), rb(0.2, 0.05, 0.06, 0.02, 0, 0.03, -0.02, C8.woodDark)); }

// ------------------------------------------------------------------------------------ the Assembly and the Bench

/** Seat positions on a horseshoe open toward +Z: rows of seats on arcs of growing radius. Returns [{ pos, face, row, i }], inner row first, left to right. */
export function horseshoe({ rows = [14, 26], r0 = 5.2, step = 1.25, rise = 0.42, a0 = -118, a1 = 118, cz = 0 } = {}) {
  const out = [];
  rows.forEach((n, row) => { const r = r0 + row * step; for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * (i / (n - 1)); out.push({ pos: [Math.sin(a * DEG) * r, (row + 1) * rise, cz - Math.cos(a * DEG) * r], face: -a, row, i, a }); } });
  return out;
}

/** One tier of the horseshoe: a curved step from radius r to r + step, `h` high, between angles a0 and a1. */
export function tierArc({ r = 5, step = 1.25, h = 0.42, y = 0, a0 = -124, a1 = 124, seg = 18, color = C8.marble, riser = C8.marble2 } = {}) {
  const pos = [], idx = [], colr = [], ct = rgb(color), cr = rgb(riser);
  for (let i = 0; i <= seg; i++) { const a = (a0 + (a1 - a0) * (i / seg)) * DEG, s = Math.sin(a), c = -Math.cos(a); pos.push(s * (r - 0.02), y, c * (r - 0.02), s * r, y + h, c * r, s * r, y + h, c * r, s * (r + step), y + h, c * (r + step)); colr.push(cr, cr, ct, ct); }
  for (let i = 0; i < seg; i++) { const a = i * 4, b = a + 4; idx.push(a, a + 1, b + 1, a, b + 1, b, a + 2, a + 3, b + 3, a + 2, b + 3, b + 2); }
  const m = fromArrays(pos, idx, null, 40);
  if (m.colors.length === colr.length * 3) for (let i = 0; i < colr.length; i++) { m.colors[i * 3] = colr[i][0]; m.colors[i * 3 + 1] = colr[i][1]; m.colors[i * 3 + 2] = colr[i][2]; } else tint(m, color);
  return m;
}

/** A delegate's seat for instancing: a high rounded back, a seat, a little desk in front. White: tint per instance. Faces +Z. */
export function seat() {
  return merge(rb(0.74, 1.15, 0.14, 0.07, 0, 0.58, -0.3, '#ffffff'), rb(0.7, 0.36, 0.5, 0.05, 0, 0.18, 0, '#f2f2f2'), rb(0.8, 0.5, 0.2, 0.04, 0, 0.3, 0.48, '#e2e2e2'), bx(0.84, 0.05, 0.3, 0, 0.56, 0.48, '#ffffff'), tint(place(sphere(0.07, 6, 4), 0, 1.2, -0.3), '#ffe9a0'));
}

/** Grey cloth thrown over a seat (instanced on the draped seats): it hangs to the floor and still shows the folds. */
export function drape() {
  const m = deform(roundedBox(0.92, 1.3, 1.02, 0.16, 2), (p) => { const t = (0.65 - p[1]) / 1.3; p[0] *= 1 + 0.16 * t + 0.03 * Math.sin(p[2] * 9); p[2] *= 1 + 0.12 * t; if (p[1] > 0.3 && p[2] > 0) p[1] -= p[2] * 0.75; }, 60);
  place(m, 0, 0.65, 0.08);
  return merge(gradientY(m, C8.greyDark, C8.grey), bx(0.02, 0.9, 0.7, 0.2, 0.55, 0.2, C8.greyDark, 0, 0, 4), bx(0.02, 0.8, 0.6, -0.24, 0.5, 0.22, C8.greyDark, 0, 0, -5));
}

/** The dome from inside: a ribbed shell rising from a ring of radius r at y = 0 to an open eye of radius `eye`. anchors: eye */
export function domeInside({ r = 9, h = 6, eye = 1.6, seg = 20, ribs = 10, color = C8.marbleCool, rib = C8.brass, low = false } = {}) {
  const prof = []; const n = low ? 5 : 7;
  for (let i = 0; i <= n; i++) { const t = i / n, a = t * Math.acos(eye / r); prof.push([r * Math.cos(a), h * Math.sin(a) / Math.sin(Math.acos(eye / r))]); }
  const parts = [gradientY(flip(lathe(prof, seg, { crease: 180 })), color, '#fff8ee'), tint(place(torus(eye + 0.12, 0.2, 14, 5), 0, h, 0), rib)];
  for (let i = 0; i < ribs; i++) { const a = (i / ribs) * Math.PI * 2 + 0.2; parts.push(tint(tube(prof.map((p) => [Math.sin(a) * (p[0] - 0.08), p[1] - 0.04, -Math.cos(a) * (p[0] - 0.08)]), 0.09, 4, { crease: 180 }), rib)); }
  return keep(merge(parts), { eye: [0, h, 0] });
}

/** A plain fat column with a brass collar, standing on y = 0. */
export function column8({ h = 5, r = 0.32, color = C8.marble, band = C8.brass, seg = 8 } = {}) {
  return merge(cyl(r * 1.45, r * 1.3, h * 0.05, seg, 0, 0, 0, C8.marble2), cyl(r * 1.08, r * 0.92, h * 0.86, seg, 0, h * 0.05, 0, color), tint(place(torus(r * 1.0, r * 0.14, seg, 4), 0, h * 0.86, 0), band), cyl(r * 0.95, r * 1.5, h * 0.09, seg, 0, h * 0.91, 0, C8.marble2));
}

/** The Settlement on its stand: a parchment roll with seals and a ribbon, lying open along X on y = 0. */
export function treaty({ w = 0.9 } = {}) {
  return merge(rb(w, 0.03, 0.55, 0.01, 0, 0.02, 0, C8.parchment), cyl(0.05, 0.05, 0.6, 6, -w / 2, 0.05, -0.3, '#ffe6b0', 90, 0, 0), cyl(0.05, 0.05, 0.6, 6, w / 2, 0.05, -0.3, '#ffe6b0', 90, 0, 0),
    ...[0, 1, 2, 3].map((i) => bx(w * 0.7, 0.012, 0.03, 0, 0.04, -0.18 + i * 0.1, '#8f97c8')), cyl(0.07, 0.07, 0.03, 8, w * 0.28, 0.04, 0.2, C8.oxblood), bx(0.05, 0.012, 0.3, w * 0.28, 0.035, 0.3, C8.wine));
}

/** A lectern table: a fat turned leg, a sloped top, a brass rail. `top` is the y of the surface. anchors: top, pen */
export function lectern({ w = 1.5, d = 0.9, h = 0.95, color = C8.woodRed, cloth = C8.royal } = {}) {
  const parts = [tint(lathe([[0.42, 0], [0.44, 0.06], [0.16, 0.14], [0.13, h * 0.5], [0.2, h * 0.62], [0.12, h * 0.8], [0.3, h - 0.06], [0, h - 0.06]], 8), color), rb(w, 0.09, d, 0.03, 0, h - 0.02, 0, color), rb(w - 0.1, 0.03, d - 0.1, 0.01, 0, h + 0.035, 0, cloth)];
  parts.push(rb(w + 0.06, 0.24, 0.03, 0.01, 0, h - 0.16, d / 2, cloth), bx(w + 0.08, 0.035, 0.04, 0, h - 0.28, d / 2, C8.brass));
  parts.push(place(treaty({ w: w * 0.6 }), -0.08, h + 0.05, 0), cyl(0.07, 0.06, 0.09, 6, w * 0.38, h + 0.05, -0.15, C8.navy), tint(tube([[w * 0.38, h + 0.1, -0.15], [w * 0.42, h + 0.3, -0.2], [w * 0.5, h + 0.52, -0.3]], (t) => 0.012 + 0.03 * Math.sin(t * 3.1), 5, { squash: 0.3 }), '#ffffff'));
  return keep(merge(parts), { top: [0, h + 0.05, 0], pen: [w * 0.5, h + 0.5, -0.3] });
}

/** The Full Bench: one long high desk in three bays, panelled, on turned ends. Faces +Z, stands on y = 0. anchors: seats[3] (where each magistrate sits, y = seat height), top */
export function highBench({ w = 6.4, h = 1.7, d = 0.9, color = C8.woodRed, panel = C8.oxblood, trim = C8.brass, seed = 1 } = {}) {
  const r = R(seed), parts = [rb(w, h, d, 0.05, 0, h / 2, 0, color), rb(w + 0.3, 0.14, d + 0.26, 0.04, 0, h + 0.05, 0.04, C8.woodDark), bx(w + 0.16, 0.16, d + 0.1, 0, 0.08, 0, C8.woodDark)];
  const bw = w / 3;
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * bw;
    parts.push(rb(bw - 0.4, h * 0.56, 0.06, 0.05, x, h * 0.52, d / 2 + 0.02, panel, 0, 0, (r() - 0.5) * 1.6), rb(bw - 0.9, h * 0.3, 0.05, 0.04, x, h * 0.52, d / 2 + 0.05, '#d84a62'));
    parts.push(tint(place(sphere(0.07, 6, 4), x, h * 0.86, d / 2 + 0.05), trim));
    parts.push(rb(0.5, 0.05, 0.36, 0.01, x - 0.25, h + 0.14, 0.1, C8.parchment, 0, (r() - 0.5) * 30, 0));
  }
  for (const x of [-bw / 2, bw / 2]) parts.push(cyl(0.09, 0.09, h * 0.9, 6, x, 0.1, d / 2 + 0.03, trim));
  parts.push(tint(place(lathe([[0.1, 0], [0.12, 0.03], [0.03, 0.06], [0.03, 0.2], [0.09, 0.24], [0, 0.26]], 6), bw * 0.2, h + 0.12, 0.2), trim)); // the gavel block and a bell
  return keep(wonk(merge(parts), { lean: 0.006, crease: 40 }), { seats: [[-bw, h - 0.55, -d / 2 - 0.45], [0, h - 0.55, -d / 2 - 0.45], [bw, h - 0.55, -d / 2 - 0.45]], top: [0, h + 0.12, 0] });
}

/** A magistrate, seen from the chest up behind the bench: a robe, a round head, a long wig, spectacles on one of them. Origin: the seat. */
export function magistrate({ robe = C8.oxblood, skin = '#ffd9b4', wig = '#fff6ea', s = 1, fat = 1, seed = 1, specs = false } = {}) {
  const r = R(seed), parts = [
    tint(lathe([[0.34 * fat, 0], [0.4 * fat, 0.12], [0.34 * fat, 0.5], [0.2, 0.72], [0, 0.76]], 9, { crease: 180 }), robe),
    tint(place(ellipsoid(0.3 * fat, 0.1, 0.22, 8, 4), 0, 0.68, 0.03), '#fff6ea'),
    tint(place(sphere(0.25, 10, 7), 0, 0.98, 0.02), skin),
    tint(place(blob({ rx: 0.3, ry: 0.27, rz: 0.27, lumps: 0.35, seed: seed + 3, seg: 10, rings: 6 }), 0, 1.06, -0.06), wig),
  ];
  for (const sx of [-1, 1]) { for (let i = 0; i < 3; i++) parts.push(tint(place(sphere(0.085 - i * 0.008, 6, 4), sx * (0.25 + i * 0.012), 0.92 - i * 0.12, 0.02), wig)); parts.push(tint(place(sphere(0.03, 5, 3), sx * 0.09, 1.0, 0.25), '#2a2f55')); }
  parts.push(tint(place(ellipsoid(0.1, 0.02, 0.03, 6, 3), 0, 1.08, 0.24, 0, 0, (r() - 0.5) * 16), '#d8d2e8'));
  if (specs) parts.push(tint(place(torus(0.045, 0.01, 8, 3), -0.09, 1.0, 0.255, 90, 0, 0), C8.brassDark), tint(place(torus(0.045, 0.01, 8, 3), 0.09, 1.0, 0.255, 90, 0, 0), C8.brassDark));
  for (const sx of [-1, 1]) parts.push(tint(place(ellipsoid(0.11, 0.09, 0.2, 6, 4), sx * 0.3 * fat, 0.52, 0.3), robe), tint(place(sphere(0.07, 6, 4), sx * 0.26 * fat, 0.53, 0.5), skin));
  return scaleMesh(merge(parts), s);
}

/** The dock: a railed box a prisoner stands in, open at the back. Its floor is `step` above the ground; faces +Z. anchors: stand */
export function dock({ w = 1.9, d = 1.2, step = 0.14, h = 0.78, color = C8.woodRed, rail = C8.brass } = {}) {
  const parts = [rb(w, step, d, 0.03, 0, step / 2, 0, C8.woodDark), rb(w, h, 0.09, 0.03, 0, step + h / 2, d / 2 - 0.05, color), rb(0.09, h, d, 0.03, -w / 2 + 0.05, step + h / 2, 0, color), rb(0.09, h, d, 0.03, w / 2 - 0.05, step + h / 2, 0, color)];
  parts.push(rb(w + 0.14, 0.09, 0.2, 0.04, 0, step + h + 0.03, d / 2 - 0.05, rail), rb(w - 0.5, h * 0.5, 0.04, 0.03, 0, step + h * 0.5, d / 2 + 0.01, C8.oxblood));
  for (const sx of [-1, 1]) parts.push(tint(place(sphere(0.1, 6, 4), sx * (w / 2 - 0.05), step + h + 0.14, d / 2 - 0.05), rail));
  return keep(merge(parts), { stand: [0, step, -0.1] });
}

/**
 * A tall round-headed window of glowing panes in a stone surround, facing +Z, sill at y = 0: `cols` lights wide, coloured
 * panes in the head. The glass is drawn bright (it is the room's key light); the opening is not cut. anchors: centre, head
 */
export function greatWindow({ w = 3.2, h = 5.2, cols = 3, glass = '#fff3c8', head = ['#7fe6d2', '#ffd65a', '#ff8fb4'], frame = C8.marble2, bars = C8.slateDark, glow = 1 } = {}) {
  const arc = (rad, y0, n = 10) => { const o = [[rad, 0]]; for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI; o.push([Math.cos(a) * rad, y0 + Math.sin(a) * rad]); } o.push([-rad, 0]); return o; };
  const y0 = h - w / 2, parts = [tint(extrude(arc(w / 2 + 0.22, y0), 0.3, { bevel: 0.04 }), frame)];
  parts.push(setOutline(setGlow(tint(place(extrude(arc(w / 2, y0), 0.1), 0, 0.08, 0.12), glass), glow), 0));
  const fan = head.length;
  for (let i = 0; i < fan; i++) { const a0 = (i / fan) * Math.PI, a1 = ((i + 1) / fan) * Math.PI, rr = w / 2 - 0.08, pts = [[0, 0]]; for (let k = 0; k <= 4; k++) { const a = a0 + (a1 - a0) * (k / 4); pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); } parts.push(setOutline(setGlow(tint(place(extrude(pts, 0.04), 0, y0 + 0.05, 0.2), head[i]), glow * 0.95), 0)); }
  for (let i = 1; i < cols; i++) parts.push(bx(0.09, y0 + 0.1, 0.1, -w / 2 + (w * i) / cols, y0 / 2 + 0.05, 0.22, bars));
  for (const y of [y0 * 0.36, y0 * 0.7, y0 + 0.02]) parts.push(bx(w, 0.08, 0.1, 0, y, 0.22, bars));
  for (let i = 1; i < fan; i++) { const a = (i / fan) * Math.PI; parts.push(bx(0.07, w / 2 - 0.05, 0.1, Math.cos(a) * w / 4, y0 + Math.sin(a) * w / 4, 0.24, bars, 0, 0, a / DEG - 90)); }
  parts.push(rb(w + 0.8, 0.2, 0.5, 0.05, 0, -0.08, 0.12, frame));
  return keep(merge(parts), { centre: [0, h * 0.5, 0.2], head: [0, y0, 0.2] });
}

/** A long cloth banner hanging from a rod (origin: the rod's middle), swallow-tailed, with a device ('scales' | 'flame' | 'ring'). */
export function bannerDrop({ w = 1.0, h = 3.0, color = C8.oxblood, trim = C8.brass, device = 'scales', patch = false } = {}) {
  const parts = [cyl(0.035, 0.035, w + 0.3, 6, -w / 2 - 0.15, 0, 0, trim, 0, 0, -90), tint(place(extrude([[-w / 2, 0], [w / 2, 0], [w / 2, -h], [0, -h + w * 0.4], [-w / 2, -h]], 0.035), 0, -0.02, 0), color), bx(w, 0.1, 0.045, 0, -0.16, 0, trim)];
  const y = -h * 0.42;
  if (device === 'scales') parts.push(bx(0.05, 0.6, 0.05, 0, y, 0.02, trim), bx(0.56, 0.05, 0.05, 0, y + 0.28, 0.02, trim), tint(place(cylinder(0.13, 0.05, 0.06, 8), -0.26, y + 0.02, 0.02), trim), tint(place(cylinder(0.13, 0.05, 0.06, 8), 0.26, y + 0.08, 0.02), trim));
  else if (device === 'flame') parts.push(tint(place(lathe([[0, 0], [0.16, 0.08], [0.2, 0.22], [0.1, 0.44], [0, 0.6]], 6), 0, y - 0.25, 0.02, 0, 0, 0, 1, 1, 0.2), '#fff6e0'));
  else parts.push(tint(place(torus(0.22, 0.045, 12, 4), 0, y, 0.02, 90, 0, 0), trim));
  if (patch) parts.push(rb(0.28, 0.24, 0.02, 0.01, w * 0.2, -h * 0.72, 0.025, '#e8a0b0', 0, 0, 9));
  return merge(parts);
}

/** A chequered floor centred on the origin, top at y = 0: two flat layers (the second lies a hair above), no outline. */
export function chequer({ w = 16, d = 12, n = 10, m = 8, colors = ['#fff0d8', '#f4b8a0'] } = {}) {
  const parts = [tint(plane(w, d, 1, 1), colors[0])], cw = w / n, cd = d / m;
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) if ((i + j) % 2) parts.push(tint(place(plane(cw, cd, 1, 1), -w / 2 + (i + 0.5) * cw, 0.004, -d / 2 + (j + 0.5) * cd), colors[1]));
  return setOutline(merge(parts), 0);
}

/** A tin bucket (under the leak in a poor court's roof). */
export function bucket({ s = 1 } = {}) { return scaleMesh(merge(tint(lathe([[0.13, 0], [0.19, 0.3], [0.2, 0.3], [0.17, 0.26], [0, 0.24]], 8), '#aeb6e6'), tint(place(torus(0.19, 0.012, 8, 3), 0, 0.33, 0, 0, 0, 25), '#7f88c0')), s); }

// ------------------------------------------------------------------------------------ Carrow

/**
 * Carrow's lamp-house: a squat round tower of rough stone, a slate cap, a small glazed lamp on top, a doorway (dark inside;
 * the set stands a lamp in it). Door toward +Z. Origin: centre of the foot. anchors: door (threshold), doorLamp, lamp, top
 */
export function lampHouse({ r = 1.5, h = 3.2, seed = 1, stone = '#e9e2f4', stone2 = '#cfc8ea', roof = C8.slate } = {}) {
  const rr = R(seed), seg = 12, parts = [tint(lathe([[r * 1.12, 0], [r * 1.08, h * 0.1], [r * 0.98, h * 0.5], [r * 0.9, h], [0, h]], seg, { crease: 50 }), stone)];
  for (let i = 0; i < 26; i++) { const a = rr() * Math.PI * 2, y = 0.15 + rr() * (h - 0.5), rad = r * (1.1 - 0.2 * (y / h)); if (Math.abs(Math.sin(a)) < 0.42 && Math.cos(a) > 0 && y < h * 0.66) continue; parts.push(tint(place(roundedBox(0.34 + rr() * 0.2, 0.2 + rr() * 0.1, 0.12, 0.04, 1), Math.sin(a) * rad, y, Math.cos(a) * rad, 0, a / DEG, (rr() - 0.5) * 8), rr() < 0.5 ? stone2 : '#fff6ee')); }
  parts.push(tint(place(lathe([[r * 1.14, 0], [r * 1.16, 0.08], [r * 0.5, h * 0.3], [r * 0.34, h * 0.34], [r * 0.34, h * 0.36]], seg), 0, h, 0), roof));
  const ly = h * 1.36;
  parts.push(cyl(r * 0.36, r * 0.3, 0.14, 8, 0, ly, 0, C8.brassDark), setGlow(tint(place(cylinder(r * 0.26, r * 0.26, h * 0.16, 8, { caps: false }), 0, ly + 0.14, 0), '#ffe6a0'), 1), tint(place(lathe([[r * 0.38, 0], [r * 0.3, 0.1], [0.05, h * 0.12], [0, h * 0.2]], 8), 0, ly + 0.14 + h * 0.16, 0), C8.brass));
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; parts.push(bx(0.05, h * 0.16, 0.05, Math.cos(a) * r * 0.27, ly + 0.14 + h * 0.08, Math.sin(a) * r * 0.27, C8.brassDark)); }
  // the doorway: a dark mouth in a stone arch, a plank door standing open
  const dz = r * 1.04;
  parts.push(tint(place(roundedBox(1.0, 1.75, 0.3, 0.44, 2), 0, 0.82, dz - 0.04), '#3a2f7a'), tint(place(roundedBox(1.3, 2.0, 0.24, 0.56, 2), 0, 0.86, dz - 0.14), '#fff6ee'), rb(1.5, 0.12, 0.5, 0.04, 0, 0.05, dz + 0.1, stone2));
  parts.push(rb(0.82, 1.6, 0.08, 0.05, 0.86, 0.84, dz + 0.3, C8.teal, 0, 68, 0), bx(0.6, 0.06, 0.1, 0.86, 1.2, dz + 0.32, C8.brassDark, 0, 68, 0), bx(0.6, 0.06, 0.1, 0.86, 0.45, dz + 0.32, C8.brassDark, 0, 68, 0));
  return keep(wonk(merge(parts), { lean: 0.025, bulge: -0.02, crease: 50 }), { door: [0, 0, dz + 0.5], doorLamp: [-0.1, 1.0, dz - 0.02], lamp: [0, ly + 0.14 + h * 0.08, 0], top: [0, ly + h * 0.5, 0] });
}

/** A kelp rack: two crooked A-frames and a rail (along X), hung with ribbons of kelp. */
export function kelpRack({ w = 2.4, h = 1.5, seed = 1, n = 9, wood = C8.wood } = {}) {
  const r = R(seed), parts = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(tint(tube([[sx * w / 2 + sx * 0.05, 0, sz * 0.4], [sx * w / 2, h, 0]], 0.045, 5), sz > 0 ? wood : C8.woodDark));
  parts.push(tint(tube([[-w / 2 - 0.2, h + 0.02, 0], [0, h - 0.05, 0], [w / 2 + 0.2, h + 0.03, 0]], 0.04, 5), wood));
  for (let i = 0; i < n; i++) { const x = -w / 2 + 0.15 + ((w - 0.3) * i) / (n - 1) + (r() - 0.5) * 0.08, len = h * (0.45 + r() * 0.4), sw = (r() - 0.5) * 0.2; parts.push(tint(tube([[x, h + 0.04, 0.03], [x + sw * 0.4, h - len * 0.5, 0.06], [x + sw, h - len, 0.02]], (t) => 0.075 - 0.03 * t, 4, { squash: 0.3 }), [C8.kelpGreen, C8.kelpDark, '#7ac46a', '#a56ad8'][Math.floor(r() * 4)])); }
  return merge(parts);
}

/** A goat: a barrel of a body on four pegs, a beard, two horns. About 0.62 to the shoulder, facing +Z. */
export function goat({ seed = 1, coat = '#fff6ea', patch = '#c8a078', s = 1, graze = false } = {}) {
  const r = R(seed), parts = [tint(place(blob({ rx: 0.2, ry: 0.19, rz: 0.34, lumps: 0.2, seed, seg: 9, rings: 6 }), 0, 0.46, 0), coat), tint(place(ellipsoid(0.13, 0.12, 0.16, 7, 4), 0.06, 0.52, -0.12), patch)];
  for (const [x, z] of [[-0.11, 0.2], [0.11, 0.22], [-0.11, -0.2], [0.11, -0.22]]) parts.push(cyl(0.035, 0.045, 0.34, 5, x, 0, z, '#5a4a6a'));
  const hy = graze ? 0.3 : 0.74, hz = graze ? 0.5 : 0.4, tilt = graze ? 50 : 8;
  parts.push(tint(tube([[0, 0.5, 0.26], [0, (0.5 + hy) / 2 + 0.03, 0.36], [0, hy, hz]], 0.085, 6), coat));
  parts.push(tint(place(ellipsoid(0.1, 0.1, 0.16, 8, 5), 0, hy, hz + 0.05, tilt, 0, 0), coat), tint(place(ellipsoid(0.06, 0.05, 0.06, 6, 3), 0, hy - 0.04 - (graze ? 0.08 : 0), hz + 0.18 - (graze ? 0.06 : 0)), '#ffc8c0'));
  parts.push(tint(place(lathe([[0.035, 0], [0.012, 0.12], [0, 0.14]], 4), 0, hy - 0.2, hz + 0.08, 180 - tilt * 0.4, 0, 0), '#e8dccf'));
  for (const sx of [-1, 1]) parts.push(tint(tube([[sx * 0.05, hy + 0.07, hz - 0.02], [sx * 0.08, hy + 0.2, hz - 0.1], [sx * 0.12, hy + 0.24, hz - 0.2]], (t) => 0.03 - 0.022 * t, 4), '#8a7a9a'), tint(place(ellipsoid(0.07, 0.025, 0.04, 5, 3), sx * 0.13, hy + 0.02, hz - 0.02, 0, 0, sx * -20), patch), tint(place(sphere(0.022, 4, 3), sx * 0.07, hy + 0.03, hz + 0.12), '#2a2f55'));
  parts.push(tint(place(ellipsoid(0.04, 0.05, 0.07, 5, 3), 0, 0.56 + r() * 0.03, -0.36, -30, 0, 0), coat));
  return scaleMesh(merge(parts), s);
}

/** One beach pebble for instancing (white: tint per instance). */
export function pebble() { return setOutline(cylinder(1, 0.72, 0.3, 6), 0); }

/**
 * Carrow's beach: shingle falling gently from a grassy back (z = +front, y = 0 from there back to the stage) down to the
 * tide (z = -reach, y = -drop), `w` wide, the tide line wavering. Top at y = 0 across the stage strip.
 */
export function beach({ w = 44, front = 6, reach = 9, drop = 0.9, seg = 22, seed = 1, sand = '#f4e6cc', wet = '#cdb6c8' } = {}) {
  const rows = 8, pos = [], idx = [], C = [], cs = rgb(sand), cw = rgb(wet);
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= seg; i++) {
    const u = i / seg, v = j / rows, x = (u - 0.5) * w, edge = reach + Math.sin(u * 9 + seed) * 0.5 + Math.sin(u * 23 + seed * 3) * 0.2 + Math.abs(u - 0.5) * 2;
    const z = front - v * (front + edge), t = Math.max(0, (-z - 2.2) / (edge - 2.2)), y = -drop * t * t * (3 - 2 * t) - (v === 1 ? 0.5 : 0);
    pos.push(x, y, z); const k = Math.max(0, Math.min(1, (t - 0.55) * 2.6)); C.push([cs[0] + (cw[0] - cs[0]) * k, cs[1] + (cw[1] - cs[1]) * k, cs[2] + (cw[2] - cs[2]) * k]);
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + seg + 1; idx.push(a, a + 1, b + 1, a, b + 1, b); }
  const m = fromArrays(pos, idx, null, 180);
  for (let i = 0; i < C.length; i++) { m.colors[i * 3] = C[i][0]; m.colors[i * 3 + 1] = C[i][1]; m.colors[i * 3 + 2] = C[i][2]; }
  return m;
}

/** A drystone wall along X, standing on y = 0: lumpy stones in two courses. */
export function drystone({ len = 4, h = 0.6, seed = 1, colors = ['#e9e2f4', '#cfc8ea', '#fff6ee', '#d9cfe0'] } = {}) {
  const r = R(seed), parts = [];
  for (let c = 0; c < 2; c++) { let x = -len / 2; while (x < len / 2) { const w = 0.34 + r() * 0.3; parts.push(tint(place(roundedBox(w, h * (0.46 + r() * 0.14), 0.34 + r() * 0.08, 0.09, 1), x + w / 2, h * (0.25 + c * 0.48), (r() - 0.5) * 0.06, 0, (r() - 0.5) * 14, (r() - 0.5) * 6), colors[Math.floor(r() * colors.length)])); x += w * 0.94; } }
  return merge(parts);
}

/** A plank table with a bowl and a loaf on it (what she put in front of him). anchors: bowl */
export function bowlTable({ w = 0.9, h = 0.5 } = {}) {
  const parts = [rb(w, 0.07, 0.6, 0.02, 0, h, 0, C8.wood, 0, 0, 1.5)];
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(cyl(0.035, 0.045, h, 5, x * (w / 2 - 0.08), 0, z * 0.22, C8.woodDark));
  parts.push(tint(place(lathe([[0.06, 0], [0.15, 0.08], [0.16, 0.1], [0.13, 0.08], [0, 0.05]], 8), -0.16, h + 0.035, 0.02), '#7fd6e6'), tint(place(ellipsoid(0.11, 0.035, 0.11, 8, 3), -0.16, h + 0.105, 0.02), '#ffe6a8'));
  parts.push(tint(place(ellipsoid(0.15, 0.09, 0.1, 8, 4), 0.2, h + 0.12, 0.0, 0, 20, 0), '#e8a860'));
  return keep(merge(parts), { bowl: [-0.16, h + 0.14, 0.02] });
}
