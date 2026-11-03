/* Feudo a Feudo — utilidades generales (sin DOM) */
(function (FF) {
  'use strict';
  const U = FF.U = {};

  /* ---------- Aleatorio con semilla (mulberry32) ---------- */
  U.rng = function (seed) {
    let a = (seed >>> 0) || 0x9E3779B9;
    const r = function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.range = (lo, hi) => lo + (hi - lo) * r();
    r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * r());
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    r.chance = (p) => r() < p;
    r.sign = () => (r() < 0.5 ? -1 : 1);
    r.shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    };
    return r;
  };

  U.hashStr = function (s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };

  /* ---------- Matemáticas ---------- */
  U.clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
  U.dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  U.dist2 = (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; };
  U.smooth = (t) => t * t * (3 - 2 * t);
  U.easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  U.easeInCubic = (t) => t * t * t;
  U.easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  U.easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  U.TAU = Math.PI * 2;

  /* distancia de un punto a un segmento */
  U.distPointSeg = function (px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = U.clamp(t, 0, 1);
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  };

  /* ¿se cruzan los segmentos AB y CD? (sin contar extremos compartidos) */
  U.segCross = function (ax, ay, bx, by, cx, cy, dx, dy) {
    const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
    const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
    const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  };

  /* distancia de un punto a una polilínea [{x,y}] */
  U.distPointPoly = function (px, py, pts) {
    let best = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const d = U.distPointSeg(px, py, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
      if (d < best) best = d;
    }
    return best;
  };

  /* ---------- Ruido de valor 2D con semilla ---------- */
  U.makeNoise = function (seed) {
    const s = (seed >>> 0) || 1;
    function h(ix, iy) {
      let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(s, 2246822519);
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      n = n ^ (n >>> 16);
      return (n >>> 0) / 4294967296;
    }
    function noise(x, y) {
      const ix = Math.floor(x), iy = Math.floor(y);
      const fx = x - ix, fy = y - iy;
      const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
      const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
      return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
    }
    noise.fbm = function (x, y, oct, lac, gain) {
      oct = oct || 4; lac = lac || 2; gain = gain || 0.5;
      let amp = 0.5, f = 1, sum = 0, norm = 0;
      for (let i = 0; i < oct; i++) {
        sum += amp * noise(x * f, y * f);
        norm += amp; amp *= gain; f *= lac;
      }
      return sum / norm;
    };
    return noise;
  };

  /* ---------- Color ---------- */
  U.hexToRgb = function (hex) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  U.rgbToHex = function (r, g, b) {
    const c = (v) => U.clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
    return '#' + c(r) + c(g) + c(b);
  };
  U.mix = function (h1, h2, t) {
    const a = U.hexToRgb(h1), b = U.hexToRgb(h2);
    return U.rgbToHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
  };
  U.shade = function (hex, amt) { /* amt -1..1 */
    return amt >= 0 ? U.mix(hex, '#ffffff', amt) : U.mix(hex, '#000000', -amt);
  };
  U.rgba = function (hex, a) {
    const c = U.hexToRgb(hex);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  };

  /* ---------- Formatos ---------- */
  U.fmtTime = function (sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  };
  U.fmtNum = function (n) {
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };
})(globalThis.FF = globalThis.FF || {});
