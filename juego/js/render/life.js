/* Feudo a Feudo — vida del escenario
   Árboles y juncos que se mecen con el viento, ríos que corren y lava que fluye, espuma en las
   orillas, ondas, peces que saltan, patos, barcas que se mecen, mariposas, bandadas de pájaros,
   buitres, bolas de heno, remolinos de arena, destellos en el hielo, burbujas de lava y nubes
   con su sombra.
   Todo se dibuja con sprites precalculados o trazos baratos, y en cantidad según la calidad
   gráfica: en «Media» la mitad y en «Baja» nada (el terreno queda quieto, como antes). */
(function (FF) {
  'use strict';
  const U = FF.U, A = FF.Art;
  const WW = 1280, WH = 720, TAU = Math.PI * 2;

  /* vegetación que se mece: inclinación máxima de la copa */
  const SWAY = { roble: 0.05, pino: 0.04, palmera: 0.07, junco: 0.14, arbusto: 0.03 };
  /* viento de cada mundo (las islas son las más ventosas) */
  const WIND = { valle: 1, islas: 1.35, desierto: 0.8, hielo: 1.15, volcan: 0.6 };
  const BOX = { x: -24, y: -46, w: 50, h: 56 };   /* caja de los sprites de barca */
  /* caja ajustada de cada planta (menos píxeles que pintar) */
  const BOXK = {
    roble: { x: -16, y: -34, w: 37, h: 42 }, pino: { x: -12.5, y: -34, w: 27.5, h: 40 }, palmera: { x: -18, y: -45, w: 40, h: 52 },
    junco: { x: -6, y: -13, w: 12, h: 16 }, arbusto: { x: -10, y: -13, w: 21, h: 18 }, barca: BOX
  };
  /* cada trozo de la capa de plantas se redibuja estas veces por segundo */
  const TILE_HZ = 10, TW = 160, TH = 144;
  const VARIANTS = 4;
  function seedOf(kind, v) {
    let h = 2166136261;
    for (let i = 0; i < kind.length; i++) h = Math.imul(h ^ kind.charCodeAt(i), 16777619);
    return ((h >>> 0) % 100000) + v * 7919 + 13;
  }
  /* fase propia de cada planta, sacada de su posición (igual en todas las calidades) */
  const phaseOf = (x, y) => (x * 0.053 + y * 0.031) % TAU;

  /* nubes en cada mundo: cuántas, su opacidad y el tono */
  const SKY = {
    valle: { n: 2, a: 0.2, sa: 0.13, tint: null },
    islas: { n: 2, a: 0.2, sa: 0.12, tint: null },
    desierto: { n: 1, a: 0.14, sa: 0.1, tint: null },
    hielo: { n: 2, a: 0.22, sa: 0.1, tint: '#dfe9f5' },
    volcan: { n: 2, a: 0.24, sa: 0.15, tint: '#6a5856' }
  };

  /* sprite de una planta (o barca) a la resolución actual; cada escena guarda los suyos */
  function decoSprite(L, kind, v) {
    const key = kind + '|' + v;
    let c = L.sprC.get(key);
    if (!c) {
      const R = L.sprR, bx = BOXK[kind] || BOX;
      c = A.canvas(bx.w, bx.h, R);
      const x = c.getContext('2d');
      x.scale(R, R);
      A.deco(x, kind, -bx.x, -bx.y, 1, U.rng(seedOf(kind, v)), L.pal);
      A.vivid(c, A.GRADE_TERRAIN);
      L.sprC.set(key, c);
    }
    return c;
  }

  /* bola de heno y nubes (se dibujan una vez) */
  const misc = {};
  function weedSprite(L) {
    if (L.weedC) return L.weedC;
    const R = L.sprR || 2, sz = 28, c = A.canvas(sz, sz, R), x = c.getContext('2d');
    x.scale(R, R); x.translate(sz / 2, sz / 2);
    const rng = U.rng(77);
    x.lineCap = 'round';
    x.beginPath(); x.arc(0, 0, 10.5, 0, TAU); x.fillStyle = 'rgba(150,104,52,0.4)'; x.fill();
    for (let i = 0; i < 40; i++) {
      const a0 = rng.range(0, TAU), r = rng.range(3, 10.4), cx = rng.range(-2.5, 2.5), cy = rng.range(-2.5, 2.5);
      x.beginPath(); x.ellipse(cx, cy, r, r * rng.range(0.45, 1), rng.range(0, 3), a0, a0 + rng.range(1.2, 3.2));
      const k = i % 4;
      x.strokeStyle = k === 0 ? '#4a2c10' : k === 1 ? '#8a5a26' : k === 2 ? '#b8823e' : '#e6bc78';
      x.lineWidth = k === 0 ? 1.5 : k === 3 ? 0.8 : 1.1; x.stroke();
    }
    x.beginPath(); x.arc(0, 0, 10.6, 0, TAU); x.strokeStyle = 'rgba(60,34,10,0.55)'; x.lineWidth = 0.9; x.stroke();
    L.weedC = c;
    return c;
  }
  function cloudSprite(i, dark, tint) {
    const key = 'cloud' + i + (dark ? 'd' : '') + (tint || '');
    if (misc[key]) return misc[key];
    const w = 192, h = 96, c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d'), rng = U.rng(901 + i * 37);
    const col = dark ? '10,18,40' : (tint ? U.hexToRgb(tint).join(',') : '255,255,255');
    for (let k = 0; k < 11; k++) {
      const bx = w * (0.18 + rng.range(0, 0.64)), by = h * (0.38 + rng.range(-0.12, 0.2)), br = h * rng.range(0.2, 0.36);
      const g = x.createRadialGradient(bx, by, 0, bx, by, br);
      g.addColorStop(0, 'rgba(' + col + ',0.55)'); g.addColorStop(0.6, 'rgba(' + col + ',0.32)'); g.addColorStop(1, 'rgba(' + col + ',0)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
    }
    misc[key] = c;
    return c;
  }

  /* camino suave (como los ríos del terreno), desplazado a un lado */
  function lanePath(P, off) {
    const Q = P.map((p, i) => {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      return { x: p.x - (dy / l) * off, y: p.y + (dx / l) * off };
    });
    const p = new Path2D();
    p.moveTo(Q[0].x, Q[0].y);
    for (let i = 1; i < Q.length - 1; i++) p.quadraticCurveTo(Q[i].x, Q[i].y, (Q[i].x + Q[i + 1].x) / 2, (Q[i].y + Q[i + 1].y) / 2);
    p.lineTo(Q[Q.length - 1].x, Q[Q.length - 1].y);
    return p;
  }
  function islandRing(isl, pad) {
    const p = new Path2D();
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * TAU, r = FF.Terra.islandR(isl, a) + pad;
      if (i === 0) p.moveTo(isl.x + Math.cos(a) * r, isl.y + Math.sin(a) * r); else p.lineTo(isl.x + Math.cos(a) * r, isl.y + Math.sin(a) * r);
    }
    p.closePath();
    return p;
  }

  class Life {
    constructor() { this.on = false; this.t = 0; this.sprC = new Map(); this.sprR = 0; this.weedC = null; }

    /* nivel nuevo, o terreno rehecho (cambio de calidad o de tamaño)
       T: lo que devuelve FF.Terrain.render / scene; quality: 'alta' | 'media' | 'baja' */
    reset(T, quality, seed) {
      this.T = T; this.biome = T.biome || 'valle';
      this.q = quality === 'alta' ? 1 : quality === 'media' ? 0.5 : 0;
      this.on = this.q > 0;
      this.sprC.clear(); this.sprR = 0; this.weedC = null;
      /* lo que se ve: el mapa más los márgenes de las pantallas alargadas */
      const ex = (T.ext && T.ext.x) || 0, ey = (T.ext && T.ext.y) || 0;
      this.X0 = -ex; this.Y0 = -ey; this.X1 = WW + ex; this.Y1 = WH + ey;
      if (!this.on) return;
      const rng = this.rng = U.rng((seed || 1) * 31 + 7);
      const B = FF.BIOMES[this.biome];
      this.pal = { leaf: B.leaf, grass: B.grass, rock: B.rock, snow: B.snow, pine: B.pine, crystal: B.crystal, berries: this.biome === 'valle' };
      this.wind = WIND[this.biome] || 1;
      const P2 = typeof Path2D !== 'undefined';
      this.flows = [];
      (T.flows || []).forEach((r) => {
        if (!P2 || r.P.length < 3) return;
        if (r.kind === 'water') this.flows.push({ kind: 'water', w: r.w, lanes: [lanePath(r.P, -r.w * 0.2), lanePath(r.P, r.w * 0.22)] });
        else if (r.kind === 'lava') this.flows.push({ kind: 'lava', w: r.w, lanes: [lanePath(r.P, 0), lanePath(r.P, r.w * 0.18)] });
      });
      this.foam = P2 ? (T.islands || []).map((isl) => ({ a: islandRing(isl, 10) })) : [];
      /* sitios con agua (ondas y peces) y con lava (burbujas) */
      this.wet = []; this.hot = [];
      (T.lakes || []).forEach((l) => {
        const k = l.kind === 'water' || l.kind === 'oasis' ? this.wet : l.kind === 'lava' ? this.hot : null;
        if (k) for (let i = 0; i < 6; i++) k.push({ lake: l });
      });
      (T.flows || []).forEach((r) => {
        const k = r.kind === 'water' ? this.wet : r.kind === 'lava' ? this.hot : null;
        if (k) for (let i = 2; i < r.P.length - 2; i += 2) k.push({ x: r.P[i].x, y: r.P[i].y, r: r.w * 0.28 });
      });
      (T.pools || []).forEach((p) => this.hot.push({ x: p.x, y: p.y, r: 3 * p.s }));
      if ((T.islands || []).length) for (let i = 0; i < 40; i++) this.wet.push({ sea: true });
      this.ripples = []; this.drops = []; this.fish = []; this.bubbles = []; this.glints = [];
      this.rippleAcc = 0; this.bubbleAcc = 0; this.glintAcc = 0;
      this.fishWait = 2 + rng.range(0, 4);
      /* patos en los lagos del valle */
      this.ducks = [];
      if (this.biome === 'valle') (T.lakes || []).forEach((l) => {
        if (l.kind !== 'water') return;
        const n = Math.max(1, Math.round(2 * this.q));
        for (let i = 0; i < n; i++) this.ducks.push({ l, a: rng.range(0, TAU), w: rng.range(0.1, 0.18) * (rng.chance(0.5) ? 1 : -1), k: rng.range(0.42, 0.62), col: rng.chance(0.5) });
      });
      /* bolas de heno y remolinos en el desierto */
      this.weeds = [];
      if (this.biome === 'desierto') for (let i = 0; i < Math.round(3 * this.q + 0.4); i++) this.weeds.push(this.newWeed(true));
      this.devil = null; this.devilWait = 6 + rng.range(0, 10);
      /* buitres en círculo */
      this.vultures = [];
      if (this.biome === 'desierto') for (let i = 0; i < 2; i++) this.vultures.push({ cx: rng.range(300, 980), cy: rng.range(180, 520), r: rng.range(70, 110), a: rng.range(0, TAU), w: rng.range(0.28, 0.42) * (i ? -1 : 1), ph: rng.range(0, 6) });
      /* mariposas */
      this.flies = [];
      const nf = this.biome === 'valle' ? 7 : this.biome === 'islas' ? 3 : 0;
      const homes = (T.sway || []).filter((s) => s.k === 'roble' || s.k === 'arbusto' || s.k === 'palmera');
      for (let i = 0; i < Math.round(nf * this.q); i++) {
        const h = homes.length ? homes[rng.int(0, homes.length - 1)] : { x: rng.range(100, WW - 100), y: rng.range(100, WH - 100) };
        this.flies.push({ hx: h.x + rng.range(-20, 20), hy: h.y - 14, ph: rng.range(0, 6), col: rng.pick(['#fff176', '#ffffff', '#ffb74d', '#81d4fa', '#f48fb1']) });
      }
      /* bandadas de pájaros (no en el volcán ni en el desierto) */
      this.flock = null;
      this.flockWait = this.biome === 'volcan' || this.biome === 'desierto' ? Infinity : 3 + rng.range(0, 8);
      /* nubes */
      const sk = SKY[this.biome] || SKY.valle;
      this.skyCfg = sk;
      this.clouds = [];
      for (let i = 0; i < Math.max(1, Math.round(sk.n * this.q)); i++) this.clouds.push({ x: rng.range(this.X0 - 100, this.X1), y: rng.range(this.Y0 + 40, this.Y1 - 60), s: rng.range(1.2, 1.6), v: rng.range(7, 12), i: i % 3 });
      this.comp = null;
    }

    /* Capa base = terreno + plantas. Las plantas se mecen redibujando esta capa por trozos
       (cada trozo TILE_HZ veces por segundo), así el coste no depende de cuántas haya ni de los
       FPS. base: el lienzo del terreno; R: su resolución. */
    setBase(base, R) {
      this.base = base; this.comp = null;
      const L = (this.T && this.T.sway) || [];
      if (!this.on || !L.length || !base) return;
      this.baseR = R;
      this.sprR = U.clamp(Math.round(R * 1.15 * 2) / 2, 1, 3);
      this.sprC.clear(); L.forEach((it) => { it.spr = null; });
      const X0 = this.X0, Y0 = this.Y0, CW = this.X1 - X0, CH = this.Y1 - Y0;
      this.comp = A.canvas(CW, CH, R);
      const cols = Math.ceil(CW / TW), rows = Math.ceil(CH / TH);
      this.tiles = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) this.tiles.push({ x: X0 + c * TW, y: Y0 + r * TH, items: [] });
      L.forEach((it) => {
        const b = BOXK[it.k] || BOX, m = SWAY[it.k] * this.wind * 1.1 * it.s * -b.y + 1;
        const x0 = it.x + it.s * b.x - m, x1 = it.x + it.s * (b.x + b.w) + m, y0 = it.y + it.s * b.y, y1 = it.y + it.s * (b.y + b.h);
        this.tiles.forEach((tl) => { if (x1 > tl.x && x0 < tl.x + TW && y1 > tl.y && y0 < tl.y + TH) tl.items.push(it); });
      });
      /* los trozos sin plantas no cambian nunca: se pintan una vez y ya */
      this.tiles = this.tiles.filter((tl) => tl.items.length);
      this.comp.getContext('2d').drawImage(base, 0, 0);
      this.tileQ = 0; this.tileAcc = 0;
      for (let i = 0; i < this.tiles.length; i++) this.drawTile(i);
    }
    drawTile(i) {
      const tl = this.tiles[i], R = this.baseR, c = this.comp.getContext('2d'), t = this.t, w = this.wind, X0 = this.X0, Y0 = this.Y0;
      const px = Math.floor((tl.x - X0) * R), py = Math.floor((tl.y - Y0) * R);
      const pw = Math.min(this.comp.width, Math.ceil((tl.x + TW - X0) * R)) - px, ph = Math.min(this.comp.height, Math.ceil((tl.y + TH - Y0) * R)) - py;
      if (pw <= 0 || ph <= 0) return;
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.beginPath(); c.rect(px, py, pw, ph); c.clip();
      c.drawImage(this.base, px, py, pw, ph, px, py, pw, ph);
      const g1 = t * 1.55, g2 = t * 0.83, its = tl.items;
      for (let j = 0; j < its.length; j++) {
        const it = its[j], b = BOXK[it.k];
        const spr = it.spr || (it.spr = decoSprite(this, it.k, it.v));
        const k = SWAY[it.k] * w * (0.12 + 0.55 * Math.sin(g1 + it.ph) + 0.33 * Math.sin(g2 - it.x * 0.011 - it.y * 0.004));
        const a = R * it.s;
        c.setTransform(a, 0, a * k, a, R * (it.x - X0), R * (it.y - Y0));
        c.drawImage(spr, b.x, b.y, b.w, b.h);
      }
      c.restore();
    }
    /* lo que hay que pintar como fondo: la capa con plantas, o el terreno tal cual */
    baseCanvas(fallback) { return this.comp || fallback; }

    newWeed(anywhere) {
      const r = Math.random;
      return { x: anywhere ? this.X0 + r() * (this.X1 - this.X0) : this.X0 - 20 - r() * 60, y: this.Y0 + 60 + r() * (this.Y1 - this.Y0 - 120), vx: 34 + r() * 36, ph: r() * 6, amp: 3 + r() * 4, rot: r() * 6, wait: anywhere ? 0 : 1 + r() * 7, s: 1 + r() * 0.3 };
    }

    /* punto al azar en el agua o en la lava */
    spot(list) {
      if (!list.length) return null;
      const it = list[(Math.random() * list.length) | 0];
      if (it.lake) {
        const l = it.lake, a = Math.random() * TAU, d = Math.sqrt(Math.random()) * 0.68;
        const ca = Math.cos(l.a || 0), sa = Math.sin(l.a || 0), px = Math.cos(a) * l.rx * d, py = Math.sin(a) * l.ry * d;
        return { x: l.x + px * ca - py * sa, y: l.y + px * sa + py * ca };
      }
      if (it.sea) {
        const t = this.T.terrain;
        for (let k = 0; k < 8; k++) {
          const x = this.X0 + 30 + Math.random() * (this.X1 - this.X0 - 60), y = this.Y0 + 30 + Math.random() * (this.Y1 - this.Y0 - 60);
          if (FF.Terra.kindAt(t, x, y) === 'water' && !t.islands.some((isl) => FF.Terra.inIsland(isl, x, y, 26))) return { x, y };
        }
        return null;
      }
      return { x: it.x + (Math.random() - 0.5) * it.r * 2, y: it.y + (Math.random() - 0.5) * it.r * 2 };
    }

    /* ---------- capa del suelo: bajo edificios y tropas ---------- */
    ground(ctx, dt, M) {
      if (!this.on) return;
      dt = Math.min(dt, 0.1);
      this.t += dt;
      const t = this.t;
      if (!this.sprR) this.sprR = U.clamp(Math.round(M.m * 1.15 * 2) / 2, 1, 3);
      if (this.comp && dt > 0) {
        this.tileAcc += dt * TILE_HZ * this.tiles.length * (this.q >= 1 ? 1 : 0.6);
        let n = Math.min(this.tiles.length, Math.floor(this.tileAcc));
        this.tileAcc -= n;
        while (n-- > 0) { this.drawTile(this.tileQ); this.tileQ = (this.tileQ + 1) % this.tiles.length; }
      }
      ctx.save();
      this.drawFlows(ctx, t);
      this.drawFoam(ctx, t);
      this.updRipples(ctx, dt);
      this.updBubbles(ctx, dt);
      this.updFish(ctx, dt);
      this.drawLavaLakes(ctx, t);
      this.drawDucks(ctx, dt, t);
      this.drawBoats(ctx, t, M);
      ctx.restore();
      ctx.save();
      this.updFlyers(dt);
      this.drawShadows(ctx, dt);
      this.updGlints(ctx, dt);
      ctx.restore();
    }

    drawFlows(ctx, t) {
      if (!this.flows.length) return;
      ctx.lineCap = 'round';
      this.flows.forEach((f) => {
        if (f.kind === 'water') {
          ctx.strokeStyle = 'rgba(255,255,255,0.32)'; ctx.lineWidth = 1.4;
          ctx.setLineDash([7, 23]);
          ctx.lineDashOffset = -t * 17; ctx.stroke(f.lanes[0]);
          ctx.lineDashOffset = -t * 14 + 11; ctx.stroke(f.lanes[1]);
        } else {
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = 'rgba(255,236,150,0.42)'; ctx.lineWidth = f.w * 0.3;
          ctx.setLineDash([f.w * 0.8, f.w * 1.5]); ctx.lineDashOffset = -t * 7; ctx.stroke(f.lanes[0]);
          ctx.globalCompositeOperation = 'source-over';
          ctx.strokeStyle = 'rgba(70,16,0,0.42)'; ctx.lineWidth = f.w * 0.16;
          ctx.setLineDash([2.5, f.w * 2.3]); ctx.lineDashOffset = -t * 7 + 4; ctx.stroke(f.lanes[1]);
        }
      });
      ctx.setLineDash([]);
    }

    drawFoam(ctx, t) {
      if (!this.foam.length) return;
      ctx.strokeStyle = '#ffffff'; ctx.lineJoin = 'round';
      this.foam.forEach((f, i) => {
        const s = Math.sin(t * 1.25 + i * 1.7);
        ctx.globalAlpha = 0.32 + 0.2 * s; ctx.lineWidth = 2.4 + 1.6 * s; ctx.stroke(f.a);
      });
      ctx.globalAlpha = 1;
    }

    ripple(x, y, big) { this.ripples.push({ x, y, age: 0, dur: big ? 1.3 : 1.7, r: big ? 12 : 8 }); }
    updRipples(ctx, dt) {
      if (this.wet.length) {
        this.rippleAcc += dt * 1.6 * this.q;
        while (this.rippleAcc > 1) { this.rippleAcc -= 1; const p = this.spot(this.wet); if (p) this.ripple(p.x, p.y); }
      }
      const R = this.ripples;
      if (!R.length) return;
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
      for (let i = R.length - 1; i >= 0; i--) {
        const r = R[i];
        r.age += dt;
        const q = r.age / r.dur;
        if (q >= 1) { R.splice(i, 1); continue; }
        ctx.globalAlpha = (1 - q) * 0.5;
        ctx.beginPath(); ctx.ellipse(r.x, r.y, 1.5 + q * r.r, (1.5 + q * r.r) * 0.45, 0, 0, TAU); ctx.stroke();
        if (q > 0.25) { const q2 = (q - 0.25) / 0.75; ctx.globalAlpha = (1 - q2) * 0.3; ctx.beginPath(); ctx.ellipse(r.x, r.y, 1 + q2 * r.r * 0.6, (1 + q2 * r.r * 0.6) * 0.45, 0, 0, TAU); ctx.stroke(); }
      }
      ctx.globalAlpha = 1;
    }

    /* peces que saltan (en lagos, oasis y mar) */
    updFish(ctx, dt) {
      if (this.wet.length && this.q >= 1) {
        this.fishWait -= dt;
        if (this.fishWait <= 0) {
          this.fishWait = 3 + Math.random() * 6;
          const p = this.spot(this.wet);
          if (p) { const dir = Math.random() < 0.5 ? -1 : 1; this.fish.push({ x: p.x, y: p.y, dir, age: 0 }); this.ripple(p.x, p.y, true); this.splash(p.x, p.y); }
        }
      }
      const F = this.fish;
      for (let i = F.length - 1; i >= 0; i--) {
        const f = F[i];
        f.age += dt;
        const q = f.age / 0.75;
        if (q >= 1) { F.splice(i, 1); this.ripple(f.x + f.dir * 16, f.y, true); this.splash(f.x + f.dir * 16, f.y); continue; }
        const x = f.x + f.dir * 16 * q, y = f.y - Math.sin(q * Math.PI) * 11;
        const ang = Math.atan2(-Math.cos(q * Math.PI) * 11 * Math.PI, f.dir * 16);
        ctx.save(); ctx.translate(x, y); ctx.rotate(f.dir > 0 ? ang : ang + Math.PI);
        ctx.beginPath(); ctx.ellipse(0, 0, 3.4, 1.4, 0, 0, TAU); ctx.fillStyle = '#d6eef7'; ctx.fill();
        ctx.strokeStyle = 'rgba(30,60,90,0.8)'; ctx.lineWidth = 0.5; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(-5, -1.4); ctx.lineTo(-5, 1.4); ctx.closePath(); ctx.fillStyle = '#9ccbe0'; ctx.fill();
        ctx.restore();
      }
      const D = this.drops;
      ctx.fillStyle = '#ffffff';
      for (let i = D.length - 1; i >= 0; i--) {
        const d = D[i];
        d.age += dt;
        if (d.age > d.dur) { D.splice(i, 1); continue; }
        d.x += d.vx * dt; d.vy += 60 * dt; d.y += d.vy * dt;
        ctx.globalAlpha = 1 - d.age / d.dur;
        ctx.fillRect(d.x - 0.6, d.y - 0.6, 1.2, 1.2);
      }
      ctx.globalAlpha = 1;
    }
    splash(x, y) {
      for (let k = 0; k < 4; k++) this.drops.push({ x, y, vx: (Math.random() - 0.5) * 24, vy: -18 - Math.random() * 14, age: 0, dur: 0.5 });
    }

    /* burbujas que crecen y revientan en la lava */
    updBubbles(ctx, dt) {
      if (this.hot.length) {
        this.bubbleAcc += dt * 4 * this.q;
        while (this.bubbleAcc > 1) {
          this.bubbleAcc -= 1;
          const p = this.spot(this.hot);
          if (p) this.bubbles.push({ x: p.x, y: p.y, r: 1.6 + Math.random() * 2.2, grow: 0.5 + Math.random() * 0.5, age: 0 });
        }
      }
      const Bs = this.bubbles;
      for (let i = Bs.length - 1; i >= 0; i--) {
        const b = Bs[i];
        b.age += dt;
        if (b.age < b.grow) {
          const r = b.r * (b.age / b.grow);
          ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, TAU);
          ctx.fillStyle = '#ffcf3a'; ctx.fill();
          ctx.strokeStyle = 'rgba(150,40,0,0.9)'; ctx.lineWidth = 0.6; ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,220,0.9)'; ctx.fillRect(b.x - r * 0.45, b.y - r * 0.5, r * 0.4, r * 0.35);
        } else {
          const q = (b.age - b.grow) / 0.28;
          if (q >= 1) { Bs.splice(i, 1); continue; }
          ctx.globalAlpha = 1 - q;
          ctx.beginPath(); ctx.ellipse(b.x, b.y, b.r * (1 + q * 1.4), b.r * (1 + q * 1.4) * 0.6, 0, 0, TAU);
          ctx.strokeStyle = '#ffe9a0'; ctx.lineWidth = 0.9; ctx.stroke();
          ctx.fillStyle = '#ff9a2a';
          for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + (k - 1) * 0.9; ctx.fillRect(b.x + Math.cos(a) * b.r * 2 * q - 0.6, b.y + Math.sin(a) * b.r * 2.4 * q + q * q * 4 - 0.6, 1.2, 1.2); }
          ctx.globalAlpha = 1;
        }
      }
    }

    /* corrientes lentas dentro de los lagos de lava */
    drawLavaLakes(ctx, t) {
      const L = this.T.lakes;
      if (!L || !L.length) return;
      let any = false;
      for (let i = 0; i < L.length; i++) {
        const l = L[i];
        if (l.kind !== 'lava') continue;
        if (!any) { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,236,160,0.3)'; ctx.lineCap = 'round'; any = true; }
        for (let k = 0; k < 2; k++) {
          const a0 = t * 0.35 * (k ? -1 : 1) + k * Math.PI + i;
          ctx.lineWidth = 2.2 - k * 0.6;
          ctx.beginPath(); ctx.ellipse(l.x, l.y, l.rx * (0.5 - k * 0.15), l.ry * (0.45 - k * 0.14), l.a || 0, a0, a0 + 1.4); ctx.stroke();
        }
      }
      if (any) ctx.globalCompositeOperation = 'source-over';
    }

    drawDucks(ctx, dt, t) {
      this.ducks.forEach((d) => {
        d.a += d.w * dt;
        const l = d.l, ca = Math.cos(l.a || 0), sa = Math.sin(l.a || 0);
        const px = Math.cos(d.a) * l.rx * d.k, py = Math.sin(d.a) * l.ry * d.k;
        const x = l.x + px * ca - py * sa, y = l.y + px * sa + py * ca + Math.sin(t * 2 + d.a * 3) * 0.3;
        const vx = -Math.sin(d.a) * l.rx * d.w * ca - Math.cos(d.a) * l.ry * d.w * sa;
        const dir = vx >= 0 ? 1 : -1;
        /* estela */
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.moveTo(x - dir * 3, y + 0.5); ctx.lineTo(x - dir * 9, y - 1.6); ctx.moveTo(x - dir * 3, y + 1); ctx.lineTo(x - dir * 9, y + 2.8); ctx.stroke();
        ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
        ctx.beginPath(); ctx.ellipse(0, 0, 3.6, 2, 0, 0, TAU); ctx.fillStyle = d.col ? '#f6f2e6' : '#9a7a52'; ctx.fill();
        ctx.strokeStyle = 'rgba(40,30,20,0.75)'; ctx.lineWidth = 0.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(2.6, -2.2, 1.5, 0, TAU); ctx.fillStyle = d.col ? '#f6f2e6' : '#2f8a4a'; ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ff9a2a'; ctx.fillRect(3.8, -2.4, 1.6, 0.8);
        ctx.restore();
      });
    }

    drawBoats(ctx, t, M) {
      const L = this.T.boats;
      if (!L || !L.length) return;
      L.forEach((b) => {
        if (!b.spr) b.spr = decoSprite(this, 'barca', 0);
        const bob = Math.sin(t * 1.6 + b.ph) * 1.1, rot = Math.sin(t * 1.1 + b.ph) * 0.05;
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
        ctx.globalAlpha = 0.25 + 0.15 * Math.sin(t * 1.6 + b.ph);
        ctx.beginPath(); ctx.ellipse(b.x, b.y - 1, 11 * b.s, 3.2 * b.s, 0, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.save(); ctx.translate(b.x, b.y + bob * 0.4); ctx.rotate(rot); ctx.scale(b.s, b.s);
        ctx.drawImage(b.spr, BOX.x, BOX.y + bob * 0.6, BOX.w, BOX.h);
        ctx.restore();
      });
    }

    /* pájaros, buitres, remolinos y nubes: se mueven aquí y se dibujan en ground (sombra) y sky */
    updFlyers(dt) {
      /* bandada en V */
      if (this.flock) {
        const f = this.flock;
        f.x += f.vx * dt; f.y += f.vy * dt;
        if (f.x < this.X0 - 260 || f.x > this.X1 + 260 || f.y < this.Y0 - 200 || f.y > this.Y1 + 200) { this.flock = null; this.flockWait = 10 + Math.random() * 16; }
      } else if ((this.flockWait -= dt) <= 0) {
        const fromLeft = Math.random() < 0.65, a = (fromLeft ? 0 : Math.PI) + (Math.random() - 0.5) * 0.7, v = 62 + Math.random() * 22;
        const n = 5 + ((Math.random() * 3) | 0);
        this.flock = { x: fromLeft ? this.X0 - 120 : this.X1 + 120, y: 120 + Math.random() * (WH - 240), vx: Math.cos(a) * v, vy: Math.sin(a) * v, a, n, ph: Math.random() * 6 };
      }
      this.vultures.forEach((v) => { v.a += v.w * dt; });
      /* remolino de arena */
      if (this.biome === 'desierto' && this.q >= 1) {
        if (this.devil) {
          const d = this.devil;
          d.age += dt; d.x += d.vx * dt; d.y += d.vy * dt;
          if (d.age > d.life) { this.devil = null; this.devilWait = 14 + Math.random() * 16; }
        } else if ((this.devilWait -= dt) <= 0) {
          this.devil = { x: 120 + Math.random() * (WW - 400), y: 140 + Math.random() * (WH - 260), vx: 18 + Math.random() * 14, vy: (Math.random() - 0.5) * 8, age: 0, life: 9 + Math.random() * 4 };
        }
      }
      this.clouds.forEach((c) => {
        c.x += c.v * dt;
        if (c.x - 192 * c.s * 0.5 > this.X1 + 160) { c.x = this.X0 - 192 * c.s * 0.6 - 120; c.y = this.Y0 + 40 + Math.random() * (this.Y1 - this.Y0 - 100); }
      });
    }
    flockBirds(fn) {
      const f = this.flock; if (!f) return;
      const ca = Math.cos(f.a), sa = Math.sin(f.a);
      for (let i = 0; i < f.n; i++) {
        const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
        const bx = -row * 15, by = side * row * 11;
        fn(f.x + bx * ca - by * sa, f.y + bx * sa + by * ca, f.a, f.ph + i * 0.9);
      }
    }
    vulturePos(v) {
      const h = Math.atan2(Math.cos(v.a) * 0.6 * v.w, -Math.sin(v.a) * v.w) + Math.PI / 2;
      return { x: v.cx + Math.cos(v.a) * v.r, y: v.cy + Math.sin(v.a) * v.r * 0.6, h };
    }

    drawShadows(ctx) {
      const sk = this.skyCfg;
      /* sombras de las nubes */
      if (this.clouds.length) {
        ctx.globalAlpha = sk.sa;
        this.clouds.forEach((c) => {
          const s = cloudSprite(c.i, true), w = s.width * c.s, h = s.height * c.s;
          ctx.drawImage(s, c.x - w / 2 + 70, c.y - h / 2 + 110, w, h);
        });
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = 'rgba(0,0,0,0.16)';
      this.flockBirds((x, y, a, ph) => this.bird(ctx, x + 40, y + 60, a, ph, 1, true));
      this.vultures.forEach((v) => { const p = this.vulturePos(v); this.vulture(ctx, p.x + 38, p.y + 54, p.h, v.ph, true); });
    }

    bird(ctx, x, y, a, ph, s, shadow) {
      const f = Math.sin(this.t * 10 + ph) * 2.6;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a + Math.PI / 2); ctx.scale(s, s);
      ctx.beginPath(); ctx.moveTo(-6, f); ctx.quadraticCurveTo(-3, -2.5, 0, 0); ctx.quadraticCurveTo(3, -2.5, 6, f);
      ctx.lineWidth = 1.4; ctx.strokeStyle = shadow ? 'rgba(0,0,0,0.16)' : '#2b2a2e'; ctx.lineCap = 'round'; ctx.stroke();
      ctx.restore();
    }
    /* buitre visto desde arriba: alas anchas con «dedos» en las puntas, cola y cabeza */
    vulture(ctx, x, y, h, ph, shadow) {
      const sp = 13 * (1 + Math.sin(this.t * 2.2 + ph) * 0.06);
      ctx.save(); ctx.translate(x, y); ctx.rotate(h);
      ctx.beginPath();
      ctx.moveTo(-2, -3); ctx.lineTo(-sp * 0.55, -3.8); ctx.lineTo(-sp, -2.4);
      ctx.lineTo(-sp - 2.2, -1); ctx.lineTo(-sp + 0.3, -0.3); ctx.lineTo(-sp - 1.8, 0.8); ctx.lineTo(-sp + 0.5, 1.2); ctx.lineTo(-sp - 0.9, 2.3);
      ctx.lineTo(-sp * 0.55, 2.8); ctx.lineTo(-2, 2.6); ctx.lineTo(-2.4, 6.2); ctx.lineTo(0, 7.2); ctx.lineTo(2.4, 6.2); ctx.lineTo(2, 2.6);
      ctx.lineTo(sp * 0.55, 2.8); ctx.lineTo(sp + 0.9, 2.3); ctx.lineTo(sp - 0.5, 1.2); ctx.lineTo(sp + 1.8, 0.8); ctx.lineTo(sp - 0.3, -0.3); ctx.lineTo(sp + 2.2, -1);
      ctx.lineTo(sp, -2.4); ctx.lineTo(sp * 0.55, -3.8); ctx.lineTo(2, -3); ctx.lineTo(1.1, -5); ctx.lineTo(-1.1, -5); ctx.closePath();
      if (shadow) { ctx.fillStyle = 'rgba(0,0,0,0.17)'; ctx.fill(); ctx.restore(); return; }
      ctx.fillStyle = '#3a2a22'; ctx.fill();
      ctx.lineWidth = 0.7; ctx.strokeStyle = '#1a100c'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-sp * 0.75, 0.6); ctx.lineTo(-2.5, 0.2); ctx.moveTo(2.5, 0.2); ctx.lineTo(sp * 0.75, 0.6);
      ctx.strokeStyle = 'rgba(190,160,130,0.55)'; ctx.lineWidth = 1.1; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -5.6, 1.4, 0, TAU); ctx.fillStyle = '#e8b8a8'; ctx.fill();
      ctx.restore();
    }

    /* destellos en el hielo */
    updGlints(ctx, dt) {
      if (this.biome !== 'hielo') return;
      this.glintAcc += dt * 4 * this.q;
      while (this.glintAcc > 1) {
        this.glintAcc -= 1;
        const L = (this.T.lakes || []).filter((l) => l.kind === 'ice');
        let p = null;
        if (L.length && Math.random() < 0.6) p = this.spot([{ lake: L[(Math.random() * L.length) | 0] }]);
        else p = { x: this.X0 + 20 + Math.random() * (this.X1 - this.X0 - 40), y: this.Y0 + 20 + Math.random() * (this.Y1 - this.Y0 - 40) };
        if (p) this.glints.push({ x: p.x, y: p.y, age: 0, s: 2.5 + Math.random() * 2.5 });
      }
      const G = this.glints;
      if (!G.length) return;
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#ffffff';
      for (let i = G.length - 1; i >= 0; i--) {
        const g = G[i];
        g.age += dt;
        const q = g.age / 0.9;
        if (q >= 1) { G.splice(i, 1); continue; }
        const s = g.s * Math.sin(q * Math.PI);
        ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.moveTo(g.x - s, g.y); ctx.lineTo(g.x, g.y - s * 0.18); ctx.lineTo(g.x + s, g.y); ctx.lineTo(g.x, g.y + s * 0.18); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(g.x, g.y - s); ctx.lineTo(g.x + s * 0.18, g.y); ctx.lineTo(g.x, g.y + s); ctx.lineTo(g.x - s * 0.18, g.y); ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }

    /* ---------- bolas de heno: van en la lista de profundidad, con edificios y tropas ---------- */
    worldItems(list) {
      if (!this.on) return;
      const dt = Math.min(this.dtLast || 0, 0.1);
      for (let i = 0; i < this.weeds.length; i++) {
        const w = this.weeds[i];
        if (w.wait > 0) { w.wait -= dt; continue; }
        const gust = 0.75 + 0.45 * Math.sin(this.t * 0.6 + i * 2.1);
        w.x += w.vx * gust * dt;
        w.ph += dt * w.vx * gust / 13;
        w.rot += dt * w.vx * gust / 8;
        if (Math.sin(w.ph) < 0 && Math.sin(w.ph - dt * w.vx * gust / 13) >= 0) w.amp = Math.max(1.2, w.amp * 0.7 + (Math.random() < 0.35 ? 5 : 0));
        if (w.x > this.X1 + 30) { this.weeds[i] = this.newWeed(false); continue; }
        list.push({ y: w.y, lf: w });
      }
    }
    drawItem(ctx, w) {
      const h = Math.abs(Math.sin(w.ph)) * w.amp, s = w.s;
      ctx.fillStyle = 'rgba(70,40,10,' + (0.24 - h * 0.012).toFixed(3) + ')';
      ctx.beginPath(); ctx.ellipse(w.x + 2, w.y, 9.5 * s * (1 - h * 0.03), 3 * s, 0, 0, TAU); ctx.fill();
      const spr = weedSprite(this);
      ctx.save(); ctx.translate(w.x, w.y - 10 * s - h); ctx.rotate(w.rot); ctx.scale(s, s);
      ctx.drawImage(spr, -14, -14, 28, 28);
      ctx.restore();
    }

    /* ---------- capa del cielo: encima de tropas y edificios, debajo de los números ---------- */
    sky(ctx, dt) {
      if (!this.on) return;
      this.dtLast = dt;
      ctx.save();
      /* remolino de arena */
      if (this.devil) {
        const d = this.devil, fade = Math.min(1, d.age / 1.5, (d.life - d.age) / 1.5);
        ctx.fillStyle = 'rgba(200,150,80,' + (0.18 * fade).toFixed(3) + ')';
        ctx.beginPath(); ctx.ellipse(d.x, d.y, 14, 4.5, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#f4d9a2';
        for (let i = 0; i < 22; i++) {
          const hgt = i * 1.9, rad = 2.5 + hgt * 0.42, ang = this.t * 6.5 + i * 0.83;
          ctx.globalAlpha = fade * (0.55 - i * 0.018);
          ctx.fillRect(d.x + Math.cos(ang) * rad + Math.sin(this.t * 2 + i * 0.3) * hgt * 0.08 - 0.8, d.y - hgt + Math.sin(ang) * rad * 0.3 - 0.8, 1.6, 1.6);
        }
        ctx.globalAlpha = 1;
      }
      /* mariposas */
      this.flies.forEach((f) => {
        const t = this.t;
        const x = f.hx + Math.sin(t * 0.7 + f.ph) * 22 + Math.sin(t * 1.9 + f.ph * 2) * 7;
        const y = f.hy + Math.cos(t * 0.6 + f.ph) * 13 + Math.sin(t * 2.3 + f.ph) * 5;
        const fl = 0.25 + 0.75 * Math.abs(Math.sin(t * 15 + f.ph));
        ctx.fillStyle = f.col;
        ctx.beginPath(); ctx.ellipse(x - 1.6 * fl, y, 1.7 * fl, 1.3, 0, 0, TAU); ctx.ellipse(x + 1.6 * fl, y, 1.7 * fl, 1.3, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(40,30,20,0.8)'; ctx.fillRect(x - 0.35, y - 1, 0.7, 2);
      });
      /* pájaros y buitres */
      this.flockBirds((x, y, a, ph) => this.bird(ctx, x, y, a, ph, 1, false));
      this.vultures.forEach((v) => { const p = this.vulturePos(v); this.vulture(ctx, p.x, p.y, p.h, v.ph, false); });
      /* nubes */
      if (this.clouds.length) {
        ctx.globalAlpha = this.skyCfg.a;
        this.clouds.forEach((c) => {
          const s = cloudSprite(c.i, false, this.skyCfg.tint), w = s.width * c.s, h = s.height * c.s;
          ctx.drawImage(s, c.x - w / 2, c.y - h / 2, w, h);
        });
      }
      ctx.restore();
    }
  }

  Life.SWAY = SWAY;
  Life.VARIANTS = VARIANTS;
  Life.seedOf = seedOf;
  Life.phaseOf = phaseOf;
  FF.Life = Life;
})(globalThis.FF = globalThis.FF || {});
