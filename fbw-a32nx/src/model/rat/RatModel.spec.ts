// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// Contracts of the A32NX ram air turbine (RAT) exterior model:
// - rat.gltf + rat.bin are what generate-rat.js writes, and they follow the MSFS optimized glTF layout that build.js
//   appends to the exterior LOD00/LOD01 (a mesh with several primitives that do not share one vertex/index block
//   crashes the sim while loading the aircraft);
// - the RAT component of A320_NEO.xml drives exactly the animations and nodes of the model, from the L:vars the
//   hydraulic systems publish (A32NX_RAT_STOW_POSITION, _ANGULAR_POSITION, _PROPELLER_ANGLE, _RPM);
// - the geometry: stowed inside the belly skin, deployed under the left belly fairing ahead of the main gear bay,
//   clear of the ground and with the blade tips clear of the belly;
// - the propeller: the 29.5 in (749.3 mm) turbine of the A320 RAT (Hamilton Sundstrand CMM ERPS06M).

import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

// generate-rat.js is a CommonJS build script (run with node), loaded as such
const rat = createRequire(__filename)('./generate-rat.js');

const RAT_DIR = __dirname;
const MODEL_DIR = join(RAT_DIR, '..');
const A32NX_DIR = join(MODEL_DIR, '..', '..');
const BEHAVIOR_XML = join(
  A32NX_DIR,
  'src/base/flybywire-aircraft-a320-neo/SimObjects/AirPlanes/FlyByWire_A320_NEO/model/A320_NEO.xml',
);
const SIMVARS_DOC = join(A32NX_DIR, 'docs/a320-simvars.md');

type Vec = number[];
interface Gltf {
  nodes: { name: string; mesh?: number; children?: number[]; translation?: Vec; rotation?: Vec; scale?: Vec }[];
  meshes: { name: string; primitives: { attributes: Record<string, number>; indices: number; extras?: any }[] }[];
  accessors: { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string }[];
  bufferViews: { byteOffset?: number; byteLength: number; byteStride?: number }[];
  animations: {
    name: string;
    channels: { sampler: number; target: { node: number; path: string } }[];
    samplers: { input: number; output: number }[];
  }[];
  buffers: { byteLength: number; uri: string }[];
}

const loadGltf = (path: string): { gltf: Gltf; bin: Buffer } => {
  const gltf = JSON.parse(readFileSync(path, 'utf8'));
  return { gltf, bin: readFileSync(join(path, '..', gltf.buffers[0].uri)) };
};

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const COMPONENT_SIZE: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

/** Float (5126) or unsigned short (5123) accessor values, one array per element. */
function readAccessor(gltf: Gltf, bin: Buffer, index: number): Vec[] {
  const accessor = gltf.accessors[index];
  const view = gltf.bufferViews[accessor.bufferView];
  const count = COMPONENTS[accessor.type];
  const size = COMPONENT_SIZE[accessor.componentType];
  const stride = view.byteStride ?? size * count;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const values: Vec[] = [];
  for (let i = 0; i < accessor.count; i++) {
    const element: number[] = [];
    for (let c = 0; c < count; c++) {
      const offset = start + i * stride + c * size;
      element.push(accessor.componentType === 5126 ? bin.readFloatLE(offset) : bin.readUInt16LE(offset));
    }
    values.push(element);
  }
  return values;
}

/** Row-major 4x4 matrix of a node's translation, rotation (quaternion x, y, z, w) and scale. */
function trsMatrix(t: Vec = [0, 0, 0], q: Vec = [0, 0, 0, 1], s: Vec = [1, 1, 1]): number[] {
  const [x, y, z, w] = q;
  const r = [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
  return [
    r[0][0] * s[0],
    r[0][1] * s[1],
    r[0][2] * s[2],
    t[0],
    r[1][0] * s[0],
    r[1][1] * s[1],
    r[1][2] * s[2],
    t[1],
    r[2][0] * s[0],
    r[2][1] * s[1],
    r[2][2] * s[2],
    t[2],
    0,
    0,
    0,
    1,
  ];
}

const multiply = (a: number[], b: number[]): number[] =>
  Array.from({ length: 16 }, (_, k) => {
    const row = Math.floor(k / 4);
    const col = k % 4;
    return (
      a[row * 4] * b[col] + a[row * 4 + 1] * b[4 + col] + a[row * 4 + 2] * b[8 + col] + a[row * 4 + 3] * b[12 + col]
    );
  });

const apply = (m: number[], p: Vec): Vec =>
  [0, 1, 2].map((r) => m[r * 4] * p[0] + m[r * 4 + 1] * p[1] + m[r * 4 + 2] * p[2] + m[r * 4 + 3]);

/** World-space vertices of a mesh node, with optional rotation overrides (node index -> quaternion). */
function worldVertices(gltf: Gltf, bin: Buffer, name: string, rotations = new Map<number, Vec>()): Vec[] {
  const parent = new Map<number, number>();
  gltf.nodes.forEach((n, i) => n.children?.forEach((c) => parent.set(c, i)));
  let index = gltf.nodes.findIndex((n) => n.name === name);
  const node = gltf.nodes[index];
  let world = trsMatrix(node.translation, rotations.get(index) ?? node.rotation, node.scale);
  while (parent.has(index)) {
    index = parent.get(index) as number;
    const p = gltf.nodes[index];
    world = multiply(trsMatrix(p.translation, rotations.get(index) ?? p.rotation, p.scale), world);
  }
  const positions = readAccessor(gltf, bin, gltf.meshes[node.mesh as number].primitives[0].attributes.POSITION);
  return positions.map((p) => apply(world, p));
}

/** Evaluates the RPN of an ANIM_CODE or VISIBILITY_CODE with the given L:var values. */
function evaluate(code: string, localVars: Record<string, number>): number {
  const stack: number[] = [];
  const pop = (): number => {
    const value = stack.pop();
    if (value === undefined) {
      throw new Error(`RPN stack underflow in: ${code}`);
    }
    return value;
  };
  const binary = (f: (a: number, b: number) => number) => {
    const b = pop();
    const a = pop();
    stack.push(f(a, b));
  };
  for (const token of code.match(/\(L:[^)]*\)|\S+/g) ?? []) {
    const localVar = /^\(L:([^,)]+)/.exec(token);
    if (localVar) {
      const name = localVar[1].trim();
      if (!(name in localVars)) {
        throw new Error(`L:${name} not set in the test`);
      }
      stack.push(localVars[name]);
    } else if (/^-?\d+(\.\d+)?$/.test(token)) {
      stack.push(Number(token));
    } else if (token === 'dnor') {
      stack.push(((pop() % 360) + 360) % 360);
    } else {
      const ops: Record<string, (a: number, b: number) => number> = {
        '*': (a, b) => a * b,
        '/': (a, b) => a / b,
        '+': (a, b) => a + b,
        '-': (a, b) => a - b,
        '>': (a, b) => (a > b ? 1 : 0),
        '<': (a, b) => (a < b ? 1 : 0),
        '>=': (a, b) => (a >= b ? 1 : 0),
        and: (a, b) => (a && b ? 1 : 0),
      };
      if (!ops[token]) {
        throw new Error(`Unsupported RPN token ${token}`);
      }
      binary(ops[token]);
    }
  }
  if (stack.length !== 1) {
    throw new Error(`RPN stack holds ${stack.length} values after: ${code}`);
  }
  return stack[0];
}

/** The RAT component of A320_NEO.xml: its animations and its per-node visibility codes. */
function ratBehaviour(): { animations: Map<string, string>; visibility: Map<string, string> } {
  const doc = new DOMParser().parseFromString(readFileSync(BEHAVIOR_XML, 'utf8'), 'text/xml');
  const component = Array.from(doc.getElementsByTagName('Component')).find((c) => c.getAttribute('ID') === 'RAT');
  if (!component) {
    throw new Error('No RAT component in A320_NEO.xml');
  }
  const animations = new Map<string, string>();
  const visibility = new Map<string, string>();
  for (const child of Array.from(component.children)) {
    if (child.tagName === 'UseTemplate' && child.getAttribute('Name') === 'ASOBO_GT_Anim') {
      const name = child.getElementsByTagName('ANIM_NAME')[0].textContent?.trim() ?? '';
      animations.set(name, child.getElementsByTagName('ANIM_CODE')[0].textContent?.trim() ?? '');
    } else if (child.tagName === 'Component') {
      const code = child.getElementsByTagName('VISIBILITY_CODE')[0]?.textContent?.trim() ?? '';
      visibility.set(child.getAttribute('Node') ?? '', code);
    }
  }
  return { animations, visibility };
}

const { gltf, bin } = loadGltf(join(RAT_DIR, 'rat.gltf'));
const RAT_NODES = gltf.nodes.map((n) => n.name);
const MOVING_PARTS = ['RAT_STRUT', 'RAT_HUB', 'RAT_BLADE_1', 'RAT_BLADE_2', 'RAT_BLUR'];

/** Node rotations of the deployment animation at a stow position 0..1 (one key per 0.1). */
function poseAt(position: number): Map<number, Vec> {
  const animation = gltf.animations.find((a) => a.name === 'A32NX_HYD_RAT_STOW_POSITION');
  const key = Math.round(position * 10);
  const rotations = new Map<number, Vec>();
  animation?.channels.forEach((channel) => {
    rotations.set(channel.target.node, readAccessor(gltf, bin, animation.samplers[channel.sampler].output)[key]);
  });
  return rotations;
}

describe('A32NX RAT model files', () => {
  it('are what generate-rat.js writes (regenerate and commit both files after a change)', () => {
    const generated = rat.generate();
    expect(generated.gltfText === readFileSync(join(RAT_DIR, 'rat.gltf'), 'utf8')).toBe(true);
    expect(Buffer.compare(generated.bin, bin)).toBe(0);
  });

  it('are appended to the exterior LOD00 and LOD01 by models.json', () => {
    const models = JSON.parse(readFileSync(join(MODEL_DIR, 'models.json'), 'utf8'));
    const additions = models.flatMap((m: any) => (m.additions ?? []).map((a: any) => ({ model: m.gltf[1], ...a })));
    const addition = additions.find((a: any) => a.gltf === './rat/rat.gltf');
    expect(addition).toMatchObject({
      bin: './rat/rat.bin',
      lods: [0, 1],
      model: './a320-exterior/A320_NEO_LOD01.gltf',
    });
  });

  it('follow the MSFS optimized layout: one primitive per mesh, 36-byte vertices, 16-bit indices', () => {
    for (const mesh of gltf.meshes) {
      // several primitives with their own vertex/index blocks crash MSFS on load: one primitive per mesh
      expect(mesh.primitives, mesh.name).toHaveLength(1);
      const primitive = mesh.primitives[0];
      expect(Object.keys(primitive.attributes).sort()).toEqual([
        'COLOR_0',
        'NORMAL',
        'POSITION',
        'TANGENT',
        'TEXCOORD_0',
        'TEXCOORD_1',
      ]);
      const views = new Set(Object.values(primitive.attributes).map((a) => gltf.accessors[a].bufferView));
      expect(views.size).toBe(1);
      expect(gltf.bufferViews[[...views][0]].byteStride).toBe(36);
      const indexAccessor = gltf.accessors[primitive.indices];
      expect(indexAccessor.componentType).toBe(5123);
      expect(primitive.extras.ASOBO_primitive).toEqual({
        PrimitiveCount: indexAccessor.count / 3,
        VertexType: 'VTX',
        VertexVersion: 2,
      });
      const vertexCount = gltf.accessors[primitive.attributes.POSITION].count;
      expect(Math.max(...readAccessor(gltf, bin, primitive.indices).map((i) => i[0]))).toBeLessThan(vertexCount);
    }
    for (const accessor of gltf.accessors) {
      const view = gltf.bufferViews[accessor.bufferView];
      const element = COMPONENT_SIZE[accessor.componentType] * COMPONENTS[accessor.type];
      const end = (accessor.byteOffset ?? 0) + (view.byteStride ?? element) * (accessor.count - 1) + element;
      expect(end).toBeLessThanOrEqual(view.byteLength);
      expect((accessor.byteOffset ?? 0) % COMPONENT_SIZE[accessor.componentType]).toBe(0);
    }
    expect(gltf.buffers[0].byteLength).toBe(bin.length);
  });

  it('keep one kind of accessor per unstrided view, one view per animation accessor, like every model the sim loads', () => {
    // A view holding the SCALAR keys and the VEC4 rotations together is in none of the 5916 optimized models of the
    // installed packages; the exterior LOD00/01 that had it stayed invisible in the sim (2026-10-09).
    gltf.bufferViews.forEach((view, index) => {
      if (view.byteStride === undefined) {
        const kinds = new Set(
          gltf.accessors.filter((a) => a.bufferView === index).map((a) => `${a.type}/${a.componentType}`),
        );
        expect(kinds.size, `bufferView ${index}`).toBeLessThanOrEqual(1);
      }
    });
    const animationAccessors = new Set(gltf.animations.flatMap((a) => a.samplers.flatMap((s) => [s.input, s.output])));
    for (const index of animationAccessors) {
      const view = gltf.accessors[index].bufferView;
      expect(
        gltf.accessors.filter((a) => a.bufferView === view),
        `accessor ${index}`,
      ).toHaveLength(1);
    }
  });

  it('give every node a mesh (build.js offsets node.mesh without checking it)', () => {
    for (const node of gltf.nodes) {
      expect(Number.isInteger(node.mesh), node.name).toBe(true);
    }
  });

  it('use node and animation names that the exterior model does not use', () => {
    for (const lod of ['A320_NEO_LOD00', 'A320_NEO_LOD01']) {
      const exterior = JSON.parse(readFileSync(join(MODEL_DIR, 'a320-exterior', `${lod}.gltf`), 'utf8'));
      const names = new Set([
        ...exterior.nodes.map((n: any) => n.name),
        ...exterior.animations.map((a: any) => a.name),
      ]);
      for (const name of [...RAT_NODES, ...gltf.animations.map((a) => a.name)]) {
        expect(names.has(name), `${lod} ${name}`).toBe(false);
      }
    }
  });

  it('animate with 11 unit-quaternion keys that never flip between neighbours', () => {
    expect(gltf.animations.map((a) => a.name).sort()).toEqual([
      'A32NX_HYD_RAT_PROPELLER_ANGLE',
      'A32NX_HYD_RAT_RPM',
      'A32NX_HYD_RAT_STOW_POSITION',
    ]);
    for (const animation of gltf.animations) {
      for (const channel of animation.channels) {
        const sampler = animation.samplers[channel.sampler];
        expect(readAccessor(gltf, bin, sampler.input).map((t) => t[0] * 24)).toEqual(
          Array.from({ length: 11 }, (_, k) => expect.closeTo(k, 5)),
        );
        const keys = readAccessor(gltf, bin, sampler.output);
        keys.forEach((q, k) => {
          expect(Math.hypot(...q)).toBeCloseTo(1, 5);
          if (k > 0) {
            expect(q.reduce((sum, c, i) => sum + c * keys[k - 1][i], 0)).toBeGreaterThan(0);
          }
        });
      }
    }
  });
});

describe('A32NX RAT behaviour (A320_NEO.xml RAT component)', () => {
  const { animations, visibility } = ratBehaviour();

  it('drives exactly the animations and the nodes of the model', () => {
    expect([...animations.keys()].sort()).toEqual(gltf.animations.map((a) => a.name).sort());
    expect([...visibility.keys()].sort()).toEqual([...RAT_NODES].sort());
  });

  it('reads only L:vars documented in a320-simvars.md', () => {
    const doc = readFileSync(SIMVARS_DOC, 'utf8');
    const codes = [...animations.values(), ...visibility.values()].join(' ');
    const vars = new Set([...codes.matchAll(/\(L:([A-Z0-9_]+)/g)].map((m) => m[1]));
    expect([...vars].sort()).toEqual([
      'A32NX_RAT_ANGULAR_POSITION',
      'A32NX_RAT_PROPELLER_ANGLE',
      'A32NX_RAT_RPM',
      'A32NX_RAT_STOW_POSITION',
    ]);
    for (const name of vars) {
      expect(doc.includes(`- ${name}\n`) || doc.includes(`- ${name}\r\n`), name).toBe(true);
    }
  });

  it('maps the stow position 0..1 onto the whole deployment', () => {
    const code = animations.get('A32NX_HYD_RAT_STOW_POSITION') as string;
    expect(evaluate(code, { A32NX_RAT_STOW_POSITION: 0 })).toBe(0);
    expect(evaluate(code, { A32NX_RAT_STOW_POSITION: 0.5 })).toBe(50);
    expect(evaluate(code, { A32NX_RAT_STOW_POSITION: 1 })).toBe(100);
  });

  it('turns the propeller one turn per animation, wrapped, and keeps the blades indexed until 80 % out', () => {
    const code = animations.get('A32NX_HYD_RAT_RPM') as string;
    const at = (stow: number, angle: number) =>
      evaluate(code, { A32NX_RAT_STOW_POSITION: stow, A32NX_RAT_ANGULAR_POSITION: angle });
    expect(at(1, 0)).toBe(0);
    expect(at(1, 90)).toBeCloseTo(25);
    expect(at(1, 359)).toBeCloseTo((359 / 360) * 100);
    expect(at(1, -90)).toBeCloseTo(75);
    expect(at(0.9, 180)).toBeCloseTo(50);
    expect(at(0.5, 137)).toBe(0);
    expect(at(0, 137)).toBe(0);
  });

  it('sets the blade pitch from the propeller angle', () => {
    const code = animations.get('A32NX_HYD_RAT_PROPELLER_ANGLE') as string;
    expect(evaluate(code, { A32NX_RAT_PROPELLER_ANGLE: 0.4 })).toBeCloseTo(40);
  });

  it('hides the whole RAT when stowed, shows the blades slow and the blur disc fast', () => {
    const shown = (stow: number, rpm: number) =>
      RAT_NODES.filter(
        (node) => evaluate(visibility.get(node) as string, { A32NX_RAT_STOW_POSITION: stow, A32NX_RAT_RPM: rpm }) !== 0,
      ).sort();
    expect(shown(0, 0)).toEqual([]);
    const allButBlur = RAT_NODES.filter((n) => n !== 'RAT_BLUR').sort();
    expect(shown(0.05, 0)).toEqual(allButBlur);
    expect(shown(1, 0)).toEqual(allButBlur);
    expect(shown(1, 499)).toEqual(allButBlur);
    expect(shown(1, 6000)).toEqual(RAT_NODES.filter((n) => n !== 'RAT_BLADE_1' && n !== 'RAT_BLADE_2').sort());
  });
});

describe('A32NX RAT position', () => {
  const exterior = loadGltf(join(MODEL_DIR, 'a320-exterior', 'A320_NEO_LOD00.gltf'));
  const lowest = (vertices: Vec[], axis: number) => Math.min(...vertices.map((v) => v[axis]));
  const highest = (vertices: Vec[], axis: number) => Math.max(...vertices.map((v) => v[axis]));

  it('keeps the stowed turbine inside the belly skin', () => {
    // the whole lower fuselage around the bay, wide enough for the stowed blur disc
    const skin = new rat.FuselageSkin(undefined, { minX: 0.9, maxX: 2.1, minZ: -3.2, maxZ: -1.0, maxY: 0 });
    const stowed = poseAt(0);
    for (const part of MOVING_PARTS) {
      for (const [x, y, z] of worldVertices(gltf, bin, part, stowed)) {
        expect(y, `${part} at x=${x} z=${z}`).toBeGreaterThan(skin.sample(x, z).y);
      }
    }
  });

  it('deploys under the left belly fairing, ahead of the main gear bay and clear of the ground', () => {
    const deployed = MOVING_PARTS.flatMap((part) => worldVertices(gltf, bin, part, poseAt(1)));
    const gearDoor = worldVertices(exterior.gltf, exterior.bin, 'DOOR03_LEFT');
    const tyre = worldVertices(exterior.gltf, exterior.bin, 'WHEEL_LEFT_1');
    // MSFS model frame: +X is left
    expect(lowest(deployed, 0)).toBeGreaterThan(1);
    // the aft-most part (gearbox tail) stays ahead of the main gear bay door
    expect(lowest(deployed, 2)).toBeGreaterThan(highest(gearDoor, 2) + 0.1);
    // ground clearance above the lowest point of the main gear tyres (model rest pose)
    expect(lowest(deployed, 1) - lowest(tyre, 1)).toBeGreaterThan(0.5);
    // the propeller disc hangs well below the belly
    const hub = worldVertices(gltf, bin, 'RAT_HUB', poseAt(1));
    expect(highest(hub, 1)).toBeLessThan(-1.1);
  });

  it('keeps the deployed blade tips clear of the belly skin at every blade angle', () => {
    // the blur disc is the circle swept by the blade tips: test it rather than one blade angle
    const skin = new rat.FuselageSkin(undefined, { minX: 0.9, maxX: 2.1, minZ: -3.2, maxZ: -1.0, maxY: 0 });
    for (const [x, y, z] of worldVertices(gltf, bin, 'RAT_BLUR', poseAt(1))) {
      expect(skin.sample(x, z).y - y, `blade tip at x=${x} y=${y}`).toBeGreaterThan(0.1);
    }
  });
});

describe('A32NX RAT propeller', () => {
  // Hamilton Sundstrand component maintenance manual, model ERPS06M (the A320 RAT module):
  // "Turbine Diameter ... 29.5 inch (749.3 mm)". The about 1.6 m seen online is the A380 RAT (1625.6 mm).
  const TURBINE_DIAMETER_M = 29.5 * 0.0254;
  const meshPositions = (name: string) => {
    const node = gltf.nodes.find((n) => n.name === name);
    return readAccessor(gltf, bin, gltf.meshes[node?.mesh as number].primitives[0].attributes.POSITION);
  };

  it('has the 29.5 in (749.3 mm) turbine of the A320 RAT', () => {
    for (const blade of ['RAT_BLADE_1', 'RAT_BLADE_2']) {
      // blade frame: the blade runs along +Y from the hub axis, so its tip height is the turbine radius
      const tipRadius = Math.max(...meshPositions(blade).map((p) => p[1]));
      expect(2 * tipRadius, blade).toBeCloseTo(TURBINE_DIAMETER_M, 3);
    }
  });

  it('shows a blur disc as large as the circle swept by the blade tips', () => {
    const blurRadius = Math.max(...meshPositions('RAT_BLUR').map(([x, y]) => Math.hypot(x, y)));
    expect(2 * blurRadius).toBeCloseTo(TURBINE_DIAMETER_M, 3);
  });
});
