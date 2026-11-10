// Skinless character animation: a figure is a tree of rigid segments (scene.js nodes) whose
// rounded ends overlap at the joints. This file poses them. Pure, no GL.
//
// A pose is a plain object: { jointName: [pitchDeg, yawDeg, rollDeg] } or, for more than rotation,
// { jointName: { r: [x, y, z], p: [dx, dy, dz], s: [sx, sy, sz] } }. Rotations and offsets are
// relative to the rest pose (the transforms the nodes had when createRig() was called).
// Per frame: rig.reset(); rig.apply(poseA); rig.apply(poseB, 0.3); idle(rig, t); springs.update(dt).
// None of that allocates after the first time a pose object is seen.

import { v3, m4, quat, DEG } from './math.js';

const qa = quat.create(), qb = quat.create(), va = v3.create(), vb = v3.create(), vc = v3.create(), vd = v3.create(), inv = m4.create();

/**
 * createRig(root) -> { root, joints: { name: node }, reset(), apply(pose, weight = 1), blend(a, b, t), joint(name) }
 * Every named node under root is a joint. Names must be unique within one rig.
 */
export function createRig(root) {
  const nodes = [], index = new Map();
  root.traverse((n) => { if (!n.name) return; if (index.has(n.name)) throw new Error(`createRig: two nodes are named "${n.name}"`); index.set(n.name, nodes.length); nodes.push(n); });
  const rest = new Float32Array(nodes.length * 10);
  nodes.forEach((n, i) => { rest.set(n.position, i * 10); rest.set(n.rotation, i * 10 + 3); rest.set(n.scale, i * 10 + 7); });
  const compiled = new WeakMap();
  const joints = {}; nodes.forEach((n) => { joints[n.name] = n; });

  function compile(pose) {
    let c = compiled.get(pose);
    if (c) return c;
    const names = Object.keys(pose), n = names.length;
    c = { idx: new Int32Array(n), q: new Float32Array(n * 4), p: new Float32Array(n * 3), s: new Float32Array(n * 3).fill(1) };
    names.forEach((name, k) => {
      const i = index.get(name);
      if (i === undefined) throw new Error(`rig: pose names joint "${name}", which this rig does not have (have: ${[...index.keys()].join(', ')})`);
      const v = pose[name], r = Array.isArray(v) ? v : (v.r || [0, 0, 0]);
      c.idx[k] = i;
      quat.fromEuler(c.q.subarray(k * 4, k * 4 + 4), r[0] * DEG, r[1] * DEG, r[2] * DEG);
      if (!Array.isArray(v)) { if (v.p) c.p.set(v.p, k * 3); if (v.s) c.s.set(v.s, k * 3); }
    });
    compiled.set(pose, c);
    return c;
  }

  const rig = {
    root, joints, nodes,
    joint(name) { const j = joints[name]; if (!j) throw new Error(`rig: no joint "${name}"`); return j; },
    /** Put every joint back to its rest transform. */
    reset() {
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i], o = i * 10;
        n.position[0] = rest[o]; n.position[1] = rest[o + 1]; n.position[2] = rest[o + 2];
        n.rotation[0] = rest[o + 3]; n.rotation[1] = rest[o + 4]; n.rotation[2] = rest[o + 5]; n.rotation[3] = rest[o + 6];
        n.scale[0] = rest[o + 7]; n.scale[1] = rest[o + 8]; n.scale[2] = rest[o + 9];
      }
      return rig;
    },
    /** Move the pose's joints from where they are toward the pose by `weight` (1 = all the way). */
    apply(pose, weight = 1) {
      const c = compile(pose);
      for (let k = 0; k < c.idx.length; k++) {
        const i = c.idx[k], n = nodes[i], o = i * 10;
        qa[0] = rest[o + 3]; qa[1] = rest[o + 4]; qa[2] = rest[o + 5]; qa[3] = rest[o + 6];
        qb[0] = c.q[k * 4]; qb[1] = c.q[k * 4 + 1]; qb[2] = c.q[k * 4 + 2]; qb[3] = c.q[k * 4 + 3];
        quat.multiply(qa, qa, qb);
        quat.slerp(n.rotation, n.rotation, qa, weight);
        for (let a = 0; a < 3; a++) {
          n.position[a] += (rest[o + a] + c.p[k * 3 + a] - n.position[a]) * weight;
          n.scale[a] += (rest[o + 7 + a] * c.s[k * 3 + a] - n.scale[a]) * weight;
        }
      }
      return rig;
    },
    /** Rest, then pose a, then t of the way to pose b. */
    blend(a, b, t) { rig.reset(); rig.apply(a, 1); if (t > 0) rig.apply(b, t); return rig; },
  };
  return rig;
}

/** Rotate a node further by Euler degrees, on top of whatever it has (additive layer). */
export function addRot(node, xDeg, yDeg, zDeg) {
  quat.fromEuler(qa, xDeg * DEG, yDeg * DEG, zDeg * DEG);
  quat.multiply(node.rotation, node.rotation, qa);
  return node;
}

/**
 * Procedural life on top of a pose: breathing, a weight-shifting bob and sway, a wandering head.
 * Joints that the rig lacks are skipped. opts:
 *   t offsets per character come from `seed`; `speed` scales time; `amount` scales everything;
 *   breath / bob / sway / look scale the parts; `height` is the character's height in world units;
 *   joints: { hips, chest, head, armL, armR } gives the joint names (those are the defaults).
 */
export function idle(rig, time, { seed = 0, speed = 1, amount = 1, breath = 1, bob = 1, sway = 1, look = 1, height = 1, joints = null } = {}) {
  const J = rig.joints, nm = joints || DEFAULT_JOINTS, t = time * speed + seed * 3.7;
  const hips = J[nm.hips], chest = J[nm.chest], head = J[nm.head], armL = J[nm.armL], armR = J[nm.armR];
  const b = Math.sin(t * 2.1), b2 = Math.sin(t * 2.1 - 0.9), s = Math.sin(t * 0.83 + seed), s2 = Math.sin(t * 0.47 + seed * 2.0);
  if (hips) {
    hips.position[1] += (b * 0.008 + s * 0.004) * bob * amount * height;
    addRot(hips, 0, s2 * 1.5 * sway * amount, s * 1.8 * sway * amount);
  }
  if (chest) {
    const k = b * 0.022 * breath * amount;
    chest.scale[0] *= 1 + k * 0.6; chest.scale[1] *= 1 + k; chest.scale[2] *= 1 + k * 0.9;
    addRot(chest, b2 * 0.8 * breath * amount, 0, -s * 1.2 * sway * amount);
  }
  if (head) {
    const n = Math.sin(t * 0.31 + seed * 5.0) + 0.5 * Math.sin(t * 0.73 + seed);
    addRot(head, b2 * 1.2 * breath * amount + Math.sin(t * 0.41 + 1.3) * 2.0 * look * amount, n * 5.0 * look * amount, -s * 1.6 * sway * amount);
  }
  if (armL) addRot(armL, b2 * 1.5 * amount, 0, b * 1.4 * breath * amount);
  if (armR) addRot(armR, -b2 * 1.5 * amount, 0, -b * 1.4 * breath * amount);
  return rig;
}
const DEFAULT_JOINTS = { hips: 'hips', chest: 'chest', head: 'head', armL: 'armL', armR: 'armR' };

/**
 * How closed the eyes are at `time`, 0 (open) .. 1 (shut): a quick blink every few seconds, now and
 * then a double. Different seeds blink out of step.
 */
export function blink(time, seed = 0) {
  const period = 2.7 + ((seed * 0.6180339) % 1) * 1.9, x = (time + seed * 1.37) % period, d = 0.13;
  if (x < d) return Math.sin((x / d) * Math.PI);
  const cyc = Math.floor((time + seed * 1.37) / period);
  if (cyc % 3 === 1 && x > 0.26 && x < 0.26 + d) return Math.sin(((x - 0.26) / d) * Math.PI);
  return 0;
}

/** Volume-preserving squash (amount < 0) and stretch (amount > 0) along a node's Y. */
export function squash(node, amount, base = 1) {
  const sy = 1 + amount, sx = 1 / Math.sqrt(Math.max(0.05, sy));
  node.scale[0] = base * sx; node.scale[1] = base * sy; node.scale[2] = base * sx;
  return node;
}

/**
 * A jiggle bone: makes a node (a hair lock, a scarf end, a tail, a hat tip, an ear) lag behind and
 * overshoot its parent's motion. The node must have a parent; its geometry should extend from its
 * origin along `axis` (in the node's own space) for about `length`.
 *
 * createSpring(node, { axis = [0, -1, 0], length = 0.3, stiffness = 90, damping = 9, gravity = 0, limit = 55 })
 *   -> { update(dt), reset() }
 * Call update after the pose is applied. It reads the parent's world matrix from the last
 * updateWorld() (the renderer runs one every frame), so it is one frame behind, which does not show.
 * `gravity` pulls the tip down in world space; `limit` is the largest bend in degrees.
 */
export function createSpring(node, { axis = [0, -1, 0], length = 0.3, stiffness = 90, damping = 9, gravity = 0, limit = 55, wind = null } = {}) {
  if (!node.parent) throw new Error(`createSpring: node "${node.name}" has no parent yet; add it to the figure first`);
  const restRot = quat.copy(quat.create(), node.rotation);
  const al = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const ax = v3.create(axis[0] / al, axis[1] / al, axis[2] / al);
  const restDir = v3.rotate(v3.create(), ax, restRot);
  const tip = v3.create(), vel = v3.create();
  let started = false;
  const cosLimit = Math.cos(limit * DEG);
  const sp = {
    node, wind,
    reset() { started = false; quat.copy(node.rotation, restRot); },
    update(dt) {
      const pw = node.parent.world;
      v3.transformPoint(va, node.position, pw);                       // joint origin, world
      v3.addScaled(vb, node.position, restDir, length); v3.transformPoint(vb, vb, pw); // where the tip rests, world
      const wl = v3.dist(va, vb);
      if (!started || wl < 1e-6) { v3.copy(tip, vb); v3.set(vel, 0, 0, 0); started = true; }
      let left = Math.min(dt, 0.1);
      while (left > 1e-5) { // fixed small steps keep a stiff spring stable at any frame rate
        const h = Math.min(left, 1 / 120); left -= h;
        for (let a = 0; a < 3; a++) {
          let acc = (vb[a] - tip[a]) * stiffness - vel[a] * damping;
          if (a === 1) acc -= gravity;
          if (sp.wind) acc += sp.wind[a];
          vel[a] += acc * h; tip[a] += vel[a] * h;
        }
      }
      v3.sub(vc, tip, va); const l = v3.len(vc);
      if (l < 1e-6) return;
      v3.scale(vc, vc, wl / l); v3.add(tip, va, vc);                    // keep the bone's length
      m4.invert(inv, pw); v3.transformDir(vd, vc, inv); v3.normalize(vd, vd);
      quat.fromTo(qa, restDir, vd);
      const d = v3.dot(restDir, vd);
      if (d < cosLimit) { const ang = Math.acos(Math.max(-1, Math.min(1, d))); quat.slerp(qa, IDENTITY, qa, (limit * DEG) / ang); }
      quat.multiply(node.rotation, qa, restRot);
    },
  };
  return sp;
}
const IDENTITY = quat.create();

/**
 * Turn a node so that its own `axis` points along a world-space direction, whatever its parents are
 * doing: a lantern that hangs straight down from a raised hand, a head that looks at a point.
 * `worldDir` need not be normalised. Uses the parent's world matrix from the last updateWorld().
 */
export function aimAxis(node, axis, worldDir) {
  if (!node.parent) throw new Error(`aimAxis: node "${node.name}" has no parent`);
  m4.invert(inv, node.parent.world);
  v3.transformDir(va, worldDir, inv); v3.normalize(va, va);
  v3.normalize(vb, axis);
  quat.fromTo(node.rotation, vb, va);
  return node;
}

/** Update several springs at once: springs(list).update(dt). */
export function springs(list) {
  return { list, update(dt) { for (let i = 0; i < list.length; i++) list[i].update(dt); }, reset() { for (const s of list) s.reset(); } };
}
