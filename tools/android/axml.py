"""XML binario de Android (el formato de AndroidManifest.xml y de res/*.xml dentro de un APK).
Escritura y lectura; la lectura sirve para comprobar lo que se ha escrito."""
import struct

ANDROID_NS = 'http://schemas.android.com/apk/res/android'

# identificadores de atributo del sistema (android.R.attr)
ATTR = {
    'theme': 0x01010000, 'label': 0x01010001, 'icon': 0x01010002, 'name': 0x01010003,
    'exported': 0x01010010, 'launchMode': 0x0101001d, 'screenOrientation': 0x0101001e,
    'configChanges': 0x0101001f, 'drawable': 0x01010199, 'minSdkVersion': 0x0101020c,
    'versionCode': 0x0101021b, 'versionName': 0x0101021c, 'targetSdkVersion': 0x01010270,
    'allowBackup': 0x01010280, 'hardwareAccelerated': 0x010102d3,
}

TYPE_REFERENCE, TYPE_STRING, TYPE_INT_DEC, TYPE_INT_HEX, TYPE_INT_BOOLEAN = 0x01, 0x03, 0x10, 0x11, 0x12

RES_STRING_POOL_TYPE = 0x0001
RES_XML_TYPE = 0x0003
RES_XML_START_NAMESPACE_TYPE = 0x0100
RES_XML_END_NAMESPACE_TYPE = 0x0101
RES_XML_START_ELEMENT_TYPE = 0x0102
RES_XML_END_ELEMENT_TYPE = 0x0103
RES_XML_RESOURCE_MAP_TYPE = 0x0180
NO = 0xFFFFFFFF


# valores de atributo
def s(v): return (TYPE_STRING, v)
def i(v): return (TYPE_INT_DEC, v)
def h(v): return (TYPE_INT_HEX, v)
def b(v): return (TYPE_INT_BOOLEAN, NO if v else 0)
def ref(v): return (TYPE_REFERENCE, v)


class E:
    """Elemento: E('activity', [('android', 'name', s('…')), …], [hijos])"""
    def __init__(self, tag, attrs=(), children=()):
        self.tag, self.attrs, self.children = tag, list(attrs), list(children)

    def walk(self):
        yield self
        for c in self.children:
            yield from c.walk()


def string_pool(strings):
    """Bloque de cadenas UTF-16 (sin estilos)."""
    offsets, data = [], bytearray()
    for st in strings:
        offsets.append(len(data))
        u = st.encode('utf-16-le')
        n = len(u) // 2
        if n > 0x7FFF:
            data += struct.pack('<HH', 0x8000 | (n >> 16), n & 0xFFFF)
        else:
            data += struct.pack('<H', n)
        data += u + b'\0\0'
    while len(data) % 4:
        data += b'\0'
    header = 28
    start = header + 4 * len(strings)
    out = struct.pack('<HHIIIIII', RES_STRING_POOL_TYPE, header, start + len(data), len(strings), 0, 0, start, 0)
    out += b''.join(struct.pack('<I', o) for o in offsets) + bytes(data)
    return out


def encode(root):
    els = list(root.walk())
    # 1) nombres de atributos con identificador, ordenados por identificador (van primero y los describe el mapa)
    res_names = sorted({n for el in els for ns, n, v in el.attrs if ns == 'android'}, key=lambda n: ATTR[n])
    strings = list(res_names)

    def add(x):
        if x not in strings:
            strings.append(x)
    add('android')
    add(ANDROID_NS)
    for el in els:
        add(el.tag)
        for ns, n, v in el.attrs:
            add(n)
            if v[0] == TYPE_STRING:
                add(v[1])
    idx = {x: k for k, x in enumerate(strings)}

    body = bytearray(string_pool(strings))
    body += struct.pack('<HHI', RES_XML_RESOURCE_MAP_TYPE, 8, 8 + 4 * len(res_names))
    body += b''.join(struct.pack('<I', ATTR[n]) for n in res_names)
    line = [1]

    def ns_chunk(t):
        return struct.pack('<HHIII', t, 16, 24, line[0], NO) + struct.pack('<II', idx['android'], idx[ANDROID_NS])

    body += ns_chunk(RES_XML_START_NAMESPACE_TYPE)

    def emit(el):
        # atributos del sistema ordenados por identificador (el sistema los recorre en ese orden), después el resto
        attrs = sorted(el.attrs, key=lambda a: (0, ATTR[a[1]]) if a[0] == 'android' else (1, 0))
        ab = bytearray()
        for ns, n, (t, v) in attrs:
            ns_i = idx[ANDROID_NS] if ns == 'android' else NO
            if t == TYPE_STRING:
                raw, data = idx[v], idx[v]
            else:
                raw, data = NO, v & 0xFFFFFFFF
            ab += struct.pack('<IIIHBBI', ns_i, idx[n], raw, 8, 0, t, data)
        body.extend(struct.pack('<HHIII', RES_XML_START_ELEMENT_TYPE, 16, 36 + len(ab), line[0], NO))
        body.extend(struct.pack('<IIHHHHHH', NO, idx[el.tag], 20, 20, len(attrs), 0, 0, 0))
        body.extend(ab)
        line[0] += 1
        for c in el.children:
            emit(c)
        body.extend(struct.pack('<HHIII', RES_XML_END_ELEMENT_TYPE, 16, 24, line[0], NO) + struct.pack('<II', NO, idx[el.tag]))
        line[0] += 1

    emit(root)
    body += ns_chunk(RES_XML_END_NAMESPACE_TYPE)
    return struct.pack('<HHI', RES_XML_TYPE, 8, 8 + len(body)) + bytes(body)


# ---------------------------------------------------------------- lectura (para comprobar)

def read_pool(buf, off):
    t, hs, size, count, styles, flags, start, sstart = struct.unpack_from('<HHIIIIII', buf, off)
    assert t == RES_STRING_POOL_TYPE, 'se esperaba un bloque de cadenas'
    utf8 = bool(flags & 0x100)
    out = []
    for k in range(count):
        o = off + start + struct.unpack_from('<I', buf, off + hs + 4 * k)[0]
        if utf8:
            n = buf[o]; o += 1
            if n & 0x80:
                o += 1
            n = buf[o]; o += 1
            if n & 0x80:
                n = ((n & 0x7F) << 8) | buf[o]; o += 1
            out.append(buf[o:o + n].decode('utf-8'))
        else:
            n = struct.unpack_from('<H', buf, o)[0]; o += 2
            if n & 0x8000:
                n = ((n & 0x7FFF) << 16) | struct.unpack_from('<H', buf, o)[0]; o += 2
            out.append(buf[o:o + 2 * n].decode('utf-16-le'))
    return out, size


def decode(buf):
    """Devuelve el XML en texto (con los identificadores de recurso) y comprueba la estructura."""
    t, hs, size = struct.unpack_from('<HHI', buf, 0)
    assert t == RES_XML_TYPE and size == len(buf), 'cabecera XML incorrecta'
    off = hs
    strings, n = read_pool(buf, off)
    off += n
    resmap = []
    lines, depth, nsuri = [], 0, {}
    while off < len(buf):
        ct, chs, csize = struct.unpack_from('<HHI', buf, off)
        assert csize >= 8 and off + csize <= len(buf), 'bloque fuera de rango'
        if ct == RES_XML_RESOURCE_MAP_TYPE:
            resmap = list(struct.unpack_from('<%dI' % ((csize - 8) // 4), buf, off + 8))
        elif ct == RES_XML_START_NAMESPACE_TYPE:
            p, u = struct.unpack_from('<II', buf, off + 16)
            nsuri[u] = strings[p]
        elif ct == RES_XML_START_ELEMENT_TYPE:
            ns, name, ast, asz, cnt = struct.unpack_from('<IIHHH', buf, off + 16)
            parts = []
            last_id = 0
            for k in range(cnt):
                ans, an, raw, vs, r0, dt, data = struct.unpack_from('<IIIHBBI', buf, off + 16 + ast + asz * k)
                rid = resmap[an] if an < len(resmap) else 0
                if rid:
                    assert rid > last_id, 'atributos sin ordenar en <%s>' % strings[name]
                    last_id = rid
                pre = (nsuri.get(ans, '?') + ':') if ans != NO else ''
                if dt == TYPE_STRING:
                    val = '"%s"' % strings[data]
                elif dt == TYPE_REFERENCE:
                    val = '@0x%08x' % data
                elif dt == TYPE_INT_BOOLEAN:
                    val = 'true' if data else 'false'
                elif dt == TYPE_INT_HEX:
                    val = '0x%x' % data
                else:
                    val = str(data)
                parts.append('%s%s=%s%s' % (pre, strings[an], val, ' [0x%08x]' % rid if rid else ''))
            lines.append('  ' * depth + '<' + strings[name] + (' ' + ' '.join(parts) if parts else '') + '>')
            depth += 1
        elif ct == RES_XML_END_ELEMENT_TYPE:
            depth -= 1
            lines.append('  ' * depth + '</' + strings[struct.unpack_from('<I', buf, off + 20)[0]] + '>')
        off += csize
    assert depth == 0, 'elementos sin cerrar'
    return '\n'.join(lines)
