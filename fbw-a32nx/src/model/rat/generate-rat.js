// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/* eslint-env node */
'use strict';

/*
 * Generates rat.gltf + rat.bin: the ram air turbine (RAT) of the A320 for the exterior model.
 *
 * The A32NX exterior model never had a RAT. build.js appends these two files to the exterior LOD00 and LOD01 (the
 * "additions" of models.json). The behaviour lives in the RAT component of A320_NEO.xml.
 *
 * Run from the repository root after changing this file, and commit the two generated files:
 *   node fbw-a32nx/src/model/rat/generate-rat.js
 *
 * Model frame (MSFS glTF): +X = left, +Y = up, +Z = forward, metres. The exterior nodes it touches have no transform.
 *
 * Sources:
 * - FCOM DSC-29-10-20: "The RAT deploys automatically if AC BUS 1 and AC BUS 2 are both lost. It can be deployed
 *   manually from the overhead panel. It can be stowed only when the aircraft is on the ground."
 * - The FCOM and the other Airbus documents on hand do not give the RAT location or size. The RAT sits in the LEFT
 *   belly fairing, just forward of the main gear well (crew and engineer accounts, e.g. airliners.net "Which airliners
 *   have ram air turbines"). Design choice for the exact numbers: the doors, the hinge and the propeller size follow
 *   the RAT of a commercial A320 model (positions and sizes measured only, nothing copied). Its main gear bay doors
 *   line up with ours within 3 cm along Z and its fuselage is 0.2 m lower (Y), so its slot maps onto ours at the same
 *   X and Z: a 1.1 m long, 0.16 m wide slot with two doors, 0.24 m ahead of the main gear bay doors, and a two-blade
 *   propeller (its stowed blades measure 0.74 m fore-aft).
 * - Propeller size: Hamilton Sundstrand component maintenance manual, model ERPS06M, "Ram air turbine module", as
 *   reproduced for the A320 in the French education ministry RAT resource file (eduscol STI, seminar 5277, U41,
 *   "Caracteristiques techniques de la RAT - Pour un A320"): "Turbine Diameter ... 29.5 inch (749.3 mm)", governed
 *   turbine speed 4,800/6,600 rpm. The same file gives 1625.6 mm for the A380 RAT, which is where the "about 1.6 m"
 *   figure seen online comes from (fbw-common electrical RamAirTurbine uses that 1.6256 m for the A380X).
 *   The A32NX hydraulic systems use a 1.003 m propeller (fbw-common hydraulic RamAirTurbine::PROPELLER_DIAMETER_M).
 *   Design choice: the model keeps the real 749.3 mm; the systems value is left alone because it is tuned together
 *   with the WindTurbine efficiency curve (BEST_EFFICIENCY_TIP_SPEED_RATIO) for the blue pressure behaviour. A 1.003 m
 *   disc would not fit under the belly either: on this strut its upper blade tip would pass 3 mm from the skin.
 * - The systems (fbw-common RamAirTurbine, WindTurbine) publish the L:vars that drive the animations:
 *   A32NX_RAT_STOW_POSITION (0 stowed .. 1 deployed), A32NX_RAT_ANGULAR_POSITION (degrees, 0..360),
 *   A32NX_RAT_PROPELLER_ANGLE (0..1) and A32NX_RAT_RPM.
 *
 * The output follows the MSFS optimized glTF layout of the other additions (cargo-hinge, chocks): one interleaved
 * 36-byte vertex view (POSITION f32x3, TANGENT i8x4, NORMAL i8x4, TEXCOORD_0/1 f16x2, COLOR_0 f16x4), one u16 index
 * view, and every mesh has exactly ONE primitive with its own accessors (a mesh with several primitives that do not
 * share one vertex/index block crashes MSFS while loading the aircraft), and one unstrided view per animation accessor
 * (never SCALAR keys and VEC4 rotations in one view). Every node has a mesh, because build.js combineGltf offsets
 * node.mesh without checking it.
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------------------------------------------------
// Geometry (metres, model frame)
// ---------------------------------------------------------------------------------------------------------------------

/** Lateral position of the door hinge lines: the slot runs between them (left side of the belly, +X). */
const SLOT_INBOARD_X = 1.421;
const SLOT_OUTBOARD_X = 1.578;
/** Longitudinal ends of the slot. */
const SLOT_AFT_Z = -2.693;
const SLOT_FORWARD_Z = -1.592;
/** Gap between the free edges of the two closed doors. */
const DOOR_GAP = 0.001;
const DOOR_THICKNESS = 0.006;
/**
 * The doors and the dark cavity are only visible while the RAT is out, and they sit outside the fuselage skin, so they
 * never fight with it or with the overlays on it (FUSELAGE_FROSTED is 10 mm out, the ribbons 3.5 mm).
 */
const CAVITY_OFFSET = 0.012;
const DOOR_OFFSET = 0.015;

/** Strut hinge (pivot about the lateral axis), near the aft end of the slot, inside the fairing. */
const HINGE_Z = -2.608;
/** High enough that the stowed strut root (0.15 m chord, standing near vertical) stays inside the skin. */
const HINGE_ABOVE_SKIN = 0.09;
/** From the hinge axis down to the gearbox axis. */
const STRUT_LENGTH = 0.6;
/** Propeller disc centre, ahead of the strut on the gearbox axis. */
const PROPELLER_FORWARD = 0.19;
/** A320 RAT turbine diameter: 29.5 in = 749.3 mm (Hamilton Sundstrand CMM ERPS06M, see the header). */
const PROPELLER_DIAMETER = 0.7493;
/** Blade tip radius, from the hub axis. */
const PROPELLER_RADIUS = PROPELLER_DIAMETER / 2;
const BLADE_ROOT_RADIUS = 0.055;

/**
 * Stowed, the strut points forward and 10 degrees up from the hinge, so the stowed RAT stays inside the fairing.
 * Deployed, it hangs straight down.
 */
const STRUT_STOWED_ANGLE_DEG = -100;
/** The doors swing open by 90 degrees during the first 20 % of the travel, the strut moves from 10 % to 100 %. */
const DOOR_OPEN_ANGLE_DEG = 90;
const DOOR_FULLY_OPEN_POSITION = 0.2;
const STRUT_START_POSITION = 0.1;

/**
 * Blade pitch from A32NX_RAT_PROPELLER_ANGLE (1 - governor beta): 1 at low speed, 0 when the governor coarsens the
 * blades to hold the speed. Design choice: 15 degrees from the disc plane at 1, 40 degrees at 0.
 */
const BLADE_PITCH_AT_ANGLE_1_DEG = 15;
const BLADE_PITCH_AT_ANGLE_0_DEG = 40;
/** Extra pitch at the blade root (twist), decreasing linearly to 0 at the tip. */
const BLADE_ROOT_TWIST_DEG = 10;

/** Animation keys: 11 keys, frames 0 to 10 at 24 frames/s like the A380X RAT (the sim maps ANIM_CODE 0..100 on them). */
const KEY_COUNT = 11;
const FRAMES_PER_SECOND = 24;

const MATERIALS = [
  { name: 'A32NX_RAT_STRUT', color: [0.62, 0.63, 0.64, 1], metallic: 0.3, roughness: 0.45 },
  { name: 'A32NX_RAT_HUB', color: [0.75, 0.76, 0.78, 1], metallic: 0.8, roughness: 0.3 },
  { name: 'A32NX_RAT_BLADE', color: [0.08, 0.08, 0.09, 1], metallic: 0.1, roughness: 0.5 },
  { name: 'A32NX_RAT_CAVITY', color: [0.03, 0.03, 0.035, 1], metallic: 0, roughness: 0.9 },
  { name: 'A32NX_RAT_DOOR_INNER', color: [0.42, 0.5, 0.43, 1], metallic: 0.1, roughness: 0.6 },
  { name: 'A32NX_RAT_BLUR', color: [0.1, 0.1, 0.1, 0.28], metallic: 0, roughness: 0.5, blend: true },
];
/** The outer door faces use the existing fuselage material (resolved by name in build.js combineGltf). */
const FUSELAGE_MATERIAL = 'FUSELAGE';

const FUSELAGE_SOURCE = path.join(__dirname, '..', 'fuse', 'A320_NEO_LOD00.gltf');
const OUTPUT_GLTF = path.join(__dirname, 'rat.gltf');
const OUTPUT_BIN_NAME = 'rat.bin';

// ---------------------------------------------------------------------------------------------------------------------
// Math
// ---------------------------------------------------------------------------------------------------------------------

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vectorLength = (a) => Math.sqrt(dot(a, a));
const normalize = (a) => {
  const l = vectorLength(a);
  return l > 0 ? scale(a, 1 / l) : [0, 0, 0];
};
const toRad = (deg) => (deg * Math.PI) / 180;

/** Unit quaternion [x, y, z, w] of a rotation by angleDeg about a unit axis. */
function quatFromAxisAngle(axis, angleDeg) {
  const half = toRad(angleDeg) / 2;
  const s = Math.sin(half);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)];
}

/** Quaternion product a * b (apply b first, then a). */
function quatMultiply(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

/** Rotates vector v by the unit quaternion q. */
function quatRotate(q, v) {
  const u = [q[0], q[1], q[2]];
  const t = scale(cross(u, v), 2);
  return add(add(v, scale(t, q[3])), cross(u, t));
}

/** IEEE 754 half-precision bits of a number (round to nearest even), as MSFS stores TEXCOORD and COLOR_0. */
function toHalf(value) {
  const f32 = new Float32Array(1);
  const u32 = new Uint32Array(f32.buffer);
  f32[0] = value;
  const bits = u32[0];
  const sign = (bits >>> 16) & 0x8000;
  const exponent = (bits >>> 23) & 0xff;
  let mantissa = bits & 0x7fffff;
  if (exponent === 0xff) {
    return sign | 0x7c00 | (mantissa ? 0x200 : 0);
  }
  const halfExponent = exponent - 127 + 15;
  if (halfExponent >= 0x1f) {
    return sign | 0x7c00;
  }
  if (halfExponent <= 0) {
    if (halfExponent < -10) {
      return sign;
    }
    mantissa |= 0x800000;
    const shift = 14 - halfExponent;
    let halfMantissa = mantissa >>> shift;
    const remainder = mantissa & ((1 << shift) - 1);
    const halfway = 1 << (shift - 1);
    if (remainder > halfway || (remainder === halfway && halfMantissa & 1)) {
      halfMantissa++;
    }
    return sign | halfMantissa;
  }
  let half = sign | (halfExponent << 10) | (mantissa >>> 13);
  const remainder = mantissa & 0x1fff;
  if (remainder > 0x1000 || (remainder === 0x1000 && half & 1)) {
    half++;
  }
  return half;
}

/** Number of a half-precision bit pattern. */
function fromHalf(bits) {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >>> 10) & 0x1f;
  const mantissa = bits & 0x3ff;
  if (exponent === 0) {
    return sign * mantissa * 2 ** -24;
  }
  if (exponent === 0x1f) {
    return mantissa ? NaN : sign * Infinity;
  }
  return sign * (1 + mantissa / 1024) * 2 ** (exponent - 15);
}

// ---------------------------------------------------------------------------------------------------------------------
// Fuselage skin sampling: the door outer faces and the cavity follow the real skin, with its texture coordinates
// ---------------------------------------------------------------------------------------------------------------------

const COMPONENT_SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COMPONENT_COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

/**
 * Reads an accessor of an MSFS glTF as arrays of numbers. Signed bytes are normalised (/127, NORMAL and TANGENT),
 * signed shorts are half floats (TEXCOORD in the MSFS optimized layout).
 */
function readAccessor(gltf, bin, accessorIndex) {
  const accessor = gltf.accessors[accessorIndex];
  const view = gltf.bufferViews[accessor.bufferView];
  const componentSize = COMPONENT_SIZE[accessor.componentType];
  const count = COMPONENT_COUNT[accessor.type];
  const stride = view.byteStride || componentSize * count;
  const start = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const values = [];
  for (let i = 0; i < accessor.count; i++) {
    const element = [];
    for (let c = 0; c < count; c++) {
      const offset = start + i * stride + c * componentSize;
      switch (accessor.componentType) {
        case 5126:
          element.push(bin.readFloatLE(offset));
          break;
        case 5120:
          element.push(bin.readInt8(offset) / 127);
          break;
        case 5122:
          element.push(fromHalf(bin.readUInt16LE(offset)));
          break;
        case 5123:
          element.push(bin.readUInt16LE(offset));
          break;
        case 5125:
          element.push(bin.readUInt32LE(offset));
          break;
        default:
          throw new Error(`Unsupported component type ${accessor.componentType}`);
      }
    }
    values.push(element);
  }
  return values;
}

/** The part of the belly the generator reads by default: around the slot (metres, model frame). */
const SLOT_WINDOW = {
  minX: SLOT_INBOARD_X - 0.12,
  maxX: SLOT_OUTBOARD_X + 0.12,
  minZ: SLOT_AFT_Z - 0.15,
  maxZ: SLOT_FORWARD_Z + 0.2,
  maxY: -0.6,
};

/**
 * The lower fuselage skin in a window (default: around the RAT slot), from the FUSELAGE node of the build's LOD00
 * fuselage source. A triangle is kept when one of its corners lies in the window.
 */
class FuselageSkin {
  constructor(gltfPath = FUSELAGE_SOURCE, window = SLOT_WINDOW) {
    const gltf = JSON.parse(fs.readFileSync(gltfPath, 'utf8'));
    const bin = fs.readFileSync(path.join(path.dirname(gltfPath), gltf.buffers[0].uri));
    const node = gltf.nodes.find((n) => n.name === 'FUSELAGE');
    if (!node || node.translation || node.rotation || node.scale || node.matrix) {
      throw new Error('Expected a FUSELAGE node without a transform');
    }

    /** Triangles near the slot: {p: 3 positions, uv0, uv1, normal, tangent: 3 values each} */
    this.triangles = [];
    for (const primitive of gltf.meshes[node.mesh].primitives) {
      const position = readAccessor(gltf, bin, primitive.attributes.POSITION);
      const uv0 = readAccessor(gltf, bin, primitive.attributes.TEXCOORD_0);
      const uv1 = readAccessor(gltf, bin, primitive.attributes.TEXCOORD_1);
      const normal = readAccessor(gltf, bin, primitive.attributes.NORMAL);
      const tangent = readAccessor(gltf, bin, primitive.attributes.TANGENT);
      const indices = readAccessor(gltf, bin, primitive.indices).map((v) => v[0]);
      for (let i = 0; i < indices.length; i += 3) {
        const corner = [indices[i], indices[i + 1], indices[i + 2]];
        const p = corner.map((k) => position[k]);
        const inWindow = p.some(
          (v) =>
            v[0] > window.minX && v[0] < window.maxX && v[2] > window.minZ && v[2] < window.maxZ && v[1] < window.maxY,
        );
        if (inWindow) {
          this.triangles.push({
            p,
            uv0: corner.map((k) => uv0[k]),
            uv1: corner.map((k) => uv1[k]),
            normal: corner.map((k) => normal[k]),
            tangent: corner.map((k) => tangent[k]),
          });
        }
      }
    }
  }

  /**
   * The outermost (lowest) skin point on the vertical line through (x, z): height, outward normal, tangent and
   * texture coordinates, interpolated over the hit triangle.
   */
  sample(x, z) {
    let best = null;
    for (const t of this.triangles) {
      const [a, b, c] = t.p;
      const v0 = [b[0] - a[0], b[2] - a[2]];
      const v1 = [c[0] - a[0], c[2] - a[2]];
      const v2 = [x - a[0], z - a[2]];
      const den = v0[0] * v1[1] - v1[0] * v0[1];
      if (Math.abs(den) < 1e-12) {
        continue;
      }
      const wb = (v2[0] * v1[1] - v1[0] * v2[1]) / den;
      const wc = (v0[0] * v2[1] - v2[0] * v0[1]) / den;
      const wa = 1 - wb - wc;
      const eps = -1e-9;
      if (wa < eps || wb < eps || wc < eps) {
        continue;
      }
      const y = wa * a[1] + wb * b[1] + wc * c[1];
      if (best === null || y < best.y) {
        const mix = (values) => values[0].map((_, i) => wa * values[0][i] + wb * values[1][i] + wc * values[2][i]);
        const tangent = mix(t.tangent);
        best = {
          y,
          normal: normalize(mix(t.normal).slice(0, 3)),
          tangent: [...normalize(tangent.slice(0, 3)), t.tangent[0][3] < 0 ? -1 : 1],
          uv0: mix(t.uv0),
          uv1: mix(t.uv1),
        };
      }
    }
    if (best === null) {
      throw new Error(`No fuselage skin at x=${x} z=${z}`);
    }
    return best;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Mesh building
// ---------------------------------------------------------------------------------------------------------------------

/** Any unit vector perpendicular to n, used as the tangent of untextured faces. */
function perpendicular(n) {
  const helper = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  return normalize(cross(helper, n));
}

class MeshBuilder {
  constructor(name, material) {
    this.name = name;
    this.material = material;
    this.vertices = [];
    this.indices = [];
  }

  /** Adds a vertex and returns its index. */
  vertex(position, normal, options = {}) {
    this.vertices.push({
      position,
      normal: normalize(normal),
      tangent: options.tangent || [...perpendicular(normalize(normal)), 1],
      uv0: options.uv0 || [0, 0],
      uv1: options.uv1 || [0, 0],
    });
    if (this.vertices.length > 65535) {
      throw new Error(`${this.name}: too many vertices for 16-bit indices`);
    }
    return this.vertices.length - 1;
  }

  triangle(a, b, c) {
    this.indices.push(a, b, c);
  }

  /**
   * A flat polygon (convex, points in order). The winding is chosen so that the face normal points along
   * outwardHint (a direction away from the solid).
   */
  face(points, outwardHint) {
    // Newell's method: robust normal of a planar polygon
    let normal = [0, 0, 0];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const q = points[(i + 1) % points.length];
      normal = add(normal, [
        (p[1] - q[1]) * (p[2] + q[2]),
        (p[2] - q[2]) * (p[0] + q[0]),
        (p[0] - q[0]) * (p[1] + q[1]),
      ]);
    }
    let ordered = points;
    if (dot(normal, outwardHint) < 0) {
      ordered = [...points].reverse();
      normal = scale(normal, -1);
    }
    const first = this.vertices.length;
    ordered.forEach((p) => this.vertex(p, normal));
    for (let i = 1; i < ordered.length - 1; i++) {
      this.triangle(first, first + i, first + i + 1);
    }
  }

  /**
   * A smooth surface through closed rings of points (each ring has the same point count). centres[i] is a point
   * inside ring i, used to orient the faces outwards. Vertex normals average the adjacent face normals.
   */
  loft(rings, centres, { capStart = false, capEnd = false } = {}) {
    const ringSize = rings[0].length;
    const normals = rings.map((ring) => ring.map(() => [0, 0, 0]));
    const quads = [];
    for (let i = 0; i < rings.length - 1; i++) {
      for (let j = 0; j < ringSize; j++) {
        const k = (j + 1) % ringSize;
        let quad = [
          [i, j],
          [i, k],
          [i + 1, k],
          [i + 1, j],
        ];
        const pts = quad.map(([r, s]) => rings[r][s]);
        let n = normalize(
          add(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])), cross(sub(pts[2], pts[0]), sub(pts[3], pts[0]))),
        );
        const centroid = scale(pts.reduce(add, [0, 0, 0]), 0.25);
        const centre = scale(add(centres[i], centres[i + 1]), 0.5);
        if (dot(n, sub(centroid, centre)) < 0) {
          quad = quad.reverse();
          n = scale(n, -1);
        }
        quad.forEach(([r, s]) => {
          normals[r][s] = add(normals[r][s], n);
        });
        quads.push(quad);
      }
    }
    const base = this.vertices.length;
    rings.forEach((ring, r) => ring.forEach((p, s) => this.vertex(p, normals[r][s])));
    const index = ([r, s]) => base + r * ringSize + s;
    for (const quad of quads) {
      this.triangle(index(quad[0]), index(quad[1]), index(quad[2]));
      this.triangle(index(quad[0]), index(quad[2]), index(quad[3]));
    }
    if (capStart) {
      const outward = sub(centres[0], centres[1]);
      this.face(rings[0], outward);
    }
    if (capEnd) {
      const last = rings.length - 1;
      this.face(rings[last], sub(centres[last], centres[last - 1]));
    }
  }

  bounds() {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const v of this.vertices) {
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], Math.fround(v.position[i]));
        max[i] = Math.max(max[i], Math.fround(v.position[i]));
      }
    }
    return { min, max };
  }
}

/** Ring of n points of radius r around the axis direction (unit, X, Y or Z), centred on c. */
function ring(c, axis, r, n, phase = 0) {
  const u = perpendicular(axis);
  const w = cross(axis, u);
  const points = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (2 * Math.PI * i) / n;
    points.push(add(c, add(scale(u, r * Math.cos(a)), scale(w, r * Math.sin(a)))));
  }
  return points;
}

/** A solid of revolution along an axis: profile = [[distance along axis, radius], ...] from back to front. */
function revolve(mesh, origin, axis, profile, segments) {
  const rings = [];
  const centres = [];
  for (const [along, radius] of profile) {
    const c = add(origin, scale(axis, along));
    centres.push(c);
    rings.push(ring(c, axis, Math.max(radius, 1e-4), segments));
  }
  mesh.loft(rings, centres, { capStart: profile[0][1] > 1e-3, capEnd: profile[profile.length - 1][1] > 1e-3 });
}

// ---------------------------------------------------------------------------------------------------------------------
// RAT parts. Each part is built in the frame of its node.
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Strut frame: origin on the hinge axis, deployed pose (strut down along -Y, gearbox and propeller axis along +Z).
 * Strut with a streamlined section, hinge barrel and gearbox pod: one mesh.
 */
function buildStrut() {
  const mesh = new MeshBuilder('RAT_STRUT', 'A32NX_RAT_STRUT');

  // Streamlined (lens) section in the X-Z plane, tapering from the hinge to the gearbox
  const lens = (y, chord, thickness) => {
    const points = [];
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      // a rounded leading edge (forward, +Z) and a sharper trailing edge
      const zc = Math.cos(a) * chord * 0.5;
      const xc = Math.sin(a) * thickness * 0.5 * (Math.cos(a) > 0 ? 1 : 0.6 + 0.4 * (1 + Math.cos(a)));
      points.push([xc, y, zc]);
    }
    return points;
  };
  const strutLevels = [
    [0.02, 0.15, 0.05],
    [-0.2, 0.14, 0.047],
    [-0.42, 0.125, 0.044],
    [-STRUT_LENGTH, 0.11, 0.04],
  ];
  mesh.loft(
    strutLevels.map(([y, chord, thickness]) => lens(y, chord, thickness)),
    strutLevels.map(([y]) => [0, y, 0]),
    { capStart: true, capEnd: true },
  );

  // Hinge barrel along X
  revolve(
    mesh,
    [-0.045, 0, 0],
    [1, 0, 0],
    [
      [0, 0.03],
      [0.09, 0.03],
    ],
    12,
  );

  // Gearbox pod along Z, from a tail cone to the hub
  revolve(
    mesh,
    [0, -STRUT_LENGTH, 0],
    [0, 0, 1],
    [
      [-0.17, 0.012],
      [-0.13, 0.04],
      [-0.08, 0.058],
      [0, 0.062],
      [PROPELLER_FORWARD - 0.05, 0.062],
    ],
    20,
  );
  return mesh;
}

/** Hub frame: origin at the propeller disc centre, spin axis +Z. Hub barrel and spinner. */
function buildHub() {
  const mesh = new MeshBuilder('RAT_HUB', 'A32NX_RAT_HUB');
  revolve(
    mesh,
    [0, 0, 0],
    [0, 0, 1],
    [
      [-0.05, 0.06],
      [0.03, 0.06],
      [0.07, 0.052],
      [0.105, 0.035],
      [0.13, 0.015],
      [0.14, 0],
    ],
    20,
  );
  return mesh;
}

/**
 * Blade frame: origin at the hub centre, the blade along +Y, the pitch axis. With zero node pitch the chord lies in
 * the disc plane along X (leading edge towards -X, the direction of rotation for a positive spin about +Z); the twist
 * adds pitch towards the root.
 */
function buildBlade(name) {
  const mesh = new MeshBuilder(name, 'A32NX_RAT_BLADE');
  const stations = 8;
  const rings = [];
  const centres = [];
  for (let i = 0; i <= stations; i++) {
    const f = i / stations;
    const r = BLADE_ROOT_RADIUS + f * (PROPELLER_RADIUS - BLADE_ROOT_RADIUS);
    const chord = 0.08 - 0.03 * f;
    const thickness = 0.012 - 0.007 * f;
    const twist = quatFromAxisAngle([0, 1, 0], BLADE_ROOT_TWIST_DEG * (1 - f));
    // flattened hexagon airfoil: leading edge at -X, trailing edge at +X
    const section = [
      [-0.5 * chord, 0],
      [-0.3 * chord, 0.5 * thickness],
      [0.2 * chord, 0.4 * thickness],
      [0.5 * chord, 0],
      [0.2 * chord, -0.4 * thickness],
      [-0.3 * chord, -0.5 * thickness],
    ].map(([x, z]) => {
      const p = quatRotate(twist, [x, 0, z]);
      return [p[0], r, p[2]];
    });
    rings.push(section);
    centres.push([0, r, 0]);
  }
  mesh.loft(rings, centres, { capStart: true, capEnd: true });
  return mesh;
}

/** Blur disc in the strut frame at the propeller disc, shown instead of the blades at speed (double-sided). */
function buildBlur() {
  const mesh = new MeshBuilder('RAT_BLUR', 'A32NX_RAT_BLUR');
  const segments = 48;
  const inner = ring([0, 0, 0], [0, 0, 1], 0.06, segments);
  const outer = ring([0, 0, 0], [0, 0, 1], PROPELLER_RADIUS, segments);
  const base = mesh.vertices.length;
  inner.forEach((p) => mesh.vertex(p, [0, 0, 1]));
  outer.forEach((p) => mesh.vertex(p, [0, 0, 1]));
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    mesh.triangle(base + i, base + segments + i, base + segments + j);
    mesh.triangle(base + i, base + segments + j, base + j);
  }
  return mesh;
}

/** Points of a grid over the skin between x0..x1 and z0..z1, offset outwards by `offset`. */
function skinGrid(skin, x0, x1, z0, z1, nx, nz, offset) {
  const grid = [];
  for (let i = 0; i <= nx; i++) {
    const row = [];
    const x = x0 + ((x1 - x0) * i) / nx;
    for (let j = 0; j <= nz; j++) {
      const z = z0 + ((z1 - z0) * j) / nz;
      const s = skin.sample(x, z);
      row.push({ ...s, position: [x, s.y - offset, z] });
    }
    grid.push(row);
  }
  return grid;
}

/** Triangulates a skin grid into mesh, positions relative to origin, faces towards the skin normal (outwards). */
function addSkinSurface(mesh, grid, origin, { flip = false, inset = 0, textured = true } = {}) {
  const base = mesh.vertices.length;
  const nz = grid[0].length;
  for (const row of grid) {
    for (const s of row) {
      const normal = flip ? scale(s.normal, -1) : s.normal;
      const position = sub(add(s.position, scale(s.normal, -inset)), origin);
      mesh.vertex(position, normal, textured ? { tangent: s.tangent, uv0: s.uv0, uv1: s.uv1 } : {});
    }
  }
  for (let i = 0; i < grid.length - 1; i++) {
    for (let j = 0; j < nz - 1; j++) {
      const a = base + i * nz + j;
      const b = base + (i + 1) * nz + j;
      const c = base + (i + 1) * nz + j + 1;
      const d = base + i * nz + j + 1;
      // orient each triangle along the skin normal (or against it for the inner face)
      const pa = mesh.vertices[a].position;
      const n = cross(sub(mesh.vertices[b].position, pa), sub(mesh.vertices[c].position, pa));
      const wanted = flip ? scale(grid[i][j].normal, -1) : grid[i][j].normal;
      if (dot(n, wanted) >= 0) {
        mesh.triangle(a, b, c);
        mesh.triangle(a, c, d);
      } else {
        mesh.triangle(a, c, b);
        mesh.triangle(a, d, c);
      }
    }
  }
}

/**
 * One slot door, hinged along its outer edge (x = hingeX) and closing to the slot centre line.
 * Returns the outer face (fuselage material and texture coordinates: the closed door shows the skin) and the inner
 * face with the edges (primer), both in the frame of the door node, and that node's translation.
 */
function buildDoor(skin, name, hingeX, freeX) {
  const zMid = (SLOT_AFT_Z + SLOT_FORWARD_Z) / 2;
  const hingeSample = skin.sample(hingeX, zMid);
  const origin = [hingeX, hingeSample.y - DOOR_OFFSET, zMid];
  const grid = skinGrid(skin, hingeX, freeX, SLOT_AFT_Z, SLOT_FORWARD_Z, 2, 11, DOOR_OFFSET);

  const outer = new MeshBuilder(name, FUSELAGE_MATERIAL);
  addSkinSurface(outer, grid, origin);

  const inner = new MeshBuilder(`${name}_INNER`, 'A32NX_RAT_DOOR_INNER');
  addSkinSurface(inner, grid, origin, { flip: true, inset: DOOR_THICKNESS, textured: false });
  // the four edges, between the outer and the inner face
  const rel = (s, inset) => sub(add(s.position, scale(s.normal, -inset)), origin);
  const centre = sub(add(grid[1][Math.floor(grid[1].length / 2)].position, [0, DOOR_THICKNESS / 2, 0]), origin);
  const edgeLines = [grid[0], grid[grid.length - 1], grid.map((row) => row[0]), grid.map((row) => row[row.length - 1])];
  for (const line of edgeLines) {
    for (let k = 0; k < line.length - 1; k++) {
      const quad = [
        rel(line[k], 0),
        rel(line[k + 1], 0),
        rel(line[k + 1], DOOR_THICKNESS),
        rel(line[k], DOOR_THICKNESS),
      ];
      const middle = scale(quad.reduce(add, [0, 0, 0]), 0.25);
      inner.face(quad, sub(middle, centre));
    }
  }
  return { outer, inner, origin };
}

/** Dark cavity over the whole slot, seen through the open doors. */
function buildCavity(skin) {
  const zMid = (SLOT_AFT_Z + SLOT_FORWARD_Z) / 2;
  const xMid = (SLOT_INBOARD_X + SLOT_OUTBOARD_X) / 2;
  const origin = [xMid, skin.sample(xMid, zMid).y - CAVITY_OFFSET, zMid];
  const grid = skinGrid(skin, SLOT_INBOARD_X, SLOT_OUTBOARD_X, SLOT_AFT_Z, SLOT_FORWARD_Z, 2, 11, CAVITY_OFFSET);
  const mesh = new MeshBuilder('RAT_CAVITY', 'A32NX_RAT_CAVITY');
  addSkinSurface(mesh, grid, origin, { textured: false });
  return { mesh, origin };
}

// ---------------------------------------------------------------------------------------------------------------------
// Animations
// ---------------------------------------------------------------------------------------------------------------------

/** Value of a piecewise linear function through [[x, y], ...] (x ascending), clamped at the ends. */
function piecewise(points, x) {
  if (x <= points[0][0]) {
    return points[0][1];
  }
  for (let i = 1; i < points.length; i++) {
    if (x <= points[i][0]) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return points[points.length - 1][1];
}

/** Strut swing angle (degrees about +X) at a RAT stow position 0..1. 0 = hanging down (deployed). */
function strutAngleDeg(position) {
  return piecewise(
    [
      [0, STRUT_STOWED_ANGLE_DEG],
      [STRUT_START_POSITION, STRUT_STOWED_ANGLE_DEG],
      [1, 0],
    ],
    position,
  );
}

/** Door opening angle (degrees, positive = open) at a RAT stow position 0..1. */
function doorAngleDeg(position) {
  return piecewise(
    [
      [0, 0],
      [DOOR_FULLY_OPEN_POSITION, DOOR_OPEN_ANGLE_DEG],
    ],
    position,
  );
}

/** Blade pitch (degrees from the disc plane) at a propeller angle 0..1 (A32NX_RAT_PROPELLER_ANGLE). */
function bladePitchDeg(propellerAngle) {
  return BLADE_PITCH_AT_ANGLE_0_DEG + (BLADE_PITCH_AT_ANGLE_1_DEG - BLADE_PITCH_AT_ANGLE_0_DEG) * propellerAngle;
}

const keyValues = () => Array.from({ length: KEY_COUNT }, (_, k) => k / (KEY_COUNT - 1));

// ---------------------------------------------------------------------------------------------------------------------
// Assembly and glTF writing
// ---------------------------------------------------------------------------------------------------------------------

/** The RAT as nodes (with meshes) and animations, before packing. */
function buildRat(skin) {
  const xMid = (SLOT_INBOARD_X + SLOT_OUTBOARD_X) / 2;
  const hinge = [xMid, skin.sample(xMid, HINGE_Z).y + HINGE_ABOVE_SKIN, HINGE_Z];
  const stowedStrut = quatFromAxisAngle([1, 0, 0], STRUT_STOWED_ANGLE_DEG);
  const zAxis = [0, 0, 1];
  const inboardDoorRotation = (angle) => quatFromAxisAngle(zAxis, -angle);
  const outboardDoorRotation = (angle) => quatFromAxisAngle(zAxis, angle);
  const blade2Base = quatFromAxisAngle(zAxis, 180);
  const bladeRotation = (base, pitch) => quatMultiply(base, quatFromAxisAngle([0, 1, 0], pitch));

  const inboardDoor = buildDoor(skin, 'RAT_DOOR_INBOARD', SLOT_INBOARD_X, xMid - DOOR_GAP / 2);
  const outboardDoor = buildDoor(skin, 'RAT_DOOR_OUTBOARD', SLOT_OUTBOARD_X, xMid + DOOR_GAP / 2);
  const cavity = buildCavity(skin);

  // node: { name, mesh, translation?, rotation?, children?: [names] }; the default pose is the stowed one
  const nodes = [
    { name: 'RAT_CAVITY', mesh: cavity.mesh, translation: cavity.origin },
    {
      name: 'RAT_DOOR_INBOARD',
      mesh: inboardDoor.outer,
      translation: inboardDoor.origin,
      rotation: inboardDoorRotation(0),
      children: ['RAT_DOOR_INBOARD_INNER'],
    },
    { name: 'RAT_DOOR_INBOARD_INNER', mesh: inboardDoor.inner },
    {
      name: 'RAT_DOOR_OUTBOARD',
      mesh: outboardDoor.outer,
      translation: outboardDoor.origin,
      rotation: outboardDoorRotation(0),
      children: ['RAT_DOOR_OUTBOARD_INNER'],
    },
    { name: 'RAT_DOOR_OUTBOARD_INNER', mesh: outboardDoor.inner },
    {
      name: 'RAT_STRUT',
      mesh: buildStrut(),
      translation: hinge,
      rotation: stowedStrut,
      children: ['RAT_HUB', 'RAT_BLUR'],
    },
    {
      name: 'RAT_HUB',
      mesh: buildHub(),
      translation: [0, -STRUT_LENGTH, PROPELLER_FORWARD],
      children: ['RAT_BLADE_1', 'RAT_BLADE_2'],
    },
    { name: 'RAT_BLADE_1', mesh: buildBlade('RAT_BLADE_1'), rotation: bladeRotation([0, 0, 0, 1], bladePitchDeg(0)) },
    { name: 'RAT_BLADE_2', mesh: buildBlade('RAT_BLADE_2'), rotation: bladeRotation(blade2Base, bladePitchDeg(0)) },
    { name: 'RAT_BLUR', mesh: buildBlur(), translation: [0, -STRUT_LENGTH, PROPELLER_FORWARD] },
  ];

  const keys = keyValues();
  const animations = [
    {
      // ANIM_CODE (L:A32NX_RAT_STOW_POSITION) 100 *
      name: 'A32NX_HYD_RAT_STOW_POSITION',
      channels: [
        { node: 'RAT_STRUT', values: keys.map((p) => quatFromAxisAngle([1, 0, 0], strutAngleDeg(p))) },
        { node: 'RAT_DOOR_INBOARD', values: keys.map((p) => inboardDoorRotation(doorAngleDeg(p))) },
        { node: 'RAT_DOOR_OUTBOARD', values: keys.map((p) => outboardDoorRotation(doorAngleDeg(p))) },
      ],
    },
    {
      // ANIM_CODE (L:A32NX_RAT_ANGULAR_POSITION) 100 * 360 /: one turn about +Z over the whole animation
      name: 'A32NX_HYD_RAT_RPM',
      channels: [{ node: 'RAT_HUB', values: keys.map((f) => quatFromAxisAngle(zAxis, 360 * f)) }],
    },
    {
      // ANIM_CODE (L:A32NX_RAT_PROPELLER_ANGLE) 100 *
      name: 'A32NX_HYD_RAT_PROPELLER_ANGLE',
      channels: [
        { node: 'RAT_BLADE_1', values: keys.map((a) => bladeRotation([0, 0, 0, 1], bladePitchDeg(a))) },
        { node: 'RAT_BLADE_2', values: keys.map((a) => bladeRotation(blade2Base, bladePitchDeg(a))) },
      ],
    },
  ];
  return { nodes, animations };
}

/** Growable little-endian byte buffer. */
class ByteWriter {
  constructor() {
    this.buffer = Buffer.alloc(1 << 16);
    this.length = 0;
  }

  reserve(bytes) {
    if (this.length + bytes > this.buffer.length) {
      const bigger = Buffer.alloc(Math.max(this.buffer.length * 2, this.length + bytes));
      this.buffer.copy(bigger, 0, 0, this.length);
      this.buffer = bigger;
    }
  }

  align(alignment) {
    const padding = (alignment - (this.length % alignment)) % alignment;
    this.reserve(padding);
    this.length += padding;
  }

  float(v) {
    this.reserve(4);
    this.buffer.writeFloatLE(v, this.length);
    this.length += 4;
  }

  int8(v) {
    this.reserve(1);
    this.buffer.writeInt8(v, this.length);
    this.length += 1;
  }

  uint16(v) {
    this.reserve(2);
    this.buffer.writeUInt16LE(v, this.length);
    this.length += 2;
  }

  bytes() {
    return this.buffer.subarray(0, this.length);
  }
}

const VERTEX_STRIDE = 36;
const toSnorm8 = (v) => Math.max(-127, Math.min(127, Math.round(v * 127)));
const HALF_ONE = toHalf(1);

/** Packs the RAT into a glTF JSON object and its binary buffer. */
function packGltf({ nodes, animations }) {
  const indexData = new ByteWriter();
  const vertexData = new ByteWriter();
  const accessors = [];
  const meshes = [];
  const materials = MATERIALS.map((m) => {
    const material = {
      name: m.name,
      pbrMetallicRoughness: { baseColorFactor: m.color, metallicFactor: m.metallic, roughnessFactor: m.roughness },
    };
    if (m.blend) {
      material.alphaMode = 'BLEND';
      material.doubleSided = true;
    }
    return material;
  });

  // meshes: one primitive each, own accessors in the shared vertex (view 1) and index (view 0) views
  for (const node of nodes) {
    const mesh = node.mesh;
    const vertexStart = vertexData.length;
    for (const v of mesh.vertices) {
      v.position.forEach((c) => vertexData.float(c));
      v.tangent.slice(0, 3).forEach((c) => vertexData.int8(toSnorm8(c)));
      vertexData.int8(v.tangent[3] < 0 ? -127 : 127);
      v.normal.forEach((c) => vertexData.int8(toSnorm8(c)));
      vertexData.int8(127);
      v.uv0.forEach((c) => vertexData.uint16(toHalf(c)));
      v.uv1.forEach((c) => vertexData.uint16(toHalf(c)));
      for (let i = 0; i < 4; i++) {
        vertexData.uint16(HALF_ONE);
      }
    }
    const indexStart = indexData.length;
    mesh.indices.forEach((i) => indexData.uint16(i));
    indexData.align(4);

    const count = mesh.vertices.length;
    const { min, max } = mesh.bounds();
    const first = accessors.length;
    const attribute = (suffix, byteOffset, componentType, type, extra = {}) => ({
      bufferView: 1,
      byteOffset: vertexStart + byteOffset,
      componentType,
      count,
      type,
      ...extra,
      name: `${mesh.name}_vertices#0_${suffix}`,
    });
    accessors.push(
      attribute('POSITION', 0, 5126, 'VEC3', { min, max }),
      attribute('TANGENT', 12, 5120, 'VEC4'),
      attribute('NORMAL', 16, 5120, 'VEC4'),
      attribute('TEXCOORD_0', 20, 5122, 'VEC2'),
      attribute('TEXCOORD_1', 24, 5122, 'VEC2'),
      attribute('COLOR_0', 28, 5123, 'VEC4'),
      {
        bufferView: 0,
        byteOffset: indexStart,
        componentType: 5123,
        count: mesh.indices.length,
        type: 'SCALAR',
        name: `${mesh.name}_indices#0`,
      },
    );
    const materialIndex = MATERIALS.findIndex((m) => m.name === mesh.material);
    meshes.push({
      name: mesh.name,
      primitives: [
        {
          attributes: {
            POSITION: first,
            TANGENT: first + 1,
            NORMAL: first + 2,
            TEXCOORD_0: first + 3,
            TEXCOORD_1: first + 4,
            COLOR_0: first + 5,
          },
          indices: first + 6,
          // an existing exterior material is referenced by name (build.js combineGltf resolves it)
          material: materialIndex >= 0 ? materialIndex : mesh.material,
          mode: 4,
          extras: { ASOBO_primitive: { PrimitiveCount: mesh.indices.length / 3, VertexType: 'VTX', VertexVersion: 2 } },
        },
      ],
    });
  }

  // animations: one shared time accessor, one VEC4 rotation accessor per channel, EACH IN ITS OWN bufferView (views 2,
  // 3, ...). Every model the sim loads keeps one kind of accessor per unstrided view (the stock and community models:
  // one view per animation accessor, like the cargo hinge of the exterior); one view holding the SCALAR keys and the
  // VEC4 rotations together was found in no model the sim loads, and the exterior that had it stayed invisible.
  const animationViews = [];
  /** Adds one float accessor of the animation data in a new bufferView, returns its index. */
  const addAnimationAccessor = (floats, accessor) => {
    const data = new ByteWriter();
    floats.forEach((f) => data.float(f));
    animationViews.push(data);
    accessors.push({ bufferView: 2 + animationViews.length - 1, byteOffset: 0, componentType: 5126, ...accessor });
    return accessors.length - 1;
  };
  const times = keyValues().map((_, k) => Math.fround(k / FRAMES_PER_SECOND));
  const timeAccessor = addAnimationAccessor(times, {
    count: times.length,
    type: 'SCALAR',
    min: [times[0]],
    max: [times[times.length - 1]],
    name: 'A32NX_RAT_keys',
  });
  const nodeIndex = (name) => nodes.findIndex((n) => n.name === name);
  const gltfAnimations = animations.map((animation) => ({
    name: animation.name,
    channels: animation.channels.map((channel, i) => ({
      sampler: i,
      target: { node: nodeIndex(channel.node), path: 'rotation' },
    })),
    samplers: animation.channels.map((channel) => {
      const output = addAnimationAccessor(channel.values.flat(), {
        count: channel.values.length,
        type: 'VEC4',
        name: `${animation.name}_${channel.node}_rotation`,
      });
      return { input: timeAccessor, output, interpolation: 'LINEAR' };
    }),
  }));

  // binary layout: index view, vertex view, one view per animation accessor, each 4-byte aligned
  const bin = new ByteWriter();
  const bufferViews = [];
  const appendView = (data, extra) => {
    bin.align(4);
    const byteOffset = bin.length;
    const bytes = data.bytes();
    bin.reserve(bytes.length);
    bytes.copy(bin.buffer, bin.length);
    bin.length += bytes.length;
    bufferViews.push({ buffer: 0, byteLength: bytes.length, byteOffset, ...extra });
  };
  appendView(indexData, { target: 34963, name: 'BufferViewIndex' });
  appendView(vertexData, { byteStride: VERTEX_STRIDE, target: 34962, name: 'BufferViewVertexND' });
  animationViews.forEach((data) => appendView(data, {}));
  bin.align(4);

  const gltfNodes = nodes.map((node, i) => {
    const out = { name: node.name, mesh: i };
    if (node.translation) {
      out.translation = node.translation.map((c) => Math.fround(c));
    }
    if (node.rotation) {
      out.rotation = node.rotation;
    }
    if (node.children) {
      out.children = node.children.map(nodeIndex);
    }
    return out;
  });
  const childIndices = new Set(gltfNodes.flatMap((n) => n.children || []));
  const roots = gltfNodes.map((_, i) => i).filter((i) => !childIndices.has(i));

  const gltf = {
    asset: {
      generator: 'FlyByWire generate-rat.js',
      version: '2.0',
      extensions: { ASOBO_normal_map_convention: { tangent_space_convention: 'DirectX' } },
    },
    extensionsUsed: ['ASOBO_normal_map_convention'],
    scene: 0,
    scenes: [{ nodes: roots }],
    nodes: gltfNodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    animations: gltfAnimations,
    buffers: [{ byteLength: bin.length, uri: OUTPUT_BIN_NAME }],
  };
  return { gltf, bin: Buffer.from(bin.bytes()) };
}

/** Builds the RAT and returns the glTF text and the binary buffer exactly as they are written to disk. */
function generate(fuselagePath = FUSELAGE_SOURCE) {
  const { gltf, bin } = packGltf(buildRat(new FuselageSkin(fuselagePath)));
  return { gltfText: JSON.stringify(gltf), bin };
}

if (require.main === module) {
  const { gltfText, bin } = generate();
  fs.writeFileSync(OUTPUT_GLTF, gltfText);
  fs.writeFileSync(path.join(path.dirname(OUTPUT_GLTF), OUTPUT_BIN_NAME), bin);
  console.log(`Wrote ${OUTPUT_GLTF} and ${OUTPUT_BIN_NAME} (${bin.length} bytes)`);
}

module.exports = {
  FuselageSkin,
  bladePitchDeg,
  buildRat,
  doorAngleDeg,
  fromHalf,
  generate,
  quatFromAxisAngle,
  quatMultiply,
  quatRotate,
  strutAngleDeg,
  toHalf,
  constants: {
    HINGE_ABOVE_SKIN,
    HINGE_Z,
    PROPELLER_FORWARD,
    PROPELLER_RADIUS,
    SLOT_AFT_Z,
    SLOT_FORWARD_Z,
    SLOT_INBOARD_X,
    SLOT_OUTBOARD_X,
    STRUT_LENGTH,
    STRUT_STOWED_ANGLE_DEG,
    DOOR_OFFSET,
    CAVITY_OFFSET,
  },
};
