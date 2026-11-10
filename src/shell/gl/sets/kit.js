// The set kit: chunky, slightly crooked prop builders that every 3D set is assembled from.
// Pure (no GL, no DOM): each builder returns a coloured mesh from ../mesh.js, so it runs under node.
//
// Conventions
//   - Units are about metres; a chibi figure is about 1.1 tall. +Y up. Props stand on y = 0 with
//     their footprint centred on the origin and their "front" toward +Z, unless a builder says otherwise.
//   - Every builder takes one options object; `seed` changes the crookedness, never the size.
//   - A builder that has useful attachment points returns them as `mesh.anchors`, a plain object of
//     [x, y, z] points in the builder's own space. Use anchorAt(mesh, name, pos, yawDeg, scale) to
//     get one in set space after you have decided where the prop goes. (Anchors do not follow
//     place()/transform(); they are read before or computed with anchorAt.)
//   - Colour is per vertex. Crisp colour changes are separate parts (stripes are separate strips).
//   - Lamp glass, lit windows and paper lanterns carry per-vertex glow, so they stay bright in shadow.
//   - Budget: a prop is a few hundred to about 2500 triangles. Put everything that never moves under
//     one group and bake it with mergeStatic(); use makeInstances() for anything repeated more than
//     about six times (lanterns, cobbles, gulls, clouds).
//
// Builders
//   wonk(mesh, opts)                 lean / bulge / twist a finished prop so nothing is square
//   awning(opts)                     striped, sagging canopy with a scalloped hem
//   stall(opts)                      market stall: posts, counter, awning, goods, sign
//   paperLantern(opts)               a hanging paper lantern (origin at its hook); white, tint per instance
//   lanternString(a, b, opts)        a sagging wire between two points: { wire, hooks }
//   bunting(a, b, opts)              a sagging line of little flags
//   crate, barrel, sack, bollard, ropeCoil
//   boat(opts)                       a tubby harbour boat with a stubby mast
//   house(opts)                      a house with a wonky sagging roof, lit windows, a leaning chimney
//   lighthouse(opts), lampPost(opts), pole(opts)
//   tree, bush, rock, headland
//   cloud(opts)                      one chunky flat-bottomed cumulus (see cloudBank for a whole sky)
//   cloudBank(opts)                  instanced clouds placed in an arc: { node, update(time) }
//   gull()                           a tiny two-wing bird for instancing
//   quayEdge(opts)                   coping stones and a block wall dropping to the water
//   cobble()                         one flat paving stone for instancing
//   mannequin(opts)                  a stand-in chibi figure, for judging scale and light before the cast arrives
//   kitMaterials()                   the handful of materials a set needs
//   scatter(node, capacity, fn)      fill a node's instances from a callback

import {
  m4, rng, DEG, rgb,
  sphere, ellipsoid, superellipsoid, blob, cylinder, lathe, torus, box, roundedBox, extrude, tube, curve, plane,
  merge, tint, paint, place, deform, setGlow, setOutline, gradientY, clone, bounds, scale as scaleMesh,
  Node, material, makeInstances, setInstance,
} from '../index.js';

// ------------------------------------------------------------------------------------ palette

/** Bright, saturated, airy. Sets may override per prop; these are the defaults so sets match. */
export const PAL = {
  cream: '#fff1d0', paper: '#fff6dc', white: '#ffffff', stone: '#f0dfb8', stone2: '#e2cda2', stoneDark: '#c4ab86',
  cobble: '#f3e2ba', wood: '#d08a4a', wood2: '#e2a35e', woodDark: '#9a5a32', navy: '#2a3a66', iron: '#3b4a7a',
  red: '#f4573f', coral: '#ff7a5a', orange: '#ff9a3c', yellow: '#ffd24a', gold: '#ffd24a', teal: '#35c9b5', mint: '#8ee8c8',
  sky: '#58b8f0', blue: '#3f78e0', violet: '#8a6be0', pink: '#ff8fb0', green: '#86de57', leaf: '#4fc463', leaf2: '#8fe46c', leafDark: '#39a866',
  glass: '#ffe27a', glassOff: '#4a5fb0', rope: '#ecd08a', rock: '#c9c2e6', rock2: '#a9a3d0', cliff: '#f2dcae', sand: '#f8e3a3',
  roofs: ['#ff8b3d', '#f4573f', '#35c9b5', '#5b7fe8', '#e86a9a'],
  lanterns: ['#ffb040', '#ff7448', '#ffd65a', '#ff8fb4', '#ffa23a', '#7fe6d2', '#ffc84a'],
};

const R = (seed) => rng(Math.floor(seed * 7919) + 17);
const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];

// ------------------------------------------------------------------------------------ helpers

/**
 * Make a finished prop crooked. Everything is relative to the prop's own height:
 *   lean, leanZ   how far the top is pushed sideways / forward, as a fraction of the height
 *   bulge         > 0 makes the top wider than the bottom (storybook houses), < 0 narrower
 *   twist         degrees of turn between the bottom and the top
 *   crease        shading crease angle to keep (default 40: boxes stay hard, balls stay smooth)
 * Anchors on the mesh are moved with it.
 */
export function wonk(mesh, { lean = 0, leanZ = 0, bulge = 0, twist = 0, crease = 40 } = {}) {
  const b = bounds(mesh), y0 = b.min[1], H = (b.max[1] - b.min[1]) || 1;
  const f = (p) => {
    const t = (p[1] - y0) / H, k = 1 + bulge * t, a = twist * DEG * t, c = Math.cos(a), s = Math.sin(a);
    const x = p[0] * k, z = p[2] * k;
    p[0] = x * c + z * s + lean * H * t * t; p[2] = -x * s + z * c + leanZ * H * t * t;
  };
  const anchors = mesh.anchors;
  deform(mesh, f, crease);
  if (anchors) for (const k of Object.keys(anchors)) { const a = anchors[k]; if (typeof a[0] === 'number') f(a); else a.forEach(f); }
  return mesh;
}

/** An anchor of a prop, in set space, for a prop placed at pos with a yaw (degrees) and uniform scale. */
export function anchorAt(mesh, name, pos = [0, 0, 0], yawDeg = 0, s = 1) {
  const a = mesh.anchors && mesh.anchors[name];
  if (!a) throw new Error(`anchorAt: this prop has no anchor "${name}" (has ${Object.keys(mesh.anchors || {}).join(', ') || 'none'})`);
  const one = (q) => { const c = Math.cos(yawDeg * DEG), sn = Math.sin(yawDeg * DEG); return [pos[0] + (q[0] * c + q[2] * sn) * s, pos[1] + q[1] * s, pos[2] + (-q[0] * sn + q[2] * c) * s]; };
  return typeof a[0] === 'number' ? one(a) : a.map(one);
}

const keepAnchors = (mesh, anchors) => { mesh.anchors = anchors; return mesh; };

/** Fill node.instances by calling fn(i) -> { m: mat4, color } | null for i in 0..capacity-1. */
export function scatter(node, capacity, fn) {
  const inst = makeInstances(capacity); let n = 0;
  for (let i = 0; i < capacity; i++) { const o = fn(i); if (o) setInstance(inst, n++, o.m, o.color || null); }
  inst.count = n; node.instances = inst;
  return node;
}

/** The materials a set needs. One call per set; pass the result to whoever builds nodes for it. */
export function kitMaterials() {
  return {
    /** props and buildings: two tones, coloured outline, rim */
    prop: material({ name: 'kit-prop', bandEdge: 0.02, outline: { width: 2.3, self: 0.6 } }),
    /** ground, quay tops, water-level things: no rim (flat ground lights up all over otherwise), thin outline */
    ground: material({ name: 'kit-ground', rim: 0, outline: { width: 1.8, self: 0.7 } }),
    /** flat decoration lying on the ground (cobbles): no outline, casts nothing */
    flat: material({ name: 'kit-flat', rim: 0, outline: false, castShadow: false }),
    /** far backdrop: headlands, distant town; thin outline, less fog so it keeps its colour */
    far: material({ name: 'kit-far', rim: 0, fog: 0.55, outline: { width: 1.4, self: 0.8 }, castShadow: false, receiveShadow: false }),
    /** paper lanterns and other small bright hanging things: no shadow either way */
    lantern: material({ name: 'kit-lantern', rim: 0, outline: { width: 2.0, self: 0.75 }, castShadow: false, receiveShadow: false }),
    /** tiny far things (gulls, floating lights): no outline at all */
    speck: material({ name: 'kit-speck', rim: 0, outline: false, castShadow: false, receiveShadow: false, fog: 0.4 }),
  };
}

// ------------------------------------------------------------------------------------ cloth

/**
 * A striped canopy. Origin: the centre of its back (high) edge; it runs toward +Z, dropping by
 * `drop` and sagging by `sag` on the way, and is `flare` wider at the front than at the back.
 * colors alternate per stripe. The hem is a row of round tabs.
 */
export function awning({ w = 2.4, d = 1.5, drop = 0.5, sag = 0.1, stripes = 7, colors = [PAL.red, PAL.cream], thick = 0.05, flare = 0.14, scallop = 0.17 } = {}) {
  const parts = [], segs = 5, top = [], bot = [];
  for (let i = 0; i <= segs; i++) { const t = i / segs, z = t * d, y = -drop * t - sag * Math.sin(t * Math.PI); top.push([z, y + thick]); bot.push([z, y]); }
  const outline = [...top, ...bot.reverse()], sw = w / stripes;
  const tab = [[-sw / 2, 0.02], [sw / 2, 0.02]];
  for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI; tab.push([Math.cos(a) * sw / 2, -scallop * (0.35 + 0.65 * Math.sin(a))]); }
  for (let i = 0; i < stripes; i++) {
    const x = -w / 2 + sw * (i + 0.5), c = colors[i % colors.length];
    parts.push(tint(place(extrude(outline, sw, { crease: 50 }), x, 0, 0, 0, -90, 0), c));
    parts.push(tint(place(extrude(tab, 0.035, { crease: 50 }), x, -drop + thick * 0.5, d - 0.01), c));
  }
  return deform(merge(parts), (p) => { p[0] *= 1 + flare * (p[2] / d); }, 50);
}

/**
 * A market stall, customers at +Z. Posts, a plank counter, a sagging striped awning, a dark back
 * cloth so goods read, a shelf rail, a little round sign.
 *   goods   'lanterns' (unlit paper lanterns for sale) | 'fruit' | 'jars' | 'none'
 *   lean    how crooked (fraction of height); the sign of the seed picks the side
 * anchors: lamp (under the awning, for a point light), hookL / hookR (front awning corners, for
 * strings), counter (top of the counter, centre), top (highest point).
 */
export function stall({ w = 2.3, d = 1.25, h = 1.75, seed = 1, colors = [PAL.red, PAL.cream], goods = 'lanterns', sign = PAL.yellow, lean = 0.05, cloth = '#31458f' } = {}) {
  const r = R(seed), parts = [], hw = w / 2, hd = d / 2, backH = h + 0.42;
  // posts: stubby, tapered, leaning apart a little
  for (const [sx, sz, ph] of [[-1, 1, h], [1, 1, h], [-1, -1, backH], [1, -1, backH]]) {
    parts.push(tint(place(cylinder(0.085, 0.06, ph, 8), sx * hw, 0, sz * hd, sz * -2, 0, sx * -(2 + r() * 3)), PAL.woodDark));
  }
  // counter: planks on the front, a fat top board
  const planks = 6, pw = (w + 0.1) / planks;
  for (let i = 0; i < planks; i++) parts.push(tint(place(roundedBox(pw - 0.015, 0.6 + (r() - 0.5) * 0.04, 0.07, 0.02, 1), -hw - 0.05 + pw * (i + 0.5), 0.3, hd - 0.02, 0, 0, (r() - 0.5) * 3), i % 2 ? PAL.wood : PAL.wood2));
  parts.push(tint(place(roundedBox(w + 0.34, 0.1, 0.56, 0.04, 2), 0, 0.64, hd - 0.2, 0, 0, (r() - 0.5) * 2), PAL.wood2));
  for (const sx of [-1, 1]) parts.push(tint(place(box(0.06, 0.58, d - 0.3), sx * (hw - 0.02), 0.3, -0.1), PAL.wood));
  // back cloth and shelf rail
  parts.push(tint(place(box(w - 0.1, backH - 0.25, 0.04), 0, (backH - 0.25) / 2 + 0.1, -hd + 0.03), cloth));
  parts.push(tint(place(roundedBox(w - 0.1, 0.07, 0.3, 0.02, 1), 0, 1.02, -hd + 0.2), PAL.wood));
  parts.push(tint(place(cylinder(0.03, 0.03, w + 0.1, 6), -hw - 0.05, h - 0.12, hd - 0.02, 0, 0, -90), PAL.woodDark));
  // canopy
  const canopy = awning({ w: w + 0.5, d: d + 0.75, drop: 0.52, sag: 0.1, stripes: 7, colors });
  parts.push(place(canopy, 0, backH + 0.02, -hd - 0.12));
  // goods
  if (goods === 'lanterns') {
    const cols = PAL.lanterns;
    for (let i = 0; i < 5; i++) { // a row hanging from the rail
      const l = setGlow(paperLantern({ r: 0.1 + r() * 0.035, shape: i % 3 === 1 ? 'tall' : 'round', seg: 8 }), 0);
      parts.push(tint2(place(l, -hw + 0.3 + (w - 0.6) * (i / 4), h - 0.14, hd - 0.04, (r() - 0.5) * 8, 0, (r() - 0.5) * 14), cols[(i + Math.floor(seed)) % cols.length], 0.82));
    }
    for (let i = 0; i < 4; i++) { // and a few standing on the shelf at the back
      const rad = 0.11 + r() * 0.03, l = setGlow(paperLantern({ r: rad, shape: i % 2 ? 'drum' : 'round', seg: 8, tassel: false }), 0);
      parts.push(tint2(place(l, -hw + 0.4 + (w - 0.8) * (i / 3), 1.06 + rad * 2.45, -hd + 0.22), cols[(i * 2 + 1 + Math.floor(seed)) % cols.length], 0.82));
    }
  } else if (goods === 'fruit') {
    for (let k = 0; k < 3; k++) {
      const cx = (k - 1) * (w * 0.3), col = [PAL.orange, PAL.red, PAL.leaf2][k];
      parts.push(tint(place(roundedBox(0.52, 0.16, 0.4, 0.03, 1), cx, 0.77, hd - 0.2, -14, (r() - 0.5) * 16, 0), PAL.woodDark));
      for (let i = 0; i < 7; i++) parts.push(tint(place(sphere(0.075, 8, 6), cx + ((i % 3) - 1) * 0.15 + (r() - 0.5) * 0.04, 0.88 + (i > 5 ? 0.1 : 0) - (Math.floor(i / 3) - 1) * 0.03, hd - 0.2 + (Math.floor(i / 3) - 1) * 0.12), col));
    }
  } else if (goods === 'jars') {
    for (let i = 0; i < 5; i++) {
      const s = 0.8 + r() * 0.5, col = pick(r, [PAL.teal, PAL.blue, PAL.coral, PAL.yellow]);
      parts.push(tint(place(lathe([[0, 0], [0.07, 0], [0.1, 0.08], [0.09, 0.19], [0.05, 0.23], [0.06, 0.27], [0, 0.27]], 10, { crease: 180 }), -hw + 0.35 + (w - 0.7) * (i / 4), 0.69, hd - 0.2 + (r() - 0.5) * 0.15, 0, 0, 0, s), col));
    }
  }
  if (sign) {
    parts.push(tint(place(cylinder(0.26, 0.26, 0.06, 14), 0, h + 0.05, hd + 0.52, 90 - 12, 0, 0), PAL.woodDark));
    parts.push(tint(place(cylinder(0.2, 0.2, 0.08, 14), 0, h + 0.05, hd + 0.525, 90 - 12, 0, 0), sign));
  }
  const m = keepAnchors(merge(parts), { lamp: [0, h - 0.4, 0.15], hookL: [-hw - 0.2, h - 0.05, hd + 0.5], hookR: [hw + 0.2, h - 0.05, hd + 0.5], counter: [0, 0.69, hd - 0.2], top: [0, backH + 0.1, -hd] });
  const side = r() > 0.5 ? 1 : -1;
  return wonk(m, { lean: lean * side, leanZ: lean * 0.4, twist: (r() - 0.5) * 6 });
}

// colour a mesh but keep its dark parts dark: multiplies instead of replacing (lantern caps stay navy)
function tint2(mesh, color, k = 1) {
  const c = rgb(color), C = mesh.colors;
  for (let i = 0; i < C.length; i += 3) { C[i] *= c[0] * k; C[i + 1] *= c[1] * k; C[i + 2] *= c[2] * k; }
  return mesh;
}

/**
 * A paper lantern hanging from its hook at the origin. The paper is white and glows (per-vertex
 * glow), so colour it with an instance colour or node tint; the caps and tassel stay dark.
 *   shape 'round' | 'tall' | 'drum';  r is the paper's widest radius
 * anchors: centre (middle of the paper, for a glow sprite or a light)
 */
export function paperLantern({ r = 0.15, shape = 'round', tassel = true, seg = 10, cord = 0.07 } = {}) {
  const parts = [], H = shape === 'tall' ? r * 2.7 : shape === 'drum' ? r * 1.6 : r * 1.85, capH = r * 0.2;
  parts.push(tint(place(cylinder(0.008, 0.008, cord, 4, { caps: false }), 0, -cord, 0), [0.2, 0.2, 0.3]));
  parts.push(tint(place(cylinder(r * 0.52, r * 0.42, capH, seg), 0, -cord - capH, 0), [0.22, 0.24, 0.42]));
  const y1 = -cord - capH, prof = [[0, y1 - H]], n = 6;
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = Math.sin(t * Math.PI);
    const rr = shape === 'tall' ? r * (0.5 + 0.5 * Math.pow(s, 0.45)) * 0.82 : shape === 'drum' ? r * (0.86 + 0.14 * s) : r * (0.45 + 0.55 * Math.pow(s, 0.8));
    prof.push([rr, y1 - H + t * H]);
  }
  prof.push([0, y1]);
  parts.push(setGlow(lathe(prof, seg, { crease: 180 }), 0.92));
  parts.push(tint(place(cylinder(r * 0.4, r * 0.5, capH * 0.9, seg), 0, y1 - H - capH * 0.75, 0), [0.22, 0.24, 0.42]));
  if (tassel) parts.push(tint(place(cylinder(0.004, r * 0.09, r * 0.5, 5), 0, y1 - H - capH * 0.75 - r * 0.5, 0), [0.95, 0.3, 0.25]));
  return keepAnchors(merge(parts), { centre: [0, y1 - H / 2, 0] });
}

/**
 * A sagging wire from a to b ([x, y, z] each) with `count` evenly spaced hooks along it.
 * Returns { wire (mesh), hooks: [[x, y, z], ...], at(t) -> point }. Hang paperLantern instances on the hooks.
 */
export function lanternString(a, b, { sag = 0.5, count = 6, radius = 0.014, color = PAL.navy, ends = 0.08 } = {}) {
  const at = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
  const path = []; for (let i = 0; i <= 14; i++) path.push(at(i / 14));
  const hooks = []; for (let i = 0; i < count; i++) hooks.push(at(ends + (1 - 2 * ends) * (count === 1 ? 0.5 : i / (count - 1))));
  return { wire: tint(tube(path, radius, 5, { crease: 180 }), color), hooks, at };
}

/** A sagging line of little pennants from a to b. One mesh. */
export function bunting(a, b, { sag = 0.35, count = 9, size = 0.2, colors = [PAL.red, PAL.yellow, PAL.teal, PAL.cream, PAL.pink], seed = 1 } = {}) {
  const r = R(seed), s = lanternString(a, b, { sag, count, radius: 0.01, ends: 0.06 });
  const yaw = Math.atan2(-(b[2] - a[2]), b[0] - a[0]) / DEG, parts = [s.wire];
  s.hooks.forEach((h, i) => {
    const f = extrude([[-size * 0.42, 0], [size * 0.42, 0], [0, -size]], 0.012, { crease: 30 });
    parts.push(tint(place(f, h[0], h[1], h[2], (r() - 0.5) * 24, yaw, (r() - 0.5) * 16), colors[i % colors.length]));
  });
  return merge(parts);
}

// ------------------------------------------------------------------------------------ dock clutter

/** A fat wooden crate with corner battens. `s` is its side. */
export function crate({ s = 0.5, seed = 1, color = PAL.wood, trim = PAL.woodDark } = {}) {
  const parts = [tint(place(roundedBox(s, s, s, s * 0.06, 1), 0, s / 2, 0), color)], e = s * 0.5 - s * 0.03, t = s * 0.15;
  for (const y of [t / 2 + 0.005, s - t / 2 - 0.005]) parts.push(tint(place(roundedBox(s * 1.07, t, s * 1.07, s * 0.03, 1), 0, y, 0), trim));
  for (const [x, z] of [[-e, -e], [e, -e], [-e, e], [e, e]]) parts.push(tint(place(box(t * 0.8, s * 0.72, t * 0.8), x * 1.04, s / 2, z * 1.04), trim));
  return wonk(merge(parts), { twist: (R(seed)() - 0.5) * 8, bulge: 0.04 });
}

/** A round-bellied barrel with two hoops. */
export function barrel({ r = 0.27, h = 0.66, color = PAL.wood, hoop = PAL.iron } = {}) {
  const b = tint(lathe([[0, 0], [r * 0.78, 0], [r * 0.98, h * 0.25], [r * 1.04, h * 0.5], [r * 0.98, h * 0.75], [r * 0.78, h], [r * 0.7, h - 0.035], [0, h - 0.035]], 14, { crease: 50 }), color);
  return merge(b, tint(place(torus(r * 0.93, 0.028, 14, 5), 0, h * 0.2, 0), hoop), tint(place(torus(r * 0.93, 0.028, 14, 5), 0, h * 0.8, 0), hoop));
}

/** A slumped grain sack with a tied neck. */
export function sack({ s = 0.34, seed = 1, color = '#f1dca4' } = {}) {
  const body = tint(place(blob({ rx: s, ry: s * 1.05, rz: s * 0.85, pear: 0.7, flatBottom: 0.45, lumps: 0.35, seed, seg: 12, rings: 9 }), 0, s * 0.58, 0), color);
  const neck = tint(place(lathe([[0.03, 0], [s * 0.3, 0.02], [s * 0.2, 0.09], [s * 0.34, 0.16], [0, 0.15]], 8, { crease: 180 }), 0, s * 1.5, 0), color);
  return merge(body, neck, tint(place(torus(s * 0.22, 0.018, 8, 4), 0, s * 1.5 + 0.085, 0), PAL.red));
}

/** A mooring bollard: a squat iron mushroom on a stone pad. */
export function bollard({ s = 1, color = PAL.iron } = {}) {
  const m = merge(
    tint(place(cylinder(0.25, 0.23, 0.07, 12), 0, 0, 0), PAL.stone2),
    tint(lathe([[0, 0.06], [0.17, 0.06], [0.13, 0.14], [0.12, 0.38], [0.2, 0.45], [0.21, 0.54], [0.13, 0.61], [0, 0.62]], 12, { crease: 60 }), color),
    tint(place(torus(0.145, 0.03, 12, 5), 0, 0.27, 0, 6, 0, 4), PAL.rope));
  return scaleMesh(m, s);
}

/** A coil of rope lying on the ground. */
export function ropeCoil({ r = 0.26, turns = 3, color = PAL.rope } = {}) {
  const parts = [];
  for (let i = 0; i < turns; i++) parts.push(place(torus(r - i * 0.012, 0.04, 12, 5), 0, 0.04 + i * 0.065, 0, 0, i * 37, 0));
  return tint(merge(parts), color);
}

// ------------------------------------------------------------------------------------ boats

/**
 * A tubby harbour boat, bow toward +Z, waterline at y = 0. Hull in two colours with a fat gunwale,
 * thwarts, a stubby mast with a furled sail and a pennant.
 * anchors: lamp (top of the bow post, for a lantern), mast (masthead)
 */
export function boat({ len = 2.6, hull = PAL.cream, keel = PAL.red, trim = PAL.wood, mast = true, pennant = PAL.yellow, seed = 1 } = {}) {
  const rz = len / 2, rx = len * 0.22, ry = len * 0.16, e2 = 0.78, sp = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
  const sheer = (z) => { const t = Math.abs(z) / rz; return t * t * len * 0.07 + (z > 0 ? t * t * len * 0.03 : 0); };
  const top = ry * 0.42;
  const shell = (col, yLo, yHi) => {
    const m = deform(superellipsoid(rx, ry, rz, 0.9, e2, 18, 12), (p) => { if (p[1] > 0) p[1] *= 0.05; p[1] = Math.max(yLo, Math.min(yHi, p[1])); p[1] += top + sheer(p[2]); }, 50);
    return tint(m, col);
  };
  // two shells clipped at the paint line give a crisp two-colour hull
  const parts = [shell(hull, -ry * 0.42, ry), shell(keel, -ry, -ry * 0.4)];
  const rim = []; for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI * 2, z = rz * sp(Math.sin(a), e2); rim.push([rx * sp(Math.cos(a), e2), top + sheer(z) + 0.01, z]); }
  parts.push(tint(tube(rim, len * 0.028, 6, { crease: 180 }), trim));
  parts.push(tint(place(scaleMesh(lathe([[1, 0], [0, 0]], 14, { crease: 180 }), rx * 0.82, 1, rz * 0.86), 0, top - ry * 0.3, 0), PAL.woodDark));
  for (const z of [-rz * 0.35, rz * 0.2]) parts.push(tint(place(roundedBox(rx * 1.7, 0.05, len * 0.09, 0.02, 1), 0, top - 0.02, z), PAL.wood2));
  const bowY = top + sheer(rz) + 0.02;
  parts.push(tint(place(cylinder(0.04, 0.035, len * 0.16, 6), 0, bowY - 0.06, rz * 0.9), PAL.woodDark));
  const anchors = { lamp: [0, bowY + len * 0.11, rz * 0.9], mast: [0, top + len * 0.62, -rz * 0.05] };
  if (mast) {
    const mh = len * 0.62;
    parts.push(tint(place(cylinder(0.05, 0.035, mh, 7), 0, top - ry * 0.3, -rz * 0.05, 3, 0, -2), PAL.woodDark));
    parts.push(tint(place(tube(curve([[0, 0, 0], [0.03, 0.02, -len * 0.14], [0, 0.05, -len * 0.3]], 6), (t) => 0.075 - 0.03 * Math.abs(t - 0.4), 7, { crease: 180 }), 0, top + mh * 0.5, 0.0), PAL.paper));
    parts.push(tint(place(extrude([[0, 0], [len * 0.13, 0.05], [0, 0.11]], 0.015), 0.03, top + mh * 0.86, -rz * 0.02, 0, -70, 0), pennant));
  }
  return keepAnchors(merge(parts), anchors);
}

// ------------------------------------------------------------------------------------ buildings

function windowMesh({ lit = true, w = 0.5, h = 0.62, trim = PAL.woodDark, shutters = null, glass = PAL.glass, box: flowerBox = false, seed = 1 }) {
  const parts = [tint(roundedBox(w, h, 0.1, 0.06, 1), trim)];
  const pane = tint(place(roundedBox(w - 0.14, h - 0.14, 0.1, 0.04, 1), 0, 0, 0.025), lit ? glass : PAL.glassOff);
  parts.push(lit ? setGlow(pane, 0.95) : pane);
  parts.push(tint(place(box(0.035, h - 0.1, 0.03), 0, 0, 0.075), trim), tint(place(box(w - 0.1, 0.035, 0.03), 0, 0.02, 0.075), trim));
  parts.push(tint(place(box(w + 0.14, 0.07, 0.16), 0, -h / 2 - 0.02, 0.04), PAL.stone));
  if (shutters) { const r = R(seed); for (const sx of [-1, 1]) parts.push(tint(place(box(w * 0.42, h * 0.96, 0.05), sx * (w / 2 + w * 0.2), 0, 0.0, 0, sx * -(10 + r() * 22), (r() - 0.5) * 5), shutters)); }
  if (flowerBox) {
    parts.push(tint(place(box(w + 0.06, 0.12, 0.16), 0, -h / 2 - 0.1, 0.12), PAL.wood));
    const r = R(seed + 3);
    for (let i = 0; i < 4; i++) parts.push(tint(place(sphere(0.06 + r() * 0.02, 6, 5), (i - 1.5) * (w / 4), -h / 2 - 0.01, 0.13), i % 2 ? PAL.pink : PAL.leaf));
  }
  return merge(parts);
}

/**
 * A storybook house: walls wider at the top than the bottom, an oversized roof with scooped slopes
 * and an off-centre ridge, a leaning chimney, a round-topped door, shuttered windows.
 * The gable (and the door) face +Z; turn the whole house for a side-on roof.
 *   w, d, h     wall width, depth, height (the roof adds roofH)
 *   floors      rows of windows;  lit: chance 0..1 that a window is lit
 *   door        true | false;  shutters: colour or null;  flowers: window boxes on the front
 *   sides       'both' | 'left' | 'right' | 'none': which side walls get windows (skip the ones nobody sees)
 * anchors: chimney (top of the pot, for smoke), eaveL / eaveR (front roof corners, for strings),
 *          ridge (front of the ridge), windows (centres of the lit front windows, for glow sprites)
 */
export function house({ w = 3, d = 2.6, h = 3.0, roofH = 1.7, seed = 1, wall = PAL.cream, roof = null, trim = PAL.woodDark, floors = 2, lit = 0.6, door = true, shutters = PAL.teal, flowers = true, chimney = true, lean = 0.03, bulge = 0.12, plinth = PAL.stone2, sides = 'both' } = {}) {
  const r = R(seed), parts = [], hw = w / 2, hd = d / 2;
  roof = roof || pick(r, PAL.roofs);
  parts.push(tint(place(roundedBox(w, h, d, 0.14, 2), 0, h / 2, 0), wall));
  parts.push(tint(place(roundedBox(w + 0.16, 0.42, d + 0.16, 0.08, 1), 0, 0.21, 0), plinth));
  // a timber belt between floors
  if (floors > 1) parts.push(tint(place(roundedBox(w * (1 + bulge * 0.5) + 0.1, 0.12, d * (1 + bulge * 0.5) + 0.1, 0.03, 1), 0, h * 0.52, 0), trim));
  // door and windows on the front, windows on both sides
  const litWins = [], fz = hd, row = (k) => h * (floors === 1 ? 0.56 : k === 0 ? 0.3 : 0.52 + 0.46 * (k / floors) + 0.07);
  if (door) {
    const arch = []; for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; arch.push([Math.cos(a) * 0.3, 0.62 + Math.sin(a) * 0.3]); }
    const dx = (r() > 0.5 ? 1 : -1) * w * 0.2;
    parts.push(tint(place(extrude([[0.38, 0], ...arch.map(([x, y]) => [x * 1.27, y * 1.0 + 0.08]), [-0.38, 0]], 0.1, { bevel: 0.02 }), dx, 0.0, fz + 0.02), PAL.stone));
    parts.push(tint(place(extrude([[0.3, 0], ...arch, [-0.3, 0]], 0.14, { bevel: 0.03 }), dx, 0.0, fz + 0.04), pick(r, [PAL.red, PAL.teal, PAL.blue, PAL.wood])));
    parts.push(tint(place(sphere(0.045, 6, 5), dx + 0.17, 0.5, fz + 0.12), PAL.gold));
    parts.push(tint(place(roundedBox(0.9, 0.12, 0.4, 0.04, 1), dx, 0.06, fz + 0.2), PAL.stone));
    const wx = -dx * 1.2;
    const on = r() < lit; parts.push(place(windowMesh({ lit: on, trim, shutters, box: flowers, seed: seed + 1 }), wx, row(0) + 0.25, fz)); if (on) litWins.push([wx, row(0) + 0.25, fz + 0.1]);
  }
  for (let k = door ? 1 : 0; k < floors; k++) for (const sx of [-1, 1]) {
    const on = r() < lit, y = row(k), x = sx * w * 0.24;
    parts.push(place(windowMesh({ lit: on, trim, shutters, box: flowers && r() > 0.4, seed: seed + k * 3 + sx }), x, y, fz));
    if (on) litWins.push([x, y, fz + 0.1]);
  }
  for (const sx of [-1, 1]) for (let k = 0; k < floors; k++) {
    const on = r() < lit;
    if (sides !== 'both' && sides !== (sx < 0 ? 'left' : 'right')) continue;
    parts.push(place(windowMesh({ lit: on, trim, shutters: null, seed: seed + 9 + k }), sx * hw, row(k) + (k === 0 ? 0.25 : 0), (r() - 0.5) * d * 0.3, 0, sx * 90, 0));
  }
  // gable infill, then the roof as a thick scooped shell with a big overhang
  const ov = 0.36, rx = (r() - 0.5) * w * 0.22, e = hw * (1 + bulge) + ov, th = 0.2, n = 6, outer = [], inner = [];
  const slope = (t) => Math.pow(t, 1.45);
  for (let i = 0; i <= n; i++) { const t = i / n; outer.push([-e + (rx + e) * t, roofH * slope(t) + (i === 0 ? 0.1 : 0)]); }
  for (let i = n - 1; i >= 0; i--) { const t = i / n; outer.push([e - (e - rx) * t, roofH * slope(t) + (i === 0 ? 0.1 : 0)]); }
  for (const [x, y] of outer) inner.push([x * (1 - th / e) + rx * (th / e) * 0.3, y - th]);
  parts.push(tint(place(extrude([[-hw * (1 + bulge) - 0.02, -0.05], ...inner.slice(1, -1).map(([x, y]) => [x, y + 0.03]), [hw * (1 + bulge) + 0.02, -0.05]], d * (1 + bulge) - 0.06, { crease: 40 }), 0, h, 0), wall));
  parts.push(tint(place(extrude([...outer, ...inner.reverse()], d * (1 + bulge) + ov * 2, { bevel: 0.05, crease: 40 }), 0, h + 0.02, 0, 0, 0, (r() - 0.5) * 3), roof));
  parts.push(place(windowMesh({ lit: r() < lit, w: 0.38, h: 0.38, trim, seed: seed + 20 }), rx * 0.5, h + roofH * 0.3, hd * (1 + bulge) - 0.04));
  const anchors = { eaveL: [-e + 0.05, h + 0.08, hd * (1 + bulge) + ov], eaveR: [e - 0.05, h + 0.08, hd * (1 + bulge) + ov], ridge: [rx, h + roofH, hd * (1 + bulge) + ov], windows: litWins, chimney: [0, h + roofH, 0] };
  const body = keepAnchors(merge(parts), anchors);
  // the walls bulge with height; the roof and gable were built at the bulged size already, so only the walls are widened
  deform(body, (p) => { if (p[1] < h) { const k = 1 + bulge * (p[1] / h); p[0] *= k; p[2] *= k; } }, 40);
  for (const q of litWins) { const k = 1 + bulge * (q[1] / h); q[0] *= k; q[2] *= k; }
  const out = [body];
  if (chimney) {
    const cx = -Math.sign(rx || 1) * w * 0.26, t = Math.abs(cx - rx) / (cx < rx ? rx + e : e - rx), cy = h + roofH * slope(1 - t) - 0.25, ch = 0.95;
    const c = merge(
      tint(place(roundedBox(0.42, ch, 0.42, 0.05, 1), 0, ch / 2, 0), PAL.stone2),
      tint(place(roundedBox(0.56, 0.14, 0.56, 0.04, 1), 0, ch, 0), PAL.stoneDark),
      tint(place(cylinder(0.12, 0.1, 0.22, 8), 0, ch + 0.05, 0), PAL.red));
    out.push(place(c, cx, cy, -d * 0.12, 0, 0, Math.sign(cx) * -7));
    anchors.chimney = [cx + Math.sign(cx) * 0.12, cy + ch + 0.3, -d * 0.12];
  }
  const m = keepAnchors(merge(out), anchors);
  return wonk(m, { lean: lean * (r() > 0.5 ? 1 : -1), twist: (r() - 0.5) * 4 });
}

/**
 * A fat tapering lighthouse with striped bands, a gallery, a glowing lamp room and a cap.
 * anchors: lamp (centre of the lamp room), top
 */
export function lighthouse({ h = 6, r = 1.05, bands = 5, colors = [PAL.cream, PAL.red], cap = PAL.red, lit = true } = {}) {
  const parts = [], seg = 20, Rr = (y) => r * (1 - 0.42 * Math.pow(y / h, 0.8)), gh = h * 0.13;
  parts.push(tint(cylinder(r * 1.3, r * 1.18, h * 0.06, seg), PAL.stone2));
  for (let i = 0; i < bands; i++) { const y0 = h * 0.06 + (h * 0.94) * (i / bands), y1 = h * 0.06 + (h * 0.94) * ((i + 1) / bands), ym = (y0 + y1) / 2; parts.push(tint(lathe([[Rr(y0), y0], [Rr(ym) * 1.01, ym], [Rr(y1), y1]], seg, { crease: 180 }), colors[i % colors.length])); }
  const tr = Rr(h);
  parts.push(tint(lathe([[tr, h - 0.02], [tr * 1.55, h + 0.05], [tr * 1.6, h + 0.17], [tr * 1.45, h + 0.22], [0, h + 0.22]], seg), PAL.navy));
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; parts.push(tint(place(cylinder(0.03, 0.03, gh * 0.5, 5), Math.cos(a) * tr * 1.5, h + 0.2, Math.sin(a) * tr * 1.5), PAL.navy)); }
  parts.push(tint(place(torus(tr * 1.5, 0.035, seg, 5), 0, h + 0.2 + gh * 0.5, 0), PAL.navy));
  const glassM = tint(place(cylinder(tr * 0.82, tr * 0.82, gh, 14, { caps: false }), 0, h + 0.22, 0), lit ? PAL.glass : PAL.glassOff);
  parts.push(lit ? setGlow(glassM, 1) : glassM);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; parts.push(tint(place(box(0.07, gh, 0.07), Math.cos(a) * tr * 0.82, h + 0.22 + gh / 2, Math.sin(a) * tr * 0.82, 0, -a / DEG, 0), PAL.navy)); }
  const cy = h + 0.2 + gh;
  parts.push(tint(lathe([[0, cy], [tr * 1.25, cy], [tr * 1.15, cy + 0.1], [tr * 0.3, cy + gh * 1.05], [0, cy + gh * 1.1]], seg), cap));
  parts.push(tint(place(sphere(tr * 0.17, 8, 6), 0, cy + gh * 1.2, 0), PAL.gold));
  // door and two windows, facing +Z
  const arch = []; for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI; arch.push([Math.cos(a) * r * 0.26, r * 0.5 + Math.sin(a) * r * 0.26]); }
  parts.push(tint(place(extrude([[r * 0.26, 0], ...arch, [-r * 0.26, 0]], 0.16, { bevel: 0.03 }), 0, h * 0.06, Rr(h * 0.1) - 0.02), PAL.woodDark));
  for (const [y, ya] of [[h * 0.45, 14], [h * 0.72, -26]]) {
    const wm = merge(tint(roundedBox(r * 0.34, r * 0.46, 0.12, 0.05, 1), PAL.navy), setGlow(tint(roundedBox(r * 0.2, r * 0.32, 0.14, 0.04, 1), lit ? PAL.glass : PAL.glassOff), lit ? 0.9 : 0));
    parts.push(place(place(wm, 0, y, Rr(y) - 0.02), 0, 0, 0, 0, ya, 0));
  }
  return keepAnchors(merge(parts), { lamp: [0, h + 0.22 + gh / 2, 0], top: [0, cy + gh * 1.3, 0] });
}

function cageLamp(s = 1, lit = true) {
  // origin at the top ring; the body hangs below it
  const g = tint(place(cylinder(0.075, 0.095, 0.17, 8, { caps: false }), 0, -0.3, 0), lit ? '#ffe9a0' : PAL.glassOff);
  return scaleMesh(merge(
    tint(place(torus(0.04, 0.014, 8, 4), 0, 0, 0, 90, 0, 0), PAL.navy),
    tint(place(cylinder(0.12, 0.0, 0.1, 8), 0, -0.14, 0), PAL.navy),
    lit ? setGlow(g, 1) : g,
    tint(place(cylinder(0.11, 0.11, 0.035, 8), 0, -0.335, 0), PAL.navy)), s);
}

/**
 * A crook-necked street lamp with a hanging cage lantern. The arm reaches toward +X.
 * anchors: lamp (centre of the glass)
 */
export function lampPost({ h = 2.7, arm = 0.55, color = PAL.iron, lit = true, s = 1.7 } = {}) {
  const post = tint(tube(curve([[0, 0.1, 0], [0.03, h * 0.5, 0], [-0.02, h * 0.92, 0], [0.1, h, 0], [arm * 0.7, h + 0.06, 0], [arm, h - 0.08, 0]], 14), (t) => 0.075 - 0.04 * t, 7, { crease: 180 }), color);
  const base = tint(lathe([[0, 0], [0.2, 0], [0.2, 0.08], [0.11, 0.16], [0.1, 0.32], [0, 0.32]], 10, { crease: 50 }), color);
  const lamp = place(cageLamp(s, lit), arm, h - 0.1, 0);
  return keepAnchors(merge(post, base, lamp), { lamp: [arm, h - 0.1 - 0.3 * s, 0] });
}

/** A tall crooked wooden pole with a knob, for hanging strings and bunting. anchors: top */
export function pole({ h = 3.6, seed = 1, color = PAL.woodDark, knob = PAL.yellow } = {}) {
  const r = R(seed), lx = (r() - 0.5) * 0.3, lz = (r() - 0.5) * 0.2;
  const m = merge(
    tint(tube(curve([[0, 0, 0], [lx * 0.7, h * 0.4, lz], [lx * 0.2, h * 0.75, lz * 0.5], [lx, h, 0]], 8), (t) => 0.085 - 0.035 * t, 7, { crease: 180 }), color),
    tint(place(cylinder(0.17, 0.13, 0.22, 8), 0, 0, 0), PAL.stone2),
    tint(place(sphere(0.085, 8, 6), lx, h + 0.04, 0), knob));
  return keepAnchors(m, { top: [lx, h - 0.06, 0] });
}

// ------------------------------------------------------------------------------------ nature

/** A lollipop tree: bent trunk, a few fat leaf balls. */
export function tree({ seed = 1, h = 2.4, leaf = PAL.leaf, leaf2 = PAL.leaf2, trunk = PAL.wood } = {}) {
  const r = R(seed), k = h / 2.4;
  const parts = [tint(tube(curve([[0, 0, 0], [0.12, 0.5, 0.02], [-0.05, 1.0, 0.04], [0.06, 1.55, 0]], 8), (t) => 0.19 - 0.09 * t, 8), trunk)];
  parts.push(tint(place(blob({ rx: 0.9, ry: 0.75, rz: 0.85, lumps: 0.5, seed, flatBottom: 0.3, seg: 16, rings: 10 }), 0.05, 1.95, 0), leaf));
  parts.push(tint(place(blob({ rx: 0.55, ry: 0.48, rz: 0.52, lumps: 0.4, seed: seed + 3, flatBottom: 0.3, seg: 12, rings: 8 }), -0.6 + r() * 0.1, 1.6, 0.25), leaf));
  parts.push(tint(place(blob({ rx: 0.5, ry: 0.45, rz: 0.5, lumps: 0.4, seed: seed + 5, flatBottom: 0.3, seg: 12, rings: 8 }), 0.62, 1.72, -0.15), leaf));
  parts.push(tint(place(blob({ rx: 0.44, ry: 0.38, rz: 0.42, lumps: 0.3, seed: seed + 8, seg: 12, rings: 8 }), 0.12, 2.45, 0.12), leaf2));
  return scaleMesh(merge(parts), k);
}
export const bush = ({ seed = 1, s = 1, color = PAL.leafDark } = {}) => tint(scaleMesh(blob({ rx: 0.45, ry: 0.34, rz: 0.42, lumps: 0.5, seed, flatBottom: 0.6, seg: 12, rings: 8 }), s), color);
export const rock = ({ seed = 1, s = 1, low = PAL.rock2, high = PAL.rock } = {}) => gradientY(scaleMesh(blob({ rx: 0.6, ry: 0.5, rz: 0.55, lumps: 0.9, seed, flatBottom: 0.5, seg: 12, rings: 8 }), s), low, high);

/**
 * A far headland: a long lumpy hump, green on top with pale cliffs, sitting in the sea at y = 0.
 * w along X, d along Z, h tall. Colours blend softly (it is far away).
 */
export function headland({ w = 60, d = 26, h = 14, seed = 1, grass = PAL.leaf, cliff = PAL.cliff, foot = '#e8b98a' } = {}) {
  const m = blob({ rx: w / 2, ry: h, rz: d / 2, lumps: 0.8, seed, flatBottom: 0.92, seg: 22, rings: 12 });
  deform(m, (p) => { const t = (p[0] / (w / 2) + 1) / 2; p[1] *= 0.55 + 0.6 * t; if (p[1] > 0) p[1] = Math.pow(p[1] / h, 0.75) * h; });
  return paint(m, (x, y, z, nx, ny) => (ny > 0.62 && y > h * 0.25 ? grass : y < h * 0.12 ? foot : cliff));
}

// ------------------------------------------------------------------------------------ sky

/**
 * One chunky cumulus, about `w` wide, flat underneath, centred on the origin with its base at y = 0.
 * Fat overlapping balls of clearly different sizes: one big dome off-centre, shoulders either side.
 */
export function cloud({ seed = 1, w = 10, puffs = 5 } = {}) {
  const r = R(seed), parts = [], big = Math.floor(r() * (puffs - 2)) + 1;
  for (let i = 0; i < puffs; i++) {
    const u = puffs === 1 ? 0.5 : i / (puffs - 1), dist = Math.abs(i - big) / puffs;
    const rad = w * (0.24 - 0.2 * dist + r() * 0.03);
    const s = sphere(1, 12, 8);
    deform(s, (p) => { if (p[1] < 0) p[1] *= 0.12; });
    parts.push(place(s, (u - 0.5) * w * 0.78, 0, (r() - 0.5) * w * 0.06, 0, r() * 360, 0, rad, rad * (0.85 + r() * 0.2), rad * 0.8));
  }
  return setOutline(merge(parts), 0);
}

/**
 * A sky of clouds as one instanced draw, set in an arc around the origin.
 *   count, seed
 *   arc [from, to]   compass range in degrees, 180 = toward -Z (where a default camera looks)
 *   radius [near, far], height [low, high], size [min, max] (multiplies a 30-unit-wide cloud at 300 away)
 *   color, shadowTint  lit top and underside colours;  speed degrees/second of drift
 * Returns { node, material, update(time) }.
 */
export function cloudBank({ count = 8, seed = 1, arc = [150, 210], radius = [260, 420], height = [18, 120], size = [0.8, 1.5], color = '#ffffff', shadowTint = '#a9b8f0', speed = 0.1, fog = 0.25 } = {}) {
  const r = R(seed);
  const mat = material({ name: 'kit-cloud', outline: false, rim: 0, fog, shadowTint, receiveShadow: false, castShadow: false, bandEdge: 0.12, bandSoft: 0.01, lightUp: 0.7 });
  const n = new Node('clouds', { mesh: tint(cloud({ seed, w: 30, puffs: 5 }), color), material: mat });
  n.castShadow = false;
  const inst = makeInstances(count);
  for (let i = 0; i < count; i++) {
    const a = (arc[0] + (i + 0.15 + r() * 0.7) / count * (arc[1] - arc[0])) * DEG, d = radius[0] + r() * (radius[1] - radius[0]);
    const s = (size[0] + r() * (size[1] - size[0])) * (d / 300), lift = r();
    setInstance(inst, i, m4.trs(Math.sin(a) * d, height[0] + lift * lift * (height[1] - height[0]), Math.cos(a) * d, 0, a / DEG + 180 + (r() - 0.5) * 24, 0, s * (r() > 0.5 ? 1 : 0.8)));
  }
  n.instances = inst;
  return { node: n, material: mat, update(time) { n.setRot(0, time * speed, 0); } };
}

/** A tiny gull, wings spread along X, about 1 unit across, flying toward +Z. Scale Y of an instance to flap. */
export function gull({ color = PAL.white, tip = '#8d97c9' } = {}) {
  const wing = (sx) => merge(
    tint(extrude([[0, 0], [sx * 0.3, 0.1], [sx * 0.3, 0.02], [0, -0.07]], 0.16, { crease: 30 }), color),
    tint(extrude([[sx * 0.3, 0.1], [sx * 0.52, 0.03], [sx * 0.3, 0.02]], 0.12, { crease: 30 }), tip));
  return setGlow(setOutline(merge(wing(1), wing(-1), tint(ellipsoid(0.06, 0.055, 0.15, 6, 4), color)), 0), 0.6);
}

// ------------------------------------------------------------------------------------ ground

/**
 * The edge of a stone quay running along X at z = 0, land toward +Z, water toward -Z, top at y = 0.
 * A row of fat coping stones in two tones and a block wall dropping `drop` below them.
 */
export function quayEdge({ len = 20, drop = 1.6, seed = 1, block = 0.95 } = {}) {
  const r = R(seed), parts = [], n = Math.round(len / block), bw = len / n;
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + bw * (i + 0.5);
    parts.push(tint(place(roundedBox(bw - 0.03, 0.26, 0.62 + r() * 0.06, 0.06, 1), x, -0.1 + r() * 0.03, 0.2, 0, (r() - 0.5) * 3, 0), i % 2 ? PAL.stone : PAL.stone2));
  }
  const rows = Math.max(1, Math.round(drop / 0.5)), rh = drop / rows, m2 = Math.round(len / (block * 1.9)), bw2 = len / m2;
  for (let k = 0; k < rows; k++) for (let i = 0; i < m2 + (k % 2); i++) {
    const x = -len / 2 + bw2 * (i + (k % 2 ? 0 : 0.5));
    parts.push(tint(place(box(bw2 - 0.04, rh - 0.03, 0.4), x, -0.24 - rh * (k + 0.5), 0.22 + r() * 0.03), (i + k) % 3 === 0 ? PAL.stoneDark : PAL.stone2));
  }
  return merge(parts);
}

/** One flat rounded paving stone (radius about 1, lies on y = 0), for instancing with scatter(). */
export function cobble() {
  return setOutline(lathe([[1, 0.0], [0.82, 0.05], [0, 0.055]], 9, { crease: 180 }), 0);
}

// ------------------------------------------------------------------------------------ stand-in

/**
 * A stand-in figure of chibi proportions (head a third of the height), about `h` tall, facing +Z.
 * Not a character: a mannequin for judging a set's scale and light before the cast is in.
 */
export function mannequin({ h = 1.1, coat = PAL.yellow, skin = '#ffd8b0', hair = '#b8542a' } = {}) {
  const k = h / 1.1;
  const m = merge(
    tint(place(blob({ rx: 0.085, ry: 0.07, rz: 0.125, flatBottom: 0.5, seg: 10, rings: 6 }), 0.09, 0.05, 0.03), '#6a4130'),
    tint(place(blob({ rx: 0.085, ry: 0.07, rz: 0.125, flatBottom: 0.5, seg: 10, rings: 6 }), -0.09, 0.05, 0.03), '#6a4130'),
    tint(place(blob({ rx: 0.19, ry: 0.24, rz: 0.17, pear: 0.6, seg: 14, rings: 10 }), 0, 0.4, 0), coat),
    tint(place(ellipsoid(0.06, 0.13, 0.06, 8, 6), 0.21, 0.4, 0, 0, 0, 18), coat), tint(place(ellipsoid(0.06, 0.13, 0.06, 8, 6), -0.21, 0.4, 0, 0, 0, -18), coat),
    tint(place(blob({ rx: 0.26, ry: 0.225, rz: 0.24, pear: 0.12, seg: 18, rings: 12 }), 0, 0.84, 0), skin),
    tint(place(deform(sphere(1, 16, 10), (p) => { if (p[1] < 0.1 && p[2] > -0.2) p[1] = 0.1 + (p[1] - 0.1) * 0.05; }), 0, 0.855, -0.02, 0, 0, 0, 0.275, 0.24, 0.26), hair),
    tint(place(ellipsoid(0.035, 0.05, 0.02, 6, 5), 0.1, 0.84, 0.225), '#2a2140'), tint(place(ellipsoid(0.035, 0.05, 0.02, 6, 5), -0.1, 0.84, 0.225), '#2a2140'));
  return scaleMesh(m, k);
}

export { plane, clone };
