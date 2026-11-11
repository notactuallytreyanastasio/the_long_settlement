// Lanewar in 3D: a felt board on a table, a tin hero, and up to sixty-four tin soldiers closing on it.
//
//   const view = createFrayView(GL);
//   view.update(run, dt, time);          read the run (core/fray.js), act out what its last turn did
//   view.frame(aspect);                  place the camera for a viewport of that shape
//   renderer.render(view.scene, view.camera, time, { x, y, w, h, ...view.view });
//   view.hero                            [x, y, z] the hero's world position now (for the touch target)
//
// DRAW CALLS. The crowd is the whole problem, so the crowd is instanced: one mesh per kind of figure, drawn
// once however many stand on the board (five kinds: five colour draws, five outline draws, five in the shadow
// map). A figure is its instance matrix and a tint; nothing per figure is a scene node. The obvious version,
// a jointed chibi from characters.js per soldier, is three draws and ten thousand triangles each, and sixty
// of them is more than the rest of the game put together.
//
// TIME. The core's turns are instant; this file owns how long they look. A turn's moves are slid over MOVE
// seconds, and a new turn may arrive before that is over (a player swiping fast): every figure then starts
// its next slide from wherever it had got to. Nothing here ever makes the player wait.

import { W, H, BOARD_MAX, WEAPONS } from '../../core/fray.js';
import { FRAY_COLOURS as COL } from '../fray-view.js';

const MOVE = 0.15;        // seconds a step takes on the board
const DIE = 0.5;          // seconds a felled figure takes to leave it
const KINDS = ['foot', 'lancer', 'grenadier', 'musket', 'captain'];
const SIZE = { foot: 1, lancer: 1, grenadier: 1.28, musket: 1, captain: 1.6 };
const CAP = BOARD_MAX + 48;   // instances per kind: everyone standing, and those still falling
const FIRES = 48, AIMS = 24;

const wx = (x) => x - (W - 1) / 2;
const wz = (y) => y - (H - 1) / 2;

export function createFrayView(GL) {
  const { m4, quat, DEG, clamp } = GL;

  // ───────────────────────── the tin ─────────────────────────
  /** Move a mesh so it stands on height y. */
  const sit = (mesh, y) => { const b = GL.bounds(mesh); return GL.translate(mesh, 0, y - b.min[1], 0); };
  const part = (mesh, colour, y, x = 0, z = 0) => GL.translate(sit(GL.tint(mesh, colour), y), x, 0, z);

  /** A tin figure, about one unit tall on a round base, facing +Z. */
  function tin({ coat, hat, hatH = 0.2, hatR = 0.17, trim = '#f2d24a', plume = null, arm = null }) {
    const parts = [
      part(GL.cylinder(0.36, 0.34, 0.07, 14), '#b9b3a0', 0),
      part(GL.cylinder(0.25, 0.17, 0.4, 12), coat, 0.07),
      part(GL.cylinder(0.26, 0.26, 0.05, 12), trim, 0.2),
      part(GL.sphere(0.21, 14, 10), '#f6cfa6', 0.42),
      part(GL.cylinder(hatR, hatR * 0.92, hatH, 12), hat, 0.76),
      part(GL.sphere(0.035, 6, 4), '#1d2146', 0.6, -0.08, 0.19),
      part(GL.sphere(0.035, 6, 4), '#1d2146', 0.6, 0.08, 0.19),
    ];
    if (plume) parts.push(part(GL.ellipsoid(0.06, 0.13, 0.06, 8, 6), plume, 0.76 + hatH - 0.02));
    if (arm) parts.push(arm);
    return GL.merge(parts);
  }
  /** A long thin thing held at the right hand: upright (pitch 0) or levelled forward (pitch 90). */
  const stick = (len, colour, pitch, r = 0.028) => GL.place(GL.tint(GL.cylinder(r, r * 0.6, len, 6), colour), 0.29, 0.2 + (pitch > 45 ? 0.22 : 0), pitch > 45 ? -0.15 : 0, pitch, 0, 0);

  const MESH = {
    foot: tin({ coat: COL.foot, hat: '#23233a', arm: stick(0.75, '#d9dde6', 0) }),
    lancer: tin({ coat: COL.lancer, hat: '#f2d24a', hatH: 0.14, plume: '#ffffff', arm: stick(1.25, '#e9d8a8', 62) }),
    grenadier: tin({ coat: COL.grenadier, hat: '#2a1c14', hatH: 0.36, hatR: 0.2, trim: '#e8e2d0', arm: stick(0.7, '#d9dde6', 0, 0.04) }),
    musket: tin({ coat: COL.musket, hat: '#3a2a5c', hatH: 0.1, hatR: 0.27, trim: '#d8433a', arm: stick(0.95, '#5a3a22', 90, 0.035) }),
    captain: tin({ coat: COL.captain, hat: '#f2d24a', hatH: 0.24, plume: '#ff5a4a', arm: stick(0.8, '#ffffff', 28, 0.04) }),
  };
  const tinMat = GL.material({ bands: 2, spec: 0.55, specSize: 0.035, rim: 0.8, outline: { width: 2.2, color: '#1d2146', self: 0.4 } });

  const env = GL.makeEnv('day', {
    key: { dir: [-0.42, 0.8, 0.42], color: '#fff3d6' },
    sky: { zenith: '#131c44', mid: '#1d2a5c', horizon: '#2a3a7c', below: '#131c44', glowAmount: 0, stars: 0, moon: 0, sun: { size: 0, haloAmount: 0 } },
    fog: { density: 0 }, water: null,
    ambient: { sky: '#cfd8ff', ground: '#ffd9a0', amount: 0.3 },
    shadow: { tint: '#6d78c8', lift: 0.1 },
  });
  const scene = GL.createScene(env);
  const sprites = scene.sprites = GL.createSprites(640);

  // ───────────────────────── the board ─────────────────────────
  {
    const felt = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      felt.push(GL.translate(GL.tint(GL.plane(1, 1), (x + y) % 2 ? COL.feltA : COL.feltB), wx(x), 0.002, wz(y)));
    }
    const flat = GL.material({ rim: 0, outline: false, castShadow: false });
    scene.root.add(GL.node('felt', GL.merge(felt), flat));
    const wood = GL.material({ rim: 0, spec: 0.2, specSize: 0.05, outline: { width: 2.4, color: '#1d2146', self: 0.5 } });
    const hw = W / 2, hh = H / 2, t = 0.34;
    const frame = GL.merge([
      GL.place(GL.tint(GL.roundedBox(W + t * 2, 0.3, t, 0.06), '#8a5326'), 0, 0, -hh - t / 2),
      GL.place(GL.tint(GL.roundedBox(W + t * 2, 0.3, t, 0.06), '#8a5326'), 0, 0, hh + t / 2),
      GL.place(GL.tint(GL.roundedBox(t, 0.3, H, 0.06), '#9a6030'), -hw - t / 2, 0, 0),
      GL.place(GL.tint(GL.roundedBox(t, 0.3, H, 0.06), '#9a6030'), hw + t / 2, 0, 0),
      // brass corners, because somebody's grandfather made this board
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => GL.place(GL.tint(GL.cylinder(0.24, 0.24, 0.34, 10), '#f2c84a'), sx * (hw + t / 2), -0.15, sz * (hh + t / 2))),
      GL.place(GL.tint(GL.box(W + 14, 0.4, H + 14), '#4a2f1c'), 0, -0.36, 0),
    ]);
    scene.root.add(GL.node('frame', frame, wood));
  }

  // ───────────────────────── the crowd ─────────────────────────
  const crowd = {};
  for (const kind of KINDS) {
    const n = GL.node(`tin-${kind}`, MESH[kind], tinMat);
    n.instances = GL.makeInstances(CAP); n.cull = false;
    scene.root.add(n);
    crowd[kind] = n;
  }

  // ───────────────────────── the hero ─────────────────────────
  const heroNode = GL.group('hero');
  const heroBody = GL.node('hero-body', tin({ coat: COL.hero, hat: '#1d2a5c', hatH: 0.22, trim: '#f2d24a', plume: '#ffffff' }), GL.material({ bands: 2, spec: 0.6, specSize: 0.04, rim: 1, outline: { width: 2.8, color: '#1d2146', self: 0.3 } }));
  heroBody.setScale(1.3);
  const bright = GL.material({ emissive: 1, rim: 0, outline: false, castShadow: false, receiveShadow: false, doubleSided: true });
  const blade = GL.node('blade', GL.place(GL.tint(GL.box(0.07, 0.03, 0.85), '#ffffff'), 0, 0, 0.42), GL.material({ spec: 0.9, specSize: 0.05, outline: { width: 1.6, color: '#1d2146' } }));
  blade.setPos(0.42, 0.52, 0.05);
  // the cut itself: a crescent in the plane of the board, widest dead ahead
  const crescent = (() => {
    const P = [], I = [], N = 14, R = 1.62;
    for (let i = 0; i <= N; i++) {
      const a = (-78 + 156 * i / N) * DEG, wdt = 0.5 * Math.cos((i / N - 0.5) * Math.PI);
      P.push(Math.sin(a) * R, 0, Math.cos(a) * R, Math.sin(a) * (R - wdt), 0, Math.cos(a) * (R - wdt));
      if (i < N) { const k = i * 2; I.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    return GL.node('slash', GL.tint(GL.fromArrays(P, I), '#ffffff'), bright);
  })();
  crescent.setPos(0, 0.5, 0); crescent.visible = false; crescent.castShadow = false;
  const pike = GL.node('pike', GL.place(GL.tint(GL.box(0.09, 0.09, 1), COL.pike), 0, 0, 0.5), bright);
  pike.setPos(0, 0.55, 0.3); pike.visible = false; pike.castShadow = false;
  heroNode.add(heroBody, blade, crescent, pike);
  scene.root.add(heroNode);
  const heroGlow = sprites.add({ kind: 'ring', pos: [0, 0.03, 0], size: 1.5, color: '#ffffff', alpha: 0.5 });

  const fireSprites = [], aimSprites = [];
  for (let i = 0; i < FIRES; i++) { const s = sprites.add({ kind: 'glow', pos: [0, 0.2, 0], size: 1.1, color: COL.oil, alpha: 0 }); s.visible = false; fireSprites.push(s); }
  for (let i = 0; i < AIMS; i++) { const s = sprites.add({ kind: 'dot', pos: [0, 0.6, 0], size: 0.14, color: '#ff5a4a', alpha: 0.95 }); s.visible = false; aimSprites.push(s); }

  // ───────────────────────── state ─────────────────────────
  const actors = new Map();       // id -> actor
  const pool = [], dying = [];
  let seenRun = null, seenN = -1;
  const hero = { x: 0, z: 0, fx: 0, fz: 0, tx: 0, tz: 0, t: 1, yaw: 180, toYaw: 180, hurt: 0, swing: 0, swingScale: 1, thrust: 0, reach: 4, bump: 0, bx: 0, bz: 0 };
  const heroPos = [0, 0.5, 0];
  let quake = 0;

  const camera = GL.createCamera({ fov: 30, near: 0.5, far: 120 });
  const BOX = { min: [-W / 2 - 0.5, 0, -H / 2 - 0.5], max: [W / 2 + 0.5, 0.9, H / 2 + 0.5] };
  const FRAME = { yaw: 0, pitch: 57, aspect: 1, margin: 1.02, shiftY: 0 };
  const view = { shadowCenter: [0, 0, 0], shadowRadius: 9.5 };

  const P3 = [0, 0, 0], V3 = [0, 0, 0];
  const at = (x, y, h) => { P3[0] = wx(x); P3[1] = h; P3[2] = wz(y); return P3; };
  const ease = (t) => t * t * (3 - 2 * t);
  const nowX = (a) => a.fx + (a.tx - a.fx) * ease(a.t);
  const nowZ = (a) => a.fz + (a.tz - a.fz) * ease(a.t);

  function take(kind, x, y) {
    const a = pool.pop() || {};
    a.kind = kind; a.fx = a.tx = wx(x); a.fz = a.tz = wz(y); a.t = 1; a.born = 0; a.hurt = 0; a.lunge = 0; a.aim = false; a.yaw = 0;
    return a;
  }

  function reset(run) {
    for (const a of actors.values()) pool.push(a);
    actors.clear(); dying.length = 0;
    for (const f of run.foes) { const a = take(f.kind, f.x, f.y); a.born = 1; actors.set(f.id, a); }
    hero.fx = hero.tx = wx(run.hero.x); hero.fz = hero.tz = wz(run.hero.y); hero.t = 1;
    hero.yaw = hero.toYaw = Math.atan2(run.hero.face[0], run.hero.face[1]) / DEG;
  }

  function swing(run, e) {
    const col = COL[e.weapon] || '#ffffff';
    for (const c of e.cells) sprites.spawn({ kind: 'glow', pos: at(c[0], c[1], 0.12), size: 1.25, endSize: 0.7, life: 0.2, color: col, alpha: e.weapon === 'sabre' ? 0.35 : 0.6 });
    const lv = WEAPONS[e.weapon].levels[run.weapons[e.weapon] - 1];
    if (e.weapon === 'sabre') { hero.swing = 1; hero.swingScale = lv.shape === 'deep' ? 1.55 : lv.shape === 'wide' ? 1.2 : 1; }
    else if (e.weapon === 'pike') { hero.thrust = 1; hero.reach = lv.reach; }
    else if (e.weapon === 'flail') sprites.spawn({ kind: 'ring', pos: at(run.hero.x, run.hero.y, 0.3), size: 0.6, endSize: lv.reach * 2 + 1.6, life: 0.28, color: col });
    else if (e.weapon === 'grape') { at(run.hero.x + run.hero.face[0] * 0.6, run.hero.y + run.hero.face[1] * 0.6, 0.6); sprites.puff(P3, { count: 4, size: 0.5, rise: 0.5, spread: 0.5, life: 0.7 }); quake = Math.max(quake, 0.5); }
    else if (e.weapon === 'mortar' && e.cells.length) {
      let cx = 0, cy = 0; for (const c of e.cells) { cx += c[0]; cy += c[1]; } cx /= e.cells.length; cy /= e.cells.length;
      sprites.spawn({ kind: 'ring', pos: at(cx, cy, 0.1), size: 0.5, endSize: lv.blast * 2 + 2.2, life: 0.35, color: col });
      sprites.spawn({ kind: 'glow', pos: at(cx, cy, 0.5), size: lv.blast * 2 + 2.5, endSize: 0.5, life: 0.3, color: '#fff2c0', alpha: 0.9 });
      sprites.puff(at(cx, cy, 0.4), { count: 6, size: 0.8, rise: 1.1, spread: 1.2, life: 1 });
      sprites.sparkle(at(cx, cy, 0.6), { count: 12, color: col, size: 0.4, spread: 2, life: 0.6 });
      quake = 1;
    }
  }

  function turn(run) {
    const hx = wx(run.hero.x), hz = wz(run.hero.y);
    for (const e of run.events) {
      if (e.type === 'spawn') {
        const a = take(e.kind, e.x, e.y); a.born = 0; actors.set(e.id, a);
        sprites.puff(at(e.x, e.y, 0.2), { count: 1, size: 0.4, rise: 0.3, spread: 0.2, life: 0.5 });
      } else if (e.type === 'kill') {
        const a = actors.get(e.id);
        if (!a) continue;
        actors.delete(e.id);
        // off the board, away from the hero (from the shell, for a shell)
        const x = nowX(a), z = nowZ(a);
        let dx = x - hx, dz = z - hz; const d = Math.sqrt(dx * dx + dz * dz) || 1; dx /= d; dz /= d;
        const far = e.by === 'mortar' || e.by === 'grape';
        a.fx = x; a.fz = z; a.vx = dx * (far ? 5.5 : 3.6) + (Math.random() - 0.5) * 1.6; a.vz = dz * (far ? 5.5 : 3.6) + (Math.random() - 0.5) * 1.6;
        a.t = 0; a.spin = (Math.random() < 0.5 ? -1 : 1) * (500 + Math.random() * 500); a.up = far ? 4.6 : 3.2;
        dying.push(a);
        P3[0] = x; P3[1] = 0.5; P3[2] = z;
        sprites.sparkle(P3, { count: e.kind === 'captain' ? 16 : 3, color: COL[e.kind], size: e.kind === 'captain' ? 0.6 : 0.3, spread: e.kind === 'captain' ? 1.6 : 0.5, life: 0.5 });
        if (e.kind === 'captain') quake = 1;
      } else if (e.type === 'hit') { const a = actors.get(e.id); if (a) a.hurt = 1; }
      else if (e.type === 'hurt') { hero.hurt = 1; quake = Math.max(quake, 0.6); const a = actors.get(e.by); if (a) a.lunge = 1; }
      else if (e.type === 'shot') {
        const a = actors.get(e.id);
        if (a) for (let i = 1; i <= 5; i++) { P3[0] = a.tx + (hx - a.tx) * i / 6; P3[1] = 0.6; P3[2] = a.tz + (hz - a.tz) * i / 6; sprites.spawn({ kind: 'glow', pos: P3, size: 0.5, endSize: 0.1, life: 0.12 + i * 0.03, color: '#ffe08a' }); }
      } else if (e.type === 'swing') swing(run, e);
      else if (e.type === 'move') { hero.fx = nowX(hero); hero.fz = nowZ(hero); hero.tx = hx; hero.tz = hz; hero.t = 0; }
      else if (e.type === 'bump') { hero.bump = 1; hero.bx = run.hero.face[0]; hero.bz = run.hero.face[1]; }
      else if (e.type === 'burn') sprites.puff(at(e.x, e.y, 0.4), { count: 1, size: 0.35, color: '#ffb060', rise: 0.8, spread: 0.2, life: 0.5 });
      else if (e.type === 'drum') sprites.spawn({ kind: 'ring', pos: at(run.hero.x, run.hero.y, 0.2), size: 1, endSize: 14, life: 0.5, color: '#ffffff' });
      else if (e.type === 'cleared') for (let i = 0; i < 26; i++) sprites.sparkle(at(Math.random() * W, Math.random() * H, 0.6 + Math.random()), { count: 1, color: i % 2 ? '#ffd24a' : '#ffffff', size: 0.6, spread: 0.4, life: 0.9 });
      else if (e.type === 'fallen') { quake = 1; sprites.puff(at(run.hero.x, run.hero.y, 0.4), { count: 6, size: 0.7, rise: 0.8, spread: 0.6, life: 1 }); }
    }
    hero.toYaw = Math.atan2(run.hero.face[0], run.hero.face[1]) / DEG;
    for (const f of run.foes) {
      let a = actors.get(f.id);
      if (!a) { a = take(f.kind, f.x, f.y); a.born = 1; actors.set(f.id, a); continue; }
      const tx = wx(f.x), tz = wz(f.y);
      if (tx !== a.tx || tz !== a.tz) { a.fx = nowX(a); a.fz = nowZ(a); a.tx = tx; a.tz = tz; a.t = 0; }
      a.aim = !!f.aim;
    }
    // anybody the run no longer has and nothing felled (a different run under the same view): gone
    if (actors.size !== run.foes.length) {
      const live = new Set(run.foes.map((f) => f.id));
      for (const [id, a] of actors) if (!live.has(id)) { actors.delete(id); pool.push(a); }
    }
  }

  const M = m4.create(), Q = quat.create(), S = [1, 1, 1], T = [0, 0, 0];
  function put(inst, i, x, y, z, yawDeg, pitchDeg, rollDeg, s, r, g, b) {
    T[0] = x; T[1] = y; T[2] = z; S[0] = S[1] = S[2] = s;
    quat.fromEuler(Q, pitchDeg * DEG, yawDeg * DEG, rollDeg * DEG);
    m4.fromTRS(M, T, Q, S);
    const d = inst.data, k = i * 20;
    d.set(M, k); d[k + 16] = r; d[k + 17] = g; d[k + 18] = b; d[k + 19] = 1;
  }

  function update(run, dt, time) {
    if (run !== seenRun) {
      const fresh = seenRun === null || run.n < seenN || run.n === 0 || run.n > seenN + 1;
      if (fresh) reset(run); else turn(run);
      seenRun = run; seenN = run.n;
    }
    // the hero
    hero.t = Math.min(1, hero.t + dt / MOVE);
    let dy = hero.toYaw - hero.yaw; dy -= Math.round(dy / 360) * 360;
    hero.yaw += dy * Math.min(1, dt * 26);
    hero.hurt = Math.max(0, hero.hurt - dt * 3.2); hero.swing = Math.max(0, hero.swing - dt / 0.16);
    hero.thrust = Math.max(0, hero.thrust - dt / 0.18); hero.bump = Math.max(0, hero.bump - dt / 0.14);
    const hop = Math.sin(hero.t * Math.PI) * 0.22, bump = Math.sin(hero.bump * Math.PI) * 0.16;
    const hx = nowX(hero) + hero.bx * bump, hz = nowZ(hero) + hero.bz * bump;
    const fallen = run.phase === 'over';
    heroNode.setPos(hx, hop, hz);
    heroNode.setRot(fallen ? -84 : 0, hero.yaw, 0);
    heroBody.flash[0] = 1; heroBody.flash[1] = 0.25; heroBody.flash[2] = 0.2; heroBody.flash[3] = hero.hurt * 0.75;
    heroPos[0] = hx; heroPos[1] = 0.55; heroPos[2] = hz;
    heroGlow.pos[0] = hx; heroGlow.pos[2] = hz; heroGlow.alpha = 0.3 + 0.12 * Math.sin(time * 4); heroGlow.visible = !fallen;
    // sabre: the arm follows the cut, and the cut is a crescent that opens and is gone
    const sw = hero.swing;
    blade.setRot(0, sw > 0 ? 70 - (1 - sw) * 150 : 20, 0);
    crescent.visible = sw > 0.05 && !fallen;
    if (crescent.visible) { crescent.setScale(hero.swingScale * (1.05 - sw * 0.25)); crescent.setRot(0, (sw - 0.5) * 40, 0); crescent.tint[3] = sw; }
    pike.visible = hero.thrust > 0.05 && !fallen;
    if (pike.visible) pike.setScale(1, 1, hero.reach * Math.sin(Math.min(1, (1 - hero.thrust) * 1.6) * Math.PI * 0.5 + 0.2));

    // the crowd
    for (const kind of KINDS) crowd[kind].instances.count = 0;
    for (const a of actors.values()) {
      a.t = Math.min(1, a.t + dt / MOVE); a.born = Math.min(1, a.born + dt / 0.22);
      a.hurt = Math.max(0, a.hurt - dt * 4); a.lunge = Math.max(0, a.lunge - dt / 0.2);
      const x = nowX(a), z = nowZ(a);
      let fx = hx - x, fz = hz - z; const d = Math.sqrt(fx * fx + fz * fz) || 1; fx /= d; fz /= d;
      const want = Math.atan2(fx, fz) / DEG; let dyaw = want - a.yaw; dyaw -= Math.round(dyaw / 360) * 360; a.yaw += dyaw * Math.min(1, dt * 14);
      const lunge = Math.sin(a.lunge * Math.PI) * 0.3;
      const y = Math.sin(a.t * Math.PI) * 0.14 + (1 - a.born) * (1 - a.born) * 1.4;
      const inst = crowd[a.kind].instances, i = inst.count++;
      const s = SIZE[a.kind] * (0.4 + 0.6 * a.born);
      const h = a.hurt, aim = a.aim ? 0.5 + 0.5 * Math.sin(time * 18) : 0;
      put(inst, i, x + fx * lunge, y, z + fz * lunge, a.yaw, a.aim ? -8 : 0, 0, s, 1, 1 - h * 0.7 - aim * 0.25, 1 - h * 0.7 - aim * 0.25);
    }
    for (let k = dying.length - 1; k >= 0; k--) {
      const a = dying[k];
      a.t += dt / DIE;
      if (a.t >= 1) { dying[k] = dying[dying.length - 1]; dying.pop(); pool.push(a); continue; }
      const t = a.t * DIE, inst = crowd[a.kind].instances;
      if (inst.count >= CAP) continue;
      const y = Math.max(0, a.up * t - 9 * t * t);
      put(inst, inst.count++, a.fx + a.vx * t, y, a.fz + a.vz * t, a.yaw, a.spin * t, a.spin * 0.4 * t, SIZE[a.kind] * (a.t > 0.6 ? 1 - (a.t - 0.6) / 0.4 : 1), 1, 0.85, 0.75);
    }
    for (const kind of KINDS) { const n = crowd[kind]; n.instances.dirty = true; n.visible = n.instances.count > 0; }

    // lamp oil, and muskets taking aim
    let fi = 0;
    for (const f of run.fires) {
      if (fi >= FIRES) break;
      const s = fireSprites[fi++];
      s.visible = true; s.pos[0] = wx(f.x); s.pos[2] = wz(f.y); s.pos[1] = 0.25;
      s.alpha = 0.45 + 0.2 * Math.sin(time * 11 + f.x * 2.1 + f.y * 1.3); s.size[0] = s.size[1] = 0.9 + 0.2 * Math.sin(time * 7 + f.y);
    }
    for (; fi < FIRES; fi++) fireSprites[fi].visible = false;
    let ai = 0;
    for (const a of actors.values()) {
      if (!a.aim) continue;
      for (let i = 1; i <= 4 && ai < AIMS; i++) {
        const s = aimSprites[ai++], u = (i + (time * 3) % 1) / 5;
        s.visible = true; s.pos[0] = a.tx + (hx - a.tx) * u; s.pos[1] = 0.62; s.pos[2] = a.tz + (hz - a.tz) * u;
      }
    }
    for (; ai < AIMS; ai++) aimSprites[ai].visible = false;

    quake = Math.max(0, quake - dt * 4);
    sprites.update(dt);
  }

  function frame(aspect, time) {
    FRAME.aspect = aspect;
    GL.frameBox(camera, BOX, FRAME);
    if (quake > 0.01) {
      const q = quake * quake * 0.12;
      camera.target[0] += Math.sin(time * 71) * q; camera.target[1] += Math.sin(time * 93) * q;
      camera.position[0] += Math.sin(time * 71) * q; camera.position[1] += Math.sin(time * 93) * q;
    }
    return camera;
  }

  return { scene, camera, view, update, frame, hero: heroPos, get count() { return actors.size; }, clampQuake: () => { quake = clamp(quake, 0, 1); } };
}
