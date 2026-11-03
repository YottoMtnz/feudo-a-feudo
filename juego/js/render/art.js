/* Feudo a Feudo — arte procedural: edificios, tropas y decorados (todo dibujado con código) */
(function (FF) {
  'use strict';
  const U = FF.U;
  const A = FF.Art = {};
  let SPR = 2, SPRU = 3;           /* resolución de los sprites en caché (edificios / tropas) */
  const OUT = 'rgba(34,18,6,0.95)';   /* contorno de dibujo animado */
  const OL = 1.22;                    /* grosor extra de todos los contornos */
  /* ajusta la resolución de los sprites a la de la pantalla */
  A.setScale = function (R) {
    const b = U.clamp(Math.round(R * 1.2 * 2) / 2, 1.5, 3);
    const u = U.clamp(Math.round(R * 1.4 * 2) / 2, 1.5, 3.5);
    if (b !== SPR || u !== SPRU) { SPR = b; SPRU = u; bcache.clear(); ucache.clear(); }
  };

  /* ---------- color vivo: más saturación, algo más de contraste y de luz ----------
     Se aplica una vez a cada sprite y al terreno. Usa el filtro del canvas (GPU) si existe
     y, si no, un recorrido de píxeles equivalente. */
  A.GRADE_SPRITE = { css: 'saturate(1.3) contrast(1.06) brightness(1.05)', s: 1.3, c: 1.06, b: 1.05 };
  A.GRADE_TERRAIN = { css: 'saturate(1.16) contrast(1.04) brightness(1.03)', s: 1.16, c: 1.04, b: 1.03 };
  const FILTER_OK = (function () {
    try { const x = document.createElement('canvas').getContext('2d'); x.filter = 'saturate(1.5)'; return x.filter === 'saturate(1.5)'; } catch (e) { return false; }
  })();
  A.vivid = function (c, G) {
    G = G || A.GRADE_SPRITE;
    if (!c || !c.width || !c.height) return c;
    const cx = c.getContext('2d');
    if (FILTER_OK) {
      const t = A._tmp || (A._tmp = document.createElement('canvas'));
      if (t.width !== c.width || t.height !== c.height) { t.width = c.width; t.height = c.height; }
      const tx = t.getContext('2d');
      tx.setTransform(1, 0, 0, 1, 0, 0); tx.clearRect(0, 0, t.width, t.height);
      tx.filter = G.css; tx.drawImage(c, 0, 0); tx.filter = 'none';
      cx.save(); cx.setTransform(1, 0, 0, 1, 0, 0); cx.globalCompositeOperation = 'copy'; cx.drawImage(t, 0, 0); cx.restore();
      return c;
    }
    let img;
    try { img = cx.getImageData(0, 0, c.width, c.height); } catch (e) { return c; }
    const d = img.data, S = G.s, C = G.c, Bm = G.b;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      let nr = (L + (r - L) * S) * Bm, ng = (L + (g - L) * S) * Bm, nb = (L + (b - L) * S) * Bm;
      nr = (nr - 128) * C + 128; ng = (ng - 128) * C + 128; nb = (nb - 128) * C + 128;
      d[i] = nr < 0 ? 0 : nr > 255 ? 255 : nr; d[i + 1] = ng < 0 ? 0 : ng > 255 ? 255 : ng; d[i + 2] = nb < 0 ? 0 : nb > 255 ? 255 : nb;
    }
    cx.putImageData(img, 0, 0);
    return c;
  };

  /* si la tarjeta gráfica pierde el contenido de los lienzos (reinicio del controlador, cambio
     de gráfica en portátiles…), se avisa para volver a dibujarlos */
  A.dirty = false;
  const onRestored = () => { A.dirty = true; };
  A.canvas = function (w, h, s) {
    const c = document.createElement('canvas');
    c.addEventListener('contextrestored', onRestored);
    c.width = Math.max(1, Math.ceil(w * (s || SPR)));
    c.height = Math.max(1, Math.ceil(h * (s || SPR)));
    return c;
  };

  /* ---------- utilidades de dibujo ---------- */
  function poly(ctx, p) {
    ctx.beginPath(); ctx.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    ctx.closePath();
  }
  function fs(ctx, fill, stroke, lw) {
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = (lw || 1.1) * OL; ctx.stroke(); }
  }
  function lg(ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
    return g;
  }
  function rg(ctx, x, y, r0, r1, stops) {
    const g = ctx.createRadialGradient(x, y, r0, x, y, r1);
    stops.forEach((s) => g.addColorStop(s[0], s[1]));
    return g;
  }
  function ell(ctx, x, y, rx, ry, rot) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, U.TAU); }
  function line(ctx, x0, y0, x1, y1, col, lw) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.strokeStyle = col; ctx.lineWidth = lw || 1; ctx.stroke(); }
  A.poly = poly; A.ell = ell; A.lg = lg; A.rg = rg;

  function roofCols(F) {
    const b = F.roof;
    return { base: b, light: U.shade(b, 0.28), dark: U.shade(b, -0.32), deep: U.shade(b, -0.52) };
  }

  /* sombra suave y explanada empedrada bajo el edificio */
  function pad(ctx, r) {
    ctx.save();
    ell(ctx, 8, 6, r * 1.18, r * 0.42);
    ctx.fillStyle = rg(ctx, 8, 6, 0, r * 1.18, [[0, 'rgba(22,12,4,0.42)'], [0.55, 'rgba(22,12,4,0.18)'], [1, 'rgba(22,12,4,0)']]);
    ctx.fill();
    ell(ctx, 0, 1.5, r, r * 0.34);
    ctx.fillStyle = rg(ctx, -r * 0.35, -1, 1, r * 1.05, [[0, '#d2bc94'], [0.55, '#ac9370'], [1, '#806a4c']]);
    ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(70,48,24,0.45)'; ctx.stroke();
    ell(ctx, 0, 1.5, r * 0.8, r * 0.26);
    ctx.strokeStyle = 'rgba(255,244,220,0.32)'; ctx.lineWidth = 0.8; ctx.stroke();
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * U.TAU;
      ell(ctx, Math.cos(a) * r * 0.9, 1.5 + Math.sin(a) * r * 0.305, 2.5, 1.25, a);
      ctx.fillStyle = i % 2 ? 'rgba(246,234,206,0.42)' : 'rgba(96,74,48,0.3)'; ctx.fill();
    }
    ctx.restore();
  }

  /* oclusión ambiental en la base de un muro */
  function ao(ctx, x, yb, w, h) {
    const g = ctx.createLinearGradient(0, yb - h, 0, yb);
    g.addColorStop(0, 'rgba(30,18,8,0)'); g.addColorStop(1, 'rgba(30,18,8,0.32)');
    ctx.fillStyle = g; ctx.fillRect(x, yb - h, w, h);
  }

  /* ventana con luz cálida y halo */
  /* valor pseudoaleatorio estable en [0, 1) a partir de un número */
  function hash(n) { const v = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); }
  function windowAt(ctx, x, y, w, h, arch, deco) {
    if (deco && !arch) {
      /* contraventanas de madera */
      [x - 3.4, x + w + 0.4].forEach((sx) => {
        ctx.beginPath(); ctx.rect(sx, y - 0.4, 3, h + 0.8);
        ctx.fillStyle = deco.shutter; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.6; ctx.stroke();
        line(ctx, sx + 0.5, y + h * 0.35, sx + 2.5, y + h * 0.35, 'rgba(0,0,0,0.3)', 0.4);
        line(ctx, sx + 0.5, y + h * 0.7, sx + 2.5, y + h * 0.7, 'rgba(0,0,0,0.3)', 0.4);
      });
    }
    const gx = x + w / 2, gy = y + h / 2;
    ctx.save();
    ctx.fillStyle = rg(ctx, gx, gy, 0, w * 1.7, [[0, 'rgba(255,205,110,0.38)'], [1, 'rgba(255,205,110,0)']]);
    ctx.fillRect(gx - w * 1.7, gy - w * 1.7, w * 3.4, w * 3.4);
    ctx.restore();
    ctx.beginPath();
    if (arch) { ctx.moveTo(x, y + h); ctx.lineTo(x, y + w / 2); ctx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); ctx.lineTo(x + w, y + h); ctx.closePath(); }
    else ctx.rect(x, y, w, h);
    ctx.fillStyle = lg(ctx, x, y, x, y + h, ['#fff4c4', '#ffc861', '#ea9433']);
    ctx.fill();
    ctx.strokeStyle = '#4a321d'; ctx.lineWidth = 1.1; ctx.stroke();
    line(ctx, x + w / 2, y + 0.6, x + w / 2, y + h, 'rgba(74,50,29,0.85)', 0.7);
    line(ctx, x + 0.4, y + h * 0.55, x + w - 0.4, y + h * 0.55, 'rgba(74,50,29,0.85)', 0.7);
    ctx.fillStyle = 'rgba(255,248,230,0.55)'; ctx.fillRect(x - 0.6, y + h, w + 1.2, 1);
    if (deco && deco.flowers && !arch) {
      /* jardinera con flores */
      ctx.beginPath(); ctx.rect(x - 1, y + h + 0.6, w + 2, 2.2); ctx.fillStyle = '#8a5a2e'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.5; ctx.stroke();
      const cols = ['#ff4f6a', '#ffd23f', '#ff8ac0', '#ffffff'];
      for (let k = 0; k < 5; k++) { ell(ctx, x - 0.4 + k * (w + 0.8) / 4, y + h + 0.2 - hash(k + x) * 0.8, 0.95, 0.95); ctx.fillStyle = cols[(k + Math.round(x)) % 4]; ctx.fill(); }
      for (let k = 0; k < 4; k++) { ell(ctx, x + 0.4 + k * w / 3.4, y + h + 0.9, 0.9, 0.55); ctx.fillStyle = '#3f9a34'; ctx.fill(); }
    }
  }
  function doorAt(ctx, x, y, w, h, col) {
    const c = col || '#7a4b26';
    ctx.beginPath();
    ctx.moveTo(x - 1, y + h); ctx.lineTo(x - 1, y + w / 2); ctx.arc(x + w / 2, y + w / 2, w / 2 + 1, Math.PI, 0); ctx.lineTo(x + w + 1, y + h); ctx.closePath();
    ctx.fillStyle = '#d9cbb0'; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y + h); ctx.lineTo(x, y + w / 2); ctx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); ctx.lineTo(x + w, y + h); ctx.closePath();
    ctx.fillStyle = lg(ctx, x, y, x + w, y, [U.shade(c, 0.18), c, U.shade(c, -0.32)]);
    ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.9; ctx.stroke();
    for (let i = 1; i < 3; i++) line(ctx, x + (w * i) / 3, y + 2, x + (w * i) / 3, y + h, 'rgba(40,24,10,0.45)', 0.6);
    line(ctx, x + 0.5, y + h * 0.45, x + w * 0.62, y + h * 0.45, 'rgba(30,30,34,0.75)', 0.8);
    line(ctx, x + 0.5, y + h * 0.78, x + w * 0.62, y + h * 0.78, 'rgba(30,30,34,0.75)', 0.8);
    ell(ctx, x + w * 0.76, y + h * 0.62, 0.75, 0.75); ctx.fillStyle = '#f0cf72'; ctx.fill();
    /* escalón de piedra */
    ctx.beginPath(); ctx.rect(x - 2, y + h - 0.2, w + 4, 2.2);
    ctx.fillStyle = lg(ctx, 0, y + h, 0, y + h + 2, ['#d8d0c2', '#9c9284']); ctx.fill();
    ctx.strokeStyle = 'rgba(40,30,20,0.6)'; ctx.lineWidth = 0.5; ctx.stroke();
  }

  /* ---------- casa con tejado a dos aguas en vista 3/4 ---------- */
  function house(ctx, o, F) {
    const R = roofCols(F);
    const x0 = o.x - o.w / 2, x1 = o.x + o.w / 2, yb = o.y, yt = o.y - o.h;
    const dx = o.d * 0.62, dy = o.d * 0.42;
    const wallF = o.wall || '#fff3d8', wallS = o.wallS || U.shade(wallF, -0.22);
    /* muro lateral */
    poly(ctx, [x1, yb, x1 + dx, yb - dy, x1 + dx, yt - dy, x1, yt]);
    fs(ctx, lg(ctx, x1, 0, x1 + dx, 0, [wallS, U.shade(wallS, -0.14)]), OUT, 0.9);
    ctx.save(); poly(ctx, [x1, yb, x1 + dx, yb - dy, x1 + dx, yt - dy, x1, yt]); ctx.clip();
    if (o.planks) for (let k = 0.2; k < 1; k += 0.2) line(ctx, x1 + dx * k, yb - dy * k, x1 + dx * k, yt - dy * k, 'rgba(50,28,12,0.3)', 0.6);
    ao(ctx, x1, yb + 1, dx + 1, o.h * 0.45);
    ctx.restore();
    /* muro frontal */
    ctx.beginPath(); ctx.rect(x0, yt, o.w, o.h);
    fs(ctx, lg(ctx, x0, yt, x1, yb, [U.shade(wallF, 0.1), wallF, U.shade(wallF, -0.1)]), OUT, 0.9);
    ctx.save(); ctx.beginPath(); ctx.rect(x0, yt, o.w, o.h); ctx.clip();
    if (o.stone) stoneTex(ctx, x0, yt, o.w, o.h, o.stone);
    if (o.planks) plankTex(ctx, x0, yt, o.w, o.h);
    if (!o.stone && !o.planks) {
      for (let i = 0; i < o.w * o.h / 40; i++) {
        ctx.fillStyle = (i % 2) ? 'rgba(255,255,255,0.12)' : 'rgba(120,90,50,0.08)';
        ctx.fillRect(x0 + ((i * 37) % o.w), yt + ((i * 53) % o.h), 2.2, 1.2);
      }
    }
    ao(ctx, x0, yb + 0.5, o.w, o.h * 0.4);
    const eg = ctx.createLinearGradient(0, yt, 0, yt + 5);
    eg.addColorStop(0, 'rgba(30,18,8,0.35)'); eg.addColorStop(1, 'rgba(30,18,8,0)');
    ctx.fillStyle = eg; ctx.fillRect(x0, yt, o.w, 5);
    ctx.restore();
    line(ctx, x1 - 0.4, yt + 1, x1 - 0.4, yb - 0.5, 'rgba(255,250,235,0.35)', 0.7);
    /* hastial */
    const rx = x1 + dx / 2, ry = yt - dy / 2 - o.rh;
    poly(ctx, [x1, yt, x1 + dx, yt - dy, rx, ry]);
    fs(ctx, lg(ctx, x1, 0, x1 + dx, 0, [U.shade(wallS, 0.1), U.shade(wallS, -0.05)]), OUT, 0.9);
    if (o.timber) {
      ctx.save(); ctx.globalAlpha = 0.8;
      const tc = '#6b4a2e';
      line(ctx, x0 + 1, yt + o.h * 0.46, x1 - 1, yt + o.h * 0.46, tc, 1.3);
      line(ctx, x0 + 1.4, yt + 1, x0 + 1.4, yb, tc, 1.5);
      line(ctx, x1 - 1.4, yt + 1, x1 - 1.4, yb, tc, 1.5);
      line(ctx, x0 + 2, yt + o.h * 0.46, x0 + o.w * 0.22, yt + 1, tc, 1);
      line(ctx, x1 - 2, yt + o.h * 0.46, x1 - o.w * 0.22, yt + 1, tc, 1);
      line(ctx, x1 + dx * 0.5, yt - dy * 0.5, rx, ry + 3, tc, 1);
      line(ctx, x1 + 1, yt - 0.5, x1 + dx - 1, yt - dy + 0.5, tc, 1.1);
      ctx.restore();
    }
    if (o.sideWin) {
      const sx = x1 + dx * 0.32, sy = yb - o.h * 0.72 - dy * 0.32;
      poly(ctx, [sx, sy, sx + dx * 0.32, sy - dy * 0.32, sx + dx * 0.32, sy - dy * 0.32 + 6, sx, sy + 6]);
      fs(ctx, lg(ctx, sx, sy, sx, sy + 6, ['#ffd27a', '#e48f34']), '#4a321d', 0.9);
    }
    if (o.door) doorAt(ctx, o.x + (o.doorX || 0) - 4, yb - Math.min(13, o.h * 0.68), 8, Math.min(13, o.h * 0.68), o.doorCol);
    const wdeco = o.timber ? { shutter: U.shade(F.id ? F.dark : '#7a5a3a', 0.05), flowers: o.w >= 30 } : null;
    (o.wins || []).forEach((w) => windowAt(ctx, o.x + w[0] - 3, yb - o.h + w[1], 6, 7, w[2], wdeco));
    /* chimenea */
    let smoke = null;
    if (o.chimney != null) {
      const cx = o.x + o.chimney, cy = ry + 2;
      ctx.beginPath(); ctx.rect(cx - 3, cy - 13, 6, 18);
      fs(ctx, lg(ctx, cx - 3, 0, cx + 3, 0, ['#b6a594', '#8a7b6c', '#665a4e']), OUT, 0.9);
      for (let yy = cy - 10; yy < cy + 4; yy += 3) line(ctx, cx - 3, yy, cx + 3, yy, 'rgba(60,50,40,0.35)', 0.5);
      ctx.beginPath(); ctx.rect(cx - 4, cy - 15, 8, 3); fs(ctx, lg(ctx, cx - 4, 0, cx + 4, 0, ['#8a7c70', '#5c5048']), OUT, 0.9);
      smoke = { x: cx, y: cy - 16 };
    }
    /* faldón frontal del tejado con tejas de escama */
    const oh = o.oh;
    const ex0 = x0 - oh, ex1 = x1 + oh * 0.55, ey = yt + oh * 0.55;
    const rlx = x0 + dx / 2 - oh * 0.55, rrx = x1 + dx / 2 + oh * 0.3;
    poly(ctx, [ex0, ey, ex1, ey, rrx, ry, rlx, ry]);
    fs(ctx, lg(ctx, 0, ry, 0, ey, [R.light, R.base, R.dark]), OUT, 1);
    ctx.save();
    poly(ctx, [ex0, ey, ex1, ey, rrx, ry, rlx, ry]); ctx.clip();
    const rows = Math.max(3, Math.round((ey - ry) / 3.6));
    for (let i = 1; i <= rows; i++) {
      const t = i / rows;
      const ly = U.lerp(ry, ey, t), lx0 = U.lerp(rlx, ex0, t), lx1 = U.lerp(rrx, ex1, t);
      const tw = 3.4, th = (ey - ry) / rows;
      ctx.beginPath();
      for (let k = lx0 + ((i % 2) * tw) / 2; k < lx1 + tw; k += tw) {
        ctx.moveTo(k - tw / 2, ly - th * 0.15);
        ctx.quadraticCurveTo(k, ly + th * 0.55, k + tw / 2, ly - th * 0.15);
      }
      ctx.strokeStyle = U.rgba(R.deep, 0.42); ctx.lineWidth = 0.6; ctx.stroke();
      ctx.strokeStyle = U.rgba(R.light, 0.25); ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(lx0, ly - th * 0.6); ctx.lineTo(lx1, ly - th * 0.6); ctx.stroke();
      /* cada teja con su tono: unas más claras, otras más gastadas */
      for (let k = lx0 + ((i % 2) * tw) / 2; k < lx1 + tw; k += tw) {
        const v = hash(k * 3.1 + i * 17.3 + o.x * 5);
        if (v > 0.62) { ctx.fillStyle = 'rgba(255,255,255,' + ((v - 0.62) * 0.4).toFixed(3) + ')'; ctx.fillRect(k - tw / 2 + 0.4, ly - th * 0.55, tw - 0.8, th * 0.6); }
        else if (v < 0.3) { ctx.fillStyle = U.rgba(R.deep, (0.3 - v) * 0.55); ctx.fillRect(k - tw / 2 + 0.4, ly - th * 0.55, tw - 0.8, th * 0.6); }
      }
    }
    /* musgo y verdín en la parte baja del tejado */
    for (let k = 0; k < 5; k++) {
      const v = hash(o.x * 7 + k * 13.7), mx = U.lerp(ex0 + 3, ex1 - 3, v), my = ey - 1.5 - hash(k * 5.3 + o.y) * (ey - ry) * 0.35;
      ell(ctx, mx, my, 2.2 + v * 2.5, 1 + v); ctx.fillStyle = 'rgba(98,130,46,0.2)'; ctx.fill();
    }
    const hg = ctx.createLinearGradient(0, ry, 0, ey);
    hg.addColorStop(0, 'rgba(255,255,255,0.28)'); hg.addColorStop(0.35, 'rgba(255,255,255,0.05)'); hg.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = hg; ctx.fillRect(ex0, ry, ex1 - ex0 + 10, ey - ry);
    ctx.restore();
    /* canto del tejado y cumbrera */
    const bx = x1 + dx + oh * 0.55, by = yt - dy + oh * 0.55;
    poly(ctx, [ex1, ey, rrx, ry, bx, by, bx + 1.5, by - 1.5, rrx + 1.5, ry - 1.5, ex1 + 1.5, ey - 1.5]);
    fs(ctx, lg(ctx, ex1, ey, bx, by, [R.dark, R.deep]), OUT, 0.9);
    line(ctx, rlx, ry, rrx, ry, R.deep, 2.6);
    line(ctx, rlx, ry - 0.6, rrx, ry - 0.6, U.rgba(R.light, 0.9), 0.9);
    for (let k = rlx + 2.5; k < rrx - 1; k += 3.2) line(ctx, k, ry - 1.2, k, ry + 1.2, U.rgba(R.deep, 0.75), 0.5);
    if (o.finial) {
      [rlx, rrx].forEach((fx) => { ell(ctx, fx, ry - 1.6, 1.4, 1.4); fs(ctx, rg(ctx, fx - 0.4, ry - 2, 0.1, 1.6, [[0, '#fff3b8'], [1, '#c8901e']]), '#6a430b', 0.5); });
    }
    return { ridgeY: ry, ridgeL: rlx, ridgeR: rrx, smoke, top: ry - (o.chimney != null ? 16 : 0) };
  }

  /* sillería con variación de tono por bloque */
  function stoneTex(ctx, x, y, w, h, col) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const rh = 4.5;
    let seed = Math.floor(x * 7 + y * 13 + w);
    for (let r = 0, yy = y; yy < y + h; r++, yy += rh) {
      for (let xx = x - (r % 2 ? 4 : 0); xx < x + w; xx += 8) {
        seed = (seed * 9301 + 49297) % 233280;
        const v = seed / 233280;
        ctx.fillStyle = v < 0.5 ? 'rgba(255,255,255,' + (0.05 + v * 0.18) + ')' : 'rgba(60,50,40,' + ((v - 0.5) * 0.22) + ')';
        ctx.fillRect(xx + 0.4, yy + 0.4, 7.2, rh - 0.8);
        ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(xx + 0.6, yy + 0.5, 6.6, 0.55);
        ctx.fillStyle = 'rgba(40,32,24,0.2)'; ctx.fillRect(xx + 0.6, yy + rh - 1.1, 6.6, 0.6);
        if (v > 0.93) line(ctx, xx + 2, yy + 0.8, xx + 3.5, yy + rh - 1, 'rgba(50,40,30,0.4)', 0.4);
        if (v > 0.15 && v < 0.19) { ell(ctx, xx + 4, yy + rh - 1.2, 2, 0.8); ctx.fillStyle = 'rgba(90,120,50,0.22)'; ctx.fill(); }
      }
      line(ctx, x, yy + rh, x + w, yy + rh, U.rgba(col, 0.42), 0.6);
      for (let xx = x + (r % 2 ? 3 : 7); xx < x + w; xx += 8) line(ctx, xx, yy, xx, yy + rh, U.rgba(col, 0.36), 0.55);
    }
    ctx.restore();
  }
  function plankTex(ctx, x, y, w, h) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    for (let xx = x + 3.5; xx < x + w; xx += 3.5) {
      line(ctx, xx, y, xx, y + h, 'rgba(60,35,15,0.36)', 0.6);
      line(ctx, xx + 0.8, y, xx + 0.8, y + h, 'rgba(255,230,190,0.12)', 0.5);
    }
    ctx.restore();
  }

  /* ---------- caja de piedra (castillo) con almenas ---------- */
  function keep(ctx, o, F) {
    const x0 = o.x - o.w / 2, x1 = o.x + o.w / 2, yb = o.y, yt = o.y - o.h;
    const dx = o.d * 0.62, dy = o.d * 0.42;
    const sF = o.col || '#e6dfd2', sS = U.shade(sF, -0.26);
    poly(ctx, [x1, yb, x1 + dx, yb - dy, x1 + dx, yt - dy, x1, yt]);
    fs(ctx, lg(ctx, x1, 0, x1 + dx, 0, [sS, U.shade(sS, -0.14)]), OUT, 0.9);
    ctx.save(); poly(ctx, [x1, yb, x1 + dx, yb - dy, x1 + dx, yt - dy, x1, yt]); ctx.clip();
    for (let yy = yt + 4.5; yy < yb + dy; yy += 4.5) line(ctx, x1, yy, x1 + dx, yy - dy, 'rgba(60,55,48,0.32)', 0.55);
    ao(ctx, x1, yb + 1, dx + 1, o.h * 0.4);
    ctx.restore();
    ctx.beginPath(); ctx.rect(x0, yt, o.w, o.h);
    fs(ctx, lg(ctx, x0, yt, x1, yb, [U.shade(sF, 0.12), sF, U.shade(sF, -0.1)]), OUT, 0.9);
    stoneTex(ctx, x0, yt, o.w, o.h, '#6e665a');
    ctx.save(); ctx.beginPath(); ctx.rect(x0, yt, o.w, o.h); ctx.clip();
    ao(ctx, x0, yb + 0.5, o.w, o.h * 0.38);
    ctx.fillStyle = 'rgba(70,60,50,0.28)'; ctx.fillRect(x0, yb - 3, o.w, 3);
    ctx.restore();
    line(ctx, x1 - 0.4, yt + 1, x1 - 0.4, yb - 0.5, 'rgba(255,250,235,0.4)', 0.7);
    /* adarve */
    poly(ctx, [x0, yt, x1, yt, x1 + dx, yt - dy, x0 + dx, yt - dy]);
    fs(ctx, lg(ctx, x0, yt - dy, x0, yt, ['#b2aa9e', '#8e8678']), OUT, 0.9);
    /* almenas */
    const mw = 4.2, mh = 4.5;
    for (let xx = x0; xx < x1 - 1; xx += mw * 1.9) {
      ctx.beginPath(); ctx.rect(xx, yt - mh, mw, mh);
      fs(ctx, lg(ctx, xx, 0, xx + mw, 0, [U.shade(sF, 0.12), U.shade(sF, -0.06)]), OUT, 0.8);
      line(ctx, xx + 0.4, yt - mh + 0.5, xx + mw - 0.4, yt - mh + 0.5, 'rgba(255,255,255,0.5)', 0.5);
    }
    for (let k = 0.15; k < 1; k += 0.32) {
      const px = x1 + dx * k, py = yt - dy * k;
      poly(ctx, [px, py, px + mw * 0.5, py - mw * 0.35, px + mw * 0.5, py - mw * 0.35 - mh, px, py - mh]);
      fs(ctx, sS, OUT, 0.8);
    }
    if (o.gate) {
      const gw = Math.min(14, o.w * 0.32), gh = Math.min(18, o.h * 0.5);
      ctx.beginPath();
      ctx.moveTo(o.x - gw / 2 - 1.5, yb); ctx.lineTo(o.x - gw / 2 - 1.5, yb - gh + gw / 2); ctx.arc(o.x, yb - gh + gw / 2, gw / 2 + 1.5, Math.PI, 0); ctx.lineTo(o.x + gw / 2 + 1.5, yb); ctx.closePath();
      fs(ctx, '#bfb5a4', OUT, 0.8);
      ctx.beginPath();
      ctx.moveTo(o.x - gw / 2, yb); ctx.lineTo(o.x - gw / 2, yb - gh + gw / 2); ctx.arc(o.x, yb - gh + gw / 2, gw / 2, Math.PI, 0); ctx.lineTo(o.x + gw / 2, yb); ctx.closePath();
      fs(ctx, lg(ctx, 0, yb - gh, 0, yb, ['#140c06', '#3a2414']), OUT, 1);
      ctx.save(); ctx.clip();
      for (let xx = o.x - gw / 2 + 2; xx < o.x + gw / 2; xx += 3) line(ctx, xx, yb - gh, xx, yb - 2, 'rgba(170,160,150,0.75)', 0.7);
      for (let yy = yb - gh + 4; yy < yb - 2; yy += 3.5) line(ctx, o.x - gw / 2, yy, o.x + gw / 2, yy, 'rgba(170,160,150,0.75)', 0.7);
      ctx.restore();
    }
    (o.slits || []).forEach((s) => {
      ctx.beginPath(); ctx.rect(o.x + s[0] - 1.1, yt + s[1], 2.2, 6.5); fs(ctx, '#1d130b');
      ctx.fillStyle = 'rgba(255,190,90,0.55)'; ctx.fillRect(o.x + s[0] - 0.5, yt + s[1] + 3, 1, 2.5);
    });
    return { topY: yt - mh, dx, dy };
  }

  /* estandarte colgante con ribete dorado y borlas */
  function banner(ctx, x, y, w, h, F) {
    poly(ctx, [x - w / 2, y, x + w / 2, y, x + w / 2, y + h, x, y + h - w * 0.45, x - w / 2, y + h]);
    fs(ctx, lg(ctx, x - w / 2, 0, x + w / 2, 0, [U.shade(F.color, 0.2), F.color, U.shade(F.color, -0.3)]), OUT, 0.8);
    ctx.save();
    poly(ctx, [x - w / 2, y, x + w / 2, y, x + w / 2, y + h, x, y + h - w * 0.45, x - w / 2, y + h]); ctx.clip();
    ctx.strokeStyle = '#f2cf6e'; ctx.lineWidth = 0.9;
    poly(ctx, [x - w / 2 + 1, y + 0.5, x + w / 2 - 1, y + 0.5, x + w / 2 - 1, y + h - 1, x, y + h - w * 0.45 - 1, x - w / 2 + 1, y + h - 1]); ctx.stroke();
    ctx.restore();
    poly(ctx, [x, y + h * 0.2, x + w * 0.24, y + h * 0.44, x, y + h * 0.68, x - w * 0.24, y + h * 0.44]);
    fs(ctx, F.id === 0 ? '#efe9dc' : '#ffe39a', 'rgba(90,60,10,0.6)', 0.5);
    line(ctx, x - w / 2 - 1.8, y, x + w / 2 + 1.8, y, '#5a3d22', 1.5);
    [x - w / 2, x + w / 2].forEach((tx) => { ell(ctx, tx, y + h + 0.9, 0.7, 1.1); ctx.fillStyle = '#f2cf6e'; ctx.fill(); });
  }

  /* ---------- torre cilíndrica ---------- */
  function cylinder(ctx, x, yb, r, h, col, stone) {
    const ry = r * 0.34, yt = yb - h;
    const shape = () => { ctx.beginPath(); ctx.moveTo(x - r, yt); ctx.lineTo(x - r, yb); ctx.ellipse(x, yb, r, ry, 0, Math.PI, 0, true); ctx.lineTo(x + r, yt); ctx.closePath(); };
    shape();
    const g = ctx.createLinearGradient(x - r, 0, x + r, 0);
    g.addColorStop(0, U.shade(col, -0.36)); g.addColorStop(0.28, U.shade(col, 0.2)); g.addColorStop(0.45, U.shade(col, 0.08));
    g.addColorStop(0.75, U.shade(col, -0.2)); g.addColorStop(1, U.shade(col, -0.46));
    fs(ctx, g, OUT, 0.9);
    ctx.save(); shape(); ctx.clip();
    if (stone) {
      let row = 0, seed = Math.floor(x * 11 + yb * 3 + r);
      for (let yy = yt; yy < yb + ry; yy += 5, row++) {
        for (let k = -1 + (row % 2) * 0.22; k < 1; k += 0.44) {
          seed = (seed * 9301 + 49297) % 233280;
          const v = seed / 233280;
          const px = x + Math.sin(k * 1.4) * r, pw = Math.cos(k * 1.4) * r * 0.42;
          ctx.fillStyle = v < 0.5 ? 'rgba(255,255,255,' + (0.04 + v * 0.16) + ')' : 'rgba(50,42,34,' + ((v - 0.5) * 0.24) + ')';
          ctx.fillRect(px - pw / 2, yy + ry * Math.cos(k) + 0.5, pw, 4);
        }
        ctx.beginPath(); ctx.ellipse(x, yy + 5, r, ry, 0, 0, Math.PI);
        ctx.strokeStyle = 'rgba(60,52,44,0.38)'; ctx.lineWidth = 0.6; ctx.stroke();
      }
    }
    const ag = ctx.createLinearGradient(0, yb - h * 0.35, 0, yb + ry);
    ag.addColorStop(0, 'rgba(30,18,8,0)'); ag.addColorStop(1, 'rgba(30,18,8,0.3)');
    ctx.fillStyle = ag; ctx.fillRect(x - r, yb - h * 0.35, r * 2, h * 0.35 + ry);
    ctx.restore();
    return yt;
  }
  function cone(ctx, x, yb, r, h, F) {
    const R = roofCols(F);
    const ry = r * 0.34;
    const shape = () => { ctx.beginPath(); ctx.moveTo(x - r, yb); ctx.lineTo(x, yb - h); ctx.lineTo(x + r, yb); ctx.ellipse(x, yb, r, ry, 0, 0, Math.PI, false); ctx.closePath(); };
    shape();
    const g = ctx.createLinearGradient(x - r, 0, x + r, 0);
    g.addColorStop(0, R.dark); g.addColorStop(0.32, R.light); g.addColorStop(0.55, R.base); g.addColorStop(1, R.deep);
    fs(ctx, g, OUT, 1);
    ctx.save(); shape(); ctx.clip();
    for (let t = 0.22; t < 1.05; t += 0.13) {
      const yy = yb - h + h * t, rr = r * t;
      ctx.beginPath();
      for (let k = -rr; k <= rr; k += 2.6) ctx.arc(x + k, yy, 1.3, 0, Math.PI);
      ctx.strokeStyle = U.rgba(R.deep, 0.35); ctx.lineWidth = 0.5; ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath(); ctx.moveTo(x - 0.4, yb - h + 1); ctx.lineTo(x - r * 0.42, yb + ry * 0.4); ctx.lineTo(x - r * 0.2, yb + ry * 0.6); ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.ellipse(x, yb, r, ry, 0, 0, Math.PI); ctx.strokeStyle = U.rgba(R.deep, 0.8); ctx.lineWidth = 1.1; ctx.stroke();
    ell(ctx, x, yb - h - 0.8, 1.3, 1.3);
    fs(ctx, rg(ctx, x - 0.4, yb - h - 1.2, 0.1, 1.5, [[0, '#fff3b8'], [1, '#c8901e']]), '#6a430b', 0.5);
    return yb - h - 1.5;
  }
  function pole(ctx, x, y0, y1) {
    line(ctx, x, y0, x, y1, '#4a3420', 1.5);
    line(ctx, x - 0.4, y0, x - 0.4, y1, 'rgba(255,230,190,0.35)', 0.5);
    ell(ctx, x, y1, 1.5, 1.5);
    fs(ctx, rg(ctx, x - 0.5, y1 - 0.5, 0.1, 1.6, [[0, '#fff3b8'], [1, '#c8901e']]), '#6a430b', 0.5);
  }

  /* ---------- EDIFICIOS ---------- */
  const DRAW = {};

  DRAW.aldea = function (ctx, L, F) {
    const m = { smoke: [], glow: [] };
    if (L === 1) {
      pad(ctx, 26);
      const h = house(ctx, { x: -3, y: 6, w: 30, h: 17, d: 17, rh: 14, oh: 4, timber: true, door: true, wins: [[9, 4]], chimney: 7, sideWin: false }, F);
      m.smoke.push(h.smoke); pole(ctx, -18, 4, -26); m.flag = { x: -18, y: -26 }; m.top = h.top;
      hay(ctx, 18, 9, 0.8);
    } else if (L === 2) {
      pad(ctx, 30);
      const h = house(ctx, { x: -2, y: 7, w: 38, h: 22, d: 20, rh: 17, oh: 4.5, timber: true, door: true, doorX: -8, wins: [[3, 4], [11, 4]], chimney: 9, sideWin: true }, F);
      m.smoke.push(h.smoke); pole(ctx, -22, 5, -34); m.flag = { x: -22, y: -34 }; m.top = h.top;
      barrel(ctx, 22, 10);
    } else if (L === 3) {
      pad(ctx, 34);
      const a = house(ctx, { x: -19, y: 3, w: 22, h: 15, d: 14, rh: 12, oh: 3.5, timber: true, wins: [[0, 4]] }, F);
      const h = house(ctx, { x: 6, y: 9, w: 34, h: 25, d: 20, rh: 18, oh: 4.5, timber: true, door: true, doorX: -6, wins: [[5, 4], [12, 4]], chimney: 10, sideWin: true, finial: true }, F);
      m.smoke.push(h.smoke); pole(ctx, -28, 0, -36); m.flag = { x: -28, y: -36 }; m.top = Math.min(a.top, h.top);
      fence(ctx, 22, 16, 18);
    } else {
      pad(ctx, 38);
      const a = house(ctx, { x: -22, y: 4, w: 22, h: 17, d: 15, rh: 13, oh: 3.5, timber: true, wins: [[0, 4]], chimney: -2 }, F);
      m.smoke.push(a.smoke);
      /* casa señorial de dos plantas */
      const h = house(ctx, { x: 5, y: 10, w: 36, h: 36, d: 22, rh: 19, oh: 5, timber: true, door: true, doorX: -7, wins: [[5, 5, true], [12, 5, true], [5, 19], [12, 19], [-12, 5, true]], chimney: 12, sideWin: true, finial: true }, F);
      m.smoke.push(h.smoke);
      banner(ctx, -8, -20, 7, 11, F);
      pole(ctx, h.ridgeL + 3, h.ridgeY + 2, h.ridgeY - 16); m.flag = { x: h.ridgeL + 3, y: h.ridgeY - 16 };
      m.top = h.ridgeY - 16;
      barrel(ctx, 27, 13); hay(ctx, -36, 11, 0.7);
    }
    return m;
  };

  DRAW.castillo = function (ctx, L, F) {
    const m = { smoke: [], glow: [] };
    const turret = (x, yb, r, h) => {
      cylinder(ctx, x, yb, r, h, '#e0d8ca', true);
      const yt = yb - h;
      ell(ctx, x, yt, r, r * 0.34); fs(ctx, '#8d857a', OUT, 1);
      cone(ctx, x, yt + 1, r + 3, r * 2.2 + 4, F);
      return yt - r * 2.2 - 4;
    };
    if (L === 1) {
      pad(ctx, 32);
      const k = keep(ctx, { x: -3, y: 8, w: 40, h: 34, d: 22, gate: true, slits: [[-12, 8], [12, 8]] }, F);
      banner(ctx, -3, -22, 8, 12, F);
      pole(ctx, 10, k.topY + 2, k.topY - 20); m.flag = { x: 10, y: k.topY - 20 }; m.top = k.topY - 20;
    } else if (L === 2) {
      pad(ctx, 36);
      const k = keep(ctx, { x: -2, y: 8, w: 44, h: 38, d: 24, gate: true, slits: [[-13, 8], [13, 8], [0, 3]] }, F);
      const t1 = turret(-24, 10, 7, 30), t2 = turret(22, 10, 7, 30);
      banner(ctx, -2, -26, 8, 13, F);
      pole(ctx, 6, k.topY + 2, k.topY - 22); m.flag = { x: 6, y: k.topY - 22 };
      m.top = Math.min(t1, t2, k.topY - 22);
    } else if (L === 3) {
      pad(ctx, 40);
      /* torre del homenaje trasera */
      const k0 = keep(ctx, { x: 6, y: -6, w: 26, h: 44, d: 16, slits: [[0, 8], [0, 20]] }, F);
      const k = keep(ctx, { x: -2, y: 10, w: 54, h: 30, d: 22, gate: true, slits: [[-17, 8], [17, 8]] }, F);
      const t1 = turret(-29, 12, 8, 36), t2 = turret(27, 12, 8, 36);
      banner(ctx, -15, -12, 7, 11, F); banner(ctx, 12, -12, 7, 11, F);
      pole(ctx, 10, k0.topY + 2, k0.topY - 22); m.flag = { x: 10, y: k0.topY - 22 };
      m.top = Math.min(t1, t2, k0.topY - 22);
    } else {
      pad(ctx, 44);
      const kk = keep(ctx, { x: 4, y: -10, w: 30, h: 54, d: 18, slits: [[0, 8], [0, 20], [0, 32]] }, F);
      /* aguja central */
      ell(ctx, 4 + 6, kk.topY + 2, 9, 3); ctx.fillStyle = '#8d857a'; ctx.fill();
      const ct = cone(ctx, 10, kk.topY + 1, 13, 26, F);
      const k = keep(ctx, { x: -2, y: 12, w: 60, h: 30, d: 24, gate: true, slits: [[-20, 8], [20, 8], [-8, 8], [8, 8]] }, F);
      const t1 = turret(-33, 14, 9, 42), t2 = turret(31, 14, 9, 42);
      banner(ctx, -16, -14, 7, 12, F); banner(ctx, 12, -14, 7, 12, F);
      pole(ctx, 10, ct + 1, ct - 16); m.flag = { x: 10, y: ct - 16 };
      m.top = Math.min(t1, t2, ct - 16);
    }
    return m;
  };

  DRAW.torre = function (ctx, L, F) {
    const m = { smoke: [], glow: [] };
    const r = [10, 11.5, 13][L - 1], h = [44, 52, 60][L - 1];
    pad(ctx, 22 + L * 3);
    /* zócalo */
    cylinder(ctx, 0, 6, r + 4, 10, '#cac2b3', true);
    const yt = cylinder(ctx, 0, -2, r, h, '#e3dbcc', true);
    /* troneras */
    for (let i = 0; i < L + 1; i++) { ctx.beginPath(); ctx.rect(-1.2 + (i % 2 ? 4 : -4), -14 - i * 12, 2.4, 6); fs(ctx, '#2a1d14'); }
    /* cadalso de madera */
    const hr = r + 4, hy = yt + 2;
    cylinder(ctx, 0, hy, hr, 10, '#c27e40', false);
    ctx.save();
    for (let k = -0.85; k <= 0.86; k += 0.34) {
      const px = Math.sin(k * 1.35) * hr;
      line(ctx, px, hy - 10, px, hy + 3 * Math.cos(k), 'rgba(50,30,12,0.55)', 0.8);
    }
    ctx.restore();
    for (let k = -0.6; k <= 0.61; k += 0.6) { const px = Math.sin(k * 1.3) * hr; ctx.beginPath(); ctx.rect(px - 1, hy - 7, 2, 4); fs(ctx, '#21160e'); }
    ell(ctx, 0, hy - 10, hr, hr * 0.34); fs(ctx, '#8c5a2e', OUT, 1);
    const ct = cone(ctx, 0, hy - 9, hr + 4, 22 + L * 4, F);
    if (L === 3) banner(ctx, 0, -32, 7, 12, F);
    pole(ctx, 0, ct + 1, ct - 14); m.flag = { x: 0, y: ct - 14 };
    m.top = ct - 14; m.shoot = { x: 0, y: hy - 6 };
    return m;
  };

  DRAW.establo = function (ctx, L, F) {
    const m = { smoke: [], glow: [] };
    const w = [44, 50, 56][L - 1], hh = [20, 23, 26][L - 1];
    pad(ctx, 32 + L * 3);
    if (L === 3) {
      /* silo */
      cylinder(ctx, -30, 2, 7, 30, '#a07446', false);
      cone(ctx, -30, -28, 9, 12, F);
    }
    const h = house(ctx, { x: -2 + (L === 3 ? 6 : 0), y: 8, w, h: hh, d: 22, rh: 16 + L * 2, oh: 4, wall: '#d48a44', wallS: '#9c5e2c', planks: true }, F);
    /* portón con cruz */
    const gx = -2 + (L === 3 ? 6 : 0), gw = 15, gh = hh * 0.78;
    ctx.beginPath(); ctx.rect(gx - gw / 2, 8 - gh, gw, gh); fs(ctx, '#5e3a1c', OUT, 1.1);
    line(ctx, gx - gw / 2 + 1, 8 - gh + 1, gx + gw / 2 - 1, 7, '#f1e6cc', 1.5);
    line(ctx, gx + gw / 2 - 1, 8 - gh + 1, gx - gw / 2 + 1, 7, '#f1e6cc', 1.5);
    ctx.beginPath(); ctx.rect(gx - gw / 2, 8 - gh, gw, gh); ctx.strokeStyle = '#f1e6cc'; ctx.lineWidth = 1.2; ctx.stroke();
    /* ventana de heno */
    ctx.beginPath(); ctx.rect(gx - 4, 8 - hh + 2, 8, 5); fs(ctx, '#3a2412', OUT, 0.9);
    ctx.beginPath(); ctx.rect(gx - 3, 8 - hh + 4.5, 6, 2.5); fs(ctx, '#e9c55a');
    /* herradura */
    ctx.beginPath(); ctx.arc(gx + gw / 2 + 5, 8 - hh * 0.62, 3, 0.2 * Math.PI, 0.8 * Math.PI, true);
    ctx.strokeStyle = '#d9d2c3'; ctx.lineWidth = 1.6; ctx.stroke();
    fence(ctx, w / 2 + 6 + (L === 3 ? 4 : 0), 14, 18 + L * 3);
    hay(ctx, -w / 2 - 6 + (L === 3 ? 10 : 0), 13, 0.9);
    /* veleta */
    const vx = (h.ridgeL + h.ridgeR) / 2;
    pole(ctx, vx, h.ridgeY + 1, h.ridgeY - 14); m.flag = { x: vx, y: h.ridgeY - 14 };
    m.top = h.ridgeY - 14;
    return m;
  };

  DRAW.herreria = function (ctx, L, F) {
    const m = { smoke: [], glow: [] };
    const w = [40, 46, 52][L - 1], hh = [22, 25, 28][L - 1];
    pad(ctx, 32 + L * 3);
    /* chimenea grande */
    const chim = (cx, ch) => {
      ctx.beginPath(); ctx.rect(cx - 5, 8 - hh - ch, 10, ch + hh - 4);
      fs(ctx, lg(ctx, cx - 5, 0, cx + 5, 0, ['#9c8e80', '#6d6157']), OUT, 1);
      stoneTex(ctx, cx - 5, 8 - hh - ch, 10, ch + hh - 4, '#4f463e');
      ctx.beginPath(); ctx.rect(cx - 6, 8 - hh - ch - 3, 12, 4); fs(ctx, '#5a4f46', OUT, 1);
      ell(ctx, cx, 8 - hh - ch - 3, 4, 1.4); ctx.fillStyle = '#ff9a2e'; ctx.fill();
      m.smoke.push({ x: cx, y: 8 - hh - ch - 4, dark: true });
      m.glow.push({ x: cx, y: 8 - hh - ch - 3, r: 7 });
    };
    chim(-w / 2 + 8, 18 + L * 4);
    if (L === 3) chim(w / 2 - 2, 14);
    const h = house(ctx, { x: 0, y: 8, w, h: hh, d: 22, rh: 14 + L * 2, oh: 4, wall: '#ddd5c6', wallS: '#aba293', stone: '#5d554b' }, F);
    /* fragua abierta */
    const fx = -4, fw = 16, fh = hh * 0.7;
    ctx.beginPath();
    ctx.moveTo(fx - fw / 2, 8); ctx.lineTo(fx - fw / 2, 8 - fh + fw / 2); ctx.arc(fx, 8 - fh + fw / 2, fw / 2, Math.PI, 0); ctx.lineTo(fx + fw / 2, 8); ctx.closePath();
    fs(ctx, rg(ctx, fx, 4, 1, fw, [[0, '#ffe08a'], [0.35, '#ff8a1e'], [0.75, '#b0300c'], [1, '#3b1206']]), OUT, 1.2);
    m.glow.push({ x: fx, y: 2, r: 16, forge: true });
    /* yunque */
    poly(ctx, [fx + 9, 12, fx + 19, 12, fx + 17, 9, fx + 21, 6, fx + 9, 6, fx + 11, 9]);
    fs(ctx, '#3c3f45', OUT, 1);
    line(ctx, fx + 9, 6.2, fx + 21, 6.2, '#8a9099', 0.8);
    /* letrero */
    line(ctx, w / 2 - 4, 8 - hh + 3, w / 2 + 6, 8 - hh + 3, '#4a3420', 1.4);
    ctx.beginPath(); ctx.rect(w / 2 + 1, 8 - hh + 4, 9, 7); fs(ctx, '#d8b77a', OUT, 0.9);
    line(ctx, w / 2 + 3, 8 - hh + 10, w / 2 + 7.5, 8 - hh + 5.5, '#4a3420', 1.2);
    ctx.beginPath(); ctx.rect(w / 2 + 6, 8 - hh + 4.5, 3, 2); fs(ctx, '#4a3420');
    if (L >= 2) barrel(ctx, -w / 2 - 5, 12);
    if (L === 3) rack(ctx, w / 2 + 12, 14);
    pole(ctx, h.ridgeR - 2, h.ridgeY + 1, h.ridgeY - 13); m.flag = { x: h.ridgeR - 2, y: h.ridgeY - 13 };
    m.top = Math.min(h.ridgeY - 13, 8 - hh - (18 + L * 4) - 6);
    return m;
  };

  /* pequeños accesorios */
  function hay(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ell(ctx, 0, 0, 7, 5); fs(ctx, lg(ctx, -7, -5, 7, 5, ['#f6dd7c', '#d7a83c']), OUT, 1);
    for (let i = -5; i <= 5; i += 2.5) line(ctx, i, -3.5, i + 1, 3.5, 'rgba(140,100,20,0.6)', 0.6);
    ctx.restore();
  }
  function barrel(ctx, x, y) {
    ctx.beginPath(); ctx.rect(x - 4, y - 9, 8, 9);
    fs(ctx, lg(ctx, x - 4, 0, x + 4, 0, ['#8a5a2e', '#b07a42', '#6a421f']), OUT, 1);
    line(ctx, x - 4, y - 6.5, x + 4, y - 6.5, '#3d3d3d', 1); line(ctx, x - 4, y - 2.5, x + 4, y - 2.5, '#3d3d3d', 1);
    ell(ctx, x, y - 9, 4, 1.3); fs(ctx, '#6a421f', OUT, 0.8);
  }
  function fence(ctx, x, y, len) {
    for (let i = 0; i <= len; i += 6) { ctx.beginPath(); ctx.rect(x + i - 1, y - 9 - i * 0.3, 2, 9); fs(ctx, '#8a5e34', OUT, 0.7); }
    line(ctx, x - 1, y - 7, x + len + 1, y - 7 - len * 0.3, '#a8743f', 1.3);
    line(ctx, x - 1, y - 3.5, x + len + 1, y - 3.5 - len * 0.3, '#a8743f', 1.3);
  }
  function rack(ctx, x, y) {
    line(ctx, x - 5, y, x - 5, y - 12, '#6b4a2e', 1.4); line(ctx, x + 5, y - 3, x + 5, y - 15, '#6b4a2e', 1.4);
    line(ctx, x - 6, y - 10, x + 6, y - 13, '#6b4a2e', 1.4);
    for (let i = -3; i <= 3; i += 3) line(ctx, x + i, y - 1 - (i + 3) * 0.25, x + i + 1, y - 17 - (i + 3) * 0.25, '#b9bec6', 1);
  }

  /* ---------- caché de sprites de edificios ---------- */
  const BW = 176, BH = 150, BAX = 66, BAY = 112;   /* hueco a la derecha para la sombra proyectada */
  const bcache = new Map();
  A.building = function (type, level, owner) {
    const key = type + level + '_' + owner;
    let s = bcache.get(key);
    if (s) return s;
    const F = FF.FACTIONS[owner];
    const c = A.canvas(BW, BH);
    const ctx = c.getContext('2d');
    ctx.scale(SPR, SPR); ctx.translate(BAX, BAY);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const meta = DRAW[type](ctx, level, F);
    castShadow(c, 0.3);
    A.vivid(c);
    s = { c, ax: BAX, ay: BAY, w: BW, h: BH, meta };
    bcache.set(key, s);
    return s;
  };

  /* Sombra proyectada: la silueta del edificio tumbada en el suelo hacia abajo a la derecha (el sol
     viene de arriba a la izquierda), suave y semitransparente, por detrás del edificio. */
  function castShadow(c, alpha) {
    const t = document.createElement('canvas');
    t.width = c.width; t.height = c.height;
    const x = t.getContext('2d');
    x.drawImage(c, 0, 0);
    x.globalCompositeOperation = 'source-in'; x.fillStyle = '#1a0e04'; x.fillRect(0, 0, t.width, t.height);
    const sh = document.createElement('canvas');
    sh.width = c.width; sh.height = c.height;
    const y = sh.getContext('2d'), ay = BAY * SPR;
    if (FILTER_OK) y.filter = 'blur(' + (1.4 * SPR).toFixed(1) + 'px)';
    y.globalAlpha = alpha;
    y.setTransform(1, 0, -0.62, -0.3, 0.62 * ay, 1.3 * ay);   /* (x, y) → (x − 0,62·(y − ay), ay − 0,3·(y − ay)) */
    y.drawImage(t, 0, 0);
    y.filter = 'none'; y.globalAlpha = 1; y.setTransform(1, 0, 0, 1, 0, 0);
    y.drawImage(c, 0, 0);
    const cx = c.getContext('2d');
    cx.save(); cx.setTransform(1, 0, 0, 1, 0, 0); cx.globalCompositeOperation = 'copy'; cx.drawImage(sh, 0, 0); cx.restore();
  }
  A.clearCache = function () { bcache.clear(); ucache.clear(); };

  /* ---------- TROPAS (sprites de alta resolución, 6 fotogramas) ---------- */
  const FR = A.FRAMES = 6;
  A.UNIT_SCALE = 0.9;
  const SKIN = ['#f8d8b4', '#dea77a'];
  const STEEL = ['#f4f7fa', '#c6cdd6', '#848d98', '#59616b'];
  const OUTU = 'rgba(22,12,4,0.92)';

  function softShadow(ctx, x, y, rx, ry) {
    ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, 'rgba(0,0,0,0.4)'); g.addColorStop(0.55, 'rgba(0,0,0,0.2)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, U.TAU); ctx.fill();
    ctx.restore();
  }
  const steelG = (ctx, x0, x1) => lg(ctx, x0, 0, x1, 0, [STEEL[0], STEEL[1], STEEL[2], STEEL[3]]);
  const teamG = (ctx, F, x0, x1) => lg(ctx, x0, 0, x1, 0, [U.shade(F.color, 0.34), F.color, U.shade(F.color, -0.36)]);
  function limb(ctx, x0, y0, x1, y1, w, col) {
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
    ctx.lineWidth = w + 1.1; ctx.strokeStyle = OUTU; ctx.stroke();
    ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke();
  }
  function boot(ctx, x, y, col) {
    ell(ctx, x + 0.35, y - 0.55, 1.4, 0.9);
    fs(ctx, col || '#3a2616', OUTU, 0.45);
  }
  function head(ctx, x, y, r) {
    ell(ctx, x, y, r, r);
    fs(ctx, rg(ctx, x - r * 0.35, y - r * 0.3, 0.2, r * 1.25, [[0, SKIN[0]], [1, SKIN[1]]]), OUTU, 0.55);
    ell(ctx, x + r * 0.2, y + r * 0.42, r * 0.24, r * 0.15); ctx.fillStyle = 'rgba(255,110,100,0.5)'; ctx.fill();
    ell(ctx, x + r * 0.5, y + 0.1, r * 0.15, r * 0.2); ctx.fillStyle = '#1e120a'; ctx.fill();
    ell(ctx, x + r * 0.54, y - r * 0.03, r * 0.055, r * 0.065); ctx.fillStyle = '#ffffff'; ctx.fill();
  }
  function helmet(ctx, x, y, r) {
    ctx.beginPath(); ctx.arc(x, y, r, Math.PI, 0); ctx.lineTo(x + r, y + 0.4); ctx.lineTo(x - r, y + 0.4); ctx.closePath();
    fs(ctx, steelG(ctx, x - r, x + r), OUTU, 0.55);
    ctx.beginPath(); ctx.arc(x - r * 0.2, y - r * 0.2, r * 0.55, Math.PI * 1.08, Math.PI * 1.6);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 0.55; ctx.stroke();
    line(ctx, x - r - 0.3, y + 0.45, x + r + 0.3, y + 0.45, STEEL[3], 0.8);
  }
  function spearTip(ctx, x0, y0, x1, y1, len, w) {
    const L = Math.hypot(x1 - x0, y1 - y0) || 1, dx = (x1 - x0) / L, dy = (y1 - y0) / L, nx = -dy, ny = dx;
    poly(ctx, [x1 + nx * w, y1 + ny * w, x1 + dx * len, y1 + dy * len, x1 - nx * w, y1 - ny * w, x1 - dx * 0.6, y1 - dy * 0.6]);
    fs(ctx, steelG(ctx, x1 - w, x1 + w), OUTU, 0.4);
  }

  function drawSoldier(ctx, F, fr) {
    const ph = (fr / FR) * U.TAU;
    const sw = Math.sin(ph), bob = Math.abs(Math.cos(ph)) * 0.65;
    softShadow(ctx, 0.3, 0, 5.2, 1.8);
    const hipY = -5.4 - bob;
    const bx = -0.6 - sw * 1.7, fx = 0.8 + sw * 1.7;
    const by = -Math.max(0, -sw) * 0.9, fy = -Math.max(0, sw) * 0.9;
    limb(ctx, -0.5, hipY, bx, -1 + by, 1.7, '#4a3524');
    boot(ctx, bx, by, '#2c1d12');
    /* lanza a la espalda */
    const sx0 = 3.1, sy0 = -1.2 - bob, sx1 = 6.0, sy1 = -20.8 - bob;
    limb(ctx, sx0, sy0, sx1, sy1, 0.95, '#93622f');
    spearTip(ctx, sx0, sy0, sx1, sy1, 3.4, 1.05);
    limb(ctx, 0.6, hipY, fx, -1 + fy, 1.85, '#5a412c');
    boot(ctx, fx, fy, '#3a2616');
    /* túnica */
    ctx.beginPath();
    ctx.moveTo(-2.7, -12.7 - bob);
    ctx.quadraticCurveTo(0.2, -13.8 - bob, 2.9, -12.7 - bob);
    ctx.lineTo(3.6, -5.7 - bob);
    ctx.quadraticCurveTo(0.4, -4.2 - bob, -3.5, -5.7 - bob);
    ctx.closePath();
    fs(ctx, teamG(ctx, F, -3.5, 3.6), OUTU, 0.6);
    line(ctx, 0.2, -12.6 - bob, 0.35, -6.1 - bob, U.rgba(F.light, 0.55), 0.6);
    ctx.fillStyle = '#5a3a1e'; ctx.fillRect(-3.25, -7.8 - bob, 6.75, 1.3);
    ctx.fillStyle = '#f0cf72'; ctx.fillRect(-0.1, -7.75 - bob, 1.2, 1.2);
    /* cabeza y casco */
    head(ctx, 0.5, -15.9 - bob, 3.0);
    helmet(ctx, 0.5, -16.6 - bob, 3.3);
    line(ctx, 2.7, -16.4 - bob, 2.8, -14.5 - bob, STEEL[2], 0.7);
    /* escudo redondo */
    const shx = 3.1, shy = -9.4 - bob;
    ell(ctx, shx, shy, 3.05, 3.55);
    fs(ctx, rg(ctx, shx - 1, shy - 1.2, 0.3, 3.9, [[0, U.shade(F.color, 0.48)], [0.6, F.color], [1, U.shade(F.color, -0.42)]]), OUTU, 0.6);
    ctx.beginPath(); ctx.ellipse(shx, shy, 2.55, 3.05, 0, 0, U.TAU); ctx.strokeStyle = '#f0cf72'; ctx.lineWidth = 0.6; ctx.stroke();
    ell(ctx, shx, shy, 0.8, 0.9); fs(ctx, rg(ctx, shx - 0.25, shy - 0.3, 0.05, 1, [[0, '#fff3b8'], [1, '#b8801a']]));
    ctx.beginPath(); ctx.ellipse(shx - 0.95, shy - 1.35, 0.95, 0.5, -0.6, 0, U.TAU); ctx.fillStyle = 'rgba(255,255,255,0.38)'; ctx.fill();
  }

  function horseLeg(ctx, x, y, a, col) {
    const kx = x + Math.sin(a) * 2.3, ky = y + 2.7;
    const fx = kx + Math.sin(a * 1.4) * 1.9, fy = -0.45;
    limb(ctx, x, y, kx, ky, 1.55, col);
    limb(ctx, kx, ky, fx, fy, 1.15, col);
    ell(ctx, fx + 0.25, -0.35, 0.9, 0.55); ctx.fillStyle = '#1e140c'; ctx.fill();
  }
  function drawRider(ctx, F, fr) {
    const ph = (fr / FR) * U.TAU;
    const g1 = Math.sin(ph), g2 = Math.sin(ph + Math.PI * 0.6);
    const b = Math.sin(ph * 2) * 0.45;
    softShadow(ctx, 0.6, 0, 10.5, 2.4);
    const HC = ['#b8794a', '#8c5631', '#5c3317'];
    horseLeg(ctx, 4.7, -6.3 + b, g2 * 0.8, '#5e3a1c');
    horseLeg(ctx, -4.6, -6.7 + b, -g2 * 0.8, '#5e3a1c');
    /* cola */
    ctx.beginPath(); ctx.moveTo(-6.2, -9.5 + b);
    ctx.quadraticCurveTo(-10.2, -9.1 + b + g1 * 0.8, -9.6, -4.4 + b + g1 * 0.6);
    ctx.quadraticCurveTo(-8.3, -7.4 + b, -5.8, -8.1 + b); ctx.closePath();
    fs(ctx, lg(ctx, -10, 0, -6, 0, ['#2a170a', '#4a2c14']), OUTU, 0.5);
    /* cuerpo del caballo */
    ctx.beginPath();
    ctx.moveTo(-6.5, -8.6 + b);
    ctx.bezierCurveTo(-6.7, -11.9 + b, 3.2, -12.5 + b, 5.5, -10.4 + b);
    ctx.bezierCurveTo(7.1, -9.0 + b, 6.7, -6.2 + b, 4.4, -5.6 + b);
    ctx.bezierCurveTo(1.2, -4.8 + b, -3.6, -5.0 + b, -5.4, -5.8 + b);
    ctx.bezierCurveTo(-7.0, -6.4 + b, -6.9, -7.6 + b, -6.5, -8.6 + b);
    ctx.closePath();
    fs(ctx, lg(ctx, 0, -12.5 + b, 0, -5 + b, [HC[0], HC[1], HC[2]]), OUTU, 0.6);
    ctx.beginPath(); ctx.ellipse(-1.5, -10.4 + b, 3.8, 0.9, -0.05, 0, U.TAU); ctx.fillStyle = 'rgba(255,230,190,0.25)'; ctx.fill();
    /* cuello y cabeza */
    ctx.beginPath();
    ctx.moveTo(3.4, -10.9 + b);
    ctx.quadraticCurveTo(5.4, -15.1 + b, 7.8, -16.5 + b);
    ctx.lineTo(9.2, -16.5 + b);
    ctx.quadraticCurveTo(11.7, -15.1 + b, 11.6, -13.4 + b);
    ctx.quadraticCurveTo(11.2, -12.3 + b, 9.9, -12.6 + b);
    ctx.quadraticCurveTo(8.2, -13.0 + b, 7.2, -11.2 + b);
    ctx.quadraticCurveTo(6.6, -9.4 + b, 5.8, -8.4 + b);
    ctx.closePath();
    fs(ctx, lg(ctx, 4, -16.5 + b, 10, -10 + b, [HC[0], HC[1]]), OUTU, 0.6);
    poly(ctx, [8.3, -16.3 + b, 8.9, -18.2 + b, 9.8, -16.4 + b]); fs(ctx, HC[1], OUTU, 0.4);
    ell(ctx, 9.7, -14.8 + b, 0.38, 0.38); ctx.fillStyle = '#140a04'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(8.5, -16.5 + b); ctx.quadraticCurveTo(5.7, -15.7 + b, 3.6, -11.6 + b);
    ctx.lineCap = 'round'; ctx.strokeStyle = '#2a170a'; ctx.lineWidth = 1.6; ctx.stroke();
    line(ctx, 8.1, -13.7 + b, 10.8, -13.0 + b, U.rgba(F.dark, 0.95), 0.55);
    horseLeg(ctx, 3.6, -6.0 + b, g1 * 0.85, HC[1]);
    horseLeg(ctx, -3.8, -6.4 + b, -g1 * 0.85, HC[1]);
    /* gualdrapa */
    ctx.beginPath();
    ctx.moveTo(-2.9, -11.5 + b); ctx.lineTo(3.0, -11.7 + b); ctx.lineTo(3.4, -6.8 + b);
    ctx.quadraticCurveTo(0.2, -6.1 + b, -3.2, -6.8 + b); ctx.closePath();
    fs(ctx, teamG(ctx, F, -3.2, 3.4), OUTU, 0.5);
    line(ctx, -3.0, -7.25 + b, 3.25, -7.25 + b, '#f0cf72', 0.65);
    /* capa */
    ctx.beginPath(); ctx.moveTo(-0.7, -16.6 + b);
    ctx.quadraticCurveTo(-4.8, -14.2 + b + g1 * 0.6, -5.6, -10.6 + b + g2 * 0.7);
    ctx.lineTo(-1.6, -11.5 + b); ctx.closePath();
    fs(ctx, lg(ctx, -5.6, 0, 0, 0, [F.dark, U.shade(F.color, -0.12)]), OUTU, 0.5);
    limb(ctx, 0.4, -11.3 + b, 1.7, -7.8 + b, 1.5, '#4a3524'); boot(ctx, 2.0, -7.1 + b, '#2c1d12');
    /* jinete */
    ctx.beginPath();
    ctx.moveTo(-1.9, -16.7 + b); ctx.quadraticCurveTo(0.4, -17.5 + b, 2.3, -16.5 + b);
    ctx.lineTo(2.6, -11.2 + b); ctx.quadraticCurveTo(0.2, -10.6 + b, -2.1, -11.2 + b); ctx.closePath();
    fs(ctx, teamG(ctx, F, -2.1, 2.6), OUTU, 0.55);
    head(ctx, 0.6, -19.4 + b, 2.6);
    helmet(ctx, 0.6, -20.0 + b, 2.9);
    /* lanza con banderín */
    const lx0 = -3.4, ly0 = -11.6 + b, lx1 = 13.6, ly1 = -21.8 + b;
    limb(ctx, lx0, ly0, lx1, ly1, 0.85, '#93622f');
    spearTip(ctx, lx0, ly0, lx1, ly1, 2.8, 0.9);
    const pw = Math.sin(ph * 2) * 0.9;
    ctx.beginPath(); ctx.moveTo(11.6, -20.6 + b); ctx.lineTo(7.6, -17.6 + b + pw); ctx.lineTo(8.9, -19.2 + b + pw * 0.6); ctx.lineTo(7.0, -19.9 + b + pw);
    ctx.lineTo(10.6, -21.2 + b); ctx.closePath();
    fs(ctx, lg(ctx, 7, 0, 11.6, 0, [F.light, F.color]), OUTU, 0.4);
  }

  function drawKnight(ctx, F, fr) {
    const ph = (fr / FR) * U.TAU;
    const sw = Math.sin(ph), b = Math.abs(Math.cos(ph)) * 0.5;
    softShadow(ctx, 0.3, 0, 6.2, 2.1);
    const hipY = -6.3 - b;
    const bx = -0.8 - sw * 1.4, fx = 1.0 + sw * 1.4;
    const by = -Math.max(0, -sw) * 0.7, fy = -Math.max(0, sw) * 0.7;
    limb(ctx, -0.6, hipY, bx, -1 + by, 2.2, STEEL[2]); boot(ctx, bx, by, '#3b3f46');
    /* espada en alto */
    limb(ctx, -2.6, -9.6 - b, -6.6, -21.4 - b, 1.05, STEEL[1]);
    line(ctx, -2.9, -10.4 - b, -6.4, -20.8 - b, 'rgba(255,255,255,0.8)', 0.35);
    limb(ctx, -4.4, -10.6 - b, -1.3, -9.4 - b, 0.8, '#d8a73a');
    limb(ctx, 0.8, hipY, fx, -1 + fy, 2.3, STEEL[1]); boot(ctx, fx, fy, '#4a4f57');
    /* peto */
    ctx.beginPath();
    ctx.moveTo(-3.7, -14.4 - b); ctx.quadraticCurveTo(0.3, -15.6 - b, 4.0, -14.4 - b);
    ctx.lineTo(4.4, -6.0 - b); ctx.quadraticCurveTo(0.3, -4.8 - b, -4.0, -6.0 - b); ctx.closePath();
    fs(ctx, steelG(ctx, -4, 4.4), OUTU, 0.6);
    /* sobreveste */
    ctx.beginPath(); ctx.moveTo(-1.9, -14.0 - b); ctx.lineTo(2.2, -14.0 - b); ctx.lineTo(2.7, -5.4 - b); ctx.lineTo(0.25, -4.5 - b); ctx.lineTo(-2.25, -5.4 - b); ctx.closePath();
    fs(ctx, teamG(ctx, F, -2.2, 2.7), '#f0cf72', 0.5);
    ell(ctx, -2.7, -13.6 - b, 1.9, 1.35); fs(ctx, steelG(ctx, -4.6, -0.8), OUTU, 0.5);
    /* yelmo cerrado y penacho */
    ctx.beginPath(); ctx.moveTo(0.4, -21.8 - b); ctx.quadraticCurveTo(-3.8, -25.8 - b, -6.4, -21.6 - b + sw * 0.4); ctx.quadraticCurveTo(-3.3, -23.0 - b, 0.4, -21.0 - b); ctx.closePath();
    fs(ctx, lg(ctx, -6.4, 0, 0.4, 0, [F.light, F.color]), OUTU, 0.4);
    ctx.beginPath(); ctx.moveTo(-2.4, -16.4 - b); ctx.lineTo(-2.4, -20.6 - b); ctx.quadraticCurveTo(0.3, -22.7 - b, 3.0, -20.6 - b); ctx.lineTo(3.0, -16.4 - b); ctx.closePath();
    fs(ctx, steelG(ctx, -2.4, 3.0), OUTU, 0.6);
    line(ctx, -0.4, -18.9 - b, 3.0, -18.9 - b, '#15181d', 0.85);
    for (let i = 0; i < 3; i++) { ell(ctx, 1.6 + i * 0.5, -17.4 - b, 0.18, 0.18); ctx.fillStyle = '#15181d'; ctx.fill(); }
    line(ctx, -1.6, -20.6 - b, -1.6, -16.8 - b, 'rgba(255,255,255,0.6)', 0.4);
    /* escudo de cometa */
    const kx = 3.4, ky = -12.8 - b;
    ctx.beginPath(); ctx.moveTo(kx - 2.6, ky); ctx.quadraticCurveTo(kx + 0.4, ky - 1.3, kx + 3.4, ky); ctx.lineTo(kx + 3.2, ky + 5);
    ctx.quadraticCurveTo(kx + 1.8, ky + 8.5, kx + 0.4, ky + 9.8); ctx.quadraticCurveTo(kx - 1.2, ky + 8.5, kx - 2.6, ky + 5); ctx.closePath();
    fs(ctx, lg(ctx, kx - 2.6, ky, kx + 3.4, ky + 9, [U.shade(F.color, 0.42), F.color, U.shade(F.color, -0.42)]), OUTU, 0.6);
    ctx.save(); ctx.clip();
    line(ctx, kx + 0.4, ky - 0.4, kx + 0.4, ky + 9.6, '#f6ecd2', 1.1);
    line(ctx, kx - 2.6, ky + 3.3, kx + 3.4, ky + 3.3, '#f6ecd2', 1.1);
    ctx.beginPath(); ctx.ellipse(kx - 0.9, ky + 1.4, 1.2, 0.7, -0.6, 0, U.TAU); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(kx - 2.6, ky); ctx.quadraticCurveTo(kx + 0.4, ky - 1.3, kx + 3.4, ky); ctx.lineTo(kx + 3.2, ky + 5);
    ctx.quadraticCurveTo(kx + 1.8, ky + 8.5, kx + 0.4, ky + 9.8); ctx.quadraticCurveTo(kx - 1.2, ky + 8.5, kx - 2.6, ky + 5); ctx.closePath();
    ctx.strokeStyle = '#f0cf72'; ctx.lineWidth = 0.55; ctx.stroke();
  }

  const ucache = new Map();
  const UW = 38, UH = 34, UAX = 19, UAY = 29;
  A.unit = function (ut, owner, frame, flip) {
    const key = ut + owner + '_' + frame + (flip ? 'f' : '');
    let s = ucache.get(key);
    if (s) return s;
    const F = FF.FACTIONS[owner];
    const c = A.canvas(UW, UH, SPRU);
    const ctx = c.getContext('2d');
    ctx.scale(SPRU, SPRU); ctx.translate(UAX, UAY);
    if (flip) ctx.scale(-1, 1);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (ut === 'jinete') drawRider(ctx, F, frame);
    else if (ut === 'caballero') drawKnight(ctx, F, frame);
    else drawSoldier(ctx, F, frame);
    A.vivid(c);
    s = { c, ax: UAX, ay: UAY, w: UW, h: UH };
    ucache.set(key, s);
    return s;
  };

  /* ---------- DECORADOS ---------- */
  A.deco = function (ctx, kind, x, y, s, rng, pal) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const D = DECO[kind];
    if (D) D(ctx, rng, pal || {});
    ctx.restore();
  };
  function shadow(ctx, rx, ry, ox) {
    ell(ctx, ox || 3, 1, rx, ry); ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fill();
  }
  const DECO = {
    roble(ctx, rng, p) {
      shadow(ctx, 14, 5, 5);
      /* tronco con raíces y corteza */
      ctx.beginPath(); ctx.moveTo(-3.6, 0.6); ctx.quadraticCurveTo(-2, -1, -1.6, -10); ctx.lineTo(1.6, -10); ctx.quadraticCurveTo(2, -1, 3.8, 0.6); ctx.closePath();
      fs(ctx, lg(ctx, -3, 0, 3, 0, ['#a86a3c', '#8e5630', '#5e361c']), OUT, 0.9);
      line(ctx, -0.6, -1, -0.4, -8, 'rgba(50,25,10,0.45)', 0.5); line(ctx, 0.9, -2, 0.8, -7, 'rgba(50,25,10,0.4)', 0.5);
      const g = p.leaf || ['#3fb83a', '#24892c', '#96ec66'];
      const blobs = [[-6, -15, 7], [5, -16, 7.5], [0, -22, 8], [-3, -12, 6], [6, -11, 5.5]];
      const ol = U.shade(g[1], -0.62);
      ctx.lineWidth = 2.4; ctx.strokeStyle = ol;
      blobs.forEach((b) => { ell(ctx, b[0], b[1], b[2] + 0.3, b[2] * 0.9 + 0.3); ctx.stroke(); });
      blobs.forEach((b) => { ell(ctx, b[0], b[1], b[2], b[2] * 0.9); ctx.fillStyle = g[1]; ctx.fill(); });
      blobs.forEach((b) => { ell(ctx, b[0] - 0.7, b[1] - 1.1, b[2] * 0.84, b[2] * 0.74); ctx.fillStyle = rg(ctx, b[0] - b[2] * 0.35, b[1] - b[2] * 0.45, 0.5, b[2] * 1.05, [[0, g[2]], [0.55, g[0]], [1, g[0]]]); ctx.fill(); });
      /* textura de hojas: racimos claros arriba a la izquierda, oscuros abajo a la derecha */
      ctx.save();
      ctx.beginPath(); blobs.forEach((b) => { ctx.moveTo(b[0] + b[2], b[1]); ctx.ellipse(b[0], b[1], b[2], b[2] * 0.9, 0, 0, U.TAU); }); ctx.clip();
      const dk = U.shade(g[1], -0.28), lt = U.shade(g[2], 0.12);
      for (let i = 0; i < 46; i++) {
        const bx = rng.range(-12, 12), by = rng.range(-29, -6), light = (bx + by * 0.9 + 18) < rng.range(-4, 10);
        ell(ctx, bx, by, rng.range(1, 1.9), rng.range(0.8, 1.4), rng.range(0, 3));
        ctx.fillStyle = light ? U.rgba(lt, 0.5) : U.rgba(dk, 0.32); ctx.fill();
      }
      /* sombra propia en la parte baja de la copa */
      ell(ctx, 2, -7, 13, 5.5); ctx.fillStyle = U.rgba(dk, 0.35); ctx.fill();
      ctx.restore();
      for (let i = 0; i < 3; i++) { const b = blobs[i]; ell(ctx, b[0] - b[2] * 0.32, b[1] - b[2] * 0.42, b[2] * 0.3, b[2] * 0.17, -0.5); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fill(); }
      if (p.berries && rng.chance(0.35)) for (let i = 0; i < 4; i++) { ell(ctx, rng.range(-8, 8), rng.range(-22, -10), 1.1, 1.1); ctx.fillStyle = '#ff4a5a'; ctx.fill(); }
    },
    pino(ctx, rng, p) {
      shadow(ctx, 9, 3.5, 4);
      ctx.beginPath(); ctx.rect(-1.6, -6, 3.2, 6); fs(ctx, lg(ctx, -1.6, 0, 1.6, 0, ['#8e5a32', '#5e3a1e']), OUT, 0.8);
      const c1 = p.pine || '#2f8a4a', c2 = U.shade(c1, 0.3), snow = p.snow, ol = U.shade(c1, -0.62), dk = U.shade(c1, -0.3);
      for (let i = 0; i < 3; i++) {
        const yy = -5 - i * 7, w = 10 - i * 2.6, top = yy - 12;
        /* rama con el borde inferior dentado */
        ctx.beginPath(); ctx.moveTo(0, top);
        ctx.lineTo(w, yy);
        const n = 6;
        for (let j = 1; j <= n; j++) { const x = w - (2 * w * j) / n; ctx.lineTo(x + w / n, yy + 1.4); ctx.lineTo(x, yy); }
        ctx.closePath();
        fs(ctx, lg(ctx, -w, 0, w, 0, [c2, c1, U.shade(c1, -0.25)]), ol, 1.1);
        ctx.save(); ctx.clip();
        ctx.fillStyle = U.rgba(dk, 0.4); ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(w, yy + 2); ctx.lineTo(w * 0.15, yy + 2); ctx.closePath(); ctx.fill();
        for (let k = 0; k < 7; k++) { const nx = rng.range(-w * 0.7, w * 0.6), ny = rng.range(top + 4, yy); line(ctx, nx, ny, nx + rng.range(-2, 2), ny + 1.6, U.rgba(c2, 0.5), 0.5); }
        ctx.restore();
        if (snow) { poly(ctx, [-w * 0.55, yy - 5.5, 0, yy - 12, w * 0.55, yy - 5.5, w * 0.2, yy - 4.5, 0, yy - 6, -w * 0.25, yy - 4.6]); fs(ctx, '#ffffff'); }
      }
    },
    arbusto(ctx, rng, p) {
      shadow(ctx, 7, 2.5, 2);
      const g = p.leaf || ['#3fb83a', '#24892c', '#96ec66'];
      const bl = [[-3, -3, 4], [3, -3.5, 4.2], [0, -5.5, 4.4]];
      ctx.lineWidth = 1.8; ctx.strokeStyle = U.shade(g[1], -0.62);
      bl.forEach((b) => { ell(ctx, b[0], b[1], b[2] + 0.2, b[2] * 0.85 + 0.2); ctx.stroke(); });
      bl.forEach((b) => { ell(ctx, b[0], b[1], b[2], b[2] * 0.85); ctx.fillStyle = rg(ctx, b[0] - 1.5, b[1] - 1.5, 0.3, b[2], [[0, g[2]], [1, g[0]]]); ctx.fill(); });
      ctx.save(); ctx.beginPath(); bl.forEach((b) => { ctx.moveTo(b[0] + b[2], b[1]); ctx.ellipse(b[0], b[1], b[2], b[2] * 0.85, 0, 0, U.TAU); }); ctx.clip();
      for (let i = 0; i < 14; i++) { const bx = rng.range(-7, 7), by = rng.range(-9, -0.5); ell(ctx, bx, by, 0.9, 0.7, rng.range(0, 3)); ctx.fillStyle = (bx + by) < -6 ? U.rgba(U.shade(g[2], 0.1), 0.5) : U.rgba(U.shade(g[1], -0.3), 0.45); ctx.fill(); }
      ctx.restore();
      if (p.berries) for (let i = 0; i < 4; i++) { ell(ctx, rng.range(-5, 5), rng.range(-7, -2), 1, 1); ctx.fillStyle = '#ff3a4a'; ctx.fill(); }
    },
    flores(ctx, rng) {
      const cols = ['#ffffff', '#ffe03a', '#ff5fa2', '#6ec2ff', '#ff8f2e', '#c084ff'];
      for (let i = 0; i < 6; i++) {
        const fx = rng.range(-7, 7), fy = rng.range(-3, 3), c = rng.pick(cols);
        line(ctx, fx, fy, fx, fy - 2.6, '#2f8a25', 0.7);
        ell(ctx, fx, fy - 3, 1.5, 1.5); ctx.fillStyle = c; ctx.fill();
        ctx.lineWidth = 0.4; ctx.strokeStyle = 'rgba(60,30,10,0.45)'; ctx.stroke();
        ell(ctx, fx, fy - 3, 0.55, 0.55); ctx.fillStyle = c === '#ffe03a' ? '#ff8f2e' : '#ffe03a'; ctx.fill();
      }
    },
    hierba(ctx, rng, p) {
      const c = p.grass || '#4f8f33';
      for (let i = 0; i < 5; i++) { const gx = rng.range(-4, 4); line(ctx, gx, 0, gx + rng.range(-2, 2), -rng.range(3, 6), c, 0.8); }
    },
    roca(ctx, rng, p) {
      shadow(ctx, 7, 2.5, 2);
      const c = p.rock || '#9a948a';
      poly(ctx, [-7, 0, -6, -4, -2, -7, 3, -6.5, 7, -3, 6.5, 0]);
      fs(ctx, lg(ctx, -6, -7, 6, 0, [U.shade(c, 0.25), c, U.shade(c, -0.3)]), 'rgba(40,35,30,0.8)', 0.8);
      line(ctx, -2, -7, 0, -2, U.rgba(U.shade(c, -0.4), 0.6), 0.6);
      if (p.snow) { poly(ctx, [-5.5, -4.2, -2, -7, 3, -6.5, 6, -3.5, 2, -4.5, -2, -4]); fs(ctx, '#f4f9ff'); }
    },
    palmera(ctx, rng) {
      shadow(ctx, 12, 4, 8);
      ctx.beginPath(); ctx.moveTo(-1.5, 0); ctx.quadraticCurveTo(-3, -12, 2, -26); ctx.lineTo(4, -26); ctx.quadraticCurveTo(0, -12, 1.8, 0); ctx.closePath();
      fs(ctx, lg(ctx, -2, 0, 3, 0, ['#9c7446', '#6e4e2c']), OUT, 0.7);
      for (let i = 0; i < 6; i++) line(ctx, -1.5 + i * 0.5, -4 - i * 4, 1.5 + i * 0.6, -4.5 - i * 4, 'rgba(60,40,20,0.6)', 0.6);
      const fr = [[-14, -22], [-11, -31], [0, -35], [12, -32], [15, -23], [6, -20]];
      fr.forEach((f) => {
        ctx.beginPath(); ctx.moveTo(3, -26); ctx.quadraticCurveTo((3 + f[0]) / 2, f[1] - 6, f[0], f[1]);
        ctx.quadraticCurveTo((3 + f[0]) / 2, f[1] - 1, 3, -25); ctx.closePath();
        fs(ctx, lg(ctx, 3, -26, f[0], f[1], ['#62d24a', '#22902e']), '#0c3d14', 0.8);
        /* nervio y foliolos */
        const mx = (3 + f[0]) / 2, my = f[1] - 4;
        ctx.beginPath(); ctx.moveTo(3, -25.5); ctx.quadraticCurveTo(mx, my, f[0], f[1]); ctx.strokeStyle = 'rgba(200,255,150,0.45)'; ctx.lineWidth = 0.45; ctx.stroke();
        for (let k = 0.25; k < 0.95; k += 0.14) {
          const qx = (1 - k) * (1 - k) * 3 + 2 * (1 - k) * k * mx + k * k * f[0], qy = (1 - k) * (1 - k) * -25.5 + 2 * (1 - k) * k * my + k * k * f[1];
          line(ctx, qx, qy, qx + (f[0] > 3 ? 1.2 : -1.2), qy + 2.2, 'rgba(12,61,20,0.55)', 0.5);
        }
      });
      ell(ctx, 2, -25.5, 2, 1.6); ctx.fillStyle = '#6b4a2a'; ctx.fill();
    },
    cactus(ctx, rng) {
      shadow(ctx, 6, 2.2, 4);
      const c = '#48c24a', d = '#1c6a2a';
      const arm = (x0, y0, dir, h) => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + dir * 5, y0); ctx.lineTo(x0 + dir * 5, y0 - h); ctx.strokeStyle = d; ctx.lineWidth = 4.2; ctx.stroke(); ctx.strokeStyle = c; ctx.lineWidth = 2.6; ctx.stroke(); };
      arm(1, -8, 1, 6); arm(-1, -12, -1, 5);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -20); ctx.strokeStyle = d; ctx.lineWidth = 6; ctx.stroke(); ctx.strokeStyle = c; ctx.lineWidth = 4; ctx.stroke();
      line(ctx, -0.8, -2, -0.8, -19, 'rgba(255,255,255,0.35)', 0.8);
      line(ctx, 0.9, -2, 0.9, -19, 'rgba(20,90,40,0.45)', 0.5);
      for (let k = -18; k < -2; k += 2.6) { ctx.fillStyle = 'rgba(255,250,220,0.8)'; ctx.fillRect(-2.6, k, 0.7, 0.4); ctx.fillRect(2, k + 1.3, 0.7, 0.4); }
      if (rng.chance(0.4)) { ell(ctx, 0, -21, 1.6, 1.4); ctx.fillStyle = '#ff6fa0'; ctx.fill(); }
    },
    matojo(ctx, rng) {
      for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + rng.range(-1.2, 1.2); line(ctx, 0, 0, Math.cos(a) * rng.range(4, 7), Math.sin(a) * rng.range(3, 6), '#9a7a44', 0.8); }
    },
    hueso(ctx) {
      shadow(ctx, 5, 1.6, 1);
      ell(ctx, 0, -2.5, 3.2, 2.6); fs(ctx, '#efe6d2', '#8a7e6a', 0.6);
      ell(ctx, -1.1, -2.8, 0.7, 0.8); ctx.fillStyle = '#4a3d2e'; ctx.fill();
      ell(ctx, 1.1, -2.8, 0.7, 0.8); ctx.fill();
      line(ctx, 3, -0.5, 7, 0.5, '#efe6d2', 1.2);
    },
    cristal(ctx, rng, p) {
      shadow(ctx, 6, 2, 2);
      const c = p.crystal || '#bfe6ff';
      [[-3, 0, -5, -10], [0, 0, 0, -14], [3, 0, 5, -9]].forEach((k) => {
        poly(ctx, [k[0] - 1.8, k[1], k[2], k[3], k[0] + 1.8, k[1]]);
        fs(ctx, lg(ctx, k[0] - 2, 0, k[0] + 2, 0, [U.shade(c, 0.5), c, U.shade(c, -0.3)]), U.rgba(U.shade(c, -0.5), 0.8), 0.6);
      });
    },
    tocon(ctx) {
      shadow(ctx, 6, 2, 2);
      ctx.beginPath(); ctx.rect(-3.5, -5, 7, 5); fs(ctx, '#7a5232', OUT, 0.7);
      ell(ctx, 0, -5, 3.5, 1.4); fs(ctx, '#d9b07a', OUT, 0.6);
    },
    arbolMuerto(ctx) {
      shadow(ctx, 8, 2.5, 3);
      const c = '#2a201c';
      line(ctx, 0, 0, 0, -16, c, 2.4);
      line(ctx, 0, -9, -6, -15, c, 1.4); line(ctx, -4, -13, -5, -18, c, 1);
      line(ctx, 0, -12, 5, -18, c, 1.3); line(ctx, 3, -15, 7, -15, c, 0.9);
    },
    basalto(ctx, rng) {
      shadow(ctx, 8, 2.6, 2);
      const cols = [[-5, 9], [-1.5, 13], [2, 10], [5.5, 7]];
      cols.forEach((k) => {
        ctx.beginPath(); ctx.rect(k[0] - 1.7, -k[1], 3.4, k[1]); fs(ctx, lg(ctx, k[0] - 2, 0, k[0] + 2, 0, ['#4a4448', '#25222a']), '#140f12', 0.6);
        ell(ctx, k[0], -k[1], 1.7, 0.7); ctx.fillStyle = '#5e575c'; ctx.fill();
      });
    },
    fumarola(ctx) {
      shadow(ctx, 6, 2, 1);
      ell(ctx, 0, -1, 5, 2.2); fs(ctx, '#3a2c28', '#1a1210', 0.7);
      ell(ctx, 0, -1.4, 2.4, 1); ctx.fillStyle = '#ff7a1a'; ctx.fill();
    },
    muneco(ctx) {
      shadow(ctx, 5, 2, 2);
      ell(ctx, 0, -3.5, 4, 3.5); fs(ctx, '#f6fbff', '#9fb4c8', 0.6);
      ell(ctx, 0, -9, 2.8, 2.6); fs(ctx, '#f6fbff', '#9fb4c8', 0.6);
      poly(ctx, [0.5, -9, 4, -8.6, 0.5, -8.2]); fs(ctx, '#ff8a2a');
    },
    caracola(ctx) {
      ell(ctx, 0, -1, 2.4, 1.6); fs(ctx, '#ffd8c6', '#c08a7a', 0.5);
    },
    barca(ctx) {
      ctx.beginPath(); ctx.moveTo(-9, -2); ctx.quadraticCurveTo(0, 4, 9, -2); ctx.lineTo(7, -4); ctx.lineTo(-7, -4); ctx.closePath();
      fs(ctx, '#8a5a2e', OUT, 0.8);
      line(ctx, 0, -4, 0, -16, '#5a3a20', 1);
      poly(ctx, [0.5, -15, 7, -6, 0.5, -6]); fs(ctx, '#f3ead6', '#8a7e6a', 0.6);
    },
    nenufar(ctx) {
      ell(ctx, 0, 0, 3, 1.6); fs(ctx, '#4f9a3c');
      ell(ctx, 0.5, -0.6, 0.9, 0.6); ctx.fillStyle = '#ffd0e0'; ctx.fill();
    },
    junco(ctx) {
      for (let i = -2; i <= 2; i++) line(ctx, i * 1.2, 0, i * 1.6, -7 - Math.abs(i), '#5a8a3a', 0.8);
      ell(ctx, 0.4, -7, 0.7, 1.6); ctx.fillStyle = '#6b4a2a'; ctx.fill();
    },
    duna(ctx) {
      ctx.beginPath(); ctx.moveTo(-14, 0); ctx.quadraticCurveTo(0, -7, 14, 0); ctx.closePath();
      ctx.fillStyle = 'rgba(255,240,200,0.35)'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(-14, 0); ctx.quadraticCurveTo(2, -5, 14, 0); ctx.strokeStyle = 'rgba(150,100,40,0.25)'; ctx.lineWidth = 1; ctx.stroke();
    },
    calavera(ctx) {
      DECO.hueso(ctx);
    },
    /* charco de lava (volcán): borde de roca, lava y un brillo; las burbujas las pone FF.Life */
    charco(ctx, rng) {
      const rx = 9, ry = 4.4;
      ell(ctx, 0, 0, rx + 2.4, ry + 1.8); ctx.fillStyle = '#24141a'; ctx.fill();
      ell(ctx, 0, -0.3, rx + 0.8, ry + 0.6); ctx.fillStyle = '#5a2a1e'; ctx.fill();
      ell(ctx, 0, 0, rx, ry); ctx.fillStyle = lg(ctx, 0, -ry, 0, ry, ['#ffb21a', '#ff6a00', '#d42a00']); ctx.fill();
      ell(ctx, -1, -0.6, rx * 0.55, ry * 0.45); ctx.fillStyle = 'rgba(255,240,150,0.85)'; ctx.fill();
      for (let i = 0; i < 4; i++) { ell(ctx, rng.range(-rx * 0.7, rx * 0.7), rng.range(-ry * 0.5, ry * 0.5), rng.range(1, 2.2), rng.range(0.5, 1), rng.range(0, 3)); ctx.fillStyle = 'rgba(60,15,0,0.55)'; ctx.fill(); }
    }
  };
  A.DECO = DECO;
})(globalThis.FF = globalThis.FF || {});
