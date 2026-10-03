// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The part of a tank (or of all tanks) that holds fuel, 0 to 1 (above 1 only when overfilled): 0 while the capacity is
 * not known (0, before the capacity simvars are read), instead of NaN or Infinity (a NaN % headline, full bars).
 */
export const fuelFraction = (quantity: number, capacity: number): number =>
  capacity > 0 ? Math.max(quantity, 0) / capacity : 0;
