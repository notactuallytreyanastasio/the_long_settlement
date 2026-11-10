// The scene description: nodes, materials, cameras, the lighting environment. Pure data, no GL:
// build a scene anywhere (tests included) and hand it to renderer.js to draw.

import { v3, m4, quat, rgb, DEG } from './math.js';
import { clone, transform, merge, bounds } from './mesh.js';

// ------------------------------------------------------------------------------------ materials

let materialId = 1;

/**
 * A toon material. Most scenes need two or three: colour comes from the vertices, so one material
 * can cover a whole character or a whole island and still batch into a few draw calls.
 *
 *   bands        2      tone steps from the key light (2 = lit + shadow; 3 or 4 add mid tones)
 *   bandEdge     0.05   where the terminator sits in N.L (-1..1); higher = more of the form in shadow
 *   bandStep     0.4    N.L distance between successive steps when bands > 2
 *   bandSoft     0.006  softness added to the terminator (antialiasing is automatic on top)
 *   spec         0      strength 0..1 of the hard specular dot;  specSize 0.05 (bigger = bigger dot)
 *   specColor    '#ffffff'
 *   rim          1      multiplier on the scene rim light (0 = none)
 *   emissive     0      0..1 added to the per-vertex glow: the surface shows its flat colour, unlit
 *   shadowTint   null   override the scene's shadow tint for this material ('#rrggbb')
 *   receiveShadow true, castShadow true
 *   fog          1      how much scene fog applies (clouds and far backdrops want less)
 *   map          null   a texture ({ source: canvas } from texture() or atlas.texture)
 *   texMode      'decal'  'decal': texture alpha-composited over the vertex colour, surface stays opaque
 *                         'cutout': texture colour, pixels under alphaCut discarded (leaves, lace)
 *                         'blend': texture colour and alpha, drawn after opaque things (face decals)
 *   alphaCut     0.5
 *   doubleSided  false
 *   outline      { width: 2.4, color: '#1d2742', self: 0.55 } or false.
 *                width in CSS px; `self` 0..1 mixes from the fixed ink colour to a dark tint of the surface
 *   kind         'toon', or 'beam' for additive light shafts (see beam below)
 *   beam         { power: 1.5, near: 0.5, far: 0, steps: 0 }: edge falloff power, opacity at uv v = 0
 *                and v = 1, and the number of hard opacity steps (0 = smooth)
 *   opacity      1      for 'blend' materials
 */
export function material(opts = {}) {
  const outline = opts.outline === false || opts.outline === 0 || opts.kind === 'beam' ? null
    : { width: 2.4, self: 0.55, ...(opts.outline || {}), color: rgb((opts.outline && opts.outline.color) || '#1d2742') };
  const texMode = opts.map ? (opts.texMode || 'decal') : 'none';
  return {
    id: materialId++, name: opts.name || '', kind: opts.kind || 'toon',
    bands: opts.bands ?? 2, bandEdge: opts.bandEdge ?? 0.05, bandStep: opts.bandStep ?? 0.4, bandSoft: opts.bandSoft ?? 0.006,
    spec: opts.spec ?? 0, specSize: opts.specSize ?? 0.05, specColor: rgb(opts.specColor || '#ffffff'),
    rim: opts.rim ?? 1, emissive: opts.emissive ?? 0,
    shadowTint: opts.shadowTint ? rgb(opts.shadowTint) : null,
    receiveShadow: opts.receiveShadow ?? true, castShadow: opts.castShadow ?? (opts.kind !== 'beam' && texMode !== 'blend'),
    fog: opts.fog ?? 1, map: opts.map || null, texMode, alphaCut: opts.alphaCut ?? 0.5,
    doubleSided: !!opts.doubleSided, outline, opacity: opts.opacity ?? 1,
    beam: { power: 1.5, near: 0.5, far: 0, steps: 0, ...(opts.beam || {}) },
  };
}

/** Wrap a canvas (or image) as a texture. Bump `version` (or call touch()) after redrawing the canvas. */
export function texture(source, { filter = 'linear', mips = true } = {}) {
  return { source, filter, mips, version: 1, touch() { this.version++; } };
}

// ------------------------------------------------------------------------------------ nodes

const IDENT_RECT = [0, 0, 1, 1];

/**
 * A scene graph node: a transform, optionally a mesh + material, optionally a point light.
 *   position [x, y, z]   rotation quaternion (use setRot for Euler degrees)   scale [x, y, z]
 *   mesh, material       what to draw (either may be null for a pure group / joint)
 *   visible              false hides the node and its children
 *   castShadow           false keeps this node out of the shadow map
 *   tint  [r, g, b, a]   multiplies the vertex colour (a is opacity for 'blend' materials)
 *   flash [r, g, b, a]   mixes the final colour toward rgb by a (hit flashes, selection)
 *   uvRect [u, v, su, sv] remaps the mesh's 0..1 uvs into an atlas rectangle (swap eyes, mouths)
 *   light                { color, radius, intensity } makes the node a lantern at its world position
 *   instances            from makeInstances(): draw the mesh many times in one call
 */
export class Node {
  constructor(name = '', opts = {}) {
    this.name = name;
    this.position = v3.create(); this.rotation = quat.create(); this.scale = v3.create(1, 1, 1);
    this.mesh = opts.mesh || null; this.material = opts.material || null;
    this.children = []; this.parent = null; this.visible = true; this.castShadow = true;
    this.tint = new Float32Array([1, 1, 1, 1]); this.flash = new Float32Array(4); this.uvRect = new Float32Array(IDENT_RECT);
    this.light = null; this.instances = null;
    this.local = m4.create(); this.world = m4.create();
    if (opts.pos) this.setPos(opts.pos[0], opts.pos[1], opts.pos[2]);
    if (opts.rot) this.setRot(opts.rot[0], opts.rot[1], opts.rot[2]);
    if (opts.scale != null) { if (typeof opts.scale === 'number') this.setScale(opts.scale); else this.setScale(opts.scale[0], opts.scale[1], opts.scale[2]); }
    if (opts.light) this.light = makeLight(opts.light);
    if (opts.tint) { const c = rgb(opts.tint); this.tint[0] = c[0]; this.tint[1] = c[1]; this.tint[2] = c[2]; }
    if (opts.uvRect) this.uvRect.set(opts.uvRect);
    if (opts.visible === false) this.visible = false;
    if (opts.castShadow === false) this.castShadow = false;
    if (opts.parent) opts.parent.add(this);
  }
  add(...kids) { for (const k of kids.flat()) { if (!k) continue; if (k.parent) k.parent.remove(k); k.parent = this; this.children.push(k); } return this; }
  remove(kid) { const i = this.children.indexOf(kid); if (i >= 0) { this.children.splice(i, 1); kid.parent = null; } return this; }
  setPos(x, y, z) { this.position[0] = x; this.position[1] = y; this.position[2] = z; return this; }
  /** Euler degrees: yaw (y) about up, then pitch (x), then roll (z). */
  setRot(xDeg, yDeg, zDeg) { quat.fromEuler(this.rotation, xDeg * DEG, yDeg * DEG, zDeg * DEG); return this; }
  setScale(x, y = x, z = x) { this.scale[0] = x; this.scale[1] = y; this.scale[2] = z; return this; }
  /** Depth-first search by name, this node included. Returns null if absent. */
  find(name) {
    if (this.name === name) return this;
    for (let i = 0; i < this.children.length; i++) { const r = this.children[i].find(name); if (r) return r; }
    return null;
  }
  /** Call fn(node) on this node and every descendant. */
  traverse(fn) { fn(this); for (let i = 0; i < this.children.length; i++) this.children[i].traverse(fn); }
  /** Recompute local and world matrices for this subtree. The renderer does this every frame. */
  updateWorld(parentWorld = null) {
    m4.fromTRS(this.local, this.position, this.rotation, this.scale);
    if (parentWorld) m4.multiply(this.world, parentWorld, this.local); else this.world.set(this.local);
    const c = this.children;
    for (let i = 0; i < c.length; i++) c[i].updateWorld(this.world);
  }
}

/** Shorthand: node('name', mesh, material, { pos, rot, scale, parent, ... }). */
export function node(name, mesh = null, mat = null, opts = {}) { return new Node(name, { ...opts, mesh, material: mat }); }
/** Shorthand for an empty group / joint. */
export function group(name, opts = {}, ...kids) { const n = new Node(name, opts); n.add(...kids); return n; }

/** A point light description: { color, radius (world units where it reaches zero), intensity }. */
export function makeLight({ color = '#ffb347', radius = 6, intensity = 1 } = {}) {
  return { color: rgb(color), radius, intensity };
}

/**
 * Per-instance data for drawing one mesh many times: makeInstances(capacity), then
 * setInstance(inst, i, mat4, color) and set inst.count. Set inst.dirty = true after later changes.
 * Instance transforms should use uniform scale (normals are not corrected per instance).
 */
export function makeInstances(capacity) {
  const data = new Float32Array(capacity * 20);
  for (let i = 0; i < capacity; i++) { data[i * 20] = data[i * 20 + 5] = data[i * 20 + 10] = data[i * 20 + 15] = 1; data.fill(1, i * 20 + 16, i * 20 + 20); }
  return { capacity, count: 0, data, dirty: true };
}
export function setInstance(inst, i, mat, color = null) {
  if (i >= inst.capacity) throw new Error(`setInstance: index ${i} is past the capacity ${inst.capacity}`);
  inst.data.set(mat, i * 20);
  if (color) { const c = rgb(color); inst.data[i * 20 + 16] = c[0]; inst.data[i * 20 + 17] = c[1]; inst.data[i * 20 + 18] = c[2]; inst.data[i * 20 + 19] = color.length > 3 && typeof color !== 'string' ? color[3] : 1; }
  if (i >= inst.count) inst.count = i + 1;
  inst.dirty = true;
  return inst;
}

/**
 * Bake a subtree that will never move into one mesh per material, so it costs one draw (plus one
 * outline draw) instead of one per part. Returns a new Node; the original is untouched.
 * Lights in the subtree are kept as child nodes. Instanced nodes are not merged (they are re-added).
 */
export function mergeStatic(root, name = root.name + '-static') {
  root.updateWorld(null);
  const inv = m4.invert(m4.create(), root.world), rel = m4.create();
  const byMat = new Map(); const out = new Node(name);
  out.position.set(root.position); out.rotation.set(root.rotation); out.scale.set(root.scale);
  const walk = (n) => {
    if (!n.visible) return;
    m4.multiply(rel, inv, n.world);
    if (n.instances) {
      // keep it instanced; fold its place in the subtree into each instance matrix
      const c = new Node(n.name, { mesh: n.mesh, material: n.material }); c.castShadow = n.castShadow;
      const src = n.instances, inst = makeInstances(src.capacity); inst.data.set(src.data); inst.count = src.count;
      for (let i = 0; i < src.count; i++) { const mtx = inst.data.subarray(i * 20, i * 20 + 16); m4.multiply(mtx, rel, mtx); }
      c.instances = inst; out.add(c);
    } else if (n.mesh && n.material) {
      const key = n.material.id + (n.castShadow ? ':c' : ':n');
      if (!byMat.has(key)) byMat.set(key, { material: n.material, cast: n.castShadow, parts: [] });
      const part = transform(clone(n.mesh), rel);
      if (n.tint[0] !== 1 || n.tint[1] !== 1 || n.tint[2] !== 1) for (let i = 0; i < part.colors.length; i += 3) { part.colors[i] *= n.tint[0]; part.colors[i + 1] *= n.tint[1]; part.colors[i + 2] *= n.tint[2]; }
      byMat.get(key).parts.push(part);
    }
    if (n.light) { const l = new Node(n.name || 'light'); l.light = n.light; l.setPos(rel[12], rel[13], rel[14]); out.add(l); }
    for (const c of n.children) walk(c);
  };
  walk(root);
  for (const { material: mat, cast, parts } of byMat.values()) { const c = new Node(name + ':' + (mat.name || mat.id), { mesh: merge(parts), material: mat }); c.castShadow = cast; out.add(c); }
  return out;
}

/** World-space bounding box { min, max } of everything drawn under a node. */
export function nodeBounds(root) {
  root.updateWorld(root.parent ? root.parent.world : null);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], p = [0, 0, 0];
  root.traverse((n) => {
    if (!n.mesh) return;
    const b = bounds(n.mesh);
    for (let i = 0; i < 8; i++) {
      v3.transformPoint(p, [i & 1 ? b.max[0] : b.min[0], i & 2 ? b.max[1] : b.min[1], i & 4 ? b.max[2] : b.min[2]], n.world);
      for (let k = 0; k < 3; k++) { if (p[k] < min[k]) min[k] = p[k]; if (p[k] > max[k]) max[k] = p[k]; }
    }
  });
  return { min, max };
}

// ------------------------------------------------------------------------------------ camera

/**
 * A perspective camera. Set position / target (Float32Array(3)) and fov (vertical, degrees), or
 * use frameBox(). The renderer calls update(aspect) each frame.
 */
export function createCamera({ fov = 32, near = 0.3, far = 1200, position = [0, 4, 12], target = [0, 1, 0] } = {}) {
  const cam = {
    fov, near, far, aspect: 1,
    position: v3.create(...position), target: v3.create(...target), up: v3.create(0, 1, 0),
    view: m4.create(), proj: m4.create(), viewProj: m4.create(), invViewProj: m4.create(),
    right: v3.create(), upDir: v3.create(),
    update(aspect) {
      if (aspect) cam.aspect = aspect;
      m4.lookAt(cam.view, cam.position, cam.target, cam.up);
      m4.perspective(cam.proj, cam.fov * DEG, cam.aspect, cam.near, cam.far);
      m4.multiply(cam.viewProj, cam.proj, cam.view);
      m4.invert(cam.invViewProj, cam.viewProj);
      v3.set(cam.right, cam.view[0], cam.view[4], cam.view[8]); v3.set(cam.upDir, cam.view[1], cam.view[5], cam.view[9]);
      return cam;
    },
    /** Orbit placement: look at `target` from `distance` away, at yaw / pitch degrees (pitch up = looking down). */
    orbit(target, distance, yawDeg, pitchDeg) {
      const y = yawDeg * DEG, p = pitchDeg * DEG;
      v3.copy(cam.target, target);
      v3.set(cam.position, target[0] + Math.sin(y) * Math.cos(p) * distance, target[1] + Math.sin(p) * distance, target[2] + Math.cos(y) * Math.cos(p) * distance);
      return cam;
    },
  };
  return cam;
}

/**
 * Place a camera so a world box { min, max } just fits the viewport, seen from yaw / pitch degrees.
 * `aspect` is width / height (a portrait phone is about 0.46); `margin` > 1 leaves air around it;
 * `shiftY` moves the box up (+) or down (-) in frame, as a fraction of the box height (leave room for UI).
 */
export function frameBox(cam, box, { yaw = 0, pitch = 12, aspect = cam.aspect, margin = 1.08, shiftY = 0 } = {}) {
  const c = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2 - shiftY * (box.max[1] - box.min[1]), (box.min[2] + box.max[2]) / 2];
  const y = yaw * DEG, p = pitch * DEG;
  const back = [Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)];
  const right = [Math.cos(y), 0, -Math.sin(y)];
  const up = v3.cross([0, 0, 0], back, right);
  const tv = Math.tan(cam.fov * DEG / 2), th = tv * aspect;
  let dist = 0;
  for (let i = 0; i < 8; i++) {
    const o = [(i & 1 ? box.max[0] : box.min[0]) - c[0], (i & 2 ? box.max[1] : box.min[1]) - c[1], (i & 4 ? box.max[2] : box.min[2]) - c[2]];
    const x = Math.abs(v3.dot(o, right)), yy = Math.abs(v3.dot(o, up)), z = v3.dot(o, back);
    dist = Math.max(dist, z + x / th, z + yy / tv);
  }
  dist *= margin;
  v3.set(cam.target, c[0], c[1], c[2]);
  v3.set(cam.position, c[0] + back[0] * dist, c[1] + back[1] * dist, c[2] + back[2] * dist);
  cam.aspect = aspect;
  return cam;
}

// ------------------------------------------------------------------------------------ environment

const DAY = {
  key: { dir: [0.5, 0.78, 0.38], color: '#fff6dc' },
  shadow: { tint: '#8f9be6', lift: 0.06, radius: 0, center: null, size: 1024, on: true },
  ambient: { sky: '#bfe4ff', ground: '#ffe9b0', amount: 0.1 },
  rim: { color: '#fffbe6', amount: 0.55, edge: 0.78 },
  fog: { color: null, density: 0.0045, max: 0.92, start: 12 },
  sky: {
    zenith: '#1c66d2', mid: '#49a6ee', midAt: 0.38, horizon: '#bfeaf7', below: '#8fd6ea', glow: '#fffbe0', glowAmount: 0.4,
    sun: { color: '#fffdf0', size: 2.6, halo: '#fff2b0', haloAmount: 0.5 }, moon: 0, stars: 0,
  },
  water: {
    level: 0, deep: '#1d8ed8', mid: '#2bb0e0', shallow: '#6fe0dc', foam: '#ffffff', glint: '#e8fbff', glintDensity: 0.2,
    drift: [0.35, 0.12], shores: [],
  },
  outline: { color: null, width: 1 },
  points: [],
};

const SUNSET = {
  key: { dir: [-0.72, 0.3, -0.34], color: '#ffd09a' },
  shadow: { tint: '#7c6fd0', lift: 0.08, radius: 0, center: null, size: 1024, on: true },
  ambient: { sky: '#ff9d8a', ground: '#7a5cc0', amount: 0.1 },
  rim: { color: '#ffd27a', amount: 0.9, edge: 0.74 },
  fog: { color: null, density: 0.005, max: 0.94, start: 10 },
  sky: {
    zenith: '#473fae', mid: '#f0728c', midAt: 0.3, horizon: '#ffc46a', below: '#f0a070', glow: '#fff0a0', glowAmount: 0.7,
    sun: { color: '#fff4c8', size: 3.6, halo: '#ffb24a', haloAmount: 0.6 }, moon: 0, stars: 0,
  },
  water: {
    level: 0, deep: '#2b4db5', mid: '#4a7fd8', shallow: '#7fdcd2', foam: '#fff4e0', glint: '#ffe9a8', glintDensity: 0.2,
    drift: [0.35, 0.12], shores: [],
  },
  outline: { color: null, width: 1 },
  points: [],
};

const NIGHT = {
  key: { dir: [-0.42, 0.62, 0.5], color: '#8fb4ff' },
  shadow: { tint: '#2d3f9c', lift: 0.1, radius: 0, center: null, size: 1024, on: true },
  ambient: { sky: '#3a58c8', ground: '#27358a', amount: 0.14 },
  rim: { color: '#bcd6ff', amount: 0.6, edge: 0.76 },
  fog: { color: null, density: 0.0055, max: 0.9, start: 10 },
  sky: {
    zenith: '#0b1764', mid: '#1b3aa8', midAt: 0.4, horizon: '#4878e0', below: '#2f55c0', glow: '#7fa8f4', glowAmount: 0.5,
    sun: { color: '#fbfbe8', size: 3.0, halo: '#8fb0ff', haloAmount: 0.35 }, moon: 0.75, stars: 1,
  },
  water: {
    level: 0, deep: '#14297f', mid: '#1d3fa6', shallow: '#2f6fd0', foam: '#bcd4ff', glint: '#a8c8ff', glintDensity: 0.14,
    drift: [0.35, 0.12], shores: [],
  },
  outline: { color: null, width: 1 },
  points: [],
};

const PRESETS = { day: DAY, sunset: SUNSET, night: NIGHT };
const COLOR_KEYS = new Set(['color', 'tint', 'sky', 'ground', 'zenith', 'horizon', 'below', 'glow', 'halo', 'deep', 'mid', 'shallow', 'foam', 'glint']);

function normaliseEnv(src, path = '') {
  if (Array.isArray(src)) return src.map((x) => (x && typeof x === 'object' ? normaliseEnv(x, path) : x));
  const out = {};
  for (const [k, v] of Object.entries(src)) {
    if (v == null) out[k] = null;
    else if (COLOR_KEYS.has(k) && (typeof v === 'string' || (Array.isArray(v) && typeof v[0] === 'number'))) out[k] = rgb(v);
    else if (k === 'dir') { const l = Math.hypot(v[0], v[1], v[2]) || 1; out[k] = [v[0] / l, v[1] / l, v[2] / l]; }
    else if (typeof v === 'object') out[k] = normaliseEnv(v, path + k + '.');
    else out[k] = v;
  }
  return out;
}
function deepMerge(a, b) {
  if (b === undefined) return a;
  if (b === null || typeof b !== 'object' || Array.isArray(b) || a === null || typeof a !== 'object' || Array.isArray(a)) return b;
  const o = { ...a };
  for (const k of Object.keys(b)) o[k] = deepMerge(a[k], b[k]);
  return o;
}

/**
 * A lighting environment: makeEnv('day' | 'sunset' | 'night', overrides). Overrides are merged
 * deeply, colours may be '#rrggbb'. The result is plain data and may be edited between frames
 * (colours are [r, g, b] arrays after this call; key.dir must stay normalised: use setKeyDir()).
 *
 *   key      { dir (toward the light), color }               the sun or moon; casts the shadows
 *   shadow   { tint, lift, radius, center, size, on }        tint = what white paper looks like in shadow;
 *                                                            radius/center = area the shadow map covers
 *                                                            (0 / null: follows the camera target)
 *   ambient  { sky, ground, amount }                         hemisphere fill added on top
 *   rim      { color, amount, edge }                         edge 0..1: higher = thinner rim
 *   fog      { color (null = sky.horizon), density, max, start }
 *   sky      { zenith, mid, midAt (0..1 height of the mid colour), horizon, below, glow, glowAmount, sun: { color, size (degrees), halo, haloAmount }, moon (0 or crescent 0..1), stars }
 *   water    null, or { level, deep, mid, shallow, foam, glint, glintDensity, drift [x, z], shores [[x, z, radius, bandWidth], ...] }
 *   outline  { color (null = each material's own), width (multiplier on every material's width) }
 *   points   [{ pos [x, y, z], color, radius, intensity }]   fixed lanterns (moving ones: node.light)
 */
export function makeEnv(preset = 'day', overrides = {}) {
  const base = typeof preset === 'string' ? PRESETS[preset] : preset;
  if (!base) throw new Error(`makeEnv: unknown preset ${JSON.stringify(preset)} (have ${Object.keys(PRESETS).join(', ')})`);
  return normaliseEnv(deepMerge(base, overrides));
}
export function setKeyDir(env, x, y, z) { const l = Math.hypot(x, y, z) || 1; env.key.dir[0] = x / l; env.key.dir[1] = y / l; env.key.dir[2] = z / l; return env; }

/**
 * Blend two environments made by makeEnv into `out` (also made by makeEnv): every number and colour
 * is interpolated, so a harbour can go from lit to dark over a few seconds. No allocation.
 * Lists (points, shores) and switches are taken from `a`.
 */
export function lerpEnv(out, a, b, t) {
  for (const k in a) {
    const x = a[k], y = b[k];
    if (typeof x === 'number' && typeof y === 'number') out[k] = x + (y - x) * t;
    else if (Array.isArray(x)) {
      if (k === 'points' || k === 'shores' || !Array.isArray(y) || typeof x[0] !== 'number') { out[k] = x; continue; }
      const o = out[k] && out[k] !== x && out[k] !== y ? out[k] : (out[k] = x.slice());
      for (let i = 0; i < x.length; i++) o[i] = x[i] + (y[i] - x[i]) * t;
      if (k === 'dir') { const l = Math.hypot(o[0], o[1], o[2]) || 1; o[0] /= l; o[1] /= l; o[2] /= l; }
    } else if (x && typeof x === 'object' && y && typeof y === 'object') { if (!out[k] || out[k] === x || out[k] === y) out[k] = {}; lerpEnv(out[k], x, y, t); }
    else out[k] = x;
  }
  return out;
}

/** A scene: { root, env, sprites }. Add nodes under root; assign sprites from createSprites(). */
export function createScene(env = makeEnv('day')) {
  return { root: new Node('root'), env, sprites: null };
}
