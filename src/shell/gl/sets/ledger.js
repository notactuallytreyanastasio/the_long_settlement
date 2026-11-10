// SET: ledger. The narrator's room: an old account book open on a heavy desk, one candle, and a hooded writer
// bent over the page with a quill. Behind, a tall window full of night and walls of other ledgers.
// Chapter 1: ch1.pro.01, 05-07 and ch1.epi.11 (narration only, `on: []`); every later chapter opens here too.
//
//   import { ledger } from './sets/ledger.js';
//   const set = ledger.build(GL, { light: 'interior', low: false, writer: true });   // 'interior' is the only light
//
// The shape is lantern-stalls' (see ../index.js), so the director needs no special case: scene, env, actors,
// foreground (empty), cameras, frame, view, marks, lamps, setPower, update. Cameras look toward -Z at the desk
// (centre z -1.2); the strip x -4.4..4.4, z -0.2..1.6 in front of it is clear, and marks a/b/c stand there.
// 'close' is the page and the pen under the hood; 'wide' the whole desk, window and shelves; 'low' looks up at
// the hood from the desk's edge; 'two' is a three-quarter view across the page.
// Added here:
//   setWritten(0..1)      how much of the open right-hand page is written: ink rows appear and the quill follows.
//                         Until it is first called the writer writes by himself, about a row every three seconds,
//                         and turns to a clean page when one is full. setWritten(null) hands the pen back to him.
//   writer: false         (build option) leaves the chair empty, for a director who seats the 'narrator' character
//   marks.page            the middle of the page being written;  marks.seat: where the writer sits;  marks.focus: the candle
// low: true drops the outer shelves, the scales and half the dust.

import * as GL0 from '../index.js';
import {
  m4, quat, rng, DEG, rgb,
  merge, tint, place, plane, box, tube, curve, cylinder, sphere, ellipsoid, lathe, blob, setGlow, setOutline, roundedBox, torus, deform,
  node, group, makeEnv, createScene, mergeStatic, makeInstances, setInstance, createSprites, rayMesh, rayMaterial, material,
} from '../index.js';
import { PAL, kitMaterials, anchorAt, pickLight, setRig, desk, ledgerBook, candle, inkwell, quill, bookshelf, archWindow, flame } from './kit.js';

const DESK = [0, 0, -1.2], DESK_H = 0.8, WALL_Z = -3.7;
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };

const LIGHTS = {
  interior: {
    preset: 'night', power: 1,
    env: {
      key: { dir: norm([0.25, 0.8, -0.55]), color: '#8ea6f6' },          // the window: cool, from behind and above
      shadow: { tint: '#3a3aa4', lift: 0.14, saturate: 1.25 },
      ambient: { sky: '#5560d8', ground: '#3a2f8a', amount: 0.2 },
      rim: { color: '#bcd0ff', amount: 0.8, edge: 0.74 },
      fog: { color: '#1c1f6a', density: 0.012, start: 7, max: 0.5 },
      sky: { zenith: '#10124e', mid: '#171a62', midAt: 0.5, horizon: '#1c1f6a', below: '#14164e', glowAmount: 0, sunDir: norm([0, 1, -0.2]), moon: 0, stars: 0, sun: { size: 0.01, haloAmount: 0 } },
      water: null,
    },
  },
};

const CAMERAS = {
  wide: { target: [0, 1.45, -1.5], dist: 6.4, yaw: 5, pitch: 8, fov: 44, aspect: 0.46, shadowCenter: [0, 0, -1.4], shadowRadius: 4.5 },
  two: { target: [0.05, 1.12, -1.3], dist: 4.2, yaw: 30, pitch: 13, fov: 36, aspect: 0.46, shadowCenter: [0, 0, -1.4], shadowRadius: 3.2 },
  close: { target: [-0.1, 1.2, -1.42], dist: 4.5, yaw: -6, pitch: 31, fov: 31, aspect: 0.46, shadowCenter: [0, 0, -1.4], shadowRadius: 2.4 },
  low: { target: [0, 1.38, -1.7], dist: 3.3, yaw: -12, pitch: -7, fov: 52, aspect: 0.46, shadowCenter: [0, 0, -1.4], shadowRadius: 3.6 },
  stage: { target: [0, 1.08, -0.6], dist: 8.4, yaw: -10, pitch: 7, fov: 24, aspect: 1.95, shadowCenter: [0, 0, -1.0], shadowRadius: 6, outline: 0.7 },
  landscape: { target: [0, 1.4, -1.5], dist: 6.6, yaw: 4, pitch: 8, fov: 40, aspect: 1.6, shadowCenter: [0, 0, -1.4], shadowRadius: 6 },
};

const MARKS = {
  a: { pos: [-0.8, 0, 0.55], face: 14 }, b: { pos: [0.02, 0, 0.8], face: 0 }, c: { pos: [0.82, 0, 0.55], face: -14 },
  two: [{ pos: [-0.42, 0, 0.62], face: 24 }, { pos: [0.42, 0, 0.62], face: -24 }],
  party: [{ pos: [-1.05, 0, 0.75], face: 78 }, { pos: [-1.85, 0, 1.15], face: 72 }, { pos: [-2.5, 0, 0.5], face: 80 }],
  opposition: [{ pos: [1.05, 0, 0.75], face: -78 }, { pos: [1.85, 0, 1.15], face: -72 }, { pos: [2.55, 0, 0.5], face: -80 }],
  seat: { pos: [0, 0, DESK[2] - 0.86], face: 0 },
};

/** The hooded writer, seated, facing +Z, origin on the floor under the chair. Returns the static body; the pen arm is separate. */
function writerBody(robe, mantle, trim) {
  const parts = [];
  // a high-backed chair
  parts.push(tint(place(roundedBox(0.92, 1.95, 0.1, 0.05, 1), 0, 0.98, -0.36), '#6e3b30'), tint(place(roundedBox(0.7, 1.2, 0.06, 0.04, 1), 0, 1.22, -0.3), '#9a4a52'));
  for (const sx of [-1, 1]) parts.push(tint(place(sphere(0.075, 8, 6), sx * 0.42, 2.0, -0.36), PAL.gold));
  // robe: a seated bulk, then the mantle over the shoulders
  parts.push(tint(place(blob({ rx: 0.4, ry: 0.52, rz: 0.34, pear: 0.5, flatBottom: 0.3, seg: 14, rings: 9 }), 0, 0.9, 0.0), robe));
  parts.push(tint(lathe([[0, 0.72], [0.44, 0.74], [0.5, 0.95], [0.43, 1.2], [0.24, 1.38], [0, 1.42]], 14, { crease: 180 }), mantle));
  parts.push(tint(place(torus(0.25, 0.028, 14, 5), 0, 1.36, 0.02, 8, 0, 0), trim), tint(place(sphere(0.05, 8, 6), 0, 1.3, 0.26), trim));
  // the hood, bowed over the page; inside it only dark
  const hood = merge(
    tint(deform(blob({ rx: 0.3, ry: 0.32, rz: 0.31, seg: 16, rings: 11 }), (p) => { if (p[1] > 0.1 && p[2] < 0.1) p[2] -= (p[1] - 0.1) * 0.35; if (p[2] > 0.16) p[1] -= (p[2] - 0.16) * 0.25; }), robe),
    tint(place(ellipsoid(0.2, 0.215, 0.1, 12, 8), 0, -0.035, 0.235), '#16143c'),
    tint(place(torus(0.215, 0.03, 16, 5), 0, -0.03, 0.225, 90, 0, 0), mantle));
  parts.push(place(hood, 0, 1.62, 0.1, 30, 0, 0));
  // the left arm lies along the page's edge (his left is +X), sleeve to the desk, a hand flat on the paper
  parts.push(tint(tube(curve([[0.38, 1.2, 0.02], [0.52, 1.02, 0.3], [0.5, 0.9, 0.6], [0.44, 0.88, 0.78]], 8), (t) => 0.13 - 0.045 * t, 8, { crease: 180 }), robe));
  parts.push(tint(place(ellipsoid(0.07, 0.035, 0.085, 8, 5), 0.42, 0.875, 0.86), '#ffd9b4'));
  // his right shoulder and upper sleeve; the forearm is the moving part
  parts.push(tint(place(ellipsoid(0.23, 0.24, 0.24, 10, 7), -0.38, 1.1, 0.12), robe));
  return merge(parts);
}

function build(engine = GL0, { light, low = false, writer = true } = {}) {
  const picked = pickLight('ledger', LIGHTS, light), L = picked.L; light = picked.name;
  const M = kitMaterials(), r = rng(1313);
  const ROBE = '#5a48c0', MANTLE = '#7d6ae0', TRIM = PAL.gold, INK = '#2c2470';

  // ---- the room
  const room = group('room'), set = group('set');
  room.add(node('floor', tint(place(plane(22, 12, 1, 1), 0, 0, -1.0), '#c9a47e'), M.ground));
  room.add(node('rug', merge(tint(place(box(5.2, 0.02, 3.4), 0, 0.011, 0), '#b8483c'), tint(place(box(4.7, 0.022, 2.9), 0, 0.013, 0), '#e0b25a'), tint(place(box(4.4, 0.024, 2.6), 0, 0.015, 0), '#3f6fb8')), M.flat, { pos: [0, 0, -0.9] }));
  room.add(node('wall', tint(place(box(22, 7, 0.4), 0, 3.5, WALL_Z - 0.2), '#cdbff2'), M.ground));
  room.add(node('dado', tint(place(box(22, 1.0, 0.08), 0, 0.5, WALL_Z + 0.04), '#7a4634'), M.ground), node('dado-rail', tint(place(box(22, 0.09, 0.14), 0, 1.02, WALL_Z + 0.07), '#9a5a3c'), M.ground));
  room.traverse((n) => { n.castShadow = false; });
  const WIN = [0, 1.25, WALL_Z + 0.02];
  set.add(node('window', archWindow({ w: 1.7, h: 3.3, glass: '#4f7ff0', frame: '#e6dcc8', bars: '#3a3f8a', glow: 0.9 }), M.prop, { pos: WIN }));
  const shelves = low ? [[-2.7, 9], [2.7, 4]] : [[-2.7, 9], [2.7, 4], [-5.3, 6], [5.3, 2]];
  for (const [x, seed] of shelves) set.add(node('shelf', bookshelf({ w: 2.3, h: 3.6, rows: 5, seed }), M.prop, { pos: [x, 0, WALL_Z + 0.2] }));
  // curtains either side of the window: two heavy folds of cloth
  for (const sx of [-1, 1]) set.add(node('curtain', tint(deform(place(box(0.62, 3.9, 0.16), 0, 1.95, 0), (p) => { p[2] += Math.sin(p[0] * 16) * 0.06; p[0] *= 0.7 + 0.3 * (1 - p[1] / 3.9); }, 60), '#b8483c'), M.prop, { pos: [sx * 1.28, 0.75, WALL_Z + 0.2] }));
  set.add(node('pelmet', tint(place(roundedBox(3.5, 0.3, 0.3, 0.06, 1), 0, 4.75, WALL_Z + 0.2), '#7a4634'), M.prop));

  // ---- the desk and what is on it
  const top = DESK_H, bookAt = [DESK[0] - 0.02, top, DESK[2] + 0.06];
  set.add(node('desk', desk({ w: 2.7, d: 1.3, h: DESK_H }), M.prop, { pos: DESK }));
  const book = ledgerBook({ w: 1.3, d: 0.88 });
  set.add(node('book', book, M.prop, { pos: bookAt }));
  const candleMesh = candle({ h: 0.3, r: 0.04 }), CANDLE = [DESK[0] - 1.0, top, DESK[2] + 0.2];
  set.add(node('candle', candleMesh, M.prop, { pos: CANDLE }));
  const wick = anchorAt(candleMesh, 'flame', CANDLE);
  set.add(node('inkwell', inkwell({ s: 1.3 }), M.prop, { pos: [DESK[0] - 0.86, top, DESK[2] - 0.2] }));
  // closed ledgers stacked at his left, a ribbon hanging out of one
  const closed = (w, d, h, col) => merge(tint(place(roundedBox(w, h, d, 0.015, 1), 0, h / 2, 0), col), tint(place(box(w - 0.04, h - 0.03, d + 0.004), 0.015, h / 2, 0), '#f6e8c4'), tint(place(box(0.03, h + 0.004, d + 0.006), -w / 2 + 0.07, h / 2, 0), PAL.gold));
  set.add(node('stack1', closed(0.52, 0.4, 0.1, '#3a9a86'), M.prop, { pos: [DESK[0] + 1.0, top, DESK[2] - 0.22], rot: [0, 12, 0] }), node('stack2', closed(0.46, 0.36, 0.09, '#c89a3a'), M.prop, { pos: [DESK[0] + 0.98, top + 0.1, DESK[2] - 0.2], rot: [0, -8, 0] }), node('stack3', closed(0.4, 0.3, 0.08, '#b8483c'), M.prop, { pos: [DESK[0] + 1.02, top + 0.19, DESK[2] - 0.22], rot: [0, 22, 0] }));
  if (!low) { // a small pair of scales: this is an account of what is owed
    const sc = merge(tint(lathe([[0, 0], [0.1, 0], [0.1, 0.02], [0.02, 0.05], [0.016, 0.42], [0, 0.44]], 8, { crease: 50 }), PAL.gold), tint(place(box(0.46, 0.016, 0.016), 0, 0.41, 0, 0, 0, 7), PAL.gold));
    for (const sx of [-1, 1]) set.add(node('pan', merge(tint(place(cylinder(0.004, 0.004, 0.2, 3, { caps: false }), 0, 0, 0), PAL.gold), tint(place(lathe([[0, 0], [0.075, 0.012], [0.08, 0.03]], 8, { crease: 180 }), 0, -0.02, 0), PAL.gold)), M.prop, { pos: [DESK[0] + 0.95 + sx * 0.22, top + 0.21 + sx * 0.028, DESK[2] + 0.34] }));
    set.add(node('scales', sc, M.prop, { pos: [DESK[0] + 0.95, top, DESK[2] + 0.34] }));
  }
  // ruled lines and the money column on both pages (static, flat)
  const tilt = book.anchors.tilt, pw = book.anchors.pw, pd = book.anchors.pd, ROWS = 11, rowZ = (k) => pd / 2 - 0.05 - k * ((pd - 0.1) / (ROWS - 1));
  const pageX = (sx) => bookAt[0] + book.anchors[sx > 0 ? 'pageR' : 'pageL'][0], pageY = bookAt[1] + book.anchors.pageR[1] + 0.008;
  const onPage = (sx, u, v, lift = 0) => { const t = sx * tilt * DEG; return [pageX(sx) + u * Math.cos(t), pageY + u * Math.sin(t) + lift, bookAt[2] + v]; };
  { const rules = [];
    for (const sx of [-1, 1]) { for (let k = 0; k < ROWS; k++) { const c = onPage(sx, 0, rowZ(k) - 0.022); rules.push(tint(place(box(pw, 0.002, 0.004), c[0], c[1] - 0.004, c[2], 0, 0, sx * tilt), '#d9c592')); }
      const c = onPage(sx, -(pw / 2 - 0.1), 0); rules.push(tint(place(box(0.005, 0.002, pd - 0.06), c[0], c[1] - 0.003, c[2], 0, 0, sx * tilt), '#e08a7a')); }
    const n = node('rules', merge(rules), M.flat); n.castShadow = false; set.add(n); }

  // ---- the writer
  const SEAT = MARKS.seat.pos, K = 1.12;
  if (writer) set.add(node('writer', GL0.scale(writerBody(ROBE, MANTLE, TRIM), K), M.prop, { pos: SEAT }));

  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  scene.root.add(mergeStatic(room, 'room'), mergeStatic(set, 'set'));
  const foreground = group('foreground'); scene.root.add(foreground);

  // ---- ink: one instanced draw of flat strokes. The left-hand page (his left, +X) is already full; the other is being written
  const strokes = []; // { sx, u0 (start, page space), v, len }
  const lay = (sx, seed) => { const q = rng(seed); for (let k = 0; k < ROWS; k++) {
    const dir = -1, x0 = pw / 2 - 0.02, lim = pw - 0.16 - (q() < 0.25 ? q() * 0.2 : 0); let x = k % 4 === 0 ? 0 : 0.05, first = true; // he writes from his left (+X) to his right (-X)
    while (x < lim) { const len = first && k % 4 === 0 ? 0.03 : 0.035 + q() * 0.085; if (x + len > lim) break; strokes.push({ sx, u0: x0 + dir * x, v: rowZ(k), len, row: k }); x += len + 0.02 + (first ? 0.015 : 0); first = false; }
    strokes.push({ sx, u0: -(pw / 2 - 0.075), v: rowZ(k), len: 0.03 + q() * 0.03, row: k, sum: true }); } };
  lay(1, 41); const fixed = strokes.length; lay(-1, 77); const live = strokes.length - fixed;
  const ink = node('ink', setOutline(tint(plane(1, 1, 1, 1), INK), 0), M.flat); ink.castShadow = false; ink.instances = makeInstances(strokes.length);
  scene.root.add(ink);
  const SQ = quat.create(), SP = [0, 0, 0], SS = [1, 1, 1], SM = m4.create();
  const putStroke = (i, slot, frac) => { const s = strokes[i], len = s.len * frac, c = onPage(s.sx, s.u0 - len / 2, s.v); quat.fromEuler(SQ, 0, 0, s.sx * tilt * DEG); SP[0] = c[0]; SP[1] = c[1]; SP[2] = c[2]; SS[0] = Math.max(0.0005, len); SS[1] = 1; SS[2] = s.sum ? 0.02 : 0.017; m4.fromTRS(SM, SP, SQ, SS); ink.instances.data.set(SM, slot * 20); };
  for (let i = 0; i < fixed; i++) putStroke(i, i, 1);
  ink.instances.count = fixed; ink.instances.dirty = true;

  // ---- the pen arm: forearm, hand and quill move together; the nib is the node's origin
  const pen = group('pen');
  if (writer) {
    const arm = merge(
      tint(tube(curve([[-0.11, 0.33, -0.8], [-0.24, 0.2, -0.5], [-0.2, 0.11, -0.22], [-0.06, 0.07, -0.05]], 8), (t) => 0.15 - 0.09 * t, 8, { crease: 180 }), ROBE), // from inside his right shoulder (about [-0.11, 0.31, -0.81] from a nib at mid page) down to the wrist
      tint(place(torus(0.065, 0.02, 10, 4), -0.07, 0.075, -0.06, 60, 30, 0), TRIM),
      tint(place(ellipsoid(0.055, 0.045, 0.07, 8, 5), -0.025, 0.055, -0.02), '#ffd9b4'));
    const armNode = node('pen-arm', arm, M.prop), quillNode = node('quill', place(quill({ len: 0.36 }), 0, 0, 0, 0, 62, 0), M.prop);
    pen.add(armNode, quillNode);
  }
  scene.root.add(pen);

  // ---- light: the candle and its flame; the window's shaft across the desk
  const flameNode = node('flame', flame({ r: 0.035, h: 0.11, seg: 6 }), M.speck, { pos: wick }); flameNode.castShadow = false;
  scene.root.add(flameNode);
  const sprites = scene.sprites = createSprites(160);
  const FL = [wick[0], wick[1] + 0.06, wick[2]];
  const candleGlow = sprites.add({ kind: 'glow', pos: FL, size: 1.5, color: '#ffb040', alpha: 0 }), candleCore = sprites.add({ kind: 'glow', pos: FL, size: 0.45, color: '#fff0b0', alpha: 0 });
  const winGlow = sprites.add({ kind: 'glow', pos: [WIN[0], WIN[1] + 2.0, WIN[2] + 0.2], size: 3.6, color: '#6f9af8', alpha: 0 });
  const lamps = [
    { name: 'candle', pos: [FL[0], FL[1] + 0.05, FL[2]], color: '#ffb85a', radius: 5.2, base: 1.25 },
    { name: 'window', pos: [0, 3.0, WALL_Z + 1.6], color: '#7fa2ff', radius: 6.5, base: 0.6 },
  ];
  env.points = lamps.map((l) => ({ pos: l.pos, color: rgb(l.color), radius: l.radius, intensity: l.base * L.power }));
  const shaft = node('window-shaft', tint(place(rayMesh(5.2, 0.7, 1.5, 12), 0, 0, 0), '#7f9cf8'), rayMaterial({ power: 1.2, near: 0.22, far: 0.02 }), { pos: [WIN[0], WIN[1] + 2.5, WIN[2] + 0.1], rot: [38, 0, 0] });
  scene.root.add(shaft);

  const actors = group('actors'); scene.root.add(actors);

  // ---- per-frame
  let power = 1, target = null, written = 0, auto = 0, lastNib = 1, lift = 0, restT = 0;
  const P = [0, 0, 0], V = [0, 0, 0], rnd = rng(77), NIB = [0, 0, 0], REST = onPage(-1, -0.12, -pd / 2 - 0.12, 0.05);
  let nextMote = 0, lastT = -1;
  const setPower = (p) => { power = Math.max(0, Math.min(1.5, p)); };
  const setWritten = (w) => { target = w == null ? null : Math.max(0, Math.min(1, w)); };

  function update(time, dt = 0) {
    const pw2 = L.power * (0.75 + 0.25 * power); // the candle never goes out with the table: the room would be black
    // how much is written: the caller's figure, or the writer's own pace (a page in about forty seconds, then a clean one)
    if (target == null) { auto += dt / 40; if (auto > 1.08) auto = 0; written = Math.min(1, auto); } else written += (target - written) * Math.min(1, dt * 3 + (dt === 0 ? 1 : 0));
    const f = written * live, whole = Math.floor(f), frac = f - whole;
    for (let i = 0; i < whole; i++) putStroke(fixed + i, fixed + i, 1);
    if (whole < live && frac > 0.01) putStroke(fixed + whole, fixed + whole, frac);
    ink.instances.count = fixed + whole + (whole < live && frac > 0.01 ? 1 : 0); ink.instances.dirty = true;
    // the nib sits at the end of the stroke being made; it lifts and rests when nothing is being written
    const writing = Math.abs(f - lastNib) > 1e-4 && written < 1; lastNib = f;
    restT = writing ? 0 : restT + dt;
    const up = restT > 0.6 || written >= 1 ? 1 : 0; lift += (up - lift) * Math.min(1, dt * 4 + (dt === 0 ? 1 : 0));
    if (whole < live) { const s = strokes[fixed + whole], c = onPage(s.sx, s.u0 - s.len * frac, s.v); NIB[0] = c[0]; NIB[1] = c[1]; NIB[2] = c[2]; }
    const scr = writing ? 1 : 0;
    pen.position[0] = NIB[0] + (REST[0] - NIB[0]) * lift * 0.5; pen.position[1] = NIB[1] + 0.004 + lift * 0.06 + scr * Math.abs(Math.sin(time * 31)) * 0.004; pen.position[2] = NIB[2] + (REST[2] - NIB[2]) * lift * 0.5 + scr * Math.sin(time * 23) * 0.006;
    pen.setRot(scr * Math.sin(time * 23) * 3, 0, scr * Math.sin(time * 17) * 2);
    // candle
    const fl = 0.9 + 0.1 * Math.sin(time * 11.3) * Math.sin(time * 6.1) + 0.04 * Math.sin(time * 23);
    flameNode.scale[1] = 0.9 + 0.25 * fl + 0.08 * Math.sin(time * 15); flameNode.setRot(Math.sin(time * 3.3) * 4, time * 50, Math.sin(time * 2.7) * 6);
    env.points[0].intensity = lamps[0].base * pw2 * fl; env.points[1].intensity = lamps[1].base * L.power;
    candleGlow.alpha = 0.62 * pw2 * fl; candleCore.alpha = 0.8 * fl; winGlow.alpha = 0.34;
    if (lastT >= 0 && time - lastT < 0.5 && dt > 0) {
      if (time > nextMote) { // dust in the window's shaft
        nextMote = time + (low ? 0.6 : 0.3); P[0] = -0.9 + rnd() * 1.8; P[1] = 1.2 + rnd() * 2.4; P[2] = WALL_Z + 0.6 + rnd() * 2.6; V[0] = 0.03; V[1] = -0.05 - rnd() * 0.04; V[2] = 0.03;
        sprites.spawn({ kind: 'glow', pos: P, vel: V, size: 0.05 + rnd() * 0.05, life: 6, color: '#bcd0ff', alpha: 0.8 });
      }
      sprites.update(dt);
    }
    lastT = time;
  }

  const rig = setRig('ledger', CAMERAS, env);
  update(0, 0);
  return {
    id: 'ledger', light, low, scene, env, actors, foreground,
    cameras: CAMERAS, frame: rig.frame, view: rig.view,
    marks: { ...MARKS, page: onPage(-1, 0, 0), focus: FL },
    lamps, setPower, setWritten, cue: () => false, task: () => null,
    update,
  };
}

export const ledger = { id: 'ledger', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default ledger;
