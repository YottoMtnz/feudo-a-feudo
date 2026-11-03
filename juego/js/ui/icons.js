/* Feudo a Feudo — iconos SVG dibujados a mano (viewBox 24×24) */
(function (FF) {
  'use strict';
  const I = {
    pause: '<rect x="6" y="4" width="4.5" height="16" rx="1"/><rect x="13.5" y="4" width="4.5" height="16" rx="1"/>',
    play: '<path d="M7 4l13 8-13 8z"/>',
    fast: '<path d="M3 5l9 7-9 7zM12 5l9 7-9 7z"/>',
    swords: '<path d="M4 3l7.5 7.5-1.4 1.4L3 4.8V3zM20 3v1.8l-7.1 7.1-1.4-1.4L19 3z"/><path d="M6.5 14.5l3 3-2.2 2.2-1-1-2 2-1.3-1.3 2-2-1-1zM17.5 14.5l2.2 2.2-1 1 2 2-1.3 1.3-2-2-1 1-2.2-2.2z"/><path d="M8.6 12.6l2.8 2.8-1.4 1.4-2.8-2.8zM15.4 12.6l1.4 1.4-2.8 2.8-1.4-1.4z"/>',
    back: '<path d="M10 5l-7 7 7 7v-4.5h11v-5H10z"/>',
    gear: '<path d="M10.3 2h3.4l.5 2.6 1.7.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.7 2.6.5v3.4l-2.6.5-.8 1.7 1.5 2.2-2.4 2.4-2.2-1.5-1.7.8-.5 2.6h-3.4l-.5-2.6-1.7-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.7L2 13.7v-3.4l2.6-.5.8-1.7-1.5-2.2 2.4-2.4 2.2 1.5 1.7-.8zM12 8.2a3.8 3.8 0 100 7.6 3.8 3.8 0 000-7.6z"/>',
    book: '<path d="M2 5c3-1.5 6-1.5 9 .5v14c-3-2-6-2-9-.5zM22 5c-3-1.5-6-1.5-9 .5v14c3-2 6-2 9-.5z"/>',
    trophy: '<path d="M7 3h10v2h4v3a5 5 0 01-4.6 5A5 5 0 0113 16v2h3v3H8v-3h3v-2a5 5 0 01-3.4-3A5 5 0 013 8V5h4zM5 7v1a3 3 0 002.2 2.9L7 7zm14 0h-2l-.2 3.9A3 3 0 0019 8z"/>',
    lock: '<path d="M7 10V7a5 5 0 0110 0v3h1.5v11h-13V10zm2.5 0h5V7a2.5 2.5 0 00-5 0z"/>',
    close: '<path d="M5.5 3.4L12 9.9l6.5-6.5 2.1 2.1L14.1 12l6.5 6.5-2.1 2.1L12 14.1l-6.5 6.5-2.1-2.1L9.9 12 3.4 5.5z"/>',
    restart: '<path d="M12 4a8 8 0 11-7.4 5h2.8A5.5 5.5 0 1012 6.5V9L7 5l5-4z"/>',
    map: '<path d="M2 5l6-2 8 2 6-2v16l-6 2-8-2-6 2zm6 0v13.5M16 7v13"/><path d="M8 3v15.5M16 5v15.5" stroke="currentColor" stroke-width="1.6" fill="none"/>',
    clock: '<path d="M12 2a10 10 0 110 20 10 10 0 010-20zm0 2.5a7.5 7.5 0 100 15 7.5 7.5 0 000-15zM11 6h2v5.4l3.6 2.1-1 1.7L11 12.6z"/>',
    star: '<path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.2 5.8 20.9l1.6-7L2 9.2l7.1-.6z"/>',
    shield: '<path d="M12 2l8.5 3v6c0 5.3-3.6 9.5-8.5 11-4.9-1.5-8.5-5.7-8.5-11V5z"/>',
    rayo: '<path d="M13.5 1L4 13.5h6.2L8.5 23 20 9.5h-6.6z"/>',
    escudo: '<path d="M12 3a10 10 0 0110 10v1H2v-1A10 10 0 0112 3z" opacity=".55"/><path d="M12 6l5.5 2v4c0 3.5-2.4 6.3-5.5 7.3-3.1-1-5.5-3.8-5.5-7.3V8z"/><rect x="1" y="19" width="22" height="2.5" rx="1"/>',
    sopor: '<path d="M13 3a8.5 8.5 0 108 11.4A7 7 0 0113 3z"/><path d="M15 3h5v1.5l-3 3.2h3V9h-5V7.6l3-3.2h-3z"/>',
    ventisca: '<path d="M11 1h2v4.2l2.4-1.6 1.1 1.6L13 7.6V10.3l2.4-1.4V4.8h2v3l2.6-1.5 1 1.7-2.6 1.5 2.6 1.5-1 1.7-3.6-2-2.4 1.4L15.4 13.6l3.6-2 1 1.7-2.6 1.5 2.6 1.5-1 1.7-2.6-1.5v3h-2v-4.1L13 13.7v2.7l3.5 2.4-1.1 1.6-2.4-1.6V23h-2v-4.2l-2.4 1.6-1.1-1.6 3.5-2.4v-2.7l-2.4 1.4v4.1h-2v-3l-2.6 1.5-1-1.7 2.6-1.5L2 13.3l1-1.7 3.6 2 2.4-1.4L6.6 10.8l-3.6 2-1-1.7 2.6-1.5L2 8.1l1-1.7 2.6 1.5v-3h2v4.1L10 10.3V7.6L6.5 5.2l1.1-1.6L11 5.2z"/>',
    meteoro: '<circle cx="15" cy="15" r="6"/><path d="M2 2l9 5-2 2zM5 1l8 6.5-1.5 1.5zM1 6l7.5 6.5L10 11z" opacity=".75"/>',
    banner: '<path d="M5 2h2v20H5zM8 3h11l-3 4.5L19 12H8z"/>',
    tree: '<path d="M12 2c3.5 0 6 2.6 6 5.6 1.7.8 2.8 2.4 2.8 4.3 0 2.7-2.3 4.8-5 4.8H13V22h-2v-5.3H8.2c-2.7 0-5-2.1-5-4.8 0-1.9 1.1-3.5 2.8-4.3C6 4.6 8.5 2 12 2z"/>',
    wave: '<path d="M2 9c2.5-2.6 5-2.6 7.5 0s5 2.6 7.5 0 3.5-2 5-1v3c-1.5-1-3.3-1.2-5 .7-2.5 2.6-5 2.6-7.5 0s-5-2.6-7.5 0zM2 16c2.5-2.6 5-2.6 7.5 0s5 2.6 7.5 0 3.5-2 5-1v3c-1.5-1-3.3-1.2-5 .7-2.5 2.6-5 2.6-7.5 0s-5-2.6-7.5 0z"/>',
    sun: '<circle cx="12" cy="12" r="5"/><path d="M11 1h2v4h-2zM11 19h2v4h-2zM1 11h4v2H1zM19 11h4v2h-4zM4.2 2.8l2.8 2.8-1.4 1.4-2.8-2.8zM17 17l2.8 2.8-1.4 1.4-2.8-2.8zM2.8 19.8L5.6 17 7 18.4l-2.8 2.8zM17 5.6l2.8-2.8 1.4 1.4L18.4 7z"/>',
    fire: '<path d="M12 1c1 4 6 6 6 12a6 6 0 01-12 0c0-3 1.5-4.5 2.5-6 .3 2 1.2 3 2.3 3.4C10 7 11 4 12 1z"/>',
    helm: '<path d="M12 2c5 0 8.5 3.8 8.5 9v9h-6v-6.5h-5V20h-6v-9C3.5 5.8 7 2 12 2zm-6 9h12v1.6H6z"/>',
    crown: '<path d="M2 7l5 4 5-7 5 7 5-4-2 11H4zM4 19h16v2.5H4z"/>',
    bolt: '<path d="M13.5 1L4 13.5h6.2L8.5 23 20 9.5h-6.6z"/>',
    hammer: '<path d="M3 5l6-3 4 4-2 2 9.5 9.5-2.5 2.5L8.5 10.5l-2 2-4-4z"/>',
    castle: '<path d="M2 8h3v2h2V8h3v3h4V8h3v2h2V8h3v14h-8v-5a2 2 0 00-4 0v5H2z"/>',
    people: '<circle cx="8" cy="7" r="3.2"/><circle cx="16.5" cy="7.5" r="2.8"/><path d="M2 20c0-4 2.7-7 6-7s6 3 6 7zM14 20c.2-2.2-.4-4.3-1.6-5.9.9-.9 2.2-1.4 3.6-1.4 2.9 0 5 2.6 5 6.3V20z"/>',
    army: '<circle cx="6" cy="6" r="2.4"/><circle cx="12" cy="5" r="2.4"/><circle cx="18" cy="6" r="2.4"/><path d="M2 16c0-3 1.8-5.5 4-5.5s4 2.5 4 5.5zM8 15c0-3 1.8-5.5 4-5.5s4 2.5 4 5.5zM14 16c0-3 1.8-5.5 4-5.5s4 2.5 4 5.5zM2 18h20v3H2z"/>',
    horse: '<path d="M7 22v-3.5c-1.5-1-2.5-3-2-5.5l1.2-5L4 6l3-1 1.5 1.5L11 3l1 3c4 .8 7 4.2 7 9v7h-3v-5l-3-2v7z"/>',
    anvil: '<path d="M3 6h14l4 3c-2.5 0-4.5 1-5.5 3H14v3h4v3H6v-3h4v-3H7C5 12 3.5 10 3 6z"/>',
    arrow: '<path d="M3 21l11-11-2.2-.8L15 3l1 4.5L20.5 9 14 12.2l-.8-2.2-11 11z"/>',
    magic: '<path d="M2 20.6L15.6 7l1.4 1.4L3.4 22zM17 1l1 2.6 2.6 1L18 5.6l-1 2.6-1-2.6-2.6-1L16 3.6zM20.5 9l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6zM10 2l.6 1.4L12 4l-1.4.6L10 6l-.6-1.4L8 4l1.4-.6z"/>',
    orb: '<circle cx="12" cy="11" r="8"/><path d="M5 20h14v2.5H5z"/><circle cx="9" cy="8" r="2.2" fill="#fff" opacity=".6"/>',
    sword: '<path d="M18.5 2H22v3.5L10.5 17l-3.5-3.5zM5.5 13l5.5 5.5-1.5 1.5-1.8-1.8-2.7 2.7.2 1.1-1.1 1.1-2.6-2.6 1.1-1.1 1.1.2 2.7-2.7L4 14.5z"/>',
    flag: '<path d="M4 2h2v20H4zM7 3h13v10H7z"/>',
    phoenix: '<path d="M12 22c-3-3-4-6-3-9-2 1-4 0-6-3 3 0 5-1 6.5-3C10 4 11 2.5 12 1c1 1.5 2 3 2.5 6 1.5 2 3.5 3 6.5 3-2 3-4 4-6 3 1 3 0 6-3 9z"/>',
    skull: '<path d="M12 2c5 0 8.5 3.4 8.5 8 0 2.8-1.4 4.6-3.5 5.6V20h-3v-2h-1v2h-2v-2h-1v2H7v-4.4C4.9 14.6 3.5 12.8 3.5 10 3.5 5.4 7 2 12 2zM8.5 9a2 2 0 100 4 2 2 0 000-4zm7 0a2 2 0 100 4 2 2 0 000-4z"/>',
    dice: '<path d="M4 3h16a1 1 0 011 1v16a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1zm3.5 3a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm9 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM12 10.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM7.5 15a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm9 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3z"/>',
    snow: '<path d="M11 1h2v22h-2zM1.6 6.4l1-1.7 19.8 11.4-1 1.7zM1.6 17.6L21.4 6.2l1 1.7L2.6 19.3z"/><circle cx="12" cy="12" r="3"/>',
    up: '<path d="M12 3l8 9h-5v9H9v-9H4z"/>',
    sound: '<path d="M3 9h4l5-5v16l-5-5H3zM15 8a5 5 0 010 8M17.5 5a9 9 0 010 14" stroke="currentColor" stroke-width="2" fill="none"/>',
    full: '<path d="M3 3h7v2.5H5.5V10H3zM14 3h7v7h-2.5V5.5H14zM3 14h2.5v4.5H10V21H3zM18.5 14H21v7h-7v-2.5h4.5z"/>'
  };
  FF.icon = function (name, cls) {
    return '<svg class="i ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (I[name] || I.star) + '</svg>';
  };
  FF.ICONS = I;

  /* escudo heráldico del logotipo */
  FF.crestSVG = function () {
    return '<svg class="crest" viewBox="0 0 120 130"><defs>' +
      '<linearGradient id="cg1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffeaa6"/><stop offset=".5" stop-color="#f4c95d"/><stop offset="1" stop-color="#a8721a"/></linearGradient>' +
      '<linearGradient id="cg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f8dff"/><stop offset="1" stop-color="#173a7a"/></linearGradient>' +
      '<linearGradient id="cg3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff7a62"/><stop offset="1" stop-color="#761910"/></linearGradient></defs>' +
      '<path d="M18 22 L102 22 L112 12 L112 60 C112 95 88 116 60 126 C32 116 8 95 8 60 L8 12 Z" fill="url(#cg1)" stroke="#4a2a06" stroke-width="3"/>' +
      '<path d="M20 30 L60 30 L60 116 C40 106 20 90 20 60 Z" fill="url(#cg2)"/>' +
      '<path d="M60 30 L100 30 L100 60 C100 90 80 106 60 116 Z" fill="url(#cg3)"/>' +
      '<path d="M38 74 h44 v-22 h-6 v6 h-6 v-6 h-6 v6 h-6 v-6 h-8 v6 h-6 v-6 h-6 z" fill="#f4e7c5" stroke="#4a2a06" stroke-width="2"/>' +
      '<path d="M54 74 v-8 a6 6 0 0 1 12 0 v8 z" fill="#3a2410"/>' +
      '<path d="M30 92 L90 40 M90 92 L30 40" stroke="#e8ecf1" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M30 92 L90 40 M90 92 L30 40" stroke="#4a2a06" stroke-width="1.2" stroke-linecap="round" opacity=".6"/>' +
      '<circle cx="27" cy="95" r="5" fill="url(#cg1)" stroke="#4a2a06" stroke-width="1.5"/><circle cx="93" cy="95" r="5" fill="url(#cg1)" stroke="#4a2a06" stroke-width="1.5"/>' +
      '<path d="M44 8 L52 16 L60 4 L68 16 L76 8 L74 20 L46 20 Z" fill="url(#cg1)" stroke="#4a2a06" stroke-width="2"/>' +
      '</svg>';
  };

  /* banderín de nivel para el mapa de campaña */
  FF.flagSVG = function (fill, dark) {
    return '<svg viewBox="0 0 40 46"><path d="M5 2 v42" stroke="#3a2410" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M7 4 h28 v20 l-14 7 l-14 -7 z" fill="' + fill + '" stroke="' + dark + '" stroke-width="2"/>' +
      '<path d="M7 4 h28 v4 h-28 z" fill="rgba(255,255,255,0.35)"/></svg>';
  };
})(globalThis.FF = globalThis.FF || {});
