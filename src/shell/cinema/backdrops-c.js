// Backdrop painters, third file (chapters 6 and 7). Part of the cinematic renderer: see ../cinema.js.
// Exports BACKDROPS_C: key -> { light, back(ctx, t, px, info), front?(ctx, t, px, info) }.
// Being painted: not yet imported by cinema.js.
import { TAU, lerp, mod, rnd, fillAll, rect, circ, poly, S, A, X0, XW } from './kit.js';
import {
  INK, PALETTE as C, light as keyLight, shade, tint, blend, alpha, ink, outline, taperPath, cel, bloom, shaft, glint, bands, rings, curl, gust,
  cloud, puff, waves,
} from '../style.js';

export const BACKDROPS_C = Object.create(null);
function def(key, light, back, front) { BACKDROPS_C[key] = { light, back, front: front || null }; }
