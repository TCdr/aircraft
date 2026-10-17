// Copyright (c) 2026 FlyByWire Simulations
// SPDX-License-Identifier: GPL-3.0

import {
  FuelMove,
  isTankEmpty,
  isTankFull,
  LEFT_INNER_TANK,
  LEFT_MID_TANK,
  moveFuel,
  RIGHT_INNER_TANK,
  RIGHT_MID_TANK,
  TankLevels,
  TRIM_TANK,
} from './FuelTransferSchedule';

/** The AUTO GND XFR pb-sw: 1 pressed (ON), 0 released */
export const AUTO_GND_XFR_PB_IS_ON_VAR = 'L:A380X_OVHD_FUEL_AUTO_GND_XFR_PB_IS_ON';
/** The light of the AUTO GND XFR pb-sw: on while selected, flashing when the FQMS aborts */
export const AUTO_GND_XFR_PB_LIGHT_VAR = 'L:A380X_OVHD_FUEL_AUTO_GND_XFR_PB_LIGHT_ON';
/** The automatic ground transfer is in progress (GND XFR IN PROGRESS memo) */
export const AUTO_GND_XFR_IN_PROGRESS_VAR = 'L:A380X_FUEL_AUTO_GND_XFR_IN_PROGRESS';
/** The automatic ground transfer has completed (FUEL AUTO GND XFR COMPLETED) */
export const AUTO_GND_XFR_COMPLETED_VAR = 'L:A380X_FUEL_AUTO_GND_XFR_COMPLETED';
/** The FQMS aborted the automatic ground transfer, or it could not start (FUEL AUTO GND XFR FAULT) */
export const AUTO_GND_XFR_FAULT_VAR = 'L:A380X_FUEL_AUTO_GND_XFR_FAULT';

/** The ground CG target, % MAC */
export const GROUND_CG_TARGET_PERCENT = 39.5;

/**
 * The transfer rate of the trim tank pumps, in pounds per hour. Design choice: the aircraft has no published rate for
 * the ground transfer, which completes in less than 25 min: the rate of the trim tank transfers in flight.
 */
export const GROUND_TRANSFER_RATE_LB_PER_H = 44_100;

/** The flashing period of the pb-sw light when the FQMS aborts the ground transfer, in seconds (design choice) */
const AUTO_GND_XFR_FAULT_FLASH_PERIOD_S = 1;

export enum GroundTransferState {
  /** AUTO GND XFR pb-sw released */
  Off,
  /** Fuel moves to obtain the ground CG target */
  InProgress,
  /** The ground CG target is reached, or no more fuel can move: FUEL AUTO GND XFR COMPLETED until the pb-sw is released */
  Completed,
  /** The transfer could not start or was aborted: FUEL AUTO GND XFR FAULT until the pb-sw is released */
  Fault,
}

/** The direction of a ground transfer */
export enum GroundTransferDirection {
  /** CG aft of the target: from the trim tank to a pair of wing tanks */
  FromTrimTank,
  /** CG forward of the target: from a pair of wing tanks to the trim tank */
  ToTrimTank,
}

export interface GroundTransferInputs {
  /** The AUTO GND XFR pb-sw is pressed */
  readonly pbOn: boolean;
  readonly onGround: boolean;
  /** The number of engines running */
  readonly enginesRunning: number;
  /** All the transfer pump pb-sws are ON */
  readonly allTransferPumpsOn: boolean;
  /**
   * The gross weight CG computed by the FQMS, in % MAC, null when it computes none: without the ZFW and ZFCG entered in
   * the FMS no automatic ground transfer is possible
   */
  readonly cgPercent: number | null;
  /** A refuel, a jettison or a manual transfer is in progress */
  readonly otherTransferInProgress: boolean;
  /** Fuel can still move in the direction of the transfer (CpiomF/FuelGroundTransfer groundTransferCanMove) */
  readonly fuelCanMove: (direction: GroundTransferDirection) => boolean;
}

/**
 * The automatic ground transfer of the FQMS:
 * - The flight crew starts and stops it with the AUTO GND XFR pb-sw. It moves fuel to reach the ground CG target
 *   (+/- 1 %) from the ZFW / ZFCG entered in the FMS, when the current ZFW, ZFCG and FOB allow it: the fuel moves until
 *   the CG reaches 39.5 %, or until no more fuel can move that way (design choice: then the transfer has completed
 *   too).
 * - It needs all the transfer pumps on and stops as soon as two engines run. FUEL AUTO GND XFR FAULT: the transfer
 *   cannot start or complete, or two engines started before its end; the pb-sw light then flashes.
 *   Design choice: a refuel, a jettison or a manual transfer in progress, or the aircraft in flight, abort it too.
 * - FUEL AUTO GND XFR COMPLETED (AUTO GND XFR ... OFF): the result stays until the pb-sw is released.
 */
export class GroundTransferLogic {
  private state = GroundTransferState.Off;

  private direction = GroundTransferDirection.FromTrimTank;

  public getState(): GroundTransferState {
    return this.state;
  }

  public getDirection(): GroundTransferDirection {
    return this.direction;
  }

  public update(inputs: GroundTransferInputs): GroundTransferState {
    if (!inputs.pbOn) {
      this.state = GroundTransferState.Off;
      return this.state;
    }
    if (this.state === GroundTransferState.Completed || this.state === GroundTransferState.Fault) {
      return this.state;
    }

    const possible =
      inputs.onGround && inputs.enginesRunning < 2 && inputs.allTransferPumpsOn && !inputs.otherTransferInProgress;
    if (!possible || inputs.cgPercent === null) {
      this.state = GroundTransferState.Fault;
      return this.state;
    }

    if (this.state === GroundTransferState.Off) {
      this.direction =
        inputs.cgPercent > GROUND_CG_TARGET_PERCENT
          ? GroundTransferDirection.FromTrimTank
          : GroundTransferDirection.ToTrimTank;
      this.state = GroundTransferState.InProgress;
    }

    const targetReached =
      this.direction === GroundTransferDirection.FromTrimTank
        ? inputs.cgPercent <= GROUND_CG_TARGET_PERCENT
        : inputs.cgPercent >= GROUND_CG_TARGET_PERCENT;
    if (targetReached || !inputs.fuelCanMove(this.direction)) {
      this.state = GroundTransferState.Completed;
    }
    return this.state;
  }
}

/** The pairs of symmetric wing tanks of the ground transfer, in order: inner tanks, then mid tanks (design choice) */
const WING_TANK_PAIRS: readonly (readonly [number, number])[] = [
  [LEFT_INNER_TANK, RIGHT_INNER_TANK],
  [LEFT_MID_TANK, RIGHT_MID_TANK],
];

/**
 * Whether fuel can still move in a direction: out of the trim tank into a pair of wing tanks with room, or out of a
 * pair of wing tanks with fuel into the trim tank with room
 */
export function groundTransferCanMove(levels: TankLevels, direction: GroundTransferDirection): boolean {
  if (direction === GroundTransferDirection.FromTrimTank) {
    return (
      !isTankEmpty(levels, TRIM_TANK) && WING_TANK_PAIRS.some((pair) => pair.some((tank) => !isTankFull(levels, tank)))
    );
  }
  return (
    !isTankFull(levels, TRIM_TANK) && WING_TANK_PAIRS.some((pair) => pair.some((tank) => !isTankEmpty(levels, tank)))
  );
}

/**
 * The fuel moves of the ground transfer over one update. Fuel moves between the trim tank and a pair of symmetric
 * tanks, which keeps the lateral balance and corrects an imbalance present at the start: into the pair, the lighter
 * tank is filled first; out of the pair, the heavier tank is emptied first. The MSFS fuel system has no
 * line into the trim tank from the wing tanks, so the fuel moves between the MSFS tanks directly (as
 * CpiomF/FuelJettison removes the jettisoned fuel).
 * @param direction the direction of the transfer
 * @param levels the tank levels, updated with the moves
 * @param poundsPerGallon the fuel density
 * @param deltaTimeS the time of the update, in seconds
 */
export function groundTransferMoves(
  direction: GroundTransferDirection,
  levels: TankLevels,
  poundsPerGallon: number,
  deltaTimeS: number,
): FuelMove[] {
  const gallons = (GROUND_TRANSFER_RATE_LB_PER_H * deltaTimeS) / 3600 / poundsPerGallon;
  if (direction === GroundTransferDirection.FromTrimTank) {
    return moveFuel(levels, TRIM_TANK, WING_TANK_PAIRS, gallons);
  }

  const moves: FuelMove[] = [];
  let left = gallons;
  for (const pair of WING_TANK_PAIRS) {
    while (left > 1e-9 && !isTankFull(levels, TRIM_TANK)) {
      const withFuel = pair.filter((tank) => !isTankEmpty(levels, tank));
      if (withFuel.length === 0) {
        break;
      }
      // Empty the heavier tank first, down to the other one, then both together
      const highest = Math.max(...withFuel.map((tank) => levels.quantityGal.get(tank) ?? 0));
      const atHighest = withFuel.filter((tank) => (levels.quantityGal.get(tank) ?? 0) >= highest - 1e-9);
      const below = withFuel.filter((tank) => (levels.quantityGal.get(tank) ?? 0) < highest - 1e-9);
      const nextLevel = below.length > 0 ? Math.max(...below.map((tank) => levels.quantityGal.get(tank) ?? 0)) : 0;
      const trimRoom = (levels.capacityGal.get(TRIM_TANK) ?? 0) - (levels.quantityGal.get(TRIM_TANK) ?? 0);
      const perTank = Math.min(left / atHighest.length, highest - nextLevel, trimRoom / atHighest.length);
      if (!(perTank > 1e-9)) {
        break;
      }
      for (const tank of atHighest) {
        moves.push(...moveFuel(levels, tank, [[TRIM_TANK]], perTank));
      }
      left -= perTank * atHighest.length;
    }
  }
  return moves;
}

/**
 * The light of the AUTO GND XFR pb-sw: on while the pb-sw is pressed (in progress or completed), flashing when the FQMS
 * aborted the transfer
 * @param state the ground transfer state
 * @param timeS a running time, in seconds, for the flashing
 */
export function isAutoGndXfrPbLightOn(state: GroundTransferState, timeS: number): boolean {
  switch (state) {
    case GroundTransferState.Off:
      return false;
    case GroundTransferState.Fault:
      return timeS % AUTO_GND_XFR_FAULT_FLASH_PERIOD_S < AUTO_GND_XFR_FAULT_FLASH_PERIOD_S / 2;
    default:
      return true;
  }
}
