// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { StatusLines } from './CondStatus';
import { FlightControlStatusCodes } from './FlightControlStatus';

/*
 * The A320 AUTO FLT cautions of the rudder functions of the FACs (FCOM PRO-ABN-AUTO_FLT, a320_fcom.txt):
 * - AUTO FLT YAW DAMPER 1(2), l.71980-72000; AUTO FLT YAW DAMPER SYS, l.72012-72077
 * - AUTO FLT RUD TRIM 1(2) FAULT, l.71741-71780; AUTO FLT RUD TRIM SYS, l.71782-71822
 * - AUTO FLT RUD TRV LIM 1(2), l.71826-71863; AUTO FLT RUD TRV LIM SYS, l.71865-71930
 * The flight phase inhibitions and the alert colours are figures of the FCOM PDF ("A320 Neo FCOM_1.pdf",
 * PRO-ABN-AUTO_FLT, pages at FacActuatorPhaseInhibition).
 *
 * How the FWC sees them. Each FAC drives its own yaw damper actuator (FAC 1 the green one, FAC 2 the yellow one), its own
 * motor of the rudder trim actuator and its own motor of the rudder travel limiter (TLU) actuator. FAC 1 has the
 * priority, FAC 2 engages a function only when FAC 1 does not (FacComputer.cpp yawDamperHasPriority etc.).
 * - "one actuator is failed" (l.71751, l.71836, l.71990): the FAC n actuator fault discretes
 *   L:A32NX_FAC_n_{YAW_DAMPER,RUDDER_TRIM,RUDDER_TRAVEL_LIM}_ACTUATOR_FAULT, written by the fbw_a320 module from the flyPad
 *   failures 22006-22011 while the FAC is healthy (a failed FAC reports nothing: FAC 1(2) FAULT is the alert then).
 * - "the system is failed" (l.71792, l.71875, l.72022): no FAC has the function engaged (FAC discrete word 2, "own
 *   engaged" bits 11, 13 and 15) and an actuator fault is the cause. Design choice: a function lost only by the FACs
 *   (FAC 1+2 FAULT, FAC pbs OFF) or by the hydraulics (the yaw dampers with the green and yellow systems lost, HYD G+Y
 *   SYS LO PR) gives no SYS alert: those alerts already list the lost function in their STATUS (FAC 1+2 FAULT l.71507
 *   "the rudder travel limit system, rudder trim control, yaw damper ... are lost", HYD G+Y SYS LO PR INOP SYS YAW
 *   DAMPER, l.88710).
 * The single actuator alert is not shown with the SYS alert of its function.
 */

/** The flight phase inhibitions (FCOM PDF PRO-ABN-AUTO_FLT). The A320 FWC phases are 1 to 10. */
export const FacActuatorPhaseInhibition = {
  /** RUD TRIM 1(2) FAULT (page 4422) */
  rudderTrimFault: [3, 4, 5, 7, 8],
  /** RUD TRIM SYS (page 4423) */
  rudderTrimSystem: [4, 5, 7, 8],
  /** RUD TRV LIM 1(2) (page 4424) */
  rudderTravelLimiterFault: [3, 4, 5, 7, 8],
  /** RUD TRV LIM SYS (page 4426) */
  rudderTravelLimiterSystem: [4, 5, 7, 8],
  /** YAW DAMPER 1(2) (pages 4432 and 4433, both variants) */
  yawDamperFault: [3, 4, 5, 7, 8, 10],
  /** YAW DAMPER SYS (page 4434) */
  yawDamperSystem: [4, 5, 7, 8, 10],
};

/**
 * Design choice: the SYS alerts are confirmed for 1 s. When FAC 1 loses a function, FAC 2 engages it one update later
 * (it reads FAC 1's "engaged" output of the last update), so for a moment no FAC has the function engaged.
 */
export const FAC_SYSTEM_ALERT_CONFIRM_SECONDS = 1;

/** The FAC discrete word 2 "own engaged" bits (docs a320-simvars.md A32NX_FAC_{number}_DISCRETE_WORD_2) */
export const FacDiscreteWord2Bits = {
  yawDamperOwnEngaged: 11,
  rudderTrimOwnEngaged: 13,
  rudderTravelLimiterOwnEngaged: 15,
};

/** The state of one rudder function (yaw damper, rudder trim or rudder travel limiter) of the two FACs */
export interface FacFunctionInputs {
  /** FAC 1 reports its actuator of this function failed */
  readonly actuator1Fault: boolean;
  /** FAC 2 reports its actuator of this function failed */
  readonly actuator2Fault: boolean;
  /** FAC 1 has the function engaged (FAC 1 discrete word 2 own engaged bit) */
  readonly fac1Engaged: boolean;
  /** FAC 2 has the function engaged */
  readonly fac2Engaged: boolean;
}

/** The triggers of the three alerts of one function, before the confirmation time */
export interface FacFunctionTriggers {
  /** YAW DAMPER 1, RUD TRIM 1 FAULT, RUD TRV LIM 1 */
  readonly unit1: boolean;
  /** YAW DAMPER 2, RUD TRIM 2 FAULT, RUD TRV LIM 2 */
  readonly unit2: boolean;
  /** YAW DAMPER SYS, RUD TRIM SYS, RUD TRV LIM SYS */
  readonly system: boolean;
}

/**
 * The triggers of the alerts of one rudder function.
 * @param inputs the actuator faults and the engaged functions of the two FACs
 * @returns the triggers
 */
export function facFunctionTriggers(inputs: FacFunctionInputs): FacFunctionTriggers {
  const system = !inputs.fac1Engaged && !inputs.fac2Engaged && (inputs.actuator1Fault || inputs.actuator2Fault);
  return {
    unit1: inputs.actuator1Fault && !system,
    unit2: inputs.actuator2Fault && !system,
    system,
  };
}

/**
 * Design choice: the TLU counts as "locked at high speed after slat extension" (RUD TRV LIM SYS, l.71904, l.71920) when the
 * slats are extended and the rudder travel limit is below 24 deg. The FAC limits the rudder to 25 deg up to 160 kt
 * (FacComputer_data.cpp TLU table: 25 deg at 160 kt, 14.5 deg at 200 kt), so a TLU stopped below 24 deg was stopped
 * above about 165 kt.
 */
export const TLU_FULL_TRAVEL_THRESHOLD_DEG = 24;

/**
 * @param slatsExtended the slats are extended
 * @param rudderTravelLimitDeg the rudder travel limiter position, deg (L:A32NX_HYD_RUDDER_LIMITER_FEEDBACK_ANGLE)
 * @returns the TLU stays locked at a high speed limit with the slats extended
 */
export function tluLockedAtHighSpeed(slatsExtended: boolean, rudderTravelLimitDeg: number): boolean {
  return slatsExtended && Math.abs(rudderTravelLimitDeg) < TLU_FULL_TRAVEL_THRESHOLD_DEG;
}

/**
 * The procedure lines, by index in the codes of each alert (EwdMessages 2200xxxxx), null for a hidden line.
 * YAW DAMPER SYS (l.72028-72031): 0 title, 1 -FAC 1 OFF THEN ON, 2 -FAC 2 OFF THEN ON. The associated F/CTL ALTN LAW
 * (PROT LOST) procedure (l.72032-72042) is the F/CTL ALTN LAW alert's: the ELACs go to alternate law when no FAC has a
 * yaw damper available (ElacComputer.cpp fac_1/2_yaw_control_lost).
 * @returns the line indexes
 */
export function yawDamperSystemLines(): (number | null)[] {
  return [0, 1, 2];
}

/**
 * RUD TRIM SYS (l.71797-71798): 0 title, 1 -FAC 1 OFF THEN ON, 2 -FAC 2 OFF THEN ON.
 * @returns the line indexes
 */
export function rudderTrimSystemLines(): (number | null)[] {
  return [0, 1, 2];
}

/**
 * RUD TRV LIM SYS (l.71895-71902): 0 title, 1 RUD WITH CARE ABV 160 KT, 2 -FAC 1 OFF THEN ON, 3 -FAC 2 OFF THEN ON, and
 * when the TLU stays locked at high speed after slat extension (l.71904-71912): 4 MAX X WIND FOR LDG 15 KT,
 * 5 -AUTO BRK DO NOT USE, 6 .AT LDG ROLL:, 7 -DIFF BRAKING AS RQRD.
 * @param tluLocked the TLU stays locked at high speed after slat extension (tluLockedAtHighSpeed)
 * @returns the line indexes
 */
export function rudderTravelLimiterSystemLines(tluLocked: boolean): (number | null)[] {
  return [0, 1, 2, 3, tluLocked ? 4 : null, tluLocked ? 5 : null, tluLocked ? 6 : null, tluLocked ? 7 : null];
}

/** The AUTO FLT STATUS codes (StatusMessages): 22 04 limitations, 22 05 conditions, 22 03 INOP SYS */
export const FacActuatorStatusCodes = {
  rudderWithCareAbove160: '220400001',
  maxCrosswindForLanding15: '220400002',
  autoBrakeDoNotUse: '220400003',
  atLandingRoll: '220500001',
  differentialBrakingAsRequired: '220400004',
  yawDamper1: '220300002',
  yawDamper2: '220300003',
  yawDamper: '220300004',
  rudderTrim1: '220300005',
  rudderTrim2: '220300006',
  rudderTrim: '220300007',
  rudderTravelLimiter1: '220300008',
  rudderTravelLimiter2: '220300009',
  rudderTravelLimiter: '220300010',
};

const S = FacActuatorStatusCodes;
const F = FlightControlStatusCodes;

/**
 * YAW DAMPER 1(2) STATUS (l.71994-72000): CAT 3 SINGLE ONLY; INOP SYS CAT 3 DUAL, YAW DAMPER 1(2).
 * RUD TRIM 1(2) FAULT STATUS (l.71775-71780): the same with RUD TRIM 1(2).
 * RUD TRV LIM 1(2) STATUS (l.71859-71863): INOP SYS RUD TRV LIM 1(2) only.
 */
export const facActuatorStatus = {
  yawDamperFault: (unit: 1 | 2): StatusLines => ({
    left: [F.cat3SingleOnly],
    inopSys: [F.cat3Dual, unit === 1 ? S.yawDamper1 : S.yawDamper2],
  }),
  rudderTrimFault: (unit: 1 | 2): StatusLines => ({
    left: [F.cat3SingleOnly],
    inopSys: [F.cat3Dual, unit === 1 ? S.rudderTrim1 : S.rudderTrim2],
  }),
  rudderTravelLimiterFault: (unit: 1 | 2): StatusLines => ({
    left: [],
    inopSys: [unit === 1 ? S.rudderTravelLimiter1 : S.rudderTravelLimiter2],
  }),
  /**
   * YAW DAMPER SYS STATUS (l.72062-72077): MAX SPEED 320 KT, APPR PROC (FOR LDG USE FLAP 3, GPWS LDG FLAP 3 ON, APPR SPD
   * VREF+10 KT, LDG DIST PROC APPLY), ALTN LAW: PROT LOST; INOP SYS F/CTL PROT, YAW DAMPER, AP 1+2, CAT 2. Not shown: GLS AUTOLAND (option)
   * and the "FOR LDG : USE FLAP 3" reminder variant (as the F/CTL ALTN LAW STATUS, FlightControlStatus).
   */
  yawDamperSystem: (): StatusLines => ({
    left: [
      F.maxSpeed320,
      F.apprProc,
      F.forLandingUseFlap3,
      F.gpwsLandingFlap3On,
      F.apprSpdVref10,
      F.ldgDistProcApply,
      F.altnLawProtLost,
    ],
    inopSys: [F.fctlProt, S.yawDamper, F.ap12, F.cat2],
  }),
  /** RUD TRIM SYS STATUS (l.71816-71822): INOP SYS RUD TRIM, AP 1+2, CAT 2. Not shown: GLS AUTOLAND (option). */
  rudderTrimSystem: (): StatusLines => ({
    left: [],
    inopSys: [S.rudderTrim, F.ap12, F.cat2],
  }),
  /**
   * RUD TRV LIM SYS STATUS (l.71916-71930): RUD WITH CARE ABV 160 KT, and when the TLU stays locked at high speed after
   * slat extension MAX X WIND FOR LDG 15 KT, AUTO BRK DO NOT USE, AT LDG ROLL: DIFF BRAKING AS RQRD; INOP SYS RUD TRV LIM.
   * @param tluLocked the TLU stays locked at high speed after slat extension (tluLockedAtHighSpeed)
   */
  rudderTravelLimiterSystem: (tluLocked: boolean): StatusLines => ({
    left: [
      S.rudderWithCareAbove160,
      ...(tluLocked
        ? [S.maxCrosswindForLanding15, S.autoBrakeDoNotUse, S.atLandingRoll, S.differentialBrakingAsRequired]
        : []),
    ],
    inopSys: [S.rudderTravelLimiter],
  }),
};
