// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** Seconds per passenger for each boarding rate setting; the payload system splits this over the open doors */
const SECONDS_PER_PASSENGER: { [rate: string]: number } = { REAL: 5, FAST: 1, INSTANT: 0 };
const CARGO_WEIGHT_PER_STEP_KG = 60;

export const boardingSeconds = (i: {
  boardingRate: string;
  doorsOpen: number;
  paxDifference: number;
  cargoDifferenceKg: number;
}): number => {
  const secondsPerStep = (SECONDS_PER_PASSENGER[i.boardingRate] ?? 0) / Math.max(i.doorsOpen, 1);
  return Math.max(i.paxDifference * secondsPerStep, (i.cargoDifferenceKg / CARGO_WEIGHT_PER_STEP_KG) * secondsPerStep);
};
