/* Feudo a Feudo — tutorial guiado en los primeros niveles y al estrenar edificios o reliquias */
(function (FF) {
  'use strict';
  const U = FF.U;

  const own = (g) => g.buildings.filter((b) => b.owner === g.player);
  const nearestOf = (g, from, pred) => {
    let best = null, bd = Infinity;
    g.buildings.forEach((b) => { if (pred(b)) { const d = U.dist(b.x, b.y, from.x, from.y); if (d < bd) { bd = d; best = b; } } });
    return best;
  };
  const firstOwn = (g) => own(g)[0] || g.buildings[0];
  const ofType = (t) => (g) => g.buildings.find((b) => b.type === t && b.owner !== g.player) || g.buildings.find((b) => b.type === t);

  const T = {
    basico: [
      { text: 'Ésta es tu <b>aldea</b>: la del tejado azul. <b>Tócala</b> para seleccionarla.', at: firstOwn, done: (g, t, app) => app.input.selected.size > 0 || t.flags.sent },
      { text: 'Ahora toca la <b>aldea gris</b> de al lado: tus edificios seleccionados enviarán <b>la mitad</b> de sus soldados.', at: (g) => nearestOf(g, firstOwn(g), (b) => b.owner === 0), done: (g, t) => t.flags.sent },
      { text: 'Si llegan <b>más atacantes que defensores</b>, el edificio será tuyo y empezará a entrenar soldados para ti.', at: (g) => nearestOf(g, firstOwn(g), (b) => b.owner === 0) || firstOwn(g), done: (g) => g.stats.captured >= 1 },
      { text: '¡Bien hecho! Tus edificios <b>siguen seleccionados</b>: toca otro objetivo para mandar otra oleada, o toca el suelo para soltarlos. Expulsa al <b>Duque Bermejo</b> (rojo).', at: (g) => g.buildings.find((b) => b.owner === 2), done: (g, t) => t.t > 10 }
    ],
    mejoras: [
      { text: 'Cuando un edificio tuyo reúne tropas suficientes aparece una <b>flecha dorada ▲</b>. Tócala para <b>mejorarlo</b>: cuesta la mitad de su capacidad.', at: firstOwn, done: (g, t) => g.stats.upgrades >= 1 || t.t > 30 },
      { text: 'Cada mejora le da una <b>estrella</b>: más capacidad y más producción. El mejor momento para mejorar es cuando está <b>lleno</b>.', done: (g, t) => t.t > 8 },
      { text: 'Ojo: un edificio conquistado <b>pierde todas sus estrellas</b>, lo tomes tú o te lo quiten. Defiende bien lo que mejoras.', done: (g, t) => t.t > 9 }
    ],
    multi: [
      { text: 'Para atacar con <b>varios edificios</b> a la vez: <b>tócalos uno a uno</b> para seleccionarlos y después toca el objetivo.', at: (g) => own(g)[1] || firstOwn(g), done: (g, t) => t.flags.multi || t.t > 35 },
      { text: 'Para <b>reforzar</b> uno de tus edificios, haz <b>doble toque</b> sobre él: los seleccionados le enviarán la mitad de sus tropas.', at: firstOwn, done: (g, t) => t.flags.reinforce || t.t > 16 },
      { text: 'Atajos: el botón ⚔ o la tecla <kbd>A</kbd> seleccionan todos tus edificios. Toca el suelo para soltar la selección.', done: (g, t) => t.flags.selectAll || t.t > 9 },
      { text: 'El <b>Castillo</b> del centro produce más deprisa y sus murallas resisten mejor a la infantería. ¡Hazlo tuyo!', at: ofType('castillo'), done: (g, t) => t.t > 9 }
    ],
    magia: [
      { text: 'Las <b>atalayas</b> lanzan venablos a toda tropa enemiga que pase cerca, y con tres estrellas sus lanzas atraviesan a dos soldados. Mantén pulsado (o pasa el puntero) sobre una para ver su alcance.', at: ofType('torre'), done: (g, t) => t.t > 11 },
      { magic: true, text: 'Nueva reliquia: <b>Rayo</b>. Tócala en la barra de abajo y después toca un edificio enemigo para fulminar la mitad de su guarnición.', done: (g, t) => t.flags.spell || t.t > 22 }
    ],
    establo: [
      { text: 'Las tropas que salen de un <b>Establo</b> montan a caballo: corren el doble y esquivan flechas. Envía refuerzos al establo y ataca desde allí.', at: ofType('establo'), done: (g, t) => t.t > 11 },
      { magic: true, text: 'Nueva reliquia: <b>Égida</b>. Vuelve invulnerable uno de tus edificios durante 10 segundos.', done: (g, t) => t.flags.spell || t.t > 12 }
    ],
    herreria: [
      { text: 'Las tropas que salen de una <b>Herrería</b> son caballeros: golpean y aguantan el doble e ignoran las murallas de los castillos.', at: ofType('herreria'), done: (g, t) => t.t > 11 },
      { magic: true, text: 'Nueva reliquia: <b>Sopor</b>. Duerme un edificio enemigo: ni produce, ni envía tropas, ni dispara.', done: (g, t) => t.flags.spell || t.t > 12 }
    ],
    ventisca: [
      { magic: true, text: 'Nueva reliquia: <b>Ventisca</b>. Congela a las tropas enemigas de una zona durante 6 segundos: perfecta para defender un puente.', done: (g, t) => t.flags.spell || t.t > 12 }
    ],
    meteoro: [
      { magic: true, text: 'Nueva reliquia: <b>Meteoro</b>. Elige una zona y una roca ardiente arrasará a las tropas enemigas que haya en ella.', done: (g, t) => t.flags.spell || t.t > 12 }
    ]
  };

  class Tut {
    constructor(app, key) {
      this.app = app;
      const g = app.game;
      this.steps = (T[key] || []).filter((s) => !s.magic || g.magic);
      this.i = -1; this.t = 0; this.flags = {};
      this.box = UIel('div', 'tut parch hidden');
      this.arrow = UIel('div', 'tut-arrow hidden', '<svg viewBox="0 0 24 24"><path d="M12 23L3 12h5.5V1h7v11H21z" fill="#ffd24a" stroke="#4a2a06" stroke-width="1.4"/></svg>');
      document.getElementById('app').appendChild(this.arrow);
      document.getElementById('app').appendChild(this.box);
      this.next();
    }
    flag(k) { this.flags[k] = true; }
    next() {
      this.i++; this.t = 0;
      const s = this.steps[this.i];
      if (!s) { this.destroy(); return; }
      this.box.innerHTML = '<div>' + s.text + '</div>';
      const acts = UIel('div', 'acts');
      const ok = UIel('button', 'btn small wood', this.i < this.steps.length - 1 ? 'Siguiente' : 'Entendido');
      ok.addEventListener('pointerdown', (e) => e.stopPropagation());
      ok.addEventListener('click', (e) => { e.stopPropagation(); FF.Audio.play('click'); this.next(); });
      const skip = UIel('button', 'btn small wood', 'Saltar');
      skip.addEventListener('pointerdown', (e) => e.stopPropagation());
      skip.addEventListener('click', (e) => { e.stopPropagation(); this.destroy(); });
      if (this.i < this.steps.length - 1) acts.appendChild(skip);
      acts.appendChild(ok);
      this.box.appendChild(acts);
      this.box.classList.remove('hidden');
      this.box.style.animation = 'none'; void this.box.offsetWidth; this.box.style.animation = '';
      this.place();
    }
    place() {
      const s = this.steps[this.i];
      if (!s) return;
      const g = this.app.game, r = this.app.renderer;
      const tgt = s.at ? s.at(g) : null;
      const W = window.innerWidth, H = window.innerHeight;
      const bw = this.box.offsetWidth || 300, bh = this.box.offsetHeight || 100;
      if (tgt) {
        const p = r.toScreen(tgt.x, tgt.y - 62);
        this.arrow.classList.remove('hidden');
        this.arrow.style.left = p.x + 'px'; this.arrow.style.top = p.y + 'px';
        /* elegir la posición del bocadillo que tape menos edificios */
        const c = r.toScreen(tgt.x, tgt.y - 20);
        const cands = [
          [p.x - bw / 2, p.y - bh - 64], [c.x + 70, c.y - bh / 2], [c.x - bw - 70, c.y - bh / 2],
          [c.x + 60, c.y - bh - 40], [c.x - bw - 60, c.y - bh - 40], [p.x - bw / 2, c.y + 70]
        ];
        const pts = g.buildings.map((b) => { const q = r.toScreen(b.x, b.y - 20); q.w = b.owner === g.player ? 6 : b === tgt ? 8 : 1; return q; });
        let best = null, bs = Infinity;
        cands.forEach((cd, i) => {
          const x = U.clamp(cd[0], 8, W - bw - 8), y = U.clamp(cd[1], 56, H - bh - 90);
          let sc = i * 0.15 + (Math.abs(x - cd[0]) + Math.abs(y - cd[1])) / 200;
          pts.forEach((q) => { if (q.x > x - 34 && q.x < x + bw + 34 && q.y > y - 40 && q.y < y + bh + 50) sc += q.w; });
          if (sc < bs) { bs = sc; best = [x, y]; }
        });
        this.box.style.left = best[0] + 'px'; this.box.style.top = best[1] + 'px';
      } else {
        this.arrow.classList.add('hidden');
        this.box.style.left = Math.max(8, (W - bw) / 2) + 'px';
        this.box.style.top = Math.max(60, H - bh - 140) + 'px';
      }
    }
    update(dt) {
      const s = this.steps[this.i];
      if (!s) return;
      this.t += dt;
      if (s.done(this.app.game, this, this.app) && this.t > 0.6) { this.next(); return; }
      this.place();
    }
    destroy() {
      this.box.remove(); this.arrow.remove();
      this.steps = []; this.dead = true;
    }
  }
  function UIel(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  FF.Tut = Tut;
})(globalThis.FF = globalThis.FF || {});
