// A 2D-canvas texture atlas: draw eyes, mouths, brows, signage and painted art with the canvas
// API, get back a uv rectangle. One atlas = one texture = one material, so a whole cast's faces
// batch together. Needs a DOM (document.createElement), so build atlases in the shell.

import { texture } from './scene.js';

/**
 * createAtlas(size = 1024, { pad = 2 }) ->
 *   { canvas, ctx, texture, add(name, w, h, draw) -> rect, rect(name) -> rect, has(name) }
 *
 * add() reserves a w x h pixel cell, calls draw(ctx, w, h) with the origin at the cell's top-left
 * and clipping on, and returns the cell's uv rectangle [u, v, su, sv] (a Float32Array to copy into
 * node.uvRect). Cells are transparent until drawn on. Adding after the first render is fine: the
 * texture is uploaded again (do it at load time, not per frame).
 */
export function createAtlas(size = 1024, { pad = 2 } = {}) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const tex = texture(canvas);
  const rects = new Map();
  let x = pad, y = pad, rowH = 0;
  const atlas = {
    canvas, ctx, texture: tex, size,
    add(name, w, h, draw) {
      if (rects.has(name)) throw new Error(`atlas: "${name}" is already in the atlas`);
      if (w + pad * 2 > size || h + pad * 2 > size) throw new Error(`atlas: "${name}" (${w}x${h}) is larger than the atlas (${size})`);
      if (x + w + pad > size) { x = pad; y += rowH + pad; rowH = 0; }
      if (y + h + pad > size) throw new Error(`atlas: no room left for "${name}" (${w}x${h}) in a ${size} atlas; make the atlas larger`);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.translate(x, y);
      draw(ctx, w, h);
      ctx.restore();
      const r = new Float32Array([x / size, y / size, w / size, h / size]);
      rects.set(name, r);
      x += w + pad; rowH = Math.max(rowH, h);
      tex.touch();
      return r;
    },
    rect(name) { const r = rects.get(name); if (!r) throw new Error(`atlas: nothing named "${name}" (have: ${[...rects.keys()].join(', ')})`); return r; },
    has(name) { return rects.has(name); },
  };
  return atlas;
}
