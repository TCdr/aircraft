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
 * Whether the TCAS cannot deliver RA data, out of standby: amber TCAS on the PFD and the ND, ECAM NAV TCAS FAULT.
 *
 * A320 FCOM DSC-34-SURV-60 PFD indications (a320_fcom.txt:56313-56315): the TCAS message "Appears in amber provided
 * that the TCAS is not in standby, when the TCAS cannot deliver RA data, or in case of an internal TCAS failure"; ND
 * (a320_fcom.txt:56276): "TCAS : Displayed in case of TCAS internal failure"; PRO-ABN-NAV NAV TCAS FAULT
 * (a320_fcom.txt:93888): "This alert triggers when there is an internal failure of the TCAS".
 * @param inputs the fault logic inputs
 * @returns true when the TCAS fault is shown
 */
export function isTcasFault(inputs: TcasFaultInputs): boolean {
  return !inputs.pressureAltitudeValid || inputs.radioAltitudeFailed || !inputs.powered || inputs.internalFailure;
}

/**
 * Whether the TCAS is in standby because it lost its altitude sensors. A320 FCOM DSC-34-SURV-60-20 MEMO DISPLAY
 * (a320_fcom.txt:56377-56383): the green TCAS STBY memo appears when "both ATCs or both RAs are failed" or "In the case
 * of a triple ADR failure". The standby takes precedence over the TCAS fault (TcasComputer.updateStatusFaults).
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
