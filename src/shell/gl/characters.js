// The cast as toon figures: a parametric chibi body, hair and costume built from pieces, a face of
// decals (faces.js) with 3D brows, and the animation that keeps them alive.
// Pure apart from the face atlas: without `faces` a character is built faceless (node, tests).
//
//   const faces = createFaces();                       // once, shell only (needs a canvas)
//   const ren = createCharacter(CAST.ren, { faces });  // CAST: ren, ilse, nan, bailiff
//   scene.root.add(ren.root); ren.root.setPos(x, 0, z);
//   ren.update(dt, { emote: 'smile', speaking: true, pose: 'stand', look: 'camera' | [x, y, z] | other.headPos, face: [x, y, z] | yawDeg, camera });
//   ren.act('strike');                                 // one-shot clips, see CLIPS
//
// A character is ONE batched draw (+ outline + shadow) and four face decals (five while an emote
// shows an overlay). Everything a def can ask for is listed above CAST at the bottom of this file.

import { v3, m4, quat, DEG, rgb, rng } from './math.js';
import {
  sphere, ellipsoid, superellipsoid, blob, cylinder, cone, lathe, limb, torus, roundedBox, curve, fromArrays,
  merge, tint, place, setGlow, setOutline, mirrorX, scale as scaleMesh, vertexCount,
} from './mesh.js';
import { Node, node, group, material, makeLight, batchFigure, nodeBounds } from './scene.js';
import { createRig, idle, blink, createSpring, addRot, aimAxis } from './rig.js';
import { EMOTES, EMOTE, FACE } from './faces.js';

export { EMOTES };

const mixc = (a, b, t) => { const x = rgb(a), y = rgb(b); return [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]; };
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const smooth = (t) => { const x = t < 0 ? 0 : t > 1 ? 1 : t; return x * x * (3 - 2 * x); };
const approach = (a, b, k) => a + (b - a) * (k > 1 ? 1 : k);

/** The material every figure shares. Characters take no cast shadows: at chibi scale a shadow-map edge across a face is noise. */
export function figureMaterial(opts = {}) {
  return material({ name: 'figure', bandEdge: 0.02, receiveShadow: false, outline: { width: 2.3, self: 0.62, color: '#1d2146' }, ...opts });
}

// ------------------------------------------------------------------------------------ geometry helpers

/**
 * A lock, spike, brow or ribbon: a tube along `path` whose cross-section is `w(t)` wide across and
 * `th(t)` thick along `ref` (by default away from the origin, so hair lies flat on a head centred there).
 */
function strand(path, w, th, seg = 8, ref = null, ink = null) {
  const n = path.length, pos = [], idx = [];
  for (let i = 0; i < n; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)], p = path[i];
    const T = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    let R = ref || p; const d = R[0] * T[0] + R[1] * T[1] + R[2] * T[2];
    R = [R[0] - T[0] * d, R[1] - T[1] * d, R[2] - T[2] * d];
    if (Math.hypot(R[0], R[1], R[2]) < 1e-5) R = Math.abs(T[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    R = norm(R);
    const S = [T[1] * R[2] - T[2] * R[1], T[2] * R[0] - T[0] * R[2], T[0] * R[1] - T[1] * R[0]];
    const t = i / (n - 1), ww = w(t), tt = th(t);
    for (let j = 0; j < seg; j++) { const an = (j / seg) * Math.PI * 2, c = Math.cos(an) * ww, s = Math.sin(an) * tt; pos.push(p[0] + S[0] * c + R[0] * s, p[1] + S[1] * c + R[1] * s, p[2] + S[2] * c + R[2] * s); }
  }
  const c0 = pos.length / 3; pos.push(...path[0], ...path[n - 1]);
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) { const a = i * seg + j, b = i * seg + (j + 1) % seg, c = a + seg, e = b + seg; idx.push(a, c, b, b, c, e); }
  for (let j = 0; j < seg; j++) { idx.push(c0, j, (j + 1) % seg); idx.push(c0 + 1, (n - 1) * seg + (j + 1) % seg, (n - 1) * seg + j); }
  const m = fromArrays(pos, idx, null, 180);
  // ink(t): outline width along the strand. Locks that lie on a head keep ink only toward their free tips,
  // or every lock is ringed by a dark crease and the hair reads as a ridged helmet.
  if (ink) { for (let i = 0; i < n; i++) { const k = ink(i / (n - 1)); for (let j = 0; j < seg; j++) m.owidth[i * seg + j] = k; } m.owidth[c0] = ink(0); m.owidth[c0 + 1] = ink(1); }
  return m;
}
const tipInk = (t) => 0.12 + 0.88 * smooth((t - 0.45) / 0.45);

// the fat-then-pointed profile of a hair lock
const lockW = (r) => (t) => r * Math.sin(Math.min(1, t * 1.7 + 0.3) * Math.PI * 0.5) * (1 - t * t * 0.93) + 0.003;

/** The head's shape, and helpers that put things on its surface. Coordinates are relative to the head's centre. */
function makeHead(R) {
  const shape = (p) => { // p: a unit direction, turned in place into a point on the head
    const y = p[1], c = (y + 0.36) / 0.66, cheek = c > -1 && c < 1 ? (1 - c * c) : 0, k = 1 + 0.085 * cheek;
    p[0] *= R[0] * k; p[1] = (y < -0.4 ? -0.4 + (y + 0.4) * 0.84 : y) * R[1]; p[2] *= R[2] * (1 + 0.05 * cheek * (p[2] > 0 ? 1 : 0.4));
    return p;
  };
  // the surface normal at yaw/pitch, from the shape itself: the skull and every decal on it use this,
  // so a decal's terminator falls exactly where the skin's does
  // On the face the shading normal is NOT the surface's: it is pulled toward a rounder, flatter, forward-facing one,
  // so the light's terminator crosses a cheek as one clean curve and never cuts through an eye or eats a mouth corner
  // (the squashed chin of a chibi head otherwise turns straight down into shadow under the lower lip).
  const normalAt = (yaw, pitch) => {
    const p = at(yaw, pitch), a = at(yaw + 0.6, pitch), b = at(yaw, pitch + 0.6);
    const u = [a[0] - p[0], a[1] - p[1], a[2] - p[2]], v = [b[0] - p[0], b[1] - p[1], b[2] - p[2]];
    const g = norm([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
    let ya = ((yaw + 180) % 360 + 360) % 360 - 180;
    const wgt = (1 - smooth((Math.abs(ya) - 46) / 40)) * (1 - smooth((pitch - 22) / 30)) * (1 - smooth((-pitch - 58) / 22)) * 0.8;
    if (wgt <= 0.001) return g;
    const fy = ya * 0.62 * DEG, fp = (pitch * 0.42 + 7) * DEG, f = [Math.sin(fy) * Math.cos(fp), Math.sin(fp), Math.cos(fy) * Math.cos(fp)];
    return norm([g[0] + (f[0] - g[0]) * wgt, g[1] + (f[1] - g[1]) * wgt, g[2] + (f[2] - g[2]) * wgt]);
  };
  const at = (yaw, pitch, r = 1) => { const a = yaw * DEG, b = pitch * DEG, p = shape([Math.sin(a) * Math.cos(b), Math.sin(b), Math.cos(a) * Math.cos(b)]); p[0] *= r; p[1] *= r; p[2] *= r; return p; };
  /** A decal patch lying on the head: centre yaw/pitch, angular width/height. flipU mirrors the texture. */
  const patch = (yaw, pitch, w, h, lift = 0.014, seg = 6, flipU = false) => {
    const pos = [], uv = [], idx = [], nrm = [], s = seg + 1;
    for (let j = 0; j <= seg; j++) for (let i = 0; i <= seg; i++) {
      const ya = yaw + (i / seg - 0.5) * w, pi = pitch + (0.5 - j / seg) * h, p = at(ya, pi, 1 + lift);
      pos.push(p[0], p[1], p[2]); uv.push(flipU ? 1 - i / seg : i / seg, j / seg); nrm.push(...normalAt(ya, pi));
    }
    for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) { const a = j * s + i, b = a + 1, c = a + s, e = c + 1; idx.push(a, c, e, a, e, b); }
    const m = setOutline(fromArrays(pos, idx, uv, 180), 0);
    m.normals.set(nrm); m.onormals.set(nrm);
    return m;
  };
  return { R, shape, at, patch, normalAt };
}

/**
 * The hair's main mass: a shell just outside the skull whose lower edge is the hairline.
 * front / side / back are the hairline's height (unit-sphere y: 1 crown, 0 ear level, -1 chin) dead
 * ahead, at the ears and at the nape; grow is the shell's size over the skull, shift moves it.
 */
function hairCap(hd, { front = 0.42, side = -0.05, back = -0.7, sideAt = 0.34, backAt = 0.72, zig = 0, zigN = 3, grow = [1.07, 1.09, 1.08], shift = [0, 0.01, -0.012], seg = 28, rings = 18, under = [0.955, 0.9], underY = [0.012, 0.06] } = {}) {
  // a grid from the crown (row 0) down each meridian to the hairline, then two rows folded back
  // under the edge to give it thickness. The edge is the hairline itself, so it is as smooth as the function.
  const pos = [], idx = [], rows = Math.max(6, Math.round(rings * 0.62)), p = [0, 0, 0];
  const lineAt = (ang) => {
    const a = Math.abs(ang) / Math.PI;
    let line = a < sideAt ? front + (side - front) * smooth((a - 0.1) / (sideAt - 0.1)) : side + (back - side) * smooth((a - sideAt) / (backAt - sideAt));
    if (zig) line += zig * Math.abs((((ang * zigN + 0.4) % 1) + 1) % 1 - 0.5) * 2 * (1 - smooth((a - 0.2) / 0.3));
    return line;
  };
  const put = (ang, y, k) => { const r = Math.sqrt(Math.max(0, 1 - y * y)); p[0] = Math.sin(ang) * r; p[1] = y; p[2] = Math.cos(ang) * r; hd.shape(p); pos.push(p[0] * grow[0] * k + shift[0], p[1] * grow[1] * (0.5 + 0.5 * k) + shift[1], p[2] * grow[2] * k + shift[2]); };
  for (let i = 0; i < seg; i++) {
    const ang = (i / seg) * Math.PI * 2 - Math.PI, line = lineAt(ang);
    for (let j = 1; j <= rows; j++) { const v = j / rows, e = Math.sin(v * Math.PI / 2); put(ang, 1 - e * (1 - line) * 1.0 + (1 - e) * 0, 1); }
    put(ang, line + underY[0], under[0]); put(ang, line + underY[1], under[1]);
  }
  const R = rows + 2, top = pos.length / 3; p[0] = 0; p[1] = 1; p[2] = 0; hd.shape(p); pos.push(p[0] * grow[0] + shift[0], p[1] * grow[1] + shift[1], p[2] * grow[2] + shift[2]);
  for (let i = 0; i < seg; i++) {
    const a = i * R, b = ((i + 1) % seg) * R;
    idx.push(top, a, b);
    for (let j = 0; j < R - 1; j++) idx.push(a + j, a + j + 1, b + j, b + j, a + j + 1, b + j + 1);
  }
  const m = fromArrays(pos, idx, null, 180);
  m.foldRows = [rows, R, seg]; // the two rows under the edge, for hoods that line them dark
  return m;
}

/** A lock lying on the head through [yaw, pitch, radiusFactor] points. Inked only toward its tip unless `ink` says otherwise. */
function lockOn(hd, pts, width, { thick = 0.42, n = 10, seg = 8, ink = tipInk } = {}) {
  const w = lockW(width);
  return strand(curve(pts.map((q) => hd.at(q[0], q[1], q[2] ?? 1.04)), n), w, (t) => w(t) * thick + 0.002, seg, null, ink);
}
/** A spike growing out of the head at yaw/pitch, bent along `sweep`. */
function spikeOn(hd, yaw, pitch, len, width, sweep = [0, 0, 0], { thick = 0.7, seg = 7, root = 0.86 } = {}) {
  const p0 = hd.at(yaw, pitch, root), n0 = norm(p0);
  const d = norm([n0[0] + sweep[0], n0[1] + sweep[1], n0[2] + sweep[2]]);
  const d2 = norm([d[0] + sweep[0] * 0.7, d[1] + sweep[1] * 0.7, d[2] + sweep[2] * 0.7]);
  const p1 = [p0[0] + d[0] * len * 0.5, p0[1] + d[1] * len * 0.5, p0[2] + d[2] * len * 0.5];
  const p2 = [p1[0] + d2[0] * len * 0.5, p1[1] + d2[1] * len * 0.5, p1[2] + d2[2] * len * 0.5];
  const w = (t) => width * (1 - t * t) * (0.62 + 0.38 * (1 - t)) + 0.003;
  return strand(curve([p0, p1, p2], 6), w, (t) => w(t) * thick, seg);
}

/** A lathe whose bands each keep their own colour (crisp stripes): rows = [[r, y, colour of the band above]...]. */
function bands(rows, seg, zScale = 1) {
  const parts = [];
  for (let i = 0; i < rows.length - 1; i++) parts.push(tint(lathe([[rows[i][0], rows[i][1]], [rows[i + 1][0], rows[i + 1][1]]], seg, { crease: 180 }), rows[i][2]));
  const m = merge(parts);
  return zScale === 1 ? m : scaleMesh(m, 1, 1, zScale);
}

// ------------------------------------------------------------------------------------ hair pieces

/**
 * HAIR[kind](hd, spec, ctx) -> { fixed: [meshes], swing: [{ name, mesh, pos, parent?, spring }] }
 * `fixed` meshes are welded to the head; `swing` pieces become spring bones (pos is relative to the
 * head's centre, or to `parent`, another swing piece, for chains). Meshes come back untinted unless
 * a piece has its own colours; ctx = { color, dark, S(n) segment count for the detail level }.
 */
export const HAIR = {
  cap(hd, s, ctx) { return { fixed: [hairCap(hd, { ...s, seg: ctx.S(28), rings: ctx.S(18) })] }; },

  /**
   * A row of pointed tufts across the brow, growing from a parting: { n, from, to (yaw of the first and last tip),
   * top (pitch of the roots), tip (pitch of the tips), tips: [pitch per tuft], jag (every other tip this much higher),
   * sweep (yaw the tips are combed across by), part (yaw of the parting), gather (0 roots all at the parting .. 1 straight down), w | ws, r, tipR }.
   */
  fringe(hd, s, ctx) {
    const n = s.n || 5, from = s.from ?? -52, to = s.to ?? 52, top = s.top ?? 62, tip = s.tip ?? 17, jag = s.jag ?? 6, sweep = s.sweep ?? 0, part = s.part ?? 0, r = s.r ?? 1.115;
    const space = Math.abs(to - from) / Math.max(1, n - 1) * DEG * hd.R[0] * 1.05, fixed = [];
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0.5 : i / (n - 1), yaw = from + (to - from) * u, tp = s.tips ? s.tips[i] : tip + (i % 2 ? jag : 0);
      const y0 = part + (yaw - part) * (s.gather ?? 0.4), w = (s.ws ? s.ws[i] : s.w) ?? space * 0.66;
      fixed.push(lockOn(hd, [[y0, top, 1.03], [y0 + (yaw - y0) * 0.55, top - (top - tp) * 0.42, r], [yaw + sweep * 0.55, tp + (top - tp) * 0.2, r], [yaw + sweep, tp, s.tipR ?? 1.075]], w, { thick: s.thick ?? 0.5, n: ctx.N(9), seg: ctx.S(8) }));
    }
    return { fixed };
  },

  /** Locks that hang free in front of the ears and sway: { side 'L' | 'R' | both, yaw, top (pitch), length, w, out, curl, swing: false to weld them }. */
  sidelocks(hd, s, ctx) {
    const swing = [], fixed = [], sides = s.side === 'L' ? [1] : s.side === 'R' ? [-1] : [1, -1], L = s.length ?? 0.2, w = lockW(s.w ?? 0.045);
    for (const sx of sides) {
      const p0 = hd.at(sx * (s.yaw ?? 64), s.top ?? 18, s.r ?? 1.06), out = s.out ?? 0.012, curl = s.curl ?? 0.02;
      const path = curve([[0, 0.025, -0.004], [sx * out, -L * 0.4, 0.008], [sx * out * 0.6, -L * 0.78, 0.012], [-sx * curl, -L, 0.016]], ctx.N(8));
      const m = strand(path, w, (t) => w(t) * (s.thick ?? 0.62) + 0.002, ctx.S(7), [sx, 0, 0.35], (t) => 0.3 + 0.7 * smooth(t / 0.4));
      if (s.swing === false) fixed.push(place(m, p0[0], p0[1], p0[2]));
      else swing.push({ name: ctx.uid('side'), mesh: m, pos: p0, spring: { axis: [0, -1, 0], length: L, stiffness: s.stiffness ?? 70, damping: 6.5, gravity: 1.5, limit: 26 } });
    }
    return { fixed, swing };
  },

  /**
   * Hair that falls down the back to the collar in a row of pointed locks, as one swaying piece:
   * { n, from, to (yaw, through 180), top (pitch it starts at), length, w, jag, round (shorter toward the ends), tuck, flare, swing: false }.
   */
  drape(hd, s, ctx) {
    const n = s.n || 5, from = s.from ?? 110, to = s.to ?? 250, top = s.top ?? -8, L = s.length ?? 0.16, flare = s.flare ?? 0.03, tuck = s.tuck ?? 0.3, base = hd.at(180, top, 0.9);
    const space = Math.abs(to - from) / Math.max(1, n - 1) * DEG * hd.R[0], w = lockW(s.w ?? space * 0.74), parts = [];
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0.5 : i / (n - 1), yaw = from + (to - from) * u, p0 = hd.at(yaw, top + 16, 1.02), p1 = hd.at(yaw, top - 12, 1.07), d = norm([p1[0], 0, p1[2]]);
      const len = L * (1 - (s.jag ?? 0.2) * (i % 2)) * (1 - (s.round ?? 0.25) * Math.abs(u * 2 - 1));
      const p2 = [p1[0] * (1 - tuck * 0.5), p1[1] - len * 0.55, p1[2] * (1 - tuck * 0.5)], p3 = [p2[0] + d[0] * flare, p1[1] - len, p2[2] + d[2] * flare];
      parts.push(strand(curve([p0, p1, p2, p3], ctx.N(9)), w, (t) => w(t) * (s.thick ?? 0.55) + 0.003, ctx.S(7), null, tipInk));
    }
    const m = merge(parts);
    if (s.swing === false) return { fixed: [m] };
    return { swing: [{ name: ctx.uid('drape'), mesh: place(m, -base[0], -base[1], -base[2]), pos: base, spring: { axis: [0, -1, 0], length: L, stiffness: 90, damping: 8, gravity: 1, limit: s.limit ?? 11 } }] };
  },

  /** A smooth tail of hair (a ponytail, a pigtail): { at: [yaw, pitch], dir, length, width, links, tie, wave }. A chain of spring bones. */
  tail(hd, s, ctx) {
    const root = hd.at(s.at[0], s.at[1], s.r ?? 1.0), links = s.links || 2, L = s.length ?? 0.22, dir = norm(s.dir || [0, -1, -0.3]), W = s.width ?? 0.05, len = L / links;
    const q = quat.fromTo(quat.create(), [0, -1, 0], dir), swing = [], fixed = [];
    if (s.tie) fixed.push(xform(tint(place(torus(W * 0.72, W * 0.32, ctx.S(10), 5), 0, -W * 0.3, 0), s.tie), root, q));
    const prof = (t) => W * Math.sin(Math.min(1, t * 2.4 + 0.3) * Math.PI / 2) * (1 - t ** 2.2 * 0.95) + 0.003;
    let prev = null;
    for (let i = 0; i < links; i++) {
      const t0 = i / links, t1 = (i + 1) / links, pts = [], N = ctx.N(6);
      for (let k = 0; k <= N; k++) pts.push([Math.sin((t0 + (t1 - t0) * k / N) * 4) * (s.wave ?? 0.01), -len * (k / N) * (i === links - 1 ? 1 : 1.08), 0]);
      const m = strand(pts, (t) => prof(t0 + (t1 - t0) * t), (t) => prof(t0 + (t1 - t0) * t) * (s.thick ?? 0.82), ctx.S(8), [0, 0, 1]);
      const name = ctx.uid('tail');
      swing.push({ name, mesh: xform(m, [0, 0, 0], q), pos: i === 0 ? root : [dir[0] * len, dir[1] * len, dir[2] * len], parent: prev, spring: { axis: dir, length: len, stiffness: (s.stiffness ?? 52) - i * 8, damping: 5.5, gravity: 2, limit: i === 0 ? 34 : 44 } });
      prev = name;
    }
    return { fixed, swing };
  },

  /** A cloud of curls: { n, size, out, low (lowest pitch), seed, clear (yaw half-width kept free over the face) }. */
  curls(hd, s, ctx) {
    const n = s.n || 16, r = rng(s.seed ?? 5), low = Math.sin((s.low ?? -8) * DEG), fixed = [], clear = s.clear ?? 48;
    for (let i = 0; i < n; i++) {
      const y = low + (1 - low) * ((i + 0.5) / n) ** 0.8, pitch = Math.asin(Math.min(1, y)) / DEG, yaw = (i * 137.5 + (s.turn ?? 20)) % 360 - 180, size = (s.size ?? 0.07) * (0.8 + r() * 0.5);
      if (Math.abs(yaw) < clear && pitch < (s.brow ?? 40)) continue;
      const c = hd.at(yaw, pitch, 1 + (s.out ?? 0.3) * size / hd.R[0]);
      fixed.push(place(blob({ rx: size, ry: size * 0.9, rz: size, lumps: 0.25, seed: i + 1, seg: ctx.S(10), rings: ctx.S(7) }), c[0], c[1], c[2]));
    }
    return { fixed };
  },

  /** A deep hood with a hanging point: { color, lining, front, side, back, grow, tip: false }. The brow is under its edge. */
  hood(hd, s, ctx) {
    const col = s.color || '#3a3226', lining = rgb(s.lining || mixc(col, '#0c0a1c', 0.6));
    const m = dye(hairCap(hd, { front: s.front ?? 0.36, side: s.side ?? -0.5, back: s.back ?? -0.95, sideAt: 0.3, backAt: 0.62, grow: s.grow || [1.2, 1.17, 1.2], shift: s.shift || [0, 0.014, 0.006], seg: ctx.S(26), rings: ctx.S(16), under: [0.9, 0.79], underY: [0.02, 0.11] }), col);
    const [rows, R, seg] = m.foldRows;
    for (let i = 0; i < seg; i++) for (const j of [rows, rows + 1]) m.colors.set(lining, (i * R + j) * 3);
    const out = { fixed: [m], swing: [] };
    if (s.tip !== false) {
      const base = hd.at(180, 46, 1.1), L = s.tipLength ?? 0.2, w = lockW(0.085);
      const tipM = dye(strand(curve([[0, 0.03, 0.05], [0, -L * 0.25, -L * 0.25], [0, -L * 0.7, -L * 0.42], [0, -L, -L * 0.36]], ctx.N(8)), w, (t) => w(t) * 0.8 + 0.003, ctx.S(8), [0, 0.4, -1]), col);
      out.swing.push({ name: ctx.uid('hoodtip'), mesh: tipM, pos: base, spring: { axis: norm([0, -1, -0.4]), length: L, stiffness: 60, damping: 6, gravity: 2, limit: 24 } });
    }
    return out;
  },

  /** A flat cap, pulled down in front: { color, band, button }. */
  flatcap(hd, s, ctx) {
    const R = hd.R, col = s.color || '#6a5a4a', tilt = s.tilt ?? 10;
    return { fixed: [merge(
      dye(place(blob({ rx: R[0] * 1.13, ry: R[1] * 0.42, rz: R[2] * 1.22, flatBottom: 0.55, seg: ctx.S(16), rings: ctx.S(9) }), 0, R[1] * 0.78, R[2] * 0.1, tilt, 0, 0), col),
      dye(place(scaleMesh(cylinder(R[0] * 0.66, R[0] * 0.7, 0.022, ctx.S(12), { crease: 50 }), 1, 1, 0.8), 0, R[1] * 0.54, R[2] * 0.93, tilt + 8, 0, 0), s.peak || mixc(col, '#1a1030', 0.3)),
      dye(place(sphere(R[0] * 0.09, 7, 5), 0, R[1] * 1.2, R[2] * 0.02), s.button || mixc(col, '#1a1030', 0.3)))] };
  },

  /** A headscarf tied at the nape, its two ends swinging: { color, front, side, back, tails: false }. */
  kerchief(hd, s, ctx) {
    const col = s.color || '#e8483f', R = hd.R;
    const m = dye(hairCap(hd, { front: s.front ?? 0.6, side: s.side ?? -0.18, back: s.back ?? -0.66, grow: [1.1, 1.12, 1.11], seg: ctx.S(24), rings: ctx.S(14) }), col);
    const k = hd.at(180, -34, 1.1), out = { fixed: [m, dye(place(blob({ rx: 0.04, ry: 0.034, rz: 0.034, seg: ctx.S(9), rings: ctx.S(6) }), k[0], k[1], k[2]), col)], swing: [] };
    if (s.tails !== false) {
      const w = lockW(0.036), parts = [-1, 1].map((sx) => strand(curve([[0, 0, 0], [sx * 0.03, -0.05, -0.02], [sx * 0.05, -0.11, -0.016]], ctx.N(6)), w, (t) => w(t) * 0.45 + 0.002, ctx.S(6), [0, 0, -1]));
      out.swing.push({ name: ctx.uid('kerchief'), mesh: dye(merge(parts), col), pos: k, spring: { axis: [0, -1, 0], length: 0.11, stiffness: 60, damping: 6, gravity: 2, limit: 30 } });
    }
    return out;
  },

  /** A clerk's eyeshade: a band round the head and a green peak over the eyes. */
  visor(hd, s, ctx) {
    const R = hd.R, y = R[1] * 0.42, col = s.color || '#3f9a6a';
    return { fixed: [merge(
      dye(place(scaleMesh(torus(R[0] * 0.985, 0.014, ctx.S(18), 5), 1, 1, R[2] / R[0]), 0, y, -0.006), s.band || '#2a2540'),
      dye(place(scaleMesh(cylinder(R[0] * 0.84, R[0] * 0.92, 0.014, ctx.S(14), { crease: 50 }), 1, 1, 0.72), 0, y - 0.012, R[2] * 0.74, 20, 0, 0), col))] };
  },

  /** A mortarboard: a skull cap, a square board and a tassel that swings: { color, tassel }. */
  mortarboard(hd, s, ctx) {
    const R = hd.R, col = s.color || '#22303a', tc = s.tassel || '#ffd24a', y = R[1] * 1.1, side = R[0] * 2.25;
    const cap = dye(hairCap(hd, { front: 0.72, side: 0.5, back: 0.4, grow: [1.1, 1.1, 1.1], seg: ctx.S(18), rings: ctx.S(10) }), col);
    const board = dye(place(roundedBox(side, 0.026, side, 0.008, 1), 0, y, -0.01, -5, 45, 0), col);
    const knob = dye(place(sphere(0.022, 7, 5), 0, y + 0.02, -0.01), tc);
    const hx = side * 0.36, base = [hx, y + 0.004, 0.005 + hx * 0.2];
    const cord = strand([[-hx, 0.012, -hx * 0.2], [0, 0.006, 0], [0.008, -0.06, 0.004], [0.008, -0.1, 0.004]], () => 0.006, () => 0.006, 5, [0, 0, 1]);
    const tassel = merge(dye(cord, tc), dye(place(cone(0.024, 0.07, ctx.S(8)), 0.008, -0.1, 0.004, 180, 0, 0), tc));
    return { fixed: [cap, board, knob], swing: [{ name: ctx.uid('tassel'), mesh: tassel, pos: base, spring: { axis: [0, -1, 0], length: 0.13, stiffness: 40, damping: 4, gravity: 3, limit: 50 } }] };
  },

  /** locks: [{ pts: [[yaw, pitch, r?]...], w, thick? }] lying on the head (fringes, curtains, wisps). */
  locks(hd, s, ctx) { return { fixed: s.locks.map((l) => lockOn(hd, l.pts, l.w, { thick: l.thick ?? 0.42, seg: ctx.S(8), n: ctx.N(10), ink: l.ink === 1 ? null : tipInk })) }; },

  /** spikes: [[yaw, pitch, length, width, swing?]...], all bent along `sweep`. Ones flagged swing are spring bones. */
  spikes(hd, s, ctx) {
    const fixed = [], swing = [];
    s.spikes.forEach((k, i) => {
      const sw = k[5] || s.sweep || [0, 0, 0];
      if (!k[4]) { fixed.push(spikeOn(hd, k[0], k[1], k[2], k[3], sw, { thick: s.thick ?? 0.7, seg: ctx.S(7) })); return; }
      const base = hd.at(k[0], k[1], 0.86), m = spikeOn(hd, k[0], k[1], k[2], k[3], sw, { thick: s.thick ?? 0.7, seg: ctx.S(7) });
      const n0 = norm(base), ax = norm([n0[0] + sw[0], n0[1] + sw[1], n0[2] + sw[2]]);
      swing.push({ name: `spike${i}`, mesh: place(m, -base[0], -base[1], -base[2]), pos: base, spring: { axis: ax, length: k[2], stiffness: 150, damping: 9, limit: 22 } });
    });
    return { fixed, swing };
  },

  /** A bun: { at: [yaw, pitch], size, band? colour of a tie round its base }. */
  bun(hd, s, ctx) {
    const c = hd.at(s.at[0], s.at[1], 1.0 + (s.out ?? 0.3) * s.size / hd.R[0]), n = norm(c);
    const ball = place(blob({ rx: s.size, ry: s.size * 0.88, rz: s.size, lumps: 0.12, seed: 3, seg: ctx.S(14), rings: ctx.S(10) }), c[0], c[1], c[2]);
    const out = [ball];
    if (s.band) { const b = hd.at(s.at[0], s.at[1], 1.02); const q = quat.fromTo(quat.create(), [0, 1, 0], n); const t = tint(torus(s.size * 0.62, s.size * 0.2, ctx.S(14), 6), s.band); out.push(xform(t, b, q)); }
    if (s.pin) { const q = quat.fromTo(quat.create(), [0, 1, 0], norm(s.pinDir || [0.9, 0.35, 0.1])); const pin = merge(tint(place(cylinder(0.011, 0.011, s.size * 3.4, 6), 0, -s.size * 1.7, 0), s.pin), tint(place(sphere(0.022, 8, 6), 0, s.size * 1.7, 0), s.pinKnob || s.pin)); out.push(xform(pin, c, q)); }
    return { fixed: out };
  },

  /**
   * A braid hanging from the head: { at: [yaw, pitch], dir, length, width, links, tie }.
   * A chain of spring bones, each a pair of plaited bulbs; `tie` colours the band above the tuft.
   */
  braid(hd, s, ctx) {
    const root = hd.at(s.at[0], s.at[1], 0.96), links = s.links || 3, L = s.length / links, dir = norm(s.dir || [0, -1, 0]);
    const q = quat.fromTo(quat.create(), [0, -1, 0], dir);
    const swing = [], fixed = [];
    // the knot the braid grows from
    fixed.push(place(blob({ rx: s.width * 1.15, ry: s.width * 1.05, rz: s.width * 1.1, seg: ctx.S(12), rings: ctx.S(8) }), root[0], root[1], root[2]));
    for (let i = 0; i < links; i++) {
      const k = 1 - 0.3 * (i / links), parts = [];
      for (let j = 0; j < 2; j++) {
        const y = -L * (j + 0.5) / 2, side = (i * 2 + j) % 2 ? 1 : -1;
        parts.push(place(ellipsoid(s.width * k, L * 0.42, s.width * 0.82 * k, ctx.S(10), ctx.S(7)), side * s.width * 0.2, y, 0, 0, 0, side * 24));
      }
      if (i === links - 1) {
        parts.push(tint(place(cylinder(s.width * 0.6, s.width * 0.6, L * 0.2, ctx.S(10)), 0, -L * 1.08, 0), s.tie || ctx.color));
        parts.push(place(cone(s.width * 0.68, L * 0.62, ctx.S(10)), 0, -L * 1.05, 0, 180, 0, 0));
      }
      const piece = { name: `braid${i}`, mesh: xform(merge(parts), [0, 0, 0], q), pos: i === 0 ? root : [dir[0] * L, dir[1] * L, dir[2] * L], parent: i === 0 ? null : `braid${i - 1}`,
        spring: { axis: dir, length: L, stiffness: 46 - i * 6, damping: 5.5, gravity: 2.2, limit: i === 0 ? 30 : 42 } };
      swing.push(piece);
    }
    return { fixed, swing };
  },

  /** A pencil (or any stick) pushed through the hair: { at: [yaw, pitch], dir, length, color }. */
  pencil(hd, s, ctx) {
    const c = hd.at(s.at[0], s.at[1], s.r ?? 1.06), L = s.length || 0.26, r = 0.014;
    const m = s.chalk ? dye(place(cylinder(r * 1.25, r * 1.25, L, 6, { crease: 30 }), 0, -L / 2, 0), '#ffffff') : merge(
      tint(place(cylinder(r, r, L * 0.72, 6, { crease: 20 }), 0, -L * 0.36, 0), s.color || '#ffcc3a'),
      tint(place(cylinder(r * 1.08, r * 1.08, L * 0.07, 6), 0, L * 0.36, 0), '#c9d2de'),
      tint(place(cylinder(r, r, L * 0.09, 6), 0, L * 0.43, 0), '#ff8fa0'),
      tint(place(cone(r, L * 0.12, 6), 0, -L * 0.36, 0, 180, 0, 0), '#f2d9b0'),
      tint(place(cone(r * 0.45, L * 0.05, 6), 0, -L * 0.435, 0, 180, 0, 0), '#3a3040'));
    const d = norm(s.dir || [0.5, 0.8, -0.3]), up = (s.out ?? 0.2) * L;
    return { fixed: [xform(m, [c[0] + d[0] * up, c[1] + d[1] * up, c[2] + d[2] * up], quat.fromTo(quat.create(), [0, 1, 0], d))] };
  },

  /** A peaked cap: { color, band, peak }. Sits on top of whatever hair there is. */
  kepi(hd, s, ctx) { // { color, band, peak (false: a pillbox with no peak), tall (1 = the bailiff's) }
    const R = hd.R, tall = s.tall ?? 1, m = merge(
      dye(place(scaleMesh(cylinder(R[0] * 0.92, R[0] * (0.8 + (1 - tall) * 0.2), R[1] * 0.62 * tall, ctx.S(18), { crease: 50 }), 1, 1, R[2] / R[0]), 0, R[1] * 0.42, -0.005), s.color),
      dye(place(scaleMesh(cylinder(R[0] * 0.95, R[0] * 0.95, R[1] * 0.16, ctx.S(18), { crease: 50 }), 1, 1, R[2] / R[0]), 0, R[1] * 0.4, -0.005), s.band || '#ffd24a'),
      s.peak === false ? null : dye(place(scaleMesh(cylinder(R[0] * 0.78, R[0] * 0.78, R[1] * 0.07, ctx.S(14), { crease: 50 }), 1, 1, 0.8), 0, R[1] * 0.42, R[2] * 0.62, 12, 0, 0), s.peak || '#2a2540'),
      dye(place(sphere(R[0] * 0.1, ctx.lo ? 5 : 8, ctx.lo ? 4 : 6), 0, R[1] * (0.42 + 0.32 * tall), R[2] * 0.8), s.band || '#ffd24a'));
    return { fixed: [m] };
  },
};

// colour a hat or a scarf. Hair pieces come back white and are tinted with the hair colour afterwards, so a piece
// that carries its own colour must never be exactly white
function dye(mesh, color) { const c = rgb(color); return tint(mesh, c[0] === 1 && c[1] === 1 && c[2] === 1 ? [0.996, 0.996, 0.996] : c); }

// transform a mesh by a quaternion then a translation (build time)
function xform(mesh, pos, q) {
  const M = m4.fromTRS(m4.create(), pos, q, [1, 1, 1]), P = mesh.positions, p = [0, 0, 0];
  for (let i = 0; i < P.length; i += 3) { v3.transformPoint(p, [P[i], P[i + 1], P[i + 2]], M); P[i] = p[0]; P[i + 1] = p[1]; P[i + 2] = p[2]; }
  const N = [mesh.normals, mesh.onormals];
  for (const A of N) for (let i = 0; i < A.length; i += 3) { v3.transformDir(p, [A[i], A[i + 1], A[i + 2]], M); A[i] = p[0]; A[i + 1] = p[1]; A[i + 2] = p[2]; }
  return mesh;
}

// ------------------------------------------------------------------------------------ costume extras

/**
 * EXTRAS[kind](b, spec) adds meshes to the body under construction. b = { dim, parts: { hips, chest,
 * head, armL, armR, foreL, foreR, handL, handR, ... }, swing: [], torsoZ(x, y), S(n), hd, skin }.
 * Push tinted meshes onto b.parts[segment] in that segment's own coordinates.
 */
export const EXTRAS = {
  /** A chain of office across the chest with a seal on it. */
  chain(b, s) {
    const d = b.dim, y0 = d.shoulderY + 0.012, drop = s.drop ?? 0.12 * d.torso, hw = d.shoulderX * 0.56;
    const pts = []; for (let i = 0; i <= 12; i++) { const u = i / 12 * 2 - 1, x = u * hw, y = y0 - drop * (1 - u * u); pts.push([x, y, b.torsoZ(x, y) + 0.006]); }
    b.parts.chest.push(setOutline(tint(strand(pts, () => 0.009, () => 0.006, 6, [0, 0, 1]), s.color || '#ffcf3f'), 0.6));
    const y = y0 - drop - 0.024;
    b.parts.chest.push(setOutline(tint(place(cylinder(0.03, 0.03, 0.012, b.S(14), { crease: 40 }), 0, y, b.torsoZ(0, y) + 0.004, 84, 0, 0), s.seal || s.color || '#ffcf3f'), 0.7));
  },
  /** Shoulder tabs. */
  epaulettes(b, s) {
    const d = b.dim;
    for (const sx of [-1, 1]) b.parts.chest.push(tint(place(roundedBox(0.085, 0.022, 0.07, 0.01, 2), sx * d.shoulderX * 0.92, d.shoulderY + 0.038, 0, 0, 0, -sx * 14), s.color));
  },
  /** A knitted shawl: a capelet over the shoulders in rows of two colours with bobbles on the hem, and a drape on each upper arm. */
  shawl(b, s) {
    const d = b.dim, c1 = s.color, c2 = s.color2 || mixc(s.color, '#5a1030', 0.3), c3 = s.trim || '#ffe9c4';
    const top = d.neckY + 0.012, sh = d.shoulderY, w = d.shoulderX, len = s.length ?? 0.15;
    const rows = [[w * 1.5, sh - len, c3], [w * 1.53, sh - len + 0.014, c1], [w * 1.5, sh - len * 0.62, c2], [w * 1.4, sh - len * 0.3, c1], [w * 1.22, sh + 0.005, c2], [w * 0.95, sh + 0.04, c1], [w * 0.62, top, c1]];
    b.parts.chest.push(place(bands(rows, b.S(20), 0.88), 0, 0, 0));
    const inner = lathe([[w * 1.0, sh - len + 0.03], [w * 1.5, sh - len]], b.S(20), { crease: 180 });
    b.parts.chest.push(tint(scaleMesh(inner, 1, 1, 0.88), c2));
    // the knot and its two tails at the throat
    b.parts.chest.push(tint(place(cylinder(0.03, 0.03, 0.016, b.S(12), { crease: 40 }), 0, sh - len * 0.36, w * 1.44 * 0.88 - 0.004, 78, 0, 0), s.toggle || '#ffd24a'));
    b.sleeve = { color: c1, color2: c2, drape: true };
  },
  /** An apron over the skirt front. */
  apron(b, s) {
    const d = b.dim, pos = [], idx = [], nA = b.S(9), nY = 4, y0 = d.hemY + 0.03, y1 = d.waistY + 0.012;
    for (let j = 0; j <= nY; j++) for (let i = 0; i <= nA; i++) {
      const a = (i / nA - 0.5) * (s.spread ?? 1.9), y = y0 + (y1 - y0) * (j / nY), r = b.skirtR(y) + 0.012, round = j === 0 ? 0.985 - 0.06 * Math.abs(i / nA - 0.5) * 2 : 1;
      pos.push(Math.sin(a) * r * round, y + (j === 0 ? 0.02 * (Math.abs(i / nA - 0.5) * 2) ** 2 : 0), Math.cos(a) * r * d.zr * round);
    }
    for (let j = 0; j < nY; j++) for (let i = 0; i < nA; i++) { const a = j * (nA + 1) + i, c = a + nA + 1; idx.push(a, a + 1, c, a + 1, c + 1, c); }
    b.parts.hips.push(tint(fromArrays(pos, idx, null, 180), s.color || '#fff4dc'));
    if (s.pocket) b.parts.hips.push(tint(place(roundedBox(0.075, 0.055, 0.012, 0.012, 2), 0.045, (y0 + y1) / 2 - 0.01, b.skirtR((y0 + y1) / 2) * d.zr * 0.97 + 0.014, 0, 14, 0), s.pocket));
    b.parts.hips.push(tint(scaleMesh(place(torus(b.skirtR(y1) + 0.006, 0.012, b.S(20), 6), 0, y1, 0), 1, 1, d.zr), s.tie || s.color || '#fff4dc'));
  },
  /** A satchel on a strap across the body: { side: 'L' | 'R' (the hip it hangs at), color, strap, clasp }. */
  satchel(b, s) {
    const d = b.dim, sx = s.side === 'R' ? -1 : 1, col = s.color || '#b8662e', strap = s.strap || mixc(col, '#3a1a10', 0.3);
    for (const back of [1, -1]) { // the strap, front and back, from the far shoulder down to the bag
      const pts = []; for (let i = 0; i <= 8; i++) { const u = i / 8, x = (-sx * 0.72 + u * 1.9 * sx) * d.shoulderX, y = d.shoulderY + 0.03 - u * (d.shoulderY + 0.05); pts.push([x, y, back * (b.torsoZ(x, y) + 0.008)]); }
      b.parts.chest.push(setOutline(tint(strand(pts, () => 0.013, () => 0.005, 5, [0, 0, back]), strap), 0.6));
    }
    const bx = sx * (d.rx * 1.22 + 0.03), by = -0.045;
    b.parts.chest.push(merge(
      tint(place(roundedBox(0.07, 0.1, 0.13, 0.02, 2), bx, by, 0.0, 0, 0, sx * -8), col),
      tint(place(roundedBox(0.074, 0.05, 0.136, 0.02, 2), bx + sx * 0.002, by + 0.03, 0.0, 0, 0, sx * -8), strap),
      setOutline(tint(place(sphere(0.012, 7, 5), bx + sx * 0.038, by + 0.006, 0.0), s.clasp || '#ffd24a'), 0.5)));
  },
  /** A ring in one ear: { side: 'L' | 'R', color }. */
  earring(b, s) {
    const sx = s.side === 'R' ? -1 : 1, R = b.hd.R;
    b.parts.head.push(setOutline(tint(place(torus(0.024, 0.0085, 12, 6), sx * (R[0] * 1.13), b.dim.headC - R[1] * 0.46, 0.0, 90, sx * 50, 0), s.color || '#ffd24a'), 0.7));
  },
  /** The wire of an earpiece, from behind one ear down into the collar. */
  earpiece(b, s) {
    const sx = s.side === 'L' ? 1 : -1, R = b.hd.R, y = b.dim.headC;
    b.parts.head.push(setOutline(tint(place(sphere(0.017, 8, 6), sx * R[0] * 1.1, y - R[1] * 0.14, 0.012), s.color || '#c9d2de'), 0.6));
    b.parts.head.push(setOutline(tint(strand(curve([[sx * R[0] * 1.1, y - R[1] * 0.16, 0.0], [sx * R[0] * 1.06, y - R[1] * 0.5, -0.05], [sx * R[0] * 0.7, y - R[1] * 0.92, -0.09]], 6), () => 0.0035, () => 0.0035, 5), s.color || '#c9d2de'), 0));
  },
  /** Round spectacles: { color, size, half: true for half-moons worn low }. */
  glasses(b, s) {
    const hd = b.hd, y = b.dim.headC, col = s.color || '#3a3050', ep = (b.face.eyePitch ?? FACE.eyePitch) + (s.half ? -8 : 1), ey = b.face.eyeYaw ?? FACE.eyeYaw, rr = hd.R[0] * 0.25 * (s.size ?? 1);
    for (const sx of [-1, 1]) {
      const c = hd.at(sx * ey, ep, 1.07), q = quat.fromTo(quat.create(), [0, 1, 0], norm(c));
      const ring = xform(scaleMesh(torus(rr, 0.007, b.lo ? 9 : 16, b.lo ? 3 : 5), 1, 1, s.half ? 0.56 : 1), c, q); place(ring, 0, y, 0); b.parts.head.push(tint(ring, col));
    }
    const a = hd.at(-8, ep + 3, 1.09), c = hd.at(8, ep + 3, 1.09);
    b.parts.head.push(tint(place(strand([a, hd.at(0, ep + 5, 1.1), c], () => 0.006, () => 0.006, 5), 0, y, 0), col));
  },
  /** A beard under the mouth: { shape 'square' | 'full' | 'point', color, size, whiskers: false }. */
  beard(b, s) {
    const hd = b.hd, R = hd.R, y = b.dim.headC, k = s.size ?? 1, col = s.color || '#9a9aa0', sq = s.shape === 'square';
    let m = sq ? superellipsoid(R[0] * 0.5 * k, R[1] * 0.3 * k, R[2] * 0.3 * k, 0.5, 0.5, b.S(14), b.S(9))
      : blob({ rx: R[0] * 0.56 * k, ry: R[1] * 0.36 * k, rz: R[2] * 0.32 * k, chin: s.shape === 'point' ? 1 : 0.3, pear: -0.3, seg: b.S(14), rings: b.S(9) });
    b.parts.head.push(tint(place(m, 0, y - R[1] * (sq ? 0.99 : 1.04), R[2] * 0.56), col));
    if (s.whiskers !== false) for (const sx of [-1, 1]) b.parts.head.push(tint(place(lockOn(hd, [[sx * 82, -4, 1.03], [sx * 72, -34, 1.05], [sx * 46, -58, 1.05]], 0.05 * k, { n: b.N(8), seg: b.S(7), thick: 0.5 }), 0, y, 0), col));
  },
  /** The two white bands a magistrate wears at the throat. */
  tabs(b, s) {
    const d = b.dim, y = d.neckY - 0.115;
    for (const sx of [-1, 1]) b.parts.chest.push(setOutline(tint(place(roundedBox(0.036, 0.08, 0.01, 0.004, 1), sx * 0.021, y, b.torsoZ(sx * 0.021, y) + 0.012, 10, 0, sx * 8), s.color || '#fffdf4'), 0.6));
  },
  /** Checks on the front of the top (a waistcoat): { color (the second colour), cols, rows, bottom }. */
  checks(b, s) {
    const d = b.dim, nx = s.cols || 6, ny = s.rows || 5, x0 = -d.rx * 0.84, x1 = d.rx * 0.84, y1 = d.shoulderY - 0.012, y0 = s.bottom ?? 0.005, pos = [], idx = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if ((i + j) % 2) continue;
      const xa = x0 + (x1 - x0) * i / nx, xb = x0 + (x1 - x0) * (i + 1) / nx, ya = y0 + (y1 - y0) * j / ny, yb = y0 + (y1 - y0) * (j + 1) / ny, v = pos.length / 3;
      for (const [x, yy] of [[xa, ya], [xb, ya], [xb, yb], [xa, yb]]) pos.push(x, yy, b.torsoZ(x, yy) + 0.004);
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    }
    b.parts.chest.push(setOutline(tint(fromArrays(pos, idx, null, 180), s.color || '#3d4a1f'), 0));
  },
  /** A plain cape over the shoulders: { color, trim, length, lining, clasp }. It covers the upper arms, as the shawl does. */
  cape(b, s) {
    const d = b.dim, c1 = s.color || '#3a3226', c3 = s.trim || c1, w = d.shoulderX, sh = d.shoulderY, top = d.neckY + 0.012, len = s.length ?? 0.14;
    b.parts.chest.push(bands([[w * 1.5, sh - len, c3], [w * 1.54, sh - len + 0.016, c1], [w * 1.42, sh - len * 0.4, c1], [w * 1.22, sh + 0.005, c1], [w * 0.95, sh + 0.04, c1], [w * 0.62, top, c1]], b.S(20), 0.88));
    b.parts.chest.push(tint(scaleMesh(lathe([[w * 1.0, sh - len + 0.03], [w * 1.5, sh - len]], b.S(20), { crease: 180 }), 1, 1, 0.88), s.lining || mixc(c1, '#1a1040', 0.4)));
    if (s.clasp) b.parts.chest.push(setOutline(tint(place(cylinder(0.026, 0.026, 0.014, b.S(10), { crease: 40 }), 0, sh - len * 0.3, w * 1.4 * 0.88, 80, 0, 0), s.clasp), 0.7));
    b.sleeve = { color: c1, color2: c3 === c1 ? mixc(c1, '#1a1040', 0.18) : c3, drape: true };
  },
  /** A pin, a tag or a seal on the chest: { x, y (chest coordinates; default left breast), size, color, shape 'disc' | 'bar' }. */
  brooch(b, s) {
    const x = s.x ?? 0.055, y = s.y ?? b.dim.shoulderY - 0.06, z = b.torsoZ(x, y) + 0.004, r = s.size ?? 0.02;
    const m = s.shape === 'bar' ? place(roundedBox(r * 1.1, r * 2.2, 0.008, 0.003, 1), x, y, z + 0.003) : place(cylinder(r, r, 0.01, b.S(10), { crease: 40 }), x, y, z - 0.002, 84, 0, 0);
    b.parts.chest.push(setOutline(tint(m, s.color || '#c0c6d6'), 0.6));
  },
  /** A bow tie. */
  bowtie(b, s) {
    const d = b.dim, y = d.neckY - 0.1, z = b.torsoZ(0, y) + 0.016, c = s.color || '#e07a3f', r = 0.03, L = 0.052;
    b.parts.chest.push(setOutline(merge(tint(place(cone(r, L, 6), -L, y, z, 0, 0, -90), c), tint(place(cone(r, L, 6), L, y, z, 0, 0, 90), c), tint(place(sphere(0.016, 6, 4), 0, y, z + 0.004), mixc(c, '#3a1020', 0.25))), 0.7));
  },
  /** A moustache: two short locks under the nose. */
  moustache(b, s) {
    const hd = b.hd, y = b.dim.headC;
    for (const sx of [-1, 1]) b.parts.head.push(tint(place(strand(curve([hd.at(sx * 1, -24.5, 1.045), hd.at(sx * 10, -25.5, 1.06), hd.at(sx * 19, -29, 1.04)], 6), (t) => 0.02 * (1 - t * 0.75), (t) => 0.014 * (1 - t * 0.6), 6), 0, y, 0), s.color));
  },
};

// ------------------------------------------------------------------------------------ props

/** PROPS[kind](spec, S) -> { mesh, light?, glowAt?, hang? }. Held in a hand; `hang` props swing below it. */
export const PROPS = {
  lantern(s, S) {
    const r = s.size || 0.078, paper = s.color || '#ffd070', rib = s.rib || '#f08a2a', wood = s.wood || '#7a4a2a';
    const prof = []; for (let i = 0; i <= 8; i++) { const a = (i / 8 - 0.5) * Math.PI * 0.9; prof.push([Math.cos(a) * r, Math.sin(a) * r * 1.1]); }
    const body = setGlow(tint(lathe(prof, S(14), { crease: 180 }), paper), 1);
    const ribs = [-0.5, 0, 0.5].map((k) => { const a = k * Math.PI * 0.45; return setOutline(setGlow(tint(place(torus(Math.cos(a) * r * 1.0, 0.0035, S(14), 5), 0, Math.sin(a) * r * 1.1, 0), rib), 0.9), 0); });
    const capT = tint(place(cylinder(r * 0.62, r * 0.5, 0.022, S(12), { crease: 40 }), 0, r * 1.04, 0), wood), capB = tint(place(cylinder(r * 0.5, r * 0.62, 0.02, S(12), { crease: 40 }), 0, -r * 1.07 - 0.02, 0), wood);
    const tassel = tint(place(cone(0.016, 0.05, 6), 0, -r * 1.07 - 0.02, 0, 180, 0, 0), '#f4573f');
    const handle = tint(strand(curve([[-r * 0.45, r * 1.06, 0], [-r * 0.3, r * 1.5, 0], [0, r * 1.68, 0], [r * 0.3, r * 1.5, 0], [r * 0.45, r * 1.06, 0]], 10), () => 0.006, () => 0.006, 5), wood);
    const m = place(merge(body, ribs, capT, capB, tassel, handle), 0, -r * 1.68, 0);
    return { mesh: m, hang: true, light: { color: s.light || '#ffb050', radius: s.radius || 2.6, intensity: 1 }, glowAt: [0, -r * 1.68, 0], glowSize: r * 9 };
  },
  baton(s, S) {
    const m = merge(tint(place(cylinder(0.016, 0.02, 0.3, S(8)), 0, -0.07, 0), s.color || '#5a3a2a'), tint(place(sphere(0.028, 8, 6), 0, 0.235, 0), s.tip || '#ffd24a'));
    return { mesh: place(m, 0, 0, 0, -78, 0, 0) };
  },
  /** A magistrate's gavel. */
  gavel(s, S) {
    const m = merge(tint(place(cylinder(0.013, 0.016, 0.26, S(8)), 0, -0.06, 0), s.color || '#8a5a34'), tint(place(cylinder(0.042, 0.042, 0.12, S(10), { crease: 50 }), 0.06, 0.2, 0, 0, 0, 90), s.head || '#6a3f24'),
      tint(place(cylinder(0.045, 0.045, 0.016, S(10), { crease: 50 }), 0.03, 0.2, 0, 0, 0, 90), '#ffd24a'), tint(place(cylinder(0.045, 0.045, 0.016, S(10), { crease: 50 }), -0.044, 0.2, 0, 0, 0, 90), '#ffd24a'));
    return { mesh: place(m, 0, 0, 0, -64, 0, 0) };
  },
  /** A long thin cane with a brass tip. */
  pointer(s, S) {
    const m = merge(tint(place(cylinder(0.008, 0.012, 0.52, S(7)), 0, -0.08, 0), s.color || '#2a3a3a'), tint(place(sphere(0.016, 6, 4), 0, 0.445, 0), s.tip || '#ffd24a'), tint(place(sphere(0.02, 6, 4), 0, -0.08, 0), s.tip || '#ffd24a'));
    return { mesh: place(m, 0, 0, 0, -70, 0, 0) };
  },
  /** A big bound book, held against the body: { color, trim, pages }. */
  ledger(s, S) {
    const c = s.color || '#6a4a2a', m = merge(tint(roundedBox(0.2, 0.27, 0.056, 0.012, 2), c), tint(place(roundedBox(0.19, 0.25, 0.044, 0.004, 1), 0.012, 0, 0), s.pages || '#fff3d0'),
      tint(place(roundedBox(0.03, 0.272, 0.058, 0.01, 1), -0.088, 0, 0), s.trim || '#c9b78a'), setOutline(tint(place(roundedBox(0.07, 0.05, 0.008, 0.004, 1), 0.01, 0.03, 0.03), s.trim || '#c9b78a'), 0.5));
    return { mesh: place(m, 0.02, -0.04, 0.075, -12, -20, 8) };
  },
  /** The hat that goes round: upturned, with what people put in it. */
  hat(s, S) {
    const c = s.color || '#6a5a4a', bowl = tint(lathe([[0, 0], [0.07, 0.006], [0.1, 0.05], [0.105, 0.09], [0.15, 0.1], [0.15, 0.108], [0.092, 0.1], [0.086, 0.052], [0, 0.03]], S(14), { crease: 60 }), c);
    const r = rng(s.seed ?? 3), coins = []; for (let i = 0; i < (s.coins ?? 5); i++) coins.push(setOutline(setGlow(tint(place(cylinder(0.02, 0.02, 0.008, 7, { crease: 40 }), (r() - 0.5) * 0.1, 0.04 + r() * 0.03, (r() - 0.5) * 0.1, r() * 50 - 25, 0, r() * 50 - 25), '#ffd24a'), 0.35), 0.5));
    return { mesh: place(merge(bowl, coins), 0, -0.07, 0.07) };
  },
  /** A bowl of something hot, held out. */
  bowl(s, S) {
    const m = merge(tint(lathe([[0, 0], [0.04, 0], [0.085, 0.05], [0.09, 0.062], [0.078, 0.058], [0.04, 0.02], [0, 0.016]], S(12), { crease: 60 }), s.color || '#e9dcc0'), tint(place(cylinder(0.074, 0.074, 0.006, S(10), { crease: 40 }), 0, 0.044, 0), s.soup || '#d98a3a'));
    return { mesh: place(m, 0, -0.045, 0.06) };
  },
  writ(s, S) {
    const m = merge(tint(roundedBox(0.12, 0.16, 0.012, 0.004, 1), s.color || '#fff6dc'), tint(place(cylinder(0.022, 0.022, 0.01, 10), 0.025, -0.045, 0.006, 90, 0, 0), '#e6323a'));
    return { mesh: place(m, 0, -0.03, 0.05, -20, 0, 0) };
  },
};

// ------------------------------------------------------------------------------------ poses

/** Swap left and right in a pose. */
export function mirrorPose(pose) {
  const out = {};
  for (const [k, v] of Object.entries(pose)) {
    const name = k.endsWith('L') ? k.slice(0, -1) + 'R' : k.endsWith('R') ? k.slice(0, -1) + 'L' : k;
    const f = (r) => [r[0], -r[1], -r[2]];
    out[name] = Array.isArray(v) ? f(v) : { ...(v.r ? { r: f(v.r) } : {}), ...(v.p ? { p: [-v.p[0], v.p[1], v.p[2]] } : {}), ...(v.s ? { s: v.s } : {}) };
  }
  return out;
}

// Rotations are [pitch, yaw, roll] degrees relative to the rest pose (arms and legs straight down).
// Arms and legs: pitch < 0 swings forward; roll > 0 lifts a LEFT limb outward, roll < 0 a RIGHT one.
// Head and chest: pitch > 0 nods down, yaw > 0 turns to the figure's own left, roll > 0 tips the top to its right.
export const POSES = {
  // the neutral stand every character starts from: arms a little out and bent, one hip dropped
  stand: {
    hips: { r: [0, -9, 3], p: [0.012, -0.004, 0] }, chest: [1, 6, -4], head: [-2, 9, 4],
    legL: [1, 6, 5], legR: [-5, -8, -6], shinR: [9, 0, 0],
    armL: [4, 0, 13], foreL: [-16, 0, 0], armR: [2, 0, -15], foreR: [-22, 0, 0], handL: [0, 0, -6], handR: [0, 0, 6],
  },
  // talking gestures: overlays on the stand, picked from in turn while a character speaks
  talkOpen: { armR: [-28, 0, -26], foreR: [-78, 20, 0], handR: [0, -50, 0], chest: [-2, -4, 0], head: [-4, -4, -3] },
  talkBoth: { armR: [-22, 0, -24], foreR: [-72, 22, 0], handR: [0, -55, 0], armL: [-22, 0, 24], foreL: [-72, -22, 0], handL: [0, 55, 0], chest: [-4, 0, 0], head: [-5, 0, 0] },
  talkPoint: { armR: [-64, 0, -12], foreR: [-48, 0, 0], handR: [-20, 0, 0], chest: [4, 10, 0], head: [3, -6, 0] },
  talkShrug: { armL: [-6, 0, 30], foreL: [-88, -40, 0], handL: [0, 70, 0], armR: [-6, 0, -30], foreR: [-88, 40, 0], handR: [0, -70, 0], chest: [-3, 0, 0], head: [0, 0, 8] },
  talkSmall: { armR: [-14, 0, -14], foreR: [-58, 14, 0], handR: [0, -30, 0], head: [2, -5, 2] },
  talkChin: { armR: [-30, 0, -8], foreR: [-128, 34, 0], head: [5, -8, -6], chest: [3, 0, 0], armL: [-6, 0, 6], foreL: [-80, 0, -62] },
  talkPat: { armL: [-34, 0, 14], foreL: [-60, 0, -10], handL: [30, 0, 0], head: [6, 6, 6], chest: [5, 0, 0] },
  hipL: { armL: [14, 0, 44], foreL: [-24, 0, -96], handL: [0, 0, -20] },
  // actions
  jabBack: { hips: { r: [2, -14, 0], p: [0, -0.02, -0.03] }, chest: [6, -30, 2], head: [0, 26, 0], armR: [44, 0, -22], foreR: [-108, 0, 0], armL: [-40, 0, 16], foreL: [-66, 0, -20], legL: [-18, 0, 4], legR: [20, 0, -6], shinR: [24, 0, 0], shinL: [14, 0, 0] },
  jabHit: { hips: { r: [8, 16, 0], p: [0, -0.012, 0.05] }, chest: [10, 30, -3], head: [-10, -26, 0], armR: [-92, 0, -4], foreR: [-4, 0, 0], armL: [36, 0, 18], foreL: [-84, 0, 0], legL: [26, 0, 4], shinL: [8, 0, 0], legR: [-34, 0, -4], shinR: [30, 0, 0] },
  chopUp: { hips: { r: [-6, 0, 0], p: [0, 0.015, -0.02] }, chest: [-14, 8, 0], head: [-8, 0, 0], armL: [-164, 0, 16], foreL: [-24, 0, 0], armR: [-164, 0, -16], foreR: [-24, 0, 0], legL: [-8, 0, 5], legR: [8, 0, -5] },
  chopDown: { hips: { r: [16, 0, 0], p: [0, -0.035, 0.05] }, chest: [22, -6, 0], head: [-16, 0, 0], armL: [-58, 0, 6], foreL: [-12, 0, 0], armR: [-58, 0, -6], foreR: [-12, 0, 0], legL: [-30, 0, 5], shinL: [34, 0, 0], legR: [16, 0, -5], shinR: [20, 0, 0] },
  charge: { hips: { r: [10, -24, 0], p: [0, -0.045, -0.02] }, chest: [10, -26, 0], head: [-8, 40, 0], armR: [50, 0, -34], foreR: [-96, 0, 0], armL: [-58, 0, 22], foreL: [-40, 0, 0], legL: [-34, 10, 8], shinL: [50, 0, 0], legR: [22, -10, -10], shinR: [36, 0, 0] },
  lunge: { hips: { r: [14, 20, 0], p: [0, -0.03, 0.1] }, chest: [10, 32, 0], head: [-16, -36, 0], armR: [-100, 0, 0], foreR: [0, 0, 0], armL: [50, 0, 26], foreL: [-30, 0, 0], legL: [44, 0, 6], shinL: [6, 0, 0], legR: [-50, 0, -4], shinR: [44, 0, 0] },
  recoil: { hips: { r: [-14, 0, 4], p: [0, -0.01, -0.06] }, chest: [-18, 8, 6], head: [-20, -10, 10], armL: [-30, 0, 62], foreL: [-40, 0, 0], armR: [-20, 0, -70], foreR: [-50, 0, 0], legL: [-24, 0, 8], legR: [10, 0, -8], shinR: [20, 0, 0] },
  cheerUp: { hips: { r: [-4, 0, 0] }, chest: [-10, 0, 0], head: [-14, 0, 0], armL: [22, 0, 150], foreL: [0, 0, -24], armR: [22, 0, -150], foreR: [0, 0, 24], legL: [0, 0, 12], legR: [0, 0, -12] },
  crouch: { hips: { r: [8, 0, 0], p: [0, -0.05, 0] }, chest: [8, 0, 0], head: [-8, 0, 0], legL: [-36, 0, 8], shinL: [62, 0, 0], legR: [-36, 0, -8], shinR: [62, 0, 0], armL: [16, 0, 22], foreL: [-40, 0, 0], armR: [16, 0, -22], foreR: [-40, 0, 0] },
  stride: { hips: { r: [5, 0, 0] }, legL: [-34, 0, 3], shinL: [22, 0, 0], legR: [26, 0, -3], shinR: [30, 0, 0], armL: [26, 0, 10], armR: [-30, 0, -10], foreR: [-40, 0, 0], foreL: [-30, 0, 0] },
  slump: { hips: { r: [10, 0, 0], p: [0, -0.03, -0.01] }, chest: [22, 0, 0], head: [26, -8, 6], armL: [-6, 0, 5], foreL: [-8, 0, 0], armR: [-6, 0, -5], foreR: [-8, 0, 0], legL: [-14, 0, 4], shinL: [26, 0, 0], legR: [-14, 0, -4], shinR: [26, 0, 0] },
  handsUp: { chest: [-6, 0, 0], head: [8, 0, 0], armL: [-10, 0, 100], foreL: [0, 0, 62], handL: [0, 0, 0], armR: [-10, 0, -100], foreR: [0, 0, -62] },
  nodDown: { head: [16, 0, 0], chest: [4, 0, 0] },
  shakeL: { head: [2, 22, 0] }, shakeR: { head: [2, -22, 0] },
  // Ren + Ilse: he drops to a knee and makes a step of his hands, she runs up it and comes down pointing
  teamBrace: { hips: { r: [6, 24, 0], p: [0, -0.1, 0] }, chest: [14, 10, 0], head: [-18, -20, 0], legL: [-70, 0, 6], shinL: [84, 0, 0], legR: [14, 0, -6], shinR: [70, 0, 0], armL: [-46, 0, -8], foreL: [-56, 0, -30], armR: [-46, 0, 8], foreR: [-56, 0, 30] },
  teamHeave: { hips: { r: [-8, 24, 0], p: [0, 0.0, 0] }, chest: [-18, 10, 0], head: [-24, -20, 0], legL: [-10, 0, 8], legR: [6, 0, -8], armL: [-150, 0, 16], foreL: [-10, 0, 0], armR: [-150, 0, -16], foreR: [-10, 0, 0] },
  teamLeap: { hips: { r: [-16, 0, 0] }, chest: [-12, 0, 0], head: [8, 0, 0], legL: [-50, 0, 6], shinL: [80, 0, 0], legR: [24, 0, -6], shinR: [50, 0, 0], armL: [30, 0, 60], foreL: [-20, 0, 0], armR: [-160, 0, -10], foreR: [-8, 0, 0] },
  teamDive: { hips: { r: [34, 0, 0] }, chest: [14, 0, 0], head: [-34, 0, 0], legL: [30, 0, 8], shinL: [20, 0, 0], legR: [44, 0, -8], shinR: [40, 0, 0], armL: [40, 0, 50], foreL: [-10, 0, 0], armR: [-112, 0, -4], foreR: [0, 0, 0] },
};

// What an emote does to the body, as a light overlay on whatever pose is held.
const EMOTE_BODY = {
  neutral: {},
  smile: { chest: [-3, 0, 0], head: [-5, 0, 4] },
  grim: { chest: [2, 0, 0], head: [4, 0, 0], armL: [4, 0, 6], armR: [4, 0, -6] },
  shock: { hips: { r: [-6, 0, 0], p: [0, 0.006, -0.012] }, chest: [-10, 0, 0], head: [-6, 0, 0], armL: [-8, 0, 40], foreL: [-52, 0, 0], armR: [-8, 0, -40], foreR: [-52, 0, 0], handL: [0, 0, 20], handR: [0, 0, -20] },
  tears: { hips: { r: [6, 0, 0] }, chest: [12, 0, 0], head: [14, 0, 7], armL: [-34, 0, 4], foreL: [-118, 0, -34], armR: [-34, 0, -4], foreR: [-118, 0, 34] },
  anger: { hips: { r: [6, 0, 0], p: [0, -0.012, 0.01] }, chest: [8, 0, 0], head: [2, 0, 0], armL: [10, 0, 26], foreL: [-46, 0, 0], armR: [10, 0, -26], foreR: [-46, 0, 0], legL: [0, 0, 6], legR: [0, 0, -6] },
  soft: { chest: [-1, 0, -3], head: [5, 0, 9] },
};
const browPose = (raise, scowl) => ({ browL: [-raise, 0, scowl], browR: [-raise, 0, -scowl] });
const EMOTE_BROW = Object.fromEntries(EMOTES.map((e) => [e, browPose(EMOTE[e].brow[0], EMOTE[e].brow[1])]));

/**
 * One-shot clips. keys: [time, pose name | null (the held pose), forward, up, squash] with forward/up
 * in units of the character's height along its facing, squash < 0 squat, > 0 stretch.
 * `impact` is when the blow lands (fire the effect then); `hold` keeps the last key until the next act().
 */
export const CLIPS = {
  strike: { dur: 0.62, impact: 0.27, keys: [[0, null, 0, 0, 0], [0.16, 'jabBack', -0.05, 0, -0.06], [0.27, 'jabHit', 0.16, 0.02, 0.07], [0.42, 'jabHit', 0.14, 0, 0], [0.62, null, 0, 0, 0]] },
  strike2: { dur: 0.74, impact: 0.36, keys: [[0, null, 0, 0, 0], [0.2, 'chopUp', -0.02, 0.1, 0.1], [0.36, 'chopDown', 0.12, 0, -0.12], [0.52, 'chopDown', 0.12, 0, -0.04], [0.74, null, 0, 0, 0]] },
  windup: { dur: 0.42, impact: 0.42, hold: true, keys: [[0, null, 0, 0, 0], [0.42, 'charge', -0.1, 0, -0.1]] },
  release: { dur: 0.7, impact: 0.14, from: 'charge', keys: [[0, 'charge', -0.1, 0, -0.1], [0.14, 'lunge', 0.34, 0.05, 0.12], [0.46, 'lunge', 0.3, 0, 0], [0.7, null, 0, 0, 0]] },
  hit: { dur: 0.6, impact: 0.06, flash: true, keys: [[0, null, 0, 0, 0], [0.07, 'recoil', -0.14, 0.03, 0.08], [0.3, 'recoil', -0.2, 0, -0.05], [0.6, null, 0, 0, 0]] },
  cheer: { dur: 1.0, impact: 0.3, keys: [[0, null, 0, 0, 0], [0.14, 'crouch', 0, 0, -0.14], [0.3, 'cheerUp', 0, 0.22, 0.14], [0.46, 'cheerUp', 0, 0, -0.1], [0.6, 'cheerUp', 0, 0.12, 0.08], [0.76, 'cheerUp', 0, 0, -0.06], [1.0, null, 0, 0, 0]] },
  stepF: { dur: 0.4, impact: 0.3, travel: 0.3, keys: [[0, null, 0, 0, 0], [0.16, 'stride', 0.15, 0.05, 0.05], [0.3, null, 0.3, 0, -0.07], [0.4, null, 0.3, 0, 0]] },
  stepB: { dur: 0.4, impact: 0.3, travel: -0.3, keys: [[0, null, 0, 0, 0], [0.16, 'recoil', -0.15, 0.05, 0.05], [0.3, null, -0.3, 0, -0.07], [0.4, null, -0.3, 0, 0]] },
  yield: { dur: 0.7, impact: 0.5, hold: true, keys: [[0, null, 0, 0, 0], [0.18, 'recoil', -0.08, 0.02, 0.04], [0.7, 'slump', -0.1, 0, -0.08]] },
  surrender: { dur: 0.5, impact: 0.4, hold: true, keys: [[0, null, 0, 0, 0], [0.2, 'recoil', -0.06, 0.02, 0.05], [0.5, 'handsUp', -0.06, 0, 0]] },
  nod: { dur: 0.5, impact: 0.18, keys: [[0, null, 0, 0, 0], [0.18, 'nodDown', 0, 0, -0.02], [0.5, null, 0, 0, 0]] },
  shake: { dur: 0.7, impact: 0.2, keys: [[0, null, 0, 0, 0], [0.16, 'shakeL', 0, 0, 0], [0.36, 'shakeR', 0, 0, 0], [0.54, 'shakeL', 0, 0, 0], [0.7, null, 0, 0, 0]] },
  hop: { dur: 0.42, impact: 0.2, keys: [[0, null, 0, 0, 0], [0.1, null, 0, 0, -0.1], [0.22, null, 0, 0.1, 0.09], [0.34, null, 0, 0, -0.07], [0.42, null, 0, 0, 0]] },
  // the team move: start both at the same moment, leader a step ahead of the follower (see teamMove)
  teamLead: { dur: 1.5, impact: 1.02, keys: [[0, null, 0, 0, 0], [0.22, 'teamBrace', 0, 0, -0.08], [0.56, 'teamBrace', 0, 0, -0.1], [0.68, 'teamHeave', 0, 0.06, 0.14], [0.98, 'teamHeave', 0, 0, 0], [1.1, 'jabHit', 0.1, 0, 0], [1.3, 'jabHit', 0.1, 0, 0], [1.5, null, 0, 0, 0]] },
  teamFollow: { dur: 1.5, impact: 1.02, keys: [[0, null, 0, 0, 0], [0.2, 'crouch', -0.1, 0, -0.12], [0.44, 'stride', 0.2, 0.06, 0.04], [0.58, 'crouch', 0.42, 0.26, -0.06], [0.76, 'teamLeap', 0.7, 0.72, 0.14], [0.9, 'teamDive', 1.0, 0.6, 0.08], [1.02, 'chopDown', 1.3, 0.0, -0.18], [1.2, 'chopDown', 1.3, 0, -0.04], [1.36, 'stride', 0.6, 0.1, 0.04], [1.5, null, 0, 0, 0]] },
};

/** Start the two-character move. Stand `lead` between `follow` and the target, about one height ahead of the follower. */
export function teamMove(lead, follow) { lead.act('teamLead'); follow.act('teamFollow'); return CLIPS.teamLead; }

// ------------------------------------------------------------------------------------ the builder

const DEFAULT_BUILD = { height: 1, head: 1, legs: 1, torso: 1, arms: 1, width: 1, hands: 1, feet: 1, belly: 0 };
let seedCounter = 1;

/**
 * createCharacter(def, { faces, material, detail = 1 }) -> character. See the notes above CAST for `def`.
 *
 * character = {
 *   root            place it: root.setPos(x, y, z). Feet stand on the root's origin, the figure faces the root's +Z
 *   update(dt, state)
 *   act(name, { speed = 1 }) -> the clip (dur, impact)       play a one-shot from CLIPS
 *   release()       drop a held clip (windup, yield, surrender);  offset / home(): see stepF
 *   busy            true while a clip is running (a held clip is not busy);  clip: its name, or ''
 *   height          world units, crown of the head (hair excluded)
 *   headPos         Float32Array(3), world position of the head's centre after the last update: look targets, speech ticks
 *   headRadius      world half-width of the head (hair excluded), for framing portraits
 *   lampPos         Float32Array(3) or null, world position of the lit prop, for a glow sprite
 *   light           the prop's light ({ intensity } to dim it) or null
 *   setLit(on)      lights or puts out the prop
 *   skin            the batched skin node: skin.flash for hit flashes, skin.tint to dim
 *   rig, parts, def, stats { triangles, draws, bones }
 *   bounds()        world box { min, max } (allocates: for framing a shot, not per frame)
 * }
 *
 * state (every field optional, persistent fields are read each frame):
 *   emote     one of EMOTES
 *   talk      0..1 mouth opening this frame (from the voice's level), or
 *   speaking  true: the mouth is driven by a built-in syllable rhythm, and talking gestures play
 *   pose      'stand' (default) | 'signature' | any name in def.poses or POSES: held until changed
 *   look      null | 'camera' | [x, y, z]: head and eyes turn to it (within limits)
 *   face      null | degrees | [x, y, z]: the whole body turns to this heading or point
 *   camera    the camera, needed only for look: 'camera'
 *   wind      [x, y, z] pushed into every spring (hair, braid, tassels)
 *   energy    0..1 scales idle motion (default 1)
 *   eyes      'shut' | 'open' overrides blinking
 *   snap      true on a cut: every blend (emote, pose, look, facing) lands at once and nothing blinks
 */
export function createCharacter(def, { faces = null, material: mat = null, detail = 1, lod = 'full' } = {}) {
  if (!def || !def.id) throw new Error('createCharacter: a def needs an id');
  mat = mat || defaultMaterial();
  if (lod !== 'full' && lod !== 'stage') throw new Error(`createCharacter(${def.id}): unknown lod "${lod}" (have full, stage)`);
  // 'stage' is the figure for the live band, drawn 60 to 90 px tall: the same silhouette from half the segments,
  // fewer points along every lock, discs for buttons, coarser face patches
  const lo = lod === 'stage', dq = detail * (lo ? 0.52 : 1), CR = lo ? 2 : 4;
  const S = (n) => Math.max(lo ? 4 : 5, Math.round(n * dq));
  const N = (n) => (lo ? Math.max(3, Math.round(n * 0.55)) : n);
  const uids = {}, uid = (p) => { uids[p] = (uids[p] || 0) + 1; return p + uids[p]; };
  const B = { ...DEFAULT_BUILD, ...(def.build || {}) };
  const C = def.costume || {};
  const skin = def.skin || '#ffd8b0';
  const headSkin = def.face?.shade ? mixc(skin, '#2a1c52', def.face.shade) : skin; // a face kept in the shadow of a hood
  const top = { color: '#ffc83a', hem: -0.03, flare: 1.3, ...(C.top || {}) };
  const sleeves = { color: top.color, flare: 1.16, ...(C.sleeves || {}) };
  const legsC = { color: '#2a3a66', ...(C.legs || {}) };
  const shoes = { color: '#6a4130', ...(C.shoes || {}) };

  // ---- dimensions (world units before def.build.height scales the whole figure)
  const w = B.width;
  const thigh = 0.118 * B.legs, shin = 0.098 * B.legs, footDrop = 0.066;
  const HR = [0.236 * B.head, 0.21 * B.head, 0.224 * B.head];
  const dim = {
    hipY: thigh + shin + footDrop, hipX: 0.07 * w, thigh, shin,
    chestY: 0.085 * B.torso, torso: B.torso, rx: 0.132 * w, rz: 0.114 * w * (1 + B.belly * 0.5), zr: 0.86 * (1 + B.belly * 0.4),
    shoulderY: 0.2 * B.torso, shoulderX: 0.124 * w, neckY: 0.265 * B.torso,
    upper: 0.105 * B.arms, fore: 0.095 * B.arms, hand: 0.05 * B.hands,
    headC: HR[1] * 0.8, waistY: 0.085 * B.torso + 0.02, hemY: top.hem,
  };
  const hd = makeHead(HR);
  // the front of the torso at (x, y) in chest coordinates, for buttons and chains
  const TY = 0.105 * B.torso, TRY = 0.17 * B.torso, PEAR = 0.5 + B.belly;
  const torsoZ = (x, y) => { const ys = Math.max(-0.96, Math.min(0.96, (y - TY) / TRY)), k = 1 + PEAR * -ys * 0.35, q = 1 - ys * ys - (x / (dim.rx * k)) ** 2; return dim.rz * k * Math.sqrt(Math.max(0.06, q)); };
  // the skirt of the top, in hips coordinates
  const waistR = dim.rx * (1 + PEAR * 0.2) * 1.02, hemR = waistR * top.flare + Math.max(0, -top.hem) * 0.25;
  const skirtR = (y) => { const t = Math.max(0, Math.min(1, (y - dim.hemY) / (dim.waistY + 0.05 - dim.hemY))); return hemR + (waistR - hemR) * t ** 0.8; };

  const parts = { hips: [], chest: [], head: [], armL: [], armR: [], foreL: [], foreR: [], handL: [], handR: [], legL: [], legR: [], shinL: [], shinR: [] };
  const b = { dim, parts, swing: [], torsoZ, skirtR, S, N, lo, hd, skin, sleeve: null, face: def.face || {} };

  // ---- legs and feet
  const legR0 = 0.064 * w, legR1 = 0.058 * w;
  parts.legL.push(tint(limb(legR0, legR1, thigh, S(14), CR), legsC.color));
  const boot = tint(place(blob({ rx: 0.074 * B.feet, ry: 0.07, rz: 0.112 * B.feet, flatBottom: 0.55, pear: 0.25, seg: S(16), rings: S(10) }), 0, -shin - 0.035, 0.034 * B.feet), shoes.color);
  const shinParts = [tint(limb(legR1, legR1 * 1.04, shin, S(14), CR), shoes.tall ? shoes.color : legsC.color), boot];
  if (shoes.sole) shinParts.push(tint(place(scaleMesh(cylinder(0.074 * B.feet, 0.078 * B.feet, 0.016, S(12), { crease: 50 }), 1, 1, 1.5), 0, -shin - footDrop, 0.034 * B.feet), shoes.sole));
  if (shoes.cuff) shinParts.push(tint(place(torus(legR1 * 1.12, 0.014, S(10), 5), 0, -shin + 0.012, 0), shoes.cuff));
  parts.shinL.push(merge(shinParts));
  parts.legR.push(mirrorX(merge(parts.legL))); parts.shinR.push(mirrorX(merge(parts.shinL)));

  // ---- pelvis and the skirt of the top
  parts.hips.push(tint(place(blob({ rx: dim.rx * 1.04, ry: 0.092, rz: dim.rz * 1.04, seg: S(14), rings: S(9) }), 0, 0.028, 0), top.hem < 0.0 ? top.color : legsC.color));
  {
    const y0 = dim.hemY, y1 = dim.waistY + 0.05, rows = [], n = 5;
    rows.push([hemR * 0.6, y0 + 0.03, top.lining || mixc(top.color, '#2a1f5a', 0.45)]);
    if (top.trim) { rows.push([hemR, y0, top.trim]); rows.push([skirtR(y0 + 0.026), y0 + 0.026, top.color]); } else rows.push([hemR, y0, top.color]);
    for (let i = 1; i <= n; i++) { const y = y0 + 0.026 + (y1 - y0 - 0.026) * (i / n); rows.push([skirtR(y) * (i === n ? 0.92 : 1), y, top.color]); }
    parts.hips.push(bands(rows, S(24), dim.zr));
  }
  // ---- torso
  parts.chest.push(tint(place(blob({ rx: dim.rx, ry: TRY, rz: dim.rz, pear: PEAR, seg: S(20), rings: S(12) }), 0, TY, 0), top.color));
  if (C.belt) {
    const y = dim.waistY + 0.022, rb = skirtR(y) * 1.035;
    parts.hips.push(tint(scaleMesh(place(lathe([[rb * 0.96, y - 0.02], [rb, y - 0.016], [rb, y + 0.016], [rb * 0.9, y + 0.02]], S(18), { crease: 50 }), 0, 0, 0), 1, 1, dim.zr), C.belt.color));
    if (C.belt.buckle) parts.hips.push(tint(place(roundedBox(0.05, 0.044, 0.016, 0.008, 2), 0, y, rb * dim.zr + 0.003), C.belt.buckle));
  }
  if (C.buttons) {
    const n = C.buttons.count || 3, rowsN = C.buttons.rows || 1, y0 = dim.shoulderY - 0.035, y1 = (C.belt ? dim.waistY - dim.chestY + 0.075 : 0.0);
    for (let i = 0; i < n; i++) for (let r = 0; r < rowsN; r++) {
      const y = y0 + (y1 - y0) * (i / Math.max(1, n - 1)), x = rowsN === 1 ? 0 : (r ? 1 : -1) * 0.036 * w;
      parts.chest.push(setOutline(tint(place(lo ? sphere(C.buttons.size || 0.016, 5, 3) : sphere(C.buttons.size || 0.016, 8, 6), x, y, torsoZ(x, y) + 0.002, 0, 0, 0, 1, 1, 0.5), C.buttons.color), 0.6));
    }
  }
  if (top.placket) { // the line the coat closes on
    const pts = []; for (let i = 0; i <= 6; i++) { const y = dim.shoulderY - 0.01 - (dim.shoulderY + 0.02) * (i / 6); pts.push([top.placketX || 0, y, torsoZ(top.placketX || 0, y) + 0.003]); }
    parts.chest.push(setOutline(tint(strand(pts, () => 0.006, () => 0.003, 5, [0, 0, 1]), top.placket), 0));
  }
  // ---- collar
  if (C.collar) {
    const k = C.collar, y = dim.neckY;
    if (k.kind === 'stand') parts.chest.push(tint(scaleMesh(lathe([[0.066 * w, y - 0.028], [0.084 * w, y - 0.022], [0.09 * w, y + 0.03], [0.074 * w, y + 0.034], [0.066 * w, y - 0.028]], S(16), { crease: 50 }), 1, 1, 0.92), k.color));
    else if (k.kind === 'flat') parts.chest.push(tint(scaleMesh(lathe([[0.125 * w, y - 0.058], [0.132 * w, y - 0.046], [0.07 * w, y - 0.004], [0.05 * w, y - 0.004]], S(18), { crease: 60 }), 1, 1, 0.9), k.color));
    else if (k.kind === 'scarf') parts.chest.push(tint(place(scaleMesh(torus(0.09 * w, 0.042, S(16), lo ? 5 : 7), 1, 0.85, 0.95), 0, y, 0), k.color));
    // 'high': a stiff collar up to the jaw.  'turned': a coat collar turned up against the weather, open at the throat
    else if (k.kind === 'high') parts.chest.push(tint(scaleMesh(lathe([[0.07 * w, y - 0.03], [0.09 * w, y - 0.024], [0.1 * w, y + 0.052], [0.084 * w, y + 0.056], [0.07 * w, y - 0.03]], S(16), { crease: 50 }), 1, 1, 0.92), k.color));
    else if (k.kind === 'turned') parts.chest.push(tint(scaleMesh(lathe([[0.075 * w, y - 0.04], [0.11 * w, y - 0.034], [0.15 * w, y + 0.036], [0.135 * w, y + 0.044], [0.075 * w, y - 0.04]], S(16), { crease: 50 }), 1, 1, 0.86), k.color));
    else throw new Error(`createCharacter(${def.id}): unknown collar kind "${k.kind}" (have stand, flat, scarf, high, turned)`);
  }
  // ---- fail on an unknown extra before building anything else
  for (const e of C.extras || []) { const f = EXTRAS[e.kind]; if (!f) throw new Error(`createCharacter(${def.id}): unknown costume extra "${e.kind}" (have ${Object.keys(EXTRAS).join(', ')})`); }

  // ---- head: skull, ears, nose, hair
  {
    const skull = sphere(1, S(30), S(20)), P = skull.positions, p = [0, 0, 0], unit = P.slice();
    for (let i = 0; i < P.length; i += 3) { p[0] = P[i]; p[1] = P[i + 1]; p[2] = P[i + 2]; hd.shape(p); P[i] = p[0]; P[i + 1] = p[1]; P[i + 2] = p[2]; }
    const sk = tint(fromArrays(skull.positions, skull.indices, null, 180), headSkin);
    for (let i = 0; i < unit.length; i += 3) { // exact normals away from the poles (see makeHead.normalAt)
      if (Math.abs(unit[i + 1]) > 0.985) continue;
      const n = hd.normalAt(Math.atan2(unit[i], unit[i + 2]) / DEG, Math.asin(unit[i + 1]) / DEG);
      sk.normals[i] = n[0]; sk.normals[i + 1] = n[1]; sk.normals[i + 2] = n[2];
    }
    const head = [sk];
    if (def.face?.ears !== 0) for (const sx of [-1, 1]) head.push(tint(place(ellipsoid(0.027 * B.head, 0.044 * B.head, 0.031 * B.head, lo ? 6 : 10, lo ? 4 : 7), sx * HR[0] * 1.08, -HR[1] * 0.2, -0.012, 0, sx * 24, 0), headSkin));
    if (def.face?.nose !== 0) { const np = hd.at(0, -19.5, 0.985), nk = def.face?.nose ?? 1; head.push(setOutline(tint(place(ellipsoid(0.017 * nk, 0.011 * nk, 0.014 * nk, lo ? 5 : 8, lo ? 3 : 6), np[0], np[1], np[2]), headSkin), 0)); }
    const hairCol = def.hair?.color || '#b8542a', ctx = { color: hairCol, dark: mixc(hairCol, '#1a1040', 0.35), S, N, lo, uid };
    for (const piece of def.hair?.pieces || []) {
      const f = HAIR[piece.kind]; if (!f) throw new Error(`createCharacter(${def.id}): unknown hair piece "${piece.kind}" (have ${Object.keys(HAIR).join(', ')})`);
      const r = f(hd, piece, ctx), col = piece.color || hairCol;
      // pieces arrive white where they are hair and coloured where they are not (ties, pins, pencils)
      for (const m of r.fixed || []) head.push(tintWhite(m, col));
      for (const sw of r.swing || []) b.swing.push({ ...sw, mesh: tintWhite(sw.mesh, col), on: sw.parent || 'head', headSpace: !sw.parent });
    }
    parts.head.push(place(merge(head), 0, dim.headC, 0));
  }
  // extras run before the arms: some reshape them (the shawl turns the upper arms into drapes)
  for (const e of C.extras || []) EXTRAS[e.kind](b, e);

  // ---- arms and mitten hands
  {
    // sleeves.rolled: bare forearms below a roll at the elbow.  costume.gloves { L, R }: a hand in a glove (or stained with ink)
    const sc = b.sleeve || sleeves, r0 = 0.05 * w, r1 = 0.046 * w, r2 = r1 * (sleeves.rolled ? 0.96 : sleeves.flare || 1.16);
    const upper = sc.drape
      ? merge(tint(limb(r0, r1, dim.upper, S(14), CR), sc.color), bands([[r0 * 1.9, -dim.upper * 1.05, sc.color2], [r0 * 1.86, -dim.upper * 0.7, sc.color], [r0 * 1.5, -dim.upper * 0.2, sc.color2], [r0 * 1.0, 0.03, sc.color]], S(10)))
      : tint(limb(r0, r1, dim.upper, S(14), CR), sleeves.color);
    parts.armL.push(upper);
    const fore = [tint(limb(r1, r2, dim.fore, S(14), CR), sleeves.rolled ? skin : sleeves.color)];
    if (sleeves.rolled) fore.push(tint(place(torus(r1 * 1.08, 0.017, S(12), 5), 0, -0.008, 0), sleeves.color));
    else if (sleeves.cuff) fore.push(tint(place(cylinder(r2 * 1.1, r2 * 1.14, 0.03, S(14), { crease: 50 }), 0, -dim.fore - 0.012, 0), sleeves.cuff));
    parts.foreL.push(merge(fore));
    const hand = () => { const palm = place(blob({ rx: dim.hand, ry: dim.hand * 1.12, rz: dim.hand * 0.9, seg: S(12), rings: S(9) }), 0, -dim.hand * 0.75, 0); return lo ? palm : merge(palm, place(sphere(dim.hand * 0.42, 7, 5), dim.hand * 0.1, -dim.hand * 0.55, dim.hand * 0.82)); };
    parts.handL.push(tint(hand(), C.gloves?.L || skin));
    parts.armR.push(mirrorX(merge(parts.armL))); parts.foreR.push(mirrorX(merge(parts.foreL))); parts.handR.push(tint(mirrorX(hand()), C.gloves?.R || skin));
    if (sleeves.ink) parts['fore' + sleeves.ink].push(setOutline(tint(place(blob({ rx: r2 * 0.42, ry: 0.024, rz: r2 * 0.3, seg: 8, rings: 6 }), r2 * 0.3, -dim.fore - 0.012, r2 * 0.95), '#2a2f7a'), 0));
  }

  // ---- the node tree
  const root = group(def.id);
  const body = group('body', { parent: root });
  body.setScale(B.height);
  const mk = (name, parent, pos) => node(name, parts[name] && parts[name].length ? merge(parts[name]) : null, mat, { pos, parent });
  const hips = mk('hips', body, [0, dim.hipY, 0]);
  const legL = mk('legL', hips, [dim.hipX, 0, 0]), legR = mk('legR', hips, [-dim.hipX, 0, 0]);
  mk('shinL', legL, [0, -thigh, 0]); mk('shinR', legR, [0, -thigh, 0]);
  const chest = mk('chest', hips, [0, dim.chestY, 0]);
  const head = mk('head', chest, [0, dim.neckY, 0]);
  const armL = mk('armL', chest, [dim.shoulderX, dim.shoulderY, 0]), armR = mk('armR', chest, [-dim.shoulderX, dim.shoulderY, 0]);
  const foreL = mk('foreL', armL, [0, -dim.upper, 0]), foreR = mk('foreR', armR, [0, -dim.upper, 0]);
  const handL = mk('handL', foreL, [0, -dim.fore, 0]), handR = mk('handR', foreR, [0, -dim.fore, 0]);

  // brows: small 3D strands that pivot about the head's centre, so pitch raises them and roll tilts them
  const browSpec = { color: def.hair?.brow || mixc(def.hair?.color || '#7a4a2a', '#1a1040', 0.25), w: 0.019, len: 23, at: [FACE.eyeYaw + 1, 14.5], ...(def.face?.brow || {}) };
  {
    const rr = Math.hypot(...hd.at(browSpec.at[0], browSpec.at[1])) * 1.03, pts = [];
    for (let i = 0; i <= 6; i++) { const u = i / 6 - 0.5, a = u * browSpec.len * DEG, e = (0.25 - u * u) * 9 * DEG; pts.push([Math.sin(a) * Math.cos(e) * rr, Math.sin(e) * rr, Math.cos(a) * Math.cos(e) * rr]); }
    const wf = (t) => browSpec.w * (0.55 + 0.45 * Math.sin(Math.min(1, t * 2.2 + 0.25) * Math.PI / 2)) * (1 - 0.55 * t * t);
    const th = (t) => 0.008 + 0.004 * (1 - t);
    const whole = () => setOutline(tint(strand(pts, wf, th, lo ? 4 : 6), browSpec.color), 0.55);
    // a scar through a brow: the same brow in two pieces with a gap between them
    const nicked = () => { const k = 4, f = (a, b) => (t) => wf(a + (b - a) * t), g = (a, b) => (t) => th(a + (b - a) * t);
      const cut = (i0, i1, u) => { const q = pts[i0], r = pts[i1]; return [q[0] + (r[0] - q[0]) * u, q[1] + (r[1] - q[1]) * u, q[2] + (r[2] - q[2]) * u]; };
      const A = [...pts.slice(0, k), cut(k - 1, k, 0.45)], Bp = [cut(k, k + 1, 0.05), ...pts.slice(k + 1)];
      return setOutline(tint(merge(strand(A, f(0, 0.57), g(0, 0.57), 6), strand(Bp, f(0.68, 1), g(0.68, 1), 6)), browSpec.color), 0.55); };
    const cy = dim.headC, nick = def.face?.brow?.nick;
    // raiseL / raiseR: one brow carried higher than the other, always (degrees); tilt: both brows angled (> 0 inner ends down)
    node('browL', nick === 'L' ? nicked() : whole(), mat, { pos: [0, cy, 0], rot: [-browSpec.at[1] - (browSpec.raiseL || 0), browSpec.at[0], browSpec.tilt || 0], parent: head });
    node('browR', mirrorX(nick === 'R' ? nicked() : whole()), mat, { pos: [0, cy, 0], rot: [-browSpec.at[1] - (browSpec.raiseR || 0), -browSpec.at[0], -(browSpec.tilt || 0)], parent: head });
  }

  // swinging pieces (hair, braid): spring bones
  const swingNodes = new Map(), springSpecs = [];
  for (const sw of b.swing) {
    const parent = sw.on === 'head' ? head : swingNodes.get(sw.on) || (parts[sw.on] ? root.find(sw.on) : null);
    if (!parent) throw new Error(`createCharacter(${def.id}): swing piece "${sw.name}" hangs from "${sw.on}", which does not exist`);
    const pos = sw.headSpace ? [sw.pos[0], sw.pos[1] + dim.headC, sw.pos[2]] : sw.pos;
    const n = node(sw.name, sw.mesh, mat, { pos, parent });
    swingNodes.set(sw.name, n); springSpecs.push([n, sw.spring]);
  }

  // props, held in a hand
  let lampNode = null, lampLight = null, lampSpec = null;
  const propNodes = {};
  for (const p of def.props || []) {
    const f = PROPS[p.kind]; if (!f) throw new Error(`createCharacter(${def.id}): unknown prop "${p.kind}" (have ${Object.keys(PROPS).join(', ')})`);
    const r = f(p, S), hand = p.hand === 'L' ? handL : handR;
    const n = node(p.kind, r.mesh, mat, { pos: [0, -dim.hand * 0.9, 0], parent: hand });
    propNodes[p.kind] = n;
    if (r.light) { lampNode = n; lampSpec = r; lampLight = new Node(p.kind + 'Light', { pos: r.glowAt, parent: n, light: makeLight(r.light) }); n.hang = !!r.hang; }
  }

  // face decals (the order they are added is the order they are drawn)
  let face = null;
  if (faces) {
    const F = { set: 'round', iris: '#5a3a2a', eyeScale: 1, eyeYaw: FACE.eyeYaw, eyePitch: FACE.eyePitch, mouthScale: 1.2, mouthPitch: FACE.mouth.pitch, ...(def.face || {}) };
    // at stage size a face is twenty pixels across: the eyes and mouth are drawn a little larger there so they still read
    const fm = faces.material, cy = dim.headC, k = F.eyeScale * (lo ? 1.07 : 1), mk2 = F.mouthScale * (lo ? 1.14 : 1), ps = lo ? 3 : 6;
    const pivot = group('face', { pos: [0, cy, 0], parent: head });
    const two = (wd, ht, flip) => merge(hd.patch(F.eyeYaw, F.eyePitch, wd * k, ht * k, 0.012, ps, false), hd.patch(-F.eyeYaw, F.eyePitch, wd * k, ht * k, 0.012, ps, flip));
    const eyes = node('eyes', two(FACE.ball.w, FACE.ball.h, false), faces.eyeMaterial, { parent: pivot });
    const lids = node('lids', two(FACE.lid.w, FACE.lid.h, true), fm, { parent: pivot, tint: headSkin });
    const wide = hd.patch(0, FACE.wide.pitch, FACE.wide.w, FACE.wide.h, 0.013, lo ? 5 : 10);
    const marks = node('marks', wide, fm, { parent: pivot });
    const mouth = node('mouth', hd.patch(0, F.mouthPitch, FACE.mouth.w * mk2, FACE.mouth.h * mk2, 0.014, lo ? 3 : 5), fm, { parent: pivot });
    const fx = node('fx', wide, fm, { parent: pivot, visible: false });
    { const ms = { skin: headSkin, ...(def.face?.marks || {}) }; marks.uvRect.set(faces.marks(JSON.stringify(ms), ms)); } // keyed by what is drawn, so look-alikes share a cell
    const table = {};
    for (const e of EMOTES) {
      table[e] = {
        open: faces.lid(F.set, e, false), shut: faces.lid(F.set, e, true), eye: faces.eyeball(F.iris, EMOTE[e].eye),
        mouth: [0, 1, 2, 3].map((n) => faces.mouth(e, n)), fx: faces.fx(EMOTE[e].fx),
      };
      // face.mouths { emote: closed shape }: the mouth a person's face rests in (a smirk, a thin line), see faces.js CLOSED
      if (F.mouths && F.mouths[e]) table[e].mouth[0] = faces.mouthShape(F.mouths[e]);
    }
    face = { eyes, lids, marks, mouth, fx, table, F, tris: (eyes.mesh.indices.length + lids.mesh.indices.length + wide.indices.length + mouth.mesh.indices.length) / 3 };
  }

  // one draw for the whole figure; from here on the nodes are joints
  const skins = batchFigure(root);
  const skinNode = skins[0];
  const rig = createRig(root);
  const springs = springSpecs.map(([n, s]) => createSpring(n, { ...s, wind: [0, 0, 0] }));

  // ---- poses for this character
  const poseOf = (name) => {
    const p = (def.poses && def.poses[name]) || POSES[name];
    if (!p) throw new Error(`character ${def.id}: no pose "${name}" (have ${[...Object.keys(def.poses || {}), ...Object.keys(POSES)].join(', ')})`);
    return p;
  };
  const stand = poseOf('stand');
  const gestures = (def.gestures || ['talkOpen', 'talkSmall', 'talkBoth']).map(poseOf);
  const clipPoses = {}; // resolved once per clip
  const lefty = def.handed === 'L'; // clips are authored right-handed; a left-hander plays their mirror image
  for (const [name, c] of Object.entries(CLIPS)) clipPoses[name] = c.keys.map((k) => (k[1] ? (lefty ? mirrored(poseOf(k[1])) : poseOf(k[1])) : null));

  const height = (dim.hipY + dim.chestY + dim.neckY + dim.headC + HR[1]) * B.height;
  const seed = def.seed ?? seedCounter++;
  const idleOpts = { seed, speed: def.idle?.speed ?? 1, amount: 1, breath: def.idle?.breath ?? 1, bob: def.idle?.bob ?? 1, sway: def.idle?.sway ?? 1, look: 0.5, height, joints: null };
  const A = def.anim || {};

  // ---- animation state
  let time = seed * 1.73, emote = 'neutral', prevEmote = 'neutral', emoteT = 1, blinkHold = 0;
  let poseA = null, poseB = null, poseT = 1, poseName = 'stand';
  let talkW = 0, mouthLevel = 0;
  let clip = null, clipName = '', clipT = 0, clipSpeed = 1, clipHeld = false, travel = 0;
  let yawNow = 0, yawInit = false, lookYaw = 0, lookPitch = 0, eyeX = 0, eyeY = 0, lit = 1, flash = 0;
  const tmp = v3.create(), tmp2 = v3.create(), inv = m4.create(), down = v3.create();
  const headPos = new Float32Array(3), lampPos = lampNode ? new Float32Array(3) : null;
  const NOSTATE = {};

  function setEyes(rect, dx, dy) {
    const W = FACE.window, r = face.eyes.uvRect, m = (1 - W) / 2;
    r[0] = rect[0] + rect[2] * (m - dx); r[1] = rect[1] + rect[3] * (m + dy); r[2] = rect[2] * W; r[3] = rect[3] * W;
  }

  const ch = {
    def, root, rig, parts: rig.joints, skin: skinNode, height, headRadius: HR[0] * 1.085 * B.height, headPos, lampPos, light: lampLight ? lampLight.light : null, props: propNodes, busy: false, clip: '',
    stats: { triangles: 0, draws: 0, bones: skinNode ? skinNode.bones.length : 0 },

    act(name, { speed = 1 } = {}) {
      const c = CLIPS[name]; if (!c) throw new Error(`character ${def.id}: no clip "${name}" (have ${Object.keys(CLIPS).join(', ')})`);
      clip = c; clipName = name; clipT = 0; clipSpeed = speed; clipHeld = false; ch.busy = true; ch.clip = name;
      if (c.flash) flash = 1;
      return c;
    },
    /** Drop a held clip (windup, yield, surrender) and go back to the pose. */
    release() { clip = null; clipHeld = false; ch.busy = false; ch.clip = ''; },
    /** stepF / stepB leave the figure standing off its root by this many heights along its facing. home() puts it back (move the root first). */
    get offset() { return travel; },
    home() { travel = 0; },
    setLit(on) { lit = on ? 1 : 0; },
    bounds() { return nodeBounds(root); },

    update(dt, s = NOSTATE) {
      time += dt;
      // emote: brows and body blend, the decals swap behind a blink
      const want = s.emote || 'neutral';
      if (want !== emote) {
        if (!EMOTE[want]) throw new Error(`character ${def.id}: unknown emote "${want}" (have ${EMOTES.join(', ')})`);
        prevEmote = emote; emote = want; emoteT = 0; blinkHold = 0.09;
        if (want === 'shock' && !clip && !s.snap) ch.act('hop'); // a start
      }
      emoteT = Math.min(1, emoteT + dt * 6); blinkHold -= dt;
      const snap = !!s.snap; // a cut: land every blend at once
      if (snap) { emoteT = 1; blinkHold = 0; }
      const eT = smooth(emoteT);
      // held pose
      const wantPose = s.pose || 'stand';
      if (wantPose !== poseName) { poseA = poseB; poseB = wantPose === 'stand' ? null : poseOf(wantPose); poseName = wantPose; poseT = 0; }
      poseT = snap ? 1 : Math.min(1, poseT + dt * 3.6);
      // talking
      const speaking = s.talk != null ? s.talk > 0.02 : !!s.speaking;
      const level = s.talk != null ? s.talk : speaking ? Math.max(0, Math.sin(time * 13.5 + seed) * 0.55 + Math.sin(time * 5.3 + seed * 2) * 0.45 + 0.2) : 0;
      mouthLevel = snap ? level : approach(mouthLevel, level, dt * 28);
      talkW = snap ? (speaking ? 1 : 0) : approach(talkW, speaking ? 1 : 0, dt * 5);

      rig.reset(); rig.apply(stand, 1);
      const pT = smooth(poseT);
      if (poseA && pT < 1) rig.apply(poseA, 1 - pT);
      if (poseB) rig.apply(poseB, pT);
      const clipW = clip ? 0.3 : poseB ? 0.35 + 0.65 * (1 - pT) : 1; // a held pose or a clip owns the limbs; the emote only leans on it
      if (eT < 1) rig.apply(EMOTE_BODY[prevEmote], (1 - eT) * clipW);
      rig.apply(EMOTE_BODY[emote], eT * clipW);
      rig.apply(EMOTE_BROW[prevEmote], 1); rig.apply(EMOTE_BROW[emote], eT);
      if (talkW > 0.01 && !clip && poseName === 'stand') {
        const period = A.gesturePeriod || 2.3, gi = Math.floor(time / period), u = time / period - gi;
        const env = smooth(u / 0.16) * (1 - smooth((u - 0.74) / 0.22));
        rig.apply(gestures[gi % gestures.length], talkW * env * (A.gesture ?? 1));
      }

      // one-shot clip
      let fwd = 0, up = 0, sq = 0;
      if (clip) {
        if (!clipHeld) clipT += dt * clipSpeed;
        const K = clip.keys, P = clipPoses[clipName];
        if (clipT >= clip.dur) {
          if (clip.hold) { clipT = clip.dur; clipHeld = true; ch.busy = false; }
          else { travel += clip.travel || 0; clip = null; ch.busy = false; ch.clip = ''; }
        }
        if (clip) {
          let i = 0; while (i < K.length - 2 && clipT > K[i + 1][0]) i++;
          const a = K[i], c = K[i + 1], u = smooth((clipT - a[0]) / Math.max(1e-4, c[0] - a[0]));
          if (P[i]) rig.apply(P[i], 1 - u); if (P[i + 1]) rig.apply(P[i + 1], u);
          fwd = a[2] + (c[2] - a[2]) * u; up = a[3] + (c[3] - a[3]) * u; sq = a[4] + (c[4] - a[4]) * u;
        }
      }
      fwd += travel;

      idleOpts.amount = (s.energy ?? 1) * (clip ? 0.3 : 1);
      idle(rig, time, idleOpts);
      const J = rig.joints;
      // emote flavour that is motion, not a pose
      if (emote === 'tears') { const sob = Math.sin(time * 9) * Math.max(0, Math.sin(time * 1.7)); J.chest.position[1] += sob * 0.004; addRot(J.head, sob * 1.5, 0, 0); }
      else if (emote === 'anger') { addRot(J.chest, 0, Math.sin(time * 31) * 0.7, 0); addRot(J.armL, 0, 0, Math.sin(time * 29) * 1.2); addRot(J.armR, 0, 0, Math.sin(time * 27) * 1.2); }
      else if (emote === 'smile') J.hips.position[1] += Math.abs(Math.sin(time * 3.1)) * 0.006;
      if (talkW > 0.01) addRot(J.head, Math.sin(time * 6.1 + seed) * 2.2 * talkW * mouthLevel, Math.sin(time * 2.3) * 1.5 * talkW, Math.sin(time * 3.7 + seed) * 1.6 * talkW);

      // facing: the whole body turns
      let targetYaw = yawNow;
      const pw = root.parent ? root.parent.world : null;
      if (typeof s.face === 'number') targetYaw = s.face;
      else if (s.face) { root.updateWorld(pw); targetYaw = Math.atan2(s.face[0] - root.world[12], s.face[2] - root.world[14]) / DEG - rootYaw(root); }
      else if (!yawInit) targetYaw = 0;
      if (!yawInit || snap) { yawNow = targetYaw; yawInit = true; }
      let dy = targetYaw - yawNow; dy -= Math.round(dy / 360) * 360;
      yawNow += dy * Math.min(1, dt * 7);
      body.setRot(0, yawNow, 0);
      const H = B.height;
      body.position[0] = Math.sin(yawNow * DEG) * fwd * height; body.position[2] = Math.cos(yawNow * DEG) * fwd * height; body.position[1] = up * height;
      body.scale[1] = H * (1 + sq); body.scale[0] = body.scale[2] = H / Math.sqrt(Math.max(0.3, 1 + sq));

      // look: the head turns most of the way, the eyes do the rest
      root.updateWorld(pw);
      let ly = 0, lp = 0, ex = 0, ey = 0;
      const target = s.look === 'camera' ? (s.camera ? s.camera.position : null) : s.look;
      if (target) {
        m4.invert(inv, J.head.world); // the head as posed, before the look is added
        v3.transformPoint(tmp, target, inv);
        tmp[1] -= dim.headC;
        const yaw = Math.atan2(tmp[0], tmp[2]) / DEG, pitch = Math.atan2(tmp[1], Math.hypot(tmp[0], tmp[2])) / DEG;
        const cyaw = Math.max(-75, Math.min(75, yaw)), cp = Math.max(-35, Math.min(35, pitch));
        ly = cyaw * 0.72; lp = cp * 0.6;
        ex = Math.max(-1, Math.min(1, (cyaw - ly) / 18)); ey = Math.max(-1, Math.min(1, (cp - lp) / 14));
      } else { // nobody to look at: the eyes wander a little
        const g = Math.floor(time / 2.9 + seed), r1 = Math.sin(g * 12.9898) * 43758.5453, r2 = Math.sin(g * 78.233) * 12543.123;
        ex = ((r1 - Math.floor(r1)) - 0.5) * 0.9; ey = ((r2 - Math.floor(r2)) - 0.5) * 0.4;
      }
      const lk = snap ? 1 : Math.min(1, dt * 9), ek = snap ? 1 : Math.min(1, dt * 16);
      lookYaw += (ly - lookYaw) * lk; lookPitch += (lp - lookPitch) * lk; eyeX += (ex - eyeX) * ek; eyeY += (ey - eyeY) * ek;
      if (lookYaw !== 0 || lookPitch !== 0) addRot(J.head, -lookPitch, lookYaw, 0);

      // springs
      for (let i = 0; i < springs.length; i++) {
        const sp = springs[i];
        if (s.wind) { sp.wind[0] = s.wind[0]; sp.wind[1] = s.wind[1]; sp.wind[2] = s.wind[2]; } else { sp.wind[0] = sp.wind[1] = sp.wind[2] = 0; }
        sp.update(dt);
      }

      // the hanging prop and its light
      root.updateWorld(pw);
      if (lampNode) {
        if (lampNode.hang) { down[0] = Math.sin(time * 1.7 + seed) * 0.1; down[1] = -1; down[2] = Math.cos(time * 1.3) * 0.07; aimAxis(lampNode, DOWN, down); lampNode.updateWorld(lampNode.parent.world); }
        const lw = lampLight.world; lampPos[0] = lw[12]; lampPos[1] = lw[13]; lampPos[2] = lw[14];
        lampLight.light.intensity = lit * (0.92 + 0.08 * Math.sin(time * 13 + seed) * Math.sin(time * 7.3));
      }
      const hw = J.head.world;
      tmp2[0] = 0; tmp2[1] = dim.headC; tmp2[2] = 0; v3.transformPoint(headPos, tmp2, hw);

      // the face
      if (face) {
        const T = face.table[emote];
        const shut = s.eyes === 'shut' || (!snap && s.eyes !== 'open' && (blinkHold > 0 || blink(time, seed) > 0.45));
        face.lids.uvRect.set(shut ? T.shut : T.open);
        setEyes(T.eye, eyeX * 0.105, eyeY * 0.08);
        face.mouth.uvRect.set(T.mouth[mouthLevel < 0.12 ? 0 : mouthLevel < 0.42 ? 1 : mouthLevel < 0.72 ? 2 : 3]);
        if (T.fx) { face.fx.visible = true; face.fx.uvRect.set(T.fx); } else face.fx.visible = false;
      }
      if (skinNode) { flash = Math.max(0, flash - dt * 5); skinNode.flash[0] = skinNode.flash[1] = skinNode.flash[2] = 1; skinNode.flash[3] = flash * 0.85; }
    },
  };

  // cost
  let tris = 0; for (const sk of skins) tris += sk.mesh.indices.length / 3;
  ch.stats.triangles = tris + (face ? face.tris : 0); ch.stats.lod = lod;
  ch.stats.draws = skins.length * 3 + (face ? 4 : 0);
  ch.stats.vertices = skins.reduce((a, sk) => a + vertexCount(sk.mesh), 0);
  ch.update(0, NOSTATE);
  return ch;
}

const DOWN = [0, -1, 0];
const MIRRORS = new WeakMap();
function mirrored(pose) { let m = MIRRORS.get(pose); if (!m) { m = mirrorPose(pose); MIRRORS.set(pose, m); } return m; }
function rootYaw(root) { const w = root.world; return Math.atan2(w[8], w[10]) / DEG; }
// tint only the vertices that are still white (pieces that carry their own colours keep them)
function tintWhite(mesh, color) {
  const c = rgb(color), C = mesh.colors;
  for (let i = 0; i < C.length; i += 3) if (C[i] === 1 && C[i + 1] === 1 && C[i + 2] === 1) { C[i] = c[0]; C[i + 1] = c[1]; C[i + 2] = c[2]; }
  return mesh;
}
let sharedMat = null;
function defaultMaterial() { return sharedMat || (sharedMat = figureMaterial()); }

// ------------------------------------------------------------------------------------ the cast
//
// A def is plain data:
//   id, skin '#rrggbb', seed (blink and idle phase)
//   build    { height, head, legs, torso, arms, width, hands, feet, belly }   multipliers, 1 = the standard chibi
//   hair     { color, brow (colour), pieces: [{ kind, ...spec }] }            kinds: see HAIR
//   face     { set 'round' | 'lash' | 'old', iris, eyeScale, eyeYaw, eyePitch, mouthScale, mouthPitch,
//              brow { w, len, at: [yaw, pitch], color, nick 'L'|'R' (a scar's gap) }, marks { blush, freckles, laugh, scar 'L'|'R', beauty, stubble }, nose 0 }
//   costume  { top { color, hem (y of the hem below the hip joint: -0.03 a jacket, -0.16 a long coat), flare, trim, placket, lining },
//              sleeves { color, cuff, flare, ink 'L'|'R' }, legs { color }, shoes { color, sole, cuff, tall },
//              collar { kind 'stand' | 'flat' | 'scarf', color }, belt { color, buckle }, buttons { color, rows, count, size },
//              extras [{ kind, ...spec }] }                                    kinds: see EXTRAS
//   props    [{ kind, hand 'L' | 'R', ...spec }]                               kinds: see PROPS
//   handed   'L' plays every clip mirrored (strike with the left arm): for figures that face the other way on a stage
//   poses    { stand, signature, ...any } overlays on / replacements for POSES by name
//   gestures [pose names] cycled while speaking;  anim { gesture (amount), gesturePeriod };  idle { speed, breath, bob, sway }

export const CAST = {
  // Ren Vasker, 19: Halcyon cadet. Guarded, literal, dry. Stands like someone who was taught to.
  ren: {
    id: 'ren', seed: 1, skin: '#e9b184',
    build: { height: 1.0, legs: 1.2, torso: 1.04, head: 0.97, width: 0.95, arms: 1.06 },
    hair: {
      color: '#2b3157', brow: '#232846',
      pieces: [
        { kind: 'cap', front: 0.5, side: 0.02, back: -0.62, zig: 0.1, zigN: 2.6, grow: [1.06, 1.1, 1.08] },
        { kind: 'spikes', sweep: [0.1, 0.3, -0.55], thick: 0.72, spikes: [
          [0, 78, 0.2, 0.085, 1], [42, 58, 0.19, 0.08], [-46, 60, 0.2, 0.082, 1], [0, 46, 0.14, 0.07, 0, [-0.2, 0.75, 0.3]],
          [95, 44, 0.19, 0.08, 0, [0.5, 0.25, -0.45]], [-98, 42, 0.2, 0.082, 0, [-0.5, 0.25, -0.45]],
          [150, 48, 0.2, 0.085], [-150, 46, 0.19, 0.082], [180, 18, 0.19, 0.085, 0, [0, -0.05, -0.5]],
          [125, 8, 0.15, 0.07, 0, [0.35, -0.1, -0.5]], [-125, 8, 0.15, 0.07, 0, [-0.35, -0.1, -0.5]],
        ] },
        { kind: 'locks', locks: [
          { pts: [[16, 62, 1.02], [8, 44, 1.1], [-4, 28, 1.1], [-13, 17, 1.07]], w: 0.075 },
          { pts: [[40, 56, 1.03], [38, 40, 1.09], [31, 27, 1.09], [24, 19, 1.06]], w: 0.062 },
          { pts: [[-18, 60, 1.03], [-30, 44, 1.09], [-41, 30, 1.09], [-49, 19, 1.06]], w: 0.066 },
          { pts: [[-52, 44, 1.04], [-64, 26, 1.07], [-70, 8, 1.06], [-70, -6, 1.04]], w: 0.05 },
          { pts: [[62, 42, 1.04], [70, 24, 1.07], [74, 8, 1.06], [73, -4, 1.04]], w: 0.048 },
        ] },
      ],
    },
    face: { set: 'round', iris: '#3f8fe0', brow: { w: 0.023, len: 25, nick: 'L' }, marks: { blush: 0.32 } },
    costume: {
      top: { color: '#2f5fb8', hem: -0.035, flare: 1.22, trim: '#b9c6da', placket: '#24478f' },
      sleeves: { cuff: '#b9c6da', flare: 1.12 },
      legs: { color: '#44539c' }, shoes: { color: '#2c2b52', sole: '#b9c6da', cuff: '#c3cfe0', tall: true },
      collar: { kind: 'stand', color: '#c3cfe0' }, belt: { color: '#2c2b52', buckle: '#ffd24a' },
      buttons: { color: '#ffd24a', rows: 2, count: 3 },
      extras: [{ kind: 'epaulettes', color: '#c3cfe0' }, { kind: 'earring', side: 'L', color: '#ffd24a' }, { kind: 'earpiece', side: 'R' }],
    },
    poses: {
      // parade rest gone slightly wrong: straight back, chin down, one hand a fist, weight all on one leg
      stand: {
        hips: { r: [0, -16, 4], p: [0.016, 0, 0] }, chest: [-3, 10, -6], head: [7, 14, 6],
        legL: [0, 14, 13], shinL: [3, 0, 0], legR: [0, -6, -2],
        armL: [8, 0, 10], foreL: [-10, 0, 0], armR: [-26, 0, -34], foreR: [-48, 0, 74], handR: [0, 0, 16],
      },
      // listening to the Line: two fingers to the earpiece, eyes away
      signature: { chest: [2, -10, 5], head: [8, -16, -12], armR: [-6, 0, -98], foreR: [-8, 0, -146], handR: [0, 0, -20], armL: [10, 0, 6] },
    },
    gestures: ['talkSmall', 'talkChin', 'talkOpen'], anim: { gesture: 0.8, gesturePeriod: 2.8 }, idle: { sway: 0.6, bob: 0.7 },
  },

  // Ilse Maravel, 18: a magistrate's clerk. Quick, funny, furious about procedure. Never quite still.
  ilse: {
    id: 'ilse', seed: 2, skin: '#ffdcbf',
    build: { height: 0.93, legs: 1.0, torso: 0.98, head: 1.02, width: 0.9 },
    hair: {
      color: '#d9582b', brow: '#a8421f',
      pieces: [
        // a smooth full crown; the shape is in the fringe, the two loose locks and the braid, not in ridges on the skull
        { kind: 'cap', front: 0.52, side: -0.24, back: -0.74, grow: [1.085, 1.115, 1.1], shift: [0, 0.012, -0.018] },
        // the parting is over her left eye; five tufts sweep across the brow to her right, each a different length
        { kind: 'fringe', n: 5, from: 36, to: -52, part: 26, top: 66, tips: [21, 12, 17, 8, 0], sweep: -7, gather: 0.3, r: 1.125 },
        { kind: 'locks', locks: [
          { pts: [[34, 62, 1.03], [48, 42, 1.1], [57, 22, 1.1], [60, 4, 1.075]], w: 0.062 },
          { pts: [[6, 72, 1.0], [12, 88, 1.15], [30, 82, 1.22]], w: 0.03, thick: 0.9, ink: 1 },
        ] },
        { kind: 'sidelocks', yaw: 63, top: 4, length: 0.17, w: 0.04, out: 0.016, curl: 0.024 },
        { kind: 'braid', at: [-118, -30], dir: [-0.16, -1, 0.42], length: 0.36, width: 0.05, links: 3, tie: '#ffd24a' },
        { kind: 'pencil', at: [-104, 30], dir: [-0.5, 0.8, -0.34], length: 0.22, r: 1.06, out: 0.1 },
      ],
    },
    face: { set: 'lash', iris: '#3fae6a', eyeScale: 1.04, brow: { w: 0.015, len: 22 }, marks: { blush: 0.55, freckles: true } },
    costume: {
      top: { color: '#fff1d6', hem: -0.15, flare: 1.42, trim: '#ffcf3f', lining: '#c98a5a' },
      sleeves: { cuff: '#ffcf3f', flare: 1.3, ink: 'R' },
      legs: { color: '#5a3d6e' }, shoes: { color: '#a8542e', sole: '#5a2c1c' },
      collar: { kind: 'flat', color: '#ffffff' },
      extras: [{ kind: 'chain', color: '#ffcf3f', seal: '#ffb020' }, { kind: 'satchel', side: 'L', color: '#c9713a' }],
    },
    poses: {
      // up on her toes of attention: leaning in, a hand on her hip, head cocked
      stand: {
        hips: { r: [3, 10, -4], p: [-0.012, 0, 0] }, chest: [3, -8, 5], head: [-5, -10, -8],
        legL: [-4, 10, 7], shinL: [8, 0, 0], legR: [2, -6, -4],
        armL: [14, 0, 44], foreL: [-24, 0, -96], handL: [0, 0, -20], armR: [-4, 0, -16], foreR: [-34, 0, 0],
      },
      // "Point of order!": leaning in behind a pointing arm, the other fist on her hip
      signature: { hips: { r: [8, 14, -4], p: [0, 0, 0.02] }, chest: [10, 12, 4], head: [-14, -16, -8], armR: [-96, 0, -8], foreR: [-4, 0, 0], handR: [-10, 0, 0], legL: [14, 10, 8], legR: [-16, -6, -4], shinR: [14, 0, 0] },
    },
    gestures: ['talkPoint', 'talkBoth', 'talkOpen', 'talkShrug'], anim: { gesture: 1.15, gesturePeriod: 1.7 }, idle: { speed: 1.25, bob: 1.3, sway: 1.2 },
  },

  // Nan Okerby, 70s: lantern-maker on the Vessery docks. Old, sly, gentle. Small and round and bent, and the lantern is lit.
  nan: {
    id: 'nan', seed: 3, skin: '#b9856e',
    build: { height: 0.86, legs: 0.74, torso: 0.98, head: 1.04, width: 1.14, belly: 0.25, arms: 0.95 },
    hair: {
      color: '#f6f1ea', brow: '#efe8de',
      pieces: [
        { kind: 'cap', front: 0.56, side: 0.06, back: -0.56, grow: [1.05, 1.07, 1.07] },
        { kind: 'bun', at: [180, 62], size: 0.105, out: 0.55, band: '#e8483f', pin: '#8a5a34', pinKnob: '#ffd24a', pinDir: [0.94, 0.3, 0.1] },
        { kind: 'locks', locks: [
          { pts: [[4, 66, 1.02], [24, 52, 1.08], [44, 34, 1.08], [56, 14, 1.06], [58, -2, 1.04]], w: 0.07 },
          { pts: [[-4, 66, 1.02], [-24, 52, 1.08], [-44, 34, 1.08], [-56, 14, 1.06], [-58, -2, 1.04]], w: 0.07 },
          { pts: [[-62, 8, 1.04], [-66, -8, 1.07], [-62, -22, 1.09]], w: 0.03, thick: 0.8 },
        ] },
      ],
    },
    face: { set: 'old', iris: '#7a4a26', eyeScale: 0.86, eyePitch: -8, mouthPitch: -32.5, brow: { w: 0.014, len: 21, at: [25, 9.5] }, marks: { blush: 0.5, laugh: true, blushColor: '#e0625a' } },
    costume: {
      top: { color: '#2f8f8a', hem: -0.13, flare: 1.34, trim: '#1f6f72', lining: '#1a4a5a' },
      sleeves: { color: '#2f8f8a', flare: 1.2 },
      legs: { color: '#5a3a2a' }, shoes: { color: '#7a4a2a', sole: '#4a2a1a' },
      extras: [{ kind: 'apron', color: '#fff3d8', pocket: '#ffd98a', spread: 1.7 }, { kind: 'shawl', color: '#f2503f', color2: '#cf3434', trim: '#ffe9c4', length: 0.098 }],
    },
    props: [{ kind: 'lantern', hand: 'R' }],
    poses: {
      // bent over her own work, looking up at you from under her brows
      stand: {
        hips: { r: [5, 8, 0], p: [0, -0.006, -0.01] }, chest: [11, -4, 3], head: [-13, -8, 6],
        legL: [-6, 8, 4], legR: [-6, -8, -4],
        armL: [-8, 0, 14], foreL: [-46, 0, -18], armR: [-30, 0, -22], foreR: [-58, 10, 0],
      },
      // holding the lantern up to see who it is
      signature: { chest: [4, 8, 0], head: [-18, -4, 8], armR: [-78, 0, -22], foreR: [-66, 0, 0], hips: { r: [3, 8, 0] } },
    },
    gestures: ['talkPat', 'talkSmall', 'talkShrug'], anim: { gesture: 0.8, gesturePeriod: 3.0 }, idle: { speed: 0.75, breath: 1.3, bob: 0.8, sway: 0.8 },
  },

  // A Mint bailiff: the generic opposition. Broad, buttoned up, a peaked cap down over the brow.
  bailiff: {
    id: 'bailiff', seed: 4, skin: '#f2c9a4',
    build: { height: 1.04, legs: 1.05, torso: 1.12, head: 0.95, width: 1.24, belly: 0.12, hands: 1.15, feet: 1.1 },
    hair: {
      color: '#6a4a3a', brow: '#4a3226',
      pieces: [{ kind: 'cap', front: 0.5, side: 0.05, back: -0.5 }, { kind: 'kepi', color: '#8a1f3a', band: '#ffd24a', peak: '#2a2540' }],
    },
    face: { set: 'round', iris: '#5a4a3a', eyeScale: 0.8, eyePitch: -7, brow: { w: 0.026, len: 24, at: [24, 11] }, marks: { blush: 0.4, stubble: true } },
    costume: {
      top: { color: '#a3283f', hem: -0.07, flare: 1.2, trim: '#ffd24a', placket: '#7a1c30' },
      sleeves: { cuff: '#ffd24a', flare: 1.1 }, legs: { color: '#2a2540' }, shoes: { color: '#1f1b30', sole: '#4a4560', tall: true },
      collar: { kind: 'stand', color: '#ffd24a' }, belt: { color: '#2a2540', buckle: '#ffd24a' }, buttons: { color: '#ffd24a', rows: 2, count: 3 },
      extras: [{ kind: 'epaulettes', color: '#ffd24a' }, { kind: 'moustache', color: '#6a4a3a' }],
    },
    props: [{ kind: 'baton', hand: 'L' }], handed: 'L',
    poses: {
      stand: {
        hips: { r: [0, -8, 2] }, chest: [-4, 6, -2], head: [6, 8, 3], legL: [0, 8, 7], legR: [0, -8, -7],
        armR: [12, 0, -30], foreR: [-20, 0, 90], armL: [0, 0, 16], foreL: [-58, 0, 0],
      },
      signature: { armL: [-70, 0, 14], foreL: [-40, 0, 0], chest: [6, -10, 0], head: [2, 8, 0] },
    },
    gestures: ['talkPoint', 'talkSmall'], anim: { gesture: 0.9 }, idle: { speed: 0.8, sway: 0.5 },
  },
};
