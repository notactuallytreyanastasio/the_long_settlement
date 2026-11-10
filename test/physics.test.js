import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STEP, initPhys, addBall, addLiveBall, releaseHeld, stepPhysics } from '../src/core/physics.js';

// A local fixture, so these tests do not depend on the real tables: a closed box with a
// plunger lane on the right and one of each kind of element.
function box(over = {}) {
  return {
    id: 'box', name: 'Box', width: 400, height: 800, gravity: 1100, ballRadius: 8,
    walls: [
      { a: [8, 8], b: [392, 8] }, { a: [8, 8], b: [8, 800] }, { a: [392, 8], b: [392, 800] },
      { a: [366, 200], b: [366, 800] }, { a: [366, 778], b: [392, 778] },
    ],
    oneWays: [], flippers: [
      { id: 'fl', side: 'left', pivot: [120, 700], length: 56, radius: 6, restAngle: 0.5, activeAngle: -0.6 },
      { id: 'fr', side: 'right', pivot: [254, 700], length: 56, radius: 6, restAngle: Math.PI - 0.5, activeAngle: Math.PI + 0.6 },
    ],
    bumpers: [], slings: [], targets: [], rollovers: [], shots: [], saucers: [],
    plunger: { pos: [379, 770], maxSpeed: 1900 },
    drainY: 792,
    theme: { bg: ['#000'], accent: '#fff', glow: '#fff', motif: 'none' }, decor: [], labels: {},
    ...over,
  };
}

const IDLE = { left: false, right: false, plunge: false, nudge: null };

function run(table, phys, steps, input = IDLE) {
  const events = [];
  for (let i = 0; i < steps; i++) {
    const r = stepPhysics(table, phys, typeof input === 'function' ? input(i) : input, STEP);
    phys = r.phys;
    events.push(...r.events);
  }
  return { phys, events };
}

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); }
  return o;
}

const speed = (b) => Math.hypot(b.vel[0], b.vel[1]);

test('STEP is 1/120 and initPhys starts empty with flippers at rest', () => {
  assert.equal(STEP, 1 / 120);
  const t = box();
  const p = initPhys(t);
  assert.deepEqual(p.balls, []);
  assert.equal(p.charge, 0);
  assert.deepEqual(p.flippers, { fl: { angle: 0.5, angVel: 0 }, fr: { angle: Math.PI - 0.5, angVel: 0 } });
});

test('nothing is mutated: a deep-frozen table, phys and input can be stepped', () => {
  const t = deepFreeze(box({ bumpers: [{ id: 'b', pos: [200, 300], r: 20, kick: 400 }] }));
  let p = deepFreeze(addLiveBall(addBall(t, initPhys(t)), [200, 200], [30, 0]));
  for (let i = 0; i < 240; i++) {
    p = deepFreeze(stepPhysics(t, p, deepFreeze({ left: i % 30 < 10, right: i % 40 < 10, plunge: i < 60, nudge: i === 5 ? [10, 0] : null }), STEP).phys);
  }
  assert.ok(p.balls.length >= 1);
});

test('deterministic: the same inputs give the same state', () => {
  const t = box({ bumpers: [{ id: 'b', pos: [200, 300], r: 20, kick: 400 }] });
  const go = () => run(t, addLiveBall(initPhys(t), [190, 100], [40, 0]), 600, (i) => ({ ...IDLE, left: i % 50 < 12, right: i % 70 < 12 }));
  assert.deepEqual(go(), go());
});

test('plunger: charge builds while held, launch on release scales with charge', () => {
  const t = box();
  const p0 = addBall(t, initPhys(t));
  assert.deepEqual(p0.balls[0].pos, [379, 770]);
  assert.equal(p0.balls[0].state, 'plunger');

  const half = run(t, p0, 54, { ...IDLE, plunge: true }).phys;
  assert.ok(Math.abs(half.charge - 0.5) < 0.01, `charge ${half.charge}`);
  const weak = stepPhysics(t, half, IDLE, STEP);
  const full = stepPhysics(t, run(t, p0, 200, { ...IDLE, plunge: true }).phys, IDLE, STEP);
  const wl = weak.events.find((e) => e.type === 'launch'), flh = full.events.find((e) => e.type === 'launch');
  assert.ok(wl && flh);
  assert.equal(flh.speed, 1900);
  assert.ok(wl.speed < flh.speed && wl.speed > 1000);
  assert.equal(full.phys.charge, 0);
  assert.equal(full.phys.balls[0].state, 'live');
  assert.ok(full.phys.balls[0].vel[1] < -1800);
});

test('plunger: a launch too weak to leave the lane settles back as a plunger ball', () => {
  const t = box();
  let p = addBall(t, initPhys(t));
  p = stepPhysics(t, p, { ...IDLE, plunge: true }, STEP).phys;   // one-frame tap
  const r = run(t, p, 120 * 6);
  assert.equal(r.events.filter((e) => e.type === 'launch').length, 1);
  assert.equal(r.phys.balls[0].state, 'plunger');
  assert.deepEqual(r.phys.balls[0].pos, [379, 770]);
});

test('plunger: two waiting balls are stacked, not coincident, and both launch', () => {
  const t = box();
  const p = addBall(t, addBall(t, initPhys(t)));
  assert.notDeepEqual(p.balls[0].pos, p.balls[1].pos);
  const held = run(t, p, 30, { ...IDLE, plunge: true }).phys;
  const r = stepPhysics(t, held, IDLE, STEP);
  assert.equal(r.events.filter((e) => e.type === 'launch').length, 2);
});

test('no tunnelling at 2500 units/s, and speed is capped there', () => {
  // sealed box, no gravity help: fire a ball from the middle in 180 directions
  const t = box({
    walls: [{ a: [8, 8], b: [392, 8] }, { a: [8, 8], b: [8, 780] }, { a: [392, 8], b: [392, 780] }, { a: [8, 780], b: [392, 780] },
      { a: [150, 400], b: [250, 400] }],
    flippers: [], drainY: 5000,
  });
  let maxSpeed = 0;
  for (let k = 0; k < 180; k++) {
    const a = (k / 180) * Math.PI * 2 + 0.013;
    let p = addLiveBall({ balls: [], flippers: {}, charge: 0, nextBallId: 1 }, [200, 300], [Math.cos(a) * 9000, Math.sin(a) * 9000]);
    for (let i = 0; i < 240; i++) {
      p = stepPhysics(t, p, IDLE, STEP).phys;
      const b = p.balls[0];
      maxSpeed = Math.max(maxSpeed, speed(b));
      assert.ok(b.pos[0] >= 16 - 1e-6 && b.pos[0] <= 384 + 1e-6 && b.pos[1] >= 16 - 1e-6 && b.pos[1] <= 772 + 1e-6,
        `direction ${k} step ${i}: ball left the box at ${b.pos}`);
    }
  }
  assert.ok(maxSpeed <= 2500 + 1e-6, `max speed ${maxSpeed}`);
  assert.ok(maxSpeed > 2400, 'the test did reach the cap');
});

test('a 2500 units/s ball does not pass through a flipper, moving or still', () => {
  const t = box();
  for (const left of [false, true]) {
    for (let x = 122; x <= 170; x += 4) {
      const p = addLiveBall(initPhys(t), [x, 600], [0, 2500]);
      const r = run(t, p, 12, { ...IDLE, left });
      const b = r.phys.balls[0];
      assert.ok(b && b.vel[1] < 0, `x=${x} left=${left}: ball went through, vel ${b && b.vel}`);
    }
  }
});

test('bumper kicks the ball away at no less than its kick speed and reports it', () => {
  const t = box({ bumpers: [{ id: 'drum', pos: [200, 400], r: 20, kick: 450 }] });
  const r = run(t, addLiveBall(initPhys(t), [200, 340], [0, 50]), 30);
  const hit = r.events.find((e) => e.type === 'bumper');
  assert.equal(hit.id, 'drum');
  assert.ok(hit.speed > 50);
  const after = run(t, addLiveBall(initPhys(t), [200, 371.5], [0, 60]), 1).phys.balls[0];
  assert.ok(after.vel[1] <= -440, `vy after bumper ${after.vel[1]}`);
});

test('sling kicks on a real hit, acts as a wall for a touch, target reports its id', () => {
  const t = box({
    slings: [{ id: 'slingL', a: [100, 300], b: [100, 400], kick: 350 }],
    targets: [{ id: 'tgt', a: [300, 300], b: [300, 400], group: 'g' }],
  });
  const s = run(t, addLiveBall(initPhys(t), [140, 350], [-400, 0]), 20);
  assert.equal(s.events.filter((e) => e.type === 'sling').length, 1);
  const sb = run(t, addLiveBall(initPhys(t), [109, 350], [-400, 0]), 1).phys.balls[0];
  assert.ok(sb.vel[0] >= 349, `vx after sling ${sb.vel[0]}`);
  const soft = run(t, addLiveBall(initPhys(t), [109, 350], [-40, 0]), 3);
  assert.equal(soft.events.filter((e) => e.type === 'sling').length, 0);

  const g = run(t, addLiveBall(initPhys(t), [260, 350], [400, 0]), 20);
  const te = g.events.filter((e) => e.type === 'target');
  assert.equal(te.length, 1);
  assert.equal(te[0].id, 'tgt');
  assert.ok(g.phys.balls[0].pos[0] < 300);
});

test('rollover emits once per entry, again after leaving', () => {
  const t = box({ gravity: 0, flippers: [], rollovers: [{ id: 'lot', pos: [200, 300], r: 10 }] });
  // crosses, bounces off the left wall, crosses again
  const r = run(t, addLiveBall({ balls: [], flippers: {}, charge: 0, nextBallId: 1 }, [260, 300], [-600, 0]), 120);
  const ro = r.events.filter((e) => e.type === 'rollover');
  assert.equal(ro.length, 2);
  assert.equal(ro[0].id, 'lot');
  // sitting still inside: one event, not one per step
  const still = run(t, addLiveBall({ balls: [], flippers: {}, charge: 0, nextBallId: 1 }, [200, 300], [0, 0]), 60);
  assert.equal(still.events.filter((e) => e.type === 'rollover').length, 1);
  assert.deepEqual(still.phys.balls[0].inside, ['lot']);
});

test('shot gate fires only in its direction; a ramp carries the ball to its exit', () => {
  const none = { balls: [], flippers: {}, charge: 0, nextBallId: 1 };
  const t = box({ gravity: 0, flippers: [], shots: [
    { id: 'orbit', a: [100, 300], b: [140, 300], dir: [0, -1] },
    { id: 'ramp', a: [200, 300], b: [240, 300], dir: [0, -1], exit: { pos: [320, 600], vel: [0, 140] } },
  ] });
  const up = run(t, addLiveBall(none, [120, 340], [0, -900]), 10);
  assert.deepEqual(up.events.filter((e) => e.type === 'shot').map((e) => e.id), ['orbit']);
  const down = run(t, addLiveBall(none, [120, 260], [0, 900]), 10);
  assert.equal(down.events.filter((e) => e.type === 'shot').length, 0);
  const ramp = run(t, addLiveBall(none, [220, 310], [0, -2500]), 1);
  assert.deepEqual(ramp.events.map((e) => e.id), ['ramp']);
  assert.deepEqual(ramp.phys.balls[0].vel, [0, 140]);
  assert.ok(Math.abs(ramp.phys.balls[0].pos[0] - 320) < 1e-9 && ramp.phys.balls[0].pos[1] >= 600);
});

test('saucer captures, holds for holdMs, ejects, and does not swallow its own eject', () => {
  const t = box({ saucers: [{ id: 'bench', pos: [200, 300], r: 14, eject: [200, 150], holdMs: 500 }] });
  const r = run(t, addLiveBall(initPhys(t), [200, 200], [0, 300]), 30);
  assert.deepEqual(r.events.filter((e) => e.type === 'saucer').map((e) => e.id), ['bench']);
  const held = r.phys.balls[0];
  assert.equal(held.state, 'held');
  assert.equal(held.heldIn, 'bench');
  assert.deepEqual(held.pos, [200, 300]);
  assert.ok(held.heldMs > 0 && held.heldMs <= 500);

  const later = run(t, r.phys, 90);
  assert.equal(later.events.filter((e) => e.type === 'eject').length, 1);
  assert.equal(later.events.filter((e) => e.type === 'saucer').length, 0, 'not recaptured on the way out');
  assert.equal(later.phys.balls[0].state, 'live');
  assert.equal(later.phys.balls[0].heldIn, undefined);

  const now = releaseHeld(t, r.phys);
  assert.deepEqual(now.events.map((e) => [e.type, e.id]), [['eject', 'bench']]);
  assert.deepEqual(now.phys.balls[0].vel, [200, 150]);
  assert.equal(now.phys.balls[0].state, 'live');
  assert.equal(r.phys.balls[0].state, 'held', 'releaseHeld did not mutate its argument');
  assert.equal(run(t, now.phys, 30).events.filter((e) => e.type === 'saucer').length, 0);
});

test('one-way gate passes a ball moving with `pass` and blocks one moving against it', () => {
  const none = { balls: [], flippers: {}, charge: 0, nextBallId: 1 };
  const t = box({ gravity: 0, flippers: [], oneWays: [{ id: 'gate', a: [100, 300], b: [300, 300], pass: [0, -1] }] });
  const up = run(t, addLiveBall(none, [200, 340], [0, -500]), 20).phys.balls[0];
  assert.ok(up.pos[1] < 290 && up.vel[1] < 0);
  const down = run(t, addLiveBall(none, [200, 260], [0, 500]), 20).phys.balls[0];
  assert.ok(down.pos[1] < 292 && down.vel[1] < 0, `blocked ball at ${down.pos}`);
});

test('drain removes the ball and reports it', () => {
  const t = box({ flippers: [] });
  const r = run(t, addLiveBall({ balls: [], flippers: {}, charge: 0, nextBallId: 7 }, [200, 700], [0, 300]), 60);
  assert.deepEqual(r.events.filter((e) => e.type === 'drain').map((e) => e.ballId), [7]);
  assert.deepEqual(r.phys.balls, []);
});

test('nudge is added to live balls; flip is reported once per press', () => {
  const t = box({ gravity: 0 });
  const p = addLiveBall(initPhys(t), [200, 300], [0, 0]);
  const n = stepPhysics(t, p, { ...IDLE, nudge: [120, -40] }, STEP).phys.balls[0];
  assert.deepEqual(n.vel, [120, -40]);
  const r = run(t, p, 60, (i) => ({ ...IDLE, left: i < 30 }));
  assert.deepEqual(r.events.filter((e) => e.type === 'flip').map((e) => e.id), ['fl']);
});

test('two live balls collide instead of passing through each other', () => {
  const none = { balls: [], flippers: {}, charge: 0, nextBallId: 1 };
  const t = box({ gravity: 0, flippers: [] });
  const p = addLiveBall(addLiveBall(none, [150, 300], [400, 0]), [250, 300], [-400, 0]);
  const r = run(t, p, 30).phys;
  assert.ok(r.balls[0].vel[0] < 0 && r.balls[1].vel[0] > 0);
  assert.ok(r.balls[0].pos[0] < r.balls[1].pos[0]);
});

test('flipper reaches its active angle in under 60 ms and returns to rest', () => {
  const t = box();
  const up = run(t, initPhys(t), 7, { ...IDLE, left: true }).phys;
  assert.deepEqual(up.flippers.fl, { angle: -0.6, angVel: 0 });
  assert.deepEqual(up.flippers.fr, { angle: Math.PI - 0.5, angVel: 0 });
  const back = run(t, up, 40).phys;
  assert.deepEqual(back.flippers.fl, { angle: 0.5, angVel: 0 });
});

test('a ball left on a flipper at rest rolls off; on a raised flipper it stays cradled', () => {
  const guide = { a: [40, 660], b: [122.9, 694.7] };   // the inlane guide the cradle is formed against
  const t = box({ walls: [...box().walls, guide] });
  const start = addLiveBall(initPhys(t), [150, 640], [0, 0]);

  const rest = run(t, start, 120 * 4);
  assert.equal(rest.events.filter((e) => e.type === 'drain').length, 1, 'rolled off the resting flipper and drained');

  const settle = run(t, start, 120 * 3, { ...IDLE, left: true }).phys;
  const at = settle.balls[0].pos;
  const held = run(t, settle, 120 * 10, { ...IDLE, left: true }).phys;
  const b = held.balls[0];
  assert.ok(b, 'ball still on the table');
  assert.ok(speed(b) < 2, `cradled ball speed ${speed(b)}`);
  assert.ok(Math.hypot(b.pos[0] - at[0], b.pos[1] - at[1]) < 0.5, `cradled ball drifted from ${at} to ${b.pos}`);
  assert.ok(b.pos[1] < 700 && b.pos[0] > 100 && b.pos[0] < 180);
});

test('flipper shot is aimable: near the pivot goes up the near side, near the tip goes across, and it is fast', () => {
  const guide = { a: [40, 660], b: [122.9, 694.7] };
  const t = box({ walls: [...box().walls, guide] });
  // cradle, release, and flip again after k steps as the ball rolls toward the tip
  const cradle = run(t, addLiveBall(initPhys(t), [150, 640], [0, 0]), 120 * 3, { ...IDLE, left: true }).phys;
  const shots = [];
  for (let k = 20; k <= 80; k += 2) {
    let p = run(t, cradle, k).phys;
    if (!p.balls[0]) break;
    const along = p.balls[0].pos[0] - 120;
    for (let i = 0; i < 120 && p.balls[0]; i++) {
      p = stepPhysics(t, p, { ...IDLE, left: true }, STEP).phys;
      const b = p.balls[0];
      if (b && b.pos[1] < 600) {
        shots.push({ along, deg: Math.atan2(b.vel[0], -b.vel[1]) * 180 / Math.PI, speed: speed(b) });
        break;
      }
    }
  }
  assert.ok(shots.length >= 8, `only ${shots.length} shots left the flipper`);
  const strong = shots.filter((s) => s.speed > 900);
  const minDeg = Math.min(...strong.map((s) => s.deg)), maxDeg = Math.max(...strong.map((s) => s.deg));
  const fastest = Math.max(...shots.map((s) => s.speed));
  // left flipper: negative = toward its own (left) side, positive = across the table
  assert.ok(minDeg < -4, `most near-side strong shot ${minDeg.toFixed(1)} deg`);
  assert.ok(maxDeg > 20, `most cross-table strong shot ${maxDeg.toFixed(1)} deg`);
  const nearSide = strong.find((s) => s.deg === minDeg), across = strong.find((s) => s.deg === maxDeg);
  assert.ok(nearSide.along < across.along, 'the cross shot comes from further out along the flipper');
  assert.ok(fastest > 1500 && fastest <= 2500, `fastest shot ${fastest.toFixed(0)}`);
});

test('unhandled values throw and name themselves', () => {
  const bad = box({ flippers: [{ id: 'fx', side: 'middle', pivot: [1, 1], length: 5, radius: 1, restAngle: 0, activeAngle: 1 }] });
  assert.throws(() => stepPhysics(bad, initPhys(bad), IDLE, STEP), /fx.*middle/);
  const t = box();
  assert.throws(() => stepPhysics(t, { ...initPhys(t), flippers: {} }, IDLE, STEP), /'fl'/);
  const ghost = { ...initPhys(t), balls: [{ id: 3, pos: [1, 1], vel: [0, 0], state: 'held', heldIn: 'nowhere', heldMs: 5, inside: [] }] };
  assert.throws(() => releaseHeld(t, ghost), /nowhere/);
});
