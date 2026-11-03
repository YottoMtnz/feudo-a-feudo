/* Feudo a Feudo — inteligencia de los señores rivales
   Inspirada en el ritmo de los clásicos de conquista casual: los rivales se expanden, atacan por oleadas
   y defienden lo suyo, pero tardan en darse cuenta de lo que pasa, no se ensañan todos a la vez con el
   jugador y en el modo fácil dan margen para recuperarse. */
(function (FF) {
  'use strict';
  const U = FF.U;

  const DEFAULTS = {
    lag: 0,          /* segundos que tarda en enterarse de los cambios del mapa */
    grace: 0,        /* tregua inicial: no ataca al jugador antes de este segundo */
    playerCD: 0,     /* pausa mínima entre ataques de este señor al jugador */
    globalCD: 0,     /* pausa mínima entre ataques de cualquier señor al jugador */
    maxSrc: 5,       /* edificios que puede coordinar en un mismo ataque */
    maxActs: 3,      /* ataques que puede lanzar en cada turno de decisión */
    mercy: 0,        /* probabilidad de dar respiro al jugador cuando va muy por detrás */
    double: true     /* puede enviar dos oleadas seguidas desde un mismo edificio */
  };

  class AI {
    constructor(game, f, opts) {
      this.g = game;
      this.f = f;
      this.p = opts.persona || FF.PERSONAS.equilibrado;
      this.m = Object.assign({}, DEFAULTS, opts.mode);
      this.proxy = !!opts.proxy;
      this.timer = this.m.startDelay * (0.75 + 0.5 * game.rng());
      this.lastHitPlayer = -1e9;
      const n = game.buildings.length;
      this.seen = new Float64Array(n);
      this.seenOwner = new Int8Array(n);
      this.lookT = 0;
      this.look();
    }

    /* instantánea de lo que este señor "ve" del mapa */
    look() {
      const B = this.g.buildings;
      for (let i = 0; i < B.length; i++) { this.seen[i] = B[i].troops; this.seenOwner[i] = B[i].owner; }
    }

    update(dt) {
      this.lookT -= dt;
      if (this.lookT <= 0) {
        this.look();
        this.lookT = Math.max(0.1, this.m.lag * (0.7 + 0.6 * this.g.rng()));
      }
      this.timer -= dt;
      if (this.timer > 0) return;
      this.timer = this.m.interval * (0.7 + 0.6 * this.g.rng());
      this.think();
    }

    /* ¿puede atacar al jugador ahora mismo? */
    playerOK() {
      const g = this.g, m = this.m;
      if (this.proxy) return true;
      if (g.time < m.grace) return false;
      if (g.time - this.lastHitPlayer < m.playerCD) return false;
      if (g.time - g.lastHitPlayer < m.globalCD) return false;
      if (m.mercy > 0) {
        const pw = g.power();
        let tot = 0, alive = 0;
        for (const k in pw) { tot += pw[k]; if (pw[k] > 0) alive++; }
        const share = tot ? (pw[g.player] || 0) / tot : 1;
        if (share < 0.55 / Math.max(2, alive) && g.rng() < m.mercy) return false;
      }
      return true;
    }

    think() {
      const g = this.g, f = this.f;
      if (g.over) return;
      const own = g.buildings.filter((b) => b.owner === f);
      if (!own.length) return;
      const T = this.assess(own);
      const front = {};
      own.forEach((b) => { front[b.id] = g.map.adj[b.id].some((e) => g.buildings[e.to].owner !== f); });
      if (g.rng() < this.m.react) this.defend(own, T);
      const maxActs = Math.min(this.m.maxActs, 1 + Math.floor(own.length / 5));
      this.attack(own, T, maxActs);
      this.upgrades(own, T, front);
      this.funnel(own, T, front);
    }

    /* amenazas: daño entrante contra cada edificio propio */
    assess(own) {
      const g = this.g, f = this.f, T = {};
      own.forEach((b) => { T[b.id] = { inc: 0, eta: Infinity, friend: 0, sent: false }; });
      for (let i = 0; i < g.squads.length; i++) {
        const sq = g.squads[i];
        const tt = T[sq.dst];
        if (!tt) continue;
        const b = g.buildings[sq.dst];
        if (sq.owner === f) { tt.friend += sq.count; continue; }
        tt.inc += (sq.count * sq.u.str) / b.def.def[sq.ut];
        const eta = Math.max(0, sq.len - sq.frontPos()) / sq.u.speed;
        if (eta < tt.eta) tt.eta = eta;
      }
      own.forEach((b) => {
        const tt = T[b.id];
        const prod = b.stat.prod || 0;
        const etaP = isFinite(tt.eta) ? tt.eta : 0;
        tt.deficit = tt.inc - (b.troops + tt.friend + prod * etaP * 0.8);
        tt.threat = tt.inc > 0 && tt.deficit > -1.5;
      });
      return T;
    }

    defend(own, T) {
      const g = this.g, f = this.f, B = g.buildings;
      const threatened = own.filter((b) => T[b.id].threat)
        .sort((a, b) => FF.BUILD[b.type].value * b.level - FF.BUILD[a.type].value * a.level);
      let acts = 0;
      for (const b of threatened) {
        const need = T[b.id].deficit + 2;
        if (need <= 0) continue;
        const dist = g.map.distancesFrom(b.id, (id) => B[id].owner === f);
        const helpers = own.filter((h) => h !== b && !T[h.id].threat && !T[h.id].sent && h.troops >= 4 &&
          isFinite(dist[h.id]) && h.sleepUntil < g.time).sort((a, c) => dist[a.id] - dist[c.id]);
        let avail = 0;
        const chosen = [];
        for (const h of helpers) {
          if (chosen.length >= this.m.maxSrc) break;
          const sp = FF.UNITS[FF.BUILD[h.type].unit].speed;
          if (dist[h.id] / sp > T[b.id].eta + 3) continue;
          chosen.push(h);
          avail += Math.floor(h.troops / 2);
          if (avail >= need) break;
        }
        if (chosen.length && avail >= need * 0.7) {
          chosen.forEach((h) => { g.send(f, [h.id], b.id); T[h.id].sent = true; });
          acts++;
        }
      }
      return acts;
    }

    /* evalúa cuántas tropas hacen falta para tomar un objetivo y desde dónde */
    plan(t, srcs, dist, towerRate, def, frac) {
      const g = this.g, m = this.m;
      let dmgAcc = 0, sent = 0, etaMax = 0;
      const use = [];
      const growthRate = (t.owner !== 0 && t.stat.prod && t.sleepUntil < g.time)
        ? t.stat.prod * (t.owner === g.player ? 1 : m.prod) : 0;
      for (const s of srcs) {
        const ut = FF.BUILD[s.type].unit, uu = FF.UNITS[ut];
        const eta = dist[s.id] / uu.speed;
        const n = frac === 0.5 ? Math.floor(s.troops / 2) : Math.floor(s.troops / 2) + Math.floor((s.troops - Math.floor(s.troops / 2)) / 2);
        if (n < 1) continue;
        const per = uu.str / t.def.def[ut];
        const ex = this.exposure(s.id, t.id);
        const parade = ((n / uu.rowW) * uu.rowSp) / uu.speed;
        const losses = ((ex.len / uu.speed + parade * Math.min(1, ex.rate)) * (ex.rate || 0) + towerRate * parade * 0.5) *
          (1 - uu.evade) * (m.accuracy >= 0.7 ? 1 : 0.4) / uu.hp;
        dmgAcc += Math.max(0, n - losses) * per;
        sent += n;
        if (eta > etaMax) etaMax = eta;
        use.push(s);
        const growth = Math.min(growthRate * etaMax, Math.max(0, t.cap - def));
        const need = Math.max(0, def + growth) * m.margin + 1;
        if (dmgAcc >= need) return { t, use, sent, eta: etaMax, need, double: frac !== 0.5 };
        if (use.length >= m.maxSrc) break;
      }
      return null;
    }

    /* exposición a atalayas enemigas a lo largo del camino real */
    exposure(sid, tid) {
      const g = this.g, f = this.f;
      if (!this._towers || !this._towers.length) return { len: 0, rate: 0 };
      const path = g.findPath(sid, tid, f);
      if (!path) return { len: 0, rate: 0 };
      let len = 0, rate = 0;
      for (const tw of this._towers) {
        const r2 = tw.stat.range * tw.stat.range;
        let inside = 0;
        for (const step of path.roads) {
          const P = step.road.pts;
          for (let i = 2; i < P.length; i += 2) {
            if (U.dist2(P[i].x, P[i].y, tw.x, tw.y) < r2) inside += Math.hypot(P[i].x - P[i - 2].x, P[i].y - P[i - 2].y);
          }
        }
        const rr = tw.stat.rate * (tw.stat.dmg || 1);
        if (inside > 0) { len += inside * rr; rate += rr; }
      }
      return { len, rate };
    }

    attack(own, T, maxActs) {
      const g = this.g, f = this.f, B = g.buildings, m = this.m, p = this.p;
      const cand = new Set();
      own.forEach((b) => g.map.adj[b.id].forEach((e) => { if (B[e.to].owner !== f) cand.add(e.to); }));
      if (!cand.size) return 0;
      const okPlayer = this.playerOK();
      this._towers = B.filter((b) => b.type === 'torre' && b.owner !== f && b.troops >= 1 && b.sleepUntil <= g.time && b.iceUntil <= g.time);
      const oursTo = {};
      g.squads.forEach((sq) => {
        if (sq.owner === f) oursTo[sq.dst] = (oursTo[sq.dst] || 0) + (sq.count * sq.u.str) / B[sq.dst].def.def[sq.ut];
      });
      const options = [];
      const allowDouble = m.double && p.aggr > 0.6 && m.accuracy >= 0.8;
      cand.forEach((tid) => {
        const t = B[tid];
        if (t.owner === g.player && !okPlayer) return;
        if (t.shieldUntil > g.time + 1) return;
        /* un cambio de dueño reciente todavía no lo ha visto */
        if (!this.proxy && this.seenOwner[tid] !== t.owner) return;
        const dist = g.map.distancesFrom(tid, (id) => B[id].owner === f);
        const srcs = own.filter((s) => isFinite(dist[s.id]) && s.troops >= 4 && !T[s.id].threat && !T[s.id].sent && s.sleepUntil < g.time)
          .sort((a, b) => dist[a.id] - dist[b.id]);
        if (!srcs.length) return;
        let def = this.proxy ? t.troops : this.seen[tid];
        def *= 1 + (1 - m.accuracy) * (g.rng() - 0.5) * 0.8;
        g.squads.forEach((sq) => { if (sq.dst === tid && sq.owner === t.owner) def += sq.count; });
        def -= oursTo[tid] || 0;
        let towerRate = 0;
        this._towers.forEach((tw) => {
          if (U.dist(tw.x, tw.y, t.x, t.y) < tw.stat.range + 25) towerRate += tw.stat.rate * (tw.stat.dmg || 1);
        });
        let o = this.plan(t, srcs, dist, towerRate, def, 0.5);
        if (!o && allowDouble) o = this.plan(t, srcs, dist, towerRate, def, 0.75);
        if (o) options.push(o);
      });
      if (!options.length) return 0;
      const mh = m.hate != null ? m.hate : 1;
      options.forEach((o) => {
        const t = o.t;
        let v = FF.BUILD[t.type].value * (1 + (t.owner !== 0 ? 0.12 : 0.04) * (t.level - 1));
        if (t.owner === 0) v += 8 * p.expand;
        else v += 10 * p.aggr * (t.owner === g.player ? 0.6 + 0.4 * mh : 1) + (t.owner === g.player ? 6 * p.hate * mh : 0);
        if (t.owner !== 0) {
          let left = 0;
          for (let i = 0; i < B.length; i++) if (B[i].owner === t.owner) left++;
          if (left === 1) v += t.owner === g.player ? 14 * mh : 14;
        }
        if (t.type === 'torre') own.forEach((b) => { if (U.dist(b.x, b.y, t.x, t.y) < t.stat.range + 10) v += 3; });
        const cost = o.sent + o.eta * 0.9 + (o.double ? 6 : 0);
        o.score = (v / (cost + 6)) * (1 + (1 - m.accuracy) * (g.rng() - 0.5) * 1.6);
      });
      options.sort((a, b) => b.score - a.score);
      let acts = 0, hitPlayer = false;
      for (const o of options) {
        if (acts >= maxActs) break;
        if (o.use.some((s) => T[s.id].sent)) continue;
        if (o.t.owner === g.player) { if (hitPlayer) continue; hitPlayer = true; }
        o.use.forEach((s) => {
          g.send(f, [s.id], o.t.id);
          if (o.double) g.send(f, [s.id], o.t.id);
          T[s.id].sent = true;
        });
        if (o.t.owner === g.player) { this.lastHitPlayer = g.time; g.lastHitPlayer = g.time; }
        acts++;
      }
      return acts;
    }

    upgrades(own, T, front) {
      const g = this.g, m = this.m, p = this.p;
      let did = 0;
      const list = own.slice();
      g.rng.shuffle(list);
      for (const b of list) {
        if (did >= 2) break;
        if (b.level >= b.maxLevel || T[b.id].threat || T[b.id].sent) continue;
        const cost = b.upCost;
        const isFront = front[b.id];
        const reserve = isFront ? b.cap * 0.3 : 0;
        if (b.troops < cost + reserve || b.troops < b.cap * 0.6) continue;
        const bias = { aldea: 1, castillo: 1.1, torre: isFront ? 0.8 : 0.15, establo: 0.45, herreria: 0.45 }[b.type];
        if (g.rng() < m.upgrade * p.upgrade * bias) {
          if (g.upgrade(this.f, b.id)) { did++; T[b.id].sent = true; }
        }
      }
    }

    funnel(own, T, front) {
      const g = this.g, f = this.f, p = this.p, B = g.buildings;
      const fronts = own.filter((b) => front[b.id]);
      if (!fronts.length) return;
      for (const b of own) {
        if (front[b.id] || T[b.id].sent || T[b.id].threat) continue;
        if (b.troops < 6) continue;
        const full = b.troops >= b.cap * 0.9;
        if (!full && g.rng() > p.funnel * 0.25) continue;
        if (full && g.rng() > 0.35 + p.funnel * 0.6) continue;
        const dist = g.map.distancesFrom(b.id, (id) => B[id].owner === f);
        let best = null, bd = Infinity;
        fronts.forEach((fb) => {
          let d = dist[fb.id];
          if (!isFinite(d)) return;
          if (fb.type === 'herreria' || fb.type === 'establo') d *= 0.55;
          if (fb.troops > fb.cap * 1.4) d *= 2.5;
          if (d < bd) { bd = d; best = fb; }
        });
        if (best && (full || best.type === 'herreria' || best.type === 'establo')) {
          g.send(f, [b.id], best.id);
          T[b.id].sent = true;
        }
      }
    }
  }
  FF.AI = AI;

  /* perfiles de jugador simulado que usa la herramienta de equilibrado de niveles */
  FF.BOTS = {
    /* jugador medio: decide cada ~2,3 s, una acción por vez, defiende a veces y calcula con errores */
    humano: { interval: 2.3, react: 0.55, accuracy: 0.8, prod: 1, startDelay: 1.2, upgrade: 0.8, margin: 1.12, hate: 1, lag: 1, maxSrc: 3, maxActs: 1, double: false },
    /* jugador experto: rápido, coordina varios frentes y defiende casi siempre */
    experto: { interval: 1.3, react: 0.9, accuracy: 0.95, prod: 1, startDelay: 0.6, upgrade: 0.9, margin: 1.1, hate: 1, lag: 0.4, maxSrc: 4, maxActs: 2, double: true }
  };
})(globalThis.FF = globalThis.FF || {});
