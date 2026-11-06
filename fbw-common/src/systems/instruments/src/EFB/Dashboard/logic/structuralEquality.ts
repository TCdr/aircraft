// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * Whether two polled readings hold the same values: numbers, strings and booleans by value, arrays and plain objects
 * field by field. A poll that keeps the previous object when nothing changed lets React skip the render.
 */
export const isStructurallyEqual = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) {
    return true;
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }

  const fieldsA = a as Record<string, unknown>;
  const fieldsB = b as Record<string, unknown>;
  const keysA = Object.keys(fieldsA);
  return (
    keysA.length === Object.keys(fieldsB).length &&
    keysA.every(
      (key) => Object.prototype.hasOwnProperty.call(fieldsB, key) && isStructurallyEqual(fieldsA[key], fieldsB[key]),
    )
  );
};
