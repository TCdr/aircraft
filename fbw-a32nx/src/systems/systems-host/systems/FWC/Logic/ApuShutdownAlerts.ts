// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * APU AUTO SHUT DOWN and APU EMER SHUT DOWN (A320 FCOM PRO-ABN-APU APU AUTO (EMER) SHUT DOWN, a320_fcom.txt
 * l.71082-71114). The triggers come from the common APU electronic control box (fbw-common apu/electronic_control_box.rs
 * write()): L:A32NX_APU_IS_AUTO_SHUTDOWN (a fault other than a fire: fuel low pressure, DC power loss, ECB failure,
 * overspeed, low oil pressure, high oil temperature) and
 * L:A32NX_APU_IS_EMERGENCY_SHUTDOWN (the APU FIRE pb released, or an APU fire on ground). Both end when the ECB goes off
 * after the MASTER SW OFF action.
 */

export interface ApuShutdownInputs {
  /** L:A32NX_APU_IS_AUTO_SHUTDOWN */
  readonly autoShutdown: boolean;
  /** L:A32NX_APU_IS_EMERGENCY_SHUTDOWN */
  readonly emergencyShutdown: boolean;
  /** The APU FIRE warning is active */
  readonly apuFireWarning: boolean;
}

/**
 * l.71092-71100: "The APU AUTO SHUT DOWN alert triggers when an automatic shutdown of the APU occurs for a reason other
 * than a fire. The APU EMER SHUT DOWN triggers when the APU SHUT OFF sw on the External Power Panel is pushed or, the
 * APU FIRE pb is pushed or, an APU fire on ground is detected."
 * Design choice: no EMER SHUT DOWN while the APU FIRE warning is shown, whose procedure has the MASTER SW OFF line too
 * (EwdMessages 260003005). The ECB has no APU SHUT OFF sw input.
 * @param inputs the ECB outputs and the APU FIRE warning
 * @returns the two alerts
 */
export function apuShutdownAlerts(inputs: ApuShutdownInputs): { autoShutdown: boolean; emergencyShutdown: boolean } {
  return {
    autoShutdown: inputs.autoShutdown && !inputs.emergencyShutdown,
    emergencyShutdown: inputs.emergencyShutdown && !inputs.apuFireWarning,
  };
}

/**
 * The lines of both alerts (EwdMessages 4900101xx / 4900102xx): 0 title, 1 -MASTER SW OFF (l.71106).
 * @param masterSwOn the APU MASTER SW is ON
 * @returns the line indexes, null for a hidden line
 */
export function apuShutdownLines(masterSwOn: boolean): (number | null)[] {
  return [0, masterSwOn ? 1 : null];
}

/** STATUS (l.71110-71114): INOP SYS APU */
export const APU_SHUTDOWN_INOP_SYS = ['490300001'];
