#!/usr/bin/env python3
"""Feudo a Feudo — sonidos grabados de batalla.

  python3 tools/build-sfx.py
      Lee sfx/*.mp3, mide su sonoridad y genera js/audio/sfx-data.js (los sonidos van dentro del
      juego en base64: funcionan igual en el navegador, en el archivo único, en Windows y en Android).

  python3 tools/build-sfx.py --preparar ORIGEN.wav NOMBRE
      Prepara un sonido nuevo: lo pasa a mono, le quita los silencios del principio y del final,
      le pone un fundido corto, deja su pico en -4 dBFS y lo guarda como sfx/NOMBRE.mp3.
      El nombre decide para qué se usa (ver GRUPOS en js/audio/battle.js):
        grito-*        grito de guerra al salir tus tropas
        grito-grupo*   grito de todo un ejército (ataques grandes)
        choque-*, tajo-*, golpe-*   espadas en las batallas
        esfuerzo-*     gritos durante la lucha
        muerte-*       soldado que cae
        tambores*, cuerno*          al empezar la batalla

Necesita ffmpeg."""
import base64, json, os, re, subprocess, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SFX = os.path.join(ROOT, 'sfx')
OUT = os.path.join(ROOT, 'js', 'audio', 'sfx-data.js')

# sonoridad de referencia de cada familia (sonoridad momentánea máxima, LUFS);
# el volumen de efectos del juego se aplica encima
OBJETIVO = [('grito-grupo', -13.0), ('grito', -14.0), ('tambores', -15.0), ('cuerno', -17.0),
            ('esfuerzo', -17.0), ('muerte', -18.0), ('choque', -17.0), ('tajo', -18.5), ('golpe', -18.0)]
# autoría para los créditos (por prefijo de nombre)
AUTORES = [('choque', 'StarNinjas'), ('tajo', 'StarNinjas'), ('grito-grupo', 'Universfield'), ('', 'Mixkit')]


def ff(*args):
    return subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-y'] + list(args), capture_output=True, text=True)


def medir(ruta):
    """Sonoridad momentánea máxima (ventana de 400 ms, vale también para golpes cortos) y pico real."""
    t = ff('-i', ruta, '-af', 'apad=pad_dur=1,ebur128=peak=true', '-f', 'null', '-').stderr
    ms = [float(m) for m in re.findall(r' M:\s*(-?[\d.]+)', t)]
    tp = re.findall(r'Peak:\s*(-?[\d.]+) dBFS', t)
    return max(ms), float(tp[-1]) if tp else 0.0


def preparar(origen, nombre, max_seg=None):
    os.makedirs(SFX, exist_ok=True)
    destino = os.path.join(SFX, nombre + '.mp3')
    # 1) mono, sin silencios al principio ni al final
    filtros = ['aformat=channel_layouts=mono',
               'silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.004',
               'areverse', 'silenceremove=start_periods=1:start_threshold=-52dB:start_silence=0.02', 'areverse']
    tmp = destino + '.tmp.wav'
    r = ff('-i', origen, '-af', ','.join(filtros), '-ar', '44100', tmp)
    if r.returncode:
        raise SystemExit(r.stderr[-800:])
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', tmp], capture_output=True, text=True).stdout)
    if max_seg and dur > max_seg:
        dur = max_seg
    fo = min(0.25 if dur > 2 else 0.04, dur * 0.3)
    # 2) fundidos y pico a -1 dBFS
    vol = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', tmp, '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True).stderr
    pico = float(re.search(r'max_volume: (-?[\d.]+) dB', vol).group(1))
    af = 'afade=t=in:d=0.003,afade=t=out:st=%.3f:d=%.3f,volume=%.2fdB' % (max(0, dur - fo), fo, -4.0 - pico)
    r = ff('-i', tmp, '-t', '%.3f' % dur, '-af', af, '-c:a', 'libmp3lame', '-b:a', '96k', '-ac', '1', '-ar', '44100', destino)
    os.remove(tmp)
    if r.returncode:
        raise SystemExit(r.stderr[-800:])
    return destino, dur


def generar():
    nombres = sorted(f[:-4] for f in os.listdir(SFX) if f.endswith('.mp3'))
    datos, autores = {}, []
    for n in nombres:
        ruta = os.path.join(SFX, n + '.mp3')
        lufs, tp = medir(ruta)
        objetivo = next(v for k, v in OBJETIVO if n.startswith(k)) if any(n.startswith(k) for k, _ in OBJETIVO) else -20.0
        g = 10 ** ((objetivo - lufs) / 20)
        g = min(g, 2.5)                                 # sin exagerar los que vienen muy bajos
        datos[n] = {'g': round(g, 3), 'b64': base64.b64encode(open(ruta, 'rb').read()).decode()}
        a = next(v for k, v in AUTORES if n.startswith(k))
        if a not in autores:
            autores.append(a)
        print('  %-16s M máx %6.1f LUFS  pico %5.1f dBTP  → volumen %.2f' % (n, lufs, tp, g))
    js = ('/* Feudo a Feudo — sonidos de batalla grabados (generado por tools/build-sfx.py; no editar a mano) */\n'
          'FF.SFX_DATA = ' + json.dumps(datos, separators=(',', ':')) + ';\n'
          'FF.SFX_CREDITS = ' + json.dumps(autores, ensure_ascii=False) + ';\n')
    open(OUT, 'w', encoding='utf-8').write(js)
    print('OK: js/audio/sfx-data.js (%d sonidos, %.0f KB)' % (len(datos), len(js) / 1024))


if __name__ == '__main__':
    if len(sys.argv) >= 4 and sys.argv[1] == '--preparar':
        d, s = preparar(sys.argv[2], sys.argv[3], float(sys.argv[4]) if len(sys.argv) > 4 else None)
        print('preparado:', os.path.relpath(d, ROOT), '%.2f s' % s)
    else:
        generar()
