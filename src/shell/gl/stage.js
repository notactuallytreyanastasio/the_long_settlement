// Putting the cast on a set: the cutscene director and the live encounter stage.
//
//   const troupe = createTroupe({ detail: 1 });               one figure material + one face atlas for every character
//   const cine = createCine(set, troupe, { on: ['nan', 'ren', 'ilse'] });
//   cine.update(dt, time, { speaker: 'nan', emote: 'smile', cam: 'close', camera, aspect });   then renderer.render(set.scene, camera, time, cine.view)
//
//   const enc = createEncounter(set, troupe, { party: ['ren', 'ilse', 'nan'], opposition: ['bailiff', 'bailiff', 'bailiff'] });
//   enc.update(dt, time, tableEventsThisFrame, { done, total });   poses the fight from pinball events
//   enc.frame(camera, aspect, time);                                then renderer.render(set.scene, camera, time, { x, y, w, h, ...enc.view })
//
// comboOf(log, now) is pure and has no imports from here: it is meant to move into src/core.
// A set is what sets/lantern-stalls.js build() returns (see index.js for the shape).

import { DEG } from './math.js';
import { Node, makeLight } from './scene.js';
import { createCharacter, CAST, CLIPS, figureMaterial, teamMove } from './characters.js';
import { createFaces } from './faces.js';

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

/** One material and one face atlas shared by every figure. `spawn(idOrDef)` returns a character (see characters.js). */
export function createTroupe({ detail = 1, material = null } = {}) {
  const figMat = material || figureMaterial();
  const faces = createFaces({ figure: figMat });
  return {
    figMat, faces, detail,
    spawn(idOrDef, opts = {}) {
      const def = typeof idOrDef === 'string' ? CAST[idOrDef] : idOrDef;
      if (!def) throw new Error(`troupe: no cast member "${idOrDef}" (have ${Object.keys(CAST).join(', ')})`);
      return createCharacter(def, { faces, material: figMat, detail: opts.detail ?? detail });
    },
  };
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

function lampGlow(set, ch, alpha) {
  return ch.lampPos && set.scene.sprites ? set.scene.sprites.add({ kind: 'glow', pos: [0, 0, 0], size: 0.95, color: '#ffa63f', alpha }) : null;
}
function followGlow(ch) { if (ch.glow) { ch.glow.pos[0] = ch.lampPos[0]; ch.glow.pos[1] = ch.lampPos[1]; ch.glow.pos[2] = ch.lampPos[2]; } }

// ------------------------------------------------------------------------------------ cutscenes

const CINE_FILL = { dusk: 0.95, night: 1.15, day: 0 };

/**
 * A cutscene on a set. `on` lists cast ids left to right; they stand on set.marks.a / b / c (two: marks.two).
 * update(dt, time, { speaker, emote, emotes: { id: emote }, cam: 'wide' | 'two' | 'close' | 'low', camera, aspect, viewHeight, snap })
 * poses everyone (the speaker talks, the others look at the speaker) and places `camera`. `view` holds the
 * shadow fit for the renderer's view rectangle.
 */
export function createCine(set, troupe, { on = ['nan', 'ren', 'ilse'], fill = true } = {}) {
  const spots = on.length === 2 ? set.marks.two : on.length === 1 ? [set.marks.b] : [set.marks.a, set.marks.b, set.marks.c];
  const cast = {}, list = [];
  on.forEach((id, i) => {
    const ch = troupe.spawn(id), m = spots[i];
    ch.id = id; ch.mark = m; ch.root.setPos(m.pos[0], m.pos[1], m.pos[2]); set.actors.add(ch.root);
    ch.glow = lampGlow(set, ch, set.light === 'day' ? 0.25 : 0.85);
    ch.state = { emote: 'neutral', speaking: false, look: null, face: m.face, camera: null, wind: [0, 0, 0], snap: false, pose: 'stand' };
    cast[id] = ch; list.push(ch);
  });
  // a warm key from the lantern side, in front of the cast: without it every face toward the camera is in shadow tone at dusk
  let fillNode = null;
  if (fill && CINE_FILL[set.light] > 0) {
    fillNode = new Node('cineFill', { pos: [-1.9, 2.3, 3.3], light: makeLight({ color: '#ffc98a', radius: 7.5, intensity: CINE_FILL[set.light] }) });
    set.scene.root.add(fillNode);
  }
  const view = { shadowCenter: [0, 0, 0.5], shadowRadius: 3 }, heads = [], H2 = [0, 0, 0], H3 = [0, 0, 0];
  let lastCam = '', lastSpeaker = '';
  const cine = {
    cast, list, view, fill: fillNode,
    update(dt, time, s) {
      const sp = cast[s.speaker] || null, camName = s.cam || 'wide', camera = s.camera, aspect = s.aspect || 0.46;
      const cut = s.snap || camName !== lastCam || (camName === 'close' && s.speaker !== lastSpeaker);
      lastCam = camName; lastSpeaker = s.speaker;
      // who the speaker talks to: the nearest other
      let other = null;
      if (sp) for (const ch of list) if (ch !== sp && (!other || Math.abs(ch.mark.pos[0] - sp.mark.pos[0]) < Math.abs(other.mark.pos[0] - sp.mark.pos[0]))) other = ch;
      for (const ch of list) {
        const st = ch.state, me = ch === sp;
        st.emote = (s.emotes && s.emotes[ch.id]) || (me ? s.emote || 'neutral' : 'neutral');
        st.speaking = me; st.camera = camera; st.snap = cut;
        st.look = me ? (camName === 'close' ? 'camera' : other ? other.headPos : 'camera') : sp ? sp.headPos : 'camera';
        // the body turns part of the way toward whoever is speaking; the head does the rest
        const toward = me ? other : sp;
        st.face = ch.mark.face + (toward ? clamp((toward.mark.pos[0] - ch.mark.pos[0]) * 26, -34, 34) : 0);
        st.wind[0] = 0.5 + Math.sin(time * 0.9 + ch.mark.pos[0]) * 0.9; st.wind[2] = Math.sin(time * 1.3) * 0.5;
        if (s.pose && me) st.pose = s.pose; else st.pose = 'stand';
        ch.update(dt, st); followGlow(ch);
      }
      if (!camera) return;
      const drift = s.still ? 0 : time;
      if (camName === 'close' && sp) {
        const side = sp.mark.pos[0] < -0.2 ? 1 : sp.mark.pos[0] > 0.2 ? -1 : (other && other.mark.pos[0] < sp.mark.pos[0] ? -1 : 1);
        heads.length = 0; heads.push(sp.headPos);
        frameHeads(camera, heads, { aspect, fov: 24, yaw: side * 17 + Math.sin(drift * 0.23) * 1.2, pitch: 3, pad: sp.headRadius * 1.25, fillH: 0.34, fillW: 0.74, at: 0.37 });
        view.shadowCenter[0] = sp.mark.pos[0]; view.shadowCenter[2] = sp.mark.pos[2]; view.shadowRadius = 2.2;
      } else if (camName === 'two' && sp && other) {
        H2[0] = sp.headPos[0]; H2[1] = sp.headPos[1]; H2[2] = sp.headPos[2]; H3[0] = other.headPos[0]; H3[1] = Math.min(other.headPos[1], sp.headPos[1]) - 0.42; H3[2] = other.headPos[2];
        heads.length = 0; heads.push(H2, H3);
        const side = sp.mark.pos[0] < other.mark.pos[0] ? 1 : -1;
        frameHeads(camera, heads, { aspect, fov: 28, yaw: side * 13 + Math.sin(drift * 0.2) * 1.2, pitch: 4, pad: 0.36, fillH: 0.5, fillW: 0.94, at: 0.4 });
        view.shadowCenter[0] = (sp.mark.pos[0] + other.mark.pos[0]) / 2; view.shadowCenter[2] = 0.5; view.shadowRadius = 3.2;
      } else {
        const name = set.cameras[camName] ? camName : 'wide';
        set.frame(camera, name, drift);
        const v = set.view(name); view.shadowCenter[0] = v.shadowCenter[0]; view.shadowCenter[1] = v.shadowCenter[1]; view.shadowCenter[2] = v.shadowCenter[2]; view.shadowRadius = v.shadowRadius;
      }
      set.env.outline.width = inkFor(camera, s.viewHeight || 852, list[0].headRadius);
    },
  };
  return cine;
}

// ------------------------------------------------------------------------------------ combos (pure)

/** How much each table event adds to a chain. Anything not listed does not count. */
export const COMBO_WEIGHT = { bumper: 1, sling: 1, rollover: 1, target: 2, saucer: 2, shot: 3, payout: 3, objective: 2 };
export const COMBO_NAMES = ['', '', 'DOUBLE', 'LANTERN RUSH', 'FESTIVAL STORM'];

/**
 * The combo a log of table events amounts to at time `now`. `log` is [{ t (seconds), type }], oldest first.
 * A drain ends the chain; so does `window` seconds without a counting event. Pure: same log, same answer.
 * Returns { count, level 0..4, last (time of the last counting event), left (0..1 of the window remaining) }.
 */
export function comboOf(log, now, { window = 4.5, levels = [1, 5, 11, 20] } = {}) {
  let count = 0, last = -1e9;
  for (let i = 0; i < log.length; i++) {
    const e = log[i];
    if (e.t > now) break;
    if (e.type === 'drain') { count = 0; last = -1e9; continue; }
    const w = COMBO_WEIGHT[e.type]; if (!w) continue;
    if (e.t - last > window) count = 0;
    count += w; last = e.t;
  }
  if (now - last > window) count = 0;
  let level = 0; while (level < levels.length && count >= levels[level]) level++;
  return { count, level, last, left: count > 0 ? 1 - (now - last) / window : 0 };
}

// ------------------------------------------------------------------------------------ the live stage

/** Which stage action a table event becomes, by combo level. Data, so a scene can override it. */
export const BEATS = {
  bumper: { act: 'jab' }, sling: { act: 'jab' }, rollover: { act: 'jab' },
  target: { act: 'chop' }, saucer: { act: 'chop' },
  shot: { act: 'big' }, objective: { act: 'advance' }, payout: { act: 'boon' },
  drain: { act: 'struck' }, sceneClear: { act: 'win' },
};

/**
 * A scene's encounter, played on the set's stage strip from pinball events.
 *   def = { party: [cast ids], opposition: [cast ids], title }
 *   update(dt, time, events, progress)   events: this frame's table events (table3d.tableEvents); progress { done, total }
 *   frame(camera, aspect, time, viewHeight)   stage camera (with punch), shadow fit in .view
 * Read back: combo { count, level, left }, resolve 0..1 (the opposition's bar), power 0..1.3 (fed to set.setPower),
 * punch 0..1, cues [] (things the HUD draws this frame: { type: 'energy' | 'hit' | 'combo' | 'boon', who, pos })
 */
export function createEncounter(set, troupe, def) {
  const detail = def.detail ?? 0.6;
  const mk = (id, m, side, i) => {
    const ch = troupe.spawn(id, { detail }); ch.id = id + i; ch.mark = m; ch.side = side;
    ch.root.setPos(m.pos[0], m.pos[1], m.pos[2]); set.actors.add(ch.root);
    ch.glow = lampGlow(set, ch, 0.8);
    ch.state = { emote: side > 0 ? 'grim' : 'anger', speaking: false, look: null, face: m.face, camera: null, wind: [0.6, 0, 0], pose: 'stand', energy: 1 };
    ch.emoteT = 0; return ch;
  };
  const party = def.party.map((id, i) => mk(id, set.marks.party[i], 1, i));
  const opp = def.opposition.map((id, i) => mk(id, set.marks.opposition[i], -1, i));
  const all = [...party, ...opp];
  const log = [], pending = [], cues = [], sprites = set.scene.sprites, P = [0, 0, 0];
  const view = { ...set.view('stage') };
  let turn = 0, power = 0.7, punch = 0, resolve = 1, shown = 1, won = false, advance = 0;
  const enc = {
    party, opposition: opp, all, log, cues, view, combo: { count: 0, level: 0, left: 0, last: -1e9 },
    get resolve() { return shown; }, get power() { return power; }, get punch() { return punch; }, get won() { return won; },
    title: def.title || '',
  };
  const later = (t, fn, a, b) => pending.push({ t, fn, a, b });
  const free = (list) => { for (let k = 0; k < list.length; k++) { const ch = list[(turn + k) % list.length]; if (!ch.busy && !ch.held) { turn = (turn + k + 1) % list.length; return ch; } } return null; };
  const feel = (ch, emote, secs) => { ch.state.emote = emote; ch.emoteT = secs; };
  const chest = (ch, out) => { out[0] = ch.headPos[0]; out[1] = ch.headPos[1] - ch.headRadius * 1.3; out[2] = ch.headPos[2] + 0.1; return out; };
  function land(target, big) { // a blow arrives
    if (!target.held) target.act('hit');
    feel(target, 'shock', 0.7);
    chest(target, P);
    if (sprites) { sprites.puff(P, { color: '#fff6e0', size: big ? 0.5 : 0.3 }); sprites.sparkle(P, { color: big ? '#ffe27a' : '#ffffff', size: big ? 0.5 : 0.3 }); }
    punch = Math.max(punch, big ? 1 : 0.35);
    cues.push({ type: 'hit', who: target, big });
  }
  function strike(actor, targets, clipName, big, time) {
    const c = actor.act(clipName); feel(actor, big ? 'anger' : actor.side > 0 ? 'smile' : 'anger', 0.9);
    cues.push({ type: 'energy', who: actor, big });
    later(time + c.impact, land, targets[0], big);
  }
  const front = (list) => list[0];

  enc.update = (dt, time, events, progress) => {
    cues.length = 0;
    if (events) for (let i = 0; i < events.length; i++) {
      const e = events[i], beat = BEATS[e.type];
      if (COMBO_WEIGHT[e.type] || e.type === 'drain') log.push({ t: time, type: e.type });
      if (!beat || won && e.type !== 'sceneClear') continue;
      const before = enc.combo.level;
      const cb = comboOf(log, time); enc.combo.count = cb.count; enc.combo.level = cb.level; enc.combo.last = cb.last;
      if (cb.level > before && cb.level >= 2) cues.push({ type: 'combo', level: cb.level });
      const L = cb.level;
      if (beat.act === 'jab' || beat.act === 'chop') {
        const a = free(party); if (!a) continue;
        strike(a, opp, beat.act === 'jab' ? 'strike' : 'strike2', false, time);
        if (L >= 2) { const b = free(party); if (b) later(time + 0.12, (x) => strike(x, opp, 'strike', false, time + 0.12), b); } // level 2: two act together
      } else if (beat.act === 'big') {
        const ren = party[0], ilse = party[1];
        if (L >= 3 && ilse && !ren.busy && !ilse.busy) { // the team move
          const c = teamMove(ren, ilse); feel(ren, 'anger', 1.6); feel(ilse, 'smile', 1.6);
          cues.push({ type: 'energy', who: ilse, big: true }); cues.push({ type: 'combo', level: L, team: true });
          later(time + c.impact, (t) => { land(t, true); for (let k = 1; k < opp.length; k++) later(time + c.impact + 0.08 * k, land, opp[k], false); }, front(opp));
        } else {
          const a = free(party); if (!a) continue;
          a.act('windup'); a.held = true; feel(a, 'anger', 1.4); cues.push({ type: 'energy', who: a, big: true });
          later(time + CLIPS.windup.dur + 0.05, (x) => { x.held = false; const c = x.act('release'); later(time + CLIPS.windup.dur + 0.05 + c.impact, land, front(opp), true); }, a);
        }
      } else if (beat.act === 'advance') {
        if (advance < 2) { advance++; for (const ch of party) if (!ch.busy && !ch.held) ch.act('stepF'); for (const ch of opp) if (!ch.busy && !ch.held) ch.act('stepB'); }
        for (const ch of opp) feel(ch, 'shock', 1.2);
      } else if (beat.act === 'boon') {
        for (const ch of party) { if (!ch.busy && !ch.held) ch.act('cheer'); feel(ch, 'smile', 1.6); if (sprites) { chest(ch, P); P[1] += 0.5; sprites.sparkle(P, { color: '#ffe27a', size: 0.45 }); } }
        cues.push({ type: 'boon', kind: e.kind });
      } else if (beat.act === 'struck') {
        const a = free(opp), victim = party[turn % party.length];
        if (a) { const c = a.act('strike'); later(time + c.impact, (v) => { land(v, true); feel(v, 'tears', 1.4); }, victim); }
        enc.combo.count = 0; enc.combo.level = 0; cues.push({ type: 'combo', level: 0, broken: true });
      } else if (beat.act === 'win') {
        won = true;
        for (const ch of opp) { ch.release(); ch.act(ch === opp[0] ? 'yield' : 'surrender'); ch.held = true; ch.state.emote = 'tears'; ch.emoteT = 1e9; }
        for (const ch of party) { ch.release(); ch.held = false; ch.act('cheer'); ch.state.emote = 'smile'; ch.emoteT = 1e9; }
        punch = 1;
      }
    }
    for (let i = pending.length - 1; i >= 0; i--) if (pending[i].t <= time) { const p = pending[i]; pending.splice(i, 1); p.fn(p.a, p.b); }
    { const cb = comboOf(log, time); enc.combo.count = cb.count; enc.combo.level = cb.level; enc.combo.left = cb.left; }
    if (progress && progress.total > 0) resolve = won ? 0 : 1 - progress.done / progress.total;
    shown += (resolve - shown) * Math.min(1, dt * 5);
    // the table powers their world: lamps follow the chain, and sag when nothing is being hit
    const want = won ? 1.3 : 0.55 + 0.22 * enc.combo.level + 0.25 * clamp(1 - (time - enc.combo.last) / 6, 0, 1);
    power += (want - power) * Math.min(1, dt * (want > power ? 6 : 1.2));
    set.setPower(power);
    punch = Math.max(0, punch - dt * 3.2);
    const lead = party[0], foe = opp[0];
    for (const ch of all) {
      const st = ch.state;
      if (ch.emoteT > 0) { ch.emoteT -= dt; if (ch.emoteT <= 0) st.emote = ch.side > 0 ? (enc.combo.level >= 2 ? 'smile' : 'grim') : (shown < 0.34 ? 'shock' : 'anger'); }
      st.look = ch.side > 0 ? foe.headPos : lead.headPos;
      st.energy = 0.8 + 0.25 * enc.combo.level;
      ch.update(dt, st); followGlow(ch);
    }
  };
  const T = [0, 0, 0];
  enc.frame = (camera, aspect, time, viewHeight = 220) => {
    const c = set.cameras.stage, k = punch * punch;
    T[0] = c.target[0] + Math.sin(time * 47) * 0.03 * k; T[1] = c.target[1] + Math.cos(time * 53) * 0.025 * k; T[2] = c.target[2];
    camera.fov = c.fov; camera.orbit(T, c.dist * (1 - 0.06 * k) * Math.max(1, c.aspect / aspect), c.yaw + Math.sin(time * 0.21) * 1.2, c.pitch);
    set.env.shadow.center = c.shadowCenter; set.env.shadow.radius = c.shadowRadius;
    set.env.outline.width = inkFor(camera, viewHeight, party[0].headRadius);
    return camera;
  };
  return enc;
}
