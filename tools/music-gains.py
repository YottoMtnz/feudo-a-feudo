#!/usr/bin/env python3
"""Feudo a Feudo — iguala el volumen de las pistas de música.
Mide la sonoridad (LUFS, EBU R128) de cada archivo de js/audio/tracks.js con ffmpeg y escribe su
"gain" para que todas suenen igual de fuerte: −19 LUFS con la música al 100 % (las melodías de
victoria y derrota, 1,5 dB más presentes). No toca los archivos de audio.
Uso: python3 tools/music-gains.py        (necesita ffmpeg)"""
import json, os, re, subprocess, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
TRACKS = os.path.join(ROOT, 'js', 'audio', 'tracks.js')
OBJETIVO = -19.0
OBJETIVO_JINGLE = -17.5

def sonoridad(ruta):
    t = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', ruta, '-map', '0:a', '-af', 'loudnorm=print_format=json', '-f', 'null', '-'],
                       capture_output=True, text=True).stderr
    j = json.loads(t[t.rindex('{'):t.rindex('}') + 1])
    return float(j['input_i']), float(j['input_tp'])

src = open(TRACKS, encoding='utf-8').read()
lineas = src.split('\n')
for n, linea in enumerate(lineas):
    m = re.search(r"file: '([^']+)', gain: ([0-9.]+)", linea)
    if not m:
        continue
    ruta = os.path.join(ROOT, m.group(1))
    if not os.path.exists(ruta):
        print('  falta  %s (ese hueco usará la música del juego)' % m.group(1))
        continue
    lufs, pico = sonoridad(ruta)
    objetivo = OBJETIVO_JINGLE if 'loop: false' in linea else OBJETIVO
    g = min(1.0, 10 ** ((objetivo - lufs) / 20))
    aviso = '' if objetivo - lufs <= 1.0 else '  ← %.1f dB más baja que el resto: súbela con un editor de audio' % (objetivo - lufs)
    lineas[n] = linea.replace(m.group(0), "file: '%s', gain: %s" % (m.group(1), ('%.3f' % g).rstrip('0').rstrip('.')))
    print('  %-46s %6.2f LUFS  pico %5.2f dBTP  → gain %.3f%s' % (os.path.basename(ruta), lufs, pico, g, aviso))
open(TRACKS, 'w', encoding='utf-8').write('\n'.join(lineas))
print('Listo: js/audio/tracks.js actualizado.')
