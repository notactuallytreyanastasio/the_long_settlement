// Keyboard and touch. Imperative shell.
//
//   createInput(canvas, { mode, layout, onMsg, onMute }) -> { state(), release(), touched(), destroy() }
//
// state() is the Input the core's tick wants: which flippers are held and whether the
// launch button (plunger and lever in one) is down. Everything that is a single press
// (confirm, skip) is handed to onMsg as a ready-made Msg. mode() tells touch what the
// screen is showing and layout() where the on-screen buttons are, in logical pixels
// (see layout.js); a pointer is brought into that space with toLogical.
//
// layout() is whichever layout is being drawn: computeLayout's under the 2D renderer, computeGlLayout's under
// the 3D one. Both carry launch, mute, skip and cine.mute, which is all this file reads, so nothing here knows
// which renderer is up. `canvas` is #stage in both cases: under the 3D renderer it is the HUD, on top of #gl.
//
// Keys:   left flipper   ArrowLeft, Z, left Shift        right flipper  ArrowRight, /, right Shift
//         launch/lever   Space (hold, release)           confirm        Enter
//         skip a scene   S                               mute           M
//
// Touch, any mode:     the mute button mutes. Outside a cinematic it is layout.mute; in one it is layout.cine.mute,
//                       beside the skip button (layout.mute lies under the skip button there).
// Touch, in play:       the launch button is the plunger and the lever (hold, release) and never flips;
//                       any other touch holds the left flipper on the left half of the SCREEN and the
//                       right flipper on the right half. The letterbox beside the canvas counts, so a
//                       thumb resting off the edge of the table still flips. Any number of fingers.
// Touch, in a cinematic: the mute button mutes, the skip button skips; a tap anywhere else is the next line.
// Touch, title/card/end: a tap confirms.
// Lanewar (mode 'fray'): in a wave the only control is a stick. A finger (or the mouse) down anywhere is its
//                       centre and the drag from there is the push; WASD and the arrows do the same. state().move
//                       is that push, [x, y] each -1..1. At the reels fray-view.js says what a tap or a key means.
//                       `fray()` gives the run being played and the notch, for the layout.
//
// A zone belongs to the finger that started in it until that finger lifts: sliding across the
// middle does not swap flippers, and sliding off the launch button does not fire it early.

import { toLogical } from './layout.js';
import { frayLayout, frayPress, frayKey, frayStick, STICK_R } from './fray-view.js';

const HOLD = {
  ArrowLeft: 'left', KeyZ: 'left', ShiftLeft: 'left',
  ArrowRight: 'right', Slash: 'right', ShiftRight: 'right',
  Space: 'plunge',
};
/** In Lanewar: which way each key pushes the stick. */
const MOVE_KEYS = {
  ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
};
const PRESS = {
  Enter: { type: 'confirm' }, NumpadEnter: { type: 'confirm' },
  KeyS: { type: 'skip' },
};

const STILL = Object.freeze([0, 0]);
const BUTTON_SLOP = 1.3;        // a thumb is wider than the drawn button: hit radius = r * this
const MIN_BUTTON_R = 26;        // logical px; never ask for a smaller target than this
const TAP_GUARD_MS = 350;       // a flipper press that lands just as a cinematic opens is not "next line"

export function createInput(canvas, { mode, layout, onMsg, onMute, fray = () => null }) {
  if (typeof mode !== 'function' || typeof layout !== 'function' || typeof onMsg !== 'function' || typeof onMute !== 'function') {
    throw new Error('createInput: mode, layout, onMsg and onMute must be functions');
  }
  const doc = canvas.ownerDocument;
  const win = doc.defaultView;
  const keys = new Set();          // key codes held
  const touches = new Map();       // pointer id -> 'left' | 'right' | 'plunge'
  let sawTouch = false;
  let lastMode = mode();
  let leftPlayAt = -Infinity;      // performance.now() when play last gave way to another mode
  const frayDown = new Map();      // pointer id -> [x, y] where a finger went down on the Lanewar board
  let stickId = null;              // the pointer that is the Lanewar stick
  const PHASE_GUARD_MS = 350;      // the reels ignore a press this soon after they come up: the thumb is still steering
  let frayPhase = null, frayPhaseAt = 0;   // the run's phase and when it was first seen: a draft ignores the swipes that ended the wave

  function watchFray() {
    const f = fray();
    const phase = f && f.run ? f.run.phase : null;
    if (phase !== frayPhase) { frayPhase = phase; frayPhaseAt = win.performance.now(); }
    return f;
  }

  const held = (what) => {
    for (const code of keys) if (HOLD[code] === what) return true;
    for (const zone of touches.values()) if (zone === what) return true;
    return false;
  };

  function watchMode() {
    const m = mode();
    if (m !== lastMode) {
      if (lastMode === 'play') leftPlayAt = win.performance.now();
      lastMode = m;
    }
    return m;
  }

  function onKeyDown(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (watchMode() === 'fray') {
      if (e.code === 'KeyM') { e.preventDefault(); if (!e.repeat) onMute(); return; }
      if (MOVE_KEYS[e.code]) { keys.add(e.code); e.preventDefault(); }
      const f = watchFray();
      const msg = f && !e.repeat ? frayKey(f.run, e.code) : null;
      if (msg) { e.preventDefault(); onMsg(msg); }
      return;
    }
    if (HOLD[e.code]) { keys.add(e.code); e.preventDefault(); return; }
    if (e.repeat) { if (PRESS[e.code]) e.preventDefault(); return; }
    if (PRESS[e.code]) { e.preventDefault(); onMsg(PRESS[e.code]); return; }
    if (e.code === 'KeyM') { e.preventDefault(); onMute(); }
  }
  function onKeyUp(e) {
    if (keys.delete(e.code)) e.preventDefault();
  }

  const inCircle = (c, x, y) => {
    const r = Math.max(MIN_BUTTON_R, c.r * BUTTON_SLOP);
    return (x - c.x) * (x - c.x) + (y - c.y) * (y - c.y) <= r * r;
  };
  const inRect = (b, x, y, pad = 8) => x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad;

  function onPointerDown(e) {
    // The gate, the fatal panel: anything that is not the page behind them keeps its own clicks.
    if (e.target !== canvas && e.target !== doc.body && e.target !== doc.documentElement) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const touch = e.pointerType !== 'mouse';
    if (touch) sawTouch = true;
    e.preventDefault();
    const L = layout();
    const [x, y] = toLogical(L, canvas.getBoundingClientRect(), e.clientX, e.clientY);
    const m = watchMode();

    if (m === 'fray') {
      const f = watchFray();
      frayDown.set(e.pointerId, [x, y, win.performance.now()]);
      if (f && f.run && f.run.phase === 'wave' && stickId === null) { stickId = e.pointerId; frayStick.on = true; frayStick.ox = frayStick.x = x; frayStick.oy = frayStick.y = y; }
      return;
    }
    if (m !== 'cine' && inCircle(L.mute, x, y)) { onMute(); return; }

    if (m === 'play') {
      if (inCircle(L.launch, x, y)) { touches.set(e.pointerId, 'plunge'); return; }
      if (!touch) return;                         // in play a mouse has a keyboard beside it
      touches.set(e.pointerId, e.clientX < win.innerWidth / 2 ? 'left' : 'right');
      return;
    }
    if (m === 'cine') {
      if (L.cine && L.cine.mute && inCircle(L.cine.mute, x, y)) { onMute(); return; }
      if (inRect(L.skip, x, y)) { onMsg({ type: 'skip' }); return; }
      if (win.performance.now() - leftPlayAt < TAP_GUARD_MS) return;
      onMsg({ type: 'confirm' });
      return;
    }
    if (m === 'title' || m === 'card' || m === 'end') { onMsg({ type: 'confirm' }); return; }
    throw new Error(`input: a pointer went down in a mode this shell does not know: ${JSON.stringify(m)}`);
  }
  function onPointerMove(e) {
    if (e.pointerId !== stickId) return;
    const [x, y] = toLogical(layout(), canvas.getBoundingClientRect(), e.clientX, e.clientY);
    frayStick.x = x; frayStick.y = y;
  }
  function onPointerUp(e) {
    touches.delete(e.pointerId);
    if (e.pointerId === stickId) { stickId = null; frayStick.on = false; }
    const down = frayDown.get(e.pointerId);
    if (!down) return;
    frayDown.delete(e.pointerId);
    if (e.type !== 'pointerup' || watchMode() !== 'fray') return;
    const f = watchFray();
    // a finger that went down before the reels came up was steering, not pressing
    if (!f || !f.run || f.run.phase === 'wave' || down[2] < frayPhaseAt + PHASE_GUARD_MS) return;
    const L = layout();
    const up = toLogical(L, canvas.getBoundingClientRect(), e.clientX, e.clientY);
    const msg = frayPress(frayLayout(L, f.safeTop), f.run, down, up);
    if (msg) onMsg(msg);
  }
  /** The stick: the thumb's drag, or the keys. */
  const MOVE = [0, 0];
  function frayMove() {
    let x = 0, y = 0;
    if (frayStick.on) { x = (frayStick.x - frayStick.ox) / STICK_R; y = (frayStick.y - frayStick.oy) / STICK_R; }
    else for (const code of keys) { const v = MOVE_KEYS[code]; if (v) { x += v[0]; y += v[1]; } }
    const l = Math.sqrt(x * x + y * y);
    if (l > 1) { x /= l; y /= l; }
    MOVE[0] = l < 0.12 ? 0 : x; MOVE[1] = l < 0.12 ? 0 : y;
    return MOVE;
  }
  function release() {
    keys.clear();
    touches.clear();
    frayDown.clear();
    stickId = null; frayStick.on = false;
  }
  const stop = (e) => e.preventDefault();
  // iOS: a second finger must not become a pinch, a drag must not scroll or rubber-band the page.
  const stopOnPage = (e) => { if (e.target === canvas || e.target === doc.body || e.target === doc.documentElement) e.preventDefault(); };

  win.addEventListener('keydown', onKeyDown);
  win.addEventListener('keyup', onKeyUp);
  win.addEventListener('blur', release);        // a key released in another window never sends keyup
  win.addEventListener('pointerdown', onPointerDown);
  win.addEventListener('pointermove', onPointerMove);
  win.addEventListener('pointerup', onPointerUp);
  win.addEventListener('pointercancel', onPointerUp);
  doc.addEventListener('touchmove', stopOnPage, { passive: false });
  doc.addEventListener('gesturestart', stop);   // Safari's own pinch event
  doc.addEventListener('dblclick', stop);
  canvas.addEventListener('contextmenu', stop);

  return {
    /** @returns {import('../core/types.js').Input} */
    state() {
      watchMode();
      const f = watchFray();
      // the stick is let go when the wave ends under it
      if (stickId !== null && !(f && f.run && f.run.phase === 'wave')) { stickId = null; frayStick.on = false; }
      return { left: held('left'), right: held('right'), plunge: held('plunge'), nudge: null, move: lastMode === 'fray' ? frayMove() : STILL };
    },
    release,
    /** true once a finger (not a mouse) has been seen: the renderer may then show the touch controls */
    touched: () => sawTouch,
    destroy() {
      win.removeEventListener('keydown', onKeyDown);
      win.removeEventListener('keyup', onKeyUp);
      win.removeEventListener('blur', release);
      win.removeEventListener('pointerdown', onPointerDown);
      win.removeEventListener('pointermove', onPointerMove);
      win.removeEventListener('pointerup', onPointerUp);
      win.removeEventListener('pointercancel', onPointerUp);
      doc.removeEventListener('touchmove', stopOnPage);
      doc.removeEventListener('gesturestart', stop);
      doc.removeEventListener('dblclick', stop);
      canvas.removeEventListener('contextmenu', stop);
    },
  };
}
