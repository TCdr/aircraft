// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

/*
 * A visual effect of the A380X exterior model, as ASOBO_GT_FX components of the behaviour XML of the part that owns
 * its nodes, with their FX_CODE evaluated by a small RPN interpreter for the operators they use:
 * - the fuel jettison drip on the ground at the jettison outlets (A380_WINGS.xml FUEL_JETTISON_GROUND_DRIP_FX), next to
 *   the jettison plume (FUEL_JETTISON_FX). Fuel can be jettisoned in any aircraft configuration and at any speed, so
 *   a jettison on the ground puts the fuel on the ground.
 */
const PARTS_DIR = resolve(
  __dirname,
  '../../../base/flybywire-aircraft-a380-842/SimObjects/AirPlanes/FlyByWire_A380X/attachments/flybywire',
);
const WINGS_BEHAVIOR_XML = resolve(PARTS_DIR, 'Part_Exterior_Wings/model/A380_WINGS.xml');

/** The flyPad Settings > Sim Options "Situation Visual Effects" switch, written by the flyPad (EFB Settings/sync.ts) */
const SITUATION_FX_SWITCH = 'L:A32NX_CONFIG_SITUATION_FX';

/** Stock MSFS fuel leak drip graphs (SDK Asobo_EX1 Common/Exterior/Templates/VFX.xml, ASOBO_Fuel_Leak_*_Template) */
const FUEL_LEAK_SLOW = '{21C38E31-40D2-4477-8118-2E78DC130D17}';
const FUEL_LEAK_FAST = '{65D83A8F-3436-4161-90E4-DD7883247A1D}';
/** The graph parameter the fuel leak graphs emit with */
const FUEL_LEAK_GRAPH_PARAM = 'FuelLeak_Active';
/** The jettison plume: stock water ballast mist, high-speed and low-speed versions */
const BALLAST_HIGH_SPEED = '{AA642D83-552F-46F5-992A-6A6AB82CBF18}';
const BALLAST_LOW_SPEED = '{CAF32131-A4D7-4FC8-9831-83F3283C2575}';

/** The jettison outlet nodes (aircraft-large-files) and the MSFS fuel system jettison valve of each side */
const JETTISON_OUTLETS = [
  { node: 'FX_JETTISON_LH', valve: 57 },
  { node: 'FX_JETTISON_RH', valve: 58 },
] as const;

/** One ASOBO_GT_FX component, with the template parameters of its own and of its parent components */
interface FxComponent {
  id: string;
  node: string;
  guid: string;
  code: string;
  graphParams: string[];
  offsets: string[];
}

/** The direct child elements of an element with the given tag name */
function childrenNamed(element: Element, tag: string): Element[] {
  return Array.from(element.children).filter((child) => child.tagName === tag);
}

/**
 * The ASOBO_GT_FX components of a behaviour file: every Component with a Node and an ASOBO_GT_FX UseTemplate, its
 * parameters being those of the OverrideTemplateParameters of its parent components, overridden by its own.
 */
function fxComponents(file: string): FxComponent[] {
  const document = new DOMParser().parseFromString(readFileSync(file, 'utf8'), 'application/xml');
  const components: FxComponent[] = [];
  for (const component of Array.from(document.getElementsByTagName('Component'))) {
    const node = component.getAttribute('Node');
    const template = childrenNamed(component, 'UseTemplate').find((t) => t.getAttribute('Name') === 'ASOBO_GT_FX');
    if (!node || !template) {
      continue;
    }
    const parameters = new Map<string, string>();
    const ancestors: Element[] = [];
    for (let parent = component.parentElement; parent; parent = parent.parentElement) {
      ancestors.unshift(parent);
    }
    for (const ancestor of ancestors) {
      for (const overrides of childrenNamed(ancestor, 'OverrideTemplateParameters')) {
        Array.from(overrides.children).forEach((p) => parameters.set(p.tagName, (p.textContent ?? '').trim()));
      }
    }
    Array.from(template.children).forEach((p) => parameters.set(p.tagName, (p.textContent ?? '').trim()));
    components.push({
      id: component.getAttribute('ID') ?? '',
      node,
      guid: (parameters.get('FX_GUID') ?? '').toUpperCase(),
      code: parameters.get('FX_CODE') ?? '',
      graphParams: [...parameters.entries()].filter(([key]) => key.startsWith('FX_GRAPH_PARAM_')).map(([, v]) => v),
      offsets: [...parameters.entries()].filter(([key]) => key.startsWith('FX_OFFSET_')).map(([, v]) => v),
    });
  }
  return components;
}

/** Evaluates the RPN subset of the codes: (L:NAME, unit) and (A:NAME, unit) reads, numbers, >, >=, <, and, or, ! */
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
  const binary: Record<string, (a: number, b: number) => number> = {
    '>': (a, b) => (a > b ? 1 : 0),
    '>=': (a, b) => (a >= b ? 1 : 0),
    '<': (a, b) => (a < b ? 1 : 0),
    and: (a, b) => (a && b ? 1 : 0),
    or: (a, b) => (a || b ? 1 : 0),
  };
  for (const token of tokens) {
    const variable = /^\(([LA]:[^,)]+)/.exec(token);
    if (variable) {
      stack.push(variables[variable[1].trim()] ?? 0);
    } else if (token in binary) {
      const b = pop();
      const a = pop();
      stack.push(binary[token](a, b));
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

/** The GUIDs of the effects of a file shown on a node with the given variables (flyPad switch on unless given) */
function effectsShownOn(file: string, node: string, variables: Record<string, number>): string[] {
  const withSwitch = { [SITUATION_FX_SWITCH]: 1, ...variables };
  return fxComponents(file)
    .filter((fx) => fx.node === node && evaluate(fx.code, withSwitch))
    .map((fx) => fx.guid);
}

/** The drip and plume effects shown at a jettison outlet */
function jettisonEffectsOn(node: string, variables: Record<string, number>): string[] {
  return effectsShownOn(WINGS_BEHAVIOR_XML, node, variables).filter((guid) =>
    [FUEL_LEAK_SLOW, FUEL_LEAK_FAST, BALLAST_HIGH_SPEED, BALLAST_LOW_SPEED].includes(guid),
  );
}

/** The drip components of the wings part */
function dripComponents(): FxComponent[] {
  return fxComponents(WINGS_BEHAVIOR_XML).filter((fx) => [FUEL_LEAK_SLOW, FUEL_LEAK_FAST].includes(fx.guid));
}

/** A jettison in progress through the given valves (FuelJettison.ts outputs), on the ground or in flight, at a TAS */
function jettison(valves: number[], onGround: boolean, trueAirspeedKnots: number): Record<string, number> {
  return {
    'L:A380X_FUEL_JETTISON_IN_PROGRESS': 1,
    ...Object.fromEntries(valves.map((valve) => [`A:FUELSYSTEM VALVE OPEN:${valve}`, 1])),
    'A:SIM ON GROUND': onGround ? 1 : 0,
    'A:AIRSPEED TRUE': trueAirspeedKnots,
  };
}

describe('A380X fuel jettison drip on the ground (A380_WINGS.xml FUEL_JETTISON_GROUND_DRIP_FX)', () => {
  it('has a slow and a fast drip at each jettison outlet', () => {
    expect(dripComponents().map((fx) => [fx.node, fx.guid])).toEqual([
      ['FX_JETTISON_LH', FUEL_LEAK_SLOW],
      ['FX_JETTISON_LH', FUEL_LEAK_FAST],
      ['FX_JETTISON_RH', FUEL_LEAK_SLOW],
      ['FX_JETTISON_RH', FUEL_LEAK_FAST],
    ]);
  });

  it('hangs the drips with no offset (FX offsets proved unreliable on the jettison plume)', () => {
    for (const fx of dripComponents()) {
      expect(fx.offsets.every((offset) => Number(offset) === 0)).toBe(true);
    }
  });

  it('gives the graph its FuelLeak_Active parameter, with the same condition as the effect', () => {
    for (const fx of dripComponents()) {
      expect(fx.graphParams).toEqual([`${FUEL_LEAK_GRAPH_PARAM}, ${fx.code}`]);
    }
  });

  it('drips at the outlet of each open valve on the ground, next to the low-speed plume', () => {
    for (const outlet of JETTISON_OUTLETS) {
      for (const other of JETTISON_OUTLETS) {
        expect(jettisonEffectsOn(other.node, jettison([outlet.valve], true, 0))).toEqual(
          other === outlet ? [FUEL_LEAK_SLOW, BALLAST_LOW_SPEED] : [],
        );
      }
    }
    for (const outlet of JETTISON_OUTLETS) {
      expect(jettisonEffectsOn(outlet.node, jettison([57, 58], true, 5))).toEqual([FUEL_LEAK_SLOW, BALLAST_LOW_SPEED]);
    }
  });

  it('switches to the fast drip from 40 kt TAS on the ground, as Asobo switches its leak and ballast effects', () => {
    expect(jettisonEffectsOn('FX_JETTISON_LH', jettison([57, 58], true, 39.9))).toEqual([
      FUEL_LEAK_SLOW,
      BALLAST_LOW_SPEED,
    ]);
    expect(jettisonEffectsOn('FX_JETTISON_RH', jettison([57, 58], true, 40))).toEqual([
      FUEL_LEAK_FAST,
      BALLAST_HIGH_SPEED,
    ]);
  });

  it('does not drip in flight: the plume alone shows (unchanged)', () => {
    for (const outlet of JETTISON_OUTLETS) {
      expect(jettisonEffectsOn(outlet.node, jettison([57, 58], false, 250))).toEqual([BALLAST_HIGH_SPEED]);
    }
  });

  it('does not drip without a jettison in progress, even with a valve stuck open', () => {
    const valveStuckOpen = { ...jettison([57, 58], true, 0), 'L:A380X_FUEL_JETTISON_IN_PROGRESS': 0 };
    for (const outlet of JETTISON_OUTLETS) {
      expect(jettisonEffectsOn(outlet.node, valveStuckOpen)).toEqual([]);
    }
  });

  it('drips with the plume whatever the flyPad Situation Visual Effects switch (not a situation effect)', () => {
    const switchOff = { ...jettison([57, 58], true, 0), [SITUATION_FX_SWITCH]: 0 };
    for (const outlet of JETTISON_OUTLETS) {
      expect(jettisonEffectsOn(outlet.node, switchOff)).toEqual([FUEL_LEAK_SLOW, BALLAST_LOW_SPEED]);
    }
  });
});
