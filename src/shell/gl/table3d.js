// The pinball table as a toon diorama.
//
// The simulation stays the pure 2D core (src/core/physics.js). This file turns a Table (src/content/
// tables.js) into a 3D scene once, and then poses that scene from a Game value every frame:
//
//   const view = createTableView(content, 'vessery');
//   view.fit(layout);                         // camera so the table's foot sits on layout.table's foot
//   view.update(game, events, dt);            // events: tableEvents(content, before, msg, after) per tick
//   view.render(renderer, timeSeconds);       // one renderer.render() into view.rect
//
// Table space is 400 x 800 with y down; the world is 0.01 units per table unit, +Y up, the far end
// of the table at -Z. Everything the ball can touch is built from the table's own data, so a new
// table needs no code here: only an entry in TABLE_ART (a playfield painting and some scenery),
// and without one it still draws, on a plain sea. See registerTableArt() at the bottom.
//
// Draw calls are spent like this: one textured playfield, one merged static set, one skinned batch
// for every moving part (flippers, bumpers, slings, targets, plunger, reel drums, the lever), one
// instanced call each for balls and for lit lamps, beams, sprites. Each opaque one costs an outline
// draw; the static set's shadow is drawn once and kept (see renderer.js), so a frame's shadow pass
// is the moving parts and the balls only.
//
// THE TABLE IS THE POWER SOURCE. A line of lamps runs up each side rail into a collector on the roof
// of the reel board. update(game, events, dt, { power }) fills the lines to `power` (0..1, the
// stage's stageState().power; without it the table keeps its own from what is being hit), every
// scoring hit throws a bolt from where it happened to the collector, and when the bolt lands
// view.onEnergy({ x, y, type, id, strength }) is called with the collector's place on screen (CSS
// px), which is where a stage above continues the line. view.hits lists this update's hits with
// their screen positions; view.port(out) is the collector; view.screenOf(event, out) any event.

import {
  m4, rgb, rng, DEG,
  sphere, ellipsoid, cylinder, lathe, torus, box, roundedBox, extrude, tube, fromArrays,
  merge, tint, paint, place, setGlow, setOutline, scale as scaleMesh,
  Node, node, group, material, texture, makeEnv, createScene, createCamera, mergeStatic, batchFigure, makeInstances,
  createSprites, rayMesh, rayMaterial, createAtlas,
} from './index.js';
import { stepPhysics } from '../../core/physics.js';
import { litIds, spinIds, currentScene } from '../../core/story.js';
import { leverStatus, AID_WAIT } from '../../core/game.js';
import { lerpEnv } from './scene.js';
import { ART } from './table-art.js';

const S = 0.01;
const WX = (x) => (x - 200) * S, WZ = (y) => (y - 400) * S;
const BALLS = 8, LAMPS = 96, POINTS = 8, BOLTS = 12, RAIL_LAMPS = 9;
const SYM_FACES = ['coin', 'scale', 'gavel', 'crown', null, 'tide', 'orb', null]; // the eight faces of a reel drum
const TAU = Math.PI * 2;
// How finely round things are cut: set while a view is being built (createTableView's opts.detail).
let DETAIL = 1;
const sg = (n, min = 5) => Math.max(min, Math.round(n * DETAIL));

// ------------------------------------------------------------------------------------ mesh helpers

/** Apply a rotation given as (x, y, z) -> [x', y', z'] to positions and both sets of normals. */
function remap(mesh, fn) {
  for (const A of [mesh.positions, mesh.normals, mesh.onormals]) {
    for (let i = 0; i < A.length; i += 3) { const r = fn(A[i], A[i + 1], A[i + 2]); A[i] = r[0]; A[i + 1] = r[1]; A[i + 2] = r[2]; }
  }
  return mesh;
}
/** A solid with the plan outline [[x, z], ...] standing from y0 to y1, its edges rounded by `bevel`. */
function prism(outline, y0, y1, bevel = 0) {
  const m = extrude(outline.map((p) => [p[0], -p[1]]), y1 - y0, { bevel, bevelSegs: 2, crease: 35 });
  remap(m, (x, y, z) => [x, z, -y]);
  for (let i = 1; i < m.positions.length; i += 3) m.positions[i] += (y0 + y1) / 2;
  return m;
}
/** Plan outline of a fat line from a to b: radius r0 at a, r1 at b. */
function stadium(ax, az, bx, bz, r0, r1 = r0, n = 4) {
  const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l, nx = -uz, nz = ux, pts = [];
  for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (Math.PI * i) / n, c = Math.cos(a), s = Math.sin(a); pts.push([bx + (ux * c + nx * s) * r1, bz + (uz * c + nz * s) * r1]); }
  for (let i = 0; i <= n; i++) { const a = Math.PI / 2 + (Math.PI * i) / n, c = Math.cos(a), s = Math.sin(a); pts.push([ax + (ux * c + nx * s) * r0, az + (uz * c + nz * s) * r0]); }
  return pts;
}
const rectPts = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const NO_SHORES = [];
const LANE_Y = [650, 575, 500, 425, 350]; // the lamps up the plunger lane (table y): they run while a ball waits to be launched
/** Colour the faces that look up with `top` and the rest with `side`: a crisp cap on a creased solid. */
const capped = (mesh, side, top, at = 0.35) => paint(mesh, (x, y, z, nx, ny) => (ny > at ? top : side));
/** Send every uv of a mesh to one point of the atlas (the blank cell), so a decal material leaves it alone. */
function plainUv(mesh, rect) {
  const u = rect[0] + rect[2] / 2, v = rect[1] + rect[3] / 2;
  for (let i = 0; i < mesh.uvs.length; i += 2) { mesh.uvs[i] = u; mesh.uvs[i + 1] = v; }
  return mesh;
}
/** A flat disc facing up at height y whose uvs cover an atlas rectangle. */
function decalDisc(r, y, rect, seg = 18) {
  const pos = [0, y, 0], uv = [rect[0] + rect[2] / 2, rect[1] + rect[3] / 2], idx = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * TAU, c = Math.cos(a), s = Math.sin(a);
    pos.push(c * r, y, s * r); uv.push(rect[0] + (0.5 + c / 2) * rect[2], rect[1] + (0.5 + s / 2) * rect[3]);
    if (i < seg) idx.push(0, i + 2, i + 1);
  }
  return setOutline(fromArrays(pos, idx, uv, 180), 0);
}
/** A cylinder lying along +Z from z = 0 (cylinder() stands on y = 0). */
const alongZ = (mesh) => remap(mesh, (x, y, z) => [x, -z, y]);

// Which way the scene graph's Euler angles turn is the engine's business: ask it once.
const probe = new Node('probe');
function turned(rx, ry, v) { probe.setRot(rx, ry, 0); probe.updateWorld(null); const w = probe.world; return [w[0] * v[0] + w[4] * v[1] + w[8] * v[2], w[1] * v[0] + w[5] * v[1] + w[9] * v[2], w[2] * v[0] + w[6] * v[1] + w[10] * v[2]]; }
const YAW_SIGN = turned(0, 90, [1, 0, 0])[2] < 0 ? 1 : -1;     // +1: a positive yaw takes +X toward -Z
const PITCH_SIGN = turned(90, 0, [0, 0, 1])[1] < 0 ? 1 : -1;   // +1: a positive pitch takes +Z toward -Y
/** Yaw in degrees that points a mesh's +X along the plan direction (dx, dz). */
const yawOf = (dx, dz) => (Math.atan2(-dz, dx) / DEG) * YAW_SIGN;

// ------------------------------------------------------------------------------------ parts

function wallMesh(w, P, H) {
  const m = prism(stadium(WX(w.a[0]), WZ(w.a[1]), WX(w.b[0]), WZ(w.b[1]), 0.026, 0.026, DETAIL < 0.8 ? 2 : 4), -0.02, H, 0.016);
  return capped(m, P.wall, P.wallCap);
}
function bollard(P, s = 1) {
  return scaleMesh(merge(
    tint(lathe([[0, 0], [0.04, 0], [0.036, 0.19], [0.044, 0.2], [0.044, 0.225], [0, 0.225]], sg(10, 6)), P.wood),
    tint(place(ellipsoid(0.047, 0.036, 0.047, sg(10, 6), sg(6, 4)), 0, 0.243, 0), P.coral),
  ), s);
}

function bumperMesh(r, P, emblem) {
  const seg = sg(22, 12);
  return merge(
    tint(lathe([[0, 0], [r * 0.98, 0], [r * 1.02, 0.03], [r * 0.9, 0.06], [r * 0.74, 0.06]], seg), P.ink2),
    tint(lathe([[r * 0.74, 0.05], [r * 0.82, 0.11], [r * 0.8, 0.15]], seg, { crease: 180 }), P.coral),
    tint(lathe([[r * 0.8, 0.15], [r * 0.79, 0.2]], seg, { crease: 180 }), P.cream),
    setGlow(tint(lathe([[r * 0.7, 0.2], [r * 0.7, 0.26]], seg, { crease: 180 }), P.glass), 0.9),
    tint(lathe([[r * 0.6, 0.26], [r * 1.04, 0.26], [r * 1.1, 0.295], [r * 1.0, 0.345], [r * 0.66, 0.38], [0, 0.385]], seg, { crease: 50 }), P.coral),
    tint(place(torus(r * 1.07, 0.017, seg, sg(6, 4)), 0, 0.293, 0), P.gold),
    emblem ? decalDisc(r * 0.68, 0.389, emblem) : null,
  );
}

function flipperMesh(len, r, P) {
  return merge(
    tint(prism(stadium(0, 0, len, 0, r * 1.3 + 0.014, r * 0.95 + 0.014, 6), 0.015, 0.1, 0.022), P.coral),
    tint(prism(stadium(0, 0, len, 0, r * 1.3 - 0.004, r * 0.95 - 0.004, 6), 0.07, 0.152, 0.022), P.white),
    tint(place(ellipsoid(r * 0.62, r * 0.4, r * 0.62, sg(12, 7), sg(6, 4)), 0, 0.152, 0), P.gold),
    tint(prism(stadium(len * 0.38, 0, len * 0.86, 0, r * 0.3, r * 0.22, 3), 0.15, 0.158, 0.004), P.coral),
  );
}

function slingMesh(len, P) {
  return merge(
    tint(prism(stadium(-len / 2, 0, len / 2, 0, 0.024), 0.035, 0.135, 0.02), P.coral),
    tint(prism(stadium(-len / 2, 0, len / 2, 0, 0.027), 0.07, 0.1, 0.006), P.cream),
  );
}

function targetMesh(len, colour, P) {
  const c = rgb(colour), knob = [c[0] * 0.45 + 0.5, c[1] * 0.45 + 0.5, c[2] * 0.45 + 0.5]; // the unlit lantern: a pale tone of its bank
  return merge(
    tint(prism(stadium(-len / 2 + 0.03, 0, len / 2 - 0.03, 0, 0.034), 0, 0.15, 0.02), colour),
    tint(prism(stadium(-len / 2 + 0.03, 0, len / 2 - 0.03, 0, 0.038), 0.045, 0.075, 0.006), P.cream),
    tint(place(torus(0.045, 0.014, sg(12, 7), sg(5, 4)), 0, 0.165, 0), P.gold),
    tint(place(ellipsoid(0.062, 0.058, 0.062, sg(12, 8), sg(8, 5)), 0, 0.225, 0), knob),
  );
}

function plungerMesh(P) {
  const parts = [tint(alongZ(cylinder(0.052, 0.058, 0.05, 12)), P.cream), tint(place(alongZ(cylinder(0.02, 0.02, 0.5, 8)), 0, 0, 0.04), P.steel)];
  for (let i = 0; i < 5; i++) parts.push(tint(place(remap(torus(0.045, 0.011, sg(10, 6), sg(5, 4)), (x, y, z) => [x, z, -y]), 0, 0, 0.12 + i * 0.05), P.gold));
  return place(merge(parts), 0, 0.08, 0.085);
}

/** The lever: a hub on the rail, and (its own part, so it can be pulled) an arm with a ball on the end. Origin at the pivot. */
function leverHubMesh(P) {
  return merge(
    tint(lathe([[0, 0], [0.13, 0], [0.13, 0.03], [0.1, 0.05], [0.075, 0.12], [0, 0.13]], sg(14, 8)), P.ink2),
    tint(place(torus(0.105, 0.016, sg(14, 8), sg(5, 4)), 0, 0.05, 0), P.gold),
  );
}
function leverArmMesh(P) {
  return merge(
    tint(place(cylinder(0.026, 0.02, 0.46, sg(8, 6)), 0, 0.02, 0), P.steel),
    tint(place(torus(0.03, 0.012, sg(10, 6), sg(5, 4)), 0, 0.44, 0), P.gold),
    tint(place(sphere(0.085, sg(14, 9), sg(10, 6)), 0, 0.54, 0), '#8e3a4a'), // unlit: a dull knob, so any lit state is a change
  );
}

/** An eight-sided reel drum lying along X. Face k looks along (0, sin(k*45), cos(k*45)) and carries SYM_FACES[k]. */
function drumMesh(R, width, P, atlas) {
  const oct = [];
  for (let k = 0; k < 8; k++) { const a = (22.5 + k * 45) * DEG; oct.push([Math.cos(a) * R, Math.sin(a) * R]); }
  const body = extrude(oct, width, { bevel: 0.035, bevelSegs: 2, crease: 30 });
  remap(body, (x, y, z) => [z, y, x]);
  { const I = body.indices; for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; } } // the remap is a mirror
  paint(body, (x, y, z, nx) => (Math.abs(nx) > 0.5 ? P.coral : P.reel));
  plainUv(body, atlas.rect('blank'));
  const parts = [body];
  const ap = R * Math.cos(22.5 * DEG) + 0.004, hh = R * Math.sin(22.5 * DEG) * 0.9, hw = width / 2 - 0.05;
  for (let k = 0; k < 8; k++) {
    const a = k * 45 * DEG, ny = Math.sin(a), nz = Math.cos(a), ty = Math.cos(a), tz = -Math.sin(a);
    const r = atlas.rect(SYM_FACES[k] ? 'sym-' + SYM_FACES[k] : 'sym-blank');
    const corner = (su, sv) => [su * hw, ny * ap + ty * hh * sv, nz * ap + tz * hh * sv];
    const q = fromArrays([...corner(-1, 1), ...corner(1, 1), ...corner(-1, -1), ...corner(1, -1)], [0, 2, 3, 0, 3, 1],
      [r[0], r[1], r[0] + r[2], r[1], r[0], r[1] + r[3], r[0] + r[2], r[1] + r[3]], 180);
    if (q.normals[1] * ny + q.normals[2] * nz < 0) throw new Error('table3d: a reel face came out facing inward');
    parts.push(setGlow(setOutline(q, 0), 1));
  }
  parts.push(plainUv(tint(place(remap(cylinder(0.07, 0.07, width + 0.12, 8), (x, y, z) => [y, z, x]), -(width + 0.12) / 2, 0, 0), P.gold), atlas.rect('blank')));
  return merge(parts);
}

/** Two wire rails with ties along a path of [x, y, z] world points. */
function railMesh(path, P) {
  const L = [], R = [], parts = [];
  for (let i = 0; i < path.length; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l, p = path[i];
    L.push([p[0] + nx * 0.088, p[1] + 0.05, p[2] + nz * 0.088]); R.push([p[0] - nx * 0.088, p[1] + 0.05, p[2] - nz * 0.088]);
    if (i % 3 === 1) parts.push(tint(tube([L[i], [p[0] + nx * 0.07, p[1] - 0.035, p[2] + nz * 0.07], [p[0] - nx * 0.07, p[1] - 0.035, p[2] - nz * 0.07], R[i]], 0.008, sg(5, 4), { crease: 180 }), P.steel));
  }
  parts.push(tint(tube(L, 0.0115, sg(6, 4), { crease: 180 }), P.gold), tint(tube(R, 0.0115, sg(6, 4), { crease: 180 }), P.gold));
  return merge(parts);
}

// ------------------------------------------------------------------------------------ the atlas

function symbolArt(P) {
  const ink = P.ink, card = (g, w, h, bg, edge) => {
    g.fillStyle = edge; g.beginPath(); rrect(g, 0, 0, w, h, w * 0.14); g.fill();
    g.fillStyle = bg; g.beginPath(); rrect(g, w * 0.045, h * 0.055, w * 0.91, h * 0.89, w * 0.1); g.fill();
    // the picture is drawn a fifth larger than its card was first laid out for: at phone size a reel face is
    // about fifty pixels across, and the symbol has to carry on its silhouette alone
    g.translate(w * 0.5, h * 0.5); g.scale(1.2, 1.2); g.translate(-w * 0.5, -h * 0.5);
    g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = ink; g.lineWidth = w * 0.055;
  };
  return {
    coin: (g, w, h) => {
      card(g, w, h, '#fff4d2', '#ffb347');
      g.fillStyle = '#e89a1c'; g.beginPath(); g.arc(w * 0.52, h * 0.54, w * 0.3, 0, 7); g.fill(); g.stroke();
      g.fillStyle = '#ffd24a'; g.beginPath(); g.arc(w * 0.5, h * 0.5, w * 0.3, 0, 7); g.fill(); g.stroke();
      g.fillStyle = '#fff3a8'; g.beginPath(); g.arc(w * 0.5, h * 0.5, w * 0.19, 0, 7); g.fill();
      g.fillStyle = '#e89a1c'; g.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = w * (i % 2 ? 0.07 : 0.16); g.lineTo(w * 0.5 + Math.cos(a) * r, h * 0.5 + Math.sin(a) * r); }
      g.closePath(); g.fill();
    },
    scale: (g, w, h) => {
      card(g, w, h, '#e4f6ff', '#3fa7e6');
      g.strokeStyle = ink; g.lineWidth = w * 0.06;
      g.beginPath(); g.moveTo(w * 0.5, h * 0.24); g.lineTo(w * 0.5, h * 0.8); g.moveTo(w * 0.33, h * 0.82); g.lineTo(w * 0.67, h * 0.82); g.moveTo(w * 0.2, h * 0.32); g.lineTo(w * 0.8, h * 0.32); g.stroke();
      for (const x of [0.22, 0.78]) { g.fillStyle = '#ffd24a'; g.beginPath(); g.moveTo(w * (x - 0.15), h * 0.52); g.quadraticCurveTo(w * x, h * 0.74, w * (x + 0.15), h * 0.52); g.closePath(); g.fill(); g.lineWidth = w * 0.04; g.stroke(); }
      g.fillStyle = '#ff5d4a'; g.beginPath(); g.arc(w * 0.5, h * 0.24, w * 0.07, 0, 7); g.fill(); g.stroke();
    },
    gavel: (g, w, h) => {
      card(g, w, h, '#ffe9df', '#ff6b57');
      g.save(); g.translate(w * 0.5, h * 0.5); g.rotate(-0.7);
      g.fillStyle = '#c98448'; g.beginPath(); rrect(g, -w * 0.05, -h * 0.02, w * 0.1, h * 0.44, w * 0.04); g.fill(); g.stroke();
      g.fillStyle = '#96592f'; g.beginPath(); rrect(g, -w * 0.27, -h * 0.26, w * 0.54, h * 0.26, w * 0.07); g.fill(); g.stroke();
      g.fillStyle = '#ffd24a'; g.fillRect(-w * 0.17, -h * 0.25, w * 0.07, h * 0.24); g.fillRect(w * 0.1, -h * 0.25, w * 0.07, h * 0.24);
      g.restore();
    },
    crown: (g, w, h) => {
      card(g, w, h, '#f1e6ff', '#9a6cf0');
      g.fillStyle = '#ffd24a'; g.beginPath(); g.moveTo(w * 0.2, h * 0.72); g.lineTo(w * 0.16, h * 0.34); g.lineTo(w * 0.35, h * 0.52); g.lineTo(w * 0.5, h * 0.26); g.lineTo(w * 0.65, h * 0.52); g.lineTo(w * 0.84, h * 0.34); g.lineTo(w * 0.8, h * 0.72); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#ff5d4a'; for (const [x, y] of [[0.16, 0.32], [0.5, 0.24], [0.84, 0.32]]) { g.beginPath(); g.arc(w * x, h * y, w * 0.055, 0, 7); g.fill(); g.stroke(); }
    },
    tide: (g, w, h) => {
      card(g, w, h, '#d8fbf4', '#19b8a8');
      g.fillStyle = '#2e9be0'; g.beginPath(); g.moveTo(w * 0.14, h * 0.74);
      g.bezierCurveTo(w * 0.14, h * 0.3, w * 0.52, h * 0.16, w * 0.7, h * 0.34); g.bezierCurveTo(w * 0.82, h * 0.46, w * 0.68, h * 0.6, w * 0.57, h * 0.5);
      g.bezierCurveTo(w * 0.62, h * 0.66, w * 0.82, h * 0.66, w * 0.86, h * 0.74); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(w * 0.7, h * 0.3, w * 0.05, 0, 7); g.arc(w * 0.8, h * 0.4, w * 0.04, 0, 7); g.fill();
    },
    orb: (g, w, h) => {
      card(g, w, h, '#fff0f7', '#ff7ad1');
      g.fillStyle = '#5b6cf0'; g.beginPath(); g.arc(w * 0.5, h * 0.5, w * 0.29, 0, 7); g.fill(); g.stroke();
      g.fillStyle = '#8fa2ff'; g.beginPath(); g.arc(w * 0.46, h * 0.46, w * 0.2, 0, 7); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(w * 0.4, h * 0.38, w * 0.08, w * 0.05, -0.6, 0, 7); g.fill();
      g.fillStyle = '#ffe9a0'; g.beginPath();
      for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, r = w * (i % 2 ? 0.035 : 0.1); g.lineTo(w * 0.62 + Math.cos(a) * r, h * 0.62 + Math.sin(a) * r); }
      g.closePath(); g.fill();
    },
    blank: (g, w, h) => {
      card(g, w, h, '#efe2c6', '#cdb68a');
      g.strokeStyle = '#cdb68a'; g.lineWidth = w * 0.035; g.setLineDash([w * 0.06, w * 0.05]); g.beginPath(); rrect(g, w * 0.22, h * 0.24, w * 0.56, h * 0.52, w * 0.08); g.stroke(); g.setLineDash([]);
    },
  };
}

function buildAtlas(P, art) {
  const A = createAtlas(1024, { pad: 4 });
  A.add('blank', 24, 24, () => {});
  const sym = symbolArt(P);
  for (const k of Object.keys(sym)) A.add('sym-' + k, 200, 168, sym[k]);
  A.add('bumper', 200, 200, art.bumperTop || ((g, w, h) => {
    g.fillStyle = P.cream; g.beginPath(); g.arc(w / 2, h / 2, w * 0.48, 0, 7); g.fill();
    g.fillStyle = P.gold; g.beginPath();
    for (let i = 0; i < 16; i++) { const a = (i * Math.PI) / 8, r = w * (i % 2 ? 0.2 : 0.42); g.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); }
    g.closePath(); g.fill();
    g.fillStyle = P.coral; g.beginPath(); g.arc(w / 2, h / 2, w * 0.15, 0, 7); g.fill();
  }));
  return A;
}

// ------------------------------------------------------------------------------------ the playfield painting

/** ctx.roundRect is missing on iOS 15. Adds a rounded rectangle to the current path. */
function rrect(g, x, y, w, h, r) {
  const q = Math.min(r, w / 2, h / 2);
  g.moveTo(x + q, y); g.arcTo(x + w, y, x + w, y + h, q); g.arcTo(x + w, y + h, x, y + h, q); g.arcTo(x, y + h, x, y, q); g.arcTo(x, y, x + w, y, q); g.closePath();
}

const FONT = '"Arial Rounded MT Bold", ui-rounded, "Avenir Next", "Helvetica Neue", system-ui, sans-serif';

/** What a table's paint(kit) gets: a 2D context already scaled to table units, and a few toon brushes. */
function paintKit(g, table, P) {
  const path = (pts, close = true) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); if (close) g.closePath(); };
  /** A closed smooth shape through pts (Catmull-Rom). */
  const smooth = (pts) => {
    const n = pts.length; g.beginPath();
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      if (i === 0) g.moveTo(p1[0], p1[1]);
      g.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
    }
    g.closePath();
  };
  const kit = {
    g, table, P, path, smooth,
    mx: (x) => 374 - x,
    mirror: (pts) => pts.map((p) => [374 - p[0], p[1]]),
    /** The whole field as water: a vertical gradient through the colours given, far end first. */
    sea(colours) {
      const gr = g.createLinearGradient(0, 0, 0, 800); colours.forEach((c, i) => gr.addColorStop(i / (colours.length - 1), c));
      g.fillStyle = gr; g.fillRect(0, 0, 400, 800);
    },
    /** Short curled wave marks scattered over a rectangle. */
    waves(seed, n, colour, [x0, y0, x1, y1] = [0, 0, 400, 800], size = 9) {
      const r = rng(seed); g.strokeStyle = colour; g.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0), s = size * (0.6 + r() * 0.8);
        g.lineWidth = 1.6 + r() * 1.2; g.beginPath(); g.moveTo(x - s, y); g.quadraticCurveTo(x - s * 0.4, y - s * 0.55, x, y); g.quadraticCurveTo(x + s * 0.4, y + s * 0.5, x + s, y - s * 0.1); g.stroke();
      }
    },
    /** Land with a shoreline: a pale shallow band, a foam line, the fill, then an ink edge. */
    land(pts, fill, { shallow = P.shallow, foam = '#ffffff', ink = P.ink, grow = 9, smoothed = true } = {}) {
      const shape = () => (smoothed ? smooth(pts) : path(pts));
      g.lineJoin = 'round';
      if (shallow) { shape(); g.strokeStyle = shallow; g.lineWidth = grow * 2.6; g.stroke(); }
      if (foam) { shape(); g.strokeStyle = foam; g.lineWidth = grow; g.stroke(); }
      shape(); g.fillStyle = fill; g.fill();
      if (ink) { shape(); g.strokeStyle = ink; g.lineWidth = 1.6; g.stroke(); }
    },
    /** Cobbles: little arcs of a darker tone, clipped to the shape through pts. */
    cobbles(pts, colour, seed = 3, step = 15) {
      g.save(); smooth(pts); g.clip(); const r = rng(seed); g.strokeStyle = colour; g.lineWidth = 1.5; g.lineCap = 'round';
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
      for (let y = y0, row = 0; y < y1; y += step, row++) for (let x = x0 + (row % 2) * step * 0.5; x < x1; x += step) {
        if (r() < 0.45) continue;
        g.beginPath(); g.arc(x + r() * 4, y + r() * 4, step * 0.34, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
      }
      g.restore();
    },
    /** A wooden deck: planks across the direction a -> b, clipped to pts. */
    planks(pts, a, b, { fill = P.plank, line = P.plankDark, step = 11 } = {}) {
      path(pts); g.fillStyle = fill; g.fill();
      g.save(); path(pts); g.clip();
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l;
      g.strokeStyle = line; g.lineWidth = 1.4;
      for (let s = -200; s < l + 200; s += step) { const x = a[0] + ux * s, y = a[1] + uy * s; g.beginPath(); g.moveTo(x - uy * 300, y + ux * 300); g.lineTo(x + uy * 300, y - ux * 300); g.stroke(); }
      g.restore();
      path(pts); g.strokeStyle = P.ink; g.lineWidth = 1.6; g.lineJoin = 'round'; g.stroke();
    },
    /** Lettering with an ink edge. */
    text(str, x, y, size, { fill = P.cream, ink = P.ink, angle = 0, edge = size * 0.22, spacing = 0 } = {}) {
      g.save(); g.translate(x, y); g.rotate(angle); g.font = `${size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      if ('letterSpacing' in g) g.letterSpacing = spacing + 'px';
      if (ink) { g.strokeStyle = ink; g.lineWidth = edge; g.strokeText(str, 0, 0); }
      g.fillStyle = fill; g.fillText(str, 0, 0); g.restore();
    },
    /** A ribbon with swallow-tail ends behind a line of lettering. */
    ribbon(x, y, w, h, fill) {
      g.lineJoin = 'round'; g.fillStyle = fill; g.strokeStyle = P.ink; g.lineWidth = 1.6;
      path([[x - w / 2 - h * 0.7, y - h * 0.3], [x - w / 2, y - h * 0.3], [x - w / 2, y + h * 0.7], [x - w / 2 - h * 0.7, y + h * 0.7], [x - w / 2 - h * 0.3, y + h * 0.2]]); g.fill(); g.stroke();
      path([[x + w / 2 + h * 0.7, y - h * 0.3], [x + w / 2, y - h * 0.3], [x + w / 2, y + h * 0.7], [x + w / 2 + h * 0.7, y + h * 0.7], [x + w / 2 + h * 0.3, y + h * 0.2]]); g.fill(); g.stroke();
      g.beginPath(); rrect(g, x - w / 2, y - h / 2, w, h, h * 0.25); g.fill(); g.stroke();
    },
    star(x, y, r0, r1, n, fill) {
      g.beginPath(); for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + (i * Math.PI) / n, r = i % 2 ? r1 : r0; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
      g.closePath(); g.fillStyle = fill; g.fill();
    },
  };
  return kit;
}

/** Painted on every table over its own art: the sockets of inserts, holes, arrows, labels and the table's lettering. */
function paintFunctional(kit, layout, at = {}) {
  const { g, table, P } = kit;
  // a label is a plate: lettering on the busiest painting still reads at phone size. `at` moves one ({ id: [x, y] }).
  // Where a ramp's wire will be seen from the player's seat: a point at height h shows about 0.55 h further up the table.
  const wires = [];
  for (const s of layout.shots) if (s.exit) for (const p of rampPath(s, 40)) wires.push([p[0], p[1] - p[2] * 55]);
  const clearOf = (x, y, w, h) => { for (const p of wires) if (Math.abs(p[0] - x) < w / 2 + 13 && Math.abs(p[1] - y) < h / 2 + 5) return false; return true; };
  // the table's own lettering, as boxes a plate that has to move keeps out of
  const words = table.decor.map((d) => { const l = d.text.length * d.size * 0.68 + 8, t = d.size * 1.3, up = Math.abs(Math.sin(d.angle || 0)) > 0.7; return [d.pos[0], d.pos[1], up ? t : l, up ? l : t]; });
  const offWords = (x, y, w, h) => words.every((r) => Math.abs(r[0] - x) > (r[2] + w) / 2 || Math.abs(r[1] - y) > (r[3] + h) / 2);
  const plate = (id, str, x, y, size) => {
    g.save(); g.font = `${size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    if ('letterSpacing' in g) g.letterSpacing = '0.4px';
    const w = g.measureText(str).width + size * 0.95, h = size * 1.5;
    if (at[id]) { x = at[id][0]; y = at[id][1]; }
    else if (!clearOf(x, y, w, h)) {
      // a wire would cross it: step aside, the nearest clear place first
      for (const [dx, dy] of [[0, 10], [0, -10], [-w * 0.6, 4], [w * 0.6, 4], [0, 20], [-w, 0], [w, 0], [-w, 14], [w, 14], [-w * 1.5, 6], [w * 1.5, 6], [0, 32]]) {
        const nx = Math.max(12 + w / 2, Math.min(362 - w / 2, x + dx));
        if (clearOf(nx, y + dy, w, h) && offWords(nx, y + dy, w, h)) { x = nx; y += dy; break; }
      }
    }
    g.translate(x, y);
    g.fillStyle = P.plateEdge; g.beginPath(); rrect(g, -w / 2 - 1.3, -h / 2 - 1.3, w + 2.6, h + 2.6, h * 0.5); g.fill();
    g.fillStyle = P.plate; g.beginPath(); rrect(g, -w / 2, -h / 2, w, h, h * 0.45); g.fill();
    g.fillStyle = P.plateText; g.fillText(str, 0, size * 0.07); g.restore();
  };
  const socket = (x, y, r) => {
    g.fillStyle = P.ink; g.beginPath(); g.arc(x, y, r + 2.2, 0, 7); g.fill();
    g.fillStyle = P.socket; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, r * 0.62, Math.PI * 1.05, Math.PI * 1.6); g.stroke();
  };
  for (const b of table.bumpers) {
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.arc(b.pos[0], b.pos[1], b.r + 9, 0, 7); g.fill();
    g.strokeStyle = P.ink; g.lineWidth = 1.4; g.setLineDash([5, 4]); g.beginPath(); g.arc(b.pos[0], b.pos[1], b.r + 9, 0, 7); g.stroke(); g.setLineDash([]);
    const lab = table.labels[b.id]; if (lab) plate(b.id, lab, b.pos[0], b.pos[1] + b.r + 16, 7.5);
  }
  for (const r of table.rollovers) {
    socket(r.pos[0], r.pos[1], Math.min(r.r, 11) * 0.82);
    // an inlane's guide stands in front of anything below its lamp: its plate goes above
    const lab = table.labels[r.id]; if (lab) plate(r.id, lab, r.pos[0], r.pos[1] + (/^in[LR]$/.test(r.id) ? -19 : Math.min(r.r, 11) + 10), 7.5);
  }
  for (const sc of table.saucers) {
    g.fillStyle = P.ink; g.beginPath(); g.arc(sc.pos[0], sc.pos[1], sc.r + 3, 0, 7); g.fill();
    g.fillStyle = '#0d1630'; g.beginPath(); g.arc(sc.pos[0], sc.pos[1] + 1.5, sc.r - 1, 0, 7); g.fill();
    const lab = table.labels[sc.id]; if (lab) plate(sc.id, lab, sc.pos[0], sc.pos[1] + sc.r + 14, 8.5);
  }
  for (const s of layout.shots) {
    socket(s.lamp[0], s.lamp[1], 9);
    // chevrons running into the gate
    g.lineJoin = 'round'; g.lineCap = 'round';
    for (let k = 1; k <= 2; k++) {
      const cx = s.lamp[0] - s.dir[0] * (10 + k * 13), cy = s.lamp[1] - s.dir[1] * (10 + k * 13), px = -s.dir[1], py = s.dir[0];
      for (const [col, lw] of [[P.ink, 6.4], [P.cream, 3.4]]) {
        g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(cx + px * 8 - s.dir[0] * 5, cy + py * 8 - s.dir[1] * 5); g.lineTo(cx + s.dir[0] * 3, cy + s.dir[1] * 3); g.lineTo(cx - px * 8 - s.dir[0] * 5, cy - py * 8 - s.dir[1] * 5); g.stroke();
      }
    }
    const lab = table.labels[s.id]; if (lab) plate(s.id, lab, s.lamp[0] - s.dir[0] * 54, s.lamp[1] - s.dir[1] * 54, 10);
  }
  for (const y of LANE_Y) socket(table.plunger.pos[0], y, 6.6);
  for (const t of layout.targets) {
    const lab = table.labels[t.id]; if (!lab || lab.length > 2) continue;
    const x = t.mid[0] + t.front[0] * 17, y = t.mid[1] + t.front[1] * 17;
    g.fillStyle = P.ink; g.beginPath(); g.arc(x, y, 8.2, 0, 7); g.fill();
    g.fillStyle = P.cream; g.beginPath(); g.arc(x, y, 6.6, 0, 7); g.fill();
    kit.text(lab, x, y + 0.6, 9, { fill: P.ink, ink: null });
  }
  for (const d of table.decor) {
    if (d.size >= 20) {
      kit.text(d.text, d.pos[0] + 1.5, d.pos[1] + 3, d.size, { fill: P.ink, ink: P.ink, angle: d.angle || 0, edge: d.size * 0.26, spacing: 2 });
      kit.text(d.text, d.pos[0], d.pos[1], d.size, { fill: P.cream, ink: P.ink, angle: d.angle || 0, edge: d.size * 0.2, spacing: 2 });
    } else kit.text(d.text, d.pos[0], d.pos[1], d.size, { fill: P.cream, ink: P.ink, angle: d.angle || 0, edge: Math.max(2.4, d.size * 0.3), spacing: 0.6 });
  }
}

// ------------------------------------------------------------------------------------ what the data says is where

/** Derived geometry shared by the painter and the builder. */
function layoutOf(table) {
  const centre = [187, 330];
  const shots = table.shots.map((s) => {
    const mid = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2], l = Math.hypot(s.dir[0], s.dir[1]) || 1, dir = [s.dir[0] / l, s.dir[1] / l];
    return { id: s.id, mid, dir, lamp: [mid[0] - dir[0] * 22, mid[1] - dir[1] * 22], exit: s.exit || null, width: Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) };
  });
  const targets = table.targets.map((t) => {
    const mid = [(t.a[0] + t.b[0]) / 2, (t.a[1] + t.b[1]) / 2], dx = t.b[0] - t.a[0], dy = t.b[1] - t.a[1], l = Math.hypot(dx, dy) || 1;
    let front = [-dy / l, dx / l];
    if (front[0] * (centre[0] - mid[0]) + front[1] * (centre[1] - mid[1]) < 0) front = [-front[0], -front[1]];
    return { id: t.id, group: t.group || '', mid, dir: [dx / l, dy / l], len: l, front };
  });
  // wall ends that nothing else meets get a bollard
  const ends = new Map();
  const key = (p) => Math.round(p[0] * 2) + ',' + Math.round(p[1] * 2);
  for (const w of table.walls) for (const p of [w.a, w.b]) { const k = key(p); const e = ends.get(k) || { p, n: 0 }; e.n++; ends.set(k, e); }
  const onAnother = (p) => table.walls.some((w) => {
    if (w.a === p || w.b === p) return false;
    const ex = w.b[0] - w.a[0], ey = w.b[1] - w.a[1], l2 = ex * ex + ey * ey || 1, t = Math.max(0, Math.min(1, ((p[0] - w.a[0]) * ex + (p[1] - w.a[1]) * ey) / l2));
    return Math.hypot(p[0] - w.a[0] - ex * t, p[1] - w.a[1] - ey * t) < 2;
  });
  const posts = [...ends.values()].filter((e) => e.n === 1 && e.p[1] < 795 && e.p[0] > 12 && e.p[0] < 388 && !onAnother(e.p)).map((e) => e.p);
  return { shots, targets, posts };
}

/** The wireform of a ramp: table-space points [x, y, height] from its gate to its exit. */
function rampPath(shot, n = 24) {
  const p0 = shot.mid, p3 = shot.exit.pos, v = shot.exit.vel, vl = Math.hypot(v[0], v[1]) || 1;
  const reach = Math.min(130, Math.hypot(p3[0] - p0[0], p3[1] - p0[1]) * 0.5);
  const via = shot.exit.via || [[p0[0] + shot.dir[0] * reach, p0[1] + shot.dir[1] * reach], [p3[0] - (v[0] / vl) * reach, p3[1] - (v[1] / vl) * reach]];
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = (1 - t) ** 3, b = 3 * t * (1 - t) ** 2, c = 3 * t * t * (1 - t), d = t ** 3;
    const up = Math.min(1, t / 0.3), dn = Math.max(0, (t - 0.72) / 0.28);
    out.push([a * p0[0] + b * via[0][0] + c * via[1][0] + d * p3[0], a * p0[1] + b * via[0][1] + c * via[1][1] + d * p3[1], 0.03 + 0.36 * up * up * (3 - 2 * up) - 0.27 * dn * dn * (3 - 2 * dn)]);
  }
  return out;
}

// ------------------------------------------------------------------------------------ the view

const BASE_PALETTE = {
  ink: '#1d2742', ink2: '#2a3a66', cream: '#fff6dc', white: '#ffffff', coral: '#ff5a4a', gold: '#ffc93a', glass: '#ffe9a0', paper: '#f1e3c4',
  wall: '#fff6e0', wallCap: '#4a63c0', wood: '#c98448', woodDark: '#96592f', steel: '#aab8dc', reel: '#fff0cc',
  plank: '#dba160', plankDark: '#b97a42', shallow: '#8ff0e0', socket: '#24406e',
  want: '#ffd04a', spin: '#ff7ad1', done: '#ffab3d', lot: '#ffe27a', hull: '#a8683a', rail: '#d08a4c',
  power: '#7df2ff', powerHot: '#ffffff', save: '#6dffb0', loan: '#ff4a3a', credit: '#58e0c0',
  plate: '#1d2742', plateEdge: '#fff6dc', plateText: '#fff6dc',
  groups: ['#ff9a3d', '#5b8cf0', '#33c9a4', '#f06aa8', '#b08cf5'],
  sea: ['#2d8fe0', '#37b4e6', '#62dcd6'],
};

/**
 * createTableView(content, tableId, { art, pitch, fov, shadowSize, detail = 1, light = 'dusk' }) -> view
 *   view.scene, view.camera, view.env          the engine scene, for anything this file does not do
 *   view.rect                                  { x, y, w, h } CSS px the table is drawn into (set by fit)
 *   view.fit(layout)                           layout from src/shell/layout.js; returns view.rect
 *   view.update(game, events, dt, stage)       pose everything from a Game; events from tableEvents();
 *                                              stage (optional) = { power 0..1, combo: { level } } from stageState()
 *   view.render(renderer, time)                -> renderer.stats
 *   view.project(x, y, h = 0, out = [0, 0])    table units (h in table units above the field) -> CSS px
 *   view.unproject(px, py, out = [0, 0])       CSS px -> table units on the playfield
 *   view.where(id)                             table [x, y] of an element by id, or null
 *   view.reelPos(i, out)                       CSS px of reel i (where a paying line throws its boon from)
 *   view.setLight('dusk' | 'night' | 'day' | 'dawn', seconds = 0)   the table's own time of day, cross-faded over `seconds`.
 *                                              A stage's other names are accepted (predawn, riot, dark, hush, lamp -> night; interior, sunset -> dusk);
 *                                              a name nobody knows is dusk and a console warning, never a throw: it is called with content data
 *   view.light                                 the light it is in (or heading to)
 *   view.power                                 0..1, what the rail lamps show
 *   view.hits                                  this update's scoring hits: [{ type, id, x, y, strength }] (x, y CSS px). Reused: copy what you keep
 *   view.onEnergy                              set to fn({ x, y, type, id, strength }): called as each hit's bolt reaches the collector
 *   view.energyTime                            seconds a bolt takes from hit to collector (0.34)
 *   view.port(out)                             CSS px of the collector on the reel board's roof: where energy leaves the table
 *   view.screenOf(event, out)                  CSS px of where an event happened (a tableEvents() event or a Game.recent entry), or null if it has no place
 *   view.hitScreen(event, out) -> bool         the same, as a yes/no that fills out
 *   view.reelState(i)                          'empty' | 'spin' | 'held' | 'paying' for reel i; view.armed, view.lever
 *   view.lever                                 'launch' | 'idle' | 'busy' | 'credit' | 'free' | 'lever' | 'loan': what the arm on the rail shows
 *
 * detail scales how finely round parts are cut (0.6 is about 60% of the triangles; the look holds at phone size).
 */
export function createTableView(content, tableId, opts = {}) {
  const table = content.tables[tableId];
  if (!table) throw new Error(`table3d: no table ${JSON.stringify(tableId)} (have ${Object.keys(content.tables).join(', ')})`);
  const art = opts.art || TABLE_ART[tableId] || {};
  const P = { ...BASE_PALETTE, ...(art.palette || {}) };
  const lay = layoutOf(table);
  const H = 0.15, R = table.ballRadius * S;

  DETAIL = opts.detail ?? 1;
  // ---- environment: three times of day. Dusk is the table as designed: a low warm sun from the far left, long
  // blue-violet shadows, lamps doing the rest. Night is the same harbour under a high moon, with the paint gone
  // blue and every lamp on the field doing real work. The live env is cross-faded between them (setLight).
  const seedPoints = []; for (let i = 0; i < POINTS; i++) seedPoints.push({ pos: [0, 0, 0], color: '#ffb347', radius: 1, intensity: 0 });
  const shadowBox = { radius: 5.5, center: [0, 0, -0.45], size: opts.shadowSize || 2048 };
  const LIGHTS = {
    dusk: makeEnv('sunset', {
      key: { dir: [-0.44, 0.64, -0.6], color: '#ffecc4' },
      shadow: { tint: '#8a84e4', lift: 0.07, saturate: 1.4, ...shadowBox },
      ambient: { sky: '#ffc9a0', ground: '#8f7ae0', amount: 0.09 },
      rim: { color: '#ffe9b0', amount: 0.7, edge: 0.72 },
      fog: { density: 0, max: 0 },
      water: { level: -0.13, deep: '#1f86d8', mid: '#2fb2e4', shallow: '#7fe8dc', foam: '#ffffff', glint: '#fff4c8', glintDensity: 0.22, drift: [0.25, 0.1], shores: [] },
    }),
    night: makeEnv('night', {
      key: { dir: [-0.38, 0.72, -0.58], color: '#7f96ee' },
      shadow: { tint: '#2a3aa2', lift: 0.1, saturate: 1.25, ...shadowBox },
      ambient: { sky: '#4a63d8', ground: '#3a2f96', amount: 0.13 },
      rim: { color: '#c4d8ff', amount: 0.75, edge: 0.72 },
      fog: { density: 0, max: 0 },
      sky: { horizon: '#27408f' },
      water: { level: -0.13, deep: '#101f6e', mid: '#1b3a9a', shallow: '#3f7fd6', foam: '#cfe0ff', glint: '#bcd4ff', glintDensity: 0.16, drift: [0.25, 0.1], shores: [] },
    }),
    day: makeEnv('day', {
      key: { dir: [-0.36, 0.8, -0.48], color: '#fffaf0' },
      shadow: { tint: '#93a4f0', lift: 0.07, saturate: 1.35, ...shadowBox },
      ambient: { sky: '#cfeaff', ground: '#ffe9b0', amount: 0.1 },
      rim: { color: '#ffffff', amount: 0.6, edge: 0.74 },
      fog: { density: 0, max: 0 },
      water: { level: -0.13, deep: '#1f8ee0', mid: '#34bdea', shallow: '#8ff0e0', foam: '#ffffff', glint: '#ffffff', glintDensity: 0.24, drift: [0.25, 0.1], shores: [] },
    }),
  };
  LIGHTS.dawn = makeEnv(LIGHTS.dusk, { // the same low sun come round to the other side, cooler and pinker
    key: { dir: [0.5, 0.56, -0.62], color: '#ffe4d6' }, shadow: { tint: '#8e90ea', ...shadowBox }, ambient: { sky: '#ffd0d8', ground: '#8fa0ea', amount: 0.1 },
    water: { deep: '#3a86d6', mid: '#5fb6e6', shallow: '#a8ecdf', glint: '#ffe9e0' },
  });
  // a table's own weather is laid over each (deeply: an art that changes the key's colour keeps its direction)
  for (const [name, over] of [['dusk', art.env], ['night', art.envNight], ['day', art.envDay], ['dawn', art.envDawn || art.env]]) if (over) LIGHTS[name] = makeEnv(LIGHTS[name], over);
  // A stage names its light for its own set; the table has four. Anything it does not know is dusk, said once.
  const LIGHT_ALIAS = { sunset: 'dusk', interior: 'dusk', predawn: 'night', riot: 'night', dark: 'night', hush: 'night', lamp: 'night' };
  const warned = new Set();
  const lightKey = (name) => {
    if (LIGHTS[name]) return name;
    if (LIGHT_ALIAS[name]) return LIGHT_ALIAS[name];
    if (!warned.has(name)) { warned.add(name); console.warn(`table3d: no light called ${JSON.stringify(name)} (have ${Object.keys(LIGHTS).join(', ')}, and ${Object.keys(LIGHT_ALIAS).join(', ')} as other names); using dusk`); }
    return 'dusk';
  };
  let lightName = lightKey(opts.light || art.light || 'dusk'), lightFrom = LIGHTS[lightName], lightTo = lightFrom, lightT = 1, lightDur = 0, nightAmount = lightName === 'night' ? 1 : 0;
  const env = makeEnv(LIGHTS[lightName]);
  const points = env.points = seedPoints.map((q) => ({ ...q, color: rgb(q.color) }));
  // the sea laps the cabinet: one rounded box of shore (it was nine circles, each a loop iteration per water fragment)
  const shoreBox = [0, -0.52, 2.2, 4.7, 0.34, 0.2];
  env.water.box = shoreBox; env.water.shores = [];
  env.shadow.center = shadowBox.center;
  function applyLight() {
    lerpEnv(env, lightFrom, lightTo, lightT);
    env.points = points; env.water.box = shoreBox; env.water.shores = NO_SHORES; env.shadow.center = shadowBox.center; env.shadow.on = true; env.sky.moon = lightTo.sky.moon; env.sky.stars = lightFrom.sky.stars + (lightTo.sky.stars - lightFrom.sky.stars) * lightT;
    const n0 = lightFrom === LIGHTS.night ? 1 : 0, n1 = lightTo === LIGHTS.night ? 1 : 0; nightAmount = n0 + (n1 - n0) * lightT;
  }
  function setLight(asked, seconds = 0) {
    const name = lightKey(asked);
    if (name === lightName) return view;
    // start from wherever the fade is now, so a change of mind does not jump
    lightFrom = makeEnv(env); lightFrom.points = []; lightTo = LIGHTS[name]; lightName = name; lightDur = seconds; lightT = seconds > 0 ? 0 : 1;
    applyLight();
    return view;
  }
  const scene = createScene(env);
  const sprites = scene.sprites = createSprites(640);

  // ---- textures
  const atlas = buildAtlas(P, art);
  const fieldCanvas = document.createElement('canvas'); fieldCanvas.width = 1024; fieldCanvas.height = 2048;
  {
    const g = fieldCanvas.getContext('2d'); g.scale(1024 / 400, 2048 / 800);
    const kit = paintKit(g, table, P); kit.lay = lay;
    if (art.paint) art.paint(kit); else { kit.sea(P.sea); kit.waves(5, 90, 'rgba(255,255,255,0.7)'); }
    paintFunctional(kit, lay, art.labelAt || {});
  }
  const fieldTex = texture(fieldCanvas);

  // ---- materials
  const fieldMat = material({ name: 'field', map: fieldTex, texMode: 'decal', outline: false, rim: 0, castShadow: false });
  const setMat = material({ name: 'set', outline: { width: 1.5, self: 0.6 }, rim: 0.7 });
  const mechMat = material({ name: 'mech', map: atlas.texture, texMode: 'decal', outline: { width: 1.7, self: 0.6 }, spec: 0.55, specSize: 0.012, rim: 0.9 });
  const ballMat = material({ name: 'ball', bands: 3, bandEdge: -0.05, bandStep: 0.5, spec: 1, specSize: 0.035, rim: 1.2, shadowTint: '#96a0f0', outline: { width: 2.5, self: 0.0, color: P.ink } });
  const lampMat = material({ name: 'lamp', emissive: 1, outline: false, castShadow: false, receiveShadow: false, rim: 0 });
  const blank = atlas.rect('blank');

  // ---- static set
  const set = group('set');
  const field = fromArrays([-2, 0, -4, 2, 0, -4, -2, 0, 4, 2, 0, 4], [0, 2, 1, 1, 2, 3], [0, 0, 1, 0, 0, 1, 1, 1], 180);
  scene.root.add(node('field', setOutline(field, 0), fieldMat));

  for (const w of table.walls) set.add(node('wall', wallMesh(w, P, H), setMat));
  for (const p of lay.posts) set.add(node('post', bollard(P), setMat, { pos: [WX(p[0]), 0, WZ(p[1])] }));
  for (const o of table.oneWays) {
    const a = [WX(o.a[0]), 0.1, WZ(o.a[1])], b = [WX(o.b[0]), 0.1, WZ(o.b[1])];
    set.add(node('gate', merge(tint(tube([a, b], 0.012, 5), P.gold), tint(tube([[a[0], 0.04, a[2]], [b[0], 0.04, b[2]]], 0.008, 5), P.gold)), setMat));
  }
  for (const sc of table.saucers) {
    set.add(node('saucer', tint(place(torus(sc.r * S + 0.012, 0.022, 20, 6), WX(sc.pos[0]), 0.012, WZ(sc.pos[1])), P.gold), setMat));
  }
  // the cabinet: side rails, the front rail, a hull that stands in the sea, and the head with the reel cradle
  const rail = (x0, z0, x1, z1, h, col, cap) => capped(prism(rectPts(x0, z0, x1, z1), -0.05, h, 0.03), col, cap);
  set.add(node('railL', rail(-2.2, -4.06, -2.0, 4.16, 0.24, P.rail, P.wood), setMat), node('railR', rail(2.0, -4.06, 2.2, 4.16, 0.24, P.rail, P.wood), setMat));
  set.add(node('railF', rail(-2.2, 4.0, 2.2, 4.18, 0.2, P.rail, P.wood), setMat));
  set.add(node('hull', tint(place(box(4.36, 0.5, 9.34), 0, -0.3, -0.52), P.hull), setMat));
  // the power lines: a row of sockets up each rail (their lamps are slots below), into the collector on the roof
  const RAIL_Z = []; for (let i = 0; i < RAIL_LAMPS; i++) RAIL_Z.push(3.45 - i * (7.2 / (RAIL_LAMPS - 1)));
  for (const z of RAIL_Z) for (const x of [-2.1, 2.1]) set.add(node('socket', tint(place(lathe([[0.064, 0], [0.07, 0.016], [0.05, 0.028]], sg(10, 8)), x, 0.238, z), P.ink2), setMat));
  for (const x of [-2.1, 2.1]) set.add(node('wire', tint(place(box(0.03, 0.012, 7.3), x, 0.243, -0.15), P.gold), setMat));

  // what a table's art is handed to build with (scenery, and the head of the cabinet)
  const artKit = { table, P, WX, WZ, S, lay, YAW: YAW_SIGN, bollard: (s) => bollard(P, s), prism, stadium, rectPts, capped };
  // the reel booth wears the place: colours from art.booth, and anything art.head(kit) stands on or around it
  const BOOTH = { awning: [P.coral, P.cream], post: [P.coral, P.cream], fascia: [P.cream, P.coral], back: P.ink2, bulbs: [P.gold, '#a79fd0'], pillar: [P.cream, P.coral], deck: [P.rail, P.wood], ...(art.booth || {}) };
  const DR = 0.5, DW = 0.66, DX = [-0.76, 0, 0.76], DY = 0.3, DZ = -4.6, HEAD_TOP = 1.0;
  const PORT = [0, HEAD_TOP + 0.32, -4.86], LEVER = [2.1, 0.24, 2.1]; // the lever stands on the right rail above the launch corner, clear of where a HUD puts its button
  set.add(node('lever-hub', place(leverHubMesh(P), LEVER[0], LEVER[1], LEVER[2]), setMat));
  {
    const head = [];
    head.push(capped(prism(rectPts(-2.2, -5.2, 2.2, -4.02), -0.05, 0.22, 0.03), BOOTH.deck[0], BOOTH.deck[1]));
    head.push(capped(prism(rectPts(-1.24, -5.1, 1.24, -4.1), 0.2, 0.34, 0.03), BOOTH.back, BOOTH.back));
    for (const x of [-1.14, -0.38, 0.38, 1.14]) head.push(capped(prism(stadium(x, -4.95, x, -4.3, 0.045), 0.3, 0.8, 0.04), BOOTH.post[0], BOOTH.post[1]));
    // the collector: a brass cradle on the roof holding the glass every line of power runs into
    head.push(tint(place(lathe([[0, 0], [0.2, 0], [0.2, 0.04], [0.11, 0.07], [0.09, 0.2], [0.15, 0.24], [0.15, 0.27], [0, 0.27]], sg(14, 8)), PORT[0], HEAD_TOP - 0.03, PORT[2]), P.gold));
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.5; head.push(tint(place(tube([[Math.cos(a) * 0.14, 0, Math.sin(a) * 0.14], [Math.cos(a) * 0.19, 0.14, Math.sin(a) * 0.19], [Math.cos(a) * 0.1, 0.3, Math.sin(a) * 0.1]], 0.014, sg(5, 4), { crease: 180 }), PORT[0], HEAD_TOP + 0.22, PORT[2]), P.gold)); }
    // a fascia in front and an awning above, so each drum shows one face and a sliver of its neighbours
    head.push(capped(prism(rectPts(-1.24, -4.2, 1.24, -4.07), 0.2, 0.55, 0.03), BOOTH.fascia[0], BOOTH.fascia[1]));
    for (let i = 0; i < 7; i++) head.push(tint(prism(rectPts(-1.26 + i * 0.36, -5.1, -1.26 + (i + 1) * 0.36, -4.62), 0.9, 0.97, 0.012), BOOTH.awning[(i + 1) % 2]));
    head.push(capped(prism(rectPts(-1.3, -5.16, 1.3, -5.08), 0.2, 0.98, 0.03), BOOTH.back, BOOTH.back));
    for (let i = 0; i < 7; i++) head.push(tint(place(sphere(i % 2 ? 0.075 : 0.055, sg(10, 6), sg(6, 4)), -1.08 + i * 0.36, 0.9, -4.62), BOOTH.bulbs[(i + 1) % 2]));
    for (const x of [-1.86, 1.86]) head.push(merge(tint(place(cylinder(0.11, 0.09, 0.5, 12), x, 0.2, -4.66), BOOTH.pillar[0]), tint(place(lathe([[0.13, 0], [0.15, 0.04], [0.1, 0.08], [0, 0.1]], 12), x, 0.7, -4.66), BOOTH.pillar[1])));
    if (art.head) for (const m of art.head(artKit)) head.push(m);
    for (let i = 0; i < 9; i++) head.push(tint(place(lathe([[0.05, 0], [0.056, 0.02], [0.04, 0.035]], sg(10, 6)), (i - 4) * 0.2, 0.55, -4.135), P.ink2));
    set.add(node('head', merge(head), setMat));
  }

  // ---- ramps
  const ramps = {};
  for (const s of lay.shots) {
    if (!s.exit) continue;
    const pts = rampPath(s);
    ramps[s.id] = pts;
    const world = pts.map((p) => [WX(p[0]), p[2], WZ(p[1])]);
    set.add(node('ramp', railMesh(world, P), setMat));
    // a plank flap up onto the wire, and a post at each end
    const a = world[0], b = world[6], len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const flap = capped(extrude([[0, a[1] + 0.012], [len, b[1] + 0.02], [len, b[1] - 0.005], [0, a[1] - 0.012]], 0.17, { bevel: 0.004, crease: 30 }), P.plankDark, P.plank, 0.5);
    set.add(node('flap', flap, setMat, { pos: [a[0], 0, a[2]], rot: [0, yawOf(b[0] - a[0], b[2] - a[2]), 0] }));
    for (const k of [5, pts.length - 3]) { const p = world[k]; set.add(node('prop', tint(place(cylinder(0.02, 0.02, Math.max(0.02, p[1] + 0.02), 6), p[0], 0, p[2]), P.steel), setMat)); }
  }

  // ---- scenery
  const lampSprites = [];
  const artLamps = []; // { pos [x, y, z], color, radius, flicker }
  const beams = [];
  if (art.scenery) {
    for (const it of art.scenery(artKit)) {
      if (it.mesh) set.add(node(it.name || 'prop', it.mesh, setMat, { pos: [WX(it.at[0]), it.y || 0, WZ(it.at[1])], rot: [0, it.rot || 0, 0], scale: it.scale ?? 1 }));
      for (const l of it.lamps || []) {
        const pos = [WX(l.at[0]), l.h, WZ(l.at[1])];
        const sp = sprites.add({ kind: 'glow', pos, size: l.size || 0.5, color: l.color || '#ffb347', alpha: l.alpha ?? 0.6 });
        lampSprites.push({ sp, size: l.size || 0.5, alpha: l.alpha ?? 0.6, seed: lampSprites.length * 1.7 });
        if (l.light) artLamps.push({ pos, color: rgb(l.color || '#ffb347'), radius: l.light, seed: artLamps.length * 2.3, night: !!l.night });
        if (l.night) lampSprites[lampSprites.length - 1].night = true;
      }
      for (const b of it.beams || []) beams.push(b);
    }
  }
  artLamps.sort((p, q) => (q.night ? 1 : 0) - (p.night ? 1 : 0)); // by night, the lamps only night has come first
  const mech = group('mech');
  const groupColour = new Map();
  const targets = lay.targets.map((t, i) => {
    if (!groupColour.has(t.group)) groupColour.set(t.group, (art.groups && art.groups[t.group]) || P.groups[groupColour.size % P.groups.length]);
    const live = table.flippers.length + 3 + table.bumpers.length + table.slings.length + 2 + i < 32; // the skinned batch holds 32 bones; later targets stand still
    const yaw = yawOf(t.dir[0], t.dir[1]);
    const n = node(t.id, plainUv(targetMesh(t.len * S, groupColour.get(t.group), P), blank), live ? mechMat : setMat, { pos: [WX(t.mid[0]), 0, WZ(t.mid[1])], rot: [0, yaw, 0], parent: live ? mech : set });
    return { t, node: n, yaw, wob: 0, vel: 0, live, colour: rgb(groupColour.get(t.group)) };
  });
  scene.root.add(mergeStatic(set, 'set'));

  const beamNodes = beams.map((b) => {
    const pivot = group('beam', { pos: [WX(b.at[0]), b.h, WZ(b.at[1])] });
    const ray = tint(rayMesh(b.length || 3.2, 0.05, b.spread || 0.6, 14), b.color || '#ffe9a0'), mat = rayMaterial({ power: 1.3, near: b.near ?? 0.34, far: 0 });
    pivot.add(node('ray', ray, mat, { rot: [0, 0, b.tilt ?? 80] }), node('ray', ray, mat, { rot: [0, 0, -(b.tilt ?? 80)] }));
    scene.root.add(pivot);
    return { pivot, speed: b.speed ?? 40 };
  });

  // ---- moving parts: every one a bone of a single skinned mesh
  const flippers = table.flippers.map((f) => ({ f, node: node(f.id, plainUv(flipperMesh(f.length * S, f.radius * S, P), blank), mechMat, { pos: [WX(f.pivot[0]), 0, WZ(f.pivot[1])], parent: mech }) }));
  const drums = DX.map((x, i) => ({ node: node('reel' + i, drumMesh(DR, DW, P, atlas), mechMat, { pos: [x, DY, DZ], parent: mech }), angle: 0, pop: 0, lock: 0, was: 0 }));
  const bumpers = table.bumpers.map((b) => ({ b, s: 0, v: 0, flash: 0, node: node(b.id, plainUvExcept(bumperMesh(b.r * S, P, atlas.rect('bumper')), blank), mechMat, { pos: [WX(b.pos[0]), 0, WZ(b.pos[1])], parent: mech }) }));
  const slings = table.slings.map((s) => {
    const mx = (s.a[0] + s.b[0]) / 2, my = (s.a[1] + s.b[1]) / 2, dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], l = Math.hypot(dx, dy) || 1;
    let nx = -dy / l, ny = dx / l; if (nx * (187 - mx) + ny * -40 < 0) { nx = -nx; ny = -ny; }
    return { s, kick: 0, base: [WX(mx), WZ(my)], n: [nx, ny], mid: [mx, my], node: node(s.id, plainUv(slingMesh(l * S, P), blank), mechMat, { pos: [WX(mx), 0, WZ(my)], rot: [0, yawOf(dx, dy), 0], parent: mech }) };
  });
  const plunger = { node: node('plunger', plainUv(plungerMesh(P), blank), mechMat, { pos: [WX(table.plunger.pos[0]), 0, WZ(table.plunger.pos[1])], parent: mech }), z: WZ(table.plunger.pos[1]) };
  const lever = { node: node('lever', plainUv(leverArmMesh(P), blank), mechMat, { pos: [LEVER[0], LEVER[1] + 0.08, LEVER[2]], parent: mech }), pull: 0, state: 'idle', wob: 0 };
  scene.root.add(mech);
  batchFigure(mech);

  // ---- balls
  const ballNode = node('balls', tint(sphere(R, sg(20, 12), sg(14, 8)), '#fbfaff'), ballMat);
  ballNode.instances = makeInstances(BALLS);
  scene.root.add(ballNode);

  // ---- lamps: everything that can light is a slot; the lit ones are drawn as one instanced call
  // a lamp is a low dome (its underside is never seen): 40 to 70 triangles, and up to 96 of them are lit at once
  const lampNode = node('lamps', setOutline(setGlow(lathe([[1, -0.15], [0.96, 0.25], [0.74, 0.68], [0.4, 0.93], [0, 1]], sg(12, 9), { crease: 180 }), 1), 0), lampMat);
  lampNode.castShadow = false; lampNode.instances = makeInstances(LAMPS);
  scene.root.add(lampNode);
  const lamps = [], lampById = new Map();
  function addLamp(id, kind, x, y, z, sx, sy, sz, colour, halo = 0, light = 0) {
    const L = { id, kind, base: m4.trs(x, y, z, 0, 0, 0, sx, sy, sz), pos: [x, y, z], colour: rgb(colour), level: 0, tone: 0, halo: halo > 0 ? sprites.add({ kind: 'glow', pos: [x, y + sy, z], size: halo, color: colour, alpha: 0 }) : null, haloSize: halo, light };
    if (L.halo) L.halo.visible = false;
    lamps.push(L); if (id && !lampById.has(id)) lampById.set(id, L);
    return L;
  }
  for (const b of bumpers) b.lamp = addLamp(b.b.id, 'bumper', WX(b.b.pos[0]), 0.36, WZ(b.b.pos[1]), b.b.r * S * 0.74, 0.05, b.b.r * S * 0.74, '#fff2b0', b.b.r * S * 5.5, 1.5);
  for (const t of targets) t.lamp = addLamp(t.t.id, 'target', WX(t.t.mid[0]), 0.225, WZ(t.t.mid[1]), 0.068, 0.064, 0.068, P.want, 0.3, 0.95);
  for (const r of table.rollovers) addLamp(r.id, 'rollover', WX(r.pos[0]), 0.004, WZ(r.pos[1]), Math.min(r.r, 11) * 0.8 * S, 0.012, Math.min(r.r, 11) * 0.8 * S, P.want, 0.36, 0.8);
  for (const s of lay.shots) addLamp(s.id, 'shot', WX(s.lamp[0]), 0.004, WZ(s.lamp[1]), 0.09, 0.012, 0.09, P.want, 0.5, 1.1);
  for (const sc of table.saucers) addLamp(sc.id, 'saucer', WX(sc.pos[0]), 0.004, WZ(sc.pos[1]), sc.r * S - 0.012, 0.01, sc.r * S - 0.012, P.want, 0.55, 1.1);
  const reelLamps = DX.map((x, i) => addLamp('', 'reel', x, 0.9, -4.62, 0.085, 0.085, 0.085, P.lot, 0.5, 0));
  // a glow in front of each drum's showing face (no body: the halo is the lamp), for a locked symbol and a paying line
  const faceLamps = DX.map((x) => addLamp('', 'face', x, DY + 0.34, DZ + 0.42, 0.001, 0.001, 0.001, P.lot, 1.25, 0));
  const railLamps = [[], []];
  for (let i = 0; i < RAIL_LAMPS; i++) for (let k = 0; k < 2; k++) railLamps[k].push(addLamp('', 'rail', k ? 2.1 : -2.1, 0.262, RAIL_Z[i], 0.05, 0.034, 0.05, P.power, 0.34, 0));
  const portLamp = addLamp('', 'port', PORT[0], PORT[1], PORT[2], 0.13, 0.15, 0.13, P.power, 1.05, 2.2);
  const leverLamp = addLamp('', 'lever', LEVER[0], LEVER[1] + 0.62, LEVER[2], 0.092, 0.092, 0.092, P.spin, 0.7, 1.2);
  const leverBase = leverLamp.base.slice();
  // ball save: a hammock of lamps slung across the drain between the flipper pivots
  const saveLamps = [];
  { const fl = table.flippers.find((f) => f.id === 'fl'), fr = table.flippers.find((f) => f.id === 'fr');
    if (fl && fr) for (let i = 0; i < 7; i++) { const u = i / 6, x = fl.pivot[0] + (fr.pivot[0] - fl.pivot[0]) * (0.14 + 0.72 * u), y = Math.min(table.drainY - 8, Math.max(fl.pivot[1], fr.pivot[1]) + 38 + 16 * Math.sin(u * Math.PI)); saveLamps.push(addLamp('', 'save', WX(x), 0.03, WZ(y), 0.07, 0.035, 0.07, P.save, 0.62, 0)); } }
  const ballGlow = []; for (let i = 0; i < BALLS; i++) { const g = sprites.add({ kind: 'glow', pos: [0, 0, 0], size: R * 7, color: '#ffffff', alpha: 0 }); g.visible = false; ballGlow.push(g); }
  const armLamps = [-1.86, 1.86].map((x) => addLamp('', 'arm', x, 0.76, -4.66, 0.1, 0.07, 0.1, P.spin, 0.7, 1.4));
  const laneLamps = LANE_Y.map((y) => addLamp('', 'lane', WX(table.plunger.pos[0]), 0.004, WZ(y), 0.062, 0.014, 0.062, P.want, 0.55, 0));
  const chargeLamps = []; for (let i = 0; i < 9; i++) chargeLamps.push(addLamp('', 'charge', (i - 4) * 0.2, 0.582, -4.135, 0.04, 0.02, 0.04, P.spin, 0, 0));
  if (lamps.length > LAMPS) throw new Error(`table3d: table ${tableId} has ${lamps.length} lamps; the instanced call holds ${LAMPS}`);
  const fillLamp = table.reels.fill.map((id) => lampById.get(id) || null);
  const kickLamps = ['outL', 'outR'].map((id) => lampById.get(id)).filter(Boolean);
  const where = new Map();
  for (const b of table.bumpers) where.set(b.id, b.pos);
  for (const t of lay.targets) where.set(t.id, t.mid);
  for (const r of table.rollovers) where.set(r.id, r.pos);
  for (const s of lay.shots) where.set(s.id, s.mid);
  for (const sc of table.saucers) where.set(sc.id, sc.pos);
  for (const s of slings) where.set(s.s.id, s.mid);

  // ---- camera
  const camera = createCamera({ fov: opts.fov || 16, near: 2, far: 90 });
  const rect = { x: 0, y: 0, w: 430, h: 748, shadowCenter: env.shadow.center, shadowRadius: env.shadow.radius };
  let pitch = opts.pitch || 62;
  const prj = [0, 0];
  function projectWorld(x, y, z, out) {
    const m = camera.viewProj, w = m[3] * x + m[7] * y + m[11] * z + m[15];
    out[0] = rect.x + ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w * 0.5 + 0.5) * rect.w;
    out[1] = rect.y + (0.5 - (m[1] * x + m[5] * y + m[9] * z + m[13]) / w * 0.5) * rect.h;
    return out;
  }
  const camTarget = [0, 0, 0];
  function place3(dist, tz, pt) { camTarget[2] = tz; camera.orbit(camTarget, dist, 0, pt); camera.update(rect.w / rect.h); }
  /**
   * Put the camera so the foot of the table (y = 800) spans layout.table's foot exactly, and the top
   * of the reel board just fits under the top of the rectangle. Three nested bisections, once.
   */
  function fit(layout) {
    const tr = { x: layout.table.x, y: layout.table.y, w: 400 * layout.table.scale, h: 800 * layout.table.scale };
    const pad = Math.max(0, Math.min(tr.x, layout.W - tr.x - tr.w, 40));
    rect.x = tr.x - pad; rect.w = tr.w + pad * 2; rect.y = tr.y; rect.h = layout.H - tr.y;
    const foot = tr.y + tr.h, left = tr.x, top = rect.y + 5;
    const solve = (pt) => {
      let d0 = 6, d1 = 80, d = 20, tz = 0;
      for (let i = 0; i < 26; i++) {
        d = (d0 + d1) / 2;
        let a = -8, b = 8;
        for (let k = 0; k < 26; k++) { tz = (a + b) / 2; place3(d, tz, pt); if (projectWorld(-2, 0, 4, prj)[1] > foot) a = tz; else b = tz; }
        if (projectWorld(-2, 0, 4, prj)[0] < left) d0 = d; else d1 = d; // too wide: step back
      }
      return Math.min(projectWorld(0, HEAD_TOP + 0.06, -5.16, prj)[1], projectWorld(0, HEAD_TOP + 0.06, -4.62, prj)[1], projectWorld(0, PORT[1] + 0.2, PORT[2], prj)[1]);
    };
    if (opts.pitch) solve(pitch);
    else { let a = 40, b = 86; for (let i = 0; i < 22; i++) { pitch = (a + b) / 2; if (solve(pitch) > top) a = pitch; else b = pitch; } solve(pitch); }
    view.pitch = pitch;
    return rect;
  }
  function project(x, y, h = 0, out = [0, 0]) { return projectWorld(WX(x), h * S, WZ(y), out); }
  function unproject(px, py, out = [0, 0]) {
    const nx = ((px - rect.x) / rect.w) * 2 - 1, ny = 1 - ((py - rect.y) / rect.h) * 2, m = camera.invViewProj;
    const at = (z, o) => { const w = m[3] * nx + m[7] * ny + m[11] * z + m[15]; o[0] = (m[0] * nx + m[4] * ny + m[8] * z + m[12]) / w; o[1] = (m[1] * nx + m[5] * ny + m[9] * z + m[13]) / w; o[2] = (m[2] * nx + m[6] * ny + m[10] * z + m[14]) / w; return o; };
    const a = at(-1, [0, 0, 0]), b = at(1, [0, 0, 0]), t = a[1] / (a[1] - b[1]);
    out[0] = (a[0] + (b[0] - a[0]) * t) / S + 200; out[1] = (a[2] + (b[2] - a[2]) * t) / S + 400;
    return out;
  }

  // ---- per-frame state
  let time = 0, lit = [], spin = [], objIds = [], litKey = null, litSeq = -1, litScene = -1, litChapter = -1, litArmed = null;
  let celebrate = 0, armedFlash = 0, punch = 0, nextGlint = 0, nextGust = 2;
  const prevId = new Int32Array(BALLS), prevX = new Float32Array(BALLS), prevY = new Float32Array(BALLS); let prevN = 0;
  const rampId = new Int32Array(4).fill(-1), rampT = new Float32Array(4), rampPts = [null, null, null, null];
  const trailT = new Float32Array(BALLS);
  const P3 = [0, 0, 0], V3 = [0, 0, 0];
  const glints = art.glints || [[60, 360, 320, 720]];
  const camFacing = () => pitch;
  const symFace = (sym) => { const k = SYM_FACES.indexOf(sym); if (k < 0) throw new Error(`table3d: the reels show an unknown symbol ${JSON.stringify(sym)}`); return k; };
  const C = { want: rgb(P.want), spin: rgb(P.spin), done: rgb(P.done), lot: rgb(P.lot), white: [1, 1, 1], flash: rgb('#fff6c0'), power: rgb(P.power), save: rgb(P.save), loan: rgb(P.loan), credit: rgb(P.credit), hot: rgb(P.powerHot) };
  // lamp tones: 0 wanted, 1 spin, 2 done, 3 lot, 4 flash, 5 power, 6 save, 7 loan, 8 credit, 9 white-hot, 10.. the multiball colours
  const MULTI = ['#ff7ad1', '#7df2ff', '#ffd24a', '#6dffb0'].map(rgb);
  const TONES = [C.want, C.spin, C.done, C.lot, C.flash, C.power, C.save, C.loan, C.credit, C.hot, ...MULTI];
  const HALO = { target: 0.3, rail: 0.5, port: 0.75, face: 0.55, save: 0.6, lever: 0.6, lane: 0.75 };
  const STRENGTH = { bumper: 0.35, sling: 0.2, target: 0.5, rollover: 0.35, saucer: 0.7, shot: 1, payout: 1, kickback: 0.5, save: 0.5 };
  const LEVER_SIGN = turned(90, 0, [0, 1, 0])[2] > 0 ? 1 : -1; // +1: a positive pitch tips +Y toward +Z (the player)
  let power = 0, ownPower = 0, portFlash = 0, saveFlash = 0, multi = false, liveBalls = 0, onEnergy = null, lastCells = null, lastPaying = false;
  const hits = [], hitPool = [], S2 = [0, 0];
  const bolts = []; for (let i = 0; i < BOLTS; i++) { const head = sprites.add({ kind: 'glow', pos: [0, 0, 0], size: 0.3, color: '#ffffff', alpha: 0 }); head.visible = false; bolts.push({ on: false, t: 0, dur: 0.34, a: [0, 0, 0], c: [0, 0, 0], b: [0, 0, 0], prev: [0, 0, 0], col: C.power, type: '', id: '', strength: 0, reel: -1, port: false, head }); }
  /** Send a bolt of energy from a world point to another. toPort: it is one of the power lines (it reports its arrival). */
  function throwBolt(x, y, z, tx, ty, tz, col, dur, type = '', id = '', strength = 0.3, toPort = false, reel = -1) {
    let b = null; for (let i = 0; i < BOLTS; i++) if (!bolts[i].on) { b = bolts[i]; break; }
    if (!b) return;
    b.on = true; b.t = 0; b.dur = dur; b.col = col; b.type = type; b.id = id; b.strength = strength; b.port = toPort; b.reel = reel;
    b.a[0] = x; b.a[1] = y; b.a[2] = z; b.b[0] = tx; b.b[1] = ty; b.b[2] = tz; b.prev[0] = x; b.prev[1] = y; b.prev[2] = z;
    // the line rises off the field and leans away from the straight path, so two hits at once do not draw one line
    const lift = 0.45 + 0.12 * Math.hypot(tx - x, tz - z), side = (x < tx ? -1 : 1) * 0.35;
    b.c[0] = (x + tx) / 2 + side; b.c[1] = Math.max(y, ty) + lift; b.c[2] = (z + tz) / 2;
  }
  /** A scoring hit at table (x, y): it is listed for whoever watches, and its bolt leaves for the collector. */
  function hit(type, id, x, y, h, strength, col = C.power) {
    const e = hitPool.pop() || { type: '', id: '', x: 0, y: 0, strength: 0 };
    projectWorld(WX(x), h, WZ(y), S2); e.type = type; e.id = id || ''; e.x = S2[0]; e.y = S2[1]; e.strength = strength; hits.push(e);
    throwBolt(WX(x), h, WZ(y), PORT[0], PORT[1], PORT[2], col, 0.34, type, id || '', strength, true);
  }
  function leverState(game) {
    if (game.mode !== 'play' || !game.phys) return 'idle';
    if (game.phys.balls.some((b) => b.state === 'plunger')) return 'launch';
    const st = leverStatus(content, game);
    if (st === null) return 'idle';
    if (st === 'wait') return game.reels.cells.some((c) => c.spin > 0) ? 'busy' : 'idle';
    return st === 'pull' ? 'lever' : st;
  }

  function burst(x, y, h, n, colour, size = 0.3, spread = 0.3) { P3[0] = WX(x); P3[1] = h; P3[2] = WZ(y); sprites.sparkle(P3, { count: n, color: colour, size, spread, life: 0.55 }); }
  function ring(x, y, size, colour) { P3[0] = WX(x); P3[1] = 0.02; P3[2] = WZ(y); sprites.spawn({ kind: 'ring', pos: P3, size: size * 0.3, endSize: size, life: 0.45, color: colour }); }
  function stars(x, y, h, n, colour, speed = 1.6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = speed * (0.5 + Math.random() * 0.7);
      P3[0] = WX(x); P3[1] = h; P3[2] = WZ(y); V3[0] = Math.cos(a) * s; V3[1] = 0.6 + Math.random() * 1.2; V3[2] = Math.sin(a) * s;
      sprites.spawn({ kind: 'sparkle', pos: P3, vel: V3, size: 0.2 + Math.random() * 0.2, life: 0.45 + Math.random() * 0.3, color: colour, drag: 2.5, gravity: 1.5, rot: Math.random() });
    }
  }

  function onEvent(e, game) {
    const at = e.id !== undefined ? where.get(e.id) : null;
    if (e.type === 'bumper') {
      const b = bumpers.find((q) => q.b.id === e.id); if (!b) return;
      b.v = -9 - Math.min(5, e.speed / 200); b.flash = 1; punch = Math.max(punch, 0.35);
      stars(b.b.pos[0], b.b.pos[1], 0.36, 5, '#fff2a0'); ring(b.b.pos[0], b.b.pos[1], b.b.r * S * 4.2, '#ffffff');
      hit('bumper', e.id, b.b.pos[0], b.b.pos[1], 0.4, STRENGTH.bumper);
    } else if (e.type === 'sling') {
      const s = slings.find((q) => q.s.id === e.id); if (!s) return;
      s.kick = 1; stars(s.mid[0] + s.n[0] * 10, s.mid[1] + s.n[1] * 10, 0.15, 3, '#ffffff', 1.1);
      hit('sling', e.id, s.mid[0], s.mid[1], 0.15, STRENGTH.sling);
    } else if (e.type === 'target') {
      const t = targets.find((q) => q.t.id === e.id); if (!t) return;
      t.vel = 520; stars(t.t.mid[0], t.t.mid[1], 0.25, 4, '#ffe27a', 1.2); ring(t.t.mid[0], t.t.mid[1], 0.5, '#fff2c0');
      hit('target', e.id, t.t.mid[0], t.t.mid[1], 0.25, STRENGTH.target);
    } else if (e.type === 'rollover' && at) { ring(at[0], at[1], 0.42, '#fff2c0'); burst(at[0], at[1], 0.1, 2, '#fff2c0', 0.22, 0.2); hit('rollover', e.id, at[0], at[1], 0.05, STRENGTH.rollover); }
    else if (e.type === 'saucer' && at) { ring(at[0], at[1], 0.8, '#ffffff'); stars(at[0], at[1], 0.15, 6, '#ffe27a'); hit('saucer', e.id, at[0], at[1], 0.1, STRENGTH.saucer, C.hot); }
    else if (e.type === 'eject' && at) { P3[0] = WX(at[0]); P3[1] = 0.12; P3[2] = WZ(at[1]); sprites.puff(P3, { count: 2, size: 0.2, rise: 0.4, spread: 0.1, life: 0.6 }); }
    else if (e.type === 'shot' && at) {
      stars(at[0], at[1], 0.2, 7, '#ffffff'); punch = Math.max(punch, 0.6);
      hit('shot', e.id, at[0], at[1], 0.2, STRENGTH.shot, C.hot);
      if (ramps[e.id]) { let k = rampId.indexOf(e.ballId); if (k < 0) k = rampId.indexOf(-1); if (k < 0) k = 0; rampId[k] = e.ballId; rampT[k] = 0; rampPts[k] = ramps[e.id]; }
    } else if (e.type === 'launch') { P3[0] = WX(table.plunger.pos[0]); P3[1] = 0.1; P3[2] = WZ(table.plunger.pos[1]) + 0.1; sprites.puff(P3, { count: 3, size: 0.22, rise: 0.3, spread: 0.12, life: 0.7 }); }
    else if (e.type === 'drain') {
      let x = 187; for (let i = 0; i < prevN; i++) if (prevId[i] === e.ballId) x = prevX[i];
      P3[0] = WX(x); P3[1] = 0.03; P3[2] = WZ(table.drainY - 6); sprites.splash(P3, { size: 0.6, spray: 7 }); punch = Math.max(punch, 0.5);
      ownPower = Math.max(0, ownPower - 0.2);
    } else if (e.type === 'reelStart') {
      // a lane filled this reel: the lane's lamp throws its mark up to the drum, which is where the eye should go next
      const L = fillLamp[e.reel];
      if (game.reels.source === 'lanes' && L) throwBolt(L.pos[0], 0.1, L.pos[2], DX[e.reel], DY + 0.4, DZ + 0.4, C.lot, 0.24, 'fill', L.id, 0.3, false, e.reel);
    } else if (e.type === 'reelStop') {
      const d = drums[e.reel];
      if (d) { d.pop = 1; d.lock = 1; P3[0] = DX[e.reel]; P3[1] = DY + 0.42; P3[2] = DZ + 0.5; sprites.sparkle(P3, { count: 5, size: 0.34, spread: 0.55 }); V3[0] = 0; V3[1] = 0; V3[2] = 0; sprites.spawn({ kind: 'glow', pos: P3, vel: V3, size: 1.5, endSize: 0.5, life: 0.28, color: '#fff6c0', alpha: 0.8 }); punch = Math.max(punch, 0.25); }
    }
    else if (e.type === 'payout') {
      const big = e.kind === 'jackpot' ? 2 : e.kind === 'bust' ? 0 : 1;
      if (big === 0) return;
      celebrate = big === 2 ? 2.4 : 1.3; punch = 1;
      for (let i = 0; i < 3; i++) throwBolt(DX[i], DY + 0.5, DZ + 0.3, PORT[0], PORT[1], PORT[2], C.lot, 0.2 + i * 0.07, i === 1 ? 'payout' : '', '', i === 1 ? STRENGTH.payout * big : 0, i === 1);
      { const e2 = hitPool.pop() || { type: '', id: '', x: 0, y: 0, strength: 0 }; projectWorld(DX[1], DY + 0.5, DZ + 0.3, S2); e2.type = 'payout'; e2.id = e.kind; e2.x = S2[0]; e2.y = S2[1]; e2.strength = STRENGTH.payout * big; hits.push(e2); }
      for (let i = 0; i < 16 * big; i++) {
        P3[0] = DX[i % 3] + (Math.random() - 0.5) * 0.4; P3[1] = DY + 0.5; P3[2] = DZ + 0.3;
        V3[0] = (Math.random() - 0.5) * 3; V3[1] = 2.5 + Math.random() * 2.5; V3[2] = 0.6 + Math.random() * 2.6;
        sprites.spawn({ kind: i % 3 ? 'dot' : 'sparkle', pos: P3, vel: V3, size: i % 3 ? 0.09 : 0.34, life: 0.9 + Math.random() * 0.6, color: i % 2 ? '#ffd24a' : '#fff6c0', gravity: 6, drag: 0.4, rot: Math.random() });
      }
      for (const b of bumpers) b.flash = 1;
    } else if (e.type === 'armed') { armedFlash = 1; for (const id of table.reels.spin) { const p = where.get(id); if (p) stars(p[0], p[1], 0.15, 5, P.spin); } }
    else if (e.type === 'sceneClear') { celebrate = 2.4; punch = 1; for (let i = 0; i < 12; i++) stars(40 + Math.random() * 300, 150 + Math.random() * 520, 0.3, 3, i % 2 ? '#ffe27a' : '#ffffff'); }
    else if (e.type === 'kickback') {
      // which outlane: the ball that was nearest one a moment ago. It is lifted over the post to the inlane beside it.
      let best = null, bd = 1e9;
      for (const [o, inn] of [['outL', 'inL'], ['outR', 'inR']]) { const po = where.get(o); if (!po) continue; for (let i = 0; i < prevN; i++) { const d = Math.hypot(prevX[i] - po[0], prevY[i] - po[1]); if (d < bd) { bd = d; best = [po, where.get(inn) || po, o]; } } }
      if (best) {
        const [po, pi, id] = best;
        ring(po[0], po[1], 0.9, P.save); stars(po[0], po[1], 0.15, 8, P.save, 1.8);
        P3[0] = WX(po[0]); P3[1] = 0.1; P3[2] = WZ(po[1]); sprites.puff(P3, { count: 3, size: 0.2, rise: 0.5, spread: 0.12, life: 0.6 });
        throwBolt(WX(po[0]), 0.1, WZ(po[1]), WX(pi[0]), 0.1, WZ(pi[1]), C.save, 0.22);
        hit('kickback', id, po[0], po[1], 0.1, STRENGTH.kickback, C.save);
      }
      punch = Math.max(punch, 0.6);
    } else if (e.type === 'save') {
      // the hammock under the flippers catches it and the ball is handed back to the plunger
      saveFlash = 1; ring(187, table.drainY - 20, 1.3, P.save); stars(187, table.drainY - 24, 0.1, 10, P.save, 2);
      throwBolt(WX(187), 0.1, WZ(table.drainY - 20), WX(table.plunger.pos[0]), 0.15, WZ(table.plunger.pos[1]), C.save, 0.4);
      hit('save', '', 187, table.drainY - 20, 0.1, STRENGTH.save, C.save);
    } else if (e.type === 'multiball') {
      celebrate = Math.max(celebrate, 1.6); punch = 1;
      for (let i = 0; i < 4; i++) stars(table.plunger.pos[0], table.plunger.pos[1] - 60 - i * 90, 0.2, 5, i % 2 ? P.spin : P.power, 2);
    }
  }

  function setLamp(L, level, tone) { if (level > L.level) { L.level = level; L.tone = tone; } }

  /**
   * Pose the whole table from a Game. `events` is this frame's tableEvents() output (may be empty or null).
   * `stage` (optional) is the stage's state: { power } 0..1 fills the rail lamps; without it the table keeps its own.
   */
  function update(game, events, dt, stage = null) {
    time += dt;
    const phys = game.phys;
    if (lightT < 1) { lightT = lightDur > 0 ? Math.min(1, lightT + dt / lightDur) : 1; applyLight(); }
    for (let i = 0; i < hits.length; i++) hitPool.push(hits[i]);
    hits.length = 0;
    if (events) for (let i = 0; i < events.length; i++) onEvent(events[i], game);

    // what the story and the reels want lit: recomputed only when the game values they read change
    if (game.hits !== litKey || game.seq !== litSeq || game.scene !== litScene || game.chapter !== litChapter || game.reels.armed !== litArmed) {
      litKey = game.hits; litSeq = game.seq; litScene = game.scene; litChapter = game.chapter; litArmed = game.reels.armed;
      const playing = content.chapters[game.chapter] && content.chapters[game.chapter].tableId === tableId;
      lit = playing ? litIds(content, game) : []; spin = playing ? spinIds(content, game) : [];
      const sc = playing ? currentScene(content, game) : null; objIds = sc ? sc.objective.ids : [];
    }
    liveBalls = 0; if (phys) for (let i = 0; i < phys.balls.length; i++) if (phys.balls[i].state !== 'plunger') liveBalls++;
    multi = liveBalls > 1 || game.multiQueue > 0;

    // power: the stage's when it gives one, else the table's own, which every bolt that lands tops up and time drains
    ownPower = Math.max(0, Math.min(1, ownPower - dt * (liveBalls > 0 ? 0.035 : 0.12)));
    const wantPower = stage && typeof stage.power === 'number' ? Math.max(0, Math.min(1, stage.power)) : ownPower;
    power += (wantPower - power) * Math.min(1, dt * 5);
    portFlash = Math.max(0, portFlash - dt * 3.2); saveFlash = Math.max(0, saveFlash - dt * 2.5);

    const pulse = 0.62 + 0.38 * Math.sin(time * 7), chase = 0.55 + 0.45 * Math.sin(time * 11);
    for (let i = 0; i < lamps.length; i++) lamps[i].level = 0;
    for (let i = 0; i < objIds.length; i++) { const L = lampById.get(objIds[i]); if (L && L.kind !== 'bumper' && game.hits[objIds[i]] > 0) setLamp(L, 0.8, 2); }
    for (let i = 0; i < spin.length; i++) { const L = lampById.get(spin[i]); if (L) setLamp(L, 0.55 + 0.45 * Math.sin(time * 11 - i * 2.1), 1); }
    for (let i = 0; i < lit.length; i++) { const L = lampById.get(lit[i]); if (L) setLamp(L, L.kind === 'bumper' ? pulse * 0.6 : pulse, 0); }

    // the reels: empty, turning, holding a symbol, paying
    const cells = game.reels.cells, paying = game.reels.phase === 'paying', armed = game.reels.armed;
    lastCells = cells; lastPaying = paying;
    const hot = game.reels.source === 'lanes' ? 3 : 1; // a lane's reel turns gold, a lit shot's or the lever's turns pink
    for (let i = 0; i < 3; i++) {
      const c = cells[i], d = drums[i], held = c.sym !== null && c.spin <= 0;
      d.lock = Math.max(0, d.lock - dt * 2.2);
      if (fillLamp[i] && held) setLamp(fillLamp[i], 0.9, 3);
      if (paying && held) { const k = 0.5 + 0.5 * Math.sin(time * 20 - i * 2.1); setLamp(reelLamps[i], k, k > 0.5 ? 4 : 3); setLamp(faceLamps[i], 0.45 + 0.55 * k, k > 0.5 ? 9 : 3); }
      else if (held) { setLamp(reelLamps[i], 0.9, 3); setLamp(faceLamps[i], 0.22 + 0.78 * d.lock, d.lock > 0.3 ? 9 : 3); }
      else if (c.spin > 0) { setLamp(reelLamps[i], 0.5 + 0.5 * Math.sin(time * 26 + i * 2), hot); setLamp(faceLamps[i], 0.3 + 0.2 * Math.sin(time * 31 + i), hot); }
      else if (armed) setLamp(faceLamps[i], 0.16 + 0.12 * Math.sin(time * 4 - i * 0.9), 1); // waiting for the lit shot: the empty faces breathe
    }
    if (game.boons.kickback > 0) for (let i = 0; i < kickLamps.length; i++) setLamp(kickLamps[i], 0.7 + 0.3 * Math.sin(time * 6 + i * 3.1), 6);
    if (armed) for (let i = 0; i < armLamps.length; i++) setLamp(armLamps[i], chase, 1);
    { const n = Math.floor((game.reels.charge / (game.reels.need || 1)) * 9 + 1e-6); for (let i = 0; i < 9; i++) if (i < n) setLamp(chargeLamps[i], armed ? 0.55 + 0.45 * Math.sin(time * 11 - i * 0.8) : 0.8, 1); }

    // the power lines: lit from the foot of each rail up to `power`, with a pulse running up them into the collector
    {
      const n = power * RAIL_LAMPS, run = (time * (2.2 + 7 * power)) % (RAIL_LAMPS + 4);
      for (let i = 0; i < RAIL_LAMPS; i++) {
        const fill = Math.max(0, Math.min(1, n - i)), near = Math.max(0, 1 - Math.abs(run - i) / 1.4);
        const lv = fill * (0.5 + 0.5 * near) + (multi ? 0.35 * near : 0);
        if (lv > 0.05) for (let k = 0; k < 2; k++) setLamp(railLamps[k][i], lv, multi ? 10 + ((i + (time * 6 | 0)) & 3) : near > 0.6 && fill > 0.5 ? 9 : 5);
      }
      setLamp(portLamp, Math.min(1, 0.12 + 0.6 * power + portFlash), portFlash > 0.35 ? 9 : 5);
    }
    // a ball waiting on the plunger sits where a HUD puts its button: the lane above it runs with light, toward the field
    if (lever.state === 'launch' || (phys && phys.balls.some((b) => b.state === 'plunger'))) {
      const run = (time * 5) % (laneLamps.length + 2), ch = phys ? phys.charge : 0;
      for (let i = 0; i < laneLamps.length; i++) { const near = Math.max(0, 1 - Math.abs(run - i) / 1.3); setLamp(laneLamps[i], Math.min(1, 0.28 + 0.72 * near + ch * 0.5), ch > 0.02 ? 9 : 0); }
    }
    // ball save: the hammock is up while the save runs, and blinks through its last two and a half seconds
    if (game.boons.ballSave > 0 || saveFlash > 0) {
      const left = game.boons.ballSave, on = left > 2.5 || Math.sin(time * 16) > -0.2 || saveFlash > 0;
      if (on) for (let i = 0; i < saveLamps.length; i++) setLamp(saveLamps[i], saveFlash > 0 ? 1 : 0.55 + 0.35 * Math.sin(time * 5 - i * 0.8), saveFlash > 0.3 ? 9 : 6);
    }
    // the lever on the rail
    {
      const st = leverState(game); lever.state = st;
      const pulled = st === 'busy' && game.reels.source === 'lever' ? 1 : 0;
      lever.pull += (pulled - lever.pull) * Math.min(1, dt * (pulled ? 26 : 5));
      const ready = st === 'free' || st === 'lever' || st === 'credit' || st === 'loan';
      const ang = lever.pull * 68 + (ready ? Math.sin(time * 5.2) * 5 : 0) - 8;
      lever.node.setRot(ang * LEVER_SIGN, 0, 0);
      const ar = ang * DEG, ky = Math.cos(ar) * 0.54, kz = Math.sin(ar) * 0.54;
      leverLamp.base[12] = LEVER[0]; leverLamp.base[13] = LEVER[1] + 0.08 + ky; leverLamp.base[14] = LEVER[2] + kz;
      leverLamp.pos[1] = leverLamp.base[13]; leverLamp.pos[2] = leverLamp.base[14];
      if (leverLamp.halo) { leverLamp.halo.pos[1] = leverLamp.base[13]; leverLamp.halo.pos[2] = leverLamp.base[14]; }
      if (st === 'free') setLamp(leverLamp, 0.6 + 0.4 * Math.sin(time * 9), 3);
      else if (st === 'lever') setLamp(leverLamp, 0.6 + 0.4 * Math.sin(time * 7), 1);
      else if (st === 'credit') setLamp(leverLamp, 0.3 + 0.7 * Math.min(1, (game.emptyT || 0) / AID_WAIT), 8); // the hat going round: it fills
      else if (st === 'loan') setLamp(leverLamp, Math.sin(time * 4) > 0 ? 0.95 : 0.25, 7);
      else if (st === 'busy') setLamp(leverLamp, 0.5 + 0.5 * lever.pull, 9);
    }
    if (celebrate > 0) { celebrate -= dt; for (let i = 0; i < lamps.length; i++) { const L = lamps[i]; if (L.kind !== 'charge' && L.kind !== 'face' && L.kind !== 'save' && L.kind !== 'lever' && L.kind !== 'lane' && L.level < 0.5) setLamp(L, 0.5 + 0.5 * Math.sin(time * 18 + i * 1.3), (i % 2) ? 3 : 4); } }
    for (let i = 0; i < bumpers.length; i++) { const b = bumpers[i]; if (b.flash > 0) { setLamp(b.lamp, b.flash, 4); b.flash = Math.max(0, b.flash - dt * 5); } }
    if (phys) for (let i = 0; i < phys.balls.length; i++) { const ins = phys.balls[i].inside; for (let k = 0; k < ins.length; k++) { const L = lampById.get(ins[k]); if (L) setLamp(L, 1, 4); } }

    // lamps -> instances, halos, and the eight point lights (flashes first, then what the player should shoot)
    // By night a lamp is most of the light there is: halos and reach both grow.
    const nightK = 1 + 0.45 * nightAmount, glowK = (0.8 + 0.3 * power) * (1 + 0.35 * nightAmount);
    const inst = lampNode.instances, D = inst.data; let n = 0, np = 0;
    // order of claim on the eight: flashes, what the player should shoot, the set's own lamps, then everything else lit
    const lampPass = (pass) => {
      for (let i = 0; i < lamps.length && np < POINTS; i++) {
        const L = lamps[i]; if (L.light <= 0 || L.level < 0.08) continue;
        const pr = L.kind === 'bumper' ? 0 : L.tone <= 1 ? 1 : 2; if (pr !== pass || (celebrate > 0 && pr > 0)) continue;
        const c = TONES[L.tone], p = points[np++];
        p.pos[0] = L.pos[0]; p.pos[1] = Math.max(L.pos[1], 0.16) + 0.1; p.pos[2] = L.pos[2]; p.color = c; p.radius = L.light * nightK; p.intensity = L.level * 1.15;
      }
    };
    lampPass(0); lampPass(1);
    for (let i = 0; i < artLamps.length && np < POINTS; i++) { const a = artLamps[i]; if (a.night && nightAmount < 0.05) continue; const p = points[np++]; p.pos[0] = a.pos[0]; p.pos[1] = a.pos[1]; p.pos[2] = a.pos[2]; p.color = a.color; p.radius = a.radius * nightK; p.intensity = (0.9 + 0.1 * Math.sin(time * 9 + a.seed) * Math.sin(time * 5.3 + a.seed)) * (a.night ? nightAmount : 1); }
    lampPass(2);
    for (let i = 0; i < bumpers.length && np < POINTS; i++) { const b = bumpers[i]; if (b.lamp.level >= 0.08) continue; const p = points[np++]; p.pos[0] = b.lamp.pos[0]; p.pos[1] = 0.3; p.pos[2] = b.lamp.pos[2]; p.color = C.done; p.radius = 0.62 * nightK; p.intensity = 0.75; }
    for (; np < POINTS; np++) points[np].intensity = 0;
    for (let i = 0; i < lamps.length; i++) {
      const L = lamps[i], lv = L.level;
      if (L.halo) { L.halo.visible = lv > 0.05; }
      if (lv <= 0.05) continue;
      if (L.kind === 'bumper' && L.tone !== 4) { L.halo.color = C.want; L.halo.alpha = 0.55 * lv * glowK; L.halo.size[0] = L.halo.size[1] = L.haloSize; continue; }
      const c = TONES[L.tone];
      if (L.halo) { L.halo.color = c; L.halo.alpha = Math.min(1, (HALO[L.kind] || 0.5) * lv * glowK); L.halo.size[0] = L.halo.size[1] = L.haloSize * (0.8 + 0.3 * lv); }
      if (L.kind === 'face') continue; // a glow only
      const o = n++ * 20, k = 0.55 + 0.6 * lv;
      D.set(L.base, o); D[o + 16] = c[0] * k; D[o + 17] = c[1] * k; D[o + 18] = c[2] * k; D[o + 19] = 1;
    }
    inst.count = n; inst.dirty = true;
    for (let i = 0; i < lampSprites.length; i++) { const l = lampSprites[i], f = 0.93 + 0.07 * Math.sin(time * 9 + l.seed) * Math.sin(time * 5.3 + l.seed); l.sp.size[0] = l.sp.size[1] = l.size * f * (1 + 0.25 * nightAmount); l.sp.alpha = Math.min(1, l.alpha * (l.night ? nightAmount : 1 + 0.5 * nightAmount)); }

    // bolts: each one a bright head on a bent path, shedding a line of light that fades behind it
    for (let i = 0; i < BOLTS; i++) {
      const b = bolts[i]; if (!b.on) continue;
      b.t += dt / b.dur;
      const u = Math.min(1, b.t), e = u * u * (3 - 2 * u), q = 1 - e;
      const x = q * q * b.a[0] + 2 * q * e * b.c[0] + e * e * b.b[0], y = q * q * b.a[1] + 2 * q * e * b.c[1] + e * e * b.b[1], z = q * q * b.a[2] + 2 * q * e * b.c[2] + e * e * b.b[2];
      if (dt > 0) {
        // one long glow per frame laid along the step just taken (aimed on screen), so the trail is a line and not a row of dots
        const len = Math.hypot(x - b.prev[0], y - b.prev[1], z - b.prev[2]);
        if (len > 1e-4) {
          projectWorld(b.prev[0], b.prev[1], b.prev[2], S2); const sx = S2[0], sy = S2[1]; projectWorld(x, y, z, S2);
          const th = 0.15 + 0.1 * b.strength;
          P3[0] = (x + b.prev[0]) / 2; P3[1] = (y + b.prev[1]) / 2; P3[2] = (z + b.prev[2]) / 2; V3[0] = 0; V3[1] = 0; V3[2] = 0;
          sprites.spawn({ kind: 'glow', pos: P3, vel: V3, size: th, endSize: th * 0.25, aspect: Math.max(1, (len * 2.6) / th), rot: Math.atan2(sy - S2[1], S2[0] - sx), life: 0.26 + 0.12 * b.strength, color: b.col, alpha: 1 });
        }
      }
      b.prev[0] = x; b.prev[1] = y; b.prev[2] = z;
      b.head.visible = true; b.head.pos[0] = x; b.head.pos[1] = y; b.head.pos[2] = z; b.head.color = C.hot; b.head.alpha = 0.95; b.head.size[0] = b.head.size[1] = 0.34 + 0.3 * b.strength;
      if (b.t >= 1) {
        b.on = false; b.head.visible = false;
        if (b.reel >= 0) { drums[b.reel].pop = Math.max(drums[b.reel].pop, 0.6); }
        if (b.port) {
          portFlash = 1; ownPower = Math.min(1, ownPower + 0.05 + 0.09 * b.strength);
          P3[0] = PORT[0]; P3[1] = PORT[1]; P3[2] = PORT[2]; sprites.sparkle(P3, { count: 2 + Math.round(b.strength * 3), size: 0.3, spread: 0.3, color: '#dffcff' });
          if (onEnergy) { projectWorld(PORT[0], PORT[1], PORT[2], S2); ARRIVAL.x = S2[0]; ARRIVAL.y = S2[1]; ARRIVAL.type = b.type; ARRIVAL.id = b.id; ARRIVAL.strength = b.strength; onEnergy(ARRIVAL); }
        }
      }
    }

    // flippers, plunger
    if (phys) {
      for (let i = 0; i < flippers.length; i++) { const F = flippers[i], st = phys.flippers[F.f.id]; if (st) F.node.setRot(0, (-st.angle / DEG) * YAW_SIGN, 0); }
      plunger.node.position[2] = plunger.z + phys.charge * 0.17 + (phys.charge > 0 ? Math.sin(time * 60) * 0.004 * phys.charge : 0);
    }
    // bumpers: a spring that is kicked flat and bounces back
    for (let i = 0; i < bumpers.length; i++) {
      const b = bumpers[i];
      b.v += (-b.s * 520 - b.v * 13) * dt; b.s += b.v * dt; if (b.s < -0.5) b.s = -0.5;
      const idle = Math.sin(time * 2.2 + i * 2.1) * 0.012;
      b.node.setScale(1 - b.s * 0.5 - idle * 0.5, 1 + b.s + idle, 1 - b.s * 0.5 - idle * 0.5);
    }
    for (let i = 0; i < slings.length; i++) {
      const s = slings[i]; s.kick = Math.max(0, s.kick - dt * 7);
      const k = s.kick * s.kick * 0.085;
      s.node.position[0] = s.base[0] + s.n[0] * k; s.node.position[2] = s.base[1] + s.n[1] * k; s.node.setScale(1, 1 + s.kick * 0.25, 1 + s.kick * 0.9);
    }
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]; if (!t.live) continue;
      t.vel += (-t.wob * 420 - t.vel * 9) * dt; t.wob += t.vel * dt;
      t.node.setRot(t.wob, t.yaw, 0);
    }
    // reel drums: turning (with streaks falling across the face, since a spinning octagon alone reads as a flicker),
    // locking with a pop and a squash, or resting on the blank face
    for (let i = 0; i < 3; i++) {
      const d = drums[i], c = cells[i], want = (c.sym === null ? 4 : symFace(c.sym)) * 45 - camFacing();
      if (c.spin > 0) {
        d.angle = want + c.spin * 900 + Math.sin(c.spin * 30) * 2;
        if (dt > 0) for (let k = 0; k < 2; k++) {
          P3[0] = DX[i] + (Math.random() - 0.5) * DW * 0.8; P3[1] = DY + 0.62; P3[2] = DZ + 0.3; V3[0] = 0; V3[1] = -1.7; V3[2] = 1.5;
          sprites.spawn({ kind: 'dot', pos: P3, vel: V3, size: 0.2, endSize: 0.12, aspect: 0.16, life: 0.13, color: hot === 3 ? '#fff3c0' : '#ffd0f0', alpha: 0.85 });
        }
      } else { let diff = ((want - d.angle + 540) % 360) - 180; const stepA = 900 * dt; d.angle += Math.abs(diff) < stepA ? diff : Math.sign(diff) * stepA; }
      d.pop = Math.max(0, d.pop - dt * 4);
      const pop = 1 + Math.sin(d.pop * Math.PI) * 0.16 + (paying ? 0.06 * Math.sin(time * 20 - i * 2.1) : 0);
      d.node.setRot(d.angle * PITCH_SIGN, 0, 0); d.node.setScale(1 + Math.sin(d.pop * Math.PI) * 0.05, pop, pop);
    }
    for (let i = 0; i < beamNodes.length; i++) beamNodes[i].pivot.setRot(0, time * beamNodes[i].speed * (multi ? 2.6 : 1), 0);

    // balls
    const bi = ballNode.instances, B = bi.data; let nb = 0;
    for (let k = 0; k < rampId.length; k++) if (rampId[k] >= 0) { rampT[k] += dt / 0.3; if (rampT[k] >= 1) rampId[k] = -1; }
    for (let i = 0; i < BALLS; i++) ballGlow[i].visible = false;
    if (phys) {
      for (let i = 0; i < phys.balls.length && nb < BALLS; i++) {
        const b = phys.balls[i];
        let x = WX(b.pos[0]), y = R, z = WZ(b.pos[1]);
        if (b.state === 'held') y = R - 0.035;
        for (let k = 0; k < rampId.length; k++) {
          if (rampId[k] !== b.id) continue;
          const pts = rampPts[k], u = rampT[k], f = u * (pts.length - 1), j = Math.min(pts.length - 2, Math.floor(f)), q = f - j, p = pts[j], p2 = pts[j + 1];
          const rx = WX(p[0] + (p2[0] - p[0]) * q), ry = p[2] + (p2[2] - p[2]) * q + R + 0.03, rz = WZ(p[1] + (p2[1] - p[1]) * q);
          const w = u < 0.7 ? 0 : (u - 0.7) / 0.3, e = w * w * (3 - 2 * w);
          x = rx + (x - rx) * e; y = ry + (y - ry) * e; z = rz + (z - rz) * e;
        }
        const o = nb * 20;
        B[o] = 1; B[o + 1] = 0; B[o + 2] = 0; B[o + 3] = 0; B[o + 4] = 0; B[o + 5] = 1; B[o + 6] = 0; B[o + 7] = 0; B[o + 8] = 0; B[o + 9] = 0; B[o + 10] = 1; B[o + 11] = 0;
        B[o + 12] = x; B[o + 13] = y; B[o + 14] = z; B[o + 15] = 1; B[o + 16] = 1; B[o + 17] = 1; B[o + 18] = 1; B[o + 19] = 1;
        prevId[nb] = b.id; prevX[nb] = b.pos[0]; prevY[nb] = b.pos[1];
        // multiball: every ball wears its own colour, as a glow and in its trail. By night a lone ball keeps a faint glow so it is never lost.
        const mc = multi && b.state !== 'plunger' ? MULTI[b.id & 3] : null;
        if (mc || (nightAmount > 0.05 && b.state === 'live')) { const g = ballGlow[nb]; g.visible = true; g.pos[0] = x; g.pos[1] = y + R * 0.5; g.pos[2] = z; g.color = mc || C.white; g.alpha = mc ? 0.7 : 0.3 * nightAmount; }
        // a short trail of shrinking dots behind a fast ball: one every nine table units, gone within sixty
        const sp = Math.hypot(b.vel[0], b.vel[1]);
        if (b.state === 'live' && sp > (mc ? 120 : 240) && dt > 0) {
          trailT[nb] += sp * dt;
          let back = 0;
          while (trailT[nb] >= 9 && back < 4) {
            trailT[nb] -= 9; const k = (trailT[nb] / sp);
            P3[0] = x - b.vel[0] * k * S; P3[1] = y; P3[2] = z - b.vel[1] * k * S; V3[0] = 0; V3[1] = 0; V3[2] = 0;
            sprites.spawn({ kind: 'dot', pos: P3, vel: V3, size: R * 1.7, endSize: R * 0.3, life: Math.min(mc ? 0.3 : 0.22, 70 / sp), color: mc || (game.boons.mult > 1 ? '#ffd24a' : '#ffffff'), alpha: mc ? 0.8 : 0.55 });
            back++;
          }
          if (trailT[nb] > 9) trailT[nb] = 0;
        } else trailT[nb] = 0;
        nb++;
      }
    }
    prevN = nb; bi.count = nb; bi.dirty = true;

    // the sea glitters, and now and then a gust curls across the table
    if (dt > 0 && time > nextGlint) {
      nextGlint = time + 0.16; const a = glints[(Math.random() * glints.length) | 0];
      P3[0] = WX(a[0] + Math.random() * (a[2] - a[0])); P3[1] = 0.03; P3[2] = WZ(a[1] + Math.random() * (a[3] - a[1])); V3[0] = 0; V3[1] = 0.05; V3[2] = 0;
      sprites.spawn({ kind: 'sparkle', pos: P3, vel: V3, size: 0.1 + Math.random() * 0.12, life: 0.7, color: nightAmount > 0.5 ? '#cfe0ff' : '#fff8d8' });
    }
    if (dt > 0 && time > nextGust) { nextGust = time + 5 + Math.random() * 4; P3[0] = -2.2; P3[1] = 0.7; P3[2] = -3 + Math.random() * 5; V3[0] = 1.3; V3[1] = 0; V3[2] = 0.2; sprites.gust(P3, { vel: V3, size: 0.8, life: 2.4, alpha: 0.8 }); }
    punch = Math.max(0, punch - dt * 3.5);
    if (dt > 0) sprites.update(dt);
  }

  function render(renderer, t = time) { return renderer.render(scene, camera, t, rect); }

  const ARRIVAL = { x: 0, y: 0, type: '', id: '', strength: 0 };
  /** CSS px of where an event from tableEvents() happened, or null when it has no one place. */
  function screenOf(e, out = [0, 0]) {
    if (e.id !== undefined && where.has(e.id)) { const p = where.get(e.id); return project(p[0], p[1], 12, out); }
    if (e.type === 'reelStart' || e.type === 'reelStop') return projectWorld(DX[e.reel], DY + DR, DZ, out);
    if (e.type === 'payout' || e.type === 'armed' || e.type === 'lit') return projectWorld(DX[1], DY + DR, DZ, out);
    if (e.type === 'launch') return project(table.plunger.pos[0], table.plunger.pos[1], 8, out);
    if (e.type === 'drain' || e.type === 'save') { let x = 187; for (let i = 0; i < prevN; i++) if (prevId[i] === e.ballId) x = prevX[i]; return project(x, table.drainY - 6, 0, out); }
    if (e.type === 'loan' || e.type === 'aid' || e.type === 'hat' || e.type === 'multiball') return projectWorld(LEVER[0], LEVER[1] + 0.6, LEVER[2], out);
    if (e.type === 'trust' || e.type === 'sceneClear') return projectWorld(PORT[0], PORT[1], PORT[2], out);
    return null;
  }
  const view = {
    table, scene, camera, env, rect, pitch, fit, update, render, project, unproject, setLight, screenOf, hits,
    hitScreen: (e, out = [0, 0]) => screenOf(e, out) !== null,
    energyTime: 0.34,
    where: (id) => where.get(id) || null,
    reelPos: (i, out = [0, 0]) => projectWorld(DX[i], DY + DR, DZ, out),
    port: (out = [0, 0]) => projectWorld(PORT[0], PORT[1], PORT[2], out),
    reelState: (i) => { const c = lastCells && lastCells[i]; return !c ? 'empty' : c.spin > 0 ? 'spin' : c.sym === null ? 'empty' : lastPaying ? 'paying' : 'held'; },
    get onEnergy() { return onEnergy; }, set onEnergy(fn) { onEnergy = fn; },
    get light() { return lightName; },
    get power() { return power; },
    get lever() { return lever.state; },
    get armed() { return litArmed === true; },
    /** 0..1, decaying: how hard the last event hit. A shell may shake the canvas by it. */
    get punch() { return punch; },
  };
  fit({ W: 430, H: 932, table: { x: 31, y: 184, scale: 0.92 } });
  return view;
}

/** plainUv for a mesh whose decal faces (anything already mapped outside the blank cell's corner) must keep their uvs. */
function plainUvExcept(mesh, blank) {
  // builders give 0..1 uvs across each part; decal discs are the only parts whose uvs were mapped into the atlas,
  // and they have no outline width. That is the marker.
  const u = blank[0] + blank[2] / 2, v = blank[1] + blank[3] / 2;
  for (let i = 0; i < mesh.owidth.length; i++) if (mesh.owidth[i] !== 0) { mesh.uvs[i * 2] = u; mesh.uvs[i * 2 + 1] = v; }
  return mesh;
}

// ------------------------------------------------------------------------------------ events

/**
 * What happened on the table in one tick, for anything that wants to watch (this view, a live stage).
 * Pure. The core's update() returns sounds without ids, so the physics step is run again on the
 * state before the tick (it is a pure function of it, and gives the same events update() acted on),
 * and the rest is read off the difference between the two Game values.
 *
 *   tableEvents(content, before, msg, after, out = []) -> out
 *     physics events as stepPhysics gives them: { type: 'bumper'|'sling'|'target'|'rollover'|'shot'|'saucer'|'eject'|'drain'|'launch'|'flip'|'wall', id?, ballId, speed }
 *     { type: 'reelStart', reel }      { type: 'reelStop', reel, sym }
 *     { type: 'payout', kind: 'payout'|'jackpot'|'bust', result, source }
 *     { type: 'armed' }                the spin shots lit
 *     { type: 'objective', done, id }  the scene's objective moved on
 *     { type: 'sceneClear' }           { type: 'save' }   { type: 'kickback' }   { type: 'multiball' }
 *     { type: 'loan' }                 { type: 'aid' }
 */
export function tableEvents(content, before, msg, after, out = []) {
  out.length = 0;
  if (!before || before.mode !== 'play' || msg.type !== 'tick' || !before.phys) return out;
  const table = content.tables[content.chapters[before.chapter].tableId];
  const ev = stepPhysics(table, before.phys, msg.input, msg.dt).events;
  for (let i = 0; i < ev.length; i++) out.push(ev[i]);
  if (!after) return out;
  const a = before.reels, b = after.reels;
  for (let i = 0; i < 3; i++) {
    if (b.cells[i].spin > 0 && !(a.cells[i].spin > 0)) out.push({ type: 'reelStart', reel: i });
    if (a.cells[i].spin > 0 && !(b.cells[i].spin > 0) && b.cells[i].sym !== null) out.push({ type: 'reelStop', reel: i, sym: b.cells[i].sym });
  }
  if (a.phase !== 'paying' && b.phase === 'paying') {
    const p = b.result.payout, bust = p.writs === 0 && p.marks === 0 && !p.points && p.boon === null, r = b.result.reels;
    out.push({ type: 'payout', kind: bust ? 'bust' : r[0] === r[1] && r[1] === r[2] ? 'jackpot' : 'payout', result: b.result, source: a.source });
  }
  if (!a.armed && b.armed) out.push({ type: 'armed' });
  if (after.mode === 'cine') out.push({ type: 'sceneClear' });
  else if (after.hits !== before.hits || after.seq !== before.seq) {
    let id; for (const k in after.hits) if (after.hits[k] !== before.hits[k]) id = k;
    out.push({ type: 'objective', id, done: Object.keys(after.hits).length });
  }
  if (after.freeBalls > before.freeBalls) out.push({ type: 'save' });
  if (after.boons.kickback < before.boons.kickback) out.push({ type: 'kickback' });
  if (after.multiQueue > before.multiQueue) out.push({ type: 'multiball' });
  if (after.econ.loansTaken > before.econ.loansTaken) out.push({ type: 'loan' });
  if (after.econ.aidUsed > before.econ.aidUsed) out.push({ type: 'aid' });
  return out;
}

// ------------------------------------------------------------------------------------ table art

/**
 * What a table brings of its own. Every field is optional; a table with no entry gets a plain sea.
 *
 *   palette      overrides of BASE_PALETTE (wall, wallCap, coral, sea [far, mid, near], groups [...], want, spin ...)
 *   groups       { targetGroup: '#colour' } for standup banks
 *   env          overrides of the lighting environment (see scene.js makeEnv)
 *   paint(kit)   paint the playfield in table units (400 x 800, y down) with kit.g, a 2D context, and
 *                the brushes on kit: sea, waves, land, cobbles, planks, text, ribbon, star, path, smooth,
 *                mx, mirror. Inserts, holes, arrows, labels and table.decor are painted over it for you.
 *   bumperTop(g, w, h)   the emblem on top of every bumper
 *   scenery(kit) -> [{ mesh, at: [x, y], y, rot, scale, lamps: [{ at, h, color, size, alpha, light }], beams: [{ at, h, length, spread, tilt, speed, color }] }]
 *                toy scenery standing where no ball goes (at is in table units; mesh is in world units,
 *                0.01 per table unit). lamps are glow sprites (and point lights when `light` is a radius);
 *                a lamp with night: true is lit only in the night light (what the dusk sun makes needless).
 *   env, envNight, envDay   overrides of each of the three lighting environments
 *   glints       [[x0, y0, x1, y1], ...] rectangles of open water that sparkle
 *   light        the light the table stands in until it is told another ('dusk' | 'night' | 'day' | 'dawn')
 *   envDawn      the fourth environment (without it, dawn takes `env`)
 *   booth        colours of the reel booth: { awning: [a, b], post: [side, cap], fascia: [side, cap], back, bulbs: [a, b], pillar: [body, cap], deck: [side, cap] }
 *   head(kit) -> [mesh, ...]   more of the booth, in world units (its roof is y = 0.97 from z = -5.1 to -4.62; the collector stands at [0, 1.32, -4.86])
 *   labelAt      { id: [x, y] } where an element's name plate goes when its own place will not do
 *
 * scenery(kit) and head(kit) are given { table, P, WX, WZ, S, lay, YAW, bollard, prism, stadium, rectPts, capped }.
 * Vessery's art is below; the other seven tables' is table-art.js.
 */
export const TABLE_ART = {};
export function registerTableArt(id, art) { TABLE_ART[id] = art; return art; }
for (const id of Object.keys(ART)) registerTableArt(id, ART[id]);

// ---- Vessery: the harbour on festival evening

function vLighthouse(P) {
  const seg = 18, R = (y) => 0.2 - 0.07 * (y / 0.9), parts = [];
  parts.push(tint(cylinder(0.27, 0.24, 0.07, seg), '#e6def2'));
  const stops = [0.07, 0.28, 0.48, 0.68, 0.9];
  for (let i = 0; i < stops.length - 1; i++) parts.push(tint(lathe([[R(stops[i]), stops[i]], [R(stops[i + 1]), stops[i + 1]]], seg, { crease: 180 }), i % 2 ? P.cream : P.coral));
  parts.push(tint(lathe([[R(0.9), 0.89], [0.2, 0.91], [0.2, 0.94], [0, 0.94]], seg), P.ink2));
  parts.push(setGlow(tint(place(cylinder(0.1, 0.1, 0.15, 12, { caps: false }), 0, 0.94, 0), P.glass), 1));
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; parts.push(tint(place(box(0.018, 0.16, 0.018), Math.cos(a) * 0.1, 1.02, Math.sin(a) * 0.1), P.ink2)); }
  parts.push(tint(lathe([[0, 1.09], [0.16, 1.09], [0.15, 1.11], [0.03, 1.25], [0, 1.26]], seg), P.coral));
  parts.push(tint(place(sphere(0.028, 8, 6), 0, 1.28, 0), P.gold));
  parts.push(tint(place(roundedBox(0.09, 0.15, 0.05, 0.02, 2), 0.02, 0.14, 0.19), P.woodDark));
  return merge(parts);
}
function vStall(P, a = P.coral, b = P.cream) {
  const parts = [tint(place(roundedBox(0.3, 0.13, 0.17, 0.025, 2), 0, 0.065, 0), P.wood), tint(place(roundedBox(0.34, 0.03, 0.21, 0.012, 2), 0, 0.14, 0), P.cream)];
  for (const x of [-0.15, 0.15]) parts.push(tint(place(cylinder(0.014, 0.014, 0.36, 6), x, 0, -0.08), P.woodDark));
  for (let i = 0; i < 5; i++) parts.push(tint(place(box(0.074, 0.02, 0.27), (i - 2) * 0.074, 0.39, 0.02, 24, 0, 0), i % 2 ? b : a));
  for (const [x, c] of [[-0.09, P.gold], [0, P.coral], [0.09, '#33c9a4']]) parts.push(tint(place(sphere(0.03, 8, 6), x, 0.185, 0.02), c));
  parts.push(setGlow(tint(place(ellipsoid(0.034, 0.042, 0.034, 8, 6), 0.19, 0.3, 0.12), P.glass), 1));
  return merge(parts);
}
function vCrates(P) {
  const crate = (s) => merge(tint(roundedBox(0.16 * s, 0.16 * s, 0.16 * s, 0.015, 2), P.wood), tint(roundedBox(0.175 * s, 0.035 * s, 0.175 * s, 0.01, 2), P.woodDark));
  const barrel = merge(tint(lathe([[0, 0], [0.06, 0], [0.08, 0.09], [0.06, 0.18], [0, 0.18]], 12, { crease: 50 }), P.wood), tint(place(torus(0.074, 0.009, 12, 5), 0, 0.05, 0), P.ink2), tint(place(torus(0.074, 0.009, 12, 5), 0, 0.13, 0), P.ink2));
  return merge(place(crate(1), -0.03, 0.08, -0.04, 0, 14, 0), place(crate(0.75), -0.02, 0.22, -0.03, 0, -20, 0), place(barrel, 0.1, 0, 0.1),
    tint(place(cylinder(0.012, 0.012, 0.4, 6), 0.12, 0, -0.1), P.woodDark), setGlow(tint(place(ellipsoid(0.036, 0.044, 0.036, 8, 6), 0.12, 0.42, -0.1), P.glass), 1));
}
function vBoat(P, sail = P.cream) {
  const hull = tint(prism([[-0.1, 0], [-0.07, -0.05], [0.06, -0.055], [0.15, 0], [0.06, 0.055], [-0.07, 0.05]], 0, 0.06, 0.018), P.coral);
  const deck = tint(prism([[-0.08, 0], [-0.06, -0.035], [0.05, -0.04], [0.12, 0], [0.05, 0.04], [-0.06, 0.035]], 0.055, 0.07, 0.004), P.cream);
  const mast = tint(place(cylinder(0.008, 0.007, 0.3, 6), 0.01, 0.06, 0), P.woodDark);
  const sl = tint(place(extrude([[0, 0], [0.14, 0.02], [0, 0.22]], 0.012), 0.018, 0.1, 0), sail);
  return merge(hull, deck, mast, sl);
}
function vBuoy(P) {
  return merge(tint(lathe([[0, 0], [0.06, 0], [0.065, 0.03], [0.045, 0.08]], 12), P.coral), tint(lathe([[0.045, 0.08], [0.028, 0.14]], 12, { crease: 180 }), P.cream),
    tint(place(cylinder(0.008, 0.008, 0.07, 5), 0, 0.14, 0), P.ink2), setGlow(tint(place(sphere(0.026, 8, 6), 0, 0.225, 0), P.glass), 1));
}
/** A string of paper lanterns between two posts: [x, y, height] in table units and world height. */
function vGarland(P, a, b, n, sag, kit) {
  const A = [kit.WX(a[0]), a[2], kit.WZ(a[1])], B = [kit.WX(b[0]), b[2], kit.WZ(b[1])], pts = [], parts = [];
  for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t - sag * 4 * t * (1 - t), A[2] + (B[2] - A[2]) * t]); }
  parts.push(tint(tube(pts, 0.009, 5, { crease: 180 }), P.woodDark));
  const cols = [P.coral, P.gold, '#33c9a4', P.cream, '#ff7ad1'];
  for (let i = 1; i < n; i++) { const t = i / n, x = A[0] + (B[0] - A[0]) * t, y = A[1] + (B[1] - A[1]) * t - sag * 4 * t * (1 - t), z = A[2] + (B[2] - A[2]) * t; parts.push(setGlow(tint(place(ellipsoid(0.05, 0.06, 0.05, 10, 6), x, y - 0.06, z), cols[i % cols.length]), 0.75)); }
  for (const p of [A, B]) parts.push(tint(place(cylinder(0.02, 0.016, p[1] + 0.02, 6), p[0], 0, p[2]), P.woodDark), tint(place(sphere(0.03, 8, 6), p[0], p[1] + 0.02, p[2]), P.gold));
  return merge(parts);
}

registerTableArt('vessery', {
  palette: { sea: ['#2b86dc', '#35b0e6', '#5fdad4'] },
  groups: { lanterns: '#ff9a3d', seals: '#5b8cf0' },
  glints: [[70, 350, 300, 560], [130, 560, 245, 700]],
  paint(k) {
    const { g, P } = k;
    k.sea(P.sea);
    // the sun's road down the harbour, and wave marks
    { const gr = g.createLinearGradient(110, 0, 264, 0); gr.addColorStop(0, 'rgba(255,214,120,0)'); gr.addColorStop(0.5, 'rgba(255,224,140,0.5)'); gr.addColorStop(1, 'rgba(255,214,120,0)'); g.fillStyle = gr; g.fillRect(110, 300, 154, 500); }
    const r = rng(21); g.fillStyle = 'rgba(255,244,190,0.85)';
    for (let i = 0; i < 46; i++) { const y = 350 + r() * 420, w = 6 + r() * 22, x = 187 + (r() - 0.5) * (40 + (y - 350) * 0.16); g.beginPath(); rrect(g, x - w / 2, y, w, 2.6, 1.3); g.fill(); }
    k.waves(7, 70, 'rgba(255,255,255,0.75)', [20, 340, 360, 790]);
    k.waves(9, 40, 'rgba(24,110,190,0.4)', [20, 340, 360, 790], 12);
    // the drain: a whirl between the flippers
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2.4; g.lineCap = 'round';
    for (let j = 0; j < 3; j++) { g.beginPath(); for (let i = 0; i <= 30; i++) { const a = j * 2.1 + i * 0.16, rad = 6 + i * 1.25; g.lineTo(187 + Math.cos(a) * rad * 1.25, 772 + Math.sin(a) * rad * 0.5); } g.stroke(); }

    // the festival square at the head of the harbour
    const square = [[-20, -20], [420, -20], [420, 300], [372, 322], [322, 316], [276, 334], [232, 322], [187, 342], [142, 322], [98, 334], [52, 316], [2, 322], [-20, 300]];
    k.land(square, '#ffe6ae');
    k.cobbles(square, '#f2cc8a', 4, 16);
    // a mosaic sun under the drums
    g.save(); g.translate(187, 214);
    for (let i = 0; i < 16; i++) { g.rotate(TAU / 16); g.fillStyle = i % 2 ? '#ffc56a' : '#fff3cf'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 84, -TAU / 32, TAU / 32); g.closePath(); g.fill(); }
    g.restore();
    g.strokeStyle = P.ink; g.lineWidth = 1.6; g.beginPath(); g.arc(187, 214, 84, 0, 7); g.stroke();
    g.strokeStyle = '#ff9a4d'; g.lineWidth = 5; g.beginPath(); g.arc(187, 214, 78, 0, 7); g.stroke();
    // the lot lanes: a striped carpet
    for (let i = 0; i < 3; i++) { g.fillStyle = ['#ff7a5c', '#ffd24a', '#4fd0b4'][i]; g.fillRect(127 + i * 40, 66, 40, 60); }
    g.strokeStyle = P.ink; g.lineWidth = 1.4; g.strokeRect(127, 66, 120, 60);
    // the lighthouse stands on a green
    k.land([[2, 2], [60, 4], [112, 14], [122, 60], [121, 112], [58, 144], [4, 196]], '#8be05a', { shallow: null, foam: '#fff6dc', grow: 5, smoothed: false });
    const rr = rng(5); g.fillStyle = '#a8ee6e'; for (let i = 0; i < 14; i++) { g.beginPath(); g.ellipse(14 + rr() * 90, 22 + rr() * 110, 7 + rr() * 6, 4 + rr() * 3, rr() * 3, 0, 7); g.fill(); }
    // pier and dock: plank decks down each side
    const pier = [[4, 232], [44, 232], [44, 328], [116, 430], [72, 448], [4, 356]];
    k.planks(pier, [24, 232], [24, 440]); k.planks(k.mirror(pier), [350, 232], [350, 440]);
    const wedge = [[4, 356], [72, 448], [4, 484]];
    k.land(wedge, '#ffe6ae', { smoothed: false, grow: 6 }); k.land(k.mirror(wedge), '#ffe6ae', { smoothed: false, grow: 6 });
    // the lower quays, either side of the flippers
    const quay = [[-20, 500], [10, 500], [40, 540], [76, 566], [112, 664], [130, 702], [124, 716], [86, 701], [62, 700], [47, 707], [39, 721], [36, 744], [36, 830], [-20, 830]];
    k.land(quay, '#ffe6ae', { smoothed: false }); k.cobbles(quay, '#f2cc8a', 8, 16);
    k.land(k.mirror(quay), '#ffe6ae', { smoothed: false }); k.cobbles(k.mirror(quay), '#f2cc8a', 9, 16);
    for (const m of [false, true]) { // sling islands: striped like a beach windbreak
      const tri = [[72, 574], [72, 648], [108, 664]].map((p) => (m ? [374 - p[0], p[1]] : p));
      g.save(); k.path(tri); g.clip(); for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#ff7a5c' : '#fff3cf'; g.fillRect(40 + i * 9 + (m ? 190 : 0), 560, 9, 120); } g.restore();
      k.path(tri); g.strokeStyle = P.ink; g.lineWidth = 1.6; g.stroke();
    }
    // the plunger lane
    k.planks([[366, 110], [396, 110], [396, 800], [366, 800]], [380, 110], [380, 800], { step: 14 });
    g.strokeStyle = P.cream; g.lineWidth = 3; g.lineJoin = 'round'; g.lineCap = 'round';
    for (let y = 700; y > 200; y -= 70) { g.beginPath(); g.moveTo(372, y); g.lineTo(379, y - 9); g.lineTo(386, y); g.stroke(); }
    // a compass on the water under the name
    g.save(); g.translate(187, 610); g.globalAlpha = 0.75;
    g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 30, 0, 7); g.stroke();
    k.star(0, 0, 38, 8, 4, '#ffffff'); g.rotate(Math.PI / 4); k.star(0, 0, 22, 6, 4, 'rgba(255,255,255,0.7)'); g.restore();
    k.ribbon(187, 499, 132, 16, '#ff6b57');
  },
  bumperTop(g, w, h) {
    g.fillStyle = '#fff3cf'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.49, 0, 7); g.fill();
    g.strokeStyle = '#ff9a3d'; g.lineWidth = w * 0.07; g.lineCap = 'round';
    g.beginPath(); for (let i = 0; i <= 44; i++) { const a = i * 0.3, r = w * (0.04 + i * 0.0085); g.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); } g.stroke();
    g.fillStyle = '#ff5a4a'; for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; g.beginPath(); g.arc(w / 2 + Math.cos(a) * w * 0.43, h / 2 + Math.sin(a) * w * 0.43, w * 0.035, 0, 7); g.fill(); }
  },
  scenery(kit) {
    const { P } = kit;
    return [
      { name: 'lighthouse', mesh: vLighthouse(P), at: [54, 76], scale: 1.15, lamps: [{ at: [54, 76], h: 1.18, color: '#ffe08a', size: 1.1, alpha: 0.55 }, { at: [60, 120], h: 0.4, color: '#ffe08a', size: 0.5, alpha: 0.0, light: 1.3, night: true }], beams: [{ at: [54, 76], h: 1.17, length: 3.4, spread: 0.55, tilt: 74, speed: 34 }] },
      { name: 'stall', mesh: vStall(P), at: [27, 430], rot: 62 * YAW_SIGN, scale: 0.92, lamps: [{ at: [44, 440], h: 0.3, color: '#ffb347', size: 0.42, alpha: 0.7, light: 0.9 }] },
      { name: 'crates', mesh: vCrates(P), at: [352, 428], rot: -20, scale: 0.95, lamps: [{ at: [362, 418], h: 0.42, color: '#ffb347', size: 0.42, alpha: 0.7, light: 0.9 }] },
      { name: 'buoyL', mesh: vBuoy(P), at: [84, 630], lamps: [{ at: [84, 630], h: 0.225, color: '#ffd24a', size: 0.3, alpha: 0.6 }] },
      { name: 'buoyR', mesh: vBuoy(P), at: [290, 630], lamps: [{ at: [290, 630], h: 0.225, color: '#ffd24a', size: 0.3, alpha: 0.6 }] },
      { name: 'boatL', mesh: vBoat(P), at: [84, 752], rot: 28, scale: 1.25 },
      { name: 'boatR', mesh: vBoat(P, '#ffd24a'), at: [292, 756], rot: 150, scale: 1.15 },
      { name: 'garland', mesh: vGarland(P, [-10, 168, 0.72], [410, 150, 0.72], 13, 0.2, kit), at: [200, 400],
        lamps: [[70, 166], [200, 172], [330, 158]].map((at, i) => ({ at, h: 0.5, color: ['#ff9a5a', '#ffd27a', '#ff8fb8'][i], size: 0.9, alpha: 0.4, light: 1.5, night: true })) },
      { name: 'stall2', mesh: vStall(P, '#33c9a4', P.cream), at: [374, 26], rot: 215, scale: 0.62 },
    ];
  },
});
