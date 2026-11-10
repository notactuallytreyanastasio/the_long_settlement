// The cel renderer: draws a scene (scene.js) with a camera.
//
// Frame order: shadow map -> toon opaque -> outlines (inverted hull) -> water -> sky ->
// blended decals -> additive beams -> sprites. One pass each, no post-processing chain.
// The render loop allocates nothing; all scratch storage is created once below.

import { v3, m4, DEG } from './math.js';
import { createContext, createProgram, createGeometry, uploadInstances, createTexture, createShadowTarget } from './gl.js';
import * as S from './shaders.js';
import { SPRITE_FLOATS } from './sprites.js';

const MAX_CAND = 32;

/**
 * createRenderer(canvas, { antialias = true, dprCap = 2 }) ->
 *   { render(scene, camera, timeSeconds), stats, ctx, gl, resize(), invalidate(mesh), dispose() }
 * stats after each render: { drawCalls, triangles, nodes, lights, cpuMs, width, height }
 */
export function createRenderer(canvas, opts = {}) {
  const ctx = createContext(canvas, opts);
  const gl = ctx.gl;
  const stats = { drawCalls: 0, triangles: 0, nodes: 0, lights: 0, cpuMs: 0, width: 0, height: 0 };

  // ---- GPU objects (rebuilt after a context loss) ----
  let P = null, shadow = null, skyVao = null, waterVao = null, spriteVao = null, spriteBuf = null, spriteCap = 0, white = null, shadowSize = 0;

  function build() {
    const mk = (name, vs, fs, defs = '') => createProgram(gl, name, vs, fs, defs);
    P = {
      toon: mk('toon', S.TOON_VS, S.TOON_FS), toonI: mk('toon-instanced', S.TOON_VS, S.TOON_FS, '#define INSTANCED'),
      outline: mk('outline', S.OUTLINE_VS, S.OUTLINE_FS), outlineI: mk('outline-instanced', S.OUTLINE_VS, S.OUTLINE_FS, '#define INSTANCED'),
      depth: mk('shadow-depth', S.DEPTH_VS, S.DEPTH_FS), depthI: mk('shadow-depth-instanced', S.DEPTH_VS, S.DEPTH_FS, '#define INSTANCED'),
      beam: mk('beam', S.BEAM_VS, S.BEAM_FS), sky: mk('sky', S.SKY_VS, S.SKY_FS), water: mk('water', S.WATER_VS, S.WATER_FS),
      sprite: mk('sprite', S.SPRITE_VS, S.SPRITE_FS),
    };
    shadow = null; shadowSize = 0;
    const tri = (data) => {
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null); return vao;
    };
    skyVao = tri([-1, -1, 0, 3, -1, 0, -1, 3, 0]);
    waterVao = tri([-1, 0, -1, -1, 0, 1, 1, 0, -1, 1, 0, -1, -1, 0, 1, 1, 0, 1]);
    // sprites: a unit quad, instanced
    spriteVao = gl.createVertexArray(); gl.bindVertexArray(spriteVao);
    const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const sp = P.sprite.program, aC = gl.getAttribLocation(sp, 'aCorner');
    gl.enableVertexAttribArray(aC); gl.vertexAttribPointer(aC, 2, gl.FLOAT, false, 0, 0);
    spriteBuf = gl.createBuffer(); spriteCap = 0; gl.bindBuffer(gl.ARRAY_BUFFER, spriteBuf);
    ['iA', 'iB', 'iC'].forEach((nm, k) => { const l = gl.getAttribLocation(sp, nm); if (l < 0) return; gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 4, gl.FLOAT, false, SPRITE_FLOATS * 4, k * 16); gl.vertexAttribDivisor(l, 1); });
    gl.bindVertexArray(null);
    const c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 1, 1);
    white = createTexture(gl, c, { mips: false });
  }
  build();
  ctx.onRestored = build;

  // ---- lazily uploaded resources ----
  function geoOf(mesh, owner) {
    const holder = owner || mesh; // instanced nodes own a private copy, because the instance buffer lives on the VAO
    let c = holder._gpu;
    if (!c || c.gen !== ctx.generation || c.mesh !== mesh) {
      if (c && c.gen === ctx.generation) dropGeo(c.geo);
      c = holder._gpu = { gen: ctx.generation, mesh, geo: createGeometry(gl, mesh) };
    }
    return c.geo;
  }
  function dropGeo(geo) { gl.deleteVertexArray(geo.vao); gl.deleteBuffer(geo.vbo); gl.deleteBuffer(geo.ibo); if (geo.instBuf) gl.deleteBuffer(geo.instBuf); }
  function texOf(t) {
    if (!t) return white;
    let c = t._gpu;
    if (!c || c.gen !== ctx.generation || c.version !== t.version) {
      if (c && c.gen === ctx.generation) gl.deleteTexture(c.tex);
      c = t._gpu = { gen: ctx.generation, version: t.version, tex: createTexture(gl, t.source, { filter: t.filter, mips: t.mips }) };
    }
    return c.tex;
  }

  // ---- per-frame scratch ----
  const opaque = [], blended = [], beams = [], casters = [];
  const nm3 = new Float32Array(9), tint4 = new Float32Array(4), lightView = m4.create(), lightProj = m4.create(), shadowVP = m4.create();
  const eye = v3.create(), tmp = v3.create(), UP = v3.create(0, 1, 0), UPX = v3.create(1, 0, 0), IDENT = m4.create();
  const candPos = new Float32Array(MAX_CAND * 4), candCol = new Float32Array(MAX_CAND * 3), candScore = new Float32Array(MAX_CAND);
  const pointPos = new Float32Array(S.MAX_POINTS * 4), pointCol = new Float32Array(S.MAX_POINTS * 3), foam = new Float32Array(S.MAX_FOAM * 4);
  let nCand = 0, nPoints = 0, nFoam = 0, frame = null;

  function addLight(x, y, z, color, radius, intensity, target) {
    if (nCand >= MAX_CAND || intensity <= 0 || radius <= 0) return;
    const k = nCand++;
    candPos[k * 4] = x; candPos[k * 4 + 1] = y; candPos[k * 4 + 2] = z; candPos[k * 4 + 3] = radius;
    candCol[k * 3] = color[0] * intensity; candCol[k * 3 + 1] = color[1] * intensity; candCol[k * 3 + 2] = color[2] * intensity;
    candScore[k] = Math.hypot(x - target[0], y - target[1], z - target[2]) - radius;
  }

  function collect(n) {
    if (!n.visible) return;
    stats.nodes++;
    if (n.light) addLight(n.world[12], n.world[13], n.world[14], n.light.color, n.light.radius, n.light.intensity, frame.camera.target);
    if (n.mesh) {
      const mat = n.material;
      if (!mat) throw new Error(`renderer: node "${n.name}" has a mesh but no material`);
      if (!n.instances || n.instances.count > 0) {
        if (mat.kind === 'beam') beams.push(n);
        else if (mat.texMode === 'blend') blended.push(n);
        else opaque.push(n);
        if (mat.castShadow && n.castShadow && mat.kind !== 'beam' && mat.texMode !== 'blend') casters.push(n);
      }
    }
    const c = n.children;
    for (let i = 0; i < c.length; i++) collect(c[i]);
  }

  const orderKey = (n) => (n.instances ? 1e6 : 0) + n.material.id;
  function sortByMaterial(list) { // insertion sort: the list barely changes between frames
    for (let i = 1; i < list.length; i++) {
      const x = list[i], k = orderKey(x); let j = i - 1;
      while (j >= 0 && orderKey(list[j]) > k) { list[j + 1] = list[j]; j--; }
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
    if (u.uShadowNormalBias) gl.uniform1f(u.uShadowNormalBias, frame.shadowTexel * 1.6);
    if (u.uCamPos) gl.uniform3fv(u.uCamPos, cam.position);
    if (u.uKeyDir) gl.uniform3fv(u.uKeyDir, env.key.dir);
    if (u.uKeyColor) gl.uniform3fv(u.uKeyColor, env.key.color);
    if (u.uShadowTint) gl.uniform3fv(u.uShadowTint, env.shadow.tint);
    if (u.uShadowLift) gl.uniform1f(u.uShadowLift, env.shadow.lift);
    if (u.uAmbSky) { const a = env.ambient.amount, s = env.ambient.sky, g = env.ambient.ground; gl.uniform3f(u.uAmbSky, s[0] * a, s[1] * a, s[2] * a); gl.uniform3f(u.uAmbGround, g[0] * a, g[1] * a, g[2] * a); }
    if (u.uRimColor) { const a = env.rim.amount, c = env.rim.color; gl.uniform3f(u.uRimColor, c[0] * a, c[1] * a, c[2] * a); gl.uniform1f(u.uRimEdge, env.rim.edge); }
    if (u.uFogColor) { const f = env.fog, c = f.color || env.sky.horizon; gl.uniform3fv(u.uFogColor, c); gl.uniform3f(u.uFogParams, f.density, f.max, f.start); }
    if (u.uPointCount) { gl.uniform1i(u.uPointCount, nPoints); if (nPoints > 0) { gl.uniform4fv(u.uPointPos, pointPos); gl.uniform3fv(u.uPointCol, pointCol); } }
    if (u.uShadowMap) { gl.uniform1i(u.uShadowMap, 1); gl.uniform1f(u.uShadowOn, frame.shadowOn ? 1 : 0); }
    if (u.uMap) gl.uniform1i(u.uMap, 0);
    if (u.uTime) gl.uniform1f(u.uTime, frame.time);
  }

  let curCull = true;
  function setCull(on) { if (on === curCull) return; curCull = on; if (on) gl.enable(gl.CULL_FACE); else gl.disable(gl.CULL_FACE); }

  function applyToonMaterial(p, m) {
    const u = p.u;
    gl.uniform4f(u.uBand, m.bands, m.bandEdge, m.bandStep, m.bandSoft);
    gl.uniform4f(u.uSpec, m.spec, 1 - m.specSize, 0, 0);
    gl.uniform3fv(u.uSpecColor, m.specColor);
    gl.uniform4f(u.uMat, m.rim, m.emissive, m.receiveShadow ? 1 : 0, m.fog);
    if (m.shadowTint) gl.uniform4f(u.uMatShadow, m.shadowTint[0], m.shadowTint[1], m.shadowTint[2], 1); else gl.uniform4f(u.uMatShadow, 0, 0, 0, 0);
    gl.uniform1i(u.uTexMode, m.texMode === 'none' ? 0 : m.texMode === 'decal' ? 1 : 2);
    gl.uniform1f(u.uAlphaCut, m.texMode === 'cutout' ? m.alphaCut : 0.004);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texOf(m.map));
    setCull(!m.doubleSided);
  }

  function drawNode(p, n, opacity) {
    const u = p.u, inst = n.instances;
    const geo = geoOf(n.mesh, inst ? n : null);
    if (inst && (inst.dirty || !geo.instBuf)) { uploadInstances(gl, geo, inst.data, inst.count); inst.dirty = false; }
    gl.uniformMatrix4fv(u.uModel, false, n.world);
    if (u.uNormalMat) gl.uniformMatrix3fv(u.uNormalMat, false, m4.normalMat3(nm3, n.world));
    if (u.uTint) { tint4[0] = n.tint[0]; tint4[1] = n.tint[1]; tint4[2] = n.tint[2]; tint4[3] = n.tint[3] * opacity; gl.uniform4fv(u.uTint, tint4); }
    if (u.uUvRect) gl.uniform4fv(u.uUvRect, n.uvRect);
    if (u.uFlash) gl.uniform4fv(u.uFlash, n.flash);
    gl.bindVertexArray(geo.vao);
    if (inst) { gl.drawElementsInstanced(gl.TRIANGLES, geo.count, geo.indexType, 0, inst.count); stats.triangles += geo.triangles * inst.count; }
    else { gl.drawElements(gl.TRIANGLES, geo.count, geo.indexType, 0); stats.triangles += geo.triangles; }
    stats.drawCalls++;
  }

  function drawToonList(list) {
    let p = null, mat = null;
    for (let i = 0; i < list.length; i++) {
      const n = list[i], want = n.instances ? P.toonI : P.toon;
      if (want !== p) { p = want; gl.useProgram(p.program); mat = null; }
      if (n.material !== mat) { mat = n.material; applyToonMaterial(p, mat); }
      drawNode(p, n, mat.opacity);
    }
  }

  function fitShadow(env, cam) {
    const sh = env.shadow;
    const size = sh.size || 1024;
    if (!shadow || shadowSize !== size) { if (shadow) { gl.deleteFramebuffer(shadow.fbo); gl.deleteTexture(shadow.tex); } shadow = createShadowTarget(gl, size); shadowSize = size; }
    const c = sh.center || cam.target;
    const r = sh.radius > 0 ? sh.radius : v3.dist(cam.position, cam.target) * 0.62;
    const L = env.key.dir;
    v3.addScaled(eye, c, L, r * 3);
    m4.lookAt(lightView, eye, c, Math.abs(L[1]) > 0.98 ? UPX : UP);
    const texel = (2 * r) / size;
    lightView[12] = Math.round(lightView[12] / texel) * texel; lightView[13] = Math.round(lightView[13] / texel) * texel; // stop the edges crawling
    m4.ortho(lightProj, -r, r, -r, r, 0.1, r * 6);
    m4.multiply(shadowVP, lightProj, lightView);
    frame.shadowTexel = texel;
  }

  function render(scene, camera, time = 0) {
    if (ctx.lost) return stats;
    const t0 = performance.now();
    ctx.resize();
    const W = ctx.width, H = ctx.height, env = scene.env;
    camera.update(W / H);
    stats.drawCalls = 0; stats.triangles = 0; stats.nodes = 0; stats.width = W; stats.height = H;
    frame = frame || {}; frame.env = env; frame.camera = camera; frame.time = time; frame.shadowOn = !!env.shadow.on; frame.shadowTexel = 0.01;

    // ---- gather ----
    scene.root.updateWorld(null);
    opaque.length = 0; blended.length = 0; beams.length = 0; casters.length = 0; nCand = 0;
    for (let i = 0; i < env.points.length; i++) { const l = env.points[i]; addLight(l.pos[0], l.pos[1], l.pos[2], l.color, l.radius, l.intensity ?? 1, camera.target); }
    collect(scene.root);
    sortByMaterial(opaque); sortByMaterial(casters);
    nPoints = 0;
    for (let k = 0; k < S.MAX_POINTS && k < nCand; k++) { // the lanterns nearest what the camera looks at
      let best = -1, bs = Infinity;
      for (let i = 0; i < nCand; i++) if (candScore[i] < bs) { bs = candScore[i]; best = i; }
      candScore[best] = Infinity;
      pointPos.set(candPos.subarray(best * 4, best * 4 + 4), nPoints * 4); pointCol.set(candCol.subarray(best * 3, best * 3 + 3), nPoints * 3); nPoints++;
    }
    stats.lights = nPoints;

    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); curCull = true;

    // ---- shadow map ----
    if (frame.shadowOn) {
      fitShadow(env, camera);
      gl.bindFramebuffer(gl.FRAMEBUFFER, shadow.fbo); gl.viewport(0, 0, shadow.size, shadow.size);
      gl.clearDepth(1); gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 3);
      let p = null;
      for (let i = 0; i < casters.length; i++) {
        const n = casters[i], want = n.instances ? P.depthI : P.depth;
        if (want !== p) { p = want; gl.useProgram(p.program); gl.uniformMatrix4fv(p.u.uViewProj, false, shadowVP); }
        setCull(!n.material.doubleSided);
        drawNode(p, n, 1);
      }
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } else if (!shadow) { shadow = createShadowTarget(gl, 16); shadowSize = 16; }
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, shadow.tex); gl.activeTexture(gl.TEXTURE0);

    // ---- main pass ----
    gl.viewport(0, 0, W, H);
    const fc = env.fog.color || env.sky.horizon;
    gl.clearColor(fc[0], fc[1], fc[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    setCull(true);
    frameUniforms(P.toon); frameUniforms(P.toonI);
    drawToonList(opaque);

    // outlines: the same meshes again, pushed out along their smoothed normals, back faces only
    gl.cullFace(gl.FRONT); setCull(true);
    {
      const px = (2 * Math.tan(camera.fov * DEG / 2)) / H, ref = v3.dist(camera.position, camera.target);
      let p = null, mat = null;
      for (let i = 0; i < opaque.length; i++) {
        const n = opaque[i], m = n.material;
        if (!m.outline || m.outline.width <= 0) continue;
        const want = n.instances ? P.outlineI : P.outline;
        if (want !== p) { p = want; frameUniforms(p); mat = null; }
        if (m !== mat) {
          mat = m;
          const oc = env.outline.color || m.outline.color;
          gl.uniform4f(p.u.uOutline, m.outline.width * env.outline.width * ctx.dpr, px, ref, 0);
          gl.uniform4f(p.u.uOutlineColor, oc[0], oc[1], oc[2], m.outline.self);
        }
        drawNode(p, n, 1);
      }
    }
    gl.cullFace(gl.BACK);

    // water
    const wt = env.water;
    if (wt) {
      const p = P.water, u = p.u; frameUniforms(p); setCull(false);
      const half = camera.far * 0.95;
      gl.uniform4f(u.uWaterXform, camera.position[0], wt.level, camera.position[2], half);
      gl.uniform3fv(u.uDeep, wt.deep); gl.uniform3fv(u.uMid, wt.mid); gl.uniform3fv(u.uShallow, wt.shallow); gl.uniform3fv(u.uFoamColor, wt.foam);
      gl.uniform4f(u.uGlint, wt.glint[0], wt.glint[1], wt.glint[2], wt.glintDensity);
      gl.uniform2f(u.uDrift, wt.drift[0], wt.drift[1]);
      nFoam = Math.min(wt.shores.length, S.MAX_FOAM);
      for (let i = 0; i < nFoam; i++) { const s = wt.shores[i]; foam[i * 4] = s[0]; foam[i * 4 + 1] = s[1]; foam[i * 4 + 2] = s[2]; foam[i * 4 + 3] = s[3] ?? 1; }
      gl.uniform1i(u.uFoamCount, nFoam); if (nFoam > 0) gl.uniform4fv(u.uFoam, foam);
      gl.bindVertexArray(waterVao); gl.drawArrays(gl.TRIANGLES, 0, 6); stats.drawCalls++; stats.triangles += 2;
    }

    // sky, behind everything
    {
      const p = P.sky, u = p.u, sk = env.sky, sun = sk.sun; frameUniforms(p); setCull(false);
      gl.uniformMatrix4fv(u.uInvViewProj, false, camera.invViewProj);
      gl.uniform3fv(u.uZenith, sk.zenith); gl.uniform3fv(u.uHorizon, sk.horizon); gl.uniform3fv(u.uBelow, sk.below);
      gl.uniform4f(u.uGlow, sk.glow[0], sk.glow[1], sk.glow[2], sk.glowAmount);
      gl.uniform3fv(u.uSunDir, sk.sunDir || env.key.dir);
      gl.uniform4f(u.uSunColor, sun.color[0], sun.color[1], sun.color[2], sun.size * DEG);
      gl.uniform4f(u.uSunHalo, sun.halo[0], sun.halo[1], sun.halo[2], sun.haloAmount);
      gl.uniform4f(u.uMoon, sk.moon, 0, 0, sk.moon > 0 ? 1 : 0);
      gl.uniform2f(u.uStars, sk.stars, time);
      gl.depthMask(false);
      gl.bindVertexArray(skyVao); gl.drawArrays(gl.TRIANGLES, 0, 3); stats.drawCalls++; stats.triangles += 1;
    }

    // blended decals (faces), in scene order
    gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (blended.length) {
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1, -2);
      drawToonList(blended);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }

    // beams: additive, both faces
    if (beams.length) {
      const p = P.beam; frameUniforms(p); setCull(false); gl.blendFunc(gl.ONE, gl.ONE);
      let mat = null;
      for (let i = 0; i < beams.length; i++) {
        const n = beams[i];
        if (n.instances) throw new Error(`renderer: beam node "${n.name}" is instanced; beams are drawn one at a time`);
        if (n.material !== mat) { mat = n.material; gl.uniform4f(p.u.uBeam, mat.beam.power, mat.beam.near, mat.beam.far, mat.beam.steps); }
        drawNode(p, n, mat.opacity);
      }
    }

    // sprites: one instanced call; additive kinds write zero alpha under a premultiplied blend
    const sp = scene.sprites;
    if (sp && sp.pack() > 0) {
      const p = P.sprite, u = p.u; frameUniforms(p); setCull(false);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.uniform3fv(u.uCamRight, camera.right); gl.uniform3fv(u.uCamUp, camera.upDir);
      const L = env.key.dir; let lx = v3.dot(L, camera.right), ly = v3.dot(L, camera.upDir); const ll = Math.hypot(lx, ly) || 1;
      gl.uniform2f(u.uLight2, lx / ll, ly / ll);
      const ink = env.outline.color; if (ink) gl.uniform3fv(u.uInk, ink); else gl.uniform3f(u.uInk, 0.11, 0.15, 0.26);
      gl.bindVertexArray(spriteVao); gl.bindBuffer(gl.ARRAY_BUFFER, spriteBuf);
      if (spriteCap < sp.capacity) { gl.bufferData(gl.ARRAY_BUFFER, sp.capacity * SPRITE_FLOATS * 4, gl.DYNAMIC_DRAW); spriteCap = sp.capacity; }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, sp.data, 0, sp.count * SPRITE_FLOATS);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, sp.count); stats.drawCalls++; stats.triangles += sp.count * 2;
    }

    gl.disable(gl.BLEND); gl.depthMask(true); gl.bindVertexArray(null);
    stats.cpuMs = performance.now() - t0;
    return stats;
  }

  return {
    ctx, gl, stats, render,
    resize: () => ctx.resize(),
    /** Call after editing a mesh's arrays in place, so it is uploaded again. */
    invalidate(mesh) { if (mesh._gpu) { if (mesh._gpu.gen === ctx.generation) dropGeo(mesh._gpu.geo); mesh._gpu = null; } },
    dispose() { const ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); },
  };
}
