// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { RegisteredSimVar } from '@flybywiresim/fbw-sdk';

// A read by name makes garbage on every call, and all instruments share one heap: a poll that runs for the life of the
// flyPad reads through a registered id instead. The id is registered on the first read, not when the file loads.

/** Reads a numeric var through its registered id */
export const numberReader = (name: string, unit: string): (() => number) => {
  let simVar: RegisteredSimVar<number> | undefined;
  return () => {
    if (!simVar) {
      simVar = RegisteredSimVar.create(name, unit);
    }
    return simVar.get();
  };
};

/** Reads a var through its registered id as true when it is above 0 */
export const booleanReader = (name: string): (() => boolean) => {
  let simVar: RegisteredSimVar<boolean> | undefined;
  return () => {
    if (!simVar) {
      simVar = RegisteredSimVar.createBoolean(name);
    }
    return simVar.get();
  };
};
