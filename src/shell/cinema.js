// The cinematic renderer. Canvas 2D, logical 1280x800.
//
// When a cutscene runs the game leaves the machine and becomes a film: letterbox,
// painted backdrops, the cast on stage, subtitles. Everything here is drawn from
// vectors every frame; nothing is loaded.
//
//   drawCinema(ctx, content, game, fx)      the whole frame for game.cine
//   drawPortrait(ctx, member, x, y, size, emote, talk)   bust in a frame (cabinet uses it)
//   BACKDROPS                               every bg key implemented
//
// All transitions (backdrop dissolve, characters easing in and out, the camera
// moving between framings, the speaker stepping forward) are derived from
// (lines, index, lineT, t): the stage of line index-1 is the "from", the stage of
// line index is the "to", and lineT drives the blend. The only retained state is
// a per-cinematic cache of resolved stages, keyed by the identity of cine.lines
// (game.cine itself is a new object every tick in a pure core, its lines are not).
//
// Alpha discipline: nothing in this file assigns ctx.globalAlpha absolutely.
// Painters use rgba() colours or fade(), so a whole layer can be dissolved from
// outside.

const W = 1280;
const H = 800;
const TAU = Math.PI * 2;

// ───────────────────────── small maths ─────────────────────────
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => { k = clamp(k); return k * k * (3 - 2 * k); };
const mod = (a, n) => ((a % n) + n) % n;
/** deterministic hash noise in [0,1) */
function rnd(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}
const flick = (t, seed) => 0.82 + 0.12 * Math.sin(t * 7.3 + seed * 11) + 0.06 * Math.sin(t * 17.1 + seed * 5);

// ───────────────────────── colour ─────────────────────────
const _rgb = new Map();
function hsl2rgb(h, s, l) {
  h = mod(h, 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (u) => {
    u = mod(u, 1);
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
/** css colour string (or [r,g,b]) -> [r,g,b] */
function rgb(c) {
  if (Array.isArray(c)) return c;
  let v = _rgb.get(c);
  if (v) return v;
  if (typeof c !== 'string') throw new Error(`cinema: colour must be a css string, got ${String(c)}`);
  const s = c.trim();
  let m;
  if ((m = /^#([0-9a-f]{3})$/i.exec(s))) v = [...m[1]].map((h) => parseInt(h + h, 16));
  else if ((m = /^#([0-9a-f]{6})$/i.exec(s))) v = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  else if ((m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(s))) v = [+m[1], +m[2], +m[3]];
  else if ((m = /^hsla?\(\s*([\d.]+)(?:deg)?[,\s]+([\d.]+)%[,\s]+([\d.]+)%/i.exec(s))) v = hsl2rgb(+m[1], +m[2] / 100, +m[3] / 100);
  else throw new Error(`cinema: cannot parse colour '${c}' (use #rgb, #rrggbb, rgb() or hsl())`);
  _rgb.set(c, v);
  return v;
}
const css = (a) => `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})`;
function rgba(c, a) {
  const v = rgb(c);
  return `rgba(${v[0] | 0},${v[1] | 0},${v[2] | 0},${a < 0 ? 0 : a > 1 ? 1 : a})`;
}
/** -> [r,g,b] */
function mix(c1, c2, k) {
  const a = rgb(c1), b = rgb(c2);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}
/** Lighting for a figure: pull colours toward the scene's ambient, dim when not in focus. */
function toner(light, focus) {
  const A = rgb(light.amb);
  const a = 0.12 + 0.24 * (1 - focus);
  const d = 1 - 0.13 * (1 - focus);
  return (c) => {
    const v = rgb(c);
    return `rgb(${((v[0] + (A[0] - v[0]) * a) * d) | 0},${((v[1] + (A[1] - v[1]) * a) * d) | 0},${((v[2] + (A[2] - v[2]) * a) * d) | 0})`;
  };
}

// ───────────────────────── drawing primitives ─────────────────────────
function fade(ctx, a, fn) {
  if (a <= 0.003) return;
  const g = ctx.globalAlpha;
  ctx.globalAlpha = g * clamp(a);
  fn();
  ctx.globalAlpha = g;
}
function vgrad(ctx, y0, y1, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}
function hgrad(ctx, x0, x1, stops) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}
function fillAll(ctx, style) {
  ctx.fillStyle = style;
  ctx.fillRect(-260, -180, W + 520, H + 360);
}
function rect(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
function circ(ctx, x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
function seg(ctx, x0, y0, x1, y1, c, w) {
  ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
}
function poly(ctx, pts, c) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) i ? ctx.lineTo(pts[i][0], pts[i][1]) : ctx.moveTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  if (c) { ctx.fillStyle = c; ctx.fill(); }
}
function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function glow(ctx, x, y, r, c, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(c, a));
  g.addColorStop(0.45, rgba(c, a * 0.35));
  g.addColorStop(1, rgba(c, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
function wrapText(ctx, text, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const rows = [];
  let cur = '';
  for (const w of words) {
    const tryRow = cur ? cur + ' ' + w : w;
    if (cur && ctx.measureText(tryRow).width > maxW) { rows.push(cur); cur = w; } else cur = tryRow;
  }
  if (cur) rows.push(cur);
  return rows;
}

const FONT_UI = '"Avenir Next", "Segoe UI", "Helvetica Neue", system-ui, sans-serif';
const FONT_SERIF = 'Georgia, "Iowan Old Style", "Times New Roman", serif';
const FONT_SCRIPT = '"Snell Roundhand", "Apple Chancery", "Segoe Script", "Brush Script MT", cursive';
const FONT_MONO = '"SF Mono", Menlo, Consolas, monospace';

// ───────────────────────── shared scenery pieces ─────────────────────────
function stars(ctx, seed, n, yMax, t) {
  for (let i = 0; i < n; i++) {
    const x = rnd(seed + i * 1.37) * (W + 400) - 200;
    const y = rnd(seed * 2 + i * 2.11) * (yMax + 160) - 160;
    const a = 0.25 + 0.6 * rnd(seed * 3 + i) * (0.7 + 0.3 * Math.sin(t * (0.8 + rnd(i) * 2) + i));
    const s = rnd(seed * 5 + i * 3) < 0.12 ? 2.2 : 1.3;
    rect(ctx, x, y, s, s, `rgba(225,232,255,${a})`);
  }
}
function lantern(ctx, x, y, s, col, t, seed) {
  const sway = Math.sin(t * 1.1 + seed * 7) * 0.1 + Math.sin(t * 0.37 + seed * 3) * 0.05;
  const fl = flick(t, seed);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(sway);
  glow(ctx, 0, s * 1.3, s * 4.6, col, 0.34 * fl);
  seg(ctx, 0, 0, 0, s * 0.42, 'rgba(12,8,10,.85)', Math.max(1, s * 0.07));
  const g = ctx.createRadialGradient(0, s * 1.35, s * 0.1, 0, s * 1.3, s * 0.95);
  g.addColorStop(0, css(mix(col, '#fff6d8', 0.75 * fl)));
  g.addColorStop(0.55, css(mix(col, '#fff', 0.12)));
  g.addColorStop(1, css(mix(col, '#3a0c04', 0.35)));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, s * 1.3, s * 0.72, s * 0.9, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(60,20,8,.35)'; ctx.lineWidth = Math.max(0.6, s * 0.035);
  for (const k of [-0.42, 0, 0.42]) {
    ctx.beginPath(); ctx.ellipse(0, s * 1.3, s * 0.72 * Math.sqrt(1 - k * k * 0.9), s * 0.9, 0, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, s * (1.3 + k * 1.2), s * 0.72 * Math.sqrt(1 - k * k * 1.6), s * 0.1, 0, 0, Math.PI); ctx.stroke();
  }
  rect(ctx, -s * 0.3, s * 0.36, s * 0.6, s * 0.14, '#1a0e0a');
  rect(ctx, -s * 0.26, s * 2.14, s * 0.52, s * 0.12, '#1a0e0a');
  seg(ctx, 0, s * 2.26, Math.sin(t * 2 + seed) * s * 0.1, s * 2.8, css(mix(col, '#200', 0.3)), Math.max(1, s * 0.09));
  ctx.restore();
}
function lanternString(ctx, x0, y0, x1, y1, sag, n, s, cols, t, seed) {
  ctx.strokeStyle = 'rgba(10,8,12,.8)'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + sag * 2, x1, y1); ctx.stroke();
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    lantern(ctx, lerp(x0, x1, u), lerp(y0, y1, u) + sag * 4 * u * (1 - u), s * (0.85 + 0.3 * rnd(seed + i)), cols[(i + ((seed * 7) | 0)) % cols.length], t, seed + i * 1.9);
  }
}
function flame(ctx, x, y, s, t, seed) {
  const w = Math.sin(t * 9 + seed * 5) * 0.16 + Math.sin(t * 4.1 + seed) * 0.1;
  const h = 1 + 0.18 * Math.sin(t * 13 + seed * 3);
  glow(ctx, x, y - s * 0.6, s * 5.5, '#ff8a2a', 0.26 + 0.06 * Math.sin(t * 11 + seed));
  for (const [c, m] of [['#e8501a', 1], ['#ffa42e', 0.68], ['#fff0a8', 0.36]]) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.5 * m, y);
    ctx.quadraticCurveTo(x - s * 0.7 * m, y - s * 0.8 * m * h, x + s * w * m * 2, y - s * 1.9 * m * h);
    ctx.quadraticCurveTo(x + s * 0.7 * m, y - s * 0.8 * m * h, x + s * 0.5 * m, y);
    ctx.fill();
  }
}
function motes(ctx, seed, n, col, t, o) {
  const w = o.x1 - o.x0, h = o.y1 - o.y0;
  for (let i = 0; i < n; i++) {
    const d = rnd(seed + i * 1.7);
    const x = o.x0 + mod(rnd(seed * 3 + i) * w + t * (o.vx || 0) * (0.4 + d) + Math.sin(t * 0.8 + i) * (o.wob || 10), w);
    const y = o.y0 + mod(rnd(seed * 5 + i * 2.3) * h + t * (o.vy || 0) * (0.4 + d) + Math.cos(t * 0.6 + i * 2) * (o.wob || 10) * 0.5, h);
    const a = o.a * (0.35 + 0.65 * d) * (o.tw ? 0.55 + 0.45 * Math.sin(t * 2.2 + i * 3) : 1);
    const r = o.r * (0.5 + d);
    ctx.fillStyle = rgba(col, a);
    if (o.streak) ctx.fillRect(x, y, r * o.streak, Math.max(1, r * 0.5));
    else { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  }
}
function skyline(ctx, seed, x0, x1, base, hMin, hMax, wMin, wMax, col, win, t) {
  let x = x0, i = 0;
  while (x < x1) {
    const w = lerp(wMin, wMax, rnd(seed + i * 1.3));
    const h = lerp(hMin, hMax, Math.pow(rnd(seed * 2 + i * 2.1), 1.6));
    ctx.fillStyle = col;
    ctx.fillRect(x, base - h, w + 1, h + 2);
    const r = rnd(seed * 3 + i);
    if (r < 0.28) poly(ctx, [[x, base - h], [x + w / 2, base - h - w * 0.45], [x + w, base - h]], col);
    else if (r < 0.36) { ctx.beginPath(); ctx.arc(x + w / 2, base - h, w * 0.42, Math.PI, 0); ctx.fill(); }
    else if (r < 0.42) ctx.fillRect(x + w * 0.42, base - h - 22, 3, 22);
    if (win) {
      for (let wy = base - h + 6; wy < base - 5; wy += 9) {
        for (let wx = x + 4; wx < x + w - 4; wx += 8) {
          if (rnd(i * 31 + wx * 0.71 + wy * 1.31) < 0.3) rect(ctx, wx, wy, 3, 4, rgba(win, 0.45 + 0.35 * Math.sin(t * 0.6 + wx * 0.3 + wy)));
        }
      }
    }
    x += w; i++;
  }
}
function waterStreaks(ctx, seed, x0, x1, y0, y1, n, col, t, a = 0.5) {
  for (let i = 0; i < n; i++) {
    const d = rnd(seed + i * 1.9);
    const y = lerp(y0, y1, d * d);
    const w = (12 + rnd(seed * 2 + i) * 60) * (0.4 + d);
    const x = lerp(x0, x1, rnd(seed * 3 + i * 1.1)) + Math.sin(t * (0.5 + rnd(i) * 0.8) + i) * 14 * (0.3 + d);
    const al = a * (0.25 + 0.75 * rnd(seed * 7 + i)) * (0.55 + 0.45 * Math.sin(t * (1 + rnd(i * 3)) + i * 5));
    rect(ctx, x - w / 2, y, w, 1 + d * 2.2, rgba(col, al));
  }
}
/** a row of standing people as silhouettes: heads and shoulders, optional raised fists, signs, torches */
function crowdRow(ctx, seed, x0, x1, y, n, s, col, t, o = {}) {
  for (let i = 0; i < n; i++) {
    const x = lerp(x0, x1, (i + rnd(seed + i) * 0.8) / n);
    const bob = Math.sin(t * (1 + rnd(i + seed * 3) * 1.5) + i * 1.7) * s * 0.07 * (o.bob === undefined ? 1 : o.bob);
    const yy = y + rnd(seed * 2 + i) * s * 0.55 + bob;
    const r1 = rnd(i * 5 + seed);
    ctx.fillStyle = col;
    if (o.fists && r1 < o.fists) {
      const sd = rnd(i + seed * 9) < 0.5 ? -1 : 1;
      const up = 1 + 0.25 * Math.sin(t * 3 + i * 2.3);
      ctx.strokeStyle = col; ctx.lineWidth = s * 0.3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x + sd * s * 0.7, yy + s * 0.9); ctx.lineTo(x + sd * s * 0.95, yy - s * 0.9 * up); ctx.stroke();
      ctx.lineCap = 'butt';
      circ(ctx, x + sd * s * 0.95, yy - s * 0.9 * up - s * 0.12, s * 0.24, col);
    } else if (o.signs && r1 > 1 - o.signs) {
      const tilt = Math.sin(t * 1.3 + i) * 0.06 + (rnd(i * 3 + seed) - 0.5) * 0.3;
      ctx.save(); ctx.translate(x + s * 0.5, yy + s); ctx.rotate(tilt);
      rect(ctx, -s * 0.06, -s * 3.2, s * 0.12, s * 3.2, col);
      rect(ctx, -s * 0.9, -s * 4.1, s * 1.8, s * 1.1, o.signCol || col);
      if (o.signInk) { rect(ctx, -s * 0.65, -s * 3.85, s * 1.3, s * 0.12, o.signInk); rect(ctx, -s * 0.65, -s * 3.55, s * 0.9, s * 0.12, o.signInk); rect(ctx, -s * 0.65, -s * 3.27, s * 1.1, s * 0.12, o.signInk); }
      ctx.restore();
    } else if (o.torch && r1 > 0.5 && r1 < 0.5 + o.torch) {
      rect(ctx, x + s * 0.72, yy - s * 1.6, s * 0.12, s * 2.6, col);
      flame(ctx, x + s * 0.78, yy - s * 1.6, s * 0.5, t, seed + i);
      ctx.fillStyle = col;
    }
    ctx.beginPath(); ctx.arc(x, yy, s * 0.42, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, yy + s * 1.3, s * 0.88, s * 0.85, 0, 0, TAU); ctx.fill();
    ctx.fillRect(x - s * 0.88, yy + s * 1.3, s * 1.76, s * 3);
    if (o.hat && rnd(i * 7 + seed) < o.hat) { ctx.fillRect(x - s * 0.5, yy - s * 0.42, s * 1.0, s * 0.16); ctx.fillRect(x - s * 0.34, yy - s * 0.62, s * 0.68, s * 0.24); }
  }
}
/** the Mint's sigil: a balance */
function sigilScale(ctx, x, y, s, col, lw) {
  ctx.strokeStyle = col; ctx.lineWidth = lw || Math.max(1.5, s * 0.07); ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.lineTo(x, y + s);
  ctx.moveTo(x - s * 0.5, y + s); ctx.lineTo(x + s * 0.5, y + s);
  ctx.moveTo(x - s, y - s * 0.7); ctx.lineTo(x + s, y - s * 0.7);
  ctx.moveTo(x - s, y - s * 0.7); ctx.lineTo(x - s * 1.3, y); ctx.moveTo(x - s, y - s * 0.7); ctx.lineTo(x - s * 0.7, y);
  ctx.moveTo(x + s, y - s * 0.7); ctx.lineTo(x + s * 1.3, y); ctx.moveTo(x + s, y - s * 0.7); ctx.lineTo(x + s * 0.7, y);
  ctx.stroke();
  ctx.beginPath(); ctx.arc(x - s, y, s * 0.3, 0, Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.arc(x + s, y, s * 0.3, 0, Math.PI); ctx.stroke();
  ctx.lineCap = 'butt';
}
/** the Line's waveform, driven by voice level */
function waveform(ctx, x0, x1, y, amp, level, tms, col, lw) {
  const lv = 0.05 + clamp(level) * 0.95;
  ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let x = x0; x <= x1; x += 4) {
    const u = (x - x0) / (x1 - x0);
    const env = Math.pow(Math.sin(u * Math.PI), 0.8);
    const v = Math.sin(x * 0.045 + tms * 0.011) * 0.5 + Math.sin(x * 0.113 - tms * 0.019) * 0.3 + Math.sin(x * 0.271 + tms * 0.031) * 0.2;
    const yy = y + v * env * amp * lv;
    x === x0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
  }
  ctx.stroke();
}
function vignette(ctx, a) {
  const g = ctx.createRadialGradient(W / 2, H / 2, 300, W / 2, H / 2, 820);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// ───────────────────────── the cast, drawn ─────────────────────────
const BUILDS = {
  slim: { sw: 116, hw: 53, neck: 21, s: 1 },
  broad: { sw: 156, hw: 59, neck: 28, s: 1.03 },
  small: { sw: 100, hw: 51, neck: 19, s: 0.9 },
};
const AGES = {
  young: { jaw: 0.56, lines: 0 },
  mid: { jaw: 0.64, lines: 1 },
  old: { jaw: 0.69, lines: 2 },
};
// hairStyle is free-form in the contract; these are the shapes this renderer knows, matched by keyword.
const HAIR_STYLES = [
  ['bald', /bald|shaved|shaven/],
  ['receding', /reced|thin|tonsure|balding/],
  ['scarf', /scarf|kerchief|wrap|shawl|veil/],
  ['cap', /\bcap\b|hood|\bhat\b|beanie/],
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

const _looks = new WeakMap();
function lookOf(member) {
  let k = _looks.get(member);
  if (k) return k;
  const L = member.look;
  if (!L) throw new Error(`cinema: cast member '${member.id}' has no look`);
  const b = BUILDS[L.build];
  if (!b) throw new Error(`cinema: cast member '${member.id}' has unknown look.build '${L.build}' (slim, broad, small)`);
  const a = AGES[L.age];
  if (!a) throw new Error(`cinema: cast member '${member.id}' has unknown look.age '${L.age}' (young, mid, old)`);
  for (const f of ['skin', 'hair', 'coat', 'trim']) {
    if (!L[f]) throw new Error(`cinema: cast member '${member.id}' is missing look.${f}`);
    rgb(L[f]);
  }
  const hs = String(L.hairStyle === undefined ? '' : L.hairStyle).toLowerCase();
  const hit = HAIR_STYLES.find(([, re]) => re.test(hs));
  if (!hit) throw new Error(`cinema: cast member '${member.id}' has look.hairStyle '${L.hairStyle}' that matches no drawn style (${HAIR_STYLES.map((h) => h[0]).join(', ')})`);
  const mark = String(L.mark || '').toLowerCase();
  k = {
    ...b, ...a, style: hit[0], mark,
    skin: L.skin, hair: L.hair, coat: L.coat, trim: L.trim, eyes: L.eyes || '#3a2a20',
    seed: hashStr(String(member.id)),
    eyeGap: 22.5 + rnd(hashStr(String(member.id)) * 91) * 4,
    eyeW: (L.age === 'young' ? 1.0 : 0.93) + rnd(hashStr(String(member.id)) * 53) * 0.12,
    noseL: 0.85 + rnd(hashStr(String(member.id)) * 37) * 0.4,
    browW: 0.8 + rnd(hashStr(String(member.id)) * 29) * 0.5,
    mouthW: 0.92 + rnd(hashStr(String(member.id)) * 71) * 0.2,
    has: (re) => re.test(mark),
  };
  _looks.set(member, k);
  return k;
}

function headPath(ctx, k, cy) {
  const hw = k.hw, jaw = hw * k.jaw;
  ctx.beginPath();
  ctx.moveTo(-hw, cy - 10);
  ctx.bezierCurveTo(-hw, cy - 80, hw, cy - 80, hw, cy - 10);
  ctx.bezierCurveTo(hw, cy + 30, jaw, cy + 64, 13, cy + 73);
  ctx.quadraticCurveTo(0, cy + 77, -13, cy + 73);
  ctx.bezierCurveTo(-jaw, cy + 64, -hw, cy + 30, -hw, cy - 10);
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
      ctx.bezierCurveTo(hw + 24, cy + 50, hw + 34, cy + 120, hw + 22, cy + 190);
      ctx.lineTo(-hw - 22, cy + 190);
      ctx.bezierCurveTo(-hw - 34, cy + 120, -hw - 24, cy + 50, -hw - 9, cy - 20);
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
      capPath(ctx, hw, cy, 9, -35, -f * 6); ctx.fill(); hi(9);
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

/**
 * A half-figure in local units: origin at the base of the neck, head about 140 tall above it.
 * o: { emote, talk 0..1, focus 0..1, light {amb,rim,key}, facing -1|1, t seconds, bustOnly? }
 */
function drawFigure(ctx, member, o) {
  const k = lookOf(member);
  const E = emoteOf(o.emote);
  const tone = toner(o.light, o.focus);
  const t = o.t, f = o.facing >= 0 ? 1 : -1, talk = clamp(o.talk || 0);
  const key = o.light.key;
  const cy = -108, hw = k.hw;
  const breathe = Math.sin(t * 1.25 + k.seed * 9) * 1.5;
  const skinSh = mix(k.skin, '#2a0f18', 0.34);
  const hairC = tone(k.hair), hairHi = tone(mix(k.hair, '#fff', 0.22)), hairSh = tone(mix(k.hair, '#000', 0.3));
  const coatC = tone(k.coat), coatSh = tone(mix(k.coat, '#000', 0.3)), coatHi = tone(mix(k.coat, '#fff', 0.14));
  const trimC = tone(k.trim), trimHi = tone(mix(k.trim, '#fff', 0.35));
  const rimA = 0.25 + 0.5 * o.focus;

  const headTf = () => {
    ctx.translate(f * 2, -talk * 1.4 + breathe * 0.4);
    ctx.rotate(E.tilt * f + Math.sin(t * 0.6 + k.seed * 5) * 0.012 + talk * Math.sin(t * 5 + k.seed) * 0.008);
  };

  ctx.save();
  ctx.lineJoin = 'round';

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
    // a magistrate's gown: broad stole bands, white bands at the throat
    for (const sx of [-1, 1]) {
      poly(ctx, [[sx * (n + 4), -16], [sx * (n + 44), 2], [sx * (n + 50), 560], [sx * (n + 6), 560]], trimC);
      seg(ctx, sx * (n + 44), 2, sx * (n + 50), 560, trimHi, 1.5);
    }
    poly(ctx, [[-n - 4, -18], [0, 34], [n + 4, -18]], shirt);
    poly(ctx, [[-9, 10], [-13, 62], [-2, 62], [0, 20]], tone('#f4efe2'));
    poly(ctx, [[9, 10], [13, 62], [2, 62], [0, 20]], tone('#e9e2d2'));
  } else if (k.has(/uniform|cadet|epaulet|tunic|officer|commission/)) {
    // a buttoned tunic with a standing collar
    seg(ctx, 0, -8, 0, 560, coatSh, 3);
    for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) circ(ctx, sx * 24, 36 + i * 56, 5.5, trimHi);
    poly(ctx, [[-n - 7, -30], [-n - 9, -6], [-3, 4], [-3, -22]], trimC);
    poly(ctx, [[n + 7, -30], [n + 9, -6], [3, 4], [3, -22]], trimC);
    for (const sx of [-1, 1]) {
      ctx.save(); ctx.translate(sx * k.sw * 0.7, 20); ctx.rotate(sx * 0.42);
      rr(ctx, -30, -9, 60, 18, 6); ctx.fillStyle = trimC; ctx.fill();
      seg(ctx, -24, 0, 24, 0, trimHi, 2);
      ctx.restore();
    }
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
  if (k.has(/pin|badge|brooch|medal|sigil/)) {
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

  // ── head ──
  ctx.save();
  headTf();
  // ears
  for (const sx of [-1, 1]) {
    ctx.fillStyle = tone(sx === key ? k.skin : skinSh);
    ctx.beginPath(); ctx.ellipse(sx * (hw - 1), cy + 8, 8, 14, sx * 0.12, 0, TAU); ctx.fill();
    ctx.strokeStyle = tone(skinSh); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(sx * (hw + 1), cy + 8, 5, sx > 0 ? -1.2 : Math.PI - 1.2, sx > 0 ? 1.2 : Math.PI + 1.2); ctx.stroke();
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
  for (const sx of [-1, 1]) {
    glow(ctx, sx * 30 + f * 4, cy + 26, 26, blushCol, 0.1 + 0.26 * E.blush);
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
    ctx.fillStyle = hairC;
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
  const lineCol = rgba(mix(k.skin, '#2a0f18', 0.6), 0.5);
  if (k.lines >= 1) {
    ctx.strokeStyle = lineCol; ctx.lineWidth = 1.4;
    for (const sx of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(fx0 + sx * 13, cy + 28); ctx.quadraticCurveTo(fx0 + sx * 22, cy + 38, fx0 + sx * 21, cy + 50); ctx.stroke();
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
  const blink = bp < 0.13 ? 0.08 + Math.abs(bp - 0.065) / 0.065 * 0.5 : 1;
  const gaze = f * 2.4 * (o.gaze === undefined ? 1 : o.gaze);
  const ey = cy + 2;
  for (const sgn of [-1, 1]) drawEye(ctx, fx0 + sgn * k.eyeGap, ey, sgn, E, blink, gaze, k, tone, f);

  // brows
  ctx.strokeStyle = tone(mix(k.hair, '#1a0c0c', k.lines >= 2 ? 0.1 : 0.35));
  ctx.lineWidth = (k.lines >= 2 ? 5 : 5.5) * k.browW; ctx.lineCap = 'round';
  for (const sgn of [-1, 1]) {
    const ex = fx0 + sgn * k.eyeGap, by = cy - 19 - (E.open - 1) * 6;
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
  ctx.moveTo(fx0 + f * 3, cy + 6);
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
    const mx = fx0 + f * 1, my = cy + 47;
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

  if (k.has(/scar/)) {
    ctx.strokeStyle = tone(mix(k.skin, '#fff', 0.3)); ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(fx0 - f * 34, cy - 34); ctx.lineTo(fx0 - f * 29, cy - 8); ctx.stroke();
    ctx.strokeStyle = rgba(skinSh, 0.8); ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) { const u = 0.2 + i * 0.3; ctx.beginPath(); ctx.moveTo(fx0 - f * lerp(34, 29, u) - 3, cy + lerp(-34, -8, u)); ctx.lineTo(fx0 - f * lerp(34, 29, u) + 3, cy + lerp(-34, -8, u) + 1); ctx.stroke(); }
    ctx.lineCap = 'butt';
  }
  if (k.has(/mole|beauty/)) circ(ctx, fx0 + f * 28, cy + 36, 2.2, tone(mix(k.skin, '#1a0808', 0.7)));

  hairFront(ctx, k, cy, f, hairC, hairHi, tone);

  if (k.has(/spectacle|glasses|lens|pince/)) {
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
  if (k.has(/eyepatch|eye-patch|patch/)) {
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
  ctx.restore();
}

/** a nameless voice: three people who stay in the dark */
function drawCrowdFigures(ctx, light, t, speaking, level) {
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
    const s = (size / 232) / lookOf(member).s;
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

// ───────────────────────── backdrops ─────────────────────────
// Each backdrop is { light, back(ctx, t, px, info), front?(ctx, t, px, info) }.
//   t     seconds, continuous       px   parallax offset in pixels; layers multiply it by their depth
//   info  { tms, level, lineT, lines, index, portrait, portraitEmote }
// back is painted behind the cast, front (dust, embers, mist) over them. Painters cover
// x -260..1540, y -180..980 so the camera can move without showing an edge.
// light: amb tints the cast, rim is the edge light, key is the side the light comes from.
const X0 = -260, XW = 1800;
const P = Object.create(null);
function def(key, light, back, front) { P[key] = { light, back, front: front || null }; }
const LANTERN_COLS = ['#ff9a3c', '#ffc65a', '#ff6a3a', '#ffe2a0', '#e8503a', '#ffb04a', '#7fd6c8'];

def('black', { amb: '#0b0b10', rim: '#8c93a8', key: -1 }, (ctx) => { fillAll(ctx, '#000'); });

// ── ledger: narration over an open account book; the entry writes itself ──
function ledgerEntries(ctx, info, colW, maxRows) {
  // every consecutive narrator line up to the current one is an entry on the page
  let start = info.index;
  while (start > 0 && info.lines[start - 1].who === 'narrator') start--;
  let entries = [];
  for (let i = start; i <= info.index; i++) entries.push({ n: i - start + 1, rows: wrapText(ctx, info.lines[i].text, colW), text: info.lines[i].text, cur: i === info.index });
  let total = entries.reduce((s, e) => s + e.rows.length + 1, 0);
  while (total > maxRows && entries.length > 1) { total -= entries[0].rows.length + 1; entries = entries.slice(1); } // the page has been turned
  return entries;
}
def('ledger', { amb: '#2a1a0c', rim: '#ffcf8a', key: -1 }, (ctx, t, px, info) => {
  fillAll(ctx, vgrad(ctx, -180, 980, [[0, '#1d1009'], [1, '#0b0604']]));
  for (let i = 0; i < 30; i++) {
    const y = -150 + i * 40 + rnd(i) * 22;
    ctx.strokeStyle = `rgba(0,0,0,${0.12 + rnd(i * 3) * 0.2})`; ctx.lineWidth = 1 + rnd(i * 7) * 2;
    ctx.beginPath(); ctx.moveTo(X0, y); ctx.bezierCurveTo(300, y + rnd(i * 2) * 24 - 12, 900, y - rnd(i * 5) * 24 + 12, X0 + XW, y + 6); ctx.stroke();
  }
  const fl = flick(t, 1);
  const bx = 120 + px * 0.5, by = 78, bw = 1040, bh = 660, half = bw / 2;
  glow(ctx, 40 + px * 0.8, 120, 760, '#ffb45a', 0.3 * fl);
  // the book
  ctx.fillStyle = 'rgba(0,0,0,.55)'; rr(ctx, bx - 10, by + 14, bw + 44, bh + 30, 12); ctx.fill();
  ctx.fillStyle = '#3b1813'; rr(ctx, bx - 16, by - 12, bw + 32, bh + 28, 9); ctx.fill();
  ctx.strokeStyle = '#8a6a2e'; ctx.lineWidth = 1.5; rr(ctx, bx - 10, by - 6, bw + 20, bh + 16, 6); ctx.stroke();
  for (let i = 3; i >= 0; i--) { rect(ctx, bx - i * 2.2, by + i * 1.6, bw + i * 4.4, bh, i % 2 ? '#cbbb96' : '#b9a87f'); }
  ctx.fillStyle = hgrad(ctx, bx, bx + half, [[0, '#d9cba6'], [0.12, '#e9dcbb'], [0.86, '#e6d8b4'], [1, '#b39f78']]);
  ctx.fillRect(bx, by, half, bh);
  ctx.fillStyle = hgrad(ctx, bx + half, bx + bw, [[0, '#b7a37c'], [0.14, '#e8dbb9'], [0.9, '#eadfc0'], [1, '#d9cba6']]);
  ctx.fillRect(bx + half, by, half, bh);
  // foxing
  for (let i = 0; i < 26; i++) glow(ctx, bx + rnd(i * 3.3) * bw, by + rnd(i * 5.7) * bh, 8 + rnd(i) * 26, '#8a5a2a', 0.05 + rnd(i * 9) * 0.05);
  // rules, drawn by hand: not quite straight
  const top = by + 92, lh = 36, rows = 13, mL = 64, mR = 92;
  for (let side = 0; side < 2; side++) {
    const x0 = bx + side * half, xa = x0 + 22, xb = x0 + half - 22;
    for (let r = 0; r <= rows; r++) {
      const y = top + r * lh + 8;
      ctx.strokeStyle = 'rgba(64,104,150,.34)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(xa, y + rnd(r + side * 20) * 1.4); ctx.lineTo(xb, y + rnd(r * 3 + side * 9) * 1.4); ctx.stroke();
    }
    seg(ctx, xa, top - lh + 6, xb, top - lh + 7, 'rgba(120,30,30,.6)', 1.2);
    seg(ctx, xa, top - lh + 10, xb, top - lh + 11, 'rgba(120,30,30,.6)', 1.2);
    for (const vx of [x0 + mL, x0 + half - mR, x0 + half - mR + 4]) seg(ctx, vx, top - lh + 6, vx + 1, by + bh - 20, 'rgba(150,40,40,.5)', 1);
    ctx.fillStyle = 'rgba(70,40,30,.75)'; ctx.font = `600 11px ${FONT_SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('No.', x0 + mL / 2 + 10, top - lh + 1);
    ctx.fillText('PARTICULARS', x0 + (mL + half - mR) / 2, top - lh + 1);
    ctx.fillText(side ? 'OWED' : 'PAID', x0 + half - mR / 2 - 8, top - lh + 1);
  }
  ctx.fillStyle = 'rgba(50,24,20,.82)'; ctx.font = `28px ${FONT_SCRIPT}`; ctx.textAlign = 'center';
  ctx.fillText('Aurelle, in account with the Undertow', bx + half / 2, by + 36);
  ctx.fillText('The Long Settlement', bx + half * 1.5, by + 36);
  // the entries
  ctx.font = `25px ${FONT_SCRIPT}`; ctx.textAlign = 'left';
  const colW = half - mL - mR - 22;
  const entries = ledgerEntries(ctx, info, colW, rows * 2);
  const shown = revealCount(info.lines[info.index], info.lineT);
  let row = 0, pen = null;
  const at = (r) => ({ x: bx + (r >= rows ? half : 0) + mL + 12, y: top + (r % rows) * lh + 2, x0: bx + (r >= rows ? half : 0) });
  for (const e of entries) {
    let left = e.cur ? shown : Infinity;
    const p0 = at(row);
    if (row < rows * 2) {
      ctx.fillStyle = 'rgba(130,34,30,.85)'; ctx.font = `20px ${FONT_SCRIPT}`; ctx.textAlign = 'center';
      ctx.fillText(String(e.n) + '.', p0.x0 + mL / 2 + 10, p0.y);
      ctx.font = `25px ${FONT_SCRIPT}`; ctx.textAlign = 'left';
    }
    for (const rtxt of e.rows) {
      if (row >= rows * 2) break;
      const p = at(row);
      const part = left >= rtxt.length ? rtxt : rtxt.slice(0, Math.max(0, left));
      ctx.fillStyle = e.cur ? 'rgba(24,18,40,.94)' : 'rgba(40,30,52,.72)';
      if (part) ctx.fillText(part, p.x, p.y);
      if (e.cur && left < rtxt.length && left >= 0 && !pen) pen = { x: p.x + ctx.measureText(part).width, y: p.y };
      left -= rtxt.length + 1;
      row++;
    }
    if (!e.cur || shown >= e.text.length) {
      // a finished entry is ticked off in the money column
      const p = at(Math.min(row - 1, rows * 2 - 1));
      ctx.strokeStyle = 'rgba(130,34,30,.7)'; ctx.lineWidth = 1.8;
      const tx = p.x0 + half - mR / 2 - 8;
      ctx.beginPath(); ctx.moveTo(tx - 16, p.y - 8); ctx.lineTo(tx - 8, p.y); ctx.lineTo(tx + 12, p.y - 18); ctx.stroke();
    }
    row++;
  }
  // gutter shadow and ribbon
  ctx.fillStyle = hgrad(ctx, bx + half - 44, bx + half + 44, [[0, 'rgba(60,40,20,0)'], [0.5, 'rgba(40,24,12,.5)'], [1, 'rgba(60,40,20,0)']]);
  ctx.fillRect(bx + half - 44, by, 88, bh);
  ctx.fillStyle = '#7a1c22';
  ctx.beginPath(); ctx.moveTo(bx + half + 6, by - 6); ctx.bezierCurveTo(bx + half + 30, by + 200, bx + half - 12, by + 420, bx + half + 16, by + bh + 40); ctx.lineTo(bx + half + 30, by + bh + 40);
  ctx.bezierCurveTo(bx + half + 2, by + 420, bx + half + 44, by + 200, bx + half + 20, by - 6); ctx.fill();
  // the pen
  if (pen) {
    const jx = Math.sin(t * 23) * 1.2, jy = Math.cos(t * 31) * 1.2;
    ctx.save(); ctx.translate(pen.x + jx + 2, pen.y + jy + 2); ctx.rotate(-0.72);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(110, 34, 120, 9, 0.06, 0, TAU); ctx.fill();
    poly(ctx, [[0, 0], [22, -6], [26, 0], [22, 6]], '#c9a85a');
    seg(ctx, 2, 0, 20, 0, '#2a1c10', 1);
    ctx.fillStyle = hgrad(ctx, 24, 250, [[0, '#2c1a12'], [0.3, '#4a2a1a'], [1, '#1a0e0a']]);
    ctx.beginPath(); ctx.moveTo(24, -6); ctx.lineTo(250, -4); ctx.quadraticCurveTo(258, 0, 250, 4); ctx.lineTo(24, 6); ctx.closePath(); ctx.fill();
    rect(ctx, 24, -6.5, 14, 13, '#b08a3e');
    ctx.restore();
    circ(ctx, pen.x + 1, pen.y - 1, 2.2, 'rgba(24,18,40,.9)');
  }
  // candle and ink
  const cx = 44 + px * 0.9;
  rect(ctx, cx - 16, 250, 32, 320, '#d8ccb0'); rect(ctx, cx - 16, 250, 9, 320, '#b8aa8a');
  ctx.fillStyle = '#e8dcc0'; ctx.beginPath(); ctx.ellipse(cx, 250, 16, 6, 0, 0, TAU); ctx.fill();
  flame(ctx, cx, 246, 13, t, 2);
  fillAll(ctx, (() => { const g = ctx.createRadialGradient(360, 300, 200, 640, 400, 900); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.62)'); return g; })());
});

// ── line: the earpiece call ──
const LINE_LIGHT = { amb: '#06181c', rim: '#5fe0c8', key: -1 };
def('line', LINE_LIGHT, (ctx, t, px, info) => {
  fillAll(ctx, '#020b0d');
  const cx = 248 + px * 0.3, cy = 322;
  glow(ctx, cx, cy, 520, '#0f6a60', 0.3);
  for (let x = -256; x < 1540; x += 64) seg(ctx, x + px * 0.2, -180, x + px * 0.2, 980, 'rgba(70,220,196,.045)', 1);
  for (let y = -160; y < 980; y += 64) seg(ctx, X0, y, X0 + XW, y, 'rgba(70,220,196,.045)', 1);
  for (let i = 1; i <= 5; i++) {
    const r = 150 + i * 92 + mod(t * 26, 92);
    ctx.strokeStyle = `rgba(70,220,196,${0.11 * (1 - (r - 150) / 560)})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, r, -0.9, 0.9); ctx.stroke();
  }
  seg(ctx, 400, cy, 1340, cy, 'rgba(70,220,196,.16)', 1);
  waveform(ctx, 404, 1300, cy, 96, info.level * 0.8, info.tms * 1.31 + 900, 'rgba(70,220,196,.3)', 2);
  waveform(ctx, 404, 1300, cy, 170, info.level, info.tms, 'rgba(110,245,220,.95)', 3);
  for (let i = 0; i < 56; i++) {
    const h = 4 + (0.08 + info.level) * 46 * (0.3 + 0.7 * Math.abs(Math.sin(i * 0.9 + info.tms * 0.008 + rnd(i) * 6)));
    rect(ctx, 410 + i * 15, 520 - h, 9, h, `rgba(70,220,196,${0.22 + 0.3 * rnd(i * 3)})`);
  }
  // the voice on the other end
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, 128, 0, TAU);
  ctx.fillStyle = '#04171a'; ctx.fill();
  ctx.clip();
  glow(ctx, cx - 40, cy - 50, 190, '#2aa898', 0.3);
  if (info.portrait && info.portrait.look && info.portrait.id !== 'crowd' && info.portrait.id !== 'narrator') {
    ctx.translate(cx, cy + 118); ctx.scale(1.22, 1.22);
    drawFigure(ctx, info.portrait, { emote: info.portraitEmote, talk: info.level, focus: 0.8, light: LINE_LIGHT, facing: 1, gaze: 0.2, t });
  } else {
    ctx.strokeStyle = 'rgba(110,245,220,.7)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(cx, cy - 6, 44, Math.PI * 0.9, Math.PI * 2.1); ctx.stroke();
    circ(ctx, cx + 34, cy + 30, 16, 'rgba(110,245,220,.7)');
  }
  ctx.restore();
  for (let y = cy - 128; y < cy + 128; y += 4) rect(ctx, cx - 128, y, 256, 1, 'rgba(0,0,0,.16)');
  ctx.strokeStyle = '#b08a3e'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cx, cy, 130, 0, TAU); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,236,180,.55)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, cy, 136, 0, TAU); ctx.stroke();
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * TAU + t * 0.08, r0 = 144, r1 = i % 4 ? 150 : 158;
    seg(ctx, cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, 'rgba(110,245,220,.45)', 1.4);
  }
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = `600 15px ${FONT_MONO}`; ctx.fillStyle = 'rgba(110,245,220,.8)';
  ctx.fillText('THE LINE', 96 + px * 0.3, 118);
  ctx.font = `12px ${FONT_MONO}`; ctx.fillStyle = 'rgba(110,245,220,.5)';
  ctx.fillText('HALCYON SURETY  /  PROCTOR CHANNEL  /  SEALED', 96 + px * 0.3, 138);
  const s = Math.floor(t);
  ctx.textAlign = 'right';
  ctx.fillText(`${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}  CARRIER ${(412.5 + Math.sin(t * 0.7) * 0.2).toFixed(2)}`, 1196 + px * 0.3, 118);
  if (mod(t, 1.2) < 0.7) circ(ctx, 80 + px * 0.3, 113, 5, '#ff5a4a');
  ctx.textAlign = 'left';
  for (let y = -180; y < 980; y += 3) rect(ctx, X0, y, XW, 1, 'rgba(0,0,0,.14)');
});

// ── harbor-night: Vessery harbour, ten thousand paper lanterns ──
def('harbor-night', { amb: '#101a3c', rim: '#ffb968', key: 1 }, (ctx, t, px) => {
  fillAll(ctx, vgrad(ctx, -180, 452, [[0, '#050818'], [0.55, '#0f1d48'], [1, '#2b4470']]));
  stars(ctx, 1, 150, 380, t);
  const mx = 1010 + px * 0.05;
  glow(ctx, mx, 120, 260, '#b8c8ff', 0.22);
  circ(ctx, mx, 120, 32, '#e8ecff'); circ(ctx, mx - 9, 112, 7, 'rgba(180,190,230,.5)'); circ(ctx, mx + 10, 130, 5, 'rgba(180,190,230,.4)');
  // the lanterns let go: a slow river of them rising over the city
  for (let i = 0; i < 230; i++) {
    const d = rnd(i * 3.1);
    const x = mod(rnd(i) * 1800 + Math.sin(t * 0.3 + i) * 10 + px * (0.1 + d * 0.5) + t * (2 + d * 5), 1800) - 260;
    const y = 446 - mod(rnd(i * 7.7) * 640 + t * (5 + d * 13), 640);
    const fl = 0.7 + 0.3 * Math.sin(t * (3 + rnd(i * 5) * 4) + i);
    const r = 1.1 + d * 3.6;
    const col = LANTERN_COLS[i % 5];
    if (d > 0.72) glow(ctx, x, y, r * 6, col, 0.3 * fl);
    ctx.fillStyle = rgba(col, (0.35 + 0.65 * d) * fl);
    ctx.fillRect(x - r * 0.7, y - r, r * 1.4, r * 2);
  }
  // headland and the city across the water
  ctx.fillStyle = '#0a1230';
  ctx.beginPath(); ctx.moveTo(X0, 452); ctx.lineTo(X0, 380 + 0); ctx.bezierCurveTo(60 + px * 0.1, 330, 300 + px * 0.1, 400, 520 + px * 0.1, 430); ctx.lineTo(1540, 452); ctx.fill();
  skyline(ctx, 5, X0 + px * 0.15, 1560, 452, 18, 110, 18, 58, '#081028', '#ffcf7a', t);
  // the Mint hall dome
  const dx = 420 + px * 0.15;
  rect(ctx, dx - 70, 368, 140, 86, '#081028');
  ctx.fillStyle = '#081028'; ctx.beginPath(); ctx.arc(dx, 368, 56, Math.PI, 0); ctx.fill();
  rect(ctx, dx - 3, 286, 6, 30, '#081028');
  for (let i = 0; i < 7; i++) rect(ctx, dx - 58 + i * 18, 384, 8, 50, rgba('#ffcf7a', 0.55 + 0.2 * Math.sin(t + i)));
  glow(ctx, dx, 400, 150, '#ffb85c', 0.22);
  // water
  ctx.fillStyle = vgrad(ctx, 452, 800, [[0, '#122456'], [0.4, '#0a1436'], [1, '#04081a']]);
  ctx.fillRect(X0, 452, XW, 540);
  waterStreaks(ctx, 11, X0, 1540, 456, 800, 190, '#ffb85c', t, 0.6);
  waterStreaks(ctx, 13, mx - 120, mx + 120, 456, 760, 40, '#dfe6ff', t, 0.55);
  // boats carrying their own lights
  for (let b = 0; b < 6; b++) {
    const d = b / 5;
    const x = mod(160 + b * 263 + rnd(b * 9) * 120 + t * (3 + b) * (b % 2 ? 1 : -1), 1700) - 200 + px * (0.3 + d * 0.5);
    const y = 480 + d * 150 + Math.sin(t * 0.9 + b) * 2;
    const s = 0.5 + d * 0.9;
    ctx.fillStyle = '#060a18';
    ctx.beginPath(); ctx.moveTo(x - 44 * s, y); ctx.lineTo(x + 50 * s, y); ctx.lineTo(x + 36 * s, y + 13 * s); ctx.lineTo(x - 34 * s, y + 13 * s); ctx.fill();
    rect(ctx, x - 2 * s, y - 52 * s, 2.4 * s, 52 * s, '#060a18');
    for (let j = 0; j < 3; j++) lantern(ctx, x - 26 * s + j * 26 * s, y - (30 + (j % 2) * 14) * s, 6.5 * s, LANTERN_COLS[(b + j) % 5], t, b * 7 + j);
    for (let j = 0; j < 8; j++) rect(ctx, x - 30 * s + rnd(b + j * 3) * 60 * s + Math.sin(t * 2 + j + b) * 4, y + 18 * s + j * 7 * s, (26 - j * 2) * s, 2, rgba('#ffb85c', 0.42 - j * 0.045));
  }
  // near strings of lanterns across the quay
  lanternString(ctx, -220 + px * 0.9, -30, 620 + px * 0.9, 40, 80, 6, 19, LANTERN_COLS, t, 41);
  lanternString(ctx, 540 + px * 0.9, 50, 1500 + px * 0.9, -40, 90, 7, 19, LANTERN_COLS, t, 57);
  // quay rail
  rect(ctx, X0, 690, XW, 12, '#04060e');
  for (let i = 0; i < 16; i++) rect(ctx, -240 + i * 120 + px * 1.1, 690, 10, 300, '#04060e');
});

// ── lantern-stalls: the night market on the docks ──
function stall(ctx, x, y, w, t, seed, knocked) {
  ctx.save();
  ctx.translate(x, y);
  if (knocked) ctx.rotate(0.09);
  rect(ctx, 0, 0, 9, 250, '#120a08'); rect(ctx, w - 9, 0, 9, 250, '#120a08');
  // back shelves of unlit paper lanterns
  rect(ctx, 9, 40, w - 18, 150, '#1c100c');
  for (let r = 0; r < 2; r++) {
    rect(ctx, 9, 100 + r * 60, w - 18, 5, '#0d0705');
    for (let i = 0; i < Math.floor(w / 34); i++) {
      const c = LANTERN_COLS[(i + r * 2 + ((seed * 10) | 0)) % LANTERN_COLS.length];
      ctx.fillStyle = css(mix(c, '#1a0c08', 0.55));
      ctx.beginPath(); ctx.ellipse(28 + i * 34, 82 + r * 60, 11, 14, 0, 0, TAU); ctx.fill();
    }
  }
  // awning
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = i / n, b = (i + 1) / n;
    poly(ctx, [[lerp(14, w - 14, a), -34], [lerp(14, w - 14, b), -34], [lerp(-22, w + 22, b), 26], [lerp(-22, w + 22, a), 26]], i % 2 ? '#6a1c16' : '#c9b68a');
    ctx.fillStyle = i % 2 ? '#571410' : '#b09c70';
    ctx.beginPath(); ctx.arc(lerp(-22, w + 22, (a + b) / 2), 26, (w + 44) / n / 2, 0, Math.PI); ctx.fill();
  }
  ctx.fillStyle = vgrad(ctx, -34, 26, [[0, 'rgba(0,0,0,.45)'], [1, 'rgba(0,0,0,0)']]); ctx.fillRect(-22, -34, w + 44, 60);
  // lit lanterns for sale
  const m = Math.floor(w / 48);
  for (let i = 0; i < m; i++) {
    if (knocked && i % 2) continue;
    lantern(ctx, 30 + i * ((w - 60) / Math.max(1, m - 1)), 34 + (i % 2) * 12, 12, LANTERN_COLS[(i + ((seed * 13) | 0)) % LANTERN_COLS.length], t, seed + i * 3);
  }
  // counter
  ctx.fillStyle = vgrad(ctx, 190, 260, [[0, '#4a2c18'], [1, '#22120a']]); ctx.fillRect(-8, 190, w + 16, 70);
  rect(ctx, -12, 184, w + 24, 10, '#5c3a20');
  for (let i = 1; i < 6; i++) rect(ctx, -8 + (i * (w + 16)) / 6, 194, 2, 66, 'rgba(0,0,0,.3)');
  ctx.restore();
}
def('lantern-stalls', { amb: '#2a1408', rim: '#ffc46b', key: -1 }, (ctx, t, px) => {
  fillAll(ctx, vgrad(ctx, -180, 800, [[0, '#07081a'], [0.45, '#1f1024'], [1, '#2e1510']]));
  stars(ctx, 4, 60, 190, t);
  skyline(ctx, 9, X0 + px * 0.2, 1560, 440, 190, 350, 90, 170, '#150b12', '#ffb85c', t);
  glow(ctx, 640, 470, 760, '#ff8a2a', 0.22);
  lanternString(ctx, -160 + px * 0.3, 150, 700 + px * 0.3, 118, 46, 10, 8, LANTERN_COLS, t, 11);
  lanternString(ctx, 600 + px * 0.3, 104, 1440 + px * 0.3, 160, 56, 10, 8, LANTERN_COLS, t, 23);
  lanternString(ctx, -200 + px * 0.4, 230, 1500 + px * 0.4, 216, 40, 18, 7, LANTERN_COLS, t, 29);
  // ground
  ctx.fillStyle = vgrad(ctx, 520, 800, [[0, '#3a2012'], [1, '#0e0705']]); ctx.fillRect(X0, 520, XW, 480);
  for (let r = 0; r < 9; r++) {
    const y = 530 + r * r * 3.4 + r * 6, w = 34 + r * 9;
    for (let x = X0 + mod(px * (0.5 + r * 0.06) + (r % 2) * w * 0.5, w); x < 1540; x += w) {
      ctx.strokeStyle = `rgba(0,0,0,${0.18 + r * 0.02})`; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(x, y + 10, w * 0.52, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    }
  }
  // stalls
  for (let i = 0; i < 5; i++) stall(ctx, -200 + i * 350 + px * 0.55, 286, 280, t, i * 1.7 + 0.3, i === 1);
  // Nan's spilled lanterns, relit one by one
  for (let i = 0; i < 4; i++) {
    const x = 250 + i * 46 + px * 0.6, y = 566 + (i % 2) * 14;
    ctx.save(); ctx.translate(x, y); ctx.rotate(1.2 + i * 0.5);
    ctx.fillStyle = css(mix(LANTERN_COLS[i], '#1a0c08', i === 2 ? 0 : 0.5));
    ctx.beginPath(); ctx.ellipse(0, 0, 12, 15, 0, 0, TAU); ctx.fill();
    ctx.restore();
    if (i === 2) glow(ctx, x, y, 60, LANTERN_COLS[i], 0.4 * flick(t, i));
  }
  for (let i = 0; i < 5; i++) glow(ctx, -60 + i * 350 + px * 0.55, 560, 230, '#ffb85c', 0.16);
  // people passing, far
  crowdRow(ctx, 17, X0 + px * 0.45, 1540, 462, 11, 19, 'rgba(14,7,8,.9)', t, { hat: 0.4 });
}, (ctx, t, px) => {
  // out-of-focus lanterns hung close to the lens
  lanternString(ctx, -260 + px * 1.6, -70, 520 + px * 1.6, -40, 60, 3, 34, LANTERN_COLS, t, 71);
  lanternString(ctx, 800 + px * 1.6, -50, 1560 + px * 1.6, -80, 60, 3, 34, LANTERN_COLS, t, 83);
});

// ── drum-hall: the Mint hall and the great Reels ──
function reelGlyph(ctx, kind, x, y, s) {
  if (kind === 0) { // orb
    const g = ctx.createRadialGradient(x - s * 0.3, y - s * 0.3, s * 0.1, x, y, s);
    g.addColorStop(0, '#f4fbff'); g.addColorStop(0.5, '#7fc6e8'); g.addColorStop(1, '#1c4a78');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill();
  } else if (kind === 1) { // coin
    circ(ctx, x, y, s, '#d8b25a'); circ(ctx, x, y, s * 0.7, '#a8842e'); rect(ctx, x - s * 0.12, y - s * 0.45, s * 0.24, s * 0.9, '#e8d08a');
  } else if (kind === 2) { // crown
    poly(ctx, [[x - s, y + s * 0.6], [x - s, y - s * 0.5], [x - s * 0.45, y], [x, y - s * 0.8], [x + s * 0.45, y], [x + s, y - s * 0.5], [x + s, y + s * 0.6]], '#d8b25a');
  } else { // tide
    ctx.strokeStyle = '#3a8ab0'; ctx.lineWidth = s * 0.28;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x - s, y + i * s * 0.55); ctx.bezierCurveTo(x - s * 0.4, y + i * s * 0.55 - s * 0.5, x + s * 0.4, y + i * s * 0.55 + s * 0.5, x + s, y + i * s * 0.55); ctx.stroke(); }
  }
}
def('drum-hall', { amb: '#241a10', rim: '#ffe2a0', key: -1 }, (ctx, t, px) => {
  fillAll(ctx, vgrad(ctx, -180, 800, [[0, '#0d0906'], [0.5, '#2a1c10'], [1, '#170f09']]));
  // arcaded back wall
  for (let i = -1; i < 7; i++) {
    const x = -110 + i * 250 + px * 0.2;
    ctx.fillStyle = vgrad(ctx, 40, 560, [[0, '#17100a'], [1, '#3b2a18']]);
    ctx.beginPath(); ctx.moveTo(x, 580); ctx.lineTo(x, 170); ctx.arc(x + 85, 170, 85, Math.PI, 0); ctx.lineTo(x + 170, 580); ctx.fill();
    ctx.strokeStyle = 'rgba(216,178,90,.25)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, 580); ctx.lineTo(x, 170); ctx.arc(x + 85, 170, 85, Math.PI, 0); ctx.lineTo(x + 170, 580); ctx.stroke();
  }
  // banners of the Mint
  for (const bx of [118, 1162]) {
    const x = bx + px * 0.3, sw = Math.sin(t * 0.7 + bx) * 4;
    ctx.fillStyle = hgrad(ctx, x - 50, x + 50, [[0, '#123a2c'], [0.5, '#1c5a44'], [1, '#0e2c22']]);
    ctx.beginPath(); ctx.moveTo(x - 50, -180); ctx.lineTo(x + 50, -180); ctx.lineTo(x + 50 + sw, 400); ctx.lineTo(x + sw, 360); ctx.lineTo(x - 50 + sw, 400); ctx.fill();
    sigilScale(ctx, x + sw * 0.5, 200, 26, '#d8b25a', 3);
    ctx.strokeStyle = '#d8b25a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + sw * 0.5, 200, 44, 0, TAU); ctx.stroke();
  }
  // the Reels of Assay
  const cx = 640 + px * 0.35;
  glow(ctx, cx, 320, 520, '#ffcf7a', 0.2);
  ctx.fillStyle = hgrad(ctx, cx - 250, cx + 250, [[0, '#5a4018'], [0.2, '#c9a24a'], [0.5, '#f0d68a'], [0.8, '#b08a3a'], [1, '#4a3414']]);
  ctx.beginPath(); ctx.moveTo(cx - 240, 600); ctx.lineTo(cx - 240, 190); ctx.quadraticCurveTo(cx, 40, cx + 240, 190); ctx.lineTo(cx + 240, 600); ctx.fill();
  ctx.strokeStyle = '#3a280e'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(cx - 222, 600); ctx.lineTo(cx - 222, 198); ctx.quadraticCurveTo(cx, 62, cx + 222, 198); ctx.lineTo(cx + 222, 600); ctx.stroke();
  sigilScale(ctx, cx, 154, 20, '#3a280e', 3);
  for (let r = 0; r < 3; r++) {
    const x = cx - 186 + r * 128, y = 220, w = 116, h = 190;
    rect(ctx, x - 6, y - 6, w + 12, h + 12, '#2a1c0a');
    ctx.fillStyle = vgrad(ctx, y, y + h, [[0, '#6a6252'], [0.5, '#f4ecd6'], [1, '#6a6252']]); ctx.fillRect(x, y, w, h);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const off = mod(t * (10 + r * 4) + r * 37, 70);
    for (let j = -1; j < 4; j++) {
      const gy = y + j * 70 + off + 25;
      const kind = mod(Math.floor((t * (10 + r * 4) + r * 37) / 70) * -1 + j + r, 4);
      reelGlyph(ctx, kind, x + w / 2, gy, 22);
    }
    ctx.fillStyle = vgrad(ctx, y, y + h, [[0, 'rgba(0,0,0,.6)'], [0.3, 'rgba(0,0,0,0)'], [0.7, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.6)']]); ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
  seg(ctx, cx - 200, 315, cx + 200, 315, 'rgba(160,30,30,.55)', 2);
  rect(ctx, cx - 130, 440, 260, 46, '#2a1c0a');
  ctx.fillStyle = '#f0d68a'; ctx.font = `600 19px ${FONT_SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('REELS  OF  ASSAY', cx, 464);
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  // lever
  seg(ctx, cx + 240, 420, cx + 290, 420, '#8a6a2e', 12);
  seg(ctx, cx + 290, 420, cx + 300, 250, '#c9a24a', 9);
  circ(ctx, cx + 300, 244, 19, '#a82a22'); circ(ctx, cx + 294, 238, 6, 'rgba(255,255,255,.4)');
  // the drum of names, turning
  const dx = cx - 410, dy = 400, rot = t * 0.35;
  seg(ctx, dx - 70, 600, dx - 30, dy, '#3a280e', 9); seg(ctx, dx + 70, 600, dx + 30, dy, '#3a280e', 9);
  circ(ctx, dx, dy, 96, 'rgba(20,12,6,.7)');
  for (let i = 0; i < 26; i++) {
    const a = rot * 1.7 + i * 2.4, r = 20 + rnd(i * 3) * 62;
    ctx.save(); ctx.translate(dx + Math.cos(a) * r, dy + Math.sin(a) * r * 0.9); ctx.rotate(a * 2);
    rect(ctx, -9, -3, 18, 6, 'rgba(238,226,196,.85)');
    ctx.restore();
  }
  ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(dx, dy, 96, 0, TAU); ctx.stroke();
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const w = Math.abs(Math.cos(rot + (i * Math.PI) / 6)) * 96;
    ctx.beginPath(); ctx.ellipse(dx, dy, Math.max(1, w), 96, 0, 0, TAU); ctx.stroke();
  }
  circ(ctx, dx, dy, 8, '#f0d68a');
  // columns
  for (let i = -1; i < 7; i++) {
    const x = -160 + i * 250 + px * 0.5;
    if (Math.abs(x + 24 - cx) < 300) continue;
    ctx.fillStyle = hgrad(ctx, x, x + 50, [[0, '#2a1e12'], [0.35, '#6a543a'], [1, '#1c140c']]); ctx.fillRect(x, -180, 50, 790);
    rect(ctx, x - 9, 592, 68, 22, '#3a2c1c');
    for (let j = 1; j < 4; j++) rect(ctx, x + j * 12, -180, 2, 772, 'rgba(0,0,0,.22)');
  }
  // chandelier light
  for (const lx of [330, 950]) {
    const x = lx + px * 0.6;
    seg(ctx, x, -180, x, 40, '#1a120a', 3);
    for (let i = -2; i <= 2; i++) { flame(ctx, x + i * 22, 62 - Math.abs(i) * 6, 6, t, lx + i); rect(ctx, x + i * 22 - 3, 62 - Math.abs(i) * 6, 6, 12, '#e8dcc0'); }
    ctx.strokeStyle = '#8a6a2e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, 40, 48, 0.2, Math.PI - 0.2); ctx.stroke();
    poly(ctx, [[x - 40, 70], [x + 40, 70], [x + 300, 800], [x - 300, 800]], 'rgba(255,220,150,.035)');
  }
  // floor and the waiting crowd
  ctx.fillStyle = vgrad(ctx, 600, 800, [[0, '#3a2a1a'], [1, '#120c07']]); ctx.fillRect(X0, 600, XW, 400);
  for (let i = -8; i < 24; i++) seg(ctx, 640 + (i - 8) * 60 + px * 0.5, 600, 640 + (i - 8) * 190 + px * 0.9, 980, 'rgba(0,0,0,.25)', 1.5);
  crowdRow(ctx, 31, X0 + px * 0.7, 1540, 560, 30, 19, '#0c0806', t, { hat: 0.35, bob: 0.6 });
}, (ctx, t, px) => {
  // lots: slips of paper drifting down through the light
  for (let i = 0; i < 26; i++) {
    const d = rnd(i * 2.3);
    const x = mod(rnd(i) * 1500 + Math.sin(t * 0.7 + i) * 40 + px * 1.4, 1500) - 110;
    const y = mod(rnd(i * 5) * 800 + t * (26 + d * 30), 800) - 40;
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * (0.6 + d) + i);
    rect(ctx, -7, -2.5, 14, 5 * Math.abs(Math.cos(t * 2 + i)) + 1, `rgba(244,232,200,${0.25 + d * 0.4})`);
    ctx.restore();
  }
});

// ── bench: a magistrate's chamber, stacked files ──
function fileStack(ctx, x, y, w, n, seed) {
  const cols = ['#d9cba6', '#c9b68a', '#b8b4a0', '#a9b0b4', '#cfc0a0', '#bca47a'];
  for (let i = 0; i < n; i++) {
    const h = 7 + rnd(seed + i) * 6, off = (rnd(seed * 3 + i) - 0.5) * 12;
    y -= h;
    rect(ctx, x + off, y, w + (rnd(seed * 5 + i) - 0.5) * 14, h - 1, cols[Math.floor(rnd(seed * 7 + i) * cols.length)]);
    if (rnd(seed * 11 + i) < 0.4) rect(ctx, x + off + w * 0.3, y, 4, h - 1, '#a02a26');
  }
  return y;
}
def('bench', { amb: '#1c1610', rim: '#ffd9a0', key: 1 }, (ctx, t, px) => {
  fillAll(ctx, vgrad(ctx, -180, 800, [[0, '#1c140d'], [0.6, '#2c2015'], [1, '#150f0a']]));
  for (let i = -1; i < 12; i++) {
    const x = -220 + i * 160 + px * 0.2;
    ctx.strokeStyle = '#120c07'; ctx.lineWidth = 3; ctx.strokeRect(x + 12, 40, 136, 300); ctx.strokeRect(x + 12, 366, 136, 190);
    ctx.strokeStyle = 'rgba(255,220,160,.06)'; ctx.lineWidth = 1; ctx.strokeRect(x + 15, 43, 136, 300);
  }
  // window: the festival outside
  const wx = 96 + px * 0.25;
  rect(ctx, wx - 14, 40, 268, 440, '#0e0906');
  ctx.save(); ctx.beginPath(); ctx.rect(wx, 54, 240, 412); ctx.clip();
  ctx.fillStyle = vgrad(ctx, 54, 466, [[0, '#0a1230'], [1, '#2a3c68']]); ctx.fillRect(wx, 54, 240, 412);
  for (let i = 0; i < 46; i++) {
    const d = rnd(i * 3.7);
    const x = wx + rnd(i) * 240 + Math.sin(t * 0.4 + i) * 5 - px * 0.1;
    const y = 466 - mod(rnd(i * 5.3) * 420 + t * (6 + d * 12), 420);
    glow(ctx, x, y, 5 + d * 9, LANTERN_COLS[i % 5], 0.5);
  }
  skyline(ctx, 61, wx - 20 - px * 0.1, wx + 280, 466, 20, 90, 20, 50, '#070c20', '#ffcf7a', t);
  ctx.restore();
  rect(ctx, wx + 116, 54, 8, 412, '#0e0906'); rect(ctx, wx, 190, 240, 6, '#0e0906'); rect(ctx, wx, 330, 240, 6, '#0e0906');
  poly(ctx, [[wx, 466], [wx + 240, 466], [wx + 520, 980], [wx - 120, 980]], 'rgba(120,150,220,.05)');
  // the clock
  const kx = 440 + px * 0.25;
  rect(ctx, kx - 34, 70, 68, 300, '#22160d'); rect(ctx, kx - 40, 62, 80, 12, '#3a2614');
  circ(ctx, kx, 124, 27, '#e8dcc0'); circ(ctx, kx, 124, 2.5, '#1a100a');
  seg(ctx, kx, 124, kx + Math.sin(t * 0.02 + 1) * 13, 124 - Math.cos(t * 0.02 + 1) * 13, '#1a100a', 2.5);
  seg(ctx, kx, 124, kx + Math.sin(t * 0.3) * 20, 124 - Math.cos(t * 0.3) * 20, '#1a100a', 1.5);
  rect(ctx, kx - 24, 172, 48, 180, '#0d0806');
  const pa = Math.sin(t * 2.6) * 0.22;
  seg(ctx, kx, 174, kx + Math.sin(pa) * 150, 174 + Math.cos(pa) * 150, '#b08a3e', 2);
  circ(ctx, kx + Math.sin(pa) * 150, 174 + Math.cos(pa) * 150, 12, '#d8b25a');
  // shelves of files, floor to ceiling
  const sx0 = 560 + px * 0.3;
  rect(ctx, sx0 - 12, -180, 1100, 760, '#170f09');
  for (let r = 0; r < 6; r++) {
    const y = 76 + r * 100;
    rect(ctx, sx0 - 12, y, 1100, 9, '#3a2614');
    for (let c = 0; c < 9; c++) {
      const x = sx0 + c * 108 + rnd(r * 9 + c) * 16;
      if (rnd(r * 13 + c * 3) < 0.25) {
        // upright bundles
        for (let b = 0; b < 6; b++) {
          const h = 50 + rnd(r + c * 5 + b) * 34;
          rect(ctx, x + b * 14, y - h, 12, h, ['#b8a888', '#8a8f96', '#a89068', '#c4b89a'][Math.floor(rnd(r * 3 + c + b * 7) * 4)]);
          rect(ctx, x + b * 14, y - h * 0.6, 12, 3, '#8a2622');
        }
      } else fileStack(ctx, x, y, 84, 5 + Math.floor(rnd(r * 5 + c * 7) * 6), r * 17 + c);
    }
  }
  ctx.fillStyle = vgrad(ctx, -180, 580, [[0, 'rgba(0,0,0,.72)'], [0.55, 'rgba(0,0,0,.28)'], [1, 'rgba(0,0,0,.42)']]); ctx.fillRect(sx0 - 12, -180, 1100, 760);
  // the desk
  const dy = 566;
  ctx.fillStyle = vgrad(ctx, dy, 800, [[0, '#4a2e1a'], [0.12, '#2c1a0e'], [1, '#0e0806']]); ctx.fillRect(X0, dy, XW, 420);
  rect(ctx, X0, dy - 4, XW, 8, '#6a4426');
  // lamp
  const lx = 930 + px * 0.8;
  glow(ctx, lx, dy - 60, 420, '#ffd08a', 0.34 * flick(t, 3) + 0.1);
  seg(ctx, lx, dy, lx, dy - 96, '#8a6a2e', 6); rect(ctx, lx - 30, dy - 8, 60, 8, '#8a6a2e');
  ctx.fillStyle = hgrad(ctx, lx - 70, lx + 70, [[0, '#0f3a2a'], [0.5, '#2c8a62'], [1, '#0f3a2a']]);
  ctx.beginPath(); ctx.moveTo(lx - 44, dy - 132); ctx.lineTo(lx + 44, dy - 132); ctx.lineTo(lx + 72, dy - 92); ctx.lineTo(lx - 72, dy - 92); ctx.fill();
  rect(ctx, lx - 66, dy - 94, 132, 5, '#fff2c8');
  poly(ctx, [[lx - 70, dy - 90], [lx + 70, dy - 90], [lx + 260, dy + 4], [lx - 260, dy + 4]], 'rgba(255,225,160,.09)');
  // scales
  const bx = 330 + px * 0.8, tip = Math.sin(t * 0.8) * 0.05;
  seg(ctx, bx, dy, bx, dy - 150, '#b08a3e', 5); rect(ctx, bx - 30, dy - 8, 60, 8, '#8a6a2e');
  ctx.save(); ctx.translate(bx, dy - 146); ctx.rotate(tip);
  seg(ctx, -76, 0, 76, 0, '#d8b25a', 4);
  for (const s of [-1, 1]) {
    seg(ctx, s * 76, 0, s * 76 - 24, 66, '#b08a3e', 1.2); seg(ctx, s * 76, 0, s * 76 + 24, 66, '#b08a3e', 1.2);
    ctx.fillStyle = '#c9a24a'; ctx.beginPath(); ctx.arc(s * 76, 66, 26, 0, Math.PI); ctx.fill();
  }
  ctx.restore();
  circ(ctx, bx, dy - 150, 7, '#f0d68a');
  // files on the desk, nearest the lens
  fileStack(ctx, 40 + px * 0.9, dy, 150, 14, 3);
  fileStack(ctx, 520 + px * 0.9, dy, 130, 8, 9);
  fileStack(ctx, 1090 + px * 0.9, dy, 160, 19, 14);
  fileStack(ctx, -150 + px * 0.9, dy, 150, 22, 21);
}, (ctx, t, px) => {
  motes(ctx, 7, 46, '#ffe6b0', t, { x0: 560 + px, x1: 1300 + px, y0: 180, y1: 600, vx: 4, vy: -5, r: 1.6, a: 0.4, tw: 1 });
});

// ── pier-riot ──
def('pier-riot', { amb: '#240c0c', rim: '#ff7a3c', key: -1 }, (ctx, t, px) => {
  fillAll(ctx, vgrad(ctx, -180, 470, [[0, '#0c0408'], [0.6, '#3a0e10'], [1, '#b0421a']]));
  const fl = flick(t, 4);
  glow(ctx, 250 + px * 0.2, 440, 520, '#ff6a1a', 0.5 * fl);
  glow(ctx, 1080 + px * 0.2, 450, 300, '#ff8a2a', 0.3 * flick(t, 9));
  for (let i = 0; i < 16; i++) {
    const x = mod(rnd(i) * 1800 + t * (6 + rnd(i * 3) * 8), 1800) - 260, y = 60 + rnd(i * 5) * 300;
    ctx.fillStyle = `rgba(14,6,8,${0.2 + rnd(i * 7) * 0.2})`;
    ctx.beginPath(); ctx.ellipse(x, y, 130 + rnd(i * 9) * 150, 40 + rnd(i * 2) * 40, 0, 0, TAU); ctx.fill();
  }
  skyline(ctx, 21, X0 + px * 0.2, 1560, 470, 40, 150, 70, 150, '#12060a', '#ff8a3a', t);
  // cranes
  for (const cx of [170, 880, 1230]) {
    const x = cx + px * 0.25;
    ctx.strokeStyle = '#12060a'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(x - 22, 470); ctx.lineTo(x, 190); ctx.lineTo(x + 22, 470); ctx.moveTo(x, 200); ctx.lineTo(x + 150, 250); ctx.moveTo(x, 200); ctx.lineTo(x - 50, 230); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 140, 248); ctx.lineTo(x + 140 + Math.sin(t * 0.8 + cx) * 6, 380); ctx.stroke();
  }
  ctx.fillStyle = vgrad(ctx, 470, 800, [[0, '#4a1410'], [0.4, '#1c080c'], [1, '#07030a']]); ctx.fillRect(X0, 470, XW, 520);
  waterStreaks(ctx, 23, X0, 1540, 474, 800, 150, '#ff7a2a', t, 0.6);
  // the pier, running away from us
  const vx = 640 + px * 0.3;
  ctx.fillStyle = vgrad(ctx, 480, 800, [[0, '#2a1612'], [1, '#120a08']]);
  poly(ctx, [[vx - 150, 482], [vx + 150, 482], [1560, 980], [-280, 980]]); ctx.fill();
  for (let i = 0; i < 16; i++) { const y = 482 + i * i * 2.4 + i * 4; seg(ctx, X0, y, X0 + XW, y, 'rgba(0,0,0,.3)', 1 + i * 0.12); }
  ctx.fillStyle = vgrad(ctx, 470, 800, [[0, '#4a1410'], [0.4, '#1c080c'], [1, '#07030a']]);
  poly(ctx, [[vx - 150, 482], [-280, 980], [X0, 980], [X0, 482]]); ctx.fill();
  poly(ctx, [[vx + 150, 482], [1560, 980], [1560, 482]]); ctx.fill();
  waterStreaks(ctx, 27, X0, 380, 490, 800, 40, '#ff7a2a', t, 0.5);
  waterStreaks(ctx, 29, 900, 1540, 490, 800, 40, '#ff7a2a', t, 0.5);
  for (let i = 0; i < 6; i++) {
    const u = i / 5, e = u * u;
    for (const s of [-1, 1]) {
      const x = vx + s * lerp(150, 720, e), y = lerp(482, 760, e), h = lerp(26, 130, e);
      rect(ctx, x - h * 0.07, y - h, h * 0.14, h * 1.3, '#0c0606');
      if ((i + (s > 0 ? 1 : 0)) % 3 !== 0) lantern(ctx, x, y - h - h * 0.05, h * 0.11, LANTERN_COLS[i % 3], t, i * 3 + s);
    }
  }
  // the Compact on the boards
  crowdRow(ctx, 41, vx - 190, vx + 190, 470, 20, 9, '#0c0507', t, { fists: 0.3, torch: 0.1 });
  crowdRow(ctx, 43, vx - 420, vx + 420, 496, 24, 17, '#0a0406', t, { fists: 0.35, signs: 0.12, torch: 0.08, signCol: '#b8a888', signInk: '#3a0e10', hat: 0.4 });
  crowdRow(ctx, 47, X0 + px * 0.7, 1540, 548, 22, 30, '#070304', t, { fists: 0.3, signs: 0.14, torch: 0.06, signCol: '#cdbd98', signInk: '#3a0e10', hat: 0.4 });
}, (ctx, t, px) => {
  motes(ctx, 3, 70, '#ffb060', t, { x0: -100 + px, x1: 1400 + px, y0: 0, y1: 800, vx: 14, vy: -60, r: 2, a: 0.8, tw: 1, wob: 22 });
  for (let i = 0; i < 5; i++) {
    const x = mod(rnd(i * 3) * 1700 + t * 20, 1700) - 220;
    ctx.fillStyle = 'rgba(20,8,8,.14)'; ctx.beginPath(); ctx.ellipse(x, 120 + i * 130, 300, 70, 0, 0, TAU); ctx.fill();
  }
});

// ── mint-office: Corvane's panelled room ──
def('mint-office', { amb: '#1e120c', rim: '#ffb070', key: -1 }, (ctx, t, px) => {
  fillAll(ctx, vgrad(ctx, -180, 800, [[0, '#1a0a0c'], [0.5, '#34141a'], [1, '#1a0b0a']]));
  for (let i = -1; i < 9; i++) {
    const x = -230 + i * 230 + px * 0.2;
    ctx.strokeStyle = '#8a6a2e'; ctx.lineWidth = 2; ctx.strokeRect(x + 16, 30, 198, 410);
    ctx.strokeStyle = 'rgba(138,106,46,.5)'; ctx.lineWidth = 1; ctx.strokeRect(x + 28, 42, 174, 386);
  }
  ctx.fillStyle = vgrad(ctx, 470, 800, [[0, '#24120c'], [1, '#0e0705']]); ctx.fillRect(X0, 470, XW, 520);
  rect(ctx, X0, 466, XW, 7, '#8a6a2e'); rect(ctx, X0, 473, XW, 3, '#3a2610');
  // the seal of the Mint
  const sx = 640 + px * 0.2;
  glow(ctx, sx, 210, 240, '#d8b25a', 0.12);
  circ(ctx, sx, 210, 112, '#1c0c0e');
  ctx.strokeStyle = '#d8b25a'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(sx, 210, 112, 0, TAU); ctx.stroke();
  ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx, 210, 96, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(sx, 210, 70, 0, TAU); ctx.stroke();
  sigilScale(ctx, sx, 212, 40, '#d8b25a', 4);
  ctx.save(); ctx.translate(sx, 210); ctx.fillStyle = '#d8b25a'; ctx.font = `600 15px ${FONT_SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const motto = 'PAYABLE · IN · STILLNESS · MINT · OF · AURELLE · ';
  for (let i = 0; i < motto.length; i++) { ctx.save(); ctx.rotate((i / motto.length) * TAU - Math.PI / 2); ctx.fillText(motto[i], 0, -83); ctx.restore(); }
  ctx.restore(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  // window on the harbour
  const wx = 900 + px * 0.3;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(wx, 470); ctx.lineTo(wx, 190); ctx.arc(wx + 130, 190, 130, Math.PI, 0); ctx.lineTo(wx + 260, 470); ctx.closePath();
  ctx.fillStyle = '#0c0606'; ctx.fill(); ctx.clip();
  ctx.fillStyle = vgrad(ctx, 60, 470, [[0, '#070b20'], [1, '#27406c']]); ctx.fillRect(wx, 50, 260, 420);
  for (let i = 0; i < 40; i++) {
    const d = rnd(i * 3.3), x = wx + rnd(i) * 260 + Math.sin(t * 0.4 + i) * 4 - px * 0.12, y = 470 - mod(rnd(i * 5) * 420 + t * (5 + d * 10), 420);
    glow(ctx, x, y, 4 + d * 8, LANTERN_COLS[i % 5], 0.5);
  }
  skyline(ctx, 71, wx - 30 - px * 0.12, wx + 300, 440, 14, 70, 16, 40, '#060a1c', '#ffcf7a', t);
  rect(ctx, wx, 440, 260, 30, '#0a1230');
  waterStreaks(ctx, 73, wx, wx + 260, 442, 470, 14, '#ffb85c', t, 0.6);
  ctx.restore();
  ctx.strokeStyle = '#1a0c08'; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(wx, 470); ctx.lineTo(wx, 190); ctx.arc(wx + 130, 190, 130, Math.PI, 0); ctx.lineTo(wx + 260, 470); ctx.moveTo(wx + 130, 60); ctx.lineTo(wx + 130, 470); ctx.moveTo(wx, 300); ctx.lineTo(wx + 260, 300); ctx.stroke();
  for (const s of [0, 1]) { // velvet
    const x = wx + (s ? 228 : -46);
    ctx.fillStyle = hgrad(ctx, x, x + 78, [[0, '#0e2a20'], [0.3, '#1c5440'], [0.6, '#0e2a20'], [0.85, '#1a4a38'], [1, '#0a1e17']]);
    ctx.beginPath(); ctx.moveTo(x, 30); ctx.lineTo(x + 78, 30); ctx.quadraticCurveTo(x + 70 + Math.sin(t * 0.6 + s) * 3, 300, x + 90, 600); ctx.lineTo(x - 12, 600); ctx.quadraticCurveTo(x + 8, 300, x, 30); ctx.fill();
  }
  rect(ctx, wx - 70, 22, 400, 14, '#8a6a2e');
  // fireplace
  const fx = 210 + px * 0.3;
  rect(ctx, fx - 150, 250, 300, 230, '#3c3430'); rect(ctx, fx - 170, 236, 340, 22, '#57504a');
  rect(ctx, fx - 96, 310, 192, 170, '#080405');
  glow(ctx, fx, 440, 380, '#ff7a2a', 0.26 * flick(t, 5) + 0.06);
  for (let i = -1; i <= 1; i++) flame(ctx, fx + i * 44, 474, 30 - Math.abs(i) * 6, t, 5 + i);
  seg(ctx, fx - 80, 470, fx + 80, 462, '#1a0c06', 12); seg(ctx, fx - 60, 458, fx + 70, 474, '#24100a', 10);
  // a founder, in oils
  rect(ctx, fx - 92, 30, 184, 190, '#8a6a2e'); rect(ctx, fx - 80, 42, 160, 166, '#140c0c');
  ctx.fillStyle = '#2a1c1a'; ctx.beginPath(); ctx.ellipse(fx, 108, 30, 38, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(fx - 70, 208); ctx.quadraticCurveTo(fx - 60, 150, fx, 146); ctx.quadraticCurveTo(fx + 60, 150, fx + 70, 208); ctx.fill();
  glow(ctx, fx - 10, 100, 60, '#c9a880', 0.16);
  // mantel clock
  rect(ctx, fx - 22, 196, 44, 40, '#2a1a0e'); circ(ctx, fx, 214, 14, '#e8dcc0');
  seg(ctx, fx, 214, fx + Math.sin(t * 0.25) * 10, 214 - Math.cos(t * 0.25) * 10, '#1a100a', 1.5);
  // the desk: the bond waiting to be signed
  const dy = 584;
  ctx.fillStyle = vgrad(ctx, dy, 800, [[0, '#3e1e12'], [0.14, '#22100a'], [1, '#0a0504']]); ctx.fillRect(X0, dy, XW, 420);
  rect(ctx, X0, dy - 4, XW, 7, '#6a3a1e'); rect(ctx, X0, dy + 3, XW, 2, '#8a6a2e');
  const lx = 1120 + px * 0.9;
  glow(ctx, lx, dy - 70, 320, '#ffd08a', 0.26);
  seg(ctx, lx, dy, lx, dy - 100, '#b08a3e', 6); rect(ctx, lx - 28, dy - 8, 56, 8, '#b08a3e');
  ctx.fillStyle = '#e8d8a8'; ctx.beginPath(); ctx.moveTo(lx - 34, dy - 150); ctx.lineTo(lx + 34, dy - 150); ctx.lineTo(lx + 54, dy - 96); ctx.lineTo(lx - 54, dy - 96); ctx.fill();
  const ox = 150 + px * 0.9; // a desk orrery, turning
  seg(ctx, ox, dy, ox, dy - 56, '#b08a3e', 5); rect(ctx, ox - 24, dy - 8, 48, 8, '#8a6a2e');
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = '#d8b25a'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(ox, dy - 90, 46 - i * 9, Math.max(2, (46 - i * 9) * Math.abs(Math.sin(t * (0.3 + i * 0.17) + i))), i * 0.9, 0, TAU); ctx.stroke();
  }
  circ(ctx, ox, dy - 90, 9, '#f0d68a');
});

// ── ferry-dawn ──
def('ferry-dawn', { amb: '#4a3550', rim: '#ffd0a0', key: 1 }, (ctx, t, px) => {
  const rock = Math.sin(t * 0.5) * 0.007;
  ctx.save();
  ctx.translate(640, 440); ctx.rotate(rock); ctx.translate(-640, -440);
  fillAll(ctx, vgrad(ctx, -180, 440, [[0, '#232c54'], [0.45, '#7a557c'], [0.8, '#ee9c72'], [1, '#ffdca6']]));
  stars(ctx, 6, 30, 120, t);
  const sx = 640 + px * 0.05;
  glow(ctx, sx, 436, 520, '#fff0c0', 0.5);
  circ(ctx, sx, 436, 44, '#fff6dc');
  for (let i = 0; i < 9; i++) {
    const x = mod(rnd(i * 3) * 1700 + t * (2 + rnd(i) * 3), 1700) - 220 + px * 0.1, y = 150 + rnd(i * 7) * 220;
    ctx.fillStyle = `rgba(255,190,150,${0.25 + rnd(i * 5) * 0.2})`; ctx.beginPath(); ctx.ellipse(x, y, 120 + rnd(i * 2) * 160, 9 + rnd(i * 9) * 9, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(90,60,110,.25)'; ctx.beginPath(); ctx.ellipse(x + 10, y - 9, 110 + rnd(i * 2) * 150, 8, 0, 0, TAU); ctx.fill();
  }
  for (let i = 0; i < 5; i++) { // gulls
    const x = mod(200 + i * 260 + t * (18 + i * 4), 1700) - 200, y = 170 + i * 34 + Math.sin(t * 0.8 + i) * 16, w = 12 + i * 2, fl = Math.sin(t * 5 + i * 2) * 5;
    ctx.strokeStyle = 'rgba(40,30,50,.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - w, y - fl); ctx.quadraticCurveTo(x - w * 0.4, y - 5, x, y); ctx.quadraticCurveTo(x + w * 0.4, y - 5, x + w, y - fl); ctx.stroke();
  }
  // Vessery, behind us, its last lanterns going out
  const vx = 150 + px * 0.15;
  ctx.fillStyle = '#5a4668'; ctx.beginPath(); ctx.moveTo(X0, 442); ctx.lineTo(X0, 400); ctx.bezierCurveTo(vx - 100, 360, vx + 200, 400, vx + 420, 442); ctx.fill();
  skyline(ctx, 33, X0 + px * 0.15, vx + 360, 442, 8, 64, 14, 40, '#4c3a5e', null, t);
  for (let i = 0; i < 40; i++) {
    const a = 0.75 * Math.max(0, Math.sin(t * 0.25 + i * 1.3));
    rect(ctx, X0 + 40 + rnd(i) * (vx + 520), 442 - rnd(i * 3) * 150 - mod(t * 3 + i * 9, 80), 2.5, 3.5, rgba('#ffcf7a', a));
  }
  ctx.fillStyle = vgrad(ctx, 440, 800, [[0, '#e9a57c'], [0.25, '#8a6482'], [1, '#1c2444']]); ctx.fillRect(X0, 440, XW, 560);
  waterStreaks(ctx, 35, sx - 150, sx + 150, 444, 700, 90, '#fff0c0', t, 0.85);
  waterStreaks(ctx, 37, X0, 1540, 446, 800, 130, '#ffe0c8', t, 0.35);
  for (let i = 0; i < 7; i++) { // the wake
    const y = 500 + i * 34, w = 80 + i * 110, ph = Math.sin(t * 0.9 + i) * 10;
    ctx.strokeStyle = `rgba(255,240,225,${0.3 - i * 0.03})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(300 - w + ph, y); ctx.quadraticCurveTo(300, y - 12, 300 + w + ph, y + 4); ctx.stroke();
  }
  ctx.restore();
  // the ferry rail
  const rx = px * 1.1;
  ctx.fillStyle = vgrad(ctx, 700, 800, [[0, '#2a1c20'], [1, '#120c10']]); ctx.fillRect(X0, 706, XW, 300);
  for (let i = -2; i < 12; i++) {
    const x = i * 170 + rx;
    ctx.fillStyle = hgrad(ctx, x, x + 16, [[0, '#1c1216'], [0.5, '#4a3030'], [1, '#1c1216']]); ctx.fillRect(x, 552, 16, 170);
  }
  rect(ctx, X0, 548, XW, 15, '#3a2424'); rect(ctx, X0, 548, XW, 3, 'rgba(255,200,150,.4)');
  rect(ctx, X0, 632, XW, 8, '#2a1a1c');
  ctx.strokeStyle = '#d8ccb8'; ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(196 + rx, 610, 36, 0, TAU); ctx.stroke();
  ctx.strokeStyle = '#b0342a'; ctx.lineWidth = 12;
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(196 + rx, 610, 36, i * (Math.PI / 2) + 0.5, i * (Math.PI / 2) + 1.05); ctx.stroke(); }
  lantern(ctx, 1040 + rx, 440, 16, '#ffd9a0', t, 4);
  seg(ctx, 1040 + rx, 440, 1040 + rx, 552, '#1c1216', 5); seg(ctx, 1040 + rx, 440, 1070 + rx, 440, '#1c1216', 4);
}, (ctx, t, px) => {
  for (let i = 0; i < 6; i++) {
    const x = mod(rnd(i * 3) * 1900 + t * (12 + i * 3), 1900) - 300 + px;
    ctx.fillStyle = 'rgba(255,225,205,.07)'; ctx.beginPath(); ctx.ellipse(x, 470 + i * 44, 360, 30, 0, 0, TAU); ctx.fill();
  }
});

// ── causeway: a salt-white road across tidal flats ──
def('causeway', { amb: '#6e7884', rim: '#ffffff', key: 1 }, (ctx, t, px) => {
  fillAll(ctx, vgrad(ctx, -180, 436, [[0, '#7f97ad'], [0.6, '#bccbd4'], [1, '#eceee6']]));
  glow(ctx, 380 + px * 0.05, 120, 420, '#ffffff', 0.5);
  circ(ctx, 380 + px * 0.05, 120, 30, 'rgba(255,255,250,.95)');
  for (let i = 0; i < 10; i++) {
    const x = mod(rnd(i * 3) * 1800 + t * (3 + rnd(i) * 4), 1800) - 260 + px * 0.1, y = 90 + rnd(i * 7) * 280;
    ctx.fillStyle = `rgba(255,255,255,${0.3 + rnd(i * 5) * 0.3})`; ctx.beginPath(); ctx.ellipse(x, y, 130 + rnd(i * 2) * 190, 12 + rnd(i * 9) * 14, 0, 0, TAU); ctx.fill();
  }
  // Saltmere on the horizon
  const hx = 760 + px * 0.12, hc = '#8494a2';
  rect(ctx, hx - 260, 418, 520, 20, hc);
  skyline(ctx, 51, hx - 250, hx + 250, 436, 8, 40, 16, 44, hc, null, t);
  ctx.strokeStyle = hc; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(hx - 34, 436); ctx.lineTo(hx, 330); ctx.lineTo(hx + 34, 436); ctx.moveTo(hx, 336); ctx.lineTo(hx + 80, 436); ctx.moveTo(hx - 20, 400); ctx.lineTo(hx + 20, 400); ctx.moveTo(hx - 12, 368); ctx.lineTo(hx + 12, 368); ctx.stroke();
  ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(hx, 330, 15, 0, TAU); ctx.stroke();
  for (const cx of [hx - 150, hx + 170]) {
    rect(ctx, cx - 5, 356, 10, 80, hc);
    for (let j = 0; j < 6; j++) { ctx.fillStyle = `rgba(150,160,170,${0.3 - j * 0.045})`; ctx.beginPath(); ctx.arc(cx + j * 16 + Math.sin(t * 0.6 + j) * 5, 350 - j * 12, 9 + j * 5, 0, TAU); ctx.fill(); }
  }
  // the flats
  ctx.fillStyle = vgrad(ctx, 436, 800, [[0, '#e4e7df'], [0.3, '#cfd6d4'], [1, '#aeb9bd']]); ctx.fillRect(X0, 436, XW, 560);
  for (let i = 0; i < 26; i++) {
    const d = rnd(i * 2.7), y = 446 + d * d * 330, w = (60 + rnd(i * 3) * 220) * (0.3 + d), x = rnd(i * 5) * 1800 - 260 + px * (0.2 + d * 0.6);
    ctx.fillStyle = `rgba(150,184,208,${0.45 + 0.15 * Math.sin(t * 0.7 + i)})`; ctx.beginPath(); ctx.ellipse(x, y, w, w * 0.07 + 1.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(x - w * 0.5 + Math.sin(t + i) * w * 0.2, y - 1, w * 0.4, 1.5);
  }
  for (let i = 0; i < 5; i++) { // shimmer where the road meets the sky
    ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let x = X0; x < 1540; x += 20) ctx.lineTo(x, 438 + i * 4 + Math.sin(x * 0.03 + t * 2 + i) * 1.6);
    ctx.stroke();
  }
  // the road
  const vx = hx - 30;
  ctx.fillStyle = vgrad(ctx, 436, 800, [[0, '#f6f5ee'], [1, '#e2e0d6']]);
  poly(ctx, [[vx - 5, 437], [vx + 5, 437], [1250 + px, 980], [-250 + px, 980]]); ctx.fill();
  ctx.fillStyle = 'rgba(120,130,140,.22)';
  poly(ctx, [[vx + 5, 437], [1250 + px, 980], [1330 + px, 980]]); ctx.fill();
  poly(ctx, [[vx - 5, 437], [-250 + px, 980], [-330 + px, 980]]); ctx.fill();
  for (const o of [-0.18, 0.2]) { ctx.strokeStyle = 'rgba(150,150,140,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(vx, 438); ctx.lineTo(500 + px + o * 1500, 980); ctx.stroke(); }
  for (let i = 1; i < 9; i++) {
    const e = Math.pow(i / 8, 2.4), y = lerp(440, 900, e);
    for (const s of [-1, 1]) {
      const x = lerp(vx + s * 6, (s < 0 ? -250 : 1250) + px, (y - 437) / (980 - 437)) + s * 6, h = 8 + e * 150;
      rect(ctx, x - h * 0.03, y - h, Math.max(1.5, h * 0.06), h, '#4a4a48');
      const fl = Math.sin(t * 5 + i + s) * h * 0.04;
      poly(ctx, [[x, y - h], [x + h * 0.28, y - h * 0.9 + fl], [x, y - h * 0.8]], '#b03a2a');
    }
  }
}, (ctx, t, px) => {
  // salt on the wind
  motes(ctx, 5, 70, '#ffffff', t, { x0: -200 + px, x1: 1500 + px, y0: 300, y1: 800, vx: 260, vy: 14, r: 2, a: 0.5, streak: 7, wob: 6 });
  for (let i = 0; i < 4; i++) {
    const x = mod(rnd(i * 3) * 2200 + t * 120, 2200) - 500;
    ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.beginPath(); ctx.ellipse(x, 560 + i * 60, 380, 26, 0, 0, TAU); ctx.fill();
  }
});

// ── picket: pithead gates, braziers ──
function brazier(ctx, x, y, s, t, seed) {
  glow(ctx, x, y - s * 0.6, s * 5.5, '#ff7a2a', 0.3 * flick(t, seed));
  flame(ctx, x - s * 0.3, y - s * 0.9, s * 0.55, t, seed); flame(ctx, x + s * 0.3, y - s * 0.9, s * 0.45, t, seed + 3);
  ctx.fillStyle = '#17110f'; ctx.fillRect(x - s * 0.6, y - s, s * 1.2, s * 1.3);
  for (let i = 0; i < 9; i++) circ(ctx, x - s * 0.42 + (i % 3) * s * 0.42, y - s * 0.72 + Math.floor(i / 3) * s * 0.38, s * 0.09, rgba('#ff9a3a', 0.6 + 0.4 * Math.sin(t * 6 + i + seed)));
  seg(ctx, x - s * 0.5, y + s * 0.3, x - s * 0.8, y + s * 1.1, '#17110f', s * 0.12); seg(ctx, x + s * 0.5, y + s * 0.3, x + s * 0.8, y + s * 1.1, '#17110f', s * 0.12);
}
def('picket', { amb: '#141a2a', rim: '#ff9a48', key: 1 }, (ctx, t, px) => {
  fillAll(ctx, vgrad(ctx, -180, 540, [[0, '#080d1e'], [0.6, '#1c2746'], [1, '#473a4c']]));
  stars(ctx, 8, 90, 330, t);
  // headframe
  const hx = 960 + px * 0.2, hc = '#0b0e18';
  ctx.strokeStyle = hc; ctx.lineWidth = 9;
  ctx.beginPath(); ctx.moveTo(hx - 70, 560); ctx.lineTo(hx - 26, 90); ctx.moveTo(hx + 70, 560); ctx.lineTo(hx + 26, 90); ctx.moveTo(hx - 26, 96); ctx.lineTo(hx - 300, 560); ctx.stroke();
  ctx.lineWidth = 4;
  for (let i = 0; i < 6; i++) { const y0 = 130 + i * 72, w0 = 30 + i * 7.4, w1 = 30 + (i + 1) * 7.4; ctx.beginPath(); ctx.moveTo(hx - w0, y0); ctx.lineTo(hx + w1, y0 + 72); ctx.moveTo(hx + w0, y0); ctx.lineTo(hx - w1, y0 + 72); ctx.moveTo(hx - w0, y0); ctx.lineTo(hx + w0, y0); ctx.stroke(); }
  ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(hx, 76, 44, 0, TAU); ctx.stroke();
  ctx.lineWidth = 2.5; for (let i = 0; i < 8; i++) seg(ctx, hx, 76, hx + Math.cos(i * 0.785 + 0.2) * 44, 76 + Math.sin(i * 0.785 + 0.2) * 44, hc, 2.5);
  seg(ctx, hx - 44, 76, hx - 318, 548, hc, 1.5);
  skyline(ctx, 81, X0 + px * 0.25, 1560, 560, 60, 170, 90, 180, '#0b0e18', '#ffb060', t);
  // the wall and the gates
  const gx = 640 + px * 0.5;
  ctx.fillStyle = vgrad(ctx, 290, 580, [[0, '#1e2230'], [1, '#12141c']]); ctx.fillRect(X0, 300, XW, 290);
  for (let x = X0 + mod(px * 0.5, 22); x < 1540; x += 22) rect(ctx, x, 300, 3, 290, 'rgba(0,0,0,.28)');
  for (let x = X0 + mod(px * 0.5, 90); x < 1540; x += 90) { seg(ctx, x, 300, x + 16, 280, '#0b0e18', 2); seg(ctx, x + 16, 280, x + 60, 284, '#0b0e18', 1.2); }
  rect(ctx, gx - 250, 250, 500, 350, '#0c0f18');
  ctx.fillStyle = vgrad(ctx, 250, 600, [[0, '#2a2438'], [1, '#3a2c34']]); ctx.fillRect(gx - 226, 276, 452, 324);
  // beyond the bars: the dark yard
  glow(ctx, gx, 520, 260, '#ff8a3a', 0.1);
  for (let i = 0; i <= 18; i++) { const x = gx - 226 + i * 25.1; rect(ctx, x - 3, 276, 6, 324, '#0c0f18'); poly(ctx, [[x - 6, 280], [x, 262], [x + 6, 280]], '#0c0f18'); }
  rect(ctx, gx - 226, 330, 452, 8, '#0c0f18'); rect(ctx, gx - 226, 540, 452, 8, '#0c0f18'); rect(ctx, gx - 5, 262, 10, 338, '#0c0f18');
  ctx.strokeStyle = '#7a7f8c'; ctx.lineWidth = 3; ctx.setLineDash([7, 5]); ctx.beginPath(); ctx.moveTo(gx - 34, 426); ctx.quadraticCurveTo(gx, 468, gx + 34, 426); ctx.stroke(); ctx.setLineDash([]);
  rect(ctx, gx - 11, 446, 22, 20, '#8a8f9c');
  // the arch sign
  ctx.strokeStyle = '#0c0f18'; ctx.lineWidth = 34; ctx.beginPath(); ctx.arc(gx, 420, 300, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
  ctx.save(); ctx.translate(gx, 420); ctx.fillStyle = '#b9b2a0'; ctx.font = `700 21px ${FONT_SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const sign = 'SALTMERE  No. 2  PIT';
  for (let i = 0; i < sign.length; i++) { ctx.save(); ctx.rotate(((i - (sign.length - 1) / 2) / sign.length) * 1.5); ctx.fillText(sign[i], 0, -300); ctx.restore(); }
  ctx.restore(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  // the notice
  ctx.save(); ctx.translate(gx + 96, 352); ctx.rotate(0.03 + Math.sin(t * 1.4) * 0.008);
  rect(ctx, 0, 0, 96, 130, '#dcd4bc');
  ctx.fillStyle = '#3a1410'; ctx.font = `700 11px ${FONT_SERIF}`; ctx.textAlign = 'center';
  ctx.fillText('NOTICE OF', 48, 20); ctx.fillText('FORECLOSURE', 48, 34);
  for (let i = 0; i < 6; i++) rect(ctx, 12, 46 + i * 10, 72 - (i % 3) * 12, 2, 'rgba(40,30,30,.6)');
  circ(ctx, 72, 112, 11, '#a02a26');
  const fl = Math.sin(t * 2.2) * 4;
  poly(ctx, [[0, 130], [22 + fl, 122 - fl], [0, 104]], '#b8b09a');
  ctx.restore(); ctx.textAlign = 'left';
  // ground
  ctx.fillStyle = vgrad(ctx, 590, 800, [[0, '#1c1a22'], [1, '#0b0a10']]); ctx.fillRect(X0, 590, XW, 420);
  for (let i = 0; i < 20; i++) { ctx.fillStyle = 'rgba(200,210,225,.09)'; ctx.beginPath(); ctx.ellipse(rnd(i) * 1800 - 260 + px * 0.8, 600 + rnd(i * 3) * 190, 60 + rnd(i * 5) * 140, 5 + rnd(i * 7) * 9, 0, 0, TAU); ctx.fill(); }
  // the picket
  crowdRow(ctx, 91, -220 + px * 0.6, gx - 280, 530, 8, 24, '#090a10', t, { signs: 0.3, signCol: '#b8b09a', signInk: '#2a1410', hat: 0.6, bob: 0.4 });
  crowdRow(ctx, 93, gx + 280, 1500 + px * 0.6, 530, 8, 24, '#090a10', t, { signs: 0.3, signCol: '#b8b09a', signInk: '#2a1410', hat: 0.6, bob: 0.4 });
  brazier(ctx, 446 + px * 0.8, 600, 34, t, 1);
  brazier(ctx, 838 + px * 0.8, 606, 36, t, 2);
}, (ctx, t, px) => {
  motes(ctx, 9, 130, '#e8eef8', t, { x0: -100 + px, x1: 1400 + px, y0: -20, y1: 800, vx: 16, vy: 38, r: 1.8, a: 0.6, wob: 14 });
  motes(ctx, 11, 26, '#ffb060', t, { x0: 380 + px, x1: 520 + px, y0: 260, y1: 580, vx: 6, vy: -70, r: 1.7, a: 0.9, tw: 1 });
  motes(ctx, 13, 26, '#ffb060', t, { x0: 770 + px, x1: 910 + px, y0: 260, y1: 580, vx: -6, vy: -70, r: 1.7, a: 0.9, tw: 1 });
});

// ── mine-deep: a blue-lit stillsalt gallery ──
function crystal(ctx, x, y, s, a, t, seed) {
  const pulse = 0.6 + 0.4 * Math.sin(t * 1.3 + seed * 5);
  glow(ctx, x, y - s * 0.4, s * 2.6, '#3fb4ff', 0.3 * pulse);
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  for (let i = 0; i < 5; i++) {
    const r = (i - 2) * 0.34 + (rnd(seed + i) - 0.5) * 0.2, h = s * (0.5 + rnd(seed * 3 + i) * 0.8), w = s * (0.1 + rnd(seed * 5 + i) * 0.1);
    ctx.save(); ctx.rotate(r);
    poly(ctx, [[-w, 0], [-w, -h * 0.8], [0, -h], [0, 0]], css(mix('#1c5a9a', '#bfeaff', 0.2 + 0.5 * pulse * rnd(seed * 7 + i))));
    poly(ctx, [[0, 0], [0, -h], [w, -h * 0.8], [w, 0]], css(mix('#0e3466', '#7fd0ff', 0.25 * pulse)));
    ctx.restore();
  }
  ctx.restore();
}
def('mine-deep', { amb: '#061430', rim: '#6fd8ff', key: 1 }, (ctx, t, px) => {
  fillAll(ctx, '#02060e');
  const vx = 640 + px * 0.1, vy = 380;
  glow(ctx, vx, vy, 520, '#12509a', 0.45);
  // the gallery, receding set by set
  for (let i = 0; i < 6; i++) {
    const u = i / 5, s = lerp(0.15, 1.02, Math.pow(u, 1.5)), w = 560 * s, h = 400 * s, ox = px * i * 0.14;
    const x = vx + ox;
    const arch = () => {
      ctx.moveTo(x - w, vy + h * 0.72);
      for (let k = 0; k <= 14; k++) { const a = Math.PI + (k / 14) * Math.PI, jr = 1 + (rnd(i * 20 + k) - 0.5) * 0.13; ctx.lineTo(x + Math.cos(a) * w * jr, vy - h * 0.2 + Math.sin(a) * h * 0.8 * jr); }
      ctx.lineTo(x + w, vy + h * 0.72);
      ctx.closePath();
    };
    // the rock face around this opening, lit from within
    const g = ctx.createRadialGradient(x, vy, w * 0.7, x, vy, w * 2.6);
    g.addColorStop(0, css(mix('#17427c', '#081428', u)));
    g.addColorStop(1, css(mix('#081a38', '#02050c', u)));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.rect(X0, -180, XW, 1160); arch(); ctx.fill('evenodd');
    ctx.strokeStyle = rgba('#6fc0ff', 0.26 - u * 0.12); ctx.lineWidth = 2 + s * 3;
    ctx.beginPath(); arch(); ctx.stroke();
    // facets of bare, pick-marked rock where the seam has been taken
    for (let k = 0; k < 10; k++) {
      const sd = k % 2 ? 1 : -1, bx = x + sd * w * (1.04 + rnd(i * 9 + k) * 0.5), by = vy - h * 0.8 + rnd(i * 5 + k) * h * 1.5, fs = (14 + rnd(i * 3 + k) * 26) * (0.4 + s);
      poly(ctx, [[bx, by], [bx + fs, by + fs * 0.3], [bx + fs * 0.6, by + fs], [bx - fs * 0.3, by + fs * 0.7]], `rgba(${k % 3 ? '4,10,24' : '70,110,170'},${k % 3 ? 0.28 : 0.1})`);
    }
    // timber set
    const tw = 5 + s * 20;
    for (const sd of [-1, 1]) {
      seg(ctx, x + sd * w * 0.9, vy + h * 0.74, x + sd * w * 0.78, vy - h * 0.6, css(mix('#5a4028', '#0a0c12', u * 0.8)), tw);
      seg(ctx, x + sd * w * 0.9 - tw * 0.3, vy + h * 0.74, x + sd * w * 0.78 - tw * 0.3, vy - h * 0.6, rgba('#9fd0ff', 0.2 - u * 0.1), Math.max(1, tw * 0.14));
    }
    seg(ctx, x - w * 0.86, vy - h * 0.6, x + w * 0.86, vy - h * 0.6, css(mix('#6a4a2e', '#0c0e14', u * 0.8)), tw * 1.1);
    seg(ctx, x - w * 0.86, vy - h * 0.6 + tw * 0.5, x + w * 0.86, vy - h * 0.6 + tw * 0.5, 'rgba(0,0,0,.4)', Math.max(1, tw * 0.2));
    // what is left of the stillsalt
    crystal(ctx, x - w * 1.0, vy + h * (0.5 - rnd(i) * 0.5), 46 * s + 11, 1.25, t, i * 3 + 1);
    crystal(ctx, x + w * 1.0, vy + h * (0.55 - rnd(i * 3) * 0.6), 42 * s + 11, -1.25, t, i * 3 + 2);
    if (i % 2 === 0) crystal(ctx, x + w * (rnd(i * 7) - 0.5) * 0.9, vy - h * 0.96, 22 * s + 7, Math.PI, t, i * 3 + 3);
    crystal(ctx, x - w * 0.97, vy + h * 0.72, 20 * s + 6, 0.5, t, i * 5 + 4);
  }
  // floor and rails
  ctx.fillStyle = vgrad(ctx, vy + 60, 800, [[0, 'rgba(8,20,44,0)'], [1, 'rgba(10,30,60,.5)']]); ctx.fillRect(X0, vy + 60, XW, 600);
  for (let i = 1; i < 12; i++) { const e = Math.pow(i / 11, 2.2), y = lerp(vy + 70, 860, e), w = lerp(26, 420, e); seg(ctx, vx - w + px * e, y, vx + w + px * e, y, '#1a1c22', 2 + e * 12); }
  for (const s of [-1, 1]) {
    ctx.strokeStyle = '#5a7a9a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(vx + s * 16, vy + 66); ctx.lineTo(vx + s * 330 + px, 880); ctx.stroke();
  }
  // the last good clusters, close to the lens
  crystal(ctx, 60 + px * 1.1, 640, 120, 0.5, t, 41);
  crystal(ctx, 1230 + px * 1.1, 620, 105, -0.6, t, 43);
  crystal(ctx, 1150 + px * 0.9, 96, 60, 2.6, t, 47);
  // lamp on its hook
  const sw = Math.sin(t * 1.1) * 0.12, lx = vx + 200 + px * 0.6;
  ctx.save(); ctx.translate(lx, -40); ctx.rotate(sw);
  seg(ctx, 0, 0, 0, 200, '#0c1018', 2.5);
  glow(ctx, 0, 226, 300, '#9fdcff', 0.26 * flick(t, 6) + 0.08);
  rect(ctx, -15, 200, 30, 8, '#2a3038'); rect(ctx, -15, 244, 30, 8, '#2a3038');
  rect(ctx, -11, 208, 22, 36, '#d6f2ff');
  for (let i = -1; i <= 1; i++) rect(ctx, i * 9 - 1, 208, 2, 36, '#2a3038');
  ctx.restore();
  // the drip
  const dp = mod(t * 0.5, 1), dxp = vx - 250 + px * 0.7;
  if (dp < 0.6) rect(ctx, dxp, 110 + (dp / 0.6) * (dp / 0.6) * 560, 2, 9, 'rgba(160,220,255,.7)');
  else { ctx.strokeStyle = `rgba(160,220,255,${0.6 * (1 - (dp - 0.6) / 0.4)})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(dxp, 676, ((dp - 0.6) / 0.4) * 46, ((dp - 0.6) / 0.4) * 7, 0, 0, TAU); ctx.stroke(); }
}, (ctx, t, px) => {
  motes(ctx, 15, 70, '#8fdcff', t, { x0: -100 + px, x1: 1400 + px, y0: 0, y1: 800, vx: 3, vy: -9, r: 1.7, a: 0.7, tw: 1, wob: 16 });
});

// ── court: a circuit hearing in a drill hall ──
def('court', { amb: '#2c2a26', rim: '#fff0cc', key: -1 }, (ctx, t, px) => {
  fillAll(ctx, vgrad(ctx, -180, 520, [[0, '#211f1c'], [1, '#4a453c']]));
  for (let y = -160; y < 520; y += 22) seg(ctx, X0, y, X0 + XW, y, 'rgba(0,0,0,.12)', 1);
  // high windows and their light
  for (let i = 0; i < 6; i++) {
    const x = -150 + i * 300 + px * 0.2;
    rect(ctx, x - 8, 22, 136, 216, '#181612');
    ctx.fillStyle = vgrad(ctx, 30, 230, [[0, '#f2f4e6'], [1, '#bccdc8']]); ctx.fillRect(x, 30, 120, 200);
    rect(ctx, x + 57, 30, 6, 200, '#181612'); rect(ctx, x, 94, 120, 5, '#181612'); rect(ctx, x, 162, 120, 5, '#181612');
    poly(ctx, [[x, 230], [x + 120, 230], [x + 520, 980], [x + 180, 980]], 'rgba(255,246,214,.06)');
    glow(ctx, x + 60, 130, 220, '#fff6dc', 0.14);
  }
  // roof trusses
  for (let i = -1; i < 5; i++) {
    const x = -200 + i * 400 + px * 0.45;
    ctx.strokeStyle = '#141210'; ctx.lineWidth = 12;
    ctx.beginPath(); ctx.moveTo(x, 10); ctx.lineTo(x + 200, -150); ctx.lineTo(x + 400, 10); ctx.moveTo(x + 200, -150); ctx.lineTo(x + 200, 10); ctx.moveTo(x + 100, -70); ctx.lineTo(x + 200, 10); ctx.lineTo(x + 300, -70); ctx.stroke();
  }
  rect(ctx, X0, 4, XW, 14, '#141210');
  // the banner of the Benches
  const bx = 640 + px * 0.25;
  ctx.fillStyle = hgrad(ctx, bx - 90, bx + 90, [[0, '#17264a'], [0.5, '#27407a'], [1, '#17264a']]);
  ctx.beginPath(); ctx.moveTo(bx - 90, 250); ctx.lineTo(bx + 90, 250); ctx.lineTo(bx + 90, 420); ctx.lineTo(bx, 392); ctx.lineTo(bx - 90, 420); ctx.fill();
  rect(ctx, bx - 100, 244, 200, 8, '#b08a3e');
  ctx.strokeStyle = '#e8d08a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(bx - 34, 290); ctx.lineTo(bx + 34, 290); ctx.moveTo(bx - 26, 296); ctx.lineTo(bx - 26, 352); ctx.moveTo(bx, 296); ctx.lineTo(bx, 352); ctx.moveTo(bx + 26, 296); ctx.lineTo(bx + 26, 352); ctx.moveTo(bx - 38, 358); ctx.lineTo(bx + 38, 358); ctx.moveTo(bx - 34, 290); ctx.lineTo(bx, 272); ctx.lineTo(bx + 34, 290); ctx.stroke();
  // racks of drill staves along the wall
  for (const rx of [140, 1010]) {
    const x = rx + px * 0.25;
    rect(ctx, x, 330, 150, 7, '#1c1814'); rect(ctx, x, 470, 150, 7, '#1c1814');
    for (let i = 0; i < 9; i++) seg(ctx, x + 10 + i * 16, 300 + rnd(i + rx) * 8, x + 12 + i * 16, 500, '#6a5236', 4);
  }
  // floor with its painted drill lines
  ctx.fillStyle = vgrad(ctx, 520, 800, [[0, '#4a3e2c'], [1, '#1c1610']]); ctx.fillRect(X0, 520, XW, 480);
  for (let i = -10; i < 26; i++) seg(ctx, 640 + (i - 8) * 70 + px * 0.4, 520, 640 + (i - 8) * 230 + px, 980, 'rgba(0,0,0,.2)', 1.4);
  ctx.strokeStyle = 'rgba(230,226,200,.3)'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.ellipse(640 + px * 0.6, 690, 520, 90, 0, 0, TAU); ctx.stroke();
  seg(ctx, X0, 600, X0 + XW, 600, 'rgba(230,226,200,.22)', 4);
  // the bench on its dais
  const dx = 640 + px * 0.4;
  rect(ctx, dx - 440, 508, 880, 34, '#2a2018'); rect(ctx, dx - 440, 504, 880, 6, '#5a4630');
  for (let i = -1; i <= 1; i++) {
    const x = dx + i * 210;
    ctx.fillStyle = '#20140e'; ctx.beginPath(); ctx.moveTo(x - 46, 508); ctx.lineTo(x - 46, 330 - (i ? 0 : 26)); ctx.quadraticCurveTo(x, 296 - (i ? 0 : 26), x + 46, 330 - (i ? 0 : 26)); ctx.lineTo(x + 46, 508); ctx.fill();
    ctx.strokeStyle = '#8a6a2e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 36, 500); ctx.lineTo(x - 36, 338 - (i ? 0 : 26)); ctx.quadraticCurveTo(x, 310 - (i ? 0 : 26), x + 36, 338 - (i ? 0 : 26)); ctx.lineTo(x + 36, 500); ctx.stroke();
  }
  ctx.fillStyle = vgrad(ctx, 420, 510, [[0, '#215a3e'], [1, '#0f2e20']]); ctx.fillRect(dx - 380, 424, 760, 86);
  rect(ctx, dx - 388, 416, 776, 12, '#4a3220');
  for (let x = dx - 380; x < dx + 380; x += 14) rect(ctx, x, 504, 8, 9, '#c9a24a');
  for (let i = 0; i < 8; i++) rect(ctx, dx - 372 + i * 100 + rnd(i) * 30, 424, 3, 86, 'rgba(0,0,0,.16)');
  fileStack(ctx, dx - 330, 416, 70, 6, 5); fileStack(ctx, dx + 240, 416, 76, 9, 8); fileStack(ctx, dx - 110, 416, 60, 3, 11);
  rect(ctx, dx + 60, 404, 40, 12, '#3a2614'); seg(ctx, dx + 66, 398, dx + 120, 384, '#5a3a1e', 6); rect(ctx, dx + 108, 372, 30, 18, '#3a2614');
  // the public, standing at the back of the hall and at the sides
  crowdRow(ctx, 101, X0 + px * 0.5, dx - 470, 468, 9, 20, '#17130f', t, { hat: 0.3, bob: 0.3 });
  crowdRow(ctx, 103, dx + 470, 1540 + px * 0.5, 468, 9, 20, '#17130f', t, { hat: 0.3, bob: 0.3 });
}, (ctx, t, px) => {
  motes(ctx, 17, 80, '#fff6dc', t, { x0: -100 + px, x1: 1400 + px, y0: 120, y1: 760, vx: 5, vy: 4, r: 1.5, a: 0.38, tw: 1, wob: 18 });
});

// ── ledger-room: a records vault at night ──
function ledgerShelf(ctx, x, y0, w, rowsN, rowH, seed, dark) {
  rect(ctx, x - 10, y0 - 14, w + 20, rowsN * rowH + 24, '#0b0d14');
  const cols = ['#4a1c1c', '#1c3a2c', '#3a2c1a', '#1c2a4a', '#2e2420', '#3c1a2a'];
  for (let r = 0; r < rowsN; r++) {
    const y = y0 + r * rowH;
    let sx = x;
    let i = 0;
    while (sx < x + w - 8) {
      const sw = 13 + rnd(seed + r * 31 + i) * 16, h = rowH - 16 - rnd(seed * 3 + r * 7 + i) * 16;
      const lean = rnd(seed * 5 + r * 3 + i) < 0.06;
      if (rnd(seed * 7 + r * 11 + i) > 0.07) { // a gap is a ledger someone has taken
        ctx.save(); ctx.translate(sx, y + rowH - 8); if (lean) ctx.rotate(-0.16);
        rect(ctx, 0, -h, sw - 1.5, h, css(mix(cols[Math.floor(rnd(seed * 9 + r + i * 3) * cols.length)], '#05060a', dark)));
        rect(ctx, 0, -h * 0.82, sw - 1.5, 2, rgba('#c9a24a', 0.5 * (1 - dark)));
        rect(ctx, 0, -h * 0.3, sw - 1.5, 2, rgba('#c9a24a', 0.5 * (1 - dark)));
        ctx.restore();
      }
      sx += sw; i++;
    }
    rect(ctx, x - 10, y + rowH - 8, w + 20, 8, '#171a24');
  }
}
def('ledger-room', { amb: '#0c1220', rim: '#9fc0ff', key: 1 }, (ctx, t, px) => {
  fillAll(ctx, vgrad(ctx, -180, 800, [[0, '#04070e'], [0.6, '#0c1322'], [1, '#05070c']]));
  // vault door, standing a little open
  const vx = 640 + px * 0.15, vy = 330;
  rect(ctx, vx - 230, 80, 460, 520, '#10141e');
  glow(ctx, vx, vy, 330, '#3a5a9a', 0.2);
  ctx.fillStyle = (() => { const g = ctx.createRadialGradient(vx - 60, vy - 60, 20, vx, vy, 190); g.addColorStop(0, '#5a6678'); g.addColorStop(1, '#1c2230'); return g; })();
  ctx.beginPath(); ctx.arc(vx, vy, 186, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#0a0d14'; ctx.lineWidth = 5; for (const r of [186, 150, 96]) { ctx.beginPath(); ctx.arc(vx, vy, r, 0, TAU); ctx.stroke(); }
  for (let i = 0; i < 16; i++) circ(ctx, vx + Math.cos(i * 0.3927) * 168, vy + Math.sin(i * 0.3927) * 168, 6, '#0a0d14');
  const wa = Math.sin(t * 0.2) * 0.3;
  for (let i = 0; i < 5; i++) { const a = wa + i * (TAU / 5); seg(ctx, vx, vy, vx + Math.cos(a) * 80, vy + Math.sin(a) * 80, '#8a96a8', 7); circ(ctx, vx + Math.cos(a) * 80, vy + Math.sin(a) * 80, 9, '#aab4c4'); }
  circ(ctx, vx, vy, 20, '#aab4c4');
  rect(ctx, vx + 191, 110, 2.5, 470, rgba('#ffd9a0', 0.32 + 0.12 * Math.sin(t * 0.9)));
  glow(ctx, vx + 194, 340, 150, '#ffd9a0', 0.14);
  // the stacks
  ledgerShelf(ctx, -230 + px * 0.5, 30, 560, 7, 82, 3, 0.35);
  ledgerShelf(ctx, 950 + px * 0.5, 30, 560, 7, 82, 9, 0.35);
  // ladder
  const lx = 1010 + px * 0.6;
  seg(ctx, lx, 620, lx + 60, 10, '#3a2c1c', 7); seg(ctx, lx + 70, 620, lx + 130, 10, '#3a2c1c', 7);
  for (let i = 0; i < 9; i++) seg(ctx, lx + 6 + i * 6.4, 560 - i * 62, lx + 76 + i * 6.4, 560 - i * 62, '#3a2c1c', 5);
  // moonlight through the grille
  const mx = 300 + px * 0.3;
  ctx.fillStyle = 'rgba(150,185,255,.075)';
  for (let i = 0; i < 4; i++) poly(ctx, [[mx + i * 34, -180], [mx + i * 34 + 22, -180], [mx + 380 + i * 80, 980], [mx + 320 + i * 80, 980]], 'rgba(150,185,255,.07)');
  // floor
  ctx.fillStyle = vgrad(ctx, 600, 800, [[0, '#0e121c'], [1, '#04060a']]); ctx.fillRect(X0, 600, XW, 400);
  for (let i = 0; i < 4; i++) poly(ctx, [[mx + 330 + i * 78, 600], [mx + 388 + i * 78, 600], [mx + 470 + i * 96, 800], [mx + 400 + i * 96, 800]], 'rgba(150,185,255,.1)');
  // the reading table and a shuttered lamp
  const tx = 640 + px * 0.9;
  ctx.fillStyle = vgrad(ctx, 610, 800, [[0, '#2a2018'], [1, '#0c0806']]); ctx.fillRect(tx - 420, 612, 840, 300);
  rect(ctx, tx - 430, 606, 860, 9, '#4a3826');
  glow(ctx, tx + 180, 580, 300, '#ffc070', 0.3 * flick(t, 7) + 0.1);
  rect(ctx, tx + 164, 548, 32, 58, '#1a1a1e'); rect(ctx, tx + 170, 558, 20, 34, '#ffe2a8'); poly(ctx, [[tx + 160, 548], [tx + 180, 530], [tx + 200, 548]], '#1a1a1e');
  poly(ctx, [[tx - 190, 606], [tx - 20, 596], [tx - 20, 606]], '#d9cba6'); poly(ctx, [[tx - 20, 596], [tx + 130, 606], [tx - 20, 606]], '#c9b88e');
  ledgerShelf(ctx, -330 + px * 1.2, -60, 190, 9, 96, 17, 0.75);
  ledgerShelf(ctx, 1400 + px * 1.2, -60, 200, 9, 96, 21, 0.75);
  // a watchman's lamp passing somewhere beyond the shelves
  glow(ctx, 640 + Math.sin(t * 0.23) * 620 + px, 280, 220, '#9fc0ff', 0.07);
}, (ctx, t, px) => {
  motes(ctx, 19, 60, '#c8d8ff', t, { x0: 200 + px, x1: 1100 + px, y0: 0, y1: 700, vx: 3, vy: 5, r: 1.4, a: 0.4, tw: 1, wob: 14 });
});

// ── orrery: the shrine, a brass planetarium over still water ──
function orreryRings(ctx, cx, cy, t, mirror) {
  const N = 6;
  for (let i = N - 1; i >= 0; i--) {
    const rx = 96 + i * 52;
    const tilt = 0.2 + 0.26 * Math.abs(Math.sin(t * (0.11 + i * 0.03) + i * 1.3));
    const rot = (i % 2 ? -1 : 1) * t * (0.05 + i * 0.012) + i * 0.7;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.sin(rot) * 0.5 * (mirror ? -1 : 1));
    ctx.strokeStyle = hgrad(ctx, -rx, rx, [[0, '#6a4a16'], [0.3, '#f4dc92'], [0.55, '#b08a3a'], [0.8, '#f0d07a'], [1, '#5a3e12']]);
    ctx.lineWidth = 7 - i * 0.6;
    ctx.beginPath(); ctx.ellipse(0, 0, rx, rx * tilt, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(40,24,6,.6)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, 0, rx - 4, (rx - 4) * tilt, 0, 0, TAU); ctx.stroke();
    if (i === N - 1) for (let k = 0; k < 60; k++) { const a = (k / 60) * TAU + t * 0.03; seg(ctx, Math.cos(a) * rx, Math.sin(a) * rx * tilt, Math.cos(a) * (rx + (k % 5 ? 7 : 13)), Math.sin(a) * (rx + (k % 5 ? 7 : 13)) * tilt, 'rgba(240,214,138,.55)', 1.3); }
    // the body this ring carries
    const pa = t * (0.22 + i * 0.07) * (i % 2 ? 1 : -1) + i * 2.1, px = Math.cos(pa) * rx, py = Math.sin(pa) * rx * tilt;
    const pc = ['#e8d8b0', '#7fb6d8', '#c97a4a', '#b8c8a0', '#d8a8c8', '#f0e8d0'][i];
    const g = ctx.createRadialGradient(px - 3, py - 3, 1, px, py, 11 + (i % 3) * 3);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, pc); g.addColorStop(1, css(mix(pc, '#000', 0.6)));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, 9 + (i % 3) * 3, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // the Plumb in its seat
  const pulse = 0.75 + 0.25 * Math.sin(t * 1.4);
  glow(ctx, cx, cy, 190, '#cfeaff', 0.4 * pulse);
  const g = ctx.createRadialGradient(cx - 12, cy - 12, 3, cx, cy, 38);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, '#cdd6e2'); g.addColorStop(1, '#3a4658');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 36, 0, TAU); ctx.fill();
}
def('orrery', { amb: '#0e1418', rim: '#ffd98a', key: -1 }, (ctx, t, px) => {
  fillAll(ctx, vgrad(ctx, -180, 800, [[0, '#04070a'], [0.5, '#0c1216'], [1, '#020405']]));
  const cx = 640 + px * 0.25, cy = 270, wy = 500;
  // the dome
  ctx.strokeStyle = 'rgba(120,110,90,.2)'; ctx.lineWidth = 2;
  for (let i = 0; i < 15; i++) { const a = Math.PI * (0.04 + (i / 14) * 0.92); ctx.beginPath(); ctx.moveTo(cx, -90); ctx.quadraticCurveTo(cx - Math.cos(a) * 520, -40, cx - Math.cos(a) * 980, 440); ctx.stroke(); }
  for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.ellipse(cx, -90 + i * 12, i * 170, i * 52, 0, 0, Math.PI); ctx.stroke(); }
  // pillars
  for (let i = 0; i < 8; i++) {
    const side = i % 2 ? 1 : -1, d = Math.floor(i / 2), x = cx + side * (300 + d * 150) + px * (0.1 + d * 0.1), w = 34 + d * 14;
    ctx.fillStyle = hgrad(ctx, x - w / 2, x + w / 2, [[0, '#0a0e12'], [0.4, css(mix('#3a3c3a', '#0a0e12', 0.6 - d * 0.14))], [1, '#06080a']]);
    ctx.fillRect(x - w / 2, -180, w, wy + 180 + d * 14);
    rect(ctx, x - w / 2 - 6, wy + d * 14 - 12, w + 12, 14, '#14181a');
  }
  // light from the oculus
  poly(ctx, [[cx - 46, -180], [cx + 46, -180], [cx + 250, wy], [cx - 250, wy]], 'rgba(255,236,186,.075)');
  poly(ctx, [[cx - 20, -180], [cx + 20, -180], [cx + 120, wy], [cx - 120, wy]], 'rgba(255,236,186,.06)');
  glow(ctx, cx, -60, 300, '#fff0c8', 0.4);
  // armature
  seg(ctx, cx, cy + 36, cx, wy, '#6a4a16', 9); seg(ctx, cx - 3, cy + 36, cx - 3, wy, '#c9a24a', 2);
  poly(ctx, [[cx - 70, wy], [cx + 70, wy], [cx + 30, wy - 40], [cx - 30, wy - 40]], '#4a3410');
  orreryRings(ctx, cx, cy, t, false);
  // still water
  ctx.fillStyle = vgrad(ctx, wy, 800, [[0, '#101a20'], [1, '#020405']]); ctx.fillRect(X0, wy, XW, 500);
  ctx.save();
  ctx.beginPath(); ctx.rect(X0, wy, XW, 500); ctx.clip();
  fade(ctx, 0.34, () => { ctx.save(); ctx.translate(0, wy * 2); ctx.scale(1, -1); orreryRings(ctx, cx, cy, t, false); ctx.restore(); });
  poly(ctx, [[cx - 250, wy], [cx + 250, wy], [cx + 150, 980], [cx - 150, 980]], 'rgba(255,236,186,.05)');
  ctx.restore();
  for (let i = 0; i < 4; i++) { // the one ripple that will not settle
    const r = mod(t * 22 + i * 70, 280);
    ctx.strokeStyle = `rgba(200,225,240,${0.22 * (1 - r / 280)})`; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(cx, wy + 78, r * 1.8, r * 0.26, 0, 0, TAU); ctx.stroke();
  }
  seg(ctx, X0, wy, X0 + XW, wy, 'rgba(160,190,200,.25)', 1.5);
  // votive candles at the water's edge
  for (let i = 0; i < 14; i++) {
    const x = -200 + i * 128 + rnd(i) * 60 + px * 0.5, y = wy - 2;
    if (Math.abs(x - cx) < 100) continue;
    rect(ctx, x - 3, y - 16 - rnd(i * 3) * 12, 6, 16 + rnd(i * 3) * 12, '#d8ccb0');
    flame(ctx, x, y - 16 - rnd(i * 3) * 12, 5, t, i);
    for (let j = 0; j < 6; j++) rect(ctx, x - 5 + Math.sin(t * 2 + j + i) * 2.5, wy + 6 + j * 9, 10 - j, 2, rgba('#ffb85c', 0.4 - j * 0.06));
  }
}, (ctx, t, px) => {
  motes(ctx, 21, 60, '#ffe6b0', t, { x0: 300 + px, x1: 980 + px, y0: -20, y1: 520, vx: 2, vy: 7, r: 1.5, a: 0.55, tw: 1, wob: 14 });
});

// ── commons-hall: long tables, soup, a chalkboard of names ──
function chalkLine(ctx, x, y, w, seed) {
  ctx.beginPath();
  for (let k = 0; k <= w; k += 5) {
    const yy = y + Math.sin(k * 0.6 + seed * 9) * 2.6 * rnd(seed + Math.floor(k / 14)) + (rnd(seed * 3 + k) - 0.5) * 2;
    k ? ctx.lineTo(x + k, yy) : ctx.moveTo(x + k, yy);
  }
  ctx.stroke();
}
def('commons-hall', { amb: '#2c1c10', rim: '#ffcf90', key: 1 }, (ctx, t, px) => {
  fillAll(ctx, vgrad(ctx, -180, 560, [[0, '#24160c'], [1, '#4a301c']]));
  for (let x = X0 + mod(px * 0.2, 46); x < 1540; x += 46) rect(ctx, x, -180, 2, 740, 'rgba(0,0,0,.2)');
  rect(ctx, X0, 430, XW, 8, '#2a1a0e');
  // window: evening over the pit
  const wx = 60 + px * 0.25;
  rect(ctx, wx - 10, 90, 200, 250, '#1a0f08');
  ctx.fillStyle = vgrad(ctx, 100, 330, [[0, '#1c2a52'], [1, '#6a5a78']]); ctx.fillRect(wx, 100, 180, 230);
  ctx.strokeStyle = '#141a30'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(wx + 96, 330); ctx.lineTo(wx + 120, 190); ctx.lineTo(wx + 144, 330); ctx.stroke(); ctx.beginPath(); ctx.arc(wx + 120, 184, 12, 0, TAU); ctx.stroke();
  rect(ctx, wx + 86, 100, 7, 230, '#1a0f08'); rect(ctx, wx, 208, 180, 6, '#1a0f08');
  // the board
  const bx = 430 + px * 0.25, bw = 620, by = 70, bh = 320;
  rect(ctx, bx - 14, by - 14, bw + 28, bh + 34, '#5a3c22');
  ctx.fillStyle = vgrad(ctx, by, by + bh, [[0, '#1c2a26'], [1, '#141f1c']]); ctx.fillRect(bx, by, bw, bh);
  for (let i = 0; i < 9; i++) { ctx.fillStyle = 'rgba(220,230,225,.035)'; ctx.beginPath(); ctx.ellipse(bx + rnd(i) * bw, by + rnd(i * 3) * bh, 120, 34, rnd(i * 5), 0, TAU); ctx.fill(); }
  ctx.fillStyle = 'rgba(238,236,224,.88)'; ctx.font = `700 26px ${FONT_SERIF}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('THE COMMONS', bx + 22, by + 40);
  ctx.font = `italic 15px ${FONT_SERIF}`; ctx.fillStyle = 'rgba(238,236,224,.6)';
  ctx.fillText('what is given is not owed', bx + 250, by + 39);
  ctx.strokeStyle = 'rgba(238,236,224,.5)'; ctx.lineWidth = 2; chalkLine(ctx, bx + 20, by + 52, bw - 40, 1);
  for (let c = 0; c < 3; c++) {
    const x = bx + 24 + c * 200;
    for (let r = 0; r < 9; r++) {
      const y = by + 78 + r * 26, seed = c * 20 + r;
      if (rnd(seed * 3.3) < 0.12) continue;
      ctx.strokeStyle = `rgba(238,236,224,${0.5 + rnd(seed) * 0.35})`; ctx.lineWidth = 2.2;
      chalkLine(ctx, x, y, 60 + rnd(seed * 5) * 60, seed);
      const tally = Math.floor(rnd(seed * 7) * 6);
      for (let k = 0; k < tally; k++) seg(ctx, x + 140 + k * 7, y - 8, x + 141 + k * 7, y + 6, 'rgba(238,236,224,.75)', 2);
      if (tally === 5) seg(ctx, x + 136, y + 5, x + 172, y - 7, 'rgba(238,236,224,.75)', 2);
    }
  }
  rect(ctx, bx - 14, by + bh + 12, bw + 28, 9, '#6a4a2c'); rect(ctx, bx + 80, by + bh + 6, 26, 6, '#eeeade'); rect(ctx, bx + 120, by + bh + 6, 16, 6, '#eeeade');
  // the Compact's banner
  const cxb = 1180 + px * 0.25;
  ctx.fillStyle = '#7a2a1c'; ctx.beginPath(); ctx.moveTo(cxb - 80, 60); ctx.lineTo(cxb + 80, 60); ctx.lineTo(cxb + 80, 330); ctx.lineTo(cxb, 300); ctx.lineTo(cxb - 80, 330); ctx.fill();
  ctx.strokeStyle = '#e8d08a'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cxb - 18, 170, 34, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(cxb + 18, 170, 34, 0, TAU); ctx.stroke();
  ctx.fillStyle = '#e8d08a'; ctx.font = `700 17px ${FONT_SERIF}`; ctx.textAlign = 'center'; ctx.fillText('THE COMPACT', cxb, 250); ctx.textAlign = 'left';
  // floor, tables, people eating
  ctx.fillStyle = vgrad(ctx, 540, 800, [[0, '#3a2414'], [1, '#150c07']]); ctx.fillRect(X0, 540, XW, 460);
  crowdRow(ctx, 111, -200 + px * 0.5, 1500 + px * 0.5, 452, 20, 22, '#1a0f09', t, { hat: 0.3, bob: 0.5 });
  ctx.fillStyle = vgrad(ctx, 520, 560, [[0, '#7a5230'], [1, '#4a2e18']]); ctx.fillRect(X0, 520, XW, 30);
  rect(ctx, X0, 516, XW, 6, '#8e6238');
  for (let i = 0; i < 12; i++) {
    const x = -200 + i * 146 + px * 0.55;
    ctx.fillStyle = '#d9cfb8'; ctx.beginPath(); ctx.ellipse(x, 514, 20, 6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#8a4a22'; ctx.beginPath(); ctx.ellipse(x, 513, 15, 3.6, 0, 0, TAU); ctx.fill();
    for (let j = 0; j < 3; j++) {
      const ph = mod(t * 0.4 + j * 0.33 + i * 0.17, 1);
      ctx.strokeStyle = `rgba(255,244,225,${0.2 * (1 - ph)})`; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x - 6 + j * 6, 508 - ph * 20); ctx.quadraticCurveTo(x - 12 + j * 6 + Math.sin(t * 2 + j + i) * 7, 494 - ph * 34, x - 4 + j * 6, 480 - ph * 46); ctx.stroke();
    }
    if (i % 3 === 1) { ctx.fillStyle = '#b07a3a'; ctx.beginPath(); ctx.ellipse(x + 62, 510, 24, 10, 0, Math.PI, 0); ctx.fill(); }
  }
  // lamps
  for (const lx of [250, 760, 1160]) {
    const x = lx + px * 0.7, sw = Math.sin(t * 0.9 + lx) * 0.05;
    ctx.save(); ctx.translate(x, -180); ctx.rotate(sw);
    seg(ctx, 0, 0, 0, 216, '#120a06', 2.5);
    glow(ctx, 0, 238, 330, '#ffc878', 0.3 * flick(t, lx) + 0.06);
    poly(ctx, [[-30, 232], [30, 232], [15, 208], [-15, 208]], '#2a2a26');
    rect(ctx, -9, 232, 18, 15, '#fff0c0');
    ctx.restore();
  }
  // the near table edge
  ctx.fillStyle = vgrad(ctx, 640, 800, [[0, '#5a3a20'], [1, '#22140a']]); ctx.fillRect(X0, 668, XW, 300);
  rect(ctx, X0, 662, XW, 8, '#7a5230');
}, (ctx, t, px) => {
  for (let i = 0; i < 5; i++) {
    const x = mod(rnd(i * 3) * 1700 + t * 9, 1700) - 220 + px;
    ctx.fillStyle = 'rgba(255,236,206,.045)'; ctx.beginPath(); ctx.ellipse(x, 380 + i * 60, 300, 44, 0, 0, TAU); ctx.fill();
  }
});

// ── shore-dusk ──
def('shore-dusk', { amb: '#2a1c3a', rim: '#ff9d5c', key: 1 }, (ctx, t, px) => {
  ctx.translate(0, -52);
  fillAll(ctx, vgrad(ctx, -180, 436, [[0, '#0c1028'], [0.45, '#3a2a5e'], [0.8, '#b3506a'], [1, '#f39c5a']]));
  stars(ctx, 12, 90, 240, t);
  glow(ctx, 420 + px * 0.05, 440, 520, '#ffb060', 0.5);
  ctx.strokeStyle = '#f4ecd8'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(1040 + px * 0.05, 120, 24, Math.PI * 0.6, Math.PI * 1.5); ctx.stroke();
  for (let i = 0; i < 9; i++) {
    const x = mod(rnd(i * 3) * 1800 + t * (2 + rnd(i) * 2), 1800) - 260 + px * 0.1, y = 210 + rnd(i * 7) * 190, w = 120 + rnd(i * 2) * 200;
    ctx.fillStyle = 'rgba(40,24,60,.6)'; ctx.beginPath(); ctx.ellipse(x, y, w, 9 + rnd(i * 9) * 8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,150,90,.4)'; ctx.beginPath(); ctx.ellipse(x - 8, y + 7, w * 0.9, 4, 0, 0, TAU); ctx.fill();
  }
  // the headland and the pit, small now
  const hx = 1130 + px * 0.15;
  ctx.fillStyle = '#1e1630'; ctx.beginPath(); ctx.moveTo(1560, 440); ctx.lineTo(1560, 350); ctx.bezierCurveTo(hx + 200, 330, hx - 20, 372, hx - 280, 440); ctx.fill();
  ctx.strokeStyle = '#1e1630'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(hx + 40, 372); ctx.lineTo(hx + 56, 304); ctx.lineTo(hx + 72, 372); ctx.stroke(); ctx.beginPath(); ctx.arc(hx + 56, 300, 9, 0, TAU); ctx.stroke();
  for (let i = 0; i < 7; i++) rect(ctx, hx - 60 + i * 44 + rnd(i) * 20, 386 - rnd(i * 3) * 22, 3, 3, rgba('#ffcf7a', 0.5 + 0.4 * Math.sin(t * 0.8 + i)));
  // sea
  ctx.fillStyle = vgrad(ctx, 436, 580, [[0, '#d4795a'], [0.4, '#6a3f6a'], [1, '#232750']]); ctx.fillRect(X0, 436, XW, 150);
  waterStreaks(ctx, 61, 200, 660, 440, 570, 70, '#ffc890', t, 0.8);
  waterStreaks(ctx, 63, X0, 1540, 440, 580, 90, '#ffb8a0', t, 0.3);
  // sand, and the tide that goes out further than it should
  ctx.fillStyle = vgrad(ctx, 570, 800, [[0, '#5a4058'], [0.25, '#33263c'], [1, '#120e1c']]); ctx.fillRect(X0, 570, XW, 440);
  ctx.fillStyle = vgrad(ctx, 570, 640, [[0, 'rgba(240,150,100,.34)'], [1, 'rgba(240,150,100,0)']]); ctx.fillRect(X0, 570, XW, 70);
  for (let i = 0; i < 4; i++) {
    const adv = Math.sin(t * 0.45 - i * 0.9) * 14, y0 = 572 + i * 15 + adv;
    ctx.strokeStyle = `rgba(255,236,226,${0.55 - i * 0.11})`; ctx.lineWidth = 2.6 - i * 0.4;
    ctx.beginPath();
    for (let x = X0; x <= 1540; x += 26) { const y = y0 + Math.sin(x * 0.011 + i * 2 + t * 0.3) * 6 + Math.sin(x * 0.037 + i) * 2.5; x === X0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
  }
  // driftwood
  ctx.strokeStyle = '#17101c'; ctx.lineWidth = 11; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(200 + px * 0.8, 668); ctx.quadraticCurveTo(310 + px * 0.8, 640, 440 + px * 0.8, 660); ctx.stroke();
  ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(330 + px * 0.8, 650); ctx.lineTo(360 + px * 0.8, 618); ctx.stroke(); ctx.lineCap = 'butt';
  // the fire
  const fx = 640 + px * 0.9, fy = 664;
  glow(ctx, fx, fy - 20, 440, '#ff8a2a', 0.3 * flick(t, 8) + 0.08);
  ctx.fillStyle = 'rgba(255,150,70,.12)'; ctx.beginPath(); ctx.ellipse(fx, fy + 6, 240, 30, 0, 0, TAU); ctx.fill();
  flame(ctx, fx - 14, fy, 30, t, 1); flame(ctx, fx + 16, fy, 24, t, 4); flame(ctx, fx, fy - 2, 18, t, 7);
  seg(ctx, fx - 50, fy + 6, fx + 44, fy - 6, '#1c0e0a', 11); seg(ctx, fx - 40, fy - 8, fx + 52, fy + 8, '#26120c', 10);
  for (let i = 0; i < 8; i++) { ctx.fillStyle = '#231a26'; ctx.beginPath(); ctx.ellipse(fx + Math.cos(i * 0.785) * 66, fy + 8 + Math.sin(i * 0.785) * 12, 11, 7, 0, 0, TAU); ctx.fill(); }
  // dune grass
  for (let i = 0; i < 60; i++) {
    const side = i % 2, x = (side ? 1280 + 200 - rnd(i) * 330 : -200 + rnd(i) * 330) + px * 1.2, h = 70 + rnd(i * 3) * 120, sw = Math.sin(t * 1.2 + i) * 14 + (side ? -20 : 20);
    ctx.strokeStyle = '#0c0914'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x, 810); ctx.quadraticCurveTo(x + sw * 0.3, 810 - h * 0.6, x + sw, 810 - h); ctx.stroke();
  }
}, (ctx, t, px) => {
  ctx.translate(0, -52);
  motes(ctx, 23, 30, '#ffb060', t, { x0: 540 + px * 0.9, x1: 750 + px * 0.9, y0: 300, y1: 660, vx: 10, vy: -80, r: 1.8, a: 0.9, tw: 1, wob: 20 });
});

/** every backdrop key this renderer implements */
export const BACKDROPS = Object.keys(P);

// ───────────────────────── staging ─────────────────────────
const BAR = 56;          // letterbox bar height
const STAGE_Y = 478;     // where the base of a neck sits at wide framing
const FIG = 1.3;         // local figure units -> stage pixels

/** how many characters of a line are on screen after lineT seconds: the text lands over the first half of the line */
function revealCount(line, lineT) {
  const len = line.text.length;
  const words = line.text.split(/\s+/).length;
  const est = 1.4 + words * 0.34;
  const cps = Math.max(34, len / (est * 0.5));
  return Math.min(len, Math.floor(lineT * cps));
}

// Retained view state: the resolved stage of every line of a cinematic, keyed by the identity of cine.lines.
const _views = new WeakMap();
function viewOf(lines) {
  let v = _views.get(lines);
  if (!v) {
    v = { stages: [] };
    let bg = 'black', on = [];
    for (const l of lines) {
      if (l.bg !== undefined) bg = l.bg;
      if (l.on !== undefined) on = l.on;
      v.stages.push({ bg, on });
    }
    _views.set(lines, v);
  }
  return v;
}

/** who stands where for one line, and where the camera wants to be */
function layout(cast, line, on) {
  const ids = [];
  let crowd = false;
  for (const id of on) {
    if (!cast[id]) throw new Error(`cinema: line ${line.id} puts unknown cast id '${id}' on stage`);
    if (id === 'narrator') continue;                         // the Ledger is a voice, never a body
    if (id === 'crowd') { crowd = true; continue; }          // drawn as figures in the dark, behind
    if (line.fx === 'radio' && id === line.who) continue;    // on the Line: in the ear, not in the room
    if (!ids.includes(id)) ids.push(id);
  }
  const n = ids.length;
  const scale = n <= 3 ? 1 : n === 4 ? 0.88 : 0.76;
  const span = n <= 1 ? 0 : Math.min(780, 400 * (n - 1));
  const xs = {};
  ids.forEach((id, i) => { xs[id] = n === 1 ? 640 : 640 - span / 2 + (span * i) / (n - 1); });
  const speaker = ids.includes(line.who) ? line.who : null;
  const sx = speaker ? xs[speaker] : 640;
  const camName = line.cam === undefined ? 'wide' : line.cam;
  let cam;
  switch (camName) {
    case 'wide': cam = { z: 1, cx: 640, cy: 400, low: 0 }; break;
    case 'close': cam = speaker ? { z: 1.5, cx: sx, cy: 352, low: 0 } : { z: 1.12, cx: 640, cy: 390, low: 0 }; break;
    case 'two': {
      let ox = 640;
      if (speaker && n >= 2) {
        let best = Infinity;
        for (const id of ids) if (id !== speaker && Math.abs(xs[id] - sx) < best) { best = Math.abs(xs[id] - sx); ox = xs[id]; }
      } else if (n >= 2) ox = xs[ids[0]] + xs[ids[1]] - sx;
      cam = { z: n >= 2 ? 1.26 : 1.16, cx: (sx + ox) / 2, cy: 372, low: 0 };
      break;
    }
    case 'low': cam = { z: 1.12, cx: sx, cy: 400, low: 1 }; break;
    default: throw new Error(`cinema: unknown cam '${camName}' on line ${line.id} (wide, close, two, low)`);
  }
  return { ids, xs, scale, speaker, crowd, cam };
}

/** the face a listener is still wearing: their own most recent line, if it was recent */
function lastEmote(lines, index, id) {
  for (let i = index; i >= 0 && i >= index - 3; i--) if (lines[i].who === id) return lines[i].emote;
  return undefined;
}

function drawSubtitle(ctx, who, line, lineT) {
  ctx.fillStyle = vgrad(ctx, 548, H, [[0, 'rgba(0,0,0,0)'], [0.45, 'rgba(0,0,0,.66)'], [1, 'rgba(0,0,0,.93)']]);
  ctx.fillRect(0, 548, W, H - 548);
  const narr = line.who === 'narrator';
  let size = 30, lh = 39;
  const maxW = narr ? 900 : 950;
  const style = narr ? 'italic ' : '';
  ctx.font = `${style}${size}px ${FONT_SERIF}`;
  let rows = wrapText(ctx, line.text, maxW);
  if (rows.length > 3) { size = 25; lh = 32; ctx.font = `${style}${size}px ${FONT_SERIF}`; rows = wrapText(ctx, line.text, maxW); }
  const x0 = 170, nameY = 618, textY = 662;
  ctx.textBaseline = 'alphabetic';
  ctx.save();
  // nameplate
  if (narr) {
    ctx.textAlign = 'center';
    ctx.font = `600 14px ${FONT_UI}`;
    ctx.fillStyle = who.color;
    ctx.shadowColor = 'rgba(255,255,255,.3)'; ctx.shadowBlur = 8;
    ctx.fillText(spaced(who.name.toUpperCase()), W / 2, nameY);
    ctx.shadowBlur = 0;
    const nw = ctx.measureText(spaced(who.name.toUpperCase())).width;
    seg(ctx, W / 2 - nw / 2 - 70, nameY - 5, W / 2 - nw / 2 - 14, nameY - 5, 'rgba(255,255,255,.3)', 1);
    seg(ctx, W / 2 + nw / 2 + 14, nameY - 5, W / 2 + nw / 2 + 70, nameY - 5, 'rgba(255,255,255,.3)', 1);
  } else {
    ctx.textAlign = 'left';
    ctx.fillStyle = who.color;
    ctx.fillRect(x0 - 20, nameY - 23, 6, 30);
    ctx.font = `700 23px ${FONT_UI}`;
    ctx.shadowColor = 'rgba(255,255,255,.28)'; ctx.shadowBlur = 9;
    ctx.fillText(who.name, x0, nameY);
    ctx.shadowBlur = 0;
    const nw = ctx.measureText(who.name).width;
    ctx.font = `italic 17px ${FONT_SERIF}`;
    ctx.fillStyle = 'rgba(236,228,214,.66)';
    ctx.fillText(line.fx === 'radio' ? `${who.role}  ·  on the Line` : who.role, x0 + nw + 16, nameY - 1);
  }
  // the words
  ctx.font = `${style}${size}px ${FONT_SERIF}`;
  ctx.lineJoin = 'round';
  let left = revealCount(line, lineT);
  for (let i = 0; i < rows.length && left > 0; i++) {
    const row = rows[i];
    const part = left >= row.length ? row : row.slice(0, left);
    const x = narr ? W / 2 - ctx.measureText(row).width / 2 : x0;
    const y = textY + i * lh;
    ctx.textAlign = 'left';
    ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineWidth = 5;
    ctx.strokeText(part, x, y);
    ctx.shadowColor = 'rgba(0,0,0,.9)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
    ctx.fillStyle = line.fx === 'radio' ? '#dff5ee' : narr ? '#f0e6d0' : '#fbf6ea';
    ctx.fillText(part, x, y);
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    left -= row.length + 1;
  }
  ctx.restore();
}
const spaced = (s) => s.split('').join('  ');

function keycap(ctx, label, xRight, y) {
  ctx.font = `600 11px ${FONT_UI}`;
  const w = ctx.measureText(label).width + 12;
  rr(ctx, xRight - w, y - 13, w, 18, 4);
  ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.textAlign = 'center';
  ctx.fillText(label, xRight - w / 2, y);
  return xRight - w;
}
function drawHints(ctx) {
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  let x = W - 28;
  const y = H - 17;
  const word = (s) => {
    ctx.font = `12px ${FONT_UI}`; ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.textAlign = 'right';
    ctx.fillText(s, x, y); x -= ctx.measureText(s).width + 7;
  };
  word('skip scene'); x = keycap(ctx, 'S', x, y) - 18;
  word('next'); keycap(ctx, 'Enter', x, y);
  ctx.restore();
}

/** a voice in the ear: the small inset that stands in for a body on stage */
function drawRadioInset(ctx, who, line, level, tms, t) {
  const x = 926, y = BAR + 26, w = 322, h = 98;
  ctx.save();
  rr(ctx, x, y, w, h, 12);
  ctx.fillStyle = 'rgba(3,16,18,.86)'; ctx.fill();
  ctx.strokeStyle = 'rgba(110,245,220,.55)'; ctx.lineWidth = 1.5; ctx.stroke();
  // portrait roundel
  const cx = x + 50, cy = y + h / 2;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, 36, 0, TAU); ctx.fillStyle = '#04171a'; ctx.fill(); ctx.clip();
  if (who.look && who.id !== 'crowd' && who.id !== 'narrator') {
    ctx.translate(cx, cy + 33); ctx.scale(0.345, 0.345);
    drawFigure(ctx, who, { emote: line.emote, talk: level, focus: 0.8, light: LINE_LIGHT, facing: 1, gaze: 0.2, t });
  } else {
    ctx.strokeStyle = 'rgba(110,245,220,.7)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy - 2, 14, Math.PI * 0.9, Math.PI * 2.1); ctx.stroke();
    circ(ctx, cx + 11, cy + 9, 5, 'rgba(110,245,220,.7)');
  }
  ctx.restore();
  ctx.strokeStyle = '#b08a3e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, 37, 0, TAU); ctx.stroke();
  // wave
  ctx.save();
  ctx.beginPath(); ctx.rect(x + 98, y + 28, w - 112, h - 36); ctx.clip();
  seg(ctx, x + 98, y + 60, x + w - 14, y + 60, 'rgba(70,220,196,.2)', 1);
  waveform(ctx, x + 98, x + w - 14, y + 60, 46, level * 0.8, tms * 1.3 + 700, 'rgba(70,220,196,.35)', 1.5);
  waveform(ctx, x + 98, x + w - 14, y + 60, 60, level, tms, 'rgba(110,245,220,.95)', 2);
  ctx.restore();
  ctx.font = `600 11px ${FONT_MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(110,245,220,.8)';
  ctx.fillText('THE LINE', x + 98, y + 21);
  if (mod(t, 1.2) < 0.7) circ(ctx, x + w - 22, y + 17, 4, '#ff5a4a');
  ctx.restore();
}

/**
 * Draw the whole frame for the running cinematic.
 * fx: { timeMs, voiceLevel 0..1, flash, shake }
 *   flash: falsy, a number 0..1 (white), or { color, a }
 *   shake: falsy or a number of pixels
 */
export function drawCinema(ctx, content, game, fx) {
  const cine = game && game.cine;
  if (!cine) throw new Error(`cinema: drawCinema called with no running cinematic (game.cine is ${String(cine)})`);
  if (!fx || typeof fx.timeMs !== 'number') throw new Error(`cinema: fx.timeMs must be a number, got ${fx && String(fx.timeMs)}`);
  const lines = cine.lines;
  const line = lines[cine.index];
  if (!line) throw new Error(`cinema: line index ${cine.index} is out of range (0..${lines.length - 1})`);
  const cast = content.cast;
  const who = cast[line.who];
  if (!who) throw new Error(`cinema: line ${line.id} is spoken by unknown cast id '${line.who}'`);
  const bgNow = P[cine.bg];
  if (!bgNow) throw new Error(`cinema: unknown backdrop key '${cine.bg}' on line ${line.id} (known: ${BACKDROPS.join(', ')})`);

  const view = viewOf(lines);
  const T = fx.timeMs / 1000;
  const lt = cine.lineT;
  const level = clamp(fx.voiceLevel || 0);
  const prevLine = cine.index > 0 ? lines[cine.index - 1] : null;
  const prevStage = prevLine ? view.stages[cine.index - 1] : null;
  const L1 = layout(cast, line, cine.on);
  const L0 = prevStage ? layout(cast, prevLine, prevStage.on) : null;

  // camera: ease from the last line's framing to this one, then keep creeping in
  const ce = L0 ? ease(lt / 0.7) : 1;
  const c0 = L0 ? L0.cam : L1.cam;
  const z = lerp(c0.z, L1.cam.z, ce) * (1 + 0.03 * ease(lt / 8));
  const low = lerp(c0.low, L1.cam.low, ce);
  const cx = clamp(lerp(c0.cx, L1.cam.cx, ce), W / 2 / z, W - W / 2 / z);
  const cy = clamp(lerp(c0.cy, L1.cam.cy, ce), H / 2 / z, H - H / 2 / z);
  const px = Math.sin(T * 0.07) * 16 + (cx - W / 2) * 0.06;

  const info = {
    tms: fx.timeMs, level: line.fx === 'radio' ? level : 0, lineT: lt, lines, index: cine.index,
    portrait: line.fx === 'radio' ? who : cast.thorne || null,
    portraitEmote: line.fx === 'radio' ? line.emote : lastEmote(lines, cine.index, 'thorne'),
  };

  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // shake
  if (fx.shake) {
    if (typeof fx.shake !== 'number') throw new Error(`cinema: fx.shake must be a number of pixels, got ${String(fx.shake)}`);
    const p = Math.min(24, fx.shake);
    ctx.translate(Math.sin(fx.timeMs * 0.09) * p, Math.cos(fx.timeMs * 0.113) * p * 0.7);
  }

  // ── the picture, inside the letterbox ──
  const bar = BAR * ease(cine.t / 0.9);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, bar, W, H - bar * 2); ctx.clip();

  // backdrop: moves less than the cast does
  const zb = 1.06 + (z - 1) * 0.4;
  const bcx = W / 2 + (cx - W / 2) * 0.4, bcy = H / 2 + (cy - H / 2) * 0.4 - low * 34;
  const bgTf = () => { ctx.translate(W / 2, H / 2); ctx.scale(zb, zb); ctx.translate(-bcx, -bcy); };
  const mixBg = prevStage && prevStage.bg !== cine.bg ? ease(lt / 0.9) : 1;
  ctx.save();
  bgTf();
  if (mixBg < 1) {
    const bgPrev = P[prevStage.bg];
    if (!bgPrev) throw new Error(`cinema: unknown backdrop key '${prevStage.bg}' on a line before ${line.id}`);
    bgPrev.back(ctx, T, px, info);
    if (bgPrev.front) bgPrev.front(ctx, T, px, info);
  }
  fade(ctx, mixBg, () => bgNow.back(ctx, T, px, info));
  ctx.restore();

  const light = bgNow.light;
  // a little air between the backdrop and the people, and a floor of shadow for them to stand in
  ctx.fillStyle = rgba(light.amb, 0.16);
  ctx.fillRect(0, 0, W, H);

  const stTf = () => { ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-cx, -cy); };
  ctx.save();
  stTf();
  if (L1.crowd || (L0 && L0.crowd)) {
    const a = L1.crowd && (!L0 || L0.crowd) ? 1 : L1.crowd ? ease(lt / 0.5) : 1 - ease(lt / 0.4);
    fade(ctx, a, () => drawCrowdFigures(ctx, light, T, line.who === 'crowd', level));
  }
  // everyone who is on stage now, or was a line ago
  const ids = L1.ids.slice();
  if (L0) for (const id of L0.ids) if (!ids.includes(id)) ids.push(id);
  const me = ease(lt / 0.6), fe = ease(lt / 0.4);
  const figs = ids.map((id) => {
    const in1 = L1.ids.includes(id), in0 = L0 ? L0.ids.includes(id) : in1;
    const xTo = in1 ? L1.xs[id] : L0.xs[id] + (L0.xs[id] >= W / 2 ? 110 : -110);
    const xFrom = in0 && L0 ? L0.xs[id] : xTo + (xTo >= W / 2 ? 110 : -110);
    const f1 = in1 ? (L1.speaker ? (id === L1.speaker ? 1 : 0) : 0.5) : 0;
    const f0 = in0 && L0 ? (L0.speaker ? (id === L0.speaker ? 1 : 0) : 0.5) : f1;
    return {
      id,
      x: lerp(xFrom, xTo, me),
      alpha: in1 && in0 ? 1 : in1 ? ease(lt / 0.5) : 1 - ease(lt / 0.4),
      focus: lerp(f0, f1, fe),
      scale: lerp(in0 && L0 ? L0.scale : L1.scale, in1 ? L1.scale : L0.scale, me),
    };
  });
  const spk = figs.find((f) => f.id === L1.speaker);
  figs.sort((a, b) => a.focus - b.focus);
  for (const f of figs) {
    const m = cast[f.id];
    const isSpk = f.id === line.who && L1.speaker === f.id;
    let facing;
    if (isSpk) {
      const others = figs.filter((o) => o !== f);
      const mean = others.length ? others.reduce((s, o) => s + o.x, 0) / others.length : f.x + 1;
      facing = mean >= f.x ? 1 : -1;
    } else if (spk) facing = spk.x >= f.x ? 1 : -1;
    else facing = f.x <= W / 2 ? 1 : -1;
    const k = lookOf(m);
    const s = FIG * f.scale * k.s * (1 + 0.05 * f.focus) * (1 + low * 0.13);
    ctx.save();
    ctx.translate(f.x, STAGE_Y + low * 34 - f.focus * 6 + (1 - k.s) * 60);
    ctx.scale(s, s);
    fade(ctx, f.alpha, () => drawFigure(ctx, m, {
      emote: isSpk ? line.emote : lastEmote(lines, cine.index, f.id),
      talk: isSpk ? level : 0,
      focus: f.focus,
      light,
      facing,
      gaze: isSpk && L1.cam.z > 1.4 ? 0.35 : 1,
      t: T,
    }));
    ctx.restore();
  }
  ctx.restore();

  // what hangs in the air in front of them
  if (bgNow.front) {
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.scale(lerp(zb, z, 0.5), lerp(zb, z, 0.5)); ctx.translate(-lerp(bcx, cx, 0.5), -lerp(bcy, cy, 0.5));
    fade(ctx, mixBg, () => bgNow.front(ctx, T, px * 1.4, info));
    ctx.restore();
  }
  vignette(ctx, 0.5 + low * 0.15);
  ctx.restore(); // letterbox clip

  // ── over the picture ──
  if (line.fx === 'radio' && cine.bg !== 'line') {
    fade(ctx, ease(lt / 0.25), () => drawRadioInset(ctx, who, line, level, fx.timeMs, T));
  }
  drawSubtitle(ctx, who, line, lt);

  // the top bar: where we are in the book
  const chapter = content.chapters && content.chapters[game.chapter];
  ctx.textBaseline = 'alphabetic';
  if (chapter && bar > 30) {
    ctx.font = `600 12px ${FONT_UI}`; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,.42)';
    let label = `CHAPTER ${chapter.number}  ·  ${String(chapter.title).toUpperCase()}`;
    if (cine.kind === 'prologue') label += '  ·  PROLOGUE';
    else if (cine.kind === 'epilogue') label += '  ·  EPILOGUE';
    else if (cine.kind === 'scene') { const sc = chapter.scenes && chapter.scenes[game.scene]; if (sc) label += `  ·  ${String(sc.title).toUpperCase()}`; }
    else throw new Error(`cinema: unknown cine.kind '${cine.kind}'`);
    ctx.fillText(spaced(label), 30, 33);
    ctx.textAlign = 'right';
    ctx.fillText(`${cine.index + 1} / ${lines.length}`, W - 30, 33);
  }
  drawHints(ctx);

  // flash
  if (fx.flash) {
    if (typeof fx.flash === 'number') { ctx.fillStyle = `rgba(255,255,255,${clamp(fx.flash)})`; ctx.fillRect(-40, -40, W + 80, H + 80); }
    else if (typeof fx.flash === 'object' && typeof fx.flash.color === 'string' && typeof fx.flash.a === 'number') {
      fade(ctx, fx.flash.a, () => { ctx.fillStyle = fx.flash.color; ctx.fillRect(-40, -40, W + 80, H + 80); });
    } else throw new Error(`cinema: fx.flash must be a number or { color, a }, got ${JSON.stringify(fx.flash)}`);
  }
  // fade up from black as the film begins
  if (cine.t < 0.8) { ctx.fillStyle = `rgba(0,0,0,${1 - ease(cine.t / 0.8)})`; ctx.fillRect(-40, -40, W + 80, H + 80); }
  ctx.restore();
}
