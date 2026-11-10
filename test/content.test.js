// The authored content, checked against everything it names: cast, tables, backdrops,
// music moods and sound effects. cinema.js and audio.js are imported for their lists only;
// neither touches the DOM at module load.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../src/content/index.js';
import { BACKDROPS } from '../src/shell/cinema.js';
import { SFX_NAMES, MOODS } from '../src/shell/audio.js';
import { SYMBOLS, payoutFor } from '../src/core/slot.js';
import { metSpeakers, eligibleBarks } from '../src/core/story.js';

const EMOTES = ['smile', 'grim', 'shock', 'tears', 'anger', 'soft'];
const CAMS = ['wide', 'close', 'two', 'low'];
const THREADS = ['duty', 'covert', 'commons'];
const BARK_KEYS = ['launch', 'drain', 'bumper', 'ramp', 'save', 'loan', 'aid', 'jackpot', 'bust', 'idle'];
const LINE_KEYS = new Set(['id', 'who', 'text', 'fx', 'bg', 'on', 'cam', 'music', 'sfx', 'emote', 'minScene']);

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
  assert.ok(seen.size > 400, `only ${seen.size} lines`);
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
    assert.ok(MOODS.includes(ch.music.slot), `${ch.id}: unknown slot mood ${ch.music.slot}`);
  }
});

test('every cinematic opens on a backdrop, and Thorne is heard over the Line unless she is in the room', () => {
  for (const ch of content.chapters) {
    const cines = [[`${ch.id}.prologue`, ch.prologue], [`${ch.id}.epilogue`, ch.epilogue], ...ch.scenes.map((s) => [s.id, s.cutscene])];
    for (const [where, lines] of cines) {
      assert.ok(lines.length >= 12 && lines.length <= 30, `${where} has ${lines.length} lines`);
      assert.ok(lines[0].bg !== undefined, `${where} does not set a backdrop on its first line`);
    }
  }
  // The bible: Thorne is "always fx:'radio' unless physically present". In a cinematic, present
  // means on stage (the `on` list, carried forward); the two must agree line by line.
  let inPerson = 0;
  for (const ch of content.chapters) {
    const cines = [ch.prologue, ch.epilogue, ...ch.scenes.map((s) => s.cutscene)];
    for (const lines of cines) {
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
    // Over live play there is no stage. She is in the room only at Halcyon Reach (chapter 3).
    const loose = [...ch.scenes.flatMap((s) => s.briefing), ...Object.values(ch.barks).flat()];
    for (const line of loose) {
      if (line.who === 'thorne' && line.fx !== 'radio') assert.equal(ch.id, 'ch3', `${line.id}: Thorne without the radio outside Halcyon Reach`);
    }
  }
  assert.ok(inPerson > 0, 'Thorne is never met in person');
});

test('chapters name a real table and every objective id is an element of it', () => {
  assert.equal(content.chapters.length, 5);
  assert.deepEqual(content.chapters.map((ch) => ch.tableId), ['vessery', 'saltmere', 'halcyon', 'brand', 'tallis']);
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
      assert.ok(sc.briefing.length >= 1 && sc.briefing.length <= 3, `${sc.id}: ${sc.briefing.length} briefing lines`);
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
