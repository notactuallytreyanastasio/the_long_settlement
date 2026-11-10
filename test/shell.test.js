// The pure parts of the shell: where things are on the screen, and what the one button says.
// The rest of the shell needs a browser and is driven there, not here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../src/content/index.js';
import { init, update, leverStatus, AID_WAIT, LEVER_DELAY } from '../src/core/game.js';
import { STEP } from '../src/core/physics.js';
import { SPIN_COST } from '../src/core/economy.js';
import { computeLayout, toLogical, wantsRotate, ROTATE_BELOW } from '../src/shell/layout.js';
import { launchState } from '../src/shell/render.js';

const inside = (L, r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= L.W && r.y + r.h <= L.H;
const discIn = (L, d) => d.x - d.r >= 0 && d.y - d.r >= 0 && d.x + d.r <= L.W && d.y + d.r <= L.H;

test('layout: upright is the portrait cabinet, anything else the wide one', () => {
  assert.equal(computeLayout(393, 852).kind, 'portrait');
  assert.deepEqual([computeLayout(393, 852).W, computeLayout(393, 852).H], [430, 932]);
  assert.equal(computeLayout(852, 393).kind, 'wide');
  assert.equal(computeLayout(800, 800).kind, 'wide');
  assert.deepEqual([computeLayout(1440, 900).W, computeLayout(1440, 900).H], [1280, 800]);
  assert.throws(() => computeLayout(0, 852), /positive finite size, got 0 x 852/);
  assert.throws(() => computeLayout(NaN, 852), /got NaN x 852/);
});

test('layout: every rectangle and control is on the canvas, and the table fits', () => {
  for (const L of [computeLayout(393, 852), computeLayout(1440, 900)]) {
    for (const k of ['hud', 'story', 'skip']) assert.ok(inside(L, L[k]), `${L.kind}.${k}`);
    assert.ok(inside(L, L.cine.art) && inside(L, L.cine.text), `${L.kind}.cine`);
    for (const k of ['launch', 'mute']) assert.ok(discIn(L, L[k]), `${L.kind}.${k}`);
    assert.ok(L.table.x >= 0 && L.table.x + 400 * L.table.scale <= L.W, `${L.kind}: table width`);
    assert.ok(L.table.y >= 0 && L.table.y + 800 * L.table.scale <= L.H, `${L.kind}: table height`);
  }
});

test('layout, portrait: the launch button is clear of the right flipper on every table, and of the head', () => {
  const L = computeLayout(393, 852);
  assert.ok(L.launch.x > L.W / 2, 'bottom right');
  assert.ok(L.launch.y - L.launch.r >= L.story.y + L.story.h, 'below the story strip');
  assert.ok(L.table.y >= L.story.y + L.story.h, 'the story strip is above the table, never over the flippers');
  for (const table of Object.values(content.tables)) {
    const fr = table.flippers.find((f) => f.id === 'fr');
    // the flipper sweeps from its pivot toward the middle; nothing of it is right of pivot + radius
    const reach = L.table.x + (fr.pivot[0] + fr.radius) * L.table.scale;
    assert.ok(L.launch.x - L.launch.r > reach, `${table.id}: button edge ${L.launch.x - L.launch.r} against flipper ${reach.toFixed(1)}`);
  }
});

test('layout: toLogical maps the canvas rect onto the logical canvas', () => {
  const L = computeLayout(393, 852);
  const rect = { left: 0, top: 0, width: 393, height: 851.8 };
  assert.deepEqual(toLogical(L, rect, 0, 0), [0, 0]);
  const [x, y] = toLogical(L, rect, 393, 851.8);
  assert.ok(Math.abs(x - 430) < 1e-9 && Math.abs(y - 932) < 1e-9);
  assert.throws(() => toLogical(L, { left: 0, top: 0, width: 0, height: 10 }, 1, 1), /no area/);
  assert.throws(() => toLogical(null, rect, 1, 1), /not a layout/);
});

test('layout: a cinematic has its own mute button, on the canvas, clear of the skip button and of the home bar', () => {
  // what input.js does with a disc and a rect: hit radius max(26, r * 1.3), rect padded by 8
  const hitR = (d) => Math.max(26, d.r * 1.3);
  for (const L of [computeLayout(393, 852), computeLayout(1440, 900)]) {
    const m = L.cine.mute, s = L.skip;
    assert.ok(discIn(L, m), `${L.kind}.cine.mute is on the canvas`);
    const nx = Math.max(s.x - 8, Math.min(m.x, s.x + s.w + 8)), ny = Math.max(s.y - 8, Math.min(m.y, s.y + s.h + 8));
    assert.ok(Math.hypot(m.x - nx, m.y - ny) > hitR(m), `${L.kind}: a thumb on mute is not on skip (${Math.hypot(m.x - nx, m.y - ny).toFixed(1)} px apart, reach ${hitR(m)})`);
    assert.ok(Math.abs(m.y - (s.y + s.h / 2)) <= 2, `${L.kind}: it sits on the skip button's row`);
  }
  const P = computeLayout(393, 852);
  assert.ok(P.cine.mute.y + P.cine.mute.r <= P.H - 38, 'portrait: above the home indicator (38 logical px)');
  assert.ok(P.cine.mute.y - P.cine.mute.r >= P.cine.art.y + P.cine.art.h, 'portrait: under the painting, with the words');
  // the play-mode mute button is where the wide skip button is: that is why a cinematic needs its own
  const Wd = computeLayout(1440, 900);
  assert.ok(Wd.mute.x > Wd.skip.x && Wd.mute.x < Wd.skip.x + Wd.skip.w && Wd.mute.y > Wd.skip.y && Wd.mute.y < Wd.skip.y + Wd.skip.h);
});

test('layout: only a phone on its side is asked to turn upright', () => {
  assert.equal(wantsRotate(852, 393, true), true, 'an iPhone on its side');
  assert.equal(wantsRotate(932, 430, true), true, 'the largest iPhone on its side');
  assert.equal(wantsRotate(393, 852, true), false, 'upright');
  assert.equal(wantsRotate(852, 393, false), false, 'a short desktop window has a keyboard');
  assert.equal(wantsRotate(1180, 820, true), false, 'a tablet on its side is tall enough for the wide cabinet');
  assert.equal(wantsRotate(1000, ROTATE_BELOW, true), false, 'the limit itself is tall enough');
  assert.equal(wantsRotate(1000, ROTATE_BELOW - 1, true), true);
  assert.equal(wantsRotate(852, 393, undefined), false, 'not knowing is not touch');
  assert.throws(() => wantsRotate(0, 393, true), /positive finite size, got 0 x 393/);
});

// ── the button says what the core will do ──

const IDLE = { left: false, right: false, plunge: false, nudge: null };
const tick = (g, n, input = IDLE) => { for (let i = 0; i < n; i++) g = update(content, g, { type: 'tick', dt: STEP, input }).game; return g; };
const atTable = (econ = {}) => {
  let g = init(3);
  for (const m of [{ type: 'confirm' }, { type: 'confirm' }, { type: 'skip' }]) g = update(content, g, m).game;
  assert.equal(g.mode, 'play');
  return { ...g, econ: { ...g.econ, ...econ } };
};

test('launchState: follows leverStatus through the free pull, a paid pull, a loan and the hat', () => {
  let g = atTable();
  assert.equal(launchState(content, g).kind, 'idle', 'the moment the table opens the button is not yet the lever');
  g = tick(g, Math.ceil(LEVER_DELAY / STEP) + 2);
  assert.equal(leverStatus(content, g), 'free');
  assert.equal(launchState(content, g).kind, 'free');

  const spent = { ...g, spunThisChapter: true };
  assert.equal(launchState(content, { ...spent, econ: { ...spent.econ, marks: SPIN_COST, trust: 0 } }).kind, 'lever');
  assert.equal(launchState(content, { ...spent, econ: { ...spent.econ, marks: SPIN_COST - 1, trust: 0 } }).kind, 'loan');

  // the town will cover a ball: the button must not offer aid for a press, because a press borrows
  const hat = { ...spent, emptyT: AID_WAIT / 2, econ: { ...spent.econ, marks: 0, trust: 50, aidUsed: 0 } };
  assert.equal(leverStatus(content, hat), 'credit');
  const s = launchState(content, hat);
  assert.equal(s.kind, 'credit');
  assert.ok(Math.abs(s.hat - 0.5) < 1e-9, 'how near the hat is');

  // pulled: busy while the reels turn, then a ball is waiting
  g = tick(g, 1, { ...IDLE, plunge: true });
  assert.equal(launchState(content, g).kind, 'busy');
  g = tick(g, Math.ceil(2 / STEP));
  assert.ok(g.econ.writs > 0);
  assert.equal(launchState(content, g).kind, 'launch');
});

test('launchState: fails loudly on a game without reels', () => {
  assert.throws(() => launchState(content, { ...atTable(), reels: undefined }), /game\.reels is missing/);
});
