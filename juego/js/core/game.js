/* Feudo a Feudo — motor de simulación (sin DOM) */
(function (FF) {
  'use strict';
  const U = FF.U;

  /* ---------- Edificio ---------- */
  class Building {
    constructor(id, def) {
      this.id = id;
      this.x = def[0]; this.y = def[1];
      this.type = def[2]; this.level = def[3] || 1;
      this.owner = def[4] || 0;
      this.troops = def[5] != null ? def[5] : FF.bstat(this.type, this.level).cap / 2;
      this.fireCD = 0.3 + (id % 5) * 0.11;
      this.sleepUntil = -1; this.shieldUntil = -1; this.iceUntil = -1;
      this.hitT = -10; this.capT = -10; this.upT = -10; this.sendT = -10;
      this.lastOwner = this.owner;
    }
    get stat() { return FF.bstat(this.type, this.level); }
    get cap() { return FF.bstat(this.type, this.level).cap; }
    get def() { return FF.BUILD[this.type]; }
    get maxLevel() { return FF.BUILD[this.type].levels.length; }
    get upCost() { return FF.upgradeCost(this.type, this.level); }
    canUpgrade() { return this.level < this.maxLevel && this.troops >= this.upCost; }
  }
  FF.Building = Building;

  /* ---------- Escuadrón en marcha ---------- */
  class Squad {
    constructor(id, owner, ut, count, route, src, dst) {
      this.id = id; this.owner = owner; this.ut = ut; this.u = FF.UNITS[ut];
      this.count = count; this.k0 = 0; this.dmg = 0;
      this.route = route; this.len = route.len; this.dist = 0;
      this.src = src; this.dst = dst; this.wp = 0;
      this.frozenUntil = -1; this.engaged = false; this.clashT = 0;
      this.total = count;
    }
    posOf(k) { return this.dist - Math.floor(k / this.u.rowW) * this.u.rowSp; }
    frontPos() { return this.posOf(this.k0); }
    tailPos() { return this.posOf(this.k0 + this.count - 1); }
    /* elimina soldados por delante (combate frontal) o por detrás (flechas) */
    kill(n, front) {
      n = Math.min(n, this.count);
      if (front) this.k0 += n;
      this.count -= n;
      return n;
    }
  }
  FF.Squad = Squad;

  /* ---------- Partida ---------- */
  class Game {
    constructor(level, opts) {
      opts = opts || {};
      this.opts = opts;
      this.level = level;
      this.modeIndex = opts.mode || 0;
      this.mode = FF.MODES[this.modeIndex];
      this.aiParams = Object.assign({}, this.mode.ai, opts.aiOverride || {});
      if (level.aiDelay) this.aiParams.startDelay = Math.max(this.aiParams.startDelay, level.aiDelay * (1 - this.modeIndex * 0.3));
      if (level.aiSlow) this.aiParams.interval *= 1 + (level.aiSlow - 1) * (1 - this.modeIndex * 0.35);
      if (level.aiHate != null) this.aiParams.hate = (this.aiParams.hate || 1) * level.aiHate;
      this.rng = U.rng(((level.seed || 1) * 31 + (opts.seed || 0) * 977) >>> 0);
      this.map = new FF.GameMap(level);
      this.buildings = level.nodes.map((n, i) => new Building(i, n));
      this.squads = [];
      this.squadById = new Map();
      this.arrows = [];
      this.events = [];
      this.time = 0;
      this.over = false;
      this.result = null;
      this.player = FF.PLAYER;
      this.nextId = 1;
      const fs = new Set();
      this.buildings.forEach((b) => { if (b.owner) fs.add(b.owner); });
      this.factions = Array.from(fs).sort((a, b) => a - b);
      this.alive = {};
      this.factions.forEach((f) => { this.alive[f] = true; });
      this.magic = this.mode.magic && opts.magic !== false;
      this.spells = (level.spells || []).slice();
      this.mana = FF.MANA.start;
      this.endCheckT = 0;
      this.delayed = [];
      this.lastHitPlayer = -1e9;
      const pb = this.buildings.filter((b) => b.owner === this.player).length;
      this.stats = {
        produced: 0, lost: 0, killed: 0, captured: 0, lostBuildings: 0, upgrades: 0,
        spells: 0, sent: 0, jinetes: 0, caballeros: 0, towerKills: 0,
        minBuildings: pb, maxInBuilding: 0, spellSet: {}, usedMagic: false, maxLevelNow: 0,
        startBuildings: pb
      };
      /* inteligencias artificiales */
      this.ais = [];
      const personas = level.ai || {};
      this.factions.forEach((f) => {
        if (f === this.player && !opts.playerAI) return;
        if (f === this.player) {
          this.ais.push(new FF.AI(this, f, { persona: FF.PERSONAS[opts.playerAI.persona || 'equilibrado'], mode: opts.playerAI.mode, proxy: true }));
          return;
        }
        const pk = personas[f] || ['agresivo', 'expansivo', 'oportunista', 'constructor', 'equilibrado'][f % 5];
        this.ais.push(new FF.AI(this, f, { persona: FF.PERSONAS[pk] || FF.PERSONAS.equilibrado, mode: this.aiParams }));
      });
    }

    emit(type, data) {
      if (this.opts.noEvents) return;
      data = data || {};
      data.type = type;
      this.events.push(data);
    }

    owned(f) { return this.buildings.filter((b) => b.owner === f); }

    findPath(src, dst, owner) {
      const B = this.buildings;
      return this.map.path(src, dst, (id) => B[id].owner === owner);
    }

    /* ---------- Órdenes ---------- */
    send(owner, srcIds, dstId, opts) {
      if (this.over) return 0;
      const dst = this.buildings[dstId];
      if (!dst) return 0;
      let total = 0;
      for (let i = 0; i < srcIds.length; i++) {
        const sid = srcIds[i];
        if (sid === dstId) continue;
        const s = this.buildings[sid];
        if (!s || s.owner !== owner) continue;
        if (s.sleepUntil > this.time) continue;
        if (s.troops < 2) continue;
        const path = this.findPath(sid, dstId, owner);
        if (!path) continue;
        const n = Math.floor(s.troops / 2);
        s.troops -= n;
        s.sendT = this.time;
        const ut = FF.BUILD[s.type].unit;
        const route = new FF.Route(this.map, path);
        const sq = new Squad(this.nextId++, owner, ut, n, route, sid, dstId);
        this.squads.push(sq);
        this.squadById.set(sq.id, sq);
        total += n;
        if (owner === this.player) {
          this.stats.sent += n;
          if (ut === 'jinete') this.stats.jinetes += n;
          if (ut === 'caballero') this.stats.caballeros += n;
        }
        this.emit('send', { src: s, dst, n, owner, ut, sq });
      }
      return total;
    }

    upgrade(owner, id) {
      if (this.over) return false;
      const b = this.buildings[id];
      if (!b || b.owner !== owner || !b.canUpgrade()) return false;
      b.troops -= b.upCost;
      b.level++;
      b.upT = this.time;
      if (owner === this.player) {
        this.stats.upgrades++;
        const maxed = this.buildings.filter((x) => x.owner === owner && x.level === x.maxLevel).length;
        if (maxed > this.stats.maxLevelNow) this.stats.maxLevelNow = maxed;
      }
      this.emit('upgrade', { b, owner });
      return true;
    }

    canCast(key) {
      return this.magic && this.spells.indexOf(key) >= 0 && this.mana >= FF.SPELLS[key].cost && !this.over;
    }

    validSpellTarget(key, target) {
      const sp = FF.SPELLS[key];
      if (sp.target === 'area') return target && typeof target.x === 'number';
      const b = this.buildings[target];
      if (!b) return false;
      if (sp.target === 'own') return b.owner === this.player;
      if (key === 'sopor') return b.owner !== this.player && b.owner !== 0;
      return b.owner !== this.player;
    }

    cast(key, target) {
      if (!this.canCast(key) || !this.validSpellTarget(key, target)) return false;
      const sp = FF.SPELLS[key];
      const t = this.time, P = this.player;
      let x = 0, y = 0, b = null;
      if (sp.target === 'area') { x = target.x; y = target.y; }
      else { b = this.buildings[target]; x = b.x; y = b.y; }
      switch (key) {
        case 'rayo': {
          const k = Math.min(b.troops, Math.max(5, Math.ceil(b.troops * 0.5)));
          b.troops -= k; b.hitT = t;
          break;
        }
        case 'escudo': b.shieldUntil = t + sp.dur; break;
        case 'sopor': b.sleepUntil = t + sp.dur; break;
        case 'ventisca': {
          const r2 = sp.radius * sp.radius;
          const p = {};
          this.squads.forEach((sq) => {
            if (sq.owner === P || sq.count <= 0) return;
            for (let k = sq.k0; k < sq.k0 + sq.count; k += Math.max(1, Math.floor(sq.count / 6))) {
              const d = sq.posOf(k); if (d < 0) continue;
              sq.route.at(d, p);
              if (U.dist2(p.x, p.y, x, y) < r2) { sq.frozenUntil = t + sp.dur; break; }
            }
          });
          this.buildings.forEach((bb) => {
            if (bb.owner !== P && U.dist2(bb.x, bb.y, x, y) < r2) bb.iceUntil = t + sp.dur;
          });
          break;
        }
        case 'meteoro': {
          this.delayed.push({ at: t + 0.75, fn: () => this._meteor(x, y) });
          break;
        }
      }
      this.mana -= sp.cost;
      this.stats.spells++;
      this.stats.spellSet[key] = true;
      this.stats.usedMagic = true;
      this.emit('spell', { key, x, y, b });
      return true;
    }

    _meteor(x, y) {
      const sp = FF.SPELLS.meteoro, P = this.player, t = this.time;
      {
        {
          const r2 = sp.radius * sp.radius;
          const p = {};
          let killed = 0;
          this.squads.forEach((sq) => {
            if (sq.owner === P || sq.count <= 0) return;
            let inside = 0;
            for (let k = sq.k0; k < sq.k0 + sq.count; k++) {
              const d = sq.posOf(k); if (d < 0) continue;
              sq.route.at(d, p);
              if (U.dist2(p.x, p.y, x, y) < r2) inside++;
            }
            if (inside) killed += sq.kill(Math.ceil(inside * 0.6), false);
          });
          this.stats.killed += killed;
          this.buildings.forEach((bb) => {
            if (bb.owner !== P && U.dist2(bb.x, bb.y, x, y) < r2) { bb.troops *= 0.66; bb.hitT = t; }
          });
        }
      }
      this.emit('meteorHit', { x, y });
    }

    /* ---------- Bucle ---------- */
    update(dt) {
      if (this.over) return;
      this.time += dt;
      for (let i = this.delayed.length - 1; i >= 0; i--) {
        if (this.delayed[i].at <= this.time) { const d = this.delayed[i]; this.delayed.splice(i, 1); d.fn(); }
      }
      this._buildings(dt);
      this._towers(dt);
      this._arrows(dt);
      this._clashes(dt);
      this._squads(dt);
      for (let i = 0; i < this.ais.length; i++) this.ais[i].update(dt);
      if (this.magic) this.mana = Math.min(FF.MANA.max, this.mana + FF.MANA.regen * dt);
      this.endCheckT -= dt;
      if (this.endCheckT <= 0) { this.endCheckT = 0.25; this._checkEnd(); }
    }

    _buildings(dt) {
      const t = this.time, P = this.player, aiProd = this.aiParams.prod;
      for (let i = 0; i < this.buildings.length; i++) {
        const b = this.buildings[i];
        const st = FF.bstat(b.type, b.level);
        const cap = st.cap;
        if (b.troops > cap) {
          const over = b.troops - cap;
          b.troops -= Math.min(over, (0.6 + over * 0.04) * dt);
        } else if (b.owner !== 0 && st.prod && b.sleepUntil < t && b.iceUntil < t) {
          const rate = b.owner === P ? st.prod : st.prod * aiProd;
          const add = Math.min(rate * dt, cap - b.troops);
          if (add > 0) {
            b.troops += add;
            if (b.owner === P) this.stats.produced += add;
          }
        }
        if (b.owner === P && b.troops > this.stats.maxInBuilding) this.stats.maxInBuilding = b.troops;
      }
    }

    _towers(dt) {
      const t = this.time;
      const p = {};
      for (let i = 0; i < this.buildings.length; i++) {
        const b = this.buildings[i];
        if (b.type !== 'torre' || b.troops < 1 || b.sleepUntil > t || b.iceUntil > t) continue;
        b.fireCD -= dt;
        if (b.fireCD > 0) continue;
        const st = b.stat;
        const r2 = st.range * st.range;
        let best = null, bestK = 0, bd = r2, bx = 0, by = 0;
        for (let s = 0; s < this.squads.length; s++) {
          const sq = this.squads[s];
          if (sq.owner === b.owner || sq.count <= 0) continue;
          /* descarte rápido usando la cabeza */
          const fp = sq.frontPos();
          if (fp < -40) continue;
          sq.route.at(Math.max(0, fp), p);
          const span = (sq.count / sq.u.rowW) * sq.u.rowSp + st.range;
          if (U.dist2(p.x, p.y, b.x, b.y) > span * span) continue;
          const step = Math.max(1, Math.floor(sq.count / 8));
          for (let k = sq.k0; k < sq.k0 + sq.count; k += step) {
            const d = sq.posOf(k);
            if (d < 0 || d > sq.len) continue;
            sq.route.at(d, p);
            const d2 = U.dist2(p.x, p.y, b.x, b.y);
            if (d2 < bd) { bd = d2; best = sq; bestK = k; bx = p.x; by = p.y; }
          }
        }
        if (best) {
          const fly = 0.25 + Math.sqrt(bd) / 700;
          const moving = best.frozenUntil < t && !best.engaged;
          const lead = moving ? best.u.speed * fly : 0;
          best.route.at(Math.min(best.len, best.posOf(bestK) + lead), p);
          this.arrows.push({ id: this.nextId++, sx: b.x, sy: b.y - 50, tx: p.x, ty: p.y, t: 0, dur: fly, sq: best.id, owner: b.owner, tower: b.id, dmg: st.dmg || 1, lvl: b.level });
          b.fireCD = (1 / st.rate) * (0.85 + 0.3 * this.rng());
          this.emit('arrow', { b });
        } else {
          b.fireCD = 0.12;
        }
      }
    }

    _arrows(dt) {
      const P = this.player;
      for (let i = this.arrows.length - 1; i >= 0; i--) {
        const a = this.arrows[i];
        a.t += dt;
        if (a.t < a.dur) continue;
        this.arrows.splice(i, 1);
        const sq = this.squadById.get(a.sq);
        if (!sq || sq.count <= 0) continue;
        if (sq.u.evade && this.rng() < sq.u.evade) { this.emit('miss', { x: a.tx, y: a.ty }); continue; }
        let dmg = a.dmg || 1, kills = 0;
        while (dmg > 0 && sq.count > 0) {
          dmg--; sq.dmg += 1;
          if (sq.dmg >= sq.u.hp) {
            sq.dmg -= sq.u.hp;
            sq.kill(1, false); kills++;
            if (sq.owner === P) this.stats.lost++;
            if (a.owner === P) { this.stats.killed++; this.stats.towerKills++; }
          }
        }
        if (kills) this.emit('die', { x: a.tx, y: a.ty, owner: sq.owner, ut: sq.ut, n: kills, lvl: a.lvl });
        else this.emit('ding', { x: a.tx, y: a.ty });
      }
    }

    _clashes(dt) {
      const sqs = this.squads;
      for (let i = 0; i < sqs.length; i++) sqs[i].engaged = false;
      if (sqs.length < 2) return;
      const byRoad = new Map();
      for (let i = 0; i < sqs.length; i++) {
        const sq = sqs[i];
        if (sq.count <= 0) continue;
        const fp = sq.frontPos();
        if (fp < 2 || fp >= sq.len - 2) continue;
        const seg = sq.route.segAt(fp);
        const sOn = seg.dir > 0 ? fp - seg.d0 : seg.road.len - (fp - seg.d0);
        let arr = byRoad.get(seg.road.id);
        if (!arr) { arr = []; byRoad.set(seg.road.id, arr); }
        arr.push({ sq, s: sOn, dir: seg.dir });
      }
      const P = this.player;
      byRoad.forEach((arr) => {
        if (arr.length < 2) return;
        for (let i = 0; i < arr.length; i++) {
          for (let j = i + 1; j < arr.length; j++) {
            const A = arr[i], B = arr[j];
            if (A.sq.owner === B.sq.owner || A.dir === B.dir) continue;
            const pos = A.dir > 0 ? A : B, neg = A.dir > 0 ? B : A;
            if (pos.s < neg.s - 6) continue;
            if (pos.s > neg.s + 30) continue; /* ya se cruzaron: ignorar */
            const a = pos.sq, b = neg.sq;
            if (a.count <= 0 || b.count <= 0) continue;
            a.engaged = true; b.engaged = true;
            a.clashT += dt;
            if (a.clashT >= 0.09) {
              a.clashT = 0;
              a.dmg += b.u.str; b.dmg += a.u.str;
              let ka = 0, kb = 0;
              while (a.dmg >= a.u.hp && a.count > 0) { a.dmg -= a.u.hp; ka += a.kill(1, true); }
              while (b.dmg >= b.u.hp && b.count > 0) { b.dmg -= b.u.hp; kb += b.kill(1, true); }
              if (a.owner === P) { this.stats.lost += ka; } else if (b.owner === P) this.stats.killed += ka;
              if (b.owner === P) { this.stats.lost += kb; } else if (a.owner === P) this.stats.killed += kb;
              const pt = a.route.at(Math.max(0, a.frontPos() + 3));
              this.emit('clash', { x: pt.x, y: pt.y, a: a.owner, b: b.owner });
            }
          }
        }
      });
    }

    _squads(dt) {
      const t = this.time;
      for (let i = this.squads.length - 1; i >= 0; i--) {
        const sq = this.squads[i];
        if (sq.count > 0 && !sq.engaged && sq.frozenUntil < t) sq.dist += sq.u.speed * dt;
        /* revisar puntos de paso: si un nodo intermedio dejó de ser nuestro, se ataca */
        const wps = sq.route.waypoints;
        while (sq.count > 0 && sq.wp < wps.length) {
          const w = wps[sq.wp];
          const fp = sq.frontPos();
          if (fp < w.d - 26) break;
          if (this.buildings[w.node].owner !== sq.owner) {
            sq.len = w.d; sq.dst = w.node;
            sq.wp = wps.length;
            this.emit('redirect', { sq, b: this.buildings[w.node] });
            break;
          }
          if (fp >= w.d) sq.wp++; else break;
        }
        /* llegadas */
        let guard = 0;
        while (sq.count > 0 && sq.posOf(sq.k0) >= sq.len && guard++ < 200) {
          this._arrive(sq, this.buildings[sq.dst]);
          sq.k0++; sq.count--;
        }
        if (sq.count <= 0) {
          this.squads.splice(i, 1);
          this.squadById.delete(sq.id);
        }
      }
    }

    _arrive(sq, b) {
      const t = this.time, P = this.player;
      if (b.owner === sq.owner) { b.troops += 1; return; }
      if (b.shieldUntil > t) {
        if (sq.owner === P) this.stats.lost++;
        this.emit('shieldBlock', { b });
        return;
      }
      const dmg = sq.u.str / b.def.def[sq.ut];
      b.troops -= dmg;
      b.hitT = t;
      if (sq.owner === P) this.stats.lost++;
      if (b.owner === P) this.stats.killed++;
      this.emit('impact', { b, owner: sq.owner });
      if (b.troops < -1e-6) this._capture(b, sq.owner);
    }

    _capture(b, owner) {
      const prev = b.owner, P = this.player;
      b.owner = owner;
      b.lostLevel = b.level;
      b.level = 1;
      b.troops = 1;
      b.sleepUntil = -1; b.shieldUntil = -1; b.iceUntil = -1;
      b.capT = this.time; b.fireCD = 0.5;
      if (owner === P) {
        this.stats.captured++;
        if (this.magic) this.mana = Math.min(FF.MANA.max, this.mana + FF.MANA.capture);
      }
      if (prev === P) this.stats.lostBuildings++;
      this.emit('capture', { b, from: prev, to: owner });
    }

    _checkEnd() {
      const alive = {};
      for (let i = 0; i < this.buildings.length; i++) { const o = this.buildings[i].owner; if (o) alive[o] = true; }
      for (let i = 0; i < this.squads.length; i++) alive[this.squads[i].owner] = true;
      const P = this.player;
      const pb = this.buildings.filter((b) => b.owner === P).length;
      if (pb > 0 && pb < this.stats.minBuildings) this.stats.minBuildings = pb;
      if (pb > (this.stats.peak || 0)) this.stats.peak = pb;
      if (pb === 1 && (this.stats.peak || 0) >= 4) this.stats.comeback = true;
      this.factions.forEach((f) => {
        if (this.alive[f] && !alive[f]) { this.alive[f] = false; this.emit('eliminated', { f }); }
      });
      if (!alive[P]) return this._end(false);
      if (this.factions.every((f) => f === P || !alive[f])) return this._end(true);
    }

    _end(win) {
      this.over = true;
      const P = this.player;
      let troops = 0;
      this.buildings.forEach((b) => { if (b.owner === P) troops += b.troops; });
      this.squads.forEach((s) => { if (s.owner === P) troops += s.count; });
      this.result = { win, time: this.time, troops: Math.floor(troops), stats: this.stats };
      this.emit('end', { win });
    }

    /* poder total por facción (para la barra de dominio) */
    power() {
      const p = {};
      this.factions.forEach((f) => { p[f] = 0; });
      this.buildings.forEach((b) => { if (b.owner) p[b.owner] = (p[b.owner] || 0) + b.troops + 4; });
      this.squads.forEach((s) => { p[s.owner] = (p[s.owner] || 0) + s.count * s.u.str; });
      return p;
    }
  }
  FF.Game = Game;
})(globalThis.FF = globalThis.FF || {});
