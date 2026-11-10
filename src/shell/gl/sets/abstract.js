// SETS: line and black. The two backdrops that are not places.
//
//   line    the Proctor's sealed channel (ch1.epi.12-16, and every later report): nothing is lit but the dial.
//           A brass bezel stands in a teal dark, rings of carrier going out from it, and round its foot a ring
//           of meter bars that rise with the voice. Whoever is on the line stands at marks.b, inside the bezel
//           as the 'close' camera sees it.
//   black   nothing at all (ch1.epi.17: the last line of the call, over black).
//
//   import { line, black } from './sets/abstract.js';
//   const set = line.build(GL, { light: 'night', low: false });
//
// Both have the whole lantern-stalls shape (scene, env, actors, foreground, cameras, frame, view, marks, lamps,
// setPower, update), so the director needs no special case. Added on `line`:
//   setLevel(0..1)        the voice level: the meter bars and the carrier rings follow it. Until it is first called
//                         the meter idles on a slow murmur of its own. setLevel(null) gives it back
//   marks.focus           the centre of the bezel

import * as GL0 from '../index.js';
import {
  m4, quat, rng, DEG, rgb,
  merge, tint, place, box, cylinder, lathe, torus, sphere, setGlow, setOutline,
  node, group, makeEnv, createScene, mergeStatic, makeInstances, createSprites,
} from '../index.js';
import { PAL, kitMaterials, pickLight, setRig } from './kit.js';

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };

const CAMERAS = {
  wide: { target: [0, 1.25, 0.3], dist: 9.2, yaw: 3, pitch: 5, fov: 44, aspect: 0.46, shadowCenter: [0, 0, 0.4], shadowRadius: 4 },
  two: { target: [0, 1.0, 0.6], dist: 6.4, yaw: -14, pitch: 5, fov: 31, aspect: 0.46, shadowCenter: [0, 0, 0.4], shadowRadius: 3.6 },
  close: { target: [0.02, 1.02, 0.6], dist: 6.6, yaw: 6, pitch: 3, fov: 31, aspect: 0.46, shadowCenter: [0, 0, 0.5], shadowRadius: 2.6 },
  low: { target: [0, 1.3, 0.4], dist: 6.4, yaw: -8, pitch: -9, fov: 50, aspect: 0.46, shadowCenter: [0, 0, 0.4], shadowRadius: 4 },
  stage: { target: [0, 1.02, 0.5], dist: 9.4, yaw: -13, pitch: 7, fov: 24, aspect: 1.95, shadowCenter: [0, 0, 0.4], shadowRadius: 6, outline: 0.7 },
  landscape: { target: [0, 1.2, 0.3], dist: 8.5, yaw: 4, pitch: 5, fov: 40, aspect: 1.6, shadowCenter: [0, 0, 0.4], shadowRadius: 6 },
};
const MARKS = {
  a: { pos: [-0.8, 0, 0.55], face: 14 }, b: { pos: [0.02, 0, 0.8], face: 0 }, c: { pos: [0.82, 0, 0.55], face: -14 },
  two: [{ pos: [-0.42, 0, 0.62], face: 24 }, { pos: [0.42, 0, 0.62], face: -24 }],
  party: [{ pos: [-1.05, 0, 0.75], face: 78 }, { pos: [-1.85, 0, 1.15], face: 72 }, { pos: [-2.5, 0, 0.5], face: 80 }],
  opposition: [{ pos: [1.05, 0, 0.75], face: -78 }, { pos: [1.85, 0, 1.15], face: -72 }, { pos: [2.55, 0, 0.5], face: -80 }],
};

const dark = (c, over = {}) => ({
  key: { dir: norm([-0.45, 0.6, 0.66]), color: '#c4f6ea' },
  shadow: { tint: c.shadow, lift: 0.06, saturate: 1.2 },
  ambient: { sky: c.amb, ground: c.void, amount: 0.22 },
  rim: { color: c.rim, amount: 1.0, edge: 0.72 },
  fog: { color: c.void, density: 0.035, start: 5, max: 0.96 },
  sky: { zenith: c.void, mid: c.void, midAt: 0.5, horizon: c.haze, below: c.void, glow: c.haze, glowAmount: 0, sunDir: [0, 1, 0], moon: 0, stars: 0, sun: { size: 0.01, color: c.void, halo: c.void, haloAmount: 0 } },
  water: null, ...over,
});

const LINE_LIGHTS = { night: { preset: 'night', env: dark({ void: '#03101a', haze: '#06222c', amb: '#0c5a60', shadow: '#0c4652', rim: '#8ff5dc' }) } };
const BLACK_LIGHTS = { night: { preset: 'night', env: dark({ void: '#000000', haze: '#000000', amb: '#30344a', shadow: '#2a2e48', rim: '#8c93a8' }, { key: { dir: norm([-0.45, 0.6, 0.66]), color: '#aab2cc' } }) } };

function shell(id, light, env, scene, extra) {
  const actors = group('actors'), foreground = group('foreground'); scene.root.add(foreground, actors);
  const rig = setRig(id, CAMERAS, env);
  return { id, light, scene, env, actors, foreground, cameras: CAMERAS, frame: rig.frame, view: rig.view, marks: { ...MARKS }, lamps: [], setPower() {}, cue: () => false, task: () => null, update() {}, ...extra };
}

// ------------------------------------------------------------------------------------ line

function buildLine(engine = GL0, { light, low = false } = {}) {
  const picked = pickLight('line', LINE_LIGHTS, light), L = picked.L; light = picked.name;
  const M = kitMaterials(), TEAL = '#5fe0c8', DIM = '#1c8a80', C = [0.02, 0.88, 0.5], R0 = 0.46, r = rng(606);
  const scene = createScene(makeEnv(L.preset, L.env)), env = scene.env;
  const st = group('line-static');
  // the floor of the dark: a round plate with two inlaid rings, so feet have something under them
  st.add(node('plate', merge(tint(lathe([[0, -0.2], [1.6, -0.2], [1.6, -0.03], [1.52, 0], [0, 0]], 28, { crease: 50 }), '#0e4a52'), setGlow(tint(place(torus(1.18, 0.012, 40, 4), 0, 0.004, 0), TEAL), 0.7), setGlow(tint(place(torus(0.6, 0.01, 30, 4), 0, 0.004, 0), DIM), 0.6)), M.ground, { pos: [C[0], 0, 0.8] }));
  // the bezel: brass, on a stem, with a tick ring just outside it
  const bezel = merge(
    tint(place(torus(R0, 0.045, 40, 8), 0, 0, 0, 90, 0, 0), PAL.gold), tint(place(torus(R0 + 0.06, 0.014, 40, 5), 0, 0, 0, 90, 0, 0), '#b8742a'),
    tint(place(cylinder(0.05, 0.07, C[1] - R0, 8), 0, -C[1], 0), PAL.gold), tint(place(lathe([[0, 0], [0.3, 0], [0.3, 0.04], [0.09, 0.1], [0, 0.1]], 12, { crease: 50 }), 0, -C[1], 0), PAL.gold));
  for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2, r1 = R0 + (i % 3 ? 0.12 : 0.16); st.add(node('tick', setGlow(tint(place(box(0.012, i % 3 ? 0.04 : 0.08, 0.012), Math.cos(a) * r1, Math.sin(a) * r1, 0, 0, 0, a / DEG - 90), TEAL), 0.85), M.flat, { pos: C })); }
  st.add(node('bezel', bezel, M.prop, { pos: C }));
  st.add(node('dial', tint(place(cylinder(R0 - 0.02, R0 - 0.02, 0.03, 36), 0, 0, -0.06, 90, 0, 0), '#0c4a50'), M.ground, { pos: C }));
  st.traverse((n) => { n.castShadow = false; });
  scene.root.add(mergeStatic(st, 'line-static'));

  // carrier rings: three thin glowing hoops that swell outward from the bezel and fade into the dark
  const rings = [0, 1, 2].map((i) => { const n = node('carrier' + i, setOutline(setGlow(tint(place(torus(1, 0.012, 48, 4), 0, 0, 0, 90, 0, 0), TEAL), 1), 0), M.speck, { pos: [C[0], C[1], C[2] - 0.12 - i * 0.02] }); n.castShadow = false; scene.root.add(n); return n; });
  // the meter: a ring of bars round the plate, each a unit box scaled in Y
  const BARS = low ? 28 : 44, bars = node('meter', setOutline(setGlow(tint(place(box(1, 1, 1), 0, 0.5, 0), '#ffffff'), 0.9), 0), M.speck);
  bars.castShadow = false; bars.instances = makeInstances(BARS); bars.instances.count = BARS; scene.root.add(bars);
  const seeds = Array.from({ length: BARS }, () => r() * 6.283);

  const sprites = scene.sprites = createSprites(48);
  const halo = sprites.add({ kind: 'glow', pos: [C[0], C[1], C[2] - 0.2], size: 2.6, color: '#1fa89a', alpha: 0.28 });
  const lamps = [{ name: 'dial', pos: [C[0], C[1] + 0.2, C[2] + 1.6], color: '#7ff0dc', radius: 4.5, base: 1 }];
  env.points = lamps.map((l) => ({ pos: l.pos, color: rgb(l.color), radius: l.radius, intensity: l.base }));

  let level = null, lv = 0.2, power = 1;
  const Q = quat.create(), P = [0, 0, 0], S3 = [1, 1, 1], Mx = m4.create(), teal = rgb(TEAL), dim = rgb(DIM);
  function update(time, dt = 0) {
    const want = level == null ? 0.16 + 0.12 * Math.sin(time * 1.7) * Math.sin(time * 0.6) : level;
    lv += (want - lv) * Math.min(1, dt * 12 + (dt === 0 ? 1 : 0));
    for (let i = 0; i < BARS; i++) {
      const a = (i / BARS) * Math.PI * 2, h = 0.03 + (0.06 + lv) * 0.5 * (0.3 + 0.7 * Math.abs(Math.sin(i * 0.9 + time * 8 + seeds[i])));
      P[0] = C[0] + Math.sin(a) * 1.36; P[1] = 0; P[2] = 0.8 + Math.cos(a) * 1.36;
      quat.fromEuler(Q, 0, a, 0); S3[0] = 0.07; S3[1] = h; S3[2] = 0.035;
      m4.fromTRS(Mx, P, Q, S3); const d = bars.instances.data, o = i * 20; d.set(Mx, o);
      const k = Math.min(1, h / 0.3); d[o + 16] = dim[0] + (teal[0] - dim[0]) * k; d[o + 17] = dim[1] + (teal[1] - dim[1]) * k; d[o + 18] = dim[2] + (teal[2] - dim[2]) * k;
    }
    bars.instances.dirty = true;
    for (let i = 0; i < 3; i++) { // each hoop grows from the bezel to three times its size, dimming as it goes
      const u = ((time * 0.22 + i / 3) % 1 + 1) % 1, s = R0 + 0.1 + u * 1.5, a = (1 - u) * (0.35 + 0.65 * Math.min(1, lv * 2.5));
      rings[i].setScale(s, s, 1); rings[i].tint[0] = rings[i].tint[1] = rings[i].tint[2] = a;
    }
    halo.alpha = (0.2 + 0.25 * lv) * (0.6 + 0.4 * power);
    env.points[0].intensity = lamps[0].base * (0.8 + 0.5 * lv);
  }
  const set = shell('line', light, env, scene, { low, lamps, update, setPower(p) { power = Math.max(0, Math.min(1.5, p)); }, setLevel(v) { level = v == null ? null : Math.max(0, Math.min(1, v)); } });
  set.marks.focus = C;
  update(0, 0);
  return set;
}

// ------------------------------------------------------------------------------------ black

function buildBlack(engine = GL0, { light } = {}) {
  const picked = pickLight('black', BLACK_LIGHTS, light), L = picked.L;
  const scene = createScene(makeEnv(L.preset, L.env));
  return shell('black', picked.name, scene.env, scene, { low: false });
}

export const line = { id: 'line', lights: Object.keys(LINE_LIGHTS), cameras: Object.keys(CAMERAS), build: buildLine };
export const black = { id: 'black', lights: Object.keys(BLACK_LIGHTS), cameras: Object.keys(CAMERAS), build: buildBlack };
export default { line, black };
