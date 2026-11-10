// The cast, drawn: looks, faces, bodies, the crowd, the framed bust the cabinet uses.
// Part of the cinematic renderer: see ../cinema.js. Everything here paints into whatever context it is handed.
//
//   drawFigure(ctx, member, o)          one of the cast at the origin (neck base), o: { emote, talk, focus, light, facing, gaze, t, part?, still?, ink? }
//   drawPortrait(ctx, member, x, y, size, emote, talk, t)
//   drawCrowdFigures(ctx, light, t, speaking, level)
//   lookOf(member)                      the resolved look (sizes, colours) of a cast member
//   spriteBounds(k, part)               the box, in figure units about the origin, that drawFigure may paint in for part 'body' or 'head'.
//                                       The engine cuts its sprites of people standing still to this box: paint outside it and it is clipped.
//
// The look is cel: every form is one flat base colour, one hard-edged shadow tone and at most one hard highlight,
// inside an indigo ink line, with a hard bright rim on the side the scene's key light comes from. No gradients.
//
// `light` may be a style.js Light ({ col, angle, dx, dy, shadowTint, rim, amb, key, .. }) or the older
// { amb, rim, key } a backdrop declares; the older form is given a direction from `key` (upper left or upper
// right). With no light at all the figure is lit by LIGHTS.lantern.
import { TAU, clamp, lerp, mod, rnd, hashStr, rgb, rr, crowdRow } from './kit.js';
import { INK, INK_IN, PALETTE, LIGHTS, light as makeLight, rgbOf, blend, shade, tint, alpha, shadowOf, glint, taperPath } from '../style.js';

// ───────────────────────── the cast, drawn ─────────────────────────
const BUILDS = {
  slim: { sw: 116, hw: 53, neck: 21, s: 1 },
  broad: { sw: 156, hw: 59, neck: 28, s: 1.03 },
  small: { sw: 100, hw: 51, neck: 19, s: 0.9 },
};
const AGES = {
  child: { jaw: 0.66, lines: 0, eyeH: 1.1, hs: 1.12 },
  young: { jaw: 0.6, lines: 0, eyeH: 1, hs: 1.22 },
  mid: { jaw: 0.66, lines: 1, eyeH: 0.88, hs: 1.2 },
  old: { jaw: 0.7, lines: 2, eyeH: 0.78, hs: 1.2 },
};
// hairStyle is free-form in the contract; these are the shapes this renderer knows, matched by keyword.
const HAIR_STYLES = [
  ['bald', /bald|shaved|shaven/],
  ['receding', /reced|thin|tonsure|balding/],
  ['scarf', /scarf|kerchief|wrap|shawl|veil|hood/],
  ['cap', /\bcap\b|\bhat\b|beanie/],
  ['bun', /bun|knot|chignon|pinned|coil|updo|\bup\b/],
  ['braid', /braid|plait/],
  ['tail', /tail|queue|tied|pony/],
  ['curls', /curl|wild|tousle|mess|unruly|shag|mop/],
  ['bob', /bob|chin/],
  ['long', /long|loose|shoulder|flow/],
  ['swept', /swept|slick|comb|part|wave|wavy|neat|silver|back/],
  ['crop', /short|crop|close|cut|buzz|fringe|trim|plain/],
];
// One face per feeling. Brows: bi/bo lift (-) or press (+) the inner/outer end, by moves the whole brow, arch bows it.
// Eyes: open scales the upper lid, ti/to its height at the inner/outer end, low the lower lid (negative: pushed up,
// the eye a crescent), yi/yo drop the corners, iris scales the iris. Mouth: curve up (+) or down (-), mo how far open,
// mw how wide; teeth shows them, clench sets them together, round makes an O.
const EMOTES = {
  neutral: { bi: 0, bo: 0, by: 0, arch: 1, open: 1, ti: 1, to: 1, low: 1, yi: 0, yo: 0, iris: 1, curve: 0.14, mo: 0, mw: 1, tilt: 0, blush: 0 },
  smile: { bi: -3, bo: -4, by: -5, arch: 1.8, open: 0.98, ti: 1, to: 1, low: -0.5, yi: 0, yo: -1, iris: 1, curve: 1, mo: 0.3, mw: 1.34, tilt: 0.03, blush: 0.7, teeth: 1 },
  grim: { bi: 6, bo: 2, by: 6, arch: 0.1, open: 0.58, ti: 0.85, to: 0.9, low: 0.62, yi: 0, yo: 0, iris: 1, curve: -0.55, mo: 0, mw: 1.1, tilt: -0.012, blush: 0 },
  shock: { bi: -8, bo: -8, by: -10, arch: 1.5, open: 1.3, ti: 1, to: 1, low: 1.45, yi: 0, yo: 0, iris: 0.6, curve: -0.08, mo: 0.62, mw: 0.56, tilt: 0, blush: 0, round: 1 },
  tears: { bi: -13, bo: 7, by: -1, arch: 0.5, open: 0.84, ti: 1.1, to: 0.6, low: 0.9, yi: -1, yo: 3.5, iris: 1.06, curve: -0.66, mo: 0.14, mw: 0.9, tilt: 0.05, blush: 0.6, tears: 1 },
  anger: { bi: 13, bo: -8, by: 6, arch: 0.05, open: 0.92, ti: 0.28, to: 1.15, low: 0.8, yi: 3, yo: -3, iris: 0.84, curve: -0.72, mo: 0.34, mw: 1.14, tilt: -0.02, blush: 0.4, teeth: 1, clench: 1 },
  soft: { bi: -5, bo: 3, by: -1, arch: 0.9, open: 0.7, ti: 0.95, to: 0.88, low: 0.45, yi: 0, yo: 1, iris: 1, curve: 0.62, mo: 0, mw: 0.88, tilt: 0.045, blush: 0.4 },
};
function emoteOf(name) {
  if (name === undefined || name === null || name === '') return EMOTES.neutral;
  const e = EMOTES[name];
  if (!e) throw new Error(`cinema: unknown emote '${name}' (known: ${Object.keys(EMOTES).join(', ')})`);
  return e;
}

const IN = 'in';        // in a hair shape: where the outer contour ends and the hairline begins
const CY = -108;        // the middle of the skull, in head units above the base of the neck
const PIVOT = -34;      // the head is drawn larger than life about this point (just under the chin)
const lum = (c) => { const v = rgbOf(c); return 0.3 * v[0] + 0.59 * v[1] + 0.11 * v[2]; };

const CHILD_RE = /\bchild\b|\bboy\b|\bgirl\b|\b(nine|ten|eleven|twelve|thirteen)\b|\b(9|1[0-3])\b/;
const _looks = new WeakMap();
export function lookOf(member) {
  let k = _looks.get(member);
  if (k) return k;
  const L = member.look;
  if (!L) throw new Error(`cinema: cast member '${member.id}' has no look`);
  let b = BUILDS[L.build];
  if (!b) throw new Error(`cinema: cast member '${member.id}' has unknown look.build '${L.build}' (slim, broad, small)`);
  // The contract has three ages. A child is told from the descriptor (or age:'child'), and is not a small adult:
  // a head nearly as large on narrow shoulders, a short chin, eyes set low and wide, and a place lower on the stage.
  const markText = String(L.mark || '').toLowerCase();
  const child = L.age === 'child' || CHILD_RE.test(markText) || CHILD_RE.test(String(member.role || '').toLowerCase());
  const a = child ? AGES.child : AGES[L.age];
  if (!a) throw new Error(`cinema: cast member '${member.id}' has unknown look.age '${L.age}' (young, mid, old)`);
  if (child) b = { sw: /too (large|big)|oversize|outgrown|hand-me-down/.test(markText) ? 90 : 80, hw: 50, neck: 15, s: 0.8 };
  for (const f of ['skin', 'hair', 'coat', 'trim']) {
    if (!L[f]) throw new Error(`cinema: cast member '${member.id}' is missing look.${f}`);
    rgb(L[f]);
  }
  const hs = String(L.hairStyle === undefined ? '' : L.hairStyle).toLowerCase();
  const hit = HAIR_STYLES.find(([, re]) => re.test(hs));
  if (!hit) throw new Error(`cinema: cast member '${member.id}' has look.hairStyle '${L.hairStyle}' that matches no drawn style (${HAIR_STYLES.map((h) => h[0]).join(', ')})`);
  const mark = markText;
  const has = (re) => re.test(mark);
  const seed = hashStr(String(member.id));
  // what is worn, decided once
  const garb = has(/robe|gown|stole|magistrat|judge/) ? 'robe'
    : has(/uniform|cadet|epaulet|tunic|officer|high[a-z ]{0,14}collar|buttoned to the throat/) ? 'uniform'
      : has(/waistcoat|\bvest\b/) ? 'waistcoat' : 'coat';
  // the eyes take the member's own colour unless the look names one: thirteen people, thirteen irises
  let eyes = L.eyes;
  if (!eyes) { const c = member.color && /^#/.test(member.color) ? member.color : '#6a5a4a'; eyes = lum(c) > 150 ? shade(c, 0.22) : c; }
  k = {
    ...b, ...a, style: hit[0], mark, child, garb,
    chin: child ? 63 : 70, eyeDy: child ? 5 : 0, drop: child ? 78 : 0,
    skin: L.skin, hair: L.hair, coat: L.coat, trim: L.trim, eyes,
    seed,
    eyeGap: (child ? 24.5 : 25.5) + rnd(seed * 91) * 2.5,
    eyeW: (child ? 1.1 : L.age === 'young' ? 1.0 : 0.94) + rnd(seed * 53) * 0.1,
    noseL: (child ? 0.6 : 0.85) + rnd(seed * 37) * (child ? 0.15 : 0.4),
    browW: (child ? 0.62 : 0.8) + rnd(seed * 29) * (child ? 0.2 : 0.5) + (L.build === 'broad' ? 0.35 : 0),
    mouthW: (child ? 0.8 : 0.94) + rnd(seed * 71) * (child ? 0.1 : 0.2),
    browUp: /(one|an|left|right) (eye)?brow (always |forever |permanently )?(raised|up|cocked|lifted)|cocked (eye)?brow/.test(mark) ? 9 : 0,
    has,
    lid: /heavy-lidded|hooded eyes|half-closed/.test(mark) ? 0.72 : 1,
    smileBias: /half smil|always smil|faint smile/.test(mark) ? 0.34 : 0,
    averted: /never (quite )?meets the eye|averted|looks away/.test(mark),
    sweptBack: /swept back|slicked back|combed back/.test(mark),
    stoop: has(/stoop|hunched|bent/) ? 1 : 0,
    hooded: has(/shadow of a hood/),
    spiky: /cropped|crop\b|buzz/.test(hs),
    tight: has(/pinned flat|scraped back|severe/),
    braidBack: has(/braid down the back|down (the|her|his) back/),
    weathered: has(/weather|wind-?burn|sea-?worn|leathery/),
    lightHair: lum(L.hair) > 150,
    geo: [null, null],
  };
  _looks.set(member, k);
  return k;
}

// ───────────────────────── light and colour ─────────────────────────
// A figure light: the scene's Light, and the direction this file shades with. A lamp straight overhead would
// light both cheeks alike and leave the face without a shadow side, so the direction always leans to `key`.
const _flights = new WeakMap();
function figLight(l) {
  if (!l) l = LIGHTS.lantern;
  let F = _flights.get(l);
  if (F) return F;
  let L = l;
  if (typeof l.dx !== 'number' || typeof l.dy !== 'number' || !l.shadowTint || !l.id) {
    const key = l.key >= 0 ? 1 : -1;
    const col = l.rim || PALETTE.lantern;
    L = makeLight(col, key > 0 ? -Math.PI * 0.2 : -Math.PI * 0.8, l.amb ? { amb: l.amb } : {});
  }
  const key = L.key >= 0 ? 1 : -1;
  let dx = L.dx, dy = L.dy;
  if (Math.abs(dx) < 0.55) { dx = key * 0.55; const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n; }
  F = { L, dx, dy, key };
  _flights.set(l, F);
  return F;
}

// every colour a member is painted with under one light at one focus, worked out once
const _pal = new Map();
function palOf(member, k, F, focus) {
  const L = F.L, fq = Math.round(clamp(focus) * 5) / 5;
  const id = `${member.id}|${L.id}|${fq}`;
  let C = _pal.get(id);
  if (C) return C;
  // whoever the scene is not about stands a little further into its air
  const a = 0.06 + 0.2 * (1 - fq), d = 0.16 * (1 - fq);
  const tn = (c) => shade(blend(c, L.amb, a), d);
  const lift = (c) => (lum(c) < 46 ? blend(c, '#56609c', 0.3) : c);   // black cloth and black hair are drawn as deep slate, so a shadow and a line can show on them
  const skin = tn(k.skin);
  const skinSh = blend(blend(skin, '#5a1e3c', 0.4), L.shadowTint, 0.3 * L.depth);
  const hair = tn(lift(k.hair)), coat = tn(lift(k.coat)), trim = tn(k.trim);
  const shirtBase = tn(blend(k.coat, '#f1e8d6', 0.84));
  const white = tn('#fff6e0');
  const rimC = blend(L.rim, L.amb, 0.34 * (1 - fq));
  C = {
    fq, tn,
    skin, skinSh, skinLine: blend(skinSh, INK, 0.5), skinHi: blend(skin, L.rim, 0.45),
    hair, hairSh: shadowOf(hair, L), hairHi: blend(hair, L.rim, k.lightHair ? 0.7 : 0.42),
    coat, coatSh: shadowOf(coat, L), coatHi: blend(coat, L.rim, 0.3),
    trim, trimSh: shadowOf(trim, L), trimHi: blend(trim, L.rim, 0.5),
    shirt: shirtBase, shirtSh: shadowOf(shirtBase, L),
    white, whiteSh: blend(white, L.shadowTint, 0.34), whiteFar: blend(white, skinSh, 0.3),
    iris: tn(k.eyes), irisSh: tn(shade(k.eyes, 0.55)),
    brow: tn(k.lightHair ? blend(k.hair, INK, 0.42) : blend(lift(k.hair), INK, 0.55)),
    mouth: tn(blend(INK, '#7a1026', 0.55)), lipLine: tn(blend(INK, '#6a1a2a', 0.45)), teeth: white, tongue: tn('#e0566a'),
    blush: alpha(tn('#f0604a'), 0.42), flush: alpha(tn('#e02a2a'), 0.5),
    tear: tn('#d4f0ff'),
    brass: tn(PALETTE.brass), brassSh: shadowOf(tn(PALETTE.brass), L),
    shade: alpha(blend(L.shadowTint, INK, 0.55), 0.5 * L.depth + 0.14),   // the one translucent shadow laid over whatever is worn
    rim: rimC, rimK: 0.55 + 0.45 * fq,
    glint: fq >= 0.6,
  };
  if (_pal.size > 600) _pal.clear();
  _pal.set(id, C);
  return C;
}

// ───────────────────────── drawing helpers (local to this file) ─────────────────────────
/** a path as data: [[x, y], ...] with [cx, cy, x, y] for a curve; traced closed, without beginPath */
function trace(ctx, p) {
  ctx.moveTo(p[0][0], p[0][1]);
  for (let i = 1; i < p.length; i++) { const q = p[i]; if (q.length === 2) ctx.lineTo(q[0], q[1]); else ctx.quadraticCurveTo(q[0], q[1], q[2], q[3]); }
  ctx.closePath();
}
function outside(ctx, path, ox, oy) {
  ctx.beginPath();
  ctx.rect(-4000, -4000, 8000, 8000);
  ctx.translate(ox, oy); path(ctx); ctx.translate(-ox, -oy);
}
/**
 * form(): style.js cel() with two things it does not have: a callback that paints inside the clip between the
 * shadow and the ink (what is worn, what the hair throws on the brow), and a light direction given as numbers.
 * Base fill, the hard shadow crescent `off` wide on the far side in `sh`, inside(), the ink line kept inside the
 * silhouette, then the rim laid over it on the lit side so the line breaks where the light lands.
 */
function form(ctx, path, base, sh, F, off, inkW, rimW, rimCol, inside, rimPath) {
  ctx.beginPath(); path(ctx);
  ctx.fillStyle = base; ctx.fill();
  ctx.save();
  ctx.clip();
  if (off > 0) { outside(ctx, path, F.dx * off, F.dy * off); ctx.fillStyle = sh; ctx.fill('evenodd'); }
  if (inside) inside(ctx);
  if (inkW > 0) { ctx.strokeStyle = INK; ctx.lineWidth = inkW * 2; ctx.lineJoin = 'round'; ctx.beginPath(); path(ctx); ctx.stroke(); }
  if (rimW > 0) { outside(ctx, rimPath || path, -F.dx * rimW, -F.dy * rimW); ctx.fillStyle = rimCol; ctx.fill('evenodd'); }
  ctx.restore();
}
/** a small flat shape with a centred ink line: buttons, collars, lapels */
function flat(ctx, pts, fill, w) {
  ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  if (w > 0) { ctx.strokeStyle = INK; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.stroke(); }
}
function disc(ctx, x, y, r, fill, w) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = fill; ctx.fill();
  if (w > 0) { ctx.strokeStyle = INK; ctx.lineWidth = w; ctx.stroke(); }
}
function line(ctx, x0, y0, x1, y1, col, w) {
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
}
function curve(ctx, x0, y0, cx, cy, x1, y1, col, w) {
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1); ctx.stroke();
}
const _q = [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]];
/** seven points along a quadratic, in a shared scratch array: for taperPath */
function quadPts(x0, y0, cx, cy, x1, y1) {
  for (let i = 0; i < 7; i++) { const u = i / 6, v = 1 - u; _q[i][0] = v * v * x0 + 2 * v * u * cx + u * u * x1; _q[i][1] = v * v * y0 + 2 * v * u * cy + u * u * y1; }
  return _q;
}

function headPath(ctx, k) {
  const hw = k.hw, jaw = hw * k.jaw, ch = k.chin, cy = CY;
  ctx.moveTo(-hw, cy - 8);
  ctx.bezierCurveTo(-hw, cy - 84, hw, cy - 84, hw, cy - 8);
  ctx.bezierCurveTo(hw, cy + 32, jaw + 5, cy + ch - 7, 15, cy + ch);
  ctx.quadraticCurveTo(0, cy + ch + 5, -15, cy + ch);
  ctx.bezierCurveTo(-jaw - 5, cy + ch - 7, -hw, cy + 32, -hw, cy - 8);
  ctx.closePath();
}
function torsoPath(ctx, k) {
  const sw = k.sw, n = k.neck;
  ctx.moveTo(-n - 8, -16);
  ctx.quadraticCurveTo(-sw * 0.55, -6, -sw, 30);
  ctx.quadraticCurveTo(-sw - 18, 78, -sw - 12, 170);
  ctx.lineTo(-sw - 20, 560); ctx.lineTo(sw + 20, 560); ctx.lineTo(sw + 12, 170);
  ctx.quadraticCurveTo(sw + 18, 78, sw, 30);
  ctx.quadraticCurveTo(sw * 0.55, -6, n + 8, -16);
  ctx.closePath();
}

// ───────────────────────── hair: a few angular masses ─────────────────────────
// Shapes are written in head units: x in half-head-widths (mirrored by the way the head is turned), y from the
// middle of the skull. Each look's shapes are built once per facing and kept on the look.
function hairGeo(k, f) {
  const i = f > 0 ? 1 : 0;
  if (k.geo[i]) return k.geo[i];
  const hw = k.hw, cy = CY;
  const mk = (m, spec) => spec.filter((q) => q !== IN).map((q) => (q.length === 2 ? [m * q[0] * hw, cy + q[1]] : [m * q[0] * hw, cy + q[1], m * q[2] * hw, cy + q[3]]));
  // back: behind the shoulders (body part). top: behind the head but part of it (a bun). front: the mass over the
  // skull, which throws its shadow on the brow. locks: small pieces over that. cloth: a hood, not hair.
  const g = { back: [], top: [], front: null, outer: null, locks: [], sweep: [], braid: null, pins: null, cloth: false, brim: null };
  const old = k.lines >= 2;
  const capSmooth = (r, top, line) => [[-r, 2], [-r - 0.04, -32], [-r, -66, -0.5, top + 6], [0, top - 4, 0.5, top + 6], [r, -66, r + 0.04, -32], [r, 2], IN, ...line];
  const setFront = (spec) => { g.front = mk(f, spec); const cut = spec.indexOf(IN); if (cut > 0) g.outer = mk(f, spec.slice(0, cut)); };
  switch (k.style) {
    case 'crop':
      if (k.child) {
        // straw, cut with kitchen scissors, and the bit at the crown that will not lie down
        setFront([[-1.1, 6], [-1.16, -30], [-1.1, -74, -0.34, -84], [-0.2, -112], [0.0, -98], [0.26, -108], [0.2, -90], [0.44, -84], [1.08, -72, 1.16, -30], [1.1, 6], IN,
          [0.92, 0], [0.9, -24], [0.62, -40], [0.42, -24], [0.14, -36], [-0.1, -22], [-0.38, -38], [-0.62, -24], [-0.9, -30], [-0.92, 0]]);
      } else if (k.spiky) {
        // cut close and standing up in three points; the fringe falls in teeth
        setFront([[-1.08, 4], [-1.14, -30], [-1.1, -62, -0.74, -78], [-0.56, -94], [-0.32, -80], [-0.04, -100], [0.18, -82], [0.48, -94], [0.6, -80], [1.04, -70, 1.14, -30], [1.08, 4], IN,
          [0.9, -4], [0.86, -28], [0.62, -44], [0.46, -24], [0.26, -42], [0.06, -20], [-0.18, -44], [-0.42, -24], [-0.6, -42], [-0.86, -28], [-0.9, -4]]);
      } else if (old) {
        // thin, short, going back at the temples
        setFront([[-1.04, 2], [-1.08, -30], [-1.02, -62, -0.62, -74], [0, -84, 0.62, -74], [1.02, -62, 1.08, -30], [1.04, 2], IN,
          [0.93, -8], [0.9, -36], [0.56, -60], [0.3, -52], [0, -62], [-0.3, -52], [-0.56, -60], [-0.9, -36], [-0.93, -8]]);
      } else {
        // a square block, flat on top
        setFront([[-1.06, 0], [-1.12, -34], [-1.0, -68], [-0.62, -87], [0.5, -89], [0.98, -70], [1.12, -34], [1.06, 0], IN,
          [0.9, -8], [0.86, -34], [0.5, -50], [0.1, -41], [-0.3, -52], [-0.86, -34], [-0.9, -8]]);
      }
      break;
    case 'swept':
      setFront([[-1.06, 2], [-1.12, -34], [-1.06, -74, -0.5, -88], [0.2, -100, 0.7, -86], [1.1, -72, 1.14, -32], [1.06, 2], IN,
        [0.92, -8], [0.88, -34], [0.6, -54, 0.3, -56], [-0.2, -40, -0.6, -40], [-0.88, -30], [-0.92, -8]]);
      g.sweep = [mk(f, [[-0.5, -46], [0.2, -84, 0.8, -56]]), mk(f, [[-0.3, -60], [0.3, -94, 0.9, -70]])];
      break;
    case 'long':
    case 'bob':
      if (k.sweptBack) {
        // a mane taken straight back off the brow, breaking outward in two points at the collar
        g.back.push(mk(f, [[-1.08, -40], [-1.18, 0, -1.12, 34], [-1.42, 62], [-1.0, 70], [-0.7, 58], [0.7, 58], [1.0, 70], [1.42, 62], [1.12, 34], [1.18, 0, 1.08, -40], [1.08, -100, 0, -102], [-1.08, -100, -1.08, -40]]));
        setFront([[-1.1, -4], [-1.18, -40], [-1.1, -80, -0.5, -94], [0.1, -104, 0.6, -92], [1.12, -78, 1.18, -40], [1.1, -4], IN,
          [0.95, -16], [0.87, -46], [0.5, -66, 0.1, -50], [-0.4, -68, -0.87, -46], [-0.95, -16]]);
        g.sweep = [mk(f, [[0.1, -54], [0.5, -88, 1.0, -62]]), mk(f, [[0.1, -54], [-0.4, -90, -1.0, -62]])];
      } else {
        const end = k.style === 'bob' ? 70 : 186, wide = k.style === 'bob' ? 1.34 : 1.5;
        g.back.push(mk(f, [[-1.1, -30], [-1.3, 20, -wide, end - 20], [-wide + 0.2, end + 8], [-0.4, end - 4], [0.4, end - 4], [wide - 0.2, end + 8], [wide, end - 20], [1.3, 20, 1.1, -30], [1.1, -104, 0, -104], [-1.1, -104, -1.1, -30]]));
        setFront([[-1.1, 30], [-1.18, -30], [-1.1, -76, -0.5, -88], [0, -96, 0.5, -88], [1.1, -76, 1.18, -30], [1.1, 30], IN,
          [0.86, 40], [0.9, -16], [0.6, -40, 0.24, -60], [0.14, -44], [-0.3, -28, -0.6, -30], [-0.9, -16], [-0.86, 40]]);
      }
      break;
    case 'bun':
      if (k.tight) {
        // pinned flat: a cap as close as paint, a hard knot, two pins through it
        setFront(capSmooth(1.03, -82, [[0.92, -10], [0.87, -36], [0.6, -56, 0.24, -62], [0.17, -49], [-0.4, -60, -0.87, -36], [-0.92, -10]]));
        g.top.push(mk(f, [[-0.5, -76], [-0.66, -100, -0.24, -110], [0.24, -116, 0.4, -96], [0.46, -78, 0, -72]]));
        g.pins = mk(f, [[-0.66, -112], [0.56, -90]]);
      } else {
        // a soft knot on the crown and two curtains off a middle parting
        setFront([[-1.08, 4], [-1.14, -30], [-1.06, -70, -0.5, -82], [0, -90, 0.5, -82], [1.06, -70, 1.14, -30], [1.08, 4], IN,
          [0.9, -4], [0.94, -20], [0.5, -32, 0.06, -60], [0, -50], [-0.5, -32, -0.94, -20], [-0.9, -4]]);
        g.top.push(mk(f, [[-0.5, -78], [-0.8, -106, -0.3, -114], [0, -128, 0.3, -114], [0.8, -106, 0.5, -78], [0, -66, -0.5, -78]]));
      }
      break;
    case 'braid':
      if (k.braidBack) {
        // parted in the middle and pulled back hard; what the wind has worked loose stands off the temple
        setFront([[-1.08, 6], [-1.16, -28], [-1.08, -72, -0.5, -84], [0, -92, 0.5, -84], [1.08, -72, 1.16, -28], [1.08, 6], IN,
          [0.9, 0], [0.88, -24], [0.6, -46, 0.1, -64], [0.02, -52], [-0.6, -46, -0.88, -24], [-0.9, 0]]);
        g.locks.push(mk(f, [[-1.08, -44], [-1.56, -62], [-1.3, -44], [-1.5, -34], [-1.1, -24]]));
        g.locks.push(mk(f, [[-1.08, -8], [-1.4, -10], [-1.08, 6]]));
        g.braid = { front: false, x0: -f * hw * 0.66, y0: cy + 56, x1: -f * (hw + 6), y1: cy + 176, n: 6 };
      } else {
        // a heavy fringe swept across from a side parting, and the braid brought forward over one shoulder
        setFront([[-1.1, 10], [-1.16, -30], [-1.06, -68, -0.5, -86], [0.1, -94, 0.6, -84], [1.08, -66, 1.14, -28], [1.1, 10], IN,
          [0.9, 0], [0.87, -22], [0.62, -46], [0.42, -54], [0.24, -32], [-0.06, -20], [-0.4, -19], [-0.3, -32], [-0.72, -12], [-0.64, -34], [-0.9, -16], [-0.9, 0]]);
        g.braid = { front: true, x0: -f * (hw + 1), y0: cy + 22, x1: -f * (hw + 16), y1: cy + 176, n: 8 };
      }
      break;
    case 'tail':
      // sleek, parted at the side, one sharp lock across the brow; the tail lies on the far shoulder
      setFront([[-1.04, 2], [-1.09, -32], [-1.02, -70, -0.5, -80], [0, -88, 0.5, -80], [1.02, -70, 1.09, -32], [1.04, 2], IN,
        [0.92, -8], [0.88, -34], [0.7, -54, 0.42, -60], [0.1, -30, -0.52, -13], [-0.4, -37], [-0.87, -31], [-0.92, -8]]);
      g.back.push(mk(-f, [[0.3, 36], [1.2, 30, 1.56, 66], [1.5, 150], [1.22, 96, 0.5, 62]]));
      break;
    case 'curls': {
      // a wild head of it: one great lobed mass, and three fat curls on the brow
      const pts = [[-(hw + 13), cy + 4]];
      const n = 9;
      for (let j = 0; j <= n; j++) {
        const a0 = Math.PI * (0.94 + (j / n) * 1.12), a1 = Math.PI * (0.94 + ((j + 0.5) / n) * 1.12);
        const ro = hw + 36 + rnd(k.seed * 50 + j) * 12, ri = hw + 15;
        const ex = Math.cos(a1) * ri, ey = cy - 16 + Math.sin(a1) * (ri + 6);
        pts.push([Math.cos(a0) * ro, cy - 16 + Math.sin(a0) * (ro + 8), j === n ? hw + 13 : ex, j === n ? cy + 4 : ey]);
      }
      pts.push([hw - 8, cy + 16], [-hw + 8, cy + 16]);
      g.back.push(pts);
      setFront([[-1.02, -16], [-1.02, -70, 0, -78], [1.02, -70, 1.02, -16], [0.84, -30], [0.72, -10, 0.5, -34], [0.3, -10, 0.06, -36], [-0.2, -12, -0.44, -36], [-0.68, -12, -0.84, -30]]);
      break;
    }
    case 'receding':
      g.locks.push(mk(f, [[-1.08, 12], [-1.14, -30], [-0.9, -58], [-0.5, -68], [-0.84, -40], [-0.86, 6]]));
      g.locks.push(mk(f, [[1.08, 12], [1.14, -30], [0.9, -58], [0.5, -68], [0.84, -40], [0.86, 6]]));
      break;
    case 'bald':
      break;
    case 'scarf':
      // a hood: one piece of cloth, peaked, with the face set back inside it
      g.cloth = true;
      g.back.push(mk(f, [[-1.2, -10], [-1.34, -108, 0.1, -112], [1.34, -104, 1.2, -10], [1.3, 60, 0.5, 108], [-0.5, 108], [-1.3, 60, -1.2, -10]]));
      setFront([[-1.16, 24], [-1.34, -66, -0.4, -96], [0.14, -110], [1.24, -74, 1.16, 24], [0.9, 34], [1.0, -30, 0.5, -50], [0, -60, -0.5, -50], [-1.0, -30, -0.9, 34]]);
      break;
    case 'cap':
      // a flat cap pulled down, its peak toward whoever is being looked at
      g.cloth = true;
      g.locks.push(mk(f, [[-1.06, 6], [-1.1, -30], [-0.86, -30], [-0.9, 4]]));
      g.locks.push(mk(f, [[1.06, 6], [1.1, -30], [0.86, -30], [0.9, 4]]));
      setFront([[-1.14, -30], [-1.24, -82, -0.2, -92], [0.9, -96, 1.16, -54], [1.14, -32], [0.4, -42, -1.14, -30]]);
      g.brim = mk(f, [[0.0, -40], [1.5, -34], [1.56, -24], [0.1, -26]]);
      break;
    default:
      throw new Error(`cinema: hair style '${k.style}' has no painter`);
  }
  // the one hard shine on the lit side is placed when drawn; here, the tail tie and the braid kites
  if (g.braid) {
    const b = g.braid, segs = [];
    for (let j = 0; j < b.n; j++) {
      const u = (j + 0.5) / b.n, sway = Math.sin(u * Math.PI) * (b.front ? 5 : 0) * -f;
      segs.push([lerp(b.x0, b.x1, u) + sway, lerp(b.y0, b.y1, u), lerp(13, 9, u), (b.y1 - b.y0) / b.n * 0.74, j % 2 ? 1 : -1]);
    }
    b.segs = segs;
  }
  k.geo[i] = g;
  return g;
}
function kite(ctx, s) {
  const [x, y, a, b, sk] = s;
  ctx.moveTo(x - sk * 5, y - b); ctx.lineTo(x + a, y - sk * 4); ctx.lineTo(x + sk * 5, y + b); ctx.lineTo(x - a, y + sk * 4); ctx.closePath();
}
function drawBraid(ctx, k, g, C, W, f) {
  const b = g.braid;
  for (let j = 0; j < b.segs.length; j++) {
    ctx.beginPath(); kite(ctx, b.segs[j]);
    ctx.fillStyle = j % 2 ? C.hair : C.hairSh; ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2 * W; ctx.lineJoin = 'round'; ctx.stroke();
  }
  const dx = (b.x1 - b.x0) / b.n, dy = (b.y1 - b.y0) / b.n, ex = b.x1 - dx * 0.2, ey = b.y1 - dy * 0.2;
  flat(ctx, [ex - 10, ey + 2, ex + dx * 1.3 - 12, ey + dy * 0.9 + 10, ex + dx * 0.8, ey + dy * 1.5 + 12, ex + dx * 1.3 + 12, ey + dy * 0.9 + 8, ex + 10, ey + 2], C.hair, 2 * W);
  flat(ctx, [ex - 11, ey - 5, ex + 11, ey - 5, ex + 11, ey + 4, ex - 11, ey + 4], C.trim, 1.6 * W);
  if (b.front && k.has(/\bpen\b|quill/)) {   // a pen pushed through the braid
    const s = b.segs[2], sx = -f;
    line(ctx, s[0] - sx * 20, s[1] + 10, s[0] + sx * 24, s[1] - 8, INK, 6.5 * W);
    line(ctx, s[0] - sx * 20, s[1] + 10, s[0] + sx * 24, s[1] - 8, C.tn('#7a4a2a'), 3.2);
    line(ctx, s[0] + sx * 24, s[1] - 8, s[0] + sx * 31, s[1] - 11, C.brass, 3);
  }
}

function hairBack(ctx, k, g, C, F, W) {
  const cloth = g.cloth;
  for (const p of g.back) {
    form(ctx, (c) => trace(c, p), cloth ? C.trimSh : C.hair, cloth ? C.trimSh : C.hairSh, F, k.hw * 0.36, 3 * W, 4 * C.rimK, C.rim, null);
  }
  if (k.style === 'tail') {   // the tie at the nape
    const p = g.back[0][0];
    disc(ctx, p[0] + (p[0] < 0 ? -20 : 20), p[1] + 8, 7, C.trim, 1.6 * W);
  }
  if (g.braid && !g.braid.front) drawBraid(ctx, k, g, C, W, 0);
}

/** the shine: one hard zigzag band on the lit side of the crown, clipped to the hair it is on */
function shine(ctx, k, F) {
  const a = F.key * k.hw * (0.36 + rnd(k.seed * 13) * 0.14), y = CY - 62 + rnd(k.seed * 17) * 5;
  const s = F.key;   // two slanted bars, the longer one nearer the lamp
  ctx.moveTo(a - s * 4, y - 10); ctx.lineTo(a + s * 9, y - 12); ctx.lineTo(a + s * 2, y + 12); ctx.lineTo(a - s * 9, y + 13); ctx.closePath();
  ctx.moveTo(a - s * 13, y - 4); ctx.lineTo(a - s * 8, y - 6); ctx.lineTo(a - s * 14, y + 11); ctx.lineTo(a - s * 18, y + 11); ctx.closePath();
}
function hairFront(ctx, k, g, C, F, W, f) {
  if (g.braid && g.braid.front) drawBraid(ctx, k, g, C, W, f);
  if (!g.front) return;
  const cloth = g.cloth;
  const base = cloth ? C.trim : C.hair, sh = cloth ? C.trimSh : C.hairSh, hi = cloth ? C.trimHi : C.hairHi;
  for (const p of g.locks) form(ctx, (c) => trace(c, p), cloth ? C.hair : base, cloth ? C.hairSh : sh, F, 5, 2.4 * W, 0, C.rim, null);
  form(ctx, (c) => trace(c, g.front), base, sh, F, k.hw * 0.24, 3 * W, 3.6 * C.rimK, C.rim, (c) => {
    c.beginPath(); shine(c, k, F); c.fillStyle = hi; c.fill();
    for (const s of g.sweep) curve(c, s[0][0], s[0][1], s[1][0], s[1][1], s[1][2], s[1][3], sh, 2.4 * W);
  }, g.outer ? (c) => trace(c, g.outer) : null);
  if (g.brim) form(ctx, (c) => trace(c, g.brim), C.trimSh, C.trimSh, F, 0, 2.6 * W, 3, C.rim, null);
}

// ───────────────────────── the face ─────────────────────────
function eyePath(ctx, xi, yi, xo, yo, hi, ho, b) {
  ctx.moveTo(xi, yi);
  ctx.bezierCurveTo(xi * 0.6 + xo * 0.02, yi - hi * 1.33, xo * 0.62, yo - ho * 1.33, xo, yo);
  ctx.bezierCurveTo(xo * 0.6, yo + b * 1.33, xi * 0.55, yi + b * 1.33, xi, yi);
  ctx.closePath();
}
/** one eye about its own centre. sgn: which side of the face. blink 0..1 (1 open). gx: where the iris looks. */
function drawEye(ctx, ex, ey, sgn, E, blink, gx, k, C, F, f, W, lid) {
  const far = sgn === -f ? 0.9 : 1;                 // the eye on the far side of a turned head is a little narrower
  const w = 17.5 * far * k.eyeW;
  const H = 15.5 * k.eyeH * E.open * lid;
  const xi = -sgn * w, xo = sgn * w;
  const yi = 2 + E.yi, yo = E.yo;
  ctx.save();
  ctx.translate(ex, ey);
  if (blink < 0.4) {
    // shut: one heavy lash line, bowed down
    ctx.strokeStyle = INK; ctx.lineWidth = 4 * W; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(xi, yi + 1); ctx.quadraticCurveTo(0, yi + 9, xo, yo + 1); ctx.stroke();
    ctx.restore();
    return;
  }
  const hi = H * E.ti, ho = H * E.to, b = 9.5 * k.eyeH * E.low;
  ctx.beginPath(); eyePath(ctx, xi, yi, xo, yo, hi, ho, b);
  ctx.fillStyle = sgn === -F.key ? C.whiteFar : C.white;
  ctx.fill();
  ctx.save();
  ctx.clip();
  const r = Math.min(11.5 * k.eyeW * far, 6.5 + H * 0.36 + 2) * E.iris, iy = -2.5 + (E.low < 0 ? -2 : 0);
  ctx.fillStyle = C.irisSh; ctx.beginPath(); ctx.arc(gx, iy, r, 0, TAU); ctx.fill();
  ctx.fillStyle = C.iris; ctx.beginPath(); ctx.arc(gx, iy + r * 0.27, r * 0.71, 0, TAU); ctx.fill();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(gx, iy, r * (E.iris < 0.7 ? 0.36 : 0.45), 0, TAU); ctx.fill();
  // the lid's shadow across the top of the eye: one hard band
  const ga = ctx.globalAlpha;
  ctx.fillStyle = C.whiteSh; ctx.globalAlpha = ga * 0.55;
  ctx.fillRect(-w - 2, -H * 1.2 - 2, w * 2 + 4, H * 1.2 - (H * 0.78 - 4.5) + 2);
  ctx.globalAlpha = ga;
  // one hard catchlight, toward the lamp
  ctx.fillStyle = PALETTE.white; ctx.beginPath(); ctx.arc(gx + F.key * r * 0.42, iy - r * 0.4, r * 0.3, 0, TAU); ctx.fill();
  if (E.tears) {   // water standing on the lower lid
    ctx.fillStyle = C.tear; ctx.beginPath(); ctx.ellipse(0, yi + b * 0.86, w * 0.8, 3.6, 0, 0, TAU); ctx.fill();
  }
  ctx.restore();
  // the upper lid: the heaviest line on the face, with a flick at the outer corner
  ctx.strokeStyle = INK; ctx.lineWidth = 4.2 * W; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(xi, yi); ctx.bezierCurveTo(xi * 0.6 + xo * 0.02, yi - hi * 1.33, xo * 0.62, yo - ho * 1.33, xo, yo); ctx.stroke();
  // the lower lid: a light line, the outer half only
  ctx.strokeStyle = C.skinLine; ctx.lineWidth = 1.5 * W;
  ctx.beginPath(); ctx.moveTo(xo, yo); ctx.bezierCurveTo(xo * 0.6, yo + b * 1.33, xo * 0.1, yi + b * 1.2, -xo * 0.2, yi + b * 0.98); ctx.stroke();
  if (lid < 1) {   // a heavy lid has a fold above it
    ctx.beginPath(); ctx.moveTo(xi * 0.5, yi - hi - 5); ctx.quadraticCurveTo(xo * 0.3, -Math.max(hi, ho) - 8, xo * 0.95, yo - ho * 0.5 - 5); ctx.stroke();
  }
  ctx.restore();
}
function drawBrow(ctx, ex, by, sgn, E, k, C, W, cut) {
  const bw = 0.86 + k.browW * 0.2;
  const x0 = ex - sgn * 17 * bw, y0 = by + E.bi, x1 = ex + sgn * 22 * bw, y1 = by + 3 + E.bo;
  const cx = ex + sgn * 3, cy = by - 7 * E.arch + (E.bi + E.bo) * 0.32;
  const th = (k.child ? 5 : 5.2 + k.browW * 2.6) * (k.lines >= 2 ? 1.12 : 1) * W;
  taperPath(ctx, quadPts(x0, y0, cx, cy, x1, y1), th, 1.6 * W, C.brow, 0.22);
  if (cut) {   // a scar through it: the brow parts, and the line runs on down toward the eye
    const u = 0.56, v = 1 - u, px = v * v * x0 + 2 * v * u * cx + u * u * x1, py = v * v * y0 + 2 * v * u * cy + u * u * y1;
    line(ctx, px - sgn * 2.5, py - 8, px + sgn * 2, py + 8, C.skin, 3.8);
    line(ctx, px - sgn * 3, py - 11, px + sgn * 2.5, py + 10, C.skinHi, 1.6);
  }
}
function drawMouth(ctx, mx, my, E, talk, t, k, C, W) {
  const openA = clamp(E.mo + talk * 0.5 * (0.75 + 0.25 * Math.sin(t * 19 + k.seed * 4)), 0, 0.9);
  const w = 19 * E.mw * k.mouthW * (1 - talk * 0.08);
  const cornerY = my - E.curve * 7, midY = my + E.curve * 6;
  const wob = E.tears ? Math.sin(t * 11 + k.seed * 3) * 1.4 : 0;
  if (openA > 0.05) {
    const top = E.round ? midY - openA * 16 : E.curve > 0.3 ? midY - E.curve * 6 - openA * 3 : midY - openA * 9 + E.curve * 4;
    const bot = E.round ? midY + openA * 30 : midY + openA * (E.clench ? 24 : 36) + 3 + wob;
    const lips = () => {
      ctx.beginPath();
      ctx.moveTo(mx - w, cornerY);
      if (E.clench) {   // set teeth: a hard box of a mouth, wider at the top
        ctx.lineTo(mx - w * 0.7, top - 1); ctx.lineTo(mx + w * 0.7, top - 1); ctx.lineTo(mx + w, cornerY);
        ctx.lineTo(mx + w * 0.82, bot - 4); ctx.lineTo(mx - w * 0.82, bot - 4);
      } else {
        const cb = cornerY + (bot - cornerY) * 1.33;
        ctx.quadraticCurveTo(mx, top * 2 - cornerY, mx + w, cornerY);
        ctx.bezierCurveTo(mx + w * 0.8, cb, mx - w * 0.8, cb, mx - w, cornerY);
      }
      ctx.closePath();
    };
    lips();
    ctx.fillStyle = C.mouth; ctx.fill();
    ctx.save();
    ctx.clip();
    if (E.clench) {
      ctx.fillStyle = C.teeth; ctx.fillRect(mx - w, top - 4, w * 2, bot - top + 4);
      line(ctx, mx - w, (top + bot) / 2 - 2, mx + w, (top + bot) / 2 - 2, C.mouth, 2 * W);
      for (let i = -2; i <= 2; i++) line(ctx, mx + i * w * 0.3, top - 2, mx + i * w * 0.3, bot, C.mouth, 1.2 * W);
    } else {
      if (openA > 0.26 && !E.round) { ctx.fillStyle = C.tongue; ctx.beginPath(); ctx.ellipse(mx, bot + 1, w * 0.6, (bot - top) * 0.4, 0, 0, TAU); ctx.fill(); }
      if (E.round) { ctx.fillStyle = C.tongue; ctx.beginPath(); ctx.ellipse(mx, bot, w * 0.7, (bot - top) * 0.3, 0, 0, TAU); ctx.fill(); }
      if (E.teeth || (openA > 0.22 && !E.round)) { ctx.fillStyle = C.teeth; ctx.fillRect(mx - w, Math.min(cornerY, top) - 6, w * 2, 7 + openA * 9 + Math.max(0, E.curve) * 5); }
    }
    ctx.restore();
    lips();
    ctx.strokeStyle = INK; ctx.lineWidth = 2.4 * W; ctx.lineJoin = 'round'; ctx.stroke();
  } else {
    // shut: one tapered line, fat in the middle
    taperPath(ctx, quadPts(mx - w, cornerY, mx, midY * 2 - cornerY + 1 + wob, mx + w, cornerY), 1.6 * W, 1.6 * W, C.lipLine, 1.3);
    if (!k.child) curve(ctx, mx - w * 0.36, midY + 10, mx, midY + 12.5, mx + w * 0.36, midY + 10, C.skinLine, 1.6 * W);
  }
  // the corners: what a smile pushes up and a set jaw pulls down
  if (Math.abs(E.curve) > 0.4) {
    const s = E.curve > 0 ? -1 : 1;
    for (const sx of [-1, 1]) line(ctx, mx + sx * (w + 1), cornerY, mx + sx * (w + 5.5), cornerY + s * 4.5, C.lipLine, 2 * W);
  }
}

const BLINK = 0.13;   // seconds a blink lasts
export const breathOf = (k, t) => Math.sin(t * 1.25 + k.seed * 9) * 1.5;
export const blinking = (k, t) => mod(t + k.seed * 7, 3.6 + k.seed * 2) < BLINK;

// what is worn, painted inside the torso's clip
function costume(ctx, k, C, F, W) {
  const n = k.neck, sw = k.sw, key = F.key, li = INK_IN * W + 0.4;
  const seam = () => line(ctx, 0, 132, 0, 570, INK, li);
  switch (k.garb) {
    case 'robe': {
      // a gown: broad stole bands; white bands at the throat for the Benches
      for (const sx of [-1, 1]) flat(ctx, [sx * (n + 2), -22, sx * (n + 48), -2, sx * (n + 56), 570, sx * (n + 6), 570], sx === key ? C.trim : C.trimSh, li);
      flat(ctx, [-n - 4, -22, 0, 38, n + 4, -22], C.shirt, li);
      line(ctx, 0, 38, 0, 570, INK, li);
      if (k.has(/bands|magistrat|judge/)) {
        flat(ctx, [-10, 6, -15, 66, -1, 66, 0, 18], C.white, li);
        flat(ctx, [10, 6, 15, 66, 1, 66, 0, 18], C.white, li);
      }
      break;
    }
    case 'uniform': {
      // buttoned to the throat: a placket, two rows of buttons, straps on the shoulders
      line(ctx, 0, -8, 0, 570, INK, li);
      for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) disc(ctx, sx * 25, 40 + i * 58, 6.5, sx === key ? C.trimHi : C.trim, li);
      if (k.has(/uniform|cadet|epaulet|officer/)) {
        for (const sx of [-1, 1]) {
          ctx.save(); ctx.translate(sx * sw * 0.68, 16); ctx.rotate(sx * 0.4);
          flat(ctx, [-32, -9, 30, -11, 34, 9, -32, 11], sx === key ? C.trim : C.trimSh, li);
          line(ctx, -22, 0, 22, 0, INK, li * 0.8);
          ctx.restore();
        }
      }
      break;
    }
    case 'waistcoat': {
      // shirtsleeves (the torso's own colour) and a waistcoat
      ctx.beginPath();
      ctx.moveTo(-n - 12, -20); ctx.lineTo(0, 100); ctx.lineTo(n + 12, -20);
      ctx.quadraticCurveTo(sw * 0.6, 2, sw * 0.7, 80); ctx.lineTo(sw * 0.78, 570); ctx.lineTo(-sw * 0.78, 570); ctx.lineTo(-sw * 0.7, 80);
      ctx.quadraticCurveTo(-sw * 0.6, 2, -n - 12, -20);
      ctx.closePath();
      ctx.fillStyle = C.coat; ctx.fill();
      if (k.has(/check|plaid|tartan/)) {
        ctx.save(); ctx.clip();
        for (let i = -4; i <= 4; i++) { line(ctx, i * 34, -40, i * 34 + 12, 570, C.coatSh, 5); line(ctx, -300, 30 + (i + 4) * 42, 300, 22 + (i + 4) * 42, C.coatHi, 2.5); }
        ctx.restore();
        ctx.beginPath();
        ctx.moveTo(-n - 12, -20); ctx.lineTo(0, 100); ctx.lineTo(n + 12, -20);
        ctx.quadraticCurveTo(sw * 0.6, 2, sw * 0.7, 80); ctx.lineTo(sw * 0.78, 570); ctx.lineTo(-sw * 0.78, 570); ctx.lineTo(-sw * 0.7, 80);
        ctx.quadraticCurveTo(-sw * 0.6, 2, -n - 12, -20);
        ctx.closePath();
      }
      ctx.strokeStyle = INK; ctx.lineWidth = li + 0.6; ctx.lineJoin = 'round'; ctx.stroke();
      line(ctx, -n - 10, -16, 0, 100, C.trim, 4.5); line(ctx, n + 10, -16, 0, 100, C.trim, 4.5);
      line(ctx, 0, 100, 0, 570, INK, li);
      for (let i = 0; i < 5; i++) disc(ctx, 10, 128 + i * 52, 6, C.trim, li);
      break;
    }
    default: {
      // an open coat over a shirt: two lapels, one lit and one not
      flat(ctx, [-n - 4, -20, 0, 68, n + 4, -20], C.shirt, 0);
      if (k.has(/jersey|gansey|guernsey|knitted (jumper|sweater)|roll-?neck/)) {
        // a fisherman's jersey under the coat: ribbed
        const wool = C.tn(blend(k.trim, '#f1ead8', 0.5));
        flat(ctx, [-n - 4, -20, 0, 68, n + 4, -20], wool, 0);
        for (let i = -3; i <= 3; i++) line(ctx, i * 8, -14, i * 5.5, 60 - Math.abs(i) * 18, shadowOf(wool, F.L), 2.2);
      }
      for (const sx of [-1, 1]) {
        flat(ctx, [sx * (n + 8), -22, sx * sw * 0.46, 36, sx * 5, 136, 0, 68], sx === key ? C.coatHi : C.coatSh, li);
        line(ctx, sx * (n + 6), -19, 0, 68, C.trim, 4.5);
      }
      seam();
      if (k.has(/oilskin|sou'?wester|slicker|tarpaulin coat/)) {
        // toggles, and the patch
        for (let i = 0; i < 4; i++) { flat(ctx, [-6, 152 + i * 60, 24, 150 + i * 60, 24, 159 + i * 60, -6, 161 + i * 60], C.trim, li); disc(ctx, 24, 155 + i * 60, 5.5, C.trimHi, li); }
        if (k.has(/patch/)) {
          ctx.save(); ctx.translate(-key * sw * 0.6, 150); ctx.rotate(0.14);
          flat(ctx, [-24, -19, 24, -21, 22, 19, -22, 20], C.tn(blend(k.coat, '#8a7a4a', 0.5)), li);
          ctx.setLineDash([5, 4]); ctx.strokeStyle = C.trim; ctx.lineWidth = 1.8; ctx.strokeRect(-17, -13, 34, 27); ctx.setLineDash([]);
          ctx.restore();
        }
      } else for (let i = 0; i < 5; i++) disc(ctx, 10, 160 + i * 58, 6, C.trim, li);
    }
  }
  // the arms hang at the sides: one line each
  for (const sx of [-1, 1]) curve(ctx, sx * sw * 0.8, 70, sx * sw * 0.73, 200, sx * sw * 0.82, 570, INK, li);
  if (k.has(/apron/)) {
    const ap = C.tn(blend(k.trim, '#e4dcc8', 0.6));
    flat(ctx, [-sw * 0.42, 76, sw * 0.42, 76, sw * 0.6, 570, -sw * 0.6, 570], ap, li);
    for (const sx of [-1, 1]) line(ctx, sx * sw * 0.42, 76, sx * (n + 14), -8, ap, 7);
  }
  if (k.has(/cravat|neckerchief|necktie|\btie\b/)) flat(ctx, [-n, -18, n, -18, 10, 14, 15, 72, 0, 88, -15, 72, -10, 14], C.trim, li);
  if (k.has(/\bchain\b|medallion/)) {
    // a chain of office: square links, a medallion, and the light catching it
    ctx.lineCap = 'butt';
    ctx.strokeStyle = INK; ctx.lineWidth = 11;
    ctx.beginPath(); ctx.moveTo(-sw * 0.6, 14); ctx.quadraticCurveTo(0, 196, sw * 0.6, 14); ctx.stroke();
    ctx.strokeStyle = C.brass; ctx.lineWidth = 7; ctx.setLineDash([11, 5]);
    ctx.beginPath(); ctx.moveTo(-sw * 0.6, 14); ctx.quadraticCurveTo(0, 196, sw * 0.6, 14); ctx.stroke();
    ctx.setLineDash([]);
    disc(ctx, 0, 108, 16, C.brass, 2.4 * W); disc(ctx, 0, 108, 8, C.brassSh, 0);
  }
  if (k.has(/\bpin\b|badge|brooch|\bmedal\b|sigil|\btag\b/)) {
    const brassy = k.has(/brass/);
    disc(ctx, -key * sw * 0.4, 80, 10, brassy ? C.brass : C.trimHi, li + 0.4);
    disc(ctx, -key * sw * 0.4, 80, 4, brassy ? C.brassSh : C.trimSh, 0);
  }
}
// what stands up off the shoulders, outside the torso's outline: collars and the shawl
function collars(ctx, k, C, F, W) {
  const n = k.neck, sw = k.sw, key = F.key, w = 2.4 * W;
  if (k.garb === 'uniform') {
    const tall = k.has(/high[a-z ]{0,14}collar/) ? 12 : 0, loose = k.has(/too (large|big)|oversize/) ? 7 : 0;
    const col = k.has(/black collar/) ? C.coat : C.trim, colSh = k.has(/black collar/) ? C.coatSh : C.trimSh;
    for (const sx of [-1, 1]) flat(ctx, [sx * 2, -24 - tall * 0.4, sx * (n + 9 + loose), -36 - tall, sx * (n + 12 + loose), -4, sx * 2, 8], sx === key ? col : colSh, w);
    if (tall) for (const sx of [-1, 1]) line(ctx, sx * 5, -25 - tall * 0.4, sx * (n + 7), -35 - tall, C.trim, 2.5);
  } else if (k.garb === 'coat') {
    if (k.has(/oilskin|sou'?wester|slicker|tarpaulin coat|turned-up collar/)) {
      // a storm collar turned up against the weather
      for (const sx of [-1, 1]) flat(ctx, [sx * (n - 1), -6, sx * (n + 8), -56, sx * (n + 44), -30, sx * sw * 0.5, 30, sx * (n + 12), 22], sx === key ? C.coat : C.coatSh, w);
    }
    if (k.has(/jersey|gansey|guernsey|roll-?neck/)) {
      const wool = C.tn(blend(k.trim, '#f1ead8', 0.5));
      ctx.beginPath(); rr(ctx, -n - 6, -34, n * 2 + 12, 20, 8); ctx.fillStyle = wool; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = w * 0.8; ctx.stroke();
      for (let i = -3; i <= 3; i++) line(ctx, i * (n + 4) / 3.6, -31, i * (n + 4) / 3.6, -17, shadowOf(wool, F.L), 1.8);
    }
  }
  if (k.has(/shawl/)) {
    // a knitted shawl: wider than the shoulders under it, with a toothed hem
    const base = k.has(/red/) ? C.tn('#c8322e') : C.trim, sh = shadowOf(base, F.L);
    const path = (c) => {
      c.moveTo(-n - 12, -28); c.quadraticCurveTo(-sw * 0.6, -22, -sw - 22, 32); c.lineTo(-sw - 30, 168);
      for (let i = 1; i <= 12; i++) { const u = i / 12, x = lerp(-sw - 30, sw + 30, u), y = 168 - Math.sin(u * Math.PI) * 64; c.lineTo(x - (sw + 30) / 12, y + 16 + (i % 2) * 2); c.lineTo(x, y); }
      c.lineTo(sw + 22, 32); c.quadraticCurveTo(sw * 0.6, -22, n + 12, -28); c.lineTo(0, 44); c.closePath();
    };
    form(ctx, path, base, sh, F, 28, 3 * W, 4.5 * C.rimK, C.rim, (c) => {
      for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) curve(c, sx * (n + 20 + i * 34), -10 + i * 10, sx * (sw * 0.5 + i * 30), 40 + i * 20, sx * (20 + i * 44), 96 + i * 12, sh, 2.6);
      c.fillStyle = C.shade; c.beginPath(); c.ellipse(-F.dx * 30, -4, k.hw * 1.2, 34, 0, 0, TAU); c.fill();
    });
  }
}

/**
 * A half-figure in local units: origin at the base of the neck, head about 190 tall above it.
 * o: { emote, talk 0..1, focus 0..1, light (a style.js Light, or { amb, rim, key }; optional), facing -1|1, t seconds, gaze?,
 *      part?: 'body' (hair behind, torso, neck, collar) | 'head' | undefined for both,
 *      still?: true holds the pose: no breath, no sway, eyes open. That is the pose a cached sprite is painted in,
 *      ink?: line-weight multiplier (1; the small framed bust asks for more so a face still reads at 46 px) }
 */
export function drawFigure(ctx, member, o) {
  const k = lookOf(member);
  const E0 = emoteOf(o.emote);
  const F = figLight(o.light);
  const focus = o.focus === undefined ? 1 : clamp(o.focus);
  const C = palOf(member, k, F, focus);
  const W = o.ink > 0 ? o.ink : 1;
  const t = o.t || 0, f = o.facing >= 0 ? 1 : -1, talk = clamp(o.talk || 0);
  const cy = CY, hw = k.hw, n = k.neck;
  const still = o.still === true, part = o.part;
  if (part !== undefined && part !== 'body' && part !== 'head') throw new Error(`cinema: drawFigure part must be 'body' or 'head', got '${part}'`);
  const breathe = still ? 0 : breathOf(k, t);
  const curveE = E0.curve >= 0 ? Math.min(1, E0.curve + k.smileBias) : E0.curve;
  const E = curveE === E0.curve ? E0 : { ...E0, curve: curveE };
  const g = hairGeo(k, f);

  const headTf = () => {
    ctx.translate(f * 2 + k.stoop * f * 7, -talk * 1.4 + breathe * 0.4 + k.stoop * 10);
    ctx.rotate(E.tilt * f + k.stoop * f * 0.05 + (still ? 0 : Math.sin(t * 0.6 + k.seed * 5) * 0.012) + talk * Math.sin(t * 5 + k.seed) * 0.008);
    if (k.child) { // a short neck, and a skull that is round rather than long
      ctx.translate(0, 14 + cy + k.chin); ctx.scale(1.06, 0.9); ctx.translate(0, -(cy + k.chin));
    }
    ctx.translate(0, PIVOT); ctx.scale(k.hs, k.hs); ctx.translate(0, -PIVOT);   // the head is larger than life
  };

  ctx.save();
  ctx.lineJoin = 'round';

  if (part !== 'head') {
    // hair that falls behind the shoulders
    ctx.save(); headTf(); hairBack(ctx, k, g, C, F, W); ctx.restore();

    // ── neck: in the head's shadow, but for a strip on the lit side ──
    ctx.save();
    ctx.translate(0, breathe * 0.45);
    ctx.beginPath(); ctx.moveTo(-n, -78); ctx.lineTo(n, -78); ctx.lineTo(n + 3, -10); ctx.lineTo(-n - 3, -10); ctx.closePath();
    ctx.fillStyle = C.skinSh; ctx.fill();
    ctx.fillStyle = C.skin; ctx.fillRect(F.key > 0 ? n - 7 : -n, -78, 7, 70);
    ctx.strokeStyle = INK; ctx.lineWidth = 2.4 * W;
    ctx.beginPath(); ctx.moveTo(-n, -78); ctx.lineTo(-n - 2, -10); ctx.moveTo(n, -78); ctx.lineTo(n + 2, -10); ctx.stroke();
    ctx.restore();

    // ── torso ──
    ctx.save();
    ctx.translate(0, breathe * 0.5);
    const tp = (c) => torsoPath(c, k);
    form(ctx, tp, k.garb === 'waistcoat' ? C.shirt : C.coat, null, F, 0, 3.2 * W, 4.5 * C.rimK, C.rim, (c) => {
      costume(c, k, C, F, W);
      // the far side drops into shadow, and the head throws its own on the chest: one translucent tone over everything worn
      outside(c, tp, F.dx * k.sw * 0.36, F.dy * 40);
      c.fillStyle = C.shade; c.fill('evenodd');
      c.beginPath(); c.ellipse(-F.dx * 30, -16, hw * 1.0, 26, 0, 0, TAU); c.fill();
    });
    collars(ctx, k, C, F, W);
    if (C.glint) {
      if (k.has(/\bchain\b|medallion/)) glint(ctx, F.key * 5, 102, 15, PALETTE.white, 0.95);
      if (k.has(/\bpin\b|badge|brooch|\bmedal\b|sigil|\btag\b/)) glint(ctx, -F.key * k.sw * 0.4 + F.key * 3, 76, 12, PALETTE.white, 0.95);
    }
    ctx.restore(); // torso translate
  }
  if (part !== 'body') {
    // ── head ──
    ctx.save();
    headTf();
    const fx0 = f * 6; // features sit a little toward the way the head is turned
    const ey = cy + 8 + k.eyeDy;
    const cloth = g.cloth;
    for (const p of g.top) form(ctx, (c) => trace(c, p), C.hair, C.hairSh, F, 12, 3 * W, 3.6 * C.rimK, C.rim, null);
    if (g.pins) {
      const p = g.pins;
      for (let i = 0; i + 1 < p.length; i += 2) { line(ctx, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1], INK, 6 * W); line(ctx, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1], C.trim, 2.6); }
    }
    // ears
    const earOut = k.has(/ears? (that )?stick|jug ears|big ears/) ? 4 : k.child ? 2 : 0;
    for (const sx of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(sx * (hw - 1 + earOut * 0.6), cy + 14 + k.eyeDy, 9 + earOut, 15 + earOut * 0.5, sx * (0.14 + earOut * 0.04), 0, TAU);
      ctx.fillStyle = sx === F.key ? C.skin : C.skinSh; ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 2.4 * W; ctx.stroke();
    }
    if (k.has(/earpiece|ear-piece|earbud|the line|listener/)) {
      const sx = -f;
      curve(ctx, sx * (hw + 4), cy + 18, sx * (hw + 9), cy + 36, sx * (hw - 10), cy + 50, INK, 2.2 * W);
      disc(ctx, sx * (hw + 3), cy + 14, 5.5, C.brass, 2 * W);
    }
    const hp = (c) => headPath(c, k);
    const skinBase = k.hooded ? C.skinSh : C.skin, skinDeep = k.hooded ? blend(C.skinSh, INK, 0.45) : C.skinSh;
    const blushA = E.blush + (k.child ? 0.35 : 0) + (k.weathered ? 0.3 : 0);
    form(ctx, hp, skinBase, skinDeep, F, hw * 0.4, 3 * W, 4 * C.rimK, k.hooded ? C.skin : C.rim, (c) => {
      // what the hair throws on the brow: its own shape, slid away from the lamp
      if (g.front) {
        const ox = -F.dx * 5, oy = 7 + Math.max(0, -F.dy) * 3;
        c.translate(ox, oy); c.beginPath(); trace(c, g.front); c.translate(-ox, -oy);
        c.fillStyle = skinDeep; c.fill();
      }
      // the nose's shadow, a wedge on the far side
      c.beginPath(); c.moveTo(fx0 - F.key * 1, cy + 14); c.lineTo(fx0 - F.key * 13 * k.noseL, cy + 34); c.lineTo(fx0 - F.key * 1, cy + 35); c.closePath();
      c.fillStyle = skinDeep; c.fill();
      if (blushA > 0.05) {
        c.fillStyle = o.emote === 'anger' ? C.flush : C.blush;
        const ga = c.globalAlpha;
        c.globalAlpha = ga * Math.min(1, blushA);
        for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(fx0 + sx * 36, cy + 32 + k.eyeDy * 0.5, 13, 7.5, sx * -0.12, 0, TAU); c.fill(); }
        c.globalAlpha = ga;
      }
      if (k.has(/stubble|unshaven/)) {
        c.fillStyle = alpha(C.hair, 0.35);
        c.beginPath(); c.moveTo(-hw, cy + 22); c.quadraticCurveTo(0, cy + 46, hw, cy + 22); c.lineTo(hw, cy + 90); c.lineTo(-hw, cy + 90); c.fill();
      }
    });
    if (blushA > 0.5 && !k.hooded) {   // three hatch strokes on each cheek
      for (const sx of [-1, 1]) for (let i = -1; i <= 1; i++) line(ctx, fx0 + sx * 36 + i * 6 + 2, cy + 28 + k.eyeDy * 0.5, fx0 + sx * 36 + i * 6 - 2, cy + 36 + k.eyeDy * 0.5, C.skinLine, 1.5 * W);
    }
    if (k.has(/freckle/)) {
      ctx.fillStyle = C.skinSh;
      for (let i = 0; i < 9; i++) { const u = i / 8 - 0.5; ctx.beginPath(); ctx.arc(fx0 + u * 78 + (rnd(k.seed * 40 + i) - 0.5) * 6, cy + 26 + Math.abs(u) * -8 + rnd(k.seed * 60 + i) * 9, 2.3, 0, TAU); ctx.fill(); }
    }

    if (k.has(/beard/)) {
      // cut square: a block on the jaw, with the mouth let into it
      const sq = k.has(/square/) ? 1 : 0, by = cy + k.chin + 14 + sq * 6;
      const bp = (c) => {
        c.moveTo(-hw + 1, cy + 24);
        c.lineTo(-hw * (0.8 + sq * 0.06), by - 16 + sq * 12); c.lineTo(-hw * 0.5, by); c.lineTo(hw * 0.5, by); c.lineTo(hw * (0.8 + sq * 0.06), by - 16 + sq * 12);
        c.lineTo(hw - 1, cy + 24);
        c.quadraticCurveTo(hw - 10, cy + 42, fx0 + 24, cy + 37);
        c.lineTo(fx0 + 8, cy + 33); c.lineTo(fx0, cy + 37); c.lineTo(fx0 - 8, cy + 33);
        c.lineTo(fx0 - 24, cy + 36);
        c.quadraticCurveTo(-hw + 10, cy + 42, -hw + 1, cy + 24);
        c.closePath();
      };
      form(ctx, bp, C.hair, C.hairSh, F, 14, 3 * W, 0, C.rim, null);
      ctx.fillStyle = C.skinSh; ctx.beginPath(); ctx.ellipse(fx0 + f, cy + 49, 19 * k.mouthW, 9, 0, 0, TAU); ctx.fill();
    }

    // age: a few lines, drawn plainly
    if (k.lines >= 1) {
      const far = k.lines >= 2 ? 1 : 0;
      for (const sx of [-1, 1]) curve(ctx, fx0 + sx * 17, cy + 34, fx0 + sx * (22 + far * 3), cy + 40, fx0 + sx * (22 + far * 2), cy + 44 + far * 8, C.skinLine, 1.5 * W);
    }
    if (k.weathered) { // a face that has been out in it: cheeks cut by the wind
      for (const sx of [-1, 1]) curve(ctx, fx0 + sx * 41, cy + 22, fx0 + sx * 47, cy + 36, fx0 + sx * 38, cy + 54, C.skinLine, 1.7 * W);
    }
    if (k.lines >= 2) {
      const up = -E.by * 0.3;
      for (let i = 0; i < 2; i++) curve(ctx, fx0 - 22 + i * 4, cy - 34 - i * 9 + E.by * 0.4, fx0, cy - 38 - i * 9 + E.by * 0.4 - up, fx0 + 22 - i * 4, cy - 34 - i * 9 + E.by * 0.4, C.skinLine, 1.6 * W);
      for (const sx of [-1, 1]) line(ctx, fx0 + sx * (k.eyeGap + 22), ey + 3, fx0 + sx * (k.eyeGap + 28), ey + 7, C.skinLine, 1.4 * W);
    }

    hairFront(ctx, k, g, C, F, W, f);
    if (k.style === 'bald' || k.style === 'receding') {   // light on a bare crown: one hard patch
      ctx.fillStyle = C.skinHi; ctx.beginPath(); ctx.ellipse(F.key * 18, cy - 52, 15, 8, F.key * 0.5, 0, TAU); ctx.fill();
    }
    if (k.has(/dust/)) { // salt in the hair: hard white flecks, thickest on the lit side
      ctx.fillStyle = C.white;
      for (let i = 0; i < 11; i++) {
        const a = Math.PI * (1.1 + rnd(k.seed * 70 + i) * 0.8), r = hw * (0.8 + rnd(k.seed * 80 + i) * 0.22), x = Math.cos(a) * r, y = cy - 8 + Math.sin(a) * (r + 12), s = 2.2 + rnd(i * 3.1) * 2.2;
        ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.closePath(); ctx.fill();
      }
    }
    if (k.has(/chalk/)) { ctx.save(); ctx.translate(f * (hw + 3), cy - 6); ctx.rotate(f * 0.5); flat(ctx, [-4, -15, 4, -15, 4, 6, -4, 6], C.white, 1.8 * W); ctx.restore(); }

    // eyes
    const bp = mod(t + k.seed * 7, 3.6 + k.seed * 2);
    const blink = !still && bp < BLINK ? 0.08 + Math.abs(bp - 0.065) / 0.065 * 0.5 : 1;
    const gaze = f * 3.2 * (o.gaze === undefined ? 1 : o.gaze) * (k.averted ? -1.5 : 1);
    if (k.hooded) {
      // a face kept in a hood's shadow: nothing of the eyes but the light in them
      for (const sgn of [-1, 1]) { ctx.fillStyle = C.white; ctx.beginPath(); ctx.ellipse(fx0 + sgn * k.eyeGap + gaze, ey, 5, blink < 0.4 ? 1 : 3.4, 0, 0, TAU); ctx.fill(); }
    } else {
      for (const sgn of [-1, 1]) drawEye(ctx, fx0 + sgn * k.eyeGap, ey, sgn, E, blink, gaze, k, C, F, f, W, k.lid);
      // brows, over the hair so they are never lost under a fringe
      const scar = k.has(/scar through the (left |right )?(eye)?brow/);
      for (const sgn of [-1, 1]) {
        const by = cy - 14 + k.eyeDy * 0.7 + E.by - (E.open - 1) * 5 - (sgn === f ? k.browUp : 0) - (1 - k.eyeH) * -8;
        drawBrow(ctx, fx0 + sgn * k.eyeGap, by, sgn, sgn === f && k.browUp ? { ...E, arch: E.arch + 0.8, bo: E.bo - 2 } : E, k, C, W, scar && sgn === -f);
        if (k.has(/dust/)) { const ex = fx0 + sgn * k.eyeGap; curve(ctx, ex - sgn * 9, by + E.bi * 0.6 - 3.5, ex + sgn * 3, by - 7 * E.arch + (E.bi + E.bo) * 0.32 - 1.5, ex + sgn * 14, by + E.bo * 0.7 - 1, C.white, 2); }
      }
      if (E.bi >= 6) { // the knot between drawn brows
        const by = cy - 14 + E.by;
        line(ctx, fx0 - 4, by - 8, fx0 - 2.5, by + 3, C.skinLine, 1.8 * W); line(ctx, fx0 + 4, by - 8, fx0 + 2.5, by + 3, C.skinLine, 1.8 * W);
      }
    }

    // nose: one mark
    {
      const ny = cy + 31 + k.eyeDy, nl = k.noseL;
      if (k.child) curve(ctx, fx0 + f * 1, ny - 3, fx0 + f * 6, ny + 1, fx0 - f * 1, ny + 2, C.skinLine, 2.2 * W);
      else {
        const q = quadPts(fx0 + f * 2.5, ny - 15 * nl, fx0 + f * 13 * nl, ny + 1, fx0 - f * 3, ny + 3);
        taperPath(ctx, q, 0.8 * W, 2.6 * W, C.skinLine, 0.5);
      }
    }

    if (k.has(/moustache|mustache|whisker/)) {
      flat(ctx, [fx0, cy + 36, fx0 + 18, cy + 35, fx0 + 28, cy + 47, fx0 + 12, cy + 44, fx0, cy + 43, fx0 - 12, cy + 44, fx0 - 28, cy + 47, fx0 - 18, cy + 35], C.hair, 2 * W);
    }

    if (!k.hooded) drawMouth(ctx, fx0 + f * 1, cy + (k.child ? 47 : 49), E, talk, t, k, C, W);

    // tears: water on the lid (drawn with the eye), a run down each cheek, a drop on its way
    if (E.tears && !k.hooded) {
      for (const sgn of [-1, 1]) {
        const ex = fx0 + sgn * (k.eyeGap + 5);
        const ph = mod(t * 0.35 + (sgn > 0 ? 0.45 : 0) + k.seed, 1);
        const y1 = ey + 12 + 46 * Math.max(ph, 0.35);
        taperPath(ctx, quadPts(ex, ey + 10, ex + sgn * 4, ey + 28, ex + sgn * 1.5, y1), 3 * W, 4.6 * W, C.tear, 0);
        const dy = ey + 12 + ph * 52;
        ctx.beginPath(); ctx.moveTo(ex + sgn, dy - 8); ctx.quadraticCurveTo(ex + sgn + 6.5, dy + 3, ex + sgn, dy + 5); ctx.quadraticCurveTo(ex + sgn - 6.5, dy + 3, ex + sgn, dy - 8);
        ctx.fillStyle = PALETTE.white; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.4 * W; ctx.stroke();
      }
    }

    if (k.has(/\bmole\b|beauty mark/)) disc(ctx, fx0 + f * 30, cy + 38, 2.6, C.skinLine, 0);

    if (k.has(/spectacle|glasses|pince/)) {
      // wire and glass: an ink line, brass over it, one hard bar of light across each lens
      const half = k.has(/half-moon/), r = half ? 19 : 20.5, gy = ey + (half ? 5 : 1);
      for (const sgn of [-1, 1]) {
        const gx = fx0 + sgn * (k.eyeGap + 1);
        ctx.beginPath();
        if (half) { ctx.moveTo(gx - r, gy); ctx.lineTo(gx + r, gy); ctx.arc(gx, gy, r, 0, Math.PI); ctx.closePath(); } else ctx.arc(gx, gy, r, 0, TAU);
        ctx.fillStyle = alpha(PALETTE.white, 0.14); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = 5 * W; ctx.lineJoin = 'round'; ctx.stroke();
        ctx.strokeStyle = C.brass; ctx.lineWidth = 2.2 * W; ctx.stroke();
        ctx.fillStyle = alpha(PALETTE.white, 0.5);
        ctx.beginPath(); ctx.moveTo(gx + F.key * 4, gy + (half ? 2 : -r * 0.7)); ctx.lineTo(gx + F.key * 11, gy + (half ? 2 : -r * 0.6)); ctx.lineTo(gx + F.key * 2, gy + r * 0.72); ctx.lineTo(gx - F.key * 5, gy + r * 0.8); ctx.closePath(); ctx.fill();
      }
      curve(ctx, fx0 - (k.eyeGap + 1 - r), gy - 2, fx0, gy - 8, fx0 + (k.eyeGap + 1 - r), gy - 2, C.brass, 2.6 * W);
      if (k.has(/mended with thread/)) for (let i = -1; i <= 1; i++) line(ctx, fx0 + i * 2.6 - 1, gy - 9, fx0 + i * 2.6 + 1, gy - 3, C.trim, 1.8);
      if (!k.has(/pince/)) for (const sgn of [-1, 1]) line(ctx, fx0 + sgn * (k.eyeGap + 1 + r), gy - 2, sgn * hw, gy - 6, C.brass, 2.2 * W);
      if (C.glint) glint(ctx, fx0 + F.key * (k.eyeGap + 1 + r * 0.72), gy - (half ? -r * 0.66 : r * 0.72), 7, PALETTE.white, 0.9);
    }
    if (k.has(/monocle/)) {
      ctx.beginPath(); ctx.arc(fx0 + f * k.eyeGap, ey + 1, 21, 0, TAU);
      ctx.strokeStyle = INK; ctx.lineWidth = 5 * W; ctx.stroke(); ctx.strokeStyle = C.brass; ctx.lineWidth = 2.2 * W; ctx.stroke();
      curve(ctx, fx0 + f * (k.eyeGap + 8), ey + 20, fx0 + f * 46, cy + 80, fx0 + f * 22, cy + 130, C.brass, 1.6);
    }
    if (k.has(/eye-?patch/)) {
      line(ctx, -hw, cy - 30, hw, cy + 2, INK, 3.4 * W);
      ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(fx0 - f * k.eyeGap, ey, 22, 18, 0, 0, TAU); ctx.fill();
    }
    ctx.restore(); // head
  }
  ctx.restore();
}

// ───────────────────────── the crowd ─────────────────────────
const CROWD_HEADS = ['cap', 'bare', 'hood', 'cap', 'bun', 'bare', 'cap', 'hood'];
// One outline per person, in two halves that meet at the crown, so the half the light is on can be stroked alone.
function crowdLeft(ctx, x, y, s, kind, hy) {
  ctx.moveTo(x - 132 * s, 900);
  ctx.lineTo(x - 126 * s, y + 38 * s); ctx.quadraticCurveTo(x - 92 * s, y - 14 * s, x - 30 * s, y - 26 * s);
  if (kind === 'hood') { ctx.bezierCurveTo(x - 84 * s, y - 34 * s, x - 80 * s, hy - 84 * s, x - 4 * s, hy - 88 * s); return; }
  ctx.lineTo(x - 30 * s, hy + 46 * s);
  if (kind === 'cap') { ctx.bezierCurveTo(x - 52 * s, hy + 34 * s, x - 56 * s, hy, x - 56 * s, hy - 26 * s); ctx.quadraticCurveTo(x - 56 * s, hy - 78 * s, x, hy - 78 * s); return; }
  if (kind === 'bun') { ctx.bezierCurveTo(x - 60 * s, hy + 32 * s, x - 58 * s, hy - 56 * s, x - 20 * s, hy - 60 * s); ctx.quadraticCurveTo(x - 36 * s, hy - 102 * s, x, hy - 102 * s); return; }
  ctx.bezierCurveTo(x - 60 * s, hy + 32 * s, x - 58 * s, hy - 62 * s, x, hy - 62 * s);
}
function crowdRight(ctx, x, y, s, kind, hy) {   // from the crown down
  if (kind === 'hood') ctx.bezierCurveTo(x + 76 * s, hy - 84 * s, x + 84 * s, y - 34 * s, x + 30 * s, y - 26 * s);
  else {
    if (kind === 'cap') {
      ctx.quadraticCurveTo(x + 56 * s, hy - 78 * s, x + 56 * s, hy - 26 * s);
      ctx.lineTo(x + 92 * s, hy - 18 * s); ctx.lineTo(x + 90 * s, hy - 7 * s); ctx.lineTo(x + 54 * s, hy - 10 * s);
      ctx.bezierCurveTo(x + 56 * s, hy + 10 * s, x + 52 * s, hy + 34 * s, x + 30 * s, hy + 46 * s);
    } else if (kind === 'bun') {
      ctx.quadraticCurveTo(x + 36 * s, hy - 102 * s, x + 20 * s, hy - 60 * s);
      ctx.bezierCurveTo(x + 58 * s, hy - 56 * s, x + 60 * s, hy + 32 * s, x + 30 * s, hy + 46 * s);
    } else ctx.bezierCurveTo(x + 58 * s, hy - 62 * s, x + 60 * s, hy + 32 * s, x + 30 * s, hy + 46 * s);
    ctx.lineTo(x + 30 * s, y - 26 * s);
  }
  ctx.quadraticCurveTo(x + 92 * s, y - 14 * s, x + 126 * s, y + 38 * s); ctx.lineTo(x + 132 * s, 900);
}
const CROWD_TOP = { hood: [-4, -88], cap: [0, -78], bun: [0, -102], bare: [0, -62] };
/** a nameless voice: people who stay in the dark, cut out of it by the scene's light along one edge. No clip: the rim is a stroke. */
export function drawCrowdFigures(ctx, light, t, speaking, level) {
  const F = figLight(light), L = F.L;
  const col = blend(L.amb, PALETTE.night, 0.5), colNear = blend(col, L.shadowTint, 0.35);
  const rimC = blend(L.rim, L.amb, speaking ? 0.2 : 0.45);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (let i = 0; i < 8; i++) {
    const x = 40 + i * 172 + rnd(i * 3.3) * 50;
    const y = 400 + rnd(i * 5.1) * 26 + Math.sin(t * 1.1 + i * 2) * 2 - (speaking && i === 3 ? level * 5 : 0);
    const s = 0.6 + rnd(i * 7) * 0.14;
    const kind = CROWD_HEADS[i], hy = y - 84 * s, top = CROWD_TOP[kind];
    ctx.beginPath(); crowdLeft(ctx, x, y, s, kind, hy); crowdRight(ctx, x, y, s, kind, hy); ctx.closePath();
    ctx.fillStyle = i % 2 ? col : colNear; ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
    // the lit edge: from the ground up to the crown on the lamp's side, and a little way over it
    ctx.beginPath();
    if (F.key < 0) crowdLeft(ctx, x, y, s, kind, hy);
    else { ctx.moveTo(x + top[0] * s, hy + top[1] * s); crowdRight(ctx, x, y, s, kind, hy); }
    ctx.strokeStyle = speaking && i === 3 ? L.rim : rimC; ctx.lineWidth = speaking && i === 3 ? 6 : 4; ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

// ───────────────────────── the framed bust ─────────────────────────
const PORTRAIT_LIGHT = makeLight('#ffd9a0', -Math.PI * 0.76, { depth: 0.8, amb: '#221a3a' });
/**
 * A bust in a frame. (x, y) is the top-left corner of a size x size square.
 * The cabinet uses this too. `t` (seconds) is optional and only animates blinking and breath.
 */
export function drawPortrait(ctx, member, x, y, size, emote, talk, t = 0) {
  if (!member) throw new Error(`cinema: drawPortrait needs a cast member, got ${String(member)}`);
  const r = size * 0.1;
  const tone = member.color && /^#/.test(member.color) ? member.color : '#9a9a9a';
  ctx.save();
  ctx.beginPath(); rr(ctx, x, y, size, size, r);
  ctx.fillStyle = shade(tone, 0.62);
  ctx.fill();
  ctx.save();
  ctx.clip();
  // the member's colour, in two flat bands and one hard wedge of light from the lamp side
  ctx.fillStyle = shade(tone, 0.8); ctx.fillRect(x, y + size * 0.72, size, size * 0.28);
  ctx.fillStyle = alpha(tint(tone, 0.2), 0.42);
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + size * 0.62, y); ctx.lineTo(x + size * 0.2, y + size); ctx.lineTo(x, y + size); ctx.closePath(); ctx.fill();
  const hasFace = member.look && member.id !== 'narrator' && member.id !== 'crowd';
  if (hasFace) {
    const k = lookOf(member);
    const s = (size / 250) / (k.child ? 0.92 : 1);
    ctx.translate(x + size / 2, y + size * (k.child ? 0.92 : 0.97));
    ctx.scale(s, s);
    drawFigure(ctx, member, { emote, talk, focus: 1, light: PORTRAIT_LIGHT, facing: 1, gaze: 0.3, t, ink: clamp(0.4 / s, 1, 2.1) });
  } else if (member.id === 'narrator') {
    // The Ledger has no face: an open book
    const cx = x + size / 2, cyy = y + size * 0.56, w = size * 0.34, h = size * 0.42, lw = Math.max(1.2, size * 0.02);
    for (const sx of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(cx, cyy - h / 2 + size * 0.03); ctx.lineTo(cx + sx * w, cyy - h / 2); ctx.lineTo(cx + sx * w, cyy + h / 2); ctx.lineTo(cx, cyy + h / 2 + size * 0.03); ctx.closePath();
      ctx.fillStyle = sx < 0 ? PALETTE.cream : shade(PALETTE.cream, 0.28); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke();
      for (let i = 0; i < 4; i++) line(ctx, cx + sx * w * 0.16, cyy - h * 0.28 + i * h * 0.17, cx + sx * w * 0.84, cyy - h * 0.3 + i * h * 0.17, alpha(INK, 0.7), Math.max(1, size * 0.014));
    }
    line(ctx, cx, cyy - h / 2 + size * 0.03, cx, cyy + h / 2 + size * 0.03, PALETTE.crimson, Math.max(1.5, size * 0.024));
  } else {
    crowdRow(ctx, 3, x + size * 0.1, x + size * 1.0, y + size * 0.5, 4, size * 0.16, PALETTE.night, t, { hat: 0.5 });
  }
  ctx.restore();
  // brass frame, inked inside
  ctx.beginPath(); rr(ctx, x, y, size, size, r);
  ctx.lineWidth = Math.max(2, size * 0.035);
  ctx.strokeStyle = PALETTE.brass;
  ctx.stroke();
  const lw = ctx.lineWidth;
  ctx.beginPath(); rr(ctx, x + lw * 0.9, y + lw * 0.9, size - lw * 1.8, size - lw * 1.8, r * 0.7);
  ctx.lineWidth = Math.max(1, size * 0.012);
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();
}

/**
 * The box drawFigure may paint in, in figure units about the origin (the base of the neck): x in -half..half, y in top..bot.
 * The engine cuts its sprites of people standing still to this box, so whatever a figure paints outside it is lost
 * as soon as they stop moving. Widen it here if the drawing grows.
 */
export function spriteBounds(k, part) {
  if (!k.bounds) {
    // measured from the hair this look is drawn with, both ways round, then given room for the head's tilt and sway
    const acc = (b, x, y) => { if (Math.abs(x) > b.half) b.half = Math.abs(x); if (y < b.top) b.top = y; if (y > b.bot) b.bot = y; };
    const pts = (b, p) => { for (const q of p) { acc(b, q[0], q[1]); if (q.length === 4) acc(b, q[2], q[3]); } };
    const head = { half: k.hw + 16, top: CY - 70, bot: CY + k.chin + 24 }, back = { half: 0, top: 0, bot: 0 };
    for (const f of [-1, 1]) {
      const g = hairGeo(k, f);
      for (const p of g.top) pts(head, p);
      for (const p of g.locks) pts(head, p);
      if (g.front) pts(head, g.front);
      if (g.brim) pts(head, g.brim);
      if (g.pins) pts(head, g.pins);
      for (const p of g.back) pts(back, p);
      if (g.braid) { const b = g.braid.front ? head : back; acc(b, g.braid.x0, g.braid.y0); acc(b, g.braid.x1 + (g.braid.x1 < 0 ? -34 : 34), g.braid.y1 + 44); }
    }
    // head units -> figure units: larger than life about the pivot, then room to move
    const out = (b, mx, my) => ({ half: Math.ceil(b.half * k.hs + mx), top: Math.floor(PIVOT + (b.top - PIVOT) * k.hs - my), bot: Math.ceil(PIVOT + (b.bot - PIVOT) * k.hs + my + 12) });
    const h = out(head, 30, 16);
    const bk = back.half > 0 ? out(back, 30, 16) : { half: 0, top: -96, bot: 0 };
    k.bounds = { head: h, body: { half: Math.max(k.sw + 48, bk.half), top: Math.min(-96, bk.top), bot: 566 } };
  }
  return part === 'body' ? k.bounds.body : k.bounds.head;
}
