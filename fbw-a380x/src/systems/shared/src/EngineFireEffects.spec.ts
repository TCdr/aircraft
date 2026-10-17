// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

/*
 * The engine and APU fire visual effects of the A380X: the ASOBO_GT_FX components ENGINE_FIRE_FX (A380_WINGS.xml, the
 * part that owns the engine exhaust nodes) and APU_FIRE_FX (A380_Fuselage_Behavior.xml, the part that owns the APU
 * exhaust node), with their FX_CODE evaluated by a small RPN interpreter for the operators they use, and the [EFFECTS]
 * section of aircraft.cfg around them.
 * The fire is the one "zone burning" signal L:A32NX_ENG_n_ON_FIRE / L:A32NX_APU_ON_FIRE (systems.wasm
 * SetOnFireModule: flyPad fire failure, cleared by its removal or when an AGENT discharge puts the fire out).
 * systems.wasm copies the engine one into the sim's ENG ON FIRE:n, which the effects must not read: with it in the code
 * the flames went on after the failure removal (seen in the sim).
 * The fire TEST pb only lights the fire warnings, and the FIRE light stays on until the fire is out, whatever the
 * position of the ENG FIRE pb.
 */
const AIRCRAFT_DIR = resolve(
  __dirname,
  '../../../base/flybywire-aircraft-a380-842/SimObjects/AirPlanes/FlyByWire_A380X',
);
const AIRCRAFT_CFG = resolve(AIRCRAFT_DIR, 'common/config/aircraft.cfg');
const WINGS_BEHAVIOR_XML = resolve(AIRCRAFT_DIR, 'attachments/flybywire/Part_Exterior_Wings/model/A380_WINGS.xml');
const FUSELAGE_BEHAVIOR_XML = resolve(
  AIRCRAFT_DIR,
  'attachments/flybywire/Part_Exterior_Fuselage/model/A380_Fuselage_Behavior.xml',
);

/** The flyPad Settings > Sim Options "Situation Visual Effects" switch, written by the flyPad (EFB Settings/sync.ts) */
const SITUATION_FX_SWITCH = 'L:A32NX_CONFIG_SITUATION_FX';

/**
 * Stock MSFS 2024 visual effect graphs (package fs-base-effects, VisualEffectLibs/Asobo/Base). Each GUID is the one
 * stored in the .spb file (16 bytes, little-endian GUID layout, after the field tag 8), the same place where the GUIDs
 * of the SDK templates are found (Contrails_QUAD.spb = ASOBO_CONTRAIL_QUAD_FX {F42CE638-...},
 * FX_WaterDrop_Glider_HighSpeed.spb = the jettison plume {AA642D83-...}).
 */
const FX_FIRE_1_SMALL = '{75A93861-D48A-456B-BCA5-7C3AFF31C0F6}';
/** FX_Smoke_Fire.spb: the smoke with the engine flames and at the APU (EngineSmoke spread as a general haze) */
const FX_SMOKE_FIRE = '{15B35478-6321-4480-8642-EB44248318E2}';

/**
 * The exhaust node of each engine in A380_WINGS.gltf (aircraft-large-files), from the node positions: LEFT1 x = +25.9 m
 * (left outer, engine 1), RIGHT2 +15.0 m (left inner, a child of the INBOARD_ENG_LH bone despite its name), RIGHT3
 * -14.9 m (right inner), RIGHT4 -25.6 m (right outer). Engine 2 uses RIGHT2 and not FX_EXHAUST_LEFT2 (same position,
 * scene root): LEFT2 is missing from A380_WINGS_LOD01.gltf, where its effects vanished (see WINGS_LOD_EXHAUST_NODES).
 */
const ENGINE_EXHAUST_NODES = {
  1: 'FX_EXHAUST_LEFT1',
  2: 'FX_EXHAUST_RIGHT2',
  3: 'FX_EXHAUST_RIGHT3',
  4: 'FX_EXHAUST_RIGHT4',
} as const;
/** The APU exhaust node of A380_FUSELAGE.gltf */
const APU_EXHAUST_NODE = 'FX_EXHAUST_APU';
const ENGINES = [1, 2, 3, 4] as const;
const ALL_FIRE_NODES = [...Object.values(ENGINE_EXHAUST_NODES), APU_EXHAUST_NODE];

/** One ASOBO_GT_FX component of a model behaviour file */
interface FxComponent {
  file: string;
  id: string;
  node: string;
  guid: string;
  code: string;
  offsets: string[];
}

/** The ASOBO_GT_FX components with their own FX_GUID and FX_CODE (the fire ones are written that way) */
function fxComponents(file: string): FxComponent[] {
  const xml = readFileSync(file, 'utf8');
  const components: FxComponent[] = [];
  const componentRegex =
    /<Component ID="([^"]+)" Node="([^"]+)">\s*<UseTemplate Name="ASOBO_GT_FX">([\s\S]*?)<\/UseTemplate>\s*<\/Component>/g;
  for (const match of xml.matchAll(componentRegex)) {
    const body = match[3];
    const guid = /<FX_GUID>([^<]*)<\/FX_GUID>/.exec(body);
    const code = /<FX_CODE>([^<]*)<\/FX_CODE>/.exec(body);
    if (guid && code) {
      components.push({
        file,
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

/** The fire and smoke components of both exterior parts (ENGINE_FIRE_FX, APU_FIRE_FX) */
function fireComponents(): FxComponent[] {
  return [...fxComponents(WINGS_BEHAVIOR_XML), ...fxComponents(FUSELAGE_BEHAVIOR_XML)].filter(
    (fx) => /^(ENGINE|APU)_FIRE_/.test(fx.id) && [FX_FIRE_1_SMALL, FX_SMOKE_FIRE].includes(fx.guid),
  );
}

/** The engine damage smoke components (ENGINE_DAMAGE_FX), the replacement of the sim-driven EngineDamage effect */
function damageComponents(): FxComponent[] {
  return fxComponents(WINGS_BEHAVIOR_XML).filter((fx) => fx.id.startsWith('ENGINE_DAMAGE_'));
}

/** The GUIDs of the engine damage effects shown on a node with the given variables (flyPad switch on unless given) */
function damageEffectsShownOn(node: string, variables: Record<string, number>): string[] {
  const withSwitch = { [SITUATION_FX_SWITCH]: 1, ...variables };
  return damageComponents()
    .filter((fx) => fx.node === node && evaluate(fx.code, withSwitch))
    .map((fx) => fx.guid);
}

/** The engine oil leak smoke components (ENGINE_OIL_LEAK_FX), the replacement of the sim-driven EngineOilLeak effect */
function oilLeakComponents(): FxComponent[] {
  return fxComponents(WINGS_BEHAVIOR_XML).filter((fx) => fx.id.startsWith('ENGINE_OIL_LEAK_'));
}

/** The GUIDs of the oil leak effects shown on a node with the given variables (flyPad switch on unless given) */
function oilLeakEffectsShownOn(node: string, variables: Record<string, number>): string[] {
  const withSwitch = { [SITUATION_FX_SWITCH]: 1, ...variables };
  return oilLeakComponents()
    .filter((fx) => fx.node === node && evaluate(fx.code, withSwitch))
    .map((fx) => fx.guid);
}

/**
 * An oil leak of one engine while the oil flows out (fadec_common EngineOilFailures.hpp leakedQuantity): the flyPad
 * failure, the core turning the oil pump (N3 at 10 % or more) and oil left in the oil system (quarts)
 */
function oilLeaking(engine: number, n3 = 60, oilTotal = 15): Record<string, number> {
  return {
    [`L:A32NX_ENGINE_${engine}_OIL_LEAK`]: 1,
    [`L:A32NX_ENGINE_N3:${engine}`]: n3,
    [`L:A32NX_ENGINE_OIL_TOTAL:${engine}`]: oilTotal,
  };
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

/** The GUIDs of the fire and smoke effects shown on a node with the given variables (flyPad switch on unless given) */
function effectsShownOn(node: string, variables: Record<string, number>): string[] {
  const withSwitch = { [SITUATION_FX_SWITCH]: 1, ...variables };
  return fireComponents()
    .filter((fx) => fx.node === node && evaluate(fx.code, withSwitch))
    .map((fx) => fx.guid);
}

/** A fire of one engine as written by the systems: the flyPad failure L:var and its copy in the sim's ENG ON FIRE:n */
function engineFire(engine: number): Record<string, number> {
  return { [`L:A32NX_ENG_${engine}_ON_FIRE`]: 1, [`A:ENG ON FIRE:${engine}`]: 1 };
}

describe('A380X engine and APU fire effects (exterior model ASOBO_GT_FX components)', () => {
  it('has one flame effect per engine exhaust in the wings part and one smoke effect at the APU in the fuselage part', () => {
    expect(fireComponents().map((fx) => [fx.file, fx.node, fx.guid])).toEqual([
      ...ENGINES.flatMap((engine) => [
        [WINGS_BEHAVIOR_XML, ENGINE_EXHAUST_NODES[engine], FX_FIRE_1_SMALL],
        [WINGS_BEHAVIOR_XML, ENGINE_EXHAUST_NODES[engine], FX_SMOKE_FIRE],
      ]),
      [FUSELAGE_BEHAVIOR_XML, APU_EXHAUST_NODE, FX_SMOKE_FIRE],
    ]);
  });

  it('hangs the effects with no offset (FX offsets proved unreliable on the jettison plume)', () => {
    for (const fx of fireComponents()) {
      expect(fx.offsets.every((offset) => Number(offset) === 0)).toBe(true);
    }
  });

  it('shows no fire effect without a fire', () => {
    for (const node of ALL_FIRE_NODES) {
      expect(effectsShownOn(node, { 'A:GENERAL ENG COMBUSTION:1': 1, 'A:GENERAL ENG COMBUSTION:2': 1 })).toEqual([]);
    }
  });

  it('shows the flames at the exhaust of the engine on fire only, for each of the 4 engines', () => {
    for (const engine of ENGINES) {
      for (const other of ENGINES) {
        expect(effectsShownOn(ENGINE_EXHAUST_NODES[other], engineFire(engine))).toEqual(
          other === engine ? [FX_FIRE_1_SMALL, FX_SMOKE_FIRE] : [],
        );
      }
      expect(effectsShownOn(APU_EXHAUST_NODE, engineFire(engine))).toEqual([]);
    }
  });

  it('shows the flames from the flyPad fire variable alone (before the sim variable copy)', () => {
    expect(effectsShownOn('FX_EXHAUST_LEFT1', { 'L:A32NX_ENG_1_ON_FIRE': 1 })).toEqual([
      FX_FIRE_1_SMALL,
      FX_SMOKE_FIRE,
    ]);
    expect(effectsShownOn('FX_EXHAUST_RIGHT4', { 'L:A32NX_ENG_4_ON_FIRE': 1 })).toEqual([
      FX_FIRE_1_SMALL,
      FX_SMOKE_FIRE,
    ]);
  });

  it('reads the one "zone burning" L:var and the flyPad switch only, no sim variable', () => {
    const expected: Record<string, string> = {
      ...Object.fromEntries(ENGINES.map((engine) => [ENGINE_EXHAUST_NODES[engine], `L:A32NX_ENG_${engine}_ON_FIRE`])),
      [APU_EXHAUST_NODE]: 'L:A32NX_APU_ON_FIRE',
    };
    for (const fx of fireComponents()) {
      expect(fx.code, `${fx.node} ${fx.guid}`).toBe(`(${expected[fx.node]}, bool) (${SITUATION_FX_SWITCH}, bool) and`);
    }
  });

  it('stops when the fire is out (failure removed or agent put it out) although the ENG ON FIRE:n copy stays on', () => {
    for (const engine of ENGINES) {
      const fireOutSimCopyStuck = { [`L:A32NX_ENG_${engine}_ON_FIRE`]: 0, [`A:ENG ON FIRE:${engine}`]: 1 };
      for (const node of ALL_FIRE_NODES) {
        expect(effectsShownOn(node, fireOutSimCopyStuck)).toEqual([]);
      }
    }
  });

  it('shows nothing during the FIRE TEST (warnings only, no fire)', () => {
    const fireTest = {
      'L:A32NX_OVHD_FIRE_TEST_PB_IS_PRESSED': 1,
      'L:A32NX_FIRE_TEST_ACTIVE': 1,
      'L:A32NX_FIRE_DETECTED_ENG1': 1,
      'L:A32NX_FIRE_DETECTED_APU': 1,
    };
    for (const node of ALL_FIRE_NODES) {
      expect(effectsShownOn(node, fireTest)).toEqual([]);
    }
  });

  it('shows smoke at the APU exhaust with an APU fire, and nothing at the engines', () => {
    expect(effectsShownOn(APU_EXHAUST_NODE, { 'L:A32NX_APU_ON_FIRE': 1 })).toEqual([FX_SMOKE_FIRE]);
    for (const engine of ENGINES) {
      expect(effectsShownOn(ENGINE_EXHAUST_NODES[engine], { 'L:A32NX_APU_ON_FIRE': 1 })).toEqual([]);
    }
  });

  it('shows no fire or smoke effect when the flyPad Situation Visual Effects switch is off', () => {
    const allFires = {
      ...engineFire(1),
      ...engineFire(2),
      ...engineFire(3),
      ...engineFire(4),
      'L:A32NX_APU_ON_FIRE': 1,
      [SITUATION_FX_SWITCH]: 0,
    };
    for (const node of ALL_FIRE_NODES) {
      expect(effectsShownOn(node, allFires)).toEqual([]);
    }
  });
});

describe('A380X engine damage smoke (replacement of the sim-driven EngineDamage effect)', () => {
  it('has one smoke effect per engine exhaust, with no offset', () => {
    expect(damageComponents().map((fx) => [fx.node, fx.guid, fx.offsets])).toEqual(
      ENGINES.map((engine) => [ENGINE_EXHAUST_NODES[engine], FX_SMOKE_FIRE, []]),
    );
  });

  it('shows the smoke at the exhaust of the failed engine only, for each of the 4 engines', () => {
    for (const engine of ENGINES) {
      for (const other of ENGINES) {
        expect(damageEffectsShownOn(ENGINE_EXHAUST_NODES[other], { [`A:ENG FAILED:${engine}`]: 1 })).toEqual(
          other === engine ? [FX_SMOKE_FIRE] : [],
        );
      }
    }
  });

  it('shows no damage smoke on healthy running engines', () => {
    for (const engine of ENGINES) {
      expect(damageEffectsShownOn(ENGINE_EXHAUST_NODES[engine], { [`A:GENERAL ENG COMBUSTION:${engine}`]: 1 })).toEqual(
        [],
      );
    }
  });

  it('leaves the smoke to the fire effect while the failed engine burns (one smoke per engine)', () => {
    for (const engine of ENGINES) {
      const failedAndBurning = { [`A:ENG FAILED:${engine}`]: 1, ...engineFire(engine) };
      expect(damageEffectsShownOn(ENGINE_EXHAUST_NODES[engine], failedAndBurning)).toEqual([]);
      expect(effectsShownOn(ENGINE_EXHAUST_NODES[engine], failedAndBurning)).toEqual([FX_FIRE_1_SMALL, FX_SMOKE_FIRE]);
    }
  });

  it('shows no damage smoke when the flyPad Situation Visual Effects switch is off', () => {
    for (const engine of ENGINES) {
      expect(
        damageEffectsShownOn(ENGINE_EXHAUST_NODES[engine], { [`A:ENG FAILED:${engine}`]: 1, [SITUATION_FX_SWITCH]: 0 }),
      ).toEqual([]);
    }
  });
});

describe('A380X engine oil leak smoke (replacement of the sim-driven EngineOilLeak effect)', () => {
  it('has one smoke effect per engine exhaust, with no offset', () => {
    expect(oilLeakComponents().map((fx) => [fx.node, fx.guid, fx.offsets])).toEqual(
      ENGINES.map((engine) => [ENGINE_EXHAUST_NODES[engine], FX_SMOKE_FIRE, []]),
    );
  });

  it('shows the smoke at the exhaust of the leaking engine only, for each of the 4 engines', () => {
    for (const engine of ENGINES) {
      for (const other of ENGINES) {
        expect(oilLeakEffectsShownOn(ENGINE_EXHAUST_NODES[other], oilLeaking(engine))).toEqual(
          other === engine ? [FX_SMOKE_FIRE] : [],
        );
      }
      expect(oilLeakEffectsShownOn(APU_EXHAUST_NODE, oilLeaking(engine))).toEqual([]);
    }
  });

  it('shows the smoke from the FADEC leak threshold up: core speed N3 at 10 % or more', () => {
    expect(oilLeakEffectsShownOn('FX_EXHAUST_LEFT1', oilLeaking(1, 10))).toEqual([FX_SMOKE_FIRE]);
    expect(oilLeakEffectsShownOn('FX_EXHAUST_LEFT1', oilLeaking(1, 9.9))).toEqual([]);
  });

  it('shows no smoke while no oil flows out: engine stopped or oil system empty', () => {
    for (const engine of ENGINES) {
      expect(oilLeakEffectsShownOn(ENGINE_EXHAUST_NODES[engine], oilLeaking(engine, 0))).toEqual([]);
      expect(oilLeakEffectsShownOn(ENGINE_EXHAUST_NODES[engine], oilLeaking(engine, 60, 0))).toEqual([]);
    }
  });

  it('shows no oil leak smoke on healthy running engines', () => {
    for (const engine of ENGINES) {
      const healthy = { [`L:A32NX_ENGINE_N3:${engine}`]: 60, [`L:A32NX_ENGINE_OIL_TOTAL:${engine}`]: 18 };
      expect(oilLeakEffectsShownOn(ENGINE_EXHAUST_NODES[engine], healthy)).toEqual([]);
    }
  });

  it('leaves the smoke to the fire or damage effect of the same engine (one smoke per engine)', () => {
    for (const engine of ENGINES) {
      const leakingAndBurning = { ...oilLeaking(engine), ...engineFire(engine) };
      expect(oilLeakEffectsShownOn(ENGINE_EXHAUST_NODES[engine], leakingAndBurning)).toEqual([]);
      expect(effectsShownOn(ENGINE_EXHAUST_NODES[engine], leakingAndBurning)).toEqual([FX_FIRE_1_SMALL, FX_SMOKE_FIRE]);
      const leakingAndFailed = { ...oilLeaking(engine), [`A:ENG FAILED:${engine}`]: 1 };
      expect(oilLeakEffectsShownOn(ENGINE_EXHAUST_NODES[engine], leakingAndFailed)).toEqual([]);
      expect(damageEffectsShownOn(ENGINE_EXHAUST_NODES[engine], leakingAndFailed)).toEqual([FX_SMOKE_FIRE]);
    }
  });

  it('shows no oil leak smoke when the flyPad Situation Visual Effects switch is off', () => {
    for (const engine of ENGINES) {
      expect(
        oilLeakEffectsShownOn(ENGINE_EXHAUST_NODES[engine], { ...oilLeaking(engine), [SITUATION_FX_SWITCH]: 0 }),
      ).toEqual([]);
    }
  });
});

describe('A380X aircraft.cfg [EFFECTS] around the fire effects', () => {
  it('turns off the sim-driven stock engine damage smoke, which the flyPad switch could not reach', () => {
    // EngineDamage = fx_engsmoke is shown by the sim itself; the model ENGINE_DAMAGE_FX replaces it
    expect(namedEffect('EngineDamage')?.split(',')[0].trim().toLowerCase()).toBe('fx_dummy');
  });

  it('turns off the sim-driven stock engine oil leak smoke, which the flyPad switch could not reach', () => {
    // EngineOilLeak = fx_OilLeak is shown by the sim itself; the model ENGINE_OIL_LEAK_FX replaces it
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
    // systems.wasm sets the sim's ENG ON FIRE:n, which would start the stock EngineFire effect (default fx_engfire)
    expect(namedEffect('EngineFire')?.split(',')[0].trim().toLowerCase()).toBe('fx_dummy');
  });

  it('keeps the existing heat haze effects', () => {
    const heatHaze = (node: string, variables: Record<string, number>) =>
      cfgConditionalEffects().filter(
        (e) => e.node === node && e.effect === 'FX_ASOBO_HEAT_BIG' && evaluate(e.code, variables),
      );
    expect(heatHaze('FX_EXHAUST_LEFT1', { 'A:GENERAL ENG COMBUSTION:1': 1 })).toHaveLength(1);
    expect(heatHaze('FX_EXHAUST_APU', { 'L:A32NX_APU_N_RAW': 50 })).toHaveLength(1);
  });
});

/**
 * The engine exhaust nodes (FX_EXHAUST_*) of each LOD of the wings part, in the order of the A380_WINGS.xml <LODS>.
 * The model files are in the aircraft-large-files submodule (large-files/, not checked out in every work tree), so the
 * node names are copied here from its sources (aircraft-large-files 5f07408, the same in the installed package); the
 * test "matches the large-files model sources" compares them with the files whenever the submodule is there.
 * FX_EXHAUST_LEFT2 is in LOD00 only (scene root); FX_EXHAUST_RIGHT2, at the same place on the left inner engine bone,
 * is in LOD00 and LOD01. LOD02 (minSize 1) has no exhaust node: no engine effect shows there, for any engine.
 */
const WINGS_LOD_EXHAUST_NODES: Record<string, string[]> = {
  'A380_WINGS.gltf': [
    'FX_EXHAUST_LEFT1',
    'FX_EXHAUST_LEFT2',
    'FX_EXHAUST_RIGHT2',
    'FX_EXHAUST_RIGHT3',
    'FX_EXHAUST_RIGHT4',
  ],
  'A380_WINGS_LOD01.gltf': ['FX_EXHAUST_LEFT1', 'FX_EXHAUST_RIGHT2', 'FX_EXHAUST_RIGHT3', 'FX_EXHAUST_RIGHT4'],
  'A380_WINGS_LOD02.gltf': [],
};
const LARGE_FILES_WINGS_MODEL_DIR = resolve(
  __dirname,
  '../../../../../large-files/fbw-a380x/src/base/flybywire-aircraft-a380-842/SimObjects/AirPlanes/FlyByWire_A380X',
  'attachments/flybywire/Part_Exterior_Wings/model',
);
const ENGINE_EXHAUST_NODE = /^FX_EXHAUST_(LEFT|RIGHT)\d$/;

/** The engine effects of the wings part: every component on an engine exhaust node (fire, smoke, contrails...) */
function wingsEngineEffectNodes(): { id: string; node: string }[] {
  const xml = readFileSync(WINGS_BEHAVIOR_XML, 'utf8');
  return [...xml.matchAll(/<Component ID="([^"]+)" Node="([^"]+)">/g)]
    .map((match) => ({ id: match[1], node: match[2] }))
    .filter((component) => ENGINE_EXHAUST_NODE.test(component.node));
}

/** The engine effects of aircraft.cfg: the effect.N lines on an engine exhaust node (heat haze) */
function cfgEngineEffectNodes(): { id: string; node: string }[] {
  return cfgConditionalEffects()
    .filter((effect) => ENGINE_EXHAUST_NODE.test(effect.node))
    .map((effect) => ({ id: `effect.${effect.index}`, node: effect.node }));
}

describe('A380X engine effect nodes in the wings model LODs', () => {
  it('knows the LODs of A380_WINGS.xml', () => {
    const xml = readFileSync(WINGS_BEHAVIOR_XML, 'utf8');
    const lodFiles = [...xml.matchAll(/<LOD minSize="[^"]*" ModelFile="[^"]*\/([^"/]+)"\/>/g)].map((match) => match[1]);
    expect(lodFiles).toEqual(Object.keys(WINGS_LOD_EXHAUST_NODES));
  });

  it.skipIf(!existsSync(LARGE_FILES_WINGS_MODEL_DIR))('matches the large-files model sources', () => {
    for (const [gltf, exhaustNodes] of Object.entries(WINGS_LOD_EXHAUST_NODES)) {
      const nodes = JSON.parse(readFileSync(resolve(LARGE_FILES_WINGS_MODEL_DIR, gltf), 'utf8')).nodes as {
        name?: string;
      }[];
      const names = nodes.map((node) => node.name ?? '').filter((name) => name.startsWith('FX_EXHAUST_'));
      expect(names.sort(), gltf).toEqual([...exhaustNodes].sort());
    }
  });

  it('hangs every engine effect on a node of every LOD that has engine exhaust nodes (LOD00 and LOD01)', () => {
    const lodsWithExhaust = Object.entries(WINGS_LOD_EXHAUST_NODES).filter(([, nodes]) => nodes.length > 0);
    expect(lodsWithExhaust.map(([gltf]) => gltf)).toEqual(['A380_WINGS.gltf', 'A380_WINGS_LOD01.gltf']);
    const effects = [...wingsEngineEffectNodes(), ...cfgEngineEffectNodes()];
    // fire, fire smoke, damage and oil leak smoke for each engine, 6 contrails, 4 heat hazes
    expect(effects.length).toBeGreaterThanOrEqual(4 * 4 + 6 + 4);
    for (const { id, node } of effects) {
      for (const [gltf, nodes] of lodsWithExhaust) {
        expect(nodes.includes(node), `${id} on ${node} in ${gltf}`).toBe(true);
      }
    }
  });

  it('uses the one exhaust node of each engine for all its effects', () => {
    const usedNodes = new Set([...wingsEngineEffectNodes(), ...cfgEngineEffectNodes()].map((effect) => effect.node));
    expect([...usedNodes].sort()).toEqual(Object.values(ENGINE_EXHAUST_NODES).sort());
  });
});
