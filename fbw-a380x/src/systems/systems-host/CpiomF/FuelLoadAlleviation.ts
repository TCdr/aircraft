// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import {
  FEED_TANK_1,
  FEED_TANK_2,
  FEED_TANK_3,
  FEED_TANK_4,
  FEED_TANKS,
  FuelMove,
  isTankEmpty,
  isTankFull,
  LEFT_INNER_TANK,
  LEFT_MID_TANK,
  LEFT_OUTER_TANK,
  moveFuel,
  RIGHT_INNER_TANK,
  RIGHT_MID_TANK,
  RIGHT_OUTER_TANK,
  TankLevels,
  TRIM_TANK,
} from './FuelTransferSchedule';

/*
 * The A380 load alleviation transfers: after takeoff, fuel goes to the outer tanks until they are full; before landing,
 * the trim tank is emptied, then the outer tanks are brought down to half full.
 */

const LOAD_ALLEVIATION_TO_OUTER_MIN_FOB_LB = 110_200;

/** Per outer tank */
export const TO_OUTER_TANKS_RATE_LB_PER_H = 44_100;

export const FROM_TRIM_TANK_RATE_LB_PER_H = 44_100;

/** Per outer tank */
export const FROM_OUTER_TANKS_RATE_LB_PER_H = 33_050;

const OUTER_TANK_HALF_FULL_LB = 8_800;

/**
 * The remaining time to destination (RTD) thresholds of a load alleviation transfer before landing: it starts once the
 * RTD has been below startBelowMin for 3 min, stops when the RTD goes above startBelowMin (a flight plan change) and
 * resumes when the RTD goes below resumeBelowMin.
 */
interface RtdThresholds {
  startBelowMin: number;
  resumeBelowMin: number;
}

const FROM_TRIM_RTD: RtdThresholds = { startBelowMin: 80, resumeBelowMin: 78 };

const FROM_OUTER_RTD: RtdThresholds = { startBelowMin: 30, resumeBelowMin: 28 };

/** How long the RTD must stay below the start threshold */
const RTD_CONFIRM_TIME_S = 180;

/** The transfers before landing also start at a descent below FL 245 after having been above FL 255 */
const DESCENT_ALTITUDE_HIGH_FT = 25_500;
const DESCENT_ALTITUDE_LOW_FT = 24_500;

export interface LoadAlleviationInputs {
  readonly inFlight: boolean;
  /** The fuel on board, in pounds */
  readonly fobLb: number;
  /** Both outer tanks are full */
  readonly outerTanksFull: boolean;
  /** The remaining time to destination from the FMS, in minutes, null without one */
  readonly remainingTimeToDestinationMin: number | null;
  /** The pressure altitude, in feet */
  readonly pressureAltitudeFt: number;
  /** The fuel in the left and right outer tanks, in pounds */
  readonly outerTanksLb: readonly [number, number];
  readonly trimTankEmpty: boolean;
  /** The TRIM TK FEED selector is in ISOL (CpiomF/FuelTrimTankFeed) */
  readonly trimTankIsolated: boolean;
}

/** Which load alleviation transfers run */
export interface LoadAlleviationTransfers {
  /** Transfer to the outer tanks, after takeoff */
  readonly toOuterTanks: boolean;
  /** Transfer from the trim tank, before landing */
  readonly fromTrimTank: boolean;
  /** Transfer from the outer tanks, before landing */
  readonly fromOuterTanks: boolean;
}

/** One transfer before landing: its start (RTD confirmed or descent below FL 245) and its RTD stop / resume */
class BeforeLandingTransferStart {
  private rtdBelowTimeS = 0;

  /** The transfer started (it stays started until landing) */
  private started = false;

  /** The RTD went above the start threshold after the start: the transfer waits for the RTD below the resume threshold */
  private suspendedByRtd = false;

  constructor(private readonly thresholds: RtdThresholds) {}

  public reset(): void {
    this.rtdBelowTimeS = 0;
    this.started = false;
    this.suspendedByRtd = false;
  }

  /**
   * @param rtdMin the RTD in minutes, null without one
   * @param descentBelowFl245 the aircraft went below FL 245 after having been above FL 255
   * @param deltaTimeS the time since the last update, in seconds
   * @returns whether the transfer may run (started and not suspended by the RTD)
   */
  public update(rtdMin: number | null, descentBelowFl245: boolean, deltaTimeS: number): boolean {
    if (rtdMin !== null && rtdMin < this.thresholds.startBelowMin) {
      this.rtdBelowTimeS += deltaTimeS;
    } else {
      this.rtdBelowTimeS = 0;
    }
    if (!this.started && (this.rtdBelowTimeS >= RTD_CONFIRM_TIME_S || descentBelowFl245)) {
      this.started = true;
    }
    // A flight plan change can raise the RTD above the start threshold: the transfer then waits for the resume
    // threshold
    if (rtdMin !== null && rtdMin > this.thresholds.startBelowMin) {
      this.suspendedByRtd = true;
    } else if (rtdMin !== null && rtdMin < this.thresholds.resumeBelowMin) {
      this.suspendedByRtd = false;
    }
    return this.started && !this.suspendedByRtd;
  }
}

/**
 * When the load alleviation transfers run (FQMS logic). All three are in flight only and start again at each flight.
 * - To the outer tanks: in flight with a FOB above 110 200 lb, until the outer tanks are full. Design choice: not
 *   once a transfer before landing has started (a FOB above 110 200 lb at landing would otherwise send the fuel back
 *   and forth).
 * - From the trim tank: stops when the trim tank is empty, the TRIM TK FEED selector is in ISOL, or the RTD goes above
 *   80 min.
 * - From the outer tanks: while any outer tank holds more than 8 800 lb (half full), stops when each outer tank is down
 *   to 8 800 lb or the RTD goes above 30 min.
 * The RTD is the remaining flight time of the FMS (CpiomF/FuelTransferSchedule): without a flight plan, only the
 * descent below FL 245 starts the transfers before landing.
 */
export class LoadAlleviationTransferLogic {
  private wasAboveFl255 = false;

  private descentBelowFl245 = false;

  private readonly fromTrim = new BeforeLandingTransferStart(FROM_TRIM_RTD);

  private readonly fromOuter = new BeforeLandingTransferStart(FROM_OUTER_RTD);

  /** A transfer before landing has started in this flight */
  private beforeLandingStarted = false;

  /**
   * @param inputs the aircraft and fuel state
   * @param deltaTimeS the time since the last update, in seconds
   */
  public update(inputs: LoadAlleviationInputs, deltaTimeS: number): LoadAlleviationTransfers {
    if (!inputs.inFlight) {
      this.wasAboveFl255 = false;
      this.descentBelowFl245 = false;
      this.beforeLandingStarted = false;
      this.fromTrim.reset();
      this.fromOuter.reset();
      return { toOuterTanks: false, fromTrimTank: false, fromOuterTanks: false };
    }

    if (inputs.pressureAltitudeFt > DESCENT_ALTITUDE_HIGH_FT) {
      this.wasAboveFl255 = true;
    }
    if (this.wasAboveFl255 && inputs.pressureAltitudeFt < DESCENT_ALTITUDE_LOW_FT) {
      this.descentBelowFl245 = true;
    }

    const rtd = inputs.remainingTimeToDestinationMin;
    const fromTrimAllowed = this.fromTrim.update(rtd, this.descentBelowFl245, deltaTimeS);
    const fromOuterAllowed = this.fromOuter.update(rtd, this.descentBelowFl245, deltaTimeS);
    const fromTrimTank = fromTrimAllowed && !inputs.trimTankEmpty && !inputs.trimTankIsolated;
    const fromOuterTanks = fromOuterAllowed && inputs.outerTanksLb.some((pounds) => pounds > OUTER_TANK_HALF_FULL_LB);
    if (fromTrimAllowed || fromOuterAllowed) {
      this.beforeLandingStarted = true;
    }

    const toOuterTanks =
      !this.beforeLandingStarted && inputs.fobLb > LOAD_ALLEVIATION_TO_OUTER_MIN_FOB_LB && !inputs.outerTanksFull;

    return { toOuterTanks, fromTrimTank, fromOuterTanks };
  }
}

/** The transfer pumps a load alleviation transfer uses, and whether each one can run (pb-sw ON and not failed) */
export interface LoadAlleviationPumps {
  /** The left and right inner tank fwd pumps */
  readonly innerFwd: readonly [boolean, boolean];
  /** The left and right inner tank aft pumps */
  readonly innerAft: readonly [boolean, boolean];
  /** The left and right mid tank fwd pumps */
  readonly midFwd: readonly [boolean, boolean];
  /** The left and right mid tank aft pumps */
  readonly midAft: readonly [boolean, boolean];
  /** The left and right outer tank pumps */
  readonly outer: readonly [boolean, boolean];
  /** The left and right trim tank pumps */
  readonly trim: readonly [boolean, boolean];
}

const SIDES = [
  { inner: LEFT_INNER_TANK, mid: LEFT_MID_TANK, outer: LEFT_OUTER_TANK, feedTanks: [FEED_TANK_1, FEED_TANK_2] },
  { inner: RIGHT_INNER_TANK, mid: RIGHT_MID_TANK, outer: RIGHT_OUTER_TANK, feedTanks: [FEED_TANK_3, FEED_TANK_4] },
];

/**
 * The fuel moves of the load alleviation transfers over one update. The MSFS fuel system has no route from the
 * galleries into the outer tanks and none out of the trim tank into the mid tanks, so these transfers move the fuel
 * between the MSFS tanks directly, at the aircraft rates (as CpiomF/FuelJettison removes the jettisoned fuel). Each
 * side of the wing feeds its own outer tank, and an outer tank its own side (design choice: lateral balance).
 * - To the outer tanks, from the inner tanks, or the mid tanks once the inner tanks are empty, with the fwd pump of
 *   that tank, or its aft pump when the fwd pump cannot run (the aircraft then swaps the transfer to the aft gallery).
 * - From the trim tank, with the trim tank pumps (half the rate with one), to the feed tanks, then the mid tanks once
 *   the feed tanks are full, then the inner tanks.
 * - From each outer tank above 8 800 lb, with its pump, down to 8 800 lb, to the feed tanks, mid tank, inner tank of
 *   its side.
 * @param transfers the transfers that run
 * @param levels the tank levels, updated with the moves
 * @param pumps which pumps can run
 * @param poundsPerGallon the fuel density
 * @param deltaTimeS the time of the update, in seconds
 */
export function loadAlleviationMoves(
  transfers: LoadAlleviationTransfers,
  levels: TankLevels,
  pumps: LoadAlleviationPumps,
  poundsPerGallon: number,
  deltaTimeS: number,
): FuelMove[] {
  const moves: FuelMove[] = [];
  const gallonsAtRate = (poundsPerHour: number) => (poundsPerHour * deltaTimeS) / 3600 / poundsPerGallon;

  if (transfers.toOuterTanks) {
    SIDES.forEach((side, index) => {
      if (isTankFull(levels, side.outer)) {
        return;
      }
      const innerEmpty = isTankEmpty(levels, side.inner);
      const source = innerEmpty ? side.mid : side.inner;
      const pumpCanRun = innerEmpty
        ? pumps.midFwd[index] || pumps.midAft[index]
        : pumps.innerFwd[index] || pumps.innerAft[index];
      if (pumpCanRun && !isTankEmpty(levels, source)) {
        moves.push(...moveFuel(levels, source, [[side.outer]], gallonsAtRate(TO_OUTER_TANKS_RATE_LB_PER_H)));
      }
    });
  }

  if (transfers.fromTrimTank) {
    const runningTrimPumps = pumps.trim.filter((canRun) => canRun).length;
    if (runningTrimPumps > 0) {
      moves.push(
        ...moveFuel(
          levels,
          TRIM_TANK,
          [FEED_TANKS, [LEFT_MID_TANK, RIGHT_MID_TANK], [LEFT_INNER_TANK, RIGHT_INNER_TANK]],
          (gallonsAtRate(FROM_TRIM_TANK_RATE_LB_PER_H) * runningTrimPumps) / 2,
        ),
      );
    }
  }

  if (transfers.fromOuterTanks) {
    const halfFullGal = OUTER_TANK_HALF_FULL_LB / poundsPerGallon;
    SIDES.forEach((side, index) => {
      const aboveHalfGal = (levels.quantityGal.get(side.outer) ?? 0) - halfFullGal;
      if (pumps.outer[index] && aboveHalfGal > 0) {
        moves.push(
          ...moveFuel(
            levels,
            side.outer,
            [side.feedTanks, [side.mid], [side.inner]],
            Math.min(aboveHalfGal, gallonsAtRate(FROM_OUTER_TANKS_RATE_LB_PER_H)),
          ),
        );
      }
    });
  }

  return moves;
}

/** Whether both outer tanks are full */
export function areOuterTanksFull(levels: TankLevels): boolean {
  return isTankFull(levels, LEFT_OUTER_TANK) && isTankFull(levels, RIGHT_OUTER_TANK);
}
