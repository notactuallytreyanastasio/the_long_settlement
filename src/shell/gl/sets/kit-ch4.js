// The chapter 4 kit: Little Brand and the dark islands. Rock, rough stone, nets, boats under oars, weather.
// Same rules as kit.js (pure, one options object per builder, per-vertex colour, anchors in the builder's own
// space, chunky and a little crooked). Used by dark-village, ferry-storm, hidden-lamp, under-lane, wreck-shore.
//
// Builders (meshes unless noted)
//   crag(opts)                 a faceted rock: cave walls, reefs, sea stacks, the Maund rocks
//   stalactite(opts)           a fat drip of rock hanging from the origin
//   stoneHut(opts)             a dark-island cottage: kit house() in sea-stone and slate with every window out
//   cappedLamp(opts)           a foreclosed island light: a squat tower with a sailcloth cap lashed over its lamp room
//   netPanel(opts)             a rectangle of net hanging in the XY plane from y = 0 down, sagging
//   knotNet(opts)              the accounts of Little Brand: a herring net on a head-rope, one knotted cord a household
//   netPole(opts)              a drying pole with a crosspiece;  anchors: armL, armR, top
//   stove(opts)                a pot-bellied iron stove with a glowing door and a crooked pipe; anchors: fire, pipe
//   copperLamp(opts)           { stand, shutter } the hidden lamp: a brass burner in a rock niche and its shutter of
//                              ship's copper (hinged at the shutter's own origin); stand.anchors: flame, hinge
//   hoodedLantern(opts)        a storm lantern with a hood that can be drawn down; anchors: lamp, hook
//   longboat(opts)             a broad rowing boat lying along X with a flat sole at y = 0; anchors: staff, seats, locks
//   oar(opts)                  one oar for instancing: the lock at the origin, the blade toward -Z
//   cutter(opts)               a far ship, for a silhouette with one lamp; anchors: lamp
//   hatchCover(opts), spar(opts), kelp(opts), blanketRoll(opts), chartDesk(opts) (anchors: flame)
//   breakwater(opts)           a rough stone mole along X, top at y = h; anchors: top (points along it)
//   swell(opts)                one standing wave with a foam crest, for instancing
//   rainField(opts)            { node, update(time, dt, amount) }: slanting rain as one instanced draw
//   seaSwells(opts)            { node, update(time, amount) }: rows of swells that rise, fall and march
//   c4Shell(spec)              the tail every set here shares: rig, lamps, setPower, the returned object

import {
  m4, quat, rng, DEG, rgb,
  sphere, ellipsoid, blob, cylinder, lathe, torus, box, roundedBox, extrude, tube, curve, plane,
  merge, tint, place, deform, setGlow, setOutline, gradientY, scale as scaleMesh,
  Node, makeInstances, setInstance,
} from '../index.js';
import { PAL, wonk, house, barrel, crate, candle, setRig } from './kit.js';

/** Dark-island colours: sea-stone in blue-violet, slate, turf, weathered copper, the cold flame. */
export const C4 = {
  rock: '#8f8cf0', rockLow: '#5148c0', rockHigh: '#b8b4ff', rockWarm: '#c9a2e8', wet: '#3f47b0',
  stone: '#c2c8f4', stone2: '#a4acec', stoneDark: '#7e86d8', slate: '#5a66c8', slate2: '#6f58c4', turf: '#4fc4a0',
  shingle: ['#d8d2f0', '#b9b4e6', '#efe2d2', '#a8b4e8', '#e6c8d0'],
  copper: '#ff9a5a', verdigris: '#4fd8b0', brass: '#ffc94a', cold: '#8fe8ff', coldDeep: '#49b8f4',
  net: '#e9d6a0', netDark: '#b89a6a', kelp: '#3fb884', kelp2: '#2f9a8e', tar: '#3a3f7a', sail: '#f2e6c8',
  knots: ['#f4573f', '#ffd24a', '#35c9b5', '#ff8fb0', '#fff1d0', '#86de57'],
};

const R = (seed) => rng(Math.floor(seed * 7919) + 53);
const keep = (mesh, anchors) => { mesh.anchors = anchors; return mesh; };

// ------------------------------------------------------------------------------------ rock

/**
 * A faceted rock standing on y = 0 (its underside is buried a little), about w x h x d. Hard facets, a gradient from
 * `low` at the foot to `high` on top, and optionally a `cap` colour (turf, weed, snow of salt) on what faces up.
 */
export function crag({ w = 2, h = 2, d = 1.6, seed = 1, low = C4.rockLow, high = C4.rock, cap = null, capAt = 0.72, seg = 8, rings = 6, lumps = 1, lean = 0, facet = 14 } = {}) {
  const m = blob({ rx: w / 2, ry: h, rz: d / 2, lumps, seed, flatBottom: 0.86, seg, rings });
  deform(m, (p) => { p[1] += h * 0.1; p[0] += lean * p[1]; }, facet);
  gradientY(m, low, high, 0, h * 0.95);
  if (cap) { const c = rgb(cap), P = m.positions, C = m.colors, N = m.normals; for (let i = 0; i < P.length; i += 3) if (P[i + 1] > h * capAt && N[i + 1] > 0.55) { C[i] = c[0]; C[i + 1] = c[1]; C[i + 2] = c[2]; } }
  return m;
}

/** A stalactite hanging from the origin: `h` long, `r` at the root. */
export function stalactite({ h = 1, r = 0.3, seed = 1, low = C4.rock, high = C4.rockLow } = {}) {
  const q = R(seed), k = (q() - 0.5) * 0.3;
  const m = lathe([[0, -h], [r * 0.16, -h * 0.82], [r * 0.4, -h * 0.5], [r * 0.7, -h * 0.2], [r, 0], [0, 0]], 6, { crease: 20 });
  return gradientY(deform(m, (p) => { p[0] += k * p[1] * p[1] / h; }, 20), low, high);
}

// ------------------------------------------------------------------------------------ the dark village

/** A dark-island cottage: sea-stone walls, a slate or turf roof, shutters pulled to, no light in any window. */
export function stoneHut({ seed = 1, w = 2.8, d = 2.4, h = 2.2, roofH = 1.5, roof = null, wall = null, shutters = null, sides = 'none', door = true, lean = 0.04 } = {}) {
  const q = R(seed);
  return house({
    seed, w, d, h, roofH, floors: h > 2.6 ? 2 : 1, lit: 0, door, flowers: false, sides, lean, bulge: 0.1,
    wall: wall || [C4.stone, C4.stone2, '#d6cdf2'][Math.floor(q() * 3)], roof: roof || [C4.slate, C4.slate2, C4.turf, '#4a8fd8'][Math.floor(q() * 4)],
    trim: '#5a4a8a', shutters: shutters || ['#e86a9a', '#35c9b5', '#ffd24a', '#ff8b3d'][Math.floor(q() * 4)], plinth: C4.stoneDark,
  });
}

/**
 * A foreclosed island light: a squat striped tower whose lamp room has a sailcloth cap lashed over it. `cap: 0` leaves
 * the lamp room bare (and `lit` makes its glass glow). anchors: lamp, top
 */
export function cappedLamp({ h = 5, r = 0.95, cap = 1, lit = false, colors = [C4.stone, C4.slate], seg = 12 } = {}) {
  const parts = [], Rr = (y) => r * (1 - 0.38 * (y / h)), bands = 4;
  parts.push(tint(cylinder(r * 1.3, r * 1.15, h * 0.07, seg), C4.stoneDark));
  for (let i = 0; i < bands; i++) { const y0 = h * 0.07 + h * 0.93 * (i / bands), y1 = h * 0.07 + h * 0.93 * ((i + 1) / bands); parts.push(tint(lathe([[Rr(y0), y0], [Rr((y0 + y1) / 2) * 1.02, (y0 + y1) / 2], [Rr(y1), y1]], seg, { crease: 180 }), colors[i % 2])); }
  const tr = Rr(h), gh = h * 0.16;
  parts.push(tint(lathe([[tr, h - 0.02], [tr * 1.5, h + 0.05], [tr * 1.5, h + 0.16], [0, h + 0.16]], seg), PAL.navy));
  const glass = tint(place(cylinder(tr * 0.8, tr * 0.8, gh, 10, { caps: false }), 0, h + 0.16, 0), lit ? C4.cold : PAL.glassOff);
  parts.push(lit ? setGlow(glass, 1) : glass);
  parts.push(tint(lathe([[tr * 1.2, h + 0.16 + gh], [tr * 0.3, h + 0.16 + gh * 1.9], [0, h + 0.16 + gh * 2]], seg), PAL.navy));
  if (cap) { // the cap: a sagging bag of sailcloth over the lamp room, a rope round its neck
    parts.push(tint(wonk(place(lathe([[tr * 1.42, 0], [tr * 1.36, gh * 0.5], [tr * 1.1, gh * 1.5], [tr * 0.5, gh * 2.15], [0, gh * 2.25]], 9, { crease: 30 }), 0, h + 0.1, 0), { lean: 0.01 }), C4.sail));
    parts.push(tint(place(torus(tr * 1.4, 0.045, 10, 4), 0, h + 0.2, 0, 4, 0, 3), PAL.rope));
  }
  return keep(merge(parts), { lamp: [0, h + 0.16 + gh / 2, 0], top: [0, h + 0.16 + gh * 2.2, 0] });
}

// ------------------------------------------------------------------------------------ nets

/**
 * A net hanging in the XY plane: its head along y = 0 from -w/2 to w/2, falling to -h, the foot sagging by `sag` in
 * the middle and bellying toward +Z by `belly`. A lattice of thin strips (12 triangles each).
 */
export function netPanel({ w = 3, h = 1.6, cols = 9, rows = 5, sag = 0.2, belly = 0.12, t = 0.022, color = C4.net, floats = null } = {}) {
  const parts = [], at = (u, v) => [(u - 0.5) * w, -v * (h + sag * Math.sin(u * Math.PI)), belly * Math.sin(v * Math.PI) * Math.sin(u * Math.PI)];
  const strip = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz); return place(box(t, len, t), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, Math.atan2(dz, Math.hypot(dx, dy)) / DEG, 0, -Math.atan2(dx, dy) / DEG); };
  for (let i = 0; i <= cols; i++) for (let j = 0; j < rows; j++) { // diamonds: every cord runs corner to corner of a cell
    if (i < cols) parts.push(strip(at(i / cols, j / rows), at((i + 1) / cols, (j + 1) / rows)));
    if (i > 0) parts.push(strip(at(i / cols, j / rows), at((i - 1) / cols, (j + 1) / rows)));
  }
  const m = tint(merge(parts), color);
  if (!floats) return setOutline(m, 0.5);
  const fl = []; for (let i = 0; i <= cols; i += 2) { const p = at(i / cols, 0); fl.push(tint(place(ellipsoid(0.07, 0.05, 0.05, 6, 4), p[0], p[1] + 0.02, p[2]), floats)); }
  return merge(setOutline(m, 0.5), ...fl);
}

/**
 * The accounts of Little Brand: a herring net hung flat on a wall from a fat head-rope, and over it one cord to a
 * household, each cord knotted for every day owed (bright knots, so a household's standing can be read across a hall).
 * Hangs in the XY plane, head at y = 0, centred on X, facing +Z. anchors: cords (the top of each), centre
 */
export function knotNet({ w = 4.2, h = 2.3, cords = 13, seed = 1 } = {}) {
  const q = R(seed), parts = [place(netPanel({ w, h, cols: 11, rows: 6, sag: 0.1, belly: 0.05, color: C4.netDark }), 0, 0, 0)], tops = [];
  parts.push(tint(tube(curve([[-w / 2 - 0.25, 0.1, 0], [-w / 4, -0.03, 0.03], [0, 0.03, 0.04], [w / 4, -0.03, 0.03], [w / 2 + 0.25, 0.1, 0]], 12), 0.05, 6, { crease: 180 }), PAL.rope));
  for (let i = 0; i < cords; i++) {
    const x = -w / 2 + 0.2 + (w - 0.4) * (i / (cords - 1)), len = h * (0.55 + q() * 0.4), n = 2 + Math.floor(q() * 7), col = C4.knots[i % C4.knots.length];
    parts.push(tint(place(cylinder(0.022, 0.022, len, 5, { caps: false }), x, -len, 0.07), PAL.cream));
    for (let k = 0; k < n; k++) parts.push(tint(place(sphere(0.058, 6, 4), x + (q() - 0.5) * 0.02, -0.18 - (len - 0.3) * (k / Math.max(1, n - 1)) * (0.6 + 0.4 * q()), 0.08), col));
    parts.push(tint(place(roundedBox(0.13, 0.1, 0.03, 0.02, 1), x, -0.03, 0.07), col)); // the household's tag
    tops.push([x, 0, 0.08]);
  }
  return keep(merge(parts), { cords: tops, centre: [0, -h / 2, 0.1] });
}

/** A drying pole: a crooked post with a crosspiece. anchors: armL, armR, top */
export function netPole({ h = 2.6, arm = 0.7, seed = 1, color = '#8a5a4a' } = {}) {
  const q = R(seed), lx = (q() - 0.5) * 0.24;
  const m = merge(
    tint(tube(curve([[0, 0, 0], [lx * 0.6, h * 0.5, 0], [lx, h, 0]], 6), (t) => 0.08 - 0.03 * t, 6, { crease: 180 }), color),
    tint(place(cylinder(0.035, 0.03, arm * 2, 5), lx - arm, h - 0.2, 0, 0, 0, -90 + (q() - 0.5) * 10), color),
    tint(place(cylinder(0.15, 0.12, 0.16, 7), 0, 0, 0), C4.stoneDark));
  return keep(m, { armL: [lx - arm, h - 0.2, 0], armR: [lx + arm, h - 0.2, 0], top: [lx, h, 0] });
}

// ------------------------------------------------------------------------------------ fire and lamps

/** A pot-bellied iron stove on three feet, door toward +Z, a crooked pipe going up `pipe` high. anchors: fire (the door), pipe (its top), top (the hob) */
export function stove({ h = 1.0, r = 0.36, pipe = 3.2, color = '#4a4f9a', lit = true } = {}) {
  const parts = [];
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + 0.5; parts.push(tint(place(cylinder(0.05, 0.035, 0.2, 5), Math.cos(a) * r * 0.75, 0, Math.sin(a) * r * 0.75, Math.sin(a) * 14, 0, -Math.cos(a) * 14), color)); }
  parts.push(tint(lathe([[0, 0.16], [r * 0.72, 0.16], [r * 1.0, h * 0.38], [r * 1.04, h * 0.55], [r * 0.86, h * 0.86], [r * 0.9, h * 0.92], [r * 0.9, h], [0, h]], 12, { crease: 50 }), color));
  parts.push(tint(place(torus(r * 1.03, 0.03, 12, 4), 0, h * 0.5, 0), PAL.navy));
  const door = tint(place(roundedBox(r * 0.86, h * 0.28, 0.06, 0.04, 1), 0, h * 0.5, r * 0.98), lit ? '#ffb040' : PAL.navy);
  parts.push(lit ? setGlow(door, 1) : door);
  for (const x of [-0.11, 0, 0.11]) parts.push(tint(place(box(0.03, h * 0.3, 0.04), x * r * 2.4, h * 0.5, r * 1.02), PAL.navy));
  parts.push(tint(place(roundedBox(r * 1.06, h * 0.36, 0.05, 0.03, 1), 0, h * 0.5, r * 0.94), PAL.navy));
  parts.push(tint(tube(curve([[0, h, -r * 0.3], [0.02, h + pipe * 0.4, -r * 0.3], [-0.1, h + pipe * 0.55, -r * 0.5], [-0.12, h + pipe, -r * 0.5]], 8), 0.1, 7, { crease: 180 }), color));
  parts.push(tint(place(cylinder(0.16, 0.13, 0.1, 8), -0.12, h + pipe - 0.04, -r * 0.5), PAL.navy));
  parts.push(tint(place(lathe([[0, 0], [0.16, 0], [0.19, 0.1], [0.15, 0.2], [0.07, 0.24], [0, 0.24]], 8, { crease: 50 }), r * 0.3, h, r * 0.2), C4.copper)); // the kettle
  return keep(merge(parts), { fire: [0, h * 0.5, r * 1.05], pipe: [-0.12, h + pipe + 0.1, -r * 0.5], top: [0, h, 0] });
}

/**
 * The hidden lamp of Little Brand. `stand` is a brass burner on a rough stone footing, the flame's seat at anchors.flame;
 * `shutter` is a curved plate of old ship's copper gone green, its hinge on its own origin (it hangs toward +X from the
 * hinge, standing in front of the flame, and swings open about Y). Put the shutter node at stand.anchors.hinge.
 */
export function copperLamp({ s = 1 } = {}) {
  const parts = [];
  parts.push(tint(lathe([[0, 0], [0.3, 0], [0.32, 0.06], [0.2, 0.12], [0.08, 0.16], [0.07, 0.34], [0.17, 0.4], [0.2, 0.46], [0, 0.46]], 10, { crease: 50 }), C4.brass));
  parts.push(tint(place(torus(0.2, 0.025, 10, 4), 0, 0.46, 0), '#e0932e'));
  // a cage of three brass ribs over the burner, and a little chimney cap
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 + 2.1; parts.push(tint(tube(curve([[Math.cos(a) * 0.19, 0.46, Math.sin(a) * 0.19], [Math.cos(a) * 0.24, 0.72, Math.sin(a) * 0.24], [Math.cos(a) * 0.1, 0.96, Math.sin(a) * 0.1]], 6), 0.018, 4, { crease: 180 }), C4.brass)); }
  parts.push(tint(place(lathe([[0.16, 0], [0.1, 0.07], [0.03, 0.1], [0, 0.16]], 8, { crease: 50 }), 0, 0.95, 0), C4.brass));
  const stand = keep(scaleMesh(merge(parts), s), { flame: [0, 0.5 * s, 0], hinge: [-0.36 * s, 0.34 * s, 0.1 * s], top: [0, 1.1 * s, 0] });
  // the shutter: a quarter-round of plate, riveted, patched with verdigris
  const plate = [], n = 6, rad = 0.4, ph = 0.82;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * 100 * DEG, a1 = ((i + 1) / n) * 100 * DEG, am = (a0 + a1) / 2, wd = 2 * rad * Math.sin((a1 - a0) / 2) + 0.012;
    plate.push(tint(place(box(wd, ph, 0.03), rad - Math.cos(am) * rad, ph / 2, Math.sin(am) * rad * 0.9, 0, 90 - am / DEG, 0), i % 3 === 1 ? C4.verdigris : C4.copper));
  }
  for (const y of [0.04, ph - 0.04]) plate.push(tint(place(box(0.74, 0.05, 0.035), 0.36, y, 0.26, 0, 32, 0), '#d9703a'));
  plate.push(tint(place(cylinder(0.03, 0.03, ph + 0.1, 5), 0, -0.05, 0), C4.brass));
  return { stand, shutter: scaleMesh(merge(plate), s) };
}

/**
 * A storm lantern hanging from its hook at the origin: iron frame, glowing glass (white: tint the node), a ring handle,
 * and a hood skirt covering the top `hood` (0..1) of the glass. anchors: lamp (centre of the glass)
 */
export function hoodedLantern({ s = 1, hood = 0.6, lit = true, color = PAL.iron, hoodColor = C4.tar } = {}) {
  const parts = [];
  parts.push(tint(place(torus(0.07, 0.014, 8, 4), 0, -0.07, 0, 90, 0, 0), color));
  parts.push(tint(place(lathe([[0, 0], [0.17, -0.02], [0.2, -0.1], [0.12, -0.12], [0, -0.12]], 8, { crease: 50 }), 0, -0.12, 0), color));
  const g = tint(place(lathe([[0.1, 0], [0.135, 0.1], [0.135, 0.22], [0.1, 0.3]], 8, { crease: 180 }), 0, -0.56, 0), lit ? '#ffffff' : PAL.glassOff);
  parts.push(lit ? setGlow(g, 1) : g);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; parts.push(tint(place(cylinder(0.012, 0.012, 0.32, 4, { caps: false }), Math.cos(a) * 0.14, -0.57, Math.sin(a) * 0.14), color)); }
  parts.push(tint(place(cylinder(0.16, 0.13, 0.07, 8), 0, -0.63, 0), color));
  if (hood > 0) parts.push(tint(place(cylinder(0.2, 0.17, 0.3 * hood + 0.02, 8, { caps: false }), 0, -0.26 - 0.3 * hood, 0), hoodColor));
  return keep(scaleMesh(merge(parts), s), { lamp: [0, -0.42 * s, 0], foot: [0, -0.63 * s, 0] });
}

// ------------------------------------------------------------------------------------ boats

/**
 * A broad, flat-soled rowing boat lying along X (bow toward +X), big enough to stand a scene in: its sole (the boards
 * people stand on) is at y = 0 from x -len/2+0.9 to len/2-1.1 and z -beam/2+0.3 to beam/2-0.3; the gunwale is `side`
 * above it. Thwarts run along the far side only (z < 0), so the near strip is clear to stand on.
 * anchors: staff (the head of the bow staff, where the lantern hangs), bow, stern, seats [[x, y, z]...] (rowers, far side),
 *          locks [[x, y, z]...] (oar locks on the far gunwale), nearLocks (near gunwale), mast
 */
export function longboat({ len = 8.4, beam = 3.1, side = 0.5, hull = '#f2e6c8', keel = PAL.teal, band = PAL.coral, trim = PAL.wood, seats = 4, seed = 1, staff = 2.3 } = {}) {
  const q = R(seed), parts = [], hl = len / 2, hb = beam / 2;
  const halfAt = (x) => { const t = Math.abs(x) / hl; return hb * Math.pow(Math.max(0, 1 - Math.pow(t, 2.6)), 0.55); };
  const sheer = (x) => { const t = x / hl; return side + 0.34 * t * t * (t > 0 ? 1.5 : 1); };
  // planking: two strakes a side, as strips between stations
  const N = 14, st = []; for (let i = 0; i <= N; i++) st.push(-hl + len * (i / N));
  const seg3 = (a, b, r, c) => tint(tube([a, b], r, 5, { crease: 180 }), c);
  for (const sz of [-1, 1]) for (let i = 0; i < N; i++) {
    const x0 = st[i], x1 = st[i + 1], xm = (x0 + x1) / 2, w0 = halfAt(x0), w1 = halfAt(x1), wm = (w0 + w1) / 2, ln = Math.hypot(x1 - x0, w1 - w0) + 0.03, yaw = Math.atan2(-(w1 - w0) * sz, x1 - x0) / DEG;
    const top = sheer(xm);
    parts.push(tint(place(box(ln, top * 0.56 + 0.3, 0.07), xm, top * 0.72 - 0.15, sz * (wm + 0.0), sz * -9, yaw, 0), hull));
    parts.push(tint(place(box(ln, 0.42, 0.075), xm, -0.34, sz * (wm - 0.1), sz * -24, yaw, 0), keel));
    if (band) parts.push(tint(place(box(ln, 0.11, 0.085), xm, top - 0.13, sz * (wm + 0.012), sz * -9, yaw, 0), band));
    parts.push(seg3([x0, sheer(x0) + 0.02, sz * (w0 + 0.03)], [x1, sheer(x1) + 0.02, sz * (w1 + 0.03)], 0.055, trim));
  }
  // the sole: boards fore and aft
  for (let k = 0; k < 7; k++) { const z = -hb + 0.32 + (beam - 0.64) * ((k + 0.5) / 7); parts.push(tint(place(box(len - 1.7, 0.08, (beam - 0.64) / 7 - 0.02), -0.1 + (q() - 0.5) * 0.1, -0.04 + (q() - 0.5) * 0.012, z), k % 2 ? '#e2a35e' : '#d08a4a')); }
  parts.push(tint(place(box(len - 0.9, 0.5, beam * 0.5), 0, -0.36, 0), keel));
  // stem and stern posts
  parts.push(tint(tube(curve([[hl - 0.5, -0.5, 0], [hl - 0.05, 0.3, 0], [hl + 0.12, sheer(hl) + 0.45, 0]], 8), 0.09, 6, { crease: 180 }), trim));
  parts.push(tint(tube(curve([[-hl + 0.4, -0.5, 0], [-hl + 0.02, 0.3, 0], [-hl - 0.06, sheer(-hl) + 0.3, 0]], 8), 0.08, 6, { crease: 180 }), trim));
  // thwarts on the far side, a stern sheet, and the locks
  const seatsAt = [], locks = [], nearLocks = [];
  for (let i = 0; i < seats; i++) {
    const x = -hl + 1.95 + (len - 4.5) * (i / Math.max(1, seats - 1));
    parts.push(tint(place(roundedBox(0.34, 0.07, hb - 0.5, 0.02, 1), x, 0.34, -hb * 0.5 - 0.12, 0, (q() - 0.5) * 4, 0), '#e2a35e'));
    parts.push(tint(place(box(0.06, 0.34, 0.06), x, 0.17, -0.42), trim));
    seatsAt.push([x, 0.37, -hb * 0.62]);
    for (const sz of [-1, 1]) {
      const lx = x + 0.38, p = [lx, sheer(lx) + 0.08, sz * (halfAt(lx) + 0.03)];
      parts.push(tint(place(cylinder(0.03, 0.03, 0.16, 5), p[0] - 0.07, p[1] - 0.08, p[2]), PAL.iron), tint(place(cylinder(0.03, 0.03, 0.16, 5), p[0] + 0.07, p[1] - 0.08, p[2]), PAL.iron));
      (sz < 0 ? locks : nearLocks).push(p);
    }
  }
  parts.push(tint(place(roundedBox(0.9, 0.07, beam * 0.62, 0.02, 1), -hl + 0.75, 0.36, 0), '#e2a35e'));
  // the bow staff: a crooked pole with a little arm to hang the lantern from
  const sx = hl - 0.75, top = [sx + 0.12, staff, 0], hook = [sx - 0.3, staff - 0.08, 0];
  if (staff > 0) {
    parts.push(tint(tube(curve([[sx, 0, 0], [sx - 0.04, staff * 0.5, 0], top], 6), (t) => 0.06 - 0.02 * t, 6, { crease: 180 }), trim));
    parts.push(tint(tube(curve([top, [sx - 0.1, staff + 0.08, 0], hook], 6), 0.025, 5, { crease: 180 }), PAL.iron));
  }
  return keep(merge(parts), { staff: hook, bow: [hl + 0.12, sheer(hl) + 0.45, 0], stern: [-hl - 0.06, sheer(-hl) + 0.3, 0], seats: seatsAt, locks, nearLocks, side });
}

/** One oar for instancing: the lock at the origin, the loom running to +Z (inboard, 0.9) and the blade out to -Z (`len`). White-ish: tint per instance. */
export function oar({ len = 2.6, color = '#f0d9a8', blade = '#fff1d0' } = {}) {
  return merge(tint(place(cylinder(0.035, 0.03, len + 0.9, 5), 0, 0, 0.9, -90, 0, 0), color), tint(place(roundedBox(0.2, 0.035, 0.7, 0.015, 1), 0, 0, -len - 0.25), blade));
}

/** A far cutter for a silhouette: a dark sharp hull, one mast with a furled yard, a lamp at the masthead. Bow toward +X, waterline y = 0, about `len` long. anchors: lamp */
export function cutter({ len = 16, hull = '#2a3a8a', sail = '#5a6ad0' } = {}) {
  const hl = len / 2, parts = [];
  parts.push(tint(extrude([[-hl, 0.2], [-hl + 0.6, 1.5], [hl * 0.6, 1.2], [hl + 0.6, 1.9], [hl * 0.72, -0.2], [-hl + 1.2, -0.2]], len * 0.16, { bevel: 0.2 }), hull));
  parts.push(tint(place(box(len * 0.3, 0.9, len * 0.1), -hl * 0.2, 1.8, 0), '#3a4aa0'));
  parts.push(tint(place(cylinder(0.14, 0.08, len * 0.62, 6), hl * 0.12, 1.2, 0, 0, 0, -3), hull));
  parts.push(tint(place(extrude([[0, 0], [len * 0.3, 0.4], [len * 0.02, len * 0.42]], 0.06), hl * 0.14, 2.6, 0), sail));
  parts.push(tint(place(extrude([[0, 0], [-len * 0.2, 0.3], [-len * 0.01, len * 0.34]], 0.06), hl * 0.1, 2.6, 0), sail));
  return keep(setOutline(merge(parts), 0.6), { lamp: [hl * 0.12 - 0.3, 1.2 + len * 0.62, 0], bow: [hl, 2.4, 0] });
}

// ------------------------------------------------------------------------------------ flotsam and comforts

/** The hatch cover three people came ashore on: a square of planks on battens with a rope becket, lying on y = 0. */
export function hatchCover({ s = 1.5, seed = 1 } = {}) {
  const q = R(seed), parts = [], n = 5, pw = s / n;
  for (let i = 0; i < n; i++) parts.push(tint(place(roundedBox(pw - 0.02, 0.09, s + (q() - 0.5) * 0.08, 0.02, 1), -s / 2 + pw * (i + 0.5), 0.1, 0), i % 2 ? PAL.wood : PAL.wood2));
  for (const z of [-s * 0.3, s * 0.3]) parts.push(tint(place(box(s + 0.06, 0.07, 0.14), 0, 0.035, z), PAL.woodDark));
  parts.push(tint(place(torus(0.13, 0.03, 8, 4), s * 0.2, 0.17, s * 0.1, 0, 0, 0), PAL.rope));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(tint(place(box(0.14, 0.03, 0.14), x * (s / 2 - 0.09), 0.15, z * (s / 2 - 0.09)), PAL.iron));
  return merge(parts);
}

/** A broken spar with a rag of sail and a trailing rope, lying along X on y = 0. */
export function spar({ len = 3.2 } = {}) {
  return merge(
    tint(place(cylinder(0.09, 0.06, len, 6), -len / 2, 0.09, 0, 0, 0, -90), PAL.woodDark),
    tint(place(extrude([[0, 0], [len * 0.42, 0.02], [len * 0.36, -0.46], [len * 0.1, -0.3], [0.04, -0.5]], 0.02, { crease: 30 }), -len * 0.3, 0.12, 0.06, 78, 0, 0), C4.sail),
    tint(tube(curve([[len * 0.4, 0.1, 0], [len * 0.52, 0.03, 0.3], [len * 0.44, 0.03, 0.7], [len * 0.6, 0.03, 0.95]], 8), 0.025, 4, { crease: 180 }), PAL.rope));
}

/** A heap of wrack: flat fronds of weed lying on y = 0, about `s` across. */
export function kelp({ s = 0.7, seed = 1, color = C4.kelp } = {}) {
  const q = R(seed), parts = [];
  for (let i = 0; i < 5; i++) { const a = q() * 360, l = s * (0.5 + q() * 0.6); parts.push(tint(place(extrude([[0, 0], [l * 0.3, 0.09], [l * 0.7, 0.05], [l, 0], [l * 0.6, -0.07], [l * 0.25, -0.08]], 0.02, { crease: 30 }), (q() - 0.5) * s * 0.3, 0.02 + i * 0.012, (q() - 0.5) * s * 0.3, 90, a, 0), i % 2 ? color : C4.kelp2)); }
  return setOutline(merge(parts), 0.6);
}

/** A rolled blanket with a strap. */
export function blanketRoll({ color = PAL.coral, stripe = PAL.cream, len = 0.6 } = {}) {
  return merge(tint(place(cylinder(0.14, 0.14, len, 9), -len / 2, 0.14, 0, 0, 0, -90), color), tint(place(cylinder(0.146, 0.146, len * 0.16, 9), -len * 0.08, 0.14, 0, 0, 0, -90), stripe), tint(place(torus(0.147, 0.016, 9, 4), len * 0.25, 0.14, 0, 0, 0, 90), PAL.woodDark));
}

/** A sea-chest for a desk: charts unrolled and held with stones, a quill, a candle in a dish. anchors: flame, top */
export function chartDesk({ w = 1.1, h = 0.62, lit = true } = {}) {
  const parts = [place(crate({ s: h, seed: 7, color: '#c8643e', trim: '#8e3a3a' }), -w * 0.22, 0, 0, 0, 6, 0), place(crate({ s: h * 0.98, seed: 9, color: PAL.wood2 }), w * 0.24, 0, 0.02, 0, -5, 0)];
  parts.push(tint(place(roundedBox(w + 0.25, 0.05, h + 0.12, 0.02, 1), 0, h + 0.03, 0, 0, 2, 0), PAL.wood));
  parts.push(tint(place(box(0.66, 0.012, 0.46), -0.12, h + 0.062, 0.02, 0, 8, 0), '#fff4d2'), tint(place(box(0.5, 0.012, 0.36), 0.2, h + 0.07, -0.06, 0, -14, 0), '#dff0ff'));
  parts.push(tint(place(cylinder(0.04, 0.04, 0.5, 6), -0.4, h + 0.1, -0.22, 0, 20, -90), '#fff4d2'));
  for (const [x, z] of [[-0.4, 0.2], [0.14, 0.2]]) parts.push(tint(place(ellipsoid(0.05, 0.03, 0.04, 6, 4), x, h + 0.085, z), C4.rock));
  const c = candle({ h: 0.2, lit }); parts.push(place(c, 0.48, h + 0.055, 0.14));
  return keep(merge(parts), { flame: [0.48 + c.anchors.flame[0], h + 0.055 + c.anchors.flame[1], 0.14], top: [0, h + 0.06, 0] });
}

// ------------------------------------------------------------------------------------ stone at the water

/**
 * A breakwater: a mole of rough blocks lying along X, centred, `h` high with a flat walkable top `w` wide, its sides
 * battered and its seaward face (-Z) stepped with fallen blocks. anchors: top [[x, h, 0]...]
 */
export function breakwater({ len = 14, h = 1.9, w = 2.2, seed = 1, block = 1.1 } = {}) {
  const q = R(seed), parts = [], cols = [C4.stone, C4.stone2, C4.stoneDark, '#b4a8e8'], n = Math.round(len / block), bw = len / n, rows = Math.max(2, Math.round(h / 0.62)), rh = h / rows, top = [];
  for (let k = 0; k < rows; k++) for (let i = 0; i < n + (k % 2); i++) {
    const x = -len / 2 + bw * (i + (k % 2 ? 0 : 0.5)), batter = (rows - 1 - k) * 0.16;
    parts.push(tint(place(roundedBox(bw - 0.04, rh - 0.03, w + batter * 2 + (q() - 0.5) * 0.12, 0.07, 1), x, rh * (k + 0.5), (q() - 0.5) * 0.06, 0, (q() - 0.5) * 3, 0), cols[Math.floor(q() * cols.length)]));
  }
  for (let i = 0; i < n; i++) { // capstones, and weed where the tide reaches
    const x = -len / 2 + bw * (i + 0.5);
    parts.push(tint(place(roundedBox(bw - 0.03, 0.16, w + 0.14, 0.05, 1), x, h + 0.02 + (q() - 0.5) * 0.03, 0, 0, (q() - 0.5) * 2, (q() - 0.5) * 1.5), i % 2 ? C4.stone : '#d6cdf2'));
    top.push([x, h + 0.1, 0]);
    if (q() > 0.45) parts.push(tint(place(roundedBox(bw * 0.7, 0.3, 0.06, 0.03, 1), x + (q() - 0.5) * 0.3, 0.22 + q() * 0.2, w / 2 + (rows - 1) * 0.16 + 0.02), q() > 0.5 ? C4.kelp : C4.kelp2));
  }
  return keep(merge(parts), { top });
}

// ------------------------------------------------------------------------------------ weather

/**
 * One standing wave for instancing: a hump about 6 wide (X), 1 high, 2.4 deep, its crest curling toward +Z with a cap
 * of foam. Sits on y = 0. Scale Y per instance to make it stand up and lie down.
 */
export function swell({ deep = '#2038a8', mid = '#2f6fd8', lit = '#49c8d8', foam = '#f4fbff' } = {}) {
  const body = deform(sphere(1, 12, 6), (p) => {
    const t = Math.max(0, p[1]), u = p[0];
    p[0] *= 3; p[2] = p[2] * (1.15 - 0.5 * t) + t * t * 0.5; p[1] = Math.pow(t, 0.8) * (1 - 0.3 * u * u);
  }, 34);
  gradientY(body, deep, mid, 0, 0.6);
  { const c = rgb(lit), C = body.colors, P = body.positions; for (let i = 0; i < P.length; i += 3) if (P[i + 1] > 0.55 && P[i + 2] > 0.1) { C[i] = c[0]; C[i + 1] = c[1]; C[i + 2] = c[2]; } }
  // the crest: a thin broken line of foam along the top, and a few gobs of it sliding down the face
  const crest = []; for (const [x0, x1] of [[-2.2, -0.9], [-0.6, 0.7], [1.0, 2.1]]) crest.push(tube(curve([[x0, 0.97 * (1 - 0.3 * (x0 / 3) ** 2), 0.52], [(x0 + x1) / 2, 1.03 * (1 - 0.3 * ((x0 + x1) / 6) ** 2), 0.6], [x1, 0.97 * (1 - 0.3 * (x1 / 3) ** 2), 0.52]], 5), (t) => 0.05 + 0.06 * Math.sin(t * Math.PI), 5, { crease: 180 }));
  for (const [x, y, s] of [[-1.5, 0.62, 0.16], [0.3, 0.7, 0.2], [1.6, 0.55, 0.14]]) crest.push(place(blob({ rx: s * 1.6, ry: s * 0.5, rz: s, lumps: 0.6, seed: x + 3, seg: 6, rings: 4 }), x, y, 0.86 - y * 0.2));
  return setOutline(merge(body, setGlow(tint(merge(crest), foam), 0.5)), 0.7);
}

/**
 * Rows of swells that rise, fall and march toward the camera: one instanced draw (plus its outline).
 *   rows [{ z, n, span, size, speed }]: each row is `n` swells spread over `span` along X at depth z
 * update(time, amount): amount 0 is a flat calm (they sink out of sight), 1 a gale. `level` is the water's y.
 */
export function seaSwells({ rows, material, level = 0, seed = 1, colors = {} }) {
  const q = R(seed), list = [];
  for (const row of rows) for (let i = 0; i < row.n; i++) list.push({ x: -row.span / 2 + row.span * ((i + 0.5) / row.n) + (q() - 0.5) * row.span / row.n * 0.5, z: row.z + (q() - 0.5) * 1.5, s: row.size * (0.8 + q() * 0.4), ph: q() * 6.283, sp: row.speed || 1, yaw: (q() - 0.5) * 16 });
  const n = new Node('swells', { mesh: swell(colors), material }); n.castShadow = false;
  n.instances = makeInstances(list.length); n.instances.count = list.length;
  const Q = quat.create(), S3 = [1, 1, 1], P = [0, 0, 0], Mx = m4.create();
  return {
    node: n, list,
    update(time, amount = 1) {
      const d = n.instances.data;
      for (let i = 0; i < list.length; i++) {
        const w = list[i], cyc = (time * 0.22 * w.sp + w.ph / 6.283) % 1, up = Math.sin(cyc * Math.PI);
        P[0] = w.x + Math.sin(time * 0.3 + w.ph) * 0.4; P[1] = level - 0.12; P[2] = w.z + (cyc - 0.5) * 3.2 * w.s * 0.5;
        quat.fromEuler(Q, 0, w.yaw * DEG, Math.sin(time * 0.7 + w.ph) * 0.05 * amount);
        S3[0] = w.s; S3[1] = Math.max(0.02, w.s * up * (0.12 + 0.62 * amount) * (0.75 + 0.25 * Math.sin(time * 0.5 + w.ph * 2))); S3[2] = w.s;
        m4.fromTRS(Mx, P, Q, S3); d.set(Mx, i * 20);
      }
      n.instances.dirty = true;
    },
  };
}

/**
 * Slanting rain as one instanced draw: `count` bright streaks falling through a box `area` [w, h, d] centred on `at`.
 * update(time, dt, amount): amount 0..1 is how many of them are showing.
 */
export function rainField({ count = 110, area = [14, 8, 10], at = [0, 4, -2], material, wind = [-3.2, -13, 1.2], color = '#cfe6ff', len = 0.9, seed = 1 }) {
  const q = R(seed), drops = [];
  for (let i = 0; i < count; i++) drops.push({ x: q(), y: q(), z: q(), sp: 0.8 + q() * 0.5 });
  const n = new Node('rain', { mesh: setGlow(setOutline(tint(place(box(0.015, len, 0.015), 0, len / 2, 0), color), 0), 0.75), material }); n.castShadow = false;
  n.instances = makeInstances(count); n.instances.count = count;
  const Q = quat.create(), S3 = [1, 1, 1], P = [0, 0, 0], Mx = m4.create();
  quat.fromEuler(Q, Math.atan2(wind[2], -wind[1]), 0, Math.atan2(wind[0], -wind[1]) * -1);
  const T = area[1] / -wind[1];
  return {
    node: n,
    update(time, dt, amount = 1) {
      const d = n.instances.data, show = Math.round(count * Math.max(0, Math.min(1, amount)));
      for (let i = 0; i < show; i++) {
        const r = drops[i], f = (time * r.sp / T + r.y) % 1, fall = f * area[1];
        P[0] = at[0] + (r.x - 0.5) * area[0] + wind[0] / -wind[1] * fall; P[1] = at[1] + area[1] / 2 - fall; P[2] = at[2] + (r.z - 0.5) * area[2] + wind[2] / -wind[1] * fall;
        S3[1] = r.sp; m4.fromTRS(Mx, P, Q, S3); d.set(Mx, i * 20);
      }
      n.instances.count = show; n.instances.dirty = true; n.visible = show > 0;
    },
  };
}

// ------------------------------------------------------------------------------------ set scaffolding

export const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
/** A direction from compass az (0 = straight away from the camera, + = right) and elevation, both degrees. */
export const dirFrom = (azDeg, elDeg) => [Math.sin(azDeg * DEG) * Math.cos(elDeg * DEG), Math.sin(elDeg * DEG), -Math.cos(azDeg * DEG) * Math.cos(elDeg * DEG)];

/** The camera marks every set starts from (portrait 0.46 for the four cutscene marks, 1.95 for the live band). Override per set. */
export const CAMS = {
  wide: { target: [0.1, 1.55, -0.4], dist: 8.2, yaw: 3, pitch: 5, fov: 44, aspect: 0.46, shadowCenter: [0, 0, -1.2], shadowRadius: 8 },
  two: { target: [0, 1.12, 0.6], dist: 6.0, yaw: -15, pitch: 5, fov: 31, aspect: 0.46, shadowCenter: [0, 0, 0.3], shadowRadius: 3.6 },
  close: { target: [0.02, 0.86, 0.8], dist: 3.9, yaw: 21, pitch: 3, fov: 28, aspect: 0.46, shadowCenter: [0, 0, 0.5], shadowRadius: 2.6 },
  low: { target: [0.1, 1.75, 0.2], dist: 6.4, yaw: -7, pitch: -11, fov: 56, aspect: 0.46, shadowCenter: [0, 0, -1], shadowRadius: 8 },
  stage: { target: [0, 1.02, 0.5], dist: 9.4, yaw: -15, pitch: 7, fov: 24, aspect: 1.95, shadowCenter: [0, 0, -0.5], shadowRadius: 7.5, outline: 0.7 },
  landscape: { target: [0, 1.7, -1.2], dist: 10.5, yaw: 4, pitch: 5, fov: 40, aspect: 1.6, shadowCenter: [0, 0, -1.5], shadowRadius: 10.5 },
};
export const cams = (over = {}) => { const out = {}; for (const k of Object.keys(CAMS)) out[k] = { ...CAMS[k], ...(over[k] || {}) }; return out; };

/** The marks every set starts from: a, b, c left to right; two; party at left and opposition at right of the band. */
export const MARKS4 = {
  a: { pos: [-0.8, 0, 0.55], face: 14 }, b: { pos: [0.02, 0, 0.8], face: 0 }, c: { pos: [0.82, 0, 0.55], face: -14 },
  two: [{ pos: [-0.42, 0, 0.62], face: 24 }, { pos: [0.42, 0, 0.62], face: -24 }],
  party: [{ pos: [-1.05, 0, 0.75], face: 78 }, { pos: [-1.85, 0, 1.15], face: 72 }, { pos: [-2.5, 0, 0.5], face: 80 }],
  opposition: [{ pos: [1.05, 0, 0.75], face: -78 }, { pos: [1.85, 0, 1.15], face: -72 }, { pos: [2.55, 0, 0.5], face: -80 }],
};

/**
 * The tail of build(): wires the camera rig and the lamp list into the object a set returns.
 *   spec { id, light, low, scene, actors, foreground, cameras, marks, lamps [{ name, pos, color, radius, base }], lampPower (the light state's),
 *          update(time, dt, pw, power), extra {} }
 * env.points is made from `lamps`; update() is called with pw = lampPower * power after the lamps' intensities are set
 * (each lamp flickers a little unless it has `steady`; `own` lamps ignore the table's power; set a lamp's `k` to scale it from update). Returns the set.
 */
export function c4Shell({ id, light, low, scene, actors, foreground, cameras, marks, lamps, lampPower = 1, update, extra = {} }) {
  const env = scene.env;
  env.points = lamps.map((l) => ({ pos: l.pos, color: rgb(l.color), radius: l.radius, intensity: l.base * lampPower }));
  let power = 1;
  const rig = setRig(id, cameras, env);
  const set = {
    id, light, low, scene, env, actors, foreground, cameras, frame: rig.frame, view: rig.view, marks, lamps,
    setPower(p) { power = Math.max(0, Math.min(1.5, p)); },
    get power() { return power; },
    task: () => null, cue: () => false,
    update(time, dt = 0) {
      const pw = lampPower * power;
      for (let i = 0; i < lamps.length; i++) { const l = lamps[i]; env.points[i].intensity = l.base * (l.k == null ? 1 : l.k) * (l.own ? 1 : pw) * (l.steady ? 1 : 0.94 + 0.06 * Math.sin(time * (7.3 + i * 1.7) + i * 2.1) * Math.sin(time * 4.1 + i)); }
      update(time, dt, pw, power);
    },
    ...extra,
  };
  set.update(0, 0);
  return set;
}
