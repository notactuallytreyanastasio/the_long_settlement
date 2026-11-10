// The cinematic renderer. Canvas 2D. The paintings are composed in a 1280x800 stage space.
//
// When a cutscene runs the game leaves the machine and becomes a film: painted
// backdrops, the cast on stage, subtitles. Nothing is loaded: everything is drawn
// from vectors. On a wide screen the film is letterboxed across the whole canvas.
// On a phone held upright the painting fills the top of the screen, cropped to
// follow whoever is speaking, and the words go underneath it.
//
//   drawCinema(ctx, content, game, fx, layout)   the whole frame for game.cine
//   cinemaCache                             the still-layer cache: { enabled, stats(), clear() }
//   releaseCinema()                         free every offscreen canvas now (it happens by itself 2s after the last frame)
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
//
// Speed: no shadowBlur anywhere. The parts of a backdrop that do not move are
// painted once into offscreen canvases (see S() and A() below) and only what
// moves is drawn each frame; glows and the vignette are cached sprites.

import {
  W, H, TAU, clamp, lerp, ease, mod, rgba, fade, vgrad, circ, seg, poly, rr, wrapText, FONT_UI, FONT_SERIF, FONT_MONO, HAS_DOM, newCanvas,
  freeCanvas, NULL_CTX, cinemaCache, stillsFor, S, buildStills, paintBackdrop, _baked, baked, vignette, waveform, P, LINE_LIGHT, LINE_ID,
  revealCount,
} from './cinema/kit.js';
import { lookOf, breathOf, blinking, drawFigure, drawCrowdFigures } from './cinema/figures.js';
import { spriteBounds } from './cinema/figures.js';
import { BACKDROPS_A } from './cinema/backdrops-a.js';
import { BACKDROPS_B } from './cinema/backdrops-b.js';
export { cinemaCache } from './cinema/kit.js';
export { drawPortrait } from './cinema/figures.js';

// the painter table: every backdrop, in the order the two files define them
Object.assign(P, BACKDROPS_A, BACKDROPS_B);
/** every bg key implemented */
export const BACKDROPS = Object.keys(P);

// ───────────────────────── staging ─────────────────────────
const BAR = 56;          // letterbox bar height (wide)
const STAGE_Y = 478;     // where the base of a neck sits at wide framing
const FIG = 1.3;         // local figure units -> stage pixels
const INSET_W = 322, INSET_H = 98;   // the earpiece inset

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

// ── the frame: where on the canvas the film goes ──
// The paintings are composed in a 1280x800 stage space. 'wide' shows all of it. 'portrait' shows a window of it
// as tall as the art rectangle and only as wide as that rectangle allows (a cover crop): about the middle half.
const WIDE_FRAME = { kind: 'wide', W, H, art: { x: 0, y: 0, w: W, h: H }, s0: 1, vw: W, vh: H, text: null, skip: null };
function needRect(r, name) {
  if (!r || ![r.x, r.y, r.w, r.h].every(Number.isFinite) || r.w <= 0 || r.h <= 0) throw new Error(`cinema: layout.${name} must be { x, y, w, h } with a positive size, got ${JSON.stringify(r)}`);
  return r;
}
function frameOf(layout) {
  if (layout === undefined || layout === null) return WIDE_FRAME;
  if (layout.kind === 'wide') {
    if (layout.W !== W || layout.H !== H) throw new Error(`cinema: a wide layout must be ${W}x${H}, got ${layout.W}x${layout.H}`);
    return { ...WIDE_FRAME, skip: needRect(layout.skip, 'skip') };   // the film as it always was, plus the button a finger needs
  }
  if (layout.kind !== 'portrait') throw new Error(`cinema: unknown layout.kind '${layout.kind}' (portrait, wide)`);
  if (!(layout.W > 0) || !(layout.H > 0)) throw new Error(`cinema: layout.W and layout.H must be positive, got ${layout.W}x${layout.H}`);
  if (!layout.cine) throw new Error('cinema: a portrait layout needs layout.cine { art, text }');
  const art = needRect(layout.cine.art, 'cine.art'), text = needRect(layout.cine.text, 'cine.text'), skip = needRect(layout.skip, 'skip');
  const s0 = Math.max(art.w / W, art.h / H);
  return { kind: 'portrait', W: layout.W, H: layout.H, art, s0, vw: art.w / s0, vh: art.h / s0, text, skip };
}
// Where the middle of the portrait window sits on each painting, when the middle of the painting is not the picture.
const PORTRAIT_PAN = {
  ledger: 380, line: 330, bench: 600, cell: 680, 'hidden-lamp': 590, 'proctor-office': 700, 'corvane-study': 660, 'harbor-night': 600,
  'commons-queue': 700, 'exchange-steps': 880, 'academy-yard': 690, 'wreck-shore': 600, orrery: 500,
};
const PORTRAIT_REACH = 280;   // how far from the middle of the stage the portrait camera may travel
const panOf = (F, key) => (F.kind === 'portrait' && PORTRAIT_PAN[key] !== undefined ? PORTRAIT_PAN[key] : W / 2);
/** the stage rectangle the still layers of one backdrop must cover, and at what resolution */
function stillsConfig(F, key, dev) {
  if (!HAS_DOM || !cinemaCache.enabled) return null;
  let x = -70, w = W + 140;
  if (F.kind === 'portrait') { const half = F.vw / 2.12 + PORTRAIT_REACH * 0.4 + 78; x = panOf(F, key) - half; w = half * 2; }
  const y = -50, h = H + 100;
  const k = Math.ceil(dev * F.s0 * 1.06 * 10) / 10;       // the resolution the backdrop is seen at in a wide shot
  if (w * h * k * k > cinemaCache.budget) return null;   // a retina desktop: too many pixels to hold, and a GPU that does not need it
  return { id: `${F.kind}|${Math.round(x)}|${Math.round(w)}|${k}`, x, y, w, h, k };
}

/** who stands where for one line, and where the camera wants to be */
function stageOf(cast, line, on, F) {
  const ids = [];
  let crowd = false;
  for (const id of on) {
    if (!cast[id]) throw new Error(`cinema: line ${line.id} puts unknown cast id '${id}' on stage`);
    if (id === 'narrator') continue;                         // the Ledger is a voice, never a body
    if (id === 'crowd') { crowd = true; continue; }          // drawn as figures in the dark, behind
    if (line.fx === 'radio' && id === line.who && id === LINE_ID) continue;   // live on the Line: in the ear, not in the room
    if (!ids.includes(id)) ids.push(id);
  }
  const n = ids.length;
  const tall = F.kind === 'portrait';
  // A phone shows half the width of the stage, so there the cast stand shoulder behind shoulder instead of in a row.
  const scale = tall ? (n <= 2 ? 1 : n === 3 ? 0.94 : 0.86) : n <= 3 ? 1 : n === 4 ? 0.88 : 0.76;
  const gap = tall ? (n <= 2 ? 250 : n === 3 ? 200 : 160) : 400;
  const span = n <= 1 ? 0 : tall ? gap * (n - 1) : Math.min(780, gap * (n - 1));
  const xs = {};
  ids.forEach((id, i) => { xs[id] = n === 1 ? 640 : 640 - span / 2 + (span * i) / (n - 1); });
  // subject: who the camera and the light favour. speaker: whose mouth moves. On a radio line they differ:
  // a recording of someone who is also in the room leaves that person standing there, listening to themselves.
  const subject = ids.includes(line.who) ? line.who : null;
  const speaker = line.fx === 'radio' ? null : subject;
  const sx = subject ? xs[subject] : 640;
  const drop = subject ? lookOf(cast[subject]).drop : 0;     // a child's face is lower: the camera goes down to it
  const camName = line.cam === undefined ? 'wide' : line.cam;
  let ox = 640;                                              // for 'two': the nearest other person
  if (subject && n >= 2) {
    let best = Infinity;
    for (const id of ids) if (id !== subject && Math.abs(xs[id] - sx) < best) { best = Math.abs(xs[id] - sx); ox = xs[id]; }
  } else if (n >= 2) ox = xs[ids[0]] + xs[ids[1]] - sx;
  let cam;
  if (!tall) {
    switch (camName) {
      case 'wide': cam = { z: 1, cx: 640, cy: 400, low: 0 }; break;
      case 'close': cam = subject ? { z: 1.5, cx: sx, cy: 352 + drop, low: 0 } : { z: 1.12, cx: 640, cy: 390, low: 0 }; break;
      case 'two': cam = { z: n >= 2 ? 1.26 : 1.16, cx: (sx + ox) / 2, cy: 372 + drop * 0.5, low: 0 }; break;
      case 'low': cam = { z: 1.12, cx: sx, cy: 400, low: 1 }; break;
      default: throw new Error(`cinema: unknown cam '${camName}' on line ${line.id} (wide, close, two, low)`);
    }
  } else {
    // The same four framings, composed for a tall window. A face must be readable on a phone, so nothing is as
    // wide as 'wide', and the speaker's whole head is always inside the frame.
    const head = 84 * scale;                                  // half the width of a head and its hair, in stage units
    let z, cx, low = 0, dropK = 1;
    switch (camName) {
      case 'wide': {   // everyone, if everyone fits; leaning toward the speaker by whatever room is left over
        z = clamp(F.vw / (span + head * 2 + 110), 1, 1.32);
        const spare = Math.max(0, F.vw / (2 * z) - span / 2 - head - 6);
        cx = 640 + clamp((sx - 640) * 0.35, -spare, spare);
        break;
      }
      case 'close': z = subject ? 1.8 : 1.25; cx = sx; break;
      case 'two': z = n >= 2 ? clamp(F.vw / (gap + head * 2 + 60), 1.15, 1.5) : 1.4; cx = n >= 2 ? lerp((sx + ox) / 2, sx, 0.2) : sx; dropK = 0.5; break;
      case 'low': z = 1.3; cx = lerp(640, sx, 0.6); low = 1; break;
      default: throw new Error(`cinema: unknown cam '${camName}' on line ${line.id} (wide, close, two, low)`);
    }
    const room = F.vw / (2 * z) - head - 14;
    if (subject && room > 0) cx = clamp(cx, sx - room, sx + room);
    cx = clamp(cx, 640 - PORTRAIT_REACH, 640 + PORTRAIT_REACH);
    const faceY = STAGE_Y - 100 * FIG * scale + drop * dropK;
    cam = { z, cx, cy: faceY + 0.085 * F.vh / z, low };        // faces sit a little above the middle of the painting
  }
  return { ids, xs, scale, speaker, subject, crowd, cam };
}

/** the face a listener is still wearing: their own most recent line, if it was recent */
function lastEmote(lines, index, id, inRoom) {
  for (let i = index; i >= 0 && i >= index - 3; i--) {
    if (inRoom && lines[i].fx === 'radio') continue;   // a recording of them is not their face now
    if (lines[i].who === id) return lines[i].emote;
  }
  return undefined;
}

// ── the cast as sprites ──
// A figure is two gradients the size of a coat and a dozen smaller ones: the dearest thing in the frame once
// the backdrop is cached. Someone who is standing still, listening, is therefore painted once, body and head,
// into device pixels and copied; their breath moves the copy a pixel or two. The head is painted from vectors
// again only while they blink or weep, and always for whoever is speaking.
const _figs = new Map();    // cast id -> { sig, seen, body, head, frame }
let _frameNo = 0;
function dropFig(st) { if (st.body) freeCanvas(st.body.canvas); if (st.head) freeCanvas(st.head.canvas); st.body = st.head = null; st.sig = null; }
function figureSprite(mem, o, part, a, d, e, f, clip) {
  const k = lookOf(mem);
  const { half, top, bot } = spriteBounds(k, part);
  const x0 = Math.max(clip.x, Math.floor(e - a * half)), x1 = Math.min(clip.x + clip.w, Math.ceil(e + a * half));
  const y0 = Math.max(clip.y, Math.floor(f + d * top)), y1 = Math.min(clip.y + clip.h, Math.ceil(f + d * bot));
  if (x1 <= x0 || y1 <= y0) return { canvas: null, x: 0, y: 0 };
  const c = newCanvas(x1 - x0, y1 - y0), g = c.getContext('2d');
  g.setTransform(a, 0, 0, d, e - x0, f - y0);
  drawFigure(g, mem, { ...o, part, still: true, talk: 0 });
  return { canvas: c, x: x0, y: y0 };
}
/** draw one of the cast where the context now stands: from sprites if they are standing still, else from vectors */
function drawStaged(ctx, mem, o, id, sigKey, settled, talks, rest) {
  const M = rest && settled ? ctx.getTransform() : null;
  if (!M || M.b !== 0 || M.c !== 0 || !(M.a > 0) || !(M.d > 0)) { drawFigure(ctx, mem, o); return; }
  const e = M.e - rest.sx, f = M.f - rest.sy;
  const sig = `${sigKey}|${M.a.toFixed(5)}|${M.d.toFixed(5)}|${e.toFixed(2)}|${f.toFixed(2)}`;
  let st = _figs.get(id);
  if (!st) { st = { sig: null, seen: null, body: null, head: null, frame: 0 }; _figs.set(id, st); }
  st.frame = _frameNo;
  if (st.sig !== sig) {
    if (st.seen !== sig) { st.seen = sig; drawFigure(ctx, mem, o); return; }   // the first frame in this place: it may still be moving
    dropFig(st);
    st.body = figureSprite(mem, o, 'body', M.a, M.d, e, f, rest.clip);
    st.head = talks ? null : figureSprite(mem, o, 'head', M.a, M.d, e, f, rest.clip);
    st.sig = sig;
  }
  const k = lookOf(mem), br = breathOf(k, o.t);
  const sx = Math.round(rest.sx), sy = Math.round(rest.sy);
  const vectorHead = !st.head || o.emote === 'tears' || blinking(k, o.t);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (st.body.canvas) ctx.drawImage(st.body.canvas, st.body.x + sx, st.body.y + sy + Math.round(br * 0.5 * M.d));
  if (!vectorHead && st.head.canvas) ctx.drawImage(st.head.canvas, st.head.x + sx, st.head.y + sy + Math.round(br * 0.4 * M.d));
  ctx.setTransform(M.a, M.b, M.c, M.d, M.e, M.f);
  if (vectorHead) drawFigure(ctx, mem, { ...o, part: 'head' });
}

// wrapped rows are measured once per line and font, not once per frame
const _rows = new WeakMap();
function rowsOf(ctx, line, font, maxW) {
  let m = _rows.get(line);
  if (!m) { m = new Map(); _rows.set(line, m); }
  const key = `${font}|${maxW}|${line.text.length}`;
  let rows = m.get(key);
  if (!rows) { ctx.font = font; rows = wrapText(ctx, line.text, maxW); if (ctx !== NULL_CTX && HAS_DOM) m.set(key, rows); }
  return rows;
}
const spaced = (s) => s.split('').join('  ');
function fitText(ctx, s, maxW) {
  if (ctx.measureText(s).width <= maxW) return s;
  let t = s;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t.replace(/[\s·]+$/, '') + '…';
}

function drawSubtitle(ctx, who, line, lineT) {
  baked(ctx, 'subtitle-band', { x: 0, y: 548, w: W, h: H - 548 }, 1, (g) => {
    g.fillStyle = vgrad(g, 548, H, [[0, 'rgba(0,0,0,0)'], [0.45, 'rgba(0,0,0,.66)'], [1, 'rgba(0,0,0,.93)']]);
    g.fillRect(0, 548, W, H - 548);
  });
  const narr = line.who === 'narrator';
  let size = 30, lh = 39;
  const maxW = narr ? 900 : 950;
  const style = narr ? 'italic ' : '';
  let rows = rowsOf(ctx, line, `${style}${size}px ${FONT_SERIF}`, maxW);
  if (rows.length > 3) { size = 25; lh = 32; rows = rowsOf(ctx, line, `${style}${size}px ${FONT_SERIF}`, maxW); }
  const x0 = 170, nameY = 618, textY = 662;
  ctx.textBaseline = 'alphabetic';
  ctx.save();
  // nameplate
  if (narr) {
    ctx.textAlign = 'center';
    ctx.font = `600 14px ${FONT_UI}`;
    ctx.fillStyle = who.color;
    ctx.fillText(spaced(who.name.toUpperCase()), W / 2, nameY);
    const nw = ctx.measureText(spaced(who.name.toUpperCase())).width;
    seg(ctx, W / 2 - nw / 2 - 70, nameY - 5, W / 2 - nw / 2 - 14, nameY - 5, 'rgba(255,255,255,.3)', 1);
    seg(ctx, W / 2 + nw / 2 + 14, nameY - 5, W / 2 + nw / 2 + 70, nameY - 5, 'rgba(255,255,255,.3)', 1);
  } else {
    ctx.textAlign = 'left';
    ctx.fillStyle = who.color;
    ctx.fillRect(x0 - 20, nameY - 23, 6, 30);
    ctx.font = `700 23px ${FONT_UI}`;
    ctx.fillText(who.name, x0, nameY);
    const nw = ctx.measureText(who.name).width;
    ctx.font = `italic 17px ${FONT_SERIF}`;
    ctx.fillStyle = 'rgba(236,228,214,.66)';
    ctx.fillText(who.role, x0 + nw + 16, nameY - 1);
  }
  // the words: a dark outline keeps them off the picture (no shadowBlur: it costs a blur pass per row per frame)
  ctx.font = `${style}${size}px ${FONT_SERIF}`;
  ctx.lineJoin = 'round';
  let left = revealCount(line, lineT);
  for (let i = 0; i < rows.length && left > 0; i++) {
    const row = rows[i];
    const part = left >= row.length ? row : row.slice(0, left);
    const x = narr ? W / 2 - ctx.measureText(row).width / 2 : x0;
    const y = textY + i * lh;
    ctx.textAlign = 'left';
    ctx.strokeStyle = 'rgba(0,0,0,.82)'; ctx.lineWidth = 5.5;
    ctx.strokeText(part, x, y + 1);
    ctx.fillStyle = line.fx === 'radio' ? '#dff5ee' : narr ? '#f0e6d0' : '#fbf6ea';
    ctx.fillText(part, x, y);
    left -= row.length + 1;
  }
  ctx.restore();
}

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

/** a voice in the ear: the small inset that stands in for a body on stage. (x, y) is its top-left corner. */
function drawRadioInset(ctx, who, line, level, tms, t, x, y) {
  const w = INSET_W, h = INSET_H;
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
  if (who.id === LINE_ID) {
    ctx.fillText('THE LINE', x + 98, y + 21);
    if (mod(t, 1.2) < 0.7) circ(ctx, x + w - 22, y + 17, 4, '#ff5a4a');
  } else {
    // not live: a recording, with the name of whoever was recorded and a reel turning
    ctx.fillText('RECORDING', x + 98, y + 21);
    ctx.fillStyle = 'rgba(110,245,220,.5)';
    ctx.fillText(String(who.name).toUpperCase(), x + 176, y + 21, w - 176 - 40);
    ctx.strokeStyle = 'rgba(110,245,220,.8)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x + w - 22, y + 17, 6, 0, TAU); ctx.stroke();
    for (let i = 0; i < 3; i++) { const a = t * 2.2 + i * (TAU / 3); seg(ctx, x + w - 22, y + 17, x + w - 22 + Math.cos(a) * 5, y + 17 + Math.sin(a) * 5, 'rgba(110,245,220,.8)', 1.5); }
  }
  ctx.restore();
}

/** where we are in the book: "CHAPTER 3 · COLLATERAL · PARADE", or its short form for a narrow panel */
function placeLabel(content, game, cine, short) {
  const chapter = content.chapters && content.chapters[game.chapter];
  if (!chapter) return '';
  let tail;
  if (cine.kind === 'prologue') tail = 'PROLOGUE';
  else if (cine.kind === 'epilogue') tail = 'EPILOGUE';
  else if (cine.kind === 'scene') { const sc = chapter.scenes && chapter.scenes[game.scene]; tail = sc ? String(sc.title).toUpperCase() : ''; }
  else throw new Error(`cinema: unknown cine.kind '${cine.kind}'`);
  const head = short ? `CHAPTER ${chapter.number}` : `CHAPTER ${chapter.number}  ·  ${String(chapter.title).toUpperCase()}`;
  return tail ? `${head}  ·  ${tail}` : short ? `${head}  ·  ${String(chapter.title).toUpperCase()}` : head;
}

/** the skip button, at the rectangle the layout gives it */
function drawSkip(ctx, s, onArt) {
  rr(ctx, s.x, s.y, s.w, s.h, s.h / 2);
  ctx.fillStyle = onArt ? 'rgba(0,0,0,.5)' : 'rgba(255,255,255,.07)'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.36)'; ctx.lineWidth = 1.2; ctx.stroke();
  const cy = s.y + s.h / 2, fs = clamp(s.h * 0.34, 11, 15);
  ctx.font = `600 ${fs}px ${FONT_UI}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  ctx.fillText('SKIP', s.x + s.w / 2 - fs * 0.7, cy + 0.5);
  const tw = ctx.measureText('SKIP').width, ax = s.x + s.w / 2 - fs * 0.7 + tw / 2 + 7, a = fs * 0.36;
  for (let i = 0; i < 2; i++) poly(ctx, [[ax + i * a * 1.5, cy - a], [ax + i * a * 1.5 + a * 1.3, cy], [ax + i * a * 1.5, cy + a]], 'rgba(255,255,255,.8)');
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
}

/**
 * Portrait: everything that is read rather than looked at, on a dark ground under the painting.
 * The ground runs from the foot of the painting to the foot of the screen; layout.cine.text is where the words go.
 */
function drawTextPanel(ctx, F, who, line, lineT, label, index, total, T) {
  const r = F.text, s = F.skip, gy = F.art.y + F.art.h;
  const inset = r.x >= 12 && F.W - r.x - r.w >= 12;             // the layout has already kept the words off the screen's edge
  const pad = inset ? 0 : Math.max(16, Math.round(r.w * 0.05));
  const x0 = r.x + pad, x1 = r.x + r.w - pad, maxW = x1 - x0;
  const narr = line.who === 'narrator';
  const top = Math.max(r.y, gy + 10);                            // never hard against the painting
  ctx.save();
  if (F.H > gy) baked(ctx, 'text-ground', { x: 0, y: gy, w: F.W, h: F.H - gy }, 1, (g) => {
    g.fillStyle = vgrad(g, gy, F.H, [[0, '#15121a'], [0.5, '#0c0a0f'], [1, '#070608']]);
    g.fillRect(0, gy, F.W, F.H - gy);
  });
  // the edge under the painting is also the measure of how far through the scene we are
  ctx.fillStyle = 'rgba(176,138,62,.3)'; ctx.fillRect(0, gy, F.W, 2);
  ctx.fillStyle = '#d8b25a'; ctx.fillRect(0, gy, F.W * clamp((index + 1) / total), 2);
  ctx.textBaseline = 'alphabetic';
  // where we are, and the line counter
  ctx.font = `600 11px ${FONT_UI}`;
  const count = `${index + 1} / ${total}`, cw = ctx.measureText(count).width;
  ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.textAlign = 'right'; ctx.fillText(count, x1, top + 15);
  ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.textAlign = 'left'; ctx.fillText(fitText(ctx, label, maxW - cw - 14), x0, top + 15);
  // nameplate
  let textTop;
  if (narr) {
    ctx.textAlign = 'center';
    ctx.font = `600 13px ${FONT_UI}`;
    const nm = spaced(who.name.toUpperCase()), nw = ctx.measureText(nm).width, mx = r.x + r.w / 2, ny = top + 48;
    ctx.fillStyle = who.color; ctx.fillText(nm, mx, ny);
    seg(ctx, mx - nw / 2 - 54, ny - 4.5, mx - nw / 2 - 12, ny - 4.5, 'rgba(255,255,255,.3)', 1);
    seg(ctx, mx + nw / 2 + 12, ny - 4.5, mx + nw / 2 + 54, ny - 4.5, 'rgba(255,255,255,.3)', 1);
    textTop = top + 88;
  } else {
    ctx.textAlign = 'left';
    ctx.fillStyle = who.color;
    ctx.fillRect(x0, top + 30, 5, 42);
    let ns = 23;
    ctx.font = `700 ${ns}px ${FONT_UI}`;
    while (ns > 15 && ctx.measureText(who.name).width > maxW - 16) { ns--; ctx.font = `700 ${ns}px ${FONT_UI}`; }
    ctx.fillText(who.name, x0 + 16, top + 49);
    ctx.font = `italic 15px ${FONT_SERIF}`;
    ctx.fillStyle = 'rgba(236,228,214,.62)';
    ctx.fillText(fitText(ctx, String(who.role), maxW - 16), x0 + 16, top + 69);
    textTop = top + 106;
  }
  // The cue shares a row with the skip button when that is down here with the words, on whichever side it is not.
  const skipLow = s.y + s.h / 2 >= gy;
  const cueY = skipLow ? s.y + s.h / 2 : r.y + r.h - 10;
  const textEnd = skipLow ? Math.min(r.y + r.h, s.y - 12) : cueY - 22;
  // the words, as large as the rectangle allows
  const style = narr ? 'italic ' : '';
  let size = 0, lh = 0, rows = null;
  for (const [fs, l] of [[27, 35.5], [24, 32], [22, 29.5], [20, 27], [18, 24.5], [16, 22], [14, 19.5]]) {
    size = fs; lh = l; rows = rowsOf(ctx, line, `${style}${fs}px ${FONT_SERIF}`, maxW);
    if (textTop + (rows.length - 1) * lh + fs * 0.3 <= textEnd) break;
  }
  ctx.font = `${style}${size}px ${FONT_SERIF}`;
  ctx.fillStyle = line.fx === 'radio' ? '#dff5ee' : narr ? '#f0e6d0' : '#fbf6ea';
  const shown = revealCount(line, lineT);
  let left = shown;
  for (let i = 0; i < rows.length && left > 0; i++) {
    const row = rows[i];
    const part = left >= row.length ? row : row.slice(0, left);
    ctx.textAlign = 'left';
    ctx.fillText(part, narr ? r.x + (r.w - ctx.measureText(row).width) / 2 : x0, textTop + i * lh);
    left -= row.length + 1;
  }
  // tap to continue: quiet while the line is still arriving, breathing once it is all there
  const done = shown >= line.text.length;
  const ca = done ? 0.5 + 0.28 * Math.sin(T * 3.4) : 0.26;
  const cx = skipLow && s.x + s.w / 2 < F.W / 2 ? x1 - 112 : x0;
  ctx.font = `600 12.5px ${FONT_UI}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillStyle = `rgba(255,255,255,${ca})`;
  const nudge = done ? Math.max(0, Math.sin(T * 3.4)) * 2.5 : 0;
  poly(ctx, [[cx + nudge, cueY - 5], [cx + nudge + 7.5, cueY], [cx + nudge, cueY + 5]], `rgba(255,255,255,${ca})`);
  ctx.fillText('Tap to continue', cx + 15, cueY + 0.5);
  ctx.restore();
}

// The caches are worth tens of megabytes on a phone and are of no use once the film is over. Nothing tells this
// module that it is over, so it notices: two seconds without a frame and everything is let go.
let _lastDraw = 0, _idleTimer = null;
/** Free every offscreen canvas this module holds. It does this by itself when the film stops; calling it sooner is safe. */
export function releaseCinema() {
  cinemaCache.clear();
  for (const st of _figs.values()) dropFig(st);
  _figs.clear();
  for (const e of _baked.values()) freeCanvas(e.canvas);
  _baked.clear();
}
function armIdle() {
  _lastDraw = Date.now();
  if (_idleTimer !== null || !HAS_DOM || typeof setTimeout !== 'function') return;
  const tick = () => {
    const left = 2000 - (Date.now() - _lastDraw);
    if (left <= 0) { _idleTimer = null; releaseCinema(); } else _idleTimer = setTimeout(tick, left + 20);
  };
  _idleTimer = setTimeout(tick, 2020);
}

/**
 * Draw the whole frame for the running cinematic.
 * fx: { timeMs, voiceLevel 0..1, flash, shake }
 *   flash: falsy, a number 0..1 (white), or { color, a }
 *   shake: falsy or a number 0..1 (as render.js clamps it)
 * layout: what layout.js computeLayout() returns. 'wide' (or no layout at all) is the 1280x800 letterboxed film.
 *   'portrait' puts the painting in layout.cine.art, the words in layout.cine.text and a skip button at layout.skip.
 * The context's transform must already map the layout's logical size (layout.W x layout.H) onto the canvas.
 */
export function drawCinema(ctx, content, game, fx, layout) {
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
  if (fx.shake && typeof fx.shake !== 'number') throw new Error(`cinema: fx.shake must be a number 0..1, got ${String(fx.shake)}`);

  const F = frameOf(layout);
  const tall = F.kind === 'portrait';
  const art = F.art;
  const view = viewOf(lines);
  const T = fx.timeMs / 1000;
  const lt = cine.lineT;
  const level = clamp(fx.voiceLevel || 0);
  const prevLine = cine.index > 0 ? lines[cine.index - 1] : null;
  const prevStage = prevLine ? view.stages[cine.index - 1] : null;
  const L1 = stageOf(cast, line, cine.on, F);
  const L0 = prevStage ? stageOf(cast, prevLine, prevStage.on, F) : null;

  // device pixels per logical unit: the still layers are cached at the resolution they will be shown at
  const m = HAS_DOM && typeof ctx.getTransform === 'function' ? ctx.getTransform() : null;
  const dev = m ? Math.hypot(m.a, m.b) : 1;
  const cfgNow = stillsConfig(F, cine.bg, dev);

  // camera: ease from the last line's framing to this one. Where the picture is cached (a phone, a small window)
  // the camera then stands still, so that layers and listeners can be copied instead of painted. Where it is
  // painted live every frame (a large desktop canvas) it keeps creeping in and drifting, as it always did.
  const ce = L0 ? ease(lt / 0.7) : 1;
  const c0 = L0 ? L0.cam : L1.cam;
  const zc = lerp(c0.z, L1.cam.z, ce);
  const held = !!cfgNow || cinemaCache.holdCamera;
  const z = held ? zc : zc * (1 + 0.03 * ease(lt / 8));
  const low = lerp(c0.low, L1.cam.low, ce);
  const cx = clamp(lerp(c0.cx, L1.cam.cx, ce), F.vw / 2 / z, W - F.vw / 2 / z);
  const cy = clamp(lerp(c0.cy, L1.cam.cy, ce), F.vh / 2 / z, H - F.vh / 2 / z);
  const px = (held ? 0 : Math.sin(T * 0.07) * 16) + (cx - W / 2) * 0.06;

  // whose voice the earpiece last carried: the 'line' backdrop keeps their face up while others answer
  let heard = null;
  for (let i = cine.index; i >= 0 && !heard; i--) if (lines[i].fx === 'radio') heard = cast[lines[i].who] || null;
  if (!heard) heard = cast[LINE_ID] || null;
  const info = {
    tms: fx.timeMs, level: line.fx === 'radio' ? level : 0, lineT: lt, lines, index: cine.index,
    portrait: line.fx === 'radio' ? who : heard,
    portraitEmote: line.fx === 'radio' ? line.emote : heard ? lastEmote(lines, cine.index, heard.id) : undefined,
    onePage: tall,
  };
  _frameNo++;

  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, F.W, F.H);

  // shake: the whole film when it fills the screen, only the painting when there are words to read under it
  const shx = fx.shake ? Math.sin(fx.timeMs * 0.09) * clamp(fx.shake) * 14 : 0;
  const shy = fx.shake ? Math.cos(fx.timeMs * 0.113) * clamp(fx.shake) * 14 * 0.7 : 0;
  if (!tall) ctx.translate(shx, shy);
  const shk = tall ? 0.6 : 1;
  const rest = cfgNow && m.b === 0 && m.c === 0 && m.a * art.w * m.d * art.h <= cinemaCache.budget ? {
    clip: { x: Math.floor(m.e + m.a * art.x) - 16, y: Math.floor(m.f + m.d * art.y) - 16, w: Math.ceil(m.a * art.w) + 32, h: Math.ceil(m.d * art.h) + 32 },
    sx: m.a * shx * shk, sy: m.d * shy * shk, dev,
  } : null;

  // ── the picture: inside the letterbox, or inside the art rectangle ──
  const bar = tall ? 0 : BAR * ease(cine.t / 0.9);
  ctx.save();
  ctx.beginPath(); ctx.rect(art.x, art.y + bar, art.w, art.h - bar * 2); ctx.clip();
  if (tall) ctx.translate(shx * shk, shy * shk);
  const ox = art.x + art.w / 2, oy = art.y + art.h / 2;

  // backdrop: moves less than the cast does
  const zb = 1.06 + (z - 1) * 0.4;
  const bcy = H / 2 + (cy - H / 2) * 0.4 - low * 34;
  const bcxOf = (key) => panOf(F, key) + (cx - W / 2) * 0.4;
  const mixBg = prevStage && prevStage.bg !== cine.bg ? ease(lt / 0.9) : 1;
  if (mixBg < 1) {
    const key = prevStage.bg;
    if (!P[key]) throw new Error(`cinema: unknown backdrop key '${key}' on a line before ${line.id}`);
    const cfg = stillsConfig(F, key, dev);
    ctx.save();
    ctx.translate(ox, oy); ctx.scale(F.s0 * zb, F.s0 * zb); ctx.translate(-bcxOf(key), -bcy);
    paintBackdrop(ctx, key, 'back', T, px, info, cfg, rest);
    paintBackdrop(ctx, key, 'front', T, px, info, cfg, rest);
    ctx.restore();
  }
  ctx.save();
  ctx.translate(ox, oy); ctx.scale(F.s0 * zb, F.s0 * zb); ctx.translate(-bcxOf(cine.bg), -bcy);
  fade(ctx, mixBg, () => paintBackdrop(ctx, cine.bg, 'back', T, px, info, cfgNow, rest));
  ctx.restore();

  const light = bgNow.light;
  // a little air between the backdrop and the people, and a floor of shadow for them to stand in
  ctx.fillStyle = rgba(light.amb, 0.16);
  ctx.fillRect(art.x - 20, art.y - 20, art.w + 40, art.h + 40);

  ctx.save();
  ctx.translate(ox, oy); ctx.scale(F.s0 * z, F.s0 * z); ctx.translate(-cx, -cy);
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
    const f1 = in1 ? (L1.subject ? (id === L1.subject ? 1 : 0) : 0.5) : 0;
    const f0 = in0 && L0 ? (L0.subject ? (id === L0.subject ? 1 : 0) : 0.5) : f1;
    return {
      id,
      x: lerp(xFrom, xTo, me),
      alpha: in1 && in0 ? 1 : in1 ? ease(lt / 0.5) : 1 - ease(lt / 0.4),
      focus: lerp(f0, f1, fe),
      scale: lerp(in0 && L0 ? L0.scale : L1.scale, in1 ? L1.scale : L0.scale, me),
    };
  });
  const spk = figs.find((f) => f.id === L1.subject);
  figs.sort((a, b) => a.focus - b.focus);
  for (const f of figs) {
    const mem = cast[f.id];
    const isSpk = L1.speaker === f.id;
    let facing;
    if (f === spk) {
      const others = figs.filter((o) => o !== f);
      const mean = others.length ? others.reduce((s, o) => s + o.x, 0) / others.length : f.x + 1;
      facing = mean >= f.x ? 1 : -1;
    } else if (spk) facing = spk.x >= f.x ? 1 : -1;
    else facing = f.x <= W / 2 ? 1 : -1;
    const k = lookOf(mem);
    // in a tall frame the cast overlap, so whoever is not the subject stands half a step back
    const back = tall ? 1 - 0.07 * (1 - f.focus) : 1;
    const s = FIG * f.scale * k.s * (1 + 0.05 * f.focus) * (1 + low * 0.13) * back;
    ctx.save();
    ctx.translate(f.x, STAGE_Y + low * 34 - f.focus * 6 + (1 - k.s) * 60 + k.drop);
    ctx.scale(s, s);
    const o = {
      emote: isSpk ? line.emote : lastEmote(lines, cine.index, f.id, true),
      talk: isSpk ? level : 0,
      focus: f.focus,
      light,
      facing,
      gaze: isSpk && L1.cam.z > 1.4 ? 0.35 : 1,
      t: T,
    };
    const settled = f.alpha === 1 && me === 1 && fe === 1;
    if (settled) drawStaged(ctx, mem, o, f.id, `${cine.bg}|${o.emote}|${f.focus}|${facing}|${o.gaze}|${isSpk}|${low}`, true, isSpk, rest);
    else fade(ctx, f.alpha, () => drawFigure(ctx, mem, o));
    ctx.restore();
  }
  ctx.restore();

  // what hangs in the air in front of them
  if (bgNow.front) {
    const zf = lerp(zb, z, 0.5);
    ctx.save();
    ctx.translate(ox, oy); ctx.scale(F.s0 * zf, F.s0 * zf); ctx.translate(-lerp(bcxOf(cine.bg), cx, 0.5), -lerp(bcy, cy, 0.5));
    fade(ctx, mixBg, () => paintBackdrop(ctx, cine.bg, 'front', T, px * 1.4, info, cfgNow, rest));
    ctx.restore();
  }
  vignette(ctx, { x: art.x - 20, y: art.y - 20, w: art.w + 40, h: art.h + 40 }, 0.5 + low * 0.15);
  ctx.restore(); // picture clip

  // ── over and under the picture ──
  const radio = line.fx === 'radio' && cine.bg !== 'line';
  if (tall) {
    // the painting sinks into the panel instead of ending at a hard edge
    const fh = Math.min(70, art.h * 0.2);
    baked(ctx, 'art-foot', { x: art.x, y: art.y + art.h - fh, w: art.w, h: fh }, 1, (g) => {
      g.fillStyle = vgrad(g, art.y + art.h - fh, art.y + art.h, [[0, 'rgba(21,18,26,0)'], [1, 'rgba(21,18,26,.9)']]);
      g.fillRect(art.x, art.y + art.h - fh, art.w, fh);
    });
    if (radio) {
      const k = Math.min(1, (art.w - 24) / INSET_W);
      ctx.save();
      ctx.translate(art.x + (art.w - INSET_W * k) / 2, art.y + art.h - INSET_H * k - 18); ctx.scale(k, k);
      fade(ctx, ease(lt / 0.25), () => drawRadioInset(ctx, who, line, level, fx.timeMs, T, 0, 0));
      ctx.restore();
    }
    drawTextPanel(ctx, F, who, line, lt, placeLabel(content, game, cine, true), cine.index, lines.length, T);
    const sk = F.skip;
    drawSkip(ctx, sk, sk.y + sk.h / 2 < art.y + art.h);
  } else {
    if (radio) fade(ctx, ease(lt / 0.25), () => drawRadioInset(ctx, who, line, level, fx.timeMs, T, 926, BAR + 26));
    drawSubtitle(ctx, who, line, lt);
    // the top bar: where we are in the book
    const label = placeLabel(content, game, cine, false);
    ctx.textBaseline = 'alphabetic';
    if (label && bar > 30) {
      ctx.font = `600 12px ${FONT_UI}`; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,.42)';
      ctx.fillText(spaced(label), 30, 33);
      ctx.textAlign = 'right';
      const sk = F.skip;   // the counter stands clear of the skip button when that is up in the bar with it
      ctx.fillText(`${cine.index + 1} / ${lines.length}`, sk && sk.y < BAR && sk.x > W / 2 ? sk.x - 18 : W - 30, 33);
    }
    drawHints(ctx);
    if (F.skip) drawSkip(ctx, F.skip, true);
  }

  // flash
  if (fx.flash) {
    if (typeof fx.flash === 'number') { ctx.fillStyle = `rgba(255,255,255,${clamp(fx.flash)})`; ctx.fillRect(-40, -40, F.W + 80, F.H + 80); }
    else if (typeof fx.flash === 'object' && typeof fx.flash.color === 'string' && typeof fx.flash.a === 'number') {
      fade(ctx, fx.flash.a, () => { ctx.fillStyle = fx.flash.color; ctx.fillRect(-40, -40, F.W + 80, F.H + 80); });
    } else throw new Error(`cinema: fx.flash must be a number or { color, a }, got ${JSON.stringify(fx.flash)}`);
  }
  // fade up from black as the film begins
  if (cine.t < 0.8) { ctx.fillStyle = `rgba(0,0,0,${1 - ease(cine.t / 0.8)})`; ctx.fillRect(-40, -40, F.W + 80, F.H + 80); }
  ctx.restore();

  for (const [id, st] of _figs) if (st.frame !== _frameNo) { dropFig(st); _figs.delete(id); }

  // Paint the next backdrop's still layers while this line is being spoken, so the cut to it does not stall.
  if (lt > 1 && cine.index + 1 < lines.length) {
    const nextBg = view.stages[cine.index + 1].bg;
    if (nextBg !== cine.bg && P[nextBg]) {
      const cfg = stillsConfig(F, nextBg, dev);
      if (cfg) {
        const rec = stillsFor(nextBg, cfg);
        stillsFor(cine.bg, cfgNow);   // the one on screen stays the most recently used
        if (!rec.back.built) buildStills(nextBg, 'back', cfg, rec, T, info);
        else if (P[nextBg].front && !rec.front.built) buildStills(nextBg, 'front', cfg, rec, T, info);
      }
    }
  }
  armIdle();
}
