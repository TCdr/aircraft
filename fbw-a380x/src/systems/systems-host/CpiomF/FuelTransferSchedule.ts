// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { Arinc429Word } from '@flybywiresim/fbw-sdk';

/*
 * Shared pieces of the A380 automatic fuel transfers of the FQMS simulation (CPIOM-F): the main transfer thresholds of
 * the feed tanks, the remaining time to destination sent by the FMS, the MSFS tanks (flight_model.cfg [FUEL_SYSTEM]
 * Tank.N, the index of FUELSYSTEM TANK QUANTITY) and the fuel moves of the transfers that are made by moving fuel between
 * the MSFS tanks (CpiomF/FuelAutomaticTransfers).
 */

// The MSFS tanks (flight_model.cfg Tank.N)
export const LEFT_OUTER_TANK = 1;
export const FEED_TANK_1 = 2;
export const LEFT_MID_TANK = 3;
export const LEFT_INNER_TANK = 4;
export const FEED_TANK_2 = 5;
export const FEED_TANK_3 = 6;
export const RIGHT_INNER_TANK = 7;
export const RIGHT_MID_TANK = 8;
export const FEED_TANK_4 = 9;
export const RIGHT_OUTER_TANK = 10;
export const TRIM_TANK = 11;

/** The four feed tanks, FEED TK 1 to 4 */
export const FEED_TANKS: readonly number[] = [FEED_TANK_1, FEED_TANK_2, FEED_TANK_3, FEED_TANK_4];

/**
 * The fuel density of the gallon thresholds of CpiomF/LegacyFuel (its 6 436 gal for 43 100 lb, 6 857 gal for 45 950 lb):
 * 6.7 lb/gal
 */
export const LEGACY_THRESHOLD_POUNDS_PER_GALLON = 6.7;

/**
 * The thresholds of the main transfers from the inner and mid tanks to the feed tanks, in gallons (the fuel triggers of
 * CpiomF/LegacyFuel compare the MSFS tank quantities in gallons). A transfer to a feed tank starts below its start
 * threshold and stops at its stop threshold, the start threshold + 2 200 lb.
 */
export interface MainTransferThresholds {
  /** FEED TK 1 and 4: start of the transfer */
  readonly outerFeedTanksStartGal: number;
  /** FEED TK 1 and 4: end of the transfer (start + 2 200 lb) */
  readonly outerFeedTanksStopGal: number;
  /** FEED TK 2 and 3: start of the transfer */
  readonly innerFeedTanksStartGal: number;
  /** FEED TK 2 and 3: end of the transfer (start + 2 200 lb) */
  readonly innerFeedTanksStopGal: number;
}

/**
 * The normal thresholds (A380 FCOM DSC-28-30 MAIN TRANSFERS, a380_fcom.txt l.59243-59247: "between the transfer
 * threshold and the transfer threshold + 2 200 lb", 43 100 lb for feed tanks 1 and 4, 45 950 lb for feed tanks 2 and 3),
 * the gallon values that CpiomF/LegacyFuel always used.
 */
export const NORMAL_MAIN_TRANSFER_THRESHOLDS: MainTransferThresholds = {
  outerFeedTanksStartGal: 6436,
  outerFeedTanksStopGal: 6764,
  innerFeedTanksStartGal: 6857,
  innerFeedTanksStopGal: 7186,
};

/** A weight in pounds as gallons of the thresholds (LEGACY_THRESHOLD_POUNDS_PER_GALLON), rounded to the gallon */
function thresholdGallons(pounds: number): number {
  return Math.round(pounds / LEGACY_THRESHOLD_POUNDS_PER_GALLON);
}

/**
 * The reduced thresholds when the remaining time to destination is less than 90 min (l.59249-59255): 36 500 lb for feed
 * tanks 1 and 4, 39 350 lb for feed tanks 2 and 3, "to be sure that the feed tanks will not be full at landing".
 */
export const REDUCED_MAIN_TRANSFER_THRESHOLDS: MainTransferThresholds = {
  outerFeedTanksStartGal: thresholdGallons(36_500),
  outerFeedTanksStopGal: thresholdGallons(36_500 + 2_200),
  innerFeedTanksStartGal: thresholdGallons(39_350),
  innerFeedTanksStopGal: thresholdGallons(39_350 + 2_200),
};

/** The remaining time to destination below which the main transfer thresholds are reduced, in minutes (l.59249) */
export const REDUCED_THRESHOLDS_RTD_MIN = 90;

/**
 * The main transfer thresholds for a remaining time to destination (RTD). Without an RTD from the FMS (no flight plan,
 * no prediction), the normal thresholds.
 * @param remainingTimeToDestinationMin the RTD in minutes, null when the FMS sends none
 */
export function mainTransferThresholds(remainingTimeToDestinationMin: number | null): MainTransferThresholds {
  return remainingTimeToDestinationMin !== null && remainingTimeToDestinationMin < REDUCED_THRESHOLDS_RTD_MIN
    ? REDUCED_MAIN_TRANSFER_THRESHOLDS
    : NORMAL_MAIN_TRANSFER_THRESHOLDS;
}

/** The FMS 1 and FMS 2 remaining flight time words (ARINC 429 BNR, seconds; FmcAircraftInterface REMAINING_FLIGHT_TIME) */
export const FM_REMAINING_FLIGHT_TIME_VARS: readonly string[] = [
  'L:A32NX_FM1_REMAINING_FLIGHT_TIME',
  'L:A32NX_FM2_REMAINING_FLIGHT_TIME',
];

/**
 * The remaining time to destination (RTD) from the FMS remaining flight time words: the first one in normal operation
 * (the FMS sends no computed data without a destination prediction).
 * @param rawWords the raw ARINC 429 words of FM_REMAINING_FLIGHT_TIME_VARS
 * @returns the RTD in minutes, or null when no FMS sends one
 */
export function remainingTimeToDestinationMin(rawWords: readonly number[]): number | null {
  for (const raw of rawWords) {
    const word = new Arinc429Word(raw);
    if (word.isNormalOperation()) {
      return word.value / 60;
    }
  }
  return null;
}

/** A tank holding at least its capacity less this, in gallons, is full (design choice: MSFS rounding) */
export const TANK_FULL_MARGIN_GAL = 0.5;

/** A tank holding less than this, in gallons, is empty (as CpiomF/LegacyFuel's empty triggers) */
export const TANK_EMPTY_GAL = 0.1;

/** The fuel and the capacity of the MSFS tanks, in gallons, by Tank.N */
export interface TankLevels {
  quantityGal: Map<number, number>;
  capacityGal: Map<number, number>;
}

/** A fuel move between two MSFS tanks, in gallons */
export interface FuelMove {
  from: number;
  to: number;
  gallons: number;
}

/** Whether a tank is full */
export function isTankFull(levels: TankLevels, tank: number): boolean {
  return (levels.quantityGal.get(tank) ?? 0) >= (levels.capacityGal.get(tank) ?? 0) - TANK_FULL_MARGIN_GAL;
}

/** Whether a tank is empty */
export function isTankEmpty(levels: TankLevels, tank: number): boolean {
  return (levels.quantityGal.get(tank) ?? 0) < TANK_EMPTY_GAL;
}

function roomGal(levels: TankLevels, tank: number): number {
  return Math.max(0, (levels.capacityGal.get(tank) ?? 0) - (levels.quantityGal.get(tank) ?? 0));
}

/**
 * Moves fuel out of a tank into groups of tanks, in order: into the first group that has room, the rest into the next one
 * ("to the feed tanks, or mid tanks, if the feed tanks are full, or inner tanks, if the feed tanks and mid tanks are full",
 * a380_fcom.txt l.59487-59491). Inside a group, the tank that holds the least fuel is filled first, then the tanks share
 * the fuel equally once balanced (design choice, as the CG transfers fill "the tank that contains less fuel" first,
 * l.59598-59601). The levels are updated, so that the next move sees them.
 * @param levels the tank levels, updated
 * @param from the tank the fuel leaves
 * @param toGroups the receiving tank groups, in order of priority
 * @param gallons the fuel to move, at most
 * @returns the moves made
 */
export function moveFuel(
  levels: TankLevels,
  from: number,
  toGroups: readonly (readonly number[])[],
  gallons: number,
): FuelMove[] {
  const moves: FuelMove[] = [];
  let left = Math.min(gallons, levels.quantityGal.get(from) ?? 0);
  for (const group of toGroups) {
    while (left > 1e-9) {
      const receiving = group.filter((tank) => tank !== from && roomGal(levels, tank) > 1e-9);
      if (receiving.length === 0) {
        break;
      }
      // Fill the emptiest tanks of the group up to the next tank level (or share it among them once balanced)
      const lowest = Math.min(...receiving.map((tank) => levels.quantityGal.get(tank) ?? 0));
      const atLowest = receiving.filter((tank) => (levels.quantityGal.get(tank) ?? 0) <= lowest + 1e-9);
      const above = receiving.filter((tank) => (levels.quantityGal.get(tank) ?? 0) > lowest + 1e-9);
      const nextLevel =
        above.length > 0 ? Math.min(...above.map((tank) => levels.quantityGal.get(tank) ?? 0)) : Infinity;
      const perTank = Math.min(
        left / atLowest.length,
        nextLevel - lowest,
        ...atLowest.map((tank) => roomGal(levels, tank)),
      );
      for (const tank of atLowest) {
        levels.quantityGal.set(tank, (levels.quantityGal.get(tank) ?? 0) + perTank);
        levels.quantityGal.set(from, (levels.quantityGal.get(from) ?? 0) - perTank);
        moves.push({ from, to: tank, gallons: perTank });
      }
      left -= perTank * atLowest.length;
    }
  }
  return moves;
}
