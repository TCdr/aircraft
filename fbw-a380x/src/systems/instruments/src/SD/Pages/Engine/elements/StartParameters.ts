// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * Which block the bottom of an SD ENGINE page column shows: the start parameters (ignition, start valve, starter inlet
 * pressure) or the nacelle temperature.
 * A380 FCOM DSC-70-90 START PARAMETERS (a380_fcom.txt l.113430): "During the engine start sequence, the start
 * indications replace the nacelle temperature indications." IGNITION (l.113443-113444): "The igniter A(B) is energized." /
 * "Both igniters A and B are energized." The FADEC writes which igniters are energized
 * (L:A32NX_FADEC_IGNITER_A_ACTIVE_ENGn and L:A32NX_FADEC_IGNITER_B_ACTIVE_ENGn).
 *
 * As before, the start parameters show during a start and with the ENG START selector at IGN START.
 * Design choice: they also show while the FADEC energizes an igniter by itself with the selector at NORM (auto relight
 * after a flameout, quick relight, in-flight relight): the FCOM ignition indication would otherwise never be seen then.
 */

/**
 * @param starting the engine start sequence runs (start valve open, selector at IGN START, below the end of start)
 * @param ignStartSelected the ENG START selector is at IGN START
 * @param igniterA igniter A is energized
 * @param igniterB igniter B is energized
 * @returns whether the start parameters replace the nacelle temperature
 */
export function startParametersVisible(
  starting: boolean,
  ignStartSelected: boolean,
  igniterA: boolean,
  igniterB: boolean,
): boolean {
  return starting || ignStartSelected || igniterA || igniterB;
}

/**
 * @param starterValveOpen the start valve is open
 * @param ignStartSelected the ENG START selector is at IGN START
 * @param igniterA igniter A is energized
 * @param igniterB igniter B is energized
 * @returns whether the nacelle temperature shows
 */
export function nacelleTemperatureVisible(
  starterValveOpen: boolean,
  ignStartSelected: boolean,
  igniterA: boolean,
  igniterB: boolean,
): boolean {
  return !starterValveOpen && !ignStartSelected && !igniterA && !igniterB;
}
