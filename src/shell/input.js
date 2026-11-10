// Keyboard and touch. Imperative shell.
//
//   createInput(canvas, { mode, onMsg, onMute }) -> { state(), release(), destroy() }
//
// state() is the Input the core's tick wants: which flippers are held and whether the
// plunger is being pulled. Everything that is a single press (confirm, skip, go to the
// table, go to the reels) is handed to onMsg as a ready-made Msg. mode() tells touch
// what the screen is showing, because a finger has no keys: outside play a tap means
// "go on"; in play the screen is the cabinet's buttons.
//
// Keys:   left flipper   ArrowLeft, Z, left Shift        right flipper  ArrowRight, /, right Shift
//         plunge         Space (hold, release)           confirm        Enter
//         to the table   P        to the reels   R       skip a scene   S        mute   M
//
// Touch, in play:   left half = left flipper, right half = right flipper,
//                   bottom-right corner = plunger (hold, release),
//                   top strip = confirm on its left three quarters, back to the reels on its right quarter.
// Touch, elsewhere: a tap is confirm; in the slot a tap on the table (the middle third) goes to play.

const HOLD = {
  ArrowLeft: 'left', KeyZ: 'left', ShiftLeft: 'left',
  ArrowRight: 'right', Slash: 'right', ShiftRight: 'right',
  Space: 'plunge',
};
const PRESS = {
  Enter: { type: 'confirm' }, NumpadEnter: { type: 'confirm' },
  KeyP: { type: 'toTable' }, KeyR: { type: 'toSlot' }, KeyS: { type: 'skip' },
};

export function createInput(canvas, { mode, onMsg, onMute }) {
  if (typeof mode !== 'function' || typeof onMsg !== 'function' || typeof onMute !== 'function') {
    throw new Error('createInput: mode, onMsg and onMute must be functions');
  }
  const win = canvas.ownerDocument.defaultView;
  const keys = new Set();          // key codes held
  const touches = new Map();       // pointer id -> 'left' | 'right' | 'plunge'

  const held = (what) => {
    for (const code of keys) if (HOLD[code] === what) return true;
    for (const zone of touches.values()) if (zone === what) return true;
    return false;
  };

  function onKeyDown(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (HOLD[e.code]) { keys.add(e.code); e.preventDefault(); return; }
    if (e.repeat) { if (PRESS[e.code]) e.preventDefault(); return; }
    if (PRESS[e.code]) { e.preventDefault(); onMsg(PRESS[e.code]); return; }
    if (e.code === 'KeyM') { e.preventDefault(); onMute(); }
  }
  function onKeyUp(e) {
    if (keys.delete(e.code)) e.preventDefault();
  }

  // where on the canvas, 0..1 each way
  function at(e) {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  }

  function onPointerDown(e) {
    const [x, y] = at(e);
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    e.preventDefault();
    const m = mode();
    if (m !== 'play') {
      onMsg(m === 'slot' && x > 1 / 3 && x < 2 / 3 ? { type: 'toTable' } : { type: 'confirm' });
      return;
    }
    if (e.pointerType === 'mouse') return;      // in play a mouse has a keyboard beside it
    if (y < 0.12) { onMsg(x > 0.75 ? { type: 'toSlot' } : { type: 'confirm' }); return; }
    const zone = x > 0.78 && y > 0.72 ? 'plunge' : x < 0.5 ? 'left' : 'right';
    touches.set(e.pointerId, zone);
    if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ } }
  }
  function onPointerUp(e) {
    touches.delete(e.pointerId);
  }
  function release() {
    keys.clear();
    touches.clear();
  }
  const noMenu = (e) => e.preventDefault();

  win.addEventListener('keydown', onKeyDown);
  win.addEventListener('keyup', onKeyUp);
  win.addEventListener('blur', release);        // a key released in another window never sends keyup
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('contextmenu', noMenu);

  return {
    /** @returns {import('../core/types.js').Input} */
    state: () => ({ left: held('left'), right: held('right'), plunge: held('plunge'), nudge: null }),
    release,
    destroy() {
      win.removeEventListener('keydown', onKeyDown);
      win.removeEventListener('keyup', onKeyUp);
      win.removeEventListener('blur', release);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('contextmenu', noMenu);
    },
  };
}
