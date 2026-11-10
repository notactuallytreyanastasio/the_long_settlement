// The whole game, start to finish, through the core only: update(content, game, msg).
// No shell. A flipper bot plays every table the content has (five chapters, or eight once 6 to 8 are wired in); cinematics are confirmed through line by line.
//
// The bot does not aim. It flips when a ball is over a flipper, a few steps late, and
// plunges with a random charge. A person who can aim will do better than it does, so
// the time it needs for a scene is an upper bound on how hard that scene is.
//
// The same button is the lever of the Reels when the table is empty, and there the bot
// has a policy, because that is where the player has a choice:
//   'commons'  when the town is passing the hat it waits for it; otherwise it pulls
//   'mint'     it pulls the moment it can, hat or no hat, and so never takes a gift
// The economy's numbers (SPIN_COST, LOAN, TRUST_PER_LOAN, TRUST_PER_FORCED_LOAN, TRUST_PER_GIFT, REELS_NEED
// and the lean paytable) are tuned against these two bots, and the asserts at the bottom hold them there.
//
// The ending is asked of four players: each policy at each skill (steady and mediocre, below). The suite runs
// eight seeds of the steady ones and four of the mediocre ones. TLS_SEEDS=16 node --test test/playthrough.test.js
// runs sixteen of all four (about a minute and a half) and prints the same tables.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../src/content/index.js';
import { init, update, leverStatus, REELS_NEED } from '../src/core/game.js';
import { STEP } from '../src/core/physics.js';
import { leaning, ledger, aidAvailable, SPIN_COST, LOAN, TRUST_PER_LOAN, TRUST_PER_FORCED_LOAN, TRUST_PER_GIFT } from '../src/core/economy.js';

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

/**
 * How well the bot's thumbs work, in physics steps (1/120 s).
 *   steady    the bot the economy was tuned against: it never misses a ball it could reach, flips within
 *             0-33 ms of the ball arriving and reads the ball 30 ms ahead. No person plays like this.
 *   mediocre  somebody's first evening on the table: sees the ball where it is, not where it will be; flips
 *             50-170 ms late; one ball in eight goes past without a flip at all; holds too long; and once in
 *             a while slaps both flippers. Where the ball meets the flipper is random for both of them.
 * The mediocre bot is what "can a person clear this scene" is asked of (see the test near the bottom).
 */
const SKILL = {
  steady: { lead: 0.03, wait: [0, 5], hold: [8, 16], cool: [8, 10], aim: [14, 34], miss: 0, both: 0, plunge: [40, 80], lever: 0 },
  mediocre: { lead: 0, wait: [6, 14], hold: [14, 26], cool: [14, 22], aim: [4, 48], miss: 0.125, both: 0.06, plunge: [30, 110], lever: 70 },
};

/** The flipper bot from test/tables.test.js, reading the game instead of owning the physics. */
function makeBot(seedN, policy, skill = 'steady') {
  if (!(policy in LEVER_REACTION)) throw new Error(`playthrough: unknown bot policy ${JSON.stringify(policy)}`);
  const K = SKILL[skill];
  if (!K) throw new Error(`playthrough: unknown bot skill ${JSON.stringify(skill)}`);
  const rnd = mulberry(seedN);
  const span = ([lo, n]) => lo + Math.floor(rnd() * n);
  const st = { fl: { wait: -1, hold: 0, cool: 0, aim: 20 }, fr: { wait: -1, hold: 0, cool: 0, aim: 20 }, plunge: 0, lever: 0, slap: 0 };
  return function input(table, game) {
    const { phys } = game;
    const out = { left: false, right: false, plunge: false, nudge: null };
    if (phys.balls.some((b) => b.state === 'plunger')) {
      if (st.plunge === 0) st.plunge = span(K.plunge);
      st.plunge--;
      out.plunge = st.plunge > 0;
      st.lever = 0;
    } else {
      // The lever. 'wait' and null are not for pressing; the commons bot also lets the hat come round.
      const status = leverStatus(content, game);
      const live = status === 'free' || status === 'pull' || status === 'loan' || status === 'credit';
      if (live && (policy === 'mint' || !aidAvailable(game.econ))) {
        st.lever++;
        const since = st.lever - LEVER_REACTION[policy] - K.lever;
        out.plunge = since > 0 && since % 12 < 4;      // a tap, and again if that was only the loan
      } else st.lever = 0;
    }
    for (const f of table.flippers) {
      const s = st[f.id];
      const dirX = f.side === 'left' ? 1 : -1;
      const near = phys.balls.some((b) => {
        if (b.state !== 'live') return false;
        const along = (b.pos[0] - f.pivot[0]) * dirX;
        const lead = b.pos[1] + b.vel[1] * K.lead;
        const slow = Math.hypot(b.vel[0], b.vel[1]) < 160;
        return along > (slow ? s.aim : -4) && along < f.length + 6
          && lead > f.pivot[1] - 26 && b.pos[1] < f.pivot[1] + 30 && b.vel[1] > -200;
      });
      if (s.hold > 0) {
        s.hold--;
        if (s.hold === 0) { s.cool = K.cool[0] + Math.floor(rnd() * K.cool[1]); s.aim = K.aim[0] + rnd() * K.aim[1]; }
      } else if (s.cool > 0) s.cool--;
      else if (s.wait >= 0) {
        if (s.wait === 0) { s.hold = K.hold[0] + Math.floor(rnd() * K.hold[1]); if (K.both > 0 && rnd() < K.both) st.slap = s.hold; }
        s.wait--;
      } else if (near) {
        // the steady bot draws nothing extra here, so its games are the ones the economy was tuned on
        if (K.miss > 0 && rnd() < K.miss) s.cool = 40;      // looked away: this ball goes by
        else s.wait = K.wait[0] + Math.floor(rnd() * K.wait[1]);
      }
      out[f.side] = s.hold > 0;
    }
    if (st.slap > 0) { st.slap--; out.left = true; out.right = true; }
    return out;
  };
}

const IDLE = { left: false, right: false, plunge: false, nudge: null };

/** Play from the title to 'end'. Returns per-scene and per-chapter numbers and the effects seen. */
export function playthrough(seedN, { policy = 'commons', skill = 'steady', maxSeconds = GAME_LIMIT * 3, onStep = null } = {}) {
  let game = init(seedN);
  const bot = makeBot(seedN * 7919 + 1, policy, skill);
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

const WIDE = process.env.TLS_SEEDS === undefined ? null : Number(process.env.TLS_SEEDS);
if (WIDE !== null && !(Number.isInteger(WIDE) && WIDE >= 8)) throw new Error(`playthrough: TLS_SEEDS must be a whole number of seeds, 8 or more, got ${JSON.stringify(process.env.TLS_SEEDS)}`);
const seedsTo = (n) => Array.from({ length: n }, (_, i) => i + 1);
const SEEDS = seedsTo(WIDE ?? 8);
const SCENES = content.chapters.reduce((n, ch) => n + ch.scenes.length, 0);
const runs = [];
const mintRuns = [];

test('the game under test is the whole one: five chapters of seven scenes, or all eight', () => {
  assert.ok([5, 8].includes(content.chapters.length), `${content.chapters.length} chapters`);
  assert.equal(SCENES, 7 * content.chapters.length);
});

for (const seedN of SEEDS) {
  test(`seed ${seedN}: the bot plays from the title to the end of the last chapter`, (t) => {
    const run = playthrough(seedN);
    runs.push(run);
    const { game, scenes, seen, tableSeconds, sum } = run;

    assert.equal(game.mode, 'end');
    assert.equal(game.chapter, content.chapters.length - 1, 'ended in the last chapter');
    assert.equal(game.ending, run.leaning, 'the ending played is the one the finished book describes');
    const wanted = content.chapters.flatMap((ch) => ch.scenes.map((s) => s.id));
    assert.deepEqual(scenes.map((s) => s.id), wanted, 'every scene was played, in order');
    for (const s of scenes) assert.ok(s.done, `${s.id} completed`);

    // every cinematic ran: a prologue and an epilogue per chapter, a cutscene per scene
    assert.equal(seen.cine.prologue, content.chapters.length);
    assert.equal(seen.cine.epilogue, content.chapters.length);
    assert.equal(seen.cine.scene, wanted.length);
    // (of lines that belong to one ending, only those of the ending this game read; before the reading, the live books)
    const heard = (lines) => lines.filter((l) => l.lean === undefined || l.lean === game.ending).length;
    const blocking = content.chapters.reduce(
      (n, ch) => n + heard(ch.prologue) + heard(ch.epilogue) + ch.scenes.reduce((m, s) => m + heard(s.cutscene), 0), 0);
    const early = content.chapters.slice(0, -1).some((ch) => [ch.prologue, ch.epilogue, ...ch.scenes.map((s) => s.cutscene)].flat().some((l) => l.lean !== undefined));
    if (!early) assert.equal(seen.lines, blocking, 'every cinematic line of this ending was spoken once');
    assert.equal(seen.saves, wanted.length, 'one save per scene start');
    assert.deepEqual([...seen.modes].sort(), ['card', 'cine', 'end', 'play', 'title'], 'these modes and no slot screen');

    assert.ok(tableSeconds < GAME_LIMIT, `the game took the bot ${fmt(tableSeconds)} at the table`);

    // the two lifetime totals are what the bot actually did, and the ledger reads from them
    const paid = content.chapters.reduce((n, ch) => n + ch.scenes.reduce((m, s) => m + (s.reward.trust || 0), 0), 0);
    assert.equal(game.econ.loansTaken, sum('loans'), 'every loan is in the lifetime total');
    assert.equal(game.econ.hatsRefused, 0, 'the bot that waits for the hat never refuses it');
    assert.equal(game.econ.trustEarned, paid + sum('aid') * TRUST_PER_GIFT, 'every scene paid its trust into the lifetime total, and every gift');
    // chapter one's first pull is the scripted one and each chapter was played with the reels
    assert.equal(game.econ.spins, sum('pulls'), 'every pull of the lever paid a line');

    t.diagnostic(`seed ${seedN} total ${fmt(tableSeconds)} at the table: balls ${sum('balls')}, lever pulls ${sum('pulls')}, `
      + `loans ${sum('loans')}, aid ${sum('aid')}, lines in play ${sum('lanes')} by lanes + ${sum('shots')} by shots `
      + `paying ${sum('playWrits')} writs and ${Math.round(sum('playMarks'))} marks; ends with ${Math.round(game.econ.marks)} marks, `
      + `debt ${Math.round(game.econ.debt)}; trust earned ${game.econ.trustEarned} against ${game.econ.loansTaken} loans: the ledger leans ${run.leaning}`);
  });
}

test('no scene is too hard: median under 2:30 and mean under 4:00 for every scene', (t) => {
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

// ───────────────────────── a person, not a bot ─────────────────────────

const MEDIOCRE_SEEDS = seedsTo(WIDE ?? 4);
const mediocreRuns = [];
const MEDIOCRE_MEDIAN_LIMIT = 4 * 60;   // the slow end of "a scene takes a mediocre player 1.5 to 4 minutes"
const MEDIOCRE_WORST_LIMIT = 8 * 60;    // any one scene on any one seed: past this a chapter has stalled

test('a mediocre player gets through: late flips, missed balls, random aim, and no scene stalls', (t) => {
  const games = MEDIOCRE_SEEDS.map((seedN) => playthrough(seedN, { skill: 'mediocre' }));
  mediocreRuns.push(...games);
  for (const g of games) {
    assert.equal(g.game.mode, 'end');
    for (const sc of g.scenes) assert.ok(sc.done, `${sc.id} completed`);
  }
  const timesOf = (id) => games.map((g) => g.scenes.find((sc) => sc.id === id).seconds);
  t.diagnostic(`mediocre bot, per-scene time at the table, median/worst over seeds ${MEDIOCRE_SEEDS.join(',')}`);
  t.diagnostic(`      ${[1, 2, 3, 4, 5, 6, 7].map((n) => `s${n}`.padEnd(10)).join(' ')}`);
  const failures = [];
  let quick = 0;
  for (const ch of content.chapters) {
    const cells = ch.scenes.map((sc) => {
      const x = timesOf(sc.id);
      if (median(x) >= MEDIOCRE_MEDIAN_LIMIT) failures.push(`${sc.id} takes a mediocre player a median ${fmt(median(x))} (${x.map(fmt).join(' ')})`);
      if (Math.max(...x) >= MEDIOCRE_WORST_LIMIT) failures.push(`${sc.id} stalled for ${fmt(Math.max(...x))} on one seed (${x.map(fmt).join(' ')})`);
      if (median(x) < 90) quick++;
      return `${fmt(median(x))}/${fmt(Math.max(...x))}`.padEnd(10);
    });
    t.diagnostic(`${ch.id}   ${cells.join(' ')}`);
  }
  const totals = games.map((g) => g.tableSeconds);
  const perBall = games.map((g) => g.tableSeconds / g.sum('balls'));
  t.diagnostic(`whole game: ${totals.map(fmt).join(' ')}; a ball lasts it ${perBall.map((x) => x.toFixed(0)).join(' ')} s `
    + `(the steady bot: ${runs.map((r) => (r.tableSeconds / r.sum('balls')).toFixed(0)).join(' ')} s); `
    + `it takes ${mean(games.map((g) => g.sum('loans') / content.chapters.length)).toFixed(1)} loans a chapter and its ledger leans ${games.map((g) => g.leaning).join(' ')}`);
  // Reported, not asserted: the scenes are short for this player, not long. Lengthening them is an objective
  // count in the chapter files (one saucer capture, two ramps, twelve bumper hits), not anything a table can do.
  t.diagnostic(`${quick} of ${SCENES} scenes take the mediocre bot under 1:30 (median)`);
  assert.deepEqual(failures, []);
});

// ───────────────────────── the economy, as played ─────────────────────────

const ledgerTable = (t, label, rs, seeds = SEEDS) => {
  t.diagnostic(`${label}: seed   total  time by chapter                 pulls by chapter  loans by chapter   aid by chapter   lines in play by chapter   leaning`);
  rs.forEach((r, i) => {
    const lines = CHAPTERS.map((c) => r.sum('lanes', c) + r.sum('shots', c));
    t.diagnostic(`${' '.repeat(label.length)}  ${String(seeds[i]).padStart(4)}  ${fmt(r.tableSeconds).padStart(6)}  `
      + `${perChapter(r, 'seconds').map(fmt).join(' ').padEnd(30)}  ${`${perChapter(r, 'pulls').join(' ')} = ${r.sum('pulls')}`.padEnd(16)}  `
      + `${perChapter(r, 'loans').join(' ')} = ${String(r.sum('loans')).padEnd(6)}  ${perChapter(r, 'aid').join(' ')} = ${String(r.sum('aid')).padEnd(4)}  `
      + `${lines.join(' ').padEnd(24)}  ${r.leaning}`);
  });
};

test('the economy matters in ordinary play: the bot borrows, is given to, and the reels pay in play', (t) => {
  assert.equal(runs.length, SEEDS.length, 'the playthroughs above ran');
  const n = content.chapters.length;
  t.diagnostic(`SPIN_COST ${SPIN_COST}, LOAN ${LOAN.marks} for ${LOAN.owed} at ${LOAN.garnish}, TRUST_PER_LOAN ${TRUST_PER_LOAN}, TRUST_PER_FORCED_LOAN ${TRUST_PER_FORCED_LOAN}, TRUST_PER_GIFT ${TRUST_PER_GIFT}, REELS_NEED ${REELS_NEED}`);
  ledgerTable(t, 'commons bot', runs);

  const minutes = runs.map((r) => r.tableSeconds / 60);
  const loans = runs.map((r) => r.sum('loans') / n);
  const aid = runs.map((r) => r.sum('aid') / n);
  const lines = runs.flatMap((r) => CHAPTERS.map((c) => r.sum('lanes', c) + r.sum('shots', c)));
  const writShare = mean(runs.map((r) => r.sum('playWrits') / r.sum('balls')));
  t.diagnostic(`${n} chapters take the bot ${minutes.map((m) => m.toFixed(0)).join(' ')} minutes (median ${median(minutes).toFixed(1)}); `
    + `per chapter it takes ${mean(loans).toFixed(2)} loans and ${mean(aid).toFixed(2)} aid balls on average, `
    + `and is paid ${mean(lines).toFixed(1)} lines in play (fewest in any chapter of any seed: ${Math.min(...lines)}); `
    + `${(writShare * 100).toFixed(1)}% of its balls came from writs won in play`);

  // The targets the numbers were tuned to. Wide enough for eight seeds of a chaotic table;
  // a change that moves the economy somewhere else will still land outside them.
  // (per chapter, so the same bounds hold for five chapters and for eight: 25-40 and 50 minutes over five)
  assert.ok(median(minutes) / n >= 5 && median(minutes) / n <= 8, `median game ${median(minutes).toFixed(1)} minutes over ${n} chapters`);
  assert.ok(Math.max(...minutes) / n < 10, `longest game ${Math.max(...minutes).toFixed(1)} minutes over ${n} chapters`);
  assert.ok(mean(loans) >= 1 && mean(loans) <= 3, `${mean(loans).toFixed(2)} loans a chapter`);
  assert.ok(mean(aid) >= 1 && mean(aid) <= 3, `${mean(aid).toFixed(2)} aid balls a chapter`);
  assert.ok(Math.min(...lines) >= 3, `a chapter with only ${Math.min(...lines)} lines paid in play`);
  // nobody plays for free: the reels in play are not where the balls come from
  assert.ok(writShare < 0.2, `${(writShare * 100).toFixed(1)}% of balls from writs won in play`);
  for (const r of runs) assert.ok(r.sum('pulls') >= 5, `a game with only ${r.sum('pulls')} pulls of the lever`);
});

/** One line per game: what is in each pan of the scale, and which way it went. */
const book = (r) => {
  const e = r.game.econ;
  const { trust, loans } = ledger(e);
  return `${trust}/${loans}${r.leaning === 'commons' ? 'C' : 'M'} (${r.sum('aid')}g ${e.loansTaken - e.hatsRefused}f ${e.hatsRefused}r)`;
};
const range = (rs, f) => `${Math.min(...rs.map(f))}-${Math.max(...rs.map(f))}`;
const summary = (label, rs) => `${label.padEnd(16)} ${rs.map((r) => (r.leaning === 'commons' ? 'C' : 'M')).join('')}   gifts ${range(rs, (r) => r.sum('aid'))}, `
  + `forced loans ${range(rs, (r) => r.game.econ.loansTaken - r.game.econ.hatsRefused)}, hats refused ${range(rs, (r) => r.game.econ.hatsRefused)}, balls ${range(rs, (r) => r.sum('balls'))}; `
  + `closest book ${rs.map((r) => ledger(r.game.econ)).sort((a, b) => Math.abs(a.trust - a.loans) - Math.abs(b.trust - b.loans)).slice(0, 1).map((l) => `${l.trust} trust against ${l.loans}`)[0]}`;

test('both endings are reachable, and by choice: waiting for the hat leans commons, never waiting leans mint', (t) => {
  assert.equal(runs.length, SEEDS.length, 'the playthroughs above ran');
  for (const seedN of SEEDS) mintRuns.push(playthrough(seedN, { policy: 'mint' }));
  ledgerTable(t, 'mint bot   ', mintRuns);
  t.diagnostic('each book: trust / what the loans weigh, the leaning, (gifts, forced loans, hats refused)');
  t.diagnostic(`commons bot: ${runs.map(book).join('; ')}`);
  t.diagnostic(`mint bot:    ${mintRuns.map(book).join('; ')}`);

  for (const r of mintRuns) {
    assert.equal(r.game.mode, 'end');
    assert.equal(r.sum('aid'), 0, 'the mint bot never takes a gift');
    assert.equal(r.game.ending, 'mint', 'and is played the Mint\'s ending');
    assert.ok(r.game.econ.hatsRefused >= r.game.econ.loansTaken * 0.6, `most of its ${r.game.econ.loansTaken} loans were hats refused, not loans it had no choice in (${r.game.econ.hatsRefused})`);
  }
  // Every game goes the way its bot chose. (Under the old ledger, every loan 75, one waiting seed in eight could
  // stray to the Mint on a run of busts at the lever; a forced loan now weighs 10 and none does.)
  assert.deepEqual(runs.map((r) => r.leaning), SEEDS.map(() => 'commons'), 'the bot that waits for the hat');
  assert.deepEqual(mintRuns.map((r) => r.leaning), SEEDS.map(() => 'mint'), 'the bot that never does');
  assert.throws(() => playthrough(1, { policy: 'thrift' }), /unknown bot policy "thrift"/);
});

test('the ending is a choice for a weak player too: the mediocre bot leans the way it chose, waiting or not', (t) => {
  assert.equal(mediocreRuns.length, MEDIOCRE_SEEDS.length, 'the mediocre playthroughs above ran');
  const never = MEDIOCRE_SEEDS.map((seedN) => playthrough(seedN, { policy: 'mint', skill: 'mediocre' }));
  ledgerTable(t, 'mediocre, waits', mediocreRuns, MEDIOCRE_SEEDS);
  ledgerTable(t, 'mediocre, never', never, MEDIOCRE_SEEDS);
  t.diagnostic(`mediocre, waits: ${mediocreRuns.map(book).join('; ')}`);
  t.diagnostic(`mediocre, never: ${never.map(book).join('; ')}`);
  t.diagnostic(`the ledger over seeds 1-${SEEDS.length} (steady) and 1-${MEDIOCRE_SEEDS.length} (mediocre), ${content.chapters.length} chapters:`);
  t.diagnostic(summary('steady, waits', runs));
  t.diagnostic(summary('steady, never', mintRuns));
  t.diagnostic(summary('mediocre, waits', mediocreRuns));
  t.diagnostic(summary('mediocre, never', never));

  // This player borrows five or more times as often as the steady one, and nearly all of it for want of a choice
  // when it waits: a town gives four balls at most. Weighing those loans like refusals put all of these in the Mint's book.
  for (const r of mediocreRuns) {
    assert.equal(r.game.econ.hatsRefused, 0);
    assert.ok(r.sum('aid') >= content.chapters.length, `only ${r.sum('aid')} gifts`);
  }
  assert.ok(mean(mediocreRuns.map((r) => r.game.econ.loansTaken)) > 2 * mean(runs.map((r) => r.game.econ.loansTaken)), 'the mediocre bot borrows far more than the steady one');
  assert.deepEqual(mediocreRuns.map((r) => r.leaning), MEDIOCRE_SEEDS.map(() => 'commons'), 'waiting for the hat');
  assert.deepEqual(never.map((r) => r.leaning), MEDIOCRE_SEEDS.map(() => 'mint'), 'never waiting');
  for (const r of [...mediocreRuns, ...never]) assert.equal(r.game.ending, r.leaning);
});
