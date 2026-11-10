// The Halcyon kit: what chapter 3's sets share. Halcyon Reach is a company town run by an insurer, so
// everything here is square, numbered and in rows, and still built like a toy: fat, a little crooked.
// Same rules as kit.js and kit-b.js: pure builders, one options object each, per-vertex colour, anchors in
// the builder's own space. Sets: academy-yard, hearing-hall, dormitory, underwriting-floor, proctor-office.
//
// Colours: cool white stone, the Company's teal and silver, cadet blue, a gold plumb weight. Shadows stay violet.
//
// Builders (meshes unless noted)
//   plumb(opts)                 the Company's device: a plumb weight on its line, as a fat gold solid
//   gonfalon(opts)              a hanging banner with the plumb on it; anchors: foot (where a real bob can hang)
//   pixelText(str, opts)        digits and A..Z in a 3x5 block face, flat, facing +Z (bed numbers, drawer letters)
//   people(opts)                NOT a mesh: a crowd as three instanced draws (coat, head, hair/cap), each person
//                               placed, tinted, lifted and hidden on its own. For ranks, audiences, a dormitory.
//   bunk(opts)                  an iron double bunk, foot to +Z, with its number plate; anchors: plate, lower, upper, under
//   academyBlock(opts)          a long square barrack front: rows of identical windows; anchors: windows (lit ones), ridge
//   gateTower(opts)             the Academy's gate tower: arch, clock, one lit window; anchors: clock, lamp, top, gate
//   clock(opts)                 { face, hour, minute } a wall clock; the hands are separate meshes pivoting at the origin
//   regulator(opts)             { body, bob } a long-case regulator; the bob swings about anchors.pivot
//   drawerWall(opts)            a wall of lettered drawers; anchors: letters[], drawer(col,row) via .cell
//   tubeRun(points, opts)       a brass pneumatic tube through the given points with a collar at every bend
//   clerkDesk(opts)             a high sloped underwriting desk with a stool, pigeonholes and a ledger; anchors: lamp, top
//   seatRow(opts)               a run of tip-up theatre seats on one bar; `up`: seats turned up
//   footlight(opts)             a shell footlight for the lip of a stage; anchors: lamp
//   frameWall(opts)             class photographs in rows, with gaps where frames have been taken down; anchors: gaps
//   lineSet(opts)               the Line: a Proctor's end of it, a brass set with a horn and one valve; anchors: valve
//   stove(opts)                 a fat iron stove with a pipe; anchors: fire, pipe
//   cabinet(opts)               a filing cabinet, drawers labelled by year

import { m4, quat, rng, DEG, rgb } from '../math.js';
import {
  sphere, ellipsoid, cylinder, lathe, torus, box, roundedBox, extrude, tube, curve, plane, quad, deform,
  merge, tint, place, setGlow, setOutline, scale as scaleMesh,
} from '../mesh.js';
import { node, group, makeInstances } from '../scene.js';
import { PAL, wonk } from './kit.js';

/** Halcyon's colours. */
export const H3 = {
  stone: '#f4f1ff', stone2: '#d9dcff', stone3: '#b9c0f6', flag: '#f6efd8', flag2: '#e9dfc4',
  slate: '#2fb7a6', slateDark: '#1f8f8c', teal: '#27b8a8', tealDark: '#1c8c9a', tealDeep: '#17696f',
  silver: '#e6ecff', gold: '#ffd24a', goldDark: '#f0a030', cadet: '#3f78e0', cadetDark: '#2f55b8', navy: '#27336e',
  iron: '#5a6ab8', ironDark: '#3b4a8a', coral: '#ff7a5a', red: '#f4573f', rose: '#ff9aa8', cream: '#fff4d2', paper: '#fffaf0',
  glass: '#8fd0ff', glassDark: '#4a66c8', lit: '#ffe27a', velvet: '#e0506a', velvetDark: '#b83a5c',
  wood: '#e0995c', woodDark: '#a85e3c', woodPale: '#f4c088', brass: '#ffc94a', brassDark: '#e0932e', green: '#2fba7e',
};

const R = (seed) => rng(Math.floor(seed * 7919) + 53);
const keep = (mesh, anchors) => { mesh.anchors = anchors; return mesh; };
const bx = (w, h, d, x, y, z, c, rx = 0, ry = 0, rz = 0) => tint(place(box(w, h, d), x, y, z, rx, ry, rz), c);
// a rounded box costs 108 triangles against a box's 12, so only fat things get their corners rounded
const rb = (w, h, d, rad, x, y, z, c, rx = 0, ry = 0, rz = 0) => tint(place(Math.min(w, h, d) >= 0.3 ? roundedBox(w, h, d, rad, 1) : box(w, h, d), x, y, z, rx, ry, rz), c);
const cyl = (r0, r1, h, seg, x, y, z, c, rx = 0, ry = 0, rz = 0) => tint(place(cylinder(r0, r1, h, seg), x, y, z, rx, ry, rz), c);
const flatQ = (w, h, x, y, z, c) => setOutline(tint(place(quad(w, h), x, y, z), c), 0);

// ------------------------------------------------------------------------------------ the device

/** A plumb weight on its line. Origin: the top of the line; hangs `s` down. Faces +Z, `depth` thick. */
export function plumb({ s = 1, color = H3.gold, line = H3.silver, depth = 0.5, seg = 8 } = {}) {
  const bob = lathe([[0, -1], [0.06, -0.92], [0.2, -0.62], [0.22, -0.5], [0.16, -0.42], [0.07, -0.4], [0.07, -0.34], [0, -0.34]], seg, { crease: 50 });
  return scaleMesh(merge(tint(place(bob, 0, 0, 0, 0, 0, 0, 1, 1, depth), color), tint(place(box(0.03, 0.36, 0.03 * depth), 0, -0.18, 0), line)), s);
}

/**
 * A hanging banner: a crossbar, the cloth with a swallow tail and a border, the plumb on it.
 * Origin: the middle of the bar; hangs toward -Y, faces +Z. anchors: foot (bottom centre)
 */
export function gonfalon({ w = 1.2, h = 3, color = H3.teal, trim = H3.silver, device = H3.gold, tail = 0.4, bar = H3.brassDark, stripe = null } = {}) {
  const hw = w / 2, parts = [], k = Math.min(0.12, w * 0.1);
  parts.push(tint(place(cylinder(0.04, 0.04, w + 0.34, 6), -hw - 0.17, 0, 0, 0, 0, -90), bar));
  for (const sx of [-1, 1]) parts.push(tint(place(sphere(0.075, 6, 4), sx * (hw + 0.17), 0, 0), device));
  parts.push(tint(place(extrude([[-hw, 0], [hw, 0], [hw, -h], [0, -h + tail], [-hw, -h]], 0.035, { crease: 30 }), 0, 0, 0), trim));
  parts.push(tint(place(extrude([[-hw + k, -k * 0.6], [hw - k, -k * 0.6], [hw - k, -h + k * 1.9], [0, -h + tail + k * 1.1], [-hw + k, -h + k * 1.9]], 0.035, { crease: 30 }), 0, 0, 0.014), color));
  if (stripe) parts.push(bx(w - k * 2, h * 0.07, 0.02, 0, -h * 0.14, 0.03, stripe), bx(w - k * 2, h * 0.035, 0.02, 0, -h * 0.2, 0.03, stripe));
  if (device) parts.push(place(plumb({ s: Math.min(h * 0.46, w * 1.5), color: device, line: trim, depth: 0.25 }), 0, -h * (stripe ? 0.27 : 0.2), 0.05));
  return keep(merge(parts), { foot: [0, -h + tail, 0] });
}

// ------------------------------------------------------------------------------------ lettering

const FONT = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111',
  6: '111100111101111', 7: '111001001010010', 8: '111101111101111', 9: '111101111001111',
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
  G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', R: '110101110101101', S: '011100010001110',
  T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', Y: '101101010010010', '-': '000000111000000', ' ': '000000000000000',
};
/** Block lettering, centred on the origin, facing +Z; `s` is the height of a character. Runs of pixels are merged into bars. */
export function pixelText(str, { s = 0.2, color = H3.navy, glow = 0 } = {}) {
  const px = s / 5, parts = [], chars = String(str).toUpperCase().split(''), adv = px * 4, total = chars.length * adv - px;
  chars.forEach((ch, ci) => {
    const g = FONT[ch]; if (!g) throw new Error(`pixelText: no glyph for ${JSON.stringify(ch)}`);
    for (let row = 0; row < 5; row++) for (let col = 0; col < 3; col++) {
      if (g[row * 3 + col] !== '1') continue;
      let run = 1; while (col + run < 3 && g[row * 3 + col + run] === '1') run++;
      parts.push(place(quad(px * run, px), -total / 2 + ci * adv + (col + run / 2) * px, s / 2 - (row + 0.5) * px, 0));
      col += run - 1;
    }
  });
  const m = setOutline(tint(merge(parts.length ? parts : [place(quad(0.001, 0.001), 0, 0, 0)]), color), 0);
  return glow ? setGlow(m, glow) : m;
}

// ------------------------------------------------------------------------------------ people

const HAIR_COLS = ['#7a4630', '#3b3560', '#c8643a', '#f0e6d6', '#59402e', '#e0b060', '#2f2a48'];
const SKINS = ['#ffe2c8', '#f6cfae', '#e8b48e', '#c98e6a', '#a8704e', '#ffd8b8'];

function personBody() { return tint(lathe([[0, 0], [0.21, 0], [0.17, 0.32], [0.185, 0.44], [0, 0.56]], 6, { crease: 180 }), '#ffffff'); }
function personHead(paper) {
  const parts = [tint(place(sphere(0.2, 6, 4), 0, 0.72, 0), '#ffffff')];
  for (const sx of [-1, 1]) parts.push(setOutline(tint(place(quad(0.04, 0.06), sx * 0.075, 0.71, 0.19), '#30264a'), 0));
  if (paper) { // both hands up in front, holding a sheet
    for (const sx of [-1, 1]) parts.push(tint(place(sphere(0.05, 5, 3), sx * 0.12, 0.36, 0.2), '#ffffff'));
    parts.push(setGlow(tint(place(box(0.3, 0.36, 0.015), 0, 0.42, 0.23, -24, 0, 0), '#fffdf0'), 0.25));
  }
  return merge(parts);
}
function personHair(kind) {
  const capMesh = () => place(deform(sphere(1, 6, 3), (p) => { if (p[1] < 0.12 && p[2] > -0.25) p[1] = 0.12 + (p[1] - 0.12) * 0.05; }), 0, 0.735, -0.02, 0, 0, 0, 0.218, 0.2, 0.212);
  if (kind === 'bun') return tint(merge(capMesh(), place(sphere(0.085, 5, 3), 0, 0.93, -0.06)), '#ffffff');
  if (kind === 'shako') return tint(merge(place(cylinder(0.19, 0.16, 0.2, 6), 0, 0.82, -0.01), place(cylinder(0.22, 0.21, 0.035, 6), 0, 0.8, 0.03)), '#ffffff'); // a cadet's cap: tint it with the Company's colour
  if (kind === 'flat') return tint(merge(capMesh(), place(cylinder(0.21, 0.15, 0.09, 6), 0, 0.85, 0, -8, 0, 0)), '#ffffff');
  return tint(capMesh(), '#ffffff');
}
function personArm() { return merge(tint(place(ellipsoid(0.05, 0.17, 0.05, 5, 3), 0, 0.15, 0), '#ffffff'), tint(place(sphere(0.055, 5, 3), 0, 0.34, 0), [1.6, 1.4, 1.25])); }

/**
 * A crowd that costs three instanced draws however many are in it (four with `arms`): coats, heads, hair or caps.
 *   spots     [{ pos [x, y, z] (feet; a seated person's pos is their floor, see `sit`), yaw (degrees), s, coat, skin, hair, kind (index into `kinds`), sit }]
 *             coat / skin / hair default to a seeded pick; `sit` lowers the figure by that much (0.22 behind a seat back)
 *   kinds     hair meshes to share out: 'short' | 'bun' | 'flat' | 'shako'
 *   paper     everyone holds a sheet in both hands (the dormitory, with its contracts)
 *   arms      add a right arm each that raise(i, 0..1) lifts (a show of hands)
 * Returns { node, list, write(i), writeAll(), count }. list[i] = { pos, yaw, s, lift, lean, here (0 hides), hand } is yours to
 * change; call write(i) after. Nothing here allocates after the build.
 */
export function people({ spots, material, kinds = ['short', 'bun', 'flat'], seed = 1, paper = false, arms = false, coats = null }) {
  const r = R(seed), n = spots.length, root = group('people');
  const mk = (name, mesh, cap) => { const k = node(name, mesh, material); k.castShadow = false; k.instances = makeInstances(Math.max(1, cap)); k.instances.count = cap; root.add(k); return k; };
  const list = spots.map((sp, i) => ({
    pos: [sp.pos[0], sp.pos[1] - (sp.sit || 0), sp.pos[2]], yaw: sp.yaw || 0, s: sp.s || 0.9 + r() * 0.2, lift: 0, lean: 0, here: 1, hand: 0,
    coat: rgb(sp.coat || (coats || PAL.lanterns)[Math.floor(r() * (coats || PAL.lanterns).length)]), skin: rgb(sp.skin || SKINS[Math.floor(r() * SKINS.length)]), hair: rgb(sp.hair || HAIR_COLS[Math.floor(r() * HAIR_COLS.length)]),
    kind: (sp.kind ?? Math.floor(r() * kinds.length)) % kinds.length, slot: 0, ph: r() * 6.283,
  }));
  const per = kinds.map(() => 0); for (const p of list) p.slot = per[p.kind]++;
  const body = mk('people-coat', personBody(), n), head = mk('people-head', personHead(paper), n), hair = kinds.map((k, i) => mk('people-' + k, personHair(k), per[i]));
  const arm = arms ? mk('people-arm', personArm(), n) : null;
  const Q = quat.create(), S3 = [1, 1, 1], P = [0, 0, 0], Mx = m4.create();
  const put = (inst, slot, col) => { const d = inst.data, o = slot * 20; d.set(Mx, o); d[o + 16] = col[0]; d[o + 17] = col[1]; d[o + 18] = col[2]; d[o + 19] = 1; inst.dirty = true; };
  function write(i) {
    const p = list[i], s = p.s * p.here;
    P[0] = p.pos[0]; P[1] = p.pos[1] + p.lift; P[2] = p.pos[2];
    quat.fromEuler(Q, 0, p.yaw * DEG, p.lean * DEG); S3[0] = S3[1] = S3[2] = s;
    m4.fromTRS(Mx, P, Q, S3);
    put(body.instances, i, p.coat); put(head.instances, i, p.skin); put(hair[p.kind].instances, p.slot, p.hair);
    if (arm) { // the right shoulder; the arm swings from hanging to straight up
      const c = Math.cos(p.yaw * DEG), sn = Math.sin(p.yaw * DEG), ax = -0.2 * s, ay = 0.42 * s;
      P[0] = p.pos[0] + ax * c; P[1] = p.pos[1] + p.lift + ay; P[2] = p.pos[2] - ax * sn;
      quat.fromEuler(Q, 0, p.yaw * DEG, (180 - p.hand * 172) * DEG); m4.fromTRS(Mx, P, Q, S3); put(arm.instances, i, p.coat);
    }
  }
  function writeAll() { for (let i = 0; i < n; i++) write(i); }
  writeAll();
  return { node: root, list, write, writeAll, count: n };
}

// ------------------------------------------------------------------------------------ the dormitory

/**
 * An iron double bunk. Origin: the floor under the middle of the foot rail; the bed runs back toward -Z, `len` long.
 * The foot faces +Z and carries the number plate. anchors: plate, lower, upper (the middle of each mattress top),
 * under (the underside of the lower frame at the foot: where a tally is scratched), box (the kit box)
 */
export function bunk({ w = 0.86, len = 1.75, number = 19, seed = 1, iron = H3.iron, blanket = H3.teal, blanket2 = H3.silver, sheet = '#ffffff', kit = H3.coral, made = true, lean = 0.015 } = {}) {
  const r = R(seed), parts = [], hw = w / 2, LOW = 0.36, UP = 1.12, TOP = 1.62;
  for (const [x, z] of [[-hw, 0], [hw, 0], [-hw, -len], [hw, -len]]) { parts.push(cyl(0.035, 0.035, TOP, 6, x, 0, z, iron)); parts.push(tint(place(sphere(0.055, 6, 4), x, TOP + 0.02, z), H3.brass)); }
  for (const y of [LOW, UP]) {
    for (const sx of [-1, 1]) parts.push(bx(0.045, 0.07, len, sx * hw, y, -len / 2, iron));
    for (const z of [0, -len]) parts.push(bx(w, 0.07, 0.045, 0, y, z, iron));
    parts.push(rb(w - 0.06, 0.13, len - 0.06, 0.04, 0, y + 0.085, -len / 2, sheet));
    const fold = made ? 0.36 : 0.5 + r() * 0.2;
    parts.push(rb(w - 0.02, 0.15, len * (1 - fold) - 0.04, 0.04, 0, y + 0.1, -(len * (1 - fold)) / 2 + 0.0, blanket, 0, made ? 0 : (r() - 0.5) * 6, 0));
    parts.push(bx(w - 0.015, 0.155, 0.11, 0, y + 0.1, -len * (1 - fold) + 0.14, blanket2));
    parts.push(rb(w * 0.62, 0.11, 0.3, 0.05, 0, y + 0.2, -len + 0.24, '#ffffff', 0, made ? 0 : (r() - 0.5) * 14, 0));
  }
  for (const z of [0, -len]) { // head and foot: two rails and three uprights between them, above the upper mattress
    parts.push(bx(w, 0.045, 0.045, 0, TOP - 0.06, z, iron), bx(w, 0.04, 0.04, 0, UP + 0.3, z, iron));
    for (const k of [-0.5, 0, 0.5]) parts.push(bx(0.03, TOP - UP - 0.36, 0.03, k * hw, (TOP + UP + 0.24) / 2, z, iron));
    parts.push(bx(w, 0.04, 0.04, 0, LOW + 0.4, z, iron));
  }
  for (let i = 0; i < 3; i++) parts.push(bx(0.03, 0.03, 0.26, hw + 0.0, LOW + 0.24 + i * 0.2, -0.13, iron, 0, 0, 0)); // the ladder at the foot, right side
  parts.push(bx(0.03, UP - LOW, 0.03, hw, (UP + LOW) / 2, -0.26, iron));
  // the number, on an enamel plate on the foot rail
  parts.push(rb(0.36, 0.22, 0.03, 0.02, 0, UP + 0.02, 0.03, '#fffdf0'), place(pixelText(String(number), { s: 0.14, color: H3.navy }), 0, UP + 0.02, 0.05));
  // the kit box under the foot, square to the frame
  parts.push(rb(w * 0.6, 0.24, 0.4, 0.03, -hw * 0.25, 0.13, -0.3, kit), bx(w * 0.62, 0.035, 0.42, -hw * 0.25, 0.2, -0.3, H3.brassDark), bx(0.07, 0.07, 0.02, -hw * 0.25, 0.15, -0.09, H3.brass));
  return keep(wonk(merge(parts), { lean: (r() - 0.5) * lean * 2, crease: 40 }), { plate: [0, UP + 0.02, 0.05], lower: [0, LOW + 0.17, -len / 2], upper: [0, UP + 0.17, -len / 2], under: [0, LOW - 0.04, -0.12], box: [-hw * 0.25, 0.26, -0.3] });
}

// ------------------------------------------------------------------------------------ the Academy

/**
 * A long square barrack front, `w` wide, `h` to the eaves, `d` deep, facing +Z; origin at the bottom centre of the front.
 * `bays` identical windows on each of `floors` floors, a string course under every sill, a parapet, a hipped roof.
 * `litAt` [[bay, floor], ...] glow. anchors: windows (the lit ones), ridge, eaveL, eaveR
 */
export function academyBlock({ w = 14, h = 6, d = 4, floors = 3, bays = 8, seed = 1, wall = H3.stone, wall2 = H3.stone2, roof = H3.slate, roofH = 1.5, glass = H3.glassDark, litAt = [], trim = H3.stone3, door = null, lean = 0.012 } = {}) {
  const r = R(seed), parts = [], fh = h / floors, bw = w / bays, lit = [];
  parts.push(rb(w, h, d, 0.12, 0, h / 2, -d / 2, wall));
  parts.push(rb(w + 0.3, 0.5, d + 0.3, 0.06, 0, 0.25, -d / 2, wall2));
  for (let f = 0; f < floors; f++) {
    const y0 = f * fh;
    if (f > 0) parts.push(bx(w + 0.14, 0.12, d + 0.14, 0, y0 + 0.1, -d / 2, trim));
    for (let b = 0; b < bays; b++) {
      const x = -w / 2 + bw * (b + 0.5), ww = bw * 0.46, wh = fh * 0.5, wy = y0 + fh * 0.55, on = litAt.some((l) => l[0] === b && l[1] === f);
      if (door && f === 0 && Math.abs(x - door) < bw * 0.5) continue;
      parts.push(rb(ww + 0.16, wh + 0.16, 0.1, 0.04, x, wy, 0.02, wall2));
      const pane = tint(place(box(ww, wh, 0.06), x, wy, 0.06), on ? H3.lit : glass);
      parts.push(on ? setGlow(pane, 0.95) : pane);
      parts.push(bx(0.045, wh, 0.03, x, wy, 0.1, wall), bx(ww, 0.045, 0.03, x, wy + wh * 0.12, 0.1, wall));
      parts.push(rb(ww + 0.26, 0.09, 0.2, 0.03, x, wy - wh / 2 - 0.08, 0.08, trim));
      if (on) lit.push([x, wy, 0.1]);
    }
  }
  if (door != null) { // a plain square door with a fanlight
    parts.push(rb(1.3, 2.0, 0.12, 0.05, door, 1.0, 0.03, wall2), bx(1.0, 1.7, 0.08, door, 0.87, 0.08, H3.tealDark), setGlow(bx(1.0, 0.2, 0.06, door, 1.86, 0.08, H3.lit), 0.6), tint(place(sphere(0.05, 6, 4), door + 0.34, 0.9, 0.14), H3.brass));
  }
  // parapet blocks, then the roof
  parts.push(bx(w + 0.24, 0.26, d + 0.24, 0, h + 0.05, -d / 2, trim));
  const n = Math.round(w / 1.1); for (let i = 0; i < n; i++) if (i % 2 === 0) parts.push(rb(w / n * 0.72, 0.3, 0.26, 0.04, -w / 2 + (w / n) * (i + 0.5), h + 0.3, -0.02, wall, 0, 0, (r() - 0.5) * 3));
  const hw = w / 2 - 0.2, hd = d / 2 - 0.2, rw = Math.max(0.2, hw - hd);
  const roofMesh = extrude([[-hw, 0], [hw, 0], [rw, roofH], [-rw, roofH]], d - 0.4, { crease: 30 });
  parts.push(tint(place(roofMesh, 0, h + 0.18, -d / 2), roof));
  parts.push(bx(rw * 2 + 0.2, 0.12, 0.3, 0, h + 0.18 + roofH, -d / 2, H3.slateDark));
  for (const sx of [-0.55, 0.5]) parts.push(rb(0.5, 1.0, 0.5, 0.05, sx * hw, h + roofH * 0.9, -d / 2, wall2), bx(0.62, 0.12, 0.62, sx * hw, h + roofH * 0.9 + 0.5, -d / 2, trim));
  return keep(wonk(merge(parts), { lean: lean, crease: 40 }), { windows: lit, ridge: [0, h + 0.18 + roofH, -d / 2], eaveL: [-w / 2, h, 0], eaveR: [w / 2, h, 0] });
}

/**
 * The gate tower: a square shaft with an arch through it, a clock, one window that is lit, a steep cap and a finial.
 * Origin: bottom centre of the front. anchors: clock (centre of the dial, on the front), lamp (the lit window), top, gate, bracket (left face, high: a banner arm)
 */
export function gateTower({ w = 3.2, h = 10, d = 3.2, wall = H3.stone, wall2 = H3.stone2, trim = H3.stone3, roof = H3.slate, lit = true, lean = 0.02, seed = 1 } = {}) {
  const parts = [], hw = w / 2, gateW = w * 0.5, gateH = 2.9;
  // the shaft, with the arch cut through the front as an extruded outline
  const pts = [[-hw, 0], [-gateW / 2, 0], [-gateW / 2, gateH - gateW / 2]];
  for (let i = 1; i < 8; i++) { const a = Math.PI * (1 - i / 8); pts.push([Math.cos(a) * gateW / 2, gateH - gateW / 2 + Math.sin(a) * gateW / 2]); }
  pts.push([gateW / 2, gateH - gateW / 2], [gateW / 2, 0], [hw, 0], [hw, h], [-hw, h]);
  parts.push(tint(place(extrude(pts, d, { crease: 30 }), 0, 0, -d / 2), wall));
  parts.push(bx(gateW + 0.1, gateH, 0.1, 0, gateH / 2, -d * 0.7, '#5b62c8'));                                  // the dark of the passage
  parts.push(setGlow(bx(gateW * 0.7, gateH * 0.55, 0.06, 0, gateH * 0.3, -d * 0.66, '#bfe8ff'), 0.6));          // daylight at its far end
  const ring = []; for (let i = 0; i <= 10; i++) { const a = Math.PI * (1 - i / 10); ring.push([Math.cos(a) * (gateW / 2 + 0.12), gateH - gateW / 2 + Math.sin(a) * (gateW / 2 + 0.12), 0.05]); }
  parts.push(tint(tube(ring, 0.14, 5, { crease: 60 }), wall2));
  for (const sx of [-1, 1]) parts.push(rb(0.34, gateH - gateW / 2, 0.3, 0.05, sx * (gateW / 2 + 0.12), (gateH - gateW / 2) / 2, 0.05, wall2), rb(0.5, h, 0.5, 0.08, sx * hw, h / 2, -0.05, wall2));
  for (const y of [gateH + 0.9, h * 0.62, h - 0.2]) parts.push(bx(w + 0.3, 0.2, d + 0.3, 0, y, -d / 2, trim));
  // the lit window, between the arch and the clock
  const WY = gateH + 2.1;
  parts.push(rb(1.0, 1.5, 0.12, 0.05, 0, WY, 0.03, wall2));
  const pane = tint(place(box(0.74, 1.24, 0.06), 0, WY, 0.07), lit ? H3.lit : H3.glassDark);
  parts.push(lit ? setGlow(pane, 1) : pane, bx(0.05, 1.24, 0.04, 0, WY, 0.11, wall), bx(0.74, 0.05, 0.04, 0, WY + 0.15, 0.11, wall), rb(1.2, 0.1, 0.24, 0.03, 0, WY - 0.72, 0.1, trim));
  // the cap
  const capH = w * 1.05;
  parts.push(tint(place(cylinder(hw * 1.5, 0.06, capH, 4), 0, h, -d / 2, 0, 45, 0), roof));
  parts.push(bx(w + 0.5, 0.16, d + 0.5, 0, h + 0.02, -d / 2, H3.slateDark));
  parts.push(cyl(0.05, 0.03, 1.1, 5, 0, h + capH - 0.1, -d / 2, H3.brassDark), tint(place(sphere(0.16, 8, 5), 0, h + capH + 0.2, -d / 2), H3.gold));
  for (const sx of [-1, 1]) for (const sz of [0, -1]) parts.push(rb(0.4, 0.7, 0.4, 0.06, sx * (hw - 0.1), h + 0.4, sz * d + (sz ? 0.1 : -0.1), wall2), tint(place(cylinder(0.3, 0, 0.5, 4), sx * (hw - 0.1), h + 0.75, sz * d + (sz ? 0.1 : -0.1), 0, 45, 0), roof));
  const CY = h * 0.62 + (h * 0.38 - 0.2) / 2 + 0.05;
  return keep(wonk(merge(parts), { lean, crease: 40 }), { clock: [0, CY, 0.02], lamp: [0, WY, 0.12], top: [0, h + capH + 0.3, -d / 2], gate: [0, 0, 0], bracket: [-hw, h * 0.6, 0.3], clockR: Math.min(hw * 0.74, (h * 0.38 - 0.4) / 2) });
}

/** A clock: `face` (rim, dial, twelve marks) and two hands, each pointing up (+Y) and pivoting at the origin. All face +Z. */
export function clock({ r = 0.5, rim = H3.brass, dial = '#fffdf0', ink = H3.navy, thick = 0.1 } = {}) {
  const parts = [cyl(r, r, thick, 14, 0, 0, 0, rim, 90, 0, 0), cyl(r * 0.84, r * 0.84, thick * 0.3, 14, 0, 0, thick * 0.9, dial, 90, 0, 0)];
  for (let i = 0; i < 12; i++) { const a = i * 30 * DEG, q = i % 3 === 0; parts.push(setOutline(tint(place(box(r * (q ? 0.07 : 0.04), r * (q ? 0.2 : 0.1), 0.01), Math.sin(a) * r * 0.68, Math.cos(a) * r * 0.68, thick * 1.22, 0, 0, -i * 30), ink), 0)); }
  parts.push(tint(place(sphere(r * 0.09, 6, 4), 0, 0, thick * 1.3), ink));
  const hand = (len, wd) => setOutline(tint(place(box(r * wd, r * len, 0.014), 0, r * len * 0.42, thick * 1.28), ink), 0);
  return { face: merge(parts), hour: hand(0.46, 0.1), minute: hand(0.68, 0.065) };
}

/** A long-case regulator clock for a wall: { body, bob }. Origin: bottom centre of the case, back against the wall. anchors on body: pivot, dial, r */
export function regulator({ h = 2.3, w = 0.62, wood = H3.woodDark, glass = '#bfe6ff' } = {}) {
  const parts = [rb(w, h, 0.26, 0.05, 0, h / 2, 0.13, wood), rb(w + 0.14, 0.14, 0.34, 0.04, 0, h + 0.03, 0.15, wood), rb(w + 0.1, 0.12, 0.32, 0.04, 0, 0.06, 0.15, wood)];
  parts.push(tint(place(extrude([[-w * 0.5, 0], [w * 0.5, 0], [0, w * 0.34]], 0.26, { crease: 30 }), 0, h + 0.1, 0.13), wood));
  parts.push(bx(w * 0.62, h * 0.52, 0.03, 0, h * 0.34, 0.265, '#4a56b8'));
  const c = clock({ r: w * 0.36, thick: 0.05 });
  parts.push(place(merge(c.face, place(c.hour, 0, 0, 0, 0, 0, 55), place(c.minute, 0, 0, 0, 0, 0, -100)), 0, h * 0.8, 0.27));
  const bob = merge(bx(0.025, h * 0.4, 0.02, 0, -h * 0.2, 0, H3.brass), cyl(0.11, 0.11, 0.03, 10, 0, -h * 0.4, 0, H3.gold, 90, 0, 0));
  return { body: keep(merge(parts), { pivot: [0, h * 0.57, 0.3], dial: [0, h * 0.8, 0.3] }), bob };
}

// ------------------------------------------------------------------------------------ the underwriting floor

/**
 * A wall of drawers, `cols` x `rows`, with a lettered plate over every column and a long drawer along the bottom
 * of each. Origin: bottom centre, back to the wall, faces +Z.
 * anchors: letters [[x, y, z]...], long [[x, y, z]...] (the long drawer under each letter), w, h
 */
export function drawerWall({ cols = 6, rows = 7, cw = 0.9, ch = 0.36, letters = 'ABCDEF', color = H3.tealDark, front = H3.teal, front2 = '#3fd0bc', brass = H3.brass, depth = 0.5, seed = 1, skip = null } = {}) {
  const r = R(seed), parts = [], w = cols * cw, longH = ch * 1.25, plateH = 0.42, h = longH + rows * ch + plateH + 0.16, per = 2;
  parts.push(rb(w + 0.24, h, depth, 0.05, 0, h / 2, depth / 2 - 0.05, color));
  const lets = [], long = [];
  for (let c = 0; c < cols; c++) {
    const x = -w / 2 + cw * (c + 0.5);
    parts.push(bx(0.06, h - 0.1, 0.06, x - cw / 2, h / 2, depth - 0.04, color));
    if (!skip || !skip(c)) {
      parts.push(rb(cw - 0.1, longH - 0.07, 0.07, 0.025, x, 0.08 + longH / 2, depth - 0.02, front2), rb(cw * 0.42, 0.06, 0.07, 0.02, x, 0.08 + longH * 0.34, depth + 0.035, brass), flatQ(cw * 0.3, 0.09, x, 0.08 + longH * 0.68, depth + 0.02, H3.paper));
    }
    long.push([x, 0.08 + longH / 2, depth]);
    for (let j = 0; j < rows; j++) for (let k = 0; k < per; k++) {
      const dw = (cw - 0.1) / per, dx = x - (cw - 0.1) / 2 + dw * (k + 0.5), y = 0.08 + longH + ch * (j + 0.5), out = r() < 0.06 ? 0.06 + r() * 0.08 : 0;
      parts.push(rb(dw - 0.04, ch - 0.06, 0.06 + out, 0.02, dx, y, depth - 0.02 + out / 2, (j + c) % 2 ? front : front2));
      parts.push(tint(place(sphere(0.032, 5, 3), dx, y - ch * 0.16, depth + 0.02 + out), brass), flatQ(dw * 0.46, 0.07, dx, y + ch * 0.14, depth + 0.012 + out, H3.paper));
    }
    const ly = h - plateH / 2 - 0.06;
    parts.push(rb(cw * 0.56, plateH - 0.08, 0.05, 0.03, x, ly, depth - 0.01, brass), place(pixelText(letters[c % letters.length], { s: plateH * 0.56, color: H3.navy }), x, ly, depth + 0.02));
    lets.push([x, ly, depth]);
  }
  parts.push(bx(0.06, h - 0.1, 0.06, w / 2, h / 2, depth - 0.04, color), rb(w + 0.36, 0.12, depth + 0.1, 0.03, 0, h + 0.03, depth / 2 - 0.02, brass));
  return keep(merge(parts), { letters: lets, long, w, h, longH, cw, depth });
}

/** A brass pneumatic tube through `points`, with a fat collar at every bend and at both ends. */
export function tubeRun(points, { r = 0.07, color = H3.brass, collar = H3.brassDark, seg = 6 } = {}) {
  const parts = [tint(tube(points, r, seg, { crease: 70, caps: true }), color)];
  for (const p of points) parts.push(tint(place(sphere(r * 1.7, 6, 4), p[0], p[1], p[2]), collar));
  return merge(parts);
}

/**
 * A high underwriting desk: a sloped top on a pedestal with a brass rail, a rack of pigeonholes along the back, a fat
 * ledger, a stool. The clerk sits at +Z facing -Z... no: the clerk sits at -Z facing +Z, so the room sees the face.
 * Origin: floor, centre. anchors: lamp (back left of the top), top, seat
 */
export function clerkDesk({ w = 1.5, color = H3.woodDark, top = H3.wood, cloth = H3.green, seed = 1, book = true, stool = true } = {}) {
  const r = R(seed), parts = [], h = 0.86, d = 0.8;
  parts.push(rb(w * 0.9, h - 0.08, d * 0.72, 0.04, 0, (h - 0.08) / 2, 0, color));
  for (let i = 0; i < 3; i++) parts.push(rb(w * 0.74, 0.17, 0.04, 0.02, 0, 0.16 + i * 0.22, d * 0.36 + 0.01, top), tint(place(sphere(0.03, 5, 3), 0, 0.16 + i * 0.22, d * 0.36 + 0.05), H3.brass));
  parts.push(rb(w, 0.09, d, 0.03, 0, h, 0, top, 9, 0, 0), bx(w * 0.84, 0.02, d * 0.66, 0, h + 0.05, 0.02, cloth, 9, 0, 0));
  // pigeonholes along the back edge (the clerk's side is -Z, so the rack stands at the front, low, and does not hide a face)
  parts.push(rb(w, 0.3, 0.2, 0.03, 0, h + 0.2, d * 0.5 - 0.02, color));
  const n = 5; for (let i = 0; i < n; i++) { const x = -w / 2 + (w / n) * (i + 0.5); parts.push(bx(w / n - 0.05, 0.2, 0.03, x, h + 0.2, d * 0.5 + 0.085, '#4a3fa0')); if (r() < 0.7) parts.push(bx(w / n - 0.09, 0.05 + r() * 0.1, 0.05, x, h + 0.13 + r() * 0.03, d * 0.5 + 0.09, H3.paper)); }
  if (book) parts.push(rb(0.56, 0.07, 0.4, 0.02, w * 0.1, h + 0.06, -0.08, '#c23a5e', 9, 8, 0), bx(0.5, 0.02, 0.36, w * 0.1, h + 0.1, -0.08, H3.paper, 9, 8, 0));
  if (stool) parts.push(cyl(0.19, 0.19, 0.06, 8, 0, 0.56, -d * 0.5 - 0.3, color), cyl(0.16, 0.16, 0.04, 8, 0, 0.61, -d * 0.5 - 0.3, H3.velvet), cyl(0.04, 0.07, 0.56, 6, 0, 0, -d * 0.5 - 0.3, H3.brassDark));
  return keep(wonk(merge(parts), { lean: (r() - 0.5) * 0.03, crease: 40 }), { lamp: [-w * 0.34, h + 0.36, d * 0.5 - 0.02], top: [0, h + 0.06, 0], seat: [0, 0, -d * 0.5 - 0.3] });
}

// ------------------------------------------------------------------------------------ the hall

/** A run of `n` theatre seats facing +Z on a common rail. Origin: floor, centre. `up`: the seats are turned up (an empty hall). */
export function seatRow({ n = 8, pitch = 0.62, color = H3.velvet, dark = H3.velvetDark, frame = H3.brassDark, up = false, arm = H3.gold, plain = false } = {}) {
  const parts = [], w = n * pitch;
  if (plain) { // a full house: only the backs and the row ends show
    for (let i = 0; i < n; i++) parts.push(bx(pitch - 0.07, 0.56, 0.1, -w / 2 + pitch * (i + 0.5), 0.52, -0.2, color, -7, 0, 0));
    for (const sx of [-1, 1]) parts.push(bx(0.07, 0.5, 0.4, sx * w / 2, 0.3, -0.03, frame), tint(place(sphere(0.06, 5, 3), sx * w / 2, 0.58, 0.14), arm));
    return merge(parts);
  }
  parts.push(bx(w, 0.05, 0.06, 0, 0.08, -0.12, frame));
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + pitch * (i + 0.5);
    parts.push(rb(pitch - 0.07, 0.56, 0.1, 0.045, x, 0.52, -0.2, color, -7, 0, 0));
    parts.push(up ? rb(pitch - 0.1, 0.34, 0.08, 0.035, x, 0.42, -0.1, dark, -4, 0, 0) : rb(pitch - 0.1, 0.08, 0.36, 0.035, x, 0.32, 0.02, dark));
  }
  for (let i = 0; i <= n; i++) parts.push(bx(0.06, 0.36, 0.34, -w / 2 + pitch * i, 0.26, -0.03, frame));
  for (const sx of [-1, 1]) parts.push(tint(place(sphere(0.06, 5, 3), sx * w / 2, 0.48, 0.14), arm));
  return merge(parts);
}

/** A shell footlight for the lip of a stage: the shell hides the flame from the house and throws it on the players (toward +Z). anchors: lamp */
export function footlight({ s = 1, metal = H3.brass, glass = '#fff0b0' } = {}) {
  const shell = place(lathe([[0, 0], [0.16, 0.02], [0.2, 0.12], [0.16, 0.24], [0, 0.28]], 8, { crease: 180 }), 0, 0.02, -0.03, 0, 0, 0, 1, 1, 0.5);
  return keep(scaleMesh(merge(tint(shell, metal), cyl(0.1, 0.12, 0.04, 8, 0, 0, 0, H3.brassDark), setGlow(tint(place(ellipsoid(0.07, 0.09, 0.05, 6, 4), 0, 0.14, 0.05), glass), 1)), s), { lamp: [0, 0.14 * s, 0.08 * s] });
}

// ------------------------------------------------------------------------------------ the Proctor's office

/**
 * Class photographs in rows on a wall: `cols` x `rows` frames, each a mount with a smudge of faces. `gaps` [[col, row]...]
 * are frames that have been taken down: a paler patch of wall and a nail. Origin: centre, on the wall, faces +Z.
 * anchors: gaps [[x, y, z]...]
 */
export function frameWall({ cols = 6, rows = 3, fw = 0.5, fh = 0.4, gapX = 0.16, gapY = 0.16, frame = H3.brassDark, seed = 1, gaps = [], patch = '#ffffff' } = {}) {
  const r = R(seed), parts = [], out = [], W = cols * fw + (cols - 1) * gapX, Ht = rows * fh + (rows - 1) * gapY;
  const mounts = ['#dfe8ff', '#fff4d2', '#ffe0ea', '#e2f6dc'];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = -W / 2 + fw / 2 + i * (fw + gapX), y = Ht / 2 - fh / 2 - j * (fh + gapY), tilt = (r() - 0.5) * 2.4;
    if (gaps.some((g) => g[0] === i && g[1] === j)) { parts.push(flatQ(fw * 0.92, fh * 0.92, x, y, 0.004, patch), tint(place(sphere(0.022, 5, 3), x, y + fh * 0.36, 0.02), H3.ironDark)); out.push([x, y, 0.02]); continue; }
    parts.push(rb(fw, fh, 0.05, 0.02, x, y, 0.025, frame, 0, 0, tilt), tint(place(box(fw - 0.09, fh - 0.09, 0.02), x, y, 0.052, 0, 0, tilt), mounts[Math.floor(r() * mounts.length)]));
    // two rows of heads: a class
    for (let k = 0; k < 4; k++) parts.push(flatQ(0.05, 0.05, x - fw * 0.26 + k * fw * 0.17, y + 0.03 - (k % 2) * 0.07, 0.066, k % 3 ? H3.cadet : H3.cadetDark));
  }
  return keep(merge(parts), { gaps: out, w: W, h: Ht });
}

/** The Line, a Proctor's end of it: a brass box on a bracket, a horn, a handset on its hook and one valve that glows when it is live. anchors: valve */
export function lineSet({ s = 1, metal = H3.brass, dark = H3.tealDeep } = {}) {
  const parts = [rb(0.5, 0.42, 0.26, 0.05, 0, 0.21, 0, dark), rb(0.56, 0.06, 0.32, 0.02, 0, 0.44, 0, metal), rb(0.56, 0.05, 0.32, 0.02, 0, 0.02, 0, metal)];
  parts.push(tint(place(lathe([[0, 0], [0.04, 0], [0.05, 0.12], [0.16, 0.3], [0.19, 0.32], [0, 0.32]], 8, { crease: 60 }), 0.1, 0.46, 0.02, 30, 0, -14), metal));
  parts.push(setGlow(tint(place(ellipsoid(0.05, 0.075, 0.05, 6, 4), -0.14, 0.54, 0.02), '#ffb040'), 0.9), cyl(0.045, 0.05, 0.04, 6, -0.14, 0.46, 0.02, metal));
  for (let i = 0; i < 3; i++) parts.push(cyl(0.035, 0.035, 0.03, 6, -0.14 + i * 0.14, 0.2, 0.14, metal, 90, 0, 0));
  parts.push(tint(tube(curve([[0.27, 0.34, 0], [0.4, 0.1, 0.05], [0.34, -0.2, 0.02], [0.3, -0.34, 0]], 8), 0.014, 4, { caps: false }), H3.navy), rb(0.07, 0.3, 0.07, 0.03, 0.3, 0.3, 0.06, H3.navy));
  return keep(scaleMesh(merge(parts), s), { valve: [-0.14 * s, 0.54 * s, 0.02 * s] });
}

/** A fat iron stove on three feet with a mica door and a crooked pipe going up `pipe` high. anchors: fire (the door), pipe (its top) */
export function stove({ s = 1, color = H3.ironDark, pipe = 2.6, trim = H3.brass } = {}) {
  const parts = [tint(place(lathe([[0, 0.12], [0.26, 0.12], [0.32, 0.3], [0.3, 0.74], [0.22, 0.9], [0.1, 0.94], [0, 0.94]], 9, { crease: 50 }), 0, 0, 0), color)];
  for (let i = 0; i < 3; i++) { const a = (i * 120 + 60) * DEG; parts.push(cyl(0.045, 0.03, 0.14, 5, Math.sin(a) * 0.22, 0, Math.cos(a) * 0.22, color)); }
  parts.push(setGlow(rb(0.26, 0.24, 0.05, 0.03, 0, 0.5, 0.3, '#ff9a3c'), 1), bx(0.3, 0.03, 0.06, 0, 0.5, 0.31, color), bx(0.03, 0.28, 0.06, 0, 0.5, 0.31, color), tint(place(torus(0.31, 0.025, 9, 4), 0, 0.74, 0), trim));
  parts.push(tint(tube([[0, 0.92, -0.05], [0, 1.5, -0.08], [0.04, pipe * 0.8, -0.2], [0.04, pipe, -0.5]], 0.09, 6, { crease: 60 }), color), tint(place(torus(0.1, 0.025, 8, 4), 0, 1.5, -0.08), trim));
  return keep(scaleMesh(merge(parts), s), { fire: [0, 0.5 * s, 0.34 * s], pipe: [0.04 * s, pipe * s, -0.5 * s] });
}

/** A filing cabinet: `rows` drawers of `cols`, a label and a pull on each, the year in block figures on a plate at the top. Back to the wall, faces +Z. */
export function cabinet({ w = 0.9, h = 1.6, d = 0.5, rows = 4, cols = 1, color = H3.tealDark, front = H3.teal, brass = H3.brass, year = null, seed = 1 } = {}) {
  const r = R(seed), parts = [rb(w, h, d, 0.04, 0, h / 2, d / 2, color)], rh = (h - 0.14) / rows, cw = (w - 0.08) / cols;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = -w / 2 + 0.04 + cw * (i + 0.5), y = 0.07 + rh * (j + 0.5), out = r() < 0.1 ? 0.1 : 0;
    parts.push(rb(cw - 0.05, rh - 0.06, 0.06 + out, 0.02, x, y, d + out / 2, front), rb(cw * 0.36, 0.045, 0.05, 0.015, x, y - rh * 0.2, d + 0.05 + out, brass), flatQ(cw * 0.44, rh * 0.22, x, y + rh * 0.16, d + 0.034 + out, H3.paper));
  }
  if (year != null) parts.push(rb(w * 0.7, 0.2, 0.04, 0.02, 0, h + 0.14, d * 0.5, brass, -12, 0, 0), place(pixelText(String(year), { s: 0.11, color: H3.navy }), 0, h + 0.145, d * 0.5 + 0.03, -12, 0, 0));
  return wonk(merge(parts), { lean: (r() - 0.5) * 0.03, crease: 40 });
}
