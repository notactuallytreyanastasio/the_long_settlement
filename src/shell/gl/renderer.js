// The cel renderer: draws a scene (scene.js) with a camera.
//
// Frame order: shadow map -> toon opaque -> outlines (inverted hull) -> water -> sky ->
// blended decals -> additive beams -> sprites -> present (antialiasing). One pass each.
// The render loop allocates nothing; all scratch storage is created once below.
//
// QUALITY. Everything that costs the GPU is a field of one quality object, changed while running
// with renderer.setQuality('high' | 'medium' | 'low' | 'min' | { ...fields }):
//
//   dprCap        2      the drawing buffer is the canvas's CSS size times min(devicePixelRatio, dprCap)
//   aa            'msaa' | 'fxaa' | 'none'. msaa: 4x multisampled off-screen buffer. fxaa: plain buffer and a
//                 nine-tap edge filter when it is copied to the canvas (keeps ink lines smooth for one extra
//                 screen pass). none: straight to the canvas
//   shadowSize    2048   the largest shadow map a scene may ask for (env.shadow.size is clamped to it)
//   shadowTaps    4      4, 1 or 0 lookups per fragment. 0 compiles shadows out and skips the shadow pass
//   shadowRate    1      redraw each scene's shadow map every Nth render() of it. With 2, a stage band and a
//                 table drawn in the same frame take turns, so a frame pays for one shadow pass, not two
//                 (a cut, a camera that moved the map, or a new scene always redraws at once)
//   staticShadows true   nodes marked `static` (everything mergeStatic makes) are drawn into the shadow map
//                 once and kept; each redraw copies that and adds only what moves
//   maxLamps      8      point lights per fragment (compiled into the loop bound)
//   water         'full' | 'cheap' | 'flat'  (see WATER_Q in shaders.js)
//   cull          true   skip nodes whose bounding sphere is outside the camera (or, for the shadow pass, the light's box)
//   outlineMinPx  0      skip the outline of anything whose bounding sphere is smaller than this on screen
//   trim          true   static meshes sorted by trimStatic() draw only the triangles that can face the camera (colour
//                 pass) or away from it (outline pass) while the camera is inside the box they were sorted for
//   autoTrim      true   static meshes nobody sorted (a table, a set that did not call trimSet) are sorted on first draw
//   batch         true   small blended decals (faces) that share a material are baked into one draw each frame
//
// A view may override per call: { shadow: 'off', shadowSize, maxLamps }.

import { v3, m4, DEG, frustumPlanes, sphereInFrustum, maxScale } from './math.js';
import { boundingSphere, trimForView } from './mesh.js';
import { createContext, createProgram, createGeometry, uploadInstances, createTexture, createShadowTarget, createColorTarget, copyShadow } from './gl.js';
import * as S from './shaders.js';
import { SPRITE_FLOATS } from './sprites.js';

const MAX_CAND = 32;

/**
 * The three tiers. `high` is what the slice was drawn with. Each step down shades about half the fragments of the one
 * above, because fill is what a phone runs out of first: the drawing buffer is 2, 1.42 and 1 times the CSS size (on a
 * 393x852 phone 786x1704, 558x1210, 393x852: 1.34M, 0.68M and 0.33M pixels), and the browser scales it to the glass.
 * Below `high` the edges are smoothed by the nine-tap filter in the present pass instead of 4x multisampling; `low` keeps
 * it, since at one buffer pixel to three of the glass bare stair-steps are the first thing seen. Lamps per fragment,
 * shadow taps, shadow size and the water shader step down with it. Measured numbers: tools/gl-perf.html.
 */
export const QUALITY = {
  high: { name: 'high', dprCap: 2, aa: 'msaa', shadowSize: 2048, shadowTaps: 4, shadowRate: 1, staticShadows: true, maxLamps: 8, water: 'full', cull: true, outlineMinPx: 0, trim: true, autoTrim: true, batch: true },
  medium: { name: 'medium', dprCap: 1.42, aa: 'fxaa', shadowSize: 1024, shadowTaps: 4, shadowRate: 2, staticShadows: true, maxLamps: 4, water: 'cheap', cull: true, outlineMinPx: 4, trim: true, autoTrim: true, batch: true },
  low: { name: 'low', dprCap: 1, aa: 'fxaa', shadowSize: 512, shadowTaps: 1, shadowRate: 2, staticShadows: true, maxLamps: 2, water: 'flat', cull: true, outlineMinPx: 7, trim: true, autoTrim: true, batch: true },
  // below `low`, for a device that cannot hold it: three quarters of a CSS pixel, no shadow pass at all (figures need the
  // director's blob shades for ground contact), one lamp, outlines only on what is 12 px or more
  min: { name: 'min', dprCap: 0.75, aa: 'fxaa', shadowSize: 256, shadowTaps: 0, shadowRate: 2, staticShadows: true, maxLamps: 1, water: 'flat', cull: true, outlineMinPx: 12, trim: true, autoTrim: true, batch: true },
};
const WATER_Q = { full: 0, cheap: 1, flat: 2 };

/** Resolve a tier name or a partial object (optionally { base: 'medium', ... }) into a full quality object. */
export function resolveQuality(q = 'high') {
  if (typeof q === 'string') { if (!QUALITY[q]) throw new Error(`renderer: unknown quality ${JSON.stringify(q)} (have ${Object.keys(QUALITY).join(', ')})`); return { ...QUALITY[q] }; }
  const base = QUALITY[q.base || q.name] || QUALITY.high;
  const out = { ...base, ...q, name: q.name || (q.base ? q.base + '*' : 'custom') }; delete out.base;
  if (!(out.aa in { msaa: 1, fxaa: 1, none: 1 })) throw new Error(`renderer: quality.aa must be 'msaa', 'fxaa' or 'none', got ${JSON.stringify(out.aa)}`);
  if (!(out.water in WATER_Q)) throw new Error(`renderer: quality.water must be 'full', 'cheap' or 'flat', got ${JSON.stringify(out.water)}`);
  if (![0, 1, 4].includes(out.shadowTaps)) throw new Error(`renderer: quality.shadowTaps must be 0, 1 or 4, got ${out.shadowTaps}`);
  out.maxLamps = Math.max(0, Math.min(S.MAX_POINTS, out.maxLamps | 0)); out.shadowRate = Math.max(1, out.shadowRate | 0);
  return out;
}

/**
 * createRenderer(canvas, { quality = 'high', dprCap = 2 }) ->
 *   { render(scene, camera, timeSeconds, view = null), stats, quality, setQuality(q), measureFill(drawFn, pass),
 *     release(sceneOrNode, { skip }), memory(), ctx, gl, resize(), invalidate(mesh), dispose() }
 * `view` = { x, y, w, h } in CSS pixels from the canvas's top-left draws into that rectangle only
 * (and sets the camera's aspect from it), so one canvas can hold several scenes: a table and a
 * stage band above it. Each call clears its own rectangle; a view may carry shadowCenter [x, y, z]
 * and shadowRadius to fit the scene's shadow map to what it shows, shadow: 'off', shadowSize, maxLamps.
 * opts.dprCap is a ceiling the quality tier cannot raise.
 * stats after each render call: { drawCalls, triangles, nodes, culled, lights, shadowDraws, shadowTriangles,
 *   shadowFresh (was the map redrawn this call), cpuMs, width, height }. drawCalls and triangles include the shadow pass.
 */
export function createRenderer(canvas, opts = {}) {
  const hardDpr = opts.dprCap ?? 3;
  let Q = resolveQuality(opts.quality || 'high');
  const ctx = createContext(canvas, { ...opts, antialias: false, dprCap: Math.min(hardDpr, Q.dprCap) }); // antialiasing is ours, so it can change
  const gl = ctx.gl;
  const PASSES = ['shadow', 'opaque', 'outline', 'water', 'sky', 'blended', 'beams', 'sprites'];
  const stats = { drawCalls: 0, triangles: 0, nodes: 0, culled: 0, lights: 0, shadowDraws: 0, shadowTriangles: 0, shadowFresh: false, cpuMs: 0, width: 0, height: 0, trimMiss: 0, trimBuilt: 0, batched: 0, shadowKept: '', pass: {}, figures: { draws: 0, tris: 0 } };
  for (const k of PASSES) stats.pass[k] = { draws: 0, tris: 0 };
  let passNow = stats.pass.opaque, overdrawOnly = null;
  /** Every draw from here on is counted under this pass; a fill measurement of one pass masks the others' colour (they still write depth). */
  function enter(name) { passNow = stats.pass[name]; if (overdraw && overdrawOnly) { const on = overdrawOnly === name; gl.colorMask(on, on, on, on); } }

  // ---- GPU objects (rebuilt after a context loss, programs also after a quality change) ----
  let programs = new Map(), skyVao = null, waterVao = null, spriteVao = null, spriteBuf = null, spriteCap = 0, white = null, nullShadow = null;
  let colorTarget = null, overdraw = false, shadowSlots = 0;
  const shadowOf = new WeakMap(); // scene -> its shadow maps and what is in them

  const defines = () => `#define LAMPS ${Q.maxLamps}\n#define PCF ${Q.shadowTaps}\n#define WATER_Q ${WATER_Q[Q.water]}\n`;
  const SOURCES = { toon: [S.TOON_VS, S.TOON_FS], outline: [S.OUTLINE_VS, S.OUTLINE_FS], depth: [S.DEPTH_VS, S.DEPTH_FS], beam: [S.BEAM_VS, S.BEAM_FS], sky: [S.SKY_VS, S.SKY_FS], water: [S.WATER_VS, S.WATER_FS], sprite: [S.SPRITE_VS, S.SPRITE_FS], present: [S.PRESENT_VS, S.PRESENT_FS] };
  /** A program by family and variant ('' | 'I' instanced | 'S' skinned, plus 'C' cutout for depth), compiled on first use. */
  function prog(family, variant = '') {
    const key = family + variant + (overdraw ? '!' : '');
    let p = programs.get(key);
    if (!p) {
      const src = SOURCES[family];
      let defs = defines() + (variant.includes('I') ? '#define INSTANCED\n' : '') + (variant.includes('S') ? '#define SKINNED\n' : '') + (variant.includes('C') ? '#define CUTOUT\n' : '');
      let fs = src[1];
      // fill measurement: every fragment that would be shaded adds one step of red instead
      if (overdraw && family !== 'depth' && family !== 'present') fs = fs.replace('void main()', 'void shade_()') + '\nvoid main() { shade_(); frag = vec4(8.0 / 255.0, 0.0, 0.0, 0.0); }';
      p = createProgram(gl, key, src[0], fs, defs);
      p.memo = new Float32Array(16).fill(NaN);   // what put4() last sent
      if (family === 'sprite') p.attribs = { aCorner: gl.getAttribLocation(p.program, 'aCorner'), iA: gl.getAttribLocation(p.program, 'iA'), iB: gl.getAttribLocation(p.program, 'iB'), iC: gl.getAttribLocation(p.program, 'iC'), iD: gl.getAttribLocation(p.program, 'iD') };
      programs.set(key, p);
    }
    return p;
  }
  function dropPrograms() { for (const p of programs.values()) gl.deleteProgram(p.program); programs = new Map(); spriteVao = null; }

  const mem = { geometry: 0, textures: 0, shadows: 0, meshes: 0, textureCount: 0 };   // bytes on the GPU; see memory()
  const shadowLive = [];          // the scenes' shadow entries that hold maps now (see shadowEntry)
  function build() {
    programs = new Map(); colorTarget = null; nullShadow = null; spriteVao = null; spriteBuf = null; spriteCap = 0;
    mem.geometry = 0; mem.textures = 0; mem.shadows = 0; mem.meshes = 0; mem.textureCount = 0; shadowLive.length = 0;   // a new context starts empty
    const tri = (data) => {
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null); return vao;
    };
    skyVao = tri([-1, -1, 0, 3, -1, 0, -1, 3, 0]);
    waterVao = tri([-1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0, -1, -1, 0, 1, 1, 0, 1]);
    const c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 1, 1);
    white = createTexture(gl, c, { mips: false });
    warm();
  }
  /** Compile what every frame uses now, so the first frame after a load or a quality change does not hitch on it. */
  function warm() { for (const f of ['toon', 'outline', 'depth']) for (const v of ['', 'I', 'S']) prog(f, v); prog('beam'); prog('sky'); prog('water'); prog('sprite'); prog('present'); }
  build();
  ctx.onRestored = build;

  function spriteGeometry(p) { // the sprite VAO is tied to the sprite program's attribute locations
    if (spriteVao && spriteVao.owner === p) return;
    if (spriteVao) gl.deleteVertexArray(spriteVao.vao);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(p.attribs.aCorner); gl.vertexAttribPointer(p.attribs.aCorner, 2, gl.FLOAT, false, 0, 0);
    if (!spriteBuf) { spriteBuf = gl.createBuffer(); spriteCap = 0; }
    gl.bindBuffer(gl.ARRAY_BUFFER, spriteBuf);
    ['iA', 'iB', 'iC', 'iD'].forEach((nm, k) => { const l = p.attribs[nm]; if (l < 0) return; gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 4, gl.FLOAT, false, SPRITE_FLOATS * 4, k * 16); gl.vertexAttribDivisor(l, 1); });
    gl.bindVertexArray(null);
    spriteVao = { vao, owner: p };
  }

  // ---- lazily uploaded resources ----
  // What is on the GPU, in bytes, counted as it is made and dropped (an estimate: drivers pad). Things whose JS owner was
  // garbage collected without release() stay counted until the context is rebuilt.
  const geoBytes = (mesh) => (mesh.positions.length / 3) * (48 + (mesh.bones ? 1 : 0)) + mesh.indices.length * (mesh.positions.length / 3 <= 65535 ? 2 : 4);
  function geoOf(mesh, owner) {
    const holder = owner || mesh; // instanced nodes own a private copy, because the instance buffer lives on the VAO
    let c = holder._gpu;
    if (!c || c.gen !== ctx.generation || c.mesh !== mesh) {
      if (c && c.gen === ctx.generation) dropGeo(c.geo);
      c = holder._gpu = { gen: ctx.generation, mesh, geo: createGeometry(gl, mesh) };
      c.geo.bytes = geoBytes(mesh); mem.geometry += c.geo.bytes; mem.meshes++;
    }
    return c.geo;
  }
  function dropGeo(geo) { gl.deleteVertexArray(geo.vao); gl.deleteBuffer(geo.vbo); gl.deleteBuffer(geo.ibo); if (geo.instBuf) gl.deleteBuffer(geo.instBuf); if (geo.boneBuf) gl.deleteBuffer(geo.boneBuf); mem.geometry -= (geo.bytes || 0) + geo.instCap * 80; mem.meshes--; }
  /** Drop the GPU copy a mesh, a node (its private instanced copy) or a run holder owns, if it has one in this context. */
  function dropHeld(holder) { const c = holder && holder._gpu; if (!c) return 0; holder._gpu = null; if (c.gen !== ctx.generation) return 0; dropGeo(c.geo); return 1; }
  const texBytes = (t) => { const w = t.source.width || 1, h = t.source.height || 1; return Math.round(w * h * 4 * (t.mips !== false && t.filter !== 'nearest' ? 4 / 3 : 1)); };
  function texOf(t) {
    if (!t) return white;
    let c = t._gpu;
    if (!c || c.gen !== ctx.generation || c.version !== t.version) {
      if (c && c.gen === ctx.generation) { gl.deleteTexture(c.tex); mem.textures -= c.bytes; mem.textureCount--; }
      c = t._gpu = { gen: ctx.generation, version: t.version, tex: createTexture(gl, t.source, { filter: t.filter, mips: t.mips }), bytes: texBytes(t) };
      mem.textures += c.bytes; mem.textureCount++;
    }
    return c.tex;
  }
  function dropTex(t) { const c = t && t._gpu; if (!c) return 0; t._gpu = null; if (c.gen !== ctx.generation) return 0; gl.deleteTexture(c.tex); mem.textures -= c.bytes; mem.textureCount--; return 1; }

  // ---- per-frame scratch ----
  const opaque = [], blended = [], beams = [], casters = [], statics = [];
  const boneMats = new Float32Array(S.MAX_BONES * 16);
  const nm3 = new Float32Array(9), tint4 = new Float32Array(4), lightView = m4.create(), lightProj = m4.create(), shadowVP = m4.create();
  const eye = v3.create(), UP = v3.create(0, 1, 0), UPX = v3.create(1, 0, 0);
  const candPos = new Float32Array(MAX_CAND * 4), candCol = new Float32Array(MAX_CAND * 4), candScore = new Float32Array(MAX_CAND);
  const pointPos = new Float32Array(S.MAX_POINTS * 4), pointCol = new Float32Array(S.MAX_POINTS * 4), foam = new Float32Array(S.MAX_FOAM * 4);
  const planes = new Float32Array(24), sph = new Float32Array(4);
  let nCand = 0, nPoints = 0, nFoam = 0, frame = null, staticHash = 0, shadowR = 0, wantCasters = false;

  function addLight(x, y, z, color, radius, intensity, target) {
    if (nCand >= MAX_CAND || intensity <= 0 || radius <= 0) return;
    if (Q.cull && !sphereInFrustum(planes, x, y, z, radius)) return; // a lamp that reaches nothing on screen
    const k = nCand++;
    candPos[k * 4] = x; candPos[k * 4 + 1] = y; candPos[k * 4 + 2] = z; candPos[k * 4 + 3] = radius;
    candCol[k * 4] = color[0]; candCol[k * 4 + 1] = color[1]; candCol[k * 4 + 2] = color[2]; candCol[k * 4 + 3] = intensity;
    candScore[k] = Math.hypot(x - target[0], y - target[1], z - target[2]) - radius;
  }

  /** World bounding sphere of what a node draws, into `sph`. False when it cannot be bounded (then it is never culled). */
  function sphereOf(n) {
    const mesh = n.mesh;
    if (n.bones) { // a skinned figure: around its joints, padded by how far any vertex is from its joint
      const b = n.bones; let cx = 0, cy = 0, cz = 0;
      for (let i = 0; i < b.length; i++) { const w = b[i].world; cx += w[12]; cy += w[13]; cz += w[14]; }
      cx /= b.length; cy /= b.length; cz /= b.length;
      let r = 0, sc = 1;
      for (let i = 0; i < b.length; i++) { const w = b[i].world, d = Math.hypot(w[12] - cx, w[13] - cy, w[14] - cz); if (d > r) r = d; const s = maxScale(w); if (s > sc) sc = s; }
      if (mesh._boneR === undefined) { const P = mesh.positions; let m = 0; for (let i = 0; i < P.length; i += 3) { const d = P[i] * P[i] + P[i + 1] * P[i + 1] + P[i + 2] * P[i + 2]; if (d > m) m = d; } mesh._boneR = Math.sqrt(m); }
      sph[0] = cx; sph[1] = cy; sph[2] = cz; sph[3] = r + mesh._boneR * sc;
      return true;
    }
    const bs = boundingSphere(mesh), w = n.world;
    if (n.instances) {
      const inst = n.instances; let ib = inst._bs;
      if (!ib || inst.dirty || ib[4] !== inst.count) {
        if (!ib) ib = inst._bs = new Float32Array(5);
        const D = inst.data; let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity, pad = 0;
        for (let i = 0; i < inst.count; i++) {
          const o = i * 20, x = D[o + 12], y = D[o + 13], z = D[o + 14];
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
          const s = Math.sqrt(Math.max(D[o] * D[o] + D[o + 1] * D[o + 1] + D[o + 2] * D[o + 2], D[o + 4] * D[o + 4] + D[o + 5] * D[o + 5] + D[o + 6] * D[o + 6], D[o + 8] * D[o + 8] + D[o + 9] * D[o + 9] + D[o + 10] * D[o + 10]));
          const p = (Math.hypot(bs[0], bs[1], bs[2]) + bs[3]) * s; if (p > pad) pad = p;
        }
        ib[0] = (x0 + x1) / 2; ib[1] = (y0 + y1) / 2; ib[2] = (z0 + z1) / 2; ib[3] = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + pad; ib[4] = inst.count;
      }
      sph[0] = w[0] * ib[0] + w[4] * ib[1] + w[8] * ib[2] + w[12]; sph[1] = w[1] * ib[0] + w[5] * ib[1] + w[9] * ib[2] + w[13]; sph[2] = w[2] * ib[0] + w[6] * ib[1] + w[10] * ib[2] + w[14];
      sph[3] = ib[3] * maxScale(w);
      return true;
    }
    sph[0] = w[0] * bs[0] + w[4] * bs[1] + w[8] * bs[2] + w[12]; sph[1] = w[1] * bs[0] + w[5] * bs[1] + w[9] * bs[2] + w[13]; sph[2] = w[2] * bs[0] + w[6] * bs[1] + w[10] * bs[2] + w[14];
    sph[3] = bs[3] * maxScale(w);
    return true;
  }
  /** Is the sphere inside the box the shadow map covers (generously along the light)? */
  function inShadowBox() {
    const m = lightView, x = m[0] * sph[0] + m[4] * sph[1] + m[8] * sph[2] + m[12], y = m[1] * sph[0] + m[5] * sph[1] + m[9] * sph[2] + m[13];
    return Math.abs(x) < shadowR + sph[3] && Math.abs(y) < shadowR + sph[3];
  }

  /**
   * Is this static node's mesh sorted for where the camera is now (mesh.js trimForView)? A set sorts its own for its camera
   * marks (scene.js trimSet). Anything else static, such as a table under a fixed camera, is sorted here the first time it
   * is drawn, for a box around the camera, and again (at most AUTO_TRIES times, one mesh a render call) when the camera
   * leaves that box; after that it is simply drawn whole whenever the camera is outside. A mesh that two nodes share, or
   * whose node has moved, is never sorted.
   */
  const AUTO_TRIES = 5, autoBox = { min: [0, 0, 0], max: [0, 0, 0] };
  let autoLeft = 0;
  function trimmed(n) {
    const mesh = n.mesh, e = frame.camera.position; let tr = mesh.trim;
    if (tr && tr.world && !sameMat(tr.world, n.world)) { if (tr.auto) { mesh.trim = null; mesh._noTrim = true; } return false; }
    if (tr && e[0] >= tr.min[0] && e[0] <= tr.max[0] && e[1] >= tr.min[1] && e[1] <= tr.max[1] && e[2] >= tr.min[2] && e[2] <= tr.max[2]) return true;
    stats.trimMiss++;
    if ((tr && !tr.auto) || mesh._noTrim || !Q.autoTrim || autoLeft <= 0) return false;
    const mat = n.material, tries = tr ? tr.tries : 0;
    if (tries >= AUTO_TRIES || mat.kind !== 'toon' || mat.doubleSided || mat.texMode === 'blend' || mesh.indices.length < 900 || mesh.bones) { if (!tr) mesh._noTrim = true; return false; }
    autoLeft--;
    // air around the camera: more the further it stands from what it looks at, and more each time it has had to grow
    const pad = Math.max(0.5, v3.dist(e, frame.camera.target) * 0.06) * (1 + tries);
    for (let k = 0; k < 3; k++) { autoBox.min[k] = Math.min(e[k] - pad, tr ? tr.min[k] : Infinity); autoBox.max[k] = Math.max(e[k] + pad, tr ? tr.max[k] : -Infinity); }
    tr = trimForView(mesh, n.world, autoBox);
    tr.world = new Float32Array(n.world); tr.auto = true; tr.tries = tries + 1;
    const c = mesh._gpu;                                         // the order of the triangles changed: send the indices again
    if (c && c.gen === ctx.generation) { gl.bindVertexArray(c.geo.vao); gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, c.geo.indexType === gl.UNSIGNED_SHORT ? new Uint16Array(mesh.indices) : mesh.indices); gl.bindVertexArray(null); }
    stats.trimBuilt++;
    return true;
  }

  function collect(n) {
    if (!n.visible) return;
    stats.nodes++;
    if (n.light) addLight(n.world[12], n.world[13], n.world[14], n.light.color, n.light.radius, n.light.intensity, frame.camera.target);
    if (n.mesh) {
      const mat = n.material;
      if (!mat) throw new Error(`renderer: node "${n.name}" has a mesh but no material`);
      if (!n.instances || n.instances.count > 0) {
        const bounded = Q.cull && n.cull && sphereOf(n);
        const seen = !bounded || sphereInFrustum(planes, sph[0], sph[1], sph[2], sph[3]);
        if (seen) {
          // how big it is on screen, for the outline pass (0 = unknown: always outlined)
          n._px = bounded ? sph[3] / (Math.max(Math.hypot(sph[0] - frame.camera.position[0], sph[1] - frame.camera.position[1], sph[2] - frame.camera.position[2]), 1e-3) * frame.pxUnit) : 0;
          n._r = bounded ? sph[3] : Infinity;
          n._trim = Q.trim && n.static && !n.instances && trimmed(n);
          if (mat.kind === 'beam') beams.push(n);
          else if (mat.texMode === 'blend') blended.push(n);
          else opaque.push(n);
        } else stats.culled++;
        if (wantCasters && mat.castShadow && n.castShadow && mat.kind !== 'beam' && mat.texMode !== 'blend' && (!bounded || inShadowBox())) {
          if (n.static && Q.staticShadows) { statics.push(n); staticHash = (Math.imul(staticHash, 31) + n.id + (n.instances ? n.instances.count * 7919 : 0)) | 0; }
          else casters.push(n);
        }
      }
    }
    const c = n.children;
    for (let i = 0; i < c.length; i++) collect(c[i]);
  }

  const orderKey = (n) => (n.instances ? 1e6 : n.bones ? 2e6 : 0) + n.material.id;
  const variantOf = (n) => (n.instances ? 'I' : n.bones ? 'S' : '');
  function sortByMaterial(list) { // insertion sort: the list barely changes between frames
    for (let i = 1; i < list.length; i++) {
      const x = list[i], k = orderKey(x); let j = i - 1;
      while (j >= 0 && orderKey(list[j]) > k) { list[j + 1] = list[j]; j--; }
      list[j + 1] = x;
    }
  }
  /**
   * Opaque things are drawn smallest first: figures and props, then buildings, then the ground and the
   * backdrop, which are mostly hidden by then and fail the depth test instead of being shaded and painted
   * over. (A true front-to-back sort means nothing for a merged set whose one mesh is everywhere at once;
   * size is the order that works for them. Measured on the stage band: 3.1 shaded fragments a pixel -> see the report.)
   */
  function sortBySize(list) {
    for (let i = 1; i < list.length; i++) {
      const x = list[i], k = x._r; let j = i - 1;
      while (j >= 0 && list[j]._r > k) { list[j + 1] = list[j]; j--; }
      list[j + 1] = x;
    }
  }

  function frameUniforms(p) {
    const u = p.u, env = frame.env, cam = frame.camera;
    gl.useProgram(p.program);
    if (u.uViewProj) gl.uniformMatrix4fv(u.uViewProj, false, cam.viewProj);
    if (u.uView) gl.uniformMatrix4fv(u.uView, false, cam.view);
    if (u.uProj) gl.uniformMatrix4fv(u.uProj, false, cam.proj);
    if (u.uShadowVP) gl.uniformMatrix4fv(u.uShadowVP, false, shadowVP);
    if (u.uShadowNormalBias) gl.uniform1f(u.uShadowNormalBias, frame.shadowTexel * 1.5);
    if (u.uCamPos) gl.uniform3fv(u.uCamPos, cam.position);
    if (u.uKeyDir) gl.uniform3fv(u.uKeyDir, env.key.dir);
    if (u.uKeyColor) gl.uniform3fv(u.uKeyColor, env.key.color);
    if (u.uShadowTint) gl.uniform3fv(u.uShadowTint, env.shadow.tint);
    if (u.uShadowLift) gl.uniform2f(u.uShadowLift, env.shadow.lift, env.shadow.saturate ?? 1.3);
    if (u.uAmbSky) { const a = env.ambient.amount, s = env.ambient.sky, g = env.ambient.ground; gl.uniform3f(u.uAmbSky, s[0] * a, s[1] * a, s[2] * a); gl.uniform3f(u.uAmbGround, g[0] * a, g[1] * a, g[2] * a); }
    if (u.uRimColor) { const a = env.rim.amount, c = env.rim.color; gl.uniform3f(u.uRimColor, c[0] * a, c[1] * a, c[2] * a); gl.uniform1f(u.uRimEdge, env.rim.edge); }
    if (u.uFogColor) { const f = env.fog, c = f.color || env.sky.horizon; gl.uniform3fv(u.uFogColor, c); gl.uniform3f(u.uFogParams, f.density, f.max, f.start); }
    if (u.uPointCount) { gl.uniform1i(u.uPointCount, nPoints); if (nPoints > 0) { gl.uniform4fv(u.uPointPos, pointPos); gl.uniform4fv(u.uPointCol, pointCol); } }
    if (u.uShadowMap) { gl.uniform1i(u.uShadowMap, 1); gl.uniform2f(u.uShadowOn, frame.shadowOn ? 1 : 0, 1 / (frame.shadowSize || 1)); }
    if (u.uMap) gl.uniform1i(u.uMap, 0);
    if (u.uTime) gl.uniform1f(u.uTime, frame.time);
  }

  let curCull = true;
  function setCull(on) { if (on === curCull) return; curCull = on; if (on) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE); }
  /** Blend state in one place, so the fill measurement can turn every pass additive. */
  function blend(mode) {
    if (overdraw) { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); return; }
    if (mode === 'off') { gl.disable(gl.BLEND); return; }
    gl.enable(gl.BLEND);
    if (mode === 'alpha') gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    else if (mode === 'add') gl.blendFunc(gl.ONE, gl.ONE);
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied
  }

  function applyToonMaterial(p, m) {
    const u = p.u;
    gl.uniform4f(u.uBand, m.bands, m.bandEdge, m.bandStep, m.bandSoft);
    gl.uniform4f(u.uSpec, m.spec, 1 - m.specSize, 0, 0);
    gl.uniform3fv(u.uSpecColor, m.specColor);
    gl.uniform4f(u.uMat, m.rim, m.emissive, m.receiveShadow ? 1 : 0, m.fog);
    if (m.shadowTint) gl.uniform4f(u.uMatShadow, m.shadowTint[0], m.shadowTint[1], m.shadowTint[2], 1); else gl.uniform4f(u.uMatShadow, 0, 0, 0, 0);
    gl.uniform1f(u.uLightUp, m.lightUp);
    if (m.keyLight) gl.uniform4f(u.uMatKey, m.keyLight[0], m.keyLight[1], m.keyLight[2], 1); else gl.uniform4f(u.uMatKey, 0, 0, 0, 0);
    gl.uniform1i(u.uTexMode, m.texMode === 'none' ? 0 : m.texMode === 'decal' ? 1 : 2);
    gl.uniform1f(u.uAlphaCut, m.texMode === 'cutout' ? m.alphaCut : 0.004);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texOf(m.map));
    setCull(!m.doubleSided);
  }

  // Per-node uniforms that are nearly always the same (tint 1, the whole texture, no flash, glow 1) are remembered per
  // program and only sent when they change: four GL calls saved on most draws. Every write of them goes through here.
  function put4(p, k, loc, a, b, c, d) { const m = p.memo, o = k * 4; if (m[o] === a && m[o + 1] === b && m[o + 2] === c && m[o + 3] === d) return; m[o] = a; m[o + 1] = b; m[o + 2] = c; m[o + 3] = d; gl.uniform4f(loc, a, b, c, d); }
  const M_TINT = 0, M_UV = 1, M_FLASH = 2, M_GLOW = 3;

  /** part: 0 the whole mesh, 1 what the colour pass needs, 2 what the outline pass needs (see mesh.js trimForView). */
  function drawNode(p, n, opacity, shadowPass = false, part = 0) {
    const u = p.u, inst = n.instances;
    const geo = geoOf(n.mesh, inst ? n : null);
    if (inst && (inst.dirty || !geo.instBuf)) { const had = geo.instCap; uploadInstances(gl, geo, inst.data, inst.count); mem.geometry += (geo.instCap - had) * 80; inst.dirty = false; }
    if (n.bones) { const b = n.bones; for (let i = 0; i < b.length; i++) boneMats.set(b[i].world, i * 16); gl.uniformMatrix4fv(u.uBones, false, boneMats); }
    else gl.uniformMatrix4fv(u.uModel, false, n.world);
    if (u.uNormalMat) gl.uniformMatrix3fv(u.uNormalMat, false, m4.normalMat3(nm3, n.world));
    if (u.uTint) put4(p, M_TINT, u.uTint, n.tint[0], n.tint[1], n.tint[2], n.tint[3] * opacity);
    if (u.uUvRect) { const r = n.uvRect; put4(p, M_UV, u.uUvRect, r[0], r[1], r[2], r[3]); }
    if (u.uFlash) { const f = n.flash; put4(p, M_FLASH, u.uFlash, f[0], f[1], f[2], f[3]); }
    if (u.uGlow && p.memo[M_GLOW * 4] !== n.glow) { p.memo[M_GLOW * 4] = n.glow; gl.uniform1f(u.uGlow, n.glow); }
    gl.bindVertexArray(geo.vao);
    let tris = inst ? geo.triangles * inst.count : geo.triangles;
    if (inst) gl.drawElementsInstanced(gl.TRIANGLES, geo.count, geo.indexType, 0, inst.count);
    else if (part > 0 && n._trim && n.mesh.trim) {
      const r = part === 1 ? n.mesh.trim.view : n.mesh.trim.outline;
      tris = r[1] / 3;
      if (r[1] > 0) gl.drawElements(gl.TRIANGLES, r[1], geo.indexType, r[0] * (geo.indexType === gl.UNSIGNED_SHORT ? 2 : 4));
      else return;
    } else gl.drawElements(gl.TRIANGLES, geo.count, geo.indexType, 0);
    stats.triangles += tris; stats.drawCalls++; passNow.draws++; passNow.tris += tris;
    if (n.bones) { stats.figures.draws++; stats.figures.tris += tris; }
    if (shadowPass) { stats.shadowTriangles += tris; stats.shadowDraws++; }
  }

  // ---- small blended decals, baked into one stream a material ----
  // A face is three little meshes (eyes, lids, mouth) on a head: three draws a figure, twenty in a busy band. Each frame
  // the ones that share a material (and opacity and flash) are written into one buffer in world space and drawn at once,
  // at the place in the order where the first of them stood. Their order within a material is kept.
  const DECAL_VERTS = 200, MAX_BATCH = 24, IDENT4 = m4.create(), IDENT3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const batches = []; let nBatch = 0, decalCap = 0, decalIdxCap = 0, decalBuf = null, decalF = null, decalB = null, decalIdx = null, decalGpu = null;
  // (the tint is part of the key and stays a uniform: a textured material tints its picture, which a vertex colour cannot)
  const sameDecal = (a, b) => a.material === b.material && a.tint[0] === b.tint[0] && a.tint[1] === b.tint[1] && a.tint[2] === b.tint[2] && a.tint[3] === b.tint[3] && a.flash[0] === b.flash[0] && a.flash[1] === b.flash[1] && a.flash[2] === b.flash[2] && a.flash[3] === b.flash[3];
  function batchDecals(list) {
    nBatch = 0;
    // Decals on one head are painted over each other in their order (eyes, lids, marks, mouth), and that order must hold.
    // So within each stretch of small decals the list is re-sorted, stably, by a decal's place among its own siblings
    // (every head's first, then every head's second, ...): each head still gets its own in order, and now the ones that
    // can share a draw are neighbours. A neighbouring run with one material, tint and flash becomes one batch.
    let parent = null, rank = 0;
    for (let i = 0; i < list.length; i++) {
      const n = list[i]; n._b = -1;
      if (n.parent === parent) rank++; else { parent = n.parent; rank = 0; }
      n._rank = rank;
      n._small = !n.instances && !n.bones && n.material.kind === 'toon' && n.mesh.positions.length <= DECAL_VERTS * 3;
    }
    for (let i = 0; i < list.length; i++) {
      if (!list[i]._small) continue;
      let j = i + 1; while (j < list.length && list[j]._small) j++;
      for (let a = i + 1; a < j; a++) { const x = list[a]; let k = a - 1; while (k >= i && list[k]._rank > x._rank) { list[k + 1] = list[k]; k--; } list[k + 1] = x; }
      i = j;
    }
    let V = 0, X = 0, any = false;
    for (let i = 0; i < list.length; i++) {
      const n = list[i]; if (!n._small) continue;
      let j = i + 1, v = n.mesh.positions.length / 3, x = n.mesh.indices.length;
      while (j < list.length && list[j]._small && sameDecal(n, list[j])) { v += list[j].mesh.positions.length / 3; x += list[j].mesh.indices.length; j++; }
      if (j - i >= 2 && nBatch < MAX_BATCH) {
        if (!batches[nBatch]) batches[nBatch] = { ref: null, nodes: 0, verts: 0, idx: 0, v0: 0, i0: 0, drawn: false };
        const b = batches[nBatch]; b.ref = n; b.nodes = j - i; b.v0 = V; b.i0 = X; b.verts = 0; b.idx = 0; b.drawn = false; V += v; X += x; any = true;
        for (let k = i; k < j; k++) list[k]._b = nBatch;
        nBatch++;
      }
      i = j - 1;
    }
    if (!any || V > 65535) { for (let i = 0; i < list.length; i++) list[i]._b = -1; nBatch = 0; return; }
    if (V > decalCap) { decalCap = Math.max(V, 256, decalCap * 2); decalBuf = new ArrayBuffer(decalCap * 48); decalF = new Float32Array(decalBuf); decalB = new Uint8Array(decalBuf); }
    if (X > decalIdxCap) { decalIdxCap = Math.max(X, 512, decalIdxCap * 2); decalIdx = new Uint16Array(decalIdxCap); }
    const q = (v) => (v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + 0.5) | 0);
    for (let i = 0; i < list.length; i++) {
      const n = list[i]; if (n._b < 0) continue;
      const b = batches[n._b];
      const m = n.mesh, P = m.positions, N = m.normals, U = m.uvs, C = m.colors, G = m.glow, I = m.indices, w = n.world, r = n.uvRect, nv = P.length / 3, base = b.v0 + b.verts;
      m4.normalMat3(nm3, w);
      for (let v = 0; v < nv; v++) {
        const o = (base + v) * 12, x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], a = N[v * 3], bb = N[v * 3 + 1], c = N[v * 3 + 2];
        decalF[o] = w[0] * x + w[4] * y + w[8] * z + w[12]; decalF[o + 1] = w[1] * x + w[5] * y + w[9] * z + w[13]; decalF[o + 2] = w[2] * x + w[6] * y + w[10] * z + w[14];
        const nx = nm3[0] * a + nm3[3] * bb + nm3[6] * c, ny = nm3[1] * a + nm3[4] * bb + nm3[7] * c, nz = nm3[2] * a + nm3[5] * bb + nm3[8] * c, l = Math.hypot(nx, ny, nz) || 1;
        decalF[o + 3] = nx / l; decalF[o + 4] = ny / l; decalF[o + 5] = nz / l; decalF[o + 6] = 0; decalF[o + 7] = 0; decalF[o + 8] = 0;
        decalF[o + 9] = U[v * 2] * r[2] + r[0]; decalF[o + 10] = U[v * 2 + 1] * r[3] + r[1];
        const cb = (base + v) * 48 + 44;
        decalB[cb] = q(C[v * 3]); decalB[cb + 1] = q(C[v * 3 + 1]); decalB[cb + 2] = q(C[v * 3 + 2]); decalB[cb + 3] = q((G ? G[v] : 0) * n.glow);
      }
      const io = b.i0 + b.idx; for (let k = 0; k < I.length; k++) decalIdx[io + k] = I[k] + base;
      b.verts += nv; b.idx += I.length;
    }
    if (!decalGpu || decalGpu.gen !== ctx.generation) {
      const vao = gl.createVertexArray(), vbo = gl.createBuffer(), ibo = gl.createBuffer(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 48, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 48, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 48, 24); gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 48, 36);
      gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 4, gl.UNSIGNED_BYTE, true, 48, 44);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo); gl.bindVertexArray(null);
      decalGpu = { gen: ctx.generation, vao, vbo, ibo, vcap: 0, icap: 0 };
    }
    gl.bindVertexArray(decalGpu.vao); gl.bindBuffer(gl.ARRAY_BUFFER, decalGpu.vbo);
    if (decalGpu.vcap < decalCap) { gl.bufferData(gl.ARRAY_BUFFER, decalCap * 48, gl.DYNAMIC_DRAW); decalGpu.vcap = decalCap; }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, decalB, 0, V * 48);
    if (decalGpu.icap < decalIdxCap) { gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, decalIdxCap * 2, gl.DYNAMIC_DRAW); decalGpu.icap = decalIdxCap; }
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, decalIdx, 0, X);
    gl.bindVertexArray(null);
  }
  function drawBatch(p, b) {
    const u = p.u, n = b.ref;
    gl.uniformMatrix4fv(u.uModel, false, IDENT4); if (u.uNormalMat) gl.uniformMatrix3fv(u.uNormalMat, false, IDENT3);
    if (u.uTint) put4(p, M_TINT, u.uTint, n.tint[0], n.tint[1], n.tint[2], n.tint[3] * n.material.opacity);
    if (u.uUvRect) put4(p, M_UV, u.uUvRect, 0, 0, 1, 1);
    if (u.uFlash) { const f = n.flash; put4(p, M_FLASH, u.uFlash, f[0], f[1], f[2], f[3]); }
    if (u.uGlow && p.memo[M_GLOW * 4] !== 1) { p.memo[M_GLOW * 4] = 1; gl.uniform1f(u.uGlow, 1); }
    gl.bindVertexArray(decalGpu.vao);
    gl.drawElements(gl.TRIANGLES, b.idx, gl.UNSIGNED_SHORT, b.i0 * 2);
    stats.triangles += b.idx / 3; stats.drawCalls++; passNow.draws++; passNow.tris += b.idx / 3; stats.batched += b.nodes;
    b.drawn = true;
  }

  // ---- runs of the same thing, drawn as instances ----
  // Nodes that stand next to each other in a draw list with the same mesh and material (the stage's unit pieces, a row
  // of identical props nobody instanced) go out as one instanced draw: their world matrices and tints are written into
  // a small buffer on a private copy of the mesh's geometry. Opaque lists are sorted by size, so identical things are
  // neighbours there. Only for uniformly scaled nodes (the instanced shaders do not correct normals).
  const RUN_MAX = 48, runData = new Float32Array(RUN_MAX * 20);
  const same4 = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
  function evenScale(w) { const a = w[0] * w[0] + w[1] * w[1] + w[2] * w[2], b = w[4] * w[4] + w[5] * w[5] + w[6] * w[6], c = w[8] * w[8] + w[9] * w[9] + w[10] * w[10]; return Math.abs(a - b) < a * 0.02 && Math.abs(a - c) < a * 0.02; }
  function runLen(list, i) {
    const a = list[i];
    if (!Q.batch || a.instances || a.bones || a._trim || i + 1 >= list.length || list[i + 1].mesh !== a.mesh || a.mesh.indices.length > 12000 || !evenScale(a.world)) return 1;
    let j = i + 1;
    while (j < list.length && j - i < RUN_MAX) {
      const b = list[j];
      if (b.mesh !== a.mesh || b.material !== a.material || b.instances || b.bones || b._trim || b.glow !== a.glow || b.tint[3] !== a.tint[3] || !same4(a.flash, b.flash) || !same4(a.uvRect, b.uvRect) || !evenScale(b.world)) break;
      j++;
    }
    return j - i;
  }
  function drawRun(p, list, i, len, opacity, shadowPass) {
    const u = p.u, a = list[i], mesh = a.mesh, geo = geoOf(mesh, mesh._auto || (mesh._auto = {}));
    for (let k = 0; k < len; k++) { const n = list[i + k], o = k * 20; runData.set(n.world, o); runData[o + 16] = n.tint[0]; runData[o + 17] = n.tint[1]; runData[o + 18] = n.tint[2]; runData[o + 19] = 1; }
    { const had = geo.instCap; uploadInstances(gl, geo, runData, len); mem.geometry += (geo.instCap - had) * 80; }
    gl.uniformMatrix4fv(u.uModel, false, IDENT4);
    if (u.uTint) put4(p, M_TINT, u.uTint, 1, 1, 1, a.tint[3] * opacity);
    if (u.uUvRect) { const r = a.uvRect; put4(p, M_UV, u.uUvRect, r[0], r[1], r[2], r[3]); }
    if (u.uFlash) { const f = a.flash; put4(p, M_FLASH, u.uFlash, f[0], f[1], f[2], f[3]); }
    if (u.uGlow && p.memo[M_GLOW * 4] !== a.glow) { p.memo[M_GLOW * 4] = a.glow; gl.uniform1f(u.uGlow, a.glow); }
    gl.bindVertexArray(geo.vao);
    gl.drawElementsInstanced(gl.TRIANGLES, geo.count, geo.indexType, 0, len);
    const tris = geo.triangles * len;
    stats.triangles += tris; stats.drawCalls++; passNow.draws++; passNow.tris += tris; stats.batched += len;
    if (shadowPass) { stats.shadowTriangles += tris; stats.shadowDraws++; }
  }

  function drawToonList(list, part = 0) {
    let p = null, mat = null;
    for (let i = 0; i < list.length; i++) {
      const n = list[i], len = part < 0 ? 1 : runLen(list, i), want = prog('toon', len > 1 ? 'I' : variantOf(n));
      if (want !== p) { p = want; gl.useProgram(p.program); mat = null; }
      if (n.material !== mat) { mat = n.material; applyToonMaterial(p, mat); }
      if (part < 0 && n._b >= 0) { if (!batches[n._b].drawn) drawBatch(p, batches[n._b]); continue; }
      if (len > 1) { drawRun(p, list, i, len, mat.opacity, false); i += len - 1; } else drawNode(p, n, mat.opacity, false, part);
    }
  }

  /** Where the light looks from for this view: fills lightView, shadowVP and returns the texel size in world units. */
  function fitShadow(env, cam, view, size, entry = null) {
    const sh = env.shadow;
    const c = (view && view.shadowCenter) || sh.center || cam.target;
    let r = view && view.shadowRadius > 0 ? view.shadowRadius : sh.radius > 0 ? sh.radius : v3.dist(cam.position, cam.target) * 0.62;
    if (Q.staticShadows) r *= 1.1;   // room for the coarse steps below: the map may sit a tenth of its radius off centre
    const L = env.key.dir;
    v3.addScaled(eye, c, L, r * 3);
    m4.lookAt(lightView, eye, c, Math.abs(L[1]) > 0.98 ? UPX : UP);
    const texel = (2 * r) / size;
    // Stop the edges crawling: the map moves in whole texels. With kept static shadows it moves in steps of a sixteenth of
    // its width instead, because every move redraws all of the set into the kept map (29k triangles on the lantern stalls,
    // every tenth frame under a drifting camera, before this); what the map covers is then off centre by at most 1/32 of it.
    const step = Q.staticShadows ? texel * Math.max(1, size >> 4) : texel;
    // (and it stays where it is until the centre is most of a step away, so a centre that hovers on a boundary does not flip it)
    for (let k = 12; k < 15; k++) {
      const raw = lightView[k], st = k === 14 ? step * 4 : step, prev = entry && entry.snapStep === step ? entry.snap[k - 12] : NaN;
      lightView[k] = Math.abs(raw - prev) <= st * 0.8 ? prev : Math.round(raw / st) * st;
      if (entry) entry.snap[k - 12] = lightView[k];
    }
    if (entry) entry.snapStep = step;
    m4.ortho(lightProj, -r, r, -r, r, 0.1, r * 6);
    m4.multiply(shadowVP, lightProj, lightView);
    shadowR = r;
    return texel;
  }
  const sameMat = (a, b) => { for (let i = 0; i < 16; i++) if (a[i] !== b[i]) return false; return true; };
  function dropShadowTarget(t) { if (t) { gl.deleteFramebuffer(t.fbo); gl.deleteTexture(t.tex); mem.shadows -= t.size * t.size * 2; } }
  function newShadowTarget(size) { mem.shadows += size * size * 2; return createShadowTarget(gl, size); }
  // Shadow maps are the largest thing a scene holds on the GPU (two of them a scene: what never moves, and that plus what
  // does), and every set ever drawn used to keep its pair: 104 MB after chapter 1 was built at 'medium', four times that at
  // 'high'. Now only the SHADOW_SCENES scenes drawn most recently hold maps (a play frame draws two: the stage and the
  // table); a scene that comes back gets new ones and draws its kept map again, once.
  const SHADOW_SCENES = 3;
  let shadowClock = 0;
  function emptyEntry(e) { dropShadowTarget(e.target); dropShadowTarget(e.kept); e.target = e.kept = null; e.keptValid = false; e.fresh = true; e.lastTex = null; const at = shadowLive.indexOf(e); if (at >= 0) shadowLive.splice(at, 1); }
  function shadowEntry(scene, size) {
    let e = shadowOf.get(scene);
    if (!e || e.gen !== ctx.generation) { e = { gen: ctx.generation, size, target: null, kept: null, vp: m4.create(), keptVP: m4.create(), keptHash: 0, keptValid: false, snap: [NaN, NaN, NaN], snapStep: 0, texel: 0.01, tick: 0, slot: e ? e.slot : shadowSlots++, fresh: true, used: 0, lastTex: null }; shadowOf.set(scene, e); }
    if (e.size !== size) { emptyEntry(e); e.size = size; }
    if (shadowLive.indexOf(e) < 0) {
      while (shadowLive.length >= SHADOW_SCENES) { let old = shadowLive[0]; for (let i = 1; i < shadowLive.length; i++) if (shadowLive[i].used < old.used) old = shadowLive[i]; emptyEntry(old); }
      shadowLive.push(e);
    }
    e.used = ++shadowClock;
    return e;
  }
  function drawCasters(list) {
    let p = null, mat = null;
    for (let i = 0; i < list.length; i++) {
      const n = list[i], m = n.material, cut = m.texMode === 'cutout', len = runLen(list, i);
      const want = prog('depth', (len > 1 ? 'I' : variantOf(n)) + (cut ? 'C' : ''));
      if (want !== p) { p = want; gl.useProgram(p.program); gl.uniformMatrix4fv(p.u.uViewProj, false, shadowVP); mat = null; }
      if (cut && m !== mat) { mat = m; gl.uniform1i(p.u.uMap, 0); gl.uniform1f(p.u.uAlphaCut, m.alphaCut); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texOf(m.map)); }
      setCull(!m.doubleSided);
      if (len > 1) { drawRun(p, list, i, len, 1, true); i += len - 1; } else drawNode(p, n, 1, true);
    }
  }

  function render(scene, camera, time = 0, view = null) {
    if (ctx.lost) return stats;
    const t0 = performance.now();
    ctx.dprCap = Math.min(hardDpr, Q.dprCap);
    ctx.resize();
    const env = scene.env, dpr = ctx.dpr;
    // the part of the canvas this call draws into, in device pixels with GL's bottom-left origin
    let VX = 0, VY = 0, W = ctx.width, H = ctx.height;
    if (view) {
      VX = Math.round(view.x * dpr); W = Math.max(1, Math.round(view.w * dpr)); H = Math.max(1, Math.round(view.h * dpr));
      VY = ctx.height - Math.round(view.y * dpr) - H;
    }
    camera.update(W / H);
    for (let i = 0; i < PASSES.length; i++) { const ps = stats.pass[PASSES[i]]; ps.draws = 0; ps.tris = 0; }
    stats.figures.draws = 0; stats.figures.tris = 0; stats.trimMiss = 0; stats.trimBuilt = 0; stats.batched = 0; stats.shadowKept = ''; autoLeft = 1;
    stats.drawCalls = 0; stats.triangles = 0; stats.nodes = 0; stats.culled = 0; stats.shadowDraws = 0; stats.shadowTriangles = 0; stats.shadowFresh = false; stats.width = W; stats.height = H;
    frame = frame || {}; frame.env = env; frame.camera = camera; frame.time = time; frame.shadowTexel = 0.01; frame.shadowSize = 16;
    frame.pxUnit = (2 * Math.tan(camera.fov * DEG / 2)) / H; // world units per device pixel at depth 1
    frame.shadowOn = !!env.shadow.on && Q.shadowTaps > 0 && !(view && view.shadow === 'off');
    frustumPlanes(planes, camera.viewProj);

    // ---- shadow map: decide first whether this call redraws it, so the gather knows whether to list casters ----
    let entry = null, redraw = false, shadowTex = null;
    if (frame.shadowOn) {
      const size = Math.min((view && view.shadowSize) || env.shadow.size || 1024, Q.shadowSize);
      entry = shadowEntry(scene, size);
      const texel = fitShadow(env, camera, view, size, entry);
      entry.tick++;
      redraw = entry.fresh || Q.shadowRate <= 1 || !sameMat(entry.vp, shadowVP) || (entry.tick + entry.slot) % Q.shadowRate === 0;
      if (redraw) entry.texel = texel; else shadowVP.set(entry.vp); // not this time: look the old map up with the matrix it was drawn with
      frame.shadowTexel = entry.texel; frame.shadowSize = size;
    }
    wantCasters = redraw;

    // ---- gather ----
    scene.root.updateWorld(null);
    opaque.length = 0; blended.length = 0; beams.length = 0; casters.length = 0; statics.length = 0; nCand = 0; staticHash = 0;
    for (let i = 0; i < env.points.length; i++) { const l = env.points[i]; addLight(l.pos[0], l.pos[1], l.pos[2], l.color, l.radius, l.intensity ?? 1, camera.target); }
    collect(scene.root);
    sortBySize(opaque); sortByMaterial(casters);
    nPoints = 0;
    const lampCap = Math.min(S.MAX_POINTS, Q.maxLamps, view && view.maxLamps != null ? view.maxLamps : S.MAX_POINTS);
    for (let k = 0; k < lampCap && k < nCand; k++) { // the lanterns nearest what the camera looks at
      let best = -1, bs = Infinity;
      for (let i = 0; i < nCand; i++) if (candScore[i] < bs) { bs = candScore[i]; best = i; }
      candScore[best] = Infinity;
      pointPos.set(candPos.subarray(best * 4, best * 4 + 4), nPoints * 4); pointCol.set(candCol.subarray(best * 4, best * 4 + 4), nPoints * 4); nPoints++;
    }
    stats.lights = nPoints;

    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.BLEND); gl.colorMask(true, true, true, true);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); curCull = true;

    if (frame.shadowOn) {
      if (redraw) {
        gl.disable(gl.SCISSOR_TEST); gl.viewport(0, 0, entry.size, entry.size);
        gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 3); gl.clearDepth(1);
        let cleared = false;
        enter('shadow');
        if (statics.length > 0) {
          // what never moves: drawn once into a map of its own, copied in before the moving things each time
          if (!entry.kept) entry.kept = newShadowTarget(entry.size);
          if (!entry.keptValid || entry.keptHash !== staticHash || !sameMat(entry.keptVP, shadowVP)) {
            stats.shadowKept = !entry.keptValid ? 'new' : entry.keptHash !== staticHash ? 'set' : 'moved';   // why the kept map was drawn again
            gl.bindFramebuffer(gl.FRAMEBUFFER, entry.kept.fbo); gl.clear(gl.DEPTH_BUFFER_BIT);
            drawCasters(statics);
            entry.keptValid = true; entry.keptHash = staticHash; entry.keptVP.set(shadowVP);
          }
          if (casters.length > 0) { if (!entry.target) entry.target = newShadowTarget(entry.size); copyShadow(gl, entry.kept, entry.target); cleared = true; }
        }
        if (statics.length > 0 && casters.length === 0) shadowTex = entry.kept.tex; // nothing moves: the kept map is the map
        else {
          if (!entry.target) entry.target = newShadowTarget(entry.size);
          gl.bindFramebuffer(gl.FRAMEBUFFER, entry.target.fbo);
          if (!cleared) gl.clear(gl.DEPTH_BUFFER_BIT);
          drawCasters(casters);
          shadowTex = entry.target.tex;
        }
        entry.lastTex = shadowTex; entry.vp.set(shadowVP); entry.fresh = false; stats.shadowFresh = true;
        gl.disable(gl.POLYGON_OFFSET_FILL);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      } else shadowTex = entry.lastTex;
    } else {
      if (!nullShadow) nullShadow = createShadowTarget(gl, 16);
      shadowTex = nullShadow.tex;
    }
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, shadowTex); gl.activeTexture(gl.TEXTURE0);

    // ---- main pass, into the canvas or the off-screen buffer that is antialiased on the way out ----
    const aa = overdraw ? 'none' : Q.aa;
    if (aa !== 'none') {
      const samples = aa === 'msaa' ? 4 : 0;
      if (!colorTarget || colorTarget.w !== ctx.width || colorTarget.h !== ctx.height || (colorTarget.samples > 1) !== (samples > 1)) { if (colorTarget) colorTarget.dispose(); colorTarget = createColorTarget(gl, ctx.width, ctx.height, samples); }
      gl.bindFramebuffer(gl.FRAMEBUFFER, colorTarget.fbo);
    } else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); if (colorTarget) { colorTarget.dispose(); colorTarget = null; } }
    gl.viewport(VX, VY, W, H);
    gl.enable(gl.SCISSOR_TEST); gl.scissor(VX, VY, W, H);
    const fc = env.fog.color || env.sky.horizon;
    if (overdraw) { gl.clearDepth(1); gl.clear(gl.DEPTH_BUFFER_BIT); } // colour was cleared once for the whole measurement
    else { gl.clearColor(fc[0], fc[1], fc[2], 1); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); }
    blend('off');
    setCull(true);
    frameUniforms(prog('toon')); frameUniforms(prog('toon', 'I')); frameUniforms(prog('toon', 'S'));
    enter('opaque');
    drawToonList(opaque, 1);

    // outlines: the same meshes again, pushed out along their smoothed normals, back faces only
    gl.cullFace(gl.FRONT); setCull(true);
    enter('outline');
    {
      const ref = v3.dist(camera.position, camera.target);
      let p = null, mat = null;
      for (let i = 0; i < opaque.length; i++) {
        const n = opaque[i], m = n.material;
        if (!m.outline || m.outline.width <= 0) continue;
        if (n._px > 0 && n._px < Q.outlineMinPx) continue; // too small on screen for its line to read
        const len = runLen(opaque, i), want = prog('outline', len > 1 ? 'I' : variantOf(n));
        if (want !== p) { p = want; frameUniforms(p); mat = null; }
        if (m !== mat) {
          mat = m;
          const oc = env.outline.color || m.outline.color;
          gl.uniform4f(p.u.uOutline, m.outline.width * env.outline.width * ctx.dpr, frame.pxUnit, ref, 0);
          gl.uniform4f(p.u.uOutlineColor, oc[0], oc[1], oc[2], m.outline.self);
        }
        if (len > 1) { drawRun(p, opaque, i, len, 1, false); i += len - 1; } else drawNode(p, n, 1, false, 2);
      }
    }
    gl.cullFace(gl.BACK);

    // water
    const wt = env.water;
    if (wt) {
      const p = prog('water'), u = p.u; frameUniforms(p); setCull(false); enter('water');
      const half = camera.far * 0.95;
      gl.uniform4f(u.uWaterXform, camera.position[0], wt.level, camera.position[2], half);
      gl.uniform3fv(u.uDeep, wt.deep); gl.uniform3fv(u.uMid, wt.mid); gl.uniform3fv(u.uShallow, wt.shallow); gl.uniform3fv(u.uFoamColor, wt.foam);
      if (u.uGlint) gl.uniform4f(u.uGlint, wt.glint[0], wt.glint[1], wt.glint[2], wt.glintDensity);
      if (u.uDrift) gl.uniform2f(u.uDrift, wt.drift[0], wt.drift[1]);
      nFoam = Math.min(wt.shores.length, S.MAX_FOAM);
      for (let i = 0; i < nFoam; i++) { const s = wt.shores[i]; foam[i * 4] = s[0]; foam[i * 4 + 1] = s[1]; foam[i * 4 + 2] = s[2]; foam[i * 4 + 3] = s[3] ?? 1; }
      gl.uniform1i(u.uFoamCount, nFoam); if (nFoam > 0) gl.uniform4fv(u.uFoam, foam);
      const bx = wt.box; // one rounded rectangle of shore: [centre x, centre z, half x, half z, corner radius, band width]
      if (bx) { gl.uniform4f(u.uShoreBox, bx[0], bx[1], bx[2], bx[3]); gl.uniform2f(u.uShoreBoxR, bx[4] ?? 0.2, bx[5] ?? 0.2); } else gl.uniform2f(u.uShoreBoxR, 0, 0);
      gl.bindVertexArray(waterVao); gl.drawArrays(gl.TRIANGLES, 0, 6); stats.drawCalls++; stats.triangles += 2; stats.pass.water.draws++; stats.pass.water.tris += 2;
    }

    // sky, behind everything
    {
      const p = prog('sky'), u = p.u, sk = env.sky, sun = sk.sun; frameUniforms(p); setCull(false); enter('sky');
      gl.uniformMatrix4fv(u.uInvViewProj, false, camera.invViewProj);
      gl.uniform3fv(u.uZenith, sk.zenith); gl.uniform4f(u.uSkyMid, sk.mid[0], sk.mid[1], sk.mid[2], sk.midAt); gl.uniform3fv(u.uHorizon, sk.horizon); gl.uniform3fv(u.uBelow, sk.below);
      gl.uniform4f(u.uGlow, sk.glow[0], sk.glow[1], sk.glow[2], sk.glowAmount);
      gl.uniform3fv(u.uSunDir, sk.sunDir || env.key.dir);
      gl.uniform4f(u.uSunColor, sun.color[0], sun.color[1], sun.color[2], sun.size * DEG);
      gl.uniform4f(u.uSunHalo, sun.halo[0], sun.halo[1], sun.halo[2], sun.haloAmount);
      gl.uniform4f(u.uMoon, sk.moon, 0, 0, sk.moon > 0 ? 1 : 0);
      gl.uniform2f(u.uStars, sk.stars, time);
      gl.depthMask(false);
      gl.bindVertexArray(skyVao); gl.drawArrays(gl.TRIANGLES, 0, 3); stats.drawCalls++; stats.triangles += 1; stats.pass.sky.draws++; stats.pass.sky.tris += 1;
    }

    // blended decals (faces, painted clouds), in scene order
    gl.depthMask(false); blend('alpha');
    if (blended.length) {
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1, -2);
      enter('blended');
      if (Q.batch) batchDecals(blended); else for (let i = 0; i < blended.length; i++) blended[i]._b = -1;
      drawToonList(blended, -1);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }

    // beams: additive, both faces
    if (beams.length) {
      const p = prog('beam'); frameUniforms(p); setCull(false); blend('add');
      let mat = null;
      enter('beams');
      for (let i = 0; i < beams.length; i++) {
        const n = beams[i];
        if (n.instances) throw new Error(`renderer: beam node "${n.name}" is instanced; beams are drawn one at a time`);
        if (n.material !== mat) { mat = n.material; gl.uniform4f(p.u.uBeam, mat.beam.power, mat.beam.near, mat.beam.far, mat.beam.steps); }
        drawNode(p, n, mat.opacity);
      }
    }

    // sprites: one instanced call; additive kinds write zero alpha under a premultiplied blend
    const sp = scene.sprites;
    if (sp && sp.pack(camera) > 0) {
      const p = prog('sprite'), u = p.u; frameUniforms(p); setCull(false); enter('sprites');
      blend('premul');
      gl.uniform3fv(u.uCamRight, camera.right); gl.uniform3fv(u.uCamUp, camera.upDir);
      const L = env.key.dir; let lx = v3.dot(L, camera.right), ly = v3.dot(L, camera.upDir); const ll = Math.hypot(lx, ly) || 1;
      gl.uniform2f(u.uLight2, lx / ll, ly / ll);
      const ink = env.outline.color; if (ink) gl.uniform3fv(u.uInk, ink); else gl.uniform3f(u.uInk, 0.11, 0.15, 0.26);
      if (u.uSpriteMap) { gl.uniform1i(u.uSpriteMap, 0); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texOf(sp.texture)); }
      spriteGeometry(p);
      gl.bindVertexArray(spriteVao.vao); gl.bindBuffer(gl.ARRAY_BUFFER, spriteBuf);
      if (spriteCap < sp.capacity) { gl.bufferData(gl.ARRAY_BUFFER, sp.capacity * SPRITE_FLOATS * 4, gl.DYNAMIC_DRAW); spriteCap = sp.capacity; }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, sp.data, 0, sp.count * SPRITE_FLOATS);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, sp.count); stats.drawCalls++; stats.triangles += sp.count * 2; stats.pass.sprites.draws++; stats.pass.sprites.tris += sp.count * 2;
    }

    gl.disable(gl.BLEND); gl.depthMask(true); gl.bindVertexArray(null); gl.colorMask(true, true, true, true);

    // ---- present ----
    if (aa !== 'none') {
      colorTarget.resolve(VX, VY, W, H);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(VX, VY, W, H); gl.scissor(VX, VY, W, H);
      const p = prog('present'); gl.useProgram(p.program);
      gl.disable(gl.DEPTH_TEST); gl.depthMask(false); setCull(false);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, colorTarget.tex);
      gl.uniform1i(p.u.uTex, 0); gl.uniform2f(p.u.uTexel, 1 / colorTarget.w, 1 / colorTarget.h); gl.uniform1f(p.u.uFxaa, aa === 'fxaa' ? 1 : 0);
      gl.bindVertexArray(skyVao); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
      gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
      colorTarget.discard();   // presented: nothing in it is read again (the next view clears its own rectangle)
    }
    gl.disable(gl.SCISSOR_TEST);
    stats.cpuMs = performance.now() - t0;
    return stats;
  }

  const api = {
    ctx, gl, stats, render,
    get quality() { return Q; },
    /**
     * Change the quality tier (or some fields of it) while running. Shaders whose compile-time switches
     * changed are compiled again at once, so the cost lands here and not in the next frame.
     */
    setQuality(q) {
      const before = defines();
      Q = resolveQuality(typeof q === 'object' && !q.base && !q.name ? { ...Q, ...q, name: Q.name.replace(/\*$/, '') + '*' } : q);
      ctx.dprCap = Math.min(hardDpr, Q.dprCap);
      if (defines() !== before && !ctx.lost) { dropPrograms(); warm(); }
      return Q;
    },
    /**
     * How many fragments one frame shades: runs drawFn() (which calls render() as a frame does) with every
     * pass set to add one step of red per shaded fragment, and reads the canvas back. Fragments the depth
     * test rejects are not counted, which is what a GPU with early depth testing pays for. The shadow pass
     * is depth only and is not in the number. `only` (a pass name: opaque, outline, water, sky, blended, beams, sprites)
     * counts that pass alone. Returns { fragments, pixels, perPixel, max }. For tools, not for play.
     */
    measureFill(drawFn, only = null) {
      if (only && !stats.pass[only]) throw new Error(`renderer: measureFill knows the passes ${PASSES.join(', ')}, not ${JSON.stringify(only)}`);
      ctx.resize();
      overdraw = true; overdrawOnly = only; gl.colorMask(true, true, true, true);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.disable(gl.SCISSOR_TEST); gl.viewport(0, 0, ctx.width, ctx.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      let out;
      try {
        drawFn();
        const px = new Uint8Array(ctx.width * ctx.height * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, ctx.width, ctx.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let sum = 0, max = 0; for (let i = 0; i < px.length; i += 4) { sum += px[i]; if (px[i] > max) max = px[i]; }
        out = { fragments: Math.round(sum / 8), pixels: ctx.width * ctx.height, perPixel: +(sum / 8 / (ctx.width * ctx.height)).toFixed(3), max: Math.round(max / 8), saturated: max >= 248 };
      } finally { overdraw = false; overdrawOnly = null; gl.colorMask(true, true, true, true); }
      return out;
    },
    resize: () => ctx.resize(),
    /** Call after editing a mesh's arrays in place, so it is uploaded (and measured) again. */
    invalidate(mesh) { mesh.trim = null; mesh._bs = null; mesh._bb = null; mesh._boneR = undefined; dropHeld(mesh._auto); dropHeld(mesh); },
    /**
     * Free what a scene (or a subtree) holds on the GPU: every mesh's buffers, every material's texture, and for a scene
     * its shadow maps and sprite sheet. Call it for a set the game has left (a chapter's sets when the next chapter starts)
     * and then drop your own references to it; nothing else frees GPU memory before the garbage collector gets to it.
     * `skip` is a list of nodes whose subtrees are left alone: pass [set.actors] while figures of the troupe may still
     * stand there (they are shared with the next set). Anything released that is drawn again is simply uploaded again.
     * Returns { meshes, textures, bytes } freed.
     */
    release(root, { skip = [] } = {}) {
      if (ctx.lost || !root) return { meshes: 0, textures: 0, bytes: 0 };
      const before = mem.geometry + mem.textures + mem.shadows; let meshes = 0, textures = 0;
      const scene = root.root && root.env ? root : null;
      const walk = (n) => {
        if (skip.includes(n)) return;
        if (n.mesh) { meshes += dropHeld(n.mesh) + dropHeld(n.mesh._auto) + dropHeld(n); }
        if (n.material && n.material.map) textures += dropTex(n.material.map);
        for (const c of n.children) walk(c);
      };
      walk(scene ? scene.root : root);
      if (scene) {
        const e = shadowOf.get(scene);
        if (e) { if (e.gen === ctx.generation) emptyEntry(e); shadowOf.delete(scene); }
        if (scene.sprites && scene.sprites.texture) textures += dropTex(scene.sprites.texture);
      }
      return { meshes, textures, bytes: before - (mem.geometry + mem.textures + mem.shadows) };
    },
    /** GPU memory this renderer holds now, in bytes: { geometry, textures, shadows, target, total, meshes, textureCount }. */
    memory() {
      const target = colorTarget ? colorTarget.w * colorTarget.h * (4 + (colorTarget.samples > 1 ? 8 * colorTarget.samples : 4)) : 0;
      return { geometry: mem.geometry, textures: mem.textures, shadows: mem.shadows, target, total: mem.geometry + mem.textures + mem.shadows + target, meshes: mem.meshes, textureCount: mem.textureCount };
    },
    dispose() { const ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); },
  };
  return api;
}
// index.js exports createRenderer only; the tiers ride along on it so nothing else needs importing.
createRenderer.QUALITY = QUALITY;
createRenderer.resolveQuality = resolveQuality;
