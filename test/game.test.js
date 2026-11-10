import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  init, update, toSave, leverStatus, REEL_STOPS, FILL_SECONDS, PAY_SECONDS, REELS_NEED, AID_WAIT, LEVER_DELAY,
} from '../src/core/game.js';
import { lineSeconds, litIds, spinIds } from '../src/core/story.js';
import { STEP } from '../src/core/physics.js';
import { spin, drawSym, payoutFor, REEL_STRIPS } from '../src/core/slot.js';
import {
  SPIN_COST, LOAN, TRUST_PER_GIFT, initEcon, paySpin, applyPayout, takeLoan, spendWrit, awardPoints,
} from '../src/core/economy.js';
import { COMBO_MULT } from '../src/core/stage.js';
import { seed, next } from '../src/core/rng.js';
import { content as shipped } from '../src/content/index.js';

// ───────────────────────── fixture content ─────────────────────────
// A box: one open-bottomed column. The plunger fires straight up through three
// rollovers (r1, r2, r3 in that order), the ball comes back down through them
// (r3, r2, r1) and drains. Flippers exist, as the contract requires, but sit
// outside the column.
//
// The box's reels are wired to elements it does not have, so nothing on it touches them
// and the objective tests see only what the objectives do. The variants below wire them
// up one mechanism at a time.

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
  reels: { fill: ['none1', 'none2', 'none3'], spin: [] },
  plunger: { pos: [200, 700], maxSpeed: 1500 },
  drainY: 780,
  theme: { bg: ['#000', '#111'], accent: '#fff', glow: '#fff', motif: 'none' },
  decor: [], labels: {},
};

const tables = {
  box: table,
  // the three rollovers are the three top lanes
  lanes: { ...table, id: 'lanes', reels: { fill: ['r1', 'r2', 'r3'], spin: [] } },
  // a shot gate across the column that spins the reels, and a standup target for a ceiling
  shot: {
    ...table, id: 'shot',
    targets: [{ id: 'bell', a: [150, 21], b: [250, 21] }],
    shots: [{ id: 'gate', a: [150, 500], b: [250, 500], dir: [0, -1] }],
    reels: { fill: ['none1', 'none2', 'none3'], spin: ['gate'] },
  },
  // a saucer in the middle of the column that spins the reels; on its own it holds a ball 0.1 s
  saucer: {
    ...table, id: 'saucer',
    saucers: [{ id: 'cup', pos: [200, 400], r: 12, eject: [0, 300], holdMs: 100 }],
    reels: { fill: ['none1', 'none2', 'none3'], spin: ['cup'] },
  },
  // an outlane below the plunger (so only a falling ball meets it) and an inlane off to the side
  gutter: {
    ...table, id: 'gutter',
    rollovers: [...table.rollovers, { id: 'outL', pos: [200, 740], r: 10 }, { id: 'inL', pos: [300, 400], r: 10 }],
  },
  // a floor under the plunger: a ball that comes back down settles there and can be plunged again
  well: { ...table, id: 'well', walls: [...table.walls, { a: [150, 708], b: [250, 708] }] },
};

const L = (id, who, text, extra = {}) => ({ id, who, text, ...extra });
// Tobb is in nobody's cinematic in this fixture: his lines must never be heard.
// Nan is first seen in ch1.s1's cutscene: hers must wait for scene 2.
const barks = (ch) => ({
  launch: [L(`${ch}.bark.launch.1`, 'ren', 'Plumb away.')],
  drain: [L(`${ch}.bark.drain.1`, 'tobb', 'That one cost you.')],
  save: [L(`${ch}.bark.save.1`, 'thorne', 'Again.', { fx: 'radio' })],
  loan: [L(`${ch}.bark.loan.1`, 'thorne', 'In arrears, cadet.', { fx: 'radio' }), L(`${ch}.bark.loan.2`, 'tobb', 'I know how that table ends.')],
  aid: [L(`${ch}.bark.aid.1`, 'nan', 'This one is on us, boy.'), L(`${ch}.bark.aid.2`, 'ren', 'They gave it.')],
  jackpot: [L(`${ch}.bark.jackpot.1`, 'thorne', 'Luck.', { fx: 'radio' }), L(`${ch}.bark.jackpot.2`, 'tobb', 'Long odds, that.')],
  bust: [L(`${ch}.bark.bust.1`, 'ren', 'Nothing.'), L(`${ch}.bark.bust.2`, 'tobb', 'The house thanks you.')],
});

const RIGGED = {
  reels: ['orb', 'orb', 'orb'],
  payout: { writs: 3, marks: 0, boon: null, name: 'The Lot Falls', blurb: 'One name comes up.' },
};

const content = {
  cast: {},
  tables,
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
      music: { play: 'tense', cine: 'court' },
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
          cutscene: [L('ch2.s1.c01', 'hesper', 'Every Tribune eats our bread.', { bg: 'picket' })],
          reward: { points: 500, trust: 10 },
        },
      ],
      epilogue: [L('ch2.epi.01', 'sable', 'They think you touched the reels.', { bg: 'shore-dusk', music: 'dread' })],
      barks: barks('ch2'),
      music: { play: 'mine', cine: 'march' },
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
// for watching balls drain without a cutscene cutting in. Optionally on another table.
const grindOn = (tableId) => deepFreeze({
  ...content,
  chapters: [{
    ...content.chapters[0],
    tableId,
    scenes: [{ ...content.chapters[0].scenes[1], objective: { kind: 'count', ids: ['r1'], n: 999 } }],
  }],
});
const grind = grindOn('box');

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
const seconds = (s) => Math.round(s / STEP);

/** Button up, down, up: one press of the plunger button, whatever it was doing before. */
const press = (game, c = content) => sendAll(game, [tickMsg(false), tickMsg(true), tickMsg(false)], c);

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

/** Hands off until pred. */
function waitUntil(game, pred, c = content, max = 30000) {
  let acc = { game, effects: [] };
  for (let i = 0; i < max; i++) {
    if (pred(acc.game, acc.effects)) return { ...acc, ticks: i };
    const r = send(acc.game, tickMsg(), c);
    acc = { game: r.game, effects: acc.effects.concat(r.effects) };
  }
  throw new Error(`waitUntil: predicate still false after ${max} ticks (mode ${acc.game.mode})`);
}

const sfxNames = (effects) => effects.filter((e) => e.type === 'sfx').map((e) => e.name);
const count = (effects, name) => sfxNames(effects).filter((n) => n === name).length;
const says = (effects) => effects.filter((e) => e.type === 'say').map((e) => `${e.line.id}${e.blocking ? '!' : ''}`);
const moods = (effects) => effects.filter((e) => e.type === 'music').map((e) => e.mood);
const saves = (effects) => effects.filter((e) => e.type === 'save').map((e) => e.save);
const toastKinds = (game) => game.toasts.map((t) => t.kind);
const syms = (game) => game.reels.cells.map((c) => c.sym);
const emptyTable = (g) => g.phys.balls.length === 0 && g.econ.writs === 0;
const EMPTY = [{ sym: null, spin: 0 }, { sym: null, spin: 0 }, { sym: null, spin: 0 }];
/** What toSave writes for reels nobody has touched: empty, lit, fully charged. */
const FRESH_SAVED = { cells: EMPTY, source: null, armed: true, charge: REELS_NEED };
const QUIET = 1e9;   // a bark cooldown nothing outlasts: no bark, so no rng drawn for one

/**
 * In play at the start of a scene, restored by 'load': no ball on the table and, unless
 * the overrides say otherwise, no writ to bring one. Past the chapter's first pull.
 */
function playAt(chapter, scene, econ = {}, c = content) {
  const save = { v: 2, chapter, scene, econ: { ...initEcon(), ...econ }, seed: 3 };
  return { ...send(init(3), { type: 'load', save }, c).game, spunThisChapter: true };
}
/** The same, after the moment in which the button is not yet the lever. */
const atLever = (chapter, scene, econ = {}, c = content) =>
  ticks(playAt(chapter, scene, econ, c), seconds(LEVER_DELAY) + 2, false, c).game;
/** Put a line on the reels that locks on the next tick. */
const lineUp = (game, line, source = 'lanes') => ({
  ...game,
  reels: { ...game.reels, phase: 'open', result: null, source, cells: line.map((sym) => ({ sym, spin: STEP / 2 })) },
});

// ───────────────────────── the whole game, start to end ─────────────────────────

test('playthrough: title to end across two chapters, with no slot screen anywhere', () => {
  // title
  let g = init(7);
  assert.equal(g.mode, 'title');
  assert.equal(g.phys, null);
  assert.equal('slot' in g, false);
  assert.equal('after' in g, false);
  assert.deepEqual(g.reels, { cells: EMPTY, phase: 'open', t: 0, result: null, source: null, armed: true, charge: REELS_NEED, need: REELS_NEED });
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

  // confirm also advances (cutting the voice off), and past the last line it is the table
  r = send(r.game, CONFIRM);
  assert.deepEqual(says(r.effects), ['ch1.pro.03!']);
  assert.equal(r.effects[0].type, 'hush');
  r = send(r.game, CONFIRM);
  assert.equal(r.game.mode, 'play');
  assert.equal(r.game.cine, null);
  assert.deepEqual(moods(r.effects), ['tense']);
  assert.deepEqual(saves(r.effects), [{ v: 4, chapter: 0, scene: 0, econ: initEcon(), seed: seed(7).s, reels: FRESH_SAVED, ending: null }]);

  // no writ, so no ball: the table is empty and the plunger button is the lever
  assert.equal(leverStatus(content, r.game), 'wait', 'not in the instant play begins');
  r = ticks(r.game, seconds(LEVER_DELAY) + 2);
  assert.deepEqual(r.game.phys.balls, []);
  assert.equal(leverStatus(content, r.game), 'free');
  assert.deepEqual(says(r.effects), [], 'the briefing waits for a ball');
  assert.equal(send(r.game, CONFIRM).game, r.game, 'confirm is nothing in play');

  // the first pull is the chapter's rigged one, and it is free
  const before = r.game.econ;
  r = press(r.game);
  assert.deepEqual(syms(r.game), ['orb', 'orb', 'orb']);
  assert.deepEqual([r.game.reels.phase, r.game.reels.source, r.game.reels.result], ['open', 'lever', null]);
  assert.ok(r.game.reels.cells.every((c, i) => c.spin > REEL_STOPS[i] - 0.05 && c.spin <= REEL_STOPS[i]));
  assert.deepEqual(r.game.econ, { ...before, spins: 1 });
  assert.deepEqual(sfxNames(r.effects), ['reelStart']);
  assert.deepEqual(r.game.rng, seed(7), 'a rigged pull draws nothing from the rng');
  assert.equal(r.game.reels.armed, true, 'the lever does not spend the lit shots');
  assert.equal(leverStatus(content, r.game), 'wait');
  const again = press(r.game);
  assert.deepEqual(again.effects, [], 'a press while the reels turn does nothing');
  assert.deepEqual(again.game.econ, r.game.econ);

  // the reels lock one after another: 0.7 s, 1.1 s, 1.5 s
  r = ticks(r.game, seconds(0.6));
  assert.equal(count(r.effects, 'reelStop'), 0);
  r = ticks(r.game, seconds(0.2));              // 0.8 s
  assert.equal(count(r.effects, 'reelStop'), 1);
  assert.equal(r.game.reels.cells[0].spin, 0);
  r = ticks(r.game, seconds(0.4));              // 1.2 s
  assert.equal(count(r.effects, 'reelStop'), 1);
  assert.equal(r.game.reels.phase, 'open');
  assert.equal(r.game.econ.writs, 0, 'nothing is paid until the last reel locks');
  assert.equal(r.game.spunThisChapter, false);
  r = ticks(r.game, seconds(0.4));              // 1.6 s
  assert.equal(count(r.effects, 'reelStop'), 1);
  assert.equal(r.game.reels.phase, 'paying');
  assert.equal(r.game.reels.result, RIGGED, 'the scripted pull pays what the chapter says, not the paytable');
  assert.equal(r.game.econ.writs, 3);
  assert.equal(r.game.spunThisChapter, true);
  assert.ok(sfxNames(r.effects).includes('jackpot'));
  assert.ok(r.effects.some((e) => e.type === 'flash'));
  assert.deepEqual(says(r.effects), ['ch1.bark.jackpot.1'], 'and never Tobb, whom nobody has met');
  assert.ok(r.game.toasts.some((t) => t.kind === 'jackpot' && t.text === RIGGED.payout.name));

  // the writ brings a ball to the plunger; it is not spent until launch, and the line clears by itself
  assert.equal(r.game.phys.balls.length, 1);
  assert.equal(r.game.phys.balls[0].state, 'plunger');
  assert.equal(leverStatus(content, r.game), null);
  r = ticks(r.game, seconds(PAY_SECONDS));
  assert.deepEqual(r.game.reels, { cells: EMPTY, phase: 'open', t: 0, result: null, source: null, armed: true, charge: REELS_NEED, need: REELS_NEED });
  assert.equal(r.game.econ.writs, 3);
  assert.deepEqual(says(r.effects), []);
  assert.deepEqual(litIds(content, r.game), ['r1', 'r2', 'r3']);
  const marks0 = r.game.econ.marks;

  // launch: the briefing is spoken now, over the ball, and through all three rollovers the
  // 'all' objective completes and the cutscene takes over
  r = playUntil(r.game, (x) => x.mode === 'cine');
  assert.equal(count(r.effects, 'launch'), 1);
  assert.equal(count(r.effects, 'rollover'), 3);
  assert.equal(count(r.effects, 'objective'), 3);
  assert.equal(count(r.effects, 'sceneClear'), 1);
  assert.deepEqual(says(r.effects), ['ch1.s1.b1', 'ch1.s1.c01!'], 'the briefing, and no launch bark on top of it');
  assert.equal(r.game.econ.writs, 2);
  assert.equal(r.game.econ.trust, 30);
  // The jackpot a moment ago opened a chain (3); two lanes (1 each) and their objective steps (2 each) take
  // it to 9, so the third lane is hit at chain 10: combo level 2 (COMBO_LEVELS[1] is 8). The bonus is score
  // only: the marks below are unmoved.
  assert.equal(r.game.econ.score, 3 * 150 + 1000 + 150 * (COMBO_MULT[2] - 1));
  assert.ok(Math.abs(r.game.econ.marks - (marks0 + 1.45)) < 1e-9, `marks ${r.game.econ.marks}`);
  assert.equal(r.game.cine.kind, 'scene');
  assert.deepEqual(moods(r.effects).slice(-1), ['sorrow']);
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

  // skip: back to play in the next scene, saved, with a short ball save; the ball is still
  // in flight, so the new briefing is spoken on the first tick
  r = send(r.game, SKIP);
  assert.equal(r.game.mode, 'play');
  assert.equal(r.game.scene, 1);
  assert.deepEqual([r.game.hits, r.game.seq], [{}, 0]);
  assert.equal(r.effects[0].type, 'hush');
  assert.deepEqual(saves(r.effects), [toSave(r.game)]);
  assert.deepEqual([saves(r.effects)[0].v, saves(r.effects)[0].chapter, saves(r.effects)[0].scene], [4, 0, 1]);
  assert.deepEqual(moods(r.effects), ['tense']);
  assert.equal(r.game.boons.ballSave, 5);
  assert.deepEqual(litIds(content, r.game), ['r3']);
  assert.deepEqual(says(send(r.game, tickMsg()).effects), ['ch1.s2.b1', 'ch1.s2.b2']);

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

  // epilogue -> next chapter's card: fresh table and reels, trust and aid reset, purse carried over
  const purse = r.game.econ;
  r = sendAll({ ...r.game, reels: { ...r.game.reels, armed: false, charge: 7 } },
    [{ type: 'lineDone', id: 'ch1.epi.01' }, { type: 'lineDone', id: 'ch1.epi.02' }]);
  assert.equal(r.game.mode, 'card');
  assert.deepEqual([r.game.chapter, r.game.scene], [1, 0]);
  assert.deepEqual(r.game.econ, { ...purse, trust: 0, aidUsed: 0 });
  assert.equal(purse.trust, 30);
  assert.equal(r.game.econ.trustEarned, 30, 'the lifetime total survives the chapter card');
  assert.deepEqual(r.game.phys.balls, []);
  assert.equal(r.game.spunThisChapter, false);
  assert.deepEqual([r.game.reels.armed, r.game.reels.charge], [true, REELS_NEED]);
  assert.ok(sfxNames(r.effects).includes('card'));

  // chapter 2 has no prologue lines: the card opens straight onto the table, and saves
  r = send(r.game, CONFIRM);
  assert.equal(r.game.mode, 'play');
  assert.deepEqual(moods(r.effects), ['mine']);
  assert.deepEqual(saves(r.effects).map((s) => [s.v, s.chapter, s.scene]), [[4, 1, 0]]);

  // no rigged pull here, and with the writs gone the lever is a real, paid draw from the rng
  r = ticks({ ...r.game, econ: { ...r.game.econ, writs: 0 } }, seconds(LEVER_DELAY) + 2);
  assert.equal(leverStatus(content, r.game), 'pull');
  const econ0 = r.game.econ;
  const expected = spin(r.game.rng, 'lever');
  r = press(r.game);
  assert.deepEqual(syms(r.game), expected.result.reels);
  assert.deepEqual(r.game.rng, expected.rng);
  assert.deepEqual(r.game.econ, paySpin(econ0));
  assert.equal(r.game.econ.marks, econ0.marks - SPIN_COST);
  r = ticks(r.game, seconds(REEL_STOPS[2]) + 5);
  assert.equal(r.game.reels.phase, 'paying');
  assert.deepEqual(r.game.reels.result, expected.result);
  assert.equal(count(r.effects, 'reelStop'), 3);
  assert.deepEqual(r.game.econ, applyPayout(paySpin(econ0), expected.result.payout));
  assert.equal(r.game.spunThisChapter, true);

  // count objective: four hits on r1/r2 is one flight, up and down
  r = playUntil({ ...r.game, econ: { ...r.game.econ, writs: 2 }, multiQueue: 0 }, (x) => x.mode === 'cine');
  assert.ok(says(r.effects).includes('ch2.s1.b1'));
  assert.equal(count(r.effects, 'objective'), 4);
  assert.equal(r.game.econ.trust, 10);
  assert.equal(r.game.econ.trustEarned, 40, '30 in chapter one and 10 here');
  assert.equal(r.game.cine.kind, 'scene');

  // last cutscene of the last chapter -> epilogue -> end
  r = send(r.game, SKIP);
  assert.equal(r.game.cine.kind, 'epilogue');
  assert.deepEqual(moods(r.effects), ['dread']);
  r = send(r.game, SKIP);
  assert.equal(r.game.mode, 'end');
  assert.equal(r.game.ending, 'commons', 'the ledger was read when the last objective of the last chapter completed');
  assert.deepEqual(saves(r.effects), []);
  const done = sendAll(r.game, [CONFIRM, SKIP, tickMsg()]);
  assert.equal(done.game.mode, 'end');
  assert.deepEqual(done.effects, []);
});

// ───────────────────────── the lever ─────────────────────────

test('lever: only with no ball anywhere and no writs; otherwise the button is the plunger', () => {
  // a writ brings a ball, and the same press launches it: no draw, nothing paid
  const c = grind;
  let r = ticks(playAt(0, 0, { writs: 1 }, c), seconds(LEVER_DELAY) + 2, false, c);
  assert.equal(r.game.phys.balls[0].state, 'plunger');
  assert.equal(leverStatus(c, r.game), null);
  const marks = r.game.econ.marks;
  r = press(r.game, c);
  assert.equal(count(r.effects, 'launch'), 1);
  assert.equal(count(r.effects, 'reelStart'), 0);
  assert.deepEqual([r.game.econ.marks, r.game.econ.spins, r.game.econ.writs], [marks, 0, 0]);
  assert.deepEqual(r.game.reels.cells, EMPTY);
  // the ball is in flight: still not the lever, however empty the purse of writs
  assert.equal(leverStatus(c, r.game), null);
  assert.equal(count(press(r.game, c).effects, 'reelStart'), 0);

  // it drains: the button becomes the lever, after a beat
  r = waitUntil(r.game, emptyTable, c);
  assert.equal(leverStatus(c, r.game), 'wait');
  assert.equal(count(press(r.game, c).effects, 'reelStart'), 0, 'a press in the instant after a drain is not a pull');
  r = ticks(r.game, seconds(LEVER_DELAY) + 2, false, c);
  assert.equal(leverStatus(c, r.game), 'pull');
  r = press(r.game, c);
  assert.equal(count(r.effects, 'reelStart'), 1);
  assert.ok(Math.abs(r.game.econ.marks - (marks + 0.9 - SPIN_COST)) < 1e-9, 'six rollovers on the way, then the pull');

  // a button already down when play begins is not a press, and neither is holding it
  const held = ticks(playAt(0, 1), seconds(1), true);
  assert.equal(count(held.effects, 'reelStart'), 0);
  assert.equal(held.game.econ.spins, 0);
  assert.equal(count(sendAll(held.game, [tickMsg(false), tickMsg(true)]).effects, 'reelStart'), 1);

  assert.equal(leverStatus(content, init(1)), null, 'there is no lever on the title screen');
});

test('debt: a purse that cannot pay borrows on the first press and pulls on the next; earnings are garnished', () => {
  const broke = atLever(0, 1, { marks: SPIN_COST - 1 });
  assert.equal(leverStatus(content, broke), 'loan');
  let r = press(broke);
  assert.deepEqual(r.game.reels.cells, EMPTY, 'the loan is not itself a pull');
  assert.deepEqual(r.game.econ, takeLoan(broke.econ));
  assert.equal(r.game.econ.debt, LOAN.owed);
  assert.equal(r.game.econ.loansTaken, 1);
  assert.deepEqual(sfxNames(r.effects), ['loan']);
  assert.deepEqual(says(r.effects), ['ch1.bark.loan.1']);
  assert.deepEqual(toastKinds(r.game), ['loan']);

  // the advance pays for the pull
  assert.equal(leverStatus(content, r.game), 'pull');
  r = press(r.game);
  assert.equal(r.game.reels.source, 'lever');
  assert.equal(r.game.econ.marks, SPIN_COST - 1 + LOAN.marks - SPIN_COST);
  assert.equal(r.game.econ.loansTaken, 1);

  // on the table, the Mint takes its share of every mark earned
  const indebted = { ...playAt(0, 1), econ: { ...takeLoan(initEcon()), writs: 1 } };
  r = playUntil(indebted, (x, fx) => count(fx, 'rollover') >= 1);
  const earned = 150 * 0.001;
  assert.ok(Math.abs(r.game.econ.debt - (LOAN.owed - earned * LOAN.garnish)) < 1e-9, `debt ${r.game.econ.debt}`);
  assert.ok(Math.abs(r.game.econ.marks - (indebted.econ.marks + earned * (1 - LOAN.garnish))) < 1e-9);
});

// ───────────────────────── mutual aid ─────────────────────────

test('aid: the Commons passes the hat, which takes two seconds, and the gift is entered in the book', () => {
  // trust 30 buys exactly one aid ball this chapter
  let r = send(playAt(0, 0, { trust: 30 }, grind), tickMsg(), grind);
  assert.deepEqual(toastKinds(r.game), ['aid'], 'the hat is announced at once');
  assert.equal(r.game.econ.aidUsed, 0);
  assert.deepEqual(r.game.phys.balls, []);
  r = ticks(r.game, seconds(AID_WAIT) - 10, false, grind);
  assert.equal(r.game.econ.aidUsed, 0, 'not yet');
  assert.equal(leverStatus(grind, r.game), 'credit');
  r = ticks(r.game, 12, false, grind);
  assert.equal(r.game.mode, 'play');
  assert.equal(r.game.econ.aidUsed, 1);
  assert.equal(r.game.econ.writs, 1);
  assert.equal(r.game.econ.debt, 0, 'the Commons gives');
  assert.equal(r.game.econ.trustEarned, TRUST_PER_GIFT, 'and being given to is trust');
  assert.equal(r.game.econ.trust, 30, 'the town\'s meter is not moved by its own gift');
  assert.equal(r.game.phys.balls.length, 1);
  assert.deepEqual(sfxNames(r.effects), ['aid']);
  assert.deepEqual(toastKinds(r.game), ['aid', 'aid']);
  assert.deepEqual(says(r.effects), ['ch1.bark.aid.2'], 'Ren, not Nan: in scene one nobody has met her');
  assert.notDeepEqual(r.game.rng, seed(3), 'the bark was chosen by the rng');

  // that ball is launched on the aid writ, drains, and there is no second helping
  r = playUntil(r.game, emptyTable, grind);
  assert.equal(count(r.effects, 'launch'), 1);
  assert.equal(count(r.effects, 'drain'), 1);
  r = ticks(r.game, seconds(AID_WAIT) + 20, false, grind);
  assert.equal(count(r.effects, 'aid'), 0);
  assert.equal(r.game.econ.aidUsed, 1);
  assert.deepEqual(r.game.phys.balls, []);
  assert.equal(leverStatus(grind, r.game), 'pull', 'what is left is the lever');

  // no trust at all: no hat, just the lever
  r = ticks(playAt(0, 0, { trust: 0 }, grind), seconds(AID_WAIT) + 20, false, grind);
  assert.equal(r.game.econ.aidUsed, 0);
  assert.deepEqual(r.game.toasts, []);
  assert.deepEqual(says(r.effects), []);
  assert.equal(leverStatus(grind, r.game), 'pull');
});

test('credit: pulling the lever while the hat is going round is a loan and a pull in one press', () => {
  const g = atLever(0, 0, { trust: 30 }, grind);
  assert.ok(g.econ.marks >= SPIN_COST, 'this purse could have paid');
  assert.equal(leverStatus(grind, g), 'credit');
  // the Mint speaks first (one eligible line: one draw to pick it), then the reels are drawn
  const expected = spin(next(g.rng)[1], 'lever');
  let r = press(g, grind);
  assert.deepEqual(sfxNames(r.effects), ['loan', 'reelStart']);
  assert.deepEqual(says(r.effects), ['ch1.bark.loan.1']);
  assert.deepEqual(r.game.econ, paySpin(takeLoan(g.econ, true)));
  assert.equal(r.game.econ.hatsRefused, 1, 'the book knows the hat was going round');
  assert.deepEqual([r.game.econ.loansTaken, r.game.econ.debt, r.game.econ.marks], [1, LOAN.owed, g.econ.marks + LOAN.marks - SPIN_COST]);
  assert.deepEqual(syms(r.game), expected.result.reels);
  assert.equal(r.game.econ.aidUsed, 0, 'the gift was not taken');
  assert.equal(r.game.econ.trustEarned, 0);

  // the hat does not come round while the reels turn; if the pull pays no writ it starts again
  r = ticks(r.game, seconds(REEL_STOPS[2]) - 10, false, grind);
  assert.equal(r.game.econ.aidUsed, 0);
  r = waitUntil(r.game, (x) => x.phys.balls.length > 0, grind);
  assert.equal(r.game.econ.aidUsed, expected.result.payout.writs > 0 ? 0 : 1);
  assert.equal(r.game.econ.loansTaken, 1);
});

// ───────────────────────── load ─────────────────────────

test('load: restores the start of the saved scene, at the table, from any mode', () => {
  const econ = {
    ...initEcon(), score: 4321, marks: 77.5, writs: 2, debt: 120, trust: 55, aidUsed: 1, spins: 9,
    trustEarned: 140, loansTaken: 3, hatsRefused: 1,
  };
  const save = { v: 2, chapter: 0, scene: 1, econ, seed: 99 };
  const midCine = sendAll(init(1), [CONFIRM, CONFIRM]).game;
  assert.equal(midCine.mode, 'cine');
  let r = send(midCine, { type: 'load', save });
  assert.equal(r.game.mode, 'play');
  assert.deepEqual([r.game.chapter, r.game.scene], [0, 1]);
  assert.deepEqual(r.game.econ, econ);
  assert.deepEqual([r.game.hits, r.game.seq, r.game.cine], [{}, 0, null]);
  assert.deepEqual(r.game.phys.balls, []);
  assert.deepEqual(r.game.rng, seed(99));
  assert.deepEqual(r.game.reels, init(1).reels, 'fresh reels');
  assert.equal(r.game.spunThisChapter, true, 'past scene 0 the rigged pull is history');
  assert.deepEqual(r.effects, [{ type: 'hush' }, { type: 'music', mood: 'tense' }]);
  assert.deepEqual(toSave(r.game), { ...save, v: 4, reels: FRESH_SAVED, ending: null }, 'a loaded v:2 game saves back as v:4, with its reels and no reading of the ledger');

  // the writs bring a ball, and the scene's briefing is spoken again when it is launched
  r = playUntil(r.game, (x, fx) => count(fx, 'launch') >= 1);
  assert.deepEqual(says(r.effects), ['ch1.s2.b1', 'ch1.s2.b2']);

  // a scene-0 save still has the chapter's rigged pull ahead of it
  r = send(init(1), { type: 'load', save: { ...save, scene: 0, econ: initEcon() } });
  assert.equal(r.game.spunThisChapter, false);
  r = ticks(r.game, seconds(LEVER_DELAY) + 2);
  assert.equal(leverStatus(content, r.game), 'free');
  assert.deepEqual(syms(press(r.game).game), RIGGED.reels);
});

test('load: a v:1 save, written at the slot screen that no longer exists, loads into play', () => {
  const econ = { ...initEcon(), score: 900, marks: 12, writs: 1, debt: 300, trust: 25, aidUsed: 0, spins: 4, trustEarned: 25, loansTaken: 1, hatsRefused: 0 };
  const old = deepFreeze({ v: 1, chapter: 1, scene: 0, econ, seed: 4 });
  const r = send(init(1), { type: 'load', save: old });
  assert.equal(r.game.mode, 'play');
  assert.deepEqual([r.game.chapter, r.game.scene], [1, 0]);
  assert.deepEqual(r.game.econ, econ);
  assert.deepEqual(toSave(r.game), { ...old, v: 4, reels: FRESH_SAVED, ending: null }, 'and is written back as v:4');
  assert.equal(send(r.game, tickMsg()).game.phys.balls.length, 1, 'its writ brings a ball');
});

test('load: a save written by the game round-trips', () => {
  const toTable = sendAll(init(5), [CONFIRM, CONFIRM, SKIP]);
  const [save] = saves(toTable.effects);
  assert.equal(save.v, 4);
  assert.equal(save.ending, null);
  const r = send(init(123), { type: 'load', save: JSON.parse(JSON.stringify(save)) });
  assert.deepEqual(toSave(r.game), save);
  assert.equal(r.game.mode, 'play');
});

test('load: a save from before the lifetime totals starts them at zero', () => {
  const old = { v: 1, chapter: 0, scene: 1, seed: 4, econ: { score: 900, marks: 12, writs: 0, debt: 300, trust: 0, aidUsed: 0, spins: 4 } };
  let r = send(init(1), { type: 'load', save: deepFreeze(JSON.parse(JSON.stringify(old))) });
  assert.deepEqual(r.game.econ, { ...old.econ, trustEarned: 0, loansTaken: 0, hatsRefused: 0 });
  assert.deepEqual(toSave(r.game).econ, { ...old.econ, trustEarned: 0, loansTaken: 0, hatsRefused: 0 }, 'and saves them from then on');
  // the loaded book works: this player is broke, borrows, and the loan is counted
  r = press(ticks(r.game, seconds(LEVER_DELAY) + 2).game);
  assert.deepEqual([r.game.econ.loansTaken, r.game.econ.hatsRefused], [1, 0], 'no trust, no hat: nothing was refused');
  assert.equal(r.game.econ.debt, 300 + LOAN.owed);

  // a total that is there but is not a number is a broken save, not an old one
  const bad = { ...old, econ: { ...old.econ, marks: 0, trustEarned: 'lots', loansTaken: 0 } };
  const loaded = update(content, init(1), { type: 'load', save: bad }).game;
  assert.throws(() => update(content, loaded, tickMsg()), /econ\.trustEarned must be a finite number, got lots/);
  assert.throws(() => update(content, init(1), { type: 'load', save: { ...old, econ: null } }), /save has no econ: null/);
});

test('totals: trust and aid reset with the chapter, trustEarned and loansTaken never do', () => {
  // end of chapter one's last cutscene, with a book that has history in it
  const econ = { trust: 80, aidUsed: 2, trustEarned: 80, loansTaken: 3, debt: 900, writs: 1 };
  let r = playUntil(playAt(0, 1, econ), (x) => x.mode === 'cine');
  r = sendAll(r.game, [SKIP, SKIP]);                     // cutscene, epilogue
  assert.equal(r.game.mode, 'card');
  assert.equal(r.game.chapter, 1);
  assert.deepEqual(
    [r.game.econ.trust, r.game.econ.aidUsed, r.game.econ.trustEarned, r.game.econ.loansTaken],
    [0, 0, 80, 3],
  );
  // and the save written as the next chapter's table opens carries them
  r = send(r.game, CONFIRM);
  const [save] = saves(r.effects);
  assert.deepEqual([save.chapter, save.econ.trustEarned, save.econ.loansTaken], [1, 80, 3]);
  // chapter two's scene pays 10 trust: the meter restarts, the total goes on
  r = playUntil({ ...r.game, econ: { ...r.game.econ, writs: 1 } }, (x) => x.mode === 'cine');
  assert.deepEqual([r.game.econ.trust, r.game.econ.trustEarned, r.game.econ.loansTaken], [10, 90, 3]);
});

test('load: refuses a save it cannot honour', () => {
  const save = { v: 2, chapter: 0, scene: 0, econ: initEcon(), seed: 1 };
  const load = (s) => () => update(content, init(1), { type: 'load', save: s });
  assert.throws(load({ ...save, v: 5 }), /save version 5/);
  assert.throws(load({ ...save, v: 3 }), /bad reels \(not an object\)/, 'a v:3 save must carry its reels');
  assert.throws(load({ ...save, v: 4 }), /bad reels \(not an object\)/, 'and a v:4');
  assert.throws(load({ ...save, v: undefined }), /save version undefined/);
  assert.throws(load({ ...save, chapter: 9 }), /chapter index 9/);
  assert.throws(load({ ...save, scene: 2 }), /scene index 2/);
});

test('save: the reels are kept: what they show, whether the shots are lit, and the charge', () => {
  const econ = { ...initEcon(), writs: 2 };
  const reels = {
    cells: [{ sym: 'coin', spin: 0 }, { sym: null, spin: 0 }, { sym: 'orb', spin: 0.25 }],
    source: 'lanes', armed: false, charge: 17,
  };
  const save = deepFreeze({ v: 3, chapter: 0, scene: 1, econ, seed: 8, reels });
  let r = send(init(1), { type: 'load', save });
  assert.equal(r.game.mode, 'play');
  assert.deepEqual(r.game.reels, { ...init(1).reels, ...reels, need: REELS_NEED }, 'the reels as saved, in an open phase');
  // (a v:3 save, as players have them stored today: it comes back as v:4 with nothing else changed)
  const again = { ...save, v: 4, ending: null };
  assert.deepEqual(toSave(r.game), again, 'and they save back unchanged');
  assert.deepEqual(JSON.parse(JSON.stringify(toSave(r.game))), again, 'through JSON too');
  assert.deepEqual(toSave(send(init(1), { type: 'load', save: again }).game), again, 'and a v:4 save round-trips');
  // the turning reel runs down and locks on what it was already going to show; nothing pays on two reels
  r = ticks(r.game, seconds(0.25) + 2);
  assert.deepEqual(r.game.reels.cells, [{ sym: 'coin', spin: 0 }, { sym: null, spin: 0 }, { sym: 'orb', spin: 0 }]);
  assert.equal(r.game.reels.phase, 'open');
  assert.equal(r.game.reels.charge, 17);
});

test('save: a line that has just paid is saved as cleared, and unlit reels stay unlit', () => {
  const g = { ...playAt(0, 1), reels: {
    cells: [{ sym: 'coin', spin: 0 }, { sym: 'coin', spin: 0 }, { sym: 'scale', spin: 0 }],
    phase: 'paying', t: 0.4, result: { reels: ['coin', 'coin', 'scale'], payout: { writs: 0, marks: 12, boon: null, name: 'x', blurb: 'y' } },
    source: 'shot', armed: false, charge: 3, need: REELS_NEED,
  } };
  const save = toSave(g);
  assert.deepEqual(save.reels, { cells: EMPTY, source: null, armed: false, charge: 3 });
  const back = send(init(1), { type: 'load', save: JSON.parse(JSON.stringify(save)) }).game;
  assert.deepEqual([back.reels.armed, back.reels.charge, back.reels.phase, back.reels.result], [false, 3, 'open', null]);
});

test('save: a full spin under way when the scene was cleared finishes and pays after a load', () => {
  const reels = { cells: [{ sym: 'crown', spin: 0 }, { sym: 'crown', spin: 0.1 }, { sym: 'crown', spin: 0.5 }], source: 'shot', armed: false, charge: 0 };
  const save = { v: 3, chapter: 0, scene: 1, econ: { ...initEcon(), writs: 1 }, seed: 2, reels };
  let r = send(init(1), { type: 'load', save });
  const before = r.game.econ.marks;
  r = playUntil(r.game, (x) => x.reels.phase === 'paying');
  assert.equal(r.game.reels.result.payout.name, 'Three Crowns: The Mint Pays Out');
  assert.ok(r.game.econ.marks > before);
});

test('save: reels this build cannot honour are refused or repaired, never played', () => {
  const ok = { cells: EMPTY, source: null, armed: false, charge: 5 };
  const save = { v: 3, chapter: 0, scene: 0, econ: initEcon(), seed: 1, reels: ok };
  const load = (reels) => () => update(content, init(1), { type: 'load', save: { ...save, reels } });
  assert.equal(load(ok)().game.reels.charge, 5);
  assert.throws(load(null), /bad reels \(not an object\)/);
  assert.throws(load({ ...ok, cells: [EMPTY[0], EMPTY[1]] }), /cells must be three/);
  assert.throws(load({ ...ok, armed: 1 }), /armed must be true or false/);
  assert.throws(load({ ...ok, charge: -1 }), /charge must be a whole number/);
  assert.throws(load({ ...ok, charge: 2.5 }), /charge must be a whole number/);
  assert.throws(load({ ...ok, source: 'luck' }), /unknown source/);
  assert.throws(load({ ...ok, source: 'lanes', cells: [{ sym: 'anchor', spin: 0 }, EMPTY[1], EMPTY[2]] }), /unknown symbol "anchor"/);
  assert.throws(load({ ...ok, source: 'lanes', cells: [{ sym: 'coin', spin: 99 }, EMPTY[1], EMPTY[2]] }), /cannot have 99 seconds/);
  assert.throws(load({ ...ok, cells: [{ sym: null, spin: 0.2 }, EMPTY[1], EMPTY[2]] }), /turning toward nothing/);
  assert.throws(load({ ...ok, cells: [{ sym: 'coin', spin: 0 }, EMPTY[1], EMPTY[2]] }), /need a source/);
  // a charge at or past the need (REELS_NEED was retuned downward since the save) is lit
  const lit = load({ ...ok, charge: REELS_NEED + 10 })().game.reels;
  assert.deepEqual([lit.armed, lit.charge, lit.need], [true, REELS_NEED, REELS_NEED]);
  // three locked reels with nothing turning would never settle: they are cleared
  const stuck = load({ ...ok, source: 'lanes', cells: [{ sym: 'coin', spin: 0 }, { sym: 'coin', spin: 0 }, { sym: 'coin', spin: 0 }] })().game.reels;
  assert.deepEqual([stuck.cells, stuck.source], [EMPTY, null]);
});

test('spotting, on the real table: a second hit on a lit lantern lights its neighbour, and the bank can be finished on one target', () => {
  // chapter one, scene one: light lanterns A, B and C (standup targets, one bank)
  const scene0 = shipped.chapters[0].scenes[0];
  assert.deepEqual(scene0.objective, { kind: 'all', ids: ['lanternA', 'lanternB', 'lanternC'] });
  const table = shipped.tables[shipped.chapters[0].tableId];
  const B = table.targets.find((t) => t.id === 'lanternB');
  const mid = [(B.a[0] + B.b[0]) / 2, (B.a[1] + B.b[1]) / 2];
  const len = Math.hypot(B.b[0] - B.a[0], B.b[1] - B.a[1]);
  // a ball thrown at the middle of lantern B from 30 units off its face, on whichever side is open
  const nrm = [-(B.b[1] - B.a[1]) / len, (B.b[0] - B.a[0]) / len];
  const throwAt = (g, side) => ({ ...g, barkCool: QUIET, phys: { ...g.phys, balls: [{ id: 900 + g.phys.nextBallId, pos: [mid[0] + nrm[0] * 30 * side, mid[1] + nrm[1] * 30 * side], vel: [-nrm[0] * 500 * side, -nrm[1] * 500 * side], state: 'live', inside: [] }] } });
  const g = playAt(0, 0, { writs: 0 }, shipped);
  const lit = (x) => Object.keys(x.hits).filter((k) => x.hits[k] > 0).sort();
  const hitB = (from) => {
    for (const side of [1, -1]) {
      let r;
      try { r = playUntil(throwAt(from, side), (x, fx) => count(fx, 'target') > 0 || x.mode !== 'play', shipped, 60); } catch { continue; }
      if (count(r.effects, 'target') === 1) return r;
    }
    throw new Error('the thrown ball did not reach lantern B from either side');
  };
  let r = hitB(g);
  assert.deepEqual(lit(r.game), ['lanternB'], 'the first hit lights B itself');
  r = hitB(r.game);
  assert.deepEqual(lit(r.game), ['lanternA', 'lanternB'], 'the second, on B again, is passed down the bank');
  assert.equal(count(r.effects, 'objective'), 1, 'and sounds as progress');
  r = hitB(r.game);
  assert.equal(r.game.mode, 'cine', 'the third finishes the bank and the scene');
});

// ───────────────────────── the reels on the table ─────────────────────────

test('lanes: each top lane fills its own reel from its own strip, and three locked reels pay the lean table', () => {
  const c = grindOn('lanes');
  const g = { ...playAt(0, 0, { writs: 1 }, c), barkCool: QUIET, briefed: true };
  const d1 = drawSym(g.rng, 0), d2 = drawSym(d1.rng, 1), d3 = drawSym(d2.rng, 2);
  const line = [d1.sym, d2.sym, d3.sym];
  line.forEach((sym, i) => assert.ok(REEL_STRIPS[i].includes(sym)));

  // the first lane: reel 0 turns, already decided, and the others are still empty
  let r = playUntil(g, (x, fx) => count(fx, 'rollover') >= 1, c);
  assert.deepEqual(syms(r.game), [d1.sym, null, null]);
  assert.ok(Math.abs(r.game.reels.cells[0].spin - FILL_SECONDS) < 1e-9);
  assert.deepEqual([r.game.reels.source, r.game.reels.phase], ['lanes', 'open']);
  assert.equal(count(r.effects, 'reelStart'), 0, 'reelStart is for all three at once');
  const e0 = [150, 150, 150].reduce((e, p) => awardPoints(e, p), spendWrit(g.econ));

  // all three, then the line pays: marks, points and boons, not the lever's writs
  r = playUntil(r.game, (x) => x.reels.phase === 'paying', c);
  const payout = payoutFor(line, 'lanes');
  assert.deepEqual(r.game.reels.result, { reels: line, payout });
  assert.deepEqual(r.game.rng, d3.rng, 'three draws and nothing else');
  assert.equal(count(r.effects, 'reelStop'), 3);
  assert.equal(count(r.effects, 'rollover'), 2);
  // (three lanes and one objective step are a chain of 5: combo level 1, no bonus; a payout's points are never multiplied)
  assert.deepEqual(r.game.econ, applyPayout(e0, payout));
  assert.ok(r.game.toasts.some((t) => t.text === payout.name));
  assert.equal(r.game.reels.armed, true, 'a line from the lanes does not spend the lit shots');
  assert.equal(r.game.spunThisChapter, true);
  console.log(`lanes fixture, seed 3: ${line.join(' ')} paid "${payout.name}" (${payout.writs} writs, ${payout.marks} marks, ${payout.points} points, ${payout.boon})`);

  // the ball comes back down through lane 3 while the line is still up: the line gives way
  // at once and reel 2 is drawn again
  const d4 = drawSym(r.game.rng, 2);
  r = playUntil(r.game, (x, fx) => count(fx, 'rollover') >= 1, c);
  assert.ok(r.ticks * STEP < PAY_SECONDS, `the ball was back in ${(r.ticks * STEP).toFixed(2)} s`);
  assert.deepEqual(syms(r.game), [null, null, d4.sym]);
  assert.deepEqual([r.game.reels.phase, r.game.reels.result, r.game.reels.source], ['open', null, 'lanes']);

  // down through 2 and 1 and out: with no ball and no writ the table waits for the reels
  // rather than passing the hat or offering the lever, because the line may pay a writ
  r = playUntil(r.game, (x) => x.phys.balls.length === 0, c);
  if (r.game.econ.writs === 0) assert.equal(leverStatus(c, r.game), 'wait');
  r = waitUntil(r.game, (x) => x.reels.phase === 'paying', c);
  assert.equal(r.game.reels.source, 'lanes');
  assert.deepEqual(r.game.reels.result.payout, payoutFor(r.game.reels.result.reels, 'lanes'));

  // left alone, a paid line clears after PAY_SECONDS
  r = ticks(r.game, seconds(PAY_SECONDS) - 5, false, c);
  assert.equal(r.game.reels.phase, 'paying');
  r = ticks(r.game, 10, false, c);
  assert.deepEqual([r.game.reels.cells, r.game.reels.phase, r.game.reels.result, r.game.reels.source], [EMPTY, 'open', null, null]);
});

test('lanes: a lane rolled again re-draws its reel; while all three spin together the lanes do nothing', () => {
  const c = grindOn('lanes');
  const base = { ...playAt(0, 0, { writs: 1 }, c), barkCool: QUIET, briefed: true };

  // reel 0 already locked on a symbol: lane 1 draws it afresh
  const locked = { ...base, reels: { ...base.reels, source: 'lanes', cells: [{ sym: 'tide', spin: 0 }, ...EMPTY.slice(1)] } };
  let r = playUntil(locked, (x, fx) => count(fx, 'rollover') >= 1, c);
  assert.deepEqual(r.game.reels.cells[0], { sym: drawSym(base.rng, 0).sym, spin: FILL_SECONDS });
  assert.notDeepEqual(r.game.rng, base.rng);

  // a full spin under way: three lanes rolled, nothing re-drawn, no rng spent
  const spinning = { ...base, reels: { ...base.reels, source: 'shot', cells: ['coin', 'coin', 'coin'].map((sym) => ({ sym, spin: 9 })) } };
  r = playUntil(spinning, (x, fx) => count(fx, 'rollover') >= 3, c);
  assert.deepEqual(syms(r.game), ['coin', 'coin', 'coin']);
  assert.deepEqual(r.game.rng, base.rng);
  assert.equal(r.game.reels.source, 'shot');
});

test('shot: a lit spin element spins all three and spends the light; bumpers, slings and targets relight it', () => {
  const c = grindOn('shot');
  const g = { ...playAt(0, 0, { writs: 1 }, c), barkCool: QUIET, briefed: true };
  assert.deepEqual(spinIds(c, g), ['gate']);
  const expected = spin(g.rng, 'shot');

  let r = playUntil(g, (x, fx) => count(fx, 'shot') >= 1, c);
  assert.deepEqual(syms(r.game), expected.result.reels);
  assert.deepEqual(r.game.reels.cells.map((x) => x.spin), REEL_STOPS);
  assert.deepEqual([r.game.reels.source, r.game.reels.armed, r.game.reels.charge], ['shot', false, 0]);
  assert.equal(count(r.effects, 'reelStart'), 1);
  assert.deepEqual(r.game.rng, expected.rng);
  assert.deepEqual(spinIds(c, r.game), [], 'nothing is lit now');

  // the ceiling is a target: one toward the next light
  r = playUntil(r.game, (x, fx) => count(fx, 'target') >= 1, c);
  assert.deepEqual([r.game.reels.armed, r.game.reels.charge, r.game.reels.need], [false, 1, REELS_NEED]);

  // the line pays from the lean table, as a shot
  r = waitUntil(r.game, (x) => x.reels.phase === 'paying', c);
  assert.deepEqual(r.game.reels.result, { reels: expected.result.reels, payout: payoutFor(expected.result.reels, 'shot') });
  assert.deepEqual(r.game.reels.result.payout, payoutFor(expected.result.reels, 'lanes'), 'the same table as the lanes');
  assert.equal(r.game.reels.armed, false);

  // unlit, the same shot is only a shot
  const dark = { ...g, reels: { ...g.reels, armed: false, charge: REELS_NEED - 1 } };
  r = playUntil(dark, (x, fx) => count(fx, 'shot') >= 1, c);
  assert.deepEqual(r.game.reels.cells, EMPTY);
  assert.deepEqual(r.game.rng, g.rng);
  // and the hit that completes the charge lights it, with a toast and a sound
  r = playUntil(r.game, (x, fx) => count(fx, 'target') >= 1, c);
  assert.deepEqual([r.game.reels.armed, r.game.reels.charge], [true, REELS_NEED]);
  assert.deepEqual(toastKinds(r.game), ['hint']);
  assert.equal(count(r.effects, 'confirm'), 1);
  assert.deepEqual(spinIds(c, r.game), ['gate']);
  // lit, further hits add nothing
  const lit = send({ ...r.game, reels: { ...r.game.reels } }, tickMsg(), c).game;
  assert.equal(lit.reels.charge, REELS_NEED);
});

test('saucer: a lit saucer spins the reels and holds the ball until the last one is down', () => {
  const c = grindOn('saucer');
  const g = { ...playAt(0, 0, { writs: 1 }, c), barkCool: QUIET, briefed: true };

  let r = playUntil(g, (x, fx) => count(fx, 'saucer') >= 1, c);
  assert.equal(r.game.reels.source, 'shot');
  const [ball] = r.game.phys.balls;
  assert.equal(ball.state, 'held');
  assert.ok(ball.heldMs > REEL_STOPS[2] * 1000, `held for ${ball.heldMs} ms, the saucer's own hold is 100`);
  r = waitUntil(r.game, (x) => x.reels.phase === 'paying', c);
  assert.equal(count(r.effects, 'eject'), 0, 'still in the saucer when the line pays');
  assert.equal(r.game.phys.balls[0].state, 'held');
  r = waitUntil(r.game, (x, fx) => count(fx, 'eject') >= 1, c);
  assert.ok(r.ticks * STEP < 0.5, 'and let go just after');

  // unlit: the saucer's own tenth of a second
  const dark = { ...g, reels: { ...g.reels, armed: false, charge: 0 } };
  r = playUntil(dark, (x, fx) => count(fx, 'saucer') >= 1, c);
  assert.ok(r.game.phys.balls[0].heldMs <= 100);
  assert.deepEqual(r.game.reels.cells, EMPTY);
  assert.equal(r.game.reels.charge, 0, 'a saucer is not a bumper');
});

test('payouts: boons, the jackpot and the bust, and the two tables', () => {
  const base = send(playAt(1, 0, { writs: 1 }), tickMsg()).game;   // a ball at the plunger, nothing moving
  const pay = (line, source = 'lanes', game = base) => send(lineUp(game, line, source), tickMsg());

  let r = pay(['gavel', 'gavel', 'coin']);
  assert.deepEqual(r.game.boons, { ballSave: 20, mult: 1, multT: 0, kickback: 0 });
  assert.deepEqual(sfxNames(r.effects), ['reelStop', 'reelStop', 'reelStop', 'payout']);
  assert.deepEqual(toastKinds(r.game), ['payout']);
  assert.deepEqual(says(r.effects), [], 'an ordinary payout has no bark');
  assert.equal(r.game.econ.writs, 1, 'no writ from a pair of gavels in play');

  // a kickback, and a second, and no third
  r = pay(['scale', 'tide', 'scale']);
  assert.equal(r.game.boons.kickback, 1);
  r = pay(['scale', 'scale', 'orb'], 'shot', r.game);
  assert.equal(r.game.boons.kickback, 2);
  assert.equal(pay(['scale', 'scale', 'scale'], 'lanes', r.game).game.boons.kickback, 2);

  // three of a kind is the jackpot
  r = pay(['coin', 'coin', 'coin']);
  assert.deepEqual([r.game.boons.mult, r.game.boons.multT], [2, 30]);
  assert.ok(sfxNames(r.effects).includes('jackpot'));
  assert.ok(r.effects.some((e) => e.type === 'flash'));
  assert.deepEqual(says(r.effects), ['ch2.bark.jackpot.1']);
  assert.equal(r.game.econ.writs, 2);
  assert.equal(pay(['orb', 'orb', 'orb']).game.multiQueue, 2);

  // nothing at all is the bust
  r = pay(['tide', 'tide', 'tide']);
  assert.ok(sfxNames(r.effects).includes('bust'));
  assert.deepEqual(says(r.effects), ['ch2.bark.bust.1']);
  assert.deepEqual(r.game.econ, base.econ);
  assert.deepEqual(toastKinds(r.game), ['bust']);

  // points in a payout are score, and marks at the going multiplier
  r = pay(['coin', 'coin', 'gavel'], 'lanes', { ...base, boons: { ...base.boons, mult: 2, multT: 30 } });
  assert.equal(r.game.econ.score, 2000);
  assert.ok(Math.abs(r.game.econ.marks - (base.econ.marks + 12 + 4)) < 1e-9, `marks ${r.game.econ.marks}`);

  // the same line off the lever pays the hall's table
  r = pay(['coin', 'coin', 'gavel'], 'lever');
  assert.deepEqual(r.game.reels.result.payout, payoutFor(['coin', 'coin', 'gavel'], 'lever'));
  assert.deepEqual([r.game.econ.writs, r.game.econ.marks], [3, base.econ.marks + 40]);

  // what it does not know, it names
  assert.throws(() => pay(['coin', 'coin', 'coin'], 'tilt'), /unknown source "tilt"/);
  assert.throws(() => send({ ...base, reels: { ...base.reels, phase: 'jammed' } }, tickMsg()), /unknown reels phase "jammed"/);
  const lunch = deepFreeze({
    ...content,
    chapters: [{ ...content.chapters[0], riggedSpin: { reels: RIGGED.reels, payout: { ...RIGGED.payout, boon: 'freeLunch' } } }],
  });
  const first = { ...playAt(0, 0, {}, lunch), spunThisChapter: false };
  assert.throws(() => send(lineUp(first, RIGGED.reels, 'lever'), tickMsg(), lunch), /unknown boon "freeLunch"/);
  const bare = deepFreeze({ ...content, tables: { box: { ...table, reels: undefined } } });
  assert.throws(() => playUntil(playAt(0, 1, { writs: 1 }, bare), (x, fx) => count(fx, 'rollover') >= 1, bare), /table "box" has no reels/);
});

test('kickback: the next ball into an outlane is put in the inlane beside it, once', () => {
  const c = grindOn('gutter');
  const g = { ...playAt(0, 0, { writs: 1 }, c), briefed: true };
  const armed = { ...g, boons: { ...g.boons, kickback: 1 } };

  let r = playUntil(armed, (x) => x.boons.kickback === 0, c);
  assert.equal(count(r.effects, 'drain'), 0);
  assert.equal(count(r.effects, 'eject'), 1);
  const [ball] = r.game.phys.balls;
  assert.deepEqual([ball.state, ball.pos[0]], ['live', 300]);
  assert.ok(ball.pos[1] < 400 && ball.vel[1] > 0, `set down above the inlane rollover, falling: ${ball.pos} ${ball.vel}`);
  assert.ok(r.game.toasts.some((t) => t.kind === 'save' && t.text === 'Kicked back.'));
  assert.equal(r.game.freeBalls, 0, 'it is the same ball, not a new one');
  r = playUntil(r.game, (x, fx) => count(fx, 'rollover') >= 1, c);
  assert.equal(r.game.phys.balls.length, 1, 'and it rolls through the inlane');

  // without one the outlane is the outlane
  r = playUntil(g, emptyTable, c);
  assert.equal(count(r.effects, 'eject'), 0);
  assert.equal(count(r.effects, 'drain'), 1);

  const lopsided = deepFreeze({ ...c, tables: { gutter: { ...tables.gutter, rollovers: tables.gutter.rollovers.filter((x) => x.id !== 'inL') } } });
  assert.throws(() => playUntil(armed, (x) => x.boons.kickback === 0, lopsided), /table "gutter" has outlane outL but no inlane inL/);
});

// ───────────────────────── balls, saves and boons ─────────────────────────

test('ball save: a drained ball comes back free; without it the next ball costs a writ', () => {
  const g = { ...playAt(0, 0, { writs: 2 }, grind), boons: { ballSave: 600, mult: 1, multT: 0, kickback: 0 } };
  let r = playUntil(g, (x, fx) => count(fx, 'drain') >= 1, grind);
  assert.equal(r.game.mode, 'play');
  assert.equal(r.game.econ.writs, 1, 'one writ spent on the first launch');
  assert.equal(r.game.freeBalls, 1);
  assert.equal(r.game.phys.balls.length, 1);
  assert.equal(r.game.phys.balls[0].state, 'plunger');
  assert.ok(toastKinds(r.game).includes('save'));
  assert.ok(says(r.effects).includes('ch1.bark.save.1'));

  // relaunching the saved ball is free
  r = playUntil(r.game, (x, fx) => count(fx, 'launch') >= 1, grind);
  assert.equal(r.game.econ.writs, 1);
  assert.equal(r.game.freeBalls, 0);

  // save expired: the drain is final, and the next ball is on the remaining writ
  r = playUntil({ ...r.game, boons: { ballSave: 0, mult: 1, multT: 0, kickback: 0 } }, (x, fx) => count(fx, 'launch') >= 1, grind);
  assert.equal(count(r.effects, 'drain'), 1);
  assert.deepEqual(says(r.effects).filter((id) => id.includes('save')), []);
  assert.equal(r.game.econ.writs, 0);
  r = playUntil(r.game, emptyTable, grind);
  assert.equal(count(r.effects, 'drain'), 1);
});

test('a weak plunge that rolls back to the plunger has already paid its writ', () => {
  const c = grindOn('well');
  let r = send({ ...playAt(0, 0, { writs: 2 }, c), briefed: true }, tickMsg(), c);
  const id = r.game.phys.balls[0].id;
  r = press(r.game, c);
  assert.equal(count(r.effects, 'launch'), 1);
  assert.equal(r.game.econ.writs, 1);
  r = waitUntil(r.game, (x) => x.phys.balls[0].state === 'plunger', c);
  console.log(`well fixture: a one-tick tap came back to rest on the plunger after ${(r.ticks * STEP).toFixed(2)} s`);
  r = press(r.game, c);
  assert.equal(count(r.effects, 'launch'), 1, 'plunged again');
  assert.equal(r.game.phys.balls[0].id, id, 'the same ball');
  assert.equal(r.game.econ.writs, 1, 'for nothing');
  assert.equal(r.game.freeBalls, 0);
});

test('boon clocks run only while a ball is in play, and the multiplier resets', () => {
  const boons = { ballSave: 0.5, mult: 2, multT: 1, kickback: 1 };
  // a ball waiting at the plunger: nothing runs down
  const waiting = { ...send(playAt(1, 0, { writs: 1 }), tickMsg()).game, boons };
  assert.deepEqual(ticks(waiting, 100).game.boons, boons);
  // an empty table: nothing runs down
  assert.deepEqual(ticks({ ...playAt(1, 0), boons }, 30).game.boons, boons);
  // in flight they do
  let r = playUntil({ ...waiting, boons: { ...boons, ballSave: 9, multT: 9 } }, (x, fx) => count(fx, 'launch') >= 1);
  r = ticks({ ...r.game, boons }, 30);
  assert.ok(Math.abs(r.game.boons.ballSave - 0.25) < 1e-9);
  assert.equal(r.game.boons.mult, 2);
  r = ticks(r.game, 100);
  assert.deepEqual(r.game.boons, { ballSave: 0, mult: 1, multT: 0, kickback: 1 });
});

test('double marks: points earn twice the marks, score is unchanged', () => {
  const g = { ...playAt(1, 0, { writs: 1 }), boons: { ballSave: 0, mult: 2, multT: 30, kickback: 0 } };
  const r = playUntil(g, (x, fx) => count(fx, 'rollover') >= 1);
  assert.equal(r.game.econ.score, 150);
  assert.ok(Math.abs(r.game.econ.marks - (g.econ.marks + 0.3)) < 1e-9, `marks ${r.game.econ.marks}`);
});

test('multiball: two extra live balls join after the launch, for one writ', () => {
  const g = { ...playAt(0, 0, { writs: 1 }, grind), multiQueue: 2 };
  assert.equal(ticks(g, 300, false, grind).game.multiQueue, 2, 'nothing is fed while the ball waits on the plunger');
  let most = 0;
  const r = playUntil(g, (x) => {
    most = Math.max(most, x.phys.balls.filter((b) => b.state === 'live').length);
    return emptyTable(x);
  }, grind);
  assert.equal(r.game.multiQueue, 0);
  assert.equal(count(r.effects, 'launch'), 3, 'one plunger launch and two fed balls');
  assert.equal(count(r.effects, 'drain'), 3);
  assert.equal(r.game.econ.writs, 0);
  assert.equal(most, 3);
});

// ───────────────────────── housekeeping ─────────────────────────

test('toasts age out after three seconds; time advances in every mode', () => {
  const g = press(atLever(0, 1, { marks: 0 })).game;     // a loan: one toast
  assert.equal(g.toasts.length, 1);
  const t0 = g.t;
  let r = ticks(g, 350);
  assert.equal(r.game.toasts.length, 1);
  assert.ok(Math.abs(r.game.t - t0 - 350 * STEP) < 1e-9);
  r = ticks(r.game, 20);
  assert.deepEqual(r.game.toasts, []);
  const card = send(init(1), CONFIRM).game;
  assert.ok(Math.abs(ticks(card, 60).game.modeT - 0.5) < 1e-9);
});

test('barks are rate limited, and the briefing takes the place of the first launch bark', () => {
  // briefing already heard: the launch speaks, and starts the cooldown
  const g = { ...playAt(1, 0, { writs: 2 }), barkCool: 0, briefed: true };
  const r = playUntil(g, (x, fx) => count(fx, 'launch') >= 1);
  assert.deepEqual(says(r.effects), ['ch2.bark.launch.1']);
  assert.ok(r.game.barkCool > 7);
  const again = playUntil({ ...r.game, boons: { ballSave: 600, mult: 1, multT: 0, kickback: 0 }, barkCool: 600 },
    (x, fx) => count(fx, 'launch') >= 1 || x.mode !== 'play');
  assert.deepEqual(says(again.effects).filter((s) => s.includes('launch') || s.includes('drain')), []);

  // briefing not yet heard: it is spoken at the launch and nothing talks over it
  const fresh = playUntil({ ...g, briefed: false }, (x, fx) => count(fx, 'launch') >= 1);
  assert.deepEqual(says(fresh.effects), ['ch2.s1.b1']);
  assert.ok(fresh.game.barkCool > lineSeconds(content.chapters[1].scenes[0].briefing[0]));
});

test('barks wait until their speaker has been in a cinematic, and until minScene', () => {
  const withBarks = (launch, chapter = 0) => deepFreeze({
    ...content,
    chapters: content.chapters.map((ch, i) => (i === chapter ? { ...ch, barks: { ...ch.barks, launch } } : ch)),
  });
  const launchFrom = (c, chapter, scene, seedN) => {
    const g = { ...playAt(chapter, scene, { writs: 1 }, c), barkCool: 0, briefed: true, rng: seed(seedN) };
    return playUntil(g, (x, fx) => count(fx, 'launch') >= 1, c);
  };

  // Nan is first seen in the cutscene that ends scene one. Before it: silence, and neither
  // rng nor cooldown is spent. After it she speaks, with no minScene to say so.
  const nan = withBarks([L('ch1.bark.launch.nan', 'nan', 'Off it goes, bless it.')]);
  let r = launchFrom(nan, 0, 0, 11);
  assert.deepEqual(says(r.effects), []);
  assert.deepEqual(r.game.rng, seed(11));
  assert.equal(r.game.barkCool, 0);
  r = launchFrom(nan, 0, 1, 11);
  assert.deepEqual(says(r.effects), ['ch1.bark.launch.nan']);
  assert.ok(r.game.barkCool > 7);

  // Tobb is in no cinematic at all: never. Ilse is met at the end of chapter one: in chapter two, at once.
  const tobb = withBarks([L('ch1.bark.launch.tobb', 'tobb', "I'd take evens.")]);
  assert.deepEqual(says(launchFrom(tobb, 0, 1, 11).effects), []);
  const ilse1 = withBarks([L('ch1.bark.launch.ilse', 'ilse', 'Let it be entered.')]);
  assert.deepEqual(says(launchFrom(ilse1, 0, 1, 11).effects), [], 'her scene is being played, not over');
  const ilse2 = withBarks([L('ch2.bark.launch.ilse', 'ilse', 'Let it be entered.')], 1);
  assert.deepEqual(says(launchFrom(ilse2, 1, 0, 11).effects), ['ch2.bark.launch.ilse']);
  // Sable appears only in chapter two's epilogue, which is after everything
  const sable = withBarks([L('ch2.bark.launch.sable', 'sable', 'Go on, little brother.')], 1);
  assert.deepEqual(says(launchFrom(sable, 1, 0, 11).effects), []);

  // minScene still applies on top: Ren has been met from the prologue, but this line waits
  const late = L('ch1.bark.launch.late', 'ren', 'Weight away, again.', { minScene: 1 });
  assert.deepEqual(says(launchFrom(withBarks([late]), 0, 0, 11).effects), []);
  assert.deepEqual(says(launchFrom(withBarks([late]), 0, 1, 11).effects), ['ch1.bark.launch.late']);

  // among others an unmet speaker is never drawn, and is drawn sometimes once met
  const mixed = withBarks([content.chapters[0].barks.launch[0], nan.chapters[0].barks.launch[0]]);
  const heard = (scene) => {
    const tally = {};
    for (let s = 1; s <= 40; s++) for (const id of says(launchFrom(mixed, 0, scene, s).effects)) tally[id] = (tally[id] || 0) + 1;
    return tally;
  };
  const early = heard(0);
  assert.deepEqual(early, { 'ch1.bark.launch.1': 40 });
  const after = heard(1);
  assert.equal(after['ch1.bark.launch.1'] + after['ch1.bark.launch.nan'], 40);
  assert.ok(after['ch1.bark.launch.nan'] >= 10 && after['ch1.bark.launch.1'] >= 10, JSON.stringify(after));
  console.log(`unmet speaker over 40 seeds: scene 0 ${JSON.stringify(early)}, scene 1 ${JSON.stringify(after)}`);

  // a forced bark (aid) obeys it too: the aid is given, in silence
  const aidOnly = deepFreeze({
    ...grind,
    chapters: [{ ...grind.chapters[0], barks: { ...grind.chapters[0].barks, aid: [L('ch1.bark.aid.only', 'nan', 'It is yours.')] } }],
  });
  r = ticks(playAt(0, 0, { trust: 30 }, aidOnly), seconds(AID_WAIT) + 5, false, aidOnly);
  assert.equal(r.game.econ.aidUsed, 1, 'the aid is still given');
  assert.deepEqual(says(r.effects), []);
});

test('update throws on what it does not know, naming it', () => {
  const g = init(1);
  assert.throws(() => update(content, g, { type: 'warp' }), /unknown message type "warp"/);
  assert.throws(() => update(content, g, { type: 'toSlot' }), /unknown message type "toSlot"/);
  assert.throws(() => update(content, g, { type: 'toTable' }), /unknown message type "toTable"/);
  assert.throws(() => update(content, { ...g, mode: 'paused' }, CONFIRM), /unknown mode "paused"/);
  assert.throws(() => update(content, { ...g, mode: 'slot' }, CONFIRM), /unknown mode "slot"/);
  assert.throws(() => update(content, g, { type: 'tick', input: IDLE }), /positive dt/);
  assert.throws(() => update(content, playAt(0, 0), { type: 'tick', dt: STEP }), /needs msg\.input/);
  const lost = { ...content, chapters: [{ ...content.chapters[0], tableId: 'atlantis' }] };
  assert.throws(() => update(lost, g, CONFIRM), /unknown table "atlantis"/);
});
