// The whole game, start to finish, through the core only: update(content, game, msg).
// No shell. A flipper bot plays all five tables; cinematics are confirmed through line by line.
//
// The bot does not aim. It flips when a ball is over a flipper, a few steps late, and
// plunges with a random charge. A person who can aim will do better than it does, so
// the time it needs for a scene is an upper bound on how hard that scene is.
//
// The same button is the lever of the Reels when the table is empty, and there the bot
// has a policy, because that is where the player has a choice:
//   'commons'  when the town is passing the hat it waits for it; otherwise it pulls
//   'mint'     it pulls the moment it can, hat or no hat, and so never takes a gift
// The economy's numbers (SPIN_COST, LOAN, TRUST_PER_LOAN, TRUST_PER_GIFT, REELS_NEED and the
// lean paytable) are tuned against these two bots, and the asserts at the bottom hold them there.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../src/content/index.js';
import { init, update, leverStatus, REELS_NEED } from '../src/core/game.js';
import { STEP } from '../src/core/physics.js';
import { leaning, aidAvailable, SPIN_COST, LOAN, TRUST_PER_LOAN, TRUST_PER_GIFT } from '../src/core/economy.js';

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

const LEVER_REACTION = { commons: 40, mint: 1 };   // steps before the bot's thumb gets to the lever

/** The flipper bot from test/tables.test.js, reading the game instead of owning the physics. */
function makeBot(seedN, policy) {
  if (!(policy in LEVER_REACTION)) throw new Error(`playthrough: unknown bot policy ${JSON.stringify(policy)}`);
  const rnd = mulberry(seedN);
  const st = { fl: { wait: -1, hold: 0, cool: 0, aim: 20 }, fr: { wait: -1, hold: 0, cool: 0, aim: 20 }, plunge: 0, lever: 0 };
  return function input(table, game) {
    const { phys } = game;
    const out = { left: false, right: false, plunge: false, nudge: null };
    if (phys.balls.some((b) => b.state === 'plunger')) {
      if (st.plunge === 0) st.plunge = 40 + Math.floor(rnd() * 80);
      st.plunge--;
      out.plunge = st.plunge > 0;
      st.lever = 0;
    } else {
      // The lever. 'wait' and null are not for pressing; the commons bot also lets the hat come round.
      const status = leverStatus(content, game);
      const live = status === 'free' || status === 'pull' || status === 'loan' || status === 'credit';
      if (live && (policy === 'mint' || !aidAvailable(game.econ))) {
        st.lever++;
        const since = st.lever - LEVER_REACTION[policy];
        out.plunge = since > 0 && since % 12 < 4;      // a tap, and again if that was only the loan
      } else st.lever = 0;
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

/** Play from the title to 'end'. Returns per-scene and per-chapter numbers and the effects seen. */
export function playthrough(seedN, { policy = 'commons', maxSeconds = GAME_LIMIT * 3, onStep = null } = {}) {
  let game = init(seedN);
  const bot = makeBot(seedN * 7919 + 1, policy);
  const scenes = [];            // { id, seconds, pulls, loans, aid, balls, lanes, shots }
  const seen = { saves: 0, lines: 0, cine: {}, modes: new Set(['title']) };
  let tableSeconds = 0;
  let cur = null;

  const sceneRow = () => {
    const ch = content.chapters[game.chapter];
    const sc = ch.scenes[game.scene];
    if (!sc) return null;
    if (!cur || cur.id !== sc.id) {
      cur = { id: sc.id, chapter: game.chapter, title: sc.title, seconds: 0, pulls: 0, loans: 0, aid: 0, balls: 0, lanes: 0, shots: 0, playWrits: 0, playMarks: 0, done: false };
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
    const row = before.mode === 'play' ? cur : null;
    for (const e of r.effects) {
      if (e.type === 'save') seen.saves++;
      if (e.type === 'say' && e.blocking) seen.lines++;
      if (e.type === 'sfx' && row) {
        if (e.name === 'loan') row.loans++;
        if (e.name === 'aid') row.aid++;
        if (e.name === 'launch') row.balls++;
      }
    }
    // a line was paid on this tick: count it by how it came up
    if (row && before.reels.phase === 'open' && game.reels.phase === 'paying') {
      const { source } = before.reels;
      const { payout } = game.reels.result;
      if (source === 'lever') row.pulls++;
      else if (source === 'lanes' || source === 'shot') {
        row[source === 'lanes' ? 'lanes' : 'shots']++;
        row.playWrits += payout.writs;
        row.playMarks += payout.marks + (payout.points || 0) / 1000;
      } else throw new Error(`playthrough: a line paid from unknown source ${JSON.stringify(source)}`);
    }
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
    } else if (game.mode === 'play') {
      const row = sceneRow();
      const table = content.tables[content.chapters[game.chapter].tableId];
      send({ type: 'tick', dt: STEP, input: bot(table, game) });
      row.seconds += STEP; tableSeconds += STEP;
    } else {
      throw new Error(`playthrough: unknown mode ${game.mode}`);
    }
  }
  const sum = (k, chapter) => scenes.reduce((n, s) => n + (chapter === undefined || s.chapter === chapter ? s[k] : 0), 0);
  return { game, scenes, seen, tableSeconds, sum, leaning: leaning(game.econ) };
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const median = (xs) => { const o = [...xs].sort((a, b) => a - b); return (o[(o.length - 1) >> 1] + o[o.length >> 1]) / 2; };
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const CHAPTERS = content.chapters.map((_, i) => i);
const perChapter = (run, k) => CHAPTERS.map((i) => run.sum(k, i));

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const runs = [];
const mintRuns = [];

test('the game under test is the whole one: five chapters of seven scenes', () => {
  assert.equal(content.chapters.length, 5);
  assert.equal(content.chapters.reduce((n, ch) => n + ch.scenes.length, 0), 35);
});

for (const seedN of SEEDS) {
  test(`seed ${seedN}: the bot plays from the title to the end of chapter five`, (t) => {
    const run = playthrough(seedN);
    runs.push(run);
    const { game, scenes, seen, tableSeconds, sum } = run;

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
    assert.deepEqual([...seen.modes].sort(), ['card', 'cine', 'end', 'play', 'title'], 'these modes and no slot screen');

    assert.ok(tableSeconds < GAME_LIMIT, `the game took the bot ${fmt(tableSeconds)} at the table`);

    // the two lifetime totals are what the bot actually did, and the ledger reads from them
    const paid = content.chapters.reduce((n, ch) => n + ch.scenes.reduce((m, s) => m + (s.reward.trust || 0), 0), 0);
    assert.equal(game.econ.loansTaken, sum('loans'), 'every loan is in the lifetime total');
    assert.equal(game.econ.trustEarned, paid + sum('aid') * TRUST_PER_GIFT, 'every scene paid its trust into the lifetime total, and every gift');
    // chapter one's first pull is the scripted one and each chapter was played with the reels
    assert.equal(game.econ.spins, sum('pulls'), 'every pull of the lever paid a line');

    t.diagnostic(`seed ${seedN} total ${fmt(tableSeconds)} at the table: balls ${sum('balls')}, lever pulls ${sum('pulls')}, `
      + `loans ${sum('loans')}, aid ${sum('aid')}, lines in play ${sum('lanes')} by lanes + ${sum('shots')} by shots `
      + `paying ${sum('playWrits')} writs and ${Math.round(sum('playMarks'))} marks; ends with ${Math.round(game.econ.marks)} marks, `
      + `debt ${Math.round(game.econ.debt)}; trust earned ${game.econ.trustEarned} against ${game.econ.loansTaken} loans: the ledger leans ${run.leaning}`);
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

// ───────────────────────── the economy, as played ─────────────────────────

const ledgerTable = (t, label, rs) => {
  t.diagnostic(`${label}: seed   total  pulls  loans by chapter   aid by chapter   lines in play by chapter   leaning`);
  rs.forEach((r, i) => {
    const lines = CHAPTERS.map((c) => r.sum('lanes', c) + r.sum('shots', c));
    t.diagnostic(`${' '.repeat(label.length)}  ${String(SEEDS[i]).padStart(4)}  ${fmt(r.tableSeconds).padStart(6)}  ${String(r.sum('pulls')).padStart(5)}  `
      + `${perChapter(r, 'loans').join(' ')} = ${String(r.sum('loans')).padEnd(6)}  ${perChapter(r, 'aid').join(' ')} = ${String(r.sum('aid')).padEnd(4)}  `
      + `${lines.join(' ').padEnd(24)}  ${r.leaning}`);
  });
};

test('the economy matters in ordinary play: the bot borrows, is given to, and the reels pay in play', (t) => {
  assert.equal(runs.length, SEEDS.length, 'the playthroughs above ran');
  const n = content.chapters.length;
  t.diagnostic(`SPIN_COST ${SPIN_COST}, LOAN ${LOAN.marks} for ${LOAN.owed} at ${LOAN.garnish}, TRUST_PER_LOAN ${TRUST_PER_LOAN}, TRUST_PER_GIFT ${TRUST_PER_GIFT}, REELS_NEED ${REELS_NEED}`);
  ledgerTable(t, 'commons bot', runs);

  const minutes = runs.map((r) => r.tableSeconds / 60);
  const loans = runs.map((r) => r.sum('loans') / n);
  const aid = runs.map((r) => r.sum('aid') / n);
  const lines = runs.flatMap((r) => CHAPTERS.map((c) => r.sum('lanes', c) + r.sum('shots', c)));
  const writShare = mean(runs.map((r) => r.sum('playWrits') / r.sum('balls')));
  t.diagnostic(`five chapters take the bot ${minutes.map((m) => m.toFixed(0)).join(' ')} minutes (median ${median(minutes).toFixed(1)}); `
    + `per chapter it takes ${mean(loans).toFixed(2)} loans and ${mean(aid).toFixed(2)} aid balls on average, `
    + `and is paid ${mean(lines).toFixed(1)} lines in play (fewest in any chapter of any seed: ${Math.min(...lines)}); `
    + `${(writShare * 100).toFixed(1)}% of its balls came from writs won in play`);

  // The targets the numbers were tuned to. Wide enough for eight seeds of a chaotic table;
  // a change that moves the economy somewhere else will still land outside them.
  assert.ok(median(minutes) >= 25 && median(minutes) <= 40, `median game ${median(minutes).toFixed(1)} minutes`);
  assert.ok(Math.max(...minutes) < 50, `longest game ${Math.max(...minutes).toFixed(1)} minutes`);
  assert.ok(mean(loans) >= 1 && mean(loans) <= 3, `${mean(loans).toFixed(2)} loans a chapter`);
  assert.ok(mean(aid) >= 1 && mean(aid) <= 3, `${mean(aid).toFixed(2)} aid balls a chapter`);
  assert.ok(Math.min(...lines) >= 3, `a chapter with only ${Math.min(...lines)} lines paid in play`);
  // nobody plays for free: the reels in play are not where the balls come from
  assert.ok(writShare < 0.2, `${(writShare * 100).toFixed(1)}% of balls from writs won in play`);
  for (const r of runs) assert.ok(r.sum('pulls') >= 5, `a game with only ${r.sum('pulls')} pulls of the lever`);
});

test('both endings are reachable, and by choice: waiting for the hat leans commons, never waiting leans mint', (t) => {
  assert.equal(runs.length, SEEDS.length, 'the playthroughs above ran');
  for (const seedN of SEEDS) mintRuns.push(playthrough(seedN, { policy: 'mint' }));
  ledgerTable(t, 'mint bot   ', mintRuns);
  const book = (r) => `${r.game.econ.trustEarned} trust against ${r.game.econ.loansTaken} loans (${r.game.econ.loansTaken * TRUST_PER_LOAN})`;
  t.diagnostic(`commons bot: ${runs.map(book).join('; ')}`);
  t.diagnostic(`mint bot:    ${mintRuns.map(book).join('; ')}`);

  for (const r of mintRuns) {
    assert.equal(r.game.mode, 'end');
    assert.equal(r.sum('aid'), 0, 'the mint bot never takes a gift');
  }
  assert.deepEqual(runs.map((r) => r.leaning), SEEDS.map(() => 'commons'), 'the bot that waits for the hat');
  assert.deepEqual(mintRuns.map((r) => r.leaning), SEEDS.map(() => 'mint'), 'the bot that never does');
  assert.throws(() => playthrough(1, { policy: 'thrift' }), /unknown bot policy "thrift"/);
});
