"""Ensamblador DEX mínimo (formato 035) a partir de un subconjunto de smali, y lector/desensamblador
para comprobar el resultado. Cubre lo que necesita una Activity con un WebView: invocaciones,
constantes, cadenas, objetos nuevos, campos de instancia, saltos condicionales y try/catch."""
import hashlib, re, struct, zlib

ACC = {'public': 0x1, 'private': 0x2, 'protected': 0x4, 'static': 0x8, 'final': 0x10, 'constructor': 0x10000}
NO_INDEX = 0xFFFFFFFF

# ---------------------------------------------------------------- utilidades de codificación

def uleb(n):
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


def sleb(n):
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        if (n == 0 and not b & 0x40) or (n == -1 and b & 0x40):
            out.append(b)
            return bytes(out)
        out.append(b | 0x80)


def read_uleb(buf, o):
    r = s = 0
    while True:
        b = buf[o]; o += 1
        r |= (b & 0x7F) << s
        s += 7
        if not b & 0x80:
            return r, o


def read_sleb(buf, o):
    r = s = 0
    while True:
        b = buf[o]; o += 1
        r |= (b & 0x7F) << s
        s += 7
        if not b & 0x80:
            if b & 0x40:
                r -= 1 << s
            return r, o


def mutf8(s):
    out = bytearray()
    for u in struct.unpack('<%dH' % (len(s.encode('utf-16-le')) // 2), s.encode('utf-16-le')):
        if u == 0:
            out += b'\xc0\x80'
        elif u < 0x80:
            out.append(u)
        elif u < 0x800:
            out += bytes([0xC0 | (u >> 6), 0x80 | (u & 0x3F)])
        else:
            out += bytes([0xE0 | (u >> 12), 0x80 | ((u >> 6) & 0x3F), 0x80 | (u & 0x3F)])
    return bytes(out)


def utf16_units(s):
    return len(s.encode('utf-16-le')) // 2


def split_params(desc):
    """'(Landroid/os/Bundle;IZ)V' → (['Landroid/os/Bundle;', 'I', 'Z'], 'V')"""
    m = re.match(r'^\((.*)\)(.+)$', desc)
    inner, ret = m.group(1), m.group(2)
    out, k = [], 0
    while k < len(inner):
        j = k
        while inner[j] == '[':
            j += 1
        if inner[j] == 'L':
            j = inner.index(';', j)
        out.append(inner[k:j + 1])
        k = j + 1
    return out, ret


def shorty(t):
    return 'L' if t[0] in 'L[' else t


# ---------------------------------------------------------------- formatos de instrucción

OPS = {
    # nombre: (código, formato)
    'nop': (0x00, '10x'), 'move-result': (0x0A, '11x'), 'move-result-object': (0x0C, '11x'),
    'move-exception': (0x0D, '11x'), 'return-void': (0x0E, '10x'), 'return': (0x0F, '11x'),
    'return-object': (0x11, '11x'), 'const/4': (0x12, '11n'), 'const/16': (0x13, '21s'), 'const': (0x14, '31i'),
    'const-string': (0x1A, '21c'), 'check-cast': (0x1F, '21c'), 'new-instance': (0x22, '21c'),
    'goto': (0x28, '10t'), 'if-eqz': (0x38, '21t'), 'if-nez': (0x39, '21t'),
    'if-lt': (0x34, '22t'), 'if-ge': (0x35, '22t'), 'sget': (0x60, '21c'),
    'iget': (0x52, '22c'), 'iget-object': (0x54, '22c'), 'iget-boolean': (0x55, '22c'),
    'iput': (0x59, '22c'), 'iput-object': (0x5B, '22c'), 'iput-boolean': (0x5C, '22c'),
    'invoke-virtual': (0x6E, '35c'), 'invoke-super': (0x6F, '35c'), 'invoke-direct': (0x70, '35c'),
    'invoke-static': (0x71, '35c'), 'invoke-interface': (0x72, '35c'),
}
UNITS = {'10x': 1, '11x': 1, '11n': 1, '10t': 1, '21s': 2, '21c': 2, '21t': 2, '22t': 2, '22c': 2, '31i': 3, '35c': 3}
BY_CODE = {v[0]: (k, v[1]) for k, v in OPS.items()}

# ---------------------------------------------------------------- modelo y lectura del smali


class Method:
    def __init__(self, cls, name, desc, flags):
        self.cls, self.name, self.desc, self.flags = cls, name, desc, flags
        self.params, self.ret = split_params(desc)
        self.locals = 0
        self.lines = []          # instrucciones en texto
        self.direct = bool(flags & (ACC['private'] | ACC['static'] | ACC['constructor']))

    @property
    def ins(self):
        return len(self.params) + (0 if self.flags & ACC['static'] else 1)


class Clase:
    def __init__(self, name, flags):
        self.name, self.flags, self.sup = name, flags, 'Ljava/lang/Object;'
        self.fields, self.methods = [], []


def parse_smali(text):
    clases, cur, meth = [], None, None
    for raw in text.split('\n'):
        line = raw.split('#')[0].strip() if not raw.strip().startswith('const-string') else raw.strip()
        if not line:
            continue
        w = line.split()
        if w[0] == '.class':
            cur = Clase(w[-1], sum(ACC[x] for x in w[1:-1]))
            clases.append(cur)
        elif w[0] == '.super':
            cur.sup = w[1]
        elif w[0] == '.field':
            name, typ = w[-1].split(':')
            cur.fields.append((name, typ, sum(ACC[x] for x in w[1:-1])))
        elif w[0] == '.method':
            sig = w[-1]
            name, desc = sig[:sig.index('(')], sig[sig.index('('):]
            meth = Method(cur.name, name, desc, sum(ACC[x] for x in w[1:-1]))
            cur.methods.append(meth)
        elif w[0] == '.locals':
            meth.locals = int(w[1], 0)
        elif w[0] == '.end':
            meth = None
        else:
            meth.lines.append(line)
    return clases


MREF = re.compile(r'^(L[^;]+;)->([^(]+)(\(.*\).+)$')
FREF = re.compile(r'^(L[^;]+;)->([^:]+):(.+)$')


def parse_insn(line):
    """Devuelve (op, args) con args ya separados."""
    if line.startswith(':'):
        return ('label', line[1:])
    if line.startswith('.catchall'):
        m = re.match(r'^\.catchall \{:(\S+) \.\. :(\S+)\} :(\S+)$', line)
        return ('catchall', m.groups())
    op, rest = (line.split(None, 1) + [''])[:2]
    if op.startswith('invoke-'):
        m = re.match(r'^\{([^}]*)\},\s*(.+)$', rest)
        regs = [r.strip() for r in m.group(1).split(',') if r.strip()]
        return (op, (regs, MREF.match(m.group(2)).groups()))
    if op == 'const-string':
        reg, s = rest.split(',', 1)
        s = s.strip()
        assert s[0] == '"' and s[-1] == '"'
        return (op, (reg.strip(), s[1:-1].encode().decode('unicode_escape')))
    args = [a.strip() for a in rest.split(',')] if rest else []
    return (op, args)


# ---------------------------------------------------------------- escritura del DEX

class Dex:
    def __init__(self, clases):
        self.clases = clases
        self.strings, self.types, self.protos, self.fields, self.methods = set(), set(), set(), set(), set()
        for c in clases:
            self.type(c.name)
            self.type(c.sup)
            for name, typ, _ in c.fields:
                self.field(c.name, name, typ)
            for m in c.methods:
                self.method(m.cls, m.name, m.desc)
                for line in m.lines:
                    op, a = parse_insn(line)
                    if op.startswith('invoke-'):
                        self.method(*a[1])
                    elif op == 'const-string':
                        self.strings.add(a[1])
                    elif op in ('new-instance', 'check-cast'):
                        self.type(a[1])
                    elif op in ('iget', 'iget-object', 'iget-boolean', 'iput', 'iput-object', 'iput-boolean'):
                        self.field(*FREF.match(a[2]).groups())
                    elif op == 'sget':
                        self.field(*FREF.match(a[1]).groups())

    def type(self, t):
        self.types.add(t)
        self.strings.add(t)

    def proto(self, desc):
        params, ret = split_params(desc)
        self.type(ret)
        for p in params:
            self.type(p)
        sh = shorty(ret) + ''.join(shorty(p) for p in params)
        self.strings.add(sh)
        self.protos.add((sh, ret, tuple(params)))
        return (sh, ret, tuple(params))

    def field(self, cls, name, typ):
        self.type(cls)
        self.type(typ)
        self.strings.add(name)
        self.fields.add((cls, name, typ))

    def method(self, cls, name, desc):
        self.type(cls)
        self.strings.add(name)
        self.methods.add((cls, name, self.proto(desc)))

    def build(self):
        key16 = lambda s: s.encode('utf-16-be')     # orden por unidades UTF-16
        strings = sorted(self.strings, key=key16)
        sidx = {s: k for k, s in enumerate(strings)}
        types = sorted(self.types, key=lambda t: sidx[t])
        tidx = {t: k for k, t in enumerate(types)}
        protos = sorted(self.protos, key=lambda p: (tidx[p[1]], [tidx[x] for x in p[2]]))
        pidx = {p: k for k, p in enumerate(protos)}
        fields = sorted(self.fields, key=lambda f: (tidx[f[0]], sidx[f[1]], tidx[f[2]]))
        fidx = {f: k for k, f in enumerate(fields)}
        methods = sorted(self.methods, key=lambda m: (tidx[m[0]], sidx[m[1]], pidx[m[2]]))
        midx = {m: k for k, m in enumerate(methods)}
        self.tables = (strings, types, protos, fields, methods)

        def mref(cls, name, desc):
            return midx[(cls, name, self.proto(desc))]

        # clases: las definidas aquí, cada superclase antes que sus hijas
        order, pend = [], list(self.clases)
        names = {c.name for c in self.clases}
        while pend:
            for c in pend:
                if c.sup not in names or c.sup in [o.name for o in order]:
                    order.append(c)
                    pend.remove(c)
                    break

        # ---- código de cada método
        codes = {}
        for c in order:
            for m in c.methods:
                codes[(c.name, m.name, m.desc)] = self.assemble(m, sidx, tidx, fidx, mref)

        # ---- disposición del archivo
        H = 0x70
        off = H
        sec = {}
        def place(name, size, align=4):
            nonlocal off
            off = (off + align - 1) & ~(align - 1)
            sec[name] = off
            off += size
        place('string_ids', 4 * len(strings))
        place('type_ids', 4 * len(types))
        place('proto_ids', 12 * len(protos))
        place('field_ids', 8 * len(fields))
        place('method_ids', 8 * len(methods))
        place('class_defs', 32 * len(order))
        data_off = off

        # type_list de parámetros
        tlists = sorted({p[2] for p in protos if p[2]}, key=lambda tl: [tidx[x] for x in tl])
        tl_off = {}
        blob = bytearray()
        def put(b, align=1):
            nonlocal off
            pad = (-off) % align
            blob.extend(b'\0' * pad)
            off += pad
            at = off
            blob.extend(b)
            off += len(b)
            return at
        first_tl = None
        for tl in tlists:
            at = put(struct.pack('<I', len(tl)) + b''.join(struct.pack('<H', tidx[x]) for x in tl), 4)
            first_tl = at if first_tl is None else first_tl
            tl_off[tl] = at
        # code_item
        code_off, first_code = {}, None
        for k, code in codes.items():
            at = put(code, 4)
            first_code = at if first_code is None else first_code
            code_off[k] = at
        # class_data_item
        cdata_off, first_cd = {}, None
        for c in order:
            inst = sorted(((fidx[(c.name, n, t)], fl) for n, t, fl in c.fields))
            dm = sorted(((midx[(c.name, m.name, self.proto(m.desc))], m) for m in c.methods if m.direct), key=lambda x: x[0])
            vm = sorted(((midx[(c.name, m.name, self.proto(m.desc))], m) for m in c.methods if not m.direct), key=lambda x: x[0])
            b = uleb(0) + uleb(len(inst)) + uleb(len(dm)) + uleb(len(vm))
            prev = 0
            for fi, fl in inst:
                b += uleb(fi - prev) + uleb(fl)
                prev = fi
            for lst in (dm, vm):
                prev = 0
                for mi, m in lst:
                    b += uleb(mi - prev) + uleb(m.flags) + uleb(code_off[(c.name, m.name, m.desc)])
                    prev = mi
            at = put(b, 1)
            first_cd = at if first_cd is None else first_cd
            cdata_off[c.name] = at
        # string_data_item
        sdata_off = []
        for s in strings:
            sdata_off.append(put(uleb(utf16_units(s)) + mutf8(s) + b'\0', 1))
        # map_list
        items = [(0x0000, 1, 0), (0x0001, len(strings), sec['string_ids']), (0x0002, len(types), sec['type_ids']),
                 (0x0003, len(protos), sec['proto_ids']), (0x0004, len(fields), sec['field_ids']),
                 (0x0005, len(methods), sec['method_ids']), (0x0006, len(order), sec['class_defs'])]
        if tlists:
            items.append((0x1001, len(tlists), first_tl))
        items.append((0x2001, len(codes), first_code))
        items.append((0x2000, len(order), first_cd))
        items.append((0x2002, len(strings), sdata_off[0]))
        pad = (-off) % 4
        map_off = off + pad
        items.append((0x1000, 1, map_off))
        items = [it for it in items if it[1]]
        items.sort(key=lambda it: it[2])
        mp = struct.pack('<I', len(items)) + b''.join(struct.pack('<HHII', t, 0, n, o) for t, n, o in items)
        put(mp, 4)
        size = off

        out = bytearray(size)
        out[data_off:size] = blob
        p = sec['string_ids']
        for so in sdata_off:
            struct.pack_into('<I', out, p, so); p += 4
        p = sec['type_ids']
        for t in types:
            struct.pack_into('<I', out, p, sidx[t]); p += 4
        p = sec['proto_ids']
        for sh, ret, params in protos:
            struct.pack_into('<III', out, p, sidx[sh], tidx[ret], tl_off[params] if params else 0); p += 12
        p = sec['field_ids']
        for cls, name, typ in fields:
            struct.pack_into('<HHI', out, p, tidx[cls], tidx[typ], sidx[name]); p += 8
        p = sec['method_ids']
        for cls, name, pr in methods:
            struct.pack_into('<HHI', out, p, tidx[cls], pidx[pr], sidx[name]); p += 8
        p = sec['class_defs']
        for c in order:
            struct.pack_into('<IIIIIIII', out, p, tidx[c.name], c.flags, tidx[c.sup], 0, NO_INDEX, 0, cdata_off[c.name], 0); p += 32
        hdr = struct.pack('<8sI20sIIIIIIIIIIIIIIIIIIII', b'dex\n035\0', 0, b'\0' * 20, size, H, 0x12345678, 0, 0, map_off,
                          len(strings), sec['string_ids'], len(types), sec['type_ids'], len(protos), sec['proto_ids'],
                          len(fields), sec['field_ids'] if fields else 0, len(methods), sec['method_ids'],
                          len(order), sec['class_defs'], size - data_off, data_off)
        out[0:H] = hdr
        out[12:32] = hashlib.sha1(out[32:]).digest()
        struct.pack_into('<I', out, 8, zlib.adler32(bytes(out[12:])) & 0xFFFFFFFF)
        return bytes(out)

    def assemble(self, m, sidx, tidx, fidx, mref):
        regs = m.locals + m.ins
        def R(r):
            n = int(r[1:])
            v = n if r[0] == 'v' else m.locals + n
            assert v < regs, 'registro %s fuera de rango en %s' % (r, m.name)
            return v
        insns = [parse_insn(l) for l in m.lines]
        # direcciones
        pc, labels, outs = 0, {}, 0
        for op, a in insns:
            if op == 'label':
                labels[a] = pc
            elif op != 'catchall':
                pc += UNITS[OPS[op][1]]
                if op.startswith('invoke-'):
                    outs = max(outs, len(a[0]))
        units, tries = [], []
        pc = 0
        for op, a in insns:
            if op == 'label':
                continue
            if op == 'catchall':
                tries.append((labels[a[0]], labels[a[1]] - labels[a[0]], labels[a[2]]))
                continue
            code, fmt = OPS[op]
            if fmt == '10x':
                units += [code]
            elif fmt == '11x':
                units += [(R(a[0]) << 8) | code]
            elif fmt == '11n':
                v = int(a[1], 0)
                assert -8 <= v <= 7 and R(a[0]) < 16
                units += [((v & 0xF) << 12) | (R(a[0]) << 8) | code]
            elif fmt == '21s':
                v = int(a[1], 0)
                assert -0x8000 <= v <= 0x7FFF
                units += [(R(a[0]) << 8) | code, v & 0xFFFF]
            elif fmt == '31i':
                v = int(a[1], 0) & 0xFFFFFFFF
                units += [(R(a[0]) << 8) | code, v & 0xFFFF, v >> 16]
            elif fmt == '21c':
                ref = sidx[a[1]] if op == 'const-string' else fidx[FREF.match(a[1]).groups()] if op == 'sget' else tidx[a[1]]
                assert ref <= 0xFFFF
                units += [(R(a[0]) << 8) | code, ref]
            elif fmt == '21t':
                d = labels[a[1][1:]] - pc
                units += [(R(a[0]) << 8) | code, d & 0xFFFF]
            elif fmt == '22t':
                d = labels[a[2][1:]] - pc
                assert R(a[0]) < 16 and R(a[1]) < 16
                units += [(R(a[1]) << 12) | (R(a[0]) << 8) | code, d & 0xFFFF]
            elif fmt == '10t':
                d = labels[a[0][1:]] - pc
                assert -128 <= d <= 127 and d != 0
                units += [((d & 0xFF) << 8) | code]
            elif fmt == '22c':
                f = fidx[FREF.match(a[2]).groups()]
                assert R(a[0]) < 16 and R(a[1]) < 16
                units += [(R(a[1]) << 12) | (R(a[0]) << 8) | code, f]
            elif fmt == '35c':
                rl, (cls, name, desc) = a
                rr = [R(x) for x in rl]
                assert len(rr) <= 5 and all(x < 16 for x in rr)
                rr5 = rr + [0] * (5 - len(rr))
                units += [(len(rr) << 12) | (rr5[4] << 8) | code, mref(cls, name, desc),
                          (rr5[3] << 12) | (rr5[2] << 8) | (rr5[1] << 4) | rr5[0]]
            pc += UNITS[fmt]
        body = struct.pack('<HHHHII', regs, m.ins, outs, len(tries), 0, len(units))
        body += struct.pack('<%dH' % len(units), *units)
        if tries:
            if len(units) % 2:
                body += b'\0\0'
            # un manejador «catch all» por bloque
            handlers = uleb(len(tries))
            hoffs = []
            for _, _, h in tries:
                hoffs.append(len(handlers))
                handlers += sleb(0) + uleb(h)
            for (st, cnt, _), ho in zip(tries, hoffs):
                body += struct.pack('<IHH', st, cnt, ho)
            body += handlers
        return body


# ---------------------------------------------------------------- lectura y desensamblado

def disassemble(buf):
    """Comprueba la cabecera y devuelve un listado tipo smali."""
    assert buf[:8] == b'dex\n035\0', 'firma DEX incorrecta'
    (chk,) = struct.unpack_from('<I', buf, 8)
    assert chk == zlib.adler32(buf[12:]) & 0xFFFFFFFF, 'checksum incorrecto'
    assert buf[12:32] == hashlib.sha1(buf[32:]).digest(), 'firma SHA-1 incorrecta'
    f = struct.unpack_from('<IIIIIIIIIIIIIIIIIIII', buf, 32)
    size, hsz, endian, _, _, map_off, ns, so, nt, to, np_, po, nf, fo, nm, mo, nc, co, dsz, doff = f
    assert size == len(buf) and hsz == 0x70 and endian == 0x12345678 and dsz % 4 == 0 and doff + dsz == size
    def string(k):
        o = struct.unpack_from('<I', buf, so + 4 * k)[0]
        _, o = read_uleb(buf, o)
        e = buf.index(b'\0', o)
        return buf[o:e].decode('utf-8', 'replace')
    strs = [string(k) for k in range(ns)]
    assert strs == sorted(strs, key=lambda s: s.encode('utf-16-be')), 'cadenas sin ordenar'
    types = [strs[struct.unpack_from('<I', buf, to + 4 * k)[0]] for k in range(nt)]
    def tlist(o):
        if not o:
            return []
        n = struct.unpack_from('<I', buf, o)[0]
        return [types[x] for x in struct.unpack_from('<%dH' % n, buf, o + 4)]
    protos = []
    for k in range(np_):
        sh, rt, pa = struct.unpack_from('<III', buf, po + 12 * k)
        protos.append('(' + ''.join(tlist(pa)) + ')' + types[rt])
    fields = []
    for k in range(nf):
        c, t, n = struct.unpack_from('<HHI', buf, fo + 8 * k)
        fields.append('%s->%s:%s' % (types[c], strs[n], types[t]))
    methods = []
    for k in range(nm):
        c, p, n = struct.unpack_from('<HHI', buf, mo + 8 * k)
        methods.append('%s->%s%s' % (types[c], strs[n], protos[p]))
    # orden de las tablas
    mkeys = [struct.unpack_from('<HHI', buf, mo + 8 * k) for k in range(nm)]
    assert mkeys == sorted(mkeys, key=lambda x: (x[0], x[2], x[1])), 'métodos sin ordenar'
    out = ['; %d cadenas, %d tipos, %d prototipos, %d campos, %d métodos, %d clases, %d bytes' % (ns, nt, np_, nf, nm, nc, size)]
    nmap = struct.unpack_from('<I', buf, map_off)[0]
    mp = [struct.unpack_from('<HHII', buf, map_off + 4 + 12 * k) for k in range(nmap)]
    assert [x[3] for x in mp] == sorted(x[3] for x in mp), 'mapa sin ordenar'
    for k in range(nc):
        cls, acc, sup, itf, src, ann, cdo, sv = struct.unpack_from('<IIIIIIII', buf, co + 32 * k)
        out.append('\n.class 0x%x %s\n.super %s' % (acc, types[cls], types[sup]))
        o = cdo
        sfs, o = read_uleb(buf, o)
        ifs, o = read_uleb(buf, o)
        dms, o = read_uleb(buf, o)
        vms, o = read_uleb(buf, o)
        fi = 0
        for _ in range(sfs + ifs):
            d, o = read_uleb(buf, o); fl, o = read_uleb(buf, o)
            fi += d
            out.append('.field 0x%x %s' % (fl, fields[fi]))
        for cnt in (dms, vms):
            mi = 0
            for _ in range(cnt):
                d, o = read_uleb(buf, o); fl, o = read_uleb(buf, o); cof, o = read_uleb(buf, o)
                mi += d
                out.append('\n.method 0x%x %s' % (fl, methods[mi]))
                assert methods[mi].startswith(types[cls] + '->'), 'método de otra clase'
                out += _code(buf, cof, strs, types, fields, methods)
    return '\n'.join(out)


def _code(buf, o, strs, types, fields, methods):
    regs, ins, outs, ntries, dbg, n = struct.unpack_from('<HHHHII', buf, o)
    assert o % 4 == 0 and regs >= ins
    u = struct.unpack_from('<%dH' % n, buf, o + 16)
    lines = ['    .registers %d  ; ins %d, outs %d' % (regs, ins, outs)]
    pc = 0
    while pc < n:
        code = u[pc] & 0xFF
        name, fmt = BY_CODE[code]
        A = (u[pc] >> 8) & 0xFF
        if fmt == '10x':
            t = name
        elif fmt == '11x':
            t = '%s v%d' % (name, A)
        elif fmt == '11n':
            v = (u[pc] >> 12) & 0xF
            t = '%s v%d, %d' % (name, A & 0xF, v - 16 if v > 7 else v)
        elif fmt == '21s':
            v = u[pc + 1]
            t = '%s v%d, %d' % (name, A, v - 0x10000 if v > 0x7FFF else v)
        elif fmt == '31i':
            t = '%s v%d, 0x%08x' % (name, A, u[pc + 1] | (u[pc + 2] << 16))
        elif fmt == '21c':
            t = '%s v%d, %s' % (name, A, repr(strs[u[pc + 1]]) if name == 'const-string' else fields[u[pc + 1]] if name == 'sget' else types[u[pc + 1]])
        elif fmt == '21t':
            d = u[pc + 1]
            d = d - 0x10000 if d > 0x7FFF else d
            assert 0 <= pc + d < n
            t = '%s v%d, @%d' % (name, A, pc + d)
        elif fmt == '22t':
            d = u[pc + 1]
            d = d - 0x10000 if d > 0x7FFF else d
            assert 0 <= pc + d < n
            t = '%s v%d, v%d, @%d' % (name, A & 0xF, A >> 4, pc + d)
        elif fmt == '10t':
            d = A - 256 if A > 127 else A
            t = '%s @%d' % (name, pc + d)
        elif fmt == '22c':
            t = '%s v%d, v%d, %s' % (name, A & 0xF, A >> 4, fields[u[pc + 1]])
        elif fmt == '35c':
            cnt, g = A >> 4, A & 0xF
            w = u[pc + 2]
            rr = [w & 0xF, (w >> 4) & 0xF, (w >> 8) & 0xF, (w >> 12) & 0xF, g][:cnt]
            assert all(r < regs for r in rr)
            t = '%s {%s}, %s' % (name, ', '.join('v%d' % r for r in rr), methods[u[pc + 1]])
        lines.append('    %3d: %s' % (pc, t))
        pc += UNITS[fmt]
    assert pc == n, 'instrucciones mal alineadas'
    if ntries:
        p = o + 16 + 2 * n + (2 if n % 2 else 0)
        hl = p + 8 * ntries
        for k in range(ntries):
            st, cnt, ho = struct.unpack_from('<IHH', buf, p + 8 * k)
            size, q = read_sleb(buf, hl + ho)
            assert size == 0
            addr, _ = read_uleb(buf, q)
            assert st + cnt <= n and addr < n
            lines.append('    .catchall {@%d .. @%d} @%d' % (st, st + cnt, addr))
    return lines
