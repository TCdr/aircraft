// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { Arinc429Word } from '@flybywiresim/fbw-sdk';
import { SdPages as EcamSysPage } from '@shared/SdPages';
import { CondStatusCodes, StatusLines } from './CondStatus';
import { FwcAlertItem, cautionItem } from './FwcAlertItem';

/*
 * Air conditioning and pressurization items of the A320 FWC (ATA 21) that the FCOM gap audit found missing:
 * - the RAM AIR ON memo, FCOM DSC-21-10-50 (a320_fcom.txt l.8642);
 * - the CAB PR LDG ELEV FAULT caution, FCOM PRO-ABN-CAB_PR (l.73175-73196);
 * - the STATUS lines of the CAB PR alerts: EXCESS CAB ALT (l.73131-73132), SAFETY VALVE OPEN (l.73330-73346),
 *   SYS 1(2) FAULT (l.73379-73383) and SYS 1+2 FAULT (l.73443-73459).
 * The flight phase inhibition figures are images, read on the FCOM PDF ("A320 Neo FCOM_1.pdf", page given at each one).
 */

/** "RAM AIR ON : This memo appears in green, if the RAM AIR pb-sw is ON." (DSC-21-10-50, l.8642) */
export function isRamAirOnMemoShown(ramAirPbOn: boolean): boolean {
  return ramAirPbOn;
}

/** The E/WD code of the RAM AIR ON memo */
export const RAM_AIR_ON_MEMO_CODE = '000024001';

/** The alert key of CAB PR LDG ELEV FAULT (EwdMessages 21312360x) */
export const LDG_ELEV_FAULT_KEY = '2131236';

/** CAB PR LDG ELEV FAULT flight phase inhibition (FCOM PDF page 4475): shown in phases 1, 2 and 6 only */
export const LDG_ELEV_FAULT_PHASE_INHIBITION = [3, 4, 5, 7, 8, 9, 10];

export interface LandingElevationFaultInputs {
  /** The LDG ELEV selector is at AUTO (the active CPC does not report a manual landing elevation, discrete bit 17) */
  readonly ldgElevSelectorAuto: boolean;
  /** At least one CPC operates (not CAB PR SYS 1+2 FAULT): the CPC is the one that misses the FMGS elevation */
  readonly cpcOperative: boolean;
  /** An FMGC sends the landing elevation (L:A32NX_FM1(2)_LANDING_ELEVATION in normal operation) */
  readonly fmLandingElevationAvailable: boolean;
}

/**
 * CAB PR LDG ELEV FAULT: "This alert triggers when the LDG ELEV selector is set to AUTO and the landing field elevation
 * of the FMGS is not available." (PRO-ABN-CAB_PR, l.73186-73187). The FMGC sends no computed landing elevation as long
 * as the flight plan has no destination (A32NX_FMCMainDisplay: SSM NCD). With both CPCs failed, the FWC shows SYS 1+2
 * FAULT and its MAN pressurization procedure instead (design choice).
 */
export function isLandingElevationFault(inputs: LandingElevationFaultInputs): boolean {
  return inputs.ldgElevSelectorAuto && inputs.cpcOperative && !inputs.fmLandingElevationAvailable;
}

/** The STATUS codes of the CAB PR alerts (StatusMessages) */
export const CabPrStatusCodes = {
  /** "MAN CAB PR CTL", the amber title of the manual pressurization part */
  manCabPrCtl: '210500002',
  climbTargetVs: '210400002',
  descentTargetVs: '210400003',
  /** The header and the rows of the A/C FL - CAB ALT TGT table */
  cabAltTargetHeader: '210500003',
  cabAltTargetRows: ['210400004', '210400005', '210400006', '210400007', '210400008'],
  duringFinalApproach: '210500004',
  /** MAN V/S CTL.....FULL UP (SAFETY VALVE OPEN) */
  manVsCtlFullUp: '210400009',
  /** V/S CTL.........FULL UP (SYS 1+2 FAULT) */
  vsCtlFullUp: '210400010',
  cabPr1: '240300164',
  cabPr2: '240300165',
  cabPr1And2: '210300013',
} as const;

const S = CabPrStatusCodes;

/** The manual pressurization part common to SAFETY VALVE OPEN and SYS 1+2 FAULT: target V/S and the cabin altitude table */
const MAN_CAB_PR_SCHEDULE = [
  S.manCabPrCtl,
  S.climbTargetVs,
  S.descentTargetVs,
  S.cabAltTargetHeader,
  ...S.cabAltTargetRows,
  S.duringFinalApproach,
];

/** CAB PR EXCESS CAB ALT STATUS (l.73131-73132): MAX FL 100/MEA-MORA */
export function excessCabinAltitudeStatus(): StatusLines {
  return { left: [CondStatusCodes.maxFl100], inopSys: [] };
}

/**
 * CAB PR SAFETY VALVE OPEN STATUS (l.73330-73346; the climb target V/S lost its line in the text, it is on the PDF
 * figure, 2019 FCOM PDF page 2102): MAN CAB PR CTL, TGT V/S CLIMB 500 / DESC 300 FT/MIN, the A/C FL - CAB ALT TGT table,
 * DURING FINAL APPR: MAN V/S CTL FULL UP. The CAUTION box of the FCOM page is a crew note, not an ECAM line.
 */
export function safetyValveOpenStatus(): StatusLines {
  return { left: [...MAN_CAB_PR_SCHEDULE, S.manVsCtlFullUp], inopSys: [] };
}

/** CAB PR SAFETY VALVE OPEN: "IF DIFF PR ABV 8 PSI" (l.73299), in PSI */
export const SAFETY_VALVE_OPEN_OVERPRESSURE_PSI = 8;

/** CAB PR SAFETY VALVE OPEN: "IF DIFF PR BELOW 0 PSI" (l.73310), in PSI */
export const SAFETY_VALVE_OPEN_NEGATIVE_PRESSURE_PSI = 0;

/**
 * CAB PR SAFETY VALVE OPEN E/WD lines (FCOM PRO-ABN-CAB_PR, a320_fcom.txt l.73299-73313), as indexes of the codes
 * 2131233xx: 0 title; 1 .IF DIFF PR BELOW 0 PSI, 2 -EXPECT HI CAB RATE, 3 -A/C V/S REDUCE (not with the excess
 * pressure discrete of the CPC); 4 .IF DIFF PR ABV 8 PSI, 5 -MODE SEL MAN (until MAN is selected), 6 -MAN V/S CTL AS
 * RQRD, 7 .IF UNSUCCESSFUL, 8 -A/C FL REDUCE.
 * @param deltaPressurePsi the cabin differential pressure, in PSI
 * @param excessPressure the excess pressure discrete of the active CPC (or the manual excess altitude)
 * @param pressurizationAuto the cabin pressure MODE SEL is AUTO
 * @returns the line indexes
 */
export function safetyValveOpenLines(
  deltaPressurePsi: number,
  excessPressure: boolean,
  pressurizationAuto: boolean,
): (number | null)[] {
  const negative = deltaPressurePsi < SAFETY_VALVE_OPEN_NEGATIVE_PRESSURE_PSI;
  const overpressure = deltaPressurePsi > SAFETY_VALVE_OPEN_OVERPRESSURE_PSI;
  return [
    0,
    negative ? 1 : null,
    negative ? 2 : null,
    negative && !excessPressure ? 3 : null,
    overpressure ? 4 : null,
    overpressure && pressurizationAuto ? 5 : null,
    overpressure ? 6 : null,
    overpressure ? 7 : null,
    overpressure ? 8 : null,
  ];
}

/** CAB PR SYS 1(2) FAULT STATUS (l.73379-73383): INOP SYS CAB PR 1(2) */
export function cpcFaultStatus(cpc: 1 | 2): StatusLines {
  return { left: [], inopSys: [cpc === 1 ? S.cabPr1 : S.cabPr2] };
}

/**
 * CAB PR SYS 1+2 FAULT STATUS (l.73443-73459, 2019 FCOM PDF page 2105): the manual pressurization part with
 * V/S CTL FULL UP during the final approach, INOP SYS CAB PR 1+2.
 */
export function cpc1And2FaultStatus(): StatusLines {
  return { left: [...MAN_CAB_PR_SCHEDULE, S.vsCtlFullUp], inopSys: [S.cabPr1And2] };
}

/** CAB PR LDG ELEV FAULT and its Subject */
export class CabinPressureAlerts {
  private readonly ldgElevFault = Subject.create(false);

  update(inputs: LandingElevationFaultInputs): void {
    this.ldgElevFault.set(isLandingElevationFault(inputs));
  }

  /** The alert items, by key, for the PseudoFWC ewdMessageFailures */
  public readonly ewdFailures: Record<string, FwcAlertItem> = {
    // CAB PR LDG ELEV FAULT, l.73195: "LDG ELEV ... ADJUST", until the selector leaves AUTO
    [LDG_ELEV_FAULT_KEY]: cautionItem(
      LDG_ELEV_FAULT_KEY,
      2,
      this.ldgElevFault,
      LDG_ELEV_FAULT_PHASE_INHIBITION,
      () => [0, 1],
      EcamSysPage.PRESS,
    ),
  };
}

/* Acquisition (not unit tested: SimVar reads only) */

/** Whether FMGC 1 or 2 sends the landing elevation (the CPC takes it from the FMGS, A32NX_FMCMainDisplay) */
export function readFmLandingElevationAvailable(): boolean {
  return (
    Arinc429Word.fromSimVarValue('L:A32NX_FM1_LANDING_ELEVATION').isNormalOperation() ||
    Arinc429Word.fromSimVarValue('L:A32NX_FM2_LANDING_ELEVATION').isNormalOperation()
  );
}
