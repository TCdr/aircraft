// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The inputs of an ENG 1(2) FIRE or APU FIRE warning */
export interface FireWarningInputs {
  /** The FIRE TEST pb of that fire zone is pressed (or its test is extended, flyPad realism option) */
  fireTest: boolean;
  /** The fire detection reports a fire in that zone */
  fireDetected: boolean;
}

/**
 * Whether an ENG 1(2) FIRE or APU FIRE warning is shown. A320 FCOM DSC-26-20-10: "A fire warning appears, if: Both
 * loops A and B send a fire signal [...] or A test is performed on the FIRE panel". Releasing the FIRE pb is an action
 * of the fire procedure (it closes the valves and arms the squibs), it does not raise the warning.
 * @param inputs the fire test and fire detection of the zone
 * @returns true when the warning is shown
 */
export function isFireWarningActive(inputs: FireWarningInputs): boolean {
  return inputs.fireTest || inputs.fireDetected;
}

/**
 * Whether the continuous repetitive chime of an ENG 1(2) FIRE or APU FIRE warning sounds. Like any red warning it is
 * cancelled with the MASTER WARN pb (FCOM DSC-31-10, handled by the FWC aural logic); pushing the FIRE pb also
 * "Silences the aural fire warning" (FCOM DSC-26-20-20 ENG FIRE PB and APU FIRE PB).
 * @param inputs the fire test and fire detection of the zone, and whether its FIRE pb is pushed (released out)
 * @returns true when the warning asks for the chime
 */
export function isFireAuralActive(inputs: FireWarningInputs & { fireButtonPushed: boolean }): boolean {
  return isFireWarningActive(inputs) && !inputs.fireButtonPushed;
}
