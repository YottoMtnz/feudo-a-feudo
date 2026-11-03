/* Feudo a Feudo — plataforma: navegador, app de Windows o app de Android */
(function (FF) {
  'use strict';
  const inj = globalThis.FEUDO_HOST || null;          /* lo inyecta el lanzador de Windows */
  const ua = (globalThis.navigator && navigator.userAgent) || '';
  const H = FF.Host = {
    platform: 'web', desktop: false, android: false, info: inj, api: null, token: null
  };
  if (inj && inj.platform === 'windows') {
    H.platform = 'windows'; H.desktop = true; H.api = inj.api || '/api'; H.token = inj.token || '';
  } else if (typeof location !== 'undefined' && (/android/i.test(location.hash) || (/Android/.test(ua) && /; wv\)/.test(ua)))) {
    H.platform = 'android'; H.android = true;
  }
  H.canQuit = H.desktop || H.android;

  H.post = function (path, body) {
    if (!H.desktop) return Promise.reject(new Error('sin anfitrión'));
    return fetch(H.api + path, {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', 'X-Feudo': H.token },
      body: JSON.stringify(body == null ? {} : body)
    }).then((r) => r.json());
  };

  H.quit = function () {
    if (H.desktop) {
      if (H.flushSave) H.flushSave();
      H.post('/salir').catch(() => {});
      setTimeout(() => { try { window.close(); } catch (e) { /* */ } }, 250);
    } else if (H.android) {
      location.href = 'feudo://salir';
    }
  };

  /* guardado en disco cuando hay app de escritorio (independiente del navegador) */
  let saveTimer = null, pending = null;
  const sendSave = (body) => {
    fetch(H.api + '/partida', {
      method: 'POST', keepalive: body.length < 60000,
      headers: { 'Content-Type': 'application/json', 'X-Feudo': H.token }, body
    }).catch(() => {});
  };
  H.storeSave = function (json) {
    if (!H.desktop) return;
    pending = json;
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      const body = pending; pending = null;
      if (body) sendSave(body);
    }, 400);
  };
  /* guarda ya lo pendiente (al cerrar la ventana) */
  H.flushSave = function () {
    if (!H.desktop || !pending) return;
    const body = pending; pending = null;
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    let ok = false;
    try { ok = navigator.sendBeacon(H.api + '/partida?t=' + encodeURIComponent(H.token), new Blob([body], { type: 'text/plain' })); } catch (e) { /* */ }
    if (!ok) sendSave(body);
  };

  /* canal con el lanzador: mientras está abierto, el lanzador sabe que la ventana existe;
     por él llegan también sus avisos (cerrar la ventana para reabrirla con otros ajustes) */
  if (H.desktop && typeof EventSource !== 'undefined') {
    const es = new EventSource(H.api + '/canal?t=' + encodeURIComponent(H.token));
    es.addEventListener('cerrar', () => {
      H.flushSave();
      setTimeout(() => { try { window.close(); } catch (e) { /* */ } }, 150);
    });
    es.addEventListener('enfocar', () => { try { window.focus(); } catch (e) { /* */ } });
    H.channel = es;
    window.addEventListener('pagehide', () => H.flushSave());
  }

  /* Alt+Enter: pantalla completa ⇄ ventana (la ventana del juego se reabre con el otro modo).
     F11 hace lo mismo desde la ventana, para que no ponga la pantalla completa del navegador, la de
     la barra que baja al acercar el ratón arriba; en pantalla completa, F11 lo retiene el navegador. */
  if (H.desktop) {
    window.addEventListener('keydown', (e) => {
      if (!((e.key === 'Enter' && e.altKey) || e.key === 'F11')) return;
      e.preventDefault(); e.stopPropagation();
      if (!e.repeat && FF.UI && FF.UI.toggleDisplayMode) FF.UI.toggleDisplayMode();
    }, true);
  }
})(globalThis.FF = globalThis.FF || {});
