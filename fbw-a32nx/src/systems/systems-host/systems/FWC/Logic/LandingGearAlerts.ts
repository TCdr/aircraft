// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Subject } from '@microsoft/msfs-sdk';
import { Arinc429Word } from '@flybywiresim/fbw-sdk';
import { SdPages as EcamSysPage } from '@shared/SdPages';
import { StatusLines } from './CondStatus';
import { ConfirmTimer } from './BleedAlerts';
import { FwcAlertItem, cautionItem } from './FwcAlertItem';

/*
 * Landing gear items of the A320 FWC (ATA 32), from the LGCIU words (docs/a320-simvars.md
 * A32NX_LGCIU_{number}_DISCRETE_WORD_1 and _3):
 * - L/G DOORS NOT CLOSED;
 * - L/G SYS DISAGREE;
 * - the STATUS of the ATA 32 alerts: GEAR NOT UPLOCKED, L/G DOORS NOT CLOSED, LGCIU 1(2) FAULT, LGCIU 1+2 FAULT and
 *   BRAKES A/SKID N/WS OFF.
 */

export const LandingGearAlertKeys = {
  doorsNotClosed: '3200135',
  sysDisagree: '3200200',
} as const;

/** L/G DOORS NOT CLOSED flight phase inhibition: shown in phases 2, 6 and 7 */
export const DOORS_NOT_CLOSED_PHASE_INHIBITION = [1, 3, 4, 5, 8, 9, 10];

/** L/G SYS DISAGREE flight phase inhibition: shown in phases 1, 2, 9 and 10 */
export const SYS_DISAGREE_PHASE_INHIBITION = [3, 4, 5, 6, 7, 8];

/**
 * The alert triggers when one gear door is not uplocked. The doors open for every gear extension and retraction.
 * Design choice: 30 s, as GEAR NOT UPLOCKED, which waits 30 s for the landing gear sequence to complete.
 */
export const DOORS_NOT_CLOSED_CONFIRM_SECONDS = 30;

/** L/G SYS DISAGREE confirmation time, in seconds: design choice, the two LGCIUs see the same gear at the same time */
const SYS_DISAGREE_CONFIRM_SECONDS = 1;

/** The gear position one LGCIU sends, null for a word that is not in normal operation */
export interface LgciuGearPosition {
  /** Discrete word 1 bits 23, 24, 25: LH, RH, nose gear downlocked */
  readonly downlocked: readonly [boolean, boolean, boolean] | null;
  /** Discrete word 3 bits 11, 12, 13: LH, RH, nose gear not locked up */
  readonly notLockedUp: readonly [boolean, boolean, boolean] | null;
  /** Discrete word 1 bits 17, 18, 19: LH, RH, nose gear door not uplocked (not closed) */
  readonly doorNotClosed: readonly [boolean, boolean, boolean] | null;
  /** Discrete word 3 bit 14: gear selected up (lever position) */
  readonly leverUp: boolean | null;
}

export interface LandingGearInputs {
  readonly lgcius: readonly [LgciuGearPosition, LgciuGearPosition];
  /** The GEAR NOT UPLOCKED warning is active: its procedure covers the doors of a gear that is not uplocked */
  readonly gearNotUplocked: boolean;
}

/**
 * A condition both LGCIUs agree on, or the one of the only valid LGCIU (as the FWC does for GEAR NOT UPLOCKED)
 * @param lgciu1 the condition from LGCIU 1, null without a valid word
 * @param lgciu2 the condition from LGCIU 2, null without a valid word
 */
export function fromValidLgcius(lgciu1: boolean | null, lgciu2: boolean | null): boolean {
  if (lgciu1 !== null && lgciu2 !== null) {
    return lgciu1 && lgciu2;
  }
  return lgciu1 ?? lgciu2 ?? false;
}

/** A gear door is not closed, from the valid LGCIUs, and the gear itself is uplocked or down (not GEAR NOT UPLOCKED) */
function isGearDoorNotClosed(inputs: LandingGearInputs): boolean {
  const [lgciu1, lgciu2] = inputs.lgcius;
  const doorNotClosed = [0, 1, 2].some((gear) =>
    fromValidLgcius(lgciu1.doorNotClosed?.[gear] ?? null, lgciu2.doorNotClosed?.[gear] ?? null),
  );
  return doorNotClosed && !inputs.gearNotUplocked;
}

/** The L/G lever is up, from the valid LGCIUs */
function isGearLeverUp(inputs: LandingGearInputs): boolean {
  return fromValidLgcius(inputs.lgcius[0].leverUp, inputs.lgcius[1].leverUp);
}

/**
 * The alert triggers when LGCIU 1 and LGCIU 2 disagree on the landing gear positions.
 * Compared: the downlocked and the uplocked position of each gear, when both LGCIUs send them.
 */
export function isLgciuGearPositionDisagree(inputs: LandingGearInputs): boolean {
  const [lgciu1, lgciu2] = inputs.lgcius;
  const disagree = (a: readonly boolean[] | null, b: readonly boolean[] | null) =>
    a !== null && b !== null && a.some((value, gear) => value !== b[gear]);
  return disagree(lgciu1.downlocked, lgciu2.downlocked) || disagree(lgciu1.notLockedUp, lgciu2.notLockedUp);
}

/**
 * The lines of L/G DOORS NOT CLOSED: 0 title; if the L/G lever is up: 1 .WHEN SPD <
 * 220/.54:, 2 -L/G LEVER RECYCLE; then 3 .IF UNSUCCESSFUL:, 4 MAX SPEED 250/.60, 5 FUEL CONSUMPT INCRSD, 6 FMS PRED
 * UNRELIABLE.
 */
function gearDoorsNotClosedLines(leverUp: boolean): (number | null)[] {
  return [0, leverUp ? 1 : null, leverUp ? 2 : null, 3, 4, 5, 6];
}

/** The STATUS codes of the ATA 32 alerts (StatusMessages) */
const LandingGearStatusCodes = {
  maxSpeed280: '320400001',
  maxSpeed250: '320400002',
  fuelConsumptionIncreased: '290400018',
  fmsPredictionsUnreliable: '290400019',
  lgDoor: '320300001',
  lgRetract: '290300036',
  forLandingUseFlap3: '270400007',
  lgGravityExtension: '240400102',
  lgControlNotAvailable: '240200106',
  eng1ApproachIdleOnly: '240200103',
  eng2ApproachIdleOnly: '240200104',
  lgciu1: '240300170',
  lgciu2: '240300171',
  reverser1: '780300001',
  reverser2: '780300002',
  reverser1And2: '290300040',
  ap1And2: '270300027',
  cat2: '270300028',
  autoThrust: '240300131',
  gpws: '240300152',
  maxBrakePressure1000: '240400101',
  ldgDistProc: '700400004',
  brakeYellowAccuPressureOnly: '290200001',
  cat3SingleOnly: '220200001',
  cat3Dual: '220300001',
  antiSkid: '240300176',
  noseWheelSteering: '240300177',
  normalBrake: '290300034',
  autoBrake: '290300033',
} as const;

const G = LandingGearStatusCodes;

/**
 * L/G GEAR NOT UPLOCKED STATUS: MAX SPEED 280/.67, FUEL CONSUMPT INCRSD, FMS PRED UNRELIABLE once the gear is down
 * (the flight continued with the landing gear extended), INOP SYS L/G RETRACT
 * @param gearDownlocked the landing gear is down and locked
 */
export function gearNotUplockedStatus(gearDownlocked: boolean): StatusLines {
  return {
    left: gearDownlocked ? [G.maxSpeed280, G.fuelConsumptionIncreased, G.fmsPredictionsUnreliable] : [],
    inopSys: [G.lgRetract],
  };
}

/** L/G DOORS NOT CLOSED STATUS: MAX SPEED 250/.60, FUEL CONSUMPT INCRSD, FMS PRED UNRELIABLE; L/G DOOR */
function gearDoorsNotClosedStatus(): StatusLines {
  return { left: [G.maxSpeed250, G.fuelConsumptionIncreased, G.fmsPredictionsUnreliable], inopSys: [G.lgDoor] };
}

/**
 * L/G LGCIU 1(2) FAULT STATUS: ENG 1(2) APPR IDLE ONLY; INOP SYS LGCIU 1(2), REVERSER 1(2), GPWS (LGCIU 1 failed: the
 * GPWS gets "L/G up")
 */
export function lgciuFaultStatus(lgciu: 1 | 2): StatusLines {
  return lgciu === 1
    ? { left: [G.eng1ApproachIdleOnly], inopSys: [G.lgciu1, G.reverser1, G.gpws] }
    : { left: [G.eng2ApproachIdleOnly], inopSys: [G.lgciu2, G.reverser2] };
}

/**
 * L/G LGCIU 1+2 FAULT STATUS: FOR LDG USE FLAP 3, L/G GRVTY EXTN, L/G CONTROL NOT AVAIL, ENG 1 and ENG 2
 * APPR IDLE ONLY; INOP SYS REVERSER 1+2, AP 1+2, CAT 2, A/THR, LGCIU 1, LGCIU 2, GPWS. The GLS AUTOLAND and ROW/ROP lines
 * are left out: the FBW A32NX has neither.
 */
export function lgciu1And2FaultStatus(): StatusLines {
  return {
    left: [
      G.forLandingUseFlap3,
      G.lgGravityExtension,
      G.lgControlNotAvailable,
      G.eng1ApproachIdleOnly,
      G.eng2ApproachIdleOnly,
    ],
    inopSys: [G.reverser1And2, G.ap1And2, G.cat2, G.autoThrust, G.lgciu1, G.lgciu2, G.gpws],
  };
}

/**
 * BRAKES A/SKID N/WS OFF STATUS: MAX BRK PR 1000 PSI, LDG DIST PROC APPLY, BRK Y ACCU PR ONLY if Y SYS
 * LO PR, CAT 3 SINGLE ONLY; INOP SYS CAT 3 DUAL, ANTI SKID, N/W STRG, NORM BRK, AUTO BRK
 * @param yellowSystemLowPressure the yellow hydraulic system has a low pressure
 */
export function antiSkidOffStatus(yellowSystemLowPressure: boolean): StatusLines {
  return {
    left: [
      G.maxBrakePressure1000,
      G.ldgDistProc,
      ...(yellowSystemLowPressure ? [G.brakeYellowAccuPressureOnly] : []),
      G.cat3SingleOnly,
    ],
    inopSys: [G.cat3Dual, G.antiSkid, G.noseWheelSteering, G.normalBrake, G.autoBrake],
  };
}

export class LandingGearAlerts {
  private leverUp = false;

  private readonly doorsNotClosedTimer = new ConfirmTimer(DOORS_NOT_CLOSED_CONFIRM_SECONDS);

  private readonly sysDisagreeTimer = new ConfirmTimer(SYS_DISAGREE_CONFIRM_SECONDS);

  private readonly doorsNotClosed = Subject.create(false);

  private readonly sysDisagree = Subject.create(false);

  /**
   * @param inputs the LGCIU gear positions of this update
   * @param deltaSeconds the time since the last update, in seconds
   */
  update(inputs: LandingGearInputs, deltaSeconds: number): void {
    this.leverUp = isGearLeverUp(inputs);
    this.doorsNotClosed.set(this.doorsNotClosedTimer.update(isGearDoorNotClosed(inputs), deltaSeconds));
    this.sysDisagree.set(this.sysDisagreeTimer.update(isLgciuGearPositionDisagree(inputs), deltaSeconds));
  }

  /** The alert items, by key, for the PseudoFWC ewdMessageFailures */
  public readonly ewdFailures: Record<string, FwcAlertItem> = {
    [LandingGearAlertKeys.doorsNotClosed]: cautionItem(
      LandingGearAlertKeys.doorsNotClosed,
      7,
      this.doorsNotClosed,
      DOORS_NOT_CLOSED_PHASE_INHIBITION,
      () => gearDoorsNotClosedLines(this.leverUp),
      EcamSysPage.WHEEL,
      gearDoorsNotClosedStatus,
    ),
    // Crew awareness level
    [LandingGearAlertKeys.sysDisagree]: cautionItem(
      LandingGearAlertKeys.sysDisagree,
      1,
      this.sysDisagree,
      SYS_DISAGREE_PHASE_INHIBITION,
      () => [0],
      EcamSysPage.WHEEL,
    ),
  };
}

/* Acquisition (not unit tested: SimVar reads only) */

function readLgciu(lgciu: 1 | 2): LgciuGearPosition {
  const word1 = Arinc429Word.fromSimVarValue(`L:A32NX_LGCIU_${lgciu}_DISCRETE_WORD_1`);
  const word3 = Arinc429Word.fromSimVarValue(`L:A32NX_LGCIU_${lgciu}_DISCRETE_WORD_3`);
  const bits = (word: Arinc429Word, first: number): [boolean, boolean, boolean] => [
    word.bitValue(first),
    word.bitValue(first + 1),
    word.bitValue(first + 2),
  ];
  const word1Valid = word1.isNormalOperation();
  const word3Valid = word3.isNormalOperation();
  return {
    downlocked: word1Valid ? bits(word1, 23) : null,
    notLockedUp: word3Valid ? bits(word3, 11) : null,
    doorNotClosed: word1Valid ? bits(word1, 17) : null,
    leverUp: word3Valid ? word3.bitValue(14) : null,
  };
}

/** Reads the LGCIU gear positions from the simvars */
export function readLandingGearInputs(gearNotUplocked: boolean): LandingGearInputs {
  return { lgcius: [readLgciu(1), readLgciu(2)], gearNotUplocked };
}

/** The yellow hydraulic system pressure switch is low (Y SYS LO PR) */
export function readYellowSystemLowPressure(): boolean {
  return !SimVar.GetSimVarValue('L:A32NX_HYD_YELLOW_SYSTEM_1_SECTION_PRESSURE_SWITCH', 'bool');
}
