"""Tabla de recursos de Android (resources.arsc): escritura y lectura de lo justo para los iconos."""
import struct
from axml import string_pool, read_pool

RES_TABLE_TYPE = 0x0002
RES_TABLE_PACKAGE_TYPE = 0x0200
RES_TABLE_TYPE_TYPE = 0x0201
RES_TABLE_TYPE_SPEC_TYPE = 0x0202
TYPE_STRING = 0x03
TYPE_INT_COLOR_ARGB8 = 0x1c
NO_ENTRY = 0xFFFFFFFF
CONFIG_DENSITY, CONFIG_VERSION = 0x0100, 0x0400
CONFIG_SIZE = 64

DENSIDADES = {'mdpi': 160, 'hdpi': 240, 'xhdpi': 320, 'xxhdpi': 480, 'xxxhdpi': 640, 'anydpi': 0xFFFE}


def config(density=0, sdk=0):
    """ResTable_config con sólo densidad y versión mínima del sistema."""
    c = bytearray(CONFIG_SIZE)
    struct.pack_into('<I', c, 0, CONFIG_SIZE)
    struct.pack_into('<H', c, 14, density)
    struct.pack_into('<H', c, 24, sdk)
    return bytes(c)


def build(package_id, package_name, types):
    """types: [(nombre_tipo, [(clave, [(config, ruta_archivo), …]), …]), …]  (sólo recursos de archivo).
    El tipo n (desde 1) y la entrada k (desde 0) dan el identificador 0xPPTTEEEE."""
    paths, keys = [], []
    for _, entries in types:
        for key, variants in entries:
            keys.append(key)
            for _, path in variants:
                if path not in paths:
                    paths.append(path)
    pidx = {p: k for k, p in enumerate(paths)}
    kidx = {k: n for n, k in enumerate(keys)}

    chunks = bytearray()
    for tid, (tname, entries) in enumerate(types, start=1):
        n = len(entries)
        flags = []
        for key, variants in entries:
            f = 0
            if len({c[14:16] for c, _ in variants}) > 1 or any(c[14:16] != b'\0\0' for c, _ in variants):
                f |= CONFIG_DENSITY
            if any(c[24:26] != b'\0\0' for c, _ in variants):
                f |= CONFIG_VERSION
            flags.append(f)
        chunks += struct.pack('<HHI', RES_TABLE_TYPE_SPEC_TYPE, 16, 16 + 4 * n) + struct.pack('<BBHI', tid, 0, 0, n)
        chunks += b''.join(struct.pack('<I', f) for f in flags)
        # un bloque por configuración distinta
        cfgs = []
        for key, variants in entries:
            for c, _ in variants:
                if c not in cfgs:
                    cfgs.append(c)
        for c in cfgs:
            offs, body = [], bytearray()
            for key, variants in entries:
                path = next((p for cc, p in variants if cc == c), None)
                if path is None:
                    offs.append(NO_ENTRY)
                    continue
                offs.append(len(body))
                body += struct.pack('<HHI', 8, 0, kidx[key]) + struct.pack('<HBBI', 8, 0, TYPE_STRING, pidx[path])
            hs = 20 + len(c)
            start = hs + 4 * n
            chunks += struct.pack('<HHI', RES_TABLE_TYPE_TYPE, hs, start + len(body))
            chunks += struct.pack('<BBHII', tid, 0, 0, n, start) + c
            chunks += b''.join(struct.pack('<I', o) for o in offs) + bytes(body)

    tstr = string_pool([t for t, _ in types])
    kstr = string_pool(keys)
    hs = 288
    name16 = package_name.encode('utf-16-le')[:254].ljust(256, b'\0')
    pkg_body = tstr + kstr + bytes(chunks)
    pkg = struct.pack('<HHI', RES_TABLE_PACKAGE_TYPE, hs, hs + len(pkg_body)) + struct.pack('<I', package_id) + name16
    pkg += struct.pack('<IIIII', hs, len(types), hs + len(tstr), len(keys), 0) + pkg_body
    body = string_pool(paths) + pkg
    return struct.pack('<HHI', RES_TABLE_TYPE, 12, 12 + len(body)) + struct.pack('<I', 1) + body


def decode(buf):
    """Lista legible de la tabla, para comprobarla."""
    t, hs, size, npk = struct.unpack_from('<HHII', buf, 0)
    assert t == RES_TABLE_TYPE and size == len(buf) and npk == 1, 'cabecera de tabla incorrecta'
    off = hs
    values, n = read_pool(buf, off)
    off += n
    ct, phs, psize, pid = struct.unpack_from('<HHII', buf, off)
    assert ct == RES_TABLE_PACKAGE_TYPE and off + psize == len(buf), 'paquete incorrecto'
    pname = buf[off + 12:off + 12 + 256].decode('utf-16-le').rstrip('\0')
    tso, ntypes, kso, nkeys = struct.unpack_from('<IIII', buf, off + 268)
    tnames, _ = read_pool(buf, off + tso)
    knames, _ = read_pool(buf, off + kso)
    out = ['paquete 0x%02x %s' % (pid, pname)]
    p = off + phs
    end = off + psize
    # saltar los dos bloques de cadenas
    for _ in range(2):
        p += struct.unpack_from('<HHI', buf, p)[2]
    inv = {v: k for k, v in DENSIDADES.items()}
    while p < end:
        ct, chs, csize = struct.unpack_from('<HHI', buf, p)
        if ct == RES_TABLE_TYPE_SPEC_TYPE:
            tid, _, _, cnt = struct.unpack_from('<BBHI', buf, p + 8)
            out.append('  tipo %d «%s»: %d entradas' % (tid, tnames[tid - 1], cnt))
        elif ct == RES_TABLE_TYPE_TYPE:
            tid, fl, _, cnt, start = struct.unpack_from('<BBHII', buf, p + 8)
            csz = struct.unpack_from('<I', buf, p + 20)[0]
            assert 20 + csz == chs, 'tamaño de configuración incorrecto'
            dens, sdk = struct.unpack_from('<H', buf, p + 34)[0], struct.unpack_from('<H', buf, p + 44)[0]
            q = '%s-v%d' % (inv.get(dens, str(dens)), sdk)
            for e in range(cnt):
                eo = struct.unpack_from('<I', buf, p + chs + 4 * e)[0]
                if eo == NO_ENTRY:
                    continue
                esz, efl, key = struct.unpack_from('<HHI', buf, p + start + eo)
                vsz, _, dt, data = struct.unpack_from('<HBBI', buf, p + start + eo + 8)
                rid = (pid << 24) | (tid << 16) | e
                val = values[data] if dt == TYPE_STRING else '0x%08x' % data
                out.append('    0x%08x %s/%s [%s] = %s' % (rid, tnames[tid - 1], knames[key], q, val))
        p += csize
    return '\n'.join(out)
