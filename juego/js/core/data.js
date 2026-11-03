/* Feudo a Feudo — datos del juego: facciones, edificios, tropas, hechizos, modos, mundos y logros */
(function (FF) {
  'use strict';

  /* ---------- Facciones ---------- */
  FF.FACTIONS = [
    { id: 0, key: 'neutral', name: 'Tierras libres', lord: 'Nadie', color: '#b7b0a1', dark: '#615b50', light: '#efe9da', roof: '#a09789' },
    { id: 1, key: 'azul', name: 'Reino Azul', lord: 'Tú', color: '#2b7dff', dark: '#1442a6', light: '#a8d0ff', roof: '#2b7dff' },
    { id: 2, key: 'rojo', name: 'Casa Bermeja', lord: 'Duque Bermejo', color: '#ff3b30', dark: '#9e1410', light: '#ffaaa2', roof: '#ff3b30' },
    { id: 3, key: 'oro', name: 'Casa Áurea', lord: 'Condesa Áurea', color: '#ffbe12', dark: '#9a6200', light: '#fff0a6', roof: '#ffbe12' },
    { id: 4, key: 'verde', name: 'Casa Musgo', lord: 'Marqués del Musgo', color: '#1fc24a', dark: '#0d7228', light: '#b0f7c0', roof: '#1fc24a' },
    { id: 5, key: 'morado', name: 'Casa Violeta', lord: 'Rey Violeta', color: '#a64dff', dark: '#5718a6', light: '#e2bdff', roof: '#a64dff' }
  ];
  FF.PLAYER = 1;

  /* ---------- Edificios ----------
     cap: capacidad · prod: soldados/segundo · def: multiplicador de defensa según tropa atacante
     Mejorar cuesta la mitad de la capacidad actual. */
  FF.BUILD = {
    aldea: {
      name: 'Aldea', plural: 'Aldeas', unit: 'soldado', produces: true,
      desc: 'Produce soldados sin descanso. Es la base de cualquier ejército.',
      levels: [{ cap: 10, prod: 0.5 }, { cap: 20, prod: 0.68 }, { cap: 30, prod: 0.86 }, { cap: 50, prod: 1.1 }],
      def: { soldado: 1, jinete: 1, caballero: 1 }, value: 10
    },
    castillo: {
      name: 'Castillo', plural: 'Castillos', unit: 'soldado', produces: true,
      desc: 'Produce más rápido y sus murallas reducen el daño de soldados y jinetes.',
      levels: [{ cap: 20, prod: 0.7 }, { cap: 35, prod: 0.88 }, { cap: 50, prod: 1.08 }, { cap: 80, prod: 1.32 }],
      def: { soldado: 1.5, jinete: 1.5, caballero: 1 }, value: 17
    },
    torre: {
      name: 'Atalaya', plural: 'Atalayas', unit: 'soldado', produces: false,
      desc: 'No produce, pero lanza venablos contra toda tropa enemiga que pase cerca. A nivel máximo sus lanzas encantadas atraviesan a dos soldados por disparo. Muy resistente a la infantería; vulnerable a los jinetes.',
      levels: [{ cap: 15, rate: 1.25, range: 126, dmg: 1 }, { cap: 25, rate: 2.0, range: 142, dmg: 1 }, { cap: 40, rate: 2.8, range: 160, dmg: 2 }],
      def: { soldado: 2, jinete: 1, caballero: 1.5 }, value: 11
    },
    establo: {
      name: 'Establo', plural: 'Establos', unit: 'jinete', produces: true,
      desc: 'Toda tropa que sale de aquí monta a caballo: corre el doble y esquiva flechas. Ideal contra atalayas.',
      levels: [{ cap: 15, prod: 0.25 }, { cap: 25, prod: 0.32 }, { cap: 40, prod: 0.4 }],
      def: { soldado: 1, jinete: 1, caballero: 1 }, value: 12
    },
    herreria: {
      name: 'Herrería', plural: 'Herrerías', unit: 'caballero', produces: true,
      desc: 'Toda tropa que sale de aquí viste armadura: golpea el doble y aguanta el doble, aunque marcha despacio.',
      levels: [{ cap: 15, prod: 0.25 }, { cap: 25, prod: 0.32 }, { cap: 40, prod: 0.4 }],
      def: { soldado: 1, jinete: 1, caballero: 1 }, value: 13
    }
  };
  FF.BUILD_ORDER = ['aldea', 'castillo', 'torre', 'establo', 'herreria'];

  FF.bstat = function (type, level) {
    const d = FF.BUILD[type];
    return d.levels[Math.min(level, d.levels.length) - 1];
  };
  FF.upgradeCost = function (type, level) {
    return Math.ceil(FF.bstat(type, level).cap / 2);
  };
  FF.maxLevel = function (type) { return FF.BUILD[type].levels.length; };

  /* ---------- Tropas ---------- */
  FF.UNITS = {
    soldado: { name: 'Soldado', plural: 'Soldados', speed: 50, str: 1, hp: 1, rowW: 3, rowSp: 7.4, latSp: 5.4, evade: 0 },
    jinete: { name: 'Jinete', plural: 'Jinetes', speed: 100, str: 1, hp: 1, rowW: 2, rowSp: 12, latSp: 7.6, evade: 0.3 },
    caballero: { name: 'Caballero', plural: 'Caballeros', speed: 37, str: 2, hp: 2, rowW: 2, rowSp: 10.5, latSp: 7.6, evade: 0 }
  };

  /* ---------- Hechizos (reliquias) ---------- */
  FF.SPELLS = {
    rayo: {
      name: 'Rayo', cost: 35, target: 'enemy', unlock: 'w1l4',
      desc: 'Un rayo fulmina la mitad de la guarnición de un edificio enemigo o neutral (mínimo 5 soldados).'
    },
    escudo: {
      name: 'Égida', cost: 30, target: 'own', dur: 10, unlock: 'w2l1',
      desc: 'Una cúpula sagrada vuelve invulnerable uno de tus edificios durante 10 segundos.'
    },
    sopor: {
      name: 'Sopor', cost: 30, target: 'enemy', dur: 12, unlock: 'w3l1',
      desc: 'Duerme un edificio enemigo 12 segundos: no produce, no envía tropas y sus arqueros no disparan.'
    },
    ventisca: {
      name: 'Ventisca', cost: 45, target: 'area', radius: 120, dur: 6, unlock: 'w4l1',
      desc: 'Congela 6 segundos a las tropas enemigas de una zona y detiene sus edificios cercanos.'
    },
    meteoro: {
      name: 'Meteoro', cost: 65, target: 'area', radius: 92, unlock: 'w5l1',
      desc: 'Una roca ardiente aniquila al 60% de las tropas enemigas de la zona y quema un tercio de sus guarniciones.'
    }
  };
  FF.SPELL_ORDER = ['rayo', 'escudo', 'sopor', 'ventisca', 'meteoro'];
  FF.MANA = { max: 100, regen: 1.15, start: 25, capture: 8 };

  /* ---------- Modos de dificultad ---------- */
  FF.MODES = [
    {
      key: 'escudero', name: 'Escudero', short: 'I',
      desc: 'Los señores rivales tardan en reaccionar, se equivocan y te dan respiro. Ideal para aprender.',
      ai: { interval: 3.4, react: 0.35, accuracy: 0.6, prod: 0.85, startDelay: 8, upgrade: 0.5, margin: 1.0, hate: 0.3, lag: 4.5, grace: 40, playerCD: 16, globalCD: 9, maxSrc: 2, maxActs: 1, mercy: 0.75, double: false },
      magic: true, scoreMul: 1
    },
    {
      key: 'caballero', name: 'Caballero', short: 'II',
      desc: 'Rivales despiertos que defienden sus tierras y castigan los descuidos, sin ensañarse.',
      ai: { interval: 2.4, react: 0.6, accuracy: 0.8, prod: 0.95, startDelay: 4, upgrade: 0.75, margin: 1.06, hate: 0.6, lag: 2.6, grace: 22, playerCD: 9, globalCD: 5, maxSrc: 3, maxActs: 2, mercy: 0.35, double: false },
      magic: true, scoreMul: 1.5
    },
    {
      key: 'senor', name: 'Señor de la Guerra', short: 'III',
      desc: 'Rivales rápidos y coordinados que producen algo más. Las reliquias mágicas están prohibidas.',
      ai: { interval: 1.5, react: 0.85, accuracy: 0.92, prod: 1.05, startDelay: 2, upgrade: 0.95, margin: 1.1, hate: 0.85, lag: 1.2, grace: 10, playerCD: 4.5, globalCD: 2.2, maxSrc: 4, maxActs: 2, mercy: 0, double: true },
      magic: false, scoreMul: 2
    }
  ];

  /* ---------- Personalidades de la IA ---------- */
  FF.PERSONAS = {
    agresivo: { aggr: 0.9, expand: 0.55, upgrade: 0.45, defend: 0.7, funnel: 0.6, hate: 0.6 },
    expansivo: { aggr: 0.5, expand: 0.95, upgrade: 0.55, defend: 0.75, funnel: 0.5, hate: 0.3 },
    constructor: { aggr: 0.45, expand: 0.6, upgrade: 0.95, defend: 0.9, funnel: 0.7, hate: 0.35 },
    oportunista: { aggr: 0.75, expand: 0.7, upgrade: 0.6, defend: 0.6, funnel: 0.55, hate: 0.8 },
    equilibrado: { aggr: 0.65, expand: 0.7, upgrade: 0.65, defend: 0.8, funnel: 0.6, hate: 0.5 }
  };

  /* ---------- Mundos ---------- */
  FF.WORLDS = [
    {
      key: 'valle', biome: 'valle', name: 'Valle de Robledal',
      desc: 'Prados verdes, robles centenarios y ríos mansos. Aquí empieza tu leyenda.',
      intro: 'Tu padre te dejó una aldea y un estandarte azul. Los señores vecinos ya miran tus campos con codicia.'
    },
    {
      key: 'islas', biome: 'islas', name: 'Archipiélago de Sal',
      desc: 'Islas unidas por puentes de madera. Quien domina los puentes, domina el mar.',
      intro: 'Más allá del valle, un rosario de islas espera a un señor capaz de unirlas bajo un mismo estandarte.'
    },
    {
      key: 'desierto', biome: 'desierto', name: 'Dunas de Ámbar',
      desc: 'Arenas doradas, oasis escondidos y fortalezas de adobe bajo un sol implacable.',
      intro: 'Las caravanas hablan de herrerías en mitad de la arena donde se forjan armaduras para caballeros.'
    },
    {
      key: 'hielo', biome: 'hielo', name: 'Cumbres de Escarcha',
      desc: 'Glaciares, grietas sin fondo y pinos nevados. El frío no perdona a los lentos.',
      intro: 'En las montañas heladas los señores resisten tras murallas de piedra y hielo.'
    },
    {
      key: 'volcan', biome: 'volcan', name: 'Caldera de Brasas',
      desc: 'Ríos de lava, roca negra y cielos de ceniza. La conquista final.',
      intro: 'Los últimos rivales se refugian junto al volcán. Sólo uno reinará sobre todas las tierras.'
    }
  ];

  /* ---------- Logros ---------- */
  FF.ACHIEVEMENTS = [
    { id: 'primer', name: 'Primer Feudo', desc: 'Gana tu primera batalla.', icon: 'banner' },
    { id: 'mundo1', name: 'Señor del Valle', desc: 'Completa el Valle de Robledal.', icon: 'tree' },
    { id: 'mundo2', name: 'Señor de los Puentes', desc: 'Completa el Archipiélago de Sal.', icon: 'wave' },
    { id: 'mundo3', name: 'Rey de las Dunas', desc: 'Completa las Dunas de Ámbar.', icon: 'sun' },
    { id: 'mundo4', name: 'Corazón de Escarcha', desc: 'Completa las Cumbres de Escarcha.', icon: 'snow' },
    { id: 'mundo5', name: 'Domador del Volcán', desc: 'Completa la Caldera de Brasas.', icon: 'fire' },
    { id: 'caballero', name: 'Caballero Andante', desc: 'Completa los 45 niveles en modo Caballero.', icon: 'helm' },
    { id: 'senor', name: 'Señor de la Guerra', desc: 'Completa los 45 niveles en modo Señor de la Guerra.', icon: 'crown' },
    { id: 'total', name: 'Conquistador Total', desc: 'Completa todos los niveles en los tres modos.', icon: 'star' },
    { id: 'rapido', name: 'Relámpago', desc: 'Gana una batalla en menos de 60 segundos.', icon: 'bolt' },
    { id: 'medallas10', name: 'Contra Reloj', desc: 'Consigue 10 medallas de tiempo.', icon: 'clock' },
    { id: 'medallas45', name: 'Cronista del Reino', desc: 'Consigue las 45 medallas de tiempo de un mismo modo.', icon: 'book' },
    { id: 'intocable', name: 'Intocable', desc: 'Gana sin perder ningún edificio (nivel 4 o posterior).', icon: 'shield' },
    { id: 'arquitecto', name: 'Arquitecto', desc: 'Mejora 100 edificios.', icon: 'hammer' },
    { id: 'maestro', name: 'Maestro de Obras', desc: 'Ten 8 edificios a nivel máximo a la vez.', icon: 'castle' },
    { id: 'leva', name: 'Leva Masiva', desc: 'Entrena 10.000 soldados en total.', icon: 'people' },
    { id: 'hueste', name: 'Hueste Inmortal', desc: 'Entrena 100.000 soldados en total.', icon: 'army' },
    { id: 'jinetes', name: 'Caballería Ligera', desc: 'Envía 500 jinetes a la batalla.', icon: 'horse' },
    { id: 'caballeros', name: 'Yunque y Martillo', desc: 'Envía 500 caballeros a la batalla.', icon: 'anvil' },
    { id: 'arqueros', name: 'Ojo de Halcón', desc: 'Tus atalayas abaten 1.000 enemigos.', icon: 'arrow' },
    { id: 'hechicero', name: 'Hechicero', desc: 'Lanza los cinco hechizos al menos una vez.', icon: 'magic' },
    { id: 'archimago', name: 'Archimago', desc: 'Lanza 100 hechizos.', icon: 'orb' },
    { id: 'purista', name: 'Acero Puro', desc: 'Gana un nivel en modo Caballero sin usar magia.', icon: 'sword' },
    { id: 'desborde', name: 'Desbordante', desc: 'Reúne 100 soldados en un solo edificio.', icon: 'flag' },
    { id: 'remontada', name: 'Remontada Épica', desc: 'Gana después de haber quedado con un solo edificio.', icon: 'phoenix' },
    { id: 'tres', name: 'Contra Todos', desc: 'Gana una batalla contra tres señores a la vez.', icon: 'skull' },
    { id: 'escaramuza', name: 'Mercenario', desc: 'Gana 5 batallas rápidas.', icon: 'dice' }
  ];
})(globalThis.FF = globalThis.FF || {});
