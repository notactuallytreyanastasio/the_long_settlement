// The Kedge kit: builders shared by the six chapter 6 sets (kedge-roads, compact-hall, counting-room,
// cutter-deck, lantern-line, quarter-flame). Same rules as kit.js: pure (runs under node), one options
// object per builder, per-vertex colour, anchors in the builder's own space, chunky and a little crooked.
// It imports kit.js and the engine's pure modules only; nothing here needs kit-b.js.
//
// Outdoors
//   cask(opts)              a stillsalt cask: pale staves, teal hoops, a brand roundel
//   gantry(opts)            a Kedge harbour crane: splayed legs, a cab with a lit window, a long jib; anchors: lamp, tip, top
//   hulk(opts)              a cargo hull at anchor, riding high and empty: boot-topping showing, deckhouse, riding light; anchors: lamp
//   mole(opts)              a long stone breakwater along X
//   lampHouse(opts)         Kedge's lamp-house from outside: a fat stone drum, an open lamp room, a copper hood; anchors: lamp, top
//   warehouse(opts)         a gabled dock warehouse, loading door and hoist toward +Z; anchors: door, windows, hoist, ridge
//   cutterHull(opts)        the Audit cutter seen from outside: black hull, white strake, one mast, search lamp; anchors: lamp
//   openBoat(opts)          an eight-oared open boat with rowers and a cargo of casks (the oars are separate: oar())
// Timber rooms
//   plankWall(opts)         a boarded wall with square openings cut in it, posts between; anchors: openings
//   truss(opts)             a roof frame: tie-beam, king post, rafters, braces
//   shaft(opts)             additive cards of light slanting from an opening (ch6Materials().shaft)
//   patch(opts)             the opening's light thrown on the floor
//   hurricaneLamp(opts)     a storm lantern on a chain; anchors: lamp
//   ropeJack(opts)          the great wheel at the head of a ropewalk
//   tallyBoard(opts)        a chalk board of tallies in a frame
//   trestle(opts)           a plank table on trestles
//   hank(opts)              a coil of rope hung on a peg
//   shelfBay(opts)          a bay of shelves: 'books' or 'rope'
//   clerkDesk(opts)         a standing desk with a sloped top; anchors: slope, lamp
//   greenLamp(opts)         a brass arm with a green glass shade; anchors: lamp
//   openBook(opts)          a ruled account book lying open
// The cutter's deck
//   mastRig(opts)           mast, boom with the sail furled along it, shrouds and ratlines; anchors: hounds, boomEnd, yard
//   searchLamp(opts)        a drum lamp in a yoke, lens toward +Z; anchors: lens
// The lamp-house
//   ringWall(opts)          a curved wall of stone bays with tall arched openings; anchors: openings
//   greatBowl(opts)         the lamp's bowl on its pedestal, a heap of ash in it; anchors: fire
//   lampHood(opts), engineRings(opts), hopperChute(opts), ashBasket(opts), shovel(opts)
// Shared set plumbing
//   ch6Materials()          kitMaterials() + wall (casts no shadow), shaft, glowFlat
//   shell(spec)             lamps, glows, motes, setPower, update, frame, view: the half of a set that is the same in all six
//   K6                      the Kedge palette

import { m4, quat, rng, DEG, rgb } from '../math.js';
import {
  sphere, ellipsoid, superellipsoid, blob, cylinder, lathe, torus, box, roundedBox, extrude, tube, curve, plane, fromArrays,
  merge, tint, place, deform, setGlow, setOutline, gradientY, scale as scaleMesh,
} from '../mesh.js';
import { material, group } from '../scene.js';
import { PAL, wonk, kitMaterials, setRig, barrel, crate, planks } from './kit.js';

/** Kedge: salt-white stone, tarred timber painted in dockers' colours, brass, and the Compact's coral and teal. */
export const K6 = {
  salt: '#f4f1ff', saltBlue: '#cfe0ff', stone: '#f0e2c4', stone2: '#dcc9a4', stoneCool: '#b9b8ee', stoneDeep: '#8a86d8',
  tar: '#2c3470', tarLit: '#46509a', timber: '#d98a4e', timber2: '#eaa864', timberDark: '#9a5236', timberRed: '#c8643e',
  coral: '#ff6f52', teal: '#2fc4b4', tealDark: '#1e8f9c', yellow: '#ffd24a', cream: '#fff1d0', royal: '#3b62d8', plum: '#7a4fc4', wine: '#c23a5e',
  brass: '#ffc94a', brassDark: '#e0932e', copper: '#46c9a4', copperDark: '#2a9a8e', iron: '#3b4a7a',
  rope: '#f0d08a', rope2: '#dcb46a', chalk: '#f6f8ff', slate: '#38478f', paper: '#fff6dc',
  grey: '#aeb4d0', greyDark: '#7c84ac', audit: '#1d2452', ash: '#a9b89a', ashDark: '#7d8f86',
  quarter: '#b8a4ff', quarterDeep: '#7d6be0', white: '#fffdf0',
  books: ['#f4573f', '#35c9b5', '#ffd24a', '#3f78e0', '#8a6be0', '#ff8fb0', '#86de57', '#ff9a3c', '#fff1d0'],
};

const R = (seed) => rng(Math.floor(seed * 7919) + 61);
const keep = (mesh, anchors) => { mesh.anchors = anchors; return mesh; };
const bx = (w, h, d, x, y, z, c, rx = 0, ry = 0, rz = 0) => tint(place(box(w, h, d), x, y, z, rx, ry, rz), c);
const rb = (w, h, d, rad, x, y, z, c, rx = 0, ry = 0, rz = 0) => tint(place(roundedBox(w, h, d, rad, 1), x, y, z, rx, ry, rz), c);
const cyl = (r0, r1, h, seg, x, y, z, c, rx = 0, ry = 0, rz = 0) => tint(place(cylinder(r0, r1, h, seg), x, y, z, rx, ry, rz), c);
const ball = (r, x, y, z, c, seg = 8) => tint(place(sphere(r, seg, Math.max(4, seg - 2)), x, y, z), c);
/** A straight round bar from a to b. */
export function bar(a, b, r, c, seg = 5) { return tint(tube([a, b], r, seg, { crease: 180 }), c); }
export const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
/** A direction toward a light at compass `az` (0 = straight away from the camera, + = screen right) and elevation `el`, degrees. */
export const dirFrom = (az, el) => [Math.sin(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), -Math.cos(az * DEG) * Math.cos(el * DEG)];
/** Multiply a mesh's colours (keeps dark parts dark). */
export function shade(mesh, color, k = 1) { const c = rgb(color), C = mesh.colors; for (let i = 0; i < C.length; i += 3) { C[i] *= c[0] * k; C[i + 1] *= c[1] * k; C[i + 2] *= c[2] * k; } return mesh; }

export function ch6Materials() {
  return {
    ...kitMaterials(),
    /** walls, roofs, floors of a room: receive shadow, cast none, no rim */
    wall: material({ name: 'ch6-wall', rim: 0, bandEdge: -0.2, outline: { width: 1.9, self: 0.65 }, castShadow: false }),
    /** additive window shafts */
    shaft: material({ kind: 'beam', name: 'ch6-shaft', beam: { power: 0.6, near: 0.32, far: 0.03, steps: 0 }, outline: false }),
    /** hard-edged lamp cones */
    cone: material({ kind: 'beam', name: 'ch6-cone', beam: { power: 1.4, near: 0.4, far: 0, steps: 0 }, outline: false }),
  };
}

// ------------------------------------------------------------------------------------ outdoors

/** A stillsalt cask: pale staves, teal hoops, a coral brand on the head. Stands on y = 0. */
export function cask({ r = 0.3, h = 0.72, hoop = K6.teal, brand = K6.coral, stave = K6.salt } = {}) {
  const body = tint(lathe([[0, 0], [r * 0.8, 0], [r * 1.0, h * 0.28], [r * 1.04, h * 0.5], [r * 1.0, h * 0.72], [r * 0.8, h], [r * 0.72, h - 0.035], [0, h - 0.035]], 10, { crease: 50 }), stave);
  const band = (y, rr) => tint(lathe([[rr * 1.03, y - h * 0.035], [rr * 1.05, y], [rr * 1.03, y + h * 0.035]], 10, { crease: 180 }), hoop);
  return merge(body, band(h * 0.22, r * 0.96), band(h * 0.78, r * 0.96), cyl(r * 0.42, r * 0.42, 0.02, 8, 0, h - 0.03, 0, brand));
}

/**
 * A Kedge harbour crane, standing on y = 0, jib reaching toward +X. Four splayed legs on a truck, a tubby cab
 * with a lit window, a long jib with a stay, a counterweight, a hook on a line.
 * anchors: lamp (the cab window), tip, top, hook
 */
export function gantry({ h = 9, reach = 7, seed = 1, color = K6.coral, cab = K6.cream, roof = K6.teal, lit = true, load = true, detail = 1 } = {}) {
  const r = R(seed), parts = [], legH = h * 0.5, sp = h * 0.2, lean = (r() - 0.5) * 0.06;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(bar([sx * sp, 0, sz * sp * 0.8], [sx * sp * 0.36, legH, sz * sp * 0.3], h * 0.028, color, 5));
  if (detail) for (const sz of [-1, 1]) parts.push(bar([-sp * 0.8, legH * 0.3, sz * sp * 0.64], [sp * 0.5, legH * 0.78, sz * sp * 0.4], h * 0.016, color, 4), bar([sp * 0.8, legH * 0.3, sz * sp * 0.64], [-sp * 0.5, legH * 0.78, sz * sp * 0.4], h * 0.016, color, 4));
  parts.push(bx(sp * 2.5, h * 0.035, sp * 2.0, 0, h * 0.018, 0, K6.iron));
  parts.push(rb(sp * 1.5, h * 0.05, sp * 1.3, 0.05, 0, legH, 0, K6.iron));
  const cy = legH + h * 0.11;
  parts.push(rb(sp * 1.25, h * 0.19, sp * 1.1, h * 0.02, 0, cy, 0, cab));
  parts.push(tint(place(cylinder(sp * 0.98, 0, h * 0.11, 4), 0, cy + h * 0.095, 0, 0, 45, 0), roof));
  const win = bx(sp * 0.62, h * 0.075, 0.06, 0, cy + h * 0.01, sp * 0.56, lit ? PAL.glass : PAL.glassOff);
  parts.push(lit ? setGlow(win, 0.95) : win);
  const pivot = [sp * 0.5, cy - h * 0.02, 0], tip = [reach, h, 0], top = [-sp * 0.1, h * 0.86, 0];
  parts.push(tint(tube(curve([pivot, [reach * 0.55, h * 0.74 + lean * h, 0], tip], 6), (t) => h * (0.03 - 0.014 * t), 5, { crease: 180 }), color));
  parts.push(bar([0, cy + h * 0.1, 0], top, h * 0.022, color), bar(top, tip, h * 0.007, K6.tar, 3), bar(top, [-sp * 1.5, cy - h * 0.02, 0], h * 0.007, K6.tar, 3));
  parts.push(rb(sp * 0.7, h * 0.09, sp * 0.8, 0.04, -sp * 1.35, cy - h * 0.05, 0, K6.iron));
  const L = h * 0.42, hy = tip[1] - L;
  parts.push(bar(tip, [tip[0], hy, 0], h * 0.006, K6.tar, 3));
  if (load) parts.push(place(cask({ r: h * 0.045, h: h * 0.1 }), tip[0], hy - h * 0.1, 0));
  return keep(merge(parts), { lamp: [0, cy + h * 0.01, sp * 0.6], tip, top, hook: [tip[0], hy, 0] });
}

/**
 * A cargo hull at anchor, bow toward +Z, waterline at y = 0. It rides high: a broad band of boot-topping shows
 * under the paint. A deckhouse aft, a stump mast with a derrick, a riding light at the masthead.
 * anchors: lamp
 */
export function hulk({ len = 9, hull = K6.cream, boot = K6.coral, house = K6.salt, roof = K6.teal, seed = 1, seg = 12, rings = 8, lit = true } = {}) {
  const r = R(seed), rz = len / 2, rx = len * 0.17, ry = len * 0.2, top = len * 0.17;
  const shell = (col, lo, hi) => tint(deform(superellipsoid(rx, ry, rz, 0.85, 0.7, seg, rings), (p) => { if (p[1] > 0) p[1] *= 0.04; p[1] = Math.max(lo, Math.min(hi, p[1])); const t = Math.abs(p[2]) / rz; p[1] += top + t * t * len * 0.035; }, 50), col);
  const parts = [shell(hull, -ry * 0.5, ry), shell(boot, -ry * 0.92, -ry * 0.48)];
  parts.push(bx(rx * 1.7, 0.08, len * 0.86, 0, top + 0.03, 0, K6.timber2));
  parts.push(rb(rx * 1.25, len * 0.11, len * 0.2, 0.06, 0, top + len * 0.055, -rz * 0.5, house), rb(rx * 1.45, len * 0.025, len * 0.24, 0.03, 0, top + len * 0.12, -rz * 0.5, roof));
  parts.push(cyl(len * 0.03, len * 0.022, len * 0.13, 6, rx * 0.2, top + len * 0.12, -rz * 0.62, boot));
  const mh = len * (0.34 + r() * 0.1), mz = rz * 0.12;
  parts.push(cyl(len * 0.014, len * 0.01, mh, 5, 0, top, mz, K6.timberDark, 0, 0, (r() - 0.5) * 3), bar([0, top + mh * 0.3, mz], [0, top + mh * 0.72, mz + len * 0.26], len * 0.009, K6.timberDark, 4));
  const lamp = setGlow(ball(len * 0.022, 0, top + mh + len * 0.02, mz, lit ? '#ffe9a0' : PAL.glassOff, 6), lit ? 1 : 0);
  parts.push(lamp);
  const win = setGlow(bx(rx * 1.27, len * 0.03, len * 0.12, 0, top + len * 0.07, -rz * 0.5, lit ? PAL.glass : PAL.glassOff), lit ? 0.9 : 0);
  parts.push(win);
  return keep(merge(parts), { lamp: [0, top + mh + len * 0.02, mz] });
}

/** A long stone breakwater along X, top at y = h, standing in the sea at y = 0: a battered wall, a paler coping. */
export function mole({ len = 80, h = 2.2, d = 5, color = K6.stone2, cap = K6.stone, foot = '#c4a6c8' } = {}) {
  const body = gradientY(deform(box(len, h, d), (p) => { if (p[1] < 0) { p[2] *= 1.25; } }), foot, color);
  return merge(place(body, 0, h / 2, 0), bx(len + 0.6, h * 0.14, d * 1.06, 0, h, 0, cap));
}

/**
 * Kedge's lamp-house from outside: a fat battered stone drum with a door, a gallery, an open lamp room of stout
 * pillars with the bowl and its flame inside, and a copper hood with a smoke pot. Stands on y = 0, door toward +Z.
 *   flame   'white' (whole, tall) | 'quarter' (a small grey-violet flame) | 'out'
 * anchors: lamp (centre of the flame), top
 */
export function lampHouse({ h = 9, r = 2.6, flame = 'white', seg = 14, wall = K6.stone, band = K6.coral } = {}) {
  const parts = [], bh = h * 0.56, Rr = (y) => r * (1 - 0.24 * (y / bh));
  parts.push(tint(lathe([[0, 0], [r * 1.16, 0], [r * 1.12, bh * 0.08], [r, bh * 0.1], [Rr(bh * 0.5), bh * 0.5], [Rr(bh), bh], [0, bh]], seg, { crease: 40 }), wall));
  parts.push(tint(lathe([[Rr(bh * 0.62) * 1.012, bh * 0.62], [Rr(bh * 0.74) * 1.012, bh * 0.74]], seg, { crease: 180 }), band));
  const gr = Rr(bh) * 1.28;
  parts.push(tint(lathe([[Rr(bh), bh - 0.05], [gr, bh + 0.02], [gr, bh + h * 0.025], [0, bh + h * 0.025]], seg, { crease: 40 }), K6.stone2));
  parts.push(tint(place(torus(gr * 0.97, h * 0.006, seg, 4), 0, bh + h * 0.075, 0), K6.iron));
  const ph = h * 0.2, pr = Rr(bh) * 0.86, py = bh + h * 0.025;
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.52; parts.push(cyl(h * 0.022, h * 0.018, ph, 6, Math.cos(a) * pr, py, Math.sin(a) * pr, K6.cream)); }
  parts.push(tint(lathe([[0, py], [pr * 0.62, py], [pr * 0.72, py + ph * 0.2], [0, py + ph * 0.2]], 10, { crease: 50 }), K6.brass));
  const fy = py + ph * 0.2, lamp = [0, fy + ph * (flame === 'white' ? 0.36 : 0.12), 0];
  if (flame !== 'out') {
    const fr = flame === 'white' ? pr * 0.52 : pr * 0.2, fh = flame === 'white' ? ph * 0.74 : ph * 0.26;
    const f = lathe([[0, 0], [fr, fh * 0.12], [fr * 1.15, fh * 0.36], [fr * 0.7, fh * 0.7], [0, fh]], 8, { crease: 180 });
    parts.push(setGlow(setOutline(place(flame === 'white' ? gradientY(f, '#ffffff', '#fff0a8') : gradientY(f, '#e8dcff', K6.quarterDeep), 0, fy, 0), 0.3), 1));
  }
  const hy = py + ph;
  parts.push(tint(lathe([[pr * 1.3, hy - 0.04], [pr * 1.22, hy + h * 0.03], [pr * 0.5, hy + h * 0.14], [pr * 0.24, hy + h * 0.19], [pr * 0.24, hy + h * 0.24], [0, hy + h * 0.24]], seg, { crease: 40 }), K6.copper));
  parts.push(tint(lathe([[pr * 0.34, hy + h * 0.235], [pr * 0.36, hy + h * 0.26], [0, hy + h * 0.275]], 8, { crease: 40 }), K6.copperDark));
  // door, steps, two small windows
  const arch = []; for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI; arch.push([Math.cos(a) * r * 0.2, bh * 0.2 + Math.sin(a) * r * 0.2]); }
  parts.push(tint(place(extrude([[r * 0.2, 0], ...arch, [-r * 0.2, 0]], 0.3, { bevel: 0.03 }), 0, bh * 0.1, r * 0.98), K6.tealDark));
  parts.push(rb(r * 0.7, bh * 0.1, r * 0.5, 0.05, 0, bh * 0.05, r * 1.16, K6.stone2));
  for (const [ya, y] of [[38, bh * 0.5], [-34, bh * 0.46]]) parts.push(place(place(merge(rb(r * 0.2, r * 0.3, 0.14, 0.04, 0, 0, 0, K6.iron), setGlow(rb(r * 0.13, r * 0.22, 0.16, 0.03, 0, 0, 0, PAL.glass), 0.9)), 0, y, Rr(y) - 0.03), 0, 0, 0, 0, ya, 0));
  return keep(merge(parts), { lamp, top: [0, hy + h * 0.28, 0], bowl: [0, fy, 0], roomR: pr });
}

/**
 * A gabled dock warehouse, the gable with its loading door and hoist toward +Z, standing on y = 0. Walls lean out
 * a little with height; a loft door under the hoist beam; a painted band; small windows.
 *   door   'open' (ajar, lit from inside) | 'shut';  lit: chance a window is lit
 * anchors: door (centre of the doorway, for a glow), windows (lit ones), hoist (end of the beam), ridge
 */
export function warehouse({ w = 5, d = 6, h = 4.2, roofH = 2.2, seed = 1, wall = K6.cream, roof = K6.teal, trim = K6.timberDark, band = K6.coral, door = 'open', lit = 0.6, doorCol = K6.tealDark, sign = K6.yellow } = {}) {
  const r = R(seed), parts = [], hw = w / 2, hd = d / 2, fz = hd, litWins = [];
  parts.push(rb(w, h, d, 0.12, 0, h / 2, 0, wall), rb(w + 0.2, 0.5, d + 0.2, 0.08, 0, 0.25, 0, K6.stone2));
  parts.push(bx(w * 1.04, h * 0.09, d * 1.04, 0, h * 0.62, 0, band));
  // gable infill and a fat roof with a sagging ridge
  const ov = 0.4, e = hw * 1.08 + ov, th = 0.24, rx = (r() - 0.5) * w * 0.12, n = 5, outer = [], inner = [];
  const slope = (t) => Math.pow(t, 1.3);
  for (let i = 0; i <= n; i++) { const t = i / n; outer.push([-e + (rx + e) * t, roofH * slope(t)]); }
  for (let i = n - 1; i >= 0; i--) { const t = i / n; outer.push([e - (e - rx) * t, roofH * slope(t)]); }
  for (const [x, y] of outer) inner.push([x * (1 - th / e), y - th]);
  parts.push(tint(place(extrude([[-hw * 1.08, -0.05], ...inner.slice(1, -1), [hw * 1.08, -0.05]], d * 1.06, { crease: 40 }), 0, h, 0), wall));
  parts.push(tint(place(extrude([...outer, ...inner.reverse()], d * 1.08 + ov * 2, { bevel: 0.05, crease: 40 }), 0, h + 0.02, 0, 0, 0, (r() - 0.5) * 2.5), roof));
  // the loading door: a round-headed opening with a dark inside, one leaf ajar
  const dw = w * 0.34, dh = h * 0.56, arch = []; for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; arch.push([Math.cos(a) * dw / 2, dh - dw / 2 + Math.sin(a) * dw / 2]); }
  const dx = (r() > 0.5 ? 1 : -1) * w * 0.08;
  parts.push(tint(place(extrude([[dw / 2 + 0.14, 0], ...arch.map(([x, y]) => [x * 1.2, y * 1.03 + 0.06]), [-dw / 2 - 0.14, 0]], 0.14, { bevel: 0.02 }), dx, 0, fz + 0.02), K6.stone2));
  const inside = tint(place(extrude([[dw / 2, 0], ...arch, [-dw / 2, 0]], 0.16), dx, 0, fz + 0.03), door === 'open' ? '#ffb85a' : doorCol);
  parts.push(door === 'open' ? setGlow(inside, 0.9) : inside);
  if (door === 'open') parts.push(bx(dw * 0.5, dh * 0.93, 0.07, dx - dw * 0.42, dh * 0.47, fz + 0.28, doorCol, 0, 38, 0), bx(dw * 0.5, dh * 0.93, 0.07, dx + dw * 0.46, dh * 0.47, fz + 0.2, doorCol, 0, -22, 0));
  // loft door, hoist beam and its block
  const ly = h * 0.86;
  parts.push(rb(w * 0.2, h * 0.3, 0.12, 0.03, rx * 0.4, ly, fz + 0.02, trim), rb(w * 0.14, h * 0.24, 0.14, 0.02, rx * 0.4, ly, fz + 0.03, doorCol));
  const hoistY = h + roofH * 0.52, hoist = [rx * 0.4, hoistY, fz + ov + 1.0];
  parts.push(bx(0.16, 0.18, 1.6, rx * 0.4, hoistY, fz + ov + 0.3, trim), cyl(0.1, 0.1, 0.1, 8, hoist[0] - 0.05, hoistY - 0.22, hoist[2] - 0.1, K6.iron, 0, 0, 90), bar([hoist[0], hoistY - 0.2, hoist[2] - 0.1], [hoist[0], hoistY - 1.0, hoist[2] - 0.1], 0.02, K6.rope, 3));
  // windows either side of the door, and a roundel sign
  for (const sx of [-1, 1]) {
    const on = r() < lit, x = dx + sx * w * 0.33, y = h * 0.36;
    if (Math.abs(x) > hw - 0.4) continue;
    parts.push(rb(0.56, 0.7, 0.1, 0.05, x, y, fz, trim));
    const g = rb(0.4, 0.54, 0.12, 0.03, x, y, fz + 0.01, on ? PAL.glass : PAL.glassOff); parts.push(on ? setGlow(g, 0.95) : g);
    if (on) litWins.push([x, y, fz + 0.1]);
  }
  if (sign) parts.push(cyl(0.34, 0.34, 0.07, 12, -rx, h + roofH * 0.28, fz + 0.06, trim, 90, 0, 0), cyl(0.26, 0.26, 0.09, 12, -rx, h + roofH * 0.28, fz + 0.07, sign, 90, 0, 0));
  const m = keep(merge(parts), { door: [dx, dh * 0.5, fz + 0.2], windows: litWins, hoist, ridge: [rx, h + roofH, fz + ov] });
  return wonk(m, { lean: (r() - 0.5) * 0.06, bulge: 0.06, twist: (r() - 0.5) * 3 });
}

/**
 * The Audit cutter from outside, bow toward +Z, waterline at y = 0: a low black hull with one white strake, one
 * tall mast, a furled sail on the boom, the search lamp at the hounds, the pennant at the masthead.
 * anchors: lamp (the search lamp), mast
 */
export function cutterHull({ len = 14, lit = true, seg = 14, rings = 8 } = {}) {
  const rz = len / 2, rx = len * 0.12, ry = len * 0.1, top = len * 0.075;
  const shell = (col, lo, hi) => tint(deform(superellipsoid(rx, ry, rz, 0.8, 0.62, seg, rings), (p) => { if (p[1] > 0) p[1] *= 0.04; p[1] = Math.max(lo, Math.min(hi, p[1])); const t = p[2] / rz; p[1] += top + t * t * len * (t > 0 ? 0.045 : 0.02); }, 50), col);
  const parts = [shell(K6.audit, -ry, ry), shell('#ffffff', -ry * 0.3, -ry * 0.12)];
  parts.forEach((m, i) => { if (i === 1) deform(m, (p) => { p[0] *= 1.02; }, 50); });
  parts.push(rb(rx * 1.1, len * 0.045, len * 0.22, 0.05, 0, top + len * 0.022, -rz * 0.3, '#eef0ff'), bx(rx * 1.2, len * 0.012, len * 0.24, 0, top + len * 0.05, -rz * 0.3, K6.audit));
  const mh = len * 0.78, mz = rz * 0.14;
  parts.push(cyl(len * 0.014, len * 0.008, mh, 6, 0, top, mz, K6.timber2), bar([0, top + mh * 0.16, mz], [0, top + mh * 0.2, mz - len * 0.46], len * 0.011, K6.timber2, 5));
  parts.push(tint(place(scaleMesh(sphere(1, 8, 5), len * 0.022, len * 0.022, len * 0.2), 0, top + mh * 0.2 + len * 0.02, mz - len * 0.24, 3, 0, 0), '#eef0ff'));
  parts.push(bar([0, top + mh * 0.96, mz], [0, top + len * 0.06, rz * 0.98], len * 0.004, K6.tar, 3), bar([0, top + mh * 0.9, mz], [rx * 0.9, top, mz - len * 0.05], len * 0.004, K6.tar, 3), bar([0, top + mh * 0.9, mz], [-rx * 0.9, top, mz - len * 0.05], len * 0.004, K6.tar, 3));
  parts.push(tint(place(extrude([[0, 0], [len * 0.11, 0.03 * len * 0.1], [0, len * 0.035]], 0.02), 0, top + mh * 0.95, mz, 0, 90, 0), K6.audit));
  const lamp = [0, top + mh * 0.62, mz + len * 0.03];
  parts.push(setGlow(ball(len * 0.022, lamp[0], lamp[1], lamp[2], lit ? '#ffffff' : PAL.glassOff, 8), lit ? 1 : 0));
  for (let i = 0; i < 4; i++) parts.push(setGlow(cyl(len * 0.008, len * 0.008, 0.05, 6, rx * 1.0, top - ry * 0.35, -rz * 0.5 + i * len * 0.2, lit ? PAL.glass : PAL.glassOff, 0, 0, -90), lit ? 0.9 : 0));
  return keep(merge(parts), { lamp, mast: [0, top + mh, mz] });
}

/** An open pulling boat, bow toward +Z, waterline at y = 0: eight rowers on four thwarts, casks amidships, a figure in the stern. */
export function openBoat({ len = 6, hull = K6.cream, boot = K6.teal } = {}) {
  const rz = len / 2, rx = len * 0.16, ry = len * 0.11, top = len * 0.07;
  const shell = (col, lo, hi) => tint(deform(superellipsoid(rx, ry, rz, 0.9, 0.7, 12, 8), (p) => { if (p[1] > 0) p[1] *= 0.05; p[1] = Math.max(lo, Math.min(hi, p[1])); const t = Math.abs(p[2]) / rz; p[1] += top + t * t * len * 0.05; }, 50), col);
  const parts = [shell(hull, -ry * 0.45, ry), shell(boot, -ry, -ry * 0.42)];
  parts.push(tint(place(scaleMesh(lathe([[1, 0], [0, 0]], 10, { crease: 180 }), rx * 0.8, 1, rz * 0.84), 0, top - ry * 0.35, 0), K6.timberDark));
  const coats = ['#ff8a6a', '#7fd8e0', '#ffd870', '#b8a4ff'];
  for (let i = 0; i < 4; i++) {
    const z = -rz * 0.45 + i * len * 0.19;
    parts.push(bx(rx * 1.6, 0.05, len * 0.05, 0, top - 0.04, z, K6.timber2));
    if (i === 1) { parts.push(place(cask({ r: len * 0.04, h: len * 0.1 }), 0, top - ry * 0.3, z + len * 0.09), place(cask({ r: len * 0.04, h: len * 0.1 }), rx * 0.3, top - ry * 0.3, z + len * 0.1)); }
    for (const sx of [-1, 1]) parts.push(tint(place(lathe([[0, 0], [0.13, 0], [0.11, 0.24], [0, 0.3]], 6, { crease: 180 }), sx * rx * 0.42, top, z), coats[(i + (sx > 0 ? 1 : 0)) % 4]), ball(0.1, sx * rx * 0.42, top + 0.38, z, '#ffdcb8', 6));
  }
  // Hesper in the stern, standing, a paper in her fist no longer
  parts.push(tint(place(lathe([[0, 0], [0.15, 0], [0.12, 0.36], [0, 0.44]], 6, { crease: 180 }), 0, top + 0.02, -rz * 0.72), '#f6e6c0'), ball(0.115, 0, top + 0.55, -rz * 0.72, '#ffdcb8', 6), ball(0.12, 0, top + 0.6, -rz * 0.75, '#e8e2f0', 6));
  return keep(merge(parts), { rowlocks: [0, 1, 2, 3].map((i) => [rx * 0.95, top + 0.08, -rz * 0.45 + i * len * 0.19 + len * 0.05]), top });
}
/** One oar, pivot (the rowlock) at the origin, blade toward +X. */
export function oar({ len = 1.9 } = {}) { return merge(bar([-len * 0.25, 0, 0], [len * 0.75, 0, 0], 0.022, K6.timber2, 4), rb(len * 0.2, 0.02, 0.11, 0.01, len * 0.82, 0, 0, K6.cream)); }

// ------------------------------------------------------------------------------------ timber rooms

/**
 * A boarded wall `w` long and `h` high, standing on y = 0 with its room face on z = 0 (it faces +Z and goes back `t`).
 * Boards alternate two colours in vertical strips; stout posts stand at `posts` spacing; square openings are cut in it.
 *   openings  [{ x, w, sill, top }]
 * anchors: openings [[x, (sill + top) / 2, 0], ...]
 */
export function plankWall({ w = 10, h = 4, t = 0.2, colors = [K6.teal, K6.tealDark], board = 0.55, posts = 0, post = K6.timberDark, openings = [], seed = 1, rail = null } = {}) {
  const r = R(seed), parts = [], n = Math.max(1, Math.round(w / board)), bw = w / n;
  const inOpen = (x0, x1) => openings.find((o) => x1 > o.x - o.w / 2 + 0.01 && x0 < o.x + o.w / 2 - 0.01);
  for (let i = 0; i < n; i++) {
    const x0 = -w / 2 + i * bw, x1 = x0 + bw, o = inOpen(x0, x1), col = colors[(i + (r() > 0.8 ? 1 : 0)) % colors.length], dz = (r() - 0.5) * 0.03;
    if (!o) { parts.push(bx(bw - 0.02, h, t, (x0 + x1) / 2, h / 2, -t / 2 + dz, col)); continue; }
    if (o.sill > 0.01) parts.push(bx(bw - 0.02, o.sill, t, (x0 + x1) / 2, o.sill / 2, -t / 2 + dz, col));
    if (h - o.top > 0.01) parts.push(bx(bw - 0.02, h - o.top, t, (x0 + x1) / 2, (h + o.top) / 2, -t / 2 + dz, col));
  }
  for (const o of openings) { // a frame round each opening
    const hh = o.top - o.sill, f = 0.12;
    parts.push(bx(o.w + f * 2, f, t + 0.1, o.x, o.top + f / 2, -t / 2, post), bx(f, hh, t + 0.1, o.x - o.w / 2 - f / 2, o.sill + hh / 2, -t / 2, post), bx(f, hh, t + 0.1, o.x + o.w / 2 + f / 2, o.sill + hh / 2, -t / 2, post));
    if (o.sill > 0.01) parts.push(bx(o.w + f * 2.6, f * 0.8, t + 0.24, o.x, o.sill - f * 0.4, -t / 2 + 0.06, post));
    if (o.bars) for (let i = 1; i <= o.bars; i++) parts.push(bx(0.05, hh, 0.05, o.x - o.w / 2 + (o.w * i) / (o.bars + 1), o.sill + hh / 2, -t / 2, post));
    if (o.bars) parts.push(bx(o.w, 0.05, 0.05, o.x, o.sill + hh * 0.55, -t / 2, post));
  }
  if (posts > 0) { const pn = Math.round(w / posts); for (let i = 0; i <= pn; i++) { const x = -w / 2 + (w * i) / pn; if (!inOpen(x - 0.1, x + 0.1)) parts.push(bx(0.2, h, 0.2, x, h / 2, 0.02, post, 0, 0, (r() - 0.5) * 1.2)); } }
  if (rail) parts.push(bx(w, 0.14, 0.1, 0, h * 0.34, 0.04, rail));
  return keep(merge(parts), { openings: openings.map((o) => [o.x, (o.sill + o.top) / 2, 0]) });
}

/** A roof frame across X: a tie-beam at y = 0 spanning `span`, a king post, two rafters meeting `rise` above it, two braces. */
export function truss({ span = 10, rise = 2.6, color = K6.timberRed, beam = 0.26, brace = true } = {}) {
  const hs = span / 2, parts = [bx(span + 0.4, beam, beam, 0, 0, 0, color), bx(beam * 0.8, rise, beam * 0.8, 0, rise / 2, 0, color)];
  const L = Math.hypot(hs, rise), a = Math.atan2(rise, hs) / DEG;
  for (const sx of [-1, 1]) {
    parts.push(bx(L + 0.3, beam * 0.9, beam * 0.9, sx * hs / 2, rise / 2, 0, color, 0, 0, sx * -a));
    if (brace) parts.push(bx(Math.hypot(hs * 0.5, rise * 0.5), beam * 0.6, beam * 0.6, sx * hs * 0.25, rise * 0.27, 0, color, 0, 0, sx * a));
  }
  return merge(parts);
}

/**
 * Light slanting in through an opening, as additive cards (material: ch6Materials().shaft). Origin: the centre of
 * the opening, which lies in the XY plane; the light travels along `dir` (y negative) for `len`.
 */
export function shaft({ w = 1.4, h = 2.4, dir = [0.3, -1, 1], len = 5, cards = 3, color = '#9fb8ff', spread = 0.25 } = {}) {
  const l = Math.hypot(dir[0], dir[1], dir[2]), d = [dir[0] / l * len, dir[1] / l * len, dir[2] / l * len], parts = [];
  for (let i = 0; i < cards; i++) {
    const t = cards === 1 ? 0.5 : i / (cards - 1), y = (t - 0.5) * h * 0.8, k = 1 + spread;
    parts.push(fromArrays([-w / 2, y, 0, w / 2, y, 0, -w / 2 * k + d[0], y + d[1], d[2], w / 2 * k + d[0], y + d[1], d[2]], [0, 2, 3, 0, 3, 1], [0, 0, 1, 0, 0, 1, 1, 1], 180));
  }
  return setOutline(tint(merge(parts), color), 0);
}

/** A window's light on the floor: `panes` glowing strips, sheared along the light. Centred, long axis Z. Lay it at y about 0.006 (flat material). */
export function patch({ w = 1.4, d = 2.4, panes = 2, shear = 0.3, color = '#b9c8ff', glow = 0.5, taper = 1.25 } = {}) {
  const parts = [], pw = w / panes, gap = 0.08;
  for (let i = 0; i < panes; i++) parts.push(place(plane(pw - gap, d), -w / 2 + pw * (i + 0.5), 0, 0));
  const m = merge(parts), P = m.positions;
  for (let i = 0; i < P.length; i += 3) { const t = P[i + 2] / d + 0.5; P[i] = P[i] * (1 + (taper - 1) * t) + P[i + 2] * shear; }
  return setOutline(setGlow(tint(m, color), glow), 0);
}

/** A storm lantern hanging from the origin on a chain `drop` long: tank, glass chimney in a wire cage, a cap with a ring. anchors: lamp */
export function hurricaneLamp({ drop = 1.2, s = 1, metal = K6.brass, glass = '#fff0b0' } = {}) {
  const parts = [], y = -drop;
  parts.push(bar([0, 0, 0], [0, y + 0.52 * s, 0], 0.014, K6.iron, 4));
  parts.push(tint(place(torus(0.07 * s, 0.015 * s, 8, 4), 0, y + 0.5 * s, 0, 90, 0, 0), metal));
  parts.push(tint(place(lathe([[0, 0.44], [0.07, 0.44], [0.16, 0.38], [0.17, 0.34], [0.09, 0.33], [0, 0.33]], 10, { crease: 50 }), 0, y, 0, 0, 0, 0, s), metal));
  parts.push(setGlow(tint(place(lathe([[0.09, 0.08], [0.15, 0.16], [0.13, 0.28], [0.08, 0.33]], 10, { crease: 180 }), 0, y, 0, 0, 0, 0, s), glass), 1));
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; parts.push(bar([Math.cos(a) * 0.16 * s, y + 0.07 * s, Math.sin(a) * 0.16 * s], [Math.cos(a) * 0.15 * s, y + 0.35 * s, Math.sin(a) * 0.15 * s], 0.012 * s, metal, 3)); }
  parts.push(tint(place(lathe([[0, -0.06], [0.14, -0.06], [0.19, 0], [0.17, 0.07], [0.1, 0.09], [0, 0.09]], 10, { crease: 50 }), 0, y, 0, 0, 0, 0, s), metal));
  return keep(merge(parts), { lamp: [0, y + 0.2 * s, 0] });
}

/** The jack at the head of a ropewalk: a great spoked wheel in an A-frame with a crank and a row of hooks, facing +Z, standing on y = 0. */
export function ropeJack({ r = 1.3, color = K6.timberRed, wheel = K6.yellow, iron = K6.iron } = {}) {
  const parts = [], cy = r + 0.5;
  for (const sx of [-1, 1]) parts.push(bar([sx * r * 0.9, 0, -0.25], [sx * 0.12, cy + 0.2, -0.25], 0.09, color, 6), bar([sx * r * 0.9, 0, 0.25], [sx * 0.12, cy + 0.2, 0.25], 0.09, color, 6));
  parts.push(bx(r * 2.1, 0.16, 0.9, 0, 0.08, 0, color));
  parts.push(tint(place(torus(r, 0.09, 18, 6), 0, cy, 0, 90, 0, 0), wheel), cyl(0.2, 0.2, 0.3, 10, 0, cy, -0.15, iron, 90, 0, 0));
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; parts.push(bar([0, cy, 0], [Math.cos(a) * r, cy + Math.sin(a) * r, 0], 0.035, wheel, 4)); }
  parts.push(bar([0, cy, 0.1], [0.28, cy - 0.3, 0.36], 0.03, iron, 4), ball(0.07, 0.28, cy - 0.3, 0.4, K6.coral, 6));
  parts.push(bx(r * 1.5, 0.14, 0.14, 0, cy + r + 0.32, 0, color));
  for (let i = 0; i < 4; i++) parts.push(tint(place(torus(0.07, 0.018, 8, 4), (i - 1.5) * r * 0.4, cy + r + 0.2, 0.06, 0, 0, 0), iron));
  return wonk(merge(parts), { lean: 0.015, twist: 2 });
}

/**
 * A chalk board in a timber frame, facing +Z, bottom edge at y = 0, centred on X: `rows` lines of tally marks in
 * fives, a ruled-off head row, a few figures ringed. `fill` 0..1 is how much of it is chalked.
 */
export function tallyBoard({ w = 2.6, h = 1.7, rows = 6, seed = 1, fill = 1, frame = K6.timber, slate = K6.slate, chalk = K6.chalk } = {}) {
  const r = R(seed), parts = [rb(w + 0.2, h + 0.2, 0.1, 0.04, 0, h / 2, 0, frame), bx(w, h, 0.04, 0, h / 2, 0.04, slate)];
  const z = 0.065, rh = (h - 0.3) / rows, mark = (x, y, hh, rot = 0, ww = 0.03) => parts.push(setOutline(bx(ww, hh, 0.01, x, y, z, chalk, 0, 0, rot), 0));
  parts.push(setOutline(bx(w - 0.2, 0.025, 0.01, 0, h - 0.24, z, chalk), 0));
  for (let k = 0; k < 4; k++) mark(-w / 2 + 0.3 + k * (w - 0.6) / 3, h - 0.14, 0.02, 0, 0.26);
  for (let j = 0; j < Math.round(rows * fill); j++) {
    const y = h - 0.3 - rh * (j + 0.5), groups = 2 + Math.floor(r() * 4);
    mark(-w / 2 + 0.2, y, 0.03, 0, 0.16);
    for (let g = 0; g < groups; g++) {
      const gx = -w / 2 + 0.5 + g * 0.42, cnt = g === groups - 1 ? 1 + Math.floor(r() * 4) : 5;
      for (let i = 0; i < Math.min(cnt, 4); i++) mark(gx + i * 0.065, y + (r() - 0.5) * 0.02, rh * 0.62, (r() - 0.5) * 8);
      if (cnt === 5) mark(gx + 0.1, y, rh * 0.86, 62, 0.026);
    }
  }
  parts.push(bx(w + 0.3, 0.07, 0.16, 0, -0.03, 0.08, frame), rb(0.14, 0.04, 0.05, 0.01, w * 0.28, 0.02, 0.1, chalk));
  return merge(parts);
}

/** A plank table on two trestles, top at y = h. */
export function trestle({ w = 2.4, d = 0.95, h = 0.8, color = K6.timber2, dark = K6.timberDark, seed = 1 } = {}) {
  const parts = [place(planks({ w, d, plank: d / 3, thick: 0.08, seed, along: 'z', colors: [color, K6.timber, '#f2b877'] }), 0, h, 0)];
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 - 0.3);
    parts.push(bx(0.1, 0.1, d * 0.9, x, h - 0.13, 0, dark));
    for (const sz of [-1, 1]) parts.push(bar([x, h - 0.12, sz * d * 0.12], [x + sx * 0.06, 0, sz * d * 0.46], 0.05, dark, 5));
  }
  parts.push(bar([-(w / 2 - 0.3), h * 0.35, 0], [w / 2 - 0.3, h * 0.35, 0], 0.035, dark, 5));
  return wonk(merge(parts), { twist: 1.5 });
}

/** A coil of rope hung on a peg: the peg is at the origin (in a wall facing +Z), the coil hangs below it. */
export function hank({ r = 0.3, turns = 4, color = K6.rope, long = 1.5 } = {}) {
  const parts = [cyl(0.035, 0.03, 0.18, 5, 0, 0, 0.09, K6.timberDark, 90, 0, 0)];
  for (let i = 0; i < turns; i++) parts.push(tint(place(scaleMesh(torus(r - i * 0.012, 0.042, 12, 5), 1, 1, long), 0, -r * long + 0.02, 0.07 + i * 0.045, 90, 0, (i - turns / 2) * 3), i % 2 ? color : K6.rope2));
  parts.push(tint(place(torus(0.06, 0.03, 6, 4), 0, -r * long * 0.9, 0.16, 0, 0, 0), color));
  return merge(parts);
}

/**
 * One bay of shelving, facing +Z, standing on y = 0: uprights, `rows` shelves, filled with account books ('books')
 * or with coils of rope lying on their sides ('rope').
 */
export function shelfBay({ w = 1.4, h = 3.2, d = 0.45, rows = 4, kind = 'books', seed = 1, wood = K6.timberDark, back = K6.tar, colors = K6.books } = {}) {
  const r = R(seed), parts = [bx(w, h, 0.05, 0, h / 2, -d / 2 + 0.03, back)], rh = (h - 0.2) / rows;
  for (const sx of [-1, 1]) parts.push(bx(0.09, h, d, sx * (w / 2 - 0.045), h / 2, 0, wood));
  for (let j = 0; j <= rows; j++) parts.push(bx(w, 0.07, d, 0, 0.12 + rh * j, 0, wood));
  for (let j = 0; j < rows; j++) {
    const y0 = 0.155 + rh * j;
    if (kind === 'books') {
      let x = -w / 2 + 0.12;
      while (x < w / 2 - 0.2) {
        const bw = 0.07 + r() * 0.07, bh = rh * (0.62 + r() * 0.26), tilt = r() > 0.88 ? 12 : 0;
        if (r() > 0.1) parts.push(setOutline(bx(bw - 0.012, bh, d * 0.66, x + bw / 2, y0 + bh / 2, 0.02, colors[Math.floor(r() * colors.length)], 0, 0, -tilt), 0.6));
        x += bw + (tilt ? 0.06 : 0);
      }
    } else if (kind === 'rope') {
      const n = Math.max(1, Math.floor(w / 0.62));
      for (let i = 0; i < n; i++) { const rr = Math.min(rh * 0.42, 0.26) * (0.85 + r() * 0.2), x = -w / 2 + (w / n) * (i + 0.5); parts.push(tint(place(torus(rr * 0.72, rr * 0.3, 10, 5), x, y0 + rr, 0.03, 90 + (r() - 0.5) * 10, 0, 0), i % 2 ? K6.rope : K6.rope2), tint(place(torus(rr * 0.72, rr * 0.3, 10, 5), x, y0 + rr, -0.1, 90, 0, 0), K6.rope2)); }
    }
  }
  return merge(parts);
}

/** An account book lying open, spine along Z, on y = 0: two fat blocks of pages, ruled lines, a ribbon. `w` across both pages. */
export function openBook({ w = 0.9, d = 0.62, cover = K6.wine, paper = K6.paper, lines = 6, ribbon = K6.coral } = {}) {
  const parts = [rb(w + 0.06, 0.04, d + 0.06, 0.015, 0, 0.02, 0, cover)];
  for (const sx of [-1, 1]) {
    parts.push(rb(w / 2 - 0.01, 0.06, d, 0.02, sx * w / 4, 0.065, 0, paper, 0, 0, sx * 5));
    for (let i = 0; i < lines; i++) parts.push(setOutline(bx(w / 2 - 0.1, 0.004, 0.014, sx * w / 4, 0.1 + 0.001, -d / 2 + 0.09 + i * (d - 0.16) / (lines - 1), i === lines - 1 && sx > 0 ? K6.coral : '#7f8fd0', 0, 0, sx * 5), 0));
    parts.push(setOutline(bx(0.012, 0.004, d - 0.14, sx * (w / 4 + w * 0.13), 0.1 + 0.002 - sx * sx * 0.012, 0, K6.coral, 0, 0, sx * 5), 0));
  }
  parts.push(bx(0.03, 0.01, d * 0.5, 0.01, 0.085, d * 0.3, ribbon));
  return merge(parts);
}

/** A standing desk: tall splayed legs, a foot rail, a sloped top with a lip, a shelf under it. Faces +Z (the clerk stands at +Z). anchors: slope (centre of the top), tilt (degrees), lamp (back edge) */
export function clerkDesk({ w = 1.3, d = 0.8, h = 1.12, color = K6.timberRed, dark = K6.timberDark, trim = K6.brass } = {}) {
  const parts = [], tilt = 16;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(bar([sx * (w / 2 - 0.02), 0, sz * (d / 2 + 0.02)], [sx * (w / 2 - 0.14), h - 0.1, sz * (d / 2 - 0.12)], 0.055, dark, 6));
  parts.push(bar([-(w / 2 - 0.05), 0.28, d / 2 - 0.03], [w / 2 - 0.05, 0.28, d / 2 - 0.03], 0.04, dark, 5));
  parts.push(rb(w - 0.1, 0.3, d - 0.12, 0.04, 0, h - 0.12, 0, color), bx(w - 0.24, 0.04, d * 0.6, 0, h * 0.52, 0, dark));
  parts.push(rb(w + 0.12, 0.07, d + 0.14, 0.02, 0, h + 0.1, 0, color, tilt, 0, 0), bx(w + 0.12, 0.06, 0.05, 0, h + 0.03, d / 2 + 0.03, trim, tilt, 0, 0));
  parts.push(ball(0.035, 0, h - 0.12, d / 2 - 0.04, trim, 6));
  return keep(wonk(merge(parts), { lean: 0.02, twist: -2 }), { slope: [0, h + 0.15, 0.02], tilt, lamp: [-w / 2 + 0.16, h + 0.2, -d / 2 + 0.1] });
}

/** A brass arm rising from the origin with a green glass shade hanging over +Z/+X; the light falls straight down. anchors: lamp (inside the shade) */
export function greenLamp({ s = 1, shade = '#2fba7e', metal = K6.brass, reach = 0.42, rise = 0.62 } = {}) {
  const tip = [reach * s, rise * s, 0.12 * s];
  const parts = [tint(lathe([[0, 0], [0.1 * s, 0], [0.085 * s, 0.03 * s], [0.03 * s, 0.05 * s], [0, 0.05 * s]], 8, { crease: 50 }), metal)];
  parts.push(tint(tube(curve([[0, 0.04 * s, 0], [0.02 * s, rise * 0.8 * s, 0], [reach * 0.45 * s, rise * 1.16 * s, 0.05 * s], [tip[0], tip[1] + 0.13 * s, tip[2]]], 10), 0.018 * s, 5, { crease: 180 }), metal));
  parts.push(tint(place(lathe([[0.03, 0.14], [0.09, 0.12], [0.22, 0.0], [0.23, -0.03], [0.2, -0.02], [0.07, 0.09]], 12, { crease: 60 }), tip[0], tip[1], tip[2], 0, 0, 0, s), shade));
  parts.push(setGlow(setOutline(ball(0.075 * s, tip[0], tip[1] + 0.02 * s, tip[2], '#fff6c0', 8), 0), 1));
  parts.push(setGlow(setOutline(tint(place(lathe([[0.2, -0.018], [0.07, 0.085]], 12, { crease: 180 }), tip[0], tip[1] - 0.004, tip[2], 0, 0, 0, s), '#c8ffd8'), 0), 0.9));
  return keep(merge(parts), { lamp: [tip[0], tip[1] - 0.02 * s, tip[2]] });
}

// ------------------------------------------------------------------------------------ the cutter's deck

/**
 * The cutter's mast and rig, standing on the origin: a fat mast with bands, a boom toward +X with the mainsail
 * furled along it in gaskets, shrouds and ratlines fanning down to both rails (toward +Z and -Z, `beam` apart), a
 * crosstree, a yard for the pennant. `sides`: which rails get shrouds (-1 = the -Z rail, 1 = the +Z rail). anchors: hounds (where the search lamp's bracket is), boomEnd, yard, top
 */
export function mastRig({ h = 8.5, boom = 5.2, beam = 4.6, color = K6.timber2, sail = '#f4f1ff', rope = K6.tar, ratlines = 6, sides = [-1, 1] } = {}) {
  const parts = [], hb = beam / 2, by = 1.35, hounds = [0, h * 0.6, 0];
  parts.push(tint(lathe([[0, 0], [0.3, 0], [0.26, 0.1], [0.17, 0.2], [0.15, h * 0.6], [0.1, h], [0, h]], 10, { crease: 50 }), color));
  for (const y of [0.55, by + 0.25, h * 0.6]) parts.push(tint(place(torus(0.18, 0.035, 10, 4), 0, y, 0), K6.brass));
  parts.push(ball(0.12, 0, h + 0.05, 0, K6.brass, 8));
  parts.push(tint(tube([[0.1, by, 0], [boom, by + 0.35, 0]], (t) => 0.1 - 0.03 * t, 7, { crease: 180 }), color));
  parts.push(tint(place(deform(sphere(1, 10, 6), (p) => { p[1] *= 1 + 0.25 * Math.sin(p[0] * 9); }), boom * 0.5, by + 0.42, 0, 0, 0, 3.8, boom * 0.44, 0.2, 0.22), sail));
  for (let i = 0; i < 5; i++) { const x = boom * (0.14 + i * 0.18); parts.push(tint(place(torus(0.22, 0.02, 8, 4), x, by + 0.36 + x * 0.066, 0, 0, 0, 90), K6.rope)); }
  parts.push(bx(0.12, 0.08, 1.5, 0, h * 0.6 + 0.12, 0, color), bar([-0.9, h * 0.86, 0], [0.9, h * 0.9, 0], 0.035, color, 5));
  for (const sz of sides) {
    const feet = [[-0.75, 0.75, sz * hb], [0, 0.75, sz * hb], [0.75, 0.75, sz * hb]];
    for (const f of feet) parts.push(bar([0, h * 0.6, sz * 0.7], f, 0.024, rope, 4));
    for (let k = 1; k <= ratlines; k++) { const t = k / (ratlines + 1.5), y = 0.75 + (h * 0.6 - 0.75) * t, z = sz * (hb + (0.7 - hb) * t), x = 0.75 * (1 - t); parts.push(bar([-x, y, z], [x, y, z], 0.014, rope, 3)); }
    parts.push(bar([0, h * 0.6 + 0.12, sz * 0.72], [0, h * 0.97, 0], 0.016, rope, 3));
  }
  parts.push(bar([0, h * 0.97, 0], [boom, by + 0.4, 0], 0.014, rope, 3));
  return keep(merge(parts), { hounds, boomEnd: [boom, by + 0.35, 0], yard: [0.9, h * 0.9, 0], top: [0, h, 0] });
}

/** A search lamp: a fat brass drum in a yoke on a short bracket, lens toward +Z, pivot at the origin. anchors: lens */
export function searchLamp({ s = 1, metal = K6.brass, dark = K6.iron } = {}) {
  const parts = [];
  parts.push(tint(place(lathe([[0, -0.26], [0.2, -0.26], [0.27, -0.16], [0.3, 0.2], [0.33, 0.24], [0.33, 0.3], [0.27, 0.3]], 12, { crease: 50 }), 0, 0, 0, 90, 0, 0), metal));
  parts.push(setGlow(setOutline(tint(place(lathe([[0.27, 0.29], [0.2, 0.34], [0, 0.36]], 12, { crease: 180 }), 0, 0, 0, 90, 0, 0), '#ffffff'), 0.4), 1));
  parts.push(tint(place(torus(0.36, 0.03, 10, 4), 0, 0, 0, 0, 0, 0), dark));
  for (const sx of [-1, 1]) parts.push(ball(0.06, sx * 0.36, 0, 0, dark, 6));
  parts.push(cyl(0.05, 0.06, 0.3, 6, 0, -0.66, 0, dark), cyl(0.09, 0.09, 0.06, 8, 0, 0.3, -0.06, dark));
  return keep(scaleMesh(merge(parts), s), { lens: [0, 0, 0.36 * s] });
}

// ------------------------------------------------------------------------------------ the lamp-house

/**
 * A curved wall: `bays` flat stone panels set round an arc of radius `r` (centre at the origin, the arc centred on
 * -Z, so the wall is seen from inside looking toward -Z), every bay in `open` with a tall round-headed opening.
 *   arc      total degrees;  h: height;  open: { [bayIndex]: { w, sill, top } }
 * anchors: openings [{ pos, yaw }] (centre of each opening, and the bay's yaw), bays [{ pos, yaw, w }]
 */
export function ringWall({ r = 6, h = 7, arc = 150, bays = 7, t = 0.5, color = K6.stoneCool, color2 = K6.stoneDeep, open = {}, band = K6.stone, base = 1.0 } = {}) {
  const parts = [], outOpen = [], outBays = [], step = arc / bays, bw = 2 * r * Math.tan((step / 2) * DEG) + 0.02;
  for (let i = 0; i < bays; i++) {
    const a = (-arc / 2 + step * (i + 0.5)) * DEG, x = Math.sin(a) * r, z = -Math.cos(a) * r, yaw = -a / DEG, o = open[i], bay = [];
    if (!o) bay.push(bx(bw, h, t, 0, h / 2, -t / 2, i % 2 ? color : color2));
    else {
      const col = i % 2 ? color : color2, side = (bw - o.w) / 2, rise = o.w / 2, spring = o.top - rise, pts = [];
      for (const sx of [-1, 1]) bay.push(bx(side, h, t, sx * (o.w / 2 + side / 2), h / 2, -t / 2, col));
      if (o.sill > 0) bay.push(bx(o.w, o.sill, t, 0, o.sill / 2, -t / 2, col));
      for (let k = 0; k <= 10; k++) { const b = Math.PI * (1 - k / 10); pts.push([Math.cos(b) * o.w / 2, spring + Math.sin(b) * rise]); }
      bay.push(tint(place(extrude([...pts, [o.w / 2, h], [-o.w / 2, h]], t, { crease: 30 }), 0, 0, -t / 2), col));
      // a pale stone surround and two glazing bars
      bay.push(tint(place(tube(pts.map((p) => [p[0], p[1], 0]), 0.09, 4, { crease: 60, caps: false }), 0, 0, 0.02), band));
      for (const sx of [-1, 1]) bay.push(bx(0.14, spring - o.sill, 0.16, sx * (o.w / 2), (spring + o.sill) / 2, 0.0, band));
      bay.push(bx(o.w + 0.5, 0.14, 0.4, 0, o.sill, 0.08, band), bx(0.07, o.top - o.sill, 0.07, 0, (o.top + o.sill) / 2, -t * 0.5, K6.iron), bx(o.w, 0.07, 0.07, 0, spring, -t * 0.5, K6.iron));
      outOpen.push({ pos: [x, (o.sill + o.top) / 2, z], yaw, w: o.w, h: o.top - o.sill, sill: o.sill });
    }
    bay.push(bx(bw + 0.02, base, 0.14, 0, base / 2, 0.05, color2), bx(bw + 0.02, 0.12, 0.2, 0, base, 0.07, band));
    bay.push(bx(0.3, h, 0.24, -bw / 2, h / 2, 0.06, band));
    parts.push(place(merge(bay), x, 0, z, 0, yaw, 0));
    outBays.push({ pos: [x, 0, z], yaw, w: bw });
  }
  return keep(merge(parts), { openings: outOpen, bays: outBays });
}

/** The great lamp's bowl: a stepped stone pedestal, a brass stem, a wide shallow bowl with a rolled lip and a heap of ash in it. anchors: fire (top of the heap), rim (radius), lip (height) */
export function greatBowl({ r = 1.5, h = 1.7, metal = K6.brass, dark = K6.brassDark, stone = K6.stone, ash = K6.ash } = {}) {
  const parts = [];
  parts.push(tint(lathe([[0, 0], [r * 0.95, 0], [r * 0.95, h * 0.14], [r * 0.74, h * 0.14], [r * 0.74, h * 0.3], [r * 0.5, h * 0.3], [r * 0.5, h * 0.4], [0, h * 0.4]], 8, { crease: 30 }), stone));
  parts.push(tint(lathe([[r * 0.32, h * 0.4], [r * 0.2, h * 0.5], [r * 0.16, h * 0.7], [r * 0.3, h * 0.78], [r * 0.9, h * 0.94], [r * 1.02, h], [r * 1.0, h * 1.04], [r * 0.9, h * 1.0], [r * 0.3, h * 0.86], [0, h * 0.84]], 18, { crease: 50 }), metal));
  parts.push(tint(place(torus(r * 0.21, 0.05, 12, 5), 0, h * 0.6, 0), dark), tint(place(torus(r * 1.0, 0.055, 18, 5), 0, h * 1.02, 0), dark));
  parts.push(tint(lathe([[r * 0.86, h * 0.96], [r * 0.6, h * 1.02], [r * 0.3, h * 1.1], [0, h * 1.13]], 12, { crease: 180 }), ash));
  for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.5; parts.push(tint(place(lathe([[0.14, -0.05], [0.16, 0.06], [0.11, 0.1], [0, 0.1]], 6, { crease: 50 }), Math.cos(a) * r * 1.02, h * 0.98, Math.sin(a) * r * 1.02), dark)); }
  return keep(merge(parts), { fire: [0, h * 1.12, 0], rim: r, lip: h * 1.04 });
}

/** The hood over the lamp: a wide sooted cone and flue hanging from the roof; its mouth is at y = 0, radius r. */
export function lampHood({ r = 2.2, h = 2.6, color = K6.copper, soot = '#5a4a9a', dark = K6.copperDark } = {}) {
  const cone = gradientY(lathe([[r, 0], [r * 0.98, 0.14], [r * 0.5, h * 0.5], [r * 0.3, h * 0.66], [r * 0.3, h * 1.6]], 16, { crease: 50 }), soot, color, 0, h * 0.5);
  const inner = tint(lathe([[r * 0.3, h * 0.62], [r * 0.48, h * 0.46], [r * 0.94, 0.1], [r * 0.97, 0.0]], 16, { crease: 50 }), '#3f3a86');
  const parts = [cone, inner, tint(place(torus(r, 0.07, 16, 5), 0, 0.02, 0), dark), tint(place(torus(r * 0.32, 0.05, 12, 4), 0, h * 0.68, 0), dark)];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; parts.push(ball(0.06, Math.cos(a) * r, 0.02, Math.sin(a) * r, K6.brass, 5)); }
  return merge(parts);
}

/** One ring of the lamp's engine, in the XZ plane: a brass hoop with index studs. Tilt and turn its node. */
export function engineRing({ r = 2, tubeR = 0.06, studs = 8, metal = K6.brass, stud = K6.coral } = {}) {
  const parts = [tint(torus(r, tubeR, 28, 5), metal)];
  for (let i = 0; i < studs; i++) { const a = (i / studs) * Math.PI * 2; parts.push(ball(tubeR * 1.9, Math.cos(a) * r, 0, Math.sin(a) * r, i === 0 ? stud : K6.brassDark, 5)); }
  return merge(parts);
}

/**
 * The hopper: a big riveted funnel on legs feeding a chute that runs down toward -X (to the bowl), with its
 * counting hatch standing open on the front (+Z). Stands on y = 0. `salt` 0..1 how full it shows.
 * anchors: hatch (centre of the open hatch), mouth (end of the chute), top
 */
export function hopperChute({ h = 3.4, r = 1.0, color = K6.teal, dark = K6.tealDark, metal = K6.brass, salt = 0.4 } = {}) {
  const parts = [], y0 = h * 0.42;
  parts.push(tint(lathe([[r * 0.24, y0], [r * 0.3, y0 + 0.05], [r, h * 0.82], [r, h], [r * 0.94, h], [r * 0.94, h * 0.84], [r * 0.22, y0 + 0.12]], 8, { crease: 40 }), color));
  for (const y of [h * 0.82, h]) parts.push(tint(place(torus(r, 0.05, 8, 4), 0, y, 0, 0, 22.5, 0), metal));
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.785; parts.push(bar([Math.cos(a) * r * 0.95, 0, Math.sin(a) * r * 0.95], [Math.cos(a) * r * 0.82, h * 0.84, Math.sin(a) * r * 0.82], 0.07, dark, 5)); }
  parts.push(setGlow(tint(lathe([[r * 0.9, h * 0.86], [r * 0.5, h * (0.86 + 0.1 * salt)], [0, h * (0.88 + 0.14 * salt)]], 8, { crease: 180 }), K6.salt), 0.35));
  // the chute down toward the bowl
  parts.push(tint(tube([[0, y0 + 0.05, 0], [-r * 0.7, y0 - 0.2, 0], [-r * 2.2, y0 - 0.55, 0]], r * 0.2, 6, { crease: 50, caps: false }), dark));
  // the open hatch on the front, with the white of the salt behind it
  const hy = h * 0.66, hz = r * 0.66;
  parts.push(rb(0.62, 0.5, 0.08, 0.04, 0, hy, hz, metal, -24, 0, 0), setGlow(rb(0.46, 0.36, 0.1, 0.03, 0, hy, hz + 0.01, K6.salt, -24, 0, 0), 0.5));
  parts.push(rb(0.52, 0.42, 0.05, 0.03, 0.5, hy + 0.06, hz + 0.2, color, -24, -70, 0));
  return keep(merge(parts), { hatch: [0, hy, hz + 0.1], mouth: [-r * 2.2, y0 - 0.55, 0], top: [0, h, 0] });
}

/** A fish basket heaped with kelp-ash. */
export function ashBasket({ s = 1, wicker = K6.rope2, ash = K6.ash } = {}) {
  const parts = [tint(lathe([[0, 0], [0.22, 0], [0.3, 0.3], [0.33, 0.34], [0.27, 0.34], [0, 0.32]], 9, { crease: 40 }), wicker)];
  for (const y of [0.1, 0.22]) parts.push(tint(place(torus(0.245 + y * 0.22, 0.02, 9, 4), 0, y, 0), K6.timber));
  parts.push(tint(place(ellipsoid(0.27, 0.14, 0.27, 9, 5), 0, 0.34, 0), ash));
  for (const sx of [-1, 1]) parts.push(tint(place(torus(0.07, 0.016, 6, 4), sx * 0.33, 0.3, 0, 0, 0, 90), K6.rope));
  return scaleMesh(merge(parts), s);
}

/** A long-handled shovel standing blade down, leaning back along -Z by `lean` degrees. */
export function shovel({ len = 1.25, lean = 14 } = {}) {
  const m = merge(bar([0, 0.2, 0], [0, len, 0], 0.024, K6.timber2, 5), rb(0.24, 0.3, 0.03, 0.03, 0, 0.13, 0, K6.iron, 6, 0, 0), bar([-0.07, len, 0], [0.07, len, 0], 0.028, K6.timber2, 4));
  return place(m, 0, 0, 0, -lean, 0, 0);
}

// ------------------------------------------------------------------------------------ the half of a set that is the same in all six

/**
 * spec: { id, light, L (needs .power), low, scene, cameras, marks, actors, foreground,
 *         lamps [{ name, pos, color, radius, base, flicker?, fixed? (ignores setPower) }]   at most 6 -> env.points
 *         glows [{ sprite, base, fixed?, lamp? }]      halo sprites that follow the power
 *         house 0..1     how much of the scene key and ambient also follows setPower (rooms lit by their lamps: about 0.5)
 *         motes { box [x0, x1, y0, y1, z0, z1], every, color, size, vel, life, alpha, kind } | null
 *         tick(time, dt, pw, live, power)   the set's own animation
 *         cue(lineId) -> bool, extra { ... } }
 * setPower(p): 0..1.5. update(time, dt) allocates nothing.
 */
export function shell({ id, light, L, low = false, scene, cameras, marks, actors, foreground, lamps = [], glows = [], house = 0, motes = null, tick = null, cue = null, extra = {} }) {
  const env = scene.env, sprites = scene.sprites;
  if (lamps.length > 6) throw new Error(`${id}: ${lamps.length} fixed lamps; the limit is 6 (the engine draws 8, two stay free for carried lamps)`);
  for (const l of lamps) l.rgb = rgb(l.color);
  env.points = lamps.map((l) => ({ pos: l.pos, color: l.rgb, radius: l.radius, intensity: l.base * L.power }));
  let power = 1, lastT = -1, nextMote = 0;
  const key0 = Array.from(env.key.color), amb0 = env.ambient.amount, rnd = rng(911), P = [0, 0, 0], V0 = [0.05, 0.06, 0.02];
  const moteSpec = motes ? { kind: motes.kind || 'glow', pos: P, vel: motes.vel || V0, size: 0.07, life: motes.life || 5, color: motes.color || '#ffe6a0', alpha: motes.alpha ?? 0.8 } : null;
  function setPower(p) { power = Math.max(0, Math.min(1.5, p)); }
  function update(time, dt = 0) {
    const pw = L.power * power, live = lastT >= 0 && time - lastT < 0.5 && dt > 0;
    if (house > 0) {
      const k = 1 - house + house * (power <= 1 ? 0.45 + 0.55 * power : 1 + 0.16 * (power - 1));
      env.key.color[0] = key0[0] * k; env.key.color[1] = key0[1] * k; env.key.color[2] = key0[2] * k;
      env.ambient.amount = amb0 * (1 - house * 0.4 + house * 0.4 * Math.min(1, power));
    }
    for (let i = 0; i < lamps.length; i++) { const l = lamps[i], f = l.flicker ?? 0.05; env.points[i].intensity = l.base * (l.fixed ? L.power : pw) * (1 - f + f * Math.sin(time * (7.3 + i * 1.7) + i * 2.1) * Math.sin(time * 3.1 + i)); }
    for (let i = 0; i < glows.length; i++) { const g = glows[i]; g.sprite.alpha = g.base * Math.min(1.3, g.fixed ? L.power : pw); }
    if (tick) tick(time, dt, pw, live, power);
    if (live) {
      if (moteSpec && time > nextMote) {
        nextMote = time + motes.every; const b = motes.box;
        P[0] = b[0] + rnd() * (b[1] - b[0]); P[1] = b[2] + rnd() * (b[3] - b[2]); P[2] = b[4] + rnd() * (b[5] - b[4]);
        moteSpec.size = (motes.size || 0.07) * (0.6 + rnd() * 0.8);
        sprites.spawn(moteSpec);
      }
      sprites.update(dt);
    }
    lastT = time;
  }
  const rig = setRig(id, cameras, env);
  const set = { id, light, low, scene, env, actors, foreground: foreground || group('foreground'), cameras, frame: rig.frame, view: rig.view, marks, lamps, setPower, update, cue: cue || (() => false), task: () => null, ...extra };
  update(0, 0);
  return set;
}

/** The marks every set has: cutscene spots a, b, c, the pair `two` frames, and the stage band's party and opposition. */
export const STD_MARKS = () => ({
  a: { pos: [-0.8, 0, 0.55], face: 14 }, b: { pos: [0.02, 0, 0.8], face: 0 }, c: { pos: [0.82, 0, 0.55], face: -14 },
  two: [{ pos: [-0.42, 0, 0.62], face: 24 }, { pos: [0.42, 0, 0.62], face: -24 }],
  party: [{ pos: [-1.05, 0, 0.75], face: 78 }, { pos: [-1.85, 0, 1.15], face: 72 }, { pos: [-2.5, 0, 0.5], face: 80 }],
  opposition: [{ pos: [1.05, 0, 0.75], face: -78 }, { pos: [1.85, 0, 1.15], face: -72 }, { pos: [2.55, 0, 0.5], face: -80 }],
});

// ------------------------------------------------------------------------------------ what the live stage drives

/**
 * The chapter's content names lights by the core's six (core/stage.js LIGHTS); a set has its own. `map` is
 * { coreName: ownName }: the own name for `light`, or `light` unchanged. List Object.keys(map) in the set's exported
 * `lights` too, or app.js lightFor() never passes the core name down.
 */
export const coreLight = (light, map) => (light != null && Object.hasOwn(map, light) ? map[light] : light);

/**
 * A unit for set.task(type, index, count): what the director (stage.js buildUnits) drives with an encounter's progress.
 *   pos    where a hit lands and where the party looks (world)     stand   [x, z] where a figure goes to work at it, or null
 *   apply(v, fresh)   v 0..1 of the objective (eased by the director). fresh: the first call of an encounter, when the
 *                     set must be put in that scene's opening state (two scenes share a set).
 * EDGE-TRIGGERED on purpose. The director calls set(v) every frame, also all through the cutscene that follows (with
 * v = 1). The obvious version applies v every call, and then a set's own cue(lineId) loses to it on the next frame:
 * the vote can never be lowered again, the lamp never dropped by the line that drops it. Here the set is only
 * touched when v has moved, so once the objective is complete the script's cues own the place.
 * Call unit.arm() from task(): the next set() is then `fresh`.
 */
export function taskUnit({ pos, stand = null, apply }) {
  let last = -1, armed = true;
  return {
    pos, stand,
    arm() { armed = true; return this; },
    set(v) {
      const q = Math.round(v * 500) / 500;
      if (q === last && !armed) return;
      const fresh = armed; armed = false; last = q;
      apply(q, fresh);
    },
  };
}

/** A one-shot timer for a setback: hit() starts it, value(dt) runs it and returns 0..1..0 over `secs` (0 when idle). */
export function pulse(secs = 1.6) {
  let t = -1;
  return { hit() { t = 0; }, value(dt) { if (t < 0) return 0; t += dt; if (t >= secs) { t = -1; return 0; } return Math.sin(t / secs * Math.PI); } };
}

/** The camera marks most sets start from (portrait 0.46 for wide/two/close/low, 1.95 for the stage band, 1.6 landscape); override per set. */
export const STD_CAMERAS = (over = {}) => {
  const base = {
    wide: { target: [0.05, 1.6, -0.4], dist: 8.2, yaw: 3, pitch: 5, fov: 44, aspect: 0.46, shadowCenter: [0, 0, -1], shadowRadius: 8 },
    two: { target: [0, 1.12, 0.6], dist: 6.0, yaw: -15, pitch: 5, fov: 31, aspect: 0.46, shadowCenter: [0, 0, 0.3], shadowRadius: 3.6 },
    close: { target: [0.02, 0.86, 0.8], dist: 3.9, yaw: 21, pitch: 3, fov: 28, aspect: 0.46, shadowCenter: [0, 0, 0.5], shadowRadius: 2.6 },
    low: { target: [0.1, 1.8, 0.2], dist: 6.4, yaw: -7, pitch: -11, fov: 56, aspect: 0.46, shadowCenter: [0, 0, -1], shadowRadius: 8 },
    stage: { target: [0, 1.02, 0.5], dist: 9.4, yaw: -14, pitch: 7, fov: 24, aspect: 1.95, shadowCenter: [0, 0, -0.5], shadowRadius: 7.5, outline: 0.7 },
    landscape: { target: [0, 1.8, -1.2], dist: 10.5, yaw: 4, pitch: 5, fov: 40, aspect: 1.6, shadowCenter: [0, 0, -1.5], shadowRadius: 10.5 },
  };
  for (const k of Object.keys(over)) base[k] = { ...base[k], ...over[k] };
  return base;
};

export { crate, planks };
