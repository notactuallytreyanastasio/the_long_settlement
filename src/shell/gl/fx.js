// Ready-made atmosphere built from the engine's own parts: toon clouds, light shafts, lamp glow.
// Pure (no GL). These are conveniences; everything here can be rebuilt by hand from mesh.js/scene.js.

import { m4, rng, DEG } from './math.js';
import { sphere, lathe, merge, place, tint, cylinder, setOutline } from './mesh.js';
import { Node, material, makeInstances, setInstance } from './scene.js';

/**
 * One chunky cumulus: a row of overlapping balls with a flattened underside, about `width` wide,
 * centred on the origin. White; tint it or let the material's shadow tint colour the underside.
 */
function dome(r) {
  const prof = [[0, 0], [r * 0.93, 0]];
  for (let i = 1; i <= 7; i++) { const a = (i / 7) * Math.PI / 2; prof.push([i === 7 ? 0 : Math.cos(a) * r, Math.sin(a) * r * 0.92]); }
  return lathe(prof, 14, { crease: 180 });
}
export function cloudMesh(seed = 1, { width = 10, puffs = 5 } = {}) {
  const r = rng(seed * 977 + 13), parts = [];
  for (let i = 0; i < puffs; i++) {
    const u = puffs === 1 ? 0.5 : i / (puffs - 1), mid = Math.sin(u * Math.PI);
    const rad = width * (0.1 + 0.07 * mid + r() * 0.035);
    // every dome sits on the same flat base, so the underside is one straight line
    parts.push(place(dome(rad * (0.8 + 0.4 * mid)), (u - 0.5) * width * 0.8 + (r() - 0.5) * width * 0.04, 0, (r() - 0.5) * width * 0.08, 0, r() * 360, 0));
  }
  // and two or three smaller ones ride on top, off-centre
  for (let i = 0; i < 2 + (seed % 2); i++) { const rad = width * (0.07 + r() * 0.05); parts.push(place(sphere(rad, 12, 8), (r() - 0.5) * width * 0.42, width * (0.13 + r() * 0.06), (r() - 0.5) * width * 0.06)); }
  return setOutline(merge(parts), 0);
}

/**
 * A ring of drifting clouds as one instanced draw.
 * createClouds({ count = 14, seed = 1, radius = [220, 480], height = [16, 110], size = [0.7, 1.5],
 *                arc = [0, 360], color = '#ffffff', shadowTint = '#a9b8f0', speed = 0.25 })
 *   -> { node, update(time) }   add node to the scene root; update turns the whole ring slowly (degrees/second = speed)
 */
export function createClouds({ count = 14, seed = 1, radius = [220, 480], height = [16, 110], size = [0.7, 1.5], arc = [0, 360], color = '#ffffff', shadowTint = '#a9b8f0', speed = 0.25, fog = 0.3 } = {}) {
  const r = rng(seed);
  const mat = material({ name: 'cloud', outline: false, rim: 0, fog, shadowTint, receiveShadow: false, castShadow: false, bandEdge: 0.1, bandSoft: 0.01, lightUp: 0.75 });
  const n = new Node('clouds', { mesh: tint(cloudMesh(seed, { width: 30, puffs: 6 }), color), material: mat });
  n.castShadow = false;
  const inst = makeInstances(count);
  for (let i = 0; i < count; i++) {
    const a = (arc[0] + (i + r() * 0.8) / count * (arc[1] - arc[0])) * DEG, d = radius[0] + r() * (radius[1] - radius[0]);
    const s = (size[0] + r() * (size[1] - size[0])) * (d / 300);
    setInstance(inst, i, m4.trs(Math.sin(a) * d, height[0] + r() * r() * (height[1] - height[0]), Math.cos(a) * d, 0, a / DEG + 90 + (r() - 0.5) * 30, 0, s));
  }
  n.instances = inst;
  return { node: n, material: mat, update(time) { n.setRot(0, time * speed, 0); } };
}

/**
 * A light shaft: a cone from the origin along -Y (hanging down from a lamp) of the given length,
 * radius r0 at the lamp and r1 at the far end. Use with rayMaterial() and aim it with the node's
 * rotation. Brightest at the lamp, fading to nothing at the far end.
 */
export function rayMesh(length = 6, r0 = 0.15, r1 = 1.6, seg = 20) {
  const m = cylinder(r1, r0, length, seg, { caps: false, crease: 180 }); // stands on y = 0, r1 at the bottom; lathe v = 1 at the bottom
  return setOutline(place(m, 0, -length, 0), 0);
}
/** The additive material for rayMesh / any glow volume. opts: { power, near, far, steps } (see material()). */
export function rayMaterial(opts = {}) {
  return material({ kind: 'beam', name: 'ray', beam: { power: 1.2, near: 0.55, far: 0, steps: 0, ...opts }, outline: false });
}
