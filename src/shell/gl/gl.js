// WebGL2 plumbing: context, programs, geometry, textures, the shadow target.
//
// GPU objects are created lazily and cached on the CPU object that describes them (a mesh, a
// texture source) under a key that carries the context generation, so after a context loss
// everything is simply rebuilt on next use. Nothing here allocates per frame.

/** Vertex layout shared by every mesh program. 48 bytes per vertex. */
export const ATTR = { pos: 0, normal: 1, onormal: 2, uv: 3, color: 4, inst0: 5, inst1: 6, inst2: 7, inst3: 8, instColor: 9, bone: 10 };
const STRIDE = 48;

/**
 * Make a WebGL2 context on a canvas.
 * Returns { gl, canvas, generation, lost, dprCap, resize(), onLost, onRestored }.
 * resize() matches the drawing buffer to the canvas's CSS size times min(devicePixelRatio, dprCap)
 * and returns true when it changed.
 */
export function createContext(canvas, { antialias = true, dprCap = 2, alpha = false } = {}) {
  const gl = canvas.getContext('webgl2', { antialias, alpha, depth: true, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  if (!gl) throw new Error('gl: WebGL2 is not available in this browser (needs iOS 15 / Safari 15 or later)');
  const ctx = {
    gl, canvas, generation: 1, lost: false, dprCap, dpr: 1, width: 0, height: 0, onLost: null, onRestored: null,
    resize() {
      const dpr = Math.min(globalThis.devicePixelRatio || 1, ctx.dprCap);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      ctx.dpr = dpr;
      if (w === ctx.width && h === ctx.height) return false;
      canvas.width = ctx.width = w; canvas.height = ctx.height = h;
      return true;
    },
  };
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); ctx.lost = true; if (ctx.onLost) ctx.onLost(); });
  canvas.addEventListener('webglcontextrestored', () => { ctx.lost = false; ctx.generation++; if (ctx.onRestored) ctx.onRestored(); });
  ctx.resize();
  return ctx;
}

function shaderError(gl, name, kind, src, log) {
  // "ERROR: 0:123: message" -> show the offending source line
  const lines = src.split('\n');
  const detail = log.split('\n').filter(Boolean).map((l) => {
    const m = /^(?:ERROR|WARNING):\s*\d+:(\d+):/.exec(l);
    return m ? `${l}\n    ${m[1]} | ${(lines[Number(m[1]) - 1] || '').trim()}` : l;
  }).join('\n');
  return new Error(`gl: ${kind} shader "${name}" failed to compile\n${detail}`);
}

/**
 * Compile and link. Returns { program, name, u: { uniformName: location } } with every active
 * uniform looked up (array uniforms under their base name, e.g. u.uPointPos).
 */
export function createProgram(gl, name, vsSrc, fsSrc, defines = '') {
  const head = '#version 300 es\n' + defines + '\n';
  const make = (type, kind, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, head + src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw shaderError(gl, name, kind, head + src, gl.getShaderInfoLog(s) || '');
    return s;
  };
  const vs = make(gl.VERTEX_SHADER, 'vertex', vsSrc), fs = make(gl.FRAGMENT_SHADER, 'fragment', fsSrc);
  const p = gl.createProgram();
  gl.attachShader(p, vs); gl.attachShader(p, fs);
  gl.bindAttribLocation(p, ATTR.pos, 'aPos'); gl.bindAttribLocation(p, ATTR.normal, 'aNormal'); gl.bindAttribLocation(p, ATTR.onormal, 'aONormal');
  gl.bindAttribLocation(p, ATTR.uv, 'aUv'); gl.bindAttribLocation(p, ATTR.color, 'aColor');
  gl.bindAttribLocation(p, ATTR.inst0, 'aInst'); gl.bindAttribLocation(p, ATTR.instColor, 'aInstColor'); gl.bindAttribLocation(p, ATTR.bone, 'aBone');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(`gl: program "${name}" failed to link\n${gl.getProgramInfoLog(p)}`);
  gl.deleteShader(vs); gl.deleteShader(fs);
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) || 0;
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); if (!info) continue; const base = info.name.replace(/\[0\]$/, ''); u[base] = gl.getUniformLocation(p, info.name); }
  return { program: p, name, u };
}

/**
 * Upload a mesh (see mesh.js) as one interleaved buffer and a VAO.
 * Layout: position 3f, normal 3f, outline normal * width 3f, uv 2f, colour rgb + glow as 4 bytes.
 * A mesh with a `bones` array (see batchFigure in scene.js) also gets a one-byte bone index per vertex.
 * Returns { vao, vbo, ibo, count, indexType, triangles }.
 */
export function createGeometry(gl, mesh) {
  const n = mesh.positions.length / 3;
  const buf = new ArrayBuffer(n * STRIDE), f = new Float32Array(buf), b = new Uint8Array(buf);
  const q = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  for (let i = 0; i < n; i++) {
    const o = i * 12, w = mesh.owidth ? mesh.owidth[i] : 1;
    f[o] = mesh.positions[i * 3]; f[o + 1] = mesh.positions[i * 3 + 1]; f[o + 2] = mesh.positions[i * 3 + 2];
    f[o + 3] = mesh.normals[i * 3]; f[o + 4] = mesh.normals[i * 3 + 1]; f[o + 5] = mesh.normals[i * 3 + 2];
    f[o + 6] = mesh.onormals[i * 3] * w; f[o + 7] = mesh.onormals[i * 3 + 1] * w; f[o + 8] = mesh.onormals[i * 3 + 2] * w;
    f[o + 9] = mesh.uvs[i * 2]; f[o + 10] = mesh.uvs[i * 2 + 1];
    const c = i * STRIDE + 44;
    b[c] = q(mesh.colors[i * 3]); b[c + 1] = q(mesh.colors[i * 3 + 1]); b[c + 2] = q(mesh.colors[i * 3 + 2]); b[c + 3] = q(mesh.glow ? mesh.glow[i] : 0);
  }
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(ATTR.pos); gl.vertexAttribPointer(ATTR.pos, 3, gl.FLOAT, false, STRIDE, 0);
  gl.enableVertexAttribArray(ATTR.normal); gl.vertexAttribPointer(ATTR.normal, 3, gl.FLOAT, false, STRIDE, 12);
  gl.enableVertexAttribArray(ATTR.onormal); gl.vertexAttribPointer(ATTR.onormal, 3, gl.FLOAT, false, STRIDE, 24);
  gl.enableVertexAttribArray(ATTR.uv); gl.vertexAttribPointer(ATTR.uv, 2, gl.FLOAT, false, STRIDE, 36);
  gl.enableVertexAttribArray(ATTR.color); gl.vertexAttribPointer(ATTR.color, 4, gl.UNSIGNED_BYTE, true, STRIDE, 44);
  let boneBuf = null;
  if (mesh.bones) { // one byte per vertex: which bone (node) of a batched figure moves it
    boneBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, boneBuf); gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(mesh.bones), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(ATTR.bone); gl.vertexAttribPointer(ATTR.bone, 1, gl.UNSIGNED_BYTE, false, 1, 0);
  }
  const small = n <= 65535;
  const ibo = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, small ? new Uint16Array(mesh.indices) : mesh.indices, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, vbo, ibo, count: mesh.indices.length, indexType: small ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT, triangles: mesh.indices.length / 3, instBuf: null, instCap: 0, boneBuf };
}

/**
 * Attach (or grow) a per-instance buffer on a geometry: a mat4 and an rgba tint per instance,
 * 20 floats each. Call uploadInstances() when the data changes.
 */
export function uploadInstances(gl, geo, data, count) {
  gl.bindVertexArray(geo.vao);
  if (!geo.instBuf || geo.instCap < count) {
    if (geo.instBuf) gl.deleteBuffer(geo.instBuf);
    geo.instBuf = gl.createBuffer(); geo.instCap = Math.max(count, data.length / 20);
    gl.bindBuffer(gl.ARRAY_BUFFER, geo.instBuf); gl.bufferData(gl.ARRAY_BUFFER, geo.instCap * 80, gl.DYNAMIC_DRAW);
    for (let k = 0; k < 4; k++) { gl.enableVertexAttribArray(ATTR.inst0 + k); gl.vertexAttribPointer(ATTR.inst0 + k, 4, gl.FLOAT, false, 80, k * 16); gl.vertexAttribDivisor(ATTR.inst0 + k, 1); }
    gl.enableVertexAttribArray(ATTR.instColor); gl.vertexAttribPointer(ATTR.instColor, 4, gl.FLOAT, false, 80, 64); gl.vertexAttribDivisor(ATTR.instColor, 1);
  } else gl.bindBuffer(gl.ARRAY_BUFFER, geo.instBuf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, count * 20);
  gl.bindVertexArray(null);
}

/**
 * A texture from a canvas or image. v = 0 is the top row. Mipmapped when the size allows.
 * Colour is stored premultiplied by alpha (what a canvas already holds), so filtering and mipmaps do
 * not drag the black of transparent texels into the edges; the shaders divide it back out.
 */
export function createTexture(gl, source, { filter = 'linear', mips = true, clamp = true } = {}) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  const lin = filter === 'linear';
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, lin ? gl.LINEAR : gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, lin ? (mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR) : gl.NEAREST);
  const wrap = clamp ? gl.CLAMP_TO_EDGE : gl.REPEAT;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  if (lin && mips) gl.generateMipmap(gl.TEXTURE_2D);
  return tex;
}

/** A depth-only render target with hardware depth comparison, for the shadow map. */
export function createShadowTarget(gl, size) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, size, size);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
  gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE && !gl.isContextLost()) throw new Error(`gl: shadow framebuffer incomplete (0x${status.toString(16)})`);
  return { fbo, tex, size };
}

/**
 * An off-screen colour target the size of the canvas, for antialiasing that can be changed while
 * running: the scene is drawn here and then presented to the canvas.
 *   samples > 1   multisampled renderbuffers, resolved into `tex` by resolve()
 *   samples <= 1  drawn straight into `tex`
 * Returns { fbo (draw here), tex (RGBA8, linear), w, h, samples, resolve(x, y, w, h), dispose() }.
 * The resolve goes into a texture of the same format on purpose: resolving a multisampled buffer
 * straight to the canvas is only legal when the two formats are identical, and what format a canvas
 * has is the browser's business.
 */
export function createColorTarget(gl, w, h, samples = 0) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const check = (what) => { const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER); if (st !== gl.FRAMEBUFFER_COMPLETE && !gl.isContextLost()) throw new Error(`gl: ${what} framebuffer incomplete (0x${st.toString(16)}) at ${w}x${h}, ${samples} samples`); };
  const texFbo = gl.createFramebuffer(), rbs = [];
  gl.bindFramebuffer(gl.FRAMEBUFFER, texFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  let fbo = texFbo, msFbo = null;
  const n = samples > 1 ? Math.min(samples, gl.getParameter(gl.MAX_SAMPLES) || 1) : 0;
  const rb = (format, attach) => { const r = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, r); if (n > 1) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, n, format, w, h); else gl.renderbufferStorage(gl.RENDERBUFFER, format, w, h); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, attach, gl.RENDERBUFFER, r); rbs.push(r); };
  if (n > 1) {
    check('resolve');
    msFbo = fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, msFbo);
    rb(gl.RGBA8, gl.COLOR_ATTACHMENT0); rb(gl.DEPTH_COMPONENT24, gl.DEPTH_ATTACHMENT);
    check('multisample');
  } else { rb(gl.DEPTH_COMPONENT24, gl.DEPTH_ATTACHMENT); check('colour'); }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  return {
    fbo, tex, w, h, samples: n,
    resolve(x, y, rw, rh) {
      if (!msFbo) return;
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msFbo); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, texFbo);
      gl.blitFramebuffer(x, y, x + rw, y + rh, x, y, x + rw, y + rh, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    },
    dispose() { gl.deleteFramebuffer(texFbo); if (msFbo) gl.deleteFramebuffer(msFbo); for (const r of rbs) gl.deleteRenderbuffer(r); gl.deleteTexture(tex); },
  };
}

/** Copy one shadow target's depth into another of the same size (the kept static shadows, before the moving ones are added). */
export function copyShadow(gl, from, to) {
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, from.fbo); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, to.fbo);
  gl.blitFramebuffer(0, 0, from.size, from.size, 0, 0, to.size, to.size, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
}
