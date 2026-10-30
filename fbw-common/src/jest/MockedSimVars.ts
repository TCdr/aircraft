// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { vi } from 'vitest';

/** The values of the simvars of a test, by name; a boolean is read as 1 or 0, as the sim returns numbers */
export type MockedSimVarValues = Map<string, number | boolean | string>;

/** The registered simvars (SimVar.GetRegisteredId) are numbered in the order they are first asked for */
const registeredNames: string[] = [];
const registeredUnits: string[] = [];

/**
 * Makes the SimVar functions read and write the values, both by name (SimVar.GetSimVarValue, SetSimVarValue) and by
 * registered id (RegisteredSimVar). The registered ids stay the same across calls, as classes keep the ids they get.
 * @param values the values of the simvars, shared with the test
 * @returns the spies of the reads and writes by name, to check that code only uses registered simvars once it is built
 */
export function mockSimVars(values: MockedSimVarValues) {
  const getSimVarValue = vi.spyOn(SimVar, 'GetSimVarValue').mockImplementation((name: string) => values.get(name) ?? 0);
  const setSimVarValue = vi
    .spyOn(SimVar, 'SetSimVarValue')
    .mockImplementation((name: string, _unit: string, value: number | boolean) => {
      values.set(name, value);
      return Promise.resolve();
    });

  (SimVar as any).GetRegisteredId = (name: string, unit: string) => {
    let id = registeredNames.indexOf(name);
    if (id < 0) {
      id = registeredNames.push(name) - 1;
      registeredUnits[id] = unit;
    }
    return id;
  };
  (SimVar as any).GetSimVarValueFastReg = (id: number) => Number(values.get(registeredNames[id]) ?? 0);
  (SimVar as any).GetSimVarValueFastRegString = (id: number) => String(values.get(registeredNames[id]) ?? '');
  (Coherent as any).call = (_method: string, id: number, value: number | string) => {
    // a boolean is written as 1 or 0, and read back as true or false by the tests
    values.set(registeredNames[id], registeredUnits[id] === 'bool' && typeof value === 'number' ? value > 0 : value);
    return Promise.resolve();
  };

  return { getSimVarValue, setSimVarValue };
}
