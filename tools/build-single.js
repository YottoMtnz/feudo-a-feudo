#!/usr/bin/env node
/* Feudo a Feudo — empaqueta todo el juego en un único HTML (jugar-sin-instalar.html).
   La música no va dentro: el archivo usa la carpeta music/ que tenga al lado (como en el proyecto)
   y, si no la encuentra, suena la música generada por el juego.
   Uso: node tools/build-single.js [--con-musica]
     --con-musica  mete también los MP3 dentro del HTML (≈ 90 MB: un solo archivo totalmente autónomo) */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const withMusic = process.argv.indexOf('--con-musica') >= 0;

require(path.join(ROOT, 'js/audio/tracks.js'));
const MUSIC = globalThis.FF.MUSIC;

let musicBytes = 0;
function musicData() {
  const data = {};
  if (!withMusic) return data;
  Object.keys(MUSIC.tracks).forEach((id) => {
    const t = MUSIC.tracks[id];
    const cand = [t.file].concat(t.alt ? [t.alt] : []).map((p) => path.join(ROOT, p));
    const f = cand.find((p) => fs.existsSync(p));
    if (!f) { console.warn('  aviso: falta ' + t.file); return; }
    const buf = fs.readFileSync(f);
    musicBytes += buf.length;
    data[id] = { mime: f.endsWith('.ogg') ? 'audio/ogg' : 'audio/mpeg', b64: buf.toString('base64') };
  });
  return data;
}

let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) => {
  const css = fs.readFileSync(path.join(ROOT, href), 'utf8');
  return '<style>\n' + css + '\n</style>';
});
/* el icono, dentro del archivo */
html = html.replace(/(<link rel="(?:icon|apple-touch-icon)"[^>]*href=")([^"]+\.png)(")/g, (m, a, href, b) => {
  const f = path.join(ROOT, href);
  return fs.existsSync(f) ? a + 'data:image/png;base64,' + fs.readFileSync(f).toString('base64') + b : m;
});
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  const js = fs.readFileSync(path.join(ROOT, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  let out = '<script>\n/* ' + src + ' */\n' + js + '\n</script>';
  if (src === 'js/audio/tracks.js') {
    const d = musicData();
    if (Object.keys(d).length) out += '\n<script>\n/* música incrustada */\nFF.MUSIC_DATA = ' + JSON.stringify(d) + ';\n</script>';
  }
  return out;
});
const out = path.join(ROOT, 'jugar-sin-instalar.html');
fs.writeFileSync(out, html);
console.log('OK: ' + path.basename(out) + ' (' + (html.length / 1048576).toFixed(1) + ' MB' +
  (musicBytes ? ', con ' + (musicBytes / 1048576).toFixed(1) + ' MB de música dentro' : ', música desde la carpeta music/') + ')');
