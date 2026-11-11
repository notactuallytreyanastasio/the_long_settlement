// Lanewar in 3D: a felt board on a table, a tin hero with weapons circling it, and up to ninety tin soldiers.
//
//   const view = createFrayView(GL);
//   view.update(run, dt, time);          read the run (core/fray.js) as it stands and act out its log
//   view.frame(aspect, time, grow, shift);
//   renderer.render(view.scene, view.camera, time, { x, y, w, h, ...view.view });
//
// DRAW CALLS. The crowd is the whole problem, so the crowd is instanced: one mesh per kind of figure, drawn
// once however many stand on the board (five kinds: five colour draws, five outline draws, five in the shadow
// map). A figure is its instance matrix and a tint; nothing per figure is a scene node. The weapons about the
// hero are the same, one instanced mesh per kind of weapon. The obvious version, a jointed chibi from
// characters.js per soldier, is three draws and ten thousand triangles each, and ninety of them is more than
// the rest of the game put together.
//
// Everything that flies (shot, musket balls, shells, tin, fire, the marks where figures will come on) is a
// sprite from one pool: one more draw for all of it.
//
// TIME. The core steps at 60 a second and so, usually, does the glass: positions are read straight from the
// run. What the run cannot show is what has just ended (a figure felled is simply gone from it), and that is
// what Run.fx is for: this file keeps a cursor on it and plays each entry once.

import { AW, AH, BOARD_MAX, FOES, WEAPON_IDS, SLOTS } from '../../core/fray.js';
import { FRAY_COLOURS as COL } from '../fray-view.js';

const DIE = 0.45;         // seconds a felled figure takes to leave the board
const KINDS = ['foot', 'lancer', 'grenadier', 'musket', 'captain'];
const SIZE = { foot: 1, lancer: 1, grenadier: 1.4, musket: 1, captain: 1.9 };
const CAP = BOARD_MAX + 40;   // instances per kind: everyone standing, and those still falling
const SHOTS = 96, BOLTS = 40, DROPS = 180, MARKS = 60, FIRES = 12, SHELLS = 12, AIMS = 40;

const wx = (x) => x - AW / 2;
const wz = (y) => y - AH / 2;

export function createFrayView(GL) {
  const { m4, quat, DEG } = GL;

  // ───────────────────────── the tin ─────────────────────────
  /** Move a mesh so it stands on height y. */
  const sit = (mesh, y) => { const b = GL.bounds(mesh); return GL.translate(mesh, 0, y - b.min[1], 0); };
  const part = (mesh, colour, y, x = 0, z = 0) => GL.translate(sit(GL.tint(mesh, colour), y), x, 0, z);

  /** A tin figure, about one unit tall on a round base, facing +Z. */
  function tin({ coat, hat, hatH = 0.2, hatR = 0.17, trim = '#f2d24a', plume = null, arm = null }) {
    const parts = [
      part(GL.cylinder(0.33, 0.31, 0.07, 12), '#b9b3a0', 0),
      part(GL.cylinder(0.24, 0.16, 0.4, 10), coat, 0.07),
      part(GL.cylinder(0.25, 0.25, 0.05, 10), trim, 0.2),
      part(GL.sphere(0.2, 12, 8), '#f6cfa6', 0.42),
      part(GL.cylinder(hatR, hatR * 0.92, hatH, 10), hat, 0.75),
      part(GL.sphere(0.035, 6, 4), '#1d2146', 0.59, -0.08, 0.18),
      part(GL.sphere(0.035, 6, 4), '#1d2146', 0.59, 0.08, 0.18),
    ];
    if (plume) parts.push(part(GL.ellipsoid(0.06, 0.13, 0.06, 8, 6), plume, 0.75 + hatH - 0.02));
    if (arm) parts.push(arm);
    return GL.merge(parts);
  }
  /** A long thin thing held at the right hand: upright (pitch 0) or levelled forward (pitch 90). */
  const stick = (len, colour, pitch, r = 0.028) => GL.place(GL.tint(GL.cylinder(r, r * 0.6, len, 6), colour), 0.28, 0.2 + (pitch > 45 ? 0.22 : 0), pitch > 45 ? -0.15 : 0, pitch, 0, 0);

  const MESH = {
    foot: tin({ coat: COL.foot, hat: '#23233a', arm: stick(0.75, '#d9dde6', 0) }),
    lancer: tin({ coat: COL.lancer, hat: '#f2d24a', hatH: 0.14, plume: '#ffffff', arm: stick(1.25, '#e9d8a8', 62) }),
    grenadier: tin({ coat: COL.grenadier, hat: '#2a1c14', hatH: 0.36, hatR: 0.2, trim: '#e8e2d0', arm: stick(0.7, '#d9dde6', 0, 0.04) }),
    musket: tin({ coat: COL.musket, hat: '#3a2a5c', hatH: 0.1, hatR: 0.27, trim: '#d8433a', arm: stick(0.95, '#5a3a22', 90, 0.035) }),
    captain: tin({ coat: COL.captain, hat: '#f2d24a', hatH: 0.24, plume: '#ff5a4a', arm: stick(0.8, '#ffffff', 28, 0.04) }),
  };
  const tinMat = GL.material({ bands: 2, spec: 0.55, specSize: 0.035, rim: 0.8, outline: { width: 2.2, color: '#1d2146', self: 0.4 } });

  // the weapons that hang about the hero: each lies along +Z, about 0.6 long, so its yaw is its aim
  const along = (mesh, colour, z = 0) => GL.translate(GL.tint(GL.rotate(mesh, 90, 0, 0), colour), 0, 0, z);
  const WMESH = {
    sabre: GL.merge([along(GL.box(0.07, 0.62, 0.03), COL.sabre, 0.34), along(GL.box(0.2, 0.05, 0.06), '#f2c84a', 0.02)]),
    pike: GL.merge([along(GL.cylinder(0.03, 0.03, 0.95, 6), '#b0703a', 0), along(GL.cone(0.07, 0.2, 6), COL.pike, 0.5)]),
    flail: GL.merge([along(GL.cylinder(0.03, 0.03, 0.35, 6), '#b0703a', 0), GL.translate(GL.tint(GL.sphere(0.13, 8, 6), COL.flail), 0, 0, 0.48)]),
    pistol: GL.merge([along(GL.cylinder(0.045, 0.045, 0.42, 8), '#3a3a4a', 0.12), GL.translate(GL.tint(GL.box(0.07, 0.2, 0.09), COL.pistol), 0, -0.1, -0.06)]),
    scatter: GL.merge([along(GL.cylinder(0.05, 0.085, 0.5, 8), '#3a3a4a', 0.14), GL.translate(GL.tint(GL.box(0.08, 0.2, 0.1), COL.scatter), 0, -0.1, -0.08)]),
    mortar: GL.merge([GL.translate(GL.tint(GL.rotate(GL.cylinder(0.12, 0.14, 0.3, 10), 50, 0, 0), '#3a3a4a'), 0, 0.05, 0.1), GL.translate(GL.tint(GL.box(0.3, 0.06, 0.3), COL.mortar), 0, -0.1, 0)]),
    flask: GL.merge([GL.tint(GL.sphere(0.14, 10, 8), COL.flask), GL.translate(GL.tint(GL.cylinder(0.05, 0.05, 0.12, 6), '#e9e2d0'), 0, 0.14, 0)]),
  };
  const wMat = GL.material({ bands: 2, spec: 0.7, specSize: 0.04, rim: 1, outline: { width: 1.8, color: '#1d2146', self: 0.3 } });

  const env = GL.makeEnv('day', {
    key: { dir: [-0.42, 0.8, 0.42], color: '#fff3d6' },
    sky: { zenith: '#131c44', mid: '#1d2a5c', horizon: '#2a3a7c', below: '#131c44', glowAmount: 0, stars: 0, moon: 0, sun: { size: 0, haloAmount: 0 } },
    fog: { density: 0 }, water: null,
    ambient: { sky: '#cfd8ff', ground: '#ffd9a0', amount: 0.3 },
    shadow: { tint: '#6d78c8', lift: 0.1 },
  });
  const scene = GL.createScene(env);
  const sprites = scene.sprites = GL.createSprites(900);

  // ───────────────────────── the board ─────────────────────────
  {
    const felt = [];
    for (let y = 0; y < AH; y++) for (let x = 0; x < AW; x++) {
      felt.push(GL.translate(GL.tint(GL.plane(1, 1), (x + y) % 2 ? COL.feltA : COL.feltB), wx(x + 0.5), 0.002, wz(y + 0.5)));
    }
    scene.root.add(GL.node('felt', GL.merge(felt), GL.material({ rim: 0, outline: false, castShadow: false })));
    const wood = GL.material({ rim: 0, spec: 0.2, specSize: 0.05, outline: { width: 2.4, color: '#1d2146', self: 0.5 } });
    const hw = AW / 2, hh = AH / 2, t = 0.4;
    scene.root.add(GL.node('frame', GL.merge([
      GL.place(GL.tint(GL.roundedBox(AW + t * 2, 0.34, t, 0.06), '#8a5326'), 0, 0, -hh - t / 2),
      GL.place(GL.tint(GL.roundedBox(AW + t * 2, 0.34, t, 0.06), '#8a5326'), 0, 0, hh + t / 2),
      GL.place(GL.tint(GL.roundedBox(t, 0.34, AH, 0.06), '#9a6030'), -hw - t / 2, 0, 0),
      GL.place(GL.tint(GL.roundedBox(t, 0.34, AH, 0.06), '#9a6030'), hw + t / 2, 0, 0),
      // brass corners, because somebody's grandfather made this board
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => GL.place(GL.tint(GL.cylinder(0.28, 0.28, 0.4, 10), '#f2c84a'), sx * (hw + t / 2), -0.17, sz * (hh + t / 2))),
      // the table it stands on, in planks, far past anything the camera sees
      ...Array.from({ length: 16 }, (_, i) => GL.place(GL.tint(GL.box(5.96, 0.4, 90), i % 2 ? '#5a3a22' : '#523420'), (i - 7.5) * 6, -0.36, 0)),
    ]), wood));
  }

  // ───────────────────────── the crowd, the weapons, the hero ─────────────────────────
  const crowd = {};
  for (const kind of KINDS) {
    const n = GL.node(`tin-${kind}`, MESH[kind], tinMat);
    n.instances = GL.makeInstances(CAP); n.cull = false; n.visible = false;
    scene.root.add(n); crowd[kind] = n;
  }
  const hands = {};
  for (const id of WEAPON_IDS) {
    const n = GL.node(`hand-${id}`, WMESH[id], wMat);
    n.instances = GL.makeInstances(SLOTS); n.cull = false; n.visible = false;
    scene.root.add(n); hands[id] = n;
  }
  const heroBody = GL.node('hero', tin({ coat: COL.hero, hat: '#1d2a5c', hatH: 0.22, trim: '#f2d24a', plume: '#ffffff' }), GL.material({ bands: 2, spec: 0.6, specSize: 0.04, rim: 1, outline: { width: 2.8, color: '#1d2146', self: 0.3 } }));
  heroBody.setScale(1.35);
  scene.root.add(heroBody);
  // melee, drawn: a crescent in the plane of the board (the sabre), a long bright bar (the pike)
  const bright = GL.material({ emissive: 1, rim: 0, outline: false, castShadow: false, receiveShadow: false, doubleSided: true });
  const crescentMesh = (() => {
    const P = [], I = [], N = 14;
    for (let i = 0; i <= N; i++) {
      const a = (-62 + 124 * i / N) * DEG, wdt = 0.34 * Math.cos((i / N - 0.5) * Math.PI);
      P.push(Math.sin(a), 0, Math.cos(a), Math.sin(a) * (1 - wdt), 0, Math.cos(a) * (1 - wdt));
      if (i < N) { const k = i * 2; I.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    return GL.tint(GL.fromArrays(P, I), '#ffffff');
  })();
  const barMesh = GL.place(GL.tint(GL.box(0.12, 0.06, 1), COL.pike), 0, 0, 0.5);
  const swings = [];
  for (let i = 0; i < 4; i++) {
    const c = GL.node(`slash-${i}`, crescentMesh, bright), b = GL.node(`thrust-${i}`, barMesh, bright);
    c.visible = b.visible = false; c.castShadow = b.castShadow = false;
    scene.root.add(c, b);
    swings.push({ c, b, t: 0, kind: '', r: 1, yaw: 0 });
  }
  // The hero must be the first thing the eye finds in ninety figures: a ring on the felt, a pool of light, and a
  // gold marker riding above the hats.
  const heroRing = sprites.add({ kind: 'ring', pos: [0, 0.03, 0], size: 2, color: '#fff2a8', alpha: 0.7 });
  const heroPool = sprites.add({ kind: 'glow', pos: [0, 0.3, 0], size: 3, color: '#9ff5e6', alpha: 0.4 });
  const heroMark = sprites.add({ kind: 'dot', pos: [0, 2.1, 0], size: 0.28, color: '#ffd24a', alpha: 1 });

  const pool = (n, o) => { const out = []; for (let i = 0; i < n; i++) { const s = sprites.add(o); s.visible = false; out.push(s); } return out; };
  const shotS = pool(SHOTS, { kind: 'glow', pos: [0, 0.6, 0], size: 0.42, color: '#fff6c0', alpha: 1 });
  const boltS = pool(BOLTS, { kind: 'glow', pos: [0, 0.6, 0], size: 0.7, color: '#ff4a3a', alpha: 1 });
  const boltCore = pool(BOLTS, { kind: 'dot', pos: [0, 0.6, 0], size: 0.2, color: '#ffffff', alpha: 1 });
  const dropS = pool(DROPS, { kind: 'dot', pos: [0, 0.2, 0], size: 0.17, color: COL.tin, alpha: 1 });
  const markS = pool(MARKS, { kind: 'ring', pos: [0, 0.04, 0], size: 1, color: '#ff4a3a', alpha: 0.9 });
  const fireS = pool(FIRES * 3, { kind: 'glow', pos: [0, 0.25, 0], size: 1, color: COL.flask, alpha: 0.5 });
  const shellRing = pool(SHELLS, { kind: 'ring', pos: [0, 0.05, 0], size: 1, color: '#ff7a4a', alpha: 0.9 });
  const shellBall = pool(SHELLS, { kind: 'glow', pos: [0, 1, 0], size: 0.6, color: '#fff2c0', alpha: 1 });
  const aimS = pool(AIMS, { kind: 'dot', pos: [0, 0.5, 0], size: 0.12, color: '#ff5a4a', alpha: 0.95 });

  // ───────────────────────── state ─────────────────────────
  const yaws = new Map();         // figure id -> { yaw, born }
  const dying = [], spare = [];
  let seenRun = null, cursor = 0, quake = 0, heroHurt = 0, heroYaw = 180;
  const kick = new Float32Array(SLOTS);
  const heroPos = [0, 0.55, 0];

  const FOV = 30;
  const camera = GL.createCamera({ fov: FOV, near: 0.5, far: 160 });
  const BOX = { min: [-AW / 2 - 0.45, 0, -AH / 2 - 0.45], max: [AW / 2 + 0.45, 0.6, AH / 2 + 0.45] };
  const FRAME = { yaw: 0, pitch: 64, aspect: 1, margin: 1, shiftY: 0 };
  const view = { shadowCenter: [0, 0, 0], shadowRadius: 12.5 };

  const P3 = [0, 0, 0];
  const at = (x, y, h) => { P3[0] = wx(x); P3[1] = h; P3[2] = wz(y); return P3; };
  /** A direction on the board (dx, dy with y down the board) as a yaw in degrees for something that faces +Z. */
  const yawOf = (dx, dy) => Math.atan2(dx, dy) / DEG;

  function play(run, e) {
    const hx = run.hero.x, hy = run.hero.y;
    if (e.type === 'kill') {
      const y = yaws.get(e.id);
      let dx = e.x - hx, dz = e.y - hy; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
      const a = spare.pop() || {};
      a.kind = e.kind; a.x = wx(e.x); a.z = wz(e.y); a.vx = dx * 4.5 + (Math.random() - 0.5) * 2; a.vz = dz * 4.5 + (Math.random() - 0.5) * 2;
      a.t = 0; a.yaw = y ? y.yaw : 0; a.spin = (Math.random() < 0.5 ? -1 : 1) * (500 + Math.random() * 500); a.up = 3.4 + Math.random();
      dying.push(a);
      yaws.delete(e.id);
      const big = e.kind === 'captain';
      sprites.sparkle(at(e.x, e.y, 0.5), { count: big ? 18 : 2, color: COL[e.kind], size: big ? 0.6 : 0.28, spread: big ? 1.8 : 0.5, life: 0.45 });
      if (big) quake = 1;
    } else if (e.type === 'swing') {
      kick[e.slot] = 1;
      if (e.weapon === 'flail') { sprites.spawn({ kind: 'ring', pos: at(hx, hy, 0.35), size: 0.6, endSize: e.r * 2 + 0.4, life: 0.2, color: COL.flail }); return; }
      const s = swings.find((x) => x.t <= 0) || swings[0];
      s.t = 1; s.kind = e.weapon; s.r = e.r; s.yaw = yawOf(Math.cos(e.a), Math.sin(e.a));
    } else if (e.type === 'shot') {
      kick[e.slot] = 1;
      if (e.weapon === 'scatter') sprites.puff(at(hx, hy, 0.7), { count: 2, size: 0.3, rise: 0.4, spread: 0.4, life: 0.35 });
    } else if (e.type === 'blast') {
      sprites.spawn({ kind: 'ring', pos: at(e.x, e.y, 0.1), size: 0.5, endSize: e.r * 2.3, life: 0.3, color: COL.mortar });
      sprites.spawn({ kind: 'glow', pos: at(e.x, e.y, 0.5), size: e.r * 2.6, endSize: 0.4, life: 0.25, color: '#fff2c0', alpha: 0.9 });
      sprites.puff(at(e.x, e.y, 0.4), { count: 3, size: 0.45, rise: 1, spread: e.r, life: 0.45 });
      sprites.sparkle(at(e.x, e.y, 0.6), { count: 8, color: COL.mortar, size: 0.35, spread: e.r * 1.4, life: 0.5 });
      quake = Math.max(quake, 0.7);
    } else if (e.type === 'flame') sprites.puff(at(e.x, e.y, 0.3), { count: 3, size: 0.4, color: '#ffb060', rise: 0.8, spread: e.r, life: 0.5 });
    else if (e.type === 'hurt') { heroHurt = 1; quake = Math.max(quake, 0.8); }
    else if (e.type === 'dodge') sprites.sparkle(at(hx, hy, 1), { count: 4, color: '#ffffff', size: 0.3, spread: 0.6, life: 0.3 });
    else if (e.type === 'tin') sprites.sparkle(at(hx, hy, 1.1), { count: 1, color: COL.tin, size: 0.3, spread: 0.3, life: 0.3 });
    else if (e.type === 'level') { sprites.spawn({ kind: 'ring', pos: at(hx, hy, 0.2), size: 0.8, endSize: 5, life: 0.5, color: '#9ff5e6' }); sprites.sparkle(at(hx, hy, 1.2), { count: 10, color: '#9ff5e6', size: 0.45, spread: 1.2, life: 0.7 }); }
    else if (e.type === 'cleared') for (let i = 0; i < 30; i++) sprites.sparkle(at(Math.random() * AW, Math.random() * AH, 0.6 + Math.random()), { count: 1, color: i % 2 ? '#ffd24a' : '#ffffff', size: 0.6, spread: 0.4, life: 0.9 });
    else if (e.type === 'fallen') { quake = 1; sprites.puff(at(hx, hy, 0.4), { count: 6, size: 0.7, rise: 0.8, spread: 0.6, life: 1 }); }
  }

  const M = m4.create(), Q = quat.create(), S = [1, 1, 1], T = [0, 0, 0];
  function put(inst, i, x, y, z, yawDeg, pitchDeg, rollDeg, s, r, g, b) {
    T[0] = x; T[1] = y; T[2] = z; S[0] = S[1] = S[2] = s;
    quat.fromEuler(Q, pitchDeg * DEG, yawDeg * DEG, rollDeg * DEG);
    m4.fromTRS(M, T, Q, S);
    const d = inst.data, k = i * 20;
    d.set(M, k); d[k + 16] = r; d[k + 17] = g; d[k + 18] = b; d[k + 19] = 1;
  }
  const hide = (list, from) => { for (let i = from; i < list.length; i++) list[i].visible = false; };

  function update(run, dt, time) {
    // a different run under the same view (a new visit, a test standing the board somewhere): start clean
    if (!seenRun || run.fxN < cursor || (seenRun !== run && run.n < seenRun.n)) { cursor = Math.max(0, run.fxN - run.fx.length); yaws.clear(); dying.length = 0; }
    for (const e of run.fx) if (e.n >= cursor) play(run, e);
    cursor = run.fxN; seenRun = run;

    const fallen = run.phase === 'over', hero = run.hero;
    const hx = wx(hero.x), hz = wz(hero.y);
    // ── the hero ──
    const want = yawOf(Math.cos(hero.face), Math.sin(hero.face));
    let dy = want - heroYaw; dy -= Math.round(dy / 360) * 360; heroYaw += dy * Math.min(1, dt * 16);
    heroHurt = Math.max(0, heroHurt - dt * 3);
    const blink = hero.inv > 0 && !fallen && Math.floor(time * 18) % 2 === 0;
    heroBody.setPos(hx, 0, hz); heroBody.setRot(fallen ? -84 : 0, heroYaw, 0);
    heroBody.visible = !blink || heroHurt > 0.6;
    heroBody.flash[0] = 1; heroBody.flash[1] = 0.25; heroBody.flash[2] = 0.2; heroBody.flash[3] = heroHurt * 0.8;
    heroPos[0] = hx; heroPos[2] = hz;
    heroRing.pos[0] = heroPool.pos[0] = heroMark.pos[0] = hx; heroRing.pos[2] = heroPool.pos[2] = heroMark.pos[2] = hz;
    heroRing.alpha = 0.6 + 0.2 * Math.sin(time * 4); heroMark.pos[1] = 2.1 + 0.12 * Math.sin(time * 5);
    heroRing.visible = heroPool.visible = heroMark.visible = !fallen;

    // ── the weapons about the hero ──
    for (const id of WEAPON_IDS) hands[id].instances.count = 0;
    if (!fallen) {
      const n = run.weapons.length;
      for (let i = 0; i < n; i++) {
        const w = run.weapons[i], inst = hands[w.id].instances;
        kick[i] = Math.max(0, kick[i] - dt / 0.16);
        const a = (i / n) * Math.PI * 2 + time * 0.7, k = Math.sin(kick[i] * Math.PI) * 0.45;
        const ax = Math.cos(w.aim), az = Math.sin(w.aim);
        put(inst, inst.count++, hx + Math.cos(a) * 0.78 + ax * k, 0.72 + 0.06 * Math.sin(time * 3 + i), hz + Math.sin(a) * 0.78 + az * k, yawOf(ax, az), 0, 0, 1.25, 1, 1, 1);
      }
    }
    for (const id of WEAPON_IDS) { const h = hands[id]; h.instances.dirty = true; h.visible = h.instances.count > 0; }
    for (const s of swings) {
      if (s.t <= 0) { s.c.visible = s.b.visible = false; continue; }
      s.t -= dt / 0.15;
      const sabre = s.kind !== 'pike', nd = sabre ? s.c : s.b, o = sabre ? s.b : s.c;
      o.visible = false; nd.visible = s.t > 0;
      nd.setPos(hx, 0.5, hz);
      if (sabre) { nd.setRot(0, s.yaw + (0.5 - s.t) * 50, 0); nd.setScale(s.r * (1.05 - s.t * 0.2)); }
      else { nd.setRot(0, s.yaw, 0); nd.setScale(1, 1, s.r * Math.min(1, (1 - s.t) * 2.2 + 0.2)); }
    }

    // ── the crowd ──
    for (const kind of KINDS) crowd[kind].instances.count = 0;
    let ai = 0;
    for (const f of run.foes) {
      let y = yaws.get(f.id);
      const fx = hero.x - f.x, fy = hero.y - f.y;
      const charging = f.state === 'wind' || f.state === 'charge', aiming = f.state === 'aim';
      const wantYaw = charging || aiming ? yawOf(f.cx, f.cy) : yawOf(fx, fy);
      if (!y) { y = { yaw: wantYaw, born: 0 }; yaws.set(f.id, y); }
      let d = wantYaw - y.yaw; d -= Math.round(d / 360) * 360; y.yaw += d * Math.min(1, dt * 12);
      y.born = Math.min(1, y.born + dt / 0.25);
      const inst = crowd[f.kind].instances;
      if (inst.count >= CAP) continue;
      const walk = f.state === 'walk' ? Math.abs(Math.sin(time * 9 + f.id)) * 0.07 : 0;
      const warn = charging || aiming ? 0.5 + 0.5 * Math.sin(time * 22) : 0;
      const h = f.flash > 0 ? 1 : 0;
      put(inst, inst.count++, wx(f.x), walk + (1 - y.born) * (1 - y.born) * 1.2, wz(f.y), y.yaw, f.state === 'wind' ? -14 : 0, Math.sin(time * 9 + f.id) * (f.state === 'walk' ? 4 : 0),
        SIZE[f.kind] * (0.5 + 0.5 * y.born), 1, 1 - h * 0.75 - warn * 0.35, 1 - h * 0.75 - warn * 0.35);
      // a lowered lance or a levelled musket says where it is going
      if ((f.state === 'wind' || aiming) && ai < AIMS - 4) {
        for (let k = 1; k <= 4; k++) { const s = aimS[ai++], u = (k + (time * 4) % 1) * 0.8; s.visible = true; s.pos[0] = wx(f.x + f.cx * u); s.pos[1] = 0.5; s.pos[2] = wz(f.y + f.cy * u); }
      }
    }
    hide(aimS, ai);
    for (let k = dying.length - 1; k >= 0; k--) {
      const a = dying[k];
      a.t += dt / DIE;
      if (a.t >= 1) { dying[k] = dying[dying.length - 1]; dying.pop(); spare.push(a); continue; }
      const t = a.t * DIE, inst = crowd[a.kind].instances;
      if (inst.count >= CAP) continue;
      put(inst, inst.count++, a.x + a.vx * t, Math.max(0, a.up * t - 9 * t * t), a.z + a.vz * t, a.yaw, a.spin * t, a.spin * 0.4 * t, SIZE[a.kind] * (a.t > 0.6 ? 1 - (a.t - 0.6) / 0.4 : 1), 1, 0.85, 0.75);
    }
    for (const kind of KINDS) { const n = crowd[kind]; n.instances.dirty = true; n.visible = n.instances.count > 0; }
    if (yaws.size > run.foes.length + 40) { const live = new Set(run.foes.map((f) => f.id)); for (const id of yaws.keys()) if (!live.has(id)) yaws.delete(id); }

    // ── what flies and what lies ──
    let n = 0;
    for (const s of run.shots) { if (n >= SHOTS) break; const p = shotS[n++]; p.visible = true; p.pos[0] = wx(s.x); p.pos[2] = wz(s.y); }
    hide(shotS, n);
    n = 0;
    for (const s of run.bolts) { if (n >= BOLTS) break; const p = boltS[n], c = boltCore[n++]; p.visible = c.visible = true; p.pos[0] = c.pos[0] = wx(s.x); p.pos[2] = c.pos[2] = wz(s.y); p.size[0] = p.size[1] = 0.7 + 0.15 * Math.sin(time * 30); }
    hide(boltS, n); hide(boltCore, n);
    n = 0;
    for (const d of run.drops) { if (n >= DROPS) break; const p = dropS[n++]; p.visible = true; p.pos[0] = wx(d.x); p.pos[2] = wz(d.y); p.pos[1] = 0.2 + 0.06 * Math.sin(time * 6 + d.id); p.size[0] = p.size[1] = d.v > 2 ? 0.26 : 0.17; }
    hide(dropS, n);
    n = 0;
    for (const m of run.marks) { if (n >= MARKS) break; const p = markS[n++]; p.visible = true; p.pos[0] = wx(m.x); p.pos[2] = wz(m.y); const k = Math.max(0, m.t) / 0.9; p.size[0] = p.size[1] = (m.kind === 'captain' ? 2.2 : m.kind === 'grenadier' ? 1.3 : 0.9) * (0.5 + k * 0.7); p.alpha = 0.5 + 0.5 * Math.sin(time * 20); }
    hide(markS, n);
    n = 0;
    for (const f of run.fires) {
      for (let k = 0; k < 3 && n < fireS.length; k++) {
        const p = fireS[n++], a = k * 2.1 + f.id;
        p.visible = true; p.pos[0] = wx(f.x) + Math.cos(a + time) * f.r * 0.4; p.pos[2] = wz(f.y) + Math.sin(a + time * 1.3) * f.r * 0.4;
        p.size[0] = p.size[1] = f.r * (1.2 + 0.25 * Math.sin(time * 9 + k)); p.alpha = Math.min(0.55, f.t) * (0.8 + 0.2 * Math.sin(time * 13 + k));
      }
    }
    hide(fireS, n);
    n = 0;
    for (const s of run.shells) {
      if (n >= SHELLS) break;
      const ring = shellRing[n], ball = shellBall[n++], u = Math.max(0, s.t / s.air);
      ring.visible = ball.visible = true;
      ring.pos[0] = ball.pos[0] = wx(s.x); ring.pos[2] = ball.pos[2] = wz(s.y);
      ring.size[0] = ring.size[1] = s.r * 2; ring.alpha = 0.5 + 0.4 * Math.sin(time * 24);
      // from the hero's hand, up and over
      ball.pos[0] = wx(s.x) + (hx - wx(s.x)) * u; ball.pos[2] = wz(s.y) + (hz - wz(s.y)) * u; ball.pos[1] = 0.6 + Math.sin((1 - u) * Math.PI) * 3;
    }
    hide(shellRing, n); hide(shellBall, n);

    quake = Math.max(0, quake - dt * 4);
    sprites.update(dt);
  }

  /**
   * Place the camera so the board just fits a part of the viewport: `aspect` is the shape of that part (the space
   * the HUD leaves), `grow` how many times taller the whole viewport is, and `shift` how far below the viewport's
   * middle the part's middle lies, as a fraction of the viewport's height. The board is framed for the part, then
   * the field of view is opened to the whole viewport at the same scale, so the table runs on under the HUD.
   */
  function frame(aspect, time, grow = 1, shift = 0) {
    FRAME.aspect = aspect;
    camera.fov = FOV;
    GL.frameBox(camera, BOX, FRAME);
    if (grow > 1) {
      const tv = Math.tan(FOV * DEG / 2) * grow;
      camera.fov = 2 * Math.atan(tv) / DEG;
      // the part's middle is not the viewport's: slide along the board until it is
      const dist = Math.hypot(camera.position[0] - camera.target[0], camera.position[1] - camera.target[1], camera.position[2] - camera.target[2]);
      const dz = -shift * 2 * tv * dist / Math.sin(FRAME.pitch * DEG);
      camera.target[2] += dz; camera.position[2] += dz;
    }
    if (quake > 0.01) {
      const q = quake * quake * 0.1;
      camera.target[0] += Math.sin(time * 71) * q; camera.target[1] += Math.sin(time * 93) * q;
      camera.position[0] += Math.sin(time * 71) * q; camera.position[1] += Math.sin(time * 93) * q;
    }
    return camera;
  }

  return { scene, camera, view, update, frame, hero: heroPos };
}
