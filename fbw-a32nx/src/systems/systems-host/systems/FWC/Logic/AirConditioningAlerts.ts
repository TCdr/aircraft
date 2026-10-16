// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { Arinc429Word } from '@flybywiresim/fbw-sdk';
import { SdPages as EcamSysPage } from '@shared/SdPages';
import { CondStatusCodes, StatusLines } from './CondStatus';
import { ConfirmTimer, FwcAlertItem, cautionItem } from './FwcAlertItem';

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

/**
 * How long both FMGC landing elevation words must stay in failure before CAB PR LDG ELEV FAULT, in seconds. Design
 * choice, the FCOM gives none: at power-up and at flight load the words read 0 (SSM failure warning) until the FMGC
 * software writes its first word; about 6 s was recorded in the sim on 2026-10-15. The FWC startup inhibit (FwsManager,
 * 5 s) only stops the MASTER lights and aurals, not the E/WD line, and it does not wait for the FMGCs; 15 s leaves margin
 * for a slower FMGC start.
 */
export const LDG_ELEV_FAULT_FMGC_CONFIRM_SECONDS = 15;

export interface LandingElevationFaultInputs {
  /** The LDG ELEV selector is at AUTO (the active CPC does not report a manual landing elevation, discrete bit 17) */
  readonly ldgElevSelectorAuto: boolean;
  /** At least one CPC operates (not CAB PR SYS 1+2 FAULT): the CPC is the one that misses the FMGS elevation */
  readonly cpcOperative: boolean;
  /**
   * At least one healthy FMGC sends its landing elevation word, with or without a value (L:A32NX_FM1(2)_LANDING_ELEVATION
   * in normal operation or no computed data), see isFmgcLandingElevationWordReceived
   */
  readonly fmLandingElevationWordReceived: boolean;
}

/**
 * CAB PR LDG ELEV FAULT: "This alert triggers when the LDG ELEV selector is set to AUTO and the landing field elevation
 * of the FMGS is not available." (PRO-ABN-CAB_PR, l.73186-73187). The FCOM lists the alert only after FMGC failures:
 * "DUAL RESET WITH LOSS OF DATA" (DSC-22_20-90-10, l.26801) and "DUAL LATCH" (both FMGCs inoperative, l.26904).
 * User decision 2026-10-15: the elevation is "not available" when no FMGC sends it at all (each FMGC unhealthy or its
 * word in failure), not when the FMGC has no destination yet (SSM NCD, A32NX_FMCMainDisplay), else the caution showed at every power-up until
 * a destination was entered. The FMGC failure has to last LDG_ELEV_FAULT_FMGC_CONFIRM_SECONDS (CabinPressureAlerts).
 * With both CPCs failed, the FWC shows SYS 1+2 FAULT and its MAN pressurization procedure instead (design choice).
 *
 * @param fmgcDataLossConfirmed both FMGC words have been in failure for the confirmation time
 */
export function isLandingElevationFault(
  inputs: Pick<LandingElevationFaultInputs, 'ldgElevSelectorAuto' | 'cpcOperative'>,
  fmgcDataLossConfirmed: boolean,
): boolean {
  return inputs.ldgElevSelectorAuto && inputs.cpcOperative && fmgcDataLossConfirmed;
}

/** What the FWC reads of one FMGC for the landing elevation */
export interface FmgcLandingElevationOutput {
  /** The raw ARINC 429 word L:A32NX_FM1(2)_LANDING_ELEVATION */
  readonly rawWord: number;
  /** L:A32NX_FM1(2)_HEALTHY_DISCRETE, 1 = healthy (the FM power state, A320_Neo_CDU_MainDisplay) */
  readonly healthy: boolean;
}

/**
 * Whether an FMGC sends its landing elevation: a healthy FMGC whose word is in normal operation (a destination is
 * entered) or no computed data (no destination yet). A word in failure warning (SSM 0, also the raw 0 an FMGC that never
 * wrote leaves) or an unhealthy FMGC means no data from it. The healthy discrete covers an FMGC lost in flight: the A32NX
 * FMS keeps its last word on the bus when it loses power, only the discrete goes false.
 */
export function isFmgcLandingElevationWordReceived(
  fm1: FmgcLandingElevationOutput,
  fm2: FmgcLandingElevationOutput,
): boolean {
  return [fm1, fm2].some((fm) => {
    const word = new Arinc429Word(fm.rawWord);
    return fm.healthy && (word.isNormalOperation() || word.isNoComputedData());
  });
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

  /** Both FMGC words in failure for LDG_ELEV_FAULT_FMGC_CONFIRM_SECONDS: rides through the FMGC start at power-up */
  private readonly fmgcDataLossConfirm = new ConfirmTimer(LDG_ELEV_FAULT_FMGC_CONFIRM_SECONDS);

  update(inputs: LandingElevationFaultInputs, deltaSeconds: number): void {
    const fmgcDataLossConfirmed = this.fmgcDataLossConfirm.update(!inputs.fmLandingElevationWordReceived, deltaSeconds);
    this.ldgElevFault.set(isLandingElevationFault(inputs, fmgcDataLossConfirmed));
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

/** Whether FMGC 1 or 2 sends its landing elevation word (the CPC takes the elevation from the FMGS, A32NX_FMCMainDisplay) */
export function readFmLandingElevationWordReceived(): boolean {
  const readFmgc = (fm: 1 | 2): FmgcLandingElevationOutput => ({
    rawWord: SimVar.GetSimVarValue(`L:A32NX_FM${fm}_LANDING_ELEVATION`, 'number'),
    healthy: SimVar.GetSimVarValue(`L:A32NX_FM${fm}_HEALTHY_DISCRETE`, 'bool') > 0,
  });
  return isFmgcLandingElevationWordReceived(readFmgc(1), readFmgc(2));
}
