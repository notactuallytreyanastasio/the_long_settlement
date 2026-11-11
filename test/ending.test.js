// The leaning branch: lines that carry `lean`, the moment the ledger is read, the save that
// keeps the reading, and what the end screen is handed. Fixture content only, except the last
// test, which holds the shipped game (however many chapters it has) to the same contract.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { init, update, toSave, SAVE_VERSION, LOADABLE_SAVES } from '../src/core/game.js';
import {
  LEANINGS, spokenLines, heardLines, leaningNow, readsLeaning, endingOf, preloadIds, resolveStage,
} from '../src/core/story.js';
import { STEP } from '../src/core/physics.js';
import { initEcon, leaning, takeLoan, addTrust, TRUST_PER_LOAN } from '../src/core/economy.js';
import { content as shipped } from '../src/content/index.js';

// ───────────────────────── fixture ─────────────────────────
// The box from test/game.test.js: a column the plunger fires a ball up, through r1, r2 and r3.
// Every objective here is "one hit on r1", so each launch clears a scene.

const table = {
  id: 'box', name: 'Box', width: 400, height: 800, gravity: 1000, ballRadius: 8,
  walls: [{ a: [150, 20], b: [250, 20] }, { a: [150, 20], b: [150, 800] }, { a: [250, 20], b: [250, 800] }],
  oneWays: [],
  flippers: [
    { id: 'fl', side: 'left', pivot: [40, 760], length: 40, radius: 5, restAngle: 0.4, activeAngle: -0.5 },
    { id: 'fr', side: 'right', pivot: [360, 760], length: 40, radius: 5, restAngle: Math.PI - 0.4, activeAngle: Math.PI + 0.5 },
  ],
  bumpers: [], slings: [], targets: [],
  rollovers: [{ id: 'r1', pos: [200, 640], r: 10 }, { id: 'r2', pos: [200, 600], r: 10 }, { id: 'r3', pos: [200, 560], r: 10 }],
  shots: [], saucers: [],
  reels: { fill: ['none1', 'none2', 'none3'], spin: [] },
  plunger: { pos: [200, 700], maxSpeed: 1500 },
  drainY: 780,
  theme: { bg: ['#000', '#111'], accent: '#fff', glow: '#fff', motif: 'none' },
  decor: [], labels: {},
};

const L = (id, who, text, extra = {}) => ({ id, who, text, ...extra });
const C = (id, who, text, extra = {}) => L(id, who, text, { ...extra, lean: 'commons' });
const M = (id, who, text, extra = {}) => L(id, who, text, { ...extra, lean: 'mint' });
const scene = (id, extra = {}) => ({
  id, title: `Scene ${id}`, thread: 'duty', hint: 'Roll the low lane',
  objective: { kind: 'count', ids: ['r1'], n: 1 },
  briefing: [L(`${id}.b1`, 'ren', 'Go.')],
  cutscene: [L(`${id}.c01`, 'ren', 'Done.', { bg: 'bench' })],
  reward: { points: 100 },
  ...extra,
});
const barks = (ch) => ({ launch: [L(`${ch}.bark.launch.1`, 'ren', 'Away.')] });

/** A first chapter that is not the last. Its one scene's cutscene and its epilogue branch on the live books. */
const opening = {
  id: 'ch1', number: 1, title: 'One', subtitle: 'first', tableId: 'box',
  prologue: [L('ch1.pro.01', 'narrator', 'It began with a debt.', { bg: 'ledger' })],
  riggedSpin: null,
  scenes: [scene('ch1.s1', {
    cutscene: [
      L('ch1.s1.c01', 'nan', 'Every lantern carries a name.', { bg: 'lantern-stalls' }),
      C('ch1.s1.c02', 'nan', 'Yours is with ours.'),
      M('ch1.s1.c02m', 'nan', 'Yours is in the Mint\'s book.'),
    ],
  })],
  epilogue: [
    L('ch1.epi.01', 'narrator', 'The ferry left at dawn.', { bg: 'ferry-dawn' }),
    C('ch1.epi.02', 'narrator', 'Nobody was owed.'),
    M('ch1.epi.02m', 'narrator', 'Somebody was owed.'),
  ],
  barks: barks('ch1'),
  music: { play: 'tense', cine: 'court' },
};

/**
 * The last chapter as the bible lays it out: scenes 1 and 2 shared, the ledger read when scene 2
 * clears, scene 3's briefing and cutscene and the epilogue in two versions. The two epilogues
 * open on different backdrops and music, and the mint one is a line shorter.
 */
const finale = {
  id: 'ch2', number: 2, title: 'Two', subtitle: 'last', tableId: 'box',
  prologue: [L('ch2.pro.01', 'narrator', 'Three days before Renewal Day.', { bg: 'ledger' })],
  riggedSpin: null,
  scenes: [
    scene('ch2.s1', { reward: { points: 100, trust: 25 } }),
    scene('ch2.s2', { cutscene: [L('ch2.s2.c01', 'ilse', 'The cap goes on.', { bg: 'court', on: ['ilse'] }), L('ch2.s2.c02', 'corvane', 'Eleven minutes.')] }),
    scene('ch2.s3', {
      briefing: [L('ch2.s3.b1', 'ren', 'Climb the mole.'), C('ch2.s3.b2', 'tobb', 'Nobody is running.'), M('ch2.m3.b2', 'tobb', 'They are all running.')],
      cutscene: [
        C('ch2.s3.c01', 'narrator', 'Nobody ran.', { bg: 'shore-dusk', on: ['ilse', 'ren'], music: 'hope' }),
        M('ch2.m3.c01', 'narrator', 'They broke.', { bg: 'pier-riot', on: ['corvane'], music: 'dread' }),
        L('ch2.s3.c02', 'ilse', 'Count them.'),
        C('ch2.s3.c03', 'ren', 'Forty.'),
        M('ch2.m3.c03', 'ren', 'Six.'),
      ],
      reward: { points: 100, trust: 40 },
    }),
  ],
  epilogue: [
    C('ch2.epi.01', 'narrator', 'Carrow, in the morning.', { bg: 'ferry-dawn', music: 'hope' }),
    C('ch2.epi.02', 'ren', 'Ask me now.'),
    M('ch2.mepi.01', 'narrator', 'Carrow, at dusk.', { bg: 'cell', music: 'sorrow' }),
    L('ch2.epi.03', 'narrator', 'The Ledger was hers.'),
  ],
  endings: {
    commons: { title: 'THE LANE HELD', text: 'Forty lights, dim, for twenty-four years.' },
    mint: { title: 'THE SUM', text: 'Twenty-nine lights, bright, for twenty.' },
  },
  barks: barks('ch2'),
  music: { play: 'mine', cine: 'march' },
};

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); }
  return o;
}
const content = deepFreeze({ cast: {}, tables: { box: table }, chapters: [opening, finale] });

// ───────────────────────── driving ─────────────────────────

const IDLE = { left: false, right: false, plunge: false, nudge: null };
const FRESH_REELS = { cells: [{ sym: null, spin: 0 }, { sym: null, spin: 0 }, { sym: null, spin: 0 }], source: null, armed: true, charge: 45 };
const commonsBook = () => ({ ...initEcon(), writs: 30, trustEarned: 200 });
const mintBook = () => ({ ...initEcon(), writs: 30, loansTaken: 4 });
/** A game standing at the table at the start of a scene, with this book. */
const at = (chapter, sceneIndex, econ, c = content) =>
  update(c, init(1), { type: 'load', save: { v: SAVE_VERSION, chapter, scene: sceneIndex, econ, seed: 3, reels: FRESH_REELS, ending: null } }).game;

/** Run until pred(game). Plays the table with the plunger and confirms cinematics line by line. Returns the game and every effect. */
function run(game, pred, c = content) {
  let g = game;
  const effects = [];
  for (let i = 0; i < 60000; i++) {
    if (pred(g)) return { game: g, effects };
    let msg;
    if (g.mode === 'play') msg = { type: 'tick', dt: STEP, input: { ...IDLE, plunge: i % 200 < 150 } };
    else if (g.mode === 'cine' || g.mode === 'card') msg = { type: 'confirm' };
    else throw new Error(`run: nothing to do in mode ${g.mode}`);
    const r = update(c, deepFreeze(g), msg);
    g = r.game;
    effects.push(...r.effects);
  }
  throw new Error(`run: predicate still false (mode ${g.mode}, chapter ${g.chapter}, scene ${g.scene})`);
}
const said = (effects, blocking) => effects.filter((e) => e.type === 'say' && e.blocking === blocking).map((e) => e.line.id);
const moods = (effects) => effects.filter((e) => e.type === 'music').map((e) => e.mood);
const saves = (effects) => effects.filter((e) => e.type === 'save').map((e) => e.save);

// ───────────────────────── the pure helpers ─────────────────────────

test('spokenLines keeps unmarked lines and the lines of one leaning, in order, and refuses anything else in lean', () => {
  const lines = finale.scenes[2].cutscene;
  assert.deepEqual(LEANINGS, ['commons', 'mint']);
  assert.deepEqual(spokenLines(lines, 'commons').map((l) => l.id), ['ch2.s3.c01', 'ch2.s3.c02', 'ch2.s3.c03']);
  assert.deepEqual(spokenLines(lines, 'mint').map((l) => l.id), ['ch2.m3.c01', 'ch2.s3.c02', 'ch2.m3.c03']);
  const plain = finale.scenes[1].cutscene;
  assert.equal(spokenLines(plain, 'mint'), plain, 'nothing dropped: the same array');
  assert.deepEqual(spokenLines([], 'commons'), []);
  // the stage is resolved over the lines played, so each branch has its own backdrop and cast
  assert.deepEqual(resolveStage(spokenLines(lines, 'commons'), 1), { bg: 'shore-dusk', on: ['ilse', 'ren'] });
  assert.deepEqual(resolveStage(spokenLines(lines, 'mint'), 1), { bg: 'pier-riot', on: ['corvane'] });

  assert.throws(() => spokenLines(lines, 'neither'), /spokenLines needs a leaning \(commons or mint\), got "neither"/);
  assert.throws(() => spokenLines(lines, undefined), /got undefined/);
  assert.throws(() => spokenLines([L('x.1', 'ren', 'Hm.', { lean: 'Commons' })], 'mint'), /line x\.1 has lean "Commons"; it must be one of commons, mint or absent/);
  assert.throws(() => spokenLines([L('x.2', 'ren', 'Hm.', { lean: null })], 'mint'), /line x\.2 has lean null/);
  assert.throws(() => spokenLines('ch2', 'mint'), /needs a list of lines/);
});

test('leaningNow is the live ledger until game.ending is set, and the frozen reading after', () => {
  assert.equal(leaningNow({ ending: null, econ: commonsBook() }), 'commons');
  assert.equal(leaningNow({ ending: null, econ: mintBook() }), 'mint');
  assert.equal(leaningNow({ econ: mintBook() }), 'mint', 'a game from before the field existed');
  assert.equal(leaningNow({ ending: 'commons', econ: mintBook() }), 'commons', 'the reading outlives the books');
  assert.equal(leaningNow({ ending: 'mint', econ: commonsBook() }), 'mint');
  assert.throws(() => leaningNow({ ending: 'both', econ: commonsBook() }), /game\.ending is "both"/);
  // heardLines only opens the books when a line asks
  assert.equal(heardLines(finale.prologue, {}), finale.prologue, 'no lean lines: no econ needed');
  assert.throws(() => heardLines(finale.epilogue, {}), /not an Econ/);
  assert.deepEqual(heardLines(finale.epilogue, { ending: 'mint' }).map((l) => l.id), ['ch2.mepi.01', 'ch2.epi.03']);
});

test('readsLeaning: only in the final chapter; at its last scene, or earlier at the scene before the first lean line', () => {
  const read = (c) => c.chapters.map((ch, i) => ch.scenes.map((_, j) => readsLeaning(c, i, j)));
  // ch1 has lean lines and is not the last chapter: never. ch2: scene 3's briefing branches, so scene 2 reads.
  assert.deepEqual(read(content), [[false], [false, true, true]]);
  // lean lines only in the last cutscene and the epilogue (the lead's contract): the last objective reads
  const lastOnly = { ...content, chapters: [opening, { ...finale, scenes: [finale.scenes[0], finale.scenes[1], { ...finale.scenes[2], briefing: [finale.scenes[2].briefing[0]] }] }] };
  assert.deepEqual(read(lastOnly), [[false], [false, false, true]]);
  // a scene whose own cutscene branches reads at that scene
  const own = { ...content, chapters: [opening, { ...finale, scenes: [scene('ch2.s0'), { ...finale.scenes[0], cutscene: finale.scenes[2].cutscene }, finale.scenes[1], scene('ch2.s3')] }] };
  assert.deepEqual(read(own), [[false], [false, true, true, true]]);
  // a lean line in the very first briefing cannot be waited for: the first completion reads
  const first = { ...content, chapters: [{ ...finale, scenes: [{ ...scene('ch2.s1'), briefing: finale.scenes[2].briefing }, scene('ch2.s2'), scene('ch2.s3')] }] };
  assert.deepEqual(read(first), [[true, true, true]]);
  // no lean lines anywhere: still read once, at the last objective, so the end screen has a reading
  const none = { ...content, chapters: [{ ...opening, scenes: [scene('ch1.s1'), scene('ch1.s2')] }] };
  assert.deepEqual(read(none), [[false, true]]);
  // a lean line in the last chapter's prologue or epilogue alone moves nothing
  assert.deepEqual(read({ ...content, chapters: [{ ...finale, scenes: [scene('ch2.s1'), scene('ch2.s2')] }] }), [[false, true]]);
  assert.throws(() => readsLeaning(content, 2, 0), /no chapter at index 2/);
  assert.throws(() => readsLeaning(content, 1, 3), /chapter ch2 has no scene at index 3/);
});

test('endingOf: the frozen reading and the last chapter\'s text for it; nulls when the chapter has none', () => {
  assert.deepEqual(endingOf(content, { ending: 'commons', econ: mintBook() }),
    { leaning: 'commons', title: 'THE LANE HELD', text: 'Forty lights, dim, for twenty-four years.' });
  assert.deepEqual(endingOf(content, { ending: 'mint', econ: commonsBook() }),
    { leaning: 'mint', title: 'THE SUM', text: 'Twenty-nine lights, bright, for twenty.' });
  assert.equal(endingOf(content, { ending: null, econ: mintBook() }).title, 'THE SUM', 'never read: the live books');
  const bare = { ...content, chapters: [opening] };
  assert.deepEqual(endingOf(bare, { ending: 'mint', econ: initEcon() }), { leaning: 'mint', title: null, text: null });
  const half = { ...content, chapters: [{ ...finale, endings: { commons: finale.endings.commons } }] };
  assert.equal(endingOf(half, { ending: 'commons' }).title, 'THE LANE HELD');
  assert.throws(() => endingOf(half, { ending: 'mint' }), /chapter ch2 endings\.mint must be \{ title, text \}, got undefined/);
  assert.throws(() => endingOf({ ...content, chapters: [{ ...finale, endings: { commons: { title: 'x' }, mint: finale.endings.mint } }] }, { ending: 'commons' }),
    /endings\.commons must be \{ title, text \}/);
});

// ───────────────────────── through the reducer ─────────────────────────

const ENDING_LINES = {
  commons: ['ch2.s3.c01', 'ch2.s3.c02', 'ch2.s3.c03', 'ch2.epi.01', 'ch2.epi.02', 'ch2.epi.03'],
  mint: ['ch2.m3.c01', 'ch2.s3.c02', 'ch2.m3.c03', 'ch2.mepi.01', 'ch2.epi.03'],
};

for (const [lean, book] of [['commons', commonsBook], ['mint', mintBook]]) {
  test(`a ${lean} book plays the ${lean} ending and no line of the other`, () => {
    let r = run(at(1, 0, book()), (g) => g.scene === 1 && g.mode === 'play');
    assert.equal(r.game.ending, null, 'scene 1 does not read the ledger');
    assert.deepEqual(saves(r.effects).map((s) => s.ending), [null]);

    // scene 2's objective: the reading is taken as the cutscene begins, before any line that needs it
    r = run(r.game, (g) => g.mode === 'cine');
    assert.equal(r.game.ending, lean);
    assert.deepEqual(r.game.cine.lines, finale.scenes[1].cutscene, 'a cutscene with no lean lines is played whole');
    r = run(r.game, (g) => g.mode === 'play');
    assert.deepEqual(saves(r.effects).map((s) => [s.v, s.scene, s.ending]), [[SAVE_VERSION, 2, lean]], 'and it is in the save');

    // scene 3: the briefing, the cutscene and the epilogue are this ending's
    r = run(r.game, (g) => g.mode === 'cine');
    assert.deepEqual(said(r.effects, false).filter((id) => !id.includes('.bark.')), ['ch2.s3.b1', lean === 'commons' ? 'ch2.s3.b2' : 'ch2.m3.b2']);
    assert.deepEqual(r.game.cine.lines.map((l) => l.id), ENDING_LINES[lean].slice(0, 3), 'game.cine.lines is only what will be played');
    assert.equal(r.game.cine.bg, lean === 'commons' ? 'shore-dusk' : 'pier-riot');
    assert.deepEqual(r.game.cine.on, lean === 'commons' ? ['ilse', 'ren'] : ['corvane']);
    assert.deepEqual(moods(r.effects).slice(-1), [lean === 'commons' ? 'hope' : 'dread'], 'the branch\'s own first line sets the music');
    const cut = said(r.effects, true);
    r = run(r.game, (g) => g.mode === 'end');
    assert.deepEqual([...cut, ...said(r.effects, true)], ENDING_LINES[lean]);
    assert.equal(r.game.ending, lean);
    assert.deepEqual(endingOf(content, r.game), { leaning: lean, ...finale.endings[lean] });
  });
}

test('once read, the ending does not change sides, whatever the books do afterwards', () => {
  // read as commons when scene 2 clears...
  let r = run(at(1, 1, commonsBook()), (g) => g.scene === 2 && g.mode === 'play');
  assert.equal(r.game.ending, 'commons');
  // ...then the books go to the Mint during scene 3 (the obvious rule, reading at the last objective, would now flip)
  let econ = r.game.econ;
  for (let i = 0; i < 40; i++) econ = takeLoan(econ);
  assert.equal(leaning(econ), 'mint');
  r = run({ ...r.game, econ }, (g) => g.mode === 'end');
  assert.equal(leaning(r.game.econ), 'mint');
  assert.equal(r.game.ending, 'commons');
  assert.deepEqual(said(r.effects, true), ENDING_LINES.commons);
  assert.deepEqual(said(r.effects, false).filter((id) => id.startsWith('ch2.') && id.includes('3.b')), ['ch2.s3.b1', 'ch2.s3.b2']);

  // and the other way: read as mint, then a great deal of trust
  r = run(at(1, 1, mintBook()), (g) => g.scene === 2 && g.mode === 'play');
  assert.equal(r.game.ending, 'mint');
  r = run({ ...r.game, econ: addTrust(r.game.econ, 5000) }, (g) => g.mode === 'end');
  assert.equal(leaning(r.game.econ), 'commons');
  assert.deepEqual(said(r.effects, true), ENDING_LINES.mint);
  assert.equal(endingOf(content, r.game).title, 'THE SUM');
});

test('the reading counts the trust of the scene that takes it, and is level-is-commons like the ledger', () => {
  // one refused hat (75) against 35 trust: mint. Scene 3 pays 40, which makes it level.
  const lastOnly = deepFreeze({ ...content, chapters: [{ ...finale, scenes: [{ ...finale.scenes[2], briefing: [finale.scenes[2].briefing[0]] }] }] });
  const econ = { ...initEcon(), writs: 5, trustEarned: TRUST_PER_LOAN - 40, loansTaken: 1, hatsRefused: 1 };
  assert.equal(leaning(econ), 'mint');
  const r = run(at(0, 0, econ, lastOnly), (g) => g.mode === 'cine', lastOnly);
  assert.equal(r.game.econ.trustEarned, TRUST_PER_LOAN);
  assert.equal(r.game.ending, 'commons');
  assert.equal(r.game.cine.lines[0].id, 'ch2.s3.c01');
});

test('before the final chapter a lean line follows the live books and nothing is frozen', () => {
  for (const [lean, book] of [['commons', commonsBook], ['mint', mintBook]]) {
    const r = run(at(0, 0, book()), (g) => g.mode === 'card');
    assert.deepEqual(said(r.effects, true), ['ch1.s1.c01', lean === 'commons' ? 'ch1.s1.c02' : 'ch1.s1.c02m', 'ch1.epi.01', lean === 'commons' ? 'ch1.epi.02' : 'ch1.epi.02m']);
    assert.equal(r.game.ending, null);
    assert.equal(r.game.chapter, 1);
  }
  // the books turn between the cutscene and the epilogue: each is chosen as it starts
  let r = run(at(0, 0, commonsBook()), (g) => g.mode === 'cine');
  let econ = r.game.econ;
  for (let i = 0; i < 40; i++) econ = takeLoan(econ);
  r = run({ ...r.game, econ }, (g) => g.mode === 'card');
  assert.deepEqual(said(r.effects, true), ['ch1.s1.c02', 'ch1.epi.01', 'ch1.epi.02m']);
});

test('a cinematic whose every line belongs to the other ending is passed over, like an empty one', () => {
  const c = deepFreeze({ ...content, chapters: [{ ...finale, scenes: [scene('ch2.s1', { cutscene: [C('ch2.s1.c01', 'ren', 'Held.', { bg: 'bench' })] }), scene('ch2.s2')] }] });
  let r = run(at(0, 0, mintBook(), c), (g) => g.scene === 1, c);
  assert.deepEqual(said(r.effects, true), [], 'nothing of the commons cutscene');
  assert.equal(r.game.mode, 'play');
  assert.equal(r.game.ending, 'mint');
  r = run(at(0, 0, commonsBook(), c), (g) => g.scene === 1 && g.mode === 'play', c);
  assert.deepEqual(said(r.effects, true), ['ch2.s1.c01']);
});

test('save and load: the reading is kept; a v:3 save has none; a bad one is refused', () => {
  assert.equal(SAVE_VERSION, 5);
  assert.deepEqual(LOADABLE_SAVES, [1, 2, 3, 4, 5]);
  const r = run(at(1, 1, mintBook()), (g) => g.scene === 2 && g.mode === 'play');
  const [save] = saves(r.effects);
  assert.equal(save.ending, 'mint');
  // loaded into another session with books that have since been repaired by hand: still the Mint's ending
  const stored = JSON.parse(JSON.stringify(save));
  let back = update(content, init(9), { type: 'load', save: { ...stored, econ: { ...stored.econ, trustEarned: 9000 } } }).game;
  assert.equal(back.ending, 'mint');
  assert.deepEqual(toSave(back).ending, 'mint');
  back = run(back, (g) => g.mode === 'end');
  assert.deepEqual(said(back.effects, true), ENDING_LINES.mint);

  // a v:3 save (no `ending`, no econ.hatsRefused) from before any of this
  const { hatsRefused, ...oldEcon } = commonsBook();
  assert.equal(hatsRefused, 0);
  const v3 = { v: 3, chapter: 1, scene: 2, econ: oldEcon, seed: 5, reels: FRESH_REELS };
  let old = update(content, init(9), { type: 'load', save: v3 }).game;
  assert.equal(old.ending, null);
  assert.equal(old.econ.hatsRefused, 0);
  assert.deepEqual([toSave(old).v, toSave(old).ending], [5, null]);
  // it is past the scene that would have read the ledger: the last objective reads it instead
  old = run(old, (g) => g.mode === 'end');
  assert.equal(old.game.ending, 'commons');
  assert.deepEqual(said(old.effects, true), ENDING_LINES.commons);

  const load = (s) => () => update(content, init(1), { type: 'load', save: s });
  assert.throws(load({ ...stored, ending: 'both' }), /save has ending "both"; it must be null or one of commons, mint/);
  assert.throws(load({ ...stored, ending: 0 }), /save has ending 0/);
  assert.equal(update(content, init(1), { type: 'load', save: { ...stored, ending: null } }).game.ending, null);
});

test('preloadIds asks only for the lines this ledger will hear', () => {
  const play = (book, ending) => ({ ...at(1, 2, book()), ending });
  assert.deepEqual(preloadIds(content, play(commonsBook, 'commons'), 3), ['ch2.s3.b1', 'ch2.s3.b2', 'ch2.s3.c01', 'ch2.s3.c02', 'ch2.s3.c03', 'ch2.bark.launch.1']);
  assert.deepEqual(preloadIds(content, play(commonsBook, 'mint'), 3), ['ch2.s3.b1', 'ch2.m3.b2', 'ch2.m3.c01', 'ch2.s3.c02', 'ch2.m3.c03', 'ch2.bark.launch.1']);
  assert.deepEqual(preloadIds(content, play(mintBook, null), 1), ['ch2.s3.b1', 'ch2.m3.b2', 'ch2.m3.c01', 'ch2.bark.launch.1'], 'unread: the live books');
  // in the last cutscene, what follows without a pause is this ending's epilogue
  const cine = run(play(mintBook, 'mint'), (g) => g.mode === 'cine').game;
  assert.deepEqual(preloadIds(content, cine, 3), ['ch2.s3.c02', 'ch2.m3.c03', 'ch2.mepi.01', 'ch2.epi.03']);
  const cineC = run(play(commonsBook, 'commons'), (g) => g.mode === 'cine').game;
  assert.deepEqual(preloadIds(content, cineC, 3), ['ch2.s3.c02', 'ch2.s3.c03', 'ch2.epi.01', 'ch2.epi.02', 'ch2.epi.03']);
  // scene 2's cutscene near its end: scene 3's briefing, by the reading just taken
  const s2 = run(at(1, 1, mintBook()), (g) => g.mode === 'cine').game;
  assert.deepEqual(preloadIds(content, s2, 3), ['ch2.s2.c02', 'ch2.s3.b1', 'ch2.m3.b2']);
});

test('the shipped game, whatever its length: the ledger is read in its last chapter and nowhere else', () => {
  const n = shipped.chapters.length;
  const reads = shipped.chapters.flatMap((ch, i) => ch.scenes.map((sc, j) => (readsLeaning(shipped, i, j) ? sc.id : null))).filter(Boolean);
  const last = shipped.chapters[n - 1];
  assert.ok(reads.length >= 1, 'somewhere');
  assert.ok(reads.every((id) => id.startsWith(`${last.id}.`)), `read outside the last chapter: ${reads.join(', ')}`);
  assert.equal(reads[reads.length - 1], last.scenes[last.scenes.length - 1].id, 'at the latest when the last objective completes');
  console.log(`the ledger is read when ${reads[0]} clears (${n} chapters; ${last.endings ? 'end screen text for both leanings' : 'no `endings` on the last chapter: plain end screen'})`);
  // both end screens resolve
  for (const lean of LEANINGS) {
    const e = endingOf(shipped, { ending: lean, econ: initEcon() });
    assert.equal(e.leaning, lean);
    if (last.endings) assert.ok(e.title.length > 0 && e.text.length > 0, `endings.${lean}`);
    else assert.deepEqual([e.title, e.text], [null, null]);
  }
  // each branch of every cinematic stands on its own: it opens on a backdrop and is not empty
  for (const ch of shipped.chapters) {
    for (const [where, lines] of [[`${ch.id}.prologue`, ch.prologue], [`${ch.id}.epilogue`, ch.epilogue], ...ch.scenes.map((s) => [s.id, s.cutscene])]) {
      for (const lean of LEANINGS) {
        const heard = spokenLines(lines, lean);
        assert.ok(heard.length > 0, `${where}: nothing is said when the ledger leans ${lean}`);
        assert.ok(heard[0].bg !== undefined, `${where}: the ${lean} version does not open on a backdrop (${heard[0].id})`);
      }
    }
  }
});
