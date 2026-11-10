// The art of the seven tables after Vessery: for each, a playfield painting, toy scenery, a palette, a themed
// reel booth and its own weather. table3d.js registers every entry of ART (see TABLE_ART there for the fields).
//
// Nothing here knows about the game: a table's art reads only its Table (walls, lanes, banks) so the
// painting follows the data. geo(table) finds the shapes every table has (the two side decks, the wedges
// under them, the sling islands, the lot lanes, the quays beside the flippers) so a painter names them
// instead of copying coordinates.
//
// Scenery stands only where no ball goes: the wedges, the corners outside the top arch, under the
// flipper guides, the head of the cabinet, and overhead on lines strung above ball height.

import { rng, DEG } from './math.js';
import { sphere, ellipsoid, cylinder, lathe, torus, box, roundedBox, extrude, tube, merge, tint, place, setGlow } from './mesh.js';

const TAU = Math.PI * 2;

// ------------------------------------------------------------------------------------ what the data says is where

const near = (p, q) => Math.abs(p[0] - q[0]) < 0.8 && Math.abs(p[1] - q[1]) < 0.8;
function geo(t) {
  const W = t.walls;
  const from = (p) => W.find((w) => near(w.a, p));
  // the wedge under each side lane: a wall leaving the side at x, coming in, and going back
  const wedge = (x, inward) => {
    const w = W.find((q) => Math.abs(q.a[0] - x) < 1 && q.a[1] > 320 && q.a[1] < 420 && inward(q.b[0]) && q.b[1] > q.a[1]);
    if (!w) throw new Error(`table-art: table ${t.id} has no wedge on the side x = ${x}`);
    const back = from(w.b);
    return [w.a, w.b, back ? back.b : [x, w.b[1] + 40]];
  };
  const inner = (lo, hi) => {
    const w = W.find((q) => q.a[0] === q.b[0] && q.a[0] >= lo && q.a[0] <= hi && q.b[1] > q.a[1] && q.a[1] > 150 && q.a[1] < 320);
    if (!w) throw new Error(`table-art: table ${t.id} has no inner lane wall between x = ${lo} and ${hi}`);
    const d = from(w.b);
    return [w.a, w.b, d ? d.b : w.b];
  };
  const wL = wedge(8, (x) => x > 50), wR = wedge(366, (x) => x < 330), iL = inner(38, 46), iR = inner(328, 338);
  const sling = (s) => { const pts = [s.a]; let cur = s.a; for (let n = 0; n < 6 && !near(cur, s.b); n++) { const w = W.find((q) => near(q.a, cur) && !pts.some((p) => near(p, q.b))) ; if (!w) break; pts.push(w.b); cur = w.b; } return pts; };
  const fl = t.flippers.find((f) => f.id === 'fl'), px = fl.pivot[0], py = fl.pivot[1];
  const sl = t.slings.map(sling), st = sl[0][1], sb = sl[0][3] || sl[0][2];
  const quayL = [[-20, wL[2][1] + 20], [10, wL[2][1] + 20], [40, (wL[2][1] + st[1]) / 2 + 13], [st[0] + 4, st[1] - 8], [sb[0] + 4, sb[1]], [px + 10, py + 4], [px + 4, py + 18], [px - 34, py + 3], [px - 58, py + 2], [px - 73, py + 9], [px - 81, py + 23], [px - 84, py + 46], [px - 84, 830], [-20, 830]];
  const mir = (pts) => pts.map((p) => [374 - p[0], p[1]]);
  const fill = t.reels.fill.map((id) => t.rollovers.find((r) => r.id === id).pos), d = fill[1][0] - fill[0][0];
  return {
    wL, wR, iL, iR, mir, px, py,
    wedgeL: [[4, wL[0][1] + 6], [wL[1][0] - 2, wL[1][1] + 8], [4, wL[2][1] + 4]],
    wedgeR: [[370, wR[0][1] + 6], [wR[1][0] + 2, wR[1][1] + 8], [370, wR[2][1] + 4]],
    deckL: [[4, iL[0][1] - 18], [iL[0][0] + 2, iL[0][1] - 18], [iL[1][0] + 2, iL[1][1] - 2], [iL[2][0] + 4, iL[2][1]], [wL[1][0] - 2, wL[1][1] + 8], [4, wL[0][1] + 6]],
    deckR: [[370, iR[0][1] - 18], [iR[0][0] - 2, iR[0][1] - 18], [iR[1][0] - 2, iR[1][1] - 2], [iR[2][0] - 4, iR[2][1]], [wR[1][0] + 2, wR[1][1] + 8], [370, wR[0][1] + 6]],
    slings: sl, quayL, quayR: mir(quayL),
    lanes: { x: fill[0][0] - d / 2, y: fill[0][1] - 30, w: d, h: 60, n: fill.length },
    plunger: [[366, 110], [396, 110], [396, 800], [366, 800]],
    shore: Math.max(wL[1][1], wR[1][1]),
  };
}
const centroid = (pts) => { let x = 0, y = 0; for (const p of pts) { x += p[0]; y += p[1]; } return [x / pts.length, y / pts.length]; };

// ------------------------------------------------------------------------------------ brushes

function rr(g, x, y, w, h, r) { const q = Math.min(r, w / 2, h / 2); g.moveTo(x + q, y); g.arcTo(x + w, y, x + w, y + h, q); g.arcTo(x + w, y + h, x, y + h, q); g.arcTo(x, y + h, x, y, q); g.arcTo(x, y, x + w, y, q); g.closePath(); }
const inside = (k, pts, fn, smoothed = false) => { const g = k.g; g.save(); if (smoothed) k.smooth(pts); else k.path(pts); g.clip(); fn(); g.restore(); };
const edge = (k, pts, w = 1.6, col = k.P.ink) => { const g = k.g; k.path(pts); g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'round'; g.stroke(); };
const fillPts = (k, pts, col) => { k.path(pts); k.g.fillStyle = col; k.g.fill(); };
/** Bands of colour across a clipped shape, at an angle. */
function stripes(k, pts, cols, w, angle = 0, smoothed = false) {
  inside(k, pts, () => { const g = k.g, c = centroid(pts); g.translate(c[0], c[1]); g.rotate(angle); for (let i = -40; i < 40; i++) { g.fillStyle = cols[((i % cols.length) + cols.length) % cols.length]; g.fillRect(i * w, -500, w + 0.5, 1000); } }, smoothed);
}
/** A chequer of two colours inside a shape. */
function chequer(k, pts, a, b, size, angle = 0, smoothed = false) {
  inside(k, pts, () => { const g = k.g, c = centroid(pts); g.fillStyle = a; g.fillRect(-100, -100, 700, 1100); g.translate(c[0], c[1]); g.rotate(angle); g.fillStyle = b; for (let i = -34; i < 34; i++) for (let j = -34; j < 34; j++) if ((i + j) & 1) g.fillRect(i * size, j * size, size, size); }, smoothed);
}
/** Ruled lines inside a shape. */
function ruled(k, pts, col, step, angle = 0, lw = 1.2, smoothed = false) {
  inside(k, pts, () => { const g = k.g, c = centroid(pts); g.translate(c[0], c[1]); g.rotate(angle); g.strokeStyle = col; g.lineWidth = lw; for (let i = -60; i < 60; i++) { g.beginPath(); g.moveTo(i * step, -600); g.lineTo(i * step, 600); g.stroke(); } }, smoothed);
}
function pool(k, x, y, r, col, a = 0.8) {
  const g = k.g, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.save(); g.globalAlpha = a; g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.restore();
}
function disc(k, x, y, r, fill, ink = k.P.ink, lw = 1.6) { const g = k.g; g.beginPath(); g.arc(x, y, r, 0, 7); if (fill) { g.fillStyle = fill; g.fill(); } if (ink) { g.strokeStyle = ink; g.lineWidth = lw; g.stroke(); } }
/** Specks: n dots or dashes scattered in a rectangle. */
function specks(k, seed, n, col, [x0, y0, x1, y1], r = 1.4, long = 0) {
  const g = k.g, R = rng(seed); g.fillStyle = col;
  for (let i = 0; i < n; i++) { const x = x0 + R() * (x1 - x0), y = y0 + R() * (y1 - y0), s = r * (0.6 + R() * 0.9); g.beginPath(); if (long) g.ellipse(x, y, s * long, s, R() * 3, 0, 7); else g.arc(x, y, s, 0, 7); g.fill(); }
}
function whirl(k, x, y, col, s = 1) {
  const g = k.g; g.strokeStyle = col; g.lineWidth = 2.4; g.lineCap = 'round';
  for (let j = 0; j < 3; j++) { g.beginPath(); for (let i = 0; i <= 30; i++) { const a = j * 2.1 + i * 0.16, rad = (6 + i * 1.25) * s; g.lineTo(x + Math.cos(a) * rad * 1.25, y + Math.sin(a) * rad * 0.5); } g.stroke(); }
}
/** The three lot lanes as a runner of carpet. */
function carpet(k, G, cols, inkLine = true) {
  const g = k.g, L = G.lanes;
  for (let i = 0; i < L.n; i++) { g.fillStyle = cols[i % cols.length]; g.fillRect(L.x + i * L.w, L.y, L.w, L.h); }
  if (inkLine) { g.strokeStyle = k.P.ink; g.lineWidth = 1.4; g.strokeRect(L.x, L.y, L.w * L.n, L.h); }
}
/** The plunger lane: boards, and chevrons pointing up it. */
function lane(k, G, fill, line, chev) {
  const g = k.g;
  k.planks(G.plunger, [380, 110], [380, 800], { fill, line, step: 14 });
  g.strokeStyle = chev; g.lineWidth = 3; g.lineJoin = 'round'; g.lineCap = 'round';
  for (let y = 720; y > 200; y -= 75) { g.beginPath(); g.moveTo(372, y - 28); g.lineTo(379, y - 37); g.lineTo(386, y - 28); g.stroke(); }
}
/** Sling islands in stripes. */
function slingArt(k, G, cols, w = 9, angle = 0) { for (const s of G.slings) { stripes(k, s, cols, w, angle); edge(k, s); } }
/** A flat shape with an ink edge. */
function slab(k, pts, col, ink = true) { fillPts(k, pts, col); if (ink) edge(k, pts); }
/** Little roofs seen from above: [x, y, w, h, angle] each, two tones either side of the ridge. */
function roofs(k, list, a, b, ink = k.P.ink, shade = 'rgba(40,60,120,0.3)', chimney = '#fff6dc') {
  const g = k.g;
  for (const [x, y, w, h, an = 0] of list) {
    g.save(); g.translate(x + 3, y + 5); g.rotate(an); g.fillStyle = shade; g.fillRect(-w / 2, -h / 2, w, h); g.restore();   // the shadow it stands in
    g.save(); g.translate(x, y); g.rotate(an); g.fillStyle = a; g.fillRect(-w / 2, -h / 2, w, h / 2); g.fillStyle = b; g.fillRect(-w / 2, 0, w, h / 2);
    g.strokeStyle = ink; g.lineWidth = 1.3; g.lineJoin = 'round'; g.strokeRect(-w / 2, -h / 2, w, h); g.beginPath(); g.moveTo(-w / 2, 0); g.lineTo(w / 2, 0); g.stroke();
    g.fillStyle = chimney; g.fillRect(w * 0.2, -h * 0.34, 4.5, 4.5); g.strokeRect(w * 0.2, -h * 0.34, 4.5, 4.5); g.restore();
  }
}
const star = (k, x, y, r0, r1, n, fill, rot = 0) => { const g = k.g; g.save(); g.translate(x, y); g.rotate(rot); k.star(0, 0, r0, r1, n, fill); g.restore(); };

// ------------------------------------------------------------------------------------ toy parts

const cyl = (r0, r1, h, seg = 8) => cylinder(r0, r1, h, seg);
/** A house: walls and a pitched roof, ridge along z. w x h x d, roof rising rh. */
function hut(w, h, d, rh, wall, roof, over = 0.03) {
  return merge(tint(place(box(w, h, d), 0, h / 2, 0), wall), tint(place(extrude([[-w / 2 - over, 0], [w / 2 + over, 0], [0, rh]], d + over * 2, { crease: 30 }), 0, h, 0), roof));
}
const glowBox = (w, h, d, x, y, z, col) => setGlow(tint(place(box(w, h, d), x, y, z), col), 1);
/** A round tower in bands, bottom to top. */
function tower(r0, r1, h, bands, seg = 12) {
  const parts = [], n = bands.length;
  for (let i = 0; i < n; i++) { const a = i / n, b = (i + 1) / n; parts.push(tint(lathe([[r0 + (r1 - r0) * a, h * a], [r0 + (r1 - r0) * b, h * b]], seg, { crease: 180 }), bands[i])); }
  return merge(parts);
}
/** A heap: a cone with a soft top. */
const heap = (r, h, col, seg = 9) => tint(lathe([[0, 0], [r, 0], [r * 0.55, h * 0.62], [r * 0.18, h * 0.96], [0, h]], seg, { crease: 60 }), col);
function barrel(r, h, body, hoop) { return merge(tint(lathe([[0, 0], [r * 0.8, 0], [r, h * 0.5], [r * 0.8, h], [0, h]], 8, { crease: 50 }), body), tint(place(torus(r * 0.93, r * 0.11, 8, 4), 0, h * 0.28, 0), hoop), tint(place(torus(r * 0.93, r * 0.11, 8, 4), 0, h * 0.72, 0), hoop)); }
function crate(s, body, band) { return merge(tint(place(roundedBox(s, s, s, s * 0.09, 2), 0, s / 2, 0), body), tint(place(box(s * 1.08, s * 0.2, s * 1.08), 0, s / 2, 0), band)); }
function boat(hull, deck, sail, mast = '#6a4a32') {
  const parts = [
    tint(extrudeY([[-0.1, 0], [-0.07, -0.05], [0.06, -0.055], [0.15, 0], [0.06, 0.055], [-0.07, 0.05]], 0, 0.06), hull),
    tint(extrudeY([[-0.08, 0], [-0.06, -0.035], [0.05, -0.04], [0.12, 0], [0.05, 0.04], [-0.06, 0.035]], 0.055, 0.07), deck),
  ];
  if (sail) parts.push(tint(place(cyl(0.008, 0.007, 0.3, 5), 0.01, 0.06, 0), mast), tint(place(extrude([[0, 0], [0.14, 0.02], [0, 0.22]], 0.012), 0.018, 0.1, 0), sail));
  return merge(parts);
}
/** A flat plan outline [[x, z], ...] standing from y0 to y1 (no bevel: for small things). */
function extrudeY(outline, y0, y1) {
  const m = extrude(outline.map((p) => [p[0], -p[1]]), y1 - y0, { crease: 35 });
  for (const A of [m.positions, m.normals, m.onormals]) for (let i = 0; i < A.length; i += 3) { const y = A[i + 1], z = A[i + 2]; A[i + 1] = z; A[i + 2] = -y; }
  for (let i = 1; i < m.positions.length; i += 3) m.positions[i] += (y0 + y1) / 2;
  return m;
}
/** A post with a flag flying toward +x. */
function flag(h, pole, col, col2 = null, w = 0.2, fh = 0.12) {
  const parts = [tint(cyl(0.012, 0.01, h, 5), pole), tint(place(sphere(0.02, 6, 4), 0, h + 0.01, 0), '#ffc93a'), tint(place(box(w, fh, 0.012), w / 2 + 0.01, h - fh / 2 - 0.01, 0), col)];
  if (col2) parts.push(tint(place(box(w * 0.34, fh * 1.02, 0.016), w * 0.5, h - fh / 2 - 0.01, 0), col2));
  return merge(parts);
}
/** A fluted column on a plinth, with a cap. */
function column(h, r, body, cap, seg = 8) {
  return merge(tint(place(box(r * 3, r * 0.7, r * 3), 0, r * 0.35, 0), cap), tint(place(cyl(r, r * 0.86, h, seg), 0, r * 0.7, 0), body), tint(place(box(r * 2.7, r * 0.6, r * 2.7), 0, h + r, 0), cap));
}
/** A line strung between two posts above ball height, with n things hanging from it. a, b: [x, y, height]. */
function span(kit, a, b, n, sag, thing, cord, post, knob = '#ffc93a') {
  const A = [kit.WX(a[0]), a[2], kit.WZ(a[1])], B = [kit.WX(b[0]), b[2], kit.WZ(b[1])], pts = [], parts = [];
  const at = (t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t - sag * 4 * t * (1 - t), A[2] + (B[2] - A[2]) * t];
  for (let i = 0; i <= 12; i++) pts.push(at(i / 12));
  parts.push(tint(tube(pts, 0.009, 4, { crease: 180 }), cord));
  for (let i = 1; i < n; i++) { const p = at(i / n), m = thing(i); if (m) parts.push(place(m, p[0], p[1], p[2])); }
  for (const p of [A, B]) parts.push(tint(place(cyl(0.02, 0.016, p[1] + 0.02, 5), p[0], 0, p[2]), post), tint(place(sphere(0.03, 6, 4), p[0], p[1] + 0.02, p[2]), knob));
  return merge(parts);
}
const glowBall = (r, col, g = 0.8) => setGlow(tint(ellipsoid(r, r * 1.2, r, 7, 5), col), g);
/** A lump of rock. */
function rock(rx, ry, rz, col, seed = 1) {
  const R = rng(seed), m = ellipsoid(rx, ry, rz, 7, 4);
  for (let i = 0; i < m.positions.length; i += 3) { const k = 0.82 + R() * 0.3; m.positions[i] *= k; m.positions[i + 2] *= k; if (m.positions[i + 1] < 0) m.positions[i + 1] = 0; }
  return tint(m, col);
}
/** A wheel standing in the xy plane (its axle along z). */
function wheel(R, r, rim, spoke, n = 4) {
  const parts = [tint(place(torus(R, r, 12, 4), 0, 0, 0, 90, 0, 0), rim), tint(place(cyl(r * 1.6, r * 1.6, r * 3, 6), 0, 0, -r * 1.5, 90, 0, 0), spoke)];
  for (let i = 0; i < n; i++) parts.push(tint(place(box(R * 2, r * 0.9, r * 0.9), 0, 0, 0, 0, 0, (i * 180) / n), spoke));
  return merge(parts);
}
const yawTo = (kit, deg) => deg * kit.YAW;

export const ART = {};

// ====================================================================================== Saltmere: the salt-mine island
// White ground, slate water, the pit cut in terraces round the three shafts, and the pans below the town
// where brine dries pink. The light is cold: the headframe's lamp, not the sun.

ART.saltmere = {
  light: 'day',
  palette: {
    wall: '#f4f9ff', wallCap: '#3f78b0', coral: '#2f86d8', cream: '#f4f9ff', reel: '#eaf4ff', rail: '#8fa3c0', wood: '#6f84a6', hull: '#56698a', woodDark: '#4a5a78',
    plank: '#eef4fb', plankDark: '#b4c3d8', shallow: '#bfe4e6', socket: '#2a4a78', sea: ['#3f7592', '#4f93a8', '#86c4c0'], groups: ['#ff5a4a', '#8f7fe0'],
  },
  groups: { strike: '#ff5a4a', lien: '#8f7fe0' },
  booth: { awning: ['#5f82ae', '#eaf2fb'], post: ['#6f84a6', '#eaf2fb'], fascia: ['#eaf2fb', '#3f78b0'], back: '#2a3a66', bulbs: ['#9fe4ff', '#d8e4f4'], pillar: ['#d8e4f4', '#3f78b0'] },
  env: { key: { color: '#fff0e4' }, shadow: { tint: '#7f8fd0' }, ambient: { sky: '#d8e4ff', ground: '#8f9ae0' }, water: { deep: '#2f5f80', mid: '#478aa0', shallow: '#9fd4cc', glint: '#f4fbff' } },
  envDay: { key: { color: '#f6fbff' }, shadow: { tint: '#8fa6dc', saturate: 1.2 }, ambient: { sky: '#dcecff', ground: '#e4eeff' }, water: { deep: '#2f6486', mid: '#4a94aa', shallow: '#a8dcd2', glint: '#ffffff' } },
  envNight: { water: { deep: '#0c1c4a', mid: '#173a78', shallow: '#3a78b0' } },
  glints: [[110, 520, 270, 690]],
  labelAt: { shaft2: [226, 266], causewayRamp: [134, 474], orrery: [136, 150] },
  paint(k) {
    const { g, P } = k, G = geo(k.table);
    k.sea(P.sea); k.waves(3, 60, 'rgba(255,255,255,0.6)', [20, 440, 360, 790]);
    // the island: salt, with facets of blue shadow
    const isle = [[-20, -20], [420, -20], [420, 430], [372, 462], [322, 452], [276, 474], [232, 458], [187, 478], [142, 458], [98, 474], [52, 458], [2, 468], [-20, 440]];
    k.land(isle, '#eaf2fb', { shallow: '#bfe4e6', foam: '#ffffff' });
    inside(k, isle, () => {
      const R = rng(11);
      for (let i = 0; i < 110; i++) { const x = R() * 400, y = R() * 470, s = 4 + R() * 7; g.fillStyle = i % 3 ? '#cfddef' : '#ffffff'; g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s * 0.7, y); g.lineTo(x, y + s * 0.5); g.lineTo(x - s * 0.7, y); g.closePath(); g.fill(); }
      // the tub road from the pit to the causeway
      for (const [col, lw, dash] of [['#8fa3c0', 9, []], ['#eaf2fb', 5, []], ['#56698a', 5, [2, 7]]]) { g.strokeStyle = col; g.lineWidth = lw; g.setLineDash(dash); g.beginPath(); g.moveTo(214, 296); g.bezierCurveTo(170, 400, 110, 330, 96, 392); g.stroke(); } g.setLineDash([]);
    }, true);
    // the town: slate roofs, close together against the wind
    roofs(k, [[50, 132, 30, 20, 0.2], [84, 118, 28, 19, 0.2], [58, 164, 28, 19, 0.2], [92, 150, 30, 20, 0.2], [124, 132, 26, 18, 0.2], [74, 198, 26, 18, 0.2], [112, 184, 26, 18, 0.2], [118, 96, 26, 18, 0.2], [140, 58, 26, 18, -0.4]], '#7f9cd0', '#5f7fb8', P.ink, 'rgba(50,80,140,0.28)', '#eaf2fb');
    // stillsalt, standing out of the ground in shards
    for (const [x, y, s] of [[236, 380, 1], [130, 404, 0.8], [330, 110, 0.9], [34, 96, 0.9], [196, 76, 0.8]]) for (const [dx, h, w, c] of [[-6, 15, 6, '#7fd6ff'], [3, 21, 7, '#bff2ff'], [10, 12, 5, '#5fb8ec']]) { g.beginPath(); g.moveTo(x + dx * s, y); g.lineTo(x + (dx - w / 2) * s, y - h * 0.4 * s); g.lineTo(x + dx * s, y - h * s); g.lineTo(x + (dx + w / 2) * s, y - h * 0.4 * s); g.closePath(); g.fillStyle = c; g.fill(); g.strokeStyle = P.ink; g.lineWidth = 1.1; g.stroke(); }
    // the pit: terraces stepping down to the shafts
    const pit = (r, col) => { k.smooth([[226, 150 - r * 0.2], [300 + r * 0.25, 138 - r * 0.2], [322 + r * 0.2, 232], [316 + r * 0.25, 318 + r * 0.25], [258, 338 + r * 0.3], [214 - r * 0.3, 262], [208 - r * 0.2, 190]]); g.fillStyle = col; g.fill(); g.strokeStyle = P.ink; g.lineWidth = 1.2; g.stroke(); };
    pit(26, '#c3d4ea'); pit(14, '#93abd0'); pit(2, '#6681b4'); pit(-12, '#465c94');
    // the orrery's race: brass, ticked like an instrument, with the lamp's cold pool at its head
    const race = [[177, 140], [192, 124], [207, 140], [186, 300], [179, 356], [149, 356], [156, 300]];
    slab(k, race, '#ffcf5a'); inside(k, race, () => { g.strokeStyle = '#b97f1c'; g.lineWidth = 1.4; for (let y = 150; y < 356; y += 10) { g.beginPath(); g.moveTo(140, y); g.lineTo(215, y - 6); g.stroke(); } });
    pool(k, 189, 160, 46, '#bff2ff', 0.95); disc(k, 189, 160, 21, null, '#ffffff', 2.2);
    // the salt lanes, and the picket line
    carpet(k, G, ['#ffc9d8', '#ffffff', '#bfeaf2']);
    const picket = [[52, 300], [118, 236], [134, 252], [68, 316]];
    stripes(k, picket, ['#ff5a4a', '#ffffff'], 10, 0.2); edge(k, picket);
    // the causeway up the left, white road with marker stones; the bench's flagged court up the right
    slab(k, G.deckL, '#ffffff'); inside(k, G.deckL, () => { g.fillStyle = '#9fb6d4'; for (let y = 200; y < 480; y += 14) { g.fillRect(9, y, 5, 5); g.fillRect(G.iL[0][0] - 7 + Math.max(0, (y - G.iL[1][1]) * 0.74), y, 5, 5); } });
    chequer(k, G.deckR, '#dfe8f6', '#93abd0', 12); edge(k, G.deckR);
    slab(k, G.wedgeL, '#dbe8f6'); slab(k, G.wedgeR, '#dbe8f6');
    // the pans: brine drying in squares, pink to white
    const pans = [[66, 538], [308, 538], [300, 600], [262, 690], [112, 690], [74, 600]];
    inside(k, pans, () => {
      const R = rng(8), cols = ['#ffd3de', '#ffb7c8', '#ffe9d2', '#ffffff', '#bfeaf2', '#f6a8c0', '#d8f2f4'];
      g.translate(187, 610); g.rotate(-0.12);
      for (let i = -5; i < 5; i++) for (let j = -4; j < 4; j++) { g.fillStyle = cols[(R() * cols.length) | 0]; g.fillRect(i * 30, j * 26, 30, 26); }
      g.strokeStyle = '#ffffff'; g.lineWidth = 3.4; for (let i = -5; i <= 5; i++) { g.beginPath(); g.moveTo(i * 30, -120); g.lineTo(i * 30, 120); g.stroke(); } for (let j = -4; j <= 4; j++) { g.beginPath(); g.moveTo(-160, j * 26); g.lineTo(160, j * 26); g.stroke(); }
    });
    edge(k, pans, 2);
    k.land(G.quayL, '#f6faff', { smoothed: false, shallow: '#bfe4e6' }); k.land(G.quayR, '#f6faff', { smoothed: false, shallow: '#bfe4e6' });
    for (const q of [G.quayL, G.quayR]) inside(k, q, () => specks(k, 5, 60, '#dbe8f6', [0, 500, 400, 800], 2.4, 1.6));
    slingArt(k, G, ['#2f86d8', '#ffffff'], 9);
    lane(k, G, '#e4edf8', '#b4c3d8', '#3f78b0');
    whirl(k, 187, 772, 'rgba(255,255,255,0.8)');
  },
  bumperTop(g, w, h) {
    g.fillStyle = '#eaf4ff'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.49, 0, 7); g.fill();
    g.fillStyle = '#24406e'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.33, 0, 7); g.fill();
    g.fillStyle = '#7fe0ff'; g.beginPath(); for (let i = 0; i < 12; i++) { const a = (i * Math.PI) / 6, r = w * (i % 2 ? 0.1 : 0.27); g.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); } g.closePath(); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.07, 0, 7); g.fill();
  },
  head(kit) {
    // the winding wheels of the headframe, either side of the collector
    const out = [];
    for (const x of [-0.82, 0.82]) out.push(place(wheel(0.2, 0.022, '#3f78b0', '#eaf2fb'), x, 1.24, -4.86), tint(place(extrude([[-0.2, 0], [0.2, 0], [0.03, 0.26], [-0.03, 0.26]], 0.05), x, 0.97, -4.9), '#6f84a6'));
    return out;
  },
  scenery(kit) {
    const { P } = kit, G = geo(kit.table), cl = centroid(G.wedgeL), cr = centroid(G.wedgeR);
    const frame = merge(
      tint(place(box(0.05, 0.8, 0.05), -0.14, 0.38, 0, 0, 0, -11), '#6f84a6'), tint(place(box(0.05, 0.8, 0.05), 0.14, 0.38, 0, 0, 0, 11), '#6f84a6'),
      tint(place(box(0.34, 0.04, 0.06), 0, 0.3, 0), '#4a5a78'), tint(place(box(0.24, 0.04, 0.06), 0, 0.56, 0), '#4a5a78'),
      place(wheel(0.13, 0.018, '#3f78b0', '#eaf2fb'), 0, 0.82, 0.02),
      place(hut(0.22, 0.14, 0.2, 0.08, '#eaf2fb', '#5f82ae'), 0.02, 0, -0.02), setGlow(tint(place(sphere(0.035, 6, 4), 0, 0.99, 0.02), '#bff2ff'), 1),
    );
    const heaps = merge(place(heap(0.15, 0.2, '#ffffff'), -0.06, 0, 0.02), place(heap(0.1, 0.13, '#f0f6ff'), 0.11, 0, -0.07), place(heap(0.08, 0.1, '#ffd3de'), 0.1, 0, 0.12),
      tint(place(box(0.14, 0.07, 0.09), -0.12, 0.06, -0.16), '#5f82ae'), tint(place(cyl(0.03, 0.03, 0.03, 6), -0.16, 0, -0.16, 0, 0, 0), '#24406e'));
    const bucket = () => merge(tint(place(box(0.008, 0.07, 0.008), 0, -0.035, 0), '#4a5a78'), tint(place(cyl(0.035, 0.05, 0.07, 6), 0, -0.14, 0), '#5f82ae'), tint(place(sphere(0.045, 6, 3), 0, -0.07, 0), '#ffffff'));
    return [
      { name: 'headframe', mesh: frame, at: [cr[0] + 6, cr[1] - 2], rot: yawTo(kit, -24), scale: 1.2, lamps: [{ at: cr, h: 1.2, color: '#bff2ff', size: 0.8, alpha: 0.6, light: 1.1 }] },
      { name: 'heaps', mesh: heaps, at: [cl[0] - 6, cl[1]], rot: yawTo(kit, 20) },
      { name: 'heapL', mesh: merge(place(heap(0.16, 0.2, '#ffffff'), 0, 0, 0), place(heap(0.1, 0.12, '#ffd3de'), 0.16, 0, 0.05)), at: [78, 754] },
      { name: 'heapR', mesh: merge(place(heap(0.15, 0.19, '#ffffff'), 0, 0, 0), place(heap(0.09, 0.11, '#bfeaf2'), -0.15, 0, 0.06)), at: [296, 756] },
      { name: 'ropeway', mesh: span(kit, [-12, 392, 0.78], [412, 356, 0.78], 8, 0.14, bucket, '#4a5a78', '#6f84a6', '#9fe4ff'), at: [200, 400],
        lamps: [[90, 386], [300, 366]].map((at) => ({ at, h: 0.5, color: '#bff2ff', size: 0.8, alpha: 0.35, light: 1.4, night: true })) },
    ];
  },
};

// ====================================================================================== Halcyon: the surety academy
// A parade ground at first light: mown lawns, pale stone, the academy seal under the drill posts, navy and gold.

ART.halcyon = {
  light: 'dawn',
  palette: {
    wall: '#fff8e4', wallCap: '#2f459c', coral: '#3a5fd0', rail: '#ead2a0', wood: '#c9a468', hull: '#b08f5e', plank: '#f1dfb6', plankDark: '#d2b680',
    shallow: '#cfe8c0', socket: '#24306e', sea: ['#f9ecd0', '#f6e4c0', '#f2d9b0'], groups: ['#e0a83a', '#d6263f'],
  },
  groups: { dorm: '#e0a83a', bond: '#d6263f' },
  booth: { awning: ['#2f459c', '#fff8e4'], post: ['#fff8e4', '#e0a83a'], fascia: ['#fff8e4', '#2f459c'], back: '#24306e', bulbs: ['#ffc93a', '#fff8e4'], pillar: ['#fff8e4', '#e0a83a'] },
  env: { key: { dir: [0.5, 0.56, -0.62], color: '#ffe9cc' }, shadow: { tint: '#8f92e6' }, ambient: { sky: '#ffd6d0', ground: '#9aa6ea' }, water: { deep: '#3f78c8', mid: '#62a8de', shallow: '#b0e4d8' } },
  glints: [[150, 716, 224, 790]],
  labelAt: { vault: [187, 292] },
  paint(k) {
    const { g, P } = k, G = geo(k.table);
    k.sea(P.sea);
    // flagstones
    ruled(k, [[0, 0], [400, 0], [400, 800], [0, 800]], 'rgba(201,164,104,0.42)', 22, 0); ruled(k, [[0, 0], [400, 0], [400, 800], [0, 800]], 'rgba(201,164,104,0.42)', 22, Math.PI / 2);
    // the lawns, mown in stripes, either side of the avenue
    const lawnL = [[70, 452], [150, 452], [150, 560], [118, 560], [112, 572], [112, 660], [128, 694], [108, 664], [108, 560], [70, 540]];
    const lawn = [[112, 446], [152, 446], [152, 690], [132, 690], [112, 650]];
    for (const q of [lawn, G.mir(lawn)]) { stripes(k, q, ['#7fd060', '#9be070'], 10, 0); edge(k, q, 3, '#ffffff'); edge(k, q, 1.4); }
    void lawnL;
    // the upper lawns by the banks
    for (const q of [[[50, 150], [104, 96], [110, 150], [70, 236], [50, 236]], [[264, 150], [322, 150], [322, 236], [300, 236]]]) { stripes(k, q, ['#7fd060', '#9be070'], 10, 0.6); edge(k, q, 3, '#ffffff'); edge(k, q, 1.4); }
    // the avenue: a runner of navy with gold edges, to the pool at its foot
    g.fillStyle = '#2f459c'; g.fillRect(166, 440, 42, 270); g.fillStyle = '#ffc93a'; g.fillRect(166, 440, 4, 270); g.fillRect(204, 440, 4, 270);
    g.strokeStyle = P.ink; g.lineWidth = 1.4; g.strokeRect(166, 440, 42, 270);
    const basin = [[142, 722], [232, 722], [244, 800], [130, 800]];
    slab(k, basin, '#3f8fd8'); inside(k, basin, () => { k.waves(4, 14, 'rgba(255,255,255,0.8)', [130, 724, 244, 800], 7); whirl(k, 187, 774, 'rgba(255,255,255,0.8)', 0.8); }); edge(k, basin, 4, '#ffffff'); edge(k, basin, 1.4);
    // the academy seal under the drill posts
    disc(k, 187, 238, 96, '#fff8e4'); disc(k, 187, 238, 90, '#2f459c'); disc(k, 187, 238, 78, '#fff8e4', P.ink, 1.2);
    star(k, 187, 238, 76, 30, 8, '#ffc93a'); star(k, 187, 238, 54, 22, 8, '#e0a83a', Math.PI / 8); disc(k, 187, 238, 22, '#2f459c');
    carpet(k, G, ['#2f459c', '#ffc93a', '#2f459c']);
    // gallery: a cloister floor; parade: raked red gravel with white lines
    chequer(k, G.deckL, '#fff8e4', '#3b3f6a', 11); edge(k, G.deckL);
    slab(k, G.deckR, '#e2705a'); inside(k, G.deckR, () => { g.strokeStyle = '#fff8e4'; g.lineWidth = 2.2; g.setLineDash([9, 7]); for (const x of [342, 356]) { g.beginPath(); g.moveTo(x, 150); g.lineTo(x, 380); g.stroke(); } g.setLineDash([]); });
    // beds in the wedges
    for (const q of [G.wedgeL, G.wedgeR]) { slab(k, q, '#6fc058'); inside(k, q, () => { specks(k, 9, 34, '#ff5a4a', [0, 320, 400, 500], 2.2); specks(k, 12, 26, '#ffd24a', [0, 320, 400, 500], 2); }); }
    for (const q of [G.quayL, G.quayR]) { slab(k, q, '#f6e7c4'); inside(k, q, () => { ruled(k, q, 'rgba(201,164,104,0.5)', 16, 0); ruled(k, q, 'rgba(201,164,104,0.5)', 16, Math.PI / 2); }); edge(k, q); }
    slingArt(k, G, ['#2f459c', '#ffc93a'], 9);
    lane(k, G, '#f1dfb6', '#d2b680', '#2f459c');
    // pennants painted down the avenue
    for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) { const x = 187 + sx * 30, y = 540 + i * 40; g.fillStyle = i % 2 ? '#d6263f' : '#ffc93a'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + sx * 12, y + 5); g.lineTo(x, y + 10); g.closePath(); g.fill(); g.strokeStyle = P.ink; g.lineWidth = 1; g.stroke(); }
  },
  bumperTop(g, w, h) {
    g.fillStyle = '#fff8e4'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.49, 0, 7); g.fill();
    g.fillStyle = '#2f459c'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.4, 0, 7); g.fill();
    g.fillStyle = '#ffc93a'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = w * (i % 2 ? 0.14 : 0.34); g.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); } g.closePath(); g.fill();
  },
  head() {
    const out = [tint(place(extrude([[-1.3, 0], [1.3, 0], [0, 0.2]], 0.06, { crease: 30 }), 0, 0.97, -4.64), '#fff8e4'), tint(place(extrude([[-0.9, 0.03], [0.9, 0.03], [0, 0.15]], 0.07, { crease: 30 }), 0, 0.97, -4.635), '#2f459c')];
    for (const x of [-1.86, 1.86]) out.push(place(flag(0.5, '#c9a468', x < 0 ? '#2f459c' : '#d6263f', '#ffc93a', 0.24, 0.14), x, 0.78, -4.66));
    return out;
  },
  scenery(kit) {
    const G = geo(kit.table), cl = centroid(G.wedgeL), cr = centroid(G.wedgeR);
    const clock = merge(
      tint(place(box(0.34, 0.1, 0.34), 0, 0.05, 0), '#d8c8a0'), tint(place(box(0.26, 0.74, 0.26), 0, 0.47, 0), '#fff8e4'),
      tint(place(box(0.3, 0.05, 0.3), 0, 0.62, 0), '#2f459c'), tint(place(box(0.3, 0.05, 0.3), 0, 0.86, 0), '#e0a83a'),
      tint(place(cylinder(0.2, 0, 0.3, 4), 0, 0.88, 0, 0, 45, 0), '#2f459c'), tint(place(sphere(0.03, 6, 4), 0, 1.2, 0), '#ffc93a'),
      setGlow(tint(place(cyl(0.085, 0.085, 0.02, 10), 0, 0.74, 0.135, 90, 0, 0), '#fff3c0'), 0.9), tint(place(box(0.012, 0.07, 0.012), 0, 0.76, 0.15), '#24306e'), tint(place(box(0.05, 0.012, 0.012), 0.02, 0.74, 0.15), '#24306e'),
    );
    const topiary = (c) => merge(tint(cyl(0.05, 0.06, 0.07, 6), '#e2705a'), tint(place(lathe([[0, 0], [0.09, 0], [0.07, 0.12], [0, 0.26]], 7, { crease: 60 }), 0, 0.07, 0), c));
    const pennant = (i) => tint(place(extrude([[-0.045, 0], [0.045, 0], [0, -0.11]], 0.012), 0, -0.01, 0), ['#2f459c', '#ffc93a', '#d6263f'][i % 3]);
    return [
      { name: 'clock', mesh: clock, at: [38, 44], rot: yawTo(kit, -18), lamps: [{ at: [44, 60], h: 0.74, color: '#ffe9a0', size: 0.5, alpha: 0.5 }, { at: [70, 100], h: 0.4, color: '#ffd9a0', size: 0.5, alpha: 0, light: 1.3, night: true }] },
      { name: 'flagL', mesh: merge(flag(0.62, '#c9a468', '#2f459c', '#ffc93a', 0.26, 0.15), place(topiary('#4fae48'), 0.1, 0, 0.12)), at: [cl[0] - 6, cl[1] - 6] },
      { name: 'flagR', mesh: merge(flag(0.62, '#c9a468', '#d6263f', '#ffc93a', 0.26, 0.15), place(topiary('#4fae48'), -0.12, 0, 0.12)), at: [cr[0] - 2, cr[1] - 6] },
      { name: 'topL', mesh: merge(topiary('#4fae48'), place(topiary('#6fc058'), 0.17, 0, 0.03)), at: [76, 752], scale: 1.2 },
      { name: 'topR', mesh: merge(topiary('#4fae48'), place(topiary('#6fc058'), -0.17, 0, 0.03)), at: [298, 752], scale: 1.2 },
      { name: 'bunting', mesh: span(kit, [-10, 184, 0.72], [410, 184, 0.72], 15, 0.14, pennant, '#fff8e4', '#c9a468'), at: [200, 400],
        lamps: [[110, 170], [264, 170]].map((at) => ({ at, h: 0.5, color: '#ffd9a0', size: 0.8, alpha: 0.3, light: 1.5, night: true })) },
    ];
  },
};

// ====================================================================================== Little Brand: nine years dark
// Black water, slate shingle, foam on the reefs. Nothing on the island is lit but one hearth, and the
// painting keeps to that: every warm colour on the field is within reach of it.

ART.brand = {
  light: 'night',
  palette: {
    wall: '#a4b0d8', wallCap: '#1c2656', coral: '#4a5a9c', cream: '#dfe6ff', white: '#eef2ff', gold: '#ff9a4a', reel: '#dfe6ff', rail: '#3b4472', wood: '#2a3158', woodDark: '#1c2248', hull: '#1c2246', steel: '#7f8cc0',
    plank: '#56618e', plankDark: '#3b4672', shallow: '#234a80', socket: '#0c1230', sea: ['#0a1230', '#0f1e46', '#16335c'], groups: ['#58c8c0', '#ff9a4a'],
    plate: '#0a1030', plateEdge: '#a4b0d8', plateText: '#eef2ff',
  },
  groups: { nets: '#58c8c0', wick: '#ff9a4a' },
  booth: { awning: ['#262f5c', '#56618e'], post: ['#3b4472', '#a4b0d8'], fascia: ['#a4b0d8', '#262f5c'], back: '#141a3c', bulbs: ['#ff9a4a', '#56618e'], pillar: ['#56618e', '#ff9a4a'], deck: ['#3b4472', '#2a3158'] },
  env: { key: { color: '#c4cdf0' }, shadow: { tint: '#3a4290', lift: 0.08 }, ambient: { sky: '#7f8fc8', ground: '#3f4488', amount: 0.11 }, rim: { color: '#c4d0ff' }, water: { deep: '#070d28', mid: '#0e1d4a', shallow: '#234a80', foam: '#b8c6ee', glint: '#9fb4ea', glintDensity: 0.1 } },
  envDay: { key: { color: '#dfe6f6' }, shadow: { tint: '#5a68b0' }, ambient: { sky: '#aab8e0', ground: '#6f78b8' }, water: { deep: '#0c1838', mid: '#16305c', shallow: '#2f5c90', foam: '#d0daf4', glint: '#c4d4f4', glintDensity: 0.12 } },
  envNight: { water: { deep: '#050a22', mid: '#0b1840', shallow: '#1c3c74', glintDensity: 0.08 } },
  glints: [[120, 540, 260, 700]],
  labelAt: { hearth: [322, 262], breakwaterRamp: [146, 482] },
  paint(k) {
    const { g, P } = k, G = geo(k.table);
    k.sea(P.sea);
    k.waves(7, 60, 'rgba(184,198,238,0.5)', [20, 430, 360, 790]); k.waves(9, 30, 'rgba(6,10,34,0.6)', [20, 430, 360, 790], 13);
    // the island: shingle
    const isle = [[-20, -20], [420, -20], [420, 420], [372, 446], [326, 436], [282, 458], [236, 444], [190, 466], [146, 448], [100, 470], [56, 456], [4, 470], [-20, 446]];
    k.land(isle, '#4c5686', { shallow: '#234a80', foam: '#c8d4f6' });
    inside(k, isle, () => { specks(k, 3, 260, '#65709e', [0, 0, 400, 480], 2.6, 1.5); specks(k, 4, 120, '#343d6a', [0, 0, 400, 480], 2.2, 1.4); }, true);
    // the village: every roof dark
    roofs(k, [[212, 96, 30, 20, 0.2], [252, 80, 26, 18, -0.3], [300, 108, 28, 18, 0.4], [176, 256, 26, 18, -0.2], [300, 380, 28, 18, 0.3], [222, 392, 24, 16, -0.4], [60, 236, 26, 18, 0.1], [156, 404, 24, 16, 0.2]], '#3a4474', '#2a3360', '#141a3c', 'rgba(6,10,34,0.45)', '#56618e');
    // reefs: black rock in a ring of foam under each bumper
    for (const b of k.table.bumpers) {
      const R = rng(b.pos[0]), pts = []; for (let i = 0; i < 11; i++) { const a = (i / 11) * TAU, r = b.r + 20 + R() * 14; pts.push([b.pos[0] + Math.cos(a) * r, b.pos[1] + Math.sin(a) * r * 0.9]); }
      k.land(pts, '#1c2248', { shallow: '#2a5a8c', foam: '#dfe6ff', grow: 6 });
    }
    // the hearth: the one warm thing, and what its light reaches
    pool(k, 349, 240, 120, '#ff8a3c', 0.85); pool(k, 349, 240, 56, '#ffd08a', 0.9);
    const hearth = [[318, 214], [364, 190], [364, 268], [320, 268]];
    inside(k, hearth, () => { ruled(k, hearth, 'rgba(60,20,10,0.5)', 9, 0.5); });
    disc(k, 349, 240, 21, null, '#ffe0a0', 2.4);
    // tide lanes: wet slate, each with its mark
    carpet(k, G, ['#2a5a8c', '#234a80', '#2a5a8c']);
    for (let i = 0; i < 3; i++) { const x = G.lanes.x + (i + 0.5) * G.lanes.w; g.strokeStyle = 'rgba(223,230,255,0.8)'; g.lineWidth = 1.8; g.lineCap = 'round'; for (let j = 0; j < 2; j++) { g.beginPath(); g.moveTo(x - 11, G.lanes.y + 8 + j * 7); g.quadraticCurveTo(x - 4, G.lanes.y + 3 + j * 7, x, G.lanes.y + 8 + j * 7); g.quadraticCurveTo(x + 5, G.lanes.y + 12 + j * 7, x + 11, G.lanes.y + 7 + j * 7); g.stroke(); } }
    // nets laid out to dry by the net bank
    const net = [[48, 292], [92, 276], [132, 372], [84, 392]];
    inside(k, net, () => { g.fillStyle = 'rgba(88,200,192,0.18)'; g.fillRect(0, 200, 200, 300); ruled(k, net, 'rgba(120,220,210,0.75)', 8, 0.5, 1); ruled(k, net, 'rgba(120,220,210,0.75)', 8, -0.5, 1); });
    edge(k, net, 1.6, '#58c8c0');
    // the breakwater in blocks; the under-lane in tarred boards, with what little light leaks down it
    slab(k, G.deckL, '#7f8cc0'); inside(k, G.deckL, () => { g.strokeStyle = '#434c78'; g.lineWidth = 1.6; for (let y = 240, r = 0; y < 500; y += 15, r++) { g.beginPath(); g.moveTo(0, y); g.lineTo(140, y); g.stroke(); for (let x = (r % 2) * 12; x < 140; x += 24) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 15); g.stroke(); } } }); edge(k, G.deckL);
    k.planks(G.deckR, [350, 240], [350, 460], { fill: '#2f3760', line: '#1c2248', step: 10 });
    inside(k, G.deckR, () => pool(k, 349, 270, 90, '#ff8a3c', 0.5));
    slab(k, G.wedgeL, '#2f3760'); slab(k, G.wedgeR, '#2f3760');
    for (const q of [G.quayL, G.quayR]) { k.land(q, '#434c78', { smoothed: false, shallow: '#234a80', foam: '#b8c6ee' }); inside(k, q, () => { specks(k, 6, 70, '#56618e', [0, 500, 400, 800], 2.6, 1.5); specks(k, 8, 40, '#2f3760', [0, 500, 400, 800], 2.2, 1.4); }); }
    slingArt(k, G, ['#262f5c', '#56618e'], 9);
    lane(k, G, '#3b4672', '#262f5c', '#a4b0d8');
    whirl(k, 187, 772, 'rgba(184,198,238,0.7)');
    // rain
    g.strokeStyle = 'rgba(200,214,255,0.16)'; g.lineWidth = 1; const R = rng(2); for (let i = 0; i < 120; i++) { const x = R() * 400, y = R() * 800; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 4, y + 13); g.stroke(); }
  },
  bumperTop(g, w, h) {
    g.fillStyle = '#dfe6ff'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.49, 0, 7); g.fill();
    g.fillStyle = '#1c2656'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.4, 0, 7); g.fill();
    g.strokeStyle = '#dfe6ff'; g.lineWidth = w * 0.06; g.lineCap = 'round';
    for (let j = 0; j < 3; j++) { g.beginPath(); g.moveTo(w * 0.24, h * (0.38 + j * 0.13)); g.quadraticCurveTo(w * 0.37, h * (0.3 + j * 0.13), w * 0.5, h * (0.38 + j * 0.13)); g.quadraticCurveTo(w * 0.63, h * (0.46 + j * 0.13), w * 0.76, h * (0.38 + j * 0.13)); g.stroke(); }
  },
  head() {
    // crossed oars over the door, and one storm lantern
    const oar = (rz) => merge(tint(place(cyl(0.014, 0.014, 0.9, 5), 0, -0.45, 0), '#7f8cc0'), tint(place(box(0.07, 0.2, 0.014), 0, 0.5, 0), '#a4b0d8'));
    return [place(oar(), -0.72, 1.08, -4.62, 0, 0, 62), place(oar(), 0.72, 1.08, -4.62, 0, 0, -62)];
  },
  scenery(kit) {
    const G = geo(kit.table), cl = centroid(G.wedgeL), cr = centroid(G.wedgeR);
    // the lamp-tower, shuttered: no flame in it
    const lamp = merge(tint(cyl(0.25, 0.23, 0.07, 10), '#56618e'), tower(0.19, 0.12, 0.84, ['#343d6a', '#a4b0d8', '#343d6a', '#a4b0d8'], 10),
      tint(lathe([[0.12, 0.84], [0.19, 0.86], [0.19, 0.89], [0, 0.89]], 10), '#1c2248'), tint(place(cyl(0.1, 0.1, 0.14, 8), 0, 0.89, 0), '#2f3760'),
      tint(lathe([[0, 1.03], [0.15, 1.03], [0.14, 1.05], [0.03, 1.18], [0, 1.19]], 10), '#1c2248'), tint(place(box(0.02, 0.1, 0.24), 0, 0.96, 0), '#7f8cc0'), tint(place(box(0.24, 0.02, 0.02), 0, 0.96, 0), '#7f8cc0'));
    const cottage = merge(place(hut(0.26, 0.15, 0.22, 0.1, '#56618e', '#262f5c'), 0, 0, 0), glowBox(0.06, 0.07, 0.02, -0.05, 0.08, 0.112, '#ffb060'), tint(place(box(0.05, 0.1, 0.02), 0.07, 0.05, 0.112), '#1c2248'),
      tint(place(box(0.05, 0.12, 0.05), 0.07, 0.27, -0.04), '#434c78'));
    const hauled = merge(place(boat('#56618e', '#262f5c', null), 0, 0.03, 0, 0, 0, 180), place(barrel(0.05, 0.11, '#3b4472', '#7f8cc0'), 0.2, 0, 0.08), place(crate(0.09, '#434c78', '#262f5c'), 0.17, 0, -0.08));
    const float = (i) => merge(tint(place(box(0.006, 0.05, 0.006), 0, -0.025, 0), '#56618e'), tint(place(sphere(0.04, 6, 4), 0, -0.085, 0), i % 3 === 1 ? '#3f8f9c' : '#4a5a9c'));
    return [
      { name: 'darkLamp', mesh: lamp, at: [30, 72], scale: 1.1 },
      { name: 'cottage', mesh: cottage, at: [cr[0] + 4, cr[1] - 2], rot: yawTo(kit, -32), lamps: [{ at: [cr[0] - 6, cr[1] + 8], h: 0.12, color: '#ff9a4a', size: 0.5, alpha: 0.7, light: 0.9 }] },
      { name: 'hauled', mesh: hauled, at: [cl[0] - 4, cl[1]], rot: yawTo(kit, 58) },
      { name: 'rockL', mesh: merge(rock(0.15, 0.13, 0.12, '#262f5c', 3), place(rock(0.09, 0.08, 0.08, '#3b4472', 5), 0.17, 0, 0.06)), at: [78, 756] },
      { name: 'rockR', mesh: merge(rock(0.14, 0.12, 0.12, '#262f5c', 7), place(rock(0.08, 0.07, 0.08, '#3b4472', 9), -0.16, 0, 0.07)), at: [298, 756] },
      { name: 'floats', mesh: span(kit, [-10, 196, 0.7], [410, 176, 0.7], 12, 0.16, float, '#7f8cc0', '#3b4472', '#a4b0d8'), at: [200, 400],
        lamps: [{ at: [349, 240], h: 0.25, color: '#ff8a3c', size: 1.3, alpha: 0.55, light: 1.7 }] },
    ];
  },
};

// ====================================================================================== Tallis: the exchange floor
// Indoors: marble in chequer, an oxblood runner, the pit in brass rings, and a bell for every price.

ART.tallis = {
  light: 'dusk',
  palette: {
    wall: '#ffe7a0', wallCap: '#8a1f38', coral: '#c8283f', rail: '#8a4a32', wood: '#6a3222', woodDark: '#4a2018', hull: '#4a2018', plank: '#b8693e', plankDark: '#8a4a2a',
    shallow: '#f6e8cc', socket: '#3a1428', sea: ['#f6e8cc', '#f2dfc0', '#ecd4b0'], groups: ['#5b8cf0', '#33b98c'],
  },
  groups: { queue: '#5b8cf0', notes: '#33b98c' },
  booth: { awning: ['#8a1f38', '#ffd24a'], post: ['#ffd24a', '#fff6dc'], fascia: ['#fff6dc', '#8a1f38'], back: '#3a1428', bulbs: ['#ffd24a', '#fff6dc'], pillar: ['#fff6dc', '#ffd24a'] },
  env: { key: { color: '#fff0c8' }, shadow: { tint: '#9a6ad0' }, ambient: { sky: '#ffd9a8', ground: '#a070c8' }, water: { deep: '#1c2c5a', mid: '#2f4a80', shallow: '#5f80b0', glint: '#ffe9b0', glintDensity: 0.12 } },
  envNight: { key: { color: '#ffd9a0' }, shadow: { tint: '#6a3a8a', lift: 0.12 }, ambient: { sky: '#c88a6a', ground: '#7a4a8a', amount: 0.16 }, rim: { color: '#ffe9c0' }, water: { deep: '#141a44', mid: '#22306a', shallow: '#4a5a98' } },
  envDay: { water: { deep: '#1f3a6e', mid: '#35609a', shallow: '#7fa6c8' } },
  glints: [[150, 600, 224, 700]],
  labelAt: { pit1: [140, 262], pit2: [238, 182], strongroom: [46, 242], clearingOrbit: [274, 538] },
  paint(k) {
    const { g, P } = k, G = geo(k.table), all = [[0, 0], [400, 0], [400, 800], [0, 800]];
    chequer(k, all, '#f8ecd2', '#e6c9a0', 26, Math.PI / 4);
    // the runner: oxblood, fringed in gold, from the pit to the door
    const runner = [[138, 330], [236, 330], [236, 716], [138, 716]];
    slab(k, runner, '#8a1f38'); inside(k, runner, () => { g.strokeStyle = '#ffd24a'; g.lineWidth = 2.4; g.strokeRect(144, 336, 86, 374); g.fillStyle = '#a82a48'; for (let y = 352; y < 700; y += 26) { g.save(); g.translate(187, y); g.rotate(Math.PI / 4); g.fillRect(-6, -6, 12, 12); g.restore(); } });
    g.fillStyle = '#ffd24a'; for (let x = 140; x < 236; x += 6) g.fillRect(x, 716, 3, 8);
    // the pit: an octagon of steps down, brass at each riser
    const oct = (r, col) => { g.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + TAU / 16; g.lineTo(187 + Math.cos(a) * r, 242 + Math.sin(a) * r); } g.closePath(); g.fillStyle = col; g.fill(); g.strokeStyle = P.ink; g.lineWidth = 1.3; g.stroke(); };
    oct(86, '#ffd24a'); oct(80, '#c8283f'); oct(66, '#ffd24a'); oct(61, '#a82a48'); oct(48, '#ffd24a'); oct(44, '#8a1f38');
    // the strongroom door
    disc(k, 92, 196, 30, '#93a3c4'); disc(k, 92, 196, 23, '#6f80a8', P.ink, 1.2);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; disc(k, 92 + Math.cos(a) * 26.5, 196 + Math.sin(a) * 26.5, 2, '#fff6dc', null); }
    carpet(k, G, ['#ffd24a', '#fff6dc', '#ffd24a']);
    // the queue: a rope line; the notes: a fan of them
    g.strokeStyle = '#c8283f'; g.lineWidth = 3; g.beginPath(); g.moveTo(84, 232); g.quadraticCurveTo(76, 262, 84, 290); g.quadraticCurveTo(76, 318, 84, 346); g.stroke();
    for (const y of [232, 290, 346]) disc(k, 84, y, 4.5, '#ffd24a', P.ink, 1.2);
    for (let i = 0; i < 4; i++) { g.save(); g.translate(300, 228 + i * 24); g.rotate(-0.3 + i * 0.14); g.fillStyle = '#c4ecd0'; g.strokeStyle = P.ink; g.lineWidth = 1.1; g.beginPath(); rr(g, -17, -8, 34, 16, 2); g.fill(); g.stroke(); g.strokeStyle = '#33b98c'; g.lineWidth = 1.4; g.beginPath(); g.arc(0, 0, 4.5, 0, 7); g.stroke(); g.restore(); }
    // the steps in treads; the clearing house in baize
    slab(k, G.deckL, '#fff6dc'); inside(k, G.deckL, () => { for (let y = 230, i = 0; y < 480; y += 13, i++) { g.fillStyle = i % 2 ? '#e6c9a0' : '#fff6dc'; g.fillRect(0, y, 140, 13); g.fillStyle = '#b8936a'; g.fillRect(0, y + 11, 140, 2); } }); edge(k, G.deckL);
    slab(k, G.deckR, '#2f8f6a'); inside(k, G.deckR, () => ruled(k, G.deckR, 'rgba(255,246,220,0.45)', 12, Math.PI / 2, 1)); edge(k, G.deckR, 4, '#ffd24a'); edge(k, G.deckR);
    for (const q of [G.wedgeL, G.wedgeR]) { slab(k, q, '#2f8f6a'); edge(k, q, 3.4, '#ffd24a'); edge(k, q); }
    for (const q of [G.quayL, G.quayR]) { slab(k, q, '#fff6dc'); inside(k, q, () => chequer(k, q, '#fff6dc', '#f0d0a8', 15, 0)); edge(k, q, 4.4, '#8a1f38'); edge(k, q); }
    slingArt(k, G, ['#8a1f38', '#ffd24a'], 9);
    lane(k, G, '#b8693e', '#8a4a2a', '#ffd24a');
    // the drain: a brass grating
    const grate = [[150, 744], [224, 744], [232, 800], [142, 800]];
    slab(k, grate, '#3a1428'); inside(k, grate, () => ruled(k, grate, '#ffd24a', 9, 0, 2.2)); edge(k, grate);
    // ticker tape let fall across the floor
    g.lineCap = 'round';
    for (const [x0, y0, x1, y1, c] of [[20, 548, 126, 520, 30], [250, 532, 356, 556, -26], [248, 650, 300, 600, 20]]) {
      for (const [col, lw] of [[P.ink, 7.2], ['#ffffff', 5]]) { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + c, x1, y1); g.stroke(); }
      g.strokeStyle = P.ink; g.lineWidth = 1; g.setLineDash([2, 4]); g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + c, x1, y1); g.stroke(); g.setLineDash([]);
    }
  },
  bumperTop(g, w, h) {
    g.fillStyle = '#ffd24a'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.49, 0, 7); g.fill();
    g.fillStyle = '#8a1f38'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + TAU / 16; g.lineTo(w / 2 + Math.cos(a) * w * 0.4, h / 2 + Math.sin(a) * w * 0.4); } g.closePath(); g.fill();
    g.fillStyle = '#ffd24a'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + TAU / 16; g.lineTo(w / 2 + Math.cos(a) * w * 0.26, h / 2 + Math.sin(a) * w * 0.26); } g.closePath(); g.fill();
    g.fillStyle = '#c8283f'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.12, 0, 7); g.fill();
  },
  head() {
    const bell = (x) => merge(tint(place(lathe([[0, 0], [0.17, 0], [0.15, 0.05], [0.1, 0.12], [0.08, 0.24], [0, 0.27]], 9, { crease: 60 }), x, 1.0, -4.86), '#ffd24a'), tint(place(sphere(0.04, 6, 4), x, 0.99, -4.86), '#8a4a32'), tint(place(torus(0.035, 0.012, 6, 4), x, 1.29, -4.86, 90, 0, 0), '#8a4a32'));
    return [bell(-0.8), bell(0.8)];
  },
  scenery(kit) {
    const G = geo(kit.table), cl = centroid(G.wedgeL), cr = centroid(G.wedgeR);
    const desk = () => merge(tint(place(box(0.3, 0.14, 0.18), 0, 0.07, 0), '#8a4a32'), tint(place(box(0.34, 0.025, 0.22), 0, 0.15, 0), '#2f8f6a'),
      tint(place(cyl(0.012, 0.012, 0.13, 5), 0.09, 0.16, -0.04), '#ffd24a'), setGlow(tint(place(lathe([[0.065, 0], [0.04, 0.05], [0, 0.055]], 7), 0.09, 0.28, -0.04), '#58e0a0'), 0.9),
      tint(place(box(0.1, 0.012, 0.13), -0.07, 0.17, 0.01), '#fff6dc'), tint(place(box(0.08, 0.2, 0.08), -0.02, 0.1, -0.16), '#6a3222'));
    const coins = merge(...[[0, 0, 5], [0.11, 0.03, 3], [0.05, 0.11, 7], [-0.09, 0.09, 2]].map(([x, z, n]) => tint(place(cyl(0.05, 0.05, 0.025 * n, 8), x, 0, z), n % 2 ? '#ffd24a' : '#ffbf2a')), place(crate(0.12, '#6a3222', '#ffd24a'), -0.12, 0, -0.08));
    const hbell = (i) => merge(tint(place(lathe([[0, -0.11], [0.05, -0.11], [0.04, -0.08], [0.025, -0.02], [0, -0.01]], 7, { crease: 60 }), 0, 0, 0), i % 2 ? '#ffd24a' : '#ffbf2a'), tint(place(sphere(0.014, 5, 3), 0, -0.115, 0), '#8a1f38'));
    const safe = merge(tint(place(roundedBox(0.2, 0.24, 0.18, 0.02, 2), 0, 0.12, 0), '#6f80a8'), tint(place(cyl(0.05, 0.05, 0.02, 8), 0, 0.13, 0.09, 90, 0, 0), '#ffd24a'));
    return [
      { name: 'deskL', mesh: desk(), at: [cl[0] - 2, cl[1]], rot: yawTo(kit, 55), lamps: [{ at: cl, h: 0.3, color: '#7fffb8', size: 0.42, alpha: 0.6, light: 0.9 }] },
      { name: 'deskR', mesh: desk(), at: [cr[0] + 2, cr[1]], rot: yawTo(kit, -55), lamps: [{ at: cr, h: 0.3, color: '#7fffb8', size: 0.42, alpha: 0.6, light: 0.9 }] },
      { name: 'coinsL', mesh: coins, at: [80, 754] }, { name: 'coinsR', mesh: coins, at: [296, 754], rot: 180 },
      { name: 'safe', mesh: safe, at: [22, 26], rot: yawTo(kit, -45), scale: 0.9 },
      { name: 'bells', mesh: span(kit, [-10, 190, 0.74], [410, 190, 0.74], 11, 0.14, hbell, '#8a1f38', '#8a4a32'), at: [200, 400],
        lamps: [[100, 176], [274, 176]].map((at) => ({ at, h: 0.55, color: '#ffe0a0', size: 0.9, alpha: 0.3, light: 1.6, night: true })) },
    ];
  },
};

// ====================================================================================== Kedge: the salt quays
// Dawn behind the cranes. A working quay: concrete, crane rails, hazard paint, and a collier lying in the basin.

ART.kedge = {
  light: 'dawn',
  palette: {
    wall: '#fff3d8', wallCap: '#178f88', coral: '#ff8a2a', rail: '#b9a88c', wood: '#8f7f66', hull: '#6a6478', plank: '#d9b680', plankDark: '#b08d5a',
    shallow: '#ffd0b0', socket: '#22305a', sea: ['#ffb99a', '#f08fa6', '#6a62c0'], groups: ['#5b8cf0', '#d9a35a'],
  },
  groups: { tally: '#5b8cf0', rope: '#d9a35a' },
  booth: { awning: ['#ffc93a', '#2b3a5e'], post: ['#178f88', '#fff3d8'], fascia: ['#fff3d8', '#178f88'], back: '#22305a', bulbs: ['#ff8a2a', '#fff3d8'], pillar: ['#2b3a5e', '#ffc93a'] },
  env: { key: { dir: [-0.66, 0.46, -0.5], color: '#ffe0bc' }, shadow: { tint: '#8a7ad8' }, ambient: { sky: '#ffc8b8', ground: '#8f86e0' }, water: { deep: '#5a54b4', mid: '#b874b0', shallow: '#ffc09a', glint: '#fff0c0', glintDensity: 0.26 } },
  envDay: { water: { deep: '#2f7fc8', mid: '#4fb0dc', shallow: '#a0e4d8' } },
  glints: [[110, 470, 270, 560]],
  labelAt: { hopper: [226, 222], crane1: [142, 300] },
  paint(k) {
    const { g, P } = k, G = geo(k.table);
    k.sea(P.sea);
    // the sun's road, low from the left
    { const gr = g.createLinearGradient(30, 430, 330, 800); gr.addColorStop(0, 'rgba(255,236,170,0.75)'); gr.addColorStop(0.6, 'rgba(255,200,150,0.25)'); gr.addColorStop(1, 'rgba(255,200,150,0)'); g.fillStyle = gr; g.fillRect(0, 430, 400, 370); }
    k.waves(7, 60, 'rgba(255,246,220,0.75)', [20, 440, 360, 790]); k.waves(9, 30, 'rgba(90,70,170,0.4)', [20, 440, 360, 790], 12);
    // the collier in the basin, seen from her masthead
    g.save(); g.translate(187, 640); g.scale(0.74, 0.74); g.lineJoin = 'round';
    const hull = [[0, -84], [22, -58], [26, 40], [18, 74], [-18, 74], [-26, 40], [-22, -58]];
    k.smooth(hull.map((p) => [p[0] * 1.12, p[1] * 1.05 + 4])); g.fillStyle = 'rgba(60,40,120,0.35)'; g.fill();
    k.path(hull); g.fillStyle = '#2b3a5e'; g.fill(); g.strokeStyle = P.ink; g.lineWidth = 1.8; g.stroke();
    k.path(hull.map((p) => [p[0] * 0.8, p[1] * 0.9 + 2])); g.fillStyle = '#e8d8b8'; g.fill(); g.lineWidth = 1.2; g.stroke();
    for (const y of [-44, -10, 24]) { g.fillStyle = '#ffffff'; g.strokeStyle = P.ink; g.beginPath(); rr(g, -13, y, 26, 22, 3); g.fill(); g.stroke(); g.fillStyle = '#dfe6f4'; g.beginPath(); g.ellipse(0, y + 11, 8, 6, 0, 0, 7); g.fill(); }
    g.fillStyle = '#ff8a2a'; g.beginPath(); g.arc(0, 58, 7, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#2b3a5e'; g.beginPath(); g.arc(0, 58, 3.4, 0, 7); g.fill();
    g.restore();
    // the quay: a straight concrete edge with a hazard coping
    const quay = [[-20, -20], [420, -20], [420, 446], [-20, 446]];
    slab(k, quay, '#ece2d0', false);
    inside(k, quay, () => { ruled(k, quay, 'rgba(160,140,110,0.5)', 40, 0, 1.2); ruled(k, quay, 'rgba(160,140,110,0.5)', 40, Math.PI / 2, 1.2); specks(k, 4, 60, 'rgba(160,140,110,0.4)', [0, 0, 400, 446], 2.2, 1.6); });
    const cope = [[-20, 438], [420, 438], [420, 452], [-20, 452]];
    stripes(k, cope, ['#ffc93a', '#2b3a5e'], 9, 0.7); edge(k, cope); g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(0, 453, 400, 3.5);
    // crane rails through the three cranes
    for (const y of [248, 276]) { g.fillStyle = '#8f7f66'; for (let x = 50; x < 326; x += 13) g.fillRect(x, y - 6, 5, 12); g.strokeStyle = P.ink; g.lineWidth = 4.4; g.beginPath(); g.moveTo(46, y); g.lineTo(328, y); g.stroke(); g.strokeStyle = '#aab8dc'; g.lineWidth = 2; g.beginPath(); g.moveTo(46, y); g.lineTo(328, y); g.stroke(); }
    // the hopper's apron, and salt spilled round it
    for (const [x, y, r] of [[268, 150, 20], [292, 176, 14], [180, 160, 15], [162, 184, 10]]) { disc(k, x + 2, y + 3, r, 'rgba(120,100,160,0.35)', null); disc(k, x, y, r, '#ffffff', P.ink, 1.2); disc(k, x - r * 0.2, y - r * 0.2, r * 0.5, '#f0f4ff', null); }
    const apron = [[204, 210], [204, 174], [226, 152], [248, 174], [248, 210]];
    slab(k, apron, '#178f88'); inside(k, apron, () => { g.strokeStyle = '#7fe0d4'; g.lineWidth = 1.6; for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.beginPath(); g.moveTo(226, 188); g.lineTo(226 + Math.cos(a) * 50, 188 + Math.sin(a) * 50); g.stroke(); } });
    carpet(k, G, ['#178f88', '#fff3d8', '#ff8a2a']);
    // tally strokes by the tally bank; rope coiled by the rope bank
    g.strokeStyle = P.ink; g.lineWidth = 2.2; g.lineCap = 'round';
    for (let n = 0; n < 2; n++) { const x0 = 52 + n * 6, y0 = 318 + n * 34; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(x0 + i * 6, y0); g.lineTo(x0 + i * 6 - 2, y0 + 16); g.stroke(); } g.beginPath(); g.moveTo(x0 - 5, y0 + 13); g.lineTo(x0 + 23, y0 + 3); g.stroke(); }
    for (const [x, y] of [[322, 318], [308, 372]]) { for (let r = 13; r > 2; r -= 3.6) disc(k, x, y, r, r > 12 ? '#d9a35a' : null, '#8a5f2a', 2.4); disc(k, x, y, 13.6, null, P.ink, 1.2); }
    // the gangway in boards with a rope rail; the roadstead is water
    k.planks(G.deckL, [24, 232], [24, 440], { fill: '#d9b680', line: '#b08d5a' });
    slab(k, G.deckR, '#5a8ad8'); inside(k, G.deckR, () => { k.waves(12, 16, 'rgba(255,255,255,0.85)', [300, 200, 372, 450], 7); for (const y of [262, 330]) { g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.beginPath(); g.arc(351, y, 5, 0, 7); g.moveTo(351, y + 5); g.lineTo(351, y + 20); g.moveTo(343, y + 14); g.quadraticCurveTo(351, y + 24, 359, y + 14); g.stroke(); } }); edge(k, G.deckR);
    for (const q of [G.wedgeL, G.wedgeR]) { slab(k, q, '#ece2d0'); inside(k, q, () => ruled(k, q, '#ffc93a', 12, 0.7, 3)); edge(k, q); }
    for (const q of [G.quayL, G.quayR]) { k.land(q, '#ece2d0', { smoothed: false, shallow: '#ffd0b0' }); inside(k, q, () => { ruled(k, q, 'rgba(160,140,110,0.5)', 30, 0, 1.2); ruled(k, q, 'rgba(160,140,110,0.5)', 30, Math.PI / 2, 1.2); }); }
    slingArt(k, G, ['#ffc93a', '#2b3a5e'], 9, 0.7);
    lane(k, G, '#d9b680', '#b08d5a', '#178f88');
    whirl(k, 187, 772, 'rgba(255,246,220,0.85)');
  },
  bumperTop(g, w, h) {
    g.save(); g.beginPath(); g.arc(w / 2, h / 2, w * 0.49, 0, 7); g.clip();
    g.translate(w / 2, h / 2); g.rotate(0.7); for (let i = -6; i < 6; i++) { g.fillStyle = i % 2 ? '#2b3a5e' : '#ffc93a'; g.fillRect(i * w * 0.14, -w, w * 0.14, w * 2); } g.restore();
    g.fillStyle = '#fff3d8'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.3, 0, 7); g.fill();
    g.strokeStyle = '#2b3a5e'; g.lineWidth = w * 0.07; g.lineCap = 'round'; g.beginPath(); g.moveTo(w * 0.5, h * 0.3); g.lineTo(w * 0.5, h * 0.52); g.arc(w * 0.5, h * 0.6, w * 0.08, -Math.PI / 2, Math.PI * 0.9); g.stroke();
  },
  head() {
    // a travelling crane's cab and jib along the roof
    return [tint(place(box(1.5, 0.05, 0.06), -0.95, 1.2, -4.95), '#ff8a2a'), tint(place(box(0.05, 0.26, 0.06), -1.2, 1.08, -4.95), '#ff8a2a'), tint(place(box(0.05, 0.26, 0.06), -0.5, 1.08, -4.95), '#ff8a2a'),
      tint(place(box(0.2, 0.16, 0.16), 0.95, 1.05, -4.9), '#178f88'), setGlow(tint(place(box(0.1, 0.07, 0.02), 0.95, 1.07, -4.81), '#ffe9a0'), 0.9), tint(place(box(0.5, 0.04, 0.05), 1.2, 1.15, -4.9, 0, 0, 20), '#ff8a2a')];
  },
  scenery(kit) {
    const G = geo(kit.table), cl = centroid(G.wedgeL), cr = centroid(G.wedgeR), O = '#ff8a2a', N = '#2b3a5e';
    // the big crane: a tower in the corner, and its jib out over the lanes with a sling of sacks on the hook
    const crane = merge(
      tint(place(box(0.3, 0.08, 0.3), 0, 0.04, 0), N), ...[[-0.1, -0.1], [0.1, -0.1], [-0.1, 0.1], [0.1, 0.1]].map(([x, z]) => tint(place(box(0.035, 0.8, 0.035), x, 0.46, z), O)),
      tint(place(box(0.26, 0.03, 0.26), 0, 0.4, 0), O), tint(place(box(0.26, 0.03, 0.26), 0, 0.64, 0), O),
      tint(place(box(0.3, 0.18, 0.3), 0, 0.95, 0), '#178f88'), setGlow(tint(place(box(0.14, 0.08, 0.02), 0.02, 0.97, 0.155), '#ffe9a0'), 0.9),
      tint(place(box(1.25, 0.05, 0.06), 0.52, 1.08, 0.0, 0, 0, 8), O), tint(place(box(0.2, 0.04, 0.06), -0.22, 1.03, 0, 0, 0, -10), O), tint(place(box(0.12, 0.12, 0.12), -0.3, 0.96, 0), N),
      tint(place(box(0.01, 0.42, 0.01), 1.0, 0.94, 0), N), tint(place(roundedBox(0.16, 0.1, 0.12, 0.03, 2), 1.0, 0.7, 0), '#fff3d8'), tint(place(box(0.17, 0.02, 0.13), 1.0, 0.71, 0), '#d9a35a'),
    );
    const casks = merge(place(barrel(0.07, 0.15, '#c98448', N), 0, 0, 0), place(barrel(0.07, 0.15, '#c98448', N), 0.15, 0, 0.03), place(barrel(0.06, 0.13, '#d9a35a', N), 0.07, 0, 0.14),
      tint(place(roundedBox(0.16, 0.08, 0.11, 0.03, 2), -0.12, 0.04, 0.12), '#fff3d8'), tint(place(roundedBox(0.16, 0.08, 0.11, 0.03, 2), -0.11, 0.12, 0.11, 0, 20, 0), '#f6e6c8'));
    const bol = () => merge(tint(lathe([[0, 0], [0.06, 0], [0.045, 0.1], [0.07, 0.12], [0.07, 0.15], [0, 0.16]], 7), N), tint(place(torus(0.05, 0.012, 7, 4), 0, 0.06, 0), '#ffc93a'));
    const tug = merge(place(boat('#178f88', '#fff3d8', null), 0, 0, 0), tint(place(box(0.08, 0.07, 0.06), -0.01, 0.1, 0), '#fff3d8'), tint(place(cyl(0.018, 0.018, 0.09, 6), 0.0, 0.13, 0), O));
    const sig = (i) => tint(place(box(0.075, 0.075, 0.012), 0, -0.05, 0), ['#ffc93a', '#5b8cf0', '#ff5a4a', '#ffffff', '#178f88'][i % 5]);
    return [
      { name: 'crane', mesh: crane, at: [36, 74], rot: yawTo(kit, -24), scale: 1.05, lamps: [{ at: [40, 90], h: 1.0, color: '#ffe9a0', size: 0.5, alpha: 0.55 }, { at: [110, 110], h: 0.5, color: '#ffd9a0', size: 0.6, alpha: 0, light: 1.5, night: true }] },
      { name: 'casksL', mesh: casks, at: [cl[0] - 2, cl[1]], rot: yawTo(kit, 30) },
      { name: 'casksR', mesh: casks, at: [cr[0] + 4, cr[1] + 2], rot: yawTo(kit, 200) },
      { name: 'tug', mesh: tug, at: [80, 756], rot: 24, scale: 1.3 },
      { name: 'bolR', mesh: merge(bol(), place(bol(), 0.2, 0, 0.02)), at: [286, 752], scale: 1.1 },
      { name: 'flags', mesh: span(kit, [-10, 452, 0.66], [410, 452, 0.66], 14, 0.12, sig, N, '#178f88'), at: [200, 400],
        lamps: [[80, 440], [300, 440]].map((at) => ({ at, h: 0.5, color: '#ffd9a0', size: 0.8, alpha: 0.3, light: 1.5, night: true })) },
    ];
  },
};

// ====================================================================================== Vessery, the fish dock by day
// The same harbour as chapter one with the lanterns out and the sun up: wet slate, ice, blue-and-white
// awnings, fish in the water and gulls on the posts.

ART.fishdock = {
  light: 'day',
  palette: {
    wall: '#ffffff', wallCap: '#1f93b8', coral: '#2f86e0', rail: '#f0e6cc', wood: '#d4c49c', hull: '#a8b8c4', plank: '#ece2c6', plankDark: '#c8b890',
    shallow: '#a8f4e8', socket: '#1f3f6e', sea: ['#1898d4', '#26bce0', '#74e6d8'], groups: ['#ff9a3d', '#f06aa8'],
  },
  groups: { stall: '#ff9a3d', name: '#f06aa8' },
  booth: { awning: ['#2f86e0', '#ffffff'], post: ['#ffffff', '#2f86e0'], fascia: ['#ffffff', '#e8483a'], back: '#1f3f6e', bulbs: ['#e8483a', '#ffffff'], pillar: ['#ffffff', '#e8483a'] },
  envDay: { key: { color: '#fffdf2' }, water: { deep: '#1888d0', mid: '#2cbce6', shallow: '#98f4e6' } },
  glints: [[110, 480, 270, 700]],
  labelAt: { pawl1: [282, 196], pawl2: [234, 256], pawl3: [186, 316], drum: [84, 246], hallRamp: [60, 500] },
  paint(k) {
    const { g, P } = k, G = geo(k.table);
    k.sea(P.sea);
    k.waves(7, 70, 'rgba(255,255,255,0.8)', [20, 450, 360, 790]); k.waves(9, 36, 'rgba(16,110,180,0.4)', [20, 450, 360, 790], 12);
    // fish in the harbour
    const fish = (x, y, s, a, col) => { g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = col; g.strokeStyle = 'rgba(20,60,110,0.85)'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(-s, 0); g.quadraticCurveTo(-s * 0.2, -s * 0.52, s * 0.6, 0); g.lineTo(s, -s * 0.36); g.lineTo(s, s * 0.36); g.lineTo(s * 0.6, 0); g.quadraticCurveTo(-s * 0.2, s * 0.52, -s, 0); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#1f3f6e'; g.beginPath(); g.arc(-s * 0.6, -s * 0.06, s * 0.08, 0, 7); g.fill(); g.restore(); };
    { const R = rng(31); for (let i = 0; i < 16; i++) fish(120 + R() * 140, 590 + R() * 110, 8 + R() * 5, 0.3 + R() * 0.4, i % 3 ? '#dff4ff' : '#ffc0a0'); for (let i = 0; i < 7; i++) fish(150 + R() * 80, 728 + R() * 50, 7 + R() * 4, Math.PI + R() * 0.5, '#dff4ff'); }
    // the quay: wet slate cobbles
    const quay = [[-20, -20], [420, -20], [420, 440], [372, 464], [322, 456], [276, 476], [232, 462], [187, 482], [142, 462], [98, 476], [52, 458], [2, 466], [-20, 440]];
    k.land(quay, '#cfe0ec');
    k.cobbles(quay, '#8fb0cc', 4, 15);
    // boxes of the morning's catch set out on the stones
    for (const [x, y, an, c] of [[40, 120, 0.3, '#ffb89a'], [66, 106, 0.3, '#9fd4f0'], [52, 146, 0.3, '#9fd4f0'], [136, 44, -0.2, '#9fd4f0'], [162, 52, -0.2, '#ffb89a']]) { g.save(); g.translate(x, y); g.rotate(an); g.fillStyle = '#ece2c6'; g.strokeStyle = P.ink; g.lineWidth = 1.2; g.beginPath(); rr(g, -12, -9, 24, 18, 2); g.fill(); g.stroke(); g.fillStyle = '#eafaff'; g.fillRect(-9, -6, 18, 12); g.fillStyle = c; for (const dy of [-3, 3]) { g.beginPath(); g.ellipse(0, dy, 7, 2.2, 0, 0, 7); g.fill(); } g.restore(); }
    inside(k, quay, () => { specks(k, 14, 22, 'rgba(255,255,255,0.75)', [20, 130, 360, 440], 5, 2.6); }, true);
    // scales: a medallion of them under the pawls
    const med = [[202, 120], [300, 132], [316, 220], [262, 300], [176, 348], [112, 312], [150, 220]];
    inside(k, med, () => { g.fillStyle = '#7fd4e4'; g.fillRect(90, 100, 250, 270); g.strokeStyle = '#ffffff'; g.lineWidth = 1.8; for (let y = 104, r = 0; y < 366; y += 11, r++) for (let x = 90 + (r % 2) * 11; x < 340; x += 22) { g.fillStyle = (r + ((x / 22) | 0)) % 3 ? '#9fe4ee' : '#c8f2f6'; g.beginPath(); g.arc(x, y, 11, 0, Math.PI); g.fill(); g.stroke(); } }, true);
    k.smooth(med); g.strokeStyle = P.ink; g.lineWidth = 1.6; g.stroke();
    // the drum on its stand: boards, and a chalk ring
    disc(k, 84, 212, 36, '#e8b878'); for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; g.strokeStyle = '#b07a3c'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(84 + Math.cos(a) * 19, 212 + Math.sin(a) * 19); g.lineTo(84 + Math.cos(a) * 36, 212 + Math.sin(a) * 36); g.stroke(); }
    g.setLineDash([6, 5]); disc(k, 84, 212, 43, null, '#ffffff', 2.2); g.setLineDash([]);
    // the roll: three sheets of it
    { const L = G.lanes; for (let i = 0; i < 3; i++) { g.fillStyle = '#fff8e0'; g.fillRect(L.x + i * L.w + 2, L.y, L.w - 4, L.h); g.strokeStyle = '#9fb4c8'; g.lineWidth = 1; for (let y = L.y + 7; y < L.y + 26; y += 5) { g.beginPath(); g.moveTo(L.x + i * L.w + 9, y); g.lineTo(L.x + (i + 1) * L.w - 9, y); g.stroke(); } g.strokeStyle = P.ink; g.lineWidth = 1.3; g.strokeRect(L.x + i * L.w + 2, L.y, L.w - 4, L.h); } }
    // Nan's stall, as its awning; and name-tags by the names
    const awn = [[44, 300], [84, 276], [108, 344], [70, 372]];
    stripes(k, awn, ['#2f86e0', '#ffffff'], 9, -0.36); edge(k, awn);
    for (let i = 0; i < 3; i++) { g.save(); g.translate(322 + (i % 2) * 6, 232 + i * 30); g.rotate(0.2); g.fillStyle = '#fff8e0'; g.strokeStyle = P.ink; g.lineWidth = 1.1; g.beginPath(); rr(g, -12, -6, 24, 12, 2); g.fill(); g.stroke(); g.strokeStyle = '#f06aa8'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-7, 0); g.lineTo(7, 0); g.stroke(); g.restore(); }
    // hall steps in treads; the quay in pale boards
    slab(k, G.deckL, '#ffffff'); inside(k, G.deckL, () => { for (let y = 250, i = 0; y < 500; y += 13, i++) { g.fillStyle = i % 2 ? '#dbe6f0' : '#ffffff'; g.fillRect(0, y, 140, 13); g.fillStyle = '#9fb4c8'; g.fillRect(0, y + 11, 140, 2); } }); edge(k, G.deckL);
    k.planks(G.deckR, [350, 232], [350, 440], { fill: '#ece2c6', line: '#c8b890' });
    // ice in the wedges
    for (const q of [G.wedgeL, G.wedgeR]) { slab(k, q, '#eafaff'); inside(k, q, () => specks(k, 3, 40, '#bfe8f6', [0, 340, 400, 520], 3.4, 1.2)); }
    for (const q of [G.quayL, G.quayR]) { k.land(q, '#cfe0ec', { smoothed: false }); k.cobbles(q, '#a4bcd2', 8, 15); }
    // chalk on the slings' islands: the count, in fives
    for (const s of G.slings) { slab(k, s, '#3b4a6a'); inside(k, s, () => { const c = centroid(s); g.strokeStyle = '#ffffff'; g.lineWidth = 1.8; g.lineCap = 'round'; for (let n = 0; n < 3; n++) { const y0 = c[1] - 34 + n * 22, x0 = c[0] - 9; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(x0 + i * 5, y0); g.lineTo(x0 + i * 5, y0 + 13); g.stroke(); } g.beginPath(); g.moveTo(x0 - 4, y0 + 11); g.lineTo(x0 + 19, y0 + 2); g.stroke(); } }); edge(k, s); }
    lane(k, G, '#ece2c6', '#c8b890', '#e8483a');
    // a lifebuoy on the water under the name
    disc(k, 187, 612, 30, null, '#ffffff', 9); for (let i = 0; i < 4; i++) { g.strokeStyle = '#e8483a'; g.lineWidth = 9; g.beginPath(); g.arc(187, 612, 30, i * Math.PI / 2 + 0.5, i * Math.PI / 2 + 1.07); g.stroke(); }
    disc(k, 187, 612, 34.5, null, P.ink, 1.3); disc(k, 187, 612, 25.5, null, P.ink, 1.3);
    whirl(k, 187, 772, 'rgba(255,255,255,0.85)');
  },
  bumperTop(g, w, h) {
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.49, 0, 7); g.fill();
    g.fillStyle = '#2f86e0'; g.beginPath(); for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, r = w * (i % 2 ? 0.3 : 0.45); g.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); } g.closePath(); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.22, 0, 7); g.fill();
    g.fillStyle = '#e8483a'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.1, 0, 7); g.fill();
  },
  head() {
    // the sign over the market: a fish
    const fish = (x, s) => merge(tint(place(ellipsoid(0.26, 0.11, 0.05, 8, 5), x, 1.14, -4.92), '#9fd4f0'), tint(place(extrude([[0, 0], [0.16, 0.11], [0.16, -0.11]], 0.03), x + s * 0.22, 1.14, -4.92, 0, s > 0 ? 0 : 180, 0), '#2f86e0'), tint(place(sphere(0.022, 5, 3), x - s * 0.15, 1.17, -4.865), '#1f3f6e'), tint(place(box(0.03, 0.12, 0.03), x, 1.0, -4.92), '#d4c49c'));
    return [fish(-0.8, 1), fish(0.8, -1)];
  },
  scenery(kit) {
    const G = geo(kit.table), cl = centroid(G.wedgeL), cr = centroid(G.wedgeR);
    const stall = merge(tint(place(roundedBox(0.3, 0.12, 0.17, 0.02, 2), 0, 0.06, 0), '#d4c49c'), tint(place(box(0.33, 0.03, 0.2), 0, 0.135, 0), '#eafaff'),
      ...[-0.15, 0.15].map((x) => tint(place(cyl(0.013, 0.013, 0.36, 5), x, 0, -0.08), '#8f7f66')),
      ...[0, 1, 2, 3, 4].map((i) => tint(place(box(0.074, 0.02, 0.27), (i - 2) * 0.074, 0.39, 0.02, 24, 0, 0), i % 2 ? '#ffffff' : '#2f86e0')),
      ...[[-0.09, '#9fd4f0'], [0, '#ffb89a'], [0.09, '#9fd4f0']].map(([x, c]) => tint(place(ellipsoid(0.04, 0.018, 0.02, 6, 4), x, 0.165, 0.02), c)));
    const fishbox = (c) => merge(tint(place(box(0.17, 0.07, 0.12), 0, 0.035, 0), '#ece2c6'), tint(place(box(0.15, 0.02, 0.1), 0, 0.075, 0), '#eafaff'), tint(place(ellipsoid(0.05, 0.016, 0.022, 6, 4), -0.02, 0.09, 0.01), c), tint(place(ellipsoid(0.05, 0.016, 0.022, 6, 4), 0.03, 0.095, -0.02, 0, 30, 0), '#9fd4f0'));
    const gull = () => merge(tint(place(cyl(0.02, 0.018, 0.2, 5), 0, 0, 0), '#8f7f66'), tint(place(ellipsoid(0.05, 0.035, 0.03, 6, 4), 0, 0.235, 0), '#ffffff'), tint(place(sphere(0.022, 6, 4), 0.045, 0.265, 0), '#ffffff'), tint(place(cylinder(0.009, 0, 0.03, 4), 0.062, 0.262, 0, 0, 0, -90), '#ff9a3d'), tint(place(box(0.05, 0.012, 0.062), -0.01, 0.245, 0), '#aab8cc'));
    const crates = merge(place(fishbox('#ffb89a'), 0, 0, 0), place(fishbox('#9fd4f0'), 0.02, 0.085, 0.0, 0, 14, 0), place(fishbox('#ffb89a'), 0.19, 0, 0.05, 0, -20, 0), place(gull(), -0.14, 0, 0.1));
    const fishy = (i) => merge(tint(place(ellipsoid(0.075, 0.034, 0.016, 6, 3), 0, -0.095, 0, 0, 0, 90), i % 2 ? '#7fc4ee' : '#ffffff'), tint(place(extrude([[-0.045, 0], [0.045, 0], [0, 0.06]], 0.012), 0, -0.215, 0), '#2f86e0'));
    const buoy = merge(tint(lathe([[0, 0], [0.06, 0], [0.065, 0.03], [0.045, 0.08]], 8), '#e8483a'), tint(lathe([[0.045, 0.08], [0.028, 0.14]], 8, { crease: 180 }), '#ffffff'), tint(place(cyl(0.008, 0.008, 0.07, 5), 0, 0.14, 0), '#1f3f6e'));
    return [
      { name: 'stall', mesh: stall, at: [cl[0] - 4, cl[1]], rot: yawTo(kit, 60), scale: 0.95 },
      { name: 'crates', mesh: crates, at: [cr[0] + 2, cr[1]], rot: yawTo(kit, -24) },
      { name: 'smack', mesh: boat('#2f86e0', '#ffffff', '#ffffff'), at: [82, 752], rot: 28, scale: 1.3 },
      { name: 'smack2', mesh: boat('#e8483a', '#ffffff', '#fff3c0'), at: [294, 756], rot: 150, scale: 1.15 },
      { name: 'buoyL', mesh: buoy, at: [86, 628] }, { name: 'buoyR', mesh: buoy, at: [288, 628] },
      { name: 'catch', mesh: span(kit, [-10, 196, 0.72], [410, 180, 0.72], 11, 0.14, fishy, '#8f7f66', '#8f7f66', '#e8483a'), at: [200, 400],
        lamps: [[90, 150], [290, 150]].map((at) => ({ at, h: 0.5, color: '#ffd9a0', size: 0.8, alpha: 0.3, light: 1.5, night: true })) },
      { name: 'gullA', mesh: gull(), at: [22, 24], rot: yawTo(kit, -40), scale: 1.2 },
    ];
  },
};

// ====================================================================================== Cresset: the capital
// Night. White marble inlaid with gold, rays laid out from the Founders' Lamp across the square, the
// Assembly's horseshoe below it, and the harbour holding the lamp's road.

ART.cresset = {
  light: 'night',
  palette: {
    wall: '#ffffff', wallCap: '#e0a83a', coral: '#7a5ce0', rail: '#dcd6f2', wood: '#b4aae0', woodDark: '#7a70b8', hull: '#8279c0', plank: '#ece8fa', plankDark: '#c4bce8',
    shallow: '#8f8cf0', socket: '#241f6e', sea: ['#1c1958', '#2f2b86', '#5a56c0'], groups: ['#e0a83a', '#58d0e8'], gold: '#ffcf4a',
  },
  groups: { bench: '#e0a83a', calm: '#58d0e8' },
  booth: { awning: ['#5a48c8', '#fff6dc'], post: ['#ffffff', '#ffcf4a'], fascia: ['#ffffff', '#e0a83a'], back: '#241f6e', bulbs: ['#ffcf4a', '#ffffff'], pillar: ['#ffffff', '#ffcf4a'], deck: ['#dcd6f2', '#b4aae0'] },
  env: { water: { deep: '#2f2b96', mid: '#5a56d0', shallow: '#a8a4f4' } },
  envDay: { water: { deep: '#3a48c0', mid: '#5f7ce0', shallow: '#b0c4f6' } },
  envNight: { key: { color: '#98a8ff' }, ambient: { sky: '#5a62e6', ground: '#4a3aa6', amount: 0.15 }, water: { deep: '#141258', mid: '#2a2890', shallow: '#5a58d0', glint: '#e8ecff', glintDensity: 0.2 } },
  glints: [[130, 470, 250, 700]],
  labelAt: { lamp: [199, 196], ring3: [207, 306] },
  paint(k) {
    const { g, P } = k, G = geo(k.table);
    k.sea(P.sea);
    // the lamp's road on the water, and stars come down to float
    { const gr = g.createLinearGradient(120, 0, 260, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(240,244,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(120, 430, 140, 370); }
    { const R = rng(21); g.fillStyle = 'rgba(255,255,255,0.9)'; for (let i = 0; i < 40; i++) { const y = 450 + R() * 330, w = 6 + R() * 20, x = 190 + (R() - 0.5) * (36 + (y - 450) * 0.14); g.beginPath(); rr(g, x - w / 2, y, w, 2.4, 1.2); g.fill(); } for (let i = 0; i < 26; i++) star(k, 30 + R() * 320, 470 + R() * 310, 3 + R() * 3, 1, 4, 'rgba(255,255,255,0.85)'); }
    k.waves(7, 40, 'rgba(200,204,255,0.6)', [20, 440, 360, 790]);
    // the square: marble, and the rays set into it
    const sq = [[-20, -20], [420, -20], [420, 424], [372, 448], [322, 440], [276, 458], [232, 446], [190, 464], [146, 446], [100, 458], [54, 442], [4, 450], [-20, 426]];
    k.land(sq, '#f6f2ff', { shallow: '#6f6ce0', foam: '#ffffff' });
    inside(k, sq, () => {
      g.save(); g.translate(199, 162); for (let i = 0; i < 24; i++) { g.rotate(TAU / 24); g.fillStyle = i % 2 ? '#ffe9a8' : '#f6f2ff'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 420, -TAU / 48, TAU / 48); g.closePath(); g.fill(); } g.restore();
      for (const r of [70, 132, 196, 262]) disc(k, 199, 162, r, null, '#e0a83a', 2.2);
      // the horseshoe: forty seats, twelve of them draped
      const R = rng(40); for (let row = 0; row < 3; row++) for (let i = 0; i < 14 - row; i++) { const a = Math.PI * (0.14 + 0.72 * (i / (13 - row))), r = 214 + row * 22, x = 199 + Math.cos(a) * r * 0.8, y = 176 + Math.sin(a) * r; g.fillStyle = R() < 0.3 ? '#a8a4c4' : '#7a5ce0'; g.strokeStyle = P.ink; g.lineWidth = 1; g.beginPath(); rr(g, x - 6, y - 5, 12, 10, 3); g.fill(); g.stroke(); }
    }, true);
    pool(k, 199, 162, 64, '#ffffff', 0.95); disc(k, 199, 162, 23, null, '#ffcf4a', 2.6);
    carpet(k, G, ['#7a5ce0', '#ffcf4a', '#7a5ce0']);
    // the mole in pale stone with its lamp-holes; the assembly's side in violet with a gold edge
    slab(k, G.deckL, '#ece8fa'); inside(k, G.deckL, () => { g.strokeStyle = '#b4aae0'; g.lineWidth = 1.4; for (let y = 220; y < 480; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(140, y); g.stroke(); } }); edge(k, G.deckL);
    slab(k, G.deckR, '#7a5ce0'); edge(k, G.deckR, 4.6, '#ffcf4a'); edge(k, G.deckR);
    for (const q of [G.wedgeL, G.wedgeR]) { slab(k, q, '#ece8fa'); edge(k, q, 3.6, '#ffcf4a'); edge(k, q); }
    for (const q of [G.quayL, G.quayR]) { k.land(q, '#f6f2ff', { smoothed: false, shallow: '#6f6ce0' }); inside(k, q, () => { ruled(k, q, 'rgba(180,170,224,0.7)', 18, 0, 1.2); ruled(k, q, 'rgba(180,170,224,0.7)', 18, Math.PI / 2, 1.2); }); edge(k, q, 3.2, '#ffcf4a'); edge(k, q); }
    slingArt(k, G, ['#7a5ce0', '#ffffff'], 9);
    lane(k, G, '#ece8fa', '#c4bce8', '#7a5ce0');
    whirl(k, 187, 772, 'rgba(232,236,255,0.85)');
  },
  bumperTop(g, w, h) {
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(w / 2, h / 2, w * 0.49, 0, 7); g.fill();
    for (const [r, c] of [[0.42, '#ffcf4a'], [0.34, '#ffffff'], [0.26, '#7a5ce0'], [0.16, '#ffffff'], [0.08, '#ffcf4a']]) { g.fillStyle = c; g.beginPath(); g.arc(w / 2, h / 2, w * r, 0, 7); g.fill(); }
  },
  head() {
    // the Assembly's two domes
    const dome = (x) => merge(tint(place(cyl(0.2, 0.2, 0.08, 10), x, 0.97, -4.88), '#ffffff'), tint(place(lathe([[0.19, 0], [0.17, 0.09], [0.1, 0.17], [0, 0.2]], 10, { crease: 60 }), x, 1.05, -4.88), '#ffcf4a'), tint(place(sphere(0.03, 6, 4), x, 1.27, -4.88), '#ffffff'));
    return [dome(-0.82), dome(0.82)];
  },
  scenery(kit) {
    const G = geo(kit.table), cl = centroid(G.wedgeL), cr = centroid(G.wedgeR);
    // the Founders' Lamp: a stepped base, a white shaft, a brass bowl, and the flame
    const lamp = merge(tint(cyl(0.32, 0.3, 0.06, 10), '#dcd6f2'), tint(place(cyl(0.25, 0.23, 0.06, 10), 0, 0.06, 0), '#ffffff'),
      tower(0.17, 0.11, 0.86, ['#ffffff', '#ece8fa', '#ffffff', '#ece8fa', '#ffffff'], 10), tint(place(torus(0.15, 0.022, 10, 4), 0, 0.36, 0), '#ffcf4a'),
      tint(lathe([[0.1, 0.96], [0.16, 0.98], [0.24, 1.1], [0.22, 1.12], [0, 1.08]], 10, { crease: 60 }), '#ffcf4a'),
      setGlow(tint(place(lathe([[0, 0], [0.1, 0.02], [0.13, 0.1], [0.07, 0.24], [0, 0.36]], 8, { crease: 180 }), 0, 1.09, 0), '#f4f6ff'), 1));
    const brazier = () => merge(column(0.3, 0.05, '#ffffff', '#dcd6f2'), tint(place(lathe([[0.03, 0], [0.08, 0.05], [0.07, 0.06], [0, 0.05]], 7), 0, 0.38, 0), '#ffcf4a'), setGlow(tint(place(ellipsoid(0.045, 0.07, 0.045, 6, 4), 0, 0.48, 0), '#e8ecff'), 1));
    const barge = merge(boat('#7a5ce0', '#ffffff', null), setGlow(tint(place(sphere(0.03, 6, 4), 0.04, 0.12, 0), '#e8ecff'), 1), tint(place(cyl(0.006, 0.006, 0.07, 4), 0.04, 0.06, 0), '#ffcf4a'));
    const flame = (i) => merge(tint(place(box(0.006, 0.04, 0.006), 0, -0.02, 0), '#ffcf4a'), tint(place(cyl(0.03, 0.02, 0.025, 6), 0, -0.065, 0), '#ffcf4a'), setGlow(tint(place(ellipsoid(0.026, 0.04, 0.026, 6, 4), 0, -0.02, 0), i % 2 ? '#e8ecff' : '#c8c4ff'), 0.9));
    return [
      { name: 'founders', mesh: lamp, at: [62, 74], scale: 1.12, lamps: [{ at: [62, 74], h: 1.45, color: '#f0f4ff', size: 1.5, alpha: 0.7 }, { at: [80, 120], h: 0.5, color: '#e8ecff', size: 0.6, alpha: 0, light: 1.6 }],
        beams: [{ at: [62, 74], h: 1.42, length: 3.6, spread: 0.6, tilt: 72, speed: 22, color: '#eef0ff' }] },
      { name: 'brazL', mesh: merge(place(brazier(), -0.08, 0, 0.0), place(brazier(), 0.12, 0, 0.14)), at: [cl[0] - 4, cl[1]], lamps: [{ at: cl, h: 0.5, color: '#e8ecff', size: 0.5, alpha: 0.6, light: 0.9 }] },
      { name: 'brazR', mesh: merge(place(brazier(), 0.08, 0, 0.0), place(brazier(), -0.12, 0, 0.14)), at: [cr[0] + 4, cr[1]], lamps: [{ at: cr, h: 0.5, color: '#e8ecff', size: 0.5, alpha: 0.6, light: 0.9 }] },
      { name: 'bargeL', mesh: barge, at: [82, 754], rot: 24, scale: 1.3, lamps: [{ at: [86, 752], h: 0.16, color: '#e8ecff', size: 0.3, alpha: 0.6 }] },
      { name: 'bargeR', mesh: barge, at: [294, 756], rot: 156, scale: 1.2, lamps: [{ at: [290, 754], h: 0.16, color: '#e8ecff', size: 0.3, alpha: 0.6 }] },
      { name: 'chain', mesh: span(kit, [-10, 452, 0.66], [410, 452, 0.66], 12, 0.14, flame, '#ffcf4a', '#ffffff'), at: [200, 400],
        lamps: [[90, 446], [290, 446]].map((at) => ({ at, h: 0.5, color: '#dfe2ff', size: 0.9, alpha: 0.35, light: 1.4, night: true })) },
    ];
  },
};
