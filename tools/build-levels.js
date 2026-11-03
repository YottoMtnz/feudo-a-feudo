#!/usr/bin/env node
/* Feudo a Feudo — genera los 45 niveles de la campaña, los valida con simulaciones IA contra IA
   y calcula los tiempos de medalla. Escribe js/core/levels.js
   Uso:  node tools/build-levels.js            (todo)
         node tools/build-levels.js w2l5       (sólo un nivel, informe detallado) */
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
['util', 'data', 'map', 'game', 'ai', 'mapgen'].forEach((f) => require(path.join(ROOT, 'js/core', f + '.js')));
const FF = globalThis.FF;

/* ---------- niveles tutoriales hechos a mano ---------- */
const HAND = {
  w1l1: {
    nodes: [[250, 380, 'aldea', 1, 1, 10], [470, 290, 'aldea', 1, 0, 3], [470, 480, 'aldea', 1, 0, 4], [720, 385, 'aldea', 1, 0, 6], [985, 385, 'aldea', 1, 2, 5]],
    roads: [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4]],
    terrain: { islands: [], rivers: [], lakes: [{ x: 600, y: 590, rx: 70, ry: 34, a: 0.1, kind: 'water' }, { x: 1110, y: 175, rx: 54, ry: 30, a: -0.3, kind: 'water' }] },
    ai: { 2: 'expansivo' }, aiDelay: 30, aiSlow: 2.2
  },
  w1l2: {
    nodes: [[200, 365, 'aldea', 1, 1, 10], [385, 225, 'aldea', 1, 0, 4], [385, 505, 'aldea', 1, 0, 4], [605, 365, 'aldea', 2, 0, 10], [830, 225, 'aldea', 1, 0, 6], [830, 505, 'aldea', 1, 0, 6], [1065, 365, 'aldea', 2, 2, 10]],
    roads: [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [3, 5], [4, 6], [5, 6]],
    terrain: { islands: [], rivers: [], lakes: [{ x: 605, y: 160, rx: 64, ry: 34, a: 0, kind: 'water' }] },
    ai: { 2: 'constructor' }, aiDelay: 22, aiSlow: 1.7
  },
  w1l3: {
    nodes: [[175, 250, 'aldea', 1, 1, 8], [175, 485, 'aldea', 1, 1, 8], [380, 368, 'aldea', 1, 0, 5], [560, 205, 'aldea', 1, 0, 7], [560, 530, 'aldea', 1, 0, 7], [705, 368, 'castillo', 1, 0, 16], [865, 205, 'aldea', 1, 0, 8], [865, 530, 'aldea', 1, 0, 8], [1085, 368, 'castillo', 1, 2, 16]],
    roads: [[0, 2], [1, 2], [0, 1], [2, 3], [2, 4], [3, 5], [4, 5], [5, 8], [3, 6], [4, 7], [6, 8], [7, 8]],
    terrain: { islands: [], rivers: [], lakes: [] },
    ai: { 2: 'equilibrado' }, aiDelay: 14, aiSlow: 1.4
  }
};

/* ---------- especificación de la campaña ---------- */
const F = { valle: [2, 3, 5], islas: [2, 3, 5], desierto: [2, 5, 4], hielo: [5, 2, 4], volcan: [5, 3, 4] };
const C = (n, l) => ({ type: 'castillo', level: l || 1, troops: n });
const A = (n, l) => ({ type: 'aldea', level: l || 1, troops: n });

const CAMPAIGN = [
  /* ===== Mundo 1: Valle de Robledal ===== */
  { id: 'w1l1', name: 'Primeras Tierras', hand: true, tutorial: 'basico', desc: 'Toma las aldeas libres y expulsa al Duque Bermejo de tu valle.' },
  { id: 'w1l2', name: 'El Molino Viejo', hand: true, tutorial: 'mejoras', desc: 'Un edificio mejorado guarda más tropas y produce más rápido. Aprende a invertir.' },
  { id: 'w1l3', name: 'Cruce de Caminos', hand: true, tutorial: 'multi', feature: 'castillo', desc: 'Ataca desde varios edificios a la vez y conquista el castillo del cruce.' },
  { id: 'w1l4', name: 'La Atalaya del Roble', feature: 'torre', tutorial: 'magia', nodes: 11, enemies: 1, layout: 'scatter', specials: { torre: 1 }, player: C(16), enemy: A(12, 2), garrison: 0.9, density: 0.3, desc: 'Una atalaya vigila el centro del valle. Sus arqueros no perdonan a la infantería.' },
  { id: 'w1l5', name: 'Río Manso', nodes: 13, enemies: 1, layout: 'river', orient: 'v', bridges: 2, specials: { castillo: 1, torre: 1 }, player: C(18), enemy: C(18), garrison: 0.95, desc: 'Sólo dos puentes cruzan el río. Quien los controle, controlará el valle.' },
  { id: 'w1l6', name: 'Dos Señores', nodes: 14, enemies: 2, layout: 'scatter', specials: { castillo: 1, torre: 1 }, player: C(18), enemy: A(12, 2), garrison: 1, desc: 'La Condesa Áurea se une a la disputa. Que se debiliten entre ellos.' },
  { id: 'w1l7', name: 'Bosque Hondo', nodes: 16, enemies: 1, layout: 'scatter', specials: { castillo: 1, torre: 2 }, player: C(20), enemy: Object.assign(C(20), { extra: 1 }), garrison: 1, density: 0.25, desc: 'Caminos estrechos entre robles. El Duque ha reforzado sus fronteras.' },
  { id: 'w1l8', name: 'Puente de Piedra', nodes: 17, enemies: 2, layout: 'river', bridges: 3, specials: { castillo: 1, torre: 2 }, player: C(20), enemy: C(18), garrison: 1.05, desc: 'Atalayas custodian los puentes. Elige bien por dónde cruzar.' },
  { id: 'w1l9', name: 'Corona del Valle', nodes: 20, enemies: 2, layout: 'scatter', specials: { castillo: 2, torre: 2 }, fortress: { level: 3, troops: 40 }, player: C(22), enemy: C(20), garrison: 1.1, desc: 'La fortaleza del centro es la joya del valle. Tómala y el valle será tuyo.' },
  /* ===== Mundo 2: Archipiélago de Sal ===== */
  { id: 'w2l1', name: 'Bahía Tranquila', feature: 'establo', tutorial: 'establo', nodes: 12, enemies: 1, layout: 'islands', islands: 4, specials: { establo: 1, torre: 1 }, player: C(18), enemy: C(16), garrison: 0.95, desc: 'Los establos convierten a tus soldados en jinetes veloces. Pruébalos contra la atalaya.' },
  { id: 'w2l2', name: 'Muelles Viejos', nodes: 13, enemies: 1, layout: 'islands', islands: 4, specials: { torre: 2, establo: 1 }, player: C(18), enemy: Object.assign(C(18), { extra: 1 }), garrison: 1, desc: 'Puentes estrechos y atalayas en los muelles. La velocidad es tu aliada.' },
  { id: 'w2l3', name: 'La Isla del Faro', nodes: 15, enemies: 2, layout: 'islands', islands: 5, specials: { castillo: 1, torre: 1, establo: 1 }, player: C(20), enemy: C(18), garrison: 1, desc: 'Dos casas rivales se disputan el faro. Llega primero.' },
  { id: 'w2l4', name: 'Arrecife', nodes: 16, enemies: 1, layout: 'islands', islands: 5, extraBridges: 2, specials: { castillo: 1, torre: 2, establo: 1 }, player: C(22), enemy: Object.assign(C(20), { extra: 1 }), garrison: 1.0, desc: 'El Duque Bermejo domina medio archipiélago. Recupéralo isla a isla.' },
  { id: 'w2l5', name: 'Puentes Colgantes', nodes: 17, enemies: 2, layout: 'islands', islands: 6, specials: { castillo: 1, torre: 2, establo: 2 }, player: C(20), enemy: C(18), garrison: 1.05, desc: 'Cada isla es una fortaleza natural. Los puentes son la única puerta.' },
  { id: 'w2l6', name: 'Mar de Bruma', nodes: 18, enemies: 2, layout: 'islands', islands: 6, extraBridges: 2, specials: { castillo: 2, torre: 2, establo: 1 }, player: C(20), enemy: Object.assign(C(20), { extra: 1 }), garrison: 1.1, desc: 'La niebla esconde islas fortificadas. Avanza con cuidado.' },
  { id: 'w2l7', name: 'Atolón', nodes: 19, enemies: 3, layout: 'islands', islands: 7, specials: { castillo: 1, torre: 2, establo: 2 }, player: C(22), enemy: C(18), garrison: 1.05, desc: 'Tres señores, un solo atolón. Golpea al más débil primero.' },
  { id: 'w2l8', name: 'La Tormenta', nodes: 21, enemies: 3, layout: 'islands', islands: 6, extraBridges: 2, specials: { castillo: 2, torre: 2, establo: 2 }, player: C(24), enemy: C(18), garrison: 1.05, desc: 'Las olas rugen y los rivales atacan sin descanso.' },
  { id: 'w2l9', name: 'Reino de Sal', nodes: 22, enemies: 2, layout: 'islands', islands: 7, extraBridges: 3, specials: { castillo: 2, torre: 3, establo: 2 }, player: C(24), enemy: Object.assign(C(24, 2), { extra: 1 }), garrison: 1.15, desc: 'El trono del archipiélago te espera en la isla mayor.' },
  /* ===== Mundo 3: Dunas de Ámbar ===== */
  { id: 'w3l1', name: 'El Oasis', feature: 'herreria', tutorial: 'herreria', nodes: 14, enemies: 1, layout: 'scatter', specials: { herreria: 1, castillo: 1, torre: 1 }, player: C(20), enemy: C(18), garrison: 1, desc: 'Las herrerías forjan caballeros que golpean el doble. Conquista una cuanto antes.' },
  { id: 'w3l2', name: 'La Caravana', nodes: 15, enemies: 1, layout: 'scatter', specials: { herreria: 2, castillo: 1, torre: 1, establo: 1 }, player: C(20), enemy: Object.assign(C(20), { extra: 1 }), garrison: 1.05, desc: 'Una caravana de herreros cruza el desierto. Sus forjas cambiarán la guerra.' },
  { id: 'w3l3', name: 'Cañón Seco', nodes: 16, enemies: 2, layout: 'river', bridges: 2, specials: { castillo: 1, torre: 2, herreria: 1 }, player: C(20), enemy: C(18), garrison: 1.05, desc: 'Un cañón profundo parte el desierto en dos. Pocos puentes, mucho que perder.' },
  { id: 'w3l4', name: 'Espejismo', nodes: 16, enemies: 2, layout: 'ring', ringOuter: 10, ringInner: 5, specials: { castillo: 1, torre: 2, herreria: 1, establo: 1 }, player: C(20), enemy: C(18), garrison: 1.1, desc: 'Un anillo de aldeas rodea un castillo de adobe. ¿Atajo por el centro o rodeo?' },
  { id: 'w3l5', name: 'Fortaleza de Adobe', nodes: 18, enemies: 2, layout: 'scatter', specials: { castillo: 2, torre: 2, herreria: 1, establo: 1 }, fortress: { level: 3, troops: 45 }, player: C(22), enemy: C(20), garrison: 1.1, desc: 'Una fortaleza neutral domina las dunas. Quien la tome tendrá ventaja.' },
  { id: 'w3l6', name: 'Tormenta de Arena', nodes: 19, enemies: 3, layout: 'scatter', specials: { castillo: 1, torre: 2, herreria: 2, establo: 1 }, player: C(22), enemy: C(18), garrison: 1.05, desc: 'Tres casas avanzan entre la arena. Que no te rodeen.' },
  { id: 'w3l7', name: 'El Gran Cañón', nodes: 20, enemies: 3, layout: 'cross', bridges: 2, specials: { castillo: 2, torre: 3, herreria: 1, establo: 1 }, player: C(22), enemy: C(18), garrison: 1.1, desc: 'Dos cañones cruzan el desierto y crean cuatro reinos separados por puentes.' },
  { id: 'w3l8', name: 'Ruta de la Seda', nodes: 21, enemies: 2, layout: 'scatter', specials: { castillo: 2, torre: 3, herreria: 2, establo: 2 }, player: C(22), enemy: Object.assign(C(24, 2), { extra: 2 }), garrison: 1.15, desc: 'Los mercaderes pagan a quien domine la ruta. Ahora mismo, no eres tú.' },
  { id: 'w3l9', name: 'Sultanato de Ámbar', nodes: 24, enemies: 3, layout: 'scatter', specials: { castillo: 2, torre: 3, herreria: 2, establo: 2 }, fortress: { level: 4, troops: 55 }, player: C(24), enemy: C(22), garrison: 1.15, desc: 'Tres sultanes, una fortaleza dorada y todo el desierto en juego.' },
  /* ===== Mundo 4: Cumbres de Escarcha ===== */
  { id: 'w4l1', name: 'Primera Nevada', feature: 'ventisca', tutorial: 'ventisca', nodes: 16, enemies: 1, layout: 'river', bridges: 2, specials: { castillo: 1, torre: 2, herreria: 1, establo: 1 }, player: C(22), enemy: Object.assign(C(22), { extra: 1 }), garrison: 1.05, desc: 'La Ventisca congela al enemigo en plena marcha. Úsala para defender los puentes.' },
  { id: 'w4l2', name: 'Lago Helado', nodes: 17, enemies: 2, layout: 'scatter', lakes: 2, specials: { castillo: 1, torre: 2, herreria: 1, establo: 1 }, player: C(22), enemy: C(20), garrison: 1.1, desc: 'Entre lagos helados, los caminos son pocos y estrechos.' },
  { id: 'w4l3', name: 'Grieta Azul', nodes: 18, enemies: 2, layout: 'river', bridges: 3, specials: { castillo: 2, torre: 2, herreria: 1, establo: 1 }, player: C(22), enemy: C(20), garrison: 1.1, desc: 'Una grieta sin fondo divide la montaña. Cuida tus puentes.' },
  { id: 'w4l4', name: 'Pinar Blanco', nodes: 19, enemies: 2, layout: 'scatter', density: 0.2, specials: { castillo: 1, torre: 3, herreria: 2, establo: 2 }, player: C(22), enemy: Object.assign(C(22), { extra: 1 }), garrison: 1.15, desc: 'Un bosque nevado lleno de atalayas. La caballería será clave.' },
  { id: 'w4l5', name: 'Paso del Lobo', nodes: 20, enemies: 2, layout: 'cross', bridges: 2, specials: { castillo: 2, torre: 2, herreria: 1, establo: 2 }, player: C(24), enemy: C(20), garrison: 1.05, desc: 'Cuatro valles helados unidos por puentes de hielo. Los lobos acechan.' },
  { id: 'w4l6', name: 'Glaciar', nodes: 20, enemies: 3, layout: 'ring', ringOuter: 12, ringInner: 7, specials: { castillo: 2, torre: 3, herreria: 1, establo: 1 }, player: C(24), enemy: C(20), garrison: 1.15, desc: 'Un anillo de hielo alrededor de una ciudadela. Tres rivales, un solo centro.' },
  { id: 'w4l7', name: 'Ciudadela de Hielo', nodes: 22, enemies: 2, layout: 'scatter', specials: { castillo: 2, torre: 4, herreria: 2, establo: 2 }, fortress: { level: 4, troops: 60 }, player: C(24), enemy: Object.assign(C(24, 2), { extra: 1 }), garrison: 1.2, desc: 'La ciudadela de hielo resiste desde hace siglos. Que no resista a ti.' },
  { id: 'w4l8', name: 'Ventisquero', nodes: 24, enemies: 3, layout: 'river', bridges: 3, specials: { castillo: 2, torre: 4, herreria: 2, establo: 2 }, player: C(24), enemy: C(22), garrison: 1.15, desc: 'La tormenta no cesa. Tres señores luchan por el refugio de la montaña.' },
  { id: 'w4l9', name: 'Trono de Escarcha', nodes: 26, enemies: 3, layout: 'scatter', specials: { castillo: 3, torre: 4, herreria: 2, establo: 2 }, player: C(26), enemy: Object.assign(C(24, 2), { extra: 1 }), garrison: 1.2, desc: 'En la cima de las cumbres se alza el trono helado. Conquístalo.' },
  /* ===== Mundo 5: Caldera de Brasas ===== */
  { id: 'w5l1', name: 'Tierra Quemada', feature: 'meteoro', tutorial: 'meteoro', nodes: 18, enemies: 2, layout: 'river', bridges: 2, specials: { castillo: 1, torre: 2, herreria: 1, establo: 1 }, player: C(24), enemy: C(20), garrison: 1.1, desc: 'El Meteoro arrasa ejércitos enteros. Llega la hora de la magia mayor.' },
  { id: 'w5l2', name: 'Río de Fuego', nodes: 19, enemies: 2, layout: 'river', bridges: 3, specials: { castillo: 2, torre: 3, herreria: 1, establo: 1 }, player: C(24), enemy: Object.assign(C(22), { extra: 1 }), garrison: 1.15, desc: 'La lava corre entre los feudos. Cada puente de basalto vale su peso en oro.' },
  { id: 'w5l3', name: 'Obsidiana', nodes: 20, enemies: 3, layout: 'scatter', specials: { castillo: 2, torre: 3, herreria: 2, establo: 1 }, player: C(24), enemy: C(20), garrison: 1.15, desc: 'Campos de roca negra y tres rivales hambrientos.' },
  { id: 'w5l4', name: 'Fumarolas', nodes: 21, enemies: 3, layout: 'cross', bridges: 2, specials: { castillo: 2, torre: 3, herreria: 1, establo: 2 }, player: C(24), enemy: C(22), garrison: 1.15, desc: 'Dos ríos de lava se cruzan. Cuatro feudos, cuatro señores.' },
  { id: 'w5l5', name: 'Anillo de Ceniza', nodes: 22, enemies: 3, layout: 'ring', ringOuter: 13, ringInner: 8, spokeEvery: 2, specials: { castillo: 2, torre: 4, herreria: 1, establo: 2 }, player: C(24), enemy: C(22), garrison: 1.2, desc: 'Un anillo de ceniza rodea el cráter. El centro arde de riqueza.' },
  { id: 'w5l6', name: 'Forja del Abismo', nodes: 23, enemies: 3, layout: 'scatter', specials: { castillo: 2, torre: 3, herreria: 3, establo: 2 }, player: C(26), enemy: C(22), garrison: 1.2, desc: 'Las forjas del volcán producen las mejores armaduras del mundo.' },
  { id: 'w5l7', name: 'Puentes de Basalto', nodes: 24, enemies: 3, layout: 'river', bridges: 3, specials: { castillo: 2, torre: 4, herreria: 2, establo: 2 }, player: C(26), enemy: Object.assign(C(22), { extra: 1 }), garrison: 1.2, desc: 'La lava parte el mundo en dos. Los puentes deciden la guerra.' },
  { id: 'w5l8', name: 'Boca del Volcán', nodes: 26, enemies: 3, layout: 'scatter', specials: { castillo: 3, torre: 4, herreria: 2, establo: 2 }, fortress: { level: 4, troops: 70 }, player: C(26), enemy: C(24, 2), garrison: 1.25, desc: 'Una fortaleza al borde del cráter. Desde allí se domina toda la caldera.' },
  { id: 'w5l9', name: 'El Último Feudo', nodes: 28, enemies: 3, layout: 'scatter', specials: { castillo: 3, torre: 5, herreria: 2, establo: 2 }, fortress: { level: 4, troops: 80 }, player: C(28), enemy: Object.assign(C(26, 2), { extra: 1 }), garrison: 1.25, desc: 'Los tres grandes señores unen sus ejércitos. Sólo uno reinará sobre todas las tierras.' }
];

const WORLD_KEYS = ['valle', 'islas', 'desierto', 'hielo', 'volcan'];

function spellsFor(id) {
  const order = CAMPAIGN.map((c) => c.id);
  const idx = order.indexOf(id);
  return FF.SPELL_ORDER.filter((k) => order.indexOf(FF.SPELLS[k].unlock) <= idx);
}

function buildOne(c, tune) {
  const w = parseInt(c.id[1], 10) - 1;
  const biome = WORLD_KEYS[w];
  let lvl;
  if (c.hand) {
    lvl = JSON.parse(JSON.stringify(HAND[c.id]));
    lvl.seed = FF.U.hashStr(c.id) % 100000;
  } else {
    const spec = Object.assign({}, c, { biome, seed: (FF.U.hashStr(c.id) % 900000) + 1000 + (tune.seedBump || 0) });
    spec.factions = [1].concat(F[biome].slice(0, c.enemies));
    spec.garrison = (c.garrison || 1) * (tune.g || 1);
    const scale = (d) => Object.assign({}, d, { troops: Math.round(d.troops * (tune.e || 1)), extra: tune.dropExtra ? 0 : d.extra });
    spec.enemy = Array.isArray(c.enemy) ? c.enemy.map(scale) : scale(c.enemy);
    spec.player = Object.assign({}, c.player, { troops: Math.round(c.player.troops * (tune.p || 1)), extra: (c.player.extra || 0) + (tune.pExtra || 0), extraTroops: 8 });
    if (!spec.personas) spec.personas = w < 1 ? ['expansivo', 'agresivo', 'oportunista'] : ['agresivo', 'oportunista', 'expansivo', 'constructor'];
    lvl = FF.MapGen.generate(spec);
    lvl.factions = spec.factions;
  }
  lvl.id = c.id; lvl.world = w; lvl.index = parseInt(c.id[3], 10) - 1;
  lvl.biome = biome; lvl.name = c.name; lvl.desc = c.desc;
  lvl.spells = spellsFor(c.id);
  if (tune.hate != null && tune.hate !== 1) lvl.aiHate = tune.hate;
  if (tune.slow != null && tune.slow !== 1) lvl.aiSlow = Math.max(lvl.aiSlow || 1, tune.slow);
  if (c.feature) lvl.feature = c.feature;
  if (c.tutorial) lvl.tutorial = c.tutorial;
  return lvl;
}

/* partida completa con un jugador simulado ('humano' o 'experto') */
function simulate(level, mode, seed, bot) {
  const g = new FF.Game(level, { mode, seed, noEvents: true, playerAI: { persona: 'equilibrado', mode: FF.BOTS[bot] } });
  const dt = 1 / 20;
  while (!g.over && g.time < 1200) g.update(dt);
  return { win: !!(g.result && g.result.win), time: g.time };
}

function series(level, mode, bot, runs) {
  const rs = [];
  for (let s = 1; s <= runs; s++) rs.push(simulate(level, mode, s * 101 + mode * 7 + (bot === 'experto' ? 3 : 0), bot));
  const wins = rs.filter((r) => r.win).map((r) => r.time).sort((a, b) => a - b);
  return { wins: wins.length, runs, median: wins.length ? wins[Math.floor(wins.length / 2)] : null };
}

/* Escudero y Caballero: los debe poder ganar un jugador medio. Señor de la Guerra: un jugador experto. */
function evaluate(level, runs) {
  return { E: series(level, 0, 'humano', runs), C: series(level, 1, 'humano', runs), S: series(level, 2, 'experto', runs) };
}
function passes(ev, runs) {
  return ev.E.wins >= Math.ceil(runs * 0.8) && ev.C.wins >= Math.ceil(runs * 0.4) && ev.S.wins >= Math.ceil(runs * 0.4);
}

function medalTimes(ev, level, runs) {
  const up = (t) => Math.max(45, Math.ceil(t / 15) * 15);
  const fallback = level.nodes.length * 16;
  const E = ev.E.median != null ? ev.E.median * 1.15 : fallback * 1.2;
  let C;
  if (ev.C.median != null && ev.C.wins >= 2) C = ev.C.median * 1.15;
  else {
    const cx = series(level, 1, 'experto', runs);
    C = cx.median != null ? cx.median * 1.35 : E * 1.1;
  }
  const S = ev.S.median != null ? ev.S.median * 1.25 : C;
  return [up(E), up(C), up(S)];
}

function LADDERSTR(t) { return Object.keys(t).filter((k) => t[k] !== 1 && t[k]).map((k) => k + '=' + t[k]).join(',') || 'base'; }

/* escalera de ajustes: primero rivales más lentos y menos obsesionados contigo, luego ventajas, luego otro mapa */
const LADDER = [
  {},
  { slow: 1.25 },
  { slow: 1.25, hate: 0.7 },
  { slow: 1.4, hate: 0.6, p: 1.3 },
  { slow: 1.4, hate: 0.6, p: 1.3, e: 0.85, g: 0.9 },
  { slow: 1.5, hate: 0.5, p: 1.4, pExtra: 1, e: 0.8, g: 0.85, dropExtra: true },
  { seedBump: 17 },
  { seedBump: 17, slow: 1.3, hate: 0.6, p: 1.3 },
  { seedBump: 41, slow: 1.4, hate: 0.6, p: 1.4, pExtra: 1, e: 0.85 },
  { seedBump: 73, slow: 1.5, hate: 0.5, p: 1.5, pExtra: 2, e: 0.75, g: 0.85, dropExtra: true },
  { seedBump: 131 },
  { seedBump: 131, slow: 1.4, hate: 0.6, p: 1.4, pExtra: 1, e: 0.85 },
  { seedBump: 211, slow: 1.5, hate: 0.5, p: 1.6, pExtra: 2, e: 0.7, g: 0.8, dropExtra: true }
];

function line(lvl, ev) {
  const f = (e) => e.wins + '/' + e.runs + '@' + (e.median ? Math.round(e.median) : '--');
  return lvl.id.padEnd(5) + ' ' + lvl.name.padEnd(22) + ' n=' + String(lvl.nodes.length).padStart(2) + ' r=' + String(lvl.roads.length).padStart(2) +
    ' | Escudero(medio) ' + f(ev.E) + '  Caballero(medio) ' + f(ev.C) + '  Señor(experto) ' + f(ev.S) +
    ' | medallas ' + lvl.medal.map((t) => Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0')).join(' ') + '  ' + (lvl.tune || '');
}

function tuneLevel(c, RUNS) {
  let best = null;
  for (let iter = 0; iter < LADDER.length; iter++) {
    const tune = LADDER[iter];
    const lvl = buildOne(c, tune);
    const ev = evaluate(lvl, RUNS);
    const score = ev.E.wins * 4 + ev.C.wins * 2 + ev.S.wins * 1.5 - iter * 0.01;
    if (!best || score > best.score) best = { lvl, ev, tune, score };
    if (passes(ev, RUNS) || c.hand) break;
  }
  const lvl = best.lvl;
  lvl.medal = medalTimes(best.ev, lvl, RUNS);
  lvl.tune = LADDERSTR(best.tune);
  return { lvl, ev: best.ev, line: line(lvl, best.ev) };
}

function writeOut(levels, lines) {
  const out = '/* Feudo a Feudo — niveles de campaña generados por tools/build-levels.js. No editar a mano. */\n' +
    '(function (FF) {\n  FF.LEVELS = ' + JSON.stringify(levels) + ';\n})(globalThis.FF = globalThis.FF || {});\n';
  fs.writeFileSync(path.join(ROOT, 'js/core/levels.js'), out);
  fs.writeFileSync(path.join(__dirname, 'levels-report.txt'),
    '# Equilibrado por simulación: victorias/partidas@mediana de segundos. "medio" = jugador simulado con ritmo humano; "experto" = jugador rápido.\n' +
    '# Criterio: Escudero >= 80% (medio), Caballero >= 40% (medio), Señor de la Guerra >= 40% (experto).\n' + lines.join('\n') + '\n');
  console.log('OK: ' + levels.length + ' niveles escritos en js/core/levels.js (' + Math.round(out.length / 1024) + ' KB)');
}

function main() {
  const args = process.argv.slice(2);
  const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const RUNS = +arg('--runs', 5);
  const shard = arg('--shard', null);
  const only = arg('--only', null);
  const list = only ? only.split(',') : null;

  if (args.indexOf('--report') >= 0) {
    require(path.join(ROOT, 'js/core/levels.js'));
    const lines = FF.LEVELS.map((lvl) => { const l = line(lvl, evaluate(lvl, RUNS)); console.log(l); return l; });
    fs.writeFileSync(path.join(__dirname, 'levels-report.txt'),
      '# Equilibrado por simulación: victorias/partidas@mediana de segundos. "medio" = jugador simulado con ritmo humano; "experto" = jugador rápido.\n' +
      '# Criterio: Escudero >= 80% (medio), Caballero >= 40% (medio), Señor de la Guerra >= 40% (experto).\n' + lines.join('\n') + '\n');
    return;
  }

  /* modo trabajador: procesa una parte de la campaña y devuelve el resultado por IPC */
  if (shard) {
    const [k, n] = shard.split('/').map(Number);
    const res = [];
    CAMPAIGN.forEach((c, i) => {
      if (i % n !== k) return;
      if (list && list.indexOf(c.id) < 0) return;
      const r = tuneLevel(c, RUNS);
      process.stdout.write(r.line + '\n');
      res.push({ i, lvl: r.lvl, line: r.line });
    });
    process.send(res);
    return;
  }

  const workers = Math.max(1, Math.min(+arg('--workers', require('os').cpus().length), 8));
  const t0 = Date.now();
  let prev = null;
  if (list) { require(path.join(ROOT, 'js/core/levels.js')); prev = FF.LEVELS; }
  const { fork } = require('child_process');
  const results = [];
  let done = 0;
  for (let k = 0; k < workers; k++) {
    const extra = ['--shard', k + '/' + workers, '--runs', String(RUNS)].concat(only ? ['--only', only] : []);
    const ch = fork(__filename, extra);
    ch.on('message', (m) => { results.push(...m); });
    ch.on('exit', () => {
      if (++done < workers) return;
      const levels = [], lines = [];
      CAMPAIGN.forEach((c, i) => {
        const r = results.find((x) => x.i === i);
        if (r) { levels.push(r.lvl); lines.push(r.line); }
        else if (prev) { const l = prev.find((x) => x.id === c.id); levels.push(l); lines.push(l.id + ' (sin cambios)'); }
      });
      if (levels.length !== CAMPAIGN.length) { console.error('Faltan niveles: ' + levels.length); process.exit(1); }
      writeOut(levels, lines);
      console.log('Tiempo: ' + Math.round((Date.now() - t0) / 1000) + ' s con ' + workers + ' procesos');
    });
  }
}

main();
