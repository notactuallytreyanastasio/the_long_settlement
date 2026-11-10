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
  const a = 0.14 + 0.36 * (1 - focus);
  const d = 1 - 0.2 * (1 - focus);
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

function hairBack(ctx, k, cy, f, col, colSh) {
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
        const a = Math.PI * (1.02 + (i / 10) * 0.96 - 0.5 + 0.5) + 0;
        const ang = Math.PI + (i / 10) * Math.PI;
        const r = hw + 8 + rnd(k.seed * 50 + i) * 6;
        ctx.beginPath(); ctx.arc(Math.cos(ang) * r, cy - 16 + Math.sin(ang) * (r + 8) + a * 0, 19 + rnd(k.seed * 9 + i) * 6, 0, TAU); ctx.fill();
      }
      for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * (hw + 6), cy + 12, 17, 0, TAU); ctx.fill(); }
      break;
    case 'scarf':
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
      capPath(ctx, hw, cy, 0, -44, -f * 6); ctx.fill(); hi(0);
      break;
    case 'swept':
      capPath(ctx, hw, cy, 9, -40, -f * 22); ctx.fill();
      ctx.strokeStyle = colHi; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(-f * 22 + f * i * 5, cy - 46 - i * 5);
        ctx.quadraticCurveTo(f * 12, cy - 74 - i * 5, f * (hw - 8), cy - 40 - i * 7); ctx.stroke();
      }
      ctx.lineCap = 'butt';
      break;
    case 'long':
    case 'bob': {
      capPath(ctx, hw, cy, 6, k.style === 'bob' ? -30 : -40, -f * 10); ctx.fill();
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
      capPath(ctx, hw, cy, 1, -47, 0); ctx.fill(); hi(0);
      if (k.style === 'braid') {
        const sx = -f;
        for (let i = 0; i < 9; i++) {
          ctx.fillStyle = i % 2 ? col : colHi;
          ctx.beginPath();
          ctx.ellipse(sx * (hw + 2 + i * 1.6) + (i % 2 ? 3 : -3), cy + 30 + i * 19, 10, 13, (i % 2 ? 0.5 : -0.5), 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = tone(k.trim);
        ctx.fillRect(sx * (hw + 16) - 7, cy + 30 + 9 * 19 - 8, 14, 7);
      }
      break;
    case 'curls':
      capPath(ctx, hw, cy, 8, -42, 0); ctx.fill();
      for (let i = 0; i < 7; i++) {
        const u = i / 6;
        ctx.fillStyle = i % 2 ? col : colHi;
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
      capPath(ctx, hw + 3, cy, 5, -52, 0); ctx.fill();
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
  const w = 15 * far;
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
  ctx.beginPath(); ctx.moveTo(-w, 1.5); ctx.quadraticCurveTo(0, -14 * open, w, 1.5);
  ctx.lineTo(w + sgn * 0 + (sgn > 0 ? 3 : 0) - (sgn < 0 ? 0 : 0), 0);
  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(sgn * w, 1.5); ctx.lineTo(sgn * (w + 4), -2); ctx.stroke();
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
  ctx.save(); headTf(); hairBack(ctx, k, cy, f, hairC, hairSh); ctx.restore();

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
  if (k.has(/chain|medallion|office/)) {
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
  ctx.strokeStyle = rgba(o.light.rim, rimA); ctx.lineWidth = 3;
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
    ctx.beginPath(); ctx.arc(sx * (hw + 1), cy + 8, 5, sx > 0 ? -1.2 : Math.PI - 1.2 + 2.4 - 2.4, sx > 0 ? 1.2 : Math.PI + 1.2); ctx.stroke();
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
  for (const sgn of [-1, 1]) drawEye(ctx, fx0 + sgn * 24, ey, sgn, E, blink, gaze, k, tone, f);

  // brows
  ctx.strokeStyle = tone(mix(k.hair, '#1a0c0c', k.lines >= 2 ? 0.1 : 0.35));
  ctx.lineWidth = k.lines >= 2 ? 5 : 5.5; ctx.lineCap = 'round';
  for (const sgn of [-1, 1]) {
    const ex = fx0 + sgn * 24, by = cy - 19 - (E.open - 1) * 6;
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
  ctx.quadraticCurveTo(fx0 + f * 10, cy + 24, fx0 + f * 7, cy + 30);
  ctx.quadraticCurveTo(fx0 + f * 2, cy + 34, fx0 - f * 4, cy + 30);
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
    const w = 17 * E.mw * (1 - talk * 0.08);
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
      ctx.fillStyle = tone('#a23a44');
      ctx.beginPath(); ctx.ellipse(mx, midY + openA * 22 + 6, w * 0.62, 7, 0, 0, TAU); ctx.fill();
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
    ctx.strokeStyle = tone(mix(k.skin, '#fff', 0.35)); ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(fx0 - f * 36, cy - 30); ctx.lineTo(fx0 - f * 27, cy + 22); ctx.stroke();
    ctx.strokeStyle = rgba(skinSh, 0.8); ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) { const u = 0.15 + i * 0.22; ctx.beginPath(); ctx.moveTo(fx0 - f * lerp(36, 27, u) - 4, cy + lerp(-30, 22, u)); ctx.lineTo(fx0 - f * lerp(36, 27, u) + 4, cy + lerp(-30, 22, u) + 1); ctx.stroke(); }
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
  ctx.beginPath(); ctx.rect(key > 0 ? 6 : -hw - 20, cy - 20, hw + 14, 120); ctx.clip();
  headPath(ctx, k, cy);
  ctx.strokeStyle = rgba(o.light.rim, rimA); ctx.lineWidth = 3;
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
  for (let i = 0; i < 5; i++) {
    const x = 120 + i * 262 + rnd(i * 3.3) * 40;
    const y = 420 + rnd(i * 5.1) * 30 + Math.sin(t * 1.1 + i * 2) * 2 - (speaking && i === 2 ? level * 5 : 0);
    const s = 0.92 + rnd(i * 7) * 0.2;
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
    const s = (size / 205) * (1 / lookOf(member).s) * 1.0;
    ctx.translate(x + size / 2, y + size * 0.88);
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

//@@BACKDROPS@@
