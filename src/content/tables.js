// The eight playfields. Plain data, built once at module load by small pure helpers.
//
// Shared conventions (every table): the field is 400 x 800, y grows downward. The
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
 * o.guard    [left, right] how far each outlane guard bump stands out from the wall; o.guardY its tip
 */
function lower(o) {
  // The guide ends tangent to the top of the flipper's pivot cap, and is shallower than
  // the flipper at rest. Ending it short of the cap leaves a notch a slow ball sits in.
  const guideL = [[o.divX, o.divTop], [o.divX, o.elbow],
    [o.pivot[0] + 6 * Math.sin(o.rest), o.pivot[1] - 6 * Math.cos(o.rest)]];
  const [st, sbl, sbr] = o.sling;
  const f0 = lerp(st, sbr, 0.14), f1 = lerp(st, sbr, 0.88);
  const slingWallsL = [...poly([f0, st, sbl, sbr, f1])];
  // A rubber bump on the side wall above each outlane. Without it a weak lob from the
  // far flipper drops straight down the wall into the outlane; with it the ball has to
  // come in low and sideways to get there.
  const guard = (g) => [[L, o.guardY - 46], [L + g, o.guardY], [L, o.guardY + 12]];
  const walls = [
    ...poly(guard(o.guard[0])), ...poly(guard(o.guard[1]).map(mirror)),
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

/** Outer shell shared by all eight: side walls, plunger lane, its floor, the top-right arc. */
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

/**
 * A lane hugging a side wall that opens diagonally toward the flippers (left side; mirror for right).
 *
 * `reach` is how far the mouth stands out from the wall, and it decides how often the lane is
 * made. Balls leave the flippers mostly up the middle: on Vessery the bot sent 3 balls per five
 * minutes up through each 20 units of width at x = 60, and 11 at x = 120. With reach 46 the mouth
 * spanned x 50-88 and the pier was made 4.0 times in five minutes; with reach 70 (x 74-112),
 * 10.2 times. Past 90 the wedges feed the outlanes and the average ball drops from 37 s to 22 s.
 */
function sideLane(top, bend, mouthY, width, reach) {
  const inner = [[L + width, top], [L + width, bend], [L + width + reach, mouthY]];
  const outer = [[L, bend + 20], [L + reach - 4, mouthY + 10], [L, mouthY + 50]];
  // The shot gate: a line across the diagonal part of the lane at height y, wall to wall.
  const at = (p, q, y) => p[0] + (q[0] - p[0]) * (y - p[1]) / (q[1] - p[1]);
  const gate = (y) => [[at(outer[0], outer[1], y), y], [at(inner[1], inner[2], y), y]];
  return { inner, outer, gate };
}

const mirrorLane = (lane) => ({
  inner: lane.inner.map(mirror), outer: lane.outer.map(mirror), gate: (y) => lane.gate(y).map(mirror).reverse(),
});

/**
 * Three top-lane rollovers between four guides, and the guides. Each sensor is as wide as
 * the lane is to a ball's centre, plus one: with r = 10 in a 40-wide lane a ball sliding down
 * a guide (centre 12 off the middle) went through unlit.
 */
function topLanes(ids, xs, y0, y1, group) {
  if (xs.length !== ids.length + 1) throw new Error(`tables: ${ids.length} lanes need ${ids.length + 1} guides, got ${xs.length}`);
  return {
    walls: xs.map((x) => ({ a: [x, y0], b: [x, y1] })),
    rollovers: ids.map((id, i) => ({ id, pos: [(xs[i] + xs[i + 1]) / 2, (y0 + y1) / 2 + 1], r: (xs[i + 1] - xs[i]) / 2 - R + 1, group })),
  };
}

// ═════════════════════════ VESSERY ═════════════════════════
// A harbour on festival night. Open water in the middle, three drums under the lot
// lanes, lantern stalls standing to the left of the drums and the Mint's seals to the right.

function vessery() {
  const sh = shell(100, 8);
  const lo = lower({
    divX: 31, divTop: 592, elbow: 660, pivot: [120, 698],
    sling: [[72, 574], [72, 648], [108, 664]], slingKick: 330,
    flipLen: 56, rest: 0.5, active: 0.62, guard: [11, 11], guardY: 552,
  });
  const pier = sideLane(250, 330, 430, 34, 70);        // left: the pier ramp
  const dock = mirrorLane(pier);                       // right: the dock orbit
  const lots = topLanes(['lotL', 'lotC', 'lotR'], [127, 167, 207, 247], 72, 118, 'lots');

  const walls = [
    ...sh.walls, ...lo.walls,
    // ceiling, then the breakwater that stops a launch and drops it on the lot lanes. It
    // ends on the first lane guide: when it ended 17 units short, 13 plunge strengths in 80
    // slipped down the gap and missed the lots altogether.
    { a: sh.arcEnd, b: [118, 20] },
    { a: [118, 20], b: [127, 72], bounce: 0.3 },
    ...poly([[127, 118], [56, 150], [L, 205]]),
    // left wall, broken by the pier wedge
    { a: [L, 205], b: pier.outer[0] }, ...poly(pier.outer), { a: pier.outer[2], b: [L, 800] },
    ...poly(pier.inner),
    // right: the dock wedge sits against the lane divider
    ...poly(dock.outer), ...poly(dock.inner),
    ...lots.walls,
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
      // The banks stand free either side of the drums, leaning in, so a drum throws the ball
      // onto them and a cross shot from the far flipper meets them square. Flat against the
      // lane walls at x = 45 the bot found lantern A 3.5 times in five minutes and seal N 2.6
      // times, and "light every lantern" took it 3:46 on average; here, 15 and 8.
      ...bank(['lanternA', 'lanternB', 'lanternC'], [126, 304], [98, 236], 'lanterns'),
      ...bank(['sealM', 'sealI', 'sealN', 'sealT'], [mx(98), 236], [mx(126), 304], 'seals', 0.06),
    ],
    rollovers: [
      ...lots.rollovers, ...lo.rollovers,
    ],
    shots: [
      // Both gates sit across the lane mouths, not up at the top of the lanes. With the gate at
      // y = 322 the test bot made the pier 2 times in five minutes and the three-ramp scene took
      // it 5:00 on average; a ball that gets into the mouth going up has made the shot.
      // the pier ramp carries the ball over the water to the right inlane
      { id: 'pierRamp', a: pier.gate(410)[0], b: pier.gate(410)[1], dir: [0, -1], exit: { pos: lo.inR, vel: [0, 140] } },
      { id: 'dockOrbit', a: dock.gate(410)[0], b: dock.gate(410)[1], dir: [0, -1] },
    ],
    saucers: [
      { id: 'bench', pos: [76, 196], r: 14, eject: [250, 170], holdMs: 900 },
    ],
    // The Reels of Assay: lane i fills reel i; the saucer, the ramp and the orbit spin all three when lit.
    reels: { fill: ['lotL', 'lotC', 'lotR'], spin: ['bench', 'pierRamp', 'dockOrbit'] },
    plunger: { pos: [379, 770], maxSpeed: 1900 },
    drainY: 792,
    theme: {
      bg: ['#0b1a33', '#12305a', '#1d4a6e'],
      accent: '#ffb347',
      glow: '#ffe6a8',
      motif: 'lanterns',
    },
    decor: [
      { text: 'VESSERY', pos: [187, 470], size: 30 },
      { text: 'FESTIVAL OF LOTS', pos: [187, 498], size: 11 },
      { text: 'PIER', pos: [25, 292], size: 10, angle: -1.5708 },
      { text: 'DOCKS', pos: [mx(25), 292], size: 10, angle: 1.5708 },
      { text: 'PAYABLE IN CALM', pos: [187, 560], size: 8 },
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
// the shaft bumpers stacked on the right, the picket line across the left flats, and up
// the middle a single narrow gallery that climbs to the Orrery. The Orrery is a dead-end
// lane: hard to enter, certain once in.

function saltmere() {
  const sh = shell(92, 8);
  const lo = lower({
    divX: 30, divTop: 600, elbow: 664, pivot: [122, 702],
    sling: [[68, 566], [68, 652], [108, 670]], slingKick: 380,
    flipLen: 57, rest: 0.52, active: 0.62, guard: [12, 20], guardY: 558,
  });
  const cause = sideLane(270, 360, 452, 32, 66);                   // left: the causeway ramp
  const court = mirrorLane(sideLane(170, 350, 440, 33, 70));       // right: the court orbit, narrower and longer

  const salts = topLanes(['saltL', 'saltC', 'saltR'], [236, 270, 304, 338], 74, 118, 'salt');

  // The gallery to the Orrery leans seven degrees and has no flare at its mouth. It sits
  // between the two angles a flipper gives easily (the near-side shot off the base, the
  // cross shot off the tip), so it has to be aimed for. Measured with the test bot over
  // six minutes: directly above a flipper base it was made 23 times, here with a flared
  // mouth 26 times, here without the flare 12 times.
  const galL = [[174.5, 138], [154, 300], [147, 356]];
  const galR = [[208.5, 138], [188, 300], [181, 356]];

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
    ...salts.walls,
    // the Orrery gallery, with a peaked roof so nothing rests on it
    ...poly(galL), ...poly(galR),
    ...poly([[174.5, 138], [191.5, 120], [208.5, 138]]),
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
      // The strike bank is the picket line: it stands free across the left flats, square to
      // a cross shot from the right flipper. Mounted on the left of the Orrery gallery it faced
      // away from every flipper and the bot found each target 3 to 4 times in five minutes;
      // here, 12 to 17.
      ...bank(['strikeA', 'strikeB', 'strikeC'], [66, 292], [122, 240], 'strike', 0.06),
      // The liens are on the court lane's wall beside the shafts. Lower down (y 246-330) the
      // bottom two were out of the bumpers' reach: lien N 2.2 times in five minutes, here 19.
      ...bank(['lienL', 'lienI', 'lienE', 'lienN'], [mx(44), 178], [mx(44), 282], 'lien', 0.06),
    ],
    rollovers: [
      ...salts.rollovers, ...lo.rollovers,
    ],
    shots: [
      // gates across the lane mouths, as on Vessery
      // the causeway returns to the left inlane, so the same flipper can shoot the court
      { id: 'causewayRamp', a: cause.gate(432)[0], b: cause.gate(432)[1], dir: [0, -1], exit: { pos: lo.inL, vel: [0, 140] } },
      { id: 'courtOrbit', a: court.gate(420)[0], b: court.gate(420)[1], dir: [0, -1] },
    ],
    saucers: [
      { id: 'orrery', pos: [189, 160], r: 12, eject: [-40, 317], holdMs: 1400 },
    ],
    reels: { fill: ['saltL', 'saltC', 'saltR'], spin: ['orrery', 'causewayRamp', 'courtOrbit'] },
    plunger: { pos: [379, 770], maxSpeed: 2100 },
    drainY: 792,
    theme: {
      bg: ['#0d1014', '#1a2530', '#27404d'],
      accent: '#7fd6ff',
      glow: '#e8f6ff',
      motif: 'stillsalt',
    },
    decor: [
      { text: 'SALTMERE', pos: [187, 500], size: 28 },
      { text: 'IN ARREARS', pos: [187, 526], size: 11 },
      { text: 'ORRERY', pos: [172, 250], size: 9, angle: -1.445 },
      { text: 'PICKET', pos: [86, 254], size: 8, angle: -0.75 },
      { text: 'CAUSEWAY', pos: [24, 316], size: 9, angle: -1.5708 },
      { text: 'CIRCUIT BENCH', pos: [mx(23), 296], size: 9, angle: 1.5708 },
      { text: 'NOTICE OF FORECLOSURE', pos: [187, 566], size: 8 },
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

// ═════════════════════════ HALCYON ═════════════════════════
// A parade ground under an academy. The fastest table and the only symmetrical one: the
// oath lanes sit in a closed pediment at the top centre (the launch comes in through a
// one-way door on its right and can only leave downward, through an oath), the drill
// bumpers stand in a chevron beneath it with the vault in the middle of the formation,
// and the dormitory and bond banks face each other across the square.

function halcyon() {
  const sh = shell(96, 8);
  const lo = lower({
    divX: 30, divTop: 596, elbow: 662, pivot: [119, 700],
    sling: [[70, 570], [70, 650], [107, 667]], slingKick: 400,
    flipLen: 57, rest: 0.5, active: 0.64, guard: [16, 16], guardY: 554,
  });
  const gallery = sideLane(196, 318, 424, 34, 68);     // left: the gallery ramp
  const parade = mirrorLane(gallery);                  // right: the parade orbit
  const oaths = topLanes(['oathL', 'oathC', 'oathR'], [127, 167, 207, 247], 82, 128, 'oaths');

  const walls = [
    ...sh.walls, ...lo.walls,
    // ceiling, and a chamfered bastion for the top-left corner
    { a: sh.arcEnd, b: [116, 8] },
    { a: [116, 8], b: [L, 124] },
    { a: [L, 124], b: gallery.outer[0] }, ...poly(gallery.outer), { a: gallery.outer[2], b: [L, 800] },
    ...poly(gallery.inner),
    ...poly(parade.outer), ...poly(parade.inner),
    // the pediment's left wall stops the launch; its right wall is the one-way door below
    { a: [116, 8], b: [127, 82], bounce: 0.1 },
    ...oaths.walls,
  ];

  return {
    id: 'halcyon',
    name: 'Halcyon Reach',
    width: 400,
    height: 800,
    gravity: 1500,
    ballRadius: R,
    walls,
    oneWays: [
      sh.gate,
      // into the pediment from the launch side, never back out
      { id: 'pedimentDoor', a: [258, 8], b: [247, 82], pass: [-1, 0] },
    ],
    flippers: lo.flippers,
    bumpers: [
      { id: 'drill1', pos: [187, 190], r: 18, kick: 540 },
      { id: 'drill2', pos: [133, 262], r: 18, kick: 540 },
      { id: 'drill3', pos: [mx(133), 262], r: 18, kick: 540 },
    ],
    slings: lo.slings,
    targets: [
      ...bank(['dormA', 'dormB', 'dormC'], [94, 346], [94, 272], 'dorm'),
      ...bank(['bondB', 'bondO', 'bondN', 'bondD'], [mx(94), 266], [mx(94), 348], 'bond', 0.06),
    ],
    rollovers: [...oaths.rollovers, ...lo.rollovers],
    shots: [
      // Gates across the lane mouths. The gallery climbs to the pediment and lets the ball go
      // over the centre oath, a little off the middle so it cannot fall dead on drill 1 and
      // juggle there. The launch alone favours the outer oaths (36, 15 and 21 of 80 plunge
      // strengths reach right, centre and left); landing the ramp in an inlane, "take all
      // three oaths" took the bot a median 2:47 in the full playthrough.
      { id: 'galleryRamp', a: gallery.gate(404)[0], b: gallery.gate(404)[1], dir: [0, -1], exit: { pos: [179, 44], vel: [40, 0] } },
      { id: 'paradeOrbit', a: parade.gate(404)[0], b: parade.gate(404)[1], dir: [0, -1] },
    ],
    saucers: [
      // dead centre of the formation; it hands the ball to the left flipper
      { id: 'vault', pos: [187, 252], r: 12, eject: [-52, 180], holdMs: 1100 },
    ],
    reels: { fill: ['oathL', 'oathC', 'oathR'], spin: ['vault', 'galleryRamp', 'paradeOrbit'] },
    plunger: { pos: [379, 770], maxSpeed: 2200 },
    drainY: 792,
    theme: {
      bg: ['#0e1220', '#1a2440', '#33446c'],
      accent: '#d9b45a',
      glow: '#f6ecc9',
      motif: 'banners',
    },
    decor: [
      { text: 'HALCYON', pos: [187, 486], size: 30 },
      { text: 'SURETY ACADEMY', pos: [187, 512], size: 11 },
      { text: 'GALLERY', pos: [25, 262], size: 9, angle: -1.5708 },
      { text: 'PARADE', pos: [mx(25), 262], size: 9, angle: 1.5708 },
      { text: 'BODY FOR BODY', pos: [187, 566], size: 8 },
    ],
    labels: {
      drill1: 'DRILL', drill2: 'DRILL', drill3: 'DRILL',
      dormA: 'A', dormB: 'B', dormC: 'C',
      bondB: 'B', bondO: 'O', bondN: 'N', bondD: 'D',
      oathL: 'OATH', oathC: 'OATH', oathR: 'OATH',
      galleryRamp: 'GALLERY', paradeOrbit: 'PARADE', vault: 'VAULT',
      inL: 'IN', inR: 'IN', outL: 'OUT', outR: 'OUT',
      slingL: 'RANK', slingR: 'FILE',
    },
  };
}

// ═════════════════════════ BRAND ═════════════════════════
// Little Brand, nine years dark. The slowest table and the emptiest: the tide lanes are
// pushed into the top-left corner under a cliff, the three reefs are scattered wide with
// open water between them, and the long breakwater runs low down the left side. The
// hearth is hidden: it sits in a cove at the head of the under-lane, roofed over, so a
// ball finds it by rowing up the under-lane or by coming in low from the west.

function brand() {
  const sh = shell(104, 8);
  const lo = lower({
    divX: 32, divTop: 600, elbow: 664, pivot: [121, 700],
    sling: [[74, 584], [74, 652], [108, 667]], slingKick: 300,
    flipLen: 55, rest: 0.5, active: 0.6, guard: [16, 9], guardY: 562,
  });
  const breakwater = sideLane(300, 372, 462, 36, 74);               // left: the breakwater ramp, low and long
  const under = mirrorLane(sideLane(284, 340, 428, 34, 70));        // right: the under-lane orbit
  const tides = topLanes(['tideL', 'tideC', 'tideR'], [58, 98, 138, 178], 84, 130, 'tides');

  const walls = [
    ...sh.walls, ...lo.walls,
    // ceiling; the cliff fills the top-left corner, stops the launch and stands the tide lanes
    { a: sh.arcEnd, b: [66, 8] },
    { a: [66, 8], b: [58, 84], bounce: 0.6 },
    ...poly([[58, 130], [L, 190]]),
    { a: [L, 190], b: breakwater.outer[0] }, ...poly(breakwater.outer), { a: breakwater.outer[2], b: [L, 800] },
    ...poly(breakwater.inner),
    ...poly(under.outer), ...poly(under.inner),
    ...tides.walls,
    // the cove: a roof over the head of the under-lane, with a lip
    ...poly([[LANE, 186], [316, 212], [318, 234]]),
  ];

  return {
    id: 'brand',
    name: 'Little Brand',
    width: 400,
    height: 800,
    gravity: 1080,
    ballRadius: R,
    walls,
    oneWays: [sh.gate],
    flippers: lo.flippers,
    bumpers: [
      { id: 'reef1', pos: [118, 198], r: 19, kick: 430 },
      { id: 'reef2', pos: [246, 168], r: 21, kick: 430 },
      { id: 'reef3', pos: [200, 312], r: 17, kick: 430 },
    ],
    slings: lo.slings,
    targets: [
      ...bank(['netA', 'netB', 'netC'], [124, 372], [96, 300], 'nets'),
      ...bank(['wickW', 'wickI', 'wickC', 'wickK'], [262, 250], [282, 336], 'wick', 0.06),
    ],
    rollovers: [...tides.rollovers, ...lo.rollovers],
    shots: [
      // gates across the lane mouths; the breakwater lands the ball in the left inlane
      { id: 'breakwaterRamp', a: breakwater.gate(440)[0], b: breakwater.gate(440)[1], dir: [0, -1], exit: { pos: lo.inL, vel: [0, 120] } },
      { id: 'underlaneOrbit', a: under.gate(408)[0], b: under.gate(408)[1], dir: [0, -1] },
    ],
    saucers: [
      { id: 'hearth', pos: [349, 240], r: 13, eject: [-260, 60], holdMs: 1600 },
    ],
    reels: { fill: ['tideL', 'tideC', 'tideR'], spin: ['hearth', 'breakwaterRamp', 'underlaneOrbit'] },
    plunger: { pos: [379, 770], maxSpeed: 1850 },
    drainY: 792,
    theme: {
      bg: ['#030609', '#07121a', '#0d222c'],
      accent: '#d9773a',
      glow: '#ffd7a1',
      motif: 'reef',
    },
    decor: [
      { text: 'LITTLE BRAND', pos: [187, 500], size: 22 },
      { text: 'NINE YEARS DARK', pos: [187, 524], size: 10 },
      { text: 'BREAKWATER', pos: [26, 338], size: 9, angle: -1.5708 },
      { text: 'UNDER-LANE', pos: [mx(23), 318], size: 8, angle: 1.5708 },
      { text: 'NO COIN TAKEN HERE', pos: [187, 566], size: 8 },
    ],
    labels: {
      reef1: 'REEF', reef2: 'REEF', reef3: 'REEF',
      netA: 'A', netB: 'B', netC: 'C',
      wickW: 'W', wickI: 'I', wickC: 'C', wickK: 'K',
      tideL: 'TIDE', tideC: 'TIDE', tideR: 'TIDE',
      breakwaterRamp: 'BREAKWATER', underlaneOrbit: 'UNDER-LANE', hearth: 'HEARTH',
      inL: 'IN', inR: 'IN', outL: 'OUT', outR: 'OUT',
      slingL: 'OAR', slingR: 'OAR',
    },
  };
}

// ═════════════════════════ TALLIS ═════════════════════════
// The exchange. Everything is crowded into the middle: the three pits stand a ball and a
// quarter apart under the bell lanes, with the queue bank and the note bank as the walls
// of the trading floor on either side, so a ball that gets in is thrown from pit to bank
// to pit. The strongroom is a hooded hole up on the left, open only toward the pits.

function tallis() {
  const sh = shell(88, 8);
  const lo = lower({
    divX: 30, divTop: 604, elbow: 668, pivot: [121, 705],
    sling: [[69, 572], [69, 656], [107, 673]], slingKick: 430,
    flipLen: 58, rest: 0.54, active: 0.62, guard: [19, 19], guardY: 560,
  });
  const steps = sideLane(262, 346, 442, 34, 66);                    // left: the exchange steps
  const clearing = mirrorLane(sideLane(236, 334, 436, 32, 70));     // right: the clearing-house orbit
  const bells = topLanes(['bellL', 'bellC', 'bellR'], [134, 169, 205, 240], 92, 136, 'bells');

  const walls = [
    ...sh.walls, ...lo.walls,
    // ceiling, a small chamfer in the corner
    { a: sh.arcEnd, b: [56, 8] },
    { a: [56, 8], b: [L, 64] },
    { a: [L, 64], b: steps.outer[0] }, ...poly(steps.outer), { a: steps.outer[2], b: [L, 800] },
    ...poly(steps.inner),
    ...poly(clearing.outer), ...poly(clearing.inner),
    // the bell tower: stops the launch over the bell lanes
    { a: [146, 8], b: [134, 92], bounce: 0.6 },
    ...bells.walls,
    // the strongroom's hood: a roof and a back wall, open toward the pits
    ...poly([[124, 160], [70, 172], [70, 222]]),
  ];

  return {
    id: 'tallis',
    name: 'Tallis Exchange',
    width: 400,
    height: 800,
    gravity: 1300,
    ballRadius: R,
    walls,
    oneWays: [sh.gate],
    flippers: lo.flippers,
    bumpers: [
      { id: 'pit1', pos: [160, 226], r: 17, kick: 560 },
      { id: 'pit2', pos: [214, 226], r: 17, kick: 560 },
      { id: 'pit3', pos: [187, 273], r: 17, kick: 560 },
    ],
    slings: lo.slings,
    targets: [
      ...bank(['queueA', 'queueB', 'queueC'], [112, 314], [112, 240], 'queue'),
      ...bank(['noteM', 'noteA', 'noteR', 'noteK'], [mx(112), 208], [mx(112), 296], 'notes', 0.06),
    ],
    rollovers: [...bells.rollovers, ...lo.rollovers],
    shots: [
      // gates across the lane mouths; the steps come down to the right inlane
      { id: 'stepsRamp', a: steps.gate(422)[0], b: steps.gate(422)[1], dir: [0, -1], exit: { pos: lo.inR, vel: [0, 150] } },
      { id: 'clearingOrbit', a: clearing.gate(414)[0], b: clearing.gate(414)[1], dir: [0, -1] },
    ],
    saucers: [
      { id: 'strongroom', pos: [92, 196], r: 13, eject: [220, 90], holdMs: 1200 },
    ],
    reels: { fill: ['bellL', 'bellC', 'bellR'], spin: ['strongroom', 'stepsRamp', 'clearingOrbit'] },
    plunger: { pos: [379, 770], maxSpeed: 2050 },
    drainY: 792,
    theme: {
      bg: ['#140f08', '#2a1f0f', '#4a371a'],
      accent: '#e6c24a',
      glow: '#fff2bf',
      motif: 'ticker',
    },
    decor: [
      { text: 'TALLIS', pos: [187, 494], size: 30 },
      { text: 'PRICES MADE BY BELL', pos: [187, 520], size: 10 },
      { text: 'STEPS', pos: [25, 304], size: 10, angle: -1.5708 },
      { text: 'CLEARING HOUSE', pos: [mx(23), 286], size: 8, angle: 1.5708 },
      { text: 'STRONGROOM', pos: [96, 156], size: 7, angle: -0.21 },
      { text: 'PAYABLE ON DEMAND', pos: [187, 570], size: 8 },
    ],
    labels: {
      pit1: 'PIT', pit2: 'PIT', pit3: 'PIT',
      queueA: 'A', queueB: 'B', queueC: 'C',
      noteM: 'M', noteA: 'A', noteR: 'R', noteK: 'K',
      bellL: 'BELL', bellC: 'BELL', bellR: 'BELL',
      stepsRamp: 'STEPS', clearingOrbit: 'CLEARING', strongroom: 'STRONGROOM',
      inL: 'IN', inR: 'IN', outL: 'OUT', outR: 'OUT',
      slingL: 'BID', slingR: 'ASK',
    },
  };
}

// ═════════════════════════ KEDGE ═════════════════════════
// The salt quays. The three cranes stand in one line across the middle of the field, the
// only bumpers in the game that are not a triangle: a ball that gets among them is handed
// along the line and thrown up at the hopper, a hooded hole high on the right that is open
// only from below. The gangway does not come down to an inlane: it loads the hatches.

function kedge() {
  const sh = shell(98, 8);
  const lo = lower({
    divX: 31, divTop: 596, elbow: 662, pivot: [120, 700],
    sling: [[71, 572], [71, 650], [108, 666]], slingKick: 330,
    flipLen: 56, rest: 0.5, active: 0.62, guard: [15, 15], guardY: 554,
  });
  const gangway = sideLane(256, 340, 436, 34, 68);                  // left: the gangway ramp
  const roads = mirrorLane(sideLane(232, 330, 432, 34, 68));        // right: the roadstead orbit
  const hatches = topLanes(['hatchL', 'hatchC', 'hatchR'], [100, 140, 180, 220], 70, 116, 'hatches');

  const walls = [
    ...sh.walls, ...lo.walls,
    // ceiling, then the bollard that stops a launch over the hatches
    { a: sh.arcEnd, b: [92, 8] },
    { a: [92, 8], b: [100, 70], bounce: 0.3 },
    ...poly([[100, 116], [50, 146], [L, 196]]),
    { a: [L, 196], b: gangway.outer[0] }, ...poly(gangway.outer), { a: gangway.outer[2], b: [L, 800] },
    ...poly(gangway.inner),
    // the gangway is roofed at its head: a ball goes up it, never down it
    { a: [L, 232], b: gangway.inner[0] },
    ...poly(roads.outer), ...poly(roads.inner),
    ...hatches.walls,
    // the hopper's hood: a peaked roof and two cheeks, open underneath
    ...poly([[202, 208], [202, 174], [226, 150], [250, 174], [250, 208]]),
  ];

  return {
    id: 'kedge',
    name: 'Kedge Salt Quays',
    width: 400,
    height: 800,
    gravity: 1250,
    ballRadius: R,
    walls,
    oneWays: [sh.gate],
    flippers: lo.flippers,
    bumpers: [
      { id: 'crane1', pos: [110, 262], r: 18, kick: 450 },
      { id: 'crane2', pos: [187, 262], r: 18, kick: 450 },
      { id: 'crane3', pos: [264, 262], r: 18, kick: 450 },
    ],
    slings: lo.slings,
    targets: [
      // the tally bank stands free under the first crane, leaning in
      ...bank(['tallyA', 'tallyB', 'tallyC'], [98, 356], [72, 298], 'tally'),
      // ROPE is made fast along the roadstead's wall, beside the third crane
      ...bank(['ropeR', 'ropeO', 'ropeP', 'ropeE'], [302, 296], [276, 362], 'rope', 0.06),
    ],
    rollovers: [...hatches.rollovers, ...lo.rollovers],
    shots: [
      { id: 'gangwayRamp', a: gangway.gate(416)[0], b: gangway.gate(416)[1], dir: [0, -1], exit: { pos: [196, 44], vel: [20, 0] } },
      { id: 'roadsOrbit', a: roads.gate(412)[0], b: roads.gate(412)[1], dir: [0, -1] },
    ],
    saucers: [
      { id: 'hopper', pos: [226, 188], r: 14, eject: [70, 190], holdMs: 1100 },
    ],
    reels: { fill: ['hatchL', 'hatchC', 'hatchR'], spin: ['hopper', 'gangwayRamp', 'roadsOrbit'] },
    plunger: { pos: [379, 770], maxSpeed: 2000 },
    drainY: 792,
    theme: {
      bg: ['#0c1420', '#1b3040', '#3a5560'],
      accent: '#e8d9a0',
      glow: '#fff3cf',
      motif: 'quay',
    },
    decor: [
      { text: 'KEDGE', pos: [187, 486], size: 30 },
      { text: 'THE SALT QUAYS', pos: [187, 512], size: 11 },
      { text: 'GANGWAY', pos: [25, 300], size: 9, angle: -1.5708 },
      { text: 'ROADSTEAD', pos: [mx(24), 290], size: 9, angle: 1.5708 },
      { text: 'GENERAL AVERAGE', pos: [187, 566], size: 8 },
    ],
    labels: {
      crane1: 'CRANE', crane2: 'CRANE', crane3: 'CRANE',
      tallyA: 'A', tallyB: 'B', tallyC: 'C',
      ropeR: 'R', ropeO: 'O', ropeP: 'P', ropeE: 'E',
      hatchL: 'HATCH', hatchC: 'HATCH', hatchR: 'HATCH',
      gangwayRamp: 'GANGWAY', roadsOrbit: 'ROADS', hopper: 'HOPPER',
      inL: 'IN', inR: 'IN', outL: 'OUT', outR: 'OUT',
      slingL: 'CASK', slingR: 'CASK',
    },
  };
}

// ═════════════════════════ FISHDOCK ═════════════════════════
// Vessery again, by day, from the dock side. The roll is called under the launch on the
// right; the opened drum lies where chapter one kept the magistrate's chamber, and it is the
// widest hole in the game with no roof and no rail: anything that crosses it is counted. The
// three pawls stand in a falling line that points at it, like a ratchet.

function fishdock() {
  const sh = shell(90, 8);
  const lo = lower({
    divX: 30, divTop: 598, elbow: 664, pivot: [121, 701],
    sling: [[72, 576], [72, 652], [108, 668]], slingKick: 340,
    flipLen: 56, rest: 0.5, active: 0.62, guard: [11, 13], guardY: 556,
  });
  const hall = sideLane(290, 366, 456, 34, 70);                     // left: the hall steps
  const quay = mirrorLane(sideLane(250, 344, 440, 33, 70));         // right: the quay orbit
  const roll = topLanes(['rollL', 'rollC', 'rollR'], [196, 240, 284, 328], 78, 120, 'roll');

  const walls = [
    ...sh.walls, ...lo.walls,
    // ceiling and the round top-left corner
    { a: sh.arcEnd, b: [100, 8] },
    ...poly(arc(100, 100, 92, -90, -180, 10)),
    { a: [L, 100], b: hall.outer[0] }, ...poly(hall.outer), { a: hall.outer[2], b: [L, 800] },
    ...poly(hall.inner),
    { a: [L, 266], b: hall.inner[0] },
    ...poly(quay.outer), ...poly(quay.inner),
    // the crier's post: stops a launch over the roll
    { a: [186, 8], b: [196, 78], bounce: 0.3 },
    ...roll.walls,
  ];

  return {
    id: 'fishdock',
    name: 'Vessery Fish Dock',
    width: 400,
    height: 800,
    gravity: 1180,
    ballRadius: R,
    walls,
    oneWays: [sh.gate],
    flippers: lo.flippers,
    bumpers: [
      { id: 'pawl1', pos: [250, 172], r: 17, kick: 450 },
      { id: 'pawl2', pos: [202, 232], r: 17, kick: 450 },
      { id: 'pawl3', pos: [154, 292], r: 17, kick: 450 },
    ],
    slings: lo.slings,
    targets: [
      ...bank(['stallA', 'stallB', 'stallC'], [112, 344], [92, 282], 'stall'),
      ...bank(['nameN', 'nameA', 'nameM', 'nameE'], [288, 222], [308, 300], 'name', 0.06),
    ],
    rollovers: [...roll.rollovers, ...lo.rollovers],
    shots: [
      { id: 'hallRamp', a: hall.gate(436)[0], b: hall.gate(436)[1], dir: [0, -1], exit: { pos: lo.inR, vel: [0, 130] } },
      { id: 'quayOrbit', a: quay.gate(420)[0], b: quay.gate(420)[1], dir: [0, -1] },
    ],
    saucers: [
      { id: 'drum', pos: [84, 212], r: 17, eject: [230, 40], holdMs: 1300 },
    ],
    reels: { fill: ['rollL', 'rollC', 'rollR'], spin: ['drum', 'hallRamp', 'quayOrbit'] },
    plunger: { pos: [379, 770], maxSpeed: 1950 },
    drainY: 792,
    theme: {
      bg: ['#1c3350', '#3a6a8a', '#8fb8c0'],
      accent: '#ffe08a',
      glow: '#fffbe6',
      motif: 'daylight',
    },
    decor: [
      { text: 'VESSERY', pos: [187, 492], size: 28 },
      { text: 'THE DOCK QUARTER, BY DAY', pos: [187, 518], size: 9 },
      { text: 'HALL STEPS', pos: [25, 328], size: 9, angle: -1.5708 },
      { text: 'QUAY', pos: [mx(24), 300], size: 10, angle: 1.5708 },
      { text: 'COUNTED IN THE OPEN', pos: [187, 568], size: 8 },
    ],
    labels: {
      pawl1: 'PAWL', pawl2: 'PAWL', pawl3: 'PAWL',
      stallA: 'A', stallB: 'B', stallC: 'C',
      nameN: 'N', nameA: 'A', nameM: 'M', nameE: 'E',
      rollL: 'ROLL', rollC: 'ROLL', rollR: 'ROLL',
      hallRamp: 'HALL STEPS', quayOrbit: 'QUAY', drum: 'DRUM',
      inL: 'IN', inR: 'IN', outL: 'OUT', outR: 'OUT',
      slingL: 'CHALK', slingR: 'CHALK',
    },
  };
}

// ═════════════════════════ CRESSET ═════════════════════════
// The capital. The Founders' Lamp stands at the head of the table under a brass cap: what
// falls through the centre seat lands on the cap and is turned aside, so the lamp is reached
// from underneath, off the rings, or by walking the mole, which is the only ramp in the game
// that ends in a hole. The Full Bench sits in a curve on the left, each judge a target of
// his own.

function cresset() {
  const sh = shell(94, 8);
  const lo = lower({
    divX: 30, divTop: 600, elbow: 664, pivot: [120, 702],
    sling: [[70, 570], [70, 652], [107, 668]], slingKick: 390,
    flipLen: 57, rest: 0.52, active: 0.63, guard: [15, 15], guardY: 556,
  });
  const mole = sideLane(250, 344, 442, 34, 70);                     // left: the mole
  const assembly = mirrorLane(sideLane(214, 330, 430, 34, 70));     // right: the Assembly orbit
  const seats = topLanes(['seatL', 'seatC', 'seatR'], [136, 178, 220, 262], 66, 108, 'seats');

  const walls = [
    ...sh.walls, ...lo.walls,
    { a: sh.arcEnd, b: [126, 8] },
    { a: [126, 8], b: [136, 66], bounce: 0.3 },
    ...poly([[136, 108], [60, 144], [L, 196]]),
    { a: [L, 196], b: mole.outer[0] }, ...poly(mole.outer), { a: mole.outer[2], b: [L, 800] },
    ...poly(mole.inner),
    { a: [L, 226], b: mole.inner[0] },
    ...poly(assembly.outer), ...poly(assembly.inner),
    ...seats.walls,
    // the brass cap over the lamp
    ...poly([[176, 144], [199, 128], [222, 144]]),
  ];

  return {
    id: 'cresset',
    name: 'Cresset',
    width: 400,
    height: 800,
    gravity: 1380,
    ballRadius: R,
    walls,
    oneWays: [sh.gate],
    flippers: lo.flippers,
    bumpers: [
      { id: 'ring1', pos: [138, 216], r: 18, kick: 510 },
      { id: 'ring2', pos: [260, 216], r: 18, kick: 510 },
      { id: 'ring3', pos: [207, 270], r: 18, kick: 510 },
    ],
    slings: lo.slings,
    targets: [
      // the Full Bench: three seats on a curve
      { id: 'benchA', a: [112, 334], b: [98, 304], group: 'bench' },
      { id: 'benchB', a: [94, 294], b: [86, 262], group: 'bench' },
      { id: 'benchC', a: [84, 252], b: [86, 220], group: 'bench' },
      ...bank(['calmC', 'calmA', 'calmL', 'calmM'], [300, 250], [276, 320], 'calm', 0.06),
    ],
    rollovers: [...seats.rollovers, ...lo.rollovers],
    shots: [
      // the mole ends at the lamp
      { id: 'moleRamp', a: mole.gate(422)[0], b: mole.gate(422)[1], dir: [0, -1], exit: { pos: [199, 152], vel: [0, 60] } },
      { id: 'assemblyOrbit', a: assembly.gate(410)[0], b: assembly.gate(410)[1], dir: [0, -1] },
    ],
    saucers: [
      { id: 'lamp', pos: [199, 162], r: 14, eject: [-110, 120], holdMs: 1500 },
    ],
    reels: { fill: ['seatL', 'seatC', 'seatR'], spin: ['lamp', 'moleRamp', 'assemblyOrbit'] },
    plunger: { pos: [379, 770], maxSpeed: 2100 },
    drainY: 792,
    theme: {
      bg: ['#161230', '#2c2458', '#6a5a8a'],
      accent: '#fff0b8',
      glow: '#ffffff',
      motif: 'founders',
    },
    decor: [
      { text: 'CRESSET', pos: [187, 490], size: 30 },
      { text: 'THREE DAYS TO RENEWAL', pos: [187, 516], size: 10 },
      { text: 'THE MOLE', pos: [25, 296], size: 9, angle: -1.5708 },
      { text: 'ASSEMBLY', pos: [mx(24), 272], size: 9, angle: 1.5708 },
      { text: 'PAYABLE IN CALM', pos: [187, 568], size: 9 },
    ],
    labels: {
      ring1: 'RING', ring2: 'RING', ring3: 'RING',
      benchA: 'A', benchB: 'B', benchC: 'C',
      calmC: 'C', calmA: 'A', calmL: 'L', calmM: 'M',
      seatL: 'SEAT', seatC: 'SEAT', seatR: 'SEAT',
      moleRamp: 'MOLE', assemblyOrbit: 'ASSEMBLY', lamp: 'LAMP',
      inL: 'IN', inR: 'IN', outL: 'OUT', outR: 'OUT',
      slingL: 'AYE', slingR: 'NO',
    },
  };
}

export const tables = {
  vessery: vessery(), saltmere: saltmere(), halcyon: halcyon(), brand: brand(), tallis: tallis(),
  kedge: kedge(), fishdock: fishdock(), cresset: cresset(),
};
