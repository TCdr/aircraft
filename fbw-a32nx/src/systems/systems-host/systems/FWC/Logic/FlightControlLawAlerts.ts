// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * Conditional lines of the F/CTL law and ELAC alerts. Each function returns the line indexes of the alert's
 * codesToReturn (EwdMessages), null for a hidden line, as the PseudoFWC whichCodeToReturn expects.
 */

/**
 * F/CTL ALTN LAW (EwdMessages 270039001-007 and 270037501-007: title, (PROT LOST), MAX SPEED 320 KT, MAX SPEED
 * 320/.77, MANEUVER WITH CARE, MAX FL 350, SPD BRK DO NOT USE).
 * MAX SPEED is 320 KT, or 320/.77 with a dual hydraulic low pressure; SPD BRK DO NOT USE only with a left or right
 * elevator fault. The procedure has no MANEUVER WITH CARE line (that one belongs to
 * DIRECT LAW) and no MAX FL line.
 * @param dualHydraulicLowPressure two hydraulic systems are at low pressure
 * @param speedBrakeDoNotUse the left or the right elevator is lost (FlightControlSurfaceAlerts leftOrRightElevatorLost),
 * not the FCDC "SPD BRK 3+4" bit (Fcdc.cpp efcsStatus5 bit 27), which is the SEC 1 / SPLR FAULT condition
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
 * The procedure is (PROT LOST), MAX SPEED 320/.77, MAN PITCH TRIM USE, MANEUVER WITH CARE, USE SPD BRK WITH CARE: no
 * SPD BRK DO NOT USE line, it would contradict USE SPD BRK WITH CARE.
 * MAN PITCH TRIM USE is not shown with the green and yellow systems at low pressure: the THS cannot move then.
 * @param greenAndYellowLowPressure the green and yellow hydraulic systems are both at low pressure
 * @returns the line indexes, null for a hidden line
 */
export function directLawLines(greenAndYellowLowPressure: boolean): (number | null)[] {
  return [0, 1, 2, greenAndYellowLowPressure ? null : 3, 4, null, 6, null];
}

/**
 * F/CTL ELAC 1(2) FAULT (EwdMessages 2700110xx / 2700120xx: title, -ELAC OFF THEN ON, .IF UNSUCCESSFUL, -ELAC OFF,
 * FUEL CONSUMPT INCRSD, FMS PRED UNRELIABLE).
 * Some sidestick transducer failures trigger ELAC 1(2) FAULT without the procedure. Design choice: the two
 * consequence lines follow the procedure lines (both hidden in the sidestick transducer case).
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
