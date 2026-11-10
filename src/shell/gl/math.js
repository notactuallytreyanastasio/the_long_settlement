// Vector, matrix and quaternion essentials for the cel engine.
//
// Everything writes into an `out` argument and returns it, so the render loop never allocates.
// Matrices are column-major Float32Array(16), as WebGL wants them. Quaternions are [x, y, z, w].
// Angles are radians here; the scene and rig layers take degrees and convert.

/**
 * Length of (a, b[, c[, d]]). Use this, not Math.hypot, in anything that runs every frame: V8's Math.hypot takes its
 * arguments as an array it allocates on each call (it was a quarter of what a play frame allocated, and several times
 * slower than this). It does not guard against overflow the way Math.hypot does; nothing here is near 1e154.
 */
export function hypot(a, b = 0, c = 0, d = 0) { return Math.sqrt(a * a + b * b + c * c + d * d); }

export const DEG = Math.PI / 180;

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** A deterministic 0..1 generator, for procedural art that must not change between loads. */
export function rng(seed = 1) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ------------------------------------------------------------------------------------ vec3

export const v3 = {
  create: (x = 0, y = 0, z = 0) => { const o = new Float32Array(3); o[0] = x; o[1] = y; o[2] = z; return o; },
  set: (o, x, y, z) => { o[0] = x; o[1] = y; o[2] = z; return o; },
  copy: (o, a) => { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; return o; },
  add: (o, a, b) => { o[0] = a[0] + b[0]; o[1] = a[1] + b[1]; o[2] = a[2] + b[2]; return o; },
  sub: (o, a, b) => { o[0] = a[0] - b[0]; o[1] = a[1] - b[1]; o[2] = a[2] - b[2]; return o; },
  scale: (o, a, s) => { o[0] = a[0] * s; o[1] = a[1] * s; o[2] = a[2] * s; return o; },
  addScaled: (o, a, b, s) => { o[0] = a[0] + b[0] * s; o[1] = a[1] + b[1] * s; o[2] = a[2] + b[2] * s; return o; },
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (o, a, b) => {
    const x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0];
    o[0] = x; o[1] = y; o[2] = z; return o;
  },
  len: (a) => hypot(a[0], a[1], a[2]),
  dist: (a, b) => hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
  normalize: (o, a) => {
    const l = hypot(a[0], a[1], a[2]);
    if (l > 1e-12) { o[0] = a[0] / l; o[1] = a[1] / l; o[2] = a[2] / l; } else { o[0] = 0; o[1] = 1; o[2] = 0; }
    return o;
  },
  lerp: (o, a, b, t) => { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; return o; },
  /** Transform a point by a mat4 (w = 1, no perspective divide). */
  transformPoint: (o, a, m) => {
    const x = a[0], y = a[1], z = a[2];
    o[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
    o[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    o[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    return o;
  },
  /** Transform a direction by the upper 3x3 of a mat4. */
  transformDir: (o, a, m) => {
    const x = a[0], y = a[1], z = a[2];
    o[0] = m[0] * x + m[4] * y + m[8] * z;
    o[1] = m[1] * x + m[5] * y + m[9] * z;
    o[2] = m[2] * x + m[6] * y + m[10] * z;
    return o;
  },
  /** Rotate a vector by a quaternion. */
  rotate: (o, a, q) => {
    const x = a[0], y = a[1], z = a[2], qx = q[0], qy = q[1], qz = q[2], qw = q[3];
    const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
    o[0] = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    o[1] = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    o[2] = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    return o;
  },
};

// ------------------------------------------------------------------------------------ quat

export const quat = {
  create: () => { const o = new Float32Array(4); o[3] = 1; return o; },
  identity: (o) => { o[0] = 0; o[1] = 0; o[2] = 0; o[3] = 1; return o; },
  copy: (o, a) => { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; o[3] = a[3]; return o; },
  /** Yaw (y) first about the world up, then pitch (x), then roll (z): R = Ry * Rx * Rz. Radians. */
  fromEuler: (o, x, y, z) => {
    const cx = Math.cos(x / 2), sx = Math.sin(x / 2), cy = Math.cos(y / 2), sy = Math.sin(y / 2), cz = Math.cos(z / 2), sz = Math.sin(z / 2);
    o[0] = cy * sx * cz + sy * cx * sz;
    o[1] = sy * cx * cz - cy * sx * sz;
    o[2] = cy * cx * sz - sy * sx * cz;
    o[3] = cy * cx * cz + sy * sx * sz;
    return o;
  },
  fromAxisAngle: (o, axis, rad) => {
    const s = Math.sin(rad / 2);
    o[0] = axis[0] * s; o[1] = axis[1] * s; o[2] = axis[2] * s; o[3] = Math.cos(rad / 2);
    return o;
  },
  /** out = a * b (apply b first, then a). */
  multiply: (o, a, b) => {
    const ax = a[0], ay = a[1], az = a[2], aw = a[3], bx = b[0], by = b[1], bz = b[2], bw = b[3];
    o[0] = aw * bx + ax * bw + ay * bz - az * by;
    o[1] = aw * by - ax * bz + ay * bw + az * bx;
    o[2] = aw * bz + ax * by - ay * bx + az * bw;
    o[3] = aw * bw - ax * bx - ay * by - az * bz;
    return o;
  },
  normalize: (o, a) => {
    const l = hypot(a[0], a[1], a[2], a[3]) || 1;
    o[0] = a[0] / l; o[1] = a[1] / l; o[2] = a[2] / l; o[3] = a[3] / l; return o;
  },
  slerp: (o, a, b, t) => {
    let bx = b[0], by = b[1], bz = b[2], bw = b[3];
    let c = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
    if (c < 0) { c = -c; bx = -bx; by = -by; bz = -bz; bw = -bw; }
    let s0, s1;
    if (1 - c > 1e-5) { const w = Math.acos(c), s = Math.sin(w); s0 = Math.sin((1 - t) * w) / s; s1 = Math.sin(t * w) / s; } else { s0 = 1 - t; s1 = t; }
    o[0] = s0 * a[0] + s1 * bx; o[1] = s0 * a[1] + s1 * by; o[2] = s0 * a[2] + s1 * bz; o[3] = s0 * a[3] + s1 * bw;
    return o;
  },
  /** The shortest rotation taking unit vector a onto unit vector b. */
  fromTo: (o, a, b) => {
    const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    if (d < -0.99999) { // opposite: any perpendicular axis
      let x = 0, y = -a[2], z = a[1];
      if (hypot(x, y, z) < 1e-4) { x = -a[1]; y = a[0]; z = 0; }
      const l = hypot(x, y, z); o[0] = x / l; o[1] = y / l; o[2] = z / l; o[3] = 0; return o;
    }
    o[0] = a[1] * b[2] - a[2] * b[1]; o[1] = a[2] * b[0] - a[0] * b[2]; o[2] = a[0] * b[1] - a[1] * b[0]; o[3] = 1 + d;
    return quat.normalize(o, o);
  },
};

// ------------------------------------------------------------------------------------ mat4

export const m4 = {
  create: () => { const o = new Float32Array(16); o[0] = o[5] = o[10] = o[15] = 1; return o; },
  identity: (o) => { o.fill(0); o[0] = o[5] = o[10] = o[15] = 1; return o; },
  copy: (o, a) => { o.set(a); return o; },
  /** out = a * b. `out` may be either operand. */
  multiply: (o, a, b) => {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
      o[c * 4] = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3;
      o[c * 4 + 1] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3;
      o[c * 4 + 2] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3;
      o[c * 4 + 3] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3;
    }
    return o;
  },
  /** Compose translation, rotation (quaternion) and scale. */
  fromTRS: (o, p, q, s) => {
    const x = q[0], y = q[1], z = q[2], w = q[3];
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
    const sx = s[0], sy = s[1], sz = s[2];
    o[0] = (1 - (yy + zz)) * sx; o[1] = (xy + wz) * sx; o[2] = (xz - wy) * sx; o[3] = 0;
    o[4] = (xy - wz) * sy; o[5] = (1 - (xx + zz)) * sy; o[6] = (yz + wx) * sy; o[7] = 0;
    o[8] = (xz + wy) * sz; o[9] = (yz - wx) * sz; o[10] = (1 - (xx + yy)) * sz; o[11] = 0;
    o[12] = p[0]; o[13] = p[1]; o[14] = p[2]; o[15] = 1;
    return o;
  },
  /** Convenience for build time: translation, Euler degrees (yaw-pitch-roll, see quat.fromEuler), scale. */
  trs: (px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => {
    const q = quat.fromEuler(quat.create(), rx * DEG, ry * DEG, rz * DEG);
    return m4.fromTRS(m4.create(), [px, py, pz], q, [sx, sy, sz]);
  },
  invert: (o, a) => {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return m4.identity(o);
    det = 1 / det;
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return o;
  },
  /** Inverse transpose of the upper 3x3, as a Float32Array(9), for transforming normals under any scale. */
  normalMat3: (o, a) => {
    const a00 = a[0], a01 = a[1], a02 = a[2], a10 = a[4], a11 = a[5], a12 = a[6], a20 = a[8], a21 = a[9], a22 = a[10];
    const c00 = a11 * a22 - a12 * a21, c01 = a12 * a20 - a10 * a22, c02 = a10 * a21 - a11 * a20;
    let det = a00 * c00 + a01 * c01 + a02 * c02;
    det = det ? 1 / det : 0;
    o[0] = c00 * det; o[1] = c01 * det; o[2] = c02 * det;
    o[3] = (a02 * a21 - a01 * a22) * det; o[4] = (a00 * a22 - a02 * a20) * det; o[5] = (a01 * a20 - a00 * a21) * det;
    o[6] = (a01 * a12 - a02 * a11) * det; o[7] = (a02 * a10 - a00 * a12) * det; o[8] = (a00 * a11 - a01 * a10) * det;
    return o;
  },
  perspective: (o, fovyRad, aspect, near, far) => {
    const f = 1 / Math.tan(fovyRad / 2), nf = 1 / (near - far);
    o.fill(0);
    o[0] = f / aspect; o[5] = f; o[10] = (far + near) * nf; o[11] = -1; o[14] = 2 * far * near * nf;
    return o;
  },
  ortho: (o, l, r, b, t, n, f) => {
    o.fill(0);
    o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -2 / (f - n);
    o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n); o[15] = 1;
    return o;
  },
  lookAt: (o, eye, target, up) => {
    let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
    let l = hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    l = hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0;
    o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0;
    o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
    o[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    o[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    o[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    o[15] = 1;
    return o;
  },
};

// ------------------------------------------------------------------------------------ colour

/** '#rgb' / '#rrggbb' or an [r, g, b] array (0..1) to a new [r, g, b] array (0..1). */
export function rgb(c) {
  if (typeof c !== 'string') {
    if (!c || c.length < 3) throw new Error(`rgb: expected '#rrggbb' or [r, g, b], got ${JSON.stringify(c)}`);
    return [c[0], c[1], c[2]];
  }
  let h = c[0] === '#' ? c.slice(1) : c;
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`rgb: bad colour ${JSON.stringify(c)}`);
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Mix two colours (either form) and return [r, g, b]. */
export function mixRgb(a, b, t) {
  const x = rgb(a), y = rgb(b);
  return [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t];
}

// ------------------------------------------------------------------------------------ frustum

/**
 * The six planes of a view-projection matrix as 24 floats (nx, ny, nz, d per plane, normals pointing
 * inward and normalised): left, right, bottom, top, near, far. `out` is a Float32Array(24).
 */
export function frustumPlanes(out, m) {
  const row = (k, sign, r) => {
    let x = m[3] + sign * m[r], y = m[7] + sign * m[4 + r], z = m[11] + sign * m[8 + r], d = m[15] + sign * m[12 + r];
    const l = hypot(x, y, z) || 1;
    out[k * 4] = x / l; out[k * 4 + 1] = y / l; out[k * 4 + 2] = z / l; out[k * 4 + 3] = d / l;
  };
  row(0, 1, 0); row(1, -1, 0); row(2, 1, 1); row(3, -1, 1); row(4, 1, 2); row(5, -1, 2);
  return out;
}
/** False only when the sphere is wholly outside one of the planes from frustumPlanes(). */
export function sphereInFrustum(planes, x, y, z, r) {
  for (let k = 0; k < 24; k += 4) if (planes[k] * x + planes[k + 1] * y + planes[k + 2] * z + planes[k + 3] < -r) return false;
  return true;
}
/** The largest of the three axis scales of a mat4 (how much it can grow a radius). */
export function maxScale(m) {
  const a = m[0] * m[0] + m[1] * m[1] + m[2] * m[2], b = m[4] * m[4] + m[5] * m[5] + m[6] * m[6], c = m[8] * m[8] + m[9] * m[9] + m[10] * m[10];
  return Math.sqrt(a > b ? (a > c ? a : c) : (b > c ? b : c));
}
