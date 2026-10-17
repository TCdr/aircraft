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

/**
 * The STATUS of ENG ALL ENGINES FAILURE (A320 FCOM PRO-ABN-ENG, a320_fcom.txt l.79177-79239), in the order of the FCOM
 * page. Its codes (StatusMessages 70x07x) come first on the STATUS page: the other alerts of an all engines failure (ELEC
 * EMER CONFIG, HYD G+Y SYS LO PR...) give some of the same lines, which the page then shows once, at this place.
 * - Limitations (l.79183-79195): MIN RAT SPEED 140 KT, MAX SPEED 320/.77, MAX BRK PR 1000 PSI, MANEUVER WITH CARE, FUEL
 *   GRVTY FEED, AVOID NEGATIVE G FACTOR, APPR PROC: FOR LDG USE FLAP 2, WHEN CONF 2 AND VAPP: L/G GRVTY EXTN AS RQRD.
 * - Information (l.79202-79208): ALTN LAW: PROT LOST, WHEN L/G DN: DIRECT LAW, BRK Y ACCU PR ONLY, SLATS SLOW, FLS
 *   LIMITED TO F-APP + RAW.
 * - INOP SYS (l.79210-79234): G+Y HYD, F/CTL PROT, STABILIZER, R AIL, REVERSER 1+2, ADR 2+3, IR 2+3, RA 1+2,
 *   SPLR 1+2+4+5, ELAC 2, SEC 2+3, FLAPS, YAW DAMPER, A/CALL OUT, AP 1+2, A/THR, FUEL PUMPS, ANTI SKID, N/W STRG
 *   ("N/W. STEER" on the FCOM page, the ECAM text of the other alerts), AUTO BRK, CAT 2, L/G RETRACT, CAB PR 1+2, PACK 1+2.
 */
export const ALL_ENGINES_FAILURE_STATUS = {
  left: [
    '700400070',
    '700400071',
    '700400072',
    '700400073',
    '700400074',
    '700400075',
    '700500070',
    '700400076',
    '700500071',
    '700400077',
    '700200070',
    '700200071',
    '700200072',
    '700200073',
    '700200074',
  ],
  inopSys: Array.from({ length: 24 }, (_, i) => `7003000${(70 + i).toString()}`),
} as const;

/** The STATUS lines of ENG ALL ENGINES FAILURE */
export function allEnginesFailureStatus(): { left: string[]; inopSys: string[] } {
  return { left: [...ALL_ENGINES_FAILURE_STATUS.left], inopSys: [...ALL_ENGINES_FAILURE_STATUS.inopSys] };
}
