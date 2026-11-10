// The Tallis kit: builders shared by the six chapter 5 sets (exchange-steps, exchange-floor, corvane-study,
// commons-queue, clearing-house, cell). Same rules as kit.js: pure (no GL, no DOM), one options object per
// builder, per-vertex colour, anchors in the builder's own space, chunky and a little crooked, and cheap:
// a prop here is tens to a few hundred triangles, because a stage band has about 60k submitted to spend.
//
// Scaffolding
//   TL                         Tallis colours: copper-green roofs, brick coral, slate, brass, chalk
//   dirFrom(az, el), norm(v)   a unit vector from compass angles (az 0 = toward -Z, + = right), or from any vector
//   ch5Materials()             kitMaterials() plus wall (casts nothing), paper (double sided), shaft and ray (additive)
//   shell(spec)                everything a set returns that is the same for every set (cameras, frame, view, lamps,
//                              setPower, update); `dim` is how far an unpowered table darkens the set's key light
//   throng(opts)               a crowd in two instanced draws: coats take a strong colour each, heads keep their skin.
//                              { nodes, people, setAmount(0..1), update(time, dt, { lively }) }
//   papers(opts)               loose sheets falling or blowing, one instanced draw, driven by time alone
//   rain(sprites, box, opts)   -> step(time, dt): streaks falling through a box
// Outdoors
//   gableHouse(opts)           a tall narrow Tallis merchant's house with a stepped, pointed or bell gable
//   fatColumn(opts)            a porch column with entasis, a base and a brass-banded capital
//   bell(opts)                 { yoke, bell } the opening bell: the bell swings about its origin
//   lantern(opts)              a square glass lantern (hang it, or stand it on a bracket); anchors: lamp
//   ironRail(opts)             a brass-topped rail on thin posts, along X
//   paving(opts)               a floor of big slabs in two or three tones, one flat mesh
//   ringsSign(opts)            the Commons' two linked rings on an iron bracket
// Indoors
//   priceBoard(opts)           the slate where every price in Aurelle is chalked; anchors: rows
//   pit(opts)                  a trading pit: an eight-sided ring of low steps with a brass rail; standard(opts): its flag
//   islandTable(opts)          { table, lamp, spots } all of Aurelle in brass on a slate sea: forty islands on stems
//   longClock(opts)            a long-case clock (the pendulum is yours: anchors.pendulum)
//   vaultDoor(opts)            a round strongroom door: { frame, wheel } the wheel turns about its origin
//   tubeWall(opts)             the clearing tubes: brass pipes up a wall, a hatch on each; anchors: hatches, tops
//   carrier(opts)              the brass carrier that goes up a tube
//   pigeonholes(opts)          a wall of sorting holes with sheets in them
//   cot, washstand, coatPeg, barredWindow, cellDoor   what a person of standing is allowed

import { m4, quat, rng, DEG, rgb } from '../math.js';
import {
  sphere, ellipsoid, cylinder, lathe, torus, box, roundedBox, extrude, tube, curve, quad, fromArrays,
  merge, tint, place, setGlow, setOutline, gradientY, deform, scale as scaleMesh,
} from '../mesh.js';
import { material, Node, group, makeInstances } from '../scene.js';
import { PAL, wonk, kitMaterials } from './kit.js';

export const TL = {
  copper: '#35c9b5', copperDark: '#1f9c9a', slate: '#5b7fe8', slateDark: '#3a4fb0', brick: '#ff8a6a', brickDark: '#e0604e',
  cream: '#fff1d0', lemon: '#ffe27a', rose: '#ffb0b8', lilac: '#c8b4ff', mintWall: '#bfeedd', sky: '#a8dcff',
  stone: '#f6e6c6', stone2: '#e8d2ac', stoneCool: '#d9dcff', stoneBlue: '#9aa6f0', brass: '#ffc94a', brassDark: '#e0932e',
  iron: '#3b4a7a', navy: '#27336e', chalk: '#f4f8ff', board: '#2d3a78', boardDark: '#222c62',
  wine: '#c23a5e', plum: '#7a4fc4', plumDark: '#4a3498', teal: '#27b8a8', tealDark: '#1c8c9a', royal: '#3b62d8', emerald: '#2fba7e',
  wood: '#d98a4e', woodDark: '#9a5236', woodPale: '#f0b574', paper: '#fffaf0', parchment: '#fff4d2', glass: '#ffe27a', glassOff: '#4a5fb0',
  coats: ['#f4573f', '#35c9b5', '#ffd24a', '#3f78e0', '#8a6be0', '#ff8fb0', '#86de57', '#ff9a3c', '#fff1d0', '#5b7fe8', '#e86a9a', '#27b8a8'],
  skins: ['#ffffff', '#ffeede', '#f2d9c4', '#e0bfa4', '#fff4e6', '#d2a888'],
};

const R = (seed) => rng(Math.floor(seed * 7919) + 53);
const keep = (mesh, anchors) => { mesh.anchors = anchors; return mesh; };
const bx = (w, h, d, x, y, z, c, rx = 0, ry = 0, rz = 0) => tint(place(box(w, h, d), x, y, z, rx, ry, rz), c);
const rb = (w, h, d, rad, x, y, z, c, rx = 0, ry = 0, rz = 0) => tint(place(roundedBox(w, h, d, rad, 1), x, y, z, rx, ry, rz), c);
const cyl = (r0, r1, h, seg, x, y, z, c, rx = 0, ry = 0, rz = 0) => tint(place(cylinder(r0, r1, h, seg), x, y, z, rx, ry, rz), c);

export const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
/** A unit vector toward a point in the sky: az 0 = straight upstage (-Z), + = to the right; el degrees above the horizon. */
export const dirFrom = (azDeg, elDeg) => [Math.sin(azDeg * DEG) * Math.cos(elDeg * DEG), Math.sin(elDeg * DEG), -Math.cos(azDeg * DEG) * Math.cos(elDeg * DEG)];

// ------------------------------------------------------------------------------------ scaffolding

/** kitMaterials() plus what a room and a street of paper need. */
export function ch5Materials() {
  return {
    ...kitMaterials(),
    /** walls, ceilings, big faces of buildings: receive shadows, cast none, no rim */
    wall: material({ name: 'ch5-wall', rim: 0, bandEdge: -0.2, outline: { width: 1.9, self: 0.65 }, castShadow: false }),
    /** props that should not cast (small things on tables, wall fittings) */
    deco: material({ name: 'ch5-deco', bandEdge: 0.02, outline: { width: 2.1, self: 0.6 }, castShadow: false }),
    /** loose sheets: seen from both sides, no outline */
    paper: material({ name: 'ch5-paper', rim: 0, outline: false, castShadow: false, receiveShadow: false, doubleSided: true, bandEdge: -0.6 }),
    /** additive window shafts (flat cards) and lamp cones (rayMesh) */
    shaft: material({ kind: 'beam', name: 'ch5-shaft', beam: { power: 0.6, near: 0.3, far: 0.04, steps: 0 }, outline: false }),
  };
}

/**
 * The common half of a set. spec:
 *   id, light (name), L (the light state: needs .power), scene, cameras, marks, actors, foreground,
 *   lamps [{ name, pos, color, radius, base, flicker? }]  -> env.points (at most 6)
 *   glows [{ sprite, base, fixed? }]                      halos that follow the lamp power
 *   motes { box [x0, x1, y0, y1, z0, z1], every, color, size, vel, life, alpha } | null
 *   tick(time, dt, pw, live)                              the set's own animation; pw = L.power * setPower
 *   dim   0..1                                            how much of the key light an empty table takes away (rooms 0.5, streets 0.2)
 *   extra                                                 set-specific fields merged into the result
 * Returns the set object, in the shape of sets/lantern-stalls.js.
 */
export function shell({ id, light, L, scene, cameras, marks, actors, foreground, lamps = [], glows = [], motes = null, tick = null, dim = 0.5, extra = {} }) {
  const env = scene.env, sprites = scene.sprites;
  if (lamps.length > 6) throw new Error(`${id}: ${lamps.length} fixed lamps; the limit is 6 (the engine draws 8, two stay free for carried lamps)`);
  env.points = lamps.map((l) => ({ pos: l.pos, color: rgb(l.color), radius: l.radius, intensity: l.base * L.power }));
  let power = 1, lastT = -1, nextMote = 0;
  const key0 = Array.from(env.key.color), amb0 = env.ambient.amount, lift0 = env.shadow.lift;
  const rnd = rng(915), P = [0, 0, 0], V0 = [0.05, 0.06, 0.02];
  function setPower(p) { power = Math.max(0, Math.min(1.5, p)); }
  function update(time, dt = 0) {
    const pw = L.power * power, live = lastT >= 0 && time - lastT < 0.5 && dt > 0;
    const house = power <= 1 ? 1 - dim * (1 - power) : 1 + 0.16 * (power - 1);
    for (let i = 0; i < 3; i++) env.key.color[i] = key0[i] * house;
    env.ambient.amount = amb0 * (1 - dim * 0.8 * (1 - Math.min(1, power))); env.shadow.lift = lift0 * (1 - dim * (1 - Math.min(1, power)));
    for (let i = 0; i < lamps.length; i++) { const l = lamps[i], f = l.flicker ?? 0.05; env.points[i].intensity = l.base * pw * (l.gain ?? 1) * (1 - f + f * Math.sin(time * (7.3 + i * 1.7) + i * 2.1) * Math.sin(time * 3.1 + i)); }
    for (let i = 0; i < glows.length; i++) { const g = glows[i]; g.sprite.alpha = g.base * (g.gain ?? 1) * Math.min(1.25, g.fixed ? 1 : pw); }
    if (tick) tick(time, dt, pw, live);
    if (live) {
      if (motes && time > nextMote) {
        nextMote = time + motes.every; const b = motes.box;
        P[0] = b[0] + rnd() * (b[1] - b[0]); P[1] = b[2] + rnd() * (b[3] - b[2]); P[2] = b[4] + rnd() * (b[5] - b[4]);
        sprites.spawn({ kind: 'glow', pos: P, vel: motes.vel || V0, size: (motes.size || 0.07) * (0.6 + rnd() * 0.8), life: motes.life || 5, color: motes.color || '#ffe6a0', alpha: motes.alpha ?? 0.8 });
      }
      sprites.update(dt);
    }
    lastT = time;
  }
  function frame(camera, name, time = 0) {
    const c = cameras[name];
    if (!c) throw new Error(`${id}: no camera "${name}" (have ${Object.keys(cameras).join(', ')})`);
    camera.fov = c.fov;
    camera.orbit(c.target, c.dist * (1 + Math.sin(time * 0.17) * 0.01), c.yaw + Math.sin(time * 0.21) * 1.2, c.pitch + Math.sin(time * 0.13 + 1) * 0.4);
    env.shadow.center = c.shadowCenter; env.shadow.radius = c.shadowRadius; env.outline.width = c.outline || 1;
    return camera;
  }
  const views = {}; for (const k of Object.keys(cameras)) views[k] = { shadowCenter: cameras[k].shadowCenter, shadowRadius: cameras[k].shadowRadius };
  const set = { id, light, scene, env, actors, foreground: foreground || group('foreground'), cameras, frame, view: (name) => views[name], marks, lamps, setPower, update, task: () => null, cue: () => false, ...extra };
  update(0, 0);
  return set;
}

/** The marks every set shares; a set overrides what its furniture is in the way of. */
export const MARKS = {
  a: { pos: [-0.8, 0, 0.55], face: 14 }, b: { pos: [0.02, 0, 0.8], face: 0 }, c: { pos: [0.82, 0, 0.55], face: -14 },
  two: [{ pos: [-0.42, 0, 0.62], face: 24 }, { pos: [0.42, 0, 0.62], face: -24 }],
  party: [{ pos: [-1.05, 0, 0.75], face: 78 }, { pos: [-1.85, 0, 1.15], face: 72 }, { pos: [-2.5, 0, 0.5], face: 80 }],
  opposition: [{ pos: [1.05, 0, 0.75], face: -78 }, { pos: [1.85, 0, 1.15], face: -72 }, { pos: [2.55, 0, 0.5], face: -80 }],
};

// ------------------------------------------------------------------------------------ people and paper

/**
 * One citizen as two meshes: a white coat (an instance colour dresses it) and a head that keeps its own colours.
 *   detail 1: near rows (about 150 triangles), 0: a far mass (about 60)
 *   arm    'none' | 'slip' (one arm up with a slip of paper: a trader) | 'cup' (hands together: someone waiting)
 */
export function citizen({ detail = 1, arm = 'none', seed = 1, hair = '#7a4630' } = {}) {
  const r = R(seed), up = r() > 0.5 ? 1 : -1, bodyParts = [], headParts = [];
  bodyParts.push(lathe([[0, 0], [0.2, 0], [0.225, 0.07], [0.17, 0.34], [0.12, 0.5], [0, 0.55]], detail ? 7 : 5, { crease: 180 }));
  if (arm === 'slip') bodyParts.push(place(ellipsoid(0.045, 0.17, 0.045, 5, 3), up * 0.2, 0.62, 0.04, 0, 0, up * -22));
  else if (detail) for (const sx of [-1, 1]) bodyParts.push(place(ellipsoid(0.042, 0.13, 0.042, 5, 3), sx * 0.17, 0.36, 0.04, 14, 0, sx * 16));
  headParts.push(tint(place(sphere(0.2, detail ? 8 : 6, detail ? 5 : 4), 0, 0.72, 0), '#ffdcb8'));
  if (detail) {
    headParts.push(tint(place(deform(sphere(1, 8, 4), (p) => { if (p[1] < 0.12 && p[2] > -0.25) p[1] = 0.12 + (p[1] - 0.12) * 0.05; }), 0, 0.735, -0.02, 0, 0, 0, 0.218, 0.2, 0.212), hair));
    for (const sx of [-1, 1]) headParts.push(setOutline(tint(place(box(0.036, 0.055, 0.02), sx * 0.075, 0.71, 0.186), '#2a2140'), 0));
  } else headParts.push(tint(place(ellipsoid(0.212, 0.17, 0.2, 6, 3), 0, 0.775, -0.035), hair));
  if (arm === 'slip') headParts.push(tint(place(box(0.13, 0.17, 0.012), up * 0.27, 0.86, 0.05, 0, 0, up * -14), TL.paper));
  return { body: merge(bodyParts), head: merge(headParts) };
}

/**
 * A crowd in two instanced draws (four with outlines). spots [{ pos, face (degrees), s?, sit? (0..1: sunk as if seated) }],
 * in the order people turn up. colors: coat colours; skins: head tints (keep them pale).
 * Returns { nodes [body, head], people, amount, pace, setAmount(0..1), update(time, dt, { lively 0..1 }) }. No allocation per frame.
 */
export function throng({ spots, material: mat, seed = 1, detail = 1, arm = 'none', colors = TL.coats, skins = TL.skins, amount = 1, hair = '#7a4630' }) {
  const r = R(seed), fig = citizen({ detail, arm, seed, hair });
  const cap = Math.max(1, spots.length);
  const body = new Node('throng-body', { mesh: fig.body, material: mat }), head = new Node('throng-head', { mesh: fig.head, material: mat });
  for (const n of [body, head]) { n.castShadow = false; n.instances = makeInstances(cap); n.instances.count = 0; }
  const people = spots.map((sp, i) => ({ pos: sp.pos, face: sp.face || 0, s: sp.s || 0.9 + r() * 0.24, sit: sp.sit || 0, ph: r() * 6.283, col: rgb(colors[Math.floor(r() * colors.length) % colors.length]), skin: rgb(skins[Math.floor(r() * skins.length) % skins.length]), here: i < Math.round(amount * spots.length) ? 1 : 0 }));
  const Q = quat.create(), S3 = [1, 1, 1], Mx = m4.create(), P = [0, 0, 0];
  let arrived = Math.round(amount * spots.length);
  const c = {
    nodes: [body, head], people, amount, pace: 12,
    setAmount(a) { c.amount = Math.max(0, Math.min(1, a)); },
    update(time, dt = 0, { lively = 0.3 } = {}) {
      const want = Math.round(c.amount * people.length), pace = c.pace * dt;
      arrived = dt === 0 ? want : arrived + Math.max(-pace, Math.min(pace, want - arrived));
      const bd = body.instances.data, hd = head.instances.data; let k = 0;
      for (let i = 0; i < people.length; i++) {
        const p = people[i], goal = i < arrived ? 1 : 0;
        p.here += (goal - p.here) * Math.min(1, dt * 7 + (dt === 0 ? 1 : 0));
        if (p.here < 0.02) continue;
        const live = lively * (1 - p.sit * 0.8);
        const hop = Math.abs(Math.sin(time * (2.2 + live * 2.6) + p.ph)) * 0.06 * live, sw = Math.sin(time * 1.1 + p.ph * 1.7) * (1.5 + 5 * live) * DEG, yaw = (p.face + Math.sin(time * 0.6 + p.ph) * (4 + 10 * live)) * DEG;
        const s = p.s * (0.2 + 0.8 * p.here);
        P[0] = p.pos[0]; P[1] = p.pos[1] + hop - p.sit * 0.2 * s; P[2] = p.pos[2];
        quat.fromEuler(Q, 0, yaw, sw); S3[0] = S3[1] = S3[2] = s;
        m4.fromTRS(Mx, P, Q, S3); const o = k * 20;
        bd.set(Mx, o); hd.set(Mx, o);
        bd[o + 16] = p.col[0]; bd[o + 17] = p.col[1]; bd[o + 18] = p.col[2]; bd[o + 19] = 1;
        hd[o + 16] = p.skin[0]; hd[o + 17] = p.skin[1]; hd[o + 18] = p.skin[2]; hd[o + 19] = 1; k++;
      }
      for (const n of c.nodes) { n.instances.count = k; n.instances.dirty = true; n.visible = k > 0; }
    },
  };
  return c;
}

/**
 * Loose sheets of paper, one instanced draw, placed by time alone (so a time jump costs nothing and nothing allocates).
 *   mode 'fall': they come down through the box, swaying, and start again at the top
 *        'blow': they tumble along the ground in +X (wind), hopping, and wrap round
 *        'lie':  they lie where they fell, in drifts (static; `lift` raises a few as if a draught caught them)
 *   box  [x0, x1, y0, y1, z0, z1]
 */
export function papers({ count = 16, box: b, mode = 'fall', material: mat, seed = 1, size = 0.17, colors = [TL.paper, TL.parchment, '#eaf0ff'], speed = 1, keepOut = null }) {
  const r = R(seed), n = new Node('papers', { mesh: quad(1, 1.35), material: mat });
  n.castShadow = false; n.instances = makeInstances(count); n.instances.count = count;
  const cols = colors.map((c) => rgb(c));
  const list = [];
  for (let i = 0; i < count; i++) {
    let x = b[0] + r() * (b[1] - b[0]), z = b[4] + r() * (b[5] - b[4]);
    if (keepOut) for (let k = 0; k < 8 && keepOut(x, z); k++) { x = b[0] + r() * (b[1] - b[0]); z = b[4] + r() * (b[5] - b[4]); }
    list.push({ x, z, ph: r() * 6.283, v: 0.6 + r() * 0.8, s: size * (0.7 + r() * 0.6), col: cols[i % cols.length], a: r() * 360 });
  }
  const Q = quat.create(), S3 = [1, 1, 1], Mx = m4.create(), P = [0, 0, 0], H = b[3] - b[2], W = b[1] - b[0];
  function update(time) {
    const d = n.instances.data;
    for (let i = 0; i < count; i++) {
      const p = list[i], o = i * 20;
      if (mode === 'fall') {
        const u = ((time * 0.34 * p.v * speed + p.ph) % 6.283) / 6.283;
        P[0] = p.x + Math.sin(time * 1.3 * p.v + p.ph) * 0.35; P[1] = b[3] - u * H; P[2] = p.z + Math.cos(time * 0.9 * p.v + p.ph * 2) * 0.2;
        quat.fromEuler(Q, time * 1.7 * p.v + p.ph, time * 0.8 + p.ph, Math.sin(time * 2.1 * p.v + p.ph) * 0.9);
      } else if (mode === 'blow') {
        const u = (time * 0.5 * p.v * speed + p.ph * 3) % W, hop = Math.abs(Math.sin(time * 1.6 * p.v + p.ph));
        P[0] = b[0] + ((p.x - b[0] + u) % W); P[1] = b[2] + 0.04 + hop * hop * 0.5 * (b[3] - b[2]); P[2] = p.z + Math.sin(time * 0.5 + p.ph) * 0.3;
        quat.fromEuler(Q, -1.5708 + hop * 1.4 * Math.sin(time * 3 * p.v + p.ph), p.a * DEG + time * 0.9 * p.v, hop * 0.8);
      } else {
        const lift = Math.max(0, Math.sin(time * 0.7 * p.v + p.ph) - 0.93) * 4;
        P[0] = p.x; P[1] = b[2] + 0.012 + (i % 5) * 0.004 + lift * 0.25; P[2] = p.z;
        quat.fromEuler(Q, -1.5708 + lift * 0.9, p.a * DEG, 0);
      }
      S3[0] = S3[1] = S3[2] = p.s; m4.fromTRS(Mx, P, Q, S3); d.set(Mx, o);
      d[o + 16] = p.col[0]; d[o + 17] = p.col[1]; d[o + 18] = p.col[2]; d[o + 19] = 1;
    }
    n.instances.dirty = true;
  }
  update(0);
  return { node: n, update };
}

/** Rain through a box: returns step(time, dt), which spawns streaks into `sprites`. rate = streaks a second. */
export function rain(sprites, b, { rate = 60, color = '#cfe0ff', len = 0.5, speed = 9, slant = 1.2, alpha = 0.7 } = {}) {
  const rnd = rng(4411), P = [0, 0, 0], V = [slant, -speed, 0]; let owed = 0;
  return function step(time, dt) {
    owed += rate * dt;
    while (owed >= 1) {
      owed -= 1; P[0] = b[0] + rnd() * (b[1] - b[0]); P[1] = b[3]; P[2] = b[4] + rnd() * (b[5] - b[4]);
      sprites.spawn({ kind: 'dot', pos: P, vel: V, size: len, aspect: 0.045, rot: slant / speed, life: (b[3] - b[2]) / speed, color, alpha });
    }
  };
}

// ------------------------------------------------------------------------------------ outdoors

/**
 * A tall, narrow Tallis merchant's house. Origin: the middle of its foot; the gabled front faces +Z.
 *   gable 'step' | 'point' | 'bell';  floors x cols windows on the front, `lit` the chance one is lit
 *   shut  0..1 chance a window is shuttered instead (a house that has read the news)
 *   dark  the colour of an unlit pane (pale sky by day, deep blue at night)
 *   door  true | 'bolted' (a bar across it) | false;  awning: colour or null
 * anchors: windows (centres of the lit ones), top, door
 */
export function gableHouse({ w = 2.6, h = 5, d = 2.6, floors = 3, cols = 2, wall = TL.cream, roof = TL.copper, trim = TL.slateDark, gable = 'step', lit = 0.5, shut = 0, shutter = TL.teal, door = true, awning = null, seed = 1, lean = 0.02, bulge = 0.05, glow = 0.9, dark = TL.glassOff } = {}) {
  const r = R(seed), parts = [], hw = w / 2, wins = [];
  parts.push(bx(w, h, d, 0, h / 2, 0, wall));
  const gh = w * (gable === 'point' ? 0.62 : 0.72);
  let outline;
  if (gable === 'step') { const n = 3, sw = hw / (n + 0.5), sh = gh / (n + 0.4); outline = [[-hw, 0]]; for (let i = 0; i < n; i++) { outline.push([-hw + i * sw, (i + 1) * sh], [-hw + (i + 1) * sw, (i + 1) * sh]); } outline.push([-sw * 0.5, gh], [sw * 0.5, gh]); for (let i = n - 1; i >= 0; i--) { outline.push([hw - (i + 1) * sw, (i + 1) * sh], [hw - i * sw, (i + 1) * sh]); } outline.push([hw, 0]); }
  else if (gable === 'bell') { outline = [[-hw, 0]]; for (let i = 0; i <= 8; i++) { const t = i / 8, x = -hw + t * w, u = Math.abs(t - 0.5) * 2; outline.push([x * (0.98 - 0.1 * Math.sin(t * Math.PI)), gh * (1 - u * u) * (0.75 + 0.25 * Math.cos(u * Math.PI))]); } outline.push([hw, 0]); }
  else outline = [[-hw, 0], [0, gh], [hw, 0]];
  parts.push(tint(place(extrude(outline, 0.24, { crease: 30 }), 0, h, d / 2 - 0.1), wall));                                   // the front gable, in the wall's colour
  parts.push(tint(place(extrude([[-hw * 0.96, 0], [0, gh * 0.86], [hw * 0.96, 0]], d - 0.3, { crease: 30 }), 0, h, -0.14), roof)); // the roof behind it
  parts.push(bx(w + 0.16, 0.14, 0.2, 0, h - 0.02, d / 2 + 0.02, trim));
  parts.push(bx(w + 0.1, 0.34, d + 0.1, 0, 0.17, 0, PAL.stone2));
  const fh = (h - 1.0) / floors, ww = Math.min(0.62, (w - 0.5) / cols - 0.22), wh = fh * 0.56;
  for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
    if (f === 0 && door && cols % 2 === 1 && c === (cols - 1) / 2) continue;
    const x = (c - (cols - 1) / 2) * (w - 0.5) / cols * 1.0, y = 0.95 + f * fh + fh * 0.5, shutIt = r() < shut, on = !shutIt && r() < lit;
    parts.push(bx(ww + 0.14, wh + 0.14, 0.08, x, y, d / 2 + 0.03, trim));
    if (shutIt) parts.push(bx(ww, wh, 0.06, x, y, d / 2 + 0.07, shutter));
    else { parts.push(setGlow(bx(ww, wh, 0.05, x, y, d / 2 + 0.06, on ? TL.glass : dark), on ? glow : 0.12)); if (on) wins.push([x, y, d / 2 + 0.1]); parts.push(bx(ww + 0.2, 0.07, 0.16, x, y - wh / 2 - 0.07, d / 2 + 0.07, wall)); }
  }
  // a round window in the gable
  parts.push(tint(place(cylinder(0.26, 0.26, 0.08, 8), 0, h + gh * 0.36, d / 2 + 0.03, 90, 0, 0), trim), setGlow(tint(place(cylinder(0.19, 0.19, 0.05, 8), 0, h + gh * 0.36, d / 2 + 0.08, 90, 0, 0), lit > 0.3 ? TL.glass : dark), lit > 0.3 ? glow * 0.7 : 0.1));
  const dx = cols % 2 === 1 ? 0 : (r() > 0.5 ? 1 : -1) * w * 0.22;
  if (door) {
    parts.push(bx(0.74, 1.24, 0.1, dx, 0.96, d / 2 + 0.03, trim), bx(0.58, 1.1, 0.08, dx, 0.9, d / 2 + 0.07, door === 'bolted' ? TL.brassDark : shutter));
    if (door === 'bolted') parts.push(bx(0.86, 0.1, 0.1, dx, 0.95, d / 2 + 0.13, TL.navy));
  }
  if (awning) for (let i = 0; i < 4; i++) parts.push(bx((w * 0.86) / 4, 0.05, 0.6, (i - 1.5) * (w * 0.86) / 4, 1.78, d / 2 + 0.3, i % 2 ? TL.cream : awning, 24, 0, 0));
  const m = merge(parts);
  m.anchors = { windows: wins, top: [0, h + gh, 0], door: [dx, 0, d / 2 + 0.2] };
  return wonk(m, { lean: (r() - 0.5) * 2 * lean, bulge, crease: 30 });
}

/** A porch column: stands on the origin, `h` tall. A fat drum base, a shaft that swells in the middle, a brass band, a square cap. */
export function fatColumn({ h = 4.6, r = 0.34, color = TL.stone, band = TL.brass, base = TL.stone2, seg = 9 } = {}) {
  const shaft = lathe([[0, 0.3], [r * 1.02, 0.3], [r * 1.1, h * 0.36], [r * 0.98, h * 0.7], [r * 0.84, h - 0.36], [0, h - 0.36]], seg, { crease: 50 });
  return merge(
    tint(lathe([[0, 0], [r * 1.5, 0], [r * 1.5, 0.14], [r * 1.22, 0.2], [r * 1.26, 0.3], [0, 0.3]], seg, { crease: 50 }), base),
    tint(shaft, color),
    tint(place(cylinder(r * 0.98, r * 0.98, 0.1, seg), 0, h - 0.46, 0), band),
    rb(r * 2.9, 0.24, r * 2.9, 0.05, 0, h - 0.2, 0, color),
    tint(place(cylinder(r * 0.9, r * 1.3, 0.14, seg), 0, h - 0.36, 0), base));
}

/** The opening bell. { yoke, bell }: put both at the same point (the pivot); the bell hangs below it and swings about it. anchors on bell: mouth */
export function bell({ r = 0.42, metal = TL.brass, dark = TL.brassDark, wood = TL.woodDark } = {}) {
  const h = r * 1.5, drop = 0.3;
  const body = lathe([[0, -drop], [r * 0.3, -drop], [r * 0.46, -drop - h * 0.2], [r * 0.56, -drop - h * 0.62], [r * 0.82, -drop - h * 0.9], [r, -drop - h], [r * 0.9, -drop - h], [0, -drop - h * 0.8]], 10, { crease: 60 });
  const b = merge(tint(body, metal), tint(place(cylinder(r * 0.6, r * 0.6, 0.05, 10), 0, -drop - h * 0.63, 0), dark), tint(place(sphere(r * 0.2, 6, 4), 0, -drop - h * 1.02, 0), dark), bx(0.1, drop + 0.05, 0.1, 0, -drop / 2, 0, dark));
  const yoke = merge(rb(r * 2.6, 0.2, 0.24, 0.05, 0, 0.02, 0, wood), bx(0.1, 0.5, 0.1, -r * 1.2, 0.3, 0, dark), bx(0.1, 0.5, 0.1, r * 1.2, 0.3, 0, dark));
  return { yoke, bell: keep(b, { mouth: [0, -drop - h, 0] }) };
}

/** A square glass lantern, origin at its top ring. anchors: lamp (the middle of the glass) */
export function lantern({ s = 1, lit = true, metal = TL.iron, glass = '#ffe9a8', glow = 0.95 } = {}) {
  const m = merge(
    tint(place(torus(0.05, 0.014, 6, 4), 0, -0.02, 0), metal),
    tint(place(cylinder(0.17, 0.05, 0.1, 4), 0, -0.16, 0, 0, 45, 0), metal),
    setGlow(tint(place(cylinder(0.11, 0.15, 0.26, 4), 0, -0.42, 0, 0, 45, 0), lit ? glass : TL.glassOff), lit ? glow : 0.1),
    tint(place(cylinder(0.14, 0.1, 0.06, 4), 0, -0.48, 0, 0, 45, 0), metal));
  return keep(scaleMesh(m, s), { lamp: [0, -0.3 * s, 0] });
}

/** A rail along X, centred on the origin, standing on y = 0: thin posts, a low bar, a fat brass top. */
export function ironRail({ len = 3, h = 0.66, bay = 0.6, post = TL.iron, top = TL.brass, knobs = true } = {}) {
  const parts = [], n = Math.max(1, Math.round(len / bay));
  for (let i = 0; i <= n; i++) { const x = -len / 2 + (len * i) / n, end = i === 0 || i === n; parts.push(tint(place(cylinder(end ? 0.05 : 0.028, end ? 0.045 : 0.028, h, end ? 6 : 4), x, 0, 0), post)); if (end && knobs) parts.push(tint(place(sphere(0.085, 6, 4), x, h + 0.07, 0), top)); }
  parts.push(rb(len, 0.085, 0.11, 0.03, 0, h, 0, top), bx(len, 0.04, 0.04, 0, h * 0.38, 0, post));
  return merge(parts);
}

/** A floor of big slabs, top at y = 0, centred on the origin: one flat mesh in a few tones, joints left dark. */
export function paving({ w = 12, d = 8, nx = 8, nz = 5, colors = [TL.stone, TL.stone2, '#f0dcb8'], seed = 1, gap = 0.035, grout = '#d2b890' } = {}) {
  const r = R(seed), parts = [tint(place(quad(w, d), 0, -0.004, 0, -90, 0, 0), grout)], cw = w / nx, cd = d / nz;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const off = j % 2 ? cw / 2 : 0, x = -w / 2 + cw * (i + 0.5) + off;
    if (x + cw / 2 > w / 2 + 0.01) { parts.push(tint(place(quad(cw / 2 - gap, cd - gap), -w / 2 + cw / 4, 0, -d / 2 + cd * (j + 0.5), -90, 0, 0), colors[Math.floor(r() * colors.length)])); parts.push(tint(place(quad(cw / 2 - gap, cd - gap), w / 2 - cw / 4, 0, -d / 2 + cd * (j + 0.5), -90, 0, 0), colors[Math.floor(r() * colors.length)])); continue; }
    parts.push(tint(place(quad(cw - gap, cd - gap), x, 0, -d / 2 + cd * (j + 0.5), -90, 0, 0), colors[Math.floor(r() * colors.length)]));
  }
  return merge(parts);
}

/** The Commons' sign: two linked rings hung from an iron bracket that reaches toward +X from a wall at the origin. anchors: rings */
export function ringsSign({ reach = 1.5, r = 0.34, colors = [TL.copper, PAL.coral], iron = TL.iron } = {}) {
  const arm = tint(tube(curve([[0, 0, 0], [reach * 0.5, 0.16, 0], [reach, 0.02, 0]], 6), 0.04, 5, { crease: 180 }), iron);
  const brace = tint(tube([[0, -0.5, 0], [reach * 0.45, 0.08, 0]], 0.028, 4), iron);
  const cx = reach * 0.72, cy = -0.2 - r;
  return keep(merge(arm, brace, bx(0.03, 0.24, 0.03, cx, -0.1, 0, iron),
    tint(place(torus(r, 0.07, 12, 5), cx - r * 0.55, cy, 0.03, 90, 0, 0), colors[0]), tint(place(torus(r, 0.07, 12, 5), cx + r * 0.55, cy, -0.03, 90, 0, 0), colors[1])), { rings: [cx, cy, 0] });
}

// ------------------------------------------------------------------------------------ indoors: the exchange

/**
 * The board. Origin: bottom centre, facing +Z. A slate in a fat brass-cornered frame with `rows` chalked lines: a name
 * tick, a price bar and an up or down arrow each. anchors: rows [[x, y, z] of each row's arrow], top
 */
export function priceBoard({ w = 4.4, h = 2.6, rows = 6, frame = TL.woodDark, slate = TL.board, seed = 1, title = TL.brass } = {}) {
  const r = R(seed), parts = [rb(w + 0.3, h + 0.3, 0.16, 0.06, 0, h / 2, -0.08, frame), bx(w, h, 0.04, 0, h / 2, 0.01, slate)], at = [];
  for (const sx of [-1, 1]) for (const sy of [0, 1]) parts.push(tint(place(sphere(0.11, 6, 4), sx * (w / 2 + 0.06), sy * h + (sy ? 0.06 : -0.06) + 0, 0.02), title));
  parts.push(bx(w * 0.34, 0.2, 0.05, 0, h + 0.3, 0, title), bx(w * 0.42, 0.1, 0.04, 0, h + 0.12, 0, frame));
  const rh = (h - 0.3) / rows;
  for (let i = 0; i < rows; i++) {
    const y = h - 0.2 - rh * (i + 0.5) + 0.05, up = r() > 0.5, bw = w * (0.16 + r() * 0.26);
    parts.push(bx(w * 0.2 - r() * 0.2, 0.09, 0.02, -w * 0.34, y, 0.04, TL.chalk));                                    // the name
    parts.push(bx(bw, 0.13, 0.02, -w * 0.16 + bw / 2, y, 0.04, up ? '#8ef0c8' : '#ff9a8a'));                           // the price
    parts.push(tint(place(cylinder(0.11, 0, 0.18, 3), w * 0.4, y - (up ? 0.09 : -0.09), 0.05, up ? 0 : 180, 0, 0), up ? '#8ef0c8' : '#ff7a6a'));
    parts.push(bx(w * 0.9, 0.02, 0.02, 0, y - rh / 2, 0.035, '#6878c8'));
    at.push([w * 0.4, y, 0.06]);
  }
  return keep(merge(parts), { rows: at, top: [0, h + 0.4, 0] });
}

/**
 * A trading pit, centred on the origin: `sides` low wedges round a sunk middle, with a brass rail on the outer rim
 * (open at the side given by `gate` degrees). Floor of the pit at y = 0; the rim is `rise` high.
 */
export function pit({ r = 1.9, sides = 8, rise = 0.34, color = TL.woodPale, dark = TL.wood, floor = TL.plum, rail = TL.brass, gate = 0 } = {}) {
  const parts = [tint(place(cylinder(r * 0.62, r * 0.62, 0.03, sides), 0, 0, 0, 0, 180 / sides, 0), floor)];
  parts.push(tint(place(lathe([[r * 0.62, 0], [r * 0.62, rise * 0.5], [r * 0.82, rise * 0.5], [r * 0.82, rise], [r, rise], [r, 0]], sides, { crease: 20 }), 0, 0, 0, 0, 180 / sides, 0), color));
  for (let i = 0; i < sides; i++) {
    const a = (i + 0.5) / sides * 360, a0 = (i / sides) * 6.283, ga = ((a - gate + 540) % 360) - 180;
    const px = Math.sin(a0) * r * 0.94, pz = Math.cos(a0) * r * 0.94;
    parts.push(tint(place(cylinder(0.04, 0.04, 0.5, 5), px, rise, pz), TL.iron), tint(place(sphere(0.07, 5, 3), px, rise + 0.54, pz), rail));
    if (Math.abs(ga) < 180 / sides) continue; // the way in
    const seg = 2 * r * 0.94 * Math.sin(Math.PI / sides);
    parts.push(tint(place(box(seg, 0.07, 0.07), Math.sin(a * DEG) * r * 0.94 * Math.cos(Math.PI / sides), rise + 0.5, Math.cos(a * DEG) * r * 0.94 * Math.cos(Math.PI / sides), 0, a + 90 - 90, 0), rail));
  }
  parts.push(tint(place(cylinder(r * 0.2, r * 0.2, 0.035, sides), 0, 0.012, 0), dark));
  return merge(parts);
}

/** A pit's standard: a pole with a swallow-tailed flag, so a runner can find the pit from across the floor. anchors: top */
export function standard({ h = 3.2, color = PAL.coral, device = TL.cream, pole = TL.brassDark, side = 1 } = {}) {
  const fw = 0.9, fh = 0.62;
  return keep(merge(
    tint(place(cylinder(0.04, 0.05, h, 5), 0, 0, 0), pole), tint(place(sphere(0.09, 6, 4), 0, h + 0.05, 0), TL.brass),
    tint(place(cylinder(0.16, 0.2, 0.12, 6), 0, 0, 0), TL.iron),
    tint(place(extrude([[0, 0], [fw, 0.04], [fw * 0.72, fh / 2], [fw, fh - 0.04], [0, fh]], 0.03, { crease: 30 }), side > 0 ? 0.04 : -0.04, h - fh - 0.08, 0, 0, side > 0 ? 0 : 180, 0), color),
    tint(place(cylinder(0.14, 0.14, 0.04, 8), side * 0.36, h - fh / 2 - 0.08, 0, 90, 0, 0), device)), { top: [0, h, 0] });
}

// ------------------------------------------------------------------------------------ indoors: the Chancellor's model

/**
 * All of Aurelle on a table: a round slate sea in a brass rim on a turned leg, and forty islands on brass stems.
 * Returns { table (mesh: sea, rim, leg, stems, islands, lane wires), lamp (one small lamp mesh for instancing),
 *           spots [[x, y, z]] (where each of the forty lamps sits, table space), capital (index of the big middle one) }.
 * `dark` is the set of indices that have no lanes (wires run only between lit neighbours).
 */
export function islandTable({ r = 1.45, h = 0.92, n = 40, seed = 7, dark = [], sea = '#3a56c8', sea2 = '#5a7ce8', metal = TL.brass, wood = TL.wine } = {}) {
  const rr = R(seed), parts = [], spots = [], isDark = new Set(dark);
  parts.push(tint(lathe([[0, 0], [r * 0.5, 0], [r * 0.5, 0.08], [0.18, 0.2], [0.14, h * 0.5], [0.26, h - 0.2], [r * 0.9, h - 0.08], [r * 0.9, h - 0.07], [0, h - 0.07]], 10, { crease: 40 }), wood));
  parts.push(tint(place(cylinder(r, r, 0.06, 20), 0, h - 0.07, 0), sea));
  parts.push(tint(place(cylinder(r * 0.6, r * 0.6, 0.012, 14), r * 0.08, h - 0.005, -r * 0.05), sea2));
  parts.push(tint(place(torus(r, 0.07, 20, 5), 0, h - 0.02, 0), metal));
  // forty islands in three rough rings and a capital in the middle
  for (let i = 0; i < n; i++) {
    let x, z;
    if (i === 0) { x = 0; z = 0; }
    else { const ring = i < 8 ? 0 : i < 21 ? 1 : 2, k = ring === 0 ? i - 1 : ring === 1 ? i - 8 : i - 21, cnt = [7, 13, 19][ring], rad = r * [0.3, 0.57, 0.83][ring] * (0.94 + rr() * 0.1), a = (k + rr() * 0.5) / cnt * 6.283 + ring * 0.4; x = Math.cos(a) * rad; z = Math.sin(a) * rad; }
    const sh = (i === 0 ? 0.34 : 0.12 + rr() * 0.16), s = i === 0 ? 0.16 : 0.07 + rr() * 0.04;
    parts.push(tint(place(ellipsoid(s * 1.5, s * 0.6, s * 1.3, 6, 3), x, h + 0.02, z, 0, rr() * 180, 0), i % 3 ? '#8fe46c' : '#f8e3a3'));
    parts.push(tint(place(cylinder(0.014, 0.014, sh, 4, { caps: false }), x, h + 0.03, z), metal));
    spots.push([x, h + 0.03 + sh, z]);
  }
  // lanes: a wire from each lit island to its nearest lit neighbour nearer the middle
  for (let i = 1; i < n; i++) {
    if (isDark.has(i)) continue;
    let best = 0, bd = 1e9; const p = spots[i], pr = Math.hypot(p[0], p[2]);
    for (let j = 0; j < n; j++) { if (j === i || isDark.has(j)) continue; const q = spots[j]; if (Math.hypot(q[0], q[2]) >= pr) continue; const dd = Math.hypot(p[0] - q[0], p[2] - q[2]); if (dd < bd) { bd = dd; best = j; } }
    const q = spots[best], mid = [(p[0] + q[0]) / 2, Math.min(p[1], q[1]) - 0.03, (p[2] + q[2]) / 2];
    parts.push(setOutline(tint(tube([p, mid, q], 0.007, 3, { caps: false }), '#ffe9a8'), 0));
  }
  const lamp = merge(tint(place(cylinder(0.03, 0.022, 0.03, 5), 0, 0, 0), '#b8c0d8'), setGlow(tint(place(sphere(0.042, 6, 4), 0, 0.06, 0), '#ffffff'), 1));
  return { table: merge(parts), lamp, spots, capital: 0 };
}

/** A long-case clock, standing on the origin, face toward +Z. anchors: pendulum (its pivot), face */
export function longClock({ h = 2.7, w = 0.62, color = TL.wine, trim = TL.brass, face = TL.parchment } = {}) {
  const m = merge(
    rb(w + 0.14, 0.36, 0.44, 0.04, 0, 0.18, 0, color), rb(w - 0.06, h - 1.2, 0.32, 0.03, 0, 0.36 + (h - 1.2) / 2, 0, color),
    setGlow(bx(w - 0.26, h - 1.5, 0.03, 0, 0.36 + (h - 1.2) / 2, 0.16, '#3a2a6e'), 0.1),
    rb(w + 0.16, 0.8, 0.42, 0.05, 0, h - 0.45, 0, color), tint(place(cylinder(0.27, 0.27, 0.05, 12), 0, h - 0.45, 0.2, 90, 0, 0), trim), setGlow(tint(place(cylinder(0.22, 0.22, 0.05, 12), 0, h - 0.45, 0.215, 90, 0, 0), face), 0.35),
    bx(0.03, 0.15, 0.02, 0, h - 0.39, 0.25, TL.navy), bx(0.03, 0.11, 0.02, 0.045, h - 0.45, 0.25, TL.navy, 0, 0, -70),
    tint(place(extrude([[-w / 2 - 0.1, 0], [0, 0.26], [w / 2 + 0.1, 0]], 0.42, { crease: 30 }), 0, h - 0.06, 0), color), tint(place(sphere(0.07, 6, 4), 0, h + 0.24, 0), trim));
  return keep(wonk(m, { lean: 0.02, crease: 30 }), { pendulum: [0, h - 0.95, 0.2], face: [0, h - 0.45, 0.24] });
}
/** The pendulum for longClock: a rod and a brass bob hanging from the origin. */
export const pendulum = ({ len = 0.95, metal = TL.brass } = {}) => merge(bx(0.02, len, 0.012, 0, -len / 2, 0, metal), tint(place(cylinder(0.1, 0.1, 0.03, 10), 0, -len, 0, 90, 0, 0), metal));

// ------------------------------------------------------------------------------------ indoors: the clearing house

/** A round strongroom door in a square steel frame, facing +Z, standing on y = 0. { frame, wheel }; anchors on frame: hub */
export function vaultDoor({ r = 1.15, steel = '#8fe0d8', dark = TL.navy, metal = TL.brass, face = '#c8f4ec' } = {}) {
  const cy = r + 0.3, parts = [rb(r * 2 + 0.7, r * 2 + 0.6, 0.3, 0.08, 0, cy, -0.15, dark)];
  parts.push(tint(place(cylinder(r, r * 0.96, 0.22, 16), 0, cy, 0.0, 90, 0, 0), steel), tint(place(cylinder(r * 0.78, r * 0.74, 0.1, 16), 0, cy, 0.2, 90, 0, 0), face));
  for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; parts.push(tint(place(sphere(0.09, 6, 4), Math.cos(a) * r * 0.88, cy + Math.sin(a) * r * 0.88, 0.2), metal)); }
  for (const sy of [-1, 1]) parts.push(rb(0.3, 0.22, 0.2, 0.04, -r - 0.12, cy + sy * r * 0.5, 0.12, metal));
  const spokes = [tint(place(torus(r * 0.36, 0.045, 12, 5), 0, 0, 0, 90, 0, 0), metal), tint(place(cylinder(0.11, 0.11, 0.16, 8), 0, 0, -0.04, 90, 0, 0), metal)];
  for (let i = 0; i < 3; i++) spokes.push(tint(place(box(r * 0.72, 0.055, 0.055), 0, 0, 0, 0, 0, i * 60), metal));
  return { frame: keep(merge(parts), { hub: [0, cy, 0.3] }), wheel: merge(spokes) };
}

/**
 * The tube wall. Origin: bottom centre, facing +Z. `n` brass pipes rise from a counter-high manifold to `h` and bend
 * back into the wall; each has a hatch with a little lamp (green: ready). anchors: hatches [[x, y, z]], tops [[x, y, z]]
 */
export function tubeWall({ w = 4.2, h = 4.2, n = 7, metal = TL.brass, dark = TL.brassDark, base = TL.tealDark, lamp = '#8ef0c8', seed = 1 } = {}) {
  const r = R(seed), parts = [rb(w + 0.3, 1.0, 0.6, 0.06, 0, 0.5, 0.2, base), bx(w + 0.4, 0.08, 0.7, 0, 1.03, 0.2, TL.woodPale)], hatches = [], tops = [];
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + w * (i + 0.5) / n, top = h - 0.5 - (i % 2) * 0.35 - r() * 0.2, rad = 0.1;
    parts.push(tint(tube([[x, 1.05, 0.2], [x, top, 0.2], [x + 0.04, top + 0.3, 0.05], [x + 0.04, top + 0.36, -0.2]], rad, 6, { crease: 180 }), metal));
    for (const y of [1.9, top - 0.4]) parts.push(tint(place(cylinder(rad + 0.03, rad + 0.03, 0.07, 6), x, y, 0.2), dark));
    parts.push(rb(0.3, 0.36, 0.24, 0.04, x, 1.36, 0.3, dark), bx(0.2, 0.22, 0.03, x, 1.36, 0.43, '#3a2a6e'), setGlow(tint(place(sphere(0.04, 5, 3), x + 0.11, 1.6, 0.4), i % 3 === 1 ? '#ffd24a' : lamp), 0.9));
    hatches.push([x, 1.36, 0.45]); tops.push([x, top, 0.2]);
  }
  return keep(merge(parts), { hatches, tops });
}

/** The brass carrier: a capsule about 0.34 long lying along X, felt at both ends. `open`: its lid stands up. */
export function carrier({ metal = TL.brass, felt = PAL.red, open = false } = {}) {
  const parts = [tint(place(cylinder(0.075, 0.075, 0.26, 8), -0.13, 0.08, 0, 0, 0, -90), metal)];
  for (const sx of [-1, 1]) parts.push(tint(place(cylinder(0.088, 0.088, 0.045, 8), sx * 0.15 - 0.022, 0.08, 0, 0, 0, -90), felt));
  if (open) parts.push(tint(place(cylinder(0.08, 0.08, 0.02, 8), 0.2, 0.17, 0, 0, 0, -30), metal));
  return merge(parts);
}

/** A wall of pigeonholes, bottom centre at the origin, facing +Z, with sheets in most of them. */
export function pigeonholes({ w = 3, h = 2.2, cols = 6, rows = 4, d = 0.36, color = TL.woodDark, back = TL.navy, seed = 1, fill = 0.75 } = {}) {
  const r = R(seed), parts = [bx(w, h, 0.05, 0, h / 2, -d / 2, back)], cw = w / cols, ch = h / rows;
  for (let i = 0; i <= cols; i++) parts.push(bx(0.06, h, d, -w / 2 + i * cw, h / 2, 0, color));
  for (let j = 0; j <= rows; j++) parts.push(bx(w + 0.06, 0.06, d + 0.02, 0, j * ch, 0, color));
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) if (r() < fill) {
    const x = -w / 2 + (i + 0.5) * cw, y = j * ch + 0.04, n = 1 + Math.floor(r() * 3);
    parts.push(bx(cw * 0.7, 0.05 * n, d * 0.8, x + (r() - 0.5) * 0.04, y + 0.025 * n, 0.03, [TL.paper, TL.parchment, '#dfe8ff', '#ffd9c8'][Math.floor(r() * 4)], 0, (r() - 0.5) * 14, 0));
  }
  return merge(parts);
}

// ------------------------------------------------------------------------------------ indoors: the cell

/** A narrow bed against a wall: head toward -X, lying along X. A blanket in a good colour, because he is a person of standing. */
export function cot({ len = 1.9, w = 0.8, frame = TL.iron, blanket = TL.royal, sheet = TL.paper } = {}) {
  const parts = [rb(len, 0.14, w, 0.04, 0, 0.42, 0, sheet), rb(len * 0.62, 0.17, w + 0.04, 0.05, len * 0.19, 0.44, 0, blanket), rb(0.4, 0.14, w * 0.7, 0.06, -len / 2 + 0.26, 0.54, 0, sheet), bx(len * 0.62, 0.03, w + 0.05, len * 0.19, 0.535, 0, TL.brass)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(tint(place(cylinder(0.035, 0.035, sx < 0 ? 0.9 : 0.6, 5), sx * (len / 2 - 0.03), 0, sz * (w / 2 - 0.03)), frame));
  parts.push(bx(0.04, 0.05, w, -len / 2 + 0.03, 0.86, 0, frame), bx(0.04, 0.05, w, len / 2 - 0.03, 0.57, 0, frame), bx(len, 0.06, 0.04, 0, 0.33, w / 2 - 0.03, frame), bx(len, 0.06, 0.04, 0, 0.33, -w / 2 + 0.03, frame));
  return merge(parts);
}

/** A washstand: a three-legged stand, a basin and a jug. */
export function washstand({ wood = TL.woodDark, china = TL.paper, band = TL.royal } = {}) {
  const parts = [tint(place(cylinder(0.3, 0.3, 0.05, 8), 0, 0.72, 0), wood)];
  for (let i = 0; i < 3; i++) { const a = i / 3 * 6.283; parts.push(tint(tube([[Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3], [Math.cos(a) * 0.12, 0.4, Math.sin(a) * 0.12], [Math.cos(a) * 0.24, 0.72, Math.sin(a) * 0.24]], 0.025, 4), wood)); }
  parts.push(tint(place(lathe([[0, 0], [0.12, 0], [0.24, 0.12], [0.22, 0.12], [0.1, 0.03], [0, 0.03]], 8, { crease: 60 }), 0, 0.77, 0), china), tint(place(torus(0.235, 0.014, 8, 3), 0, 0.89, 0), band));
  parts.push(tint(place(lathe([[0, 0], [0.07, 0], [0.1, 0.1], [0.05, 0.22], [0.07, 0.28], [0, 0.28]], 6, { crease: 60 }), 0.2, 0.77, 0.1), china));
  return merge(parts);
}

/** A peg with a greatcoat on it, flat against a wall at the origin, facing +Z; the peg is at y = 0 and the coat hangs below. */
export function coatPeg({ coat = TL.navy, lining = TL.wine, metal = TL.brass, len = 1.15 } = {}) {
  const body = deform(roundedBox(0.56, len, 0.16, 0.07, 1), (p) => { const t = (0.5 - p[1] / len); p[0] *= 0.78 + 0.34 * t; p[2] += 0.04 * Math.sin(p[0] * 9) * t; }, 50);
  return merge(tint(place(cylinder(0.03, 0.03, 0.16, 5), 0, 0, 0.08, 90, 0, 0), metal), tint(place(sphere(0.045, 5, 3), 0, 0, 0.17), metal),
    tint(place(body, 0, -len / 2 - 0.02, 0.12), coat), tint(place(roundedBox(0.36, 0.14, 0.2, 0.05, 1), 0, -0.07, 0.12), coat),
    bx(0.07, len * 0.8, 0.02, 0.02, -len * 0.5, 0.21, lining), tint(place(sphere(0.03, 5, 3), -0.08, -len * 0.3, 0.21), metal), tint(place(sphere(0.03, 5, 3), -0.08, -len * 0.5, 0.215), metal));
}

/** Bars for a high window: a stone surround and iron bars, centred on the origin, facing +Z. The pane behind glows a little. */
export function barredWindow({ w = 1.0, h = 0.8, bars = 4, stone = TL.stoneBlue, iron = TL.navy, sky = '#5a78e8', glow = 0.7 } = {}) {
  const parts = [bx(w + 0.3, 0.16, 0.3, 0, -h / 2 - 0.08, 0.05, stone), bx(w + 0.3, 0.16, 0.3, 0, h / 2 + 0.08, 0.05, stone), bx(0.15, h, 0.3, -w / 2 - 0.075, 0, 0.05, stone), bx(0.15, h, 0.3, w / 2 + 0.075, 0, 0.05, stone)];
  parts.push(setOutline(setGlow(bx(w, h, 0.02, 0, 0, -0.12, sky), glow), 0));
  for (let i = 0; i < bars; i++) parts.push(tint(place(cylinder(0.03, 0.03, h, 5), -w / 2 + w * (i + 0.5) / bars, -h / 2, 0.0), iron));
  parts.push(bx(w, 0.05, 0.05, 0, 0, 0.0, iron));
  return merge(parts);
}

/** A cell door: heavy planks, iron straps, and a barred grille at face height with somebody's lantern beyond it. anchors: grille, lock */
export function cellDoor({ w = 1.15, h = 2.2, wood = TL.woodDark, iron = TL.navy, frame = TL.stoneBlue, glow = 0.85, light = '#ffc060' } = {}) {
  const parts = [bx(w + 0.36, h + 0.2, 0.3, 0, (h + 0.2) / 2, -0.14, frame), rb(w, h, 0.14, 0.03, 0, h / 2, 0.04, wood)];
  for (let i = 1; i < 4; i++) parts.push(bx(0.02, h - 0.1, 0.02, -w / 2 + (w * i) / 4, h / 2, 0.115, '#6e3b30'));
  for (const y of [0.34, h - 0.3]) parts.push(bx(w + 0.04, 0.12, 0.03, 0, y, 0.12, iron));
  const gy = h * 0.66, gw = 0.42, gh = 0.3;
  parts.push(bx(gw + 0.1, gh + 0.1, 0.03, 0, gy, 0.115, iron), setOutline(setGlow(bx(gw, gh, 0.02, 0, gy, 0.125, light), glow), 0));
  for (let i = 0; i < 3; i++) parts.push(bx(0.03, gh, 0.03, -gw / 2 + gw * (i + 0.5) / 3, gy, 0.135, iron));
  parts.push(rb(0.16, 0.22, 0.06, 0.02, w / 2 - 0.16, h * 0.44, 0.13, iron), tint(place(torus(0.05, 0.016, 6, 4), w / 2 - 0.16, h * 0.4, 0.17), TL.brass));
  return keep(merge(parts), { grille: [0, gy, 0.14], lock: [w / 2 - 0.16, h * 0.44, 0.16] });
}

/**
 * Light slanting in through an opening, as additive cards. Origin: the centre of the opening; the light travels along
 * `dir` ([x, y, z], y negative) for `len`. `w` x `h` is the opening; `cards` slices across it. Use ch5Materials().shaft.
 */
export function shaft({ w = 1.4, h = 2.4, dir = [0.3, -1, 1], len = 5, cards = 3, color = '#ffd890', spread = 0.25 } = {}) {
  const dn = norm(dir), d = [dn[0] * len, dn[1] * len, dn[2] * len], parts = [];
  for (let i = 0; i < cards; i++) {
    const t = cards === 1 ? 0.5 : i / (cards - 1), y = (t - 0.5) * h * 0.8, k = 1 + spread;
    parts.push(fromArrays([-w / 2, y, 0, w / 2, y, 0, -w / 2 * k + d[0], y + d[1], d[2], w / 2 * k + d[0], y + d[1], d[2]], [0, 2, 3, 0, 3, 1], [0, 0, 1, 0, 0, 1, 1, 1], 180));
  }
  return setOutline(tint(merge(parts), color), 0);
}
