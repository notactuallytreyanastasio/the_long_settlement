// Lanewar: the board game inside the game (src/core/fray.js), and its way in and out of the table (game.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  W, H, BOARD_MAX, ACTS, WEAPONS, WEAPON_IDS, PERKS, FOES, CAPTAIN_EVERY, FALL_BACK,
  newMeta, checkMeta, startRun, act, choose, settle, canLeave, suggest, swingCells, describe, waveSize, toughness, harder,
} from '../src/core/fray.js';
import { init, update, toSave, FRAY_NEED, FRAY_SAVE_SECONDS } from '../src/core/game.js';
import { STEP } from '../src/core/physics.js';
import { content } from '../src/content/index.js';

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); }
  return o;
}
/** Play with fray.suggest until `stop(run)` or the hero falls. */
function playRun(run, stop, max = 4000) {
  let r = run;
  for (let i = 0; i < max; i++) {
    if (r.phase === 'over' || stop(r)) return r;
    r = r.phase === 'draft' ? choose(r, suggest(r)) : act(r, suggest(r));
  }
  throw new Error(`fray.test: still playing after ${max} steps (wave ${r.wave}, ${r.foes.length} on the board, ${r.queue.length} to come)`);
}
const kills = (run) => run.events.filter((e) => e.type === 'kill');

test('a run starts with the hero in the middle, facing north, and wave 1 already on the board', () => {
  const run = startRun(newMeta(), 1);
  assert.deepEqual([run.phase, run.wave, run.turn, run.n], ['turn', 1, 0, 0]);
  assert.deepEqual([run.hero.x, run.hero.y, run.hero.face], [4, 6, [0, -1]]);
  assert.equal(run.hero.hp, run.hero.maxHp);
  assert.ok(run.foes.length > 0, 'the board does not open empty');
  assert.equal(run.foes.length + run.queue.length, waveSize(1));
  for (const f of run.foes) {
    assert.ok(f.x === 0 || f.y === 0 || f.x === W - 1 || f.y === H - 1, 'figures come on at the edge');
    assert.ok(Math.abs(f.x - run.hero.x) + Math.abs(f.y - run.hero.y) >= 3, 'and not on top of the hero');
  }
  assert.deepEqual(run.events.filter((e) => e.type === 'wave'), [{ type: 'wave', wave: 1 }]);
});

test('a turn is pure and repeatable: frozen input, the same seed gives the same game', () => {
  const a = deepFreeze(startRun(newMeta(), 42));
  const b = startRun(newMeta(), 42);
  assert.deepEqual(a, b);
  let x = a, y = b;
  for (let i = 0; i < 40 && x.phase === 'turn'; i++) {
    const move = ACTS[i % ACTS.length];
    x = deepFreeze(act(x, move));
    y = act(y, move);
    assert.deepEqual(x, y);
  }
  assert.notDeepEqual(startRun(newMeta(), 43).foes, a.foes, 'and another seed another');
  assert.throws(() => act(a, 'up'), /unknown action "up"/);
});

test('moving turns the hero and steps; a figure in the way is not walked through; the sabre cuts what is in front', () => {
  const base = startRun(newMeta(), 1);
  const lone = (foes) => ({ ...base, foes, queue: ['foot', 'foot', 'foot', 'foot', 'foot', 'foot'] });
  let r = act(lone([]), 'e');
  assert.deepEqual([r.hero.x, r.hero.y, r.hero.face], [5, 6, [1, 0]]);
  assert.deepEqual(r.events[0], { type: 'move', from: [4, 6], to: [5, 6] });

  // a figure directly east: the step is refused, the hero faces it, and the sabre fells it
  r = act(lone([{ id: 900, kind: 'foot', x: 5, y: 6, hp: 1, aim: false }]), 'e');
  assert.deepEqual([r.hero.x, r.hero.y, r.hero.face], [4, 6, [1, 0]]);
  assert.equal(r.events[0].type, 'bump');
  assert.deepEqual(kills(r).map((e) => [e.id, e.by]), [[900, 'sabre']]);
  assert.equal(r.felled, 1);
  assert.equal(r.take, FOES.foot.points);

  // the arc is the three squares ahead: a figure behind is not touched, and strikes
  r = act(lone([{ id: 901, kind: 'foot', x: 4, y: 7, hp: 1, aim: false }]), 'n');
  assert.deepEqual(kills(r), []);
  assert.deepEqual(swingCells(r, 'sabre').sort(), [[3, 4], [4, 4], [5, 4]]);
  assert.equal(r.hero.hp, base.hero.maxHp, 'it followed the hero north and has used its move doing so');
  r = act(r, 'wait');
  assert.equal(r.hero.hp, base.hero.maxHp - FOES.foot.dmg, 'beside the hero at the start of its move, it strikes');
  assert.deepEqual(r.events.filter((e) => e.type === 'hurt').map((e) => [e.by, e.dmg]), [[901, 1]]);
});

test('every weapon at every level strikes inside the board, and a higher level never strikes fewer squares', () => {
  const base = startRun(newMeta(), 3);
  const crowd = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((x !== 4 || y !== 6) && (x + y) % 2 === 0) crowd.push({ id: 1000 + crowd.length, kind: 'grenadier', x, y, hp: 99, aim: false });
  for (const id of WEAPON_IDS) {
    let last = 0;
    WEAPONS[id].levels.forEach((lv, i) => {
      assert.ok(lv.every >= 1 && lv.dmg >= 1, `${id} level ${i + 1}`);
      if (id === 'oil') return;
      const cells = swingCells({ ...base, foes: crowd, weapons: { sabre: 1, [id]: i + 1 } }, id);
      for (const [x, y] of cells) assert.ok(x >= 0 && y >= 0 && x < W && y < H && (x !== 4 || y !== 6), `${id} ${i + 1} strikes [${x}, ${y}]`);
      assert.equal(new Set(cells.map(([x, y]) => `${x},${y}`)).size, cells.length, `${id} ${i + 1} names a square once`);
      assert.ok(cells.length >= last, `${id} level ${i + 1} reaches ${cells.length} squares, level ${i} reached ${last}`);
      last = cells.length;
    });
  }
  assert.throws(() => swingCells(base, 'mortar'), /carries no "mortar"/);
});

test('lamp oil lights the square the hero leaves, and burns whoever stands in it', () => {
  const base = { ...startRun({ ...newMeta(), weapons: { sabre: 1, oil: 1 } }, 1), foes: [], queue: ['foot', 'foot', 'foot', 'foot', 'foot', 'foot'] };
  let r = act(base, 'n');
  assert.deepEqual(r.fires.map((f) => [f.x, f.y]), [[4, 6]]);
  // a figure that steps onto it burns
  r = act({ ...r, foes: [{ id: 950, kind: 'foot', x: 4, y: 7, hp: 1, aim: false }] }, 'n');
  assert.deepEqual(kills(r).map((e) => [e.id, e.by]), [[950, 'oil']]);
  r = playRunTurns(r, 12);
  assert.ok(r.fires.every((f) => f.left > 0 && f.left <= WEAPONS.oil.levels[0].burn));
});
function playRunTurns(run, n) { let r = run; for (let i = 0; i < n && r.phase === 'turn'; i++) r = act(r, 'wait'); return r; }

test('a musket levels on one turn and fires on the next; stepping out of line spoils the shot', () => {
  const base = startRun(newMeta(), 1);
  const gun = { id: 960, kind: 'musket', x: 4, y: 2, hp: 2, aim: false };
  const one = { ...base, foes: [gun], queue: ['foot', 'foot', 'foot', 'foot', 'foot', 'foot', 'foot', 'foot', 'foot'] };
  let r = act(one, 'wait');
  assert.deepEqual(r.events.filter((e) => e.type === 'aim'), [{ type: 'aim', id: 960 }]);
  assert.equal(r.hero.hp, base.hero.maxHp);
  const hit = act(r, 'wait');
  assert.deepEqual(hit.events.filter((e) => e.type === 'shot'), [{ type: 'shot', id: 960 }]);
  assert.equal(hit.hero.hp, base.hero.maxHp - FOES.musket.dmg);
  const dodged = act(r, 'e');
  assert.deepEqual(dodged.events.filter((e) => e.type === 'shot'), []);
  assert.equal(dodged.foes.find((f) => f.id === 960).aim, false);
});

test('a wave ends in a draft of three different offers; taking one applies it and begins the next wave', () => {
  const cleared = playRun(startRun(newMeta(), 7), (r) => r.phase === 'draft');
  assert.equal(cleared.phase, 'draft', 'the tests\' player clears wave 1 on seed 7');
  assert.deepEqual([cleared.wave, cleared.cleared, cleared.foes.length, cleared.queue.length], [1, 1, 0, 0]);
  assert.equal(cleared.felled, waveSize(1));
  assert.equal(cleared.offers.length, 3);
  assert.equal(new Set(cleared.offers.map((o) => o.id)).size, 3);
  for (const o of cleared.offers) {
    const d = describe(o);
    assert.ok(d.name && d.text && d.level >= 1, JSON.stringify(o));
  }
  assert.throws(() => act(cleared, 'n'), /no turn to take in phase "draft"/);
  assert.throws(() => choose(cleared, 3), /no offer 3/);
  cleared.offers.forEach((o, i) => {
    const next = choose(cleared, i);
    assert.deepEqual([next.phase, next.wave, next.n], ['turn', 2, cleared.n + 1]);
    assert.equal(next.foes.length + next.queue.length, waveSize(2));
    if (o.kind === 'weapon') assert.equal(next.weapons[o.id], o.level);
    else if (o.id === 'plate') assert.equal(next.hero.maxHp, cleared.hero.maxHp + 3);
    else if (o.id === 'dressing') assert.equal(next.hero.hp, next.hero.maxHp);
    else assert.equal(next.perks[o.id], o.level);
    assert.deepEqual(next.events[0], { type: 'took', what: o });
  });
});

test('the offers run out only when everything is at its last level, and then there is still the dressing', () => {
  const weapons = Object.fromEntries(WEAPON_IDS.map((id) => [id, WEAPONS[id].levels.length]));
  const perks = Object.fromEntries(Object.keys(PERKS).filter((id) => id !== 'dressing').map((id) => [id, PERKS[id].max]));
  const full = startRun({ ...newMeta(), weapons, perks }, 2);
  const r = playRun(full, (x) => x.phase === 'draft');
  assert.equal(r.phase, 'draft');
  assert.deepEqual(r.offers, [{ kind: 'perk', id: 'dressing', level: 1 }]);
});

test('the waves grow, bring new figures on schedule, a captain every fifth, and never crowd the board past its limit', () => {
  assert.ok(waveSize(2) > waveSize(1));
  assert.ok(toughness(20) > toughness(10) && harder(20) > harder(5));
  const kindsIn = (wave) => { const r = startRun({ ...newMeta(), wave }, 11); return new Set([...r.queue, ...r.foes.map((f) => f.kind)]); };
  assert.deepEqual([...kindsIn(1)], ['foot']);
  for (const [kind, def] of Object.entries(FOES)) {
    if (kind === 'captain') continue;
    assert.equal(kindsIn(def.from - 1 || 1).has(kind), def.from === 1, `${kind} is not in wave ${def.from - 1}`);
  }
  assert.equal(kindsIn(CAPTAIN_EVERY).has('captain'), true);
  assert.equal(kindsIn(CAPTAIN_EVERY + 1).has('captain'), false);
  // a late wave, hero standing still with nothing but plate: the feed stops at the limit
  let r = startRun({ ...newMeta(), wave: 30 }, 5);
  r = { ...r, hero: { ...r.hero, hp: 1e6, maxHp: 1e6 } };
  let most = 0;
  for (let i = 0; i < 60 && r.phase === 'turn'; i++) { r = act(r, 'wait'); most = Math.max(most, r.foes.length); }
  assert.equal(most, BOARD_MAX);
  const seen = new Set();
  for (const f of r.foes) { const k = `${f.x},${f.y}`; assert.ok(!seen.has(k) && (f.x !== r.hero.x || f.y !== r.hero.y), `two things on ${k}`); seen.add(k); }
});

test('the hero falls at no hearts, and the run can then only be settled', () => {
  let r = startRun({ ...newMeta(), wave: 12 }, 9);
  r = { ...r, hero: { ...r.hero, hp: 1 } };
  for (let i = 0; i < 200 && r.phase === 'turn'; i++) r = act(r, 'wait');
  assert.deepEqual([r.phase, r.hero.hp], ['over', 0]);
  assert.equal(r.events[r.events.length - 1].type, 'fallen');
  assert.throws(() => act(r, 'n'), /phase "over"/);
  assert.throws(() => suggest(r), /nothing to suggest/);
});

test('settling: a fall keeps half and steps back; going home keeps all, moves on, and leaves the pick owed', () => {
  const meta = { ...newMeta(), wave: 6, best: 5, felled: 100 };
  let fell = startRun(meta, 3);
  fell = { ...fell, hero: { ...fell.hero, hp: 1 }, take: 501, felled: 7 };
  for (let i = 0; i < 300 && fell.phase === 'turn'; i++) fell = act(fell, 'wait');
  assert.equal(fell.phase, 'over');
  let s = settle(meta, fell);
  assert.deepEqual([s.banked, s.score], [false, Math.floor(fell.take / 2)]);
  assert.deepEqual([s.meta.wave, s.meta.owed, s.meta.lit, s.meta.best, s.meta.felled], [6 - FALL_BACK, false, false, 5, 100 + fell.felled]);
  assert.deepEqual(s.meta.weapons, fell.weapons, 'the loadout is kept');

  const won = playRun(startRun(newMeta(), 7), (r) => r.phase === 'draft');
  assert.equal(canLeave(won), true);
  s = settle(newMeta(), won);
  assert.deepEqual([s.banked, s.score, s.meta.wave, s.meta.owed, s.meta.best], [true, won.take, 2, true, 1]);
  checkMeta(s.meta);
  // the next run opens on that pick, cannot be left before a wave is cleared, and then plays wave 2
  const next = startRun(s.meta, 8);
  assert.deepEqual([next.phase, next.wave, next.offers.length, canLeave(next)], ['draft', 1, 3, false]);
  assert.throws(() => settle(s.meta, next), /cannot be left/);
  assert.deepEqual([choose(next, 0).phase, choose(next, 0).wave], ['turn', 2]);
  assert.throws(() => settle(newMeta(), startRun(newMeta(), 1)), /cannot be left in phase "turn"/);
});

test('checkMeta refuses what this file could not have written', () => {
  const ok = newMeta();
  checkMeta(ok);
  assert.throws(() => checkMeta(null), /not an object/);
  assert.throws(() => checkMeta({ ...ok, lit: 1 }), /lit must be/);
  assert.throws(() => checkMeta({ ...ok, wave: 0 }), /wave must be/);
  assert.throws(() => checkMeta({ ...ok, weapons: { sabre: 1, halberd: 1 } }), /unknown weapon "halberd"/);
  assert.throws(() => checkMeta({ ...ok, weapons: { sabre: 9 } }), /sabre cannot be level 9/);
  assert.throws(() => checkMeta({ ...ok, weapons: { pike: 1 } }), /always a sabre/);
  assert.throws(() => checkMeta({ ...ok, perks: { dressing: 1 } }), /unknown perk "dressing"/);
  assert.throws(() => checkMeta({ ...ok, owed: true }), /cannot be owed/);
});

test('sixty careers of twelve visits: nothing stalls, the first visit clears a wave more often than not, and the board fills', () => {
  let firstCleared = 0, falls = 0, visits = 0, most = 0, felled = 0;
  for (let seedN = 1; seedN <= 60; seedN++) {
    let meta = newMeta();
    for (let visit = 0; visit < 12; visit++) {
      let run = startRun(meta, seedN * 1000 + visit);
      let steps = 0;
      while (run.phase !== 'over' && !(run.phase === 'draft' && run.cleared >= 3)) {
        if (++steps > 3000) throw new Error(`fray.test: seed ${seedN} visit ${visit} stalled at wave ${run.wave}: ${JSON.stringify(run.foes.slice(0, 4))}`);
        run = run.phase === 'draft' ? choose(run, suggest(run)) : act(run, suggest(run));
        most = Math.max(most, run.foes.length);
      }
      if (visit === 0 && run.cleared > 0) firstCleared++;
      if (run.phase === 'over') falls++;
      visits++; felled += run.felled;
      meta = settle(meta, run).meta;
    }
  }
  assert.ok(firstCleared >= 45, `the first visit cleared a wave in ${firstCleared} of 60 careers`);
  assert.ok(falls > visits * 0.05 && falls < visits * 0.5, `${falls} falls in ${visits} visits: it should be losable and not a wall`);
  assert.equal(most, BOARD_MAX, 'late waves fill the board');
  assert.ok(felled / visits > 100, `${Math.round(felled / visits)} felled a visit: a mowing`);
});

// ───────────────────────── in and out of the table ─────────────────────────

const IDLE = { left: false, right: false, plunge: false, nudge: null };
const tick = (g) => update(content, g, { type: 'tick', dt: STEP, input: IDLE });
/** In play on chapter 1's table with a live ball dropped straight into the saucer. */
function atSaucer(fray) {
  const save = { v: 5, chapter: 0, scene: 1, econ: { ...init(1).econ, writs: 0 }, seed: 3, ending: null, fray,
    reels: { cells: [{ sym: null, spin: 0 }, { sym: null, spin: 0 }, { sym: null, spin: 0 }], source: null, armed: false, charge: 0 } };
  const g = update(content, init(3), { type: 'load', save }).game;
  const table = content.tables[content.chapters[0].tableId], s = table.saucers[0];
  const ball = { id: 1, pos: [s.pos[0], s.pos[1] - s.r - 10], vel: [0, 120], state: 'live', inside: [] };
  return { ...g, phys: { ...g.phys, balls: [ball], nextBallId: 2 }, paid: [1], briefed: true, barkCool: 1e9, spunThisChapter: true };
}
function until(g0, pred, max = 4000) {
  let g = g0; const effects = [];
  for (let i = 0; i < max; i++) { if (pred(g)) return { game: g, effects }; const r = tick(g); g = r.game; effects.push(...r.effects); }
  throw new Error(`fray.test: predicate still false after ${max} ticks (mode ${g.mode})`);
}

test('the table sets the board with FRAY_NEED hits and says so; an unset board leaves the saucer a saucer', () => {
  let g = atSaucer({ ...newMeta(), charge: FRAY_NEED - 1 });
  let r = until(g, (x) => x.phys.balls.some((b) => b.state === 'held'));
  assert.equal(r.game.mode, 'play', 'not set: the saucer holds the ball and nothing else happens');
  assert.equal(r.game.run, null);
  assert.equal(r.game.fray.charge, FRAY_NEED - 1, 'a saucer is not a bumper');
  // one more bumper, sling or target sets it
  const table = content.tables[content.chapters[0].tableId], b = table.bumpers[0];
  g = { ...g, phys: { ...g.phys, balls: [{ id: 1, pos: [b.pos[0], b.pos[1] - b.r - 10], vel: [0, 200], state: 'live', inside: [] }] } };
  r = until(g, (x) => x.fray.lit);
  assert.equal(r.game.fray.charge, FRAY_NEED);
  assert.ok(r.game.toasts.some((t) => /Lanewar board is set/.test(t.text)));
});

test('a ball in the saucer with the board set opens Lanewar; the ball waits; the table does not move while it is played', () => {
  const g = atSaucer({ ...newMeta(), lit: true });
  const rngBefore = g.rng;
  let r = until(g, (x) => x.mode === 'fray');
  let f = r.game;
  assert.deepEqual([f.run.phase, f.run.wave, f.fray.lit, f.fray.charge], ['turn', 1, false, 0]);
  assert.deepEqual(f.phys.balls.map((b) => b.state), ['held']);
  assert.deepEqual(f.rng, rngBefore, 'the board has its own rng: the table\'s is not drawn from');
  assert.ok(r.effects.some((e) => e.type === 'sfx' && e.name === 'card'));
  // time passes on the board and the ball stays where it is
  const held = f.phys.balls[0];
  for (let i = 0; i < 600; i++) f = tick(f).game;
  assert.deepEqual(f.phys.balls[0], held);
  assert.equal(f.mode, 'fray');
  // turns are messages; Enter does nothing in a turn; an unknown act is refused by name
  const moved = update(content, f, { type: 'fray', act: 'n' });
  assert.equal(moved.game.run.n, 1);
  assert.equal(update(content, f, { type: 'confirm' }).game, f);
  assert.equal(update(content, f, { type: 'fray', leave: true }).game, f, 'no going home mid-wave');
  assert.equal(update(content, f, { type: 'fray', pick: 0 }).game, f, 'no card to take mid-wave');
  assert.throws(() => update(content, f, { type: 'fray', act: 'north' }), /needs act, pick or leave/);
});

test('going home pays score only, lights a ball save, and the ball comes out of the saucer; a fall pays half and no save', () => {
  let f = until(atSaucer({ ...newMeta(), lit: true }), (x) => x.mode === 'fray').game;
  const before = f.econ;
  for (let i = 0; i < 4000 && f.run.phase === 'turn'; i++) f = update(content, f, { type: 'fray', act: suggest(f.run) }).game;
  assert.equal(f.run.phase, 'draft', 'the tests\' player clears wave 1 from the saucer on seed 3');
  const take = f.run.take;
  let r = update(content, f, { type: 'fray', leave: true });
  assert.deepEqual([r.game.mode, r.game.run], ['play', null]);
  assert.equal(r.game.econ.score, before.score + take);
  assert.deepEqual({ ...r.game.econ, score: 0 }, { ...before, score: 0 }, 'marks, writs, debt and trust are exactly as they were');
  assert.equal(r.game.boons.ballSave, FRAY_SAVE_SECONDS);
  assert.deepEqual([r.game.fray.wave, r.game.fray.owed, r.game.fray.lit, r.game.fray.best], [2, true, false, 1]);
  assert.deepEqual(toSave(r.game).fray, r.game.fray, 'and the board is in the save');
  const out = until(r.game, (x) => x.phys.balls.some((b) => b.state === 'live'), 600);
  assert.ok(out.effects.some((e) => e.type === 'sfx' && e.name === 'eject'));

  // a fall: Enter leaves the fallen board
  f = until(atSaucer({ ...newMeta(), lit: true, wave: 12 }), (x) => x.mode === 'fray').game;
  f = { ...f, run: { ...f.run, hero: { ...f.run.hero, hp: 1 }, take: 300 } };
  for (let i = 0; i < 300 && f.run.phase === 'turn'; i++) f = update(content, f, { type: 'fray', act: 'wait' }).game;
  assert.equal(f.run.phase, 'over');
  r = update(content, f, { type: 'confirm' });
  assert.equal(r.game.mode, 'play');
  assert.equal(r.game.econ.score, f.econ.score + Math.floor(f.run.take / 2));
  assert.equal(r.game.boons.ballSave, f.boons.ballSave, 'no save for a fall');
  assert.deepEqual([r.game.fray.wave, r.game.fray.owed], [10, false]);
});

test('a save carries the board; a v:4 save from before it loads with a new one; a bad one is refused', () => {
  const fray = { ...newMeta(), lit: true, wave: 7, weapons: { sabre: 3, flail: 2 }, perks: { plate: 1 }, best: 6, felled: 412, owed: true };
  const save = { v: 5, chapter: 0, scene: 1, econ: init(1).econ, seed: 3, ending: null, fray,
    reels: { cells: [{ sym: null, spin: 0 }, { sym: null, spin: 0 }, { sym: null, spin: 0 }], source: null, armed: true, charge: 45 } };
  const g = update(content, init(9), { type: 'load', save: JSON.parse(JSON.stringify(save)) }).game;
  assert.deepEqual(g.fray, fray);
  assert.deepEqual(toSave(g).fray, fray);
  const { fray: _, ...old } = save;
  assert.deepEqual(update(content, init(9), { type: 'load', save: { ...old, v: 4 } }).game.fray, newMeta());
  assert.throws(() => update(content, init(9), { type: 'load', save: { ...save, fray: { ...fray, weapons: { sabre: 1, halberd: 2 } } } }), /unknown weapon "halberd"/);
});
