// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { StatusLines } from './CondStatus';

/*
 * The STATUS page content of the A320 F/CTL alerts (FCOM PRO-ABN-F_CTL STATUS figures, a320_fcom.txt line numbers at
 * each function). The FWC collects the codes of all active alerts and shows each code once, in the order of
 * StatusMessages, so the alerts of one failure (e.g. L ELEV FAULT and ALTN LAW) share their common lines.
 *
 * Not shown: STEEP APPR, GLS AUTOLAND (options) and "This line is replaced by FOR LDG : USE FLAP 3 when CONF 3 is
 * selected" (a reminder variant).
 */

/** The F/CTL STATUS codes (StatusMessages): 27 04 limitations, 27 05 conditions, 27 02 information, 27 03 INOP SYS */
export const FlightControlStatusCodes = {
  maxSpeed320: '270400001',
  maxSpeed320M77: '270400002',
  maneuverWithCare: '270400003',
  speedBrakeDoNotUse: '270400004',
  useSpeedBrakeWithCare: '270400005',
  goAroundMaxPitch15: '270400006',
  apprProc: '270500001',
  forLandingUseFlap3: '270400007',
  gpwsLandingFlap3On: '270400008',
  manPitchTrimUse: '270400009',
  apprSpdVref10: '270400010',
  ldgDistProcApply: '270400011',
  altnLawProtLost: '270200001',
  whenLgDownDirectLaw: '270200002',
  whenLgDownAndApOff: '270200003',
  directLaw: '270200004',
  pitchMechBackUp: '270200005',
  rollDirectLaw: '270200006',
  fctlIndicationsLost: '270200007',
  fuelConsumptIncreased: '270200008',
  fmsPredUnreliable: '270200009',
  /** 22 AUTO FLIGHT "CAT 3 SINGLE ONLY" (StatusMessages, FWC 1(2) FAULT) */
  cat3SingleOnly: '220200001',
  fctlProt: '270300001',
  lrElev: '270300002',
  lElev: '270300003',
  rElev: '270300004',
  lrAil: '270300005',
  lAil: '270300006',
  rAil: '270300007',
  elac12: '270300008',
  elac1: '270300009',
  elac2: '270300010',
  elacPitch: '270300011',
  sec1: '270300012',
  sec2: '270300013',
  sec3: '270300014',
  splr12: '270300015',
  splr1: '270300016',
  splr2: '270300017',
  splr34: '270300018',
  splr3: '270300019',
  splr4: '270300020',
  splr5: '270300021',
  speedBrake: '270300022',
  autoBrake: '270300023',
  fcdc12: '270300024',
  fcdc1: '270300025',
  fcdc2: '270300026',
  ap12: '270300027',
  cat2: '270300028',
  /** 22 AUTO FLIGHT "CAT 3 DUAL" (StatusMessages, FWC 1(2) FAULT) */
  cat3Dual: '220300001',
  /** 78 "REVERSER 1" / "REVERSER 2" (StatusMessages, ENG REVERSER FAULT) */
  reverser1: '780300001',
  reverser2: '780300002',
};

const S = FlightControlStatusCodes;

/** APPR PROC: FOR LDG USE FLAP 3, GPWS LDG FLAP 3 ON, APPR SPD VREF+10 KT, LDG DIST PROC APPLY */
const ALTN_LAW_APPROACH = [S.apprProc, S.forLandingUseFlap3, S.gpwsLandingFlap3On, S.apprSpdVref10, S.ldgDistProcApply];

/**
 * F/CTL ALTN LAW STATUS, l.82568-82608: MAX SPEED 320 KT (320/.77 if dual hydraulic system low pressure), SPD BRK (IF L
 * OR R ELEVATOR FAULT) DO NOT USE, APPR PROC (FOR LDG USE FLAP 3, GPWS LDG FLAP 3 ON, APPR SPD VREF+10, LDG DIST PROC
 * APPLY), "ALTN LAW: PROT LOST", "WHEN L/G DN: DIRECT LAW" (no AP) or "WHEN L/G DN AND AP OFF: DIRECT LAW" (AP
 * engaged); INOP SYS F/CTL PROT.
 * @param dualHydraulicLowPressure two hydraulic systems are at low pressure
 * @param leftOrRightElevatorFault the left or the right elevator is lost
 * @param apEngaged an autopilot is engaged
 * @returns the STATUS codes
 */
export function altnLawStatus(
  dualHydraulicLowPressure: boolean,
  leftOrRightElevatorFault: boolean,
  apEngaged: boolean,
): StatusLines {
  return {
    left: [
      dualHydraulicLowPressure ? S.maxSpeed320M77 : S.maxSpeed320,
      ...(leftOrRightElevatorFault ? [S.speedBrakeDoNotUse] : []),
      ...ALTN_LAW_APPROACH,
      S.altnLawProtLost,
      // the long FCOM line "WHEN L/G DN AND AP OFF: DIRECT LAW" is two lines, the second the DIRECT LAW line
      ...(apEngaged ? [S.whenLgDownAndApOff, S.directLaw] : [S.whenLgDownDirectLaw]),
    ],
    inopSys: [S.fctlProt],
  };
}

/**
 * F/CTL DIRECT LAW STATUS, l.82687-82703: MAX SPEED 320/.77, MANEUVER WITH CARE, USE SPD BRK WITH CARE, APPR PROC (FOR
 * LDG USE FLAP 3, GPWS LDG FLAP 3 ON, MAN PITCH TRIM USE, APPR SPD VREF+10, LDG DIST PROC APPLY), DIRECT LAW; INOP SYS
 * F/CTL PROT.
 * @returns the STATUS codes
 */
export function directLawStatus(): StatusLines {
  return {
    left: [
      S.maxSpeed320M77,
      S.maneuverWithCare,
      S.useSpeedBrakeWithCare,
      S.apprProc,
      S.forLandingUseFlap3,
      S.gpwsLandingFlap3On,
      S.manPitchTrimUse,
      S.apprSpdVref10,
      S.ldgDistProcApply,
      S.directLaw,
    ],
    inopSys: [S.fctlProt],
  };
}

/**
 * F/CTL ELAC 1(2) FAULT (ONE COMPUTER FAILED) STATUS, l.82768-82780: CAT 3 SINGLE ONLY, FUEL CONSUMPT INCRSD, FMS PRED
 * UNRELIABLE; INOP SYS ELAC 1(2), CAT 3 DUAL.
 * @param elac the failed ELAC
 * @returns the STATUS codes
 */
export function elacFaultStatus(elac: 1 | 2): StatusLines {
  return {
    left: [S.cat3SingleOnly, S.fuelConsumptIncreased, S.fmsPredUnreliable],
    inopSys: [elac === 1 ? S.elac1 : S.elac2, S.cat3Dual],
  };
}

/**
 * F/CTL ELAC 1(2) FAULT (BOTH COMPUTERS FAILED) STATUS, l.82874-82894: MAX SPEED 320 KT, APPR PROC (FOR LDG USE FLAP 3,
 * GPWS LDG FLAP 3 ON, APPR SPD VREF+10 KT, LDG DIST PROC APPLY), ALTN LAW: PROT LOST, WHEN L/G DOWN: DIRECT LAW, FUEL
 * CONSUMPT INCRSD, FMS PRED UNRELIABLE; INOP SYS F/CTL PROT, L+R AIL, ELAC 1+2, AP 1+2, CAT 2.
 * @returns the STATUS codes
 */
export function elac12FaultStatus(): StatusLines {
  return {
    left: [
      S.maxSpeed320,
      ...ALTN_LAW_APPROACH,
      S.altnLawProtLost,
      S.whenLgDownDirectLaw,
      S.fuelConsumptIncreased,
      S.fmsPredUnreliable,
    ],
    inopSys: [S.fctlProt, S.lrAil, S.elac12, S.ap12, S.cat2],
  };
}

/**
 * F/CTL ELAC 1(2) PITCH FAULT STATUS, l.82930-82938: CAT 3 SINGLE ONLY; INOP SYS ELAC PITCH (if ELAC 1 and 2 PITCH
 * FAULT), CAT 3 DUAL.
 * @param bothPitchFaults ELAC 1 PITCH FAULT and ELAC 2 PITCH FAULT
 * @returns the STATUS codes
 */
export function elacPitchFaultStatus(bothPitchFaults: boolean): StatusLines {
  return {
    left: [S.cat3SingleOnly],
    inopSys: [...(bothPitchFaults ? [S.elacPitch] : []), S.cat3Dual],
  };
}

/**
 * F/CTL ELEV SERVO FAULT STATUS, l.82971-82975: CAT 3 SINGLE ONLY; INOP SYS CAT 3 DUAL.
 * @returns the STATUS codes
 */
export function elevServoFaultStatus(): StatusLines {
  return { left: [S.cat3SingleOnly], inopSys: [S.cat3Dual] };
}

/**
 * F/CTL L(R) ELEV FAULT STATUS, l.83566-83580: MAX SPEED 320 KT, MANEUVER WITH CARE, SPD BRK DO NOT USE, FOR GA: MAX
 * PITCH 15 DEG, APPR PROC (FOR LDG USE FLAP 3, GPWS LDG FLAP 3 ON, APPR SPD VREF+10 KT, LDG DIST PROC APPLY), ALTN LAW:
 * PROT LOST, WHEN L/G DN: DIRECT LAW; INOP SYS F/CTL PROT, L (R) ELEV, ELAC PITCH, AP 1+2, CAT 2.
 * @param side the lost elevator
 * @returns the STATUS codes
 */
export function elevatorFaultStatus(side: 'L' | 'R'): StatusLines {
  return {
    left: [
      S.maxSpeed320,
      S.maneuverWithCare,
      S.speedBrakeDoNotUse,
      S.goAroundMaxPitch15,
      ...ALTN_LAW_APPROACH,
      S.altnLawProtLost,
      S.whenLgDownDirectLaw,
    ],
    inopSys: [S.fctlProt, side === 'L' ? S.lElev : S.rElev, S.elacPitch, S.ap12, S.cat2],
  };
}

/**
 * F/CTL L+R ELEV FAULT STATUS, l.83643-83660: MAX SPEED 320/.77, SPD BRK DO NOT USE, APPR PROC (FOR LDG USE FLAP 3,
 * GPWS LDG FLAP 3 ON, MAN PITCH TRIM USE, APPR SPD VREF+10, LDG DIST PROC APPLY), PITCH MECH BACK UP, ROLL DIRECT LAW;
 * INOP SYS L+R ELEV, ELAC PITCH, AP 1+2, CAT 2.
 * @returns the STATUS codes
 */
export function leftAndRightElevatorFaultStatus(): StatusLines {
  return {
    left: [
      S.maxSpeed320M77,
      S.speedBrakeDoNotUse,
      S.apprProc,
      S.forLandingUseFlap3,
      S.gpwsLandingFlap3On,
      S.manPitchTrimUse,
      S.apprSpdVref10,
      S.ldgDistProcApply,
      S.pitchMechBackUp,
      S.rollDirectLaw,
    ],
    inopSys: [S.lrElev, S.elacPitch, S.ap12, S.cat2],
  };
}

/**
 * F/CTL L(R) AIL FAULT STATUS, l.83486-83496: FUEL CONSUMPT INCRSD, FMS PRED UNRELIABLE; INOP SYS L (R) AIL.
 * @param side the lost aileron
 * @returns the STATUS codes
 */
export function aileronFaultStatus(side: 'L' | 'R'): StatusLines {
  return {
    left: [S.fuelConsumptIncreased, S.fmsPredUnreliable],
    inopSys: [side === 'L' ? S.lAil : S.rAil],
  };
}

/** The INOP SYS lines of faulty spoilers, a pair of one SEC in one line ("SPLR 3+4") */
function spoilerInopSys(spoilers: readonly boolean[]): string[] {
  const codes: string[] = [];
  if (spoilers[0] && spoilers[1]) {
    codes.push(S.splr12);
  } else {
    codes.push(...(spoilers[0] ? [S.splr1] : []), ...(spoilers[1] ? [S.splr2] : []));
  }
  if (spoilers[2] && spoilers[3]) {
    codes.push(S.splr34);
  } else {
    codes.push(...(spoilers[2] ? [S.splr3] : []), ...(spoilers[3] ? [S.splr4] : []));
  }
  if (spoilers[4]) {
    codes.push(S.splr5);
  }
  return codes;
}

/**
 * F/CTL SPLR FAULT STATUS, l.84599-84630: SPD BRK DO NOT USE (if spoilers 3+4 affected); INOP SYS SPLR (affected), SPD
 * BRK (if spoilers 2+3+4 affected). The "one or more spoilers fully extended" lines have no model input.
 * Design choice: the spoilers 3 and 4 are one speed brake pair (Fcdc.cpp spoiler34Avail), so "3+4 affected" is one of
 * them faulty; "2+3+4 affected" is spoiler 2 and one of 3 or 4 faulty.
 * @param spoilerFaults the faulty spoilers 1 to 5
 * @returns the STATUS codes
 */
export function spoilerFaultStatus(spoilerFaults: readonly boolean[]): StatusLines {
  const spoilers34 = spoilerFaults[2] || spoilerFaults[3];
  return {
    left: spoilers34 ? [S.speedBrakeDoNotUse] : [],
    inopSys: [...spoilerInopSys(spoilerFaults), ...(spoilers34 && spoilerFaults[1] ? [S.speedBrake] : [])],
  };
}

/**
 * F/CTL SEC 1(2)(3) FAULT STATUS, l.83812-83853, for the set of failed SECs (each SEC FAULT alert gives the same lines):
 * - SPD BRK DO NOT USE if SEC 1 is affected;
 * - if SEC 1 + 2 + 3 fail: FOR LDG USE FLAP 3, APPR SPD VREF+10 KT (the ALTN LAW alert gives the law lines);
 * - LDG DIST PROC APPLY. Design choice: shown for any SEC fault, the lost ground spoilers lengthen the landing;
 * - INOP SYS SPLR (associated: SEC 1 spoilers 3+4, SEC 2 spoiler 5, SEC 3 spoilers 1+2), SEC (affected), REVERSER 1 (if
 *   SEC 1 + 2 fail), REVERSER 2 (if SEC 1 + 3 fail), AUTO BRK (if at least 2 SECs fail).
 * @param sec1 the SEC 1 failed
 * @param sec2 the SEC 2 failed
 * @param sec3 the SEC 3 failed
 * @returns the STATUS codes
 */
export function secFaultStatus(sec1: boolean, sec2: boolean, sec3: boolean): StatusLines {
  const failedCount = [sec1, sec2, sec3].filter((failed) => failed).length;
  const allFailed = failedCount === 3;
  return {
    left: [
      ...(sec1 ? [S.speedBrakeDoNotUse] : []),
      ...(allFailed ? [S.apprProc, S.forLandingUseFlap3, S.apprSpdVref10] : []),
      S.ldgDistProcApply,
    ],
    inopSys: [
      ...(sec3 ? [S.splr12] : []),
      ...(sec1 ? [S.splr34] : []),
      ...(sec2 ? [S.splr5] : []),
      ...(sec1 ? [S.sec1] : []),
      ...(sec2 ? [S.sec2] : []),
      ...(sec3 ? [S.sec3] : []),
      ...(sec1 && sec2 ? [S.reverser1] : []),
      ...(sec1 && sec3 ? [S.reverser2] : []),
      ...(failedCount >= 2 ? [S.autoBrake] : []),
    ],
  };
}

/**
 * F/CTL FCDC 1(2) FAULT STATUS, l.83007-83011: INOP SYS FCDC 1(2).
 * @param fcdc the failed FCDC
 * @returns the STATUS codes
 */
export function fcdcFaultStatus(fcdc: 1 | 2): StatusLines {
  return { left: [], inopSys: [fcdc === 1 ? S.fcdc1 : S.fcdc2] };
}

/**
 * F/CTL FCDC 1+2 FAULT STATUS, l.83069-83073: F/CTL INDICATIONS LOST; INOP SYS FCDC 1 + 2.
 * @returns the STATUS codes
 */
export function fcdc12FaultStatus(): StatusLines {
  return { left: [S.fctlIndicationsLost], inopSys: [S.fcdc12] };
}
