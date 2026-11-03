#!/usr/bin/env python3
"""Feudo a Feudo — genera los iconos (web, Windows .ico y Android) a partir del escudo del juego.
Uso: python3 tools/icon/make-icons.py   (necesita Node, Playwright con Chromium y Pillow)"""
import asyncio, json, os, subprocess, io
from PIL import Image
from playwright.async_api import async_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'tools', 'icon')

svg = subprocess.check_output(['node', '-e', "require('%s/js/ui/icons.js'); process.stdout.write(globalThis.FF.crestSVG())" % ROOT]).decode()
svg = svg.replace('class="crest"', 'width="100%" height="100%"')

PAGE = """<!doctype html><html><head><style>html,body{margin:0;background:transparent}
#t{width:1024px;height:1024px;display:flex;align-items:center;justify-content:center}
#t.fondo{background:radial-gradient(circle at 50% 38%,#6b4527 0%,#3a2210 70%,#24160b 100%);border-radius:22%;box-shadow:inset 0 0 0 26px #c79a3e,inset 0 0 0 40px #4a2a06}
#t.lienzo{background:radial-gradient(circle at 50% 40%,#7a512c 0%,#4b2c13 46%,#2a170a 78%,#1a0e06 100%)}
#t.lienzo::before{content:'';position:absolute;inset:0;opacity:.18;background:repeating-linear-gradient(97deg,rgba(0,0,0,.5) 0 3px,transparent 3px 19px),repeating-linear-gradient(83deg,rgba(255,220,160,.25) 0 2px,transparent 2px 31px)}
#t{position:relative}
#s{position:relative;width:{SIZE};height:{SIZE};filter:drop-shadow(0 18px 18px rgba(0,0,0,.55))}</style></head>
<body><div id="t" class="{CLS}"><div id="s">{SVG}</div></div></body></html>"""

async def render(fondo, frac, svg_html=None):
    """fondo: '' (transparente), 'fondo' (madera con marco dorado) o 'lienzo' (madera a sangre, para iconos adaptables)"""
    async with async_playwright() as p:
        exe = '/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None
        b = await p.chromium.launch(executable_path=exe)
        pg = await b.new_page(viewport={'width': 1024, 'height': 1024})
        size = str(int(1024 * frac)) + 'px'
        cls = fondo if isinstance(fondo, str) else ('fondo' if fondo else '')
        await pg.set_content(PAGE.replace('{SIZE}', size).replace('{CLS}', cls).replace('{SVG}', svg if svg_html is None else svg_html))
        await pg.wait_for_timeout(200)
        png = await pg.locator('#t').screenshot(omit_background=True)
        await b.close()
        return Image.open(io.BytesIO(png)).convert('RGBA')

async def main():
    plain = await render(False, 0.96)
    framed = await render(True, 0.72)
    # web
    plain.resize((192, 192), Image.LANCZOS).save(os.path.join(ROOT, 'img', 'icono-192.png'))
    plain.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'icono-512.png'))
    # Windows: .ico con PNG en cada tamaño
    sizes = [256, 128, 64, 48, 32, 24, 16]
    for s in sizes:
        plain.resize((s, s), Image.LANCZOS).save(os.path.join(OUT, 'win-%d.png' % s), optimize=True)
    plain.resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, 'feudo.ico'), sizes=[(s, s) for s in sizes])
    # Android (xxxhdpi = 192 px)
    framed.resize((192, 192), Image.LANCZOS).save(os.path.join(OUT, 'android-192.png'), optimize=True)
    framed.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'android-512.png'), optimize=True)
    # Android 8+: icono adaptable (capa de fondo a sangre + escudo dentro de la zona segura), 108 dp → 432 px
    lienzo = await render('lienzo', 0.0, '')
    frente = await render('', 0.50)
    lienzo.convert('RGB').resize((432, 432), Image.LANCZOS).save(os.path.join(OUT, 'android-fondo-432.png'), optimize=True)
    frente.resize((432, 432), Image.LANCZOS).save(os.path.join(OUT, 'android-frente-432.png'), optimize=True)
    print('iconos generados en', OUT)

asyncio.run(main())
