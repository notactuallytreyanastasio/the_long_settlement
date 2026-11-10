// Ready-made atmosphere built from the engine's own parts: toon clouds, light shafts, lamp glow.
// No GL here (painted clouds need a DOM canvas to paint on). These are conveniences; everything here can be rebuilt by hand from mesh.js/scene.js.

import { m4, rng, rgb, DEG } from './math.js';
import { sphere, lathe, merge, place, tint, cylinder, setOutline, fromArrays } from './mesh.js';
import { Node, material, texture, makeInstances, setInstance } from './scene.js';

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

// ---- painted clouds: four cumulus drawn on a canvas, hung in the sky as flat cards facing the middle of the set

const CLOUD_CELL = [512, 256];
function paintCloud(g, w, h, seed, col, shade) {
  const r = rng(seed * 131 + 7);
  const hex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0')).join('');
  const lit = hex(col), belly = hex(shade), mid = hex(col.map((v, i) => v * 0.55 + shade[i] * 0.45)), hi = hex(col.map((v) => v + (1 - v) * 0.45));
  const base = h * 0.8, cx = w * (0.46 + r() * 0.08), half = w * (0.33 + r() * 0.06);
  // the heap: bumps along a flat base, tallest a little off-centre, each with its own size so the top line is a tune and not a row of domes
  const bumps = []; const n = 5 + (seed % 2);
  const peak = 0.3 + r() * 0.4;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), near = 1 - Math.min(1, Math.abs(u - peak) / 0.62);
    const rad = h * (0.13 + 0.2 * near * near + r() * 0.05);
    bumps.push([cx + (u - 0.5) * 2 * (half - h * 0.12), base - rad * (0.55 + r() * 0.25) - h * 0.1 * near, rad]);
  }
  bumps.push([bumps[Math.round(peak * (n - 1))][0] + h * (r() - 0.5) * 0.2, base - h * (0.5 + r() * 0.08), h * (0.16 + r() * 0.04)]); // a crown riding the tallest
  const body = () => {
    g.beginPath();
    for (const b of bumps) { g.moveTo(b[0] + b[2], b[1]); g.arc(b[0], b[1], b[2], 0, 7); }
    g.rect(cx - half + h * 0.1, base - h * 0.2, (half - h * 0.1) * 2, h * 0.2);
    g.moveTo(cx - half + h * 0.1, base - h * 0.1); g.arc(cx - half + h * 0.1, base - h * 0.1, h * 0.1, 0, 7);
    g.moveTo(cx + half - h * 0.1, base - h * 0.1); g.arc(cx + half - h * 0.1, base - h * 0.1, h * 0.1, 0, 7);
  };
  body(); g.fillStyle = lit; g.fill();
  g.save(); body(); g.clip();
  // the belly: two flat tones under a scalloped line that echoes the bumps
  const scallop = (y, amp, fill) => {
    g.beginPath(); g.moveTo(0, h); g.lineTo(0, y);
    const steps = 5; for (let i = 0; i < steps; i++) { const x0 = cx - half + (i / steps) * half * 2, x1 = cx - half + ((i + 1) / steps) * half * 2; g.quadraticCurveTo((x0 + x1) / 2, y - amp * (0.7 + r() * 0.6), x1, y + (r() - 0.5) * amp * 0.3); }
    g.lineTo(w, y); g.lineTo(w, h); g.closePath(); g.fillStyle = fill; g.fill();
  };
  scallop(base - h * 0.2, h * 0.09, mid); scallop(base - h * 0.085, h * 0.05, belly);
  // light catching the upper left of every bump
  g.fillStyle = hi;
  // (only the three that stand highest)
  for (const b of bumps.slice().sort((p, q) => p[1] - p[2] - (q[1] - q[2])).slice(0, 3)) { g.beginPath(); g.arc(b[0], b[1], b[2], Math.PI * 0.95, Math.PI * 1.75); g.arc(b[0] + b[2] * 0.16, b[1] + b[2] * 0.2, b[2] * 0.98, Math.PI * 1.75, Math.PI * 0.95, true); g.closePath(); g.fill(); }
  // two or three curls: the hand of whoever drew it
  g.strokeStyle = mid; g.lineCap = 'round'; g.lineWidth = h * 0.028;
  for (let i = 0; i < 2 + (seed % 2); i++) {
    const b = bumps[(i * 2 + seed) % n], rr = b[2] * (0.42 + r() * 0.12), a0 = Math.PI * (0.1 + r() * 0.3);
    g.beginPath(); for (let k = 0; k <= 14; k++) { const a = a0 + (k / 14) * Math.PI * 1.45, q = rr * (1 - k / 22); g.lineTo(b[0] + b[2] * 0.12 + Math.cos(a) * q, b[1] + b[2] * 0.3 + Math.sin(a) * q * 0.8); } g.stroke();
  }
  g.restore();
  // a wisp let go at one end, and a streak under the other
  const side = r() < 0.5 ? -1 : 1;
  g.fillStyle = lit; g.beginPath(); g.ellipse(cx + side * (half + h * 0.2), base - h * 0.13, h * 0.13, h * 0.075, 0, 0, 7); g.fill();
  g.fillStyle = mid; g.beginPath(); g.ellipse(cx + side * (half + h * 0.2), base - h * 0.105, h * 0.1, h * 0.04, 0, 0, Math.PI); g.fill();
  g.fillStyle = lit; g.beginPath(); g.ellipse(cx - side * (half + h * 0.02), base - h * 0.03, h * 0.3, h * 0.035, 0, 0, 7); g.fill();
}

/**
 * A ring of drifting clouds, one draw call.
 * createClouds({ count = 14, seed = 1, radius = [220, 480], height = [16, 110], size = [0.7, 1.5],
 *                arc = [0, 360], color = '#ffffff', shadowTint = '#a9b8f0', speed = 0.25, fog = 0.3, style = 'painted' })
 *   -> { node, material, update(time) }
 * Add node to the scene root; update(time) turns the whole ring slowly (degrees/second = speed).
 * radius is the distance band from the origin, height the altitude band, arc the compass range in
 * degrees (0 = +Z, 180 = -Z: a portrait camera sees only about 20 degrees of it, so aim the arc).
 *
 * style 'painted' (the default; needs a DOM): four cumulus painted once on a canvas in `color`, with the
 * belly in `color` seen through `shadowTint`, hung as flat cards that face the origin. Two triangles a
 * cloud; they are pictures, so they do not take the scene's light: repaint (call again) if the light changes.
 * style 'solid': the old lit meshes of merged domes (cloudMesh), about 540 triangles a cloud.
 */
export function createClouds({ count = 14, seed = 1, radius = [220, 480], height = [16, 110], size = [0.7, 1.5], arc = [0, 360], color = '#ffffff', shadowTint = '#a9b8f0', speed = 0.25, fog = 0.3, style = 'painted' } = {}) {
  const r = rng(seed);
  if (style === 'solid' || typeof document === 'undefined') {
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
  if (style !== 'painted') throw new Error(`createClouds: unknown style ${JSON.stringify(style)} (have 'painted', 'solid')`);
  const [cw, ch] = CLOUD_CELL, canvas = document.createElement('canvas'); canvas.width = cw * 2; canvas.height = ch * 2;
  const g = canvas.getContext('2d'), col = rgb(color), st = rgb(shadowTint), shade = [col[0] * st[0], col[1] * st[1], col[2] * st[2]];
  for (let k = 0; k < 4; k++) { g.save(); g.translate((k % 2) * cw, (k >> 1) * ch); g.beginPath(); g.rect(0, 0, cw, ch); g.clip(); paintCloud(g, cw, ch, seed * 4 + k, col, shade); g.restore(); }
  const mat = material({ name: 'cloud', map: texture(canvas), texMode: 'blend', emissive: 1, outline: false, rim: 0, fog, receiveShadow: false, castShadow: false, doubleSided: true });
  const list = [];
  for (let i = 0; i < count; i++) {
    const a = (arc[0] + (i + r() * 0.8) / count * (arc[1] - arc[0])) * DEG, d = radius[0] + r() * (radius[1] - radius[0]);
    const s = (size[0] + r() * (size[1] - size[0])) * (d / 300);
    list.push({ a, d, y: height[0] + r() * r() * (height[1] - height[0]), w: 46 * s, k: i % 4, flip: r() < 0.5 });
  }
  list.sort((p, q) => q.d - p.d); // far ones first, so a near cloud's soft edge lies over a far one
  const pos = [], uv = [], idx = [];
  list.forEach((c, i) => {
    const sx = Math.sin(c.a), cz = Math.cos(c.a), px = sx * c.d, pz = cz * c.d, tx = cz, tz = -sx, hw = c.w / 2, hh = c.w / 2; // the card is 2:1; its base sits 20% up
    const y0 = c.y - hh * 0.2, y1 = y0 + hh;
    pos.push(px - tx * hw, y1, pz - tz * hw, px + tx * hw, y1, pz + tz * hw, px - tx * hw, y0, pz - tz * hw, px + tx * hw, y0, pz + tz * hw);
    const u0 = (c.k % 2) * 0.5, v0 = (c.k >> 1) * 0.5, ua = c.flip ? u0 + 0.5 : u0, ub = c.flip ? u0 : u0 + 0.5;
    uv.push(ua, v0, ub, v0, ua, v0 + 0.5, ub, v0 + 0.5);
    idx.push(i * 4, i * 4 + 2, i * 4 + 3, i * 4, i * 4 + 3, i * 4 + 1);
  });
  const n = new Node('clouds', { mesh: setOutline(fromArrays(pos, idx, uv, 180), 0), material: mat });
  n.castShadow = false; n.cull = false;
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
