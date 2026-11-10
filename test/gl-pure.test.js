// The cel engine's pure modules: math, mesh builders, scene batching, sprites' packing.
// Nothing here touches WebGL or a DOM: what is tested is what the renderer is handed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { v3, m4, quat, rng, rgb, DEG, frustumPlanes, sphereInFrustum, maxScale } from '../src/shell/gl/math.js';
import * as M from '../src/shell/gl/mesh.js';
import { Node, node, group, material, mergeStatic, batchFigure, nodeBounds, createCamera, frameBox, makeEnv, lerpEnv, makeInstances, setInstance } from '../src/shell/gl/scene.js';
import { createSprites, KIND, SPRITE_FLOATS } from '../src/shell/gl/sprites.js';

const near = (a, b, eps = 1e-5) => Math.abs(a - b) <= eps;
const nearV = (a, b, eps = 1e-5) => a.length === b.length && Array.from(a).every((x, i) => near(x, b[i], eps));

// ------------------------------------------------------------------------------------ math

test('m4: a matrix times its inverse is the identity, for a rotated, scaled, moved transform', () => {
  const m = m4.trs(3, -2, 5, 20, 130, -45, 2, 0.5, 1.5), inv = m4.invert(m4.create(), m), p = m4.multiply(m4.create(), m, inv);
  assert.ok(nearV(p, m4.create(), 1e-5), `got ${Array.from(p).map((x) => x.toFixed(4))}`);
});

test('m4: multiply may write into either operand', () => {
  const a = m4.trs(1, 2, 3, 10, 20, 30), b = m4.trs(-4, 0, 2, 0, 90, 0, 2), want = m4.multiply(m4.create(), a, b);
  const a2 = a.slice(), b2 = b.slice();
  m4.multiply(a2, a2, b); m4.multiply(b2, a, b2);
  assert.ok(nearV(a2, want) && nearV(b2, want));
});

test('m4.lookAt puts the target on the -Z axis in front of the eye', () => {
  const view = m4.lookAt(m4.create(), [3, 4, 5], [0, 1, 0], [0, 1, 0]);
  const t = v3.transformPoint([0, 0, 0], [0, 1, 0], view), e = v3.transformPoint([0, 0, 0], [3, 4, 5], view);
  assert.ok(nearV(e, [0, 0, 0]) && near(t[0], 0) && near(t[1], 0) && t[2] < 0);
});

test('m4.normalMat3 keeps normals perpendicular under non-uniform scale', () => {
  const m = m4.trs(0, 0, 0, 0, 0, 0, 1, 4, 1), nm = m4.normalMat3(new Float32Array(9), m);
  // a 45 degree slope: tangent (1, 1, 0), normal (-1, 1, 0). After stretching y by 4 the tangent is (1, 4, 0).
  const n = [nm[0] * -1 + nm[3] * 1, nm[1] * -1 + nm[4] * 1, nm[2] * -1 + nm[5] * 1];
  assert.ok(near(n[0] * 1 + n[1] * 4, 0), `normal ${n} is not perpendicular to the stretched tangent`);
});

test('quat.fromEuler agrees with m4.trs, and v3.rotate with the matrix it makes', () => {
  const q = quat.fromEuler(quat.create(), 25 * DEG, -70 * DEG, 10 * DEG), m = m4.trs(0, 0, 0, 25, -70, 10);
  const a = v3.rotate([0, 0, 0], [0.3, -1, 2], q), b = v3.transformDir([0, 0, 0], [0.3, -1, 2], m);
  assert.ok(nearV(a, b, 1e-5), `${a} vs ${b}`);
});

test('rng is deterministic per seed and stays in [0, 1)', () => {
  const a = rng(7), b = rng(7), c = rng(8); let same = true, differs = false;
  for (let i = 0; i < 200; i++) { const x = a(), y = b(), z = c(); assert.ok(x >= 0 && x < 1); if (x !== y) same = false; if (x !== z) differs = true; }
  assert.ok(same && differs);
});

test('rgb parses both hex forms, copies arrays, and refuses rubbish by name', () => {
  assert.deepEqual(rgb('#fff'), [1, 1, 1]);
  assert.ok(nearV(rgb('#804020'), [128 / 255, 64 / 255, 32 / 255]));
  const src = [0.1, 0.2, 0.3], out = rgb(src); out[0] = 9; assert.equal(src[0], 0.1);
  assert.throws(() => rgb('#12345'), /bad colour/);
  assert.throws(() => rgb(null), /expected/);
});

test('frustum: spheres are kept when they touch the view and dropped only when wholly outside', () => {
  const cam = createCamera({ fov: 40, near: 0.5, far: 100, position: [0, 0, 10], target: [0, 0, 0] }).update(1);
  const pl = frustumPlanes(new Float32Array(24), cam.viewProj);
  assert.ok(sphereInFrustum(pl, 0, 0, 0, 1), 'the target');
  assert.ok(!sphereInFrustum(pl, 0, 0, 12, 1), 'behind the camera');
  assert.ok(!sphereInFrustum(pl, 0, 0, -95, 1), 'past the far plane');
  const edge = Math.tan(20 * DEG) * 10; // half-width of the view at the target's depth
  assert.ok(sphereInFrustum(pl, edge + 0.9, 0, 0, 1), 'straddling the right edge');
  assert.ok(!sphereInFrustum(pl, edge + 1.3, 0, 0, 1), 'just outside the right edge');
  assert.ok(!sphereInFrustum(pl, 0, -(edge + 1.3), 0, 1), 'just below the bottom edge');
  for (let k = 0; k < 6; k++) assert.ok(near(Math.hypot(pl[k * 4], pl[k * 4 + 1], pl[k * 4 + 2]), 1, 1e-5), 'planes are normalised');
});

test('maxScale is the largest axis scale whatever the rotation', () => {
  assert.ok(near(maxScale(m4.trs(1, 2, 3, 30, 60, 90, 0.5, 3, 2)), 3, 1e-5));
});

// ------------------------------------------------------------------------------------ mesh

const BUILDERS = {
  sphere: () => M.sphere(1, 16, 10), ellipsoid: () => M.ellipsoid(1, 0.5, 2, 12, 8), superellipsoid: () => M.superellipsoid(1, 1, 1, 0.5, 0.5, 16, 10),
  blob: () => M.blob({ rx: 1, ry: 0.8, rz: 0.9, pear: 0.3, lumps: 0.4, seed: 3 }), cylinder: () => M.cylinder(1, 0.6, 2, 12), cone: () => M.cone(1, 2, 12),
  capsule: () => M.capsule(0.5, 2, 12, 4), taperedCapsule: () => M.taperedCapsule(0.5, 0.3, 2, 12, 4), limb: () => M.limb(0.2, 0.15, 0.6, 10, 3),
  torus: () => M.torus(1, 0.25, 16, 8), box: () => M.box(1, 2, 3), roundedBox: () => M.roundedBox(1, 2, 3, 0.2, 3),
  lathe: () => M.lathe([[0, 0], [1, 0], [0.8, 1], [0, 1.2]], 14), extrude: () => M.extrude([[0, 0], [2, 0], [2, 1], [1, 2], [0, 1]], 0.5, { bevel: 0.05 }),
  tube: () => M.tube([[0, 0, 0], [0, 1, 0], [1, 2, 0], [2, 2, 1]], 0.2, 8),
};

for (const [name, make] of Object.entries(BUILDERS)) {
  test(`mesh ${name}: closed, wound outward, arrays consistent`, () => {
    const m = make(), n = M.vertexCount(m);
    assert.ok(n > 0 && m.indices.length % 3 === 0 && m.indices.length > 0);
    for (const [k, per] of [['positions', 3], ['normals', 3], ['onormals', 3], ['colors', 3], ['uvs', 2], ['owidth', 1], ['glow', 1]]) assert.equal(m[k].length, n * per, `${k} length`);
    for (const i of m.indices) assert.ok(i < n, 'index in range');
    for (const v of m.positions) assert.ok(Number.isFinite(v), 'finite position');
    assert.ok(M.signedVolume(m) > 0, `signed volume ${M.signedVolume(m)}: the mesh is inside out`);
    assert.equal(M.windingErrors(m), 0, 'triangles whose winding disagrees with their normals');
    for (let i = 0; i < n; i++) {
      const l = Math.hypot(m.normals[i * 3], m.normals[i * 3 + 1], m.normals[i * 3 + 2]), lo = Math.hypot(m.onormals[i * 3], m.onormals[i * 3 + 1], m.onormals[i * 3 + 2]);
      assert.ok(near(l, 1, 1e-3), `normal ${i} has length ${l}`); assert.ok(near(lo, 1, 1e-3), `outline normal ${i} has length ${lo}`);
    }
  });
}

test('mesh bounds: builders stand where their comments say', () => {
  const s = M.bounds(M.sphere(2, 16, 10)); assert.ok(nearV(s.min, [-2, -2, -2], 1e-4) && nearV(s.max, [2, 2, 2], 1e-4));
  const c = M.bounds(M.cylinder(1, 1, 3, 16)); assert.ok(near(c.min[1], 0) && near(c.max[1], 3), 'a cylinder stands on y = 0');
  const b = M.bounds(M.box(2, 4, 6)); assert.ok(nearV(b.min, [-1, -2, -3]) && nearV(b.max, [1, 2, 3]), 'a box is centred');
  const l = M.bounds(M.limb(0.2, 0.2, 1, 8, 3)); assert.ok(l.max[1] <= 0.21 && l.min[1] < -0.9, 'a limb hangs from the origin');
});

test('mesh mirrorX keeps the winding outward and does not touch the original', () => {
  const a = M.place(M.box(1, 1, 1), 2, 0, 0), keep = a.positions.slice(), b = M.mirrorX(a);
  assert.deepEqual(Array.from(a.positions), Array.from(keep));
  assert.ok(M.signedVolume(b) > 0 && M.windingErrors(b) === 0);
  assert.ok(near(M.bounds(b).max[0], -1.5) && near(M.bounds(b).min[0], -2.5));
});

test('mesh transform: a negative scale flips the triangles back; normals stay unit under a squash', () => {
  const m = M.scale(M.sphere(1, 12, 8), 1, -0.25, 3);
  assert.ok(M.signedVolume(m) > 0); assert.equal(M.windingErrors(m), 0);
  for (let i = 0; i < m.normals.length; i += 3) assert.ok(near(Math.hypot(m.normals[i], m.normals[i + 1], m.normals[i + 2]), 1, 1e-4));
});

test('mesh merge: counts add, indices are offset, colours and glow ride along', () => {
  const a = M.tint(M.box(1, 1, 1), '#ff0000'), b = M.setGlow(M.tint(M.place(M.sphere(0.5, 8, 6), 3, 0, 0), '#0000ff'), 1), m = M.merge(a, [b, null]);
  assert.equal(M.vertexCount(m), M.vertexCount(a) + M.vertexCount(b)); assert.equal(M.triangleCount(m), M.triangleCount(a) + M.triangleCount(b));
  const va = M.vertexCount(a);
  assert.ok(Math.max(...m.indices.subarray(0, a.indices.length)) < va && Math.min(...m.indices.subarray(a.indices.length)) >= va);
  assert.deepEqual([m.colors[0], m.colors[2], m.colors[va * 3], m.colors[va * 3 + 2]], [1, 0, 0, 1]);
  assert.equal(m.glow[0], 0); assert.equal(m.glow[va], 1);
  assert.ok(near(M.signedVolume(m), M.signedVolume(a) + M.signedVolume(b), 1e-3));
});

test('mesh clone is deep and drops caches', () => {
  const a = M.box(1, 1, 1); M.boundingSphere(a); a._gpu = { fake: true };
  const b = M.clone(a); b.positions[0] = 99;
  assert.notEqual(a.positions[0], 99); assert.equal(b._bs, undefined); assert.equal(b._gpu, undefined);
});

test('boundingSphere encloses every vertex and is tight for a sphere', () => {
  for (const make of Object.values(BUILDERS)) {
    const m = M.place(make(), 3, -1, 2, 20, 40, 0), s = M.boundingSphere(m);
    for (let i = 0; i < m.positions.length; i += 3) assert.ok(Math.hypot(m.positions[i] - s[0], m.positions[i + 1] - s[1], m.positions[i + 2] - s[2]) <= s[3] + 1e-4);
  }
  const s = M.boundingSphere(M.place(M.sphere(2, 24, 16), 5, 0, 0)); assert.ok(nearV(s, [5, 0, 0, 2], 1e-3));
});

test('splitByCell: every triangle lands in exactly one piece, in the cell its centre is in', () => {
  const m = M.merge(M.place(M.box(1, 1, 1), -3, 0, 0), M.place(M.box(1, 1, 1), 3, 0, 0), M.place(M.sphere(0.6, 10, 6), 3, 0, 7));
  const pieces = M.splitByCell(m, 4);
  assert.equal(pieces.reduce((n, p) => n + M.triangleCount(p.mesh), 0), M.triangleCount(m));
  assert.deepEqual(pieces.map((p) => p.key).sort(), ['-1,-1', '-1,0', '0,-1', '0,0', '0,1'].filter((k) => pieces.some((p) => p.key === k)).sort());
  for (const p of pieces) {
    const [ix, iz] = p.key.split(',').map(Number), P = p.mesh.positions, I = p.mesh.indices;
    for (let i = 0; i < I.length; i += 3) { const cx = (P[I[i] * 3] + P[I[i + 1] * 3] + P[I[i + 2] * 3]) / 3, cz = (P[I[i] * 3 + 2] + P[I[i + 1] * 3 + 2] + P[I[i + 2] * 3 + 2]) / 3; assert.equal(Math.floor(cx / 4), ix); assert.equal(Math.floor(cz / 4), iz); }
    assert.equal(M.windingErrors(p.mesh), 0);
  }
  assert.throws(() => M.splitByCell(m, 0), /cell size/);
});

// ------------------------------------------------------------------------------------ scene

test('scene graph: world matrices compose parent then child', () => {
  const root = group('root', { pos: [1, 0, 0], rot: [0, 90, 0] }), kid = node('kid', M.box(1, 1, 1), material(), { pos: [0, 0, 2], parent: root });
  root.updateWorld(null);
  const want = m4.multiply(m4.create(), m4.trs(1, 0, 0, 0, 90, 0), m4.trs(0, 0, 2));
  assert.ok(nearV(kid.world, want));
  assert.equal(root.find('kid'), kid); assert.equal(root.find('nobody'), null);
});

test('mergeStatic: one mesh per material and shadow flag, same triangles, same place in the world, marked static', () => {
  const red = material({ name: 'red' }), blue = material({ name: 'blue' });
  const set = group('set', { pos: [10, 0, 0], rot: [0, 30, 0] });
  const a = node('a', M.box(1, 1, 1), red, { pos: [1, 0, 0], parent: set });
  node('b', M.sphere(0.5, 8, 6), red, { pos: [0, 2, 0], rot: [0, 45, 0], parent: a });
  node('c', M.box(1, 1, 1), blue, { pos: [-2, 0, 1], tint: '#808080', parent: set });
  const quiet = node('d', M.box(1, 1, 1), red, { pos: [0, 0, -3], parent: set }); quiet.castShadow = false;
  new Node('lamp', { pos: [0, 1, 0], light: { color: '#ffffff', radius: 3 }, parent: set });
  const before = nodeBounds(set);
  node('hidden', M.box(5, 5, 5), red, { parent: set, visible: false }); // (nodeBounds measures hidden nodes too, so it joins after the measure)
  const out = mergeStatic(set, 'baked');
  const drawn = out.children.filter((n) => n.mesh);
  assert.equal(drawn.length, 3, 'red casting, red not casting, blue');
  assert.ok(drawn.every((n) => n.static), 'every baked piece is static');
  assert.equal(drawn.reduce((n, d) => n + M.triangleCount(d.mesh), 0), 12 * 3 + M.triangleCount(M.sphere(0.5, 8, 6)), 'hidden nodes are left out, nothing else is');
  assert.equal(out.children.filter((n) => n.light).length, 1);
  const after = nodeBounds(out);
  assert.ok(nearV(before.min, after.min, 1e-4) && nearV(before.max, after.max, 1e-4), 'the baked set stands where the original did');
  const blueMesh = drawn.find((n) => n.material === blue).mesh;
  assert.ok(near(blueMesh.colors[0], 128 / 255, 1e-3), 'a node tint is baked into the vertex colours');
  for (const d of drawn) assert.equal(M.windingErrors(d.mesh), 0);
  assert.equal(set.children.length, 5, 'the original is untouched');
});

test('mergeStatic with a cell size cuts each material into grid pieces without losing a triangle', () => {
  const mat = material(), set = group('set');
  for (let i = 0; i < 6; i++) node('p' + i, M.box(1, 1, 1), mat, { pos: [i * 5, 0, 0], parent: set });
  const whole = mergeStatic(set, 'w'), cut = mergeStatic(set, 'c', { cell: 5 });
  assert.equal(whole.children.filter((n) => n.mesh).length, 1);
  const pieces = cut.children.filter((n) => n.mesh);
  assert.ok(pieces.length >= 6 && pieces.every((n) => n.static));
  assert.equal(pieces.reduce((n, d) => n + M.triangleCount(d.mesh), 0), 72);
});

test('batchFigure: one skin per material, every vertex bound to its segment, joints left in place', () => {
  const mat = material(), other = material(), root = group('fig');
  const hips = node('hips', M.box(1, 1, 1), mat, { pos: [0, 1, 0], parent: root });
  const chest = node('chest', M.sphere(0.5, 8, 6), mat, { pos: [0, 1, 0], parent: hips });
  const hat = node('hat', M.cone(0.3, 0.4, 8), other, { pos: [0, 0.6, 0], parent: chest });
  const lone = node('lone', M.box(0.1, 0.1, 0.1), other, { parent: root }); root.remove(lone); // `other` now has one segment: left alone
  const boxTris = M.triangleCount(hips.mesh), ballTris = M.triangleCount(chest.mesh), boxVerts = M.vertexCount(hips.mesh);
  const before = nodeBounds(root);
  const skins = batchFigure(root);
  assert.equal(skins.length, 1);
  const skin = skins[0];
  assert.equal(M.triangleCount(skin.mesh), boxTris + ballTris);
  assert.deepEqual(skin.bones, [hips, chest]);
  assert.equal(hips.mesh, null); assert.equal(chest.mesh, null); assert.ok(hat.mesh, 'a material with one segment is not batched');
  assert.equal(skin.mesh.bones.length, M.vertexCount(skin.mesh));
  assert.ok(skin.mesh.bones.subarray(0, boxVerts).every((b) => b === 0) && skin.mesh.bones.subarray(boxVerts).every((b) => b === 1));
  const after = nodeBounds(root);
  assert.ok(nearV(before.min, after.min, 1e-4) && nearV(before.max, after.max, 1e-4), 'the batched figure occupies the same box');
  chest.setPos(0, 3, 0);
  assert.ok(nodeBounds(root).max[1] > after.max[1] + 1.5, 'moving a joint still moves its vertices');
});

test('batchFigure refuses more segments than the shader has bones, by name', () => {
  const mat = material({ name: 'body' }), root = group('centipede');
  for (let i = 0; i < 33; i++) node('s' + i, M.box(0.1, 0.1, 0.1), mat, { parent: root });
  assert.throws(() => batchFigure(root), /centipede.*33 segments.*body.*limit is 32/s);
});

test('nodeBounds writes into the box it is given', () => {
  const n = node('b', M.box(2, 2, 2), material(), { pos: [5, 0, 0] }), out = { min: [0, 0, 0], max: [0, 0, 0] };
  assert.equal(nodeBounds(n, out), out);
  assert.ok(nearV(out.min, [4, -1, -1]) && nearV(out.max, [6, 1, 1]));
});

test('frameBox: every corner of the box is inside the view, and at least one touches its edge', () => {
  for (const [yaw, pitch, aspect] of [[0, 12, 0.46], [35, 5, 1.95], [-120, 40, 1]]) {
    const cam = createCamera({ fov: 30 }), box = { min: [-1, 0, -2], max: [3, 2, 1] };
    frameBox(cam, box, { yaw, pitch, aspect, margin: 1 });
    cam.update(aspect);
    let worst = 0;
    for (let i = 0; i < 8; i++) {
      const p = [i & 1 ? box.max[0] : box.min[0], i & 2 ? box.max[1] : box.min[1], i & 4 ? box.max[2] : box.min[2]], m = cam.viewProj;
      const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15], x = (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w, y = (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w;
      assert.ok(w > 0 && Math.abs(x) <= 1.0001 && Math.abs(y) <= 1.0001, `corner ${i} at ${x.toFixed(3)}, ${y.toFixed(3)} (yaw ${yaw})`);
      worst = Math.max(worst, Math.abs(x), Math.abs(y));
    }
    assert.ok(worst > 0.98, `the box only reaches ${worst.toFixed(3)} of the way to the edge`);
  }
});

test('makeEnv parses colours, normalises the key direction, merges overrides, and names an unknown preset', () => {
  const env = makeEnv('night', { key: { dir: [0, 3, 4] }, fog: { density: 0.1 }, water: { shores: [[0, 0, 5, 1]] } });
  assert.ok(nearV(env.key.dir, [0, 0.6, 0.8])); assert.equal(env.fog.density, 0.1); assert.equal(env.fog.max, 0.9);
  assert.equal(env.sky.zenith.length, 3); assert.deepEqual(env.water.shores, [[0, 0, 5, 1]]);
  assert.throws(() => makeEnv('noon'), /unknown preset "noon".*day, sunset, night/);
});

test('lerpEnv: halfway between two environments, without touching either', () => {
  const a = makeEnv('day'), b = makeEnv('night'), keepA = JSON.stringify(a), keepB = JSON.stringify(b), out = makeEnv('day');
  lerpEnv(out, a, b, 0.5);
  assert.ok(near(out.ambient.amount, (a.ambient.amount + b.ambient.amount) / 2));
  assert.ok(nearV(out.sky.zenith, a.sky.zenith.map((x, i) => (x + b.sky.zenith[i]) / 2)));
  assert.ok(near(Math.hypot(...out.key.dir), 1), 'the key direction is still a unit vector');
  assert.equal(JSON.stringify(a), keepA); assert.equal(JSON.stringify(b), keepB);
  lerpEnv(out, a, b, 1); assert.ok(nearV(out.shadow.tint, b.shadow.tint));
});

test('instances: identity until set, count follows the highest index, capacity is enforced', () => {
  const inst = makeInstances(4);
  assert.equal(inst.count, 0); assert.deepEqual(Array.from(inst.data.subarray(0, 20)), [...m4.create(), 1, 1, 1, 1]);
  setInstance(inst, 2, m4.trs(1, 2, 3), '#ff0000');
  assert.equal(inst.count, 3); assert.deepEqual(Array.from(inst.data.subarray(52, 60)), [1, 2, 3, 1, 1, 0, 0, 1]);
  assert.throws(() => setInstance(inst, 4, m4.create()), /past the capacity 4/);
});

// ------------------------------------------------------------------------------------ sprites

test('sprites pack blended kinds far to near, additive kinds after them', () => {
  const s = createSprites(16);
  s.add({ kind: 'puff', pos: [0, 0, -2] }); s.add({ kind: 'glow', pos: [0, 0, -1] }); s.add({ kind: 'puff', pos: [0, 0, -9] });
  s.spawn({ kind: 'dot', pos: [0, 0, -5] }); s.spawn({ kind: 'sparkle', pos: [0, 0, -7] }); s.add({ kind: 'tex', pos: [0, 0, -3], uv: [0.5, 0, 0.25, 0.25] });
  const n = s.pack({ position: [0, 0, 0], target: [0, 0, -1] });
  assert.equal(n, 6);
  const row = (i) => [s.data[i * SPRITE_FLOATS + 2], s.data[i * SPRITE_FLOATS + 3]];
  assert.deepEqual([0, 1, 2, 3].map(row), [[-9, KIND.puff], [-5, KIND.dot], [-3, KIND.tex], [-2, KIND.puff]]);
  assert.deepEqual([4, 5].map((i) => row(i)[1]).sort(), [KIND.glow, KIND.sparkle]);
  assert.deepEqual(Array.from(s.data.subarray(2 * SPRITE_FLOATS + 12, 2 * SPRITE_FLOATS + 16)), [0.5, 0, 0.25, 0.25]);
  // from the other side the order reverses
  s.pack({ position: [0, 0, -20], target: [0, 0, -19] });
  assert.deepEqual([0, 1, 2, 3].map((i) => row(i)[0]), [-2, -3, -5, -9]);
});

test('sprites: particles die on time, a full system drops rather than grows, hidden ones are skipped', () => {
  const s = createSprites(3);
  for (let i = 0; i < 5; i++) s.spawn({ kind: 'dot', pos: [i, 0, 0], life: 0.5 });
  assert.equal(s.live, 3);
  const fixed = s.add({ kind: 'glow' }); fixed.visible = false;
  assert.equal(s.pack(), 3);
  s.update(0.3); assert.equal(s.live, 3); s.update(0.3); assert.equal(s.live, 0);
  assert.equal(s.pack(), 0);
  assert.throws(() => s.add({ kind: 'smoke' }), /unknown kind "smoke"/);
});
