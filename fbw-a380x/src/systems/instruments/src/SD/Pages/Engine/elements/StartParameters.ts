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
 * Design choice: they also show while the FADEC reports a start valve fault, so that the amber start valve of the FCOM
 * (START VALVE, l.113452-113462) is seen with the selector back at NORM, e.g. a valve stuck open after the start.
 */

/**
 * The start valve fault the FADEC detects, L:A32NX_ENGINE_n_START_VALVE_FAULT (systems::engine::engine_start::
 * StartValveFault): the valve position disagrees with its command for 5 s.
 */
export enum StartValveFault {
  None = 0,
  /** ENG 1(2)(3)(4) START VLV FAULT - VLV STUCK CLOSED: the valve is abnormally closed */
  NotOpen = 1,
  /** ENG 1(2)(3)(4) START VLV FAULT - START VLV NOT CLOSED: the valve is abnormally open */
  NotClosed = 2,
}

/**
 * The colour of the start valve symbol. A380 FCOM DSC-70-90 START VALVE (a380_fcom.txt l.113452-113462): green open or
 * closed, amber when "The start valve is abnormally open" (START VLV NOT CLOSED) or "abnormally closed" (VLV STUCK
 * CLOSED). The FCOM figures show the symbol amber, its in-line stubs stay green.
 * @param fault L:A32NX_ENGINE_n_START_VALVE_FAULT
 * @returns the colour class of the valve symbol
 */
export function startValveColour(fault: number): 'Green' | 'Amber' {
  return fault === StartValveFault.NotOpen || fault === StartValveFault.NotClosed ? 'Amber' : 'Green';
}

/**
 * @param starting the engine start sequence runs (start valve open, selector at IGN START, below the end of start)
 * @param ignStartSelected the ENG START selector is at IGN START
 * @param igniterA igniter A is energized
 * @param igniterB igniter B is energized
 * @param startValveFault the FADEC reports a start valve fault (L:A32NX_ENGINE_n_START_VALVE_FAULT not 0)
 * @returns whether the start parameters replace the nacelle temperature
 */
export function startParametersVisible(
  starting: boolean,
  ignStartSelected: boolean,
  igniterA: boolean,
  igniterB: boolean,
  startValveFault = false,
): boolean {
  return starting || ignStartSelected || igniterA || igniterB || startValveFault;
}

/**
 * @param starterValveOpen the start valve is open
 * @param ignStartSelected the ENG START selector is at IGN START
 * @param igniterA igniter A is energized
 * @param igniterB igniter B is energized
 * @param startValveFault the FADEC reports a start valve fault (L:A32NX_ENGINE_n_START_VALVE_FAULT not 0)
 * @returns whether the nacelle temperature shows
 */
export function nacelleTemperatureVisible(
  starterValveOpen: boolean,
  ignStartSelected: boolean,
  igniterA: boolean,
  igniterB: boolean,
  startValveFault = false,
): boolean {
  return !starterValveOpen && !ignStartSelected && !igniterA && !igniterB && !startValveFault;
}
