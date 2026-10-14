// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Arinc429Word } from '@flybywiresim/fbw-sdk';

/** The FWS output word that carries the STALL warning (FwsCore.ts: fwc1Out126 / fwc2Out126) */
const FWS_STALL_WARNING_WORDS = ['L:A32NX_FWC_1_DISCRETE_WORD_126', 'L:A32NX_FWC_2_DISCRETE_WORD_126'];

/** Bit 17 of the FWS discrete word 126: the STALL warning is on (set by FwsCore.ts from its stallWarning subject) */
const FWS_STALL_WARNING_BIT = 17;

/**
 * Whether the FWS triggers the STALL warning. Read from the output word of either FWS; a failed FWS (SSM failure
 * warning) does not give it.
 * @returns true while the STALL aural / red warning is on
 */
export function isFwsStallWarningActive(): boolean {
  return FWS_STALL_WARNING_WORDS.some((word) =>
    Arinc429Word.fromSimVarValue(word).bitValueOr(FWS_STALL_WARNING_BIT, false),
  );
}

/**
 * Whether the reactive windshear warning is on (the PRIMs write it).
 * @returns true while the WINDSHEAR warning is on
 */
export function isReactiveWindshearWarningActive(): boolean {
  return SimVar.GetSimVarValue('L:A32NX_REACTIVE_WINDSHEAR_WARNING', 'Bool') > 0;
}

/**
 * Emergency electrical configuration: "The AC 1, AC 2, AC 3, and AC 4 busbars are lost" (A380 FCOM ELEC EMER CONFIG,
 * a380_fcom.txt l.141558), the condition FwsCore.ts uses for ELEC EMER CONFIG.
 * @returns true while all four AC busbars are unpowered
 */
export function isEmergencyElectricalConfiguration(): boolean {
  return [1, 2, 3, 4].every((bus) => !(SimVar.GetSimVarValue(`L:A32NX_ELEC_AC_${bus}_BUS_IS_POWERED`, 'Bool') > 0));
}
