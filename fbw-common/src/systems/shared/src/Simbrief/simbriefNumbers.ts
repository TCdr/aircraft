// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * @param value a field of the SimBrief JSON, a number or a numeric text
 * @returns the number, undefined when the OFP does not have the field or it is not numeric
 */
export const optionalNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};
