#!/usr/bin/env python3
"""Feudo a Feudo — genera desktop/rsrc_windows_amd64.syso con los recursos del .exe:
icono (varios tamaños), manifiesto (DPI, controles comunes) e información de versión.
El enlazador de Go incorpora automáticamente los .syso del paquete.
Uso: python3 tools/windows/mkrsrc.py [versión]"""
import os, struct, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ICON = os.path.join(ROOT, 'tools', 'icon')
OUT = os.path.join(ROOT, 'desktop', 'rsrc_windows_amd64.syso')
VERSION = sys.argv[1] if len(sys.argv) > 1 else '1.1'
LANG = 0x0C0A  # español (España, alfabetización moderna)

RT_ICON, RT_GROUP_ICON, RT_VERSION, RT_MANIFEST = 3, 14, 16, 24

MANIFEST = b'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <description>Feudo a Feudo</description>
  <dependency>
    <dependentAssembly>
      <assemblyIdentity type="win32" name="Microsoft.Windows.Common-Controls" version="6.0.0.0" processorArchitecture="*" publicKeyToken="6595b64144ccf1df" language="*"/>
    </dependentAssembly>
  </dependency>
  <compatibility xmlns="urn:schemas-microsoft-com:compatibility.v1">
    <application>
      <supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}"/>
    </application>
  </compatibility>
  <application xmlns="urn:schemas-microsoft-com:asm.v3">
    <windowsSettings>
      <dpiAware xmlns="http://schemas.microsoft.com/SMI/2005/WindowsSettings">true/pm</dpiAware>
      <dpiAwareness xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">permonitorv2,permonitor</dpiAwareness>
    </windowsSettings>
  </application>
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
    <security>
      <requestedPrivileges>
        <requestedExecutionLevel level="asInvoker" uiAccess="false"/>
      </requestedPrivileges>
    </security>
  </trustInfo>
</assembly>
'''

def pad4(b):
    return b + b'\0' * ((4 - len(b) % 4) % 4)

# ---------------------------------------------------------------- información de versión
def vs_node(key, value=b'', wtype=1, value_len=None, children=()):
    k = (key + '\0').encode('utf-16-le')
    head = struct.pack('<HHH', 0, 0, wtype) + k
    head = pad4(head)
    body = head + value
    if children:
        body = pad4(body)
        for i, ch in enumerate(children):
            body += ch if i == len(children) - 1 else pad4(ch)
    vl = value_len if value_len is not None else len(value)
    return struct.pack('<HH', len(body), vl) + body[4:]

def vs_string(key, text):
    v = (text + '\0').encode('utf-16-le')
    return vs_node(key, v, 1, len(v) // 2)

def version_info():
    parts = [int(x) for x in (VERSION.split('.') + ['0', '0', '0'])[:4]]
    ms = (parts[0] << 16) | parts[1]
    ls = (parts[2] << 16) | parts[3]
    fixed = struct.pack('<13I', 0xFEEF04BD, 0x00010000, ms, ls, ms, ls, 0x3F, 0, 0x00040004, 1, 0, 0, 0)
    vtxt = '.'.join(str(p) for p in parts)
    strings = [
        vs_string('CompanyName', 'Fraudy Martinez'),
        vs_string('FileDescription', 'Feudo a Feudo'),
        vs_string('FileVersion', vtxt),
        vs_string('InternalName', 'FeudoAFeudo'),
        vs_string('LegalCopyright', 'Idea original de Fraudy Martinez'),
        vs_string('OriginalFilename', 'Feudo a Feudo.exe'),
        vs_string('ProductName', 'Feudo a Feudo'),
        vs_string('ProductVersion', vtxt),
        vs_string('Comments', 'Estrategia medieval en tiempo real. Idea original de Fraudy Martinez.'),
    ]
    table = vs_node('%04X04B0' % LANG, b'', 1, 0, strings)
    sfi = vs_node('StringFileInfo', b'', 1, 0, [table])
    var = vs_node('Translation', struct.pack('<HH', LANG, 0x04B0), 0)
    vfi = vs_node('VarFileInfo', b'', 1, 0, [var])
    return vs_node('VS_VERSION_INFO', fixed, 0, len(fixed), [sfi, vfi])

# ---------------------------------------------------------------- icono
def icons():
    sizes = [256, 128, 64, 48, 32, 24, 16]
    items, group = [], struct.pack('<HHH', 0, 1, len(sizes))
    for i, s in enumerate(sizes, start=1):
        png = open(os.path.join(ICON, 'win-%d.png' % s), 'rb').read()
        items.append((RT_ICON, i, png))
        group += struct.pack('<BBBBHHIH', s % 256, s % 256, 0, 0, 1, 32, len(png), i)
    items.append((RT_GROUP_ICON, 1, group))
    return items

# ---------------------------------------------------------------- sección .rsrc
def build_rsrc(resources):
    """resources: lista de (tipo, id, datos). Devuelve (bytes de la sección, offsets a reubicar)."""
    tree = {}
    for t, i, d in resources:
        tree.setdefault(t, {})[i] = d
    types = sorted(tree)
    # tamaños de las tablas de directorio
    def dir_size(n):
        return 16 + 8 * n
    off = dir_size(len(types))
    type_dir_off = {}
    for t in types:
        type_dir_off[t] = off
        off += dir_size(len(tree[t]))
    name_dir_off = {}
    for t in types:
        for i in sorted(tree[t]):
            name_dir_off[(t, i)] = off
            off += dir_size(1)
    entry_off = {}
    for t in types:
        for i in sorted(tree[t]):
            entry_off[(t, i)] = off
            off += 16
    data_off = {}
    for t in types:
        for i in sorted(tree[t]):
            off = (off + 7) & ~7
            data_off[(t, i)] = off
            off += len(tree[t][i])
    sec = bytearray(off)
    def put_dir(at, entries):
        struct.pack_into('<IIHHHH', sec, at, 0, 0, 4, 0, 0, len(entries))
        for k, (name, target) in enumerate(entries):
            struct.pack_into('<II', sec, at + 16 + 8 * k, name, target)
    put_dir(0, [(t, 0x80000000 | type_dir_off[t]) for t in types])
    relocs = []
    for t in types:
        put_dir(type_dir_off[t], [(i, 0x80000000 | name_dir_off[(t, i)]) for i in sorted(tree[t])])
        for i in sorted(tree[t]):
            put_dir(name_dir_off[(t, i)], [(LANG, entry_off[(t, i)])])
            d = tree[t][i]
            struct.pack_into('<IIII', sec, entry_off[(t, i)], data_off[(t, i)], len(d), 0, 0)
            relocs.append(entry_off[(t, i)])
            sec[data_off[(t, i)]:data_off[(t, i)] + len(d)] = d
    return bytes(sec), relocs

def coff(section, relocs):
    IMAGE_FILE_MACHINE_AMD64 = 0x8664
    IMAGE_REL_AMD64_ADDR32NB = 3
    raw_off = 20 + 40
    rel_off = raw_off + len(section)
    sym_off = rel_off + 10 * len(relocs)
    out = struct.pack('<HHIIIHH', IMAGE_FILE_MACHINE_AMD64, 1, 0, sym_off, 1, 0, 0x0004)
    out += struct.pack('<8sIIIIIIHHI', b'.rsrc', 0, 0, len(section), raw_off, rel_off, 0, len(relocs), 0, 0x40000040)
    out += section
    for r in relocs:
        out += struct.pack('<IIH', r, 0, IMAGE_REL_AMD64_ADDR32NB)
    out += struct.pack('<8sIhHBB', b'.rsrc', 0, 1, 0, 3, 0)
    out += struct.pack('<I', 4)  # tabla de cadenas vacía
    return out

resources = icons() + [(RT_VERSION, 1, version_info()), (RT_MANIFEST, 1, MANIFEST)]
sec, rel = build_rsrc(resources)
open(OUT, 'wb').write(coff(sec, rel))
print('OK:', os.path.relpath(OUT, ROOT), len(sec), 'bytes de recursos')
