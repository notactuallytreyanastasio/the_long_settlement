// The 3D renderer's layout (layout.js computeGlLayout): pure numbers. What is drawn into these rectangles needs a
// browser with WebGL2 and is looked at there, not here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { content } from '../src/content/index.js';
import { computeGlLayout, computeLayout, toLogical, GL_W, GL_MIN_H, GL_MAX_H } from '../src/shell/layout.js';

const inside = (L, r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= L.W + 1e-9 && r.y + r.h <= L.H + 1e-9;
const discIn = (L, d) => d.x - d.r >= 0 && d.y - d.r >= 0 && d.x + d.r <= L.W && d.y + d.r <= L.H;
// what input.js does with a disc and a rect: hit radius max(26, r * 1.3), rect padded by 8
const hitR = (d) => Math.max(26, d.r * 1.3);
const discHitsRect = (d, b) => {
  const nx = Math.max(b.x - 8, Math.min(d.x, b.x + b.w + 8)), ny = Math.max(b.y - 8, Math.min(d.y, b.y + b.h + 8));
  return Math.hypot(d.x - nx, d.y - ny) <= hitR(d);
};

// a tall phone as a home-screen app, the same phone in a Safari tab, a small phone, a tablet upright
const PORTRAITS = [[393, 852], [393, 660], [375, 667], [430, 932], [320, 568], [768, 1024]];
const WIDES = [[1440, 900], [852, 393], [800, 800]];

test('gl layout: portrait is 430 wide and as tall as the glass, within limits; anything else is the wide one', () => {
  assert.deepEqual([computeGlLayout(393, 852).W, computeGlLayout(393, 852).H], [430, 932]);
  assert.equal(computeGlLayout(393, 660).H, Math.round((430 * 660) / 393), 'a Safari tab is not letterboxed');
  assert.equal(computeGlLayout(768, 1024).H, GL_MIN_H, 'a squat screen gets the shortest layout and side bars');
  assert.equal(computeGlLayout(300, 900).H, GL_MAX_H, 'a very tall one gets the tallest');
  for (const [w, h] of PORTRAITS) { const L = computeGlLayout(w, h); assert.equal(L.kind, 'portrait'); assert.equal(L.W, GL_W); }
  for (const [w, h] of WIDES) { const L = computeGlLayout(w, h); assert.equal(L.kind, 'wide'); assert.deepEqual([L.W, L.H], [1280, 800]); }
  assert.throws(() => computeGlLayout(0, 852), /positive finite size, got 0 x 852/);
  assert.throws(() => computeGlLayout(393, Infinity), /got 393 x Infinity/);
});

test('gl layout: the same viewport gives the same object, so a caller can see a resize by identity', () => {
  assert.equal(computeGlLayout(393, 852), computeGlLayout(393, 852));
  assert.equal(computeGlLayout(393, 852), computeGlLayout(786, 1704));
  assert.notEqual(computeGlLayout(393, 852), computeGlLayout(393, 660));
  assert.ok(Object.isFrozen(computeGlLayout(393, 852)) && Object.isFrozen(computeGlLayout(393, 852).gl));
});

test('gl layout: it is a Layout input.js can read, and the 2D layout is untouched', () => {
  for (const [w, h] of [...PORTRAITS, ...WIDES]) {
    const L = computeGlLayout(w, h), g = L.gl;
    assert.equal(L.launch, g.launch); assert.equal(L.mute, g.mute); assert.equal(L.skip, g.skip); assert.equal(L.cine.mute, g.cineMute); assert.equal(L.cine.text, g.sub);
    assert.deepEqual(L.table, g.tableFit);
    const rect = { left: 10, top: 20, width: L.W / 2, height: L.H / 2 };
    assert.deepEqual(toLogical(L, rect, 10 + L.W / 2, 20 + L.H / 2), [L.W, L.H]);
  }
  assert.equal(computeLayout(393, 852).gl, undefined);
  assert.deepEqual(computeLayout(393, 852).table, { x: 31, y: 184, scale: 0.92 });
});

test('gl layout: everything is on the canvas', () => {
  for (const [w, h] of [...PORTRAITS, ...WIDES]) {
    const L = computeGlLayout(w, h), g = L.gl, at = `${w}x${h}`;
    for (const k of ['band', 'table', 'reels', 'flippers', 'skip', 'sub']) assert.ok(inside(L, g[k]), `${at} ${k} ${JSON.stringify(g[k])}`);
    for (const k of ['launch', 'mute', 'cineMute']) assert.ok(discIn(L, g[k]), `${at} ${k}`);
    assert.ok(g.tableFit.x >= 0 && g.tableFit.x + 400 * g.tableFit.scale <= L.W, `${at}: table width`);
    assert.ok(g.tableFit.y >= 0 && g.tableFit.y + 800 * g.tableFit.scale <= L.H, `${at}: table height`);
  }
});

test('gl layout, portrait: the stage band is on top, the table fills the rest, and its foot is always 12 px from the bottom', () => {
  for (const [w, h] of PORTRAITS) {
    const L = computeGlLayout(w, h), g = L.gl, at = `${w}x${h}`;
    assert.deepEqual([g.band.x, g.band.y, g.band.w], [0, 0, L.W], `${at}: the band spans the top`);
    assert.ok(g.band.h >= 168 && g.band.h <= 220, `${at}: band height ${g.band.h}`);
    assert.ok(g.table.y <= g.band.h && g.table.y >= g.band.h - 16, `${at}: no gap between the band and the table's viewport`);
    assert.equal(g.table.y + g.table.h, L.H, `${at}: the table's viewport reaches the bottom`);
    assert.ok(Math.abs(g.tableFit.y + 800 * g.tableFit.scale - (L.H - 12)) < 1e-9, `${at}: the foot`);
    assert.ok(Math.abs(g.tableFit.x + 200 * g.tableFit.scale - L.W / 2) < 1e-9, `${at}: centred`);
    assert.ok(Math.abs(g.table.x + g.table.w / 2 - (g.tableFit.x + 200 * g.tableFit.scale)) < 1e-9, `${at}: the viewport is centred on the table (app.js widens the 3D view to it)`);
  }
  assert.equal(computeGlLayout(393, 852).gl.band.h, 220);
});

test('gl layout, wide: the stage is the left of the canvas and the table stands in the right', () => {
  const L = computeGlLayout(1440, 900), g = L.gl;
  assert.deepEqual([g.band.x, g.band.y, g.band.h], [0, 0, L.H]);
  assert.equal(g.table.x, g.band.w); assert.equal(g.table.x + g.table.w, L.W);
  assert.ok(g.tableFit.x >= g.table.x && g.tableFit.x + 400 * g.tableFit.scale <= L.W);
  assert.ok(Math.abs(g.table.x + g.table.w / 2 - (g.tableFit.x + 200 * g.tableFit.scale)) < 1e-9);
});

test('gl layout: the touch contract. Launch is bottom right, clear of the right flipper on every table; mute and skip do not overlap', () => {
  for (const [w, h] of [...PORTRAITS, ...WIDES]) {
    const L = computeGlLayout(w, h), g = L.gl, at = `${w}x${h}`;
    const midX = g.tableFit.x + 200 * g.tableFit.scale;
    assert.ok(g.launch.x > midX, `${at}: right of the table's middle`);
    assert.ok(g.launch.y > L.H * 0.75, `${at}: at the foot`);
    assert.ok(g.launch.y + g.launch.r <= L.H - 34, `${at}: clear of the home bar`);
    if (L.kind === 'portrait') assert.ok(g.launch.y - hitR(g.launch) > g.band.y + g.band.h, `${at}: below the stage band`);
    // the 3D table stands on the 2D footprint's foot, so at the flippers the 2D mapping is within a few px of the picture
    for (const table of Object.values(content.tables)) {
      const fr = table.flippers.find((f) => f.id === 'fr');
      const reach = g.tableFit.x + (fr.pivot[0] + fr.radius) * g.tableFit.scale;
      assert.ok(g.launch.x - g.launch.r > reach, `${at} ${table.id}: button edge ${g.launch.x - g.launch.r} against flipper ${reach.toFixed(1)}`);
    }
    // in play: mute must not sit on the launch button. In a cinematic: its own mute, clear of skip
    assert.ok(Math.hypot(g.mute.x - g.launch.x, g.mute.y - g.launch.y) > hitR(g.mute) + hitR(g.launch), `${at}: mute against launch`);
    assert.ok(!discHitsRect(g.cineMute, g.skip), `${at}: the cinematic's mute is clear of skip`);
    assert.ok(g.sub.y > L.H / 2 && g.sub.y + g.sub.h <= L.H - 34, `${at}: the subtitle box is in the lower half, above the home bar`);
    assert.ok(g.skip.y >= 59 * (430 / 393) - 8 || L.kind === 'wide', `${at}: skip is below the tallest notch`);
  }
});
