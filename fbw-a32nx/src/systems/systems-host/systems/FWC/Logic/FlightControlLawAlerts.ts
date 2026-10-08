// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * Conditional lines of the F/CTL law and ELAC alerts. Each function returns the line indexes of the alert's
 * codesToReturn (EwdMessages), null for a hidden line, as the PseudoFWC whichCodeToReturn expects.
 */

/**
 * F/CTL ALTN LAW (EwdMessages 270039001-007 and 270037501-007: title, (PROT LOST), MAX SPEED 320 KT, MAX SPEED
 * 320/.77, MANEUVER WITH CARE, MAX FL 350, SPD BRK DO NOT USE).
 * A320 FCOM PRO-ABN-F_CTL F/CTL ALTN LAW (a320_fcom.txt l.82544-82548):
 * "MAX SPEED ... 320 KT (320/.77 if dual hydraulic system low pressure)" and
 * "SPD BRK (IF L OR R ELEVATOR FAULT) ... DO NOT USE". The procedure has no MANEUVER WITH CARE line (that one belongs to
 * DIRECT LAW) and no MAX FL line.
 * @param dualHydraulicLowPressure two hydraulic systems are at low pressure
 * @param speedBrakeDoNotUse the FCDC "speed brake do not use" discrete (L or R elevator fault)
 * @returns the line indexes, null for a hidden line
 */
export function altnLawLines(dualHydraulicLowPressure: boolean, speedBrakeDoNotUse: boolean): (number | null)[] {
  return [
    0,
    1,
    dualHydraulicLowPressure ? null : 2,
    dualHydraulicLowPressure ? 3 : null,
    null,
    null,
    speedBrakeDoNotUse ? 6 : null,
  ];
}

/**
 * F/CTL DIRECT LAW (EwdMessages 270036501-508: title, (PROT LOST), MAX SPEED 320/.77, -MAN PITCH TRIM USE, MANEUVER
 * WITH CARE, MAX FL 350, USE SPD BRK WITH CARE, SPD BRK DO NOT USE).
 * A320 FCOM PRO-ABN-F_CTL F/CTL DIRECT LAW (a320_fcom.txt l.82656-82667): (PROT LOST), MAX SPEED 320/.77,
 * MAN PITCH TRIM USE, MANEUVER WITH CARE, USE SPD BRK WITH CARE. There is no "SPD BRK DO NOT USE" line: it contradicted
 * the USE SPD BRK WITH CARE line next to it.
 * @returns the line indexes, null for a hidden line
 */
export function directLawLines(): (number | null)[] {
  return [0, 1, 2, 3, 4, null, 6, null];
}

/**
 * F/CTL ELAC 1(2) FAULT (EwdMessages 2700110xx / 2700120xx: title, -ELAC OFF THEN ON, .IF UNSUCCESSFUL, -ELAC OFF,
 * FUEL CONSUMPT INCRSD, FMS PRED UNRELIABLE).
 * A320 FCOM PRO-ABN-F_CTL F/CTL ELAC 1(2) FAULT (a320_fcom.txt l.82730-82747): the procedure ends with
 * "FUEL CONSUMPT INCRSD / FMS PRED UNRELIABLE". Note 1 of the FCOM: "In some sidestick transducer failure cases,
 * ELAC 1(2) FAULT is triggered without the procedure". Design choice: the two consequence lines follow the procedure
 * lines (both hidden in the sidestick transducer case). They were never shown: their subject was never set.
 * @param procedureShown the ELAC itself failed (FAULT light on), so the procedure is shown
 * @returns the line indexes, null for a hidden line
 */
export function elacFaultLines(procedureShown: boolean): (number | null)[] {
  return [
    0,
    procedureShown ? 1 : null,
    procedureShown ? 2 : null,
    procedureShown ? 3 : null,
    procedureShown ? 4 : null,
    procedureShown ? 5 : null,
  ];
}
