// The authored content, checked against everything it names: cast, tables, backdrops,
// music moods and sound effects. cinema.js and audio.js are imported for their lists only;
// neither touches the DOM at module load.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../src/content/index.js';
import { BACKDROPS } from '../src/shell/cinema.js';
import { SFX_NAMES, MOODS } from '../src/shell/audio.js';
import { SYMBOLS, payoutFor } from '../src/core/slot.js';
import { metSpeakers, eligibleBarks, spokenLines, readsLeaning, LEANINGS } from '../src/core/story.js';
import { collectLines, totals } from '../tools/render-voices.mjs';

const EMOTES = ['smile', 'grim', 'shock', 'tears', 'anger', 'soft'];
const CAMS = ['wide', 'close', 'two', 'low'];
const THREADS = ['duty', 'covert', 'commons'];
const BARK_KEYS = ['launch', 'drain', 'bumper', 'ramp', 'save', 'loan', 'aid', 'jackpot', 'bust', 'idle'];
const LINE_KEYS = new Set(['id', 'who', 'text', 'fx', 'bg', 'on', 'cam', 'music', 'sfx', 'emote', 'minScene', 'lean']);
// The game is five chapters until 6 to 8 are wired into src/content/index.js, and eight after. Nothing between.
const TABLES = ['vessery', 'saltmere', 'halcyon', 'brand', 'tallis', 'kedge', 'fishdock', 'cresset'];
const N = content.chapters.length;

/** Every line with where it sits. */
function allLines() {
  const out = [];
  for (const ch of content.chapters) {
    const take = (lines, where, blocking) => lines.forEach((line, i) => out.push({ line, where: `${where}[${i}]`, blocking, ch }));
    take(ch.prologue, `${ch.id}.prologue`, true);
    for (const sc of ch.scenes) {
      take(sc.briefing, `${sc.id}.briefing`, false);
      take(sc.cutscene, `${sc.id}.cutscene`, true);
    }
    take(ch.epilogue, `${ch.id}.epilogue`, true);
    for (const [key, lines] of Object.entries(ch.barks)) take(lines, `${ch.id}.barks.${key}`, false);
  }
  return out;
}

const elementIds = (t) => [...t.bumpers, ...t.slings, ...t.targets, ...t.rollovers, ...t.shots, ...t.saucers].map((e) => e.id);

test('line ids are unique across the whole game and belong to their chapter', () => {
  const seen = new Map();
  for (const { line, where, ch } of allLines()) {
    assert.equal(typeof line.id, 'string', `${where} has no id`);
    assert.ok(!seen.has(line.id), `duplicate line id ${line.id} at ${seen.get(line.id)} and ${where}`);
    seen.set(line.id, where);
    assert.ok(line.id.startsWith(`${ch.id}.`), `${where}: id ${line.id} does not start with ${ch.id}.`);
  }
  assert.ok(seen.size > 80 * N, `only ${seen.size} lines in ${N} chapters`);
});

test('every line is spoken by a cast member, says something, and uses only contract fields', () => {
  for (const { line, where } of allLines()) {
    assert.ok(content.cast[line.who], `${where} (${line.id}): unknown speaker ${line.who}`);
    assert.ok(typeof line.text === 'string' && line.text.trim().length > 0, `${where} (${line.id}): no text`);
    for (const k of Object.keys(line)) assert.ok(LINE_KEYS.has(k), `${where} (${line.id}): field ${k} is not in the Line contract`);
    if (line.fx !== undefined) assert.equal(line.fx, 'radio', `${line.id} fx`);
    if (line.emote !== undefined) assert.ok(EMOTES.includes(line.emote), `${line.id}: unknown emote ${line.emote}`);
    if (line.cam !== undefined) assert.ok(CAMS.includes(line.cam), `${line.id}: unknown cam ${line.cam}`);
    for (const id of line.on || []) assert.ok(content.cast[id], `${line.id}: ${id} on stage is not in the cast`);
  }
});

test('minScene is only on barks, names a scene of its chapter, and leaves every key something to say in scene 0', () => {
  for (const { line, where, ch } of allLines()) {
    if (line.minScene === undefined) continue;
    assert.ok(where.includes('.barks.'), `${where} (${line.id}): minScene on a line that is not a bark`);
    assert.ok(Number.isInteger(line.minScene) && line.minScene > 0 && line.minScene < ch.scenes.length,
      `${line.id}: minScene ${line.minScene} is not a later scene of ${ch.id}`);
  }
  for (const ch of content.chapters) {
    for (const [key, lines] of Object.entries(ch.barks)) {
      assert.ok(lines.some((l) => l.minScene === undefined), `${ch.id}.barks.${key}: nothing may be said before scene ${Math.min(...lines.map((l) => l.minScene))}`);
    }
  }
});

test('no bark can be spoken by someone the player has not met, and every key always has a voice', () => {
  // The rule is derived from the content: a speaker is met once they have spoken or stood
  // on stage in a cinematic of this chapter or an earlier one (story.metSpeakers).
  const firstHeard = [];
  content.chapters.forEach((ch, c) => {
    ch.scenes.forEach((sc, i) => {
      const game = { chapter: c, scene: i };
      const met = metSpeakers(content, c, i);
      const cinematics = [...content.chapters.slice(0, c).flatMap((x) => [x.prologue, x.epilogue, ...x.scenes.map((y) => y.cutscene)]),
        ch.prologue, ...ch.scenes.slice(0, i).map((y) => y.cutscene)].flat();
      for (const [key, lines] of Object.entries(ch.barks)) {
        const may = eligibleBarks(content, game, key);
        assert.ok(may.length > 0, `${sc.id}: nobody may speak a ${key} bark`);
        for (const line of may) {
          assert.ok(cinematics.some((l) => l.who === line.who || (l.on || []).includes(line.who)),
            `${sc.id}: ${line.id} may be spoken by ${line.who}, who has been in no cinematic yet`);
          assert.ok(line.minScene === undefined || i >= line.minScene, `${line.id} before its minScene`);
        }
        for (const line of lines) {
          if (!may.includes(line) && met.has(line.who)) assert.ok(i < line.minScene, `${sc.id}: ${line.id} is held back for no reason`);
        }
      }
      const speakers = new Set(Object.values(ch.barks).flat().map((l) => l.who));
      for (const who of speakers) {
        if (met.has(who) && !firstHeard.some((f) => f.who === who)) firstHeard.push({ who, at: sc.id });
      }
    });
  });
  console.log(`bark speakers, by the first scene their barks can play in: ${firstHeard.map((f) => `${f.who} ${f.at}`).join(', ')}`);
  // Tobb is the one the report was about: he is met in the cutscene that ends ch1.s3.
  const at = (who) => firstHeard.find((f) => f.who === who).at;
  assert.equal(at('tobb'), 'ch1.s4');
  assert.equal(at('thorne'), 'ch1.s1', 'heard over the Line in the prologue');
  assert.equal(at('ren'), 'ch1.s1');
  const tobbLines = Object.values(content.chapters[0].barks).flat().filter((l) => l.who === 'tobb');
  assert.ok(tobbLines.length >= 5 && tobbLines.every((l) => l.minScene === undefined), 'the chapter itself does not hold Tobb back; the picker does');
});

test('every table carries the Reels: three top lanes that fill them and the saucer, ramp and orbit that spin them', () => {
  for (const [id, t] of Object.entries(content.tables)) {
    assert.ok(t.reels, `${id} has no reels`);
    assert.deepEqual(Object.keys(t.reels).sort(), ['fill', 'spin']);
    const { fill, spin } = t.reels;
    assert.equal(fill.length, 3, `${id} fill`);
    assert.equal(new Set(fill).size, 3);
    const lanes = fill.map((x) => t.rollovers.find((r) => r.id === x));
    lanes.forEach((r, i) => assert.ok(r, `${id}: fill[${i}] ${fill[i]} is not a rollover`));
    assert.equal(new Set(lanes.map((r) => r.group)).size, 1, `${id}: the fill lanes are one group`);
    assert.ok(lanes[0].pos[0] < lanes[1].pos[0] && lanes[1].pos[0] < lanes[2].pos[0], `${id}: fill is left to right, reel 0 first`);
    assert.ok(lanes.every((r) => r.pos[1] < 200), `${id}: fill lanes are the top lanes`);
    // spin: every saucer and every shot, and nothing else
    assert.deepEqual([...spin].sort(), [...t.saucers, ...t.shots].map((e) => e.id).sort(), `${id} spin`);
    assert.ok(t.shots.some((x) => x.exit) && t.shots.some((x) => !x.exit), `${id}: a ramp and an orbit`);
    assert.equal(t.saucers.length, 1);
    // a kickback needs an inlane beside each outlane
    for (const x of ['outL', 'inL', 'outR', 'inR']) assert.ok(t.rollovers.some((r) => r.id === x), `${id} has no ${x}`);
  }
});

test('every backdrop a line names is one cinema.js can paint', () => {
  const used = new Set();
  for (const { line } of allLines()) {
    if (line.bg === undefined) continue;
    assert.ok(BACKDROPS.includes(line.bg), `${line.id}: backdrop ${line.bg} is not implemented (have ${BACKDROPS.join(', ')})`);
    used.add(line.bg);
  }
  assert.ok(used.size >= 10, `only ${used.size} backdrops used`);
});

test('every music mood and sound effect a line or chapter names is one audio.js can play', () => {
  for (const { line } of allLines()) {
    if (line.music !== undefined) assert.ok(MOODS.includes(line.music), `${line.id}: unknown music mood ${line.music}`);
    if (line.sfx !== undefined) assert.ok(SFX_NAMES.includes(line.sfx), `${line.id}: unknown sfx ${line.sfx}`);
  }
  for (const ch of content.chapters) {
    assert.ok(MOODS.includes(ch.music.play), `${ch.id}: unknown play mood ${ch.music.play}`);
    assert.ok(MOODS.includes(ch.music.cine), `${ch.id}: unknown cinematic mood ${ch.music.cine}`);
  }
});

test('every cinematic opens on a backdrop, and Thorne is heard over the Line unless she is in the room', () => {
  for (const ch of content.chapters) {
    const cines = [[`${ch.id}.prologue`, ch.prologue], [`${ch.id}.epilogue`, ch.epilogue], ...ch.scenes.map((s) => [s.id, s.cutscene])];
    for (const [where, all] of cines) {
      // each ending's version of a cinematic is held to what a cinematic is held to
      for (const lean of LEANINGS) {
        const lines = spokenLines(all, lean);
        const which = lines === all ? where : `${where} (${lean})`;
        assert.ok(lines.length >= 12 && lines.length <= 30, `${which} has ${lines.length} lines`);
        assert.ok(lines[0].bg !== undefined, `${which} does not set a backdrop on its first line`);
      }
    }
  }
  // The bible: Thorne is "always fx:'radio' unless physically present". In a cinematic, present
  // means on stage (the `on` list, carried forward); the two must agree line by line.
  let inPerson = 0;
  for (const ch of content.chapters) {
    const cines = [ch.prologue, ch.epilogue, ...ch.scenes.map((s) => s.cutscene)];
    for (const all of cines) {
      // the stage is carried forward over the lines actually played, so each ending is walked on its own
      const versions = all.some((l) => l.lean !== undefined) ? LEANINGS.map((lean) => spokenLines(all, lean)) : [all];
      for (const lines of versions) {
        let on = [];
        for (const line of lines) {
          if (line.on !== undefined) on = line.on;
          if (line.who !== 'thorne') continue;
          const present = on.includes('thorne');
          if (present) inPerson++;
          assert.equal(line.fx === 'radio', !present,
            `${line.id}: Thorne is ${present ? 'on stage but speaks over the radio' : 'not on stage but speaks without the radio'}`);
        }
      }
    }
    // Over live play there is no stage. She is in the room only at Halcyon Reach (chapter 3).
    const loose = [...ch.scenes.flatMap((s) => s.briefing), ...Object.values(ch.barks).flat()];
    for (const line of loose) {
      // (and aboard the cutter at Vessery, chapter 7, where the bible puts her in person)
      if (line.who === 'thorne' && line.fx !== 'radio') assert.ok(['ch3', 'ch7'].includes(ch.id), `${line.id}: Thorne without the radio outside Halcyon Reach and Vessery`);
    }
  }
  assert.ok(inPerson > 0, 'Thorne is never met in person');
});

test('chapters name a real table and every objective id is an element of it', () => {
  assert.ok(N === 5 || N === 8, `${N} chapters: the game is five, or all eight`);
  assert.deepEqual(content.chapters.map((ch) => ch.tableId), TABLES.slice(0, N));
  assert.deepEqual(content.chapters.map((ch) => ch.id), TABLES.slice(0, N).map((_, i) => `ch${i + 1}`));
  content.chapters.forEach((ch, i) => {
    assert.equal(ch.number, i + 1);
    const table = content.tables[ch.tableId];
    assert.ok(table, `${ch.id}: unknown table ${ch.tableId}`);
    const ids = new Set(elementIds(table));
    assert.equal(ch.scenes.length, 7, `${ch.id} scene count`);
    ch.scenes.forEach((sc, j) => {
      assert.equal(sc.id, `${ch.id}.s${j + 1}`);
      assert.ok(THREADS.includes(sc.thread), `${sc.id}: unknown thread ${sc.thread}`);
      assert.ok(sc.hint.length > 0 && sc.hint.length < 60, `${sc.id}: hint is ${sc.hint.length} chars`);
      assert.ok(['all', 'count', 'sequence'].includes(sc.objective.kind), `${sc.id}: objective kind ${sc.objective.kind}`);
      assert.ok(sc.objective.ids.length > 0, `${sc.id}: objective has no ids`);
      for (const id of sc.objective.ids) assert.ok(ids.has(id), `${sc.id}: objective id ${id} is not on table ${table.id}`);
      if (sc.objective.kind === 'count') assert.ok(Number.isInteger(sc.objective.n) && sc.objective.n > 0, `${sc.id}: count n`);
      // (counted as heard: a briefing that branches is one to three lines in each ending)
      for (const lean of LEANINGS) {
        const heard = spokenLines(sc.briefing, lean).length;
        assert.ok(heard >= 1 && heard <= 3, `${sc.id}: ${heard} briefing lines${heard === sc.briefing.length ? '' : ` when the ledger leans ${lean}`}`);
      }
      assert.ok(sc.reward.points > 0, `${sc.id}: reward`);
    });
    for (const key of BARK_KEYS) assert.ok(Array.isArray(ch.barks[key]) && ch.barks[key].length > 0, `${ch.id}: no barks for ${key}`);
    for (const key of Object.keys(ch.barks)) assert.ok(BARK_KEYS.includes(key), `${ch.id}: bark key ${key} is never played`);
  });
});

test('all three threads are played in each chapter: duty, espionage and the commons', () => {
  for (const ch of content.chapters) {
    const threads = new Set(ch.scenes.map((s) => s.thread));
    assert.deepEqual([...threads].sort(), [...THREADS].sort(), `${ch.id} threads`);
    assert.ok(ch.scenes.some((s) => (s.reward.trust || 0) > 0), `${ch.id}: no scene earns trust`);
  }
});

test('the rigged first spin is three orbs and pays what the reels would pay in writs', () => {
  const [ch1, ...later] = content.chapters;
  assert.deepEqual(ch1.riggedSpin.reels, ['orb', 'orb', 'orb']);
  for (const s of ch1.riggedSpin.reels) assert.ok(SYMBOLS.includes(s));
  assert.equal(ch1.riggedSpin.payout.writs, 3);
  assert.equal(ch1.riggedSpin.payout.name, payoutFor(['orb', 'orb', 'orb'], 'lever').name);
  for (const ch of later) assert.equal(ch.riggedSpin, null, `${ch.id} has a rigged spin`);
});

test('every cast member has a voice, a look and a colour', () => {
  for (const [id, m] of Object.entries(content.cast)) {
    assert.equal(m.id, id);
    assert.ok(m.say.length > 0 && m.rate > 80 && m.rate < 260, `${id}: voice`);
    assert.ok(/^#[0-9a-f]{6}$/i.test(m.color), `${id}: color ${m.color}`);
    assert.ok(m.look && typeof m.look.hairStyle === 'string', `${id}: look`);
  }
});

// ───────────────────────── the leaning branch, as authored ─────────────────────────

test('lean is commons or mint, never on a bark, and each ending of a branching passage has lines of its own', () => {
  let marked = 0;
  for (const { line, where } of allLines()) {
    if (line.lean === undefined) continue;
    marked++;
    assert.ok(LEANINGS.includes(line.lean), `${where} (${line.id}): lean ${JSON.stringify(line.lean)} is not one of ${LEANINGS.join(', ')}`);
    assert.ok(!where.includes('.barks.'), `${where} (${line.id}): a bark cannot carry lean; barks do not branch`);
  }
  for (const ch of content.chapters) {
    const passages = [[`${ch.id}.prologue`, ch.prologue], [`${ch.id}.epilogue`, ch.epilogue],
      ...ch.scenes.flatMap((s) => [[`${s.id}.briefing`, s.briefing], [`${s.id}.cutscene`, s.cutscene]])];
    for (const [where, lines] of passages) {
      const sides = LEANINGS.map((lean) => lines.filter((l) => l.lean === lean).length);
      // one-sided is allowed (a line only one ending has), but a briefing must still say something either way
      if (where.endsWith('.briefing')) for (const lean of LEANINGS) {
        const n = spokenLines(lines, lean).length;
        assert.ok(n >= 1 && n <= 3, `${where}: ${n} briefing lines when the ledger leans ${lean}`);
      }
      if (sides[0] + sides[1] > 0) console.log(`${where}: ${lines.length - sides[0] - sides[1]} shared lines, ${sides[0]} commons, ${sides[1]} mint`);
    }
  }
  console.log(`${marked} lines carry lean`);
});

test('the ending cannot change sides: in the last chapter no scene line that leans is heard before the ledger is read', () => {
  const last = content.chapters[N - 1];
  const reads = last.scenes.findIndex((_, j) => readsLeaning(content, N - 1, j));
  assert.ok(reads >= 0, 'the ledger is read somewhere in the last chapter');
  last.scenes.forEach((sc, j) => {
    // scene j's briefing is spoken while scene j is played, its cutscene when scene j clears
    const before = [...(j <= reads && j > 0 ? sc.briefing : []), ...(j < reads ? sc.cutscene : [])].filter((l) => l.lean !== undefined);
    assert.deepEqual(before.map((l) => l.id), [], `${sc.id}: lean lines before the ledger is read (when ${last.scenes[reads].id} clears)`);
  });
  // Allowed by the contract, and worth knowing about: lean lines chosen by books that can still change.
  const live = allLines().filter(({ line, where, ch }) => line.lean !== undefined
    && (ch !== last || where.includes('.prologue') || where.startsWith(`${last.scenes[0].id}.briefing`)));
  console.log(`the ledger is read when ${last.scenes[reads].id} clears; ${live.length} lean lines are chosen by the live books before that`
    + `${live.length ? `: ${live.map((x) => x.line.id).join(', ')}` : ''}`);
});

test('a chapter that renames a role names a cast member and keeps it short enough for the plate', () => {
  for (const ch of content.chapters) {
    if (ch.roles === undefined) continue;
    assert.ok(ch.roles && typeof ch.roles === 'object' && !Array.isArray(ch.roles), `${ch.id}.roles must be an object`);
    for (const [id, role] of Object.entries(ch.roles)) {
      assert.ok(content.cast[id], `${ch.id}.roles names ${id}, who is not in the cast`);
      assert.ok(id !== 'narrator' && id !== 'crowd', `${ch.id}.roles: ${id} has no plate role to change`);
      assert.ok(typeof role === 'string' && role.trim().length > 0 && role.length <= 34, `${ch.id}.roles.${id}: ${JSON.stringify(role)} must be 1 to 34 characters`);
    }
  }
});

test('the end screen text: both endings or neither, on the last chapter only', () => {
  content.chapters.forEach((ch, i) => {
    if (ch.endings === undefined) return;
    assert.equal(i, N - 1, `${ch.id} has endings but is not the last chapter`);
    assert.deepEqual(Object.keys(ch.endings).sort(), [...LEANINGS].sort(), `${ch.id}.endings keys`);
    for (const lean of LEANINGS) {
      const e = ch.endings[lean];
      assert.deepEqual(Object.keys(e).sort(), ['text', 'title'], `${ch.id}.endings.${lean} keys`);
      assert.ok(typeof e.title === 'string' && e.title.trim().length > 0 && e.title.length <= 40, `${ch.id}.endings.${lean}.title`);
      assert.ok(typeof e.text === 'string' && e.text.trim().length > 0 && e.text.length <= 400, `${ch.id}.endings.${lean}.text is ${e.text.length} chars`);
    }
  });
  if (N === 8) assert.ok(content.chapters[7].endings, 'chapter 8 says what each ending is called');
});

test('the two new speakers are cast, and no voice name is in two lists', () => {
  for (const id of ['foss', 'tamsin']) assert.ok(content.cast[id], `${id} is not in the cast`);
  assert.match(content.cast.foss.role, /418/);
  assert.match(content.cast.tamsin.role, /Carrow/);
  const names = Object.values(content.cast).flatMap((m) => m.say.map((n) => [n, m.id]));
  const seen = new Map();
  for (const [n, id] of names) {
    assert.ok(!seen.has(n), `voice ${n} is in the lists of both ${seen.get(n)} and ${id}`);
    seen.set(n, id);
  }
});

test('render-voices takes every line of both endings, and its totals keep them apart', () => {
  const lines = collectLines(content);
  assert.equal(lines.length, allLines().length, 'every line, whatever its lean');
  const L = (id, who, text, lean) => ({ id, who, text, ...(lean ? { lean } : {}) });
  const fixture = { cast: content.cast, chapters: [{
    id: 'fx', prologue: [L('fx.pro.01', 'narrator', 'Before.')],
    scenes: [{ id: 'fx.s1', briefing: [L('fx.s1.b1', 'ren', 'Go.')], cutscene: [L('fx.s1.c01', 'ilse', 'Held.', 'commons'), L('fx.m1.c01', 'ilse', 'Broke.', 'mint')] }],
    epilogue: [L('fx.epi.01', 'tamsin', 'Renny.', 'commons'), L('fx.epi.02', 'tamsin', 'Sit down.', 'commons'), L('fx.mepi.01', 'tamsin', 'Renny.', 'mint')],
    barks: { launch: [L('fx.bark.launch.1', 'foss', 'Noted.')] },
  }] };
  const got = collectLines(fixture);
  assert.deepEqual(got.map((l) => l.id), ['fx.pro.01', 'fx.s1.b1', 'fx.s1.c01', 'fx.m1.c01', 'fx.epi.01', 'fx.epi.02', 'fx.mepi.01', 'fx.bark.launch.1']);
  const manifest = Object.fromEntries(got.filter((l) => l.id !== 'fx.mepi.01').map((l) => [l.id, { seconds: 2 }]));
  const sum = totals(got, manifest, { tamsin: 'Tara' });
  assert.deepEqual([sum.all, sum.shared, sum.commons, sum.mint], [
    { lines: 8, seconds: 14 }, { lines: 3, seconds: 6 }, { lines: 3, seconds: 6 }, { lines: 2, seconds: 2 },
  ]);
  assert.deepEqual(sum.missing, ['fx.mepi.01'], 'a line with no rendered file is counted and named');
  assert.deepEqual(sum.speakers.tamsin, { lines: 3, seconds: 4, voice: 'Tara' });
  const bad = { ...fixture, chapters: [{ ...fixture.chapters[0], epilogue: [L('fx.epi.01', 'tamsin', 'Renny.', 'both')] }] };
  assert.throws(() => collectLines(bad), /fx\.epilogue\[0\]: line "fx\.epi\.01" has lean "both"; it must be one of commons, mint or absent/);
});
