/* Feudo a Feudo — lista de pistas de música (carpeta music/)
   Si falta algún archivo, ese hueco usa la música generada por el propio juego.

   Huecos:
     menu      pantalla de título
     map       mapa de campaña
     valle, islas, desierto, hielo, volcan   niveles de cada mundo; si el mundo tiene dos pistas,
               cada nivel empieza por una distinta y al acabar una suena la otra
     final     nivel 9 de cada mundo (batalla final)
     victory, defeat   melodía al ganar o perder (sin bucle)

   gain: igualación de volumen (todas a −19 LUFS con la música al 100 %).
   Si cambias una pista, vuelve a calcularlo con: python3 tools/music-gains.py
*/
(function (FF) {
  'use strict';
  const OGA = 'https://opengameart.org/';
  const FSM = 'https://www.free-stock-music.com/';
  FF.MUSIC = {
    tracks: {
      m1: { file: 'music/01-menu-exploration.mp3', gain: 1, title: 'Medieval: Exploration', author: 'RandomMind', license: 'CC0', url: OGA + 'content/medieval-exploration' },
      m2: { file: 'music/02-mapa-harvest-season.mp3', gain: 0.406, title: 'Medieval: Harvest Season', author: 'RandomMind', license: 'CC0', url: OGA + 'content/medieval-harvest-season' },
      m3: { file: 'music/03-valle-old-tower-inn.mp3', gain: 0.832, title: 'Medieval: The Old Tower Inn', author: 'RandomMind', license: 'CC0', url: OGA + 'content/medieval-the-old-tower-inn' },
      m4: { file: 'music/04-valle-kings-feast.mp3', gain: 0.57, title: "Medieval: King's Feast", author: 'RandomMind', license: 'CC0', url: OGA + 'content/medieval-kings-feast' },
      m5: { file: 'music/05-islas-celtic-whispers.mp3', gain: 0.414, title: 'Celtic Whispers', author: 'Alexander Nakarada (creatorchords.com)', license: 'CC BY 4.0', url: FSM + 'alexander-nakarada-celtic-whispers.html' },
      m6: { file: 'music/06-islas-minstrel-dance.mp3', gain: 0.494, title: 'Medieval: Minstrel Dance', author: 'RandomMind', license: 'CC0', url: OGA + 'node/92393' },
      m7: { file: 'music/07-desierto-night-in-the-desert.mp3', gain: 0.603, title: 'Night in the Desert (remix Tausdei vs Hitctrl)', author: 'glitchart, Tausdei y Hitctrl', license: 'CC BY 3.0', url: OGA + 'content/night-in-the-desert-remixed-tausdei-vs-hitctrl' },
      m8: { file: 'music/08-hielo-traversing-the-white-peaks.mp3', gain: 0.416, title: 'Traversing the White Peaks', author: 'Alexander Nakarada (creatorchords.com)', license: 'CC BY 4.0', url: FSM + 'alexander-nakarada-traversing-the-white-peaks.html' },
      m9: { file: 'music/09-volcan-humans-march.mp3', gain: 0.373, title: 'War: Humans March', author: 'Bobjt y tridentkeep', license: 'CC BY 3.0', url: OGA + 'node/179428' },
      m10: { file: 'music/10-volcan-battle.mp3', gain: 0.531, title: 'Medieval: Battle', author: 'RandomMind', license: 'CC0', url: OGA + 'node/113876' },
      m11: { file: 'music/11-final-rise-of-kingdoms.mp3', gain: 0.688, title: 'Rise of Kingdoms', author: 'Alexander Nakarada (creatorchords.com)', license: 'CC BY 4.0', url: FSM + 'alexander-nakarada-rise-of-kingdoms.html' },
      m12: { file: 'music/12-victoria-victory-theme.mp3', gain: 0.458, title: 'Medieval: Victory Theme', author: 'RandomMind', license: 'CC0', url: OGA + 'content/medieval-victory-theme', loop: false },
      m13: { file: 'music/13-derrota-defeat-theme.mp3', gain: 0.405, title: 'Medieval: Defeat Theme', author: 'RandomMind', license: 'CC0', url: OGA + 'content/medieval-defeat-theme', loop: false }
    },
    slots: {
      menu: ['m1'], map: ['m2'],
      valle: ['m3', 'm4'], islas: ['m5', 'm6'], desierto: ['m7'], hielo: ['m8', 'm5'], volcan: ['m9', 'm10'],
      final: ['m11'],
      victory: ['m12'], defeat: ['m13']
    }
  };
})(globalThis.FF = globalThis.FF || {});
