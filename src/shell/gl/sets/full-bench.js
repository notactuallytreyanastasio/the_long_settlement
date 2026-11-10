// SET: full-bench. The Full Bench of Aurelle sitting at Cresset: three magistrates, poor, proud and slow, behind
// one long high desk on a dais, under a high window that is the room's light and stands behind them, so the court
// looks up into it. Stage right the dock; stage left the witness stand; below the bench the clerk's table with
// the irons and the log. The plaster is patched, one banner is darned, and a bucket stands under the leak.
// Chapter 8: ch8.s1 All Three (morning: Sable's evidence, Ren's confession, Maravel discharged from the dock),
// ch8.s2 Void (afternoon: Halcyon's counsel; Maravel as witness; the Tribune on whether she exists), ch8.epi.05.
//
//   import { fullBench } from './sets/full-bench.js';
//   const set = fullBench.build(GL, { light: 'morning' | 'afternoon', low: false });
//
// Same shape as sets/lantern-stalls.js. Figures face +Z, cameras look toward -Z (the bench), the strip x -3.2..3.2, z 0..1.6 is clear.
//   speak(i)          which magistrate is speaking (0, 1, 2; -1 none): he leans forward and nods
//   cue(lineId)       ch8.s1.* / ch8.s2.* / ch8.epi.05: the three desk lamps on the bench burn (the court is sitting)
//   task('magistrate', i)   -> { pos (his head), stand: null, set(v) }: the scene-1 encounter. v 0..1 brings up the desk
//                     lamp at his place and leans him in; asking for the task puts all three lamps out first.
//   task('bench-ruling')    -> one unit for the whole bench (scene 2): v 0..1 brings the three lamps up left to right
// Light names: 'morning' (the default: the core's 'day' builds it), 'afternoon', and the core's 'dusk' as an alias of 'afternoon'.
// marks: a, b, c, two, party, opposition, plus focus (the window), dock { pos, face }, dock2 { pos, face } (the second place in the dock),
//        stand { pos, face } (the witness stand), clerk { pos, face }, doorL / doorR { pos, face }, bench: [[x, y, z] x 3] (the magistrates' heads)

import { rng, DEG } from '../math.js';
import { merge, tint, place, box, cylinder, sphere, torus, setGlow, setOutline } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic } from '../scene.js';
import { createSprites } from '../sprites.js';
import { rayMesh, rayMaterial } from '../fx.js';
import { anchorAt } from './kit.js';
import { C8, materials8, shell8, cams, marks8, pick8, norm8, unit8, noteLean8, wallRun, highBench, magistrate, dock, greatWindow, bannerDrop, chequer, bucket, column8, shipLantern } from './kit-ch8.js';

const BACK = -5.4, H = 8.2, DAIS = 0.42;

const LIGHTS = {
  morning: {
    preset: 'day', power: 1, slant: -40,
    env: {
      key: { dir: norm8([-0.14, 0.78, -0.66]), color: '#ffe9b8' },
      shadow: { tint: '#7468e0', lift: 0.12, saturate: 1.45 },
      ambient: { sky: '#ffcf9a', ground: '#6a58cc', amount: 0.15 },
      rim: { color: '#ffe6a0', amount: 1.1, edge: 0.7 },
      fog: { density: 0.0006, start: 40, max: 0.5 },
      sky: { sunDir: norm8([-0.2, 0.6, -1]) }, water: null,
    },
    glass: '#ffe8a0', head: ['#7fe6d2', '#ffd65a', '#ff8fb4'], shaft: '#ffe2a0', patch: '#ffe9a8', lampCol: '#fff0c0',
  },
  afternoon: {
    preset: 'sunset', power: 1.1, slant: -52,
    env: {
      key: { dir: norm8([0.2, 0.56, -0.8]), color: '#ffd4a4' },
      shadow: { tint: '#5a48d0', lift: 0.1, saturate: 1.5 },
      ambient: { sky: '#c08ae6', ground: '#4a3cc0', amount: 0.15 },
      rim: { color: '#ffb870', amount: 1.2, edge: 0.7 },
      fog: { density: 0.0006, start: 40, max: 0.5 },
      sky: { sunDir: norm8([0.3, 0.4, -1]) }, water: null,
    },
    glass: '#ffc888', head: ['#ff8fb4', '#ffb050', '#b890ff'], shaft: '#ffb070', patch: '#ffc078', lampCol: '#ffd0a0', winK: 0.6,
  },
};
LIGHTS.dusk = LIGHTS.afternoon;      // the core's name for it (core/stage.js LIGHTS); app.js builds a set's first light for any name it does not list

const CAMERAS = cams({
  wide: { target: [0.05, 2.1, -0.6], dist: 8.6, yaw: 2, pitch: 1, fov: 47 },
  low: { target: [0.1, 2.5, -0.4], dist: 6.4, yaw: -6, pitch: -19, fov: 58 },
  stage: { target: [0, 1.25, 0.3], dist: 9.6, yaw: -12, pitch: 5, fov: 26, aspect: 1.95, shadowCenter: [0, 0, -1], shadowRadius: 7.5, outline: 0.7 },
  landscape: { target: [0, 2.3, -1.4], dist: 10.5, yaw: 3, pitch: 2, fov: 44 },
});

function build(engine = null, { light: lightName, low = false } = {}) {
  const [light, L] = pick8('full-bench', LIGHTS, lightName);
  const M = materials8(), r = rng(8707);
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env; env.sky.sunDir = norm8(env.sky.sunDir);

  // ---- the room: a back wall with the window in it, two splayed side walls each with a door, a beamed ceiling
  const room = group('room'), deco = (n) => { n.castShadow = false; return n; };
  room.add(node('floor', chequer({ w: 20, d: 14, n: 12, m: 8, colors: ['#f6dcc8', '#e8a090'] }), M.flat, { pos: [0, 0, 0.4] }));
  room.add(node('back', tint(place(box(12.4, H, 0.4), 0, H / 2, BACK - 0.2), '#f0b8c0'), M.wall));
  room.add(node('back-dado', tint(place(box(12.4, 2.3, 0.1), 0, 1.15, BACK + 0.05), '#27a0a8'), M.wall), node('back-rail', tint(place(box(12.4, 0.16, 0.16), 0, 2.36, BACK + 0.08), C8.brass), M.wall));
  const SL = wallRun([-8.6, 2.6], [-5.9, BACK], { h: H, color: '#e8a8b8' }), SR = wallRun([5.9, BACK], [8.6, 2.6], { h: H, color: '#e8a8b8' });
  room.add(node('side-l', SL, M.wall), node('side-r', SR, M.wall));
  room.add(node('ceiling', merge(tint(place(box(18, 0.2, 9), 0, H + 0.1, BACK + 4.2), '#b8a0e8'), ...[0, 1, 2, 3].map((i) => tint(place(box(18, 0.4, 0.44), 0, H - 0.2, BACK + 0.9 + i * 2.1), C8.plum))), M.wall));
  // patched plaster
  for (const [x, y, w, h2] of [[-3.9, 5.6, 1.1, 0.8], [4.3, 4.4, 0.9, 1.2], [3.2, 6.9, 1.4, 0.6]]) room.add(node('patch', tint(place(box(w, h2, 0.04), x, y, BACK + 0.03, 0, 0, (r() - 0.5) * 10), '#f8ccc8'), M.wall));
  scene.root.add(mergeStatic(room, 'room'));

  const props = group('props');
  // the window, high in the back wall, between two columns
  const WIN = [0, 2.95, BACK + 0.02], gw = greatWindow({ w: 3.7, h: 4.7, cols: 3, glass: L.glass, head: L.head, frame: '#fff0dc', bars: C8.plum });
  props.add(deco(node('window', gw, M.prop, { pos: WIN })));
  const FOCUS = [WIN[0], WIN[1] + 2.6, WIN[2] + 0.2];
  for (const sx of [-1, 1]) props.add(deco(node('column', column8({ h: H - 0.2, r: 0.36, color: '#fff0dc' }), M.prop, { pos: [sx * 2.75, 0, BACK + 0.45] })));
  for (const [x, col, dev, patch] of [[-4.5, C8.oxblood, 'scales', true], [4.5, C8.royal, 'flame', false]]) props.add(deco(node('banner', bannerDrop({ w: 1.15, h: 3.3, color: col, device: dev, patch }), M.prop, { pos: [x, 6.6, BACK + 0.12], rot: [0, 0, x < 0 ? 1.5 : -1] })));
  // the dais and the bench
  props.add(node('dais', merge(tint(place(box(8.2, DAIS, 2.9), 0, DAIS / 2, BACK + 1.45), '#b8527a'), tint(place(box(8.8, DAIS / 2, 3.3), 0, DAIS / 4, BACK + 1.6), '#8e3a6a'), tint(place(box(8.2, 0.03, 0.12), 0, DAIS + 0.01, BACK + 2.84), C8.brass)), M.prop));
  const BENCH = [0, DAIS, BACK + 2.1], hb = highBench({ w: 6.6, h: 1.62, d: 0.9, seed: 3 });
  props.add(node('bench', hb, M.prop, { pos: BENCH }));
  const seats = anchorAt(hb, 'seats', BENCH);
  seats.forEach((s, i) => props.add(deco(node('chair', merge(tint(place(box(1.0, 2.5, 0.16), 0, 1.25, -0.42), [C8.oxbloodDark, C8.plum, C8.oxbloodDark][i]), tint(place(sphere(0.14, 6, 4), -0.5, 2.56, -0.42), C8.brass), tint(place(sphere(0.14, 6, 4), 0.5, 2.56, -0.42), C8.brass)), M.prop, { pos: [s[0], DAIS, s[2]], rot: [0, 0, (i - 1) * 1.2] }))));
  // the clerk's table below the bench: the log, the irons, a bell
  const CLERK = [0, 0, BACK + 3.75];
  props.add(node('clerk-table', merge(tint(place(box(2.3, 0.1, 0.85), 0, 0.74, 0), C8.woodRed), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => tint(place(cylinder(0.06, 0.08, 0.72, 6), x * 1.0, 0, z * 0.32), C8.woodDark)), tint(place(box(2.2, 0.3, 0.04), 0, 0.56, 0.42), '#27a0a8'),
    tint(place(box(0.6, 0.08, 0.44), -0.6, 0.83, 0, 0, 12, 0), '#7a3048'), tint(place(box(0.52, 0.03, 0.38), -0.6, 0.885, 0, 0, 12, 0), C8.parchment),
    tint(place(torus(0.1, 0.03, 8, 4), 0.35, 0.82, 0.05), '#8f97c8'), tint(place(torus(0.1, 0.03, 8, 4), 0.62, 0.82, 0.0), '#8f97c8'), tint(place(box(0.2, 0.03, 0.04), 0.48, 0.82, 0.03, 0, 10, 0), '#8f97c8'),
    tint(place(cylinder(0.09, 0.03, 0.12, 8), 0.95, 0.79, -0.15), C8.brass)), M.prop, { pos: CLERK }));
  // the dock (stage right) and the witness stand (stage left)
  const DOCK = [4.25, 0, -1.25], DOCK_YAW = -24, dk = dock({ w: 2.5, d: 1.3 });
  props.add(node('dock', dk, M.prop, { pos: DOCK, rot: [0, DOCK_YAW, 0] }));
  const STAND = [-4.2, 0, -1.3], STAND_YAW = 24, ws = dock({ w: 1.3, d: 1.2, color: C8.woodRed, rail: C8.brass });
  props.add(node('stand', ws, M.prop, { pos: STAND, rot: [0, STAND_YAW, 0] }));
  // doors in the side walls, each with a lit fanlight; sconces by them
  const doorAt = (W, t, name) => { const a = W.anchors, c = Math.cos(a.yaw * DEG), s = Math.sin(a.yaw * DEG), p = [a.mid[0] + c * t, 0, a.mid[2] - s * t], n = [s, c]; props.add(deco(node(name, merge(tint(place(box(1.7, 3.1, 0.12), 0, 1.55, 0.24), '#fff0dc'), tint(place(box(1.36, 2.5, 0.1), 0, 1.25, 0.28), C8.teal), setGlow(tint(place(box(1.36, 0.5, 0.1), 0, 2.78, 0.28), '#ffd078'), 0.95), tint(place(sphere(0.07, 6, 4), 0.5, 1.2, 0.36), C8.brass)), M.prop, { pos: p, rot: [0, a.yaw, 0] }))); return { pos: [p[0] + n[0] * 1.0, 0, p[2] + n[1] * 1.0], lamp: [p[0] + n[0] * 0.7, 2.8, p[2] + n[1] * 0.7], yaw: a.yaw }; };
  const DL = doorAt(SL, 1.4, 'door-l'), DR = doorAt(SR, -1.4, 'door-r');
  const sconces = [[-5.3, 3.0, BACK + 0.3], [5.3, 3.0, BACK + 0.3]];
  for (const p of sconces) props.add(deco(node('sconce', merge(tint(place(box(0.12, 0.5, 0.2), 0, 0.3, -0.12), C8.brassDark), place(shipLantern({ s: 1.3 }), 0, 0.3, 0.12)), M.prop, { pos: p })));
  // the leak: a bucket, stage left at the back
  const BUCKET = [-3.3, DAIS, BACK + 2.5];
  props.add(node('bucket', bucket({ s: 1.2 }), M.prop, { pos: BUCKET }));
  // the public benches along the side walls
  if (!low) for (const sx of [-1, 1]) props.add(node('pew', merge(tint(place(box(2.6, 0.12, 0.5), 0, 0.5, 0), C8.woodRed), tint(place(box(2.6, 0.7, 0.1), 0, 0.85, -0.24), C8.woodRed), tint(place(box(0.12, 0.5, 0.5), -1.2, 0.25, 0), C8.woodDark), tint(place(box(0.12, 0.5, 0.5), 1.2, 0.25, 0), C8.woodDark)), M.prop, { pos: [sx * 6.6, 0, -0.2], rot: [0, -sx * 66, 0] }));
  scene.root.add(mergeStatic(props, 'props'));

  // ---- the three magistrates (they lean and nod, so each is its own node)
  const robes = [C8.oxblood, '#7a4fc4', '#2f8f9a'], judges = seats.map((s, i) => { const n = node('magistrate' + i, magistrate({ robe: robes[i], s: [1.12, 1.3, 1.0][i], fat: [1.0, 1.25, 0.86][i], seed: 3 + i * 4, specs: i === 2, skin: ['#ffd9b4', '#f2c098', '#e8b088'][i] }), M.prop, { pos: [s[0], s[1] + 0.3, s[2] + 0.12] }); scene.root.add(n); return n; });
  const heads = seats.map((s, i) => [s[0], s[1] + 0.4 + [1.1, 1.28, 0.98][i], s[2] + 0.14]);
  // a desk lamp at each place on the bench: brass stem, a shade that is dark until that magistrate is satisfied
  const deskAt = seats.map((s) => [s[0] + 0.72, DAIS + 1.62, BACK + 2.1 + 0.26]);
  { const stems = group('desk-stems'); for (const p of deskAt) stems.add(node('stem', merge(tint(place(cylinder(0.1, 0.13, 0.04, 8), 0, 0.02, 0), C8.brassDark), tint(place(cylinder(0.022, 0.022, 0.3, 6), 0, 0.04, 0), C8.brass)), M.prop, { pos: p })); const st = mergeStatic(stems, 'desk-stems'); st.castShadow = false; scene.root.add(st); }
  const shades = deskAt.map((p, i) => { const n = node('desk-shade' + i, setOutline(setGlow(tint(place(sphere(0.15, 10, 7), 0, 0.42, 0), '#ffffff'), 1), 0.7), M.lantern, { pos: p }); n.castShadow = false; scene.root.add(n); return n; });
  // the clock on the right wall: slow
  const CLK = [SR.anchors.mid[0] - 0.9, 4.4, SR.anchors.mid[2] - 1.9], clk = node('clock', merge(tint(place(box(0.9, 2.0, 0.26), 0, 0, 0), C8.woodRed), tint(place(cylinder(0.34, 0.34, 0.06, 12), 0, 0.5, 0.14, 90, 0, 0), C8.parchment), tint(place(box(0.03, 0.26, 0.02), 0, 0.62, 0.19), C8.navy), tint(place(box(0.03, 0.18, 0.02), 0.07, 0.52, 0.19, 0, 0, -70), C8.navy)), M.prop, { pos: CLK, rot: [0, SR.anchors.yaw, 0] }); clk.castShadow = false; scene.root.add(clk);
  const pend = node('pendulum', merge(tint(place(box(0.04, 0.8, 0.03), 0, -0.4, 0), C8.brassDark), tint(place(cylinder(0.14, 0.14, 0.04, 10), 0, -0.86, 0, 90, 0, 0), C8.brass)), M.prop, { pos: [0, 0.05, 0.16] }); pend.castShadow = false; clk.add(pend);

  // ---- the window's light: three shafts slanting down over the bench onto the floor, and the panes thrown on the floor
  {
    const parts = []; for (const dx of [-1.2, 0, 1.2]) parts.push(place(rayMesh(low ? 8 : 9.5, 0.5, 0.95, low ? 8 : 12), WIN[0] + dx, WIN[1] + 2.5, WIN[2] + 0.3, L.slant, dx * -4 + (L.slant < -45 ? -12 : 6), 0));
    scene.root.add(node('shafts', tint(merge(parts), L.shaft), rayMaterial({ power: 1.2, near: 0.6, far: 0.14 })));
  }
  const reach = L.slant < -45 ? 1.9 : 1.2, skew = L.slant < -45 ? -0.9 : 0.5;
  const panes = []; for (let i = 0; i < 3; i++) panes.push(tint(place(box(0.95, 0.004, 2.5 * reach), (i - 1) * 1.12 + skew, 0.006, -1.4 + reach * 0.9), i === 1 ? L.patch : L.patch), tint(place(cylinder(0.5, 0.5, 0.004, 10), (i - 1) * 1.12 + skew, 0.008, -1.4 + reach * 0.9 + 1.25 * reach), L.head[i]));
  const patch = node('patch', setOutline(setGlow(merge(panes), 0.5), 0), M.flat); patch.castShadow = false; scene.root.add(patch);

  const fg = group('fg');
  fg.add(node('bar', merge(tint(place(box(2.6, 0.1, 0.14), 0, 0.84, 0), C8.brass), tint(place(box(2.6, 0.5, 0.06), 0, 0.42, 0), C8.woodRed), tint(place(box(0.14, 0.9, 0.14), -1.3, 0.45, 0), C8.woodDark), tint(place(box(0.14, 0.9, 0.14), 1.3, 0.45, 0), C8.woodDark), tint(place(sphere(0.11, 6, 4), -1.3, 0.98, 0), C8.brass), tint(place(sphere(0.11, 6, 4), 1.3, 0.98, 0), C8.brass)), M.prop, { pos: [-2.9, 0, 3.0], rot: [0, 6, 0] }));
  fg.add(node('bar2', merge(tint(place(box(2.2, 0.1, 0.14), 0, 0.84, 0), C8.brass), tint(place(box(2.2, 0.5, 0.06), 0, 0.42, 0), C8.woodRed), tint(place(box(0.14, 0.9, 0.14), -1.1, 0.45, 0), C8.woodDark), tint(place(box(0.14, 0.9, 0.14), 1.1, 0.45, 0), C8.woodDark)), M.prop, { pos: [3.0, 0, 3.0], rot: [0, -6, 0] }));
  const foreground = mergeStatic(fg, 'foreground'); scene.root.add(foreground);
  const actors = group('actors'); scene.root.add(actors);

  const lamps = [
    { name: 'window', pos: [0, 4.2, BACK + 2.6], color: L.lampCol, radius: 8.5, base: 1.15 * (L.winK ?? 1), flicker: 0, fixed: true },
    { name: 'floor', pos: [skew, 1.4, 0.4], color: L.patch, radius: 5.5, base: 0.75 * (L.winK ? 0.85 : 1), flicker: 0, fixed: true },
    { name: 'sconce-left', pos: [sconces[0][0], sconces[0][1] - 0.25, sconces[0][2] + 0.3], color: '#ffb458', radius: 5.5, base: 1.0 },
    { name: 'sconce-right', pos: [sconces[1][0], sconces[1][1] - 0.25, sconces[1][2] + 0.3], color: '#ffb458', radius: 5.5, base: 1.0 },
    { name: 'door-left', pos: DL.lamp, color: '#ffc470', radius: 4.2, base: 0.8 },
    { name: 'door-right', pos: DR.lamp, color: '#ffc470', radius: 4.2, base: 0.8 },
  ];
  const sprites = scene.sprites = createSprites(low ? 96 : 256);
  const glows = sconces.map((p, i) => ({ sprite: sprites.add({ kind: 'glow', pos: [p[0], p[1] - 0.25, p[2] + 0.14], size: 1.6, color: '#ffb450', alpha: 0 }), base: 0.6, lamp: i + 2 }));
  glows.push({ sprite: sprites.add({ kind: 'glow', pos: FOCUS, size: 6.5, color: L.glass, alpha: 0 }), base: 0.34, fixed: true });

  const deskGlow = deskAt.map((p) => sprites.add({ kind: 'glow', pos: [p[0], p[1] + 0.42, p[2] + 0.1], size: 1.5, color: '#ffd070', alpha: 0 }));
  let speaking = -1; const lean = [0, 0, 0];
  const speak = (i) => { speaking = i; };
  // how far each magistrate has been brought round: 1 = his lamp burns (the court at rest), 0 = dark (scene 1 opens)
  const won = [1, 1, 1], wonNow = [1, 1, 1];
  const benchTasks = heads.map((h, i) => unit8([h[0], h[1] - 0.35, h[2] + 0.5], null, (v) => { won[i] = v; }));
  const rulingTask = unit8([heads[1][0], heads[1][1] - 0.35, heads[1][2] + 0.5], null, (v) => { for (let k = 0; k < 3; k++) won[k] = Math.max(0, Math.min(1, v * 3 - k)); });
  const task = (type, i = 0) => {
    const t = String(type), dark = () => { for (let k = 0; k < 3; k++) won[k] = wonNow[k] = 0; };
    if (t === 'bench-ruling') { dark(); return rulingTask.reset(); }
    if (t !== 'magistrate' || !benchTasks[i]) return null;
    if (i === 0) { dark(); for (const u of benchTasks) u.reset(); }
    return benchTasks[i];
  };
  const cue = (id) => { noteLean8(id); if (!/^ch8\.(s1|s2|epi)\./.test(String(id))) return false; for (let k = 0; k < 3; k++) won[k] = 1; return true; };
  const P = [0, 0, 0], V = [0, -0.2, 0];
  let nextDrip = 1.2;
  function tick(time, dt, pw, live) {
    for (let i = 0; i < 3; i++) {
      const w = (wonNow[i] += (won[i] - wonNow[i]) * Math.min(1, dt * 3 + (dt === 0 ? 1 : 0))), t = shades[i].tint;
      t[0] = 0.3 + 0.82 * w; t[1] = 0.32 + 0.6 * w; t[2] = 0.5 - 0.16 * w; shades[i].glow = w; deskGlow[i].alpha = 0.75 * w * (0.92 + 0.08 * Math.sin(time * 9 + i * 2));
    }
    for (let i = 0; i < 3; i++) { lean[i] += ((speaking === i || (won[i] > 0.5 && wonNow[i] < 0.97) ? 1 : 0) - lean[i]) * Math.min(1, dt * 4 + (dt === 0 ? 1 : 0)); judges[i].setRot(4 + lean[i] * 9 + Math.sin(time * (0.5 + i * 0.13) + i * 2) * 1.5 + lean[i] * Math.sin(time * 5) * 2.5, Math.sin(time * 0.31 + i * 1.7) * 7, Math.sin(time * 0.4 + i) * 1.5); }
    pend.setRot(0, 0, Math.sin(time * 1.4) * 14);
    if (live && time > nextDrip) { nextDrip = time + 2.3; P[0] = BUCKET[0]; P[1] = H - 0.4; P[2] = BUCKET[2]; V[1] = -1; sprites.spawn({ kind: 'dot', pos: P, vel: V, size: 0.07, life: 1.15, color: '#bfe4ff', gravity: 9 }); }
  }

  return shell8({
    id: 'full-bench', light, L, low, scene, cameras: CAMERAS, actors, foreground, lamps, glows, tick, house: 0.6,
    motes: low ? null : { box: [-2.2, 2.2, 0.6, 5.5, BACK + 0.8, 1.2], every: 0.22, color: L.patch, size: 0.07, vel: [0.02, -0.04, 0.05], life: 6, alpha: 0.85 },
    marks: {
      ...marks8(), focus: FOCUS, bench: heads,
      dock: { pos: [DOCK[0] - 0.5, 0.14, DOCK[2] + 0.1], face: DOCK_YAW - 20 }, dock2: { pos: [DOCK[0] + 0.55, 0.14, DOCK[2] - 0.35], face: DOCK_YAW - 20 },
      stand: { pos: [STAND[0], 0.14, STAND[2] - 0.1], face: STAND_YAW + 20 }, clerk: { pos: [CLERK[0] + 1.6, 0, CLERK[2] + 0.3], face: -30 }, doorL: { pos: DL.pos, face: DL.yaw }, doorR: { pos: DR.pos, face: DR.yaw },
    },
    extra: { speak, task, cue },
  });
}

export const fullBench = { id: 'full-bench', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default fullBench;
