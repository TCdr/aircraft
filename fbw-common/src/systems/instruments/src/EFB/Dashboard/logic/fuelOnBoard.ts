// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The A32NX fuel on board as its Fuel page counts it: the sum of the tanks it refuels. The sim's own total quantity
 * does not match those tanks in this aircraft (a cold aircraft showed 99,990 kg).
 * @param tankGallons the five tanks (centre, both mains, both aux), gallons
 * @param kilogramsPerGallon 0 until the sim has given it: nothing on board is known yet
 */
export const a32nxFuelOnBoardKg = (tankGallons: number[], kilogramsPerGallon: number): number => {
  if (!(kilogramsPerGallon > 0)) {
    return 0;
  }
  const gallons = tankGallons.reduce((sum, tank) => sum + Math.max(tank, 0), 0);
  return gallons * kilogramsPerGallon;
};
