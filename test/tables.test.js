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
  halcyon: ['drill1', 'drill2', 'drill3', 'dormA', 'dormB', 'dormC', 'bondB', 'bondO', 'bondN', 'bondD',
    'oathL', 'oathC', 'oathR', 'galleryRamp', 'paradeOrbit', 'vault', ...COMMON],
  brand: ['reef1', 'reef2', 'reef3', 'netA', 'netB', 'netC', 'wickW', 'wickI', 'wickC', 'wickK',
    'tideL', 'tideC', 'tideR', 'breakwaterRamp', 'underlaneOrbit', 'hearth', ...COMMON],
  tallis: ['pit1', 'pit2', 'pit3', 'queueA', 'queueB', 'queueC', 'noteM', 'noteA', 'noteR', 'noteK',
    'bellL', 'bellC', 'bellR', 'stepsRamp', 'clearingOrbit', 'strongroom', ...COMMON],
  kedge: ['crane1', 'crane2', 'crane3', 'tallyA', 'tallyB', 'tallyC', 'ropeR', 'ropeO', 'ropeP', 'ropeE',
    'hatchL', 'hatchC', 'hatchR', 'gangwayRamp', 'roadsOrbit', 'hopper', ...COMMON],
  fishdock: ['pawl1', 'pawl2', 'pawl3', 'stallA', 'stallB', 'stallC', 'nameN', 'nameA', 'nameM', 'nameE',
    'rollL', 'rollC', 'rollR', 'hallRamp', 'quayOrbit', 'drum', ...COMMON],
  cresset: ['ring1', 'ring2', 'ring3', 'benchA', 'benchB', 'benchC', 'calmC', 'calmA', 'calmL', 'calmM',
    'seatL', 'seatC', 'seatR', 'moleRamp', 'assemblyOrbit', 'lamp', ...COMMON],
};

const elementIds = (t) => [...t.bumpers, ...t.slings, ...t.targets, ...t.rollovers, ...t.shots, ...t.saucers].map((e) => e.id);

test('tables export exactly the eight the chapters name', () => {
  assert.deepEqual(Object.keys(tables).sort(), ['brand', 'cresset', 'fishdock', 'halcyon', 'kedge', 'saltmere', 'tallis', 'vessery']);
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

// Smallest clear gap between two bumpers, and the three centres' mean distance apart.
const bumperGap = (t) => Math.min(...t.bumpers.flatMap((a, i) => t.bumpers.slice(i + 1).map(
  (b) => Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1]) - a.r - b.r)));
const bumperSpread = (t) => mean(t.bumpers.flatMap((a, i) => t.bumpers.slice(i + 1).map(
  (b) => Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1]))));
const luminance = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
};
const centreX = (t) => (t.flippers[0].pivot[0] + t.flippers[1].pivot[0]) / 2;

test('the eight layouts are eight different tables', () => {
  const ids = Object.keys(BIBLE);
  const shape = (t) => ({
    bumpers: t.bumpers.map((b) => b.pos), lanes: t.rollovers.slice(0, 3).map((r) => r.pos),
    targets: t.targets.map((x) => [x.a, x.b]), saucer: t.saucers[0].pos, shots: t.shots.map((x) => [x.a, x.b]),
    walls: t.walls.length, gravity: t.gravity,
  });
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = shape(tables[ids[i]]), b = shape(tables[ids[j]]);
      for (const k of ['bumpers', 'lanes', 'targets', 'saucer', 'shots', 'gravity']) {
        assert.notDeepEqual(a[k], b[k], `${ids[i]} and ${ids[j]} have the same ${k}`);
      }
      assert.notDeepEqual(tables[ids[i]].theme, tables[ids[j]].theme);
      assert.notDeepEqual(tables[ids[i]].decor, tables[ids[j]].decor);
      assert.notEqual(tables[ids[i]].name, tables[ids[j]].name);
    }
  }
  for (const id of ids) {
    const [l, r] = tables[id].flippers;
    const gap = (r.pivot[0] + Math.cos(r.restAngle) * r.length) - (l.pivot[0] + Math.cos(l.restAngle) * l.length) - l.radius - r.radius;
    assert.ok(gap > 16, `${id}: a ball fits between the flippers (${gap.toFixed(1)})`);
    assert.ok(bumperGap(tables[id]) > 16, `${id}: a ball fits between any two bumpers`);
  }
});

test('Halcyon is the fast, symmetrical one', () => {
  const h = tables.halcyon;
  for (const id of Object.keys(BIBLE)) if (id !== 'halcyon') assert.ok(h.gravity > tables[id].gravity, `steeper than ${id}`);
  const cx = centreX(h);
  const mirrored = (ps) => ps.map(([x, y]) => [2 * cx - x, y]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const sorted = (ps) => [...ps].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  assert.deepEqual(mirrored(h.bumpers.map((b) => b.pos)), sorted(h.bumpers.map((b) => b.pos)), 'the drill formation mirrors');
  assert.deepEqual(mirrored(h.rollovers.map((r) => r.pos)), sorted(h.rollovers.map((r) => r.pos)), 'every lane mirrors');
  assert.equal(h.saucers[0].pos[0], cx, 'the vault is on the centre line');
  assert.deepEqual(mirrored(h.shots.flatMap((s) => [s.a, s.b])), sorted(h.shots.flatMap((s) => [s.a, s.b])), 'gallery and parade mirror');
  // the banks face each other at the same distance from the centre line
  assert.deepEqual([...new Set(h.targets.flatMap((t) => [t.a[0], t.b[0]]).map((x) => Math.abs(x - cx)))].length, 1);
  // no other table keeps its saucer on the centre line
  for (const id of Object.keys(BIBLE)) {
    if (id === 'halcyon') continue;
    assert.ok(Math.abs(tables[id].saucers[0].pos[0] - centreX(tables[id])) > 1, `${id} is not symmetrical`);
  }
  assert.ok(h.oneWays.length > tables.vessery.oneWays.length, 'the pediment has a door of its own');
});

test('Brand is the dark, open one, with the hearth under a roof', () => {
  const b = tables.brand;
  for (const id of Object.keys(BIBLE)) {
    if (id === 'brand') continue;
    const t = tables[id];
    assert.ok(mean(b.theme.bg.map(luminance)) < mean(t.theme.bg.map(luminance)), `darker than ${id}`);
    assert.ok(bumperSpread(b) > bumperSpread(t), `reefs farther apart than ${id}'s bumpers`);
    assert.ok(b.gravity < t.gravity, `slower than ${id}`);
  }
  // a wall passes within 60 units above the hearth: it cannot be dropped into from the top of the table
  const [hx, hy] = b.saucers[0].pos;
  const roof = b.walls.some((w) => {
    if (w.a[0] === w.b[0]) return false;
    const [p, q] = w.a[0] < w.b[0] ? [w.a, w.b] : [w.b, w.a];
    if (hx < p[0] || hx > q[0]) return false;
    const y = p[1] + (q[1] - p[1]) * (hx - p[0]) / (q[0] - p[0]);
    return y < hy && y > hy - 60;
  });
  assert.ok(roof, 'the cove has a roof');
  assert.ok(hx > 300, 'and it is tucked against the right side');
});

test('Tallis is the dense one', () => {
  const t = tables.tallis;
  for (const id of Object.keys(BIBLE)) {
    if (id === 'tallis') continue;
    assert.ok(bumperGap(t) < bumperGap(tables[id]), `pits closer together than ${id}'s bumpers`);
    assert.ok(Math.max(...t.bumpers.map((b) => b.kick)) > Math.max(...tables[id].bumpers.map((b) => b.kick)), `louder than ${id}`);
  }
  assert.ok(bumperGap(t) < 2 * t.ballRadius * 1.5, 'under a ball and a half between pits');
  // both banks stand within 70 units of a pit: the walls of the trading floor
  for (const tg of t.targets) {
    const m = [(tg.a[0] + tg.b[0]) / 2, (tg.a[1] + tg.b[1]) / 2];
    const d = Math.min(...t.bumpers.map((b) => Math.hypot(b.pos[0] - m[0], b.pos[1] - m[1]) - b.r));
    assert.ok(d < 70, `${tg.id} is ${d.toFixed(0)} from the nearest pit`);
  }
});

// ───────────────────────── the three tables of part two ─────────────────────────

// A wall that passes over the point (x, y), no more than `within` above it.
const roofed = (t, [x, y], within) => t.walls.some((w) => {
  if (w.a[0] === w.b[0]) return false;
  const [p, q] = w.a[0] < w.b[0] ? [w.a, w.b] : [w.b, w.a];
  if (x < p[0] || x > q[0]) return false;
  const wy = p[1] + (q[1] - p[1]) * (x - p[0]) / (q[0] - p[0]);
  return wy < y && wy > y - within;
});
const PART_TWO = ['kedge', 'fishdock', 'cresset'];

test('Kedge: the cranes stand in one row, the hopper is hooded and open below, the gangway loads the hatches', () => {
  const k = tables.kedge;
  assert.equal(new Set(k.bumpers.map((b) => b.pos[1])).size, 1, 'three cranes on one line');
  for (const id of Object.keys(BIBLE)) {
    if (id !== 'kedge') assert.ok(new Set(tables[id].bumpers.map((b) => b.pos[1])).size > 1, `${id}'s bumpers are not a row`);
  }
  const h = k.saucers[0];
  assert.ok(roofed(k, h.pos, 60), 'a roof over the hopper');
  // a cheek either side: vertical walls within two ball widths, spanning the hole's height
  for (const side of [-1, 1]) {
    assert.ok(k.walls.some((w) => w.a[0] === w.b[0] && (w.a[0] - h.pos[0]) * side > 0 && Math.abs(w.a[0] - h.pos[0]) < 32
      && Math.min(w.a[1], w.b[1]) < h.pos[1] && Math.max(w.a[1], w.b[1]) > h.pos[1]), `a cheek on side ${side}`);
  }
  assert.ok(!k.walls.some((w) => Math.min(w.a[1], w.b[1]) > h.pos[1] && Math.max(w.a[1], w.b[1]) < h.pos[1] + 60
    && Math.min(w.a[0], w.b[0]) < h.pos[0] + 20 && Math.max(w.a[0], w.b[0]) > h.pos[0] - 20), 'nothing closes it underneath');
  // open from below means between two cranes: the hole stands over a gap, not over a crane
  assert.ok(k.bumpers.every((b) => Math.abs(b.pos[0] - h.pos[0]) > b.r + k.ballRadius), 'the hopper is over a gap in the row');
  const ramp = k.shots.find((s) => s.exit);
  const hatches = k.rollovers.slice(0, 3);
  assert.ok(ramp.exit.pos[1] < Math.min(...hatches.map((r) => r.pos[1])), 'the gangway sets the ball down above the hatches');
  assert.ok(ramp.exit.pos[0] > hatches[0].pos[0] - 20 && ramp.exit.pos[0] < hatches[2].pos[0] + 20);
});

test('Fishdock: the drum is the widest hole in the game and has no roof; the pawls fall in a line; it is daylight', () => {
  const f = tables.fishdock;
  const d = f.saucers[0];
  for (const id of Object.keys(BIBLE)) {
    if (id === 'fishdock') continue;
    assert.ok(d.r > tables[id].saucers[0].r, `wider than ${id}'s hole`);
    assert.ok(mean(f.theme.bg.map(luminance)) > mean(tables[id].theme.bg.map(luminance)), `lighter than ${id}`);
  }
  assert.ok(!roofed(f, d.pos, 100), 'nothing over the drum');
  assert.ok(d.pos[0] < 120 && d.pos[1] < 260, 'upper left, where chapter one kept the bench');
  const [a, b, c] = f.bumpers.map((x) => x.pos);
  assert.ok(Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < 1e-6, 'the three pawls are on one line');
  assert.ok(a[1] < b[1] && b[1] < c[1] && a[0] > b[0] && b[0] > c[0], 'falling toward the drum side');
});

test('Cresset: the mole ends in the lamp, the lamp is capped, and the Full Bench sits on a curve', () => {
  const c = tables.cresset;
  const lamp = c.saucers[0];
  const mole = c.shots.find((s) => s.exit);
  assert.ok(Math.hypot(mole.exit.pos[0] - lamp.pos[0], mole.exit.pos[1] - lamp.pos[1]) < lamp.r, 'the ramp sets the ball down inside the lamp');
  for (const id of Object.keys(BIBLE)) {
    if (id === 'cresset') continue;
    const t = tables[id];
    const r = t.shots.find((s) => s.exit);
    assert.ok(Math.hypot(r.exit.pos[0] - t.saucers[0].pos[0], r.exit.pos[1] - t.saucers[0].pos[1]) > 60, `${id}'s ramp does not end in its hole`);
  }
  assert.ok(roofed(c, lamp.pos, 40), 'the brass cap');
  assert.ok(Math.abs(lamp.pos[0] - c.rollovers[1].pos[0]) < 4, 'the lamp is under the centre seat');
  // made mole shot -> lamp, in the physics and not only on paper
  let phys = { ...initPhys(c), balls: [{ id: 1, pos: [(mole.a[0] + mole.b[0]) / 2, mole.a[1] + 6], vel: [0, -500], state: 'live', inside: [] }], nextBallId: 2 };
  const seen = [];
  for (let i = 0; i < 60; i++) {
    const r = stepPhysics(c, phys, { left: false, right: false, plunge: false, nudge: null }, STEP);
    phys = r.phys;
    seen.push(...r.events.map((e) => `${e.type}:${e.id}`));
  }
  assert.deepEqual(seen.filter((s) => /^(shot|saucer)/.test(s)), ['shot:moleRamp', 'saucer:lamp']);
  const bench = c.targets.filter((t) => t.group === 'bench');
  assert.equal(bench.length, 3);
  const mids = bench.map((t) => [(t.a[0] + t.b[0]) / 2, (t.a[1] + t.b[1]) / 2]);
  const bend = (mids[1][0] - mids[0][0]) * (mids[2][1] - mids[0][1]) - (mids[1][1] - mids[0][1]) * (mids[2][0] - mids[0][0]);
  assert.ok(Math.abs(bend) > 200, 'three seats that are not in a line');
});

test('part two: a ramp is roofed at its head, so a ball never comes down it backwards into the drain', () => {
  // Found on Kedge: crane 1 threw balls into the top of the gangway, they ran down it the wrong
  // way and left its mouth on one line, between the flippers: 22 of 41 centre drains in an hour.
  for (const id of PART_TWO) {
    const t = tables[id];
    const ramp = t.shots.find((s) => s.exit);
    const x = Math.min(ramp.a[0], ramp.b[0]) < 100 ? 25 : 349;
    // dropped into the lane's line from the top of the table, a ball never reaches the gate from above
    let phys = { ...initPhys(t), balls: [{ id: 1, pos: [x, 216], vel: [0, 0], state: 'live', inside: [] }], nextBallId: 2 };
    let below = false;
    for (let i = 0; i < 240 && phys.balls.length; i++) {
      phys = stepPhysics(t, phys, { left: false, right: false, plunge: false, nudge: null }, STEP).phys;
      const b = phys.balls[0];
      if (b && Math.abs(b.pos[0] - x) < 17 && b.pos[1] > ramp.a[1] - 60 && b.pos[1] < ramp.a[1]) below = true;
    }
    assert.ok(!below, `${id}: a ball got into the ramp lane from the top`);
  }
});

test('part two: every plunge leaves the lane or comes back to the plunger, and a kickback lands on a flipper', () => {
  for (const id of PART_TWO) {
    const t = tables[id];
    const first = {};
    for (let hold = 10; hold <= 130; hold += 3) {
      let phys = addBall(t, initPhys(t));
      let out = null;
      for (let i = 0; i < 720 && !out; i++) {
        const r = stepPhysics(t, phys, { left: false, right: false, plunge: i < hold, nudge: null }, STEP);
        phys = r.phys;
        const b = phys.balls[0];
        if (!b) out = 'drained';
        else if (i > hold + 5 && b.state === 'plunger') out = 'back';
        else if (b.state === 'live' && b.pos[0] < 366 && b.pos[1] > 130) out = 'field';
        const lane = r.events.find((e) => e.type === 'rollover' && t.reels.fill.includes(e.id));
        if (lane && first[hold] === undefined) first[hold] = lane.id;
      }
      assert.ok(out === 'back' || out === 'field', `${id}: a plunge held ${hold} steps ended ${out}`);
    }
    // the plunger alone can reach each of the three fill lanes
    assert.deepEqual([...new Set(Object.values(first))].sort(), [...t.reels.fill].sort(), `${id}: lanes a plunge reaches first`);
    // game.js sets a kicked-back ball down 12 above the inlane sensor, moving down at 120
    for (const side of ['inL', 'inR']) {
      const lane = t.rollovers.find((r) => r.id === side);
      const f = t.flippers.find((x) => x.side === (side === 'inL' ? 'left' : 'right'));
      let phys = { ...initPhys(t), balls: [{ id: 1, pos: [lane.pos[0], lane.pos[1] - 12], vel: [0, 120], state: 'live', inside: [] }], nextBallId: 2 };
      let onFlipper = false;
      for (let i = 0; i < 240 && phys.balls.length; i++) {
        phys = stepPhysics(t, phys, { left: false, right: false, plunge: false, nudge: null }, STEP).phys;
        const b = phys.balls[0];
        if (b && Math.abs(b.pos[0] - f.pivot[0]) < f.length && Math.abs(b.pos[1] - f.pivot[1]) < 30) onFlipper = true;
      }
      assert.ok(onFlipper, `${id}: a ball set down in ${side} rolls onto the ${f.side} flipper`);
    }
  }
});

test('every shot gate lies inside its lane mouth, and every ramp lands in an inlane or over the top lanes', () => {
  for (const id of Object.keys(BIBLE)) {
    const t = tables[id];
    assert.equal(t.shots.length, 2);
    const ramps = t.shots.filter((s) => s.exit);
    assert.equal(ramps.length, 1, `${id} has one ramp and one orbit`);
    // an inlane, or (Halcyon's gallery) the three top lanes, which are the first three rollovers
    const landings = [...t.rollovers.filter((r) => r.id === 'inL' || r.id === 'inR'), ...t.rollovers.slice(0, 3)];
    const d = Math.min(...landings.map((r) => Math.hypot(r.pos[0] - ramps[0].exit.pos[0], r.pos[1] - ramps[0].exit.pos[1])));
    assert.ok(d < 70, `${id}: ramp exit is ${d.toFixed(0)} from an inlane or a top lane`);
    // never dead above a bumper: a ball dropped on the crown of one comes straight back up
    for (const b of t.bumpers) assert.ok(Math.abs(b.pos[0] - ramps[0].exit.pos[0]) > 4, `${id}: ramp exit is over ${b.id}`);
    for (const s of t.shots) {
      assert.deepEqual(s.dir, [0, -1]);
      assert.equal(s.a[1], s.b[1], 'gates are level');
      assert.ok(Math.abs(s.a[0] - s.b[0]) > 2.5 * t.ballRadius, `${s.id} is wide enough to shoot`);
      // both ends of a gate rest on a wall
      for (const p of [s.a, s.b]) {
        const near = Math.min(...t.walls.map((w) => {
          const ex = w.b[0] - w.a[0], ey = w.b[1] - w.a[1];
          const k = Math.max(0, Math.min(1, ((p[0] - w.a[0]) * ex + (p[1] - w.a[1]) * ey) / (ex * ex + ey * ey)));
          return Math.hypot(p[0] - w.a[0] - ex * k, p[1] - w.a[1] - ey * k);
        }));
        assert.ok(near < 0.01, `${s.id} end ${p} is ${near.toFixed(2)} from a wall`);
      }
    }
  }
});

test('nothing solid stands a pinch apart: every gap is closed or wider than a ball', () => {
  const ptSeg = (p, a, b) => {
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const k = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / (ex * ex + ey * ey)));
    return Math.hypot(p[0] - a[0] - ex * k, p[1] - a[1] - ey * k);
  };
  for (const id of Object.keys(BIBLE)) {
    const t = tables[id];
    const D = 2 * t.ballRadius;
    // free-standing things (targets, bumpers) against the walls and each other
    for (const tg of t.targets) {
      for (const w of t.walls) {
        const d = Math.min(ptSeg(tg.a, w.a, w.b), ptSeg(tg.b, w.a, w.b), ptSeg(w.a, tg.a, tg.b), ptSeg(w.b, tg.a, tg.b));
        // 3 is a bank mounted on its wall
        assert.ok(d <= 3.01 || d > D + 3, `${id}: ${tg.id} stands ${d.toFixed(1)} from wall ${w.a}-${w.b}`);
      }
      for (const b of t.bumpers) {
        const d = ptSeg(b.pos, tg.a, tg.b) - b.r;
        assert.ok(d > D + 3, `${id}: ${tg.id} stands ${d.toFixed(1)} from ${b.id}`);
      }
    }
    for (const b of t.bumpers) {
      for (const w of t.walls) {
        const d = ptSeg(b.pos, w.a, w.b) - b.r;
        assert.ok(d > D + 3, `${id}: ${b.id} stands ${d.toFixed(1)} from wall ${w.a}-${w.b}`);
      }
    }
  }
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

test('a ball does not come to rest on the tip of a post', () => {
  // Found on Vessery: balls settled on the right outlane post, the same spot to 14 digits,
  // on 2 seeds in 13. Dropped from just off the top of each table's posts, a ball must be gone in a second.
  for (const id of Object.keys(BIBLE)) {
    const t = tables[id];
    const posts = t.rollovers.filter((r) => r.id === 'inL' || r.id === 'inR').map((r) => {
      const out = t.rollovers.find((o) => o.id === (r.id === 'inL' ? 'outL' : 'outR'));
      const x = t.walls.map((w) => w.a).concat(t.walls.map((w) => w.b))
        .filter((p) => p[0] > Math.min(r.pos[0], out.pos[0]) && p[0] < Math.max(r.pos[0], out.pos[0]) && p[1] < r.pos[1])
        .sort((a, b) => a[1] - b[1])[0];
      assert.ok(x, `${id}: found the post between ${r.id} and ${out.id}`);
      return x;
    });
    for (const post of posts) {
      for (const off of [-0.18, 0.18]) {
        let phys = { ...initPhys(t), balls: [{ id: 1, pos: [post[0] + off, post[1] - 8.5], vel: [0, 0], state: 'live', inside: [] }], nextBallId: 2 };
        for (let i = 0; i < 120; i++) phys = stepPhysics(t, phys, { left: false, right: false, plunge: false, nudge: null }, STEP).phys;
        const b = phys.balls[0];
        assert.ok(!b || Math.hypot(b.pos[0] - post[0], b.pos[1] - (post[1] - 8)) > 4,
          `${id}: ball still on the post at ${post} after one second: ${b && b.pos}`);
      }
    }
  }
});

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
