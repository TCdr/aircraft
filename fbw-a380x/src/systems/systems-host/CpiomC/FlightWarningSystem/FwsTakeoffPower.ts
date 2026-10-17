// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The take-off power signal of the flight phases (FwsFlightPhases): a thrust lever at take-off power, from its TLA only
 * (the FADECs do not send the take-off power words yet). One function for every engine, so that each engine is judged
 * on its own thrust lever.
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

/**
 * The FLX/MCT detent is a take-off power setting: a FLEX TEMP is entered, or a DOx derated takeoff is selected (a
 * DERATED takeoff from the FMS PERF T.O page is also flown at the FLX-MCT detent).
 * @param flexTemperature L:A32NX_AIRLINER_TO_FLEX_TEMP (0 for no FLEX TEMP)
 * @param takeoffDeratePercent L:A32NX_AIRLINER_TO_DERATE (0 for no derate)
 */
export function reducedTakeoffThrustSet(flexTemperature: number, takeoffDeratePercent: number): boolean {
  return flexTemperature !== 0 || takeoffDeratePercent > 0;
}

/** At least two thrust levers at take-off power (the condition of flight phases 3 to 5) */
export function twoEnginesTakeoffPowerSignal(tlasDegrees: readonly number[], flexTempSet: boolean): boolean {
  return tlasDegrees.filter((tla) => engineTakeoffPowerSignal(tla, flexTempSet)).length >= 2;
}
