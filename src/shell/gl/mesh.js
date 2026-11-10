// Procedural mesh builders for the cel engine. Pure: no GL here, so these run under node too.
//
// A mesh is a plain object of typed arrays:
//   positions Float32Array(3n)   normals  Float32Array(3n)   shading normals (may be split at creases)
//   onormals  Float32Array(3n)   smoothed normals for the outline hull: equal for every vertex at one
//                                position, so a hard-edged mesh keeps a closed outline
//   colors    Float32Array(3n)   per-vertex colour, 0..1 (default white)
//   uvs       Float32Array(2n)   v = 0 is the TOP of the image
//   owidth    Float32Array(n)    per-vertex outline width scale (default 1; 0 removes the outline there)
//   glow      Float32Array(n)    per-vertex emissive amount 0..1 (default 0): lamp glass, windows
//   indices   Uint32Array
//
// Conventions: +Y up, right-handed, counter-clockwise triangles face outward. Spheres, boxes and
// extrusions are centred on the origin; lathes, cylinders, cones and capsules stand on y = 0 and
// rise; limb() hangs from the origin downward (pivot at the joint).
// The operations (transform, tint, paint...) change the mesh in place and return it, so they nest.

import { m4, rgb, DEG } from './math.js';

// ------------------------------------------------------------------------------------ core

function alloc(n, ni) {
  const m = {
    positions: new Float32Array(n * 3), normals: new Float32Array(n * 3), onormals: new Float32Array(n * 3),
    colors: new Float32Array(n * 3).fill(1), uvs: new Float32Array(n * 2), owidth: new Float32Array(n).fill(1),
    glow: new Float32Array(n), indices: new Uint32Array(ni),
  };
  return m;
}

/** Build a mesh from loose arrays, then compute normals. `uvs` may be null. */
export function fromArrays(positions, indices, uvs = null, crease = 180) {
  const n = positions.length / 3;
  const m = alloc(n, indices.length);
  m.positions.set(positions); m.indices.set(indices);
  if (uvs) m.uvs.set(uvs);
  return computeNormals(m, crease);
}

export function vertexCount(mesh) { return mesh.positions.length / 3; }

export function clone(mesh) {
  const o = {};
  for (const k of Object.keys(mesh)) { if (k[0] === '_') continue; o[k] = mesh[k] && mesh[k].slice ? mesh[k].slice() : mesh[k]; } // _gpu, _bs: caches, not content
  return o;
}

/**
 * Recompute shading normals and outline normals from the triangles.
 * Vertices at the same position are treated as one surface point. `creaseDeg` is the angle between
 * two faces above which the edge between them shades hard (vertices are split there); 180 keeps
 * everything smooth. Outline normals are always fully smoothed.
 */
export function computeNormals(mesh, creaseDeg = 180) {
  const P = mesh.positions, I = mesh.indices, n = P.length / 3, nt = I.length / 3;
  // weld by position
  const weld = new Uint32Array(n); const keyOf = new Map(); let nw = 0;
  for (let i = 0; i < n; i++) {
    const k = Math.round(P[i * 3] * 2e4) + ',' + Math.round(P[i * 3 + 1] * 2e4) + ',' + Math.round(P[i * 3 + 2] * 2e4);
    let w = keyOf.get(k); if (w === undefined) { w = nw++; keyOf.set(k, w); }
    weld[i] = w;
  }
  // face normals and corner angles
  const fn = new Float32Array(nt * 3), ang = new Float32Array(nt * 3);
  for (let t = 0; t < nt; t++) {
    const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const wx = P[c] - P[b], wy = P[c + 1] - P[b + 1], wz = P[c + 2] - P[b + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-12) continue; // degenerate (a pole): contributes nothing
    fn[t * 3] = nx / l; fn[t * 3 + 1] = ny / l; fn[t * 3 + 2] = nz / l;
    const lu = Math.hypot(ux, uy, uz), lv = Math.hypot(vx, vy, vz), lw = Math.hypot(wx, wy, wz);
    const A = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy + uz * vz) / (lu * lv))));
    const B = Math.acos(Math.max(-1, Math.min(1, -(ux * wx + uy * wy + uz * wz) / (lu * lw))));
    ang[t * 3] = A; ang[t * 3 + 1] = B; ang[t * 3 + 2] = Math.max(0, Math.PI - A - B);
  }
  // corners per welded point (linked lists)
  const head = new Int32Array(nw).fill(-1), next = new Int32Array(nt * 3);
  for (let c = 0; c < nt * 3; c++) { const w = weld[I[c]]; next[c] = head[w]; head[w] = c; }
  // outline normals: angle-weighted over every face at the point
  const ON = new Float32Array(nw * 3);
  for (let w = 0; w < nw; w++) {
    let x = 0, y = 0, z = 0;
    for (let c = head[w]; c >= 0; c = next[c]) { const t = (c / 3) | 0, a = ang[c]; x += fn[t * 3] * a; y += fn[t * 3 + 1] * a; z += fn[t * 3 + 2] * a; }
    const l = Math.hypot(x, y, z) || 1;
    ON[w * 3] = x / l; ON[w * 3 + 1] = y / l; ON[w * 3 + 2] = z / l;
  }
  if (creaseDeg >= 179.9) {
    for (let i = 0; i < n; i++) {
      const w = weld[i] * 3;
      mesh.normals[i * 3] = mesh.onormals[i * 3] = ON[w]; mesh.normals[i * 3 + 1] = mesh.onormals[i * 3 + 1] = ON[w + 1]; mesh.normals[i * 3 + 2] = mesh.onormals[i * 3 + 2] = ON[w + 2];
    }
    return mesh;
  }
  // creased: a normal per corner from the faces within the crease angle, then re-index
  const cosC = Math.cos(creaseDeg * DEG);
  const outIdx = new Uint32Array(nt * 3); const src = []; const nrm = []; const seen = new Map();
  for (let c = 0; c < nt * 3; c++) {
    const t = (c / 3) | 0, v = I[c], w = weld[v];
    const fx = fn[t * 3], fy = fn[t * 3 + 1], fz = fn[t * 3 + 2];
    let x = 0, y = 0, z = 0;
    for (let k = head[w]; k >= 0; k = next[k]) {
      const u = (k / 3) | 0;
      if (fn[u * 3] * fx + fn[u * 3 + 1] * fy + fn[u * 3 + 2] * fz >= cosC) { const a = ang[k]; x += fn[u * 3] * a; y += fn[u * 3 + 1] * a; z += fn[u * 3 + 2] * a; }
    }
    let l = Math.hypot(x, y, z);
    if (l < 1e-9) { x = ON[w * 3]; y = ON[w * 3 + 1]; z = ON[w * 3 + 2]; l = 1; }
    x /= l; y /= l; z /= l;
    const key = v + ':' + Math.round(x * 500) + ',' + Math.round(y * 500) + ',' + Math.round(z * 500);
    let ni = seen.get(key);
    if (ni === undefined) { ni = src.length; seen.set(key, ni); src.push(v); nrm.push(x, y, z); }
    outIdx[c] = ni;
  }
  const m = src.length, o = alloc(m, nt * 3);
  for (let i = 0; i < m; i++) {
    const v = src[i], w = weld[v] * 3;
    o.positions.set(P.subarray(v * 3, v * 3 + 3), i * 3);
    o.colors.set(mesh.colors.subarray(v * 3, v * 3 + 3), i * 3);
    o.uvs.set(mesh.uvs.subarray(v * 2, v * 2 + 2), i * 2);
    o.owidth[i] = mesh.owidth[v]; o.glow[i] = mesh.glow[v];
    o.normals[i * 3] = nrm[i * 3]; o.normals[i * 3 + 1] = nrm[i * 3 + 1]; o.normals[i * 3 + 2] = nrm[i * 3 + 2];
    o.onormals[i * 3] = ON[w]; o.onormals[i * 3 + 1] = ON[w + 1]; o.onormals[i * 3 + 2] = ON[w + 2];
  }
  o.indices.set(outIdx);
  Object.assign(mesh, o);
  return mesh;
}

// ------------------------------------------------------------------------------------ operations

/** Apply a mat4 to positions and (by its inverse transpose) to both sets of normals. */
export function transform(mesh, m) {
  const P = mesh.positions, n = P.length / 3, nm = m4.normalMat3(new Float32Array(9), m);
  const flip = (m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5])) < 0;
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    P[i * 3] = m[0] * x + m[4] * y + m[8] * z + m[12];
    P[i * 3 + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    P[i * 3 + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    for (const N of [mesh.normals, mesh.onormals]) {
      const a = N[i * 3], b = N[i * 3 + 1], c = N[i * 3 + 2];
      let u = nm[0] * a + nm[3] * b + nm[6] * c, v = nm[1] * a + nm[4] * b + nm[7] * c, w = nm[2] * a + nm[5] * b + nm[8] * c;
      const l = Math.hypot(u, v, w) || 1;
      N[i * 3] = u / l; N[i * 3 + 1] = v / l; N[i * 3 + 2] = w / l;
    }
  }
  if (flip) flipWinding(mesh);
  return mesh;
}
export const translate = (mesh, x, y, z) => transform(mesh, m4.trs(x, y, z));
export const rotate = (mesh, rxDeg, ryDeg, rzDeg) => transform(mesh, m4.trs(0, 0, 0, rxDeg, ryDeg, rzDeg));
export const scale = (mesh, x, y = x, z = x) => transform(mesh, m4.trs(0, 0, 0, 0, 0, 0, x, y, z));
/** Translate, rotate (Euler degrees) and scale in one step. */
export const place = (mesh, px, py, pz, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => transform(mesh, m4.trs(px, py, pz, rx, ry, rz, sx, sy, sz));

function flipWinding(mesh) {
  const I = mesh.indices;
  for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; }
  return mesh;
}
/** Turn the mesh inside out (winding and normals). */
export function flip(mesh) {
  flipWinding(mesh);
  for (let i = 0; i < mesh.normals.length; i++) { mesh.normals[i] = -mesh.normals[i]; mesh.onormals[i] = -mesh.onormals[i]; }
  return mesh;
}
/** A mirrored copy across the YZ plane (x -> -x): the other arm, the other shutter. */
export function mirrorX(mesh) { return transform(clone(mesh), m4.trs(0, 0, 0, 0, 0, 0, -1, 1, 1)); }

/** Concatenate meshes (an array or arguments) into a new one. */
export function merge(...list) {
  const parts = list.flat().filter(Boolean);
  let n = 0, ni = 0;
  for (const p of parts) { n += p.positions.length / 3; ni += p.indices.length; }
  const o = alloc(n, ni);
  let v = 0, i = 0;
  for (const p of parts) {
    const c = p.positions.length / 3;
    o.positions.set(p.positions, v * 3); o.normals.set(p.normals, v * 3); o.onormals.set(p.onormals, v * 3);
    o.colors.set(p.colors, v * 3); o.uvs.set(p.uvs, v * 2); o.owidth.set(p.owidth, v); o.glow.set(p.glow, v);
    for (let k = 0; k < p.indices.length; k++) o.indices[i + k] = p.indices[k] + v;
    v += c; i += p.indices.length;
  }
  return o;
}

/** Set every vertex to one colour ('#rrggbb' or [r, g, b]). */
export function tint(mesh, color) {
  const c = rgb(color), C = mesh.colors;
  for (let i = 0; i < C.length; i += 3) { C[i] = c[0]; C[i + 1] = c[1]; C[i + 2] = c[2]; }
  return mesh;
}
/**
 * Colour per vertex from a function (x, y, z, nx, ny, nz, u, v) -> colour ('#rrggbb' or [r, g, b]),
 * or null/undefined to leave that vertex alone. For stripes, sand lines, dipped ends.
 */
export function paint(mesh, fn) {
  const P = mesh.positions, N = mesh.normals, C = mesh.colors, U = mesh.uvs, n = P.length / 3;
  for (let i = 0; i < n; i++) {
    const c = fn(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], N[i * 3], N[i * 3 + 1], N[i * 3 + 2], U[i * 2], U[i * 2 + 1]);
    if (c == null) continue;
    const r = rgb(c); C[i * 3] = r[0]; C[i * 3 + 1] = r[1]; C[i * 3 + 2] = r[2];
  }
  return mesh;
}
/** A vertical colour gradient between y0 and y1 (default: the mesh's own extent). */
export function gradientY(mesh, bottom, top, y0 = null, y1 = null) {
  const b = bounds(mesh), lo = y0 ?? b.min[1], hi = y1 ?? b.max[1], cb = rgb(bottom), ct = rgb(top);
  const P = mesh.positions, C = mesh.colors;
  for (let i = 0; i < P.length; i += 3) {
    const t = Math.max(0, Math.min(1, (P[i + 1] - lo) / ((hi - lo) || 1)));
    C[i] = cb[0] + (ct[0] - cb[0]) * t; C[i + 1] = cb[1] + (ct[1] - cb[1]) * t; C[i + 2] = cb[2] + (ct[2] - cb[2]) * t;
  }
  return mesh;
}
/** Per-vertex outline width scale. A number, or a function (x, y, z) -> number. */
export function setOutline(mesh, s) {
  const P = mesh.positions;
  for (let i = 0; i < mesh.owidth.length; i++) mesh.owidth[i] = typeof s === 'function' ? s(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]) : s;
  return mesh;
}
/** Per-vertex emissive amount 0..1. A number, or a function (x, y, z) -> number. */
export function setGlow(mesh, g) {
  const P = mesh.positions;
  for (let i = 0; i < mesh.glow.length; i++) mesh.glow[i] = typeof g === 'function' ? g(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]) : g;
  return mesh;
}
/** Move vertices with fn(p) where p = [x, y, z] is edited in place, then recompute normals. */
export function deform(mesh, fn, creaseDeg = 180) {
  const P = mesh.positions, p = [0, 0, 0];
  for (let i = 0; i < P.length; i += 3) { p[0] = P[i]; p[1] = P[i + 1]; p[2] = P[i + 2]; fn(p); P[i] = p[0]; P[i + 1] = p[1]; P[i + 2] = p[2]; }
  return computeNormals(mesh, creaseDeg);
}
export function bounds(mesh) {
  const P = mesh.positions, min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { if (P[i + k] < min[k]) min[k] = P[i + k]; if (P[i + k] > max[k]) max[k] = P[i + k]; }
  return { min, max };
}

// ------------------------------------------------------------------------------------ revolved shapes


// ------------------------------------------------------------------------------------ level of detail

let DETAIL = 1;
/**
 * Build something coarser: while fn runs, every round primitive below (lathe and all that is turned on it:
 * sphere, cylinder, cone, capsule, limb, disc; torus, tube, roundedBox corners) is cut with `k` times the
 * segments it was asked for. Counts that are already a shape and not a smoothness are left alone: six sides or
 * fewer around (a four-sided "cylinder" is a pyramid roof), four rings or fewer. For a set built for a
 * 220-pixel band, 0.7 takes a quarter to a third off its triangles. Returns what fn returns. Nests.
 */
export function withDetail(k, fn) {
  const before = DETAIL; DETAIL = Math.min(before, k > 0 ? k : 1);
  try { return fn(); } finally { DETAIL = before; }
}
export const detail = () => DETAIL;
const lodSeg = (n) => (DETAIL >= 1 || n <= 6 ? n : Math.max(6, Math.round(n * DETAIL)));
const lodRings = (n) => (DETAIL >= 1 || n <= 4 ? n : Math.max(4, Math.round(n * DETAIL)));

/**
 * Revolve a 2D profile [[radius, y], ...] about the Y axis. List the profile from the bottom up for
 * an outward-facing surface (it is corrected if the result is inside out). A radius of 0 closes the
 * end. `crease` (degrees) decides which profile corners shade hard.
 */
export function lathe(profile, seg = 20, { crease = 40 } = {}) {
  seg = lodSeg(seg);
  const rings = profile.length, pos = [], uv = [], idx = [];
  let len = 0; const along = [0];
  for (let i = 1; i < rings; i++) { len += Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]); along.push(len); }
  for (let i = 0; i < rings; i++) {
    const [r, y] = profile[i];
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      uv.push(j / seg, 1 - along[i] / (len || 1));
    }
  }
  const w = seg + 1;
  for (let i = 0; i < rings - 1; i++) for (let j = 0; j < seg; j++) {
    const a = i * w + j, b = a + 1, c = a + w, d = c + 1;
    if (profile[i][0] > 1e-9) idx.push(a, c, b);
    if (profile[i + 1][0] > 1e-9) idx.push(b, c, d);
  }
  // orientation: the signed volume must be positive
  let vol = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    vol += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
  }
  if (vol < 0) for (let t = 0; t < idx.length; t += 3) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
  return fromArrays(pos, idx, uv, crease);
}

/** A sphere centred on the origin. */
export function sphere(radius = 1, seg = 20, rings = 12) {
  rings = lodRings(rings);
  const prof = [];
  for (let i = 0; i <= rings; i++) { const a = -Math.PI / 2 + (i / rings) * Math.PI; prof.push([i === 0 || i === rings ? 0 : Math.cos(a) * radius, Math.sin(a) * radius]); }
  return lathe(prof, seg, { crease: 180 });
}
/** A sphere scaled to three radii. */
export function ellipsoid(rx, ry, rz, seg = 20, rings = 12) { return scale(sphere(1, seg, rings), rx, ry, rz); }

/**
 * A superellipsoid: e1 shapes the vertical section, e2 the horizontal one. 1 is round, towards 0 is
 * boxy with soft corners, above 1 is pinched. Good for heads, bodies, cushions, hulls.
 */
export function superellipsoid(rx, ry, rz, e1 = 0.7, e2 = 0.7, seg = 24, rings = 14) {
  const sp = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
  return deform(sphere(1, seg, rings), (p) => {
    const lat = Math.asin(Math.max(-1, Math.min(1, p[1]))), lon = Math.atan2(p[2], p[0]);
    const cl = sp(Math.cos(lat), e1);
    p[0] = rx * cl * sp(Math.cos(lon), e2); p[1] = ry * sp(Math.sin(lat), e1); p[2] = rz * cl * sp(Math.sin(lon), e2);
  });
}

/**
 * A soft organic ball for heads, bodies, bushes, rocks. Starts from an ellipsoid and then:
 *   pear       > 0 widens the lower half and narrows the top (cheeky head, sack body); < 0 the reverse
 *   chin       0..1 pulls the very bottom in to a small chin
 *   flatBack   0..1 flattens the -Z side;   flatBottom 0..1 flattens the underside
 *   lumps      0..1 adds low-frequency bumps (rocks, foliage), seeded by `seed`
 */
export function blob({ rx = 1, ry = 1, rz = 1, pear = 0, chin = 0, flatBack = 0, flatBottom = 0, lumps = 0, seed = 1, seg = 22, rings = 14 } = {}) {
  const s1 = seed * 12.9898, s2 = seed * 78.233, s3 = seed * 37.719;
  return deform(sphere(1, seg, rings), (p) => {
    const y = p[1];
    let k = 1 + pear * -y * 0.35;
    if (chin > 0 && y < -0.2) { const t = Math.min(1, (-y - 0.2) / 0.8); k *= 1 - chin * 0.45 * t * t; }
    let x = p[0] * k, z = p[2] * k, yy = y;
    if (flatBack > 0 && z < 0) z *= 1 - flatBack;
    if (flatBottom > 0 && yy < 0) yy *= 1 - flatBottom;
    if (lumps > 0) {
      const b = 1 + lumps * 0.22 * (Math.sin(p[0] * 3.1 + s1) * Math.sin(p[1] * 2.7 + s2) + Math.sin(p[2] * 3.7 + s3) * Math.cos(p[0] * 2.3 - s2) + Math.sin(p[1] * 4.3 + s3 + p[2] * 2.1) * 0.6);
      x *= b; z *= b; yy *= b;
    }
    p[0] = x * rx; p[1] = yy * ry; p[2] = z * rz;
  });
}

/** A cylinder or cone standing on y = 0. rTop = 0 gives a cone. Caps are closed and shade hard. */
export function cylinder(rBottom = 1, rTop = rBottom, height = 1, seg = 20, { caps = true, crease = 40 } = {}) {
  const prof = [];
  if (caps && rBottom > 0) prof.push([0, 0]);
  prof.push([rBottom, 0], [rTop, height]);
  if (caps && rTop > 0) prof.push([0, height]);
  return lathe(prof, seg, { crease });
}
export const cone = (radius = 1, height = 1, seg = 20) => cylinder(radius, 0, height, seg);

/** A capsule standing on y = 0, total height `height` (at least 2 * radius). */
export function capsule(radius = 0.5, height = 2, seg = 16, capRings = 5) {
  return taperedCapsule(radius, radius, height, seg, capRings);
}
/** A capsule whose bottom and top spheres differ: radius r0 at the bottom, r1 at the top. */
export function taperedCapsule(r0, r1, height, seg = 16, capRings = 5) {
  capRings = DETAIL < 1 && capRings > 3 ? Math.max(3, Math.round(capRings * DETAIL)) : capRings;
  const prof = [], y0 = r0, y1 = Math.max(height - r1, r0);
  for (let i = 0; i <= capRings; i++) { const a = -Math.PI / 2 + (i / capRings) * (Math.PI / 2); prof.push([i === 0 ? 0 : Math.cos(a) * r0, y0 + Math.sin(a) * r0]); }
  for (let i = 0; i <= capRings; i++) { const a = (i / capRings) * (Math.PI / 2); prof.push([i === capRings ? 0 : Math.cos(a) * r1, y1 + Math.sin(a) * r1]); }
  return lathe(prof, seg, { crease: 180 });
}
/**
 * A limb segment for rigid-segment characters: a tapered capsule whose first sphere (radius r0) is
 * centred on the origin and whose second (radius r1) is centred `length` below it. Parent the next
 * segment at [0, -length, 0]; the overlapping spheres make the joint.
 */
export function limb(r0, r1, length, seg = 12, capRings = 4) {
  return transform(taperedCapsule(r1, r0, length + r0 + r1, seg, capRings), m4.trs(0, -length - r1, 0));
}

export function torus(R = 1, r = 0.25, seg = 24, tubeSeg = 10) {
  seg = lodSeg(seg); tubeSeg = lodRings(tubeSeg);
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) for (let j = 0; j <= tubeSeg; j++) {
    const a = (i / seg) * Math.PI * 2, b = (j / tubeSeg) * Math.PI * 2, d = R + Math.cos(b) * r;
    pos.push(Math.cos(a) * d, Math.sin(b) * r, Math.sin(a) * d); uv.push(i / seg, j / tubeSeg);
  }
  const w = tubeSeg + 1;
  for (let i = 0; i < seg; i++) for (let j = 0; j < tubeSeg; j++) { const a = i * w + j, b = a + 1, c = a + w, d = c + 1; idx.push(a, b, c, b, d, c); }
  return fromArrays(pos, idx, uv, 180);
}

// ------------------------------------------------------------------------------------ boxes

/** A hard-edged box centred on the origin. */
export function box(w = 1, h = 1, d = 1) { return roundedBox(w, h, d, 0); }

/** A box with rounded edges and corners, centred on the origin. `seg` is the steps per rounded corner. */
export function roundedBox(w = 1, h = 1, d = 1, radius = 0.1, seg = 3) {
  if (DETAIL < 1 && seg > 1) seg = Math.max(1, Math.round(seg * DETAIL));
  const hx = w / 2, hy = h / 2, hz = d / 2, r = Math.min(radius, hx, hy, hz);
  const coords = (half) => {
    if (r <= 0) return [-half, half];
    const out = [];
    for (let k = seg; k >= 0; k--) out.push(-(half - r) - r * Math.tan((k / seg) * Math.PI / 4));
    for (let k = 0; k <= seg; k++) out.push((half - r) + r * Math.tan((k / seg) * Math.PI / 4));
    return out;
  };
  const cx = coords(hx), cy = coords(hy), cz = coords(hz);
  const pos = [], uv = [], idx = [];
  const face = (ua, va, fixed, sign, uc, vc, half, flipW) => {
    const base = pos.length / 3, nu = uc.length, nv = vc.length;
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const q = [0, 0, 0]; q[ua] = uc[i]; q[va] = vc[j]; q[fixed] = sign * half;
      if (r > 0) {
        const ix = Math.max(-(hx - r), Math.min(hx - r, q[0])), iy = Math.max(-(hy - r), Math.min(hy - r, q[1])), iz = Math.max(-(hz - r), Math.min(hz - r, q[2]));
        const dx = q[0] - ix, dy = q[1] - iy, dz = q[2] - iz, l = Math.hypot(dx, dy, dz) || 1;
        q[0] = ix + (dx / l) * r; q[1] = iy + (dy / l) * r; q[2] = iz + (dz / l) * r;
      }
      pos.push(q[0], q[1], q[2]); uv.push(i / (nu - 1), 1 - j / (nv - 1));
    }
    for (let j = 0; j < nv - 1; j++) for (let i = 0; i < nu - 1; i++) {
      const a = base + j * nu + i, b = a + 1, c = a + nu, e = c + 1;
      if (flipW) idx.push(a, c, b, b, c, e); else idx.push(a, b, c, b, e, c);
    }
  };
  face(0, 1, 2, 1, cx, cy, hz, false); face(0, 1, 2, -1, cx, cy, hz, true);
  face(2, 1, 0, 1, cz, cy, hx, true); face(2, 1, 0, -1, cz, cy, hx, false);
  face(0, 2, 1, 1, cx, cz, hy, true); face(0, 2, 1, -1, cx, cz, hy, false);
  return fromArrays(pos, idx, uv, r > 0 ? 180 : 30);
}

// ------------------------------------------------------------------------------------ flat shapes

/** A flat rectangle in the XZ plane facing +Y, centred on the origin. */
export function plane(w = 1, d = 1, segW = 1, segD = 1) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= segD; j++) for (let i = 0; i <= segW; i++) { pos.push((i / segW - 0.5) * w, 0, (j / segD - 0.5) * d); uv.push(i / segW, j / segD); }
  const s = segW + 1;
  for (let j = 0; j < segD; j++) for (let i = 0; i < segW; i++) { const a = j * s + i, b = a + 1, c = a + s, e = c + 1; idx.push(a, c, b, b, c, e); }
  return fromArrays(pos, idx, uv, 180);
}
/** A flat rectangle in the XY plane facing +Z, centred on the origin: signs, decals, cards. */
export function quad(w = 1, h = 1) {
  return fromArrays([-w / 2, h / 2, 0, w / 2, h / 2, 0, -w / 2, -h / 2, 0, w / 2, -h / 2, 0], [0, 2, 3, 0, 3, 1], [0, 0, 1, 0, 0, 1, 1, 1], 180);
}
/** A flat disc in the XZ plane facing +Y. */
export function disc(radius = 1, seg = 24) { return lathe([[radius, 0], [0, 0]], seg, { crease: 180 }); }

/**
 * A curved patch lying on an ellipsoid, for face decals: eyes and mouths that follow a round head.
 * yaw/pitch (degrees) aim the patch centre from +Z (0, 0 is dead ahead; +yaw is toward +X, +pitch is up);
 * width/height are its angular size in degrees; `lift` pushes it off the surface (fraction of radius).
 * UVs run 0..1 with v = 0 at the top.
 */
export function spherePatch(rx, ry, rz, { yaw = 0, pitch = 0, width = 40, height = 40, lift = 0.012, seg = 6 } = {}) {
  const pos = [], uv = [], idx = [], k = 1 + lift;
  for (let j = 0; j <= seg; j++) for (let i = 0; i <= seg; i++) {
    const a = (yaw + (i / seg - 0.5) * width) * DEG, b = (pitch + (0.5 - j / seg) * height) * DEG;
    pos.push(Math.sin(a) * Math.cos(b) * rx * k, Math.sin(b) * ry * k, Math.cos(a) * Math.cos(b) * rz * k);
    uv.push(i / seg, j / seg);
  }
  const s = seg + 1;
  for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) { const a = j * s + i, b = a + 1, c = a + s, e = c + 1; idx.push(a, c, e, a, e, b); }
  return setOutline(fromArrays(pos, idx, uv, 180), 0);
}

// ------------------------------------------------------------------------------------ extrusion

function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}
/** Ear-clipping triangulation of a simple polygon (counter-clockwise). Returns index triples. */
export function triangulate(pts) {
  const n = pts.length, V = []; for (let i = 0; i < n; i++) V.push(i);
  const out = [];
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p, a, b, c) => cross(a, b, p) >= -1e-12 && cross(b, c, p) >= -1e-12 && cross(c, a, p) >= -1e-12;
  let guard = n * n + 8;
  while (V.length > 3 && guard-- > 0) {
    let cut = false;
    for (let i = 0; i < V.length; i++) {
      const ia = V[(i + V.length - 1) % V.length], ib = V[i], ic = V[(i + 1) % V.length];
      const a = pts[ia], b = pts[ib], c = pts[ic];
      if (cross(a, b, c) <= 1e-12) continue;
      let ear = true;
      for (const k of V) { if (k === ia || k === ib || k === ic) continue; if (inside(pts[k], a, b, c)) { ear = false; break; } }
      if (!ear) continue;
      out.push(ia, ib, ic); V.splice(i, 1); cut = true; break;
    }
    if (!cut) { V.splice(0, 1); } // degenerate input: drop a vertex and carry on
  }
  if (V.length === 3) out.push(V[0], V[1], V[2]);
  return out;
}

/**
 * Extrude a 2D outline [[x, y], ...] (any winding, not self-crossing) along Z, centred on z = 0.
 * `bevel` rounds the front and back edges inward by that much, in `bevelSegs` steps.
 */
export function extrude(outline, depth = 1, { bevel = 0, bevelSegs = 2, crease = 35 } = {}) {
  let pts = outline.map((p) => [p[0], p[1]]);
  if (signedArea(pts) < 0) pts.reverse();
  const n = pts.length;
  // outward miter direction per vertex, scaled so an inset of 1 moves each edge by 1
  const miter = pts.map((p, i) => {
    const a = pts[(i + n - 1) % n], c = pts[(i + 1) % n];
    let n0x = p[1] - a[1], n0y = -(p[0] - a[0]), n1x = c[1] - p[1], n1y = -(c[0] - p[0]);
    let l = Math.hypot(n0x, n0y) || 1; n0x /= l; n0y /= l; l = Math.hypot(n1x, n1y) || 1; n1x /= l; n1y /= l;
    let mx = n0x + n1x, my = n0y + n1y; l = Math.hypot(mx, my);
    if (l < 1e-6) { mx = n0x; my = n0y; l = 1; }
    mx /= l; my /= l;
    const k = 1 / Math.max(0.35, mx * n0x + my * n0y);
    return [mx * k, my * k];
  });
  const rings = []; // [inset, z]
  const h = depth / 2, b = Math.min(bevel, h);
  if (b > 0) for (let k = 0; k <= bevelSegs; k++) { const a = (k / bevelSegs) * Math.PI / 2; rings.push([b * (1 - Math.sin(a)), -h + b * (1 - Math.cos(a))]); }
  else rings.push([0, -h]);
  if (b > 0) for (let k = 0; k <= bevelSegs; k++) { const a = (k / bevelSegs) * Math.PI / 2; rings.push([b * (1 - Math.cos(a)), h - b * (1 - Math.sin(a))]); }
  else rings.push([0, h]);
  const pos = [], uv = [], idx = [];
  const bb = pts.reduce((m, p) => [Math.min(m[0], p[0]), Math.min(m[1], p[1]), Math.max(m[2], p[0]), Math.max(m[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]);
  const uvOf = (x, y) => [(x - bb[0]) / ((bb[2] - bb[0]) || 1), 1 - (y - bb[1]) / ((bb[3] - bb[1]) || 1)];
  const ringPts = rings.map(([inset]) => pts.map((p, i) => [p[0] - miter[i][0] * inset, p[1] - miter[i][1] * inset]));
  rings.forEach(([, z], k) => { for (const q of ringPts[k]) { pos.push(q[0], q[1], z); uv.push(...uvOf(q[0], q[1])); } });
  for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < n; i++) {
    const a = k * n + i, c2 = k * n + ((i + 1) % n), c = (k + 1) * n + i, d = (k + 1) * n + ((i + 1) % n);
    idx.push(a, c2, c, c2, d, c);
  }
  const tris = triangulate(ringPts[0]);
  const back = pos.length / 3;
  for (const q of ringPts[0]) { pos.push(q[0], q[1], rings[0][1]); uv.push(...uvOf(q[0], q[1])); }
  for (let t = 0; t < tris.length; t += 3) idx.push(back + tris[t], back + tris[t + 2], back + tris[t + 1]);
  const front = pos.length / 3, last = rings.length - 1;
  const trisF = b > 0 ? triangulate(ringPts[last]) : tris;
  for (const q of ringPts[last]) { pos.push(q[0], q[1], rings[last][1]); uv.push(...uvOf(q[0], q[1])); }
  for (let t = 0; t < trisF.length; t += 3) idx.push(front + trisF[t], front + trisF[t + 1], front + trisF[t + 2]);
  return fromArrays(pos, idx, uv, crease);
}

// ------------------------------------------------------------------------------------ tubes

/** Resample control points [[x, y, z], ...] as a Catmull-Rom curve with `n` segments. */
export function curve(points, n = 16) {
  const out = [], m = points.length;
  const P = (i) => points[Math.max(0, Math.min(m - 1, i))];
  for (let s = 0; s <= n; s++) {
    const f = (s / n) * (m - 1), i = Math.min(m - 2, Math.floor(f)), t = f - i;
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2), q = [0, 0, 0];
    for (let k = 0; k < 3; k++) q[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t * t * t);
    out.push(q);
  }
  return out;
}

/**
 * A tube along a path [[x, y, z], ...]. `radius` is a number, an array (one per point) or a function
 * of t in 0..1. Ends are closed; let the radius fall to a small value for a pointed or rounded tip.
 * For ropes, tails, hair locks, branches, horns, scarves (flatten with `squash`: the tube's second
 * cross-section axis is scaled by it).
 */
export function tube(path, radius = 0.1, seg = 10, { caps = true, squash = 1, crease = 60 } = {}) {
  seg = lodRings(seg);
  const n = path.length;
  const rad = (i) => (typeof radius === 'function' ? radius(i / (n - 1)) : Array.isArray(radius) ? radius[i] : radius);
  const pos = [], uv = [], idx = [];
  const T = [];
  for (let i = 0; i < n; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1;
    T.push([(b[0] - a[0]) / l, (b[1] - a[1]) / l, (b[2] - a[2]) / l]);
  }
  // parallel transport frame
  let N = Math.abs(T[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const proj = (v, t) => { const d = v[0] * t[0] + v[1] * t[1] + v[2] * t[2]; const o = [v[0] - t[0] * d, v[1] - t[1] * d, v[2] - t[2] * d]; const l = Math.hypot(o[0], o[1], o[2]) || 1; return [o[0] / l, o[1] / l, o[2] / l]; };
  const ringAt = (c, t, r, v) => {
    N = proj(N, t);
    const B = [N[1] * t[2] - N[2] * t[1], N[2] * t[0] - N[0] * t[2], N[0] * t[1] - N[1] * t[0]];
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2, cx = Math.cos(a) * r, sx = Math.sin(a) * r * squash;
      pos.push(c[0] + N[0] * cx + B[0] * sx, c[1] + N[1] * cx + B[1] * sx, c[2] + N[2] * cx + B[2] * sx);
      uv.push(j / seg, v);
    }
  };
  const ringR = [];
  if (caps) { ringAt(path[0], T[0], 0, 0); ringR.push(0); }
  for (let i = 0; i < n; i++) { ringAt(path[i], T[i], rad(i), i / (n - 1)); ringR.push(rad(i)); }
  if (caps) { ringAt(path[n - 1], T[n - 1], 0, 1); ringR.push(0); }
  const w = seg + 1;
  for (let i = 0; i < ringR.length - 1; i++) for (let j = 0; j < seg; j++) {
    const a = i * w + j, b = a + 1, c = a + w, d = c + 1;
    if (ringR[i] > 1e-9) idx.push(a, c, b);
    if (ringR[i + 1] > 1e-9) idx.push(b, c, d);
  }
  return fromArrays(pos, idx, uv, crease);
}

// ------------------------------------------------------------------------------------ bounds helper

/** The bounding box of several meshes or boxes, as { min, max }. */
export function unionBounds(list) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const it of list) {
    const b = it.positions ? bounds(it) : it;
    for (let k = 0; k < 3; k++) { if (b.min[k] < min[k]) min[k] = b.min[k]; if (b.max[k] > max[k]) max[k] = b.max[k]; }
  }
  return { min, max };
}

// ------------------------------------------------------------------------------------ measures and splitting

/**
 * A sphere around a mesh as Float32Array [cx, cy, cz, r] (the box centre, the farthest vertex).
 * Cached on the mesh; pass fresh = true after editing positions in place.
 */
export function boundingSphere(mesh, fresh = false) {
  if (mesh._bs && !fresh) return mesh._bs;
  const b = bounds(mesh), P = mesh.positions, o = new Float32Array(4);
  if (P.length === 0) { mesh._bs = o; return o; }
  const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2, cz = (b.min[2] + b.max[2]) / 2; let r2 = 0;
  for (let i = 0; i < P.length; i += 3) { const dx = P[i] - cx, dy = P[i + 1] - cy, dz = P[i + 2] - cz, d = dx * dx + dy * dy + dz * dz; if (d > r2) r2 = d; }
  o[0] = cx; o[1] = cy; o[2] = cz; o[3] = Math.sqrt(r2);
  mesh._bs = o; return o;
}

/** Number of triangles. */
export function triangleCount(mesh) { return mesh.indices.length / 3; }

/**
 * Six times the signed volume enclosed by the triangles: positive when a closed mesh's triangles
 * wind counter-clockwise seen from outside (the engine's convention), negative when it is inside out.
 */
export function signedVolume(mesh) {
  const P = mesh.positions, I = mesh.indices; let v = 0;
  for (let i = 0; i < I.length; i += 3) {
    const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
    v += P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c]);
  }
  return v;
}

/**
 * How many triangles have a shading normal that disagrees with their winding (face normal . mean
 * vertex normal < 0). Zero for every builder in this file; a mirrored or hand-indexed mesh that is
 * not zero will be culled or lit from the wrong side.
 */
export function windingErrors(mesh) {
  const P = mesh.positions, N = mesh.normals, I = mesh.indices; let bad = 0;
  for (let i = 0; i < I.length; i += 3) {
    const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    if (fx * fx + fy * fy + fz * fz < 1e-18) continue; // degenerate (a lathe pole)
    if (fx * (N[a] + N[b] + N[c]) + fy * (N[a + 1] + N[b + 1] + N[c + 1]) + fz * (N[a + 2] + N[b + 2] + N[c + 2]) < 0) bad++;
  }
  return bad;
}

/**
 * Sort a mesh's triangles by which of their two sides a camera can ever see, for a mesh that does not move
 * and a camera that stays inside a box. Triangles are only reordered (in place); nothing is removed:
 *
 *   [ front only | either | back only | neither ]
 *
 * The colour pass culls back faces, so it only needs the first two groups; the outline pass draws back faces
 * only (the inverted hull), so it only needs the middle two (less every triangle whose three outline widths
 * are zero: those draw no line). The shadow pass sees from the light and draws them all. On a street of
 * closed props seen from one side that is a quarter to a third of each pass never sent to the GPU, with no
 * difference in the picture. `world` is the node's world matrix (column-major 4x4), `box` is { min, max } in
 * world space, `margin` (the sine of an angle, default about 8 degrees) keeps triangles that are close to
 * edge-on in both passes. Sets mesh.trim = { min, max, view: [first index, count], outline: [first index, count] }
 * and returns it. The renderer uses it only while the camera is inside the box (see renderer.js).
 * Not for double-sided materials, skinned or instanced meshes, or a mesh two nodes share.
 */
export function trimForView(mesh, world, box, margin = 0.14) {
  const P = mesh.positions, I = mesh.indices, T = I.length / 3, W = world, ow = mesh.owidth;
  const cls = new Uint8Array(T), count = [0, 0, 0, 0];                   // 0 front only, 1 either, 2 back only, 3 neither
  const wx = new Float64Array(3), wy = new Float64Array(3), wz = new Float64Array(3);
  for (let t = 0; t < T; t++) {
    for (let k = 0; k < 3; k++) { const v = I[t * 3 + k] * 3, x = P[v], y = P[v + 1], z = P[v + 2]; wx[k] = W[0] * x + W[4] * y + W[8] * z + W[12]; wy[k] = W[1] * x + W[5] * y + W[9] * z + W[13]; wz[k] = W[2] * x + W[6] * y + W[10] * z + W[14]; }
    const ux = wx[1] - wx[0], uy = wy[1] - wy[0], uz = wz[1] - wz[0], vx = wx[2] - wx[0], vy = wy[2] - wy[0], vz = wz[2] - wz[0];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const len = Math.hypot(nx, ny, nz);
    if (len < 1e-12) { cls[t] = 3; count[3]++; continue; }             // no area: draws nothing in any pass
    nx /= len; ny /= len; nz /= len;
    let front = false, back = false;
    for (let c = 0; c < 8 && !(front && back); c++) {
      const ex = (c & 1 ? box.max[0] : box.min[0]) - wx[0], ey = (c & 2 ? box.max[1] : box.min[1]) - wy[0], ez = (c & 4 ? box.max[2] : box.min[2]) - wz[0];
      const d = nx * ex + ny * ey + nz * ez, m = margin * Math.hypot(ex, ey, ez);
      if (d > -m) front = true;
      if (d < m) back = true;
    }
    if (back && ow && ow[I[t * 3]] === 0 && ow[I[t * 3 + 1]] === 0 && ow[I[t * 3 + 2]] === 0) back = false;   // no line to draw
    const c = front ? (back ? 1 : 0) : back ? 2 : 3;
    cls[t] = c; count[c]++;
  }
  const out = new I.constructor(I.length), at = [0, count[0], count[0] + count[1], count[0] + count[1] + count[2]];
  for (let t = 0; t < T; t++) { const o = at[cls[t]]++ * 3; out[o] = I[t * 3]; out[o + 1] = I[t * 3 + 1]; out[o + 2] = I[t * 3 + 2]; }
  I.set(out);
  mesh.trim = { min: [box.min[0], box.min[1], box.min[2]], max: [box.max[0], box.max[1], box.max[2]], view: [0, (count[0] + count[1]) * 3], outline: [count[0] * 3, (count[1] + count[2]) * 3] };
  return mesh.trim;
}

/**
 * Split a mesh into pieces by which cell of an XZ grid each triangle's centre falls in, so a big
 * merged set can be culled a piece at a time. Returns [{ key: 'ix,iz', mesh }], triangles and
 * attributes untouched (vertices shared across a cell edge are duplicated).
 */
export function splitByCell(mesh, cell) {
  if (!(cell > 0)) throw new Error(`splitByCell: cell size must be positive, got ${cell}`);
  const P = mesh.positions, I = mesh.indices, groups = new Map();
  for (let i = 0; i < I.length; i += 3) {
    const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
    const k = Math.floor((P[a] + P[b] + P[c]) / 3 / cell) + ',' + Math.floor((P[a + 2] + P[b + 2] + P[c + 2]) / 3 / cell);
    let g = groups.get(k); if (!g) { g = []; groups.set(k, g); }
    g.push(i);
  }
  const out = [];
  for (const [key, tris] of groups) {
    const remap = new Map(), order = [];
    for (const t of tris) for (let k = 0; k < 3; k++) { const v = I[t + k]; if (!remap.has(v)) { remap.set(v, order.length); order.push(v); } }
    const m = alloc(order.length, tris.length * 3);
    order.forEach((v, j) => {
      for (let k = 0; k < 3; k++) { m.positions[j * 3 + k] = P[v * 3 + k]; m.normals[j * 3 + k] = mesh.normals[v * 3 + k]; m.onormals[j * 3 + k] = mesh.onormals[v * 3 + k]; m.colors[j * 3 + k] = mesh.colors[v * 3 + k]; }
      m.uvs[j * 2] = mesh.uvs[v * 2]; m.uvs[j * 2 + 1] = mesh.uvs[v * 2 + 1]; m.owidth[j] = mesh.owidth[v]; m.glow[j] = mesh.glow[v];
    });
    tris.forEach((t, j) => { for (let k = 0; k < 3; k++) m.indices[j * 3 + k] = remap.get(I[t + k]); });
    out.push({ key, mesh: m });
  }
  return out;
}
