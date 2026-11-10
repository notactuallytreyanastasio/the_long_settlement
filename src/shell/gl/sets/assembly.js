// SET: assembly. The Assembly of Aurelle at Cresset, at noon: a horseshoe of forty seats under a dome with an open
// eye of sky. Twenty-eight delegates; twelve seats draped in grey and left in the room. In the middle of the floor,
// in the shaft of light from the eye, the Settlement lies open on its stand with a pen beside it. Stage right is
// the bar of the house, where the bench is permitted to stand; above the seats, the public gallery.
// Chapter 8: ch8.s5 (the Tribune names the twelve; "Look up. The light is going": the eye goes grey), ch8.s7
// (commons: Renewal Day, she signs, the twelve seats are undraped), ch8.m7 (mint: half the seats stand empty; an
// old man stands up in the gallery).
//
//   import { assembly } from './sets/assembly.js';
//   const set = assembly.build(GL, { light: 'noon' | 'grey', low: false });
//
// Same shape as sets/lantern-stalls.js. Figures face +Z, cameras look toward -Z, the strip x -3.2..3.2, z 0..1.6 is clear.
//   setSky(0..1)        1 = the eye white with noon, 0 = grey (the Founders' Lamp has gone out); it eases
//   setDraped(n)        how many of the twelve seats are still under grey cloth (12 .. 0)
//   setHouse(0..1)      how many of the twenty-eight delegates are in their seats (m7: 0.5)
//   task('seat-block', i)  -> { pos, stand: null, set(v) }: the scene-5 encounter. The house in three blocks, stage left
//                       to stage right; v 0..1 brings block i to its feet. Asking for block 0 seats everyone under a white eye.
//   task('casting-vote') -> { pos (the treaty), stand: null, set(v) }: the scene-7 encounter, in quarters: the house
//                       finds its seats (half of it after THE SUM: kit-ch8 lean8()), one arm of the horseshoe stands,
//                       then the other, then all sit and the treaty on its table is lit.
//   encounter(st)       (the director, at a scene's setup) everyone seated, cloths on, the eye white
//   setback(cue)        uproar: for a second and a half a scatter of the house is on its feet
//   marks.extras        where an encounter's delegates stand on the floor (the director pins them there: they are who a
//                       'talk' is addressed to, and a pinned extra does not come at the party on a drain)
//   cue(lineId)         also hears briefing and bark ids in play: a scene-7 briefing tells it which ending this is
// Light names: 'noon' (the default: the core's 'day' builds it) and 'grey'.
//   cue(lineId)         ch8.s5.c21 the eye goes grey; ch8.s7.c13 on, the drapes come off; ch8.m7.* half the house
// marks: a, b, c, two, party, opposition, plus focus (the treaty), lectern { pos, face }, bar { pos, face },
//        gallery { pos, face } (y is the gallery floor), draped: [[x, y, z]...] the twelve seats, Saltmere last

import { rng, DEG, rgb } from '../math.js';
import { merge, tint, place, box, cylinder, sphere, setGlow, setOutline } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic, makeInstances } from '../scene.js';
import { createSprites } from '../sprites.js';
import { rayMesh, rayMaterial } from '../fx.js';
import { COATS, townsfolk, railing, brazier, flame, anchorAt } from './kit.js';
import { C8, materials8, shell8, cams, marks8, pick8, norm8, unit8, noteLean8, lean8, arcWall, horseshoe, tierArc, seat, drape, domeInside, column8, lectern, greatWindow, bannerDrop, putInst } from './kit-ch8.js';

const CZ = -3.3, RW = 9.6, WALL_H = 5.4;

const ENV = {
  key: { dir: norm8([0.12, 1, 0.3]), color: '#e2d6f6' },
  shadow: { tint: '#5a50d0', lift: 0.08, saturate: 1.5 },
  ambient: { sky: '#a8c0ff', ground: '#e8a8b8', amount: 0.11 },
  rim: { color: '#fff4d0', amount: 0.6, edge: 0.76 },
  fog: { density: 0.0006, start: 40, max: 0.5 },
  sky: { zenith: '#2a7ae8', mid: '#7cc8fa', midAt: 0.5, horizon: '#e6f6ff', below: '#cfeaff', sunDir: norm8([0.1, 1, 0.1]), sun: { size: 3.6, haloAmount: 0.7 } },
  water: null,
};
const LIGHTS = { noon: { preset: 'day', power: 1, sky: 1, env: ENV }, grey: { preset: 'day', power: 1, sky: 0, env: ENV } };
const GREY = { key: rgb('#9a9ec8'), tint: rgb('#5a5cb4'), zenith: rgb('#8a90b8'), mid: rgb('#a8aecc'), horizon: rgb('#c4c8dc') };

const CAMERAS = cams({
  wide: { target: [0.05, 2.45, -0.6], dist: 8.8, yaw: 2, pitch: 0, fov: 47 },
  low: { target: [0.1, 2.6, -0.2], dist: 6.4, yaw: -5, pitch: -22, fov: 60 },
  stage: { target: [0, 1.2, 0.3], dist: 9.6, yaw: -12, pitch: 6, fov: 26, aspect: 1.95, shadowCenter: [0, 0, -1], shadowRadius: 8, outline: 0.7 },
  landscape: { target: [0, 2.2, -1.6], dist: 11, yaw: 3, pitch: 3, fov: 44 },
});
// which of the forty are draped: spread through both rows, several where a portrait camera sees them
const DRAPED = [1, 4, 6, 12, 16, 20, 25, 27, 30, 34, 38, 26];
const CLOTH = [C8.oxblood, C8.royal, C8.teal, C8.plum, '#e8a030', '#2fba7e', C8.wine, '#3f9ae8'];

function build(engine = null, { light: lightName, low = false } = {}) {
  const [light, L] = pick8('assembly', LIGHTS, lightName);
  const M = materials8(), r = rng(8606);
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env; env.sky.sunDir = norm8(env.sky.sunDir);
  const NOON = { key: Array.from(env.key.color), tint: Array.from(env.shadow.tint), zenith: Array.from(env.sky.zenith), mid: Array.from(env.sky.mid), horizon: Array.from(env.sky.horizon) };

  // ---- the chamber
  const room = group('room'), deco = (n) => { n.castShadow = false; return n; };
  const disc = (rad, col, y) => tint(place(cylinder(rad, rad, 0.02, low ? 18 : 28), 0, y, CZ), col);
  room.add(node('floor', setOutline(merge(tint(place(box(34, 0.02, 16), 0, -0.03, 2), '#a880c4'), disc(RW, '#d8b4d0', -0.024), disc(4.5, C8.oxblood, -0.018), disc(4.25, '#e6bcc0', -0.012), ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => tint(place(box(0.14, 0.006, 4.1), Math.sin(i * 45 * DEG) * 2.1, -0.009, CZ - Math.cos(i * 45 * DEG) * 2.1, 0, -i * 45, 0), i % 2 ? C8.royal : C8.oxblood)), disc(2.5, C8.brass, -0.006), disc(2.35, '#f0d0c4', -0.003)), 0), M.flat));
  room.add(node('wall', arcWall({ r: RW, h: WALL_H, a0: -150, a1: 150, seg: low ? 14 : 22, color: '#b48fe0' }), M.wall, { pos: [0, 0, CZ] }));
  room.add(node('frieze', arcWall({ r: RW - 0.05, y: WALL_H - 0.5, h: 0.5, a0: -150, a1: 150, seg: low ? 14 : 22, color: C8.brass }), M.wall, { pos: [0, 0, CZ] }));
  room.add(node('dado', arcWall({ r: RW - 0.04, h: 1.5, a0: -150, a1: 150, seg: low ? 14 : 22, color: '#b03478' }), M.wall, { pos: [0, 0, CZ] }));
  room.add(node('dome', domeInside({ r: RW, h: 5.4, eye: 1.7, seg: low ? 14 : 20, ribs: low ? 8 : 12, color: '#5c6ce4', low }), M.wall, { pos: [0, WALL_H, CZ] }));
  const HS = horseshoe({ rows: [14, 26], r0: 5.2, step: 1.3, rise: 0.42, a0: -116, a1: 116, cz: CZ });
  room.add(node('tier1', tierArc({ r: 4.55, step: 1.3, h: 0.42, a0: -124, a1: 124, seg: low ? 12 : 20, color: '#dcb8d4', riser: '#b86a9c' }), M.wall, { pos: [0, 0, CZ] }));
  room.add(node('tier2', tierArc({ r: 5.85, step: 3.8, h: 0.42, y: 0.42, a0: -124, a1: 124, seg: low ? 12 : 20, color: '#cfa8cc', riser: '#b86a9c' }), M.wall, { pos: [0, 0, CZ] }));
  // the public gallery: a balcony round the wall
  const GAL_Y = 3.15;
  room.add(node('gallery', merge(tierArc({ r: RW - 1.5, step: 1.5, h: 0.3, y: GAL_Y - 0.3, a0: -150, a1: 150, seg: low ? 14 : 22, color: '#e6ccd4', riser: C8.oxblood }), arcWall({ r: RW - 1.5, y: GAL_Y, h: 0.55, a0: -150, a1: 150, seg: low ? 14 : 22, color: '#f0dcdc' })), M.wall, { pos: [0, 0, CZ] }));
  scene.root.add(mergeStatic(room, 'room'));

  const props = group('props');
  // windows and banners round the wall, columns carrying the gallery
  const NW = low ? 5 : 7;
  for (let i = 0; i < NW; i++) {
    const a = -108 + (216 * i) / (NW - 1), s = Math.sin(a * DEG), c = Math.cos(a * DEG);
    props.add(deco(node('window', greatWindow({ w: 1.5, h: 1.55, cols: 2, glass: '#bfe4ff', head: ['#7fe6d2', '#ffd65a'], frame: '#fff4e4', bars: C8.brassDark, glow: 0.95 }), M.prop, { pos: [s * (RW - 0.18), GAL_Y + 0.62, CZ - c * (RW - 0.18)], rot: [0, -a, 0] })));
    if (i < NW - 1) { const b = a + 108 / (NW - 1), sb = Math.sin(b * DEG), cb = Math.cos(b * DEG); props.add(deco(node('banner', bannerDrop({ w: 0.8, h: 1.9, color: CLOTH[i % CLOTH.length], device: ['scales', 'flame', 'ring'][i % 3] }), M.prop, { pos: [sb * (RW - 1.62), GAL_Y - 0.36, CZ - cb * (RW - 1.62)], rot: [0, -b, 0] }))); }
  }
  for (let i = 0; i < (low ? 6 : 8); i++) { const a = -119 + (238 * i) / ((low ? 6 : 8) - 1), s = Math.sin(a * DEG), c = Math.cos(a * DEG); props.add(deco(node('column', column8({ h: GAL_Y - 0.3 - 0.84, r: 0.2 }), M.prop, { pos: [s * (RW - 1.3), 0.84, CZ - c * (RW - 1.3)] }))); }
  // the Settlement on its stand, in the middle of the floor
  const LEC = [0, 0, CZ - 0.1], lec = lectern({ w: 1.55, d: 0.95, h: 0.96 });
  props.add(node('lectern', lec, M.prop, { pos: LEC }));
  const FOCUS = anchorAt(lec, 'top', LEC);
  // the bar of the house, stage right; the usher's rail, stage left
  props.add(node('bar', railing({ len: 2.6, h: 0.86, bay: 0.86, color: C8.brass, post: C8.woodRed, cap: C8.brass }), M.prop, { pos: [4.75, 0, 0.9], rot: [0, 72, 0] }), node('bar2', railing({ len: 2.2, h: 0.86, bay: 0.73, color: C8.brass, post: C8.woodRed, cap: C8.brass }), M.prop, { pos: [-4.75, 0, 0.9], rot: [0, -72, 0] }));
  // the Speaker's chair at the head of the horseshoe, between the rows' ends at the back
  props.add(deco(node('chair', merge(tint(place(box(1.2, 2.6, 0.2), 0, 1.3, -0.3), C8.oxblood), tint(place(box(1.4, 0.2, 0.3), 0, 2.7, -0.3), C8.brass), tint(place(sphere(0.2, 8, 6), 0, 3.0, -0.3), C8.brass), tint(place(box(1.2, 0.5, 0.8), 0, 0.25, 0.1), C8.woodRed), tint(place(box(1.0, 0.12, 0.7), 0, 0.56, 0.1), C8.royal)), M.prop, { pos: [0, 0.84, CZ - 8.3] })));
  const BZ = [[-3.6, 0, CZ - 2.2], [3.6, 0, CZ - 2.2]], bz = brazier({ h: 1.25, r: 0.26, color: C8.brassDark });
  for (const p of BZ) props.add(node('standard', bz, M.prop, { pos: p }));
  scene.root.add(mergeStatic(props, 'props'));
  const fires = BZ.map((p) => { const n = node('fire', flame({ r: 0.2, h: 0.5 }), M.lantern, { pos: anchorAt(bz, 'fire', p) }); n.castShadow = false; scene.root.add(n); return n; });

  // ---- the forty seats, the twelve cloths, the delegates, the gallery
  const seats = node('seats', seat(), M.prop), drapes = node('drapes', drape(), M.prop), house = node('delegates', townsfolk({ hold: 'none', detail: low ? 0 : 1 }), M.prop), gal = node('public', townsfolk({ hold: 'none', detail: 0 }), M.prop);
  seats.instances = makeInstances(40); drapes.instances = makeInstances(12); house.instances = makeInstances(28); gal.instances = makeInstances(14);
  for (const n of [seats, drapes, house, gal]) { n.castShadow = false; scene.root.add(n); }
  const live = [], dead = [];
  HS.forEach((s, i) => { const c = rgb(CLOTH[(i * 5 + s.row * 3) % CLOTH.length]), d = DRAPED.indexOf(i); putInst(seats.instances, i, s.pos[0], s.pos[1], s.pos[2], 0, s.face, 0, 1, 1, 1, c[0], c[1], c[2]); if (d >= 0) dead[d] = s; else live.push(s); });
  seats.instances.count = 40;
  const people = live.map((s, i) => ({ s, col: rgb(COATS[(i * 3) % COATS.length]), ph: r() * 6.28, k: 0.82 + r() * 0.16, order: r(), block: 0, arm: 0, up: 0 }));
  // three blocks of the house by where they sit, stage left to stage right, and its two arms
  { const byX = people.slice().sort((a, b) => a.s.pos[0] - b.s.pos[0]); byX.forEach((p, i) => { p.block = Math.min(2, Math.floor(i * 3 / byX.length)); p.arm = i * 2 < byX.length ? 0 : 1; }); }
  const NG = low ? 8 : 14; for (let i = 0; i < NG; i++) { const a = (-96 + (192 * i) / (NG - 1) + (r() - 0.5) * 6) * DEG, c = rgb(COATS[(i * 5 + 2) % COATS.length]); putInst(gal.instances, i, Math.sin(a) * (RW - 0.95), GAL_Y, CZ - Math.cos(a) * (RW - 0.95), 0, -a / DEG, 0, 0.92, 0.92, 0.92, c[0], c[1], c[2]); }
  gal.instances.count = NG;

  // ---- the light from the eye
  const EYE = [0, WALL_H + 5.4, CZ];
  const shaft = node('shaft', tint(rayMesh(EYE[1] + 0.2, 1.5, 2.7, low ? 12 : 18), '#ffe2a0'), rayMaterial({ power: 1.3, near: 0.3, far: 0.1 }), { pos: EYE }); scene.root.add(shaft);
  const pool = node('pool', setOutline(setGlow(tint(cylinder(2.6, 2.6, 0.012, 24), '#fffbe6'), 0.75), 0), M.flat, { pos: [0, 0.002, CZ] }); pool.castShadow = false; scene.root.add(pool);

  const fg = group('fg');
  fg.add(node('fg-rail', railing({ len: 2.4, h: 0.8, bay: 0.8, color: C8.brass, post: C8.woodRed, cap: C8.brass }), M.prop, { pos: [-2.5, 0, 2.95], rot: [0, 8, 0] }), node('fg-rail2', railing({ len: 2.0, h: 0.8, bay: 0.66, color: C8.brass, post: C8.woodRed, cap: C8.brass }), M.prop, { pos: [2.7, 0, 2.95], rot: [0, -8, 0] }));
  const foreground = mergeStatic(fg, 'foreground'); scene.root.add(foreground);
  const actors = group('actors'); scene.root.add(actors);

  const firePos = BZ.map((p) => anchorAt(bz, 'fire', p));
  const lamps = [
    { name: 'eye', pos: [0, 1.6, CZ + 0.5], color: '#fff0c0', radius: 5.0, base: 1.15, flicker: 0, fixed: true },
    { name: 'standard-left', pos: [firePos[0][0], firePos[0][1] + 0.3, firePos[0][2]], color: '#ffa850', radius: 5.2, base: 1.0, flicker: 0.12 },
    { name: 'standard-right', pos: [firePos[1][0], firePos[1][1] + 0.3, firePos[1][2]], color: '#ffa850', radius: 5.2, base: 1.0, flicker: 0.12 },
    { name: 'windows-left', pos: [-6.6, 4.2, CZ - 3], color: '#bfe0ff', radius: 5, base: 0.28, flicker: 0, fixed: true },
    { name: 'windows-right', pos: [6.6, 4.2, CZ - 3], color: '#bfe0ff', radius: 5, base: 0.28, flicker: 0, fixed: true },
  ];
  const sprites = scene.sprites = createSprites(low ? 96 : 256);
  const glows = firePos.map((p, i) => ({ sprite: sprites.add({ kind: 'glow', pos: [p[0], p[1] + 0.25, p[2]], size: 1.7, color: '#ffa040', alpha: 0 }), base: 0.55, lamp: i + 1 }));
  const eyeGlow = sprites.add({ kind: 'glow', pos: EYE, size: 7, color: '#ffffff', alpha: 0 });

  let sky = L.sky, skyNow = L.sky, draped = 12, houseGoal = 1, houseNow = 1;
  const setSky = (v) => { sky = Math.max(0, Math.min(1, v)); }, setDraped = (n) => { draped = Math.max(0, Math.min(12, Math.round(n))); }, setHouse = (v) => { houseGoal = Math.max(0, Math.min(1, v)); };
  const rise = [0, 0, 0], arms = [0, 0];
  const blockAt = (b) => { let x = 0, y = 0, z = 0, n = 0; for (const p of people) if (p.block === b && p.s.row === 0) { x += p.s.pos[0]; y += p.s.pos[1]; z += p.s.pos[2]; n++; } if (!n) for (const p of people) if (p.block === b) { x += p.s.pos[0]; y += p.s.pos[1]; z += p.s.pos[2]; n++; } return [Math.max(-3.3, Math.min(3.3, x / n)), y / n + 1.3, z / n + 0.3]; };
  const blockTasks = [0, 1, 2].map((b) => unit8(blockAt(b), null, (v) => { rise[b] = v; }));
  const treatyGlow = sprites.add({ kind: 'glow', pos: [FOCUS[0], FOCUS[1] + 0.15, FOCUS[2] + 0.2], size: 2.4, color: '#fff2b0', alpha: 0 });
  let treaty = 0, treatyNow = 0;
  const ss = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const voteTask = unit8([FOCUS[0], FOCUS[1] + 0.2, FOCUS[2] + 0.2], null, (v) => {
    const full = lean8() === 'mint' ? 0.5 : 1, sat = ss(0.8, 0.98, v);
    setHouse(full * (0.4 + 0.6 * ss(0, 0.24, v))); arms[0] = ss(0.3, 0.5, v) * (1 - sat); arms[1] = ss(0.56, 0.75, v) * (1 - sat); treaty = sat;
  });
  const fresh = () => { rise[0] = rise[1] = rise[2] = 0; arms[0] = arms[1] = 0; treaty = 0; uproar = 0; setSky(1); skyNow = 1; setDraped(12); };
  let uproar = 0;
  const encounter = () => { fresh(); setHouse(1); };
  const setback = () => { uproar = 1.5; };
  const task = (type, i = 0) => {
    const t = String(type);
    if (t === 'seat-block' && blockTasks[i]) { if (i === 0) { fresh(); setHouse(1); houseNow = 1; for (const u of blockTasks) u.reset(); } return blockTasks[i]; }
    if (t === 'casting-vote') { fresh(); houseNow = houseGoal = (lean8() === 'mint' ? 0.5 : 1) * 0.4; return voteTask.reset(); }
    return null;
  };
  function cue(id) {
    noteLean8(id);
    if (!/^ch8\.[a-z0-9]+\.c\d+$/.test(id)) {        // a briefing or a bark, spoken in play: only the scene-7 briefing matters (it says which ending)
      if (/^ch8\.[sm]7\.b/.test(id)) voteTask.reset();
      return false;
    }
    if (/^ch8\.(s5|s7|m7)\./.test(id)) { rise[0] = rise[1] = rise[2] = 0; arms[0] = arms[1] = 0; uproar = 0; treaty = /^ch8\.(s7|m7)\./.test(id) ? 1 : 0; }
    if (id === 'ch8.s5.c21') { setSky(0); return true; }
    let m = /^ch8\.s7\.c(\d+)/.exec(id); if (m) { setSky(1); setHouse(1); setDraped(Number(m[1]) >= 13 ? 0 : 12); return true; }
    m = /^ch8\.m7\./.exec(id); if (m) { setSky(1); setHouse(0.5); setDraped(12); return true; }
    if (/^ch8\.s5\./.test(id)) { setSky(1); setHouse(1); setDraped(12); return true; }
    return false;
  }
  const cloth = dead.map(() => 1);
  function tick(time, dt, pw) {
    const e = dt === 0 ? 1 : 0;
    skyNow += (sky - skyNow) * Math.min(1, dt * 0.9 + e); houseNow += (houseGoal - houseNow) * Math.min(1, dt * 1.5 + e);
    for (let i = 0; i < 3; i++) { env.key.color[i] = GREY.key[i] + (NOON.key[i] - GREY.key[i]) * skyNow; env.shadow.tint[i] = GREY.tint[i] + (NOON.tint[i] - GREY.tint[i]) * skyNow; env.sky.zenith[i] = GREY.zenith[i] + (NOON.zenith[i] - GREY.zenith[i]) * skyNow; env.sky.mid[i] = GREY.mid[i] + (NOON.mid[i] - GREY.mid[i]) * skyNow; env.sky.horizon[i] = GREY.horizon[i] + (NOON.horizon[i] - GREY.horizon[i]) * skyNow; }
    lamps[0].k = 0.25 + 0.75 * skyNow; shaft.visible = skyNow > 0.08; shaft.tint[3] = skyNow; shaft.setScale(0.6 + 0.4 * skyNow, 1, 0.6 + 0.4 * skyNow);
    pool.tint[0] = 0.62 + 0.38 * skyNow; pool.tint[1] = 0.64 + 0.36 * skyNow; pool.tint[2] = 0.8 + 0.2 * skyNow; pool.glow = 0.15 + 0.85 * skyNow; eyeGlow.alpha = 0.5 * skyNow;
    let nd = 0;
    for (let i = 0; i < 12; i++) { const want = i < draped ? 1 : 0; cloth[i] += (want - cloth[i]) * Math.min(1, dt * 3 + e); if (cloth[i] < 0.03) continue; const s = dead[i]; putInst(drapes.instances, nd++, s.pos[0], s.pos[1], s.pos[2], 0, s.face, 0, 1, 0.15 + 0.85 * cloth[i], 1, 0.7, 0.73, 0.92); }
    drapes.instances.count = nd; drapes.visible = nd > 0;
    let np = 0;
    uproar = Math.max(0, uproar - dt);
    treatyNow += (treaty - treatyNow) * Math.min(1, dt * 2.5 + e); treatyGlow.alpha = 0.85 * treatyNow * (0.9 + 0.1 * Math.sin(time * 4));
    for (let i = 0; i < people.length; i++) {
      const p = people[i], want = Math.max(rise[p.block], arms[p.arm], uproar > 0 && ((i * 7 + Math.floor(time * 3)) % 5 === 0) ? 1 : 0);
      p.up += (want - p.up) * Math.min(1, dt * (2.2 + p.k * 2) + e);
      if (p.order > houseNow + 0.001 && houseNow < 0.999) continue;
      // on his feet he is taller, turned to the floor of the house, and out of the shade of his seat
      const s = p.s, u = p.up, nod = Math.sin(time * 0.7 + p.ph) * 4, k = p.k * (1 + 0.1 * u), b = 1 + 0.3 * u;
      putInst(house.instances, np++, s.pos[0], s.pos[1] + 0.3 + 0.36 * u, s.pos[2], nod * 0.4 * (1 - u), s.face + Math.sin(time * 0.4 + p.ph * 2) * 10 * (1 - u), 0, k, k, k, Math.min(1.3, p.col[0] * b), Math.min(1.3, p.col[1] * b), Math.min(1.3, p.col[2] * b));
    }
    house.instances.count = np;
    for (let i = 0; i < fires.length; i++) { fires[i].setScale(0.9 + 0.12 * Math.sin(time * 11 + i), 0.9 + 0.2 * Math.sin(time * 7.3 + i * 2) * Math.sin(time * 4.1), 1); fires[i].setRot(0, time * 50 + i * 90, 0); }
  }

  return shell8({
    id: 'assembly', light, L, low, scene, cameras: CAMERAS, actors, foreground, lamps, glows, tick, house: 0.7,
    motes: low ? null : { box: [-1.6, 1.6, 0.6, 7, CZ - 1.6, CZ + 1.6], every: 0.22, color: '#fff6d0', size: 0.07, vel: [0.02, -0.05, 0.02], life: 6, alpha: 0.8 },
    marks: {
      ...marks8(), focus: FOCUS, lectern: { pos: [LEC[0], 0, LEC[2] + 0.95], face: 180 }, bar: { pos: [4.2, 0, 0.8], face: -70 }, gallery: { pos: [Math.sin(34 * DEG) * (RW - 0.95), GAL_Y, CZ - Math.cos(34 * DEG) * (RW - 0.95)], face: -34 },
      draped: dead.map((s) => [s.pos[0], s.pos[1], s.pos[2]]),
      extras: [{ pos: [0.62, 0, 0.8], face: -58 }, { pos: [1.9, 0, 0.72], face: -62 }, { pos: [1.28, 0, 0.12], face: -50 }],
    },
    extra: { setSky, setDraped, setHouse, cue, task, encounter, setback },
  });
}

export const assembly = { id: 'assembly', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default assembly;
