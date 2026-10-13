// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { AirDataSwitchingKnob, Arinc429Word, AttHdgSwitchingKnob } from '@flybywiresim/fbw-sdk';
import { StatusLines } from './CondStatus';
import { FlightControlStatusCodes as F } from './FlightControlStatus';

/*
 * The NAV ADR, IR and RA alerts of the A320 FWC (A320 FCOM PRO-ABN-NAV, a320_fcom.txt line numbers at each function).
 * The ADR and IR faults come from the ADIRUs (systems navigation/adirs.rs): the ADR and IR FAULT discretes, which also
 * drive the FAULT lights of the ADIRS panel (FCOM DSC-34-NAV-10-20, l.52605-52615).
 *
 * The STATUS lines that belong to the flight control law (MAX SPEED 320 KT, ALTN LAW: PROT LOST, WHEN L/G DN: DIRECT
 * LAW, INOP SYS F/CTL PROT) are not repeated here: the FCOM gives them as the associated procedure F/CTL ALTN LAW (PROT
 * LOST), and the F/CTL ALTN LAW alert gives them when the ELACs revert (Logic/FlightControlStatus altnLawStatus).
 * Not shown: the options STEEP APPR, GLS AUTOLAND, ROW/ROP, and the reminder "This line is replaced by FOR LDG : USE
 * FLAP 3 when CONF 3 is selected".
 */

/** An ADIRU, ADR or IR number */
export type AdirsUnit = 1 | 2 | 3;

/** Two units, in increasing order */
export type AdirsPair = [AdirsUnit, AdirsUnit];

/**
 * The STATUS codes of the NAV alerts (StatusMessages). A line that another alert already has keeps its code, so that the
 * STATUS page shows it once (StatusMessages orderStatusCodes).
 */
export const NavStatusCodes = {
  // INOP SYS
  reacWsDet: '340300020',
  adr1: '240300107',
  adr2: '240300108',
  adr3: '240300109',
  adr12: '340300021',
  adr13: '340300022',
  adr23: '340300023',
  adr123: '340300024',
  ir1: '340300025',
  ir2: '340300026',
  ir3: '340300027',
  ir12: '340300028',
  ir13: '340300029',
  ir23: '340300030',
  ra1: '240300110',
  ra2: '240300111',
  ra12: '340300031',
  rudTrvLim: '340300032',
  rudTrvLim1: '240300140',
  rudTrvLim2: '240300141',
  yawDamper: '290300045',
  yawDamper1: '290300046',
  yawDamper2: '290300047',
  ap12: '270300027',
  athr: '240300131',
  cabPr12: '340300033',
  aCallOut: '340300034',
  gpws: '240300152',
  gpwsTerr: '240300153',
  tcas: '340300004',
  xpdr1: '340300005',
  xpdr2: '340300006',
  cat2: '270300028',
  cat3: '240300128',
  cat3Dual: '220300001',
  // Limitations, conditions and information
  stbyInstMayBeUnrel: '340400001',
  lgGravityExtension: '340400002',
  ifNoSpeedDisagree: '340500001',
  riskOfUndueStallWarn: '340200010',
  irMayBeAvailInAtt: '340200011',
  cat3SingleOnly: '220200001',
  cat2Only: '240200102',
  bothPfdOnSameFac: '240200105',
  flsLimited: '340200001',
} as const;

const S = NavStatusCodes;

/** The E/WD codes of the NAV ADR and IR alerts (EwdMessages): title first, then the lines of the *Lines functions */
export const AdirsEwdCodes = {
  adrFault: {
    1: ['340030001', '340030002', '340030003'],
    2: ['340031001', '340031002', '340031003', '340031004'],
    3: ['340032001', '340032002', '340032003'],
  },
  adrDualFault: [
    '340033001',
    '340033002',
    '340033003',
    '340033004',
    '340033005',
    '340033006',
    '340033007',
    '340033008',
    '340033009',
    '340033010',
  ],
  adrTripleFault: [
    '340036001',
    '340036002',
    '340036003',
    '340036004',
    '340036005',
    '340036006',
    '340036007',
    '340036008',
  ],
  adrDisagree: ['340037001', '340037002', '340037003', '340037004', '340037005'],
  irFault: {
    1: ['340040001', '340040002', '340040003'],
    2: ['340041001', '340041002', '340041003'],
    3: ['340042001'],
  },
  irDualFault: ['340043001', '340043002', '340043003', '340043004', '340043005'],
  irDisagree: ['340046001', '340046002', '340046003', '340046004', '340046005'],
  ra1And2Fault: ['340014501'],
  raDegraded: ['340015501'],
} as const;

/** The approach procedure lines of the NAV STATUS figures (APPR PROC, FOR LDG USE FLAP 3, ...) */
const APPROACH_WITH_FLAP_3 = [
  F.apprProc,
  F.forLandingUseFlap3,
  F.gpwsLandingFlap3On,
  F.apprSpdVref10,
  F.ldgDistProcApply,
];

/** The ADR and IR fault alerts */
export interface AdirsFaultAlerts {
  /** NAV ADR 1(2)(3) FAULT, by ADR (index 0 = ADR 1): this ADR is the only faulty one */
  adrFault: [boolean, boolean, boolean];
  /** NAV ADR 1+2(1+3)(2+3) FAULT: the two faulty ADRs, null without exactly two */
  adrDualFault: AdirsPair | null;
  /** NAV ADR 1+2+3 FAULT */
  adrTripleFault: boolean;
  /** NAV IR 1(2)(3) FAULT, by IR: this IR is the only faulty one */
  irFault: [boolean, boolean, boolean];
  /** NAV IR 1+2(1+3)(2+3) FAULT: the two faulty IRs, null without exactly two */
  irDualFault: AdirsPair | null;
}

function faultyUnits(faulty: readonly boolean[]): AdirsUnit[] {
  return ([1, 2, 3] as AdirsUnit[]).filter((unit) => faulty[unit - 1]);
}

/**
 * The ADR and IR fault alerts from the faulty units. The FCOM has one alert per number of faulty units:
 * NAV ADR 1(2)(3) FAULT "triggers when the ADR 1(2)(3) is failed" (l.91937), NAV ADR 1+2(1+3)(2+3) FAULT "when two ADRs
 * are failed" (l.92021), NAV ADR 1+2+3 FAULT "when the three ADRs are failed" (l.92196), NAV IR 1(2)(3) FAULT "when the
 * IR 1(2)(3) is failed" (l.93316), NAV IR 1+2(1+3)(2+3) FAULT "when IR 1+2(1+3)(2+3) are failed" (l.93421). The FCOM has
 * no alert for three failed IRs: none is given then.
 * @param adrFaulty the ADR FAULT discrete of ADR 1, 2 and 3
 * @param irFaulty the IR FAULT discrete of IR 1, 2 and 3
 * @returns the alerts
 */
export function adirsFaultAlerts(adrFaulty: readonly boolean[], irFaulty: readonly boolean[]): AdirsFaultAlerts {
  const adrs = faultyUnits(adrFaulty);
  const irs = faultyUnits(irFaulty);
  const single = (units: AdirsUnit[]): [boolean, boolean, boolean] => [
    units.length === 1 && units[0] === 1,
    units.length === 1 && units[0] === 2,
    units.length === 1 && units[0] === 3,
  ];
  return {
    adrFault: single(adrs),
    adrDualFault: adrs.length === 2 ? [adrs[0], adrs[1]] : null,
    adrTripleFault: adrs.length === 3,
    irFault: single(irs),
    irDualFault: irs.length === 2 ? [irs[0], irs[1]] : null,
  };
}

/** The index of a pair in the title codes 1+2, 1+3, 2+3 */
function pairIndex(pair: AdirsPair): number {
  if (pair[0] === 1) {
    return pair[1] === 2 ? 0 : 1;
  }
  return 2;
}

/**
 * NAV ADR 1(2)(3) FAULT lines (FCOM l.91964-91990). An action line goes when it is done.
 * - ADR 1: title, AIR DATA SWTG CAPT 3, ADR 1 P/B OFF;
 * - ADR 2: title, AIR DATA SWTG F/O 3, ADR 2 P/B OFF, BARO REF CHECK;
 * - ADR 3: title, ADR 3 P/B OFF, "AIR DATA SWTG (IF ADR 3 IN USE) NORM".
 * @param adr the faulty ADR
 * @param airDataKnob the AIR DATA selector
 * @param adrPbOn the ADR pb-sw of the faulty ADR is ON
 * @returns the line indexes of the alert of this ADR (EwdMessages 3400300xx, 3400310xx, 3400320xx)
 */
export function adrFaultLines(adr: AdirsUnit, airDataKnob: AirDataSwitchingKnob, adrPbOn: boolean): (number | null)[] {
  switch (adr) {
    case 1:
      return [0, airDataKnob !== AirDataSwitchingKnob.Capt ? 1 : null, adrPbOn ? 2 : null];
    case 2:
      return [0, airDataKnob !== AirDataSwitchingKnob.Fo ? 1 : null, adrPbOn ? 2 : null, 3];
    default:
      return [0, adrPbOn ? 1 : null, airDataKnob !== AirDataSwitchingKnob.Norm ? 2 : null];
  }
}

/**
 * NAV ADR 1+2(1+3)(2+3) FAULT lines (EwdMessages 3400330xx: titles 1+2, 1+3, 2+3, AIR DATA SWTG CAPT 3, AIR DATA SWTG
 * NORM, ATC/XPDR SYS 2, ATC/XPDR SYS 1, ADR 1 P/B OFF, ADR 2 P/B OFF, ADR 3 P/B OFF), FCOM l.92049-92080:
 * - ADR 1+2: AIR DATA SWTG CAPT 3, ADR (AFFECTED) P/B OFF;
 * - ADR 1+3 (or 2+3): AIR DATA SWTG NORM, "ATC/XPDR (IF ADR 1 FAILED) SYS 2", "ATC/XPDR (IF ADR 2 FAILED) SYS 1",
 *   ADR (AFFECTED) P/B OFF.
 * The ATC/XPDR line shows while the transponder of the failed ADR is in use and the other one works, as in NAV ATC/XPDR
 * 1(2) FAULT (TransponderSystem isXpdrSwitchLineShown).
 * @param pair the faulty ADRs
 * @param airDataKnob the AIR DATA selector
 * @param adrPbOn the ADR 1, 2, 3 pb-sw are ON
 * @param xpdr1LineShown the transponder 1 is in use and the transponder 2 works
 * @param xpdr2LineShown the transponder 2 is in use and the transponder 1 works
 * @returns the line indexes
 */
export function adrDualFaultLines(
  pair: AdirsPair,
  airDataKnob: AirDataSwitchingKnob,
  adrPbOn: readonly boolean[],
  xpdr1LineShown: boolean,
  xpdr2LineShown: boolean,
): (number | null)[] {
  const adr12 = pair[0] === 1 && pair[1] === 2;
  const affected = (adr: AdirsUnit) => pair.includes(adr);
  return [
    pairIndex(pair),
    adr12 && airDataKnob !== AirDataSwitchingKnob.Capt ? 3 : null,
    !adr12 && airDataKnob !== AirDataSwitchingKnob.Norm ? 4 : null,
    !adr12 && affected(1) && xpdr1LineShown ? 5 : null,
    !adr12 && affected(2) && xpdr2LineShown ? 6 : null,
    affected(1) && adrPbOn[0] ? 7 : null,
    affected(2) && adrPbOn[1] ? 8 : null,
    affected(3) && adrPbOn[2] ? 9 : null,
  ];
}

/**
 * NAV ADR 1+2+3 FAULT lines (EwdMessages 3400360xx), FCOM l.92222-92240 (the variant without the BKUP SPD/ALT pb, which
 * the FBW A320 does not have): AP+FD OFF, A/THR OFF, PROBE/WINDOW HEAT ON, ADR 1+2+3 P/B OFF, SPD FLY THE GREEN, STBY INST
 * MAY BE UNREL, ALL ADR OFF PROC APPLY. An action line goes when it is done.
 * @param apOrFdEngaged an autopilot or a flight director is engaged
 * @param athrEngaged the autothrust is engaged
 * @param probeWindowHeatOn the PROBE/WINDOW HEAT pb-sw is ON
 * @param anyAdrPbOn one of the ADR pb-sw is ON
 * @returns the line indexes
 */
export function adrTripleFaultLines(
  apOrFdEngaged: boolean,
  athrEngaged: boolean,
  probeWindowHeatOn: boolean,
  anyAdrPbOn: boolean,
): (number | null)[] {
  return [
    0,
    apOrFdEngaged ? 1 : null,
    athrEngaged ? 2 : null,
    probeWindowHeatOn ? null : 3,
    anyAdrPbOn ? 4 : null,
    5,
    6,
    7,
  ];
}

/**
 * NAV IR 1(2)(3) FAULT lines (FCOM l.93343-93354): IR 1: ATT HDG SWTG CAPT 3, ATC/XPDR SYS 2; IR 2: ATT HDG SWTG F/O 3,
 * ATC/XPDR SYS 1; IR 3: none ("ATT HDG SWTG (IF IR 3 IN USE) NORM ... This line is not displayed on the ECAM").
 * @param ir the faulty IR
 * @param attHdgKnob the ATT HDG selector
 * @param xpdrLineShown the transponder of the faulty IR's side is in use and the other one works
 * @returns the line indexes of the alert of this IR (EwdMessages 3400400xx, 3400410xx, 3400420xx)
 */
export function irFaultLines(
  ir: AdirsUnit,
  attHdgKnob: AttHdgSwitchingKnob,
  xpdrLineShown: boolean,
): (number | null)[] {
  switch (ir) {
    case 1:
      return [0, attHdgKnob !== AttHdgSwitchingKnob.Capt ? 1 : null, xpdrLineShown ? 2 : null];
    case 2:
      return [0, attHdgKnob !== AttHdgSwitchingKnob.Fo ? 1 : null, xpdrLineShown ? 2 : null];
    default:
      return [0];
  }
}

/**
 * NAV IR 1+2(1+3)(2+3) FAULT lines (EwdMessages 3400430xx: titles 1+2, 1+3, 2+3, ATT HDG SWTG CAPT 3, ATT HDG SWTG NORM),
 * FCOM l.93444-93451: "If IR 1 + 2 FAULT: ATT HDG SWTG ... CAPT 3", "If IR 1 + 3 (or 2 + 3) FAULT: ATT HDG SWTG ... NORM".
 * @param pair the faulty IRs
 * @param attHdgKnob the ATT HDG selector
 * @returns the line indexes
 */
export function irDualFaultLines(pair: AdirsPair, attHdgKnob: AttHdgSwitchingKnob): (number | null)[] {
  const ir12 = pair[0] === 1 && pair[1] === 2;
  return [
    pairIndex(pair),
    ir12 && attHdgKnob !== AttHdgSwitchingKnob.Capt ? 3 : null,
    !ir12 && attHdgKnob !== AttHdgSwitchingKnob.Norm ? 4 : null,
  ];
}

/**
 * The flight phase inhibition of NAV ADR 3 FAULT and NAV IR 3 FAULT in phase 3. FCOM l.91941-91943: "Not inhibited in
 * flight phase 3 in the case of NAV ADR 3 FAULT while the ADR 3 is in use. Not inhibited in flight phases 3, 5, and 7 in
 * the case of NAV ADR 1(2) FAULT."; l.93320-93322: "Alert not inhibited in flight phase 3 in the case of NAV IR 3 FAULT
 * while the ADR 3 is in use" (the IR 3 is meant: the IR 3 is in use with the ATT HDG selector off NORM).
 * @param flightPhase the FWC flight phase
 * @param unit3InUse the ADR 3 (IR 3) replaces the ADR (IR) of one side
 * @returns whether the alert of unit 3 is inhibited by the phase 3 rule
 */
export function unit3AlertInhibitedInPhase3(flightPhase: number, unit3InUse: boolean): boolean {
  return flightPhase === 3 && !unit3InUse;
}

/** ADR 1(2)(3) FAULT STATUS (FCOM l.91996-91999): CAT 3 SINGLE ONLY; INOP SYS ADR 1(2)(3), CAT 3 DUAL, GPWS (ADR 1) */
export function adrFaultStatus(adr: AdirsUnit): StatusLines {
  return {
    left: [S.cat3SingleOnly],
    inopSys: [[S.adr1, S.adr2, S.adr3][adr - 1], S.cat3Dual, ...(adr === 1 ? [S.gpws] : [])],
  };
}

/**
 * ADR 1+2(1+3)(2+3) FAULT STATUS (FCOM l.92131-92183): APPR PROC FOR LDG USE FLAP 3, GPWS LDG FLAP 3 ON, if ADR 1+3: L/G
 * GRVTY EXTN, APPR SPD VREF+10 KT, LDG DIST PROC APPLY, FLS LIMITED TO F-APP + RAW, if ADR 1+3 (or 2+3): BOTH PFD ON
 * THE SAME FAC; INOP SYS ADR (pair), AP 1+2, A/THR, ATC/XPDR 1 (ADR 1 failed), ATC/XPDR 2 (ADR 2 failed), RUD TRV LIM
 * 1(2) (ADR 1+3, 2+3), GPWS (ADR 1 failed), CAT 2.
 */
export function adrDualFaultStatus(pair: AdirsPair): StatusLines {
  const index = pairIndex(pair);
  const adr13 = index === 1;
  const adr23 = index === 2;
  const affected = (adr: AdirsUnit) => pair.includes(adr);
  return {
    left: [
      F.apprProc,
      F.forLandingUseFlap3,
      F.gpwsLandingFlap3On,
      ...(adr13 ? [S.lgGravityExtension] : []),
      F.apprSpdVref10,
      F.ldgDistProcApply,
      S.flsLimited,
      ...(adr13 || adr23 ? [S.bothPfdOnSameFac] : []),
    ],
    inopSys: [
      [S.adr12, S.adr13, S.adr23][index],
      S.ap12,
      S.athr,
      ...(affected(1) ? [S.xpdr1] : []),
      ...(affected(2) ? [S.xpdr2] : []),
      ...(adr13 ? [S.rudTrvLim1] : []),
      ...(adr23 ? [S.rudTrvLim2] : []),
      ...(affected(1) ? [S.gpws] : []),
      S.cat2,
    ],
  };
}

/**
 * ADR 1+2+3 FAULT STATUS (FCOM l.92272-92297): STBY INST MAY BE UNREL, APPR PROC FOR LDG USE FLAP 3, L/G GRVTY EXTN;
 * INOP SYS REAC W/S DET, ADR 1+2+3, RUD TRV LIM, YAW DAMPER, AP 1+2, A/THR, CAB PR 1+2, GPWS, ATC/XPDR 1, ATC/XPDR 2.
 */
export function adrTripleFaultStatus(): StatusLines {
  return {
    left: [S.stbyInstMayBeUnrel, F.apprProc, F.forLandingUseFlap3, S.lgGravityExtension],
    inopSys: [S.reacWsDet, S.adr123, S.rudTrvLim, S.yawDamper, S.ap12, S.athr, S.cabPr12, S.gpws, S.xpdr1, S.xpdr2],
  };
}

/**
 * IR 1(2)(3) FAULT STATUS (FCOM l.93374-93389): IR MAY BE AVAIL IN ATT, CAT 3 SINGLE ONLY; INOP SYS IR 1(2)(3), CAT 3
 * DUAL, GPWS TERR, TCAS and ATC/XPDR 1 (IR 1 fault), ATC/XPDR 2 (IR 2 fault).
 */
export function irFaultStatus(ir: AdirsUnit): StatusLines {
  return {
    left: [S.irMayBeAvailInAtt, S.cat3SingleOnly],
    inopSys: [
      [S.ir1, S.ir2, S.ir3][ir - 1],
      S.cat3Dual,
      ...(ir === 1 ? [S.gpwsTerr, S.tcas, S.xpdr1] : []),
      ...(ir === 2 ? [S.xpdr2] : []),
    ],
  };
}

/**
 * IR 1+2(1+3)(2+3) FAULT STATUS (FCOM l.93487-93521): APPR PROC FOR LDG USE FLAP 3, GPWS LDG FLAP 3 ON, APPR SPD
 * VREF+10 KT, LDG DIST PROC APPLY, IR (AFFECTED) MAY BE AVAIL IN ATT, FLS LIMITED TO F-APP + RAW; INOP SYS IR (pair),
 * AP 1+2, A/THR, YAW DAMPER 1 (IR 1+3), YAW DAMPER 2 (IR 2+3), GPWS TERR (IR 1 fault), TCAS, CAT 2, ATC/XPDR 1 (IR 1
 * failed), ATC/XPDR 2 (IR 2 failed).
 */
export function irDualFaultStatus(pair: AdirsPair): StatusLines {
  const index = pairIndex(pair);
  const affected = (ir: AdirsUnit) => pair.includes(ir);
  return {
    left: [...APPROACH_WITH_FLAP_3, S.irMayBeAvailInAtt, S.flsLimited],
    inopSys: [
      [S.ir12, S.ir13, S.ir23][index],
      S.ap12,
      S.athr,
      ...(index === 1 ? [S.yawDamper1] : []),
      ...(index === 2 ? [S.yawDamper2] : []),
      ...(affected(1) ? [S.gpwsTerr] : []),
      S.tcas,
      S.cat2,
      ...(affected(1) ? [S.xpdr1] : []),
      ...(affected(2) ? [S.xpdr2] : []),
    ],
  };
}

/**
 * ADR DISAGREE STATUS (FCOM l.92506-92527): APPR PROC FOR LDG USE FLAP 3, GPWS LDG FLAP 3 ON, APPR SPD VREF+10, LDG DIST
 * PROC APPLY, "IF NO SPD DISAGREE: RISK OF UNDUE STALL WARN" (the law lines come with F/CTL ALTN LAW).
 */
export function adrDisagreeStatus(): StatusLines {
  return { left: [...APPROACH_WITH_FLAP_3, S.ifNoSpeedDisagree, S.riskOfUndueStallWarn], inopSys: [] };
}

/** IR DISAGREE STATUS (FCOM l.93609-93624): APPR PROC FOR LDG USE FLAP 3, GPWS LDG FLAP 3 ON, APPR SPD, LDG DIST PROC */
export function irDisagreeStatus(): StatusLines {
  return { left: [...APPROACH_WITH_FLAP_3], inopSys: [] };
}

/** RA 1(2) FAULT STATUS (FCOM l.93833-93840): CAT 2 ONLY; INOP SYS RA 1(2), CAT 3 */
export function raFaultStatus(ra: 1 | 2): StatusLines {
  return { left: [S.cat2Only], inopSys: [ra === 1 ? S.ra1 : S.ra2, S.cat3] };
}

/**
 * RA 1 AND 2 FAULT STATUS (FCOM l.93789-93807): APPR PROC FOR LDG USE FLAPS 3, GPWS LDG FLAP 3 ON, APPR SPD VREF+10 KT,
 * LDG DIST PROC APPLY, WHEN L/G DN: DIRECT LAW; INOP SYS RA 1+2, A/CALL OUT, GPWS, CAT 2, REAC W/S DET, TCAS.
 */
export function ra1And2FaultStatus(): StatusLines {
  return {
    left: [...APPROACH_WITH_FLAP_3, F.whenLgDownDirectLaw],
    inopSys: [S.ra12, S.aCallOut, S.gpws, S.cat2, S.reacWsDet, S.tcas],
  };
}

/** The RA fault alerts: NAV RA 1 AND 2 FAULT replaces the two NAV RA 1(2) FAULT alerts */
export interface RaFaultAlerts {
  ra1Fault: boolean;
  ra2Fault: boolean;
  ra1And2Fault: boolean;
}

/**
 * NAV RA 1(2) FAULT "triggers when the RA 1(2) is failed" (FCOM l.93829), NAV RA 1 AND 2 FAULT "when both RAs are
 * failed" (l.93763): the dual alert replaces the two single ones.
 * @param ra1Failed RA 1 is failed
 * @param ra2Failed RA 2 is failed
 * @returns the alerts
 */
export function raFaultAlerts(ra1Failed: boolean, ra2Failed: boolean): RaFaultAlerts {
  const ra1And2Fault = ra1Failed && ra2Failed;
  return { ra1Fault: ra1Failed && !ra1And2Fault, ra2Fault: ra2Failed && !ra1And2Fault, ra1And2Fault };
}

/** The NAV RA DEGRADED thresholds (design choice, see radioAltitudesDisagree) */
export const RA_DEGRADED_MIN_DIFFERENCE_FT = 15;
export const RA_DEGRADED_RELATIVE_DIFFERENCE = 0.1;

/**
 * NAV RA DEGRADED "triggers when the height that RA 1 and RA 2 provide are significantly different" (FCOM l.93862).
 * Design choice (the FCOM gives no value): both heights are valid and differ by more than 15 ft or 10 % of the higher
 * height. The FWC confirms the condition before the alert.
 * @param height1 the RA 1 height in feet when its word is normal operation, else null
 * @param height2 the RA 2 height in feet when its word is normal operation, else null
 * @returns whether the heights disagree
 */
export function radioAltitudesDisagree(height1: number | null, height2: number | null): boolean {
  if (height1 === null || height2 === null) {
    return false;
  }
  const threshold = Math.max(
    RA_DEGRADED_MIN_DIFFERENCE_FT,
    RA_DEGRADED_RELATIVE_DIFFERENCE * Math.max(height1, height2),
  );
  return Math.abs(height1 - height2) > threshold;
}

/**
 * The ADR comparison thresholds. The A320 FCOM gives none: these are the A380 values of the "ADR monitoring by PRIM"
 * (A380 FCOM DSC-34-10-30-10, a380_fcom.txt l.85708-85725: CAS 16 kt, AOA 3.6 deg in flight and 8 deg on ground), a
 * design choice.
 */
export const ADR_DISAGREE_CAS_THRESHOLD_KT = 16;
export const ADR_DISAGREE_AOA_THRESHOLD_IN_FLIGHT_DEG = 3.6;
export const ADR_DISAGREE_AOA_THRESHOLD_ON_GROUND_DEG = 8;

/**
 * The IR comparison threshold of attitude and heading (design choice: the FCOM gives no value).
 */
export const IR_DISAGREE_THRESHOLD_DEG = 5;

/**
 * Whether the remaining sources of a parameter disagree, after the ELACs have rejected an outlier. With two sources: they
 * differ. With three: an outlier (one source that differs from the two others, which agree) is rejected and the two
 * others agree; when the three differ from one another, the two that remain after a rejection still differ.
 * @param values the parameter of each source, null when the source does not give it (faulty, not valid)
 * @param threshold the largest difference that still agrees
 * @param difference the difference of two values (absolute value)
 * @returns whether the remaining sources disagree
 */
export function remainingSourcesDisagree(
  values: readonly (number | null)[],
  threshold: number,
  difference: (a: number, b: number) => number = (a, b) => Math.abs(a - b),
): boolean {
  const present = values.filter((value): value is number => value !== null);
  const differ = (a: number, b: number) => difference(a, b) > threshold;
  if (present.length === 2) {
    return differ(present[0], present[1]);
  }
  if (present.length === 3) {
    return differ(present[0], present[1]) && differ(present[0], present[2]) && differ(present[1], present[2]);
  }
  return false;
}

/** The data of one ADR for the ADR DISAGREE monitoring */
export interface AdrComparisonData {
  /** The computed airspeed in knots, null when the ADR is faulty or its word is not normal operation */
  cas: number | null;
  /** The angle of attack in degrees, null when the ADR is faulty or its word is not normal operation */
  aoa: number | null;
}

/** The result of the ADR DISAGREE monitoring */
export interface AdrDisagreement {
  speed: boolean;
  angleOfAttack: boolean;
}

/**
 * NAV ADR DISAGREE (FCOM l.92448-92450): "This alert triggers when the following conditions occur: The ELAC rejected an
 * ADR, or an ADR is faulty; The speed or the Angle Of Attack (AOA) from the two remaining ADRs are different." The FBW
 * ELACs do not compare the ADR values, so the FWC does the rejection here (see remainingSourcesDisagree).
 * @param adrs the data of ADR 1, 2 and 3
 * @param onGround the aircraft is on the ground (larger AOA threshold)
 * @returns which parameters of the remaining ADRs disagree
 */
export function adrDisagreement(adrs: readonly AdrComparisonData[], onGround: boolean): AdrDisagreement {
  return {
    speed: remainingSourcesDisagree(
      adrs.map((adr) => adr.cas),
      ADR_DISAGREE_CAS_THRESHOLD_KT,
    ),
    angleOfAttack: remainingSourcesDisagree(
      adrs.map((adr) => adr.aoa),
      onGround ? ADR_DISAGREE_AOA_THRESHOLD_ON_GROUND_DEG : ADR_DISAGREE_AOA_THRESHOLD_IN_FLIGHT_DEG,
    ),
  };
}

/** The data of one IR for the IR DISAGREE monitoring, null when its word is not normal operation */
export interface IrComparisonData {
  failed: boolean;
  pitch: number | null;
  roll: number | null;
  heading: number | null;
}

/** The difference of two headings in degrees, across north */
export function headingDifference(a: number, b: number): number {
  const difference = Math.abs(a - b) % 360;
  return difference > 180 ? 360 - difference : difference;
}

/**
 * NAV IR DISAGREE (FCOM l.93543-93544): "This alert triggers when one IR is failed, and the information received from
 * the two remaining IRs is different." Compared: pitch, roll and heading, above IR_DISAGREE_THRESHOLD_DEG.
 * @param irs the data of IR 1, 2 and 3
 * @returns whether the alert conditions are met
 */
export function irDisagree(irs: readonly IrComparisonData[]): boolean {
  const remaining = irs.filter((ir) => !ir.failed);
  if (remaining.length !== 2) {
    return false;
  }
  const [a, b] = remaining;
  const differ = (x: number | null, y: number | null, difference: (p: number, q: number) => number) =>
    x !== null && y !== null && difference(x, y) > IR_DISAGREE_THRESHOLD_DEG;
  const linear = (p: number, q: number) => Math.abs(p - q);
  return (
    differ(a.pitch, b.pitch, linear) ||
    differ(a.roll, b.roll, linear) ||
    differ(a.heading, b.heading, headingDifference)
  );
}

/** The ADIRS inputs of the NAV ADR and IR alerts */
export interface AdirsAlertInputs {
  /** The ADR FAULT discretes of ADR 1, 2, 3 (L:A32NX_ADIRS_ADR_n_FAULT_WARN_DISCRETE) */
  adrFaulty: boolean[];
  /** The IR FAULT discretes of IR 1, 2, 3 (L:A32NX_ADIRS_IR_n_FAULT_WARN_DISCRETE) */
  irFaulty: boolean[];
  /** The ADR 1, 2, 3 pb-sw are ON */
  adrPbOn: boolean[];
  /** An autopilot or a flight director is engaged */
  apOrFdEngaged: boolean;
  /** The PROBE/WINDOW HEAT pb-sw is ON */
  probeWindowHeatOn: boolean;
  /** The data of ADR 1, 2, 3 for the ADR DISAGREE monitoring: none from a faulty ADR */
  adrData: AdrComparisonData[];
  /** The data of IR 1, 2, 3 for the IR DISAGREE monitoring */
  irData: IrComparisonData[];
}

/**
 * Reads the ADIRS inputs of the NAV ADR and IR alerts.
 * @param read reads a simulation variable (SimVar.GetSimVarValue)
 * @returns the inputs
 */
export function readAdirsAlertInputs(read: (name: string, unit: string) => number): AdirsAlertInputs {
  const units = [1, 2, 3];
  const word = (name: string) => new Arinc429Word(read(name, 'number'));
  const normalValue = (data: Arinc429Word) => (data.isNormalOperation() ? data.value : null);
  const adrFaulty = units.map((adr) => read(`L:A32NX_ADIRS_ADR_${adr}_FAULT_WARN_DISCRETE`, 'bool') > 0);
  const irFaulty = units.map((ir) => read(`L:A32NX_ADIRS_IR_${ir}_FAULT_WARN_DISCRETE`, 'bool') > 0);
  return {
    adrFaulty,
    irFaulty,
    adrPbOn: units.map((adr) => read(`L:A32NX_OVHD_ADIRS_ADR_${adr}_PB_IS_ON`, 'bool') > 0),
    apOrFdEngaged: [1, 2].some(
      (fmgc) =>
        read(`L:A32NX_FMGC_${fmgc}_AP_ENGAGED`, 'bool') > 0 || read(`L:A32NX_FMGC_${fmgc}_FD_ENGAGED`, 'bool') > 0,
    ),
    probeWindowHeatOn: read('L:A32NX_MAN_PITOT_HEAT', 'bool') > 0,
    adrData: units.map((adr, index) =>
      adrFaulty[index]
        ? { cas: null, aoa: null }
        : {
            cas: normalValue(word(`L:A32NX_ADIRS_ADR_${adr}_COMPUTED_AIRSPEED`)),
            aoa: normalValue(word(`L:A32NX_ADIRS_ADR_${adr}_ANGLE_OF_ATTACK`)),
          },
    ),
    // An IR that is faulty or gives a failure warning attitude counts as failed
    irData: units.map((ir, index) => {
      const pitch = word(`L:A32NX_ADIRS_IR_${ir}_PITCH`);
      return {
        failed: irFaulty[index] || pitch.isFailureWarning(),
        pitch: normalValue(pitch),
        roll: normalValue(word(`L:A32NX_ADIRS_IR_${ir}_ROLL`)),
        heading: normalValue(word(`L:A32NX_ADIRS_IR_${ir}_HEADING`)),
      };
    }),
  };
}
