// The Saltmere kit: what chapter 2's sets are assembled from. A poor salt-mining island town: white salt,
// pit timber, rust-red iron, miners' cloth in strong colours, and the cold cyan of stillsalt.
// Same rules as kit.js (pure, one options object per builder, per-vertex colour, anchors in the builder's
// own space, chunky and a little crooked). It imports kit.js and the engine only; nothing from kit-b.js.
//
// Rooms here are stages: a floor, a back wall, splayed side walls, an open timber roof and NO front wall.
// Walls cast no shadows (ch2Materials().wall), the scene key is a "house light" from the open front, and
// window light is drawn: glowing panes, additive shaft cards, a bright patch on the floor.
//
// Builders (meshes unless noted)
//   pixelText(str, opts)        chalk / paint lettering in a 3x5 block face, made of flat quads (pure, no canvas)
//   roomWall(opts)              a wall run with square or arched openings;  splay(side, ...) where a side flat goes
//   paneWindow(opts)            frame, bars and a glowing pane to stand in an opening
//   shafts(opts), floorPatch(opts)   additive light cards from a window; the window thrown on the floor
//   gableWall(opts), runner(opts)
//   boardFloor(opts), flagFloor(opts)
//   openRoof(opts)              two sloped planes seen from below, trusses with king posts and braces
//   hangLamp(opts)              an enamel shade on a cord; anchors: lamp
//   trestle(opts), form(opts)   a long table and a bench to sit at it;  tableware(opts) bowls and mugs along one
//   stove(opts)                 the Commons' one stove: an iron range, cauldrons, a flue; anchors: fire, pots, flue
//   chalkboard(opts)            the Commons' account: GAVE / IS OWED, rows of chalk names; anchors: credit[2]
//   clothBanner(opts)           a miners' banner with a swallow tail and a device
//   pitGate(opts)               the pithead gate: stone posts, two timber leaves, a side door; anchors: cressets, notice, door
//   palisade(opts), cresset(opts) (anchors: fire), notice(opts), headframe(opts) (anchors: lamp, wheels)
//   saltHeap(opts), crystals(opts) (stillsalt shards, glowing), lampHouse(opts) (anchors: lamp), islandTown(opts)
//   cave(opts)                  the inside of a rock gallery or a barrel vault, faceted, facing inward
//   timberSet(opts), oreCart(opts), rails(opts), cage(opts) (the pit cage; anchors: top), pick()
//   drawerBank(opts)            a cabinet of deed drawers, some lettered; anchors: drawers
//   lectern(opts) (anchors: top), sleeper(opts) (the night clerk on his chair), keg(opts), handLamp(opts) (anchors: lamp)
//   judgeBench(opts)            the circuit bench on its dais with the magistrate behind it; anchors: top, seat
//   rollBoard(opts)             the roll of those the pit kept: columns of small brass plates under a crest
//   courtTable(opts), ropeRail(opts), lampRack(opts)
//   driftFire(opts) (anchors: fire), duneGrass(opts), seaWall(opts), driftNet(opts), dryingRack(opts), beachedBoat via kit.boat
//   tideMarker(opts), saltRoad(opts)
//   ch2Materials()              kitMaterials() plus wall / shaft / rock
//   shell(spec)                 what every set returns: cameras, frame(), view(), lamps, flames, setPower(), update()

import { m4, quat, rng, DEG, rgb } from '../math.js';
import {
  sphere, ellipsoid, cylinder, lathe, torus, box, roundedBox, extrude, tube, curve, plane, quad, fromArrays, blob,
  merge, tint, paint, place, setGlow, setOutline, gradientY, deform, scale as scaleMesh,
} from '../mesh.js';
import { material, group } from '../scene.js';
import { PAL, wonk, kitMaterials, setRig, townsfolk } from './kit.js';

/** Saltmere's colours. */
export const SM = {
  salt: '#fffaf0', saltShade: '#e4e8ff', saltWarm: '#fff0d8', saltGround: '#fff3dc',
  timber: '#d08a4e', timberDark: '#96563a', timberPale: '#eeb074', timberRed: '#c8643e',
  rust: '#e8573c', iron: '#3b4a7a', ironBlue: '#5a6cc0', brass: '#ffc94a', brassDark: '#e0932e',
  slate: '#2a8a8c', slateDark: '#1d6672', chalk: '#f6fff4',
  plaster: '#ffe6c2', plasterRose: '#ffd2c0', plasterBlue: '#d6dcff', brick: '#ef8562', brickDark: '#c8604e',
  stone: '#b9b4f0', stoneDark: '#8f8ae0', stoneDeep: '#6a66c8',
  enamel: '#27b8a8', enamelDark: '#1c8c9a', royal: '#3f6fe0', wine: '#c23a5e', mustard: '#ffcc44', coral: '#ff7a5a', plum: '#7a4fc4',
  still: '#8ff4ff', stillDeep: '#45b8f6', rock: '#8a80e6', rock2: '#6a60cc', rock3: '#544ab4', rockHi: '#b4a8f8',
  paper: '#fff8e6', seal: '#f0442e', sand: '#ffe2a6', sandWet: '#e8b98a',
  cloth: ['#3f78e0', '#f4573f', '#ffd24a', '#35c9b5', '#ff8fb0', '#8a6be0'],
};

const R = (seed) => rng(Math.floor(seed * 7919) + 53);
const keep = (mesh, anchors) => { mesh.anchors = anchors; return mesh; };
const bx = (w, h, d, x, y, z, c, rx = 0, ry = 0, rz = 0) => tint(place(box(w, h, d), x, y, z, rx, ry, rz), c);
const rb = (w, h, d, rad, x, y, z, c, rx = 0, ry = 0, rz = 0) => tint(place(roundedBox(w, h, d, rad, 1), x, y, z, rx, ry, rz), c);
const cyl = (r0, r1, h, seg, x, y, z, c, rx = 0, ry = 0, rz = 0) => tint(place(cylinder(r0, r1, h, seg), x, y, z, rx, ry, rz), c);
const shade = (c, k) => rgb(c).map((v) => Math.min(1, v * k));
export const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

/** Materials for chapter 2, on top of kitMaterials(): { ...kit, wall, shaft, rock }. */
export function ch2Materials() {
  return {
    ...kitMaterials(),
    /** walls, roofs, anything that encloses a room: receives shadows, casts none, no rim */
    wall: material({ name: 'ch2-wall', rim: 0, bandEdge: -0.2, outline: { width: 1.9, self: 0.65 }, castShadow: false }),
    /** additive window shafts */
    shaft: material({ kind: 'beam', name: 'ch2-shaft', beam: { power: 0.6, near: 0.3, far: 0.04, steps: 0 }, outline: false }),
    /** rock faces seen from inside: faceted, no rim, casts nothing, a thin dark-violet line */
    rock: material({ name: 'ch2-rock', rim: 0, bandEdge: 0.0, outline: { width: 1.5, self: 0.8 }, castShadow: false }),
  };
}

// ------------------------------------------------------------------------------------ lettering

const FONT = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
  G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101',
  S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100110101010', 7: '111001010010010', 8: '010101010101010', 9: '010101011001110',
  '.': '000000000000010', ',': '000000000010100', '-': '000000111000000',
};
/**
 * Lettering in a 3x5 block face as flat quads facing +Z: chalk on a board, paint on a drawer. `s` is the height of a
 * letter; the text is centred on the origin (align: 'left' starts it there). Unknown characters are spaces.
 */
export function pixelText(str, { s = 0.2, color = SM.chalk, glow = 0.3, align = 'center', jitter = 0, seed = 1 } = {}) {
  const px = s / 5, parts = [], r = R(seed), text = String(str).toUpperCase(), adv = px * 4;
  const x0 = align === 'left' ? 0 : -(text.length * adv - px) / 2;
  for (let i = 0; i < text.length; i++) {
    const g = FONT[text[i]]; if (!g) continue;
    const jy = (r() - 0.5) * jitter * s;
    for (let row = 0; row < 5; row++) for (let c = 0; c < 3; c++) {
      if (g[row * 3 + c] !== '1') continue;
      let run = 1; while (c + run < 3 && g[row * 3 + c + run] === '1') run++;
      parts.push(place(quad(px * run * 0.96, px * 0.92), x0 + i * adv + (c + run / 2) * px, (2 - row) * px + jy, 0));
      c += run - 1;
    }
  }
  if (!parts.length) parts.push(place(quad(0.001, 0.001), 0, 0, 0));
  return setOutline(setGlow(tint(merge(parts), color), glow), 0);
}

// ------------------------------------------------------------------------------------ rooms

function archPts(cx, y, hw, rise, n = 8) { const out = []; for (let i = 0; i <= n; i++) { const a = Math.PI * (1 - i / n); out.push([cx + Math.cos(a) * hw, y + Math.sin(a) * rise]); } return out; }

/**
 * A wall run `w` wide and `h` high with openings cut in it. Origin: bottom centre of the room face, which faces +Z;
 * the wall goes back `t` behind z = 0.   openings: [{ x, w, sill (0 = a doorway), top, arch }]
 */
export function roomWall({ w = 10, h = 5, t = 0.3, color = SM.plaster, openings = [] } = {}) {
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
  return tint(merge(parts), color);
}

/**
 * The gable over a back wall: the triangle between the eaves (y = 0 here: put the node at the wall height) and the ridge
 * `rise` above, `w` across, with an arched window cut in it. window: { w, sill (may be below 0: only the part above the
 * eaves is cut here; notch the wall under it yourself), top } or null. Faces +Z, goes back `t`.
 */
export function gableWall({ w = 12, rise = 2.6, t = 0.3, color = SM.plaster, window = null } = {}) {
  const hw = w / 2, roof = (x) => rise * (1 - Math.abs(x) / hw), parts = [];
  if (!window) parts.push(extrude([[-hw, 0], [hw, 0], [0, rise]], t, { crease: 30 }));
  else {
    const ww = window.w / 2, r = Math.min(ww, window.top - Math.max(0, window.sill) - 0.02), spring = window.top - r;
    for (const sx of [-1, 1]) parts.push(extrude([[sx * hw, 0], [sx * ww, 0], [sx * ww, roof(ww)]], t, { crease: 30 }));
    parts.push(extrude([...archPts(0, spring, ww, r, 10), [ww, roof(ww)], [0, rise], [-ww, roof(ww)]], t, { crease: 30 }));
    if (window.sill > 0) parts.push(place(box(window.w, window.sill, t), 0, window.sill / 2, 0));
  }
  return tint(place(merge(parts), 0, 0, -t / 2), color);
}

/** A cloth runner on the floor along Z: a field, two border stripes, fringed ends. Centred, a few millimetres thick. */
export function runner({ w = 1.5, len = 6, field = SM.wine, border = SM.mustard, line = SM.salt } = {}) {
  const parts = [bx(w, 0.012, len, 0, 0.006, 0, border), bx(w - 0.24, 0.012, len - 0.2, 0, 0.01, 0, field)];
  for (const sx of [-1, 1]) parts.push(bx(0.05, 0.012, len - 0.5, sx * (w / 2 - 0.3), 0.014, 0, line));
  const n = Math.round(len / 1.1);
  for (let i = 0; i < n; i++) parts.push(tint(place(cylinder(w * 0.16, w * 0.16, 0.012, 4), 0, 0.012, -len / 2 + (len * (i + 0.5)) / n), i % 2 ? border : line));
  return setOutline(merge(parts), 0.6);
}

/**
 * Side walls splayed like stage flats. Given the back wall's half width at z = backZ and the half width the room has
 * opened to at z = frontZ: { len, pos, yaw, at(localX, out = 0, y = 0) -> [x, y, z] } for side -1 / +1.
 */
export function splay(side, backHalf, backZ, frontHalf, frontZ) {
  const dx = frontHalf - backHalf, dz = frontZ - backZ, len = Math.hypot(dx, dz);
  const n = [-side * dz / len, dx / len], yaw = Math.atan2(n[0], n[1]) / DEG;
  const pos = [side * (backHalf + frontHalf) / 2, 0, (backZ + frontZ) / 2], c = Math.cos(yaw * DEG), sn = Math.sin(yaw * DEG);
  return { len, pos, yaw, at: (lx, out = 0, y = 0) => [pos[0] + lx * c + out * sn, y, pos[2] - lx * sn + out * c] };
}

/**
 * What fills an opening: jambs, a head, a sill, glazing bars and one glowing pane (the sky or the night outside).
 * Origin: the centre of the sill line in the wall's room face. `glass` is the pane's colour, `glow` how bright.
 */
export function paneWindow({ w = 1.6, h = 2.4, arch = true, frame = SM.timberDark, glass = '#bfe8ff', glass2 = null, glow = 0.9, bars = 2, rows = 2, depth = 0.3, sill = true } = {}) {
  const parts = [], hw = w / 2, rise = arch ? Math.min(hw, h - 0.05) : 0, spring = h - rise, t = 0.1;
  const outline = arch ? [[-hw, 0], ...archPts(0, spring, hw, rise, 10), [hw, 0]] : [[-hw, 0], [-hw, h], [hw, h], [hw, 0]];
  const pane = place(extrude(outline, 0.02, { crease: 30 }), 0, 0, -depth * 0.6);
  parts.push(setOutline(setGlow(glass2 ? gradientY(pane, glass2, glass, 0, h) : tint(pane, glass), glow), 0));
  for (const sx of [-1, 1]) parts.push(bx(t, spring, depth, sx * (hw - t * 0.3), spring / 2, -depth / 2 + 0.05, frame));
  if (arch) parts.push(tint(place(tube(archPts(0, spring, hw - t * 0.3, rise - t * 0.3, 12).map((p) => [p[0], p[1], 0]), t * 0.6, 4, { crease: 60, caps: false }), 0, 0, -depth / 2 + 0.05, 0, 0, 0, 1, 1, depth / (t * 1.2)), frame));
  else parts.push(bx(w + t * 0.4, t, depth, 0, h - t * 0.2, -depth / 2 + 0.05, frame));
  if (sill) parts.push(rb(w + 0.34, 0.1, depth + 0.16, 0.03, 0, -0.04, -depth / 2 + 0.13, frame));
  const bt = t * 0.42;
  for (let i = 1; i <= bars; i++) parts.push(bx(bt, arch ? spring + rise * 0.7 : h, bt, -hw + (w * i) / (bars + 1), (arch ? spring + rise * 0.7 : h) / 2, -depth * 0.5, frame));
  for (let j = 1; j < rows; j++) parts.push(bx(w, bt, bt, 0, (arch ? spring : h) * j / rows + (arch && j === rows - 1 ? spring / rows * 0.0 : 0), -depth * 0.5, frame));
  if (arch) parts.push(bx(w, bt, bt, 0, spring, -depth * 0.5, frame));
  return keep(merge(parts), { head: [0, h, 0], centre: [0, h / 2, 0] });
}

/** Light slanting in through an opening, as additive cards. Origin: the centre of the opening; the light runs along `dir` for `len`. */
export function shafts({ w = 1.4, h = 2.4, dir = [0.3, -1, 1], len = 5, cards = 3, color = '#ffd890', spread = 0.25 } = {}) {
  const l = Math.hypot(dir[0], dir[1], dir[2]), d = [dir[0] / l * len, dir[1] / l * len, dir[2] / l * len], parts = [];
  for (let i = 0; i < cards; i++) {
    const t = cards === 1 ? 0.5 : i / (cards - 1), y = (t - 0.5) * h * 0.8, k = 1 + spread;
    parts.push(fromArrays([-w / 2, y, 0, w / 2, y, 0, -w / 2 * k + d[0], y + d[1], d[2], w / 2 * k + d[0], y + d[1], d[2]], [0, 2, 3, 0, 3, 1], [0, 0, 1, 0, 0, 1, 1, 1], 180));
  }
  return setOutline(tint(merge(parts), color), 0);
}

/** A window thrown on the floor: bright panes with gaps for the bars, sheared along the light. Centred, long axis Z. */
export function floorPatch({ w = 1.5, d = 2.6, panes = 3, rows = 2, shear = 0.3, color = '#ffe2a0', glow = 0.55 } = {}) {
  const parts = [], pw = w / panes, rd = d / rows, gap = 0.08;
  for (let i = 0; i < panes; i++) for (let j = 0; j < rows; j++) parts.push(place(plane(pw - gap, rd - gap), -w / 2 + pw * (i + 0.5), 0, d / 2 - rd * (j + 0.5)));
  const m = merge(parts), P = m.positions;
  for (let i = 0; i < P.length; i += 3) P[i] += -P[i + 2] * shear;
  return setOutline(setGlow(tint(m, color), glow), 0);
}

/** Floorboards running front to back, centred, top at y = 0. */
export function boardFloor({ w = 12, d = 10, n = 14, colors = ['#f0b070', '#e8a260', '#f6ba7e'], seed = 1, gapColor = '#b8703e' } = {}) {
  const r = R(seed), parts = [], bw = w / n;
  for (let i = 0; i < n; i++) parts.push(tint(place(plane(bw - 0.035, d), -w / 2 + bw * (i + 0.5), 0, 0), colors[Math.floor(r() * colors.length)]));
  parts.push(tint(place(plane(w, d), 0, -0.004, 0), gapColor));
  return setOutline(merge(parts), 0);
}

/** Stone flags, each a little off square, centred, top at y = 0. */
export function flagFloor({ w = 12, d = 10, nx = 8, nz = 7, colors = [SM.stone, SM.stoneDark, '#c8c2f6'], seed = 1, gapColor = SM.stoneDeep } = {}) {
  const r = R(seed), parts = [], tw = w / nx, td = d / nz;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) parts.push(tint(place(plane(tw - 0.06, td - 0.06), -w / 2 + tw * (i + 0.5) + (j % 2 ? tw * 0.25 : 0), 0, -d / 2 + td * (j + 0.5), 0, (r() - 0.5) * 3, 0), colors[Math.floor(r() * colors.length)]));
  parts.push(tint(place(plane(w + tw, d), 0, -0.004, 0), gapColor));
  return setOutline(merge(parts), 0);
}

/**
 * An open timber roof seen from below. Origin: the middle of the wall-plate line at the back; it runs `d` toward +Z.
 * Eaves at y = 0 (put the node at the wall height), ridge `rise` above, `w` across. `n` trusses: tie beam, king post, two braces.
 */
export function openRoof({ w = 13, d = 9, rise = 2.6, n = 4, color = '#ffd9b0', beam = SM.timberDark, purlins = 2 } = {}) {
  const parts = [], hw = w / 2, sl = Math.hypot(hw, rise), ang = Math.atan2(rise, hw) / DEG;
  for (const sx of [-1, 1]) parts.push(tint(place(box(sl + 0.3, 0.12, d), sx * hw / 2, rise / 2 + 0.07, d / 2, 0, 0, -sx * ang), color));
  parts.push(rb(0.26, 0.3, d, 0.04, 0, rise - 0.12, d / 2, beam));
  for (let p = 1; p <= purlins; p++) for (const sx of [-1, 1]) { const t = p / (purlins + 1); parts.push(rb(0.18, 0.2, d, 0.03, sx * hw * t, rise * (1 - t) - 0.08, d / 2, beam, 0, 0, -sx * ang)); }
  for (let i = 0; i < n; i++) {
    const z = n === 1 ? d / 2 : 0.3 + (d - 0.6) * i / (n - 1), tilt = (i % 2 ? 1 : -1) * 0.6;
    parts.push(rb(w, 0.32, 0.3, 0.05, 0, 0, z, beam, 0, 0, tilt));
    parts.push(rb(0.26, rise - 0.1, 0.26, 0.04, 0, rise / 2, z, beam));
    for (const sx of [-1, 1]) {
      parts.push(rb(sl, 0.22, 0.22, 0.04, sx * hw / 2, rise / 2 - 0.1, z, beam, 0, 0, -sx * ang));
      parts.push(rb(Math.hypot(hw * 0.45, rise * 0.5), 0.16, 0.16, 0.03, sx * hw * 0.24, rise * 0.27, z, beam, 0, 0, sx * Math.atan2(rise * 0.5, hw * 0.45) / DEG));
    }
  }
  return merge(parts);
}

/** An enamel shade on a cord. Origin: where the cord meets the roof; hangs `drop`. anchors: lamp (the bulb) */
export function hangLamp({ drop = 1.6, r = 0.4, shade = SM.enamel, inner = '#fff6d0', glass = '#ffe9a8', cord = SM.iron } = {}) {
  const parts = [cyl(0.014, 0.014, drop - r * 0.5, 4, 0, -(drop - r * 0.5), 0, cord)], y = -drop;
  parts.push(tint(place(lathe([[r, 0], [r * 1.04, 0.03], [r * 0.34, r * 0.52], [r * 0.18, r * 0.62], [r * 0.14, r * 0.8], [0, r * 0.8]], 12, { crease: 50 }), 0, y, 0), shade));
  parts.push(setOutline(setGlow(tint(place(lathe([[0, 0], [r * 0.94, 0.012], [r * 0.3, r * 0.48], [0, r * 0.5]], 12, { crease: 180 }), 0, y - 0.004, 0), inner), 0.8), 0));
  parts.push(setGlow(tint(place(sphere(r * 0.24, 8, 6), 0, y + r * 0.1, 0), glass), 1));
  return keep(merge(parts), { lamp: [0, y + r * 0.05, 0] });
}

// ------------------------------------------------------------------------------------ the Commons

/** A long trestle table running along Z, centred, top at y = h. */
export function trestle({ len = 4, w = 0.9, h = 0.62, color = SM.timberPale, dark = SM.timberDark, seed = 1 } = {}) {
  const r = R(seed), parts = [], n = 3, pw = w / n;
  for (let i = 0; i < n; i++) parts.push(rb(pw - 0.02, 0.07, len, 0.02, -w / 2 + pw * (i + 0.5), h - 0.035 + (r() - 0.5) * 0.012, 0, i % 2 ? shade(color, 0.93) : color, 0, (r() - 0.5) * 1.2, 0));
  const nt = Math.max(2, Math.round(len / 1.8));
  for (let k = 0; k < nt; k++) {
    const z = -len / 2 + 0.4 + (len - 0.8) * (nt === 1 ? 0.5 : k / (nt - 1));
    for (const sx of [-1, 1]) parts.push(rb(0.09, h * 1.08, 0.1, 0.02, sx * w * 0.24, h / 2 - 0.04, z, dark, 0, 0, sx * 16));
    parts.push(rb(w * 0.8, 0.08, 0.09, 0.02, 0, h * 0.32, z, dark));
  }
  parts.push(rb(0.07, 0.08, len - 0.7, 0.02, 0, h * 0.32, 0, dark));
  return merge(parts);
}

/** A form (backless bench) running along Z. */
export function form({ len = 4, h = 0.36, color = SM.timber, dark = SM.timberDark } = {}) {
  const parts = [rb(0.3, 0.06, len, 0.02, 0, h - 0.03, 0, color)];
  for (const sz of [-1, 1]) parts.push(rb(0.26, h - 0.05, 0.07, 0.02, 0, (h - 0.05) / 2, sz * (len / 2 - 0.3), dark));
  return merge(parts);
}

/** Bowls, mugs, a loaf or two along a table top of length `len` (along Z) at y = 0. Steam is the set's business. */
export function tableware({ len = 4, w = 0.9, seed = 1, n = 6 } = {}) {
  const r = R(seed), parts = [];
  for (let i = 0; i < n; i++) {
    const z = -len / 2 + 0.35 + (len - 0.7) * (i + r() * 0.5) / n, x = (i % 2 ? 1 : -1) * w * (0.2 + r() * 0.08), k = r();
    if (k < 0.55) { parts.push(tint(place(lathe([[0, 0], [0.07, 0], [0.13, 0.07], [0.11, 0.07], [0.06, 0.02], [0, 0.02]], 7, { crease: 60 }), x, 0, z), i % 3 ? SM.salt : '#bfe8ff')); parts.push(tint(place(cylinder(0.1, 0.1, 0.005, 7), x, 0.055, z), i % 2 ? '#ffb45a' : '#ff8f5a')); }
    else if (k < 0.85) parts.push(tint(place(cylinder(0.05, 0.055, 0.11, 6), x, 0, z), SM.cloth[i % SM.cloth.length]));
    else parts.push(tint(place(ellipsoid(0.16, 0.085, 0.1, 7, 4), x, 0.07, z, 0, r() * 180, 0), '#f0a85a'));
  }
  return merge(parts);
}

/**
 * The Commons' one stove: a broad iron range on stubby legs, a firebox door with fire behind its bars, a hot plate with
 * three cauldrons, a rail of ladles, a crooked flue going up `flue` and into the wall. Front toward +Z, centred, on y = 0.
 * anchors: fire (the firebox mouth), pots [3] (where steam rises), flue (top of the pipe)
 */
export function stove({ w = 2.6, h = 0.95, d = 0.95, flue = 4.4, color = SM.iron, trim = SM.brass, seed = 1 } = {}) {
  const parts = [], hi = shade(color, 1.35);
  parts.push(rb(w, h - 0.14, d, 0.06, 0, (h - 0.14) / 2 + 0.14, 0, color));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(cyl(0.07, 0.09, 0.16, 6, sx * (w / 2 - 0.16), 0, sz * (d / 2 - 0.14), color));
  parts.push(rb(w + 0.14, 0.08, d + 0.12, 0.03, 0, h, 0, hi));
  // firebox: a glowing mouth behind bars, an ash drawer, an oven door
  const fx = -w * 0.22;
  parts.push(setGlow(bx(w * 0.34, 0.34, 0.03, fx, 0.5, d / 2 + 0.005, '#ffb040'), 1), setGlow(bx(w * 0.34, 0.12, 0.035, fx, 0.4, d / 2 + 0.006, '#ff6a28'), 1));
  for (let i = 0; i < 5; i++) parts.push(bx(0.035, 0.38, 0.05, fx - w * 0.14 + i * w * 0.07, 0.5, d / 2 + 0.03, color));
  parts.push(rb(w * 0.42, 0.06, 0.06, 0.02, fx, 0.72, d / 2 + 0.03, hi), rb(w * 0.42, 0.06, 0.06, 0.02, fx, 0.29, d / 2 + 0.03, hi));
  parts.push(rb(w * 0.34, 0.44, 0.05, 0.03, w * 0.24, 0.5, d / 2 + 0.02, hi), tint(place(torus(0.07, 0.016, 8, 4), w * 0.24, 0.58, d / 2 + 0.06, 90, 0, 0), trim));
  parts.push(tint(place(cylinder(0.014, 0.014, w * 0.94, 5), -w * 0.47, h - 0.2, d / 2 + 0.1, 0, 0, -90), trim));
  for (let i = 0; i < 4; i++) parts.push(cyl(0.012, 0.012, 0.3, 4, w * 0.08 + i * 0.16, h - 0.5, d / 2 + 0.1, trim), tint(place(sphere(0.05, 6, 4), w * 0.08 + i * 0.16, h - 0.52, d / 2 + 0.1, 0, 0, 0, 1, 0.6, 1), trim));
  // cauldrons
  const pots = [];
  [[-w * 0.3, 0.34, '#5a6cc0'], [w * 0.04, 0.4, '#e8573c'], [w * 0.34, 0.28, '#27b8a8']].forEach(([x, pr, c], i) => {
    const y = h + 0.04, ph = pr * 1.05;
    parts.push(tint(place(lathe([[0, 0], [pr * 0.8, 0], [pr, ph * 0.3], [pr * 0.96, ph], [pr * 1.08, ph + 0.03], [pr * 0.9, ph + 0.03], [pr * 0.86, ph * 0.5], [0, ph * 0.5]], 10, { crease: 50 }), x, y, 0), c));
    parts.push(setGlow(tint(place(cylinder(pr * 0.9, pr * 0.9, 0.01, 10), x, y + ph * 0.86, 0), i === 1 ? '#ffb86a' : '#ffe0a0'), 0.25));
    for (const sx of [-1, 1]) parts.push(tint(place(torus(0.07, 0.018, 6, 4), x + sx * pr * 1.04, y + ph * 0.8, 0, 0, 0, 90), SM.iron));
    pots.push([x, y + ph + 0.1, 0]);
  });
  parts.push(tint(place(cylinder(0.02, 0.02, 0.7, 5), w * 0.04 + 0.1, h + 0.3, 0.05, 0, 0, -24), SM.timber));
  // the flue: up, a dog-leg, up again
  const fx2 = -w * 0.34, path = curve([[fx2, h, -d * 0.2], [fx2, h + flue * 0.42, -d * 0.2], [fx2 + 0.5, h + flue * 0.55, -d * 0.25], [fx2 + 0.55, h + flue, -d * 0.3]], 10);
  parts.push(tint(tube(path, 0.15, 8, { crease: 50 }), color));
  for (const t of [0.2, 0.75]) { const p = path[Math.round(t * 10)]; parts.push(tint(place(torus(0.16, 0.03, 8, 4), p[0], p[1], p[2]), hi)); }
  const m = wonk(merge(parts), { lean: 0.006 * (seed % 2 ? 1 : -1), bulge: 0.02 });
  return keep(m, { fire: [fx, 0.5, d / 2 + 0.1], pots, flue: [fx2 + 0.55, h + flue, -d * 0.3], top: [0, h + 0.04, 0] });
}

/**
 * The Commons' account: a slate the length of the hall in a timber frame, two columns headed GAVE and IS OWED, chalk
 * rows of names (a long stroke and a few ticks) under each, a ledge with chalk ends and a rag. Faces +Z; origin bottom centre.
 * anchors: credit [2] (where the next two names go, left ends of two free rows in the IS OWED column), row (row height), col (width of a name)
 */
export function chalkboard({ w = 9, h = 2.0, rows = 8, seed = 1, frame = SM.timberRed, slate = SM.slate, slate2 = SM.slateDark, chalk = SM.chalk, free = 2, headX = null, headS = 0.3 } = {}) {
  const r = R(seed), parts = [], t = 0.14;
  parts.push(rb(w + t * 2, h + t * 2, 0.1, 0.03, 0, h / 2, -0.05, frame));
  parts.push(setOutline(bx(w, h, 0.02, 0, h / 2, 0.012, slate), 0));
  // old wipe marks: paler lozenges on the slate
  for (let i = 0; i < 7; i++) parts.push(setOutline(tint(place(quad(0.9 + r() * 1.2, 0.2 + r() * 0.3), -w / 2 + 0.8 + r() * (w - 1.6), 0.3 + r() * (h - 0.6), 0.024, 0, 0, (r() - 0.5) * 30), slate2), 0));
  parts.push(setOutline(setGlow(bx(0.035, h - 0.16, 0.004, 0, h / 2, 0.028, chalk), 0.25), 0));
  const head = h - 0.3, rowH = (head - 0.34) / rows, credit = [];
  const hx = headX ?? w / 4;
  parts.push(place(pixelText('GAVE', { s: headS, color: chalk, glow: 0.4 }), -hx, head, 0.03), place(pixelText('IS OWED', { s: headS, color: chalk, glow: 0.4 }), hx, head, 0.03));
  for (const sx of [-1, 1]) parts.push(setOutline(setGlow(bx(w / 2 - 0.5, 0.03, 0.004, sx * w / 4, head - 0.2, 0.028, chalk), 0.25), 0));
  const cols = 3, cw = (w / 2 - 0.4) / cols;
  for (const side of [-1, 1]) for (let c = 0; c < cols; c++) for (let k = 0; k < rows; k++) {
    const x = (side < 0 ? -w / 2 + 0.22 : 0.2) + c * cw, y = head - 0.36 - rowH * (k + 0.5) + (r() - 0.5) * 0.03;
    if (side > 0 && c === 0 && k >= rows - free) { credit.push([x, y, 0.03]); continue; }
    if (r() < 0.12) continue;
    const nl = cw * (0.36 + r() * 0.26), col = r() < 0.16 ? '#ffe9a0' : r() < 0.1 ? '#ffc8d8' : chalk;
    // a name: two or three strokes of different lengths, then tally ticks
    let px = x; const words = 1 + (r() < 0.6 ? 1 : 0);
    for (let q = 0; q < words; q++) { const ww = nl * (q ? 0.36 : 0.6); parts.push(setOutline(setGlow(tint(place(quad(ww, rowH * 0.3), px + ww / 2, y, 0.026, 0, 0, (r() - 0.5) * 3), col), 0.3), 0)); px += ww + 0.05; }
    const ticks = Math.floor(r() * 5);
    for (let q = 0; q < ticks; q++) parts.push(setOutline(setGlow(tint(place(quad(0.025, rowH * 0.5), x + cw * 0.72 + q * 0.055, y, 0.026, 0, 0, -8), col), 0.3), 0));
  }
  // ledge, chalk ends, a rag
  parts.push(rb(w + 0.1, 0.06, 0.2, 0.02, 0, -0.03, 0.08, frame));
  for (let i = 0; i < 5; i++) parts.push(tint(place(box(0.09, 0.03, 0.03), -w / 2 + 0.6 + r() * (w - 1.2), 0.016, 0.1, 0, r() * 90, 0), i % 2 ? chalk : '#ffe9a0'));
  parts.push(tint(place(blob({ rx: 0.16, ry: 0.05, rz: 0.09, lumps: 0.6, seed: 4, seg: 7, rings: 4 }), w * 0.3, 0.04, 0.09), SM.coral));
  return keep(merge(parts), { credit, row: rowH, col: cw, head: [0, head, 0.03] });
}

/** A miners' banner: a pole, a cloth with a border, a swallow tail and a device ('pick' | 'lamp' | 'wave' | 'ring'). Origin: middle of the pole; hangs down, faces +Z. */
export function clothBanner({ w = 1.0, h = 2.4, color = SM.royal, trim = SM.mustard, device = 'pick', deviceColor = SM.salt, tail = 0.4, pole = SM.timberDark } = {}) {
  const hw = w / 2, parts = [];
  parts.push(tint(place(cylinder(0.04, 0.04, w + 0.36, 6), -hw - 0.18, 0, 0, 0, 0, -90), pole));
  for (const sx of [-1, 1]) parts.push(tint(place(sphere(0.07, 6, 4), sx * (hw + 0.18), 0, 0), SM.brass));
  parts.push(tint(extrude([[-hw, 0], [hw, 0], [hw, -h], [0, -h + tail], [-hw, -h]], 0.03, { crease: 30 }), trim));
  const k = 0.11;
  parts.push(tint(place(extrude([[-hw + k, -k * 0.6], [hw - k, -k * 0.6], [hw - k, -h + k * 1.8], [0, -h + tail + k * 1.1], [-hw + k, -h + k * 1.8]], 0.03, { crease: 30 }), 0, 0, 0.012), color));
  const y = -h * 0.42, s = w * 0.3, z = 0.036;
  if (device === 'pick') parts.push(bx(s * 0.16, s * 1.7, 0.02, 0, y, z, deviceColor, 0, 0, 38), tint(place(extrude([[-s, 0], [-s * 0.5, s * 0.22], [0, s * 0.28], [s * 0.5, s * 0.22], [s, 0], [s * 0.5, s * 0.1], [0, s * 0.12], [-s * 0.5, s * 0.1]], 0.02, { crease: 30 }), s * 0.42, y + s * 0.5, z, 0, 0, 38), deviceColor));
  else if (device === 'lamp') parts.push(tint(place(cylinder(s * 0.4, s * 0.52, s * 0.9, 6), 0, y - s * 0.45, z - 0.02, 0, 0, 0, 1, 1, 0.1), deviceColor), setGlow(bx(s * 0.3, s * 0.4, 0.02, 0, y - s * 0.05, z + 0.01, '#ffd24a'), 0.6), tint(place(torus(s * 0.3, s * 0.07, 8, 4), 0, y + s * 0.65, z, 90, 0, 0), deviceColor));
  else if (device === 'wave') for (let i = 0; i < 3; i++) parts.push(tint(place(tube(curve([[-s, 0, 0], [-s * 0.5, s * 0.22, 0], [0, 0, 0], [s * 0.5, -s * 0.22, 0], [s, 0, 0]], 8), s * 0.08, 4, { squash: 0.3 }), 0, y + (i - 1) * s * 0.55, z), deviceColor));
  else if (device === 'ring') parts.push(tint(place(torus(s * 0.7, s * 0.16, 12, 4), 0, y, z, 90, 0, 0), deviceColor), tint(place(cylinder(s * 0.28, s * 0.28, 0.03, 8), 0, y, z, 90, 0, 0), deviceColor));
  return merge(parts);
}

// ------------------------------------------------------------------------------------ the pithead

/** A paper nailed up: lines of print, a big red seal, a curled corner. Faces +Z, centred, `s` tall. */
export function notice({ s = 0.6, seal = SM.seal, paper = SM.paper, glow = 0.12 } = {}) {
  const w = s * 0.74, parts = [setGlow(bx(w, s, 0.012, 0, 0, 0, paper), glow)];
  parts.push(setOutline(bx(w * 0.6, s * 0.07, 0.004, 0, s * 0.36, 0.009, PAL.navy), 0));
  for (let i = 0; i < 5; i++) parts.push(setOutline(bx(w * (0.7 - (i % 3) * 0.1), s * 0.03, 0.004, -(i % 3) * w * 0.05, s * (0.22 - i * 0.09), 0.009, '#6a74b0'), 0));
  parts.push(tint(place(cylinder(s * 0.13, s * 0.13, 0.02, 9), w * 0.2, -s * 0.31, 0.012, 90, 0, 0), seal), tint(place(cylinder(s * 0.07, s * 0.07, 0.03, 7), w * 0.2, -s * 0.31, 0.016, 90, 0, 0), shade(seal, 0.8)));
  for (const sx of [-1, 1]) parts.push(tint(place(extrude([[0, 0], [s * 0.05, -s * 0.16], [-s * 0.05, -s * 0.16]], 0.01), w * 0.2 + sx * s * 0.05, -s * 0.38, 0.008, 0, 0, sx * 14), seal));
  for (const [x, y] of [[-w * 0.4, s * 0.44], [w * 0.4, s * 0.44]]) parts.push(tint(place(sphere(0.02, 5, 3), x, y, 0.012), SM.iron));
  return merge(parts);
}

/** An iron fire basket on a post or a bracket. Origin: foot of the post. anchors: fire (where the flame node stands) */
export function cresset({ h = 2.2, r = 0.26, color = SM.iron, post = true } = {}) {
  const parts = [];
  if (post) parts.push(tint(lathe([[0, 0], [0.12, 0], [0.08, 0.1], [0.06, h - 0.3], [0.1, h - 0.24], [0, h - 0.24]], 6, { crease: 50 }), color));
  parts.push(tint(place(lathe([[0, 0], [r * 0.55, 0.02], [r, r * 0.9], [r * 1.06, r * 0.96], [r * 0.9, r * 0.96], [r * 0.5, 0.1], [0, 0.1]], 8, { crease: 60 }), 0, h - 0.26, 0), color));
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; parts.push(tint(place(box(0.03, r * 1.1, 0.03), Math.cos(a) * r * 0.82, h - 0.26 + r * 0.55, Math.sin(a) * r * 0.82, 0, 0, 0), color)); }
  parts.push(setGlow(tint(place(blob({ rx: r * 0.8, ry: r * 0.3, rz: r * 0.8, lumps: 0.6, seed: 3, seg: 8, rings: 5 }), 0, h - 0.26 + r * 0.8, 0), '#ff9a3c'), 0.95));
  return keep(merge(parts), { fire: [0, h - 0.26 + r * 0.9, 0] });
}

/**
 * The pithead gate: two fat stone posts with caps, two tall timber leaves shut and chained, iron straps, a beam across
 * the top with the pit's name board, and (side: +1 right) a low side door in a stone wing wall.
 * Faces +Z, centred on the gateway, on y = 0. `w` is the gateway, `h` the leaves.
 * anchors: postL, postR (tops, for cressets), notice (on the left leaf), door (centre of the side door, floor), hinge (side door's hinge foot), lintel
 */
export function pitGate({ w = 4.2, h = 3.3, post = 0.9, name = 'SALTMERE PIT', wood = SM.timber, wood2 = SM.timberPale, stone = SM.stone, iron = SM.iron, side = 1, doorW = 1.0, doorH = 1.75, seed = 1 } = {}) {
  const r = R(seed), parts = [], hw = w / 2, ph = h + 0.7;
  for (const sx of [-1, 1]) {
    const x = sx * (hw + post / 2), p = [];
    p.push(rb(post, ph, post, 0.08, 0, ph / 2, 0, stone));
    for (let k = 0; k < 4; k++) p.push(bx(post + 0.03, 0.05, post + 0.03, 0, ph * (0.2 + k * 0.22), 0, SM.stoneDark));
    p.push(rb(post + 0.3, 0.2, post + 0.3, 0.05, 0, ph + 0.1, 0, SM.stoneDark), rb(post + 0.1, 0.16, post + 0.1, 0.05, 0, ph + 0.28, 0, stone));
    parts.push(place(wonk(merge(p), { lean: sx * 0.012, bulge: 0.04 }), x, 0, 0));
  }
  // leaves: vertical planks, two rails and a brace each, straps, studs
  for (const sx of [-1, 1]) {
    const n = 5, pw = (hw - 0.03) / n;
    for (let i = 0; i < n; i++) { const top = h - 0.12 * Math.abs(i - (sx < 0 ? n - 1 : 0)) * 0.5 + (r() - 0.5) * 0.08; parts.push(rb(pw - 0.025, top, 0.09, 0.02, sx * (0.03 + pw * (i + 0.5)), top / 2 + 0.06, 0, i % 2 ? wood : wood2)); }
    for (const y of [0.55, h - 0.6]) parts.push(rb(hw - 0.06, 0.2, 0.07, 0.02, sx * hw / 2, y, 0.07, SM.timberDark), bx(hw * 0.7, 0.09, 0.03, sx * (hw - hw * 0.35), y, 0.11, iron));
    parts.push(rb(Math.hypot(hw - 0.3, h - 1.15), 0.16, 0.06, 0.02, sx * hw / 2, h / 2, 0.065, SM.timberDark, 0, 0, sx * Math.atan2(h - 1.15, hw - 0.3) / DEG));
    for (let k = 0; k < 4; k++) parts.push(tint(place(sphere(0.04, 5, 3), sx * (hw - 0.2 - k * 0.42), 0.55, 0.13), SM.brass), tint(place(sphere(0.04, 5, 3), sx * (hw - 0.2 - k * 0.42), h - 0.6, 0.13), SM.brass));
  }
  // chain and padlock across the meeting stiles
  parts.push(tint(place(tube(curve([[-0.5, 1.5, 0.13], [-0.2, 1.3, 0.16], [0.2, 1.3, 0.16], [0.5, 1.5, 0.13]], 8), 0.035, 5), 0, 0, 0), iron), rb(0.2, 0.22, 0.08, 0.03, 0, 1.2, 0.17, SM.brass), tint(place(torus(0.07, 0.02, 8, 4), 0, 1.34, 0.17, 90, 0, 0), iron));
  // the beam and the name board
  const ly = ph + 0.75;
  parts.push(rb(w + post * 2 + 0.9, 0.34, 0.36, 0.05, 0, ly, 0, SM.timberDark, 0, 0, -1.2));
  for (const sx of [-1, 1]) parts.push(rb(0.24, 0.6, 0.24, 0.04, sx * (hw + post / 2), ph + 0.6, 0, SM.timberDark));
  parts.push(rb(w * 0.82, 0.62, 0.08, 0.03, 0, ly + 0.5, 0.02, SM.rust, 0, 0, -1.6), place(pixelText(name, { s: 0.3, color: SM.salt, glow: 0.2 }), 0, ly + 0.5, 0.075, 0, 0, -1.6));
  // wing walls; the side door on one of them
  const wingW = 3.4;
  for (const sx of [-1, 1]) {
    const x = sx * (hw + post + wingW / 2), wh = 2.5;
    if (sx === side) {
      const dx = sx * (hw + post + 0.25 + doorW / 2);
      parts.push(place(roomWall({ w: wingW, h: wh, t: 0.5, color: stone, openings: [{ x: dx - x, w: doorW, sill: 0, top: doorH, arch: true }] }), x, 0, 0.12));
    } else parts.push(bx(wingW, wh, 0.5, x, wh / 2, -0.13, stone));
    parts.push(rb(wingW + 0.1, 0.16, 0.66, 0.04, x, wh + 0.06, -0.13, SM.stoneDark));
    for (let k = 0; k < 9; k++) parts.push(setOutline(bx(0.5 + r() * 0.3, 0.035, 0.01, x - wingW / 2 + 0.4 + r() * (wingW - 0.8), 0.3 + r() * (wh - 0.5), 0.125, SM.stoneDark), 0));
  }
  const dx = side * (hw + post + 0.25 + doorW / 2);
  return keep(merge(parts), {
    postL: [-(hw + post / 2), ph + 0.36, 0], postR: [hw + post / 2, ph + 0.36, 0], notice: [-hw * 0.5, 1.85, 0.13],
    door: [dx, 0, 0.1], hinge: [dx - side * doorW / 2, 0, 0.1], lintel: [0, ly, 0], doorW, doorH,
  });
}

/** A run of palisade: pointed stakes of uneven height on two rails, `len` along X, centred, on y = 0. */
export function palisade({ len = 6, h = 2.2, seed = 1, colors = [SM.timber, SM.timberPale, SM.timberRed] } = {}) {
  const r = R(seed), parts = [], n = Math.round(len / 0.34);
  for (let i = 0; i < n; i++) {
    const hh = h * (0.86 + r() * 0.24), x = -len / 2 + (len * (i + 0.5)) / n;
    parts.push(tint(place(lathe([[0, 0], [0.14, 0], [0.13, hh - 0.26], [0, hh]], 5, { crease: 40 }), x, 0, (r() - 0.5) * 0.05, (r() - 0.5) * 4, r() * 90, (r() - 0.5) * 5), colors[Math.floor(r() * colors.length)]));
  }
  for (const y of [h * 0.3, h * 0.7]) parts.push(rb(len, 0.12, 0.08, 0.02, 0, y, 0.15, SM.timberDark, 0, 0, (r() - 0.5) * 1.2));
  return merge(parts);
}

/**
 * The winding tower over the shaft: four splayed legs, cross braces, a platform, two big sheave wheels, a pennant, and a
 * lamp under the platform. Stands on y = 0, about `h` to the wheel axle, front toward +Z.
 * anchors: lamp, wheels [2] (axle centres; the wheels here are static: spin a separate sheave() on a node if you want them turning)
 */
export function headframe({ h = 9, w = 3.6, color = SM.timberDark, color2 = SM.timber, iron = SM.iron, wheels = true, seed = 1 } = {}) {
  const parts = [], top = w * 0.32, leg = (sx, sz) => [[sx * w / 2, 0, sz * w / 2], [sx * top, h, sz * top * 0.9]];
  const beam = (a, b, t, c) => { const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l = Math.hypot(dx, dy, dz); return tint(place(roundedBox(t, l, t, t * 0.2, 1), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, Math.atan2(dz, dy) / DEG, 0, -Math.atan2(dx, Math.hypot(dy, dz)) / DEG), c); };
  const at = (sx, sz, t) => { const [a, b] = leg(sx, sz); return [a[0] + (b[0] - a[0]) * t, h * t, a[2] + (b[2] - a[2]) * t]; };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(beam(...leg(sx, sz), 0.3, color));
  const levels = [0.28, 0.56, 0.84];
  levels.forEach((t, k) => {
    for (const sz of [-1, 1]) parts.push(beam(at(-1, sz, t), at(1, sz, t), 0.2, color2));
    for (const sx of [-1, 1]) parts.push(beam(at(sx, -1, t), at(sx, 1, t), 0.2, color2));
    const t0 = k === 0 ? 0.02 : levels[k - 1];
    parts.push(beam(at(-1, 1, t0), at(1, 1, t), 0.14, color2), beam(at(1, 1, t0), at(-1, 1, t), 0.14, color2));
  });
  // the long back stay toward the engine house
  parts.push(beam([-w * 0.95, 0, -w * 0.9], [-top * 0.6, h * 0.92, -top * 0.5], 0.26, color), beam([w * 0.95, 0, -w * 0.9], [top * 0.6, h * 0.92, -top * 0.5], 0.26, color));
  parts.push(rb(top * 2 + 1.1, 0.18, top * 2 + 0.9, 0.04, 0, h + 0.05, 0, color2));
  for (const sx of [-1, 1]) parts.push(rb(0.12, 0.7, top * 2 + 0.9, 0.03, sx * (top + 0.5), h + 0.5, 0, color), rb(0.2, 1.3, 0.2, 0.04, sx * (top + 0.1), h + 0.7, 0, color));
  const wr = w * 0.3, ws = [[-wr * 0.55, h + 1.2, 0.18], [wr * 0.55, h + 1.2, -0.18]];
  if (wheels) for (const c of ws) parts.push(place(sheave({ r: wr, color: iron }), c[0], c[1], c[2]));
  parts.push(bx(0.06, 1.4, 0.06, 0, h + 2.3, 0, color), tint(place(extrude([[0, 0], [0.9, -0.2], [0, -0.44]], 0.02), 0.03, h + 3.0, 0), SM.rust));
  // cables down the shaft
  for (const sx of [-1, 1]) parts.push(cyl(0.02, 0.02, h + 1.2 - wr, 4, sx * 0.12, 0, 0.12, iron));
  // lamp under the platform
  parts.push(place(hangLamp({ drop: 0.8, r: 0.34, shade: SM.rust }), 0, h - 0.02, top * 0.9 + 0.2));
  const m = wonk(merge(parts), { lean: 0.012 * (seed % 2 ? 1 : -1), twist: 2 });
  return keep(m, { lamp: [0, h - 0.8, top * 0.9 + 0.2], wheels: ws, r: wr, top: [0, h + 3.0, 0] });
}

/** A spoked sheave wheel, axis along Z, centred. */
export function sheave({ r = 1, color = SM.iron, spokes = 6 } = {}) {
  const parts = [tint(place(torus(r, r * 0.1, 16, 5), 0, 0, 0, 90, 0, 0), color), tint(place(cylinder(r * 0.16, r * 0.16, r * 0.3, 8), 0, 0, -r * 0.15, 90, 0, 0), SM.rust)];
  for (let i = 0; i < spokes; i++) parts.push(bx(r * 0.09, r * 1.95, r * 0.07, 0, 0, 0, color, 0, 0, (i / spokes) * 180));
  return merge(parts);
}

/** A heap of raw salt: white, blue in its own shadow, a few crisp facets. On y = 0. */
export function saltHeap({ r = 1.2, h = 0.9, seed = 1, top = SM.salt, low = SM.saltShade } = {}) {
  const rr = R(seed), ph = rr() * 6;
  const m = deform(cylinder(r, r * 0.12, h, 9, { crease: 25 }), (p) => { const a = Math.atan2(p[2], p[0]), t = p[1] / h; const k = 1 + 0.14 * Math.sin(a * 3 + ph) * (1 - t) + 0.08 * Math.sin(a * 5 + ph * 2); p[0] *= k; p[2] *= k; p[1] *= 1 + 0.1 * Math.sin(a * 2 + ph); }, 25);
  return gradientY(m, low, top, 0, h * 0.7);
}

/**
 * A cluster of stillsalt: `n` tapered shards leaning out of one root, glowing. Root at the origin, growing toward +Y
 * (rotate the node for a wall). `s` is the tallest shard.
 */
export function crystals({ n = 5, s = 0.5, seed = 1, color = SM.still, deep = SM.stillDeep, glow = 0.9 } = {}) {
  const r = R(seed), parts = [];
  for (let i = 0; i < n; i++) {
    const hh = s * (0.45 + r() * 0.55) * (i === 0 ? 1.25 : 1), rad = hh * (0.13 + r() * 0.07), lean = i === 0 ? 4 : 14 + r() * 26, yaw = r() * 360;
    const sh = lathe([[0, 0], [rad * 0.8, 0], [rad, hh * 0.72], [0, hh]], 5, { crease: 20 });
    parts.push(place(gradientY(sh, deep, color, 0, hh * 0.8), 0, 0, 0, lean, yaw, 0));
  }
  return setGlow(merge(parts), glow);
}

/** Saltmere's lamp-house: a squat stone drum, a gallery, a brass-ribbed glass lantern with the cold lamp in it, a domed cap. anchors: lamp */
export function lampHouse({ h = 6, r = 1.4, stone = '#fff1d8', cap = SM.enamel, lit = true } = {}) {
  const parts = [tint(lathe([[0, 0], [r * 1.15, 0], [r * 1.1, h * 0.08], [r * 0.92, h * 0.12], [r * 0.8, h * 0.66], [r * 1.05, h * 0.7], [r * 1.05, h * 0.74], [0, h * 0.74]], 10, { crease: 45 }), stone)];
  parts.push(tint(place(torus(r * 1.02, 0.05 * r, 10, 4), 0, h * 0.8, 0), SM.iron));
  const g = place(cylinder(r * 0.62, r * 0.62, h * 0.18, 8), 0, h * 0.74, 0);
  parts.push(lit ? setGlow(tint(g, SM.still), 1) : tint(g, '#5a6cc0'));
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; parts.push(bx(0.07 * r, h * 0.18, 0.07 * r, Math.cos(a) * r * 0.64, h * 0.83, Math.sin(a) * r * 0.64, SM.brass)); }
  parts.push(tint(place(lathe([[r * 0.8, 0], [r * 0.7, h * 0.05], [r * 0.3, h * 0.12], [0.05 * r, h * 0.15], [0.05 * r, h * 0.22], [0, h * 0.22]], 10, { crease: 50 }), 0, h * 0.92, 0), cap));
  parts.push(bx(r * 0.36, h * 0.2, 0.06, 0, h * 0.1, r * 0.98, SM.timberDark));
  for (const y of [0.3, 0.5]) parts.push(setGlow(bx(r * 0.2, h * 0.07, 0.05, r * 0.2, h * y, r * 0.86, lit ? '#ffd070' : '#5a6cc0'), lit ? 0.9 : 0));
  return keep(merge(parts), { lamp: [0, h * 0.83, 0] });
}

/**
 * Saltmere seen from across the flats: a low island, a huddle of pale houses, the headframe, the lamp-house on its rock.
 * About `w` wide; sits on y = 0. One far mesh. anchors: lamp
 */
export function islandTown({ w = 60, h = 9, seed = 1, lit = 0, lampLit = true } = {}) {
  const r = R(seed), parts = [];
  const hump = blob({ rx: w / 2, ry: h, rz: w * 0.2, lumps: 0.4, seed, flatBottom: 0.9, seg: 22, rings: 9 });
  parts.push(gradientY(hump, '#e8b98a', '#fff0d8', 0, h * 0.6));
  const top = (x) => h * (0.86 - 0.5 * (x / (w / 2)) * (x / (w / 2)));
  for (let i = 0; i < 16; i++) {
    const x = -w * 0.34 + r() * w * 0.6, s = 1.6 + r() * 1.6, y = top(x) - 0.4 + r() * 0.5, z = w * 0.06 + r() * 2;
    parts.push(tint(place(roundedBox(s, s * 1.1, s, 0.15, 1), x, y + s * 0.5, z, 0, r() * 30, 0), i % 3 ? '#fff6e4' : '#ffe6cc'));
    parts.push(tint(place(cylinder(s * 0.84, 0, s * 0.8, 4), x, y + s * 1.05, z, 0, 45 + r() * 30, 0), [SM.rust, SM.enamel, '#5b7fe8', SM.mustard, SM.coral][i % 5]));
    if (lit > 0 && r() < lit) parts.push(setGlow(bx(s * 0.22, s * 0.3, 0.1, x, y + s * 0.6, z + s * 0.52, '#ffd070'), 0.95));
  }
  const hx = -w * 0.06;
  parts.push(place(scaleMesh(headframe({ h: 9, w: 3.6, seed: 2 }), 0.95), hx, top(hx) - 0.3, 0));
  const lx = w * 0.3, lh = lampHouse({ h: 7, r: 1.6, lit: lampLit });
  parts.push(place(rock3(4.4, 3), lx, top(lx) - 1.2, 0), place(lh, lx, top(lx) + 1.2, 0));
  return keep(merge(parts), { lamp: [lx, top(lx) + 1.2 + lh.anchors.lamp[1], 0], frame: [hx, top(hx) + 9, 0] });
}
const rock3 = (s, seed) => gradientY(scaleMesh(blob({ rx: 0.6, ry: 0.5, rz: 0.55, lumps: 0.9, seed, flatBottom: 0.5, seg: 9, rings: 6 }), s), '#e8b98a', '#fff0d8');

// ------------------------------------------------------------------------------------ underground

/**
 * The inside of a rock gallery (lump > 0) or a barrel vault (lump 0): an arch `w` wide and `h` high running from z = 0
 * back to z = -len, faceted, facing inward, open at both ends. `rib` > 0 pinches a rib every `rib` metres (vault).
 * colors: [floor-side, mid, crown]; `bands` paints strata in crisp steps.
 */
export function cave({ w = 8, h = 4.5, len = 12, seg = 12, rings = 10, seed = 1, lump = 0.5, flat = 0.7, colors = [SM.rock3, SM.rock2, SM.rock], bands = 5, wallDrop = 0, narrow = 0 } = {}) {
  const r = R(seed), pos = [], idx = [], col = [], hw = w / 2;
  const c = colors.map((x) => rgb(x));
  const noise = []; for (let i = 0; i < (seg + 1) * (rings + 1); i++) noise.push(r());
  for (let j = 0; j <= rings; j++) {
    const z = -len * j / rings, squeeze = 1 - narrow * (j / rings);
    for (let i = 0; i <= seg; i++) {
      const t = i / seg, a = Math.PI * (1 - t), nz = noise[j * (seg + 1) + i] - 0.5, edge = Math.sin(a);
      const k = 1 + lump * 0.3 * nz, sy = Math.pow(Math.max(0, edge), flat);
      const x = Math.cos(a) * hw * squeeze * k, y = sy * h * (1 + lump * 0.22 * (noise[(j * 7 + i * 3) % noise.length] - 0.5)) - (edge < 0.02 ? wallDrop : 0);
      pos.push(x, y, z + lump * nz * (len / rings) * 0.5);
      const u = Math.min(0.999, Math.max(0, sy + lump * 0.3 * nz)), band = Math.floor(u * bands) / Math.max(1, bands - 1), q = Math.min(1, band) * (c.length - 1), q0 = Math.floor(q), q1 = Math.min(c.length - 1, q0 + 1), f = q - q0;
      col.push(c[q0][0] + (c[q1][0] - c[q0][0]) * f, c[q0][1] + (c[q1][1] - c[q0][1]) * f, c[q0][2] + (c[q1][2] - c[q0][2]) * f);
    }
  }
  const s = seg + 1;
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) { const a = j * s + i, b = a + 1, d = a + s, e = d + 1; if ((i + j) % 2) idx.push(a, b, d, b, e, d); else idx.push(a, b, e, a, e, d); }
  const m = fromArrays(pos, idx, null, lump > 0 ? 24 : 50);
  // colour by the (pre-split) vertex it came from: fromArrays may split vertices at creases, so paint by position lookup
  const key = (x, y, z) => Math.round(x * 50) + ':' + Math.round(y * 50) + ':' + Math.round(z * 50), map = new Map();
  for (let i = 0; i < pos.length / 3; i++) map.set(key(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]), i);
  const P = m.positions, C = m.colors;
  for (let i = 0; i < P.length / 3; i++) { const k = map.get(key(P[i * 3], P[i * 3 + 1], P[i * 3 + 2])); if (k != null) { C[i * 3] = col[k * 3]; C[i * 3 + 1] = col[k * 3 + 1]; C[i * 3 + 2] = col[k * 3 + 2]; } }
  return m;
}

/** A timber set holding a gallery roof: two leaning posts, a fat cap beam, wedges. `w` between posts, `h` under the cap. Centred on X, on y = 0. anchors: hook (under the cap, centre) */
export function timberSet({ w = 5, h = 3.4, t = 0.34, seed = 1, color = SM.timber, dark = SM.timberDark } = {}) {
  const r = R(seed), parts = [], lean = 5 + r() * 3;
  for (const sx of [-1, 1]) {
    parts.push(tint(place(lathe([[0, 0], [t * 0.6, 0], [t * 0.5, h * 0.5], [t * 0.56, h], [0, h]], 7, { crease: 50 }), sx * (w / 2 + 0.1), 0, 0, 0, r() * 90, sx * lean), sx < 0 ? color : shade(color, 0.92)));
    parts.push(rb(t * 0.9, 0.1, t * 0.9, 0.02, sx * (w / 2 - 0.12), h + 0.02, 0, dark, 0, 0, sx * 8));
  }
  parts.push(tint(place(roundedBox(w + 1.1, t * 1.1, t * 1.15, 0.06, 1), 0, h + t * 0.6, 0, 0, 0, (r() - 0.5) * 3), dark));
  for (const sx of [-1, 1]) parts.push(rb(Math.hypot(0.9, 0.9), 0.14, 0.14, 0.03, sx * (w / 2 - 0.45), h - 0.42, 0, color, 0, 0, sx * 45));
  parts.push(tint(place(torus(0.06, 0.016, 6, 4), 0, h - 0.04, 0, 0, 0, 90), SM.iron));
  return keep(merge(parts), { hook: [0, h - 0.1, 0] });
}

/** A tub on four wheels, empty or holding a little salt. Runs along X, centred, on the rail tops at y = 0.1. */
export function oreCart({ color = SM.rust, load = 0, seed = 1 } = {}) {
  const parts = [];
  parts.push(tint(place(extrude([[-0.62, 0.3], [0.62, 0.3], [0.76, 0.95], [-0.76, 0.95]], 0.8, { bevel: 0.03, crease: 40 }), 0, 0, 0), color));
  parts.push(setOutline(bx(1.4, 0.03, 0.72, 0, 0.94, 0, '#3a2a6e'), 0));
  for (const y of [0.42, 0.86]) parts.push(rb(1.5, 0.07, 0.86, 0.02, 0, y, 0, SM.iron));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(tint(place(cylinder(0.17, 0.17, 0.07, 8), sx * 0.42, 0.27, sz * 0.36 - 0.035, 90, 0, 0), SM.iron));
  parts.push(rb(1.2, 0.1, 0.5, 0.02, 0, 0.26, 0, SM.iron));
  if (load > 0) parts.push(place(saltHeap({ r: 0.55, h: 0.3 * load, seed }), 0, 0.9, 0));
  return wonk(merge(parts), { lean: 0.03 });
}

/** A length of narrow track along X: two rails on sleepers, centred, on y = 0. */
export function rails({ len = 8, gauge = 0.72, seed = 1 } = {}) {
  const r = R(seed), parts = [], n = Math.round(len / 0.7);
  for (let i = 0; i < n; i++) parts.push(rb(0.2, 0.06, gauge + 0.4, 0.015, -len / 2 + (len * (i + 0.5)) / n, 0.03, 0, i % 2 ? SM.timberDark : SM.timber, 0, (r() - 0.5) * 8, 0));
  for (const sz of [-1, 1]) parts.push(bx(len, 0.06, 0.06, 0, 0.09, sz * gauge / 2, SM.ironBlue));
  return merge(parts);
}

/** The pit cage: an iron frame with a lattice gate, a bonnet, a chain to the rope. Stands on y = 0, door toward +X. anchors: top, lamp */
export function cage({ w = 1.5, h = 2.3, color = SM.rust, iron = SM.iron } = {}) {
  const parts = [], hw = w / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(rb(0.1, h, 0.1, 0.02, sx * hw, h / 2, sz * hw, color));
  parts.push(rb(w + 0.16, 0.1, w + 0.16, 0.03, 0, 0.05, 0, iron), tint(place(cylinder(w * 0.8, w * 0.2, 0.34, 4), 0, h, 0, 0, 45, 0), color));
  for (const y of [h * 0.5, h - 0.05]) for (const s of [-1, 1]) parts.push(rb(w, 0.07, 0.07, 0.02, 0, y, s * hw, color), rb(0.07, 0.07, w, 0.02, -hw, y, 0, color));
  // lattice on the back and far side
  for (let i = -2; i <= 2; i++) parts.push(bx(0.03, h * 0.5, 0.03, i * w * 0.2, h * 0.25, -hw, iron, 0, 0, 0), bx(0.03, h * 0.5, 0.03, -hw, h * 0.25, i * w * 0.2, iron));
  for (let i = 0; i < 4; i++) parts.push(bx(0.03, Math.hypot(w * 0.5, h * 0.5), 0.03, hw, h * 0.25, -hw + w * (i + 0.5) / 4, iron, (i % 2 ? 1 : -1) * 26, 0, 0));
  parts.push(cyl(0.03, 0.03, 9, 5, 0, h + 0.3, 0, iron), tint(place(torus(0.09, 0.025, 8, 4), 0, h + 0.36, 0, 90, 0, 0), iron));
  parts.push(setGlow(tint(place(sphere(0.08, 6, 4), 0, h - 0.2, 0), '#ffe9a8'), 1));
  return keep(merge(parts), { top: [0, h + 0.3, 0], lamp: [0, h - 0.2, 0] });
}

/** A pick leaning on its head. Origin at the foot of the haft. */
export function pick({ len = 1.0 } = {}) {
  return merge(tint(place(cylinder(0.025, 0.03, len, 5), 0, 0, 0, 0, 0, 16), SM.timber), tint(place(tube(curve([[-0.3, -0.06, 0], [0, 0.03, 0], [0.3, -0.06, 0]], 6), (t) => 0.012 + 0.03 * Math.sin(t * Math.PI), 4, { squash: 0.7 }), -len * Math.sin(16 * DEG), len * Math.cos(16 * DEG), 0, 0, 0, 16), SM.iron));
}

// ------------------------------------------------------------------------------------ the records vault

/**
 * A cabinet of deed drawers, `cols` x `rows`, each with a brass pull and a card. `letters` (a string, one per lettered
 * drawer) are painted big on drawers along the middle row, left to right; those drawers stand a little open.
 * Faces +Z, on y = 0. anchors: drawers [[x, y, z] per lettered drawer]
 */
export function drawerBank({ cols = 4, rows = 4, w = 3.2, h = 2.2, d = 0.6, color = SM.enamelDark, face = SM.enamel, letters = '', brass = SM.brass, seed = 1 } = {}) {
  const r = R(seed), parts = [rb(w, h, d, 0.04, 0, h / 2 + 0.1, 0, color)], dw = (w - 0.14) / cols, dh = (h - 0.14) / rows, drawers = [];
  parts.push(rb(w + 0.16, 0.12, d + 0.12, 0.03, 0, h + 0.14, 0, SM.timberDark), rb(w + 0.1, 0.1, d + 0.08, 0.02, 0, 0.05, 0, SM.timberDark));
  const row = Math.floor(rows / 2);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = -w / 2 + 0.07 + dw * (i + 0.5), y = 0.17 + dh * (j + 0.5), ch = j === row ? letters[i] : null, out = ch ? 0.12 + r() * 0.08 : (r() < 0.12 ? 0.06 : 0);
    parts.push(rb(dw - 0.07, dh - 0.07, 0.06 + out, 0.02, x, y, d / 2 + out / 2, ch ? '#ffd9a0' : (i + j) % 2 ? face : shade(face, 1.1)));
    parts.push(tint(place(torus(0.05, 0.014, 6, 4), x, y - dh * 0.24, d / 2 + out + 0.04, 0, 0, 0), brass));
    if (ch) { parts.push(place(pixelText(ch, { s: dh * 0.42, color: SM.wine, glow: 0.1 }), x, y + dh * 0.06, d / 2 + out + 0.034)); drawers.push([x, y, d / 2 + out]); }
    else parts.push(setOutline(bx(dw * 0.4, dh * 0.2, 0.006, x, y + dh * 0.12, d / 2 + out + 0.032, SM.paper), 0));
  }
  return keep(wonk(merge(parts), { lean: 0.012 }), { drawers, top: [0, h + 0.2, 0] });
}

/** A sloped reading stand on one fat leg, a brass lip to hold a book. Faces +Z (the reader stands at +Z). anchors: top (centre of the slope), tilt (degrees) */
export function lectern({ h = 1.0, w = 0.9, color = SM.timberRed, dark = SM.timberDark } = {}) {
  const parts = [tint(lathe([[0, 0], [0.3, 0], [0.26, 0.08], [0.09, 0.14], [0.07, h - 0.2], [0.14, h - 0.12], [0, h - 0.12]], 8, { crease: 50 }), dark)];
  parts.push(rb(w, 0.07, 0.66, 0.02, 0, h, 0, color, 22, 0, 0), rb(w, 0.06, 0.05, 0.015, 0, h - 0.1, 0.3, SM.brass, 22, 0, 0));
  return keep(merge(parts), { top: [0, h + 0.05, 0], tilt: 22 });
}

/** The night clerk, asleep on a tipped-back chair by the door: a chair, a slumped figure with his cap over his eyes, feet on a keg. Faces +Z. anchors: head (for a snore), candle */
export function sleeper({ coat = SM.royal, seed = 1 } = {}) {
  const parts = [];
  // chair
  parts.push(rb(0.5, 0.06, 0.5, 0.02, 0, 0.45, 0, SM.timber, -12, 0, 0));
  for (const sx of [-1, 1]) parts.push(rb(0.06, 0.5, 0.06, 0.015, sx * 0.21, 0.22, 0.2, SM.timberDark, -12, 0, 0), rb(0.06, 1.1, 0.06, 0.015, sx * 0.21, 0.5, -0.26, SM.timberDark, -12, 0, 0));
  parts.push(rb(0.5, 0.3, 0.05, 0.015, 0, 0.92, -0.36, SM.timber, -12, 0, 0));
  // the clerk: a coat slumped back, head on the chest, cap over the eyes, crossed arms
  parts.push(tint(place(lathe([[0, 0], [0.22, 0], [0.25, 0.1], [0.2, 0.4], [0.13, 0.54], [0, 0.58]], 7, { crease: 180 }), 0, 0.46, -0.04, -20, 0, 0), coat));
  parts.push(tint(place(sphere(0.19, 8, 5), 0, 1.06, -0.2, 0, 0, 8), '#ffdcb8'), tint(place(cylinder(0.2, 0.16, 0.1, 7), 0, 1.13, -0.13, 34, 0, 8), SM.rust), tint(place(box(0.3, 0.02, 0.16), 0, 1.1, 0.0, 34, 0, 8), SM.rust));
  parts.push(tint(place(ellipsoid(0.3, 0.07, 0.08, 6, 4), 0, 0.78, 0.1, 0, 0, 6), shade(coat, 0.85)));
  // legs out to a keg
  for (const sx of [-1, 1]) parts.push(tint(place(cylinder(0.06, 0.07, 0.7, 5), sx * 0.1, 0.5, 0.2, 76, sx * 4, 0), SM.iron), tint(place(ellipsoid(0.07, 0.07, 0.13, 5, 3), sx * 0.1, 0.72, 0.9), '#5a3a46'));
  parts.push(place(keg({ r: 0.22, h: 0.56 }), 0, 0, 0.86));
  return keep(merge(parts), { head: [0.05, 1.3, -0.1], candle: [0.5, 0, 0.3] });
}

/** A powder keg: fat staves, rope hoops, a painted warning band. On y = 0. */
export function keg({ r = 0.26, h = 0.62, color = SM.timber, band = SM.rust } = {}) {
  const m = tint(lathe([[0, 0], [r * 0.82, 0], [r, h * 0.3], [r, h * 0.7], [r * 0.82, h], [0, h]], 9, { crease: 40 }), color);
  return merge(m, tint(place(torus(r * 0.95, 0.025, 9, 4), 0, h * 0.2, 0), PAL.rope), tint(place(torus(r * 0.95, 0.025, 9, 4), 0, h * 0.8, 0), PAL.rope), tint(place(cylinder(r * 1.01, r * 1.01, h * 0.16, 9, { caps: false }), 0, h * 0.42, 0), band));
}

/** A storm lamp with a wire handle: brass base, glass, cap. Stands on y = 0. anchors: lamp */
export function handLamp({ s = 1, metal = SM.brass, glass = '#ffe9a0' } = {}) {
  const parts = [tint(lathe([[0, 0], [0.09, 0], [0.1, 0.03], [0.07, 0.06], [0, 0.06]], 8, { crease: 50 }), metal)];
  parts.push(setGlow(tint(place(lathe([[0, 0], [0.06, 0], [0.085, 0.07], [0.06, 0.16], [0, 0.16]], 8, { crease: 180 }), 0, 0.06, 0), glass), 1));
  parts.push(tint(place(lathe([[0.065, 0], [0.07, 0.02], [0.03, 0.06], [0.03, 0.09], [0, 0.09]], 8, { crease: 50 }), 0, 0.22, 0), metal), tint(place(torus(0.08, 0.008, 8, 3), 0, 0.3, 0, 90, 0, 0), metal));
  return keep(scaleMesh(merge(parts), s), { lamp: [0, 0.14 * s, 0] });
}

// ------------------------------------------------------------------------------------ the court

/**
 * The circuit bench: a dais of two steps, a long high panelled desk with a brass rail, a tall chair, the magistrate
 * behind it (robe, white bands, a square cap), a water jug, a gavel block, papers. Faces +Z, centred, on y = 0.
 * anchors: top (desk top centre), seat (the magistrate's head), gavel
 */
export function judgeBench({ w = 4.6, h = 1.35, color = SM.timberRed, panel = SM.wine, trim = SM.brass, robe = SM.plum, steps = 2 } = {}) {
  const parts = [], rise = 0.2, top = steps * rise;
  for (let k = 0; k < steps; k++) { const g = (steps - 1 - k) * 0.4; parts.push(rb(w + 1.4 + g * 2, rise, 2.3 + g * 2, 0.03, 0, rise * (k + 0.5), -0.5, k % 2 ? '#ffe6c4' : '#fff0d8'), bx(w + 1.42 + g * 2, rise * 0.3, 2.32 + g * 2, 0, rise * (k + 0.62), -0.5, SM.wine)); }
  parts.push(rb(w, h, 0.5, 0.04, 0, top + h / 2, 0, color), rb(w + 0.24, 0.1, 0.72, 0.03, 0, top + h + 0.04, -0.04, shade(color, 0.8)));
  const n = 5, pw = (w - 0.3) / n;
  for (let i = 0; i < n; i++) parts.push(rb(pw - 0.14, h - 0.4, 0.05, 0.02, -w / 2 + 0.15 + pw * (i + 0.5), top + h / 2, 0.26, i === 2 ? trim : panel));
  parts.push(tint(place(torus(0.28, 0.06, 12, 4), 0, top + h / 2, 0.3, 90, 0, 0), SM.wine), bx(0.06, 0.5, 0.03, 0, top + h / 2, 0.31, SM.wine));
  parts.push(tint(place(cylinder(0.025, 0.025, w - 0.2, 5), -w / 2 + 0.1, top + h + 0.2, 0.26, 0, 0, -90), trim));
  for (let i = 0; i <= 4; i++) parts.push(cyl(0.02, 0.02, 0.14, 4, -w / 2 + 0.1 + (w - 0.2) * i / 4, top + h + 0.08, 0.26, trim));
  // chair and magistrate
  const sy = top;
  parts.push(rb(0.9, 2.3, 0.14, 0.05, 0, sy + 1.15, -0.95, SM.wine), rb(1.0, 0.16, 0.2, 0.05, 0, sy + 2.36, -0.95, trim), tint(place(sphere(0.1, 6, 4), -0.45, sy + 2.5, -0.95), trim), tint(place(sphere(0.1, 6, 4), 0.45, sy + 2.5, -0.95), trim));
  parts.push(tint(place(lathe([[0, 0], [0.34, 0], [0.36, 0.2], [0.28, 0.7], [0.17, 0.92], [0, 0.96]], 8, { crease: 180 }), 0, sy + 0.62, -0.6), robe));
  parts.push(tint(place(sphere(0.25, 9, 6), 0, sy + 1.82, -0.58), '#ffdcb8'), tint(place(box(0.5, 0.1, 0.5), 0, sy + 2.07, -0.6, 0, 20, 4), '#2a2140'), tint(place(sphere(0.27, 8, 5), 0, sy + 1.86, -0.64, 0, 0, 0, 1, 0.9, 0.95), '#f4f0ff'));
  for (const sx of [-1, 1]) parts.push(bx(0.09, 0.2, 0.03, sx * 0.06, sy + 1.5, -0.36, SM.salt, 0, 0, sx * 6), setOutline(bx(0.05, 0.07, 0.02, sx * 0.1, sy + 1.84, -0.345, '#2a2140'), 0));
  // on the desk
  const ty = top + h + 0.09;
  parts.push(rb(0.3, 0.1, 0.2, 0.03, 0.7, ty + 0.05, -0.05, SM.timberDark), tint(place(cylinder(0.05, 0.05, 0.26, 6), 0.56, ty + 0.14, -0.05, 0, 0, 90), SM.timber), tint(place(cylinder(0.02, 0.02, 0.3, 4), 0.72, ty + 0.12, -0.02, 70, 0, 0), SM.timber));
  parts.push(tint(place(lathe([[0, 0], [0.09, 0], [0.12, 0.12], [0.06, 0.24], [0.08, 0.3], [0, 0.3]], 8, { crease: 50 }), -0.9, ty, -0.05), '#bfe8ff'));
  for (let i = 0; i < 3; i++) parts.push(bx(0.34, 0.012, 0.44, -0.25 + i * 0.05, ty + 0.01 + i * 0.012, 0, i % 2 ? SM.paper : '#ffe6b0', 0, i * 9 - 8, 0));
  return keep(merge(parts), { top: [0, ty, 0], seat: [0, sy + 1.82, -0.58], gavel: [0.7, ty + 0.1, -0.05], dais: top });
}

/**
 * The roll of those the pit kept: a tall dark board under a carved crest (crossed picks, a lamp), `cols` columns of small
 * brass plates, the newest still bright, a shelf below for lamps. Faces +Z; origin bottom centre.
 */
export function rollBoard({ w = 3.6, h = 3.4, cols = 4, rows = 13, seed = 1, board = '#3a2f8e', frame = SM.timberDark, plate = SM.brass } = {}) {
  const r = R(seed), parts = [rb(w + 0.3, h + 0.3, 0.12, 0.04, 0, h / 2, -0.06, frame), setOutline(bx(w, h, 0.02, 0, h / 2, 0.012, board), 0)];
  // crest
  parts.push(tint(place(extrude([...archPts(0, 0, w / 2 + 0.15, 0.9, 10)], 0.14, { crease: 30 }), 0, h + 0.1, -0.05), frame));
  parts.push(tint(place(extrude([...archPts(0, 0, w / 2 - 0.1, 0.68, 10)], 0.05, { crease: 30 }), 0, h + 0.12, 0.03), SM.wine));
  for (const s of [-1, 1]) parts.push(bx(0.07, 0.8, 0.03, 0, h + 0.4, 0.07, SM.salt, 0, 0, s * 52));
  parts.push(setGlow(tint(place(sphere(0.12, 7, 5), 0, h + 0.42, 0.09), '#ffd24a'), 0.7));
  const cw = (w - 0.3) / cols, rh = (h - 0.5) / rows;
  for (let c = 0; c < cols; c++) for (let k = 0; k < rows; k++) {
    if (c === cols - 1 && k > rows * 0.62) continue; // the last column is not full yet
    const fresh = c === cols - 1 && k > rows * 0.4, x = -w / 2 + 0.15 + cw * (c + 0.5), y = h - 0.3 - rh * (k + 0.5);
    parts.push(setOutline(setGlow(tint(place(quad(cw * (0.62 + r() * 0.22), rh * 0.56), x, y, 0.026, 0, 0, (r() - 0.5) * 2), fresh ? '#fff0a8' : r() < 0.3 ? SM.brassDark : plate), fresh ? 0.45 : 0.18), 0));
  }
  parts.push(rb(w + 0.5, 0.08, 0.34, 0.02, 0, -0.04, 0.12, frame));
  return keep(merge(parts), { top: [0, h + 0.9, 0], shelf: [0, 0, 0.14] });
}

/** A party's table: plain, a cloth runner, papers, an inkstand. Faces +Z, top at y = h. anchors: top */
export function courtTable({ w = 1.8, d = 0.8, h = 0.66, color = SM.timber, cloth = SM.royal, seed = 1 } = {}) {
  const r = R(seed), parts = [rb(w, 0.08, d, 0.025, 0, h - 0.04, 0, color)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(rb(0.09, h - 0.08, 0.09, 0.02, sx * (w / 2 - 0.12), (h - 0.08) / 2, sz * (d / 2 - 0.1), SM.timberDark, 0, 0, sx * 3));
  parts.push(bx(w * 0.42, 0.012, d + 0.24, 0, h + 0.006, 0, cloth), bx(w * 0.42, 0.24, 0.012, 0, h - 0.11, d / 2 + 0.006, cloth));
  for (let i = 0; i < 4; i++) parts.push(bx(0.26, 0.012, 0.34, -w * 0.3 + r() * w * 0.6, h + 0.014 + i * 0.012, (r() - 0.5) * 0.2, i % 2 ? SM.paper : '#ffe9b8', 0, r() * 50 - 25, 0));
  parts.push(tint(place(lathe([[0, 0], [0.06, 0], [0.07, 0.07], [0.035, 0.09], [0, 0.09]], 7, { crease: 50 }), w * 0.36, h, -d * 0.2), '#2a3a8a'));
  return keep(wonk(merge(parts), { lean: 0.02 }), { top: [0, h + 0.03, 0] });
}

/** Posts with a sagging rope between them, `len` along X, centred, on y = 0. */
export function ropeRail({ len = 4, h = 0.8, bay = 1.3, post = SM.timberDark, rope = SM.wine } = {}) {
  const n = Math.max(1, Math.round(len / bay)), parts = [];
  for (let i = 0; i <= n; i++) { const x = -len / 2 + (len * i) / n; parts.push(tint(place(lathe([[0, 0], [0.11, 0], [0.05, 0.08], [0.045, h - 0.08], [0.08, h - 0.04], [0.05, h], [0, h]], 6, { crease: 50 }), x, 0, 0), post), tint(place(sphere(0.07, 6, 4), x, h + 0.04, 0), SM.brass)); }
  for (let i = 0; i < n; i++) { const x0 = -len / 2 + (len * i) / n, x1 = x0 + len / n; parts.push(tint(tube(curve([[x0, h - 0.08, 0], [(x0 + x1) / 2, h - 0.3, 0], [x1, h - 0.08, 0]], 6), 0.035, 5), rope)); }
  return merge(parts);
}

/** A rail of miners' lamps on hooks, `n` of them, `lit` of which (from the left) burn. Faces +Z; origin: middle of the rail. anchors: lamps */
export function lampRack({ n = 6, len = 2.4, lit = 0, color = SM.brass } = {}) {
  const parts = [rb(len, 0.1, 0.06, 0.02, 0, 0, 0, SM.timberDark)], lamps = [];
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + (len * (i + 0.5)) / n, on = i < lit;
    parts.push(cyl(0.008, 0.008, 0.14, 3, x, -0.16, 0.06, SM.iron), tint(place(cylinder(0.05, 0.06, 0.05, 6), x, -0.4, 0.06), color), tint(place(cylinder(0.035, 0.05, 0.05, 6), x, -0.2, 0.06), color));
    const g = tint(place(cylinder(0.045, 0.045, 0.15, 6), x, -0.35, 0.06), on ? '#ffe9a0' : '#9fb0f0'); parts.push(on ? setGlow(g, 1) : g);
    lamps.push([x, -0.3, 0.06]);
  }
  return keep(merge(parts), { lamps });
}

// ------------------------------------------------------------------------------------ the shore and the flats

/** A driftwood fire laid in a ring of stones: bleached logs leaning into each other, charred at the heart, coals glowing. On y = 0. anchors: fire */
export function driftFire({ r = 0.5, seed = 1, stones = 9 } = {}) {
  const rr = R(seed), parts = [];
  for (let i = 0; i < stones; i++) { const a = (i / stones) * Math.PI * 2 + rr() * 0.3, s = 0.11 + rr() * 0.07; parts.push(tint(place(blob({ rx: s, ry: s * 0.7, rz: s * 0.9, lumps: 0.5, seed: i + 2, flatBottom: 0.4, seg: 6, rings: 4 }), Math.cos(a) * r, 0, Math.sin(a) * r, 0, rr() * 180, 0), i % 3 ? '#c9c2e6' : '#a9a3d0')); }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rr() * 0.4, len = r * (1.3 + rr() * 0.5);
    const log = gradientY(cylinder(0.055, 0.035, len, 5), '#4a3050', '#f2e0c0', 0, len * 0.5);
    parts.push(place(place(log, 0, 0, 0, 0, 0, 52), Math.cos(a) * r * 0.62, 0.02, Math.sin(a) * r * 0.62, 0, -a / DEG + 180, 0));
  }
  parts.push(setGlow(tint(place(blob({ rx: r * 0.5, ry: 0.07, rz: r * 0.5, lumps: 0.7, seed: 5, seg: 7, rings: 4 }), 0, 0.04, 0), '#ff8a30'), 1));
  return keep(merge(parts), { fire: [0, 0.1, 0] });
}

/** A tuft of dune grass: a fan of thin blades. On y = 0, about `s` tall. */
export function duneGrass({ s = 0.7, n = 9, seed = 1, color = '#3aa07a', tip = '#8fe4a0' } = {}) {
  const r = R(seed), parts = [];
  for (let i = 0; i < n; i++) { const hh = s * (0.5 + r() * 0.5); parts.push(place(gradientY(lathe([[0, 0], [0.028, 0], [0.018, hh * 0.6], [0, hh]], 3, { crease: 180 }), color, tip, 0, hh), (r() - 0.5) * 0.2, 0, (r() - 0.5) * 0.2, (r() - 0.5) * 50, r() * 360, (r() - 0.5) * 50)); }
  return setOutline(merge(parts), 0.5);
}

/** A low sea wall of fat stones, `len` along X, centred, on y = 0, with a coping. */
export function seaWall({ len = 12, h = 0.9, d = 0.6, seed = 1, colors = ['#f2dcae', '#e8cfa0', '#ffe9c0'] } = {}) {
  const r = R(seed), parts = [], rows = 3, rh = (h - 0.12) / rows;
  for (let j = 0; j < rows; j++) { let x = -len / 2 - (j % 2 ? 0.3 : 0); while (x < len / 2) { const bw = 0.6 + r() * 0.5; parts.push(rb(bw - 0.03, rh - 0.02, d, 0.05, x + bw / 2, rh * (j + 0.5), 0, colors[Math.floor(r() * colors.length)], 0, (r() - 0.5) * 3, 0)); x += bw; } }
  parts.push(rb(len + 0.3, 0.14, d + 0.16, 0.04, 0, h - 0.05, 0, '#fff0d0'));
  return merge(parts);
}

/**
 * A torn drift net pegged along a wall or between stakes: `len` along X, hanging from y = h in a slack curve, a ragged
 * hole of width `hole` in the middle (0..1 of the length: mended as it shrinks), cork floats along the head rope.
 * Faces +Z. anchors: ends [2], hole [x, y, z]
 */
export function driftNet({ len = 9, h = 1.5, hole = 0.3, seed = 1, color = '#3f78e0', floats = '#ff7a5a' } = {}) {
  const r = R(seed), parts = [], n = Math.round(len / 0.34), top = (x) => h - 0.22 * Math.sin(((x + len / 2) / len) * Math.PI * 3) * 0.5 - 0.1;
  parts.push(tint(tube(curve(Array.from({ length: 9 }, (_, i) => { const x = -len / 2 + (len * i) / 8; return [x, top(x), 0]; }), 24), 0.03, 5), PAL.rope));
  for (let i = 0; i <= n; i++) {
    const x = -len / 2 + (len * i) / n, inHole = Math.abs(x) < (len * hole) / 2, ragged = inHole ? 0.2 + r() * 0.3 : 1;
    for (const s of [-1, 1]) { const hh = (top(x) - 0.08) * ragged; if (hh > 0.1) parts.push(setOutline(tint(place(box(0.022, hh * 1.12, 0.012), x + s * hh * 0.24, top(x) - hh / 2, 0.01 * s, 0, 0, s * 26), color), 0.6)); }
    if (i % 3 === 0) parts.push(tint(place(ellipsoid(0.07, 0.05, 0.05, 6, 4), x, top(x), 0), floats));
  }
  for (const sx of [-1, 0, 1]) parts.push(tint(place(lathe([[0, 0], [0.06, 0], [0.045, h + 0.25], [0, h + 0.3]], 5, { crease: 50 }), sx * (len / 2), 0, -0.08, 0, 0, sx * -3), SM.timberDark));
  return keep(merge(parts), { ends: [[-len / 2 + 0.3, 0, 0.5], [len / 2 - 0.3, 0, 0.5]], hole: [0, h * 0.5, 0] });
}

/** A fish-drying rack: two A-frames and three poles hung with split fish or kelp. `len` along X, on y = 0. */
export function dryingRack({ len = 2.6, h = 1.7, seed = 1, hung = '#ffb86a' } = {}) {
  const r = R(seed), parts = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(tint(place(cylinder(0.04, 0.05, h + 0.2, 5), sx * len / 2, 0, sz * 0.4, sz * -14, 0, 0), SM.timberDark));
  for (const [y, z] of [[h, 0], [h * 0.66, 0.14], [h * 0.66, -0.14]]) { parts.push(tint(place(cylinder(0.03, 0.03, len + 0.3, 5), -len / 2 - 0.15, y, z, 0, 0, -90), SM.timber)); for (let i = 0; i < 6; i++) if (r() < 0.8) parts.push(tint(place(ellipsoid(0.06, 0.17, 0.02, 5, 3), -len / 2 + 0.2 + (len - 0.4) * i / 5, y - 0.2, z, 0, 0, (r() - 0.5) * 14), i % 2 ? hung : shade(hung, 0.86))); }
  return merge(parts);
}

/** A tide marker: a leaning pole banded red and white with a cross arm and a lantern cage on top. On y = 0. anchors: top */
export function tideMarker({ h = 3.2, seed = 1, band = SM.rust, lit = false } = {}) {
  const r = R(seed), parts = [], n = 5;
  for (let i = 0; i < n; i++) parts.push(cyl(0.085 - i * 0.006, 0.08 - i * 0.006, h / n, 6, 0, (h / n) * i, 0, i % 2 ? SM.salt : band));
  parts.push(rb(0.9, 0.08, 0.06, 0.02, 0, h * 0.78, 0, SM.timberDark, 0, 0, (r() - 0.5) * 14), tint(place(cylinder(0.14, 0.02, 0.16, 5), 0, h + 0.14, 0), SM.iron));
  const g = tint(place(cylinder(0.09, 0.09, 0.14, 5), 0, h, 0), lit ? '#ffe9a0' : '#d6e4ff'); parts.push(lit ? setGlow(g, 1) : g);
  // weed at the foot
  parts.push(tint(place(blob({ rx: 0.24, ry: 0.1, rz: 0.2, lumps: 0.7, seed: seed + 2, flatBottom: 0.5, seg: 6, rings: 4 }), 0, 0, 0), '#2fae8c'));
  return keep(wonk(merge(parts), { lean: (r() - 0.5) * 0.12, leanZ: (r() - 0.5) * 0.08 }), { top: [0, h + 0.07, 0] });
}

/**
 * A raised salt road: a white ribbon with crisp edges and a darker wet foot, following `path` ([[x, z], ...], resampled),
 * `w` wide at its start and `w1` at its end (so it can narrow into the distance). Top at y = 0, the foot `drop` below.
 */
export function saltRoad({ path, w = 5, w1 = null, drop = 0.5, n = 28, top = SM.salt, edge = '#e8dcff', foot = '#b9a8e8' } = {}) {
  const pts = curve(path.map((p) => [p[0], 0, p[1]]), n), pos = [], idx = [], col = [], ct = rgb(top), ce = rgb(edge), cf = rgb(foot);
  for (let i = 0; i <= n; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n, i + 1)]; let dx = b[0] - a[0], dz = b[2] - a[2]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const hw = (w + ((w1 ?? w) - w) * (i / n)) / 2, nx = dz, nz = -dx;
    for (const [k, y, c] of [[-1.25, -drop, cf], [-1, 0, ce], [-0.86, 0.012, ct], [0.86, 0.012, ct], [1, 0, ce], [1.25, -drop, cf]]) { pos.push(p[0] + nx * hw * k, y, p[2] + nz * hw * k); col.push(c[0], c[1], c[2]); }
  }
  for (let i = 0; i < n; i++) for (let k = 0; k < 5; k++) { const a = i * 6 + k, b = a + 1, c = a + 6, d = c + 1; idx.push(a, c, b, b, c, d); }
  const m = fromArrays(pos, idx, null, 180);
  // which way is up depends on the path's handedness: flip if the top faces down
  if (m.normals[2 * 3 + 1] < 0) { const I = m.indices; for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; } for (let i = 0; i < m.normals.length; i++) { m.normals[i] = -m.normals[i]; m.onormals[i] = -m.onormals[i]; } }
  m.colors.set(col);
  return m;
}

// ------------------------------------------------------------------------------------ the shell every set shares

/**
 * Everything a chapter 2 set returns that is the same for every set.
 *   spec: { id, light, L (needs .power), scene, cameras, marks, actors, foreground,
 *           lamps  [{ name, pos, color, radius, base, flicker? }]     -> env.points (at most 6)
 *           glows  [{ sprite, base, fixed? (ignores power), flick? (0..1: follows flame flicker) }]
 *           flames [{ node, s (base scale), ph, lamp? (index into lamps: its light flickers with the flame), k? (how much power feeds it, default 1) }]
 *           house  true: setPower also scales the scene key and ambient (a room lit by its lamps); false: lamps only
 *           motes  { box [x0, x1, y0, y1, z0, z1], every, color, size, vel, life, alpha, kind } | null
 *           tick(time, dt, pw, live)   the set's own animation; pw = L.power * power; live = false on a time jump
 *           extra  set-specific fields merged into the result }
 * setPower(p): 0 = the table is empty (lamps guttering, room at half), 1 = as designed, 1.5 = a little over.
 */
export function shell({ id, light, L, scene, cameras, marks, actors, foreground, lamps = [], glows = [], flames = [], motes = null, tick = null, house = true, extra = {} }) {
  const env = scene.env, sprites = scene.sprites;
  if (lamps.length > 6) throw new Error(`${id}: ${lamps.length} fixed lamps; the limit is 6 (the engine draws 8, two stay free for carried lamps)`);
  env.points = lamps.map((l) => ({ pos: l.pos, color: rgb(l.color), radius: l.radius, intensity: l.base * L.power }));
  const rig = setRig(id, cameras, env);
  let power = 1, lastT = -1, nextMote = 0;
  const key0 = Array.from(env.key.color), amb0 = env.ambient.amount, lift0 = env.shadow.lift;
  const rnd = rng(911), P = [0, 0, 0], ZV = [0.05, 0.06, 0.02];
  function setPower(p) { power = Math.max(0, Math.min(1.5, p)); }
  function update(time, dt = 0) {
    const pw = L.power * power, live = lastT >= 0 && time - lastT < 0.5 && dt > 0, low = 0.22 + 0.78 * Math.min(1, power); // a lamp never goes quite out: the scene must stay readable
    if (house) {
      const k = power <= 1 ? 0.55 + 0.45 * power : 1 + 0.16 * (power - 1);
      for (let i = 0; i < 3; i++) env.key.color[i] = key0[i] * k;
      env.ambient.amount = amb0 * (0.6 + 0.4 * Math.min(1, power)); env.shadow.lift = lift0 * (0.5 + 0.5 * Math.min(1, power));
    }
    for (let i = 0; i < lamps.length; i++) { const l = lamps[i], f = l.flicker ?? 0.05; env.points[i].intensity = l.base * L.power * (l.fixed ? 1 : power <= 1 ? low : power) * (1 - f + f * Math.sin(time * (7.3 + i * 1.7) + i * 2.1) * Math.sin(time * 3.1 + i)); }
    for (let i = 0; i < flames.length; i++) {
      const f = flames[i], fl = 0.82 + 0.18 * Math.sin(time * 9.1 + f.ph) * Math.sin(time * 5.3 + f.ph * 2.3), k = f.s * (0.45 + 0.55 * Math.min(1.3, f.fixed ? 1 : low * (power > 1 ? power : 1)));
      f.node.setScale(k * (0.92 + 0.08 * Math.sin(time * 6.3 + f.ph)), k * fl, k); f.node.setRot(0, time * 40 + f.ph * 57, Math.sin(time * 3.3 + f.ph) * 5);
      if (f.lamp != null) env.points[f.lamp].intensity *= 0.85 + 0.3 * (fl - 0.82) / 0.18 * 0.5;
    }
    for (let i = 0; i < glows.length; i++) { const g = glows[i]; g.sprite.alpha = g.base * (g.fixed ? 1 : Math.min(1.3, L.power * (power <= 1 ? low : power))) * (g.flick ? 0.9 + 0.1 * Math.sin(time * 9.1 + i * 1.7) : 1); }
    if (tick) tick(time, dt, pw, live);
    if (live) {
      if (motes && time > nextMote) {
        nextMote = time + motes.every; const b = motes.box;
        P[0] = b[0] + rnd() * (b[1] - b[0]); P[1] = b[2] + rnd() * (b[3] - b[2]); P[2] = b[4] + rnd() * (b[5] - b[4]);
        sprites.spawn({ kind: motes.kind || 'glow', pos: P, vel: motes.vel || ZV, size: (motes.size || 0.07) * (0.6 + rnd() * 0.8), life: motes.life || 5, color: motes.color || '#ffe6a0', alpha: motes.alpha ?? 0.8 });
      }
      sprites.update(dt);
    }
    lastT = time;
  }
  const set = { id, light, scene, env, actors, foreground: foreground || group('foreground'), cameras, frame: rig.frame, view: rig.view, marks, lamps, setPower, update, task: () => null, cue: () => false, ...extra };
  update(0, 0);
  return set;
}

/** A set's light state by name; an unknown name warns and gives the first (an encounter's `light` must never crash a chapter). */
export function lightOf(id, LIGHTS, name) {
  if (LIGHTS[name]) return [name, LIGHTS[name]];
  const first = Object.keys(LIGHTS)[0];
  if (name != null && typeof console !== 'undefined') console.warn(`${id}: no light "${name}" (have ${Object.keys(LIGHTS).join(', ')}); using "${first}"`);
  return [first, LIGHTS[first]];
}

/** The usual marks: cutscene spots a/b/c, the pair, a party of three at left and an opposition of three at right. */
export const stageMarks = () => ({
  a: { pos: [-0.8, 0, 0.55], face: 14 }, b: { pos: [0.02, 0, 0.8], face: 0 }, c: { pos: [0.82, 0, 0.55], face: -14 },
  two: [{ pos: [-0.42, 0, 0.62], face: 24 }, { pos: [0.42, 0, 0.62], face: -24 }],
  party: [{ pos: [-1.05, 0, 0.75], face: 78 }, { pos: [-1.85, 0, 1.15], face: 72 }, { pos: [-2.5, 0, 0.5], face: 80 }],
  opposition: [{ pos: [1.05, 0, 0.75], face: -78 }, { pos: [1.85, 0, 1.15], face: -72 }, { pos: [2.55, 0, 0.5], face: -80 }],
});

/** A bystander with nothing in the hands, for set dressing that is not a kit.crowd (a seated row, a queue): kit.townsfolk, re-exported with hold 'none'. */
export const bystander = (opts = {}) => townsfolk({ hold: 'none', ...opts });
