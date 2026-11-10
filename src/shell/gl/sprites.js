// Camera-facing sprites and particles, all drawn in one instanced call.
// This file is the CPU side only (pure, no GL); renderer.js uploads `data` once per frame.
//
// Kinds:
//   glow     additive stepped halo: lamp bloom, sun glints, embers
//   sparkle  additive four-point star
//   puff     toon smoke ball with a shadow crescent and an ink edge; pops (shrinks) at the end of its life
//   curl     a white wind streak that runs in from the left and winds into a spiral
//   ring     a flat ring on the ground plane that thins as it expands: foam, splashes, shockwaves
//   dot      a flat disc: spray, dust, petals

import { rgb } from './math.js';

export const KIND = { glow: 0, sparkle: 1, puff: 2, curl: 3, ring: 4, dot: 5 };
const FLOATS = 12; // per instance in the GPU buffer
const PF = 20;     // per particle in the simulation

function kindOf(k) {
  const v = typeof k === 'number' ? k : KIND[k];
  if (v === undefined) throw new Error(`sprites: unknown kind ${JSON.stringify(k)} (have ${Object.keys(KIND).join(', ')})`);
  return v;
}

/**
 * createSprites(capacity) -> a sprite system. Assign it to scene.sprites and call update(dt) each frame.
 *
 *   add({ kind, pos, size, color, alpha, rot, phase }) -> a persistent sprite object you may edit
 *        every frame (pos is [x, y, z]; size is a number or [w, h]; set .visible = false to hide)
 *   remove(sprite)
 *   spawn({ kind, pos, vel, size, endSize, life, color, alpha, rot, spin, gravity, drag })
 *        one particle; it is simulated and removed after `life` seconds
 *   puff(pos, opts) / sparkle(pos, opts) / gust(pos, opts) / splash(pos, opts)   ready-made bursts
 *   update(dt)
 */
export function createSprites(capacity = 512) {
  const sim = new Float32Array(capacity * PF);
  const sys = {
    capacity, count: 0, live: 0, data: new Float32Array(capacity * FLOATS), fixed: [],
    add(o = {}) {
      const c = rgb(o.color || '#ffffff');
      const s = { kind: kindOf(o.kind ?? 'glow'), pos: [...(o.pos || [0, 0, 0])], size: typeof o.size === 'number' ? [o.size, o.size] : [...(o.size || [1, 1])], color: c, alpha: o.alpha ?? 1, rot: o.rot || 0, phase: o.phase || 0, visible: true };
      sys.fixed.push(s); return s;
    },
    remove(s) { const i = sys.fixed.indexOf(s); if (i >= 0) sys.fixed.splice(i, 1); },
    spawn(o) {
      if (sys.live >= capacity) return; // full: drop the particle rather than grow mid-frame
      const k = sys.live++ * PF, c = o.color ? rgb(o.color) : WHITE, p = o.pos, v = o.vel || ZERO;
      sim[k] = p[0]; sim[k + 1] = p[1]; sim[k + 2] = p[2]; sim[k + 3] = v[0]; sim[k + 4] = v[1]; sim[k + 5] = v[2];
      sim[k + 6] = o.size ?? 0.3; sim[k + 7] = o.endSize ?? sim[k + 6]; sim[k + 8] = o.life ?? 1; sim[k + 9] = 0;
      sim[k + 10] = c[0]; sim[k + 11] = c[1]; sim[k + 12] = c[2]; sim[k + 13] = o.alpha ?? 1;
      sim[k + 14] = o.rot || 0; sim[k + 15] = o.spin || 0; sim[k + 16] = kindOf(o.kind ?? 'dot'); sim[k + 17] = o.gravity || 0; sim[k + 18] = o.drag || 0; sim[k + 19] = o.aspect || 1;
    },
    update(dt) {
      for (let i = 0; i < sys.live;) {
        const k = i * PF;
        sim[k + 9] += dt;
        if (sim[k + 9] >= sim[k + 8]) { sys.live--; sim.copyWithin(k, sys.live * PF, sys.live * PF + PF); continue; }
        const d = Math.max(0, 1 - sim[k + 18] * dt);
        sim[k + 3] *= d; sim[k + 5] *= d; sim[k + 4] = sim[k + 4] * d - sim[k + 17] * dt;
        sim[k] += sim[k + 3] * dt; sim[k + 1] += sim[k + 4] * dt; sim[k + 2] += sim[k + 5] * dt;
        sim[k + 14] += sim[k + 15] * dt;
        i++;
      }
    },
    /** Write the instance buffer (alpha-blended kinds first, additive last). Called by the renderer. */
    pack() {
      const D = sys.data; let n = 0;
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < sys.fixed.length && n < capacity; i++) {
          const s = sys.fixed[i];
          if (!s.visible || (s.kind < 1.5) !== (pass === 1)) continue;
          const o = n++ * FLOATS;
          D[o] = s.pos[0]; D[o + 1] = s.pos[1]; D[o + 2] = s.pos[2]; D[o + 3] = s.kind;
          D[o + 4] = s.size[0]; D[o + 5] = s.size[1]; D[o + 6] = s.rot; D[o + 7] = s.phase;
          D[o + 8] = s.color[0]; D[o + 9] = s.color[1]; D[o + 10] = s.color[2]; D[o + 11] = s.alpha;
        }
        for (let i = 0; i < sys.live && n < capacity; i++) {
          const k = i * PF, kind = sim[k + 16];
          if ((kind < 1.5) !== (pass === 1)) continue;
          const t = sim[k + 9] / sim[k + 8], e = 1 - (1 - t) * (1 - t);
          let size = sim[k + 6] + (sim[k + 7] - sim[k + 6]) * e, a = sim[k + 13];
          if (kind === 2) { if (t < 0.12) size *= 0.4 + 0.6 * (t / 0.12); if (t > 0.78) { const q = (t - 0.78) / 0.22; size *= 1 - q * q; } } // puffs pop in and pop out
          else if (kind === 3) a *= 1;                                             // curls animate by phase
          else if (kind === 1) { const q = Math.sin(t * Math.PI); size *= q; }     // sparkles swell and vanish
          else a *= t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
          const o = n++ * FLOATS;
          D[o] = sim[k]; D[o + 1] = sim[k + 1]; D[o + 2] = sim[k + 2]; D[o + 3] = kind;
          D[o + 4] = size * sim[k + 19]; D[o + 5] = size; D[o + 6] = sim[k + 14]; D[o + 7] = t;
          D[o + 8] = sim[k + 10]; D[o + 9] = sim[k + 11]; D[o + 10] = sim[k + 12]; D[o + 11] = a;
        }
      }
      sys.count = n;
      return n;
    },

    /** A burst of toon smoke balls rising from pos. opts: { count, color, size, rise, spread, life } */
    puff(pos, { count = 3, color = '#ffffff', size = 0.5, rise = 0.6, spread = 0.25, life = 1.6 } = {}) {
      for (let i = 0; i < count; i++) {
        P[0] = pos[0] + (Math.random() - 0.5) * spread; P[1] = pos[1] + (Math.random() - 0.5) * spread * 0.5; P[2] = pos[2] + (Math.random() - 0.5) * spread;
        V[0] = (Math.random() - 0.5) * spread * 1.5; V[1] = rise * (0.7 + Math.random() * 0.6); V[2] = (Math.random() - 0.5) * spread * 1.5;
        sys.spawn({ kind: 2, pos: P, vel: V, size: size * (0.5 + Math.random() * 0.4), endSize: size * (1 + Math.random() * 0.5), life: life * (0.7 + Math.random() * 0.6), color, drag: 0.6 });
      }
    },
    /** Twinkling stars scattered around pos. opts: { count, color, size, spread, life } */
    sparkle(pos, { count = 4, color = '#fff6c0', size = 0.35, spread = 0.5, life = 0.7 } = {}) {
      for (let i = 0; i < count; i++) {
        P[0] = pos[0] + (Math.random() - 0.5) * spread; P[1] = pos[1] + (Math.random() - 0.5) * spread; P[2] = pos[2] + (Math.random() - 0.5) * spread;
        V[0] = 0; V[1] = 0.15; V[2] = 0;
        sys.spawn({ kind: 1, pos: P, vel: V, size: size * (0.5 + Math.random()), life: life * (0.6 + Math.random() * 0.8), color, rot: Math.random() * 0.6 });
      }
    },
    /** One curly wind streak travelling along vel. opts: { vel [x, y, z], size, life, color, alpha } */
    gust(pos, { vel = [1.2, 0, 0], size = 1.6, life = 2.2, color = '#ffffff', alpha = 0.9 } = {}) {
      sys.spawn({ kind: 3, pos, vel, size, life, color, alpha, aspect: 1.8, rot: (Math.random() - 0.5) * 0.3 });
    },
    /** An expanding ring on the ground or water at pos, with a few spray dots. opts: { size, life, color, spray } */
    splash(pos, { size = 1.2, life = 0.9, color = '#ffffff', spray = 4 } = {}) {
      sys.spawn({ kind: 4, pos, size: size * 0.25, endSize: size, life, color });
      for (let i = 0; i < spray; i++) {
        const a = Math.random() * 6.283;
        V[0] = Math.cos(a) * 0.8; V[1] = 1.6 + Math.random() * 1.2; V[2] = Math.sin(a) * 0.8;
        sys.spawn({ kind: 5, pos, vel: V, size: 0.07 + Math.random() * 0.06, life: 0.6 + Math.random() * 0.3, color, gravity: 6 });
      }
    },
  };
  return sys;
}

const WHITE = [1, 1, 1], ZERO = [0, 0, 0], P = [0, 0, 0], V = [0, 0, 0];
export const SPRITE_FLOATS = FLOATS;
