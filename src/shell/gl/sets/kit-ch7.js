// The chapter 7 kit: builders shared by the six Vessery-by-day sets (fish-dock, stall-day, hall-steps, drum-open,
// mole-lanterns, cutter-brig). Pure like kit.js (no GL, no DOM): every builder returns a coloured mesh from ../mesh.js.
// It leans on kit.js for the common props and on nothing else, so these sets do not move when another kit does.
//
// Conventions are kit.js's: metres, +Y up, props stand on y = 0 with their front toward +Z, one options object,
// attachment points in mesh.anchors (read them with anchorAt from kit.js).
//
// Scaffolding
//   C7                         the chapter's colours (the Mint's cream stone, teal copper, brass, wax red, chalk, Audit navy)
//   STD_MARKS()                the marks every set has: a, b, c, two[2], party[3], opposition[3]
//   STD_CAMERAS(over)          the six camera marks, with per-mark overrides
//   shell7(spec)               what every set returns: lamps -> env.points, glows, setPower, frame, view, update
//   sunShafts(dir, list, col)  slants of light along a direction, one mesh for rayMaterial()
//   rows(...)                  crowd spots in a block
//   folk7(spec)                a crowd whose coats are dyed in the mesh (kit.js's crowd tints the whole figure, face and all)
// Dock things
//   trestle, fishBox, fish, basket, dryingNet, skiff, cutter (the Audit cutter: one mast, one search lamp), moleWall, quay7
//   slate (the hearing's tally slate on an easel), oddsBoard (Tobb's board: 'odds' | 'table'), chalk, numerals, tallies
// The Mint
//   stairs7, column7, mintSeal7, mintHall (the portico, doors, pediment and dome), doorLeaf7, auditSeal, lampStandard, banner7, hillTown
//   lotDrum7 ({ cradle, drum, hatch }), reelWorks (the Reels of Assay from behind: { cabinet, wheel, plate }), plumb, slipBundle
// Nan's stall
//   lanternFrame (a bare frame, for instancing), pastePot, paperStack
// Below decks
//   hullSide, deckHead, cellFront, bunk, shipLantern, ladder7, seaChest
// Rooms
//   wall7 (a wall with openings), tallWindow, lightCards, floorPatch, tiles, chandelier7

import { m4, quat, rng, DEG, rgb } from '../math.js';
import {
  sphere, ellipsoid, cylinder, lathe, torus, box, roundedBox, extrude, tube, curve, plane, fromArrays,
  merge, tint, paint, place, deform, setGlow, setOutline, gradientY, scale as scaleMesh,
} from '../mesh.js';
import { group, Node, makeInstances } from '../scene.js';
import { rayMesh } from '../fx.js';
import { PAL, wonk, setRig, townsfolk } from './kit.js';

export const C7 = {
  stone: '#fff0cf', stone2: '#f6dfb6', stoneShade: '#e9c9a0', peach: '#ffcfa8', rose: '#ffb9a2',
  copper: '#2fbfa8', copperDark: '#1c9a96', brass: '#ffc94a', brassDark: '#e0932e',
  teal: '#27b8a8', tealDark: '#1c8c9a', royal: '#3b62d8', royalDark: '#2a44a8', navy: '#27336e', audit: '#1f2a5c',
  wine: '#c23a5e', plum: '#7a4fc4', plumDark: '#5236a0', wax: '#e8342c', waxDark: '#b01f2a',
  slate: '#3a4a86', slateDark: '#2c3a70', chalk: '#fffbe6', lead: '#8f9bc0',
  wood: '#d98a4e', woodRed: '#c8643e', woodDark: '#9a5236', woodPale: '#f0b574', bamboo: '#b9783c',
  parchment: '#fff4d2', paper: '#fffaf0', fish: '#cfe6f4', fish2: '#9fc8e6', net: '#2a8f9c', cork: '#f4573f',
  roofs: ['#f4573f', '#ff7a4a', '#e8452f', '#ff8b3d', '#f06a52'],
};

const R = (seed) => rng(Math.floor(seed * 7919) + 71);
const keep = (mesh, anchors) => { mesh.anchors = anchors; return mesh; };
const bx = (w, h, d, x, y, z, c, rx = 0, ry = 0, rz = 0) => tint(place(box(w, h, d), x, y, z, rx, ry, rz), c);
// a 'rounded' box here is a plain one: roundedBox is 108 triangles at its cheapest, and nine parts in ten of a set are boxes. rbx is the real thing, for hero pieces
const rb = (w, h, d, rad, x, y, z, c, rx = 0, ry = 0, rz = 0) => tint(place(box(w, h, d), x, y, z, rx, ry, rz), c);
const rbx = (w, h, d, rad, x, y, z, c, rx = 0, ry = 0, rz = 0) => tint(place(roundedBox(w, h, d, rad, 1), x, y, z, rx, ry, rz), c);
const cyl = (r0, r1, h, seg, x, y, z, c, rx = 0, ry = 0, rz = 0) => tint(place(cylinder(r0, r1, h, seg), x, y, z, rx, ry, rz), c);
const ball = (r, x, y, z, c, seg = 6, rings = 4) => tint(place(sphere(r, seg, rings), x, y, z), c);
const noInk = (m) => setOutline(m, 0);
export const norm7 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
/** az 0 = straight away from the camera (-Z), + = to the right; el = degrees above the horizon. The direction TOWARD the light. */
export const dirFrom = (azDeg, elDeg) => [Math.sin(azDeg * DEG) * Math.cos(elDeg * DEG), Math.sin(elDeg * DEG), -Math.cos(azDeg * DEG) * Math.cos(elDeg * DEG)];
/** a straight bar between two points, as a thin box */
function bar(a, b, t, c, t2 = t) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz) || 0.001;
  const yaw = Math.atan2(dx, dz) / DEG, pitch = -Math.asin(dy / len) / DEG;
  return tint(place(box(t, t2, len), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, pitch, yaw, 0), c);
}
export { bar };

// ------------------------------------------------------------------------------------ scaffolding

export const STD_MARKS = () => ({
  a: { pos: [-0.8, 0, 0.55], face: 14 }, b: { pos: [0.02, 0, 0.8], face: 0 }, c: { pos: [0.82, 0, 0.55], face: -14 },
  two: [{ pos: [-0.42, 0, 0.62], face: 24 }, { pos: [0.42, 0, 0.62], face: -24 }],
  party: [{ pos: [-1.05, 0, 0.75], face: 78 }, { pos: [-1.85, 0, 1.15], face: 72 }, { pos: [-2.5, 0, 0.5], face: 80 }],
  opposition: [{ pos: [1.05, 0, 0.75], face: -78 }, { pos: [1.85, 0, 1.15], face: -72 }, { pos: [2.55, 0, 0.5], face: -80 }],
});

/** The six camera marks every set answers. 'stage' matches the live band's own camera (stage.js: fov 24, yaw 7, pitch 7). */
export function STD_CAMERAS(over = {}) {
  const base = {
    wide: { target: [0.05, 1.6, -0.4], dist: 8.2, yaw: 2, pitch: 5, fov: 44, aspect: 0.46, shadowCenter: [0, 0, -1.2], shadowRadius: 8 },
    two: { target: [0, 1.12, 0.6], dist: 6.0, yaw: -15, pitch: 5, fov: 31, aspect: 0.46, shadowCenter: [0, 0, 0.3], shadowRadius: 3.6 },
    close: { target: [0.02, 0.86, 0.8], dist: 3.9, yaw: 21, pitch: 3, fov: 28, aspect: 0.46, shadowCenter: [0, 0, 0.5], shadowRadius: 2.6 },
    low: { target: [0.0, 1.85, 0.2], dist: 6.2, yaw: 6, pitch: -12, fov: 56, aspect: 0.46, shadowCenter: [0, 0, -1], shadowRadius: 8 },
    stage: { target: [0, 1.02, 0.5], dist: 9.4, yaw: 7, pitch: 7, fov: 24, aspect: 1.95, shadowCenter: [0, 0, -0.5], shadowRadius: 7.5, outline: 0.7 },
    landscape: { target: [0, 1.8, -1.2], dist: 10.5, yaw: 3, pitch: 5, fov: 40, aspect: 1.6, shadowCenter: [0, 0, -1.5], shadowRadius: 10.5 },
  };
  for (const k of Object.keys(over)) base[k] = { ...base[k], ...over[k] };
  return base;
}

/**
 * Everything a chapter 7 set returns that is the same for all six.
 *   spec: { id, light, low, L (the light state: .power = how lit its lamps are as built), scene, cameras, marks, actors, foreground,
 *           lamps [{ name, pos, color, radius, base, flicker? }]   at most 6: they become env.points
 *           glows [{ sprite, base, fixed? (does not follow power), lamp? }]
 *           sun   0..1: how much setPower reaches the key light. By day the table cannot light a lamp, so it turns the sun up
 *                 and down a little instead (0 = 1 - sun of the designed key, 1 = as designed)
 *           tick(time, dt, pw, live, power)   the set's own animation; pw = L.power * power; live = false on a time jump
 *           extra   set-specific fields merged into the result (task, cue, ...) }
 */
export function shell7({ id, light, low = false, L, scene, cameras, marks, actors, foreground, lamps = [], glows = [], sun = 0.3, tick = null, extra = {} }) {
  const env = scene.env, sprites = scene.sprites;
  if (lamps.length > 6) throw new Error(`${id}: ${lamps.length} fixed lamps; the limit is 6 (the engine draws 8, two stay free for carried lamps)`);
  env.points = lamps.map((l) => ({ pos: l.pos, color: rgb(l.color), radius: l.radius, intensity: l.base * L.power }));
  let power = 1, lastT = -1;
  const key0 = Array.from(env.key.color), amb0 = env.ambient.amount;
  const rig = setRig(id, cameras, env);
  function setPower(p) { power = Math.max(0, Math.min(1.5, p)); }
  function update(time, dt = 0) {
    const pw = L.power * power, live = lastT >= 0 && time - lastT < 0.5 && dt > 0;
    const house = power <= 1 ? 1 - sun * (1 - power) : 1 + 0.12 * (power - 1);
    for (let i = 0; i < 3; i++) env.key.color[i] = key0[i] * house;
    env.ambient.amount = amb0 * (1 - sun * 0.6 * (1 - Math.min(1, power)));
    for (let i = 0; i < lamps.length; i++) { const l = lamps[i], f = l.flicker ?? 0.05; env.points[i].intensity = l.base * pw * (1 - f + f * Math.sin(time * (7.3 + i * 1.7) + i * 2.1) * Math.sin(time * 3.1 + i)); }
    for (let i = 0; i < glows.length; i++) { const g = glows[i]; g.sprite.alpha = g.base * Math.min(1.25, g.fixed ? 1 : pw); }
    if (tick) tick(time, dt, pw, live, power);
    if (live && sprites) sprites.update(dt);
    lastT = time;
  }
  const set = {
    id, light, low, scene, env, actors, foreground: foreground || group('foreground'), cameras, frame: rig.frame, view: rig.view,
    marks, lamps, setPower, update, task: () => null, cue: () => false, ...extra,
  };
  update(0, 0);
  return set;
}

/**
 * Slants of light travelling along -dir (dir points toward the light), as rayMesh cones in one mesh.
 *   list: [[x, z, length, width], ...]  where each shaft lands on the ground
 */
export function sunShafts(dir, list, color = '#ffd890') {
  const yaw = Math.atan2(dir[0], dir[2]) / DEG, tilt = Math.acos(dir[1]) / DEG, parts = [];
  for (const [x, z, len, w, y = -0.2] of list) parts.push(place(rayMesh(len, w * 0.4, w, 10), x + dir[0] * len, y + dir[1] * len, z + dir[2] * len, tilt, yaw, 0));
  return tint(merge(parts), color);
}

/** Crowd spots in a block: n people between x0..x1, z0..z1, facing `face` (a number, or a function of the spot). */
export function rows(seed, n, x0, x1, z0, z1, face = 0, y = 0) {
  const r = R(seed), out = [], cols = Math.max(1, Math.round(Math.sqrt(n * Math.abs(x1 - x0) / Math.max(0.5, Math.abs(z1 - z0))))), rws = Math.ceil(n / cols);
  for (let i = 0; i < n; i++) {
    const c = i % cols, w = Math.floor(i / cols);
    const pos = [x0 + (x1 - x0) * ((c + 0.5 + (w % 2) * 0.35 + (r() - 0.5) * 0.4) / cols), y, z0 + (z1 - z0) * ((w + 0.5 + (r() - 0.5) * 0.5) / rws)];
    out.push({ pos, face: typeof face === 'function' ? face(pos) : face + (r() - 0.5) * 24 });
  }
  return out;
}

/**
 * A crowd in daylight. kit.js's crowd() dresses its people with the instance colour, which tints faces too, so its coats
 * have to stay nearly white; by day that reads as a row of ghosts. Here each variant's coat is dyed in the mesh and the
 * instance colour only shifts it a little, so a docker has a teal smock and a face.
 *   spots [{ pos, face, s? }] in the order they arrive;  coats: one colour per variant (each variant is two draws)
 *   hold 'none' | 'lantern' | 'torch';  sprites: for a glow on each light (or null)
 * Returns { node, people, amount, pace, setAmount(0..1), update(time, dt, { lit, lively }) }, as kit.js's crowd.
 */
export function folk7({ spots, material, coats = ['#58c4d6', '#ff9a78'], tints = ['#ffffff', '#fff0d8', '#e6f0ff', '#ffe8ee', '#f0ffe8', '#e8e0f6'], hold = 'none', sprites = null, glow = '#ffc060', glowSize = 0.75, seed = 1, amount = 1, detail = 1 }) {
  const r = R(seed), n = new Node('folk'), V = Math.max(1, Math.min(coats.length, spots.length || 1)), kinds = [];
  for (let v = 0; v < V; v++) {
    const mesh = townsfolk({ seed: seed + v * 3.7, hold, detail, coat: coats[v] }), k = new Node('folk' + v, { mesh, material });
    k.castShadow = false; k.instances = makeInstances(Math.max(1, Math.ceil(spots.length / V) + 1)); k.instances.count = 0; n.add(k); kinds.push({ node: k, A: mesh.anchors.light, n: 0 });
  }
  const people = spots.map((sp, i) => ({ kind: kinds[i % V], pos: sp.pos, face: sp.face || 0, s: sp.s || 0.9 + r() * 0.24, ph: r() * 6.283, col: rgb(tints[Math.floor(r() * tints.length) % tints.length]), here: i < Math.round(amount * spots.length) ? 1 : 0, glow: sprites && hold !== 'none' ? sprites.add({ kind: 'glow', pos: [0, 0, 0], size: glowSize, color: glow, alpha: 0 }) : null }));
  const Q = quat.create(), S3 = [1, 1, 1], Mx = m4.create(), P = [0, 0, 0];
  let arrived = Math.round(amount * spots.length);
  const c = {
    node: n, people, amount, pace: 9,
    setAmount(a) { c.amount = Math.max(0, Math.min(1, a)); },
    update(time, dt = 0, { lit = 1, lively = 0.3 } = {}) {
      const want = Math.round(c.amount * people.length), pace = c.pace * dt;
      arrived = dt === 0 ? want : arrived + Math.max(-pace, Math.min(pace, want - arrived));
      for (let v = 0; v < V; v++) kinds[v].n = 0;
      for (let i = 0; i < people.length; i++) {
        const p = people[i], goal = i < arrived ? 1 : 0, kind = p.kind, d = kind.node.instances.data, k = kind.n, A = kind.A;
        p.here += (goal - p.here) * Math.min(1, dt * 7 + (dt === 0 ? 1 : 0));
        if (p.here < 0.02) { if (p.glow) p.glow.alpha = 0; continue; }
        const hop = Math.abs(Math.sin(time * (2.2 + lively * 2.6) + p.ph)) * 0.05 * lively, sw = Math.sin(time * 1.1 + p.ph * 1.7) * (2 + 5 * lively) * DEG, yaw = (p.face + Math.sin(time * 0.6 + p.ph) * 8 * lively) * DEG;
        const s = p.s * (0.2 + 0.8 * p.here) * (1 + 0.12 * Math.sin(Math.min(1, p.here) * Math.PI));
        P[0] = p.pos[0]; P[1] = p.pos[1] + hop; P[2] = p.pos[2];
        quat.fromEuler(Q, 0, yaw, sw); S3[0] = S3[1] = S3[2] = s;
        m4.fromTRS(Mx, P, Q, S3); d.set(Mx, k * 20);
        d[k * 20 + 16] = p.col[0]; d[k * 20 + 17] = p.col[1]; d[k * 20 + 18] = p.col[2]; d[k * 20 + 19] = 1; kind.n++;
        if (p.glow) {
          const cy = Math.cos(yaw), sy = Math.sin(yaw), g = p.glow, ax = A[0] - Math.sin(sw) * A[1];
          g.pos[0] = P[0] + (ax * cy + A[2] * sy) * s; g.pos[1] = P[1] + A[1] * s; g.pos[2] = P[2] + (-ax * sy + A[2] * cy) * s;
          g.alpha = 0.6 * Math.min(1.3, lit) * p.here * (0.9 + 0.1 * Math.sin(time * 8 + p.ph * 3));
        }
      }
      for (let v = 0; v < V; v++) { const kn = kinds[v].node; kn.instances.count = kinds[v].n; kn.instances.dirty = true; kn.visible = kinds[v].n > 0; }
    },
  };
  return c;
}

// ------------------------------------------------------------------------------------ chalk

const GLYPH = {
  0: [[[0, 0], [1, 0], [1, 2], [0, 2], [0, 0]]], 1: [[[0.15, 1.5], [0.6, 2], [0.6, 0]]], 2: [[[0, 2], [1, 2], [1, 1], [0, 1], [0, 0], [1, 0]]],
  3: [[[0, 2], [1, 2], [1, 0], [0, 0]], [[0.25, 1], [1, 1]]], 4: [[[0.8, 0], [0.8, 2], [0, 0.7], [1.05, 0.7]]], 5: [[[1, 2], [0, 2], [0, 1], [1, 1], [1, 0], [0, 0]]],
  6: [[[1, 2], [0, 2], [0, 0], [1, 0], [1, 1], [0, 1]]], 7: [[[0, 2], [1, 2], [0.35, 0]]], 8: [[[0, 0], [1, 0], [1, 2], [0, 2], [0, 0]], [[0, 1], [1, 1]]],
  9: [[[1, 1], [0, 1], [0, 2], [1, 2], [1, 0], [0, 0]]], I: [[[0.5, 0], [0.5, 2]]], N: [[[0, 0], [0, 2], [1, 0], [1, 2]]], '-': [[[0, 1], [1, 1]]],
  ':': [[[0.45, 0.5], [0.55, 0.55]], [[0.45, 1.45], [0.55, 1.5]]], '/': [[[0, 0], [1, 2]]],
};
/** Strokes [[x0, y0, x1, y1], ...] for a string of digits (and I, N, -, :, /), `s` = the height of a figure. A hand wrote it: seed jitters it. */
export function numerals(text, x, y, s = 0.2, seed = 1) {
  const r = R(seed), out = [], u = s / 2; let cx = x;
  for (const ch of String(text)) {
    if (ch === ' ') { cx += u * 1.0; continue; }
    const g = GLYPH[ch]; if (!g) throw new Error(`numerals: no chalk glyph for "${ch}" (have ${Object.keys(GLYPH).join(' ')})`);
    const jx = (r() - 0.5) * u * 0.16, jy = (r() - 0.5) * u * 0.2, sk = (r() - 0.5) * 0.12;
    for (const line of g) for (let i = 0; i < line.length - 1; i++) out.push([cx + jx + (line[i][0] + line[i][1] * sk) * u, y + jy + line[i][1] * u, cx + jx + (line[i + 1][0] + line[i + 1][1] * sk) * u, y + jy + line[i + 1][1] * u]);
    cx += u * 1.65;
  }
  return out;
}
/** Five-bar gates: n marks starting at (x, y), `s` high, wrapping after `perRow` gates. */
export function tallies(n, x, y, s = 0.12, perRow = 6, seed = 1) {
  const r = R(seed), out = [];
  for (let i = 0; i < n; i++) {
    const g = Math.floor(i / 5), k = i % 5, gx = x + (g % perRow) * s * 1.25, gy = y - Math.floor(g / perRow) * s * 1.45;
    if (k < 4) out.push([gx + k * s * 0.22 + (r() - 0.5) * s * 0.05, gy, gx + k * s * 0.22 + (r() - 0.5) * s * 0.08, gy + s]);
    else out.push([gx - s * 0.1, gy + s * 0.2, gx + s * 0.8, gy + s * 0.8]);
  }
  return out;
}
/** Chalk strokes as one glowing unlined mesh in the XY plane (z = 0, facing +Z). */
export function chalk(strokes, { t = 0.022, color = C7.chalk, glow = 0.55 } = {}) {
  const parts = [];
  for (const [x0, y0, x1, y1] of strokes) {
    const len = Math.hypot(x1 - x0, y1 - y0) + t * 0.6;
    parts.push(place(box(len, t, 0.008), (x0 + x1) / 2, (y0 + y1) / 2, 0, 0, 0, Math.atan2(y1 - y0, x1 - x0) / DEG));
  }
  return noInk(setGlow(tint(merge(parts), color), glow));
}

// ------------------------------------------------------------------------------------ the fish dock

/** A gutting trestle: three planks on two A-frames. Long axis X. anchors: top (centre of the board) */
export function trestle({ w = 2.4, d = 0.86, h = 0.8, seed = 1, colors = [C7.woodPale, C7.wood, '#e8a05c'], legs = C7.woodDark } = {}) {
  const r = R(seed), parts = [];
  for (let i = 0; i < 3; i++) parts.push(rb(w + (r() - 0.5) * 0.14, 0.07, d / 3 - 0.012, 0.02, (r() - 0.5) * 0.05, h - 0.035 + (r() - 0.5) * 0.012, -d / 3 + i * (d / 3), colors[i % colors.length], 0, 0, (r() - 0.5) * 1.2));
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 - 0.34);
    for (const sz of [-1, 1]) parts.push(bx(0.075, h + 0.02, 0.075, x, (h - 0.07) / 2, sz * d * 0.26, legs, sz * -16, 0, sx * 3));
    parts.push(bx(0.06, 0.06, d * 0.56, x, h * 0.36, 0, legs));
    parts.push(bx(0.1, 0.07, d * 0.5, x, h - 0.1, 0, legs));
  }
  parts.push(bx(w - 0.7, 0.05, 0.05, 0, h * 0.36, 0, legs));
  return keep(wonk(merge(parts), { lean: (r() - 0.5) * 0.03, twist: (r() - 0.5) * 3 }), { top: [0, h, 0] });
}

/** One fish lying on its side on y = 0, head toward +X. */
export function fish({ len = 0.34, color = C7.fish, back = C7.fish2 } = {}) {
  const body = paint(place(ellipsoid(len * 0.42, len * 0.07, len * 0.15, 6, 4), 0, len * 0.07, 0), (x, y, z) => (z < -len * 0.03 ? back : color));
  const tail = tint(place(extrude([[0, 0], [-len * 0.2, len * 0.13], [-len * 0.14, 0], [-len * 0.2, -len * 0.13]], 0.02, { crease: 30 }), -len * 0.4, len * 0.06, 0, 90, 0, 0), back);
  return merge(body, tail, noInk(bx(0.02, 0.012, 0.02, len * 0.27, len * 0.135, len * 0.03, '#27305e')));
}

/** A shallow fish box: open, slatted, with (or without) the catch in it. */
export function fishBox({ w = 0.66, h = 0.24, d = 0.44, seed = 1, catchIn = true, color = C7.woodPale, dark = C7.woodDark } = {}) {
  const r = R(seed), parts = [bx(w, 0.03, d, 0, 0.015, 0, dark)];
  for (const sz of [-1, 1]) parts.push(rb(w + 0.03, h, 0.035, 0.01, 0, h / 2, sz * d / 2, color, 0, 0, (r() - 0.5) * 2));
  for (const sx of [-1, 1]) parts.push(rb(0.035, h * 0.92, d, 0.01, sx * w / 2, h / 2, 0, r() < 0.5 ? color : C7.wood));
  if (catchIn) {
    parts.push(bx(w - 0.06, 0.03, d - 0.06, 0, h * 0.62, 0, '#eaf6ff'));
    for (let i = 0; i < 3; i++) parts.push(place(fish({ len: 0.3 + r() * 0.08 }), (r() - 0.5) * 0.16, h * 0.64, -d * 0.26 + i * d * 0.26, 0, r() < 0.5 ? 0 : 180, 0));
  }
  return merge(parts);
}

/** A round creel with a rope handle. */
export function basket({ r = 0.22, h = 0.3, full = true, color = PAL.rope } = {}) {
  const parts = [tint(lathe([[0, 0], [r * 0.72, 0], [r, h * 0.7], [r * 0.96, h], [r * 0.82, h], [r * 0.8, h * 0.82], [0, h * 0.8]], 8, { crease: 40 }), color), tint(place(torus(r * 0.98, 0.022, 8, 4), 0, h, 0), C7.wood)];
  if (full) parts.push(bx(r * 1.1, 0.03, r * 1.1, 0, h * 0.84, 0, C7.fish), place(fish({ len: r * 1.5 }), 0, h * 0.86, 0, 0, 30, 0));
  return merge(parts);
}

/**
 * A net hung to dry between two points: a head-rope with corks, a lattice below it (unlined, so it stays a net and not
 * a black sheet), a weighted foot-rope. `drop` is how far it hangs.
 */
export function dryingNet(a, b, { drop = 1.9, sag = 0.35, strands = 13, color = C7.net, seed = 1 } = {}) {
  const top = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
  const foot = (t) => { const p = top(t); return [p[0], p[1] - drop * (0.82 + 0.18 * Math.sin(t * Math.PI)), p[2] + 0.12 * Math.sin(t * Math.PI)]; };
  const mesh = [], lined = [], path = [];
  for (let i = 0; i <= 10; i++) path.push(top(i / 10));
  lined.push(tint(tube(path, 0.022, 4, { crease: 180 }), PAL.rope));
  for (let i = 0; i <= strands; i++) { // two families of diagonals
    const t = i / strands;
    if (t + 0.22 <= 1.001) mesh.push(bar(top(t), foot(Math.min(1, t + 0.22)), 0.014, color));
    if (t - 0.22 >= -0.001) mesh.push(bar(top(t), foot(Math.max(0, t - 0.22)), 0.014, color));
  }
  for (let k = 1; k <= 3; k++) { const pts = []; for (let i = 0; i <= 6; i++) { const t = i / 6, p = top(t), q = foot(t), u = k / 3.2; pts.push([p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, p[2] + (q[2] - p[2]) * u]); } for (let i = 0; i < 6; i++) mesh.push(bar(pts[i], pts[i + 1], 0.012, color)); }
  for (let i = 0; i <= 6; i++) { const p = top(i / 6); lined.push(ball(0.055, p[0], p[1] + 0.01, p[2], i % 2 ? C7.cork : PAL.cream)); }
  return merge(noInk(merge(mesh)), lined);
}

/**
 * A light open harbour boat, bow toward +X, waterline at y = 0, about `len` long: a few hundred triangles, for where kit.js's
 * boat would be most of a set's budget. anchors: mast (its top)
 */
export function skiff({ len = 2.6, hull = PAL.cream, keel = PAL.red, inside = C7.wood, mast = true, pennant = PAL.yellow, seed = 1 } = {}) {
  const r = R(seed), hl = len / 2, bw = len * 0.2, hh = len * 0.16;
  const shell = deform(ellipsoid(hl, hh * 1.6, bw, 10, 6), (p) => {
    if (p[1] > 0) p[1] *= 0.32 + 0.4 * Math.pow(Math.abs(p[0]) / hl, 2) * (p[0] > 0 ? 1.3 : 0.7); // a low sheer, rising to the bow
    const k = p[0] / hl; if (k > 0.3) p[2] *= 1 - 0.55 * (k - 0.3) / 0.7;                             // a pointed bow
  }, 60);
  paint(shell, (x, y) => (y < -hh * 0.15 ? keel : hull));
  const parts = [place(shell, 0, hh * 0.35, 0)];
  parts.push(tint(place(deform(lathe([[hl * 0.86, 0], [0, 0]], 10, { crease: 180 }), (p) => { p[2] *= (bw * 0.8) / (hl * 0.86); const k = p[0] / hl; if (k > 0.3) p[2] *= 1 - 0.55 * (k - 0.3) / 0.7; }), -0.02, hh * 0.52, 0), inside));
  for (const x of [-hl * 0.36, hl * 0.22]) parts.push(bx(0.16, 0.04, bw * 1.5, x, hh * 0.62, 0, C7.woodPale));
  let top = [0, hh, 0];
  if (mast) {
    const mh = len * 0.62, mx = hl * 0.1;
    parts.push(cyl(0.04, 0.028, mh, 5, mx, hh * 0.5, 0, C7.woodDark, 0, 0, (r() - 0.5) * 5));
    parts.push(tint(place(ellipsoid(len * 0.26, 0.07, 0.07, 6, 3), mx - len * 0.2, hh * 0.5 + mh * 0.52, 0, 0, 0, -8), '#fff6e0'));
    parts.push(noInk(tint(place(extrude([[0, 0], [0.34, -0.07], [0, -0.16]], 0.012, { crease: 30 }), mx, hh * 0.5 + mh - 0.02, 0), pennant)));
    top = [mx, hh * 0.5 + mh, 0];
  }
  return keep(merge(parts), { mast: top });
}

/**
 * The Audit cutter: a long dark hull with a white strake, one raked mast with a furled gaff sail, a low deckhouse, and
 * its single search lamp on a post at the bow. Bow toward +X, waterline at y = 0.
 * anchors: lamp (the search lamp's glass), mast (masthead), stern, bow
 */
export function cutter({ len = 13, hull = C7.audit, strake = '#f4f8ff', deck = '#c8d2f4', lit = true, sails = false } = {}) {
  const hl = len / 2, bw = len * 0.12, hh = len * 0.1;
  const shell = deform(ellipsoid(hl, hh * 1.7, bw, 12, 6), (p) => {
    if (p[1] > 0) p[1] *= 0.42 + 0.3 * Math.pow(Math.abs(p[0]) / hl, 2) * (p[0] > 0 ? 1.5 : 0.6);
    const k = p[0] / hl; if (k > 0.1) p[2] *= 1 - 0.8 * Math.pow((k - 0.1) / 0.9, 1.5); if (k < -0.6) p[2] *= 1 - 0.3 * (-k - 0.6) / 0.4;
  }, 60);
  paint(shell, (x, y) => (y > hh * 0.34 && y < hh * 0.56 ? strake : y < -hh * 0.5 ? '#c23a5e' : hull));
  const dy = hh * 0.72, parts = [place(shell, 0, hh * 0.25, 0)];
  parts.push(tint(place(deform(lathe([[hl * 0.9, 0], [0, 0]], 12, { crease: 180 }), (p) => { p[2] *= (bw * 0.82) / (hl * 0.9); const k = p[0] / hl; if (k > 0.1) p[2] *= 1 - 0.8 * Math.pow((k - 0.1) / 0.9, 1.5); }), 0, dy + hh * 0.22, 0), deck));
  parts.push(rb(len * 0.2, hh * 0.7, bw * 0.9, 0.06, -hl * 0.36, dy + hh * 0.55, 0, '#e9eeff'), rb(len * 0.22, 0.1, bw * 1.02, 0.03, -hl * 0.36, dy + hh * 0.93, 0, hull));
  for (const sz of [-1, 1]) for (const k of [-1, 1]) parts.push(setGlow(bx(0.3, 0.26, 0.04, -hl * 0.36 + k * len * 0.05, dy + hh * 0.58, sz * bw * 0.46, lit ? '#ffd880' : '#3a4a8c'), lit ? 0.9 : 0));
  const mx = hl * 0.12, mh = len * 0.78, rake = -5, top = [mx - Math.sin(rake * DEG) * mh * -1, dy + mh * Math.cos(rake * DEG), 0];
  parts.push(cyl(0.11, 0.06, mh, 6, mx, dy, 0, '#3a2f5a', 0, 0, -rake));
  const gaff = [mx - 0.2, dy + mh * 0.66, 0], boom = [mx - 0.15, dy + mh * 0.16, 0];
  parts.push(bar([gaff[2], gaff[1], -gaff[0]], [0, gaff[1] + mh * 0.17, len * 0.3 - gaff[0] * 0 - mx + 0.2], 0.09, '#3a2f5a'));
  parts[parts.length - 1] = place(parts[parts.length - 1], 0, 0, 0, 0, -90, 0);
  parts.push(tint(place(cylinder(0.07, 0.05, len * 0.36, 5), boom[0], boom[1], 0, 0, 0, 90), '#3a2f5a'));
  if (sails) parts.push(noInk(tint(place(extrude([[0, 0], [-len * 0.36, 0.1], [-len * 0.3, mh * 0.66], [0, mh * 0.5]], 0.03, { crease: 30 }), boom[0] - 0.1, boom[1] + 0.12, 0), '#e9eeff')));
  else parts.push(tint(place(ellipsoid(len * 0.17, 0.2, 0.18, 7, 4), boom[0] - len * 0.18, boom[1] + 0.2, 0), '#dfe6ff'));
  // stays: thin, unlined
  const stays = [bar([hl * 0.96, dy + hh * 0.6, 0], top, 0.03, '#3a2f5a'), bar([-hl * 0.9, dy + hh * 0.5, 0], top, 0.03, '#3a2f5a'), bar([mx, dy + hh * 0.3, bw * 0.75], [top[0], top[1] - mh * 0.2, 0], 0.03, '#3a2f5a'), bar([mx, dy + hh * 0.3, -bw * 0.75], [top[0], top[1] - mh * 0.2, 0], 0.03, '#3a2f5a')];
  parts.push(noInk(merge(stays)));
  parts.push(noInk(tint(place(extrude([[0, 0], [-0.9, -0.16], [0, -0.42]], 0.02, { crease: 30 }), top[0], top[1] + 0.1, 0), '#f4f8ff')));
  // the search lamp
  const lx = hl * 0.74, ly = dy + hh * 0.5 + 1.25;
  parts.push(cyl(0.06, 0.05, 1.1, 5, lx, dy + hh * 0.5, 0, '#3a2f5a'), tint(place(cylinder(0.26, 0.2, 0.36, 8), lx - 0.18, ly, 0, 0, 0, -90), C7.brass));
  const glass = tint(place(cylinder(0.2, 0.2, 0.05, 8), lx + 0.18, ly, 0, 0, 0, -90), lit ? '#fff6c8' : '#8f9bc0');
  parts.push(lit ? setGlow(glass, 1) : glass);
  return keep(merge(parts), { lamp: [lx + 0.25, ly, 0], mast: top, stern: [-hl, dy + hh * 0.4, 0], bow: [hl, dy + hh * 0.6, 0] });
}

/**
 * A stone mole running out from the origin toward -Z for `len`, top at y = 0, `w0` wide at the root narrowing to `w1`,
 * bending sideways by `bend` at its far end. Coping blocks along both edges, a lamp-post foot every `bay`.
 * Returns the mesh; mesh.at(t, across = 0) -> [x, 0, z] on its top (t 0..1 along it, across -1..1 edge to edge); anchors: posts (both edges)
 */
export function moleWall({ len = 90, w0 = 7, w1 = 4.2, drop = 1.8, bend = 0, seg = 18, bay = 6, seed = 1, top = '#f1dfb4', side = PAL.stone2, cope = [PAL.stone, PAL.stoneDark] } = {}) {
  const r = R(seed), parts = [], posts = [];
  const cx = (t) => bend * t * t, wd = (t) => w0 + (w1 - w0) * Math.min(1, t * 1.6), at = (t, across = 0) => [cx(t) + across * wd(t) / 2, 0, -len * t];
  for (let i = 0; i < seg; i++) {
    const t0 = Math.pow(i / seg, 1.5), t1 = Math.pow((i + 1) / seg, 1.5), tm = (t0 + t1) / 2, a = at(t0), b = at(t1), L = Math.hypot(b[0] - a[0], b[2] - a[2]), yaw = Math.atan2(b[0] - a[0], b[2] - a[2]) / DEG, w = wd(tm);
    parts.push(paint(place(box(w, drop + 0.4, L + 0.05), (a[0] + b[0]) / 2, -(drop + 0.4) / 2, (a[2] + b[2]) / 2, 0, yaw, 0), (x, y, z, nx, ny) => (ny > 0.5 ? top : side)));
    const n = Math.max(1, Math.round(L / (1.6 + i * 0.5)));
    for (let k = 0; k < n; k++) for (const sx of [-1, 1]) {
      const u = (k + 0.5) / n, x = a[0] + (b[0] - a[0]) * u + sx * (w / 2 - 0.2), z = a[2] + (b[2] - a[2]) * u;
      parts.push(tint(place(box(0.5, 0.2, L / n - 0.04), x, 0.07 + r() * 0.02, z, 0, yaw + (r() - 0.5) * 3, 0), cope[(k + i + (sx > 0 ? 1 : 0)) % 2]));
    }
  }
  for (let z = bay * 0.5; z < len - 1; z += bay) for (const sx of [-1, 1]) { const t = z / len; posts.push([cx(t) + sx * (wd(t) / 2 - 0.25), 0.18, -z]); }
  const m = keep(merge(parts), { posts, end: at(1) }); m.at = at; m.width = wd;
  return m;
}

/**
 * A quay edge along X at z = 0 (land toward +Z, water toward -Z, top at y = 0): coping blocks in two tones over a plain
 * wall, as kit.js's quayEdge but a fifth of the triangles (boxes, not rounded boxes), so a set can afford a long one.
 */
export function quay7({ len = 30, drop = 1.7, seed = 1, block = 1.05, cope = [PAL.stone, PAL.stone2], wallColor = PAL.stoneDark } = {}) {
  const r = R(seed), parts = [], n = Math.round(len / block), bw = len / n;
  for (let i = 0; i < n; i++) parts.push(tint(place(box(bw - 0.03, 0.26, 0.62 + r() * 0.08), -len / 2 + bw * (i + 0.5), -0.1 + r() * 0.035, 0.2, 0, (r() - 0.5) * 4, 0), cope[i % 2]));
  parts.push(tint(place(box(len, drop, 0.4), 0, -0.22 - drop / 2, 0.22), wallColor));
  for (let i = 0; i < n / 3; i++) parts.push(tint(place(box(bw * 1.6, 0.42, 0.06), -len / 2 + r() * len, -0.5 - r() * (drop - 0.7), 0.01), PAL.stone2));
  return merge(parts);
}

/**
 * The hearing's tally slate: a dark board in a wooden frame on a three-legged easel, chalked with `count` five-bar gates
 * and a running figure. Faces +Z. Returns { stand, marks } (the chalk is its own unlined glowing mesh, in the same space).
 * anchors (on stand): top
 */
export function slate({ w = 0.95, h = 1.25, count = 60, figure = '900', seed = 1 } = {}) {
  const by = 0.72, tilt = -9, parts = [];
  parts.push(rb(w + 0.12, h + 0.12, 0.06, 0.02, 0, by + h / 2, 0, C7.woodPale), bx(w, h, 0.03, 0, by + h / 2, 0.025, C7.slate), rb(w + 0.2, 0.06, 0.14, 0.02, 0, by - 0.04, 0.07, C7.wood));
  const board = place(merge(parts), 0, 0, 0, tilt, 0, 0);
  const legs = merge(bar([-w * 0.42, 0, 0.16], [-w * 0.2, by + h * 0.9, -0.17], 0.06, C7.woodDark), bar([w * 0.42, 0, 0.16], [w * 0.2, by + h * 0.9, -0.17], 0.06, C7.woodDark), bar([0, 0, -0.62], [0, by + h * 0.86, -0.2], 0.06, C7.woodDark));
  const strokes = [...numerals(figure, -w * 0.4, by + h * 0.72, h * 0.2, seed), [-w * 0.44, by + h * 0.66, w * 0.44, by + h * 0.665], ...tallies(count, -w * 0.4, by + h * 0.5, h * 0.105, 5, seed)];
  const marks = place(place(chalk(strokes, { t: 0.02 }), 0, 0, 0.045), 0, 0, 0, tilt, 0, 0);
  return { stand: keep(merge(board, legs), { top: [0, by + h, -0.1] }), marks };
}

/**
 * Tobb's board on the wall by the hall steps: a slate in a heavy frame, facing +Z, origin at its bottom centre.
 *   state 'odds'   his old odds: 7 and 2 over a ruled line, columns of gates ("Sevens the docks, evens the Hill")
 *         'table'  the table he certifies in ch7.s7: 40 over 24, ruled rows, ringed
 * Returns { board, odds, table }: draw the board and one of the two chalk meshes.
 */
export function oddsBoard({ w = 1.9, h = 1.35, seed = 1 } = {}) {
  const board = merge(rb(w + 0.2, h + 0.2, 0.09, 0.03, 0, h / 2, 0, C7.woodRed), bx(w, h, 0.03, 0, h / 2, 0.04, C7.slateDark), rb(w + 0.3, 0.07, 0.18, 0.02, 0, -0.08, 0.06, C7.woodDark),
    bx(0.12, 0.04, 0.05, -w * 0.3, -0.03, 0.12, C7.chalk), bx(0.07, 0.07, 0.1, w * 0.36, -0.01, 0.1, '#f4f8ff'));
  const z = 0.06, hw = w / 2;
  const odds = [...numerals('7', -hw * 0.78, h * 0.62, h * 0.3, seed), ...numerals('2', hw * 0.12, h * 0.62, h * 0.3, seed + 1), [-hw * 0.9, h * 0.55, hw * 0.9, h * 0.56], [0, h * 0.94, -0.01, h * 0.1],
    ...tallies(23, -hw * 0.86, h * 0.36, h * 0.1, 3, seed), ...tallies(14, hw * 0.1, h * 0.36, h * 0.1, 3, seed + 2), ...numerals('1/4', -hw * 0.3, h * 0.07, h * 0.1, seed + 3)];
  const table = [...numerals('40', -hw * 0.84, h * 0.6, h * 0.32, seed + 4), ...numerals('24', hw * 0.22, h * 0.6, h * 0.32, seed + 5), ...numerals('-', -hw * 0.12, h * 0.6, h * 0.3, seed),
    [-hw * 0.92, h * 0.53, hw * 0.92, h * 0.54], [-hw * 0.92, h * 0.38, hw * 0.92, h * 0.385], [-hw * 0.92, h * 0.23, hw * 0.92, h * 0.235], [-hw * 0.3, h * 0.53, -hw * 0.3, h * 0.08], [hw * 0.34, h * 0.53, hw * 0.34, h * 0.08],
    ...numerals('3:1', -hw * 0.84, h * 0.405, h * 0.1, seed + 6), ...numerals('1/4', -hw * 0.84, h * 0.255, h * 0.1, seed + 7), ...tallies(8, -hw * 0.2, h * 0.41, h * 0.085, 2, seed), ...tallies(10, -hw * 0.2, h * 0.26, h * 0.085, 2, seed + 1),
    ...numerals('24', hw * 0.44, h * 0.4, h * 0.1, seed + 8), ...numerals('40', hw * 0.44, h * 0.25, h * 0.1, seed + 9), ...tallies(6, -hw * 0.84, h * 0.1, h * 0.085, 3, seed + 3)];
  const ring = []; for (let i = 0; i < 14; i++) { const a0 = (i / 14) * 6.283, a1 = ((i + 1) / 14) * 6.283; ring.push([hw * 0.56 + Math.cos(a0) * hw * 0.42, h * 0.76 + Math.sin(a0) * h * 0.2, hw * 0.56 + Math.cos(a1) * hw * 0.42, h * 0.76 + Math.sin(a1) * h * 0.2]); }
  return { board, odds: place(chalk(odds, { t: 0.026 }), 0, 0, z), table: place(chalk([...table, ...ring], { t: 0.026 }), 0, 0, z) };
}

// ------------------------------------------------------------------------------------ the Mint

/** A fat stone column with a base and a cushion capital, standing on y = 0. */
export function column7({ h = 4.6, r = 0.36, color = C7.stone, band = C7.brass, seg = 8 } = {}) {
  const shaft = lathe([[0, 0], [r * 1.55, 0], [r * 1.55, 0.16], [r * 1.15, 0.28], [r, 0.44], [r * 0.88, h - 0.56], [r * 1.2, h - 0.36], [r * 1.55, h - 0.18], [r * 1.55, h], [0, h]], seg, { crease: 50 });
  return merge(tint(shaft, color), tint(place(torus(r * 1.0, 0.05, seg, 3), 0, 0.48, 0), band), tint(place(torus(r * 0.92, 0.05, seg, 3), 0, h - 0.6, 0), band));
}

/** The Mint's seal, flat, in the XY plane facing +Z: a brass ring round a dark field, a balance under one flame. */
export function mintSeal7({ r = 0.8, glow = 0.7, seg = 12 } = {}) {
  const parts = [cyl(r, r, r * 0.1, seg, 0, 0, -r * 0.1, C7.navy, 90, 0, 0), tint(place(torus(r, r * 0.1, seg, 4), 0, 0, 0, 90, 0, 0), C7.brass)];
  const z = r * 0.04;
  parts.push(bx(r * 0.07, r * 0.7, r * 0.06, 0, -r * 0.2, z, C7.brass), bx(r * 1.0, r * 0.08, r * 0.06, 0, r * 0.1, z, C7.brass), bx(r * 0.4, r * 0.08, r * 0.06, 0, -r * 0.56, z, C7.brass));
  for (const sx of [-1, 1]) parts.push(tint(place(extrude([[-r * 0.2, 0], [r * 0.2, 0], [r * 0.12, -r * 0.12], [-r * 0.12, -r * 0.12]], r * 0.06, { crease: 30 }), sx * r * 0.46, -r * 0.16, z), C7.brass));
  parts.push(setGlow(tint(place(extrude([[0, r * 0.34], [r * 0.13, r * 0.08], [r * 0.08, -r * 0.06], [0, -r * 0.1], [-r * 0.08, -r * 0.06], [-r * 0.13, r * 0.08]], r * 0.07, { crease: 30 }), 0, r * 0.4, z), '#ff9a3c'), glow));
  return merge(parts);
}

/**
 * One leaf of the hall's great doors: origin at the foot of its hinge edge, running toward +X, facing +Z. Teal, three
 * raised panels, brass studs and a ring pull.
 */
export function doorLeaf7({ w = 1.3, h = 3.5, color = C7.teal, panel = '#3fd0bc', metal = C7.brass, studs = true } = {}) {
  const parts = [rb(w, h, 0.12, 0.02, w / 2, h / 2, 0, color)];
  for (let i = 0; i < 3; i++) { const ph = (h - 0.5) / 3; parts.push(rb(w - 0.34, ph - 0.16, 0.05, 0.02, w / 2, 0.25 + ph * (i + 0.5), 0.06, panel)); }
  if (studs) for (let i = 0; i < 4; i++) for (const x of [0.11, w - 0.11]) parts.push(ball(0.045, x, 0.3 + i * ((h - 0.6) / 3), 0.07, metal, 5, 3));
  parts.push(tint(place(torus(0.11, 0.025, 8, 3), w - 0.2, h * 0.42, 0.1, 90, 0, 0), metal));
  return merge(parts);
}

/** The Audit's seal: a lump of red wax over crossed navy ribbon, to lie across the join of two doors. XY plane, facing +Z. */
export function auditSeal({ r = 0.3, span = 2.2 } = {}) {
  const parts = [bx(span, 0.13, 0.03, 0, 0, 0, C7.audit, 0, 0, 4), bx(span * 0.8, 0.13, 0.03, 0, 0, 0.005, C7.audit, 0, 0, -9)];
  parts.push(tint(place(deform(cylinder(r, r * 0.92, 0.09, 10), (p) => { const a = Math.atan2(p[2], p[0]); const k = 1 + 0.09 * Math.sin(a * 5 + 1); p[0] *= k; p[2] *= k; }, 40), 0, 0, 0.02, 90, 0, 0), C7.wax));
  parts.push(tint(place(torus(r * 0.62, r * 0.07, 10, 3), 0, 0, 0.11, 90, 0, 0), C7.waxDark), bx(r * 0.1, r * 0.7, 0.03, 0, 0, 0.115, C7.waxDark), bx(r * 0.6, r * 0.1, 0.03, 0, r * 0.1, 0.115, C7.waxDark));
  for (const sx of [-1, 1]) parts.push(bx(0.12, 0.6, 0.025, sx * 0.14, -0.42, 0.01, C7.audit, 0, 0, sx * 12));
  return merge(parts);
}

/**
 * A flight of stone steps `w` wide rising toward -Z: the first riser stands at z = 0 on y = 0, the top tread is at
 * y = n * rise and ends at z = -n * run. Treads in two tones. (kit.js's steps() goes down and is rounded: 108 triangles a step.)
 */
export function stairs7({ w = 10, n = 6, rise = 0.2, run = 0.42, colors = [C7.stone, C7.stone2], nose = C7.stoneShade } = {}) {
  const parts = [];
  for (let i = 0; i < n; i++) {
    const h = rise * (i + 1);
    parts.push(tint(place(box(w, h, run + 0.02), 0, h / 2, -run * (i + 0.5)), colors[i % 2]));
    parts.push(tint(place(box(w + 0.04, 0.05, 0.06), 0, h - 0.025, -run * i + 0.01), nose));
  }
  return merge(parts);
}

/** A brass lamp standard on a stone plinth with a round glass. anchors: lamp */
export function lampStandard({ h = 2.7, lit = true, glass = '#ffe6a0', metal = C7.brass, plinth = C7.stone2 } = {}) {
  const parts = [rb(0.56, 0.5, 0.56, 0.05, 0, 0.25, 0, plinth), tint(lathe([[0, 0.5], [0.16, 0.5], [0.14, 0.58], [0.06, 0.7], [0.05, h - 0.5], [0.12, h - 0.42], [0, h - 0.4]], 7, { crease: 50 }), metal)];
  const g = tint(place(sphere(0.24, 9, 6), 0, h - 0.2, 0), lit ? glass : '#dfe6ff');
  parts.push(lit ? setGlow(g, 0.95) : setGlow(g, 0.15), tint(place(cylinder(0.2, 0.03, 0.2, 7), 0, h + 0.0, 0), metal), ball(0.045, 0, h + 0.22, 0, metal, 5, 3));
  for (const sx of [-1, 1]) parts.push(tint(place(tube(curve([[sx * 0.05, h - 0.7, 0], [sx * 0.3, h - 0.62, 0], [sx * 0.3, h - 0.3, 0]], 5), 0.02, 4), 0, 0, 0), metal));
  return keep(merge(parts), { lamp: [0, h - 0.2, 0] });
}

/** A long cloth banner on a rod: origin at the rod's middle, hanging down, facing +Z. Swallow-tailed, with a device disc. */
export function banner7({ w = 0.95, h = 3.0, color = C7.wine, trim = C7.brass, device = C7.parchment, tail = 0.4 } = {}) {
  const hw = w / 2, cloth = extrude([[-hw, 0], [hw, 0], [hw, -h], [0, -h + tail], [-hw, -h]], 0.03, { crease: 30 });
  const m = merge(tint(cloth, color), bx(w, 0.1, 0.035, 0, -0.16, 0.005, trim), bx(w * 0.86, 0.05, 0.035, 0, -h + tail + 0.42, 0.005, trim),
    cyl(w * 0.27, w * 0.27, 0.02, 10, 0, -h * 0.42, 0.02, device, 90, 0, 0), tint(place(torus(w * 0.27, 0.03, 10, 3), 0, -h * 0.42, 0.03, 90, 0, 0), trim),
    tint(place(cylinder(0.035, 0.035, w + 0.3, 5), -hw - 0.15, 0, 0, 0, 0, -90), trim), ball(0.06, -hw - 0.17, 0, 0, trim, 5, 3), ball(0.06, hw + 0.17, 0, 0, trim, 5, 3));
  return m;
}

/**
 * The front of the Mint hall: a floor slab, a row of fat columns, a back wall with the great doorway, an entablature with
 * a brass frieze, a pediment carrying the seal, and (dome: true) the copper dome and its brass lantern behind.
 * Origin: the middle of the front edge of the portico floor, whose top is y = 0. The front faces +Z.
 *   doors   'shut' | 'open' | 'none' (leave the opening empty: hang doorLeaf7 nodes at anchors.hinges)
 *   colX    the columns' x positions, when the middle bay wants to be wider than the rest (default: `cols` evenly spaced)
 *   detail  1 (a set you stand in front of) | 0 (seen across the harbour: six-sided columns, no studs, no steps)
 * anchors: doors (centre of the threshold), hinges [left, right], sealAt (where an auditSeal goes), pediment (the seal on it),
 *          finial (the dome's brass lantern), lampL / lampR (either side of the doorway, at head height), top
 */
export function mintHall({ w = 12, h = 4.8, d = 3.2, cols = 6, colX = null, doorW = 2.6, doorH = 3.6, doors = 'shut', dome = true, detail = 1, body = 7, wall = C7.peach, stone = C7.stone, roof = C7.copper } = {}) {
  const parts = [], hw = w / 2, seg = detail ? 8 : 6;
  parts.push(bx(w + 1.0, 0.5, d + 0.8, 0, -0.25, -d / 2, C7.stone2));
  // the wall behind the colonnade, with the doorway cut out of it
  const side = (hw - doorW / 2);
  for (const sx of [-1, 1]) parts.push(bx(side, h, 0.5, sx * (doorW / 2 + side / 2), h / 2, -d, wall));
  parts.push(bx(doorW, h - doorH, 0.5, 0, (h + doorH) / 2, -d, wall));
  parts.push(bx(w, 1.0, 0.56, 0, 0.5, -d + 0.02, C7.royalDark), bx(doorW + 0.5, 0.26, 0.6, 0, doorH + 0.13, -d + 0.06, stone));
  for (const sx of [-1, 1]) parts.push(bx(0.26, doorH, 0.6, sx * (doorW / 2 + 0.13), doorH / 2, -d + 0.06, stone));
  parts.push(bx(doorW, doorH, 0.1, 0, doorH / 2, -d - 0.5, doors === 'open' ? '#ffc070' : '#3a2a6e'));
  if (doors === 'open') parts[parts.length - 1] = setGlow(parts[parts.length - 1], 0.6);
  const lw = doorW / 2;
  if (doors === 'shut') { parts.push(place(doorLeaf7({ w: lw - 0.01, h: doorH, studs: !!detail }), -lw, 0, -d + 0.2)); parts.push(place(doorLeaf7({ w: lw - 0.01, h: doorH, studs: !!detail }), lw, 0, -d + 0.2, 0, 180, 0, 1, 1, -1)); }
  if (doors === 'open') { parts.push(place(doorLeaf7({ w: lw, h: doorH, studs: !!detail }), -lw, 0, -d + 0.2, 0, 104, 0)); parts.push(place(doorLeaf7({ w: lw, h: doorH, studs: !!detail }), lw, 0, -d + 0.2, 0, 180 - 104, 0, 1, 1, -1)); }
  // columns
  const xs = colX || Array.from({ length: cols }, (_, i) => -hw + 0.6 + (w - 1.2) * (i / (cols - 1)));
  for (const x of xs) parts.push(place(column7({ h, r: 0.38, color: stone, seg }), x, 0, -0.55));
  // entablature, frieze, pediment, seal
  parts.push(bx(w + 0.7, 0.55, d + 0.5, 0, h + 0.275, -d / 2, stone), bx(w + 0.74, 0.14, d + 0.54, 0, h + 0.3, -d / 2, C7.brass), bx(w + 1.1, 0.16, d + 0.9, 0, h + 0.63, -d / 2, C7.stone2));
  const ph = w * 0.17;
  parts.push(tint(place(extrude([[-hw - 0.55, 0], [hw + 0.55, 0], [0, ph]], d + 0.9, { crease: 30 }), 0, h + 0.71, -d / 2), stone));
  parts.push(tint(place(extrude([[-hw + 0.3, 0.14], [hw - 0.3, 0.14], [0, ph - 0.2]], 0.1, { crease: 30 }), 0, h + 0.71, 0.42), wall));
  parts.push(place(mintSeal7({ r: ph * 0.3, seg: detail ? 12 : 8 }), 0, h + 0.71 + ph * 0.42, 0.5));
  // the body of the hall behind, and the dome
  let finial = [0, h + ph, -d];
  if (body > 0) parts.push(bx(w * 0.94, h + 0.6, body, 0, (h + 0.6) / 2 - 0.3, -d - body / 2, wall), bx(w * 0.98, 0.3, body + 0.2, 0, h + 0.45, -d - body / 2, stone));
  if (dome) {
    const dr = w * 0.27, dz = -d - body * 0.5, dy = h + 0.6, prof = [[dr * 1.1, 0], [dr * 1.1, dr * 0.42], [dr, dr * 0.42]];
    for (let i = 0; i <= 5; i++) { const a = (i / 5) * Math.PI / 2; prof.push([dr * Math.cos(a) * 0.98 + 0.001, dr * 0.42 + dr * Math.sin(a) * 0.92]); }
    const dm = lathe(prof, detail ? 12 : 8, { crease: 50 });
    parts.push(place(paint(dm, (x, y) => (y < dr * 0.43 ? stone : roof)), 0, dy, dz));
    const fy = dy + dr * 0.42 + dr * 0.92;
    parts.push(cyl(dr * 0.2, dr * 0.16, dr * 0.3, 6, 0, fy - 0.05, dz, C7.brass), setGlow(cyl(dr * 0.13, dr * 0.13, dr * 0.22, 6, 0, fy + dr * 0.25, dz, '#fff6c8'), 0.8), tint(place(cylinder(dr * 0.22, 0, dr * 0.34, 6), 0, fy + dr * 0.47, dz), C7.brass), cyl(0.04, 0.02, dr * 0.5, 4, 0, fy + dr * 0.8, dz, C7.brass));
    finial = [0, fy + dr * 0.36, dz];
  }
  return keep(merge(parts), { doors: [0, 0, -d + 0.2], hinges: [[-lw, 0, -d + 0.2], [lw, 0, -d + 0.2]], sealAt: [0, doorH * 0.5, -d + 0.34], pediment: [0, h + 0.71 + ph * 0.42, 0.5], finial, lampL: [-doorW / 2 - 0.9, 2.6, -d + 0.5], lampR: [doorW / 2 + 0.9, 2.6, -d + 0.5], top: [0, h + 0.71 + ph, -d / 2] });
}

/**
 * The town climbing the Hill, for the far side of the harbour: terraces of small houses with red roofs ("I didn't know
 * the roofs were red"), one grey row with a line of chimneys (Bench Row), a flat crown for the Mint hall. One far mesh,
 * facing +Z, front edge on z = 0, standing on y = 0.
 * anchors: crown (where the hall stands: the middle of its front edge), bench (the grey row), windows
 */
export function hillTown({ w = 70, d = 30, h = 9, rows: nrows = 4, seed = 1, crownX = 0, crownW = 15, walls = [PAL.cream, '#ffe6c4', '#ffd9c8', '#fff6dc'], terrace = ['#bfe08a', '#e6d2a8'], windows = true } = {}) {
  const r = R(seed), parts = [], wins = [];
  let bench = [0, 0, 0];
  for (let k = 0; k < nrows; k++) {
    const y = h * (k / nrows), z = -d * (k / nrows), rw = w * (1 - 0.13 * k), th = h / nrows + 0.8, top = k === nrows - 1;
    parts.push(tint(place(box(rw, th, d / nrows + 1.4), 0, y - th / 2 + 0.05, z - d / nrows / 2), terrace[k % 2]));
    let x = -rw / 2 + 0.8;
    while (x < rw / 2 - 2.2) {
      const s = 2.3 + r() * 1.9, hh = s * (0.8 + r() * 0.8), cx = x + s / 2, cz = z - 1.2 - r() * (d / nrows - 3);
      if (top && Math.abs(cx - crownX) < crownW / 2 + s / 2) { x += s + 0.3; continue; }                       // the crown is the Mint's
      const grey = top && cx < crownX && cx > crownX - crownW / 2 - 13;
      if (grey) { // Bench Row: one long grey house, a line of chimneys
        const L = 10; parts.push(tint(place(box(L, 3.4, 3.2), cx + L / 2 - s / 2, y + 1.7, cz), '#b9c0e4'), tint(place(extrude([[-L / 2 - 0.3, 0], [L / 2 + 0.3, 0], [L / 2 - 0.5, 1.5], [-L / 2 + 0.5, 1.5]], 3.6, { crease: 30 }), cx + L / 2 - s / 2, y + 3.4, cz), '#7f89c4'));
        for (let i = 0; i < 5; i++) parts.push(tint(place(box(0.5, 1.5, 0.5), cx - s / 2 + 1 + i * 2, y + 5.3, cz), '#d9a48c'));
        bench = [cx + L / 2 - s / 2, y + 3.4, cz]; x += L + 0.6; continue;
      }
      parts.push(tint(place(box(s, hh, s * 0.9), cx, y + hh / 2, cz), walls[Math.floor(r() * walls.length) % walls.length]));
      parts.push(tint(place(cylinder(s * 0.84, 0, s * (0.5 + r() * 0.3), 4), cx, y + hh, cz, 0, 45, 0), C7.roofs[Math.floor(r() * C7.roofs.length) % C7.roofs.length]));
      if (windows) { const g = tint(place(box(s * 0.22, s * 0.28, 0.08), cx + (r() - 0.5) * s * 0.3, y + hh * 0.55, cz + s * 0.46), '#5a78c8'); parts.push(g); wins.push([cx, y + hh * 0.55, cz + s * 0.5]); }
      x += s + 0.3 + r() * 1.1;
    }
    if (k < nrows - 1 && windows) for (let i = 0; i < 3; i++) parts.push(tint(place(sphere(1.3 + r() * 0.8, 6, 4), -rw / 2 + r() * rw, y + 0.8, z - d / nrows + 1.2), i % 2 ? PAL.leaf : PAL.leafDark));
  }
  const cy = h * ((nrows - 1) / nrows), cz = -d * ((nrows - 1) / nrows) - 1.2;
  return keep(setOutline(merge(parts), 0.6), { crown: [crownX, cy, cz], bench, windows: wins, top: [0, h, -d] });
}

/**
 * The lot drum, as kit-b's reads in the drum hall: a teal slatted tumbler with brass hoops on a red timber cradle, a brass
 * hatch at the front. Returns { cradle, drum, hatch, seal } (drum turns about X at anchors.axle; seal = the Audit's wax band
 * over the hatch, in drum space) and anchors { axle, top }.
 */
export function lotDrum7({ r = 0.66, len = 1.3, color = C7.teal, slat = C7.tealDark, metal = C7.brass, wood = C7.woodRed } = {}) {
  const axleY = r + 0.5, hl = len / 2, cradle = [], drum = [], N = 10;
  for (const sx of [-1, 1]) cradle.push(tint(place(extrude([[-r * 0.85, 0], [r * 0.85, 0], [0.13, axleY + 0.1], [-0.13, axleY + 0.1]], 0.12, { crease: 30 }), sx * (hl + 0.2), 0, 0, 0, 90, 0), wood));
  cradle.push(rb(len + 0.8, 0.1, 0.24, 0.03, 0, 0.12, r * 0.6, wood), rb(len + 0.8, 0.1, 0.24, 0.03, 0, 0.12, -r * 0.6, wood));
  cradle.push(tint(tube([[hl + 0.3, axleY, 0], [hl + 0.52, axleY, 0], [hl + 0.52, axleY - 0.3, 0.12], [hl + 0.78, axleY - 0.3, 0.12]], 0.035, 4), metal), ball(0.08, hl + 0.8, axleY - 0.3, 0.12, '#f4573f'));
  for (const sx of [-1, 1]) drum.push(cyl(r, r, 0.08, N, sx * hl - (sx > 0 ? 0.08 : 0), 0, 0, color, 0, 0, -90), tint(place(torus(r, 0.05, N, 3), sx * hl, 0, 0, 0, 0, 90), metal));
  const sw = 2 * r * Math.sin(Math.PI / N) * 0.92;
  for (let k = 0; k < N; k++) { if (k === 0) continue; const a = k * (360 / N); drum.push(place(tint(place(box(len, sw, 0.06), 0, 0, r * 0.97), k % 2 ? color : slat), 0, 0, 0, -a, 0, 0)); }
  drum.push(tint(place(torus(r * 1.0, 0.035, N, 3), 0, 0, 0, 0, 0, 90), metal));
  drum.push(setGlow(tint(place(cylinder(r * 0.5, r * 0.5, len - 0.2, 6), -hl + 0.1, 0, 0, 0, 0, -90), C7.paper), 0.25));
  const hatch = merge(rb(len * 0.66, sw * 1.02, 0.07, 0.02, 0, 0, r * 0.98, C7.brass), ball(0.06, 0, -sw * 0.3, r + 0.06, '#f4573f'));
  const seal = merge(bx(0.13, sw * 1.9, 0.03, 0, 0, r + 0.03, C7.audit), bx(len * 0.9, 0.11, 0.03, 0, 0, r + 0.035, C7.audit), tint(place(cylinder(0.17, 0.15, 0.07, 9), 0, 0, r + 0.04, 90, 0, 0), C7.wax), tint(place(torus(0.1, 0.02, 8, 3), 0, 0, r + 0.115, 90, 0, 0), C7.waxDark));
  return { cradle: merge(cradle), drum: merge(drum), hatch, seal, anchors: { axle: [0, axleY, 0], top: [0, axleY + r, 0] } };
}

/** A tied bundle of fifty slips. */
export function slipBundle({ s = 1 } = {}) {
  return scaleMesh(merge(rb(0.2, 0.09, 0.13, 0.015, 0, 0.045, 0, C7.paper), bx(0.03, 0.095, 0.135, 0, 0.046, 0, C7.wax)), s);
}

/** A toothed brass wheel in the XY plane facing +Z. */
export function ratchet({ r = 0.5, teeth = 10, t = 0.08, color = C7.brass, hub = C7.brassDark } = {}) {
  const pts = [];
  for (let i = 0; i < teeth * 3; i++) { const a = (i / (teeth * 3)) * Math.PI * 2, rr = (i % 3) === 0 ? r : r * 0.8; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
  return merge(tint(extrude(pts, t, { crease: 30 }), color), cyl(r * 0.34, r * 0.34, t * 1.6, 6, 0, 0, -t * 0.8, hub, 90, 0, 0));
}

/**
 * The Reels of Assay with the back toward +Z: what chapter 7 sees. A royal-blue cabinet with an arched head, open at the
 * back onto three brass ratchet wheels on one shaft, each with its pawl ("three wheels, three pawls, and a great deal of
 * honest brass"). Origin: bottom centre.
 * Returns { cabinet, wheel (one wheel: instance it at anchors.wheels, it turns about X), plate (the brass back-plate: origin
 * bottom centre, facing +Z) } and anchors { wheels [3], plateOn (where the plate goes when fitted), plumb (behind the third
 * reel's orb stop: hang plumb() here), lamp (where a hand lamp is held to it), top }.
 */
export function reelWorks({ w = 3.5, h = 2.7, d = 1.15, color = C7.royal, trim = C7.brass, dark = '#232a66', r = 0.6 } = {}) {
  const hw = w / 2, cy = h * 0.56, gap = w / 3.25, parts = [];
  parts.push(rb(w + 0.3, 0.3, d + 0.2, 0.05, 0, 0.15, 0, trim));
  parts.push(bx(w, h - 0.3, 0.12, 0, 0.3 + (h - 0.3) / 2, -d / 2 + 0.06, color));                                   // the front (far side)
  parts.push(bx(w - 0.2, h - 0.5, 0.04, 0, 0.3 + (h - 0.3) / 2, -d / 2 + 0.14, dark));                              // what you see through the works
  for (const sx of [-1, 1]) parts.push(rb(0.2, h - 0.3, d, 0.04, sx * (hw - 0.1), 0.3 + (h - 0.3) / 2, 0, color), rb(0.26, h - 0.2, 0.2, 0.05, sx * (hw + 0.02), 0.3 + (h - 0.3) / 2, d / 2 - 0.08, trim));
  parts.push(bx(w, 0.16, d, 0, h - 0.08, 0, color), bx(w + 0.06, 0.1, d + 0.06, 0, h + 0.03, 0, trim));
  const arch = []; for (let i = 0; i <= 10; i++) { const a = Math.PI * (i / 10); arch.push([Math.cos(a) * hw, Math.sin(a) * h * 0.26]); }
  parts.push(tint(place(extrude([[-hw, 0], ...arch.slice().reverse().slice(1, -1), [hw, 0]], d * 0.86, { crease: 30 }), 0, h + 0.08, 0), color));
  parts.push(tint(place(tube(arch.map((p) => [p[0], p[1], 0]), 0.07, 4, { caps: false }), 0, h + 0.08, d * 0.43), trim));
  // the shaft, its bearings, a pawl over each wheel, a rail of stops, a few idle gears
  parts.push(tint(place(cylinder(0.06, 0.06, w - 0.3, 6), -hw + 0.15, cy, 0.05, 0, 0, -90), '#fff0b0'));
  const wheels = [];
  for (const i of [-1, 0, 1]) {
    const x = i * gap; wheels.push([x, cy, 0.05]);
    parts.push(bx(0.1, cy - 0.3, 0.14, x - gap * 0.44, 0.3 + (cy - 0.3) / 2, 0.05, trim), bar([x + 0.12, cy + r + 0.42, 0.3], [x + 0.05, cy + r * 0.86, 0.3], 0.07, '#ff9a5a'), ball(0.07, x + 0.12, cy + r + 0.42, 0.3, C7.brassDark, 6, 4));
    parts.push(place(ratchet({ r: 0.2, teeth: 7, t: 0.05 }), x + gap * 0.3, cy - r - 0.24, 0.32));
  }
  parts.push(bx(w - 0.3, 0.07, 0.07, 0, cy + r + 0.45, 0.3, trim), bx(w - 0.3, 0.06, 0.06, 0, 0.62, 0.3, C7.brassDark));
  const cabinet = merge(parts);
  // one reel from behind: the eight-sided paper drum, a ratchet on its near cheek, spokes
  const wp = [tint(place(cylinder(r, r, 0.7, 8, { crease: 30 }), -0.35, 0, 0, 0, 0, -90), C7.parchment)];
  wp[0] = place(wp[0], 0, 0, 0, 22.5, 0, 0);
  wp.push(place(ratchet({ r: r * 0.92, teeth: 12, t: 0.07 }), 0.39, 0, 0, 0, 90, 0), place(ratchet({ r: r * 0.5, teeth: 8, t: 0.06, color: '#ff9a5a' }), -0.4, 0, 0, 0, 90, 0));
  for (const sx of [-1, 1]) wp.push(tint(place(torus(r, 0.045, 8, 3), sx * 0.35, 0, 0, 22.5, 0, 90), trim));
  const wheel = merge(wp);
  // the back-plate: brass, studded, with a maker's oval and two lifting handles
  const pw = w - 0.36, ph = h - 0.62, pp = [rb(pw, ph, 0.06, 0.03, 0, ph / 2, 0, trim), rb(pw - 0.3, ph - 0.3, 0.03, 0.02, 0, ph / 2, 0.035, '#ffd870')];
  for (let i = 0; i < 6; i++) for (const sy of [0.1, ph - 0.1]) pp.push(ball(0.04, -pw / 2 + 0.12 + i * ((pw - 0.24) / 5), sy, 0.04, C7.brassDark, 5, 3));
  pp.push(tint(place(cylinder(0.3, 0.3, 0.03, 10), 0, ph * 0.56, 0.04, 90, 0, 0, 1, 1, 0.6), C7.navy));
  for (const sx of [-1, 1]) pp.push(tint(place(torus(0.1, 0.022, 7, 3), sx * pw * 0.34, ph * 0.5, 0.07, 90, 0, 0), C7.brassDark));
  return { cabinet, wheel, plate: merge(pp), anchors: { wheels, plateOn: [0, 0.34, d / 2 - 0.04], plumb: [gap + 0.22, cy - 0.1, 0.36], lamp: [gap * 0.4, cy - 0.2, 0.9], top: [0, h + h * 0.26, 0], r } };
}

/** The plumb-weight: a lump of lead the size of a plum on a wire. Origin: where the wire is made fast; it hangs down. */
export function plumb({ drop = 0.34, s = 1 } = {}) {
  return merge(noInk(cyl(0.008, 0.008, drop, 3, 0, -drop, 0, '#dfe6ff')), tint(place(lathe([[0, -0.16], [0.06, -0.12], [0.075, -0.05], [0.04, 0.0], [0, 0.02]], 7, { crease: 180 }), 0, -drop, 0, 0, 0, 0, s), C7.lead));
}

// ------------------------------------------------------------------------------------ Nan's stall by day

/** A bare lantern frame, hanging from its hook at the origin: two hoops and four bent ribs. Unlined, for instancing. */
export function lanternFrame({ r = 0.16, shape = 'round', color = C7.bamboo, cord = 0.07 } = {}) {
  const H = shape === 'tall' ? r * 2.6 : r * 1.85, y1 = -cord, parts = [cyl(0.006, 0.006, cord, 3, 0, -cord, 0, '#3a3560')];
  parts.push(tint(place(torus(r * 0.45, 0.012, 6, 3), 0, y1, 0), color), tint(place(torus(r * 0.42, 0.012, 6, 3), 0, y1 - H, 0), color));
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4, c = Math.cos(a), s = Math.sin(a), rr = shape === 'tall' ? r * 0.82 : r;
    parts.push(tint(tube(curve([[c * r * 0.45, y1, s * r * 0.45], [c * rr, y1 - H * 0.3, s * rr], [c * rr, y1 - H * 0.7, s * rr], [c * r * 0.42, y1 - H, s * r * 0.42]], 5), 0.009, 3, { caps: false, crease: 180 }), color));
  }
  parts.push(tint(place(torus(shape === 'tall' ? r * 0.82 : r, 0.009, 8, 3), 0, y1 - H / 2, 0), color));
  return keep(noInk(merge(parts)), { centre: [0, y1 - H / 2, 0] });
}

/** The paste pot, with its brush standing in it. */
export function pastePot({ s = 1 } = {}) {
  return scaleMesh(merge(tint(lathe([[0, 0], [0.11, 0], [0.14, 0.08], [0.13, 0.2], [0.1, 0.24], [0.11, 0.27], [0.09, 0.27], [0.08, 0.22], [0, 0.22]], 8, { crease: 50 }), '#5b7fe8'),
    cyl(0.085, 0.085, 0.02, 8, 0, 0.215, 0, '#fffaf0'), cyl(0.014, 0.018, 0.3, 4, 0.02, 0.2, 0, C7.wood, 0, 0, -22), cyl(0.03, 0.02, 0.07, 5, 0.01, 0.16, 0, '#fff0c0', 0, 0, -22)), s);
}

/** A stack of cut lantern paper, a few coloured sheets fanned on top. */
export function paperStack({ n = 5, seed = 1, colors = PAL.lanterns } = {}) {
  const r = R(seed), parts = [];
  for (let i = 0; i < n; i++) parts.push(noInk(bx(0.42, 0.012, 0.3, (r() - 0.5) * 0.05, 0.008 + i * 0.013, (r() - 0.5) * 0.05, colors[Math.floor(r() * colors.length) % colors.length], 0, (r() - 0.5) * 30, 0)));
  return merge(parts);
}

// ------------------------------------------------------------------------------------ rooms

/**
 * A wall run `w` wide and `h` high with openings, as kit-b's wall(): origin bottom centre of the room face (it faces +Z),
 * the wall goes back `t`. openings [{ x, w, sill (0 = doorway), top, arch }].
 */
export function wall7({ w = 10, h = 5, t = 0.3, color = C7.peach, openings = [] } = {}) {
  const parts = [], ops = [...openings].sort((a, b) => a.x - b.x); let cur = -w / 2;
  const solid = (x0, x1) => { if (x1 - x0 > 0.001) parts.push(place(box(x1 - x0, h, t), (x0 + x1) / 2, h / 2, -t / 2)); };
  for (const o of ops) {
    const l = o.x - o.w / 2, rgt = o.x + o.w / 2, sill = o.sill || 0;
    solid(cur, l);
    if (sill > 0) parts.push(place(box(o.w, sill, t), o.x, sill / 2, -t / 2));
    if (o.arch) {
      const rise = Math.min(o.w / 2, o.top - sill - 0.05), spring = o.top - rise, pts = [];
      for (let i = 0; i <= 8; i++) { const a = Math.PI * (1 - i / 8); pts.push([o.x + Math.cos(a) * o.w / 2, spring + Math.sin(a) * rise]); }
      parts.push(place(extrude([...pts, [rgt, h], [l, h]], t, { crease: 30 }), 0, 0, -t / 2));
    } else if (h - o.top > 0.001) parts.push(place(box(o.w, h - o.top, t), o.x, (h + o.top) / 2, -t / 2));
    cur = rgt;
  }
  solid(cur, w / 2);
  return tint(merge(parts), color);
}

/**
 * What fills a tall arched window: a frame, glazing bars, a fan of coloured glowing panes in the head, and (shut: true)
 * a pair of closed shutters below it with a bright slit between them. Origin: centre of the sill line, facing +Z.
 */
export function tallWindow({ w = 1.7, h = 3.9, color = C7.plumDark, fan = ['#ff7448', '#ffd65a', '#7fe6d2', '#ff8fb4'], glow = 0.85, shut = true, shutter = C7.teal, sky = '#bfe6ff' } = {}) {
  const hw = w / 2, rise = hw, spring = h - rise, parts = [], t = 0.1;
  for (const sx of [-1, 1]) parts.push(bx(t, spring, 0.3, sx * (hw - 0.03), spring / 2, -0.1, color));
  const arc = []; for (let i = 0; i <= 10; i++) { const a = Math.PI * (1 - i / 10); arc.push([Math.cos(a) * (hw - 0.03), spring + Math.sin(a) * (rise - 0.03), -0.1]); }
  parts.push(tint(tube(arc, 0.07, 4, { caps: false }), color), rb(w + 0.34, 0.1, 0.46, 0.03, 0, -0.04, 0, color), bx(w, 0.07, 0.07, 0, spring, -0.16, color));
  const n = fan.length;
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI * (1 - i / n), a1 = Math.PI * (1 - (i + 1) / n), k = rise - 0.14;
    parts.push(setGlow(tint(place(extrude([[0, 0.06], [Math.cos(a0) * k, 0.06 + Math.sin(a0) * k], [Math.cos((a0 + a1) / 2) * k, 0.06 + Math.sin((a0 + a1) / 2) * k], [Math.cos(a1) * k, 0.06 + Math.sin(a1) * k]], 0.03, { crease: 30 }), 0, spring, -0.18), fan[i]), glow));
    if (i > 0) parts.push(bar([0, spring + 0.04, -0.16], [Math.cos(a0) * k, spring + 0.06 + Math.sin(a0) * k, -0.16], 0.05, color));
  }
  if (shut) {
    for (const sx of [-1, 1]) { parts.push(rb(hw - 0.1, spring - 0.1, 0.06, 0.02, sx * (hw / 2 - 0.0), spring / 2, -0.17, shutter)); for (let k = 0; k < 4; k++) parts.push(bx(hw - 0.3, 0.05, 0.03, sx * hw / 2, spring * (0.16 + k * 0.22), -0.13, C7.tealDark)); }
    parts.push(noInk(setGlow(bx(0.05, spring - 0.14, 0.02, 0, spring / 2, -0.18, '#fff6c8'), 1)));
  } else {
    parts.push(noInk(setGlow(bx(w - 0.1, spring, 0.02, 0, spring / 2, -0.22, sky), 0.9)));
    for (const x of [-hw / 3, hw / 3]) parts.push(bx(0.05, spring, 0.05, x, spring / 2, -0.16, color));
    parts.push(bx(w, 0.05, 0.05, 0, spring * 0.5, -0.16, color));
  }
  return merge(parts);
}

/**
 * Light slanting in through an opening, as additive cards (the technique of kit-b's shaftCards). Origin: the centre of the
 * opening; the light travels along `dir` for `len`. Use a 'beam' material; vertex colour is the light's colour.
 */
export function lightCards({ w = 1.4, h = 2.4, dir = [0.3, -1, 1], len = 5, cards = 3, color = '#ffd890', spread = 0.25, across = 'y' } = {}) {
  const l = Math.hypot(dir[0], dir[1], dir[2]), dv = [dir[0] / l * len, dir[1] / l * len, dir[2] / l * len], parts = [];
  for (let i = 0; i < cards; i++) {
    const t = cards === 1 ? 0.5 : i / (cards - 1), k = 1 + spread;
    let pos;
    if (across === 'y') { const y = (t - 0.5) * h * 0.8; pos = [-w / 2, y, 0, w / 2, y, 0, -w / 2 * k + dv[0], y + dv[1], dv[2], w / 2 * k + dv[0], y + dv[1], dv[2]]; }
    else { const x = (t - 0.5) * w * 0.8; pos = [x, h / 2, 0, x, -h / 2, 0, x * k + dv[0], h / 2 * k + dv[1], dv[2], x * k + dv[0], -h / 2 + dv[1], dv[2]]; }
    parts.push(fromArrays(pos, [0, 2, 3, 0, 3, 1, 0, 3, 2, 0, 1, 3], [0, 0, 1, 0, 0, 1, 1, 1], 180));
  }
  return noInk(tint(merge(parts), color));
}

/** A bright quadrilateral lying on the floor (the light a doorway or a hatch throws): corners [[x, z] x 4], glowing, unlined. */
export function floorPatch(corners, { color = '#ffe2a0', glow = 0.6, y = 0.008 } = {}) {
  const p = []; for (const c of corners) p.push(c[0], y, c[1]);
  return noInk(setGlow(tint(fromArrays(p, [0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2], null, 180), color), glow));
}

/** A chequered floor, centred, top at y = 0: single quads in two colours, unlined. */
export function tiles({ w = 12, d = 10, nx = 12, nz = 10, colors = ['#ffeccb', '#ffb9a2'] } = {}) {
  const parts = [[], []], tw = w / nx, td = d / nz;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) parts[(i + j) % 2].push(place(plane(tw, td), -w / 2 + tw * (i + 0.5), 0, -d / 2 + td * (j + 0.5)));
  return noInk(merge(tint(merge(parts[0]), colors[0]), tint(merge(parts[1]), colors[1])));
}

/** A ring of candles on a chain. Origin: the ceiling hook. anchors: lamp */
export function chandelier7({ drop = 1.6, r = 0.8, arms = 6, metal = C7.brass, glass = '#ffe6a0', lit = true } = {}) {
  const parts = [cyl(0.016, 0.016, drop - 0.3, 4, 0, -drop + 0.3, 0, metal), tint(place(torus(r, 0.04, Math.max(8, arms * 2), 3), 0, -drop, 0), metal), ball(0.1, 0, -drop + 0.3, 0, metal)];
  for (let i = 0; i < arms; i++) {
    const a = (i / arms) * Math.PI * 2, x = Math.sin(a) * r, z = Math.cos(a) * r;
    parts.push(bar([0, -drop + 0.3, 0], [x, -drop, z], 0.025, metal), cyl(0.026, 0.026, 0.14, 4, x, -drop + 0.04, z, C7.paper));
    const f = tint(place(ellipsoid(0.035, 0.07, 0.035, 5, 3), x, -drop + 0.25, z), lit ? glass : '#c9d2f4'); parts.push(lit ? setGlow(f, 1) : f);
  }
  return keep(merge(parts), { lamp: [0, -drop + 0.2, 0] });
}

// ------------------------------------------------------------------------------------ below decks

/**
 * The inside of a ship's side: `len` along X, `h` high, leaning outward toward the top, planked in two paints with a white
 * Audit strake, ribs every `bay`, and round ports. Origin: the foot of the wall, centre; the room is toward +Z.
 * anchors: ports [centres]
 */
export function hullSide({ len = 11, h = 2.5, lean = 0.5, bay = 1.5, ports = [-2.6, 2.6], lower = '#2d8fa8', upper = '#f6e6c4', strake = '#fffaf0', rib = '#c8643e' } = {}) {
  const parts = [], n = 7, ph = h / n, zAt = (y) => -lean * Math.pow(y / h, 1.6), anchors = [];
  for (let i = 0; i < n; i++) {
    const y0 = i * ph, y1 = y0 + ph, z0 = zAt(y0), z1 = zAt(y1), tilt = Math.atan2(z0 - z1, ph) / DEG;
    parts.push(tint(place(box(len, Math.hypot(ph, z1 - z0) - 0.015, 0.1), 0, (y0 + y1) / 2, (z0 + z1) / 2 - 0.05, tilt, 0, 0), i === 3 ? strake : i < 3 ? (i % 2 ? lower : '#2a7f9c') : (i % 2 ? upper : '#ffd9a8')));
  }
  for (let x = -len / 2 + bay * 0.5; x < len / 2; x += bay) { const pts = []; for (let k = 0; k <= 5; k++) { const y = h * (k / 5); pts.push([x, y, zAt(y) + 0.07]); } parts.push(tint(tube(pts, 0.085, 4, { crease: 180 }), rib)); }
  for (const x of ports) {
    const y = h * 0.66, z = zAt(y) + 0.04;
    parts.push(tint(place(torus(0.26, 0.055, 10, 4), x, y, z, 90, 0, 0), C7.brass), noInk(setGlow(tint(place(cylinder(0.23, 0.23, 0.03, 10), x, y, z - 0.02, 90, 0, 0), '#3f78e0'), 0.85)), bx(0.5, 0.03, 0.03, x, y, z + 0.02, C7.brass), bx(0.03, 0.5, 0.03, x, y, z + 0.02, C7.brass));
    anchors.push([x, y, z]);
  }
  return keep(merge(parts), { ports: anchors });
}

/** The deck overhead: planks across a `w` x `d` area with fat beams running fore and aft, and a square hatch cut in it. Origin: centre of its underside. */
export function deckHead({ w = 11, d = 5, beams = 6, hatch = null, plank = '#e0a060', beam = '#c8643e' } = {}) {
  const parts = [];
  if (!hatch) parts.push(bx(w, 0.12, d, 0, 0.06, 0, plank));
  else {
    const [hx, hz, hw, hd] = hatch;
    parts.push(bx(hx - hw / 2 + w / 2, 0.12, d, (-w / 2 + hx - hw / 2) / 2, 0.06, 0, plank), bx(w / 2 - hx - hw / 2, 0.12, d, (w / 2 + hx + hw / 2) / 2, 0.06, 0, plank));
    parts.push(bx(hw, 0.12, hz - hd / 2 + d / 2, hx, 0.06, (-d / 2 + hz - hd / 2) / 2, plank), bx(hw, 0.12, d / 2 - hz - hd / 2, hx, 0.06, (d / 2 + hz + hd / 2) / 2, plank));
    for (const sx of [-1, 1]) parts.push(bx(0.12, 0.22, hd + 0.24, hx + sx * (hw / 2 + 0.06), 0.02, hz, beam));
    for (const sz of [-1, 1]) parts.push(bx(hw, 0.22, 0.12, hx, 0.02, hz + sz * (hd / 2 + 0.06), beam));
  }
  for (let i = 0; i < beams; i++) { const x = -w / 2 + (w * (i + 0.5)) / beams; if (hatch && Math.abs(x - hatch[0]) < hatch[2] / 2 + 0.2) continue; parts.push(rb(0.24, 0.26, d, 0.04, x, -0.13, 0, beam, 0, 0, (i % 2 ? 1 : -1) * 1.5)); }
  return merge(parts);
}

/**
 * The barred front of a berth: `w` wide, `h` high, in the XY plane, bars toward the viewer at +Z. A door bay with a brass
 * lock plate takes the `door` end (-1 left, +1 right). Origin: bottom centre.
 */
export function cellFront({ w = 2.7, h = 2.3, gap = 0.3, door = 1, iron = C7.navy, brass = C7.brass, r = 0.026 } = {}) {
  const parts = [rb(w, 0.12, 0.14, 0.03, 0, 0.06, 0, iron), rb(w, 0.12, 0.14, 0.03, 0, h - 0.06, 0, iron), rb(w - 0.1, 0.07, 0.08, 0.02, 0, h * 0.5, 0, iron)];
  const n = Math.round(w / gap);
  for (let i = 0; i <= n; i++) { const x = -w / 2 + 0.05 + (w - 0.1) * (i / n); parts.push(cyl(r, r, h - 0.2, 5, x, 0.1, 0, iron)); }
  const dx = door * (w / 2 - 0.55);
  for (const sx of [-1, 1]) parts.push(rb(0.09, h - 0.2, 0.1, 0.02, dx + sx * 0.5, h / 2, 0.01, iron));
  parts.push(rb(0.22, 0.3, 0.1, 0.03, dx - door * 0.42, h * 0.46, 0.06, brass), ball(0.035, dx - door * 0.42, h * 0.43, 0.12, iron, 5, 3));
  return merge(parts);
}

/** A berth: a plank bed on two chains off the wall behind it, a rolled blanket, a thin pillow. Origin: the middle of its back edge at floor level; it sticks out toward +Z. */
export function bunk({ w = 1.9, d = 0.72, y = 0.5, blanket = C7.wine, wood = '#e0a060' } = {}) {
  const parts = [rb(w, 0.09, d, 0.02, 0, y, d / 2, wood), rb(w - 0.1, 0.1, d - 0.08, 0.04, 0, y + 0.09, d / 2, '#fff0d4'), tint(place(cylinder(0.13, 0.13, d - 0.1, 7), w / 2 - 0.3, y + 0.27, 0.05, 90, 0, 0), blanket), rb(0.42, 0.1, 0.34, 0.04, -w / 2 + 0.32, y + 0.19, d / 2, '#dfe8ff')];
  for (const sx of [-1, 1]) parts.push(noInk(bar([sx * (w / 2 - 0.08), y, d - 0.06], [sx * (w / 2 - 0.08), y + 1.0, 0.02], 0.025, C7.navy)));
  return merge(parts);
}

/** A ship's lantern hanging from its hook at the origin: brass cage, glowing glass. It swings: give it its own node. anchors: lamp */
export function shipLantern({ drop = 0.5, s = 1, glass = '#ffe6a0', metal = C7.brass } = {}) {
  const y = -drop, parts = [noInk(cyl(0.012, 0.012, drop - 0.1, 3, 0, y + 0.1, 0, metal)), tint(place(torus(0.05, 0.014, 6, 3), 0, y + 0.1, 0, 90, 0, 0), metal)];
  parts.push(tint(place(cylinder(0.05, 0.13, 0.1, 6), 0, y - 0.02, 0), metal), setGlow(tint(place(cylinder(0.11, 0.095, 0.24, 6), 0, y - 0.26, 0), glass), 1), tint(place(cylinder(0.13, 0.09, 0.07, 6), 0, y - 0.33, 0), metal));
  for (let k = 0; k < 3; k++) { const a = k * 2.094; parts.push(noInk(cyl(0.01, 0.01, 0.26, 3, Math.cos(a) * 0.12, y - 0.27, Math.sin(a) * 0.12, metal))); }
  return keep(scaleMesh(merge(parts), s), { lamp: [0, (y - 0.14) * s, 0] });
}

/** A companion ladder leaning back: `h` high, foot at the origin, top `run` toward -Z. */
export function ladder7({ h = 2.6, w = 0.62, run = 0.9, rungs = 6, color = '#c8643e' } = {}) {
  const parts = [];
  for (const sx of [-1, 1]) parts.push(bar([sx * w / 2, 0, 0], [sx * w / 2, h, -run], 0.08, color, 0.1));
  for (let i = 1; i <= rungs; i++) { const t = i / (rungs + 1); parts.push(rb(w + 0.04, 0.05, 0.2, 0.015, 0, h * t, -run * t, '#f0b574')); }
  return merge(parts);
}

/** A sea chest with brass corners and a rope handle. */
export function seaChest({ w = 0.8, h = 0.44, d = 0.46, color = C7.teal, metal = C7.brass } = {}) {
  const parts = [rb(w, h * 0.72, d, 0.04, 0, h * 0.36, 0, color), tint(place(cylinder(d / 2, d / 2, w, 8), -w / 2, h * 0.7, 0, 0, 0, -90, 1, 0.5, 1), color), bx(w + 0.02, 0.05, d + 0.02, 0, h * 0.7, 0, metal), rb(0.12, 0.14, 0.04, 0.02, 0, h * 0.62, d / 2 + 0.01, metal)];
  for (const sx of [-1, 1]) parts.push(bx(0.06, h * 0.74, d + 0.02, sx * (w / 2 - 0.05), h * 0.37, 0, metal));
  return merge(parts);
}

export { m4, quat };
