// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The alerts and configurations that select the TCAS TA ONLY mode automatically */
export interface TcasAutoTaOnlyInputs {
  /** The reactive WINDSHEAR warning is on */
  windshearWarning: boolean;
  /** The FWS STALL warning is on */
  stallWarning: boolean;
  /** The aircraft is in emergency electrical configuration (AC 1 to AC 4 busbars lost) */
  emergencyElectricalConfiguration: boolean;
}

/**
 * Automatic selection of the TA ONLY mode: during a windshear, stall or TAWS alert (the TCAS returns to TA/RA when the
 * alert ends) and in emergency electrical configuration.
 * The TAWS alerts (they also inhibit the TA aural) and the below 1000 ft (+-100 ft) condition are handled by
 * LegacyTcasComputer.updateInhibitions itself.
 * @param inputs the windshear / stall warnings and the electrical configuration
 * @returns true when the TCAS must be in TA ONLY mode (all RAs inhibited) for one of these reasons
 */
export function isTcasAutoTaOnly(inputs: TcasAutoTaOnlyInputs): boolean {
  return inputs.windshearWarning || inputs.stallWarning || inputs.emergencyElectricalConfiguration;
}
