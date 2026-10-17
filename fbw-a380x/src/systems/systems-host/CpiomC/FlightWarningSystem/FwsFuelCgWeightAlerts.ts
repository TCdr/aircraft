// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

/*
 * A380X FUEL (ATA 28) CG and weight alerts: FUEL CG AT FWD LIMIT, FUEL CG OUT OF RANGE, FUEL EXCESS AFT CG, FUEL CG
 * DATA DISAGREE and FUEL WEIGHT DATA DISAGREE, with their procedure lines. The aircraft gives the weights in lb; they
 * are converted to kg here.
 *
 * The FQMS GW and CG (A32NX_FQMS_GROSS_WEIGHT / _CENTER_OF_GRAVITY_MAC) come from the FMS ZFW and ZFWCG and the fuel
 * quantities; the WBBC GW and CG (A380X_WBBC_*) from the aerodynamic data (CpiomF/WeightBalanceBackup).
 */

const KG_PER_LB = 0.45359237;

/**
 * Flight phase inhibitions: FUEL CG AT FWD LIMIT, FUEL CG DATA DISAGREE, FUEL EXCESS AFT CG and FUEL WEIGHT DATA
 * DISAGREE in every phase but 8; FUEL CG OUT OF RANGE in phases 3-12.
 */
export const FUEL_CG_WEIGHT_PHASE_INHIBITION: {
  cgAtFwdLimit: number[];
  cgDataDisagree: number[];
  cgOutOfRange: number[];
  excessAftCg: number[];
  weightDataDisagree: number[];
} = {
  cgAtFwdLimit: [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12],
  cgDataDisagree: [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12],
  cgOutOfRange: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  excessAftCg: [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12],
  weightDataDisagree: [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12],
};

/** A point of a CG limit line: the CG limit (% MAC) at a gross weight (kg) */
export interface CgLimitPoint {
  weightKg: number;
  cgPercentMac: number;
}

/*
 * The certified CG limits, digitised from the CG envelope chart (about +-0.2 % MAC): the CG lines of the chart are
 * slanted (the % MAC scale at 260 t is not the one at 600 t), so each straight edge of the envelope is sampled. Between
 * the points the limit is interpolated linearly; below 260 t and above MTOW (560 t) it is held at the end values.
 */

/** The forward limit of the flight envelope ("Flight", lavender) */
export const FLIGHT_FWD_CG_LIMIT: readonly CgLimitPoint[] = [
  { weightKg: 260_000, cgPercentMac: 27.95 },
  { weightKg: 374_800, cgPercentMac: 27.99 },
  { weightKg: 421_200, cgPercentMac: 30.9 },
  { weightKg: 467_600, cgPercentMac: 33.23 },
  { weightKg: 514_000, cgPercentMac: 35.14 },
  { weightKg: 560_400, cgPercentMac: 36.73 },
];

/** The forward limit of the takeoff envelope ("Takeoff", yellow) */
export const TAKEOFF_FWD_CG_LIMIT: readonly CgLimitPoint[] = [
  { weightKg: 260_000, cgPercentMac: 29.01 },
  { weightKg: 374_900, cgPercentMac: 28.93 },
  { weightKg: 421_300, cgPercentMac: 31.77 },
  { weightKg: 467_700, cgPercentMac: 34.05 },
  { weightKg: 514_000, cgPercentMac: 35.91 },
  { weightKg: 560_400, cgPercentMac: 37.46 },
];

/** The aft limit of the takeoff envelope ("Takeoff", yellow) */
export const TAKEOFF_AFT_CG_LIMIT: readonly CgLimitPoint[] = [
  { weightKg: 260_000, cgPercentMac: 38.6 },
  { weightKg: 282_600, cgPercentMac: 39.99 },
  { weightKg: 305_200, cgPercentMac: 41.17 },
  { weightKg: 327_700, cgPercentMac: 42.19 },
  { weightKg: 350_300, cgPercentMac: 43.08 },
  { weightKg: 560_400, cgPercentMac: 43.02 },
];

/**
 * The CG limit of a limit line at a gross weight.
 * @param limit the limit line, by increasing weight
 * @param weightKg the gross weight
 */
export function cgLimitAt(limit: readonly CgLimitPoint[], weightKg: number): number {
  if (weightKg <= limit[0].weightKg) {
    return limit[0].cgPercentMac;
  }
  for (let i = 1; i < limit.length; i++) {
    const high = limit[i];
    if (weightKg <= high.weightKg) {
      const low = limit[i - 1];
      return (
        low.cgPercentMac +
        ((high.cgPercentMac - low.cgPercentMac) * (weightKg - low.weightKg)) / (high.weightKg - low.weightKg)
      );
    }
  }
  return limit[limit.length - 1].cgPercentMac;
}

/** A gross weight (kg) and CG (% MAC), null when not computed */
export interface WeightAndCg {
  grossWeightKg: number | null;
  cgPercentMac: number | null;
}

/**
 * FUEL CG AT FWD LIMIT: the CG is forward of the certified flight limit. Design choice: from the FQMS GW and CG (the
 * primary computation).
 * @param fqms the FQMS GW and CG
 */
export function isCgAtFwdLimit(fqms: WeightAndCg): boolean {
  return (
    fqms.grossWeightKg !== null &&
    fqms.cgPercentMac !== null &&
    fqms.cgPercentMac < cgLimitAt(FLIGHT_FWD_CG_LIMIT, fqms.grossWeightKg)
  );
}

/**
 * Whether a CG is outside the certified takeoff limits
 * @param weightAndCg the GW and CG
 */
export function isOutsideTakeoffCgLimits(weightAndCg: WeightAndCg): boolean {
  const { grossWeightKg, cgPercentMac } = weightAndCg;
  return (
    grossWeightKg !== null &&
    cgPercentMac !== null &&
    (cgPercentMac < cgLimitAt(TAKEOFF_FWD_CG_LIMIT, grossWeightKg) ||
      cgPercentMac > cgLimitAt(TAKEOFF_AFT_CG_LIMIT, grossWeightKg))
  );
}

/** The alternate gauging CG limit after the second engine start, % MAC */
const ALTERNATE_GAUGING_CG_LIMIT_PERCENT = 54;

/** What FUEL CG OUT OF RANGE reads */
export interface CgOutOfRangeInputs {
  /** The ENG MODE selector is at IGN/START */
  engModeIgnStart: boolean;
  enginesRunning: number;
  /** The FQMS GW and CG */
  fqms: WeightAndCg;
  /** The CG of the alternate gauging system, % MAC, null when not computed */
  alternateGaugingCgPercentMac: number | null;
}

/** FUEL CG OUT OF RANGE and which of its two triggers is active */
export interface CgOutOfRangeState {
  active: boolean;
  /** The FQMS CG exceeded the takeoff limits when the ENG MODE selector was set to IGN/START */
  takeoffLimitsAtEngineStart: boolean;
  /** The alternate gauging CG is above 54 % after the second engine start */
  alternateCgAbove54: boolean;
}

/**
 * FUEL CG OUT OF RANGE: the FQMS CG is outside the certified takeoff limits when the crew sets the ENG MODE selector to
 * IGN/START, or the alternate gauging CG is above 54 % after the second engine start.
 *
 * Design choices:
 * - The first trigger is checked when the ENG MODE selector is set to IGN/START, and then stays while the FQMS CG
 *   remains outside the takeoff limits: the procedure asks to delay the engine start and run the automatic ground
 *   transfer (AUTO GND XFR ON), which clears it once the CG is back inside.
 * - The alternate gauging system is not simulated: its CG is the simulator's own CG
 *   (L:A32NX_AIRFRAME_GW_CG_PERCENT_MAC), independent of the FMS entries, as the WBBC (CpiomF/WeightBalanceBackup).
 */
export class CgOutOfRangeMonitor {
  private wasIgnStart = false;

  private takeoffLimitsLatched = false;

  /** @param inputs what the alert reads */
  public update(inputs: CgOutOfRangeInputs): CgOutOfRangeState {
    const outsideTakeoffLimits = isOutsideTakeoffCgLimits(inputs.fqms);
    if (inputs.engModeIgnStart && !this.wasIgnStart && outsideTakeoffLimits) {
      this.takeoffLimitsLatched = true;
    }
    if (!outsideTakeoffLimits) {
      this.takeoffLimitsLatched = false;
    }
    this.wasIgnStart = inputs.engModeIgnStart;

    const alternateCgAbove54 =
      inputs.enginesRunning >= 2 &&
      inputs.alternateGaugingCgPercentMac !== null &&
      inputs.alternateGaugingCgPercentMac > ALTERNATE_GAUGING_CG_LIMIT_PERCENT;
    return {
      active: this.takeoffLimitsLatched || alternateCgAbove54,
      takeoffLimitsAtEngineStart: this.takeoffLimitsLatched,
      alternateCgAbove54,
    };
  }
}

/** FUEL EXCESS AFT CG above this WBBC CG, % MAC */
const EXCESS_AFT_CG_PERCENT = 50;

/**
 * FUEL EXCESS AFT CG: the WBBC CG is above 50 % while the fuel system is in automatic mode. Design choice: it triggers
 * only in automatic mode (every transfer pb-sw in AUTO), and then stays while the WBBC CG is above 50 %, so that the
 * TRIM TK XFR FWD that the procedure asks for does not clear it.
 */
export class ExcessAftCgMonitor {
  private active = false;

  /**
   * @param wbbcCgPercentMac the WBBC CG, null when not computed
   * @param fuelSystemInAutoMode every transfer pb-sw (OUTR, MID, INR, TRIM TK XFR) is in AUTO
   */
  public update(wbbcCgPercentMac: number | null, fuelSystemInAutoMode: boolean): boolean {
    const aboveLimit = wbbcCgPercentMac !== null && wbbcCgPercentMac > EXCESS_AFT_CG_PERCENT;
    this.active = aboveLimit && (this.active || fuelSystemInAutoMode);
    return this.active;
  }
}

/** FUEL CG DATA DISAGREE above this difference between the FQMS and the WBBC CG, % MAC */
const CG_DATA_DISAGREE_PERCENT = 8;

/** FUEL WEIGHT DATA DISAGREE above this difference (198 400 lb) between the FQMS and the WBBC GW, kg */
const WEIGHT_DATA_DISAGREE_KG = 198_400 * KG_PER_LB;

/**
 * FUEL CG DATA DISAGREE: the PRIMs see more than 8 % between the FQMS CG and the WBBC CG.
 * @param fqms the FQMS GW and CG
 * @param wbbc the WBBC GW and CG
 */
export function isCgDataDisagree(fqms: WeightAndCg, wbbc: WeightAndCg): boolean {
  return (
    fqms.cgPercentMac !== null &&
    wbbc.cgPercentMac !== null &&
    Math.abs(fqms.cgPercentMac - wbbc.cgPercentMac) > CG_DATA_DISAGREE_PERCENT
  );
}

/**
 * FUEL WEIGHT DATA DISAGREE: the PRIMs see more than 198 400 lb between the FQMS GW and the WBBC GW.
 * @param fqms the FQMS GW and CG
 * @param wbbc the WBBC GW and CG
 */
export function isWeightDataDisagree(fqms: WeightAndCg, wbbc: WeightAndCg): boolean {
  return (
    fqms.grossWeightKg !== null &&
    wbbc.grossWeightKg !== null &&
    Math.abs(fqms.grossWeightKg - wbbc.grossWeightKg) > WEIGHT_DATA_DISAGREE_KG
  );
}

/** Which procedure lines to show and which are completed */
export interface ProcedureLines {
  show: boolean[];
  checked: boolean[];
}

/** The TRIM TK FEED selector (L:A380X_OVHD_FUEL_TRIM_TK_FEED_SELECTOR, CpiomF/FuelTrimTankFeed) */
export enum TrimTankFeedSelector {
  Auto = 0,
  Open = 1,
  Isol = 2,
}

/** What the CG alert procedures read */
export interface FuelCgProcedureInputs {
  trimTankFeed: TrimTankFeedSelector;
  /** The TRIM TK XFR pb-sw is in AUTO (not FWD) */
  trimTankXfrAuto: boolean;
  /** The OUTR TK XFR pb-sw is in AUTO (not MAN) */
  outerTankXfrAuto: boolean;
  /** At least one trim tank pump is available: its pb-sw ON and no FAULT */
  trimTankPumpAvailable: boolean;
  trimTankHoldsFuel: boolean;
  outerTanksHoldFuel: boolean;
  /** The AUTO GND XFR pb-sw is ON */
  autoGroundTransferOn: boolean;
  /** The trim tank fuel is cold: design choice, its measured temperature is below -40 °C (FUEL TEMP LO) */
  trimTankColdFuel: boolean;
}

/**
 * FUEL CG AT FWD LIMIT lines: without cold trim tank fuel, TRIM TK XFR AUTO and TRIM TK FEED ISOL; when the CG allows a
 * trim tank forward transfer, a pumped transfer (TRIM TK FEED AUTO, TRIM TK XFR FWD) when at least one trim tank pump
 * is available, else a gravity transfer (PITCH ATT < 3° FOR GRVTY FWD XFR, TRIM TK FEED OPEN). The trim tank isolation
 * valve failure is not simulated. The WHEN condition and the lines after it are not sensed: the automatic recall when
 * the CG allows the forward transfer is not simulated, the crew confirms it.
 * Items: 0 IF NO TRIM TK COLD FUEL (sensed condition), 1 TRIM TK XFR AUTO, 2 TRIM TK FEED ISOL, 3 WHEN CG ALLOWS TRIM
 * TK FWD XFR, 4 TRIM TK FEED AUTO, 5 TRIM TK XFR FWD, 6 PITCH ATT < 3° FOR GRVTY FWD XFR, 7 TRIM TK FEED OPEN.
 */
export function cgAtFwdLimitLines(inputs: FuelCgProcedureInputs): ProcedureLines {
  const pumped = inputs.trimTankPumpAvailable;
  return {
    show: [true, true, true, true, pumped, pumped, !pumped, !pumped],
    checked: [
      !inputs.trimTankColdFuel,
      inputs.trimTankXfrAuto,
      inputs.trimTankFeed === TrimTankFeedSelector.Isol,
      false,
      false,
      false,
      false,
      false,
    ],
  };
}

/**
 * FUEL CG OUT OF RANGE lines: with the takeoff limits trigger DELAY ENG START and AUTO GND XFR ON; with the alternate
 * gauging trigger DELAY T.O.
 * Items: 0 DELAY ENG START, 1 AUTO GND XFR ON, 2 DELAY T.O.
 */
export function cgOutOfRangeLines(state: CgOutOfRangeState, inputs: FuelCgProcedureInputs): ProcedureLines {
  return {
    show: [state.takeoffLimitsAtEngineStart, state.takeoffLimitsAtEngineStart, state.alternateCgAbove54],
    checked: [false, inputs.autoGroundTransferOn, false],
  };
}

/**
 * FUEL EXCESS AFT CG lines: TRIM TK FEED AUTO if the trim tank is isolated; TRIM TK XFR FWD if it is not empty, then
 * the IF NOT SUCCESSFUL branches (gravity transfer, then MAX FLT TIME 4 HR and TRIM TK NOT USABLE); with an empty trim
 * tank MAX FLT TIME 4 HR; OUTR TK XFR MAN while the outer tanks are not empty. The IF NOT SUCCESSFUL branches are the
 * crew's assessment: not sensed.
 * Items: 0 TRIM TK FEED AUTO, 1 TRIM TK XFR FWD, 2 IF NOT SUCCESSFUL, 3 TRIM TK XFR AUTO, 4 PITCH ATT < 3° FOR GRVTY
 * FWD XFR, 5 TRIM TK FEED OPEN, 6 IF NOT SUCCESSFUL, 7 MAX FLT TIME : 4 HR, 8 TRIM TK NOT USABLE, 9 OUTR TK XFR MAN, 10
 * MAX FLT TIME : 4 HR, 11 OUTR TK XFR MAN.
 */
export function excessAftCgLines(inputs: FuelCgProcedureInputs): ProcedureLines {
  const trimFuel = inputs.trimTankHoldsFuel;
  const outerFuel = inputs.outerTanksHoldFuel;
  return {
    show: [
      inputs.trimTankFeed === TrimTankFeedSelector.Isol,
      trimFuel,
      trimFuel,
      trimFuel,
      trimFuel,
      trimFuel,
      trimFuel,
      trimFuel,
      trimFuel,
      trimFuel && outerFuel,
      !trimFuel,
      !trimFuel && outerFuel,
    ],
    checked: [
      inputs.trimTankFeed === TrimTankFeedSelector.Auto,
      !inputs.trimTankXfrAuto,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      !inputs.outerTankXfrAuto,
      false,
      !inputs.outerTankXfrAuto,
    ],
  };
}
