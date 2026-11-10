// SET: ledger-room. Saltmere's records, kept in the old powder vault because it is the one dry room in town: a stone
// barrel vault at night, the moon coming down through the grille over a cabinet of deed drawers, walls and racks of
// ledgers, the lien register on its stand with a storm lamp beside it, the powder kegs nobody ever moved, and by the
// iron door (stage left) the night clerk asleep on his chair.
// Chapter 2: ch2.s5 Whose Paper. (story/BIBLE.md lets chapter 6's `counting-room` fall back to this set.)
//
//   import { ledgerRoom } from './sets/ledger-room.js';
//   const set = ledgerRoom.build(GL, { light: 'night', low: false });
//
// Same shape as sets/lantern-stalls.js. Figures face +Z, cameras look toward -Z. The strip x -4.4..4.4, z 0..1.6 is clear.
//
// What this set can do for its story:
//   setDrawer(i, 0..1)    the four lettered drawers L, I, E, N: 1 = found (it glows and stands open)
//   task('lien-drawer', i)-> { pos, stand, set(v) } for each of the four
//   setRegister(0 | 1)    the lien register on the stand: shut, or open at the page with the name on it
//   stir()                the setback: the clerk stirs, his candle flares, then he settles (2.4 s)
//   cue(lineId)           ch2.s5.c01 all shut; c04 the register is open; c08 the page glows; c18 the clerk stirs (the Line opens)
// marks: a, b, c, two, party, opposition as everywhere, plus
//   register { pos, face }: reading at the stand   lamp { pos, face }: holding the lamp beside it   drawers { pos, face }: at the cabinet
//   door { pos, face }: just inside the door   clerk: world point of the sleeper's head   page: world point of the open register   focus: the storm lamp

import { rng } from '../math.js';
import { merge, tint, place, box, quad, cylinder, torus, tube, setGlow, setOutline } from '../mesh.js';
import { node, group, makeEnv, createScene, mergeStatic } from '../scene.js';
import { createSprites } from '../sprites.js';
import { anchorAt, bookshelf, ledgerBook, candle, crate } from './kit.js';
import {
  SM, ch2Materials, shell, lightOf, stageMarks, norm3, cave, roomWall, flagFloor, shafts, floorPatch, drawerBank, lectern, sleeper, keg, handLamp, pixelText, flameBank, lampPool,
} from './kit-ch2.js';

const FRONT = 3.8, BACK = -5.2, W = 11.6, HGT = 5.5, FLAT = 0.72;
const SPINES = ['#f4573f', '#35c9b5', '#ffd24a', '#3f78e0', '#8a6be0', '#ff8fb0', '#fff1d0', '#ff9a3c'];

const LIGHTS = {
  night: {
    preset: 'night', power: 1.1,
    env: {
      key: { dir: norm3([-0.3, 0.7, 0.64]), color: '#8590e6' },
      shadow: { tint: '#3438b8', lift: 0.13, saturate: 1.35 },
      ambient: { sky: '#4a5ce0', ground: '#34329c', amount: 0.14 },
      rim: { color: '#bcd6ff', amount: 0.7, edge: 0.74 },
      fog: { color: '#2a30a8', density: 0.012, start: 12, max: 0.6 },
      sky: { zenith: '#0c1a70', mid: '#243ab0', midAt: 0.45, horizon: '#4a5ad0', below: '#2a2c90', stars: 1, moon: 0, sunDir: norm3([0, 0.5, -1]) },
      water: null,
    },
  },
};

const CAMERAS = {
  wide: { target: [0, 1.8, -0.5], dist: 8.4, yaw: 3, pitch: 4, fov: 46, aspect: 0.46, shadowCenter: [0, 0, -1.3], shadowRadius: 7 },
  two: { target: [0, 1.12, 0.6], dist: 6.0, yaw: -15, pitch: 5, fov: 31, aspect: 0.46, shadowCenter: [0, 0, 0.3], shadowRadius: 3.6 },
  close: { target: [0.02, 0.86, 0.8], dist: 3.9, yaw: 21, pitch: 3, fov: 28, aspect: 0.46, shadowCenter: [0, 0, 0.5], shadowRadius: 2.6 },
  low: { target: [0.1, 1.8, -0.4], dist: 6.0, yaw: -9, pitch: -10, fov: 56, aspect: 0.46, shadowCenter: [0, 0, -1], shadowRadius: 7 },
  stage: { target: [0, 1.15, 0.1], dist: 9.6, yaw: -11, pitch: 6, fov: 26, aspect: 1.95, shadowCenter: [0, 0, -0.8], shadowRadius: 7, outline: 0.7 },
  landscape: { target: [0, 1.8, -1.0], dist: 9.4, yaw: 4, pitch: 5, fov: 40, aspect: 1.6, shadowCenter: [0, 0, -1.3], shadowRadius: 8.5 },
};

function build(engine = null, { light: lightName = 'night', low = false } = {}) {
  const [light, L] = lightOf('ledger-room', LIGHTS, lightName);
  const M = ch2Materials(), r = rng(1511);
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  const deco = (n) => { n.castShadow = false; return n; };
  const vaultY = (x) => Math.pow(Math.max(0, Math.sqrt(Math.max(0, 1 - (x / (W / 2)) * (x / (W / 2))))), FLAT) * HGT; // the vault's height over x

  // ---- the vault: barrel, ribs, the end wall with the grille and the door, flags
  const room = group('room');
  room.add(node('vault', cave({ w: W, h: HGT, len: FRONT - BACK + 0.6, seg: 14, rings: 5, seed: 3, lump: 0, flat: FLAT, colors: ['#5c5cc8', '#7a78dc', '#6a68d0', '#8c88e6', '#7672d8', '#9a96ee'], bands: 6 }), M.wall, { pos: [0, 0, FRONT] }));
  const rib = (z) => { const pts = []; for (let i = 0; i <= 14; i++) { const a = Math.PI * (1 - i / 14); pts.push([Math.cos(a) * (W / 2 - 0.08), Math.pow(Math.max(0, Math.sin(a)), FLAT) * (HGT - 0.08), z]); } return tint(tube(pts, 0.17, 5, { crease: 40 }), '#b0acf4'); };
  for (const z of low ? [-1.2, 1.8] : [-3.4, -1.2, 1.0, 3.2]) room.add(node('rib', rib(z), M.wall));
  const GR = { x: 0, w: 1.9, sill: 3.25, top: 4.75, arch: true }, DOOR = { x: -4.55, w: 1.25, sill: 0, top: 2.3, arch: true };
  room.add(node('end', roomWall({ w: W + 1, h: HGT + 0.4, t: 0.5, color: '#8a86e2', openings: [DOOR, GR] }), M.wall, { pos: [0, 0, BACK] }));
  // a course of bigger stones along the foot of the end wall
  { const parts = []; let x = -W / 2; while (x < W / 2) { const bw = 0.7 + r() * 0.6; if (Math.abs(x + bw / 2 - DOOR.x) > DOOR.w / 2 + bw / 2) parts.push(tint(place(box(bw - 0.05, 0.5, 0.08), x + bw / 2, 0.27, 0.04), r() < 0.5 ? '#7470d4' : '#9a96ec')); x += bw; } room.add(node('course', merge(parts), M.wall, { pos: [0, 0, BACK] })); }
  room.add(node('floor', place(flagFloor({ w: 15, d: 12, nx: 9, nz: 8, colors: ['#7a76d8', '#6c68cc', '#8884e2'], seed: 4, gapColor: '#4a46b0' }), 0, 0, -0.4), M.ground));
  // the night outside the grille and the passage beyond the door
  room.add(node('sky', setGlow(tint(place(box(2.6, 2.2, 0.05), GR.x, 4.0, BACK - 0.6), '#5a7cff'), 0.95), M.flat));
  room.add(node('moon', setGlow(tint(place(cylinder(0.42, 0.42, 0.04, 14), GR.x + 0.3, 4.2, BACK - 0.55, 90, 0, 0), '#f4f8ff'), 1), M.flat));
  room.add(node('passage', setGlow(tint(place(box(1.8, 2.8, 0.05), DOOR.x, 1.4, BACK - 0.9), '#ffb868'), 0.7), M.flat));
  room.add(node('patch', floorPatch({ w: 1.9, d: 3.0, panes: 4, rows: 2, shear: 0.05, color: '#a8bcff', glow: 0.5 }), M.flat, { pos: [0.25, 0.007, -1.5] }));
  scene.root.add(mergeStatic(room, 'room'));

  // ---- props
  const props = group('props');
  // the grille: iron bars across the opening
  { const parts = []; for (let i = 0; i < 5; i++) parts.push(tint(place(cylinder(0.035, 0.035, GR.top - GR.sill, 5), GR.x - GR.w / 2 + (GR.w * (i + 0.5)) / 5, GR.sill, -0.2), SM.iron)); parts.push(tint(place(box(GR.w, 0.07, 0.07), GR.x, GR.sill + 0.75, -0.2), SM.iron)); props.add(deco(node('grille', merge(parts), M.prop, { pos: [0, 0, BACK] }))); }
  // the deed drawers, under the grille: the cabinet is static, the four lettered drawers are their own node each
  const CAB = [0, 0, BACK + 0.36];
  const cab = drawerBank({ cols: 4, rows: 4, w: 3.3, h: 2.25, letters: '', seed: 3 });
  props.add(node('cabinet', cab, M.prop, { pos: CAB }));
  props.add(deco(node('cab-top', merge(place(crate({ s: 0.4, seed: 6, color: SM.timberPale }), -1.1, 0, 0), tint(place(box(0.5, 0.3, 0.34), 0.9, 0.15, 0, 0, 12, 0), SM.wine), tint(place(box(0.52, 0.06, 0.36), 0.9, 0.33, 0, 0, 12, 0), SM.paper), tint(place(box(0.4, 0.22, 0.3), 0.92, 0.47, 0, 0, -8, 0), SM.royal)), M.prop, { pos: [CAB[0], 2.48, CAB[2]] })));
  // ledgers: two walls of them either side, two free-standing racks nearer the lens
  for (const sx of [-1, 1]) props.add(node('shelf', bookshelf({ w: 2.0, h: 3.0, rows: 5, seed: sx + 4, wood: '#a05a44', spines: SPINES }), M.prop, { pos: [sx * 2.85, 0, BACK + 0.2] }));
  props.add(node('rack-l', bookshelf({ w: 2.5, h: 2.5, rows: 4, seed: 9, wood: '#a05a44', spines: SPINES }), M.prop, { pos: [-4.55, 0, -1.9], rot: [0, 62, 0] }));
  props.add(node('rack-r', bookshelf({ w: 2.5, h: 2.7, rows: 4, seed: 12, wood: '#a05a44', spines: SPINES }), M.prop, { pos: [5.0, 0, -1.9], rot: [0, -62, 0] }));
  // the powder that was never moved, and the rule that went with it
  const kegs = merge(place(keg({ r: 0.32, h: 0.74 }), 0, 0, 0), place(keg({ r: 0.32, h: 0.74 }), 0.7, 0, 0.1), place(keg({ r: 0.3, h: 0.7 }), 0.35, 0.74, 0.05), place(keg({ r: 0.3, h: 0.7, band: SM.mustard }), -0.3, 0, 0.75, 90, 30, 0));
  props.add(node('kegs', kegs, M.prop, { pos: [4.25, 0, BACK + 0.75] }));
  props.add(deco(node('rule', merge(tint(place(box(1.7, 0.72, 0.05), 0, 0, 0), SM.salt), tint(place(box(1.8, 0.82, 0.03), 0, 0, -0.03), SM.rust), place(pixelText('NO', { s: 0.24, color: SM.rust, glow: 0.2 }), 0, 0.17, 0.03), place(pixelText('FLAME', { s: 0.24, color: SM.rust, glow: 0.2 }), 0, -0.17, 0.03)), M.prop, { pos: [3.95, 2.9, BACK + 0.05], rot: [0, 0, -4] })));
  // the iron door, ajar
  props.add(deco(node('door', merge(tint(place(box(DOOR.w, DOOR.top, 0.1), DOOR.w / 2, DOOR.top / 2, 0), SM.ironBlue), ...[0.4, 1.15, 1.9].map((y) => tint(place(box(DOOR.w + 0.04, 0.12, 0.04), DOOR.w / 2, y, 0.06), SM.iron)), tint(place(torus(0.09, 0.022, 8, 4), DOOR.w - 0.2, 1.1, 0.1), SM.brass)), M.prop, { pos: [DOOR.x - DOOR.w / 2, 0, BACK + 0.04], rot: [0, 52, 0] })));
  // the night clerk
  const CLERK = [-3.4, 0, BACK + 1.35], CLERK_YAW = 26;
  const clerk = sleeper({ coat: SM.royal });
  props.add(node('clerk', clerk, M.prop, { pos: CLERK, rot: [0, CLERK_YAW, 0] }));
  const clerkHead = anchorAt(clerk, 'head', CLERK, CLERK_YAW);
  const cnd = candle({ h: 0.14 }), CANDLE = [CLERK[0] + 0.95, 0.56, CLERK[2] + 0.2];
  props.add(node('candle-keg', keg({ r: 0.22, h: 0.56, band: SM.enamel }), M.prop, { pos: [CANDLE[0], 0, CANDLE[2]] }), deco(node('candle', cnd, M.prop, { pos: CANDLE })));
  // the register stand, a stool, the storm lamp on a crate
  const STAND = [1.0, 0, -1.75], STAND_YAW = -14;
  const stand = lectern({ h: 0.9, w: 0.95 });
  props.add(node('stand', stand, M.prop, { pos: STAND, rot: [0, STAND_YAW, 0] }));
  const CR = [1.95, 0, -2.05];
  props.add(node('lamp-crate', crate({ s: 0.62, seed: 8 }), M.prop, { pos: CR, rot: [0, 14, 0] }));
  const hand = handLamp({ s: 1.7 });
  props.add(deco(node('storm-lamp', hand, M.prop, { pos: [CR[0], 0.62, CR[2]] })));
  const lampPos = [CR[0], 0.62 + hand.anchors.lamp[1], CR[2]];
  // a pulled-out drawer and loose deeds on the floor by the cabinet, a ladder against the left shelf
  props.add(node('loose', merge(tint(place(box(0.7, 0.3, 0.5), 0, 0.15, 0, 0, 20, 0), SM.enamel), tint(place(box(0.6, 0.04, 0.4), 0, 0.3, 0, 0, 20, 0), SM.paper), ...[0, 1, 2, 3].map((i) => tint(place(box(0.3, 0.012, 0.4), 0.7 + i * 0.22, 0.008 + i * 0.004, 0.2 + (i % 2) * 0.3, 0, i * 40 - 30, 0), i % 2 ? SM.paper : '#ffe6b0'))), M.prop, { pos: [-1.3, 0, -3.5] }));
  if (!low) props.add(node('ladder', merge(tint(place(box(0.06, 3.3, 0.06), -0.25, 1.65, 0), SM.timber), tint(place(box(0.06, 3.3, 0.06), 0.25, 1.65, 0), SM.timber), ...[0, 1, 2, 3, 4, 5, 6].map((i) => tint(place(box(0.5, 0.05, 0.05), 0, 0.35 + i * 0.44, 0), SM.timberDark))), M.prop, { pos: [-2.4, 0, BACK + 1.05], rot: [-13, 0, 0] }));
  // a chain and hook from the crown of the vault: what they lowered the powder with
  props.add(deco(node('chain', merge(tint(place(cylinder(0.025, 0.025, 1.7, 5), 0, HGT - 1.75, 0), SM.iron), tint(place(torus(0.12, 0.03, 8, 4), 0, HGT - 1.86, 0, 90, 0, 0), SM.iron)), M.prop, { pos: [-1.6, 0, -0.9] })));
  scene.root.add(mergeStatic(props, 'props'));

  if (!low) scene.root.add(node('shafts', place(shafts({ w: GR.w * 0.85, h: (GR.top - GR.sill) * 0.75, dir: [0.05, -1, 0.92], len: 5.6, cards: 3, color: '#9fb8ff' }), GR.x, (GR.sill + GR.top) / 2, BACK + 0.05), M.shaft));

  // the storm lamp's pool on the flags (drawn: see kit-ch2 lampPool), and a smaller one round the clerk's candle
  const pool = node('pool', merge(lampPool({ r: 2.5, color: '#b48ad8', hot: '#f0b08c', glow: 0.45, seed: 3 }), place(lampPool({ r: 1.1, color: '#b084d4', hot: '#e8a888', glow: 0.4, seed: 5, n: 9 }), CANDLE[0] + 0.1 - (CR[0] - 0.75), 0, CANDLE[2] + 0.5 - (CR[2] + 1.0))), M.flat, { pos: [CR[0] - 0.75, 0.008, CR[2] + 1.0] }); pool.castShadow = false;
  scene.root.add(pool);

  // ---- the four drawers: L I E N
  const sprites = scene.sprites = createSprites(low ? 96 : 256);
  const dw = (3.3 - 0.14) / 4, dh = (2.25 - 0.14) / 4, DY = 0.17 + dh * 2.5;
  // a 3x5 block N reads as a D on its own (it has no room for the diagonal), and this one letter must not: two posts and a real diagonal
  const bigN = (s) => { const px = s / 5, w = px * 3, len = Math.hypot(w - px, s) * 0.96; return setOutline(setGlow(tint(merge(place(quad(px, s), -w / 2 + px / 2, 0, 0), place(quad(px, s), w / 2 - px / 2, 0, 0), place(quad(px, len), 0, 0, 0, 0, 0, Math.atan2(w - px, s) * 180 / Math.PI)), SM.wine), 0.15), 0); };
  const drawers = [0, 1, 2, 3].map((i) => {
    const x = CAB[0] - 3.3 / 2 + 0.07 + dw * (i + 0.5), z = CAB[2] + 0.3;
    const mesh = merge(tint(place(box(dw - 0.07, dh - 0.07, 0.5), 0, 0, -0.2), '#ffd9a0'), tint(place(torus(0.05, 0.014, 6, 4), 0, -dh * 0.26, 0.09), SM.brass), place(i === 3 ? bigN(dh * 0.44) : pixelText('LIEN'[i], { s: dh * 0.44, color: SM.wine, glow: 0.15 }), 0, dh * 0.07, 0.056));
    const n = node('drawer' + i, mesh, M.prop, { pos: [x, DY, z] }); n.castShadow = false; scene.root.add(n);
    return { n, x, z, v: 0, now: 0, glow: sprites.add({ kind: 'glow', pos: [x, DY, z + 0.3], size: 1.0, color: '#ffd880', alpha: 0 }) };
  });

  // ---- the register: shut, or open
  const top = anchorAt(stand, 'top', STAND, STAND_YAW), tilt = stand.anchors.tilt;
  const shut = node('register-shut', merge(tint(place(box(0.56, 0.12, 0.72), 0, 0.06, 0), SM.wine), tint(place(box(0.5, 0.1, 0.68), 0.04, 0.06, 0), SM.paper), tint(place(box(0.58, 0.03, 0.12), 0, 0.125, 0.18), SM.brass)), M.prop, { pos: top, rot: [tilt, STAND_YAW, 0] }); shut.castShadow = false;
  const open = node('register-open', setGlow(ledgerBook({ w: 0.92, d: 0.64, thick: 0.07, cover: SM.wine, ribbon: SM.mustard }), 0.14), M.prop, { pos: top, rot: [tilt, STAND_YAW, 0], visible: false }); open.castShadow = false;
  scene.root.add(shut, open);
  const pageGlow = sprites.add({ kind: 'glow', pos: [top[0], top[1] + 0.12, top[2] + 0.05], size: 1.3, color: '#ff6a58', alpha: 0 });

  const fire = flameBank({ spots: [{ pos: [CANDLE[0], CANDLE[1] + cnd.anchors.flame[1], CANDLE[2]], s: 0.3 }], material: M.speck });
  scene.root.add(fire.node);

  const actors = group('actors'); scene.root.add(actors);
  const foreground = mergeStatic(group('fg', {}, node('fg-keg', keg({ r: 0.28, h: 0.66 }), M.prop, { pos: [-2.5, 0, 3.0] }), node('fg-books', merge(...[0, 1, 2, 3].map((i) => tint(place(box(0.5, 0.11, 0.36), 0, 0.055 + i * 0.11, 0, 0, i * 17 - 20, 0), SPINES[(i * 3) % SPINES.length]))), M.prop, { pos: [2.4, 0, 3.0] })), 'foreground');
  scene.root.add(foreground);

  // ---- lamps
  const candleAt = fire.spots[0].pos;
  const lamps = [
    { name: 'storm', pos: [lampPos[0] - 0.7, lampPos[1] + 1.7, lampPos[2] + 1.3], color: '#ffc468', radius: 10, base: 2.3 }, // held well above the lamp itself: a light at crate height only warms the crate
    { name: 'moon', pos: [0.2, 2.2, BACK + 2.2], color: '#8fa8ff', radius: 5.6, base: 1.3, flicker: 0, fixed: true },
    { name: 'candle', pos: [candleAt[0] + 0.2, candleAt[1] + 0.9, candleAt[2] + 0.7], color: '#ffb860', radius: 4.8, base: 1.3, flicker: 0, fire: 0, fixed: true },
    { name: 'door', pos: [DOOR.x + 0.5, 2.0, BACK + 1.2], color: '#ff9a50', radius: 5.2, base: 1.1, flicker: 0, fixed: true },
    { name: 'drawers', pos: [CAB[0], DY, CAB[2] + 0.9], color: '#ffd070', radius: 3.6, base: 0, flicker: 0, fixed: true },
  ];
  const glows = [
    { sprite: sprites.add({ kind: 'glow', pos: lampPos, size: 2.3, color: '#ffb850', alpha: 0 }), base: 0.62 },
    { sprite: sprites.add({ kind: 'glow', pos: candleAt, size: 0.9, color: '#ffb450', alpha: 0 }), base: 0.6, fixed: true, flick: 1 },
    { sprite: sprites.add({ kind: 'glow', pos: [GR.x + 0.3, 4.2, BACK - 0.3], size: 3.4, color: '#a8c0ff', alpha: 0 }), base: 0.5, fixed: true },
  ];

  let reg = 0, pageHot = 0, stirT = -1, nextZ = 1;
  const rnd = rng(71), P = [0, 0, 0], V = [0.12, 0.3, 0];
  function setDrawer(i, v) { const d = drawers[i]; if (!d) throw new Error(`ledger-room: no drawer ${i} (there are four: L, I, E, N)`); d.v = Math.max(0, Math.min(1, v)); }
  function setRegister(v) { reg = v >= 1 ? 1 : 0; shut.visible = !reg; open.visible = !!reg; }
  function stir() { stirT = 0; }
  function cue(id) {
    switch (id) {
      case 'ch2.s5.c01': setRegister(0); pageHot = 0; return true;
      case 'ch2.s5.c04': setRegister(1); return true;
      case 'ch2.s5.c08': setRegister(1); pageHot = 1; return true;
      case 'ch2.s5.c12': pageHot = 0.4; return true;
      case 'ch2.s5.c18': stir(); return true;
      default: return false;
    }
  }
  const TASKS = drawers.map((d, i) => ({ pos: [d.x, DY, d.z + 0.2], stand: [d.x * 0.8 + 0.2, CAB[2] + 1.3], set(v) { setDrawer(i, v); } }));
  // an encounter may list at most three things: with two 'lien-drawer' units each answers for a pair (L I, then E N)
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const PAIRS = [0, 1].map((k) => ({ pos: [(drawers[2 * k].x + drawers[2 * k + 1].x) / 2, DY, drawers[2 * k].z + 0.2], stand: TASKS[2 * k + (k ? 1 : 0)].stand, set(v) { setDrawer(2 * k, clamp01(v * 2)); setDrawer(2 * k + 1, clamp01(v * 2 - 1)); } }));
  const task = (type, i = 0, count = 4) => (type !== 'lien-drawer' ? null : count === 2 ? PAIRS[i] || null : TASKS[i] || null);
  function tick(time, dt, pw, live) {
    let lit = 0;
    for (let i = 0; i < 4; i++) { const d = drawers[i]; d.now += (d.v - d.now) * Math.min(1, dt * 6 + (dt === 0 ? 1 : 0)); d.n.position[2] = d.z + 0.26 * d.now; d.glow.alpha = 0.75 * d.now * (0.85 + 0.15 * Math.sin(time * 3 + i)); d.n.flash[0] = 1; d.n.flash[1] = 0.85; d.n.flash[2] = 0.5; d.n.flash[3] = 0.1 * d.now; lit += d.now; }
    env.points[4].intensity = 0.5 * lit;
    { const k = 0.7 + 0.3 * Math.min(1.3, pw / L.power); pool.setScale(k, 1, k); } // both pools are one mesh about the storm lamp's: it shrinks as the table runs down
    pageGlow.alpha = reg ? pageHot * (0.45 + 0.2 * Math.sin(time * 4.4)) : 0;
    let flare = 0;
    if (stirT >= 0) { stirT += dt; flare = Math.sin(Math.min(1, stirT / 2.4) * Math.PI); if (stirT > 2.4) stirT = -1; }
    fire.spots[0].level = 1 + flare * 1.6; env.points[2].intensity *= 1 + flare * 1.5;
    if (!live) return;
    if (time > nextZ) { nextZ = time + (flare > 0.1 ? 0.3 : 1.5); P[0] = clerkHead[0]; P[1] = clerkHead[1] + 0.1; P[2] = clerkHead[2] + 0.1; sprites.spawn({ kind: 'ring', pos: P, vel: V, size: 0.12, endSize: 0.34, life: 1.6, color: '#dfe8ff', alpha: 0.9 }); }
  }

  return shell({
    id: 'ledger-room', light, L, scene, cameras: CAMERAS, actors, foreground, lamps, glows, fire, tick,
    motes: low ? null : { box: [-0.9, 1.4, 0.6, 4.2, BACK + 0.5, -0.4], every: 0.4, color: '#cfdcff', size: 0.055, vel: [0.02, -0.03, 0.04], life: 6, alpha: 0.75 },
    marks: {
      ...stageMarks(), focus: lampPos, page: top, clerk: clerkHead,
      register: { pos: [STAND[0] - 0.2, 0, STAND[2] + 0.75], face: 165 }, lamp: { pos: [STAND[0] + 0.75, 0, STAND[2] + 0.9], face: -150 },
      drawers: { pos: [0.2, 0, CAB[2] + 1.3], face: 180 }, door: { pos: [DOOR.x + 0.6, 0, BACK + 1.3], face: 20 },
    },
    extra: { setDrawer, setRegister, stir, passLamp: stir, cue, task, vaultY },   // passLamp: the name the director calls on a drain
  });
}

export const ledgerRoom = { id: 'ledger-room', lights: Object.keys(LIGHTS), cameras: Object.keys(CAMERAS), build };
export default ledgerRoom;
