/* Feudo a Feudo — sonido sintetizado: efectos y música generativa de inspiración medieval */
(function (FF) {
  'use strict';
  const U = FF.U;

  const Au = FF.Audio = {
    ctx: null, ok: false, musicVol: 0.5, sfxVol: 0.7,
    last: {}, track: null, plucks: new Map()
  };

  Au.init = function () {
    Au._gestured = true;
    if (Au.ctx) {
      if (Au.ctx.state === 'suspended') Au.ctx.resume().catch(() => {});
      if (Au.pendingTrack) { const t = Au.pendingTrack; Au.pendingTrack = null; Au.playMusic(t[0], t[1], t[2]); }
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = Au.ctx = new AC();
      Au.comp = ctx.createDynamicsCompressor();
      Au.comp.threshold.value = -16; Au.comp.ratio.value = 4;
      Au.master = ctx.createGain(); Au.master.gain.value = 0.9;
      Au.master.connect(Au.comp); Au.comp.connect(ctx.destination);
      Au.musicG = ctx.createGain(); Au.musicG.gain.value = Au.musicVol * 0.55; Au.musicG.connect(Au.master);
      Au.sfxG = ctx.createGain(); Au.sfxG.gain.value = Au.sfxVol; Au.sfxG.connect(Au.master);
      /* reverberación sencilla para la música */
      Au.rev = ctx.createConvolver();
      Au.rev.buffer = impulse(ctx, 2.2, 2.5);
      Au.revG = ctx.createGain(); Au.revG.gain.value = 0.28;
      Au.rev.connect(Au.revG); Au.revG.connect(Au.musicG);
      const len = ctx.sampleRate * 1.5;
      Au.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = Au.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      Au.ok = true;
    } catch (e) { Au.ok = false; }
    if (Au.ok && Au.battle) Au.battle.load();
    Au.unlockMedia();
    if (Au.pendingTrack) { const t = Au.pendingTrack; Au.pendingTrack = null; Au.playMusic(t[0], t[1], t[2]); }
  };

  function impulse(ctx, secs, decay) {
    const len = Math.floor(ctx.sampleRate * secs);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  Au.setVolumes = function (m, s) {
    Au.musicVol = m; Au.sfxVol = s;
    fileVolume();
    if (!Au.ok) return;
    Au.musicG.gain.setTargetAtTime(m * 0.55, Au.ctx.currentTime, 0.1);
    Au.sfxG.gain.setTargetAtTime(s, Au.ctx.currentTime, 0.05);
  };

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  /* ---------- primitivas ---------- */
  function env(g, t0, a, peak, dur, rel) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    g.gain.setValueAtTime(Math.max(0.0002, peak), t0 + Math.max(a, dur - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }
  function tone(o) {
    const c = Au.ctx, t0 = o.t || c.currentTime;
    const osc = c.createOscillator(); osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t0 + (o.glide || o.dur));
    if (o.detune) osc.detune.value = o.detune;
    const g = c.createGain();
    env(g, t0, o.a || 0.005, o.g || 0.2, o.dur, o.rel || o.dur * 0.6);
    let node = osc;
    if (o.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; node.connect(f); node = f; }
    node.connect(g); g.connect(o.dest || Au.sfxG);
    if (o.vib) {
      const l = c.createOscillator(), lg = c.createGain();
      l.frequency.value = o.vib[0]; lg.gain.setValueAtTime(0, t0); lg.gain.linearRampToValueAtTime(o.vib[1], t0 + 0.25);
      l.connect(lg); lg.connect(osc.frequency); l.start(t0); l.stop(t0 + o.dur + 0.05);
    }
    osc.start(t0); osc.stop(t0 + o.dur + 0.05);
  }
  function noise(o) {
    const c = Au.ctx, t0 = o.t || c.currentTime;
    const src = c.createBufferSource(); src.buffer = Au.noiseBuf;
    src.playbackRate.value = o.rate || 1;
    const f = c.createBiquadFilter(); f.type = o.ft || 'bandpass';
    f.frequency.setValueAtTime(o.f || 1000, t0);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t0 + o.dur);
    f.Q.value = o.q || 1;
    const g = c.createGain();
    env(g, t0, o.a || 0.003, o.g || 0.2, o.dur, o.rel || o.dur * 0.7);
    src.connect(f); f.connect(g); g.connect(o.dest || Au.sfxG);
    src.start(t0, Math.random() * 0.5); src.stop(t0 + o.dur + 0.05);
  }
  function pluckBuf(midi) {
    let b = Au.plucks.get(midi);
    if (b) return b;
    const c = Au.ctx, sr = c.sampleRate, f = mtof(midi);
    const len = Math.floor(sr * 1.6), N = Math.max(2, Math.round(sr / f));
    b = c.createBuffer(1, len, sr);
    const d = b.getChannelData(0);
    let prev = 0;
    for (let i = 0; i < N; i++) { const r = Math.random() * 2 - 1; prev = prev * 0.5 + r * 0.5; d[i] = prev; }
    const decay = 0.996 - Math.min(0.012, f / 120000);
    for (let i = N; i < len; i++) d[i] = decay * 0.5 * (d[i - N] + d[i - N - 1 < 0 ? 0 : i - N - 1]);
    Au.plucks.set(midi, b);
    return b;
  }
  function pluck(midi, t, gain, dest, pan) {
    const c = Au.ctx;
    const src = c.createBufferSource(); src.buffer = pluckBuf(midi);
    const g = c.createGain(); g.gain.value = gain;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3200;
    src.connect(f); f.connect(g);
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(dest); } else g.connect(dest);
    src.start(t); src.stop(t + 1.6);
  }

  /* ---------- efectos ---------- */
  const SFX = {
    click() { noise({ f: 2200, q: 3, g: 0.12, dur: 0.035 }); tone({ f: 880, f2: 620, g: 0.06, dur: 0.05 }); },
    hover() { tone({ f: 1320, g: 0.02, dur: 0.03 }); },
    select() { pluck(76, Au.ctx.currentTime, 0.35, Au.sfxG); },
    send() {
      const t = Au.ctx.currentTime;
      tone({ type: 'sawtooth', f: 196, f2: 294, glide: 0.08, g: 0.07, dur: 0.18, lp: 1400, t });
      tone({ type: 'sawtooth', f: 294, g: 0.05, dur: 0.16, lp: 1600, t: t + 0.07 });
      noise({ ft: 'lowpass', f: 300, g: 0.18, dur: 0.08, t });
    },
    capture() {
      const t = Au.ctx.currentTime;
      [72, 76, 79, 84].forEach((m, i) => tone({ type: 'triangle', f: mtof(m), g: 0.12, dur: 0.22, t: t + i * 0.07, lp: 4000 }));
      [72, 76, 79, 84].forEach((m, i) => tone({ type: 'square', f: mtof(m), g: 0.025, dur: 0.18, t: t + i * 0.07, lp: 2500 }));
      noise({ ft: 'highpass', f: 6000, g: 0.05, dur: 0.4, t: t + 0.2 });
    },
    lost() {
      const t = Au.ctx.currentTime;
      [64, 60, 57].forEach((m, i) => tone({ type: 'triangle', f: mtof(m), g: 0.11, dur: 0.32, t: t + i * 0.12, lp: 1800 }));
    },
    neutralTaken() { tone({ f: 140, f2: 90, g: 0.12, dur: 0.15 }); },
    upgrade() {
      const t = Au.ctx.currentTime;
      tone({ f: 523, f2: 1046, glide: 0.25, g: 0.1, dur: 0.35, t });
      tone({ type: 'triangle', f: 784, f2: 1568, glide: 0.25, g: 0.05, dur: 0.35, t: t + 0.05 });
      noise({ ft: 'highpass', f: 7000, g: 0.04, dur: 0.35, t: t + 0.1 });
    },
    arrow() { noise({ f: 3200, f2: 1100, q: 2, g: 0.05, dur: 0.12 }); },
    impact() { tone({ f: 130, f2: 60, g: 0.1, dur: 0.08 }); noise({ ft: 'lowpass', f: 600, g: 0.06, dur: 0.06 }); },
    clash() {
      const t = Au.ctx.currentTime, f = 1800 + Math.random() * 900;
      tone({ type: 'triangle', f, g: 0.05, dur: 0.09, t }); tone({ type: 'triangle', f: f * 1.48, g: 0.03, dur: 0.07, t });
      noise({ ft: 'highpass', f: 5000, g: 0.05, dur: 0.04, t });
    },
    die() { noise({ ft: 'lowpass', f: 900, f2: 300, g: 0.06, dur: 0.1 }); },
    ding() { tone({ type: 'triangle', f: 2600, g: 0.04, dur: 0.06 }); },
    rayo() {
      const t = Au.ctx.currentTime;
      noise({ ft: 'highpass', f: 2500, g: 0.4, dur: 0.12, t });
      noise({ ft: 'lowpass', f: 900, f2: 120, g: 0.55, dur: 1.6, rel: 1.3, t: t + 0.03, rate: 0.6 });
      tone({ f: 70, f2: 40, g: 0.3, dur: 0.9, t });
    },
    escudo() {
      const t = Au.ctx.currentTime;
      [72, 76, 79, 83].forEach((m, i) => tone({ f: mtof(m), g: 0.06, dur: 1.1, a: 0.1, t: t + i * 0.04, vib: [6, 4] }));
    },
    sopor() {
      const t = Au.ctx.currentTime;
      tone({ f: 700, f2: 180, glide: 1, g: 0.1, dur: 1.1, t, vib: [7, 30] });
      tone({ type: 'triangle', f: 520, f2: 140, glide: 1, g: 0.05, dur: 1.1, t: t + 0.08 });
    },
    ventisca() {
      const t = Au.ctx.currentTime;
      noise({ f: 600, f2: 2400, q: 1.5, g: 0.3, dur: 1.4, a: 0.2, t, rate: 0.7 });
      [88, 91, 95, 100].forEach((m, i) => tone({ type: 'triangle', f: mtof(m), g: 0.035, dur: 0.5, t: t + 0.2 + i * 0.09 }));
    },
    meteoroCae() { tone({ f: 1400, f2: 260, glide: 0.75, g: 0.08, dur: 0.78, vib: [12, 15] }); noise({ f: 800, f2: 300, g: 0.12, dur: 0.75, a: 0.3 }); },
    meteoroGolpe() {
      const t = Au.ctx.currentTime;
      noise({ ft: 'lowpass', f: 1200, f2: 80, g: 0.7, dur: 1.6, rel: 1.3, t, rate: 0.5 });
      tone({ f: 80, f2: 30, g: 0.5, dur: 1.0, t });
    },
    victory() {
      const t = Au.ctx.currentTime;
      const mel = [[67, 0, 0.18], [72, 0.18, 0.18], [76, 0.36, 0.18], [79, 0.54, 0.5], [76, 1.04, 0.18], [79, 1.22, 0.9]];
      mel.forEach((n) => { tone({ type: 'triangle', f: mtof(n[0]), g: 0.14, dur: n[2], t: t + n[1], lp: 4000 }); tone({ type: 'square', f: mtof(n[0] - 12), g: 0.025, dur: n[2], t: t + n[1], lp: 1800 }); });
      [48, 55, 60, 64].forEach((m) => pluck(m, t + 1.22, 0.3, Au.sfxG));
    },
    defeat() {
      const t = Au.ctx.currentTime;
      [[69, 0, 0.35], [67, 0.35, 0.35], [64, 0.7, 0.35], [62, 1.05, 0.35], [57, 1.4, 1.2]].forEach((n) => tone({ type: 'triangle', f: mtof(n[0]), g: 0.12, dur: n[2], t: t + n[1], lp: 2200, vib: [5, 3] }));
    },
    denied() { tone({ type: 'square', f: 160, f2: 120, g: 0.05, dur: 0.14, lp: 900 }); },
    achievement() {
      const t = Au.ctx.currentTime;
      [79, 83, 86, 91].forEach((m, i) => tone({ type: 'triangle', f: mtof(m), g: 0.08, dur: 0.4, t: t + i * 0.08 }));
    },
    gong() {
      const t = Au.ctx.currentTime;
      [1, 2.4, 3.9, 5.2].forEach((r, i) => tone({ f: 98 * r, g: 0.12 / (i + 1), dur: 2.4, a: 0.01, rel: 2.2, t }));
    }
  };
  const THROTTLE = { arrow: 0.07, impact: 0.06, clash: 0.08, die: 0.05, ding: 0.06, send: 0.06, hover: 0.05, neutralTaken: 0.1 };

  Au.play = function (name) {
    if (!Au.ok || Au.sfxVol <= 0.001) return;
    const now = Au.ctx.currentTime;
    const th = THROTTLE[name] || 0.02;
    if (Au.last[name] && now - Au.last[name] < th) return;
    Au.last[name] = now;
    try { SFX[name] && SFX[name](); } catch (e) { /* ignorar */ }
  };

  /* ======================================================================
     MÚSICA
     Si hay pistas reales en FF.MUSIC (carpeta music/), se reproducen con fundidos.
     Si no, suena la música generada por código, distinta en cada mundo y nivel.
     ====================================================================== */
  const SLOT_OF = { menu: 'menu', map: 'map', valle: 'valle', islas: 'islas', desierto: 'desierto', hielo: 'hielo', volcan: 'volcan' };
  const failed = {};
  const blobURL = {};

  function slotTracks(slot) {
    const M = FF.MUSIC;
    if (!M || !M.slots || !M.slots[slot]) return [];
    return M.slots[slot].filter((id) => M.tracks[id] && !failed[id]);
  }
  function trackURL(id) {
    const D = FF.MUSIC_DATA;
    const tr = FF.MUSIC.tracks[id];
    if (D && D[id]) {
      if (!blobURL[id]) {
        try {
          const item = typeof D[id] === 'string' ? { b64: D[id], mime: 'audio/mpeg' } : D[id];
          const bin = atob(item.b64);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          blobURL[id] = URL.createObjectURL(new Blob([bytes], { type: item.mime || 'audio/mpeg' }));
          D[id] = null;
        } catch (e) { return tr.file; }
      }
      return blobURL[id];
    }
    return tr._useAlt && tr.alt ? tr.alt : tr.file;
  }
  /* si el archivo no existe, prueba la otra extensión (p. ej. 7.ogg) antes de rendirse */
  function tryAlt(id) {
    const tr = FF.MUSIC.tracks[id];
    if (tr.alt && !tr._useAlt && !blobURL[id]) { tr._useAlt = true; return true; }
    return false;
  }

  /* --- reproductor de archivos (dos elementos de audio para fundir) --- */
  const media = [];
  Au._media = media;
  function mediaEl(i) {
    if (!media[i]) {
      const a = new Audio();
      a.preload = 'auto';
      a.setAttribute('playsinline', '');
      a._fade = null;
      media[i] = a;
    }
    return media[i];
  }
  const SILENT = (function () {
    const n = 400, b = new Uint8Array(44 + n);
    const w = (o, str) => { for (let i = 0; i < str.length; i++) b[o + i] = str.charCodeAt(i); };
    const u32 = (o, v) => { b[o] = v & 255; b[o + 1] = (v >> 8) & 255; b[o + 2] = (v >> 16) & 255; b[o + 3] = (v >> 24) & 255; };
    w(0, 'RIFF'); u32(4, 36 + n); w(8, 'WAVEfmt '); u32(16, 16); b[20] = 1; b[22] = 1; u32(24, 8000); u32(28, 8000); b[32] = 1; b[34] = 8;
    w(36, 'data'); u32(40, n); for (let i = 0; i < n; i++) b[44 + i] = 128;
    let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return 'data:audio/wav;base64,' + btoa(s);
  })();
  Au.unlockMedia = function () {
    for (let i = 0; i < 3; i++) {
      const a = mediaEl(i);
      if (a._blessed || a._busy) continue;
      a._blessed = true;
      a.muted = true; a.loop = false; a.src = SILENT;
      const pr = a.play();
      const done = () => { if (a.src === SILENT) { a.pause(); } a.muted = false; };
      if (pr && pr.then) pr.then(done, done); else done();
    }
  };
  function fade(a, to, dur, after) {
    a._fade = { from: a.volume, to: Math.max(0, Math.min(1, to)), t: 0, dur: Math.max(0.01, dur), after };
    if (!Au._fadeTimer) Au._fadeTimer = setInterval(fadeTick, 40);
  }
  function fadeTick() {
    let any = false;
    media.forEach((a) => {
      if (!a || !a._fade) return;
      const f = a._fade;
      f.t += 0.04;
      const k = Math.min(1, f.t / f.dur);
      try { a.volume = f.from + (f.to - f.from) * k; } catch (e) { /* iOS: volumen de sólo lectura */ }
      if (k >= 1) { a._fade = null; if (f.after) f.after(); } else any = true;
    });
    if (!any) { clearInterval(Au._fadeTimer); Au._fadeTimer = null; }
  }
  /* volumen de una pista: curva perceptiva del control (50 % ≈ −12 dB) por su igualación (gain) */
  function fileLevel(gain) {
    const m = Au.musicVol;
    return Math.max(0, Math.min(1, m * m * (gain || 1)));
  }
  function fileVolume() {
    const T = Au.track;
    if (!T || !T.file) return;
    const a = T.el;
    if (Au.musicVol <= 0.001) { a.pause(); return; }
    if (!a._fade) { try { a.volume = fileLevel(T.gain); } catch (e) { /* */ } }
    if (a.paused && !document.hidden) { const pr = a.play(); if (pr && pr.catch) pr.catch(() => {}); }
  }
  function stopFiles(dur) {
    media.forEach((a, i) => {
      if (!a || i === 2) return;
      if (!a.paused) fade(a, 0, dur, () => { a.pause(); });
      a._busy = false;
    });
  }
  /* list: pistas del hueco. Con varias, al acabar una empieza la siguiente; con una, se repite.
     next: es la continuación de la anterior (empieza sin fundido, como un disco) */
  function playFile(id, tag, key, variant, opts, list, next) {
    const tr = FF.MUSIC.tracks[id];
    synthStop();
    const curIdx = Au.track && Au.track.file ? Au.track.idx : 1;
    const idx = curIdx === 0 ? 1 : 0;
    const a = mediaEl(idx), old = mediaEl(1 - idx);
    if (!old.paused) fade(old, 0, 1.1, () => old.pause());
    old._busy = false;
    old.onended = null;
    a._busy = true;
    a.onerror = null;
    const rotate = !!(list && list.length > 1 && tr.loop !== false);
    a.loop = !rotate && tr.loop !== false;
    a.onended = rotate ? () => {
      if (!(Au.track && Au.track.el === a && Au.track.id === id)) return;
      const l = list.filter((x) => !failed[x]);
      if (!l.length) return;
      playFile(l[(l.indexOf(id) + 1) % l.length], tag, key, variant, opts, l, true);
    } : null;
    a.muted = false;
    a.src = trackURL(id);
    const gain = tr.gain || 1;
    try { a.volume = next ? fileLevel(gain) : 0; } catch (e) { /* */ }
    Au.track = { key: tag, file: true, el: a, idx, gain, id };
    a.onerror = () => {
      if (!(Au.track && Au.track.id === id)) return;
      if (tryAlt(id)) { a.src = trackURL(id); const p2 = a.play(); if (p2 && p2.catch) p2.catch(() => {}); return; }
      failed[id] = true;
      Au.track = null; Au.playMusic(key, variant, opts);
    };
    if (Au.musicVol > 0.001) {
      const pr = a.play();
      if (pr && pr.catch) pr.catch((err) => {
        if (!Au.track || Au.track.id !== id) return;
        if (err && err.name === 'NotAllowedError') { Au.track = null; Au.pendingTrack = [key, variant, opts]; return; }
        /* los errores de carga los gestiona onerror (incluida la extensión alternativa) */
      });
    }
    if (!next) fade(a, fileLevel(gain), 1.4);
  }

  /* la melodía de victoria o derrota se apaga en cuanto empieza otra música (nivel siguiente, mapa…) */
  function stopJingle(dur) {
    const a = media[2];
    if (a && !a.paused) fade(a, 0, dur, () => { a.pause(); });
  }

  /* --- API --- */
  Au.playMusic = function (key, variant, opts) {
    variant = variant | 0; opts = opts || {};
    stopJingle(0.5);
    let slot = SLOT_OF[key] || key;
    if (opts.final && slotTracks('final').length) slot = 'final';
    const list = slotTracks(slot);
    const first = list.length ? list[variant % list.length] : null;
    const tag = slot + ':' + (first || key + variant + (opts.final ? 'f' : ''));
    if (Au.track && Au.track.key === tag) return;
    if (list.length) {
      if (!Au.ctx && !Au._gestured) { Au.pendingTrack = [key, variant, opts]; return; }
      playFile(first, tag, key, variant, opts, list);
      return;
    }
    if (!Au.ok) { Au.pendingTrack = [key, variant, opts]; return; }
    stopFiles(1.1);
    if (key === 'map') synthPlay(opts.biome || 'menu', 20 + variant, false, tag);
    else synthPlay(key, variant, opts.final, tag);
  };

  Au.stopMusic = function () {
    stopFiles(0.9);
    synthStop();
    Au.track = null;
  };

  /* melodía corta de victoria o derrota */
  Au.jingle = function (kind) {
    Au.stopMusic();
    const list = slotTracks(kind);
    if (list.length && Au.musicVol > 0.001) {
      const id = list[Math.floor(Math.random() * list.length)];
      const tr = FF.MUSIC.tracks[id];
      const a = mediaEl(2);
      a.onerror = () => {
        if (tryAlt(id)) { a.src = trackURL(id); const p2 = a.play(); if (p2 && p2.catch) p2.catch(() => {}); return; }
        failed[id] = true; Au.play(kind);
      };
      a.loop = false; a.muted = false; a.onended = null; a.src = trackURL(id);
      try { a.volume = fileLevel(tr.gain); } catch (e) { /* */ }
      const pr = a.play();
      if (pr && pr.catch) pr.catch((err) => { if (err && err.name === 'NotAllowedError') Au.play(kind); });
      return;
    }
    Au.play(kind);
  };

  Au.credits = function () {
    const M = FF.MUSIC;
    if (!M) return [];
    return Object.keys(M.tracks).filter((id) => !failed[id]).map((id) => M.tracks[id]);
  };

  document.addEventListener('visibilitychange', () => {
    if (Au.ctx) { if (document.hidden) Au.ctx.suspend().catch(() => {}); else Au.ctx.resume().catch(() => {}); }
    const T = Au.track;
    if (!T || !T.file) return;
    if (document.hidden) T.el.pause();
    else if (Au.musicVol > 0.001) { const pr = T.el.play(); if (pr && pr.catch) pr.catch(() => {}); }
  });

  /* ---------- música generada por código ---------- */
  const SC = {
    dorian: [0, 2, 3, 5, 7, 9, 10], mixo: [0, 2, 4, 5, 7, 9, 10], ionian: [0, 2, 4, 5, 7, 9, 11],
    phrygdom: [0, 1, 4, 5, 7, 8, 10], aeolian: [0, 2, 3, 5, 7, 8, 10], harm: [0, 2, 3, 5, 7, 8, 11]
  };
  const TRACKS = {
    menu: { bpm: 78, root: 50, scale: SC.dorian, prog: [0, 6, 3, 4], seed: 11, drum: 0.5, flute: 1, arp: 0.8 },
    valle: { bpm: 104, root: 50, scale: SC.mixo, prog: [0, 6, 3, 0, 0, 6, 4, 4], seed: 21, drum: 1, flute: 1, arp: 1 },
    islas: { bpm: 112, root: 55, scale: SC.ionian, prog: [0, 4, 5, 3, 0, 4, 3, 4], seed: 31, drum: 1, flute: 1, arp: 1 },
    desierto: { bpm: 96, root: 52, scale: SC.phrygdom, prog: [0, 1, 0, 6, 0, 1, 6, 0], seed: 41, drum: 1.2, flute: 1, arp: 0.9 },
    hielo: { bpm: 84, root: 57, scale: SC.aeolian, prog: [0, 5, 2, 6, 0, 5, 3, 4], seed: 51, drum: 0.6, flute: 1, arp: 1.1 },
    volcan: { bpm: 124, root: 45, scale: SC.harm, prog: [0, 5, 6, 4, 0, 3, 4, 4], seed: 61, drum: 1.5, flute: 0.9, arp: 1 }
  };
  /* progresiones alternativas para que cada nivel suene distinto */
  const ALT_PROGS = [[0, 3, 4, 0], [0, 5, 3, 4], [0, 4, 5, 3], [0, 6, 5, 4], [0, 3, 6, 4], [0, 2, 3, 4]];
  const RHY = [
    [[0, 1], [1, 1], [2, 2]], [[0, 0.5], [0.5, 0.5], [1, 1], [2, 1], [3, 1]], [[0, 1.5], [1.5, 0.5], [2, 1], [3, 1]],
    [[0, 2], [2, 1], [3, 1]], [[0, 1], [1, 0.5], [1.5, 0.5], [2, 2]], [[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 0.5], [2, 2]], [[0, 3], [3, 1]]
  ];

  function makeMotif(rng, tr, bars) {
    const notes = [];
    let deg = rng.int(2, 6);
    for (let b = 0; b < bars; b++) {
      const r = rng.pick(RHY);
      r.forEach((n, i) => {
        if (rng.chance(0.08) && i > 0) return;
        deg += rng.pick([-2, -1, -1, 1, 1, 2, 0, 3, -3]);
        deg = U.clamp(deg, 0, 11);
        notes.push({ beat: b * 4 + n[0], len: n[1], deg });
      });
    }
    return notes;
  }

  let synth = null;
  function synthPlay(key, variant, final, tag) {
    synthStop();
    const base = TRACKS[key] || TRACKS.menu;
    const v = variant | 0;
    const tr = Object.assign({}, base);
    if (v) {
      tr.bpm = base.bpm * (1 + ((v % 3) - 1) * 0.06);
      tr.root = base.root + [0, 2, -3, 5, -2, 3, 0, -5, 2][v % 9];
      if (v % 2) tr.prog = ALT_PROGS[(v + base.seed) % ALT_PROGS.length].concat(ALT_PROGS[(v * 3 + base.seed) % ALT_PROGS.length]);
    }
    if (final) { tr.bpm *= 1.12; tr.drum = Math.max(1.3, (tr.drum || 1) * 1.4); tr.scale = key === 'islas' || key === 'valle' ? SC.dorian : tr.scale; }
    const rng = U.rng(base.seed + v * 13 + (final ? 777 : 0));
    const g = Au.ctx.createGain();
    g.gain.setValueAtTime(0.0001, Au.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(1, Au.ctx.currentTime + 1.5);
    g.connect(Au.musicG);
    const send = Au.ctx.createGain(); send.gain.value = 0.6; g.connect(send); send.connect(Au.rev);
    const A = makeMotif(rng, tr, 2), B = makeMotif(rng, tr, 2), C = makeMotif(rng, tr, 2);
    const vary = (m) => m.map((n) => ({ beat: n.beat, len: n.len, deg: n.deg + (rng.chance(0.25) ? rng.pick([-1, 1]) : 0) }));
    const form = [A, vary(A), B, A, C, vary(C), B, vary(A)];
    synth = { tr, g, beat: 0, next: Au.ctx.currentTime + 0.15, form, rng };
    Au.track = { key: tag, file: false };
    Au.timer = setInterval(schedule, 60);
  }
  function synthStop() {
    if (Au.timer) { clearInterval(Au.timer); Au.timer = null; }
    if (synth && Au.ok) {
      const g = synth.g, t = Au.ctx.currentTime;
      g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      setTimeout(() => { try { g.disconnect(); } catch (e) { /* */ } }, 1200);
    }
    synth = null;
  }

  function degToMidi(tr, deg, oct) {
    const sc = tr.scale;
    const o = Math.floor(deg / sc.length), k = ((deg % sc.length) + sc.length) % sc.length;
    return tr.root + 12 * (o + (oct || 0)) + sc[k];
  }

  function schedule() {
    const T = synth;
    if (!T || !Au.ok) return;
    const c = Au.ctx, tr = T.tr, spb = 60 / tr.bpm;
    if (T.next < c.currentTime - 0.5) T.next = c.currentTime + 0.05;
    while (T.next < c.currentTime + 0.3) {
      const beat = T.beat, t = T.next;
      const bar = Math.floor(beat / 4), bIn = beat % 4;
      const chordDeg = tr.prog[bar % tr.prog.length];
      if (bIn === 0 || (bIn === 2 && T.rng.chance(0.6))) pluck(degToMidi(tr, chordDeg, -1), t, 0.32, T.g, -0.1);
      if (tr.arp) {
        const pat = [0, 2, 4, 7, 4, 2, 0, 4];
        for (let h = 0; h < 2; h++) {
          if (T.rng.chance(0.18)) continue;
          const d = chordDeg + pat[(bIn * 2 + h) % 8];
          pluck(degToMidi(tr, d, 0), t + h * spb / 2, 0.12 * tr.arp, T.g, 0.25);
        }
      }
      const phrase = T.form[Math.floor(bar / 2) % T.form.length];
      const inPhrase = (bar % 2) * 4 + bIn;
      phrase.forEach((n) => {
        if (n.beat >= inPhrase && n.beat < inPhrase + 1) {
          const tt = t + (n.beat - inPhrase) * spb;
          const midi = degToMidi(tr, n.deg + 7, 0);
          tone({ type: 'sine', f: mtof(midi), g: 0.055 * tr.flute, dur: n.len * spb * 0.95, a: 0.04, rel: 0.12, t: tt, dest: T.g, vib: [5.2, 3.5] });
          tone({ type: 'triangle', f: mtof(midi), g: 0.018 * tr.flute, dur: n.len * spb * 0.9, a: 0.05, rel: 0.1, t: tt, dest: T.g });
        }
      });
      if (tr.drum) {
        if (bIn === 0 || (bIn === 2 && tr.drum > 1)) { tone({ f: 110, f2: 55, glide: 0.15, g: 0.16 * Math.min(1, tr.drum), dur: 0.22, t, dest: T.g }); noise({ ft: 'lowpass', f: 400, g: 0.05, dur: 0.1, t, dest: T.g }); }
        noise({ ft: 'highpass', f: 6500, g: 0.018 * tr.drum, dur: 0.05, t: t + spb / 2, dest: T.g });
        if (tr.drum > 1.2 && bIn === 3) noise({ ft: 'bandpass', f: 1800, q: 2, g: 0.05, dur: 0.07, t: t + spb * 0.75, dest: T.g });
      }
      T.beat++;
      T.next += spb;
    }
  }
})(globalThis.FF = globalThis.FF || {});
