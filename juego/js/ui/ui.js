/* Feudo a Feudo — interfaz: pantallas, ventanas, HUD y avisos */
(function (FF) {
  'use strict';
  const U = FF.U;
  const UI = FF.UI = {};
  let app, root, scr, modal, hud, toasts;

  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function btn(label, cls, fn) {
    const b = el('button', 'btn ' + (cls || ''), label);
    b.addEventListener('click', (ev) => { ev.stopPropagation(); FF.Audio.play('click'); fn && fn(ev); });
    return b;
  }
  UI.el = el; UI.btn = btn;

  UI.init = function (A) {
    app = A;
    root = document.getElementById('app');
    scr = el('div', '', ''); scr.id = 'screens'; root.appendChild(scr);
    hud = el('div', 'hidden', ''); hud.id = 'hud'; root.appendChild(hud);
    modal = el('div', 'hidden', ''); modal.id = 'modal'; root.appendChild(modal);
    toasts = el('div', 'toasts', ''); root.appendChild(toasts);
    modal.addEventListener('pointerdown', (e) => { if (e.target === modal && UI.modalClose) UI.modalClose(); });
    UI.parchTexture();
  };

  /* textura de pergamino generada al vuelo */
  UI.parchTexture = function () {
    const c = document.createElement('canvas'); c.width = c.height = 220;
    const ctx = c.getContext('2d');
    const rng = U.rng(4242);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 220, 220);
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = 'rgba(' + (120 + rng.int(0, 60)) + ',' + (90 + rng.int(0, 40)) + ',' + (40 + rng.int(0, 30)) + ',' + rng.range(0.03, 0.12) + ')';
      ctx.fillRect(rng.range(0, 220), rng.range(0, 220), rng.range(1, 3), rng.range(1, 2));
    }
    for (let i = 0; i < 60; i++) {
      ctx.strokeStyle = 'rgba(140,100,50,' + rng.range(0.03, 0.08) + ')'; ctx.lineWidth = 0.6;
      const x = rng.range(0, 220), y = rng.range(0, 220);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rng.range(-30, 30), y + rng.range(-6, 6)); ctx.stroke();
    }
    try { document.documentElement.style.setProperty('--parch-tex', 'url(' + c.toDataURL() + ')'); } catch (e) { /* */ }
  };

  function clearScreens() {
    UI.bgScene = null;
    scr.innerHTML = '';
  }

  /* ======================= TÍTULO ======================= */
  UI.showTitle = function () {
    clearScreens();
    UI.hideHUD();
    FF.Audio.playMusic('menu');
    const s = el('section', 'screen'); s.id = 'scr-title';
    const cv = el('canvas', 'bg'); s.appendChild(cv);
    const fcv = el('canvas', 'frame'); s.appendChild(fcv);
    const c = el('div', 'content');
    c.innerHTML = '<div class="logo">' + FF.crestSVG() + '<h1 class="title-gold">Feudo a Feudo</h1><div class="sub">Conquista la tierra, edificio a edificio</div></div>';
    const menu = el('div', 'menu fade-in');
    menu.appendChild(btn('Campaña', '', () => UI.showMap(FF.Save.data.lastWorld || 0)));
    menu.appendChild(btn('Batalla rápida', 'wood', () => UI.skirmish()));
    const r1 = el('div', 'row');
    r1.appendChild(btn(FF.icon('trophy') + ' Logros', 'wood small', () => UI.achievements()));
    r1.appendChild(btn(FF.icon('book') + ' Cómo jugar', 'wood small', () => UI.help()));
    menu.appendChild(r1);
    const r2 = el('div', 'row');
    r2.appendChild(btn(FF.icon('gear') + ' Opciones', 'wood small', () => UI.options()));
    r2.appendChild(btn('Créditos', 'wood small', () => UI.credits()));
    menu.appendChild(r2);
    if (FF.Host.canQuit) menu.appendChild(btn(FF.icon('close') + ' Salir', 'red small', () => UI.confirmQuit()));
    c.appendChild(menu);
    s.appendChild(c);
    s.appendChild(el('div', 'version', 'v' + FF.VERSION + ' · ' + ({ web: 'HTML5', windows: 'Windows', android: 'Android' })[FF.Host.platform]));
    UI.screen = 'title';
    scr.appendChild(s);
    UI.bgScene = new TitleScene(cv, fcv);
  };

  /* ---------- marco medieval de la pantalla de inicio ----------
     Vigas de madera con vetas, moldura dorada, remaches de hierro, placas en las esquinas con un
     cuadrifolio y un rubí, volutas doradas, hiedra y las barras de dos estandartes. Se dibuja una
     vez por tamaño de pantalla; los estandartes (que ondean) se pintan aparte. */
  const TAU = Math.PI * 2;
  function frameSize(w, h) { return Math.round(U.clamp(Math.min(w, h) * 0.042, 12, 38)); }
  function bannerSpots(w, h) {
    if (w < 700 || h < 420) return [];
    const bw = Math.round(U.clamp(w * 0.05, 32, 64)), bl = Math.round(U.clamp(h * 0.3, 110, 230));
    return [{ x: w * 0.085, bw, bl, o: 1, em: 'torre' }, { x: w * 0.915, bw, bl, o: 2, em: 'corona' }];
  }
  function drawFrame(cv, w, h, dpr) {
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const x = cv.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, w, h);
    const T = frameSize(w, h), rng = U.rng(1212);
    x.lineCap = 'round'; x.lineJoin = 'round';
    /* sombra hacia dentro: la escena queda «detrás» del marco */
    const sh = T * 1.9;
    const shade = (x0, y0, x1, y1, rx, ry, rw, rh) => {
      const g = x.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, 'rgba(12,6,0,0.6)'); g.addColorStop(1, 'rgba(12,6,0,0)');
      x.fillStyle = g; x.fillRect(rx, ry, rw, rh);
    };
    shade(0, T, 0, T + sh, 0, T, w, sh); shade(0, h - T, 0, h - T - sh, 0, h - T - sh, w, sh);
    shade(T, 0, T + sh, 0, T, 0, sh, h); shade(w - T, 0, w - T - sh, 0, w - T - sh, 0, sh, h);
    /* vigas */
    const beams = [
      { p: [0, 0, w, 0, w - T, T, T, T], g: [0, 0, 0, T], len: w, hz: true, o: 0 },
      { p: [0, h, w, h, w - T, h - T, T, h - T], g: [0, h, 0, h - T], len: w, hz: true, o: h - T },
      { p: [0, 0, T, T, T, h - T, 0, h], g: [0, 0, T, 0], len: h, hz: false, o: 0 },
      { p: [w, 0, w - T, T, w - T, h - T, w, h], g: [w, 0, w - T, 0], len: h, hz: false, o: w - T }
    ];
    beams.forEach((b) => {
      x.save();
      x.beginPath(); x.moveTo(b.p[0], b.p[1]); for (let i = 2; i < 8; i += 2) x.lineTo(b.p[i], b.p[i + 1]); x.closePath();
      const g = x.createLinearGradient(b.g[0], b.g[1], b.g[2], b.g[3]);
      g.addColorStop(0, '#3e220e'); g.addColorStop(0.16, '#a46a34'); g.addColorStop(0.45, '#7c4b22'); g.addColorStop(0.82, '#5a3416'); g.addColorStop(1, '#341c0a');
      x.fillStyle = g; x.fill(); x.clip();
      for (let i = 0; i < Math.round(b.len / 7); i++) {
        const a = rng.range(-T, b.len), ac = b.o + rng.range(0.14, 0.86) * T, L = rng.range(T * 1.5, T * 6), j = () => rng.range(-1.6, 1.6);
        x.beginPath();
        if (b.hz) { x.moveTo(a, ac); x.bezierCurveTo(a + L * 0.33, ac + j(), a + L * 0.66, ac + j(), a + L, ac + j() * 0.5); }
        else { x.moveTo(ac, a); x.bezierCurveTo(ac + j(), a + L * 0.33, ac + j(), a + L * 0.66, ac + j() * 0.5, a + L); }
        x.strokeStyle = rng.chance(0.72) ? 'rgba(34,15,3,0.34)' : 'rgba(255,214,150,0.15)'; x.lineWidth = rng.range(0.6, 1.5); x.stroke();
      }
      for (let i = 0; i < Math.max(1, Math.round(b.len / 190)); i++) {
        const a = rng.range(T * 3, b.len - T * 3), ac = b.o + rng.range(0.35, 0.65) * T, kx = b.hz ? a : ac, ky = b.hz ? ac : a;
        for (let k = 3; k >= 1; k--) { x.beginPath(); x.ellipse(kx, ky, (b.hz ? T * 0.42 : T * 0.16) * k / 3, (b.hz ? T * 0.16 : T * 0.42) * k / 3, 0, 0, TAU); x.strokeStyle = 'rgba(40,18,4,0.45)'; x.lineWidth = 0.8; x.stroke(); }
      }
      x.restore();
    });
    x.strokeStyle = 'rgba(22,9,0,0.75)'; x.lineWidth = 1.2;
    [[0, 0, T, T], [w, 0, w - T, T], [0, h, T, h - T], [w, h, w - T, h - T]].forEach((l) => { x.beginPath(); x.moveTo(l[0], l[1]); x.lineTo(l[2], l[3]); x.stroke(); });
    x.lineJoin = 'miter';
    x.strokeStyle = '#1a0c02'; x.lineWidth = 2; x.strokeRect(1, 1, w - 2, h - 2);
    /* molduras doradas: una fina por fuera y la grande por dentro */
    const goldRect = (inset, lw) => {
      x.strokeStyle = '#3a1e04'; x.lineWidth = lw + 2; x.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
      x.strokeStyle = '#d99e34'; x.lineWidth = lw; x.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
      x.strokeStyle = 'rgba(255,240,170,0.9)'; x.lineWidth = Math.max(0.8, lw * 0.3); x.strokeRect(inset - lw * 0.22, inset - lw * 0.22, w - (inset - lw * 0.22) * 2, h - (inset - lw * 0.22) * 2);
    };
    goldRect(T * 0.17, Math.max(1.2, T * 0.06));
    goldRect(T - T * 0.06, Math.max(2, T * 0.14));
    /* remaches */
    const rivet = (cx, cy, r) => {
      const g = x.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
      g.addColorStop(0, '#f4f6f8'); g.addColorStop(0.35, '#a9aeb6'); g.addColorStop(1, '#353941');
      x.beginPath(); x.arc(cx, cy + r * 0.25, r, 0, TAU); x.fillStyle = 'rgba(0,0,0,0.35)'; x.fill();
      x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fillStyle = g; x.fill();
      x.lineWidth = 0.8; x.strokeStyle = '#121418'; x.stroke();
    };
    const C = T * 2.15, step = T * 2.6, rr = Math.max(1.6, T * 0.12);
    for (let a = C + step * 0.5; a < w - C - step * 0.3; a += step) { rivet(a, T * 0.55, rr); rivet(a, h - T * 0.45, rr); }
    for (let a = C + step * 0.5; a < h - C - step * 0.3; a += step) { rivet(T * 0.55, a, rr); rivet(w - T * 0.45, a, rr); }
    /* hiedra trepando por dos esquinas */
    const leaf = (lx, ly, ang, sz) => {
      x.save(); x.translate(lx, ly); x.rotate(ang); x.scale(sz, sz);
      x.beginPath(); x.moveTo(0, 0);
      x.bezierCurveTo(-3.2, -1.5, -4.6, -5.5, -2.4, -7.6); x.quadraticCurveTo(-1.2, -6.2, 0, -9.2);
      x.quadraticCurveTo(1.2, -6.2, 2.4, -7.6); x.bezierCurveTo(4.6, -5.5, 3.2, -1.5, 0, 0); x.closePath();
      const g = x.createLinearGradient(-3, -8, 3, 0); g.addColorStop(0, '#8fe066'); g.addColorStop(1, '#2f8a2c');
      x.fillStyle = g; x.fill(); x.lineWidth = 0.7 / sz; x.strokeStyle = '#123d12'; x.stroke();
      x.beginPath(); x.moveTo(0, -0.6); x.lineTo(0, -6.8); x.strokeStyle = 'rgba(220,255,190,0.55)'; x.lineWidth = 0.5 / sz; x.stroke();
      x.restore();
    };
    const ivy = (P) => {
      x.beginPath(); x.moveTo(P[0][0], P[0][1]);
      for (let i = 1; i < P.length; i++) x.lineTo(P[i][0], P[i][1]);
      x.strokeStyle = '#4b5e22'; x.lineWidth = Math.max(1.2, T * 0.08); x.stroke();
      let side = 1;
      for (let i = 1; i < P.length; i++) {
        const dx = P[i][0] - P[i - 1][0], dy = P[i][1] - P[i - 1][1], a = Math.atan2(dy, dx);
        leaf(P[i][0], P[i][1], a + side * 1.25 + rng.range(-0.3, 0.3), (T / 26) * rng.range(0.75, 1.15) * 1.3);
        side = -side;
      }
    };
    const vine = (x0, y0, x1, y1, n, wob) => {
      const P = [];
      for (let i = 0; i <= n; i++) { const q = i / n, nx = -(y1 - y0), ny = x1 - x0, nl = Math.hypot(nx, ny) || 1, o = Math.sin(q * 9 + rng.range(-0.3, 0.3)) * wob; P.push([x0 + (x1 - x0) * q + nx / nl * o, y0 + (y1 - y0) * q + ny / nl * o]); }
      return P;
    };
    ivy(vine(T * 0.9, h - C * 0.9, T * 0.9, h * 0.58, 14, T * 0.3));
    ivy(vine(C * 0.9, h - T * 0.9, w * 0.2, h - T * 0.9, 13, T * 0.3));
    ivy(vine(w - C * 0.9, T * 0.9, w * 0.8, T * 0.9, 12, T * 0.3));
    ivy(vine(w - T * 0.9, C * 0.9, w - T * 0.9, h * 0.32, 10, T * 0.3));
    /* volutas doradas en las esquinas de dentro */
    const scroll = (sx, sy) => {
      x.save(); x.translate(sx > 0 ? T : w - T, sy > 0 ? T : h - T); x.scale(sx, sy);
      const L = T * 3.4, r = T * 0.32, o = T * 0.22;
      const shape = () => {
        x.beginPath();
        x.moveTo(o, L); x.lineTo(o, o + r); x.quadraticCurveTo(o, o, o + r, o); x.lineTo(L, o);
        x.moveTo(L, o); x.arc(L, o + r, r, -Math.PI / 2, Math.PI * 0.95); x.moveTo(o, L); x.arc(o + r, L, r, Math.PI, Math.PI * 2.45, false);
        x.moveTo(o + T * 0.42, o + T * 1.7); x.quadraticCurveTo(o + T * 0.42, o + T * 0.42, o + T * 1.7, o + T * 0.42);
      };
      shape(); x.strokeStyle = '#3a1e04'; x.lineWidth = Math.max(2.6, T * 0.2); x.stroke();
      shape(); x.strokeStyle = '#e8b445'; x.lineWidth = Math.max(1.4, T * 0.11); x.stroke();
      x.beginPath(); x.moveTo(o + T * 0.25, o + T * 0.25); x.quadraticCurveTo(o + T * 1.1, o + T * 0.45, o + T * 1.25, o + T * 1.25); x.quadraticCurveTo(o + T * 0.45, o + T * 1.1, o + T * 0.25, o + T * 0.25);
      x.fillStyle = '#f2c35a'; x.fill(); x.lineWidth = 1; x.strokeStyle = '#3a1e04'; x.stroke();
      x.restore();
    };
    scroll(1, 1); scroll(-1, 1); scroll(1, -1); scroll(-1, -1);
    /* placas de las esquinas */
    const plate = (cx, cy) => {
      const s2 = C / 2;
      x.save(); x.translate(cx, cy);
      x.fillStyle = 'rgba(0,0,0,0.4)'; x.fillRect(-s2 + 2, -s2 + 3, C, C);
      const g = x.createLinearGradient(-s2, -s2, s2, s2); g.addColorStop(0, '#7a7e88'); g.addColorStop(0.45, '#3c3f48'); g.addColorStop(1, '#202128');
      x.fillStyle = g; x.fillRect(-s2, -s2, C, C);
      x.lineWidth = 1.6; x.strokeStyle = '#0d0e12'; x.strokeRect(-s2, -s2, C, C);
      x.lineWidth = Math.max(1.4, T * 0.09); x.strokeStyle = '#d99e34'; x.strokeRect(-s2 + T * 0.2, -s2 + T * 0.2, C - T * 0.4, C - T * 0.4);
      const r = s2 * 0.3;
      x.beginPath();
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2, px = Math.cos(a) * r, py = Math.sin(a) * r; x.moveTo(px + r, py); x.arc(px, py, r, 0, TAU); }
      const gg = x.createRadialGradient(-r * 0.6, -r * 0.8, r * 0.2, 0, 0, r * 2.2); gg.addColorStop(0, '#fff2b0'); gg.addColorStop(0.45, '#e2a93c'); gg.addColorStop(1, '#8a560c');
      x.fillStyle = gg; x.fill(); x.lineWidth = 1; x.strokeStyle = '#3a1e04'; x.stroke();
      x.beginPath(); x.arc(0, 0, r * 0.62, 0, TAU);
      const rg = x.createRadialGradient(-r * 0.2, -r * 0.25, 0, 0, 0, r * 0.62); rg.addColorStop(0, '#ffb3b3'); rg.addColorStop(0.4, '#e0202a'); rg.addColorStop(1, '#6a0008');
      x.fillStyle = rg; x.fill(); x.strokeStyle = '#3a0004'; x.stroke();
      const q = s2 - T * 0.42;
      [[-q, -q], [q, -q], [-q, q], [q, q]].forEach((p) => rivet(p[0], p[1], rr * 0.85));
      x.restore();
    };
    plate(C / 2, C / 2); plate(w - C / 2, C / 2); plate(C / 2, h - C / 2); plate(w - C / 2, h - C / 2);
    /* barras de los estandartes */
    bannerSpots(w, h).forEach((b) => {
      const y = T + 1, half = b.bw * 0.68;
      x.beginPath(); x.moveTo(b.x - b.bw * 0.3, T - 2); x.lineTo(b.x - b.bw * 0.3, y); x.moveTo(b.x + b.bw * 0.3, T - 2); x.lineTo(b.x + b.bw * 0.3, y);
      x.strokeStyle = '#2a1404'; x.lineWidth = 2; x.stroke();
      const g = x.createLinearGradient(0, y - 3, 0, y + 3); g.addColorStop(0, '#fff0a8'); g.addColorStop(0.5, '#d99e34'); g.addColorStop(1, '#7a4a0a');
      x.fillStyle = g; x.fillRect(b.x - half, y - 2.2, half * 2, 4.4);
      x.lineWidth = 0.8; x.strokeStyle = '#3a1e04'; x.strokeRect(b.x - half, y - 2.2, half * 2, 4.4);
      [-1, 1].forEach((sd) => { x.beginPath(); x.arc(b.x + sd * (half + 2.6), y, 3.4, 0, TAU); x.fillStyle = '#e8b445'; x.fill(); x.stroke(); });
    });
    return T;
  }

  /* estandarte de tela (se dibuja una vez; al pintarlo se inclina para que ondee) */
  function drawBanner(b, dpr) {
    const W2 = b.bw, L = b.bl, c = document.createElement('canvas');
    c.width = Math.ceil((W2 + 6) * dpr); c.height = Math.ceil((L + 6) * dpr);
    const x = c.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 3 * dpr, 1 * dpr);
    x.lineJoin = 'round';
    const F = FF.FACTIONS[b.o], cut = L * 0.84;
    const cloth = () => { x.beginPath(); x.moveTo(0, 0); x.lineTo(W2, 0); x.lineTo(W2, L); x.lineTo(W2 / 2, cut); x.lineTo(0, L); x.closePath(); };
    cloth();
    const g = x.createLinearGradient(0, 0, W2, 0);
    [[0, -0.32], [0.18, 0], [0.32, 0.16], [0.5, 0], [0.68, -0.16], [0.84, 0.1], [1, -0.34]].forEach((s) => g.addColorStop(s[0], U.shade(F.color, s[1])));
    x.fillStyle = g; x.fill();
    const v = x.createLinearGradient(0, 0, 0, L); v.addColorStop(0, 'rgba(0,0,0,0.35)'); v.addColorStop(0.12, 'rgba(0,0,0,0)'); v.addColorStop(0.85, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.25)');
    x.fillStyle = v; x.fill();
    /* ribete dorado */
    x.save(); cloth(); x.clip();
    x.beginPath(); const m = W2 * 0.11;
    x.moveTo(m, L * 0.06); x.lineTo(W2 - m, L * 0.06); x.lineTo(W2 - m, L - m * 1.8); x.lineTo(W2 / 2, cut - m * 1.2); x.lineTo(m, L - m * 1.8); x.closePath();
    x.strokeStyle = '#f2c35a'; x.lineWidth = Math.max(1.2, W2 * 0.035); x.stroke();
    x.restore();
    cloth(); x.strokeStyle = '#e8b445'; x.lineWidth = Math.max(1.6, W2 * 0.06); x.stroke();
    cloth(); x.strokeStyle = 'rgba(40,16,0,0.85)'; x.lineWidth = 1; x.stroke();
    /* emblema */
    const E = W2 * 0.5, cx = W2 / 2, cy = L * 0.36;
    x.save(); x.translate(cx, cy);
    const goldFill = () => { const gg = x.createLinearGradient(0, -E * 0.6, 0, E * 0.6); gg.addColorStop(0, '#fff2b0'); gg.addColorStop(0.5, '#e8b445'); gg.addColorStop(1, '#9a6410'); x.fillStyle = gg; x.fill(); x.lineWidth = 1; x.strokeStyle = '#3a1e04'; x.stroke(); };
    if (b.em === 'torre') {
      const tw = E * 0.62, th = E * 0.78, mh = E * 0.16;
      x.beginPath(); x.moveTo(-tw / 2, th / 2); x.lineTo(-tw / 2, -th / 2);
      for (let i = 0; i < 3; i++) { const x0 = -tw / 2 + (tw / 3) * i; x.lineTo(x0, -th / 2 - mh); x.lineTo(x0 + tw / 6, -th / 2 - mh); x.lineTo(x0 + tw / 6, -th / 2); x.lineTo(x0 + tw / 3, -th / 2); }
      x.lineTo(tw / 2, th / 2); x.closePath(); goldFill();
      x.beginPath(); x.moveTo(-tw * 0.17, th / 2); x.lineTo(-tw * 0.17, th * 0.12); x.arc(0, th * 0.12, tw * 0.17, Math.PI, 0); x.lineTo(tw * 0.17, th / 2); x.closePath(); x.fillStyle = U.shade(F.color, -0.45); x.fill();
      x.fillRect(-tw * 0.06, -th * 0.3, tw * 0.12, th * 0.18);
    } else {
      const cw = E * 0.86, ch = E * 0.6;
      x.beginPath(); x.moveTo(-cw / 2, ch / 2); x.lineTo(-cw / 2, -ch * 0.2); x.lineTo(-cw * 0.25, ch * 0.08); x.lineTo(0, -ch / 2); x.lineTo(cw * 0.25, ch * 0.08); x.lineTo(cw / 2, -ch * 0.2); x.lineTo(cw / 2, ch / 2); x.closePath(); goldFill();
      [[-cw / 2, -ch * 0.2], [0, -ch / 2], [cw / 2, -ch * 0.2]].forEach((p) => { x.beginPath(); x.arc(p[0], p[1] - 1.6, Math.max(1.4, E * 0.07), 0, TAU); x.fillStyle = '#fff2b0'; x.fill(); x.stroke(); });
      x.beginPath(); x.arc(0, ch * 0.28, Math.max(1.4, E * 0.08), 0, TAU); x.fillStyle = '#e0202a'; x.fill(); x.stroke();
    }
    x.restore();
    /* borlas en las puntas */
    [[0, L], [W2, L]].forEach((p) => {
      x.beginPath(); x.moveTo(p[0], p[1]); x.lineTo(p[0], p[1] + 3); x.strokeStyle = '#3a1e04'; x.lineWidth = 0.8; x.stroke();
      x.beginPath(); x.ellipse(p[0], p[1] + 4.2, 1.8, 2.4, 0, 0, TAU); x.fillStyle = '#e8b445'; x.fill(); x.stroke();
    });
    return c;
  }

  /* escena animada de fondo del título */
  class TitleScene {
    constructor(cv, fcv) {
      this.cv = cv; this.fcv = fcv; this.t = 0;
      this.life = FF.Life ? new FF.Life() : null;
      this.M = { m: 1, tx: 0, ty: 0 };
      this.build();
      this.squads = [0, 0.33, 0.66].map((p) => ({ p, o: 1 }));
      this.squads.push({ p: 0.5, o: 2, back: true });
    }
    build() {
      const r = this.cv.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = Math.max(320, r.width); this.h = Math.max(200, r.height);
      this.cv.width = Math.round(this.w * dpr); this.cv.height = Math.round(this.h * dpr);
      this.dpr = dpr;
      const W = 1280, H = 720;
      this.sc = Math.max(this.w / W, this.h / H);
      const R = U.clamp(this.sc * dpr, 0.6, 1.6);
      const path = [];
      for (let i = 0; i <= 40; i++) { const t = i / 40; path.push({ x: 60 + t * 1160, y: 610 - Math.sin(t * Math.PI) * 120 - t * 120 + Math.sin(t * 9) * 18 }); }
      this.path = path;
      const cum = [0];
      for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
      this.cum = cum;
      const q = (FF.Save && FF.Save.data && FF.Save.data.settings.quality) || 'alta';
      this.img = FF.Terrain.scene('valle', 77, W, H, R, path, { sway: q !== 'baja' && !!this.life });
      if (this.life) { this.life.reset(Object.assign({ lakes: [], islands: [], flows: [] }, this.img.life || { biome: 'valle', sway: [] }), q, 77); this.life.setBase(this.img, R); }
      this.blds = [
        ['castillo', 4, 1, 150, 600], ['aldea', 3, 1, 300, 650], ['aldea', 2, 1, 70, 470],
        ['torre', 2, 0, 640, 560], ['aldea', 1, 0, 820, 640], ['establo', 2, 0, 470, 420],
        ['castillo', 3, 2, 1150, 400], ['aldea', 2, 2, 1010, 300], ['herreria', 2, 2, 1180, 600]
      ].sort((a, b) => a[4] - b[4]);
      /* marco y estandartes */
      if (this.fcv) {
        this.T = drawFrame(this.fcv, this.w, this.h, dpr);
        this.fcv.parentNode && this.fcv.parentNode.style.setProperty('--frame', this.T + 'px');
      }
      this.banners = this.fcv ? bannerSpots(this.w, this.h).map((b) => Object.assign(b, { spr: drawBanner(b, dpr) })) : [];
    }
    frame(dt) {
      this.t += dt;
      const r = this.cv.getBoundingClientRect();
      if (Math.abs(r.width - this.w) > 2 || Math.abs(r.height - this.h) > 2) this.build();
      const ctx = this.cv.getContext('2d');
      const W = 1280, H = 720, d = this.dpr;
      const ox = (this.w - W * this.sc) / 2, oy = (this.h - H * this.sc) / 2;
      const M = this.M; M.m = d * this.sc; M.tx = d * ox; M.ty = d * oy;
      ctx.setTransform(M.m, 0, 0, M.m, M.tx, M.ty);
      ctx.drawImage(this.life ? this.life.baseCanvas(this.img) : this.img, 0, 0, W, H);
      if (this.life) this.life.ground(ctx, dt, M);
      /* edificios: los de un reino respiran y se balancean; los neutrales, no */
      this.blds.forEach((b, i) => {
        const s = FF.Art.building(b[0], b[1], b[2]);
        let k = 0, sy = 1, sx = 1;
        if (b[2]) { const ph = i * 2.39, br = Math.sin(this.t * 2.1 + ph); sy = 1 + 0.016 * br; sx = 1 - 0.009 * br; k = 0.024 * Math.sin(this.t * 1.35 + ph * 1.7); }
        ctx.save(); ctx.translate(b[3], b[4]);
        if (k) ctx.transform(1, 0, k, 1, 0, 0);
        ctx.scale(1.15 * sx, 1.15 * sy);
        ctx.drawImage(s.c, -s.ax, -s.ay, s.w, s.h);
        const m = s.meta.flag;
        if (m) {
          ctx.beginPath(); ctx.moveTo(m.x, m.y);
          for (let q = 0; q <= 6; q++) { const u = q / 6; ctx.lineTo(m.x + u * 12, m.y + Math.sin(this.t * 6 + u * 3 + i) * 1.6 * u); }
          for (let q = 6; q >= 0; q--) { const u = q / 6; ctx.lineTo(m.x + u * 12, m.y + 7 + Math.sin(this.t * 6 + u * 3 + i) * 1.6 * u); }
          ctx.closePath(); ctx.fillStyle = b[2] ? FF.FACTIONS[b[2]].color : '#efe9dc'; ctx.fill();
          ctx.strokeStyle = 'rgba(30,20,10,0.6)'; ctx.lineWidth = 0.6; ctx.stroke();
        }
        ctx.restore();
      });
      /* tropas en marcha */
      const L = this.cum[this.cum.length - 1];
      const p = {};
      this.squads.forEach((sq) => {
        sq.p += dt * 0.025 * (sq.back ? -1 : 1);
        if (sq.p > 1) sq.p -= 1; if (sq.p < 0) sq.p += 1;
        for (let k = 0; k < 9; k++) {
          const dd = (sq.p * L - k * 7 * (sq.back ? -1 : 1) + L) % L;
          FF.polyAt(this.path, this.cum, dd, p);
          const lat = ((k % 3) - 1) * 4.5;
          const nx = -Math.sin(p.a), ny = Math.cos(p.a);
          const fr = Math.floor((this.t * 8 + k * 0.37) % 4);
          const s = FF.Art.unit(k % 4 === 3 && !sq.back ? 'jinete' : 'soldado', sq.o, fr, sq.back ? Math.cos(p.a) > 0 : Math.cos(p.a) < 0);
          ctx.drawImage(s.c, p.x + nx * lat - s.ax * 1.4, p.y + ny * lat - s.ay * 1.4, s.w * 1.4, s.h * 1.4);
        }
      });
      if (this.life) this.life.sky(ctx, dt);
      ctx.fillStyle = 'rgba(10,6,2,0.24)'; ctx.fillRect(0, 0, W, H);
      /* estandartes ondeando (bajo la barra dorada, que va en el marco) */
      this.banners.forEach((b, i) => {
        const k = 0.05 * Math.sin(this.t * 1.2 + i * 1.9) + 0.018 * Math.sin(this.t * 2.9 + i);
        const x0 = b.x - b.bw / 2 - 3, y0 = this.T + 1;
        ctx.setTransform(d, 0, d * k, d, d * x0, d * y0);
        ctx.drawImage(b.spr, 0, 0, b.spr.width / d, b.spr.height / d);
      });
    }
  }

  UI.tick = function (dt) {
    if (UI.bgScene) UI.bgScene.frame(dt);
    if (hud && !hud.classList.contains('hidden')) UI.updateHUD(dt);
  };

  /* ======================= MAPA DE CAMPAÑA ======================= */
  const MAPPTS = [
    [[0.08, 0.80], [0.20, 0.68], [0.15, 0.50], [0.30, 0.42], [0.45, 0.52], [0.56, 0.72], [0.70, 0.60], [0.66, 0.36], [0.85, 0.24]],
    [[0.07, 0.62], [0.18, 0.80], [0.32, 0.70], [0.42, 0.50], [0.55, 0.35], [0.66, 0.55], [0.78, 0.72], [0.88, 0.55], [0.84, 0.30]],
    [[0.08, 0.72], [0.22, 0.82], [0.35, 0.66], [0.30, 0.45], [0.48, 0.38], [0.62, 0.50], [0.60, 0.75], [0.78, 0.66], [0.88, 0.40]],
    [[0.10, 0.85], [0.12, 0.62], [0.27, 0.52], [0.42, 0.62], [0.52, 0.80], [0.66, 0.68], [0.72, 0.46], [0.60, 0.28], [0.84, 0.22]],
    [[0.07, 0.55], [0.18, 0.72], [0.32, 0.82], [0.46, 0.68], [0.44, 0.44], [0.58, 0.34], [0.72, 0.48], [0.86, 0.66], [0.88, 0.34]]
  ];
  const mapCache = {};
  function catmull(P, n) {
    const out = [];
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        out.push({
          x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
        });
      }
    }
    out.push(P[P.length - 1]);
    return out;
  }

  /* vuelve a pintar la pantalla actual (p. ej. si la tarjeta gráfica perdió los lienzos) */
  UI.redraw = function () {
    if (UI.screen === 'title') UI.showTitle();
    else if (UI.screen === 'map') UI.showMap(UI.mapWorld | 0);
  };

  UI.showMap = function (w) {
    clearScreens();
    UI.screen = 'map';
    UI.mapWorld = w;
    UI.hideHUD();
    const Save = FF.Save;
    w = U.clamp(w | 0, 0, 4);
    while (w > 0 && !Save.worldUnlocked(w)) w--;
    Save.data.lastWorld = w; Save.save();
    const W = FF.WORLDS[w];
    FF.Audio.playMusic('map', w, { biome: W.biome });
    const s = el('section', 'screen fade-in'); s.id = 'scr-map';
    const top = el('div', 'map-top');
    top.appendChild(btn(FF.icon('back'), 'wood icon', () => UI.showTitle()));
    const tabs = el('div', 'tabs');
    FF.WORLDS.forEach((ww, i) => {
      const un = Save.worldUnlocked(i);
      const pr = Save.worldProgress(i);
      const t = el('button', 'tab' + (i === w ? ' on' : '') + (un ? '' : ' lock'), (un ? '' : FF.icon('lock')) + '<span>' + ww.name + '</span><span class="p">' + pr.done + '/9</span>');
      t.addEventListener('click', () => { if (!un) { FF.Audio.play('denied'); UI.toast('Completa el mundo anterior para viajar aquí'); return; } FF.Audio.play('click'); UI.showMap(i); });
      tabs.appendChild(t);
    });
    top.appendChild(tabs);
    requestAnimationFrame(() => { const on = tabs.querySelector('.tab.on'); if (on && tabs.scrollWidth > tabs.clientWidth) tabs.scrollLeft = on.offsetLeft - (tabs.clientWidth - on.offsetWidth) / 2; });
    top.appendChild(btn(FF.icon('trophy'), 'wood icon', () => UI.achievements()));
    top.appendChild(btn(FF.icon('gear'), 'wood icon', () => UI.options()));
    s.appendChild(top);
    const wrap = el('div', 'map-wrap');
    const frame = el('div', 'map-frame');
    const cv = el('canvas');
    frame.appendChild(cv);
    const pr = Save.worldProgress(w);
    const info = el('div', 'map-info parch', '<h2>' + W.name + '</h2><p>' + W.desc + '</p><div class="prog">' + FF.icon('flag') + ' ' + pr.done + '/9 niveles · ' + FF.icon('star') + ' ' + pr.medals + '/27 medallas</div>');
    frame.appendChild(info);
    const pts = MAPPTS[w];
    let nextShown = false;
    pts.forEach((p, i) => {
      const lvl = FF.LEVELS[w * 9 + i];
      const un = Save.levelUnlocked(lvl.id), dn = Save.done(lvl.id);
      const all = [0, 1, 2].every((m) => Save.medal(lvl.id, m));
      const fill = !un ? '#8a8476' : all ? '#f2c14e' : dn ? '#2f6fdc' : '#d63a2b';
      const dark = !un ? '#4a463e' : all ? '#7a5206' : dn ? '#163b7e' : '#6a140c';
      const b = el('button', 'lvl' + (un ? '' : ' locked') + (un && !dn && !nextShown ? ' next' : ''));
      if (un && !dn) nextShown = true;
      b.style.left = (p[0] * 100) + '%'; b.style.top = (p[1] * 100) + '%';
      let meds = '<div class="meds">';
      for (let m = 0; m < 3; m++) meds += '<i class="' + (Save.medal(lvl.id, m) ? 'm' : Save.done(lvl.id, m) ? 'd' : '') + '"></i>';
      meds += '</div>';
      b.innerHTML = '<div class="flag">' + FF.flagSVG(fill, dark) + '<b>' + (i + 1) + '</b></div>' + meds + '<div class="name">' + lvl.name + '</div>';
      b.addEventListener('click', () => {
        if (!un) { FF.Audio.play('denied'); UI.toast('Conquista el nivel anterior primero'); return; }
        FF.Audio.play('click'); UI.brief(lvl);
      });
      frame.appendChild(b);
    });
    wrap.appendChild(frame);
    s.appendChild(wrap);
    scr.appendChild(s);
    /* pintar escena del mundo: el marco ocupa todo el hueco; los niveles van en el centro con su
       proporción de siempre y a los lados (o arriba y abajo) se ve más paisaje */
    const lvlBtns = Array.from(frame.querySelectorAll('.lvl'));
    const layout = () => {
      if (!frame.isConnected) { window.removeEventListener('resize', onResize); return; }
      const r = frame.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) return;
      const Wd = Math.max(1280, Math.round(720 * r.width / r.height)), Hd = Math.max(720, Math.round(1280 * r.height / r.width));
      const ox = (Wd - 1280) / 2, oy = (Hd - 720) / 2;
      lvlBtns.forEach((b, i) => { b.style.left = ((ox + pts[i][0] * 1280) / Wd * 100) + '%'; b.style.top = ((oy + pts[i][1] * 720) / Hd * 100) + '%'; });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const R = U.clamp((r.width * dpr) / Wd, 0.5, 1.6);
      const key = w + '_' + R.toFixed(2) + '_' + pr.done + '_' + Wd + 'x' + Hd;
      let img = mapCache[key];
      if (!img) {
        const P = pts.map((q) => ({ x: ox + q[0] * 1280, y: oy + q[1] * 720 + 6 }));
        const path = catmull(P, 12);
        img = FF.Terrain.scene(W.biome, 900 + w * 17, Wd, Hd, R, path);
        const ctx = img.getContext('2d');
        ctx.setTransform(R, 0, 0, R, 0, 0);
        pts.map((q, i) => ({ q, i })).sort((a, b) => a.q[1] - b.q[1]).forEach(({ q, i }) => {
          const lvl = FF.LEVELS[w * 9 + i];
          const owner = Save.done(lvl.id) ? 1 : Save.levelUnlocked(lvl.id) ? FF.WORLD_FOE[w] : 0;
          const type = i === 8 ? 'castillo' : i % 4 === 3 ? 'torre' : 'aldea';
          const lv = i === 8 ? 4 : type === 'torre' ? 2 : 1 + (i % 3 === 2 ? 1 : 0);
          const sp = FF.Art.building(type, lv, owner);
          const x = ox + q[0] * 1280 - 46, y = oy + q[1] * 720 - 6;
          ctx.drawImage(sp.c, x - sp.ax * 1.1, y - sp.ay * 1.1, sp.w * 1.1, sp.h * 1.1);
        });
        mapCache[key] = img;
      }
      cv.width = img.width; cv.height = img.height;
      cv.getContext('2d').drawImage(img, 0, 0);
    };
    let rt = null;
    const onResize = () => { clearTimeout(rt); rt = setTimeout(layout, 150); };
    window.addEventListener('resize', onResize);
    requestAnimationFrame(layout);
  };
  FF.WORLD_FOE = [2, 2, 5, 5, 5];

  /* ======================= BRIEFING ======================= */
  UI.levelPreview = function (level, cw) {
    const map = new FF.GameMap(level);
    const R = cw / 1280;
    const T = FF.Terrain.render(level, map, R);
    const c = T.canvas, ctx = c.getContext('2d');
    ctx.setTransform(R, 0, 0, R, 0, 0);
    level.nodes.slice().sort((a, b) => a[1] - b[1]).forEach((n) => {
      const s = FF.Art.building(n[2], n[3], n[4]);
      ctx.drawImage(s.c, n[0] - s.ax * 1.5, n[1] - s.ay * 1.5, s.w * 1.5, s.h * 1.5);
    });
    return c;
  };

  UI.brief = function (level) {
    const Save = FF.Save;
    const d = el('div', 'dlg parch wide');
    const w = level.world;
    d.innerHTML = '<h2>' + level.name + '</h2><div style="text-align:center;font-size:.85em;color:#6a5030;margin-bottom:.6em">' + FF.WORLDS[w].name + ' · Nivel ' + (level.index + 1) + ' de 9</div>';
    const g = el('div', 'brief');
    const left = el('div');
    const pv = el('canvas', 'prev');
    left.appendChild(pv);
    g.appendChild(left);
    const right = el('div');
    let html = '<div class="desc">«' + level.desc + '»</div>';
    const foes = (level.factions || [1, 2]).slice(1);
    const fset = foes.length ? foes : Array.from(new Set(level.nodes.map((n) => n[4]).filter((o) => o > 1)));
    html += '<div style="font-family:var(--serif);font-weight:bold">Rivales</div><div class="foes">' +
      fset.map((f) => '<span class="foe"><i style="background:' + FF.FACTIONS[f].color + '"></i>' + FF.FACTIONS[f].lord + '</span>').join('') + '</div>';
    html += '<div style="font-size:.85em;color:#5a4330">' + level.nodes.length + ' edificios · ' + level.roads.length + ' caminos</div>';
    if (level.feature) {
      const fe = level.feature;
      const txt = FF.BUILD[fe] ? '<b>Nuevo edificio: ' + FF.BUILD[fe].name + '.</b> ' + FF.BUILD[fe].desc : '<b>Nueva reliquia: ' + FF.SPELLS[fe].name + '.</b> ' + FF.SPELLS[fe].desc;
      html += '<div class="feature">' + txt + '</div>';
    }
    const newSpell = FF.SPELL_ORDER.find((k) => FF.SPELLS[k].unlock === level.id);
    if (newSpell && level.feature !== newSpell) html += '<div class="feature"><b>Nueva reliquia: ' + FF.SPELLS[newSpell].name + '.</b> ' + FF.SPELLS[newSpell].desc + '</div>';
    right.innerHTML = html;
    const modes = el('div', 'modes');
    let sel = 0;
    for (let m = 2; m >= 0; m--) if (Save.modeUnlocked(level.id, m) && !Save.done(level.id, m)) { sel = m; break; }
    if ([0, 1, 2].every((m) => Save.done(level.id, m))) sel = 0;
    const cards = [];
    FF.MODES.forEach((M, m) => {
      const un = Save.modeUnlocked(level.id, m);
      const r = Save.data.levels[level.id] && Save.data.levels[level.id].m[m];
      const c = el('button', 'mode' + (un ? '' : ' lock') + (m === sel ? ' on' : ''));
      c.innerHTML = '<b>' + (un ? '' : FF.icon('lock') + ' ') + M.name + '</b>' + FF.icon('star') + ' Medalla: ' + U.fmtTime(level.medal[m]) +
        '<small>' + (r ? 'Mejor: ' + U.fmtTime(r.t) + (r.medal ? ' ★' : '') : un ? 'Sin completar' : 'Supera el modo anterior') + '</small>';
      c.title = M.desc;
      c.addEventListener('click', () => {
        if (!un) { FF.Audio.play('denied'); return; }
        FF.Audio.play('select');
        sel = m; cards.forEach((x, i) => x.classList.toggle('on', i === m));
        mdesc.textContent = FF.MODES[m].desc;
      });
      cards.push(c); modes.appendChild(c);
    });
    right.appendChild(modes);
    const mdesc = el('div', '', FF.MODES[sel].desc);
    mdesc.style.cssText = 'font-size:.82em;font-style:italic;margin-top:.4em;color:#5a4330';
    right.appendChild(mdesc);
    g.appendChild(right);
    d.appendChild(g);
    const acts = el('div', 'acts');
    acts.appendChild(btn('Volver', 'wood', () => UI.closeModal()));
    acts.appendChild(btn(FF.icon('swords') + ' ¡A la batalla!', '', () => { UI.closeModal(); app.startLevel(level, sel); }));
    d.appendChild(acts);
    UI.openModal(d, () => UI.closeModal());
    requestAnimationFrame(() => {
      const r = pv.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const img = UI.levelPreview(level, Math.max(320, Math.min(900, r.width * dpr)));
      pv.width = img.width; pv.height = img.height;
      pv.getContext('2d').drawImage(img, 0, 0);
    });
  };

  /* ======================= VENTANAS ======================= */
  UI.openModal = function (content, onClose) {
    modal.innerHTML = '';
    modal.appendChild(content);
    modal.classList.remove('hidden');
    UI.modalClose = onClose || null;
  };
  UI.closeModal = function () {
    modal.classList.add('hidden');
    modal.innerHTML = '';
    UI.modalClose = null;
  };
  UI.modalOpen = function () { return !modal.classList.contains('hidden'); };

  UI.confirm = function (title, text, yes, onYes, onNo) {
    const d = el('div', 'dlg parch');
    d.innerHTML = '<h2>' + title + '</h2><p style="text-align:center;max-width:26em">' + text + '</p>';
    const acts = el('div', 'acts');
    const no = () => { UI.closeModal(); if (onNo) onNo(); };
    acts.appendChild(btn('Cancelar', 'wood', no));
    acts.appendChild(btn(yes, 'red', () => { UI.closeModal(); onYes(); }));
    d.appendChild(acts);
    UI.openModal(d, no);
  };

  UI.confirmQuit = function () {
    UI.confirm('¿Salir del juego?', 'Tu progreso está guardado. ¡Vuelve pronto, mi señor!', 'Salir', () => FF.Host.quit());
  };

  UI.pause = function () {
    const d = el('div', 'dlg parch');
    d.innerHTML = '<h2>Pausa</h2><p style="text-align:center;margin:.3em 0 0">' + (app.game ? app.game.level.name + ' · ' + app.game.mode.name : '') + '</p>';
    const acts = el('div', 'menu');
    acts.style.margin = '1em auto 0';
    acts.appendChild(btn(FF.icon('play') + ' Continuar', '', () => { UI.closeModal(); app.setPaused(false); }));
    acts.appendChild(btn(FF.icon('restart') + ' Reiniciar', 'wood', () => { UI.closeModal(); app.restart(); }));
    const r = el('div', 'row');
    r.appendChild(btn(FF.icon('book') + ' Ayuda', 'wood small', () => UI.help(() => UI.pause())));
    r.appendChild(btn(FF.icon('gear') + ' Opciones', 'wood small', () => UI.options(() => UI.pause())));
    acts.appendChild(r);
    acts.appendChild(btn(FF.icon('map') + ' Abandonar', 'red', () => { UI.closeModal(); app.quitToMap(); }));
    if (FF.Host.canQuit) acts.appendChild(btn(FF.icon('close') + ' Salir del juego', 'wood small', () => UI.confirmQuit()));
    d.appendChild(acts);
    UI.openModal(d, () => { UI.closeModal(); app.setPaused(false); });
  };

  UI.result = function (game, rec, achs) {
    const res = game.result, st = res.stats, win = res.win;
    const d = el('div', 'dlg parch');
    const lvl = game.level;
    let html = '<div class="res-title title-gold">' + (win ? '¡Victoria!' : 'Derrota') + '</div>';
    html += '<div style="text-align:center;font-family:var(--serif)">' + lvl.name + ' · ' + game.mode.name + '</div>';
    if (win && lvl.medal) {
      const medT = lvl.medal[game.modeIndex];
      html += '<div class="res-medal">' + (rec.medal ? '<svg class="md" viewBox="0 0 24 24"><defs><linearGradient id="mg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2b0"/><stop offset="1" stop-color="#e09a1c"/></linearGradient></defs><path fill="url(#mg)" stroke="#6a430b" stroke-width="1" d="' + 'M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.2 5.8 20.9l1.6-7L2 9.2l7.1-.6z' + '"/></svg><span>¡Medalla de tiempo!<br><small>' + U.fmtTime(res.time) + ' de ' + U.fmtTime(medT) + '</small></span>' :
        '<span>' + FF.icon('clock') + ' ' + U.fmtTime(res.time) + ' — medalla en ' + U.fmtTime(medT) + '</span>') + '</div>';
    } else if (!win) {
      html += '<p style="text-align:center;font-style:italic">Tus tierras han caído... pero un buen señor siempre vuelve.</p>';
    }
    html += '<div class="stats">' +
      '<div class="stat">Tiempo <b>' + U.fmtTime(res.time) + '</b></div>' +
      '<div class="stat">Soldados entrenados <b>' + U.fmtNum(st.produced) + '</b></div>' +
      '<div class="stat">Enemigos abatidos <b>' + U.fmtNum(st.killed) + '</b></div>' +
      '<div class="stat">Bajas propias <b>' + U.fmtNum(st.lost) + '</b></div>' +
      '<div class="stat">Edificios conquistados <b>' + st.captured + '</b></div>' +
      '<div class="stat">Edificios perdidos <b>' + st.lostBuildings + '</b></div>' +
      '<div class="stat">Mejoras <b>' + st.upgrades + '</b></div>' +
      '<div class="stat">Hechizos <b>' + st.spells + '</b></div></div>';
    if (win) html += '<div class="score">Puntuación: <b>' + U.fmtNum(rec.score) + '</b>' + (rec.best && !rec.first ? ' · ¡nuevo récord!' : '') + '</div>';
    if (achs && achs.length) html += '<div class="feature" style="text-align:center">' + achs.map((a) => FF.icon(a.icon) + ' <b>' + a.name + '</b>').join(' · ') + '</div>';
    d.innerHTML = html;
    const acts = el('div', 'acts');
    acts.appendChild(btn(FF.icon('map') + ' Mapa', 'wood', () => { UI.closeModal(); app.quitToMap(); }));
    acts.appendChild(btn(FF.icon('restart') + ' Repetir', 'wood', () => { UI.closeModal(); app.restart(); }));
    if (win && !lvl.skirmish) {
      const idx = FF.Save.levelIndex(lvl.id);
      const next = FF.LEVELS[idx + 1];
      if (next) acts.appendChild(btn('Siguiente ' + FF.icon('play'), '', () => { UI.closeModal(); UI.showMap(next.world); setTimeout(() => UI.brief(next), 50); }));
      else acts.appendChild(btn('¡Has conquistado el mundo!', '', () => { UI.closeModal(); UI.credits(); }));
      if (game.modeIndex < 2 && FF.Save.modeUnlocked(lvl.id, game.modeIndex + 1)) acts.appendChild(btn('Modo ' + FF.MODES[game.modeIndex + 1].name, 'red', () => { UI.closeModal(); app.startLevel(lvl, game.modeIndex + 1); }));
    }
    if (lvl.skirmish) acts.appendChild(btn('Otra batalla', '', () => { UI.closeModal(); UI.skirmish(); }));
    d.appendChild(acts);
    UI.openModal(d, null);
  };

  UI.achievements = function () {
    const d = el('div', 'dlg parch wide');
    const got = Object.keys(FF.Save.data.ach).length;
    d.innerHTML = '<h2>' + FF.icon('trophy') + ' Logros</h2><div style="text-align:center">' + got + ' de ' + FF.ACHIEVEMENTS.length + ' desbloqueados</div>';
    const g = el('div', 'ach-grid');
    FF.ACHIEVEMENTS.forEach((a) => {
      const on = FF.Save.data.ach[a.id];
      g.appendChild(el('div', 'ach' + (on ? '' : ' off'), '<div class="ic">' + FF.icon(a.icon) + '</div><div><b>' + a.name + '</b><span>' + a.desc + '</span></div>'));
    });
    d.appendChild(g);
    const st = FF.Save.data.stats;
    d.appendChild(el('div', 'stats', '<div class="stat">Victorias <b>' + st.wins + '</b></div><div class="stat">Derrotas <b>' + st.losses + '</b></div><div class="stat">Soldados entrenados <b>' + U.fmtNum(st.trained) + '</b></div><div class="stat">Mejoras <b>' + U.fmtNum(st.upgrades) + '</b></div><div class="stat">Medallas <b>' + FF.Save.countMedals() + '/135</b></div><div class="stat">Tiempo jugado <b>' + Math.floor(st.playTime / 60) + ' min</b></div>'));
    const acts = el('div', 'acts');
    acts.appendChild(btn('Cerrar', 'wood', () => UI.closeModal()));
    d.appendChild(acts);
    UI.openModal(d, () => UI.closeModal());
  };

  UI.help = function (back) {
    const d = el('div', 'dlg parch wide');
    d.innerHTML = '<h2>' + FF.icon('book') + ' Cómo jugar</h2>';
    const tabs = el('div', 'help-tabs');
    const body = el('div', 'help-body');
    const pages = {
      'Reglas': () => '<p><b>Objetivo:</b> conquista todos los edificios de los señores rivales. Ganas cuando no les queda ni un edificio ni un soldado en marcha.</p>' +
        '<p><b>Producción:</b> cada edificio con dueño entrena soldados hasta llenar su capacidad. Si recibe refuerzos por encima de su capacidad, el exceso se va perdiendo poco a poco.</p>' +
        '<p><b>Ataque:</b> al enviar tropas sale <b>la mitad</b> de la guarnición. Si llegan más atacantes que defensores, el edificio cambia de dueño.</p>' +
        '<p><b>Caminos:</b> las tropas sólo marchan por los caminos y sólo atraviesan edificios tuyos. Un edificio enemigo en medio del camino bloquea el paso: habrá que tomarlo primero.</p>' +
        '<p><b>Choques:</b> si dos ejércitos rivales se cruzan en el mismo camino, luchan cuerpo a cuerpo.</p>' +
        '<p><b>Mejoras:</b> cuando aparece la flecha dorada ▲ sobre un edificio tuyo, puedes mejorarlo pagando la mitad de su capacidad en soldados. Gana una estrella, más capacidad y produce más rápido.</p>' +
        '<p><b>Conquista:</b> un edificio conquistado pierde todas sus estrellas y vuelve al nivel básico, tanto si lo tomas tú como si te lo quitan. Habrá que volver a mejorarlo.</p>' +
        '<p><b>Medallas:</b> termina un nivel por debajo del tiempo marcado para ganar su medalla. Cada nivel tiene tres modos: Escudero, Caballero y Señor de la Guerra.</p>',
      'Controles': () => '<div class="keys">' +
        '<span><b>Clic en tu edificio</b></span><span>Lo selecciona. Toca más edificios tuyos para seleccionarlos juntos; tócalo otra vez para soltarlo.</span>' +
        '<span><b>Clic en un enemigo</b></span><span>Todos los seleccionados envían la mitad de sus tropas. Vuelve a tocarlo para mandar otra oleada.</span>' +
        '<span><b>Doble clic en tu edificio</b></span><span>Los seleccionados le envían refuerzos.</span>' +
        '<span><b>Clic en el suelo</b></span><span>Suelta la selección.</span>' +
        '<span><b>Arrastrar</b></span><span>Arrastra desde tu edificio hasta el objetivo; los edificios tuyos que cruces se suman.</span>' +
        '<span><b>Mantener pulsado</b></span><span>Muestra la ficha del edificio y, si es una atalaya, su alcance.</span>' +
        '<span><kbd>Clic derecho</kbd></span><span>Mejora el edificio tuyo bajo el puntero.</span>' +
        '<span><kbd>A</kbd></span><span>Selecciona todos tus edificios.</span>' +
        '<span><kbd>U</kbd></span><span>Mejora los edificios seleccionados.</span>' +
        '<span><kbd>1</kbd>–<kbd>5</kbd></span><span>Prepara un hechizo.</span>' +
        '<span><kbd>F</kbd></span><span>Velocidad normal / doble.</span>' +
        '<span><kbd>Espacio</kbd> / <kbd>Esc</kbd></span><span>Pausa / cancelar.</span></div>',
      'Edificios': () => '<div class="bgrid">' + FF.BUILD_ORDER.map((k) => {
        const b = FF.BUILD[k];
        const caps = b.levels.map((l) => l.cap).join(' / ');
        return '<div class="bcard"><canvas data-b="' + k + '" width="200" height="200"></canvas><div><b>' + b.name + '</b><p>' + b.desc + '</p><p><small>Capacidad por nivel: ' + caps + (b.levels[0].prod ? ' · Producción: ' + b.levels.map((l) => l.prod.toFixed(2)).join(' / ') + '/s' : ' · Lanzas por segundo: ' + b.levels.map((l) => l.rate).join(' / ') + ' (nivel 3: perforantes)') + '</small></p></div></div>';
      }).join('') + '</div>',
      'Tropas': () => '<div class="bgrid">' +
        '<div class="bcard"><canvas data-u="soldado" width="120" height="120"></canvas><div><b>Soldado</b><p>Sale de aldeas, castillos y atalayas. Equilibrado. Las atalayas y castillos le resisten mejor.</p></div></div>' +
        '<div class="bcard"><canvas data-u="jinete" width="120" height="120"></canvas><div><b>Jinete</b><p>Sale del Establo. Corre el doble y esquiva el 40% de las flechas. Golpea a las atalayas con toda su fuerza.</p></div></div>' +
        '<div class="bcard"><canvas data-u="caballero" width="120" height="120"></canvas><div><b>Caballero</b><p>Sale de la Herrería. Golpea y resiste el doble, ignora las murallas de los castillos, pero marcha despacio.</p></div></div></div>' +
        '<p>Truco: envía refuerzos a un Establo o a una Herrería y ataca desde allí para convertir a tus soldados.</p>',
      'Hechizos': () => '<div class="bgrid">' + FF.SPELL_ORDER.map((k) => {
        const sp = FF.SPELLS[k];
        return '<div class="bcard"><div class="spell ' + k + '" style="flex:0 0 3.3em">' + FF.icon(k) + '</div><div><b>' + sp.name + '</b> <small>(' + sp.cost + ' de maná)</small><p>' + sp.desc + '</p></div></div>';
      }).join('') + '</div><p>El maná se recarga con el tiempo y al conquistar edificios. En modo Señor de la Guerra la magia está prohibida.</p>',
      'Consejos': () => '<p>• Expándete deprisa al principio: cada edificio más es producción extra.</p>' +
        '<p>• Mejorar cuando un edificio está lleno evita desperdiciar producción.</p>' +
        '<p>• Después de enviar tropas tu edificio queda medio vacío: vigila los contraataques.</p>' +
        '<p>• Ataca desde varios edificios a la vez para que tus tropas lleguen juntas.</p>' +
        '<p>• Contra una atalaya, mejor jinetes. Contra un castillo, mejor caballeros.</p>' +
        '<p>• Deja que los rivales se desgasten entre ellos y remata al más débil.</p>'
    };
    const names = Object.keys(pages);
    const show = (n) => {
      body.innerHTML = pages[n]();
      Array.from(tabs.children).forEach((b) => b.classList.toggle('on', b.textContent === n));
      body.querySelectorAll('canvas[data-b]').forEach((c) => {
        const ctx = c.getContext('2d');
        const k = c.dataset.b;
        const s = FF.Art.building(k, FF.maxLevel(k) > 3 ? 3 : 2, 1);
        ctx.drawImage(s.c, 100 - s.ax * 2.4, 168 - s.ay * 2.4, s.w * 2.4, s.h * 2.4);
      });
      body.querySelectorAll('canvas[data-u]').forEach((c) => {
        const ctx = c.getContext('2d');
        const s = FF.Art.unit(c.dataset.u, 1, 1, false);
        ctx.drawImage(s.c, 60 - s.ax * 3.6, 100 - s.ay * 3.6, s.w * 3.6, s.h * 3.6);
      });
    };
    names.forEach((n) => {
      const b = el('button', 'tab', n);
      b.addEventListener('click', () => { FF.Audio.play('click'); show(n); });
      tabs.appendChild(b);
    });
    d.appendChild(tabs); d.appendChild(body);
    const acts = el('div', 'acts');
    acts.appendChild(btn('Cerrar', 'wood', () => { if (back) back(); else UI.closeModal(); }));
    d.appendChild(acts);
    UI.openModal(d, () => { if (back) back(); else UI.closeModal(); });
    show(names[0]);
  };

  UI.options = function (back, tab) {
    const S = FF.Save.data.settings;
    const H = FF.Host;
    const d = el('div', 'dlg parch wide');
    d.innerHTML = '<h2>' + FF.icon('gear') + ' Opciones</h2>';
    const close = () => { if (back) back(); else UI.closeModal(); };
    const tabs = el('div', 'help-tabs');
    const body = el('div', 'help-body');
    const seg = (id, opts, val, fn) => {
      const w = el('div', 'seg'); w.id = id;
      opts.forEach((o) => {
        const bt = el('button', String(o[0]) === String(val) ? 'on' : '', o[1]);
        bt.addEventListener('click', () => { FF.Audio.play('select'); w.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === bt)); fn(o[0]); });
        w.appendChild(bt);
      });
      return w;
    };
    const row = (grid, label, ctl) => { grid.appendChild(el('label', '', label)); grid.appendChild(ctl); };
    const pages = {};
    pages['Sonido'] = () => {
      const o = el('div', 'opt');
      const mus = el('input'); mus.type = 'range'; mus.min = 0; mus.max = 1; mus.step = 0.05; mus.value = S.music;
      const sfx = el('input'); sfx.type = 'range'; sfx.min = 0; sfx.max = 1; sfx.step = 0.05; sfx.value = S.sfx;
      mus.addEventListener('input', () => { S.music = +mus.value; FF.Audio.setVolumes(S.music, S.sfx); FF.Save.save(); });
      sfx.addEventListener('input', () => { S.sfx = +sfx.value; FF.Audio.setVolumes(S.music, S.sfx); FF.Save.save(); });
      sfx.addEventListener('change', () => FF.Audio.play('capture'));
      row(o, 'Música', mus); row(o, 'Efectos', sfx);
      return o;
    };
    pages['Gráficos'] = () => {
      const o = el('div', 'opt');
      row(o, 'Calidad', seg('o-q', [['baja', 'Baja'], ['media', 'Media'], ['alta', 'Alta']], S.quality, (v) => { S.quality = v; FF.Save.save(); app.applyQuality(); }));
      row(o, 'Escala de render', seg('o-rs', [[0.5, '50%'], [0.75, '75%'], [1, '100%'], [1.25, '125%'], [1.5, '150%']], S.renderScale, (v) => { S.renderScale = v; FF.Save.save(); app.applyQuality(); }));
      row(o, 'Límite de FPS', seg('o-fps', [[30, '30'], [60, '60'], [120, '120'], [144, '144'], [0, 'Sin límite']], S.fpsCap, (v) => { S.fpsCap = v; FF.Save.save(); }));
      const chk = el('label', 'chk', '<input type="checkbox"> Mostrar contador de FPS');
      const cb = chk.querySelector('input'); cb.checked = S.showFps;
      cb.addEventListener('change', () => { S.showFps = cb.checked; FF.Save.save(); app.applyQuality(); });
      row(o, 'Rendimiento', chk);
      return o;
    };
    if (H.desktop) pages['Pantalla'] = () => UI.displayPage(row, seg);
    else if (!H.android) pages['Pantalla'] = () => {
      const o = el('div', 'opt');
      const fb = btn(FF.icon('full') + ' Pantalla completa', 'small wood', () => app.toggleFullscreen());
      row(o, 'Pantalla', fb);
      return o;
    };
    pages['Ayudas'] = () => {
      const o = el('div', 'opt');
      const box = el('div', '', '<label class="chk"><input type="checkbox" id="o-paths"> Mostrar rutas previstas</label><label class="chk"><input type="checkbox" id="o-tips"> Mostrar consejos del tutorial</label>');
      const pp = box.querySelector('#o-paths'), tp = box.querySelector('#o-tips');
      pp.checked = S.paths; tp.checked = S.tips;
      pp.addEventListener('change', () => { S.paths = pp.checked; FF.Save.save(); });
      tp.addEventListener('change', () => { S.tips = tp.checked; FF.Save.save(); });
      row(o, 'Ayudas', box);
      row(o, 'Progreso', btn('Borrar progreso', 'red small', () => UI.confirm('¿Borrar progreso?', 'Se perderán todos los niveles completados, medallas y logros. Esta acción no se puede deshacer.', 'Borrar todo', () => { FF.Save.reset(); UI.toast('Progreso borrado'); UI.showTitle(); })));
      return o;
    };
    const names = Object.keys(pages);
    const show = (n) => {
      body.innerHTML = ''; body.appendChild(pages[n]());
      Array.from(tabs.children).forEach((t) => t.classList.toggle('on', t.textContent === n));
    };
    names.forEach((n) => { const t = el('button', 'tab', n); t.addEventListener('click', () => { FF.Audio.play('click'); show(n); }); tabs.appendChild(t); });
    d.appendChild(tabs); d.appendChild(body);
    const acts = el('div', 'acts');
    acts.appendChild(btn('Cerrar', '', close));
    d.appendChild(acts);
    UI.openModal(d, close);
    show(tab && pages[tab] ? tab : names[0]);
  };

  /* ajustes de pantalla de la app de Windows */
  UI.displayPage = function (row, seg) {
    const info = FF.Host.info || {};
    const cur = Object.assign({ modo: 'completa', ventW: 1280, ventH: 720, pant: null, vsync: true }, info.ajustes || {});
    const A = JSON.parse(JSON.stringify(cur));
    const o = el('div', 'opt');
    const modos = (info.modos || []).slice();
    const esc = info.escritorio || { w: screen.width, h: screen.height, hz: 60 };
    row(o, 'Modo', seg('o-modo', [['completa', 'Pantalla completa'], ['ventana', 'Ventana'], ['maximizada', 'Ventana maximizada']], A.modo, (v) => { A.modo = v; refresh(); }));
    /* resolución y frecuencia de pantalla completa */
    const res = el('select', 'sel');
    const resList = [];
    modos.forEach((m) => { const k = m.w + 'x' + m.h; if (resList.indexOf(k) < 0) resList.push(k); });
    res.innerHTML = '<option value="">Escritorio (' + esc.w + '×' + esc.h + ' · ' + esc.hz + ' Hz)</option>' +
      resList.map((k) => '<option value="' + k + '">' + k.replace('x', '×') + '</option>').join('');
    const hz = el('select', 'sel');
    const fillHz = () => {
      const k = res.value;
      if (!k) { hz.innerHTML = '<option value="">' + esc.hz + ' Hz (escritorio)</option>'; hz.disabled = true; return; }
      hz.disabled = false;
      const list = modos.filter((m) => m.w + 'x' + m.h === k).map((m) => m.hz).filter((v, i, a) => a.indexOf(v) === i).sort((x, y) => y - x);
      hz.innerHTML = list.map((v) => '<option value="' + v + '">' + v + ' Hz</option>').join('');
      if (A.pant && list.indexOf(A.pant.hz) >= 0) hz.value = String(A.pant.hz);
    };
    if (A.pant) res.value = A.pant.w + 'x' + A.pant.h;
    fillHz();
    const setPant = () => {
      if (!res.value) { A.pant = null; return; }
      const p = res.value.split('x').map(Number);
      A.pant = { w: p[0], h: p[1], hz: +hz.value || 60 };
    };
    res.addEventListener('change', () => { fillHz(); setPant(); });
    hz.addEventListener('change', setPant);
    const rRes = el('div', 'pair'); rRes.appendChild(res); rRes.appendChild(hz);
    row(o, 'Resolución y frecuencia', rRes);
    /* tamaño de ventana */
    const vent = el('select', 'sel');
    const vlist = (info.ventanas && info.ventanas.length ? info.ventanas : [{ w: 1280, h: 720 }]);
    vent.innerHTML = vlist.map((v) => '<option value="' + v.w + 'x' + v.h + '">' + v.w + '×' + v.h + '</option>').join('');
    vent.value = A.ventW + 'x' + A.ventH;
    if (!vent.value) vent.selectedIndex = 0;
    vent.addEventListener('change', () => { const p = vent.value.split('x').map(Number); A.ventW = p[0]; A.ventH = p[1]; });
    row(o, 'Tamaño de ventana', vent);
    row(o, 'Sincronización vertical', seg('o-vs', [[true, 'Activada'], [false, 'Desactivada']], A.vsync, (v) => { A.vsync = v; }));
    const note = el('div', 'tip', 'Pantalla completa: sin barras ni botones. Si cambias de programa (Alt+Tab), el juego se minimiza y se pausa, y la pantalla vuelve a su resolución. Alt+Enter cambia entre pantalla completa y ventana (en ventana, F11 también).<br>La ventana del juego se reabre para aplicar los cambios. Con la sincronización desactivada, el límite de FPS de la pestaña Gráficos decide la velocidad de fotogramas.');
    note.style.cssText = 'grid-column:1/-1;font-size:.82em;color:#5a4330;font-style:italic';
    o.appendChild(note);
    const ap = btn(FF.icon('restart') + ' Aplicar', '', () => {
      if (!vent.value) vent.selectedIndex = 0;
      const p = vent.value.split('x').map(Number); A.ventW = p[0]; A.ventH = p[1];
      setPant();
      UI.applyDisplay(A);
    });
    const wrap = el('div'); wrap.style.cssText = 'grid-column:1/-1;text-align:center'; wrap.appendChild(ap);
    o.appendChild(wrap);
    const refresh = () => {
      const fs = A.modo === 'completa';
      res.disabled = !fs; hz.disabled = !fs || !res.value; vent.disabled = A.modo !== 'ventana';
    };
    refresh();
    return o;
  };

  /* App de Windows: aplica un modo de pantalla. La ventana del juego se reabre con él, así que
     en mitad de una batalla se pregunta antes (la batalla se perdería; el progreso no). */
  let applyingDisplay = false;
  UI.applyDisplay = function (A) {
    if (applyingDisplay) return;
    const inBattle = !!(app.game && !app.ending);
    const back = () => { if (inBattle) UI.pause(); };
    const go = () => {
      applyingDisplay = true;
      FF.Host.post('/ajustes', A).then((r) => {
        if (r && r.relanzar) {
          UI.toast('Aplicando…', '', 1500);
          FF.Save.save(); FF.Host.flushSave();
          setTimeout(() => { try { window.close(); } catch (e) { /* */ } }, 350);
        } else { applyingDisplay = false; UI.toast('Sin cambios', '', 1200); back(); }
      }).catch(() => { applyingDisplay = false; UI.toast('No se pudo aplicar', '', 1600); back(); });
    };
    if (inBattle) {
      app.setPaused(true);
      UI.confirm('¿Cambiar el modo de pantalla?', 'La ventana del juego se reabre y esta batalla se pierde. Tu progreso está guardado.', 'Cambiar', go, back);
    } else go();
  };

  /* Alt+Enter / F11 */
  UI.toggleDisplayMode = function () {
    const A = Object.assign({ modo: 'completa', ventW: 1280, ventH: 720, pant: null, vsync: true }, (FF.Host.info && FF.Host.info.ajustes) || {});
    A.modo = A.modo === 'completa' ? 'ventana' : 'completa';
    UI.applyDisplay(A);
  };

  UI.credits = function () {
    const d = el('div', 'dlg parch');
    /* música: autores y temas, sin enlaces (los detalles están en music/LEEME.txt) */
    const by = {};
    FF.Audio.credits().forEach((t) => {
      const who = t.author.replace(/\s*\(.*\)\s*$/, '');
      (by[who] = by[who] || { titles: [], lic: t.license }).titles.push(t.title.replace(/^Medieval:\s*/, ''));
    });
    const music = Object.keys(by).map((who) => '<p class="cr-m"><b>' + who + '</b>' +
      (/^CC BY/.test(by[who].lic) ? ' <small>' + by[who].lic + '</small>' : '') + '<br><span>' + by[who].titles.join(' · ') + '</span></p>').join('');
    const sfx = (FF.Audio.sfxCredits && FF.Audio.sfxCredits()) || [];
    d.innerHTML = '<h2>Créditos</h2><div class="credits">' + FF.crestSVG().replace('class="crest"', 'class="crest" style="width:3.6em;height:3.6em"') +
      '<p class="cr-idea">Idea original<br><b class="title-gold">Fraudy Martinez</b></p>' +
      '<p>Hecho íntegramente en HTML5.<br>Los gráficos y buena parte de los sonidos se generan por código.</p>' +
      (music ? '<h3>Música</h3>' + music : '') +
      (sfx.length ? '<h3>Sonidos de batalla</h3><p class="cr-m"><span>' + sfx.join(' · ') + '</span></p>' : '') +
      '<p class="cr-ver">Feudo a Feudo · versión ' + FF.VERSION + '</p></div>';
    const acts = el('div', 'acts');
    acts.appendChild(btn('Cerrar', '', () => UI.closeModal()));
    d.appendChild(acts);
    UI.openModal(d, () => UI.closeModal());
  };

  /* ======================= BATALLA RÁPIDA ======================= */
  UI.skirmish = function () {
    const S = FF.Save.data;
    const cfg = S.skirmish || (S.skirmish = { biome: 'valle', size: 'mediano', enemies: 2, mode: 1 });
    const d = el('div', 'dlg parch wide');
    d.innerHTML = '<h2>' + FF.icon('dice') + ' Batalla rápida</h2><div style="text-align:center;font-size:.9em">Un mapa nuevo generado al azar cada vez, con todos los edificios y reliquias.</div>';
    const row = (title) => { const r = el('div', 'sk-row', '<h3>' + title + '</h3>'); d.appendChild(r); return r; };
    const rb = row('Tierra');
    const bg = el('div', 'biomes');
    const bnames = { valle: 'Valle', islas: 'Islas', desierto: 'Desierto', hielo: 'Hielo', volcan: 'Volcán' };
    Object.keys(bnames).forEach((k) => {
      const b = el('button', 'biome' + (cfg.biome === k ? ' on' : ''));
      const c = el('canvas'); b.appendChild(c); b.appendChild(el('span', '', bnames[k]));
      b.addEventListener('click', () => { FF.Audio.play('select'); cfg.biome = k; bg.querySelectorAll('.biome').forEach((x) => x.classList.toggle('on', x === b)); });
      bg.appendChild(b);
      requestAnimationFrame(() => {
        const img = FF.Terrain.scene(k, 31 + k.length, 320, 240, 1, null);
        c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
      });
    });
    rb.appendChild(bg);
    const seg = (title, opts, key) => {
      const r = row(title);
      const sg = el('div', 'seg');
      opts.forEach((op) => {
        const b = el('button', cfg[key] === op[0] ? 'on' : '', op[1]);
        b.addEventListener('click', () => { FF.Audio.play('select'); cfg[key] = op[0]; sg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); });
        sg.appendChild(b);
      });
      r.appendChild(sg);
    };
    seg('Tamaño del mapa', [['pequeno', 'Pequeño'], ['mediano', 'Mediano'], ['grande', 'Grande']], 'size');
    seg('Rivales', [[1, '1 señor'], [2, '2 señores'], [3, '3 señores']], 'enemies');
    seg('Dificultad', [[0, 'Escudero'], [1, 'Caballero'], [2, 'Señor de la Guerra']], 'mode');
    const acts = el('div', 'acts');
    acts.appendChild(btn('Volver', 'wood', () => UI.closeModal()));
    acts.appendChild(btn(FF.icon('swords') + ' ¡Generar y jugar!', '', () => {
      FF.Save.save();
      let lvl;
      try { lvl = FF.MapGen.skirmish({ biome: cfg.biome, size: cfg.size, enemies: cfg.enemies }); }
      catch (e) { UI.toast('No se pudo generar el mapa, inténtalo otra vez'); return; }
      lvl.medal = [lvl.nodes.length * 14, lvl.nodes.length * 13, lvl.nodes.length * 12];
      UI.closeModal();
      app.startLevel(lvl, cfg.mode);
    }));
    d.appendChild(acts);
    UI.openModal(d, () => UI.closeModal());
  };

  /* ======================= AVISOS ======================= */
  UI.toast = function (html, cls, dur) {
    const t = el('div', 'toast woodbar ' + (cls || ''), html);
    toasts.appendChild(t);
    while (toasts.children.length > 4) toasts.removeChild(toasts.firstChild);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 450); }, dur || 2600);
  };
  UI.achToast = function (a) {
    FF.Audio.play('achievement');
    UI.toast('<div class="ic">' + FF.icon(a.icon) + '</div><div><small>Logro desbloqueado</small><br>' + a.name + '</div>', 'ach', 3800);
  };

  /* ======================= HUD ======================= */
  UI.showHUD = function (game) {
    hud.innerHTML = '';
    hud.classList.remove('hidden');
    const tl = el('div', 'hud-tl');
    tl.appendChild(btn(FF.icon('pause'), 'wood icon', () => app.openPause()));
    tl.appendChild(el('div', 'hud-name woodbar', game.level.name + ' · <small>' + game.mode.name + '</small>'));
    hud.appendChild(tl);
    const tc = el('div', 'hud-tc woodbar', '<span class="time">00:00</span><span class="goal">' + FF.icon('star') + '<span></span></span>');
    hud.appendChild(tc);
    const tr = el('div', 'hud-tr');
    const pw = el('div', 'power');
    game.factions.forEach((f) => { const i = el('i'); i.style.background = FF.FACTIONS[f].color; i.dataset.f = f; pw.appendChild(i); });
    tr.appendChild(pw);
    const sp = btn(FF.icon('fast'), 'wood icon', () => app.toggleSpeed());
    sp.title = 'Velocidad (F)';
    tr.appendChild(sp);
    const sa = btn(FF.icon('swords'), 'wood icon', () => app.input.selectAll());
    sa.title = 'Seleccionar todos (A)';
    tr.appendChild(sa);
    hud.appendChild(tr);
    const bc = el('div', 'hud-bc');
    if (game.spells.length) {
      if (game.magic) {
        const bar = el('div', 'spells woodbar');
        game.spells.forEach((k, i) => {
          const b = el('button', 'spell ' + k, FF.icon(k) + '<span class="c">' + FF.SPELLS[k].cost + '</span><span class="k">' + (i + 1) + '</span>');
          b.title = FF.SPELLS[k].name + ' — ' + FF.SPELLS[k].desc;
          b.dataset.k = k;
          b.addEventListener('pointerdown', (e) => e.stopPropagation());
          b.addEventListener('click', (e) => { e.stopPropagation(); app.input.toggleSpell(k); });
          bar.appendChild(b);
        });
        bc.appendChild(bar);
        bc.appendChild(el('div', 'mana', '<i></i>'));
      } else {
        bc.appendChild(el('div', 'nomagic woodbar', 'Magia prohibida en modo Señor de la Guerra'));
      }
    }
    hud.appendChild(bc);
    const info = el('div', 'info parch hidden');
    hud.appendChild(info);
    UI.hudRefs = { time: tc.querySelector('.time'), goal: tc.querySelector('.goal'), goalT: tc.querySelector('.goal span'), power: pw, speed: sp, spells: bc.querySelectorAll('.spell'), mana: bc.querySelector('.mana i'), info, infoT: 0, powT: 0 };
    hud.querySelectorAll('button').forEach((b) => b.addEventListener('pointerdown', (e) => e.stopPropagation()));
  };
  UI.hideHUD = function () { if (hud) { hud.classList.add('hidden'); hud.innerHTML = ''; } UI.hudRefs = null; };

  /* escribir en el DOM sólo cuando cambia el valor (evita recalcular estilos en cada fotograma) */
  const setHTML = (e, v) => { if (e._h !== v) { e._h = v; e.innerHTML = v; } };
  const setTxt = (e, v) => { if (e._v !== v) { e._v = v; e.textContent = v; } };
  const setW = (e, v) => { v = v.toFixed(1) + '%'; if (e._w !== v) { e._w = v; e.style.width = v; } };
  const setCls = (e, c, on) => { const k = '_c' + c; if (e[k] !== on) { e[k] = on; e.classList.toggle(c, on); } };
  UI.updateHUD = function (dt) {
    const R = UI.hudRefs, g = app.game;
    if (!R || !g) return;
    setTxt(R.time, U.fmtTime(g.time));
    const medT = g.level.medal ? g.level.medal[g.modeIndex] : 0;
    setTxt(R.goalT, U.fmtTime(medT));
    setCls(R.goal, 'lost', g.time > medT);
    setCls(R.speed, 'on', app.speed > 1);
    const sf = app.speed > 1 ? 'brightness(1.4)' : '';
    if (R.speed._f !== sf) { R.speed._f = sf; R.speed.style.filter = sf; }
    R.powT -= dt;
    if (R.powT <= 0) {
      R.powT = 0.3;
      const p = g.power();
      let tot = 0; Object.keys(p).forEach((k) => { tot += p[k]; });
      Array.from(R.power.children).forEach((i) => setW(i, tot ? (p[i.dataset.f] || 0) / tot * 100 : 0));
    }
    if (R.mana) {
      setW(R.mana, g.mana / FF.MANA.max * 100);
      R.spells.forEach((b) => {
        const k = b.dataset.k;
        setCls(b, 'off', !g.canCast(k));
        setCls(b, 'on', app.input.targeting === k);
      });
    }
    R.infoT -= dt;
    if (R.infoT <= 0) { R.infoT = 0.15; UI.updateInfo(); }
  };

  UI.updateInfo = function () {
    const R = UI.hudRefs, g = app.game, inp = app.input;
    if (!R || !g) return;
    let id = null;
    if (inp.selected.size === 1) id = inp.selected.values().next().value;
    else if (inp.inspect != null) id = inp.inspect;
    if (inp.selected.size > 1) {
      let tot = 0; inp.selected.forEach((i) => { tot += Math.floor(g.buildings[i].troops / 2); });
      R.info.classList.remove('hidden');
      setHTML(R.info, '<h3>' + inp.selected.size + ' edificios</h3><div class="ln"><span>Enviarán</span><b>' + tot + ' tropas</b></div><div class="tip">Toca un enemigo para atacar con todos. Doble toque en uno tuyo para reforzarlo. Toca el suelo para soltar.</div>');
      return;
    }
    if (id == null) { R.info.classList.add('hidden'); return; }
    const b = g.buildings[id];
    const D = FF.BUILD[b.type], st = b.stat, F = FF.FACTIONS[b.owner];
    let h = '<h3>' + D.name + ' <small>' + (b.level > 1 ? '★'.repeat(b.level - 1) : 'Sin mejoras') + ' · ' + (b.level - 1) + '/' + (b.maxLevel - 1) + '</small></h3>';
    h += '<div class="ln"><span style="color:' + (b.owner ? F.dark : '#5d584e') + ';font-weight:bold">' + F.name + '</span><b>' + Math.floor(b.troops) + ' / ' + st.cap + '</b></div>';
    if (st.prod) h += '<div class="ln"><span>Producción</span><b>' + st.prod.toFixed(2) + '/s</b></div>';
    if (st.rate) h += '<div class="ln"><span>Lanzas</span><b>' + st.rate + '/s' + (st.dmg > 1 ? ' · perforantes' : '') + '</b></div><div class="ln"><span>Alcance</span><b>' + st.range + '</b></div>';
    h += '<div class="ln"><span>Envía</span><b>' + FF.UNITS[D.unit].plural + '</b></div>';
    const dd = D.def;
    if (dd.soldado !== 1 || dd.jinete !== 1) h += '<div class="ln"><span>Defensa</span><b>×' + dd.soldado + ' inf. · ×' + dd.jinete + ' jin.</b></div>';
    if (b.owner === g.player) {
      if (b.level < b.maxLevel) {
        const nx = FF.bstat(b.type, b.level + 1);
        h += '<div class="ln"><span>Mejorar (' + b.upCost + ')</span><b>' + nx.cap + (nx.prod ? ' · ' + nx.prod.toFixed(2) + '/s' : '') + '</b></div>';
      }
      h += '<div class="tip">' + (inp.selected.has(b.id) ? 'Toca un enemigo para enviar la mitad (' + Math.floor(b.troops / 2) + '). Toca más edificios tuyos para sumarlos; doble toque en uno tuyo para reforzarlo.' : 'Tócalo para seleccionarlo.') + '</div>';
    } else h += '<div class="tip">' + D.desc + '</div>';
    if (b.shieldUntil > g.time) h += '<div class="tip">Protegido por la Égida.</div>';
    if (b.sleepUntil > g.time) h += '<div class="tip">Dormido por el Sopor.</div>';
    setHTML(R.info, h);
    R.info.classList.remove('hidden');
  };
})(globalThis.FF = globalThis.FF || {});
