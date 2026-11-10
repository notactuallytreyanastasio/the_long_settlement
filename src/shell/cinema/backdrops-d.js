// Backdrop painters, fourth part (chapter 8, Cresset, and the two endings). Part of the cinematic renderer: see ../cinema.js.
// Exports BACKDROPS_D: key -> { light, back(ctx, t, px, info), front?(ctx, t, px, info) }.
// Still and moving sections are marked with ctx = S(depth) and ctx = A(): the contract is written out in kit.js.
// (Being painted: keys arrive one by one. Not imported by the game until the integrator wires it.)
import { TAU, lerp, mod, rnd, fillAll, rect, circ, poly, S, A, X0, XW } from './kit.js';
import {
  INK, PALETTE as C, light as keyLight, shade, tint, blend, alpha, ink, outline, taperPath, cel, bloom, shaft, glint, bands, rings, curl, gust,
  cloud, puff, waves,
} from '../style.js';

export const BACKDROPS_D = Object.create(null);
function def(key, light, back, front) { BACKDROPS_D[key] = { light, back, front: front || null }; }
