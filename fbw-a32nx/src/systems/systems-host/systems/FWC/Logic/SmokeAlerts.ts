// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * The cargo and avionics smoke alerts of the FWC, from the smoke protection of systems.wasm (fbw-common
 * fire_protection/smoke_detection.rs and cargo_fire_extinguishing.rs, a320_systems fire_protection.rs):
 * - L:A32NX_SMOKE_FWD_CARGO_DETECTED, L:A32NX_SMOKE_AFT_CARGO_DETECTED, L:A32NX_SMOKE_AVIONICS_DETECTED (the SMOKE
 *   warnings, the avionics one already confirmed for 5 s, a320_fcom.txt l.38775)
 * - L:A32NX_SMOKE_FWD_CARGO_DET_FAULT, L:A32NX_SMOKE_AFT_CARGO_DET_FAULT (both detection loops of the compartment
 *   inoperative)
 * - L:A32NX_CARGOSMOKE_BOTTLE_1_LOW_PRESSURE (the single cargo bottle lost its agent)
 */

export interface SmokeAlertInputs {
  readonly fwdCargoSmokeDetected: boolean;
  readonly aftCargoSmokeDetected: boolean;
  readonly avionicsSmokeDetected: boolean;
  /** The CARGO SMOKE TEST pb (L:A32NX_FIRE_TEST_CARGO): it displays the FWD CARGO SMOKE warning, as before */
  readonly cargoSmokeTest: boolean;
  readonly fwdCargoDetectionFault: boolean;
  readonly aftCargoDetectionFault: boolean;
  readonly cargoBottleLowPressure: boolean;
}

export interface SmokeAlerts {
  /** SMOKE FWD CARGO SMOKE (PRO-ABN-SMOKE, l.95244-95250): "smoke in the FWD cargo compartment is detected" */
  readonly fwdCargoSmoke: boolean;
  /** SMOKE AFT CARGO SMOKE (l.95111-95117): "smoke in the AFT cargo compartment is detected" */
  readonly aftCargoSmoke: boolean;
  /** SMOKE FWD CRG DET FAULT (l.95378-95384): "the FWD smoke detection is failed" */
  readonly fwdCrgDetFault: boolean;
  /** SMOKE AFT CRG DET FAULT (l.95203-95214): "the AFT smoke detection is failed" */
  readonly aftCrgDetFault: boolean;
  /**
   * SMOKE FWD (AFT) CRG BTL 1 FAULT (l.95345-95358): "FWD or AFT bottle 1 (2) squib is failed, or FWD or AFT bottle
   * 1 (2) is at low pressure". The A320 here has one bottle with two discharge heads (FCOM DSC-26-50-10, l.38932-38935):
   * its low pressure is the bottle 1 fault of both compartments ("If bottle 1 is lost, fire extinguishing capability is
   * lost in the FWD(AFT) cargo compartment", l.95354-95355). The squibs cannot fail here.
   */
  readonly fwdCrgBtlFault: boolean;
  readonly aftCrgBtlFault: boolean;
  /** AVIONICS SMOKE (PRO-ABN-AVNCS, l.72102-72108): "smoke in the ventilation extraction duct is detected" */
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
 * The lines of SMOKE FWD (AFT) CARGO SMOKE (EwdMessages 2600150xx / 2600160xx, FCOM l.95137-95170 and l.95269-95300):
 * 0 title, 1 -FWD (AFT) ISOL VALVE OFF, 2 -CAB FANS OFF, 3 .IF FWD (AFT) CARG CLOSED:, 4 -AGENT DISCH, 5 .WHEN ON
 * GROUND:, 6 BEFORE OPEN CRG DOORS:, 7 .BEFORE OPEN CRG DOORS:, 8 -PAX DISEMBARK.
 * Line 1 stays hidden: "(IF NOT AUTOMATICALLY CLOSED)" and the A320 here has no cargo ventilation. "IF FWD (AFT) CRG
 * CLOSED (displayed on ground only)" in flight phases 1 and 10, as before. "In flight: WHEN ON GROUND BEFORE OPEN CRG
 * DOORS: PAX DISEMBARK", "On ground: BEFORE OPEN CRG DOORS: PAX DISEMBARK".
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

/** STATUS INOP SYS of SMOKE FWD CRG DET FAULT (l.95388-95392): FWD CRG DET */
export const FWD_CRG_DET_FAULT_INOP_SYS = ['260300010'];

/** STATUS INOP SYS of SMOKE AFT CRG DET FAULT (l.95236-95240): AFT CRG DET */
export const AFT_CRG_DET_FAULT_INOP_SYS = ['260300011'];
