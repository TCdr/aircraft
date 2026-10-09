// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The take-off power signal of the flight phases (FwsFlightPhases): a thrust lever at take-off power, from its TLA only
 * (the FADECs do not send the take-off power words yet). One function for every engine, so that each engine is judged
 * on its own thrust lever: engine 4 used to read the TLA of lever 3 for its full power check.
 */

/** TLA band of the FLX/MCT detent (35 degrees) */
const MCT_DETENT_MIN_TLA = 33.3;
const MCT_DETENT_MAX_TLA = 36.7;
/** TLA above which the lever is at full power (TOGA detent at 45 degrees) */
const FULL_POWER_MIN_TLA = 43.3;

/**
 * @param tlaDegrees the thrust lever angle of the engine (L:A32NX_AUTOTHRUST_TLA:n)
 * @param flexTempSet a FLEX TEMP is entered (L:A32NX_AIRLINER_TO_FLEX_TEMP not 0)
 * @returns the lever is at take-off power: in the FLX/MCT detent with a FLEX TEMP, at full power, or above the FLX/MCT
 *   detent
 */
export function engineTakeoffPowerSignal(tlaDegrees: number, flexTempSet: boolean): boolean {
  const inMctDetent = tlaDegrees > MCT_DETENT_MIN_TLA && tlaDegrees < MCT_DETENT_MAX_TLA;
  const fullPower = tlaDegrees > FULL_POWER_MIN_TLA;
  const aboveMct = !(tlaDegrees < MCT_DETENT_MAX_TLA);
  return (flexTempSet && inMctDetent) || fullPower || aboveMct;
}

/** At least two thrust levers at take-off power (the condition of flight phases 3 to 5) */
export function twoEnginesTakeoffPowerSignal(tlasDegrees: readonly number[], flexTempSet: boolean): boolean {
  return tlasDegrees.filter((tla) => engineTakeoffPowerSignal(tla, flexTempSet)).length >= 2;
}
