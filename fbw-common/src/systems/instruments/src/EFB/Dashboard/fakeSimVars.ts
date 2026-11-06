// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

// A stand-in for the sim's SimVar API in specs. The ids stay the same for the whole spec file because the readers
// register their id once, on their first read.
const idOfName = new Map<string, number>();
const nameOfId: string[] = [];

/**
 * Installs a SimVar whose values come from `values` (0 for a name that is not in it). Reads by name are counted, as the
 * polls under test must read through registered ids.
 */
export const installFakeSimVars = (values: Record<string, number>): { byNameReads: () => number } => {
  let byNameReads = 0;
  SimVar.GetRegisteredId = (name: string) => {
    if (!idOfName.has(name)) {
      idOfName.set(name, nameOfId.length);
      nameOfId.push(name);
    }
    return idOfName.get(name) as number;
  };
  SimVar.GetSimVarValueFastReg = (id: number) => values[nameOfId[id]] ?? 0;
  SimVar.GetSimVarValue = (name: string) => {
    byNameReads++;
    return values[name] ?? 0;
  };
  return { byNameReads: () => byNameReads };
};
