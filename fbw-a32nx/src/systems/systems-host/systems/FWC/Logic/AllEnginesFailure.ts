// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/** The APU start of the ALL ENGINES FAILURE procedure applies below FL 250 */
const APU_START_MAX_PRESSURE_ALTITUDE_FT = 25_000;

/**
 * Whether the "-APU ... START" line of ENG ALL ENGINES FAILURE is shown. The procedure asks for an APU start below
 * FL 250 (pressure altitude, not radio altitude). The 24-character ECAM line has no room for "(BELOW FL 250)", so the
 * condition gates the line, as the FWC does with the other conditional lines.
 * @param apuMasterOn the APU MASTER SW is ON
 * @param apuAvail the APU is available
 * @param pressureAltitudeFt the ADR pressure altitude, null when no ADR is valid
 * @returns true when the line is shown
 */
export function isApuStartLineShown(
  apuMasterOn: boolean,
  apuAvail: boolean,
  pressureAltitudeFt: number | null,
): boolean {
  return !(apuMasterOn || apuAvail) && (pressureAltitudeFt ?? 0) < APU_START_MAX_PRESSURE_ALTITUDE_FT;
}

/**
 * The lines of ENG ALL ENGINES FAILURE (EwdMessages 7700027xx), in display order. One OPT RELIGHT SPD line: 270/.77,
 * the value of the A320neo with LEAP-1A engines (CFM56 aircraft use 300/.77).
 */
export const ALL_ENGINES_FAILURE_CODES = [
  '770002701', // ALL ENGINES FAILURE (title)
  '770002702', // -EMER ELEC PWR...MAN ON
  '770002706', // OPT RELIGHT SPD.270/.77
  '770002707', // -APU..............START
  '770002708', // -THR LEVERS........IDLE
  '770002709', // -FAC 1......OFF THEN ON
  '770002710', // GLDG DIST: 2NM/1000FT
  '770002711', // -DIVERSION.....INITIATE
  '770002712', // -ALL ENG FAIL PROC.APPLY
];

export interface AllEnginesFailureLineInputs {
  /** The EMER ELEC PWR MAN ON pb has been pushed (SDAC word 004 10, bit 27): its line is done and hidden */
  readonly emerElecPwrManOnPushed: boolean;
  /** isApuStartLineShown */
  readonly apuStartLineShown: boolean;
  /** A thrust lever is above IDLE */
  readonly thrustLeverAboveIdle: boolean;
  /** FAC 1 has failed */
  readonly fac1Failed: boolean;
}

/**
 * The lines of ENG ALL ENGINES FAILURE shown now, as indexes into ALL_ENGINES_FAILURE_CODES.
 * @param inputs the conditions of the conditional lines
 * @returns the indexes of the lines shown, in display order
 */
export function allEnginesFailureLines(inputs: AllEnginesFailureLineInputs): number[] {
  const lines: (number | null)[] = [
    0,
    inputs.emerElecPwrManOnPushed ? null : 1,
    2,
    inputs.apuStartLineShown ? 3 : null,
    inputs.thrustLeverAboveIdle ? 4 : null,
    inputs.fac1Failed ? 5 : null,
    6,
    7,
    8,
  ];
  return lines.filter((line): line is number => line !== null);
}
