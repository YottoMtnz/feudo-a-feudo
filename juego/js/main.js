/* Feudo a Feudo — arranque, bucle principal y flujo de partida */
(function (FF) {
  'use strict';
  const STEP = 1 / 60;
  FF.VERSION = '1.5';

  const App = FF.App = {
    game: null, level: null, mode: 0, paused: false, ending: false, speed: 1, acc: 0, last: 0, tut: null,

    init() {
      FF.Save.load();
      const S = FF.Save.data.settings;
      App.cv = document.getElementById('cv');
      App.renderer = new FF.Renderer(App.cv);
      App.renderer.quality = S.quality;
      App.renderer.renderScale = S.renderScale || 1;
      App.fpsEl = document.getElementById('fps');
      App.fpsEl.classList.toggle('hidden', !S.showFps);
      App.fpsN = 0; App.fpsT = 0;
      FF.UI.init(App);
      App.input = new FF.Input(App);
      FF.Audio.setVolumes(S.music, S.sfx);
      App.resize();
      window.addEventListener('resize', () => App.resize());
      window.addEventListener('orientationchange', () => setTimeout(App.resize, 200));
      const unlock = () => { FF.Audio.init(); };
      window.addEventListener('pointerdown', unlock, { capture: true });
      window.addEventListener('keydown', unlock, { capture: true });
      document.addEventListener('visibilitychange', () => { if (document.hidden && App.game && !App.paused && !App.ending) App.openPause(); });
      const rot = document.getElementById('rotate');
      if (rot) {
        rot.classList.add('need');
        const b = rot.querySelector('button');
        if (b) b.addEventListener('click', () => rot.classList.remove('need'));
      }
      const ld = document.getElementById('loading');
      if (ld) ld.remove();
      /* parámetros de prueba: ?level=w1l3&mode=1&autoplay=1&speed=4 */
      const q = new URLSearchParams(location.search);
      App.autoplay = q.get('autoplay') === '1';
      const lv = q.get('level');
      if (lv) {
        const L = FF.LEVELS.find((l) => l.id === lv) || (lv === 'skirmish' ? FF.MapGen.skirmish({ biome: q.get('biome') || 'volcan', enemies: 3, size: q.get('size') || 'grande' }) : null);
        if (L) {
          if (!L.medal) L.medal = [600, 600, 600];
          App.autoplay = q.get('autoplay') === '1';
          App.startLevel(L, +(q.get('mode') || 0));
          if (q.get('speed')) App.speed = +q.get('speed');
        } else FF.UI.showTitle();
      } else if (q.get('screen') === 'map') FF.UI.showMap(+(q.get('world') || 0));
      else FF.UI.showTitle();
      requestAnimationFrame(App.loop);
    },

    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      App.renderer.resize(w, h, window.devicePixelRatio || 1);
    },

    applyQuality() {
      const S = FF.Save.data.settings;
      App.renderer.quality = S.quality;
      App.renderer.renderScale = S.renderScale || 1;
      App.renderer.terrain && (App.renderer.terrainR = 0.01);
      App.fpsEl.classList.toggle('hidden', !S.showFps);
      App.resize();
    },

    /* botón Atrás de Android */
    onBack() {
      const UI = FF.UI;
      if (UI.modalOpen()) { if (UI.modalClose) UI.modalClose(); else UI.closeModal(); return; }
      if (App.game && !App.ending) { if (App.tut && !App.tut.dead) App.tut.destroy(); App.openPause(); return; }
      if (App.game && App.ending) return;
      if (UI.screen === 'map') { FF.Audio.play('click'); UI.showTitle(); return; }
      UI.confirmQuit();
    },

    flag(k) { if (App.tut && !App.tut.dead) App.tut.flag(k); },

    startLevel(level, mode) {
      FF.UI.closeModal();
      document.getElementById('screens').innerHTML = '';
      FF.UI.bgScene = null;
      if (App.tut) { App.tut.destroy(); App.tut = null; }
      App.level = level; App.mode = mode;
      const opts = { mode, seed: Math.floor(Math.random() * 1e6) };
      if (App.autoplay) opts.playerAI = { persona: 'equilibrado', mode: Object.assign({}, FF.MODES[2].ai, { prod: 1, startDelay: 0.5 }) };
      App.game = new FF.Game(level, opts);
      App.paused = false; App.ending = false; App.speed = 1; App.acc = 0;
      App.input.reset();
      App.renderer.setGame(App.game);
      FF.UI.showHUD(App.game);
      FF.Audio.playMusic(level.biome || 'valle', level.skirmish ? Math.floor(Math.random() * 9) : level.index, { final: level.index === 8 });
      if (FF.Audio.battle) FF.Audio.battle.start(level);
      const S = FF.Save.data.settings;
      if (level.tutorial && S.tips && !level.skirmish && !FF.Save.done(level.id)) App.tut = new FF.Tut(App, level.tutorial);
      if (level.skirmish) FF.UI.toast('¡Batalla rápida! Derrota a ' + (App.game.factions.length - 1) + (App.game.factions.length > 2 ? ' señores' : ' señor'));
      else FF.UI.toast(level.name, '', 2000);
    },

    restart() { if (App.level) App.startLevel(App.level, App.mode); },

    quitToMap() {
      const lvl = App.level;
      App.game = null;
      App.ending = false;
      if (App.tut) { App.tut.destroy(); App.tut = null; }
      FF.UI.hideHUD();
      App.renderer.game = null;
      if (!lvl || lvl.skirmish) FF.UI.showTitle(); else FF.UI.showMap(lvl.world);
    },

    openPause() {
      if (!App.game || App.ending) return;
      App.paused = true;
      App.input.cancel();
      FF.UI.pause();
    },
    setPaused(v) { App.paused = v; },
    toggleSpeed() {
      App.speed = App.speed === 1 ? 2 : 1;
      FF.UI.toast(App.speed === 1 ? 'Velocidad normal' : 'Velocidad doble', '', 1100);
    },
    toggleFullscreen() {
      const d = document, el = d.documentElement;
      try {
        if (!d.fullscreenElement && !d.webkitFullscreenElement) {
          const r = el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen && el.webkitRequestFullscreen();
          if (r && r.then) r.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* */ } }).catch(() => {});
        } else if (d.exitFullscreen) d.exitFullscreen(); else if (d.webkitExitFullscreen) d.webkitExitFullscreen();
      } catch (e) { /* */ }
    },

    sound(e) {
      const A = FF.Audio, P = App.game.player;
      switch (e.type) {
        case 'send': if (e.owner === P && !(A.battle && A.battle.send(e))) A.play('send'); break;
        case 'arrow': A.play('arrow'); break;
        case 'die': if (A.battle) A.battle.die(e); A.play('die'); break;
        case 'ding': A.play('ding'); break;
        case 'clash': if (!(A.battle && A.battle.clash(e))) A.play('clash'); break;
        case 'impact': if ((e.owner === P || e.b.owner === P) && !(A.battle && A.battle.impact(e))) A.play('impact'); break;
        case 'capture': A.play(e.to === P ? 'capture' : e.from === P ? 'lost' : 'neutralTaken'); break;
        case 'upgrade': if (e.owner === P) A.play('upgrade'); break;
        case 'spell': A.play(e.key === 'meteoro' ? 'meteoroCae' : e.key); break;
        case 'meteorHit': A.play('meteoroGolpe'); break;
        case 'eliminated': A.play('gong'); break;
      }
    },

    onEnd(win) {
      App.ending = true;
      App.input.cancel();
      App.input.targeting = null;
      if (App.tut) { App.tut.destroy(); App.tut = null; }
      FF.Audio.jingle(win ? 'victory' : 'defeat');
      if (win) {
        const r = App.renderer;
        for (let i = 0; i < 4; i++) setTimeout(() => {
          if (!App.game) return;
          const own = App.game.buildings.filter((b) => b.owner === App.game.player);
          const b = own[Math.floor(Math.random() * own.length)];
          if (b) r.onEvent({ type: 'capture', b, from: -1, to: App.game.player });
        }, i * 260);
      }
      setTimeout(() => {
        const g = App.game;
        if (!g) return;
        if (App.autoplay) { console.log('AUTOPLAY_END', JSON.stringify({ win: g.result.win, time: Math.round(g.result.time) })); }
        const rec = FF.Save.record(g.level, g.modeIndex, g.result);
        const achs = FF.Achieve.check({ game: g });
        FF.UI.result(g, rec, achs);
        achs.forEach((a, i) => setTimeout(() => FF.UI.achToast(a), 600 + i * 900));
      }, 1600);
    },

    loop(ts) {
      const cap = FF.Save.data.settings.fpsCap | 0;
      if (cap > 0 && App.last) {
        /* limitador uniforme: en pantallas de 90 Hz un tope de 60 da 60 FPS, no 45 */
        App.capAcc = Math.min((App.capAcc || 0) + (ts / 1000 - (App.capPrev || ts / 1000)), 2 / cap);
        App.capPrev = ts / 1000;
        if (App.capAcc < 1 / cap - 0.002) { requestAnimationFrame(App.loop); return; }
        App.capAcc -= 1 / cap;
      } else App.capPrev = ts / 1000;
      /* en pausa (sin efectos que animar) basta con unos pocos fotogramas por segundo */
      if (App.game && App.paused && !App.ending && App.last && ts / 1000 - App.last < 0.2) { requestAnimationFrame(App.loop); return; }
      if (FF.Art.dirty && !App.game) { FF.Art.dirty = false; FF.Art.clearCache(); if (FF.UI.redraw) FF.UI.redraw(); }
      const now = ts / 1000;
      let dt = App.last ? now - App.last : 0.016;
      App.last = now;
      dt = Math.min(dt, 0.1);
      App.fpsN++; App.fpsT += dt;
      if (App.fpsT >= 0.5) {
        if (FF.Save.data.settings.showFps) App.fpsEl.textContent = Math.round(App.fpsN / App.fpsT) + ' FPS';
        App.fpsN = 0; App.fpsT = 0;
      }
      FF.UI.tick(dt);
      const g = App.game;
      if (g) {
        let simDt = 0;
        if (!App.paused && !App.ending) {
          App.acc += dt * App.speed;
          let n = 0;
          while (App.acc >= STEP && n < 12) { g.update(STEP); App.acc -= STEP; n++; simDt += STEP; }
          if (n >= 12) App.acc = 0;
        }
        const evs = g.events;
        for (let i = 0; i < evs.length; i++) {
          const e = evs[i];
          App.renderer.onEvent(e);
          App.sound(e);
          if (e.type === 'eliminated' && e.f !== g.player) FF.UI.toast(FF.FACTIONS[e.f].name + ' ha caído', '', 2400);
          if (e.type === 'capture' && e.from === g.player && g.buildings.filter((b) => b.owner === g.player).length === 1) FF.UI.toast('¡Sólo te queda un edificio!', '', 2000);
          if (e.type === 'end') App.onEnd(e.win);
        }
        evs.length = 0;
        App.input.update(dt);
        if (App.tut && !App.tut.dead && !App.paused) App.tut.update(dt);
        App.renderer.frame(App.paused ? 0 : (App.ending ? dt * 0.6 : dt * App.speed), App.input.ui());
      }
      requestAnimationFrame(App.loop);
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', App.init);
  else App.init();
})(globalThis.FF = globalThis.FF || {});
