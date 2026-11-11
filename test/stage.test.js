// The stage model (src/core/stage.js), the event log the reducer keeps for it (game.recent), and the
// encounter data of chapter 1. Pure: no shell, no GL.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggest } from '../src/core/fray.js';
import { content } from '../src/content/index.js';
import { init, update, toSave, LOADABLE_SAVES, AID_WAIT, LEVER_DELAY } from '../src/core/game.js';
import { STEP, addLiveBall } from '../src/core/physics.js';
import { initEcon, awardBonus, awardPoints } from '../src/core/economy.js';
import { objectiveProgress } from '../src/core/story.js';
import {
  comboOf, comboBonus, pushRecent, stageState, beatAt, encounterProblems, setsNeeded,
  COMBO_WEIGHT, COMBO_WINDOW, COMBO_LEVELS, COMBO_NAMES, COMBO_MULT, RECENT_MAX, RESOLVE_SECONDS,
  ENCOUNTER_KINDS, ENCOUNTER_MODES, LIGHTS,
} from '../src/core/stage.js';

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); }
  return o;
}
function mulberry(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const IDLE = { left: false, right: false, plunge: false, nudge: null };
const tick = (plunge = false) => ({ type: 'tick', dt: STEP, input: { ...IDLE, plunge } });
/** One update on a frozen game: a reducer that mutated its argument would throw here. */
const send = (game, msg) => update(content, deepFreeze(game), msg);
function run(game, pred, { plunge = () => false, max = 120 * 90 } = {}) {
  let g = game;
  const effects = [];
  for (let i = 0; i < max; i++) {
    if (pred(g, effects)) return { game: g, effects, ticks: i };
    const r = send(g, tick(plunge(i)));
    g = r.game; effects.push(...r.effects);
  }
  throw new Error(`stage.test: predicate still false after ${max} ticks (mode ${g.mode}, log ${JSON.stringify(g.recent.slice(-5))})`);
}
const QUIET = 1e9;   // a bark cooldown nothing outlasts
/** In play at the start of chapter `chapter` scene `scene`, the table empty, past the scripted pull. */
function playAt(chapter, scene, econ = {}) {
  const save = { v: 4, chapter, scene, econ: { ...initEcon(), ...econ }, seed: 3, ending: null,
    reels: { cells: [{ sym: null, spin: 0 }, { sym: null, spin: 0 }, { sym: null, spin: 0 }], source: null, armed: true, charge: 45 } };
  return { ...send(init(3), { type: 'load', save }).game, spunThisChapter: true, barkCool: QUIET, briefed: true };
}
const vessery = content.tables.vessery;
/** Put a live ball on the table at `from`, travelling toward `to` at `speed`. */
function fire(game, from, to, speed = 500) {
  const d = Math.hypot(to[0] - from[0], to[1] - from[1]);
  return { ...game, phys: addLiveBall(game.phys, from, [(to[0] - from[0]) / d * speed, (to[1] - from[1]) / d * speed]) };
}
const mid = (t) => [(t.a[0] + t.b[0]) / 2, (t.a[1] + t.b[1]) / 2];
/** Fire a ball square at a standup target from the open side of the table. */
function hitTarget(game, id) {
  const t = vessery.targets.find((x) => x.id === id);
  const m = mid(t);
  const nx = -(t.b[1] - t.a[1]), ny = t.b[0] - t.a[0], nl = Math.hypot(nx, ny);
  const side = (200 - m[0]) * nx + (300 - m[1]) * ny > 0 ? 1 : -1;   // the face toward the middle of the table
  const from = [m[0] + nx / nl * 30 * side, m[1] + ny / nl * 30 * side];
  return run(fire(game, from, m), (g) => g.logged > game.logged && g.recent.some((e) => e.n >= game.logged && e.type === 'target'), { max: 240 });
}
const entries = (game, since = 0) => game.recent.filter((e) => e.n >= since && e.type !== 'chain');
const types = (game, since = 0) => entries(game, since).map((e) => e.type);

// ───────────────────────── comboOf ─────────────────────────

const ev = (t, type, more = {}) => ({ t, type, ...more });

test('comboOf: an empty log is no combo', () => {
  assert.deepEqual(comboOf([], 10), { count: 0, level: 0, left: 0, last: -Infinity, name: '', mult: 1 });
});

test('comboOf: each event adds its weight; what is not listed neither counts nor breaks', () => {
  const log = [ev(1, 'bumper'), ev(1.1, 'sling'), ev(1.2, 'lane'), ev(1.3, 'target'), ev(1.4, 'saucer'), ev(1.5, 'shot'),
    ev(1.6, 'launch'), ev(1.7, 'loan'), ev(1.8, 'aid'), ev(1.9, 'trust'), ev(2, 'payout', { kind: 'payout' }), ev(2.1, 'objective')];
  const want = 1 + 1 + 1 + 2 + 2 + 3 + 3 + 2;
  const c = comboOf(log, 2.1);
  assert.equal(c.count, want);
  assert.equal(c.last, 2.1);
  assert.equal(c.left, 1);
  for (const type of Object.keys(COMBO_WEIGHT)) assert.equal(comboOf([ev(0, type, { kind: 'payout' })], 0).count, COMBO_WEIGHT[type], type);
});

test('comboOf: a bust is not a hit, a jackpot is', () => {
  assert.equal(comboOf([ev(0, 'payout', { kind: 'bust' })], 0).count, 0);
  assert.equal(comboOf([ev(0, 'payout', { kind: 'jackpot' })], 0).count, COMBO_WEIGHT.payout);
});

test('comboOf: the chain lasts COMBO_WINDOW seconds past its last hit, and `left` runs down over them', () => {
  const log = [ev(10, 'shot')];
  assert.equal(comboOf(log, 10).left, 1);
  assert.ok(Math.abs(comboOf(log, 10 + COMBO_WINDOW / 2).left - 0.5) < 1e-9);
  assert.equal(comboOf(log, 10 + COMBO_WINDOW).count, 3, 'still alive on the last instant');
  assert.deepEqual(comboOf(log, 10 + COMBO_WINDOW + 0.01), { count: 0, level: 0, left: 0, last: -Infinity, name: '', mult: 1 });
  // a gap inside the log restarts the count
  assert.equal(comboOf([ev(0, 'shot'), ev(COMBO_WINDOW + 0.1, 'bumper')], COMBO_WINDOW + 0.1).count, 1);
  assert.equal(comboOf([ev(0, 'shot'), ev(COMBO_WINDOW, 'bumper')], COMBO_WINDOW).count, 4);
});

test('comboOf: a drain breaks the chain, unless a ball save covered it', () => {
  const hits = [ev(1, 'shot'), ev(1.5, 'shot')];
  assert.equal(comboOf([...hits, ev(2, 'drain', { saved: false }), ev(2.2, 'bumper')], 2.2).count, 1);
  assert.equal(comboOf([...hits, ev(2, 'drain', { saved: false })], 2).count, 0);
  assert.equal(comboOf([...hits, ev(2, 'drain', { saved: true }), ev(2.2, 'bumper')], 2.2).count, 7);
  assert.equal(comboOf([...hits, ev(2, 'drain')], 2).count, 0, 'a drain that does not say is not saved');
});

test('comboOf: levels begin at COMBO_LEVELS, each with its name and multiplier', () => {
  assert.equal(COMBO_LEVELS.length + 1, COMBO_NAMES.length);
  assert.equal(COMBO_LEVELS.length + 1, COMBO_MULT.length);
  const of = (count) => comboOf(Array.from({ length: count }, (_, i) => ev(i * 0.01, 'bumper')), count * 0.01);
  assert.equal(of(0).level, 0);
  COMBO_LEVELS.forEach((at, i) => {
    assert.equal(of(at - 1).level, i, `${at - 1} hits`);
    const c = of(at);
    assert.deepEqual([c.level, c.name, c.mult], [i + 1, COMBO_NAMES[i + 1], COMBO_MULT[i + 1]], `${at} hits`);
  });
  assert.equal(of(500).level, COMBO_LEVELS.length, 'and no higher');
  assert.deepEqual([COMBO_MULT[0], COMBO_MULT[1]], [1, 1], 'single jabs pay no bonus');
  for (let i = 1; i < COMBO_MULT.length; i++) assert.ok(COMBO_MULT[i] >= COMBO_MULT[i - 1]);
  for (let i = 2; i < COMBO_NAMES.length; i++) assert.ok(COMBO_NAMES[i].length > 0 && COMBO_NAMES[i].length <= 16, COMBO_NAMES[i]);
});

test('comboOf: asked about the past, it ignores what came after; and it takes its window and levels as options', () => {
  const log = [ev(1, 'shot'), ev(2, 'shot'), ev(3, 'drain', { saved: false })];
  assert.equal(comboOf(log, 2.5).count, 6);
  assert.equal(comboOf(log, 1).count, 3);
  assert.equal(comboOf(log, 0.5).count, 0);
  assert.equal(comboOf([ev(0, 'bumper'), ev(5, 'bumper')], 5, { window: 6 }).count, 2);
  assert.equal(comboOf([ev(0, 'bumper'), ev(0, 'bumper')], 0, { levels: [2] }).level, 1);
});

test('comboOf: fails loudly on a log it cannot read', () => {
  assert.throws(() => comboOf(null, 0), /log must be an array/);
  assert.throws(() => comboOf([], NaN), /now must be a number/);
  assert.throws(() => comboOf([{ type: 'bumper' }], 0), /entry 0 has no time/);
  assert.throws(() => comboOf([], 0, { window: 0 }), /window must be > 0/);
});

test('comboOf does not touch the log', () => {
  const log = deepFreeze([ev(1, 'shot'), ev(2, 'drain', { saved: false }), ev(3, 'bumper')]);
  assert.equal(comboOf(log, 3).count, 1);
});

test('comboBonus: the multiplier less one, of the points, whole; nothing at levels 0 and 1', () => {
  const at = (count) => Array.from({ length: count }, (_, i) => ev(i * 0.001, 'bumper'));
  assert.equal(comboBonus([], 0, 500), 0);
  assert.equal(comboBonus(at(COMBO_LEVELS[1] - 1), 0.1, 500), 0);
  COMBO_LEVELS.forEach((n, i) => assert.equal(comboBonus(at(n), 0.1, 100), Math.round(100 * (COMBO_MULT[i + 1] - 1))));
  assert.equal(comboBonus(at(COMBO_LEVELS[1]), 0.1, 0), 0);
  assert.equal(comboBonus(at(COMBO_LEVELS[1]), 0.1, 50) % 1, 0);
});

// ───────────────────────── the bounded log ─────────────────────────

/** A random stream of table events: bursts, pauses longer than the window, drains saved and not. */
function randomHistory(seedN, n) {
  const rnd = mulberry(seedN);
  const kinds = ['bumper', 'bumper', 'bumper', 'sling', 'lane', 'target', 'saucer', 'shot', 'objective', 'launch', 'loan', 'trust'];
  const out = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    const r = rnd();
    t += r < 0.04 ? COMBO_WINDOW + rnd() * 3 : rnd() * (r < 0.5 ? 0.2 : 1.6);
    const k = rnd();
    const e = k < 0.03 ? { type: 'drain', saved: rnd() < 0.4, balls: 0 }
      : k < 0.07 ? { type: 'payout', kind: ['payout', 'jackpot', 'bust'][Math.floor(rnd() * 3)] }
        : { type: kinds[Math.floor(rnd() * kinds.length)] };
    out.push({ n: i, t, ...e });
  }
  return out;
}

test('pushRecent: the log never passes RECENT_MAX, and comboOf reads the same from it as from the whole history', () => {
  for (const seedN of [1, 2, 3, 4, 5, 6]) {
    const history = randomHistory(seedN, 1500);
    let log = [];
    let folded = 0;
    let carried = 0;
    history.forEach((e, i) => {
      log = pushRecent(deepFreeze(log), e);
      assert.ok(log.length <= RECENT_MAX, `seed ${seedN}: ${log.length} entries`);
      if (log[0].type === 'chain') folded++;
      const whole = history.slice(0, i + 1);
      // at the moment of the entry, a little later, on the edge of the window and past it
      for (const now of [e.t, e.t + 0.7, e.t + COMBO_WINDOW, e.t + COMBO_WINDOW + 0.5]) {
        assert.deepEqual(comboOf(log, now), comboOf(whole, now), `seed ${seedN}, entry ${i} (${e.type}) read at ${now}`);
      }
      // the folded entry is doing work: without it the retained entries alone would give a smaller chain
      if (log[0].type === 'chain' && comboOf(log, e.t).count > comboOf(log.slice(1), e.t).count) carried++;
    });
    assert.ok(folded > 1000, `seed ${seedN}: the log was full for most of the run (${folded})`);
    assert.ok(carried > 50, `seed ${seedN}: chains ran longer than the entries kept, ${carried} times`);
    assert.deepEqual(log.slice(1).map((e) => e.n), history.slice(-(log.length - 1)).map((e) => e.n), 'what is kept is the newest, in order');
  }
});

test('pushRecent: a long chain never counts backwards as its early hits leave the log', () => {
  let log = [];
  let before = 0;
  for (let i = 0; i < 400; i++) {
    log = pushRecent(log, { n: i, t: i * 0.25, type: i % 7 === 0 ? 'shot' : 'bumper' });
    const { count } = comboOf(log, i * 0.25);
    assert.ok(count > before, `hit ${i}: ${count} after ${before}`);
    before = count;
  }
  assert.ok(log.length <= RECENT_MAX);
});

test('pushRecent: refuses an entry with no type or time, or one older than the log', () => {
  assert.throws(() => pushRecent([], { t: 1 }), /needs a type and a time/);
  assert.throws(() => pushRecent([], { type: 'bumper' }), /needs a type and a time/);
  assert.throws(() => pushRecent([{ n: 0, t: 5, type: 'bumper' }], { n: 1, t: 4, type: 'bumper' }), /older than the log/);
});

// ───────────────────────── the reducer keeps the log ─────────────────────────

test('a new game has an empty log; it is not saved, and every loadable save starts one', () => {
  const g = init(1);
  assert.deepEqual([g.recent, g.logged], [[], 0]);
  const played = hitTarget(playAt(0, 0), 'lanternA').game;
  assert.ok(played.recent.length > 0);
  const save = toSave(played);
  assert.equal('recent' in save, false);
  assert.equal('logged' in save, false);
  assert.equal(JSON.stringify(save).includes('recent'), false);
  const back = send(init(9), { type: 'load', save: JSON.parse(JSON.stringify(save)) }).game;
  assert.deepEqual([back.recent, back.logged], [[], 0]);
  // older saves: written before there was a log, or reels, or an ending
  const econ = { score: 10, marks: 300, writs: 2, debt: 0, trust: 25, aidUsed: 0, spins: 1 };
  for (const v of LOADABLE_SAVES.filter((x) => x < 3)) {
    const old = send(init(1), { type: 'load', save: { v, chapter: 0, scene: 2, econ, seed: 11 } }).game;
    assert.deepEqual([old.mode, old.recent, old.logged], ['play', [], 0], `v:${v}`);
    assert.equal(stageState(content, old).set, 'lantern-stalls');
  }
  // a save somebody wrote with a log in it is not believed
  const forged = send(init(1), { type: 'load', save: { ...save, recent: [{ n: 0, t: 0, type: 'shot' }], logged: 99 } }).game;
  assert.deepEqual([forged.recent, forged.logged], [[], 0]);
});

test('the log: a hit on a lantern is a target and an objective step, numbered in order, at game time', () => {
  const g = playAt(0, 0);
  const r = hitTarget(g, 'lanternA');
  const got = entries(r.game);
  assert.deepEqual(got.map((e) => e.type), ['target', 'objective']);
  assert.deepEqual(got.map((e) => e.n), [0, 1]);
  assert.equal(r.game.logged, 2);
  assert.equal(got[0].id, 'lanternA');
  assert.deepEqual({ id: got[1].id, done: got[1].done, total: got[1].total }, { id: 'lanternA', done: 1, total: 3 });
  assert.ok(got[0].t > g.t && got[0].t <= r.game.t && got[0].t === got[1].t);
  assert.equal(r.effects.filter((e) => e.type === 'sfx' && e.name === 'objective').length, 1);
});

test('the log: the last lantern clears the scene; trust and sceneClear are entered, and the stage resolves', () => {
  const g = { ...playAt(0, 0), hits: { lanternA: 1, lanternB: 1 } };
  const r = hitTarget(g, 'lanternC');
  assert.equal(r.game.mode, 'cine');
  const got = entries(r.game);
  assert.deepEqual(got.map((e) => e.type), ['target', 'objective', 'trust', 'sceneClear']);
  assert.deepEqual({ done: got[1].done, total: got[1].total }, { done: 3, total: 3 });
  assert.deepEqual({ n: got[2].n, gained: got[2].gained, trust: got[2].trust }, { n: 2, gained: 25, trust: 25 });
  assert.equal(got[3].scene, 'ch1.s1');
  const st = stageState(content, r.game);
  assert.equal(st.phase, 'resolve');
  assert.deepEqual(st.progress, { done: 3, total: 3 });
  assert.equal(st.beat.cue, 'lantern-tessaly');
});

test('the log: a lit bank target spots its hit along the bank, and the objective entry names the lantern that lit', () => {
  const g = { ...playAt(0, 0), hits: { lanternA: 1 } };
  const r = hitTarget(g, 'lanternA');
  const got = entries(r.game);
  assert.deepEqual(got.map((e) => [e.type, e.id]), [['target', 'lanternA'], ['objective', 'lanternB']]);
});

test('the log: lanes are lanes, bumpers bumpers, the saucer a saucer, and a shot says ramp or orbit', () => {
  const lot = vessery.rollovers.find((x) => x.id === 'lotC');
  let r = run(fire(playAt(0, 0), [lot.pos[0], lot.pos[1] - 30], lot.pos, 200), (g) => g.logged > 0, { max: 120 });
  assert.deepEqual(entries(r.game).map((e) => [e.type, e.id]), [['lane', 'lotC']]);

  const drum = vessery.bumpers[0];
  r = run(fire(playAt(0, 0), [drum.pos[0], drum.pos[1] + 60], drum.pos), (g) => g.logged > 0, { max: 120 });
  assert.deepEqual([entries(r.game)[0].type, entries(r.game)[0].id], ['bumper', 'drum1']);

  const bench = vessery.saucers[0];
  r = run(fire({ ...playAt(0, 0), reels: { ...playAt(0, 0).reels, armed: false, charge: 0 } }, [bench.pos[0], bench.pos[1] - 40], bench.pos, 100), (g) => g.logged > 0, { max: 240 });
  assert.deepEqual([entries(r.game)[0].type, entries(r.game)[0].id], ['saucer', 'bench']);

  for (const [id, via] of [['pierRamp', 'ramp'], ['dockOrbit', 'orbit']]) {
    const shot = vessery.shots.find((x) => x.id === id);
    const m = mid(shot);
    const g = { ...playAt(0, 0), reels: { ...playAt(0, 0).reels, armed: false, charge: 0 } };
    r = run(fire(g, [m[0] - shot.dir[0] * 20, m[1] - shot.dir[1] * 20], [m[0] + shot.dir[0] * 20, m[1] + shot.dir[1] * 20], 600),
      (x) => x.recent.some((e) => e.type === 'shot'), { max: 240 });
    const e = r.game.recent.find((x) => x.type === 'shot');
    assert.deepEqual([e.id, e.via], [id, via]);
  }
});

test('the log: launch, then a drain nobody saved; with a ball save running, a saved drain and the save', () => {
  const plunge = (i) => i < 50;
  let r = run(playAt(0, 0, { writs: 1 }), (g) => g.recent.some((e) => e.type === 'drain'), { plunge });
  assert.equal(types(r.game)[0], 'launch');
  const drain = r.game.recent.find((e) => e.type === 'drain');
  assert.deepEqual({ saved: drain.saved, balls: drain.balls }, { saved: false, balls: 0 });
  assert.equal(comboOf(r.game.recent, r.game.t).count, 0, 'and the chain is gone');

  const saving = { ...playAt(0, 0, { writs: 1 }), boons: { ballSave: 600, mult: 1, multT: 0, kickback: 0 } };
  r = run(saving, (g) => g.recent.some((e) => e.type === 'drain'), { plunge });
  const at = r.game.recent.findIndex((e) => e.type === 'drain');
  assert.equal(r.game.recent[at].saved, true);
  assert.deepEqual([r.game.recent[at + 1].type, r.game.recent[at + 1].kind], ['save', 'ballSave']);
});

test('the log: the hat, the gift, and both kinds of loan', () => {
  // no trust: an empty purse borrows for want of a choice
  let g = run(playAt(0, 0, { marks: 0 }), (x) => x.emptyT > LEVER_DELAY + STEP).game;
  let r = send(g, tick(true));
  assert.deepEqual(entries(r.game).map((e) => [e.type, e.refused]), [['loan', false]]);

  // trust: the hat goes round, and comes back with a ball
  g = playAt(0, 0, { marks: 0, trust: 50 });
  r = run(g, (x) => x.recent.some((e) => e.type === 'aid'), { max: Math.round(AID_WAIT / STEP) + 20 });
  assert.deepEqual(types(r.game), ['hat', 'aid']);
  assert.ok(Math.abs(r.game.recent[1].t - r.game.recent[0].t - AID_WAIT) < 2 * STEP + 1e-9);

  // or the player will not wait: a loan with the hat refused, and the reels go
  g = run(playAt(0, 0, { marks: 0, trust: 50 }), (x) => x.emptyT > LEVER_DELAY + STEP).game;
  assert.equal(stageState(content, g).buffs.hat, true);
  r = send(g, tick(true));
  assert.deepEqual(entries(r.game).map((e) => [e.type, e.refused]), [['hat', undefined], ['loan', true]]);
});

test('the log: a line paid on the reels is a payout, with its kind, boon, source and writs', () => {
  const g = run(playAt(0, 0, { marks: 1000 }), (x) => x.emptyT > LEVER_DELAY + STEP).game;
  const pulled = send(g, tick(true)).game;
  const r = run(pulled, (x) => x.reels.phase === 'paying');
  const e = r.game.recent.find((x) => x.type === 'payout');
  const { payout } = r.game.reels.result;
  assert.ok(['payout', 'jackpot', 'bust'].includes(e.kind));
  assert.deepEqual({ boon: e.boon, source: e.source, writs: e.writs }, { boon: payout.boon, source: 'lever', writs: payout.writs });
});

test('the log: the charge that lights the spin shots is entered once', () => {
  const g0 = playAt(0, 2);
  const g = { ...g0, reels: { ...g0.reels, armed: false, charge: g0.reels.need - 1 } };
  const drum = vessery.bumpers[2];
  const r = run(fire(g, [drum.pos[0], drum.pos[1] + 60], drum.pos), (x) => x.reels.armed, { max: 240 });
  assert.deepEqual(types(r.game).filter((t) => t === 'lit'), ['lit']);
});

test('combo bonus: a hit in a chain adds score and not one mark; objectives count the same', () => {
  // twelve hits already in the chain: the next bumper is at level 2
  const chain = Array.from({ length: COMBO_LEVELS[1] }, (_, i) => ({ n: i, t: 0, type: 'bumper', id: 'drum1' }));
  const drum = vessery.bumpers[0];
  const from = [drum.pos[0], drum.pos[1] + 60];
  const plain = run(fire(playAt(0, 2), from, drum.pos), (g) => g.logged > 0, { max: 120 });
  const hot = run(fire({ ...playAt(0, 2), recent: chain, logged: chain.length }, from, drum.pos), (g) => g.logged > chain.length, { max: 120 });
  assert.equal(comboOf(hot.game.recent, hot.game.t).level, 2);
  const base = awardPoints(playAt(0, 2).econ, 100);
  assert.deepEqual(plain.game.econ, base);
  assert.deepEqual(hot.game.econ, awardBonus(base, 100 * (COMBO_MULT[2] - 1)));
  assert.equal(hot.game.econ.marks, plain.game.econ.marks);
  assert.deepEqual(hot.game.hits, plain.game.hits);
  assert.deepEqual(hot.game.rng, plain.game.rng);
  assert.deepEqual(hot.game.reels, plain.game.reels);
});

test('awardBonus: score only', () => {
  const e = { ...initEcon(), debt: 100, marks: 5 };
  assert.deepEqual(awardBonus(e, 250), { ...e, score: 250 });
  assert.throws(() => awardBonus(e, -1), /points must be a finite number >= 0/);
  assert.throws(() => awardBonus(null, 1), /not an Econ/);
});

// ───────────────────────── stageState ─────────────────────────

const PHASES = ['fight', 'resolve', 'dialogue', 'idle'];

test('stageState: nothing is staged on the title, the card or the end screen', () => {
  for (const g of [init(1), send(init(1), { type: 'confirm' }).game, { ...init(1), mode: 'end' }]) {
    const st = stageState(content, g);
    assert.deepEqual([st.phase, st.set, st.light, st.party, st.opposition], ['idle', null, null, [], null], g.mode);
    assert.deepEqual(st.combo, comboOf([], g.t));
    assert.ok(st.power > 0 && st.power <= 1);
  }
});

test('stageState: the prologue is dialogue on the sets its backdrops name, lit as the chapter says', () => {
  let g = send(send(init(1), { type: 'confirm' }).game, { type: 'confirm' }).game;
  const seen = [];
  while (g.mode === 'cine') {
    const st = stageState(content, g);
    const line = g.cine.lines[g.cine.index];
    assert.deepEqual([st.phase, st.kind, st.line, st.speaker, st.radio], ['dialogue', 'prologue', line, line.who, line.fx === 'radio'], line.id);
    assert.deepEqual([st.set, st.party], [g.cine.bg, g.cine.on], line.id);
    assert.equal(st.light, content.chapters[0].stage.sets[g.cine.bg].light, line.id);
    assert.deepEqual([st.opposition, st.beat, st.progress], [null, null, { done: 0, total: 0 }]);
    if (seen[seen.length - 1] !== st.set) seen.push(st.set);
    g = send(g, { type: 'confirm' }).game;
  }
  assert.deepEqual(seen, ['ledger', 'orrery', 'ledger', 'harbor-night', 'drum-hall']);
  assert.equal(g.mode, 'play');
});

test('stageState: in play it is the scene\'s encounter, with the objective as the bar and the beat it has reached', () => {
  const ch = content.chapters[0];
  ch.scenes.forEach((scene, i) => {
    const g = playAt(0, i);
    const st = stageState(content, g);
    const e = scene.encounter;
    assert.deepEqual([st.phase, st.kind, st.set, st.light, st.mode], ['fight', 'scene', e.set, e.light, e.mode], scene.id);
    assert.equal(st.party, e.party);
    assert.equal(st.opposition, e.opposition);
    assert.deepEqual(st.extras, e.extras || []);
    assert.equal(st.setback, e.setback);
    assert.deepEqual(st.progress, { done: 0, total: objectiveProgress(scene, {}, 0).total });
    assert.deepEqual(st.beat, { index: 0, of: e.beats.length, ...e.beats[0] });
    assert.deepEqual([st.line, st.speaker, st.radio], [null, null, false]);
  });
  // Weighted Drums: twenty hits, five beats
  const drums = (n) => stageState(content, { ...playAt(0, 2), hits: { drum1: n } });
  assert.deepEqual([0, 4, 5, 9, 10, 14, 15, 19].map((n) => drums(n).beat.cue),
    ['odds-called', 'odds-called', 'column-one', 'column-one', 'column-three', 'column-three', 'column-four', 'column-four']);
  assert.deepEqual(drums(7).progress, { done: 7, total: 20 });
  // Cast Off is a sequence: the cursor is the progress
  assert.equal(stageState(content, { ...playAt(0, 6), seq: 2 }).beat.cue, 'a-way-made');
});

test('stageState: a cleared scene resolves on its own set for RESOLVE_SECONDS, then its cutscene is dialogue there with no change of light', () => {
  const ch = content.chapters[0];
  const g = { ...playAt(0, 0), hits: { lanternA: 1, lanternB: 1 } };
  let r = hitTarget(g, 'lanternC');
  let st = stageState(content, r.game);
  assert.deepEqual([st.phase, st.set, st.light, st.party, st.opposition], ['resolve', 'lantern-stalls', 'dusk', ['ren', 'nan'], ch.scenes[0].encounter.opposition]);
  r = run(r.game, (x) => x.cine.t >= RESOLVE_SECONDS, { max: 400 });
  assert.equal(r.game.cine.index, 0, 'still on the first line');
  st = stageState(content, r.game);
  assert.deepEqual([st.phase, st.kind, st.set, st.light, st.party, st.opposition], ['dialogue', 'scene', 'lantern-stalls', 'dusk', ['nan', 'ren'], null]);
  assert.equal(st.line.id, 'ch1.s1.c01');
  assert.equal(st.cam, 'wide');
  // the same stalls are lit for night when the chapter comes back to them in scene 3, and the harbour is the chapter's
  const s3 = { ...playAt(0, 2), mode: 'cine', cine: { kind: 'scene', lines: ch.scenes[2].cutscene, index: 0, lineT: 0, bg: 'lantern-stalls', on: ['tobb', 'ren'], t: 5 } };
  assert.deepEqual([stageState(content, s3).set, stageState(content, s3).light], ['lantern-stalls', 'night']);
  const s3b = { ...s3, cine: { ...s3.cine, index: 12, bg: 'harbor-night' } };
  st = stageState(content, s3b);
  assert.deepEqual([st.set, st.light, st.speaker, st.emote], ['harbor-night', 'night', 'crowd', 'anger']);
});

test('stageState: power is low on an empty table, better with a ball waiting, and rises with a ball in play and a chain', () => {
  const empty = playAt(0, 0);
  const waiting = run(playAt(0, 0, { writs: 1 }), (g) => g.phys.balls.length === 1).game;
  const drum = vessery.bumpers[0];
  const live = fire(playAt(0, 0), [drum.pos[0], drum.pos[1] + 200], drum.pos, 100);
  const hit = run(fire(playAt(0, 0), [drum.pos[0], drum.pos[1] + 60], drum.pos), (g) => g.logged > 0, { max: 120 }).game;
  const chain = Array.from({ length: COMBO_LEVELS[3] }, (_, i) => ({ n: i, t: hit.t, type: 'bumper' }));
  const storm = { ...hit, recent: chain, logged: chain.length };
  const p = [empty, waiting, live, hit, storm].map((g) => stageState(content, g).power);
  for (let i = 1; i < p.length; i++) assert.ok(p[i] > p[i - 1], `power ${p.join(' < ')}`);
  assert.ok(p[0] > 0 && p[p.length - 1] <= 1);
  assert.equal(stageState(content, storm).combo.level, 4);
  // a hit fades: a few seconds on with nothing struck, the same ball lights the stage less
  const later = { ...hit, t: hit.t + 10 };
  assert.ok(stageState(content, later).power < stageState(content, hit).power);
});

test('stageState: buffs are the boons, the extra balls, the hat and the town\'s trust', () => {
  const g0 = playAt(0, 0, { trust: 60, debt: 250 });
  const g = { ...g0, boons: { ballSave: 12, mult: 2, multT: 20, kickback: 1 }, multiQueue: 1 };
  const twoBalls = fire(fire(g, [200, 300], [200, 400], 10), [220, 300], [220, 400], 10);
  assert.deepEqual(stageState(content, twoBalls).buffs,
    { shield: 12, double: 2, doubleT: 20, kickback: 1, helpers: 2, hat: false, supporters: 2, trust: 60, debt: 250 });
  assert.deepEqual(stageState(content, playAt(0, 0)).buffs,
    { shield: 0, double: 1, doubleT: 0, kickback: 0, helpers: 0, hat: false, supporters: 0, trust: 0, debt: 0 });
});

test('stageState reads and never writes', () => {
  const g = deepFreeze({ ...playAt(0, 4), hits: { pierRamp: 2 } });
  const a = stageState(content, g);
  const b = stageState(content, g);
  assert.deepEqual(a, b);
  assert.equal(a.beat.cue, 'along-the-pier');
});

test('stageState: a chapter that is not staged yet still answers (set null in play, the backdrop key in a cinematic)', () => {
  for (let c = 1; c < content.chapters.length; c++) {
    const ch = content.chapters[c];
    if (ch.stage) continue;
    const st = stageState(content, playAt(c, 0));
    assert.deepEqual([st.phase, st.set, st.light, st.opposition, st.beat], ['fight', null, null, null, null], ch.id);
    assert.deepEqual(st.progress, { done: 0, total: objectiveProgress(ch.scenes[0], {}, 0).total });
    const cine = { kind: 'prologue', lines: ch.prologue, index: 0, lineT: 0, bg: ch.prologue[0].bg, on: [], t: 0 };
    const d = stageState(content, { ...playAt(c, 0), mode: 'cine', cine });
    assert.deepEqual([d.phase, d.set, d.light], ['dialogue', ch.prologue[0].bg, null], ch.id);
    assert.deepEqual(setsNeeded(ch), []);
  }
});

test('stageState: a staged chapter with a backdrop it has no set for fails by name', () => {
  const ch = content.chapters[0];
  const cine = { kind: 'epilogue', lines: ch.epilogue, index: 0, lineT: 0, bg: 'causeway', on: [], t: 0 };
  assert.throws(() => stageState(content, { ...playAt(0, 0), scene: 7, mode: 'cine', cine }), /ch1\.stage\.sets has no entry for backdrop "causeway"/);
});

// ───────────────────────── chapter 1's encounters ─────────────────────────

const ch1 = content.chapters[0];

test('chapter 1: every scene has a well-formed encounter', () => {
  for (const scene of ch1.scenes) assert.deepEqual(encounterProblems(content, ch1, scene), [], scene.id);
  assert.deepEqual(ENCOUNTER_KINDS, ['people', 'force']);
  assert.ok(ENCOUNTER_MODES.includes('fight') && LIGHTS.includes('dusk'));
});

test('chapter 1: an encounter is on the set its own cutscene opens on, so it resolves into the dialogue without a cut', () => {
  for (const scene of ch1.scenes) assert.equal(scene.encounter.set, scene.cutscene[0].bg, scene.id);
});

test('chapter 1: only people the story has there are on stage', () => {
  for (const scene of ch1.scenes) {
    const present = new Set();
    for (const l of [...scene.briefing, ...scene.cutscene]) {
      if (l.fx !== 'radio') present.add(l.who);
      for (const id of l.on || []) present.add(id);
    }
    const e = scene.encounter;
    const people = [...e.party, ...(e.extras || []), ...e.opposition.who].filter((id) => Object.hasOwn(content.cast, id));
    for (const id of people) assert.ok(present.has(id), `${scene.id}: ${id} is staged but neither speaks in person nor stands in the cutscene`);
    assert.ok(!people.includes('thorne'), `${scene.id}: Thorne is a voice in an earpiece`);
    assert.ok(!people.includes('narrator') && !people.includes('crowd'));
    assert.ok(e.party.includes('ren'), `${scene.id}: Ren is in every scene of his own exam`);
  }
  // Ilse is met in the cutscene of scene 2, and is the Tribune's name only from scene 4
  assert.ok(!ch1.scenes[0].encounter.party.includes('ilse') && !ch1.scenes[1].encounter.party.includes('ilse'));
});

test('chapter 1: three to five beats a scene, and a beat for every step where the objective is short', () => {
  for (const scene of ch1.scenes) {
    const { beats } = scene.encounter;
    const total = objectiveProgress(scene, {}, 0).total;
    assert.ok(beats.length >= 3 && beats.length <= 5, `${scene.id}: ${beats.length} beats`);
    if (total <= 4) assert.deepEqual(beats.map((b) => b.at), Array.from({ length: total + 1 }, (_, i) => i), scene.id);
    for (let d = 0; d <= total; d++) assert.ok(beatAt(scene.encounter, d) >= 0);
    assert.equal(beatAt(scene.encounter, total), beats.length - 1);
  }
  const cues = ch1.scenes.flatMap((s) => [...s.encounter.beats.map((b) => b.cue), s.encounter.setback.cue]);
  assert.equal(new Set(cues).size, cues.length, 'cue keys are unique across the chapter');
});

test('chapter 1: the chapter is not a brawl; force is used once, on the pier, and against people only there', () => {
  const by = (k) => ch1.scenes.filter((s) => s.encounter.opposition.kind === k).map((s) => s.id);
  assert.deepEqual(ch1.scenes.filter((s) => s.encounter.mode === 'fight').map((s) => s.id), ['ch1.s5']);
  assert.deepEqual(by('people'), ['ch1.s5']);
  assert.equal(by('force').length, 6);
});

test('chapter 1: its stage names a set for every backdrop its lines use, and setsNeeded lists them once each', () => {
  const bgs = new Set();
  for (const l of [...ch1.prologue, ...ch1.epilogue, ...ch1.scenes.flatMap((s) => s.cutscene)]) if (l.bg) bgs.add(l.bg);
  for (const bg of bgs) {
    assert.ok(Object.hasOwn(ch1.stage.sets, bg), `no set for ${bg}`);
    assert.ok(LIGHTS.includes(ch1.stage.sets[bg].light), bg);
  }
  assert.deepEqual(Object.keys(ch1.stage.sets).sort(), [...bgs].sort(), 'and no entry nobody uses');
  assert.deepEqual(setsNeeded(ch1), ['ledger', 'orrery', 'harbor-night', 'drum-hall', 'lantern-stalls', 'bench', 'pier-riot', 'mint-office', 'ferry-dawn', 'line', 'black']);
  assert.equal(typeof ch1.stage.clerk, 'string');
  assert.equal(typeof ch1.stage.townsfolk, 'string');
});

test('encounterProblems names what is wrong', () => {
  const scene = ch1.scenes[2];
  const bad = (patch) => encounterProblems(content, ch1, { ...scene, encounter: { ...scene.encounter, ...patch } });
  assert.match(encounterProblems(content, ch1, { ...scene, encounter: undefined })[0], /ch1\.s3 has no encounter/);
  assert.match(bad({ light: 'noon' })[0], /light must be one of/);
  assert.match(bad({ mode: 'brawl' })[0], /mode must be one of/);
  assert.match(bad({ party: ['ren', 'thorn'] })[0], /"thorn", who is not a person in the cast/);
  assert.match(bad({ party: ['crowd'] })[0], /not a person in the cast/);
  assert.match(bad({ party: [] })[0], /one to three cast ids/);
  assert.match(bad({ opposition: { kind: 'weather', who: ['storm'], name: 'STORM' } })[0], /kind must be one of/);
  assert.match(bad({ opposition: { kind: 'force', who: [], name: 'X' } })[0], /one to three ids or type names/);
  assert.match(bad({ opposition: { kind: 'force', who: ['x'], name: 'A NAME FAR TOO LONG FOR THE BAR' } })[0], /1 to 22 characters/);
  assert.match(bad({ extras: ['a', 'b', 'c', 'd'] })[0], /at most three/);
  assert.match(bad({ setback: null })[0], /setback needs a cue/);
  assert.match(bad({ set: 'moon' })[0], /"moon" is not in ch1\.stage\.sets/);
  const beats = scene.encounter.beats;
  assert.match(bad({ beats: beats.slice(1) })[0], /must open at 0/);
  assert.match(bad({ beats: beats.slice(0, -1) })[0], /must end at the objective's total \(20\)/);
  assert.match(bad({ beats: [beats[0], beats[2], beats[1], beats[4]] })[0], /greater than the beat before/);
  assert.match(bad({ beats: [beats[0], { ...beats[1], cue: beats[0].cue }, beats[4]] })[0], /used twice/);
  assert.match(bad({ beats: [beats[0], { ...beats[1], cue: 'Column One' }, beats[4]] })[0], /kebab-case/);
});

// ───────────────────────── a whole chapter, watched ─────────────────────────

test('chapter 1 start to finish: the stage always has an answer, the log stays in order and in bounds, and every scene resolves', () => {
  const rnd = mulberry(5);
  let g = init(5);
  const cursor = { n: 0 };
  const phases = new Set();
  const resolved = [];
  const seenTypes = new Set();
  let steps = 0;
  const flip = { left: 0, right: 0 };
  const watch = () => {
    const st = stageState(content, g);
    assert.ok(PHASES.includes(st.phase));
    phases.add(st.phase);
    assert.ok(st.power >= 0 && st.power <= 1);
    assert.ok(st.progress.done <= st.progress.total);
    assert.ok(g.recent.length <= RECENT_MAX);
    if (st.phase === 'fight' || st.phase === 'resolve') {
      assert.ok(st.beat && st.beat.at <= st.progress.done, `${st.set}: beat ${JSON.stringify(st.beat)} at ${JSON.stringify(st.progress)}`);
      assert.equal(st.set, ch1.scenes[g.scene].encounter.set);
    }
    if (st.phase === 'resolve' && resolved[resolved.length - 1] !== ch1.scenes[g.scene].id) {
      resolved.push(ch1.scenes[g.scene].id);
      assert.equal(st.progress.done, st.progress.total);
      assert.equal(st.beat.index, st.beat.of - 1, 'the resolve shows the last beat');
    }
  };
  while (!(g.chapter === 1)) {
    if (++steps > 120 * 60 * 40) throw new Error(`stage.test: chapter 1 not finished after 40 minutes of ticks (scene ${g.scene}, mode ${g.mode})`);
    const before = g;
    if (g.mode === 'title' || g.mode === 'card') g = send(g, { type: 'confirm' }).game;
    else if (g.mode === 'fray') {
      // Lanewar: nothing is staged while the board is open; play one wave and go back
      assert.equal(stageState(content, g).phase, 'idle');
      const { run } = g;
      g = send(g, run.phase === 'over' ? { type: 'confirm' } : run.phase === 'draft' ? (run.cleared > 0 ? { type: 'fray', leave: true } : { type: 'fray', pick: suggest(run) }) : { type: 'fray', act: suggest(run) }).game;
    } else if (g.mode === 'cine') {
      watch();
      g = g.cine.t < RESOLVE_SECONDS + 0.05 && g.cine.kind === 'scene' ? send(g, tick()).game : send(g, { type: 'confirm' }).game;
    } else {
      // a crude player: flips when a ball is low, plunges, and takes whatever the lever offers
      const low = g.phys.balls.some((b) => b.state === 'live' && b.pos[1] > 640 && b.vel[1] > -100);
      for (const side of ['left', 'right']) flip[side] = flip[side] > 0 ? flip[side] - 1 : (low && rnd() < 0.2 ? 12 : 0);
      const press = g.phys.balls.some((b) => b.state === 'plunger') ? steps % 80 < 60 : steps % 24 < 4;
      g = update(content, g, { type: 'tick', dt: STEP, input: { left: flip.left > 0, right: flip.right > 0, plunge: press, nudge: null } }).game;
      if (steps % 30 === 0) watch();
    }
    // the log only grows at the end, in order
    assert.ok(g.logged >= before.logged);
    for (const e of g.recent) {
      if (e.type === 'chain' || e.n < cursor.n) continue;
      assert.equal(e.n, cursor.n, 'entries are numbered without a gap');
      cursor.n++;
      seenTypes.add(e.type);
    }
    assert.equal(cursor.n, g.logged);
    for (let i = 1; i < g.recent.length; i++) assert.ok(g.recent[i].t >= g.recent[i - 1].t);
  }
  assert.deepEqual(resolved, ch1.scenes.map((s) => s.id));
  assert.deepEqual([...phases].sort(), ['dialogue', 'fight', 'resolve']);
  for (const t of ['launch', 'bumper', 'sling', 'target', 'lane', 'shot', 'saucer', 'objective', 'sceneClear', 'trust', 'payout', 'drain']) {
    assert.ok(seenTypes.has(t), `a whole chapter logged no ${t} (saw ${[...seenTypes].join(', ')})`);
  }
});
