/* Feudo a Feudo — geometría del mapa: terreno, caminos, rutas y búsqueda de caminos */
(function (FF) {
  'use strict';
  const U = FF.U;

  /* ---------- Consultas de terreno (compartidas por generador, motor y render) ---------- */
  const Terra = FF.Terra = {};

  Terra.prepare = function (t) {
    t = t || {};
    t.islands = t.islands || [];
    t.rivers = t.rivers || [];
    t.lakes = t.lakes || [];
    t.rivers.forEach((r) => { r.P = r.pts.map((p) => ({ x: p[0], y: p[1] })); });
    return t;
  };

  Terra.islandR = function (isl, ang) {
    const s = isl.s || 0;
    return isl.r * (1 + 0.12 * Math.sin(ang * 3 + s) + 0.07 * Math.sin(ang * 5 + s * 1.7) + 0.045 * Math.sin(ang * 8 + s * 2.3));
  };

  Terra.inIsland = function (isl, x, y, pad) {
    const dx = x - isl.x, dy = y - isl.y;
    const d = Math.hypot(dx, dy);
    return d < Terra.islandR(isl, Math.atan2(dy, dx)) + (pad || 0);
  };

  /* devuelve 'land' | 'water' | 'lava' | 'chasm' | 'ice' | 'oasis' */
  Terra.kindAt = function (t, x, y) {
    if (t.islands.length) {
      let land = false;
      for (let i = 0; i < t.islands.length; i++) if (Terra.inIsland(t.islands[i], x, y, 0)) { land = true; break; }
      if (!land) return 'water';
    }
    for (let i = 0; i < t.rivers.length; i++) {
      const r = t.rivers[i];
      if (U.distPointPoly(x, y, r.P) < r.w / 2) return r.kind;
    }
    for (let i = 0; i < t.lakes.length; i++) {
      const l = t.lakes[i];
      const c = Math.cos(-l.a || 0), s = Math.sin(-l.a || 0);
      const dx = x - l.x, dy = y - l.y;
      const rx = dx * c - dy * s, ry = dx * s + dy * c;
      if ((rx * rx) / (l.rx * l.rx) + (ry * ry) / (l.ry * l.ry) < 1) return l.kind;
    }
    return 'land';
  };

  Terra.isBarrier = function (k) { return k === 'water' || k === 'lava' || k === 'chasm'; };

  /* ---------- Caminos ---------- */
  function cubic(p0, p1, p2, p3, t) {
    const it = 1 - t;
    return it * it * it * p0 + 3 * it * it * t * p1 + 3 * it * t * t * p2 + t * t * t * p3;
  }

  FF.makeRoad = function (A, B, seed, terrain) {
    const rng = U.rng(seed);
    const dx = B.x - A.x, dy = B.y - A.y;
    const len0 = Math.hypot(dx, dy);
    const nx = -dy / len0, ny = dx / len0;
    const b1 = len0 * rng.range(-0.075, 0.075);
    const b2 = rng.chance(0.45) ? -b1 * rng.range(0.4, 1) : b1 * rng.range(0.3, 1);
    const c1x = A.x + dx * 0.33 + nx * b1, c1y = A.y + dy * 0.33 + ny * b1;
    const c2x = A.x + dx * 0.67 + nx * b2, c2y = A.y + dy * 0.67 + ny * b2;
    const steps = Math.max(8, Math.ceil(len0 / 5));
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      pts.push({ x: cubic(A.x, c1x, c2x, B.x, t), y: cubic(A.y, c1y, c2y, B.y, t) });
    }
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const road = { pts, cum, len: cum[cum.length - 1], bridges: [] };
    if (terrain) {
      let inSpan = false, d0 = 0, kind = null;
      for (let i = 0; i < pts.length; i++) {
        const k = Terra.kindAt(terrain, pts[i].x, pts[i].y);
        const bar = Terra.isBarrier(k);
        if (bar && !inSpan) { inSpan = true; d0 = cum[i]; kind = k; }
        else if (!bar && inSpan) { inSpan = false; road.bridges.push({ d0: Math.max(0, d0 - 8), d1: Math.min(road.len, cum[i] + 8), kind }); }
      }
      if (inSpan) road.bridges.push({ d0: Math.max(0, d0 - 8), d1: road.len, kind });
    }
    return road;
  };

  /* punto sobre una polilínea con distancias acumuladas */
  FF.polyAt = function (pts, cum, d, out) {
    out = out || {};
    const n = pts.length;
    if (d <= 0) { out.x = pts[0].x; out.y = pts[0].y; out.a = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x); return out; }
    const L = cum[n - 1];
    if (d >= L) { out.x = pts[n - 1].x; out.y = pts[n - 1].y; out.a = Math.atan2(pts[n - 1].y - pts[n - 2].y, pts[n - 1].x - pts[n - 2].x); return out; }
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= d) lo = mid; else hi = mid; }
    const seg = cum[hi] - cum[lo] || 1;
    const t = (d - cum[lo]) / seg;
    const a = pts[lo], b = pts[hi];
    out.x = a.x + (b.x - a.x) * t; out.y = a.y + (b.y - a.y) * t;
    out.a = Math.atan2(b.y - a.y, b.x - a.x);
    return out;
  };

  /* ---------- Mapa (grafo de caminos) ---------- */
  class GameMap {
    constructor(level) {
      this.level = level;
      this.terrain = Terra.prepare(level.terrain);
      this.nodes = level.nodes.map((n, i) => ({ id: i, x: n[0], y: n[1] }));
      this.roads = [];
      this.adj = this.nodes.map(() => []);
      level.roads.forEach((e, i) => {
        const a = e[0], b = e[1];
        const road = FF.makeRoad(this.nodes[a], this.nodes[b], (level.seed || 1) * 1009 + i * 7919, this.terrain);
        road.id = i; road.a = a; road.b = b;
        this.roads.push(road);
        this.adj[a].push({ to: b, road: i });
        this.adj[b].push({ to: a, road: i });
      });
    }

    /* Dijkstra: los nodos intermedios deben cumplir canPass(id). */
    path(src, dst, canPass) {
      const n = this.nodes.length;
      const dist = new Float64Array(n).fill(Infinity);
      const prev = new Int32Array(n).fill(-1);
      const prevRoad = new Int32Array(n).fill(-1);
      const done = new Uint8Array(n);
      dist[src] = 0;
      for (let it = 0; it < n; it++) {
        let u = -1, best = Infinity;
        for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
        if (u < 0) break;
        if (u === dst) break;
        done[u] = 1;
        if (u !== src && !canPass(u)) continue; // no se puede atravesar
        const edges = this.adj[u];
        for (let k = 0; k < edges.length; k++) {
          const e = edges[k];
          const nd = best + this.roads[e.road].len;
          if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = u; prevRoad[e.to] = e.road; }
        }
      }
      if (!isFinite(dist[dst])) return null;
      const nodes = [], roads = [];
      let cur = dst;
      while (cur !== src) {
        nodes.push(cur);
        const r = prevRoad[cur];
        const road = this.roads[r];
        roads.push({ road, dir: road.b === cur ? 1 : -1 });
        cur = prev[cur];
      }
      nodes.push(src);
      nodes.reverse(); roads.reverse();
      return { nodes, roads, len: dist[dst] };
    }

    /* distancias desde start atravesando sólo nodos canPass (start puede no cumplirlo) */
    distancesFrom(start, canPass) {
      const n = this.nodes.length;
      const dist = new Float64Array(n).fill(Infinity);
      const done = new Uint8Array(n);
      dist[start] = 0;
      for (let it = 0; it < n; it++) {
        let u = -1, best = Infinity;
        for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
        if (u < 0) break;
        done[u] = 1;
        if (u !== start && !canPass(u)) continue;
        const edges = this.adj[u];
        for (let k = 0; k < edges.length; k++) {
          const e = edges[k];
          if (!canPass(e.to)) continue;
          const nd = best + this.roads[e.road].len;
          if (nd < dist[e.to]) dist[e.to] = nd;
        }
      }
      return dist;
    }

    /* distancias en saltos (sin restricciones) */
    hops(start) {
      const n = this.nodes.length;
      const d = new Array(n).fill(Infinity);
      d[start] = 0;
      const q = [start];
      while (q.length) {
        const u = q.shift();
        for (const e of this.adj[u]) if (d[e.to] === Infinity) { d[e.to] = d[u] + 1; q.push(e.to); }
      }
      return d;
    }
  }
  FF.GameMap = GameMap;

  /* ---------- Ruta concreta de un escuadrón ---------- */
  class Route {
    constructor(map, path) {
      const pts = [], cum = [], segs = [], waypoints = [];
      let total = 0;
      path.roads.forEach((step, idx) => {
        const r = step.road;
        const rp = step.dir > 0 ? r.pts : r.pts.slice().reverse();
        const d0 = total;
        for (let i = 0; i < rp.length; i++) {
          if (pts.length && i === 0) continue;
          if (pts.length) total += Math.hypot(rp[i].x - pts[pts.length - 1].x, rp[i].y - pts[pts.length - 1].y);
          pts.push(rp[i]); cum.push(total);
        }
        segs.push({ road: r, dir: step.dir, d0, d1: total });
        if (idx < path.roads.length - 1) waypoints.push({ node: path.nodes[idx + 1], d: total });
      });
      this.pts = pts; this.cum = cum; this.len = total; this.segs = segs; this.waypoints = waypoints;
      this.nodes = path.nodes;
    }
    at(d, out) { return FF.polyAt(this.pts, this.cum, d, out); }
    segAt(d) {
      const s = this.segs;
      for (let i = 0; i < s.length; i++) if (d <= s[i].d1) return s[i];
      return s[s.length - 1];
    }
  }
  FF.Route = Route;
})(globalThis.FF = globalThis.FF || {});
