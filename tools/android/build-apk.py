#!/usr/bin/env python3
"""Feudo a Feudo — compila la app de Android: dist/FeudoAFeudo.apk

No necesita el SDK de Android: el manifiesto y los recursos se escriben aquí en su formato binario,
el código (MainActivity.smali) lo ensambla tools/android/dex.py y la firma la pone jarsigner (Java).
Requisitos: Python 3 con Pillow, y Java (keytool y jarsigner).
Uso: python3 tools/android/build-apk.py"""
import io, os, re, shutil, struct, subprocess, sys, zipfile

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import axml, arsc, dex  # noqa: E402
from axml import E, s, i, h, b, ref  # noqa: E402
from PIL import Image  # noqa: E402

ROOT = os.path.abspath(os.path.join(AQUI, '..', '..'))
DIST = os.path.join(ROOT, 'dist')
PKG = 'com.fraudy.feudo'
NOMBRE = 'Feudo a Feudo'
MIN_SDK, TARGET_SDK = 21, 29
KEYSTORE = os.path.join(AQUI, 'feudo.keystore')
ALIAS, CLAVE = 'feudo', 'feudoafeudo'

VERSION = re.search(r"FF\.VERSION = '([^']+)'", open(os.path.join(ROOT, 'js', 'main.js'), encoding='utf-8').read()).group(1)
_p = [int(x) for x in (VERSION.split('.') + ['0'])[:2]]
VERSION_CODE = _p[0] * 100 + _p[1]          # 1.1 → 101

# identificadores de recurso (tipo 1 = drawable, tipo 2 = mipmap)
R_FONDO, R_FRENTE, R_ICONO = 0x7F010000, 0x7F010001, 0x7F020000
THEME_FULLSCREEN = 0x01030007               # @android:style/Theme.NoTitleBar.Fullscreen


def manifiesto():
    return E('manifest', [('android', 'versionCode', i(VERSION_CODE)), ('android', 'versionName', s(VERSION)), (None, 'package', s(PKG))], [
        E('uses-sdk', [('android', 'minSdkVersion', i(MIN_SDK)), ('android', 'targetSdkVersion', i(TARGET_SDK))]),
        E('application', [('android', 'theme', ref(THEME_FULLSCREEN)), ('android', 'label', s(NOMBRE)), ('android', 'icon', ref(R_ICONO)),
                          ('android', 'allowBackup', b(True)), ('android', 'hardwareAccelerated', b(True))], [
            E('activity', [('android', 'label', s(NOMBRE)), ('android', 'name', s(PKG + '.MainActivity')), ('android', 'exported', b(True)),
                           ('android', 'launchMode', i(2)),             # singleTask
                           ('android', 'screenOrientation', i(6)),      # sensorLandscape
                           ('android', 'configChanges', h(0x0FB0))], [  # no reiniciar al girar, teclado, tamaño…
                E('intent-filter', [], [
                    E('action', [('android', 'name', s('android.intent.action.MAIN'))]),
                    E('category', [('android', 'name', s('android.intent.category.LAUNCHER'))]),
                ]),
            ]),
        ]),
    ])


def icono_adaptable():
    return E('adaptive-icon', [], [
        E('background', [('android', 'drawable', ref(R_FONDO))]),
        E('foreground', [('android', 'drawable', ref(R_FRENTE))]),
    ])


def png(im):
    buf = io.BytesIO()
    im.save(buf, 'PNG', optimize=True)
    return buf.getvalue()


def recursos():
    """Devuelve (resources.arsc, {ruta: bytes})."""
    ic = os.path.join(ROOT, 'tools', 'icon')
    base = Image.open(os.path.join(ic, 'android-512.png')).convert('RGBA')
    files = {}
    variantes = []
    for q, px in (('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)):
        ruta = 'res/mipmap-%s-v4/icono.png' % q
        files[ruta] = png(base.resize((px, px), Image.LANCZOS))
        variantes.append((arsc.config(arsc.DENSIDADES[q], 4), ruta))
    files['res/mipmap-anydpi-v26/icono.xml'] = axml.encode(icono_adaptable())
    variantes.append((arsc.config(arsc.DENSIDADES['anydpi'], 26), 'res/mipmap-anydpi-v26/icono.xml'))
    xxx = arsc.config(arsc.DENSIDADES['xxxhdpi'], 4)
    for nombre, archivo in (('icono_fondo', 'android-fondo-432.png'), ('icono_frente', 'android-frente-432.png')):
        files['res/drawable-xxxhdpi-v4/%s.png' % nombre] = open(os.path.join(ic, archivo), 'rb').read()
    tabla = arsc.build(0x7F, PKG, [
        ('drawable', [('icono_fondo', [(xxx, 'res/drawable-xxxhdpi-v4/icono_fondo.png')]),
                      ('icono_frente', [(xxx, 'res/drawable-xxxhdpi-v4/icono_frente.png')])]),
        ('mipmap', [('icono', variantes)]),
    ])
    return tabla, files


def juego():
    """Archivos del juego para assets/www."""
    out = {}
    out['assets/www/index.html'] = open(os.path.join(ROOT, 'index.html'), 'rb').read()
    for carpeta in ('css', 'js', 'img', 'music'):
        for dp, dn, fn in os.walk(os.path.join(ROOT, carpeta)):
            dn.sort()
            for f in sorted(fn):
                if carpeta == 'music' and not f.lower().endswith(('.mp3', '.ogg')):
                    continue
                ruta = os.path.join(dp, f)
                out['assets/www/' + os.path.relpath(ruta, ROOT).replace(os.sep, '/')] = open(ruta, 'rb').read()
    return out


SIN_COMPRIMIR = ('.png', '.mp3', '.ogg', '.arsc')
FECHA = (2026, 1, 1, 0, 0, 0)


def extra_alineacion(inicio):
    """Campo extra mínimo (≥ 6 bytes) que deja los datos en múltiplo de 4."""
    for n in range(6, 12):
        if (inicio + n) % 4 == 0:
            return struct.pack('<HHH', 0xD935, n - 4, 4) + b'\0' * (n - 6)


def escribir_zip(entradas, destino):
    with zipfile.ZipFile(destino, 'w') as z:
        for nombre, datos in entradas:
            zi = zipfile.ZipInfo(nombre, FECHA)
            if nombre.endswith(SIN_COMPRIMIR):
                zi.compress_type = zipfile.ZIP_STORED
                inicio = z.fp.tell() + 30 + len(nombre.encode())
                if inicio % 4:
                    zi.extra = extra_alineacion(inicio)
                z.writestr(zi, datos)
            else:
                zi.compress_type = zipfile.ZIP_DEFLATED
                z.writestr(zi, datos, compresslevel=9)


# ---------------------------------------------------------------- firma v1 (JAR), como la de apksigner
# Se firma aquí y no con jarsigner: el jarsigner de Java 19+ añade a la firma un atributo
# (CMSAlgorithmProtection) que el verificador de Android no conoce y rechaza la instalación.

def linea_mf(texto):
    """Línea de manifiesto: máximo 72 bytes; lo demás continúa en líneas que empiezan por espacio."""
    b_ = texto.encode('utf-8')
    out, primera = b'', True
    while True:
        n = 72 if primera else 71
        trozo, b_ = b_[:n], b_[n:]
        out += (b'' if primera else b' ') + trozo + b'\r\n'
        primera = False
        if not b_:
            return out


def b64sha256(datos):
    import base64, hashlib
    return base64.b64encode(hashlib.sha256(datos).digest()).decode()


def firma_v1(entradas):
    """Devuelve los archivos META-INF (MANIFEST.MF, FEUDO.SF, FEUDO.RSA) para las entradas dadas."""
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.serialization import pkcs7, pkcs12
    cab = linea_mf('Manifest-Version: 1.0') + linea_mf('Created-By: 1.0 (Feudo a Feudo)') + b'\r\n'
    secciones = []
    for nombre, datos in entradas:
        sec = linea_mf('Name: ' + nombre) + linea_mf('SHA-256-Digest: ' + b64sha256(datos)) + b'\r\n'
        secciones.append((nombre, sec))
    mf = cab + b''.join(sec for _, sec in secciones)
    sf = (linea_mf('Signature-Version: 1.0') + linea_mf('Created-By: 1.0 (Feudo a Feudo)') +
          linea_mf('SHA-256-Digest-Manifest: ' + b64sha256(mf)) + b'\r\n')
    for nombre, sec in secciones:
        sf += linea_mf('Name: ' + nombre) + linea_mf('SHA-256-Digest: ' + b64sha256(sec)) + b'\r\n'
    clave, cert, _ = pkcs12.load_key_and_certificates(open(KEYSTORE, 'rb').read(), CLAVE.encode())
    rsa = (pkcs7.PKCS7SignatureBuilder().set_data(sf).add_signer(cert, clave, hashes.SHA256())
           .sign(serialization.Encoding.DER, [pkcs7.PKCS7Options.DetachedSignature, pkcs7.PKCS7Options.NoAttributes]))
    return [('META-INF/MANIFEST.MF', mf), ('META-INF/FEUDO.SF', sf), ('META-INF/FEUDO.RSA', rsa)]


def asegurar_clave():
    if os.path.exists(KEYSTORE):
        return
    print('   creando la clave de firma (tools/android/feudo.keystore)…')
    subprocess.run(['keytool', '-genkeypair', '-keystore', KEYSTORE, '-storetype', 'PKCS12', '-storepass', CLAVE, '-keypass', CLAVE,
                    '-alias', ALIAS, '-keyalg', 'RSA', '-keysize', '2048', '-sigalg', 'SHA256withRSA', '-validity', '10950',
                    '-dname', 'CN=Fraudy Martinez, O=Feudo a Feudo, C=ES'], check=True, capture_output=True)


def comprobar(apk):
    """Comprueba firma, alineación y el contenido binario."""
    if shutil.which('jarsigner'):
        r = subprocess.run(['jarsigner', '-verify', apk], capture_output=True, text=True)
        assert 'jar verified' in r.stdout, 'la firma no verifica:\n' + r.stdout + r.stderr
    data = open(apk, 'rb').read()
    with zipfile.ZipFile(apk) as z:
        # la firma: PKCS#7 sin atributos firmados (lo que mejor entiende cualquier versión de Android)
        from cryptography.hazmat.primitives.serialization import pkcs7
        rsa = z.read('META-INF/FEUDO.RSA')
        assert b'\x2a\x86\x48\x86\xf7\x0d\x01\x09\x34' not in rsa, 'la firma lleva CMSAlgorithmProtection'
        assert len(pkcs7.load_der_pkcs7_certificates(rsa)) == 1
        assert z.testzip() is None
        nombres = z.namelist()
        for zi in z.infolist():
            if zi.compress_type == zipfile.ZIP_STORED:
                n, e = struct.unpack_from('<HH', data, zi.header_offset + 26)
                assert (zi.header_offset + 30 + n + e) % 4 == 0, 'sin alinear: ' + zi.filename
        man = axml.decode(z.read('AndroidManifest.xml'))
        tab = arsc.decode(z.read('resources.arsc'))
        ico = axml.decode(z.read('res/mipmap-anydpi-v26/icono.xml'))
        dis = dex.disassemble(z.read('classes.dex'))
        for f in ('res/mipmap-mdpi-v4/icono.png', 'res/drawable-xxxhdpi-v4/icono_frente.png', 'assets/www/index.html', 'META-INF/MANIFEST.MF'):
            assert f in nombres, 'falta ' + f
        for linea in tab.split('\n'):
            m = re.search(r'= (res/\S+)$', linea)
            if m:
                assert m.group(1) in nombres, 'la tabla apunta a un archivo que no está: ' + m.group(1)
    return man, tab, ico, dis, nombres


def main():
    os.makedirs(DIST, exist_ok=True)
    print('== Feudo a Feudo %s para Android (versionCode %d, Android 5.0 o posterior)' % (VERSION, VERSION_CODE))
    clases = dex.parse_smali(open(os.path.join(AQUI, 'MainActivity.smali'), encoding='utf-8').read())
    codigo = dex.Dex(clases).build()
    tabla, res = recursos()
    www = juego()
    entradas = [('AndroidManifest.xml', axml.encode(manifiesto())), ('classes.dex', codigo), ('resources.arsc', tabla)]
    entradas += sorted(res.items()) + sorted(www.items())
    print('   %d archivos del juego (%.1f MB), %d de música' % (len(www), sum(len(v) for v in www.values()) / 1048576,
                                                            sum(1 for k in www if k.startswith('assets/www/music/'))))
    final = os.path.join(DIST, 'FeudoAFeudo.apk')
    asegurar_clave()
    escribir_zip(firma_v1(entradas) + entradas, final)
    man, tab, ico, dis, nombres = comprobar(final)
    if '-v' in sys.argv:
        print(man, tab, ico, dis, sep='\n\n')
    print('   firma v1 verificada, %d entradas alineadas' % len(nombres))
    print('OK: dist/FeudoAFeudo.apk (%.1f MB)' % (os.path.getsize(final) / 1048576))


if __name__ == '__main__':
    main()
