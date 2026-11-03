/* Feudo a Feudo — sonidos grabados de batalla: gritos de guerra, espadas, golpes, caídas, tambores y cuerno.
   Vienen dentro del juego en FF.SFX_DATA (js/audio/sfx-data.js, generado por tools/build-sfx.py).
   Si faltan o el navegador no los decodifica, el juego usa sus efectos sintetizados. */
(function (FF) {
  'use strict';
  const Au = FF.Audio;
  const num = (n) => (n < 10 ? '0' : '') + n;
  const serie = (pre, a, b) => { const r = []; for (let i = a; i <= b; i++) r.push(pre + num(i)); return r; };

  /* qué sonidos sirven para cada cosa (por nombre de archivo en sfx/) */
  const GRUPOS = {
    grito: ['grito-1', 'grito-2', 'grito-3'],
    gritoGrupo: ['grito-grupo'],
    choque: serie('choque-', 1, 10).concat(['choque-m1', 'choque-m2', 'choque-m3'], serie('tajo-', 1, 10)),
    golpe: ['golpe-1', 'golpe-2', 'golpe-3', 'choque-m1', 'choque-m3'],
    esfuerzo: ['esfuerzo-1', 'grito-2', 'grito-3'],
    muerte: ['muerte-1'],
    tambores: ['tambores'],
    cuerno: ['cuerno']
  };
  const VOL = 0.5;           /* nivel de los sonidos grabados (calibrado: batalla ≈ 5-6 dB sobre la música por defecto) */
  const MAX_VOCES = 10;

  const B = Au.battle = { ready: false, buf: {}, gain: {}, lastName: {}, last: {}, voices: [], loading: null, heat: 0, heatT: 0 };

  function decode(ab) {
    return new Promise((res, rej) => {
      try {
        const p = Au.ctx.decodeAudioData(ab, res, rej);
        if (p && p.then) p.then(res, rej);
      } catch (e) { rej(e); }
    });
  }

  /* se decodifican una vez, cuando ya existe el contexto de audio (primer toque o clic) */
  B.load = function () {
    if (B.loading) return B.loading;
    const D = FF.SFX_DATA;
    if (!Au.ctx || !D) return null;
    const jobs = Object.keys(D).map((n) => {
      const bin = atob(D[n].b64);
      const u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      B.gain[n] = D[n].g || 1;
      return decode(u8.buffer).then((buf) => { B.buf[n] = buf; }, () => {});
    });
    B.loading = Promise.all(jobs).then(() => {
      B.ready = Object.keys(B.buf).length > 0;
      FF.SFX_DATA = null;      /* libera la copia en texto */
    });
    return B.loading;
  };

  function pick(group) {
    const list = (GRUPOS[group] || []).filter((n) => B.buf[n]);
    if (!list.length) return null;
    let n = list[Math.floor(Math.random() * list.length)];
    if (list.length > 2 && n === B.lastName[group]) n = list[(list.indexOf(n) + 1) % list.length];
    B.lastName[group] = n;
    return n;
  }

  /* o: { x (posición en el mapa → estéreo), gain, vary (variación de tono), delay, prio } */
  B.play = function (group, o) {
    if (!B.ready || !Au.ok || Au.sfxVol <= 0.001) return false;
    o = o || {};
    const ctx = Au.ctx, now = ctx.currentTime;
    B.voices = B.voices.filter((end) => end > now);
    if (B.voices.length >= MAX_VOCES + (o.prio ? 4 : 0)) return false;
    const n = pick(group);
    if (!n) return false;
    const src = ctx.createBufferSource();
    src.buffer = B.buf[n];
    const vary = o.vary == null ? 0.06 : o.vary;
    const rate = 1 + (Math.random() * 2 - 1) * vary;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = VOL * B.gain[n] * (o.gain == null ? 1 : o.gain);
    src.connect(g);
    let out = g;
    if (o.x != null && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, (o.x / 1280) * 2 - 1)) * 0.6;
      g.connect(p);
      out = p;
    }
    out.connect(Au.sfxG);
    const t0 = now + (o.delay || 0);
    src.start(t0);
    B.voices.push(t0 + src.buffer.duration / rate);
    return true;
  };

  /* ---------- sucesos del juego (devuelven true si ya han sonado aquí) ---------- */

  /* grito de guerra al salir tus tropas; los envíos del mismo instante (varios edificios) se juntan */
  let burst = null;
  function flushCry() {
    const b = burst;
    burst = null;
    if (!b || !B.ready) return;
    const now = Au.ctx.currentTime, x = b.x / b.k;
    if ((b.n >= 18 || b.k >= 3) && (!B.last.grupo || now - B.last.grupo > 1.6)) {
      B.last.grupo = now; B.last.grito = now;
      B.play('gritoGrupo', { x, vary: 0.03, prio: true });
      return;
    }
    if (B.last.grito && now - B.last.grito < 0.9) return;
    B.last.grito = now;
    B.play('grito', { x, vary: 0.07, prio: true });
  }
  B.send = function (e) {
    if (!B.ready) return false;
    if (!burst) { burst = { n: 0, k: 0, x: 0 }; setTimeout(flushCry, 45); }
    burst.n += e.n || 0; burst.k++; burst.x += e.src ? e.src.x : 640;
    return true;
  };

  /* cuerpo a cuerpo en los caminos: espadas, y cuanto más dura la pelea, más gritos */
  B.clash = function (e) {
    if (!B.ready) return false;
    const now = Au.ctx.currentTime;
    B.heat = Math.max(0, B.heat - (now - B.heatT) * 3) + 1;
    B.heatT = now;
    if (B.last.choque && now - B.last.choque < 0.12) return true;
    B.last.choque = now;
    B.play('choque', { x: e.x, gain: 0.55 + Math.random() * 0.35, vary: 0.1 });
    const pYell = B.heat > 6 ? 0.3 : 0.14;
    if (Math.random() < pYell && (!B.last.esf || now - B.last.esf > (B.heat > 6 ? 0.6 : 0.95))) {
      B.last.esf = now;
      B.play('esfuerzo', { x: e.x + (Math.random() - 0.5) * 60, gain: 0.5 + Math.random() * 0.2, vary: 0.12, delay: 0.04 });
    }
    if (Math.random() < 0.06 && (!B.last.muerte || now - B.last.muerte > 1.4)) {
      B.last.muerte = now;
      B.play('muerte', { x: e.x, gain: 0.45, vary: 0.12, delay: 0.1 });
    }
    return true;
  };

  /* tropas golpeando un edificio */
  B.impact = function (e) {
    if (!B.ready) return false;
    const now = Au.ctx.currentTime;
    if (B.last.golpe && now - B.last.golpe < 0.14) return true;
    B.last.golpe = now;
    B.play('golpe', { x: e.b.x, gain: 0.45 + Math.random() * 0.25, vary: 0.1 });
    return true;
  };

  /* caídas por las lanzas de las atalayas o por hechizos: de vez en cuando, un grito */
  B.die = function (e) {
    if (!B.ready) return;
    const now = Au.ctx.currentTime;
    if (Math.random() < 0.3 && (!B.last.muerte || now - B.last.muerte > 1.1)) {
      B.last.muerte = now;
      B.play('muerte', { x: e.x, gain: 0.5, vary: 0.14 });
    }
  };

  /* al empezar la batalla: tambores; antes de la batalla final de cada mundo, también el cuerno */
  B.start = function (level) {
    const go = () => {
      if (!FF.App || FF.App.level !== level || !FF.App.game || FF.App.game.time > 6) return;
      if (level.index === 8 || level.skirmish) {
        B.play('cuerno', { gain: 0.8, vary: 0, prio: true });
        B.play('tambores', { gain: 0.75, vary: 0, delay: 1.4, prio: true });
      } else B.play('tambores', { gain: 0.8, vary: 0, prio: true });
    };
    if (B.ready) go();
    else {
      const p = B.load();
      if (p) p.then(go);
    }
  };

  Au.sfxCredits = function () {
    return FF.SFX_CREDITS && (B.ready || FF.SFX_DATA) ? FF.SFX_CREDITS.slice() : [];
  };
})(globalThis.FF = globalThis.FF || {});
