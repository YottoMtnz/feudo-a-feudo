/* Feudo a Feudo — control con ratón, táctil y teclado */
(function (FF) {
  'use strict';
  const U = FF.U;

  class Input {
    constructor(app) {
      this.app = app;
      this.cv = app.cv;
      this.reset();
      const cv = this.cv;
      cv.addEventListener('pointerdown', (e) => this.onDown(e));
      cv.addEventListener('pointermove', (e) => this.onMove(e));
      cv.addEventListener('pointerup', (e) => this.onUp(e));
      cv.addEventListener('pointercancel', () => this.cancel());
      cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !this.down) { this.hover = null; this.hoverTower = null; } });
      cv.addEventListener('contextmenu', (e) => e.preventDefault());
      window.addEventListener('keydown', (e) => this.onKey(e));
    }

    reset() {
      this.selected = new Set();
      this.inspect = null;
      this.pointer = null;
      this.hover = null; this.hoverTower = null;
      this.dragging = false; this.dragSources = [];
      this.down = null; this.targeting = null;
      this.preview = []; this.reachable = true; this.prevKey = ''; this.prevT = 0;
      this.lastTap = { id: -1, t: 0 };
      clearTimeout(this.lp);
    }

    get game() { return this.app.game; }
    active() { const g = this.game; return g && !g.over && !this.app.paused && !this.app.ending && !FF.UI.modalOpen(); }

    hit(p, touch) {
      const g = this.game; if (!g || !p) return null;
      const s = this.app.renderer.s;
      const k = Math.max(1, (touch ? 30 : 22) / (40 * s));
      let best = null, bd = 1;
      for (const b of g.buildings) {
        const dx = (p.x - b.x) / (38 * k), dy = (p.y - (b.y - 12)) / (44 * k);
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = b.id; }
      }
      return best;
    }

    ui() {
      const g = this.game;
      let ht = this.hoverTower;
      if (ht == null && g && this.inspect != null && g.buildings[this.inspect].type === 'torre') ht = this.inspect;
      if (ht == null && g && this.selected.size === 1) { const sid = this.selected.values().next().value; if (g.buildings[sid].type === 'torre') ht = sid; }
      return { selected: this.selected, hover: this.hover, hoverTower: ht, dragging: this.dragging, dragSources: this.dragSources,
        pointer: this.pointer, targeting: this.targeting, preview: this.preview, reachable: this.reachable };
    }

    onDown(e) {
      FF.Audio.init();
      if (!this.active()) return;
      e.preventDefault();
      const r = this.app.renderer;
      const p = r.toWorld(e.clientX, e.clientY);
      this.pointer = p;
      const touch = e.pointerType !== 'mouse';
      if (e.button === 2) {
        const id = this.hit(p, touch);
        const g = this.game;
        if (this.targeting) { this.targeting = null; return; }
        if (id != null && g.buildings[id].owner === g.player) this.upgrade(id);
        else { this.selected.clear(); this.inspect = null; }
        return;
      }
      try { this.cv.setPointerCapture(e.pointerId); } catch (er) { /* */ }
      if (!this.targeting && r.upButtons) {
        for (const ub of r.upButtons) {
          if (U.dist(p.x, p.y, ub.x, ub.y) <= ub.r * (touch ? 1.8 : 1.1)) {
            this.upgrade(ub.id);
            this.down = { consumed: true };
            return;
          }
        }
      }
      const id = this.hit(p, touch);
      this.hover = id;
      this.down = { id, x: e.clientX, y: e.clientY, t: performance.now(), shift: e.shiftKey || e.ctrlKey || e.metaKey, moved: false, touch };
      clearTimeout(this.lp);
      if (touch && id != null && !this.targeting) {
        this.lp = setTimeout(() => this.longPress(id), 430);
      }
    }

    onMove(e) {
      const g = this.game; if (!g) return;
      const r = this.app.renderer;
      const p = r.toWorld(e.clientX, e.clientY);
      this.pointer = p;
      const touch = e.pointerType !== 'mouse';
      const id = this.hit(p, touch);
      this.hover = id;
      this.hoverTower = id != null && g.buildings[id].type === 'torre' ? id : null;
      if (this.hoverTower == null && this.selected.size === 1) {
        const sid = this.selected.values().next().value;
        if (g.buildings[sid].type === 'torre') this.hoverTower = sid;
      }
      const d = this.down;
      if (d && !d.consumed && this.active()) {
        if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > (d.touch ? 14 : 9)) {
          d.moved = true; clearTimeout(this.lp);
          if (d.id != null && g.buildings[d.id].owner === g.player && !this.targeting) {
            this.dragging = true;
            this.dragSources = this.selected.has(d.id) && this.selected.size > 1 ? Array.from(this.selected) : [d.id];
          }
        }
        if (this.dragging && id != null && g.buildings[id].owner === g.player && this.dragSources.indexOf(id) < 0) {
          const b = g.buildings[id];
          const dx = (p.x - b.x) / 30, dy = (p.y - (b.y - 12)) / 34;
          if (dx * dx + dy * dy < 1) { this.dragSources.push(id); FF.Audio.play('select'); }
        }
      }
    }

    onUp(e) {
      const d = this.down;
      clearTimeout(this.lp);
      this.down = null;
      if (!d || d.consumed || !this.active()) { this.dragging = false; this.dragSources = []; return; }
      const r = this.app.renderer;
      const p = r.toWorld(e.clientX, e.clientY);
      const touch = e.pointerType !== 'mouse';
      const id = this.hit(p, touch);
      if (this.targeting) { this.castAt(p, id); return; }
      if (this.dragging) {
        this.dragging = false;
        const src = this.dragSources.filter((s) => s !== id);
        this.dragSources = [];
        this.selected = new Set(src);
        if (id != null && src.length) this.send(src, id, true);
        this.preview = [];
        if (touch) { this.hover = null; this.hoverTower = null; }
        return;
      }
      this.tap(d.id);
      if (touch) { this.hover = null; this.hoverTower = null; }
    }

    cancel() { clearTimeout(this.lp); this.down = null; this.dragging = false; this.dragSources = []; }

    longPress(id) {
      const d = this.down;
      if (!d || d.moved || !this.active()) return;
      const g = this.game;
      d.consumed = true;
      this.inspect = id;
      this.hoverTower = g.buildings[id].type === 'torre' ? id : null;
      FF.Audio.play('click');
      try { navigator.vibrate && navigator.vibrate(12); } catch (e) { /* */ }
    }

    /* Un clic en un edificio propio lo selecciona (o lo suelta). Un clic en un edificio enemigo o neutral
       envía la mitad de las tropas de todos los seleccionados. Doble clic en un edificio propio: refuerzos. */
    tap(id) {
      const g = this.game, P = g.player;
      const now = performance.now();
      if (id == null) { this.selected.clear(); this.inspect = null; this.lastTap = { id: -1, t: 0 }; return; }
      const b = g.buildings[id];
      if (b.owner === P) {
        this.inspect = null;
        const lt = this.lastTap;
        if (lt.id === id && now - lt.t < 360) {
          /* doble clic: deshacer el cambio del primer clic y reforzar este edificio */
          this.lastTap = { id: -1, t: 0 };
          if (lt.was) this.selected.add(id); else this.selected.delete(id);
          const src = Array.from(this.selected).filter((s) => s !== id);
          if (src.length) { this.send(src, id); this.app.flag('reinforce'); }
          else {
            FF.Audio.play('denied');
            this.app.renderer.text(b.x, b.y - 64, 'Selecciona antes de dónde salen', '#ffe0a0', 12, 1.3);
          }
          return;
        }
        this.lastTap = { id, t: now, was: this.selected.has(id) };
        if (this.selected.has(id)) this.selected.delete(id);
        else { this.selected.add(id); FF.Audio.play('select'); }
        if (this.selected.size >= 2) this.app.flag('multiSel');
        return;
      }
      this.lastTap = { id: -1, t: 0 };
      if (this.selected.size) { this.send(Array.from(this.selected), id); return; }
      this.inspect = id;
      FF.Audio.play('click');
    }

    send(src, dst, keep) {
      const g = this.game, P = g.player;
      const n = g.send(P, src, dst);
      const b = g.buildings[dst];
      if (n > 0) {
        if (src.filter((s) => g.buildings[s].owner === P).length >= 2) this.app.flag('multi');
        this.app.flag('sent');
        this.app.renderer.pulse(src);
      } else {
        FF.Audio.play('denied');
        const reach = src.some((s) => g.findPath(s, dst, P));
        const enough = src.some((s) => g.buildings[s].troops >= 2);
        this.app.renderer.text(b.x, b.y - 60, !reach ? '¡Sin camino!' : !enough ? 'Faltan tropas' : 'No se puede', '#ffb0a0', 13, 1.1);
      }
      this.preview = [];
    }

    upgrade(id) {
      const g = this.game;
      if (g.upgrade(g.player, id)) return true;
      const b = g.buildings[id];
      FF.Audio.play('denied');
      this.app.renderer.text(b.x, b.y - 60, b.level >= b.maxLevel ? 'Nivel máximo' : 'Necesitas ' + b.upCost, '#ffe0a0', 12, 1);
      return false;
    }

    selectAll() {
      const g = this.game; if (!g) return;
      this.selected.clear();
      g.buildings.forEach((b) => { if (b.owner === g.player) this.selected.add(b.id); });
      this.inspect = null;
      FF.Audio.play('select');
      this.app.flag('selectAll');
    }

    toggleSpell(k) {
      const g = this.game; if (!g || !this.active()) return;
      if (this.targeting === k) { this.targeting = null; return; }
      if (!g.magic) return;
      if (!g.canCast(k)) {
        FF.Audio.play('denied');
        FF.UI.toast('Falta maná para ' + FF.SPELLS[k].name + ' (' + FF.SPELLS[k].cost + ')', '', 1600);
        return;
      }
      this.targeting = k;
      this.selected.clear();
      FF.Audio.play('select');
    }

    castAt(p, id) {
      const g = this.game, k = this.targeting;
      const sp = FF.SPELLS[k];
      const target = sp.target === 'area' ? { x: p.x, y: p.y } : id;
      if (target != null && g.cast(k, target)) {
        this.targeting = null;
        this.app.flag('spell');
        return;
      }
      FF.Audio.play('denied');
      if (id != null || sp.target === 'area') FF.UI.toast(sp.target === 'own' ? 'Elige uno de tus edificios' : 'Elige un edificio enemigo', '', 1400);
    }

    onKey(e) {
      const app = this.app;
      if (!app.game || app.ending) return;
      if (FF.UI.modalOpen()) {
        if (e.key === 'Escape' && FF.UI.modalClose) { e.preventDefault(); FF.UI.modalClose(); }
        return;
      }
      const k = e.key.toLowerCase();
      if (k === 'escape') {
        e.preventDefault();
        if (this.targeting) this.targeting = null;
        else if (this.selected.size || this.inspect != null) { this.selected.clear(); this.inspect = null; }
        else app.openPause();
      } else if (k === ' ' || k === 'p') { e.preventDefault(); app.openPause(); }
      else if (k === 'a') this.selectAll();
      else if (k === 'u') {
        const ids = this.selected.size ? Array.from(this.selected) : (this.hover != null ? [this.hover] : []);
        ids.forEach((id) => { if (this.game.buildings[id].owner === this.game.player) this.upgrade(id); });
      } else if (k === 'f') app.toggleSpeed();
      else if (k >= '1' && k <= '5') {
        const sp = this.game.spells[+k - 1];
        if (sp) this.toggleSpell(sp);
      } else if (k === 'h') { app.setPaused(true); FF.UI.help(() => { FF.UI.closeModal(); app.setPaused(false); }); }
    }

    /* actualizar rutas previstas */
    update(dt) {
      const g = this.game; if (!g) return;
      if (this.selected.size) {
        for (const id of Array.from(this.selected)) if (g.buildings[id].owner !== g.player) this.selected.delete(id);
      }
      if (this.dragging) this.dragSources = this.dragSources.filter((id) => g.buildings[id].owner === g.player);
      const src = this.dragging ? this.dragSources : Array.from(this.selected);
      const tgt = this.hover;
      const own = tgt != null && g.buildings[tgt].owner === g.player && !this.dragging;
      if (!FF.Save.data.settings.paths || tgt == null || own || !src.length || this.targeting) { this.preview = []; this.reachable = true; return; }
      this.prevT -= dt;
      const key = src.join(',') + '>' + tgt;
      if (key === this.prevKey && this.prevT > 0) return;
      this.prevKey = key; this.prevT = 0.3;
      this.preview = [];
      src.slice(0, 8).forEach((s) => {
        if (s === tgt) return;
        const path = g.findPath(s, tgt, g.player);
        if (path) this.preview.push(new FF.Route(g.map, path));
      });
      this.reachable = this.preview.length > 0 || src.every((s) => s === tgt);
    }
  }
  FF.Input = Input;
})(globalThis.FF = globalThis.FF || {});
