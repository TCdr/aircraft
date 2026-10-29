// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * APU FAULT of the A380X FWS, from the APU electronic control box (fbw-common apu/electronic_control_box.rs write()):
 * L:A32NX_APU_IS_EMERGENCY_SHUTDOWN (the APU FIRE pb released, or an APU fire on ground) and
 * L:A32NX_APU_IS_AUTO_SHUTDOWN (any other ECB fault: fuel low pressure, DC power loss, ECB failure, overspeed, oil low
 * pressure, oil high temperature on ground). Both end when the ECB goes off after the APU MASTER SW OFF action.
 * Not simulated: a failure the ECB detects while the APU stays available, and the failed start above FL 150: the ECB
 * tells neither apart, so their lines stay hidden.
 */

export const APU_FAULT_PHASE_INHIBITION = [3, 4, 5, 6, 7, 9, 10];

/** STATUS INOP SYS ALL PHASES: APU */
export const APU_FAULT_INOP_SYS = ['490300001'];

export interface ApuFaultInputs {
  readonly emergencyShutdown: boolean;
  readonly autoShutdown: boolean;
  /** The APU FIRE warning is shown (its own procedure has the APU MASTER SW ... OFF line) */
  readonly apuFireWarning: boolean;
}

/**
 * APU FAULT: an APU emergency or automatic shutdown.
 * Design choice: not while the APU FIRE warning is shown, whose procedure already shuts the APU down; the APU FAULT
 * follows it when the fire is out and the MASTER SW is still ON.
 * @param inputs the ECB outputs and the APU FIRE warning
 * @returns whether the alert condition is true
 */
export function isApuFault(inputs: ApuFaultInputs): boolean {
  return (inputs.emergencyShutdown || inputs.autoShutdown) && !inputs.apuFireWarning;
}

/**
 * The lines of APU FAULT (ata46-49-52-56.ts 490800001):
 * 0 EMER SHUTDOWN, 1 APU MASTER SW OFF, 2 AUTO SHUTDOWN, 3 APU MASTER SW OFF, 4 IF APU START FAILED AND FL > 150,
 * 5 BELOW FL 150 : TRY A NEW APU START, 6 IF APU NOT ABSOLUTELY RQRD, 7 APU MASTER SW OFF.
 * @param inputs the ECB outputs
 * @returns which lines are shown
 */
export function apuFaultItemsToShow(inputs: ApuFaultInputs): boolean[] {
  const emergency = inputs.emergencyShutdown;
  const auto = inputs.autoShutdown && !emergency;
  return [emergency, emergency, auto, auto, false, false, false, false];
}

/**
 * @param masterSwOn the APU MASTER SW is ON
 * @returns which lines are done (the three APU MASTER SW ... OFF lines)
 */
export function apuFaultItemsChecked(masterSwOn: boolean): boolean[] {
  return [false, !masterSwOn, false, !masterSwOn, false, false, false, !masterSwOn];
}

/** APU MACH LIMIT EXCEEDED: active in flight phase 8 only */
export const APU_MACH_LIMIT_PHASE_INHIBITION = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12];

export const APU_OIL_FILTER_CLOGGED_PHASE_INHIBITION = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

const APU_MACH_LIMIT = 0.5;

/**
 * APU MACH LIMIT EXCEEDED: the APU is running above M 0.5. SC, MASTER CAUT, APU SD page; STATUS INOP SYS ALL PHASES:
 * APU.
 * @param apuRunning the APU is running (its AVAIL indication)
 * @param mach the Mach number of the ADR used by the FWS
 * @returns whether the alert condition is true
 */
export function isApuMachLimitExceeded(apuRunning: boolean, mach: number): boolean {
  return apuRunning && mach > APU_MACH_LIMIT;
}

/**
 * The lines of APU MACH LIMIT EXCEEDED (ata46-49-52-56.ts 490800002): 0 IF APU NOT ABSOLUTELY RQRD,
 * 1 APU MASTER SW OFF. Keeping the APU only with ENG ALL ENGs FLAME OUT is a crew note: both lines are always shown.
 * @param masterSwOn the APU MASTER SW is ON
 * @returns which lines are done
 */
export function apuMachLimitItemsChecked(masterSwOn: boolean): boolean[] {
  return [false, !masterSwOn];
}

/**
 * APU OIL FILTER CLOGGED: an APU oil filter clogging is impending, the APU is still available. Crew awareness, no
 * audio and no master light. Fed by its flyPad failure (A380Failure.ApuOilFilterClogging).
 * Design choice: the filter differential pressure exists only with oil flowing, so the alert shows while the APU runs.
 * Not simulated: the automatic shutdown of a fully clogged filter.
 * @param cloggingFailure the flyPad failure is active
 * @param apuRunning the APU is running (its AVAIL indication)
 * @returns whether the alert condition is true
 */
export function isApuOilFilterClogged(cloggingFailure: boolean, apuRunning: boolean): boolean {
  return cloggingFailure && apuRunning;
}
