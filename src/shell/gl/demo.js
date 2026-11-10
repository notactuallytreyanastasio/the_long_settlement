// The engine's test scene: a small island with a lighthouse, a cottage, a jetty with a lantern,
// a boat, and one chibi figure holding a lamp. It exists to prove the shading and to be read as
// an example of how to build things; nothing in the game imports it.
//
//   buildDemo(lightName) -> { scene, camera, update(time, dt), setShot(n), shots }

import {
  m4, rng, DEG,
  sphere, ellipsoid, superellipsoid, blob, cylinder, cone, lathe, limb, torus, box, roundedBox, extrude, tube, curve, spherePatch, disc,
  merge, tint, paint, place, deform, setGlow, setOutline, mirrorX, gradientY, clone, scale as scaleMesh,
  Node, node, group, material, makeEnv, createScene, createCamera, mergeStatic, makeInstances, setInstance, makeLight,
  createRig, idle, blink, createSpring, springs, aimAxis, squash,
  createSprites, createClouds, rayMesh, rayMaterial, createAtlas,
} from './index.js';

const C = {
  sand: '#f8e3a3', sandWet: '#e8c886', grass: '#86de57', grass2: '#a6ec6a', grassDark: '#4dbb5c',
  cream: '#fff4d8', white: '#ffffff', red: '#f4573f', roof: '#ff8b3d', wood: '#c98448', woodDark: '#96592f',
  navy: '#2a3a66', glass: '#ffe27a', rock: '#c2bce0', rock2: '#a9a3d0', leaf: '#4fc463', leaf2: '#86e06a',
  skin: '#ffd8b0', hair: '#b8542a', coat: '#ffc83a', coatDark: '#f0a62a', scarf: '#f4573f', boot: '#6a4130', gold: '#ffd24a',
};

// ------------------------------------------------------------------------------------ set pieces

function islandMeshes() {
  const wob = (p) => { const a = Math.atan2(p[2], p[0]); const k = 1 + 0.07 * Math.sin(a * 3 + 1) + 0.045 * Math.sin(a * 5 + 2.2) + 0.025 * Math.sin(a * 8); p[0] *= k; p[2] *= k; };
  const sand = deform(lathe([[0, -1.2], [5.0, -1.2], [4.95, -0.2], [4.5, 0.1], [4.0, 0.26], [3.7, 0.4], [0, 0.5]], 56, { crease: 180 }), wob);
  paint(sand, (x, y) => (y < 0.02 ? C.sandWet : C.sand));
  const wob2 = (p) => { const a = Math.atan2(p[2], p[0]); const k = 1 + 0.07 * Math.sin(a * 3 + 1) + 0.045 * Math.sin(a * 5 + 2.2) + 0.05 * Math.sin(a * 9 + 0.5); p[0] *= k; p[2] *= k; };
  const grass = deform(lathe([[3.55, 0.2], [3.78, 0.42], [3.74, 0.7], [3.45, 0.86], [2.6, 0.9], [0, 0.9]], 56, { crease: 180 }), wob2);
  paint(grass, (x, y, z) => (y < 0.6 ? C.grassDark : Math.sin(x * 1.7 + 0.5) * Math.sin(z * 1.9) > 0.35 ? C.grass2 : C.grass));
  return [sand, grass];
}

function lighthouse() {
  const parts = [], R = (y) => 0.95 - 0.37 * (y / 5.0), seg = 28;
  parts.push(tint(cylinder(1.28, 1.16, 0.36, seg), '#ded6ee'));
  const stops = [0.36, 1.3, 2.2, 3.1, 4.0, 4.98];
  for (let i = 0; i < stops.length - 1; i++) parts.push(tint(lathe([[R(stops[i]), stops[i]], [R(stops[i + 1]), stops[i + 1]]], seg, { crease: 180 }), i % 2 ? C.red : C.cream));
  parts.push(tint(lathe([[R(4.98), 4.96], [0.98, 5.02], [1.0, 5.14], [0.92, 5.2], [0, 5.2]], seg), C.navy));
  parts.push(tint(place(torus(0.93, 0.035, seg, 6), 0, 5.52, 0), C.navy));
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; parts.push(tint(place(cylinder(0.028, 0.028, 0.34, 6), Math.cos(a) * 0.93, 5.19, Math.sin(a) * 0.93), C.navy)); }
  parts.push(setGlow(tint(place(cylinder(0.5, 0.5, 0.78, 16, { caps: false }), 0, 5.2, 0), C.glass), 1));
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; parts.push(tint(place(box(0.06, 0.8, 0.06), Math.cos(a) * 0.5, 5.59, Math.sin(a) * 0.5, 0, -a / DEG, 0), C.navy)); }
  parts.push(tint(lathe([[0, 5.94], [0.74, 5.94], [0.7, 6.03], [0.14, 6.68], [0, 6.7]], seg), C.red));
  parts.push(tint(place(sphere(0.1, 10, 8), 0, 6.78, 0), C.gold));
  // door and windows, turned to face the viewer
  const arch = []; for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; arch.push([Math.cos(a) * 0.26, 0.5 + Math.sin(a) * 0.26]); }
  const yaw = 22;
  const door = tint(extrude([[0.26, 0], ...arch, [-0.26, 0]], 0.14, { bevel: 0.03 }), C.woodDark);
  parts.push(place(place(door, 0, 0.36, R(0.6) - 0.01), 0, 0, 0, 0, yaw, 0));
  parts.push(place(place(tint(sphere(0.045, 8, 6), C.gold), 0.13, 0.72, R(0.6) + 0.07), 0, 0, 0, 0, yaw, 0));
  for (const [y, ya] of [[2.55, yaw + 8], [3.9, yaw - 30]]) {
    const frame = tint(roundedBox(0.34, 0.46, 0.12, 0.05), C.navy), pane = setGlow(tint(roundedBox(0.2, 0.32, 0.14, 0.04), C.glass), 0.85);
    parts.push(place(place(merge(frame, pane), 0, y, R(y) - 0.02), 0, 0, 0, 0, ya, 0));
  }
  return merge(parts);
}

function cottage() {
  const parts = [];
  parts.push(tint(place(roundedBox(1.5, 1.0, 1.2, 0.14, 3), 0, 0.5, 0), C.cream));
  parts.push(tint(place(extrude([[-1.0, 0], [1.0, 0], [0, 0.82]], 1.5, { bevel: 0.07 }), 0, 0.95, 0), C.roof));
  parts.push(tint(place(roundedBox(0.26, 0.62, 0.26, 0.04), 0.45, 1.5, -0.25), C.cream));
  parts.push(tint(place(roundedBox(0.34, 0.1, 0.34, 0.03), 0.45, 1.82, -0.25), C.red));
  parts.push(tint(place(roundedBox(0.34, 0.6, 0.1, 0.05), 0.22, 0.3, 0.61), C.woodDark));
  parts.push(tint(place(sphere(0.035, 8, 6), 0.33, 0.32, 0.67), C.gold));
  const win = merge(tint(ellipsoid(0.2, 0.2, 0.05, 14, 8), C.navy), setGlow(tint(place(ellipsoid(0.14, 0.14, 0.05, 14, 8), 0, 0, 0.02), C.glass), 0.9));
  parts.push(place(clone(win), -0.38, 0.58, 0.6));
  parts.push(place(clone(win), 0.75, 0.58, 0.1, 0, 90, 0));
  return merge(parts);
}

function tree(seed) {
  const r = rng(seed);
  const trunk = tint(tube(curve([[0, 0, 0], [0.1, 0.5, 0.02], [-0.04, 1.0, 0.04], [0.06, 1.55, 0]], 8), (t) => 0.17 - 0.08 * t, 8), C.wood);
  const crown = [];
  crown.push(tint(place(blob({ rx: 0.85, ry: 0.72, rz: 0.8, lumps: 0.5, seed, flatBottom: 0.3 }), 0.05, 1.95, 0), C.leaf));
  crown.push(tint(place(blob({ rx: 0.55, ry: 0.48, rz: 0.52, lumps: 0.4, seed: seed + 3, flatBottom: 0.3 }), -0.55 + r() * 0.1, 1.6, 0.25), C.leaf));
  crown.push(tint(place(blob({ rx: 0.5, ry: 0.45, rz: 0.5, lumps: 0.4, seed: seed + 5, flatBottom: 0.3 }), 0.6, 1.72, -0.15), C.leaf));
  crown.push(tint(place(blob({ rx: 0.42, ry: 0.36, rz: 0.4, lumps: 0.3, seed: seed + 8 }), 0.12, 2.42, 0.12), C.leaf2));
  return merge(trunk, crown);
}

const rock = (seed, s = 1) => gradientY(scaleMesh(blob({ rx: 0.6, ry: 0.5, rz: 0.55, lumps: 0.9, seed, flatBottom: 0.5, seg: 12, rings: 8 }), s), C.rock2, C.rock);
const bush = (seed) => tint(blob({ rx: 0.42, ry: 0.32, rz: 0.4, lumps: 0.5, seed, flatBottom: 0.6, seg: 14, rings: 9 }), C.grassDark);

function crate() {
  return merge(tint(roundedBox(0.46, 0.46, 0.46, 0.04, 2), C.wood), tint(roundedBox(0.5, 0.09, 0.5, 0.03, 2), C.woodDark), tint(place(roundedBox(0.5, 0.09, 0.5, 0.03, 2), 0, 0, 0, 0, 0, 90), C.woodDark));
}
function barrel() {
  const b = tint(lathe([[0, 0], [0.19, 0], [0.25, 0.28], [0.19, 0.56], [0, 0.56]], 16, { crease: 50 }), C.wood);
  return merge(b, tint(place(torus(0.225, 0.022, 16, 6), 0, 0.14, 0), C.navy), tint(place(torus(0.225, 0.022, 16, 6), 0, 0.42, 0), C.navy));
}

function lanternMesh(s = 1) {
  // origin at the top ring; the body hangs below it
  const parts = [];
  parts.push(tint(place(torus(0.035, 0.012, 10, 5), 0, 0, 0, 90, 0, 0), C.navy));
  parts.push(tint(place(cone(0.085, 0.07, 10), 0, -0.1, 0), C.navy));
  parts.push(setGlow(tint(place(cylinder(0.06, 0.07, 0.13, 10, { caps: false }), 0, -0.23, 0), '#ffe9a0'), 1));
  parts.push(tint(place(cylinder(0.08, 0.08, 0.03, 10), 0, -0.26, 0), C.navy));
  return scaleMesh(merge(parts), s);
}

function jetty() {
  const parts = [], r = rng(7);
  for (let i = 0; i < 12; i++) parts.push(tint(place(roundedBox(1.0, 0.07, 0.25, 0.025, 2), (r() - 0.5) * 0.05, 0.3, 4.0 + i * 0.29, 0, (r() - 0.5) * 5, 0), i % 3 === 1 ? C.woodDark : C.wood));
  for (const z of [4.3, 5.7, 7.1]) for (const x of [-0.52, 0.52]) {
    parts.push(tint(place(cylinder(0.075, 0.075, 1.2, 8), x, -0.7, z), C.woodDark));
    parts.push(tint(place(sphere(0.085, 8, 6), x, 0.5, z), C.woodDark));
  }
  // lantern post at the far corner
  parts.push(tint(place(cylinder(0.045, 0.04, 1.5, 8), 0.52, 0.5, 7.1), C.woodDark));
  parts.push(tint(place(tube(curve([[0.52, 1.98, 7.1], [0.5, 2.1, 7.1], [0.36, 2.12, 7.1], [0.25, 2.04, 7.1]], 6), 0.025, 6), 0, 0, 0), C.navy));
  parts.push(place(lanternMesh(1.5), 0.25, 2.0, 7.1));
  return merge(parts);
}
const JETTY_LAMP = [0.25, 1.66, 7.1];

function boat() {
  const hull = deform(superellipsoid(0.5, 0.36, 1.05, 0.9, 0.75, 20, 12), (p) => { if (p[1] > 0.02) p[1] = 0.02 + (p[1] - 0.02) * 0.08; const t = Math.abs(p[2]) / 1.05; p[1] += t * t * 0.14; }, 50);
  paint(hull, (x, y) => (y > -0.07 ? C.cream : C.red));
  const deck = tint(place(scaleMesh(disc(1, 16), 0.4, 1, 0.9), 0, 0.06, 0), C.wood);
  const mast = tint(place(cylinder(0.035, 0.028, 1.45, 8), 0, 0, 0.12), C.woodDark);
  const sail = tint(place(extrude([[0, 0], [0.8, 0.1], [0.02, 1.05]], 0.03), 0.02, 0.3, 0.1, 0, -90, 0), '#fff8e8');
  const flag = tint(place(extrude([[0, 0], [0.26, 0.07], [0, 0.14]], 0.02), 0, 1.36, 0.12, 0, -90, 0), C.red);
  return merge(hull, deck, mast, sail, flag);
}

// ------------------------------------------------------------------------------------ the figure

function faceAtlas() {
  const A = createAtlas(512);
  const ink = '#2a2140';
  const eye = (open) => (g, w, h) => {
    const cx = w * 0.5, cy = h * 0.6, rx = w * 0.36, ry = h * 0.3;
    // brow
    g.strokeStyle = '#8a3c1e'; g.lineWidth = w * 0.09; g.lineCap = 'round';
    g.beginPath(); g.moveTo(w * 0.2, h * 0.13); g.quadraticCurveTo(w * 0.5, h * 0.04, w * 0.82, h * 0.12); g.stroke();
    if (open < 0.15) { // shut: one happy arc
      g.strokeStyle = ink; g.lineWidth = w * 0.1;
      g.beginPath(); g.moveTo(cx - rx, cy + ry * 0.1); g.quadraticCurveTo(cx, cy + ry * 0.55, cx + rx, cy + ry * 0.1); g.stroke();
      return;
    }
    const ey = ry * open;
    g.fillStyle = ink; g.beginPath(); g.ellipse(cx, cy, rx, ey, 0, 0, 7); g.fill();
    const grad = g.createLinearGradient(0, cy - ey, 0, cy + ey); grad.addColorStop(0, '#3a2a55'); grad.addColorStop(0.55, '#7a4a2a'); grad.addColorStop(1, '#e79a4a');
    g.fillStyle = grad; g.beginPath(); g.ellipse(cx, cy + ey * 0.06, rx * 0.8, ey * 0.86, 0, 0, 7); g.fill();
    g.fillStyle = '#1c1530'; g.beginPath(); g.ellipse(cx, cy - ey * 0.05, rx * 0.42, ey * 0.5, 0, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(cx - rx * 0.36, cy - ey * 0.42, rx * 0.3, Math.min(ey * 0.3, ry * 0.26), -0.3, 0, 7); g.fill();
    g.beginPath(); g.ellipse(cx + rx * 0.38, cy + ey * 0.45, rx * 0.14, Math.min(ey * 0.14, ry * 0.12), 0, 0, 7); g.fill();
    // upper lash
    g.strokeStyle = ink; g.lineWidth = w * 0.085; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx - rx * 1.12, cy - ey * 0.35); g.quadraticCurveTo(cx - rx * 0.4, cy - ey * 1.22, cx + rx * 0.5, cy - ey * 1.02); g.quadraticCurveTo(cx + rx * 1.0, cy - ey * 0.8, cx + rx * 1.22, cy - ey * 0.5); g.stroke();
  };
  A.add('eye-open', 96, 136, eye(1)); A.add('eye-half', 96, 136, eye(0.5)); A.add('eye-shut', 96, 136, eye(0));
  A.add('mouth-smile', 96, 64, (g, w, h) => {
    g.strokeStyle = ink; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(w * 0.22, h * 0.35); g.quadraticCurveTo(w * 0.5, h * 0.85, w * 0.78, h * 0.35); g.stroke();
  });
  A.add('mouth-open', 96, 64, (g, w, h) => {
    g.fillStyle = '#7a2a35'; g.strokeStyle = ink; g.lineWidth = 6; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(w * 0.2, h * 0.25); g.quadraticCurveTo(w * 0.5, h * 0.36, w * 0.8, h * 0.25); g.quadraticCurveTo(w * 0.72, h * 0.95, w * 0.5, h * 0.92); g.quadraticCurveTo(w * 0.28, h * 0.95, w * 0.2, h * 0.25); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#ff8f8f'; g.beginPath(); g.ellipse(w * 0.5, h * 0.78, w * 0.16, h * 0.12, 0, 0, 7); g.fill();
  });
  A.add('blush', 64, 40, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,120,110,0.75)'); gr.addColorStop(0.7, 'rgba(255,120,110,0.55)'); gr.addColorStop(1, 'rgba(255,120,110,0)');
    g.fillStyle = gr; g.save(); g.translate(w / 2, h / 2); g.scale(1, h / w); g.beginPath(); g.arc(0, 0, w / 2, 0, 7); g.fill(); g.restore();
  });
  return A;
}

/** A lamplighter child, about 1.1 units tall, facing +Z. "L" is the figure's own left (+X). */
function buildKid(mat, faceMat, atlas) {
  const HR = [0.26, 0.225, 0.24]; // head radii
  const root = group('kid');
  const hips = group('hips', { pos: [0, 0.27, 0], parent: root });

  // legs: one stubby segment and a big boot each
  const legMesh = merge(tint(limb(0.07, 0.062, 0.12), C.navy), tint(place(blob({ rx: 0.085, ry: 0.07, rz: 0.125, flatBottom: 0.5, seg: 12, rings: 8 }), 0, -0.2, 0.035), C.boot));
  const legL = node('legL', legMesh, mat, { pos: [0.085, 0.0, 0], parent: hips });
  const legR = node('legR', mirrorX(legMesh), mat, { pos: [-0.085, 0.0, 0], parent: hips });

  // torso: a pear-shaped coat with a flared hem, plus the scarf ring
  const coat = merge(
    tint(place(blob({ rx: 0.165, ry: 0.2, rz: 0.15, pear: 0.5, seg: 18, rings: 12 }), 0, 0.13, 0), C.coat),
    tint(lathe([[0.2, -0.06], [0.215, -0.03], [0.17, 0.1]], 18, { crease: 180 }), C.coat),
    tint(place(sphere(0.022, 6, 5), 0, 0.17, 0.148), C.woodDark), tint(place(sphere(0.022, 6, 5), 0, 0.08, 0.158), C.woodDark),
    tint(place(scaleMesh(torus(0.105, 0.05, 16, 8), 1, 1.0, 1), 0, 0.29, 0.0), C.scarf),
  );
  const chest = node('chest', coat, mat, { pos: [0, 0.0, 0], parent: hips });

  // head: skin ball, hair cap and fringe, ears, merged into one mesh
  const skull = tint(blob({ rx: HR[0], ry: HR[1], rz: HR[2], pear: 0.12, seg: 24, rings: 16 }), C.skin);
  // the cap is a slightly larger ball whose lower part is squeezed up to a hairline: high over the
  // face, down to the nape at the back
  const cap = tint(place(deform(sphere(1, 22, 14), (p) => {
    const f = Math.max(0, Math.min(1, (p[2] + 0.35) / 0.65)), line = -1.0 + 1.5 * f * f * (3 - 2 * f);
    if (p[1] < line) p[1] = line + (p[1] - line) * 0.08;
  }), 0, 0.012, -0.022, 0, 0, 0, HR[0] * 1.07, HR[1] * 1.09, HR[2] * 1.08), C.hair);
  const lock = (pts, r0) => tint(tube(curve(pts, 6), (t) => r0 * (1 - t * 0.85) + 0.004, 7, { squash: 0.6 }), C.hair);
  const fringe = [
    lock([[-0.1, 0.19, 0.15], [-0.17, 0.12, 0.21], [-0.215, 0.04, 0.17]], 0.075),
    lock([[0.0, 0.2, 0.17], [-0.05, 0.13, 0.245], [-0.1, 0.07, 0.23]], 0.075),
    lock([[0.1, 0.19, 0.15], [0.1, 0.13, 0.235], [0.045, 0.085, 0.235]], 0.07),
    lock([[0.16, 0.16, 0.1], [0.215, 0.08, 0.16], [0.225, 0.0, 0.13]], 0.07),
  ];
  const ears = [tint(place(ellipsoid(0.045, 0.06, 0.035, 8, 6), 0.252, -0.03, 0.0), C.skin), tint(place(ellipsoid(0.045, 0.06, 0.035, 8, 6), -0.252, -0.03, 0.0), C.skin)];
  const headMesh = place(merge(skull, cap, fringe, ears), 0, 0.2, 0);
  const head = node('head', headMesh, mat, { pos: [0, 0.33, 0], parent: chest });

  // face decals: curved patches on the head ellipsoid, textured from the atlas
  const facePivot = group('face', { pos: [0, 0.2, 0], parent: head });
  const eyeMesh = spherePatch(HR[0], HR[1], HR[2], { yaw: 0, pitch: -3, width: 30, height: 50, lift: 0.045 });
  const eyeL = node('eyeL', eyeMesh, faceMat, { parent: facePivot, rot: [0, 23, 0] });
  const eyeR = node('eyeR', eyeMesh, faceMat, { parent: facePivot, rot: [0, -23, 0] });
  const mouth = node('mouth', spherePatch(HR[0], HR[1], HR[2], { yaw: 0, pitch: -33, width: 26, height: 20, lift: 0.04 }), faceMat, { parent: facePivot });
  const blushMesh = spherePatch(HR[0], HR[1], HR[2], { yaw: 0, pitch: -27, width: 20, height: 13, lift: 0.04 });
  const blushL = node('blushL', blushMesh, faceMat, { parent: facePivot, rot: [0, 44, 0] });
  const blushR = node('blushR', blushMesh, faceMat, { parent: facePivot, rot: [0, -44, 0] });
  blushL.uvRect.set(atlas.rect('blush')); blushR.uvRect.set(atlas.rect('blush'));
  mouth.uvRect.set(atlas.rect('mouth-smile'));

  // springy bits: a top tuft, a ponytail, the scarf tail
  const tuft = node('tuft', tint(tube(curve([[0, 0, 0], [0.02, 0.09, 0.0], [0.07, 0.15, 0.02], [0.13, 0.15, 0.03]], 6), (t) => 0.035 * (1 - t * 0.8) + 0.004, 6), C.hair), mat, { pos: [0.02, 0.43, 0.0], parent: head });
  const tail = node('tail', tint(merge(place(sphere(0.05, 8, 6), 0, 0, 0), tube(curve([[0, 0, 0], [0, -0.1, -0.06], [0, -0.22, -0.07], [0, -0.3, -0.03]], 6), (t) => 0.035 + 0.05 * Math.sin(t * 2.6) * (1 - t * 0.5), 8)), C.hair), mat, { pos: [0, 0.3, -0.25], parent: head });
  const scarfTail = node('scarfTail', tint(tube(curve([[0, 0, 0], [0.01, -0.1, -0.03], [0.0, -0.22, -0.02], [0.02, -0.33, 0.0]], 6), (t) => 0.05 - 0.012 * t, 7, { squash: 0.35 }), C.scarf), mat, { pos: [-0.09, 0.3, -0.1], rot: [20, 0, 0], parent: chest });

  // arms: two segments and a mitten
  const upper = tint(limb(0.058, 0.052, 0.11), C.coat);
  const fore = merge(tint(limb(0.052, 0.05, 0.09), C.coat), tint(place(lathe([[0.058, -0.075], [0.062, -0.1], [0.05, -0.11]], 10, { crease: 180 }), 0, 0, 0), C.coatDark), tint(place(blob({ rx: 0.058, ry: 0.065, rz: 0.058, seg: 10, rings: 8 }), 0, -0.145, 0), C.skin));
  const armL = node('armL', upper, mat, { pos: [0.16, 0.25, 0], parent: chest });
  const foreL = node('foreL', fore, mat, { pos: [0, -0.11, 0], parent: armL });
  const armR = node('armR', upper, mat, { pos: [-0.16, 0.25, 0], parent: chest });
  const foreR = node('foreR', fore, mat, { pos: [0, -0.11, 0], parent: armR });

  // the lamp, hanging from the left mitten
  const lamp = node('lamp', lanternMesh(1.25), mat, { pos: [0, -0.2, 0.0], parent: foreL });
  const lampLight = new Node('lampLight', { pos: [0, -0.26, 0], parent: lamp, light: makeLight({ color: '#ffb04a', radius: 3.6, intensity: 1 }) });

  const rig = createRig(root);
  const bounce = springs([
    createSpring(tuft, { axis: [0.4, 1, 0], length: 0.16, stiffness: 120, damping: 7, limit: 40 }),
    createSpring(tail, { axis: [0, -1, -0.2], length: 0.3, stiffness: 55, damping: 6, gravity: 2, limit: 50 }),
    createSpring(scarfTail, { axis: [0, -1, 0], length: 0.33, stiffness: 40, damping: 5, gravity: 2, limit: 60, wind: [0, 0, 0] }),
  ]);
  return { root, rig, bounce, eyeL, eyeR, mouth, lamp, lampLight, hips, head, legL, legR, legMesh, chest, armL, armR, foreL, foreR };
}

// weight on the figure's right leg, lamp held up and out, free hand on the hip
const POSE_STAND = {
  hips: { r: [0, -12, 5], p: [0.02, -0.006, 0] }, chest: [2, 8, -6], head: [-4, 14, 7],
  legL: [-6, 10, 16], legR: [2, -6, -7],
  armL: [-52, 0, 38], foreL: [-48, 0, 0], armR: [8, 0, -34], foreR: [-58, 30, 0],
};
// free arm up for a wave, leaning into it
const POSE_WAVE = {
  hips: { r: [0, -4, -3], p: [-0.01, 0.01, 0] }, chest: [-3, -6, 5], head: [-8, -8, -9],
  armR: [0, 0, -152], foreR: [0, 0, 24],
};

// ------------------------------------------------------------------------------------ scene

export const LIGHTS = ['day', 'sunset', 'night'];

export function buildDemo(lightName = 'sunset') {
  if (!LIGHTS.includes(lightName)) throw new Error(`demo: unknown light "${lightName}" (have ${LIGHTS.join(', ')})`);
  const lamps = { day: 0.0, sunset: 0.95, night: 1.25 }[lightName];
  const env = makeEnv(lightName, {
    shadow: { center: [0, 2, 2], radius: 10 },
    water: { shores: [[0, 0, 4.85, 1.0], [4.9, 3.6, 0.55, 0.6], [-5.6, 2.2, 0.75, 0.6], [5.6, -3.2, 0.9, 0.7], [-3.4, 6.0, 0.62, 0.5], [0, 5.6, 0.62, 0.45], [0, 7.0, 0.62, 0.45]] },
    points: [
      { pos: JETTY_LAMP, color: '#ffab45', radius: 5.0, intensity: lamps * 0.6 },
      { pos: [-0.9, 6.5, -1.0], color: '#ffd77a', radius: 3.2, intensity: lamps * 0.6 },
      { pos: [1.2, 1.5, 0.5], color: '#ffb85a', radius: 2.2, intensity: lamps * 0.6 },
    ],
  });
  const scene = createScene(env);
  const mat = material({ name: 'base' });
  const groundMat = material({ name: 'ground', rim: 0 }); // flat ground would catch the rim light all over
  const figMat = material({ name: 'figure', bandEdge: 0.0, outline: { width: 2.6, self: 0.7 } });
  const atlas = faceAtlas();
  const faceMat = material({ name: 'face', map: atlas.texture, texMode: 'blend', outline: false, rim: 0 });

  // everything that never moves is one mesh
  const set = group('set');
  for (const m of islandMeshes()) set.add(node('island', m, groundMat));
  set.add(node('lighthouse', lighthouse(), mat, { pos: [-0.9, 0.86, -1.0] }));
  set.add(node('cottage', cottage(), mat, { pos: [1.75, 0.88, -0.35], rot: [0, -24, 0] }));
  set.add(node('tree1', tree(3), mat, { pos: [2.75, 0.86, 1.2], scale: 1.0 }));
  set.add(node('tree2', tree(9), mat, { pos: [-2.85, 0.86, 0.5], rot: [0, 140, 0], scale: 0.85 }));
  set.add(node('bush1', bush(2), mat, { pos: [-1.9, 0.88, 1.7] }), node('bush2', bush(5), mat, { pos: [0.75, 0.88, -1.6], scale: 1.2 }), node('bush3', bush(6), mat, { pos: [2.6, 0.88, -1.9] }));
  set.add(node('rock1', rock(1, 1.0), mat, { pos: [4.9, -0.05, 3.6] }), node('rock2', rock(4, 1.35), mat, { pos: [-5.6, -0.05, 2.2] }), node('rock3', rock(6, 1.6), mat, { pos: [5.6, -0.05, -3.2] }), node('rock4', rock(8, 0.5), mat, { pos: [-1.6, 0.4, 3.1] }));
  set.add(node('jetty', jetty(), mat));
  set.add(node('crate1', crate(), mat, { pos: [-0.75, 0.52, 3.55], rot: [0, 18, 0] }), node('crate2', crate(), mat, { pos: [-0.68, 0.97, 3.5], rot: [0, -12, 0], scale: 0.8 }), node('barrel', barrel(), mat, { pos: [-1.3, 0.34, 3.3] }));
  for (const [x, z, s] of [[0.5, 3.0, 0.3], [0.35, 2.45, 0.26], [0.55, 3.5, 0.28]]) set.add(node('step', tint(scaleMesh(blob({ lumps: 0.3, seed: x * 10, seg: 10, rings: 6 }), s, 0.06, s * 0.8), '#e6dcc0'), mat, { pos: [x, z > 3.2 ? 0.4 : z > 2.7 ? 0.62 : 0.9, z] }));
  scene.root.add(mergeStatic(set, 'set'));

  // grass tufts: one mesh, instanced
  const tuftMesh = merge([0, 1, 2].map((i) => tint(place(cone(0.035, 0.2 + i * 0.05, 5), (i - 1) * 0.05, 0, 0, (i - 1) * 6, i * 50, (1 - i) * 16), C.grassDark)));
  const tufts = node('tufts', tuftMesh, mat); tufts.castShadow = false;
  const r = rng(11); tufts.instances = makeInstances(46);
  for (let i = 0; i < 46; i++) { const a = r() * 6.283, d = 0.6 + Math.sqrt(r()) * 2.6; setInstance(tufts.instances, i, m4.trs(Math.cos(a) * d, 0.89, Math.sin(a) * d, 0, r() * 360, 0, 0.45 + r() * 0.5), r() > 0.6 ? [1.5, 1.25, 0.9] : [1.15, 1.1, 1]); }
  scene.root.add(tufts);

  // the boat bobs, so it stays its own node
  const boatNode = node('boat', boat(), mat, { pos: [-3.4, 0.05, 6.0], rot: [0, 35, 0] });
  scene.root.add(boatNode);

  // the lighthouse beam: two additive cones turning with the lamp
  const rayMat = rayMaterial({ power: 1.4, near: lightName === 'night' ? 0.3 : 0.16, far: 0.0 });
  const beam = group('beam', { pos: [-0.9, 0.86 + 5.6, -1.0] });
  const ray = tint(rayMesh(24, 0.3, 1.8, 20), '#ffe9a0');
  beam.add(node('ray1', ray, rayMat, { rot: [0, 0, 82] }), node('ray2', ray, rayMat, { rot: [0, 0, -82] }));
  beam.visible = lamps > 0;
  scene.root.add(beam);
  // a soft shaft under the jetty lantern
  const shaft = node('shaft', tint(rayMesh(1.9, 0.08, 1.15, 16), '#ffb85a'), rayMaterial({ power: 1.6, near: 0.4, far: 0.0 }), { pos: [JETTY_LAMP[0], JETTY_LAMP[1] - 0.05, JETTY_LAMP[2]] });
  shaft.visible = lamps > 0; scene.root.add(shaft);

  const clouds = createClouds({ count: 9, seed: 5, arc: [128, 232], height: [10, 95], speed: 0.12, shadowTint: lightName === 'day' ? '#b9c8f6' : lightName === 'sunset' ? '#c77fb0' : '#3b4fa8', color: lightName === 'night' ? '#8fa4e6' : lightName === 'sunset' ? '#ffd9b8' : '#ffffff' });
  scene.root.add(clouds.node);

  const kid = buildKid(figMat, faceMat, atlas);
  kid.root.setPos(0.3, 0.9, 1.75); kid.root.setRot(0, 10, 0);
  scene.root.add(kid.root);

  // sprites: lamp bloom, chimney smoke, wind, sparkles
  const sprites = scene.sprites = createSprites(256);
  const glowA = lamps > 0 ? 1 : 0.0;
  const gTower = sprites.add({ kind: 'glow', pos: [-0.9, 6.45, -1.0], size: 4.2, color: '#ffd77a', alpha: 0.4 * glowA });
  const gJetty = sprites.add({ kind: 'glow', pos: JETTY_LAMP, size: 2.4, color: '#ffa63f', alpha: 0.8 * glowA });
  const gKid = sprites.add({ kind: 'glow', pos: [0, 0, 0], size: 1.3, color: '#ffa63f', alpha: 0.85 * Math.max(glowA, 0.35) });
  const gWin = sprites.add({ kind: 'glow', pos: [1.25, 1.48, 0.42], size: 0.9, color: '#ffc060', alpha: 0.6 * glowA });

  const camera = createCamera({ fov: 34, near: 0.3, far: 1200 });
  const shots = [
    { name: 'wide', target: [-0.1, 3.3, 1.5], dist: 27.5, yaw: 12, pitch: 6.5, fov: 36 },
    { name: 'figure', target: [0.32, 1.52, 1.75], dist: 3.5, yaw: 20, pitch: 5, fov: 30 },
    { name: 'jetty', target: [-0.9, 0.9, 5.9], dist: 9.5, yaw: -38, pitch: 13, fov: 34 },
    { name: 'high', target: [0, 0.6, 2.2], dist: 25, yaw: 0, pitch: 52, fov: 34 },
    { name: 'into the light', target: [-0.9, 4.4, -1.0], dist: 15, yaw: lightName === 'sunset' ? 62 : 150, pitch: -6, fov: 40 },
    { name: 'portrait', target: [0.34, 1.6, 1.75], dist: 2.3, yaw: 8, pitch: 2, fov: 28 },
  ];
  let shot = shots[0], orbit = true;
  function setShot(n, still = false) { shot = shots[((n % shots.length) + shots.length) % shots.length]; orbit = !still; camera.fov = shot.fov; }
  setShot(0);

  const lampPos = [0, 0, 0], down = [0, -1, 0], P3 = [0, 0, 0], V3 = [0, 0, 0];
  let nextPuff = 0.2, nextGust = 0.5, nextSparkle = 0, nextSplash = 2.5, lastT = -1;

  function update(time, dt) {
    // camera
    const yaw = shot.yaw + (orbit ? Math.sin(time * 0.25) * 5 : 0);
    camera.orbit(shot.target, shot.dist, yaw, shot.pitch);

    // figure: stand, with a wave every few seconds, then idle life and springs
    const cyc = time % 9, wave = cyc > 5.5 ? Math.min(1, (cyc - 5.5) / 0.4) * Math.min(1, (9 - cyc) / 0.5) : 0, w = wave * wave * (3 - 2 * wave);
    kid.rig.blend(POSE_STAND, POSE_WAVE, w);
    if (w > 0) { const s = Math.sin(time * 9) * 22 * w; kid.foreR.setRot(0, 0, 24 + s); }
    idle(kid.rig, time, { seed: 1, height: 1.1 });
    // a small hop of squash and stretch as the wave starts
    const hop = cyc > 5.5 && cyc < 6.1 ? Math.sin((cyc - 5.5) / 0.6 * Math.PI) : 0;
    kid.rig.joints.hips.position[1] += hop * 0.05;
    kid.chest.scale[1] *= 1 + hop * 0.06;
    // the lamp hangs straight down from the raised mitten, with a little swing
    down[0] = Math.sin(time * 1.7) * 0.12; down[2] = Math.cos(time * 1.3) * 0.08;
    aimAxis(kid.lamp, [0, -1, 0], down);
    kid.bounce.list[2].wind[0] = 2.5 + Math.sin(time * 1.9) * 2.5; kid.bounce.list[2].wind[2] = Math.sin(time * 2.7) * 1.5;
    kid.bounce.update(dt);
    const bl = blink(time, 1), eyeName = w > 0.5 ? 'eye-shut' : bl > 0.6 ? 'eye-shut' : bl > 0.2 ? 'eye-half' : 'eye-open';
    const er = atlas.rect(eyeName);
    kid.eyeL.uvRect.set(er); kid.eyeR.uvRect[0] = er[0] + er[2]; kid.eyeR.uvRect[1] = er[1]; kid.eyeR.uvRect[2] = -er[2]; kid.eyeR.uvRect[3] = er[3];
    kid.mouth.uvRect.set(atlas.rect(w > 0.3 ? 'mouth-open' : 'mouth-smile'));
    // lamp light flicker, and its glow sprite follows it
    const fl = 0.9 + 0.1 * Math.sin(time * 13) * Math.sin(time * 7.3);
    kid.lampLight.light.intensity = Math.max(lamps, 0.25) * fl;
    const lw = kid.lampLight.world; gKid.pos[0] = lw[12]; gKid.pos[1] = lw[13]; gKid.pos[2] = lw[14];
    env.points[0].intensity = lamps * 0.6 * (0.93 + 0.07 * Math.sin(time * 11.1) * Math.sin(time * 5.7));
    gJetty.size[0] = gJetty.size[1] = 2.4 * (0.95 + 0.05 * Math.sin(time * 11.1));

    // boat
    boatNode.position[1] = 0.04 + Math.sin(time * 1.3) * 0.045;
    boatNode.setRot(Math.sin(time * 1.1) * 3.5, 35 + Math.sin(time * 0.3) * 4, Math.sin(time * 1.6 + 1) * 5);
    beam.setRot(0, time * 28, 0);
    clouds.update(time);

    // particles (skipped when time jumps, e.g. the first frame of a fixed-time screenshot)
    if (lastT >= 0 && time - lastT < 0.5) {
      if (time > nextPuff) { nextPuff = time + 0.55; P3[0] = 2.05; P3[1] = 2.85; P3[2] = -0.75; sprites.puff(P3, { count: 1, size: 0.42, rise: 0.55, life: 2.6, color: lightName === 'night' ? '#b9c6f2' : '#ffffff' }); }
      if (time > nextGust) { nextGust = time + 1.3; P3[0] = -6 + Math.random() * 5; P3[1] = 1.6 + Math.random() * 4.5; P3[2] = -2 + Math.random() * 7; V3[0] = 2.2; V3[1] = 0.1; V3[2] = 0.3; sprites.gust(P3, { vel: V3, size: 1.5 + Math.random() * 0.8, life: 2.4, alpha: 0.85 }); }
      if (time > nextSparkle) { nextSparkle = time + 0.22; const lw2 = kid.lampLight.world; P3[0] = lw2[12]; P3[1] = lw2[13]; P3[2] = lw2[14]; sprites.sparkle(P3, { count: 1, size: 0.16, spread: 0.45, life: 0.8, color: '#ffe9a0' }); }
      if (time > nextSplash) { nextSplash = time + 3.2; P3[0] = 2.5 + Math.random() * 3; P3[1] = 0.03; P3[2] = 5.5 + Math.random() * 3; sprites.splash(P3, { size: 1.3 }); }
      sprites.update(dt);
    }
    lastT = time;
  }

  return { scene, camera, update, setShot, shots, kid, env, atlas };
}
