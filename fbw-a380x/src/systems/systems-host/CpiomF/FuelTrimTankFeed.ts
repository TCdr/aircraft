// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import { FuelMove, LEFT_INNER_TANK, moveFuel, RIGHT_INNER_TANK, TankLevels, TRIM_TANK } from './FuelTransferSchedule';

/*
 * The TRIM TK FEED selector of the FUEL overhead panel:
 * - AUTO: the trim tank transfers are automatic.
 * - ISOL: the forward transfer from the trim tank stops; the trim tank isolation valve, the trim tank inlet valves and
 *   the trim pipe isolation valves close to isolate the transfer line.
 * - OPEN: the trim tank inlet valves, the trim pipe isolation valve of the aft gallery and the inner tank aft inlet
 *   valves open, for a gravity transfer from the trim tank to the inner tanks.
 * The cockpit model has no TRIM TK FEED selector: its L:var is set from outside the cockpit (simulation limitation).
 */

/** The TRIM TK FEED selector: 0 AUTO (its normal position, the value of the L:var at flight load), 1 OPEN, 2 ISOL */
export const TRIM_TK_FEED_SELECTOR_VAR = 'L:A380X_OVHD_FUEL_TRIM_TK_FEED_SELECTOR';

/** A gravity transfer from the trim tank to the inner tanks is in progress (TRIM TK FEED OPEN) */
export const TRIM_TK_GRAVITY_XFR_IN_PROGRESS_VAR = 'L:A380X_FUEL_TRIM_TK_GRAVITY_XFR_IN_PROGRESS';

export enum TrimTankFeedSelector {
  Auto = 0,
  Open = 1,
  Isol = 2,
}

/** The selector position of the L:var value (an unknown value is AUTO) */
export function trimTankFeedSelector(value: number): TrimTankFeedSelector {
  switch (Math.round(value)) {
    case TrimTankFeedSelector.Open:
      return TrimTankFeedSelector.Open;
    case TrimTankFeedSelector.Isol:
      return TrimTankFeedSelector.Isol;
    default:
      return TrimTankFeedSelector.Auto;
  }
}

/**
 * The gravity flow from the trim tank to the inner tanks, in gallons per hour (design choice: no documented rate; two
 * trim tank inlet valves at the 500 gal/h of the gravity lines of the MSFS fuel system, flight_model.cfg Line.142-145)
 */
export const TRIM_TANK_GRAVITY_RATE_GAL_PER_H = 1_000;

/**
 * The pitch attitude below which the fuel flows by gravity out of the trim tank, in degrees: the FUEL CG AT FWD LIMIT
 * procedure asks for a pitch below 3° for a gravity forward transfer (design choice: no flow at a higher pitch)
 */
const TRIM_TANK_GRAVITY_MAX_PITCH_DEG = 3;

/**
 * Whether the trim tank fuel flows by gravity to the inner tanks: TRIM TK FEED OPEN, the pitch attitude below 3°, fuel in
 * the trim tank and room in an inner tank.
 * @param selector the TRIM TK FEED selector
 * @param pitchDeg the pitch attitude, nose up positive, in degrees
 */
export function isTrimTankGravityTransfer(selector: TrimTankFeedSelector, pitchDeg: number): boolean {
  return selector === TrimTankFeedSelector.Open && pitchDeg < TRIM_TANK_GRAVITY_MAX_PITCH_DEG;
}

/**
 * The fuel moves of the gravity transfer over one update: out of the trim tank into the lighter inner tank first, then
 * both. The MSFS fuel system has no gravity line out of the trim tank, so the fuel moves between the MSFS tanks directly.
 */
export function trimTankGravityMoves(levels: TankLevels, deltaTimeS: number): FuelMove[] {
  return moveFuel(
    levels,
    TRIM_TANK,
    [[LEFT_INNER_TANK, RIGHT_INNER_TANK]],
    (TRIM_TANK_GRAVITY_RATE_GAL_PER_H * deltaTimeS) / 3600,
  );
}

/**
 * The MSFS fuel triggers that transfer fuel out of the trim tank (flight_model.cfg): Trigger.24-27
 * TrimTankTransferToFeedTank1-4 (main transfer from the trim tank), Trigger.28-33 the equalisations of these transfers,
 * Trigger.43 CGControlTransferStart. With TRIM TK FEED in ISOL, CpiomF/LegacyFuel does not start them and stops them.
 */
export const TRIM_TANK_TRANSFER_TRIGGERS: readonly number[] = [24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 43];

/** The MSFS trim tank pumps, Pump.19 TrimTankPumpLeft and Pump.20 TrimTankPumpRight */
export const TRIM_TANK_PUMPS: readonly number[] = [19, 20];

/**
 * The MSFS valves of the trim line that ISOL closes: Valve.43 and 59 TrimTankInletValve1 / 2, Valve.44 and 45
 * TrimLineIsolationValveFwd / Aft (the trim tank isolation valve and the trim pipe isolation valves)
 */
export const TRIM_LINE_VALVES: readonly number[] = [43, 44, 45, 59];

/** Commands the MSFS fuel system for the isolation of the trim tank */
export interface TrimTankIsolationFuelSystem {
  isTriggerActive(trigger: number): boolean;
  setTriggerOff(trigger: number): void;
  isPumpOn(pump: number): boolean;
  setPump(pump: number, on: boolean): void;
  isValveOpen(valve: number): boolean;
  setValve(valve: number, open: boolean): void;
}

/**
 * TRIM TK FEED ISOL: the trim tank transfer triggers are switched off, the trim tank pumps stopped and the trim line
 * valves closed. Only what differs is commanded.
 * @returns whether anything was commanded
 */
export function isolateTrimTank(fuelSystem: TrimTankIsolationFuelSystem): boolean {
  let commanded = false;
  for (const trigger of TRIM_TANK_TRANSFER_TRIGGERS) {
    if (fuelSystem.isTriggerActive(trigger)) {
      fuelSystem.setTriggerOff(trigger);
      commanded = true;
    }
  }
  for (const pump of TRIM_TANK_PUMPS) {
    if (fuelSystem.isPumpOn(pump)) {
      fuelSystem.setPump(pump, false);
      commanded = true;
    }
  }
  for (const valve of TRIM_LINE_VALVES) {
    if (fuelSystem.isValveOpen(valve)) {
      fuelSystem.setValve(valve, false);
      commanded = true;
    }
  }
  return commanded;
}
