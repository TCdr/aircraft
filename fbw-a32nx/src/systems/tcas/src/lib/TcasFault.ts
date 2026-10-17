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

/**
 * Whether the TCAS is in standby because it lost its altitude sensors: the green TCAS STBY memo also appears when both
 * RAs are failed or on a triple ADR failure. The standby takes precedence over the TCAS fault
 * (TcasComputer.updateStatusFaults).
 * @param radioAltimeter1Failed radio altimeter 1 reports a failure (failure warning SSM, also when unpowered)
 * @param radioAltimeter2Failed radio altimeter 2 reports a failure
 * @param adrAltitudeValid for ADR 1, 2 and 3: the pressure altitude word is valid (normal operation or functional test)
 * @returns whether the TCAS must be in standby
 */
export function isTcasStandbyWithoutAltitudeSensors(
  radioAltimeter1Failed: boolean,
  radioAltimeter2Failed: boolean,
  adrAltitudeValid: readonly boolean[],
): boolean {
  const bothRadioAltimetersFailed = radioAltimeter1Failed && radioAltimeter2Failed;
  const tripleAdrFailure = adrAltitudeValid.every((valid) => !valid);
  return bothRadioAltimetersFailed || tripleAdrFailure;
}
