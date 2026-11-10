// Putting the cast on a set: the cutscene director and the live encounter stage.
//
// THE ONE CALL A FRAME (what src/shell/gl/app.js uses)
//   const troupe = createTroupe({ detail: 1 });
//   const dir = createDirector(troupe, { getSet(key, light) -> built set | null });   the caller owns the set cache
//   dir.update(dt, time, { content, game, stage: stageState(content, game), camera, rect: { x, y, w, h }, voice: { who, level } | null, hit(ev, out) });
//   if (dir.set) renderer.render(dir.set.scene, camera, time, { ...rect, ...dir.view });
//   Read back: dir.fade / fadeColor (ink over the view while the set changes), dir.sparks (energy from the table to the
//   actor, CSS px, the shape gl-shell's fx.sparks has), dir.anchors { castId: { x, y } } (head tops, CSS px), dir.sub
//   { who, onStage, x, y, radio }, dir.cues (this frame's flourishes for the HUD), dir.punch 0..1, dir.drawOverlay(ctx2d).
//   The director calls set.update(time, dt) itself.
//
// One stage object per built set owns every figure standing on it, for the fight AND the lines that follow, so the
// end of an encounter flows into its cutscene without anybody being put back on a mark: the fight controller hands
// the same actors to the line controller, who walks them to their places.
//
// A set may answer set.task(type, index, count) -> { pos, stand, set(v) } for the thing an opposition.kind 'force'
// encounter is about (see UNITS for the types); where it does not, a plain stand-in prop from UNITS is put on the strip.
//
// THE SLICE API (tools/gl-demo.html, and anything written against the first round) still works, on the same machinery:
//   createCine(set, troupe, { on }) / cine.update(dt, time, { speaker, emote, cam, camera, aspect, viewHeight })
//   createEncounter(set, troupe, { party, opposition, title }) / enc.update(dt, time, events, progress) / enc.frame(camera, aspect, time, viewHeight)
//
// Nothing here allocates per frame or per table event: scheduled steps, cues and sparks come from fixed pools.

import { DEG } from './math.js';
import { Node, makeLight } from './scene.js';
import { box, cylinder, sphere, torus, tint, place, merge } from './mesh.js';
import { createCharacter, CAST, CLIPS, POSES, figureMaterial, teamMove, mirrorPose, castVariant } from './characters.js';
import { createFaces } from './faces.js';
import { paperLantern, kitMaterials } from './sets/kit.js';
import { comboOf, pushRecent, COMBO_WEIGHT, COMBO_NAMES } from '../../core/stage.js';

export { comboOf, COMBO_WEIGHT, COMBO_NAMES };

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

// The walk: characters.js has no looping gait, so a walking figure is held alternately in 'stride' and its mirror
// while the stage moves its root. Registered once; a real 'walk' pose or clip in characters.js would replace this.
if (!POSES.strideB) POSES.strideB = mirrorPose(POSES.stride);

// The working moves of the task tableaux (MODES below). characters.js keeps POSES and CLIPS as open registries; these
// are the stage's own entries. Each clip has a clear wind-up before `impact` (0.26 to 0.3 s: the table's bolt is timed
// to land on the thing as the hand does) and a held contact after it.
const addPose = (name, p) => { if (!POSES[name]) POSES[name] = p; };
const addClip = (name, c) => { if (!CLIPS[name]) CLIPS[name] = c; };
addPose('brace', { hips: { r: [8, 0, 0], p: [0, -0.03, 0] }, chest: [8, 0, 0], head: [-6, 0, 0], armL: [-52, 0, 10], foreL: [-66, 0, 0], armR: [-52, 0, -10], foreR: [-66, 0, 0], legL: [-26, 0, 6], shinL: [30, 0, 0], legR: [18, 0, -6], shinR: [18, 0, 0] });
addPose('reachUp', { hips: { r: [-4, 0, 0], p: [0, 0.02, 0] }, chest: [-12, 0, 0], head: [-18, 0, 0], armR: [-158, 0, -8], foreR: [-10, 0, 0], armL: [-128, 0, 12], foreL: [-34, 0, 0], legL: [-4, 0, 4], legR: [6, 0, -4] });
addPose('pushBack', { hips: { r: [4, 0, 0], p: [0, -0.03, -0.04] }, chest: [2, 0, 0], head: [2, 0, 0], armL: [-40, 0, 10], foreL: [-104, 0, 0], armR: [-40, 0, -10], foreR: [-104, 0, 0], legL: [-20, 0, 4], shinL: [30, 0, 0], legR: [10, 0, -4], shinR: [20, 0, 0] });
addPose('pushHit', { hips: { r: [14, 0, 0], p: [0, -0.03, 0.06] }, chest: [16, 0, 0], head: [-14, 0, 0], armL: [-86, 0, 6], foreL: [-6, 0, 0], armR: [-86, 0, -6], foreR: [-6, 0, 0], legL: [30, 0, 4], shinL: [10, 0, 0], legR: [-36, 0, -4], shinR: [40, 0, 0] });
addPose('kneelWork', { hips: { r: [14, 0, 0], p: [0, -0.1, 0.02] }, chest: [20, 0, 0], head: [-12, 0, 0], legL: [-70, 0, 8], shinL: [100, 0, 0], legR: [-10, 0, -6], shinR: [86, 0, 0], armL: [-52, 0, 8], foreL: [-30, 0, 0], armR: [-60, 0, -8], foreR: [-24, 0, 0] });
addClip('workUp', { dur: 0.62, impact: 0.27, keys: [[0, null, 0, 0, 0], [0.14, 'crouch', 0, 0, -0.1], [0.27, 'reachUp', 0.05, 0.07, 0.1], [0.44, 'reachUp', 0.05, 0.05, 0.04], [0.62, null, 0, 0, 0]] });
addClip('workDown', { dur: 0.64, impact: 0.28, keys: [[0, null, 0, 0, 0], [0.15, 'chopUp', -0.02, 0.05, 0.08], [0.28, 'chopDown', 0.1, 0, -0.12], [0.44, 'chopDown', 0.1, 0, -0.04], [0.64, null, 0, 0, 0]] });
addClip('shove', { dur: 0.62, impact: 0.27, keys: [[0, null, 0, 0, 0], [0.14, 'pushBack', -0.06, 0, -0.06], [0.27, 'pushHit', 0.14, 0, 0.06], [0.44, 'pushHit', 0.12, 0, 0], [0.62, null, 0, 0, 0]] });
addClip('kneelTap', { dur: 0.66, impact: 0.28, keys: [[0, null, 0, 0, 0], [0.15, 'crouch', 0, 0, -0.08], [0.28, 'kneelWork', 0.06, 0, -0.05], [0.46, 'kneelWork', 0.06, 0, 0], [0.66, null, 0, 0, 0]] });
addClip('creep', { dur: 0.5, impact: 0.26, keys: [[0, null, 0, 0, 0], [0.12, 'crouch', 0, 0, -0.1], [0.26, 'stride', 0.1, 0.02, 0], [0.4, 'crouch', 0.04, 0, -0.04], [0.5, null, 0, 0, 0]] });

// rank-and-file ids whose doubles are told apart by castVariant. Named people are never varied.
const VARIED = {};
const NAMED = ['ren', 'ilse', 'nan', 'tobb', 'corvane', 'maravel', 'thorne', 'narrator', 'sable', 'hesper', 'ansel', 'wyn', 'foss', 'tamsin'];
const variedOk = (id) => NAMED.indexOf(id.split('-')[0]) < 0;

/** True when every id is a cast member that can be spawned. */
export function castReady(ids) { for (let i = 0; i < ids.length; i++) if (!CAST[ids[i]]) return false; return true; }

/**
 * One material and one face atlas shared by every figure. spawn(idOrDef) builds a new character (see characters.js);
 * take(id, n, lod) returns the troupe's one instance of that member (n tells doubles apart), built on first use.
 * standIn: { id: otherId } lets a harness run before a cast member exists. The game passes none: an unknown id throws.
 */
export function createTroupe({ detail = 1, material = null, standIn = null } = {}) {
  // the character light: figures take their terminator from a key that follows the camera (front, above, to one side),
  // so a face is never flat or lost in shadow whatever the set's sun is doing. The rim still comes from the real sun.
  const keyLight = new Float32Array([-0.4, 0.55, 0.73]);
  const figMat = material || figureMaterial({ keyLight });
  const faces = createFaces({ figure: figMat });
  const pool = new Map();
  const defOf = (id) => CAST[id] || (standIn && standIn[id] && CAST[standIn[id]]) || null;
  const troupe = {
    figMat, faces, detail, keyLight, pool,
    /** Point the character light for this camera. side: -1 light from screen left, +1 from screen right; lift: how far above. */
    aim(camera, side = -1, lift = 0.4, across = 0.45) {
      let bx = camera.position[0] - camera.target[0], bz = camera.position[2] - camera.target[2];
      const bl = Math.hypot(bx, bz) || 1; bx /= bl; bz /= bl;            // toward the camera, level
      const rx = bz, rz = -bx;                                           // screen right
      const x = bx * 0.72 + rx * across * side, y = lift, z = bz * 0.72 + rz * across * side, l = Math.hypot(x, y, z);
      keyLight[0] = x / l; keyLight[1] = y / l; keyLight[2] = z / l;
    },
    has: (id) => !!defOf(id),
    spawn(idOrDef, opts = {}) {
      const def = typeof idOrDef === 'string' ? defOf(idOrDef) : idOrDef;
      if (!def) throw new Error(`troupe: no cast member "${idOrDef}" (have ${Object.keys(CAST).join(', ')})`);
      return createCharacter(def, { faces, material: figMat, detail: opts.detail ?? detail, lod: opts.lod || 'full' });
    },
    take(id, n = 0, lod = 'full') {
      const key = id + '#' + n + ':' + lod;
      let ch = pool.get(key);
      // doubles of the rank and file (n >= 10: extras, supporters, the hat) are each their own look where the cast has variants
      if (!ch) { ch = troupe.spawn(n >= 10 && VARIED[id] ? castVariant(id, n) : id, { lod }); pool.set(key, ch); }
      return ch;
    },
    /** Build these now (a title card is the time), so nobody is built in the middle of a scene. */
    warm(ids, lod = 'full') { for (let i = 0; i < ids.length; i++) troupe.take(ids[i], 0, lod); },
  };
  return troupe;
}

/** World point -> CSS px inside a view rectangle { x, y, w, h }. Returns false when the point is behind the camera. */
export function projectTo(camera, p, rect, out) {
  const m = camera.viewProj, x = p[0], y = p[1], z = p[2];
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  if (w <= 1e-5) return false;
  out[0] = rect.x + (0.5 + 0.5 * (m[0] * x + m[4] * y + m[8] * z + m[12]) / w) * rect.w;
  out[1] = rect.y + (0.5 - 0.5 * (m[1] * x + m[5] * y + m[9] * z + m[13]) / w) * rect.h;
  return true;
}

const BOX = { min: [0, 0, 0], max: [0, 0, 0] }, TGT = [0, 0, 0];
/**
 * Frame a set of world points (heads): the box around them, padded by `pad` world units, fills `fillH` of the
 * frame's height or `fillW` of its width, whichever is tighter, and its centre sits `at` of the way down the frame
 * (0.5 = middle; a portrait cutscene with a subtitle box wants about 0.36). Returns the distance used.
 */
export function frameHeads(camera, pts, { aspect, fov = 26, yaw = 0, pitch = 4, pad = 0.3, fillH = 0.4, fillW = 0.8, at = 0.5 } = {}) {
  BOX.min[0] = BOX.min[1] = BOX.min[2] = 1e9; BOX.max[0] = BOX.max[1] = BOX.max[2] = -1e9;
  for (let i = 0; i < pts.length; i++) for (let k = 0; k < 3; k++) { const v = pts[i][k]; if (v < BOX.min[k]) BOX.min[k] = v; if (v > BOX.max[k]) BOX.max[k] = v; }
  const cy = Math.cos(yaw * DEG), sy = Math.sin(yaw * DEG);
  const dx = BOX.max[0] - BOX.min[0], dz = BOX.max[2] - BOX.min[2];
  const wide = Math.abs(dx * cy) + Math.abs(dz * sy) + pad * 2, high = BOX.max[1] - BOX.min[1] + pad * 2;
  const tv = Math.tan(fov * DEG / 2), dist = Math.max(high / fillH / 2 / tv, wide / fillW / 2 / (tv * aspect));
  TGT[0] = (BOX.min[0] + BOX.max[0]) / 2; TGT[2] = (BOX.min[2] + BOX.max[2]) / 2;
  TGT[1] = (BOX.min[1] + BOX.max[1]) / 2 - (0.5 - at) * 2 * tv * dist;
  camera.fov = fov; camera.orbit(TGT, dist, yaw, pitch);
  return dist;
}

/** Ink is a constant width in pixels; on a small figure that is far too heavy. Scale it by how big a head is on screen. */
export function inkFor(camera, viewHeightPx, headRadius = 0.2) {
  const d = Math.hypot(camera.position[0] - camera.target[0], camera.position[1] - camera.target[1], camera.position[2] - camera.target[2]);
  const headPx = headRadius * 2.2 * viewHeightPx / (2 * Math.tan(camera.fov * DEG / 2) * d);
  return clamp(headPx / 130, 0.42, 1.05);
}

// ------------------------------------------------------------------------------------ the camera rig

// Shots are computed into PROBE (set.frame and frameHeads only set fov and call orbit), then the real camera eases
// toward them. A cut lands at once.
const PROBE = {
  fov: 30, x: 0, y: 1, z: 0, d: 8, yaw: 0, pitch: 5, position: [0, 0, 0], target: [0, 0, 0],
  orbit(t, d, yaw, pitch) { this.x = t[0]; this.y = t[1]; this.z = t[2]; this.d = d; this.yaw = yaw; this.pitch = pitch; return this; },
};
const RT = [0, 0, 0];
const makeRig = () => ({ has: false, x: 0, y: 1, z: 0, d: 8, yaw: 0, pitch: 5, fov: 30 });
/** Ease the rig to PROBE and place the camera. punch 0..1 shakes and pushes in. */
function rigTo(rig, camera, dt, cut, rate, time, punch) {
  const k = cut || !rig.has ? 1 : 1 - Math.exp(-dt * rate);
  rig.x += (PROBE.x - rig.x) * k; rig.y += (PROBE.y - rig.y) * k; rig.z += (PROBE.z - rig.z) * k; rig.d += (PROBE.d - rig.d) * k;
  rig.yaw += (PROBE.yaw - rig.yaw) * k; rig.pitch += (PROBE.pitch - rig.pitch) * k; rig.fov += (PROBE.fov - rig.fov) * k; rig.has = true;
  const q = punch * punch;
  RT[0] = rig.x + Math.sin(time * 47) * 0.035 * q; RT[1] = rig.y + Math.cos(time * 53) * 0.03 * q; RT[2] = rig.z;
  camera.fov = rig.fov; camera.orbit(RT, rig.d * (1 - 0.07 * q), rig.yaw, rig.pitch);
}

// ------------------------------------------------------------------------------------ a stage: the figures on one set

const DEFAULT_MARKS = {
  a: { pos: [-0.8, 0, 0.55], face: 14 }, b: { pos: [0.02, 0, 0.8], face: 0 }, c: { pos: [0.82, 0, 0.55], face: -14 },
  two: [{ pos: [-0.42, 0, 0.62], face: 24 }, { pos: [0.42, 0, 0.62], face: -24 }],
};
const OFF_X = 4.5;            // where a walk-on starts and a walk-off ends
const WALK = 2.1;             // world units a second
const STEP = 0.24;            // seconds a stride is held

/** Where the i-th of n people in a cutscene stands. Writes out[0] = x, out[1] = z, out[2] = facing degrees. */
function cineSlot(set, n, i, out) {
  const m = set.marks && set.marks.b ? set.marks : DEFAULT_MARKS;
  let s = null;
  if (n === 1) s = m.b; else if (n === 2 && m.two) s = m.two[i]; else if (n === 3) s = i === 0 ? m.a : i === 1 ? m.b : m.c;
  else if (m.cast && m.cast[n] && m.cast[n][i]) s = m.cast[n][i];       // a set's own places for a bigger company
  if (s) { out[0] = s.pos[0]; out[1] = s.pos[2]; out[2] = s.face; return out; }
  // four and more: two shallow rows, alternating, so every head has clear air and nobody is hidden
  const span = n === 4 ? 1.45 : n === 5 ? 1.75 : n === 6 ? 1.95 : 2.3, x = lerp(-span, span, i / (n - 1));
  out[0] = x; out[1] = i % 2 ? 1.05 : 0.45; out[2] = clamp(-x * 13, -24, 24);
  return out;
}

const SLOT = [0, 0, 0], P3 = [0, 0, 0], V3 = [0, 0, 0], SP = { kind: 0, pos: P3, vel: V3, size: 0.2, endSize: 0.2, life: 1, color: '#ffffff', alpha: 1, gravity: 0, drag: 0, rot: 0, spin: 0, aspect: 1 };
/** One particle through the reusable options object (sprites.spawn copies what it needs). */
function particle(sprites, kind, x, y, z, vx, vy, vz, size, endSize, life, color, gravity = 0, drag = 0) {
  if (!sprites) return;
  P3[0] = x; P3[1] = y; P3[2] = z; V3[0] = vx; V3[1] = vy; V3[2] = vz;
  SP.kind = kind; SP.size = size; SP.endSize = endSize; SP.life = life; SP.color = color; SP.gravity = gravity; SP.drag = drag; SP.alpha = 1; SP.rot = Math.random() * 0.6; SP.spin = 0;
  sprites.spawn(SP);
}
const K_GLOW = 0, K_STAR = 1, K_PUFF = 2, K_RING = 4, K_DOT = 5;
function burst(sprites, x, y, z, n, size, color, speed = 1.4) {
  for (let i = 0; i < n; i++) { const a = (i / n) * 6.283 + Math.random() * 0.6, s = speed * (0.6 + Math.random() * 0.6); particle(sprites, K_STAR, x, y, z, Math.cos(a) * s, Math.sin(a) * s + 0.3, 0.2, size * (0.6 + Math.random() * 0.7), size, 0.45 + Math.random() * 0.25, color, 1.5, 2.5); }
}

function makeStage(set, troupe) {
  const actors = [], sprites = set.scene.sprites || null;
  const S = {
    set, troupe, actors, sprites, units: [], unitRoot: null, floorRoot: null, mats: null, rig: makeRig(), camera: null,
    view: { shadowCenter: [0, 0, 0.5], shadowRadius: 3.4 }, fill: null, lines: null, fight: null, blobs: false, who: null,
  };
  // a low warm lamp in front of the cast at night: the set's lamps hang overhead, so without it every chin and mouth is in the blue
  if (set.light === 'night' && set.scene.root) { S.fill = new Node('stageFill', { pos: [-0.5, 1.2, 2.9], light: makeLight({ color: '#ffb45e', radius: 4.6, intensity: 0 }) }); set.scene.root.add(S.fill); }

  /**
   * Stage coordinates (the set.actors group's own: where figures are placed) to world. They are the same thing on a
   * set that stands still; on a boat or a rolling deck set.actors moves, and everything aimed at a figure from outside
   * that group (sprites, bolts, rings, the camera's target) goes through here. One frame behind the renderer's matrices.
   */
  S.toWorld = (x, y, z, out) => {
    const m = set.actors.world;
    out[0] = m[0] * x + m[4] * y + m[8] * z + m[12]; out[1] = m[1] * x + m[5] * y + m[9] * z + m[13]; out[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    return out;
  };
  /** The first figure of that cast id on stage (and not on the way out). n picks a double. */
  S.find = (id, n = -1) => { for (let i = 0; i < actors.length; i++) { const a = actors[i]; if (a.id === id && !a.leaving && (n < 0 || a.n === n)) return a; } return null; };
  /** Put a figure on the stage at (x, z); from: x to walk on from, or null to be there already. */
  S.enter = (id, n, lod, x, z, face, from, wear) => {
    let a = null;
    const as = wear || id;      // the figure that plays this cast id: a costume of the same person, or the person
    for (let i = 0; i < actors.length; i++) if (actors[i].id === id && actors[i].n === n && actors[i].wear === as) a = actors[i];   // on the way out: turn round
    if (!a) {
      if (!troupe.has(as)) throw new Error(`stage: no cast member "${as}"${as !== id ? ` (worn by ${id})` : ''} on set ${set.id} (have ${Object.keys(CAST).join(', ')})`);
      if (VARIED[as] === undefined) VARIED[as] = variedOk(as);
      const ch = troupe.take(as, n, lod); ch.release(); ch.home(); ch.id = id;
      set.actors.add(ch.root);
      a = {
        id, n, ch, lod, wear: as, pinned: false, shade: null, x: 0, z: 0, gx: 0, gz: 0, face: 0, moving: false, leaving: false, gait: Math.random(), speed: WALK,
        ox: 0, oy: 0, oz: 0, kx: 0, kT: 9, kA: 0, kHold: 0, role: '', side: 0, slot: 0, held: false, busyT: 0,
        emote: 'neutral', temp: 'neutral', tempT: 0, pose: 'stand', flashPose: 'stand', poseT: 0, talk: -1, quietT: 99,
        dash: { on: false, t: 0, ant: 0, out: 0, hold: 0, back: 0, dx: 0, dz: 0, hop: 0, trail: false, rock: 0.07 },
        st: { emote: 'neutral', talk: null, speaking: false, pose: 'stand', look: null, face: 0, camera: null, wind: [0.5, 0, 0], snap: false, energy: 1 },
        lookAt: [0, 0, 0], hp: [0, 1, 0], glow: null, aura: null, home: 0,
      };
      a.glow = ch.lampPos && sprites ? sprites.add({ kind: 'glow', pos: [0, 0, 0], size: 0.95, color: '#ffa63f', alpha: set.light === 'day' ? 0.25 : 0.85 }) : null;
      a.x = from == null ? x : from; a.z = z; a.st.snap = true; a.hp[0] = a.x; a.hp[1] = ch.height * 0.8; a.hp[2] = z;
      actors.push(a);
    }
    a.leaving = false; a.gx = x; a.gz = z; a.face = face; a.speed = WALK;
    return a;
  };
  S.drop = (a) => {
    const i = actors.indexOf(a); if (i < 0) return;
    actors.splice(i, 1); a.ch.release(); a.ch.home(); set.actors.remove(a.ch.root);
    if (a.glow) sprites.remove(a.glow); if (a.aura) sprites.remove(a.aura); if (a.shade) sprites.remove(a.shade);
    a.glow = a.aura = a.shade = null;
    if (a.ch.skin) { a.ch.skin.tint[0] = a.ch.skin.tint[1] = a.ch.skin.tint[2] = 1; }
  };
  /** Send a figure off the nearer side (or the side asked for). cut: gone at once. */
  S.leave = (a, cut, side = 0) => {
    if (cut) { S.drop(a); return; }
    if (a.held) { a.ch.release(); a.held = false; }
    a.leaving = true; a.gx = (side || (a.x < 0 ? -1 : 1)) * OFF_X; a.gz = a.z; a.role = 'gone'; a.dash.on = false;
  };
  S.clearUnits = () => {
    for (const u of S.units) { if (u.glows) for (const g of u.glows) sprites.remove(g); }
    if (S.unitRoot) { set.scene.root.remove(S.unitRoot); S.unitRoot = null; S.floorRoot = null; }
    S.units.length = 0; S.who = null;
  };
  /** Everybody off, props gone: the set is being left. */
  S.clear = () => { while (actors.length) S.drop(actors[actors.length - 1]); S.clearUnits(); S.rig.has = false; if (S.fight) S.fight.key = ''; if (S.lines) S.lines.reset(); };

  /** Move, pose and update every figure. Controllers set a.* and a.st.* first. */
  S.tick = (dt, time, camera) => {
    for (let i = actors.length - 1; i >= 0; i--) {
      const a = actors[i], st = a.st, d = a.dash;
      const dx = a.gx - a.x, dz = a.gz - a.z, dist = Math.hypot(dx, dz);
      a.moving = dist > 0.03 && !d.on && !a.held;
      let bob = 0;
      if (a.moving) {
        const step = Math.min(dist, a.speed * dt); a.x += dx / dist * step; a.z += dz / dist * step; a.gait += dt;
        bob = Math.abs(Math.sin(a.gait * Math.PI / STEP)) * 0.035;
      } else if (a.leaving) { S.drop(a); continue; }
      // a dash: rock back, go, hold at contact, hop home
      if (d.on) {
        d.t += dt; const t = d.t; let k = 0, up = 0;
        if (t < d.ant) k = -d.rock * Math.sin(t / d.ant * Math.PI / 2);
        else if (t < d.ant + d.out) { const u = 1 - (t - d.ant) / d.out; k = -d.rock + (1 + d.rock) * (1 - u * u * u); if (d.trail && sprites) particle(sprites, K_GLOW, a.x + a.ox, a.ch.height * 0.55, a.z + a.oz, 0, 0.1, 0, 0.34, 0.05, 0.3, '#ffe27a'); }
        else if (t < d.ant + d.out + d.hold) k = 1;
        else if (t < d.ant + d.out + d.hold + d.back) { const u = (t - d.ant - d.out - d.hold) / d.back; k = 1 - smooth(u); up = Math.sin(u * Math.PI) * d.hop; }
        else d.on = false;
        a.ox = d.dx * k; a.oz = d.dz * k; a.oy = up;
      } else { a.ox = 0; a.oz = 0; a.oy = 0; }
      // knocked back: out fast, held a moment, eased home
      if (a.kT < 8) { a.kT += dt; const t = a.kT; a.kx = a.kA * (t < 0.09 ? t / 0.09 : t < 0.09 + a.kHold ? 1 : 1 - smooth((t - 0.09 - a.kHold) / 0.45)); if (t > 0.6 + a.kHold) { a.kT = 9; a.kx = 0; } }
      a.ch.root.setPos(a.x + a.ox + a.kx, a.oy + bob, a.z + a.oz);
      if (a.tempT > 0) a.tempT -= dt;
      if (a.poseT > 0) a.poseT -= dt;
      if (a.busyT > 0) a.busyT -= dt;
      st.emote = a.tempT > 0 ? a.temp : a.emote;
      st.pose = a.moving ? 'walk' : a.poseT > 0 ? a.flashPose : a.pose; st.walk = a.speed;
      st.face = a.moving ? clamp(Math.atan2(dx, dz) / DEG, -100, 100) * 0.82 : a.face;
      if (a.moving) st.look = null;
      st.camera = camera;
      if (a.talk >= 0) { st.talk = a.talk; st.speaking = false; } else { st.talk = null; st.speaking = a.talk === -2; }
      st.wind[0] = 0.5 + Math.sin(time * 0.9 + a.x) * 0.9; st.wind[2] = Math.sin(time * 1.3) * 0.5;
      a.ch.update(dt, st); st.snap = false;
      const h = a.ch.headPos, hk = Math.min(1, dt * 7);
      a.hp[0] += (h[0] - a.hp[0]) * hk; a.hp[1] += (h[1] - a.hp[1]) * hk; a.hp[2] += (h[2] - a.hp[2]) * hk;
      if (a.glow) { const l = a.ch.lampPos; a.glow.pos[0] = l[0]; a.glow.pos[1] = l[1]; a.glow.pos[2] = l[2]; }
      // with the shadow map off (the band at the low tier) a blob under the feet is the figure's contact with the ground
      if (S.blobs && sprites && !a.shade) a.shade = sprites.add({ kind: 'shade', pos: [0, 0.02, 0], size: [0.9, 0.55] });
      if (a.shade) { if (!S.blobs) { sprites.remove(a.shade); a.shade = null; } else { S.toWorld(a.x + a.ox + a.kx, 0.02, a.z + a.oz, a.shade.pos); } }
    }
  };
  return S;
}

const STAGES = new WeakMap();
function stageOn(set, troupe) { let S = STAGES.get(set); if (!S) { S = makeStage(set, troupe); STAGES.set(set, S); } return S; }

const feel = (a, emote, secs) => { a.temp = emote; a.tempT = secs; };
const flash = (a, pose, secs) => { a.flashPose = pose; a.poseT = secs; };
function startDash(a, tx, tz, ant, out, hold, back, hop, trail, rock = 0.07) {
  const d = a.dash; d.rock = rock; d.on = true; d.t = 0; d.ant = ant; d.out = out; d.hold = hold; d.back = back; d.hop = hop; d.trail = !!trail;
  d.dx = tx - a.x; d.dz = tz - a.z; a.busyT = ant + out + hold + back;
}
function knock(a, amount, hold = 0) { a.kT = 0; a.kA = amount; a.kHold = hold; }
const snapTo = (a) => { a.x = a.gx; a.z = a.gz; a.st.snap = true; a.hp[0] = a.x; a.hp[2] = a.z; };

// ------------------------------------------------------------------------------------ cutscenes: lines on a stage

const HEADS = [], H2 = [0, 0, 0], H3 = [0, 0, 0];
const RADIO_POSE = (a) => (a.id === 'ren' ? 'signature' : POSES.listen ? 'listen' : 'talkChin');  // Ren's signature IS two fingers to the earpiece
const startsWith = (text, re) => re.test(text);
const NO = /^(No\b|Never\b|Not\b|Nothing\b)/, YES = /^(Yes\b|Aye\b|Good\b|All of it\b|Right\b)/;

/**
 * Plays lines on a stage. update(dt, time, s) with
 *   s = { line (a content Line, or null), on [cast ids left to right], cam, voice { who, level } | null, camera, aspect, viewHeight,
 *         cut (the set has just changed: nobody walks, the camera lands), still (no camera drift), emotes { id: emote } }
 */
function linesOn(S) {
  const set = S.set, troupe = S.troupe;
  let onKey = '', lineRef = undefined, speaker = null, addressee = null, lastSpeakerId = '', camName = 'wide', lineT = 0, lineN = 0, dtLast = 0, wear = null;
  const wearOf = (id) => (wear && wear[id]) || id;
  const L = {
    get speaker() { return speaker; }, get addressee() { return addressee; },
    reset() { onKey = ''; lineRef = undefined; speaker = null; addressee = null; lastSpeakerId = ''; },
    /** Who stands where. The fight's figures are picked up where they stand and walked to their places. */
    arrange(on, cut) {
      const n = on.length;
      for (let i = S.actors.length - 1; i >= 0; i--) { const a = S.actors[i]; if (a.role !== 'folk' && !a.leaving && on.indexOf(a.id) < 0) S.leave(a, cut, a.side > 0 ? -1 : a.side < 0 ? 1 : 0); }
      for (let i = 0; i < n; i++) {
        cineSlot(set, n, i, SLOT);
        let a = S.find(on[i]);
        // the band's cheap figure will not stand a close-up, and a change of costume is a change of figure: both swap where they stand
        if (a && (a.lod !== 'full' || a.wear !== wearOf(on[i]))) { const x = a.x, z = a.z; S.drop(a); a = S.enter(on[i], 0, 'full', x, z, SLOT[2], null, wearOf(on[i])); }
        if (!a) a = S.enter(on[i], 0, 'full', SLOT[0], SLOT[1], SLOT[2], cut ? null : (SLOT[0] < -0.01 || (SLOT[0] < 0.01 && i === 0) ? -OFF_X : OFF_X), wearOf(on[i]));
        if (a.held) { a.ch.release(); a.held = false; }
        a.role = 'cast'; a.side = 0; a.slot = i; a.gx = SLOT[0]; a.gz = SLOT[1]; a.face = a.home = SLOT[2]; a.pose = 'stand'; a.speed = WALK; a.dash.on = false;
        if (cut) snapTo(a);
      }
    },
    update(dt, time, s) {
      const on = s.on || [], cut = !!s.cut, line = s.line || null;
      dtLast = dt; lineT += dt; wear = s.wear || null;
      let key = ''; for (let i = 0; i < on.length; i++) key += wearOf(on[i]) + ',';
      camName = s.cam || (line && line.cam) || camName;
      if (key !== onKey || cut) {
        // an empty stage and a close-up: that is a cut to a face, not somebody trotting into their own close-up
        let empty = true; for (const a of S.actors) if (a.role === 'cast' && !a.leaving) empty = false;
        onKey = key; L.arrange(on, cut || (empty && camName === 'close'));
      }
      const who = line ? line.who : s.speaker || '';
      if (line !== lineRef || (!line && who !== lastSpeakerId)) {
        // a new line: the last listener may nod, the new speaker gets a face and, on a line that wants one, a gesture
        const before = speaker;
        lineRef = line; lineT = 0; lineN++;
        if (line && line.id) { if (set.cue) set.cue(line.id); if (S.onCue) S.onCue(set, line.id); }      // a set's own stage business, keyed to the script
        speaker = who ? S.find(who) : null; if (speaker && speaker.role !== 'cast') speaker = null;
        if (speaker !== before && before && before.role === 'cast') addressee = before;
        if (addressee === speaker || (addressee && addressee.role !== 'cast')) addressee = null;
        if (speaker && !addressee) for (const a of S.actors) if (a !== speaker && a.role === 'cast' && (!addressee || Math.abs(a.gx - speaker.gx) < Math.abs(addressee.gx - speaker.gx))) addressee = a;
        lastSpeakerId = who;
        const emote = (line && line.emote) || s.emote || 'neutral', text = (line && line.text) || '';
        if (speaker) {
          speaker.emote = emote; speaker.quietT = 0;
          if (!cut && !speaker.moving) {
            if (startsWith(text, NO)) speaker.ch.act('shake');
            else if (startsWith(text, YES)) speaker.ch.act('nod');
            else if (text.endsWith('!')) flash(speaker, emote === 'anger' ? 'talkPoint' : 'talkBoth', 1.3);
            else if (text.endsWith('?') && text.length < 60) flash(speaker, 'talkShrug', 1.1);
            else if (emote === 'anger') flash(speaker, 'talkPoint', 1.0);
          }
        }
        for (const a of S.actors) {
          if (a.role !== 'cast' || a === speaker || cut) continue;
          // listeners answer the speaker's face with a smaller one of their own, and whoever was just speaking nods now and then
          if (emote === 'anger' || emote === 'shock') feel(a, 'shock', 0.9); else if (emote === 'smile') feel(a, 'soft', 1.6); else if (emote === 'tears') feel(a, 'soft', 2.4);
          if (a === before && !a.ch.busy && !a.moving && lineN % 2 === 0) a.ch.act('nod');
        }
      }
      const radio = !!(line && line.fx === 'radio') || !!s.radio;
      const ear = radio && !speaker ? (S.find('ren') || null) : null;
      const level = s.voice && s.voice.level != null ? s.voice.level : null;
      const lens = s.camera || S.camera;
      for (const a of S.actors) {
        if (a.role !== 'cast') { if (a.role === 'folk') a.talk = -1; continue; }
        const me = a === speaker;
        a.talk = me ? (level == null ? -2 : Math.max(level, 0.03)) : -1;
        if (!me) { a.quietT += dt; if (a.quietT > 7 && a.emote !== 'neutral') a.emote = 'neutral'; }
        if (s.emotes && s.emotes[a.id]) a.emote = s.emotes[a.id];
        a.pose = ear === a && radio ? RADIO_POSE(a) : 'stand';
        // chibi faces read from the front: nobody turns fully to profile. Looks are a blend of "at them" and "at the lens"
        const at = me ? (camName === 'close' ? null : addressee) : (speaker || ear), st = a.st, k = me ? 0.5 : 0.62;
        if (ear === a) st.look = null;
        else if (at && at !== a && lens) { const LA = a.lookAt; LA[0] = at.hp[0] * k + lens.position[0] * (1 - k); LA[1] = at.hp[1] * k + (a.hp[1] + 0.1) * (1 - k); LA[2] = Math.max(at.hp[2] * k + lens.position[2] * (1 - k), a.hp[2] + 0.5); st.look = LA; }
        else st.look = lens ? 'camera' : null;
        // the body turns part of the way toward whoever it is talking with; the head does the rest
        const toward = me ? addressee : (speaker || ear);
        a.face = a.home + (toward && toward !== a ? clamp((toward.gx - a.gx) * 14, -18, 18) : 0);
        if (ear === a && lens) a.face = Math.atan2(lens.position[0] - a.x, lens.position[2] - a.z) / DEG + 14;   // listening to the Line: square to the lens, the pose turns the head away
        st.energy = 1;
      }
    },
    /** Place the camera for the line (after S.tick, so heads are where they will be drawn). */
    frame(camera, aspect, viewHeight, time, cut, still) {
      const drift = still ? 0 : time, sp = speaker && !speaker.leaving ? speaker : null;
      let first = null, second = null, count = 0;
      for (const a of S.actors) if (a.role === 'cast') { count++; if (!first) first = a; else if (!second) second = a; }
      let name = camName, subject = sp || (lineRef && lineRef.fx === 'radio' ? S.find('ren') : null) || first, other = sp ? addressee : (subject === first ? second : first);
      if (other && other.role !== 'cast') other = null;
      let radius = 3.2;
      if (name === 'close' && subject) {
        // look past the speaker toward the middle of the set, not into whatever stands behind them
        const side = subject.hp[0] < -0.2 ? -1 : subject.hp[0] > 0.2 ? 1 : -0.7;
        HEADS.length = 0; HEADS.push(subject.hp);
        frameHeads(PROBE, HEADS, { aspect, fov: 24, yaw: side * 17 + Math.sin(drift * 0.23) * 1.2, pitch: 3, pad: subject.ch.headRadius * 1.25, fillH: 0.34, fillW: 0.74, at: 0.37 });
        radius = 2.4;
      } else if (name === 'two' && subject && other) {
        H2[0] = subject.hp[0]; H2[1] = subject.hp[1]; H2[2] = subject.hp[2]; H3[0] = other.hp[0]; H3[1] = Math.min(other.hp[1], subject.hp[1]) - 0.42; H3[2] = other.hp[2];
        HEADS.length = 0; HEADS.push(H2, H3);
        const side = subject.hp[0] < other.hp[0] ? 1 : -1;
        frameHeads(PROBE, HEADS, { aspect, fov: 28, yaw: side * 13 + Math.sin(drift * 0.2) * 1.2, pitch: 4, pad: 0.36, fillH: 0.5, fillW: 0.94, at: 0.57 });
      } else if (name === 'two' && subject) {
        HEADS.length = 0; H2[0] = subject.hp[0]; H2[1] = subject.hp[1] - 0.3; H2[2] = subject.hp[2]; HEADS.push(H2);
        frameHeads(PROBE, HEADS, { aspect, fov: 28, yaw: -9 + Math.sin(drift * 0.2) * 1.2, pitch: 4, pad: 0.5, fillH: 0.5, fillW: 0.9, at: 0.5 });
      } else {
        if (!set.cameras[name]) name = 'wide';
        set.frame(PROBE, name, drift);
        if (count === 0) PROBE.d *= 1 - 0.035 * smooth(lineT / 7);    // nobody on stage: the narrator's shot creeps in
        radius = set.cameras[name].shadowRadius;
        S.view.shadowCenter[0] = set.cameras[name].shadowCenter[0]; S.view.shadowCenter[2] = set.cameras[name].shadowCenter[2];
      }
      rigTo(S.rig, camera, dtLast, cut, 4.6, time, 0);
      if (name !== 'wide' && name !== 'low') { S.view.shadowCenter[0] = S.rig.x; S.view.shadowCenter[2] = 0.5; }
      S.view.shadowRadius = radius; set.env.shadow.center = S.view.shadowCenter; set.env.shadow.radius = radius;
      if (set.wings) for (let i = 0; i < set.wings.length; i++) set.wings[i].visible = true;
      if (set.foreground) set.foreground.visible = name === 'wide' || name === 'low';   // the near clutter is dressing for the wide marks; a close camera would stand inside it
      if (S.fill) S.fill.light.intensity = 1;
      set.env.outline.width = inkFor(camera, viewHeight || 852, first ? first.ch.headRadius : 0.2);
      troupe.aim(camera);
      S.camera = camera;
    },
  };
  return L;
}

/**
 * A cutscene on a set (the slice API; the game goes through createDirector). `on` lists cast ids left to right.
 * update(dt, time, { speaker, emote, emotes, cam, camera, aspect, viewHeight, snap, still })  or, with real data,
 * update(dt, time, { line, on, voice: { who, level }, camera, aspect, viewHeight })
 */
export function createCine(set, troupe, { on = ['nan', 'ren', 'ilse'] } = {}) {
  const S = stageOn(set, troupe), L = S.lines || (S.lines = linesOn(S));
  const cast = {}, list = [];
  const state = { on, line: null, speaker: '', emote: '', cam: 'wide', voice: null, camera: null, cut: true, emotes: null, radio: false };
  const sync = () => { list.length = 0; for (const k of Object.keys(cast)) delete cast[k]; for (const a of S.actors) if (a.role === 'cast') { cast[a.id] = a.ch; list.push(a.ch); a.ch.id = a.id; } };
  L.arrange(on, true); sync();
  const cine = {
    cast, list, view: S.view, stage: S, fill: S.fill,
    update(dt, time, s) {
      state.on = s.on || on; state.line = s.line || null; state.speaker = s.speaker || ''; state.emote = s.emote || ''; state.cam = s.cam || (s.line && s.line.cam) || state.cam;
      state.voice = s.voice || null; state.camera = s.camera; state.emotes = s.emotes || null; state.cut = !!s.snap || state.cut;
      const cut = state.cut;
      L.update(dt, time, state); S.tick(dt, time, s.camera || S.camera);
      if (s.on) sync();
      if (s.camera) L.frame(s.camera, s.aspect || 0.46, s.viewHeight || 852, time, cut, s.still);
      state.cut = false;
    },
  };
  return cine;
}

// ------------------------------------------------------------------------------------ the things a 'force' encounter is about

const INK = '#27305e', WOOD = '#b9793f', WOOD_D = '#7c4a2b', CREAM = '#fff3d6';
const piece = (root, mat, mesh, color, x, y, z) => { const n = new Node('piece', { mesh: color ? tint(mesh, color) : mesh, material: mat, pos: [x, y, z] }); root.add(n); return n; };
const setTint = (n, r, g, b) => { n.tint[0] = r; n.tint[1] = g; n.tint[2] = b; };
const glowAt = (S, x, y, z, size, color) => (S.sprites ? S.sprites.add({ kind: 'glow', pos: [x, y, z], size, color, alpha: 0 }) : null);

/**
 * Stand-in props for opposition.kind 'force', by the type name in opposition.who. Each returns
 * { pos [x, y, z], stand [x, z] | null, set(v 0..1, time), glows [] }. A set that has the real thing answers
 * set.task(type, index, count) with the same shape and these are not built.
 */
export const UNITS = {
  'lantern-dark'(S, root, i) {
    const x = 0.8 + i * 0.82, z = 0.28, top = 1.62, g = glowAt(S, x, top - 0.36, z + 0.05, 1.3, '#ffb450');
    piece(root, S.mats.prop, merge(cylinder(0.035, 0.03, top + 0.06, 6), place(box(0.36, 0.035, 0.035), -0.16, top, 0)), INK, x + 0.32, 0, z);
    const l = piece(root, S.mats.lantern, paperLantern({ r: 0.21 }), '#ffffff', x, top, z);
    return { pos: [x, top - 0.36, z], stand: [x - 0.5, z + 0.42], glows: [g], set(v, time) { const s = Math.sin(time * 1.3 + i) * 3; l.setRot(0, 0, s); setTint(l, lerp(0.36, 1.08, v), lerp(0.38, 0.72, v), lerp(0.56, 0.32, v)); if (g) g.alpha = v * 0.85; } };
  },
  'lantern-line'(S, root) {
    const ls = [], gs = [];
    for (let k = 0; k < 5; k++) { const x = 0.2 + k * 0.72, z = 0.02; piece(root, S.mats.prop, cylinder(0.03, 0.025, 1.2, 6), INK, x, 0, z); ls.push(piece(root, S.mats.lantern, paperLantern({ r: 0.15, cord: 0.02 }), '#ffffff', x, 1.56, z)); gs.push(glowAt(S, x, 1.34, z + 0.05, 1.0, '#ffb450')); }
    return { pos: [1.6, 1.3, 0.02], stand: null, glows: gs, set(v) { for (let k = 0; k < 5; k++) { const u = clamp(v * 5 - k, 0, 1); setTint(ls[k], lerp(0.36, 1.08, u), lerp(0.38, 0.72, u), lerp(0.56, 0.32, u)); if (gs[k]) gs[k].alpha = u * 0.8; } } };
  },
  'great-reel'(S, root, i) {
    const x = -0.2 + i * 1.0, y = 2.02, z = -0.3, g = glowAt(S, x, y, z + 0.3, 1.5, '#ffd24a');
    const axle = new Node('axle', { pos: [x, y, z], rot: [0, 0, 90] }); root.add(axle);
    const spin = new Node('spin'); axle.add(spin);
    const drum = piece(spin, S.mats.prop, merge(tint(cylinder(0.42, 0.42, 0.7, 16), CREAM), tint(place(cylinder(0.45, 0.45, 0.06, 16), 0, -0.03, 0), '#d94a3a'), tint(place(cylinder(0.45, 0.45, 0.06, 16), 0, 0.67, 0), '#d94a3a'),
      tint(place(sphere(0.15, 10, 8), 0, 0.35, 0.36), '#ffc93a'), tint(place(box(0.06, 0.2, 0.22), 0.4, 0.35, 0), '#3566c8'), tint(place(box(0.06, 0.2, 0.22), -0.4, 0.35, 0), '#2bb39b'), tint(place(box(0.22, 0.2, 0.06), 0, 0.35, -0.4), '#d94a3a')), null, 0, -0.35, 0);
    let ang = i * 70;
    return { pos: [x, y, z + 0.4], stand: null, glows: [g], set(v, time, dt) { if (v < 1) ang += dt * 620; else ang += (Math.round(ang / 360) * 360 - ang) * Math.min(1, dt * 9); spin.setRot(0, ang, 0); const b = v < 1 ? 0.8 : 1.12; setTint(drum, b, b, b); if (g) g.alpha = v >= 1 ? 0.8 : 0; } };
  },
  'odds-board'(S, root) {
    const x = 1.75, y = 1.12, z = 0.22, cols = [];
    piece(root, S.mats.prop, merge(place(cylinder(0.03, 0.03, 1.5, 6), -0.5, 0, -0.12, -6, 0, 0), place(cylinder(0.03, 0.03, 1.5, 6), 0.5, 0, -0.12, -6, 0, 0), place(cylinder(0.03, 0.03, 1.4, 6), 0, 0, -0.5, 14, 0, 0)), WOOD_D, x, 0, z);
    piece(root, S.mats.prop, box(1.36, 0.96, 0.06), '#2c5a4c', x, y, z);
    for (let k = 0; k < 4; k++) cols.push(piece(root, S.mats.prop, box(0.2, 0.66, 0.02), CREAM, x - 0.45 + k * 0.3, y, z + 0.045));
    const ring = piece(root, S.mats.prop, place(torus(0.2, 0.03, 16, 6), 0, 0, 0, 90, 0, 0), '#ffc93a', x + 0.45, y - 0.16, z + 0.07);
    const sack = piece(root, S.mats.prop, box(1.4, 1.0, 0.04), '#9a7a4e', x, y, z + 0.08);
    const g = glowAt(S, x + 0.45, y - 0.16, z + 0.2, 1.1, '#ffd24a');
    return { pos: [x, y, z + 0.1], stand: [x - 1.0, z + 0.5], glows: [g], set(v) { const open = Math.min(1, v * 1.25); sack.visible = open < 0.999; sack.scale[0] = 1 - open; sack.position[0] = x + 0.7 * open; for (let k = 0; k < 4; k++) cols[k].visible = v >= (k + 1) * 0.25 - 0.001; ring.visible = v >= 1; if (g) g.alpha = v >= 1 ? 0.7 : 0; } };
  },
  'surety-bond'(S, root) {
    const x = 1.9, z = 0.42, seals = [];
    piece(root, S.mats.prop, merge(tint(box(1.6, 0.1, 0.8), WOOD), tint(place(box(1.45, 0.62, 0.66), 0, -0.36, 0), WOOD_D)), null, x, 0.72, z);
    const paper = new Node('paper', { pos: [x - 0.3, 0.86, z + 0.18], rot: [38, 0, 0] }); root.add(paper);
    piece(paper, S.mats.prop, box(0.74, 0.5, 0.015), CREAM, 0, 0, 0);
    for (let k = 0; k < 4; k++) seals.push(piece(paper, S.mats.prop, place(cylinder(0.07, 0.07, 0.04, 10), 0, 0, 0, 90, 0, 0), '#d6382e', -0.26 + k * 0.17, -0.12, 0.03));
    return { pos: [x - 0.3, 0.9, z + 0.2], stand: [x - 1.15, z + 0.3], glows: [], set(v) { for (let k = 0; k < 4; k++) seals[k].visible = v * 4 >= k + 0.999; } };
  },
  'chamber-door'(S, root) {
    const x = -0.2, z = 0.12;
    piece(root, S.mats.prop, merge(place(box(0.1, 1.95, 0.1), 0, 0.975, 0), place(box(0.1, 1.95, 0.1), 0, 0.975, 0.92), place(box(0.1, 0.1, 1.02), 0, 1.98, 0.46)), WOOD_D, x, 0, z);
    const hinge = new Node('hinge', { pos: [x, 0, z + 0.05] }); root.add(hinge);
    piece(hinge, S.mats.prop, merge(tint(box(0.06, 1.86, 0.8), '#5d6fa8'), tint(place(box(0.03, 0.5, 0.5), 0.03, 0.4, 0), '#bfe3ff'), tint(place(sphere(0.045, 8, 6), 0.06, -0.05, 0.3), '#ffc93a')), null, 0, 0.94, 0.42);
    return { pos: [x, 1.0, z + 0.5], stand: [x - 0.62, z + 0.62], glows: [], set(v) { hinge.setRot(0, -58 * v, 0); } };
  },
  'magistrate-desk'(S, root) {
    const x = 2.2, z = 0.45, g = glowAt(S, x + 0.45, 1.12, z, 1.2, '#7dffb0'), tell = glowAt(S, x - 0.5, 0.56, z + 0.36, 0.5, '#ffe27a');
    piece(root, S.mats.prop, merge(tint(box(1.5, 0.1, 0.8), WOOD), tint(place(box(1.36, 0.62, 0.66), 0, -0.36, 0), WOOD_D)), null, x, 0.72, z);
    piece(root, S.mats.prop, merge(tint(cylinder(0.08, 0.05, 0.26, 8), '#c9a13a'), tint(place(sphere(0.16, 10, 8), 0, 0.34, 0), '#3fcf8e')), null, x + 0.45, 0.77, z);
    if (g) g.alpha = 0.55;
    return { pos: [x - 0.5, 0.6, z + 0.36], stand: [x - 1.02, z + 0.4], glows: [g, tell], set(v, time) { if (tell) tell.alpha = v >= 1 ? 0.6 + 0.3 * Math.sin(time * 5) : 0; } };
  },
};

const FLOOR_UNITS = { 'odds-board': 1, 'surety-bond': 1, 'chamber-door': 1, 'magistrate-desk': 1 };
function buildUnits(S, who) {
  S.clearUnits();
  const set = S.set;
  for (let i = 0; i < who.length; i++) {
    let u = set.task ? set.task(who[i], i, who.length) : null;
    if (!u) {
      const make = UNITS[who[i]];
      if (!make) throw new Error(`stage: no prop for force type "${who[i]}" on set ${set.id} (have ${Object.keys(UNITS).join(', ')}; or the set answers set.task)`);
      if (!S.unitRoot) { S.unitRoot = new Node('units'); S.floorRoot = new Node('floorUnits'); S.unitRoot.add(S.floorRoot); set.scene.root.add(S.unitRoot); S.mats = S.mats || kitMaterials(); }
      u = make(S, FLOOR_UNITS[who[i]] ? S.floorRoot : S.unitRoot, i);
      u.own = true;
    }
    if (!u.pos || typeof u.set !== 'function') throw new Error(`stage: set ${set.id} answered task("${who[i]}") without { pos, set(v) }`);
    u.v = -1; u.shown = 0; u.type = who[i];
    S.units.push(u);
  }
  S.who = who;
}

// ------------------------------------------------------------------------------------ the live stage

/**
 * Which stage action a logged table event becomes (core/stage.js lists the events). Data, so it can be overridden.
 * jab: the next free party member acts. big: the wound-up move (the team move at combo level 3). boon: a payout
 * lands on the party. struck: an unsaved drain, the encounter's setback.
 */
export const BEATS = {
  bumper: 'jab', sling: 'jab', lane: 'jab', rollover: 'jab', target: 'chop', saucer: 'chop',
  shot: 'big', payout: 'boon', drain: 'struck', loan: 'loan', aid: 'aid', trust: 'trust', sceneClear: 'win', save: 'saved',
};
/**
 * How each encounter mode is staged.
 *   fight    the whole strip: party left, opposition right, blows carried across (jab / chop are the clips)
 * The others are TABLEAUX (tab): the band frames only the party and the thing they are at, a third closer, the
 * table's bolts land on that thing as the hand does, and a ring on it (or lit steps on the floor) is the objective.
 *   work     at the unit: two flank it and work it in turn
 *   hold     braced against whoever presses from the right; every hit shoves the line back
 *   stealth  crouched, creeping along a route of steps; every hit lights the next step
 *   talk     the lead makes points; the listeners are won one at a time
 *   walk     the party travels the route and the camera goes with them
 */
export const MODES = {
  fight:   { jab: 'strike', chop: 'strike2', reach: 1, hold: 'stand', team: true, tab: false, route: false },
  work:    { jab: 'workDown', chop: 'workDown', reach: 0, hold: 'stand', team: false, tab: true, route: false },
  hold:    { jab: 'shove', chop: 'shove', reach: 0.5, hold: 'brace', team: false, tab: true, route: false },
  stealth: { jab: 'creep', chop: 'creep', reach: 0, hold: 'crouch', team: false, tab: true, route: true },
  talk:    { jab: '', chop: '', reach: 0, hold: 'stand', team: false, tab: true, route: false, poses: ['talkPoint', 'talkBoth', 'talkOpen'] },
  walk:    { jab: 'hop', chop: 'hop', reach: 0, hold: 'stand', team: false, tab: true, route: true },
};
// each party member keeps a lane of its own (z), and ends a dash on that lane: nobody runs through whoever stands ahead
const PARTY_SLOT = [[-0.9, 0.86], [-1.72, 0.36], [-2.5, 1.3]];
const OPP_SLOT = [[0.9, 0.8], [1.72, 0.4], [2.5, 1.24]];
const LANE = [0.04, -0.46, 0.46];
const BACK_R = [[1.3, 0.02], [2.1, -0.06], [2.85, 0.1]];
const HALF_W = 3.0;    // world units of the strip either side of centre that the fight's camera keeps in frame
const HALF_TAB = 1.95; // the closest a tableau is framed
const STANDOFF = 1.0;  // how far short of a person a blow is carried: chibi heads are wide, and at 0.82 they met
const LAG = 0.16;      // seconds between a table hit and the stage answering: the time the energy takes to climb
const TAB_IMPACT = 0.27; // seconds into a tableau's working clip that the hand lands (the bolt is timed to it)
const MAX_FOLK = 2;    // figures are the band's draw calls: two supporters, a clerk and the hat are already five more
const MAX_PIPS = 12;
// scheduled steps
const DO_STRIKE = 1, DO_LAND = 2, DO_RELEASE = 3, DO_TEAM = 4, DO_GIVE = 5, DO_AWAY = 6, DO_SETTLE = 7, DO_CHEER = 8, DO_UNFOCUS = 9, DO_STEP = 10;
const WORK_CLIP = { up: 'workUp', down: 'workDown', push: 'shove', kneel: 'kneelTap' };

/** The hat the Commons passes: big, red, full of gold, so it is seen in a band 220 px tall. */
function hatMesh() {
  return merge(
    tint(cylinder(0.21, 0.15, 0.17, 12), '#e0483a'), tint(place(torus(0.215, 0.035, 12, 6), 0, 0.17, 0), '#fff3d6'),
    tint(place(cylinder(0.17, 0.17, 0.03, 12), 0, 0.15, 0), '#ffc93a'),
    tint(place(sphere(0.06, 8, 6), -0.06, 0.2, 0.02), '#ffd24a'), tint(place(sphere(0.06, 8, 6), 0.07, 0.19, -0.03), '#ffe27a'), tint(place(sphere(0.05, 8, 6), 0.0, 0.22, 0.06), '#ffd24a'),
  );
}

/**
 * The encounter on a stage, driven by stageState and game.recent.
 *   update(dt, time, { stage, recent, content, game, voice, hit, wear })      frame(camera, aspect, viewHeight, time, rect, pad)
 * Reads: goal (the objective as it is shown: a ring on the thing, or steps on the floor; screen positions are filled by frame),
 * tab { cx, half } (what the camera frames), cues, sparks, punch, power, won.
 */
function fightOn(S, opts = {}) {
  const set = S.set, troupe = S.troupe, sprites = S.sprites, lod = opts.lod || 'stage';
  const party = [], opp = [], extras = [], folk = [], hatters = [];
  const sched = []; for (let i = 0; i < 28; i++) sched.push({ on: false, t: 0, code: 0, a: null, b: null, n: 0 });
  const cues = [], cuePool = []; for (let i = 0; i < 12; i++) cuePool.push({ type: '', level: 0, name: '', team: false, big: false, x: NaN, y: NaN, who: null });
  const sparks = [], sparkPool = []; for (let i = 0; i < 14; i++) sparkPool.push({ x0: 0, y0: 0, x1: 0, y1: 0, t: 0, dur: 0.3, big: false, gold: false, who: null, pt: [0, 0, 0], live: false });
  const focus = { t: 9, dur: 0, x: 0, x2: 0, zoom: 1 };
  const tab = { cx: 0, half: HALF_W };
  const route = { x0: -2.2, x1: 2.0, z: 0.8 };
  const pips = []; for (let i = 0; i < MAX_PIPS; i++) pips.push({ x: 0, y: 0, on: false, lit: false });
  const goal = { on: false, kind: 'ring', pos: [0, 1, 0.3], size: 0.5, done: 0, total: 1, pulse: 0, pop: 0, x: NaN, y: NaN, r: 20, pips, n: 0, fade: 1 };
  const HIT = [0, 0], AIM = [0, 0, 0], W3 = [0, 0, 0];
  let clerk = null, seenN = -2, first = true, won = false, level = 0, turn = 0, oppTurn = 0, power = 0.6, punch = 0, mode = MODES.fight, kind = 'people';
  let done = 0, total = 1, beat = -2, dtLast = 0, stageRef = null, townsfolkId = '', clerkId = '', hitFn = null, nextAura = 0, timeNow = 0, auraOn = false, auraGold = false;
  let lastBark = '', wear = null, hatNode = null, hatGlow = null, hatT = 0, resolveT = 0, ppu = 40;

  const F = {
    key: '', party, opposition: opp, extras, folk, cues, sparks, focus, goal, tab,
    get punch() { return punch; }, get power() { return power; }, get won() { return won; }, get mode() { return mode; },
  };
  const at = (t, code, a, b, n) => { for (let i = 0; i < sched.length; i++) if (!sched[i].on) { const s = sched[i]; s.on = true; s.t = t; s.code = code; s.a = a; s.b = b; s.n = n || 0; return; } };   // pool full: the step is dropped, never grown
  const cue = (type) => { if (cues.length >= cuePool.length) return cuePool[0]; const c = cuePool[cues.length]; c.type = type; c.level = level; c.name = ''; c.team = false; c.big = false; c.x = NaN; c.y = NaN; c.who = null; cues.push(c); return c; };
  const ready = (a) => !!a && a.busyT <= 0 && !a.ch.busy && !a.held && !a.moving && a.kT > 8;
  const free = (list, n = list.length) => { for (let k = 0; k < n; k++) { const a = list[(turn + k) % n]; if (ready(a)) { turn = (turn + k + 1) % n; return a; } } return null; };
  const chestY = (a) => a.ch.height * 0.58;
  const wearOf = (id) => (wear && wear[id]) || id;
  const frac = () => (won ? 1 : total > 0 ? done / total : 0);
  const isUnit = (t) => !!t && !t.ch;
  const curUnit = () => Math.min(S.units.length - 1, Math.floor(done * S.units.length / Math.max(1, total)));
  /** The people the party is acting on: an opposition of people, or (holding a line, talking) the extras. */
  const front = () => (kind === 'people' ? opp : mode === MODES.hold || mode === MODES.talk ? extras : NOBODY);
  /** The thing a hit goes to: a person, the task unit in hand, or null (a route: the next step on the floor). */
  function target(rotate) {
    const fr = front();
    if (mode.route) return null;
    if (mode === MODES.talk && fr.length) return fr[Math.min(fr.length - 1, Math.floor(frac() * fr.length))];   // the one being won now
    if (mode === MODES.hold && fr.length) return fr[(rotate ? oppTurn++ : oppTurn) % fr.length];
    if (kind === 'people' && opp.length) return opp[0];    // the front of their line takes it; a big blow spills onto the rest
    if (S.units.length) return S.units[curUnit()];
    return null;
  }
  // where a blow at a person is carried to, by the lane of whoever throws it
  const tx = (t, a) => (isUnit(t) ? (t.stand ? t.stand[0] : t.pos[0] - 0.62) : t.x + t.kx - STANDOFF);
  const tz = (t, a) => (isUnit(t) ? (t.stand ? t.stand[1] : t.pos[2]) : t.z + LANE[a ? a.slot % 3 : 0]);
  const nPips = () => Math.min(MAX_PIPS, Math.max(1, total));
  const pipX = (k) => lerp(route.x0, route.x1, k / nPips());
  /** World point a bolt for target t lands on (and the ring sits on). */
  function aimOf(t, out) {
    if (isUnit(t)) { out[0] = t.pos[0]; out[1] = t.pos[1]; out[2] = t.pos[2]; return out; }
    if (t) return S.toWorld(t.x + t.kx, mode === MODES.talk ? t.ch.height * 0.8 : chestY(t), t.z, out);
    const k = Math.min(nPips(), Math.floor(frac() * nPips()) + 1);
    return S.toWorld(pipX(k), 0.05, route.z, out);
  }

  /** Energy from the table: a 2D spark from where the ball struck to the actor's chest, or (tableaux) to the thing itself. */
  function energy(ev, a, big, gold, t, dur) {
    cue('energy').who = a ? a.ch : null;
    let s = null; for (let i = 0; i < sparkPool.length; i++) if (!sparkPool[i].live) { s = sparkPool[i]; break; }
    if (!s) return;
    s.live = true; s.t = 0; s.big = !!big; s.gold = !!gold; s.who = t === undefined ? a : null; s.x0 = NaN; s.dur = dur || 0.3;
    if (t !== undefined) aimOf(t, s.pt);
    if (hitFn && ev && hitFn(ev, HIT)) { s.x0 = HIT[0]; s.y0 = HIT[1]; }
    sparks.push(s);
  }

  function land(t, by, big) {
    let x, y, z;
    aimOf(t === undefined ? null : t, AIM); x = AIM[0]; y = AIM[1]; z = AIM[2] + 0.15;
    if (isUnit(t)) t.wob = 1;
    else if (t) {
      if (mode === MODES.talk) { feel(t, 'shock', 0.5); if (!t.ch.busy && !t.held) t.ch.act(big ? 'nod' : 'hop'); }
      else {
        if (mode === MODES.fight) x = AIM[0] - 0.3 * (t.side > 0 ? -1 : 1);     // the blow stops short of a chibi's head: the stars are where the fist is
        if (!t.held) t.ch.act('hit');
        feel(t, 'shock', 0.7); knock(t, (t.side > 0 ? -1 : 1) * (big ? 0.5 : mode === MODES.hold ? 0.32 : 0.2), big ? 0.12 : 0);
      }
      if (t.ch.skin) t.ch.skin.flash[3] = 1;
    }
    if (sprites) {
      burst(sprites, x, y, z, big ? 9 : 5, big ? 0.5 : 0.3, big || mode.tab ? '#ffe27a' : '#ffffff', big ? 2.2 : 1.4);
      particle(sprites, K_PUFF, x, y, z, 0, 0.3, 0, big ? 0.2 : 0.14, big ? 0.34 : 0.24, big ? 0.4 : 0.3, '#fff6e0', 0, 1);
      if (big || mode.route) particle(sprites, K_RING, x, 0.03, z, 0, 0, 0, 0.3, big ? 2.2 : 1.1, 0.5, '#fff6e0');
    }
    goal.pulse = 1;
    punch = Math.max(punch, big ? 1 : mode.tab ? 0.22 : 0.3);
    const c = cue('hit'); c.big = !!big; c.who = t && !isUnit(t) ? t.ch : null;
  }

  /** One hit answered by one member. Fight: a blow carried across on the member's own lane. Tableaux: the working move of the mode, where they stand. */
  function strike(a, t, chop, time) {
    if (a.moving || a.held) return;
    if (!mode.tab) {
      const c = a.ch.act(chop ? mode.chop : mode.jab);
      feel(a, 'anger', 0.8);
      if (t) { const ant = Math.max(0.08, c.impact - 0.13); startDash(a, tx(t, a), tz(t, a), ant, c.impact - ant, 0.16, 0.3, 0.16, false); } else a.busyT = c.dur;
      at(time + c.impact, DO_LAND, t, a, 0); return;
    }
    if (mode === MODES.talk) { // a point made
      const poses = mode.poses; flash(a, poses[(turn++ + (chop ? 1 : 0)) % poses.length], 0.7); a.talk = -2; a.busyT = 0.5; feel(a, chop ? 'anger' : 'smile', 0.8);
      at(time + TAB_IMPACT, DO_LAND, t, a, chop ? 1 : 0); return;
    }
    if (mode.route) { // one step: the lead goes, the others follow a beat behind
      const c = a.ch.act(mode.jab); a.busyT = c.dur * 0.8; startDash(a, a.x + 0.24, a.z, 0.06, c.impact, 0.06, 0.22, mode === MODES.walk ? 0.05 : 0, false, 0);
      for (let k = 1; k < party.length; k++) at(time + 0.1 * k, DO_STEP, party[k], null, 0);
      at(time + TAB_IMPACT, DO_LAND, undefined, a, chop ? 1 : 0); return;
    }
    let name = mode.jab;
    if (mode === MODES.work) name = WORK_CLIP[isUnit(t) ? t.reach || (t.pos[1] > 1.05 ? 'up' : 'down') : 'push'] || 'workDown';
    const c = a.ch.act(name);
    feel(a, 'grim', 0.8); a.busyT = c.dur * 0.85;
    if (mode === MODES.hold && t) startDash(a, lerp(a.x, tx(t, a), mode.reach), a.z, 0.1, c.impact - 0.1, 0.14, 0.26, 0, false);
    at(time + c.impact, DO_LAND, t, a, chop ? 1 : 0);
  }

  function big(ev, time) {
    const t = target(true), a0 = party[0], a1 = party[1];
    if (mode.tab) {
      // the same move, struck in gold, and at a chain of two or more the second member goes in with it
      const a = pickActor(); energy(ev, a, true, true, t, LAG + TAB_IMPACT);
      if (a) at(time + LAG, DO_STRIKE, a, t, 1); else at(time + LAG + TAB_IMPACT, DO_LAND, t, null, 1);
      if (level >= 2) { const b = pickActor(); if (b && b !== a) at(time + LAG + 0.12, DO_STRIKE, b, t, 1); }
      for (let k = 2; k < party.length; k++) at(time + 0.35, DO_CHEER, party[k], null, 0);
      return;
    }
    if (level >= 3 && mode.team && ready(a0) && ready(a1) && t) {
      // THE TEAM MOVE: the camera goes in on the pair, the lead braces, the second runs up him and comes down on the target
      const c = teamMove(a0.ch, a1.ch), land0 = tx(t, a0), h = a1.ch.height;
      feel(a0, 'anger', 1.7); feel(a1, 'smile', 1.7);
      // the clip carries the follower 1.3 heights forward on its own, up and over the lead; the dash supplies the rest of the
      // way and only starts once she is in the air, so she goes over him and not through him
      startDash(a1, land0 - 1.3 * h + 0.2, t.z + 0.04, 0.7, 0.32, 0.2, 0.3, 0.2, true, 0);
      a0.busyT = c.dur; a1.busyT = c.dur;
      energy(ev, a0, true, true); energy(ev, a1, true, true);
      focus.t = 0; focus.dur = c.impact + 0.25; focus.x = (a0.x + a1.x) / 2 + 0.35; focus.x2 = land0 - 0.2; focus.zoom = 0.72;
      const q = cue('combo'); q.team = true; q.name = COMBO_NAMES[Math.min(level, COMBO_NAMES.length - 1)];
      for (const o of opp) feel(o, 'shock', c.impact + 0.6);
      for (let k = 2; k < party.length; k++) at(time + 0.3, DO_CHEER, party[k], null, 0);
      at(time + c.impact, DO_TEAM, t, a1, 0);
      return;
    }
    const a = free(party); if (!a) { land(t, null, false); return; }
    energy(ev, a, true, false);
    a.ch.act('windup'); a.held = true; feel(a, 'anger', 1.5); a.busyT = 1.3;
    if (sprites) for (let i = 0; i < 5; i++) { const an = i * 1.256; particle(sprites, K_STAR, a.x + Math.cos(an) * 0.6, chestY(a) + Math.sin(an) * 0.6, a.z + 0.2, -Math.cos(an) * 1.5, -Math.sin(an) * 1.5, 0, 0.22, 0.1, 0.4, '#ffe27a'); }
    at(time + CLIPS.windup.dur + 0.06, DO_RELEASE, a, t, 0);
    // at level 2 a second member goes in under the big one
    if (level >= 2) { const b = free(party); if (b && t) at(time + CLIPS.windup.dur + 0.2, DO_STRIKE, b, t, 0); }
  }

  function run(s, time) {
    const a = s.a, b = s.b;
    switch (s.code) {
      case DO_STRIKE: strike(a, b, s.n === 1, time); break;
      case DO_LAND: land(a === null ? undefined : a, b, s.n === 1); break;
      case DO_STEP: if (a && ready(a)) { const c = a.ch.act(mode.jab); a.busyT = c.dur * 0.8; startDash(a, a.x + 0.24, a.z, 0.06, c.impact, 0.06, 0.22, 0, false, 0); } break;
      case DO_RELEASE: {
        a.held = false; const c = a.ch.act('release');
        if (b) startDash(a, tx(b, a) - 0.15, tz(b, a), 0.02, c.impact - 0.02, 0.3, 0.34, 0.22, true);
        at(time + c.impact, DO_LAND, b, a, 1); break;
      }
      case DO_TEAM: {
        land(a, b, true); punch = 1;
        for (let k = 0; k < opp.length; k++) if (opp[k] !== a) at(time + 0.07 * (k + 1), DO_LAND, opp[k], b, 0);
        if (sprites) { const x = isUnit(a) ? a.pos[0] : a.x, z = isUnit(a) ? a.pos[2] : a.z; particle(sprites, K_RING, x, 0.03, z, 0, 0, 0, 0.4, 3.4, 0.6, '#ffe27a'); burst(sprites, x, 0.9, z + 0.2, 14, 0.6, '#ffe27a', 3); }
        break;
      }
      case DO_CHEER: if (a && !a.ch.busy && !a.held && !a.moving) { a.ch.act('cheer'); feel(a, 'smile', 1.4); } break;
      case DO_GIVE: { // the clerk (or the hat) has reached the party: hand it over
        const lead = party[0];
        if (a && !a.leaving) { a.ch.act('nod'); if (sprites) burst(sprites, a.x + 0.3, a.ch.height * 0.62, a.z + 0.1, s.n === 1 ? 10 : 5, s.n === 1 ? 0.45 : 0.3, s.n === 1 ? '#ffe27a' : '#ffffff', s.n === 1 ? 1.6 : 0.9); }
        if (lead && !lead.ch.busy && !lead.held) lead.ch.act(s.n === 1 ? 'cheer' : 'nod');
        if (s.n === 1) { for (const p of party) feel(p, 'smile', 1.6); hatT = 0; }
        const c = cue('boon'); c.who = lead ? lead.ch : null;
        break;
      }
      case DO_AWAY: if (a && S.actors.indexOf(a) >= 0) { if (s.n === 1 && stageRef && stageRef.buffs && stageRef.buffs.debt > 0) { a.gx = tab.cx - tab.half - 0.75; a.gz = 0.5; a.face = 60; } else { S.leave(a, false, -1); if (a === clerk) clerk = null; } } break;
      case DO_SETTLE: if (a && S.actors.indexOf(a) >= 0) settle(a); break;
      case DO_UNFOCUS: focus.t = 9; break;
    }
  }

  // supporters stand in the back row at the left of whatever the camera frames, and go along when it moves
  const folkX = (k) => tab.cx - tab.half + 0.4 + 0.62 * k;
  function settle(a) { // a townsperson takes a place behind the party
    const i = hatters.indexOf(a); if (i >= 0) hatters.splice(i, 1);
    if (folk.length >= MAX_FOLK) { S.leave(a, false, -1); return; }
    a.role = 'folk'; a.side = 1; a.gx = folkX(folk.length); a.gz = folk.length ? -0.1 : 0; a.face = 38; a.pose = 'stand'; folk.push(a);
  }
  function supporter(n, cut) { const a = S.enter(townsfolkId, 10 + n, lod, folkX(folk.length), folk.length ? -0.1 : 0, 38, cut ? null : tab.cx - tab.half - 1.3); a.role = 'folk'; a.side = 1; a.emote = 'smile'; a.pose = 'stand'; folk.push(a); return a; }
  function hat(time) { // two townsfolk come on with the hat and wait at the edge of the frame with it held out
    if (hatters.length || !townsfolkId) return;
    const left = tab.cx - tab.half;
    for (let k = 0; k < 2; k++) { const a = S.enter(townsfolkId, 20 + k, lod, left + 0.42 + k * 0.6, 1.36 - k * 0.3, 62, left - 1.3 - k * 0.7); a.role = 'hat'; a.side = 1; a.emote = 'smile'; a.pose = k === 0 ? 'talkBoth' : 'stand'; hatters.push(a); }
    hatT = 0;
  }
  /** The hat itself: carried in front of the first of them, glowing, dropping gold. Built on first use. */
  function hatProp(dt, time) {
    const h = hatters.length ? hatters[0] : null;
    if (!h) { if (hatNode) hatNode.visible = false; if (hatGlow) hatGlow.alpha = 0; return; }
    if (!hatNode) { S.mats = S.mats || kitMaterials(); hatNode = new Node('hat', { mesh: hatMesh(), material: S.mats.prop }); set.actors.add(hatNode); hatGlow = sprites ? sprites.add({ kind: 'glow', pos: [0, 0, 0], size: 1.1, color: '#ffd24a', alpha: 0 }) : null; }
    else if (hatNode.parent !== set.actors) set.actors.add(hatNode);
    hatT += dt;
    const x = h.x + 0.36, y = h.ch.height * 0.5 + Math.sin(time * 5) * 0.03, z = h.z + 0.2;
    hatNode.visible = true; hatNode.setPos(x, y, z); hatNode.setRot(-14, 0, Math.sin(time * 2.3) * 6); hatNode.setScale(1 + 0.12 * Math.max(0, Math.sin(time * 5)));
    if (hatGlow) { S.toWorld(x, y + 0.12, z + 0.05, W3); hatGlow.pos[0] = W3[0]; hatGlow.pos[1] = W3[1]; hatGlow.pos[2] = W3[2]; hatGlow.alpha = 0.55 + 0.25 * Math.sin(time * 5); }
    if (sprites && Math.floor(hatT * 3) !== Math.floor((hatT - dt) * 3)) { S.toWorld(x, y + 0.2, z, W3); particle(sprites, K_STAR, W3[0] + (Math.random() - 0.5) * 0.2, W3[1], W3[2], 0, 0.8, 0, 0.2, 0.08, 0.7, '#ffe27a'); }
  }

  /** Where the party stands. In the tableaux this is the staging: at the unit, on the route, at the line. */
  function partySlot(i, out) {
    const p = frac(), s = PARTY_SLOT[i];
    let x = s[0], z = s[1];
    if (mode.route) { x = lerp(route.x0, route.x1, p) - i * 0.72; z = i === 1 ? route.z - 0.42 : i === 2 ? route.z + 0.42 : route.z; }
    else if (mode === MODES.work) {
      const t = target(false);
      if (isUnit(t)) {
        // the lead at the thing's stand, the second on its far side facing back, a third behind the lead
        const sx = t.stand ? t.stand[0] : t.pos[0] - 0.62, sz = t.stand ? t.stand[1] : clamp(t.pos[2] + 0.35, 0.3, 1.2);
        if (i === 0) { x = sx; z = sz; } else if (i === 1) { x = t.pos[0] + Math.max(0.55, t.pos[0] - sx); z = sz - 0.08; } else { x = sx - 0.8; z = sz + 0.3; }
      } else if (t) x = t.gx - STANDOFF - 0.1 - i * 0.76;
    } else if (mode === MODES.hold) x = -0.5 - i * 0.74 + 0.55 * p;
    else if (mode === MODES.talk) x = -0.62 - i * 0.78;
    else if (kind === 'people') x = s[0] - 0.25 + 0.45 * p;
    out[0] = clamp(x, -HALF_W + 0.45 + 0.1 * i, HALF_W - 0.45); out[1] = z; return out;      // never off the strip
  }
  /** Which way a party member faces: toward the thing (a second worker stands on its far side). */
  const partyFace = (a) => (mode === MODES.work && a.slot === 1 && S.units.length ? -58 : 58);
  /** Who answers a hit. */
  function pickActor() {
    if (mode.route || mode === MODES.talk) return ready(party[0]) ? party[0] : mode === MODES.talk && ready(party[1]) ? party[1] : null;
    return free(party, mode === MODES.work ? Math.min(2, party.length) : party.length);
  }
  /** Where the people the party is acting on stand (tableaux): pressed back as the objective goes. */
  function frontSlot(i, out) {
    const p = frac(), s = OPP_SLOT[i];
    if (mode === MODES.hold) { out[0] = 0.62 + i * 0.78 + 0.85 * p; out[1] = s[1]; }
    else if (mode === MODES.talk) { out[0] = 0.72 + i * 0.8; out[1] = i === 1 ? 0.3 : i === 2 ? 1.2 : 0.78; }
    else if (mode.route) { out[0] = route.x1 + 0.95 + i * 0.7; out[1] = s[1]; }
    else { out[0] = s[0] + (mode.tab ? 0 : 0.5 * p); out[1] = s[1]; }
    return out;
  }
  /** What the camera frames: the fight keeps the strip; a tableau its party and the thing they are at. */
  function frameTab() {
    if (!mode.tab) { tab.cx = 0; tab.half = HALF_W; return; }
    let lo = 9, hi = -9;
    for (const a of party) { if (a.gx - 0.42 < lo) lo = a.gx - 0.42; if (a.gx + 0.42 > hi) hi = a.gx + 0.42; }
    if (mode.route) hi = Math.max(hi, (party[0] ? party[0].gx : 0) + 2.1);
    else {
      const t = target(false), fr = front();
      if (isUnit(t)) { lo = Math.min(lo, t.pos[0] - 0.5); hi = Math.max(hi, t.pos[0] + 0.5); }
      for (let i = 0; i < fr.length && i < 2; i++) hi = Math.max(hi, fr[i].gx + 0.45);
    }
    if (lo > hi) { lo = -HALF_TAB; hi = HALF_TAB; }
    tab.half = clamp((hi - lo) / 2 + 0.1, HALF_TAB, HALF_W);
    tab.cx = clamp((hi + lo) / 2, -HALF_W - 0.6 + tab.half, HALF_W + 0.6 - tab.half);
  }

  /** A new scene's encounter on this stage. Figures already here walk to their new places; cut: everyone is simply there. */
  function setup(st, cut, content, game) {
    stageRef = st; mode = MODES[st.mode] || MODES.fight; kind = st.opposition ? st.opposition.kind : 'people';
    won = false; done = st.progress.done; total = st.progress.total; beat = -2; turn = 0; oppTurn = 0; focus.t = 9; resolveT = 0;
    for (let i = 0; i < sched.length; i++) sched[i].on = false;
    const ch = content && game ? content.chapters[game.chapter] : null;
    townsfolkId = (ch && ch.stage && ch.stage.townsfolk) || opts.townsfolk || '';
    clerkId = (ch && ch.stage && ch.stage.clerk) || opts.clerk || '';
    party.length = 0; opp.length = 0; extras.length = 0;
    for (let i = hatters.length - 1; i >= 0; i--) if (S.actors.indexOf(hatters[i]) < 0 || hatters[i].leaving) hatters.splice(i, 1);
    for (let i = folk.length - 1; i >= 0; i--) if (S.actors.indexOf(folk[i]) < 0 || folk[i].leaving) folk.splice(i, 1);
    if (clerk && (S.actors.indexOf(clerk) < 0 || clerk.leaving)) clerk = null;
    if (set.encounter) set.encounter(st);
    // mark everyone, then claim who stays
    for (const a of S.actors) if (a.role !== 'folk' && a.role !== 'hat' && a !== clerk) a.role = 'old';
    if (kind === 'force') buildUnits(S, st.opposition.who); else S.clearUnits();
    // the route of the modes that are a journey: from the first thing to the last, or across the strip to the set's goal mark
    const gm = set.marks && set.marks.goal ? set.marks.goal.pos : null, nu = S.units.length;
    const stand = (u) => (u.stand ? u.stand[0] : u.pos[0] - 0.62);
    route.x1 = nu ? stand(S.units[nu - 1]) : gm ? gm[0] - 0.55 : 2.0; route.x0 = nu > 1 ? stand(S.units[0]) : Math.min(-2.2, route.x1 - 2.4); route.z = 0.8;
    const wants = (a, id) => a && a.wear === wearOf(id);
    for (let i = 0; i < st.party.length; i++) {
      const id = st.party[i]; let a = S.find(id);
      if (a && !wants(a, id)) { S.drop(a); a = null; }
      if (!a) a = S.enter(id, 0, lod, 0, 0, 0, cut ? null : -OFF_X - i * 0.5, wearOf(id));
      if (a.held) { a.ch.release(); a.held = false; }
      a.role = 'party'; a.side = 1; a.slot = i; a.pose = mode.hold; a.emote = mode === MODES.fight ? 'grim' : 'neutral'; party.push(a);
      a.speed = mode === MODES.stealth ? WALK * 0.6 : WALK;
    }
    for (const a of party) { partySlot(a.slot, SLOT); a.gx = SLOT[0]; a.gz = SLOT[1]; a.face = partyFace(a); if (cut) snapTo(a); }
    const people = kind === 'people' ? st.opposition.who : [];
    for (let i = 0; i < people.length; i++) {
      let a = null; for (const x of S.actors) if (x.id === people[i] && x.role === 'old' && !a && wants(x, people[i])) a = x;
      if (!a) a = S.enter(people[i], i, lod, 0, 0, 0, cut ? null : OFF_X + i * 0.5, wearOf(people[i]));
      if (a.held) { a.ch.release(); a.held = false; }
      a.role = 'opp'; a.side = -1; a.slot = i; a.pose = mode === MODES.hold ? 'brace' : 'stand'; a.emote = 'anger'; a.face = -58; opp.push(a);
      frontSlot(i, SLOT); a.gx = SLOT[0]; a.gz = SLOT[1]; if (cut) snapTo(a);
    }
    const ex = st.extras || [], marks = set.marks && set.marks.extras ? set.marks.extras : null;
    const pressing = kind !== 'people' && (mode === MODES.hold || mode === MODES.talk);     // the extras ARE who the party is acting on
    const unitR = nu ? S.units[nu - 1].pos[0] : 1.2;
    for (let i = 0; i < ex.length; i++) {
      let a = null; for (const x of S.actors) if (x.id === ex[i] && x.role === 'old' && !a && wants(x, ex[i])) a = x;
      let gx, gz, face = -42;
      if (marks && marks[i]) { gx = marks[i].pos[0]; gz = marks[i].pos[2]; face = marks[i].face; }
      else if (pressing) { frontSlot(i, SLOT); gx = SLOT[0]; gz = SLOT[1]; face = -58; }
      else if (mode.route) { gx = lerp(route.x0, route.x1, (i + 1) / (ex.length + 1)) + 0.35; gz = 0.04 - 0.06 * i; face = 6; }        // along the way, in the back row
      else if (mode.tab) { gx = Math.min(HALF_W - 0.3 - 0.5 * (ex.length - 1), nu ? unitR + 1.05 : 2.3) + i * 0.5; gz = 0.05 + (i % 2) * 0.5; }               // beside the thing, out of its way
      else { gx = BACK_R[i][0]; gz = BACK_R[i][1]; }
      if (!a) a = S.enter(ex[i], 30 + i, lod, gx, gz, 0, cut ? null : OFF_X + i * 0.6, wearOf(ex[i]));
      if (a.held) { a.ch.release(); a.held = false; }
      const seat = ex[i] === 'corvane' && set.marks && set.marks.seat && !(marks && marks[i]) ? set.marks.seat : null;
      a.role = 'extra'; a.side = -1; a.slot = i; a.pose = pressing && mode === MODES.hold ? 'brace' : 'stand'; a.emote = pressing ? 'anger' : 'neutral'; a.gx = gx; a.gz = gz; a.face = face; a.pinned = !!(marks && marks[i]);
      if (seat) { a.gx = seat.pos[0]; a.gz = seat.pos[2]; a.face = seat.face; a.pinned = true; }
      extras.push(a); if (cut) snapTo(a);
    }
    for (let i = S.actors.length - 1; i >= 0; i--) if (S.actors[i].role === 'old') S.leave(S.actors[i], cut);
    frameTab();
    // supporters already earned stand behind the party from the start
    const want = townsfolkId && st.buffs ? Math.min(MAX_FOLK, st.buffs.supporters || 0) : 0;
    while (folk.length < want) supporter(folk.length, true);
    for (const u of S.units) u.shown = unitV(S.units.indexOf(u));
    goal.pulse = 0; goal.pop = 0;
  }
  const unitV = (i) => (won ? 1 : S.units.length === 1 ? done / Math.max(1, total) : clamp(done * S.units.length / Math.max(1, total) - i, 0, 1));

  function win(time) {
    if (won) return; won = true; punch = Math.max(punch, 0.8); focus.t = 9; resolveT = 0;
    for (const o of opp) { o.ch.release(); o.dash.on = false; if (mode === MODES.talk) { o.emote = 'smile'; o.pose = 'stand'; o.ch.act('nod'); } else { o.ch.act(o === opp[0] ? 'yield' : 'surrender'); o.held = true; o.emote = 'tears'; } o.tempT = 0; }
    for (const p of party) { p.ch.release(); p.held = false; p.pose = 'stand'; p.emote = 'smile'; p.tempT = 0; at(time + 0.1 * p.slot, DO_CHEER, p, null, 0); }
    for (const e of extras) { e.emote = kind === 'people' ? 'shock' : 'smile'; e.pose = 'stand'; if (mode === MODES.hold) knock(e, 0.35, 0.6); else if (mode === MODES.talk && !e.ch.busy) e.ch.act('nod'); }
    for (const f of folk) at(time + 0.25, DO_CHEER, f, null, 0);
    aimOf(target(false), AIM);
    if (sprites) { burst(sprites, AIM[0], Math.max(0.9, AIM[1]), AIM[2] + 0.2, 14, 0.5, '#ffe27a', 2.4); particle(sprites, K_RING, AIM[0], 0.03, AIM[2], 0, 0, 0, 0.4, 2.6, 0.6, '#ffe27a'); }
    goal.pop = 1;
    cue('clear');
  }

  function onEvent(e, time) {
    const act = BEATS[e.type];
    if (!act || won) return;
    if (act === 'win') { win(time); return; }
    if (act === 'jab' || act === 'chop') {
      const t = target(true), a = mode.tab ? pickActor() : free(party);
      if (mode.tab) {
        // the bolt goes to the THING, timed to land as the hand does; with nobody free it still lands and the thing still answers
        energy(e, a, false, false, t, LAG + TAB_IMPACT);
        if (a) at(time + LAG, DO_STRIKE, a, t, act === 'chop' ? 1 : 0); else at(time + LAG + TAB_IMPACT, DO_LAND, t, null, 0);
        if (level >= 2 && !mode.route) { const b = pickActor(); if (b && b !== a) at(time + LAG + 0.12, DO_STRIKE, b, t, 1); }
        return;
      }
      if (!a) { if (isUnit(t)) t.wob = 0.5; return; }     // everyone is mid-move: the hit still counts, the stage just does not double up
      energy(e, a, false, false);
      at(time + LAG, DO_STRIKE, a, t, act === 'chop' ? 1 : 0);
      if (level >= 2) { const b = free(party); if (b) { energy(e, b, false, false); at(time + LAG + 0.11, DO_STRIKE, b, t, 1); } }   // level 2: two act together
    } else if (act === 'big') big(e, time);
    else if (act === 'boon') {
      if (e.kind === 'bust') { for (const p of party) feel(p, 'shock', 0.9); return; }
      for (const p of party) { energy(e, p, true, true); at(time + LAG + 0.05 * p.slot, DO_CHEER, p, null, 0); if (sprites) burst(sprites, p.x, p.ch.height + 0.25, p.z, e.kind === 'jackpot' ? 9 : 5, 0.4, '#ffe27a', 1.2); }
      const c = cue('boon'); c.who = party[0] ? party[0].ch : null; c.big = e.kind === 'jackpot';
    } else if (act === 'struck') {
      if (e.saved) { for (const p of party) feel(p, 'shock', 0.5); return; }
      // the setback: whoever opposes comes in, the whole party is driven back and holds there a moment
      const a = kind === 'people' ? opp[0] : extras[0];
      if (a && !a.held && !a.moving && !a.pinned) { const c = a.ch.act('strike'), v = party[0]; if (v) startDash(a, v.x + STANDOFF * 0.8, v.z, 0.1, c.impact - 0.1, 0.2, 0.4, 0.1, false); }
      else if (sprites) { P3[0] = tab.cx + tab.half + 0.6; P3[1] = 1.0; P3[2] = 0.7; V3[0] = -6; V3[1] = 0; V3[2] = 0; sprites.gust(P3, GUST); }
      for (const p of party) { if (p.held) { p.ch.release(); p.held = false; } p.dash.on = false; if (!p.moving) p.ch.act('hit'); knock(p, (partyFace(p) > 0 ? -1 : 1) * (0.55 + 0.1 * p.slot), 0.5); feel(p, p.slot === 0 ? 'shock' : 'tears', 1.5); p.busyT = 1.1; }
      for (const f of folk) feel(f, 'shock', 1.2);
      punch = Math.max(punch, 0.7); focus.t = 9;
      // the set's own tell for this encounter's setback, where it has one
      if (set.setback) set.setback(stageRef && stageRef.setback ? stageRef.setback.cue : '');
      if (set.passLamp) set.passLamp(); if (set.pourTea) set.pourTea();
      cue('break');
    } else if (act === 'saved') { for (const p of party) feel(p, 'smile', 0.8); }
    else if (act === 'loan') {
      if (!clerkId) return;
      const lead = party[0]; if (!lead) return;
      if (!clerk || S.actors.indexOf(clerk) < 0) clerk = S.enter(clerkId, 40, lod, 0, 0, 62, tab.cx - tab.half - 1.4);
      clerk.role = 'clerk'; clerk.side = 1; clerk.leaving = false; clerk.gx = lead.gx - 0.55; clerk.gz = lead.gz + 0.46; clerk.face = 62; clerk.speed = WALK * 1.25;
      const eta = Math.hypot(clerk.gx - clerk.x, clerk.gz - clerk.z) / clerk.speed;
      at(time + eta + 0.1, DO_GIVE, clerk, null, 0); at(time + eta + 0.9, DO_AWAY, clerk, null, 1);
      if (e.refused) for (const h of hatters) { feel(h, 'tears', 2); at(time + 1.2, DO_AWAY, h, null, 0); }
    } else if (act === 'aid') {
      if (!hatters.length) hat(time);
      const lead = party[0], h = hatters[0]; if (!h || !lead) return;
      h.gx = lead.gx - 0.6; h.gz = lead.gz + 0.46; h.speed = WALK * 1.25;
      const eta = Math.hypot(h.gx - h.x, h.gz - h.z) / h.speed;
      at(time + eta + 0.1, DO_GIVE, h, null, 1);
      for (let k = 0; k < hatters.length; k++) at(time + eta + 1.0 + k * 0.2, DO_SETTLE, hatters[k], null, 0);
    }
  }
  const GUST = { vel: V3, size: 1.5, life: 0.9, color: '#ffffff', alpha: 0.9 };

  F.update = (dt, time, f) => {
    const st = f.stage; dtLast = dt; timeNow = time; hitFn = f.hit || null; stageRef = st; wear = f.wear || null;
    cues.length = 0;
    const key = (f.game ? f.game.chapter + ':' + f.game.scene : 'x') + ':' + st.set + ':' + (st.opposition ? st.opposition.name : '');
    const cut = !!f.cut || first;
    if (key !== F.key || f.cut) { F.key = key; setup(st, cut, f.content, f.game); }
    first = false;
    // the chain
    const lv = st.combo ? st.combo.level : 0;
    if (lv > level && lv >= 2) { const c = cue('combo'); c.level = lv; c.name = (st.combo && st.combo.name) || COMBO_NAMES[Math.min(lv, COMBO_NAMES.length - 1)]; }
    level = lv;
    // new entries in the log
    const recent = f.recent || (f.game && f.game.recent) || null;
    if (recent && recent.length) {
      const lastN = recent[recent.length - 1].n;
      if (seenN === -2 && !f.replay) seenN = lastN;                         // first sight of a game already running: nothing old is replayed
      else if (lastN < seenN) seenN = lastN;                                // a load restarted the count
      else { for (let i = 0; i < recent.length; i++) { const e = recent[i]; if (e.n > seenN && e.type !== 'chain') onEvent(e, time); } seenN = lastN; }
    } else if (recent && seenN === -2) seenN = -1;
    // progress: the objective moved on
    const p = st.progress;
    if (p.total !== total) total = p.total;
    if (p.done > done && !won) {
      done = p.done; goal.pop = 1;
      const fr = front();
      if (mode === MODES.talk && fr.length) { const n = Math.floor(frac() * fr.length); for (let i = 0; i < fr.length; i++) if (i < n && fr[i].emote !== 'smile') { fr[i].emote = 'smile'; fr[i].tempT = 0; if (!fr[i].ch.busy) fr[i].ch.act('nod'); } }
      else if (kind === 'people' || mode === MODES.hold) for (const o of fr) { feel(o, 'shock', 1.1); knock(o, 0.3, 0.3); }
      for (const a of party) if (ready(a) && !mode.route) a.ch.act(mode === MODES.talk ? 'nod' : 'hop');
      if (sprites) { aimOf(target(false), AIM); burst(sprites, AIM[0], AIM[1], AIM[2] + 0.2, 9, 0.42, '#ffe27a', 1.9); }
      const c = cue('beat'); c.name = st.beat ? st.beat.name : '';
    } else if (p.done < done) done = p.done;
    if (st.phase === 'resolve') { win(time); resolveT += dt; }
    // the set is told which beat the scene is in
    const bi = st.beat ? st.beat.index : -1;
    if (bi !== beat) { beat = bi; if (set.beat && st.beat) set.beat(st.beat.cue, bi, st.beat.of, done, total); }
    // a line spoken in play (briefing, bark) may be a cue for the set too
    const said = f.voice && f.voice.line ? f.voice.line.id : '';
    if (said !== lastBark) { lastBark = said; if (said && set.cue) set.cue(said); }
    // scheduled steps
    for (let i = 0; i < sched.length; i++) if (sched[i].on && sched[i].t <= time) { sched[i].on = false; run(sched[i], time); }
    // places
    for (const a of party) {
      partySlot(a.slot, SLOT); a.gx = SLOT[0]; a.gz = SLOT[1];
      a.pose = won ? 'stand' : mode.hold;
      if (a.tempT <= 0 && !won) a.emote = level >= 2 ? 'smile' : mode === MODES.fight ? 'grim' : 'neutral';
      a.face = partyFace(a); a.st.energy = 0.8 + 0.25 * level;
    }
    if (!won) {
      const fr = front();
      for (const o of fr) { if (o.pinned) continue; frontSlot(o.slot, SLOT); o.gx = SLOT[0]; o.gz = SLOT[1]; if (o.tempT <= 0 && mode !== MODES.talk) o.emote = frac() > 0.6 ? 'shock' : 'anger'; }
    }
    frameTab();
    // supporters, the hat, the clerk
    const b = st.buffs || null;
    if (b && townsfolkId) {
      if (folk.length + hatters.length < Math.min(MAX_FOLK, b.supporters || 0)) supporter(folk.length, false);
      if (b.hat && !hatters.length) hat(time);
    }
    for (let k = 0; k < folk.length; k++) folk[k].gx = folkX(k);
    hatProp(dt, time);
    // who looks where, who is heard
    const lens = f.camera || S.camera, vw = f.voice && f.voice.who ? f.voice.who : '', vl = f.voice && f.voice.level != null ? f.voice.level : null;
    const t0 = party[0] || null, tg = target(false), look = isUnit(tg) ? tg.pos : tg ? tg.hp : null;
    for (const a of S.actors) {
      if (a.role === 'gone' || a.role === 'old') { a.talk = -1; continue; }
      if (a.busyT <= 0 || a.talk !== -2) a.talk = a.id === vw ? (vl == null ? -2 : Math.max(vl, 0.03)) : -1;
      const st2 = a.st;
      if (a.side > 0 && a.role !== 'clerk') st2.look = look;
      else if (a.side < 0) st2.look = mode === MODES.walk && lens ? null : t0 ? t0.hp : null;
      else st2.look = t0 ? t0.hp : null;
      if (won && lens && a.role === 'party') st2.look = 'camera';
    }
    // units follow the objective
    for (let i = 0; i < S.units.length; i++) {
      const u = S.units[i], v = unitV(i);
      if (v > u.shown + 0.001 && u.v >= 0 && sprites) { burst(sprites, u.pos[0], u.pos[1], u.pos[2] + 0.2, v >= 1 ? 10 : 5, v >= 1 ? 0.5 : 0.3, '#ffe27a', 1.6); if (v >= 1) particle(sprites, K_RING, u.pos[0], 0.03, u.pos[2], 0, 0, 0, 0.3, 1.8, 0.5, '#ffe27a'); }
      u.shown = v; u.v = u.v < 0 ? v : u.v + (v - u.v) * Math.min(1, dt * 6);
      u.set(u.v, time, dt);
    }
    // the table powers their world: lamps follow it, an empty table dims the stage, a hit kicks it
    const want = won ? 1 : st.power != null ? st.power : 0.6;
    power += (want - power) * Math.min(1, dt * (want > power ? 6 : 1.4));
    set.setPower(clamp(0.22 + 1.05 * power + punch * 0.25, 0, 1.5));
    const dim = clamp(0.3 + power * 1.2, 0.5, 1);
    for (const a of S.actors) if (a.ch.skin) { const tn = a.ch.skin.tint; tn[0] = tn[1] = dim; tn[2] = Math.min(1, dim + 0.06); }
    punch = Math.max(0, punch - dt * 3.0);
    // buffs: a standing glow on the party while a boon holds
    auraOn = !!b && ((b.shield || 0) > 0 || (b.double || 1) > 1); auraGold = !!b && (b.double || 1) > 1;
    for (const a of party) {
      if (auraOn && !a.aura && sprites) a.aura = sprites.add({ kind: 'glow', pos: [0, 0, 0], size: 1.5, color: '#8fd8ff', alpha: 0 });
      if (a.aura) { const g = a.aura; S.toWorld(a.x + a.ox + a.kx, a.ch.height * 0.5, a.z + a.oz - 0.1, g.pos); g.alpha += ((auraOn ? 0.34 + 0.08 * Math.sin(time * 4 + a.slot) : 0) - g.alpha) * Math.min(1, dt * 5); g.color[0] = auraGold ? 1 : 0.56; g.color[1] = auraGold ? 0.82 : 0.85; g.color[2] = auraGold ? 0.3 : 1; }
    }
    if (auraOn && sprites && time > nextAura) { nextAura = time + 0.22; const a = party[Math.floor(Math.random() * party.length)]; if (a) particle(sprites, K_STAR, a.x + (Math.random() - 0.5) * 0.5, 0.2, a.z + 0.1, 0, 0.9, 0, 0.16, 0.08, 0.8, auraGold ? '#ffe27a' : '#bfeaff'); }
    if (focus.t < 8) { focus.t += dt; if (focus.t > focus.dur + 0.2) focus.t = 9; }
    // the objective as it is shown
    goal.on = mode.tab && total > 0; goal.kind = mode.route ? 'route' : 'ring'; goal.done = won ? total : done; goal.total = total; goal.n = mode.route ? nPips() : 0;
    goal.pulse = Math.max(0, goal.pulse - dt * 3.2); goal.pop = Math.max(0, goal.pop - dt * 1.5);
    if (goal.on && !mode.route) {
      const fr = front();
      if (mode === MODES.hold && fr.length) S.toWorld(fr[0].x + fr[0].kx - 0.55, 0.62, 0.8, goal.pos);      // the line itself, between them
      else aimOf(tg, goal.pos);
      goal.size = isUnit(tg) ? tg.size || 0.5 : 0.5;
    }
  };

  /** The stage camera: what frameTab chose, pushed in on the pair for a team move, shaken by a blow. Also places the sparks and the objective on the glass. */
  F.frame = (camera, aspect, viewHeight, time, rect, pad, grow = 0) => {
    const fov = 24, tv = Math.tan(fov * DEG / 2);
    // the ground line sits just above whatever the HUD covers at the foot of the rectangle (pad.bottom, px), so feet
    // are never under the status strip, however tall the band is
    const d = Math.min(tab.half / (tv * aspect), 14.2), h = viewHeight || 220, foot = pad ? pad.bottom : 0;
    let cx = tab.cx, dd = d, cy = clamp((h / 2 - foot - 10) * (2 * d * tv) / h, 0.5, 1.5);
    if (aspect < 1.2 && party.length) {
      // grown toward full screen the frame is narrower than the strip: stay with the lead, and, once it is won, with the lead and the thing done
      const a = party[0]; cx = a.x;
      if (won) { aimOf(target(false), AIM); cx = Math.abs(AIM[0] - a.x) < 2.3 ? (a.x + AIM[0]) / 2 : a.x + 0.4; dd *= 1 - 0.1 * smooth(resolveT / 1.1); }
    }
    if (focus.t < 8) { const k = smooth(focus.t / 0.25) * (1 - smooth((focus.t - focus.dur + 0.1) / 0.2)); cx = lerp(cx, lerp(focus.x, focus.x2, smooth((focus.t - 0.6) / 0.4)), k); dd *= lerp(1, focus.zoom, k); cy = lerp(cy, cy * focus.zoom + 0.12, k); }
    RT[0] = cx; RT[1] = cy; RT[2] = 0.5;
    PROBE.fov = fov; PROBE.orbit(RT, dd, (mode.tab ? 5 : 7) + Math.sin(time * 0.21) * 1.0, 7);
    rigTo(S.rig, camera, dtLast, false, focus.t < 8 ? 9 : 5, time, punch);
    S.view.shadowCenter[0] = S.rig.x; S.view.shadowCenter[2] = 0.2; S.view.shadowRadius = tab.half + 2.2; set.env.shadow.center = S.view.shadowCenter; set.env.shadow.radius = S.view.shadowRadius;
    if (set.foreground) set.foreground.visible = false;
    if (set.wings) for (let i = 0; i < set.wings.length; i++) set.wings[i].visible = aspect < 1.6;   // a set's far sides are outside the band at rest: not drawn until it grows
    if (S.fill) S.fill.light.intensity = 0.6;
    set.env.outline.width = inkFor(camera, viewHeight || 220, party[0] ? party[0].ch.headRadius : 0.2);
    troupe.aim(camera);
    S.camera = camera;
    ppu = h / (2 * S.rig.d * tv);
    if (rect) {
      camera.update(aspect);
      // sparks: aim each at its actor's chest as it is now (or at the thing), and run it
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i], a = s.who;
        if (a) S.toWorld(a.x + a.ox + a.kx, chestY(a), a.z + a.oz, P3); else { P3[0] = s.pt[0]; P3[1] = s.pt[1]; P3[2] = s.pt[2]; }
        if (projectTo(camera, P3, rect, HIT)) { s.x1 = HIT[0]; s.y1 = HIT[1]; }
        if (s.x0 !== s.x0) { s.x0 = rect.x + rect.w * (0.3 + 0.4 * ((i * 0.37) % 1)); s.y0 = rect.y + rect.h + 60; }   // the shell gave no table point: rise from under the seam
        s.t += dtLast / s.dur;
        if (s.t > 1.25) { s.live = false; sparks.splice(i, 1); }
      }
      // the objective: the ring on the thing, or the steps along the floor
      goal.x = NaN;
      if (goal.on && goal.kind === 'ring') {
        if (projectTo(camera, goal.pos, rect, HIT)) { goal.x = HIT[0]; goal.y = HIT[1]; goal.r = clamp(goal.size * ppu * 0.62, 15, 30); }
      } else if (goal.on) {
        const n = goal.n, lit = Math.floor(frac() * n + 1e-6);
        for (let k = 0; k < MAX_PIPS; k++) {
          const q = pips[k]; q.on = false; if (k >= n) continue;
          S.toWorld(pipX(k + 1), 0.03, route.z + 0.38, P3);
          if (projectTo(camera, P3, rect, HIT)) { q.on = true; q.x = HIT[0]; q.y = HIT[1]; q.lit = k < lit; }
        }
        goal.r = clamp(0.09 * ppu, 4, 8);
      }
      goal.fade = 1 - clamp(grow * 2.5, 0, 1);
    } else { for (let i = 0; i < sparks.length; i++) sparks[i].live = false; sparks.length = 0; goal.x = NaN; }
  };
  return F;
}
const NOBODY = [];

/**
 * A scene's encounter played from table events (the slice API; the game goes through createDirector).
 *   def = { party: [cast ids], opposition: [cast ids], title, mode }
 *   update(dt, time, events, progress)       events: this frame's table events; progress { done, total }
 *   frame(camera, aspect, time, viewHeight, rect)
 */
export function createEncounter(set, troupe, def) {
  const S = stageOn(set, troupe), F = S.fight || (S.fight = fightOn(S, { lod: def.lod || 'stage', townsfolk: def.townsfolk, clerk: def.clerk }));
  const st = {
    set: set.id, light: set.light, mode: def.mode || 'fight', party: def.party, opposition: { kind: 'people', who: def.opposition, name: def.title || '' }, extras: def.extras || [],
    progress: { done: 0, total: 1 }, beat: null, setback: null, combo: { count: 0, level: 0, left: 0, last: -Infinity, name: '' }, power: 0.6, buffs: null, phase: 'fight',
  };
  const input = { stage: st, recent: [], content: null, game: null, voice: null, hit: null, camera: null, cut: false, replay: true };
  let n = 0, cleared = false;
  const enc = {
    stage: S, fight: F, title: def.title || '', view: S.view, cues: F.cues, sparks: F.sparks,
    get party() { return F.party.map((a) => a.ch); }, get opposition() { return F.opposition.map((a) => a.ch); },
    get log() { return input.recent; }, combo: st.combo,
    get resolve() { return cleared ? 0 : 1 - st.progress.done / Math.max(1, st.progress.total); }, get power() { return F.power; }, get punch() { return F.punch; }, get won() { return F.won; },
    reset() { cleared = false; st.phase = 'fight'; F.key = ''; },
    update(dt, time, events, progress) {
      if (events) for (let i = 0; i < events.length; i++) {
        const e = events[i], type = e.type === 'rollover' ? 'lane' : e.type;
        if (type === 'sceneClear') { cleared = true; continue; }
        if (BEATS[type] || COMBO_WEIGHT[type]) input.recent = pushRecent(input.recent, { n: n++, t: time, type, id: e.id, kind: e.kind });
      }
      if (progress) { st.progress.done = progress.done; st.progress.total = progress.total; }
      st.combo = enc.combo = comboOf(input.recent, time); st.phase = cleared ? 'resolve' : 'fight';
      const fresh = time - st.combo.last;
      st.power = Math.min(1, 0.55 + 0.1 * st.combo.level + (fresh < 6 ? 0.15 * (1 - fresh / 6) : 0));
      F.update(dt, time, input); S.tick(dt, time, S.camera);
    },
    frame(camera, aspect, time, viewHeight = 220, rect = null) { F.frame(camera, aspect, viewHeight, time, rect); return camera; },
    /** First-round call: the lines are spoken on the fight's stage, framed on the speaker (a character) and whoever stands nearest. */
    dialogue(camera, aspect, time, speaker, viewHeight = 400) {
      let sp = null, other = null;
      for (const a of S.actors) if (a.ch === speaker) sp = a;
      if (!sp) { F.frame(camera, aspect, viewHeight, time, null); return camera; }   // nobody of that name yet (the first frame): the stage camera
      for (const a of S.actors) { a.talk = a === sp ? -2 : -1; if (a !== sp && !a.leaving && (!other || Math.abs(a.x - sp.x) < Math.abs(other.x - sp.x))) other = a; }
      if (sp.held) { sp.ch.release(); sp.held = false; }
      HEADS.length = 0; HEADS.push(sp.hp); if (other) HEADS.push(other.hp);
      frameHeads(PROBE, HEADS, { aspect, fov: 26, yaw: (sp.side || 1) * -8 + Math.sin(time * 0.2) * 1.2, pitch: 5, pad: 0.4, fillH: 0.46, fillW: 0.86, at: 0.44 });
      rigTo(S.rig, camera, 1 / 60, false, 5, time, 0);
      set.env.outline.width = inkFor(camera, viewHeight, sp.ch.headRadius); troupe.aim(camera); S.camera = camera;
      return camera;
    },
  };
  return enc;
}

// ------------------------------------------------------------------------------------ the director

/** The comet a spark draws: a tapering tail along a bowed path and a four-point star at its head. s.t runs 0..1.25. */
function drawSpark(ctx, s) {
  const bow = (s.x1 - s.x0 > 0 ? -1 : 1) * Math.min(46, Math.abs(s.y1 - s.y0) * 0.16);
  ctx.lineCap = 'round'; ctx.globalAlpha = s.t > 1 ? Math.max(0, 1 - (s.t - 1) * 4) : 1;
  let px = 0, py = 0;
  for (let k = 9; k >= 0; k--) {
    const c = clamp(s.t - k * 0.03, 0, 1), e = c * c * (3 - 2 * c), x = s.x0 + (s.x1 - s.x0) * e + Math.sin(e * Math.PI) * bow, y = s.y0 + (s.y1 - s.y0) * e;
    if (k < 9) { ctx.strokeStyle = s.gold ? '#ffc93a' : k > 5 ? '#ffb347' : '#ffe98a'; ctx.lineWidth = (s.big ? 9 : 6) * (1 - k / 10); ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke(); }
    px = x; py = y;
  }
  const r = s.big ? 9 : 6;
  ctx.fillStyle = '#ffffff'; ctx.beginPath();
  for (let i = 0; i < 8; i++) { const an = i * Math.PI / 4 + s.t * 3, rr = i % 2 ? r * 0.38 : r; ctx.lineTo(px + Math.cos(an) * rr, py + Math.sin(an) * rr); }
  ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
}

/**
 * The whole of the stage for the game: which set, the encounter while the table is in play, its resolution, the
 * lines that follow on the same stage, and a dissolve through ink when the story goes somewhere else.
 *
 *   createDirector(troupe, { getSet(key, light) -> built set | null, lod = 'stage' (the figures of the live band) })
 *   update(dt, time, f)   f = { content, game, stage (core stageState), camera, rect { x, y, w, h } CSS px, voice { who, level } | null,
 *                               hit(ev, out) -> bool (CSS px on the table where recent event ev happened) }
 * Reads: set (null: draw nothing), view (spread into the render rectangle), fade 0..1 and fadeColor, sparks, anchors,
 * sub, cues, punch, combo-level camera work is inside. headOf(castId, out). drawOverlay(ctx2d).
 */
export function createDirector(troupe, { getSet, lod = 'stage' } = {}) {
  if (typeof getSet !== 'function') throw new Error('createDirector: getSet(key, light) is required');
  let S = null, cur = null, fade = 1, was = '', cutNext = true;
  const NONE = [], HP = [0, 0, 0], XY = [0, 0], anchors = {}, anchorPool = {};
  const lineIn = { line: null, on: NONE, cam: '', voice: null, camera: null, cut: false, emotes: null, radio: false, speaker: '', emote: '' };
  const fightIn = { stage: null, recent: null, content: null, game: null, voice: null, hit: null, camera: null, cut: false, replay: false };
  const dir = {
    set: null, view: null, fade: 1, fadeColor: '#131a3a', sparks: NONE, cues: NONE, anchors, punch: 0, phase: 'idle',
    sub: { who: '', onStage: false, x: NaN, y: NaN, radio: false },
    get stage() { return S; },
    headOf(id, out) { if (!S || !S.camera || !dir.rect) return false; const a = S.find(id); if (!a) return false; HP[0] = a.ch.headPos[0]; HP[1] = a.ch.headPos[1] + a.ch.headRadius * 1.2; HP[2] = a.ch.headPos[2]; return projectTo(S.camera, HP, dir.rect, out); },
    rect: null,
    drawOverlay(ctx) { const sp = dir.sparks; for (let i = 0; i < sp.length; i++) drawSpark(ctx, sp[i]); },
    dispose() { if (S) S.clear(); S = null; cur = null; dir.set = null; },
    update(dt, time, f) {
      const st = f.stage, rect = f.rect, camera = f.camera, aspect = rect.w / Math.max(1, rect.h);
      dir.rect = rect; dir.phase = st.phase;
      const want = st.set ? getSet(st.set, st.light) : null;
      // somewhere else: ink closes over the old set, the new one opens from it
      if (want !== cur) {
        fade = Math.min(1, fade + dt / 0.2);
        if (fade >= 1 || !cur) { if (S) S.clear(); cur = want; S = cur ? stageOn(cur, troupe) : null; if (S) { S.clear(); S.lines = S.lines || linesOn(S); S.fight = S.fight || fightOn(S, { lod }); } cutNext = true; was = ''; fade = 1; }
      } else if (fade > 0) fade = Math.max(0, fade - dt / 0.32);
      dir.fade = fade; dir.set = cur; dir.view = S ? S.view : null;
      dir.sparks = NONE; dir.cues = NONE; dir.punch = 0; dir.sub.who = ''; dir.sub.onStage = false; dir.sub.x = NaN; dir.sub.y = NaN; dir.sub.radio = false;
      for (const k in anchors) delete anchors[k];
      if (!S) return;
      const leaving = want !== cur;      // fading out: the old stage holds as it was
      cur.update(time, dt);
      const cut = cutNext && !leaving;
      const fighting = st.phase === 'fight' || st.phase === 'resolve';
      const mode = leaving ? was : fighting ? 'fight' : st.phase === 'dialogue' ? 'lines' : 'idle';
      if (mode === 'fight') {
        fightIn.stage = st; fightIn.content = f.content; fightIn.game = f.game; fightIn.recent = f.game ? f.game.recent : null; fightIn.voice = f.voice || null; fightIn.hit = f.hit || null; fightIn.camera = camera; fightIn.cut = cut;
        if (!leaving) { if (was === 'lines') S.lines.reset(); S.fight.update(dt, time, fightIn); }
        if (S.floorRoot) S.floorRoot.visible = true;
        S.tick(dt, time, camera);
        S.fight.frame(camera, aspect, rect.h, time, rect, f.pad || null);
        dir.sparks = S.fight.sparks; dir.cues = S.fight.cues; dir.punch = S.fight.punch;
      } else if (mode === 'lines') {
                lineIn.line = st.line || null; lineIn.on = st.party || NONE; lineIn.cam = st.cam || ''; lineIn.voice = f.voice || null; lineIn.camera = camera; lineIn.cut = cut; lineIn.radio = !!st.radio;
        if (!leaving) S.lines.update(dt, time, lineIn);
        S.tick(dt, time, camera);
        S.lines.frame(camera, aspect, rect.h, time, cut, false);
        // the lamps come back up for the lines, whatever the table was doing
        cur.setPower(1);
        for (const a of S.actors) if (a.ch.skin) { const tn = a.ch.skin.tint; tn[0] += (1 - tn[0]) * Math.min(1, dt * 4); tn[1] = tn[0]; tn[2] = Math.min(1, tn[0] + 0.06); }
        for (const u of S.units) u.set(u.v < 0 ? 1 : u.v, time, dt);
        if (S.floorRoot) S.floorRoot.visible = false;      // a stand-in prop on the strip would be walked through: it is struck for the lines
      } else {
        S.tick(dt, time, camera);
        cur.frame(PROBE, cur.cameras.wide ? 'wide' : Object.keys(cur.cameras)[0], time); rigTo(S.rig, camera, dt, cut, 3, time, 0);
        S.view.shadowRadius = 8; S.camera = camera;
      }
      if (!leaving) { was = mode; cutNext = false; }
      // where heads are on screen, for speech ticks and name tags
      camera.update(aspect);
      for (const a of S.actors) {
        if (a.leaving || anchors[a.id]) continue;
        HP[0] = a.ch.headPos[0]; HP[1] = a.ch.headPos[1] + a.ch.headRadius * 1.2; HP[2] = a.ch.headPos[2];
        if (!projectTo(camera, HP, rect, XY)) continue;
        const o = anchorPool[a.id] || (anchorPool[a.id] = { x: 0, y: 0 }); o.x = XY[0]; o.y = XY[1]; anchors[a.id] = o;
      }
      const who = f.voice && f.voice.who ? f.voice.who : st.speaker || '';
      dir.sub.who = who; dir.sub.radio = !!st.radio;
      if (who && anchors[who] && !st.radio) { dir.sub.onStage = true; dir.sub.x = anchors[who].x; dir.sub.y = anchors[who].y; }
    },
  };
  return dir;
}
