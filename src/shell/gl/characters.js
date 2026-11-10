// The cast as toon figures: a parametric chibi body, hair and costume built from pieces, a face of
// decals (faces.js) with 3D brows, and the animation that keeps them alive.
// Pure apart from the face atlas: without `faces` a character is built faceless (node, tests).
//
//   const faces = createFaces();                       // once, shell only (needs a canvas)
//   const ren = createCharacter(CAST.ren, { faces });  // { faces, material, detail, lod: 'full' | 'stage' }
//   CAST: ren ilse nan tobb corvane maravel thorne narrator | bailiff steward clerk proctor docker (= crowd) docker-lantern docker-hat
//         townsman townswoman fishwife child child2 | sable hesper ansel wyn foss tamsin
//         rank and file of chapters 2-8: miner cadet cadet-junior underwriter magistrate islander islander-lantern broker commons-steward marine escort rower fisher member
//         the same people in other clothes (own ids; a figure cannot change costume): ren-volunteer ren-lantern ren-irons ren-storm ren-hooded ilse-tribune ilse-storm
//         ilse-hooded ilse-old (the Ledger, hood down) tobb-storm tobb-hooded corvane-plain sable-plain maravel-plain thorne-irons
//   castVariant(id, k): the k-th look of a rank-and-file member.   createCrowd({...}): 20 to 40 cheap background people in two draws.
//   scene.root.add(ren.root); ren.root.setPos(x, 0, z);
//   ren.update(dt, { emote: 'smile', speaking: true, pose: 'stand', look: 'camera' | [x, y, z] | other.headPos, face: [x, y, z] | yawDeg, camera });
//   ren.act('strike');                                 // one-shot clips, see CLIPS
//
// A character is ONE batched draw (+ outline + shadow) and four face decals (five while an emote
// shows an overlay); at lod 'stage' three decals, 2.2k to 3.8k triangles instead of 7k to 11k.
// Everything a def can ask for is listed above CAST near the bottom of this file.

import { v3, m4, quat, DEG, rgb, rng } from './math.js';
import {
  sphere, ellipsoid, superellipsoid, blob, cylinder, cone, lathe, limb, torus, roundedBox, curve, fromArrays,
  merge, tint, paint, place, setGlow, setOutline, mirrorX, scale as scaleMesh, vertexCount,
} from './mesh.js';
import { Node, node, group, material, makeLight, batchFigure, nodeBounds } from './scene.js';
import { createRig, idle, blink, createSpring, addRot, aimAxis } from './rig.js';
import { EMOTES, EMOTE, FACE, useCell } from './faces.js';

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
  for (let i = 0; i < seg; i++) { m.owidth[i * R + rows] = 0; m.owidth[i * R + rows + 1] = 0; m.owidth[i * R + rows - 1] = 0.5; } // the hairline is not an ink line
  return m;
}

/** A lock lying on the head through [yaw, pitch, radiusFactor] points. Inked only toward its tip unless `ink` says otherwise. */
function lockOn(hd, pts, width, { thick = 0.42, n = 10, seg = 8, ink = tipInk } = {}) {
  const w = lockW(width);
  return strand(curve(pts.map((q) => hd.at(q[0], q[1], q[2] ?? 1.04)), n), w, (t) => w(t) * thick + 0.002, seg, null, ink);
}
/** A spike growing out of the head at yaw/pitch, bent along `sweep`. */
function spikeOn(hd, yaw, pitch, len, width, sweep = [0, 0, 0], { thick = 0.7, seg = 7, root = 0.86, n = 6 } = {}) {
  const p0 = hd.at(yaw, pitch, root), n0 = norm(p0);
  const d = norm([n0[0] + sweep[0], n0[1] + sweep[1], n0[2] + sweep[2]]);
  const d2 = norm([d[0] + sweep[0] * 0.7, d[1] + sweep[1] * 0.7, d[2] + sweep[2] * 0.7]);
  const p1 = [p0[0] + d[0] * len * 0.5, p0[1] + d[1] * len * 0.5, p0[2] + d[2] * len * 0.5];
  const p2 = [p1[0] + d2[0] * len * 0.5, p1[1] + d2[1] * len * 0.5, p1[2] + d2[2] * len * 0.5];
  const w = (t) => width * (1 - t * t) * (0.62 + 0.38 * (1 - t)) + 0.003;
  return strand(curve([p0, p1, p2], n), w, (t) => w(t) * thick, seg);
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
      fixed.push(place(size < 0.035 ? ellipsoid(size, size * 0.8, size, 5, 3) : blob({ rx: size, ry: size * 0.9, rz: size, lumps: 0.25, seed: i + 1, seg: ctx.S(10), rings: ctx.S(7) }), c[0], c[1], c[2]));
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
    const m = dye(hairCap(hd, { front: s.front ?? 0.6, side: s.side ?? -0.18, back: s.back ?? -0.66, grow: [1.13, 1.15, 1.14], seg: ctx.S(24), rings: ctx.S(14) }), col);
    const k = hd.at(180, -34, 1.14), out = { fixed: [m, dye(place(blob({ rx: 0.04, ry: 0.034, rz: 0.034, seg: ctx.S(9), rings: ctx.S(6) }), k[0], k[1], k[2]), col)], swing: [] };
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
      if (!k[4]) { fixed.push(spikeOn(hd, k[0], k[1], k[2], k[3], sw, { thick: s.thick ?? 0.7, seg: ctx.S(7), n: ctx.N(6) })); return; }
      const base = hd.at(k[0], k[1], 0.86), m = spikeOn(hd, k[0], k[1], k[2], k[3], sw, { thick: s.thick ?? 0.7, seg: ctx.S(7), n: ctx.N(6) });
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

  // ---- hats of the later chapters. All sit on whatever hair there is and carry their own colours.

  /** A knitted cap, band turned up, with a bobble: { color, band, bobble (false: none), low (how far down it is pulled, 0.42) }. */
  knitcap(hd, s, ctx) {
    const R = hd.R, col = s.color || '#d9cdb2', low = s.low ?? 0.42, rr = Math.sqrt(1 - low * low);
    const out = [dye(hairCap(hd, { front: low, side: low, back: low - 0.1, grow: [1.12, 1.2, 1.13], seg: ctx.S(20), rings: ctx.S(12) }), col),
      dye(place(scaleMesh(torus(R[0] * rr * 1.13, 0.03, ctx.S(18), ctx.lo ? 4 : 6), 1, 1.1, R[2] / R[0]), 0, R[1] * low + 0.012, -0.006, -4, 0, 0), s.band || mixc(col, '#1a1040', 0.22))];
    if (s.bobble !== false) out.push(dye(place(sphere(R[0] * 0.26, ctx.lo ? 6 : 9, ctx.lo ? 4 : 6), 0, R[1] * 1.34, -0.012), s.bobble || s.band || mixc(col, '#1a1040', 0.22)));
    return { fixed: out };
  },

  /** A sou'wester: an oilskin dome and a brim that runs long down the back of the neck: { color, under }. */
  souwester(hd, s, ctx) {
    const R = hd.R, col = s.color || '#f2c230', y = R[1] * 0.46;
    const brim = scaleMesh(lathe([[R[0] * 0.9, 0.012], [R[0] * 1.62, -0.05], [R[0] * 1.66, -0.062], [R[0] * 0.9, -0.012]], ctx.S(20), { crease: 180 }), 1, 1, 1.22);
    return { fixed: [
      dye(hairCap(hd, { front: 0.42, side: 0.4, back: 0.34, grow: [1.1, 1.17, 1.11], seg: ctx.S(20), rings: ctx.S(12) }), col),
      dye(place(brim, 0, y, -R[2] * 0.2, -9, 0, 0), col),
      dye(place(scaleMesh(torus(R[0] * 0.95, 0.016, ctx.S(16), 4), 1, 1, R[2] / R[0]), 0, y + 0.012, -0.006, -6, 0, 0), s.under || mixc(col, '#3a1a10', 0.3))] };
  },

  /** A round steel cap with a narrow brim and a comb along the crown: { color, comb }. */
  helm(hd, s, ctx) {
    const R = hd.R, col = s.color || '#c0c6d6', y = R[1] * 0.4;
    const brim = scaleMesh(lathe([[R[0] * 0.92, 0.012], [R[0] * 1.3, -0.016], [R[0] * 1.32, -0.028], [R[0] * 0.92, -0.008]], ctx.S(20), { crease: 180 }), 1, 1, R[2] / R[0] * 1.04);
    const comb = strand(curve([hd.at(0, 34, 1.16), hd.at(0, 90, 1.24), hd.at(180, 30, 1.16)], ctx.N(8)), () => 0.016, () => 0.02, ctx.lo ? 4 : 6);
    return { fixed: [
      dye(hairCap(hd, { front: 0.36, side: 0.36, back: 0.3, grow: [1.1, 1.15, 1.11], seg: ctx.S(20), rings: ctx.S(12) }), col),
      dye(place(brim, 0, y, -0.006, 3, 0, 0), s.brim || mixc(col, '#1a1040', 0.2)),
      dye(comb, s.comb || mixc(col, '#1a1040', 0.3))] };
  },

  /** A bowler: a hard round crown, a band and a curled brim: { color, band }. */
  bowler(hd, s, ctx) {
    const R = hd.R, col = s.color || '#3a3040', y = R[1] * 0.5;
    const brim = scaleMesh(lathe([[R[0] * 0.9, 0.006], [R[0] * 1.2, -0.004], [R[0] * 1.26, 0.02], [R[0] * 1.2, 0.024], [R[0] * 0.9, 0.02]], ctx.S(20), { crease: 60 }), 1, 1, R[2] / R[0] * 1.06);
    return { fixed: [
      dye(hairCap(hd, { front: 0.46, side: 0.46, back: 0.42, grow: [1.09, 1.36, 1.11], seg: ctx.S(20), rings: ctx.S(12) }), col),
      dye(place(brim, 0, y, -0.004, 6, 0, 0), col),
      dye(place(scaleMesh(cylinder(R[0] * 0.99, R[0] * 0.97, R[1] * 0.14, ctx.S(18), { crease: 50 }), 1, 1, R[2] / R[0] * 1.02), 0, y + 0.018, -0.008, 6, 0, 0), s.band || '#ffd24a')] };
  },

  /** A soft cap of office: a band and a full cloth crown, square (a Bench cap) or round and tall (an Assembly cap): { color, band, tall, wide, square, button }. */
  toque(hd, s, ctx) {
    const R = hd.R, col = s.color || '#23202f', tall = s.tall ?? 1, y = R[1] * 0.5, hh = R[1] * 0.42 * tall;
    const crown = s.square
      ? place(roundedBox(R[0] * 2.12, hh, R[0] * 2.12, 0.035, ctx.lo ? 1 : 2), 0, y + R[1] * 0.14 + hh * 0.5, -0.012, -4, 45, 0)
      : place(blob({ rx: R[0] * 1.16 * (s.wide ?? 1), ry: hh * 0.72, rz: R[2] * 1.2 * (s.wide ?? 1), flatBottom: 0.35, lumps: 0.1, seed: 2, seg: ctx.S(16), rings: ctx.S(9) }), 0, y + R[1] * 0.12 + hh * 0.5, -0.016, -5, 0, 0);
    const out = [
      dye(crown, col),
      dye(place(scaleMesh(cylinder(R[0] * 0.95, R[0] * 0.97, R[1] * 0.22, ctx.S(18), { crease: 50 }), 1, 1, R[2] / R[0]), 0, y - 0.01, -0.006, -3, 0, 0), s.band || mixc(col, '#ffffff', 0.25))];
    if (s.button) out.push(dye(place(sphere(R[0] * 0.1, ctx.lo ? 5 : 8, ctx.lo ? 4 : 6), 0, y + R[1] * 0.16 + hh * (s.square ? 1.05 : 1.2), -0.014), s.button));
    return { fixed: out };
  },

  /** A cloth band round the brow, knotted behind with two short ends: { color }. */
  headband(hd, s, ctx) {
    const R = hd.R, col = s.color || '#e8483f', k = hd.at(180, 22, 1.1);
    const ends = [-1, 1].map((sx) => strand([[k[0], k[1], k[2]], [k[0] + sx * 0.03, k[1] - 0.05, k[2] - 0.03], [k[0] + sx * 0.05, k[1] - 0.11, k[2] - 0.03]], (t) => 0.022 * (1 - t * 0.5), () => 0.007, ctx.lo ? 4 : 5, [0, 0, -1]));
    return { fixed: [
      dye(place(scaleMesh(torus(R[0] * 1.045, 0.026, ctx.S(18), ctx.lo ? 4 : 6), 1, 1.25, R[2] / R[0] * 1.02), 0, R[1] * 0.36, -0.006, -8, 0, 0), col),
      dye(place(sphere(0.03, 6, 4), k[0], k[1], k[2]), col), dye(merge(ends), col)] };
  },

  /** A miner's cap: hard leather, a short peak, and a lamp on the brow that is lit: { color, lamp (the flame's colour), lit: false }. */
  lampcap(hd, s, ctx) {
    const R = hd.R, col = s.color || '#6a4a32', y = R[1] * 0.44, lz = R[2] * 1.12, ly = R[1] * 0.72;
    const flame = dye(place(sphere(0.03, ctx.lo ? 6 : 8, ctx.lo ? 4 : 6), 0, ly, lz + 0.03), s.lamp || '#ffe08a');
    return { fixed: [
      dye(hairCap(hd, { front: 0.42, side: 0.34, back: 0.2, grow: [1.1, 1.16, 1.11], seg: ctx.S(20), rings: ctx.S(12) }), col),
      dye(place(scaleMesh(cylinder(R[0] * 0.7, R[0] * 0.72, 0.016, ctx.S(12), { crease: 50 }), 1, 1, 0.7), 0, y, R[2] * 0.78, 14, 0, 0), s.peak || mixc(col, '#1a1030', 0.35)),
      dye(place(cylinder(0.042, 0.03, 0.05, ctx.S(10), { crease: 50 }), 0, ly, lz - 0.01, 90, 0, 0), s.brass || '#d9a94a'),
      s.lit === false ? flame : setOutline(setGlow(flame, 1), 0)] };
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
    for (const sx of [-1, 1]) b.parts.chest.push(tint(place(roundedBox(0.085, 0.022, 0.07, 0.01, b.lo ? 1 : 2), sx * d.shoulderX * 0.92, d.shoulderY + 0.038, 0, 0, 0, -sx * 14), s.color));
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
    const k = s.size ?? 1;
    b.parts.head.push(setOutline(tint(place(torus(0.024 * k, 0.0085 * k, b.lo ? 7 : 12, b.lo ? 4 : 6), sx * (R[0] * 1.13), b.dim.headC - R[1] * (0.34 + 0.12 * k), 0.0, 90, sx * 50, 0), s.color || '#ffd24a'), 0.7));
  },
  /** The wire of an earpiece, from behind one ear down into the collar. */
  earpiece(b, s) {
    const sx = s.side === 'L' ? 1 : -1, R = b.hd.R, y = b.dim.headC;
    b.parts.head.push(setOutline(tint(place(sphere(0.017, 8, 6), sx * R[0] * 1.1, y - R[1] * 0.14, 0.012), s.color || '#c9d2de'), 0.6));
    b.parts.head.push(setOutline(tint(strand(curve([[sx * R[0] * 1.1, y - R[1] * 0.16, 0.0], [sx * R[0] * 1.06, y - R[1] * 0.5, -0.05], [sx * R[0] * 0.7, y - R[1] * 0.92, -0.09]], 6), () => 0.0035, () => 0.0035, 5), s.color || '#c9d2de'), 0));
  },
  /** Round spectacles: { color, size }, or with half: true, half-moons: a bar under each pupil and the lens hanging below it, to be looked over. */
  glasses(b, s) {
    const hd = b.hd, y = b.dim.headC, col = s.color || '#3a3050', ep0 = b.face.eyePitch ?? FACE.eyePitch, ey = b.face.eyeYaw ?? FACE.eyeYaw, k = s.size ?? 1;
    if (s.half) {
      const w = 12.5 * k, drop = 12 * k, top = ep0 - 3.5, parts = [];
      for (const sx of [-1, 1]) {
        const pts = []; for (let i = 0; i <= 10; i++) { const a = Math.PI * (i / 10); pts.push(hd.at(sx * ey + Math.cos(a) * w, top - Math.sin(a) * drop, 1.065)); }
        pts.push(hd.at(sx * ey + w, top, 1.065));
        parts.push(strand(pts, () => 0.0052, () => 0.0052, b.lo ? 3 : 5));
      }
      parts.push(strand([hd.at(-ey + w, top, 1.07), hd.at(0, top + 1.5, 1.085), hd.at(ey - w, top, 1.07)], () => 0.0052, () => 0.0052, b.lo ? 3 : 5));
      b.parts.head.push(setOutline(tint(place(merge(parts), 0, y, 0), col), 0.5));
      return;
    }
    const ep = ep0 + 1, rr = hd.R[0] * 0.25 * k;
    for (const sx of [-1, 1]) {
      const c = hd.at(sx * ey, ep, 1.07), q = quat.fromTo(quat.create(), [0, 1, 0], norm(c));
      const ring = xform(torus(rr, 0.007, b.lo ? 9 : 16, b.lo ? 3 : 5), c, q); place(ring, 0, y, 0); b.parts.head.push(tint(ring, col));
    }
    const a = hd.at(-8, ep + 3, 1.09), c = hd.at(8, ep + 3, 1.09);
    b.parts.head.push(tint(place(strand([a, hd.at(0, ep + 5, 1.1), c], () => 0.006, () => 0.006, 5), 0, y, 0), col));
  },
  /** A beard under the mouth: { shape 'square' | 'full' | 'point', color, size, whiskers: false }. */
  beard(b, s) {
    const hd = b.hd, R = hd.R, y = b.dim.headC, k = s.size ?? 1, col = s.color || '#9a9aa0', sq = s.shape === 'square';
    let m = sq ? superellipsoid(R[0] * 0.54 * k, R[1] * 0.36 * k, R[2] * 0.3 * k, 0.5, 0.5, b.S(14), b.S(9))
      : blob({ rx: R[0] * 0.56 * k, ry: R[1] * 0.36 * k, rz: R[2] * 0.32 * k, chin: s.shape === 'point' ? 1 : 0.3, pear: -0.3, seg: b.S(14), rings: b.S(9) });
    b.parts.head.push(tint(place(m, 0, y - R[1] * (sq ? 0.985 : 1.04), R[2] * 0.52), col));
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
  /** A sash of office from one shoulder to the other hip, with a rosette where it crosses the heart: { color, edge, rosette, from 'L' | 'R' }. */
  sash(b, s) {
    const d = b.dim, sx = s.from === 'R' ? -1 : 1, col = s.color || '#ffcf3f';
    for (const back of [1, -1]) {
      const pts = []; for (let i = 0; i <= 8; i++) { const u = i / 8, x = sx * (0.86 - u * 1.72) * d.shoulderX, y = d.shoulderY + 0.03 - u * (d.shoulderY + 0.035); pts.push([x, y, back * (b.torsoZ(x, y) + 0.01)]); }
      b.parts.chest.push(setOutline(tint(strand(pts, () => 0.03, () => 0.006, b.lo ? 4 : 5, [0, 0, back]), col), 0.5));
    }
    if (s.rosette !== false) { const x = sx * 0.4 * d.shoulderX, y = d.shoulderY - 0.05; b.parts.chest.push(setOutline(tint(place(cylinder(0.026, 0.026, 0.012, b.S(10), { crease: 40 }), x, y, b.torsoZ(x, y) + 0.008, 84, 0, 0), s.rosette || '#fff6dc'), 0.7)); }
  },
  /** Audit irons: a heavy band on each wrist (the chain between them is the 'shackle' prop, which hangs from one hand): { color }. */
  irons(b, s) {
    const d = b.dim, col = s.color || '#8d949e', r = 0.05 * (b.dim.rx / 0.132);
    for (const side of ['L', 'R']) b.parts['fore' + side].push(merge(
      tint(place(cylinder(r * 1.3, r * 1.3, 0.04, b.S(12), { crease: 50 }), 0, -d.fore - 0.02, 0), col),
      setOutline(tint(place(sphere(0.014, 5, 3), 0, -d.fore, r * 1.3), mixc(col, '#1a1040', 0.4)), 0)));
  },
  /** A hood thrown back: a roll of cloth round the neck and its point hanging between the shoulders: { color, lining }. */
  cowl(b, s) {
    const d = b.dim, col = s.color || '#6a5638', y = d.neckY - 0.012;
    b.parts.chest.push(tint(place(scaleMesh(torus(d.shoulderX * 0.92, 0.046, b.S(16), b.lo ? 5 : 7), 1, 0.8, 0.98), 0, y, -0.012, -14, 0, 0), col));
    b.parts.chest.push(tint(place(blob({ rx: d.shoulderX * 0.82, ry: 0.11, rz: 0.06, chin: 0.8, seg: b.S(12), rings: b.S(8) }), 0, y - 0.07, -d.rz - 0.035, 12, 0, 0), s.lining || mixc(col, '#0c0a1c', 0.45)));
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
    return { mesh: place(m, 0.03, -0.1, 0.07, -8, -24, 6) };
  },
  /** The hat that goes round: upturned, with what people put in it. */
  hat(s, S) {
    const c = s.color || '#6a5a4a', bowl = tint(lathe([[0, 0], [0.07, 0.006], [0.1, 0.05], [0.105, 0.09], [0.15, 0.1], [0.15, 0.108], [0.092, 0.1], [0.086, 0.052], [0, 0.03]], S(14), { crease: 60 }), c);
    const r = rng(s.seed ?? 3), coins = []; for (let i = 0; i < (s.coins ?? 5); i++) coins.push(setOutline(setGlow(tint(place(cylinder(0.02, 0.02, 0.008, 7, { crease: 40 }), (r() - 0.5) * 0.1, 0.04 + r() * 0.03, (r() - 0.5) * 0.1, r() * 50 - 25, 0, r() * 50 - 25), '#ffd24a'), 0.35), 0.5));
    return { mesh: place(merge(bowl, coins), 0, -0.13, 0), hang: true, still: true };
  },
  /** A bowl of something hot, held out. */
  bowl(s, S) {
    const m = merge(tint(lathe([[0, 0], [0.04, 0], [0.085, 0.05], [0.09, 0.062], [0.078, 0.058], [0.04, 0.02], [0, 0.016]], S(12), { crease: 60 }), s.color || '#e9dcc0'), tint(place(cylinder(0.074, 0.074, 0.006, S(10), { crease: 40 }), 0, 0.044, 0), s.soup || '#d98a3a'));
    return { mesh: place(m, 0, -0.09, 0), hang: true, still: true };
  },
  writ(s, S) {
    const m = merge(tint(roundedBox(0.12, 0.16, 0.012, 0.004, 1), s.color || '#fff6dc'), tint(place(cylinder(0.022, 0.022, 0.01, 10), 0.025, -0.045, 0.006, 90, 0, 0), '#e6323a'));
    return { mesh: place(m, 0, -0.03, 0.05, -20, 0, 0) };
  },
  /** A miner's pick, held like a gavel. */
  pick(s, S) {
    const iron = s.head || '#8d949e', m = merge(tint(place(cylinder(0.013, 0.016, 0.34, S(8)), 0, -0.08, 0), s.color || '#8a5a34'),
      tint(place(strand(curve([[-0.15, 0.2, 0], [-0.07, 0.262, 0], [0, 0.272, 0], [0.07, 0.262, 0], [0.15, 0.2, 0]], 8), (t) => 0.006 + 0.016 * Math.sin(t * Math.PI), () => 0.012, 5, [0, 1, 0]), 0, 0, 0), iron));
    return { mesh: place(m, 0, 0, 0, -58, 0, 0) };
  },
  /** A fistful of paper slips, fanned: { color, mark }. */
  slips(s, S) {
    const parts = []; for (let i = 0; i < 3; i++) parts.push(tint(place(roundedBox(0.05, 0.15, 0.006, 0.003, 1), (i - 1) * 0.03, 0.07, (i - 1) * 0.004, 0, 0, (1 - i) * 22), i === 1 ? (s.color || '#fff6dc') : (s.color2 || '#ffe0a0')));
    parts.push(setOutline(tint(place(roundedBox(0.03, 0.012, 0.004, 0.002, 1), 0, 0.11, 0.006), s.mark || '#e6323a'), 0));
    return { mesh: place(merge(parts), 0, 0.0, 0.03, -24, 0, 0) };
  },
  /** A slate in a wooden frame with chalk on it. */
  slate(s, S) {
    const m = merge(tint(roundedBox(0.17, 0.22, 0.016, 0.006, 1), s.frame || '#a8743a'), tint(place(roundedBox(0.138, 0.188, 0.008, 0.003, 1), 0, 0, 0.007), s.color || '#2c3440'),
      setOutline(tint(place(roundedBox(0.09, 0.01, 0.004, 0.002, 1), -0.01, 0.045, 0.012), '#f4f0e6'), 0), setOutline(tint(place(roundedBox(0.06, 0.01, 0.004, 0.002, 1), -0.025, 0.01, 0.012), '#f4f0e6'), 0), setOutline(tint(place(roundedBox(0.1, 0.01, 0.004, 0.002, 1), 0, -0.03, 0.012), '#f4f0e6'), 0));
    return { mesh: place(m, 0.02, -0.07, 0.06, -12, -18, 4) };
  },
  /** The chain of a pair of irons, hanging from the hand that carries its slack: { color, links }. */
  shackle(s, S) {
    const col = s.color || '#8d949e', parts = [];
    for (let i = 0; i < (s.links || 4); i++) parts.push(tint(place(torus(0.02, 0.0065, 7, 4), 0, -0.03 - i * 0.034, 0, 90, i % 2 ? 90 : 0, 0), i % 2 ? mixc(col, '#1a1040', 0.25) : col));
    return { mesh: merge(parts), hang: true };
  },
  /** An oar, carried upright (it stays upright whatever the hand does): { color, blade, length }. */
  oar(s, S) {
    const L = s.length || 1.12, c = s.color || '#c99a5a', m = merge(tint(place(cylinder(0.014, 0.017, L * 0.7, S(7)), 0, -0.42, 0), c),
      tint(place(roundedBox(0.105, L * 0.3, 0.02, 0.012, 1), 0, -0.42 + L * 0.84, 0), s.blade || '#e8603f'), tint(place(roundedBox(0.109, 0.03, 0.024, 0.01, 1), 0, -0.42 + L * 0.97, 0), '#fff1d6'),
      tint(place(sphere(0.022, 6, 4), 0, -0.42, 0), c));
    return { mesh: m, hang: true, still: true };
  },
  /** A boathook: a pole with an iron point and hook, carried upright: { color, iron, length }. */
  boathook(s, S) {
    const L = s.length || 1.2, iron = s.iron || '#c0c6d6', top = -0.44 + L, m = merge(tint(place(cylinder(0.012, 0.014, L, S(7)), 0, -0.44, 0), s.color || '#3a3040'),
      tint(place(cone(0.02, 0.09, 6), 0, top, 0), iron),
      tint(strand(curve([[0, top - 0.02, 0], [0.05, top + 0.0, 0], [0.075, top - 0.045, 0], [0.045, top - 0.075, 0]], 6), () => 0.009, () => 0.009, 5), iron),
      tint(place(cylinder(0.018, 0.018, 0.03, S(7)), 0, top - 0.05, 0), iron));
    return { mesh: m, hang: true, still: true };
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
  // held: 'walk' is a cycle, not a pose (state.pose = 'walk' while you move the root; state.walk = steps per second, default 2.1)
  // the default 'signature' (a hand up: here, me): cast members with a gesture of their own replace it in def.poses
  signature: { chest: [-4, 6, 0], head: [-8, 4, 0], armR: [-146, 0, -18], foreR: [-28, 0, 0] },
  walk: {},
  walkA: { hips: { r: [4, 7, 0] }, chest: [2, -9, 0], legL: [-30, 0, 2], shinL: [14, 0, 0], legR: [24, 0, -2], shinR: [34, 0, 0], armL: [24, 0, 8], foreL: [-24, 0, 0], armR: [-26, 0, -8], foreR: [-40, 0, 0] },
  // listening to the Line: two fingers to the right ear, eyes down and away
  listen: { chest: [2, -8, 4], head: [8, -14, -10], armR: [-6, 0, -98], foreR: [-8, 0, -146], handR: [0, 0, -20] },
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
    else if (k.kind === 'turned') parts.chest.push(tint(scaleMesh(lathe([[0.075 * w, y - 0.05], [0.115 * w, y - 0.046], [0.15 * w, y - 0.002], [0.135 * w, y + 0.004], [0.075 * w, y - 0.05]], S(16), { crease: 50 }), 1, 1, 0.86), k.color));
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
    if (lo && def.face?.marks?.blush !== 0) { // at stage size the cheeks are painted on the skull: one draw fewer than a marks decal
      const pink = def.face?.marks?.blushColor ? rgb(def.face.marks.blushColor) : mixc(headSkin, '#ff5a5a', 0.62), amt = (def.face?.marks?.blush ?? 0.5) * 1.5, C = sk.colors;
      for (let i = 0; i < unit.length; i += 3) {
        const yaw = Math.atan2(unit[i], unit[i + 2]) / DEG, pitch = Math.asin(Math.max(-1, Math.min(1, unit[i + 1]))) / DEG, wgt = Math.min(1, amt) * smooth(1 - Math.hypot((Math.abs(yaw) - 36) / 15, (pitch + 25) / 12));
        if (wgt > 0) { C[i] += (pink[0] - C[i]) * wgt; C[i + 1] += (pink[1] - C[i + 1]) * wgt; C[i + 2] += (pink[2] - C[i + 2]) * wgt; }
      }
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
  const propNodes = {}, hangers = []; // props that keep their own up whatever the hand does: a lantern swings, a bowl stays level
  for (const p of def.props || []) {
    const f = PROPS[p.kind]; if (!f) throw new Error(`createCharacter(${def.id}): unknown prop "${p.kind}" (have ${Object.keys(PROPS).join(', ')})`);
    const r = f(p, S), hand = p.hand === 'L' ? handL : handR;
    const n = node(p.kind, r.mesh, mat, { pos: [0, -dim.hand * 0.9, 0], parent: hand });
    propNodes[p.kind] = n;
    if (r.hang) hangers.push({ node: n, sway: r.still ? 0 : 1 });
    if (r.light) { lampNode = n; lampSpec = r; lampLight = new Node(p.kind + 'Light', { pos: r.glowAt, parent: n, light: makeLight(r.light) }); }
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
    const marks = lo ? null : node('marks', wide, fm, { parent: pivot });
    const mouth = node('mouth', hd.patch(0, F.mouthPitch, FACE.mouth.w * mk2, FACE.mouth.h * mk2, 0.014, lo ? 3 : 5), fm, { parent: pivot });
    const fx = lo ? null : node('fx', wide, fm, { parent: pivot, visible: false }); // tears and shock lines are a close-up's business
    if (marks) { const ms = { skin: headSkin, ...(def.face?.marks || {}) }; useCell(marks, faces.marks(JSON.stringify(ms), ms)); } // keyed by what is drawn, so look-alikes share a cell
    const table = {};
    for (const e of EMOTES) {
      table[e] = {
        open: faces.lid(F.set, e, false), shut: faces.lid(F.set, e, true), eye: faces.eyeball(F.iris, EMOTE[e].eye),
        mouth: [0, 1, 2, 3].map((n) => faces.mouth(e, n)), fx: lo ? null : faces.fx(EMOTE[e].fx),
      };
      // face.mouths { emote: closed shape }: the mouth a person's face rests in (a smirk, a thin line), see faces.js CLOSED
      if (F.mouths && F.mouths[e]) table[e].mouth[0] = faces.mouthShape(F.mouths[e]);
    }
    face = { eyes, lids, marks, mouth, fx, table, F, tris: (eyes.mesh.indices.length + lids.mesh.indices.length + (lo ? 0 : wide.indices.length) + mouth.mesh.indices.length) / 3 };
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
  let clip = null, clipName = '', clipT = 0, clipSpeed = 1, clipHeld = false, travel = 0, walkW = 0, walkPh = 0;
  const walkA = poseOf('walkA'), walkB = mirrored(walkA);
  let yawNow = 0, yawInit = false, lookYaw = 0, lookPitch = 0, eyeX = 0, eyeY = 0, lit = 1, flash = 0;
  const tmp = v3.create(), tmp2 = v3.create(), inv = m4.create(), down = v3.create();
  const headPos = new Float32Array(3), lampPos = lampNode ? new Float32Array(3) : null;
  const NOSTATE = {};

  function setEyes(rect, dx, dy) {
    const W = FACE.window, r = face.eyes.uvRect, m = (1 - W) / 2;
    r[0] = rect[0] + rect[2] * (m - dx); r[1] = rect[1] + rect[3] * (m + dy); r[2] = rect[2] * W; r[3] = rect[3] * W;
    const em = rect.page.eyeMaterial; if (face.eyes.material !== em) face.eyes.material = em; // the cell's page: see faces.js useCell
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

      // the walk cycle: two mirrored strides and a bounce at each footfall
      walkW = snap ? (wantPose === 'walk' ? 1 : 0) : approach(walkW, wantPose === 'walk' && !clip ? 1 : 0, dt * 8);
      let walkUp = 0;
      if (walkW > 0.01) {
        walkPh += dt * (s.walk ?? 2.1) * Math.PI; const sw = Math.sin(walkPh), a = Math.abs(sw) ** 0.8;
        rig.apply(sw > 0 ? walkA : walkB, a * walkW); walkUp = Math.abs(Math.cos(walkPh)) * 0.026 * walkW; // highest as the feet pass, lowest at the footfall
      }
      // one-shot clip
      let fwd = 0, up = walkUp, sq = 0;
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
          fwd = a[2] + (c[2] - a[2]) * u; up += a[3] + (c[3] - a[3]) * u; sq = a[4] + (c[4] - a[4]) * u;
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
      for (let i = 0; i < hangers.length; i++) { const h = hangers[i]; down[0] = Math.sin(time * 1.7 + seed) * 0.1 * h.sway; down[1] = -1; down[2] = Math.cos(time * 1.3) * 0.07 * h.sway; aimAxis(h.node, DOWN, down); h.node.updateWorld(h.node.parent.world); }
      if (lampNode) {
        const lw = lampLight.world; lampPos[0] = lw[12]; lampPos[1] = lw[13]; lampPos[2] = lw[14];
        lampLight.light.intensity = lit * (0.92 + 0.08 * Math.sin(time * 13 + seed) * Math.sin(time * 7.3));
      }
      const hw = J.head.world;
      tmp2[0] = 0; tmp2[1] = dim.headC; tmp2[2] = 0; v3.transformPoint(headPos, tmp2, hw);

      // the face
      if (face) {
        const T = face.table[emote];
        const shut = s.eyes === 'shut' || (!snap && s.eyes !== 'open' && (blinkHold > 0 || blink(time, seed) > 0.45));
        useCell(face.lids, shut ? T.shut : T.open);
        setEyes(T.eye, eyeX * 0.105, eyeY * 0.08);
        useCell(face.mouth, T.mouth[mouthLevel < 0.12 ? 0 : mouthLevel < 0.42 ? 1 : mouthLevel < 0.72 ? 2 : 3]);
        if (face.fx) { if (T.fx) { face.fx.visible = true; useCell(face.fx, T.fx); } else face.fx.visible = false; }
      }
      if (skinNode) { flash = Math.max(0, flash - dt * 5); skinNode.flash[0] = skinNode.flash[1] = skinNode.flash[2] = 1; skinNode.flash[3] = flash * 0.85; }
    },
  };

  // cost
  let tris = 0; for (const sk of skins) tris += sk.mesh.indices.length / 3;
  ch.stats.triangles = tris + (face ? face.tris : 0); ch.stats.lod = lod;
  ch.stats.draws = skins.length * 3 + (face ? (lo ? 3 : 4) : 0); // skin + outline + shadow, then the face decals (one more while an emote shows its overlay, full detail only)
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
//   face     { set 'round' | 'lash' | 'old' | 'heavy' | 'sharp', iris, eyeScale, eyeYaw, eyePitch, mouthScale, mouthPitch,
//              brow { w, len, at: [yaw, pitch], color, nick 'L'|'R' (a scar's gap), raiseL, raiseR, tilt },
//              marks { blush, blushColor, freckles, laugh, scar 'L'|'R', beauty, stubble, dust }, nose (0 none, or a size), ears 0,
//              mouths { emote: closed mouth name } (the mouth this face rests in: flat smirk wry pursed grin down ...), shade 0..1 (a hooded face) }
//   costume  { top { color, hem (y of the hem below the hip joint: -0.03 a jacket, -0.16 a long coat), flare, trim, placket, lining },
//              sleeves { color, cuff, flare, ink 'L'|'R' }, legs { color }, shoes { color, sole, cuff, tall },
//              collar { kind 'stand' | 'flat' | 'scarf' | 'high' | 'turned', color }, belt { color, buckle }, buttons { color, rows, count, size },
//              sleeves.rolled (bare forearms), gloves { L, R } (a hand's colour),
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
    face: { set: 'round', iris: '#4a3a2a', eyeScale: 0.8, eyePitch: -7, brow: { w: 0.026, len: 24, at: [24, 11] }, marks: { blush: 0.4, stubble: true } },
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
  // Tobb Quill, 30s: bookmaker, struck-off actuary. Fast, wry. All elbows and arithmetic; talks with both hands.
  tobb: {
    id: 'tobb', seed: 5, skin: '#a06a48',
    build: { height: 1.07, legs: 1.26, torso: 0.94, head: 0.97, width: 0.84, arms: 1.16, hands: 1.05 },
    hair: {
      color: '#3a2218', brow: '#2a1810',
      pieces: [
        { kind: 'cap', front: 0.56, side: 0.02, back: -0.6, grow: [1.06, 1.08, 1.07] },
        { kind: 'curls', n: 22, size: 0.078, out: 0.34, low: -4, seed: 4, clear: 44, brow: 46 },
        { kind: 'spikes', sweep: [0.25, 0.5, 0.1], thick: 0.8, spikes: [[30, 62, 0.13, 0.06, 1], [-64, 40, 0.12, 0.055, 1, [-0.6, 0.3, 0]], [-10, 74, 0.11, 0.055, 1, [-0.2, 0.6, 0.2]]] },
        { kind: 'pencil', at: [96, 24], dir: [0.2, 0.75, 0.6], length: 0.1, r: 1.1, out: 0.3, chalk: true },
      ],
    },
    face: { set: 'round', iris: '#7a5a2a', eyeScale: 0.94, brow: { w: 0.02, len: 24, raiseL: 5 }, marks: { blush: 0.3 }, mouths: { neutral: 'wry', soft: 'wry' } },
    costume: {
      top: { color: '#7fae3c', hem: -0.02, flare: 1.14, trim: '#f08a3f', lining: '#4a6a22' },
      sleeves: { color: '#fff1d6', cuff: '#f08a3f', flare: 1.1 },
      legs: { color: '#5d4a78' }, shoes: { color: '#7a4630', sole: '#f2e2c0' },
      collar: { kind: 'flat', color: '#fff8e6' }, buttons: { color: '#ffd24a', count: 3 },
      extras: [{ kind: 'checks', color: '#4f8228', cols: 6, rows: 5 }, { kind: 'bowtie', color: '#f08a3f' }, { kind: 'glasses', color: '#d9a94a', size: 1.04 }],
    },
    poses: {
      // one hip out, a finger already up to make the next point
      stand: {
        hips: { r: [2, 12, -6], p: [-0.016, 0, 0] }, chest: [6, -10, 7], head: [-6, -8, -9],
        legL: [-6, 12, 9], shinL: [10, 0, 0], legR: [2, -4, -3],
        armR: [-34, 0, -22], foreR: [-104, 16, 0], handR: [0, -40, 0], armL: [10, 0, 30], foreL: [-30, 0, -84],
      },
      // counting it off on his fingers
      signature: { chest: [10, 6, 0], head: [10, 10, 4], armR: [-40, 0, -10], foreR: [-96, 40, 0], handR: [0, -70, 0], armL: [-44, 0, 6], foreL: [-88, -30, 0], handL: [-20, 0, 0] },
    },
    gestures: ['talkPoint', 'talkBoth', 'talkShrug', 'talkOpen'], anim: { gesture: 1.2, gesturePeriod: 1.45 }, idle: { speed: 1.35, bob: 1.2, sway: 1.3 },
  },

  // Chancellor Benedikt Corvane, 60s: the Mint. Courtly, amused, never raises his voice. A great soft bell of a man.
  corvane: {
    id: 'corvane', seed: 6, skin: '#f4c8ac',
    build: { height: 1.12, legs: 0.92, torso: 1.2, head: 1.0, width: 1.32, belly: 0.32, hands: 1.1, arms: 1.05 },
    hair: {
      color: '#eef0fa', brow: '#aab0c8',
      pieces: [
        { kind: 'cap', front: 0.66, side: 0.12, back: -0.5, grow: [1.06, 1.085, 1.09], shift: [0, 0.008, -0.02] },
        // swept straight back off a high forehead, smooth as a seal, and down to the collar behind
        { kind: 'locks', locks: [
          { pts: [[58, 30, 1.04], [80, 30, 1.085], [108, 18, 1.085], [128, 0, 1.05]], w: 0.062 },
          { pts: [[-58, 30, 1.04], [-80, 30, 1.085], [-108, 18, 1.085], [-128, 0, 1.05]], w: 0.062 },
        ] },
        { kind: 'drape', n: 5, from: 122, to: 238, top: -12, length: 0.15, flare: 0.045, tuck: 0.22, jag: 0.16 },
      ],
    },
    face: { set: 'heavy', iris: '#7d93b8', eyeScale: 0.92, eyePitch: -7, brow: { w: 0.027, len: 26, at: [25, 13.5], tilt: -4 }, marks: { blush: 0.42, laugh: true }, mouths: { neutral: 'smirk', soft: 'smirk', grim: 'flat' }, nose: 1.35 },
    costume: {
      top: { color: '#9a2238', hem: -0.2, flare: 1.2, trim: '#ffcf3f', lining: '#5a1020', placket: '#74172a' },
      sleeves: { color: '#9a2238', cuff: '#ffcf3f', flare: 1.5 },
      legs: { color: '#3a1420' }, shoes: { color: '#2a1420', sole: '#ffcf3f' },
      collar: { kind: 'scarf', color: '#fff6e6' }, belt: { color: '#ffcf3f', buckle: '#ffb020' },
      extras: [{ kind: 'chain', color: '#ffcf3f', seal: '#ffb020', drop: 0.15 }, { kind: 'epaulettes', color: '#ffcf3f' }],
    },
    poses: {
      // hands folded on his stomach, chin up, entirely at home
      stand: {
        hips: { r: [-3, 6, 0] }, chest: [-5, -4, 0], head: [2, -6, 5],
        legL: [0, 8, 5], legR: [0, -8, -5],
        armL: [-26, 0, 16], foreL: [-70, 0, -70], armR: [-26, 0, -16], foreR: [-66, 0, 70],
      },
      // "allow me": one open hand offered, the other still on his stomach
      signature: { chest: [2, 8, 0], head: [6, 4, 8], armR: [-44, 0, -26], foreR: [-62, 24, 0], handR: [0, -70, 0] },
    },
    gestures: ['talkOpen', 'talkSmall', 'talkPat'], anim: { gesture: 0.7, gesturePeriod: 3.3 }, idle: { speed: 0.65, breath: 1.4, bob: 0.6, sway: 0.5 },
  },

  // Magistrate Aldous Maravel, 60s: Ilse's father, a widower. Grave, tired. Tall, thin and bent like a question mark.
  maravel: {
    id: 'maravel', seed: 7, skin: '#ecccb0',
    build: { height: 1.1, legs: 1.08, torso: 1.12, head: 0.95, width: 0.88, arms: 1.1 },
    hair: {
      color: '#b4b4c0', brow: '#8a8a98',
      pieces: [
        { kind: 'cap', front: 0.7, side: 0.04, back: -0.5, grow: [1.045, 1.06, 1.07] },
        { kind: 'spikes', sweep: [0, 0.1, -0.4], thick: 0.8, spikes: [[108, 2, 0.09, 0.07, 0, [0.35, -0.3, -0.6]], [-108, 2, 0.09, 0.07, 0, [-0.35, -0.3, -0.6]], [128, -18, 0.08, 0.06, 0, [0.3, -0.4, -0.5]], [-128, -18, 0.08, 0.06, 0, [-0.3, -0.4, -0.5]]] },
      ],
    },
    face: { set: 'old', iris: '#3fae6a', eyeScale: 0.84, eyePitch: -6.5, brow: { w: 0.03, len: 27, at: [25, 12], tilt: -5 }, marks: { blush: 0.25, laugh: true }, mouths: { neutral: 'flat', soft: 'softsmile' } },
    costume: {
      top: { color: '#34304c', hem: -0.21, flare: 1.26, trim: '#a99bc4', lining: '#1d1a30' },
      sleeves: { color: '#34304c', cuff: '#a99bc4', flare: 1.55 },
      legs: { color: '#23202f' }, shoes: { color: '#23202f' },
      collar: { kind: 'flat', color: '#a99bc4' },
      extras: [{ kind: 'tabs' }, { kind: 'beard', shape: 'square', color: '#b4b4c0', size: 1.0 }, { kind: 'moustache', color: '#b4b4c0' }],
    },
    props: [{ kind: 'gavel', hand: 'R' }],
    poses: {
      // stooped over a bench that is not there, looking up over it
      stand: {
        hips: { r: [8, 4, 0], p: [0, -0.008, -0.01] }, chest: [16, -4, 0], head: [-12, -6, 3],
        legL: [-6, 6, 3], legR: [-6, -6, -3],
        armL: [2, 0, 8], foreL: [-30, 0, -20], armR: [-14, 0, -12], foreR: [-66, 0, 0],
      },
      // the gavel up
      signature: { chest: [8, -8, 0], head: [-8, 6, 0], armR: [-96, 0, -14], foreR: [-58, 0, 0] },
    },
    gestures: ['talkSmall', 'talkPat', 'talkChin'], anim: { gesture: 0.6, gesturePeriod: 3.4 }, idle: { speed: 0.7, breath: 1.2, bob: 0.6, sway: 0.6 },
  },

  // Proctor Odalys Thorne, 50s: Ren's instructor and his handler. Clipped, calm. A ruled line in a high collar.
  thorne: {
    id: 'thorne', seed: 8, skin: '#ecc8aa',
    build: { height: 1.12, legs: 1.24, torso: 1.1, head: 0.92, width: 0.84, arms: 1.08 },
    hair: {
      color: '#a9b4d6', brow: '#5a6488',
      pieces: [
        // pinned flat from a centre parting, and a hard little knot high at the back with one long pin through it
        { kind: 'cap', front: 0.6, side: 0.02, back: -0.56, grow: [1.045, 1.06, 1.065] },
        { kind: 'fringe', n: 2, from: 14, to: 58, part: 0, top: 66, tips: [36, 14], gather: 0.15, r: 1.085, tipR: 1.06, w: 0.07, thick: 0.4 },
        { kind: 'fringe', n: 2, from: -14, to: -58, part: 0, top: 66, tips: [36, 14], gather: 0.15, r: 1.085, tipR: 1.06, w: 0.07, thick: 0.4 },
        { kind: 'bun', at: [180, 58], size: 0.078, out: 0.62, pin: '#26383a', pinKnob: '#c9d2de', pinDir: [0.96, 0.26, 0.1] },
      ],
    },
    face: { set: 'sharp', iris: '#5f9a84', eyeScale: 0.9, eyePitch: -5, brow: { w: 0.013, len: 24, at: [25, 17], tilt: 3 }, marks: { blush: 0.18, beauty: 'L' }, mouths: { neutral: 'flat', smile: 'softsmile', soft: 'wry' } },
    costume: {
      top: { color: '#2c4f52', hem: -0.18, flare: 1.1, trim: '#9fb4a8', placket: '#1c3538', lining: '#162a2c' },
      sleeves: { color: '#2c4f52', cuff: '#9fb4a8', flare: 1.06 },
      legs: { color: '#1a2628' }, shoes: { color: '#1a2628', sole: '#9fb4a8', tall: true },
      collar: { kind: 'high', color: '#1c3033' }, belt: { color: '#1a2628', buckle: '#c9d2de' }, buttons: { color: '#c9d2de', count: 3 },
      gloves: { L: '#8d949e' },
      extras: [{ kind: 'glasses', half: true, color: '#e6ebf5' }, { kind: 'brooch', color: '#c9d2de', x: -0.052, size: 0.017 }, { kind: 'earring', side: 'L', color: '#e6ebf5', size: 0.55 }, { kind: 'earring', side: 'R', color: '#e6ebf5', size: 0.55 }],
    },
    poses: {
      // hands behind her back, weight even, chin a degree too high
      stand: {
        hips: { r: [-2, 0, 0] }, chest: [-5, 0, 0], head: [3, 6, 0],
        legL: [0, 4, 3], legR: [0, -4, -3],
        armL: [22, 0, 6], foreL: [12, 0, -62], armR: [22, 0, -6], foreR: [12, 0, 62],
      },
      // one gloved finger: "Cadet."
      signature: { chest: [0, 8, 0], head: [6, -6, 0], armL: [-42, 0, 8], foreL: [-112, -14, 0], handL: [0, 20, 0] },
    },
    gestures: ['talkSmall', 'talkChin'], anim: { gesture: 0.5, gesturePeriod: 3.6 }, idle: { speed: 0.6, breath: 0.8, bob: 0.4, sway: 0.3 },
  },

  // The Ledger: whoever kept this account. A hood, a book too big for the arm that holds it, ink to the knuckles.
  // (The account is Ilse's, written when she is old; nothing shows it but the eyes until 'ilse-old' puts the hood back.)
  narrator: {
    id: 'narrator', seed: 9, skin: '#f0cfb4',
    build: { height: 0.97, legs: 0.88, torso: 1.06, head: 1.0, width: 1.02, arms: 1.0 },
    hair: {
      color: '#e6d6cc', brow: '#b8a498',
      pieces: [
        { kind: 'hood', color: '#6a5638', lining: '#2a2030', front: 0.42, grow: [1.17, 1.2, 1.2], tipLength: 0.24 },
        { kind: 'locks', locks: [{ pts: [[44, 30, 1.03], [50, 14, 1.09], [50, -6, 1.1], [44, -24, 1.1]], w: 0.034, thick: 0.8, ink: 1 }] },
      ],
    },
    // Under the hood it is Ilse at seventy: her green eyes and her freckles, kept in shadow until the last page (see 'ilse-old').
    face: { set: 'old', iris: '#3fae6a', eyeScale: 0.9, eyePitch: -7, shade: 0.34, ears: 0, brow: { w: 0.015, len: 21, at: [25, 10] }, marks: { blush: 0.3, freckles: true, laugh: true }, mouths: { neutral: 'softsmile' } },
    costume: {
      top: { color: '#6a5638', hem: -0.2, flare: 1.3, trim: '#c9b78a', lining: '#2a2030' },
      sleeves: { color: '#6a5638', cuff: '#c9b78a', flare: 1.5 },
      legs: { color: '#2a2030' }, shoes: { color: '#3a2c20' },
      gloves: { L: '#5a5a9a', R: '#5a5a9a' },
      extras: [{ kind: 'cape', color: '#6a5638', trim: '#c9b78a', length: 0.12, clasp: '#e6cf8a' }],
    },
    props: [{ kind: 'ledger', hand: 'L', color: '#8a3a2a', trim: '#e6cf8a' }],
    poses: {
      // the book hugged to the chest, head a little down over it
      stand: {
        hips: { r: [4, 6, 0] }, chest: [8, -4, 0], head: [4, -4, 4],
        legL: [-3, 6, 3], legR: [-3, -6, -3],
        armL: [-4, 0, 8], foreL: [-84, 0, -30], armR: [2, 0, -10], foreR: [-28, 0, 0],
      },
      // a finger on the line being read
      signature: { chest: [12, 6, 0], head: [14, 8, 0], armR: [-30, 0, -4], foreR: [-108, 0, 40] },
    },
    gestures: ['talkSmall', 'talkPat'], anim: { gesture: 0.6, gesturePeriod: 3.4 }, idle: { speed: 0.6, breath: 1.3, bob: 0.5, sway: 0.6 },
  },

  // A docker of the Compact: the voice in the crowd. Wide as a door, cap down, collar up, forearms out.
  docker: {
    id: 'docker', seed: 10, skin: '#d2a07c',
    build: { height: 1.05, legs: 0.98, torso: 1.12, head: 0.96, width: 1.3, belly: 0.14, hands: 1.22, feet: 1.12, arms: 1.06 },
    hair: { color: '#4a3a30', brow: '#33261f', pieces: [{ kind: 'cap', front: 0.52, side: 0.0, back: -0.52 }, { kind: 'flatcap', color: '#7c8094', peak: '#565a70' }] },
    face: { set: 'round', iris: '#4a3a2a', eyeScale: 0.8, eyePitch: -7.5, brow: { w: 0.027, len: 24, at: [24, 9.5] }, marks: { blush: 0.38, stubble: true }, mouths: { neutral: 'flat' } },
    costume: {
      top: { color: '#3f6fa8', hem: -0.04, flare: 1.12, trim: '#2c4f80', lining: '#22395e' },
      sleeves: { color: '#3f6fa8', rolled: true },
      legs: { color: '#6a5444' }, shoes: { color: '#3a2c24', sole: '#1f1814', tall: true },
      collar: { kind: 'turned', color: '#2c4f80' }, belt: { color: '#3a2c24', buckle: '#c9a25a' },
    },
    poses: {
      stand: {
        hips: { r: [0, 8, -2] }, chest: [4, -6, 2], head: [6, -6, -3], legL: [0, 10, 9], legR: [0, -10, -9],
        armL: [4, 0, 24], foreL: [-34, 0, -20], armR: [4, 0, -24], foreR: [-34, 0, 20],
      },
      // a fist up
      signature: { chest: [-6, 0, 0], head: [-8, 0, 0], armR: [-150, 0, -18], foreR: [-40, 0, 0] },
    },
    gestures: ['talkPoint', 'talkBoth'], anim: { gesture: 1.0, gesturePeriod: 2.2 }, idle: { speed: 0.85, sway: 0.7 },
  },

  // A Mint steward: clears the route, moves you along. Mint grey with oxblood facings, a pillbox hat, white gloves, a striped wand.
  steward: {
    id: 'steward', seed: 11, skin: '#f0c6a0',
    build: { height: 0.98, legs: 1.0, torso: 1.04, head: 1.0, width: 1.06, belly: 0.08 },
    hair: { color: '#8a5a34', brow: '#6a4226', pieces: [{ kind: 'cap', front: 0.5, side: 0.0, back: -0.5 }, { kind: 'fringe', n: 3, from: -34, to: 34, top: 40, tip: 22, jag: 3, w: 0.05, r: 1.09 }, { kind: 'kepi', color: '#a3283f', band: '#ffd24a', peak: false, tall: 0.8 }] },
    face: { set: 'round', iris: '#5a6a3a', eyeScale: 0.86, eyePitch: -6.5, brow: { w: 0.02, len: 22, at: [24, 12], tilt: 4 }, marks: { blush: 0.45, freckles: true }, mouths: { neutral: 'pursed' } },
    costume: {
      top: { color: '#aab2c8', hem: -0.06, flare: 1.2, trim: '#a3283f', placket: '#8a92aa', lining: '#a3283f' },
      sleeves: { color: '#aab2c8', cuff: '#a3283f', flare: 1.1 },
      legs: { color: '#5a6078' }, shoes: { color: '#2a2030', sole: '#4a4560', tall: true },
      collar: { kind: 'stand', color: '#a3283f' }, belt: { color: '#a3283f', buckle: '#ffd24a' }, buttons: { color: '#ffd24a', count: 3 },
      gloves: { L: '#ffffff', R: '#ffffff' },
    },
    props: [{ kind: 'baton', hand: 'L', color: '#fff6dc', tip: '#e6323a' }], handed: 'L',
    poses: {
      stand: {
        hips: { r: [0, -6, 2] }, chest: [-4, 4, -2], head: [-4, 6, 2], legL: [0, 6, 5], legR: [0, -6, -5],
        armR: [12, 0, -30], foreR: [-20, 0, 90], armL: [-10, 0, 14], foreL: [-70, 0, 0],
      },
      // "move along": the wand out level, the other palm up
      signature: { armL: [-84, 0, 30], foreL: [-10, 0, 0], chest: [4, -12, 0], head: [0, 10, 0] },
    },
    gestures: ['talkPoint', 'talkSmall'], anim: { gesture: 1.0 }, idle: { speed: 1.0, sway: 0.6 },
  },

  // A Mint clerk: hands you the writ and the pen. Small, exact, an eyeshade and sleeve garters.
  clerk: {
    id: 'clerk', seed: 12, skin: '#f4d2b6',
    build: { height: 0.9, legs: 0.96, torso: 0.98, head: 1.03, width: 0.88 },
    hair: { color: '#3d2c33', brow: '#2c2026', pieces: [{ kind: 'cap', front: 0.5, side: -0.04, back: -0.56, grow: [1.05, 1.07, 1.07] }, { kind: 'fringe', n: 4, from: 30, to: -44, part: 30, top: 60, tips: [26, 22, 20, 14], sweep: -6, gather: 0.2, r: 1.09 }, { kind: 'visor', color: '#4fb07a' }, { kind: 'pencil', at: [-98, 22], dir: [-0.15, 0.4, 0.9], length: 0.2, r: 1.1, out: 0.1 }] },
    face: { set: 'round', iris: '#5a4a8a', eyeScale: 0.96, brow: { w: 0.014, len: 21, at: [25, 12.5] }, marks: { blush: 0.4 }, mouths: { neutral: 'pursed' } },
    costume: {
      top: { color: '#a3283f', hem: -0.02, flare: 1.12, trim: '#ffd24a', lining: '#6a1426' },
      sleeves: { color: '#fff4dc', cuff: '#2a2540', flare: 1.14, ink: 'R' },
      legs: { color: '#3a3050' }, shoes: { color: '#2a2030', sole: '#4a4560' },
      collar: { kind: 'flat', color: '#fffaf0' }, buttons: { color: '#ffd24a', count: 3 },
      extras: [{ kind: 'bowtie', color: '#ffd24a' }, { kind: 'glasses', color: '#3a3050', size: 0.96 }],
    },
    props: [{ kind: 'writ', hand: 'R' }],
    poses: {
      stand: {
        hips: { r: [2, -6, 0] }, chest: [4, 4, 0], head: [-4, 6, -4], legL: [0, 4, 3], legR: [0, -4, -3],
        armR: [-22, 0, -10], foreR: [-84, 10, 0], armL: [6, 0, 8], foreL: [-40, 0, -40],
      },
      // the writ held out at arm's length: sign here
      signature: { chest: [8, 10, 0], head: [-6, -8, -6], armR: [-78, 0, -4], foreR: [-16, 0, 0], hips: { r: [6, 0, 0] } },
    },
    gestures: ['talkSmall', 'talkPoint'], anim: { gesture: 0.8, gesturePeriod: 2.2 }, idle: { speed: 1.1, sway: 0.5 },
  },

  // A Halcyon proctor: invigilates. Teal gown, cape, a mortarboard whose tassel is the only loose thing about them.
  proctor: {
    id: 'proctor', seed: 13, skin: '#e8c09c',
    build: { height: 1.06, legs: 1.12, torso: 1.08, head: 0.94, width: 1.0 },
    hair: { color: '#5a5a6a', brow: '#3c3c4a', pieces: [{ kind: 'cap', front: 0.5, side: 0.0, back: -0.55 }, { kind: 'mortarboard', color: '#2c4f52', tassel: '#ffd24a' }] },
    face: { set: 'sharp', iris: '#3f6f9a', eyeScale: 0.84, eyePitch: -6.5, brow: { w: 0.022, len: 24, at: [24, 11.5], tilt: 5 }, marks: { blush: 0.2 }, mouths: { neutral: 'down' } },
    costume: {
      top: { color: '#3d7a7e', hem: -0.17, flare: 1.24, trim: '#c9d2de', lining: '#1c3538', placket: '#2c5c60' },
      sleeves: { color: '#3d7a7e', cuff: '#c9d2de', flare: 1.3 },
      legs: { color: '#1a2628' }, shoes: { color: '#1a2628', sole: '#9fb4a8' },
      collar: { kind: 'stand', color: '#c9d2de' },
      extras: [{ kind: 'cape', color: '#2c4f52', trim: '#c9d2de', length: 0.1, clasp: '#ffd24a' }],
    },
    props: [{ kind: 'pointer', hand: 'L' }], handed: 'L',
    poses: {
      stand: {
        hips: { r: [-2, -6, 0] }, chest: [-4, 4, 0], head: [6, 6, 0], legL: [0, 5, 4], legR: [0, -5, -4],
        armR: [20, 0, -6], foreR: [12, 0, 60], armL: [-4, 0, 12], foreL: [-52, 0, 0],
      },
      signature: { armL: [-76, 0, 12], foreL: [-30, 0, 0], chest: [4, -10, 0], head: [2, 8, 0] },
    },
    gestures: ['talkPoint', 'talkSmall'], anim: { gesture: 0.8 }, idle: { speed: 0.7, sway: 0.4 },
  },

  // Townsfolk of Vessery. Not anybody in particular, which is the point of them.
  townsman: {
    id: 'townsman', seed: 14, skin: '#e2b490',
    build: { height: 1.0, legs: 1.0, torso: 1.06, head: 1.0, width: 1.12, belly: 0.24 },
    hair: { color: '#7a4a2a', brow: '#5a361e', pieces: [{ kind: 'cap', front: 0.52, side: 0.0, back: -0.52 }, { kind: 'flatcap', color: '#5f8a54', peak: '#42683c' }] },
    face: { set: 'round', iris: '#4a3a2a', eyeScale: 0.86, eyePitch: -7, brow: { w: 0.022, len: 23, at: [24, 11] }, marks: { blush: 0.5 } },
    costume: {
      top: { color: '#c9803f', hem: -0.05, flare: 1.18, trim: '#8a5226', placket: '#a8642c' },
      sleeves: { color: '#c9803f', flare: 1.1 }, legs: { color: '#4a5a7a' }, shoes: { color: '#5a3a2a', sole: '#3a2418' },
      collar: { kind: 'scarf', color: '#f2c14e' }, buttons: { color: '#5a361e', count: 3 },
      extras: [{ kind: 'moustache', color: '#7a4a2a' }],
    },
    poses: { stand: { hips: { r: [0, 6, 2] }, chest: [2, -4, -2], head: [-2, -6, 3], legL: [0, 8, 6], legR: [0, -8, -6], armL: [4, 0, 16], foreL: [-24, 0, 0], armR: [4, 0, -16], foreR: [-30, 0, 0] } },
    gestures: ['talkOpen', 'talkShrug', 'talkSmall'], idle: { speed: 0.9 },
  },
  townswoman: {
    id: 'townswoman', seed: 15, skin: '#d9a07a',
    build: { height: 0.92, legs: 0.92, torso: 1.0, head: 1.02, width: 1.0, belly: 0.1 },
    hair: { color: '#5a2c22', brow: '#44201a', pieces: [{ kind: 'cap', front: 0.5, side: -0.1, back: -0.6 }, { kind: 'fringe', n: 4, from: -40, to: 40, top: 58, tip: 20, jag: 5, part: 0, gather: 0.5 }, { kind: 'kerchief', color: '#3f9ad0', front: 0.66 }] },
    face: { set: 'lash', iris: '#7a4a26', eyeScale: 0.96, brow: { w: 0.015, len: 22 }, marks: { blush: 0.55 } },
    costume: {
      top: { color: '#3f7fc8', hem: -0.14, flare: 1.4, trim: '#2a5a9a', lining: '#1f3f70' },
      sleeves: { color: '#3f7fc8', flare: 1.16, cuff: '#fff4dc' }, legs: { color: '#5a3a2a' }, shoes: { color: '#7a4a2a', sole: '#4a2a1a' },
      collar: { kind: 'flat', color: '#fff8e6' },
      extras: [{ kind: 'apron', color: '#fff3d8', pocket: '#ffd98a', spread: 1.6 }],
    },
    props: [{ kind: 'hat', hand: 'R', color: '#7c8094' }],
    poses: {
      stand: { hips: { r: [0, -6, -2] }, chest: [2, 4, 2], head: [-4, 6, -4], legL: [0, 5, 3], legR: [0, -5, -3], armL: [4, 0, 14], foreL: [-26, 0, 0], armR: [-26, 0, -8], foreR: [-70, 0, 0] },
      // the hat held out
      signature: { chest: [6, 8, 0], armR: [-62, 0, -4], foreR: [-36, 0, 0], head: [-8, -6, 4] },
    },
    gestures: ['talkPat', 'talkSmall', 'talkShrug'], idle: { speed: 1.0 },
  },
  fishwife: {
    id: 'fishwife', seed: 16, skin: '#c98e6e',
    build: { height: 0.98, legs: 0.9, torso: 1.1, head: 1.0, width: 1.28, belly: 0.3, hands: 1.15 },
    hair: { color: '#2e2630', brow: '#221c24', pieces: [{ kind: 'cap', front: 0.54, side: 0.0, back: -0.6 }, { kind: 'kerchief', color: '#f2c14e', front: 0.62, side: -0.3 }] },
    face: { set: 'round', iris: '#4a3a2a', eyeScale: 0.86, eyePitch: -7, brow: { w: 0.022, len: 23, at: [24, 11], tilt: 3 }, marks: { blush: 0.6 }, mouths: { neutral: 'wry' } },
    costume: {
      top: { color: '#2f9a86', hem: -0.13, flare: 1.34, trim: '#1f6f62', lining: '#134a44' },
      sleeves: { color: '#2f9a86', rolled: true }, legs: { color: '#3a2c24' }, shoes: { color: '#3a2c24', sole: '#1f1814', tall: true },
      collar: { kind: 'scarf', color: '#e8483f' },
      extras: [{ kind: 'apron', color: '#e9eef2', pocket: '#b9c6da', spread: 1.9 }, { kind: 'earring', side: 'R', color: '#ffd24a' }],
    },
    poses: { stand: { hips: { r: [0, 8, 3] }, chest: [0, -6, -3], head: [-4, -6, 5], legL: [0, 10, 8], legR: [0, -10, -8], armL: [14, 0, 46], foreL: [-24, 0, -96], handL: [0, 0, -20], armR: [12, 0, -44], foreR: [-24, 0, 96], handR: [0, 0, 20] } },
    gestures: ['talkPoint', 'talkBoth', 'talkShrug'], anim: { gesture: 1.1 }, idle: { speed: 0.9 },
  },
  // children: three heads tall, never still
  child: {
    id: 'child', seed: 17, skin: '#e9b78e',
    build: { height: 0.66, legs: 0.9, torso: 0.9, head: 1.16, width: 0.86, hands: 1.05, feet: 1.05 },
    hair: { color: '#c97a2a', brow: '#a05e1c', pieces: [{ kind: 'cap', front: 0.5, side: -0.02, back: -0.56 }, { kind: 'fringe', n: 4, from: -44, to: 44, top: 60, tips: [18, 26, 22, 16], part: -10, gather: 0.5 }, { kind: 'flatcap', color: '#4f8a5a', peak: '#3a6a44', tilt: 2 }] },
    face: { set: 'round', iris: '#5a6a3a', eyeScale: 1.08, brow: { w: 0.016, len: 21 }, marks: { blush: 0.65, freckles: true }, mouths: { neutral: 'grin' } },
    costume: {
      top: { color: '#e8603f', hem: -0.03, flare: 1.26, trim: '#b8402a' }, sleeves: { color: '#fff1d6', flare: 1.15 },
      legs: { color: '#5a4a3a' }, shoes: { color: '#4a3020', sole: '#2a1a10' }, collar: { kind: 'scarf', color: '#3f9ad0' },
    },
    poses: { stand: { hips: { r: [0, 8, -3] }, chest: [-4, -6, 4], head: [-10, -4, -6], legL: [0, 10, 8], legR: [0, -8, -6], armL: [8, 0, 26], foreL: [-20, 0, 0], armR: [8, 0, -26], foreR: [-20, 0, 0] } },
    gestures: ['talkBoth', 'talkPoint'], anim: { gesture: 1.2, gesturePeriod: 1.5 }, idle: { speed: 1.5, bob: 1.6, sway: 1.4 },
  },
  child2: {
    id: 'child2', seed: 18, skin: '#b9856e',
    build: { height: 0.6, legs: 0.86, torso: 0.9, head: 1.18, width: 0.84 },
    hair: { color: '#2e2226', brow: '#221a1c', pieces: [{ kind: 'cap', front: 0.5, side: -0.1, back: -0.6, grow: [1.07, 1.09, 1.08] }, { kind: 'fringe', n: 5, from: -46, to: 46, top: 60, tip: 22, jag: 3, part: 0, gather: 0.6 },
      { kind: 'tail', at: [84, 34], dir: [1, -0.22, 0.1], length: 0.2, width: 0.062, links: 2, tie: '#ffd24a', stiffness: 80 }, { kind: 'tail', at: [-84, 34], dir: [-1, -0.22, 0.1], length: 0.2, width: 0.062, links: 2, tie: '#ffd24a', stiffness: 80 }] },
    face: { set: 'lash', iris: '#7a4a26', eyeScale: 1.1, brow: { w: 0.014, len: 20 }, marks: { blush: 0.6, blushColor: '#e0625a' } },
    costume: {
      top: { color: '#f2c14e', hem: -0.1, flare: 1.5, trim: '#e8603f' }, sleeves: { color: '#f2c14e', flare: 1.2, cuff: '#e8603f' },
      legs: { color: '#fff1d6' }, shoes: { color: '#a3283f', sole: '#5a1020' }, collar: { kind: 'flat', color: '#fff8e6' },
    },
    poses: { stand: { hips: { r: [0, -8, 3] }, chest: [-4, 6, -4], head: [-12, 6, 6], legL: [0, 6, 5], legR: [0, -8, -6], armL: [10, 0, 20], foreL: [-30, 0, -30], armR: [10, 0, -20], foreR: [-30, 0, 30] } },
    gestures: ['talkBoth', 'talkOpen'], anim: { gesture: 1.2, gesturePeriod: 1.5 }, idle: { speed: 1.6, bob: 1.7, sway: 1.4 },
  },

  // ---- the rest of the company (chapters 2 to 8)

  // Sable Vasker, 22: Ren's foster-brother, assessor of the Audit. Smooth, cold, hurt underneath. Never quite meets the eye.
  sable: {
    id: 'sable', seed: 19, skin: '#f6e2d0',
    build: { height: 1.07, legs: 1.24, torso: 1.04, head: 0.95, width: 0.88, arms: 1.08 },
    hair: {
      color: '#efe6c8', brow: '#cfc4a0',
      pieces: [
        { kind: 'cap', front: 0.56, side: -0.06, back: -0.6, grow: [1.06, 1.085, 1.08] },
        // parted in the middle, two long curtains to the cheekbones
        { kind: 'fringe', n: 3, from: 12, to: 56, part: 2, top: 66, tips: [22, 4, -10], gather: 0.25, r: 1.11, w: 0.062 },
        { kind: 'fringe', n: 3, from: -12, to: -56, part: -2, top: 66, tips: [24, 6, -8], gather: 0.25, r: 1.11, w: 0.062 },
        { kind: 'tail', at: [180, -20], dir: [0, -1, -0.5], length: 0.24, width: 0.046, links: 2, tie: '#22242e' },
      ],
    },
    face: { set: 'sharp', iris: '#9aa8cc', eyeScale: 0.94, brow: { w: 0.014, len: 23, at: [25, 14] }, marks: { blush: 0.15 }, mouths: { neutral: 'flat', smile: 'wry' } },
    costume: {
      top: { color: '#343848', hem: -0.2, flare: 1.14, trim: '#c0c6d6', placket: '#22242e', lining: '#1a1c26' },
      sleeves: { color: '#343848', cuff: '#c0c6d6', flare: 1.06 },
      legs: { color: '#22242e' }, shoes: { color: '#1c1e28', sole: '#8d949e', tall: true },
      collar: { kind: 'high', color: '#22242e' }, belt: { color: '#22242e', buckle: '#c0c6d6' },
      gloves: { L: '#8d949e', R: '#8d949e' },
      extras: [{ kind: 'brooch', shape: 'bar', color: '#e6ebf5', size: 0.02 }],
    },
    poses: {
      // one glove holding the other wrist, eyes on the middle distance to your left
      stand: {
        hips: { r: [0, -10, 2] }, chest: [0, 6, -2], head: [8, -22, 0],
        legL: [0, 8, 6], shinL: [2, 0, 0], legR: [0, -4, -2],
        armL: [-8, 0, 6], foreL: [-52, 0, -52], armR: [-8, 0, -6], foreR: [-58, 0, 48],
      },
      signature: { head: [0, 20, 0], chest: [0, -6, 0], armR: [-36, 0, -12], foreR: [-70, 10, 0], handR: [0, -50, 0] },
    },
    gestures: ['talkSmall', 'talkOpen'], anim: { gesture: 0.6, gesturePeriod: 3.2 }, idle: { speed: 0.6, bob: 0.5, sway: 0.4 },
  },

  // Hesper Dunmore, 40s: shift-captain at Saltmere. Blunt, exhausted, kind in practical ways. Built to carry things.
  hesper: {
    id: 'hesper', seed: 20, skin: '#96644a',
    build: { height: 1.06, legs: 1.0, torso: 1.14, head: 0.97, width: 1.3, belly: 0.06, hands: 1.2, feet: 1.12, arms: 1.06 },
    hair: {
      color: '#33282a', brow: '#d4d0c6',
      pieces: [
        { kind: 'cap', front: 0.56, side: 0.06, back: -0.5, zig: 0.08, zigN: 3, grow: [1.06, 1.085, 1.07] },
        { kind: 'fringe', n: 4, from: -40, to: 40, top: 62, tips: [34, 30, 36, 32], sweep: 8, part: -20, gather: 0.5 },
        { kind: 'curls', n: 44, size: 0.0115, out: 1.3, low: 22, seed: 9, clear: 0, color: '#f4f0e6' },
      ],
    },
    face: { set: 'round', iris: '#5a3a22', eyeScale: 0.86, eyePitch: -7, brow: { w: 0.025, len: 24, at: [24, 11] }, marks: { blush: 0.3, blushColor: '#c0503a', dust: true }, mouths: { neutral: 'flat', soft: 'softsmile' } },
    costume: {
      top: { color: '#a89e7c', hem: -0.05, flare: 1.14, trim: '#7fb5b0', placket: '#8a8062', lining: '#5a5440' },
      sleeves: { color: '#a89e7c', rolled: true },
      legs: { color: '#4d4a52' }, shoes: { color: '#33282a', sole: '#1f181a', tall: true, cuff: '#7fb5b0' },
      collar: { kind: 'turned', color: '#8a8062' }, belt: { color: '#33282a', buckle: '#ffcf3f' },
      extras: [{ kind: 'brooch', shape: 'bar', color: '#ffcf3f', size: 0.022 }],
    },
    poses: {
      // arms folded, weight back on her heels
      stand: {
        hips: { r: [-4, 6, 0] }, chest: [-4, -4, 0], head: [4, -4, 3], legL: [0, 8, 7], legR: [0, -8, -7],
        armL: [-26, 0, -2], foreL: [-96, 0, -66], armR: [-20, 0, 2], foreR: [-104, 0, 62],
      },
      signature: { armL: [14, 0, 44], foreL: [-24, 0, -96], armR: [-64, 0, -10], foreR: [-40, 0, 0], chest: [4, 8, 0] },
    },
    gestures: ['talkSmall', 'talkPoint', 'talkShrug'], anim: { gesture: 0.8, gesturePeriod: 2.8 }, idle: { speed: 0.7, breath: 1.3, sway: 0.5 },
  },

  // Ansel Pryce, 12: scholarship cadet, bed nineteen. In Ren's coat, a size too large. Stands at attention when spoken to.
  ansel: {
    id: 'ansel', seed: 21, skin: '#f2cdb0',
    build: { height: 0.7, legs: 0.96, torso: 0.92, head: 1.13, width: 0.88, hands: 1.0 },
    hair: {
      color: '#dcb264', brow: '#b08d57',
      pieces: [
        { kind: 'cap', front: 0.54, side: 0.04, back: -0.56, zig: 0.08, zigN: 3 },
        { kind: 'fringe', n: 4, from: -42, to: 40, top: 62, tips: [30, 34, 28, 32], part: 14, gather: 0.5 },
        { kind: 'spikes', sweep: [0.3, 0.6, 0.3], thick: 0.8, spikes: [[28, 76, 0.14, 0.05, 1]] },
      ],
    },
    face: { set: 'round', iris: '#6aaee6', eyeScale: 1.1, brow: { w: 0.015, len: 21, at: [25, 16] }, marks: { blush: 0.65, freckles: true } },
    costume: {
      top: { color: '#2f5fb8', hem: -0.085, flare: 1.34, trim: '#b9c6da', placket: '#24478f' },
      sleeves: { color: '#2f5fb8', cuff: '#c3cfe0', flare: 1.5 },
      legs: { color: '#44539c' }, shoes: { color: '#2c2b52', sole: '#b9c6da', tall: true },
      collar: { kind: 'stand', color: '#c3cfe0' }, belt: { color: '#2c2b52', buckle: '#ffd24a' }, buttons: { color: '#ffd24a', rows: 2, count: 3 },
      gloves: { L: '#d9c0c8' },
      extras: [{ kind: 'epaulettes', color: '#c3cfe0' }],
    },
    poses: {
      // attention: heels together, thumbs on the seams, chin up at whoever is taller
      stand: { hips: { r: [-2, 0, 0] }, chest: [-6, 0, 0], head: [-12, 0, 0], legL: [0, 4, 1], legR: [0, -4, -1], armL: [2, 0, 5], foreL: [-4, 0, 0], armR: [2, 0, -5], foreR: [-4, 0, 0] },
      // the salute
      signature: { armR: [-20, 0, -100], foreR: [0, 0, -128], handR: [0, 0, -10], head: [-14, 0, 0] },
    },
    gestures: ['talkSmall', 'talkBoth'], anim: { gesture: 0.9, gesturePeriod: 1.9 }, idle: { speed: 1.3, bob: 0.9, sway: 0.5 },
  },

  // Wyn Okerby, 70s: Nan's sister, lamp-keeper on Little Brand. Nan's face weathered harder; one eyebrow always up.
  wyn: {
    id: 'wyn', seed: 22, skin: '#b07a62',
    build: { height: 0.95, legs: 0.92, torso: 1.02, head: 1.0, width: 0.98, arms: 1.0 },
    hair: {
      color: '#f1ede4', brow: '#e6e0d4',
      pieces: [
        { kind: 'cap', front: 0.58, side: 0.04, back: -0.58, grow: [1.05, 1.07, 1.07] },
        { kind: 'locks', locks: [
          { pts: [[4, 66, 1.02], [26, 52, 1.08], [48, 32, 1.08], [58, 12, 1.05]], w: 0.066 },
          { pts: [[-4, 66, 1.02], [-26, 52, 1.08], [-48, 32, 1.08], [-58, 12, 1.05]], w: 0.066 },
        ] },
        { kind: 'braid', at: [180, -22], dir: [0, -1, -0.34], length: 0.44, width: 0.046, links: 4, tie: '#8a7a5a' },
      ],
    },
    face: { set: 'old', iris: '#7a4a26', eyeScale: 0.86, eyePitch: -8, mouthPitch: -32.5, brow: { w: 0.015, len: 21, at: [25, 9.5], raiseL: 7 }, marks: { blush: 0.4, laugh: true, blushColor: '#d0584a' }, mouths: { neutral: 'wry' } },
    costume: {
      top: { color: '#4fae96', hem: -0.12, flare: 1.26, trim: '#d9c27a', lining: '#2f4a44', placket: '#3a8a76' },
      sleeves: { color: '#4fae96', cuff: '#d9c27a', flare: 1.2 },
      legs: { color: '#3a3a44' }, shoes: { color: '#33333c', sole: '#1c1c22', tall: true },
      collar: { kind: 'scarf', color: '#f2ead4' }, buttons: { color: '#d9c27a', count: 3, size: 0.02 },
      gloves: { L: '#8a8a90', R: '#8a8a90' },
    },
    props: [{ kind: 'lantern', hand: 'L', color: '#eaf6c8', rib: '#7fae5a', light: '#d9f0a0' }],
    poses: {
      // straight where her sister is bent; a fist on one hip
      stand: {
        hips: { r: [-2, -8, 0] }, chest: [-3, 6, -2], head: [2, 8, -5], legL: [0, 6, 5], legR: [0, -6, -5],
        armR: [12, 0, -40], foreR: [-24, 0, 96], handR: [0, 0, 20], armL: [-18, 0, 16], foreL: [-50, -8, 0],
      },
      signature: { chest: [2, -8, 0], head: [-14, 4, -6], armL: [-82, 0, 18], foreL: [-60, 0, 0] },
    },
    gestures: ['talkPoint', 'talkSmall', 'talkShrug'], anim: { gesture: 0.9, gesturePeriod: 2.4 }, idle: { speed: 0.85, breath: 1.2, bob: 0.7, sway: 0.7 },
  },

  // Linnet Foss, 21: Surety of Halcyon, contract 418. Level and exact. Stands at ease as if measured for it.
  foss: {
    id: 'foss', seed: 23, skin: '#e2b894',
    build: { height: 1.0, legs: 1.16, torso: 1.04, head: 0.96, width: 0.9 },
    hair: {
      color: '#2c2836', brow: '#221e2a',
      pieces: [
        { kind: 'cap', front: 0.52, side: 0.0, back: -0.48, grow: [1.06, 1.085, 1.075] },
        // a regulation crop: a straight fringe, cut with a ruler
        { kind: 'fringe', n: 6, from: -50, to: 50, top: 64, tip: 24, jag: 1.5, part: 0, gather: 0.75, w: 0.05 },
        { kind: 'locks', locks: [{ pts: [[66, 40, 1.04], [72, 20, 1.08], [72, 0, 1.07], [66, -14, 1.05]], w: 0.05 }, { pts: [[-66, 40, 1.04], [-72, 20, 1.08], [-72, 0, 1.07], [-66, -14, 1.05]], w: 0.05 }] },
      ],
    },
    face: { set: 'lash', iris: '#6a7fa0', eyeScale: 0.96, brow: { w: 0.016, len: 23, at: [25, 13.5] }, marks: { blush: 0.25 }, mouths: { neutral: 'flat' } },
    costume: {
      top: { color: '#8794a8', hem: -0.1, flare: 1.16, trim: '#d9b04e', placket: '#6a768a', lining: '#3a4252' },
      sleeves: { color: '#8794a8', cuff: '#d9b04e', flare: 1.08 },
      legs: { color: '#4a5266' }, shoes: { color: '#2a2c3a', sole: '#d9b04e', tall: true },
      collar: { kind: 'high', color: '#6a768a' }, belt: { color: '#2a2c3a', buckle: '#d9b04e' }, buttons: { color: '#d9b04e', count: 4 },
      extras: [{ kind: 'brooch', shape: 'bar', color: '#ffcf3f', x: 0.05, y: 0.165, size: 0.013 }, { kind: 'brooch', shape: 'bar', color: '#ffcf3f', x: 0.075, y: 0.158, size: 0.013 }, { kind: 'brooch', shape: 'bar', color: '#ffcf3f', x: 0.098, y: 0.146, size: 0.013 }],
    },
    poses: {
      // at ease: feet apart, hands behind, everything square
      stand: { hips: { r: [-2, 0, 0] }, chest: [-4, 0, 0], head: [0, 0, 0], legL: [0, 4, 9], legR: [0, -4, -9], armL: [22, 0, 6], foreL: [12, 0, -62], armR: [22, 0, -6], foreR: [12, 0, 62] },
      signature: { armR: [-66, 0, -8], foreR: [-30, 0, 0], handR: [0, -80, 0], chest: [4, 8, 0] },
    },
    gestures: ['talkSmall', 'talkOpen'], anim: { gesture: 0.6, gesturePeriod: 2.8 }, idle: { speed: 0.7, bob: 0.4, sway: 0.3 },
  },

  // Tamsin Lowrie, 40s: lamp-keeper on Carrow, Ren's mother. His brow and jaw; says little; is usually holding a bowl out to somebody.
  tamsin: {
    id: 'tamsin', seed: 24, skin: '#e9b184',
    build: { height: 0.98, legs: 1.12, torso: 1.02, head: 0.97, width: 0.93, arms: 1.04 },
    hair: {
      color: '#8a8a94', brow: '#232846',
      pieces: [
        { kind: 'cap', front: 0.52, side: -0.04, back: -0.6, grow: [1.06, 1.09, 1.08] },
        { kind: 'fringe', n: 4, from: 40, to: -50, part: 30, top: 64, tips: [22, 14, 18, 6], sweep: -6, gather: 0.3 },
        { kind: 'bun', at: [180, 50], size: 0.095, out: 0.5, band: '#8fae7a' },
        { kind: 'sidelocks', side: 'L', yaw: 64, top: 4, length: 0.13, w: 0.032 },
      ],
    },
    face: { set: 'round', iris: '#3f8fe0', eyeScale: 0.92, brow: { w: 0.022, len: 25 }, marks: { blush: 0.36, laugh: true }, mouths: { neutral: 'softsmile' } },
    costume: {
      top: { color: '#8fae7a', hem: -0.16, flare: 1.34, trim: '#6a8a5a', lining: '#3f5a3a' },
      sleeves: { color: '#8fae7a', rolled: true },
      legs: { color: '#5a4a3a' }, shoes: { color: '#6a4a32', sole: '#3a2818' },
      gloves: { R: '#4a4450' },
      extras: [{ kind: 'shawl', color: '#f0e6d0', color2: '#d9cdb2', trim: '#c4b698', toggle: '#8a6a44', length: 0.1 }, { kind: 'brooch', shape: 'bar', color: '#c9803f', x: 0.05, y: 0.02, size: 0.026 }],
    },
    props: [{ kind: 'bowl', hand: 'L' }],
    poses: {
      stand: {
        hips: { r: [0, -8, 2] }, chest: [2, 6, -2], head: [4, 10, 4], legL: [0, 12, 10], shinL: [3, 0, 0], legR: [0, -6, -2],
        armL: [-30, 0, 10], foreL: [-66, 0, 0], armR: [4, 0, -12], foreR: [-20, 0, 0],
      },
      // the bowl held out
      signature: { chest: [6, 8, 0], head: [-6, -6, 6], armL: [-64, 0, 6], foreL: [-30, 0, 0] },
    },
    gestures: ['talkSmall', 'talkPat'], anim: { gesture: 0.5, gesturePeriod: 3.6 }, idle: { speed: 0.7, breath: 1.2, bob: 0.6, sway: 0.6 },
  },

  // ---- rank and file of chapters 2 to 8. Cheap on purpose: one hat, one strong colour, one thing in the hand, so each
  // reads at 70 px by silhouette and colour. `rank` and `alts` are for castVariant (palettes; the other looks, e.g. the women).
  // Their irises come from IRIS_SHARED: every extra in the game shares five eyeball colours in the face atlas.

  // A Saltmere miner: salt-white canvas, a leather cap with a lit brow-lamp, a pick.
  miner: {
    id: 'miner', seed: 31, skin: '#b9856a', rank: { cloth: ['#c4b890', '#a89e7c', '#b8a47a', '#9a947e', '#cfc6a6'], beards: true },
    alts: [{ pieces: [{ kind: 'cap', front: 0.5, side: -0.1, back: -0.6 }, { kind: 'fringe', n: 3, from: -36, to: 36, top: 30, tip: 16, jag: 3, w: 0.05, r: 1.07 }, { kind: 'tail', at: [180, -24], dir: [0, -1, -0.4], length: 0.16, width: 0.05, links: 1, tie: '#7fb5b0' }, { kind: 'lampcap', color: '#6a4a32' }], face: { set: 'lash', marks: { blush: 0.4, dust: true } }, build: { width: 1.08, height: 0.96 }, noBeard: true }],
    build: { height: 1.02, legs: 0.98, torso: 1.1, head: 0.97, width: 1.24, belly: 0.1, hands: 1.2, feet: 1.12, arms: 1.06 },
    hair: { color: '#3a2c26', brow: '#e8e2d6', pieces: [{ kind: 'cap', front: 0.52, side: 0.0, back: -0.5 }, { kind: 'lampcap', color: '#6a4a32' }] },
    face: { set: 'round', iris: '#4a3a2a', eyeScale: 0.82, eyePitch: -7.5, brow: { w: 0.026, len: 24, at: [24, 10] }, marks: { blush: 0.35, dust: true, stubble: true }, mouths: { neutral: 'flat' } },
    costume: {
      top: { color: '#c4b890', hem: -0.05, flare: 1.14, trim: '#8a8062', lining: '#5a5440', placket: '#a89e7c' },
      sleeves: { color: '#c4b890', rolled: true }, legs: { color: '#5a5460' }, shoes: { color: '#3a2c24', sole: '#1f1814', tall: true, cuff: '#7fb5b0' },
      collar: { kind: 'scarf', color: '#7fb5b0' }, belt: { color: '#3a2c24', buckle: '#d9a94a' },
    },
    props: [{ kind: 'pick', hand: 'R' }],
    poses: {
      stand: { hips: { r: [0, 8, -2] }, chest: [4, -6, 2], head: [6, -6, -3], legL: [0, 10, 9], legR: [0, -10, -9], armL: [4, 0, 24], foreL: [-34, 0, -20], armR: [-6, 0, -16], foreR: [-64, 0, 0] },
      signature: { chest: [-6, 0, 0], head: [-8, 0, 0], armR: [-140, 0, -16], foreR: [-36, 0, 0] },
    },
    gestures: ['talkPoint', 'talkBoth'], anim: { gesture: 1.0, gesturePeriod: 2.2 }, idle: { speed: 0.85, sway: 0.7 },
  },

  // A Halcyon cadet on parade: Ren's blue and silver, a cadet cap, eyes front.
  cadet: {
    id: 'cadet', seed: 32, skin: '#f0c6a0', rank: { uniform: true },
    alts: [{ pieces: [{ kind: 'cap', front: 0.5, side: -0.12, back: -0.62 }, { kind: 'fringe', n: 4, from: -40, to: 40, top: 30, tip: 15, jag: 4, part: 0, gather: 0.6, r: 1.07 }, { kind: 'tail', at: [180, -18], dir: [0, -1, -0.5], length: 0.2, width: 0.052, links: 2, tie: '#c3cfe0' }, { kind: 'kepi', color: '#2f5fb8', band: '#c3cfe0', peak: '#2c2b52', tall: 0.72 }], face: { set: 'lash' }, build: { width: 0.86, height: 0.93 } }],
    build: { height: 0.97, legs: 1.16, torso: 1.02, head: 1.0, width: 0.93, arms: 1.04 },
    hair: { color: '#7a4a2a', brow: '#5a361e', pieces: [{ kind: 'cap', front: 0.5, side: 0.02, back: -0.52 }, { kind: 'kepi', color: '#2f5fb8', band: '#c3cfe0', peak: '#2c2b52', tall: 0.72 }] },
    face: { set: 'round', iris: '#3f6f9a', eyeScale: 0.96, brow: { w: 0.018, len: 22, at: [25, 13] }, marks: { blush: 0.45 }, mouths: { neutral: 'flat' } },
    costume: {
      top: { color: '#2f5fb8', hem: -0.035, flare: 1.22, trim: '#b9c6da', placket: '#24478f' }, sleeves: { cuff: '#b9c6da', flare: 1.12 },
      legs: { color: '#44539c' }, shoes: { color: '#2c2b52', sole: '#b9c6da', cuff: '#c3cfe0', tall: true },
      collar: { kind: 'stand', color: '#c3cfe0' }, belt: { color: '#2c2b52', buckle: '#ffd24a' }, buttons: { color: '#ffd24a', rows: 2, count: 3 },
      extras: [{ kind: 'epaulettes', color: '#c3cfe0' }],
    },
    poses: {
      stand: { hips: { r: [-2, 0, 0] }, chest: [-6, 0, 0], head: [-4, 0, 0], legL: [0, 4, 1], legR: [0, -4, -1], armL: [2, 0, 5], foreL: [-4, 0, 0], armR: [2, 0, -5], foreR: [-4, 0, 0] },
      signature: { armR: [-20, 0, -100], foreR: [0, 0, -128], handR: [0, 0, -10], head: [-8, 0, 0] },
    },
    gestures: ['talkSmall', 'talkBoth'], anim: { gesture: 0.7, gesturePeriod: 2.2 }, idle: { speed: 0.9, bob: 0.5, sway: 0.3 },
  },

  // An underwriter of the Halcyon floor: grey and gold to the ankle, a bald crown, pince-nez, a slate of somebody's price.
  underwriter: {
    id: 'underwriter', seed: 33, skin: '#f0cdb0', rank: { uniform: true },
    alts: [{ pieces: [{ kind: 'cap', front: 0.56, side: 0.0, back: -0.56 }, { kind: 'fringe', n: 2, from: 14, to: 54, part: 0, top: 64, tips: [34, 14], gather: 0.15, r: 1.085, tipR: 1.06, w: 0.07, thick: 0.4 }, { kind: 'fringe', n: 2, from: -14, to: -54, part: 0, top: 64, tips: [34, 14], gather: 0.15, r: 1.085, tipR: 1.06, w: 0.07, thick: 0.4 }, { kind: 'bun', at: [180, 40], size: 0.09, out: 0.5, band: '#d9b04e' }], face: { set: 'lash' }, build: { width: 0.94, belly: 0.08 }, noBeard: true }],
    build: { height: 1.02, legs: 1.0, torso: 1.1, head: 1.0, width: 1.1, belly: 0.26 },
    hair: { color: '#c9c4bc', brow: '#8a8690', pieces: [{ kind: 'cap', front: 0.86, side: 0.1, back: -0.5, grow: [1.045, 1.03, 1.07] }, { kind: 'spikes', sweep: [0, 0.1, -0.4], thick: 0.8, spikes: [[104, 4, 0.09, 0.07, 0, [0.4, -0.2, -0.5]], [-104, 4, 0.09, 0.07, 0, [-0.4, -0.2, -0.5]]] }] },
    face: { set: 'heavy', iris: '#5a4a8a', eyeScale: 0.84, eyePitch: -6.5, brow: { w: 0.024, len: 24, at: [25, 12], tilt: -3 }, marks: { blush: 0.4 }, mouths: { neutral: 'pursed' } },
    costume: {
      top: { color: '#8794a8', hem: -0.2, flare: 1.26, trim: '#d9b04e', placket: '#6a768a', lining: '#3a4252' }, sleeves: { color: '#8794a8', cuff: '#d9b04e', flare: 1.3 },
      legs: { color: '#4a5266' }, shoes: { color: '#2a2c3a', sole: '#d9b04e' }, collar: { kind: 'flat', color: '#fff6e6' }, buttons: { color: '#d9b04e', count: 4 },
      extras: [{ kind: 'glasses', color: '#d9b04e', size: 0.9 }, { kind: 'moustache', color: '#c9c4bc' }, { kind: 'bowtie', color: '#d9b04e' }],
    },
    props: [{ kind: 'slate', hand: 'R' }],
    poses: {
      stand: { hips: { r: [-2, -6, 0] }, chest: [2, 4, 0], head: [6, 6, -3], legL: [0, 6, 4], legR: [0, -6, -4], armR: [-24, 0, -10], foreR: [-86, 10, 0], armL: [6, 0, 10], foreL: [-44, 0, -44] },
      signature: { chest: [8, 10, 0], head: [-6, -8, -4], armR: [-76, 0, -6], foreR: [-20, 0, 0] },
    },
    gestures: ['talkSmall', 'talkPat', 'talkPoint'], anim: { gesture: 0.8, gesturePeriod: 2.6 }, idle: { speed: 0.8, sway: 0.5 },
  },

  // A magistrate of the Benches: black to the floor, white bands, the flat soft bonnet of the Bench. Not Maravel: rounder, and sure of it.
  magistrate: {
    id: 'magistrate', seed: 34, skin: '#e6c0a2', rank: { uniform: true, beards: true },
    alts: [{ pieces: [{ kind: 'cap', front: 0.56, side: -0.1, back: -0.6 }, { kind: 'bun', at: [180, 8], size: 0.085, out: 0.5 }, { kind: 'toque', tall: 0.8, wide: 1.16, color: '#23202f', band: '#a99bc4', button: '#a99bc4' }], face: { set: 'sharp' }, build: { width: 0.94, belly: 0.06, height: 1.02 }, noBeard: true }],
    build: { height: 1.04, legs: 1.0, torso: 1.12, head: 0.98, width: 1.14, belly: 0.24 },
    hair: { color: '#8a8690', brow: '#5a5664', pieces: [{ kind: 'cap', front: 0.6, side: 0.02, back: -0.52 }, { kind: 'toque', tall: 0.8, wide: 1.16, color: '#23202f', band: '#a99bc4', button: '#a99bc4' }] },
    face: { set: 'heavy', iris: '#5a6a3a', eyeScale: 0.84, eyePitch: -6.5, brow: { w: 0.028, len: 26, at: [25, 12], tilt: -4 }, marks: { blush: 0.35 }, mouths: { neutral: 'down', soft: 'flat' } },
    costume: {
      top: { color: '#34304c', hem: -0.21, flare: 1.3, trim: '#a99bc4', lining: '#1d1a30' }, sleeves: { color: '#34304c', cuff: '#a99bc4', flare: 1.55 },
      legs: { color: '#23202f' }, shoes: { color: '#23202f' }, collar: { kind: 'flat', color: '#a99bc4' },
      extras: [{ kind: 'tabs' }, { kind: 'beard', shape: 'full', color: '#8a8690', size: 0.9 }],
    },
    poses: {
      stand: { hips: { r: [-3, 6, 0] }, chest: [-4, -4, 0], head: [4, -6, 3], legL: [0, 8, 5], legR: [0, -8, -5], armL: [-26, 0, 16], foreL: [-70, 0, -70], armR: [-26, 0, -16], foreR: [-66, 0, 70] },
      signature: { chest: [4, -8, 0], head: [-4, 6, 0], armR: [-80, 0, -10], foreR: [-30, 0, 0] },
    },
    gestures: ['talkSmall', 'talkPat', 'talkChin'], anim: { gesture: 0.6, gesturePeriod: 3.2 }, idle: { speed: 0.7, breath: 1.2, sway: 0.5 },
  },

  // An islander of Little Brand, nine years off the map: undyed wool, patched oilskin, a knitted cap. No lantern, no city's colours.
  islander: {
    id: 'islander', seed: 35, skin: '#b8846a', rank: { cloth: ['#6f7a4e', '#8a7a52', '#7a6a58', '#5f7a72', '#8a8272', '#9a8a5a'], hats: ['#d9cdb2', '#b8a888', '#8a7a66', '#c9b89a'], legs: ['#5a4a3a', '#4a4640', '#6a5a48'], scarves: ['#e6dcc4', '#cfc4a8', '#b8ad94'], beards: true },
    alts: [{ pieces: [{ kind: 'cap', front: 0.52, side: -0.12, back: -0.62 }, { kind: 'fringe', n: 4, from: -42, to: 42, top: 60, tip: 22, jag: 5, part: -8, gather: 0.5 }, { kind: 'bun', at: [180, 30], size: 0.09, out: 0.5, band: '#8a7a5a' }], face: { set: 'lash', marks: { blush: 0.5 } }, build: { width: 1.0, height: 0.93, belly: 0.1 }, noBeard: true,
      costume: { top: { color: '#8a7a52', hem: -0.16, flare: 1.4, trim: '#5a4e34', lining: '#3a3222' }, extras: [{ kind: 'shawl', color: '#e6dcc4', color2: '#cfc4a8', trim: '#b8ad94', toggle: '#8a6a44', length: 0.1, dye: 'wool' }] } }],
    build: { height: 1.0, legs: 0.98, torso: 1.06, head: 1.0, width: 1.14, belly: 0.12, hands: 1.12 },
    hair: { color: '#4a3a30', brow: '#33261f', pieces: [{ kind: 'cap', front: 0.5, side: 0.0, back: -0.52 }, { kind: 'knitcap', color: '#d9cdb2', band: '#b8a888' }] },
    face: { set: 'round', iris: '#7a4a26', eyeScale: 0.86, eyePitch: -7, brow: { w: 0.024, len: 23, at: [24, 10.5] }, marks: { blush: 0.5, blushColor: '#d0584a', stubble: true }, mouths: { neutral: 'flat' } },
    costume: {
      top: { color: '#6f7a4e', hem: -0.09, flare: 1.2, trim: '#4a5234', lining: '#2f3422', placket: '#5a6440' }, sleeves: { color: '#6f7a4e', flare: 1.14 },
      legs: { color: '#5a4a3a' }, shoes: { color: '#3a2c24', sole: '#1f1814', tall: true }, collar: { kind: 'scarf', color: '#e6dcc4' },
      extras: [{ kind: 'brooch', shape: 'bar', color: '#b8a070', x: -0.05, y: 0.04, size: 0.03 }, { kind: 'brooch', shape: 'bar', color: '#8a9a6a', x: 0.06, y: 0.12, size: 0.022 }],
    },
    poses: {
      stand: { hips: { r: [0, 6, 2] }, chest: [3, -4, -2], head: [2, -6, 3], legL: [0, 8, 6], legR: [0, -8, -6], armL: [-20, 0, -2], foreL: [-92, 0, -64], armR: [-16, 0, 2], foreR: [-98, 0, 60] },
      signature: { chest: [-4, 0, 0], head: [-8, 0, 0], armR: [-130, 0, -20], foreR: [-30, 0, 0], armL: [4, 0, 16], foreL: [-24, 0, 0] },
    },
    gestures: ['talkShrug', 'talkSmall', 'talkPoint'], anim: { gesture: 0.8, gesturePeriod: 2.6 }, idle: { speed: 0.8, sway: 0.6 },
  },

  // A broker of the Tallis floor: a quartered pit jacket you can find across a hall, a bowler, and a fistful of slips.
  broker: {
    id: 'broker', seed: 36, skin: '#f2cdb0', rank: { cloth: ['#e8603f', '#3f9ad0', '#5fae4a', '#b05ac0', '#f2a03a', '#e0507a'], legs: ['#3a3050', '#4a4a5a', '#33384a'] },
    alts: [{ pieces: [{ kind: 'cap', front: 0.52, side: -0.1, back: -0.6 }, { kind: 'fringe', n: 4, from: 34, to: -44, part: 28, top: 60, tips: [24, 20, 22, 14], sweep: -6, gather: 0.25, r: 1.09 }, { kind: 'tail', at: [180, -10], dir: [0, -0.9, -0.6], length: 0.18, width: 0.055, links: 2 }, { kind: 'bowler', color: '#33384a', band: '#f2c14e', dye: 'band' }], face: { set: 'lash' }, build: { width: 0.86, height: 0.95 }, noBeard: true }],
    build: { height: 1.0, legs: 1.14, torso: 0.98, head: 0.98, width: 0.92, arms: 1.1 },
    hair: { color: '#5a2c22', brow: '#44201a', pieces: [{ kind: 'cap', front: 0.5, side: 0.0, back: -0.54 }, { kind: 'bowler', color: '#33384a', band: '#f2c14e', dye: 'band' }] },
    face: { set: 'round', iris: '#5a4a8a', eyeScale: 0.9, brow: { w: 0.018, len: 23, at: [25, 13], raiseL: 4 }, marks: { blush: 0.4 }, mouths: { neutral: 'grin', soft: 'wry' } },
    costume: {
      top: { color: '#e8603f', hem: -0.045, flare: 1.18, trim: '#33384a', lining: '#7a2c1c' }, sleeves: { color: '#e8603f', cuff: '#f2c14e', flare: 1.12 },
      legs: { color: '#3a3050' }, shoes: { color: '#2a2030', sole: '#f2e2c0' }, collar: { kind: 'flat', color: '#fff8e6' },
      extras: [{ kind: 'checks', color: '#f2c14e', cols: 2, rows: 2, dye: 'light' }, { kind: 'bowtie', color: '#33384a' }, { kind: 'moustache', color: '#5a2c22' }],
    },
    props: [{ kind: 'slips', hand: 'R' }],
    poses: {
      stand: { hips: { r: [2, 12, -5], p: [-0.012, 0, 0] }, chest: [6, -10, 6], head: [-6, -8, -8], legL: [-4, 12, 8], shinL: [8, 0, 0], legR: [2, -4, -3], armR: [-30, 0, -20], foreR: [-100, 10, 0], armL: [10, 0, 30], foreL: [-30, 0, -84] },
      // bidding: the slip as high as the arm goes
      signature: { chest: [-6, 8, -4], head: [-10, 6, 0], armR: [-158, 0, -14], foreR: [-16, 0, 0], legL: [4, 10, 8] },
    },
    gestures: ['talkPoint', 'talkBoth', 'talkOpen'], anim: { gesture: 1.2, gesturePeriod: 1.5 }, idle: { speed: 1.35, bob: 1.2, sway: 1.2 },
  },

  // A steward of the Tallis Compact's savings hall (not the Mint's): shirtsleeves and sleeve-guards, a canvas apron, the book, chalk behind the ear.
  'commons-steward': {
    id: 'commons-steward', seed: 37, skin: '#d9a582', rank: { cloth: ['#2f7f86', '#5a7a4a', '#7a5a8a', '#8a5a3a'], beards: true },
    alts: [{ pieces: [{ kind: 'cap', front: 0.54, side: -0.1, back: -0.6 }, { kind: 'fringe', n: 4, from: -40, to: 40, top: 58, tip: 20, jag: 5, part: 0, gather: 0.5 }, { kind: 'bun', at: [180, 56], size: 0.1, out: 0.5, band: '#f2c14e' }, { kind: 'pencil', at: [96, 24], dir: [0.2, 0.75, 0.6], length: 0.1, r: 1.1, out: 0.3, chalk: true }], face: { set: 'lash' }, build: { width: 1.0, height: 0.94, belly: 0.14 }, noBeard: true }],
    build: { height: 1.0, legs: 0.98, torso: 1.08, head: 1.0, width: 1.14, belly: 0.26 },
    hair: { color: '#b4b0a8', brow: '#7a7670', pieces: [{ kind: 'cap', front: 0.8, side: 0.08, back: -0.5, grow: [1.045, 1.04, 1.07] }, { kind: 'spikes', sweep: [0, 0.1, -0.4], thick: 0.8, spikes: [[106, 2, 0.085, 0.07, 0, [0.4, -0.25, -0.5]], [-106, 2, 0.085, 0.07, 0, [-0.4, -0.25, -0.5]]] }, { kind: 'pencil', at: [96, 24], dir: [0.2, 0.75, 0.6], length: 0.1, r: 1.1, out: 0.3, chalk: true }] },
    face: { set: 'old', iris: '#5a6a3a', eyeScale: 0.86, eyePitch: -7, brow: { w: 0.024, len: 24, at: [24, 11] }, marks: { blush: 0.5, laugh: true }, mouths: { neutral: 'softsmile' } },
    costume: {
      top: { color: '#2f7f86', hem: -0.03, flare: 1.14, trim: '#1f5a60', lining: '#134044' }, sleeves: { color: '#fff4dc', cuff: '#33384a', flare: 1.1 },
      legs: { color: '#4a4640' }, shoes: { color: '#3a2c24', sole: '#1f1814' }, collar: { kind: 'flat', color: '#fffaf0' },
      extras: [{ kind: 'apron', color: '#e9dcc0', pocket: '#cfc0a0', spread: 1.8 }, { kind: 'moustache', color: '#b4b0a8' }],
    },
    props: [{ kind: 'ledger', hand: 'L', color: '#3f7a5a', trim: '#f2c14e' }],
    poses: {
      stand: { hips: { r: [2, 6, 0] }, chest: [4, -4, 0], head: [0, -4, 3], legL: [-2, 6, 4], legR: [-2, -6, -4], armL: [-4, 0, 8], foreL: [-84, 0, -30], armR: [2, 0, -12], foreR: [-30, 0, 0] },
      signature: { chest: [10, 6, 0], head: [12, 8, 0], armR: [-30, 0, -4], foreR: [-108, 0, 40] },
    },
    gestures: ['talkPat', 'talkSmall', 'talkShrug'], anim: { gesture: 0.8, gesturePeriod: 2.6 }, idle: { speed: 0.8, breath: 1.2, sway: 0.6 },
  },

  // An Audit marine: the Assessor's black and silver, a steel cap, a cross-belt, a boathook that is not for boats.
  marine: {
    id: 'marine', seed: 38, skin: '#e2b894', rank: { uniform: true },
    build: { height: 1.07, legs: 1.1, torso: 1.12, head: 0.93, width: 1.2, hands: 1.15, feet: 1.1, arms: 1.06 },
    hair: { color: '#2e2630', brow: '#221c24', pieces: [{ kind: 'cap', front: 0.48, side: 0.0, back: -0.5 }, { kind: 'helm', color: '#c0c6d6' }] },
    face: { set: 'sharp', iris: '#3f6f9a', eyeScale: 0.8, eyePitch: -7.5, brow: { w: 0.026, len: 24, at: [24, 11], tilt: 5 }, marks: { blush: 0.2, stubble: true }, mouths: { neutral: 'down' } },
    costume: {
      top: { color: '#343848', hem: -0.12, flare: 1.16, trim: '#c0c6d6', placket: '#22242e', lining: '#1a1c26' }, sleeves: { color: '#343848', cuff: '#c0c6d6', flare: 1.08 },
      legs: { color: '#22242e' }, shoes: { color: '#1c1e28', sole: '#8d949e', tall: true, cuff: '#c0c6d6' },
      collar: { kind: 'stand', color: '#c0c6d6' }, belt: { color: '#e6ebf5', buckle: '#c0c6d6' }, gloves: { L: '#8d949e', R: '#8d949e' },
      extras: [{ kind: 'sash', color: '#e6ebf5', rosette: '#c0c6d6', from: 'R' }, { kind: 'epaulettes', color: '#c0c6d6' }],
    },
    props: [{ kind: 'boathook', hand: 'L' }], handed: 'L',
    poses: {
      stand: { hips: { r: [0, -8, 2] }, chest: [-4, 6, -2], head: [6, 8, 3], legL: [0, 8, 7], legR: [0, -8, -7], armR: [12, 0, -30], foreR: [-20, 0, 90], armL: [-6, 0, 40], foreL: [-66, 0, 10] },
      signature: { armL: [-60, 0, 40], foreL: [-50, 0, 0], chest: [6, -10, 0], head: [2, 8, 0] },
    },
    gestures: ['talkPoint', 'talkSmall'], anim: { gesture: 0.8 }, idle: { speed: 0.75, sway: 0.4 },
  },

  // A Halcyon escort: one of the Surety's eleven. Foss's grey and brass on somebody larger, a grey kepi, a writ ready.
  escort: {
    id: 'escort', seed: 44, skin: '#e2b894', rank: { uniform: true },
    alts: [{ pieces: [{ kind: 'cap', front: 0.5, side: -0.1, back: -0.56 }, { kind: 'fringe', n: 4, from: -40, to: 40, top: 30, tip: 15, jag: 2, part: 0, gather: 0.6, r: 1.07 }, { kind: 'kepi', color: '#8794a8', band: '#d9b04e', peak: '#2a2c3a', tall: 0.8 }], face: { set: 'lash' }, build: { width: 0.96, height: 0.97 } }],
    build: { height: 1.05, legs: 1.14, torso: 1.08, head: 0.94, width: 1.12, hands: 1.1 },
    hair: { color: '#3d2c33', brow: '#2c2026', pieces: [{ kind: 'cap', front: 0.48, side: 0.0, back: -0.5 }, { kind: 'kepi', color: '#8794a8', band: '#d9b04e', peak: '#2a2c3a', tall: 0.8 }] },
    face: { set: 'sharp', iris: '#5a6a3a', eyeScale: 0.82, eyePitch: -7, brow: { w: 0.022, len: 24, at: [24, 11.5], tilt: 4 }, marks: { blush: 0.25 }, mouths: { neutral: 'flat' } },
    costume: {
      top: { color: '#8794a8', hem: -0.1, flare: 1.16, trim: '#d9b04e', placket: '#6a768a', lining: '#3a4252' }, sleeves: { color: '#8794a8', cuff: '#d9b04e', flare: 1.08 },
      legs: { color: '#4a5266' }, shoes: { color: '#2a2c3a', sole: '#d9b04e', tall: true }, collar: { kind: 'high', color: '#6a768a' }, belt: { color: '#2a2c3a', buckle: '#d9b04e' }, buttons: { color: '#d9b04e', count: 4 },
      extras: [{ kind: 'epaulettes', color: '#d9b04e' }],
    },
    props: [{ kind: 'writ', hand: 'L' }], handed: 'L',
    poses: {
      stand: { hips: { r: [0, -6, 0] }, chest: [-4, 4, 0], head: [4, 6, 0], legL: [0, 4, 8], legR: [0, -4, -8], armR: [22, 0, -6], foreR: [12, 0, 62], armL: [-22, 0, 10], foreL: [-84, -10, 0] },
      signature: { chest: [8, -10, 0], head: [-6, 8, 6], armL: [-78, 0, 4], foreL: [-16, 0, 0] },
    },
    gestures: ['talkSmall', 'talkPoint'], anim: { gesture: 0.7 }, idle: { speed: 0.7, sway: 0.4 },
  },

  // A rower of the Kedge Compact: a hooped jersey, bare arms, a red band round the brow, an oar taller than they are.
  rower: {
    id: 'rower', seed: 39, skin: '#c98e6e', rank: { uniform: true, beards: true },
    alts: [{ pieces: [{ kind: 'cap', front: 0.5, side: -0.1, back: -0.62 }, { kind: 'fringe', n: 3, from: -36, to: 36, top: 62, tip: 36, jag: 3, part: 0, gather: 0.5 }, { kind: 'tail', at: [180, 30], dir: [0, -0.5, -1], length: 0.2, width: 0.06, links: 2 }, { kind: 'headband', color: '#e8483f' }], face: { set: 'lash' }, build: { width: 1.04, height: 0.96 }, noBeard: true }],
    build: { height: 1.04, legs: 1.02, torso: 1.1, head: 0.96, width: 1.26, hands: 1.2, arms: 1.12, feet: 1.08 },
    hair: { color: '#2e2630', brow: '#221c24', pieces: [{ kind: 'cap', front: 0.54, side: 0.04, back: -0.5, zig: 0.08, zigN: 3 }, { kind: 'headband', color: '#e8483f' }] },
    face: { set: 'round', iris: '#4a3a2a', eyeScale: 0.84, eyePitch: -7, brow: { w: 0.026, len: 24, at: [24, 10.5] }, marks: { blush: 0.5 }, mouths: { neutral: 'grin' } },
    costume: {
      top: { color: '#fff1d6', hem: -0.02, flare: 1.1, trim: '#e8483f', lining: '#a03020' }, sleeves: { color: '#fff1d6', rolled: true },
      legs: { color: '#3f5a8a' }, shoes: { color: '#7a4a2a', sole: '#3a2418' }, belt: { color: '#3a2c24', buckle: '#d9a94a' },
      extras: [{ kind: 'checks', color: '#e8483f', cols: 1, rows: 7 }],
    },
    props: [{ kind: 'oar', hand: 'R' }],
    poses: {
      stand: { hips: { r: [0, 8, -2] }, chest: [2, -6, 2], head: [2, -6, -3], legL: [0, 10, 9], legR: [0, -10, -9], armL: [14, 0, 44], foreL: [-24, 0, -96], handL: [0, 0, -20], armR: [-8, 0, -22], foreR: [-78, 0, 0] },
      signature: { chest: [-6, 0, 0], head: [-8, 0, 0], armR: [-120, 0, -20], foreR: [-40, 0, 0] },
    },
    gestures: ['talkPoint', 'talkBoth'], anim: { gesture: 1.0, gesturePeriod: 2.0 }, idle: { speed: 0.95, sway: 0.8 },
  },

  // A fisher of the Vessery fish dock: yellow oilskin to the knee, a sou'wester, sea boots.
  fisher: {
    id: 'fisher', seed: 40, skin: '#c99272', rank: { cloth: ['#f2c230', '#e89a2a', '#d9c85a', '#e8b04a', '#f0d060'], legs: ['#3a3a44', '#4a4640', '#33384a'], scarves: ['#3f9ad0', '#e8483f', '#fff1d6', '#2f9a86'], beards: true },
    alts: [{ pieces: [{ kind: 'cap', front: 0.52, side: -0.12, back: -0.62 }, { kind: 'fringe', n: 4, from: -42, to: 42, top: 30, tip: 15, jag: 4, part: 0, gather: 0.6, r: 1.07 }, { kind: 'braid', at: [-118, -30], dir: [-0.16, -1, 0.42], length: 0.26, width: 0.046, links: 2, tie: '#3f9ad0' }, { kind: 'souwester', color: '#f2c230', dye: 'top' }], face: { set: 'lash', marks: { blush: 0.6 } }, build: { width: 1.04, height: 0.94, belly: 0.14 }, noBeard: true }],
    build: { height: 1.02, legs: 0.96, torso: 1.1, head: 0.98, width: 1.22, belly: 0.2, hands: 1.15, feet: 1.12 },
    hair: { color: '#9a9aa4', brow: '#6a6a74', pieces: [{ kind: 'cap', front: 0.5, side: 0.0, back: -0.52 }, { kind: 'souwester', color: '#f2c230', dye: 'top' }] },
    face: { set: 'round', iris: '#3f6f9a', eyeScale: 0.84, eyePitch: -7, brow: { w: 0.026, len: 24, at: [24, 10.5] }, marks: { blush: 0.55, blushColor: '#d0584a' }, mouths: { neutral: 'flat', soft: 'softsmile' } },
    costume: {
      top: { color: '#f2c230', hem: -0.14, flare: 1.3, trim: '#b8861c', lining: '#7a5a14', placket: '#d9a824' }, sleeves: { color: '#f2c230', flare: 1.2 },
      legs: { color: '#3a3a44' }, shoes: { color: '#33333c', sole: '#1c1c22', tall: true }, collar: { kind: 'scarf', color: '#3f9ad0' }, buttons: { color: '#7a5a14', count: 3, size: 0.02 },
      extras: [{ kind: 'beard', shape: 'full', color: '#9a9aa4', size: 0.95 }],
    },
    poses: {
      stand: { hips: { r: [0, 8, 3] }, chest: [0, -6, -3], head: [-2, -6, 5], legL: [0, 10, 8], legR: [0, -10, -8], armL: [14, 0, 46], foreL: [-24, 0, -96], handL: [0, 0, -20], armR: [12, 0, -44], foreR: [-24, 0, 96], handR: [0, 0, 20] },
      signature: { chest: [-6, 0, 0], head: [-8, 0, 0], armR: [-150, 0, -18], foreR: [-40, 0, 0] },
    },
    gestures: ['talkPoint', 'talkBoth', 'talkShrug'], anim: { gesture: 1.0 }, idle: { speed: 0.85, sway: 0.7 },
  },

  // A member of the Assembly at Cresset: a long robe in their city's colour, a gold sash, a tall soft cap. Old, and seated in spirit.
  member: {
    id: 'member', seed: 41, skin: '#e9c4a4', rank: { cloth: ['#7a3f8a', '#2f7f86', '#b8504a', '#3f5fa8', '#5a8a4a', '#c9803f', '#8a5a34', '#4a4a7a', '#a8436a'], keepLegs: true, beards: true },
    alts: [{ pieces: [{ kind: 'cap', front: 0.56, side: -0.1, back: -0.6 }, { kind: 'bun', at: [180, 6], size: 0.09, out: 0.5 }, { kind: 'toque', tall: 1.5, color: '#7a3f8a', band: '#ffcf3f', dye: 'top' }], face: { set: 'old', marks: { blush: 0.4, laugh: true } }, build: { width: 0.98, belly: 0.1, height: 0.98 }, noBeard: true }],
    build: { height: 1.04, legs: 0.96, torso: 1.14, head: 0.99, width: 1.16, belly: 0.28 },
    hair: { color: '#e4e0d8', brow: '#a8a4a0', pieces: [{ kind: 'cap', front: 0.6, side: 0.04, back: -0.54 }, { kind: 'toque', tall: 1.5, color: '#7a3f8a', band: '#ffcf3f', dye: 'top' }] },
    face: { set: 'old', iris: '#5a4a8a', eyeScale: 0.84, eyePitch: -7, brow: { w: 0.026, len: 25, at: [25, 11], tilt: -3 }, marks: { blush: 0.4, laugh: true }, mouths: { neutral: 'pursed' } },
    costume: {
      top: { color: '#7a3f8a', hem: -0.22, flare: 1.3, trim: '#ffcf3f', lining: '#3a1a44' }, sleeves: { color: '#7a3f8a', cuff: '#ffcf3f', flare: 1.5 },
      legs: { color: '#2a2030' }, shoes: { color: '#2a2030', sole: '#ffcf3f' }, collar: { kind: 'flat', color: '#fff6e6' },
      extras: [{ kind: 'sash', color: '#ffcf3f', rosette: '#fff6dc' }, { kind: 'beard', shape: 'point', color: '#e4e0d8', size: 0.9 }],
    },
    poses: {
      stand: { hips: { r: [-2, -6, 0] }, chest: [-3, 4, 0], head: [2, 6, -4], legL: [0, 8, 5], legR: [0, -8, -5], armL: [-26, 0, 16], foreL: [-70, 0, -70], armR: [-26, 0, -16], foreR: [-66, 0, 70] },
      // on a point of order: one hand up, flat
      signature: { chest: [-4, 8, 0], head: [-6, 4, 0], armR: [-140, 0, -12], foreR: [-20, 0, 0] },
    },
    gestures: ['talkOpen', 'talkSmall', 'talkPat', 'talkPoint'], anim: { gesture: 0.8, gesturePeriod: 2.8 }, idle: { speed: 0.7, breath: 1.3, sway: 0.5 },
  },
};

/** The five iris colours every rank-and-file face uses (and castVariant picks from): 15 eyeball cells for all the extras in the game. */
export const IRIS_SHARED = ['#4a3a2a', '#5a6a3a', '#5a4a8a', '#3f6f9a', '#7a4a26'];

// the speaker id 'crowd' is a docker; 'docker-lantern' carries one for the walk to the ferry (setLit(false) until the cue)
CAST.crowd = { ...CAST.docker, id: 'crowd' };
// 'docker-hat': the one who brings the hat round when the Commons covers a debt (signature: the hat held out)
CAST['docker-hat'] = { ...CAST.docker, id: 'docker-hat', props: [{ kind: 'hat', hand: 'R', color: '#7c8094' }], poses: { ...CAST.docker.poses, stand: { ...CAST.docker.poses.stand, armR: [-30, 0, -10], foreR: [-62, 0, 0] }, signature: { chest: [6, 8, 0], armR: [-66, 0, -4], foreR: [-30, 0, 0], head: [-8, -6, 4] } } };
CAST['docker-lantern'] = { ...CAST.docker, id: 'docker-lantern', props: [{ kind: 'lantern', hand: 'R', size: 0.07 }], poses: { ...CAST.docker.poses, stand: { ...CAST.docker.poses.stand, armR: [-24, 0, -18], foreR: [-56, 0, 0] }, signature: { armR: [-120, 0, -16], foreR: [-30, 0, 0], head: [-10, 0, 0] } } };

CAST['islander-lantern'] = { ...CAST.islander, id: 'islander-lantern', props: [{ kind: 'lantern', hand: 'R', size: 0.066, color: '#eaf6c8', rib: '#7fae5a', light: '#d9f0a0' }], poses: { ...CAST.islander.poses, stand: { ...CAST.islander.poses.stand, armR: [-24, 0, -18], foreR: [-56, 0, 0] }, signature: { armR: [-120, 0, -16], foreR: [-30, 0, 0], head: [-10, 0, 0] } } };
// Ansel's dormitory: the cadet at twelve
CAST['cadet-junior'] = { ...CAST.cadet, id: 'cadet-junior', seed: 42, build: { height: 0.69, legs: 0.96, torso: 0.92, head: 1.13, width: 0.88 }, alts: CAST.cadet.alts.map((a) => ({ ...a, build: { width: 0.84, height: 0.66 } })), face: { ...CAST.cadet.face, eyeScale: 1.08, marks: { blush: 0.6, freckles: true } } };

// ---- the same people in other clothes. Each is its own id: a figure is built once and cannot change costume.

const HATLESS = { spikes: 1, curls: 1, pencil: 1, bun: 1 }; // hair that would come through a hat or a hood
const reworn = (base, id, patch) => {
  const d = JSON.parse(JSON.stringify(base)); d.id = id; d.poses = base.poses; // poses are shared by reference: clip poses are cached per object
  patch(d); return d;
};
const strip = (d, ...kinds) => { d.costume.extras = (d.costume.extras || []).filter((e) => !kinds.includes(e.kind)); };
/** Oilskin cape and sou'wester over whatever they had on. */
const inStorm = (base, color = '#d9a83a') => reworn(base, base.id + '-storm', (d) => {
  d.hair.pieces = d.hair.pieces.filter((p) => !HATLESS[p.kind]).concat([{ kind: 'souwester', color }]);
  strip(d, 'shawl', 'cape', 'epaulettes', 'chain');
  d.costume.extras.push({ kind: 'cape', color, trim: mixc(color, '#3a1a10', 0.35), length: 0.15, lining: mixc(color, '#3a1a10', 0.5), clasp: '#8a5a34' });
});
/** A dark travelling hood and cape: the under-lane, and anyone who would rather not be counted. */
const hooded = (base, color = '#4a4458') => reworn(base, base.id + '-hooded', (d) => {
  // nothing may stand prouder of the skull than the hood does: the crown is cut close and loose locks go
  d.hair.pieces = d.hair.pieces.filter((p) => !HATLESS[p.kind] && p.kind !== 'braid' && p.kind !== 'tail' && p.kind !== 'locks')
    .map((p) => (p.kind === 'cap' ? { ...p, grow: [1.05, 1.07, 1.07], shift: [0, 0.008, -0.012] } : p.kind === 'fringe' ? { ...p, r: Math.min(p.r ?? 1.115, 1.1) } : p))
    .concat([{ kind: 'hood', color, lining: '#221c30', front: 0.5, grow: [1.17, 1.2, 1.2], tipLength: 0.18 }]);
  strip(d, 'shawl', 'cape', 'epaulettes', 'chain', 'earring', 'earpiece');
  d.costume.extras.push({ kind: 'cape', color, trim: mixc(color, '#0c0a1c', 0.3), length: 0.13 });
  d.face = { ...d.face, shade: 0.14, ears: 0 };
});

// Ren from chapter 6 on ("Volunteer"): the cadet coat with the Academy taken off it. No epaulettes, no brass, no wire
// behind the ear; sleeves rolled like the dockers he loads with, and an islander's undyed scarf where the collar stood.
CAST['ren-volunteer'] = reworn(CAST.ren, 'ren-volunteer', (d) => {
  strip(d, 'epaulettes', 'earpiece');
  delete d.costume.buttons;
  d.costume.collar = { kind: 'scarf', color: '#efe6cf' };
  d.costume.sleeves = { color: '#2f5fb8', rolled: true };
  d.costume.belt = { color: '#5a4030', buckle: '#b89a6a' };
  d.costume.top.trim = '#24478f';
  d.costume.shoes = { color: '#3a2c24', sole: '#1f1814', tall: true };
});
// ...and holding a lantern by the wire, as he is shown how to in chapter 6
CAST['ren-lantern'] = { ...CAST['ren-volunteer'], id: 'ren-lantern', props: [{ kind: 'lantern', hand: 'R', size: 0.07 }],
  poses: { ...CAST.ren.poses, stand: { ...CAST.ren.poses.stand, armR: [-24, 0, -18], foreR: [-58, 0, 0], handR: [0, 0, 0] }, signature: { chest: [4, 8, 0], head: [-14, -4, 6], armR: [-84, 0, -20], foreR: [-58, 0, 0] } } };
for (const id of ['ren', 'ilse', 'tobb']) { CAST[id + '-storm'] = inStorm(CAST[id]); CAST[id + '-hooded'] = hooded(CAST[id]); }
CAST['ren-storm'].costume.extras = CAST['ren-storm'].costume.extras.filter((e) => e.kind !== 'earpiece'); // the Line does not carry in that weather, and the hat covers it
// Corvane once the chain of the Mint is on the Assembly's table: the same robe with nothing across it
CAST['corvane-plain'] = reworn(CAST.corvane, 'corvane-plain', (d) => { strip(d, 'chain', 'epaulettes'); d.costume.belt = { color: '#74172a' }; d.costume.sleeves.cuff = '#74172a'; d.costume.top.trim = '#74172a'; });
// Sable without the Audit's pin; Maravel off the bench (the cell, the dock, the quay): no gavel, no bands
CAST['sable-plain'] = reworn(CAST.sable, 'sable-plain', (d) => { strip(d, 'brooch'); d.costume.collar = { kind: 'turned', color: '#22242e' }; });
CAST['maravel-plain'] = reworn(CAST.maravel, 'maravel-plain', (d) => { strip(d, 'tabs'); d.props = []; d.costume.collar = { kind: 'scarf', color: '#8a86a0' }; d.costume.top.trim = '#34304c'; d.costume.sleeves.cuff = '#4a4666'; });
// In Audit irons (chapter 7): wrists together in front, the slack of the chain in the right hand
const inIrons = (base, stand) => reworn(base, base.id + '-irons', (d) => {
  strip(d, 'earpiece', 'epaulettes'); d.costume.extras.push({ kind: 'irons' }); d.props = [{ kind: 'shackle', hand: 'R' }];
  d.poses = { ...base.poses, stand: { ...base.poses.stand, ...stand }, signature: { chest: [4, 0, 0], head: [-10, 0, 0], armL: [-58, 0, 12], foreL: [-70, 0, -40], armR: [-58, 0, -12], foreR: [-70, 0, 40] } };
  d.gestures = ['talkSmall', 'talkChin'];
});
CAST['ren-irons'] = inIrons(CAST['ren-volunteer'], { chest: [2, 4, -2], head: [9, 8, 4], armL: [-16, 0, 10], foreL: [-58, 0, -46], armR: [-16, 0, -10], foreR: [-58, 0, 46], handR: [0, 0, 0] });
CAST['ren-irons'].id = 'ren-irons';
CAST['thorne-irons'] = inIrons(CAST.thorne, { armL: [-14, 0, 8], foreL: [-56, 0, -44], armR: [-14, 0, -8], foreR: [-56, 0, 44] });
// Ilse as Tribune of the Lot (chapter 6 on): the same clerk with the office's sash across her
CAST['ilse-tribune'] = reworn(CAST.ilse, 'ilse-tribune', (d) => { strip(d, 'chain'); d.costume.extras.push({ kind: 'sash', color: '#7a3f8a', rosette: '#ffcf3f', from: 'R' }); });
// The last page: the Ledger with the hood down. Ilse at seventy: the braid gone white with the pen still through it,
// the freckles, the green eyes, the ink. Stands as the narrator stands, so the hooded figure and this one are one person.
CAST['ilse-old'] = reworn(CAST.narrator, 'ilse-old', (d) => {
  d.seed = 43;
  d.hair = { color: '#f1e9e2', brow: '#c9b4a6', pieces: [
    { kind: 'cap', front: 0.54, side: -0.2, back: -0.72, grow: [1.075, 1.1, 1.09], shift: [0, 0.012, -0.018] },
    { kind: 'fringe', n: 5, from: 36, to: -52, part: 26, top: 66, tips: [22, 14, 18, 10, 2], sweep: -7, gather: 0.3, r: 1.115 },
    { kind: 'locks', locks: [{ pts: [[34, 62, 1.03], [48, 42, 1.1], [57, 22, 1.1], [60, 4, 1.075]], w: 0.062 }] },
    { kind: 'sidelocks', yaw: 63, top: 4, length: 0.15, w: 0.036, out: 0.014, curl: 0.02 },
    { kind: 'braid', at: [-118, -30], dir: [-0.16, -1, 0.42], length: 0.36, width: 0.046, links: 3, tie: '#ffd24a' },
    { kind: 'pencil', at: [-104, 30], dir: [-0.5, 0.8, -0.34], length: 0.22, r: 1.06, out: 0.1 },
  ] };
  d.face = { set: 'old', iris: '#3fae6a', eyeScale: 0.94, eyePitch: -6.5, brow: { w: 0.014, len: 22, at: [25, 12] }, marks: { blush: 0.5, freckles: true, laugh: true }, mouths: { neutral: 'softsmile', grim: 'wry' } };
  d.costume.extras.push({ kind: 'cowl', color: '#6a5638', lining: '#2a2030' });
});

/**
 * The k-th variant of a rank-and-file cast member (every extra: docker, steward, bailiff, proctor, clerk, townsman, townswoman,
 * fishwife, child, child2, miner, cadet, cadet-junior, underwriter, magistrate, islander, broker, commons-steward, marine, rower,
 * fisher, member and the -lantern / -hat ones): the same person-shape in other colours and sizes, so three in a row are three people.
 * k = 0 is the def itself. Deterministic. Returns a def for createCharacter / troupe.spawn.
 * A def steers its variants with  rank { uniform (clothes keep their colours), cloth, hats, legs, scarves (palettes), beards }
 * and  alts [{ pieces, face, build, costume, noBeard }]: the other looks of the type (the women of a type whose base is a man),
 * taken in turn: with one alt, odd k are the alt. Faces stay inside IRIS_SHARED and the seven skins, so variants share atlas cells.
 */
export function castVariant(id, k = 0) {
  const base = CAST[id];
  if (!base) throw new Error(`castVariant: no cast member "${id}" (have ${Object.keys(CAST).join(', ')})`);
  if (!k) return base;
  const r = rng(k * 7919 + base.seed * 131), pick = (list) => list[Math.floor(r() * list.length) % list.length];
  const skins = ['#f0c6a0', '#e2b490', '#d2a07c', '#c98e6e', '#b07a62', '#9a6a4c', '#f4d2b6'];
  const hairs = ['#4a3a30', '#7a4a2a', '#2e2630', '#c97a2a', '#8a8a94', '#5a2c22', '#d9b264'];
  const R = base.rank || {}, root = id.split('-')[0];
  const uniform = R.uniform ?? (root === 'steward' || root === 'bailiff' || root === 'proctor' || root === 'clerk');
  const cloth = R.cloth || ['#3f6fa8', '#c9803f', '#2f9a86', '#8a5aa8', '#b8504a', '#5a8a4a', '#d9a03a', '#4a5a7a', '#a86a8a'];
  const hats = R.hats || ['#7c8094', '#b8743a', '#4f8a5a', '#5a4a6a', '#a3683a', '#3f7a8a'];
  const d = JSON.parse(JSON.stringify(base));
  d.poses = base.poses; // by reference: characters cache resolved clip poses per pose object
  const alts = base.alts || [], alt = alts.length ? [null, ...alts][k % (alts.length + 1)] : null;
  delete d.alts;
  if (alt) {
    if (alt.pieces) d.hair.pieces = JSON.parse(JSON.stringify(alt.pieces));
    if (alt.face) d.face = { ...d.face, ...alt.face };
    if (alt.costume) for (const key of Object.keys(alt.costume)) d.costume[key] = JSON.parse(JSON.stringify(alt.costume[key]));
  }
  d.id = `${id}#${k}`; d.seed = base.seed * 10 + k;
  d.skin = pick(skins); d.hair.color = pick(hairs); d.hair.brow = mixc(d.hair.color, '#1a1040', 0.3);
  d.build = { ...d.build, height: (d.build.height ?? 1) * (0.94 + r() * 0.12), width: (d.build.width ?? 1) * (0.92 + r() * 0.16), belly: Math.max(0, (d.build.belly ?? 0) + (r() - 0.4) * 0.2), head: (d.build.head ?? 1) * (0.97 + r() * 0.06) };
  d.face.eyeScale = (d.face.eyeScale ?? 1) * (0.94 + r() * 0.12); d.face.iris = pick(IRIS_SHARED);
  d.face.marks = { ...(d.face.marks || {}), blush: r() < 0.5 ? 0.35 : 0.5, stubble: !!(d.face.marks && d.face.marks.stubble) && r() > 0.4, freckles: r() > 0.7 };
  if (alt && alt.build) d.build = { ...d.build, width: d.build.width * (alt.build.width ?? base.build.width ?? 1) / (base.build.width ?? 1), height: d.build.height * (alt.build.height ?? base.build.height ?? 1) / (base.build.height ?? 1), belly: alt.build.belly ?? d.build.belly };
  if (alt && alt.noBeard) d.face.marks.stubble = false;
  const whiskers = (e) => e.kind === 'moustache' || e.kind === 'beard';
  let c = null;
  if (!uniform) {
    c = pick(cloth); const c2 = mixc(c, '#1a1040', 0.3);
    d.costume.top = { ...d.costume.top, color: c, trim: c2, lining: mixc(c, '#1a1040', 0.5) }; if (d.costume.top.placket) d.costume.top.placket = mixc(c, '#1a1040', 0.18);
    const shirt = d.costume.sleeves?.rolled || r() > 0.5;
    if (base.costume.sleeves?.color === base.costume.top.color || !base.rank) d.costume.sleeves = { ...d.costume.sleeves, color: shirt ? c : '#fff1d6' };
    if (d.costume.collar) d.costume.collar.color = d.costume.collar.kind === 'scarf' ? pick(R.scarves || ['#f2c14e', '#e8483f', '#3f9ad0', '#fff1d6']) : c2;
    if (!R.keepLegs) d.costume.legs = { color: pick(R.legs || ['#6a5444', '#4a5a7a', '#3a3a44', '#5a4a3a']) };
    for (const p of d.hair.pieces) if (p.kind === 'flatcap' || p.kind === 'kerchief' || p.kind === 'knitcap') { p.color = pick(hats); delete p.peak; delete p.band; }
    const ex = (d.costume.extras || []).filter((e) => !whiskers(e));
    const roll = r(), bearded = !(alt && alt.noBeard) && (root === 'docker' || root === 'townsman' || R.beards);
    if (bearded && roll < 0.35) ex.push({ kind: 'moustache', color: d.hair.color }); else if (bearded && roll < 0.55) ex.push({ kind: 'beard', shape: 'full', color: d.hair.color, size: 0.95 });
    d.costume.extras = ex;
  } else if (base.rank) { // a uniform keeps its colours; the face under it does not keep its whiskers
    const ex = (d.costume.extras || []).filter((e) => !whiskers(e));
    const roll = r(), bearded = !(alt && alt.noBeard) && R.beards;
    if (bearded && roll < 0.3) ex.push({ kind: 'moustache', color: d.hair.color }); else if (bearded && roll < 0.55) ex.push({ kind: 'beard', shape: roll < 0.42 ? 'full' : 'square', color: d.hair.color, size: 0.92 });
    else if (!bearded) for (const e of (d.costume.extras || [])) if (whiskers(e) && !(alt && alt.noBeard) && roll < 0.5) ex.push({ ...e, color: d.hair.color });
    d.costume.extras = ex;
  }
  // pieces that follow the coat: dye 'top' | 'band' on a hat, 'top' | 'light' | 'wool' on a costume extra
  if (c) {
    for (const p of d.hair.pieces) { if (p.dye === 'top') p.color = c; else if (p.dye === 'band') p.band = c; }
    for (const e of d.costume.extras || []) { if (e.dye === 'top') e.color = c; else if (e.dye === 'light') e.color = mixc(c, '#fff6dc', 0.6); else if (e.dye === 'wool') { e.color = d.costume.collar?.color || e.color; e.color2 = mixc(e.color, '#5a4a30', 0.14); } }
  }
  return d;
}

// ------------------------------------------------------------------------------------ the crowd

const CROWD_COATS = ['#3f6fa8', '#c9803f', '#2f9a86', '#8a5aa8', '#b8504a', '#5a8a4a', '#d9a03a', '#4a5a7a', '#a86a8a', '#e8603f', '#3f9ad0', '#7a6a5a'];
const CROWD_SKINS = ['#f0c6a0', '#e2b490', '#d2a07c', '#c98e6e', '#b07a62', '#9a6a4c', '#f4d2b6'];
const CROWD_HAIR = ['#4a3a30', '#7a4a2a', '#2e2630', '#c97a2a', '#9a9aa4', '#5a2c22', '#d9b264', '#f1ede4'];
const CROWD_HATS = ['#7c8094', '#b8743a', '#4f8a5a', '#5a4a6a', '#e8483f', '#3f7a8a', '#f2c14e'];

// one cheap townsperson, about 330 triangles: a bell of a coat, a ball of a head, a hat, two dots for eyes.
// Returns { body, arms } meshes in the member's own space (feet on the origin, about 1 unit tall, facing +Z);
// arms hang from [0, CROWD_SHOULDER, 0] and are a separate mesh so that they can be thrown up.
const CROWD_SHOULDER = 0.5;
function crowdMember(r, P, { kid = false, lantern = false } = {}) {
  const pick = (list) => list[Math.floor(r() * list.length) % list.length];
  const coat = pick(P.coats), skin = pick(P.skins), hair = pick(P.hair), hatC = pick(P.hats), dark = mixc(coat, '#1a1040', 0.34);
  const fat = 0.9 + r() * 0.35, skirt = r() < 0.45, hat = Math.floor(r() * 4), parts = [];
  // coat or dress
  const hem = skirt ? 0.07 : 0.2, prof = [[0.001, hem + 0.02], [0.17 * fat * (skirt ? 1.12 : 1), hem], [0.135 * fat, 0.37], [0.14 * fat, 0.5], [0.07, 0.575], [0.001, 0.58]];
  const bell = scaleMesh(lathe(prof, 7, { crease: 180 }), 1, 1, 0.82);
  parts.push(paint(tint(bell, coat), (x, y) => (y < hem + 0.045 ? dark : null)));
  // legs, or the feet under a skirt
  const legC = skirt ? pick(['#5a3a2a', '#3a2c24', '#7a4a2a']) : pick(['#6a5444', '#4a5a7a', '#3a3a44', '#5a4a3a']);
  for (const sx of [-1, 1]) parts.push(tint(place(blob({ rx: 0.062, ry: skirt ? 0.05 : 0.12, rz: 0.085, flatBottom: 0.3, seg: 5, rings: 3 }), sx * 0.07, skirt ? 0.04 : 0.1, 0.02), legC));
  if (r() < 0.4) parts.push(tint(place(scaleMesh(torus(0.085, 0.036, 7, 4), 1, 0.8, 0.9), 0, 0.565, 0), pick(['#f2c14e', '#e8483f', '#3f9ad0', '#fff1d6'])));
  // head, eyes, hair or hat
  const hy = 0.74, hr = [0.2, 0.18, 0.19];
  parts.push(tint(place(ellipsoid(hr[0], hr[1], hr[2], 9, 6), 0, hy, 0), skin));
  for (const sx of [-1, 1]) parts.push(setOutline(tint(place(ellipsoid(0.024, 0.034, 0.012, 5, 3), sx * 0.075, hy - 0.012, hr[2] * 0.93), '#2a1f3a'), 0));
  const dome = (k, low, col) => tint(place(scaleMesh(lathe([[1, low], [0.92, 0.4], [0.62, 0.8], [0.001, 1]], 8, { crease: 180 }), hr[0] * k, hr[1] * k, hr[2] * k), 0, hy, -0.008), col);
  if (hat === 0) { parts.push(dome(1.08, 0.12, hair)); if (r() < 0.5) parts.push(tint(place(sphere(0.07, 6, 4), 0, hy + 0.15, -0.1), hair)); }
  else if (hat === 1) { parts.push(dome(1.06, 0.1, hair)); parts.push(tint(place(blob({ rx: 0.225, ry: 0.07, rz: 0.24, flatBottom: 0.5, seg: 8, rings: 4 }), 0, hy + 0.13, 0.03, 9, 0, 0), hatC)); }
  else if (hat === 2) { parts.push(dome(1.1, -0.25, hatC)); parts.push(tint(place(sphere(0.04, 5, 3), 0, hy - 0.08, -0.2), hatC)); }
  else { parts.push(dome(1.08, 0.05, hair)); for (const sx of [-1, 1]) if (kid) parts.push(tint(place(sphere(0.06, 5, 3), sx * 0.2, hy + 0.02, -0.02), hair)); }
  // arms: mitten hands, and perhaps a lit paper lantern in one of them
  const arms = [];
  for (const sx of [-1, 1]) {
    arms.push(tint(place(limb(0.046, 0.04, 0.2, 5, 1), sx * 0.15 * fat, 0, 0, 0, 0, sx * 9), coat));
    arms.push(tint(place(sphere(0.045, 5, 3), sx * (0.15 * fat + 0.035), -0.235, 0), skin));
  }
  if (lantern) arms.push(setGlow(tint(place(ellipsoid(0.055, 0.065, 0.055, 6, 4), -(0.15 * fat + 0.035), -0.32, 0.02), '#ffd070'), 1));
  return { body: merge(parts), arms: merge(arms) };
}

/**
 * A crowd for a full hall, a riot, a pier lined with people: 20 to 40 cheap townsfolk that sway, cheer and shake fists.
 *
 *   const crowd = createCrowd({ count: 28, seed: 3, area: { x0, x1, z0, z1 }, face: 0, material: troupe.figMat });
 *   set.actors.add(crowd.root);            // or anywhere in the scene
 *   crowd.update(dt, { mood: 'idle' | 'cheer' | 'angry' | 'still', energy: 0..1 });   every frame
 *   crowd.cheer(1.2);                      // a burst of cheering for that many seconds, whatever the mood
 *
 * opts: count; seed; area (members are scattered in rows over it, front row at z1) or spots [[x, z, yawDeg?]...];
 *   face: yaw in degrees or a point [x, y, z] everyone turns toward; kids 0..1 (share of children);
 *   lanterns 0..1 (share carrying a lit paper lantern); arms 0..1 (share whose arms can move; the rest cost one bone, not two);
 *   scale (1 = the cast's size); shadow: false to keep them out of the shadow map; palette { coats, skins, hair, hats }.
 * Cost: like a figure, a crowd is batched 32 bones to a draw: 28 people with moving arms are 2 draws (+ outline + shadow each),
 * about 330 triangles a head. Every colour is baked per vertex, so no two need look alike. No faces beyond two eye dots:
 * this is for the back of a set, 30 to 50 px tall, never for a close-up.
 * crowd.members[i] = { node, x, z, yaw, scale, kid }; crowd.stats { members, triangles, draws, bones }.
 */
export function createCrowd({ count = 24, seed = 1, area = null, spots = null, face = 0, material: mat = null, kids = 0.15, lanterns = 0, arms = 1, scale = 1, shadow = true, palette = null } = {}) {
  mat = mat || defaultMaterial();
  const r = rng(seed * 977 + 13), root = group('crowd');
  const P = { coats: CROWD_COATS, skins: CROWD_SKINS, hair: CROWD_HAIR, hats: CROWD_HATS, ...(palette || {}) };
  const A = area || { x0: -2, x1: 2, z0: -1, z1: 0 };
  let where = spots ? spots.slice(0, count).map((s) => ({ x: s[0], z: s[1], yaw: s[2] })) : null;
  if (!where) {
    const w = A.x1 - A.x0, d = Math.max(0.01, A.z1 - A.z0), cols = Math.max(1, Math.ceil(Math.sqrt(count * w / Math.max(0.3, d) * 0.45))), rows = Math.ceil(count / cols);
    where = [];
    for (let i = 0; i < count; i++) { const row = Math.floor(i / cols), col = i % cols, inRow = row === rows - 1 ? count - row * cols : cols;
      where.push({ x: A.x0 + ((col + 0.5 + (r() - 0.5) * 0.55) / inRow) * w, z: A.z1 - ((row + 0.5 + (r() - 0.5) * 0.6) / rows) * d }); }
  }
  const members = [];
  let chunk = null, used = 0, tris = 0;
  const chunks = [];
  where.forEach((p, i) => {
    const kid = r() < kids, moves = r() < arms, s = scale * (kid ? 0.56 + r() * 0.1 : 0.88 + r() * 0.2), need = moves ? 2 : 1;
    if (!chunk || used + need > 32) { chunk = group('crowd' + chunks.length, { parent: root }); chunks.push(chunk); used = 0; }
    used += need;
    const m = crowdMember(r, P, { kid, lantern: moves && r() < lanterns });
    let yaw = p.yaw; if (yaw == null) yaw = (typeof face === 'number' ? face : Math.atan2(face[0] - p.x, face[2] - p.z) / DEG) + (r() - 0.5) * 26;
    const body = node('m' + i, moves ? m.body : merge(m.body, place(m.arms, 0, CROWD_SHOULDER, 0)), mat, { pos: [p.x, 0, p.z], rot: [0, yaw, 0], scale: s, parent: chunk });
    const armNode = moves ? node('a' + i, m.arms, mat, { pos: [0, CROWD_SHOULDER, 0], parent: body }) : null;
    tris += (m.body.indices.length + m.arms.indices.length) / 3;
    members.push({ node: body, arms: armNode, x: p.x, z: p.z, yaw, scale: s, kid, ph: r() * 6.283, sp: 0.8 + r() * 0.5, lag: r(), cheer: 0, angry: 0, live: 1 });
  });
  const skins = [];
  for (const c of chunks) for (const sk of batchFigure(c)) { sk.castShadow = shadow; skins.push(sk); }
  let time = 0, burst = 0;
  const crowd = {
    root, members, skins,
    stats: { members: members.length, triangles: tris, draws: skins.length * (shadow ? 3 : 2), bones: skins.reduce((a, sk) => a + sk.bones.length, 0) },
    /** Cheer for `seconds`, then go back to the mood update() is given. */
    cheer(seconds = 1.2) { burst = Math.max(burst, seconds); },
    update(dt, { mood = 'idle', energy = 1 } = {}) {
      if (mood !== 'idle' && mood !== 'cheer' && mood !== 'angry' && mood !== 'still') throw new Error(`crowd: unknown mood "${mood}" (have idle, cheer, angry, still)`);
      time += dt; burst = Math.max(0, burst - dt);
      const wantCheer = mood === 'cheer' || burst > 0 ? 1 : 0, wantAngry = !wantCheer && mood === 'angry' ? 1 : 0, wantLive = mood === 'still' && !wantCheer ? 0.25 : 1;
      for (let i = 0; i < members.length; i++) {
        const m = members[i], k = Math.min(1, dt * (2.5 + m.lag * 5)); // each catches the mood at their own speed: it ripples
        m.cheer += (wantCheer - m.cheer) * k; m.angry += (wantAngry - m.angry) * k; m.live += (wantLive - m.live) * k;
        const t = time * m.sp + m.ph, c = m.cheer * energy, a = m.angry * energy, e = m.live;
        const hop = Math.max(0, Math.sin(t * 6.2)), hop2 = Math.max(0, Math.sin(t * 9.5 + 1));
        const y = (hop * hop * 0.11 * c + hop2 * hop2 * 0.035 * a) * m.scale;
        const sq = 1 + Math.sin(t * 2.1) * 0.012 * e + (hop - 0.35) * 0.07 * c;
        const n = m.node;
        n.position[0] = m.x + Math.sin(t * 7.3) * 0.018 * a; n.position[1] = y; n.position[2] = m.z + Math.sin(t * 5.1 + 2) * 0.014 * a;
        n.setRot(7 * a + Math.sin(t * 1.3) * 1.2 * e - 4 * c, m.yaw + Math.sin(t * 0.43 + m.ph) * 9 * e, Math.sin(t * 0.9) * 2.6 * e + Math.sin(t * 6.2) * 4 * c);
        n.scale[1] = m.scale * sq; n.scale[0] = n.scale[2] = m.scale / Math.sqrt(sq);
        if (m.arms) m.arms.setRot(Math.sin(t * 2.1) * 4 * e * (1 - c) * (1 - a) - (158 + Math.sin(t * 12.4) * 12) * c - (96 + Math.sin(t * 9.5 + 1) * 40) * a * (1 - c), 0, Math.sin(t * 6.2 + 1) * 10 * c);
      }
    },
  };
  crowd.update(0, {});
  return crowd;
}
