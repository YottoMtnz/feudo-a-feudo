#!/usr/bin/env python3
"""Comprueba los recursos de un .exe de Windows (icono, manifiesto y versión). Uso: check_pe.py archivo.exe"""
import struct, sys

data = open(sys.argv[1], 'rb').read()
pe = struct.unpack_from('<I', data, 0x3C)[0]
assert data[pe:pe + 4] == b'PE\0\0', 'no es un PE'
machine, nsec, _, _, _, optsize, chars = struct.unpack_from('<HHIIIHH', data, pe + 4)
opt = pe + 24
magic = struct.unpack_from('<H', data, opt)[0]
subsystem = struct.unpack_from('<H', data, opt + 68)[0]
ndirs = struct.unpack_from('<I', data, opt + (108 if magic == 0x20b else 92))[0]
dd = opt + (112 if magic == 0x20b else 96)
rsrc_rva, rsrc_size = struct.unpack_from('<II', data, dd + 8 * 2)
secs = []
so = opt + optsize
for i in range(nsec):
    name, vsize, va, rsize, rptr = struct.unpack_from('<8sIIII', data, so + 40 * i)
    secs.append((name.rstrip(b'\0').decode(), va, vsize, rptr, rsize))

def rva2off(rva):
    for n, va, vs, rp, rs in secs:
        if va <= rva < va + max(vs, rs):
            return rp + rva - va
    raise ValueError('RVA fuera de secciones: %x' % rva)

print('máquina %#x, subsistema %d (%s), secciones: %s' % (machine, subsystem, 'GUI' if subsystem == 2 else 'consola', ', '.join(s[0] for s in secs)))
assert rsrc_rva, 'el ejecutable no tiene recursos'
base = rva2off(rsrc_rva)

def walk(off, depth, path, out):
    _, _, _, _, nnamed, nid = struct.unpack_from('<IIHHHH', data, base + off)
    for k in range(nnamed + nid):
        name, target = struct.unpack_from('<II', data, base + off + 16 + 8 * k)
        if target & 0x80000000:
            walk(target & 0x7FFFFFFF, depth + 1, path + [name], out)
        else:
            drva, size, _, _ = struct.unpack_from('<IIII', data, base + target)
            out.append((path + [name], rva2off(drva), size))

res = []
walk(0, 0, [], res)
NAMES = {3: 'ICON', 14: 'GROUP_ICON', 16: 'VERSION', 24: 'MANIFEST'}
for p, off, size in res:
    print('  %-10s id=%-3d idioma=%#06x  %7d bytes' % (NAMES.get(p[0], p[0]), p[1], p[2], size))
icons = [r for r in res if r[0][0] == 3]
for p, off, size in icons:
    assert data[off:off + 8] == b'\x89PNG\r\n\x1a\n', 'icono %d no es PNG' % p[1]
grp = [r for r in res if r[0][0] == 14][0]
cnt = struct.unpack_from('<H', data, grp[1] + 4)[0]
print('  grupo de iconos con %d tamaños' % cnt)
man = [r for r in res if r[0][0] == 24][0]
txt = data[man[1]:man[1] + man[2]].decode()
assert '<assembly' in txt and 'permonitorv2' in txt
ver = [r for r in res if r[0][0] == 16][0]
vtxt = data[ver[1]:ver[1] + ver[2]].decode('utf-16-le', 'ignore')
for k in ('Fraudy Martinez', 'Feudo a Feudo', 'ProductVersion'):
    assert k in vtxt, 'falta %s en la versión' % k
print('OK: icono, manifiesto y versión correctos')
