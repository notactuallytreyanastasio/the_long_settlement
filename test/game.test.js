import { test } from 'node:test';
import assert from 'node:assert/strict';
import { init, update, toSave, REEL_STOPS } from '../src/core/game.js';
import { lineSeconds, litIds } from '../src/core/story.js';
import { STEP } from '../src/core/physics.js';
import { spin } from '../src/core/slot.js';
import {
  SPIN_COST, LOAN, initEcon, paySpin, applyPayout, takeLoan,
} from '../src/core/economy.js';
import { seed } from '../src/core/rng.js';

// ───────────────────────── fixture content ─────────────────────────
// A box: one open-bottomed column. The plunger fires straight up through three
// rollovers (r1, r2, r3 in that order), the ball comes back down through them
// (r3, r2, r1) and drains. Flippers exist, as the contract requires, but sit
// outside the column.

const table = {
  id: 'box', name: 'Box', width: 400, height: 800, gravity: 1000, ballRadius: 8,
  walls: [
    { a: [150, 20], b: [250, 20] },
    { a: [150, 20], b: [150, 800] },
    { a: [250, 20], b: [250, 800] },
  ],
  oneWays: [],
  flippers: [
    { id: 'fl', side: 'left', pivot: [40, 760], length: 40, radius: 5, restAngle: 0.4, activeAngle: -0.5 },
    { id: 'fr', side: 'right', pivot: [360, 760], length: 40, radius: 5, restAngle: Math.PI - 0.4, activeAngle: Math.PI + 0.5 },
  ],
  bumpers: [], slings: [], targets: [],
  rollovers: [
    { id: 'r1', pos: [200, 640], r: 10 },
    { id: 'r2', pos: [200, 600], r: 10 },
    { id: 'r3', pos: [200, 560], r: 10 },
  ],
  shots: [], saucers: [],
  plunger: { pos: [200, 700], maxSpeed: 1500 },
  drainY: 780,
  theme: { bg: ['#000', '#111'], accent: '#fff', glow: '#fff', motif: 'none' },
  decor: [], labels: {},
};

const L = (id, who, text, extra = {}) => ({ id, who, text, ...extra });
const barks = (ch) => ({
  launch: [L(`${ch}.bark.launch.1`, 'ren', 'Plumb away.')],
  drain: [L(`${ch}.bark.drain.1`, 'tobb', 'That one cost you.')],
  save: [L(`${ch}.bark.save.1`, 'thorne', 'Again.', { fx: 'radio' })],
  loan: [L(`${ch}.bark.loan.1`, 'corvane', 'The Mint is always open.')],
  aid: [L(`${ch}.bark.aid.1`, 'nan', 'This one is on us, boy.'), L(`${ch}.bark.aid.2`, 'crowd', 'Pass the hat.')],
  jackpot: [L(`${ch}.bark.jackpot.1`, 'tobb', 'Long odds, that.')],
  bust: [L(`${ch}.bark.bust.1`, 'tobb', 'The house thanks you.')],
});

const RIGGED = {
  reels: ['orb', 'orb', 'orb'],
  payout: { writs: 3, marks: 0, boon: null, name: "Three Orbs: The Bearer's Lot", blurb: 'One name comes up.' },
};

const content = {
  cast: {},
  tables: { box: table },
  chapters: [
    {
      id: 'ch1', number: 1, title: 'One', subtitle: 'first', tableId: 'box',
      prologue: [
        L('ch1.pro.01', 'narrator', 'It began with a debt.', { bg: 'ledger', music: 'festival' }),
        L('ch1.pro.02', 'thorne', 'Tonight is your exam.', { fx: 'radio', on: ['ren'] }),
        L('ch1.pro.03', 'ren', 'Understood.'),
      ],
      riggedSpin: RIGGED,
      scenes: [
        {
          id: 'ch1.s1', title: 'Lantern Watch', thread: 'commons', hint: 'Light all three lanterns',
          objective: { kind: 'all', ids: ['r1', 'r2', 'r3'] },
          briefing: [L('ch1.s1.b1', 'nan', 'Mind the lanterns.')],
          cutscene: [
            L('ch1.s1.c01', 'nan', 'Every lantern carries a name.', { bg: 'lantern-stalls', on: ['nan', 'ren'], music: 'sorrow' }),
            L('ch1.s1.c02', 'ren', 'Mine is blank.', { sfx: 'target' }),
            L('ch1.s1.c03', 'nan', 'Then we will find you one.'),
          ],
          reward: { points: 1000, trust: 30 },
        },
        {
          id: 'ch1.s2', title: 'The Listener', thread: 'covert', hint: 'Top lane, then the bottom',
          objective: { kind: 'sequence', ids: ['r3', 'r1'] },
          briefing: [L('ch1.s2.b1', 'thorne', 'Place the shell.', { fx: 'radio' }), L('ch1.s2.b2', 'ren', 'On it.')],
          cutscene: [
            L('ch1.s2.c01', 'ilse', 'You there. Carry these.', { bg: 'bench', on: ['ilse', 'ren'] }),
            L('ch1.s2.c02', 'ren', 'Yes, miss.'),
          ],
          reward: { points: 2000 },
        },
      ],
      epilogue: [
        L('ch1.epi.01', 'narrator', 'The ferry left at dawn.', { bg: 'ferry-dawn', music: 'hope' }),
        L('ch1.epi.02', 'thorne', 'The reels landed as arranged.', { fx: 'radio', bg: 'line' }),
      ],
      barks: barks('ch1'),
      music: { play: 'tense', slot: 'court' },
    },
    {
      id: 'ch2', number: 2, title: 'Two', subtitle: 'second', tableId: 'box',
      prologue: [],
      riggedSpin: null,
      scenes: [
        {
          id: 'ch2.s1', title: 'The Toll', thread: 'duty', hint: 'Four hits on the low lanes',
          objective: { kind: 'count', ids: ['r1', 'r2'], n: 4 },
          briefing: [L('ch2.s1.b1', 'hesper', 'Gate stays shut.')],
          cutscene: [L('ch2.s1.c01', 'hesper', 'Every pilgrim leaves us poorer.', { bg: 'picket' })],
          reward: { points: 500, trust: 10 },
        },
      ],
      epilogue: [L('ch2.epi.01', 'sable', 'They think you touched the reels.', { bg: 'shore-dusk', music: 'dread' })],
      barks: barks('ch2'),
      music: { play: 'mine', slot: 'march' },
    },
  ],
};

// ───────────────────────── driving helpers ─────────────────────────

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    Object.values(o).forEach(deepFreeze);
  }
  return o;
}
deepFreeze(content);

// The same world with one scene nothing on this table can finish in a test:
// for watching balls drain without a cutscene cutting in.
const grind = deepFreeze({
  ...content,
  chapters: [{
    ...content.chapters[0],
    scenes: [{ ...content.chapters[0].scenes[1], objective: { kind: 'count', ids: ['r1'], n: 999 } }],
  }],
});

const IDLE = { left: false, right: false, plunge: false, nudge: null };
const tickMsg = (plunge = false) => ({ type: 'tick', dt: STEP, input: { ...IDLE, plunge } });
const CONFIRM = { type: 'confirm' };
const SKIP = { type: 'skip' };

/** One update on a frozen game (so any mutation throws), checking the music rule on every mode change. */
function send(game, msg, c = content) {
  const r = update(c, deepFreeze(game), msg);
  if (r.game.mode !== game.mode) {
    assert.ok(
      r.effects.some((e) => e.type === 'music'),
      `mode ${game.mode} -> ${r.game.mode} on ${msg.type} emitted no music effect`,
    );
  }
  return r;
}

/** Send several messages; effects accumulate. */
function sendAll(game, msgs, c = content) {
  return msgs.reduce((acc, msg) => {
    const r = send(acc.game, msg, c);
    return { game: r.game, effects: acc.effects.concat(r.effects) };
  }, { game, effects: [] });
}

const ticks = (game, n, plunge = false, c = content) => sendAll(game, Array(n).fill(tickMsg(plunge)), c);

/** Autoplay: hold the plunger 1.25 s, let go, repeat, until pred(game) or the tick budget runs out. */
function playUntil(game, pred, c = content, max = 30000) {
  let acc = { game, effects: [] };
  for (let i = 0; i < max; i++) {
    if (pred(acc.game, acc.effects)) return { ...acc, ticks: i };
    const r = send(acc.game, tickMsg(i % 200 < 150), c);
    acc = { game: r.game, effects: acc.effects.concat(r.effects) };
  }
  throw new Error(`playUntil: predicate still false after ${max} ticks (mode ${acc.game.mode})`);
}

const sfxNames = (effects) => effects.filter((e) => e.type === 'sfx').map((e) => e.name);
const count = (effects, name) => sfxNames(effects).filter((n) => n === name).length;
const says = (effects) => effects.filter((e) => e.type === 'say').map((e) => `${e.line.id}${e.blocking ? '!' : ''}`);
const moods = (effects) => effects.filter((e) => e.type === 'music').map((e) => e.mood);
const saves = (effects) => effects.filter((e) => e.type === 'save').map((e) => e.save);
const toastKinds = (game) => game.toasts.map((t) => t.kind);

/** A game restored by 'load' into the slot, with the given econ overrides. */
function slotAt(chapter, scene, econ = {}, c = content) {
  return send(init(3), { type: 'load', save: { v: 1, chapter, scene, econ: { ...initEcon(), ...econ }, seed: 3 } }, c).game;
}
/** In play with no ball on the table yet. */
function playAt(chapter, scene, econ = {}, c = content) {
  const g = send(slotAt(chapter, scene, { writs: 1 }, c), { type: 'toTable' }, c).game;
  return { ...g, econ: { ...g.econ, writs: 0, ...econ } };
}

// ───────────────────────── the whole game, start to end ─────────────────────────

test('playthrough: title to end across two chapters', () => {
  // title
  let g = init(7);
  assert.equal(g.mode, 'title');
  assert.equal(g.phys, null);
  let r = send(g, tickMsg());
  assert.deepEqual(r.effects, [{ type: 'music', mood: 'title' }]);
  assert.deepEqual(send(r.game, tickMsg()).effects, []);

  // title -> chapter card
  r = send(r.game, CONFIRM);
  assert.equal(r.game.mode, 'card');
  assert.deepEqual(sfxNames(r.effects), ['confirm', 'card']);
  assert.deepEqual(moods(r.effects), ['silence']);
  assert.deepEqual(r.game.phys.balls, []);

  // card -> prologue cinematic
  r = send(r.game, CONFIRM);
  assert.equal(r.game.mode, 'cine');
  assert.equal(r.game.cine.kind, 'prologue');
  assert.equal(r.game.after, 'slot');
  assert.deepEqual(moods(r.effects), ['festival']);
  assert.deepEqual(says(r.effects), ['ch1.pro.01!']);
  assert.equal(r.game.cine.bg, 'ledger');

  // a stale lineDone is ignored; the right one advances and the backdrop persists
  r = send(r.game, { type: 'lineDone', id: 'ch1.pro.02' });
  assert.equal(r.game.cine.index, 0);
  assert.deepEqual(r.effects, []);
  r = send(r.game, { type: 'lineDone', id: 'ch1.pro.01' });
  assert.equal(r.game.cine.index, 1);
  assert.deepEqual(says(r.effects), ['ch1.pro.02!']);
  assert.deepEqual([r.game.cine.bg, r.game.cine.on], ['ledger', ['ren']]);
  assert.ok(!r.effects.some((e) => e.type === 'hush'), 'a finished line needs no hush');

  // confirm also advances (cutting the voice off), and past the last line the reels are handed over
  r = send(r.game, CONFIRM);
  assert.deepEqual(says(r.effects), ['ch1.pro.03!']);
  assert.equal(r.effects[0].type, 'hush');
  r = send(r.game, CONFIRM);
  assert.equal(r.game.mode, 'slot');
  assert.equal(r.game.cine, null);
  assert.deepEqual(moods(r.effects), ['court']);
  assert.deepEqual(saves(r.effects), [{ v: 1, chapter: 0, scene: 0, econ: initEcon(), seed: seed(7).s }]);

  // slot: no writ, no table
  r = send(r.game, { type: 'toTable' });
  assert.equal(r.game.mode, 'slot');
  assert.deepEqual(toastKinds(r.game), ['hint']);

  // the first spin is the chapter's rigged one, and it is free
  const before = r.game.econ;
  r = send(r.game, CONFIRM);
  assert.equal(r.game.slot.phase, 'spinning');
  assert.equal(r.game.slot.result, RIGGED);
  assert.deepEqual(r.game.slot.stopAt, [0.9, 1.5, 2.1]);
  assert.deepEqual(r.game.econ, { ...before, spins: 1 });
  assert.equal(r.game.spunThisChapter, true);
  assert.deepEqual(sfxNames(r.effects), ['reelStart']);
  assert.deepEqual(r.game.rng, seed(7), 'a rigged spin draws nothing from the rng');
  assert.equal(send(r.game, CONFIRM).game, r.game, 'confirm while spinning does nothing');
  assert.equal(send(r.game, { type: 'toTable' }).game, r.game, 'cannot leave mid-spin');

  // reels stop one after another: 0.9 s, 1.5 s, 2.1 s
  r = ticks(r.game, 100);                       // 0.83 s
  assert.equal(count(r.effects, 'reelStop'), 0);
  r = ticks(r.game, 15);                        // 0.96 s
  assert.equal(count(r.effects, 'reelStop'), 1);
  r = ticks(r.game, 70);                        // 1.54 s
  assert.equal(count(r.effects, 'reelStop'), 1);
  assert.equal(r.game.slot.phase, 'spinning');
  assert.equal(r.game.econ.writs, 0, 'nothing is paid until the reels settle');
  r = ticks(r.game, 75);                        // 2.17 s
  assert.equal(count(r.effects, 'reelStop'), 1);
  assert.equal(r.game.slot.phase, 'settled');
  assert.equal(r.game.econ.writs, 3);
  assert.ok(sfxNames(r.effects).includes('jackpot'));
  assert.ok(r.effects.some((e) => e.type === 'flash'));
  assert.deepEqual(says(r.effects), ['ch1.bark.jackpot.1']);
  assert.ok(r.game.toasts.some((t) => t.kind === 'jackpot' && t.text === RIGGED.payout.name));

  // to the table: music, and the scene's briefing over live play
  r = send(r.game, { type: 'toTable' });
  assert.equal(r.game.mode, 'play');
  assert.deepEqual(moods(r.effects), ['tense']);
  assert.deepEqual(says(r.effects), ['ch1.s1.b1']);
  assert.deepEqual(litIds(content, r.game), ['r1', 'r2', 'r3']);

  // a ball is placed at the plunger; the writ is not spent until launch
  r = send(r.game, tickMsg());
  assert.equal(r.game.phys.balls.length, 1);
  assert.equal(r.game.phys.balls[0].state, 'plunger');
  assert.equal(r.game.econ.writs, 3);
  const marks0 = r.game.econ.marks;

  // launch through all three rollovers: objective 'all' completes, the cutscene takes over
  r = playUntil(r.game, (x) => x.mode === 'cine');
  assert.equal(count(r.effects, 'launch'), 1);
  assert.equal(count(r.effects, 'rollover'), 3);
  assert.equal(count(r.effects, 'objective'), 3);
  assert.equal(count(r.effects, 'sceneClear'), 1);
  assert.equal(r.game.econ.writs, 2);
  assert.equal(r.game.econ.trust, 30);
  assert.equal(r.game.econ.score, 3 * 150 + 1000);
  assert.ok(Math.abs(r.game.econ.marks - (marks0 + 1.45)) < 1e-9, `marks ${r.game.econ.marks}`);
  assert.equal(r.game.cine.kind, 'scene');
  assert.equal(r.game.after, 'play');
  assert.deepEqual(moods(r.effects).slice(-1), ['sorrow']);
  assert.deepEqual(says(r.effects).slice(-1), ['ch1.s1.c01!']);
  assert.ok(r.game.toasts.some((t) => t.kind === 'scene' && t.text === 'Lantern Watch'));

  // the ball is frozen while the scene plays
  const frozenBalls = r.game.phys.balls;
  assert.equal(frozenBalls.length, 1);
  r = ticks(r.game, 10);
  assert.equal(r.game.phys.balls, frozenBalls);

  // safety net: with no lineDone the line gives way after lineSeconds * 1.5 + 2
  const limit = lineSeconds(content.chapters[0].scenes[0].cutscene[0]) * 1.5 + 2;
  r = ticks(r.game, Math.floor(limit / STEP) - 20);
  assert.equal(r.game.cine.index, 0);
  r = ticks(r.game, 15);
  assert.equal(r.game.cine.index, 1);
  assert.deepEqual(says(r.effects), ['ch1.s1.c02!']);
  assert.deepEqual(sfxNames(r.effects), ['target'], "the line's own sfx plays at its start");
  assert.equal(r.game.cine.lineT < 0.1, true);

  // skip: back to play in the next scene, saved, with a short ball save and the new briefing
  r = send(r.game, SKIP);
  assert.equal(r.game.mode, 'play');
  assert.equal(r.game.scene, 1);
  assert.deepEqual([r.game.hits, r.game.seq], [{}, 0]);
  assert.equal(r.effects[0].type, 'hush');
  assert.deepEqual(saves(r.effects), [{ v: 1, chapter: 0, scene: 1, econ: r.game.econ, seed: r.game.rng.s }]);
  assert.deepEqual(moods(r.effects), ['tense']);
  assert.deepEqual(says(r.effects), ['ch1.s2.b1', 'ch1.s2.b2']);
  assert.equal(r.game.boons.ballSave, 5);
  assert.deepEqual(litIds(content, r.game), ['r3']);

  // the same ball flies on and comes back down through r3 then r1: the sequence completes
  r = playUntil(r.game, (x) => x.mode === 'cine');
  assert.equal(count(r.effects, 'objective'), 2);
  assert.equal(count(r.effects, 'launch'), 0, 'no new ball was needed');
  assert.equal(r.game.econ.writs, 2);
  assert.equal(r.game.econ.trust, 30, 'a scene with no trust reward leaves trust alone');
  assert.deepEqual(moods(r.effects).slice(-1), ['tense'], 'a cutscene naming no music keeps the table mood');

  // voice-driven to the end of the last scene: the epilogue follows without leaving cine
  r = sendAll(r.game, [{ type: 'lineDone', id: 'ch1.s2.c01' }, { type: 'lineDone', id: 'ch1.s2.c02' }]);
  assert.equal(r.game.mode, 'cine');
  assert.equal(r.game.cine.kind, 'epilogue');
  assert.deepEqual(says(r.effects), ['ch1.s2.c02!', 'ch1.epi.01!']);
  assert.deepEqual(moods(r.effects), ['hope']);
  assert.deepEqual(saves(r.effects), [], 'no save points at a scene that does not exist');
  assert.deepEqual(litIds(content, r.game), []);

  // epilogue -> next chapter's card: fresh table, trust and aid reset, purse carried over
  const purse = r.game.econ;
  r = sendAll(r.game, [{ type: 'lineDone', id: 'ch1.epi.01' }, { type: 'lineDone', id: 'ch1.epi.02' }]);
  assert.equal(r.game.mode, 'card');
  assert.deepEqual([r.game.chapter, r.game.scene], [1, 0]);
  assert.deepEqual(r.game.econ, { ...purse, trust: 0, aidUsed: 0 });
  assert.deepEqual(r.game.phys.balls, []);
  assert.equal(r.game.spunThisChapter, false);
  assert.ok(sfxNames(r.effects).includes('card'));

  // chapter 2 has no prologue lines: the card opens straight onto the reels, and saves
  r = send(r.game, CONFIRM);
  assert.equal(r.game.mode, 'slot');
  assert.deepEqual(moods(r.effects), ['march']);
  assert.deepEqual(saves(r.effects).map((s) => [s.chapter, s.scene]), [[1, 0]]);

  // no rigged spin here: a real, paid spin from the rng
  const econ0 = r.game.econ;
  const expected = spin(r.game.rng);
  r = send(r.game, CONFIRM);
  assert.deepEqual(r.game.slot.result, expected.result);
  assert.deepEqual(r.game.rng, expected.rng);
  assert.deepEqual(r.game.econ, paySpin(econ0));
  r = ticks(r.game, 260);
  assert.equal(r.game.slot.phase, 'settled');
  assert.equal(count(r.effects, 'reelStop'), 3);
  assert.deepEqual(r.game.econ, applyPayout(paySpin(econ0), expected.result.payout));

  // count objective: four hits on r1/r2 is one flight, up and down
  r = send({ ...r.game, econ: { ...r.game.econ, writs: 2 }, multiQueue: 0 }, { type: 'toTable' });
  assert.deepEqual(says(r.effects), ['ch2.s1.b1']);
  r = playUntil(r.game, (x) => x.mode === 'cine');
  assert.equal(count(r.effects, 'objective'), 4);
  assert.equal(r.game.econ.trust, 10);
  assert.equal(r.game.cine.kind, 'scene');

  // last cutscene of the last chapter -> epilogue -> end
  r = send(r.game, SKIP);
  assert.equal(r.game.cine.kind, 'epilogue');
  assert.deepEqual(moods(r.effects), ['dread']);
  r = send(r.game, SKIP);
  assert.equal(r.game.mode, 'end');
  assert.deepEqual(saves(r.effects), []);
  const done = sendAll(r.game, [CONFIRM, SKIP, { type: 'toTable' }, tickMsg()]);
  assert.equal(done.game.mode, 'end');
  assert.deepEqual(done.effects, []);
});

// ───────────────────────── debt ─────────────────────────

test('debt: broke at the reels, confirm takes a loan, and earnings are garnished', () => {
  const broke = slotAt(0, 1, { marks: SPIN_COST - 1, writs: 0 });
  let r = send(broke, CONFIRM);
  assert.equal(r.game.slot.phase, 'idle', 'the loan is not itself a spin');
  assert.deepEqual(r.game.econ, takeLoan(broke.econ));
  assert.equal(r.game.econ.debt, LOAN.owed);
  assert.deepEqual(sfxNames(r.effects), ['loan']);
  assert.deepEqual(says(r.effects), ['ch1.bark.loan.1']);
  assert.deepEqual(toastKinds(r.game), ['loan']);

  // the advance pays for a spin
  r = send(r.game, CONFIRM);
  assert.equal(r.game.slot.phase, 'spinning');
  assert.equal(r.game.econ.marks, SPIN_COST - 1 + LOAN.marks - SPIN_COST);

  // on the table, the Mint takes its share of every mark earned
  const indebted = { ...playAt(0, 1), econ: { ...takeLoan(initEcon()), writs: 1 } };
  r = playUntil(indebted, (x, fx) => count(fx, 'rollover') >= 1);
  const earned = 150 * 0.001;
  assert.ok(Math.abs(r.game.econ.debt - (LOAN.owed - earned * LOAN.garnish)) < 1e-9, `debt ${r.game.econ.debt}`);
  assert.ok(Math.abs(r.game.econ.marks - (indebted.econ.marks + earned * (1 - LOAN.garnish))) < 1e-9);
});

test('slot: marks short but writs in hand is a hint, not a loan', () => {
  const g = slotAt(0, 1, { marks: 0, writs: 2 });
  const r = send(g, CONFIRM);
  assert.deepEqual(r.game.econ, g.econ);
  assert.deepEqual(toastKinds(r.game), ['hint']);
});

// ───────────────────────── mutual aid ─────────────────────────

test('aid: out of balls and writs, a trusting town covers one; without trust it is the reels', () => {
  // trust 30 buys exactly one aid ball this chapter
  let r = send(playAt(0, 1, { trust: 30 }), tickMsg());
  assert.equal(r.game.mode, 'play');
  assert.equal(r.game.econ.aidUsed, 1);
  assert.equal(r.game.econ.writs, 1);
  assert.equal(r.game.econ.debt, 0, 'the Commons gives');
  assert.equal(r.game.phys.balls.length, 1);
  assert.deepEqual(sfxNames(r.effects), ['aid']);
  assert.deepEqual(toastKinds(r.game), ['aid']);
  const said = says(r.effects);
  assert.equal(said.length, 1);
  assert.match(said[0], /^ch1\.bark\.aid\.[12]$/);
  assert.notDeepEqual(r.game.rng, seed(3), 'the bark was chosen by the rng');

  // that ball is launched on the aid writ, drains, and there is no second helping
  r = playUntil(r.game, (x) => x.mode === 'slot');
  assert.equal(count(r.effects, 'launch'), 1);
  assert.equal(count(r.effects, 'drain'), 1);
  assert.equal(count(r.effects, 'aid'), 0);
  assert.equal(r.game.econ.writs, 0);
  assert.equal(r.game.econ.aidUsed, 1);
  assert.deepEqual(moods(r.effects).slice(-1), ['court']);
  assert.ok(toastKinds(r.game).includes('bust'));

  // no trust at all: straight to the slot
  r = send(playAt(0, 1, { trust: 0 }), tickMsg());
  assert.equal(r.game.mode, 'slot');
  assert.equal(r.game.econ.aidUsed, 0);
  assert.deepEqual(says(r.effects), []);
});

// ───────────────────────── load ─────────────────────────

test('load: restores the start of the saved scene, in the slot, from any mode', () => {
  const econ = { ...initEcon(), score: 4321, marks: 77.5, writs: 2, debt: 120, trust: 55, aidUsed: 1, spins: 9 };
  const save = { v: 1, chapter: 0, scene: 1, econ, seed: 99 };
  const midCine = sendAll(init(1), [CONFIRM, CONFIRM]).game;
  assert.equal(midCine.mode, 'cine');
  let r = send(midCine, { type: 'load', save });
  assert.equal(r.game.mode, 'slot');
  assert.deepEqual([r.game.chapter, r.game.scene], [0, 1]);
  assert.deepEqual(r.game.econ, econ);
  assert.deepEqual([r.game.hits, r.game.seq, r.game.cine], [{}, 0, null]);
  assert.deepEqual(r.game.phys.balls, []);
  assert.deepEqual(r.game.rng, seed(99));
  assert.equal(r.game.slot.phase, 'idle');
  assert.equal(r.game.spunThisChapter, true, 'past scene 0 the rigged spin is history');
  assert.deepEqual(r.effects, [{ type: 'hush' }, { type: 'music', mood: 'court' }]);
  assert.deepEqual(toSave(r.game), save, 'a loaded game saves back to the same save');

  // the scene's briefing is spoken again when play begins
  r = send(r.game, { type: 'toTable' });
  assert.deepEqual(says(r.effects), ['ch1.s2.b1', 'ch1.s2.b2']);

  // a scene-0 save still has the chapter's rigged spin ahead of it
  r = send(init(1), { type: 'load', save: { ...save, scene: 0 } });
  assert.equal(r.game.spunThisChapter, false);
  assert.equal(send(r.game, CONFIRM).game.slot.result, RIGGED);
});

test('load: a save written by the game round-trips', () => {
  const toSlot = sendAll(init(5), [CONFIRM, CONFIRM, SKIP]);
  const [save] = saves(toSlot.effects);
  const r = send(init(123), { type: 'load', save: JSON.parse(JSON.stringify(save)) });
  assert.deepEqual(toSave(r.game), save);
  assert.equal(r.game.mode, 'slot');
});

test('load: refuses a save it cannot honour', () => {
  const save = { v: 1, chapter: 0, scene: 0, econ: initEcon(), seed: 1 };
  const load = (s) => () => update(content, init(1), { type: 'load', save: s });
  assert.throws(load({ ...save, v: 2 }), /save version 2/);
  assert.throws(load({ ...save, chapter: 9 }), /chapter index 9/);
  assert.throws(load({ ...save, scene: 2 }), /scene index 2/);
});

// ───────────────────────── balls, saves and boons ─────────────────────────

test('ball save: a drained ball comes back free; without it the next ball costs a writ', () => {
  const start = { ...playAt(0, 1, { writs: 2 }), boons: { ballSave: 600, mult: 1, multT: 0 } };
  // scene index 1 would complete on the way down, so play a scene nothing here can finish
  const g = { ...start, hits: {}, seq: 0 };
  let r = playUntil(g, (x, fx) => count(fx, 'drain') >= 1 || x.mode !== 'play');
  if (r.game.mode === 'cine') r = playUntil(send(r.game, SKIP).game, (x, fx) => count(fx, 'drain') >= 1);
  assert.equal(r.game.mode, 'play');
  assert.equal(r.game.econ.writs, 1, 'one writ spent on the first launch');
  assert.equal(r.game.freeBalls, 1);
  assert.equal(r.game.phys.balls.length, 1);
  assert.equal(r.game.phys.balls[0].state, 'plunger');
  assert.ok(toastKinds(r.game).includes('save'));
  assert.ok(says(r.effects).includes('ch1.bark.save.1'));

  // relaunching the saved ball is free
  r = playUntil(r.game, (x, fx) => count(fx, 'launch') >= 1);
  assert.equal(r.game.econ.writs, 1);
  assert.equal(r.game.freeBalls, 0);

  // save expired: the drain is final, and the next ball is on the remaining writ
  r = playUntil({ ...r.game, boons: { ballSave: 0, mult: 1, multT: 0 } }, (x, fx) => count(fx, 'launch') >= 1);
  assert.equal(count(r.effects, 'drain'), 1);
  assert.equal(r.game.econ.writs, 0);
  r = playUntil(r.game, (x) => x.mode === 'slot');
  assert.equal(count(r.effects, 'drain'), 1);
});

test('ball save and the mark multiplier run down only in play, and the multiplier resets', () => {
  const g = { ...playAt(1, 0, { writs: 1 }), boons: { ballSave: 0.5, mult: 2, multT: 1 } };
  let r = ticks(g, 30);
  assert.ok(Math.abs(r.game.boons.ballSave - 0.25) < 1e-9);
  assert.equal(r.game.boons.mult, 2);
  r = ticks(r.game, 100);
  assert.deepEqual(r.game.boons, { ballSave: 0, mult: 1, multT: 0 });

  const inSlot = { ...slotAt(1, 0), boons: { ballSave: 9, mult: 2, multT: 9 } };
  assert.deepEqual(ticks(inSlot, 50).game.boons, inSlot.boons);
});

test('boons: a payout arms ball save, double marks or multiball when the reels settle', () => {
  const settle = (boon) => {
    const result = { reels: ['coin', 'coin', 'scale'], payout: { writs: 1, marks: 10, boon, name: 'Test', blurb: '' } };
    const g = { ...slotAt(1, 0), slot: { phase: 'spinning', t: 0, result, stopAt: REEL_STOPS } };
    return ticks(g, 260);
  };
  assert.deepEqual(settle('ballSave').game.boons, { ballSave: 20, mult: 1, multT: 0 });
  assert.deepEqual(settle('doubleMarks').game.boons, { ballSave: 0, mult: 2, multT: 30 });
  assert.equal(settle('multiball').game.multiQueue, 2);
  const plain = settle(null);
  assert.equal(plain.game.multiQueue, 0);
  assert.deepEqual(sfxNames(plain.effects), ['reelStop', 'reelStop', 'reelStop', 'payout']);
  assert.equal(plain.game.econ.writs, 1);
  assert.throws(() => settle('freeLunch'), /unknown boon "freeLunch"/);
});

test('bust: a spin that pays nothing says so', () => {
  const result = { reels: ['tide', 'tide', 'tide'], payout: { writs: 0, marks: 0, boon: null, name: 'Foreclosed', blurb: '' } };
  const g = { ...slotAt(1, 0), slot: { phase: 'spinning', t: 0, result, stopAt: REEL_STOPS } };
  const r = ticks(g, 260);
  assert.ok(sfxNames(r.effects).includes('bust'));
  assert.deepEqual(says(r.effects), ['ch2.bark.bust.1']);
});

test('double marks: points earn twice the marks, score is unchanged', () => {
  const g = { ...playAt(1, 0, { writs: 1 }), boons: { ballSave: 0, mult: 2, multT: 30 } };
  const r = playUntil(g, (x, fx) => count(fx, 'rollover') >= 1);
  assert.equal(r.game.econ.score, 150);
  assert.ok(Math.abs(r.game.econ.marks - (g.econ.marks + 0.3)) < 1e-9, `marks ${r.game.econ.marks}`);
});

test('multiball: two extra live balls join after the launch, for one writ', () => {
  const g = { ...playAt(1, 0, { writs: 1 }), multiQueue: 2 };
  let most = 0;
  const r = playUntil(g, (x) => {
    most = Math.max(most, x.phys.balls.filter((b) => b.state === 'live').length);
    return x.multiQueue === 0 || x.mode !== 'play';
  });
  assert.equal(r.game.multiQueue, 0);
  assert.equal(count(r.effects, 'launch'), 3, 'one plunger launch and two fed balls');
  assert.equal(r.game.econ.writs, 0);
  assert.ok(most >= 1);
  assert.equal(r.game.phys.nextBallId >= 3 || r.game.phys.balls.length >= 1, true);
});

// ───────────────────────── leaving the table ─────────────────────────

test('toSlot: allowed with the ball at rest on the plunger, refused while it is live', () => {
  let r = send(playAt(0, 1, { writs: 1 }), tickMsg());
  assert.equal(r.game.phys.balls[0].state, 'plunger');
  const back = send(r.game, { type: 'toSlot' });
  assert.equal(back.game.mode, 'slot');
  assert.deepEqual(moods(back.effects), ['court']);
  assert.equal(back.game.econ.writs, 1, 'the unlaunched ball has cost nothing');
  // and the waiting ball lets you return even if the writ count were zero
  assert.equal(send({ ...back.game, econ: { ...back.game.econ, writs: 0 } }, { type: 'toTable' }).game.mode, 'play');

  r = playUntil(r.game, (x, fx) => count(fx, 'launch') >= 1);
  const refused = send(r.game, { type: 'toSlot' });
  assert.equal(refused.game.mode, 'play');
  assert.deepEqual(toastKinds(refused.game).slice(-1), ['hint']);
});

// ───────────────────────── housekeeping ─────────────────────────

test('toasts age out after three seconds; time advances in every mode', () => {
  const g = send(slotAt(0, 1, { writs: 0 }), { type: 'toTable' }).game;
  assert.equal(g.toasts.length, 1);
  let r = ticks(g, 350);
  assert.equal(r.game.toasts.length, 1);
  assert.ok(Math.abs(r.game.t - 350 * STEP) < 1e-9);
  assert.ok(Math.abs(r.game.modeT - 350 * STEP) < 1e-9);
  r = ticks(r.game, 20);
  assert.deepEqual(r.game.toasts, []);
});

test('barks are rate limited', () => {
  // two launches inside the cooldown: only the first speaks
  const g = { ...playAt(1, 0, { writs: 2 }), barkCool: 0 };
  const r = playUntil(g, (x, fx) => count(fx, 'launch') >= 1);
  assert.deepEqual(says(r.effects), ['ch2.bark.launch.1']);
  assert.ok(r.game.barkCool > 7);
  const again = playUntil({ ...r.game, boons: { ballSave: 600, mult: 1, multT: 0 }, barkCool: 600 },
    (x, fx) => count(fx, 'launch') >= 1 || x.mode !== 'play');
  assert.deepEqual(says(again.effects).filter((s) => s.includes('launch') || s.includes('drain')), []);
});

test('update throws on what it does not know, naming it', () => {
  const g = init(1);
  assert.throws(() => update(content, g, { type: 'warp' }), /unknown message type "warp"/);
  assert.throws(() => update(content, { ...g, mode: 'paused' }, CONFIRM), /unknown mode "paused"/);
  assert.throws(() => update(content, g, { type: 'tick', input: IDLE }), /positive dt/);
  assert.throws(() => update(content, playAt(0, 0), { type: 'tick', dt: STEP }), /needs msg\.input/);
  const lost = { ...content, chapters: [{ ...content.chapters[0], tableId: 'atlantis' }] };
  assert.throws(() => update(lost, g, CONFIRM), /unknown table "atlantis"/);
});
