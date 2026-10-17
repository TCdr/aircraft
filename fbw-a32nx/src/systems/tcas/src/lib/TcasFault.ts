// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The inputs of the TCAS fault logic (TcasComputer.updateStatusFaults). */
export interface TcasFaultInputs {
  /** The pressure altitude of the selected ADR is valid (normal operation or functional test) */
  pressureAltitudeValid: boolean;
  /** The selected radio altimeter reports a failure */
  radioAltitudeFailed: boolean;
  /** The TCAS computer is powered */
  powered: boolean;
  /** The TCAS computer has an internal failure (flyPad failure A320Failure.TcasComputer, 34060) */
  internalFailure: boolean;
}

/**
 * Whether the TCAS cannot deliver RA data or has an internal failure, out of standby: amber TCAS on the PFD and the ND,
 * ECAM NAV TCAS FAULT.
 * @param inputs the fault logic inputs
 * @returns true when the TCAS fault is shown
 */
export function isTcasFault(inputs: TcasFaultInputs): boolean {
  return !inputs.pressureAltitudeValid || inputs.radioAltitudeFailed || !inputs.powered || inputs.internalFailure;
}
