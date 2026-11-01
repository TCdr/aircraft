// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * A stand-in for the FMC and display services: every property and call returns another stand-in, so that the page
 * builds without a running FMS
 * @returns the stand-in
 */
export function anything(): any {
  return new Proxy(function () {}, {
    get(_target, property) {
      if (property === Symbol.toPrimitive) {
        return () => 0;
      }
      if (property === Symbol.iterator) {
        return [][Symbol.iterator].bind([]);
      }
      if (property === 'then') {
        return undefined;
      }
      return anything();
    },
    apply: () => anything(),
  });
}

/**
 * Adds stand-ins for every property the given object does not define
 * @param known the properties the test needs
 * @returns the object with stand-ins for the rest
 */
export function withStandIns<T extends object>(known: T): T {
  return new Proxy(known, { get: (target: any, property) => (property in target ? target[property] : anything()) });
}
