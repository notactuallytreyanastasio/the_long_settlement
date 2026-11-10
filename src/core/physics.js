// Pinball physics. Pure: stepPhysics(table, phys, input, dt) -> { phys, events }.
//
// A ball is a circle. Everything it can touch is a segment (walls, targets, slings,
// one-way gates), a circle (bumpers) or a rotating capsule (flippers). Each STEP is cut
// into SUBSTEPS so that at the 2500 units/s speed cap a ball moves 2.6 units per
// substep, a third of its own radius: it cannot get its centre across a segment
// between two collision checks.
//
// The obvious flipper is a segment that teleports between two angles and adds a fixed
// impulse. That gives one shot. Here the flipper has an angular velocity, and the ball
// is bounced in the frame of the surface point it touches (omega x r), so a ball near
// the tip leaves faster than one near the pivot and the angle of the flipper at the
// moment of contact sets the direction. That is what makes a shot aimable.

export const STEP = 1 / 120;

const SUBSTEPS = 8;
const MAX_SPEED = 2500;

const WALL_BOUNCE = 0.5;      // default restitution of a wall segment
const TARGET_BOUNCE = 0.55;
const SLING_BOUNCE = 0.4;
const BUMPER_BOUNCE = 0.5;
const FLIPPER_BOUNCE = 0.42;
const BALL_BOUNCE = 0.9;
const WALL_FRICTION = 0.04;   // Coulomb coefficient: tangential impulse <= mu * normal impulse
const FLIPPER_FRICTION = 0.1;
const REST_SPEED = 28;        // impacts slower than this do not bounce (lets a ball settle)

const FLIP_ACCEL = 1500;      // rad/s^2 while the coil is on
const FLIP_SPEED = 38;        // rad/s, top speed of the up-stroke
const RETURN_ACCEL = 500;
const RETURN_SPEED = 14;

const CHARGE_SECONDS = 0.9;   // time to charge the plunger fully
const MIN_LAUNCH = 0.45;      // fraction of maxSpeed a zero-charge tap gives

const EVENT_SPEED = { wall: 140, target: 35, sling: 70 };

// ───────────────────────── prepared table (memoised by identity) ─────────────────────────

const KIND_WALL = 0, KIND_TARGET = 1, KIND_SLING = 2, KIND_ONEWAY = 3;
const prepared = new WeakMap();

function seg(kind, a, b, extra) {
  return {
    kind, ax: a[0], ay: a[1], bx: b[0], by: b[1],
    minx: Math.min(a[0], b[0]), maxx: Math.max(a[0], b[0]),
    miny: Math.min(a[1], b[1]), maxy: Math.max(a[1], b[1]),
    ...extra,
  };
}

function prep(table) {
  const hit = prepared.get(table);
  if (hit) return hit;
  const segs = [];
  for (const w of table.walls) segs.push(seg(KIND_WALL, w.a, w.b, { e: w.bounce ?? WALL_BOUNCE }));
  for (const t of table.targets) segs.push(seg(KIND_TARGET, t.a, t.b, { e: TARGET_BOUNCE, id: t.id }));
  for (const s of table.slings) segs.push(seg(KIND_SLING, s.a, s.b, { e: SLING_BOUNCE, id: s.id, kick: s.kick }));
  for (const o of table.oneWays) segs.push(seg(KIND_ONEWAY, o.a, o.b, { e: WALL_BOUNCE, id: o.id, px: o.pass[0], py: o.pass[1] }));
  const saucers = {};
  for (const s of table.saucers) saucers[s.id] = s;
  const out = { segs, saucers };
  prepared.set(table, out);
  return out;
}

// ───────────────────────── construction ─────────────────────────

export function initPhys(table) {
  const flippers = {};
  for (const f of table.flippers) flippers[f.id] = { angle: f.restAngle, angVel: 0 };
  return { balls: [], flippers, charge: 0, nextBallId: 1 };
}

function plungerSlot(table, k) {
  return [table.plunger.pos[0], table.plunger.pos[1] - k * (2 * table.ballRadius + 1)];
}

export function addBall(table, phys) {
  const waiting = phys.balls.filter((b) => b.state === 'plunger').length;
  const ball = { id: phys.nextBallId, pos: plungerSlot(table, waiting), vel: [0, 0], state: 'plunger', inside: [] };
  return { ...phys, balls: [...phys.balls, ball], nextBallId: phys.nextBallId + 1 };
}

export function addLiveBall(phys, pos, vel) {
  const ball = { id: phys.nextBallId, pos: [pos[0], pos[1]], vel: [vel[0], vel[1]], state: 'live', inside: [] };
  return { ...phys, balls: [...phys.balls, ball], nextBallId: phys.nextBallId + 1 };
}

function ejected(table, ball) {
  const s = prep(table).saucers[ball.heldIn];
  if (!s) throw new Error(`physics: ball ${ball.id} is held in unknown saucer '${ball.heldIn}' on table '${table.id}'`);
  // The saucer id stays in `inside` so the ball is not recaptured on its way out.
  const inside = ball.inside.includes(s.id) ? [...ball.inside] : [...ball.inside, s.id];
  return {
    ball: { id: ball.id, pos: [s.pos[0], s.pos[1]], vel: [s.eject[0], s.eject[1]], state: 'live', inside },
    event: { type: 'eject', id: s.id, ballId: ball.id, speed: Math.hypot(s.eject[0], s.eject[1]) },
  };
}

export function releaseHeld(table, phys) {
  const events = [];
  const balls = phys.balls.map((b) => {
    if (b.state !== 'held') return b;
    const r = ejected(table, b);
    events.push(r.event);
    return r.ball;
  });
  return { phys: { ...phys, balls }, events };
}

// ───────────────────────── collision response ─────────────────────────

// Bounce working ball `b` off a surface with unit normal (nx,ny) pointing at the ball,
// moving at (svx,svy). Returns the closing speed along the normal (0 if separating).
function bounce(b, nx, ny, e, mu, svx, svy) {
  const rvx = b.vx - svx, rvy = b.vy - svy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return 0;
  const impact = -vn;
  const ee = impact < REST_SPEED ? 0 : e;
  const jn = (1 + ee) * impact;
  let tx = -ny, ty = nx;
  let vt = rvx * tx + rvy * ty;
  if (vt < 0) { vt = -vt; tx = -tx; ty = -ty; }
  const jt = Math.min(vt, mu * jn);
  b.vx += jn * nx - jt * tx;
  b.vy += jn * ny - jt * ty;
  return impact;
}

// Closest-point test of ball (x,y,R) against segment a-b inflated by `pad`.
// On contact writes the contact normal and point into `c` and pushes the ball out.
const c = { nx: 0, ny: 0, cx: 0, cy: 0 };
function touchSeg(b, ax, ay, bx, by, reach) {
  const ex = bx - ax, ey = by - ay;
  const len2 = ex * ex + ey * ey;
  let t = len2 > 0 ? ((b.x - ax) * ex + (b.y - ay) * ey) / len2 : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const cx = ax + ex * t, cy = ay + ey * t;
  let dx = b.x - cx, dy = b.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= reach * reach) return false;
  let d = Math.sqrt(d2);
  if (d < 1e-9) {
    // Centre exactly on the segment: push back against the direction of travel.
    const len = Math.sqrt(len2) || 1;
    dx = -ey / len; dy = ex / len;
    if (dx * b.vx + dy * b.vy > 0) { dx = -dx; dy = -dy; }
    d = 0;
  } else {
    dx /= d; dy /= d;
  }
  c.nx = dx; c.ny = dy; c.cx = cx; c.cy = cy;
  b.x = cx + dx * reach;
  b.y = cy + dy * reach;
  return true;
}

function crosses(px, py, qx, qy, ax, ay, bx, by) {
  const d1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  const d2 = (bx - ax) * (qy - ay) - (by - ay) * (qx - ax);
  if ((d1 > 0) === (d2 > 0)) return false;
  const d3 = (qx - px) * (ay - py) - (qy - py) * (ax - px);
  const d4 = (qx - px) * (by - py) - (qy - py) * (bx - px);
  return (d3 > 0) !== (d4 > 0);
}

function capSpeed(b) {
  const s2 = b.vx * b.vx + b.vy * b.vy;
  if (s2 > MAX_SPEED * MAX_SPEED) {
    const k = MAX_SPEED / Math.sqrt(s2);
    b.vx *= k; b.vy *= k;
  }
}

// ───────────────────────── the step ─────────────────────────

function pressed(f, input) {
  if (f.side === 'left') return !!input.left;
  if (f.side === 'right') return !!input.right;
  throw new Error(`physics: flipper '${f.id}' has unknown side '${f.side}'`);
}

export function stepPhysics(table, phys, input, dt) {
  const T = prep(table);
  const R = table.ballRadius;
  const events = [];
  const h = dt / SUBSTEPS;

  // Working copies. Nothing reachable from `phys` is written to.
  const balls = phys.balls.map((b) => ({
    id: b.id, x: b.pos[0], y: b.pos[1], vx: b.vel[0], vy: b.vel[1],
    state: b.state, heldIn: b.heldIn, heldMs: b.heldMs, inside: b.inside.slice(), gone: false,
  }));

  // Flippers: note which coils just switched on.
  const fl = table.flippers.map((f) => {
    const st = phys.flippers[f.id];
    if (!st) throw new Error(`physics: phys has no state for flipper '${f.id}'`);
    const dir = Math.sign(f.activeAngle - f.restAngle);
    const on = pressed(f, input);
    if (on && st.angle !== f.activeAngle && st.angVel * dir <= 0) {
      events.push({ type: 'flip', id: f.id, ballId: -1, speed: 0 });
    }
    return { f, dir, on, angle: st.angle, angVel: st.angVel, tx: 0, ty: 0 };
  });

  // Plunger: charge while held, launch on release.
  let charge = phys.charge;
  if (input.plunge) {
    charge = Math.min(1, charge + dt / CHARGE_SECONDS);
  } else if (charge > 0) {
    const speed = table.plunger.maxSpeed * (MIN_LAUNCH + (1 - MIN_LAUNCH) * charge);
    for (const b of balls) {
      if (b.state !== 'plunger') continue;
      b.state = 'live'; b.vx = 0; b.vy = -speed;
      events.push({ type: 'launch', ballId: b.id, speed });
    }
    charge = 0;
  }

  // Saucer hold timers.
  for (const b of balls) {
    if (b.state !== 'held') continue;
    b.heldMs = (b.heldMs ?? 0) - dt * 1000;
    if (b.heldMs <= 0) {
      const r = ejected(table, { id: b.id, heldIn: b.heldIn, inside: b.inside });
      b.state = 'live'; b.heldIn = undefined; b.heldMs = undefined;
      b.x = r.ball.pos[0]; b.y = r.ball.pos[1]; b.vx = r.ball.vel[0]; b.vy = r.ball.vel[1];
      b.inside = r.ball.inside;
      events.push(r.event);
    }
  }

  if (input.nudge) {
    for (const b of balls) if (b.state === 'live') { b.vx += input.nudge[0]; b.vy += input.nudge[1]; }
  }

  for (let s = 0; s < SUBSTEPS; s++) {
    for (const F of fl) {
      const { f, dir } = F;
      if (F.on) F.angVel = dir * Math.min(FLIP_SPEED, Math.max(0, F.angVel * dir) + FLIP_ACCEL * h);
      else F.angVel = -dir * Math.min(RETURN_SPEED, Math.max(0, -F.angVel * dir) + RETURN_ACCEL * h);
      F.angle += F.angVel * h;
      const lo = Math.min(f.restAngle, f.activeAngle), hi = Math.max(f.restAngle, f.activeAngle);
      if (F.angle <= lo) { F.angle = lo; F.angVel = 0; }
      if (F.angle >= hi) { F.angle = hi; F.angVel = 0; }
      F.tx = f.pivot[0] + Math.cos(F.angle) * f.length;
      F.ty = f.pivot[1] + Math.sin(F.angle) * f.length;
    }

    for (const b of balls) {
      if (b.state !== 'live' || b.gone) continue;
      const px = b.x, py = b.y;
      b.vy += table.gravity * h;
      b.x += b.vx * h;
      b.y += b.vy * h;

      // Shot gates. A ramp carries the ball to its exit.
      let carried = false;
      for (const g of table.shots) {
        if (b.vx * g.dir[0] + b.vy * g.dir[1] <= 0) continue;
        if (!crosses(px, py, b.x, b.y, g.a[0], g.a[1], g.b[0], g.b[1])) continue;
        events.push({ type: 'shot', id: g.id, ballId: b.id, speed: Math.hypot(b.vx, b.vy) });
        if (g.exit) {
          b.x = g.exit.pos[0]; b.y = g.exit.pos[1];
          b.vx = g.exit.vel[0]; b.vy = g.exit.vel[1];
          b.inside = [];
          carried = true;
          break;
        }
      }
      if (carried) continue;

      // Two passes so a ball pushed out of one surface into another is resolved.
      for (let pass = 0; pass < 2; pass++) {
        let touched = false;
        for (const g of T.segs) {
          if (b.x < g.minx - R || b.x > g.maxx + R || b.y < g.miny - R || b.y > g.maxy + R) continue;
          if (g.kind === KIND_ONEWAY && b.vx * g.px + b.vy * g.py > 0) continue;
          if (!touchSeg(b, g.ax, g.ay, g.bx, g.by, R)) continue;
          touched = true;
          const impact = bounce(b, c.nx, c.ny, g.e, WALL_FRICTION, 0, 0);
          if (g.kind === KIND_TARGET) {
            if (impact > EVENT_SPEED.target) events.push({ type: 'target', id: g.id, ballId: b.id, speed: impact });
          } else if (g.kind === KIND_SLING) {
            if (impact > EVENT_SPEED.sling) {
              b.vx += c.nx * g.kick; b.vy += c.ny * g.kick;
              events.push({ type: 'sling', id: g.id, ballId: b.id, speed: impact });
            }
          } else if (impact > EVENT_SPEED.wall) {
            events.push({ type: 'wall', ballId: b.id, speed: impact });
          }
        }
        for (const bm of table.bumpers) {
          const dx = b.x - bm.pos[0], dy = b.y - bm.pos[1];
          const reach = bm.r + R;
          const d2 = dx * dx + dy * dy;
          if (d2 >= reach * reach) continue;
          touched = true;
          const d = Math.sqrt(d2);
          // A ball dead centre on a bumper has no normal; send it up-table.
          const nx = d > 1e-9 ? dx / d : 0, ny = d > 1e-9 ? dy / d : -1;
          b.x = bm.pos[0] + nx * reach; b.y = bm.pos[1] + ny * reach;
          const vn = b.vx * nx + b.vy * ny;
          if (vn < 0) {
            bounce(b, nx, ny, BUMPER_BOUNCE, 0, 0, 0);
            const out = b.vx * nx + b.vy * ny;
            if (out < bm.kick) { b.vx += (bm.kick - out) * nx; b.vy += (bm.kick - out) * ny; }
            events.push({ type: 'bumper', id: bm.id, ballId: b.id, speed: -vn });
          }
        }
        for (const F of fl) {
          const { f } = F;
          if (!touchSeg(b, f.pivot[0], f.pivot[1], F.tx, F.ty, R + f.radius)) continue;
          touched = true;
          // Velocity of the flipper surface at the contact point: omega x r.
          const svx = -F.angVel * (c.cy - f.pivot[1]);
          const svy = F.angVel * (c.cx - f.pivot[0]);
          bounce(b, c.nx, c.ny, FLIPPER_BOUNCE, FLIPPER_FRICTION, svx, svy);
        }
        if (!touched) break;
      }
      capSpeed(b);

      // Rollovers: emit on entry only.
      for (const r of table.rollovers) {
        const dx = b.x - r.pos[0], dy = b.y - r.pos[1];
        const at = b.inside.indexOf(r.id);
        if (dx * dx + dy * dy < r.r * r.r) {
          if (at < 0) {
            b.inside.push(r.id);
            events.push({ type: 'rollover', id: r.id, ballId: b.id, speed: Math.hypot(b.vx, b.vy) });
          }
        } else if (at >= 0) b.inside.splice(at, 1);
      }

      // Saucers capture on entry; a ball just ejected is still "inside" and is let go.
      for (const sc of table.saucers) {
        const dx = b.x - sc.pos[0], dy = b.y - sc.pos[1];
        const at = b.inside.indexOf(sc.id);
        if (dx * dx + dy * dy < sc.r * sc.r) {
          if (at < 0) {
            events.push({ type: 'saucer', id: sc.id, ballId: b.id, speed: Math.hypot(b.vx, b.vy) });
            b.inside.push(sc.id);
            b.state = 'held'; b.heldIn = sc.id; b.heldMs = sc.holdMs;
            b.x = sc.pos[0]; b.y = sc.pos[1]; b.vx = 0; b.vy = 0;
            break;
          }
        } else if (at >= 0) b.inside.splice(at, 1);
      }
    }

    // Ball against ball (multiball). Equal masses.
    for (let i = 0; i < balls.length; i++) {
      const p = balls[i];
      if (p.state !== 'live' || p.gone) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const q = balls[j];
        if (q.state !== 'live' || q.gone) continue;
        const dx = q.x - p.x, dy = q.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= 4 * R * R || d2 < 1e-12) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
        const push = (2 * R - d) / 2;
        p.x -= nx * push; p.y -= ny * push; q.x += nx * push; q.y += ny * push;
        const vn = (q.vx - p.vx) * nx + (q.vy - p.vy) * ny;
        if (vn < 0) {
          const j2 = -(1 + BALL_BOUNCE) * vn / 2;
          p.vx -= j2 * nx; p.vy -= j2 * ny; q.vx += j2 * nx; q.vy += j2 * ny;
        }
      }
    }
  }

  // End of step: drains, and balls that fell back down the plunger lane.
  let waiting = balls.filter((b) => b.state === 'plunger').length;
  for (const b of balls) {
    if (b.state !== 'live') continue;
    if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.vx) || !Number.isFinite(b.vy)) {
      throw new Error(`physics: ball ${b.id} went non-finite: pos ${b.x},${b.y} vel ${b.vx},${b.vy}`);
    }
    if (b.y > table.drainY) {
      b.gone = true;
      events.push({ type: 'drain', ballId: b.id, speed: Math.hypot(b.vx, b.vy) });
      continue;
    }
    const pl = table.plunger.pos;
    if (Math.abs(b.x - pl[0]) < R * 1.5 && b.y > pl[1] - R && b.vx * b.vx + b.vy * b.vy < 50 * 50) {
      const slot = plungerSlot(table, waiting++);
      b.state = 'plunger'; b.x = slot[0]; b.y = slot[1]; b.vx = 0; b.vy = 0; b.inside = [];
    }
  }

  const outBalls = [];
  for (const b of balls) {
    if (b.gone) continue;
    const o = { id: b.id, pos: [b.x, b.y], vel: [b.vx, b.vy], state: b.state, inside: b.inside };
    if (b.state === 'held') { o.heldIn = b.heldIn; o.heldMs = b.heldMs; }
    outBalls.push(o);
  }
  const flippers = {};
  for (const F of fl) flippers[F.f.id] = { angle: F.angle, angVel: F.angVel };

  return { phys: { balls: outBalls, flippers, charge, nextBallId: phys.nextBallId }, events };
}
