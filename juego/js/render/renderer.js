/* Feudo a Feudo — renderizador de la partida: terreno, edificios, tropas, efectos y marcadores */
(function (FF) {
  'use strict';
  const U = FF.U, A = FF.Art;
  const WW = 1280, WH = 720;
  const BSCALE = 1.12; /* escala de los edificios en el mapa */

  class Renderer {
    constructor(canvas) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.game = null;
      this.t = 0;
      this.parts = [];
      this.texts = [];
      this.decals = [];
      this.bolts = [];
      this.meteors = [];
      this.flash = 0; this.flashCol = '#fff';
      this.shake = 0;
      this.quality = 'alta';
      this.ambient = [];
      this.clouds = [];
      this.draw = [];
      this.tmp = {};
      this.s = 1; this.ox = 0; this.oy = 0;
      this.uiK = 1;
      this.glowC = {}; this.badgeC = new Map(); this.flagC = {};
      this.life = FF.Life ? new FF.Life() : null;   /* vida del escenario */
      this.M = { m: 1, tx: 0, ty: 0 };
      /* si la tarjeta gráfica pierde el contenido de los lienzos, se redibuja todo */
      canvas.addEventListener('contextrestored', () => { A.dirty = true; });
    }

    /* círculo precalculado (duro o difuso) para partículas: más barato que trazar un arco cada vez */
    dotSpr(col, soft) {
      const key = col + (soft ? '~' : '');
      let c = this.glowC[key];
      if (!c) {
        c = document.createElement('canvas'); c.width = c.height = 32;
        const x = c.getContext('2d');
        if (soft) {
          const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
          gr.addColorStop(0, col); gr.addColorStop(0.55, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
          x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
        } else { x.fillStyle = col; x.beginPath(); x.arc(16, 16, 15, 0, U.TAU); x.fill(); }
        this.glowC[key] = c;
      }
      return c;
    }

    /* lista de sprites del nivel (edificios de cada tipo, nivel y reino; tropas de cada reino) */
    warmList(g) {
      const owners = [0].concat(g.factions || []).filter((v, i, a) => a.indexOf(v) === i);
      const types = {}, list = [];
      g.buildings.forEach((b) => { types[b.type] = b.maxLevel; });
      const uts = ['soldado'];
      if (types.establo) uts.push('jinete');
      if (types.herreria) uts.push('caballero');
      owners.forEach((o) => {
        Object.keys(types).forEach((ty) => { for (let l = 1; l <= types[ty]; l++) list.push(() => A.building(ty, l, o)); });
        if (o) uts.forEach((ut) => { for (let f = 0; f < A.FRAMES; f++) { list.push(() => A.unit(ut, o, f, false)); list.push(() => A.unit(ut, o, f, true)); } });
      });
      /* primero lo que se ve al empezar */
      g.buildings.forEach((b) => list.push(() => A.building(b.type, b.level, b.owner)));
      return list;
    }

    resetCaches() { this.badgeC.clear(); this.flagC = {}; this.upC = null; }

    /* resplandor radial precalculado: se escala y se le da transparencia en vez de crear
       un degradado nuevo en cada fotograma */
    glowSpr(c0, c1) {
      const key = c0 + '|' + c1;
      let c = this.glowC[key];
      if (!c) {
        c = document.createElement('canvas'); c.width = c.height = 64;
        const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
        gr.addColorStop(0, c0); gr.addColorStop(1, c1);
        x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
        this.glowC[key] = c;
      }
      return c;
    }
    glow(ctx, x, y, r, c0, c1, alpha) {
      if (alpha <= 0.01 || r <= 0) return;
      const ga = ctx.globalAlpha;
      ctx.globalAlpha = ga * Math.min(1, alpha);
      ctx.drawImage(this.glowSpr(c0, c1), x - r, y - r, r * 2, r * 2);
      ctx.globalAlpha = ga;
    }

    /* banderas: 16 fotogramas de la ondulación por reino, dibujados una vez */
    flagFrame(owner, phase) {
      const N = 16, k = Math.floor((((phase % U.TAU) + U.TAU) % U.TAU) / U.TAU * N) % N;
      const key = owner + '_' + k;
      let fr = this.flagC[key];
      if (fr) return fr;
      const sc = Math.max(1, this.dpr * this.s * BSCALE * 1.12);
      const c = document.createElement('canvas');
      c.width = Math.ceil(18 * sc); c.height = Math.ceil(16 * sc);
      const ctx = c.getContext('2d');
      ctx.scale(sc, sc); ctx.translate(1, 3.5);
      const F = FF.FACTIONS[owner], ph = (k / N) * U.TAU;
      const L = 13, Hh = 7.5, fx = 0, fy = 0;
      const wv = (u) => Math.sin(ph + u * 3.2) * 1.7 * u;
      ctx.beginPath();
      ctx.moveTo(fx, fy + 0.8);
      for (let i = 0; i <= 8; i++) { const u = i / 8; ctx.lineTo(fx + u * L, fy + 0.8 + wv(u)); }
      ctx.lineTo(fx + L * 0.78, fy + 0.8 + Hh / 2 + wv(0.78));
      ctx.lineTo(fx + L, fy + 0.8 + Hh + wv(1));
      for (let i = 8; i >= 0; i--) { const u = i / 8; ctx.lineTo(fx + u * L, fy + 0.8 + Hh + wv(u)); }
      ctx.closePath();
      const base = owner === 0 ? '#efe9dc' : F.color;
      const fg = ctx.createLinearGradient(fx, 0, fx + L, 0);
      for (let i = 0; i <= 4; i++) { const u = i / 4; fg.addColorStop(u, U.shade(base, Math.cos(ph + u * 3.2) * 0.18 * u)); }
      ctx.fillStyle = fg; ctx.fill();
      ctx.strokeStyle = 'rgba(30,20,10,0.6)'; ctx.lineWidth = 0.7; ctx.stroke();
      ctx.strokeStyle = owner === 0 ? 'rgba(160,150,130,0.8)' : 'rgba(242,207,110,0.85)'; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(fx + 0.6, fy + 2.2); for (let i = 1; i <= 7; i++) { const u = i / 8; ctx.lineTo(fx + u * L, fy + 2.2 + wv(u)); } ctx.stroke();
      fr = this.flagC[key] = { c, ox: -1, oy: -3.5, w: c.width / sc, h: c.height / sc };
      return fr;
    }

    resize(w, h, dpr) {
      const q = this.quality;
      const mobile = (FF.Host && FF.Host.android) || (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches);
      const maxDpr = q === 'baja' ? 1 : q === 'media' ? (mobile ? 1.25 : 1.5) : (mobile ? 1.75 : 2);
      const prev = this.dpr * this.s;
      this.dpr = U.clamp(Math.min(dpr || 1, maxDpr) * (this.renderScale || 1), 0.5, 2.5);
      this.cssW = w; this.cssH = h;
      this.cv.width = Math.round(w * this.dpr);
      this.cv.height = Math.round(h * this.dpr);
      this.cv.style.width = w + 'px'; this.cv.style.height = h + 'px';
      this.s = Math.min(w / WW, h / WH);
      this.ox = (w - WW * this.s) / 2;
      this.oy = (h - WH * this.s) / 2;
      this.uiK = U.clamp(0.82 / this.s, 1, 1.75);
      /* pantallas más alargadas (o más altas) que el mapa: en vez de bandas a los lados se ve más
         terreno, sin deformar nada. Se redondea para no rehacer el terreno por cambios pequeños. */
      const ex = Math.min(400, Math.ceil(Math.max(0, this.ox - 0.5) / this.s / 32) * 32);
      const ey = Math.min(260, Math.ceil(Math.max(0, this.oy - 0.5) / this.s / 32) * 32);
      const extChanged = !this.ext || this.ext.x !== ex || this.ext.y !== ey;
      this.ext = { x: ex, y: ey };
      /* zona visible del mundo (para nieve, hojas y demás) */
      this.V = { x0: -this.ox / this.s, y0: -this.oy / this.s, x1: WW + this.ox / this.s, y1: WH + this.oy / this.s };
      const R = U.clamp(this.s * this.dpr, 0.75, 2);
      if (Math.abs(this.dpr * this.s - prev) > 0.01) this.resetCaches();
      FF.Art.setScale(this.s * this.dpr);
      if (this.game && (!this.terrain || extChanged || Math.abs(R - this.terrainR) / this.terrainR > 0.2)) this.buildTerrain(R);
    }

    /* destello dorado en los edificios que acaban de enviar tropas */
    pulse(ids) {
      const g = this.game; if (!g) return;
      ids.forEach((id) => { const b = g.buildings[id]; if (b) this.part({ x: b.x, y: b.y + 2, type: 'ring', col: '#ffe48a', life: 0.45, size: 34 }); });
    }

    toWorld(cx, cy) { return { x: (cx - this.ox) / this.s, y: (cy - this.oy) / this.s }; }
    toScreen(x, y) { return { x: x * this.s + this.ox, y: y * this.s + this.oy }; }

    setGame(game) {
      this.game = game;
      this.prewarm = this.warmList(game);
      this.parts.length = 0; this.texts.length = 0; this.decals.length = 0; this.bolts.length = 0; this.meteors.length = 0;
      this.flash = 0; this.shake = 0;
      this.terrain = null;
      const R = U.clamp(this.s * (this.dpr || 1), 0.75, 2);
      this.buildTerrain(R);
      const rng = U.rng(game.level.seed || 3);
      this.clouds = [];
      for (let i = 0; i < 4; i++) this.clouds.push({ x: rng.range(-200, WW), y: rng.range(0, WH), r: rng.range(120, 220), v: rng.range(6, 12) });
      this.ambient = [];
      this.smokeT = {};
    }

    buildTerrain(R) {
      const t0 = performance.now();
      this.terrainR = R;
      this.terrain = FF.Terrain.render(this.game.level, this.game.map, R, { sway: this.quality !== 'baja' && !!this.life, ext: this.ext || { x: 0, y: 0 } });
      if (this.life) { this.life.reset(this.terrain, this.quality, this.game.level.seed || 3); this.life.setBase(this.terrain.canvas, R); }
      this.terrainMs = performance.now() - t0;
    }

    /* ---------- efectos ---------- */
    part(p) {
      const lim = this.quality === 'baja' ? 150 : this.quality === 'media' ? 350 : 700;
      if (this.parts.length > lim) return;
      p.life = p.life || 1; p.age = 0;
      this.parts.push(p);
    }
    text(x, y, str, col, size, dur) { this.texts.push({ x, y, str, col: col || '#fff', size: size || 14, age: 0, dur: dur || 1.4 }); }
    burst(x, y, n, col, speed, opts) {
      opts = opts || {};
      for (let i = 0; i < n; i++) {
        const a = Math.random() * U.TAU, v = (0.3 + Math.random() * 0.7) * speed;
        this.part({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - (opts.up || 0), life: (opts.life || 0.6) * (0.6 + Math.random() * 0.6), size: opts.size || 2, col, type: opts.type || 'dot', g: opts.g || 0, drag: opts.drag || 2.5 });
      }
    }

    onEvent(e) {
      const g = this.game, P = g.player;
      const F = (o) => FF.FACTIONS[o];
      switch (e.type) {
        case 'send': {
          const s = e.src;
          s.sendT = g.time;
          this.burst(s.x, s.y + 6, 7, 'rgba(255,244,214,0.85)', 34, { life: 0.6, size: 3.2, type: 'dust' });
          break;
        }
        case 'die':
          this.burst(e.x, e.y - 4, 5 + (e.n || 1) * 2, 'rgba(255,255,255,0.9)', 30, { life: 0.5, size: 2.8, type: 'dust' });
          for (let i = 0; i < (e.n || 1); i++) this.part({ x: e.x + (Math.random() - 0.5) * 6, y: e.y - 8, vx: (Math.random() - 0.5) * 24, vy: -26, life: 0.75, size: 2.6, col: F(e.owner).color, type: 'dot', g: 70 });
          if (e.lvl >= 3) {
            this.part({ x: e.x, y: e.y - 6, type: 'ring', col: '#bfe6ff', life: 0.35, size: 16 });
            this.burst(e.x, e.y - 8, 10, '#e4f4ff', 90, { life: 0.35, size: 1.8, type: 'spark' });
          } else if (e.lvl === 2) this.burst(e.x, e.y - 8, 4, '#fff1c8', 60, { life: 0.25, size: 1.5, type: 'spark' });
          break;
        case 'ding':
          this.burst(e.x, e.y - 8, 4, '#ffffff', 50, { life: 0.25, size: 1.5, type: 'spark' });
          break;
        case 'miss':
          this.decals.push({ type: 'arrow', x: e.x + (Math.random() - 0.5) * 8, y: e.y + (Math.random() - 0.5) * 5, a: -0.6 + Math.random() * 0.4, age: 0, dur: 2.5 });
          break;
        case 'impact': {
          const b = e.b;
          if (Math.random() < 0.5) this.burst(b.x + (Math.random() - 0.5) * 20, b.y - 10 - Math.random() * 14, 3, F(e.owner).light, 60, { life: 0.3, size: 1.6, type: 'spark' });
          break;
        }
        case 'clash':
          this.burst(e.x, e.y - 6, 4, Math.random() < 0.5 ? '#fff6c8' : '#ffb347', 70, { life: 0.28, size: 1.6, type: 'spark' });
          if (Math.random() < 0.4) this.part({ x: e.x + (Math.random() - 0.5) * 8, y: e.y - 10, vx: (Math.random() - 0.5) * 40, vy: -45, g: 90, drag: 2, life: 0.5, size: 2.3, col: Math.random() < 0.5 ? '#ffffff' : '#ffe14a', type: 'star', rot: Math.random() * 3 });
          if (Math.random() < 0.3) this.burst(e.x, e.y, 2, 'rgba(200,180,140,0.6)', 20, { life: 0.5, size: 3, type: 'dust' });
          break;
        case 'capture': {
          const b = e.b, col = F(e.to).color;
          this.part({ x: b.x, y: b.y, type: 'ring', col, life: 0.7, size: 70 });
          for (let i = 0; i < 26; i++) {
            const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, v = 60 + Math.random() * 120;
            this.part({ x: b.x, y: b.y - 30, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1.3, size: 3, col: [col, F(e.to).light, '#ffffff', '#ffd23f'][i % 4], type: 'confetti', g: 160, drag: 1.4, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 16 });
          }
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * U.TAU;
            this.part({ x: b.x, y: b.y - 34, vx: Math.cos(a) * 110, vy: Math.sin(a) * 70, drag: 3.2, life: 0.7, size: 3.2, col: i % 2 ? '#ffffff' : '#ffe14a', type: 'star', rot: a });
          }
          if (e.to === P) this.text(b.x, b.y - 70, '¡Conquistado!', '#ffe9a6', 15, 1.4);
          else if (e.from === P) this.text(b.x, b.y - 70, '¡Perdido!', '#ff9a8a', 15, 1.4);
          break;
        }
        case 'upgrade': {
          const b = e.b;
          this.part({ x: b.x, y: b.y, type: 'ring', col: '#ffd76a', life: 0.6, size: 56 });
          for (let i = 0; i < 18; i++) this.part({ x: b.x + (Math.random() - 0.5) * 46, y: b.y - Math.random() * 40, vx: 0, vy: -30 - Math.random() * 40, life: 1, size: 2.2, col: '#ffe48a', type: 'star' });
          if (e.owner === P) this.text(b.x, b.y - 74, 'Nivel ' + b.level, '#fff2b8', 14, 1.2);
          break;
        }
        case 'spell': this.spellFx(e); break;
        case 'meteorHit': {
          this.shake = 0.5; this.flash = 0.35; this.flashCol = '#ffb35a';
          this.part({ x: e.x, y: e.y, type: 'ring', col: '#ffcf6a', life: 0.8, size: FF.SPELLS.meteoro.radius * 1.3 });
          for (let i = 0; i < 60; i++) {
            const a = Math.random() * U.TAU, v = 40 + Math.random() * 200;
            this.part({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - 60, life: 0.5 + Math.random() * 0.8, size: 2 + Math.random() * 4, col: ['#fff1a0', '#ffb31a', '#ff5a0a', '#7a1600'][i % 4], type: 'fire', g: 120, drag: 1.8 });
          }
          for (let i = 0; i < 18; i++) this.part({ x: e.x + (Math.random() - 0.5) * 60, y: e.y + (Math.random() - 0.5) * 30, vx: 0, vy: -15, life: 2.5, size: 10 + Math.random() * 10, col: 'rgba(60,50,45,0.5)', type: 'smoke' });
          this.decals.push({ type: 'scorch', x: e.x, y: e.y, r: 60, age: 0, dur: 25 });
          break;
        }
        case 'shieldBlock':
          this.burst(e.b.x + (Math.random() - 0.5) * 30, e.b.y - 20, 3, '#fff3b0', 60, { life: 0.3, size: 1.6, type: 'spark' });
          break;
        case 'eliminated':
          break;
      }
    }

    spellFx(e) {
      switch (e.key) {
        case 'rayo': {
          const pts = [];
          let x = e.x + (Math.random() - 0.5) * 80, y = -20;
          const ty = e.y - 30;
          while (y < ty) { pts.push({ x, y }); y += 20 + Math.random() * 25; x += (Math.random() - 0.5) * 34; x += (e.x - x) * 0.25; }
          pts.push({ x: e.x, y: ty });
          this.bolts.push({ pts, age: 0, dur: 0.45 });
          this.flash = 0.3; this.flashCol = '#e8f0ff'; this.shake = 0.25;
          this.burst(e.x, e.y - 20, 30, '#cfe3ff', 140, { life: 0.5, size: 2, type: 'spark' });
          for (let i = 0; i < 8; i++) this.part({ x: e.x + (Math.random() - 0.5) * 30, y: e.y - 20, vx: 0, vy: -20, life: 1.6, size: 8, col: 'rgba(70,70,80,0.5)', type: 'smoke' });
          break;
        }
        case 'escudo':
          this.part({ x: e.x, y: e.y, type: 'ring', col: '#fff1b0', life: 0.7, size: 70 });
          this.burst(e.x, e.y - 30, 24, '#fff6c8', 80, { life: 0.8, size: 2, type: 'star' });
          break;
        case 'sopor':
          for (let i = 0; i < 26; i++) this.part({ x: e.x + (Math.random() - 0.5) * 60, y: e.y - Math.random() * 40, vx: (Math.random() - 0.5) * 20, vy: -20 - Math.random() * 20, life: 1.4, size: 6 + Math.random() * 8, col: 'rgba(160,110,230,0.35)', type: 'smoke' });
          break;
        case 'ventisca': {
          const R = FF.SPELLS.ventisca.radius;
          this.part({ x: e.x, y: e.y, type: 'ring', col: '#d8f0ff', life: 0.8, size: R * 1.25 });
          for (let i = 0; i < 90; i++) {
            const a = Math.random() * U.TAU, r = Math.random() * R;
            this.part({ x: e.x + Math.cos(a) * r, y: e.y + Math.sin(a) * r * 0.7 - 20, vx: Math.cos(a + 1.6) * 60, vy: Math.sin(a + 1.6) * 30 + 10, life: 1.2 + Math.random(), size: 1.5 + Math.random() * 2, col: '#ffffff', type: 'snow' });
          }
          this.flash = 0.2; this.flashCol = '#dff3ff';
          break;
        }
        case 'meteoro':
          this.meteors.push({ x: e.x, y: e.y, age: 0, dur: 0.75, sx: e.x + 360, sy: e.y - 560 });
          break;
      }
    }

    /* ---------- dibujo ---------- */
    frame(dt, ui) {
      const ctx = this.ctx, g = this.game;
      this.t += dt;
      const t = this.t;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#0d0b0a';
      ctx.fillRect(0, 0, this.cv.width, this.cv.height);
      if (A.dirty) {
        A.dirty = false;
        A.clearCache(); this.glowC = {}; this.resetCaches();
        if (g) this.buildTerrain(this.terrainR || 1);
      }
      if (!g || !this.terrain) return;
      /* imágenes que hará falta dibujar: se preparan poco a poco al empezar, no en mitad de una batalla */
      if (this.prewarm && this.prewarm.length) {
        const t0 = performance.now();
        while (this.prewarm.length && performance.now() - t0 < 4) this.prewarm.pop()();
      }
      const D = this.dpr, s = this.s;
      const TE = this.terrain.ext || { x: 0, y: 0 };
      const base = this.life ? this.life.baseCanvas(this.terrain.canvas) : this.terrain.canvas;
      /* si el terreno no llega a cubrir la pantalla (ventanas muy estiradas), se rellena con él difuminado */
      if (this.ox / s > TE.x + 1 || this.oy / s > TE.y + 1) {
        const cs = Math.max(this.cssW / WW, this.cssH / WH);
        ctx.setTransform(D * cs, 0, 0, D * cs, D * (this.cssW - WW * cs) / 2, D * (this.cssH - WH * cs) / 2);
        ctx.globalAlpha = 0.55; ctx.drawImage(base, -TE.x, -TE.y, WW + 2 * TE.x, WH + 2 * TE.y); ctx.globalAlpha = 1;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = 'rgba(10,6,2,0.62)'; ctx.fillRect(0, 0, this.cv.width, this.cv.height);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(D * (this.ox - 3), D * (this.oy - 3), D * (WW * s + 6), D * (WH * s + 6));
      }
      let shx = 0, shy = 0;
      if (this.shake > 0) { this.shake -= dt; const k = this.shake * 10; shx = (Math.random() - 0.5) * k; shy = (Math.random() - 0.5) * k; }
      ctx.setTransform(D * s, 0, 0, D * s, D * (this.ox + shx), D * (this.oy + shy));
      this.M.m = D * s; this.M.tx = D * (this.ox + shx); this.M.ty = D * (this.oy + shy);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'medium';
      ctx.drawImage(base, -TE.x, -TE.y, WW + 2 * TE.x, WH + 2 * TE.y);
      this.fdt = Math.min(0.1, Math.max(0, t - (this.lastT == null ? t : this.lastT))); this.lastT = t;
      this.drawWaterFx(ctx, t);
      if (this.life) this.life.ground(ctx, dt, this.M);
      this.drawDecals(ctx, dt);
      this.drawUnder(ctx, ui);
      this.drawWorld(ctx, ui, dt);
      this.drawArrows(ctx);
      this.drawBolts(ctx, dt);
      this.drawParticles(ctx, dt);
      if (this.life) this.life.sky(ctx, dt);
      this.drawStatus(ctx);
      this.drawBadges(ctx, ui);
      this.drawOver(ctx, ui);
      this.drawTexts(ctx, dt);
      this.drawAmbient(ctx, dt);
      if (this.flash > 0) {
        ctx.save(); ctx.globalAlpha = Math.min(1, this.flash * 2); ctx.fillStyle = this.flashCol; ctx.fillRect(-WW, -WH, WW * 3, WH * 3); ctx.restore();
        this.flash -= dt;
      }
    }

    drawWaterFx(ctx, t) {
      const T = this.terrain;
      if (this.quality !== 'baja' && T.shimmer.length) {
        ctx.save();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
        const lv = [0.12, 0.3, 0.5];
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          let any = false;
          T.shimmer.forEach((p) => {
            const a = 0.5 + 0.5 * Math.sin(t * 1.6 + p.p);
            if (a < 0.35) return;
            const al = (a - 0.35) * 0.9, bk = al < 0.2 ? 0 : al < 0.4 ? 1 : 2;
            if (bk !== k) return;
            const dx = Math.sin(t * 0.7 + p.p) * 3;
            ctx.moveTo(p.x - p.l / 2 + dx, p.y); ctx.lineTo(p.x + p.l / 2 + dx, p.y); any = true;
          });
          if (any) { ctx.globalAlpha = lv[k]; ctx.stroke(); }
        }
        ctx.restore();
      }
      if (T.lava.length) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < T.lava.length; i += 2) {
          const p = T.lava[i];
          this.glow(ctx, p.x, p.y, p.r * 1.25, 'rgba(255,200,80,1)', 'rgba(255,80,0,0)', 0.22 + 0.14 * Math.sin(t * 2.2 + p.p));
        }
        T.glows.forEach((p, i) => this.glow(ctx, p.x, p.y, 14, 'rgba(255,150,60,1)', 'rgba(255,60,0,0)', 0.2 + 0.15 * Math.sin(t * 3 + i)));
        ctx.restore();
      }
      /* humo de fumarolas */
      if (T.vents.length && this.quality !== 'baja') {
        T.vents.forEach((v, i) => {
          if (Math.random() < this.fdt * 2.2) this.part({ x: v.x, y: v.y, vx: (Math.random() - 0.5) * 6, vy: -14, life: 2.4, size: 4, col: 'rgba(90,80,80,0.35)', type: 'smoke' });
        });
      }
    }

    drawDecals(ctx, dt) {
      for (let i = this.decals.length - 1; i >= 0; i--) {
        const d = this.decals[i];
        d.age += dt;
        if (d.age > d.dur) { this.decals.splice(i, 1); continue; }
        const a = 1 - Math.max(0, (d.age - d.dur * 0.6) / (d.dur * 0.4));
        ctx.save(); ctx.globalAlpha = a;
        if (d.type === 'scorch') {
          const gr = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
          gr.addColorStop(0, 'rgba(20,10,5,0.6)'); gr.addColorStop(0.7, 'rgba(30,15,5,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * 0.6, 0, 0, U.TAU); ctx.fill();
        } else if (d.type === 'arrow') {
          ctx.translate(d.x, d.y); ctx.rotate(d.a);
          ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -7); ctx.stroke();
          ctx.fillStyle = '#efe6d2'; ctx.fillRect(-1.2, -8, 2.4, 2);
        }
        ctx.restore();
      }
    }

    /* anillos de selección, rutas previstas y alcance de atalayas */
    drawUnder(ctx, ui) {
      const g = this.game, t = this.t, K = this.uiK;
      const P = g.player;
      const sel = ui.selected;
      if (ui.hoverTower != null) {
        const b = g.buildings[ui.hoverTower];
        const r = b.stat.range;
        ctx.save();
        ctx.beginPath(); ctx.ellipse(b.x, b.y, r, r * 0.92, 0, 0, U.TAU);
        ctx.fillStyle = U.rgba(FF.FACTIONS[b.owner].color, 0.08); ctx.fill();
        ctx.setLineDash([6, 6]); ctx.lineDashOffset = -t * 20;
        ctx.strokeStyle = U.rgba(FF.FACTIONS[b.owner].light, 0.6); ctx.lineWidth = 1.5; ctx.stroke();
        ctx.restore();
      }
      sel.forEach((id) => {
        const b = g.buildings[id];
        ctx.save();
        ctx.translate(b.x, b.y + 3);
        const pulse = 1 + Math.sin(t * 6) * 0.04;
        ctx.scale(pulse, pulse);
        const rx = 40 * K * 0.8 + 6, ry = 15 * K * 0.8 + 3;
        ctx.save(); ctx.scale(1, ry / rx); this.glow(ctx, 0, 0, rx * 1.15, 'rgba(255,230,140,0.42)', 'rgba(255,214,100,0)', 1); ctx.restore();
        ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, U.TAU);
        ctx.strokeStyle = 'rgba(255,200,80,0.4)'; ctx.lineWidth = 6.5; ctx.stroke();
        ctx.strokeStyle = '#ffe48a'; ctx.lineWidth = 2.4; ctx.stroke();
        ctx.setLineDash([3, 9]); ctx.lineDashOffset = -t * 18;
        ctx.strokeStyle = '#fffbe8'; ctx.lineWidth = 1.6; ctx.stroke();
        ctx.restore();
      });
      /* destino bajo el puntero */
      if (ui.hover != null && !ui.targeting) {
        const b = g.buildings[ui.hover];
        if (b.owner === P && !sel.has(b.id) && !ui.dragging) {
          ctx.save(); ctx.translate(b.x, b.y + 3);
          ctx.beginPath(); ctx.ellipse(0, 0, 42, 16, 0, 0, U.TAU);
          ctx.strokeStyle = 'rgba(255,240,190,0.55)'; ctx.lineWidth = 1.6; ctx.setLineDash([5, 6]); ctx.stroke();
          ctx.restore();
        }
      }
      if (ui.hover != null && (sel.size || ui.dragging)) {
        const b = g.buildings[ui.hover];
        if ((!sel.has(b.id) && b.owner !== P) || ui.dragging) {
          const col = b.owner === P ? '#8fc0ff' : b.owner === 0 ? '#f4efe2' : '#ff7a6a';
          ctx.save(); ctx.translate(b.x, b.y + 3);
          ctx.beginPath(); ctx.ellipse(0, 0, 44, 17, 0, 0, U.TAU);
          ctx.strokeStyle = ui.reachable ? col : 'rgba(255,90,70,0.85)'; ctx.lineWidth = 2.6;
          if (!ui.reachable) ctx.setLineDash([4, 5]);
          ctx.stroke();
          ctx.restore();
        }
      }
      /* rutas previstas */
      if (ui.preview && ui.preview.length) {
        ctx.save();
        ctx.lineCap = 'round';
        ui.preview.forEach((route) => {
          ctx.beginPath();
          const pts = route.pts;
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i += 2) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
          ctx.setLineDash([2, 9]); ctx.lineDashOffset = -t * 30;
          ctx.strokeStyle = 'rgba(255,248,220,0.95)'; ctx.lineWidth = 4.2; ctx.stroke();
        });
        ctx.restore();
      }
    }

    drawWorld(ctx, ui, dt) {
      const g = this.game, t = this.t;
      const list = this.draw;
      list.length = 0;
      g.buildings.forEach((b) => list.push({ y: b.y, b }));
      const p = this.tmp;
      for (let i = 0; i < g.squads.length; i++) {
        const sq = g.squads[i];
        const moving = !sq.engaged && sq.frozenUntil < g.time;
        const u = sq.u;
        for (let k = sq.k0; k < sq.k0 + sq.count; k++) {
          const d = sq.posOf(k);
          if (d < 0) continue;
          if (d > sq.len) continue;
          sq.route.at(Math.min(d, sq.len), p);
          const col = k % u.rowW;
          const lat = (col - (u.rowW - 1) / 2) * u.latSp;
          const nx = -Math.sin(p.a), ny = Math.cos(p.a);
          const x = p.x + nx * lat, y = p.y + ny * lat;
          const fr = moving ? Math.floor((t * (sq.ut === 'jinete' ? 15 : 11) + k * 0.53) % A.FRAMES) : 0;
          list.push({ y, ux: x, uy: y, ut: sq.ut, o: sq.owner, fr, flip: Math.cos(p.a) < 0, frozen: sq.frozenUntil > g.time });
        }
      }
      if (this.life) this.life.worldItems(list);
      list.sort((a, b) => a.y - b.y);
      for (let i = 0; i < list.length; i++) {
        const it = list[i];
        if (it.b) this.drawBuilding(ctx, it.b, ui);
        else if (it.lf) this.life.drawItem(ctx, it.lf);
        else {
          const s = A.unit(it.ut, it.o, it.fr, it.flip);
          const us = A.UNIT_SCALE;
          ctx.drawImage(s.c, it.ux - s.ax * us, it.uy - s.ay * us, s.w * us, s.h * us);
          if (it.frozen) {
            ctx.fillStyle = 'rgba(190,230,255,0.55)';
            ctx.fillRect(it.ux - 4, it.uy - 13, 8, 13);
            ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.6; ctx.strokeRect(it.ux - 4, it.uy - 13, 8, 13);
          }
        }
      }
    }

    drawBuilding(ctx, b, ui) {
      const g = this.game, t = this.t, gt = g.time;
      const s = A.building(b.type, b.level, b.owner);
      let sc = BSCALE, sxk = 1, syk = 1;
      const sinceCap = gt - b.capT, sinceUp = gt - b.upT, sinceSend = gt - (b.sendT == null ? -9 : b.sendT);
      if (sinceCap >= 0 && sinceCap < 0.55) { const q = sinceCap / 0.55, w = Math.sin(q * Math.PI * 2) * (1 - q); sc *= 1 + 0.14 * Math.sin(q * Math.PI); sxk -= 0.1 * w; syk += 0.14 * w; }
      if (sinceUp >= 0 && sinceUp < 0.5) { const q = sinceUp / 0.5; sc *= 1 + 0.12 * Math.sin(q * Math.PI); syk += 0.08 * Math.sin(q * Math.PI * 2) * (1 - q); }
      if (sinceSend >= 0 && sinceSend < 0.3) { const q = Math.sin((sinceSend / 0.3) * Math.PI); sxk += 0.06 * q; syk -= 0.08 * q; }
      let dx = 0;
      const sinceHit = gt - b.hitT;
      if (sinceHit >= 0 && sinceHit < 0.18) dx = Math.sin(sinceHit * 90) * 1.6;
      /* los edificios con dueño están vivos: «respiran» y se balancean suavemente, cada uno a su
         ritmo; los neutrales, grises y vacíos, se quedan quietos */
      let sk = 0;
      if (b.owner !== 0) {
        const ph = b.id * 2.39, br = Math.sin(t * 2.1 + ph);
        syk *= 1 + 0.016 * br; sxk *= 1 - 0.009 * br;
        sk = 0.024 * Math.sin(t * 1.35 + ph * 1.7);
      }
      ctx.save();
      ctx.translate(b.x + dx, b.y);
      if (sk) ctx.transform(1, 0, sk, 1, 0, 0);
      ctx.scale(sc * sxk, sc * syk);
      ctx.drawImage(s.c, -s.ax, -s.ay, s.w, s.h);
      const m = s.meta;
      /* bandera ondeante (fotogramas precalculados) */
      if (m.flag) {
        const fr = this.flagFrame(b.owner, t * 6 + b.id);
        ctx.drawImage(fr.c, m.flag.x + fr.ox, m.flag.y + fr.oy, fr.w, fr.h);
      }
      /* resplandor de la fragua */
      if (m.glow.length && b.owner !== 0) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        m.glow.forEach((gl, i) => this.glow(ctx, gl.x, gl.y, gl.r, 'rgba(255,170,60,1)', 'rgba(255,80,0,0)', 0.35 + 0.2 * Math.sin(t * 7 + i * 2 + b.id)));
        ctx.restore();
      }
      ctx.restore();
      /* humo de chimeneas */
      if (this.quality !== 'baja' && m.smoke.length) {
        const key = b.id;
        this.smokeT[key] = (this.smokeT[key] || Math.random()) - (this.fdt || 1 / 60);
        if (this.smokeT[key] <= 0) {
          this.smokeT[key] = (b.owner === 0 ? 1.4 : 0.6) * (0.7 + Math.random() * 0.6) * (this.quality === 'media' ? 1.6 : 1);
          m.smoke.forEach((sm) => {
            if (!sm) return;
            const x = b.x + sm.x * BSCALE, y = b.y + sm.y * BSCALE;
            this.part({ x, y, vx: 4 + Math.random() * 3, vy: -12 - Math.random() * 6, life: 2.2, size: 2.5, col: sm.dark ? 'rgba(70,64,60,0.45)' : 'rgba(235,235,235,0.45)', type: 'smoke' });
            if (sm.dark && b.owner !== 0 && Math.random() < 0.5) this.part({ x, y, vx: (Math.random() - 0.5) * 10, vy: -30, life: 0.9, size: 1.3, col: '#ffb347', type: 'ember' });
          });
        }
      }
    }

    drawArrows(ctx) {
      const g = this.game;
      ctx.save();
      ctx.lineCap = 'round';
      const pos = (a, k) => ({ x: U.lerp(a.sx, a.tx, k), y: U.lerp(a.sy, a.ty - 7, k) - Math.sin(k * Math.PI) * (22 + (a.lvl || 1) * 4) });
      g.arrows.forEach((a) => {
        const k = U.clamp(a.t / a.dur, 0, 1);
        const p = pos(a, k), q = pos(a, Math.max(0, k - 0.03));
        const ang = Math.atan2(p.y - q.y, p.x - q.x);
        const lvl = a.lvl || 1;
        const F = FF.FACTIONS[a.owner];
        if (lvl >= 2) {
          /* estela */
          ctx.save();
          ctx.globalCompositeOperation = lvl >= 3 ? 'lighter' : 'source-over';
          for (let j = 1; j <= 5; j++) {
            const r = pos(a, Math.max(0, k - j * 0.035));
            ctx.globalAlpha = (lvl >= 3 ? 0.55 : 0.28) * (1 - j / 6);
            ctx.fillStyle = lvl >= 3 ? (a.owner ? F.light : '#dff3ff') : '#fff8e6';
            ctx.beginPath(); ctx.arc(r.x, r.y, (lvl >= 3 ? 2.4 : 1.3) * (1 - j / 7), 0, U.TAU); ctx.fill();
          }
          ctx.restore();
        }
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(ang);
        const L = lvl >= 3 ? 15 : lvl === 2 ? 13 : 11;
        if (lvl >= 3) {
          ctx.globalCompositeOperation = 'lighter';
          this.glow(ctx, 0, 0, 8, 'rgba(255,255,255,1)', U.rgba(a.owner ? F.light : '#bfe6ff', 0), 0.9);
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.strokeStyle = 'rgba(30,18,8,0.75)'; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(0, 0); ctx.stroke();
        ctx.strokeStyle = lvl >= 3 ? '#e9dcc0' : lvl === 2 ? '#a77846' : '#8a5a2e'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(0, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(4.2, 0); ctx.lineTo(-0.6, -1.9); ctx.lineTo(0.4, 0); ctx.lineTo(-0.6, 1.9); ctx.closePath();
        ctx.fillStyle = lvl >= 3 ? '#ffffff' : '#dfe4ea'; ctx.fill();
        ctx.strokeStyle = 'rgba(30,18,8,0.6)'; ctx.lineWidth = 0.5; ctx.stroke();
        ctx.fillStyle = lvl >= 3 ? (a.owner ? F.color : '#9ad6ff') : '#efe6d2';
        ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(-L - 2.6, -1.7); ctx.lineTo(-L + 1.6, 0); ctx.lineTo(-L - 2.6, 1.7); ctx.closePath(); ctx.fill();
        ctx.restore();
      });
      ctx.restore();
    }

    drawBolts(ctx, dt) {
      for (let i = this.bolts.length - 1; i >= 0; i--) {
        const b = this.bolts[i];
        b.age += dt;
        if (b.age > b.dur) { this.bolts.splice(i, 1); continue; }
        const a = 1 - b.age / b.dur;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        [[9, 'rgba(120,170,255,' + 0.35 * a + ')'], [4, 'rgba(200,225,255,' + 0.8 * a + ')'], [1.6, 'rgba(255,255,255,' + a + ')']].forEach((st) => {
          ctx.beginPath(); ctx.moveTo(b.pts[0].x, b.pts[0].y);
          b.pts.forEach((p) => ctx.lineTo(p.x + (Math.random() - 0.5) * 2, p.y));
          ctx.strokeStyle = st[1]; ctx.lineWidth = st[0]; ctx.lineJoin = 'round'; ctx.stroke();
        });
        ctx.restore();
      }
      for (let i = this.meteors.length - 1; i >= 0; i--) {
        const m = this.meteors[i];
        m.age += dt;
        if (m.age > m.dur) { this.meteors.splice(i, 1); continue; }
        const k = U.easeInCubic(m.age / m.dur);
        const x = U.lerp(m.sx, m.x, k), y = U.lerp(m.sy, m.y, k);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        this.glow(ctx, x, y, 26, 'rgba(255,240,170,1)', 'rgba(255,60,0,0)', 1);
        this.glow(ctx, x, y, 10, 'rgba(255,255,230,1)', 'rgba(255,200,90,0)', 1);
        ctx.restore();
        for (let j = 0; j < 3; j++) this.part({ x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 10, vx: 30, vy: -40, life: 0.5, size: 4 + Math.random() * 4, col: j ? '#ff8a1e' : 'rgba(80,60,50,0.6)', type: j ? 'fire' : 'smoke' });
        /* sombra que crece en el punto de impacto */
        ctx.save(); ctx.globalAlpha = 0.25 * k;
        ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(m.x, m.y, 40 * k, 16 * k, 0, 0, U.TAU); ctx.fill();
        ctx.restore();
      }
    }

    drawParticles(ctx, dt) {
      const ps = this.parts;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.age += dt;
        if (p.age >= p.life) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
        const k = p.age / p.life;
        if (p.vx != null) {
          const dr = Math.exp(-(p.drag || 0) * dt);
          p.vx *= dr; p.vy *= dr; p.vy += (p.g || 0) * dt;
          p.x += p.vx * dt; p.y += p.vy * dt;
        }
        ctx.globalAlpha = 1;
        switch (p.type) {
          case 'ring': {
            ctx.globalAlpha = 1 - k;
            ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size * U.easeOutCubic(k) + 4, (p.size * U.easeOutCubic(k) + 4) * 0.42, 0, 0, U.TAU);
            ctx.strokeStyle = p.col; ctx.lineWidth = 3 * (1 - k) + 0.5; ctx.stroke();
            break;
          }
          case 'smoke': {
            ctx.globalAlpha = (1 - k) * (k < 0.15 ? k / 0.15 : 1);
            const r = p.size * (1 + k * 2.2) * 1.25;
            ctx.drawImage(this.dotSpr(p.col, true), p.x - r, p.y - r, r * 2, r * 2);
            break;
          }
          case 'confetti': {
            p.rot += p.vr * dt;
            ctx.globalAlpha = 1 - k * k;
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.cos(p.rot * 1.7));
            ctx.fillStyle = p.col; ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
            ctx.restore();
            break;
          }
          case 'spark': {
            ctx.globalAlpha = 1 - k;
            ctx.strokeStyle = p.col; ctx.lineWidth = p.size * 0.7;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); ctx.stroke();
            break;
          }
          case 'star': {
            ctx.globalAlpha = 1 - k * k;
            const r = p.size * (k < 0.15 ? 0.5 + k / 0.3 : 1 - (k - 0.15) * 0.5);
            ctx.save(); ctx.translate(p.x, p.y); ctx.rotate((p.rot || 0) + p.age * 5);
            ctx.beginPath(); ctx.moveTo(0, -r * 2); ctx.lineTo(r * 0.5, -r * 0.5); ctx.lineTo(r * 2, 0); ctx.lineTo(r * 0.5, r * 0.5);
            ctx.lineTo(0, r * 2); ctx.lineTo(-r * 0.5, r * 0.5); ctx.lineTo(-r * 2, 0); ctx.lineTo(-r * 0.5, -r * 0.5); ctx.closePath();
            ctx.fillStyle = p.col; ctx.fill();
            ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(110,60,0,0.55)'; ctx.stroke();
            ctx.restore();
            break;
          }
          case 'fire': case 'ember': {
            ctx.globalAlpha = 1 - k;
            const r = p.size * (1 - k * 0.6);
            ctx.drawImage(this.dotSpr(p.col, false), p.x - r, p.y - r, r * 2, r * 2);
            break;
          }
          case 'snow': {
            ctx.globalAlpha = 1 - k;
            ctx.fillStyle = p.col; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
            break;
          }
          case 'dust': {
            ctx.globalAlpha = (1 - k) * 0.8;
            const r = p.size * (1 + k) * 1.2;
            ctx.drawImage(this.dotSpr(p.col, true), p.x - r, p.y - r, r * 2, r * 2);
            break;
          }
          default: {
            ctx.globalAlpha = 1 - k;
            ctx.drawImage(this.dotSpr(p.col, false), p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    /* escudos, sueño y hielo sobre los edificios */
    drawStatus(ctx) {
      const g = this.game, gt = g.time, t = this.t;
      g.buildings.forEach((b) => {
        if (b.shieldUntil > gt) {
          const left = b.shieldUntil - gt;
          const a = left < 2 ? 0.5 + 0.5 * Math.sin(t * 20) : 1;
          ctx.save(); ctx.globalAlpha = 0.85 * a;
          const r = 48;
          const gr = ctx.createRadialGradient(b.x - 12, b.y - 40, 4, b.x, b.y - 20, r);
          gr.addColorStop(0, 'rgba(255,255,230,0.35)'); gr.addColorStop(0.8, 'rgba(255,225,120,0.18)'); gr.addColorStop(1, 'rgba(255,220,110,0.5)');
          ctx.fillStyle = gr;
          ctx.beginPath(); ctx.ellipse(b.x, b.y - 16, r, r * 1.05, 0, Math.PI, 0); ctx.ellipse(b.x, b.y - 16, r, r * 0.38, 0, 0, Math.PI); ctx.fill();
          ctx.strokeStyle = 'rgba(255,240,170,0.9)'; ctx.lineWidth = 1.6; ctx.stroke();
          ctx.restore();
        }
        if (b.sleepUntil > gt) {
          ctx.save();
          ctx.globalAlpha = 0.3;
          ctx.fillStyle = '#7b4ad0';
          ctx.beginPath(); ctx.ellipse(b.x, b.y - 18, 40, 30, 0, 0, U.TAU); ctx.fill();
          ctx.globalAlpha = 1;
          ctx.font = 'bold 13px Georgia, serif'; ctx.fillStyle = '#e8d6ff'; ctx.textAlign = 'center';
          for (let i = 0; i < 3; i++) {
            const k = ((t * 0.6 + i / 3) % 1);
            ctx.globalAlpha = Math.sin(k * Math.PI);
            ctx.fillText('z', b.x + 14 + k * 10 + i * 3, b.y - 50 - k * 26);
          }
          ctx.restore();
        }
        if (b.iceUntil > gt) {
          ctx.save(); ctx.globalAlpha = 0.45;
          ctx.fillStyle = '#c6ecff';
          ctx.beginPath(); ctx.ellipse(b.x, b.y - 14, 42, 28, 0, 0, U.TAU); ctx.fill();
          ctx.globalAlpha = 0.9; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
          for (let i = 0; i < 5; i++) {
            const a = i * 1.25 + b.id;
            ctx.beginPath(); ctx.moveTo(b.x + Math.cos(a) * 30, b.y - 14 + Math.sin(a) * 18); ctx.lineTo(b.x + Math.cos(a) * 38, b.y - 24 + Math.sin(a) * 18); ctx.stroke();
          }
          ctx.restore();
        }
      });
    }

    /* placas de tropas con ribete dorado, estrellas de mejora y botón de mejora.
       Cada placa se dibuja una vez en una imagen y se reutiliza mientras su número, su barra
       y sus estrellas no cambien: es lo que más ahorra en cada fotograma. */
    badgeSprite(b, K, P) {
      const n = Math.floor(b.troops), cap = b.cap;
      const fq = Math.round(Math.min(1, b.troops / cap) * 24);
      const key = b.owner + '|' + n + '|' + fq + '|' + (b.troops > cap ? 1 : 0) + '|' + b.level + '|' + b.maxLevel + '|' + (b.owner === P ? 1 : 0);
      let spr = this.badgeC.get(key);
      if (spr) return spr;
      if (this.badgeC.size > 900) this.badgeC.clear();
      const str = String(n);
      const w = (17 + str.length * 7.4) * K, h = 17.5 * K;
      const hw = w / 2, hh = h / 2, r = 5.5 * K;
      const left = -hw - 3 * K, top = -hh - 11 * K, BW = w + 6 * K, BH = h + 21 * K;
      const sc = Math.max(1, this.dpr * this.s);
      const cv = document.createElement('canvas');
      cv.width = Math.ceil(BW * sc); cv.height = Math.ceil(BH * sc);
      const ctx = cv.getContext('2d');
      ctx.scale(sc, sc); ctx.translate(-left, -top);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      const font = 'bold ' + Math.round(12.5 * K) + 'px "Trebuchet MS", "Segoe UI", sans-serif';
      const F = FF.FACTIONS[b.owner];
      const star = (x, y, R, r) => {
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r : R;
          ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        ctx.closePath();
      };
      const rrect = (x, y, w, h, r) => {
        ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(x + r, y + h); ctx.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5); ctx.closePath();
      };
        const plaque = () => {
          ctx.beginPath();
          ctx.moveTo(-hw + r, -hh); ctx.lineTo(hw - r, -hh); ctx.quadraticCurveTo(hw, -hh, hw, -hh + r);
          ctx.lineTo(hw, hh - r); ctx.quadraticCurveTo(hw, hh, hw - r, hh);
          ctx.lineTo(3.2 * K, hh); ctx.lineTo(0, hh + 3.2 * K); ctx.lineTo(-3.2 * K, hh);
          ctx.lineTo(-hw + r, hh); ctx.quadraticCurveTo(-hw, hh, -hw, hh - r);
          ctx.lineTo(-hw, -hh + r); ctx.quadraticCurveTo(-hw, -hh, -hw + r, -hh); ctx.closePath();
        };
        ctx.save(); ctx.translate(0.6 * K, 1.8 * K); plaque(); ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fill(); ctx.restore();
        plaque();
        const gr = ctx.createLinearGradient(0, -hh, 0, hh);
        if (b.owner === 0) { gr.addColorStop(0, '#a7a092'); gr.addColorStop(1, '#58534a'); }
        else { gr.addColorStop(0, U.shade(F.color, 0.22)); gr.addColorStop(0.55, F.color); gr.addColorStop(1, F.dark); }
        ctx.fillStyle = gr; ctx.fill();
        ctx.lineWidth = 2.8 * K; ctx.strokeStyle = 'rgba(36,20,6,0.92)'; ctx.stroke();
        ctx.lineWidth = 1.15 * K;
        ctx.strokeStyle = b.owner === P ? '#ffe39a' : b.owner === 0 ? 'rgba(236,230,214,0.85)' : U.mix(F.light, '#f2cf6e', 0.55);
        ctx.stroke();
        ctx.save(); plaque(); ctx.clip();
        const gl = ctx.createLinearGradient(0, -hh, 0, 0.5 * K);
        gl.addColorStop(0, 'rgba(255,255,255,0.5)'); gl.addColorStop(1, 'rgba(255,255,255,0.03)');
        ctx.fillStyle = gl; ctx.fillRect(-hw, -hh, w, hh + 0.5 * K);
        ctx.restore();
        ctx.font = font;
        ctx.lineWidth = 2.4 * K; ctx.strokeStyle = 'rgba(22,12,4,0.8)';
        ctx.strokeText(str, 0, 0.7 * K);
        ctx.fillStyle = '#ffffff'; ctx.fillText(str, 0, 0.7 * K);
        /* barra de capacidad */
        const bw = w - 6 * K, by = hh + 4.6 * K, bh = 2.9 * K;
        rrect(-bw / 2, by, bw, bh, bh / 2); ctx.fillStyle = 'rgba(20,12,4,0.7)'; ctx.fill();
        const fr = Math.min(1, b.troops / cap);
        if (fr > 0.02) {
          rrect(-bw / 2, by, Math.max(bh, bw * fr), bh, bh / 2);
          const bg = ctx.createLinearGradient(0, by, 0, by + bh);
          if (b.troops > cap) { bg.addColorStop(0, '#fff2a8'); bg.addColorStop(1, '#e09a1c'); }
          else if (b.owner === 0) { bg.addColorStop(0, '#f0ebe0'); bg.addColorStop(1, '#a8a293'); }
          else { bg.addColorStop(0, F.light); bg.addColorStop(1, F.color); }
          ctx.fillStyle = bg; ctx.fill();
        }
        /* estrellas: una por cada mejora conseguida */
        const ml = b.maxLevel - 1;
        for (let i = 0; i < ml; i++) {
          const px = (i - (ml - 1) / 2) * 8.6 * K, py = -hh - 5.6 * K;
          star(px, py, 3.9 * K, 1.7 * K);
          if (i < b.level - 1) {
            const sg = ctx.createLinearGradient(0, py - 4 * K, 0, py + 3 * K);
            sg.addColorStop(0, '#fff6c2'); sg.addColorStop(0.5, '#ffd23e'); sg.addColorStop(1, '#c8861a');
            ctx.fillStyle = sg; ctx.fill();
            ctx.lineWidth = 0.9 * K; ctx.strokeStyle = 'rgba(70,40,0,0.95)'; ctx.stroke();
          } else {
            ctx.fillStyle = 'rgba(24,14,6,0.5)'; ctx.fill();
            ctx.lineWidth = 0.8 * K; ctx.strokeStyle = 'rgba(255,240,205,0.4)'; ctx.stroke();
          }
        }
      spr = { c: cv, x: left, y: top, w: BW, h: BH };
      this.badgeC.set(key, spr);
      return spr;
    }

    upSprite(K) {
      if (this.upC && this.upC.K === K && this.upC.sc === Math.max(1, this.dpr * this.s)) return this.upC;
      const rr = 8.8 * K, R = rr + 2, sc = Math.max(1, this.dpr * this.s);
      const cv = document.createElement('canvas');
      cv.width = cv.height = Math.ceil(R * 2 * sc);
      const ctx = cv.getContext('2d');
      ctx.scale(sc, sc); ctx.translate(R, R);
      const ux = 0, uy = 0;
          ctx.beginPath(); ctx.arc(ux, uy, rr, 0, U.TAU);
          const gg = ctx.createLinearGradient(0, uy - rr, 0, uy + rr);
          gg.addColorStop(0, '#fff2b0'); gg.addColorStop(0.5, '#f4c247'); gg.addColorStop(1, '#b8740e');
          ctx.fillStyle = gg; ctx.fill(); ctx.strokeStyle = '#4a2a00'; ctx.lineWidth = 1.3; ctx.stroke();
          ctx.beginPath(); ctx.arc(ux, uy - rr * 0.25, rr * 0.7, Math.PI * 1.1, Math.PI * 1.9); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ux, uy - rr * 0.58); ctx.lineTo(ux + rr * 0.5, uy + rr * 0.02); ctx.lineTo(ux + rr * 0.2, uy + rr * 0.02); ctx.lineTo(ux + rr * 0.2, uy + rr * 0.5);
          ctx.lineTo(ux - rr * 0.2, uy + rr * 0.5); ctx.lineTo(ux - rr * 0.2, uy + rr * 0.02); ctx.lineTo(ux - rr * 0.5, uy + rr * 0.02); ctx.closePath();
          ctx.fillStyle = '#5a3200'; ctx.fill();
      this.upC = { c: cv, r: R, K, sc };
      return this.upC;
    }

    drawBadges(ctx, ui) {
      const g = this.game, K = this.uiK, P = g.player, t = this.t;
      this.upButtons = [];
      g.buildings.forEach((b) => {
        const x = b.x, y = b.y + 17 * BSCALE + 4 * (K - 1);
        const spr = this.badgeSprite(b, K, P);
        ctx.drawImage(spr.c, x + spr.x, y + spr.y, spr.w, spr.h);
        if (b.owner === P && b.canUpgrade() && !g.over) {
          const hw = (17 + String(Math.floor(b.troops)).length * 7.4) * K / 2;
          const ux = x + hw + 10 * K, uy = y - 2 * K + Math.sin(t * 5 + b.id) * 1.5;
          const rr = 8.8 * K;
          this.glow(ctx, ux, uy, rr * 1.9, 'rgba(255,215,90,1)', 'rgba(255,215,90,0)', 0.42 + 0.2 * Math.sin(t * 6 + b.id));
          const us = this.upSprite(K);
          ctx.drawImage(us.c, ux - us.r, uy - us.r, us.r * 2, us.r * 2);
          this.upButtons.push({ id: b.id, x: ux, y: uy, r: rr + 4 });
        }
      });
    }

    /* líneas de arrastre y mira de hechizos */
    drawOver(ctx, ui) {
      const g = this.game, t = this.t;
      if (ui.dragging && ui.pointer) {
        ctx.save(); ctx.lineCap = 'round';
        ui.dragSources.forEach((id) => {
          const b = g.buildings[id];
          const tx = ui.pointer.x, ty = ui.pointer.y;
          const mx = (b.x + tx) / 2, my = (b.y + ty) / 2 - 40;
          ctx.beginPath(); ctx.moveTo(b.x, b.y - 10); ctx.quadraticCurveTo(mx, my, tx, ty);
          ctx.strokeStyle = 'rgba(30,20,10,0.35)'; ctx.lineWidth = 6; ctx.stroke();
          ctx.strokeStyle = '#ffe07a'; ctx.lineWidth = 3; ctx.setLineDash([10, 6]); ctx.lineDashOffset = -t * 40; ctx.stroke();
          ctx.setLineDash([]);
        });
        ctx.beginPath(); ctx.arc(ui.pointer.x, ui.pointer.y, 6, 0, U.TAU); ctx.fillStyle = '#ffe07a'; ctx.fill();
        ctx.restore();
      }
      if (ui.targeting && ui.pointer) {
        const sp = FF.SPELLS[ui.targeting];
        ctx.save();
        if (sp.target === 'area') {
          ctx.beginPath(); ctx.ellipse(ui.pointer.x, ui.pointer.y, sp.radius, sp.radius * 0.8, 0, 0, U.TAU);
          ctx.fillStyle = ui.targeting === 'meteoro' ? 'rgba(255,120,40,0.15)' : 'rgba(180,230,255,0.18)'; ctx.fill();
          ctx.setLineDash([8, 6]); ctx.lineDashOffset = -t * 30;
          ctx.strokeStyle = ui.targeting === 'meteoro' ? '#ffb35a' : '#dff3ff'; ctx.lineWidth = 2.4; ctx.stroke();
        } else if (ui.hover != null) {
          const b = g.buildings[ui.hover];
          const ok = g.validSpellTarget(ui.targeting, b.id);
          ctx.beginPath(); ctx.ellipse(b.x, b.y - 18, 46, 40, 0, 0, U.TAU);
          ctx.strokeStyle = ok ? '#cfe3ff' : 'rgba(255,90,70,0.85)'; ctx.lineWidth = 2.6; ctx.setLineDash([6, 5]); ctx.lineDashOffset = -t * 30; ctx.stroke();
        }
        ctx.restore();
      }
    }

    drawTexts(ctx, dt) {
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = this.texts.length - 1; i >= 0; i--) {
        const tx = this.texts[i];
        tx.age += dt;
        if (tx.age > tx.dur) { this.texts.splice(i, 1); continue; }
        const k = tx.age / tx.dur;
        ctx.globalAlpha = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4);
        const sc = k < 0.2 ? 0.4 + 0.6 * U.easeOutBack(k / 0.2) : 1;
        const ty = tx.y - k * 26 - (k < 0.2 ? Math.sin((k / 0.2) * Math.PI) * 6 : 0);
        ctx.font = 'bold ' + Math.round(tx.size * 1.12 * sc * this.uiK) + 'px "Trebuchet MS", "Segoe UI", Georgia, sans-serif';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(40,20,4,0.92)';
        ctx.strokeText(tx.str, tx.x, ty);
        ctx.fillStyle = tx.col; ctx.fillText(tx.str, tx.x, ty);
      }
      ctx.restore();
    }

    drawAmbient(ctx, dt) {
      if (this.quality === 'baja') return;
      const T = this.terrain, B = FF.BIOMES[T.biome];
      const V = this.V || { x0: 0, y0: 0, x1: WW, y1: WH }, area = ((V.x1 - V.x0) * (V.y1 - V.y0)) / (WW * WH);
      const want = Math.round((this.quality === 'alta' ? 40 : 18) * Math.min(1.6, Math.max(1, area)));
      const am = this.ambient;
      while (am.length < want) am.push(this.spawnAmbient(B.ambient, true));
      ctx.save();
      for (let i = 0; i < am.length; i++) {
        const a = am[i];
        if (a.wait > 0) { a.wait -= dt; continue; }
        a.x += a.vx * dt; a.y += a.vy * dt; a.ph += dt;
        const V = this.V || { x0: 0, y0: 0, x1: WW, y1: WH };
        if (a.x < V.x0 - 40 || a.x > V.x1 + 40 || a.y < V.y0 - 40 || a.y > V.y1 + 40) { am[i] = this.spawnAmbient(B.ambient, false); continue; }
        if (a.kind === 'nieve') {
          ctx.globalAlpha = 0.85; ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(a.x + Math.sin(a.ph * 2) * 6, a.y, a.s, 0, U.TAU); ctx.fill();
        } else if (a.kind === 'brasas') {
          ctx.globalAlpha = 0.5 + 0.5 * Math.sin(a.ph * 5); ctx.fillStyle = B.amb;
          ctx.beginPath(); ctx.arc(a.x, a.y, a.s * 0.8, 0, U.TAU); ctx.fill();
        } else if (a.kind === 'arena') {
          ctx.globalAlpha = 0.35; ctx.strokeStyle = B.amb; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x - 10, a.y + Math.sin(a.ph) * 2); ctx.stroke();
        } else if (a.kind === 'gaviotas') {
          ctx.globalAlpha = 0.85; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4;
          const f = Math.sin(a.ph * 8) * 3;
          ctx.beginPath(); ctx.moveTo(a.x - 6, a.y - f); ctx.quadraticCurveTo(a.x - 3, a.y - 3, a.x, a.y); ctx.quadraticCurveTo(a.x + 3, a.y - 3, a.x + 6, a.y - f); ctx.stroke();
        } else {
          ctx.globalAlpha = 0.8; ctx.fillStyle = a.c;
          ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(a.ph * 2); ctx.beginPath(); ctx.ellipse(0, 0, 3, 1.5, 0, 0, U.TAU); ctx.fill(); ctx.restore();
        }
      }
      ctx.restore();
    }

    spawnAmbient(kind, anywhere) {
      const r = Math.random;
      const a = { kind, ph: r() * 6, s: 1 + r() * 1.6 };
      const V = this.V || { x0: 0, y0: 0, x1: WW, y1: WH }, vw = V.x1 - V.x0, vh = V.y1 - V.y0;
      if (kind === 'nieve') { a.x = V.x0 + r() * vw; a.y = anywhere ? V.y0 + r() * vh : V.y0 - 10; a.vx = -8 + r() * 6; a.vy = 18 + r() * 22; }
      else if (kind === 'brasas') { a.x = V.x0 + r() * vw; a.y = anywhere ? V.y0 + r() * vh : V.y1 + 10; a.vx = (r() - 0.5) * 10; a.vy = -14 - r() * 20; }
      else if (kind === 'arena') { a.x = anywhere ? V.x0 + r() * vw : V.x0 - 20; a.y = V.y0 + r() * vh; a.vx = 60 + r() * 60; a.vy = (r() - 0.5) * 6; }
      else if (kind === 'gaviotas') { a.x = anywhere ? V.x0 + r() * vw : V.x0 - 30; a.y = V.y0 + r() * vh; a.vx = 22 + r() * 18; a.vy = (r() - 0.5) * 6; if (r() < 0.8) a.wait = 4 + r() * 14; }
      else { a.x = anywhere ? V.x0 + r() * vw : V.x0 - 20; a.y = V.y0 + r() * vh; a.vx = 14 + r() * 16; a.vy = 6 + r() * 8; a.c = r() < 0.5 ? '#c7e07a' : '#e0c060'; if (r() < 0.6) a.wait = 2 + r() * 10; }
      return a;
    }
  }
  FF.Renderer = Renderer;
  FF.Renderer.BSCALE = BSCALE;
})(globalThis.FF = globalThis.FF || {});
