// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

/*
 * A visual effect of the A380X exterior model, as ASOBO_GT_FX components of the behaviour XML of the part that owns
 * its nodes, with their FX_CODE evaluated by a small RPN interpreter for the operators they use:
 * - the contrails (A380_WINGS.xml FX_CONTRAIL_QUAD/RIBBON), each with the running term of its own engine, so that a
 *   flamed out engine leaves no contrail; the fuselage part has none of the engine exhaust nodes and no contrails.
 */
const PARTS_DIR = resolve(
  __dirname,
  '../../../base/flybywire-aircraft-a380-842/SimObjects/AirPlanes/FlyByWire_A380X/attachments/flybywire',
);
const WINGS_BEHAVIOR_XML = resolve(PARTS_DIR, 'Part_Exterior_Wings/model/A380_WINGS.xml');
const FUSELAGE_BEHAVIOR_XML = resolve(PARTS_DIR, 'Part_Exterior_Fuselage/model/A380_Fuselage_Behavior.xml');

/** Stock contrail graphs (SDK Asobo Generic/FX.xml ASOBO_CONTRAIL_QUAD_FX / ASOBO_CONTRAIL_RIBBON_FX) */
const CONTRAIL_QUAD = '{F42CE638-11EB-4FC8-B9B0-111A220D681F}';
const CONTRAIL_RIBBON = '{904EC2CE-F8DD-4480-99E7-B33F7CF6E114}';

/**
 * The exhaust node of each engine in A380_WINGS.gltf (aircraft-large-files), from the node positions: LEFT1 x = +25.9 m
 * (left outer, engine 1), RIGHT2 +15.0 m (left inner, the LOD01 node), RIGHT3 -14.9 m (right inner), RIGHT4 -25.6 m (right outer).
 */
const ENGINE_EXHAUST_NODES = {
  1: 'FX_EXHAUST_LEFT1',
  2: 'FX_EXHAUST_RIGHT2',
  3: 'FX_EXHAUST_RIGHT3',
  4: 'FX_EXHAUST_RIGHT4',
} as const;
const ENGINES = [1, 2, 3, 4] as const;

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

/** The contrail components of a behaviour file */
function contrailComponents(file: string): FxComponent[] {
  return fxComponents(file).filter((fx) => [CONTRAIL_QUAD, CONTRAIL_RIBBON].includes(fx.guid));
}

/** The contrails shown at the exhaust of each engine */
function contrailsShown(variables: Record<string, number>): Record<number, string[]> {
  return Object.fromEntries(
    ENGINES.map((engine) => [
      engine,
      contrailComponents(WINGS_BEHAVIOR_XML)
        .filter((fx) => fx.node === ENGINE_EXHAUST_NODES[engine] && evaluate(fx.code, variables))
        .map((fx) => fx.guid),
    ]),
  );
}

/** The contrails of the 4 engines when they all show: a quad on each engine, a ribbon on engines 2 and 4 */
const ALL_CONTRAILS: Record<number, string[]> = {
  1: [CONTRAIL_QUAD],
  2: [CONTRAIL_QUAD, CONTRAIL_RIBBON],
  3: [CONTRAIL_QUAD],
  4: [CONTRAIL_QUAD, CONTRAIL_RIBBON],
};

/** Contrail conditions met, every engine running: MSFS burns and the FADEC fuel flow is above 0 */
function allEnginesRunningInContrailConditions(): Record<string, number> {
  return {
    'A:CONTRAILS CONDITIONS MET:1': 1,
    ...Object.fromEntries(ENGINES.map((engine) => [`A:GENERAL ENG COMBUSTION:${engine}`, 1])),
    ...Object.fromEntries(ENGINES.map((engine) => [`L:A32NX_ENGINE_FF:${engine}`, 3500])),
  };
}

describe('A380X contrails (A380_WINGS.xml FX_CONTRAIL_QUAD / FX_CONTRAIL_RIBBON)', () => {
  it('shows the contrails of the 4 running engines in contrail conditions', () => {
    expect(contrailsShown(allEnginesRunningInContrailConditions())).toEqual(ALL_CONTRAILS);
  });

  it('shows no contrail outside contrail conditions', () => {
    const noConditions = { ...allEnginesRunningInContrailConditions(), 'A:CONTRAILS CONDITIONS MET:1': 0 };
    expect(contrailsShown(noConditions)).toEqual({ 1: [], 2: [], 3: [], 4: [] });
  });

  it('drops the contrail of a flamed out engine only (fuel cut: no MSFS combustion, FADEC fuel flow 0)', () => {
    for (const engine of ENGINES) {
      const flameout = {
        ...allEnginesRunningInContrailConditions(),
        [`A:GENERAL ENG COMBUSTION:${engine}`]: 0,
        [`L:A32NX_ENGINE_FF:${engine}`]: 0,
      };
      expect(contrailsShown(flameout)).toEqual({ ...ALL_CONTRAILS, [engine]: [] });
    }
  });

  it('drops the contrail when the FADEC fuel flow is 0 although MSFS keeps its combustion flag', () => {
    for (const engine of ENGINES) {
      const combustionFlagKept = { ...allEnginesRunningInContrailConditions(), [`L:A32NX_ENGINE_FF:${engine}`]: 0 };
      expect(contrailsShown(combustionFlagKept)).toEqual({ ...ALL_CONTRAILS, [engine]: [] });
    }
  });

  it('drops the contrail when MSFS no longer burns although the FADEC still runs the engine', () => {
    for (const engine of ENGINES) {
      const msfsFlameout = { ...allEnginesRunningInContrailConditions(), [`A:GENERAL ENG COMBUSTION:${engine}`]: 0 };
      expect(contrailsShown(msfsFlameout)).toEqual({ ...ALL_CONTRAILS, [engine]: [] });
    }
  });

  it('hangs the contrails with no offset', () => {
    for (const fx of contrailComponents(WINGS_BEHAVIOR_XML)) {
      expect(fx.offsets.every((offset) => Number(offset) === 0)).toBe(true);
    }
  });

  it('declares no contrail in the fuselage part, which has none of the engine exhaust nodes', () => {
    expect(contrailComponents(FUSELAGE_BEHAVIOR_XML)).toEqual([]);
    expect(
      fxComponents(FUSELAGE_BEHAVIOR_XML).filter((fx) =>
        (Object.values(ENGINE_EXHAUST_NODES) as string[]).includes(fx.node),
      ),
    ).toEqual([]);
  });
});
