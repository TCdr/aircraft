// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// The engine and APU fire visual effects: the ASOBO_GT_FX components ENGINE_FIRE_FX / APU_FIRE_FX of the exterior model
// behaviour (model/A320_NEO.xml), with their FX_CODE evaluated by a small RPN interpreter for the operators they use,
// and the [EFFECTS] section of aircraft.cfg around them. Kept next to the other model code specs, outside src/ because
// build.js copies every file of src/.

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it, vi } from 'vitest';

// Several tests build or read every exterior model LOD (glTF files of several MB): more than vitest's 5 s default on a
// busy machine (5.8 s seen in a deploy check), so the file gets a longer limit
vi.setConfig({ testTimeout: 60_000 });

const AIRCRAFT_DIR = join(
  __dirname,
  '..',
  'base',
  'flybywire-aircraft-a320-neo',
  'SimObjects',
  'AirPlanes',
  'FlyByWire_A320_NEO',
);
const AIRCRAFT_CFG = join(AIRCRAFT_DIR, 'aircraft.cfg');
const EXTERIOR_BEHAVIOR_XML = join(AIRCRAFT_DIR, 'model', 'A320_NEO.xml');
/** The exterior model LODs listed in A320_NEO.xml, from the model sources */
const MODEL_DIR = join(__dirname, '..', 'model');
const EXTERIOR_LODS = [0, 1, 2, 3, 4, 5, 6];

/** The node names of a glTF file of the model sources */
function gltfNodeNames(gltf: string): string[] {
  return (JSON.parse(readFileSync(join(MODEL_DIR, gltf), 'utf8')).nodes as { name?: string }[]).map(
    (node) => node.name ?? '',
  );
}

/**
 * The node names of a built exterior model LOD (A320_NEO_LOD0n.gltf of the package): the a320-exterior source LOD plus
 * the nodes the model build adds to it, from fuse/A320_NEO_LOD00.gltf for LOD00 (modelsv2.json append_nodes) and from
 * the additions of the exterior entry of models.json for the LODs they list (FX_EXHAUST_APU for LOD01-06, the
 * full-scale FX_ENGINE_FIRE_LEFT/RIGHT markers of fx_engine_fire.gltf for all).
 */
function builtExteriorLodNodeNames(lod: number): Set<string> {
  const names = new Set(gltfNodeNames(`./a320-exterior/A320_NEO_LOD0${lod}.gltf`));
  if (lod === 0) {
    const modelsV2 = JSON.parse(readFileSync(join(MODEL_DIR, 'modelsv2.json'), 'utf8')) as {
      operations: { type: string; nodes?: string[] }[];
    }[];
    for (const operation of modelsV2[0].operations) {
      if (operation.type === 'append_nodes') {
        operation.nodes?.forEach((node) => names.add(node));
      }
    }
  }
  {
    // the additions of models.json apply to every LOD listed in their "lods" (all when absent), LOD00 included
    const models = JSON.parse(readFileSync(join(MODEL_DIR, 'models.json'), 'utf8')) as {
      gltf: string[];
      additions?: { gltf: string; lods?: number[] }[];
    }[];
    const exterior = models.find((entry) => entry.gltf.includes('./a320-exterior/A320_NEO_LOD01.gltf'));
    for (const addition of exterior?.additions ?? []) {
      if (!addition.lods || addition.lods.includes(lod)) {
        gltfNodeNames(addition.gltf).forEach((node) => names.add(node));
      }
    }
  }
  return names;
}

/** The material names of a glTF file of the model sources */
function gltfMaterialNames(gltf: string): string[] {
  return ((JSON.parse(readFileSync(join(MODEL_DIR, gltf), 'utf8')).materials ?? []) as { name?: string }[]).map(
    (material) => material.name ?? '',
  );
}

/**
 * The files that bring each material name into a built exterior model LOD: the a320-exterior source LOD (with the
 * modelsv2.json files of LOD00, whose materials buildv2.js copies by name), then each models.json addition of the LOD,
 * which build.js combineGltf appends without merging names.
 */
function builtExteriorLodMaterialOwners(lod: number): Map<string, string[]> {
  const owners = new Map<string, string[]>();
  const add = (name: string, file: string) => owners.set(name, [...(owners.get(name) ?? []), file]);
  const baseFiles = [`./a320-exterior/A320_NEO_LOD0${lod}.gltf`];
  if (lod === 0) {
    const modelsV2 = JSON.parse(readFileSync(join(MODEL_DIR, 'modelsv2.json'), 'utf8')) as {
      operations: { file?: string }[];
    }[];
    modelsV2[0].operations.forEach((operation) => operation.file && baseFiles.push(operation.file));
  }
  new Set(baseFiles.flatMap(gltfMaterialNames)).forEach((name) => add(name, 'base'));
  const models = JSON.parse(readFileSync(join(MODEL_DIR, 'models.json'), 'utf8')) as {
    gltf: string[];
    additions?: { gltf?: string; lods?: number[] }[];
  }[];
  const exterior = models.find((entry) => entry.gltf.includes('./a320-exterior/A320_NEO_LOD01.gltf'));
  for (const addition of exterior?.additions ?? []) {
    if (addition.gltf && (!addition.lods || addition.lods.includes(lod))) {
      gltfMaterialNames(addition.gltf).forEach((name) => add(name, addition.gltf as string));
    }
  }
  return owners;
}

/** The flyPad Settings > Sim Options "Situation Visual Effects" switch, written by the flyPad (EFB Settings/sync.ts) */
const SITUATION_FX_SWITCH = 'L:A32NX_CONFIG_SITUATION_FX';

/**
 * Stock MSFS 2024 visual effect graphs (package fs-base-effects, VisualEffectLibs/Asobo/Base). Each GUID is the one
 * stored in the .spb file (16 bytes, little-endian GUID layout, after the field tag 8), the same place where the GUIDs
 * of the SDK templates are found (Contrails_QUAD.spb = ASOBO_CONTRAIL_QUAD_FX {F42CE638-...}, FX_Heat_Engine_Jet.spb =
 * ASOBO_ET_FX_HEAT_ENGINE_JET {B0A8FEDA-...}).
 */
const FX_FIRE_1_SMALL = '{75A93861-D48A-456B-BCA5-7C3AFF31C0F6}';
/** FX_Smoke_Fire.spb: the smoke with the engine flames and at the APU (EngineSmoke spread as a general haze, sim 2026-10-09) */
const FX_SMOKE_FIRE = '{15B35478-6321-4480-8642-EB44248318E2}';

/** One ASOBO_GT_FX component of the exterior model behaviour */
interface FxComponent {
  id: string;
  node: string;
  guid: string;
  code: string;
  offsets: string[];
}

/** The ASOBO_GT_FX components with their own FX_GUID and FX_CODE (the fire ones are written that way) */
function fxComponents(): FxComponent[] {
  const xml = readFileSync(EXTERIOR_BEHAVIOR_XML, 'utf8');
  const components: FxComponent[] = [];
  const componentRegex =
    /<Component ID="([^"]+)" Node="([^"]+)">\s*<UseTemplate Name="ASOBO_GT_FX">([\s\S]*?)<\/UseTemplate>\s*<\/Component>/g;
  for (const match of xml.matchAll(componentRegex)) {
    const body = match[3];
    const guid = /<FX_GUID>([^<]*)<\/FX_GUID>/.exec(body);
    const code = /<FX_CODE>([^<]*)<\/FX_CODE>/.exec(body);
    if (guid && code) {
      components.push({
        id: match[1],
        node: match[2],
        guid: guid[1].trim().toUpperCase(),
        code: code[1].replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').trim(),
        offsets: [...body.matchAll(/<FX_OFFSET_[XYZ]>([^<]*)<\/FX_OFFSET_[XYZ]>/g)].map((offset) => offset[1].trim()),
      });
    }
  }
  return components;
}

/** The [EFFECTS] section of aircraft.cfg, comments stripped, one entry per line */
function effectsSectionLines(): string[] {
  const cfg = readFileSync(AIRCRAFT_CFG, 'utf8');
  const section = /^\[EFFECTS\]\s*$([\s\S]*?)(?=^\[)/m.exec(cfg);
  if (!section) {
    throw new Error('[EFFECTS] section not found in aircraft.cfg');
  }
  return section[1]
    .split(/\r?\n/)
    .map((line) => line.replace(/;.*$/, '').trim())
    .filter((line) => line.length > 0);
}

/** The "effect.N = NODE#CODE#EFFECT" lines of the [EFFECTS] section, in file order */
function cfgConditionalEffects(): { index: number; node: string; code: string; effect: string }[] {
  const effects: { index: number; node: string; code: string; effect: string }[] = [];
  for (const line of effectsSectionLines()) {
    const match = /^effect\.(\d+)\s*=\s*([^#]+)#([^#]+)#(.+)$/i.exec(line);
    if (match) {
      effects.push({ index: Number(match[1]), node: match[2].trim(), code: match[3].trim(), effect: match[4].trim() });
    }
  }
  return effects;
}

/** The value of a "key = value" line of the [EFFECTS] section, e.g. EngineFire */
function namedEffect(key: string): string | undefined {
  for (const line of effectsSectionLines()) {
    const match = /^([^=]+)=(.*)$/.exec(line);
    if (match && match[1].trim().toLowerCase() === key.toLowerCase()) {
      return match[2].trim();
    }
  }
  return undefined;
}

/** Evaluates the RPN subset of the codes: (L:NAME, unit) and (A:NAME, unit) reads, numbers, >, >=, and, or, ! */
function evaluate(code: string, variables: Record<string, number>): boolean {
  const tokens = code.match(/\([LA]:[^)]*\)|\S+/g) ?? [];
  const stack: number[] = [];
  const pop = (): number => {
    const value = stack.pop();
    if (value === undefined) {
      throw new Error(`RPN stack underflow in: ${code}`);
    }
    return value;
  };
  for (const token of tokens) {
    const variable = /^\(([LA]:[^,)]+)/.exec(token);
    if (variable) {
      stack.push(variables[variable[1].trim()] ?? 0);
    } else if (token === '>') {
      const b = pop();
      const a = pop();
      stack.push(a > b ? 1 : 0);
    } else if (token === '>=') {
      const b = pop();
      const a = pop();
      stack.push(a >= b ? 1 : 0);
    } else if (token === 'and') {
      const b = pop();
      const a = pop();
      stack.push(a && b ? 1 : 0);
    } else if (token === 'or') {
      const b = pop();
      const a = pop();
      stack.push(a || b ? 1 : 0);
    } else if (token === '!') {
      stack.push(pop() ? 0 : 1);
    } else if (/^-?\d+(\.\d+)?$/.test(token)) {
      stack.push(Number(token));
    } else {
      throw new Error(`Unsupported RPN token ${token}`);
    }
  }
  if (stack.length !== 1) {
    throw new Error(`RPN stack holds ${stack.length} values after: ${code}`);
  }
  return stack[0] !== 0;
}

/** The fire and smoke components (ENGINE_FIRE_FX, APU_FIRE_FX) */
function fireComponents(): FxComponent[] {
  return fxComponents().filter(
    (fx) => /^(ENGINE|APU)_FIRE_/.test(fx.id) && [FX_FIRE_1_SMALL, FX_SMOKE_FIRE].includes(fx.guid),
  );
}

/** The engine damage smoke components (ENGINE_DAMAGE_FX), the replacement of the sim-driven EngineDamage effect */
function damageComponents(): FxComponent[] {
  return fxComponents().filter((fx) => fx.id.startsWith('ENGINE_DAMAGE_'));
}

/** The engine oil leak smoke components (ENGINE_OIL_LEAK_FX), the replacement of the sim-driven EngineOilLeak effect */
function oilLeakComponents(): FxComponent[] {
  return fxComponents().filter((fx) => fx.id.startsWith('ENGINE_OIL_LEAK_'));
}

/** The GUIDs of the given effects shown on a node with the given variables (flyPad switch on unless given) */
function shownOn(components: FxComponent[], node: string, variables: Record<string, number>): string[] {
  const withSwitch = { [SITUATION_FX_SWITCH]: 1, ...variables };
  return components.filter((fx) => fx.node === node && evaluate(fx.code, withSwitch)).map((fx) => fx.guid);
}

/** The GUIDs of the fire effects shown on a node with the given variables (flyPad switch on unless given) */
function effectsShownOn(node: string, variables: Record<string, number>): string[] {
  return shownOn(fireComponents(), node, variables);
}

/** The GUIDs of the engine damage effects shown on a node with the given variables (flyPad switch on unless given) */
function damageEffectsShownOn(node: string, variables: Record<string, number>): string[] {
  return shownOn(damageComponents(), node, variables);
}

/** The GUIDs of the oil leak effects shown on a node with the given variables (flyPad switch on unless given) */
function oilLeakEffectsShownOn(node: string, variables: Record<string, number>): string[] {
  return shownOn(oilLeakComponents(), node, variables);
}

/**
 * An oil leak of one engine while the oil flows out (fadec_common EngineOilFailures.hpp leakedQuantity): the flyPad
 * failure, the core turning the oil pump (N2 at 10 % or more) and oil left in the oil system (quarts)
 */
function oilLeaking(engine: number, n2 = 60, oilTotal = 15): Record<string, number> {
  return {
    [`L:A32NX_ENGINE_${engine}_OIL_LEAK`]: 1,
    [`L:A32NX_ENGINE_N2:${engine}`]: n2,
    [`L:A32NX_ENGINE_OIL_TOTAL:${engine}`]: oilTotal,
  };
}

/**
 * The engine fire nodes: full-scale markers (fx_engine_fire.gltf) at the world position of fx_exhaust_left/right. The
 * exhaust nodes themselves are scaled 0.5 by models.json (heat haze, contrails), which drew the fire at half size.
 */
const ENGINE_EXHAUST_NODES = { 1: 'FX_ENGINE_FIRE_LEFT', 2: 'FX_ENGINE_FIRE_RIGHT' } as const;
const APU_EXHAUST_NODE = 'FX_EXHAUST_APU';
const ALL_FIRE_NODES = [...Object.values(ENGINE_EXHAUST_NODES), APU_EXHAUST_NODE];

/** Variables of a running engine without fire */
const ENGINES_RUNNING = { 'A:GENERAL ENG COMBUSTION:1': 1, 'A:GENERAL ENG COMBUSTION:2': 1 };

describe('A32NX engine and APU fire effects (exterior model ASOBO_GT_FX components)', () => {
  it('has one flame and one fire smoke effect per engine exhaust and one smoke effect at the APU exhaust, with no offset', () => {
    const fireEffects = fireComponents();
    expect(fireEffects.map((fx) => [fx.node, fx.guid])).toEqual([
      [ENGINE_EXHAUST_NODES[1], FX_FIRE_1_SMALL],
      [ENGINE_EXHAUST_NODES[1], FX_SMOKE_FIRE],
      [ENGINE_EXHAUST_NODES[2], FX_FIRE_1_SMALL],
      [ENGINE_EXHAUST_NODES[2], FX_SMOKE_FIRE],
      [APU_EXHAUST_NODE, FX_SMOKE_FIRE],
    ]);
    for (const fx of fireEffects) {
      expect(fx.offsets.every((offset) => Number(offset) === 0)).toBe(true);
    }
  });

  it('hangs the effects on nodes that exist in every exterior model LOD', () => {
    for (const lod of EXTERIOR_LODS) {
      const nodeNames = builtExteriorLodNodeNames(lod);
      for (const node of ALL_FIRE_NODES) {
        expect(nodeNames.has(node), `${node} in LOD0${lod}`).toBe(true);
      }
    }
  });

  it('adds the effect nodes with materials whose names no other part of the exterior model LOD uses', () => {
    // fx_engine_fire.gltf first reused the FX_EXHAUST_APU_INVISIBLE name of fx_exhaust_apu.gltf: two materials of one
    // name in LOD01-06, which none of the 5916 optimized models of the installed packages has (sim 2026-10-09: the
    // exterior with it stayed invisible)
    for (const lod of EXTERIOR_LODS) {
      const owners = builtExteriorLodMaterialOwners(lod);
      for (const [name, files] of owners) {
        expect(files, `material ${name} in LOD0${lod}`).toHaveLength(1);
      }
    }
  });

  it('shows no fire effect without a fire', () => {
    for (const node of ALL_FIRE_NODES) {
      expect(effectsShownOn(node, ENGINES_RUNNING)).toEqual([]);
    }
  });

  it('shows the flames at the exhaust of the engine on fire only (flyPad fire failure)', () => {
    for (const engine of [1, 2] as const) {
      const other = engine === 1 ? 2 : 1;
      const variables = { ...ENGINES_RUNNING, [`L:A32NX_ENG_${engine}_ON_FIRE`]: 1 };
      expect(effectsShownOn(ENGINE_EXHAUST_NODES[engine], variables)).toEqual([FX_FIRE_1_SMALL, FX_SMOKE_FIRE]);
      expect(effectsShownOn(ENGINE_EXHAUST_NODES[other], variables)).toEqual([]);
      expect(effectsShownOn(APU_EXHAUST_NODE, variables)).toEqual([]);
    }
  });

  it('reads the one "zone burning" L:var and the flyPad switch only, no sim variable', () => {
    const expected: Record<string, string> = {
      [ENGINE_EXHAUST_NODES[1]]: 'L:A32NX_ENG_1_ON_FIRE',
      [ENGINE_EXHAUST_NODES[2]]: 'L:A32NX_ENG_2_ON_FIRE',
      [APU_EXHAUST_NODE]: 'L:A32NX_APU_ON_FIRE',
    };
    for (const fx of fireComponents()) {
      expect(fx.code, fx.id).toBe(`(${expected[fx.node]}, bool) (${SITUATION_FX_SWITCH}, bool) and`);
    }
  });

  it('stops when the fire is out although the sim fire variables stay on (agent discharge, sim fire stuck)', () => {
    // systems.wasm sets L:A32NX_ENG_n_ON_FIRE from the sim fire of the MSFS failures menu too, and clears it when an
    // AGENT discharge puts the fire out, while ENG ON FIRE:n / APU ON FIRE DETECTED stay on
    const fireOutSimVariablesOn = {
      ...ENGINES_RUNNING,
      'A:ENG ON FIRE:1': 1,
      'A:ENG ON FIRE:2': 1,
      'A:APU ON FIRE DETECTED': 1,
    };
    for (const node of ALL_FIRE_NODES) {
      expect(effectsShownOn(node, fireOutSimVariablesOn)).toEqual([]);
    }
  });

  it('stops when the fire failure is removed (L:A32NX_ENG_n_ON_FIRE back to 0)', () => {
    expect(effectsShownOn(ENGINE_EXHAUST_NODES[1], { 'L:A32NX_ENG_1_ON_FIRE': 1 })).toEqual([
      FX_FIRE_1_SMALL,
      FX_SMOKE_FIRE,
    ]);
    expect(effectsShownOn(ENGINE_EXHAUST_NODES[1], { 'L:A32NX_ENG_1_ON_FIRE': 0, 'A:ENG ON FIRE:1': 1 })).toEqual([]);
    expect(effectsShownOn(APU_EXHAUST_NODE, { 'L:A32NX_APU_ON_FIRE': 0, 'A:APU ON FIRE DETECTED': 1 })).toEqual([]);
  });

  it('keeps the flames on after the engine shutdown, until the fire is out', () => {
    expect(effectsShownOn(ENGINE_EXHAUST_NODES[1], { 'L:A32NX_ENG_1_ON_FIRE': 1 })).toEqual([
      FX_FIRE_1_SMALL,
      FX_SMOKE_FIRE,
    ]);
  });

  it('shows nothing during the FIRE TEST or with a detection fault (warnings only, no fire)', () => {
    const variables = {
      ...ENGINES_RUNNING,
      'L:A32NX_FIRE_TEST_ENG1': 1,
      'L:A32NX_FIRE_TEST_ENG2': 1,
      'L:A32NX_FIRE_TEST_APU': 1,
      'L:A32NX_FWC_FIRE_TEST_ENG1_ACTIVE': 1,
      'L:A32NX_FIRE_ENG1_LOOP_A_FAULT': 1,
      'L:A32NX_FIRE_DETECTED_ENG1': 1,
      'L:A32NX_FIRE_DETECTED_APU': 1,
    };
    for (const node of ALL_FIRE_NODES) {
      expect(effectsShownOn(node, variables)).toEqual([]);
    }
  });

  it('shows smoke at the APU exhaust with an APU fire, and nothing at the engines', () => {
    expect(effectsShownOn(APU_EXHAUST_NODE, { 'L:A32NX_APU_ON_FIRE': 1 })).toEqual([FX_SMOKE_FIRE]);
    expect(effectsShownOn(ENGINE_EXHAUST_NODES[1], { 'L:A32NX_APU_ON_FIRE': 1 })).toEqual([]);
  });

  it('shows no fire or smoke effect when the flyPad Situation Visual Effects switch is off', () => {
    const allFires = {
      ...ENGINES_RUNNING,
      'L:A32NX_ENG_1_ON_FIRE': 1,
      'L:A32NX_ENG_2_ON_FIRE': 1,
      'A:ENG ON FIRE:1': 1,
      'A:ENG ON FIRE:2': 1,
      'L:A32NX_APU_ON_FIRE': 1,
      'A:APU ON FIRE DETECTED': 1,
      [SITUATION_FX_SWITCH]: 0,
    };
    for (const node of ALL_FIRE_NODES) {
      expect(effectsShownOn(node, allFires)).toEqual([]);
    }
  });
});

describe('A32NX engine damage smoke (replacement of the sim-driven EngineDamage effect)', () => {
  it('has one smoke effect per engine node, with no offset', () => {
    expect(damageComponents().map((fx) => [fx.node, fx.guid, fx.offsets])).toEqual([
      [ENGINE_EXHAUST_NODES[1], FX_SMOKE_FIRE, []],
      [ENGINE_EXHAUST_NODES[2], FX_SMOKE_FIRE, []],
    ]);
  });

  it('shows the smoke at the failed engine only', () => {
    for (const engine of [1, 2] as const) {
      const other = engine === 1 ? 2 : 1;
      const variables = { [`A:ENG FAILED:${engine}`]: 1 };
      expect(damageEffectsShownOn(ENGINE_EXHAUST_NODES[engine], variables)).toEqual([FX_SMOKE_FIRE]);
      expect(damageEffectsShownOn(ENGINE_EXHAUST_NODES[other], variables)).toEqual([]);
      expect(damageEffectsShownOn(APU_EXHAUST_NODE, variables)).toEqual([]);
    }
  });

  it('shows no damage smoke on healthy running engines', () => {
    for (const node of ALL_FIRE_NODES) {
      expect(damageEffectsShownOn(node, ENGINES_RUNNING)).toEqual([]);
    }
  });

  it('leaves the smoke to the fire effect while the failed engine burns (one smoke per engine)', () => {
    const failedAndBurning = { 'A:ENG FAILED:1': 1, 'L:A32NX_ENG_1_ON_FIRE': 1 };
    expect(damageEffectsShownOn(ENGINE_EXHAUST_NODES[1], failedAndBurning)).toEqual([]);
    expect(effectsShownOn(ENGINE_EXHAUST_NODES[1], failedAndBurning)).toEqual([FX_FIRE_1_SMALL, FX_SMOKE_FIRE]);
  });

  it('shows no damage smoke when the flyPad Situation Visual Effects switch is off', () => {
    const bothFailedSwitchOff = { 'A:ENG FAILED:1': 1, 'A:ENG FAILED:2': 1, [SITUATION_FX_SWITCH]: 0 };
    for (const node of ALL_FIRE_NODES) {
      expect(damageEffectsShownOn(node, bothFailedSwitchOff)).toEqual([]);
    }
  });
});

describe('A32NX engine oil leak smoke (replacement of the sim-driven EngineOilLeak effect)', () => {
  it('has one smoke effect per engine node, with no offset, on nodes that exist in every exterior model LOD', () => {
    expect(oilLeakComponents().map((fx) => [fx.node, fx.guid, fx.offsets])).toEqual([
      [ENGINE_EXHAUST_NODES[1], FX_SMOKE_FIRE, []],
      [ENGINE_EXHAUST_NODES[2], FX_SMOKE_FIRE, []],
    ]);
    for (const lod of EXTERIOR_LODS) {
      const nodeNames = builtExteriorLodNodeNames(lod);
      for (const fx of oilLeakComponents()) {
        expect(nodeNames.has(fx.node), `${fx.node} in LOD0${lod}`).toBe(true);
      }
    }
  });

  it('shows the smoke at the leaking engine only', () => {
    for (const engine of [1, 2] as const) {
      const other = engine === 1 ? 2 : 1;
      expect(oilLeakEffectsShownOn(ENGINE_EXHAUST_NODES[engine], oilLeaking(engine))).toEqual([FX_SMOKE_FIRE]);
      expect(oilLeakEffectsShownOn(ENGINE_EXHAUST_NODES[other], oilLeaking(engine))).toEqual([]);
      expect(oilLeakEffectsShownOn(APU_EXHAUST_NODE, oilLeaking(engine))).toEqual([]);
    }
  });

  it('shows the smoke from the FADEC leak threshold up: core speed N2 at 10 % or more', () => {
    expect(oilLeakEffectsShownOn(ENGINE_EXHAUST_NODES[1], oilLeaking(1, 10))).toEqual([FX_SMOKE_FIRE]);
    // a shut down engine windmilling at 8 % N2 (270 kt) leaks no oil
    expect(oilLeakEffectsShownOn(ENGINE_EXHAUST_NODES[1], oilLeaking(1, 8))).toEqual([]);
  });

  it('shows no smoke while no oil flows out: engine stopped or oil system empty', () => {
    for (const engine of [1, 2] as const) {
      expect(oilLeakEffectsShownOn(ENGINE_EXHAUST_NODES[engine], oilLeaking(engine, 0))).toEqual([]);
      expect(oilLeakEffectsShownOn(ENGINE_EXHAUST_NODES[engine], oilLeaking(engine, 60, 0))).toEqual([]);
    }
  });

  it('shows no oil leak smoke on healthy running engines', () => {
    const healthy = {
      ...ENGINES_RUNNING,
      'L:A32NX_ENGINE_N2:1': 60,
      'L:A32NX_ENGINE_N2:2': 60,
      'L:A32NX_ENGINE_OIL_TOTAL:1': 18,
      'L:A32NX_ENGINE_OIL_TOTAL:2': 18,
    };
    for (const node of ALL_FIRE_NODES) {
      expect(oilLeakEffectsShownOn(node, healthy)).toEqual([]);
    }
  });

  it('leaves the smoke to the fire or damage effect of the same engine (one smoke per engine)', () => {
    const leakingAndBurning = { ...oilLeaking(1), 'L:A32NX_ENG_1_ON_FIRE': 1 };
    expect(oilLeakEffectsShownOn(ENGINE_EXHAUST_NODES[1], leakingAndBurning)).toEqual([]);
    expect(effectsShownOn(ENGINE_EXHAUST_NODES[1], leakingAndBurning)).toEqual([FX_FIRE_1_SMALL, FX_SMOKE_FIRE]);
    const leakingAndFailed = { ...oilLeaking(2), 'A:ENG FAILED:2': 1 };
    expect(oilLeakEffectsShownOn(ENGINE_EXHAUST_NODES[2], leakingAndFailed)).toEqual([]);
    expect(damageEffectsShownOn(ENGINE_EXHAUST_NODES[2], leakingAndFailed)).toEqual([FX_SMOKE_FIRE]);
  });

  it('shows no oil leak smoke when the flyPad Situation Visual Effects switch is off', () => {
    const bothLeakingSwitchOff = { ...oilLeaking(1), ...oilLeaking(2), [SITUATION_FX_SWITCH]: 0 };
    for (const node of ALL_FIRE_NODES) {
      expect(oilLeakEffectsShownOn(node, bothLeakingSwitchOff)).toEqual([]);
    }
  });
});

describe('A32NX aircraft.cfg [EFFECTS] around the fire effects', () => {
  it('turns off the sim-driven stock engine damage smoke (default fx_engsmoke), which the flyPad switch could not reach', () => {
    expect(namedEffect('EngineDamage')?.split(',')[0].trim().toLowerCase()).toBe('fx_dummy');
  });

  it('turns off the sim-driven stock engine oil leak smoke (presumed default fx_OilLeak), which the flyPad switch could not reach', () => {
    expect(namedEffect('EngineOilLeak')?.split(',')[0].trim().toLowerCase()).toBe('fx_dummy');
  });

  it('has no fire effect.N line left (the legacy fire effects showed nothing in MSFS 2024)', () => {
    expect(cfgConditionalEffects().filter((e) => /FIRE/i.test(e.code) || /fire|smoke/i.test(e.effect))).toEqual([]);
  });

  it('numbers the effect.N lines 0, 1, 2... without a gap or a duplicate', () => {
    const indexes = cfgConditionalEffects().map((e) => e.index);
    expect(indexes).toEqual(indexes.map((_, position) => position));
  });

  it('turns off the sim-driven stock engine fire effect, so a fire never shows twice or ignores the switch', () => {
    expect(namedEffect('EngineFire')?.split(',')[0].trim().toLowerCase()).toBe('fx_dummy');
  });

  it('keeps the existing heat haze effects, which the flyPad switch leaves alone', () => {
    const heatHaze = (node: string, variables: Record<string, number>) =>
      cfgConditionalEffects().filter(
        (e) => e.node === node && e.effect === 'FX_ASOBO_HEAT_BIG' && evaluate(e.code, variables),
      );
    expect(heatHaze('FX_EXHAUST_LEFT', { ...ENGINES_RUNNING, [SITUATION_FX_SWITCH]: 0 })).toHaveLength(1);
    expect(heatHaze('FX_EXHAUST_APU', { 'L:A32NX_APU_N_RAW': 50 })).toHaveLength(1);
  });
});

describe('A32NX engine fire marker nodes', () => {
  it('are full scale, at the mirrored world positions of the 0.5-scaled exhaust nodes', () => {
    const marker = JSON.parse(readFileSync(join(MODEL_DIR, 'fx_engine_fire', 'fx_engine_fire.gltf'), 'utf8')) as {
      nodes: { name: string; translation: number[]; scale?: number[]; rotation?: number[] }[];
    };
    const byName = Object.fromEntries(marker.nodes.map((node) => [node.name, node]));
    for (const name of Object.values(ENGINE_EXHAUST_NODES)) {
      expect(byName[name].scale, name).toBeUndefined();
      expect(byName[name].rotation, name).toBeUndefined();
    }
    const left = byName[ENGINE_EXHAUST_NODES[1]].translation;
    const right = byName[ENGINE_EXHAUST_NODES[2]].translation;
    expect(left[0]).toBeCloseTo(-right[0], 1);
    expect(left[1]).toBeCloseTo(right[1], 3);
    expect(left[2]).toBeCloseTo(right[2], 2);
    // the 0.5 scale stays on the exhaust nodes themselves (heat haze and contrails unchanged)
    const models = readFileSync(join(MODEL_DIR, 'models.json'), 'utf8');
    expect(models).toMatch(/"node": "fx_exhaust_left",\s*"mods": \{[^}]*"scale": \[0\.5, 0\.5, 0\.5\]/);
  });
});
