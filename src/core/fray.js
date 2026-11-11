// LANEWAR. The game inside the game: a board of tin soldiers the cadets play between watches.
//
// Real time. The player only moves. Up to six weapons hang about the hero and each aims and fires by
// itself at whatever is nearest. A wave is a length of time to stay alive in, not a number to fell: figures
// keep coming on at marked spots until the clock runs out. What they drop is tin. Between waves the tin is
// spent at THE REELS, three of them, which deal the loadout: every pull stops on three symbols (weapons and
// kit), the player takes ONE, and a pair or three of a kind makes what is taken stronger. A reel can be held
// while the others are pulled again. Each wave survived and each level gained is a free pull.
//
// The version before this one was turn based: one step a turn, weapons firing in fixed patterns. On play it
// read as nothing the player did causing anything. Here the cause is plain: stand near them and they die,
// stand still and you do.
//
// Pure: no DOM, no clock, no Math.random, no mutation of arguments. A Run carries its own Rng.
//
//   newMeta()                -> Meta       what outlives a run: loadout, stats, tin, the wave reached
//   startRun(meta, seedN)    -> Run        in a wave, at full hearts
//   step(run, move)          -> Run        DT seconds. move: [x, y], each -1..1 (y down the board)
//   pull(run) hold(run, i) take(run, i) nextWave(run) -> Run     the reels, between waves
//   settle(meta, run)        -> { banked, score, meta }
//   suggest(run)             -> [x, y] in a wave; { pull } | { take } | { next } | null at the reels
//
// Run.fx is the last FX_MAX things that happened, each { n, type, ... } with n counting up for the life of
// the run: a shell keeps a cursor on n and acts each one out once, however many steps passed between frames.
//   swing { slot, weapon, a, r }   a melee weapon swung toward angle a (radians, 0 = +x, y down)
//   shot  { slot, weapon }  |  shell { x, y, r }  |  blast { x, y, r }  |  flame { x, y, r }
//   hit   { id }  |  kill { id, kind, x, y }  |  hurt { dmg }  |  dodge  |  bolt { id }
//   tin   { v }  |  level { level }  |  cleared { wave, bonus }  |  fallen
//   reels { reels, free }  |  took { sym, mult }  |  wave { wave }

import { seed, next } from './rng.js';

/** The arena, in board units. The hero is 0.35 across the shoulders. */
export const AW = 12;
export const AH = 17;
/** One step of the board. The table ticks at 1/120; the board takes every second tick. */
export const DT = 1 / 60;
export const SLOTS = 6;
export const TIERS = 4;
export const FX_MAX = 64;
/** Figures standing at once. Marks wait when the board is full. */
export const BOARD_MAX = 90;

const HERO_R = 0.35;
const HERO_SPEED = 4.0;
const HURT_GRACE = 0.5;       // seconds after a blow in which nothing else lands
const MARK_SECONDS = 0.9;     // a figure's spot is marked this long before it stands there

/**
 * The weapons. Arrays are by tier (I to IV). cd: seconds between attacks. range: board units.
 *   kind 'arc'    a sweep toward the target: everything within `range` and `arc` degrees of the aim
 *   kind 'thrust' a lunge: everything within `range` along the aim and `width` across it
 *   kind 'ring'   everything within `range`, all round
 *   kind 'gun'    `count` balls at `speed`, spread over `spread` degrees, each passing through `pierce` figures
 *   kind 'lob'    a shell on the target's spot `air` seconds later: everything within `blast`
 *   kind 'oil'    a flask on the target's spot: the ground burns `blast` wide for `burn` seconds, dmg a second
 */
export const WEAPONS = Object.freeze({
  sabre: { name: 'Sabre', kind: 'arc', what: 'Sweeps whatever is close in front.', dmg: [6, 10, 16, 26], cd: [0.85, 0.75, 0.65, 0.55], range: 1.9, arc: 120, push: 0.5 },
  pike: { name: 'Pike', kind: 'thrust', what: 'Runs through a whole file.', dmg: [9, 14, 22, 36], cd: [1.25, 1.1, 0.95, 0.8], range: 3.4, width: 0.55, push: 1.1 },
  flail: { name: 'Flail', kind: 'ring', what: 'Whirls through everything around you.', dmg: [5, 8, 13, 21], cd: [1.2, 1.05, 0.9, 0.75], range: 1.7, push: 0.7 },
  pistol: { name: 'Pistol', kind: 'gun', what: 'One ball at the nearest of them.', dmg: [6, 9, 14, 22], cd: [0.75, 0.66, 0.57, 0.48], range: 6.5, count: [1, 1, 1, 1], spread: 0, speed: 15, pierce: [0, 0, 1, 2] },
  scatter: { name: 'Scattergun', kind: 'gun', what: 'A fan of shot, close in.', dmg: [3, 4, 6, 9], cd: [1.3, 1.2, 1.1, 1.0], range: 4.2, count: [4, 5, 6, 8], spread: 44, speed: 13, pierce: [1, 1, 2, 2] },
  mortar: { name: 'Mortar', kind: 'lob', what: 'A shell into the thick of them.', dmg: [11, 17, 27, 42], cd: [2.4, 2.2, 2.0, 1.7], range: 8, air: 0.7, blast: [1.4, 1.6, 1.8, 2.2] },
  flask: { name: 'Lamp oil', kind: 'oil', what: 'A flask that leaves the ground burning.', dmg: [5, 8, 12, 19], cd: [3.2, 3.0, 2.8, 2.5], range: 5.5, air: 0.5, blast: [1.2, 1.3, 1.5, 1.8], burn: 3 },
});
export const WEAPON_IDS = Object.freeze(Object.keys(WEAPONS));

/** The kit. Each is one line of stats, paid once for a single, twice for a pair, four times for three of a kind. */
export const ITEMS = Object.freeze({
  heart: { name: 'Heart', what: '+3 hearts', stats: { maxHp: 3 } },
  whetstone: { name: 'Whetstone', what: '+6% damage', stats: { dmg: 6 } },
  drill: { name: 'Drill', what: '+6% attack speed', stats: { haste: 6 } },
  spyglass: { name: 'Spyglass', what: '+8% range', stats: { range: 8 } },
  plate: { name: 'Plate', what: '+1 armour', stats: { armor: 1 } },
  boots: { name: 'Boots', what: '+4% speed', stats: { speed: 4 } },
  feint: { name: 'Feint', what: '+3% dodge', stats: { dodge: 3 } },
  tonic: { name: 'Tonic', what: 'mends a heart every 8 seconds', stats: { regen: 1 } },
  magnet: { name: 'Magnet', what: '+25% reach for tin', stats: { magnet: 25 } },
  clover: { name: 'Clover', what: '+6 luck: more tin, kinder reels', stats: { luck: 6 } },
});
export const ITEM_IDS = Object.freeze(Object.keys(ITEMS));
export const MULT_PAYS = Object.freeze([0, 1, 2, 4]);
const DODGE_CAP = 60;

const BASE_STATS = Object.freeze({ maxHp: 10, dmg: 0, haste: 0, range: 0, armor: 0, speed: 0, dodge: 0, regen: 0, magnet: 0, luck: 0 });
export const STAT_IDS = Object.freeze(Object.keys(BASE_STATS));

/**
 * The figures. hp and dmg are for wave 1 and grow with the wave (foeHp, foeDmg).
 *   foot       walks at the hero
 *   lancer     closes to `from` units, lowers the lance for `wind` seconds, then charges in a straight line
 *   grenadier  slow, wide, and takes a great deal of felling
 *   musket     stands off at `keep` units and fires a ball that can be walked out of the way of
 *   captain    one, on every fifth wave
 */
export const FOES = Object.freeze({
  foot: { name: 'Foot', hp: 5, dmg: 1, speed: 2.3, r: 0.32, tin: 1, points: 10, from: 1 },
  lancer: { name: 'Lancer', hp: 4, dmg: 2, speed: 2.5, r: 0.32, tin: 1, points: 15, from: 2, charge: { from: 4.2, wind: 0.6, speed: 9, time: 0.6, rest: 1.6 } },
  grenadier: { name: 'Grenadier', hp: 22, dmg: 2, speed: 1.5, r: 0.46, tin: 3, points: 40, from: 4 },
  musket: { name: 'Musket', hp: 5, dmg: 1, speed: 1.9, r: 0.32, tin: 2, points: 30, from: 3, gun: { keep: 5, aim: 0.7, every: 2.6, speed: 5.5 } },
  captain: { name: 'Captain', hp: 260, dmg: 3, speed: 2.2, r: 0.62, tin: 30, points: 500, from: 5 },
});
export const CAPTAIN_EVERY = 5;
export const foeHp = (kind, wave) => Math.round(FOES[kind].hp * (1 + 0.5 * (wave - 1) + 0.08 * (wave - 1) * (wave - 1)));
export const foeDmg = (kind, wave) => FOES[kind].dmg + Math.floor((wave - 1) * 0.6);

/** Seconds wave n lasts. */
export const waveSeconds = (wave) => Math.min(60, 20 + 5 * (wave - 1));
/** Seconds between groups coming on, and how many in a group. */
const spawnGap = (wave) => Math.max(0.5, 1.25 - 0.05 * wave);
const spawnCount = (wave) => 3 + wave;
const WAVE_BONUS = 100;
/** Tin (which is also experience) the next level costs. */
export const levelCost = (level) => 10 + 10 * level + 4 * level * level;

// ───────────────────────── meta ─────────────────────────

/** What outlives a run. lit: the saucer will open the board. charge: table hits toward lighting it again. */
export function newMeta() {
  return { lit: false, charge: 0, wave: 1, weapons: [{ id: 'sabre', tier: 1 }], stats: { ...BASE_STATS }, level: 0, xp: 0, tin: 0, best: 0, felled: 0 };
}

/** Refuse a Meta that could not have been written by this file: a save is the one place one comes in from outside. */
export function checkMeta(m) {
  const bad = (why) => new Error(`fray: bad meta (${why}): ${JSON.stringify(m)}`);
  if (!m || typeof m !== 'object') throw bad('not an object');
  if (typeof m.lit !== 'boolean') throw bad('lit must be true or false');
  for (const k of ['charge', 'best', 'felled', 'level', 'xp', 'tin']) if (!Number.isInteger(m[k]) || m[k] < 0) throw bad(`${k} must be a whole number, zero or more`);
  if (!Number.isInteger(m.wave) || m.wave < 1) throw bad('wave must be a whole number, one or more');
  if (!Array.isArray(m.weapons) || m.weapons.length < 1 || m.weapons.length > SLOTS) throw bad(`there are one to ${SLOTS} weapons`);
  for (const w of m.weapons) {
    if (!w || !Object.hasOwn(WEAPONS, w.id)) throw bad(`unknown weapon ${JSON.stringify(w && w.id)}`);
    if (!Number.isInteger(w.tier) || w.tier < 1 || w.tier > TIERS) throw bad(`${w.id} cannot be tier ${JSON.stringify(w.tier)}`);
  }
  if (!m.stats || typeof m.stats !== 'object') throw bad('stats must be an object');
  for (const k of Object.keys(m.stats)) if (!Object.hasOwn(BASE_STATS, k)) throw bad(`unknown stat ${JSON.stringify(k)}`);
  for (const k of STAT_IDS) if (typeof m.stats[k] !== 'number' || !Number.isFinite(m.stats[k])) throw bad(`stat ${k} must be a number`);
  if (!(m.stats.maxHp >= 1)) throw bad('there is at least one heart');
  return m;
}

// ───────────────────────── a run ─────────────────────────

const emptySlot = () => ({ reels: [null, null, null], held: [false, false, false], free: 0, pulls: 0, spinT: 0 });

/** Append to the fx log. Mutates `run`, which the caller owns. */
function note(run, e) {
  e.n = run.fxN++;
  run.fx = run.fx.length >= FX_MAX ? [...run.fx.slice(1 - FX_MAX), e] : [...run.fx, e];
  return run;
}

export function startRun(meta, seedN) {
  checkMeta(meta);
  const run = {
    phase: 'wave', wave: meta.wave, t: waveSeconds(meta.wave), time: 0, n: 0, rng: seed(seedN),
    hero: { x: AW / 2, y: AH / 2, hp: meta.stats.maxHp, inv: 0, face: -Math.PI / 2 },
    stats: { ...meta.stats }, weapons: meta.weapons.map((w) => ({ id: w.id, tier: w.tier, cd: 0.3, aim: -Math.PI / 2 })),
    foes: [], shots: [], bolts: [], shells: [], fires: [], drops: [], marks: [], nextId: 1, spawnT: 0.2, captain: false,
    level: meta.level, xp: meta.xp, tin: meta.tin, felled: 0, take: 0, cleared: 0,
    slot: emptySlot(), fx: [], fxN: 0,
  };
  return note(run, { type: 'wave', wave: run.wave });
}

/** One step, DT seconds. In a wave the board runs; at the reels only their spin runs down. */
export function step(run0, move) {
  if (run0.phase === 'over') return run0;
  if (run0.phase === 'shop') {
    if (run0.slot.spinT <= 0) return run0;
    return { ...run0, n: run0.n + 1, slot: { ...run0.slot, spinT: Math.max(0, run0.slot.spinT - DT) } };
  }
  if (run0.phase !== 'wave') throw new Error(`fray.step: unknown phase ${JSON.stringify(run0.phase)}`);
  if (!Array.isArray(move) || !(Math.abs(move[0]) <= 1.0001) || !(Math.abs(move[1]) <= 1.0001)) {
    throw new Error(`fray.step: move must be [x, y] with each in -1..1, got ${JSON.stringify(move)}`);
  }
  // A private copy, worked on in place: ninety figures sixty times a second is too many to rebuild the world for each.
  const run = {
    ...run0, n: run0.n + 1, time: run0.time + DT, t: run0.t - DT,
    hero: { ...run0.hero }, weapons: run0.weapons.map((w) => ({ ...w })),
    foes: run0.foes.map((f) => ({ ...f })), shots: run0.shots.map((s) => ({ ...s })), bolts: run0.bolts.map((s) => ({ ...s })),
    shells: run0.shells.map((s) => ({ ...s })), fires: run0.fires.map((s) => ({ ...s })), drops: run0.drops.map((d) => ({ ...d })),
    marks: run0.marks.map((m) => ({ ...m })),
  };
  const { hero } = run;
  const stats = run.stats;       // the hearts may grow in this step (a level); the rest of the stats do not
  let { rng } = run;
  const rnd = () => { const r = next(rng); rng = r[1]; return r[0]; };
  const wave = run.wave;

  // ── the hero ──
  let mx = move[0], my = move[1];
  const ml = Math.sqrt(mx * mx + my * my);
  if (ml > 1) { mx /= ml; my /= ml; }
  const sp = HERO_SPEED * (1 + stats.speed / 100);
  hero.x = Math.min(AW - HERO_R, Math.max(HERO_R, hero.x + mx * sp * DT));
  hero.y = Math.min(AH - HERO_R, Math.max(HERO_R, hero.y + my * sp * DT));
  if (ml > 0.15) hero.face = Math.atan2(my, mx);
  hero.inv = Math.max(0, hero.inv - DT);
  if (stats.regen > 0) hero.hp = Math.min(stats.maxHp, hero.hp + DT * stats.regen / 8);

  // ── felling ──
  const tinMult = 1 + stats.luck / 100;
  const fell = (f) => {
    f.hp = 0;
    run.felled++;
    run.take += FOES[f.kind].points;
    note(run, { type: 'kill', id: f.id, kind: f.kind, x: f.x, y: f.y });
    let v = FOES[f.kind].tin;
    // luck: a part of a coin is a chance of one
    const extra = v * (tinMult - 1); v += Math.floor(extra) + (rnd() < extra - Math.floor(extra) ? 1 : 0);
    if (f.kind !== 'foot' || rnd() < 0.65) run.drops.push({ id: run.nextId++, x: f.x, y: f.y, v });
  };
  const strike = (f, dmg, px, py, push) => {
    if (f.hp <= 0) return;
    f.hp -= dmg; f.flash = 0.14;
    if (push && f.kind !== 'captain') { f.kx += px * push; f.ky += py * push; }
    if (f.hp <= 0) fell(f); else note(run, { type: 'hit', id: f.id });
  };

  // ── the weapons: each finds the nearest figure in its reach and goes at it ──
  run.weapons.forEach((w, slot) => {
    const def = WEAPONS[w.id];
    w.cd -= DT * (1 + stats.haste / 100);
    if (w.cd > 0) return;
    const R = def.range * (1 + stats.range / 100);
    let target = null, best = Infinity;
    for (const f of run.foes) {
      if (f.hp <= 0) continue;
      const d = Math.hypot(f.x - hero.x, f.y - hero.y) - FOES[f.kind].r;
      if (d < R && d < best) { best = d; target = f; }
    }
    if (!target) { w.cd = 0; return; }
    w.cd = def.cd[w.tier - 1];
    const a = Math.atan2(target.y - hero.y, target.x - hero.x), ca = Math.cos(a), sa = Math.sin(a);
    const d0 = def.dmg[w.tier - 1] * (1 + stats.dmg / 100);
    w.aim = a;
    if (def.kind === 'arc' || def.kind === 'thrust' || def.kind === 'ring') {
      note(run, { type: 'swing', slot, weapon: w.id, a, r: R });
      const half = def.kind === 'arc' ? Math.cos(def.arc / 2 * Math.PI / 180) : 0;
      for (const f of run.foes) {
        if (f.hp <= 0) continue;
        const dx = f.x - hero.x, dy = f.y - hero.y, d = Math.sqrt(dx * dx + dy * dy) || 1e-6, fr = FOES[f.kind].r;
        if (d - fr > R) continue;
        if (def.kind === 'arc' && (dx * ca + dy * sa) / d < half && d > fr + 0.5) continue;
        if (def.kind === 'thrust') { const along = dx * ca + dy * sa, across = Math.abs(-dx * sa + dy * ca); if (along < -0.2 || across > def.width + fr) continue; }
        strike(f, d0, dx / d, dy / d, def.push);
      }
    } else if (def.kind === 'gun') {
      note(run, { type: 'shot', slot, weapon: w.id });
      const count = def.count[w.tier - 1];
      for (let i = 0; i < count; i++) {
        const off = count === 1 ? 0 : (i / (count - 1) - 0.5) * def.spread * Math.PI / 180;
        const b = a + off + (rnd() - 0.5) * 0.04;
        run.shots.push({ id: run.nextId++, x: hero.x + ca * 0.4, y: hero.y + sa * 0.4, vx: Math.cos(b) * def.speed, vy: Math.sin(b) * def.speed, dmg: d0, pierce: def.pierce[w.tier - 1], life: R / def.speed + 0.08, last: 0 });
      }
    } else if (def.kind === 'lob' || def.kind === 'oil') {
      const blast = def.blast[w.tier - 1];
      run.shells.push({ id: run.nextId++, x: target.x, y: target.y, t: def.air, air: def.air, r: blast, dmg: d0, burn: def.kind === 'oil' ? def.burn : 0 });
      note(run, { type: 'shell', x: target.x, y: target.y, r: blast });
    } else throw new Error(`fray: unknown weapon kind ${JSON.stringify(def.kind)}`);
  });

  // ── what is in the air ──
  for (const s of run.shots) {
    s.x += s.vx * DT; s.y += s.vy * DT; s.life -= DT;
    if (s.life <= 0) continue;
    for (const f of run.foes) {
      if (f.hp <= 0 || f.id === s.last) continue;
      const dx = f.x - s.x, dy = f.y - s.y, rr = FOES[f.kind].r + 0.12;
      if (dx * dx + dy * dy > rr * rr) continue;
      const v = Math.hypot(s.vx, s.vy) || 1;
      strike(f, s.dmg, s.vx / v, s.vy / v, 0.25);
      s.last = f.id;
      if (s.pierce-- <= 0) { s.life = 0; break; }
    }
  }
  run.shots = run.shots.filter((s) => s.life > 0 && s.x > -1 && s.y > -1 && s.x < AW + 1 && s.y < AH + 1);
  for (const s of run.shells) {
    s.t -= DT;
    if (s.t > 0) continue;
    if (s.burn > 0) { run.fires.push({ id: s.id, x: s.x, y: s.y, r: s.r, t: s.burn, dps: s.dmg }); note(run, { type: 'flame', x: s.x, y: s.y, r: s.r }); continue; }
    note(run, { type: 'blast', x: s.x, y: s.y, r: s.r });
    for (const f of run.foes) {
      const dx = f.x - s.x, dy = f.y - s.y, d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
      if (d - FOES[f.kind].r <= s.r) strike(f, s.dmg, dx / d, dy / d, 0.9);
    }
  }
  run.shells = run.shells.filter((s) => s.t > 0);
  for (const fire of run.fires) {
    fire.t -= DT;
    for (const f of run.foes) {
      if (f.hp <= 0) continue;
      const dx = f.x - fire.x, dy = f.y - fire.y;
      if (dx * dx + dy * dy > fire.r * fire.r) continue;
      f.hp -= fire.dps * DT; f.flash = Math.max(f.flash, 0.05);
      if (f.hp <= 0) fell(f);
    }
  }
  run.fires = run.fires.filter((f) => f.t > 0);

  // ── the figures ──
  const hurt = (dmg) => {
    if (hero.inv > 0) return;
    hero.inv = HURT_GRACE;
    if (rnd() * 100 < Math.min(DODGE_CAP, stats.dodge)) { note(run, { type: 'dodge' }); return; }
    const taken = Math.max(1, Math.round(dmg / (1 + stats.armor / 12)));
    hero.hp -= taken;
    note(run, { type: 'hurt', dmg: taken });
  };
  for (const f of run.foes) {
    if (f.hp <= 0) continue;
    const def = FOES[f.kind];
    f.flash = Math.max(0, f.flash - DT);
    const dx = hero.x - f.x, dy = hero.y - f.y, d = Math.sqrt(dx * dx + dy * dy) || 1e-6, ux = dx / d, uy = dy / d;
    let vx = 0, vy = 0;
    const speed = def.speed * Math.min(1.5, 1 + 0.02 * wave);
    if (def.charge) {
      const c = def.charge;
      if (f.state === 'wind') { f.st -= DT; if (f.st <= 0) { f.state = 'charge'; f.st = c.time; } }
      else if (f.state === 'charge') { vx = f.cx * c.speed; vy = f.cy * c.speed; f.st -= DT; if (f.st <= 0) { f.state = 'rest'; f.st = c.rest; } }
      else {
        if (f.state === 'rest') { f.st -= DT; if (f.st <= 0) f.state = 'walk'; }
        if (f.state === 'walk' && d < c.from) { f.state = 'wind'; f.st = c.wind; f.cx = ux; f.cy = uy; } else { vx = ux * speed; vy = uy * speed; }
      }
    } else if (def.gun) {
      const g = def.gun;
      const away = d < g.keep - 0.8 ? -1 : d > g.keep + 0.8 ? 1 : 0;
      vx = ux * speed * away; vy = uy * speed * away;
      f.st -= DT;
      if (f.state === 'aim') {
        vx = 0; vy = 0;
        if (f.st <= 0) {
          f.state = 'walk'; f.st = g.every;
          run.bolts.push({ id: run.nextId++, x: f.x, y: f.y, vx: f.cx * g.speed, vy: f.cy * g.speed, dmg: foeDmg(f.kind, wave), life: 3 });
          note(run, { type: 'bolt', id: f.id });
        }
      } else if (f.st <= 0 && d < g.keep + 3) { f.state = 'aim'; f.st = g.aim; f.cx = ux; f.cy = uy; }
    } else { vx = ux * speed; vy = uy * speed; }
    // knocked back, and the knock dies away
    f.x += (vx + f.kx * 6) * DT; f.y += (vy + f.ky * 6) * DT;
    f.kx *= 0.86; f.ky *= 0.86;
    f.x = Math.min(AW - 0.2, Math.max(0.2, f.x)); f.y = Math.min(AH - 0.2, Math.max(0.2, f.y));
    if (d < def.r + HERO_R) hurt(foeDmg(f.kind, wave));
  }
  // they do not stand in one another: each pair too close is eased apart
  const live = run.foes.filter((f) => f.hp > 0);
  for (let i = 0; i < live.length; i++) {
    const a = live[i], ra = FOES[a.kind].r;
    for (let j = i + 1; j < live.length; j++) {
      const b = live[j], dx = b.x - a.x, dy = b.y - a.y, rr = ra + FOES[b.kind].r;
      if (dx > rr || dx < -rr || dy > rr || dy < -rr) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2) || 1e-3, p = (rr - d) * 0.5 * 0.6, px = dx / d * p, py = dy / d * p;
      a.x -= px; a.y -= py; b.x += px; b.y += py;
    }
  }
  run.foes = live;
  for (const b of run.bolts) {
    b.x += b.vx * DT; b.y += b.vy * DT; b.life -= DT;
    const dx = hero.x - b.x, dy = hero.y - b.y;
    if (dx * dx + dy * dy < (HERO_R + 0.1) * (HERO_R + 0.1)) { hurt(b.dmg); b.life = 0; }
  }
  run.bolts = run.bolts.filter((b) => b.life > 0 && b.x > -1 && b.y > -1 && b.x < AW + 1 && b.y < AH + 1);

  // ── tin: drawn in from near, taken when touched. It is the coin and the experience both ──
  const pullR = 1.7 * (1 + stats.magnet / 100);
  const gain = (v) => {
    run.tin += v; run.xp += v; run.take += v * 5;
    while (run.xp >= levelCost(run.level)) {
      run.xp -= levelCost(run.level); run.level++;
      run.stats = { ...run.stats, maxHp: run.stats.maxHp + 1 }; hero.hp += 1;
      run.slot = { ...run.slot, free: run.slot.free + 1 };
      note(run, { type: 'level', level: run.level });
    }
  };
  let got = 0;
  for (const dr of run.drops) {
    const dx = hero.x - dr.x, dy = hero.y - dr.y, d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
    if (d < 0.45) { got += dr.v; dr.v = 0; continue; }
    if (d < pullR) { const s = Math.min(d, 11 * DT); dr.x += dx / d * s; dr.y += dy / d * s; }
  }
  if (got > 0) { run.drops = run.drops.filter((d) => d.v > 0); gain(got); note(run, { type: 'tin', v: got }); }

  // ── coming on: a spot is marked, and a moment later a figure stands on it ──
  for (const m of run.marks) {
    m.t -= DT;
    if (m.t > 0 || run.foes.length >= BOARD_MAX) continue;
    m.t = -1;
    run.foes.push({ id: m.id, kind: m.kind, x: m.x, y: m.y, hp: foeHp(m.kind, wave), flash: 0, kx: 0, ky: 0, state: 'walk', st: m.kind === 'musket' ? 1 + rnd() : 0, cx: 0, cy: 0 });
  }
  run.marks = run.marks.filter((m) => m.t >= 0);
  run.spawnT -= DT;
  if (run.spawnT <= 0 && run.t > 1.5) {
    run.spawnT = spawnGap(wave);
    const kinds = ['foot', 'foot', 'foot'];
    for (const k of ['lancer', 'musket', 'grenadier']) if (wave >= FOES[k].from) kinds.push(k);
    if (wave >= 8) kinds.push('lancer', 'grenadier');
    const place = (kind) => {
      for (let tries = 0; tries < 8; tries++) {
        const x = 0.6 + rnd() * (AW - 1.2), y = 0.6 + rnd() * (AH - 1.2);
        if (Math.hypot(x - hero.x, y - hero.y) < 3.2) continue;
        run.marks.push({ id: run.nextId++, kind, x, y, t: MARK_SECONDS });
        return;
      }
    };
    if (wave % CAPTAIN_EVERY === 0 && !run.captain) { run.captain = true; place('captain'); }
    for (let i = 0; i < spawnCount(wave) && run.foes.length + run.marks.length < BOARD_MAX; i++) place(kinds[Math.floor(rnd() * kinds.length)]);
  }

  // ── the end of the hero, or of the wave ──
  run.rng = rng;
  if (hero.hp <= 0) {
    hero.hp = 0;
    note(run, { type: 'fallen' });
    return { ...run, phase: 'over' };
  }
  if (run.t <= 0) {
    // the clock has run out: the board is swept, the tin lying on it comes in, and the reels are owed a pull
    let swept = 0; for (const d of run.drops) swept += d.v;
    if (swept > 0) gain(swept);
    const bonus = WAVE_BONUS * wave;
    run.take += bonus; run.cleared++;
    hero.hp = run.stats.maxHp;
    note(run, { type: 'cleared', wave, bonus });
    return { ...run, phase: 'shop', t: 0, foes: [], shots: [], bolts: [], shells: [], fires: [], drops: [], marks: [], slot: { ...emptySlot(), free: run.slot.free + 1 } };
  }
  return run;
}

// ───────────────────────── the reels ─────────────────────────

/** Tin a pull costs when no free one is owed: more with the wave, and half as much again with each paid pull at this stop. */
export function pullCost(run) {
  return Math.round((6 + run.wave * 3) * 1.5 ** run.slot.pulls);
}

/** How many of the three reels show what reel i shows. */
export function matches(run, i) {
  const s = run.slot.reels[i];
  return s === null ? 0 : run.slot.reels.filter((r) => r === s).length;
}

/** Whether what reel i shows can be taken: kit always; a weapon when it is carried below the last tier, or a hand is free. */
export function canTake(run, i) {
  const s = run.slot.reels[i];
  if (s === null || s === undefined || run.phase !== 'shop' || run.slot.spinT > 0) return false;
  if (Object.hasOwn(ITEMS, s)) return true;
  return run.weapons.length < SLOTS || run.weapons.some((w) => w.id === s && w.tier < TIERS);
}

/** What reel i shows, and what taking it now would do, for the reel's label. */
export function describe(run, i) {
  const s = run.slot.reels[i], m = matches(run, i);
  if (s === null) return null;
  if (Object.hasOwn(ITEMS, s)) {
    const it = ITEMS[s];
    return { kind: 'item', name: it.name, mult: m, text: m > 1 ? `${it.what}, ${MULT_PAYS[m]} times over` : it.what };
  }
  const def = WEAPONS[s], have = run.weapons.filter((w) => w.id === s && w.tier < TIERS).sort((a, b) => a.tier - b.tier)[0];
  if (have) return { kind: 'weapon', name: def.name, mult: m, text: `Yours goes from tier ${have.tier} to ${Math.min(TIERS, have.tier + m)}.` };
  if (run.weapons.length < SLOTS) return { kind: 'weapon', name: def.name, mult: m, text: m > 1 ? `${def.what} Comes at tier ${m}.` : def.what };
  return { kind: 'weapon', name: def.name, mult: m, text: 'No hand free for it.' };
}

const inShop = (run, what) => {
  if (run.phase !== 'shop') throw new Error(`fray.${what}: the reels stand only between waves, not in phase ${JSON.stringify(run.phase)}`);
};

export function canPull(run) {
  return run.phase === 'shop' && run.slot.spinT <= 0 && (run.slot.free > 0 || run.tin >= pullCost(run));
}

/** Pull: every reel not held stops on a new symbol. Free when a pull is owed, otherwise pullCost in tin. */
export function pull(run) {
  inShop(run, 'pull');
  if (!canPull(run)) return run;
  const { slot } = run;
  let { rng } = run;
  const symbols = [...WEAPON_IDS, ...ITEM_IDS];
  const kept = slot.reels.filter((x, k) => slot.held[k] && x !== null);
  // A held reel pulls the others toward it: that is what holding is for. Luck pulls harder.
  const lean = Math.min(0.4, 0.12 + run.stats.luck / 300);
  const reels = slot.reels.map((s, i) => {
    if (slot.held[i] && s !== null) return s;
    let r; [r, rng] = next(rng);
    if (kept.length > 0 && r < lean) return kept[0];
    [r, rng] = next(rng);
    return symbols[Math.floor(r * symbols.length)];
  });
  const free = slot.free > 0;
  const out = {
    ...run, n: run.n + 1, rng, tin: free ? run.tin : run.tin - pullCost(run),
    slot: { reels, held: [false, false, false], free: free ? slot.free - 1 : 0, pulls: free ? slot.pulls : slot.pulls + 1, spinT: 0.9 },
  };
  return note(out, { type: 'reels', reels, free });
}

/** Hold or let go reel i before the next pull. Only a reel showing something can be held, and never all three. */
export function hold(run, i) {
  inShop(run, 'hold');
  const { slot } = run;
  if (slot.spinT > 0 || slot.reels[i] === null || slot.reels[i] === undefined) return run;
  const held = slot.held.map((h, k) => (k === i ? !h : h));
  if (held.every(Boolean)) return run;
  return { ...run, n: run.n + 1, slot: { ...slot, held } };
}

/** Take what reel i shows, as strong as the line makes it. The line is spent: the reels stand empty for the next pull. */
export function take(run, i) {
  inShop(run, 'take');
  if (!canTake(run, i)) return run;
  const s = run.slot.reels[i], m = matches(run, i);
  let { weapons, stats, hero } = run;
  if (Object.hasOwn(ITEMS, s)) {
    stats = { ...stats };
    for (const [k, v] of Object.entries(ITEMS[s].stats)) stats[k] += v * MULT_PAYS[m];
    hero = { ...hero, hp: stats.maxHp };
  } else {
    const at = weapons.map((w, k) => [w, k]).filter(([w]) => w.id === s && w.tier < TIERS).sort((a, b) => a[0].tier - b[0].tier)[0];
    weapons = at
      ? weapons.map((w, k) => (k === at[1] ? { ...w, tier: Math.min(TIERS, w.tier + m) } : w))
      : [...weapons, { id: s, tier: Math.min(TIERS, m), cd: 0.3, aim: 0 }];
  }
  const out = { ...run, n: run.n + 1, weapons, stats, hero, slot: { ...run.slot, reels: [null, null, null], held: [false, false, false] } };
  return note(out, { type: 'took', sym: s, mult: m });
}

/** On to the next wave, at full hearts. Free pulls not taken are kept for the next stop. */
export function nextWave(run) {
  inShop(run, 'nextWave');
  if (run.slot.spinT > 0) return run;
  const wave = run.wave + 1;
  const out = {
    ...run, n: run.n + 1, phase: 'wave', wave, t: waveSeconds(wave), spawnT: 0.2, captain: false,
    hero: { ...run.hero, x: AW / 2, y: AH / 2, hp: run.stats.maxHp, inv: 1 },
    weapons: run.weapons.map((w) => ({ ...w, cd: 0.3 })),
    slot: { ...emptySlot(), free: run.slot.free },
  };
  return note(out, { type: 'wave', wave });
}

// ───────────────────────── leaving ─────────────────────────

/** Waves a fall sets the board back. */
export const FALL_BACK = 2;
/** A run can be taken home from the reels once it has survived a wave. */
export const canLeave = (run) => run.phase === 'shop' && run.cleared > 0 && run.slot.spinT <= 0;

/**
 * The run is over, by a fall or by choice. What goes back to the table: the score (all of it when taken home,
 * half when the hero fell) and the Meta the next run starts from. Weapons, kit, level and tin are kept either
 * way; a fall sets the board back FALL_BACK waves.
 */
export function settle(meta, run) {
  const fell = run.phase === 'over';
  if (!fell && !canLeave(run)) throw new Error(`fray.settle: a run cannot be left in phase ${JSON.stringify(run.phase)} with ${run.cleared} waves survived`);
  return {
    banked: !fell,
    score: fell ? Math.floor(run.take / 2) : run.take,
    meta: {
      ...meta, lit: false, charge: 0,
      wave: fell ? Math.max(1, run.wave - FALL_BACK) : run.wave + 1,
      weapons: run.weapons.map((w) => ({ id: w.id, tier: w.tier })), stats: { ...run.stats },
      level: run.level, xp: run.xp, tin: run.tin,
      best: Math.max(meta.best, fell ? run.wave - 1 : run.wave), felled: meta.felled + run.felled,
    },
  };
}

// ───────────────────────── a player ─────────────────────────

/**
 * A competent player, for the tests. In a wave: where to push the stick. It keeps out of reach of whatever is
 * near, out of the way of musket balls and lowered lances, off the walls, and drifts toward tin when nothing
 * presses. At the reels: pull while a pull is free or cheap, take the best thing a line shows, then go on.
 */
export function suggest(run) {
  if (run.phase === 'shop') {
    const { slot } = run;
    if (slot.spinT > 0) return null;
    if (slot.reels.some((s) => s !== null)) {
      let best = -1, score = -1;
      for (let i = 0; i < 3; i++) {
        if (!canTake(run, i)) continue;
        const s = slot.reels[i], weapon = Object.hasOwn(WEAPONS, s);
        const v = matches(run, i) * 10 + (weapon ? 6 : 0) + (s === 'heart' || s === 'whetstone' || s === 'drill' ? 3 : 0);
        if (v > score) { score = v; best = i; }
      }
      if (best >= 0) return { take: best };
    }
    if (canPull(run)) return { pull: true };
    return { next: true };
  }
  if (run.phase !== 'wave') throw new Error(`fray.suggest: nothing to suggest in phase ${JSON.stringify(run.phase)}`);
  const { hero } = run;
  let x = 0, y = 0;
  for (const f of run.foes) {
    const dx = hero.x - f.x, dy = hero.y - f.y, d = Math.sqrt(dx * dx + dy * dy) || 1e-3;
    const fear = f.kind === 'captain' ? 5 : f.state === 'wind' || f.state === 'charge' ? 4.5 : 3;
    if (d > fear) continue;
    const w = (fear - d) / fear / d;
    if (f.state === 'wind' || f.state === 'charge') { x += -f.cy * w * 3; y += f.cx * w * 3; } else { x += dx * w * 2; y += dy * w * 2; }
  }
  for (const b of run.bolts) {
    const dx = hero.x - b.x, dy = hero.y - b.y, d = Math.sqrt(dx * dx + dy * dy) || 1e-3;
    if (d > 3.5) continue;
    const v = Math.hypot(b.vx, b.vy) || 1, side = (dx * -b.vy + dy * b.vx) >= 0 ? 1 : -1;
    x += -b.vy / v * side * 1.5; y += b.vx / v * side * 1.5;
  }
  const edge = 2.2;
  if (hero.x < edge) x += (edge - hero.x) * 0.9;
  if (hero.x > AW - edge) x -= (hero.x - (AW - edge)) * 0.9;
  if (hero.y < edge) y += (edge - hero.y) * 0.9;
  if (hero.y > AH - edge) y -= (hero.y - (AH - edge)) * 0.9;
  if (Math.hypot(x, y) < 0.6) {
    let near = null, nd = 7;
    for (const d of run.drops) { const dd = Math.hypot(d.x - hero.x, d.y - hero.y); if (dd < nd) { nd = dd; near = d; } }
    if (near) { x += (near.x - hero.x) / (nd || 1) * 0.8; y += (near.y - hero.y) / (nd || 1) * 0.8; }
    else { x += (AW / 2 - hero.x) * 0.08; y += (AH / 2 - hero.y) * 0.08; }
  }
  const l = Math.hypot(x, y);
  if (l < 0.12) return [0, 0];
  return l > 1 ? [x / l, y / l] : [x, y];
}
