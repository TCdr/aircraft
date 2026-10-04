// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The fire detection fault cautions of one fire zone (ENG 1, ENG 2 or APU) */
export interface FireDetectionFaultAlerts {
  /** ENG 1(2) FIRE LOOP A FAULT, APU FIRE LOOP A FAULT */
  loopAFault: boolean;
  /** ENG 1(2) FIRE LOOP B FAULT, APU FIRE LOOP B FAULT */
  loopBFault: boolean;
  /** ENG 1(2) FIRE DET FAULT, APU FIRE DET FAULT */
  detectionFault: boolean;
}

/**
 * The fire detection fault cautions of a zone from the state of its two detection loops (failed = break or loss of
 * electrical supply, from the fire detection unit). A320 FCOM DSC-26-20-10 "A loop-fault caution appears, if: One loop
 * is failed, or Both loops are failed, or The FDU fails"; FCOM PRO-ABN-ENG ENG 1(2) FIRE DET FAULT and PRO-ABN-APU APU
 * FIRE DET FAULT: "This alert triggers when: Both loops are inoperative, or Fire Detector Unit is inoperative". When
 * both loops are failed, the DET FAULT caution is shown instead of the two LOOP FAULT cautions (design choice: the FCOM
 * does not give the triggering conditions of the LOOP A(B) FAULT cautions; the A380 FWS does the same). A failed FDU
 * gives the DET FAULT caution whatever the state of the loops, and no LOOP FAULT caution (design choice: an FDU that
 * is inoperative cannot tell which loop is failed).
 * @param loopAFailed loop A of the zone is failed
 * @param loopBFailed loop B of the zone is failed
 * @param unitFailed the fire detection unit of the zone is failed (flyPad FDU failure)
 * @returns the cautions of the zone
 */
export function fireDetectionFaultAlerts(
  loopAFailed: boolean,
  loopBFailed: boolean,
  unitFailed: boolean,
): FireDetectionFaultAlerts {
  const detectionFault = (loopAFailed && loopBFailed) || unitFailed;
  return {
    loopAFault: loopAFailed && !detectionFault,
    loopBFault: loopBFailed && !detectionFault,
    detectionFault,
  };
}
