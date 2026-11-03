/* Feudo a Feudo — pintado del terreno de cada mapa (se genera una vez por nivel) */
(function (FF) {
  'use strict';
  const U = FF.U, A = FF.Art, Terra = FF.Terra;
  const W = 1280, H = 720;

  /* paletas vivas, de colores limpios y luminosos */
  const BIOMES = FF.BIOMES = {
    valle: {
      ground: ['#4fb636', '#66c845', '#8cdc5c'], grain: ['#3c9a28', '#bdf08a'], patch: '#45a82f',
      road: ['#b8824a', '#e8b46c', '#ffe3a6'], water: ['#1784e6', '#2eaaf7', '#bdeeff'], bank: '#a87a40',
      leaf: ['#3fb83a', '#24892c', '#96ec66'], grass: '#349c2a', rock: '#bbb5aa',
      deco: { roble: 26, pino: 5, arbusto: 14, flores: 18, hierba: 24, roca: 6, tocon: 3 }, forest: 0.655,
      ambient: 'hojas', amb: '#e4ff8a'
    },
    islas: {
      ground: ['#56c23c', '#6cd24d', '#97e66a'], grain: ['#43a330', '#c6f290'], patch: '#4cb238',
      road: ['#c7925a', '#efc27e', '#fff1c8'], sea: ['#0671cc', '#0ea3ea', '#4ddcf5'], sand: '#ffe9a6',
      leaf: ['#43c23c', '#26902f', '#9cf06c'], grass: '#37a52d', rock: '#c0baae',
      deco: { palmera: 22, arbusto: 16, flores: 12, hierba: 20, roca: 6, roble: 6 }, forest: 0.7,
      ambient: 'gaviotas', amb: '#ffffff'
    },
    desierto: {
      ground: ['#efb24e', '#f6c76a', '#ffdb94'], grain: ['#dc963e', '#fff2c6'], patch: '#e8a44a',
      road: ['#bf773a', '#e6a45a', '#ffd99c'], chasm: '#2a1408', rim: ['#c8864a', '#f4c886'], water: ['#0b9fdc', '#22c4f0', '#b4f4ff'], bank: '#c99052',
      leaf: ['#4cc23a', '#2a9035', '#96ec5e'], grass: '#c99a46', rock: '#ddac78',
      deco: { cactus: 16, matojo: 18, roca: 12, duna: 22, hueso: 3, palmera: 3 }, forest: 0.8,
      ambient: 'arena', amb: '#fff3c8'
    },
    hielo: {
      ground: ['#d6ecff', '#e8f5ff', '#ffffff'], grain: ['#a9d2f6', '#ffffff'], patch: '#c8e4fc',
      road: ['#88b2da', '#b2d2f0', '#e8f4ff'], chasm: '#0a1c32', rim: ['#94c2ea', '#eef8ff'], ice: ['#62c6ff', '#a2e0ff', '#effaff'],
      leaf: ['#25b07c', '#167c56', '#6ae8b0'], pine: '#16966a', grass: '#90b8dc', rock: '#90a6c0', snow: true,
      deco: { pino: 30, roca: 12, cristal: 8, muneco: 1, hierba: 4 }, forest: 0.62,
      ambient: 'nieve', amb: '#ffffff'
    },
    volcan: {
      ground: ['#47303d', '#583f4d', '#6d5260'], grain: ['#2c1a26', '#8e6e7e'], patch: '#3c2835',
      road: ['#664636', '#8e6650', '#b88e6e'], lava: ['#c81a00', '#ff6200', '#ffc31a', '#fff7a8'], crust: '#2a1218', chasm: '#0e0608', rim: ['#3c2830', '#7c5a64'],
      leaf: ['#7c5a4a', '#4c3a2e', '#9c7a6a'], grass: '#6c5058', rock: '#6c5662', crystal: '#ff8a2a',
      deco: { basalto: 16, roca: 14, arbolMuerto: 12, cristal: 6, fumarola: 7, charco: 3, hueso: 2 }, forest: 0.75,
      ambient: 'brasas', amb: '#ffb84a'
    }
  };

  function smoothPath(ctx, P) {
    ctx.beginPath();
    ctx.moveTo(P[0].x, P[0].y);
    for (let i = 1; i < P.length - 1; i++) {
      const mx = (P[i].x + P[i + 1].x) / 2, my = (P[i].y + P[i + 1].y) / 2;
      ctx.quadraticCurveTo(P[i].x, P[i].y, mx, my);
    }
    ctx.lineTo(P[P.length - 1].x, P[P.length - 1].y);
  }
  function strokePath(ctx, P, w, col, alpha) {
    smoothPath(ctx, P);
    ctx.lineWidth = w; ctx.strokeStyle = col; ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); ctx.globalAlpha = 1;
  }
  /* la misma línea desplazada a un lado */
  function offsetPts(P, o) {
    return P.map((q, i) => {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      return { x: q.x - (dy / l) * o, y: q.y + (dx / l) * o };
    });
  }
  function islandPath(ctx, isl, pad) {
    ctx.moveTo(isl.x + Terra.islandR(isl, 0) + pad, isl.y);
    for (let i = 1; i <= 64; i++) {
      const a = (i / 64) * U.TAU;
      const r = Terra.islandR(isl, a) + pad;
      ctx.lineTo(isl.x + Math.cos(a) * r, isl.y + Math.sin(a) * r);
    }
    ctx.closePath();
  }

  /* textura de grano repetible */
  function grainTile(B, seed) {
    const s = 160, c = A.canvas(s, s, 1), ctx = c.getContext('2d');
    const rng = U.rng(seed);
    for (let i = 0; i < 1100; i++) {
      ctx.fillStyle = rng.pick(B.grain);
      ctx.globalAlpha = rng.range(0.05, 0.2);
      const r = rng.range(0.5, 1.5);
      ctx.fillRect(rng.range(0, s), rng.range(0, s), r, r);
    }
    return c;
  }

  /* suelo base (variación grande + grano + detalles del bioma) */
  function drawGround(ctx, B, biome, seed, rng, E) {
    E = E || NOEXT;
    const noise = U.makeNoise(seed);
    /* celdas de 10 px ancladas al mapa: el centro sale igual con o sin márgenes */
    const gx0 = Math.floor((-E.x - 10) / 10), gy0 = Math.floor((-E.y - 10) / 10);
    const lw = Math.ceil((W + E.x + 10) / 10) - gx0 + 1, lh = Math.ceil((H + E.y + 10) / 10) - gy0 + 1;
    const lo = A.canvas(lw, lh, 1), lctx = lo.getContext('2d');
    const img = lctx.createImageData(lw, lh);
    const c0 = U.hexToRgb(B.ground[0]), c1 = U.hexToRgb(B.ground[1]), c2 = U.hexToRgb(B.ground[2]);
    for (let yy = 0; yy < lh; yy++) for (let xx = 0; xx < lw; xx++) {
      const x = xx + gx0, y = yy + gy0;
      const n = noise.fbm(x / 22, y / 22, 4);
      const m = noise.fbm(x / 9 + 50, y / 9 + 50, 2);
      let r, g, b;
      if (n < 0.5) { const t = U.smooth(U.clamp(n / 0.5, 0, 1)); r = c0[0] + (c1[0] - c0[0]) * t; g = c0[1] + (c1[1] - c0[1]) * t; b = c0[2] + (c1[2] - c0[2]) * t; }
      else { const t = U.smooth(U.clamp((n - 0.5) / 0.5, 0, 1)); r = c1[0] + (c2[0] - c1[0]) * t; g = c1[1] + (c2[1] - c1[1]) * t; b = c1[2] + (c2[2] - c1[2]) * t; }
      const k = (m - 0.5) * 18;
      const i = (yy * lw + xx) * 4;
      img.data[i] = r + k; img.data[i + 1] = g + k; img.data[i + 2] = b + k; img.data[i + 3] = 255;
    }
    lctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(lo, gx0 * 10 - 5, gy0 * 10 - 5, lw * 10, lh * 10);
    const pat = ctx.createPattern(grainTile(B, seed + 3), 'repeat');
    ctx.fillStyle = pat; ctx.fillRect(-E.x, -E.y, W + 2 * E.x, H + 2 * E.y);
    const mr = U.rng(seed * 7 + 991), marg = margins(E, mr);
    /* parches suaves */
    /* cada detalle se reparte en el mapa con rng (igual que siempre) y en los márgenes con mr */
    const patch = (R0, x, y) => { const r = R0.range(30, 110); ctx.fillStyle = rg2(ctx, x, y, r, U.rgba(B.patch, 0.22)); ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, R0.range(0, 3), 0, U.TAU); ctx.fill(); };
    for (let i = 0; i < 26; i++) patch(rng, rng.range(0, W), rng.range(0, H));
    marg(26, (x, y) => patch(mr, x, y));
    if (biome === 'valle' || biome === 'islas') {
      const blade = (R0, x, y) => {
        ctx.strokeStyle = R0.chance(0.6) ? U.rgba(B.grain[0], 0.24) : U.rgba(B.grain[1], 0.22);
        ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + R0.range(-1.5, 1.5), y - R0.range(2, 4.5)); ctx.stroke();
      };
      for (let i = 0; i < 1000; i++) blade(rng, rng.range(0, W), rng.range(0, H));
      marg(1000, (x, y) => blade(mr, x, y));
    } else if (biome === 'desierto') {
      const ripple = (R0, x, y) => {
        const len = R0.range(60, 200), amp = R0.range(2, 5);
        ctx.beginPath();
        for (let t = 0; t <= len; t += 6) ctx.lineTo(x + t, y + Math.sin(t / 14) * amp);
        ctx.strokeStyle = R0.chance(0.5) ? 'rgba(160,110,50,0.16)' : 'rgba(255,245,215,0.3)'; ctx.lineWidth = 1.2; ctx.stroke();
      };
      for (let i = 0; i < 70; i++) ripple(rng, rng.range(-50, W), rng.range(0, H));
      marg(70, (x, y) => ripple(mr, x - 80, y));
    } else if (biome === 'hielo') {
      const drift = (R0, x, y) => {
        const r = R0.range(20, 60);
        ctx.fillStyle = 'rgba(150,180,210,0.12)';
        ctx.beginPath(); ctx.ellipse(x, y + r * 0.2, r, r * 0.35, 0, 0, U.TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath(); ctx.ellipse(x - r * 0.1, y, r * 0.9, r * 0.3, 0, 0, U.TAU); ctx.fill();
      };
      for (let i = 0; i < 40; i++) drift(rng, rng.range(0, W), rng.range(0, H));
      marg(40, (x, y) => drift(mr, x, y));
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 0; i < 400; i++) ctx.fillRect(rng.range(0, W), rng.range(0, H), 1, 1);
      marg(400, (x, y) => ctx.fillRect(x, y, 1, 1));
    } else if (biome === 'volcan') {
      const crack = (R0, x, y) => {
        let a = R0.range(0, U.TAU);
        const pts = [{ x, y }];
        for (let k = 0; k < R0.int(5, 12); k++) { a += R0.range(-0.8, 0.8); x += Math.cos(a) * 10; y += Math.sin(a) * 10; pts.push({ x, y }); }
        ctx.save(); ctx.shadowColor = '#ff5a00'; ctx.shadowBlur = 6;
        strokePath(ctx, pts, 2.2, '#140c0c', 0.9);
        strokePath(ctx, pts, 0.9, '#ff7a20', 0.75);
        ctx.restore();
      };
      for (let i = 0; i < 26; i++) crack(rng, rng.range(0, W), rng.range(0, H));
      marg(26, (x, y) => crack(mr, x, y));
      const ash = (R0, x, y) => { const r = R0.range(20, 70); ctx.fillStyle = rg2(ctx, x, y, r, 'rgba(120,110,110,0.18)'); ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, 0, 0, U.TAU); ctx.fill(); };
      for (let i = 0; i < 30; i++) ash(rng, rng.range(0, W), rng.range(0, H));
      marg(30, (x, y) => ash(mr, x, y));
    }
  }

  /* márgenes: lo que se ve fuera del mapa cuando la pantalla es más alargada (o más alta) que él */
  const NOEXT = { x: 0, y: 0 };
  function margins(E, mr) {
    const ar = ((W + 2 * E.x) * (H + 2 * E.y) - W * H) / (W * H);
    return (n, fn) => {
      if (ar <= 0) return;
      for (let i = 0, m = Math.round(n * ar); i < m; i++) {
        let x, y, k = 0;
        do { x = mr.range(-E.x, W + E.x); y = mr.range(-E.y, H + E.y); } while (x >= 0 && x <= W && y >= 0 && y <= H && ++k < 50);
        fn(x, y);
      }
    };
  }
  /* los ríos, la lava y las grietas siguen más allá del borde del mapa */
  function extendPath(P, E) {
    if (!E.x && !E.y) return P;
    const L = Math.max(E.x, E.y) + 80, out = P.slice();
    const ext = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y, l = Math.hypot(dx, dy) || 1; return { x: a.x + dx / l * L, y: a.y + dy / l * L }; };
    out.unshift(ext(P[0], P[1]));
    out.push(ext(P[P.length - 1], P[P.length - 2]));
    return out;
  }
  function rg2(ctx, x, y, r, col) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    return g;
  }

  /* ríos, lava y grietas */
  function drawRiver(ctx, r, B, rng) {
    const P = r.P || r.pts.map((p) => ({ x: p[0], y: p[1] }));
    const w = r.w;
    if (r.kind === 'water') {
      strokePath(ctx, P, w + 14, B.bank || '#6e5c3a', 0.85);
      strokePath(ctx, P, w + 6, U.shade(B.bank || '#6e5c3a', 0.25), 0.9);
      strokePath(ctx, P, w, B.water[0]);
      strokePath(ctx, P, w * 0.72, B.water[1]);
      strokePath(ctx, P, w * 0.28, U.rgba(B.water[2], 0.45));
    } else if (r.kind === 'lava') {
      strokePath(ctx, P, w + 16, B.crust || '#1a1212');
      ctx.save(); ctx.shadowColor = '#ff4a00'; ctx.shadowBlur = 18;
      strokePath(ctx, P, w + 2, B.lava[0]);
      ctx.restore();
      strokePath(ctx, P, w, B.lava[1]);
      strokePath(ctx, P, w * 0.6, B.lava[2]);
      strokePath(ctx, P, w * 0.18, B.lava[3], 0.75);
      for (let i = 0; i < 40; i++) {
        const k = rng.int(1, P.length - 2), p = P[k];
        ctx.fillStyle = 'rgba(40,10,0,0.55)';
        ctx.beginPath(); ctx.ellipse(p.x + rng.range(-w / 3, w / 3), p.y + rng.range(-w / 3, w / 3), rng.range(2, 6), rng.range(1, 3), rng.range(0, 3), 0, U.TAU); ctx.fill();
      }
    } else {
      strokePath(ctx, P, w + 12, B.rim[1]);
      strokePath(ctx, P, w + 5, B.rim[0]);
      strokePath(ctx, P, w, B.chasm);
      /* profundidad: la pared del fondo se ve iluminada y con estratos; la cercana, en sombra;
         abajo, bruma */
      const ice = !!B.snow;
      const sh = (dx, dy) => P.map((q) => ({ x: q.x + dx, y: q.y + dy }));
      const wall = U.shade(B.rim[0], ice ? -0.2 : -0.28);
      strokePath(ctx, sh(w * 0.14, -w * 0.18), w * 0.5, wall, 0.9);
      strokePath(ctx, sh(w * 0.2, -w * 0.25), w * 0.2, U.shade(B.rim[1], ice ? -0.05 : -0.12), 0.55);
      ctx.save(); ctx.setLineDash([7, 5, 3, 6]);
      for (let k = 0; k < 3; k++) strokePath(ctx, sh(w * (0.06 + k * 0.05), -w * (0.06 + k * 0.07)), 0.7, U.shade(wall, -0.35), 0.45);
      ctx.restore();
      strokePath(ctx, sh(-w * 0.1, w * 0.12), w * 0.42, '#000000', 0.62);
      strokePath(ctx, P, w * 0.22, ice ? 'rgba(170,200,235,0.16)' : 'rgba(160,110,60,0.14)');
      /* borde con escarcha o arena clara */
      const edgeL = offsetPts(P, w / 2 + 1.5), edgeR = offsetPts(P, -w / 2 - 1.5);
      strokePath(ctx, edgeL, 1.2, ice ? '#ffffff' : U.shade(B.rim[1], 0.2), 0.75);
      strokePath(ctx, edgeR, 1.2, ice ? '#ffffff' : U.shade(B.rim[1], 0.2), 0.75);
      if (ice) {
        /* carámbanos colgando del borde */
        for (let i = 1; i < P.length - 1; i++) {
          if (!rng.chance(0.55)) continue;
          const q = P[i], r2 = P[i + 1], nx = -(r2.y - q.y), ny = r2.x - q.x, nl = Math.hypot(nx, ny) || 1;
          const side = ny / nl < 0 ? 1 : -1, ex = q.x + (nx / nl) * (w / 2) * side, ey = q.y + (ny / nl) * (w / 2) * side;
          const L = rng.range(3, 7);
          ctx.beginPath(); ctx.moveTo(ex - 1.2, ey); ctx.lineTo(ex + 1.2, ey); ctx.lineTo(ex + rng.range(-0.5, 0.5), ey + L * 0.9); ctx.closePath();
          ctx.fillStyle = 'rgba(225,245,255,0.9)'; ctx.fill();
        }
      }
      for (let i = 0; i < 60; i++) {
        const k = rng.int(1, P.length - 2), p = P[k], q = P[k + 1];
        const nx = -(q.y - p.y), ny = q.x - p.x, nl = Math.hypot(nx, ny) || 1;
        const side = rng.sign(), off = w / 2 + 2;
        const sx = p.x + (nx / nl) * off * side, sy = p.y + (ny / nl) * off * side;
        ctx.strokeStyle = U.rgba(B.rim[0], 0.7); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + (nx / nl) * side * rng.range(3, 9) + rng.range(-3, 3), sy + (ny / nl) * side * rng.range(3, 9)); ctx.stroke();
      }
    }
  }

  function drawLake(ctx, l, B, rng) {
    ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(l.a || 0);
    const e = (rx, ry) => { ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, U.TAU); };
    if (l.kind === 'lava') {
      e(l.rx + 8, l.ry + 8); ctx.fillStyle = B.crust || '#1a1212'; ctx.fill();
      ctx.shadowColor = '#ff4a00'; ctx.shadowBlur = 20;
      e(l.rx, l.ry); ctx.fillStyle = B.lava[1]; ctx.fill();
      ctx.shadowBlur = 0;
      e(l.rx * 0.65, l.ry * 0.6); ctx.fillStyle = B.lava[2]; ctx.fill();
      e(l.rx * 0.25, l.ry * 0.2); ctx.fillStyle = U.rgba(B.lava[3], 0.8); ctx.fill();
    } else if (l.kind === 'ice') {
      e(l.rx + 5, l.ry + 5); ctx.fillStyle = '#b5cfe0'; ctx.fill();
      e(l.rx, l.ry);
      const g = ctx.createLinearGradient(-l.rx, -l.ry, l.rx, l.ry);
      g.addColorStop(0, B.ice[2]); g.addColorStop(0.5, B.ice[1]); g.addColorStop(1, B.ice[0]);
      ctx.fillStyle = g; ctx.fill();
      ctx.save(); e(l.rx, l.ry); ctx.clip();
      for (let i = 0; i < 9; i++) {
        let x = rng.range(-l.rx, l.rx), y = rng.range(-l.ry, l.ry), a = rng.range(0, U.TAU);
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let k = 0; k < 4; k++) { a += rng.range(-0.9, 0.9); x += Math.cos(a) * 9; y += Math.sin(a) * 9; ctx.lineTo(x, y); }
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 0.8; ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath(); ctx.ellipse(-l.rx * 0.3, -l.ry * 0.35, l.rx * 0.45, l.ry * 0.14, -0.2, 0, U.TAU); ctx.fill();
      ctx.restore();
    } else {
      const wc = B.water || ['#2f7fbd', '#3f97d2', '#9bd6f5'];
      e(l.rx + 8, l.ry + 7); ctx.fillStyle = l.kind === 'oasis' ? '#b8915a' : (B.bank || '#6e5c3a'); ctx.fill();
      e(l.rx + 3, l.ry + 3); ctx.fillStyle = l.kind === 'oasis' ? '#6aa04a' : U.shade(B.bank || '#6e5c3a', 0.3); ctx.fill();
      /* agua: somera y clara en la orilla, honda y oscura en el centro */
      e(l.rx, l.ry);
      const dg = ctx.createRadialGradient(0, 0, 0, 0, 0, l.rx);
      dg.addColorStop(0, U.shade(wc[0], -0.18)); dg.addColorStop(0.55, wc[0]); dg.addColorStop(0.82, wc[1]); dg.addColorStop(1, U.shade(wc[2], -0.12));
      ctx.save(); ctx.scale(1, l.ry / l.rx); ctx.beginPath(); ctx.arc(0, 0, l.rx, 0, U.TAU); ctx.fillStyle = dg; ctx.fill(); ctx.restore();
      /* espuma de la orilla */
      e(l.rx - 1.6, l.ry - 1.4); ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.1; ctx.stroke();
      e(l.rx - 0.4, l.ry - 0.3); ctx.strokeStyle = 'rgba(60,40,20,0.35)'; ctx.lineWidth = 0.8; ctx.stroke();
      /* reflejo del cielo */
      ctx.save(); e(l.rx, l.ry); ctx.clip();
      ctx.fillStyle = U.rgba(wc[2], 0.42);
      ctx.beginPath(); ctx.ellipse(-l.rx * 0.25, -l.ry * 0.32, l.rx * 0.42, l.ry * 0.15, -0.1, 0, U.TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 0.9;
      for (let i = 0; i < 4; i++) { const yy = -l.ry * 0.1 + i * l.ry * 0.18, xx = -l.rx * 0.4 + i * l.rx * 0.12; ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + l.rx * 0.32, yy); ctx.stroke(); }
      ctx.restore();
    }
    ctx.restore();
  }

  /* caminos y puentes */
  function drawRoads(ctx, map, B, rng, biome) {
    const roads = map.roads;
    const pass = (w, col, a) => roads.forEach((r) => { strokePath(ctx, r.pts, w, col, a); });
    pass(24, U.shade(B.road[0], -0.15), 0.1);
    pass(19, U.shade(B.road[0], -0.15), 0.12);
    pass(15.5, U.shade(B.road[0], -0.25), 0.5);
    pass(12.5, B.road[0], 1);
    pass(9.5, B.road[1], 1);
    pass(3.5, B.road[2], 0.2);
    /* rodadas de carro a los lados del centro */
    const offset = (P, o) => P.map((q, i) => {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      return { x: q.x - (dy / l) * o, y: q.y + (dx / l) * o };
    });
    roads.forEach((r) => {
      [-2.7, 2.7].forEach((o) => { const P = offset(r.pts, o); strokePath(ctx, P, 1.3, U.shade(B.road[0], -0.35), 0.28); strokePath(ctx, offset(r.pts, o - 0.8), 0.6, B.road[2], 0.18); });
    });
    const p = {};
    roads.forEach((r) => {
      for (let d = 4; d < r.len; d += rng.range(5, 11)) {
        FF.polyAt(r.pts, r.cum, d, p);
        const off = rng.range(-4.5, 4.5);
        const nx = -Math.sin(p.a), ny = Math.cos(p.a);
        ctx.fillStyle = rng.chance(0.5) ? U.rgba(B.road[2], 0.45) : U.rgba(U.shade(B.road[0], -0.3), 0.35);
        ctx.beginPath(); ctx.ellipse(p.x + nx * off, p.y + ny * off, rng.range(0.6, 1.4), rng.range(0.5, 1), p.a, 0, U.TAU); ctx.fill();
      }
      /* el borde del camino se mezcla con el suelo: matas de hierba (o arena, nieve, ceniza) que lo muerden */
      const edge = biome === 'valle' || biome === 'islas' ? B.grass : biome === 'hielo' ? '#ffffff' : biome === 'desierto' ? U.shade(B.ground[0], -0.08) : U.shade(B.ground[1], 0.05);
      for (let d = 3; d < r.len; d += rng.range(4, 8)) {
        FF.polyAt(r.pts, r.cum, d, p);
        const nx = -Math.sin(p.a), ny = Math.cos(p.a), side = rng.sign(), off = side * rng.range(5.6, 7.2);
        const ex = p.x + nx * off, ey = p.y + ny * off;
        if (biome === 'valle' || biome === 'islas') {
          ctx.strokeStyle = U.rgba(edge, 0.85); ctx.lineWidth = 0.8;
          ctx.beginPath();
          for (let k = 0; k < 3; k++) { const bx = ex + rng.range(-1.5, 1.5), by = ey + rng.range(-1, 1); ctx.moveTo(bx, by + 1); ctx.lineTo(bx + rng.range(-1.4, 1.4), by - rng.range(1.5, 3.2)); }
          ctx.stroke();
        } else {
          ctx.fillStyle = U.rgba(edge, 0.7);
          ctx.beginPath(); ctx.ellipse(ex, ey, rng.range(1.2, 2.6), rng.range(0.8, 1.4), p.a, 0, U.TAU); ctx.fill();
        }
      }
      if (biome === 'hielo') {
        for (let d = 6; d < r.len; d += 9) {
          FF.polyAt(r.pts, r.cum, d, p);
          const nx = -Math.sin(p.a), ny = Math.cos(p.a);
          ctx.fillStyle = 'rgba(120,140,160,0.25)';
          ctx.fillRect(p.x + nx * 2.5 - 1, p.y + ny * 2.5 - 1, 2, 2);
          ctx.fillRect(p.x - nx * 2.5 - 1, p.y - ny * 2.5 - 1, 2, 2);
        }
      }
    });
    roads.forEach((r) => r.bridges.forEach((br) => drawBridge(ctx, r, br, rng)));
  }

  function drawBridge(ctx, r, br, rng) {
    const p = {};
    const stone = br.kind === 'lava';
    const rope = br.kind === 'chasm';
    /* sombra proyectada */
    const span = [];
    for (let d = br.d0; d <= br.d1; d += 3) { FF.polyAt(r.pts, r.cum, d, p); span.push({ x: p.x + 2, y: p.y + 6, a: p.a }); }
    if (span.length < 2) return;
    strokePath(ctx, span, 24, 'rgba(0,0,0,0.28)');
    /* tablones */
    for (let d = br.d0; d <= br.d1; d += stone ? 5.5 : 4.2) {
      FF.polyAt(r.pts, r.cum, d, p);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
      ctx.fillStyle = stone ? (rng.chance(0.5) ? '#857c76' : '#6f6762') : (rng.chance(0.5) ? '#a8733f' : '#93622f');
      ctx.fillRect(-1.9, -11, stone ? 5 : 3.6, 22);
      ctx.strokeStyle = stone ? 'rgba(30,25,22,0.7)' : 'rgba(60,35,15,0.75)'; ctx.lineWidth = 0.6;
      ctx.strokeRect(-1.9, -11, stone ? 5 : 3.6, 22);
      ctx.restore();
    }
    /* barandillas */
    [-1, 1].forEach((side) => {
      const rail = [];
      for (let d = br.d0; d <= br.d1; d += 3) {
        FF.polyAt(r.pts, r.cum, d, p);
        rail.push({ x: p.x - Math.sin(p.a) * 11.5 * side, y: p.y + Math.cos(p.a) * 11.5 * side - (side < 0 ? 1.5 : 0) });
      }
      if (stone) { strokePath(ctx, rail, 4.5, '#4f4844'); strokePath(ctx, rail, 2.5, '#9a918a'); }
      else if (rope) { strokePath(ctx, rail, 1.6, '#d6b57e'); }
      else { strokePath(ctx, rail, 2.6, '#5a3a1e'); strokePath(ctx, rail, 1.2, '#b58350'); }
      for (let d = br.d0; d <= br.d1 + 0.1; d += stone ? 14 : 11) {
        FF.polyAt(r.pts, r.cum, Math.min(d, br.d1), p);
        const x = p.x - Math.sin(p.a) * 11.5 * side, y = p.y + Math.cos(p.a) * 11.5 * side;
        ctx.fillStyle = stone ? '#5d5550' : '#4a2f18';
        ctx.fillRect(x - 1.6, y - 4, 3.2, 5);
      }
    });
  }

  /* decorados repartidos evitando caminos y edificios */
  function decorate(ctx, level, map, B, rng, biome, out, sway, E, xr) {
    E = E || NOEXT;
    const t = map.terrain;
    const noise = U.makeNoise(level.seed + 91);
    const items = [];
    const weights = Object.keys(B.deco).map((k) => [k, B.deco[k]]);
    const tot = weights.reduce((s, w) => s + w[1], 0);
    const pickKind = (r) => { let x = r * tot; for (const w of weights) { x -= w[1]; if (x <= 0) return w[0]; } return weights[0][0]; };
    const nearRoad = (x, y, d) => map.roads.some((r) => {
      const a = r.pts[0], b = r.pts[r.pts.length - 1];
      const minx = Math.min(a.x, b.x) - 60, maxx = Math.max(a.x, b.x) + 60, miny = Math.min(a.y, b.y) - 60, maxy = Math.max(a.y, b.y) + 60;
      if (x < minx || x > maxx || y < miny || y > maxy) return false;
      return U.distPointPoly(x, y, r.pts) < d;
    });
    const nearNode = (x, y, d) => map.nodes.some((n) => U.dist2(n.x, n.y, x, y) < d * d);
    const step = 21;
    const rivers = xr || t.rivers;
    const cell = (R0, gx, gy) => {
      const x = gx + R0.range(-step * 0.45, step * 0.45), y = gy + R0.range(-step * 0.45, step * 0.45);
      const kind = Terra.kindAt(t, x, y);
      const dens = noise.fbm(x / 140, y / 140, 3);
      if (kind === 'water') {
        if (biome === 'islas' && R0.chance(0.012)) items.push({ k: R0.chance(0.25) ? 'barca' : 'roca', x, y, s: R0.range(0.8, 1.1), water: true });
        if (biome === 'valle' && t.rivers.length === 0 && R0.chance(0.05)) items.push({ k: 'nenufar', x, y, s: 1, water: true });
        return;
      }
      if (kind !== 'land') return;
      if (rivers.some((r) => U.distPointPoly(x, y, r.P) < r.w / 2 + 12)) return;
      if (t.lakes.some((l) => Math.hypot(x - l.x, y - l.y) < Math.max(l.rx, l.ry) + 10)) return;
      if (nearNode(x, y, 50)) return;
      if (nearRoad(x, y, 15)) return;
      let k;
      if (dens > B.forest) k = (biome === 'hielo') ? 'pino' : (biome === 'volcan' ? 'arbolMuerto' : (biome === 'islas' ? (R0.chance(0.6) ? 'palmera' : 'roble') : (biome === 'desierto' ? 'cactus' : (R0.chance(0.82) ? 'roble' : 'pino'))));
      else if (R0.chance(0.3 + dens * 0.26)) k = pickKind(R0());
      else return;
      const big = k === 'roble' || k === 'pino' || k === 'palmera' || k === 'cactus' || k === 'arbolMuerto' || k === 'basalto';
      if (big && nearRoad(x, y, 22)) return;
      if (big && nearNode(x, y, 58)) return;
      items.push({ k, x, y, s: R0.range(0.8, 1.15) });
    };
    for (let gy = -10; gy < H + 20; gy += step) for (let gx = -10; gx < W + 20; gx += step) cell(rng, gx, gy);
    /* márgenes fuera del mapa (pantallas más alargadas o más altas): otro generador, así el mapa
       sale igual en cualquier pantalla */
    if (E.x || E.y) {
      const mr = U.rng((level.seed || 7) * 31 + 17);
      const k0 = -Math.ceil((E.x + 10) / step), k1 = Math.ceil((W + E.x + 30) / step), j0 = -Math.ceil((E.y + 10) / step), j1 = Math.ceil((H + E.y + 30) / step);
      for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
        const gx = -10 + k * step, gy = -10 + j * step;
        if (gx >= -10 && gx < W + 20 && gy >= -10 && gy < H + 20) continue;
        cell(mr, gx, gy);
      }
    }
    /* palmeras y juncos alrededor de oasis y lagos */
    t.lakes.forEach((l) => {
      if (l.kind === 'oasis' || l.kind === 'water') {
        for (let i = 0; i < 7; i++) {
          const a = rng.range(0, U.TAU), rr = Math.max(l.rx, l.ry) + rng.range(10, 26);
          const x = l.x + Math.cos(a) * rr, y = l.y + Math.sin(a) * rr * 0.7;
          if (nearRoad(x, y, 18) || nearNode(x, y, 52)) continue;
          items.push({ k: l.kind === 'oasis' ? (i % 2 ? 'palmera' : 'junco') : (i % 2 ? 'junco' : 'arbusto'), x, y, s: rng.range(0.8, 1.05) });
        }
      }
    });
    /* orillas de islas: rocas y caracolas */
    if (biome === 'islas') {
      t.islands.forEach((isl) => {
        for (let i = 0; i < 6; i++) {
          const a = rng.range(0, U.TAU), r = Terra.islandR(isl, a) + 3;
          const x = isl.x + Math.cos(a) * r, y = isl.y + Math.sin(a) * r;
          if (nearRoad(x, y, 14)) continue;
          items.push({ k: rng.chance(0.5) ? 'caracola' : 'roca', x, y, s: rng.range(0.5, 0.8) });
        }
      });
    }
    items.sort((a, b) => a.y - b.y);
    const pal = { leaf: B.leaf, grass: B.grass, rock: B.rock, snow: B.snow, pine: B.pine, crystal: B.crystal, berries: biome === 'valle' };
    items.forEach((it) => {
      if (placeLiving(ctx, it, rng, pal, out, sway)) return;
      A.deco(ctx, it.k, it.x, it.y, it.s, rng, pal);
      if (it.k === 'fumarola') out.vents.push({ x: it.x, y: it.y - 2 });
      if (it.k === 'cristal' && biome === 'volcan') out.glows.push({ x: it.x, y: it.y - 6 });
      if (it.k === 'charco') { out.pools.push({ x: it.x, y: it.y - 1, s: it.s }); out.lava.push({ x: it.x, y: it.y - 1, p: rng.range(0, 6), r: 11 * it.s }); }
    });
  }

  /* árboles, palmeras, juncos y barcas: con animación (calidad media o alta) van en listas aparte
     y los dibuja FF.Life cada fotograma; si no, se pintan aquí quietos. La variante sale igual
     en los dos casos, así el decorado no cambia al cambiar de calidad. */
  function placeLiving(ctx, it, rng, pal, out, sway) {
    const L = FF.Life;
    if (!L) return false;
    if (L.SWAY[it.k]) {
      const v = rng.int(0, L.VARIANTS - 1);
      if (sway) out.sway.push({ k: it.k, x: it.x, y: it.y, s: it.s, v, ph: L.phaseOf(it.x, it.y) });
      else A.deco(ctx, it.k, it.x, it.y, it.s, U.rng(L.seedOf(it.k, v)), pal);
      return true;
    }
    if (it.k === 'barca' && sway) { out.boats.push({ x: it.x, y: it.y, s: it.s, ph: L.phaseOf(it.x, it.y) }); return true; }
    return false;
  }

  /* ---------- render principal ---------- */
  FF.Terrain = {
    /* opts.ext = { x, y }: márgenes que se ven fuera del mapa (pantallas más alargadas o más altas
       que 16:9); el lienzo cubre de -ext a W/H + ext */
    render(level, map, R, opts) {
      const biome = level.biome || 'valle';
      const B = BIOMES[biome];
      const E = (opts && opts.ext) || NOEXT;
      const c = A.canvas(W + 2 * E.x, H + 2 * E.y, R);
      const ctx = c.getContext('2d');
      ctx.scale(R, R);
      ctx.translate(E.x, E.y);
      const rng = U.rng((level.seed || 7) * 13 + 5);
      const t = map.terrain;
      /* ríos, lava y grietas prolongados más allá del borde (sólo para dibujar) */
      const xr = t.rivers.map((r) => { const P0 = r.P || r.pts.map((p) => ({ x: p[0], y: p[1] })); return Object.assign({}, r, { P0, P: extendPath(P0, E) }); });
      const out = {
        canvas: c, shimmer: [], lava: [], vents: [], glows: [], biome, ext: { x: E.x, y: E.y },
        /* para FF.Life */
        terrain: t, lakes: t.lakes, islands: t.islands, sway: [], boats: [], pools: [],
        flows: xr.filter((r) => r.kind === 'water' || r.kind === 'lava').map((r) => ({ kind: r.kind, w: r.w, P: r.P }))
      };
      const sway = !!(opts && opts.sway);
      const mr = U.rng((level.seed || 7) * 5 + 3), marg = margins(E, mr);

      if (t.islands.length) {
        /* mar */
        const g = ctx.createLinearGradient(0, -E.y, 0, H + E.y);
        g.addColorStop(0, B.sea[1]); g.addColorStop(1, B.sea[0]);
        ctx.fillStyle = g; ctx.fillRect(-E.x, -E.y, W + 2 * E.x, H + 2 * E.y);
        const n2 = U.makeNoise(level.seed + 5);
        const swell = (R0, x, y) => {
          ctx.fillStyle = n2(x / 90, y / 90) > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,20,60,0.07)';
          ctx.beginPath(); ctx.ellipse(x, y, R0.range(20, 60), R0.range(6, 16), 0, 0, U.TAU); ctx.fill();
        };
        for (let i = 0; i < 300; i++) swell(rng, rng.range(0, W), rng.range(0, H));
        marg(300, (x, y) => { swell(mr, x, y); if (mr.chance(0.5)) out.shimmer.push({ x, y, p: mr.range(0, 6.28), l: mr.range(6, 16) }); });
        t.islands.forEach((isl) => {
          ctx.beginPath(); islandPath(ctx, isl, 30); ctx.fillStyle = 'rgba(120,220,230,0.35)'; ctx.fill();
          ctx.beginPath(); islandPath(ctx, isl, 17); ctx.fillStyle = 'rgba(160,235,240,0.45)'; ctx.fill();
          ctx.beginPath(); islandPath(ctx, isl, 10); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
          ctx.beginPath(); islandPath(ctx, isl, 7); ctx.fillStyle = B.sand; ctx.fill();
        });
        ctx.save();
        ctx.beginPath(); t.islands.forEach((isl) => islandPath(ctx, isl, 0)); ctx.clip();
        drawGround(ctx, B, biome, level.seed || 7, rng, E);
        ctx.restore();
        t.islands.forEach((isl) => {
          ctx.beginPath(); islandPath(ctx, isl, 0);
          ctx.strokeStyle = 'rgba(120,90,40,0.35)'; ctx.lineWidth = 2; ctx.stroke();
        });
        for (let i = 0; i < 160; i++) {
          const x = rng.range(0, W), y = rng.range(0, H);
          if (Terra.kindAt(t, x, y) === 'water' && !t.islands.some((isl) => Terra.inIsland(isl, x, y, 22))) out.shimmer.push({ x, y, p: rng.range(0, 6.28), l: rng.range(6, 16) });
        }
      } else {
        drawGround(ctx, B, biome, level.seed || 7, rng, E);
      }
      t.lakes.forEach((l) => drawLake(ctx, l, B, rng));
      xr.forEach((r) => {
        drawRiver(ctx, r, B, rng);
        const P = r.P0;   /* los puntos del mapa: el resto del terreno sale igual con o sin márgenes */
        for (let i = 1; i < P.length - 1; i++) {
          if (r.kind === 'water') { if (rng.chance(0.7)) out.shimmer.push({ x: P[i].x + rng.range(-r.w / 4, r.w / 4), y: P[i].y + rng.range(-r.w / 4, r.w / 4), p: rng.range(0, 6.28), l: rng.range(5, 12) }); }
          else if (r.kind === 'lava') out.lava.push({ x: P[i].x, y: P[i].y, p: rng.range(0, 6.28), r: r.w * 0.6 });
        }
      });
      t.lakes.forEach((l) => {
        if (l.kind === 'lava') out.lava.push({ x: l.x, y: l.y, p: rng.range(0, 6), r: l.rx * 0.7 });
        if (l.kind === 'water' || l.kind === 'oasis') for (let i = 0; i < 4; i++) out.shimmer.push({ x: l.x + rng.range(-l.rx * 0.5, l.rx * 0.5), y: l.y + rng.range(-l.ry * 0.4, l.ry * 0.4), p: rng.range(0, 6), l: 6 });
      });
      drawRoads(ctx, map, B, rng, biome);
      /* claros bajo los edificios */
      map.nodes.forEach((n) => {
        ctx.fillStyle = rg2(ctx, n.x, n.y + 2, 44, U.rgba(U.shade(B.road[0], -0.1), 0.35));
        ctx.beginPath(); ctx.ellipse(n.x, n.y + 2, 46, 20, 0, 0, U.TAU); ctx.fill();
      });
      decorate(ctx, level, map, B, rng, biome, out, sway, E, xr);
      /* iluminación y viñeta (sobre toda la pantalla, márgenes incluidos) */
      const X0 = -E.x, Y0 = -E.y, WT = W + 2 * E.x, HT = H + 2 * E.y;
      let g = ctx.createLinearGradient(X0, Y0, X0 + WT, Y0 + HT);
      g.addColorStop(0, biome === 'volcan' ? 'rgba(255,130,40,0.12)' : 'rgba(255,250,215,0.2)');
      g.addColorStop(0.55, 'rgba(0,0,0,0)');
      g.addColorStop(1, biome === 'hielo' ? 'rgba(60,110,190,0.08)' : 'rgba(30,10,0,0.06)');
      ctx.fillStyle = g; ctx.fillRect(X0, Y0, WT, HT);
      g = ctx.createRadialGradient(W / 2, H / 2, HT * 0.55, W / 2, H / 2, Math.max(WT * 0.75, HT * 0.9));
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, biome === 'volcan' ? 'rgba(0,0,0,0.36)' : 'rgba(20,12,4,0.16)');
      ctx.fillStyle = g; ctx.fillRect(X0, Y0, WT, HT);
      A.vivid(c, A.GRADE_TERRAIN);
      return out;
    },

    /* escena decorativa para menús: terreno con un sendero */
    scene(biome, seed, w, h, R, pathPts, opts) {
      const B = BIOMES[biome];
      const c = A.canvas(w, h, R);
      const ctx = c.getContext('2d');
      ctx.scale(R, R);
      const rng = U.rng(seed);
      const sx = w / W, sy = h / H;
      ctx.save(); ctx.scale(sx, sy);
      if (biome === 'islas') {
        const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, B.sea[1]); g.addColorStop(1, B.sea[0]);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        const isl = [{ x: 330, y: 330, r: 260, s: 1 }, { x: 900, y: 380, r: 300, s: 2.4 }, { x: 640, y: 120, r: 140, s: 4 }];
        isl.forEach((i) => { ctx.beginPath(); islandPath(ctx, i, 16); ctx.fillStyle = 'rgba(160,235,240,0.5)'; ctx.fill(); ctx.beginPath(); islandPath(ctx, i, 7); ctx.fillStyle = B.sand; ctx.fill(); });
        ctx.save(); ctx.beginPath(); isl.forEach((i) => islandPath(ctx, i, 0)); ctx.clip();
        drawGround(ctx, B, biome, seed, rng); ctx.restore();
      } else drawGround(ctx, B, biome, seed, rng);
      ctx.restore();
      if (pathPts && pathPts.length > 1) {
        const P = pathPts.map((p) => ({ x: p.x, y: p.y }));
        strokePath(ctx, P, 15, U.shade(B.road[0], -0.25), 0.6);
        strokePath(ctx, P, 11, B.road[1]);
        strokePath(ctx, P, 4, B.road[2], 0.35);
      }
      const pal = { leaf: B.leaf, grass: B.grass, rock: B.rock, snow: B.snow, pine: B.pine, crystal: B.crystal, berries: biome === 'valle' };
      const items = [];
      for (let i = 0; i < Math.round((w * h) / 2600); i++) {
        const x = rng.range(-10, w + 10), y = rng.range(-10, h + 10);
        if (pathPts && pathPts.some((p) => Math.hypot(p.x - x, p.y - y) < 34)) continue;
        const keys = Object.keys(B.deco);
        items.push({ k: rng.chance(0.45) ? ({ valle: 'roble', islas: 'palmera', desierto: 'cactus', hielo: 'pino', volcan: 'basalto' })[biome] : rng.pick(keys), x, y });
      }
      const sway = !!(opts && opts.sway), live = { biome, sway: [], boats: [], pools: [], lava: [] };
      items.sort((a, b) => a.y - b.y).forEach((it) => {
        it.s = rng.range(0.8, 1.1);
        if (!placeLiving(ctx, it, rng, pal, live, sway)) A.deco(ctx, it.k, it.x, it.y, it.s, rng, pal);
      });
      c.life = live;
      const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.5, w / 2, h / 2, w * 0.78);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.22)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      A.vivid(c, A.GRADE_TERRAIN);
      return c;
    }
  };
})(globalThis.FF = globalThis.FF || {});
