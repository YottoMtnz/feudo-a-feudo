/* Feudo a Feudo — generador de mapas (campaña y batalla rápida) */
(function (FF) {
  'use strict';
  const U = FF.U, Terra = FF.Terra;
  const MG = FF.MapGen = {};
  const B = MG.BOUNDS = { x0: 88, x1: 1192, y0: 112, y1: 618 };
  /* zona reservada a la barra de hechizos (abajo, en el centro) */
  MG.hudZone = (x, y) => y > 556 && x > 392 && x < 888;

  /* ---------- muestreo "mejor candidato" ---------- */
  function sample(rng, n, ok, minD, box, existing) {
    box = box || B;
    const pts = existing ? existing.slice() : [];
    const start = pts.length;
    let fails = 0;
    while (pts.length - start < n && fails < 400) {
      let best = null, bestD = -1;
      for (let c = 0; c < 30; c++) {
        const x = rng.range(box.x0, box.x1), y = rng.range(box.y0, box.y1);
        if (!ok(x, y)) continue;
        let dmin = 1e9;
        for (let i = 0; i < pts.length; i++) { const d = Math.hypot(pts[i].x - x, pts[i].y - y); if (d < dmin) dmin = d; }
        if (dmin > bestD) { bestD = dmin; best = { x, y }; }
      }
      if (best && bestD >= minD) pts.push(best); else fails++;
    }
    return pts.slice(start);
  }

  function segBlocked(terrain, ax, ay, bx, by) {
    const L = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(4, Math.ceil(L / 8));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (Terra.isBarrier(Terra.kindAt(terrain, ax + (bx - ax) * t, ay + (by - ay) * t))) return true;
    }
    return false;
  }

  /* ---------- grafo de vecindad relativa + Gabriel ---------- */
  function proximity(pts, maxLen) {
    const n = pts.length, rngE = [], gab = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = pts[i], b = pts[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > maxLen) continue;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, r2 = (d / 2) * (d / 2);
      let isR = true, isG = true;
      for (let k = 0; k < n && (isR || isG); k++) {
        if (k === i || k === j) continue;
        const c = pts[k];
        const dak = Math.hypot(a.x - c.x, a.y - c.y), dbk = Math.hypot(b.x - c.x, b.y - c.y);
        if (Math.max(dak, dbk) < d) isR = false;
        if (U.dist2(c.x, c.y, mx, my) < r2) isG = false;
      }
      if (isR) rngE.push([i, j, d]); else if (isG) gab.push([i, j, d]);
    }
    return { rngE, gab };
  }

  function crossesAny(pts, edges, i, j) {
    const a = pts[i], b = pts[j];
    for (const e of edges) {
      if (e[0] === i || e[1] === i || e[0] === j || e[1] === j) continue;
      const c = pts[e[0]], d = pts[e[1]];
      if (U.segCross(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y)) return true;
    }
    return false;
  }

  function clearance(pts, i, j, minC) {
    const a = pts[i], b = pts[j];
    for (let k = 0; k < pts.length; k++) {
      if (k === i || k === j) continue;
      if (U.distPointSeg(pts[k].x, pts[k].y, a.x, a.y, b.x, b.y) < minC) return false;
    }
    return true;
  }

  function components(n, edges) {
    const p = Array.from({ length: n }, (_, i) => i);
    const find = (x) => { while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; };
    edges.forEach((e) => { p[find(e[0])] = find(e[1]); });
    return { find, count: new Set(p.map((_, i) => find(i))).size };
  }

  function connected(n, edges) { return components(n, edges).count === 1; }

  function angleCleanup(pts, edges, minAng) {
    let changed = true, guard = 0;
    while (changed && guard++ < 60) {
      changed = false;
      for (let v = 0; v < pts.length && !changed; v++) {
        const inc = edges.map((e, idx) => ({ e, idx })).filter((o) => o.e[0] === v || o.e[1] === v)
          .map((o) => {
            const w = o.e[0] === v ? o.e[1] : o.e[0];
            return { idx: o.idx, ang: Math.atan2(pts[w].y - pts[v].y, pts[w].x - pts[v].x), len: o.e[2] };
          }).sort((a, b) => a.ang - b.ang);
        if (inc.length < 2) continue;
        for (let k = 0; k < inc.length; k++) {
          const a = inc[k], b = inc[(k + 1) % inc.length];
          let d = b.ang - a.ang; if (d < 0) d += Math.PI * 2;
          if (inc.length === 2 && k === 1) break;
          if (d < minAng) {
            const rem = a.len > b.len ? a : b;
            const trial = edges.filter((_, idx) => idx !== rem.idx);
            if (connected(pts.length, trial)) { edges.splice(rem.idx, 1); changed = true; break; }
          }
        }
      }
    }
    return edges;
  }

  function allPairs(n, edges) {
    const D = [];
    for (let i = 0; i < n; i++) { D.push(new Array(n).fill(Infinity)); D[i][i] = 0; }
    edges.forEach((e) => { D[e[0]][e[1]] = Math.min(D[e[0]][e[1]], e[2]); D[e[1]][e[0]] = D[e[0]][e[1]]; });
    for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) {
      const dik = D[i][k]; if (dik === Infinity) continue;
      for (let j = 0; j < n; j++) { const v = dik + D[k][j]; if (v < D[i][j]) D[i][j] = v; }
    }
    return D;
  }

  function hopsFrom(n, edges, s) {
    const adj = Array.from({ length: n }, () => []);
    edges.forEach((e) => { adj[e[0]].push(e[1]); adj[e[1]].push(e[0]); });
    const d = new Array(n).fill(Infinity); d[s] = 0;
    const q = [s];
    while (q.length) { const u = q.shift(); adj[u].forEach((w) => { if (d[w] === Infinity) { d[w] = d[u] + 1; q.push(w); } }); }
    return d;
  }

  /* ---------- ríos / grietas / lava ---------- */
  function makeRiver(rng, kind, orient, offset) {
    const pts = [];
    const amp = rng.range(28, 62), freq = rng.range(1.2, 2.6), ph = rng.range(0, 6.28);
    const w = kind === 'water' ? rng.range(46, 56) : kind === 'lava' ? rng.range(40, 50) : rng.range(34, 42);
    if (orient === 'v') {
      const x0 = (offset != null ? offset : rng.range(520, 760)), x1 = x0 + rng.range(-150, 150);
      for (let i = 0; i <= 30; i++) {
        const t = i / 30;
        pts.push([Math.round(U.lerp(x0, x1, t) + Math.sin(t * freq * Math.PI + ph) * amp), Math.round(-40 + t * 800)]);
      }
    } else {
      const y0 = (offset != null ? offset : rng.range(300, 430)), y1 = y0 + rng.range(-110, 110);
      for (let i = 0; i <= 36; i++) {
        const t = i / 36;
        pts.push([Math.round(-40 + t * 1360), Math.round(U.lerp(y0, y1, t) + Math.sin(t * freq * Math.PI + ph) * amp * 0.8)]);
      }
    }
    return { pts, w: Math.round(w), kind };
  }

  /* ---------- colocación según disposición ---------- */
  function layoutScatter(rng, spec, terrain) {
    const n = spec.nodes;
    const area = (B.x1 - B.x0) * (B.y1 - B.y0);
    const minD = U.clamp(Math.sqrt(area / n) * 0.74, 84, 150);
    const ok = (x, y) => {
      if (MG.hudZone(x, y)) return false;
      if (Terra.kindAt(terrain, x, y) !== 'land') return false;
      for (const r of terrain.rivers) if (U.distPointPoly(x, y, r.P) < r.w / 2 + 40) return false;
      return true;
    };
    let pts = sample(rng, n, ok, minD);
    if (pts.length < n) pts = pts.concat(sample(rng, n - pts.length, ok, minD * 0.82, B, pts));
    return pts;
  }

  function layoutIslands(rng, spec, terrain) {
    const k = spec.islands || 5;
    const centers = sample(rng, k, () => true, 205, { x0: B.x0 + 40, x1: B.x1 - 40, y0: B.y0 + 30, y1: B.y1 - 20 });
    const radii = centers.map(() => rng.range(88, 128));
    const total = radii.reduce((s, r) => s + r * r, 0);
    const pts = [];
    centers.forEach((c, ci) => {
      let cnt = Math.max(2, Math.round((spec.nodes * radii[ci] * radii[ci]) / total));
      const box = { x0: c.x - radii[ci], x1: c.x + radii[ci], y0: c.y - radii[ci], y1: c.y + radii[ci] };
      const ok = (x, y) => Math.hypot(x - c.x, y - c.y) < radii[ci] - 30 && x > B.x0 && x < B.x1 && y > B.y0 && y < B.y1 && !MG.hudZone(x, y);
      const got = sample(rng, cnt, ok, 82, box, pts);
      got.forEach((p) => { p.isl = ci; pts.push(p); });
    });
    centers.forEach((c, ci) => {
      let far = 0;
      pts.forEach((p) => { if (p.isl === ci) far = Math.max(far, Math.hypot(p.x - c.x, p.y - c.y)); });
      terrain.islands.push({ x: Math.round(c.x), y: Math.round(c.y), r: Math.round(Math.max(radii[ci], far + 46)), s: Math.round(rng.range(0, 60)) / 10 });
    });
    return pts;
  }

  function layoutRing(rng, spec) {
    const pts = [];
    const n1 = spec.ringOuter || 10, n2 = spec.ringInner || 5;
    const off = rng.range(0, Math.PI * 2);
    for (let i = 0; i < n1; i++) {
      const a = off + (i / n1) * Math.PI * 2;
      pts.push({ x: 640 + Math.cos(a) * 470, y: 348 + Math.sin(a) * 194, ring: 1 });
    }
    for (let i = 0; i < n2; i++) {
      const a = off + Math.PI / n2 + (i / n2) * Math.PI * 2;
      pts.push({ x: 640 + Math.cos(a) * 235, y: 348 + Math.sin(a) * 100, ring: 2 });
    }
    pts.push({ x: 640, y: 348, ring: 3 });
    pts.forEach((p) => { p.x += rng.range(-12, 12); p.y += rng.range(-8, 8); });
    return pts;
  }

  /* ---------- generación principal ---------- */
  MG.generate = function (spec) {
    for (let attempt = 0; attempt < 80; attempt++) {
      const lvl = tryGenerate(spec, (spec.seed + attempt * 7777) >>> 0);
      if (lvl) { lvl.attempts = attempt; return lvl; }
    }
    throw new Error('No se pudo generar el mapa ' + (spec.id || spec.seed));
  };

  function tryGenerate(spec, seed) {
    const rng = U.rng(seed);
    const terrain = Terra.prepare({ islands: [], rivers: [], lakes: [] });
    const layout = spec.layout || 'scatter';
    const kind = spec.barrier || ({ valle: 'water', islas: 'water', desierto: 'chasm', hielo: 'chasm', volcan: 'lava' })[spec.biome];
    if (layout === 'river') terrain.rivers.push(makeRiver(rng, kind, spec.orient || (rng.chance(0.6) ? 'v' : 'h')));
    if (layout === 'cross') {
      terrain.rivers.push(makeRiver(rng, kind, 'v', rng.range(600, 680)));
      terrain.rivers.push(makeRiver(rng, kind, 'h', rng.range(340, 390)));
    }
    Terra.prepare(terrain);

    let pts;
    if (layout === 'islands') pts = layoutIslands(rng, spec, terrain);
    else if (layout === 'ring') pts = layoutRing(rng, spec);
    else pts = layoutScatter(rng, spec, terrain);
    Terra.prepare(terrain);
    const n = pts.length;
    if (n < Math.min(spec.nodes, 6) || n < spec.nodes - 2) return null;

    /* caminos */
    const maxLen = spec.maxLen || 290;
    let edges = [];
    if (layout === 'ring') {
      const outer = pts.map((p, i) => ({ p, i })).filter((o) => o.p.ring === 1).map((o) => o.i);
      const inner = pts.map((p, i) => ({ p, i })).filter((o) => o.p.ring === 2).map((o) => o.i);
      const center = n - 1;
      const add = (a, b) => edges.push([a, b, Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y)]);
      outer.forEach((v, k) => add(v, outer[(k + 1) % outer.length]));
      inner.forEach((v, k) => { add(v, inner[(k + 1) % inner.length]); add(v, center); });
      outer.forEach((v, k) => {
        if (k % (spec.spokeEvery || 2) !== 0) return;
        let best = -1, bd = 1e9;
        inner.forEach((w) => { const d = Math.hypot(pts[v].x - pts[w].x, pts[v].y - pts[w].y); if (d < bd) { bd = d; best = w; } });
        if (!crossesAny(pts, edges, v, best)) add(v, best);
      });
    } else {
      const prox = proximity(pts, maxLen);
      const allC = prox.rngE.concat(prox.gab);
      const crossing = (e) => (layout === 'islands' ? pts[e[0]].isl !== pts[e[1]].isl : segBlocked(terrain, pts[e[0]].x, pts[e[0]].y, pts[e[1]].x, pts[e[1]].y));
      prox.rngE.forEach((e) => { if (!crossing(e)) edges.push(e); });
      prox.gab.forEach((e) => { if (!crossing(e) && rng() < (spec.density != null ? spec.density : 0.35) && !crossesAny(pts, edges, e[0], e[1])) edges.push(e); });
      /* puentes */
      if (layout === 'islands') {
        const k = terrain.islands.length;
        const pairs = [];
        for (let a = 0; a < k; a++) for (let b = a + 1; b < k; b++) {
          let best = null;
          for (let i = 0; i < n; i++) if (pts[i].isl === a) for (let j = 0; j < n; j++) if (pts[j].isl === b) {
            const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
            if (!best || d < best[2]) best = [i, j, d];
          }
          if (best) pairs.push(best);
        }
        pairs.sort((x, y) => x[2] - y[2]);
        const comp = Array.from({ length: k }, (_, i) => i);
        const find = (x) => { while (comp[x] !== x) x = comp[x] = comp[comp[x]]; return x; };
        const extra = [];
        pairs.forEach((e) => {
          const ia = pts[e[0]].isl, ib = pts[e[1]].isl;
          if (find(ia) !== find(ib) && !crossesAny(pts, edges, e[0], e[1])) { comp[find(ia)] = find(ib); edges.push(e); }
          else extra.push(e);
        });
        const extraN = spec.extraBridges != null ? spec.extraBridges : 1;
        let added = 0;
        extra.forEach((e) => { if (added < extraN && e[2] < 330 && !crossesAny(pts, edges, e[0], e[1]) && clearance(pts, e[0], e[1], 42)) { edges.push(e); added++; } });
      } else if (terrain.rivers.length) {
        const cand = allC.filter(crossing).sort((a, b) => a[2] - b[2]);
        const want = spec.bridges || 3;
        const chosen = [];
        cand.forEach((e) => {
          if (chosen.length >= want * terrain.rivers.length) return;
          const mx = (pts[e[0]].x + pts[e[1]].x) / 2, my = (pts[e[0]].y + pts[e[1]].y) / 2;
          if (chosen.some((c) => Math.hypot(c.mx - mx, c.my - my) < 170)) return;
          if (crossesAny(pts, edges, e[0], e[1])) return;
          chosen.push({ e, mx, my }); edges.push(e);
        });
      }
    }

    /* limpieza: holgura respecto a otros nodos */
    edges = edges.filter((e, idx) => {
      if (clearance(pts, e[0], e[1], 40)) return true;
      const trial = edges.filter((x) => x !== e);
      return !connected(n, trial);
    });
    /* conectar componentes sueltos */
    let guard = 0;
    while (!connected(n, edges) && guard++ < 40) {
      const c = components(n, edges);
      let best = null;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        if (c.find(i) === c.find(j)) continue;
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
        if (d > 420 || (best && d >= best[2])) continue;
        if (crossesAny(pts, edges, i, j) || !clearance(pts, i, j, 40)) continue;
        best = [i, j, d];
      }
      if (!best) return null;
      edges.push(best);
    }
    if (!connected(n, edges)) return null;
    angleCleanup(pts, edges, 0.42);
    if (!connected(n, edges)) return null;

    /* posiciones iniciales */
    const D = allPairs(n, edges);
    const deg = new Array(n).fill(0);
    edges.forEach((e) => { deg[e[0]]++; deg[e[1]]++; });
    const enemies = spec.enemies || 1;
    let pStart;
    const side = spec.pSide && spec.pSide !== 'best' ? spec.pSide : 'left';
    const scoreSide = (p) => side === 'left' ? p.x : side === 'right' ? -p.x : side === 'bottom' ? -p.y : side === 'top' ? p.y : side === 'center' ? Math.hypot(p.x - 640, p.y - 365) : rng();
    let bestS = Infinity;
    pts.forEach((p, i) => {
      if (layout === 'ring' && p.ring !== 1) return;
      const s = scoreSide(p) + (deg[i] < 2 ? 25 : 0) + Math.abs(p.y - 365) * 0.15;
      if (s < bestS) { bestS = s; pStart = i; }
    });
    const starts = [pStart];
    for (let e = 0; e < enemies; e++) {
      let best = -1, bv = -1;
      for (let i = 0; i < n; i++) {
        if (starts.indexOf(i) >= 0) continue;
        if (layout === 'ring' && pts[i].ring !== 1) continue;
        let m = Infinity;
        starts.forEach((s) => { m = Math.min(m, D[s][i]); });
        const v = m + (deg[i] >= 2 ? 30 : 0);
        if (v > bv) { bv = v; best = i; }
      }
      if (best < 0) return null;
      starts.push(best);
    }
    /* el jugador toma la posición con mayor territorio propio (región de Voronoi en el grafo) */
    if (!spec.pSide || spec.pSide === 'best') {
      let bestK = 0, bestV = -1;
      starts.forEach((s, k) => {
        let v = 0;
        for (let i = 0; i < n; i++) {
          let mine = true;
          for (let q = 0; q < starts.length; q++) if (q !== k && D[starts[q]][i] <= D[s][i]) { mine = false; break; }
          if (mine) v += 1;
        }
        v += deg[s] * 0.3;
        if (v > bestV) { bestV = v; bestK = k; }
      });
      const tmp = starts[0]; starts[0] = starts[bestK]; starts[bestK] = tmp;
      pStart = starts[0];
    }
    /* que el jugador no empiece pegado al enemigo */
    const h0 = hopsFrom(n, edges, pStart);
    for (let e = 1; e < starts.length; e++) if (h0[starts[e]] < Math.min(3, Math.floor(n / 4))) return null;

    /* asignación de dueños y edificios */
    const owner = new Array(n).fill(0);
    const type = new Array(n).fill('aldea');
    const level = new Array(n).fill(1);
    const troops = new Array(n).fill(0);
    const factionIds = spec.factions || [1, 2, 3, 4].slice(0, enemies + 1);
    starts.forEach((s, k) => { owner[s] = factionIds[k]; });
    const startDef = (k) => (k === 0 ? spec.player : (Array.isArray(spec.enemy) ? spec.enemy[k - 1] : spec.enemy)) || {};
    starts.forEach((s, k) => {
      const d = startDef(k);
      type[s] = d.type || 'aldea'; level[s] = d.level || 1; troops[s] = d.troops != null ? d.troops : 10;
      const extra = d.extra || 0;
      if (extra) {
        const hs = hopsFrom(n, edges, s);
        const near = pts.map((_, i) => i).filter((i) => owner[i] === 0 && hs[i] === 1).sort((a, b) => D[s][a] - D[s][b]);
        near.slice(0, extra).forEach((i) => { owner[i] = factionIds[k]; type[i] = 'aldea'; level[i] = d.extraLevel || 1; troops[i] = d.extraTroops || 6; });
      }
    });
    const enemyStarts = starts.slice(1);
    const metric = pts.map((_, i) => {
      const dp = D[pStart][i];
      let de = Infinity; enemyStarts.forEach((s) => { de = Math.min(de, D[s][i]); });
      return { i, dp, de, mid: Math.abs(dp - de) / (dp + de + 1) };
    });
    const hopsAll = starts.map((s) => hopsFrom(n, edges, s));
    const minHop = (i) => Math.min.apply(null, hopsAll.map((h) => h[i]));
    const free = () => metric.filter((m) => owner[m.i] === 0 && type[m.i] === 'aldea');
    const farFrom = (i, list, d) => list.every((j) => Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) >= d);
    const sp = spec.specials || {};
    const placed = { castillo: [], torre: [], establo: [], herreria: [] };
    /* castillos: zona central disputada */
    free().filter((m) => minHop(m.i) >= 2).sort((a, b) => (a.mid - b.mid) - (deg[b.i] - deg[a.i]) * 0.04)
      .forEach((m) => { if (placed.castillo.length < (sp.castillo || 0) && farFrom(m.i, placed.castillo, 230)) { type[m.i] = 'castillo'; placed.castillo.push(m.i); } });
    /* atalayas: cabezas de puente y cruces */
    const roadsTmp = new FF.GameMap({ seed: seed, nodes: pts.map((p) => [p.x, p.y]), roads: edges.map((e) => [e[0], e[1]]), terrain });
    const bridgeHeads = new Set();
    roadsTmp.roads.forEach((r) => { if (r.bridges.length) { bridgeHeads.add(r.a); bridgeHeads.add(r.b); } });
    free().filter((m) => minHop(m.i) >= 2).sort((a, b) => {
      const sa = (bridgeHeads.has(a.i) ? -0.5 : 0) + a.mid - deg[a.i] * 0.05;
      const sb = (bridgeHeads.has(b.i) ? -0.5 : 0) + b.mid - deg[b.i] * 0.05;
      return sa - sb;
    }).forEach((m) => { if (placed.torre.length < (sp.torre || 0) && farFrom(m.i, placed.torre, 170)) { type[m.i] = 'torre'; placed.torre.push(m.i); } });
    /* establos y herrerías: repartidos con justicia */
    ['establo', 'herreria'].forEach((tp) => {
      const want = sp[tp] || 0;
      for (let k = 0; k < want; k++) {
        const pool = free().filter((m) => minHop(m.i) >= 1);
        let pick = null;
        if (want >= 2 && k % 2 === 0) pick = pool.filter((m) => m.dp < m.de).sort((a, b) => Math.abs(a.mid - 0.25) - Math.abs(b.mid - 0.25))[0];
        else if (want >= 2) pick = pool.filter((m) => m.de < m.dp).sort((a, b) => Math.abs(a.mid - 0.25) - Math.abs(b.mid - 0.25))[0];
        if (!pick) pick = pool.sort((a, b) => a.mid - b.mid)[0];
        if (pick) { type[pick.i] = tp; placed[tp].push(pick.i); }
      }
    });
    /* nivel y guarnición neutral */
    const G = spec.garrison || 1;
    const base = { aldea: [3, 9], castillo: [13, 22], torre: [8, 15], establo: [6, 12], herreria: [6, 12] };
    for (let i = 0; i < n; i++) {
      if (owner[i] !== 0) continue;
      const tp = type[i];
      if (tp === 'aldea' && rng() < (spec.l2 || 0.15)) level[i] = 2;
      if (tp === 'aldea' && rng() < (spec.l3 || 0)) level[i] = 3;
      if (tp === 'castillo' && rng() < (spec.l2 || 0.15) * 1.5) level[i] = 2;
      if (tp === 'torre' && rng() < (spec.l2 || 0.15)) level[i] = 2;
      const h = minHop(i);
      const f = h <= 1 ? 0.5 : h === 2 ? 0.82 : Math.min(1.45, 1 + 0.09 * (h - 2));
      const r = base[tp];
      let v = rng.range(r[0], r[1]) * f * G * (1 + (level[i] - 1) * 0.35);
      troops[i] = Math.round(U.clamp(v, 1, FF.bstat(tp, level[i]).cap * 1.4));
    }
    /* ciudad fortificada central */
    if (spec.fortress) {
      let c = -1, cd = 1e9;
      for (let i = 0; i < n; i++) if (owner[i] === 0) { const d = Math.hypot(pts[i].x - 640, pts[i].y - 365); if (d < cd) { cd = d; c = i; } }
      if (c >= 0) { type[c] = 'castillo'; level[c] = spec.fortress.level || 3; troops[c] = spec.fortress.troops || 45; }
    }

    /* lagos decorativos (sin cruzar caminos) */
    const level0 = {
      seed, biome: spec.biome,
      nodes: pts.map((p, i) => [Math.round(p.x), Math.round(p.y), type[i], level[i], owner[i], troops[i]]),
      roads: edges.map((e) => [e[0], e[1]]),
      terrain: { islands: terrain.islands, rivers: terrain.rivers.map((r) => ({ pts: r.pts, w: r.w, kind: r.kind })), lakes: [] }
    };
    const gm = new FF.GameMap(level0);
    /* comprobación con caminos curvos reales */
    for (const r of gm.roads) {
      for (let k = 0; k < n; k++) {
        if (k === r.a || k === r.b) continue;
        if (U.distPointPoly(gm.nodes[k].x, gm.nodes[k].y, r.pts) < 34) return null;
      }
      if (layout === 'islands' && r.bridges.length > 1) return null;
    }
    const lakeKind = { valle: 'water', islas: null, desierto: 'oasis', hielo: 'ice', volcan: 'lava' }[spec.biome];
    const nl = spec.lakes != null ? spec.lakes : (lakeKind ? rng.int(0, 2) : 0);
    for (let l = 0; l < nl && lakeKind; l++) {
      for (let tries = 0; tries < 60; tries++) {
        const rx = rng.range(36, 70), ry = rx * rng.range(0.5, 0.8);
        const x = rng.range(B.x0 - 30, B.x1 + 30), y = rng.range(B.y0, B.y1 + 40);
        const R = Math.max(rx, ry);
        if (gm.nodes.some((nd) => Math.hypot(nd.x - x, nd.y - y) < R + 50)) continue;
        if (gm.roads.some((r) => U.distPointPoly(x, y, r.pts) < R + 16)) continue;
        if (Terra.kindAt(gm.terrain, x, y) !== 'land') continue;
        if (level0.terrain.lakes.some((o) => Math.hypot(o.x - x, o.y - y) < R + Math.max(o.rx, o.ry) + 20)) continue;
        level0.terrain.lakes.push({ x: Math.round(x), y: Math.round(y), rx: Math.round(rx), ry: Math.round(ry), a: Math.round(rng.range(-0.6, 0.6) * 100) / 100, kind: lakeKind });
        break;
      }
    }
    const pers = spec.personas || ['agresivo', 'expansivo', 'oportunista', 'constructor'];
    level0.ai = {};
    factionIds.slice(1).forEach((f, k) => { level0.ai[f] = pers[k % pers.length]; });
    return level0;
  }

  /* ---------- batalla rápida ---------- */
  MG.skirmish = function (opt) {
    const sizes = { pequeno: 12, mediano: 20, grande: 30 };
    const biome = opt.biome || 'valle';
    const layouts = { valle: ['scatter', 'river', 'scatter'], islas: ['islands'], desierto: ['scatter', 'river', 'ring'], hielo: ['river', 'scatter', 'cross'], volcan: ['river', 'cross', 'scatter'] };
    const seed = opt.seed || Math.floor(Math.random() * 1e9);
    const rng = U.rng(seed);
    const n = sizes[opt.size || 'mediano'];
    let layout = rng.pick(layouts[biome]);
    if (layout === 'cross' && (opt.enemies || 1) < 2) layout = 'river';
    const spec = {
      seed, biome, nodes: n, enemies: opt.enemies || 1, layout,
      islands: Math.max(3, Math.round(n / 4)),
      ringOuter: Math.max(8, Math.round(n * 0.6)), ringInner: Math.max(3, Math.round(n * 0.3)),
      density: 0.4,
      specials: opt.specials === false ? {} : { castillo: Math.round(n / 10), torre: Math.round(n / 7), establo: n >= 16 ? 1 : 0, herreria: n >= 16 ? 1 : 0 },
      player: { type: 'castillo', level: 1, troops: 20 },
      enemy: { type: 'castillo', level: 1, troops: 20 },
      garrison: 1, l2: 0.2,
      factions: [1].concat([2, 3, 4, 5].slice(0, opt.enemies || 1)),
      personas: ['agresivo', 'expansivo', 'oportunista']
    };
    if (biome === 'valle' || biome === 'hielo') spec.factions = [1].concat([2, 3, 5].slice(0, opt.enemies || 1));
    let lvl = null;
    const tries = [layout, 'scatter', 'scatter'];
    for (let i = 0; i < tries.length && !lvl; i++) {
      spec.layout = tries[i];
      if (i === 2) { spec.nodes = Math.max(spec.nodes, 14); spec.seed = seed + 99; }
      try { lvl = MG.generate(spec); } catch (e) { lvl = null; }
    }
    if (!lvl) throw new Error('skirmish');
    lvl.id = 'skirmish';
    lvl.name = 'Batalla rápida';
    lvl.spells = FF.SPELL_ORDER.slice();
    lvl.skirmish = true;
    return lvl;
  };
})(globalThis.FF = globalThis.FF || {});
