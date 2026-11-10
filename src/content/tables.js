// The two playfields. Plain data, built once at module load by small pure helpers.
//
// Shared conventions (both tables): the field is 400 x 800, y grows downward. The
// outer left wall is x = 8. The plunger lane is the strip 366 < x < 392 on the right,
// so the playfield proper is 8 < x < 366 and is mirrored about x = 187 by mx().
// Every surface a ball can come to rest on slopes; there are no horizontal ledges
// except the plunger floor, where physics turns a resting ball back into a plunger ball.

const L = 8;            // left wall
const LANE = 366;       // plunger lane divider / right wall of the playfield
const RIGHT = 392;      // outer right wall
const R = 8;            // ball radius

const mx = (x) => L + LANE - x;
const mirror = (p) => [mx(p[0]), p[1]];

/** Consecutive points -> wall segments. */
function poly(points, bounce) {
  const out = [];
  for (let i = 0; i + 1 < points.length; i++) {
    out.push(bounce === undefined ? { a: points[i], b: points[i + 1] } : { a: points[i], b: points[i + 1], bounce });
  }
  return out;
}

/** Arc as a polyline, angles in degrees, y down (so -90 is straight up). */
function arc(cx, cy, r, fromDeg, toDeg, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = ((fromDeg + (toDeg - fromDeg) * i / n) * Math.PI) / 180;
    pts.push([Math.round((cx + r * Math.cos(t)) * 100) / 100, Math.round((cy + r * Math.sin(t)) * 100) / 100]);
  }
  return pts;
}

const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** A row of standup targets along a-b, with a gap between each. */
function bank(ids, a, b, group, gap = 0.12) {
  const n = ids.length;
  const w = (1 - gap * (n - 1)) / n;
  return ids.map((id, i) => {
    const t0 = i * (w + gap);
    return { id, a: lerp(a, b, t0), b: lerp(a, b, t0 + w), group };
  });
}

/**
 * The bottom third: flippers, slingshots, inlanes and outlanes, mirrored.
 * o.divX     x of the post between outlane and inlane
 * o.divTop   y of the top of that post
 * o.elbow    y where the inlane guide turns in toward the flipper
 * o.pivot    left flipper pivot
 * o.sling    [top, bottomLeft, bottomRight] of the left slingshot triangle
 */
function lower(o) {
  const guideL = [[o.divX, o.divTop], [o.divX, o.elbow], [o.pivot[0] - 6, o.pivot[1] - 5]];
  const [st, sbl, sbr] = o.sling;
  const f0 = lerp(st, sbr, 0.14), f1 = lerp(st, sbr, 0.88);
  const slingWallsL = [...poly([f0, st, sbl, sbr, f1])];
  const walls = [
    ...poly(guideL), ...poly(guideL.map(mirror)),
    ...slingWallsL, ...slingWallsL.map((w) => ({ a: mirror(w.a), b: mirror(w.b) })),
  ];
  const slings = [
    { id: 'slingL', a: f0, b: f1, kick: o.slingKick },
    { id: 'slingR', a: mirror(f0), b: mirror(f1), kick: o.slingKick },
  ];
  const flippers = [
    { id: 'fl', side: 'left', pivot: o.pivot, length: o.flipLen, radius: 6, restAngle: o.rest, activeAngle: -o.active },
    { id: 'fr', side: 'right', pivot: mirror(o.pivot), length: o.flipLen, radius: 6, restAngle: Math.PI - o.rest, activeAngle: Math.PI + o.active },
  ];
  const inX = (o.divX + st[0]) / 2, outX = (L + o.divX) / 2;
  const laneY = (o.divTop + o.elbow) / 2 + 8;
  const rollovers = [
    { id: 'inL', pos: [inX, laneY], r: 11, group: 'lanes' },
    { id: 'outL', pos: [outX, laneY + 14], r: 11, group: 'lanes' },
    { id: 'inR', pos: [mx(inX), laneY], r: 11, group: 'lanes' },
    { id: 'outR', pos: [mx(outX), laneY + 14], r: 11, group: 'lanes' },
  ];
  return { walls, slings, flippers, rollovers, inR: [mx(inX), o.divTop + 4], inL: [inX, o.divTop + 4] };
}

/** Outer shell shared by both: side walls, plunger lane, its floor, the top-right arc. */
function shell(arcR, topY) {
  const cy = topY + arcR;
  return {
    walls: [
      { a: [LANE, 800], b: [LANE, cy + 42] },                 // lane divider
      { a: [RIGHT, 800], b: [RIGHT, cy] },                    // outer right
      ...poly(arc(RIGHT - arcR, cy, arcR, 0, -90, 10)),       // top-right arc: turns the launch leftward
      { a: [LANE, 778], b: [RIGHT, 778] },                    // plunger floor
    ],
    // The lane gate: a launched ball passes up through it, nothing comes back down.
    // It slopes, so a ball that lands on it rolls off into the playfield.
    gate: { id: 'laneGate', a: [LANE, cy + 42], b: [RIGHT, cy + 2], pass: [-0.55, -0.83] },
    arcEnd: [RIGHT - arcR, topY],
  };
}

/** A lane hugging a side wall that opens diagonally toward the flippers (left side; mirror for right). */
function sideLane(top, bend, mouthY, width, reach) {
  const inner = [[L + width, top], [L + width, bend], [L + width + reach, mouthY]];
  const outer = [[L, bend + 20], [L + reach - 4, mouthY + 10], [L, mouthY + 50]];
  return { inner, outer };
}

// ═════════════════════════ VESSERY ═════════════════════════
// A harbour on festival night. Open water in the middle, three drums under the lot
// lanes, lantern stalls down the left quay and the Mint's seals down the right.

function vessery() {
  const sh = shell(100, 8);
  const lo = lower({
    divX: 40, divTop: 592, elbow: 660, pivot: [120, 698],
    sling: [[72, 574], [72, 648], [108, 664]], slingKick: 330,
    flipLen: 56, rest: 0.5, active: 0.45,
  });
  const pier = sideLane(250, 330, 430, 34, 46);        // left: the pier ramp
  const dock = { inner: pier.inner.map(mirror), outer: pier.outer.map(mirror) };   // right: the dock orbit

  const walls = [
    ...sh.walls, ...lo.walls,
    // ceiling, then the breakwater that stops a launch and drops it on the lot lanes
    { a: sh.arcEnd, b: [118, 20] },
    { a: [118, 20], b: [108, 80], bounce: 0.3 },
    ...poly([[108, 80], [56, 130], [L, 205]]),
    // left wall, broken by the pier wedge
    { a: [L, 205], b: pier.outer[0] }, ...poly(pier.outer), { a: pier.outer[2], b: [L, 800] },
    ...poly(pier.inner),
    // right: the dock wedge sits against the lane divider
    ...poly(dock.outer), ...poly(dock.inner),
    // lot lane guides
    ...[127, 167, 207, 247].map((x) => ({ a: [x, 72], b: [x, 118] })),
  ];

  return {
    id: 'vessery',
    name: 'Vessery Harbour',
    width: 400,
    height: 800,
    gravity: 1150,
    ballRadius: R,
    walls,
    oneWays: [sh.gate],
    flippers: lo.flippers,
    bumpers: [
      { id: 'drum1', pos: [143, 192], r: 20, kick: 470 },
      { id: 'drum2', pos: [231, 192], r: 20, kick: 470 },
      { id: 'drum3', pos: [187, 258], r: 20, kick: 470 },
    ],
    slings: lo.slings,
    targets: [
      ...bank(['lanternA', 'lanternB', 'lanternC'], [45, 322], [45, 256], 'lanterns'),
      ...bank(['sealM', 'sealI', 'sealN', 'sealT'], [mx(45), 256], [mx(45), 326], 'seals'),
    ],
    rollovers: [
      { id: 'lotL', pos: [147, 96], r: 10, group: 'lots' },
      { id: 'lotC', pos: [187, 96], r: 10, group: 'lots' },
      { id: 'lotR', pos: [227, 96], r: 10, group: 'lots' },
      ...lo.rollovers,
    ],
    shots: [
      // the pier ramp carries the ball over the water to the right inlane
      { id: 'pierRamp', a: [L, 322], b: [L + 34, 322], dir: [0, -1], exit: { pos: lo.inR, vel: [0, 140] } },
      { id: 'dockOrbit', a: [mx(L + 34), 300], b: [LANE, 300], dir: [0, -1] },
    ],
    saucers: [
      { id: 'bench', pos: [76, 196], r: 14, eject: [250, 170], holdMs: 900 },
    ],
    plunger: { pos: [379, 770], maxSpeed: 1900 },
    drainY: 792,
    theme: {
      bg: ['#0b1a33', '#12305a', '#1d4a6e'],
      accent: '#ffb347',
      glow: '#ffe6a8',
      motif: 'lanterns',
    },
    decor: [
      { text: 'VESSERY', pos: [187, 420], size: 30 },
      { text: 'FESTIVAL OF LOTS', pos: [187, 448], size: 11 },
      { text: 'PIER', pos: [44, 400], size: 10, angle: -1.14 },
      { text: 'DOCKS', pos: [330, 400], size: 10, angle: 1.14 },
      { text: 'PAYABLE IN STILLNESS', pos: [187, 560], size: 8 },
    ],
    labels: {
      drum1: 'DRUM', drum2: 'DRUM', drum3: 'DRUM',
      lanternA: 'A', lanternB: 'B', lanternC: 'C',
      sealM: 'M', sealI: 'I', sealN: 'N', sealT: 'T',
      lotL: 'LOT', lotC: 'LOT', lotR: 'LOT',
      pierRamp: 'PIER', dockOrbit: 'DOCK', bench: 'BENCH',
      inL: 'IN', inR: 'IN', outL: 'OUT', outR: 'OUT',
      slingL: 'TIDE', slingR: 'TIDE',
    },
  };
}

// ═════════════════════════ SALTMERE ═════════════════════════
// A mine and a court. Steeper, with a headframe wall splitting the top: salt lanes and
// the shaft bumpers stacked on the right, and on the left a single narrow gallery that
// climbs to the Orrery. The Orrery is a dead-end lane: hard to enter, certain once in.

function saltmere() {
  const sh = shell(92, 8);
  const lo = lower({
    divX: 38, divTop: 600, elbow: 664, pivot: [122, 702],
    sling: [[68, 566], [68, 652], [108, 670]], slingKick: 380,
    flipLen: 54, rest: 0.52, active: 0.45,
  });
  const cause = sideLane(270, 360, 452, 32, 42);       // left: the causeway ramp
  const courtBase = sideLane(240, 350, 440, 30, 40);   // right: the court orbit, narrower
  const court = { inner: courtBase.inner.map(mirror), outer: courtBase.outer.map(mirror) };

  // the gallery to the Orrery: leans toward the flippers, flared at the mouth
  const galL = [[96, 138], [100, 300], [88, 356]];
  const galR = [[130, 138], [134, 300], [150, 356]];

  const walls = [
    ...sh.walls, ...lo.walls,
    // ceiling and top-left corner
    { a: sh.arcEnd, b: [100, 8] },
    ...poly(arc(100, 100, 92, -90, -180, 10)),
    { a: [L, 100], b: cause.outer[0] }, ...poly(cause.outer), { a: cause.outer[2], b: [L, 800] },
    ...poly(cause.inner),
    ...poly(court.outer), ...poly(court.inner),
    // the headframe: stops a launch and drops it on the salt lanes
    { a: [212, 8], b: [218, 64], bounce: 0.3 },
    // salt lane guides
    ...[236, 270, 304, 338].map((x) => ({ a: [x, 74], b: [x, 118] })),
    // the Orrery gallery, with a peaked roof so nothing rests on it
    ...poly(galL), ...poly(galR),
    ...poly([[96, 138], [113, 120], [130, 138]]),
  ];

  return {
    id: 'saltmere',
    name: 'Saltmere Pithead',
    width: 400,
    height: 800,
    gravity: 1400,
    ballRadius: R,
    walls,
    oneWays: [sh.gate],
    flippers: lo.flippers,
    bumpers: [
      { id: 'shaft1', pos: [286, 176], r: 18, kick: 520 },
      { id: 'shaft2', pos: [246, 232], r: 18, kick: 520 },
      { id: 'shaft3', pos: [292, 290], r: 18, kick: 520 },
    ],
    slings: lo.slings,
    targets: [
      ...bank(['strikeA', 'strikeB', 'strikeC'], [137, 290], [134, 206], 'strike'),
      ...bank(['lienL', 'lienI', 'lienE', 'lienN'], [mx(41), 246], [mx(41), 330], 'lien'),
    ],
    rollovers: [
      { id: 'saltL', pos: [253, 96], r: 10, group: 'salt' },
      { id: 'saltC', pos: [287, 96], r: 10, group: 'salt' },
      { id: 'saltR', pos: [321, 96], r: 10, group: 'salt' },
      ...lo.rollovers,
    ],
    shots: [
      // the causeway returns to the left inlane, so the same flipper can shoot the court
      { id: 'causewayRamp', a: [L, 352], b: [L + 32, 352], dir: [0, -1], exit: { pos: lo.inL, vel: [0, 140] } },
      { id: 'courtOrbit', a: [mx(L + 30), 300], b: [LANE, 300], dir: [0, -1] },
    ],
    saucers: [
      { id: 'orrery', pos: [114, 160], r: 12, eject: [30, 320], holdMs: 1400 },
    ],
    plunger: { pos: [379, 770], maxSpeed: 2100 },
    drainY: 792,
    theme: {
      bg: ['#0d1014', '#1a2530', '#27404d'],
      accent: '#7fd6ff',
      glow: '#e8f6ff',
      motif: 'stillsalt',
    },
    decor: [
      { text: 'SALTMERE', pos: [215, 440], size: 28 },
      { text: 'IN ARREARS', pos: [215, 466], size: 11 },
      { text: 'ORRERY', pos: [70, 250], size: 9, angle: -1.5708 },
      { text: 'CAUSEWAY', pos: [40, 420], size: 9, angle: -1.14 },
      { text: 'CIRCUIT BENCH', pos: [322, 410], size: 9, angle: 1.14 },
      { text: 'NOTICE OF FORECLOSURE', pos: [200, 560], size: 8 },
    ],
    labels: {
      shaft1: 'SHAFT', shaft2: 'SHAFT', shaft3: 'SHAFT',
      strikeA: 'A', strikeB: 'B', strikeC: 'C',
      lienL: 'L', lienI: 'I', lienE: 'E', lienN: 'N',
      saltL: 'SALT', saltC: 'SALT', saltR: 'SALT',
      causewayRamp: 'CAUSEWAY', courtOrbit: 'COURT', orrery: 'ORRERY',
      inL: 'IN', inR: 'IN', outL: 'OUT', outR: 'OUT',
      slingL: 'PICK', slingR: 'PICK',
    },
  };
}

export const tables = { vessery: vessery(), saltmere: saltmere() };
