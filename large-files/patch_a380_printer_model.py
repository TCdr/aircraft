"""Add the A32NX pedestal printer paper (feeding sheet, torn-off stacks on the pedestal and the CPT table, page buttons, torn
edge) to the A380X cockpit model (A380_COCKPIT_LOD00.gltf/.bin), with the node names the A380X cockpit behaviours use.

Generator of the aircraft-large-files commit 36b4bd9 (feat/a380x-pedestal-printer-paper). Inputs: a320/A320_NEO_INTERIOR_LOD00
and the original A380_COCKPIT_LOD00 (large-files 5f07408, parts joined) in BACKUP; output in out/.
usage: python patch_a380_printer_model.py [--apply]   (without --apply: prints the planned world positions only)
"""
import json, os, shutil, struct, sys, math

A320_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'a320')
A380_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
BACKUP = 'E:/MSFS2024 mods/backups/a380x-printer-model'
SRC = A320_DIR + '/A320_NEO_INTERIOR_LOD00'
DST = A380_DIR + '/A380_COCKPIT_LOD00'

# The A32NX paper slot (x -0.138, z ~11.04, pedestal top y 1.216) onto the A380X one ('PRINTER PAPER PATH' node,
# x -0.065, y 2.433, z 31.869): same axes in both models (+y up, +z forward)
PRINTER_OFFSET = (-0.065 - -0.138, 2.433 - 1.216, 31.869 - 11.04)
# The torn-off stack: lying flat on the blank panel left of the printer lid (x 0.07..0.22, z 31.87..31.99, surface
# y ~2.39), A32NX stack centre x 0, y 1.2977, z 11.577 -> A380X x 0.146, y 2.3975, z 31.925
STACK_CENTRE = (0.146, 2.3975, 31.925)
STACK_OFFSET = (STACK_CENTRE[0] - 0.0, STACK_CENTRE[1] - 1.2977, STACK_CENTRE[2] - 11.577)
# The A32NX stack lies on a surface tilted 10 degrees (about x): the A380X panel is flat
UNTILT = [math.sin(math.radians(10) / 2), 0.0, 0.0, math.cos(math.radians(10) / 2)]

# A320 node -> (A380 name, group); children follow their parent
COPY = {
    'PAPER_PRINTER': ('Print', 'printer'),
    'PAPER_PRINTER_PRINT': ('Print_TEXT', None),
    'PRINT_TORN': ('PRINT_TORN', 'printer'),
    'PAPER_PREV': ('PAPER_PREV', 'stack'),
    'PAPER_NEXT': ('PAPER_NEXT', 'stack'),
    'PAPER_DISCARD': ('PAPER_DISCARD', 'stack'),
    'PAPER_1': ('PAPER_1', 'stack'), 'PAPER_1_PRINT': ('PAPER_1_TEXT', None),
    'PAPER_2': ('PAPER_2', 'stack'), 'PAPER_2_PRINT': ('PAPER_2_TEXT', None),
    'PAPER_3': ('PAPER_3', 'stack'), 'PAPER_3_PRINT': ('PAPER_3_TEXT', None),
    'PAPER_4': ('PAPER_4', 'stack'), 'PAPER_4_PRINT': ('PAPER_4_TEXT', None),
}
OFFSETS = {'printer': PRINTER_OFFSET, 'stack': STACK_OFFSET}

# The torn-off sheets on the captain's pull-out table, while it is out: a second stack under PAPER_TABLE, a child of the
# table tray (Cube.034), parallel to its boards. In the tray's frame: on the closed meal table / keyboard boards (top
# y 0.0365), and on the unfolded aft area once the meal table is out (keyboard lid top y 0.028), clear of the
# table / meal table / keyboard click spots (tray x 0.036..0.066)
TABLE_TRAY = 'Cube.034'
TABLE_FWD = [-0.0477, 0.0395, 0.031]
TABLE_AFT = [-0.0477, 0.031, -0.10]
# PRINT_TABLE: slides the stack aft with the meal table (A380_CPT_MEALTABLE moves between frames 40 and 80)
TABLE_ANIM_TIMES = [40 / 24, 80 / 24]
TABLE_COPY = {
    'PAPER_PREV': 'PAPER_T_PREV', 'PAPER_NEXT': 'PAPER_T_NEXT', 'PAPER_DISCARD': 'PAPER_T_DISCARD',
    'PAPER_1': 'PAPER_T1', 'PAPER_1_PRINT': 'PAPER_T1_TEXT', 'PAPER_2': 'PAPER_T2', 'PAPER_2_PRINT': 'PAPER_T2_TEXT',
    'PAPER_3': 'PAPER_T3', 'PAPER_3_PRINT': 'PAPER_T3_TEXT', 'PAPER_4': 'PAPER_T4', 'PAPER_4_PRINT': 'PAPER_T4_TEXT',
}
TABLE_OFFSET = (0.0 - 0.0, 0.0 - 1.2977, 0.0 - 11.577)
# The text layers: like the A380X screens (the cockpit display image shows through the emissive channel, driven by
# ASOBO_GT_Material_Emissive_Code in A380_Cockpit_Behavior.xml), (the A32NX MSFS 2020 blend-into-gbuffer layer stays
# dark in this MSFS 2024 model); the printer page paints the paper itself
MATERIAL_OVERRIDE = {
    'PRINT': {'name': 'PRINT', 'alphaMode': 'MASK', 'emissiveFactor': [1.0, 1.0, 1.0], 'pbrMetallicRoughness': {'metallicFactor': 0.0, 'roughnessFactor': 0.9}},
    'PRINT_STATIC': {'name': 'PRINT_STATIC', 'alphaMode': 'MASK', 'emissiveFactor': [1.0, 1.0, 1.0], 'pbrMetallicRoughness': {'metallicFactor': 0.0, 'roughnessFactor': 0.9}},
}
# The A32NX discard click zone spans 74 cm of pedestal: here only the stack's width (it catches clicks while visible)
# The page buttons of the A32NX reach 11 cm beyond the sheet (they would cover the printer buttons): the sheet's length
SCALE_OVERRIDE = {'PAPER_DISCARD': [1.0, 0.25, 1.0], 'PAPER_PREV': [3.0, 0.25, 1.0], 'PAPER_NEXT': [3.0, 0.25, 1.0],
                  'PAPER_T_DISCARD': [1.0, 0.25, 1.0], 'PAPER_T_PREV': [3.0, 0.25, 1.0], 'PAPER_T_NEXT': [3.0, 0.25, 1.0]}
# The discard zone along the aft edge of the flat sheet
TRANSLATION_OVERRIDE = {'PAPER_DISCARD': [STACK_CENTRE[0], STACK_CENTRE[1] + 0.001, STACK_CENTRE[2] - 0.047],
                        'PAPER_T_DISCARD': [0.0, 0.001, -0.047]}


def qmul(a, b):
    ax, ay, az, aw = a; bx, by, bz, bw = b
    return [aw*bx + ax*bw + ay*bz - az*by, aw*by - ax*bz + ay*bw + az*bx, aw*bz + ax*by - ay*bx + az*bw,
            aw*bw - ax*bx - ay*by - az*bz]


def qrot(q, v):
    x, y, z, w = q
    return qmul(qmul(q, [v[0], v[1], v[2], 0]), [-x, -y, -z, w])[:3]


def load(stem):
    return json.load(open(stem + '.gltf', encoding='utf-8')), open(stem + '.bin', 'rb').read()


def main():
    apply = '--apply' in sys.argv
    os.makedirs(BACKUP, exist_ok=True)
    for ext in ('.gltf', '.bin'):
        if not os.path.exists(BACKUP + '/A380_COCKPIT_LOD00' + ext):
            if not apply:
                continue
            shutil.copyfile(DST + ext, BACKUP + '/A380_COCKPIT_LOD00' + ext)
    orig = BACKUP + '/A380_COCKPIT_LOD00' if os.path.exists(BACKUP + '/A380_COCKPIT_LOD00.gltf') else DST
    a, abin = load(SRC)
    b, bbin = load(orig)
    assert not any(n.get('name') in [v[0] for v in COPY.values()] + list(TABLE_COPY.values()) + ['PAPER_TABLE']
                   for n in b['nodes']), 'target already patched'
    bbin = bytearray(bbin)
    assert len(bbin) == b['buffers'][0]['byteLength']

    def align(n=4):
        while len(bbin) % n:
            bbin.append(0)

    def new_view(data, target=None, stride=None, name=None):
        align()
        view = {'buffer': 0, 'byteLength': len(data), 'byteOffset': len(bbin)}
        if stride:
            view['byteStride'] = stride
        if target:
            view['target'] = target
        if name:
            view['name'] = name
        bbin.extend(data)
        b['bufferViews'].append(view)
        return len(b['bufferViews']) - 1

    comp_size = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
    type_n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}

    def acc_bytes(i):
        """The raw element bytes of an A320 accessor, tightly packed"""
        acc = a['accessors'][i]; bv = a['bufferViews'][acc['bufferView']]
        esz = comp_size[acc['componentType']] * type_n[acc['type']]
        stride = bv.get('byteStride', esz)
        off = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
        return b''.join(abin[off + k*stride: off + k*stride + esz] for k in range(acc['count']))

    def copy_acc(i, view, byte_offset, override=None):
        acc = {k: v for k, v in a['accessors'][i].items() if k not in ('bufferView', 'byteOffset')}
        acc['bufferView'] = view
        if byte_offset:
            acc['byteOffset'] = byte_offset
        if override:
            acc.update(override)
        b['accessors'].append(acc)
        return len(b['accessors']) - 1

    # materials
    mat_map = {}

    def copy_mat(i):
        if i not in mat_map:
            m = json.loads(json.dumps(a['materials'][i]))
            b['materials'].append(MATERIAL_OVERRIDE.get(m.get('name'), m))
            mat_map[i] = len(b['materials']) - 1
        return mat_map[i]

    # meshes: one interleaved vertex view (the models' 36-byte layout) + one index view per primitive
    def copy_mesh(mi):
        prims = []
        for pr in a['meshes'][mi]['primitives']:
            attrs = pr['attributes']
            v0 = a['accessors'][attrs['POSITION']]
            src_view = a['bufferViews'][v0['bufferView']]
            stride = src_view['byteStride']
            base = src_view['byteOffset'] + min(a['accessors'][x].get('byteOffset', 0) for x in attrs.values())
            count = v0['count']
            vdata = abin[base: base + stride*count]
            vview = new_view(vdata, 34962, stride, 'BufferViewVertexND')
            new_attrs = {}
            for k, x in attrs.items():
                rel = a['bufferViews'][a['accessors'][x]['bufferView']]['byteOffset'] + a['accessors'][x].get('byteOffset', 0) - base
                assert a['accessors'][x]['bufferView'] == v0['bufferView'] and 0 <= rel < stride
                new_attrs[k] = copy_acc(x, vview, rel)
            iview = new_view(acc_bytes(pr['indices']), 34963, None, 'BufferViewIndexU16')
            np = {'attributes': new_attrs, 'indices': copy_acc(pr['indices'], iview, 0), 'material': copy_mat(pr['material'])}
            for k in ('mode', 'extensions', 'extras'):
                if k in pr:
                    np[k] = pr[k]
            prims.append(np)
        m = json.loads(json.dumps({k: v for k, v in a['meshes'][mi].items() if k != 'primitives'}))
        m['primitives'] = prims
        b['meshes'].append(m)
        return len(b['meshes']) - 1

    # nodes
    a_idx = {n.get('name'): i for i, n in enumerate(a['nodes'])}
    node_map = {}
    report = []

    def copy_node(ai, offset, names=None, stack=None):
        n = a['nodes'][ai]
        names = names or {k: v[0] for k, v in COPY.items()}
        name = names[n['name']]
        if stack is None:
            stack = COPY[n['name']][1] == 'stack'
        nn = {'name': name, 'extensions': {'ASOBO_unique_id': {'id': name}}}
        for k in ('rotation', 'scale'):
            if k in n:
                nn[k] = list(n[k])
        if name in SCALE_OVERRIDE:
            nn['scale'] = SCALE_OVERRIDE[name]
        if offset is not None and stack:
            nn['rotation'] = qmul(UNTILT, n.get('rotation', [0, 0, 0, 1]))
        t = list(n.get('translation', [0, 0, 0]))
        if offset is not None:
            t = [t[k] + offset[k] for k in range(3)]
        if name in TRANSLATION_OVERRIDE:
            t = TRANSLATION_OVERRIDE[name]
        if any(t):
            nn['translation'] = t
        if 'mesh' in n:
            nn['mesh'] = copy_mesh(n['mesh'])
        b['nodes'].append(nn)
        bi = len(b['nodes']) - 1
        node_map[ai] = bi
        kids = [copy_node(c, None, names, False) for c in n.get('children', [])]
        if kids:
            b['nodes'][bi]['children'] = kids
        return bi

    roots = []
    for src, (dst, group) in COPY.items():
        if group is None:
            continue
        roots.append(copy_node(a_idx[src], OFFSETS[group]))
    b['scenes'][b.get('scene', 0)]['nodes'].extend(roots)

    # The table stack under the tray
    tray = [i for i, n in enumerate(b['nodes']) if n.get('name') == TABLE_TRAY]
    assert len(tray) == 1
    b['nodes'].append({'name': 'PAPER_TABLE', 'translation': list(TABLE_FWD),
                       'extensions': {'ASOBO_unique_id': {'id': 'PAPER_TABLE'}}})
    table_node = len(b['nodes']) - 1
    b['nodes'][tray[0]].setdefault('children', []).append(table_node)
    table_kids = [copy_node(a_idx[src], TABLE_OFFSET, TABLE_COPY, True) for src in
                  ('PAPER_PREV', 'PAPER_NEXT', 'PAPER_DISCARD', 'PAPER_1', 'PAPER_2', 'PAPER_3', 'PAPER_4')]
    b['nodes'][table_node]['children'] = table_kids
    times = b''.join(struct.pack('<f', t) for t in TABLE_ANIM_TIMES)
    moves = b''.join(struct.pack('<3f', *v) for v in (TABLE_FWD, TABLE_AFT))
    b['accessors'].append({'bufferView': new_view(times), 'componentType': 5126, 'count': 2, 'type': 'SCALAR',
                           'min': [TABLE_ANIM_TIMES[0]], 'max': [TABLE_ANIM_TIMES[1]]})
    t_in = len(b['accessors']) - 1
    b['accessors'].append({'bufferView': new_view(moves), 'componentType': 5126, 'count': 2, 'type': 'VEC3',
                           'min': [min(TABLE_FWD[k], TABLE_AFT[k]) for k in range(3)],
                           'max': [max(TABLE_FWD[k], TABLE_AFT[k]) for k in range(3)]})
    t_out = len(b['accessors']) - 1
    b['animations'].append({'name': 'PRINT_TABLE', 'samplers': [{'input': t_in, 'output': t_out, 'interpolation': 'LINEAR'}],
                            'channels': [{'sampler': 0, 'target': {'node': table_node, 'path': 'translation'}}]})

    # PrintAnim on the feeding sheet: translations moved by the printer offset
    for anim in a['animations']:
        if anim.get('name') != 'PrintAnim':
            continue
        samplers, channels = [], []
        for ch in anim['channels']:
            s = anim['samplers'][ch['sampler']]
            inp = copy_acc(s['input'], new_view(acc_bytes(s['input'])), 0)
            out_bytes = acc_bytes(s['output'])
            override = None
            if ch['target']['path'] == 'translation':
                vals = [struct.unpack_from('<3f', out_bytes, 12*k) for k in range(len(out_bytes)//12)]
                vals = [[v[k] + PRINTER_OFFSET[k] for k in range(3)] for v in vals]
                out_bytes = b''.join(struct.pack('<3f', *v) for v in vals)
                override = {'min': [min(v[k] for v in vals) for k in range(3)], 'max': [max(v[k] for v in vals) for k in range(3)]}
            out = copy_acc(s['output'], new_view(out_bytes), 0, override)
            samplers.append({'input': inp, 'output': out, 'interpolation': s.get('interpolation', 'LINEAR')})
            channels.append({'sampler': len(samplers) - 1, 'target': {'node': node_map[ch['target']['node']], 'path': ch['target']['path']}})
            if ch['target']['path'] == 'translation':
                end = vals[-1]
        rot_out = [c for c in anim['channels'] if c['target']['path'] == 'rotation'][0]
        rb = acc_bytes(anim['samplers'][rot_out['sampler']]['output'])
        end_rot = list(struct.unpack_from('<4f', rb, len(rb) - 16))
        b['animations'].append({'name': 'PrintAnim', 'samplers': samplers, 'channels': channels})

    for ext in ('ASOBO_material_blend_gbuffer', 'ASOBO_material_invisible', 'ASOBO_tags', 'ASOBO_unique_id'):
        if ext not in b['extensionsUsed']:
            b['extensionsUsed'].append(ext)
    align()
    b['buffers'][0]['byteLength'] = len(bbin)

    # report: world boxes of the new meshes (rest pose), and the feeding sheet at the end of PrintAnim
    def box(ni, T=None, R=None):
        n = b['nodes'][ni]
        T = T or n.get('translation', [0, 0, 0]); R = R or n.get('rotation', [0, 0, 0, 1]); S = n.get('scale', [1, 1, 1])
        acc = b['accessors'][b['meshes'][n['mesh']]['primitives'][0]['attributes']['POSITION']]
        pts = [qrot(R, [(acc['min'], acc['max'])[i][0]*S[0], (acc['min'], acc['max'])[j][1]*S[1], (acc['min'], acc['max'])[k][2]*S[2]])
               for i in (0, 1) for j in (0, 1) for k in (0, 1)]
        return [[round(min(T[c] + p[c] for p in pts), 3) for c in range(3)], [round(max(T[c] + p[c] for p in pts), 3) for c in range(3)]]
    for ri in roots:
        print(f"{b['nodes'][ri]['name']:14s} rest box min/max (x,y,z) {box(ri)}")
    pi = [i for i in roots if b['nodes'][i]['name'] == 'Print'][0]
    print(f"{'Print':14s} fed-out box min/max (x,y,z) {box(pi, end, end_rot)}")
    print('new nodes', len(node_map), 'meshes', len(b['meshes']), 'bin', len(bbin), 'bytes')

    if apply:
        with open(DST + '.bin', 'wb') as f:
            f.write(bbin)
        with open(DST + '.gltf', 'w', encoding='utf-8') as f:
            json.dump(b, f, separators=(',', ':'))
        print('WRITTEN', DST + '.gltf/.bin (original in', BACKUP + ')')


main()
