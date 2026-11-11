// LANEWAR. The game inside the game: a board of tin soldiers the cadets play between watches.
//
// Turn based, and one input a turn: step north, south, east or west, or stand. The hero's weapons then
// fire by themselves, each in its own pattern and on its own count of turns, and after that every tin
// figure on the board takes its move. A wave is a fixed number of figures fed in from the edges; when the
// last of them is down the player drafts one of three upgrades and the next wave begins. It goes on until
// the hero falls or the player takes the winnings back to the table.
//
// Why the weapons fire themselves: with one figure against sixty, a turn spent choosing a target is a turn
// in which one figure dies. Patterns that sweep whole rows are what make it a mowing, and leave the one
// decision that matters in a crowd, which is where to stand and which way to face.
//
// Pure: no DOM, no clock, no Math.random, no mutation of arguments. A Run carries its own Rng, seeded once
// when the run starts, so nothing here touches the table's randomness (game.rng).
//
//   newMeta()                 -> Meta        what outlives a run: the loadout, the wave reached, the light
//   startRun(meta, seedN)     -> Run
//   act(run, a)               -> Run         a: 'n' | 's' | 'e' | 'w' | 'wait'. One whole turn
//   choose(run, i)            -> Run         take offer i of the draft; the next wave begins
//   swingCells(run, id)       -> [x, y][]    where weapon id would land from where the hero stands now
//   suggest(run)              -> a | i       a competent move (or draft choice): the tests' player
//
// Run.events is what the last call did, in order, for the shell to act out. Run.n counts calls, so a shell
// that remembers n plays each list once.
//   swing  { weapon, cells, hits }        cells: every square struck, whether or not anything stood there
//   hit    { id, x, y, hp }               a figure was struck and still stands
//   kill   { id, kind, x, y, by }
//   move   { from, to }  |  bump { dir }  the hero stepped, or was blocked
//   hurt   { by, dmg, hp }                the hero was struck (by: figure id)
//   aim    { id }  |  shot { id }         a musket levels, then fires
//   burn   { x, y }                       lamp oil caught somebody
//   spawn  { id, kind, x, y }
//   drum                                  the drum: the figures lose their move this turn
//   wave   { wave }  |  cleared { wave, bonus }  |  fallen  |  took { what }

import { seed, next, nextInt } from './rng.js';

export const W = 9;
export const H = 11;
export const DIRS = Object.freeze({ n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] });
export const ACTS = Object.freeze(['n', 's', 'e', 'w', 'wait']);

export const HERO_HP = 10;
/** Figures on the board at once. The feed waits when it is full: 99 squares, and the hero needs one. */
export const BOARD_MAX = 64;

/**
 * The weapons. levels[k] is the weapon at level k + 1.
 *   every  turns between swings (1: every turn)
 *   dmg    to every figure in the pattern
 * and one of: shape (sabre), reach (flail, pike, grape), blast (mortar), burn (lamp oil: turns a square stays lit).
 */
export const WEAPONS = Object.freeze({
  sabre: {
    name: 'Sabre', what: 'Sweeps the squares in front of you every turn.',
    levels: [
      { every: 1, dmg: 1, shape: 'arc', note: 'three squares ahead' },
      { every: 1, dmg: 2, shape: 'arc', note: 'cuts twice as deep' },
      { every: 1, dmg: 2, shape: 'wide', note: 'reaches both flanks' },
      { every: 1, dmg: 3, shape: 'wide', note: 'heavier steel' },
      { every: 1, dmg: 3, shape: 'deep', note: 'a second rank ahead' },
    ],
  },
  flail: {
    name: 'Flail', what: 'Whirls through every square around you.',
    levels: [
      { every: 3, dmg: 1, reach: 1, note: 'every third turn' },
      { every: 2, dmg: 1, reach: 1, note: 'every second turn' },
      { every: 2, dmg: 2, reach: 1, note: 'a heavier head' },
      { every: 2, dmg: 2, reach: 2, note: 'a longer chain: two squares out' },
      { every: 1, dmg: 2, reach: 2, note: 'every turn' },
    ],
  },
  pike: {
    name: 'Pike', what: 'Runs through the whole file ahead of you.',
    levels: [
      { every: 2, dmg: 2, reach: 4, back: false, note: 'four squares, every second turn' },
      { every: 2, dmg: 2, reach: 7, back: false, note: 'seven squares' },
      { every: 1, dmg: 2, reach: 7, back: false, note: 'every turn' },
      { every: 1, dmg: 4, reach: 7, back: false, note: 'a broad head' },
      { every: 1, dmg: 4, reach: 7, back: true, note: 'and the butt behind you' },
    ],
  },
  grape: {
    name: 'Grapeshot', what: 'A widening fan of shot ahead of you.',
    levels: [
      { every: 4, dmg: 1, reach: 3, note: 'three ranks, every fourth turn' },
      { every: 3, dmg: 1, reach: 3, note: 'every third turn' },
      { every: 3, dmg: 2, reach: 3, note: 'a double charge' },
      { every: 3, dmg: 2, reach: 4, note: 'four ranks' },
      { every: 2, dmg: 3, reach: 4, note: 'every second turn, triple charge' },
    ],
  },
  mortar: {
    name: 'Mortar', what: 'Drops a shell on the thickest of them, anywhere on the board.',
    levels: [
      { every: 5, dmg: 2, blast: 1, note: 'every fifth turn' },
      { every: 4, dmg: 2, blast: 1, note: 'every fourth turn' },
      { every: 4, dmg: 3, blast: 1, note: 'a bigger shell' },
      { every: 4, dmg: 3, blast: 2, note: 'a wider burst' },
      { every: 3, dmg: 4, blast: 2, note: 'every third turn' },
    ],
  },
  oil: {
    name: 'Lamp oil', what: 'Every square you leave burns behind you.',
    levels: [
      { every: 1, dmg: 1, burn: 3, note: 'burns three turns' },
      { every: 1, dmg: 1, burn: 5, note: 'burns five turns' },
      { every: 1, dmg: 2, burn: 5, note: 'burns hotter' },
      { every: 1, dmg: 2, burn: 8, note: 'burns eight turns' },
      { every: 1, dmg: 3, burn: 8, note: 'white heat' },
    ],
  },
});
/** The order weapons fire in. */
export const WEAPON_IDS = Object.freeze(['sabre', 'pike', 'grape', 'flail', 'mortar', 'oil']);

/** The perks. max: how many times one may be drafted. */
export const PERKS = Object.freeze({
  plate: { name: 'Plate', max: 5, what: 'Three more hearts, and three mended now.' },
  drum: { name: 'Drum', max: 3, what: 'On a count the drum sounds and the figures lose their move: every fifth turn, then fourth, then third.' },
  barbs: { name: 'Barbs', max: 2, what: 'Whatever strikes you is struck back.' },
  rally: { name: 'Rally', max: 2, what: 'A heart mended for every dozen felled, then every seven.' },
  bounty: { name: 'Bounty', max: 3, what: 'Half as much again for every figure felled.' },
  dressing: { name: 'Field dressing', max: Infinity, what: 'Every heart mended, now.' },
});
const PLATE_HP = 3;
const DRUM_EVERY = [0, 5, 4, 3];
const RALLY_EVERY = [0, 12, 7];

/**
 * The figures. hp grows by one for every HP_WAVES waves. speed 2 moves twice; slow acts every other turn;
 * a gun stands off and fires along a file or a rank, taking one turn to level and one to fire.
 *
 * The captain is slow on purpose. A figure that arrives beside the hero has used its move and strikes on its
 * next one, so against a slow figure there is a turn to cut and a turn to step clear: the captain is fought
 * by timing. At full speed it could only be traded with, three hearts for every cut.
 */
export const FOES = Object.freeze({
  foot: { name: 'Foot', hp: 1, dmg: 1, points: 10, from: 1 },
  lancer: { name: 'Lancer', hp: 1, dmg: 1, points: 15, from: 2, speed: 2 },
  grenadier: { name: 'Grenadier', hp: 4, dmg: 2, points: 40, from: 3, slow: true },
  musket: { name: 'Musket', hp: 2, dmg: 1, points: 30, from: 4, range: 4 },
  captain: { name: 'Captain', hp: 24, dmg: 3, points: 300, from: 5, slow: true },
});
const HP_WAVES = 4;
/** Every CAPTAIN_EVERY-th wave has a captain in it. */
export const CAPTAIN_EVERY = 5;

/** Figures in wave n. */
export const waveSize = (wave) => 10 + 6 * wave;
/** Figures fed onto the board each turn of wave n. */
const feedRate = (wave) => Math.min(9, 2 + Math.floor(wave / 2));
const WAVE_BONUS = 100;
const HEAL_ON_CLEAR = 2;

// ───────────────────────── meta ─────────────────────────

/** What outlives a run. lit: the saucer will open the board. charge: table hits toward lighting it again. */
export function newMeta() {
  return { lit: false, charge: 0, wave: 1, weapons: { sabre: 1 }, perks: {}, best: 0, felled: 0 };
}

/** Refuse a Meta that could not have been written by this file: a save is the one place one comes in from outside. */
export function checkMeta(m) {
  const bad = (why) => new Error(`fray: bad meta (${why}): ${JSON.stringify(m)}`);
  if (!m || typeof m !== 'object') throw bad('not an object');
  if (typeof m.lit !== 'boolean') throw bad('lit must be true or false');
  for (const k of ['charge', 'best', 'felled']) if (!Number.isInteger(m[k]) || m[k] < 0) throw bad(`${k} must be a whole number, zero or more`);
  if (!Number.isInteger(m.wave) || m.wave < 1) throw bad('wave must be a whole number, one or more');
  if (!m.weapons || typeof m.weapons !== 'object' || !m.perks || typeof m.perks !== 'object') throw bad('weapons and perks must be objects');
  for (const [id, lv] of Object.entries(m.weapons)) {
    if (!Object.hasOwn(WEAPONS, id)) throw bad(`unknown weapon ${JSON.stringify(id)}`);
    if (!Number.isInteger(lv) || lv < 1 || lv > WEAPONS[id].levels.length) throw bad(`${id} cannot be level ${JSON.stringify(lv)}`);
  }
  for (const [id, lv] of Object.entries(m.perks)) {
    if (!Object.hasOwn(PERKS, id) || id === 'dressing') throw bad(`unknown perk ${JSON.stringify(id)}`);
    if (!Number.isInteger(lv) || lv < 1 || lv > PERKS[id].max) throw bad(`${id} cannot be level ${JSON.stringify(lv)}`);
  }
  if (!m.weapons.sabre) throw bad('there is always a sabre');
  return m;
}

const maxHpOf = (perks) => HERO_HP + PLATE_HP * (perks.plate || 0);

// ───────────────────────── a run ─────────────────────────

const inBoard = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
const key = (x, y) => y * W + x;

export function startRun(meta, seedN) {
  checkMeta(meta);
  const maxHp = maxHpOf(meta.perks);
  const run = {
    phase: 'turn', wave: meta.wave, turn: 0, n: 0, rng: seed(seedN),
    hero: { x: (W - 1) >> 1, y: (H - 1) >> 1, face: [0, -1], hp: maxHp, maxHp },
    foes: [], nextId: 1, queue: [], fires: [],
    weapons: { ...meta.weapons }, perks: { ...meta.perks }, cool: {},
    felled: 0, take: 0, sinceRally: 0, cleared: 0, offers: [], events: [],
  };
  return beginWave(run, []);
}

/** Wave n's figures, in the order they will be fed in. The captain comes when half of them are on. */
function drawQueue(wave, rng0) {
  let rng = rng0;
  const weights = [
    ['foot', 10],
    ['lancer', wave >= FOES.lancer.from ? 2 + wave * 0.5 : 0],
    ['grenadier', wave >= FOES.grenadier.from ? 1 + wave * 0.3 : 0],
    ['musket', wave >= FOES.musket.from ? 1 + wave * 0.25 : 0],
  ];
  const total = weights.reduce((s, w) => s + w[1], 0);
  const queue = [];
  for (let i = 0; i < waveSize(wave); i++) {
    let r; [r, rng] = next(rng);
    r *= total;
    let kind = 'foot';
    for (const [k, w] of weights) { if (r < w) { kind = k; break; } r -= w; }
    queue.push(kind);
  }
  if (wave % CAPTAIN_EVERY === 0) queue.splice(queue.length >> 1, 0, 'captain');
  return { queue, rng };
}

function beginWave(run, events) {
  const drawn = drawQueue(run.wave, run.rng);
  const out = { ...run, phase: 'turn', queue: drawn.queue, rng: drawn.rng, offers: [], foes: run.foes.slice(), events: [...events, { type: 'wave', wave: run.wave }] };
  // The board opens with figures already on it: two turns' feed at once.
  feed(out, feedRate(out.wave) * 2);
  return out;
}

/** Put up to `count` queued figures on free edge squares away from the hero. Mutates `run`, which the caller owns. */
function feed(run, count) {
  const taken = new Set(run.foes.map((f) => key(f.x, f.y)));
  const edge = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x !== 0 && y !== 0 && x !== W - 1 && y !== H - 1) continue;
      if (taken.has(key(x, y)) || Math.abs(x - run.hero.x) + Math.abs(y - run.hero.y) < 3) continue;
      edge.push([x, y]);
    }
  }
  const queue = run.queue.slice();
  for (let i = 0; i < count && queue.length > 0 && edge.length > 0 && run.foes.length < BOARD_MAX; i++) {
    let k; [k, run.rng] = nextInt(run.rng, edge.length);
    const [x, y] = edge[k];
    edge[k] = edge[edge.length - 1]; edge.pop();
    const kind = queue.shift(), def = FOES[kind];
    const hp = def.hp + Math.floor(run.wave / HP_WAVES) * (kind === 'captain' ? 6 : 1) + (kind === 'captain' ? run.wave : 0);
    const foe = { id: run.nextId++, kind, x, y, hp, aim: false };
    run.foes.push(foe);
    run.events.push({ type: 'spawn', id: foe.id, kind, x, y });
  }
  run.queue = queue;
}

// ───────────────────────── weapons ─────────────────────────

const SHAPES = {
  arc: [[1, -1], [1, 0], [1, 1]],
  wide: [[1, -1], [1, 0], [1, 1], [0, -1], [0, 1]],
  deep: [[1, -1], [1, 0], [1, 1], [0, -1], [0, 1], [2, -1], [2, 0], [2, 1]],
};

/** Squares [ahead, right] of the hero, as board squares; those off the board are dropped. */
function ahead(hero, pairs) {
  const [fx, fy] = hero.face, rx = -fy, ry = fx;
  const out = [];
  for (const [a, b] of pairs) {
    const x = hero.x + a * fx + b * rx, y = hero.y + a * fy + b * ry;
    if (inBoard(x, y)) out.push([x, y]);
  }
  return out;
}

function blastCells(cx, cy, r) {
  const out = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (inBoard(cx + dx, cy + dy)) out.push([cx + dx, cy + dy]);
  return out;
}

/** Where the mortar falls: the square whose burst holds the most figures; of equals, the one nearest the hero. */
function mortarAim(hero, foes, r) {
  if (foes.length === 0) return null;
  const count = new Int16Array(W * H);
  for (const f of foes) for (const [x, y] of blastCells(f.x, f.y, r)) count[key(x, y)]++;
  let best = -1, bx = 0, by = 0, bd = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = count[key(x, y)], d = Math.abs(x - hero.x) + Math.abs(y - hero.y);
      if (c > best || (c === best && d < bd)) { best = c; bx = x; by = y; bd = d; }
    }
  }
  return [bx, by];
}

/** The squares weapon `id` strikes at `level` from where the hero stands. Lamp oil strikes none: it is laid, not swung. */
function cellsOf(id, level, hero, foes) {
  const lv = WEAPONS[id].levels[level - 1];
  if (id === 'sabre') return ahead(hero, SHAPES[lv.shape]);
  if (id === 'flail') return blastCells(hero.x, hero.y, lv.reach).filter(([x, y]) => x !== hero.x || y !== hero.y);
  if (id === 'pike') {
    const pairs = [];
    for (let a = 1; a <= lv.reach; a++) { pairs.push([a, 0]); if (lv.back) pairs.push([-a, 0]); }
    return ahead(hero, pairs);
  }
  if (id === 'grape') {
    const pairs = [];
    for (let a = 1; a <= lv.reach; a++) for (let b = -(a - 1); b <= a - 1; b++) pairs.push([a, b]);
    return ahead(hero, pairs);
  }
  if (id === 'mortar') {
    const at = mortarAim(hero, foes, lv.blast);
    return at ? blastCells(at[0], at[1], lv.blast) : [];
  }
  if (id === 'oil') return [];
  throw new Error(`fray: unknown weapon ${JSON.stringify(id)}`);
}

export function swingCells(run, id) {
  const level = run.weapons[id];
  if (!level) throw new Error(`fray: the hero carries no ${JSON.stringify(id)}`);
  return cellsOf(id, level, run.hero, run.foes);
}

// ───────────────────────── a turn ─────────────────────────

/** One whole turn. `a` is a direction or 'wait'. */
export function act(run0, a) {
  if (run0.phase !== 'turn') throw new Error(`fray.act: no turn to take in phase ${JSON.stringify(run0.phase)}`);
  if (!ACTS.includes(a)) throw new Error(`fray.act: unknown action ${JSON.stringify(a)}`);
  // A private copy, worked on in place: sixty figures a turn is too many to rebuild the world for each.
  const run = {
    ...run0, n: run0.n + 1, turn: run0.turn + 1, events: [],
    hero: { ...run0.hero }, foes: run0.foes.map((f) => ({ ...f })), fires: run0.fires.map((f) => ({ ...f })), cool: { ...run0.cool },
  };
  const { hero, events } = run;
  const mult = 1 + 0.5 * (run.perks.bounty || 0);
  const at = new Map(run.foes.map((f) => [key(f.x, f.y), f]));

  const fell = (f, by) => {
    at.delete(key(f.x, f.y));
    f.hp = 0;
    run.felled++; run.sinceRally++;
    run.take += Math.round(FOES[f.kind].points * mult);
    events.push({ type: 'kill', id: f.id, kind: f.kind, x: f.x, y: f.y, by });
    const every = RALLY_EVERY[run.perks.rally || 0];
    if (every && run.sinceRally >= every) { run.sinceRally -= every; hero.hp = Math.min(hero.maxHp, hero.hp + 1); }
  };
  const strike = (f, dmg, by) => {
    f.hp -= dmg;
    if (f.hp <= 0) fell(f, by); else events.push({ type: 'hit', id: f.id, x: f.x, y: f.y, hp: f.hp });
  };

  // 1. The hero: turn to face, and step if the square is free. A figure in the way is not walked through.
  if (a !== 'wait') {
    const [dx, dy] = DIRS[a];
    hero.face = [dx, dy];
    const x = hero.x + dx, y = hero.y + dy;
    if (inBoard(x, y) && !at.has(key(x, y))) {
      const oil = run.weapons.oil;
      if (oil) {
        const burn = WEAPONS.oil.levels[oil - 1].burn;
        const lit = run.fires.find((f) => f.x === hero.x && f.y === hero.y);
        if (lit) lit.left = burn; else run.fires.push({ x: hero.x, y: hero.y, left: burn });
      }
      events.push({ type: 'move', from: [hero.x, hero.y], to: [x, y] });
      hero.x = x; hero.y = y;
    } else events.push({ type: 'bump', dir: a });
  }

  // 2. The weapons, each on its own count. One that would strike nobody keeps its charge, except the sabre,
  //    which is swung every turn because that is what the hand does.
  for (const id of WEAPON_IDS) {
    const level = run.weapons[id];
    if (!level || id === 'oil') continue;
    const lv = WEAPONS[id].levels[level - 1];
    const left = Math.max(0, (run.cool[id] || 0) - 1);
    run.cool[id] = left;
    if (left > 0) continue;
    const cells = cellsOf(id, level, hero, run.foes.filter((f) => f.hp > 0));
    const struck = cells.map(([x, y]) => at.get(key(x, y))).filter(Boolean);
    if (struck.length === 0 && id !== 'sabre') continue;
    run.cool[id] = lv.every;
    events.push({ type: 'swing', weapon: id, cells, hits: struck.length });
    for (const f of struck) strike(f, lv.dmg, id);
  }

  // 3. The figures, nearest first so the crowd closes up behind its front rank.
  const drumEvery = DRUM_EVERY[run.perks.drum || 0];
  const drummed = drumEvery > 0 && run.turn % drumEvery === 0;
  if (drummed) events.push({ type: 'drum' });
  else {
    const order = run.foes.filter((f) => f.hp > 0)
      .sort((p, q) => (Math.abs(p.x - hero.x) + Math.abs(p.y - hero.y)) - (Math.abs(q.x - hero.x) + Math.abs(q.y - hero.y)) || p.id - q.id);
    const barbs = run.perks.barbs || 0;
    const hurt = (f, dmg) => {
      hero.hp -= dmg;
      events.push({ type: 'hurt', by: f.id, dmg, hp: Math.max(0, hero.hp) });
      if (barbs && f.hp > 0) strike(f, barbs, 'barbs');
    };
    const step = (f) => {
      const dx = hero.x - f.x, dy = hero.y - f.y, ax = Math.abs(dx), ay = Math.abs(dy);
      const sx = Math.sign(dx), sy = Math.sign(dy);
      // The longer way first; when they are equal, odd figures go one way and even the other, or a
      // crowd on a diagonal would file in along a single line.
      const xFirst = ax > ay || (ax === ay && f.id % 2 === 0);
      const tries = xFirst ? [[sx, 0], [0, sy]] : [[0, sy], [sx, 0]];
      for (const [mx, my] of tries) {
        if (mx === 0 && my === 0) continue;
        const x = f.x + mx, y = f.y + my;
        if ((x === hero.x && y === hero.y) || at.has(key(x, y))) continue;
        at.delete(key(f.x, f.y)); f.x = x; f.y = y; at.set(key(x, y), f);
        return true;
      }
      return false;
    };
    for (const f of order) {
      if (f.hp <= 0) continue;
      const def = FOES[f.kind];
      if (def.slow && (run.turn + f.id) % 2 === 1) continue;
      const dist = Math.abs(f.x - hero.x) + Math.abs(f.y - hero.y);
      if (def.range) {
        const inLine = (f.x === hero.x || f.y === hero.y) && dist <= def.range;
        if (inLine && f.aim) { f.aim = false; events.push({ type: 'shot', id: f.id }); hurt(f, def.dmg); continue; }
        if (inLine) { f.aim = true; events.push({ type: 'aim', id: f.id }); continue; }
        f.aim = false;
        step(f);
        continue;
      }
      if (dist === 1) { hurt(f, def.dmg); continue; }
      step(f);
      if (def.speed === 2 && Math.abs(f.x - hero.x) + Math.abs(f.y - hero.y) > 1) step(f);
    }
  }

  // 4. Lamp oil: whoever stands in it now burns, and every lit square burns down by a turn.
  if (run.fires.length > 0) {
    const dmg = WEAPONS.oil.levels[(run.weapons.oil || 1) - 1].dmg;
    for (const fire of run.fires) {
      const f = at.get(key(fire.x, fire.y));
      if (f) { events.push({ type: 'burn', x: fire.x, y: fire.y }); strike(f, dmg, 'oil'); }
      fire.left--;
    }
    run.fires = run.fires.filter((f) => f.left > 0);
  }
  run.foes = run.foes.filter((f) => f.hp > 0);

  // 5. The end of the hero, of the wave, or neither.
  if (hero.hp <= 0) {
    hero.hp = 0;
    events.push({ type: 'fallen' });
    return { ...run, phase: 'over' };
  }
  feed(run, feedRate(run.wave));
  if (run.foes.length === 0 && run.queue.length === 0) {
    const bonus = Math.round(WAVE_BONUS * run.wave * mult);
    run.take += bonus;
    run.cleared++;
    hero.hp = Math.min(hero.maxHp, hero.hp + HEAL_ON_CLEAR);
    run.fires = [];
    events.push({ type: 'cleared', wave: run.wave, bonus });
    const drawn = drawOffers(run);
    return { ...run, phase: 'draft', offers: drawn.offers, rng: drawn.rng };
  }
  return run;
}

// ───────────────────────── the draft ─────────────────────────

/** Everything that could be offered now: each weapon below its last level, each perk below its max. */
function eligible(run) {
  const out = [];
  for (const id of WEAPON_IDS) {
    const lv = run.weapons[id] || 0;
    if (lv < WEAPONS[id].levels.length) out.push({ kind: 'weapon', id, level: lv + 1 });
  }
  for (const id of Object.keys(PERKS)) {
    if (id === 'dressing') { if (run.hero.hp * 2 <= run.hero.maxHp) out.push({ kind: 'perk', id, level: 1 }); continue; }
    const lv = run.perks[id] || 0;
    if (lv < PERKS[id].max) out.push({ kind: 'perk', id, level: lv + 1 });
  }
  // Everything is at its last level: the dressing is always something to take.
  if (out.length === 0) out.push({ kind: 'perk', id: 'dressing', level: 1 });
  return out;
}

function drawOffers(run) {
  const pool = eligible(run);
  let { rng } = run;
  const offers = [];
  while (offers.length < 3 && pool.length > 0) {
    let k; [k, rng] = nextInt(rng, pool.length);
    offers.push(pool[k]);
    pool.splice(k, 1);
  }
  return { offers, rng };
}

/** What an offer is called and what taking it does, for the card. */
export function describe(offer) {
  if (offer.kind === 'weapon') {
    const w = WEAPONS[offer.id];
    return { name: w.name, level: offer.level, isNew: offer.level === 1, text: offer.level === 1 ? w.what : w.levels[offer.level - 1].note };
  }
  if (offer.kind === 'perk') {
    const p = PERKS[offer.id];
    if (!p) throw new Error(`fray: unknown perk ${JSON.stringify(offer.id)}`);
    return { name: p.name, level: offer.level, isNew: offer.level === 1, text: p.what };
  }
  throw new Error(`fray: unknown offer ${JSON.stringify(offer)}`);
}

/** Take offer i. The next wave begins at once. */
export function choose(run0, i) {
  if (run0.phase !== 'draft') throw new Error(`fray.choose: no draft in phase ${JSON.stringify(run0.phase)}`);
  const offer = run0.offers[i];
  if (!offer) throw new Error(`fray.choose: no offer ${JSON.stringify(i)} among ${run0.offers.length}`);
  const run = { ...run0, n: run0.n + 1, hero: { ...run0.hero }, weapons: { ...run0.weapons }, perks: { ...run0.perks }, wave: run0.wave + 1 };
  if (offer.kind === 'weapon') run.weapons[offer.id] = offer.level;
  else if (offer.id === 'dressing') run.hero.hp = run.hero.maxHp;
  else {
    run.perks[offer.id] = offer.level;
    if (offer.id === 'plate') { run.hero.maxHp = maxHpOf(run.perks); run.hero.hp = Math.min(run.hero.maxHp, run.hero.hp + PLATE_HP); }
  }
  return beginWave(run, [{ type: 'took', what: offer }]);
}

// ───────────────────────── leaving ─────────────────────────

/** Waves a fall sets the board back. */
export const FALL_BACK = 2;

/**
 * The run is over, by a fall or by choice. What goes back to the table: the score (all of it when taken
 * home from a draft, half when the hero fell), and the Meta the next run starts from. The loadout is kept
 * either way. A fall sets the board back FALL_BACK waves; a draft left unpicked is the cleared wave's
 * reward forgone, and the next run starts at the wave after it.
 */
export function settle(meta, run) {
  const fell = run.phase === 'over';
  if (!fell && run.phase !== 'draft') throw new Error(`fray.settle: a run cannot be left in phase ${JSON.stringify(run.phase)}`);
  const reached = fell ? run.wave - 1 : run.wave;
  return {
    banked: !fell,
    score: fell ? Math.floor(run.take / 2) : run.take,
    meta: {
      ...meta, lit: false, charge: 0,
      wave: fell ? Math.max(1, run.wave - FALL_BACK) : run.wave + 1,
      weapons: { ...run.weapons }, perks: { ...run.perks },
      best: Math.max(meta.best, reached), felled: meta.felled + run.felled,
    },
  };
}

// ───────────────────────── a player ─────────────────────────

const OFFER_ORDER = ['flail', 'sabre', 'grape', 'mortar', 'pike', 'plate', 'drum', 'oil', 'rally', 'barbs', 'bounty'];

/**
 * A competent move. In a draft: the offer index. In a turn: the action that fells the most this turn and
 * leaves the fewest figures able to strike next turn. It looks one turn ahead and no further, which is
 * about what a person does on a phone; the tests use it to say what the waves ask of a player.
 */
export function suggest(run) {
  if (run.phase === 'draft') {
    if (run.hero.hp * 2 <= run.hero.maxHp) {
      const d = run.offers.findIndex((o) => o.id === 'dressing' || o.id === 'plate');
      if (d >= 0) return d;
    }
    let best = 0, rank = Infinity;
    run.offers.forEach((o, i) => { const r = OFFER_ORDER.indexOf(o.id); if (r >= 0 && r < rank) { rank = r; best = i; } });
    return best;
  }
  if (run.phase !== 'turn') throw new Error(`fray.suggest: nothing to suggest in phase ${JSON.stringify(run.phase)}`);
  let bestAct = 'wait', bestScore = -Infinity;
  for (const a of ACTS) {
    const r = act(run, a);
    const felled = r.felled - run.felled;
    const lost = run.hero.hp - r.hero.hp;
    // Cuts that did not fell anything still count, or a captain would be run from for ever.
    let dealt = 0;
    for (const e of r.events) if (e.type === 'hit') dealt++;
    let near = 0;
    for (const f of r.foes) if (Math.abs(f.x - r.hero.x) + Math.abs(f.y - r.hero.y) === 1) near += FOES[f.kind].dmg;
    // Away from the walls: a figure against one can be come at from three sides and leave by one.
    const wall = Math.min(r.hero.x, W - 1 - r.hero.x, r.hero.y, H - 1 - r.hero.y);
    // With only stragglers left the wave has to be finished: two slow figures out of step with each other
    // always have one about to strike, and a player who will never take a cut circles them for ever.
    const mop = run.queue.length === 0 && run.foes.length <= 3;
    const score = felled * 3 + dealt * (mop ? 4 : 1) - lost * (mop ? 1 : 8) - near * (mop ? 0 : 4) + Math.min(wall, 2) * 0.6
      - (r.phase === 'over' ? 1000 : 0) + (a === 'wait' ? -0.2 : 0);
    if (score > bestScore) { bestScore = score; bestAct = a; }
  }
  return bestAct;
}
