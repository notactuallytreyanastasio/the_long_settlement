// The cast, drawn: looks, faces, bodies, the crowd, the framed bust the cabinet uses.
// Part of the cinematic renderer: see ../cinema.js. Everything here paints into whatever context it is handed.
//
//   drawFigure(ctx, member, o)          one of the cast at the origin (neck base), o: { emote, talk, focus, light, facing, gaze, t, part?, still? }
//   drawPortrait(ctx, member, x, y, size, emote, talk, t)
//   drawCrowdFigures(ctx, light, t, speaking, level)
//   lookOf(member)                      the resolved look (sizes, colours) of a cast member
//   spriteBounds(k, part)               the box, in figure units about the origin, that drawFigure may paint in for part 'body' or 'head'.
//                                       The engine cuts its sprites of people standing still to this box: paint outside it and it is clipped.
import { TAU, clamp, lerp, mod, rnd, hashStr, rgb, css, rgba, mix, toner, fade, vgrad, hgrad, rect, circ, seg, poly, rr, glow, crowdRow } from './kit.js';

// ───────────────────────── the cast, drawn ─────────────────────────
const BUILDS = {
  slim: { sw: 116, hw: 53, neck: 21, s: 1 },
  broad: { sw: 156, hw: 59, neck: 28, s: 1.03 },
  small: { sw: 100, hw: 51, neck: 19, s: 0.9 },
};
const AGES = {
  child: { jaw: 0.6, lines: 0 },
  young: { jaw: 0.56, lines: 0 },
  mid: { jaw: 0.64, lines: 1 },
  old: { jaw: 0.69, lines: 2 },
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
const EMOTES = {
  neutral: { bi: 0, bo: 0, open: 1, low: 1, curve: 0.1, mo: 0, mw: 1, tilt: 0, blush: 0 },
  smile: { bi: -3, bo: -4, open: 0.8, low: 0.35, curve: 1, mo: 0.14, mw: 1.18, tilt: 0.03, blush: 0.5, teeth: 1 },
  grim: { bi: 5, bo: 0, open: 0.76, low: 0.85, curve: -0.42, mo: 0, mw: 0.9, tilt: -0.012, blush: 0 },
  shock: { bi: -11, bo: -9, open: 1.42, low: 1.3, curve: -0.05, mo: 0.55, mw: 0.7, tilt: 0, blush: 0 },
  tears: { bi: -10, bo: 4, open: 0.7, low: 0.75, curve: -0.55, mo: 0.06, mw: 0.94, tilt: 0.05, blush: 0.6, tears: 1 },
  anger: { bi: 10, bo: -6, open: 0.8, low: 0.75, curve: -0.68, mo: 0.2, mw: 1.06, tilt: -0.02, blush: 0.35, teeth: 1 },
  soft: { bi: -4, bo: 1, open: 0.86, low: 0.62, curve: 0.52, mo: 0, mw: 1, tilt: 0.04, blush: 0.3 },
};
function emoteOf(name) {
  if (name === undefined || name === null || name === '') return EMOTES.neutral;
  const e = EMOTES[name];
  if (!e) throw new Error(`cinema: unknown emote '${name}' (known: ${Object.keys(EMOTES).join(', ')})`);
  return e;
}

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
  k = {
    ...b, ...a, style: hit[0], mark, child,
    chin: child ? 65 : 73, eyeDy: child ? 6 : 0, drop: child ? 78 : 0,
    skin: L.skin, hair: L.hair, coat: L.coat, trim: L.trim, eyes: L.eyes || '#3a2a20',
    seed: hashStr(String(member.id)),
    eyeGap: 22.5 + rnd(hashStr(String(member.id)) * 91) * 4,
    eyeW: (child ? 1.14 : L.age === 'young' ? 1.0 : 0.93) + rnd(hashStr(String(member.id)) * 53) * 0.12,
    noseL: (child ? 0.62 : 0.85) + rnd(hashStr(String(member.id)) * 37) * (child ? 0.15 : 0.4),
    browW: (child ? 0.62 : 0.8) + rnd(hashStr(String(member.id)) * 29) * (child ? 0.2 : 0.5),
    mouthW: (child ? 0.78 : 0.92) + rnd(hashStr(String(member.id)) * 71) * (child ? 0.1 : 0.2),
    browUp: /(one|an|left|right) (eye)?brow (always |forever |permanently )?(raised|up|cocked|lifted)|cocked (eye)?brow/.test(mark) ? 7 : 0,
    has: (re) => re.test(mark),
    lid: /heavy-lidded|hooded eyes|half-closed/.test(mark) ? 0.8 : 1,
    smileBias: /half smil|always smil|faint smile/.test(mark) ? 0.32 : 0,
    averted: /never (quite )?meets the eye|averted|looks away/.test(mark),
    sweptBack: /swept back|slicked back|combed back/.test(mark),
  };
  _looks.set(member, k);
  return k;
}

function headPath(ctx, k, cy) {
  const hw = k.hw, jaw = hw * k.jaw;
  ctx.beginPath();
  ctx.moveTo(-hw, cy - 10);
  ctx.bezierCurveTo(-hw, cy - 80, hw, cy - 80, hw, cy - 10);
  const ch = k.chin;
  ctx.bezierCurveTo(hw, cy + 30, jaw, cy + ch - 9, 13, cy + ch);
  ctx.quadraticCurveTo(0, cy + ch + 4, -13, cy + ch);
  ctx.bezierCurveTo(-jaw, cy + ch - 9, -hw, cy + 30, -hw, cy - 10);
  ctx.closePath();
}
function torsoPath(ctx, k) {
  const sw = k.sw, n = k.neck;
  ctx.beginPath();
  ctx.moveTo(-n - 8, -16);
  ctx.quadraticCurveTo(-sw * 0.55, -4, -sw, 36);
  ctx.quadraticCurveTo(-sw - 16, 80, -sw - 12, 170);
  ctx.lineTo(-sw - 20, 560); ctx.lineTo(sw + 20, 560); ctx.lineTo(sw + 12, 170);
  ctx.quadraticCurveTo(sw + 16, 80, sw, 36);
  ctx.quadraticCurveTo(sw * 0.55, -4, n + 8, -16);
  ctx.closePath();
}
/** the hair mass that sits over the skull; vol lifts it, line is the hairline height, part skews it */
function capPath(ctx, hw, cy, vol, line, part) {
  ctx.beginPath();
  ctx.moveTo(-hw - 4, cy + 6);
  ctx.bezierCurveTo(-hw - 10, cy - 94 - vol, hw + 10, cy - 94 - vol, hw + 4, cy + 6);
  ctx.quadraticCurveTo(hw - 3, cy - 20, hw - 13, cy + line + 8);
  ctx.quadraticCurveTo(part * 0.5 + hw * 0.3, cy + line - 12, part, cy + line - 6);
  ctx.quadraticCurveTo(part * 0.5 - hw * 0.3, cy + line - 12, -hw + 13, cy + line + 8);
  ctx.quadraticCurveTo(-hw + 3, cy - 20, -hw - 4, cy + 6);
  ctx.closePath();
}

function hairBack(ctx, k, cy, f, col, colSh, scarfSh) {
  const hw = k.hw;
  ctx.fillStyle = colSh;
  switch (k.style) {
    case 'long':
      ctx.beginPath();
      ctx.moveTo(-hw - 9, cy - 20);
      ctx.bezierCurveTo(-hw - 16, cy - 104, hw + 16, cy - 104, hw + 9, cy - 20);
      if (k.sweptBack) {
        ctx.bezierCurveTo(hw + 16, cy + 30, hw + 14, cy + 80, hw - 6, cy + 104);
        ctx.lineTo(-hw + 6, cy + 104);
        ctx.bezierCurveTo(-hw - 14, cy + 80, -hw - 16, cy + 30, -hw - 9, cy - 20);
      } else {
        ctx.bezierCurveTo(hw + 24, cy + 50, hw + 34, cy + 120, hw + 22, cy + 190);
        ctx.lineTo(-hw - 22, cy + 190);
        ctx.bezierCurveTo(-hw - 34, cy + 120, -hw - 24, cy + 50, -hw - 9, cy - 20);
      }
      ctx.fill();
      break;
    case 'bob':
      ctx.beginPath();
      ctx.moveTo(-hw - 9, cy - 20);
      ctx.bezierCurveTo(-hw - 16, cy - 104, hw + 16, cy - 104, hw + 9, cy - 20);
      ctx.bezierCurveTo(hw + 22, cy + 30, hw + 20, cy + 66, hw - 4, cy + 74);
      ctx.lineTo(-hw + 4, cy + 74);
      ctx.bezierCurveTo(-hw - 20, cy + 66, -hw - 22, cy + 30, -hw - 9, cy - 20);
      ctx.fill();
      break;
    case 'bun':
      ctx.beginPath(); ctx.arc(-f * 8, cy - 80, 26, 0, TAU); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(-f * 8, cy - 80, 17, 0.4, 3.6); ctx.stroke();
      break;
    case 'tail':
      ctx.beginPath();
      ctx.moveTo(-f * hw * 0.5, cy + 6);
      ctx.quadraticCurveTo(-f * (hw + 40), cy + 56, -f * (hw + 16), cy + 160);
      ctx.quadraticCurveTo(-f * (hw - 4), cy + 96, -f * hw * 0.2, cy + 44);
      ctx.fill();
      break;
    case 'curls':
      for (let i = 0; i < 11; i++) {
        const ang = Math.PI + (i / 10) * Math.PI;
        const r = hw + 8 + rnd(k.seed * 50 + i) * 6;
        ctx.beginPath(); ctx.arc(Math.cos(ang) * r, cy - 16 + Math.sin(ang) * (r + 8), 19 + rnd(k.seed * 9 + i) * 6, 0, TAU); ctx.fill();
      }
      for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * (hw + 6), cy + 12, 17, 0, TAU); ctx.fill(); }
      break;
    case 'scarf':
      ctx.fillStyle = scarfSh;
      ctx.beginPath();
      ctx.moveTo(-hw - 8, cy - 10);
      ctx.bezierCurveTo(-hw - 14, cy - 100, hw + 14, cy - 100, hw + 8, cy - 10);
      ctx.bezierCurveTo(hw + 14, cy + 40, hw + 4, cy + 86, 20, cy + 100);
      ctx.lineTo(-20, cy + 100);
      ctx.bezierCurveTo(-hw - 4, cy + 86, -hw - 14, cy + 40, -hw - 8, cy - 10);
      ctx.fill();
      break;
    default:
      break;
  }
}

function hairFront(ctx, k, cy, f, col, colHi, tone) {
  const hw = k.hw;
  ctx.fillStyle = col;
  const hi = (vol) => {
    ctx.strokeStyle = colHi; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, cy - 4, hw + 2 + vol * 0.4, Math.PI * 1.18, Math.PI * 1.46); ctx.stroke();
    ctx.lineCap = 'butt';
  };
  switch (k.style) {
    case 'crop':
      capPath(ctx, hw, cy, k.lines >= 2 ? 5 : 9, k.lines >= 2 ? -42 : -35, -f * 6); ctx.fill(); hi(k.lines >= 2 ? 5 : 9);
      if (k.has(/cowlick|tuft/)) { // the bit at the crown that will not lie down
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(-f * 16, cy - 68); ctx.quadraticCurveTo(-f * 12, cy - 96, f * 10, cy - 94); ctx.quadraticCurveTo(-f * 2, cy - 86, f * 6, cy - 68); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-f * 30, cy - 64); ctx.quadraticCurveTo(-f * 32, cy - 86, -f * 14, cy - 90); ctx.quadraticCurveTo(-f * 21, cy - 80, -f * 14, cy - 64); ctx.fill();
      }
      break;
    case 'swept':
      capPath(ctx, hw, cy, 16, -33, -f * 22); ctx.fill();
      ctx.strokeStyle = colHi; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(-f * 22 + f * i * 5, cy - 46 - i * 5);
        ctx.quadraticCurveTo(f * 12, cy - 74 - i * 5, f * (hw - 8), cy - 40 - i * 7); ctx.stroke();
      }
      ctx.lineCap = 'butt';
      break;
    case 'long':
    case 'bob': {
      if (k.sweptBack) { // off the face, falling behind to the collar
        capPath(ctx, hw, cy, 15, -40, -f * 20); ctx.fill();
        ctx.strokeStyle = colHi; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-f * 20 + f * i * 6, cy - 50 - i * 5); ctx.quadraticCurveTo(f * 14, cy - 80 - i * 4, f * (hw - 4), cy - 36 - i * 8); ctx.stroke(); }
        ctx.lineCap = 'butt';
        break;
      }
      capPath(ctx, hw, cy, 11, k.style === 'bob' ? -27 : -34, -f * 10); ctx.fill();
      const end = k.style === 'bob' ? cy + 52 : cy + 92;
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sx * (hw + 4), cy - 30);
        ctx.quadraticCurveTo(sx * (hw + 12), cy + 20, sx * (hw + 4), end);
        ctx.quadraticCurveTo(sx * (hw - 10), cy + 30, sx * (hw - 12), cy - 30);
        ctx.fill();
      }
      hi(6);
      break;
    }
    case 'bun':
    case 'tail':
    case 'braid':
      capPath(ctx, hw, cy, 6, -39, 0); ctx.fill(); hi(6);
      if (k.style === 'braid') {
        const sx = -f;
        for (let i = 0; i < 9; i++) {
          ctx.fillStyle = i % 2 ? col : tone(mix(k.hair, '#000', 0.22));
          ctx.beginPath();
          ctx.ellipse(sx * (hw + 2 + i * 1.6) + (i % 2 ? 3 : -3), cy + 30 + i * 19, 10, 13, (i % 2 ? 0.5 : -0.5), 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = tone(k.trim);
        ctx.fillRect(sx * (hw + 16) - 7, cy + 30 + 9 * 19 - 8, 14, 7);
        if (k.has(/\bpen\b|quill/)) { seg(ctx, sx * (hw - 8), cy + 60, sx * (hw + 22), cy + 48, tone('#2a1c14'), 3.5); seg(ctx, sx * (hw + 22), cy + 48, sx * (hw + 28), cy + 45.5, tone('#c9a85a'), 2.5); }
      }
      break;
    case 'curls':
      capPath(ctx, hw, cy, 12, -36, 0); ctx.fill();
      for (let i = 0; i < 7; i++) {
        const u = i / 6;
        ctx.fillStyle = i % 2 ? col : tone(mix(k.hair, '#fff', 0.1));
        ctx.beginPath(); ctx.arc(lerp(-hw + 8, hw - 8, u), cy - 44 - Math.sin(u * Math.PI) * 12 + rnd(k.seed * 30 + i) * 6, 12 + rnd(k.seed * 20 + i) * 4, 0, TAU); ctx.fill();
      }
      break;
    case 'receding':
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sx * (hw + 5), cy + 12);
        ctx.quadraticCurveTo(sx * (hw + 9), cy - 44, sx * hw * 0.5, cy - 66);
        ctx.quadraticCurveTo(sx * (hw - 8), cy - 40, sx * (hw - 9), cy + 6);
        ctx.fill();
      }
      break;
    case 'bald':
      break;
    case 'scarf': {
      ctx.fillStyle = tone(k.hair);
      capPath(ctx, hw - 4, cy, -4, -40, 0); ctx.fill();
      const sc = tone(k.trim), scSh = tone(mix(k.trim, '#000', 0.3));
      ctx.fillStyle = sc;
      capPath(ctx, hw + 3, cy, 10, -46, 0); ctx.fill();
      for (const sx of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sx * (hw + 7), cy - 20);
        ctx.quadraticCurveTo(sx * (hw + 10), cy + 40, sx * 12, cy + 84);
        ctx.lineTo(sx * 4, cy + 76);
        ctx.quadraticCurveTo(sx * (hw - 8), cy + 40, sx * (hw - 9), cy - 20);
        ctx.fill();
      }
      ctx.fillStyle = scSh;
      ctx.beginPath(); ctx.ellipse(0, cy + 84, 13, 9, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = scSh; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, cy - 4, hw + 2, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      break;
    }
    case 'cap': {
      ctx.fillStyle = tone(k.hair);
      for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * (hw - 2), cy - 12, 9, 20, 0, 0, TAU); ctx.fill(); }
      ctx.fillStyle = tone(k.trim);
      capPath(ctx, hw + 2, cy, 8, -40, 0); ctx.fill();
      ctx.fillStyle = tone(mix(k.trim, '#000', 0.3));
      ctx.beginPath();
      ctx.moveTo(-hw - 5, cy - 22); ctx.quadraticCurveTo(0, cy - 58, hw + 5, cy - 22);
      ctx.lineTo(hw + 5, cy - 36); ctx.quadraticCurveTo(0, cy - 74, -hw - 5, cy - 36);
      ctx.closePath(); ctx.fill();
      break;
    }
    default:
      throw new Error(`cinema: hair style '${k.style}' has no painter`);
  }
}

function drawEye(ctx, ex, ey, sgn, E, blink, gaze, k, tone, f) {
  const open = E.open * blink, low = lerp(0.25, E.low, blink);
  const far = sgn === -f ? 0.92 : 1; // the eye on the far side of a turned head is a little narrower
  const w = 15 * far * k.eyeW;
  ctx.save();
  ctx.translate(ex, ey);
  ctx.beginPath();
  ctx.moveTo(-w, 1.5);
  ctx.quadraticCurveTo(0, -14 * open, w, 1.5);
  ctx.quadraticCurveTo(0, 10 * low, -w, 1.5);
  ctx.closePath();
  ctx.fillStyle = tone('#f4efe6');
  ctx.fill();
  ctx.save();
  ctx.clip();
  circ(ctx, gaze, -0.5, 7.6, tone(k.eyes));
  circ(ctx, gaze, -0.5, 3.6, '#0b0708');
  rect(ctx, -w, -16, w * 2, 7 + (1 - open) * 2, 'rgba(20,10,10,.22)'); // lid shadow on the white
  circ(ctx, gaze - 2.6, -3.4, 2, 'rgba(255,255,255,.92)');
  if (E.tears) circ(ctx, gaze + 3, 2.5, 1.4, 'rgba(255,255,255,.8)');
  ctx.restore();
  // upper lid and lash
  ctx.strokeStyle = tone(mix(k.hair, '#140a0a', 0.6)); ctx.lineWidth = 3.2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-w, 1.5); ctx.quadraticCurveTo(0, -14 * open, w, 1.5); ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(sgn * w, 1.5); ctx.lineTo(sgn * (w + 2.5), -0.5); ctx.stroke();
  ctx.strokeStyle = tone(mix(k.skin, '#3a1418', 0.45)); ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(-w * 0.8, 3); ctx.quadraticCurveTo(0, 10 * low + 0.5, w * 0.8, 3); ctx.stroke();
  // crease above the lid
  ctx.beginPath(); ctx.moveTo(-w * 0.8, -5 - 5 * open); ctx.quadraticCurveTo(0, -13 * open - 5, w * 0.85, -4 - 4 * open); ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.restore();
}

const BLINK = 0.13;   // seconds a blink lasts
export const breathOf = (k, t) => Math.sin(t * 1.25 + k.seed * 9) * 1.5;
export const blinking = (k, t) => mod(t + k.seed * 7, 3.6 + k.seed * 2) < BLINK;

/**
 * A half-figure in local units: origin at the base of the neck, head about 140 tall above it.
 * o: { emote, talk 0..1, focus 0..1, light {amb,rim,key}, facing -1|1, t seconds, gaze?,
 *      part?: 'body' (hair behind, torso, neck) | 'head' | undefined for both,
 *      still?: true holds the pose: no breath, no sway, eyes open. That is the pose a cached sprite is painted in }
 */
export function drawFigure(ctx, member, o) {
  const k = lookOf(member);
  const E0 = emoteOf(o.emote);
  const E = { ...E0, open: E0.open * k.lid, curve: E0.curve >= 0 ? Math.min(1, E0.curve + k.smileBias) : E0.curve };
  const tone = toner(o.light, o.focus);
  const t = o.t, f = o.facing >= 0 ? 1 : -1, talk = clamp(o.talk || 0);
  const key = o.light.key;
  const cy = -108, hw = k.hw;
  const still = o.still === true, part = o.part;
  if (part !== undefined && part !== 'body' && part !== 'head') throw new Error(`cinema: drawFigure part must be 'body' or 'head', got '${part}'`);
  const breathe = still ? 0 : breathOf(k, t);
  const skinSh = mix(k.skin, '#2a0f18', 0.34);
  const hairC = tone(k.hair), hairHi = tone(mix(k.hair, '#fff', 0.22)), hairSh = tone(mix(k.hair, '#000', 0.3));
  const coatC = tone(k.coat), coatSh = tone(mix(k.coat, '#000', 0.3)), coatHi = tone(mix(k.coat, '#fff', 0.14));
  const trimC = tone(k.trim), trimHi = tone(mix(k.trim, '#fff', 0.35));
  const rimA = 0.25 + 0.5 * o.focus;

  const headTf = () => {
    ctx.translate(f * 2, -talk * 1.4 + breathe * 0.4);
    ctx.rotate(E.tilt * f + (still ? 0 : Math.sin(t * 0.6 + k.seed * 5) * 0.012) + talk * Math.sin(t * 5 + k.seed) * 0.008);
    if (k.child) { // a short neck, and a skull that is round rather than long
      ctx.translate(0, 14 + cy + k.chin); ctx.scale(1.06, 0.88); ctx.translate(0, -(cy + k.chin));
    }
  };

  ctx.save();
  ctx.lineJoin = 'round';

  if (part !== 'head') {
    // hair that falls behind the shoulders
    ctx.save(); headTf(); hairBack(ctx, k, cy, f, hairC, hairSh, tone(mix(k.trim, '#000', 0.35))); ctx.restore();

    // ── torso ──
    ctx.save();
    ctx.translate(0, breathe * 0.5);
    torsoPath(ctx, k);
    ctx.fillStyle = vgrad(ctx, -20, 420, [[0, coatHi], [0.25, coatC], [1, coatSh]]);
    ctx.fill();
    ctx.save();
    ctx.clip();
    // far-side shadow, and the fall-off toward the waist
    ctx.fillStyle = hgrad(ctx, -key * k.sw, key * k.sw, [[0, 'rgba(0,0,0,.34)'], [0.6, 'rgba(0,0,0,0)']]);
    ctx.fillRect(-300, -40, 600, 640);
    // arm seams
    for (const sx of [-1, 1]) {
      ctx.strokeStyle = coatSh; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(sx * k.sw * 0.8, 66); ctx.quadraticCurveTo(sx * k.sw * 0.74, 200, sx * k.sw * 0.82, 560); ctx.stroke();
    }
    const n = k.neck;
    const shirt = tone(mix(k.coat, '#f1e8d6', 0.84));
    if (k.has(/robe|gown|stole|magistrat|judge/)) {
      // a gown: broad stole bands; white bands at the throat for the Benches
      for (const sx of [-1, 1]) {
        poly(ctx, [[sx * (n + 4), -16], [sx * (n + 44), 2], [sx * (n + 50), 560], [sx * (n + 6), 560]], trimC);
        seg(ctx, sx * (n + 44), 2, sx * (n + 50), 560, trimHi, 1.5);
      }
      poly(ctx, [[-n - 4, -18], [0, 34], [n + 4, -18]], shirt);
      if (k.has(/bands|magistrat|judge/)) {
        poly(ctx, [[-9, 10], [-13, 62], [-2, 62], [0, 20]], tone('#f4efe2'));
        poly(ctx, [[9, 10], [13, 62], [2, 62], [0, 20]], tone('#e9e2d2'));
      }
    } else if (k.has(/uniform|cadet|epaulet|tunic|officer|high[a-z ]{0,14}collar|buttoned to the throat/)) {
      // buttoned to the throat, with a standing collar
      seg(ctx, 0, -8, 0, 560, coatSh, 3);
      for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) circ(ctx, sx * 24, 36 + i * 56, 5.5, trimHi);
      poly(ctx, [[-n - 7, -30], [-n - 9, -6], [-3, 4], [-3, -22]], trimC);
      poly(ctx, [[n + 7, -30], [n + 9, -6], [3, 4], [3, -22]], trimC);
      if (k.has(/uniform|cadet|epaulet|officer/)) {
        for (const sx of [-1, 1]) {
          ctx.save(); ctx.translate(sx * k.sw * 0.7, 20); ctx.rotate(sx * 0.42);
          rr(ctx, -30, -9, 60, 18, 6); ctx.fillStyle = trimC; ctx.fill();
          seg(ctx, -24, 0, 24, 0, trimHi, 2);
          ctx.restore();
        }
      }
    } else if (k.has(/waistcoat|\bvest\b/)) {
      // shirtsleeves and a waistcoat
      ctx.fillStyle = shirt; ctx.fillRect(-300, -40, 600, 640);
      ctx.fillStyle = hgrad(ctx, -key * k.sw, key * k.sw, [[0, 'rgba(0,0,0,.3)'], [0.6, 'rgba(0,0,0,0)']]);
      ctx.fillRect(-300, -40, 600, 640);
      ctx.beginPath();
      ctx.moveTo(-n - 12, -18); ctx.lineTo(0, 96); ctx.lineTo(n + 12, -18);
      ctx.quadraticCurveTo(k.sw * 0.6, 4, k.sw * 0.7, 80); ctx.lineTo(k.sw * 0.78, 560); ctx.lineTo(-k.sw * 0.78, 560); ctx.lineTo(-k.sw * 0.7, 80);
      ctx.quadraticCurveTo(-k.sw * 0.6, 4, -n - 12, -18);
      ctx.closePath();
      ctx.fillStyle = coatC; ctx.fill();
      if (k.has(/check|plaid|tartan/)) {
        ctx.save(); ctx.clip();
        for (let i = -8; i <= 8; i++) { seg(ctx, i * 22, -40, i * 22 + 10, 560, rgba(mix(k.coat, '#000', 0.5), 0.5), 2); seg(ctx, -300, 20 + (i + 8) * 26, 300, 14 + (i + 8) * 26, rgba(mix(k.coat, '#fff', 0.5), 0.22), 2); }
        ctx.restore();
      }
      seg(ctx, -n - 12, -18, 0, 96, trimC, 3.5); seg(ctx, n + 12, -18, 0, 96, trimC, 3.5);
      seg(ctx, 0, 96, 0, 560, coatSh, 3);
      for (let i = 0; i < 5; i++) circ(ctx, 9, 124 + i * 50, 5, trimC);
      for (const sx of [-1, 1]) { ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx * k.sw * 0.86, 90); ctx.quadraticCurveTo(sx * k.sw * 0.98, 180, sx * k.sw * 0.9, 300); ctx.stroke(); }
    } else {
      // an open coat over a shirt
      poly(ctx, [[-n - 4, -18], [0, 64], [n + 4, -18]], shirt);
      for (const sx of [-1, 1]) {
        poly(ctx, [[sx * (n + 8), -20], [sx * k.sw * 0.44, 34], [sx * 5, 132], [0, 64]], sx === key ? coatHi : coatSh);
        seg(ctx, sx * (n + 6), -18, 0, 64, trimC, 3.5);
        seg(ctx, sx * k.sw * 0.44, 34, sx * 5, 132, coatSh, 2);
      }
      seg(ctx, 0, 132, 0, 560, coatSh, 3);
      for (let i = 0; i < 5; i++) circ(ctx, 9, 156 + i * 58, 5, trimC);
      if (k.has(/jersey|gansey|guernsey|knitted (jumper|sweater)|roll-?neck/)) {
        // a fisherman's jersey under the coat: ribbed, with a rolled neck
        const wool = tone(mix(k.trim, '#e8e2d2', 0.55)), woolSh = tone(mix(k.trim, '#3a3428', 0.5));
        poly(ctx, [[-n - 4, -18], [0, 64], [n + 4, -18]], wool);
        for (let i = -3; i <= 3; i++) seg(ctx, i * 7, -14, i * 5, 58 - Math.abs(i) * 17, woolSh, 1.3);
        ctx.fillStyle = wool; rr(ctx, -n - 7, -30, n * 2 + 14, 18, 8); ctx.fill();
        for (let i = -4; i <= 4; i++) seg(ctx, i * (n + 5) / 4.4, -29, i * (n + 5) / 4.4, -13, woolSh, 1.2);
      }
      if (k.has(/oilskin|sou'?wester|slicker|tarpaulin coat/)) {
        // oilskin: a storm collar turned up, a wet sheen along the shoulder, a toggle at the throat
        for (const sx of [-1, 1]) {
          poly(ctx, [[sx * (n + 6), -34], [sx * (n + 30), -8], [sx * k.sw * 0.5, 34], [sx * (n + 10), 6]], sx === key ? coatHi : coatC);
          ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(sx * k.sw * 0.5, 10); ctx.quadraticCurveTo(sx * k.sw * 0.86, 22, sx * (k.sw + 2), 90); ctx.stroke();
          ctx.lineCap = 'butt';
        }
        for (let i = 0; i < 4; i++) { rect(ctx, -4, 150 + i * 60, 26, 7, trimC); circ(ctx, 22, 153.5 + i * 60, 4.5, trimHi); }
        if (k.has(/patch/)) { ctx.save(); ctx.translate(-key * k.sw * 0.62, 150); ctx.rotate(0.14); rect(ctx, -22, -18, 44, 36, tone(mix(k.coat, '#6a5a3a', 0.45))); ctx.setLineDash([4, 3]); ctx.strokeStyle = trimC; ctx.lineWidth = 1.2; ctx.strokeRect(-19, -15, 38, 30); ctx.setLineDash([]); ctx.restore(); }
      }
    }
    if (k.has(/shawl/)) {
      // a knitted shawl across the shoulders
      const base = k.has(/red/) ? '#a8322a' : k.trim;
      const sh = tone(base), shD = tone(mix(base, '#000', 0.3));
      ctx.fillStyle = sh;
      ctx.beginPath();
      ctx.moveTo(-n - 10, -22); ctx.quadraticCurveTo(-k.sw * 0.6, -10, -k.sw - 20, 40); ctx.lineTo(-k.sw - 24, 190); ctx.quadraticCurveTo(-k.sw * 0.4, 150, 0, 100);
      ctx.quadraticCurveTo(k.sw * 0.4, 150, k.sw + 24, 190); ctx.lineTo(k.sw + 20, 40); ctx.quadraticCurveTo(k.sw * 0.6, -10, n + 10, -22); ctx.lineTo(0, 46); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = shD; ctx.lineWidth = 1.6;
      for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.moveTo(-k.sw - 24, 30 + i * 18); ctx.quadraticCurveTo(0, -30 + i * 20, k.sw + 24, 30 + i * 18); ctx.stroke(); }
      for (let i = 0; i < 14; i++) { const u = i / 13, x = lerp(-k.sw - 20, k.sw + 20, u), y = 190 - Math.sin(u * Math.PI) * 88; seg(ctx, x, y, x + (u - 0.5) * 8, y + 16, shD, 2.4); }
    }
    if (k.has(/apron/)) {
      const ap = tone(mix(k.trim, '#d9d0bd', 0.6));
      poly(ctx, [[-k.sw * 0.42, 74], [k.sw * 0.42, 74], [k.sw * 0.6, 560], [-k.sw * 0.6, 560]], ap);
      for (const sx of [-1, 1]) seg(ctx, sx * k.sw * 0.42, 74, sx * (n + 14), -8, ap, 7);
      seg(ctx, -k.sw * 0.42, 78, k.sw * 0.42, 78, 'rgba(0,0,0,.2)', 2);
    }
    if (k.has(/cravat|neckerchief|necktie|\btie\b/)) {
      poly(ctx, [[-n, -16], [n, -16], [9, 14], [14, 70], [0, 84], [-14, 70], [-9, 14]], trimC);
      seg(ctx, -9, 14, 9, 14, trimHi, 2);
    }
    if (k.has(/\bchain\b|medallion/)) {
      ctx.strokeStyle = tone('#d8b25a'); ctx.lineWidth = 5; ctx.setLineDash([7, 4]);
      ctx.beginPath(); ctx.moveTo(-k.sw * 0.62, 18); ctx.quadraticCurveTo(0, 190, k.sw * 0.62, 18); ctx.stroke();
      ctx.setLineDash([]);
      circ(ctx, 0, 106, 13, tone('#d8b25a')); circ(ctx, 0, 106, 7, tone('#8a6a24'));
    }
    if (k.has(/\bpin\b|badge|brooch|\bmedal\b|sigil|\btag\b/)) {
      circ(ctx, -key * k.sw * 0.4, 78, 8, trimHi);
      circ(ctx, -key * k.sw * 0.4, 78, 4, tone(mix(k.trim, '#000', 0.4)));
    }
    ctx.restore(); // torso clip
    // rim light along the lit shoulder
    ctx.strokeStyle = rgba(o.light.rim, rimA * 0.7); ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(key * (n + 10), -15); ctx.quadraticCurveTo(key * k.sw * 0.55, -4, key * k.sw, 36); ctx.quadraticCurveTo(key * (k.sw + 16), 80, key * (k.sw + 12), 170); ctx.stroke();
    ctx.restore(); // torso translate

    // ── neck ──
    ctx.save();
    ctx.translate(0, breathe * 0.45);
    ctx.fillStyle = tone(skinSh);
    ctx.beginPath();
    ctx.moveTo(-n, -70); ctx.lineTo(n, -70); ctx.lineTo(n + 3, -12); ctx.quadraticCurveTo(0, 6, -n - 3, -12); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = vgrad(ctx, -52, -14, [[0, 'rgba(20,6,10,.42)'], [1, 'rgba(20,6,10,0)']]);
    ctx.fillRect(-n - 2, -52, n * 2 + 4, 40);
    ctx.restore();

  }
  if (part !== 'body') {
    // ── head ──
    ctx.save();
    headTf();
    // ears
    const earOut = k.has(/ears? (that )?stick|jug ears|big ears/) ? 4 : k.child ? 1.5 : 0;
    for (const sx of [-1, 1]) {
      ctx.fillStyle = tone(sx === key ? k.skin : skinSh);
      ctx.beginPath(); ctx.ellipse(sx * (hw - 1 + earOut * 0.6), cy + 8 + k.eyeDy, 8 + earOut, 14 + earOut * 0.5, sx * (0.12 + earOut * 0.04), 0, TAU); ctx.fill();
      ctx.strokeStyle = tone(skinSh); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(sx * (hw + 1 + earOut * 0.6), cy + 8 + k.eyeDy, 5, sx > 0 ? -1.2 : Math.PI - 1.2, sx > 0 ? 1.2 : Math.PI + 1.2); ctx.stroke();
    }
    if (k.has(/earpiece|ear-piece|earbud|the line|listener/)) {
      const sx = -f;
      circ(ctx, sx * (hw + 1), cy + 9, 5.5, tone('#caa24a'));
      circ(ctx, sx * (hw + 1), cy + 9, 2.4, tone('#3a2a10'));
      seg(ctx, sx * (hw + 2), cy + 14, sx * (hw - 3), cy + 44, tone('#caa24a'), 1.6);
    }
    headPath(ctx, k, cy);
    ctx.fillStyle = tone(k.skin);
    ctx.fill();
    ctx.save();
    ctx.clip();
    // modelling: shadow on the far side, under the brow and under the lip; warmth in the cheeks
    ctx.fillStyle = hgrad(ctx, -key * hw, key * hw, [[0, rgba(skinSh, 0.85)], [0.42, rgba(skinSh, 0.25)], [0.7, rgba(skinSh, 0)]]);
    ctx.fillRect(-hw - 4, cy - 90, hw * 2 + 8, 180);
    ctx.fillStyle = vgrad(ctx, cy + 44, cy + 80, [[0, rgba(skinSh, 0)], [1, rgba(skinSh, 0.6)]]);
    ctx.fillRect(-hw, cy + 44, hw * 2, 40);
    const blushCol = o.emote === 'anger' ? '#c8402a' : '#e0705a';
    const weathered = k.has(/weather|wind-?burn|sea-?worn|leathery/);
    for (const sx of [-1, 1]) {
      glow(ctx, sx * 30 + f * 4, cy + 26 + k.eyeDy * 0.5, 26, blushCol, 0.1 + 0.26 * E.blush + (k.child ? 0.1 : 0) + (weathered ? 0.14 : 0));
      glow(ctx, sx * 24 + f * 4, cy - 4, 22, '#2a0f18', 0.2); // eye socket depth
    }
    if (k.has(/freckle/)) {
      for (let i = 0; i < 16; i++) circ(ctx, (rnd(k.seed * 40 + i) - 0.5) * 70 + f * 4, cy + 16 + rnd(k.seed * 60 + i) * 16, 1.3, rgba(skinSh, 0.7));
    }
    if (k.has(/stubble|unshaven/)) {
      ctx.fillStyle = rgba(mix(k.hair, k.skin, 0.3), 0.3);
      ctx.beginPath(); ctx.moveTo(-hw, cy + 20); ctx.quadraticCurveTo(0, cy + 44, hw, cy + 20); ctx.lineTo(hw, cy + 90); ctx.lineTo(-hw, cy + 90); ctx.fill();
    }
    ctx.restore(); // head clip

    const fx0 = f * 5; // features sit a little toward the way the head is turned
    if (k.has(/beard/)) {
      ctx.fillStyle = tone(mix(k.hair, '#000', 0.14));
      ctx.beginPath();
      ctx.moveTo(-hw + 1, cy + 6);
      ctx.bezierCurveTo(-hw + 2, cy + 50, -hw * k.jaw - 4, cy + 80, 0, cy + 90);
      ctx.bezierCurveTo(hw * k.jaw + 4, cy + 80, hw - 2, cy + 50, hw - 1, cy + 6);
      ctx.quadraticCurveTo(hw - 14, cy + 36, fx0 + 22, cy + 34);
      ctx.quadraticCurveTo(fx0, cy + 28, fx0 - 22, cy + 34);
      ctx.quadraticCurveTo(-hw + 14, cy + 36, -hw + 1, cy + 6);
      ctx.fill();
      ctx.fillStyle = tone(mix(k.skin, '#2a0f18', 0.2));
      ctx.beginPath(); ctx.ellipse(fx0, cy + 50, 17, 9, 0, 0, TAU); ctx.fill();
    }

    // age
    const lineCol = rgba(mix(k.skin, '#2a0f18', 0.6), 0.2 + 0.3 * clamp((rgb(k.skin)[0] - 120) / 100));
    if (k.lines >= 1) {
      ctx.strokeStyle = lineCol; ctx.lineWidth = 1.4;
      for (const sx of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(fx0 + sx * 13, cy + 28); ctx.quadraticCurveTo(fx0 + sx * 22, cy + 38, fx0 + sx * 21, cy + 50); ctx.stroke();
      }
    }
    if (weathered) { // a face that has been out in it: cheeks cut by the wind, a seam each side of the mouth
      ctx.strokeStyle = rgba(mix(k.skin, '#2a0f18', 0.6), 0.32); ctx.lineWidth = 1.4;
      for (const sx of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(fx0 + sx * 37, cy + 18); ctx.quadraticCurveTo(fx0 + sx * 43, cy + 34, fx0 + sx * 34, cy + 52); ctx.stroke();
      }
    }
    if (k.lines >= 2) {
      ctx.strokeStyle = lineCol; ctx.lineWidth = 1.3;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(fx0 - 26 + i * 3, cy - 36 - i * 8); ctx.quadraticCurveTo(fx0, cy - 40 - i * 8 + E.bi * 0.15, fx0 + 26 - i * 3, cy - 36 - i * 8); ctx.stroke(); }
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(fx0 + sx * 40, cy + 2 + i * 3); ctx.lineTo(fx0 + sx * 48, cy - 3 + i * 6); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(fx0 + sx * 12, cy + 15); ctx.quadraticCurveTo(fx0 + sx * 24, cy + 20, fx0 + sx * 35, cy + 13); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(fx0 + sx * 20, cy + 54); ctx.quadraticCurveTo(fx0 + sx * 25, cy + 62, fx0 + sx * 20, cy + 68); ctx.stroke();
      }
    }

    // eyes
    const bp = mod(t + k.seed * 7, 3.6 + k.seed * 2);
    const blink = !still && bp < BLINK ? 0.08 + Math.abs(bp - 0.065) / 0.065 * 0.5 : 1;
    const gaze = f * 2.4 * (o.gaze === undefined ? 1 : o.gaze) * (k.averted ? -1.3 : 1);
    const ey = cy + 2 + k.eyeDy;
    for (const sgn of [-1, 1]) drawEye(ctx, fx0 + sgn * k.eyeGap, ey, sgn, E, blink, gaze, k, tone, f);

    // brows
    ctx.strokeStyle = tone(mix(k.hair, '#1a0c0c', k.lines >= 2 ? 0.1 : 0.35));
    ctx.lineWidth = (k.lines >= 2 ? 5 : 5.5) * k.browW; ctx.lineCap = 'round';
    for (const sgn of [-1, 1]) {
      const ex = fx0 + sgn * k.eyeGap, by = cy - 19 + k.eyeDy * 0.7 - (E.open - 1) * 6 - (sgn === f ? k.browUp : 0);
      ctx.beginPath();
      ctx.moveTo(ex - sgn * 15, by + E.bi);
      ctx.quadraticCurveTo(ex + sgn * 2, by - 7 + (E.bi + E.bo) * 0.3, ex + sgn * 19, by + 3 + E.bo);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    if (E.bi >= 5) { // the knot between drawn brows
      ctx.strokeStyle = lineCol; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(fx0 - 4, cy - 26); ctx.lineTo(fx0 - 3, cy - 14); ctx.moveTo(fx0 + 4, cy - 26); ctx.lineTo(fx0 + 3, cy - 14); ctx.stroke();
    }

    // nose
    ctx.strokeStyle = tone(mix(k.skin, '#2a0f18', 0.42)); ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(fx0 + f * 3, cy + 6 + k.eyeDy * 2);
    ctx.quadraticCurveTo(fx0 + f * 10 * k.noseL, cy + 24, fx0 + f * 7 * k.noseL, cy + 30);
    ctx.quadraticCurveTo(fx0 + f * 2, cy + 34, fx0 - f * 4 * k.noseL, cy + 30);
    ctx.stroke();
    ctx.lineCap = 'butt';

    if (k.has(/moustache|mustache|whisker/)) {
      ctx.fillStyle = hairC;
      ctx.beginPath();
      ctx.moveTo(fx0, cy + 35);
      ctx.quadraticCurveTo(fx0 + 16, cy + 34, fx0 + 25, cy + 45);
      ctx.quadraticCurveTo(fx0 + 12, cy + 43, fx0, cy + 42);
      ctx.quadraticCurveTo(fx0 - 12, cy + 43, fx0 - 25, cy + 45);
      ctx.quadraticCurveTo(fx0 - 16, cy + 34, fx0, cy + 35);
      ctx.fill();
    }

    // mouth
    {
      const mx = fx0 + f * 1, my = cy + (k.child ? 45 : 47);
      const openA = clamp(E.mo + talk * 0.5 * (0.75 + 0.25 * Math.sin(t * 19 + k.seed * 4)), 0, 0.9);
      const w = 17 * E.mw * k.mouthW * (1 - talk * 0.08);
      const cornerY = my - E.curve * 6.5;
      const midY = my + E.curve * 6;
      const lip = tone(mix(k.skin, '#7a2228', 0.5));
      if (openA > 0.05) {
        ctx.beginPath();
        ctx.moveTo(mx - w, cornerY);
        ctx.quadraticCurveTo(mx, midY - openA * 6, mx + w, cornerY);
        ctx.quadraticCurveTo(mx, midY + openA * 34 + 3, mx - w, cornerY);
        ctx.closePath();
        ctx.fillStyle = '#2c0d12';
        ctx.fill();
        ctx.save();
        ctx.clip();
        if (E.teeth || openA > 0.22) rect(ctx, mx - w, Math.min(cornerY, midY) - 6, w * 2, 6.5 + openA * 6 + Math.abs(E.curve) * 3, tone('#efe8dc'));
        if (openA > 0.28) {
          ctx.fillStyle = tone('#a23a44');
          ctx.beginPath(); ctx.ellipse(mx, midY + openA * 30 + 4, w * 0.62, 7, 0, 0, TAU); ctx.fill();
        }
        ctx.restore();
        ctx.strokeStyle = lip; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(mx - w, cornerY); ctx.quadraticCurveTo(mx, midY - openA * 6, mx + w, cornerY); ctx.stroke();
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(mx - w * 0.9, cornerY + 1); ctx.quadraticCurveTo(mx, midY + openA * 34 + 4, mx + w * 0.9, cornerY + 1); ctx.stroke();
      } else {
        ctx.strokeStyle = tone(mix(k.skin, '#4a1218', 0.62)); ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(mx - w, cornerY); ctx.quadraticCurveTo(mx, midY + 2, mx + w, cornerY); ctx.stroke();
        ctx.strokeStyle = rgba(mix(k.skin, '#2a0f18', 0.5), 0.5); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(mx - w * 0.45, midY + 9); ctx.quadraticCurveTo(mx, midY + 12, mx + w * 0.45, midY + 9); ctx.stroke();
      }
      // corners
      ctx.strokeStyle = rgba(mix(k.skin, '#2a0f18', 0.6), 0.6); ctx.lineWidth = 1.6;
      for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(mx + sx * w, cornerY); ctx.lineTo(mx + sx * (w + 3), cornerY - E.curve * 2.5); ctx.stroke(); }
      ctx.lineCap = 'butt';
    }

    // tears
    if (E.tears) {
      for (const sgn of [-1, 1]) {
        const ex = fx0 + sgn * 24 + sgn * 4;
        const ph = mod(t * 0.35 + (sgn > 0 ? 0.45 : 0) + k.seed, 1);
        ctx.strokeStyle = 'rgba(210,235,255,.5)'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(ex, ey + 9); ctx.quadraticCurveTo(ex + sgn * 3, ey + 26, ex + sgn * 1, ey + 9 + 46 * Math.max(ph, 0.35)); ctx.stroke();
        ctx.lineCap = 'butt';
        const dy = ey + 10 + ph * 50;
        ctx.fillStyle = 'rgba(225,242,255,.9)';
        ctx.beginPath(); ctx.moveTo(ex + sgn, dy - 6); ctx.quadraticCurveTo(ex + sgn + 4.5, dy + 2, ex + sgn, dy + 4); ctx.quadraticCurveTo(ex + sgn - 4.5, dy + 2, ex + sgn, dy - 6); ctx.fill();
      }
    }

    if (k.has(/\bscars?\b/)) {
      ctx.strokeStyle = tone(mix(k.skin, '#fff', 0.3)); ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(fx0 - f * 34, cy - 34); ctx.lineTo(fx0 - f * 29, cy - 8); ctx.stroke();
      ctx.strokeStyle = rgba(skinSh, 0.8); ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) { const u = 0.2 + i * 0.3; ctx.beginPath(); ctx.moveTo(fx0 - f * lerp(34, 29, u) - 3, cy + lerp(-34, -8, u)); ctx.lineTo(fx0 - f * lerp(34, 29, u) + 3, cy + lerp(-34, -8, u) + 1); ctx.stroke(); }
      ctx.lineCap = 'butt';
    }
    if (k.has(/\bmole\b|beauty mark/)) circ(ctx, fx0 + f * 28, cy + 36, 2.2, tone(mix(k.skin, '#1a0808', 0.7)));

    hairFront(ctx, k, cy, f, hairC, hairHi, tone);
    if (k.has(/dust/)) { // salt in the hair and brows
      for (let i = 0; i < 26; i++) { const a = Math.PI * (1.08 + rnd(k.seed * 70 + i) * 0.84), r = hw * (0.72 + rnd(k.seed * 80 + i) * 0.36); circ(ctx, Math.cos(a) * r, cy - 6 + Math.sin(a) * (r + 14), 1.6 + rnd(i) * 1.6, 'rgba(240,244,248,.6)'); }
      for (const sgn of [-1, 1]) for (let i = 0; i < 4; i++) circ(ctx, fx0 + sgn * (k.eyeGap - 10 + i * 7), cy - 22 - (E.open - 1) * 6 + (i - 1.5) * (i - 1.5) - 2, 1.5, 'rgba(240,244,248,.6)');
    }
    if (k.has(/chalk/)) { ctx.save(); ctx.translate(f * (hw + 2), cy - 14); ctx.rotate(f * 0.5); rect(ctx, -3, -13, 6, 17, tone('#f1eee4')); ctx.restore(); }

    if (k.has(/spectacle|glasses|pince/)) {
      ctx.strokeStyle = tone('#c9a85a'); ctx.lineWidth = 2.4;
      for (const sgn of [-1, 1]) {
        ctx.fillStyle = 'rgba(200,225,240,.13)';
        ctx.beginPath(); ctx.ellipse(fx0 + sgn * 24, ey + 1, 19, 16, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(fx0 + sgn * 24, ey + 1, 14, Math.PI * 1.1, Math.PI * 1.4); ctx.stroke();
        ctx.strokeStyle = tone('#c9a85a'); ctx.lineWidth = 2.4;
      }
      ctx.beginPath(); ctx.moveTo(fx0 - 5, ey - 1); ctx.quadraticCurveTo(fx0, ey - 5, fx0 + 5, ey - 1); ctx.stroke();
      if (!k.has(/pince/)) { seg(ctx, fx0 - 43, ey - 2, -hw, ey - 5, tone('#c9a85a'), 2); seg(ctx, fx0 + 43, ey - 2, hw, ey - 5, tone('#c9a85a'), 2); }
    }
    if (k.has(/monocle/)) {
      ctx.strokeStyle = tone('#c9a85a'); ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.ellipse(fx0 + f * 24, ey + 1, 19, 17, 0, 0, TAU); ctx.stroke();
      ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(fx0 + f * 30, ey + 18); ctx.quadraticCurveTo(fx0 + f * 44, cy + 80, fx0 + f * 20, cy + 130); ctx.stroke();
    }
    if (k.has(/eye-?patch/)) {
      ctx.fillStyle = '#0d0b0c';
      ctx.beginPath(); ctx.ellipse(fx0 - f * 24, ey + 1, 20, 16, 0, 0, TAU); ctx.fill();
      seg(ctx, -hw, cy - 30, hw, cy + 14 * -f * f, '#0d0b0c', 3);
    }

    // rim light on the lit cheek and jaw
    ctx.save();
    ctx.beginPath(); ctx.rect(-hw - 4, cy - 24, hw * 2 + 8, 110); ctx.clip();
    headPath(ctx, k, cy);
    ctx.clip();
    ctx.strokeStyle = hgrad(ctx, key * hw, key * hw * 0.3, [[0, rgba(o.light.rim, rimA * 0.6)], [1, rgba(o.light.rim, 0)]]);
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.restore();
    if (k.style === 'bald' || k.style === 'receding') glow(ctx, key * 16, cy - 48, 26, '#ffffff', 0.12 + 0.1 * o.focus);

    ctx.restore(); // head
  }
  ctx.restore();
}

/** a nameless voice: three people who stay in the dark */
export function drawCrowdFigures(ctx, light, t, speaking, level) {
  const col = css(mix(light.amb, '#000', 0.45));
  const rim = rgba(light.rim, speaking ? 0.42 : 0.2);
  for (let i = 0; i < 8; i++) {
    const x = 40 + i * 172 + rnd(i * 3.3) * 50;
    const y = 400 + rnd(i * 5.1) * 26 + Math.sin(t * 1.1 + i * 2) * 2 - (speaking && i === 3 ? level * 5 : 0);
    const s = 0.6 + rnd(i * 7) * 0.14;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(x, y - 78 * s, 44 * s, 56 * s, 0, 0, TAU); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 24 * s, y - 30 * s); ctx.quadraticCurveTo(x - 90 * s, y - 10 * s, x - 124 * s, y + 40 * s);
    ctx.lineTo(x - 130 * s, 900); ctx.lineTo(x + 130 * s, 900); ctx.lineTo(x + 124 * s, y + 40 * s);
    ctx.quadraticCurveTo(x + 90 * s, y - 10 * s, x + 24 * s, y - 30 * s); ctx.fill();
    if (i % 2) { ctx.fillRect(x - 54 * s, y - 118 * s, 108 * s, 14 * s); ctx.fillRect(x - 36 * s, y - 140 * s, 72 * s, 26 * s); }
    ctx.strokeStyle = rim; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(x, y - 78 * s, 44 * s, 56 * s, 0, light.key > 0 ? -1.2 : Math.PI - 1.2, light.key > 0 ? 1.0 : Math.PI + 1.0); ctx.stroke();
  }
}

/**
 * A bust in a frame. (x, y) is the top-left corner of a size x size square.
 * The cabinet uses this too. `t` (seconds) is optional and only animates blinking and breath.
 */
export function drawPortrait(ctx, member, x, y, size, emote, talk, t = 0) {
  if (!member) throw new Error(`cinema: drawPortrait needs a cast member, got ${String(member)}`);
  const r = size * 0.1;
  ctx.save();
  rr(ctx, x, y, size, size, r);
  ctx.fillStyle = '#0c0a10';
  ctx.fill();
  ctx.save();
  ctx.clip();
  // the member's colour as a backdrop wash (drawn with fade so any css colour name works)
  fade(ctx, 0.5, () => { ctx.fillStyle = member.color; ctx.fillRect(x, y, size, size); });
  ctx.fillStyle = vgrad(ctx, y, y + size, [[0, 'rgba(10,8,14,.2)'], [1, 'rgba(6,4,8,.88)']]);
  ctx.fillRect(x, y, size, size);
  glow(ctx, x + size * 0.3, y + size * 0.3, size * 0.75, '#fff2d0', 0.16);
  const hasFace = member.look && member.id !== 'narrator' && member.id !== 'crowd';
  if (hasFace) {
    const s = (size / 232) / Math.max(lookOf(member).s, 0.88);
    ctx.translate(x + size / 2, y + size * 0.9);
    ctx.scale(s, s);
    drawFigure(ctx, member, { emote, talk, focus: 1, light: PORTRAIT_LIGHT, facing: 1, gaze: 0.3, t });
  } else if (member.id === 'narrator') {
    // The Ledger has no face: an open book
    const cx = x + size / 2, cyy = y + size * 0.56, w = size * 0.34, h = size * 0.42;
    for (const sx of [-1, 1]) {
      poly(ctx, [[cx, cyy - h / 2 + size * 0.03], [cx + sx * w, cyy - h / 2], [cx + sx * w, cyy + h / 2], [cx, cyy + h / 2 + size * 0.03]], sx < 0 ? '#e6d9b8' : '#d8c9a4');
      for (let i = 0; i < 5; i++) seg(ctx, cx + sx * w * 0.14, cyy - h * 0.3 + i * h * 0.15, cx + sx * w * 0.86, cyy - h * 0.32 + i * h * 0.15, 'rgba(60,40,30,.55)', Math.max(1, size * 0.012));
    }
    seg(ctx, cx, cyy - h / 2 + size * 0.03, cx, cyy + h / 2 + size * 0.03, '#7a2a22', Math.max(1.5, size * 0.02));
  } else {
    crowdRow(ctx, 3, x + size * 0.1, x + size * 1.0, y + size * 0.5, 4, size * 0.16, 'rgba(8,6,10,.9)', t, { hat: 0.5 });
  }
  ctx.restore();
  // brass frame
  rr(ctx, x, y, size, size, r);
  ctx.lineWidth = Math.max(2, size * 0.035);
  ctx.strokeStyle = '#b08a3e';
  ctx.stroke();
  rr(ctx, x + ctx.lineWidth * 0.9, y + ctx.lineWidth * 0.9, size - ctx.lineWidth * 1.8, size - ctx.lineWidth * 1.8, r * 0.7);
  ctx.lineWidth = Math.max(1, size * 0.008);
  ctx.strokeStyle = 'rgba(255,236,180,.5)';
  ctx.stroke();
  ctx.restore();
}
const PORTRAIT_LIGHT = { amb: '#1a1420', rim: '#ffe0a8', key: -1 };

/**
 * The box drawFigure may paint in, in figure units about the origin (the base of the neck): x in -half..half, y in top..bot.
 * The engine cuts its sprites of people standing still to this box, so whatever a figure paints outside it is lost
 * as soon as they stop moving. Widen it here if the drawing grows.
 */
export function spriteBounds(k, part) {
  return part === 'body' ? { half: k.sw + 44, top: -246, bot: 566 } : { half: k.hw + 58, top: -246, bot: 114 };
}
