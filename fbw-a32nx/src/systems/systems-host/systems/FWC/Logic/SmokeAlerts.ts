// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The cargo and avionics smoke alerts of the FWC, from the smoke protection of systems.wasm (fbw-common
 * fire_protection/smoke_detection.rs and cargo_fire_extinguishing.rs, a320_systems fire_protection.rs):
 * - L:A32NX_SMOKE_FWD_CARGO_DETECTED, L:A32NX_SMOKE_AFT_CARGO_DETECTED, L:A32NX_SMOKE_AVIONICS_DETECTED (the SMOKE
 *   warnings, the avionics one already confirmed for 5 s)
 * - L:A32NX_SMOKE_FWD_CARGO_DET_FAULT, L:A32NX_SMOKE_AFT_CARGO_DET_FAULT (both detection loops of the compartment
 *   inoperative)
 * - L:A32NX_CARGOSMOKE_BOTTLE_1_LOW_PRESSURE (the single cargo bottle lost its agent)
 */

export interface SmokeAlertInputs {
  readonly fwdCargoSmokeDetected: boolean;
  readonly aftCargoSmokeDetected: boolean;
  readonly avionicsSmokeDetected: boolean;
  /** The CARGO SMOKE TEST pb (L:A32NX_FIRE_TEST_CARGO): it displays the FWD CARGO SMOKE warning */
  readonly cargoSmokeTest: boolean;
  readonly fwdCargoDetectionFault: boolean;
  readonly aftCargoDetectionFault: boolean;
  readonly cargoBottleLowPressure: boolean;
}

export interface SmokeAlerts {
  /** SMOKE FWD CARGO SMOKE: smoke is detected in the FWD cargo compartment */
  readonly fwdCargoSmoke: boolean;
  /** SMOKE AFT CARGO SMOKE: smoke is detected in the AFT cargo compartment */
  readonly aftCargoSmoke: boolean;
  /** SMOKE FWD CRG DET FAULT: the FWD smoke detection is failed */
  readonly fwdCrgDetFault: boolean;
  /** SMOKE AFT CRG DET FAULT: the AFT smoke detection is failed */
  readonly aftCrgDetFault: boolean;
  /**
   * SMOKE FWD (AFT) CRG BTL 1 FAULT: a bottle squib is failed or a bottle is at low pressure. The A320 here has one
   * bottle with two discharge heads: its low pressure is the bottle 1 fault of both compartments (bottle 1 lost: no
   * fire extinguishing in the FWD or AFT cargo compartment). The squibs cannot fail here.
   */
  readonly fwdCrgBtlFault: boolean;
  readonly aftCrgBtlFault: boolean;
  /** AVIONICS SMOKE: smoke is detected in the ventilation extraction duct */
  readonly avionicsSmoke: boolean;
}

/**
 * @param inputs the smoke protection outputs of systems.wasm
 * @returns the smoke alerts
 */
export function smokeAlerts(inputs: SmokeAlertInputs): SmokeAlerts {
  return {
    fwdCargoSmoke: inputs.fwdCargoSmokeDetected || inputs.cargoSmokeTest,
    aftCargoSmoke: inputs.aftCargoSmokeDetected,
    fwdCrgDetFault: inputs.fwdCargoDetectionFault,
    aftCrgDetFault: inputs.aftCargoDetectionFault,
    fwdCrgBtlFault: inputs.cargoBottleLowPressure,
    aftCrgBtlFault: inputs.cargoBottleLowPressure,
    avionicsSmoke: inputs.avionicsSmokeDetected,
  };
}

/**
 * The lines of SMOKE FWD (AFT) CARGO SMOKE (EwdMessages 2600150xx / 2600160xx):
 * 0 title, 1 -FWD (AFT) ISOL VALVE OFF, 2 -CAB FANS OFF, 3 .IF FWD (AFT) CARG CLOSED:, 4 -AGENT DISCH, 5 .WHEN ON
 * GROUND:, 6 BEFORE OPEN CRG DOORS:, 7 .BEFORE OPEN CRG DOORS:, 8 -PAX DISEMBARK.
 * Line 1 stays hidden: it is only for a valve not closed automatically, and the A320 here has no cargo ventilation.
 * IF FWD (AFT) CRG CLOSED is shown on ground only, in flight phases 1 and 10. In flight: WHEN ON GROUND BEFORE OPEN CRG
 * DOORS: PAX DISEMBARK; on ground: BEFORE OPEN CRG DOORS: PAX DISEMBARK.
 * @param inputs the cockpit state
 * @returns the line indexes, null for a hidden line
 */
export function cargoSmokeLines(inputs: {
  readonly cabFansOn: boolean;
  readonly flightPhase: number;
  readonly agentDischarged: boolean;
  readonly onGround: boolean;
}): (number | null)[] {
  return [
    0,
    inputs.cabFansOn ? 2 : null,
    [1, 10].includes(inputs.flightPhase) && !inputs.agentDischarged ? 3 : null,
    !inputs.agentDischarged ? 4 : null,
    !inputs.onGround ? 5 : null,
    !inputs.onGround ? 6 : null,
    inputs.onGround ? 7 : null,
    8,
  ];
}

/** STATUS INOP SYS of SMOKE FWD CRG DET FAULT: FWD CRG DET */
export const FWD_CRG_DET_FAULT_INOP_SYS = ['260300010'];

/** STATUS INOP SYS of SMOKE AFT CRG DET FAULT: AFT CRG DET */
export const AFT_CRG_DET_FAULT_INOP_SYS = ['260300011'];
