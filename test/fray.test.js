// Lanewar: the board game inside the game (src/core/fray.js), and its way in and out of the table (game.js).
// Real time: a stick, weapons that aim themselves, timed waves, and three reels that deal the loadout.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AW, AH, DT, SLOTS, TIERS, BOARD_MAX, FX_MAX, WEAPONS, WEAPON_IDS, ITEMS, ITEM_IDS, FOES, CAPTAIN_EVERY, FALL_BACK, MULT_PAYS,
  newMeta, checkMeta, startRun, step, pull, hold, take, nextWave, settle, canLeave, canPull, canTake, matches, describe, pullCost,
  suggest, waveSeconds, foeHp, foeDmg, levelCost,
} from '../src/core/fray.js';
import { init, update, toSave, FRAY_NEED, FRAY_SAVE_SECONDS, SAVE_VERSION } from '../src/core/game.js';
import { STEP } from '../src/core/physics.js';
import { content } from '../src/content/index.js';

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); }
  return o;
}
const STILL = [0, 0];
/** A foe as the run keeps one. */
const foe = (id, kind, x, y, hp = foeHp(kind, 1)) => ({ id, kind, x, y, hp, flash: 0, kx: 0, ky: 0, state: 'walk', st: 0, cx: 0, cy: 0 });
/** A run with nothing coming on, so that only what a test puts on the board is there. */
const quiet = (meta = newMeta(), seedN = 1) => ({ ...startRun(meta, seedN), spawnT: 1e9 });
const steps = (run, n, move = STILL) => { let r = run; for (let i = 0; i < n && r.phase === 'wave'; i++) r = step(r, move); return r; };
const fxOf = (run, type) => run.fx.filter((e) => e.type === type);
/** Play with fray.suggest, looking at the board five times a second, until `stop(run)` or the hero falls. */
function play(run, stop, max = 400000) {
  let r = run, stick = STILL;
  for (let i = 0; i < max; i++) {
    if (r.phase === 'over' || stop(r)) return r;
    if (r.phase === 'wave') { if (r.n % 12 === 0) stick = suggest(r); r = step(r, stick); continue; }
    const s = suggest(r);
    r = s === null ? step(r, STILL) : s.pull ? pull(r) : s.take !== undefined ? take(r, s.take) : nextWave(r);
  }
  throw new Error(`fray.test: still playing after ${max} steps (wave ${r.wave}, phase ${r.phase})`);
}

test('a run starts in a wave: the hero in the middle at full hearts, the clock set, nobody on the board yet', () => {
  const run = startRun(newMeta(), 1);
  assert.deepEqual([run.phase, run.wave, run.t, run.foes.length], ['wave', 1, waveSeconds(1), 0]);
  assert.deepEqual([run.hero.x, run.hero.y, run.hero.hp], [AW / 2, AH / 2, 10]);
  assert.deepEqual(run.weapons.map((w) => [w.id, w.tier]), [['sabre', 1]]);
  assert.deepEqual(fxOf(run, 'wave').map((e) => e.wave), [1]);
  // a moment later the first spots are marked, away from the hero, and then figures stand on them
  let r = steps(run, 30);
  assert.ok(r.marks.length > 0 && r.foes.length === 0, 'marked before they stand');
  for (const m of r.marks) assert.ok(Math.hypot(m.x - r.hero.x, m.y - r.hero.y) >= 3.2 && m.x > 0 && m.y > 0 && m.x < AW && m.y < AH);
  r = steps(r, 60);
  assert.ok(r.foes.length > 0);
});

test('a step is pure and repeatable: frozen input, the same seed and stick give the same game', () => {
  let a = deepFreeze(startRun(newMeta(), 42)), b = startRun(newMeta(), 42);
  for (let i = 0; i < 600; i++) {
    const move = [Math.cos(i / 40), Math.sin(i / 25)];
    a = deepFreeze(step(a, move)); b = step(b, move);
  }
  assert.deepEqual(a, b);
  assert.ok(a.fx.length <= FX_MAX);
  assert.deepEqual(a.fx.map((e) => e.n), a.fx.map((e, i) => a.fxN - a.fx.length + i), 'the log counts up without a gap');
  assert.notDeepEqual(steps(startRun(newMeta(), 43), 600).foes, steps(startRun(newMeta(), 42), 600).foes);
  assert.throws(() => step(a, [2, 0]), /move must be \[x, y\]/);
  assert.throws(() => step(a, null), /move must be/);
});

test('the stick moves the hero at its speed, a diagonal no faster, and the walls hold', () => {
  const run = quiet();
  const east = steps(run, 60, [1, 0]);
  assert.ok(Math.abs(east.hero.x - run.hero.x - 4.0) < 1e-6, `a second east is ${east.hero.x - run.hero.x} units`);
  const diag = steps(run, 60, [1, 1]);
  assert.ok(Math.abs(Math.hypot(diag.hero.x - run.hero.x, diag.hero.y - run.hero.y) - 4.0) < 1e-6);
  const wall = steps(run, 600, [-1, -1]);
  assert.ok(wall.hero.x > 0 && wall.hero.x < 0.5 && wall.hero.y > 0 && wall.hero.y < 0.5);
  assert.deepEqual([steps(run, 60).hero.x, steps(run, 60).hero.y], [run.hero.x, run.hero.y]);
});

test('weapons aim themselves: the sabre fells what is near in front, and nothing swings at an empty board', () => {
  const run = quiet();
  assert.deepEqual(fxOf(steps(run, 120), 'swing'), [], 'nobody in reach: the sabre waits');
  // one figure a unit and a half east, one the same distance west (behind the cut)
  const near = { ...run, foes: [foe(900, 'foot', run.hero.x + 1.5, run.hero.y), foe(901, 'foot', run.hero.x - 1.5, run.hero.y)] };
  const r = steps(near, 30);
  const swings = fxOf(r, 'swing');
  assert.ok(swings.length >= 1 && swings[0].weapon === 'sabre');
  assert.deepEqual(fxOf(r, 'kill').map((e) => e.id).slice(0, 1), [900].filter(() => Math.abs(swings[0].a) < 0.2).concat([901].filter(() => Math.abs(swings[0].a) > 2.9)), 'the one it aimed at falls first');
  assert.equal(r.felled >= 1, true);
  assert.ok(r.take >= FOES.foot.points);
});

test('every weapon at every tier does its work on a crowd, and a higher tier is never weaker', () => {
  for (const id of WEAPON_IDS) {
    const def = WEAPONS[id];
    for (const k of ['dmg', 'cd']) assert.equal(def[k].length, TIERS, `${id}.${k}`);
    let last = 0;
    for (let tier = 1; tier <= TIERS; tier++) {
      assert.ok(def.dmg[tier - 1] / def.cd[tier - 1] >= last, `${id} tier ${tier} is no weaker than tier ${tier - 1}`);
      last = def.dmg[tier - 1] / def.cd[tier - 1];
      const run = quiet({ ...newMeta(), weapons: [{ id, tier }] });
      const crowd = [];
      for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, d = 1.2 + (i % 4) * 0.9; crowd.push(foe(1000 + i, 'grenadier', run.hero.x + Math.cos(a) * d, run.hero.y + Math.sin(a) * d, 1e6)); }
      const r = steps({ ...run, hero: { ...run.hero, hp: 1e9 }, foes: crowd }, 360);
      assert.ok(fxOf(r, 'hit').length > 0 || r.foes.some((f) => f.hp < 1e6), `${id} tier ${tier} struck somebody in six seconds`);
      for (const s of r.shots) assert.ok(Number.isFinite(s.x) && Number.isFinite(s.y));
    }
  }
});

test('figures strike on touch, once per grace; armour and dodge are counted; no hearts is a fall', () => {
  const run = quiet();
  const on = { ...run, weapons: [], foes: [foe(900, 'grenadier', run.hero.x + 0.3, run.hero.y, 1e6)] };
  let r = steps(on, 1);
  assert.deepEqual(fxOf(r, 'hurt').map((e) => e.dmg), [foeDmg('grenadier', 1)]);
  assert.equal(r.hero.hp, 10 - foeDmg('grenadier', 1));
  r = steps(r, 20);
  assert.equal(fxOf(r, 'hurt').length, 1, 'nothing more lands inside the grace');
  r = steps(r, 60);
  assert.ok(fxOf(r, 'hurt').length >= 2);
  // dodge at the cap lets most through none... and armour takes a part of each blow, never all of it
  const armoured = steps({ ...on, stats: { ...on.stats, armor: 1000 } }, 1);
  assert.deepEqual(fxOf(armoured, 'hurt').map((e) => e.dmg), [1]);
  let dodges = 0, hurts = 0, d = { ...on, stats: { ...on.stats, dodge: 1000, maxHp: 1e6 }, hero: { ...on.hero, hp: 1e6 } };
  for (let i = 0; i < 1000; i++) d = step(d, STILL);
  dodges = fxOf(d, 'dodge').length; hurts = 1e6 - d.hero.hp;
  assert.ok(hurts > 0 && hurts < 34 * 2 * 0.75, `dodge is capped: ${hurts} hearts lost in 16 seconds of standing in a grenadier`);
  assert.ok(dodges > 0);
  // the fall
  let f = { ...on, hero: { ...on.hero, hp: 1 } };
  f = steps(f, 5);
  assert.deepEqual([f.phase, f.hero.hp], ['over', 0]);
  assert.equal(f.fx[f.fx.length - 1].type, 'fallen');
  assert.equal(step(f, STILL), f, 'a fallen board does not move');
});

test('a lancer lowers its lance and then charges in a straight line; a musket levels and then fires a ball that can be walked away from', () => {
  const run = quiet();
  let r = { ...run, weapons: [], foes: [foe(900, 'lancer', run.hero.x + 4, run.hero.y)] };
  r = steps(r, 10);
  assert.equal(r.foes[0].state, 'wind');
  const x0 = r.foes[0].x;
  r = steps(r, 20);
  assert.equal(r.foes[0].x, x0, 'it stands while the lance comes down');
  r = steps(r, 12);
  assert.equal(r.foes[0].state, 'charge');
  // stepped aside, the charge goes past
  const aside = steps({ ...r, hero: { ...r.hero, y: r.hero.y + 2.5 } }, 40);
  assert.deepEqual(fxOf(aside, 'hurt'), []);
  assert.ok(aside.foes[0].x < run.hero.x, 'and carries it through where the hero stood');

  let g = { ...run, weapons: [], foes: [{ ...foe(901, 'musket', run.hero.x + 5, run.hero.y), st: 0.01 }] };
  g = steps(g, 2);
  assert.equal(g.foes[0].state, 'aim');
  g = steps(g, 50);
  assert.equal(fxOf(g, 'bolt').length, 1);
  assert.equal(g.bolts.length, 1);
  assert.equal(fxOf(steps(g, 90), 'hurt').length, 1, 'stand in its line and it lands');
  assert.equal(fxOf(steps(g, 90, [0, 1]), 'hurt').length, 0, 'walk out of its line and it does not');
});

test('tin is drawn in from near, taken on touch, and is coin and experience both; a level is a heart and a free pull', () => {
  const run = quiet();
  let r = { ...run, drops: [{ id: 1, x: run.hero.x + 1, y: run.hero.y, v: 3 }, { id: 2, x: run.hero.x + 6, y: run.hero.y, v: 1 }] };
  r = steps(r, 20);
  assert.deepEqual([r.tin, r.xp, r.drops.length], [3, 3, 1], 'the near one came in; the far one lies where it fell');
  assert.equal(r.drops[0].x, run.hero.x + 6);
  const rich = steps({ ...run, drops: [{ id: 1, x: run.hero.x, y: run.hero.y, v: levelCost(0) + 2 }] }, 1);
  assert.deepEqual([rich.level, rich.xp, rich.stats.maxHp, rich.slot.free], [1, 2, 11, 1]);
  assert.deepEqual(fxOf(rich, 'level').map((e) => e.level), [1]);
});

test('a wave is a length of time: when the clock runs out the board is swept, hearts are mended and the reels are owed a pull', () => {
  const run = startRun(newMeta(), 7);
  const r = play(run, (x) => x.phase === 'shop');
  assert.equal(r.phase, 'shop', 'the tests\' player lives through wave 1 on seed 7');
  assert.ok(Math.abs(r.time - waveSeconds(1)) < DT * 1.5);
  assert.deepEqual([r.foes.length, r.shots.length, r.drops.length, r.marks.length, r.cleared], [0, 0, 0, 0, 1]);
  assert.equal(r.hero.hp, r.stats.maxHp);
  assert.ok(r.slot.free >= 1);
  assert.deepEqual(r.slot.reels, [null, null, null]);
  assert.ok(r.felled > 10, `${r.felled} felled in wave 1`);
  assert.deepEqual(fxOf(r, 'cleared').map((e) => [e.wave, e.bonus]), [[1, 100]]);
  assert.equal(step(r, STILL), r, 'between waves, with the reels at rest, nothing moves');
});

/** A run standing at the reels with these weapons, this tin and this line showing. */
function atReels({ weapons = [{ id: 'sabre', tier: 1 }], tin = 0, reels = [null, null, null], free = 0, cleared = 1 } = {}) {
  const run = startRun({ ...newMeta(), weapons, tin }, 3);
  return { ...run, phase: 'shop', t: 0, cleared, slot: { reels, held: [false, false, false], free, pulls: 0, spinT: 0 } };
}

test('the reels: a pull is free when one is owed and costs tin when not, more each time; it cannot be bought on credit', () => {
  let r = atReels({ free: 1, tin: 0 });
  assert.equal(canPull(r), true);
  r = pull(r);
  assert.deepEqual([r.slot.free, r.tin, r.slot.pulls], [0, 0, 0]);
  assert.ok(r.slot.reels.every((s) => WEAPON_IDS.includes(s) || ITEM_IDS.includes(s)));
  assert.ok(r.slot.spinT > 0);
  assert.equal(canPull(r), false, 'not while they turn');
  assert.equal(take(r, 0), r, 'and nothing can be taken while they turn');
  for (let i = 0; i < 80; i++) r = step(r, STILL);
  assert.equal(r.slot.spinT, 0);
  assert.equal(canPull(r), false, 'no tin, nothing owed');
  assert.equal(pull(r), r);
  // paid pulls
  let p = atReels({ tin: 1000 });
  const c0 = pullCost(p);
  p = { ...pull(p), slot: { ...pull(p).slot, spinT: 0 } };
  assert.equal(p.tin, 1000 - c0);
  assert.ok(pullCost(p) > c0, 'the next one costs more');
  assert.throws(() => pull(startRun(newMeta(), 1)), /only between waves/);
});

test('the reels: one is taken; a pair is worth two and three of a kind more; the line is then spent', () => {
  // kit: once, twice, four times
  for (const [line, m] of [[['heart', 'boots', 'plate'], 1], [['heart', 'heart', 'plate'], 2], [['heart', 'heart', 'heart'], 3]]) {
    const r = atReels({ reels: line });
    assert.equal(matches(r, 0), m);
    const t = take(r, 0);
    assert.equal(t.stats.maxHp, 10 + ITEMS.heart.stats.maxHp * MULT_PAYS[m]);
    assert.equal(t.hero.hp, t.stats.maxHp);
    assert.deepEqual(t.slot.reels, [null, null, null]);
    assert.deepEqual(fxOf(t, 'took').map((e) => [e.sym, e.mult]), [['heart', m]]);
  }
  // a new weapon comes at the tier the line makes it; one already carried climbs by as much
  assert.deepEqual(take(atReels({ reels: ['pistol', 'boots', 'plate'] }), 0).weapons.map((w) => [w.id, w.tier]), [['sabre', 1], ['pistol', 1]]);
  assert.deepEqual(take(atReels({ reels: ['pistol', 'pistol', 'pistol'] }), 1).weapons.map((w) => [w.id, w.tier]), [['sabre', 1], ['pistol', 3]]);
  assert.deepEqual(take(atReels({ reels: ['sabre', 'sabre', 'plate'] }), 0).weapons.map((w) => [w.id, w.tier]), [['sabre', 3]]);
  assert.deepEqual(take(atReels({ weapons: [{ id: 'sabre', tier: 3 }], reels: ['sabre', 'sabre', 'sabre'] }), 0).weapons, take(atReels({ weapons: [{ id: 'sabre', tier: 4 }], reels: ['boots', 'boots', 'plate'] }), 2).weapons.map((w) => ({ ...w })), 'never past the last tier');
  // six hands full: a seventh kind cannot be taken, one already carried still can
  const full = WEAPON_IDS.slice(0, SLOTS).map((id) => ({ id, tier: 1 }));
  const other = WEAPON_IDS[SLOTS];
  const r = atReels({ weapons: full, reels: [other, full[0].id, 'heart'] });
  assert.deepEqual([canTake(r, 0), canTake(r, 1), canTake(r, 2)], [false, true, true]);
  assert.equal(take(r, 0), r);
  assert.match(describe(r, 0).text, /No hand free/);
  assert.match(describe(r, 1).text, /tier 1 to 2/);
});

test('the reels: a held reel stays through the next pull and draws the others toward it; never all three', () => {
  let r = atReels({ tin: 1e6, reels: ['mortar', 'boots', 'plate'] });
  r = hold(r, 0);
  assert.deepEqual(r.slot.held, [true, false, false]);
  r = hold(hold(r, 1), 2);
  assert.deepEqual(r.slot.held, [true, true, false], 'the third is refused');
  r = hold(r, 1);
  let pairs = 0;
  for (let i = 0; i < 200; i++) {
    const p = pull({ ...r, rng: { s: i * 7919 + 1 } });
    assert.equal(p.slot.reels[0], 'mortar');
    assert.deepEqual(p.slot.held, [false, false, false], 'the hold is for one pull');
    if (matches(p, 0) >= 2) pairs++;
  }
  // by chance alone two reels of seventeen symbols pair with the held one about 11% of the time
  assert.ok(pairs > 40, `${pairs} of 200 pulls with a reel held made a pair or better`);
  const empty = atReels();
  assert.equal(hold(empty, 0), empty, 'an empty reel cannot be held');
});

test('the next wave is longer and harder, starts at full hearts, and keeps pulls not yet taken', () => {
  const r = nextWave(atReels({ free: 2 }));
  assert.deepEqual([r.phase, r.wave, r.t, r.slot.free, r.hero.hp], ['wave', 2, waveSeconds(2), 2, r.stats.maxHp]);
  assert.ok(waveSeconds(2) > waveSeconds(1) && waveSeconds(40) === 60);
  assert.ok(foeHp('foot', 10) > foeHp('foot', 5) && foeDmg('foot', 10) > foeDmg('foot', 1));
  // figures come on by wave, and a captain on every fifth
  const kindsBy = (wave) => { let x = startRun({ ...newMeta(), wave }, 11); x = { ...x, hero: { ...x.hero, hp: 1e9 }, stats: { ...x.stats, maxHp: 1e9 } }; const seen = new Set(); for (let i = 0; i < 900; i++) { x = step(x, STILL); for (const f of x.foes) seen.add(f.kind); } return seen; };
  assert.deepEqual([...kindsBy(1)], ['foot']);
  for (const [kind, def] of Object.entries(FOES)) if (def.from > 1 && kind !== 'captain') assert.equal(kindsBy(def.from - 1).has(kind), false, `${kind} is not in wave ${def.from - 1}`);
  assert.equal(kindsBy(CAPTAIN_EVERY).has('captain'), true);
  assert.equal(kindsBy(CAPTAIN_EVERY + 1).has('captain'), false);
});

test('the board never holds more than its limit, and nothing leaves it', () => {
  let r = startRun({ ...newMeta(), wave: 30, weapons: [{ id: 'sabre', tier: 1 }] }, 5);
  r = { ...r, weapons: [], hero: { ...r.hero, hp: 1e9 }, stats: { ...r.stats, maxHp: 1e9 } };
  let most = 0;
  for (let i = 0; i < 3000 && r.phase === 'wave'; i++) {
    r = step(r, [Math.cos(i / 90), Math.sin(i / 70)]);
    most = Math.max(most, r.foes.length);
    if (i % 200 === 0) for (const f of r.foes) assert.ok(f.x >= 0 && f.y >= 0 && f.x <= AW && f.y <= AH, `${f.kind} at ${f.x}, ${f.y}`);
  }
  assert.equal(most, BOARD_MAX);
});

test('settling: a fall keeps half and steps back; going home keeps all and moves on; weapons, kit, level and tin are kept either way', () => {
  const meta = { ...newMeta(), wave: 6, best: 5, felled: 100 };
  let fell = startRun(meta, 3);
  fell = steps({ ...fell, spawnT: 1e9, take: 501, tin: 7, hero: { ...fell.hero, hp: 1 }, foes: [foe(900, 'foot', fell.hero.x, fell.hero.y, 1e6)] }, 3);
  assert.equal(fell.phase, 'over');
  let s = settle(meta, fell);
  assert.deepEqual([s.banked, s.score], [false, 250]);
  assert.deepEqual([s.meta.wave, s.meta.lit, s.meta.best, s.meta.tin], [6 - FALL_BACK, false, 5, 7]);
  checkMeta(s.meta);

  const won = take(atReels({ reels: ['pistol', 'pistol', 'heart'], tin: 12 }), 0);
  assert.equal(canLeave(won), true);
  s = settle(newMeta(), { ...won, take: 900, felled: 30, level: 2, xp: 3 });
  assert.deepEqual([s.banked, s.score, s.meta.wave, s.meta.best, s.meta.felled, s.meta.level, s.meta.xp, s.meta.tin], [true, 900, 2, 1, 30, 2, 3, 12]);
  assert.deepEqual(s.meta.weapons, [{ id: 'sabre', tier: 1 }, { id: 'pistol', tier: 2 }]);
  checkMeta(s.meta);
  assert.deepEqual(startRun(s.meta, 1).weapons.map((w) => w.id), ['sabre', 'pistol']);
  assert.throws(() => settle(newMeta(), startRun(newMeta(), 1)), /cannot be left in phase "wave"/);
  assert.equal(canLeave(atReels({ cleared: 0 })), false);
});

test('checkMeta refuses what this file could not have written', () => {
  const ok = newMeta();
  checkMeta(ok);
  assert.throws(() => checkMeta(null), /not an object/);
  assert.throws(() => checkMeta({ ...ok, lit: 1 }), /lit must be/);
  assert.throws(() => checkMeta({ ...ok, wave: 0 }), /wave must be/);
  assert.throws(() => checkMeta({ ...ok, weapons: [{ id: 'halberd', tier: 1 }] }), /unknown weapon "halberd"/);
  assert.throws(() => checkMeta({ ...ok, weapons: [{ id: 'sabre', tier: 9 }] }), /sabre cannot be tier 9/);
  assert.throws(() => checkMeta({ ...ok, weapons: [] }), /one to 6 weapons/);
  assert.throws(() => checkMeta({ ...ok, weapons: { sabre: 1 }, perks: {} }), /one to 6 weapons/, 'the turn-based board\'s loadout');
  assert.throws(() => checkMeta({ ...ok, stats: { ...ok.stats, greed: 1 } }), /unknown stat "greed"/);
  assert.throws(() => checkMeta({ ...ok, stats: { ...ok.stats, dmg: NaN } }), /stat dmg must be a number/);
});

test('twenty careers of six visits: the first wave is survivable, later ones are not a walk, and the board fills', () => {
  let firstCleared = 0, falls = 0, visits = 0, most = 0, felled = 0, best = 0;
  for (let seedN = 1; seedN <= 20; seedN++) {
    let meta = newMeta();
    for (let visit = 0; visit < 6; visit++) {
      const end = play(startRun(meta, seedN * 100 + visit), (r) => { most = Math.max(most, r.foes.length); return r.phase === 'shop' && r.cleared >= 3 && r.slot.spinT <= 0 && suggest(r) && suggest(r).next; });
      if (visit === 0 && end.cleared > 0) firstCleared++;
      if (end.phase === 'over') falls++;
      visits++; felled += end.felled;
      meta = settle(meta, end).meta;
      best = Math.max(best, meta.best);
    }
  }
  assert.ok(firstCleared >= 16, `the first visit survived wave 1 in ${firstCleared} of 20 careers`);
  assert.ok(falls >= 3 && falls < visits * 0.6, `${falls} falls in ${visits} visits: it should be losable and not a wall`);
  assert.ok(most >= 60, `${most} figures on the board at the most`);
  assert.ok(felled / visits > 150, `${Math.round(felled / visits)} felled a visit: a mowing`);
  assert.ok(best >= 8, `the best career reached wave ${best}`);
});

// ───────────────────────── in and out of the table ─────────────────────────

const IDLE = { left: false, right: false, plunge: false, nudge: null };
const tick = (g, move) => update(content, g, { type: 'tick', dt: STEP, input: move ? { ...IDLE, move } : IDLE });
const FRESH_REELS = { cells: [{ sym: null, spin: 0 }, { sym: null, spin: 0 }, { sym: null, spin: 0 }], source: null, armed: false, charge: 0 };
/** In play on chapter 1's table with a live ball dropped straight into the saucer. */
function atSaucer(fray) {
  const save = { v: SAVE_VERSION, chapter: 0, scene: 1, econ: { ...init(1).econ, writs: 0 }, seed: 3, ending: null, fray, reels: FRESH_REELS };
  const g = update(content, init(3), { type: 'load', save }).game;
  const table = content.tables[content.chapters[0].tableId], s = table.saucers[0];
  const ball = { id: 1, pos: [s.pos[0], s.pos[1] - s.r - 10], vel: [0, 120], state: 'live', inside: [] };
  return { ...g, phys: { ...g.phys, balls: [ball], nextBallId: 2 }, paid: [1], briefed: true, barkCool: 1e9, spunThisChapter: true };
}
function until(g0, pred, max = 4000, move = null) {
  let g = g0; const effects = [];
  for (let i = 0; i < max; i++) { if (pred(g)) return { game: g, effects }; const r = tick(g, move); g = r.game; effects.push(...r.effects); }
  throw new Error(`fray.test: predicate still false after ${max} ticks (mode ${g.mode})`);
}

test('the table sets the board with FRAY_NEED hits and says so; an unset board leaves the saucer a saucer', () => {
  let g = atSaucer({ ...newMeta(), charge: FRAY_NEED - 1 });
  let r = until(g, (x) => x.phys.balls.some((b) => b.state === 'held'));
  assert.equal(r.game.mode, 'play', 'not set: the saucer holds the ball and nothing else happens');
  assert.equal(r.game.run, null);
  assert.equal(r.game.fray.charge, FRAY_NEED - 1, 'a saucer is not a bumper');
  const table = content.tables[content.chapters[0].tableId], b = table.bumpers[0];
  g = { ...g, phys: { ...g.phys, balls: [{ id: 1, pos: [b.pos[0], b.pos[1] - b.r - 10], vel: [0, 200], state: 'live', inside: [] }] } };
  r = until(g, (x) => x.fray.lit);
  assert.equal(r.game.fray.charge, FRAY_NEED);
  assert.ok(r.game.toasts.some((t) => /Lanewar board is set/.test(t.text)));
});

test('a ball in the saucer with the board set opens Lanewar; the ball waits; the board runs on the table\'s clock and the stick', () => {
  const g = atSaucer({ ...newMeta(), lit: true });
  const rngBefore = g.rng;
  const r = until(g, (x) => x.mode === 'fray');
  let f = r.game;
  assert.deepEqual([f.run.phase, f.run.wave, f.fray.lit, f.fray.charge], ['wave', 1, false, 0]);
  assert.deepEqual(f.phys.balls.map((b) => b.state), ['held']);
  assert.deepEqual(f.rng, rngBefore, 'the board has its own rng: the table\'s is not drawn from');
  assert.ok(r.effects.some((e) => e.type === 'sfx' && e.name === 'card'));
  const held = f.phys.balls[0], x0 = f.run.hero.x;
  for (let i = 0; i < 120; i++) f = tick(f, [1, 0]).game;
  assert.deepEqual(f.phys.balls[0], held, 'a second on the board: the ball has not moved');
  assert.equal(f.run.n, 60, 'the board steps on every second tick');
  assert.ok(Math.abs(f.run.hero.x - x0 - 4.0) < 1e-6, 'and the stick moved the hero');
  assert.equal(tick(f).game.run.hero.x, tick(tick(f).game).game.run.hero.x, 'no stick, no move');
  // Enter does nothing in a wave; the reels cannot be worked in one; a message that says nothing is refused
  assert.equal(update(content, f, { type: 'confirm' }).game, f);
  for (const m of [{ pull: true }, { take: 0 }, { hold: 0 }, { next: true }, { leave: true }]) assert.equal(update(content, f, { type: 'fray', ...m }).game, f);
  assert.throws(() => update(content, f, { type: 'fray', act: 'n' }), /needs pull, hold, take, next or leave/);
});

test('going home pays score only, lights a ball save, and the ball comes out of the saucer; a fall pays half and no save', () => {
  let f = until(atSaucer({ ...newMeta(), lit: true }), (x) => x.mode === 'fray').game;
  const before = f.econ;
  // the tests' player on the stick until the reels come up
  let stick = STILL;
  for (let i = 0; i < 20000 && f.run.phase === 'wave'; i++) { if (f.run.n % 12 === 0) stick = suggest(f.run); f = tick(f, stick).game; }
  assert.equal(f.run.phase, 'shop', 'the tests\' player lives through wave 1 from the saucer on seed 3');
  // a pull, wait for the reels, take one
  let r = update(content, f, { type: 'fray', pull: true });
  assert.deepEqual(r.effects.map((e) => e.name), ['reelStart']);
  f = until(r.game, (x) => x.run.slot.spinT <= 0, 400).game;
  r = update(content, f, { type: 'fray', take: [0, 1, 2].find((i) => canTake(f.run, i)) });
  assert.equal(fxOf(r.game.run, 'took').length, 1);
  f = r.game;
  const take_ = f.run.take;
  r = update(content, f, { type: 'fray', leave: true });
  assert.deepEqual([r.game.mode, r.game.run], ['play', null]);
  assert.equal(r.game.econ.score, before.score + take_);
  assert.deepEqual({ ...r.game.econ, score: 0 }, { ...before, score: 0 }, 'marks, writs, debt and trust are exactly as they were');
  assert.equal(r.game.boons.ballSave, FRAY_SAVE_SECONDS);
  assert.deepEqual([r.game.fray.wave, r.game.fray.lit, r.game.fray.best], [2, false, 1]);
  assert.deepEqual(toSave(r.game).fray, r.game.fray, 'and the board is in the save');
  const out = until(r.game, (x) => x.phys.balls.some((b) => b.state === 'live'), 600);
  assert.ok(out.effects.some((e) => e.type === 'sfx' && e.name === 'eject'));

  // a fall: Enter leaves the fallen board
  f = until(atSaucer({ ...newMeta(), lit: true, wave: 12 }), (x) => x.mode === 'fray').game;
  f = { ...f, run: { ...f.run, hero: { ...f.run.hero, hp: 1 }, take: 300 } };
  f = until(f, (x) => x.run.phase === 'over', 20000).game;
  r = update(content, f, { type: 'confirm' });
  assert.equal(r.game.mode, 'play');
  assert.equal(r.game.econ.score, f.econ.score + Math.floor(f.run.take / 2));
  assert.equal(r.game.boons.ballSave, f.boons.ballSave, 'no save for a fall');
  assert.equal(r.game.fray.wave, 10);
});

test('a save carries the board; saves from before it, or from the turn-based one, load with a new board; a bad one is refused', () => {
  const fray = { ...newMeta(), lit: true, wave: 7, weapons: [{ id: 'sabre', tier: 3 }, { id: 'mortar', tier: 2 }], stats: { ...newMeta().stats, maxHp: 19, dmg: 12 }, level: 6, xp: 4, tin: 31, best: 6, felled: 412 };
  const save = { v: SAVE_VERSION, chapter: 0, scene: 1, econ: init(1).econ, seed: 3, ending: null, fray, reels: { ...FRESH_REELS, armed: true, charge: 45 } };
  const g = update(content, init(9), { type: 'load', save: JSON.parse(JSON.stringify(save)) }).game;
  assert.deepEqual(g.fray, fray);
  assert.deepEqual(toSave(g).fray, fray);
  const { fray: _, ...old } = save;
  assert.deepEqual(update(content, init(9), { type: 'load', save: { ...old, v: 4 } }).game.fray, newMeta());
  const turnBased = { lit: true, charge: 0, wave: 9, weapons: { sabre: 3 }, perks: { plate: 1 }, best: 8, felled: 200, owed: true };
  assert.deepEqual(update(content, init(9), { type: 'load', save: { ...old, v: 5, fray: turnBased } }).game.fray, newMeta());
  assert.throws(() => update(content, init(9), { type: 'load', save: { ...save, fray: turnBased } }), /bad meta/);
  assert.throws(() => update(content, init(9), { type: 'load', save: { ...save, fray: { ...fray, weapons: [{ id: 'halberd', tier: 2 }] } } }), /unknown weapon "halberd"/);
});
