/* Feudo a Feudo — progreso, ajustes y logros (localStorage) */
(function (FF) {
  'use strict';
  const KEY = 'feudo-a-feudo-v1';

  const Save = FF.Save = {
    data: null,
    defaults() {
      return {
        v: 1, levels: {}, ach: {}, seen: {}, lastWorld: 0,
        stats: { trained: 0, upgrades: 0, jinetes: 0, caballeros: 0, towerKills: 0, spells: 0, spellSet: {}, wins: 0, losses: 0, skirmishWins: 0, playTime: 0 },
        settings: { music: 0.5, sfx: 0.7, quality: 'alta', paths: true, tips: true, fpsCap: (FF.Host && FF.Host.android) ? 60 : 0, showFps: false, renderScale: 1, v12: true }
      };
    },
    load() {
      let d = null;
      try { const raw = localStorage.getItem(KEY); if (raw) d = JSON.parse(raw); } catch (e) { d = null; }
      /* en la app de escritorio la partida vive en disco */
      const H = FF.Host;
      if (H && H.desktop && H.info && H.info.save && typeof H.info.save === 'object') d = H.info.save;
      const def = Save.defaults();
      if (!d || typeof d !== 'object') d = def;
      d.levels = d.levels || {}; d.ach = d.ach || {}; d.seen = d.seen || {};
      d.stats = Object.assign(def.stats, d.stats || {});
      const hadV12 = !!(d.settings && d.settings.v12);
      d.settings = Object.assign(def.settings, d.settings || {});
      if (!hadV12) {
        /* 1.2: en el móvil se limita a 60 FPS (pantallas de 90-120 Hz: menos calor y batería) */
        if (FF.Host && FF.Host.android && !d.settings.fpsCap) d.settings.fpsCap = 60;
        d.settings.v12 = true;
      }
      Save.data = d;
      return d;
    },
    save() {
      const json = JSON.stringify(Save.data);
      try { localStorage.setItem(KEY, json); } catch (e) { /* almacenamiento no disponible */ }
      if (FF.Host && FF.Host.desktop) FF.Host.storeSave(json);
    },
    reset() {
      const s = Save.data ? Save.data.settings : null;
      Save.data = Save.defaults();
      if (s) Save.data.settings = s;
      Save.save();
    },
    rec(id) {
      let r = Save.data.levels[id];
      if (!r) r = Save.data.levels[id] = { m: [null, null, null] };
      return r;
    },
    done(id, mode) {
      const r = Save.data.levels[id];
      if (!r) return false;
      if (mode == null) return r.m.some((x) => x);
      return !!r.m[mode];
    },
    medal(id, mode) { const r = Save.data.levels[id]; return !!(r && r.m[mode] && r.m[mode].medal); },
    levelIndex(id) { return FF.LEVELS.findIndex((l) => l.id === id); },
    levelUnlocked(id) {
      const i = Save.levelIndex(id);
      if (i <= 0) return true;
      return Save.done(FF.LEVELS[i - 1].id);
    },
    modeUnlocked(id, mode) {
      if (!Save.levelUnlocked(id)) return false;
      return mode === 0 || Save.done(id, mode - 1);
    },
    worldUnlocked(w) { return Save.levelUnlocked(FF.LEVELS[w * 9].id); },
    worldProgress(w) {
      let done = 0, medals = 0, modes = 0;
      for (let i = 0; i < 9; i++) {
        const id = FF.LEVELS[w * 9 + i].id;
        if (Save.done(id)) done++;
        for (let m = 0; m < 3; m++) { if (Save.done(id, m)) modes++; if (Save.medal(id, m)) medals++; }
      }
      return { done, medals, modes };
    },
    countMedals(mode) {
      let n = 0;
      FF.LEVELS.forEach((l) => { for (let m = 0; m < 3; m++) if ((mode == null || mode === m) && Save.medal(l.id, m)) n++; });
      return n;
    },
    /* guarda el resultado de una partida; devuelve qué cambió */
    record(level, mode, res) {
      const out = { first: false, best: false, medal: false, newMedal: false, score: 0 };
      const st = Save.data.stats, gs = res.stats;
      st.trained += gs.produced; st.upgrades += gs.upgrades; st.jinetes += gs.jinetes; st.caballeros += gs.caballeros;
      st.towerKills += gs.towerKills; st.spells += gs.spells; st.playTime += res.time;
      Object.keys(gs.spellSet).forEach((k) => { st.spellSet[k] = true; });
      if (!res.win) { st.losses++; Save.save(); return out; }
      st.wins++;
      const mul = FF.MODES[mode].scoreMul;
      const medalT = level.medal ? level.medal[mode] : 0;
      const timeBonus = medalT ? Math.max(0, medalT - res.time) * 12 : 0;
      out.score = Math.round((1000 + gs.captured * 40 + res.troops * 3 + gs.killed * 2 + timeBonus) * mul);
      out.medal = medalT ? res.time <= medalT : false;
      if (level.skirmish) { st.skirmishWins++; Save.save(); return out; }
      const r = Save.rec(level.id);
      const prev = r.m[mode];
      if (!prev) { out.first = true; r.m[mode] = { t: res.time, s: out.score, medal: out.medal }; out.best = true; out.newMedal = out.medal; }
      else {
        if (res.time < prev.t) { prev.t = res.time; out.best = true; }
        if (out.score > prev.s) prev.s = out.score;
        if (out.medal && !prev.medal) { prev.medal = true; out.newMedal = true; }
      }
      Save.save();
      return out;
    }
  };

  /* ---------- logros ---------- */
  FF.Achieve = {
    check(ctx) {
      const d = Save.data, st = d.stats;
      const got = [];
      const give = (id) => { if (!d.ach[id]) { d.ach[id] = Date.now(); got.push(FF.ACHIEVEMENTS.find((a) => a.id === id)); } };
      const allDone = (mode) => FF.LEVELS.every((l) => Save.done(l.id, mode));
      if (st.wins >= 1) give('primer');
      for (let w = 0; w < 5; w++) if (Save.worldProgress(w).done === 9) give('mundo' + (w + 1));
      if (allDone(1)) give('caballero');
      if (allDone(2)) give('senor');
      if (allDone(0) && allDone(1) && allDone(2)) give('total');
      if (Save.countMedals() >= 10) give('medallas10');
      for (let m = 0; m < 3; m++) if (Save.countMedals(m) >= 45) give('medallas45');
      if (st.upgrades >= 100) give('arquitecto');
      if (st.trained >= 10000) give('leva');
      if (st.trained >= 100000) give('hueste');
      if (st.jinetes >= 500) give('jinetes');
      if (st.caballeros >= 500) give('caballeros');
      if (st.towerKills >= 1000) give('arqueros');
      if (FF.SPELL_ORDER.every((k) => st.spellSet[k])) give('hechicero');
      if (st.spells >= 100) give('archimago');
      if (st.skirmishWins >= 5) give('escaramuza');
      if (ctx && ctx.game) {
        const g = ctx.game, gs = g.stats, res = g.result;
        if (gs.maxLevelNow >= 8) give('maestro');
        if (gs.maxInBuilding >= 100) give('desborde');
        if (res && res.win) {
          if (res.time < 60) give('rapido');
          const idx = g.level.skirmish ? 99 : Save.levelIndex(g.level.id);
          if (gs.lostBuildings === 0 && idx >= 3) give('intocable');
          if (g.modeIndex === 1 && !gs.usedMagic) give('purista');
          if (gs.comeback) give('remontada');
          if (g.factions.length - 1 >= 3) give('tres');
        }
      }
      if (got.length) Save.save();
      return got;
    }
  };
})(globalThis.FF = globalThis.FF || {});
