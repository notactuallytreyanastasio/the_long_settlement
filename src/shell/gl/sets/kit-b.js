// The interior kit: rooms and what stands in them. Same rules as kit.js (pure, one options object per
// builder, per-vertex colour, anchors in the builder's own space, chunky and a little crooked), for
// the sets that have a roof: drum-hall, bench, mint-office, orrery.
//
// A room here is a stage: a floor, a back wall, two side walls, a ceiling, and NO front wall (the
// camera stands where it would be). Walls do not cast shadows (KB materials: wall), so the scene key
// can be a warm "house light" from the open front and furniture still throws shadows on the floor and
// up the back wall. Window light is drawn, not computed: glowing panes, additive shaft cards, a bright
// patch on the floor.
//
// Builders (meshes unless noted)
//   wall(opts)                 a wall run with square or arched openings cut in it; anchors: one per opening
//   windowFrame(opts)          jambs, sill, arch moulding, bars and (optionally) glowing coloured fan panes
//   shaftCards(opts)           additive cards slanting down from a window (use kitBMaterials().shaft)
//   lightPatch(opts)           the window's shape thrown on the floor: bright panes with dark bars between
//   skyline(opts)              roofs with lit windows to stand outside a window at night
//   ceiling(opts), beamRow     a flat ceiling with fat beams under it
//   checker(opts), boards(opts) floors;  wainscot(opts) panelling;  cornice(opts)
//   rug(opts), banner(opts), curtain(opts)
//   dais(opts)                 a stepped platform (steps on three sides)
//   column(opts), doorway(opts) (anchors: light, behind the open leaf)
//   desk(opts), chair(opts), pew(opts), stool(), bookshelf(opts), fileStack(opts), paperPile(opts), scroll()
//   clerkCounter(opts)         a counter with a brass grille, a hatch and a bell
//   hangingLamp(opts), deskLamp(opts), sconce(opts), chandelier(opts), candle()   anchors: lamp
//   fireplace(opts)            anchors: fire
//   glyph(kind, s)             'orb' | 'coin' | 'crown' | 'tide': the four reel symbols, as chunky solids
//   reelDrum(opts)             one eight-sided reel with a glyph on every face (axis along X, for instancing)
//   reelHouse(opts)            the cabinet the three Reels of Assay turn in; anchors: reels[3], lever, slip
//   lever(opts)                { base, arm } the arm pivots at its origin
//   lotDrum(opts)              { cradle, drum, hatch } + anchors: the tumbler every name goes into; drum turns
//                              about X at anchors.axle, the hatch hinges at anchors.hinge (drum space)
//   scales(opts), horn(opts), gear(opts), globe(opts), telescope(opts), teaSet(), inkstand(), sealPress(opts)
//   mintSeal(opts)             the seal of the Mint: a studded brass ring round a balance under a flame
//   kitBMaterials()            wall / shaft / glass materials on top of kitMaterials()
//   setShell(spec)             the boilerplate every set shares: cameras, frame(), view(), lamps, setPower(), update()

import { m4, rng, DEG, rgb } from '../math.js';
import {
  sphere, ellipsoid, cylinder, lathe, torus, box, roundedBox, extrude, tube, curve, plane, quad, fromArrays,
  merge, tint, place, setGlow, setOutline, mirrorX, scale as scaleMesh,
} from '../mesh.js';
import { material, group } from '../scene.js';
import { PAL, wonk, kitMaterials } from './kit.js';

/** Interior colours: saturated cloth and paint, brass, cool plaster. Sets pick from these and from kit.js PAL. */
export const KB = {
  plaster: '#ffe6c2', plasterCool: '#dfe2ff', plasterRose: '#ffd2c4', stoneBlue: '#8f9df0', stoneDeep: '#5a66c8',
  wine: '#c23a5e', wineDark: '#8e2850', plum: '#7a4fc4', plumDark: '#5236a0', teal: '#27b8a8', tealDark: '#1c8c9a',
  emerald: '#2fba7e', emeraldDark: '#1f8f72', royal: '#3b62d8', royalDark: '#2a44a8', navy: '#27336e',
  brass: '#ffc94a', brassDark: '#e0932e', copper: '#ff9a5a', iron: '#3b4a7a',
  wood: '#d98a4e', woodRed: '#c8643e', woodDark: '#9a5236', woodPale: '#f0b574',
  parchment: '#fff4d2', paper: '#fffaf0', ribbon: '#f4573f', baize: '#35b884',
  flame: '#ffb040', cold: '#8fe8ff', coldDeep: '#49b8f4',
  books: ['#f4573f', '#35c9b5', '#ffd24a', '#3f78e0', '#8a6be0', '#ff8fb0', '#86de57', '#ff9a3c', '#fff1d0'],
};

const R = (seed) => rng(Math.floor(seed * 7919) + 31);
const keep = (mesh, anchors) => { mesh.anchors = anchors; return mesh; };
const bx = (w, h, d, x, y, z, c, rx = 0, ry = 0, rz = 0) => tint(place(box(w, h, d), x, y, z, rx, ry, rz), c);
const rb = (w, h, d, rad, x, y, z, c, rx = 0, ry = 0, rz = 0) => tint(place(roundedBox(w, h, d, rad, 1), x, y, z, rx, ry, rz), c);
const cyl = (r0, r1, h, seg, x, y, z, c, rx = 0, ry = 0, rz = 0) => tint(place(cylinder(r0, r1, h, seg), x, y, z, rx, ry, rz), c);

/** Materials for interiors, on top of kitMaterials(): { ...kit, wall, shaft, shaftHard }. */
export function kitBMaterials() {
  return {
    ...kitMaterials(),
    /** walls, ceilings, anything that encloses the room: receives shadows, casts none, no rim */
    wall: material({ name: 'kitb-wall', rim: 0, bandEdge: -0.2, outline: { width: 1.9, self: 0.65 }, castShadow: false }),
    /** additive window shafts (shaftCards) */
    shaft: material({ kind: 'beam', name: 'kitb-shaft', beam: { power: 0.6, near: 0.3, far: 0.04, steps: 0 }, outline: false }),
  };
}

// ------------------------------------------------------------------------------------ walls and windows

const arch3 = (cx, y, hw, rise, n = 8) => archPts(cx, y, hw, rise, n).map((p) => [p[0], p[1], 0]);
function archPts(cx, y, hw, rise, n = 8) { const out = []; for (let i = 0; i <= n; i++) { const a = Math.PI * (1 - i / n); out.push([cx + Math.cos(a) * hw, y + Math.sin(a) * rise]); } return out; }

/**
 * A wall run, `w` wide and `h` high, with openings cut in it. Origin: bottom centre of the room face,
 * which faces +Z; the wall goes back `t` behind z = 0.
 *   openings  [{ x (centre), w, sill (0 = a doorway), top (y of the highest point), arch (true: half-round head) }]
 * anchors: openings[i] = [x, sill, 0] and tops[i] = [x, top, 0]
 */
export function wall({ w = 10, h = 5, t = 0.3, color = KB.plaster, openings = [] } = {}) {
  const parts = [], ops = [...openings].sort((a, b) => a.x - b.x);
  let cur = -w / 2;
  const solid = (x0, x1) => { if (x1 - x0 > 0.001) parts.push(place(box(x1 - x0, h, t), (x0 + x1) / 2, h / 2, -t / 2)); };
  for (const o of ops) {
    const l = o.x - o.w / 2, r = o.x + o.w / 2, sill = o.sill || 0;
    solid(cur, l);
    if (sill > 0) parts.push(place(box(o.w, sill, t), o.x, sill / 2, -t / 2));
    if (o.arch) {
      const rise = Math.min(o.w / 2, o.top - sill - 0.05), spring = o.top - rise;
      parts.push(place(extrude([...archPts(o.x, spring, o.w / 2, rise, 10), [r, h], [l, h]], t, { crease: 30 }), 0, 0, -t / 2));
    } else if (h - o.top > 0.001) parts.push(place(box(o.w, h - o.top, t), o.x, (h + o.top) / 2, -t / 2));
    cur = r;
  }
  solid(cur, w / 2);
  return keep(tint(merge(parts), color), { openings: ops.map((o) => [o.x, o.sill || 0, 0]), tops: ops.map((o) => [o.x, o.top, 0]) });
}

/**
 * What fills a wall opening. Origin: centre of the sill line, in the wall's room face; it is built to sit
 * in an opening `w` wide whose highest point is `h` above the sill.
 *   bars     vertical glazing bars;  transom: a bar at the spring line (or at 62% when square)
 *   fan      null, or a list of colours: glowing coloured panes fill the arched head (stained glass)
 *   glow     0..1 brightness of those panes
 *   sillOut  how far the sill sticks into the room (0 for a doorway arch)
 */
export function windowFrame({ w = 1.6, h = 3, arch = true, color = KB.woodDark, bars = 2, transom = true, fan = null, glow = 0.9, sillOut = 0.16, thick = 0.1, depth = 0.34 } = {}) {
  const parts = [], hw = w / 2, rise = arch ? Math.min(hw, h - 0.05) : 0, spring = h - rise, zc = -depth / 2 + 0.05;
  for (const sx of [-1, 1]) parts.push(place(box(thick, spring, depth), sx * (hw - thick * 0.3), spring / 2, zc));
  if (arch) parts.push(place(tube(arch3(0, spring, hw - thick * 0.3, rise - thick * 0.3, 12), thick * 0.62, 4, { crease: 60, caps: false }), 0, 0, zc, 0, 0, 0, 1, 1, depth / (thick * 1.24)));
  else parts.push(place(box(w + thick * 0.4, thick, depth), 0, h - thick * 0.2, zc));
  if (sillOut > 0) parts.push(place(roundedBox(w + 0.34, 0.1, depth + sillOut, 0.03, 1), 0, -0.04, zc + sillOut / 2));
  const barT = thick * 0.45, ty = arch ? spring : h * 0.62;
  for (let i = 1; i <= bars; i++) { const x = -hw + (w * i) / (bars + 1); parts.push(place(box(barT, arch ? spring : h, barT), x, (arch ? spring : h) / 2, -depth * 0.55)); }
  if (transom) parts.push(place(box(w, barT * 1.3, barT * 1.3), 0, ty, -depth * 0.55));
  const frame = tint(merge(parts), color);
  if (!fan || !arch) return keep(frame, { head: [0, h, 0], spring: [0, spring, 0] });
  const panes = [], n = fan.length, pts = archPts(0, spring + barT, hw - thick, rise - thick, n * 2);
  for (let i = 0; i < n; i++) {
    const a = pts[i * 2], b = pts[i * 2 + 1], c = pts[i * 2 + 2];
    const k = 0.94, sh = (p) => [p[0] * k, spring + barT + (p[1] - spring - barT) * k];
    panes.push(setGlow(tint(place(extrude([[0, spring + barT * 1.2], sh(a), sh(b), sh(c)], 0.03, { crease: 30 }), 0, 0, -depth * 0.55), fan[i]), glow));
    panes.push(tint(place(box(barT * 0.8, Math.hypot(c[0], c[1] - spring), barT * 0.8), c[0] / 2, (c[1] + spring) / 2, -depth * 0.5, 0, 0, -Math.atan2(c[0], c[1] - spring) / DEG), color));
  }
  return keep(merge(frame, ...panes), { head: [0, h, 0], spring: [0, spring, 0] });
}

/**
 * Light slanting in through a window, as additive cards. Origin: the centre of the opening; the light
 * travels along `dir` ([x, y, z], y negative) for `len`. `w` x `h` is the opening; `cards` slices across it.
 * Use the `shaft` material. Vertex colour is the light's colour.
 */
export function shaftCards({ w = 1.4, h = 2.4, dir = [0.3, -1, 1], len = 5, cards = 3, color = '#ffd890', spread = 0.25 } = {}) {
  const l = Math.hypot(dir[0], dir[1], dir[2]), d = [dir[0] / l * len, dir[1] / l * len, dir[2] / l * len], parts = [];
  for (let i = 0; i < cards; i++) {
    const t = cards === 1 ? 0.5 : i / (cards - 1), y = (t - 0.5) * h * 0.8, k = 1 + spread;
    // a card: its top edge lies across the opening, its bottom edge is that edge moved along the light
    const pos = [-w / 2, y, 0, w / 2, y, 0, -w / 2 * k + d[0], y + d[1], d[2], w / 2 * k + d[0], y + d[1], d[2]];
    parts.push(fromArrays(pos, [0, 2, 3, 0, 3, 1], [0, 0, 1, 0, 0, 1, 1, 1], 180));
  }
  return setOutline(tint(merge(parts), color), 0);
}

/**
 * The window thrown on the floor: `panes` bright strips with gaps for the glazing bars, sheared along
 * the light. Origin: the middle of the near edge... of nothing: it is centred on the origin, long axis Z.
 * Lay it on the floor (y about 0.006) with the `flat` material; it glows, so shadow does not dull it.
 */
export function lightPatch({ w = 1.5, d = 2.6, panes = 3, shear = 0.3, color = '#ffe2a0', glow = 0.55, rows = 2, arch = true } = {}) {
  const parts = [], pw = w / panes, gap = 0.07;
  for (let i = 0; i < panes; i++) for (let j = 0; j < rows; j++) {
    const top = arch && j === rows - 1, rd = d / rows;
    let m;
    if (top) { const hw = (pw - gap) / 2, edge = Math.abs(i - (panes - 1) / 2) / Math.max(1, panes / 2), far = rd * (1 - 0.45 * edge) - gap; m = fromArrays([-hw, 0, 0, hw, 0, 0, -hw * 0.7, 0, -far, hw * 0.7, 0, -far], [0, 1, 2, 1, 3, 2], null, 180); m = place(m, 0, 0, rd / 2 - gap / 2); }
    else m = plane(pw - gap, rd - gap);
    parts.push(place(m, -w / 2 + pw * (i + 0.5), 0, d / 2 - rd * (j + 0.5)));
  }
  const m = merge(parts), P = m.positions;
  for (let i = 0; i < P.length; i += 3) P[i] += -P[i + 2] * shear;
  return setOutline(setGlow(tint(m, color), glow), 0);
}

/** A row of roofs, gables and a tower with lit windows, flat-ish, to stand outside a window at night. Origin: bottom centre; faces +Z. */
export function skyline({ w = 8, h = 2.2, seed = 1, color = '#3b4fb8', color2 = '#5468d0', lit = '#ffd070', glow = 0.95, lanterns = true } = {}) {
  const r = R(seed), parts = []; let x = -w / 2;
  while (x < w / 2) {
    const bw = 0.7 + r() * 0.9, bh = h * (0.35 + r() * 0.5), cx = x + bw / 2, col = r() < 0.5 ? color : color2;
    parts.push(bx(bw, bh, 0.3, cx, bh / 2, 0, col));
    if (r() < 0.75) parts.push(tint(place(extrude([[-bw * 0.56, 0], [bw * 0.56, 0], [0, bw * (0.35 + r() * 0.3)]], 0.34, { crease: 30 }), cx, bh, 0), r() < 0.5 ? '#4a3fb0' : '#6a4ac4'));
    else parts.push(cyl(bw * 0.22, 0.02, bw * 0.8, 6, cx, bh, 0, '#6a4ac4'));
    const nw = 1 + Math.floor(r() * 3);
    for (let i = 0; i < nw; i++) if (r() < 0.8) parts.push(setGlow(bx(0.13, 0.19, 0.04, cx + (i - (nw - 1) / 2) * 0.26, bh * (0.45 + r() * 0.35), 0.16, lit), glow));
    x += bw * (0.8 + r() * 0.25);
  }
  if (lanterns) for (let i = 0; i < Math.floor(w * 1.2); i++) parts.push(setGlow(tint(place(sphere(0.07, 6, 4), -w / 2 + r() * w, h * (0.15 + r() * 0.7), 0.3 + r() * 0.3), PAL.lanterns[i % PAL.lanterns.length]), 0.95));
  return setOutline(merge(parts), 0.5);
}

/** A flat ceiling `w` x `d` at height 0 (its underside), centred, with `beams` fat joists running front to back and one tie along the back. */
export function ceiling({ w = 12, d = 8, color = KB.plasterCool, beams = 5, beam = KB.woodDark, bw = 0.3, bh = 0.34 } = {}) {
  const parts = [bx(w, 0.2, d, 0, 0.1, 0, color)];
  for (let i = 0; i < beams; i++) { const x = -w / 2 + (w * (i + 0.5)) / beams; parts.push(rb(bw, bh, d, 0.04, x, -bh / 2, 0, beam, 0, 0, (i % 2 ? 1 : -1) * 1.2)); }
  parts.push(rb(w, bh * 1.2, bw * 1.2, 0.04, 0, -bh * 0.6, -d / 2 + bw * 0.6, beam));
  return merge(parts);
}

/** A chequered floor, centred, top at y = 0. Tiles are single quads; `colors` alternate. Bake it with the ground material. */
export function checker({ w = 12, d = 10, nx = 12, nz = 10, colors = ['#ffe9c4', '#ffb89a'], seed = 1, jitter = 0.03 } = {}) {
  const r = R(seed), parts = [[], []], tw = w / nx, td = d / nz;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) parts[(i + j) % 2].push(place(plane(tw, td), -w / 2 + tw * (i + 0.5), (r() - 0.5) * 0.001, -d / 2 + td * (j + 0.5), 0, (r() - 0.5) * jitter * 60, 0));
  return setOutline(merge(tint(merge(parts[0]), colors[0]), tint(merge(parts[1]), colors[1])), 0);
}

/** Floorboards running front to back, centred, top at y = 0; a few shades of one colour. */
export function boards({ w = 12, d = 10, n = 14, colors = ['#f0b070', '#e8a260', '#f6ba7e'], seed = 1 } = {}) {
  const r = R(seed), parts = [], bw = w / n;
  for (let i = 0; i < n; i++) parts.push(tint(place(plane(bw - 0.03, d), -w / 2 + bw * (i + 0.5), 0, 0), colors[Math.floor(r() * colors.length)]));
  parts.push(tint(place(plane(w, d), 0, -0.004, 0), '#b8703e'));
  return setOutline(merge(parts), 0);
}

/**
 * Panelling along a wall. Origin: bottom centre, face toward +Z, standing `out` proud of z = 0.
 * A base board, `n` raised panels with a bead inside each, a cap rail.
 */
export function wainscot({ w = 10, h = 1.3, n = 8, color = KB.plum, panel = null, bead = null, rail = null, out = 0.06, skip = [] } = {}) {
  const parts = [bx(w, h, out, 0, h / 2, out / 2, color)], pw = w / n;
  for (let i = 0; i < n; i++) {
    if (skip.includes(i)) continue;
    const x = -w / 2 + pw * (i + 0.5);
    parts.push(rb(pw - 0.16, h - 0.42, 0.05, 0.02, x, h / 2 + 0.02, out + 0.02, panel || color));
    if (bead) parts.push(bx(pw - 0.32, 0.03, 0.03, x, h - 0.34, out + 0.05, bead), bx(pw - 0.32, 0.03, 0.03, x, 0.38, out + 0.05, bead));
  }
  parts.push(rb(w, 0.1, out + 0.1, 0.03, 0, h, out / 2 + 0.03, rail || color), bx(w, 0.16, out + 0.05, 0, 0.08, out / 2 + 0.025, rail || color));
  return merge(parts);
}

/** A moulding along the top of a wall: origin at its centre, `w` long, facing +Z. A fat roll over a row of dentils. */
export function cornice({ w = 10, color = KB.plasterCool, dentil = null, n = 0 } = {}) {
  const parts = [rb(w, 0.2, 0.22, 0.06, 0, 0, 0.1, color)];
  const k = n || Math.round(w / 0.5);
  if (dentil) for (let i = 0; i < k; i++) parts.push(bx(0.16, 0.12, 0.1, -w / 2 + (w * (i + 0.5)) / k, -0.15, 0.06, dentil));
  return merge(parts);
}

// ------------------------------------------------------------------------------------ cloth

/**
 * A rug lying on the floor, centred, `w` (x) by `d` (z): border, field, an inner line, a lozenge
 * medallion, fringed short ends. A few millimetres thick so it reads against the floor ink.
 */
export function rug({ w = 4, d = 2.6, field = KB.wine, border = KB.brass, line = KB.parchment, medallion = KB.royal, fringe = KB.parchment, round = false } = {}) {
  const parts = [], y = 0.012;
  if (round) {
    parts.push(cyl(w / 2, w / 2, y, 20, 0, 0, 0, border), cyl(w / 2 - 0.16, w / 2 - 0.16, y, 20, 0, 0.004, 0, field), cyl(w * 0.3, w * 0.3, y, 16, 0, 0.008, 0, line), cyl(w * 0.3 - 0.07, w * 0.3 - 0.07, y, 16, 0, 0.012, 0, medallion));
    return setOutline(merge(parts), 0.6);
  }
  parts.push(bx(w, y, d, 0, y / 2, 0, border), bx(w - 0.3, y, d - 0.3, 0, y / 2 + 0.004, 0, field), bx(w - 0.62, y, d - 0.62, 0, y / 2 + 0.008, 0, line), bx(w - 0.72, y, d - 0.72, 0, y / 2 + 0.012, 0, field));
  const loz = (s, c, dy) => tint(place(cylinder(s, s, y, 4), 0, dy, 0, 0, 0, 0, 1, 1, Math.min(1, (d * 0.3) / s)), c);
  parts.push(loz(Math.min(w, d) * 0.36, line, 0.016), loz(Math.min(w, d) * 0.3, medallion, 0.02), loz(Math.min(w, d) * 0.13, border, 0.024));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(tint(place(cylinder(0.14, 0.14, y, 4), sx * (w / 2 - 0.62), 0.016, sz * (d / 2 - 0.62)), border));
  const nf = Math.round(d / 0.14);
  for (const sx of [-1, 1]) for (let i = 0; i < nf; i++) parts.push(bx(0.16, 0.008, 0.05, sx * (w / 2 + 0.07), 0.005, -d / 2 + (d * (i + 0.5)) / nf, fringe));
  return setOutline(merge(parts), 0.6);
}

/**
 * A hanging banner: a rod, a long cloth with a swallow tail, a contrasting border and a device.
 * Origin: the middle of the rod; hangs down toward -Y, faces +Z.   device: 'orb' | 'coin' | 'crown' | 'tide' | 'ring' | null
 */
export function banner({ w = 0.9, h = 2.4, color = KB.wine, trim = KB.brass, device = 'ring', deviceColor = KB.parchment, tail = 0.35, rod = KB.brassDark } = {}) {
  const hw = w / 2, parts = [];
  parts.push(tint(place(cylinder(0.035, 0.035, w + 0.3, 6), -hw - 0.15, 0, 0, 0, 0, -90), rod));
  for (const sx of [-1, 1]) parts.push(tint(place(sphere(0.06, 6, 4), sx * (hw + 0.15), 0, 0), rod));
  parts.push(tint(place(extrude([[-hw, 0], [hw, 0], [hw, -h], [0, -h + tail], [-hw, -h]], 0.03, { crease: 30 }), 0, 0, 0), trim));
  const k = 0.11;
  parts.push(tint(place(extrude([[-hw + k, -k * 0.6], [hw - k, -k * 0.6], [hw - k, -h + k * 1.8], [0, -h + tail + k * 1.1], [-hw + k, -h + k * 1.8]], 0.03, { crease: 30 }), 0, 0, 0.012), color));
  if (device === 'ring') parts.push(tint(place(torus(w * 0.22, w * 0.05, 12, 4), 0, -h * 0.4, 0.04, 90, 0, 0), deviceColor), tint(place(cylinder(w * 0.09, w * 0.09, 0.03, 8), 0, -h * 0.4, 0.035, 90, 0, 0), deviceColor));
  else if (device) parts.push(place(glyph(device, w * 0.26), 0, -h * 0.4, 0.04));
  return merge(parts);
}

/** A heavy curtain gathered to one side of a window. Origin: top centre of the cloth; `side` -1 hangs left of the origin, +1 right. */
export function curtain({ w = 0.7, h = 3.4, color = KB.teal, tie = KB.brass, side = 1, folds = 4 } = {}) {
  const parts = [], fw = w / folds;
  for (let i = 0; i < folds; i++) {
    const t = i / (folds - 1 || 1), x = side * (fw * (i + 0.5)), waist = 0.72 - 0.25 * t;
    parts.push(tint(place(lathe([[0, -h], [fw * 0.62, -h], [fw * 0.5 * waist, -h * 0.62], [fw * 0.62, -h * 0.25], [fw * 0.6, 0], [0, 0]], 6, { crease: 180 }), x, 0, 0), i % 2 ? color : rgb(color).map((c) => c * 0.86)));
  }
  parts.push(tint(place(torus(w * 0.34, 0.05, 8, 4), side * w * 0.5, -h * 0.62, 0, 0, 0, 0, 1.2, 1, 0.6), tie));
  return merge(parts);
}

// ------------------------------------------------------------------------------------ structure

/** A stepped platform: `n` slabs, each `run` smaller all round than the one below. The top is w x d at y = n * rise. Centred on the origin. */
export function dais({ w = 4, d = 2, n = 3, rise = 0.16, run = 0.3, color = '#fff0d4', edge = KB.wine, carpet = null } = {}) {
  const parts = [];
  for (let k = 0; k < n; k++) {
    const g = (n - 1 - k) * run;
    parts.push(rb(w + g * 2, rise, d + g * 2, 0.03, 0, rise * (k + 0.5), 0, color));
    if (edge) parts.push(bx(w + g * 2 + 0.02, rise * 0.3, d + g * 2 + 0.02, 0, rise * (k + 0.85), 0, edge));
  }
  if (carpet) { // a runner down the front steps
    for (let k = 0; k < n; k++) { const g = (n - 1 - k) * run; parts.push(bx(1.1, 0.02, run + 0.06, 0, rise * (k + 1) + 0.012, d / 2 + g - run / 2 + 0.03, carpet), bx(1.1, rise, 0.02, 0, rise * (k + 0.5), d / 2 + g + 0.012, carpet)); }
    parts.push(bx(1.1, 0.02, d - run, 0, rise * n + 0.012, -run / 2, carpet));
  }
  return keep(merge(parts), { top: [0, n * rise, 0] });
}

/** A fat column with a base and a cushion capital; stands on y = 0. */
export function column({ h = 4.5, r = 0.3, color = '#fff0d4', band = KB.brass, seg = 10 } = {}) {
  const shaft = lathe([[0, 0], [r * 1.5, 0], [r * 1.5, 0.14], [r * 1.15, 0.24], [r, 0.4], [r * 0.9, h - 0.5], [r * 1.2, h - 0.34], [r * 1.5, h - 0.16], [r * 1.5, h], [0, h]], seg, { crease: 50 });
  return merge(tint(shaft, color), tint(place(torus(r * 1.02, 0.05, seg, 4), 0, 0.44, 0), band), tint(place(torus(r * 0.94, 0.05, seg, 4), 0, h - 0.56, 0), band));
}

/**
 * A doorway to stand in a wall opening `w` wide, `h` to the top: frame, a fanlight, and a door leaf swung
 * open into the room by `open` degrees (hinged on the left jamb as seen from the room; side: -1 hinges right).
 * Origin: centre of the threshold, facing +Z. anchors: light (a pace behind the wall: put a warm lamp there), knob
 */
export function doorway({ w = 1.3, h = 2.5, open = 55, color = KB.teal, frame = KB.parchment, knob = KB.brass, side = 1, panels = 2 } = {}) {
  const hw = w / 2, parts = [], t = 0.12;
  for (const sx of [-1, 1]) parts.push(rb(t, h, 0.4, 0.03, sx * (hw + t / 2), h / 2, -0.12, frame));
  parts.push(rb(w + t * 2 + 0.16, t * 1.2, 0.46, 0.03, 0, h + t * 0.5, -0.12, frame));
  const leaf = [rb(w, h - 0.04, 0.08, 0.02, hw, h / 2, 0, color)];
  for (let i = 0; i < panels; i++) { const ph = (h - 0.5) / panels; leaf.push(rb(w - 0.3, ph - 0.14, 0.04, 0.02, hw, 0.25 + ph * (i + 0.5), 0.045, rgb(color).map((c) => Math.min(1, c * 1.14)))); }
  leaf.push(tint(place(sphere(0.06, 8, 5), w - 0.14, h * 0.45, 0.09), knob));
  const lm = place(merge(leaf), -hw, 0, 0, 0, -open, 0);
  parts.push(side > 0 ? lm : mirrorX(lm));
  return keep(merge(parts), { light: [0, h * 0.62, -1.3], knob: [side * (-hw + Math.cos(open * DEG) * (w - 0.14)), h * 0.45, Math.sin(open * DEG) * (w - 0.14)] });
}

// ------------------------------------------------------------------------------------ furniture

/**
 * A heavy desk, sitter behind it at -Z, visitors at +Z. Fat top with a lip, two pedestals with drawers, a modesty panel.
 * anchors: top (centre of the top), lamp (back left corner of the top), lip (under the front edge: where a thumbnail-sized thing goes), seat
 */
export function desk({ w = 2.2, d = 1.0, h = 0.82, color = KB.woodRed, top = KB.baize, trim = KB.brass, seed = 1, lean = 0.02 } = {}) {
  const r = R(seed), parts = [], hw = w / 2, pw = w * 0.27;
  for (const sx of [-1, 1]) {
    parts.push(rb(pw, h - 0.1, d - 0.16, 0.04, sx * (hw - pw / 2 - 0.05), (h - 0.1) / 2, 0, color));
    for (let k = 0; k < 3; k++) {
      const y = 0.16 + k * ((h - 0.3) / 3) + 0.06;
      parts.push(rb(pw - 0.12, (h - 0.3) / 3 - 0.05, 0.04, 0.015, sx * (hw - pw / 2 - 0.05), y, d / 2 - 0.07, rgb(color).map((c) => Math.min(1, c * 1.12))));
      parts.push(tint(place(sphere(0.03, 6, 4), sx * (hw - pw / 2 - 0.05), y, d / 2 - 0.04), trim));
    }
  }
  parts.push(bx(w - pw * 2 - 0.1, h * 0.5, 0.05, 0, h * 0.66, d / 2 - 0.14, rgb(color).map((c) => c * 0.9)));
  parts.push(rb(w + 0.16, 0.1, d + 0.12, 0.035, 0, h - 0.05, 0, color));
  parts.push(bx(w - 0.14, 0.02, d - 0.16, 0, h + 0.008, 0, top));
  const m = keep(merge(parts), { top: [0, h + 0.02, 0], lamp: [-hw + 0.3, h + 0.02, -d / 2 + 0.28], lip: [hw * 0.3, h - 0.11, d / 2 + 0.03], seat: [0, 0, -d / 2 - 0.5] });
  return wonk(m, { lean: lean * (r() > 0.5 ? 1 : -1), twist: (r() - 0.5) * 3, bulge: 0.03 });
}

/** A chair facing +Z. `high`: a tall carved back (a magistrate's, a chancellor's). */
export function chair({ high = false, color = KB.woodDark, seat = KB.wine, s = 1, knob = KB.brass } = {}) {
  const parts = [], sh = 0.42, bh = high ? 1.25 : 0.62;
  for (const [x, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) parts.push(cyl(0.04, 0.03, sh, 6, x * 0.2, 0, z * 0.19, color, 0, 0, 0));
  parts.push(rb(0.52, 0.09, 0.5, 0.035, 0, sh + 0.02, 0, color), rb(0.44, 0.07, 0.42, 0.03, 0, sh + 0.08, 0.01, seat));
  parts.push(rb(0.5, bh, 0.07, 0.03, 0, sh + bh / 2 + 0.04, -0.23, color, -5, 0, 0), rb(0.38, bh - 0.2, 0.05, 0.03, 0, sh + bh / 2 + 0.04, -0.2, seat, -5, 0, 0));
  if (high) { parts.push(tint(place(extrude([[-0.3, 0], [0.3, 0], [0.22, 0.14], [0, 0.26], [-0.22, 0.14]], 0.07, { crease: 30 }), 0, sh + bh + 0.02, -0.29, -5, 0, 0), color)); for (const sx of [-1, 1]) parts.push(tint(place(sphere(0.05, 6, 4), sx * 0.26, sh + bh + 0.06, -0.29), knob)); }
  return scaleMesh(merge(parts), s);
}

/** A public bench with a slatted back, `w` long, facing +Z. */
export function pew({ w = 2.2, color = KB.wood, dark = KB.woodDark, seed = 1 } = {}) {
  const r = R(seed), parts = [];
  for (const sx of [-1, 1]) parts.push(tint(place(extrude([[-0.24, 0], [0.24, 0], [0.24, 0.44], [0.02, 0.5], [-0.06, 0.98], [-0.24, 1.02]], 0.08, { crease: 30 }), sx * (w / 2 - 0.05), 0, 0, 0, -90, 0), dark));
  parts.push(rb(w, 0.07, 0.46, 0.025, 0, 0.44, 0.02, color));
  for (let i = 0; i < 3; i++) parts.push(rb(w - 0.06, 0.12, 0.04, 0.015, 0, 0.6 + i * 0.16, -0.2 + i * 0.012, i % 2 ? color : KB.woodPale, -6, 0, (r() - 0.5) * 1.5));
  return merge(parts);
}

/** A three-legged stool. */
export function stool({ color = KB.wood, seat = KB.teal } = {}) {
  const parts = [cyl(0.2, 0.2, 0.06, 10, 0, 0.4, 0, color), cyl(0.17, 0.17, 0.04, 10, 0, 0.455, 0, seat)];
  for (let i = 0; i < 3; i++) { const a = i * 120 * DEG; parts.push(cyl(0.035, 0.028, 0.42, 5, Math.sin(a) * 0.13, 0, Math.cos(a) * 0.13, color)); }
  return merge(parts);
}

/**
 * Shelves of books, standing on y = 0, front toward +Z. Books are single boxes in the kit's book colours,
 * some leaning, with a gap or a box file here and there. `fill` 0..1 is how full the shelves are.
 */
export function bookshelf({ w = 1.6, h = 2.6, d = 0.42, rows = 4, seed = 1, color = KB.woodDark, back = KB.navy, colors = KB.books, fill = 0.9, top = true, lean = 0.015 } = {}) {
  const r = R(seed), parts = [], t = 0.07, rh = (h - t) / rows;
  parts.push(bx(w, h, 0.04, 0, h / 2, -d / 2 + 0.02, back));
  for (const sx of [-1, 1]) parts.push(rb(t, h, d, 0.02, sx * (w / 2 - t / 2), h / 2, 0, color));
  for (let k = 0; k <= rows; k++) parts.push(rb(w + (k === rows ? 0.12 : 0), t, d + (k === rows ? 0.08 : 0), 0.02, 0, k * rh + t / 2, 0, color));
  for (let k = 0; k < rows; k++) {
    let x = -w / 2 + t + 0.03;
    while (x < w / 2 - t - 0.12) {
      const bw = 0.06 + r() * 0.07, bh = rh * (0.55 + r() * 0.32), col = colors[Math.floor(r() * colors.length)];
      if (r() < fill) {
        if (r() < 0.12) { parts.push(bx(bh * 0.9, bw * 1.4, d * 0.6, x + bh * 0.45, k * rh + t + bw * 0.7, 0.03, col)); x += bh * 0.9 + 0.02; continue; } // one lying flat
        const tilt = r() < 0.14 ? (r() < 0.5 ? 9 : -9) : 0;
        parts.push(bx(bw, bh, d * 0.62, x + bw / 2, k * rh + t + bh / 2, 0.03 + r() * 0.03, col, 0, 0, tilt));
        if (r() < 0.4) parts.push(bx(bw + 0.004, 0.03, d * 0.62 + 0.004, x + bw / 2, k * rh + t + bh * 0.78, 0.03 + 0.03, KB.brass, 0, 0, tilt));
      }
      x += bw + 0.012;
    }
  }
  if (top) parts.push(tint(place(extrude([[-w / 2 - 0.06, 0], [w / 2 + 0.06, 0], [w * 0.2, 0.2], [0, 0.3], [-w * 0.2, 0.2]], 0.1, { crease: 30 }), 0, h + t * 0.4, d / 2 - 0.08), color));
  return wonk(keep(merge(parts), { top: [0, h + 0.1, 0] }), { lean: lean * (r() > 0.5 ? 1 : -1), bulge: 0.02 });
}

/** A leaning tower of files tied with ribbon: `n` bundles, each a little askew. Stands on y = 0. anchors: top */
export function fileStack({ n = 7, seed = 1, w = 0.42, d = 0.32, colors = [KB.parchment, '#ffe6b0', '#dfe8ff', '#ffd9c8'], ribbon = KB.ribbon, lean = 0.08 } = {}) {
  const r = R(seed), parts = []; let y = 0, ox = 0;
  for (let i = 0; i < n; i++) {
    const hh = 0.07 + r() * 0.09, yaw = (r() - 0.5) * 34; ox += (r() - 0.35) * lean;
    parts.push(rb(w * (0.9 + r() * 0.2), hh, d * (0.9 + r() * 0.2), 0.012, ox, y + hh / 2, (r() - 0.5) * 0.05, colors[Math.floor(r() * colors.length)], 0, yaw, 0));
    if (r() < 0.6) parts.push(bx(0.05, hh + 0.012, d * 1.14, ox, y + hh / 2, 0, r() < 0.7 ? ribbon : KB.teal, 0, yaw, 0));
    y += hh + 0.004;
  }
  return keep(merge(parts), { top: [ox, y, 0] });
}

/** Loose sheets fanned on a surface. */
export function paperPile({ n = 4, seed = 1, s = 0.28, color = KB.paper } = {}) {
  const r = R(seed), parts = [];
  for (let i = 0; i < n; i++) parts.push(bx(s, 0.008, s * 1.35, (r() - 0.5) * 0.1, 0.005 + i * 0.009, (r() - 0.5) * 0.08, i % 3 === 2 ? KB.parchment : color, 0, (r() - 0.5) * 50, 0));
  return merge(parts);
}

/** A rolled writ with a ribbon and a wax seal, lying along X. */
export function scroll({ len = 0.42, color = KB.parchment, ribbon = KB.ribbon } = {}) {
  return merge(cyl(0.045, 0.045, len, 8, -len / 2, 0.045, 0, color, 0, 0, -90), tint(place(torus(0.048, 0.014, 8, 4), 0, 0.045, 0, 0, 0, 90), ribbon), cyl(0.04, 0.04, 0.02, 8, 0.02, 0.085, 0.02, ribbon));
}

/**
 * A clerks' counter facing +Z: a panelled front, a fat top, a brass grille standing on it with an arched
 * hatch in the middle, a bell, a ledger. `w` long.  anchors: hatch, bell, top, lamp
 */
export function clerkCounter({ w = 3, h = 1.0, d = 0.7, color = KB.teal, top = KB.woodPale, brass = KB.brass, bars = 9, seed = 1 } = {}) {
  const parts = [], n = Math.max(2, Math.round(w / 0.75)), gh = 0.95;
  parts.push(rb(w, h, d, 0.04, 0, h / 2, 0, color));
  for (let i = 0; i < n; i++) parts.push(rb(w / n - 0.14, h - 0.34, 0.04, 0.02, -w / 2 + (w * (i + 0.5)) / n, h / 2 - 0.02, d / 2 + 0.01, rgb(color).map((c) => Math.min(1, c * 1.16))));
  parts.push(rb(w + 0.2, 0.09, d + 0.2, 0.03, 0, h + 0.03, 0, top));
  const y0 = h + 0.08;
  parts.push(bx(w, 0.05, 0.06, 0, y0 + gh, 0, brass), bx(w, 0.05, 0.06, 0, y0 + 0.02, 0, brass));
  for (let i = 0; i <= bars * 2; i++) { const x = -w / 2 + 0.03 + ((w - 0.06) * i) / (bars * 2); if (Math.abs(x) < 0.3) continue; parts.push(cyl(0.02, 0.02, gh, 5, x, y0, 0, brass)); }
  parts.push(tint(place(tube(arch3(0, y0 + 0.36, 0.3, 0.3, 8), 0.028, 5, { caps: false }), 0, 0, 0), brass));
  for (const sx of [-1, 1]) parts.push(cyl(0.028, 0.028, 0.36, 5, sx * 0.3, y0, 0, brass));
  parts.push(bx(0.6, gh - 0.66, 0.03, 0, y0 + 0.66 + (gh - 0.66) / 2, 0, brass));
  parts.push(tint(place(lathe([[0, 0], [0.09, 0], [0.085, 0.04], [0.04, 0.09], [0, 0.1]], 8, { crease: 180 }), w * 0.3, y0 - 0.005, 0.2), brass), tint(place(sphere(0.02, 5, 4), w * 0.3, y0 + 0.11, 0.2), brass));
  parts.push(bx(0.36, 0.05, 0.26, -w * 0.3, y0 + 0.02, 0.2, KB.wine, 0, 12, 0), bx(0.32, 0.012, 0.22, -w * 0.3, y0 + 0.05, 0.2, KB.paper, 0, 12, 0));
  return wonk(keep(merge(parts), { hatch: [0, y0 + 0.3, 0], bell: [w * 0.3, y0 + 0.1, 0.2], top: [0, y0, 0], lamp: [0, y0 + gh + 0.5, 0.2] }), { lean: 0.012 * (R(seed)() > 0.5 ? 1 : -1) });
}

// ------------------------------------------------------------------------------------ lamps and fire

const bulb = (r, c = '#fff2c0', g = 0.95) => setGlow(tint(sphere(r, 8, 6), c), g);

/**
 * A lamp on a chain. Origin: the ceiling hook; it hangs `drop` down.   shape: 'cone' | 'globe' | 'lantern'
 * anchors: lamp (the light source)
 */
export function hangingLamp({ drop = 1.4, r = 0.3, shade = KB.emerald, metal = KB.brass, shape = 'cone', glass = '#ffe9a8' } = {}) {
  const parts = [cyl(0.014, 0.014, drop, 4, 0, -drop, 0, metal), cyl(0.07, 0.05, 0.06, 6, 0, -0.06, 0, metal)];
  let ly = -drop - r * 0.3;
  if (shape === 'cone') {
    parts.push(tint(place(lathe([[r, 0], [r * 1.02, 0.03], [r * 0.3, r * 0.62], [r * 0.16, r * 0.8], [0, r * 0.82]], 12, { crease: 50 }), 0, -drop - r * 0.5, 0), shade));
    parts.push(tint(place(torus(r, 0.022, 12, 4), 0, -drop - r * 0.5 + 0.01, 0), metal));
    parts.push(place(bulb(r * 0.3, glass), 0, -drop - r * 0.42, 0)); ly = -drop - r * 0.45;
  } else if (shape === 'globe') {
    parts.push(place(bulb(r, glass, 0.9), 0, -drop - r, 0), tint(place(torus(r * 0.6, 0.03, 10, 4), 0, -drop - r * 0.18, 0), metal), cyl(r * 0.3, r * 0.2, 0.08, 8, 0, -drop - r * 2.08, 0, metal)); ly = -drop - r;
  } else {
    parts.push(cyl(r * 0.5, r * 0.9, r * 0.3, 6, 0, -drop - r * 0.3, 0, metal), setGlow(tint(place(cylinder(r * 0.72, r * 0.6, r * 1.2, 6), 0, -drop - r * 1.5, 0), glass), 0.92), cyl(r * 0.8, r * 0.5, r * 0.16, 6, 0, -drop - r * 1.66, 0, metal)); ly = -drop - r * 0.9;
  }
  return keep(merge(parts), { lamp: [0, ly, 0] });
}

/** A desk lamp with a coloured glass shade (a banker's lamp, fatter). Stands on y = 0. anchors: lamp */
export function deskLamp({ shade = KB.emerald, metal = KB.brass, s = 1 } = {}) {
  const parts = [tint(lathe([[0, 0], [0.11, 0], [0.1, 0.03], [0.03, 0.06], [0.022, 0.3], [0, 0.3]], 8, { crease: 50 }), metal)];
  parts.push(setGlow(tint(place(lathe([[0.2, 0], [0.2, 0.05], [0.1, 0.13], [0, 0.14]], 10, { crease: 50 }), 0, 0.28, 0, 0, 0, 0, 1, 1, 0.7), shade), 0.35));
  parts.push(place(bulb(0.06), 0, 0.29, 0));
  return keep(scaleMesh(merge(parts), s), { lamp: [0, 0.3 * s, 0.05 * s] });
}

/** A wall bracket with a glowing glass. Origin: where it meets the wall; sticks out toward +Z. anchors: lamp */
export function sconce({ metal = KB.brass, glass = '#ffe0a0', s = 1 } = {}) {
  const m = merge(cyl(0.09, 0.09, 0.03, 8, 0, 0, 0.015, metal, 90, 0, 0), tint(tube(curve([[0, 0, 0.02], [0, -0.06, 0.16], [0, 0.02, 0.24]], 6), 0.02, 5), metal),
    cyl(0.07, 0.09, 0.04, 8, 0, 0.02, 0.24, metal), setGlow(tint(place(lathe([[0.06, 0], [0.1, 0.12], [0.07, 0.24], [0, 0.25]], 8, { crease: 180 }), 0, 0.06, 0.24), glass), 0.95));
  return keep(scaleMesh(m, s), { lamp: [0, 0.2 * s, 0.24 * s] });
}

/** A ring of candles on chains. Origin: the ceiling hook. anchors: lamp (centre of the ring) */
export function chandelier({ drop = 1.6, r = 0.8, arms = 6, metal = KB.brass, glass = '#ffe6a0' } = {}) {
  const parts = [cyl(0.016, 0.016, drop - 0.3, 4, 0, -drop + 0.3, 0, metal), tint(place(torus(r, 0.04, Math.max(10, arms * 2), 4), 0, -drop, 0), metal), tint(place(sphere(0.1, 8, 5), 0, -drop + 0.3, 0), metal)];
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2, x = Math.sin(a) * r, z = Math.cos(a) * r;
    parts.push(tint(tube([[0, -drop + 0.3, 0], [x * 0.5, -drop + 0.12, z * 0.5], [x, -drop, z]], 0.014, 4, { caps: false }), metal));
    parts.push(cyl(0.05, 0.035, 0.04, 6, x, -drop + 0.03, z, metal), cyl(0.026, 0.026, 0.14, 5, x, -drop + 0.07, z, KB.paper), setGlow(tint(place(ellipsoid(0.035, 0.07, 0.035, 6, 4), x, -drop + 0.27, z), glass), 1));
  }
  return keep(merge(parts), { lamp: [0, -drop + 0.2, 0], ring: r });
}

/** A candle in a dish. anchors: lamp */
export function candle({ h = 0.2, metal = KB.brass } = {}) {
  return keep(merge(tint(lathe([[0, 0], [0.08, 0], [0.09, 0.03], [0.03, 0.02], [0, 0.02]], 8, { crease: 180 }), metal), cyl(0.024, 0.024, h, 6, 0, 0.02, 0, KB.paper), setGlow(tint(place(ellipsoid(0.028, 0.055, 0.028, 6, 4), 0, h + 0.07, 0), '#ffe6a0'), 1)), { lamp: [0, h + 0.07, 0] });
}

/** A fireplace with a fat mantel, a glowing hearth and three logs. Origin: bottom centre, facing +Z. anchors: fire, mantel */
export function fireplace({ w = 2.0, h = 1.7, d = 0.5, color = '#fff0d4', inner = '#3a2a6e', trim = KB.brass } = {}) {
  const parts = [], hw = w / 2, ow = w * 0.56, oh = h * 0.6;
  for (const sx of [-1, 1]) parts.push(rb((w - ow) / 2, h, d, 0.04, sx * (hw - (w - ow) / 4), h / 2, d / 2, color));
  parts.push(tint(place(extrude([...archPts(0, oh - ow * 0.3, ow / 2, ow * 0.3, 8), [ow / 2, h], [-ow / 2, h]], d, { crease: 30 }), 0, 0, d / 2), color));
  parts.push(rb(w + 0.36, 0.14, d + 0.24, 0.04, 0, h + 0.05, d / 2 + 0.04, color), rb(w + 0.1, 0.08, d + 0.08, 0.02, 0, h - 0.08, d / 2 + 0.02, trim));
  parts.push(bx(ow, oh, 0.04, 0, oh / 2, 0.06, inner), rb(w + 0.3, 0.07, d + 0.5, 0.02, 0, 0.035, d / 2 + 0.2, '#c8c2ee'));
  parts.push(setGlow(tint(place(ellipsoid(ow * 0.36, oh * 0.3, 0.12, 8, 5), 0, oh * 0.3, 0.2), '#ff8a3a'), 0.95), setGlow(tint(place(ellipsoid(ow * 0.2, oh * 0.22, 0.1, 8, 5), 0.03, oh * 0.28, 0.26), '#ffd66a'), 1));
  for (const [x, rz] of [[-0.2, 80], [0.16, 100], [0, 88]]) parts.push(cyl(0.065, 0.06, ow * 0.6, 6, ow * 0.3, 0.12 + (x === 0 ? 0.1 : 0), 0.3 + x * 0.3, KB.woodDark, 0, 0, rz));
  return keep(merge(parts), { fire: [0, oh * 0.36, d * 0.7], mantel: [0, h + 0.13, d / 2] });
}

// ------------------------------------------------------------------------------------ the Reels and the drum

/** One of the four reel symbols as a chunky solid about 2 * s across, facing +Z, centred on the origin. */
export function glyph(kind, s = 0.2) {
  if (kind === 'orb') return merge(tint(place(ellipsoid(s, s, s * 0.45, 12, 7), 0, 0, 0), '#3f8fe8'), tint(place(ellipsoid(s * 0.3, s * 0.22, s * 0.12, 6, 4), -s * 0.36, s * 0.4, s * 0.34), '#ffffff'));
  if (kind === 'coin') return merge(cyl(s, s, s * 0.22, 12, 0, 0, -s * 0.11, KB.brass, 90, 0, 0), cyl(s * 0.72, s * 0.72, s * 0.1, 12, 0, 0, s * 0.11, KB.brassDark, 90, 0, 0), bx(s * 0.22, s * 0.8, s * 0.1, 0, 0, s * 0.2, KB.brass));
  if (kind === 'crown') return merge(tint(extrude([[-s, -s * 0.6], [s, -s * 0.6], [s, s * 0.55], [s * 0.5, 0], [0, s * 0.8], [-s * 0.5, 0], [-s, s * 0.55]], s * 0.3, { crease: 30 }), '#f4573f'), bx(s * 2.06, s * 0.3, s * 0.36, 0, -s * 0.5, 0, KB.brass));
  if (kind === 'tide') {
    const parts = [];
    for (let i = -1; i <= 1; i++) parts.push(tint(tube(curve([[-s, i * s * 0.58 + s * 0.1, 0], [-s * 0.45, i * s * 0.58 - s * 0.16, 0], [0, i * s * 0.58 + s * 0.12, 0], [s * 0.45, i * s * 0.58 - s * 0.16, 0], [s, i * s * 0.58 + s * 0.1, 0]], 8), s * 0.15, 5), i === 0 ? '#35c9b5' : '#2f7fe0'));
    return merge(parts);
  }
  throw new Error(`glyph: unknown kind "${kind}" (have orb, coin, crown, tide)`);
}

export const REEL_FACES = ['orb', 'coin', 'crown', 'tide', 'orb', 'tide', 'coin', 'crown'];
/**
 * One reel: an eight-sided drum turning about X through the origin, radius `r`, `w` wide, a symbol on every
 * face. Face k (REEL_FACES[k]) faces +Z when the drum is turned by reelAngle(k). Made for instancing.
 */
export function reelDrum({ r = 0.62, w = 0.8, faces = REEL_FACES, paper = KB.parchment, rim = KB.brass } = {}) {
  const parts = [tint(place(cylinder(r, r, w, 8, { crease: 30 }), -w / 2, 0, 0, 0, 0, -90, 1, 1, 1), paper)];
  parts[0] = place(parts[0], 0, 0, 0, 22.5, 0, 0);
  for (const sx of [-1, 1]) parts.push(tint(place(torus(r * 1.0, 0.05, 8, 4), sx * (w / 2), 0, 0, 22.5, 0, 90), rim), tint(place(cylinder(r * 0.96, r * 0.96, 0.03, 8), sx * (w / 2) - 0.015, 0, 0, 22.5, 0, -90), '#ffd9a0'));
  const ap = r * Math.cos(Math.PI / 8);
  faces.forEach((f, k) => { const a = k * 45; parts.push(place(place(glyph(f, r * 0.26), 0, 0, ap + 0.01), 0, 0, 0, -a, 0, 0)); });
  return merge(parts);
}
/** Degrees to turn a reelDrum about X so that face k looks out at +Z. */
export const reelAngle = (k) => k * 45;

/**
 * The cabinet of the Reels of Assay: a fat arched housing with three openings, a crest, studs, a slip
 * tray. Origin: bottom centre, facing +Z. The reels are separate (instance reelDrum at anchors.reels).
 * anchors: reels [3 centres], lever (pivot, on the right flank), slip (the tray the lot comes out of), crest, lamps [2]
 */
export function reelHouse({ w = 3.6, h = 2.6, d = 1.1, color = KB.royal, trim = KB.brass, dark = KB.navy, r = 0.62, crest = true } = {}) {
  const parts = [], hw = w / 2, cy = h * 0.56, gap = w / 3.25, ow = gap * 0.86, oh = r * 1.5;
  parts.push(rb(w + 0.3, 0.3, d + 0.2, 0.05, 0, 0.15, 0, trim));
  // back box, then a face plate with three windows cut as strips
  parts.push(bx(w, h - 0.3, d * 0.5, 0, 0.3 + (h - 0.3) / 2, -d * 0.25, dark));
  const face = wall({ w, h: h - 0.3, t: d * 0.5, color, openings: [-1, 0, 1].map((i) => ({ x: i * gap, w: ow, sill: cy - 0.3 - oh / 2, top: cy - 0.3 + oh / 2 })) });
  parts.push(place(face, 0, 0.3, d * 0.5));
  for (const i of [-1, 0, 1]) { // a brass frame round each window
    parts.push(bx(ow + 0.12, 0.07, 0.08, i * gap, cy + oh / 2 + 0.02, d * 0.5 + 0.03, trim), bx(ow + 0.12, 0.07, 0.08, i * gap, cy - oh / 2 - 0.02, d * 0.5 + 0.03, trim));
    for (const sx of [-1, 1]) parts.push(bx(0.07, oh + 0.1, 0.08, i * gap + sx * (ow / 2 + 0.02), cy, d * 0.5 + 0.03, trim));
    parts.push(setGlow(tint(place(sphere(0.07, 6, 4), i * gap, cy + oh / 2 + 0.2, d * 0.5 + 0.04), '#fff0b0'), 0.9));
  }
  // an arched head with the crest
  parts.push(tint(place(extrude([[-hw, 0], [hw, 0], ...archPts(0, 0, hw, h * 0.26, 10).reverse().slice(1, -1)], d * 0.8, { crease: 30 }), 0, h, 0.05), color));
  parts.push(tint(place(tube(arch3(0, 0, hw, h * 0.26, 12), 0.07, 5, { caps: false }), 0, h, d * 0.45), trim));
  if (crest) parts.push(place(mintSeal({ r: h * 0.13, flat: true }), 0, h + h * 0.115, d * 0.47));
  parts.push(bx(w + 0.06, 0.1, d * 0.9, 0, h - 0.02, 0.06, trim));
  for (const sx of [-1, 1]) { parts.push(rb(0.26, h - 0.2, d * 0.7, 0.05, sx * (hw + 0.02), 0.3 + (h - 0.3) / 2, 0.08, trim)); for (let k = 0; k < 4; k++) parts.push(tint(place(sphere(0.045, 6, 4), sx * (hw + 0.02), 0.6 + k * ((h - 0.9) / 3), d * 0.45), dark)); }
  // the slip tray under the middle reel
  parts.push(rb(0.7, 0.07, 0.3, 0.02, 0, 0.52, d * 0.5 + 0.14, trim), bx(0.5, 0.05, 0.02, 0, 0.6, d * 0.5 + 0.01, dark));
  return keep(merge(parts), { reels: [-1, 0, 1].map((i) => [i * gap, cy, d * 0.5 - r * Math.cos(Math.PI / 8) + 0.02]), lever: [hw + 0.3, cy - 0.5, 0.25], slip: [0, 0.58, d * 0.5 + 0.16], crest: [0, h + h * 0.13, d * 0.5], lamps: [[-gap, cy + oh / 2 + 0.2, d * 0.5 + 0.1], [gap, cy + oh / 2 + 0.2, d * 0.5 + 0.1]] });
}

/** The lever of the Reels: { base (fixed boss), arm (pivots at its own origin about X; rest = up) }. */
export function lever({ len = 1.25, metal = KB.brass, knob = '#f4573f' } = {}) {
  return {
    base: merge(cyl(0.16, 0.16, 0.16, 10, -0.08, 0, 0, metal, 0, 0, -90), cyl(0.09, 0.09, 0.3, 8, -0.2, 0, 0, KB.navy, 0, 0, -90)),
    arm: merge(cyl(0.045, 0.035, len, 6, 0.06, 0, 0, metal), tint(place(sphere(0.15, 10, 7), 0.06, len + 0.08, 0), knob), tint(place(torus(0.05, 0.02, 8, 4), 0.06, len - 0.06, 0), metal)),
  };
}

/**
 * The lot drum: a slatted tumbler on a cradle, turned by a crank, with a hatch in its side.
 * Returns { cradle, drum, hatch } (three meshes) and `anchors`:
 *   axle    where the drum's origin goes, in cradle space (the drum turns about X there)
 *   hinge   where the hatch's origin goes, in DRUM space; the hatch swings about X (0 = shut, about -100 = open)
 *   mouth   the middle of the hatch opening, in drum space
 */
export function lotDrum({ r = 0.7, len = 1.5, color = KB.teal, slat = KB.tealDark, metal = KB.brass, wood = KB.woodRed } = {}) {
  const axleY = r + 0.52, hl = len / 2, cradle = [], drum = [], N = 12;
  for (const sx of [-1, 1]) {
    cradle.push(tint(place(extrude([[-r * 0.85, 0], [r * 0.85, 0], [0.13, axleY + 0.1], [-0.13, axleY + 0.1]], 0.12, { crease: 30 }), sx * (hl + 0.2), 0, 0, 0, 90, 0), wood));
    cradle.push(cyl(0.12, 0.12, 0.08, 8, sx * (hl + 0.27) - (sx > 0 ? 0 : 0.08), axleY, 0, metal, 0, 0, -90));
  }
  cradle.push(rb(len + 0.8, 0.1, 0.24, 0.03, 0, 0.12, r * 0.6, wood), rb(len + 0.8, 0.1, 0.24, 0.03, 0, 0.12, -r * 0.6, wood));
  // the crank on the right end
  cradle.push(tint(tube([[hl + 0.3, axleY, 0], [hl + 0.52, axleY, 0], [hl + 0.52, axleY - 0.3, 0.12], [hl + 0.78, axleY - 0.3, 0.12]], 0.035, 5), metal), tint(place(sphere(0.08, 8, 5), hl + 0.8, axleY - 0.3, 0.12), '#f4573f'));
  // the drum: end discs, slats all round except the hatch bay (slats 0 and 1, at the front when unturned)
  for (const sx of [-1, 1]) drum.push(cyl(r, r, 0.08, N, sx * hl - (sx > 0 ? 0.08 : 0), 0, 0, color, 0, 0, -90), tint(place(torus(r, 0.05, N, 4), sx * hl, 0, 0, 0, 0, 90), metal), tint(place(sphere(0.1, 8, 5), sx * (hl + 0.04), 0, 0), metal));
  const slatW = 2 * r * Math.sin(Math.PI / N) * 0.92;
  for (let k = 0; k < N; k++) {
    if (k === 0 || k === 1) continue;
    const a = (k + 0.5) * (360 / N) - 30;
    drum.push(place(tint(place(roundedBox(len, slatW, 0.06, 0.02, 1), 0, 0, r * 0.97), k % 2 ? color : slat), 0, 0, 0, -a, 0, 0));
  }
  drum.push(setGlow(tint(place(cylinder(r * 0.55, r * 0.55, len - 0.2, 8), -hl + 0.1, 0, 0, 0, 0, -90), KB.paper), 0.25)); // the slips inside, seen through the hatch
  drum.push(tint(place(torus(r * 1.0, 0.035, N, 4), 0, 0, 0, 0, 0, 90), metal));
  // the hatch covers slats 0 and 1: hinged along its top edge
  const a0 = -30 * DEG, a1 = 30 * DEG, top = [0, Math.sin(a1) * r * 0.97, Math.cos(a1) * r * 0.97], chord = 2 * r * 0.97 * Math.sin((a1 - a0) / 2);
  const hatch = merge(tint(place(roundedBox(len * 0.62, chord, 0.06, 0.02, 1), 0, -chord / 2, 0), KB.brass), tint(place(sphere(0.06, 6, 4), 0, -chord + 0.12, 0.06), '#f4573f'), bx(len * 0.5, 0.05, 0.08, 0, -chord * 0.5, 0.02, KB.brassDark));
  // side fillers either side of the hatch so the bay is a window, not a missing wall
  for (const sx of [-1, 1]) drum.push(tint(place(roundedBox(len * 0.19, chord, 0.06, 0.02, 1), sx * len * 0.405, 0, r * 0.97 * Math.cos((a1 - a0) / 2)), slat));
  return { cradle: merge(cradle), drum: merge(drum), hatch, anchors: { axle: [0, axleY, 0], hinge: top, mouth: [0, 0, r], hatchRest: 0, top: [0, axleY + r, 0] } };
}

// ------------------------------------------------------------------------------------ instruments and desk things

/** A balance: a post, a beam tilted by `tilt` degrees, two pans on chains. Stands on y = 0. */
export function scales({ h = 0.7, w = 0.6, metal = KB.brass, tilt = 6 } = {}) {
  const parts = [tint(lathe([[0, 0], [0.14, 0], [0.12, 0.04], [0.03, 0.08], [0.025, h], [0, h]], 8, { crease: 50 }), metal), tint(place(sphere(0.05, 6, 4), 0, h + 0.03, 0), metal)];
  parts.push(tint(place(roundedBox(w, 0.035, 0.035, 0.012, 1), 0, h - 0.04, 0, 0, 0, tilt), metal));
  for (const sx of [-1, 1]) {
    const x = sx * w / 2 * Math.cos(tilt * DEG), y = h - 0.04 + sx * w / 2 * Math.sin(tilt * DEG);
    parts.push(cyl(0.006, 0.006, 0.26, 3, x, y - 0.26, 0, metal), tint(place(lathe([[0, 0], [0.1, 0.03], [0.12, 0.05], [0, 0.03]], 8, { crease: 180 }), x, y - 0.3, 0), metal));
  }
  return merge(parts);
}

/** A flared brass horn on a stand (a hall crier's, a listening trumpet). Mouth toward +Z. */
export function horn({ len = 0.9, r = 0.34, metal = KB.brass, stand = true } = {}) {
  const bell = tint(place(lathe([[0.03, 0], [0.04, len * 0.5], [0.09, len * 0.78], [r * 0.6, len * 0.94], [r, len], [r * 0.92, len], [0.06, len * 0.76], [0.02, len * 0.5], [0, 0]], 12, { crease: 180 }), 0, 0, 0, 90 - 14, 0, 0), metal);
  if (!stand) return bell;
  return merge(place(bell, 0, 1.05, 0), cyl(0.03, 0.03, 1.05, 6, 0, 0, 0, KB.iron), tint(lathe([[0, 0], [0.2, 0], [0.18, 0.04], [0.03, 0.08], [0, 0.08]], 8, { crease: 50 }), KB.iron));
}

/** A toothed wheel in the XY plane, facing +Z. */
export function gear({ r = 0.5, teeth = 10, t = 0.1, color = KB.brass, hub = KB.brassDark } = {}) {
  const pts = [];
  for (let i = 0; i < teeth * 4; i++) { const a = (i / (teeth * 4)) * Math.PI * 2, rr = (i % 4) < 2 ? r : r * 0.8; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
  return merge(tint(extrude(pts, t, { crease: 30 }), color), cyl(r * 0.36, r * 0.36, t * 1.5, 8, 0, 0, -t * 0.75, hub, 90, 0, 0));
}

/** A globe on a stand: sea-blue with a brass meridian and a few islands. */
export function globe({ r = 0.3, metal = KB.brass, sea = '#3f8fe8' } = {}) {
  const parts = [tint(lathe([[0, 0], [r * 0.7, 0], [r * 0.6, 0.05], [0.04, 0.1], [0.035, 0.34], [0, 0.34]], 8, { crease: 50 }), metal)], cy = 0.34 + r * 1.05;
  parts.push(tint(place(sphere(r, 12, 8), 0, cy, 0), sea), tint(place(torus(r * 1.1, 0.022, 14, 4), 0, cy, 0, 0, 0, 90 - 20), metal));
  const rr = R(r * 100);
  for (let i = 0; i < 7; i++) { const a = rr() * 6.283, e = (rr() - 0.5) * 2; parts.push(tint(place(ellipsoid(r * 0.16, r * 0.05, r * 0.12, 6, 4), Math.cos(a) * Math.cos(e) * r * 0.97, cy + Math.sin(e) * r * 0.97, Math.sin(a) * Math.cos(e) * r * 0.97, 0, -a / DEG + 90, 0), i % 2 ? '#86de57' : '#ffd24a')); }
  return merge(parts);
}

/** A brass telescope on a tripod, pointing up and to +X. */
export function telescope({ len = 1.1, metal = KB.brass } = {}) {
  const parts = [];
  for (let i = 0; i < 3; i++) { const a = i * 120 * DEG; parts.push(tint(tube([[0, 1.0, 0], [Math.sin(a) * 0.4, 0, Math.cos(a) * 0.4]], 0.025, 5), KB.woodDark)); }
  parts.push(tint(place(merge(cylinder(0.07, 0.09, len * 0.6, 8), place(cylinder(0.055, 0.07, len * 0.42, 8), 0, -len * 0.4, 0), place(torus(0.09, 0.02, 8, 4), 0, len * 0.6, 0)), 0, 1.0, 0, 0, 0, -50), metal));
  return merge(parts);
}

/** A teapot, two cups and a tray. Sits on y = 0. */
export function teaSet({ china = '#fffaf0', band = KB.royal, tray = KB.brass } = {}) {
  const parts = [rb(0.6, 0.025, 0.36, 0.01, 0, 0.012, 0, tray)];
  parts.push(tint(place(lathe([[0, 0], [0.07, 0], [0.11, 0.06], [0.1, 0.13], [0.05, 0.17], [0, 0.17]], 10, { crease: 180 }), -0.12, 0.025, 0), china), tint(place(torus(0.105, 0.012, 10, 4), -0.12, 0.09, 0), band), tint(place(sphere(0.022, 5, 4), -0.12, 0.21, 0), band));
  parts.push(tint(tube([[-0.03, 0.09, 0], [0.04, 0.12, 0], [0.07, 0.17, 0]], 0.02, 5), china), tint(place(torus(0.045, 0.012, 8, 4), -0.23, 0.11, 0, 90, 0, 0), china));
  for (const [x, z] of [[0.14, 0.07], [0.2, -0.09]]) parts.push(tint(place(lathe([[0, 0], [0.03, 0], [0.05, 0.06], [0.045, 0.06], [0, 0.02]], 8, { crease: 180 }), x, 0.03, z), china), tint(place(cylinder(0.065, 0.05, 0.012, 8), x, 0.025, z), band));
  return merge(parts);
}

/** An inkwell with a quill, and a blotter. */
export function inkstand({ metal = KB.brass, quill = '#ffffff' } = {}) {
  return merge(rb(0.26, 0.03, 0.16, 0.01, 0, 0.015, 0, KB.navy), cyl(0.045, 0.035, 0.07, 8, 0.06, 0.03, 0, metal), cyl(0.03, 0.03, 0.01, 8, 0.06, 0.1, 0, KB.navy),
    tint(place(extrude([[0, 0], [0.035, 0.1], [0.02, 0.3], [0, 0.36], [-0.025, 0.28], [-0.02, 0.1]], 0.008, { crease: 30 }), 0.06, 0.08, 0, 0, 30, -22), quill));
}

/**
 * A screw press for striking a seal: a base, two pillars, a cross-head, a screw with a two-ball handle, a die.
 * Returns { frame, screw } so the screw can turn and drop; anchors: screw (its rest origin), die (where the paper lies)
 */
export function sealPress({ metal = KB.brass, dark = KB.navy, s = 1 } = {}) {
  const frame = merge(rb(0.4, 0.07, 0.3, 0.02, 0, 0.035, 0, dark), cyl(0.03, 0.03, 0.4, 6, -0.15, 0.07, 0, metal), cyl(0.03, 0.03, 0.4, 6, 0.15, 0.07, 0, metal), rb(0.42, 0.07, 0.14, 0.02, 0, 0.5, 0, metal), cyl(0.09, 0.09, 0.02, 10, 0, 0.07, 0, '#f4573f'));
  const screw = merge(cyl(0.028, 0.028, 0.36, 6, 0, -0.26, 0, metal), cyl(0.075, 0.075, 0.05, 10, 0, -0.3, 0, dark), cyl(0.02, 0.02, 0.5, 5, -0.25, 0.1, 0, metal, 0, 0, -90), tint(place(sphere(0.055, 8, 5), -0.25, 0.1, 0), '#f4573f'), tint(place(sphere(0.055, 8, 5), 0.25, 0.1, 0), '#f4573f'));
  return { frame: scaleMesh(frame, s), screw: scaleMesh(screw, s), anchors: { screw: [0, 0.48 * s, 0], die: [0, 0.09 * s, 0], drop: 0.1 * s } };
}

/**
 * The seal of the Mint: a studded brass ring round a dark field, and on it a balance under a single
 * flame (the lamp the Mint keeps lit, weighed). In the XY plane facing +Z, centred; radius r.
 *   flat: fewer parts, for small copies on banners and crests
 */
export function mintSeal({ r = 0.8, metal = KB.brass, field = KB.navy, flame = '#ff9a3c', flat = false, glow = 0 } = {}) {
  const parts = [cyl(r, r, r * 0.12, flat ? 12 : 20, 0, 0, -r * 0.12, field, 90, 0, 0), tint(place(torus(r, r * 0.11, flat ? 12 : 20, 5), 0, 0, 0, 90, 0, 0), metal)];
  if (!flat) { parts.push(tint(place(torus(r * 0.78, r * 0.025, 20, 4), 0, 0, 0.01, 90, 0, 0), metal)); for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283; parts.push(tint(place(sphere(r * 0.06, 6, 4), Math.cos(a) * r, Math.sin(a) * r, r * 0.09), KB.brassDark)); } }
  const z = r * 0.03;
  parts.push(bx(r * 0.07, r * 0.75, r * 0.07, 0, -r * 0.18, z, metal), rb(r * 1.0, r * 0.08, r * 0.08, r * 0.02, 0, r * 0.12, z, metal), bx(r * 0.4, r * 0.08, r * 0.08, 0, -r * 0.56, z, metal));
  for (const sx of [-1, 1]) parts.push(tint(place(extrude([[-r * 0.2, 0], [r * 0.2, 0], [r * 0.12, -r * 0.12], [-r * 0.12, -r * 0.12]], r * 0.07, { crease: 30 }), sx * r * 0.46, -r * 0.14, z), metal), bx(r * 0.025, r * 0.26, r * 0.03, sx * r * 0.46, -r * 0.01, z, metal));
  parts.push(setGlow(tint(place(extrude([[0, r * 0.34], [r * 0.13, r * 0.08], [r * 0.08, -r * 0.06], [0, -r * 0.1], [-r * 0.08, -r * 0.06], [-r * 0.13, r * 0.08]], r * 0.08, { crease: 30 }), 0, r * 0.4, z), flame), Math.max(glow, 0.6)));
  return merge(parts);
}

// ------------------------------------------------------------------------------------ the shared set shell

const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
export { norm3 };

/**
 * Everything a set returns that is the same for every set, so a set file is only its geometry and its story.
 *   spec: { id, light, L (the light state: needs .power), scene, cameras, marks, actors, foreground,
 *           lamps [{ name, pos, color, radius, base, flicker? }]   -> env.points (at most 6)
 *           glows [{ sprite, base, lamp? (index: follows that lamp's power) }]
 *           motes { box [x0, x1, y0, y1, z0, z1], every (seconds), color, size, vel [x, y, z], life } | null
 *           tick(time, dt, pw, live)   the set's own animation; pw = L.power * setPower; live = false on a time jump
 *           extra                      set-specific fields merged into the result }
 * Returns the set object (see sets/lantern-stalls.js for the shape).
 */
export function setShell({ id, light, L, scene, cameras, marks, actors, foreground, lamps = [], glows = [], motes = null, tick = null, extra = {} }) {
  const env = scene.env, sprites = scene.sprites;
  if (lamps.length > 6) throw new Error(`${id}: ${lamps.length} fixed lamps; the limit is 6 (the engine draws 8, two stay free for carried lamps)`);
  env.points = lamps.map((l) => ({ pos: l.pos, color: rgb(l.color), radius: l.radius, intensity: l.base * L.power }));
  let power = 1, lastT = -1, nextMote = 0;
  const rnd = rng(911), P = [0, 0, 0];
  function setPower(p) { power = Math.max(0, Math.min(1.5, p)); }
  function update(time, dt = 0) {
    const pw = L.power * power, live = lastT >= 0 && time - lastT < 0.5 && dt > 0;
    for (let i = 0; i < lamps.length; i++) { const l = lamps[i], f = l.flicker ?? 0.05; env.points[i].intensity = l.base * pw * (1 - f + f * Math.sin(time * (7.3 + i * 1.7) + i * 2.1) * Math.sin(time * 3.1 + i)); }
    for (let i = 0; i < glows.length; i++) { const g = glows[i]; g.sprite.alpha = g.base * Math.min(1.25, g.fixed ? 1 : pw); }
    if (tick) tick(time, dt, pw, live);
    if (live) {
      if (motes && time > nextMote) {
        nextMote = time + motes.every; const b = motes.box;
        P[0] = b[0] + rnd() * (b[1] - b[0]); P[1] = b[2] + rnd() * (b[3] - b[2]); P[2] = b[4] + rnd() * (b[5] - b[4]);
        sprites.spawn({ kind: 'glow', pos: P, vel: motes.vel || [0.05, 0.06, 0.02], size: (motes.size || 0.07) * (0.6 + rnd() * 0.8), life: motes.life || 5, color: motes.color || '#ffe6a0', alpha: motes.alpha ?? 0.8 });
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
  const set = { id, light, scene, env, actors, foreground: foreground || group('foreground'), cameras, frame, view: (name) => views[name], marks, lamps, setPower, update, ...extra };
  update(0, 0);
  return set;
}
