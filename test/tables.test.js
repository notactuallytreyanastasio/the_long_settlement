import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tables } from '../src/content/tables.js';
import { STEP, initPhys, addBall, stepPhysics } from '../src/core/physics.js';

// Element ids, copied from story/BIBLE.md. The story's objectives are written against these.
const COMMON = ['inL', 'inR', 'outL', 'outR', 'slingL', 'slingR'];
const BIBLE = {
  vessery: ['drum1', 'drum2', 'drum3', 'lanternA', 'lanternB', 'lanternC', 'sealM', 'sealI', 'sealN', 'sealT',
    'lotL', 'lotC', 'lotR', 'pierRamp', 'dockOrbit', 'bench', ...COMMON],
  saltmere: ['shaft1', 'shaft2', 'shaft3', 'strikeA', 'strikeB', 'strikeC', 'lienL', 'lienI', 'lienE', 'lienN',
    'saltL', 'saltC', 'saltR', 'causewayRamp', 'courtOrbit', 'orrery', ...COMMON],
};

const elementIds = (t) => [...t.bumpers, ...t.slings, ...t.targets, ...t.rollovers, ...t.shots, ...t.saucers].map((e) => e.id);

test('tables export exactly vessery and saltmere', () => {
  assert.deepEqual(Object.keys(tables).sort(), ['saltmere', 'vessery']);
});

for (const id of Object.keys(BIBLE)) {
  const t = tables[id];

  test(`${id}: has every element id in the bible, once, and no others`, () => {
    assert.deepEqual(elementIds(t).sort(), [...BIBLE[id]].sort());
  });

  test(`${id}: matches the Table contract`, () => {
    assert.equal(t.id, id);
    assert.equal(typeof t.name, 'string');
    assert.equal(t.width, 400);
    assert.equal(t.height, 800);
    assert.equal(t.ballRadius, 8);
    assert.ok(t.gravity > 0);
    assert.deepEqual(t.flippers.map((f) => [f.id, f.side]), [['fl', 'left'], ['fr', 'right']]);
    assert.deepEqual(t.slings.map((s) => s.id), ['slingL', 'slingR']);
    assert.ok(t.drainY < 800 && t.drainY > t.flippers[0].pivot[1]);

    const pts = [
      ...t.walls, ...t.oneWays, ...t.slings, ...t.targets, ...t.shots,
    ].flatMap((s) => [s.a, s.b]).concat(
      [...t.bumpers, ...t.rollovers, ...t.saucers].map((e) => e.pos),
      t.flippers.map((f) => f.pivot), [t.plunger.pos], t.decor.map((d) => d.pos),
      t.shots.filter((s) => s.exit).map((s) => s.exit.pos),
    );
    for (const p of pts) {
      assert.ok(Array.isArray(p) && p.length === 2 && p.every(Number.isFinite), `bad point ${JSON.stringify(p)}`);
      assert.ok(p[0] >= 0 && p[0] <= 400 && p[1] >= 0 && p[1] <= 800, `point off the field ${p}`);
    }
    for (const b of t.bumpers) assert.ok(b.r > 0 && b.kick > 0);
    for (const s of t.slings) assert.ok(s.kick > 0);
    for (const s of t.saucers) assert.ok(s.r > 0 && s.holdMs > 0 && s.eject.length === 2);
    for (const o of t.oneWays) assert.ok(typeof o.id === 'string' && o.pass.length === 2);
    for (const s of t.shots) assert.ok(Math.hypot(...s.dir) > 0);
    assert.ok(t.plunger.maxSpeed > 0 && t.plunger.maxSpeed <= 2500);
    assert.ok(t.plunger.pos[0] > 366, 'plunger lane is on the right');

    assert.ok(Array.isArray(t.theme.bg) && t.theme.bg.length >= 2);
    for (const k of ['accent', 'glow', 'motif']) assert.equal(typeof t.theme[k], 'string');
    assert.ok(t.decor.length >= 3);
    for (const d of t.decor) assert.ok(typeof d.text === 'string' && d.size > 0);
    for (const e of BIBLE[id]) assert.ok(typeof t.labels[e] === 'string' && t.labels[e].length > 0, `no label for ${e}`);
  });
}

test('the two layouts are different tables, and Saltmere is the steeper and tighter one', () => {
  const v = tables.vessery, s = tables.saltmere;
  assert.ok(s.gravity > v.gravity);
  assert.notDeepEqual(v.bumpers.map((b) => b.pos), s.bumpers.map((b) => b.pos));
  assert.notDeepEqual(v.rollovers.slice(0, 3).map((b) => b.pos), s.rollovers.slice(0, 3).map((b) => b.pos));
  assert.ok(s.saucers[0].r < v.saucers[0].r, 'the orrery is a smaller hole than the bench');
  const gap = (t) => {
    const [l, r] = t.flippers;
    return (r.pivot[0] + Math.cos(r.restAngle) * r.length) - (l.pivot[0] + Math.cos(l.restAngle) * l.length) - l.radius - r.radius;
  };
  assert.ok(gap(v) > 16 && gap(s) > 16, 'a ball fits between the flippers');
  assert.notDeepEqual(v.theme, s.theme);
});

// ───────────────────────── playability, by simulation ─────────────────────────

function mulberry(a) {
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A simple player. It flips when a ball is over a flipper, a random 0-4 steps late, and
 * holds for a random 8-23 steps. A slow ball (one rolling out of a cradle) is let run a
 * random distance along the flipper first; without that it re-cradles the same ball forever.
 * It plunges with a random charge. It never nudges.
 */
function play(table, seedN, seconds) {
  const rnd = mulberry(seedN);
  let phys = initPhys(table);
  const hits = Object.fromEntries(elementIds(table).map((id) => [id, 0]));
  const bot = { fl: { wait: -1, hold: 0, cool: 0, aim: 20 }, fr: { wait: -1, hold: 0, cool: 0, aim: 20 }, plunge: 0 };
  const born = {}, anchor = {}, lives = [];
  let stuck = null, escaped = null, maxSpeed = 0;
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) {
    const time = i * STEP;
    if (phys.balls.length === 0) phys = addBall(table, phys);
    const input = { left: false, right: false, plunge: false, nudge: null };
    if (phys.balls.some((b) => b.state === 'plunger')) {
      if (bot.plunge === 0) bot.plunge = 40 + Math.floor(rnd() * 80);
      bot.plunge--;
      input.plunge = bot.plunge > 0;
    }
    for (const f of table.flippers) {
      const st = bot[f.id];
      const dirX = f.side === 'left' ? 1 : -1;
      const near = phys.balls.some((b) => {
        if (b.state !== 'live') return false;
        const along = (b.pos[0] - f.pivot[0]) * dirX;
        const lead = b.pos[1] + b.vel[1] * 0.03;
        const slow = Math.hypot(b.vel[0], b.vel[1]) < 160;
        return along > (slow ? st.aim : -4) && along < f.length + 6
          && lead > f.pivot[1] - 26 && b.pos[1] < f.pivot[1] + 30 && b.vel[1] > -200;
      });
      if (st.hold > 0) {
        st.hold--;
        if (st.hold === 0) { st.cool = 8 + Math.floor(rnd() * 10); st.aim = 14 + rnd() * 34; }
      } else if (st.cool > 0) st.cool--;
      else if (st.wait >= 0) { if (st.wait === 0) st.hold = 8 + Math.floor(rnd() * 16); st.wait--; }
      else if (near) st.wait = Math.floor(rnd() * 5);
      input[f.side] = st.hold > 0;
    }

    const r = stepPhysics(table, phys, input, STEP);
    phys = r.phys;
    for (const e of r.events) {
      if (e.type === 'launch') born[e.ballId] = time;
      else if (e.type === 'drain') { lives.push(time - born[e.ballId]); delete anchor[e.ballId]; }
      else if (e.id !== undefined && e.type !== 'flip' && e.type !== 'eject') {
        if (!(e.id in hits)) throw new Error(`event ${e.type} for an id the table does not list: ${e.id}`);
        hits[e.id]++;
      }
    }
    for (const b of phys.balls) {
      maxSpeed = Math.max(maxSpeed, Math.hypot(b.vel[0], b.vel[1]));
      if (b.pos[0] < 0 || b.pos[0] > table.width || b.pos[1] < 0 || b.pos[1] > table.height) escaped ??= { time, pos: b.pos };
      // stuck: live (not in a saucer, not on the plunger) and within 4 units of one spot for over 3 s
      if (b.state !== 'live') { delete anchor[b.id]; continue; }
      const a = anchor[b.id];
      if (!a || Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1]) > 4) anchor[b.id] = { pos: b.pos, time };
      else if (time - a.time > 3) stuck ??= { time, pos: b.pos };
    }
  }
  return { hits, lives, stuck, escaped, maxSpeed };
}

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

for (const id of Object.keys(BIBLE)) {
  test(`${id}: five minutes of bot play hits every element, never sticks, never escapes, balls last 20-90 s`, (t) => {
    const r = play(tables[id], 1, 300);
    const avg = mean(r.lives);
    t.diagnostic(`${id} seed 1, 300 s: ${r.lives.length} balls drained, average ${avg.toFixed(1)} s `
      + `(shortest ${Math.min(...r.lives).toFixed(1)}, longest ${Math.max(...r.lives).toFixed(1)}), top speed ${r.maxSpeed.toFixed(0)}`);
    t.diagnostic(`${id} hits: ${Object.entries(r.hits).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    assert.deepEqual(Object.entries(r.hits).filter(([, n]) => n === 0).map(([k]) => k), [], 'elements never hit');
    assert.equal(r.stuck, null, `ball stuck: ${JSON.stringify(r.stuck)}`);
    assert.equal(r.escaped, null, `ball escaped: ${JSON.stringify(r.escaped)}`);
    assert.ok(r.maxSpeed <= 2500 + 1e-6);
    assert.ok(r.lives.length >= 3);
    assert.ok(avg >= 20 && avg <= 90, `average ball ${avg.toFixed(1)} s`);
  });

  test(`${id}: across twelve other seeds (an hour of play) nothing sticks or escapes and the average holds`, (t) => {
    const lives = [], perSeed = [];
    const union = {};
    let full = 0;
    for (let seedN = 2; seedN <= 13; seedN++) {
      const r = play(tables[id], seedN, 300);
      assert.equal(r.stuck, null, `seed ${seedN} ball stuck: ${JSON.stringify(r.stuck)}`);
      assert.equal(r.escaped, null, `seed ${seedN} ball escaped: ${JSON.stringify(r.escaped)}`);
      lives.push(...r.lives);
      perSeed.push(mean(r.lives).toFixed(0));
      if (Object.values(r.hits).every((n) => n > 0)) full++;
      for (const [k, v] of Object.entries(r.hits)) union[k] = (union[k] ?? 0) + v;
    }
    const avg = mean(lives);
    const rarest = Object.entries(union).sort((a, b) => a[1] - b[1]).slice(0, 4);
    t.diagnostic(`${id} seeds 2-13, 300 s each: ${lives.length} balls, pooled average ${avg.toFixed(1)} s, per-seed averages ${perSeed.join(' ')}`);
    t.diagnostic(`${id} ${full}/12 seeds hit every element inside their five minutes; rarest per five minutes: `
      + rarest.map(([k, v]) => `${k} ${(v / 12).toFixed(1)}`).join(', '));
    assert.ok(avg >= 20 && avg <= 90, `pooled average ball ${avg.toFixed(1)} s`);
    assert.deepEqual(Object.entries(union).filter(([, n]) => n === 0).map(([k]) => k), []);
  });
}
