// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/**
 * The BRAKES and WHEEL cautions of the brake and steering control units (BSCU channels 1 and 2, ABCU), from the
 * a320_systems brake model (hydraulic/brake_control_units.rs). A320 FCOM PRO-ABN-BRAKES (a320_fcom.txt l.72313-72898)
 * and PRO-ABN-WHEEL (l.96294-96380).
 *
 * Power supplies (FCOM PRO-ABN-ELEC bus fault STATUS, see ElecBusAlerts): BSCU channel 1 on AC BUS 1 and DC BUS 1
 * (BRK SYS 1), channel 2 on AC BUS 2 and DC BUS 2 (BRK SYS 2), ABCU on DC ESS BUS (ALTN BRK). Design choice: a unit
 * lost only because its bus is unpowered gives no BRAKES caution, the ELEC bus fault alert already shows it and lists
 * the same INOP SYS.
 */
export interface BrakeSystemAlertInputs {
  /** BSCU channel 1 is lost (failed or unpowered), L:A32NX_BRAKES_BSCU_1_FAULT */
  readonly bscu1Lost: boolean;
  /** BSCU channel 2 is lost (failed or unpowered), L:A32NX_BRAKES_BSCU_2_FAULT */
  readonly bscu2Lost: boolean;
  /** AC BUS 1 or DC BUS 1 is unpowered (power supply of BSCU channel 1) */
  readonly bscu1PowerLost: boolean;
  /** AC BUS 2 or DC BUS 2 is unpowered (power supply of BSCU channel 2) */
  readonly bscu2PowerLost: boolean;
  /** The ABCU is lost (failed or unpowered): no alternate braking, L:A32NX_BRAKES_ALTN_BRK_FAULT */
  readonly abcuLost: boolean;
  /** DC ESS BUS is unpowered (power supply of the ABCU) */
  readonly abcuPowerLost: boolean;
  /** The normal braking equipment is failed, L:A32NX_BRAKES_NORM_BRK_FAULT */
  readonly normalBrakingFailed: boolean;
  /** The autobrake failed after being armed (latched by the BSCU), L:A32NX_BRAKES_AUTO_BRK_FAULT */
  readonly autobrakeFailedAfterArmed: boolean;
  /** The nose wheel steering system is failed, L:A32NX_BRAKES_NW_STRG_FAULT */
  readonly noseWheelSteeringFailed: boolean;
  /** The BSCU reports the brake normal selector valve failed, L:A32NX_BRAKES_HYD_SEL_FAULT */
  readonly normalSelectorValveFailed: boolean;
  /** The A/SKID & N/W STRG sw is OFF */
  readonly antiSkidSwitchOff: boolean;
  /** The yellow hydraulic system is in low pressure */
  readonly yellowLowPressure: boolean;
}

export interface BrakeSystemAlerts {
  /** BRAKES A/SKID N/WS FAULT */
  readonly antiSkidNwsFault: boolean;
  /** BRAKES A/SKID N/WS OFF */
  readonly antiSkidNwsOff: boolean;
  /** BRAKES NORM + ALTN FAULT */
  readonly normAndAltnFault: boolean;
  /** BRAKES NORM BRK FAULT */
  readonly normBrkFault: boolean;
  /** BRAKES ALTN BRK FAULT */
  readonly altnBrkFault: boolean;
  /** BRAKES AUTO BRK FAULT */
  readonly autoBrkFault: boolean;
  /** BRAKES SYS 1 FAULT */
  readonly sys1Fault: boolean;
  /** BRAKES SYS 2 FAULT */
  readonly sys2Fault: boolean;
  /** WHEEL N/W STRG FAULT */
  readonly nwStrgFault: boolean;
  /** WHEEL HYD SEL FAULT */
  readonly hydSelFault: boolean;
}

/**
 * Computes the BRAKES and WHEEL cautions of the brake control units.
 * @param inputs the brake system state
 * @returns the active cautions
 */
export function brakeSystemAlerts(inputs: BrakeSystemAlertInputs): BrakeSystemAlerts {
  // A channel failed by itself (not by its power supply)
  const bscu1Failed = inputs.bscu1Lost && !inputs.bscu1PowerLost;
  const bscu2Failed = inputs.bscu2Lost && !inputs.bscu2PowerLost;
  const bothBscuLost = inputs.bscu1Lost && inputs.bscu2Lost;
  const abcuFailed = inputs.abcuLost && !inputs.abcuPowerLost;

  // The normal braking function is lost by a brake system failure: the normal equipment, or both BSCU channels
  // ("Braking is electrically-controlled through the BSCU", FCOM DSC-32-30-10 l.51259). The loss by the green
  // hydraulic pressure is the HYD G SYS LO PR alert (its STATUS lists NORM BRK, see HydraulicAlerts).
  const normalBrakingLost = inputs.normalBrakingFailed || bothBscuLost;

  // NORM + ALTN FAULT (l.72640-72641): "the normal and alternate braking functions are lost".
  // Design choice: shown when one of the two losses is a brake system failure (not only the bus power losses).
  const normAndAltnFault =
    normalBrakingLost && inputs.abcuLost && (inputs.normalBrakingFailed || bscu1Failed || bscu2Failed || abcuFailed);

  // A/SKID N/WS FAULT (l.72323-72328): "a loss of normal brake system associated with Y HYD SYS LO PRESS, or both BSCU
  // channels are failed". Not with NORM + ALTN FAULT, whose STATUS includes ANTI SKID and N/W STRG (l.72667-72674).
  const antiSkidNwsFault =
    !normAndAltnFault &&
    ((inputs.normalBrakingFailed && inputs.yellowLowPressure) || (bothBscuLost && (bscu1Failed || bscu2Failed)));

  // A/SKID N/WS OFF (l.72328): "The A/SKID & N/W STRG sw is set to OFF". The FAULT title takes over when both are true.
  const antiSkidNwsOff = inputs.antiSkidSwitchOff && !normAndAltnFault && !antiSkidNwsFault;

  // NORM BRK FAULT (l.72686): "the normal braking function is lost". Not when A/SKID N/WS FAULT or NORM + ALTN FAULT
  // already shows it (their STATUS lists NORM BRK); both BSCU channels lost is A/SKID N/WS FAULT.
  const normBrkFault = inputs.normalBrakingFailed && !normAndAltnFault && !antiSkidNwsFault;

  // ALTN BRK FAULT (l.72395): "the alternate braking function is lost".
  const altnBrkFault = abcuFailed && !normAndAltnFault;

  // AUTO BRK FAULT (l.72473): "the autobrake is failed, after being armed". Not when a braking alert above already
  // lists AUTO BRK in its STATUS (A/SKID N/WS l.72355-72375, NORM BRK l.72713, NORM + ALTN l.72667-72674).
  const autoBrkFault =
    inputs.autobrakeFailedAfterArmed && !normAndAltnFault && !antiSkidNwsFault && !antiSkidNwsOff && !normBrkFault;

  // SYS 1(2) FAULT (l.72884): "one BSCU channel is failed". Both channels lost is A/SKID N/WS FAULT.
  const sys1Fault = bscu1Failed && !inputs.bscu2Lost;
  const sys2Fault = bscu2Failed && !inputs.bscu1Lost;

  // WHEEL N/W STRG FAULT (l.96350): "the nose wheel steering system is failed". Not when A/SKID N/WS FAULT, OFF or
  // NORM + ALTN FAULT already lists N/W STRG in its STATUS.
  const nwStrgFault = inputs.noseWheelSteeringFailed && !normAndAltnFault && !antiSkidNwsFault && !antiSkidNwsOff;

  // WHEEL HYD SEL FAULT (l.96304-96305): "the brake normal selector valve is failed, or the NWS selector valve is at
  // open position". The model has no NWS selector valve: the brake normal selector valve failure only (the BSCU
  // reports it while one of its channels works, brake_control_units.rs).
  const hydSelFault = inputs.normalSelectorValveFailed;

  return {
    antiSkidNwsFault,
    antiSkidNwsOff,
    normAndAltnFault,
    normBrkFault,
    altnBrkFault,
    autoBrkFault,
    sys1Fault,
    sys2Fault,
    nwStrgFault,
    hydSelFault,
  };
}

/** STATUS codes (StatusMessages) of the BRAKES and WHEEL alerts */
export const BRAKE_SYSTEM_STATUS = {
  maxBrkPr: '290400003',
  ldgDistProc: '290400017',
  parkBrkOnly: '320400090',
  brkYAccuPrOnly: '290200001',
  altnYBrkWithASkid: '290200002',
  cat3SingleOnly: '220200001',
  cat3Dual: '220300001',
  antiSkid: '290300032',
  nwStrg: '290300035',
  normBrk: '290300034',
  autoBrk: '290300033',
  altnBrk: '240300175',
  brkSys1: '240300172',
  brkSys2: '240300173',
} as const;

const S = BRAKE_SYSTEM_STATUS;

/** The STATUS of an alert: its left lines (limitations and information) and its INOP SYS */
export interface BrakeSystemStatus {
  readonly left: string[];
  readonly inopSys: string[];
}

/**
 * BRAKES A/SKID N/WS FAULT OR A/SKID N/WS OFF STATUS (l.72355-72375): MAX BRK PR 1000 PSI, LDG DIST PROC APPLY,
 * "If Y SYS LO PR: BRK Y ACCU PR ONLY", CAT 3 SINGLE ONLY; INOP SYS CAT 3 DUAL, ANTI SKID, N/W STRG, NORM BRK, AUTO BRK.
 * @param yellowLowPressure the yellow hydraulic system is in low pressure
 * @returns the STATUS codes
 */
export function antiSkidNwsStatus(yellowLowPressure: boolean): BrakeSystemStatus {
  return {
    left: [S.maxBrkPr, S.ldgDistProc, ...(yellowLowPressure ? [S.brkYAccuPrOnly] : []), S.cat3SingleOnly],
    inopSys: [S.cat3Dual, S.antiSkid, S.nwStrg, S.normBrk, S.autoBrk],
  };
}

/** BRAKES NORM + ALTN FAULT STATUS (l.72667-72674) */
export const NORM_AND_ALTN_FAULT_STATUS: BrakeSystemStatus = {
  left: [S.parkBrkOnly, S.ldgDistProc, S.cat3SingleOnly],
  inopSys: [S.cat3Dual, S.antiSkid, S.nwStrg, S.normBrk, S.autoBrk, S.altnBrk],
};

/**
 * BRAKES NORM BRK FAULT STATUS (l.72709-72715): LDG DIST PROC APPLY, ALTN Y BRK WITH A/SKID, CAT 3 SINGLE ONLY; INOP SYS
 * CAT 3 DUAL, NORM BRK, AUTO BRK
 */
export const NORM_BRK_FAULT_STATUS: BrakeSystemStatus = {
  left: [S.ldgDistProc, S.altnYBrkWithASkid, S.cat3SingleOnly],
  inopSys: [S.cat3Dual, S.normBrk, S.autoBrk],
};

/** BRAKES ALTN BRK FAULT STATUS (l.72403-72409): INOP SYS ALTN BRK */
export const ALTN_BRK_FAULT_STATUS: BrakeSystemStatus = { left: [], inopSys: [S.altnBrk] };

/** BRAKES AUTO BRK FAULT STATUS (l.72477-72483): CAT 3 SINGLE ONLY; INOP SYS CAT 3 DUAL, AUTO BRK */
export const AUTO_BRK_FAULT_STATUS: BrakeSystemStatus = { left: [S.cat3SingleOnly], inopSys: [S.cat3Dual, S.autoBrk] };

/** BRAKES SYS 1 FAULT STATUS (l.72894-72898): INOP SYS BRK SYS 1 */
export const SYS_1_FAULT_STATUS: BrakeSystemStatus = { left: [], inopSys: [S.brkSys1] };

/** BRAKES SYS 2 FAULT STATUS (l.72894-72898): INOP SYS BRK SYS 2 */
export const SYS_2_FAULT_STATUS: BrakeSystemStatus = { left: [], inopSys: [S.brkSys2] };

/** WHEEL N/W STRG FAULT STATUS (l.96373-96378): CAT 3 SINGLE ONLY; INOP SYS CAT 3 DUAL, N/W STRG */
export const NW_STRG_FAULT_STATUS: BrakeSystemStatus = { left: [S.cat3SingleOnly], inopSys: [S.cat3Dual, S.nwStrg] };

/**
 * WHEEL HYD SEL FAULT (A320 FCOM PRO-ABN-WHEEL, a320_fcom.txt l.96294-96338): amber caution, no STATUS. Its flight phase
 * inhibition is the figure of the FCOM PDF ("A320 Neo FCOM_1.pdf", PRO-ABN-WHEEL P 2/6, page 5834): 3, 4, 5, 7, 8.
 */
export const HYD_SEL_FAULT_PHASE_INHIBITION = [3, 4, 5, 7, 8];

/** The E/WD codes of WHEEL HYD SEL FAULT (EwdMessages): 0 title, 1 -A/SKID N/WS KEEP ON */
export const HYD_SEL_FAULT_CODES = ['320048001', '320048002'];

/**
 * The lines of WHEEL HYD SEL FAULT: the title and "A/SKID & N/W STRG ... KEEP ON" (l.96336), always shown: "If the
 * steering selector valve is failed open, setting A/SKID & N/W STRG sw to OFF will cause the nosewheel to go to maximum
 * deflection" (l.96333-96334), and "As long as antiskid is operative, brake pressure is regulated by normal
 * servovalves" (l.96338).
 */
export function hydSelFaultLines(): number[] {
  return [0, 1];
}

/** The E/WD codes of the green AUTO BRK memo (EwdMessages), in the order of autoBrakeMemoLine: LO, MED, MAX, OFF */
export const AUTO_BRK_MEMO_CODES = ['000002201', '000002202', '000002203', '000002204'];

/** The L:A32NX_AUTOBRAKES_ARMED_MODE values of the AUTO BRK pb selections */
const AUTO_BRK_MAX_MODE = 3;

/** The line of the AUTO BRK memo that shows the failed autobrake (AUTO_BRK_MEMO_CODES) */
const AUTO_BRK_OFF_LINE = 3;

/**
 * The green AUTO BRK memo of the E/WD (A320 FCOM DSC-32-30-20 MEMO DISPLAY, a320_fcom.txt l.51657-51662):
 * - "AUTO BRK LO/MED/MAX : This memo appears in green, depending on the selection of the AUTO BRK pb" (l.51657-51658),
 *   in FWC flight phases 7 and 8 (the flight phases of the FBW memo, unchanged);
 * - "AUTO BRK OFF : This memo appears in green if the auto brake is failed" (l.51662): the BSCU latch of the autobrake
 *   failed after being armed, the condition of BRAKES AUTO BRK FAULT (l.72473), in every flight phase.
 * Design choice (user decision, FCOM only): the amber AUTO BRK OFF memo, with its aural and MASTER CAUT at each
 * autobrake disarm, is a newer FWC standard that this FCOM does not have: it is not given.
 * @param flightPhase the FWC flight phase (1 to 10)
 * @param armedMode the armed autobrake mode, L:A32NX_AUTOBRAKES_ARMED_MODE (0 none, 1 LO, 2 MED, 3 MAX)
 * @param autobrakeFailed the autobrake failed after being armed, L:A32NX_BRAKES_AUTO_BRK_FAULT
 * @returns the index of the memo line in AUTO_BRK_MEMO_CODES, null when no AUTO BRK memo is shown
 */
export function autoBrakeMemoLine(flightPhase: number, armedMode: number, autobrakeFailed: boolean): number | null {
  if (autobrakeFailed) {
    return AUTO_BRK_OFF_LINE;
  }
  const selectionMemoPhase = flightPhase === 7 || flightPhase === 8;
  if (selectionMemoPhase && armedMode >= 1 && armedMode <= AUTO_BRK_MAX_MODE) {
    return armedMode - 1;
  }
  return null;
}
