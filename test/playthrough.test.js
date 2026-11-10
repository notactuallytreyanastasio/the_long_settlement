// The whole game, start to finish, through the core only: update(content, game, msg).
// No shell. A flipper bot plays all five tables; cinematics are confirmed through line by line.
//
// The bot does not aim. It flips when a ball is over a flipper, a few steps late, and
// plunges with a random charge. A person who can aim will do better than it does, so
// the time it needs for a scene is an upper bound on how hard that scene is.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../src/content/index.js';
import { init, update } from '../src/core/game.js';
import { STEP } from '../src/core/physics.js';
import { leaning } from '../src/core/economy.js';

// A scene the bot needs longer than this for is too hard, and the fix is geometry or the
// objective, never these numbers.
const SCENE_MEDIAN_LIMIT = 2.5 * 60;   // simulated seconds for one scene, median over the seeds
const SCENE_MEAN_LIMIT = 4 * 60;       // and the mean, which is what one unlucky seed moves
// The game is as long as it has chapters, so its caps are per chapter: seven scenes.
const CHAPTER_MEDIAN_LIMIT = 15 * 60;  // median seed, whole game / chapters, cinematics excluded
const CHAPTER_WORST_LIMIT = 30 * 60;   // any one seed, likewise
const GAME_LIMIT = CHAPTER_WORST_LIMIT * content.chapters.length;

function mulberry(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The flipper bot from test/tables.test.js, reading game.phys instead of owning it. */
function makeBot(seedN) {
  const rnd = mulberry(seedN);
  const st = { fl: { wait: -1, hold: 0, cool: 0, aim: 20 }, fr: { wait: -1, hold: 0, cool: 0, aim: 20 }, plunge: 0 };
  return function input(table, phys) {
    const out = { left: false, right: false, plunge: false, nudge: null };
    if (phys.balls.some((b) => b.state === 'plunger')) {
      if (st.plunge === 0) st.plunge = 40 + Math.floor(rnd() * 80);
      st.plunge--;
      out.plunge = st.plunge > 0;
    }
    for (const f of table.flippers) {
      const s = st[f.id];
      const dirX = f.side === 'left' ? 1 : -1;
      const near = phys.balls.some((b) => {
        if (b.state !== 'live') return false;
        const along = (b.pos[0] - f.pivot[0]) * dirX;
        const lead = b.pos[1] + b.vel[1] * 0.03;
        const slow = Math.hypot(b.vel[0], b.vel[1]) < 160;
        return along > (slow ? s.aim : -4) && along < f.length + 6
          && lead > f.pivot[1] - 26 && b.pos[1] < f.pivot[1] + 30 && b.vel[1] > -200;
      });
      if (s.hold > 0) {
        s.hold--;
        if (s.hold === 0) { s.cool = 8 + Math.floor(rnd() * 10); s.aim = 14 + rnd() * 34; }
      } else if (s.cool > 0) s.cool--;
      else if (s.wait >= 0) { if (s.wait === 0) s.hold = 8 + Math.floor(rnd() * 16); s.wait--; }
      else if (near) s.wait = Math.floor(rnd() * 5);
      out[f.side] = s.hold > 0;
    }
    return out;
  };
}

const IDLE = { left: false, right: false, plunge: false, nudge: null };

/** Play from the title to 'end'. Returns per-scene numbers and the effects seen. */
export function playthrough(seedN, { maxSeconds = GAME_LIMIT * 3, onStep = null } = {}) {
  let game = init(seedN);
  const bot = makeBot(seedN * 7919 + 1);
  const scenes = [];            // { id, seconds, slotTrips, spins, loans, aid, balls }
  const seen = { saves: 0, lines: 0, cine: {}, modes: new Set(['title']) };
  let tableSeconds = 0;
  let cur = null;

  const sceneRow = () => {
    const ch = content.chapters[game.chapter];
    const sc = ch.scenes[game.scene];
    if (!sc) return null;
    if (!cur || cur.id !== sc.id) {
      cur = { id: sc.id, title: sc.title, seconds: 0, slotTrips: 0, spins: 0, loans: 0, aid: 0, balls: 0, done: false };
      scenes.push(cur);
    }
    return cur;
  };

  const send = (msg) => {
    const before = game;
    const r = update(content, game, msg);
    game = r.game;
    seen.modes.add(game.mode);
    if (onStep) onStep(before, game, r.effects, msg);
    const row = (before.mode === 'slot' || before.mode === 'play') ? sceneRow() : null;
    for (const e of r.effects) {
      if (e.type === 'save') seen.saves++;
      if (e.type === 'say' && e.blocking) seen.lines++;
      if (e.type === 'sfx' && row) {
        if (e.name === 'loan') row.loans++;
        if (e.name === 'aid') row.aid++;
        if (e.name === 'reelStart') row.spins++;
        if (e.name === 'launch') row.balls++;
      }
    }
    if (before.mode === 'play' && game.mode === 'slot' && row) row.slotTrips++;
    if (before.mode === 'play' && game.mode === 'cine') {
      // the objective was met on this tick; `cur` is still the scene that was being played
      cur.done = true;
    }
    if (game.cine && (!before.cine || before.cine.lines !== game.cine.lines)) seen.cine[game.cine.kind] = (seen.cine[game.cine.kind] || 0) + 1;
    return r;
  };

  while (game.mode !== 'end') {
    if (tableSeconds > maxSeconds) {
      throw new Error(`playthrough seed ${seedN}: still in ${game.mode} at chapter ${game.chapter} scene ${game.scene} `
        + `after ${Math.round(tableSeconds)} simulated seconds; scenes so far ${JSON.stringify(scenes)}`);
    }
    if (game.mode === 'title' || game.mode === 'card') {
      send({ type: 'tick', dt: STEP, input: IDLE });
      send({ type: 'confirm' });
    } else if (game.mode === 'cine') {
      // a few frames of each line, then Enter
      for (let i = 0; i < 6 && game.mode === 'cine'; i++) send({ type: 'tick', dt: STEP, input: IDLE });
      if (game.mode === 'cine') send({ type: 'confirm' });
    } else if (game.mode === 'slot') {
      const row = sceneRow();
      if (game.slot.phase !== 'spinning') {
        if (game.econ.writs > 0 || game.phys.balls.length > 0) send({ type: 'toTable' });
        else send({ type: 'confirm' });       // spin, or borrow when broke
      }
      if (game.mode === 'slot') {
        send({ type: 'tick', dt: STEP, input: IDLE });
        row.seconds += STEP; tableSeconds += STEP;
      }
    } else if (game.mode === 'play') {
      const row = sceneRow();
      const table = content.tables[content.chapters[game.chapter].tableId];
      send({ type: 'tick', dt: STEP, input: bot(table, game.phys) });
      row.seconds += STEP; tableSeconds += STEP;
    } else {
      throw new Error(`playthrough: unknown mode ${game.mode}`);
    }
  }
  return { game, scenes, seen, tableSeconds };
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const median = (xs) => { const o = [...xs].sort((a, b) => a - b); return (o[(o.length - 1) >> 1] + o[o.length >> 1]) / 2; };
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const runs = [];

test('the game under test is the whole one: five chapters of seven scenes', () => {
  assert.equal(content.chapters.length, 5);
  assert.equal(content.chapters.reduce((n, ch) => n + ch.scenes.length, 0), 35);
});

for (const seedN of SEEDS) {
  test(`seed ${seedN}: the bot plays from the title to the end of chapter five`, (t) => {
    const run = playthrough(seedN);
    runs.push(run);
    const { game, scenes, seen, tableSeconds } = run;

    assert.equal(game.mode, 'end');
    assert.equal(game.chapter, content.chapters.length - 1, 'ended in the last chapter');
    const wanted = content.chapters.flatMap((ch) => ch.scenes.map((s) => s.id));
    assert.deepEqual(scenes.map((s) => s.id), wanted, 'every scene was played, in order');
    for (const s of scenes) assert.ok(s.done, `${s.id} completed`);

    // every cinematic ran: a prologue and an epilogue per chapter, a cutscene per scene
    assert.equal(seen.cine.prologue, content.chapters.length);
    assert.equal(seen.cine.epilogue, content.chapters.length);
    assert.equal(seen.cine.scene, wanted.length);
    const blocking = content.chapters.reduce(
      (n, ch) => n + ch.prologue.length + ch.epilogue.length + ch.scenes.reduce((m, s) => m + s.cutscene.length, 0), 0);
    assert.equal(seen.lines, blocking, 'every cinematic line was spoken once');
    assert.equal(seen.saves, wanted.length, 'one save per scene start');
    for (const mode of ['title', 'card', 'cine', 'slot', 'play', 'end']) assert.ok(seen.modes.has(mode), `visited ${mode}`);

    assert.ok(tableSeconds < GAME_LIMIT, `the game took the bot ${fmt(tableSeconds)} at the table`);

    // the two lifetime totals are what the bot actually did, and the ledger reads from them
    const sum = (k) => scenes.reduce((n, s) => n + s[k], 0);
    const paid = content.chapters.reduce((n, ch) => n + ch.scenes.reduce((m, s) => m + (s.reward.trust || 0), 0), 0);
    assert.equal(game.econ.loansTaken, sum('loans'), 'every loan is in the lifetime total');
    assert.equal(game.econ.trustEarned, paid, 'every scene paid its trust into the lifetime total');
    run.leaning = leaning(game.econ);
    run.sum = sum;

    t.diagnostic(`seed ${seedN} total ${fmt(tableSeconds)} at the table: slot trips ${sum('slotTrips')}, spins ${sum('spins')}, `
      + `loans ${sum('loans')}, aid ${sum('aid')}; ends with ${Math.round(game.econ.marks)} marks, debt ${Math.round(game.econ.debt)}; `
      + `trust earned ${game.econ.trustEarned} against ${game.econ.loansTaken} loans: the ledger leans ${run.leaning}`);
  });
}

test('no scene is too hard: median under 2:30 and mean under 4:00 for each of the 35', (t) => {
  assert.equal(runs.length, SEEDS.length, 'the playthroughs above ran');
  const timesOf = (id) => runs.map((r) => r.scenes.find((s) => s.id === id).seconds);

  // The table: one row per chapter, one column per scene, median/mean over the seeds.
  t.diagnostic(`per-scene time at the table, median/mean over seeds ${SEEDS.join(',')}`);
  t.diagnostic(`      ${[1, 2, 3, 4, 5, 6, 7].map((n) => `s${n}`.padEnd(10)).join(' ')}`);
  for (const ch of content.chapters) {
    const cells = ch.scenes.map((sc) => { const x = timesOf(sc.id); return `${fmt(median(x))}/${fmt(mean(x))}`.padEnd(10); });
    t.diagnostic(`${ch.id}   ${cells.join(' ')}`);
  }
  t.diagnostic('seed   total  slot trips  spins  loans  aid  leaning');
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];
    t.diagnostic(`${String(SEEDS[i]).padStart(4)}  ${fmt(r.tableSeconds).padStart(6)}  ${String(r.sum('slotTrips')).padStart(10)}  `
      + `${String(r.sum('spins')).padStart(5)}  ${String(r.sum('loans')).padStart(5)}  ${String(r.sum('aid')).padStart(3)}  ${r.leaning}`);
  }

  // A bot that cannot aim has a long tail on "hit every target in the bank" scenes: one
  // seed in eight can take three times the median. Both are asserted; the worst is in the message.
  const failures = [];
  for (const ch of content.chapters) {
    for (const sc of ch.scenes) {
      const times = timesOf(sc.id);
      if (median(times) >= SCENE_MEDIAN_LIMIT) failures.push(`${sc.id} takes the bot a median ${fmt(median(times))} (${times.map(fmt).join(' ')})`);
      if (mean(times) >= SCENE_MEAN_LIMIT) failures.push(`${sc.id} takes the bot ${fmt(mean(times))} on average (${times.map(fmt).join(' ')})`);
    }
  }
  assert.deepEqual(failures, []);

  const totals = runs.map((r) => r.tableSeconds);
  const n = content.chapters.length;
  t.diagnostic(`whole game at the table: median ${fmt(median(totals))}, worst ${fmt(Math.max(...totals))}; `
    + `per chapter: median ${fmt(median(totals) / n)}, worst ${fmt(Math.max(...totals) / n)}`);
  assert.ok(median(totals) / n < CHAPTER_MEDIAN_LIMIT, `the median game takes the bot ${fmt(median(totals) / n)} a chapter`);
});

// Reported, not asserted either way: which ending the bot gets is tuning (TRUST_PER_LOAN), not correctness.
test('every seed ends with the ledger leaning one way or the other', (t) => {
  const counts = { commons: 0, mint: 0 };
  for (const r of runs) counts[r.leaning]++;
  t.diagnostic(`leaning over ${runs.length} seeds: commons ${counts.commons}, mint ${counts.mint}`);
  assert.equal(counts.commons + counts.mint, SEEDS.length);
});
