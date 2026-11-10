// Speech. Plays the pre-rendered line files through the audio graph, and when
// a line has no file, falls back to the browser's speechSynthesis, and when
// there is none of that either, to silence of the right length.
//
//   createVoice(audio, cast, manifest) -> { say(line, {blocking, onDone}), hush(), level(), speaking(),
//                                           preload(ids), cached(id) }
//
// preload(ids) fetches and decodes those lines ahead of time and resolves when
// they are all settled; say() starts a decoded line in the same task, with no
// fetch and no promise in between. say() also warms the lines that follow the
// one it was given (see ahead()), so a cutscene only ever waits for its first
// line even if nobody calls preload at all.
//
// manifest maps line id -> url. The file tools/render-voices.mjs writes,
// { lines: { id: { url, seconds, hash } } }, is accepted as it is.
//
// Rules:
//   - a blocking line interrupts whatever is speaking;
//   - a non-blocking line is dropped if anything is speaking;
//   - onDone fires exactly once per say(), with the reason as its argument:
//     'ended' | 'interrupted' | 'hushed' | 'dropped'.
//     Everything except 'ended' is delivered on the next task, so a caller that
//     dispatches from onDone is never re-entered from inside say() or hush().

const WPM_BASE = 175;          // the rate at which speechSynthesis rate === 1
const CACHE_SECONDS = 240;     // decoded speech kept: about 46 MB at 48 kHz mono
const AHEAD = 3;               // lines warmed after the one being spoken

export function estimateSeconds(line, member) {
  const words = line.text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(0.9, (words / member.rate) * 60 + 0.45);
}

export function createVoice(audio, cast, manifest) {
  if (!audio || !audio.ctx || !audio.voiceBus) throw new Error('createVoice: audio must provide ctx and voiceBus');
  if (!cast || typeof cast !== 'object') throw new Error('createVoice: cast is required');
  const ctx = audio.ctx;

  const table = manifest && typeof manifest.lines === 'object' && manifest.lines !== null ? manifest.lines : (manifest || {});
  function urlFor(id) {
    const e = table[id];
    if (e === undefined || e === null) return null;
    if (typeof e === 'string') return e;
    if (typeof e === 'object' && typeof e.url === 'string') return e.url;
    throw new Error(`voice: manifest entry for "${id}" has no url: ${JSON.stringify(e)}`);
  }

  // everything spoken goes voiceIn -> analyser -> audio.voiceBus
  const voiceIn = ctx.createGain();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.5;
  voiceIn.connect(analyser);
  analyser.connect(audio.voiceBus);
  const scope = new Float32Array(analyser.fftSize);

  // ───────────── radio (the Line) ─────────────
  let noiseBuf = null;
  function noiseBuffer() {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }
  let clipCurve = null;
  function clip() {
    if (!clipCurve) {
      clipCurve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        const x = (i / 1023) * 2 - 1;
        clipCurve[i] = Math.tanh(x * 3.2) * 0.8;
      }
    }
    return clipCurve;
  }

  // squelch: the carrier opening or closing
  function squelch(t, closing) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = closing ? 1500 : 2300;
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    const len = closing ? 0.09 : 0.05;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(bp); bp.connect(g); g.connect(voiceIn);
    src.start(t, Math.random() * 0.5);
    src.stop(t + len + 0.02);
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = closing ? 900 : 1250;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.linearRampToValueAtTime(0.05, t + 0.002);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
    o.connect(og); og.connect(voiceIn);
    o.start(t); o.stop(t + 0.04);
  }

  // Opens the channel: squelch in, static bed up. Returns the node speech should
  // be fed into (null when there is no signal path, as with speechSynthesis)
  // and close(), which may be called once.
  function openRadio(withInput) {
    const t = ctx.currentTime;
    squelch(t, false);
    const bed = ctx.createBufferSource();
    bed.buffer = noiseBuffer();
    bed.loop = true;
    const bedBp = ctx.createBiquadFilter();
    bedBp.type = 'bandpass';
    bedBp.frequency.value = 2600;
    bedBp.Q.value = 0.5;
    const bedGain = ctx.createGain();
    bedGain.gain.setValueAtTime(0, t);
    bedGain.gain.linearRampToValueAtTime(0.028, t + 0.04);
    bed.connect(bedBp); bedBp.connect(bedGain); bedGain.connect(voiceIn);
    bed.start(t);

    let input = null;
    let outGain = null;
    if (withInput) {
      input = ctx.createGain();
      input.gain.value = 2.2;                          // drive into the clipper
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 420; hp.Q.value = 0.7;
      const bp = ctx.createBiquadFilter();
      bp.type = 'peaking'; bp.frequency.value = 1700; bp.Q.value = 1.1; bp.gain.value = 7;
      const shaper = ctx.createWaveShaper();
      shaper.curve = clip();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 3100; lp.Q.value = 0.9;
      outGain = ctx.createGain();
      outGain.gain.value = 0.75;
      input.connect(hp); hp.connect(bp); bp.connect(shaper); shaper.connect(lp); lp.connect(outGain);
      outGain.connect(voiceIn);
    }
    let closed = false;
    return {
      input,
      close() {
        if (closed) return;
        closed = true;
        const now = ctx.currentTime;
        squelch(now, true);
        bedGain.gain.cancelScheduledValues(now);
        bedGain.gain.setValueAtTime(0.028, now);
        bedGain.gain.linearRampToValueAtTime(0, now + 0.1);
        bed.stop(now + 0.15);
        if (outGain) setTimeout(() => outGain.disconnect(), 400);
      },
    };
  }

  // ───────────── files ─────────────
  // Decoded audio is big: a 22 kHz file comes out of decodeAudioData at the
  // context's rate in float32, about 190 kB a second at 48 kHz, so the whole
  // script decoded would be gigabytes. The cache keeps the most recently used
  // CACHE_SECONDS of speech and lets the rest go; a line that was evicted is
  // fetched again from the browser's HTTP cache.
  const decoded = new Map();    // url -> AudioBuffer, oldest use first
  const loading = new Map();    // url -> Promise<AudioBuffer>, in flight only
  let held = 0;                 // seconds of audio in `decoded`

  function touch(url) {
    const buf = decoded.get(url);
    if (buf) { decoded.delete(url); decoded.set(url, buf); }
    return buf || null;
  }

  function keep(url, buf) {
    if (decoded.has(url)) return;
    decoded.set(url, buf);
    held += buf.duration;
    for (const [old, b] of decoded) {
      if (held <= CACHE_SECONDS || old === url) break;
      decoded.delete(old);
      held -= b.duration;
    }
  }

  function load(url) {
    const have = touch(url);
    if (have) return Promise.resolve(have);
    let p = loading.get(url);
    if (!p) {
      p = fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
          return r.arrayBuffer();
        })
        .then((bytes) => ctx.decodeAudioData(bytes))
        .then((buf) => { keep(url, buf); return buf; })
        .finally(() => loading.delete(url));
      loading.set(url, p);
    }
    return p;
  }

  // Resolves to { loaded, missing, failed }: ids decoded and in the cache, ids
  // with no file in the manifest (they will use speech synthesis), and ids
  // whose file could not be fetched or decoded. It does not reject for a bad
  // file: say() already falls back for that line, and warns when it does.
  function preload(ids) {
    if (!Array.isArray(ids)) throw new Error(`voice.preload: expected an array of line ids, got ${JSON.stringify(ids)}`);
    const out = { loaded: [], missing: [], failed: [] };
    const jobs = [];
    for (const id of new Set(ids)) {
      if (typeof id !== 'string') throw new Error(`voice.preload: line id ${JSON.stringify(id)} is not a string`);
      const url = urlFor(id);
      if (!url) { out.missing.push(id); continue; }
      jobs.push(load(url).then(() => { out.loaded.push(id); }, () => { out.failed.push(id); }));
    }
    return Promise.all(jobs).then(() => out);
  }

  function cached(id) {
    const url = urlFor(id);
    return url !== null && decoded.has(url);
  }

  // The lines likely to be asked for next. Line ids are 'ch1.s3.c04': the last
  // part counts up through a cutscene, and the manifest is written sorted, so
  // the entries that follow an id and share everything before its last dot are
  // the rest of that cutscene, in order. Barks ('ch1.bark.drain.2') share a
  // prefix only with their own alternatives, which costs a few small files.
  const order = Object.keys(table).sort();
  const place = new Map(order.map((id, i) => [id, i]));
  function ahead(id, n = AHEAD) {
    const at = place.get(id);
    if (at === undefined) return [];
    const stem = id.slice(0, id.lastIndexOf('.') + 1);
    const next = [];
    for (let i = at + 1; i < order.length && next.length < n; i++) {
      if (!order[i].startsWith(stem)) break;
      next.push(order[i]);
    }
    return next;
  }

  // ───────────── the one utterance ─────────────
  let current = null;           // { line, onDone, done, stop, timer, mode, t0 }

  function finish(u, reason) {
    if (u.done) return;
    u.done = true;
    clearTimeout(u.timer);
    if (u.stop) u.stop();
    if (current === u) {
      current = null;
      if (audio.duck) audio.duck(false);
    }
    if (!u.onDone) return;
    if (reason === 'ended') u.onDone(reason);
    else setTimeout(() => u.onDone(reason), 0);
  }

  function watchdog(u, seconds) {
    clearTimeout(u.timer);
    u.timer = setTimeout(() => finish(u, 'ended'), seconds * 1000);
  }

  function playBuffer(u, buf) {
    const radio = u.line.fx === 'radio' ? openRadio(true) : null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(radio ? radio.input : voiceIn);
    const lead = radio ? 0.07 : 0.01;
    u.mode = 'file';
    u.stop = () => {
      src.onended = null;
      try { src.stop(); } catch { /* never started */ }
      src.disconnect();
      if (radio) radio.close();
    };
    src.onended = () => finish(u, 'ended');
    src.start(ctx.currentTime + lead);
    watchdog(u, buf.duration + lead + 1);       // onended is reliable, but a suspended context is not
  }

  function fallback(u, member) {
    const est = estimateSeconds(u.line, member);
    const synth = globalThis.speechSynthesis;
    const Utter = globalThis.SpeechSynthesisUtterance;
    const live = ctx.state === 'running';
    const radio = u.line.fx === 'radio' && live ? openRadio(false) : null;
    const silent = () => {
      // nobody can speak it: hold the subtitle for a reading time
      u.mode = 'timer';
      u.stop = () => { if (radio) radio.close(); };
      watchdog(u, Math.max(0.3, est - (performance.now() - u.t0) / 1000));
    };
    if (!synth || !Utter) { silent(); return; }

    const utter = new Utter(u.line.text);
    const voices = synth.getVoices ? synth.getVoices() : [];
    for (const want of member.say) {
      const bare = want.replace(/\s*\(.*$/, '');
      const v = voices.find((x) => x.name === want) || voices.find((x) => x.name === bare || x.name.startsWith(bare + ' '));
      if (v) { utter.voice = v; break; }
    }
    utter.pitch = member.pitch;
    utter.rate = Math.max(0.5, Math.min(2, member.rate / WPM_BASE));
    utter.volume = audio.isMuted && audio.isMuted() ? 0 : 1;
    u.mode = 'synth';
    u.stop = () => {
      utter.onend = null;
      utter.onerror = null;
      synth.cancel();
      if (radio) radio.close();
    };
    utter.onend = () => finish(u, 'ended');
    // An utterance refused outright (no user gesture yet, no voices) errors at
    // once; ending the line there would flick a cutscene past unread.
    utter.onerror = () => { utter.onend = null; utter.onerror = null; if (!u.done) silent(); };
    synth.cancel();
    synth.speak(utter);
    watchdog(u, est * 2 + 3);                   // onend is known to go missing in some browsers
  }

  function say(line, { blocking = false, onDone } = {}) {
    if (!line || typeof line.id !== 'string' || typeof line.text !== 'string') {
      throw new Error(`voice.say: not a Line: ${JSON.stringify(line)}`);
    }
    const member = cast[line.who];
    if (!member) throw new Error(`voice.say: line "${line.id}" has unknown speaker "${line.who}"`);
    if (line.fx !== undefined && line.fx !== 'radio') throw new Error(`voice.say: line "${line.id}" has unknown fx "${line.fx}"`);
    if (onDone !== undefined && typeof onDone !== 'function') throw new Error(`voice.say: onDone for "${line.id}" is not a function`);

    if (current) {
      if (!blocking) {
        if (onDone) setTimeout(() => onDone('dropped'), 0);
        return false;
      }
      finish(current, 'interrupted');
    }

    const u = { line, onDone, done: false, stop: null, timer: null, mode: 'loading', t0: performance.now() };
    current = u;
    if (audio.duck) audio.duck(true);

    const url = urlFor(line.id);
    if (url && ctx.state === 'running') {
      const ready = touch(url);
      if (ready) {
        playBuffer(u, ready);                                 // already decoded: starts in this task
      } else {
        watchdog(u, estimateSeconds(line, member) * 2 + 6);   // covers a fetch that never settles
        load(url).then(
          (buf) => { if (!u.done) playBuffer(u, buf); },
          (err) => {
            console.warn(`voice: could not play ${url} for line "${line.id}" (${err && err.message}); using speech synthesis`);
            if (!u.done) fallback(u, member);
          },
        );
      }
    } else {
      fallback(u, member);
    }
    if (url) preload(ahead(line.id));                         // never rejects
    return true;
  }

  function hush() {
    if (current) finish(current, 'hushed');
  }

  // 0..1, for lip-sync
  function level() {
    if (!current) return 0;
    if (current.mode === 'file') {
      analyser.getFloatTimeDomainData(scope);
      let sum = 0;
      for (let i = 0; i < scope.length; i++) sum += scope[i] * scope[i];
      return Math.min(1, Math.sqrt(sum / scope.length) * 3.5);
    }
    if (current.mode === 'synth') {
      // speechSynthesis output cannot be tapped; move the mouth at syllable rate instead
      const t = (performance.now() - current.t0) / 1000;
      return 0.25 + 0.3 * Math.abs(Math.sin(t * 11)) * (0.6 + 0.4 * Math.sin(t * 2.3));
    }
    return 0;                   // loading, or silent timer: mouth shut
  }

  function speaking() {
    return current !== null;
  }

  return { say, hush, level, speaking, preload, cached };
}
