import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  currentScene, objectiveProgress, registerHit, litIds, resolveStage, lineSeconds,
} from '../src/core/story.js';

const scene = (objective) => ({ id: 't.s', title: 'T', objective });
const content = {
  chapters: [{
    id: 'c1',
    scenes: [
      scene({ kind: 'all', ids: ['a', 'b', 'c'] }),
      scene({ kind: 'count', ids: ['a', 'b'], n: 3 }),
      scene({ kind: 'sequence', ids: ['a', 'b', 'a'] }),
    ],
  }],
};
const at = (sceneIndex, hits = {}, seq = 0) => ({ chapter: 0, scene: sceneIndex, hits, seq });

test('currentScene: the scene, null past the last, throws for a missing chapter', () => {
  assert.equal(currentScene(content, at(1)), content.chapters[0].scenes[1]);
  assert.equal(currentScene(content, at(3)), null);
  assert.throws(() => currentScene(content, { ...at(0), chapter: 7 }), /no chapter at index 7/);
});

test('objective all: every id once, in any order, repeats do not count', () => {
  const s = content.chapters[0].scenes[0];
  assert.deepEqual(objectiveProgress(s, {}, 0), { done: 0, total: 3, complete: false });
  assert.deepEqual(objectiveProgress(s, { c: 5, a: 1 }, 0), { done: 2, total: 3, complete: false });
  assert.deepEqual(objectiveProgress(s, { c: 5, a: 1, b: 1, z: 9 }, 0), { done: 3, total: 3, complete: true });
});

test('objective count: n hits across ids, capped at n', () => {
  const s = content.chapters[0].scenes[1];
  assert.deepEqual(objectiveProgress(s, { a: 2, z: 40 }, 0), { done: 2, total: 3, complete: false });
  assert.deepEqual(objectiveProgress(s, { a: 2, b: 9 }, 0), { done: 3, total: 3, complete: true });
});

test('objective sequence: follows the cursor', () => {
  const s = content.chapters[0].scenes[2];
  assert.deepEqual(objectiveProgress(s, {}, 2), { done: 2, total: 3, complete: false });
  assert.deepEqual(objectiveProgress(s, {}, 3), { done: 3, total: 3, complete: true });
});

test('objectiveProgress throws on an unknown kind, no ids, or a count without n', () => {
  assert.throws(() => objectiveProgress(scene({ kind: 'most', ids: ['a'] }), {}, 0), /unknown objective kind "most"/);
  assert.throws(() => objectiveProgress(scene({ kind: 'all', ids: [] }), {}, 0), /no ids/);
  assert.throws(() => objectiveProgress(scene({ kind: 'count', ids: ['a'] }), {}, 0), /positive integer n/);
});

test('registerHit: all counts first hits, count counts every hit, sequence ignores wrong hits', () => {
  const [all, count, seq] = content.chapters[0].scenes;
  const hits = Object.freeze({ a: 1 });
  assert.deepEqual(registerHit(all, hits, 0, 'b'), { hits: { a: 1, b: 1 }, seq: 0, progressed: true });
  assert.deepEqual(registerHit(all, hits, 0, 'a'), { hits: { a: 2 }, seq: 0, progressed: false });
  assert.deepEqual(registerHit(all, hits, 0, 'zzz'), { hits, seq: 0, progressed: false });
  assert.deepEqual(registerHit(count, hits, 0, 'a'), { hits: { a: 2 }, seq: 0, progressed: true });
  // sequence a, b, a: at cursor 1 only 'b' moves it, and a wrong hit does not reset
  assert.deepEqual(registerHit(seq, hits, 1, 'a'), { hits, seq: 1, progressed: false });
  assert.deepEqual(registerHit(seq, hits, 1, 'b'), { hits: { a: 1, b: 1 }, seq: 2, progressed: true });
});

test('litIds: what the objective still needs', () => {
  assert.deepEqual(litIds(content, at(0, { b: 1 })), ['a', 'c']);
  assert.deepEqual(litIds(content, at(0, { a: 1, b: 1, c: 1 })), []);
  assert.deepEqual(litIds(content, at(1, { a: 2 })), ['a', 'b']);
  assert.deepEqual(litIds(content, at(1, { a: 3 })), []);
  assert.deepEqual(litIds(content, at(2, {}, 1)), ['b']);
  assert.deepEqual(litIds(content, at(2, {}, 3)), []);
  assert.deepEqual(litIds(content, at(3)), []);
});

test('resolveStage: bg and on persist until changed', () => {
  const lines = [
    { id: '1', text: 'x' },
    { id: '2', text: 'x', bg: 'harbor-night', on: ['ren'] },
    { id: '3', text: 'x' },
    { id: '4', text: 'x', on: ['ren', 'ilse'] },
    { id: '5', text: 'x', bg: 'line', on: [] },
  ];
  assert.deepEqual(resolveStage(lines, 0), { bg: 'black', on: [] });
  assert.deepEqual(resolveStage(lines, 2), { bg: 'harbor-night', on: ['ren'] });
  assert.deepEqual(resolveStage(lines, 3), { bg: 'harbor-night', on: ['ren', 'ilse'] });
  assert.deepEqual(resolveStage(lines, 4), { bg: 'line', on: [] });
  assert.throws(() => resolveStage(lines, 5), /index 5/);
  assert.throws(() => resolveStage([], 0), /index 0/);
});

test('lineSeconds: grows with word count, throws without text', () => {
  const five = lineSeconds({ id: 'a', text: 'one two three four five' });
  const thirty = lineSeconds({ id: 'b', text: Array(30).fill('word').join(' ') });
  assert.ok(Math.abs(five - 2.5) < 1e-9, `five words took ${five}`);
  assert.ok(Math.abs(thirty - 12) < 1e-9, `thirty words took ${thirty}`);
  assert.throws(() => lineSeconds({ id: 'ch1.x' }), /ch1\.x has no text/);
});
