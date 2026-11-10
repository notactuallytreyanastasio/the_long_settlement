// The authored content, checked against everything it names: cast, tables, backdrops,
// music moods and sound effects. cinema.js and audio.js are imported for their lists only;
// neither touches the DOM at module load.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../src/content/index.js';
import { BACKDROPS } from '../src/shell/cinema.js';
import { SFX_NAMES, MOODS } from '../src/shell/audio.js';
import { SYMBOLS, payoutFor } from '../src/core/slot.js';

const EMOTES = ['smile', 'grim', 'shock', 'tears', 'anger', 'soft'];
const CAMS = ['wide', 'close', 'two', 'low'];
const THREADS = ['duty', 'covert', 'commons'];
const BARK_KEYS = ['launch', 'drain', 'bumper', 'ramp', 'save', 'loan', 'aid', 'jackpot', 'bust', 'idle'];
const LINE_KEYS = new Set(['id', 'who', 'text', 'fx', 'bg', 'on', 'cam', 'music', 'sfx', 'emote']);

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

test('every cinematic opens on a backdrop, and Thorne is only ever heard over the Line', () => {
  for (const ch of content.chapters) {
    const cines = [[`${ch.id}.prologue`, ch.prologue], [`${ch.id}.epilogue`, ch.epilogue], ...ch.scenes.map((s) => [s.id, s.cutscene])];
    for (const [where, lines] of cines) {
      assert.ok(lines.length >= 12 && lines.length <= 30, `${where} has ${lines.length} lines`);
      assert.ok(lines[0].bg !== undefined, `${where} does not set a backdrop on its first line`);
    }
  }
  for (const { line } of allLines()) if (line.who === 'thorne') assert.equal(line.fx, 'radio', `${line.id}: Thorne without the radio`);
});

test('chapters name a real table and every objective id is an element of it', () => {
  assert.equal(content.chapters.length, 2);
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
  const [ch1, ch2] = content.chapters;
  assert.deepEqual(ch1.riggedSpin.reels, ['orb', 'orb', 'orb']);
  for (const s of ch1.riggedSpin.reels) assert.ok(SYMBOLS.includes(s));
  assert.equal(ch1.riggedSpin.payout.writs, 3);
  assert.equal(ch1.riggedSpin.payout.name, payoutFor(['orb', 'orb', 'orb']).name);
  assert.equal(ch2.riggedSpin, null);
});

test('every cast member has a voice, a look and a colour', () => {
  for (const [id, m] of Object.entries(content.cast)) {
    assert.equal(m.id, id);
    assert.ok(m.say.length > 0 && m.rate > 80 && m.rate < 260, `${id}: voice`);
    assert.ok(/^#[0-9a-f]{6}$/i.test(m.color), `${id}: color ${m.color}`);
    assert.ok(m.look && typeof m.look.hairStyle === 'string', `${id}: look`);
  }
});
